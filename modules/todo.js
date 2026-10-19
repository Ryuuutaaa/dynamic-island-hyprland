import GLib from 'gi://GLib';
import Variable from 'resource:///com/github/Aylur/ags/variable.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';

const DIR = `${GLib.get_user_data_dir()}/dynamic-iland`;
const FILE = `${DIR}/todo.json`;

const now = () => GLib.DateTime.new_now_local();
const clock = () => now().format('%H:%M');

export const todo = Variable({ tasks: [] });

function readState() {
    try {
        const [ok, bytes] = GLib.file_get_contents(FILE);
        if (!ok) return { tasks: [] };
        const saved = JSON.parse(new TextDecoder().decode(bytes));
        const tasks = Array.isArray(saved?.tasks) ? saved.tasks : [];
        return {
            tasks: tasks
                .filter(task => task && typeof task.text === 'string')
                .map((task, index) => ({
                    id: Number(task.id) || index + 1,
                    text: task.text,
                    done: !!task.done,
                    due: typeof task.due === 'string' ? task.due : null,
                    notified: !!task.notified,
                })),
        };
    } catch (_) {
        return { tasks: [] };
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

const nextId = state => state.tasks.reduce((max, task) => Math.max(max, task.id), 0) + 1;

// "Beli susu @14:30" -> { text: 'Beli susu', due: '14:30' }
const parse = raw => {
    const text = String(raw ?? '').trim();
    const match = text.match(/^(.*?)\s*@\s*(\d{1,2})[:.](\d{2})\s*$/);
    if (!match) return { text, due: null };
    const hour = Math.min(23, Math.max(0, Number(match[2])));
    const minute = Math.min(59, Math.max(0, Number(match[3])));
    return {
        text: match[1].trim(),
        due: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    };
};

export function addTask(raw) {
    const { text, due } = parse(raw);
    if (!text) return null;
    const state = todo.value;
    const task = { id: nextId(state), text, done: false, due, notified: false };
    todo.value = { ...state, tasks: [...state.tasks, task] };
    persist();
    return task;
}

export function toggleTask(id) {
    const state = todo.value;
    todo.value = {
        ...state,
        tasks: state.tasks.map(task => (task.id === id ? { ...task, done: !task.done } : task)),
    };
    persist();
}

export function removeTask(id) {
    const state = todo.value;
    todo.value = { ...state, tasks: state.tasks.filter(task => task.id !== id) };
    persist();
}

export const doneCount = state => state.tasks.filter(task => task.done).length;
export const totalCount = state => state.tasks.length;

// due yang terlewat (AGS tidur/restart tepat di menit itu) tetap diingatkan
// selama belum lewat sejam; lebih lama dari itu dianggap basi.
const CATCHUP_MINUTES = 60;

const minutesOf = stamp => {
    const [hour, minute] = String(stamp).split(':').map(Number);
    return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : -1;
};

export function watchTodo() {
    Utils.interval(30000, () => {
        const state = todo.value;
        const nowMinutes = minutesOf(clock());
        const due = state.tasks.filter(task => {
            if (task.done || task.notified || !task.due) return false;
            const at = minutesOf(task.due);
            if (at < 0) return false;
            return at <= nowMinutes && nowMinutes - at <= CATCHUP_MINUTES;
        });
        if (!due.length) return;

        todo.value = {
            ...state,
            tasks: state.tasks.map(task => (due.includes(task) ? { ...task, notified: true } : task)),
        };
        persist();

        for (const task of due) {
            Utils.execAsync(['notify-send', '-a', 'Notch', 'Tugas jatuh tempo', task.text]).catch(() => { });
        }
    });
}

export default todo;
