import GLib from 'gi://GLib';
import Variable from 'resource:///com/github/Aylur/ags/variable.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';
import CONFIG from '../config.js';

// Catatan/jadwal kalender per hari. Semua data lokal:
// ~/.local/share/dynamic-iland/calendar-notes.json
//
// Store: { "YYYY-MM-DD": [ { id, text, time, notifiedAt } ] }
// - time: "HH:MM" atau null (null -> notifikasi pukul noteDefaultHour)
// - notifiedAt: 0 = belum, >0 = epoch sudah dinotifikasi, -1 = terlewat

const DIR = `${GLib.get_user_data_dir()}/dynamic-iland`;
const FILE = `${DIR}/calendar-notes.json`;
const KEEP_DAYS = 400;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

export const isoDay = date =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const parseDay = day => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day ?? ''));
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(date.getTime()) ? null : date;
};

export const normalizeTime = value => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? '').trim());
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const defaultHour = () => {
    const hour = Number(CONFIG.calendar?.noteDefaultHour ?? 8);
    return Number.isFinite(hour) ? Math.max(0, Math.min(23, Math.round(hour))) : 8;
};

const catchUpMs = () => {
    const minutes = Number(CONFIG.calendar?.noteCatchUpMinutes ?? 60);
    return (Number.isFinite(minutes) ? Math.max(0, minutes) : 60) * 60 * 1000;
};

// Epoch jadwal lokal. time null -> jam default (08:00).
export const scheduledEpoch = (day, time) => {
    const date = parseDay(day);
    if (!date) return 0;
    const normalized = normalizeTime(time);
    const hours = normalized ? Number(normalized.slice(0, 2)) : defaultHour();
    const minutes = normalized ? Number(normalized.slice(3, 5)) : 0;
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(),
        hours, minutes, 0, 0).getTime();
};

const dayLabel = (day, now = Date.now()) => {
    const date = parseDay(day);
    if (!date) return day;
    const today = new Date(now);
    const start = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const diff = Math.round((start(date) - start(today)) / DAY_MS);
    if (diff === 0) return 'Hari ini';
    if (diff === 1) return 'Besok';
    return `${DAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]}`;
};

const readStore = () => {
    try {
        const [ok, bytes] = GLib.file_get_contents(FILE);
        if (!ok) return {};
        const saved = JSON.parse(new TextDecoder().decode(bytes));
        if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};
        const clean = {};
        for (const [day, notes] of Object.entries(saved)) {
            if (!parseDay(day) || !Array.isArray(notes)) continue;
            const list = notes
                .filter(item => item && typeof item.text === 'string' && item.text.trim())
                .map((item, index) => ({
                    id: Number.isFinite(Number(item.id)) ? Number(item.id) : Date.now() + index,
                    text: String(item.text).trim(),
                    time: normalizeTime(item.time),
                    notifiedAt: Number.isFinite(Number(item.notifiedAt))
                        ? Number(item.notifiedAt) : 0,
                }));
            if (list.length) clean[day] = list;
        }
        return clean;
    } catch (_) {
        return {};
    }
};

let warned = false;

const writeStore = store => {
    try {
        GLib.mkdir_with_parents(DIR, 0o755);
        GLib.file_set_contents(FILE, JSON.stringify(store, null, 2));
        warned = false;
        return true;
    } catch (error) {
        console.error(`[dyn-island] gagal simpan catatan kalender: ${error}`);
        if (!warned) {
            warned = true;
            Utils.execAsync(['notify-send', '-a', 'Notch',
                'Gagal menyimpan catatan kalender', `${error}`]).catch(() => { });
        }
        return false;
    }
};

const prune = store => {
    const cutoff = isoDay(new Date(Date.now() - KEEP_DAYS * DAY_MS));
    for (const day of Object.keys(store)) {
        if (day < cutoff) delete store[day];
    }
    return store;
};

const publish = store => {
    const clean = prune(store);
    writeStore(clean);
    calendarNotes.value = clean;
    return clean;
};

export const calendarNotes = Variable(readStore());

export const notesFor = day => calendarNotes.value[day] ?? [];

export function addNote(day, text, time) {
    const date = parseDay(day);
    const cleanText = String(text ?? '').replace(/\s+/g, ' ').trim();
    if (!date || !cleanText) return null;

    const note = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        text: cleanText,
        time: normalizeTime(time),
        notifiedAt: 0,
    };
    const scheduled = scheduledEpoch(day, note.time);
    if (Date.now() >= scheduled + catchUpMs()) note.notifiedAt = -1;

    const store = { ...calendarNotes.value };
    const list = [...(store[day] ?? []), note]
        .sort((a, b) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99'));
    store[day] = list;
    publish(store);
    return note;
}

export function removeNote(day, id) {
    const store = { ...calendarNotes.value };
    const list = (store[day] ?? []).filter(note => note.id !== Number(id));
    if (list.length) store[day] = list;
    else delete store[day];
    publish(store);
}

export function checkNotes(now = Date.now()) {
    const store = { ...calendarNotes.value };
    const catchUp = catchUpMs();
    let changed = false;

    for (const [day, notes] of Object.entries(store)) {
        const updated = notes.map(note => {
            if (note.notifiedAt !== 0) return note;
            const scheduled = scheduledEpoch(day, note.time);
            if (now < scheduled) return note;
            changed = true;
            if (now - scheduled > catchUp) return { ...note, notifiedAt: -1 };

            const time = note.time ?? `${String(defaultHour()).padStart(2, '0')}:00`;
            Utils.execAsync(['notify-send', '-a', 'Notch', '-i', 'x-office-calendar',
                note.text, `${time} · ${dayLabel(day, now)}`]).catch(() => { });
            return { ...note, notifiedAt: now };
        });
        store[day] = updated;
    }

    if (changed) publish(store);
    return changed;
}

export function watchCalendarNotes() {
    calendarNotes.value = readStore();
    checkNotes();
    Utils.interval(30_000, () => checkNotes());
}
