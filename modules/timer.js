import GLib from 'gi://GLib';
import Variable from 'resource:///com/github/Aylur/ags/variable.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';

// Timer bebas + stopwatch, terpisah dari pomodoro (yang punya siklus tetap).
// Hitungan memakai deadline (Date.now()), bukan decrement tiap tick, supaya
// tidak melenceng setelah sleep atau AGS restart. Data disimpan lokal di
// ~/.local/share/dynamic-iland/timer.json.

const DIR = `${GLib.get_user_data_dir()}/dynamic-iland`;
const FILE = `${DIR}/timer.json`;
const CHIME = '/usr/share/sounds/freedesktop/stereo/complete.oga';

export const PRESETS = [1, 3, 5, 10, 15, 25, 45, 60];

export const timer = Variable({
    mode: 'timer',       // 'timer' | 'stopwatch'
    running: false,
    total: 15 * 60,      // detik (timer)
    remaining: 15 * 60,  // detik (timer)
    elapsed: 0,          // detik (stopwatch)
});

const readState = () => {
    try {
        const [ok, bytes] = GLib.file_get_contents(FILE);
        if (!ok) return null;
        return JSON.parse(new TextDecoder().decode(bytes));
    } catch (_) {
        return null;
    }
};

let saveTimer = 0;
const persist = () => {
    if (saveTimer) GLib.source_remove(saveTimer);
    saveTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
        saveTimer = 0;
        const value = timer.value;
        const payload = {
            mode: value.mode,
            running: value.running,
            total: value.total,
            remaining: value.remaining,
            elapsed: value.elapsed,
            endsAtEpoch: value.running && value.mode === 'timer' ? endsAtEpoch : 0,
            startedAtEpoch: value.running && value.mode === 'stopwatch' ? startedAtEpoch : 0,
        };
        try {
            GLib.mkdir_with_parents(DIR, 0o755);
            GLib.file_set_contents(FILE, JSON.stringify(payload));
        } catch (_) { }
        return GLib.SOURCE_REMOVE;
    });
};

let endsAtEpoch = 0;
let startedAtEpoch = 0;
let tickId = 0;

const stopTick = () => {
    if (tickId) GLib.source_remove(tickId);
    tickId = 0;
};

// Tick per detik memanggil publish(..., false): deadline sudah tersimpan saat
// start, jadi tidak perlu menulis file setiap detik.
const publish = (patch, save = true) => {
    timer.value = { ...timer.value, ...patch };
    if (save) persist();
};

const chime = () => {
    if (!GLib.file_test(CHIME, GLib.FileTest.EXISTS)) return;
    Utils.execAsync(['paplay', CHIME]).catch(() => { });
};

const notifyDone = () => {
    const minutes = Math.round(timer.value.total / 60);
    Utils.execAsync([
        'notify-send', '-a', 'Notch',
        'Timer selesai',
        `${minutes} menit habis — klik untuk membuka island.`,
    ]).catch(() => { });
};

// Jangan memanggil stopTick() di sini: kita sedang berada di dalam callback
// sumbernya. Callback tick berhenti sendiri saat running menjadi false.
const finish = () => {
    publish({ running: false, remaining: 0 });
    chime();
    notifyDone();
};

const tick = () => {
    const value = timer.value;
    if (!value.running) return;

    if (value.mode === 'timer') {
        const left = Math.max(0, Math.ceil((endsAtEpoch - Date.now()) / 1000));
        if (left <= 0) {
            finish();
            return;
        }
        if (left !== value.remaining) publish({ remaining: left }, false);
        return;
    }

    const elapsed = Math.max(0, Math.floor((Date.now() - startedAtEpoch) / 1000));
    if (elapsed !== value.elapsed) publish({ elapsed }, false);
};

const startTick = () => {
    stopTick();
    tickId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
        tick();
        if (!timer.value.running) {
            tickId = 0;
            return GLib.SOURCE_REMOVE;
        }
        return GLib.SOURCE_CONTINUE;
    });
};

export function setMode(mode) {
    if (mode !== 'timer' && mode !== 'stopwatch') return;
    stopTick();
    publish({ mode, running: false });
    if (mode === 'timer') publish({ remaining: timer.value.total });
}

export function startTimer(minutes) {
    const parsed = Number(minutes);
    const seconds = Math.max(1, Math.round((Number.isFinite(parsed) ? parsed : 15) * 60));
    stopTick();
    endsAtEpoch = Date.now() + seconds * 1000;
    publish({ mode: 'timer', running: true, total: seconds, remaining: seconds });
    startTick();
}

export function toggleRunning() {
    const value = timer.value;
    if (value.running) {
        const remaining = value.mode === 'timer'
            ? Math.max(0, Math.ceil((endsAtEpoch - Date.now()) / 1000))
            : value.remaining;
        stopTick();
        publish({ running: false, remaining });
        return;
    }

    if (value.mode === 'timer') {
        const left = value.remaining > 0 ? value.remaining : value.total;
        endsAtEpoch = Date.now() + left * 1000;
        publish({ running: true, remaining: left });
    } else {
        startedAtEpoch = Date.now() - value.elapsed * 1000;
        publish({ running: true });
    }
    startTick();
}

export function resetTimer() {
    stopTick();
    const value = timer.value;
    if (value.mode === 'timer') publish({ running: false, remaining: value.total });
    else publish({ running: false, elapsed: 0 });
}

// Dipakai halaman untuk memilih durasi cepat; `minutes` boleh pecahan (uji).
export function applyPreset(minutes) {
    startTimer(minutes);
}

// Stepper ±1 menit; hanya saat timer berhenti. Rentang 1–90 menit supaya
// tombol tidak bisa menghasilkan durasi nol/negatif atau timer seharian.
export function adjustTime(deltaSeconds) {
    const value = timer.value;
    if (value.mode !== 'timer' || value.running) return;
    const total = Math.max(60, Math.min(90 * 60,
        Math.round((value.total + (Number(deltaSeconds) || 0)) / 60) * 60));
    stopTick();
    publish({ running: false, total, remaining: total });
}

export function restoreTimer() {
    const saved = readState();
    if (!saved) return;
    const mode = saved.mode === 'stopwatch' ? 'stopwatch' : 'timer';
    const total = Math.max(1, Number(saved.total) || 15 * 60);
    const remaining = Math.max(0, Math.min(total, Number(saved.remaining) || total));
    const elapsed = Math.max(0, Number(saved.elapsed) || 0);

    if (saved.running && mode === 'timer' && Number(saved.endsAtEpoch)) {
        endsAtEpoch = Number(saved.endsAtEpoch);
        const left = Math.max(0, Math.ceil((endsAtEpoch - Date.now()) / 1000));
        timer.value = {
            mode, running: left > 0, total,
            remaining: left > 0 ? left : 0,
            elapsed: 0,
        };
        if (left > 0) startTick();
        return;
    }

    if (saved.running && mode === 'stopwatch' && Number(saved.startedAtEpoch)) {
        startedAtEpoch = Number(saved.startedAtEpoch);
        timer.value = {
            mode, running: true, total,
            remaining: total,
            elapsed: Math.max(0, Math.floor((Date.now() - startedAtEpoch) / 1000)),
        };
        startTick();
        return;
    }

    timer.value = { mode, running: false, total, remaining, elapsed };
}

export const mmss = seconds => {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    if (hours > 0)
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};
