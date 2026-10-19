import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Variable from 'resource:///com/github/Aylur/ags/variable.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';

const DIR = `${GLib.get_user_data_dir()}/dynamic-iland`;
const FILE = `${DIR}/shelf.json`;
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|bmp|svg|avif)$/i;

export const shelf = Variable({ items: [] });
export const shelfDragOver = Variable(false);
// Undo satu langkah untuk aksi destruktif (hapus/bersihkan) — file asli tetap
// tidak pernah disentuh, ini hanya mengembalikan daftar di shelf.
export const shelfUndo = Variable({ available: false, label: '' });

let undoState = null;
let undoTimer = 0;

const remember = label => {
    undoState = { items: [...shelf.value.items] };
    shelfUndo.value = { available: true, label };
    if (undoTimer) GLib.source_remove(undoTimer);
    undoTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 8000, () => {
        undoTimer = 0;
        undoState = null;
        shelfUndo.value = { available: false, label: '' };
        return GLib.SOURCE_REMOVE;
    });
};

const baseName = path => GLib.path_get_basename(path);

const toPath = value => {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    if (raw.startsWith('file://')) {
        const [path] = GLib.filename_from_uri(raw);
        return path || '';
    }
    return raw;
};

const stat = path => {
    try {
        const info = Gio.File.new_for_path(path).query_info(
            'standard::size,standard::type', Gio.FileQueryInfoFlags.NONE, null);
        return { size: info.get_size(), folder: info.get_file_type() === Gio.FileType.DIRECTORY, missing: false };
    } catch (_) {
        return { size: 0, folder: false, missing: true };
    }
};

// Label KB/MB mengikuti basis 1000 (bukan 1024) supaya angkanya cocok dengan
// file manager; 0 byte tetap "0 B", bukan string kosong seperti sebelumnya.
export const formatSize = bytes => {
    const size = Number(bytes);
    if (!Number.isFinite(size) || size < 0) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = size;
    let unit = 0;
    while (value >= 1000 && unit < units.length - 1) {
        value /= 1000;
        unit += 1;
    }
    return `${unit === 0 || value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
};

// Kunci dedupe: bentuk path dinormalkan (./, ../, //) supaya berkas yang sama
// tidak masuk dua kali lewat penulisan path yang berbeda. Path yang disimpan
// tetap apa adanya seperti yang di-drop.
const keyOf = path => GLib.canonicalize_filename(path, null);

const describe = (path, id) => {
    const info = stat(path);
    return {
        id,
        name: baseName(path),
        path,
        uri: GLib.filename_to_uri(path, null),
        size: info.size,
        kind: info.folder ? 'folder' : IMAGE_EXT.test(path) ? 'image' : 'file',
        missing: info.missing,
    };
};

function readState() {
    try {
        const [ok, bytes] = GLib.file_get_contents(FILE);
        if (!ok) return { items: [] };
        const saved = JSON.parse(new TextDecoder().decode(bytes));
        const items = Array.isArray(saved?.items) ? saved.items : [];
        return {
            items: items
                .filter(item => item && typeof item.path === 'string' && item.path)
                .map((item, index) => describe(item.path, Number(item.id) || index + 1)),
        };
    } catch (_) {
        return { items: [] };
    }
}

let warned = false;

function writeState(state) {
    try {
        GLib.mkdir_with_parents(DIR, 0o755);
        GLib.file_set_contents(FILE, JSON.stringify(state));
        warned = false;
        return true;
    } catch (error) {
        // dulu cuma console.log: isi shelf bisa hilang tanpa user tahu
        console.error(`[dyn-island] gagal simpan shelf: ${error}`);
        if (!warned) {
            warned = true;
            Utils.execAsync([
                'notify-send', '-a', 'Notch', 'Gagal menyimpan shelf', `${error}`,
            ]).catch(() => { });
        }
        return false;
    }
}

shelf.value = readState();

let saveTimer = 0;
const persist = () => {
    if (saveTimer) GLib.source_remove(saveTimer);
    saveTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, () => {
        saveTimer = 0;
        writeState(shelf.value);
        return GLib.SOURCE_REMOVE;
    });
};

// Shelf menyimpan referensi ke file asli (bukan salinan) supaya tidak
// menduplikasi data milik user. Item yang file-nya sudah hilang ditandai
// `missing` dan ditampilkan redup.
export function addPaths(paths) {
    const list = (Array.isArray(paths) ? paths : [paths]).map(toPath).filter(Boolean);
    if (!list.length) return [];

    const state = shelf.value;
    const known = new Set(state.items.map(item => keyOf(item.path)));
    let nextId = state.items.reduce((max, item) => Math.max(max, item.id), 0) + 1;
    const added = [];

    for (const path of list) {
        const key = keyOf(path);
        if (known.has(key)) continue;
        added.push(describe(path, nextId++));
        known.add(key);
    }

    if (!added.length) return [];
    shelf.value = { ...state, items: [...state.items, ...added] };
    persist();
    return added;
}

export function removeItem(id) {
    const state = shelf.value;
    const item = state.items.find(entry => entry.id === id);
    if (!item) return;
    remember(`"${item.name}" dihapus`);
    shelf.value = { ...state, items: state.items.filter(entry => entry.id !== id) };
    persist();
}

export function clearShelf() {
    if (!shelf.value.items.length) return;
    remember(`${shelf.value.items.length} item dibersihkan`);
    shelf.value = { items: [] };
    persist();
}

export function undoLast() {
    if (!undoState) return false;
    shelf.value = { items: undoState.items };
    undoState = null;
    if (undoTimer) {
        GLib.source_remove(undoTimer);
        undoTimer = 0;
    }
    shelfUndo.value = { available: false, label: '' };
    persist();
    return true;
}

export default shelf;
