import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=3.0';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import Variable from 'resource:///com/github/Aylur/ags/variable.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';
import Hyprland from 'resource:///com/github/Aylur/ags/service/hyprland.js';
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
let replacesId = 0;
// Hints: desktop-entry adalah identitas aplikasi paling andal (dipakai untuk
// mengenali provider seperti WhatsApp/Telegram/Discord).
let inHints = false;
let hintKey = '';
let desktopEntry = '';
// dbus-monitor mencetak isi string APA ADANYA: newline dari aplikasi menjadi
// baris baru di output (tidak di-escape). Notifikasi web Chromium berbentuk
// "<origin>\n\n<body>", jadi body-nya selalu multi-baris. Dulu regex
// per-baris gagal menangkapnya -> body hilang dan popup hanya menampilkan
// judul + fallback "Pesan baru". pendingString mengumpulkan baris lanjutan
// sampai tanda kutip penutup.
let pendingString = null;
// body terakhir per id notifikasi: update dari Chrome/WhatsApp Web kadang
// datang dengan body kosong (mis. hanya mengubah judul); jangan sampai
// menimpa body yang sudah tampil dengan kosong.
const lastBodyById = new Map();
let started = false;

const BROWSER = /brave|chrome|chromium|firefox/i;

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

// Provider dikenal lewat app_name + hints.desktop-entry. Glyph Nerd Font
// (brand): WhatsApp, Telegram, Discord. Selain ini popup memakai lonceng.

// Chromium mengirim ikon situs sebagai file sementara (mis.
// file:///tmp/org.chromium.Chromium.scoped_dir.X/logo.png) dan menghapusnya
// setelah notifikasi ditangani. Salin isinya ke cache agar popup bisa
// menampilkan ikon provider (WhatsApp/Telegram/Discord di Brave, dll).
const ICON_DIR = '/tmp/dyn-island-icons';

const cacheIcon = (icon) => {
    if (!icon) return '';
    let path = String(icon);
    if (path.startsWith('file://')) {
        try { path = decodeURIComponent(path.slice(7)); } catch (e) { path = path.slice(7); }
    }
    if (!path.startsWith('/')) return '';
    try {
        const [ok, bytes] = GLib.file_get_contents(path);
        if (!ok || !bytes || bytes.length === 0) return '';
        GLib.mkdir_with_parents(ICON_DIR, 0o755);
        const sum = GLib.compute_checksum_for_data(GLib.ChecksumType.MD5, bytes);
        const out = `${ICON_DIR}/${sum}.png`;
        if (!GLib.file_test(out, GLib.FileTest.EXISTS)) {
            GLib.file_set_contents(out, bytes);
        }
        return out;
    } catch (e) {
        return '';
    }
};

const PROVIDERS = [
    { id: 'whatsapp', re: /whatsapp|wa\.me/i, glyph: '\uf232' },
    { id: 'telegram', re: /telegram/i, glyph: '\uf2c6' },
    { id: 'discord', re: /discord/i, glyph: '\uf1ff' },
];

// Notifikasi web di browser datang sebagai app="Brave" dengan ikon Brave —
// tidak ada info situs di payload. Judul tab browser (mis. "… | WhatsApp")
// dipakai sebagai petunjuk, hanya untuk aplikasi browser.
const browserWindowTitles = () => {
    try {
        return (Hyprland.clients ?? [])
            .slice()
            .sort((a, b) => (a.focusHistoryID ?? 99) - (b.focusHistoryID ?? 99))
            .slice(0, 6)
            .map(c => c.title || '')
            .join(' ');
    } catch (e) {
        return '';
    }
};

const detectProvider = (haystack) => {
    const s = String(haystack || '').toLowerCase();
    const hit = PROVIDERS.find(p => p.re.test(s));
    return hit ? { id: hit.id, glyph: hit.glyph } : null;
};

// id datang belakangan (method return). seq dipakai popup untuk mengenali
// notifikasi yang sama, supaya update id tidak memicu popup tampil ulang.
const latestWithId = (id) => {
    const item = latest.value;
    if (!item || item.id) return;
    latest.value = { ...item, id };
    if (item.body) lastBodyById.set(id, item.body);
    if (lastBodyById.size > 30) lastBodyById.delete(lastBodyById.keys().next().value);
};

// Chromium menambahkan "<origin>\n\n" di depan body notifikasi web, mis.
// "web.whatsapp.com\n\nHalo, apa kabar". Origin itu dibuang supaya popup
// hanya menampilkan isi pesannya.
const isOrigin = head =>
    /^(?:[a-z][a-z0-9+.-]*:\/\/)?(?:localhost|[^\s/]+\.[^\s/]+)(?::\d+)?$/i.test(head);

const cleanBody = (app, body) => {
    let text = String(body ?? '');
    if (BROWSER.test(String(app || ''))) {
        const split = text.indexOf('\n\n');
        if (split >= 0 && isOrigin(text.slice(0, split).trim()))
            text = text.slice(split + 2);
    }
    // satu baris untuk kartu popup & halaman notify (label tidak wrap)
    return text.replace(/\r/g, '').replace(/\s+/g, ' ').trim();
};

// Chromium menyertakan action "settings" ("Settings") di setiap web
// notification; itu membuka setelan notifikasi browser, bukan aksi pesan.
// Chip-nya hanya memakan lebar kartu 340px.
const dropBrowserSettings = (list) => {
    const kept = [];
    for (let i = 0; i + 1 < list.length; i += 2) {
        if (list[i] === 'settings') continue;
        kept.push(list[i], list[i + 1]);
    }
    return kept;
};

// Ambil satu nilai string hasil parsing (header, actions, atau key hints).
const takeString = (value) => {
    if (inHints) {
        hintKey = value;
        return;
    }
    if (inActions) actions.push(value);
    else if (!sawActions) fields.push(value);
};

// `rest` = isi setelah `string "`. Kalau tanda kutip penutup belum ada di
// baris ini, string berlanjut ke baris-baris berikutnya.
const startString = (rest) => {
    if (rest.endsWith('"')) takeString(decode(rest.slice(0, -1)));
    else pendingString = { parts: [rest] };
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
    pendingString = null;
    if (captured.length < 3) return;
    const [app, icon, summary, body = ''] = captured;
    const isBrowser = BROWSER.test(String(app || ''));
    const hint = isBrowser ? browserWindowTitles() : '';
    const provider = detectProvider(`${app} ${desktopEntry} ${hint}`);
    const iconLocal = cacheIcon(icon);
    if (!summary && !body) return;
    // update tanpa body: pertahankan body yang sudah tercatat untuk id yang
    // digantikan, selama pengirim/judulnya sama
    let text = body;
    if (!text && replacesId && lastBodyById.has(replacesId))
        text = lastBodyById.get(replacesId);
    // Body yang benar-benar kosong (bukan gagal parse) tetap diberi keterangan
    // netral supaya kartu tidak terlihat rusak.
    const bodyMissing = !text;
    if (bodyMissing) text = 'Pesan baru';
    else text = cleanBody(app, text);

    // Diagnostik: satu baris per notifikasi. `body` = mentah (newline
    // di-escape oleh JSON.stringify), `shown` = yang dipakai popup.
    console.log(`[dyn-island] notif app=${JSON.stringify(app)} icon=${JSON.stringify(icon)}`
        + ` summary=${JSON.stringify(summary)} body=${JSON.stringify(body)}`
        + ` shown=${JSON.stringify(text)} replaces=${replacesId} bodyMissing=${bodyMissing}`
        + ` desktopEntry=${JSON.stringify(desktopEntry)} provider=${provider ? provider.id : '-'}`
        + ` iconLocal=${JSON.stringify(iconLocal)}`
        + (hint ? ` webHint=${JSON.stringify(hint.slice(0, 60))}` : ''));

    const shownActions = isBrowser ? dropBrowserSettings(acts) : acts;
    current.value = { app, summary, body: text, provider };
    showTransient('notify', CONFIG.notifyTimeout);
    latest.value = { app, icon, iconLocal, summary, body: text, actions: shownActions, provider, id: 0, seq: ++seq };
};

const parseLine = (line) => {
    if (line.includes('member=Notify')) {
        // jaring pengaman: payload sebelumnya yang tidak ditutup int32
        flush();
        inHints = false;
        hintKey = '';
        desktopEntry = '';
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
        replacesId = 0;
        pendingString = null;
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

    // baris lanjutan string multi-baris (newline tidak di-escape oleh
    // dbus-monitor). Nilai selesai saat baris ditutup tanda kutip.
    if (pendingString) {
        pendingString.parts.push(line);
        if (line.endsWith('"')) {
            const value = pendingString.parts.join('\n').slice(0, -1);
            pendingString = null;
            takeString(decode(value));
        }
        return;
    }

    // uint32 pertama = replaces_id (argumen kedua Notify)
    if (!sawActions && replacesId === 0) {
        const rid = /^uint32 (\d+)$/.exec(line);
        if (rid) {
            replacesId = Number(rid[1]);
            return;
        }
    }

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
            // Hints (dictionary) menyusul dan memuat desktop-entry; flush
            // dilakukan saat expire_time (int32) sesudahnya.
            inHints = true;
        }
        return;
    }
    // expire_time menutup argumen Notify; jaring pengaman kalau array actions
    // tidak terbaca (mis. format monitor berubah).
    if (/^int32 -?\d+$/.test(line)) {
        flush();
        return;
    }
    if (inHints) {
        const vm = /^variant\s+string "(.*)"$/.exec(line);
        if (vm) {
            if (hintKey === 'desktop-entry') desktopEntry = decode(vm[1]);
            hintKey = '';
            return;
        }
        if (line.startsWith('variant')) {
            hintKey = '';           // nilai non-string (byte/int/boolean)
            return;
        }
        // `string "..."` di dalam dictionary = KEY hint; jatuh ke penanganan
        // string di bawah supaya takeString() menyimpannya sebagai hintKey.
    }
    const match = /^string "(.*)$/.exec(line);
    if (!match) return;
    startString(match[1]);
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
