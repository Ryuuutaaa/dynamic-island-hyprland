#!/usr/bin/env node
// Verifikasi logika murni di renderer/lib/core.js.
//
// Dijalankan di CI tanpa Electron: core.js sengaja tidak punya import `gi://`,
// `fs`, atau `child_process`, jadi bisa dieksekusi dengan Node biasa.
//
// Kalau salah satu nilai berubah, itu tanda algoritma (waktu sholat, iCal,
// pemilihan model) tersentuh — harus disengaja, bukan tidak sengaja.

import {
    computeTimes, nextPrayer, skyFor, formatClock, formatDate,
    formatDateShort, parseIcsEvents, chooseNextEvent, recommendModel,
} from '../src/renderer/lib/core.js';

let failures = 0;

// Kegagalan dicetak dalam format annotation GitHub (`::error::`) supaya
// terlihat di ringkasan run bahkan ketika log job tidak dapat diunduh
// (API 403 untuk non-admin). Tanpa ini, kegagalan hanya berupa "exit 1".
const annotate = message => {
    if (process.env.GITHUB_ACTIONS === 'true')
        console.log(`::error::${String(message).replace(/\n/g, ' ')}`);
};

const check = (label, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) {
        failures += 1;
        annotate(`${label}: harap ${JSON.stringify(expected)}, dapat ${JSON.stringify(actual)}`);
    }
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
    if (!ok) {
        console.log(`       harap: ${JSON.stringify(expected)}`);
        console.log(`       dapat: ${JSON.stringify(actual)}`);
    }
};

const expect = (label, condition, detail = '') => {
    if (!condition) {
        failures += 1;
        annotate(`${label}${detail ? ` — ${detail}` : ''}`);
    }
    console.log(`${condition ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
};

// ── waktu sholat ────────────────────────────────────────────────────────
// Nilai acuan dari mesin pengembang (Denpasar, 22 Nov 2026). Identik dengan
// modules/prayer-calc.js versi AGS.
const DAY = new Date(2026, 10, 22);
// tzOffset dipatok ke +8 (WITA) supaya hasil tidak bergantung pada zona mesin.
// Tanpa ini uji lolos di WITA tetapi gagal di CI yang berjalan di UTC
// (terukur: Subuh 04:25 menjadi 20:25).
const LOCATION = {
    latitude: -8.65,
    longitude: 115.2167,
    method: 'kemenag',
    tzOffset: 8,
};
const times = computeTimes(DAY, LOCATION);

check('jumlah waktu sholat', times.times.length, 5);
check('Subuh', times.times[0].label, '04:25');
check('Dzuhur', times.times[1].label, '12:06');
check('Ashar', times.times[2].label, '15:28');
check('Magrib', times.times[3].label, '18:22');
check('Isya', times.times[4].label, '19:37');
check('sunrise', times.sunrise, 349);
expect('tidak ada error lintang', times.error === null, String(times.error));

// Waktu harus naik monoton dalam satu hari.
const ordered = times.times.every((t, i) => i === 0 || times.times[i - 1].minutes < t.minutes);
expect('waktu tersusun menaik', ordered);

// nextPrayer: sebelum Subuh -> Subuh hari ini.
const beforeFajr = new Date(2026, 10, 22, 3, 0, 0);
check('next sebelum Subuh', nextPrayer(times, beforeFajr)?.key, 'fajr');
// Setelah Isya -> Subuh besok.
const afterIsha = new Date(2026, 10, 22, 21, 0, 0);
const nextDay = nextPrayer(times, afterIsha);
check('next setelah Isya = besok', nextDay?.tomorrow, true);

// ── fase langit ─────────────────────────────────────────────────────────
check('sky malam (02:00)', skyFor(times, 120).phase, 'malam');
check('sky siang (12:00)', skyFor(times, 720).phase, 'dzuhur');
expect('sky punya nilai glow', Array.isArray(skyFor(times, 720).glow));

// ── format tanggal ──────────────────────────────────────────────────────
check('formatClock', formatClock(DAY), '00:00');
check('formatDate', formatDate(DAY), 'Minggu, 22 November');
check('formatDateShort', formatDateShort(DAY), '22 Nov');

// ── iCal ────────────────────────────────────────────────────────────────
const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'UID:uji-1',
    'SUMMARY:Rapat Uji',
    'DTSTART:20261122T090000',
    'DTEND:20261122T100000',
    'LOCATION:Ruang 1',
    'END:VEVENT',
    'END:VCALENDAR',
].join('\r\n');

const events = parseIcsEvents(ics);
check('jumlah event', events.length, 1);
check('judul event', events[0]?.title, 'Rapat Uji');
check('lokasi event', events[0]?.location, 'Ruang 1');
check('jam mulai', new Date(events[0].start).getHours(), 9);
check('durasi 1 jam', events[0].end - events[0].start, 3600000);

// RRULE DAILY harus menghasilkan lebih dari satu kejadian dalam 400 hari.
const dailyIcs = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:uji-rrule',
    'SUMMARY:Harian',
    'DTSTART:20261122T090000',
    'DTEND:20261122T093000',
    'RRULE:FREQ=DAILY;COUNT=5',
    'END:VEVENT',
    'END:VCALENDAR',
].join('\r\n');
const daily = parseIcsEvents(dailyIcs);
expect('RRULE DAILY diperluas', daily.length >= 2, `${daily.length} kejadian`);

// Event yang sudah lewat tidak dipilih sebagai "berikutnya".
const now = Date.parse('2026-11-22T12:00:00');
check('chooseNext melewati event lampau', chooseNextEvent(events, now), null);

// ── pemilihan model Gemini ──────────────────────────────────────────────
const models = [
    'gemini-4-argon',
    'gemini-3.8-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash-image',
    'gemini-3.1-flash-tts',
].map(name => ({ name: `models/${name}`, supportedGenerationMethods: ['generateContent'] }));

check('model ringan terbaru menang', recommendModel(models), 'gemini-3.5-flash-lite');
check('model gambar tidak dipilih',
    recommendModel(['gemini-3.1-flash-image'].map(n => ({ name: `models/${n}`, supportedGenerationMethods: ['generateContent'] }))),
    null);
check('model tanpa generateContent dilewati',
    recommendModel([{ name: 'models/gemini-embedding-2', supportedGenerationMethods: ['embedContent'] }]),
    null);

// ── jalur AGS memakai kode yang SAMA ────────────────────────────────────
// Ini yang mencegah duplikasi kembali muncul: kalau modul AGS (modules/
// prayer-calc.js) berhenti meneruskan ke shared/ dan menyalin ulang logika,
// hasilnya akan menyimpang dan uji ini gagal.
try {
    const ags = await import('../../modules/prayer-calc.js');
    const agsTimes = ags.computeTimes(DAY, LOCATION);
    check('AGS prayer-calc lewat shared/subuh', agsTimes.times[0].label, '04:25');
    check('AGS prayer-calc lewat shared/isya', agsTimes.times[4].label, '19:37');
    expect('AGS dan Electron memakai kode yang sama',
        JSON.stringify(agsTimes.times.map(t => t.label))
        === JSON.stringify(times.times.map(t => t.label)));
} catch (error) {
    expect('AGS prayer-calc dapat dimuat', false, String(error?.message ?? error));
}

try {
    const agsFmt = await import('../../shared/datetime.mjs');
    check('shared/datetime dipakai AGS', agsFmt.formatDate(DAY), 'Minggu, 22 November');
} catch (error) {
    expect('shared/datetime dapat dimuat', false, String(error?.message ?? error));
}

// ── ringkasan ───────────────────────────────────────────────────────────
console.log();
if (failures > 0) {
    console.error(`${failures} pemeriksaan GAGAL`);
    process.exit(1);
}
console.log('semua pemeriksaan lolos');
