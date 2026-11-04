import GdkPixbuf from 'gi://GdkPixbuf';
import Variable from 'resource:///com/github/Aylur/ags/variable.js';

// Warna dominan album art untuk glow notch (ala Poni). Sampel diperkecil ke
// 24x24 lalu dirata-rata dengan bobot saturasi, sambil membuang piksel yang
// terlalu gelap/terang supaya hasilnya tidak jadi abu-abu kusam.

export const coverColor = Variable(null); // null | [r, g, b] (0..1)

let lastPath = null;

export function updateCoverColor(path) {
    const next = String(path ?? '');
    if (next === lastPath) return;
    lastPath = next;

    if (!next) {
        coverColor.value = null;
        return;
    }

    try {
        const pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_scale(next, 24, 24, true);
        if (!pixbuf) {
            coverColor.value = null;
            return;
        }

        const pixels = pixbuf.get_pixels();
        const channels = pixbuf.get_n_channels();
        const stride = pixbuf.get_rowstride();
        const width = pixbuf.get_width();
        const height = pixbuf.get_height();

        let red = 0;
        let green = 0;
        let blue = 0;
        let weightSum = 0;

        for (let y = 0; y < height; y += 2) {
            for (let x = 0; x < width; x += 2) {
                const offset = y * stride + x * channels;
                const r = pixels[offset];
                const g = pixels[offset + 1];
                const b = pixels[offset + 2];
                const max = Math.max(r, g, b);
                const min = Math.min(r, g, b);
                const luminance = (r + g + b) / 3 / 255;
                if (luminance < 0.12 || luminance > 0.92) continue;
                const saturation = max === 0 ? 0 : (max - min) / max;
                const weight = 0.25 + saturation;
                red += r * weight;
                green += g * weight;
                blue += b * weight;
                weightSum += weight;
            }
        }

        if (weightSum <= 0) {
            coverColor.value = null;
            return;
        }

        coverColor.value = [red / weightSum / 255, green / weightSum / 255, blue / weightSum / 255];
    } catch (_) {
        coverColor.value = null;
    }
}
