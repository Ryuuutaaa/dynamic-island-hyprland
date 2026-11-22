import Gdk from 'gi://Gdk?version=3.0';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=3.0';
import App from 'resource:///com/github/Aylur/ags/app.js';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';
import { applyFocused } from './monitor.js';
import { eventKeyval } from './pointer.js';
import {
    keyStatus, setupKey, clearKey, testKey, recommendModel, currentModel,
} from './chat.js';
import { maskSecret } from './secret-file.js';

// Window pengaturan API key Gemini. Dibuka dari halaman Pengaturan.
// Alur: tempel key -> Uji & simpan -> key diverifikasi ke Google -> model
// terbaik dipilih otomatis -> chat siap. Kalau gagal, error tampil di kartu
// dan key lama tidak dihapus.

const NAME = 'dyn-island-gemini-key';
const TOP_MARGIN = 64;
const CARD_W = 520;

export default () => {
    let busy = false;
    let focusTimers = [];

    // ── status ringkas ────────────────────────────────────────────
    const statusIcon = Widget.Label({ className: 'gemini-setup-status-icon' });
    const statusText = Widget.Label({
        className: 'gemini-setup-status-text',
        xalign: 0,
        wrap: true,
        maxWidthChars: 44,
    });
    const modelText = Widget.Label({
        className: 'gemini-setup-model',
        xalign: 0,
        wrap: true,
        maxWidthChars: 52,
    });

    const statusBox = Widget.Box({
        className: 'gemini-setup-status',
        spacing: 10,
        children: [statusIcon, Widget.Box({
            vertical: true,
            spacing: 2,
            hexpand: true,
            children: [statusText, modelText],
        })],
    });

    // ── input key ─────────────────────────────────────────────────
    const entry = Widget.Entry({
        className: 'gemini-setup-entry',
        placeholderText: 'Tempel API key Gemini di sini',
        hexpand: true,
        visibility: false, // disamarkan saat diketik
    });

    const revealBtn = Widget.Button({
        className: 'gemini-setup-reveal',
        tooltipText: 'Tampilkan / sembunyikan key',
        child: Widget.Label({ className: 'gemini-setup-icon', label: '\uf06e' }),
        onClicked: () => {
            entry.visibility = !entry.visibility;
        },
    });

    const pasteBtn = Widget.Button({
        className: 'gemini-setup-chip',
        tooltipText: 'Tempel isi clipboard',
        child: Widget.Label({ className: 'gemini-setup-chip-label', label: 'Tempel' }),
        onClicked: () => {
            try {
                const clipboard = Gtk.Clipboard.get(Gdk.SELECTION_CLIPBOARD);
                const text = String(clipboard.wait_for_text() ?? '').trim();
                if (text) entry.text = text;
            } catch (_) { }
        },
    });

    const saveBtnLabel = Widget.Label({ className: 'gemini-setup-save-label', label: 'Uji & simpan' });
    const saveBtn = Widget.Button({
        className: 'gemini-setup-save',
        child: saveBtnLabel,
        onClicked: () => submit(),
    });

    const removeBtn = Widget.Button({
        className: 'gemini-setup-danger',
        tooltipText: 'Hapus API key dari perangkat ini',
        child: Widget.Label({ className: 'gemini-setup-danger-label', label: 'Hapus' }),
        onClicked: () => {
            clearKey();
            entry.text = '';
            setMessage('API key dihapus.', 'ok');
            refresh();
        },
    });

    const testBtnLabel = Widget.Label({ className: 'gemini-setup-chip-label', label: 'Uji ulang' });
    const testBtn = Widget.Button({
        className: 'gemini-setup-chip',
        tooltipText: 'Uji key yang tersimpan saat ini',
        child: testBtnLabel,
        onClicked: async () => {
            const status = keyStatus();
            if (!status.has) {
                setMessage('Belum ada key tersimpan.', 'error');
                return;
            }
            await runTest(status.key, { save: false });
        },
    });

    const message = Widget.Label({
        className: 'gemini-setup-message info',
        xalign: 0,
        wrap: true,
        maxWidthChars: 54,
        visible: false,
    });
    message.set_no_show_all(true);

    const setMessage = (text, kind = 'info') => {
        message.label = text;
        message.className = `gemini-setup-message ${kind}`.trim();
        message.visible = !!text;
        if (text) message.show();
        else message.hide();
    };

    const setBusy = value => {
        busy = value;
        saveBtn.sensitive = !value;
        testBtn.sensitive = !value;
        removeBtn.sensitive = !value;
        saveBtnLabel.label = value ? 'Menguji…' : 'Uji & simpan';
        testBtnLabel.label = value ? 'Menguji…' : 'Uji ulang';
    };

    // ── alur uji ──────────────────────────────────────────────────
    const runTest = async (key, { save }) => {
        if (busy) return;
        setBusy(true);
        setMessage(save ? 'Menguji key lalu memilih model…' : 'Menguji key tersimpan…');

        const result = save ? await setupKey(key) : await testKey(key);
        setBusy(false);

        if (!result.ok) {
            setMessage(`Gagal: ${result.error}`, 'error');
            return;
        }
        if (!save) {
            const model = recommendModel(result.models);
            setMessage(
                `Key valid. ${result.models.length} model tersedia`
                + `${model ? ` · rekomendasi: ${model}` : ''}.`,
                'ok',
            );
            refresh();
            return;
        }
        setMessage(`Siap. ${result.count} model terdeteksi, dipakai: ${result.model}`, 'ok');
        entry.text = '';
        refresh();
    };

    const submit = () => {
        const value = String(entry.text ?? '').trim();
        if (!value) {
            setMessage('Tempel API key dulu.', 'error');
            return;
        }
        runTest(value, { save: true });
    };

    // ── render status ─────────────────────────────────────────────
    const refresh = () => {
        const status = keyStatus();
        if (status.has) {
            statusIcon.label = '\uf00c';
            statusIcon.className = 'gemini-setup-status-icon ok';
            statusText.label = 'API key terpasang';
            modelText.label = `${status.masked}\nModel: ${currentModel()}`
                + (status.source ? `\nSumber: ${status.source}` : '');
            removeBtn.visible = true;
            testBtn.visible = true;
        } else {
            statusIcon.label = '\uf071';
            statusIcon.className = 'gemini-setup-status-icon warn';
            statusText.label = 'API key belum di-set';
            modelText.label = 'Chat tidak bisa dipakai sebelum key dimasukkan.';
            removeBtn.visible = false;
            testBtn.visible = false;
        }
        if (removeBtn.child) removeBtn.child.visible = removeBtn.visible;
        if (testBtn.child) testBtn.child.visible = testBtn.visible;
    };

    // ── tutorial singkat ──────────────────────────────────────────
    const tutorial = Widget.Box({
        className: 'gemini-setup-tutorial',
        vertical: true,
        spacing: 4,
        children: [
            Widget.Label({ className: 'gemini-setup-tutorial-title', label: 'Cara mendapat API key', xalign: 0 }),
            Widget.Label({
                className: 'gemini-setup-tutorial-step',
                label: '1. Buka aistudio.google.com/apikey\n'
                    + '2. Klik Create API key, salin nilainya\n'
                    + '3. Tempel di kolom atas, lalu Uji & simpan\n'
                    + '4. Model terbaik untuk akun Anda dipilih otomatis',
                xalign: 0,
                wrap: true,
                maxWidthChars: 54,
            }),
            Widget.Label({
                className: 'gemini-setup-tutorial-note',
                label: 'Key disimpan lokal (0600), tidak masuk repo.',
                xalign: 0,
            }),
        ],
    });

    // ── susunan kartu ─────────────────────────────────────────────
    const closeBtn = Widget.Button({
        className: 'gemini-setup-close',
        tooltipText: 'Tutup (Esc)',
        child: Widget.Label({ className: 'gemini-setup-icon', label: '\uf00d' }),
        onClicked: () => close(),
    });

    const header = Widget.Box({
        className: 'gemini-setup-head',
        spacing: 8,
        children: [
            Widget.Box({
                vertical: true,
                spacing: 2,
                hexpand: true,
                children: [
                    Widget.Label({ className: 'gemini-setup-title', label: 'API Key Gemini', xalign: 0 }),
                    Widget.Label({
                        className: 'gemini-setup-sub',
                        label: 'Dipakai halaman chat dan jendela Gemini',
                        xalign: 0,
                    }),
                ],
            }),
            closeBtn,
        ],
    });

    const inputRow = Widget.Box({
        className: 'gemini-setup-inputrow',
        spacing: 6,
        children: [entry, revealBtn],
    });

    const actions = Widget.Box({
        className: 'gemini-setup-actions',
        spacing: 6,
        children: [
            saveBtn,
            testBtn,
            pasteBtn,
            Widget.Label({ hexpand: true }),
            removeBtn,
        ],
    });

    const card = Widget.Box({
        className: 'gemini-setup-card',
        vertical: true,
        spacing: 10,
        widthRequest: CARD_W,
        children: [header, statusBox, inputRow, actions, message, tutorial],
    });

    const win = Widget.Window({
        name: NAME,
        className: 'gemini-setup-window',
        layer: 'overlay',
        anchor: ['top'],
        exclusivity: 'ignore',
        keymode: 'exclusive',
        margins: [TOP_MARGIN, 0, 0, 0],
        visible: false,
        child: card,
    });

    // ── fokus & tutup ─────────────────────────────────────────────
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
        // Submap `chat` menangkap Escape di level compositor; bind-nya
        // mengarah ke penutup window yang aktif (lihat setupKeyEscape).
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

    globalThis.geminiKeyWindow = { open, close, toggle: () => (win.visible ? close() : open()), win, entry };
    // Submap `chat` hanya punya satu bind Escape. Karena beberapa window bisa
    // memakainya, bind mengarah ke satu pintu: tutup semua yang sedang terbuka.
    globalThis.closeSetupWindows = () => {
        try { if (win.visible) close(); } catch (_) { }
        try { if (globalThis.calendarSetupWindow?.win?.visible) globalThis.calendarSetupWindow.close(); } catch (_) { }
        try { if (globalThis.geminiChat?.win?.visible) globalThis.geminiChat.close(); } catch (_) { }
    };
    return win;
};
