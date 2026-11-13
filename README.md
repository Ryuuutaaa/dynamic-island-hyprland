# Dynamic Island untuk Hyprland (AGS)

Notch di tengah tepi atas layar yang **kecil saat diam dan membesar saat
hover**: sudut atas rata menempel layar, hanya sudut bawah melengkung, plus
"telinga" (kurva konkaf) yang menyatu ke bezel. Dibangun di atas **AGS
(Aylur's GTK Shell) v1**.

## Perilaku

| State | Pemicu | Ukuran notch | Telinga | Isi |
|---|---|---|---|---|
| **closed** | default | **150×50** | 10 | ring baterai + jam + satu activity strip (equalizer/ikon+teks) + hairline progres pomodoro/timer |
| **expanded** | pointer hover | **468×156** | 22 | halaman aktif sebagai kartu + navigasi |
| **peek** | OSD / notifikasi | **240×80** | 13 | volume / brightness / notifikasi |

Prioritas: `peek` (transient) menang atas `expanded`, `expanded` menang atas
`closed`. Semua angka itu ada di `config.js` → `geometry`.

**Notch tertutup tenang:** di samping jam dan ring baterai hanya tampil **satu**
activity strip kontekstual. Urutannya di `config.js` → `closedIndicators`
(default `['music', 'pomodoro', 'todo', 'date']`): indikator pertama yang aktif
yang dipakai, sisanya tidak terlihat. Pilihan: `music` (equalizer), `pomodoro`
(ikon hourglass + sisa waktu + hairline), `todo` (ikon daftar + jumlah tugas
yang punya jam), `timer` (ikon stopwatch + sisa waktu + hairline), `water`
(ikon droplet + progres air), `weather` (ikon cloud + suhu), dan `date` sebagai
fallback tanpa ikon. Semua memakai satu label aktivitas, jadi natural width
tidak menjumlahkan lima label saat window dihitung. Prinsipnya "kaya tapi
tenang": menambah modul tidak menumpuk isi notch.

**Glow album art:** saat musik diputar, cover 84px diberi border tipis dari
warna dominan cover, dan notch mengambil **warna dominan cover**
(`modules/cover-color.js`: sampel 24×24, bobot saturasi, buang piksel hampir
hitam/putih) dan menggambar glow radial dari bawah lewat `drawSky(..., accent)`.
Glow hilang sendiri saat tidak ada lagu; tidak ada timer, hanya hook Variable.

**Rasio seragam 3:1** untuk `closed` (150×50), `peek` (240×80), dan `expanded`
(468×156). Sebelumnya `closed` 150×30 = 5:1, sehingga saat menutup lebar dan
tinggi menyusut dengan persentase berbeda (w −64%, h −78%) dan kartu terlihat
"stretch" melebar di tengah animasi. Terukur sesudah perubahan: rasio setiap
frame 2,98–3,02 sepanjang 468×156 → 150×50.

## Motion

- **Ukuran** dianimasikan dengan `cubic-bezier(.34, 1.32, .5, 1)` selama
  **620ms** (`bezierTween` di `spring.js`, solver bezier sungguhan — bukan
  spring fisika). Overshoot-nya terlihat: membesar berhenti di 473×144 lalu
  duduk di 464×140; menyusut berakhir tepat di 170×50 (150 + 2×telinga 10).
- **Radius sudut & telinga** ikut state (14/32/19 dan 10/22/13). Telinga
  dianimasikan per frame (ikut tween ukuran); `border-radius` sendiri tidak
  bisa dianimasikan di GTK3, jadi nilainya dipasang sekali per state.
- **Konten** berganti bertahap: bentuk dulu, isi menyusul setelah
  `contentDelay` 200ms, fade-in 320ms (`ramp` ease-out).
- **`motion.reduced: true`** mempersingkat semuanya: ukuran 120ms tanpa
  overshoot, delay konten 0, fade konten 120ms, crossfade halaman 120ms,
  fade-out close 80ms, dan fade indikator closed 120ms. Default `false`.
- GTK3 tidak punya `transform` dan tidak menganimasikan `width`/`height` lewat
  CSS, jadi ukuran notch digerakkan dari JS per frame (`set_size_request`),
  dan konten di-clip oleh `Gtk.ScrolledWindow` dengan
  **`propagateNaturalWidth/Height: false`**.
- **Ruang nav dipotong dari isi konten** (`stack.margin_bottom`, 34px saat nav
  tampil), bukan dari clip. Percobaan memakai margin pada clip **gagal**:
  `GtkOverlay` menurunkan tingginya dari main child, jadi nav ikut naik dan
  menimpa konten (terukur 24px tumpang tindih); dengan margin di stack, pill
  nav tetap di dasar notch dan konten berhenti ~6px di atasnya (terukur:
  pill y=107..128, konten berakhir y=101).

## Halaman

| Page | Isi |
|---|---|
| `closed` | ring baterai (Cairo) + jam + satu activity strip: equalizer saat musik, atau ikon + teks (tanggal, sisa pomodoro, tugas, air, timer, suhu) dengan fade 180ms saat berganti; hairline 2px di dasar notch untuk pomodoro/timer |
| `idle` | jam besar + tanggal + satu baris agenda berikutnya; kanan tiga baris **Tugas / Air / Cuaca**; divider tipis; tanpa kartu, progress, baterai, atau Bluetooth bar |
| `media` | album art 84px dengan border warna dominan cover + judul + artis + progress bar (area seek 24px) + elapsed/total + nama app sumber + prev/play/next + tombol lirik |
| `media` → lirik | **sub-tampilan** (bukan halaman nav): kiri album art + judul + progress + kontrol, kanan daftar lirik sinkron |
| `weather` | cuaca Open-Meteo: kondisi sekarang, strip 3 jam ke depan, + 3 hari; saat feed gagal muncul tombol **Muat ulang** di kanan |
| `pomodoro` | ring merah 88px menyusut + countdown 38px + pill (mode berikutnya, play, reset); umpan balik aksi muncul sebagai **kartu OSD kanan atas**, bukan mengembangkan notch |
| `timer` | timer bebas (preset 1–60 menit + stepper ±1 menit 1–90) + stopwatch: waktu besar, mode, preset, play/pause, reset |
| `stats` | tiga metrik sejajar CPU / RAM / suhu dengan **sparkline 30 detik**, detail ringkas, dan footer disk / swap; tanpa kartu |
| `water` | volume harian, progress, switch pengingat, grafik ml per jam dengan label 9.5px (tiap 2 jam agar tidak bertumpuk) |
| `todo` | header ringkas + `＋ Tambah`; baris tugas dengan toggle selesai, edit dan hapus; editor CRUD teks + jam; konfirmasi hapus inline |
| `standup` | tanggal + status tersimpan, tiga chip **Kemarin/Hari ini/Blocker** (centang hijau, warning merah untuk blocker) + pill **Isi/Lihat** |
| `shelf` | drop zone putus-putus + kartu file (thumbnail, nama, ukuran) |
| `bluetooth` | satu kolom: header status + power icon; baris icon/nama/baterai/action, seluruh baris connect/disconnect; volume footer hanya untuk audio utama tersambung |
| `wifi` | satu kolom: header status + scan + power icon + Login portal; baris sinyal/nama/lock/action, seluruh baris connect/disconnect |
| `prayer` | jadwal sholat: timeline 24 jam dengan label waktu di posisi aslinya, busur matahari terbit→terbenam, bulan saat malam, tanggal + countdown + kota; background langit mengikuti fase |
| `chat` | riwayat chat Gemini dengan avatar + timestamp per pesan, tombol **Tanya Gemini** (input rofi) + Hapus/Ulangi; halaman sticky saat dipilih |
| `settings` | Pengaturan: glow, ukuran notch tertutup, follow focus, halaman default, dan toggle 12 modul; disimpan ke `~/.config/dynamic-iland/settings.json` |
| `volume` / `brightness` | ikon + bar (Cairo) + persen + nama device, **bar bisa diklik/digeser**; volume: klik ikon = mute, double-click = 100%; brightness: ikon 3 tingkat (bulan/bohlam/matahari) |
| `notify` | ikon + `Judul · isi` |

**Modul on/off:** `config.js` → `modules` (weather, timer, pomodoro, water, todo, standup, shelf, bluetooth, prayer, chat). Halaman yang dimatikan (mis.
`pomodoro: false`) — berlaku juga untuk `stats` tidak masuk `PAGE_ORDER`, jadi jumlah dot dan jangkauan
panah ikut berkurang; halamannya tetap terdaftar di Stack sehingga
`showTransient(name, ms)` (OSD/notifikasi) tetap bisa memakainya. `idle` dan
`media` selalu aktif karena menjadi base page.

`volume`, `brightness`, dan `notify` adalah halaman **transient**: muncul sendiri
saat OSD/notifikasi dan tidak ikut dalam `PAGE_ORDER`, jadi tidak bisa di-pin
dari panah. Album art digambar Cairo (`modules/cover.js`) supaya sudutnya
benar-benar membulat dan file cover yang rusak tidak melempar exception
(pernah muncul `GdkPixbuf.PixbufError` dan membatalkan sisa update kartu).

Catatan jujur: equalizer di state `closed` **dekoratif** (gelombang sinus,
bukan visualizer audio nyata) — AGS tidak menyediakan peak audio, dan
memanggil `cava` untuk itu berarti menambah proses yang baru saja kita bereskan
kebocorannya. Saat tidak ada musik, barnya jadi stub redup dan timernya mati.

## Lirik (LRCLIB)

Lirik adalah **sub-tampilan dari kartu media**, bukan halaman tersendiri: tidak
punya dot dan tidak ada di `PAGE_ORDER`. Tombol 💬 di kartu media mengubah
`mediaView` jadi `'lyrics'` → notch melebar ke **520×156** dan kontennya
**terbelah dua**: kiri album art + judul + progress + kontrol, kanan daftar
lirik. Tinggi 156 memberi progress bar area klik 24px (bar tetap 4px) tanpa
memotong kontrol; baris lirik juga minimal 24px. Dot tetap menandai `media`,
dan panah tetap di tengah bawah.

- Sumber: **LRCLIB** (`/api/get?artist_name=&track_name=`), diambil saat track
  berubah; hasil di-cache per `artis - judul`. `syncedLyrics` (format LRC
  `[mm:ss.xx] teks`) diparse jadi `[{time, text}]`; kalau tidak ada, pakai
  `plainLyrics`; `instrumental` dan 404 ditangani.
- Pencarian **dilewati** untuk metadata yang bukan musik (artis kosong, atau
  `Unknown artist`/`Unknown title` — AGS memakai placeholder itu, dan MPRIS
  sesekali melaporkan suara notifikasi seperti `(43) WhatsApp`).
- **404 di-cache** (jawaban pasti: `none`), **error jaringan tidak** — dulu
  kegagalan DNS sesaat ikut ter-cache sehingga lagu itu "mati" sampai AGS
  restart. Kalau gagal, halaman menampilkan
  **"Gagal memuat lirik — klik untuk coba lagi"** (`retryLyrics()`), berbeda
  dari `none` yang berarti "Lirik tidak ditemukan".
- Sinkronisasi: posisi player di-poll 500ms (hanya saat tampilan lirik aktif:
  `page === 'media' && mediaView === 'lyrics'`), baris aktif = baris terakhir
  dengan `time <= position`; baris aktif jadi putih & tebal, yang lain redup,
  dan daftar **auto-scroll** supaya baris aktif di tengah. Menggulir sendiri
  (scroll event) **menahan auto-scroll 8 detik**, jadi baris berikutnya tetap
  bisa dibaca.
- Klik baris → lompat ke waktu baris itu (`player.position = time`).
  Terukur: klik baris `136.94s` memindahkan posisi 78.06 → 136.94.
- **Tampilan minimalis (tanpa background tombol).** Baris lirik adalah
  `GtkButton` (untuk seek) dan kontrol media juga tombol; tanpa deklarasi
  eksplisit tema GTK3 menggambar kotak abu di belakang tiap baris/tombol.
  `style.css` memaksa `.dyn-island-lyric` dan `.dyn-island-ctl` memakai
  `background-color: transparent`, `background-image: none`, `border: none`,
  `box-shadow: none`. Nav (`.dyn-island-nav` + panah) juga transparan — hanya
  dots & panah yang terlihat. Umpan balik hover tetap ada: baris/panah memakai
  `__SURFACE_DIM__`, kontrol memakai `__ACCENT_SOFT__`; state aktif tetap aksen.
- Keluar dari lirik: tombol **↩ Kembali ke musik** di baris kontrol (kiri
  tombol prev), panah **←**, atau pindah halaman lewat panah (sub-tampilan
  otomatis kembali ke kartu musik). Terukur: ← di tampilan lirik mengembalikan
  `geo` 520 → 420 tanpa berpindah halaman; → langsung ke pomodoro.

## Pomodoro

Halaman `pomodoro` (kartu 468×156): **ring merah** yang menyusut sesuai sisa
waktu, countdown `MM:SS` besar, label mode, dan tiga pill:
**mode berikutnya** (memutar siklus), **play/pause**, dan **reset**.

- Tiga mode (`MODES` di `modules/pomodoro.js`, bisa diubah saat runtime):
  `focus` **25 menit**, `break` (istirahat singkat) **5 menit**, dan
  `longBreak` (istirahat panjang) **15 menit**. Satu pill memutar siklus
  fokus → istirahat singkat → istirahat panjang → fokus; label pill menunjukkan
  mode **berikutnya** ("Istirahat", "Istirahat panjang", "Fokus") dan tooltip
  menjelaskan siklusnya.
- Saat habis: mode berikutnya otomatis disiapkan paused (fokus → istirahat
  singkat; istirahat singkat/panjang → fokus).
- Tick per detik lewat `GLib.timeout_add` (bukan `Utils.interval`, supaya
  hitungan pertama tidak langsung berkurang). Timer tetap jalan walau halaman
  tidak sedang terlihat.
- Saat habis: **chime** (`paplay` `alarm-clock-elapsed.oga`) + `notify-send`,
  lalu mode berikutnya disiapkan dalam keadaan paused. Terukur: focus 2 detik
  → berakhir dengan `mode=break, running=false, remaining=300` dan notifikasi
  `Notch — Fokus selesai` masuk.
- Halaman ini sticky selama dipilih; timer tidak terpengaruh durasi pin.
  Kalau timer sudah habis (`00:00`), menekan play langsung **reset + mulai** —
  bukan reset dalam keadaan paused seperti sebelumnya.
- **Persistensi** (`~/.local/share/dynamic-iland/pomodoro.json`): mode,
  `running`, sisa waktu, dan `endsAtEpoch`. Tick memakai **deadline monoton**
  (`endsAtEpoch`), bukan `remaining - 1`, sehingga timer tidak melenceng setelah
  laptop sleep atau AGS di-restart; saat dipulihkan sisa waktu dihitung ulang
  dari jam dinding. Penulisan di-debounce 300ms.
- **Notch tertutup** menampilkan `HH:MM  MM:SS` (jam + sisa pomodoro) selama ada
  sesi, menggantikan tanggal.
- **Kartu OSD kanan atas** (`modules/pomodoro-osd.js`, 320×141): mode, sisa
  waktu, bar progres, dan tiga aksi (play/pause, mode berikutnya, reset).
  Kartu **menetap** selama sesi berjalan atau dijeda, dan tetap ada setelah sesi
  selesai (menunggu ▶ atau ↻); baru hilang 4 detik setelah reset. Saat waktu
  habis kartu memudar ke warna aksen (transisi CSS 260ms, bukan kedip) lalu
  kembali normal. Diletakkan 110px dari atas supaya tidak menimpa popup
  notifikasi (368×90 pada margin 12), dan dipasang sekali ke monitor yang fokus
  saat start — bukan `followFocused`, jadi tidak melompat saat kursor pindah
  layar.
- Catatan: `add_style_class_name` **tidak ada** pada objek Widget AGS (bukan
  `Gtk.Widget`); kegagalan itu dulu membuat flag animasi menggantung dan kartu
  tidak pernah hilang. Sekarang kelas animasi di-set lewat properti
  `className`.

## Bluetooth

**Kenapa dulu tidak muncul:** barisnya sudah ada dan `Bluetooth.connected_devices`
memang berisi device (`Redmi Buds 6`, baterai 65%, sink
`bluez_output.64_8F_DB_52_8A_74.1`), tetapi baris itu hanya berada di halaman
`idle`. Saat ada media player aktif, halaman istirahatnya `media`, jadi baris
idle tidak pernah ter-map (terukur `visible=true`, `mapped=false`). Selain itu
barisnya hanya satu teks tanpa info device maupun pengaturan volume.

Halaman `bluetooth` sekarang satu kolom:

- header: judul + status + satu power icon (`Bluetooth.toggle()`);
- baris device: ikon, nama, baterai, action text; seluruh baris clickable
  untuk connect/disconnect; connected row diberi background tipis + accent;
  tipe, alamat, dan baterai lengkap ada di tooltip;
- volume footer hanya muncul untuk audio utama yang tersambung; ada hairline,
  slider Cairo, mute, dan persentase; list menyesuaikan 2 baris + volume atau
  3 baris tanpa volume;
- tidak ada badge/pill, selected row, atau panel detail terpisah.

Pairing device baru masih lewat `bluetoothctl` (service AGS hanya mengekspos
device paired/trusted; belum ada tombol scan).

Ringkasan tidak lagi menampilkan baris Bluetooth; halaman Bluetooth adalah
satu-satunya kontrol device.

- Sumber device: service Bluetooth AGS (BlueZ) → `Bluetooth.devices` (paired)
  dan `connected_devices`; tidak ada polling `bluetoothctl`, halaman ikut event
  `changed` service. Power/connect memakai API service (`toggle`,
  `setConnection`).
- Sumber volume: `Audio.speakers` (Gvc). Sink dicocokkan lewat **alamat device**
  (`bluez_output.64_8F_DB_52_8A_74.1`), bukan asal sink default — jadi volume
  yang diatur tetap milik headset meskipun output default berganti. Kalau sink
  belum tersedia (profil audio belum siap), baris volume disembunyikan.
- Halaman juga ikut event `changed` dari `Audio`, jadi slider/persentase
  mengikuti perubahan volume dari sumber lain tanpa timer polling.
- Slider memakai `event.get_coords()`/`event.get_button()` (helper
  `modules/pointer.js`): GJS di mesin ini **tidak mengekspos field**
  `event.x`/`event.button`, sehingga handler gaya lama selalu berhenti di
  `if (event.button !== 1) return false`. Setelah helper dipakai, klik 25% →
  75% → 38% benar-benar mengubah sink `bluez_output.64_8F_DB_52_8A_74.1` dan
  label UI ikut berubah.
- Menggeser slider / menekan mute **tidak** memunculkan OSD volume: hook
  `speaker-changed` di `modules/osd.js` dilewati saat `page.value ===
  'bluetooth'`. Tanpa guard itu halaman BT tertutup OSD 1.6 detik setiap kali
  volume berubah. Terukur: page tetap `bluetooth` selama slider/mute dipakai.
- Glyph mengikuti `icon_name` device: headset/headphone, speaker, keyboard,
  mouse, phone, fallback logo Bluetooth. Baterai memakai glyph F240..F244
  sesuai level.
- Beberapa device sekaligus: device audio diprioritaskan untuk volume; setiap
  baris tetap menampilkan aksi dan tooltip berisi tipe/alamat/baterai.
- Tanpa device: halaman menampilkan "Tidak ada perangkat" + petunjuk
  ("Hubungkan headset atau speaker" / "Bluetooth nonaktif").
- Debug tanpa device fisik (dipakai saat menguji):
  `ags -r "globalThis.dynIsland.btPreview.value=[{name:'X', icon_name:'audio-headset', battery_percentage:80}]"`
  — kosongkan lagi dengan `=[]`.

## Wi-Fi

**Config**: `wifi.scanSeconds` (default 20), `wifi.autoPortal` (default true),
`wifi.portalUrl` (default `http://connectivity-check.ubuntu.com/`).

**Halaman**: daftar jaringan dari `nmcli` (satu baris per SSID, sinyal
terkuat) dalam satu kolom. Header berisi status, scan, power icon, dan chip
**Login** saat captive portal. Baris berisi sinyal, nama, lock, dan action
text; seluruh baris clickable untuk connect/disconnect; connected row diberi
background tipis + accent. Keamanan, sinyal, dan status tersimpan ada di
tooltip. Password WPA/WPA2/WPA3 diminta lewat rofi (window island
`keymode: none`) dan dikirim ke `nmcli --ask` lewat stdin dari file `0600`,
bukan argumen proses. Jaringan 802.1X ditandai **Manual**; hidden SSID tidak
ditampilkan.

**Captive portal**: saat NetworkManager melaporkan connectivity `portal`, AGS
mengirim notifikasi app **WiFi** dengan aksi **Buka login**. Klik kartu
(default action) atau chip **Buka login** memanggil `openPortal()`; notifikasi
yang sama juga bisa diklik dari control center swaync karena
`modules/notify.js` merutekan sinyal `ActionInvoked` ke aksi lokal.
`openPortal()` membaca `Location` (absolut/relatif), meta refresh, atau anchor
pertama dari `wifi.portalUrl`, me-resolve URL relatif dengan
`GLib.Uri.resolve_relative`, lalu membuka browser. `wifi.autoPortal` juga
membuka portal otomatis begitu connectivity berubah menjadi `portal`, bukan
hanya tepat setelah `connect()`. URL hasil deteksi di-cache di
`wifi.value.portalUrl` dan dibersihkan saat koneksi keluar dari portal.

**Debug**:

```bash
ags -r "globalThis.dynIsland.wifi.value"
ags -r "await globalThis.dynIsland.wifiDetectPortal()"
ags -r "await globalThis.dynIsland.wifiPortal()"
```

## Jadwal Sholat

Halaman `prayer` (kartu **580×156**) menghitung waktu sholat **lokal tanpa
jaringan** dari koordinat di `config.js`:

```js
prayer: {
    latitude: -8.65,        // Denpasar, Bali
    longitude: 115.2167,
    city: 'Denpasar',
    method: 'kemenag',      // kemenag | mwl | umm-al-qura
    notify: true,
    catchUpMinutes: 15,
}
```

- **Algoritma** (`modules/prayer-calc.js`): PrayTimes — deklinasi matahari +
  equation of time, sudut waktu untuk Subuh/Isya (Kemenag 20°/18°), Ashar
  (bayangan 1×, madzhab Syafi'i), dan Maghrib (sunset 0.833° untuk refraksi +
  piringan). Timezone mengikuti sistem (WITA +08:00 di mesin ini).
- **Ihtiyat:** semua waktu dibulatkan **ke atas** ke menit berikutnya, supaya
  pengingat tidak pernah berbunyi sebelum waktu masuk.
- **Validasi** terhadap Aladhan (Denpasar, 28-10-2026, method 20/Kemenag):
  referensi `04:31 12:03 15:15 18:15 19:27`; hasil lokal
  `04:32 12:03 15:15 18:15 19:27` (selisih maks 1 menit, Fajr +1 ihtiyat).
- **Tampilan** (`modules/prayer-page.js`): **timeline 24 jam**. Label 5 waktu
  diletakkan pada posisi jam sebenarnya (bukan 5 kolom rata), sehingga matahari
  di puncak busur benar-benar berada di atas Dzuhur dan Ashar di sisi turun.
  Busur hanya digambar dari sunrise ke sunset; saat malam diganti **bulan
  sabit** (even-odd fill + glow) di posisi jam sekarang. Label Magrib/Isya yang
  berdekatan digeser dengan connector tipis supaya tidak bertumpuk; label yang
  sudah lewat diredupkan, yang berikutnya diberi aksen. Setelah Isya, kolom
  Subuh menampilkan waktu **besok** dan label `Subuh besok`. Kiri: tanggal,
  nama sholat berikutnya, countdown `HH:MM:SS`, dan `kota · metode`.
  Tidak ada animasi sweep; penanda bergerak halus mengikuti tick 1 detik.
  Tinggi chart 82px memberi jarak ±9px ke nav (sebelumnya label waktu hanya
  2px dari nav).
- **Pengingat:** saat masuk waktu, `notify-send -a Notch "Waktunya <nama>"
  "<jam> · <kota>"`; `modules/notify.js` menampilkan popup kanan atas + halaman
  transient di island. `catchUpMinutes` menangani AGS yang baru hidup beberapa
  menit setelah waktu masuk; `prayer.json` (`{date, notified}`) mencegah
  notifikasi dobel setelah restart. Tanpa device/network tetap jalan.
- **Background langit** (`modules/sky.js`): dasar tetap hitam primary
  (`NOTCH_COLOR`, opaque) yang digambar Cairo; CSS notch transparan. Di atas
  dasar itu ada gradient glow rendah-alpha dari bawah + bintang, diinterpolasi
  kontinu setiap 30 detik:
  - **Subuh**: glow fajar hangat + bintang (bintang memudar sampai sunrise).
  - **Fajar/sunrise**: warna hangat paling kuat (matahari terbit).
  - **Dzuhur**: tint tipis (primary tetap dominan).
  - **Ashar**: hangat tipis, makin kuat menjelang Magrib.
  - **Magrib**: glow sunset merah-oranye.
  - **Isya/malam**: hitam primary + bintang (28 titik, posisi deterministik).
  Primary tidak pernah diganti; glow hanya overlay alpha (0.05–0.36) supaya
  teks tetap terbaca.
- **Uji:** `ags -r "globalThis.dynIsland.prayerNotify('maghrib')"` untuk
  mengirim notifikasi uji, `ags -r "JSON.stringify(globalThis.dynIsland.prayer.value)"`
  untuk melihat jadwal + `next`, dan
  `ags -r "globalThis.__prayerNowMinutes = 720"` untuk memaksa posisi matahari
  di jam 12:00 (atau `= 1200` untuk state malam); hapus dengan `= undefined`.
  Override ini juga dipakai `nextPrayer` sehingga label `Besok Subuh` konsisten.
  Untuk background: set `__prayerNowMinutes` lalu
  `ags -r "globalThis.dynIsland.skyRefresh()"`.

## Notifikasi (popup swaync)

Popup notifikasi kanan atas digambar **swaync**, bukan island. Gayanya
disamakan dengan notch lewat blok ber-marker di
`~/.config/swaync/style.css` (append-only, backup `.dyn-island.bak`):

- Kartu: hitam `rgba(0,0,0,0.94)`, **hairline** `alpha(@foreground, 0.12)`,
  radius **14px** (sama dengan notch), shadow tipis.
- Teks: **Noto Sans 13px normal** (sebelumnya JetBrains Mono bold 16px),
  judul putih, isi `alpha(fg, 0.72)`, waktu `alpha(fg, 0.40)`.
- Tombol tutup: redup `alpha(fg, 0.10)`, hover `0.18` — bukan merah menyala.
- Bingkai dalam bawaan (`.notification-content` / `.notification-row`) dimatikan
  supaya hanya tersisa satu kartu, tidak ada border ganda.
- Scope hanya `.floating-notifications`; panel control-center tetap.
- Terukur: border `srgb(28,28,28)` = `alpha(#EFEFEF, 0.12)` di atas hitam;
  tinggi popup 114 → **104 px** karena teks tidak lagi membungkus 4 baris.
- Reload tanpa restart: `swaync-client -rs`. `uninstall.sh` menghapus blok ini
  dan me-reload CSS.

## Control center (swaync)

Panel control-center memakai blok CSS ber-marker `dyn-island-cc` yang disimpan
di repo sebagai `swaync/control-center.css` (append-only, backup
`.dyn-island.bak`). Masalahnya bukan sekadar tipografi: **daftar notifikasi
hanya kebagian ~1,5 kartu dan satu kartu terpotong di tepi bawah panel**,
karena media player memakan ~160px dari tinggi panel 560px.

| Knob | Sebelum | Sesudah | Alasan |
|---|---|---|---|
| `control-center-height` | 560 | **800** | viewport notifikasi 3 kartu penuh (terukur 94px/kartu) |
| `notification-icon-size` | 24 | **26** | ikon aplikasi lebih mudah dikenali |
| `widget-config.mpris.image-size` | 64 | **32** | cover player tidak mendominasi panel |

- Kartu notifikasi: padding 11/13, radius 14, judul **14px medium**, isi 13px,
  waktu 11px, aksi 12px, jarak antar kartu 5px. Semua angka ini yang membuat
  tiga kartu terbaca penuh di panel 800px.
- **Petunjuk scroll**: tepi atas/bawah daftar diberi gradien lewat node
  `undershoot`/`overshoot` GTK3, jadi kartu yang terpotong memudar (bukan
  terpangkas tajam). Track scrollbar juga dibuat redup permanen; GTK3 tetap
  menyembunyikan slider overlay sampai pointer masuk.
- **Batas yang diketahui**: tinggi kartu media player tidak bisa turun
  signifikan lewat CSS — swaync menggambar artwork placeholder pada ukuran ikon
  tema (~64px) walaupun `image-size` diset 32, jadi lever-nya adalah tinggi
  panel.
- **Belum selesai**: warna slider volume masih biru bawaan tema. Terukur:
  `scale contents` bisa dijangkau CSS user, tetapi node `trough`/`highlight`
  tidak (rule `#ff00ff`/`#00ff00` tidak muncul), jadi warna itu bukan dari node
  GTK Scale yang bisa di-override dari `style.css`.
- `install.sh` meng-append blok CSS ini dan menaikkan ketiga knob di atas
  **hanya kalau nilainya masih di bawah target** (nilai user yang lebih besar
  tidak ditimpa), dengan backup `config.json.dyn-island-cc.bak`. `uninstall.sh`
  menghapus bloknya lalu mengembalikan config dari backup itu.

## Notifikasi (popup kanan atas)

Popup kanan atas digambar **island sendiri** (window layer `overlay`, anchor
kanan-atas), bukan swaync. Alasannya: loading bar + animasi slide + tombol X +
klik-untuk-buka butuh kontrol penuh, dan swaync tidak menyediakan widget custom
maupun keyframes di GTK3.

**Data**: `modules/notify.js` menyadap `Notify` di bus (bukan menjadi daemon;
swaync tetap pemilik `org.freedesktop.Notifications`). Parser mengambil
app/icon/summary/body, **array actions**, dan **id** dari method return
(`reply_serial` dicocokkan dengan serial call). Nilai string bisa **multi-baris**
(Chromium menambahkan origin ke body — lihat bagian WhatsApp Web). Monitor
memakai **dua** match rule: `interface=org.freedesktop.Notifications` dan
`type=method_return` — method return tidak punya field interface, jadi tanpa
rule kedua id selalu 0. `latest` membawa `seq` supaya kedatangan id tidak
memicu popup tampil ulang. Terukur setelah perbaikan: `id=54,
actions=["default","Open"]`.

**Tampilan** (`modules/notif-popup.js` + kelas `.dyn-island-popup*`): tumpukan
maksimal **3 kartu** 340px dengan jarak 6px, hitam solid radius 16, ikon 26px
(fallback glyph lonceng), judul 13px, isi 11px redup, dan X 24×24 di pojok kanan
atas. Hanya kartu terbaru yang punya loading bar 3px; kartu lama memudar
(opacity isi 0.72 lalu 0.45) tetapi latarnya tetap solid supaya wallpaper tidak
membocor. Kartu keempat mendorong kartu tertua keluar dari tumpukan.

Ritme terukur: inset kiri/kanan 15px (padding 14 + border 1), inset atas 13px,
ikon 26 → jarak 10px → teks, gap judul–isi 2px, jarak ke action 10px, jarak ke
bar 10px, bar 310×3 (selebar isi kartu), sisa bawah 11px. Lebar kartu dipatok
340px dan inset kiri/kanan simetris; area klik 290px selebar baris (X terpisah).

- **Durasi** mengikuti `expire_timeout` dari aplikasi: `-1` (default server) →
  5s, `0` → 12s, nilai lain di-clamp **3–15s**. Yang dihitung adalah kartu
  terbaru; kartu lama ikut hilang saat tumpukan ditutup. Sebelumnya semua
  notifikasi dipaksa 5s sehingga notifikasi penting (mis. error build) hilang
  terlalu cepat.
- **Watchdog hover 15s**: kalau `leave-notify-event` tidak pernah sampai
  (kursor pindah monitor tepat saat popup muncul), hitungan 5 detik tidak lagi
  tertahan selamanya — popup tetap menutup sendiri.
- Notifikasi yang datang **saat popup sedang slide keluar** ditarik kembali
  (flag `hiding`); sebelumnya exit tetap menyelesaikan unmap sehingga
  notifikasi baru hilang (terukur `visible=false`). Sekarang `visible=true`
  dan kartu kembali ke posisi penuh.
- **Masuk/keluar**: slide dari/ke kanan, 240ms. Tiga pendekatan sudah diukur:
  (1) margin layer negatif **ditolak compositor** (surface tidak ter-mount),
  (2) `margin_end` kartu **tidak menggeser** apa pun (posisi kartu tetap,
  hanya alokasi internal yang berubah), (3) `Gtk.Revealer` hanya meng-clip
  (allocation child tetap `x=0` = wipe, bukan slide). Yang dipakai sekarang:
  kartu diletakkan di `Gtk.Fixed` selebar 2×viewport di dalam
  `Gtk.ScrolledWindow`, lalu **scroll offset** dianimasikan manual (0 → page
  size) — terukur kartu benar-benar bergerak dan terlihat masuk dari kanan.
  Slide keluar = kebalikannya. `adj.value` baru bisa di-set setelah layout
  (upper masih 0 saat window baru di-map), jadi animasi ditunda 80ms.
- **Loading bar 5 detik** = sisa waktu tampil. Hover menahan hitungan; habis →
  slide keluar lalu window di-unmap.
- **Klik badan** → sinyal `ActionInvoked(<id>, "default")` (dikirim lewat
  `gdbus emit`), jadi aplikasi sumber melakukan aksinya — WhatsApp membuka
  chat, dsb. Tanpa id → fallback fokus window aplikasi berdasarkan app name.
- **Notifikasi `Notch`** (timer/pomodoro/water/prayer/calendar) memakai
  `registerLocalAction('Notch', ...)`; klik badan membuka island, sesuai teks
  "klik untuk membuka island" pada notifikasi timer. `invokeAction(id, key, app)`
  menerima app dari kartu yang diklik, jadi aksi tidak salah sasaran saat
  tumpukan berisi beberapa aplikasi.
- **Bisukan per app**: tombol lonceng-slash di setiap kartu menyimpan nama app
  ke `settings.json → mutedApps`. `notify.js` melewati `current`/`latest` dan
  transient island untuk app itu (popup island tidak muncul), tetapi swaync
  tetap menerima notifikasinya. Daftar app dibisukan muncul di halaman
  Pengaturan, lengkap dengan baris **Bunyikan** untuk mengaktifkan lagi.
- **Gesture kartu**: drag ke **kanan ≥60px** = tutup (sama dengan X, ikut
  `CloseNotification`); drag ke **atas ≥24px** = snooze **5 menit** — kartu
  hilang lalu muncul kembali. Kartu mengikuti pointer saat drag horizontal dan
  memudar saat drag vertikal; ambang diukur dari koordinat root supaya kartu
  yang bergerak tidak mengubah jarak pointer. Release di luar clickArea
  ditangkap fallback window. Klik badan baru membuka pada **release**, bukan
  press, jadi drag tidak memicu aksi default. Untuk uji cepat snooze:
  `ags -r "globalThis.__notifSnoozeMs = 1200"` (default 300000).
- **Tombol X** → `CloseNotification(<id>)` ke daemon (ikut hilang dari control
  center), kartu itu dibuang dari tumpukan; kartu di bawahnya naik jadi kartu
  terbaru dan timer dihitung ulang. Tumpukan kosong → slide keluar.
- **Action**: semua action tampil sebagai chip ringkas; label yang mengandung
  install/update/unduh/pasang/download diganti **ikon unduh** (`U+F019`), label
  lain tetap teks pendek. Action `default` tidak dirender (itu klik badan).
- **Popup swaync dimatikan tanpa DND.** Config swaync diberi
  `notification-visibility` catch-all dengan state **`muted`**:
  `{"dyn-island-all": {"state": "muted", "app-name": ".*"}}`. Efeknya popup
  swaync tidak muncul, **control center tetap menerima**, dan DND tetap bebas
  dipakai user. Sebelumnya island memaksa `swaync-client -dn` tiap 3 detik
  supaya popup tidak dobel — akibatnya toggle DND selalu kembali nyala
  (indikator DND tidak bisa dimatikan). Pemaksaan itu sudah dihapus.
  `install.sh` menambahkan key ini (idempoten, backup `.dyn-island.bak`),
  `uninstall.sh` menghapusnya.
- Uji: `./tools/test-popup.sh` (butuh sesi tidak terkunci).

**Pembersihan riwayat notifikasi**:
- `notif-history-clear.timer` (systemd user) menjalankan
  `swaync-client --close-all` pada **00:00, 06:00, 12:00, 18:00**
  (`OnCalendar=*-*-* 00/6:00:00`, `Persistent=true`). Semua notifikasi di
  control center dihapus, bukan hanya yang lebih tua dari 6 jam. Service
  mencatat jumlah notifikasi sebelum/sesudah ke journal.
- Popup island juga mendengarkan sinyal `NotificationClosed`: kartu yang
  ditutup timer/TTL/daemon langsung dibuang dari antrean lokal (diuji
  `items 1 → 0`, `hidden true`), tidak menunggu timeout kartu.
- AGS juga menyapu notifikasi yang umurnya melewati `notifTtlHours`
  (default **6 jam**) tiap 60 detik lewat `CloseNotification`. Penghitung umur
  bersifat in-memory: notifikasi yang sudah ada sebelum AGS start tidak
  terlacak, jadi timer 6 jam adalah backstop yang tetap berlaku setelah
  restart. `CloseNotification` menghapus entri dari control center (diuji:
  count 29 → 28).
- Uji timer tanpa menunggu jadwal:
  `systemctl --user start notif-history-clear.service` lalu
  `journalctl --user -u notif-history-clear.service -n 10`.

## Kalender (iCal)

**Config**: `calendar.icsUrl` — satu URL iCal (Google/Outlook "secret
address") atau path file `.ics` lokal. Feed di-refresh tiap
`calendar.refreshMinutes` (default 30 menit), di-cache di
`~/.local/share/dynamic-iland/calendar.json`, dan pengingat dikirim 10 menit
sebelum acara (bukan all-day).

URL **secret** pribadi tidak boleh ditaruh di `config.js` yang di-commit.
Simpan di **`~/.config/dynamic-iland/calendar.url`** dengan `chmod 600`;
`modules/calendar.js` membaca file itu lebih dulu (menang atas `icsUrl`) dan
file tersebut tidak masuk repo.

**Parser** (`modules/calendar.js`): `DTSTART`/`DTEND`/`SUMMARY`/`UID`, tanggal
all-day, `TZID` (lewat `Intl.DateTimeFormat`), `RRULE` untuk
DAILY/WEEKLY/MONTHLY/YEARLY dengan `INTERVAL`, `COUNT`, `UNTIL`, `BYDAY`,
`BYMONTH`, `BYMONTHDAY`, serta `EXDATE`. Occurrence diekspansi sampai 400 hari
ke depan; single event yang lebih jauh tetap disimpan.

**Halaman**: grid bulan penuh (7 kolom × 6 baris, Senin–Minggu). Hari ini
ditandai, hari dengan acara iCal atau catatan lokal punya dot aksen. Tombol
**Hari ini** kembali ke bulan berjalan; `‹`/`›` pindah bulan; klik hari
membuka popup editor. Popup `dyn-island-calendar` memakai `keymode: exclusive`
(station island tidak menerima keyboard) dan berisi grid yang sama, acara iCal
hari terpilih (read-only), serta catatan lokal yang bisa ditambah/dihapus.

**Catatan per hari**: disimpan di
`~/.local/share/dynamic-iland/calendar-notes.json` dengan bentuk
`{ "YYYY-MM-DD": [{ id, text, time, notifiedAt }] }`.

- `time` opsional (`HH:MM`). Tanpa jam, pengingat memakai
  `calendar.noteDefaultHour` (default 08:00).
- Catatan dicek tiap 30 detik. Jadwal yang terlewat ≤
  `calendar.noteCatchUpMinutes` (default 60) memicu
  `notify-send -a Notch`; yang lebih lama ditandai terlewat supaya tidak spam
  saat AGS restart/resume. Klik notifikasi membuka island.
- Data murni lokal: tidak masuk repo dan tidak dikirim ke jaringan.
- Debug: `dyn.calendarApi.add('2026-11-10','Meeting','09:00')`,
  `dyn.calendarApi.update('2026-11-10', id, 'Meeting baru', '10:00')`,
  `dyn.calendarApi.remove('2026-11-10', id)`, `dyn.calendarApi.check()`.

**Acara lokal**: section **ACARA** punya tombol **+ Tambah**; acara buatan
sendiri disimpan di `~/.local/share/dynamic-iland/calendar-events.json`
(`{ "YYYY-MM-DD": [{ id, title, time, end, notifiedAt }] }`). Jam mulai wajib,
jam selesai opsional, dan pengingat dikirim pada jam mulai (catch-up yang sama
dengan catatan). Acara iCal tetap read-only dan diberi badge `iCal`; acara
lokal punya tombol edit/hapus dengan konfirmasi inline. Debug:
`dyn.calendarApi.eventAdd('2026-11-10','Rapat','09:00','10:00')`,
`eventUpdate(...)`, `eventRemove(...)`, `eventCheck()`.

Uji parser dengan file lokal:

```bash
ags -r "const d=globalThis.dynIsland; d.config.calendar.icsUrl='/tmp/feed.ics'; const v=await d.refreshCalendar(); return JSON.stringify(v.events.slice(0,3))"
```

## Notifikasi WhatsApp Web (isi pesan tidak tampil)

Gejala: notifikasi WA Web (PWA WhatsApp di Brave/Chrome) hanya menampilkan nama
pengirim + fallback **"Pesan baru"**, tanpa isi pesan. Chip **Settings** juga
muncul padahal tidak berguna.

Penyebabnya **bukan** payload kosong dan bukan setelan pratinjau WhatsApp:
Chromium **menambahkan origin di depan body** pada setiap web notification,
sehingga body selalu berupa string multi-baris:

```
   string "localhost:8765

Baris satu
Baris dua "kutip""
```

`dbus-monitor` mencetak isi string apa adanya — newline menjadi baris baru dan
tanda kutip tidak di-escape. Parser lama mencocokkan **satu baris** dengan
`^string "(.*)"$`, jadi string multi-baris tidak cocok sama sekali: body hilang,
`bodyMissing=true`, dan popup hanya menampilkan judul + "Pesan baru". Semua
notifikasi Chromium terkena (WhatsApp, Gemini, web app lain), bukan hanya WA.

Perbaikan di `modules/notify.js`:

- **`pendingString`**: baris lanjutan sebuah string dikumpulkan sampai tanda
  kutip penutup, lalu diproses sebagai satu nilai. Berlaku untuk header
  (app/icon/summary/body), actions, dan key hints.
- **`cleanBody()`**: untuk aplikasi browser, prefix origin
  (`web.whatsapp.com\n\n`, `localhost:8765\n\n`, boleh dengan scheme/port)
  dibuang; newline/whitespace dirapatkan jadi satu baris supaya muat di kartu
  popup dan halaman notify.
- **Action `settings` dibuang** untuk notifikasi browser: chip "Settings" milik
  Chromium membuka setelan notifikasi browser, bukan aksi pesan.
- Log diagnostik mencetak `body` (mentah, newline di-escape JSON) dan `shown`
  (hasil bersih yang dipakai UI).

Verifikasi tanpa menunggu pesan WA asli: halaman lokal di Chrome yang memanggil
`new Notification('Cimi Mochi Cimi Michi', { body: 'Halo, ini isi pesan…' })`
mengirim payload `localhost:8765\n\nHalo, ini isi pesan…`. Popup menampilkan
**judul + isi** (`shown="Halo, ini isi pesan…"`, `actions=["default","Activate"]`);
screenshot kartu mengonfirmasi teks isi tampil dan chip Settings hilang.
Uji multiline dengan `notify-send` juga lolos
(`body="baris satu baris dua baris empat"`).

Kalau `body` di log benar-benar `""` (mis. pratinjau pesan dimatikan), fallback
"Pesan baru" tetap dipakai; cek WhatsApp di HP → **Setelan → Notifikasi →
Pratinjau pesan**. Update yang datang tanpa body untuk `replaces_id` yang sama
tetap memakai body terakhir yang tersimpan (maks 30 id).

## Water

Halaman `water` (kartu 468×156): judul + **switch pengingat**, baris volume
besar (`1.25 / 1.5 L`) dengan **status ringkas di kanan** (`83% · 250 ml lagi`,
`CenterBox` — Grid tidak ada di AGS dan `hexpand` pada child Box diabaikan),
progress bar, dan pill **[Minum] [target] [−] [+]**, plus **grafik ml per jam**
(8 jam terakhir) dengan gridline putus-putus dan label jam (Pango). Jarak antar
baris 8px supaya progress bar tidak menempel ke teks/pill di atas-bawahnya.

- **Data & persistensi**: `~/.local/share/dynamic-iland/water.json`
  (`date`, `goal`, `bottle`, `log: { 'HH': ml }`, `reminder`, `lastReminder`).
  Disimpan dengan debounce 400ms, dibaca saat start. **Ganti hari → log
  direset, setelan (goal/bottle/reminder) dipertahankan.**
- **Drink** menambah `bottle` (250 ml) ke bucket jam sekarang; **−/+**
  mengubah goal kelipatan 250 (clamp 500..5000); switch mengubah pengingat.
- **Pengingat**: tiap menit dicek; pada jam 08:00–22:00 (sekali per jam) dikirim
  `notify-send "Waktunya minum"` berisi progres hari itu — hanya kalau goal
  belum tercapai. Tidak mensyaratkan tick tepat di menit ke-0, jadi tetap jalan
  setelah suspend/resume dan tidak dobel walau AGS restart (stamp per jam).
- Grafik menggambar 8 jam terakhir yang bergeser (redraw tiap menit), bar
  0 ml tetap digambar sebagai stub redup. **Skalanya mengikuti data**
  (minimum 400 ml, dibulatkan ke kelipatan 200) dan label gridline ikut skala
  itu — dulu selalu 400 ml sehingga 3 botol dalam satu jam langsung mentok.
- Pill **`−`/`+`** mengubah *target*, bukan jumlah minum — diberi caption
  kecil `target` di depannya supaya tidak tertukar dengan **Minum**.

## Todo

Halaman `todo` (kartu 468×156): header ringkas `Tugas · X/Y selesai ·
＋ Tambah`, list tugas full-width. Tiap baris berisi checkbox, teks, due,
tombol edit, dan tombol hapus. Tugas aktif di atas, selesai di bawah,
terbaru lebih dulu.

- **Data & persistensi**: `~/.local/share/dynamic-iland/todo.json`
  (`tasks: [{ id, text, done, due, notified }]`), debounce 400ms.
- **Create/Update**: tombol `＋ Tambah` atau pensil membuka editor window
  (`dyn-island-todo-editor`, `keymode: exclusive`) berisi teks + jatuh tempo
  opsional; Enter menyimpan, Esc membatalkan.
- **Delete**: tombol hapus memunculkan konfirmasi inline `Batal` / `Hapus`.
- Klik baris = toggle selesai; due notification tetap berjalan dan `notified`
  hanya direset jika jam due berubah.
- **Reminder**: tiap 30s dicek; task belum selesai yang `due`-nya sudah lewat
  (dan **belum lewat 1 jam** — jendela catch-up, supaya due yang terlewat saat
  AGS tidur/restart tetap diingatkan) dan belum `notified` memicu
  `notify-send "Tugas jatuh tempo" <teks>` (sekali saja).
  Terukur: task `@23:01` → `notified: true` + notifikasi masuk.

## Daily Standup

Halaman `standup` di island + popup (`modules/standup-window.js`, 560px) berisi
tiga **daftar** yang diisi tiap hari kerja. Halaman ringkasnya menampilkan tiga
chip 24px — **Kemarin N**, **Hari ini N**, **Blocker N** — dengan centang hijau
untuk bagian terisi (blocker 0 juga centang) dan warning merah saat ada blocker.

| Bagian | Judul |
|---|---|
| kemarin | `What did you do yesterday?` — khusus **Senin**: `What did you do on Friday?` |
| hari ini | `What will you do today?` |
| blocker | `Any blockers?` |

- Item ditambah lewat **Enter** atau tombol `+`, dihapus dengan `×`. Bagian
  berupa daftar (bisa banyak poin), bukan satu kotak teks.
- Halaman island menampilkan `Tersimpan · kemarin 2 · hari ini 1 · blocker 1`
  dan pill **Isi/Lihat** untuk membuka popup.
- Bagian "kemarin" **terisi otomatis** dari daftar "hari ini" pada hari kerja
  sebelumnya (`titleForDay()` menentukan judul Senin vs hari lain), jadi popup
  selalu dibuka dengan riwayat.
- **Pengingat Senin–Jumat 10:00**: lonceng (`canberra-gtk-play -i bell`) +
  notifikasi berikon lonceng `Hey Rafi, it's time for daily standup`. **Klik
  notifikasi → popup terbuka.** Dilewati kalau hari itu sudah disimpan;
  tanggal terakhir yang diingatkan disimpan di `standup-reminded` supaya
  restart AGS tidak mengulang. Kalau AGS baru hidup setelah 10:00 dan belum
  diisi, pengingat muncul sekali (catch-up).
- Klik ditangani **registry aksi lokal** di `modules/notify.js`
  (`registerLocalAction`): notifikasi yang dikirim island sendiri tidak punya
  pemilik aksi di DBus, jadi round-trip `ActionInvoked` tidak bisa dipakai.
- **Data**: `~/.local/share/dynamic-iland/standup.json` (60 hari terakhir),
  hanya lokal — tidak dikirim ke mana pun.

## Cuaca (Open-Meteo)

Halaman `weather` memakai **Open-Meteo** — gratis, tanpa API key/akun.

- Koordinat & kota mengikuti blok `prayer` (`latitude`, `longitude`, `city`);
  bisa ditimpa lewat `config.weather`.
- `modules/weather.js` mengambil kondisi sekarang (suhu, terasa, angin,
  kelembapan, kode WMO), data **hourly** (suhu, kode, is_day) dan 3 hari ke
  depan, menyimpan hasil terakhir ke
  `~/.local/share/dynamic-iland/weather.json` supaya tetap ada isi saat offline,
  dan refresh tiap **15 menit** — hanya kalau `modules.weather` aktif.
- Halaman menampilkan **strip 3 jam ke depan** (jam, glyph, suhu) di bawah hero;
  hourly lama tanpa `is_day` dianggap siang sampai refresh berikutnya.
- Kode WMO dipetakan ke label Indonesia + glyph Nerd Font (matahari, bulan,
  awan, tetes, salju, petir); malam memakai glyph bulan.
- `closedIndicators` menerima `weather` untuk menampilkan suhu di notch tertutup.

## Timer & Stopwatch

Halaman `timer` (terpisah dari pomodoro yang bersiklus):

- **Timer bebas** dengan preset 1/3/5/10/15/25/45/60 menit, play/pause, reset.
- **Stepper ±1 menit** di baris aksi (target 24px, rentang 1–90 menit); hanya
  aktif saat timer berhenti, bukan saat berjalan.
- **Stopwatch** yang menyimpan `elapsed` saat dijeda.
- Hitungan memakai **deadline** (`Date.now()`), jadi tetap benar setelah sleep
  atau AGS restart; `timer.json` hanya ditulis saat status berubah (tick per
  detik tidak menyentuh disk).
- Selesai: `complete.oga` + notifikasi lewat pipeline popup yang sama.
- `closedIndicators` menerima `timer` untuk menampilkan sisa waktu.

## Kesehatan (jeda mata & gerak)

`modules/wellness.js` — dua pengingat lokal, tanpa data & tanpa jaringan:

| Pengingat | Default |
|---|---|
| Jeda mata **20-20-20** | tiap 20 menit, "lihat objek ~6 meter selama 20 detik" |
| Gerak | tiap 60 menit, "berdiri dan bergerak ringan 2 menit" |

- Hanya aktif di dalam `wellness.startHour`–`endHour` (default 08:00–22:00) dan
  bisa dimatikan lewat `config.wellness.enabled` atau `wellnessToggle()`.
- Pengingat dijadwalkan ulang setelah menyala, jadi laptop yang baru bangun
  tidak menumpuk notifikasi.

## Statistik Sistem

Halaman `stats` membaca satu JSON dari **`hypr-status stats`** (Rust, tanpa
fork):

| Data | Sumber |
|---|---|
| CPU % | dua sampel `/proc/stat` berjarak 150 ms → realtime, bukan rata-rata boot |
| RAM & swap | `/proc/meminfo` (used = total − available) |
| Suhu | `hwmon` (`k10temp`, `zenpower`, `coretemp`, `amdgpu`), nilai tertinggi |
| Load & uptime | `/proc/loadavg`, `/proc/uptime` |
| Disk `/` dan `/home` | `statvfs` (libc), bukan `df` |

- Tampilan: tiga kartu (CPU / RAM / SUHU) dengan **sparkline 13px** berisi 15
  sampel terakhir (±30 detik; sampel pertama mengisi garis datar) — aksen
  normal, warna bahaya di atas 80% — plus footer redup `disk / …` dan `swap …`.
- `modules/sysstats.js` **hanya polling 2 detik saat halaman terbuka**; pindah
  halaman langsung menghentikan timer, jadi tidak ada proses yang jalan di
  latar belakang.
- Terukur: satu panggilan 0,15 s, binary 400 KB.

## HUD yang bisa digeser

Bar volume & brightness di OSD bukan lagi indikator pasif:

- Klik di titik mana pun atau **geser** untuk mengatur nilai; area interaksi
  **34px** (bar 6px di tengah, 13px ruang atas untuk bubble) dan ada knob kecil
  di ujung isi. Saat drag, bubble nilai (`73%`) mengikuti knob.
- Volume memakai service `Audio` AGS dan otomatis melepas mute saat digeser di
  atas nol. Klik ikon speaker = mute/unmute, **double-click = 100%**; target
  ikon 24×24. Nama device (`description` sink) tampil di bawah bar.
- Brightness memakai **`brightnessctl`** karena file sysfs-nya `root:video` dan
  user ini tidak ada di grup `video`. Ikon berganti 3 tingkat: bulan (<34%),
  bohlam (<70%), matahari (≥70%); nama backlight tampil di bawah bar.
- Timer OSD tetap berlaku: notch menutup ~1,6 detik setelah drag dilepas.

## Pengaturan

Halaman `settings` (kartu **520×232**, tab gear paling kanan) berisi daftar
baris 24px yang bisa di-scroll; wheel di atas halaman ini menggulir daftar,
bukan pindah halaman.

Disimpan di **`~/.config/dynamic-iland/settings.json`** dan dibaca sebelum
modul lain dievaluasi (lihat urutan import `index.js`), sehingga override
`CONFIG.modules`, geometry, `defaultPage`, dan `notch` sudah aktif saat state,
nav, dan Stack dibangun. `settings.json` hanya berisi preferensi; API key tetap
di `.env`/`gemini.json` dengan permission terpisah.

| Baris | Nilai | Kapan berlaku |
|---|---|---|
| Glow cover | Aktif / Nonaktif | **langsung** — `glow` Variable; accent sky & border cover ikut mati |
| Ukuran notch | Normal / Kecil / Besar (hanya state **closed**) | restart AGS |
| Ikuti monitor fokus | Aktif / **Tetap** | restart AGS; "Tetap" memasang notch ke monitor saat dibuat, tidak ikut pindah |
| Notch di semua monitor | Aktif / Nonaktif | restart AGS; mirror closed-only di monitor lain, bukan island interaktif kedua |
| Halaman default | Ringkasan / Cuaca / Statistik / Tugas | langsung pada `basePage()` berikutnya (media player tetap menang) |
| 12 modul | Aktif / Nonaktif | restart AGS; halaman yang dimatikan hilang dari `PAGE_ORDER` |
| Indikator notch | urutan naik/turun; atas = prioritas | restart AGS |
| Notifikasi | daftar app yang dibisukan | langsung; baris **Bunyikan** mengaktifkan lagi |

- Ukuran **Kecil** = 140×46 (ear 9), **Besar** = 170×56 (ear 11), **Normal**
  = config 150×50. Progress hairline closed ikut lebar geometry.
- Halaman `settings` sendiri selalu ada (tidak bisa dimatikan) supaya pengguna
  tidak terkunci tanpa UI untuk mengaktifkan modul lagi.
- Tujuh indikator (`musik`, `pomodoro`, `timer`, `tugas`, `air`, `cuaca`,
  `tanggal`) semuanya tetap ada; tombol naik/turun hanya mengubah urutan.
  Indikator pertama yang punya nilai yang dipakai notch tertutup, jadi
  menaikkan `Cuaca` ke atas membuat suhu mengalahkan tanggal.
- **Notch di semua monitor** membuat mirror **closed-only** di setiap monitor
  selain monitor island interaktif. Island interaktif tetap satu (mengikuti
  fokus atau tetap), jadi nav/page/state tidak diduplikasi. Mirror memakai
  `Closed()` + sky/ear yang sama, ikut compact/normal/large dan glow, tidak
  menerima input, dan disembunyikan otomatis di monitor island. Saat monitor
  ditambah/dicabut, mirror dibangun ulang lewat sinyal Gdk; pada satu monitor
  tidak ada mirror yang terlihat (monitor primary).
- `closedIndicators` ikut disimpan; config.js tetap menjadi default saat file
  belum punya array tersebut.
- Tombol/toggle memakai target 24px; header menampilkan catatan
  `modul/ukuran: restart AGS`.
- Uji: `cat ~/.config/dynamic-iland/settings.json`; ubah lewat halaman lalu
  restart AGS.

## Shelf

Halaman `shelf` (kartu 468×156): judul `Shelf` + jumlah item + chip
**Hapus semua**, dan isinya salah satu dari:

- **Drop zone** (kotak garis putus-putus `380×54`): ikon tray +
  "Letakkan berkas di sini" → berubah jadi **"Lepas untuk menambah"** + border menyala saat
  ada drag masuk.
- **Kartu file** (horizontal, `Scrollable` jadi bisa digeser): thumbnail 36px
  (gambar asli via `Pixbuf.new_from_file_at_size`; folder/berkas lain pakai
  ikon tema), nama (truncate tengah), dan ukuran (`2.4 MB`, `16 KB`, `8 B`)
  atau `Folder`.

Interaksi:

- **Drag masuk**: `EventBox` notch didaftarkan sebagai drop target
  (`text/uri-list` saja — dulu `text/plain` ikut diterima sehingga potongan teks
  apa pun jadi item "hilang"). Saat `drag-motion` notch dibuka + drop zone
  ditampilkan; `drag-data-received` → `addPaths(data.get_uris())`
  → halaman shelf di-pin supaya item baru terlihat. `drag_finish` melaporkan
  sukses hanya kalau benar-benar ada item baru.
- **Klik** kartu → `xdg-open`. **Klik kanan** → hapus dari shelf.
  **Drag keluar** → kartu adalah drag source `text/uri-list`, jadi bisa
  diseret ke file manager / chat / email.
- **Klik kanan sempat tidak berfungsi**: handler lama memakai
  `event.button !== 3`, padahal GJS tidak mengekspos field event
  (`event.button` selalu `undefined`) — akibatnya kartu tidak pernah terhapus
  walau sudah diklik kanan. Sekarang memakai `eventButton(event)` dari
  `modules/pointer.js` (`event.get_button()`).
- **Hapus semua** mengosongkan seluruh shelf (tombol ini juga satu-satunya
  jalan kalau item sudah banyak). Aksi destruktif (**Hapus semua** dan
  klik-kanan hapus) bisa **diurungkan** satu langkah lewat chip **Urungkan**
  yang muncul 8 detik (`shelfUndo`/`undoLast()` di `modules/shelf.js`). Nama
  file dipotong 12 karakter (dulu 9) dan kalau item lebih banyak dari yang muat
  (4 kartu), label jumlah berubah jadi `N item · geser ›` sebagai penanda
  daftarnya bisa digeser.

Catatan penting:

- Shelf menyimpan **referensi** ke file asli (`shelf.json`), **bukan
  salinan** — jadi tidak ada duplikasi data dan file user tidak pernah
  dihapus. Kalau file-nya sudah pindah/hilang, item ditandai `missing: true`
  dan tampil redup dengan label `hilang`.
- Uji drag & drop nyata (drag dari file manager ke notch) tidak bisa
  disimulasikan di sesi pengembangan ini (tidak ada `ydotool`/`wtype`),
  sehingga yang diverifikasi adalah: registrasi drop target (0 error),
  jalur data (`addPaths`), UI, dan persistensi.

## Navigasi (tab strip ikon + panah)

Saat **expanded** (dan di state lirik), muncul baris navigasi `‹ [7 ikon] ›`
di bawah-tengah kartu (latar **transparan** — hanya ikon, titik, dan panah yang
terlihat). Tujuh slot menampilkan jendela `PAGE_ORDER` di sekitar halaman aktif:
halaman aktif selalu terlihat, slot lain bergeser saat halaman berubah. Ikon
aktif memakai kapsul aksen; saat tampilan lirik terbuka, tab **media** tetap
aktif (lirik bukan halaman nav).

Kalau `PAGE_ORDER` lebih dari 7 halaman, baris titik 3px di bawah ikon menjadi
indikator posisi (titik aktif memanjang & terang). Dengan modul bawaan, urutannya
idle, media, weather, calendar, pomodoro, timer, stats, water, todo, standup,
shelf, bluetooth, prayer, chat, settings.

Klik ikon memanggil `pinPage()`; `chat` bertahan sampai user pindah halaman,
halaman lain di-pin selama `pinTimeout` (10s) lalu kembali ke `basePage()`.
Panah memanggil `stepPage(±1)` dengan aturan pin yang sama. Transient tetap
menimpa pin dan kembali ke halaman yang di-pin
(`restingPage = pinned ?? basePage()`). Di tampilan lirik, panah **kiri**
mengembalikan ke kartu musik (bukan ke halaman sebelumnya) dan panah kanan tetap
lanjut ke halaman berikutnya; pindah halaman selalu menutup sub-tampilan lirik.
Nav adalah `Gtk.Overlay` sehingga **tidak menambah ukuran** notch, tapi ruangnya
dipotong dari tinggi isi konten (`stack.margin_bottom = NAV_SPACE = 34`) — lihat
bagian Motion. Target klik ikon dan panah 24px dan semuanya punya tooltip.
Tab aktif memakai kapsul aksen + ring inset 1px sebagai indikator fokus.
**Scroll wheel di atas notch** memanggil `stepPage(±1)`; halaman yang punya
scroll internal (`chat`, `todo`, `shelf`, `settings`, lirik) tidak ikut
berpindah halaman agar wheel tetap menggulir isinya.

**Panah aktif saat press, bukan release.** Nav di-anchor ke dasar notch,
jadi selama notch membuka/menutup posisinya ikut bergerak (terukur: posisi nav
`y≈93..114` di 120ms pertama, `y=107..128` setelah settle). Kalau aksi menunggu
release, tombol sudah pindah dan release jatuh di luar tombol → klik dibatalkan.
Dengan aksi di press, yang diklik adalah posisi yang terlihat saat itu juga.

**Hover diambil dari window layer-shell, bukan EventBox.** EventBox punya
GdkWindow sendiri, tetapi anaknya (`clip`/GtkScrolledWindow) juga punya
GdkWindow dan mengisi 100% areanya. GDK mengirim crossing event ke window
terdalam (clip) dan propagasi berhenti di batas window itu — terukur
`enter-notify` di EventBox = **0** walau kursor tepat di notch. Karena itu
`enter/leave-notify` dipasang di window island; window selalu menerima crossing
untuk seluruh surface. Karena surface juga mencakup area transparan saat lebar
dikunci, `enter` divalidasi dengan `event.get_coords()` (window-local) terhadap
badan visual island — pointer yang masuk dari samping tidak membuka notch.
Saat pointer pindah ke child ber-GdkWindow (tombol, dots, DrawingArea, isi
halaman), GTK mengirim `leave` (detail INFERIOR), sehingga setiap `leave`
memeriksa posisi pointer sebenarnya lewat `hyprctl -j cursorpos` + rect monitor
logis yang di-cache, dan hanya menutup kalau pointer benar-benar di luar badan
island. Token mencegah hasil pemeriksaan yang basi menutup notch setelah
pointer kembali masuk.

**Hit-test memakai koordinat logis.** `hyprctl -j monitors` memberi `x/y` logis
tetapi `width/height` **fisik**, sedangkan `cursorpos` dan GDK memakai
koordinat logis. Pada scale `0.8333` (1920 fisik → 2304 logis), mencampur
keduanya menggeser hotspot hover **191px** — terukur: kursor di tengah notch
(5224) dianggap di luar, sedangkan kursor 5033 (191px di kiri) justru membuka
island. `modules/monitor.js` sekarang menormalkan `width/height` ke logis
(`/ scale`, dibulatkan) sebelum dipakai hit-test maupun pemetaan monitor.
Pembulatan penting: `1920 / 0.8333333 = 2304.00009`, sedangkan GDK melaporkan
`2304` — tanpa pembulatan/toleransi, `gdkIndex()` gagal dan island tidak pindah
monitor saat fokus berpindah ke layar fractional.

Tiga bug hover yang ditemukan lewat audit uinput:

- **Notch bisa tertahan terbuka saat pointer keluar lewat padding.**
  `leave-notify` tidak selalu terkirim saat pointer keluar melewati child
  (isi halaman) menuju luar. Sekarang ada **watchdog 100ms selama hover** yang
  membaca `cursorpos` dan menutup kalau pointer sudah di luar; sakelar token
  tetap dipakai supaya hasil basi tidak menutup notch yang baru dimasuki.
- **Hover-intent dibatalkan oleh leave dari child.** Setelah jeda 120ms
  ditambahkan, masuk ke notch menghasilkan `enter` lalu `leave` ~14ms kemudian
  karena pointer pindah ke child ber-GdkWindow (clip/DrawingArea); `leave` lama
  langsung membatalkan timer sehingga notch sering tidak pernah terbuka.
  Sekarang `leave` menunggu hasil `pointerOnIsland()` dan hanya membatalkan
  timer/menutup kalau pointer benar-benar di luar badan island. Terukur: tiga
  siklus masuk/keluar berturut-turut membuka ke 420px dan menutup ke 150px.
- **Submap `island` tertinggal aktif setelah island tertutup.** `nav.visible`
  baru menjadi false di akhir tween (620ms), padahal nav sudah tidak terlihat
  sejak ~200ms — panah masih tertelan selama sisa animasi. Sekarang submap
  memakai `navActive` (state target, bukan visibilitas visual) dan dilepas
  begitu island mulai menutup; terukur `hyprctl submap` kembali `default`
  segera setelah pointer keluar.

Skenario yang diuji dengan pointer nyata: hover di child (panah), padding atas
y=2, tepi bawah y=h vs h+6 (dulu gagal, sekarang menutup), keluar 30ms lalu
masuk lagi (token), burst masuk/keluar 8×60ms, dan masuk kembali saat animasi
tutup berjalan (kartu terbuka lagi). Semua konsisten, 0 error. Watchdog juga
diuji dengan pointer diam di dalam 6 detik: tidak ada flicker (stabil).

**Lebar window dikunci selama transisi lebar.** Perpindahan lirik (520) ↔ kartu
lain (420) mengubah lebar. Dua jebakan yang sudah diukur:

- **Resize surface tiap frame menelan press mouse** (dua klik cepat
  lirik→pomodoro: animasi per-frame **2/3** vs lebar terkunci **6/6**). Karena
  itu lebar wrapper dikunci ke maksimum(dari, ke) sampai animasi selesai, lalu
  dilepas.
- **Wrapper harus `Widget.CenterBox`, bukan `Box`.** AGS mem-*pack* child Box
  dari kiri, jadi di dalam window yang lebarnya dikunci frame bergeser ~50px ke
  kiri selama kartu menyusut lalu *snap* balik di akhir. Akibatnya pill nav
  terlihat bergeser, klik "next" meleset, dan pointer bisa keluar dari area
  hover sehingga island menutup. Dengan `CenterBox`, pusat frame terukur
  **konstan 959.5–960 px di semua frame animasi**.

### Temuan audit animasi (terukur per frame)

Sampling 16ms selama buka/tutup menangkap empat hal yang lalu diperbaiki:

- **Nav menimpa konten closed.** `nav.visible` dinyalakan sejak frame pertama,
  jadi pill sempat tampil di posisi y=-3 pada window 30px. Sekarang opacity nav
  mengikuti tinggi kartu (`(h-60)/40`, 0 di bawah 60px, penuh di 100px) dan
  nav baru `sensitive` setelah alpha > 0.6. Ruang nav (`stack.margin_bottom`)
  juga baru dipotong saat konten berganti (200ms), bukan di frame pertama.
- **Width window berayun saat overshoot.** Tween punya overshoot 1.32; notch
  429px + telinga membuat window ikut melebar 464 → 473 → 464 (surface resize
  per frame). Lock width sekarang diberi headroom 16px → **480px konstan**
  selama animasi, turun ke 464 sekali di akhir.
- **Radius snap.** `border-radius` di-set sekali (14 ↔ 32) di awal state.
  Sekarang diinterpolasi 5 langkah di dalam tween.
- **Tutup undershoot.** Kurva yang sama membuat notch sempat mengecil ke
  **141×26** sebelum "pop" balik ke 150×30. Nilai w/h/ear di-clamp ke target
  saat menutup.
- Konten closed saat menutup sekarang fade-in 140ms (dulu langsung opacity 1).
- **Hover out: dua konten tampil bersamaan.** Rekaman frame 0–250ms menunjukkan
  konten media dan konten closed terlihat tumpang tindih saat menutup: Stack
  memakai `transition: crossfade` (180ms) sekaligus kode memaksa `opacity 0`
  lalu fade-in. Sekarang transisi Stack dimatikan saat melewati state `closed`
  (`setShown()`: `none` untuk closed <-> page, `crossfade` tetap untuk
  page <-> page), jadi hanya ada satu konten yang terlihat dan pergantiannya
  diurus fade opacity.
- **Kartu kosong sesaat saat menutup.** Frame merekam satu kartu hitam tanpa
  isi di tengah penyusutan: konten media hilang seketika, sedangkan konten
  closed masih fade dari opacity 0. Sekarang konten closed langsung terlihat
  (opacity 1) pada saat swap, jadi tidak ada frame kosong.
- **Surface resize per frame saat menutup.** Lebar window dikunci ke
  `max(lebar teralokasi, geometri target)`; konten media bisa lebih lebar dari
  geometri (480 vs 464). Lock dilepas saat notch visual mencapai target, bukan
  menunggu `onDone` (~620ms). Terukur close nyata 420→150 selesai ~284ms dengan
  window **480 konstan**, lalu turun sekali ke 170 — tanpa resize 480→464 per
  frame dan tanpa area transparan 464px yang menetap.
- **Lock lebar 480px bisa tertinggal.** Reset lebar dulu hanya terjadi di
  `onDone` dan hanya jika animasi mengubah lebar. Kalau animasi buka dihentikan
  sebelum frame pertama (hover flicker <16ms), `geo.w` masih 150 sehingga
  animasi tutup menghitung `widthChanges=false` dan lock 480 tidak pernah
  dilepas — surface transparan 480×50 menetap di atas bar. Sekarang reset juga
  dijalankan saat animasi tidak mengubah lebar; terukur 170×50 setelah 20×
  flicker 5ms.
- **Radius 10 langkah** (dari 5) supaya perubahan sudut saat menyusut tidak
  terlihat "bertingkat".
- **Watchdog hover 100ms** (dari 150ms) supaya penutupan mulai lebih cepat.
- **Hover out: konten closed melompat 15px.** Saat mulai menutup, ruang nav
  (`stack.margin_bottom`) dulu dicabut sekaligus 34 → 0 sehingga konten closed
  turun mendadak (terukur `closedY 47 → 62`, terlihat seperti "adjustment").
  Sekarang margin disusutkan mengikuti tinggi kartu: `closedY 46 → 45 → 39 →
  34 → 29 → 24 → 23 → 20`, monoton tanpa lompatan.
- Catatan: `leave-notify` tidak selalu terkirim saat pointer keluar melewati
  child (isi halaman) menuju luar, jadi penutupan normal bisa tertunda sampai
  watchdog 100ms berikutnya; delay itu yang membatasi.

Interupsi juga diuji: buka 200ms lalu tutup (379×123 → … → 150×50 tanpa
lompatan) dan tutup 200ms lalu buka lagi (191×47 → … → 468×156).

Catatan perilaku: **transient hanya memakai geometri peek saat notch tertutup**.
Kalau pointer sedang hover, konten OSD/notifikasi ditampilkan di dalam kartu
besar supaya notch tidak menyusut di bawah kursor dan hover tidak tertahan
selama durasi peek.

### Keyboard (panah kiri/kanan)

- **`SUPER+N`** membuka/menutup island **tanpa hover** (gaya `Alt+N` di Poni).
  Flag `forcedOpen` menahan watchdog hover dan `leave-notify`, jadi notch tetap
  terbuka walau kursor pindah; hotkey yang sama menutupnya lagi, dan `Escape`
  di submap `island` juga memanggil `closeIsland()`.
- **Klik di luar notch menutup island.** Saat `forcedOpen`, window
  `dyn-island-clickaway` (layer top, transparan, penuh layar) di-map. Input
  shape-nya dilubangi selebar badan notch (mengikuti geometri lirik/sholat/chat),
  jadi klik di dalam notch tetap sampai ke island di bawahnya, sedangkan klik di
  luar ditelan dan memanggil `closeIsland()`. Layer ini tidak dipakai saat hover
  biasa karena `leave-notify` sudah menutup notch; ia juga dilepas saat island
  dibangun ulang atau hotkey menutup paksa.

Window island memakai `keymode: 'none'` — ia **tidak pernah** mengambil fokus
keyboard, jadi tombol panah tidak bisa ditangkap langsung oleh GTK. Navigasi
dipasang lewat **submap Hyprland** (`island`). Pada Hyprland 0.57 dengan config
Lua, `install.sh` menambahkan blok ke
`~/.config/hypr/UserConfigs/UserKeybinds.lua`:

```lua
-- dyn-island-kbd: begin — panah kiri/kanan untuk navigasi halaman island.
hl.define_submap("island", function()
  hl.bind("left", hl.dsp.exec_cmd([[ags -r "globalThis.dynIsland.navKey(-1)"]]), { description = "island: prev" })
  hl.bind("right", hl.dsp.exec_cmd([[ags -r "globalThis.dynIsland.navKey(1)"]]), { description = "island: next" })
  -- reset submap + tutup island (forcedOpen ikut dilepas)
  hl.bind("escape", hl.dsp.exec_cmd([[sh -c 'hyprctl dispatch "hl.dsp.submap(\"reset\")"; ags -r "globalThis.dynIsland.closeIsland()"']]), { description = "island: close" })
end)
-- dyn-island-kbd: end
```

Untuk config hyprlang lama (`.conf`), blok yang sama memakai dispatcher Lua
karena sintaks `hyprctl dispatch submap ...` sudah dihapus di 0.57:

```conf
submap = island
bind = , left, exec, ags -r "globalThis.dynIsland.navKey(-1)"
bind = , right, exec, ags -r "globalThis.dynIsland.navKey(1)"
bind = , escape, exec, sh -c 'hyprctl dispatch "hl.dsp.submap(\"reset\")"; ags -r "globalThis.dynIsland.closeIsland()"'
submap = reset
```

- **Panah bersifat consuming** (`bind`, bukan `bindn`): selama island terbuka,
  panah **tidak** diteruskan ke aplikasi fokus. Menonton YouTube sambil hover
  notch lalu menekan → tidak akan ikut seek/scroll.
- Submap hanya aktif saat nav aktif (mulai membuka sampai mulai menutup);
  `index.js` yang mengurus switch-nya (`syncSubmap()`, debounce 80 ms, hanya
  `default → island` dan `island → reset`, jadi submap lain seperti resize
  tidak terganggu).
- Di tampilan lirik, **← kembali ke kartu musik** dan → lanjut ke halaman
  berikutnya (lirik bukan halaman nav, hanya sub-tampilan media).
- Di luar island (submap `default`), panah 100% normal.
- **`escape`** di dalam submap = jalan keluar manual bila submap tertinggal
  (mis. AGS mati saat island terbuka). `index.js` juga menjalankan
  `hl.dsp.submap("reset")` saat start sebagai jaring pengaman.
- Catatan trade-off: selama submap `island` aktif, bind lain (mis.
  `SUPER+←/→` untuk pindah workspace) tidak aktif — hanya selama pointer berada
  di atas notch.
- `uninstall.sh` menghapus blok ini (dan blok `bindn` versi lama) lagi, lalu
  `hl.dsp.submap("reset")` + `hyprctl reload`. Backup: `.dyn-island.bak`.

### Chat (Gemini)

Halaman `chat` memakai Gemini API **non-streaming** dan input teks lewat
**rofi** (window island memakai `keymode: 'none'`, jadi tidak mengambil fokus
keyboard). Klik **Tanya Gemini** → rofi muncul → ketik pertanyaan → Enter.
Jawaban tampil di kartu; selama menunggu ada teks "Gemini sedang mengetik…".
Tiap pesan punya avatar (user/Gemini) dan timestamp `HH:MM` di dalam bubble
(pesan lama tanpa `at` tidak menampilkan waktu). Tombol **Hapus** membersihkan
riwayat, **Ulangi** mengirim ulang pesan terakhir saat terjadi error. Halaman
chat bersifat sticky — tidak reset setelah 10 detik seperti halaman lain.

Persiapan:

```bash
mkdir -p ~/.config/dynamic-iland
cp .env.example ~/.config/dynamic-iland/.env
chmod 600 ~/.config/dynamic-iland/.env
# edit file tersebut, isi GEMINI_API_KEY=...
```

- API key **tidak** disimpan di repo atau `config.js`. Urutan pencarian:
  environment `GEMINI_API_KEY` → `~/.config/dynamic-iland/.env` →
  `~/.config/dynamic-iland/gemini.json` (`{"apiKey":"..."}`, fallback lama).
  Modul memberi peringatan di log kalau permission file terlalu terbuka.
- Request memakai `curl`. Key diletakkan di file config curl sementara (0600),
  **bukan argv**, supaya tidak terlihat di `ps`. Body percakapan juga file
  sementara 0600 dan dihapus setelah selesai.
- Model default `gemini-3.5-flash-lite`, tanpa skill context. Uji 2026-11:
  end-to-end **~1.2s**; 3.6 Flash ~2.7s; 3.8 Flash 503 high demand.
  `maxOutputTokens` 300 dan `timeoutSec` 30 membatasi waktu tunggu.
  `systemPrompt`, `maxTurns`, `maxOutputTokens`, dan `timeoutSec` bisa diubah.
- Riwayat hanya di memori; restart AGS menghapusnya. Isi percakapan dikirim ke
  Google sesuai ketentuan Gemini API.
- Selama rofi terbuka, submap `island` dinonaktifkan sementara supaya Escape
  dan panah di rofi tidak ditelan; setelah rofi selesai submap dihitung ulang.
- Butuh `rofi` dan `curl`. Kalau rofi tidak terpasang, kartu menampilkan error.

## Konfigurasi (`config.js`)

| Knob | Arti |
|---|---|
| `monitor` | `'focused'` atau index monitor |
| `marginTop` | jarak dari tepi atas (0 = nempel) |
| `geometry` | `closed` / `expanded` / `peek`: `{ w, h, r, ear }` |
| `motion` | `reduced`, `sizeDuration`, `sizeCurve` |
| `defaultPage` | halaman `basePage()` saat tidak ada media (default `idle`) |
| `notch` | `{ size: 'normal'|'compact'|'large', followFocus: boolean, perMonitor: boolean }` |
| `glow` | `false` untuk mematikan accent cover di sky/border cover |
| `osdTimeout` / `notifyTimeout` | durasi peek (ms) |
| `pinTimeout` | durasi halaman pilihan manual (ms) |
| `contentDelay` / `contentFade` | jeda & durasi fade-in konten (ms) |
| `mediaMaxChars` / `notifyMaxChars` | pemotongan teks |
| `prayer` | `{ latitude, longitude, city, method, notify, catchUpMinutes }` — jadwal sholat lokal |
| `chat` | `{ model, systemPrompt, maxTurns, maxOutputTokens, thinkingLevel, timeoutSec }` — Gemini; API key dari `GEMINI_API_KEY` / `~/.config/dynamic-iland/.env` |

Nilai `modules`, `glow`, `defaultPage`, `notch`, `closedIndicators`, dan
`mutedApps` bisa ditimpa dari `~/.config/dynamic-iland/settings.json` lewat
halaman **Pengaturan**.

### Warna

Badan notch **hitam murni opaque** (`NOTCH_COLOR`/`NOTCH_ALPHA` di
`theme.js`), telinga memakai warna yang sama (Cairo) jadi tanpa seam.
Badan notch digambar Cairo di `modules/sky.js` (CSS `background-color`
transparan) supaya bisa ditimpa **background langit**: gradient glow rendah
alpha + bintang mengikuti waktu sholat — hitam primary tetap mayoritas.
Tanpa border; box-shadow tidak dipakai karena layer surface setinggi notch
membuat apa pun di luar kotak widget ter-clip. Warna **teks & aksen** tetap
dari wallust (`__FG__`, `__ACCENT__`, `__ACCENT2__`, `__MUTED__`).

Sejak perbaikan tema, **permukaan** juga ikut palet — dulu semua latar
pill/chip/kartu/hover memakai `rgba(255,255,255,…)` hardcoded sehingga
tabrakan dengan tema apa pun:

| Token | Dipakai untuk |
|---|---|
| `__SURFACE_DIM__` / `__SURFACE__` / `__SURFACE_HOVER__` / `__SURFACE_STRONG__` | latar kartu, pill, chip, tombol nav, hover, pill nav |
| `__DANGER__` / `__DANGER_SOFT__` | tombol hapus todo (label & latar hover) |
| `__OK__` | ring baterai saat mengisi daya + centang todo |

`danger`/`ok` tidak ada di palet wallust standar, jadi bisa di-override dengan
menambahkan `@define-color danger #…;` / `@define-color ok #…;` di template
wallust (`colors-waybar.css`); kalau tidak ada, `theme.js` memakai default yang
terbaca di atas notch hitam. `hexToRgb()` sekarang menolak nilai non-hex
dengan peringatan, bukan diam-diam menjadikan semua aksen hitam.

## Instalasi

```bash
./install.sh     # symlink + patch config.js + patch CSS waybar + restart
./uninstall.sh   # membatalkan semuanya
```

`install.sh` idempoten dan **harus dijalankan ulang setiap ganti theme
waybar** (penyeimbang tinggi bar ada di CSS theme itu). Integrasi ke AGS
hanya satu baris di `~/.config/ags/config.js`:

```js
import './dynamic-iland/index.js'; // dyn-island
```

## Perubahan pada dotfiles lain

Supaya notch tidak bertabrakan dengan bar/notifikasi bawaan (semua di-backup
ke `~/.config-backup-dynisland-<timestamp>/`):

1. **Waybar config** — `modules-center` dikosongkan; modulnya dipindah
   (`app_drawer`/`workspaces` ke kiri, `notify`/`weather`/`idle_inhibitor`/
   `hint` ke kanan; `clock` dihapus karena ada di notch).
2. **Waybar CSS theme** — `.modules-center` dibuat transparan (tanpa ini
   center kosong tetap menggambar blok mauve), `.modules-left/right` padding
   9px (bar 44px). Blok ini diberi marker `dyn-island: begin/end` supaya
   `uninstall.sh` bisa menghapusnya tanpa menelan CSS lain; blok format lama
   (tanpa marker) ikut dimigrasi otomatis saat install berikutnya.
3. **Waybar Modules** — `max-length` 22 pada `custom/playerctl` dan
   `hyprland/window` supaya section kiri tidak menabrak notch saat expanded.
4. **swaync** — `positionX: center` → `right`. Ini **tidak** dipatch otomatis
   oleh `install.sh` (config user tidak diubah tanpa sepengetahuannya); kalau
   masih `center`, install akan mencetak peringatan.
5. **OSD ganda** — `notify-send` di `Volume.sh` & `Brightness.sh`
   dinonaktifkan (OSD ditangani notch); suara tetap jalan.
6. **Hyprland keybind** — submap `island` berisi bind panah kiri/kanan yang
   *consuming* untuk navigasi island (lihat bagian Keyboard). Ditulis ke
   `UserKeybinds.lua` saat config Hyprland 0.57+ (Lua) aktif, atau ke
   `UserKeybinds.conf` untuk config hyprlang lama. Ber-marker
   `dyn-island-kbd: begin/end`, dengan backup `.dyn-island.bak`. Versi lama
   yang memakai `bindn` (non-consuming) dimigrasikan otomatis.
7. **swaync `style.css`** — dua blok append-only ber-marker, backup
   `.dyn-island.bak`: `dyn-island-notif` untuk popup
   (`.floating-notifications`) dan `dyn-island-cc` untuk panel control-center.
   Blok control-center disimpan di `swaync/control-center.css` dan ikut
   menyesuaikan tinggi panel + ukuran kartu lewat `config.json`
   (backup `.dyn-island-cc.bak`). Lihat bagian Notifikasi dan Control center.

## Struktur

```
config.js          knob konfigurasi (geometry, motion, timeout)
theme.js           warna notch (hitam solid) + palet wallust + placeholder CSS
state.js           page + hovered + logika transient/base/pin
spring.js          ramp ease-out + bezierTween (solver cubic-bezier)
draw.js            helper Cairo bersama (roundedRect)
style.css          styling (placeholder warna)
swaync/control-center.css  blok gaya panel control-center swaync (dipasang install.sh)
index.js           window, Stack, clipping, mesin geometri, registrasi AGS
modules/closed.js  ring + jam + tanggal/equalizer
modules/idle.js    jam besar + tanggal + ringkasan baterai/todo/air/bluetooth
modules/bluetooth.js  baris device Bluetooth terhubung (glyph + nama + baterai)
modules/bluetooth-page.js halaman detail bluetooth: info device + slider volume + mute
modules/prayer-calc.js  algoritma waktu sholat (PrayTimes) + pilihan metode
modules/prayer.js       state jadwal harian + pengingat + persistensi prayer.json
modules/prayer-page.js  halaman jadwal sholat (busur matahari + strip 5 waktu)
modules/sky.js          background langit notch: glow fajar/sunset + bintang per fase
modules/timefmt.js format jam, tanggal Indonesia, ticker global 1 detik + deteksi resume
modules/monitor.js pemetaan monitor Hyprland -> index GdkMonitor + ikuti monitor fokus
modules/media.js   kartu MPRIS (art, judul, artis, progress, kontrol)
modules/cover.js   album art Cairo: pixbuf dimuat sendiri, sudut membulat, fallback aman
modules/osd.js     volume (Audio service) + brightness (sysfs)
modules/notify.js  penyadap dbus Notify (+ actions & id untuk popup)
modules/notif-popup.js  popup kanan atas: slide, loading bar, durasi dari expire_timeout, watchdog hover, X, klik, chips
modules/nav.js     page dots (Cairo) + panah
modules/lyrics.js      fetch LRCLIB + parse LRC + cache
modules/lyrics-page.js tampilan lirik (sub-bagian media: meta kiri + daftar sinkron kanan)
modules/progress.js    progress bar Cairo bersama (media & lirik)
modules/pointer.js     helper event GJS: get_button()/get_coords() (field event undefined)
modules/chat.js        state chat + Gemini API (curl, key file 0600) + input rofi
modules/chat-page.js   halaman chat: bubble riwayat, indikator mengetik, Hapus/Ulangi
.env.example          template API key (salin ke ~/.config/dynamic-iland/.env)
gemini.example.json   template fallback format JSON
modules/pomodoro.js    timer fokus / istirahat / panjang, persistensi deadline + chime & notifikasi
modules/weather.js     cuaca Open-Meteo + cache JSON + refresh 15 menit
modules/weather-page.js halaman cuaca (sekarang + 3 jam + 3 hari)
modules/timer.js       timer bebas & stopwatch, deadline + persistensi
modules/timer-page.js  halaman timer (preset, play/pause, reset)
modules/sysstats.js    polling `hypr-status stats` hanya saat halaman stats terbuka
modules/stats-page.js  halaman statistik sistem (CPU/RAM/suhu + footer)
modules/wellness.js    jeda mata 20-20-20 + pengingat gerak
modules/cover-color.js warna dominan album art untuk glow notch
modules/pomodoro-osd.js kartu OSD kanan atas pomodoro (lebar, aksi, menetap, animasi selesai)
modules/standup.js      state standup + persistensi + pengingat Senin-Jumat 10:00
modules/standup-page.js halaman ringkas standup di island
modules/standup-window.js popup standup: tiga daftar, tambah/hapus, simpan
modules/pomodoro-page.js halaman pomodoro (ring + countdown + pill)
modules/water.js       state air + persistensi JSON + pengingat tiap jam
modules/water-page.js  halaman water (volume, progress, switch, grafik)
modules/todo.js        state tugas + persistensi JSON + reminder jatuh tempo
modules/todo-page.js   halaman todo (counter, pill, baris tugas)
modules/shelf.js       state shelf (referensi file) + persistensi JSON
modules/shelf-page.js  halaman shelf (drop zone, kartu file, drag out)
```

## Catatan teknis (jebakan GTK3/AGS yang sudah ditemukan)

- AGS v1.9 = **GTK3** + gtk-layer-shell; window `layer: 'top'`,
  `anchor: ['top']`, `exclusivity: 'ignore'`.
- `monitor` hanya boleh di-set **setelah** window dikonstruksi
  (`gtk_layer_init_for_window()` jalan di akhir konstruktor AGS).
- AGS menambahkan child ke `Box` lewat `Gtk.Box.add()` =
  **`pack_start(expand=FALSE, fill=TRUE)`** (`ags-src/widgets_box.js:38`).
  Akibatnya: (a) `valign`/`halign` pada child **diabaikan** karena child
  di-fill, dan (b) child **tidak melebar** (expand false). Jadi untuk
  menaruh konten di tengah box yang lebih lebar: set `hexpand: TRUE` pada box
  konten, lalu `xalign: 0.5` pada label-nya — bukan `halign: 'center'`.
  Karena itu: bar OSD & dots digambar Cairo dan selalu digambar di tengah
  tinggi yang diberikan, dan telinga dibungkus Box vertical supaya dapat
  tinggi natural.
- `Gtk.Stack` **non-homogeneous** supaya ukuran ikut halaman aktif.
- `DrawingArea` tidak punya natural size → `set_size_request()` wajib.
- **`propagate-natural-width` hanya mematikan natural**, minimum child tetap
  ikut. Karena itu label tanpa `min-width` (minimum kecil) supaya notch bisa
  dianimasikan lebih kecil dari kontennya.
- `show_all()` di konstruktor Window AGS memaksa descendant `visible = true`
  → `set_no_show_all(true)` untuk widget yang muncul belakangan (nav).
- `halign`/`valign` **harus enum** `Gtk.Align.*`; string `'center'`
  diabaikan tanpa error.
- `onHoverLost` EventBox AGS tidak bisa dipakai (`get_coords()` pada leave
  masih posisi terakhir di dalam → `isHovered()` selalu true). Connect
  `leave-notify-event` sendiri dan abaikan `Gdk.NotifyType.INFERIOR`.
- `padding`/`min-height` pada `window#waybar` diabaikan GTK3 untuk toplevel.
- `todo.json`/`water.json`/`shelf.json` ditulis lewat `GLib.file_set_contents`
  (atomik). Kalau penulisan gagal, kegagalannya **dilaporkan**: `console.error`
  + satu `notify-send` per sesi — dulu hanya `console.log`, jadi data user bisa
  hilang tanpa jejak di UI.
- Notifikasi disadap dari method call `org.freedesktop.Notifications.Notify`
  via `dbus-monitor` (nama bus dipegang swaync). Prosesnya dijalankan sendiri
  dengan `Gio.Subprocess` + `wait_async` supaya bisa di-restart otomatis kalau
  mati; tiap baris di-`trim()` seperti `Utils.subprocess` dulu, jadi parser di
  bawah tidak boleh bergantung indentasi.
- **`Gdk.cairo_set_source_pixbuf()`** dipakai untuk menggambar album art:
  binding GJS tidak menyediakan `cr.setSourcePixbuf()`. `border-radius` CSS
  tidak meng-clip pixbuf `GtkImage` di GTK3, jadi cover harus digambar sendiri.
- **Cover MPRIS di-cache ASYNC — percobaan yang gagal tidak boleh di-cache.**
  `MprisPlayer._cacheCoverArt()` mengisi `_coverPath` lalu memulai
  `Gio.File.copy_async` dan baru memancarkan `changed('cover-path')` setelah
  file selesai. Event metadata pertama karena itu datang **sebelum file cover
  ada**. `Cover.setPath()` dulu langsung menyimpan path sebagai "sudah dimuat"
  walau `pixbuf=null`, sehingga percobaan berikutnya (setelah file ada) menjadi
  no-op: kartu media menampilkan kotak kosong. Cover di halaman lirik bisa
  muncul karena instance-nya mendapat rebuild belakangan (saat data lirik
  datang, file sudah ada) — persis gejala "cover hilang di kartu media tapi ada
  di lirik". Sekarang kegagalan tidak menyimpan state; `Cover` mencoba lagi saat
  `setPath()` yang sama dipanggil (event `changed('cover-path')`) dan punya
  retry timer 120..600ms (maks 5x, total ~1.8s) sebagai jaring pengaman.
  Diverifikasi tanpa mengganti lagu: path belum ada → `loaded=false`; file
  dibuat → `setPath(path)` yang sama langsung `loaded=true`; tanpa `setPath`
  kedua, timer memuatnya sendiri.
- **Field `GdkEvent` tidak terbaca di GJS ini; pakai method `get_*()`.** Di
  callback `button-press-event`, `event.button`, `event.x`, dan `event.detail`
  semuanya `undefined`. Akibatnya handler lama seperti
  `if (event.button !== 1) return false` **selalu** berhenti — progress bar
  media yang katanya bisa diklik sebenarnya tidak pernah seek. Helper
  `modules/pointer.js` memakai `event.get_button()` (`[ok, button]`) dan
  `event.get_coords()` (`[ok, x, y]`). Terukur setelah fix: klik 50% progress
  bar → posisi 142 detik dari 282 detik.
- `GtkStack` memberi child alokasi PENUH. Karena nav adalah overlay di dasar
  kartu, ruangnya dipotong dari **isi konten** (`stack.margin_bottom`) — lihat
  catatan di bagian Motion tentang kenapa bukan dari clip.
- **Satuan MPRIS di AGS**: `player.length` dan `player.position` sama-sama
  **detik** (AGS membagi `mpris:length` dengan 1e6), `length` = -1 kalau player
  tidak melaporkannya. Progress bar memakai `position / length` apa adanya dan
  diredupkan saat panjangnya tidak diketahui; klik di bar = `position = rasio × length`.
- **`/sys/class/backlight` bisa punya beberapa entry** (mis. `intel_backlight`
  + `acpi_video0`): OSD brightness memilih yang bukan `acpi_video*` dan
  `max_brightness` terbesar, bukan sekadar entry pertama.
- **Batasan yang diketahui**: mengganti *device output* (default sink) **tidak**
  memunculkan OSD di mesin ini — AGS/Gvc tidak mengirim `speaker-changed` saat
  default sink berpindah (diuji dengan `module-null-sink` sementara: OSD volume
  tetap muncul untuk perubahan volume/mute, perpindahan device tidak). Mark OSD
  sudah memasukkan nama device, jadi begitu sinyalnya ada, OSD ikut muncul
  tanpa perubahan lain.
- **Hover hanya di area isi, bukan padding notch.** `GtkBin` (EventBox) tidak
  menerapkan padding CSS ke child-nya, jadi jendela hover/drop-target hanya
  menutupi area isi; pointer yang masuk strip padding 3px/13px mengirim
  `leave-notify-event` — dicek ulang lewat posisi pointer (lihat bagian
  Navigasi) sehingga notch tidak ikut menutup.
- **Jam tidak dipoll tiap detik.** `modules/timefmt.js` menjadwalkan tick tepat
  saat menit berganti (`onMinute`), dan berhenti sendiri saat widget-nya
  dihancurkan. Dulu dua label jam memakai `poll(1000)` sehingga bangun 2x/detik
  sepanjang waktu. Nama hari/bulan ditulis manual karena locale sistem (en_US)
  tidak menghasilkan bahasa Indonesia.
- **Jam memakai SATU ticker global (1 detik).** `modules/timefmt.js` dulu
  memberi setiap pemanggil rantai timer sendiri (jadwal ke batas menit +
  watchdog 30s). Rantai per-pemanggil bisa mati diam-diam — terukur: label
  beku di `06:03` saat jam sistem `12:34`, padahal timer baru di proses yang
  sama tetap fire tepat `12:37:00`. Sekarang satu ticker membandingkan menit
  berjalan dengan menit terakhir; jika berbeda, semua callback dipanggil.
  Terverifikasi di batas menit: label `12:38` → `12:39` dalam ~2 detik, dan
  error pada satu callback tidak memengaruhi yang lain.
- **Suspend/resume**: timer GLib memakai `CLOCK_MONOTONIC` yang berhenti selama
  laptop tidur, sehingga jam bisa tertinggal di waktu saat suspend. `timefmt.js`
  mendeteksi resume lewat **dua jalur**:
  1. sinyal logind **`PrepareForSleep(false)`** — ticker dipasang ulang dan semua
     label dipaksa refresh;
  2. **selisih jam dinding vs monotonic > 5 detik** di ticker 1 detik — cadangan
     kalau sinyal logind terlewat (hibernasi, D-Bus telat, sesi tanpa logind).
  Keduanya memanggil `onResume(cb)` (dipakai `index.js` untuk memeriksa window &
  monitor) lalu `refreshClocks()`. Terukur tanpa suspend nyata: label dipaksa
  `00:00`, `Date.now` digeser +6 detik (simulasi bangun), tick berikutnya
  mengembalikan label ke jam sistem (`17:08`) dan window tetap hidup.

- **Double-click dapat DUA event press.** Untuk klik kedua dalam satu
  double-click, GDK mengirim `BUTTON_PRESS` *dan* `2BUTTON_PRESS`, dan GTK3
  memancarkan `button-press-event` untuk keduanya (terukur: 2 klik fisik → 3
  emission, dua di antaranya pada ms yang sama). Karena `event.type` tidak
  terbaca, panah nav memakai dedupe 40ms supaya dua klik cepat = dua langkah,
  bukan tiga.
- **Window island DI-DISPOSE saat layer surface ditutup compositor.** Terukur
  setelah resume (28 Okt 16:41): proses AGS hidup, tetapi
  `App.getWindow('dynamic-island').is_destroyed === true`, `visible=false`, dan
  tidak ada layer `dynamic-island` (hanya waybar). Penyebabnya di gtk-layer-shell
  0.9: `zwlr_layer_surface_v1.closed` →
  `layer_surface_handle_closed()` → `gtk_window_close()` (default
  `respect_surface_closed = TRUE`); GTK3 menghancurkan window karena tidak ada
  handler `delete-event`. Hyprland mengirim `closed` saat output layer surface
  hilang — monitor dicabut / topologi berubah saat resume (di mesin ini
  HDMI-A-1 ada di config tetapi sudah tidak terpasang; eDP-1 tertinggal di
  x=3840).
  - `visible = true` **tidak bisa** menghidupkan window yang sudah disposed.
    Watchdog lama hanya melakukan itu, jadi diam saja (probe hanya memunculkan
    `Object .Ags_Window has been already disposed`).
  - Sekarang `index.js` punya `mountIsland()`: sinyal `destroy` window
    menjadwalkan rebuild 200ms, watchdog 2 detik memeriksa `is_destroyed`, dan
    `onResume` memeriksa/membangun ulang. Entri `App._windows` dilepas dulu
    supaya nama `dynamic-island` tidak dobel.
  - **Semua koneksi ke Variable global** (`hovered`, `page`, `mediaView`)
    dilepas di handler `destroy`. Tanpa itu handler window lama tetap jalan dan
    menunjuk widget disposed (log banjir `Ags_Box/Ags_Stack ... already
    disposed`) sehingga animasi hover window baru tidak pernah kebagian jalan.
  - Diverifikasi tanpa suspend: `ags -r "...window.close()"` (jalur yang sama
    dengan `gtk_window_close`) dan `...window.destroy()`. Layer kembali dalam
    ≤200ms (destroy) / ≤2s (watchdog); hover 468x156 tetap bekerja setelah 3
    siklus rebuild; 0 critical; daftar window App tidak dobel.
- **Hyprland monitor `id` bukan index GdkMonitor.** AGS `Window.monitor`
  memakai index GdkMonitor. Dulu `patchMonitor` dan popup menulis id Hyprland
  langsung; setelah monitor dicabut saat resume index GDK bergeser (mis. id 1
  sementara GDK tinggal index 0) sehingga window dipasang ke monitor yang tidak
  ada/salah. Sekarang `modules/monitor.js` mencocokkan geometri (x/y/lebar,
  sadar `scale`) dan memakai index 0 langsung bila hanya ada satu monitor.
  Terukur: fokus `eDP-1@3840` → GDK index 0, island center 4800 = center monitor.
- **`Utils.fetch` (libsoup3) mengembalikan HTTP 400 untuk SEMUA request di
  mesin ini** — termasuk `example.com` (curl 200 dengan URL/UA yang sama).
  Karena itu lirik diambil lewat `curl` (`Utils.execAsync`).
- **`ScrolledWindow` nested**: dengan `vscroll: 'never'`, minimum-nya = tinggi
  SELURUH isi (lirik 53 baris → notch melar ~974px). Pakai
  `vscroll: 'external'`: bisa scroll internal, scrollbar tidak digambar, dan
  minimum tetap kecil. Auto-scroll-nya juga harus dicoba tiap tick karena
  `allocation.y` masih 0 saat layout belum selesai.
- **`GtkStack` memberi child alokasi PENUH** (margin/`valign` milik child
  diabaikan) — lihat catatan `GtkOverlay`/nav di atas tentang cara memotong
  ruangnya.
- **`tooltipText: undefined` membuat widget gagal dibuat.** GJS melempar
  `Invalid value 'undefined' for property tooltip-text in object initializer`,
  dan karena widget dibangun saat modul dievaluasi, **seluruh island tidak
  dibuat** (`globalThis.dynIsland` undefined, window tidak muncul). Kalau
  tooltip opsional, jangan kirim key-nya sama sekali:
  `{ ...(tip ? { tooltipText: tip } : {}) }`.

## Debug

```bash
./tools/check-center.sh          # offset notch vs center monitor (harus 0)
./tools/test-nav.sh 3            # uji regresi navigasi dgn klik mouse NYATA
ags -r "globalThis.dynIsland.hovered.value = true"   # paksa expanded
ags -r "globalThis.dynIsland.window.close()"         # simulasi layer surface ditutup compositor
ags -r "globalThis.dynIsland.window.destroy()"       # uji watchdog rebuild (layer harus kembali)
ags -r "globalThis.dynIsland.toggleOpen()"            # buka/tutup island tanpa hover
ags -r "globalThis.dynIsland.showTransient('volume', 20000)"  # paksa peek/OSD
ags -r "globalThis.dynIsland.stepPage(1)"            # pindah + pin halaman
ags -r "globalThis.dynIsland.retryLyrics()"          # ambil ulang lirik lagu ini
ags -r "JSON.stringify(globalThis.dynIsland.prayer.value)"  # jadwal sholat + next
ags -r "globalThis.dynIsland.prayerNotify('maghrib')"       # notifikasi sholat uji
ags -r "globalThis.dynIsland.standupWindow.open()"           # buka popup daily standup
ags -r "globalThis.dynIsland.standupApi.remind()"            # pengingat + lonceng
ags -r "globalThis.dynIsland.standupApi.titleFor(1)"         # judul versi Senin (Friday)
ags -r "JSON.stringify(globalThis.dynIsland.standupApi.state.value)"  # isi standup
ags -r "String(globalThis.dynIsland.pomodoroCard.visible)"   # kartu OSD pomodoro
ags -r "JSON.stringify(globalThis.dynIsland.stats.value)"    # statistik terakhir
ags -r "hypr-status stats"                                    # cek backend tanpa AGS
ags -r "globalThis.dynIsland.refreshWeather()"                # paksa ambil cuaca
ags -r "JSON.stringify(globalThis.dynIsland.weather.value)"   # data cuaca terakhir
ags -r "globalThis.dynIsland.timerPreset(0.05)"               # timer 3 detik (uji)
ags -r "globalThis.dynIsland.wellnessReminder()"              # notifikasi jeda mata
ags -r "globalThis.dynIsland.coverColor.value = [0.95,0.45,0.15]"  # uji glow notch
```

`tools/test-nav.sh` menggerakkan pointer dan mengklik lewat `/dev/uinput`
(butuh akses tulis ke `/dev/uinput`, user di grup `input`) — dipakai untuk
memverifikasi perbaikan bug navigasi tanpa tangan manusia. `tools/uinput-click.py`
bisa dipakai manual, mis. `flow <cx> 12 <cx+54> 118` = masuk notch lalu klik
panah kanan.

Catatan: `ags -r` mengevaluasi kode sebagai **ekspresi** kalau tidak ada `await`,
dan sebagai **badan fungsi async** (jadi `return` valid) kalau ada `await`.

`globalThis.dynIsland` berisi `page`, `hovered`, `showTransient`,
`refreshBase`, `config`, `window`, `notch`, `clip`, `stack`, `nav`, `sync`,
`geo`, `target`, `navKey`, `notif`, `notifPopup`, `mediaView`, `btPreview`, `lyrics`, `retryLyrics`, `pomodoro`, `pomodoroModes`,
`pomodoroSetMode`, `pomodoroToggle`, `pomodoroReset`, `water`, `waterDrink`,
`waterSetGoal`, `waterToggleReminder`, `todo`, `todoAdd`, `todoToggle`,
`todoRemove`, `shelf`, `shelfAdd`, `shelfRemove`, `shelfClear`,
`shelfDragOver`, `stepPage`, `pinPage`, `PAGE_ORDER`, `isPinned`, `pomodoroCard`,
`standupWindow`, `standupApi`, `notifInvoke`.

Catatan: untuk memaksa halaman non-media saat musik playing, pakai
`showTransient(name, ms)`; `page.value` saja akan ditimpa `refreshBase()`.
Sebaliknya, saat `pinned` aktif (10s setelah panah/`pinPage`),
`refreshBase()` tidak mengubah halaman — tunggu pin-nya kedaluwarsa dulu
kalau sedang menguji base page.

---

Reference by Nusa — https://rama2555.github.io/nusa/
