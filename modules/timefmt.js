import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli',
    'Agustus', 'September', 'Oktober', 'November', 'Desember'];

const dayName = dt => DAYS[dt.get_day_of_week() % 7];
const monthName = dt => MONTHS[dt.get_month() - 1];

export const formatClock = (dt = GLib.DateTime.new_now_local()) => dt.format('%H:%M');

// Nama hari/bulan ditulis sendiri: locale sistem (en_US) tidak menghasilkan
// bahasa Indonesia, sedangkan UI ini berbahasa Indonesia.
export const formatDate = (dt = GLib.DateTime.new_now_local()) =>
    `${dayName(dt)}, ${dt.get_day_of_month()} ${monthName(dt)}`;

// Versi pendek untuk notch tertutup yang sempit ("19 Okt").
export const formatDateShort = (dt = GLib.DateTime.new_now_local()) =>
    `${dt.get_day_of_month()} ${monthName(dt).slice(0, 3)}`;

// Satu ticker untuk SEMUA label jam.
//
// Dulu setiap pemanggil punya rantai timer sendiri (jadwal ke batas menit +
// watchdog). Rantai per-pemanggil bisa mati diam-diam — terukur: label jam
// beku di 06:03 saat jam sistem 12:34, padahal timer baru yang didaftarkan di
// proses yang sama tetap fire tepat 12:37:00. Dengan satu ticker: satu timer,
// semua callback dipanggil saat menit berubah, dan error satu callback tidak
// memengaruhi yang lain.
//
// Biaya: satu wakeup per detik; label hanya ditulis ketika menit berubah.
const subscribers = new Set();
const resumeListeners = new Set();
let ticker = 0;
let lastMinute = '';
// Baseline untuk mendeteksi resume tanpa bergantung pada sinyal logind.
let lastWall = 0;
let lastMono = 0;

const notifyAll = (minute) => {
    lastMinute = minute;
    for (const cb of Array.from(subscribers)) {
        try {
            cb();
        } catch (e) {
            console.error('[dyn-island] clock callback gagal:', e);
        }
    }
};

export const refreshClocks = () => {
    notifyAll(GLib.DateTime.new_now_local().format('%H:%M'));
};

const notifyResume = () => {
    for (const cb of Array.from(resumeListeners)) {
        try {
            cb();
        } catch (e) {
            console.error('[dyn-island] resume callback gagal:', e);
        }
    }
};

const handleResume = () => {
    lastWall = Date.now();
    lastMono = GLib.get_monotonic_time() / 1000;
    refreshClocks();
    notifyResume();
};

// Timer GLib memakai CLOCK_MONOTONIC yang BERHENTI selama suspend, sedangkan
// jam dinding tetap berjalan. Selisih kedua delta > 5 detik berarti sistem baru
// bangun (atau jam diubah). Deteksi ini tidak butuh logind, jadi tetap bekerja
// kalau PrepareForSleep terlewat (hibernasi, D-Bus telat, tanpa logind).
const RESUME_JUMP_MS = 5000;

const tick = () => {
    const wall = Date.now();
    const mono = GLib.get_monotonic_time() / 1000;
    if (lastWall && Math.abs((wall - lastWall) - (mono - lastMono)) > RESUME_JUMP_MS) {
        handleResume();
        return GLib.SOURCE_CONTINUE;
    }

    lastWall = wall;
    lastMono = mono;
    const minute = GLib.DateTime.new_now_local().format('%H:%M');
    if (minute !== lastMinute) notifyAll(minute);
    return GLib.SOURCE_CONTINUE;
};

const startTicker = () => {
    if (ticker) return;
    watchSleep();
    lastWall = Date.now();
    lastMono = GLib.get_monotonic_time() / 1000;
    ticker = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, tick);
};

// Setelah resume, source timer bisa ikut "diam" selama tidur. Pasang ulang
// ticker supaya jadwal 1 detiknya bersih, lalu paksa semua label refresh.
const restartTicker = () => {
    if (ticker) {
        const id = ticker;
        ticker = 0;
        GLib.source_remove(id);
    }
    startTicker();
};

let sleepWatch = false;
const watchSleep = () => {
    if (sleepWatch) return;
    sleepWatch = true;
    try {
        Gio.DBus.system.signal_subscribe(
            'org.freedesktop.login1',
            'org.freedesktop.login1.Manager',
            'PrepareForSleep',
            '/org/freedesktop/login1',
            null,
            Gio.DBusSignalFlags.NONE,
            (_c, _sender, _path, _iface, _signal, params) => {
                let asleep = false;
                try { asleep = params.get_child_value(0).get_boolean(); } catch (e) { }
                if (asleep) return;
                restartTicker();
                handleResume();
            });
    } catch (e) {
        // biarkan bisa dicoba lagi di startTicker berikutnya; deteksi drift
        // di ticker tetap menjadi jalur cadangan
        sleepWatch = false;
        console.error('[dyn-island] sleep watcher gagal:', e);
    }
};

export function onMinute(callback, bind = null) {
    startTicker();
    subscribers.add(callback);
    if (bind) {
        bind.connect('destroy', () => subscribers.delete(callback));
    }
}

// Dipanggil setelah sistem bangun dari suspend. Dipakai index.js untuk
// memastikan window island masih hidup dan monitor di-resolve ulang.
export function onResume(callback) {
    startTicker();
    resumeListeners.add(callback);
}
