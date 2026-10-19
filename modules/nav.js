import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=3.0';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import { page, stepPage, PAGE_ORDER } from '../state.js';
import { palette, hexToRgb } from '../theme.js';
import { roundedRect } from '../draw.js';

const DOT = 4;
const DOT_ACTIVE = 12;
const DOT_GAP = 5;
const DOTS_HEIGHT = 10;
const DOTS_WIDTH =
    DOT * (PAGE_ORDER.length - 1) + DOT_ACTIVE + DOT_GAP * (PAGE_ORDER.length - 1);

const DOT_RGB = hexToRgb(palette.fg);

// 5 titik, yang aktif lebih panjang & lebih terang (gaya Nusa).
// Digambar Cairo dan selalu di tengah tinggi yang diberikan, karena AGS
// menambahkan child ke Box dengan fill=TRUE.
const Dots = () => {
    let active = Math.max(0, PAGE_ORDER.indexOf(page.value));

    return Widget.DrawingArea({
        className: 'dyn-island-nav-dots',
        setup: self => {
            self.set_size_request(DOTS_WIDTH, DOTS_HEIGHT);
            self.setActive = index => {
                if (index < 0 || index === active) return;
                active = index;
                self.queue_draw();
            };
        },
        drawFn: (self, cr, width, height) => {
            const widths = PAGE_ORDER.map((_, i) => (i === active ? DOT_ACTIVE : DOT));
            const total = widths.reduce((sum, w) => sum + w, 0) + DOT_GAP * (widths.length - 1);
            let x = Math.max(0, (width - total) / 2);
            const y = (height - DOT) / 2;

            widths.forEach((w, i) => {
                cr.setSourceRGBA(DOT_RGB[0], DOT_RGB[1], DOT_RGB[2], i === active ? 0.95 : 0.38);
                roundedRect(cr, x, y, w, DOT, DOT / 2);
                cr.fill();
                x += w + DOT_GAP;
            });
        },
    });
};

// Panah aktif saat PRESS, bukan release.
//
// Pill nav di-anchor ke dasar notch, jadi selama notch membuka/menutup pill-nya
// ikut bergerak; kalau aksi menunggu release, tombol sudah pindah dan release
// jatuh di luar tombol -> klik dibatalkan (ini penyebab "next kadang tidak
// bekerja"). Dengan aksi di press, yang diklik adalah posisi yang terlihat saat
// itu juga. return true menelan event supaya GtkButton tidak ikut memproses dan
// memicu aksi kedua saat release.
//
// Dedupe: untuk klik kedua dalam satu double-click, GDK mengirim BUTTON_PRESS
// *dan* 2BUTTON_PRESS, dan GTK3 memancarkan button-press-event untuk keduanya
// (terukur: 2 klik fisik -> 3 emission, dua di antaranya pada ms yang sama).
// Tanpa dedupe, dua klik cepat = tiga langkah halaman. Field `event.type`
// tidak terbaca di GJS ini, jadi dipakai jarak waktu: emission ganda datang
// ~0ms, sedangkan klik manusia >= 80ms.
const PRESS_DEDUPE_MS = 40;

const Arrow = (glyph, delta, tooltip) => {
    const button = Widget.Button({
        className: 'dyn-island-nav-btn',
        tooltipText: tooltip,
        child: Widget.Label({ className: 'dyn-island-nav-arrow', label: glyph }),
    });
    let lastPress = 0;
    button.connect('button-press-event', () => {
        const now = GLib.get_monotonic_time() / 1000;
        if (now - lastPress < PRESS_DEDUPE_MS) return true;
        lastPress = now;
        stepPage(delta);
        return true;
    });
    return button;
};

export default () => {
    const dots = Dots();

    const nav = Widget.Box({
        className: 'dyn-island-nav',
        // overlay GtkOverlay dialokasikan penuh area -> minta ukuran natural
        // dan taruh di tengah-bawah kartu (gaya Nusa: dots di bawah).
        // Pakai enum Gtk.Align (string 'center' tidak dikonversi gjs).
        halign: Gtk.Align.CENTER,
        valign: Gtk.Align.END,
        spacing: 8,
        children: [Arrow('\uf053', -1, 'Halaman sebelumnya'), dots, Arrow('\uf054', 1, 'Halaman berikutnya')],
        setup: self => self.hook(page, () => {
            if (typeof dots.setActive === 'function')
                dots.setActive(PAGE_ORDER.indexOf(page.value));
        }),
    });

    nav.visible = false;
    return nav;
};
