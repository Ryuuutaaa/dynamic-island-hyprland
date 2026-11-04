import GLib from 'gi://GLib';
import Variable from 'resource:///com/github/Aylur/ags/variable.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';
import CONFIG from '../config.js';

// Kalender: satu URL iCal (Google/Outlook "secret address", atau file lokal).
// Parser minimal tapi cukup untuk VEVENT: DTSTART/DTEND/SUMMARY, tanggal
// all-day, dan TZID lokal. Tidak ada OAuth, tidak ada data keluar selain
// mengambil feed yang kamu tentukan sendiri.

const DIR = `${GLib.get_user_data_dir()}/dynamic-iland`;
const FILE = `${DIR}/calendar.json`;

export const calendar = Variable({ events: [], next: null, updatedAt: 0, error: '' });

const cfg = () => CONFIG.calendar ?? {};
const source = () => String(cfg().icsUrl ?? '').trim();

const readCache = () => {
    try {
        const [ok, bytes] = GLib.file_get_contents(FILE);
        return ok ? JSON.parse(new TextDecoder().decode(bytes)) : null;
    } catch (_) { return null; }
};

const writeCache = value => {
    try { GLib.mkdir_with_parents(DIR, 0o755); GLib.file_set_contents(FILE, JSON.stringify(value)); } catch (_) { }
};

const parseDate = raw => {
    const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(String(raw ?? '').trim());
    if (!match) return null;
    const [, year, month, day, hour = '00', minute = '00', second = '00', utc] = match;
    const args = [+year, +month - 1, +day, +hour, +minute, +second];
    return utc ? new Date(Date.UTC(...args)) : new Date(...args);
};

const unfold = text => text.replace(/\r?\n[ \t]/g, '');
const field = (block, name) => {
    const match = new RegExp(`^${name}[;:](.*)$`, 'm').exec(block);
    if (!match) return null;
    const line = match[1];
    const value = line.includes(':') ? line.slice(line.lastIndexOf(':') + 1) : line;
    return value.trim();
};

const parseEvents = raw => {
    const blocks = unfold(raw).split('BEGIN:VEVENT').slice(1);
    const events = [];
    for (const block of blocks) {
        const start = parseDate(field(block, 'DTSTART'));
        if (!start) continue;
        const end = parseDate(field(block, 'DTEND')) ?? new Date(start.getTime() + 30 * 60 * 1000);
        const title = String(field(block, 'SUMMARY') ?? 'Acara').replace(/\\,/g, ',').replace(/\\n/gi, ' ');
        const uid = String(field(block, 'UID') ?? `${start.toISOString()}-${title}`);
        events.push({ uid, title, start: start.getTime(), end: end.getTime(), allDay: !/T/.test(String(field(block, 'DTSTART') ?? '')) });
    }
    return events.sort((a, b) => a.start - b.start);
};

const pickNext = events => {
    const now = Date.now();
    return events.find(event => event.end >= now - 60_000) ?? null;
};

export async function refreshCalendar() {
    const url = source();
    if (!url) {
        calendar.value = { ...calendar.value, events: [], next: null, error: 'URL belum diisi' };
        return calendar.value;
    }
    try {
        const args = url.startsWith('/')
            ? ['cat', url]
            : ['curl', '-fsS', '--connect-timeout', '6', '--max-time', '20', '-L', url];
        const raw = await Utils.execAsync(args);
        const events = parseEvents(raw);
        const value = { events, next: pickNext(events), updatedAt: Date.now(), error: '' };
        calendar.value = value;
        writeCache(value);
        return value;
    } catch (error) {
        calendar.value = { ...calendar.value, error: String(error?.message ?? error ?? 'gagal') };
        return calendar.value;
    }
}

let notified = '';

const checkReminder = () => {
    const next = calendar.value.next;
    if (!next || next.start - Date.now() > 10 * 60 * 1000) return;
    if (next.start - Date.now() < 0) return;
    if (notified === next.uid + next.start) return;
    notified = next.uid + next.start;
    const at = new Date(next.start);
    Utils.execAsync(['notify-send', '-a', 'Notch', 'Rapat 10 menit lagi',
        `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')} · ${next.title}`]).catch(() => { });
};

export function watchCalendar() {
    const cached = readCache();
    if (cached?.events) calendar.value = { ...cached, error: '' };

    const minutes = Math.max(5, Number(cfg().refreshMinutes) || 30);
    Utils.interval(minutes * 60 * 1000, () => { refreshCalendar(); });
    Utils.interval(60 * 1000, checkReminder);
    refreshCalendar();
}
