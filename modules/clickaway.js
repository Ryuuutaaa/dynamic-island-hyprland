import Cairo from 'gi://cairo?version=1.0';
import Gdk from 'gi://Gdk?version=3.0';
import Gtk from 'gi://Gtk?version=3.0';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import CONFIG from '../config.js';
import { followFocused } from './monitor.js';

// Layer transparan penuh layar yang hanya dipetakan saat island dibuka paksa
// (SUPER+N). Klik di luar badan notch menutup island; klik di dalam notch
// diteruskan ke window island di bawahnya lewat input shape berlubang.
//
// Input shape dipakai (bukan urutan stacking): window ini baru di-map saat
// dibutuhkan, sehingga bisa berada di atas island. Lubang pada input region
// membuat compositor mengirim event di area notch ke surface island.
export default ({ onClose }) => {
    let hole = {
        w: CONFIG.geometry.expanded.w + 2 * CONFIG.geometry.expanded.ear + 2,
        h: CONFIG.geometry.expanded.h + 1,
        y: CONFIG.marginTop,
    };

    const win = Widget.Window({
        name: 'dyn-island-clickaway',
        className: 'dyn-island-clickaway',
        layer: 'top',
        anchor: ['top', 'bottom', 'left', 'right'],
        exclusivity: 'ignore',
        keymode: 'none',
        visible: false,
    });

    const applyShape = () => {
        try {
            const gdkWindow = win.get_window();
            if (!gdkWindow) return;
            const { width, height } = win.get_allocation();
            if (width <= 1 || height <= 1) return;

            const full = new Cairo.RectangleInt();
            full.x = 0;
            full.y = 0;
            full.width = width;
            full.height = height;

            const region = new Cairo.Region();
            region.unionRectangle(full);

            if (hole && hole.w > 0 && hole.h > 0) {
                const cut = new Cairo.RectangleInt();
                cut.x = Math.max(0, Math.round((width - hole.w) / 2));
                cut.y = Math.max(0, Math.round(hole.y ?? 0));
                cut.width = Math.max(0, Math.min(width - cut.x, Math.round(hole.w)));
                cut.height = Math.max(0, Math.min(height - cut.y, Math.round(hole.h)));
                if (cut.width > 0 && cut.height > 0) region.subtractRectangle(cut);
            }

            gdkWindow.input_shape_combine_region(region, 0, 0);
        } catch (error) {
            console.error('[dyn-island] input shape click-away gagal:', error);
        }
    };

    // Ukuran notch berubah saat halaman lirik/sholat/chat dibuka. Lubang
    // dihitung dari tengah window, jadi tidak perlu tahu posisi monitor.
    win.setHole = next => {
        hole = { ...hole, ...next };
        applyShape();
    };

    win.connect('size-allocate', applyShape);
    win.connect('map', applyShape);
    win.connect('button-press-event', () => {
        onClose();
        return true;
    });

    followFocused(win);
    return win;
};
