// Perhitungan waktu sholat lokal (tanpa jaringan), mengikuti algoritma
// PrayTimes: posisi matahari (deklinasi + equation of time) lalu sudut waktu
// untuk Subuh/Isya (derajat di bawah horizon), Ashar (panjang bayangan), dan
// Maghrib (sunset 0.833° untuk refraksi + piringan matahari).
//
// Semua waktu dikembalikan sebagai menit lokal; pembulatan ke ATAS (ihtiyat)
// supaya pengingat tidak pernah berbunyi sebelum waktu masuk.

export const METHODS = {
    kemenag: { label: 'Kemenag', fajr: 20, isha: 18 },
    mwl: { label: 'MWL', fajr: 18, isha: 17 },
    'umm-al-qura': { label: 'Umm al-Qura', fajr: 18.5, isha: null, ishaMinutes: 90 },
};

export const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

export const NAMES = {
    fajr: 'Subuh',
    dhuhr: 'Dzuhur',
    asr: 'Ashar',
    maghrib: 'Magrib',
    isha: 'Isya',
};

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

const fixAngle = a => ((a % 360) + 360) % 360;
const fixHour = a => ((a % 24) + 24) % 24;

const julian = (year, month, day) => {
    if (month <= 2) {
        year -= 1;
        month += 12;
    }
    const A = Math.floor(year / 100);
    const B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (year + 4716))
        + Math.floor(30.6001 * (month + 1))
        + day + B - 1524.5;
};

const sunPosition = jd => {
    const D = jd - 2451545.0;
    const g = fixAngle(357.529 + 0.98560028 * D);
    const q = fixAngle(280.459 + 0.98564736 * D);
    const L = fixAngle(q + 1.915 * Math.sin(g * D2R) + 0.020 * Math.sin(2 * g * D2R));
    const e = 23.439 - 0.00000036 * D;
    const RA = Math.atan2(Math.cos(e * D2R) * Math.sin(L * D2R), Math.cos(L * D2R)) / D2R / 15;
    return {
        declination: Math.asin(Math.sin(e * D2R) * Math.sin(L * D2R)) * R2D,
        equation: q / 15 - fixHour(RA),
    };
};

// Sudut waktu (jam) saat matahari berada di ketinggian `angle` derajat.
// Null kalau matahari tidak pernah mencapai sudut itu (lintang ekstrem).
const hourAngle = (angle, lat, declination) => {
    const cosH = (-Math.sin(angle * D2R)
        - Math.sin(declination * D2R) * Math.sin(lat * D2R))
        / (Math.cos(declination * D2R) * Math.cos(lat * D2R));
    if (cosH < -1 || cosH > 1) return null;
    return Math.acos(cosH) / D2R / 15;
};

// untuk uji/verifikasi perhitungan (tidak dipakai UI)
export const solar = { julian, sunPosition, hourAngle };

export const formatMinutes = minutes => {
    if (!Number.isFinite(minutes)) return '—';
    const value = ((Math.round(minutes) % 1440) + 1440) % 1440;
    const hh = String(Math.floor(value / 60)).padStart(2, '0');
    const mm = String(value % 60).padStart(2, '0');
    return `${hh}:${mm}`;
};

export const dateKey = date =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function computeTimes(date, location = {}) {
    const method = METHODS[location.method] ?? METHODS.kemenag;
    const lat = Number(location.latitude ?? -8.65);
    const lng = Number(location.longitude ?? 115.2167);
    const tz = -new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12).getTimezoneOffset() / 60;

    const jd = julian(date.getFullYear(), date.getMonth() + 1, date.getDate());
    const sun = sunPosition(jd);
    const dhuhr = 12 + tz - lng / 15 - sun.equation;

    const fajrAngle = hourAngle(method.fajr, lat, sun.declination);
    const sunriseAngle = hourAngle(0.833, lat, sun.declination);
    const maghribAngle = hourAngle(0.833, lat, sun.declination);
    const asrAltitude = Math.atan(1 / (1 + Math.tan(Math.abs(lat - sun.declination) * D2R))) * R2D;
    const asrAngle = hourAngle(-asrAltitude, lat, sun.declination);
    const ishaAngle = method.isha != null
        ? hourAngle(method.isha, lat, sun.declination)
        : null;

    if ([fajrAngle, sunriseAngle, maghribAngle, asrAngle].some(v => v == null))
        return { date: dateKey(date), times: [], method: method.label, error: 'lintang ekstrem' };

    const hours = {
        fajr: dhuhr - fajrAngle,
        dhuhr,
        asr: dhuhr + asrAngle,
        maghrib: dhuhr + maghribAngle,
        isha: method.isha != null
            ? dhuhr + ishaAngle
            : dhuhr + maghribAngle + (method.ishaMinutes ?? 90) / 60,
    };

    const times = PRAYERS.map(key => {
        const minutes = Math.ceil(hours[key] * 60);
        return { key, name: NAMES[key], minutes, label: formatMinutes(minutes) };
    });

    // sunrise tidak ditampilkan di halaman, tapi dipakai background langit
    // (transisi bintang -> warna fajar).
    const sunrise = Math.ceil((dhuhr - sunriseAngle) * 60);

    return { date: dateKey(date), times, sunrise, method: method.label, error: null };
}

const timestampFor = (date, minutes) => {
    const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
    return midnight.getTime() + minutes * 60000;
};

export function nextPrayer(state, now = new Date()) {
    if (!state?.times?.length) return null;
    const nowMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    const current = state.times.find(t => t.minutes > nowMinutes + 0.01);
    if (current)
        return { ...current, tomorrow: false, timestamp: timestampFor(now, current.minutes) };

    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const nextDay = computeTimes(tomorrow, state.location ?? {});
    const fajr = nextDay.times[0];
    if (!fajr) return null;
    return { ...fajr, tomorrow: true, timestamp: timestampFor(tomorrow, fajr.minutes) };
}
