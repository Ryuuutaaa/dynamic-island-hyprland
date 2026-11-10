import GLib from 'gi://GLib';
import Variable from 'resource:///com/github/Aylur/ags/variable.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';
import CONFIG from '../config.js';
import { normalizeTime, scheduledEpoch } from './calendar-notes.js';

// Acara lokal per hari. iCal tetap read-only; file ini hanya untuk acara
// yang dibuat dari popup kalender.
// ~/.local/share/dynamic-iland/calendar-events.json
//
// { "YYYY-MM-DD": [ { id, title, time, end, notifiedAt } ] }

const DIR = `${GLib.get_user_data_dir()}/dynamic-iland`;
const FILE = `${DIR}/calendar-events.json`;
const KEEP_DAYS = 400;
const DAY_MS = 86400000;
const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

const validDay = day => /^\d{4}-\d{2}-\d{2}$/.test(String(day ?? ''));

const catchUpMs = () => {
    const minutes = Number(CONFIG.calendar?.noteCatchUpMinutes ?? 60);
    return (Number.isFinite(minutes) ? Math.max(0, minutes) : 60) * 60 * 1000;
};

const dayLabel = (day, now = Date.now()) => {
    const [year, month, date] = String(day).split('-').map(Number);
    const target = new Date(year, month - 1, date);
    const today = new Date(now);
    const start = value => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
    const diff = Math.round((start(target) - start(today)) / DAY_MS);
    if (diff === 0) return 'Hari ini';
    if (diff === 1) return 'Besok';
    return `${DAYS[target.getDay()]}, ${target.getDate()} ${MONTHS[target.getMonth()]}`;
};

const readStore = () => {
    try {
        const [ok, bytes] = GLib.file_get_contents(FILE);
        if (!ok) return {};
        const saved = JSON.parse(new TextDecoder().decode(bytes));
        if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};
        const clean = {};
        for (const [day, events] of Object.entries(saved)) {
            if (!validDay(day) || !Array.isArray(events)) continue;
            const list = events
                .filter(item => item && typeof item.title === 'string' && item.title.trim())
                .map((item, index) => ({
                    id: Number.isFinite(Number(item.id)) ? Number(item.id) : Date.now() + index,
                    title: String(item.title).trim(),
                    time: normalizeTime(item.time),
                    end: normalizeTime(item.end),
                    notifiedAt: Number.isFinite(Number(item.notifiedAt))
                        ? Number(item.notifiedAt) : 0,
                }))
                .filter(item => item.time);
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
        console.error(`[dyn-island] gagal simpan acara kalender: ${error}`);
        if (!warned) {
            warned = true;
            Utils.execAsync(['notify-send', '-a', 'Notch',
                'Gagal menyimpan acara kalender', `${error}`]).catch(() => { });
        }
        return false;
    }
};

const prune = store => {
    const cutoff = new Date(Date.now() - KEEP_DAYS * DAY_MS);
    const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;
    for (const day of Object.keys(store)) {
        if (day < cutoffKey) delete store[day];
    }
    return store;
};

const publish = store => {
    const clean = prune(store);
    writeStore(clean);
    calendarEvents.value = clean;
    return clean;
};

export const calendarEvents = Variable(readStore());

export const eventsFor = day => calendarEvents.value[day] ?? [];

const sortByTime = list => list.sort((a, b) => a.time.localeCompare(b.time));

export function addEvent(day, title, time, end) {
    const cleanTitle = String(title ?? '').replace(/\s+/g, ' ').trim();
    const start = normalizeTime(time);
    if (!validDay(day) || !cleanTitle || !start) return null;

    const event = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        title: cleanTitle,
        time: start,
        end: normalizeTime(end),
        notifiedAt: 0,
    };
    const scheduled = scheduledEpoch(day, start);
    if (Date.now() >= scheduled + catchUpMs()) event.notifiedAt = -1;

    const store = { ...calendarEvents.value };
    store[day] = sortByTime([...(store[day] ?? []), event]);
    publish(store);
    return event;
}

export function updateEvent(day, id, title, time, end) {
    const cleanTitle = String(title ?? '').replace(/\s+/g, ' ').trim();
    const start = normalizeTime(time);
    if (!cleanTitle || !start) return null;

    const store = { ...calendarEvents.value };
    const list = store[day];
    if (!Array.isArray(list)) return null;
    const index = list.findIndex(event => event.id === Number(id));
    if (index < 0) return null;

    const previous = list[index];
    const startChanged = previous.time !== start;
    let notifiedAt = previous.notifiedAt;
    if (startChanged) {
        notifiedAt = 0;
        const scheduled = scheduledEpoch(day, start);
        if (Date.now() >= scheduled + catchUpMs()) notifiedAt = -1;
    }

    const updated = {
        ...previous,
        title: cleanTitle,
        time: start,
        end: normalizeTime(end),
        notifiedAt,
    };
    const next = [...list];
    next[index] = updated;
    store[day] = sortByTime(next);
    publish(store);
    return updated;
}

export function removeEvent(day, id) {
    const store = { ...calendarEvents.value };
    const list = (store[day] ?? []).filter(event => event.id !== Number(id));
    if (list.length) store[day] = list;
    else delete store[day];
    publish(store);
}

export function checkEvents(now = Date.now()) {
    const store = { ...calendarEvents.value };
    const catchUp = catchUpMs();
    let changed = false;

    for (const [day, events] of Object.entries(store)) {
        store[day] = events.map(event => {
            if (event.notifiedAt !== 0) return event;
            const scheduled = scheduledEpoch(day, event.time);
            if (now < scheduled) return event;
            changed = true;
            if (now - scheduled > catchUp) return { ...event, notifiedAt: -1 };

            const range = event.end ? `${event.time}–${event.end}` : event.time;
            Utils.execAsync(['notify-send', '-a', 'Notch', '-i', 'x-office-calendar',
                event.title, `${range} · ${dayLabel(day, now)}`]).catch(() => { });
            return { ...event, notifiedAt: now };
        });
    }

    if (changed) publish(store);
    return changed;
}

export function watchCalendarEvents() {
    calendarEvents.value = readStore();
    checkEvents();
    Utils.interval(30_000, () => checkEvents());
}
