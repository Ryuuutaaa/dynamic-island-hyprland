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
