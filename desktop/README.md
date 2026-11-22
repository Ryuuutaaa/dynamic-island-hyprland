# Dynamic Island Desktop (Electron)

Versi lintas OS (Linux, Windows, macOS) dari dynamic island. Aplikasi Electron
yang mencoba mempertahankan *perilaku* island — notch di tengah atas layar,
mengecil saat diam, membesar saat hover — memakai pendekatan yang tersedia di
tiap OS.

> **Baca ini dulu:** ini **bukan** port 1:1. Lihat bagian
> [Batasan](#batasan-yang-terukur) — ada hal yang secara teknis tidak bisa
> disamai di luar Wayland/Hyprland.

## Menjalankan

```bash
cd desktop
pnpm install          # atau npm install
pnpm start            # Linux: tambahkan --no-sandbox bila sandbox tidak tersedia
```

Linux dengan AppArmor yang membatasi user namespace membutuhkan
`--no-sandbox` (hanya untuk pengembangan):

```bash
./node_modules/.bin/electron . --no-sandbox
```

## Arsitektur

```
src/
  main/            Proses utama: window, posisi, hit-test mouse
    index.js       BrowserWindow transparan 564x232, always-on-top
    settings.js    Persistensi setelan di userData (platform-aware)
    system.js      Integrasi OS: baterai, volume, kecerahan, notifikasi
    ipc/           Kanal IPC: system, store, chat
  preload/         contextBridge: satu API `window.island` untuk renderer
  renderer/        UI (HTML/CSS/JS tanpa framework)
    lib/core.js    LOGIKA MURNI: waktu sholat, iCal, format, pemilihan model
  tools/cdp-eval.mjs   Verifikasi UI lewat Chrome DevTools Protocol
```

**`lib/core.js` adalah bagian yang bernilai jangka panjang.** Semua logika
domain ada di sana tanpa ketergantungan OS/GUI, sehingga bisa dipakai ulang
oleh versi AGS maupun versi Electron. Contoh yang sudah terbukti identik
dengan versi AGS:

| Fungsi | Keluaran (22 Nov 2026, Denpasar) |
|---|---|
| `computeTimes()` | Subuh 04:25, Dzuhur 12:06, Ashar 15:28, Magrib 18:22, Isya 19:37 |
| `sunrise` | 05:49 |
| `recommendModel()` | `gemini-3.5-flash-lite` dari 65 model |

## Kenapa jendela selalu besar

Jendela berukuran **564×232** (ukuran notch terbuka maksimum), bukan 150×50.

Alasannya: kalau jendela hanya sebesar notch tertutup, notch **tidak akan
pernah bisa membesar** saat hover — kursor keluar dari jendela sebelum event
mouse terkirim, dan tidak ada layer-shell yang bisa memperbesar permukaan
keluar bounds. Karena itu:

1. Surface dibuat sebesar mungkin.
2. Area di luar badan notch transparan.
3. Main process mengecek posisi kursor tiap 60ms dan memanggil
   `setIgnoreMouseEvents(true, { forward: true })` saat kursor di luar notch,
   sehingga klik menembus ke aplikasi di bawahnya.

Ini kompromi yang harus dibayar. Di versi AGS, layer-shell menangani ini
secara native tanpa polling.

## Batasan yang terukur

| Aspek | AGS + Hyprland | Electron |
|---|---|---|
| Notch menempel ke tepi bezel | ya (layer-shell) | **tidak** — posisi window diatur compositor |
| Klik menembus area transparan | ya (input region) | ya, tapi lewat polling 60ms |
| Tidak mengambil fokus keyboard | ya (`keymode: none`) | **tidak** — window Electron fokusable |
| Notch menempel di atas **semua** window | ya (layer top) | `alwaysOnTop` level screen-saver |
| Navigasi keyboard (submap) | ya | tidak — perlu global hotkey per OS |
| Ukuran RAM diam | ~50 MB (AGS) | ~150–250 MB (Electron/Chromium) |

**Di Linux/Wayland, klien tidak boleh menentukan posisinya sendiri.** Saat
diuji, `win.setBounds({ y: 0 })` diabaikan dan jendela muncul di `[678, 448]`;
posisi harus dipaksa lewat compositor (`hyprctl dispatch ... window.move`).
Di Windows dan macOS, `setBounds` bekerja normal sehingga notch bisa
menempel di tepi atas.

Konsekuensinya: di Linux, versi Electron **lebih buruk** daripada versi AGS
yang sudah ada. Jalur A hanya menang kalau target Anda memang Windows/macOS.

## Integrasi sistem per OS

| Fitur | Linux | Windows | macOS |
|---|---|---|---|
| Baterai | sysfs | PowerShell CIM | `pmset` |
| Volume | `wpctl` → `pamixer` | tidak didukung | `osascript` |
| Kecerahan | `brightnessctl` | tidak didukung | tidak didukung |
| Notifikasi | `notify-send` | PowerShell balloon | `osascript` |
| Kredensial Gemini | file 0600 | DPAPI (`safeStorage`) | Keychain (`safeStorage`) |

`system:support` melaporkan kemampuan platform sehingga UI bisa menyembunyikan
kontrol yang tidak tersedia, bukan menampilkan tombol mati.

## Keamanan

- Renderer berjalan dengan `contextIsolation: true`, `nodeIntegration: false`.
- Semua operasi sistem lewat IPC bertipe; renderer tidak punya akses `require`.
- CSP membatasi script ke `'self'`.
- API key Gemini disimpan terenkripsi lewat `safeStorage` bila tersedia;
  fallback file `0600`.

## Status

Yang sudah berjalan dan diverifikasi di Linux (Hyprland + Wayland):

- Notch muncul, jam dan tanggal benar, ring baterai terisi.
- Hover membuka kartu: ringkasan tugas/air/cuaca, tab navigasi.
- Halaman: Ringkasan, Sholat, Kalender, Statistik, Chat, Pengaturan.
- `lib/core.js` terverifikasi identik dengan versi AGS untuk waktu sholat,
  parsing iCal, dan pemilihan model.

Belum sempurna:

- Posisi jendela di Wayland bergantung compositor (lihat batasan).
- Window Electron mengambil fokus keyboard saat diklik; tidak ada `keymode: none`.
- Uji visual halaman sempat tidak sinkron karena dua proses main berjalan
  bersamaan; jalankan satu instance saat menguji.
