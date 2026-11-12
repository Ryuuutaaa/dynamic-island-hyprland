import GLib from 'gi://GLib';
import GdkPixbuf from 'gi://GdkPixbuf';
import Variable from 'resource:///com/github/Aylur/ags/variable.js';
import CONFIG from '../config.js';

// Warna dominan album art untuk glow notch (ala Poni). Cover diperkecil ke
// 24x24, lalu piksel dikelompokkan per warna 4-bit. Primary dipilih dari
// cluster dengan skor jumlah x saturasi; secondary dari cluster yang hue-nya
// cukup berbeda. Transisi antar cover dibuat halus supaya notch tidak "snap".

export const coverColor = Variable(null);    // primary [r, g, b] 0..1
export const coverPalette = Variable(null);  // { primary, secondary }

const DURATION = 480;
const TICK = 24;

let lastPath = null;
let current = null;
let target = null;
let from = null;
let timer = 0;
let startedAt = 0;

const lerp = (a, b, t) => a + (b - a) * t;
const lerpColor = (a, b, t) => [
    lerp(a[0], b[0], t),
    lerp(a[1], b[1], t),
    lerp(a[2], b[2], t),
];

const lerpPalette = (a, b, t) => {
    if (!a) return b;
    if (!b) return a;
    return {
        primary: lerpColor(a.primary, b.primary, t),
        secondary: lerpColor(a.secondary, b.secondary, t),
    };
};

const publish = palette => {
    coverPalette.value = palette;
    coverColor.value = palette?.primary ?? null;
};

const stopTimer = () => {
    if (timer) {
        GLib.source_remove(timer);
        timer = 0;
    }
};

const animate = () => {
    const now = GLib.get_monotonic_time() / 1000;
    const t = Math.min(1, (now - startedAt) / DURATION);
    const eased = 1 - Math.pow(1 - t, 3);
    current = lerpPalette(from, target, eased);
    publish(current);
    if (t >= 1) {
        current = target;
        publish(target);
        timer = 0;
        return GLib.SOURCE_REMOVE;
    }
    return GLib.SOURCE_CONTINUE;
};

const setPalette = next => {
    stopTimer();
    target = next;

    if (!next) {
        current = null;
        from = null;
        publish(null);
        return;
    }

    if (!current || CONFIG.motion?.reduced) {
        current = next;
        from = null;
        publish(next);
        return;
    }

    from = current;
    startedAt = GLib.get_monotonic_time() / 1000;
    timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, TICK, animate);
};

const hueOf = ([r, g, b]) => {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max === min) return 0;
    const delta = max - min;
    let hue;
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    return ((hue / 6) % 1 + 1) % 1;
};

const hueDistance = (a, b) => {
    const distance = Math.abs(a - b);
    return Math.min(distance, 1 - distance);
};

const extractPalette = path => {
    const pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_scale(path, 24, 24, true);
    if (!pixbuf) return null;

    const pixels = pixbuf.get_pixels();
    const channels = pixbuf.get_n_channels();
    const stride = pixbuf.get_rowstride();
    const width = pixbuf.get_width();
    const height = pixbuf.get_height();
    const buckets = new Map();

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
            const key = `${r >> 4},${g >> 4},${b >> 4}`;
            const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, count: 0, sat: 0 };
            bucket.r += r;
            bucket.g += g;
            bucket.b += b;
            bucket.count += 1;
            bucket.sat += saturation;
            buckets.set(key, bucket);
        }
    }

    if (!buckets.size) return null;

    const list = [...buckets.values()]
        .map(bucket => {
            const color = [
                bucket.r / bucket.count / 255,
                bucket.g / bucket.count / 255,
                bucket.b / bucket.count / 255,
            ];
            const saturation = bucket.sat / bucket.count;
            return {
                color,
                count: bucket.count,
                saturation,
                score: bucket.count * (0.35 + saturation),
            };
        })
        .sort((a, b) => b.score - a.score);

    const primary = list[0].color;
    const primaryHue = hueOf(primary);
    const secondary = list.find(item => item !== list[0]
        && hueDistance(hueOf(item.color), primaryHue) > 0.06)?.color
        ?? list[1]?.color
        ?? primary;

    return { primary, secondary };
};

export function updateCoverColor(path) {
    const next = String(path ?? '');
    if (next === lastPath) return;
    lastPath = next;

    if (!next) {
        setPalette(null);
        return;
    }

    try {
        setPalette(extractPalette(next));
    } catch (_) {
        setPalette(null);
    }
}
