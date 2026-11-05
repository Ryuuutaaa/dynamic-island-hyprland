import Gdk from 'gi://Gdk?version=3.0';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=3.0';
import App from 'resource:///com/github/Aylur/ags/app.js';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';
import CONFIG from '../config.js';
import { applyFocused } from './monitor.js';
import { chat, send, retry, clearChat, hasKey, keyHelp } from './chat.js';

const WIN_W = 560;
const MIN_H = 240;
const MAX_H = 460;
// tepat di bawah notch island (closed 50px) + jarak
const TOP_MARGIN = 64;
const BODY_CHARS = 54;

const modelLabel = () => String(CONFIG.chat?.model ?? 'gemini-3.5-flash-lite');

const hhmm = epoch => {
    if (!Number.isFinite(epoch)) return '';
    const date = new Date(epoch);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

export default () => {
    // ── daftar pesan ────────────────────────────────────────────────
    const list = Widget.Box({ className: 'gemini-chat-list', vertical: true, spacing: 8 });

    const scroll = Widget.Scrollable({
        className: 'gemini-chat-scroll',
        hscroll: 'never',
        vscroll: 'automatic',
        propagateNaturalWidth: false,
        propagateNaturalHeight: false,
    });
    scroll.child = list;

    const bubble = msg => {
        const isUser = msg.role === 'user';
        const content = Widget.Box({
            className: 'dyn-island-chat-stack',
            vertical: true,
            spacing: 2,
            children: [
                Widget.Label({
                    className: 'dyn-island-chat-text',
                    label: msg.text,
                    wrap: true,
                    selectable: true,
                    xalign: 0,
                    maxWidthChars: BODY_CHARS,
                }),
                Widget.Label({
                    className: 'dyn-island-chat-time',
                    label: hhmm(msg.at),
                    xalign: isUser ? 1 : 0,
                    visible: Number.isFinite(msg.at),
                }),
            ],
        });
        const avatar = Widget.Label({
            className: `dyn-island-chat-avatar ${msg.role}`,
            label: isUser ? '\uf007' : '\uf0d0',
            valign: Gtk.Align.START,
        });
        return Widget.Box({
            className: `dyn-island-chat-row ${msg.role}`,
            halign: isUser ? Gtk.Align.END : Gtk.Align.START,
            spacing: 6,
            children: isUser ? [
                Widget.Box({ className: `dyn-island-chat-bubble ${msg.role}`, children: [content] }),
                avatar,
            ] : [
                avatar,
                Widget.Box({ className: `dyn-island-chat-bubble ${msg.role}`, children: [content] }),
            ],
        });
    };

    // ── empty state (di tengah area pesan) ──────────────────────────
    const emptyBox = Widget.Box({
        className: 'gemini-chat-empty',
        vertical: true,
        spacing: 10,
        halign: Gtk.Align.CENTER,
        valign: Gtk.Align.CENTER,
        children: [
            Widget.Label({ className: 'gemini-chat-empty-icon', label: '\uf075' }),
            Widget.Label({
                className: 'gemini-chat-empty-text',
                label: 'Belum ada pesan.\nKetik pertanyaan lalu Enter.',
                justify: Gtk.Justification.CENTER,
                xalign: 0.5,
            }),
        ],
    });

    const body = Widget.Overlay({
        className: 'gemini-chat-body',
        vexpand: true,
        child: scroll,
        overlays: [Widget.CenterBox({ centerWidget: emptyBox })],
    });
    // GtkOverlay memberi overlay child alokasi penuh area body (terukur
    // 524x286) dan `pass_through` default FALSE: wheel dan klik berhenti di
    // empty-state sehingga isi tidak pernah bisa di-scroll.
    body.pass_through = true;

    // ── header ──────────────────────────────────────────────────────
    const title = Widget.Label({ className: 'gemini-chat-title', label: 'Gemini', xalign: 0 });
    const sub = Widget.Label({ className: 'gemini-chat-sub', label: modelLabel(), xalign: 0 });

    // Tombol header mengikuti pola baku: ikon persegi 26px, tanpa latar sampai
    // hover. Aksi destruktif (hapus riwayat) dipisah dari tombol tutup dan
    // hanya ditampilkan bila memang ada riwayat untuk dihapus.
    const clearBtn = Widget.Button({
        className: 'gemini-chat-icon-btn gemini-chat-clear',
        valign: Gtk.Align.CENTER,
        tooltipText: 'Hapus riwayat chat (API key tidak dihapus)',
        child: Widget.Label({ className: 'gemini-chat-icon-label', label: '\uf1f8' }),
        onClicked: () => clearChat(),
    });

    const closeBtn = Widget.Button({
        className: 'gemini-chat-icon-btn gemini-chat-close',
        valign: Gtk.Align.CENTER,
        tooltipText: 'Tutup (Esc)',
        child: Widget.Label({ className: 'gemini-chat-icon-label', label: '✕' }),
        onClicked: () => close(),
    });

    // Box biasa + spacer hexpand: CenterBox AGS dengan centerWidget kosong
    // tidak mendorong tombol ke tepi kanan.
    const header = Widget.Box({
        className: 'gemini-chat-head',
        spacing: 4,
        children: [
            Widget.Box({
                vertical: true,
                spacing: 0,
                hexpand: true,
                children: [title, sub],
            }),
            clearBtn,
            closeBtn,
        ],
    });

    // ── input (placeholder sendiri: GTK3 menyembunyikan placeholder saat fokus) ──
    const entry = Widget.Entry({
        className: 'gemini-chat-entry',
        hexpand: true,
        setup: self => {
            self.connect('activate', () => submit());
            self.connect('changed', () => syncPlaceholder());
        },
    });

    const placeholder = Widget.Label({
        className: 'gemini-chat-placeholder',
        label: 'Tanya Gemini…',
        xalign: 0,
    });

    const placeholderLayer = Widget.Box({
        className: 'gemini-chat-placeholder-layer',
        halign: Gtk.Align.START,
        valign: Gtk.Align.CENTER,
        children: [placeholder],
    });

    // Field surface harus berada di parent EventBox: background Entry sendiri
    // menutupi label placeholder overlay. Entry tetap transparan.
    const entryBox = Widget.EventBox({
        className: 'gemini-chat-entry-box',
        hexpand: true,
        child: entry,
    });
    const entryWrap = Widget.Overlay({
        className: 'gemini-chat-entry-wrap',
        hexpand: true,
        child: entryBox,
        overlays: [placeholderLayer],
    });
    entry.connect('focus-in-event', () => {
        entryBox.toggleClassName('is-focused', true);
        return false;
    });
    entry.connect('focus-out-event', () => {
        entryBox.toggleClassName('is-focused', false);
        return false;
    });

    const sendBtn = Widget.Button({
        className: 'gemini-chat-send',
        valign: Gtk.Align.CENTER,
        child: Widget.Label({ className: 'gemini-chat-send-label', label: 'Kirim' }),
        onClicked: () => submit(),
    });

    const inputRow = Widget.Box({
        className: 'gemini-chat-input',
        spacing: 8,
        children: [entryWrap, sendBtn],
    });

    const footHint = Widget.Label({
        className: 'gemini-chat-foot-hint',
        label: 'Enter kirim · Esc tutup',
        xalign: 0,
    });

    // Garis pemisah: Box kosong butuh tinggi eksplisit, kalau hanya min-height
    // dari CSS ia sering teralokasi 0px dan tidak terlihat.
    const sep = () => {
        const line = Widget.Box({ className: 'gemini-chat-sep' });
        line.set_size_request(-1, 1);
        return line;
    };

    const root = Widget.Box({
        className: 'gemini-chat',
        vertical: true,
        spacing: 10,
        children: [
            header,
            sep(),
            body,
            sep(),
            inputRow,
            footHint,
        ],
    });

    // ── ukuran mengikuti isi (240..460) supaya tidak menyisakan ruang kosong ──
    const preferredH = widget => {
        try { return widget.get_preferred_height()[1]; } catch (_) { return 0; }
    };
    const chromeH = () =>
        preferredH(header) + preferredH(inputRow) + preferredH(footHint)
        + 2        // dua garis 1px
        + 50       // 5 celah antar 6 anak
        + 28;      // padding atas+bawah 14px

    const fit = () => {
        let listH = 0;
        try { listH = list.get_preferred_height_for_width(WIN_W - 40)[1]; } catch (_) { }
        const want = chromeH() + listH + 8;
        root.set_size_request(WIN_W, Math.max(MIN_H, Math.min(MAX_H, want)));
    };

    const syncPlaceholder = () => {
        placeholder.visible = !String(entry.text ?? '').length;
    };

    // ── state ───────────────────────────────────────────────────────
    const submit = () => {
        const text = String(entry.text ?? '').trim();
        if (!text) return;
        follow = true;
        if (send(text)) {
            entry.text = '';
            syncPlaceholder();
        }
        entry.grab_focus();
    };

    // Ikuti pesan terbaru hanya selama pengguna berada di dasar. Sinyal
    // `changed` (bukan sekali panggil) yang penting: tinggi isi baru final
    // setelah layout berikutnya, jadi satu kali scrollToBottom berhenti di
    // tengah (terukur value 602 dari maksimum 890).
    const adj = scroll.get_vadjustment();
    const adjMax = () => Math.max(0, adj.upper - adj.page_size);
    const scrollToBottom = () => { adj.value = adjMax(); };
    let follow = true;
    adj.connect('value-changed', () => { follow = adj.value >= adjMax() - 4; });
    adj.connect('changed', () => { if (follow) adj.value = adjMax(); });

    const rebuild = () => {
        const state = chat.value;
        const latency = Number(state.latencyMs) > 0
            ? ` · ${(state.latencyMs / 1000).toFixed(1)}s`
            : '';
        sub.label = `${modelLabel()}${latency}`;

        const rows = state.messages.map(bubble);

        if (!hasKey()) {
            rows.push(Widget.Label({
                className: 'gemini-chat-hint error',
                label: keyHelp(),
                wrap: true,
                xalign: 0,
                maxWidthChars: 62,
            }));
        } else if (state.status === 'loading') {
            rows.push(Widget.Label({
                className: 'dyn-island-chat-typing',
                label: 'Gemini sedang mengetik…',
                xalign: 0,
            }));
        } else if (state.status === 'error') {
            rows.push(Widget.Label({
                className: 'dyn-island-chat-error',
                label: state.error || 'Terjadi kesalahan.',
                wrap: true,
                xalign: 0,
                maxWidthChars: 62,
            }));
            if (state.messages.some(m => m.role === 'user')) {
                rows.push(Widget.Button({
                    className: 'gemini-chat-chip',
                    halign: Gtk.Align.START,
                    child: Widget.Label({ className: 'gemini-chat-chip-label', label: 'Ulangi' }),
                    onClicked: () => retry(),
                }));
            }
        }

        list.children = rows;

        emptyBox.visible = !state.messages.length
            && state.status !== 'loading'
            && state.status !== 'error'
            && hasKey();

        sendBtn.sensitive = state.status !== 'loading';
        clearBtn.visible = state.messages.length > 0;
        syncPlaceholder();
        Utils.idle(() => { fit(); if (follow) scrollToBottom(); });
    };

    root.hook(chat, rebuild);
    rebuild();

    // ── window ──────────────────────────────────────────────────────
    const win = Widget.Window({
        name: 'gemini-chat',
        className: 'gemini-chat-window',
        layer: 'overlay',
        anchor: ['top'],
        exclusivity: 'ignore',
        keymode: 'exclusive',
        margins: [TOP_MARGIN, 0, 0, 0],
        visible: false,
        child: root,
    });

    // Focus hanya bisa diberikan setelah surface ter-map. grab_focus() sekali
    // di dalam open() terlalu cepat: entry tidak fokus (placeholder tetap
    // tampil) dan key-press/Escape tidak pernah sampai ke window.
    let focusTimers = [];
    const clearFocusTimers = () => {
        for (const id of focusTimers) { try { GLib.source_remove(id); } catch (_) { } }
        focusTimers = [];
    };
    const focusEntry = () => {
        clearFocusTimers();
        for (const delay of [0, 60, 180, 400]) {
            // ID dilepas saat timer menyala; menghapus source yang sudah
            // selesai memicu GLib-CRITICAL "Source ID was not found".
            let id = 0;
            id = Utils.timeout(delay, () => {
                focusTimers = focusTimers.filter(timer => timer !== id);
                try { entry.grab_focus(); } catch (_) { }
            });
            focusTimers.push(id);
        }
    };

    const setSubmap = mode => {
        Utils.execAsync(['hyprctl', 'dispatch', `hl.dsp.submap("${mode}")`]).catch(() => { });
    };

    const open = async () => {
        // Submap `island` menelan panah/Esc. Lepas dulu, kalau tidak Entry
        // tidak akan pernah menerima tombol yang diketik.
        try { await globalThis.dynIsland?.suppressNav?.(true); } catch (_) { }
        // popup selalu muncul di monitor yang sedang fokus
        applyFocused(win, () => { }).catch(() => { });
        App.openWindow('gemini-chat');
        focusEntry();
        // Fallback Escape di level compositor: submap `chat` hanya mengikat
        // Escape, tombol lain tetap masuk ke Entry.
        Utils.timeout(150, () => setSubmap('chat'));
    };

    const close = () => {
        clearFocusTimers();
        setSubmap('reset');
        App.closeWindow('gemini-chat');
        try { globalThis.dynIsland?.suppressNav?.(false); } catch (_) { }
    };

    win.connect('map', () => {
        Utils.idle(fit);
        focusEntry();
    });
    win.connect('unmap', () => {
        clearFocusTimers();
        setSubmap('reset');
    });

    const onKey = (_w, ev) => {
        if (ev.get_keyval() === Gdk.KEY_Escape) {
            close();
            return true;
        }
        return false;
    };
    win.connect('key-press-event', onKey);
    entry.connect('key-press-event', onKey);

    globalThis.geminiChat = {
        open,
        close,
        toggle: () => (win.visible ? close() : open()),
        win,
        entry,
        fit,
        send,
        clear: clearChat,
    };

    return win;
};
