import GLib from 'gi://GLib';

const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli',
    'Agustus', 'September', 'Oktober', 'November', 'Desember'];

const dayName = dt => DAYS[dt.get_day_of_week() % 7];
const monthName = dt => MONTHS[dt.get_month() - 1];

export const formatClock = (dt = GLib.DateTime.new_now_local()) => dt.format('%H:%M');

// Nama hari/bulan ditulis sendiri: locale sistem (en_US) tidak menghasilkan
// bahasa Indonesia, sedangkan UI ini berbahasa Indonesia.
export const formatDate = (dt = GLib.DateTime.new_now_local()) =>
    `${dayName(dt)}, ${dt.get_day_of_month()} ${monthName(dt)}`;

// Versi pendek untuk notch tertutup yang sempit ("19 Okt").
export const formatDateShort = (dt = GLib.DateTime.new_now_local()) =>
    `${dt.get_day_of_month()} ${monthName(dt).slice(0, 3)}`;

// Panggil callback tepat saat menit berganti — lebih hemat daripada polling
// 1 detik (dua label jam dulu bangun 2x/detik sepanjang waktu). Timer berhenti
// sendiri saat `bind` dihancurkan.
export function onMinute(callback, bind = null) {
    let dead = false;
    if (bind) bind.connect('destroy', () => { dead = true; });

    const arm = () => {
        const now = GLib.DateTime.new_now_local();
        const wait = (60 - now.get_second()) * 1000
            - Math.floor(now.get_microsecond() / 1000);
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, Math.max(250, wait), () => {
            if (dead) return GLib.SOURCE_REMOVE;
            callback();
            arm();
            return GLib.SOURCE_REMOVE;
        });
    };
    arm();
}
