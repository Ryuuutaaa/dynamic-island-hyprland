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
        closed: { w: 150, h: 30, r: 14, ear: 10 },
        expanded: { w: 420, h: 140, r: 32, ear: 22 },
        peek: { w: 310, h: 60, r: 19, ear: 13 },
        // halaman lirik lebih lebar (Nusa: 520) karena terbelah dua
        lyrics: { w: 520, h: 140, r: 32, ear: 22 },
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
};
