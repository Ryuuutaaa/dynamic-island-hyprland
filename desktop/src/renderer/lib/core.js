// Inti logika yang TIDAK bergantung pada OS, GUI, atau framework.
//
// Modul ini dipakai bersama oleh versi AGS (Linux/Wayland) dan versi Electron
// (lintas OS). Semua I/O lewat fungsi yang disuntikkan (dependency injection),
// jadi tidak ada import `gi://`, `fs`, atau `child_process` di sini.
//
// Aturan: kalau butuh membaca file/jam/network, terima sebagai parameter.

export const DAY_MS = 86400000;

// ── waktu sholat & format tanggal ───────────────────────────────────────
// Berasal dari shared/ di root repo: kode yang SAMA dipakai versi AGS.
// Dulu bagian ini disalin ke sini dan perlahan menyimpang dari sumbernya
// (terbukti: nilai METHODS dan julian() tidak lagi identik byte-per-byte).
export {
    METHODS,
    PRAYERS,
    NAMES as PRAYER_NAMES,
    solar,
    formatMinutes,
    dateKey,
    computeTimes,
    nextPrayer,
} from '../../shared/prayer-calc.mjs';

export {
    formatClock,
    formatDate,
    formatDateShort,
    dayName,
    monthName,
} from '../../shared/datetime.mjs';

// ── fase langit notch (untuk background) ────────────────────────────────

export const skyNight = { glow: [255, 128, 72], alpha: 0, stars: 1, phase: 'malam' };

const DAWN = [255, 128, 72];
const SUNSET = [255, 96, 64];
const DAY = [86, 118, 166];
const AFTERNOON = [255, 170, 96];
const lerp = (a, b, t) => a + (b - a) * t;

const skyFrames = state => {
    const at = Object.fromEntries(state.times.map(t => [t.key, t.minutes]));
    const sunrise = Number.isFinite(state.sunrise) ? state.sunrise : at.fajr + 80;
    return [
        { at: at.fajr, glow: DAWN, alpha: 0.16, stars: 0.85, phase: 'subuh' },
        { at: sunrise, glow: DAWN, alpha: 0.34, stars: 0, phase: 'fajar' },
        { at: at.dhuhr, glow: DAY, alpha: 0.05, stars: 0, phase: 'dzuhur' },
        { at: at.asr, glow: AFTERNOON, alpha: 0.09, stars: 0, phase: 'ashar' },
        { at: at.maghrib, glow: SUNSET, alpha: 0.36, stars: 0, phase: 'magrib' },
        { at: at.isha, glow: SUNSET, alpha: 0, stars: 1, phase: 'isya' },
    ];
};

const sampleSky = (now, frames) => {
    for (let i = 0; i < frames.length - 1; i++) {
        const a = frames[i];
        const b = frames[i + 1];
        if (now < a.at || now > b.at) continue;
        const span = Math.max(1, b.at - a.at);
        const t = Math.max(0, Math.min(1, (now - a.at) / span));
        return {
            glow: [
                Math.round(lerp(a.glow[0], b.glow[0], t)),
                Math.round(lerp(a.glow[1], b.glow[1], t)),
                Math.round(lerp(a.glow[2], b.glow[2], t)),
            ],
            alpha: lerp(a.alpha, b.alpha, t),
            stars: lerp(a.stars, b.stars, t),
            phase: t < 0.5 ? a.phase : b.phase,
        };
    }
    return skyNight;
};

export const skyFor = (state, minutesNow) => {
    if (!state?.times?.length) return skyNight;
    const fajr = state.times[0].minutes;
    const isha = state.times[4].minutes;
    if (minutesNow < fajr || minutesNow >= isha) return skyNight;
    return sampleSky(minutesNow, skyFrames(state));
};

// ── iCal: parsing + ekspansi RRULE ──────────────────────────────────────
// Dipisah dari calendar.js supaya bisa dipakai versi web tanpa GLib.

const ICS_DAY = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

const unfold = text => String(text ?? '').replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');

const unescapeText = value => String(value ?? '')
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');

// "20260115T090000Z" / "20260115T090000" / "20260115"
export const parseIcsDate = (value, params = '') => {
    const raw = String(value ?? '').trim();
    const allDay = /^\d{8}$/.test(raw);
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(raw);
    if (!m) return null;
    const [, y, mo, d, hh = '0', mi = '0', ss = '0', zulu] = m;
    const parts = [Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mi), Number(ss)];
    // Z = UTC; tanpa Z = waktu lokal TZID (diabaikan: offset diambil dari Date lokal)
    const date = zulu ? new Date(Date.UTC(...parts)) : new Date(...parts);
    return { date, allDay, utc: !!zulu, tzid: /TZID=([^:;]+)/.exec(params)?.[1] ?? null };
};

const dayStart = date => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

const addDays = (date, days) => {
    const next = new Date(date.getTime());
    next.setDate(next.getDate() + days);
    return next;
};

const parseDuration = value => {
    const m = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(value ?? '').trim());
    if (!m) return 0;
    const [, w = 0, d = 0, h = 0, mi = 0, s = 0] = m;
    return ((Number(w) * 7 + Number(d)) * 24 * 60 * 60
        + Number(h) * 3600 + Number(mi) * 60 + Number(s)) * 1000;
};

// Ekspansi RRULE sederhana: DAILY/WEEKLY/MONTHLY/YEARLY + INTERVAL/COUNT/
// UNTIL/BYDAY/BYMONTHDAY. Cukup untuk feed Google Calendar pribadi.
export const expandRecurrence = (start, durationMs, rrule, windowStart, windowEnd, max = 400) => {
    const out = [];
    if (!rrule) {
        if (start.getTime() < windowEnd && start.getTime() + durationMs > windowStart)
            out.push({ start: start.getTime(), end: start.getTime() + durationMs });
        return out;
    }
    const rule = Object.fromEntries(String(rrule).toUpperCase().split(';')
        .map(part => part.split('='))
        .filter(pair => pair.length === 2));
    const interval = Math.max(1, Number(rule.INTERVAL) || 1);
    const count = Number(rule.COUNT) || Infinity;
    const until = rule.UNTIL ? (parseIcsDate(rule.UNTIL)?.date.getTime() ?? Infinity) : Infinity;
    const byDay = (rule.BYDAY ?? '').split(',').filter(Boolean).map(x => ICS_DAY[x.slice(-2)]);
    const byMonthDay = Number(rule.BYMONTHDAY) || null;

    let current = new Date(start.getTime());
    let emitted = 0;
    for (let i = 0; i < max && emitted < count; i++) {
        if (current.getTime() > windowEnd || current.getTime() > until) break;
        if (current.getTime() + durationMs > windowStart) {
            out.push({ start: current.getTime(), end: current.getTime() + durationMs });
            emitted += 1;
        }
        if (rule.FREQ === 'DAILY') current = addDays(current, interval);
        else if (rule.FREQ === 'WEEKLY') {
            if (byDay.length) {
                let moved = false;
                for (let step = 1; step <= 7 && !moved; step++) {
                    const candidate = addDays(current, 1);
                    current = candidate;
                    if (byDay.includes(candidate.getDay())) moved = true;
                }
                if (!moved) current = addDays(current, interval * 7);
            } else current = addDays(current, interval * 7);
        } else if (rule.FREQ === 'MONTHLY') {
            const next = new Date(current.getTime());
            next.setMonth(next.getMonth() + interval);
            if (byMonthDay) next.setDate(byMonthDay);
            current = next;
        } else if (rule.FREQ === 'YEARLY') {
            const next = new Date(current.getTime());
            next.setFullYear(next.getFullYear() + interval);
            current = next;
        } else break;
    }
    return out;
};

export const parseIcsEvents = (text, { windowDays = 400, lookbackDays = 7 } = {}) => {
    const lines = unfold(text).split('\n');
    const events = [];
    const now = Date.now();
    const windowStart = now - lookbackDays * DAY_MS;
    const windowEnd = now + windowDays * DAY_MS;

    let block = null;
    for (const line of lines) {
        if (line.startsWith('BEGIN:VEVENT')) { block = { raw: [] }; continue; }
        if (line.startsWith('END:VEVENT')) {
            if (block) events.push(block.raw);
            block = null;
            continue;
        }
        if (block) block.raw.push(line);
    }

    const parsed = [];
    for (const raw of events) {
        const field = key => {
            for (const line of raw) {
                const m = new RegExp(`^${key}([^:]*):(.*)$`, 'i').exec(line);
                if (m) return { params: m[1], value: m[2] };
            }
            return null;
        };
        const summary = field('SUMMARY');
        const dtStart = field('DTSTART');
        if (!dtStart) continue;
        const start = parseIcsDate(dtStart.value, dtStart.params);
        if (!start) continue;

        const dtEnd = field('DTEND');
        const duration = field('DURATION');
        let durationMs = DAY_MS;
        if (dtEnd) {
            const end = parseIcsDate(dtEnd.value, dtEnd.params);
            if (end) durationMs = Math.max(0, end.date.getTime() - start.date.getTime());
        } else if (duration) {
            durationMs = parseDuration(duration.value);
        }

        const rrule = field('RRULE');
        const occurrences = start.allDay
            ? expandRecurrence(start.date, durationMs, rrule?.value, windowStart, windowEnd)
            // Acara all-day dimensi harinya, bukan jam.
            : expandRecurrence(start.date, durationMs, rrule?.value, windowStart, windowEnd);

        for (const occurrence of occurrences) {
            parsed.push({
                uid: field('UID')?.value ?? `${summary?.value ?? 'event'}-${occurrence.start}`,
                title: unescapeText(summary?.value ?? '(tanpa judul)'),
                start: occurrence.start,
                end: occurrence.end,
                allDay: start.allDay,
                location: unescapeText(field('LOCATION')?.value ?? ''),
            });
        }
    }

    const unique = new Map();
    for (const event of parsed) unique.set(`${event.uid}:${event.start}`, event);
    return [...unique.values()].sort((a, b) => a.start - b.start);
};

export const chooseNextEvent = (events, now = Date.now()) =>
    (events ?? []).find(event => event.end > now) ?? null;

// ── model pemilihan model Gemini ────────────────────────────────────────
// Dipakai versi AGS dan Electron supaya keduanya memilih model yang sama.

const SKIP_MODEL = /(image|imagen|veo|tts|audio|live|native-audio|embedding|embed|robotics|computer-use|deep-research|transcribe|omni|lyria|gemma)/i;
const MODEL_TIER = [
    [/flash-lite/, 300],
    [/flash/, 200],
    [/pro/, 100],
    [/argon/, 60],
];

export const scoreModel = name => {
    const n = String(name).toLowerCase();
    if (SKIP_MODEL.test(n)) return -Infinity;
    let score = 0;
    for (const [pattern, weight] of MODEL_TIER) {
        if (pattern.test(n)) { score += weight; break; }
    }
    const version = /gemini-(\d+)(?:[.-](\d+))?/.exec(n);
    if (version) score += Math.min(90, Number(version[1]) * 10 + Number(version[2] ?? 0));
    if (/preview|experimental|-exp\b/.test(n)) score -= 25;
    if (/-latest\b/.test(n)) score += 15;
    if (/customtools/.test(n)) score -= 10;
    return score;
};

export const recommendModel = models => {
    const usable = (models ?? []).filter(model => {
        const methods = model?.supportedGenerationMethods ?? [];
        return methods.includes('generateContent')
            && !SKIP_MODEL.test(String(model?.name ?? ''));
    });
    const ranked = usable
        .map(model => {
            const id = String(model.name).replace(/^models\//, '');
            return { id, score: scoreModel(id) };
        })
        .filter(item => Number.isFinite(item.score))
        .sort((a, b) => b.score - a.score);
    return ranked[0]?.id ?? null;
};
