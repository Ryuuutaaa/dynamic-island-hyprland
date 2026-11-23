// Sumber data: README.md dan kode di repo ini. Setiap angka di halaman
// fitur bisa dilacak ke config.js atau modul yang bersangkutan.

export const geometry = [
  { state: 'closed', size: '150 × 50', radius: '16', ear: '10', trigger: 'keadaan diam' },
  { state: 'peek', size: '240 × 80', radius: '20', ear: '13', trigger: 'OSD dan notifikasi' },
  { state: 'expanded', size: '468 × 156', radius: '32', ear: '22', trigger: 'pointer hover' },
];

export const shots = {
  closed: { src: '/shots/closed.png', w: 170, h: 50, alt: 'Notch tertutup: ring baterai, jam, dan equalizer musik' },
  idle: { src: '/shots/idle.png', w: 512, h: 156, alt: 'Halaman ringkasan: jam besar, tanggal, agenda berikutnya, tugas, air, cuaca' },
  media: { src: '/shots/media.png', w: 512, h: 156, alt: 'Halaman media: album art, judul lagu, progress bar, dan kontrol pemutaran' },
  lyrics: { src: '/shots/lyrics.png', w: 564, h: 156, alt: 'Tampilan lirik sinkron dengan baris aktif disorot' },
  weather: { src: '/shots/weather.png', w: 512, h: 156, alt: 'Halaman cuaca: kondisi sekarang, strip tiga jam, dan tiga hari' },
  pomodoro: { src: '/shots/pomodoro.png', w: 512, h: 156, alt: 'Halaman pomodoro: ring merah, countdown, dan tiga pill aksi' },
  pomodoroOsd: { src: '/shots/pomodoro-osd.png', w: 320, h: 158, alt: 'Kartu OSD pomodoro di kanan atas layar' },
  timer: { src: '/shots/timer.png', w: 512, h: 156, alt: 'Halaman timer: waktu besar, preset, dan kontrol' },
  stats: { src: '/shots/stats.png', w: 512, h: 156, alt: 'Halaman statistik: CPU, RAM, suhu dengan sparkline 30 detik' },
  water: { src: '/shots/water.png', w: 512, h: 156, alt: 'Halaman air: volume harian, progress, dan grafik ml per jam' },
  todo: { src: '/shots/todo.png', w: 512, h: 156, alt: 'Halaman tugas: daftar tugas dengan checkbox, jatuh tempo, edit, dan hapus' },
  standup: { src: '/shots/standup.png', w: 512, h: 156, alt: 'Halaman standup: tiga chip kemarin, hari ini, dan blocker' },
  shelf: { src: '/shots/shelf.png', w: 512, h: 156, alt: 'Halaman shelf: drop zone dan kartu berkas' },
  bluetooth: { src: '/shots/bluetooth.png', w: 512, h: 156, alt: 'Halaman bluetooth: status, baris perangkat, dan kontrol volume' },
  wifi: { src: '/shots/wifi.png', w: 512, h: 156, alt: 'Halaman Wi-Fi: daftar jaringan dengan sinyal dan aksi' },
  prayer: { src: '/shots/prayer.png', w: 624, h: 156, alt: 'Halaman jadwal sholat: timeline 24 jam, busur matahari, dan lima waktu' },
  chat: { src: '/shots/chat.png', w: 564, h: 232, alt: 'Halaman chat Gemini dengan tombol Tanya Gemini' },
  settings: { src: '/shots/settings.png', w: 564, h: 232, alt: 'Halaman pengaturan: glow, ukuran notch, monitor, dan daftar modul' },
  calendar: { src: '/shots/calendar.png', w: 564, h: 272, alt: 'Halaman kalender: grid bulan penuh dengan penanda hari ini dan acara' },
  osd: { src: '/shots/osd-volume.png', w: 266, h: 80, alt: 'OSD volume: ikon speaker, slider, persentase, dan nama perangkat' },
  notif: { src: '/shots/notif-popup.png', w: 368, h: 88, alt: 'Popup notifikasi di kanan atas dengan ikon, judul, dan isi' },
};

export const features = [
  {
    id: 'ringkasan',
    page: 'idle',
    title: 'Ringkasan',
    desc: 'Jam besar dengan tanggal Indonesia, satu baris agenda berikutnya, dan tiga kolom ringkas berisi tugas, air, dan cuaca. Tanpa kartu dan tanpa bilah progres, supaya tidak ada yang bersaing dengan jam.',
    specs: [
      'Agenda diambil dari feed iCal atau catatan lokal',
      'Jumlah tugas, volume air, dan suhu kota saat ini',
      'Menjadi halaman istirahat saat tidak ada pemutar musik',
    ],
    shot: 'idle',
  },
  {
    id: 'media',
    page: 'media',
    title: 'Pemutar musik',
    desc: 'Album art 84px diberi border dari warna dominan covernya, dan notch mengambil warna yang sama sebagai glow. Judul, artis, progres yang bisa diklik untuk seek, dan nama aplikasi sumber.',
    specs: [
      'Sumber data MPRIS, jadi bekerja dengan Brave, Spotify, mpv, dan pemutar lain',
      'Warna dominan disampel 24 × 24 piksel, piksel hampir hitam dan putih dibuang',
      'Progress bar punya area klik 24px walau batangnya hanya 4px',
    ],
    shot: 'media',
  },
  {
    id: 'lirik',
    page: 'media · lirik',
    title: 'Lirik sinkron',
    desc: 'Tombol lirik membelah kartu jadi dua: kiri album art dan kontrol, kanan daftar lirik yang mengikuti posisi lagu. Baris aktif berwarna putih dan tebal, sisanya redup, dan daftar menggulir sendiri.',
    specs: [
      'Sumber LRCLIB: lirik berformat LRC diparse jadi pasangan waktu dan teks',
      'Menggulir sendiri menahan auto-scroll selama 8 detik',
      'Klik baris untuk melompat ke waktu baris itu',
    ],
    shot: 'lyrics',
  },
  {
    id: 'cuaca',
    page: 'weather',
    title: 'Cuaca',
    desc: 'Kondisi sekarang, strip tiga jam ke depan, dan tiga hari berikutnya. Memakai Open-Meteo, yang gratis dan tidak butuh API key maupun akun.',
    specs: [
      'Hasil terakhir disimpan ke disk, jadi tetap ada isi saat offline',
      'Data diperbarui tiap 15 menit dan hanya saat modul aktif',
      'Koordinat mengikuti blok prayer, bisa ditimpa lewat config.weather',
    ],
    shot: 'weather',
  },
  {
    id: 'pomodoro',
    page: 'pomodoro',
    title: 'Pomodoro',
    desc: 'Ring merah yang menyusut mengikuti sisa waktu dengan countdown besar. Tiga mode bersiklus: fokus 25 menit, istirahat 5 menit, dan istirahat panjang 15 menit.',
    specs: [
      'Deadline disimpan, jadi hitungan tetap benar setelah laptop sleep atau AGS restart',
      'Kartu OSD terpisah di kanan atas bertahan selama sesi berjalan',
      'Saat habis: bunyi alarm dan notifikasi, lalu mode berikutnya disiapkan dalam keadaan dijeda',
    ],
    shot: 'pomodoro',
    extra: 'pomodoroOsd',
  },
  {
    id: 'timer',
    page: 'timer',
    title: 'Timer dan stopwatch',
    desc: 'Timer bebas dengan preset 1 sampai 60 menit, stepper satu menit, dan stopwatch yang menyimpan waktu saat dijeda. Terpisah dari pomodoro yang bersiklus.',
    specs: [
      'Hitungan memakai deadline, jadi tetap benar setelah suspend',
      'File timer hanya ditulis saat status berubah, bukan setiap detik',
      'Saat habis: bunyi dan notifikasi lewat pipeline popup yang sama',
    ],
    shot: 'timer',
  },
  {
    id: 'statistik',
    page: 'stats',
    title: 'Statistik sistem',
    desc: 'CPU, RAM, dan suhu sejajar dengan sparkline 30 detik, plus footer disk dan swap. Pembacaan langsung dari /proc dan hwmon, tanpa fork proses baru.',
    specs: [
      'CPU dihitung dari dua sampel /proc/stat berjarak 150 ms, bukan rata-rata boot',
      'Polling 2 detik hanya berjalan selama halaman terbuka',
      'Angka di atas 80 persen diberi warna bahaya',
    ],
    shot: 'stats',
  },
  {
    id: 'air',
    page: 'water',
    title: 'Pengingat air',
    desc: 'Volume harian, target yang bisa diubah kelipatan 250 ml, pengingat tiap jam, dan grafik mililiter per jam untuk delapan jam terakhir.',
    specs: [
      'Ganti hari mereset log, tetapi target dan pengingat dipertahankan',
      'Pengingat hanya dikirim pada 08:00 sampai 22:00 dan kalau target belum tercapai',
      'Stempel per jam mencegah notifikasi dobel walau AGS restart',
    ],
    shot: 'water',
  },
  {
    id: 'tugas',
    page: 'todo',
    title: 'Daftar tugas',
    desc: 'Tugas dengan jatuh tempo opsional, toggle selesai, edit, dan hapus dengan konfirmasi inline. Tugas aktif di atas, yang selesai di bawah.',
    specs: [
      'Pengingat dicek tiap 30 detik dengan jendela catch-up satu jam',
      'Editor dibuka di window terpisah, Enter menyimpan dan Esc membatalkan',
      'Tersimpan di todo.json dengan penulisan atomik',
    ],
    shot: 'todo',
  },
  {
    id: 'standup',
    page: 'standup',
    title: 'Daily standup',
    desc: 'Tiga daftar untuk kemarin, hari ini, dan blocker. Bagian kemarin terisi otomatis dari daftar hari ini pada hari kerja sebelumnya, jadi popup selalu terbuka dengan riwayat.',
    specs: [
      'Pengingat Senin sampai Jumat pukul 10:00 dengan lonceng dan notifikasi',
      'Klik notifikasi langsung membuka popup standup',
      'Menyimpan 60 hari terakhir, hanya lokal',
    ],
    shot: 'standup',
  },
  {
    id: 'shelf',
    page: 'shelf',
    title: 'Shelf berkas',
    desc: 'Tarik berkas ke notch untuk menyimpannya sebagai referensi. Klik kartu untuk membuka, klik kanan untuk menghapus, dan seret keluar ke file manager atau aplikasi lain.',
    specs: [
      'Menyimpan referensi ke berkas asli, bukan salinan',
      'Berkas yang sudah pindah ditandai hilang, bukan dihapus',
      'Hapus semua bisa diurungkan satu langkah lewat chip Urungkan',
    ],
    shot: 'shelf',
  },
  {
    id: 'bluetooth',
    page: 'bluetooth',
    title: 'Bluetooth',
    desc: 'Satu kolom: header dengan status dan tombol daya, lalu baris perangkat berisi ikon, nama, baterai, dan aksi. Seluruh baris bisa diklik untuk menyambung atau memutus.',
    specs: [
      'Volume diambil dari sink yang cocok dengan alamat perangkat, bukan sink default',
      'Menggeser slider tidak memunculkan OSD volume',
      'Glyph mengikuti jenis perangkat: headset, speaker, keyboard, mouse, telepon',
    ],
    shot: 'bluetooth',
  },
  {
    id: 'wifi',
    page: 'wifi',
    title: 'Wi-Fi',
    desc: 'Daftar jaringan dari nmcli, satu baris per SSID dengan sinyal terkuat. Baris menampilkan sinyal, nama, gembok, dan aksi; seluruh baris bisa diklik.',
    specs: [
      'Password diminta lewat rofi dan dikirim ke nmcli lewat stdin dari file 0600',
      'Captive portal terdeteksi dan ditawarkan chip Login',
      'Jaringan 802.1X ditandai Manual, hidden SSID tidak ditampilkan',
    ],
    shot: 'wifi',
  },
  {
    id: 'sholat',
    page: 'prayer',
    title: 'Jadwal sholat',
    desc: 'Timeline 24 jam dengan label waktu di posisi jam sebenarnya, sehingga matahari di puncak busur benar-benar berada di atas Dzuhur. Malam diganti bulan sabit.',
    specs: [
      'Dihitung lokal tanpa jaringan dari koordinat di config',
      'Semua waktu dibulatkan ke atas, supaya pengingat tidak berbunyi sebelum waktunya',
      'Latar langit mengikuti fase: fajar hangat, siang tint tipis, magrib merah-oranye, malam berbintang',
    ],
    shot: 'prayer',
  },
  {
    id: 'kalender',
    page: 'calendar',
    title: 'Kalender',
    desc: 'Grid bulan penuh dengan penanda hari ini dan dot untuk hari yang punya acara. Klik hari untuk membuka popup yang berisi acara iCal dan catatan lokal.',
    specs: [
      'Feed iCal di-refresh tiap 30 menit dan di-cache ke disk',
      'RRULE harian, mingguan, bulanan, dan tahunan didukung, termasuk EXDATE',
      'Pengingat acara 10 menit sebelum mulai, catatan lokal punya pengingat sendiri',
    ],
    shot: 'calendar',
  },
  {
    id: 'chat',
    page: 'chat',
    title: 'Chat Gemini',
    desc: 'Percakapan dengan Gemini tanpa mengambil fokus keyboard dari jendela lain: pertanyaan diketik lewat rofi, jawaban tampil di kartu dengan avatar dan timestamp per pesan.',
    specs: [
      'API key disimpan di luar repo dengan permission 0600, tidak pernah tampil utuh',
      'Request lewat curl dengan key di file konfigurasi sementara, bukan argumen proses',
      'Non-streaming; jawaban terukur sekitar 1,2 detik pada model default',
    ],
    shot: 'chat',
  },
  {
    id: 'pengaturan',
    page: 'settings',
    title: 'Pengaturan',
    desc: 'Satu halaman untuk glow cover, ukuran notch, perilaku monitor, halaman default, urutan indikator, dan sakelar dua belas modul. Pengaturan disimpan ke disk dan dibaca sebelum modul lain dibangun.',
    specs: [
      'Ukuran Kecil 140 × 46, Besar 170 × 56, Normal mengikuti config',
      'Notch di semua monitor membuat mirror tertutup saja, bukan island interaktif kedua',
      'Daftar aplikasi yang dibisukan muncul di sini',
    ],
    shot: 'settings',
  },
];

export const osd = [
  {
    id: 'osd-volume',
    title: 'OSD volume dan kecerahan',
    desc: 'Bukan indikator pasif: klik di titik mana pun atau geser untuk mengatur nilai. Bubble angka mengikuti knob saat digeser. Klik ikon speaker untuk mute, klik dua kali untuk 100 persen.',
    shot: 'osd',
  },
  {
    id: 'notifikasi',
    title: 'Popup notifikasi',
    desc: 'Popup kanan atas digambar island sendiri, bukan swaync, supaya loading bar, animasi slide, tombol tutup, dan klik-untuk-membuka bisa dikendalikan penuh. Maksimal tiga kartu bertumpuk.',
    shot: 'notif',
  },
];

export const installPrereqs = {
  required: [
    ['ags', 'AGS v1.x. v2 ditolak karena API resource:/// dihapus di v2'],
    ['hyprctl', 'Hyprland dan utilitas kontrolnya'],
    ['awk, sed, grep', 'Pengolahan berkas konfigurasi'],
    ['mktemp, cmp, readlink', 'Berkas sementara, perbandingan, dan resolusi symlink'],
  ],
  optional: [
    ['rofi', 'Input teks chat Gemini'],
    ['curl', 'Chat Gemini, feed kalender, lirik LRCLIB'],
    ['notify-send', 'Notifikasi timer, pomodoro, dan pengingat'],
    ['brightnessctl', 'OSD kecerahan'],
    ['nmcli', 'Halaman Wi-Fi'],
    ['grim', 'Tombol tangkapan layar'],
    ['swaync-client', 'Kontrol panel notifikasi'],
    ['paplay', 'Bunyi timer dan pomodoro'],
    ['waybar', 'Bar atas yang tingginya disamakan dengan notch'],
    ['python3', 'Penyesuaian panel swaync'],
    ['jq', 'Pembacaan JSON di beberapa skrip bantu'],
  ],
};

export const changes = [
  ['Symlink', '~/.config/ags/dynamic-iland menuju folder proyek'],
  ['Import', 'Satu baris di ~/.config/ags/config.js, dengan backup .dyn-island.bak'],
  ['Waybar', 'Blok CSS ber-marker di theme aktif, dengan backup'],
  ['Hyprland', 'Submap island untuk panah kiri dan kanan di UserKeybinds.lua atau .conf'],
  ['swaync', 'Blok gaya popup notifikasi di style.css, dengan backup'],
  ['Proses', 'waybar dan AGS direstart memakai argumen yang sama seperti proses berjalan'],
];
