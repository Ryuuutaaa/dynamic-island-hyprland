// Format tanggal & jam berbahasa Indonesia.
//
// MURNI: tidak ada `gi://GLib`, tidak ada I/O. Menerima `Date` biasa sehingga
// bisa dipakai versi AGS (GJS) maupun versi Electron (Chromium) tanpa
// perbedaan perilaku.
//
// Nama hari/bulan ditulis manual: locale sistem (en_US) tidak menghasilkan
// bahasa Indonesia, sedangkan UI ini berbahasa Indonesia.

const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli',
    'Agustus', 'September', 'Oktober', 'November', 'Desember'];

// Menerima Date, timestamp (ms), atau objek apa pun yang punya
// getFullYear/getMonth. Mengembalikan Date.
export const asDate = value => {
    if (value instanceof Date) return value;
    if (typeof value === 'number') return new Date(value);
    // GLib.DateTime punya get_year()/get_month(), bukan getFullYear().
    if (value && typeof value.get_year === 'function') {
        return new Date(
            value.get_year(),
            value.get_month() - 1,
            value.get_day_of_month(),
            value.get_hour(),
            value.get_minute(),
            value.get_second());
    }
    return new Date();
};

export const dayName = value => DAYS[asDate(value).getDay()];
export const monthName = value => MONTHS[asDate(value).getMonth()];

const pad2 = number => String(number).padStart(2, '0');

export const formatClock = (value = new Date()) => {
    const date = asDate(value);
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
};

export const formatDate = (value = new Date()) => {
    const date = asDate(value);
    return `${dayName(date)}, ${date.getDate()} ${monthName(date)}`;
};

// Versi pendek untuk notch tertutup yang sempit ("19 Okt").
export const formatDateShort = (value = new Date()) => {
    const date = asDate(value);
    return `${date.getDate()} ${monthName(date).slice(0, 3)}`;
};

export const DAY_NAMES = DAYS;
export const MONTH_NAMES = MONTHS;
