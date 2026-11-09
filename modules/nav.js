import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=3.0';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import { page, stepPage, pinPage, mediaView, PAGE_ORDER, isStickyPage } from '../state.js';
import { palette, hexToRgb } from '../theme.js';
import { roundedRect } from '../draw.js';

// Navigasi gaya Poni: tab strip ikon 7 slot yang bergeser mengikuti halaman
// aktif, panah untuk langkah satuan, dan titik halaman kecil di bawahnya saat
// jumlah halaman lebih dari 7. Tujuh slot menjaga lebar pill tetap ±230px di
// kartu 420 tanpa mengubah tinggi nav (24 ikon + 1 + 3 titik = 28px).
const SLOTS = 7;
const DOT = 3;
const DOT_ACTIVE = 8;
const DOT_GAP = 2;
const DOTS_HEIGHT = 3;

const DOT_RGB = hexToRgb(palette.fg);

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

const DOTS_WIDTH = DOT * (PAGE_ORDER.length - 1)
    + DOT_ACTIVE + DOT_GAP * (PAGE_ORDER.length - 1);

// Titik halaman digambar satu per tab yang terlihat, sejajar tepian di
// bawah tab aktif. Lebar widget disesuaikan dengan jumlah tab terlihat supaya
// tidak ada offset seperti sebelumnya.
const Dots = () => {
    let active = 0;
    let visible = SLOTS;
    const tabWidth = 24;
    const tabGap = 4;
    const rowWidth = count => count * tabWidth + (count - 1) * tabGap;

    return Widget.DrawingArea({
        className: 'dyn-island-nav-dots',
        setup: self => {
            self.set_size_request(rowWidth(visible), DOTS_HEIGHT);
            self.setActive = (a, v) => {
                if (a === active && v === visible) return;
                active = a;
                visible = v;
                self.set_size_request(rowWidth(visible), DOTS_HEIGHT);
                self.queue_draw();
            };
        },
        drawFn: (self, cr, width, height) => {
            const y = (height - DOT) / 2;
            for (let i = 0; i < visible; i++) {
                const isActive = i === active;
                const w = isActive ? DOT_ACTIVE : DOT;
                const cx = i * (tabWidth + tabGap) + tabWidth / 2;
                const x = cx - w / 2;
                cr.setSourceRGBA(DOT_RGB[0], DOT_RGB[1], DOT_RGB[2], isActive ? 0.9 : 0.35);
                roundedRect(cr, x, y, w, DOT, DOT / 2);
                cr.fill();
            }
        },
    });
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
    const dots = Dots();
    const slots = Array.from({ length: SLOTS }, () => TabSlot());
    const tabs = Widget.Box({
        className: 'dyn-island-nav-tabs',
        spacing: 4,
        children: slots.map(slot => slot.button),
    });

    const row = Widget.Box({
        className: 'dyn-island-nav-row',
        spacing: 8,
        halign: Gtk.Align.CENTER,
        children: [
            Arrow('\uf053', -1, 'Halaman sebelumnya'),
            tabs,
            Arrow('\uf054', 1, 'Halaman berikutnya'),
        ],
    });

    const nav = Widget.Box({
        className: 'dyn-island-nav',
        vertical: true,
        spacing: 1,
        halign: Gtk.Align.CENTER,
        valign: Gtk.Align.END,
        children: [row, dots],
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

        // titik hanya untuk >7 halaman (fallback sesuai audit)
        const activeVisible = active - start;
        dots.visible = count > SLOTS;
        dots.setActive(activeVisible, visible);
    };

    sync();
    nav.hook(page, sync);
    nav.set_no_show_all(true);
    return nav;
};
