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
    let retryTimer = 0;
    let attempts = 0;

    // Cover MPRIS dicache AGS secara ASYNC: event metadata pertama datang
    // sebelum file cover selesai dicopy (`Gio.File.copy_async`). Percobaan
    // pertama hampir selalu gagal untuk lagu baru. Dulu path langsung ditandai
    // "sudah dimuat" sehingga percobaan berikutnya (setelah file ada) menjadi
    // no-op — cover media tetap kotak kosong sampai AGS restart, sedangkan
    // cover di halaman lirik kebetulan dimuat belakangan. Sekarang kegagalan
    // tidak menyimpan state dan ada retry singkat sebagai jaring pengaman.
    const MAX_ATTEMPTS = 5;

    const stopRetry = () => {
        if (!retryTimer) return;
        GLib.source_remove(retryTimer);
        retryTimer = 0;
    };

    const reload = () => {
        // widget bisa dihancurkan di tengah retry (rebuild window island):
        // queue_draw pada objek disposed hanya memunculkan Gjs-CRITICAL
        if (area.is_destroyed) {
            stopRetry();
            return false;
        }
        pixbuf = loadPixbuf(current, size);
        area.queue_draw();
        return !!pixbuf;
    };

    const scheduleRetry = () => {
        if (retryTimer || attempts >= MAX_ATTEMPTS) return;
        const delay = 120 + attempts * 120;   // 120..600ms, total ~1.8s
        retryTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            retryTimer = 0;
            if (reload()) {
                attempts = 0;
                return GLib.SOURCE_REMOVE;
            }
            attempts += 1;
            scheduleRetry();
            return GLib.SOURCE_REMOVE;
        });
    };

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

        // Path sama: kalau sudah termuat tidak ada yang perlu dilakukan.
        if (path === current) {
            if (pixbuf || !path) return;
            // event `changed('cover-path')` datang setelah copy selesai ->
            // coba muat sekarang, jangan menunggu timer retry
            if (reload()) {
                stopRetry();
                attempts = 0;
                return;
            }
            scheduleRetry();
            return;
        }

        stopRetry();
        attempts = 0;
        current = path;
        if (!path) {
            pixbuf = null;
            area.queue_draw();
            return;
        }
        if (reload()) return;
        scheduleRetry();
    };

    // untuk diagnostik di `ags -r`
    area.getCoverState = () => ({ path: current, loaded: !!pixbuf });
    area.connect('destroy', stopRetry);

    return area;
}
