# Dynamic Island untuk Hyprland (AGS)

Notch di tengah tepi atas layar yang **kecil saat diam dan membesar saat
hover**: sudut atas rata menempel layar, hanya sudut bawah melengkung, plus
"telinga" (kurva konkaf) yang menyatu ke bezel. Dibangun di atas **AGS
(Aylur's GTK Shell) v1**.

## Perilaku

| State | Pemicu | Ukuran notch | Telinga | Isi |
|---|---|---|---|---|
| **closed** | default | **150×30** | 10 | ring baterai + jam + equalizer 5 bar |
| **expanded** | pointer hover | **420×140** | 22 | halaman aktif sebagai kartu + navigasi |
| **peek** | OSD / notifikasi | **310×60** | 13 | volume / brightness / notifikasi |

Prioritas: `peek` (transient) menang atas `expanded`, `expanded` menang atas
`closed`. Semua angka itu ada di `config.js` → `geometry`.

## Motion

- **Ukuran** dianimasikan dengan `cubic-bezier(.34, 1.32, .5, 1)` selama
  **620ms** (`bezierTween` di `spring.js`, solver bezier sungguhan — bukan
  spring fisika). Overshoot-nya terlihat: membesar berhenti di 473×144 lalu
  duduk di 464×140; menyusut sempat 161×26 lalu duduk di 170×30.
- **Radius sudut & telinga** ikut state (14/32/19 dan 10/22/13). Telinga
  dianimasikan per frame (ikut tween ukuran); `border-radius` sendiri tidak
  bisa dianimasikan di GTK3, jadi nilainya dipasang sekali per state.
- **Konten** berganti bertahap: bentuk dulu, isi menyusul setelah
  `contentDelay` 200ms, fade-in 320ms (`ramp` ease-out).
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
| `closed` | ring baterai (Cairo) + jam + **tanggal** (`19 Okt`) saat tidak ada musik, atau equalizer saat playing |
| `idle` | **jam besar + tanggal** + kolom ringkas: baterai, `X/Y tugas`, `ml / goal L`, dan bar Bluetooth (hanya saat ada device terhubung) |
| `media` | album art 72px + judul + artis + progress bar (bisa diklik untuk seek) + prev/play/next + tombol lirik |
| `media` → lirik | **sub-tampilan** (bukan halaman nav): kiri album art + judul + progress + kontrol, kanan daftar lirik sinkron |
| `pomodoro` | ring merah 88px menyusut + countdown 32px + pill (mode berikutnya, play, reset) |
| `water` | volume harian, progress, switch pengingat, grafik ml per jam |
| `todo` | checkmark hijau + strikethrough, counter `X/Y`, pill Tambah/Ubah |
| `shelf` | drop zone putus-putus + kartu file (thumbnail, nama, ukuran) |
| `volume` / `brightness` | ikon + bar (Cairo) + persen |
| `notify` | ikon + `Judul · isi` |

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
`mediaView` jadi `'lyrics'` → notch melebar ke **520×140** dan kontennya
**terbelah dua**: kiri album art + judul + progress + kontrol, kanan daftar
lirik. Dot tetap menandai `media`, dan panah tetap di tengah bawah.

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
- Keluar dari lirik: tombol **↩ Kembali ke musik** di baris kontrol (kiri
  tombol prev), panah **←**, atau pindah halaman lewat panah (sub-tampilan
  otomatis kembali ke kartu musik). Terukur: ← di tampilan lirik mengembalikan
  `geo` 520 → 420 tanpa berpindah halaman; → langsung ke pomodoro.

## Pomodoro

Halaman `pomodoro` (kartu 420×140): **ring merah** yang menyusut sesuai sisa
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

## Bluetooth

Baris ringkas di halaman idle yang **hanya dirender kalau ada device yang
terhubung**. Tanpa device: tidak ada baris sama sekali (tanpa ruang kosong —
terukur tinggi kolom stat 64px vs 88px saat ada device).

```
  WH-1000XM4 · 82%
```

- Sumber: service Bluetooth AGS (BlueZ) → `Bluetooth.connected_devices`.
  Tidak ada polling `bluetoothctl`: baris ikut event `changed` service.
- Glyph mengikuti `icon_name` device: headset/headphone, speaker, keyboard,
  mouse, phone, fallback logo Bluetooth. Pencocokan dari yang paling spesifik
  (`audio-speaker` → speaker, bukan headphone, karena juga mengandung "audio").
- Baterai device ditampilkan kalau BlueZ melaporkan `battery_percentage`
  (banyak headset mengirim Battery1); kalau tidak ada, hanya nama.
- Beberapa device sekaligus: device audio diprioritaskan, sisanya menjadi `+N`.
  Tooltip berisi daftar lengkap; untuk satu device tooltip dikosongkan.
- Baris memakai kelas yang sama dengan baris stat lain
  (`dyn-island-idle-stat*`) dan disembunyikan lewat `visible` +
  `set_no_show_all()` supaya `show_all()` tidak memunculkannya kembali.
- Debug tanpa device fisik (dipakai saat menguji):
  `ags -r "globalThis.dynIsland.btPreview.value=[{name:'X', icon_name:'audio-headset', battery_percentage:80}]"`
  — kosongkan lagi dengan `=[]`.

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

## Notifikasi (popup kanan atas)

Popup kanan atas digambar **island sendiri** (window layer `overlay`, anchor
kanan-atas), bukan swaync. Alasannya: loading bar + animasi slide + tombol X +
klik-untuk-buka butuh kontrol penuh, dan swaync tidak menyediakan widget custom
maupun keyframes di GTK3.

**Data**: `modules/notify.js` menyadap `Notify` di bus (bukan menjadi daemon;
swaync tetap pemilik `org.freedesktop.Notifications`). Parser mengambil
app/icon/summary/body, **array actions**, dan **id** dari method return
(`reply_serial` dicocokkan dengan serial call). Monitor memakai **dua** match
rule: `interface=org.freedesktop.Notifications` dan `type=method_return` —
method return tidak punya field interface, jadi tanpa rule kedua id selalu 0.
`latest` membawa `seq` supaya kedatangan id tidak memicu popup tampil ulang.
Terukur setelah perbaikan: `id=54, actions=["default","Open"]`.

**Tampilan** (`modules/notif-popup.js` + kelas `.dyn-island-popup*`): kartu
340px hitam solid radius 16, ikon 26px (fallback glyph lonceng), judul 13px,
isi 12px redup, X 20×20 di pojok kanan atas, dan loading bar 3px di dasar kartu.

Ritme terukur: inset kiri/kanan 15px (padding 14 + border 1), inset atas 13px,
ikon 26 → jarak 10px → teks, gap judul–isi 2px, jarak ke action 10px, jarak ke
bar 10px, bar 310×3 (selebar isi kartu), sisa bawah 11px. Lebar kartu dipatok
340px dan inset kiri/kanan simetris; area klik 290px selebar baris (X terpisah).

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
- **Tombol X** → `CloseNotification(<id>)` ke daemon (ikut hilang dari control
  center) + slide keluar.
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

## Notifikasi WhatsApp Web (body kosong)

Gejala: notifikasi WA Web hanya menampilkan nama pengirim, tanpa isi pesan.
Penyebabnya di **payload pengirim**, bukan di popup: Chrome/WhatsApp Web bisa
mengirim `Notify` dengan `body` kosong (mis. update untuk id yang sama, atau
ketika pratinjau pesan dimatikan di HP). Yang sudah ditangani di sisi island:

- **Update tanpa body tidak menimpa body yang sudah tampil.** Parser sekarang
  membaca `replaces_id` (argumen kedua `Notify`) dan menyimpan body terakhir
  per id (maks 30 entri). Kalau update datang dengan `body=""` dan
  `replaces_id` cocok, body lama dipakai. Terukur: notif pertama
  `body="Isi pesan asli…"`, update `body="" replaces=97` → popup tetap
  menampilkan isi pesan.
- **Log diagnostik** di `modules/notify.js`: satu baris per notifikasi
  (`app`, `icon`, `summary`, `body`, `replaces`). Setelah pesan WA berikutnya
  masuk, cek `~/.cache/ags-dynamic-island.log` — kalau `body=""` bahkan pada
  notifikasi pertama, berarti sumbernya memang tidak mengirim isi pesan.
- Kalau body memang tidak pernah dikirim, cek:
  WhatsApp di HP → **Setelan → Notifikasi → Pratinjau pesan** (harus
  menampilkan isi), WhatsApp Web → **Setelan → Notifikasi**, dan izin
  notifikasi situs web.whatsapp.com di Chrome.
- Catatan privasi: log diagnostik memuat isi pesan (lokal, hanya di mesin ini).

## Water

Halaman `water` (kartu 420×140): judul + **switch pengingat**, baris volume
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

Halaman `todo` (kartu 420×140): judul `Todo List`, counter besar `1/2` +
"Tugas selesai", pill **[+ Tambah] [Ubah]**, dan daftar tugas di kanan
(checkbox bulat hijau + centang, teks dicoret kalau selesai, due time kalau
ada).

- **Data & persistensi**: `~/.local/share/dynamic-iland/todo.json`
  (`tasks: [{ id, text, done, due, notified }]`), debounce 400ms.
- **Add**: karena window layer-shell ini `keymode: none` (tidak menerima
  keyboard), input teks didelegasikan ke **rofi**:
  `rofi -dmenu -p "Tugas baru" -l 0` → hasilnya `addTask()`.
  Bisa langsung memberi jatuh tempo di teks: `Kirim laporan @14:30`
  → `text: "Kirim laporan"`, `due: "14:30"`.
- **Edit** mengubah pill menjadi **Selesai** dan memunculkan tombol ✕ per
  baris untuk menghapus. Klik baris = toggle selesai.
- **Reminder**: tiap 30s dicek; task belum selesai yang `due`-nya sudah lewat
  (dan **belum lewat 1 jam** — jendela catch-up, supaya due yang terlewat saat
  AGS tidur/restart tetap diingatkan) dan belum `notified` memicu
  `notify-send "Tugas jatuh tempo" <teks>` (sekali saja).
  Terukur: task `@23:01` → `notified: true` + notifikasi masuk.

## Shelf

Halaman `shelf` (kartu 420×140): judul `Shelf` + jumlah item + chip
**Clear**, dan isinya salah satu dari:

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
- **Clear** mengosongkan shelf. Aksi destruktif (**Clear** dan klik-kanan hapus)
  bisa **diurungkan** satu langkah lewat chip **Urungkan** yang muncul 8 detik
  (`shelfUndo`/`undoLast()` di `modules/shelf.js`). Nama file dipotong 12
  karakter (dulu 9) dan kalau item lebih banyak dari yang muat (4 kartu),
  label jumlah berubah jadi `N item · geser ›` sebagai penanda daftarnya bisa
  digeser.

Catatan penting:

- Shelf menyimpan **referensi** ke file asli (`shelf.json`), **bukan
  salinan** — jadi tidak ada duplikasi data dan file user tidak pernah
  dihapus. Kalau file-nya sudah pindah/hilang, item ditandai `missing: true`
  dan tampil redup dengan label `hilang`.
- Uji drag & drop nyata (drag dari file manager ke notch) tidak bisa
  disimulasikan di sesi pengembangan ini (tidak ada `ydotool`/`wtype`),
  sehingga yang diverifikasi adalah: registrasi drop target (0 error),
  jalur data (`addPaths`), UI, dan persistensi.

## Navigasi (page dots + panah)

Saat **expanded** (dan di state lirik), muncul pill `‹ ● ●●●●● ›`
di bawah-tengah kartu (**6 titik** = `PAGE_ORDER`; lirik bukan halaman, jadi
tidak punya dot). Titik aktif memanjang & terang — saat tampilan lirik terbuka,
titik yang aktif tetap **media**.
Panah memanggil `stepPage(±1)` lalu halaman itu **di-pin** selama `pinTimeout`
(10s), setelah itu kembali ke `basePage()`. Transient tetap menimpa pin dan
kembali ke halaman yang di-pin (`restingPage = pinned ?? basePage()`). Di
tampilan lirik, panah **kiri** mengembalikan ke kartu musik (bukan ke halaman
sebelumnya) dan panah kanan tetap lanjut ke halaman berikutnya; pindah halaman
selalu menutup sub-tampilan lirik.
Nav adalah `Gtk.Overlay` sehingga **tidak menambah ukuran** notch, tapi ruangnya
dipotong dari tinggi isi konten (`stack.margin_bottom = NAV_SPACE = 34`) — lihat
bagian Motion. Target klik panah 18px (dulu 14px) dan keduanya punya tooltip.

**Panah aktif saat press, bukan release.** Pill nav di-anchor ke dasar notch,
jadi selama notch membuka/menutup pill-nya ikut bergerak (terukur: posisi pill
`y≈93..114` di 120ms pertama, `y=107..128` setelah settle). Kalau aksi menunggu
release, tombol sudah pindah dan release jatuh di luar tombol → klik dibatalkan.
Dengan aksi di press, yang diklik adalah posisi yang terlihat saat itu juga.

**Hover diverifikasi ke kompositor.** GTK3 mengirim `leave-notify-event` juga
saat pointer pindah ke child ber-GdkWindow (tombol, dots, DrawingArea, isi
halaman) — dan pada GJS/AGS ini objek event-nya **tidak mengekspos field apa
pun** (`event.detail` selalu `undefined`, sudah diperiksa), sehingga pengecekan
`INFERIOR` tidak pernah cocok. Dulu itu membuat notch menutup begitu pointer
menyentuh konten; sekarang setiap `leave` memeriksa posisi pointer sebenarnya
lewat `hyprctl -j cursorpos` (+ rect monitor yang di-cache, diperbarui saat
monitor fokus berubah), dan hanya menutup kalau pointer benar-benar di luar
badan island. Token mencegah hasil pemeriksaan yang basi menutup notch setelah
pointer kembali masuk.

Dua bug hover yang ditemukan lewat audit uinput:

- **Notch bisa tertahan terbuka saat pointer keluar lewat padding.**
  `leave-notify` hanya terkirim sekali, yaitu saat pointer keluar dari
  EventBox (area isi). Badan notch masih punya padding 3/13px: kalau pointer
  berhenti di situ, pemeriksaan saat `leave` menjawab "di dalam" dan tidak ada
  event lanjutan — terukur pointer 6px di bawah kartu 140px tetap
  `hovered=true`. Sekarang ada **watchdog 150ms selama hover** yang membaca
  `cursorpos` dan menutup kalau pointer sudah di luar; sakelar token tetap
  dipakai supaya hasil basi tidak menutup notch yang baru dimasuki.
- **Submap `island` tertinggal aktif setelah island tertutup.** `nav.visible`
  baru menjadi false di akhir tween, sedangkan `syncSubmap()` hanya dipanggil
  saat `sync()` di awal animasi — terukur `hyprctl submap` masih `island`
  setelah notch menutup (panah ikut tertelan). Sekarang `syncSubmap()`
  dipanggil juga di `onDone` tween.

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
- **Window melebar 464 → 480 saat menutup.** Headroom 16px (untuk overshoot)
  ikut dipakai saat menutup, padahal saat menutup nilainya di-clamp ke target.
  Sekarang headroom hanya dipasang jika `next.w > from.w`; terukur window tetap
  **464** sepanjang penutupan lalu turun sekali ke 170 di akhir (tidak terlihat
  karena hanya surface transparan; notch tetap di tengah).
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
  watchdog 150ms berikutnya; delay itu yang membatasi.

Interupsi juga diuji: buka 200ms lalu tutup (379×123 → … → 150×30 tanpa
lompatan) dan tutup 200ms lalu buka lagi (191×47 → … → 420×140).

Catatan perilaku: **transient hanya memakai geometri peek saat notch tertutup**.
Kalau pointer sedang hover, konten OSD/notifikasi ditampilkan di dalam kartu
besar supaya notch tidak menyusut di bawah kursor dan hover tidak tertahan
selama durasi peek.

### Keyboard (panah kiri/kanan)

Window island memakai `keymode: 'none'` — ia **tidak pernah** mengambil fokus
keyboard, jadi tombol panah tidak bisa ditangkap langsung oleh GTK. Navigasi
dipasang lewat **submap Hyprland** (`island`), ditambahkan `install.sh` ke
`~/.config/hypr/UserConfigs/UserKeybinds.conf`:

```conf
# dyn-island-kbd: begin — panah kiri/kanan untuk navigasi halaman island.
submap = island
bind = , left, exec, ags -r "globalThis.dynIsland.navKey(-1)"
bind = , right, exec, ags -r "globalThis.dynIsland.navKey(1)"
bind = , escape, exec, hyprctl dispatch submap reset
submap = reset
# dyn-island-kbd: end
```

- **Panah bersifat consuming** (`bind`, bukan `bindn`): selama island terbuka,
  panah **tidak** diteruskan ke aplikasi fokus. Menonton YouTube sambil hover
  notch lalu menekan → tidak akan ikut seek/scroll.
- Submap hanya aktif saat nav tampil; `index.js` yang mengurus switch-nya
  (`syncSubmap()`, debounce 80 ms, hanya `default → island` dan
  `island → reset`, jadi submap lain seperti resize tidak terganggu).
- Di tampilan lirik, **← kembali ke kartu musik** dan → lanjut ke halaman
  berikutnya (lirik bukan halaman nav, hanya sub-tampilan media).
- Di luar island (submap `default`), panah 100% normal.
- **`escape`** di dalam submap = jalan keluar manual bila submap tertinggal
  (mis. AGS mati saat island terbuka). `index.js` juga menjalankan
  `submap reset` saat start sebagai jaring pengaman.
- Catatan trade-off: selama submap `island` aktif, bind lain (mis.
  `SUPER+←/→` untuk pindah workspace) tidak aktif — hanya selama pointer berada
  di atas notch.
- `uninstall.sh` menghapus blok ini (dan blok `bindn` versi lama) lagi, lalu
  `submap reset` + `hyprctl reload`. Backup: `.dyn-island.bak`.

## Konfigurasi (`config.js`)

| Knob | Arti |
|---|---|
| `monitor` | `'focused'` atau index monitor |
| `marginTop` | jarak dari tepi atas (0 = nempel) |
| `geometry` | `closed` / `expanded` / `peek`: `{ w, h, r, ear }` |
| `motion` | `sizeDuration`, `sizeCurve` |
| `osdTimeout` / `notifyTimeout` | durasi peek (ms) |
| `pinTimeout` | durasi halaman pilihan manual (ms) |
| `contentDelay` / `contentFade` | jeda & durasi fade-in konten (ms) |
| `mediaMaxChars` / `notifyMaxChars` | pemotongan teks |

### Warna

Badan notch **hitam murni opaque** (`NOTCH_COLOR`/`NOTCH_ALPHA` di
`theme.js`), telinga memakai warna yang sama (Cairo) jadi tanpa seam.
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
6. **Hyprland `UserKeybinds.conf`** — submap `island` berisi bind panah
   kiri/kanan yang *consuming* untuk navigasi island (lihat bagian Keyboard).
   Ber-marker `dyn-island-kbd: begin/end`, dengan backup `.dyn-island.bak`.
   Versi lama yang memakai `bindn` (non-consuming) dimigrasikan otomatis.
7. **swaync `style.css`** — blok gaya popup notifikasi (append-only, ber-marker
   `dyn-island-notif: begin/end`, backup `.dyn-island.bak`). Hanya
   `.floating-notifications`; panel control-center tidak diubah. Lihat bagian
   Notifikasi.

## Struktur

```
config.js          knob konfigurasi (geometry, motion, timeout)
theme.js           warna notch (hitam solid) + palet wallust + placeholder CSS
state.js           page + hovered + logika transient/base/pin
spring.js          ramp ease-out + bezierTween (solver cubic-bezier)
draw.js            helper Cairo bersama (roundedRect)
style.css          styling (placeholder warna)
index.js           window, Stack, clipping, mesin geometri, registrasi AGS
modules/closed.js  ring + jam + tanggal/equalizer
modules/idle.js    jam besar + tanggal + ringkasan baterai/todo/air/bluetooth
modules/bluetooth.js  baris device Bluetooth terhubung (glyph + nama + baterai)
modules/timefmt.js format jam, tanggal Indonesia, tick sekali per menit
modules/media.js   kartu MPRIS (art, judul, artis, progress, kontrol)
modules/cover.js   album art Cairo: pixbuf dimuat sendiri, sudut membulat, fallback aman
modules/osd.js     volume (Audio service) + brightness (sysfs)
modules/notify.js  penyadap dbus Notify (+ actions & id untuk popup)
modules/notif-popup.js  popup kanan atas: slide, loading bar 5s, X, klik, chips
modules/nav.js     page dots (Cairo) + panah
modules/lyrics.js      fetch LRCLIB + parse LRC + cache
modules/lyrics-page.js tampilan lirik (sub-bagian media: meta kiri + daftar sinkron kanan)
modules/progress.js    progress bar Cairo bersama (media & lirik)
modules/pomodoro.js    timer fokus / istirahat singkat / istirahat panjang + chime & notifikasi
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
- **Rantai `onMinute` dulu bisa mati diam-diam.** `arm()` dipanggil *setelah*
  `callback()`, jadi satu exception dari callback menghentikan rantai tanpa
  tick berikutnya — terukur jam beku di `14:08` saat jam sistem `17:27`
  (proses hidup 24 menit lalu berhenti menulis label, tanpa error terlihat
  karena stderr AGS diarahkan ke `/dev/null`). Sekarang callback dibungkus
  try/catch + `console.error`, `arm()` selalu jalan di `finally`, dan ada
  **watchdog 30 detik** yang memanggil ulang callback kalau tidak ada tick
  selama > 65 detik (menutup kasus suspend panjang / source hilang).
- **Double-click dapat DUA event press.** Untuk klik kedua dalam satu
  double-click, GDK mengirim `BUTTON_PRESS` *dan* `2BUTTON_PRESS`, dan GTK3
  memancarkan `button-press-event` untuk keduanya (terukur: 2 klik fisik → 3
  emission, dua di antaranya pada ms yang sama). Karena `event.type` tidak
  terbaca, panah nav memakai dedupe 40ms supaya dua klik cepat = dua langkah,
  bukan tiga.
- **Hotplug monitor**: kalau monitor tempat island berada dicabut/dimatikan,
  GTK menghancurkan window island dan window itu tidak dibuat ulang otomatis.
  Untuk memunculkannya lagi di monitor yang tersisa: `ags quit && ags &`
  (atau jalankan ulang `install.sh`).
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
ags -r "globalThis.dynIsland.showTransient('volume', 20000)"  # paksa peek/OSD
ags -r "globalThis.dynIsland.stepPage(1)"            # pindah + pin halaman
ags -r "globalThis.dynIsland.retryLyrics()"          # ambil ulang lirik lagu ini
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
`shelfDragOver`, `stepPage`, `pinPage`, `PAGE_ORDER`, `isPinned`.

Catatan: untuk memaksa halaman non-media saat musik playing, pakai
`showTransient(name, ms)`; `page.value` saja akan ditimpa `refreshBase()`.
Sebaliknya, saat `pinned` aktif (10s setelah panah/`pinPage`),
`refreshBase()` tidak mengubah halaman — tunggu pin-nya kedaluwarsa dulu
kalau sedang menguji base page.

---

Reference by Nusa — https://rama2555.github.io/nusa/
