import GLib from 'gi://GLib';
import Variable from 'resource:///com/github/Aylur/ags/variable.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';
import * as shared from '../shared/todo.mjs';

// Penyimpanan + notifikasi untuk daftar tugas. Logika (parsing, transformasi
// state, deteksi jatuh tempo) ada di shared/todo.mjs supaya versi AGS dan
// versi Electron memakai kode yang SAMA.

const DIR = `${GLib.get_user_data_dir()}/dynamic-iland`;
const FILE = `${DIR}/todo.json`;

const now = () => GLib.DateTime.new_now_local();
const clock = () => now().format('%H:%M');

export const todo = Variable(shared.emptyState());

function readState() {
    try {
        const [ok, bytes] = GLib.file_get_contents(FILE);
        if (!ok) return shared.emptyState();
        return shared.sanitizeState(JSON.parse(new TextDecoder().decode(bytes)));
    } catch (_) {
        return shared.emptyState();
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
        // dulu cuma console.log: tugas bisa hilang tanpa user tahu
        console.error(`[dyn-island] gagal simpan todo: ${error}`);
        if (!warned) {
            warned = true;
            Utils.execAsync([
                'notify-send', '-a', 'Notch', 'Gagal menyimpan tugas', `${error}`,
            ]).catch(() => { });
        }
        return false;
    }
}

todo.value = readState();

let saveTimer = 0;
const persist = () => {
    if (saveTimer) GLib.source_remove(saveTimer);
    saveTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, () => {
        saveTimer = 0;
        writeState(todo.value);
        return GLib.SOURCE_REMOVE;
    });
};

// ── API publik (bentuknya sama seperti sebelumnya) ──────────────────────

export const normalizeDue = shared.normalizeDue;
export const doneCount = shared.doneCount;
export const totalCount = shared.totalCount;

export function addTask(raw) {
    const result = shared.addTaskFromInput(todo.value, raw);
    if (!result.task) return null;
    todo.value = result.state;
    persist();
    return result.task;
}

export function addTaskWithDue(text, due) {
    const result = shared.addTask(todo.value, text, due);
    if (!result.task) return null;
    todo.value = result.state;
    persist();
    return result.task;
}

export function updateTask(id, text, due) {
    const result = shared.updateTask(todo.value, id, text, due);
    if (!result.task) return null;
    todo.value = result.state;
    persist();
    return result.task;
}

export function toggleTask(id) {
    todo.value = shared.toggleTask(todo.value, id);
    persist();
}

export function removeTask(id) {
    todo.value = shared.removeTask(todo.value, id);
    persist();
}

export function watchTodo() {
    Utils.interval(30000, () => {
        const state = todo.value;
        const due = shared.dueTasks(state, shared.minutesOf(clock()));
        if (!due.length) return;

        todo.value = shared.markNotified(state, due);
        persist();

        for (const task of due) {
            Utils.execAsync(['notify-send', '-a', 'Notch', 'Tugas jatuh tempo', task.text]).catch(() => { });
        }
    });
}

export default todo;
