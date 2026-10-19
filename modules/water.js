import GLib from 'gi://GLib';
import Variable from 'resource:///com/github/Aylur/ags/variable.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';

const DIR = `${GLib.get_user_data_dir()}/dynamic-iland`;
const FILE = `${DIR}/water.json`;

const DEFAULT_GOAL = 1500;    // ml
const DEFAULT_BOTTLE = 250;   // ml per klik "Drink"
const GOAL_MIN = 500;
const GOAL_MAX = 5000;
const GOAL_STEP = 250;
const REMIND_FROM = 8;        // jam mulai pengingat (08:00)
const REMIND_TO = 22;         // jam terakhir yang masih diingatkan (22:00)

const now = () => GLib.DateTime.new_now_local();
const today = () => now().format('%Y-%m-%d');
const hourNow = () => now().get_hour();
const hh = hour => String(hour).padStart(2, '0');

export const lastHours = count => {
    const hour = hourNow();
    const list = [];
    for (let i = count - 1; i >= 0; i--) list.push(hh((hour - i + 24) % 24));
    return list;
};

export const total = state =>
    Object.values(state.log || {}).reduce((sum, ml) => sum + (Number(ml) || 0), 0);

export const percent = state =>
    state.goal > 0 ? Math.min(100, Math.round((total(state) / state.goal) * 100)) : 0;

// 1500 -> "1.5", 1250 -> "1.25", 2000 -> "2"
export const liters = ml => (ml / 1000).toFixed(2).replace(/\.?0+$/, '');

const emptyState = () => ({
    date: today(),
    goal: DEFAULT_GOAL,
    bottle: DEFAULT_BOTTLE,
    log: {},               // { 'HH': ml }
    reminder: true,
    lastReminder: '',      // 'YYYY-MM-DDTHH' supaya tidak dobel per jam
});

const clampGoal = ml =>
    Math.min(GOAL_MAX, Math.max(GOAL_MIN, Math.round(ml / GOAL_STEP) * GOAL_STEP));

function readState() {
    try {
        const [ok, bytes] = GLib.file_get_contents(FILE);
        if (!ok) return emptyState();
        const saved = JSON.parse(new TextDecoder().decode(bytes));
        if (!saved || typeof saved !== 'object') return emptyState();

        // setelan selalu dipertahankan; log hanya kalau masih hari yang sama
        const keep = {
            goal: clampGoal(Number(saved.goal) || DEFAULT_GOAL),
            bottle: Number(saved.bottle) || DEFAULT_BOTTLE,
            reminder: saved.reminder !== false,
            lastReminder: typeof saved.lastReminder === 'string' ? saved.lastReminder : '',
        };
        if (saved.date !== today()) return { ...emptyState(), ...keep };
        return { ...emptyState(), ...keep, date: saved.date, log: saved.log || {} };
    } catch (_) {
        return emptyState();
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
        // dulu cuma console.log: log air bisa hilang tanpa user tahu
        console.error(`[dyn-island] gagal simpan water: ${error}`);
        if (!warned) {
            warned = true;
            Utils.execAsync([
                'notify-send', '-a', 'Notch', 'Gagal menyimpan data air', `${error}`,
            ]).catch(() => { });
        }
        return false;
    }
}

export const water = Variable(readState());

let saveTimer = 0;
const persist = () => {
    if (saveTimer) GLib.source_remove(saveTimer);
    saveTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, () => {
        saveTimer = 0;
        writeState(water.value);
        return GLib.SOURCE_REMOVE;
    });
};

const update = patch => {
    water.value = { ...water.value, ...patch };
    persist();
};

export function drink(amount = null) {
    const state = water.value;
    const ml = Number(amount) > 0 ? Number(amount) : state.bottle;
    const key = hh(hourNow());
    update({ log: { ...state.log, [key]: (state.log[key] || 0) + ml } });
}

export function setGoal(ml) {
    update({ goal: clampGoal(ml) });
}

export function toggleReminder() {
    update({ reminder: !water.value.reminder });
}

export function watchWater() {
    Utils.interval(60000, () => {
        const state = water.value;

        // ganti hari -> reset log harian
        if (state.date !== today()) {
            update({ date: today(), log: {}, lastReminder: '' });
            return;
        }

        if (!state.reminder) return;
        const hour = now().get_hour();
        if (hour < REMIND_FROM || hour > REMIND_TO) return;
        if (percent(state) >= 100) return;

        // satu pengingat per jam (stamp per jam): tidak dobel walau AGS restart,
        // dan tidak mensyaratkan tick tepat di menit ke-0 — jadi tetap jalan
        // setelah suspend/resume.
        const stamp = `${state.date}T${hh(hour)}`;
        if (state.lastReminder === stamp) return;
        update({ lastReminder: stamp });

        Utils.execAsync([
            'notify-send', '-a', 'Notch', 'Waktunya minum',
            `Sudah ${total(state)} ml dari ${state.goal} ml hari ini.`,
        ]).catch(() => { });
    });
}

export default water;
