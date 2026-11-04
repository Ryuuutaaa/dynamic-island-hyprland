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
        // chat Gemini: riwayat pesan + baris input butuh kartu lebih tinggi
        chat: { w: 520, h: 220, r: 32, ear: 22 },
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

    // ── modul & notch tertutup (prinsip Poni) ──────────────────────
    // Halaman yang ikut navigasi (dot + panah). Yang dimatikan tetap ada di
    // Stack dan tetap bisa muncul lewat showTransient() (OSD/notifikasi),
    // hanya tidak menambah dot dan tidak bisa dicapai panah.
    // 'idle' dan 'media' selalu aktif karena menjadi base page.
    modules: {
        weather: true,
        timer: true,
        stats: true,
        calendar: true,
        pomodoro: true,
        water: true,
        todo: true,
        standup: true,
        shelf: true,
        bluetooth: true,
        prayer: true,
        chat: true,
    },

    // Isi tambahan di notch tertutup. Notch hanya menampilkan SATU indikator
    // kontekstual (di samping jam + ring baterai): dipilih yang pertama aktif
    // sesuai urutan, jadi "kaya tapi tenang" bukan menumpuk semua.
    // Pilihan: 'music' (equalizer), 'pomodoro' (sisa waktu), 'todo' (tugas
    // belum selesai), 'water' (progres air), 'date' (tanggal, fallback).
    closedIndicators: ['music', 'pomodoro', 'todo', 'date'],

    // batas karakter sebelum teks dipotong (kartu 420 lebar, peek 310)
    mediaMaxChars: 22,
    notifyMaxChars: 34,

    // KALENDER — satu URL iCal (Google/Outlook "secret address") atau path file
    // .ics lokal. Kosong = modul tampil dengan petunjuk pengisian.
    // Pengingat dikirim 10 menit sebelum acara berikutnya.
    calendar: {
        icsUrl: '',
        refreshMinutes: 30,
    },

    // KESEHATAN RINGAN — jeda mata 20-20-20 dan pengingat gerak tiap jam.
    // Hanya notifikasi lokal (tidak ada data disimpan, tidak ada jaringan).
    // Timer otomatis diam di luar startHour-endHour.
    wellness: {
        enabled: true,
        everyMinutes: 20,      // jeda mata
        lookSeconds: 20,
        moveEnabled: true,
        moveEveryMinutes: 60,  // pengingat gerak
        startHour: 8,
        endHour: 22,
    },

    // CUACA — Open-Meteo (gratis, tanpa API key/akun). Koordinat & kota
    // mengikuti blok `prayer` di bawah kecuali diisi sendiri di sini.
    // refreshMinutes: 15 menit; hanya berjalan kalau modules.weather != false.
    weather: {
        latitude: null,
        longitude: null,
        city: null,
        units: 'celsius',      // celsius | fahrenheit
        refreshMinutes: 15,
    },

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

    // CHAT (Gemini). API key TIDAK disimpan di file ini. Urutan pencarian:
    //   1. env GEMINI_API_KEY
    //   2. ~/.config/dynamic-iland/.env  (GEMINI_API_KEY=..., chmod 600)
    //   3. ~/.config/dynamic-iland/gemini.json  ({"apiKey":"..."})
    // Input memakai rofi karena window island `keymode: 'none'` (tidak
    // mengambil fokus keyboard). Respons non-streaming.
    chat: {
        // 3.5 Flash-Lite: cepat untuk chat tanpa skill context.
        // 3.6 Flash ~2.7s; 3.8 Flash 503 high demand (uji 2026-11).
        model: 'gemini-3.5-flash-lite',
        systemPrompt: 'Anda adalah asisten ringkas di dalam notch desktop. '
            + 'Jawab dalam bahasa Indonesia, singkat dan jelas, maksimal sekitar '
            + '600 karakter. Hindari tabel dan blok kode panjang.',
        maxTurns: 6,            // jumlah pasangan pesan yang dikirim ke API
        maxOutputTokens: 300,   // cap output: jawaban pendek, tidak menunggu lama
        // Gemini 3.x: low/medium/high. Kosongkan untuk model tanpa thinking.
        thinkingLevel: '',
        timeoutSec: 30,
    },
};
