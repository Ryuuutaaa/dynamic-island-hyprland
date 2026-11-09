import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=3.0';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import { page, stepPage, pinPage, mediaView, PAGE_ORDER, isStickyPage } from '../state.js';

// Navigasi: tab strip ikon 7 slot yang bergeser mengikuti halaman aktif,
// dengan panah untuk langkah satuan.
const SLOTS = 7;

const ICONS = {
    idle: '\uf017',
    media: '\uf001',
    weather: '\uf0c2',
    calendar: '\uf073',
    pomodoro: '\uf252',
    timer: '\uf2f2',
    stats: '\uf080',
    water: '\uf043',
    todo: '\uf0ae',
    standup: '\uf0c0',
    shelf: '\uf07b',
    bluetooth: '\uf293',
    wifi: '\uf1eb',
    prayer: '\uf02d',
    chat: '\uf075',
    settings: '\uf013',
};

const LABELS = {
    idle: 'Ringkasan',
    media: 'Media',
    weather: 'Cuaca',
    calendar: 'Kalender',
    pomodoro: 'Pomodoro',
    timer: 'Timer',
    stats: 'Statistik',
    water: 'Air',
    todo: 'Tugas',
    standup: 'Standup',
    shelf: 'Rak',
    bluetooth: 'Bluetooth',
    wifi: 'Wi-Fi',
    prayer: 'Sholat',
    chat: 'Chat',
    settings: 'Pengaturan',
};

// Aksi di PRESS, bukan release, karena pill nav ikut bergerak selama notch
// membuka/menutup: menunggu release membuat tombol sudah pindah dan klik
// dibatalkan. Dedupe 40ms menahan emission ganda untuk double-click.
const PRESS_DEDUPE_MS = 40;

const bindPress = (button, action) => {
    let lastPress = 0;
    button.connect('button-press-event', () => {
        const now = GLib.get_monotonic_time() / 1000;
        if (now - lastPress < PRESS_DEDUPE_MS) return true;
        lastPress = now;
        action();
        return true;
    });
};

const Arrow = (glyph, delta, tooltip) => {
    const button = Widget.Button({
        className: 'dyn-island-nav-btn',
        tooltipText: tooltip,
        child: Widget.Label({ className: 'dyn-island-nav-arrow', label: glyph }),
    });
    bindPress(button, () => stepPage(delta));
    return button;
};

const navigate = name => {
    if (name !== 'media') mediaView.value = 'main';
    // Halaman interaktif bertahan sampai user pindah halaman; halaman
    // read-only kembali ke base setelah pinTimeout.
    pinPage(name, { sticky: isStickyPage(name) });
};

// Satu slot bisa berganti halaman saat jendela 7 ikon bergeser; widget-nya
// tidak dibuat ulang supaya tidak ada alokasi/reparent per pindah halaman.
const TabSlot = () => {
    let name = null;
    const icon = Widget.Label({
        className: 'dyn-island-nav-icon',
        xalign: 0.5,
        yalign: 0.5,
    });
    const button = Widget.Button({
        className: 'dyn-island-nav-tab',
        child: icon,
        visible: false,
    });
    bindPress(button, () => { if (name) navigate(name); });

    return {
        button,
        setName: next => {
            name = next;
            icon.label = ICONS[next] ?? '·';
            button.tooltipText = LABELS[next] ?? next;
            button.visible = true;
            button.show();
        },
        hide: () => {
            name = null;
            button.visible = false;
        },
        setActive: active => {
            button.className = active
                ? 'dyn-island-nav-tab is-active'
                : 'dyn-island-nav-tab';
        },
    };
};

export default () => {
    const slots = Array.from({ length: SLOTS }, () => TabSlot());
    const tabs = Widget.Box({
        className: 'dyn-island-nav-tabs',
        spacing: 8,
        children: slots.map(slot => slot.button),
    });

    const row = Widget.Box({
        className: 'dyn-island-nav-row',
        spacing: 12,
        halign: Gtk.Align.CENTER,
        children: [
            Arrow('\uf053', -1, 'Halaman sebelumnya'),
            tabs,
            Arrow('\uf054', 1, 'Halaman berikutnya'),
        ],
    });

    const nav = Widget.Box({
        className: 'dyn-island-nav',
        halign: Gtk.Align.CENTER,
        valign: Gtk.Align.END,
        children: [row],
    });

    const sync = () => {
        const count = PAGE_ORDER.length;
        const active = Math.max(0, PAGE_ORDER.indexOf(page.value));
        const visible = Math.min(SLOTS, count);
        const start = count <= SLOTS
            ? 0
            : Math.max(0, Math.min(active - Math.floor(visible / 2), count - visible));

        slots.forEach((slot, index) => {
            if (index >= visible) {
                slot.hide();
                return;
            }
            const name = PAGE_ORDER[start + index];
            slot.setName(name);
            slot.setActive(name === PAGE_ORDER[active]);
        });
    };

    sync();
    nav.hook(page, sync);
    nav.set_no_show_all(true);
    return nav;
};
