import GLib from 'gi://GLib';

const WALLUST_COLORS = `${GLib.get_home_dir()}/.config/waybar/wallust/colors-waybar.css`;

const FALLBACK = {
    bg: '#0B0003',
    fg: '#EFEFEF',
    accent: '#7A5E6E',
    accent2: '#BAB4B8',
    muted: '#8C878A',
    // Semantik: tidak ada di palet wallust standar, jadi bisa di-override
    // dengan menambahkan `@define-color danger ...` / `ok ...` di template
    // wallust. Default-nya menjaga keterbacaan di atas notch hitam.
    danger: '#ff8f8f',
    ok: '#3ad17a',
};

function readWallust() {
    const colors = { ...FALLBACK };
    try {
        const [ok, bytes] = GLib.file_get_contents(WALLUST_COLORS);
        if (!ok) return colors;
        const text = new TextDecoder().decode(bytes);
        const pick = (name) => {
            const match = text.match(new RegExp(`@define-color\\s+${name}\\s+([^;]+);`));
            return match ? match[1].trim() : null;
        };
        colors.bg = pick('background') || colors.bg;
        colors.fg = pick('foreground') || colors.fg;
        colors.accent = pick('color9') || colors.accent;
        colors.accent2 = pick('color12') || colors.accent2;
        colors.muted = pick('color4') || colors.muted;
        colors.danger = pick('danger') || colors.danger;
        colors.ok = pick('ok') || colors.ok;
    } catch (_) { }
    return colors;
}

export function rgba(hex, alpha) {
    const [r, g, b] = hexToRgb(hex).map(v => Math.round(v * 255));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function hexToRgb(hex) {
    const raw = String(hex ?? '').trim().replace('#', '');
    const full = raw.length === 3
        ? raw.split('').map(c => c + c).join('')
        : raw;
    // wallust bisa menulis nilai non-hex (nama warna, rgb(...)); tanpa cek ini
    // parseInt menghasilkan NaN -> semua aksen jadi hitam tanpa penjelasan
    if (!/^[0-9a-f]{6}$/i.test(full)) {
        console.error(`[dyn-island] warna tidak valid: "${hex}" — pakai putih`);
        return [1, 1, 1];
    }
    return [
        parseInt(full.slice(0, 2), 16) / 255,
        parseInt(full.slice(2, 4), 16) / 255,
        parseInt(full.slice(4, 6), 16) / 255,
    ];
}

export const palette = readWallust();

// Warna badan notch: hitam murni OPAQUE (mengikuti Nusa), supaya notch selalu
// terbaca sebagai "lubang" di tepi layar dan apa pun di belakangnya (waybar,
// wallpaper) tidak membocor. Sejak ini wallust hanya menggerakkan aksen & teks.
// Dipakai bareng oleh CSS (__BG_SOLID__) dan gambar telinga (Cairo).
export const NOTCH_COLOR = '#000000';
export const NOTCH_ALPHA = 1;

export function buildCss(template) {
    const tokens = {
        __BG__: palette.bg,
        __FG__: palette.fg,
        __ACCENT__: palette.accent,
        __ACCENT2__: palette.accent2,
        __MUTED__: palette.muted,
        __BG_SOLID__: rgba(NOTCH_COLOR, NOTCH_ALPHA),
        __ACCENT_SOFT__: rgba(palette.accent2, 0.18),
        // Permukaan (dulu rgba(255,255,255,...) hardcoded): ikut warna aksen
        // supaya notch nyatu dengan palet wallust, bukan selalu abu netral.
        __SURFACE_DIM__: rgba(palette.accent2, 0.05),
        __SURFACE__: rgba(palette.accent2, 0.12),
        __SURFACE_HOVER__: rgba(palette.accent2, 0.22),
        __SURFACE_STRONG__: rgba(palette.accent2, 0.26),
        __DANGER__: palette.danger,
        __DANGER_SOFT__: rgba(palette.danger, 0.22),
        __OK__: palette.ok,
    };
    let css = template;
    for (const [token, value] of Object.entries(tokens))
        css = css.split(token).join(value);
    return css;
}
