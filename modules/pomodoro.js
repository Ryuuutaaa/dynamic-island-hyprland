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

export const pomodoro = Variable({
    mode: 'focus',
    running: false,
    remaining: MODES.focus.seconds,
    total: MODES.focus.seconds,
});

const CHIME = '/usr/share/sounds/freedesktop/stereo/alarm-clock-elapsed.oga';

let timer = 0;

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
}

export function toggleRunning() {
    const current = pomodoro.value;
    if (current.remaining <= 0) {
        // sudah habis: reset lalu langsung mulai — dulu cuma reset (paused),
        // jadi perlu dua klik untuk mulai lagi
        setMode(current.mode);
        publish({ running: true });
        startTick();
        return;
    }
    const running = !current.running;
    publish({ running });
    if (running) startTick();
    else stopTick();
}

export function reset() {
    setMode(pomodoro.value.mode);
}

export default pomodoro;
