const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

// Settings disimpan di direktori userData bawaan Electron, yang sudah
// platform-aware: ~/.config (Linux), %APPDATA% (Windows), ~/Library (macOS).

let cache = null;
let filePath = null;
let saveTimer = null;

const defaults = () => ({
    glow: true,
    defaultPage: 'idle',
    notch: { size: 'normal', followFocus: true, perMonitor: false },
    modules: {},
    chatModel: '',
    window: { monitor: null },
});

const clone = value => JSON.parse(JSON.stringify(value));

function resolvePath() {
    if (!filePath) filePath = path.join(app.getPath('userData'), 'settings.json');
    return filePath;
}

function load() {
    try {
        const raw = fs.readFileSync(resolvePath(), 'utf8');
        const saved = JSON.parse(raw);
        cache = { ...defaults(), ...(saved && typeof saved === 'object' ? saved : {}) };
        cache.notch = { ...defaults().notch, ...(saved.notch ?? {}) };
        cache.window = { ...defaults().window, ...(saved.window ?? {}) };
    } catch (_) {
        cache = defaults();
    }
    return cache;
}

function flush() {
    saveTimer = null;
    try {
        fs.mkdirSync(path.dirname(resolvePath()), { recursive: true });
        fs.writeFileSync(resolvePath(), JSON.stringify(cache, null, 2));
    } catch (error) {
        console.error('[settings] gagal menyimpan:', error?.message ?? error);
    }
}

function get(key) {
    if (!cache) load();
    if (!key) return clone(cache);
    return key.split('.').reduce((acc, part) => (acc == null ? acc : acc[part]), cache);
}

function set(patch) {
    if (!cache) load();
    cache = {
        ...cache,
        ...patch,
        notch: { ...cache.notch, ...(patch?.notch ?? {}) },
        window: { ...cache.window, ...(patch?.window ?? {}) },
        modules: { ...cache.modules, ...(patch?.modules ?? {}) },
    };
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 250);
    return clone(cache);
}

module.exports = { load, get, set, resolvePath, defaults };
