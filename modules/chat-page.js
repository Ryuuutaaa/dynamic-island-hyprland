import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=3.0';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';
import CONFIG from '../config.js';
import { hovered, page, pinPage } from '../state.js';
import { chat, ask, retry, clearChat } from './chat.js';
import { scrollDelta } from './pointer.js';

const BODY_CHARS = 46;
const PANE_W = 440;
const PANE_H = 108;

const modelLabel = () => String(CONFIG.chat?.model ?? 'gemini-3.5-flash-lite');

const hhmm = epoch => {
    if (!Number.isFinite(epoch)) return '';
    const date = new Date(epoch);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const bubble = msg => {
    const isUser = msg.role === 'user';
    const time = Widget.Label({
        className: 'dyn-island-chat-time',
        label: hhmm(msg.at),
        xalign: isUser ? 1 : 0,
        visible: Number.isFinite(msg.at),
    });
    const content = Widget.Box({
        className: 'dyn-island-chat-stack',
        vertical: true,
        spacing: 4,
        children: [
            Widget.Label({
                className: 'dyn-island-chat-text',
                label: msg.text,
                wrap: true,
                xalign: 0,
                maxWidthChars: BODY_CHARS,
            }),
            time,
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
        spacing: 8,
        children: isUser ? [
            Widget.Box({ className: `dyn-island-chat-bubble ${msg.role}`, children: [content] }),
            avatar,
        ] : [
            avatar,
            Widget.Box({ className: `dyn-island-chat-bubble ${msg.role}`, children: [content] }),
        ],
    });
};

export default () => {
    // vscroll automatic + propagateNatural* false: tinggi pane tetap 108px,
    // scrollbar tipis muncul saat riwayat panjang, wheel ditangani manual.
    const pane = Widget.Scrollable({
        className: 'dyn-island-chat-pane',
        hscroll: 'never',
        vscroll: 'automatic',
        propagateNaturalWidth: false,
        propagateNaturalHeight: false,
    });
    const list = Widget.Box({ className: 'dyn-island-chat-list', vertical: true, spacing: 8 });
    pane.child = list;
    pane.set_size_request(PANE_W, PANE_H);

    // Scroll wheel eksplisit. Pane ini nested di dalam Scrollable clip milik
    // island; event wheel berhenti di outer clip (terukur), tidak sampai ke
    // pane. Handler dipasang juga di toplevel window (lihat setup) supaya
    // tetap bekerja. Fungsi ini dipakai kedua jalur.
    const scrollPane = event => {
        const dy = scrollDelta(event);
        if (!dy) return false;
        const adjustment = pane.get_vadjustment();
        if (!adjustment) return false;
        const max = Math.max(0, adjustment.upper - adjustment.page_size);
        if (max <= 0) return false;
        adjustment.value = Math.max(0, Math.min(max, adjustment.value + dy * 36));
        return true;
    };
    pane.connect('scroll-event', (_self, event) => scrollPane(event));

    // Empty state sebagai overlay di tengah pane, bukan baris pertama list:
    // baris di dalam Box selalu di atas, overlay bisa benar-benar center.
    const emptyLabel = Widget.Label({
        className: 'dyn-island-chat-empty',
        label: 'Belum ada pesan. Tanya Gemini untuk memulai.',
        halign: Gtk.Align.CENTER,
        valign: Gtk.Align.CENTER,
        xalign: 0.5,
        visible: false,
        setup: self => self.set_no_show_all(true),
    });
    const content = Widget.Overlay({
        child: pane,
        // Overlay child dengan FILL agar mendapat seluruh area pane;
        // CenterBox yang menaruh label tepat di tengah.
        overlays: [Widget.CenterBox({ centerWidget: emptyLabel })],
    });

    const title = Widget.Label({ className: 'dyn-island-chat-title', label: 'Chat', xalign: 0 });
    const sub = Widget.Label({
        className: 'dyn-island-chat-sub',
        label: `Gemini · ${modelLabel()}`,
        xalign: 0,
    });
    let clearArmed = false;
    let clearTimer = 0;
    const clearLabel = Widget.Label({ className: 'dyn-island-chip-label', label: 'Hapus' });
    const clear = Widget.Button({
        className: 'dyn-island-chip',
        halign: Gtk.Align.END,
        valign: Gtk.Align.CENTER,
        tooltipText: 'Hapus riwayat chat (tidak menghapus API key)',
        child: clearLabel,
        onClicked: () => {
            if (clearArmed) {
                clearArmed = false;
                if (clearTimer) GLib.source_remove(clearTimer);
                clearTimer = 0;
                clearLabel.label = 'Hapus';
                clear.tooltipText = 'Hapus riwayat chat (tidak menghapus API key)';
                clearChat();
                return;
            }
            clearArmed = true;
            clearLabel.label = 'Yakin?';
            clear.tooltipText = 'Klik lagi untuk menghapus riwayat';
            clearTimer = Utils.timeout(2500, () => {
                clearArmed = false;
                clearTimer = 0;
                clearLabel.label = 'Hapus';
                clear.tooltipText = 'Hapus riwayat chat (tidak menghapus API key)';
            }, clear);
        },
        setup: self => self.set_no_show_all(true),
    });
    const askBtn = Widget.Button({
        className: 'dyn-island-pill',
        tooltipText: 'Buka jendela chat Gemini',
        child: Widget.Box({
            className: 'dyn-island-pill-content',
            spacing: 8,
            children: [
                Widget.Label({ className: 'dyn-island-pill-icon', label: '\uf075' }),
                Widget.Label({ className: 'dyn-island-pill-label', label: 'Tanya Gemini' }),
            ],
        }),
        onClicked: () => {
            const chatWin = globalThis.geminiChat;
            if (chatWin?.open) {
                chatWin.open();
                return;
            }
            // fallback: alur rofi lama bila window chat belum terpasang
            pinPage('chat', { sticky: true });
            ask();
        },
    });

    const head = Widget.CenterBox({
        className: 'dyn-island-chat-head',
        startWidget: Widget.Box({ vertical: true, spacing: 0, children: [title, sub] }),
        endWidget: Widget.Box({
            spacing: 8,
            valign: Gtk.Align.CENTER,
            children: [askBtn, clear],
        }),
    });
    head.set_size_request(PANE_W, -1);

    const retryBtn = Widget.Button({
        className: 'dyn-island-pill',
        tooltipText: 'Kirim ulang pesan terakhir',
        visible: false,
        child: Widget.Label({ className: 'dyn-island-pill-label', label: '\uf021 Ulangi' }),
        onClicked: () => retry(),
        setup: self => self.set_no_show_all(true),
    });

    const foot = Widget.Box({
        className: 'dyn-island-chat-foot',
        spacing: 8,
        children: [retryBtn],
    });
    foot.set_size_request(PANE_W, -1);

    const scrollToBottom = () => {
        const adjustment = pane.get_vadjustment();
        if (!adjustment) return;
        adjustment.value = Math.max(0, adjustment.upper - adjustment.page_size);
    };

    const rebuild = () => {
        const state = chat.value;
        const latency = Number(state.latencyMs) > 0
            ? ` · ${(state.latencyMs / 1000).toFixed(1)}s`
            : '';
        sub.label = `Gemini · ${modelLabel()}${latency}`;
        const rows = state.messages.map(bubble);
        // Hapus hanya relevan kalau sudah ada riwayat.
        const hasMessages = state.messages.length > 0;
        clear.visible = hasMessages;
        if (hasMessages) {
            clear.show();
            clear.child.show();
        }

        if (state.status === 'loading') {
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
                maxWidthChars: 54,
            }));
        }

        list.children = rows;
        emptyLabel.visible = !state.messages.length
            && state.status !== 'loading' && state.status !== 'error';
        const showRetry = state.status === 'error'
            && state.messages.some(m => m.role === 'user');
        retryBtn.visible = showRetry;
        // no_show_all pada tombol membuat child label-nya tidak ikut di-show
        // oleh show_all; tampilkan manual supaya label "Ulangi" terlihat.
        if (retryBtn.child)
            retryBtn.child.visible = showRetry;

        Utils.idle(scrollToBottom);
    };

    return Widget.Box({
        className: 'dyn-island-chat',
        vertical: true,
        spacing: 8,
        halign: Gtk.Align.CENTER,
        valign: Gtk.Align.CENTER,
        children: [head, content, foot],
        setup: self => {
            rebuild();
            self.hook(chat, rebuild);
            // Wheel sampai ke window island, bukan pane (nested Scrollable).
            // Pasang handler di toplevel setelah halaman di-map.
            self.connect('map', () => {
                const top = self.get_toplevel();
                if (!top || top.__chatScrollHooked) return;
                top.__chatScrollHooked = true;
                top.connect('scroll-event', (_w, event) => {
                    if (page.value !== 'chat' || !pane.get_mapped()) return false;
                    return scrollPane(event);
                });
            });
            // Jawaban bisa datang saat island tertutup (rofi/pointer keluar).
            // Setelah kartu dibuka / pindah ke halaman chat, layout baru siap
            // ~200ms (contentDelay) — gulir setelah itu.
            const scheduleScroll = () => Utils.timeout(320, scrollToBottom, self);
            self.hook(hovered, () => {
                if (hovered.value && page.value === 'chat') scheduleScroll();
            });
            self.hook(page, () => {
                if (hovered.value && page.value === 'chat') scheduleScroll();
            });
            self.connect('map', () => Utils.idle(scrollToBottom));
        },
    });
};
