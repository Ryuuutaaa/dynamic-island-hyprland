import Gdk from 'gi://Gdk?version=3.0';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=3.0';
import App from 'resource:///com/github/Aylur/ags/app.js';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';
import { applyFocused } from './monitor.js';
import { eventKeyval } from './pointer.js';
import { maskSecret } from './secret-file.js';
import { calendar, validateFeedUrl } from './calendar.js';

// Window pengaturan feed kalender. Sumber: URL ICS privat Google Calendar
// (atau file .ics lokal). URL divalidasi dengan mengambil isinya dan
// memastikan ada BEGIN:VCALENDAR, jadi URL salah tidak disimpan diam-diam.

const NAME = 'dyn-island-calendar-setup';
const TOP_MARGIN = 64;
const CARD_W = 540;

const STEPS = [
    '1. Buka calendar.google.com di browser',
    '2. Klik ⚙ Settings → pilih kalender di kiri',
    '3. Gulir ke "Secret address in iCal format"',
    '4. Salin URL-nya, tempel di kolom atas',
];

export default ({ configDir, readUrl, saveUrl, clearUrl, refreshCalendar }) => {
    let busy = false;
    let focusTimers = [];

    // ── status ────────────────────────────────────────────────────
    const statusIcon = Widget.Label({ className: 'cal-setup-status-icon' });
    const statusText = Widget.Label({ className: 'cal-setup-status-text', xalign: 0 });
    const detailText = Widget.Label({
        className: 'cal-setup-detail',
        xalign: 0,
        wrap: true,
        maxWidthChars: 56,
    });

    const statusBox = Widget.Box({
        className: 'cal-setup-status',
        spacing: 10,
        children: [statusIcon, Widget.Box({
            vertical: true,
            spacing: 2,
            hexpand: true,
            children: [statusText, detailText],
        })],
    });

    // ── input ─────────────────────────────────────────────────────
    const entry = Widget.Entry({
        className: 'cal-setup-entry',
        placeholderText: 'https://calendar.google.com/calendar/ical/…/basic.ics',
        hexpand: true,
    });

    const pasteBtn = Widget.Button({
        className: 'cal-setup-chip',
        tooltipText: 'Tempel isi clipboard',
        child: Widget.Label({ className: 'cal-setup-chip-label', label: 'Tempel' }),
        onClicked: () => {
            try {
                const clipboard = Gtk.Clipboard.get(Gdk.SELECTION_CLIPBOARD);
                const text = String(clipboard.wait_for_text() ?? '').trim();
                if (text) entry.text = text;
            } catch (_) { }
        },
    });

    const saveLabel = Widget.Label({ className: 'cal-setup-save-label', label: 'Simpan & uji' });
    const saveBtn = Widget.Button({
        className: 'cal-setup-save',
        child: saveLabel,
        onClicked: () => submit(),
    });

    const removeBtn = Widget.Button({
        className: 'cal-setup-danger',
        tooltipText: 'Putuskan feed kalender dari perangkat ini',
        child: Widget.Label({ className: 'cal-setup-danger-label', label: 'Hapus' }),
        onClicked: () => {
            clearUrl();
            entry.text = '';
            setMessage('Feed kalender dilepas.', 'ok');
            refresh();
            try { refreshCalendar?.(); } catch (_) { }
        },
    });

    const message = Widget.Label({
        className: 'cal-setup-message info',
        xalign: 0,
        wrap: true,
        maxWidthChars: 56,
        visible: false,
    });
    message.set_no_show_all(true);

    const setMessage = (text, kind = 'info') => {
        message.label = text;
        message.className = `cal-setup-message ${kind}`.trim();
        message.visible = !!text;
        if (text) message.show();
        else message.hide();
    };

    const setBusy = value => {
        busy = value;
        saveBtn.sensitive = !value;
        removeBtn.sensitive = !value;
        saveLabel.label = value ? 'Menguji URL…' : 'Simpan & uji';
    };

    // ── validasi + simpan ─────────────────────────────────────────
    const validate = url => validateFeedUrl(url);

    const submit = async () => {
        if (busy) return;
        const value = String(entry.text ?? '').trim();
        if (!value) {
            setMessage('Tempel URL iCal dulu.', 'error');
            return;
        }
        setBusy(true);
        setMessage('Mengambil dan memeriksa kalender…');
        const result = await validate(value);
        setBusy(false);

        if (!result.ok) {
            setMessage(`Gagal: ${result.error}`, 'error');
            return;
        }
        const saved = saveUrl(value);
        if (!saved?.ok) {
            setMessage(`Gagal menyimpan: ${saved?.error ?? 'tidak diketahui'}`, 'error');
            return;
        }
        entry.text = '';
        setMessage('Kalender tersimpan. Memuat acara…', 'ok');
        refresh();
        try {
            const loaded = await refreshCalendar?.();
            const count = (loaded?.events ?? []).length;
            setMessage(
                loaded?.error
                    ? `Tersimpan, tapi feed gagal dimuat: ${loaded.error}`
                    : `Siap. ${count} acara dimuat dari kalender.`,
                loaded?.error ? 'error' : 'ok',
            );
        } catch (_) {
            setMessage('Tersimpan. Acara akan dimuat pada refresh berikutnya.', 'ok');
        }
        refresh();
    };

    // ── render status ─────────────────────────────────────────────
    const refresh = () => {
        const url = String(readUrl() ?? '').trim();
        const value = calendar.value ?? {};
        const events = (value.events ?? []).length;
        const next = value.next;

        if (url) {
            statusIcon.label = '\uf00c';
            statusIcon.className = 'cal-setup-status-icon ok';
            statusText.label = 'Kalender terhubung';
            const nextLine = next
                ? `Acara berikutnya: ${next.title}`
                : 'Belum ada acara mendatang';
            const errLine = value.error ? `\nError feed: ${value.error}` : '';
            detailText.label = `${maskSecret(url, 38, 10)}\n${events} acara · ${nextLine}${errLine}`;
            removeBtn.visible = true;
        } else {
            statusIcon.label = '\uf071';
            statusIcon.className = 'cal-setup-status-icon warn';
            statusText.label = 'Kalender belum terhubung';
            detailText.label = 'Ikuti langkah di bawah untuk mengambil URL rahasia dari Google Calendar.';
            removeBtn.visible = false;
        }
        if (removeBtn.child) removeBtn.child.visible = removeBtn.visible;
    };

    // ── tutorial ──────────────────────────────────────────────────
    const tutorial = Widget.Box({
        className: 'cal-setup-tutorial',
        vertical: true,
        spacing: 3,
        children: [
            Widget.Label({
                className: 'cal-setup-tutorial-title',
                label: 'Mengambil URL iCal dari Google Calendar',
                xalign: 0,
            }),
            ...STEPS.map(step => Widget.Label({
                className: 'cal-setup-tutorial-step',
                label: step,
                xalign: 0,
                wrap: true,
                maxWidthChars: 58,
            })),
            Widget.Label({
                className: 'cal-setup-tutorial-note',
                label: 'URL ini bersifat rahasia: siapa pun yang memilikinya bisa melihat kalender Anda. '
                    + 'Disimpan lokal (0600), tidak masuk repo.',
                xalign: 0,
                wrap: true,
                maxWidthChars: 58,
            }),
            Widget.Label({
                className: 'cal-setup-tutorial-note',
                label: `File URL: ${configDir}/calendar.url`,
                xalign: 0,
                wrap: true,
                maxWidthChars: 58,
            }),
        ],
    });

    // ── kartu ─────────────────────────────────────────────────────
    const closeBtn = Widget.Button({
        className: 'cal-setup-close',
        tooltipText: 'Tutup (Esc)',
        child: Widget.Label({ className: 'cal-setup-icon', label: '\uf00d' }),
        onClicked: () => close(),
    });

    const header = Widget.Box({
        className: 'cal-setup-head',
        spacing: 8,
        children: [
            Widget.Box({
                vertical: true,
                spacing: 2,
                hexpand: true,
                children: [
                    Widget.Label({ className: 'cal-setup-title', label: 'Kalender', xalign: 0 }),
                    Widget.Label({
                        className: 'cal-setup-sub',
                        label: 'Feed iCal privat dari Google Calendar',
                        xalign: 0,
                    }),
                ],
            }),
            closeBtn,
        ],
    });

    const inputRow = Widget.Box({
        className: 'cal-setup-inputrow',
        spacing: 6,
        children: [entry, pasteBtn],
    });

    const actions = Widget.Box({
        className: 'cal-setup-actions',
        spacing: 6,
        children: [saveBtn, Widget.Label({ hexpand: true }), removeBtn],
    });

    const card = Widget.Box({
        className: 'cal-setup-card',
        vertical: true,
        spacing: 10,
        widthRequest: CARD_W,
        children: [header, statusBox, inputRow, actions, message, tutorial],
    });

    const win = Widget.Window({
        name: NAME,
        className: 'cal-setup-window',
        layer: 'overlay',
        anchor: ['top'],
        exclusivity: 'ignore',
        keymode: 'exclusive',
        margins: [TOP_MARGIN, 0, 0, 0],
        visible: false,
        child: card,
    });

    // ── fokus/tutup ───────────────────────────────────────────────
    const clearFocusTimers = () => {
        for (const id of focusTimers) {
            try { GLib.source_remove(id); } catch (_) { }
        }
        focusTimers = [];
    };

    const focusEntry = () => {
        clearFocusTimers();
        for (const delay of [0, 60, 180, 400]) {
            let id = 0;
            id = Utils.timeout(delay, () => {
                focusTimers = focusTimers.filter(timer => timer !== id);
                try { entry.grab_focus(); } catch (_) { }
            });
            focusTimers.push(id);
        }
    };

    const open = async () => {
        try { await globalThis.dynIsland?.suppressNav?.(true); } catch (_) { }
        applyFocused(win, () => { }).catch(() => { });
        setMessage('');
        entry.text = '';
        refresh();
        App.openWindow(NAME);
        focusEntry();
        Utils.timeout(150, () => {
            Utils.execAsync(['hyprctl', 'dispatch', 'hl.dsp.submap("chat")']).catch(() => { });
        });
    };

    const close = () => {
        clearFocusTimers();
        Utils.execAsync(['hyprctl', 'dispatch', 'hl.dsp.submap("reset")']).catch(() => { });
        App.closeWindow(NAME);
        try { globalThis.dynIsland?.suppressNav?.(false); } catch (_) { }
    };

    const onKey = (_widget, event) => {
        if (eventKeyval(event) !== Gdk.KEY_Escape) return false;
        close();
        return true;
    };
    win.connect('key-press-event', onKey);
    entry.connect('key-press-event', onKey);
    entry.connect('activate', () => submit());

    win.connect('map', () => { refresh(); focusEntry(); });
    win.connect('unmap', () => {
        clearFocusTimers();
        Utils.execAsync(['hyprctl', 'dispatch', 'hl.dsp.submap("reset")']).catch(() => { });
    });
    win.hook(calendar, () => { if (win.visible) refresh(); });

    globalThis.calendarSetupWindow = { open, close, toggle: () => (win.visible ? close() : open()), win, entry };
    return win;
};
