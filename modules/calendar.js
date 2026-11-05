import GLib from 'gi://GLib';
import Variable from 'resource:///com/github/Aylur/ags/variable.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';
import CONFIG from '../config.js';

// Kalender: satu URL iCal (Google/Outlook "secret address", atau file lokal).
// Parser minimal tapi cukup untuk VEVENT: DTSTART/DTEND/SUMMARY, tanggal
// all-day, TZID, RRULE (DAILY/WEEKLY/MONTHLY/YEARLY + INTERVAL/COUNT/UNTIL/
// BYDAY/BYMONTHDAY), dan EXDATE. Tidak ada OAuth, tidak ada data keluar selain
// mengambil feed yang ditentukan sendiri.

const DIR = `${GLib.get_user_data_dir()}/dynamic-iland`;
const FILE = `${DIR}/calendar.json`;
const DAY_MS = 86400000;
const HORIZON_DAYS = 400;
const LOOKBACK_DAYS = 7;
const MAX_OCCURRENCES = 10000;
const DAY_INDEX = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

export const calendar = Variable({ events: [], next: null, updatedAt: 0, error: '' });

const cfg = () => CONFIG.calendar ?? {};
const LOCAL_URL = `${GLib.get_user_config_dir()}/dynamic-iland/calendar.url`;
const localSource = () => {
    try {
        const [ok, bytes] = GLib.file_get_contents(LOCAL_URL);
        if (!ok) return '';
        return new TextDecoder().decode(bytes).trim();
    } catch (_) {
        return '';
    }
};
// URL secret pribadi tidak boleh masuk repo; file lokal (mode 600)
// menang atas config.js.
const source = () => localSource() || String(cfg().icsUrl ?? '').trim();

const readCache = () => {
    try {
        const [ok, bytes] = GLib.file_get_contents(FILE);
        return ok ? JSON.parse(new TextDecoder().decode(bytes)) : null;
    } catch (_) { return null; }
};

const writeCache = value => {
    try { GLib.mkdir_with_parents(DIR, 0o755); GLib.file_set_contents(FILE, JSON.stringify(value)); } catch (_) { }
};

// ── timezone ─────────────────────────────────────────────────────────────
// ICS memberi waktu lokal + TZID (mis. Asia/Jakarta). Intl dipakai untuk
// mendapatkan offset zona pada instant tersebut; tanpa ini 18:00 Jakarta
// terbaca 18:00 WITA (selisih satu jam).
const formatters = new Map();
const formatterFor = tzid => {
    if (!tzid) return null;
    if (formatters.has(tzid)) return formatters.get(tzid);
    let formatter = null;
    try {
        formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: tzid,
            hour12: false,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
    } catch (_) {
        formatter = null;
    }
    formatters.set(tzid, formatter);
    return formatter;
};

const zoneOffset = (epoch, tzid) => {
    const formatter = formatterFor(tzid);
    if (!formatter) return null;
    const parts = {};
    for (const part of formatter.formatToParts(new Date(epoch)))
        if (part.type !== 'literal') parts[part.type] = part.value;
    const asUtc = Date.UTC(
        Number(parts.year), Number(parts.month) - 1, Number(parts.day),
        Number(parts.hour) % 24, Number(parts.minute), Number(parts.second),
    );
    return asUtc - epoch;
};

const epochFor = (year, month, day, hour, minute, second, tzid) => {
    const wallClock = Date.UTC(year, month - 1, day, hour, minute, second);
    const offset = zoneOffset(wallClock, tzid);
    if (offset === null) return new Date(year, month - 1, day, hour, minute, second).getTime();

    // Iterasi sekali lagi untuk transisi DST: offset pada wall clock yang
    // ditebak bisa berbeda dari offset pada instant sebenarnya.
    let epoch = wallClock - offset;
    for (let i = 0; i < 2; i++) {
        const nextOffset = zoneOffset(epoch, tzid);
        if (nextOffset === null) break;
        const next = wallClock - nextOffset;
        if (next === epoch) break;
        epoch = next;
    }
    return epoch;
};

const parseDateValue = (value, tzid = null) => {
    const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/
        .exec(String(value ?? '').trim());
    if (!match) return null;
    const [, year, month, day, hour = '00', minute = '00', second = '00', utc] = match;
    const allDay = !match[4];
    const args = [+year, +month, +day, +hour, +minute, +second];
    const epoch = utc
        ? Date.UTC(...args)
        : epochFor(...args, tzid);
    return { epoch, allDay };
};

// ── parser properti ──────────────────────────────────────────────────────
const unfold = text => text.replace(/\r?\n[ \t]/g, '');

const parseProperties = block => {
    const list = [];
    for (const line of block.split(/\r?\n/)) {
        const match = /^([A-Z0-9-]+)((?:;[^:]*)?):(.*)$/.exec(line);
        if (match) list.push({ name: match[1], params: match[2], value: match[3] });
    }
    return list;
};

const property = (props, name) => props.find(entry => entry.name === name) ?? null;

const parameter = (entry, key) => {
    if (!entry) return null;
    const match = new RegExp(`;${key}=([^;]+)`, 'i').exec(entry.params ?? '');
    return match ? match[1].replace(/^"|"$/g, '') : null;
};

const parsePropertyDate = entry => {
    if (!entry) return null;
    return parseDateValue(entry.value, parameter(entry, 'TZID'));
};

const unescapeText = value => String(value ?? '')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\[nN]/g, ' ')
    .replace(/\\\\/g, '\\');

const parseRule = value => {
    const rule = {};
    for (const part of String(value ?? '').split(';')) {
        const index = part.indexOf('=');
        if (index <= 0) continue;
        rule[part.slice(0, index).toUpperCase()] = part.slice(index + 1);
    }
    return rule;
};

const ruleNumbers = value => String(value ?? '')
    .split(',')
    .map(item => Number.parseInt(item, 10))
    .filter(Number.isFinite);

const clampInterval = value => {
    const number = Number.parseInt(value, 10);
    return Number.isFinite(number) ? Math.max(1, Math.min(1000, number)) : 1;
};

// ── ekspansi recurrence ──────────────────────────────────────────────────
// Semua occurrence dihitung dari DTSTART supaya COUNT/UNTIL akurat. Yang
// dikembalikan hanya occurrence yang masih relevan (ongoing atau future);
// horizon 400 hari cukup untuk acara tahunan.
const expandStarts = ({ start, duration, rule, exdates, now }) => {
    const windowStart = now - LOOKBACK_DAYS * DAY_MS;
    const windowEnd = now + HORIZON_DAYS * DAY_MS;
    const out = [];
    const seen = new Set();
    const untilEntry = rule?.UNTIL ? parseDateValue(rule.UNTIL) : null;
    const until = untilEntry
        ? untilEntry.epoch + (untilEntry.allDay ? DAY_MS - 1 : 0)
        : Infinity;
    const count = rule?.COUNT ? Math.max(0, Number.parseInt(rule.COUNT, 10)) : Infinity;
    const interval = clampInterval(rule?.INTERVAL);
    const frequency = String(rule?.FREQ ?? '').toUpperCase();

    const keep = occurrence => {
        if (seen.has(occurrence)) return;
        seen.add(occurrence);
        if (occurrence > windowEnd) return;
        if (occurrence + duration < windowStart) return;
        if (exdates?.has(occurrence)) return;
        out.push(occurrence);
    };

    if (!frequency || !['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(frequency)) {
        if (start + duration >= windowStart) out.push(start);
        return out;
    }

    let index = 0;
    if (frequency === 'DAILY') {
        const step = interval * DAY_MS;
        let i = 0;
        if (!Number.isFinite(count)) i = Math.max(0, Math.floor((windowStart - duration - start) / step));
        for (; i < MAX_OCCURRENCES; i++) {
            if (i >= count || index >= MAX_OCCURRENCES) break;
            const occurrence = start + i * step;
            if (occurrence > until || occurrence > windowEnd) break;
            keep(occurrence);
            index++;
        }
        return out;
    }

    if (frequency === 'WEEKLY') {
        const byDay = rule?.BYDAY
            ? [...new Set(String(rule.BYDAY).split(',').map(item => item.trim().slice(-2).toUpperCase()))]
                .filter(key => DAY_INDEX[key] !== undefined)
            : [];
        if (!byDay.length) {
            const step = 7 * interval * DAY_MS;
            let i = 0;
            if (!Number.isFinite(count)) i = Math.max(0, Math.floor((windowStart - duration - start) / step));
            for (; i < MAX_OCCURRENCES; i++) {
                if (i >= count || index >= MAX_OCCURRENCES) break;
                const occurrence = start + i * step;
                if (occurrence > until || occurrence > windowEnd) break;
                keep(occurrence);
                index++;
            }
            return out;
        }

        const startDate = new Date(start);
        const startDay = startDate.getDay();
        const offsets = byDay
            .map(key => DAY_INDEX[key])
            .map(day => (day - startDay + 7) % 7)
            .sort((a, b) => a - b);
        let stopped = false;
        for (let week = 0; week < MAX_OCCURRENCES && !stopped; week++) {
            const weekStart = start + week * 7 * interval * DAY_MS;
            if (weekStart > windowEnd + 7 * DAY_MS) break;
            for (const offset of offsets) {
                const occurrence = weekStart + offset * DAY_MS;
                if (occurrence < start) continue;
                if (occurrence > until || occurrence > windowEnd) { stopped = true; break; }
                if (index >= count || index >= MAX_OCCURRENCES) { stopped = true; break; }
                keep(occurrence);
                index++;
            }
        }
        return out;
    }

    const startDate = new Date(start);
    const baseYear = startDate.getFullYear();
    const baseMonth = startDate.getMonth();
    const baseDay = startDate.getDate();
    const hour = startDate.getHours();
    const minute = startDate.getMinutes();
    const second = startDate.getSeconds();

    if (frequency === 'MONTHLY') {
        const monthDays = rule?.BYMONTHDAY ? ruleNumbers(rule.BYMONTHDAY) : [baseDay];
        let stopped = false;
        for (let step = 0; step < MAX_OCCURRENCES && !stopped; step++) {
            const year = baseYear + Math.floor((baseMonth + step * interval) / 12);
            const month = ((baseMonth + step * interval) % 12 + 12) % 12;
            const monthStart = new Date(year, month, 1, hour, minute, second).getTime();
            if (monthStart > windowEnd) break;
            for (const day of monthDays) {
                const date = day < 0
                    ? new Date(year, month + 1 + day, hour, minute, second)
                    : new Date(year, month, day, hour, minute, second);
                if (date.getMonth() !== month || date.getFullYear() !== year) continue;
                const occurrence = date.getTime();
                if (occurrence < start) continue;
                if (occurrence > until || occurrence > windowEnd) { stopped = true; break; }
                if (index >= count || index >= MAX_OCCURRENCES) { stopped = true; break; }
                keep(occurrence);
                index++;
            }
        }
        return out;
    }

    // YEARLY
    const months = rule?.BYMONTH ? ruleNumbers(rule.BYMONTH) : [baseMonth + 1];
    const monthDays = rule?.BYMONTHDAY ? ruleNumbers(rule.BYMONTHDAY) : [baseDay];
    let stopped = false;
    for (let step = 0; step < MAX_OCCURRENCES && !stopped; step++) {
        const year = baseYear + step * interval;
        const yearStart = new Date(year, 0, 1, hour, minute, second).getTime();
        if (yearStart > windowEnd) break;
        for (const monthNumber of months) {
            for (const day of monthDays) {
                const date = day < 0
                    ? new Date(year, monthNumber + day, hour, minute, second)
                    : new Date(year, monthNumber - 1, day, hour, minute, second);
                if (date.getMonth() !== (monthNumber - 1 + 12) % 12 || date.getFullYear() !== year) continue;
                const occurrence = date.getTime();
                if (occurrence < start) continue;
                if (occurrence > until || occurrence > windowEnd) { stopped = true; break; }
                if (index >= count || index >= MAX_OCCURRENCES) { stopped = true; break; }
                keep(occurrence);
                index++;
            }
            if (stopped) break;
        }
    }
    return out;
};

const parseEvents = (raw, now = Date.now()) => {
    const blocks = unfold(raw).split('BEGIN:VEVENT').slice(1);
    const events = [];
    for (const block of blocks) {
        const body = block.split('END:VEVENT')[0];
        const props = parseProperties(body);
        const startEntry = property(props, 'DTSTART');
        const startValue = parsePropertyDate(startEntry);
        if (!startValue) continue;

        const endEntry = property(props, 'DTEND');
        const endValue = parsePropertyDate(endEntry);
        const allDay = startValue.allDay || /(?:^|;)VALUE=DATE(?:;|$)/i.test(startEntry?.params ?? '');
        let duration = endValue ? endValue.epoch - startValue.epoch : 0;
        if (!(duration > 0)) duration = allDay ? DAY_MS : 30 * 60000;

        const title = unescapeText(property(props, 'SUMMARY')?.value ?? 'Acara');
        const uid = property(props, 'UID')?.value ?? `${startValue.epoch}-${title}`;
        const ruleEntry = property(props, 'RRULE');
        const rule = ruleEntry ? parseRule(ruleEntry.value) : null;

        const exdates = new Set();
        for (const entry of props.filter(item => item.name === 'EXDATE')) {
            const tzid = parameter(entry, 'TZID');
            for (const part of String(entry.value).split(',')) {
                const parsed = parseDateValue(part, tzid);
                if (parsed) exdates.add(parsed.epoch);
            }
        }

        const starts = expandStarts({
            start: startValue.epoch,
            duration,
            rule,
            exdates,
            now,
        });
        for (const start of starts) {
            events.push({
                uid,
                title,
                start,
                end: start + duration,
                allDay,
            });
        }
    }

    const unique = new Map();
    for (const event of events) unique.set(`${event.uid}:${event.start}`, event);
    return [...unique.values()].sort((a, b) => a.start - b.start);
};

export const chooseNext = (events, now = Date.now()) =>
    (events ?? []).find(event => event.end > now) ?? null;

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
        const value = {
            events,
            next: chooseNext(events),
            updatedAt: Date.now(),
            error: '',
        };
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
    if (!next || next.allDay) return;
    const now = Date.now();
    const untilStart = next.start - now;
    // Pengingat hanya untuk acara yang belum mulai, bukan yang sedang berjalan
    // dan bukan all-day (all-day mulai tengah malam dan tidak butuh "10 menit").
    if (untilStart <= 0 || untilStart > 10 * 60 * 1000) return;
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
    // `next` harus pindah ke acara berikutnya begitu acara lama selesai,
    // tanpa menunggu refresh feed berikutnya.
    Utils.interval(30 * 1000, () => {
        const value = calendar.value;
        if (!value?.events?.length) return;
        const next = chooseNext(value.events);
        if ((next?.uid ?? null) === (value.next?.uid ?? null)
            && (next?.start ?? null) === (value.next?.start ?? null)) return;
        calendar.value = { ...value, next };
    });
    refreshCalendar();
}
