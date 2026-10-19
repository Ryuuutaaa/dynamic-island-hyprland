import GLib from 'gi://GLib';
import Gdk from 'gi://Gdk?version=3.0';
import GdkPixbuf from 'gi://GdkPixbuf';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import { roundedRect } from '../draw.js';

// Album art: pixbuf dimuat & digambar sendiri lewat Cairo, karena
// `border-radius` CSS tidak meng-clip pixbuf GtkImage di GTK3 (sudutnya tetap
// kotak). Semua akses file dibungkus try/catch — cover dari MPRIS bisa bukan
// gambar sama sekali (log AGS: "Couldn't recognize the image file format"),
// dan dulu exception itu membatalkan sisa callback refresh kartu media.
function loadPixbuf(path, size) {
    try {
        if (!path || !GLib.file_test(path, GLib.FileTest.EXISTS)) return null;
        return GdkPixbuf.Pixbuf.new_from_file_at_size(path, size, size);
    } catch (_) {
        return null;
    }
}

export default function Cover({ size = 72, radius = 10 } = {}) {
    let current = '';
    let pixbuf = null;

    const area = Widget.DrawingArea({
        className: 'dyn-island-cover-art',
        setup: self => self.set_size_request(size, size),
        drawFn: (self, cr, width, height) => {
            const box = Math.min(width, height, size);
            if (box <= 0) return;
            roundedRect(cr, 0, 0, box, box, radius);
            cr.clip();

            if (!pixbuf) {
                cr.setSourceRGBA(1, 1, 1, 0.08);
                cr.paint();
                return;
            }
            // art non-persegi (mis. thumbnail video) ditaruh di tengah, tidak
            // dipaksa penuh supaya rasio aslinya tidak berubah.
            // Catatan: binding GJS tidak punya cr.setSourcePixbuf() — pakai
            // helper cairo dari Gdk.
            Gdk.cairo_set_source_pixbuf(
                cr,
                pixbuf,
                (box - pixbuf.get_width()) / 2,
                (box - pixbuf.get_height()) / 2,
            );
            cr.paint();
        },
    });

    area.setPath = next => {
        const path = next ?? '';
        if (path === current) return;
        current = path;
        pixbuf = loadPixbuf(path, size);
        area.queue_draw();
    };

    return area;
}
