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
// 1 detik (dua label jam dulu bangun 2x/detik sepanjang waktu).
//
// Rantai ini dulu rapuh: `arm()` dipanggil SETELAH `callback()`, jadi satu
// exception dari callback (atau label yang sudah dihancurkan) menghentikan
// rantai tanpa jejak — jam beku selamanya (terukur: label 14:08 saat jam
// sistem 17:27, proses hidup 24 menit lalu diam). Sekarang callback dibungkus
// try/catch, `arm()` selalu jalan di `finally`, dan ada watchdog 30 detik yang
// menjadwalkan ulang kalau tidak ada tick selama > 65 detik (mis. setelah
// suspend panjang atau source yang hilang).
export function onMinute(callback, bind = null) {
    let dead = false;
    let source = 0;
    let watch = 0;
    let last = Date.now();

    const stop = () => {
        if (!source) return;
        GLib.source_remove(source);
        source = 0;
    };

    const fire = () => {
        if (dead) return;
        try {
            callback();
        } catch (e) {
            console.error('[dyn-island] onMinute callback gagal:', e);
        }
        last = Date.now();
        arm();
    };

    const arm = () => {
        if (dead) return;
        stop();
        const now = GLib.DateTime.new_now_local();
        const wait = (60 - now.get_second()) * 1000
            - Math.floor(now.get_microsecond() / 1000);
        source = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Math.max(250, wait), () => {
            source = 0;
            fire();
            return GLib.SOURCE_REMOVE;
        });
    };

    if (bind) {
        bind.connect('destroy', () => {
            dead = true;
            stop();
            if (watch) {
                GLib.source_remove(watch);
                watch = 0;
            }
        });
    }

    watch = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, 30, () => {
        if (dead) return GLib.SOURCE_REMOVE;
        if (Date.now() - last > 65000) fire();
        return GLib.SOURCE_CONTINUE;
    });

    arm();
}
