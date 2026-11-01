import Gtk from 'gi://Gtk?version=3.0';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';
import CONFIG from '../config.js';
import { hovered, page, pinPage } from '../state.js';
import { chat, ask, retry, clearChat } from './chat.js';

const BODY_CHARS = 46;
const PANE_W = 440;
const PANE_H = 108;

const modelLabel = () => String(CONFIG.chat?.model ?? 'gemini-3.6-flash');

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
    // vscroll external + propagateNatural* false: tinggi pane tetap 108px
    // walau riwayat chat panjang, isinya digulir.
    const pane = Widget.Scrollable({
        className: 'dyn-island-chat-pane',
        hscroll: 'never',
        vscroll: 'external',
        propagateNaturalWidth: false,
        propagateNaturalHeight: false,
    });
    const list = Widget.Box({ className: 'dyn-island-chat-list', vertical: true, spacing: 6 });
    pane.child = list;
    pane.set_size_request(PANE_W, PANE_H);

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
    });
    const head = Widget.CenterBox({
        className: 'dyn-island-chat-head',
        startWidget: Widget.Box({ vertical: true, spacing: 0, children: [title, sub] }),
        endWidget: clear,
    });
    head.set_size_request(PANE_W, -1);

    const askBtn = Widget.Button({
        className: 'dyn-island-pill',
        tooltipText: 'Buka input rofi untuk bertanya ke Gemini',
        child: Widget.Box({
            className: 'dyn-island-pill-content',
            spacing: 6,
            children: [
                Widget.Label({ className: 'dyn-island-pill-icon', label: '\uf075' }),
                Widget.Label({ className: 'dyn-island-pill-label', label: 'Tanya Gemini' }),
            ],
        }),
        onClicked: () => {
            // chat sticky: jangan reset ke halaman base saat rofi/menunggu jawaban
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
