import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=3.0';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import Variable from 'resource:///com/github/Aylur/ags/variable.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';
import CONFIG from '../config.js';
import { showTransient } from '../state.js';

// Ringkasan untuk halaman notify di notch.
export const current = Variable({ app: '', summary: '', body: '' });

// Data lengkap untuk popup kanan atas: { app, icon, summary, body, actions, id }.
// `actions` = pasangan [key, label, ...] dari argumen Notify.
export const latest = Variable(null);

let capturing = false;
let fields = [];
let actions = [];
let inActions = false;
let sawActions = false;
let callSerial = 0;
let awaitingId = false;
let started = false;

const decode = (text) => text
    .replace(/\\"/g, '"')
    .replace(/\\n/g, ' ')
    .replace(/\\t/g, ' ')
    .replace(/\\\\/g, '\\');

const describe = () => {
    const { summary, body } = current.value;
    return [summary, body].filter(Boolean).join(' · ') || '(notifikasi)';
};

let seq = 0;

// id datang belakangan (method return). seq dipakai popup untuk mengenali
// notifikasi yang sama, supaya update id tidak memicu popup tampil ulang.
const latestWithId = (id) => {
    const item = latest.value;
    if (!item || item.id) return;
    latest.value = { ...item, id };
};

// Argumen Notify dari dbus-monitor (setelah baris `member=Notify`):
//   string <app>   uint32 <replaces_id>   string <icon>
//   string <summary>   string <body>   array [ string <key> string <label> ... ]
//   dictionary [ ... ]   int32 <expire>
// String sebelum array = header; string di dalam array pertama = actions;
// string sesudahnya (hints) diabaikan. Serial dipakai untuk mencocokkan
// method return yang membawa id notifikasi.
const flush = () => {
    if (!capturing) return;
    capturing = false;
    const captured = fields;
    const acts = actions;
    fields = [];
    actions = [];
    inActions = false;
    sawActions = false;
    if (captured.length < 3) return;
    const [app, icon, summary, body = ''] = captured;
    if (!summary && !body) return;

    current.value = { app, summary, body };
    showTransient('notify', CONFIG.notifyTimeout);
    latest.value = { app, icon, summary, body, actions: acts, id: 0, seq: ++seq };
};

const parseLine = (line) => {
    if (line.includes('member=Notify')) {
        // serial ada SETELAH '->' (method call: time=... sender=:1.x ->
        // destination=:1.y serial=N path=...), jadi dibaca dari seluruh baris
        const serial = /serial=(\d+)/.exec(line);
        capturing = true;
        fields = [];
        actions = [];
        inActions = false;
        sawActions = false;
        callSerial = serial ? Number(serial[1]) : 0;
        awaitingId = false;
        return;
    }
    if (line.includes('method return')) {
        const reply = /reply_serial=(\d+)/.exec(line);
        awaitingId = !!reply && callSerial > 0 && Number(reply[1]) === callSerial;
        callSerial = 0;
        return;
    }
    if (awaitingId) {
        const id = /^uint32 (\d+)$/.exec(line);
        if (id) {
            awaitingId = false;
            latestWithId(Number(id[1]));
        }
        return;
    }
    if (!capturing) return;

    if (line.startsWith('array [')) {
        if (!sawActions) {
            inActions = true;
            sawActions = true;
        }
        return;
    }
    if (line.startsWith(']')) {
        if (inActions) {
            inActions = false;
            // actions selesai -> app/icon/summary/body/actions sudah lengkap.
            // Hints (dictionary) sesudahnya tidak dibutuhkan.
            flush();
        }
        return;
    }
    // expire_time menutup argumen Notify; jaring pengaman kalau array actions
    // tidak terbaca (mis. format monitor berubah).
    if (/^int32 -?\d+$/.test(line)) {
        flush();
        return;
    }
    const match = /^string "(.*)"$/.exec(line);
    if (!match) return;
    const value = decode(match[1]);
    if (inActions) actions.push(value);
    else if (!sawActions) fields.push(value);
};

// Panggil action notifikasi (mis. "default" untuk membuka aplikasi sumber).
// ActionInvoked adalah sinyal dari server; aplikasi mendengarkannya, jadi
// mengirim sinyal ini membuat aplikasi melakukan aksinya (WhatsApp membuka
// chat, dsb) tanpa perlu menyentuh daemon.
export function invokeAction(id, key) {
    if (!id || !key) return;
    Utils.execAsync([
        'gdbus', 'emit', '--session',
        '--object-path', '/org/freedesktop/Notifications',
        '--signal', 'org.freedesktop.Notifications.ActionInvoked',
        String(id), key,
    ]).catch(error => console.error(`[dyn-island] ActionInvoked gagal: ${error}`));
}

// Tutup notifikasi di daemon (swaync) supaya ikut hilang dari control center.
export function closeNotification(id) {
    if (!id) return;
    Utils.execAsync([
        'gdbus', 'call', '--session',
        '--dest', 'org.freedesktop.Notifications',
        '--object-path', '/org/freedesktop/Notifications',
        '--method', 'org.freedesktop.Notifications.CloseNotification',
        String(id),
    ]).catch(() => { });
}

// Monitors: kita bukan pemegang nama org.freedesktop.Notifications (swaync),
// jadi Notify disadap dari bus. Dua rule: seluruh interface notifikasi, DAN
// type=method_return — method return tidak punya field interface/member,
// jadi tanpa rule kedua id notifikasi tidak pernah terlihat (terukur: id=0).
const MONITOR_ARGS = [
    'dbus-monitor', '--session',
    'interface=org.freedesktop.Notifications',
    'type=method_return',
];

let proc = null;
let reader = null;
let restartTimer = 0;

function readNext() {
    if (!reader) return;
    reader.read_line_async(GLib.PRIORITY_DEFAULT, null, (source, result) => {
        let line = null;
        try {
            const [bytes] = source.read_line_finish(result);
            if (bytes) line = new TextDecoder().decode(bytes).trim();
        } catch (_) {
            line = null;
        }
        if (line === null) return;
        parseLine(line);
        readNext();
    });
}

function spawnMonitor() {
    capturing = false;
    fields = [];
    actions = [];
    inActions = false;
    sawActions = false;

    // Bersihkan sisa dbus-monitor dari sesi AGS sebelumnya (child tidak ikut
    // mati saat AGS keluar -> mirror notifikasi bisa dobel).
    try {
        Gio.Subprocess.new(
            ['pkill', '-f', MONITOR_ARGS.join(' ')],
            Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE,
        ).wait(null);
    } catch (_) { }

    try {
        const child = Gio.Subprocess.new(
            MONITOR_ARGS,
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE,
        );
        proc = child;
        reader = new Gio.DataInputStream({ base_stream: child.get_stdout_pipe() });
        readNext();
        child.wait_async(null, (_p, result) => {
            try {
                child.wait_finish(result);
            } catch (_) { }
            if (proc === child) {
                proc = null;
                reader = null;
            }
            console.log('[dyn-island] dbus-monitor berhenti, restart 3s');
            if (!restartTimer) {
                restartTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 3000, () => {
                    restartTimer = 0;
                    spawnMonitor();
                    return GLib.SOURCE_REMOVE;
                });
            }
        });
    } catch (error) {
        console.error(`[dyn-island] gagal jalankan dbus-monitor: ${error}`);
    }
}

export function watchNotifications() {
    if (started) return;
    started = true;
    spawnMonitor();
}

export default () => {
    const text = Widget.Label({
        className: 'dyn-island-notif-text',
        xalign: 0,
        truncate: 'end',
        maxWidthChars: CONFIG.notifyMaxChars,
    });

    return Widget.Box({
        className: 'dyn-island-notify',
        spacing: 8,
        halign: Gtk.Align.CENTER,
        children: [
            Widget.Label({ className: 'dyn-island-notif-icon', label: '\uf0f3' }),
            text,
        ],
        setup: self => {
            const update = () => { text.label = describe(); };
            update();
            self.hook(current, update);
        },
    });
};
