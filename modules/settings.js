import GLib from 'gi://GLib';
import Variable from 'resource:///com/github/Aylur/ags/variable.js';
import CONFIG from '../config.js';

// Pengaturan yang bisa diubah dari UI, disimpan di
// ~/.config/dynamic-iland/settings.json dan diterapkan di atas config.js.
// File ini dibaca SEBELUM modul lain (lihat urutan import index.js), jadi
// CONFIG.modules / geometry / defaultPage / notch sudah final saat state,
// nav, dan halaman dibangun.

const DIR = `${GLib.get_user_config_dir()}/dynamic-iland`;
const FILE = `${DIR}/settings.json`;

const DEFAULT_PAGE = 'idle';
const PAGE_OPTIONS = ['idle', 'weather', 'stats', 'todo'];
const SIZES = ['normal', 'compact', 'large'];
const INDICATOR_NAMES = ['music', 'pomodoro', 'timer', 'todo', 'water', 'weather', 'date'];
const CLOSED_SIZES = {
    compact: { w: 140, h: 46, r: 14, ear: 9 },
    large: { w: 170, h: 56, r: 18, ear: 11 },
};

const readFile = () => {
    try {
        const [ok, bytes] = GLib.file_get_contents(FILE);
        if (!ok) return {};
        const raw = JSON.parse(new TextDecoder().decode(bytes));
        return raw && typeof raw === 'object' ? raw : {};
    } catch (_) {
        return {};
    }
};

const saved = readFile();
const modules = { ...(CONFIG.modules ?? {}), ...(saved.modules ?? {}) };
const size = SIZES.includes(saved.notch?.size) ? saved.notch.size : 'normal';
const followFocus = saved.notch?.followFocus !== false;
const glowEnabled = saved.glow !== false;
const defaultPage = PAGE_OPTIONS.includes(saved.defaultPage) ? saved.defaultPage : DEFAULT_PAGE;
const mutedApps = Array.isArray(saved.mutedApps)
    ? saved.mutedApps.filter(name => typeof name === 'string' && name.trim())
    : [];
const validIndicators = list => (Array.isArray(list) ? list : [])
    .filter(name => INDICATOR_NAMES.includes(name));
const savedIndicators = validIndicators(saved.closedIndicators);
const configuredIndicators = validIndicators(CONFIG.closedIndicators);
// Semua indikator tetap ada; pengguna hanya mengubah prioritas. Nama yang
// belum ada di file ditambahkan di belakang supaya UI tidak kehilangan baris.
const closedIndicators = [...new Set([
    ...(savedIndicators.length ? savedIndicators : configuredIndicators),
    ...INDICATOR_NAMES,
])];

// Terapkan ke CONFIG sebelum modul lain dievaluasi.
CONFIG.modules = modules;
CONFIG.glow = glowEnabled;
CONFIG.defaultPage = defaultPage;
CONFIG.notch = { size, followFocus };
CONFIG.closedIndicators = closedIndicators;
if (size !== 'normal' && CLOSED_SIZES[size])
    CONFIG.geometry.closed = { ...CLOSED_SIZES[size] };

export const glow = Variable(glowEnabled);

export const settings = Variable({
    modules: { ...modules },
    glow: glowEnabled,
    defaultPage,
    notch: { size, followFocus },
    mutedApps,
    closedIndicators,
});

const sameApp = (a, b) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();

export const isMuted = app =>
    !!(app && (settings.value.mutedApps ?? []).some(name => sameApp(name, app)));

export function muteApp(app) {
    const name = String(app ?? '').trim();
    if (!name || isMuted(name)) return;
    saveSettings({ mutedApps: [...(settings.value.mutedApps ?? []), name] });
}

export function unmuteApp(app) {
    saveSettings({
        mutedApps: (settings.value.mutedApps ?? []).filter(name => !sameApp(name, app)),
    });
}

const write = value => {
    try {
        GLib.mkdir_with_parents(DIR, 0o755);
        GLib.file_set_contents(FILE, JSON.stringify(value, null, 2));
    } catch (error) {
        console.error('[dyn-island] gagal simpan settings:', error);
    }
};

export function saveSettings(patch = {}) {
    const current = settings.value;
    const next = {
        ...current,
        ...patch,
        notch: { ...current.notch, ...(patch.notch ?? {}) },
        modules: { ...current.modules, ...(patch.modules ?? {}) },
        mutedApps: patch.mutedApps ?? current.mutedApps ?? [],
        closedIndicators: patch.closedIndicators ?? current.closedIndicators ?? [],
    };
    settings.value = next;

    // Yang bisa berlaku langsung:
    CONFIG.glow = next.glow !== false;
    CONFIG.defaultPage = next.defaultPage;
    CONFIG.notch = { ...next.notch };
    CONFIG.closedIndicators = [...next.closedIndicators];
    glow.value = next.glow !== false;

    // Modul, ukuran notch tertutup, dan followFocus dibaca saat window
    // dibangun; halaman settings menampilkan catatan restart.
    write(next);
    return next;
}

export const OPTIONS = {
    pages: PAGE_OPTIONS,
    sizes: SIZES,
    sizeLabel: { normal: 'Normal', compact: 'Kecil', large: 'Besar' },
};
