# Dokumentasi Dynamic Island

Situs dokumentasi untuk Dynamic Island (AGS). Dibangun dengan Nuxt 4 dan
dihasilkan sebagai situs statis.

## Menjalankan

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

## Build

```bash
pnpm generate     # hasil statis di .output/public
pnpm preview      # pratinjau hasil build
```

Karena `nitro.preset` diset `static`, hasil build tidak butuh server Node dan
bisa dilayani hosting statis apa pun.

## Struktur

```
pages/index.vue        Pengenalan: apa itu notch, geometri, prinsip desain
pages/fitur.vue        Enam belas halaman dengan tangkapan layar asli
pages/instalasi.vue    Prasyarat, langkah pemasangan, pencabutan
components/            SiteHeader, SiteFooter, ShotFrame, CodeBlock
composables/useContent.js   Sumber data fitur, geometri, dan prasyarat
assets/css/main.css    Sistem desain: token, tipografi, komponen
public/shots/          Tangkapan layar island (PNG dengan alpha)
```

## Tangkapan layar

Semua gambar di `public/shots/` diambil dari island yang berjalan di Hyprland,
bukan mockup. Prosedurnya:

1. Isi data demo yang generik (bukan data pribadi), lalu restart AGS.
2. Buka halaman lewat `ags -r` dengan `pinPage()` dan `toggleOpen(true)`.
3. Baca geometri layer dari `hyprctl layers` dan tangkap region itu dengan
   `grim`.
4. Mask dengan siluet notch asli. Geometri per bentuk ada di `config.js`:

   | Keadaan | Telinga | Radius bawah |
   |---|---|---|
   | closed | 10 | 16 |
   | peek (OSD) | 13 | 20 |
   | expanded | 22 | 32 |

   Kartu tanpa telinga (popup notifikasi, kartu pomodoro) memakai sudut
   membulat saja.

Masking juga menetralkan RGB di area transparan. Tanpa itu, piksel
semi-transparan di tepi telinga membawa warna terang dari desktop di
belakangnya dan terlihat seperti garis bocor.

Untuk halaman media, pemutar MPRIS palsu dipakai agar judul, artis, cover, dan
lirik konsisten. Pemutar itu tidak menyentuh berkas pengguna dan dihentikan
setelah pengambilan selesai.

## Catatan desain

- Palet diturunkan dari produk: badan notch hitam opaque, aksen hangat dari
  glow langit waktu sholat.
- Radius mengikuti peran: 8 untuk kode, 12 untuk bingkai gambar, 16 untuk
  kartu, 32 untuk notch.
- Skala jarak mengikuti kelipatan 4px.
- Notch tertutup dirender pada ukuran aslinya (170px), tidak direntangkan,
  karena memperbesar aset sekecil itu membuat semuanya buram.

## Live demo

`pages/demo.vue` + `components/DemoIsland.vue` adalah replika notch yang bisa
dipakai di browser. Bukan gambar, bukan video: notch benar-benar membesar,
halaman benar-benar bisa dinavigasi.

Yang diambil dari implementasi asli, bukan dikira-kira:

| Sumber | Yang dipakai |
|---|---|
| `config.js` → `geometry` | ukuran tiap keadaan dan tiap halaman, radius, telinga |
| `config.js` → `motion` | durasi 320 ms, kurva `cubic-bezier(.34,1.32,.5,1)` |
| `modules/nav.js` → `ICONS` | urutan 16 halaman dan labelnya |
| `theme.js` → `palette` | `#0B0003`, `#EFEFEF`, `#BAB4B8`, `#3ad17a`, `#ff8f8f` |
| `state.js` → `PAGE_ORDER` | perilaku pin, panah, dan panah kiri di tampilan lirik |

Interaksi: hover membuka, klik atau Enter menahan terbuka, panah kiri/kanan
berpindah halaman, Escape menutup. Di tampilan lirik, panah kiri kembali ke
kartu musik, bukan ke halaman sebelumnya.

Catatan implementasi:

- **Telinga digambar sebagai SVG path**, bukan trik CSS mask. Bentuknya
  diturunkan langsung dari Cairo di `index.js`
  (`arcNegative(0, e, e, 0, -PI/2)` untuk kiri, `arc(e, e, e, PI, 1.5PI)` untuk
  kanan). Mask CSS rapuh: sintaksnya berbeda antar browser dan hasilnya sulit
  diperiksa.
- **Ikon memakai render function**, bukan `v-html`. Browser mem-parse children
  SVG di namespace yang salah saat memakai `v-html`, sehingga ikonnya kosong.
- **Gradient langit digambar oleh badan notch sendiri**, bukan elemen overlay.
  Overlay terpisah di dalam `overflow:hidden` + `border-radius` meninggalkan
  garis berwarna 1px di tepi saat di-composite.
- **Ruang nav dipotong dari isi** (padding bawah 40px), sama seperti
  `stack.margin_bottom = 34` di implementasinya. Tanpa itu baris terakhir
  tertimpa nav.
- **Fokus keyboard**: notch memakai cincin inset, bukan outline 2px, karena
  outline di keliling tombol sebesar notch terbaca seperti border dekoratif.

Diverifikasi dengan Chrome DevTools Protocol, bukan asumsi: 16 halaman unik
dengan lebar sesuai config (kalender 522, sholat 584, chat 518, pengaturan 520),
panah kiri dari lirik mengembalikan 468px, Escape menutup ke 150px, `Tab` masuk
ke notch lalu nav, dan `prefers-reduced-motion` mempersingkat transisi ke
1e-05s.
