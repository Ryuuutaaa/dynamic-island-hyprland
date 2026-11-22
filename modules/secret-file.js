import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

// Baca/tulis file rahasia lokal (API key, URL kalender privat).
// Semua tulisan memakai FileCreateFlags.PRIVATE supaya file langsung 0600:
// kredensial tidak boleh terbaca user lain di mesin yang sama.

export const readSecret = path => {
    try {
        const [ok, bytes] = GLib.file_get_contents(path);
        if (!ok) return '';
        return new TextDecoder().decode(bytes).trim();
    } catch (_) {
        return '';
    }
};

export const writeSecret = (path, text) => {
    GLib.mkdir_with_parents(GLib.path_get_dirname(path), 0o755);
    const file = Gio.File.new_for_path(path);
    const stream = file.replace(null, false, Gio.FileCreateFlags.PRIVATE, null);
    try {
        stream.write_all(new TextEncoder().encode(text), null);
    } finally {
        stream.close(null);
    }
};

export const removeSecret = path => {
    try {
        Gio.File.new_for_path(path).delete(null);
        return true;
    } catch (_) {
        return false;
    }
};

// Mode file dalam oktal; null kalau file tidak ada.
export const fileMode = path => {
    try {
        const info = Gio.File.new_for_path(path).query_info(
            'unix::mode', Gio.FileQueryInfoFlags.NONE, null);
        return info.get_attribute_uint32('unix::mode') & 0o777;
    } catch (_) {
        return null;
    }
};

// Mask untuk ditampilkan di UI: cukup untuk dikenali pemiliknya tanpa
// membocorkan seluruh kredensial saat layar dilihat orang lain.
export const maskSecret = (value, head = 6, tail = 4) => {
    const text = String(value ?? '');
    if (!text) return '';
    if (text.length <= head + tail + 1) return `${text.slice(0, 2)}${'•'.repeat(6)}`;
    return `${text.slice(0, head)}${'•'.repeat(8)}${text.slice(-tail)}`;
};
