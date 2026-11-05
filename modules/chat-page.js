import Gtk from 'gi://Gtk?version=3.0';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';
import CONFIG from '../config.js';
import { hovered, page, pinPage } from '../state.js';
import { chat, ask, retry, clearChat } from './chat.js';

const BODY_CHARS = 46;
const PANE_W = 440;
const PANE_H = 108;

const modelLabel = () => String(CONFIG.chat?.model ?? 'gemini-3.5-flash-lite');

const bubble = msg => Widget.Box({
    className: `dyn-island-chat-row ${msg.role}`,
    halign: msg.role === 'user' ? Gtk.Align.END : Gtk.Align.START,
    children: [
        Widget.Box({
            className: `dyn-island-chat-bubble ${msg.role}`,
            children: [
                Widget.Label({
                    className: 'dyn-island-chat-text',
                    label: msg.text,
                    wrap: true,
                    xalign: 0,
                    maxWidthChars: BODY_CHARS,
                }),
            ],
        }),
    ],
});

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
    const list = Widget.Box({ className: 'dyn-island-chat-list', vertical: true, spacing: 6 });
    pane.child = list;
    pane.set_size_request(PANE_W, PANE_H);

    // Scroll wheel eksplisit. Pane ini nested di dalam Scrollable clip milik
    // island; event wheel berhenti di outer clip (terukur), tidak sampai ke
    // pane. Handler dipasang juga di toplevel window (lihat setup) supaya
    // tetap bekerja. Fungsi ini dipakai kedua jalur.
    const scrollPane = event => {
        let dy = 0;
        try {
            const deltas = event.get_scroll_deltas?.();
            if (Array.isArray(deltas) && deltas[0]) dy = Number(deltas[2]) || 0;
        } catch (_) { }
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
        label: 'Belum ada pesan. Klik Tanya Gemini.',
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
    const clear = Widget.Button({
        className: 'dyn-island-chip',
        halign: Gtk.Align.END,
        valign: Gtk.Align.CENTER,
        tooltipText: 'Hapus riwayat chat (tidak menghapus API key)',
        child: Widget.Label({ className: 'dyn-island-chip-label', label: 'Hapus' }),
        onClicked: () => clearChat(),
        setup: self => self.set_no_show_all(true),
    });
    const head = Widget.CenterBox({
        className: 'dyn-island-chat-head',
        startWidget: Widget.Box({ vertical: true, spacing: 0, children: [title, sub] }),
        endWidget: clear,
    });
    head.set_size_request(PANE_W, -1);

    const askBtn = Widget.Button({
        className: 'dyn-island-pill',
        tooltipText: 'Buka jendela chat Gemini',
        child: Widget.Box({
            className: 'dyn-island-pill-content',
            spacing: 6,
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
        spacing: 6,
        children: [askBtn, retryBtn],
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
        spacing: 6,
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
