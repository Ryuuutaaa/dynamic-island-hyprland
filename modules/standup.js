import GLib from 'gi://GLib';
import Variable from 'resource:///com/github/Aylur/ags/variable.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';

// Daily standup: tiga daftar (kemarin, hari ini, blocker) yang hanya disimpan
// lokal di ~/.local/share/dynamic-iland/standup.json. Tidak dikirim ke mana pun;
// dipakai supaya bagian "kemarin" bisa terisi otomatis dari rencana kerja
// hari kerja sebelumnya.

const DIR = `${GLib.get_user_data_dir()}/dynamic-iland`;
const FILE = `${DIR}/standup.json`;
const REMINDED_FILE = `${DIR}/standup-reminded`;

const FIELDS = ['yesterday', 'today', 'blockers'];
const REMINDER_HOUR = 10;
const KEEP_DAYS = 60;

export const MONDAY_TITLE = 'Apa yang kamu kerjakan hari Jumat?';
export const YESTERDAY_TITLE = 'Apa yang kamu kerjakan kemarin?';
export const TODAY_TITLE = 'Apa rencana hari ini?';
export const BLOCKER_TITLE = 'Ada hambatan?';

const isoDay = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const isWorkday = date => date.getDay() >= 1 && date.getDay() <= 5;

const readStore = () => {
    try {
        const [ok, bytes] = GLib.file_get_contents(FILE);
        if (!ok) return {};
        return JSON.parse(new TextDecoder().decode(bytes)) || {};
    } catch (_) {
        return {};
    }
};

const writeStore = store => {
    try {
        GLib.mkdir_with_parents(DIR, 0o755);
        GLib.file_set_contents(FILE, JSON.stringify(store, null, 2));
    } catch (error) {
        console.error('[standup] gagal menyimpan:', error);
    }
};

const entryFor = (store, date) => {
    const keys = Object.keys(store).filter(key => key < date).sort().reverse();
    for (const key of keys) {
        const [year, month, day] = key.split('-').map(Number);
        if (isWorkday(new Date(year, month - 1, day))) return store[key];
    }
    return null;
};

export const titleForDay = day => (day === 1 ? MONDAY_TITLE : YESTERDAY_TITLE);

export const standup = Variable({
    date: '',
    saved: false,
    yesterdayTitle: YESTERDAY_TITLE,
    yesterday: [],
    today: [],
    blockers: [],
    reminderAt: 0,
});

const label = date => `${['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][date.getDay()]}, ${date.getDate()} ${['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'][date.getMonth()]}`;

export function loadStandup() {
    const now = new Date();
    const date = isoDay(now);
    const store = readStore();
    const entry = store[date] || null;
    const previous = entryFor(store, date);
    // riwayat = rencana hari kerja sebelumnya; ini yang mengisi bagian pertama
    const history = previous ? (previous.today?.length ? previous.today : previous.yesterday ?? []) : [];
    standup.value = {
        ...standup.value,
        date,
        dayLabel: label(now),
        saved: !!entry,
        yesterdayTitle: titleForDay(now.getDay()),
        yesterday: entry ? [...entry.yesterday] : [...history],
        today: entry ? [...entry.today] : [],
        blockers: entry ? [...entry.blockers] : [],
    };
    return standup.value;
}

export function addItem(field, text) {
    if (!FIELDS.includes(field)) return false;
    const value = String(text ?? '').trim();
    if (!value) return false;
    const list = standup.value[field] || [];
    if (list.includes(value)) return false;
    standup.value = { ...standup.value, [field]: [...list, value] };
    return true;
}

export function removeItem(field, index) {
    if (!FIELDS.includes(field)) return;
    const list = standup.value[field] || [];
    standup.value = { ...standup.value, [field]: list.filter((_, i) => i !== index) };
}

export function saveStandup() {
    const current = standup.value;
    if (!current.date) loadStandup();
    const store = readStore();
    const value = standup.value;
    store[value.date] = {
        yesterday: value.yesterday,
        today: value.today,
        blockers: value.blockers,
        at: Date.now(),
    };
    const keys = Object.keys(store).sort().slice(-KEEP_DAYS);
    writeStore(Object.fromEntries(keys.map(key => [key, store[key]])));
    standup.value = { ...value, saved: true };
}

export function isFilled() {
    const value = standup.value;
    return value.today.length > 0 || value.saved;
}

const playBell = () => {
    Utils.execAsync(['canberra-gtk-play', '-i', 'bell']).catch(() =>
        Utils.execAsync(['paplay', '/usr/share/sounds/freedesktop/stereo/bell.oga'])
            .catch(() => { }));
};

const notify = () => {
    Utils.execAsync([
        'gdbus', 'call', '--session',
        '--dest', 'org.freedesktop.Notifications',
        '--object-path', '/org/freedesktop/Notifications',
        '--method', 'org.freedesktop.Notifications.Notify',
        'Standup', '0', '',
        "Hey Rafi, it's time for daily standup",
        'Isi kemarin, hari ini, dan blocker — klik untuk membuka.',
        "['default', 'Buka']", '{}', '20000',
    ]).catch(error => console.error('[standup] gagal kirim notifikasi:', error));
};

export function remindNow() {
    playBell();
    notify();
}

const nextReminder = () => {
    const now = new Date();
    const next = new Date(now);
    next.setHours(REMINDER_HOUR, 0, 0, 0);
    if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
    while (!isWorkday(next)) next.setDate(next.getDate() + 1);
    return next;
};

// Penjadwal: Senin-Jumat 10:00. Tanggal terakhir yang sudah diingatkan disimpan
// supaya restart AGS tidak memunculkan pengingat yang sama berulang kali.
const readReminded = () => {
    try {
        const [ok, bytes] = GLib.file_get_contents(REMINDED_FILE);
        return ok ? new TextDecoder().decode(bytes).trim() : '';
    } catch (_) {
        return '';
    }
};

const writeReminded = date => {
    try {
        GLib.mkdir_with_parents(DIR, 0o755);
        GLib.file_set_contents(REMINDED_FILE, date);
    } catch (_) { }
};

let remindedFor = readReminded();

const markReminded = date => {
    remindedFor = date;
    writeReminded(date);
};

export function scheduleStandupReminder() {
    const arm = () => {
        const next = nextReminder();
        standup.value = { ...standup.value, reminderAt: next.getTime() };
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, Math.max(1000, next.getTime() - Date.now()), () => {
            const now = new Date();
            const date = isoDay(now);
            if (isWorkday(now) && !readStore()[date] && remindedFor !== date) {
                markReminded(date);
                remindNow();
            }
            arm();
            return GLib.SOURCE_REMOVE;
        });
    };

    loadStandup();
    arm();

    // pemanggilan pertama di sesi ini: kalau sudah lewat 10:00 dan belum diisi
    const now = new Date();
    const date = isoDay(now);
    if (isWorkday(now) && now.getHours() >= REMINDER_HOUR && !readStore()[date] && remindedFor !== date) {
        markReminded(date);
        Utils.timeout(6000, () => remindNow());
    }
}
