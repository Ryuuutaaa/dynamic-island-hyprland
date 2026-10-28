export default {
    // 'focused' -> notch mengikuti monitor yang sedang fokus
    // angka (0, 1, 2, ...) -> kunci ke satu monitor
    monitor: 'focused',

    // notch nempel di tepi atas layar
    marginTop: 0,

    // GEOMETRI NOTCH (px) — angka mengikuti Nusa:
    // tertutup kecil, membesar saat hover, transient (OSD/notif) pakai peek.
    // r = radius sudut bawah, ear = ukuran telinga.
    geometry: {
        // Rasio 3:1 — sama dengan expanded (420x140) supaya animasi
        // buka/tutup tidak mengubah aspek (dulu 150x30 = 5:1 -> terlihat
        // "stretch" saat menutup).
        closed: { w: 150, h: 50, r: 16, ear: 10 },
        expanded: { w: 420, h: 140, r: 32, ear: 22 },
        // 240x80 = 3:1 supaya transisi closed <-> peek juga seragam.
        peek: { w: 240, h: 80, r: 20, ear: 13 },
        // halaman lirik lebih lebar (Nusa: 520) karena terbelah dua
        lyrics: { w: 520, h: 140, r: 32, ear: 22 },
        // jadwal sholat: busur matahari + 5 waktu sholat butuh ruang lebih
        prayer: { w: 560, h: 140, r: 32, ear: 22 },
    },

    // MOTION (Nusa): width/height .62s cubic-bezier(.34,1.32,.5,1).
    // Radius & telinga ikut tween ukuran (telinga digambar per frame);
    // border-radius sendiri TIDAK bisa dianimasikan di GTK3, jadi nilainya
    // dipasang sekali per state — lihat index.js (animateTo).
    motion: {
        sizeDuration: 620,
        sizeCurve: [0.34, 1.32, 0.5, 1],
    },

    // berapa lama page sementara bertahan (ms)
    osdTimeout: 1600,
    notifyTimeout: 4200,

    // halaman pilihan manual (panah) bertahan sebentar lalu kembali
    pinTimeout: 10000,

    // crossfade antar page di dalam Stack
    transition: 'crossfade',
    transitionDuration: 180,

    // konten: keluar .2s, masuk .32s dengan delay .2s (Nusa)
    contentDelay: 200,
    contentFade: 320,

    // batas karakter sebelum teks dipotong (kartu 420 lebar, peek 310)
    mediaMaxChars: 22,
    notifyMaxChars: 34,

    // JADWAL SHOLAT — dihitung lokal (tanpa jaringan) dari koordinat.
    // Ganti latitude/longitude/city kalau pindah daerah.
    // method: 'kemenag' (Fajr 20°, Isha 18°), 'mwl' (18°/17°),
    //         'umm-al-qura' (18.5°, Isha 90 menit setelah Magrib).
    // catchUpMinutes: pengingat masih dikirim kalau AGS baru hidup beberapa
    // menit setelah waktu masuk (0 = hanya tepat di menit itu).
    prayer: {
        latitude: -8.65,
        longitude: 115.2167,
        city: 'Denpasar',
        method: 'kemenag',
        notify: true,
        catchUpMinutes: 15,
    },
};
