import Cairo from 'gi://cairo?version=1.0';
import Variable from 'resource:///com/github/Aylur/ags/variable.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';
import { prayer } from './prayer.js';
import { palette, hexToRgb, NOTCH_COLOR, NOTCH_ALPHA } from '../theme.js';

// Background langit notch. Dasar tetap hitam primary (NOTCH_COLOR); fase
// waktu hanya menambah glow rendah-alpha di bagian bawah + bintang. Dzuhur/
// Ashar memakai tint yang sangat tipis supaya primary tetap dominan.
//
// Fase: malam (bintang) -> Subuh (bintang + glow fajar) -> fajar/sunrise
// (warna hangat) -> Dzuhur (tint tipis) -> Ashar (hangat tipis) -> Magrib
// (warna sunset) -> Isya (bintang). Nilai diinterpolasi kontinu, bukan lompat.

const DAWN = [255, 128, 72];
const SUNSET = [255, 96, 64];
const DAY = [86, 118, 166];
const AFTERNOON = [255, 170, 96];

const NIGHT = { glow: DAWN, alpha: 0, stars: 1, phase: 'malam' };

export const sky = Variable(NIGHT);

// Bintang deterministik: posisi tidak berubah tiap redraw.
const STARS = (() => {
    let seed = 0x9e3779b9;
    const rand = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 0xffffffff;
    };
    return Array.from({ length: 28 }, () => ({
        x: 0.04 + rand() * 0.92,
        y: 0.06 + rand() * 0.78,
        r: 0.5 + rand() * 0.8,
        a: 0.12 + rand() * 0.30,
    }));
})();

const nowMinutes = () => {
    // debug fase background: ags -r "globalThis.__prayerNowMinutes = 330"
    const override = globalThis.__prayerNowMinutes;
    if (typeof override === 'number' && Number.isFinite(override)) return override;
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
};

const lerp = (a, b, t) => a + (b - a) * t;

const keyframes = state => {
    const at = Object.fromEntries(state.times.map(t => [t.key, t.minutes]));
    const sunrise = Number.isFinite(state.sunrise) ? state.sunrise : at.fajr + 80;
    return [
        { at: at.fajr, glow: DAWN, alpha: 0.16, stars: 0.85, phase: 'subuh' },
        { at: sunrise, glow: DAWN, alpha: 0.34, stars: 0, phase: 'fajar' },
        { at: at.dhuhr, glow: DAY, alpha: 0.05, stars: 0, phase: 'dzuhur' },
        { at: at.asr, glow: AFTERNOON, alpha: 0.09, stars: 0, phase: 'ashar' },
        { at: at.maghrib, glow: SUNSET, alpha: 0.36, stars: 0, phase: 'magrib' },
        { at: at.isha, glow: SUNSET, alpha: 0, stars: 1, phase: 'isya' },
    ];
};

const sample = (now, frames) => {
    for (let i = 0; i < frames.length - 1; i++) {
        const a = frames[i];
        const b = frames[i + 1];
        if (now < a.at || now > b.at) continue;
        const span = Math.max(1, b.at - a.at);
        const t = Math.max(0, Math.min(1, (now - a.at) / span));
        return {
            glow: [
                Math.round(lerp(a.glow[0], b.glow[0], t)),
                Math.round(lerp(a.glow[1], b.glow[1], t)),
                Math.round(lerp(a.glow[2], b.glow[2], t)),
            ],
            alpha: lerp(a.alpha, b.alpha, t),
            stars: lerp(a.stars, b.stars, t),
            phase: t < 0.5 ? a.phase : b.phase,
        };
    }
    return NIGHT;
};

const refresh = () => {
    const state = prayer.value;
    if (!state?.times?.length) {
        sky.value = NIGHT;
        return;
    }

    const now = nowMinutes();
    const at = state.times;
    const fajr = at[0].minutes;
    const isha = at[4].minutes;

    if (now < fajr || now >= isha) {
        sky.value = NIGHT;
        return;
    }
    sky.value = sample(now, keyframes(state));
};

export const refreshSky = refresh;

export function watchSky() {
    refresh();
    // Warna berubah perlahan; 30 detik cukup halus dan murah.
    Utils.interval(30000, refresh);
}

export const drawSky = (cr, width, height, radius, state) => {
    if (width <= 0 || height <= 0) return;

    const r = Math.max(0, Math.min(Number(radius) || 0, width / 2, height / 2));
    cr.save();
    cr.newPath();
    cr.moveTo(0, 0);
    cr.lineTo(width, 0);
    cr.lineTo(width, height - r);
    if (r > 0) cr.arc(width - r, height - r, r, 0, Math.PI / 2);
    cr.lineTo(r, height);
    if (r > 0) cr.arc(r, height - r, r, Math.PI / 2, Math.PI);
    cr.lineTo(0, 0);
    cr.closePath();
    cr.clip();

    // dasar primary: hitam opaque (CSS notch dibuat transparan)
    const base = hexToRgb(NOTCH_COLOR);
    cr.setSourceRGBA(base[0], base[1], base[2], NOTCH_ALPHA);
    cr.paint();

    if (!state) {
        cr.restore();
        return;
    }

    // glow hangat dari bawah (horizon), transparan di atas
    if (state.alpha > 0.003) {
        const [gr, gg, gb] = state.glow;
        const grad = new Cairo.LinearGradient(0, 0, 0, height);
        grad.addColorStopRGBA(0, gr / 255, gg / 255, gb / 255, 0);
        grad.addColorStopRGBA(0.45, gr / 255, gg / 255, gb / 255, state.alpha * 0.30);
        grad.addColorStopRGBA(1, gr / 255, gg / 255, gb / 255, state.alpha);
        cr.setSource(grad);
        cr.paint();
    }

    if (state.stars > 0.01) {
        const fg = hexToRgb(palette.fg);
        for (const star of STARS) {
            cr.setSourceRGBA(fg[0], fg[1], fg[2], star.a * state.stars);
            cr.arc(star.x * width, star.y * height, star.r, 0, Math.PI * 2);
            cr.fill();
        }
    }

    cr.restore();
};

export default sky;
