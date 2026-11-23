// Algoritma waktu sholat (PrayTimes).
//
// Logika sesungguhnya ada di `shared/prayer-calc.js` supaya versi AGS dan
// versi Electron memakai kode yang SAMA. Berkas ini hanya meneruskan ekspor,
// sehingga semua pemanggil lama (modules/prayer.js, prayer-page.js,
// desktop-widget.js) tidak perlu diubah.

export {
    METHODS,
    PRAYERS,
    NAMES,
    solar,
    formatMinutes,
    dateKey,
    computeTimes,
    nextPrayer,
} from '../shared/prayer-calc.js';
