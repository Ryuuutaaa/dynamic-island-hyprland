import GLib from 'gi://GLib';
import Variable from 'resource:///com/github/Aylur/ags/variable.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';
import CONFIG from '../config.js';
import { computeTimes, nextPrayer, dateKey } from './prayer-calc.js';

const DIR = `${GLib.get_user_data_dir()}/dynamic-iland`;
const FILE = `${DIR}/prayer.json`;
// toleransi pengingat kalau AGS baru hidup beberapa menit setelah waktu masuk
const CATCHUP_MINUTES = 15;

export const prayer = Variable({
    date: '',
    city: CONFIG.prayer?.city ?? 'Lokasi',
    method: '',
    times: [],
    next: null,
    error: null,
});

const location = () => ({
    latitude: CONFIG.prayer?.latitude ?? -8.65,
    longitude: CONFIG.prayer?.longitude ?? 115.2167,
    method: CONFIG.prayer?.method ?? 'kemenag',
});

// Satu-satunya data yang perlu dipersistensi: pengingat mana yang sudah
// dikirim hari ini (supaya restart AGS tidak mengirim ulang).
function readState() {
    try {
        const [ok, bytes] = GLib.file_get_contents(FILE);
        if (!ok) return { date: '', notified: [] };
        const saved = JSON.parse(new TextDecoder().decode(bytes));
        return {
            date: typeof saved?.date === 'string' ? saved.date : '',
            notified: Array.isArray(saved?.notified) ? saved.notified : [],
        };
    } catch (_) {
        return { date: '', notified: [] };
    }
}

let persisted = readState();
let warned = false;

function writeState(state) {
    try {
        GLib.mkdir_with_parents(DIR, 0o755);
        GLib.file_set_contents(FILE, JSON.stringify(state));
        warned = false;
    } catch (error) {
        if (!warned) {
            warned = true;
            console.error(`[dyn-island] gagal simpan prayer: ${error}`);
        }
    }
}

const sendNotification = time => {
    const city = CONFIG.prayer?.city ?? 'Lokasi';
    Utils.execAsync([
        'notify-send', '-a', 'Notch',
        `Waktunya ${time.name}`,
        `${time.label} · ${city}`,
    ]).catch(() => { });
};

// Dipakai UI untuk pengujian: `ags -r "globalThis.dynIsland.prayerNotify('maghrib')"`
export const notifyPrayer = key => {
    const time = prayer.value.times?.find(t => t.key === key);
    if (time) sendNotification(time);
};

let current = null;

const refresh = () => {
    const now = new Date();
    const today = dateKey(now);
    const loc = location();

    if (!current || current.date !== today) {
        current = { ...computeTimes(now, loc), location: loc };
        if (persisted.date !== today) {
            persisted = { date: today, notified: [] };
            writeState(persisted);
        }
    } else {
        current.location = loc;
    }

    const nowMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    const catchUp = Number(CONFIG.prayer?.catchUpMinutes ?? CATCHUP_MINUTES);
    if (CONFIG.prayer?.notify !== false) {
        for (const time of current.times) {
            if (persisted.notified.includes(time.key)) continue;
            const late = nowMinutes - time.minutes;
            if (late < 0 || late > catchUp) continue;
            sendNotification(time);
            persisted.notified.push(time.key);
            persisted.date = today;
            writeState(persisted);
            break;
        }
    }

    prayer.value = {
        ...current,
        city: CONFIG.prayer?.city ?? 'Lokasi',
        next: nextPrayer(current, now),
    };
};

export function watchPrayer() {
    refresh();
    // 30 detik: cukup untuk ganti hari dan pengingat; halaman punya ticker 1s
    // sendiri untuk countdown/animasi matahari.
    Utils.interval(30000, refresh);
}

export default prayer;
