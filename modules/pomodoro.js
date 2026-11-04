import GLib from 'gi://GLib';
import Variable from 'resource:///com/github/Aylur/ags/variable.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';


// Durasi bisa diubah saat runtime (dipakai juga untuk menguji completion).
// Tiga mode: fokus, istirahat singkat, istirahat panjang (siklus klasik).
export const MODES = {
    focus: { label: 'Waktu fokus', seconds: 25 * 60 },
    break: { label: 'Istirahat singkat', seconds: 5 * 60 },
    longBreak: { label: 'Istirahat panjang', seconds: 15 * 60 },
};

const DIR = `${GLib.get_user_data_dir()}/dynamic-iland`;
const FILE = `${DIR}/pomodoro.json`;

// Sesi fokus harus tetap hidup setelah AGS restart (mis. reload config).
// Disimpan: mode, status jalan, sisa detik, dan batas akhir dalam epoch ms
// supaya sisa waktu ikut berkurang selama AGS mati.
function readState() {
    try {
        const [ok, bytes] = GLib.file_get_contents(FILE);
        if (!ok) return null;
        const saved = JSON.parse(new TextDecoder().decode(bytes));
        const mode = MODES[saved?.mode] ? saved.mode : 'focus';
        const total = MODES[mode].seconds;
        let remaining = Number(saved?.remaining);
        if (!Number.isFinite(remaining) || remaining < 0 || remaining > total) remaining = total;
        let running = !!saved?.running;
        const endsAtEpoch = Number(saved?.endsAtEpoch) || 0;
        if (running && endsAtEpoch > 0) {
            const left = Math.ceil((endsAtEpoch - Date.now()) / 1000);
            if (left <= 0) {
                // habis saat AGS mati: jangan bunyikan chime yang terlambat
                running = false;
                remaining = 0;
            } else {
                remaining = Math.min(total, left);
            }
        }
        return { mode, running, remaining, total };
    } catch (_) {
        return null;
    }
}

const initial = readState();

export const pomodoro = Variable(initial ?? {
    mode: 'focus',
    running: false,
    remaining: MODES.focus.seconds,
    total: MODES.focus.seconds,
});

const CHIME = '/usr/share/sounds/freedesktop/stereo/alarm-clock-elapsed.oga';

// Pemicu kartu OSD di pojok kanan atas (modules/pomodoro-osd.js). Sengaja
// bukan halaman island: dulu notch di tengah ikut mengembang setiap start/pause.
export const pomodoroOsd = Variable({ seq: 0 });

const showOsd = () => {
    pomodoroOsd.value = { seq: pomodoroOsd.value.seq + 1 };
};

let timer = 0;
let endsAtEpoch = 0;
let saveTimer = 0;

function writeState() {
    try {
        GLib.mkdir_with_parents(DIR, 0o755);
        const state = pomodoro.value;
        GLib.file_set_contents(FILE, JSON.stringify({
            mode: state.mode,
            running: state.running,
            remaining: state.remaining,
            endsAtEpoch: state.running ? endsAtEpoch : 0,
        }));
    } catch (error) {
        console.error(`[dyn-island] gagal simpan pomodoro: ${error}`);
    }
}

const persist = () => {
    if (saveTimer) GLib.source_remove(saveTimer);
    saveTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
        saveTimer = 0;
        writeState();
        return GLib.SOURCE_REMOVE;
    });
};

const publish = patch => { pomodoro.value = { ...pomodoro.value, ...patch }; };

const stopTick = () => {
    if (!timer) return;
    GLib.source_remove(timer);
    timer = 0;
};

// Batas waktu absolut (monotonic ms). Menghitung `remaining - 1` per tick
// membuat hitungan melenceng setelah suspend atau main loop tertahan: tick
// berhenti, lalu sisa waktu tidak pernah dikoreksi. Dengan batas absolut,
// sisa waktu selalu dihitung dari jam monotonic sehingga tetap akurat.
let endsAt = 0;

const startTick = () => {
    if (timer) return;
    endsAt = GLib.get_monotonic_time() / 1000 + pomodoro.value.remaining * 1000;
    endsAtEpoch = Date.now() + pomodoro.value.remaining * 1000;
    persist();
    timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
        const current = pomodoro.value;
        if (!current.running) {
            timer = 0;
            return GLib.SOURCE_REMOVE;
        }
        const left = Math.max(0, Math.ceil((endsAt - GLib.get_monotonic_time() / 1000) / 1000));
        if (left <= 0) {
            timer = 0;
            publish({ remaining: 0, running: false });
            complete(current.mode);
            return GLib.SOURCE_REMOVE;
        }
        if (left !== current.remaining) publish({ remaining: left });
        return GLib.SOURCE_CONTINUE;
    });
};

function chime() {
    // dulu .catch(() => {}) tanpa cek: kalau file suara tidak ada, pomodoro
    // selesai tanpa feedback apa pun dan tidak ada jejaknya di log
    if (!GLib.file_test(CHIME, GLib.FileTest.EXISTS)) {
        console.error(`[dyn-island] chime tidak ditemukan: ${CHIME}`);
        return;
    }
    Utils.execAsync(['paplay', CHIME]).catch(error => {
        console.error(`[dyn-island] paplay gagal: ${error}`);
    });
}

function complete(mode) {
    const isFocus = mode === 'focus';
    const nextMode = isFocus ? 'break' : 'focus';
    chime();
    Utils.execAsync([
        'notify-send', '-a', 'Notch',
        isFocus ? 'Fokus selesai' : 'Istirahat selesai',
        isFocus ? 'Waktunya istirahat sebentar.' : 'Siap fokus lagi?',
    ]).catch(() => { });
    setMode(nextMode);
}

export function setMode(mode) {
    if (!MODES[mode]) return;
    stopTick();
    pomodoro.value = {
        mode,
        running: false,
        remaining: MODES[mode].seconds,
        total: MODES[mode].seconds,
    };
    persist();
    showOsd();
}

export function toggleRunning() {
    const current = pomodoro.value;
    if (current.remaining <= 0) {
        // sudah habis: reset lalu langsung mulai — dulu cuma reset (paused),
        // jadi perlu dua klik untuk mulai lagi
        setMode(current.mode);
        publish({ running: true });
        startTick();
        showOsd();
        return;
    }
    const running = !current.running;
    publish({ running });
    showOsd();
    if (running) startTick();
    else {
        stopTick();
        persist();
    }
}

export function reset() {
    setMode(pomodoro.value.mode);
}

// Lanjutkan sesi yang sedang berjalan setelah AGS restart.
if (pomodoro.value.running) startTick();

export default pomodoro;
