// Data demo untuk Live Demo. Semua angka di sini mengikuti config.js dan
// README, bukan karangan: geometri, palet, dan isi halaman diambil dari
// implementasi AGS yang sebenarnya.

export const NOTCH = {
  closed: { w: 150, h: 50, r: 16, ear: 10 },
  peek: { w: 240, h: 80, r: 20, ear: 13 },
  expanded: { w: 468, h: 156, r: 32, ear: 22 },
  lyrics: { w: 520, h: 156, r: 32, ear: 22 },
  prayer: { w: 580, h: 156, r: 32, ear: 22 },
  chat: { w: 520, h: 232, r: 32, ear: 22 },
  settings: { w: 520, h: 232, r: 32, ear: 22 },
  calendar: { w: 520, h: 272, r: 32, ear: 22 },
};

// config.js -> motion.sizeDuration 320, cubic-bezier(.34, 1.32, .5, 1)
export const MOTION = {
  duration: 320,
  curve: 'cubic-bezier(.34, 1.32, .5, 1)',
};

// theme.js -> palet fallback yang sedang aktif
export const PALETTE = {
  bg: '#0B0003',
  fg: '#EFEFEF',
  accent: '#7A5E6E',
  accent2: '#BAB4B8',
  muted: '#8C878A',
  danger: '#ff8f8f',
  ok: '#3ad17a',
};

// modules/nav.js -> ICONS, urutan PAGE_ORDER
export const PAGES = [
  { id: 'idle', glyph: '\uf017', label: 'Ringkasan' },
  { id: 'media', glyph: '\uf001', label: 'Media' },
  { id: 'weather', glyph: '\uf0c2', label: 'Cuaca' },
  { id: 'calendar', glyph: '\uf073', label: 'Kalender' },
  { id: 'pomodoro', glyph: '\uf252', label: 'Pomodoro' },
  { id: 'timer', glyph: '\uf2f2', label: 'Timer' },
  { id: 'stats', glyph: '\uf080', label: 'Statistik' },
  { id: 'water', glyph: '\uf043', label: 'Air' },
  { id: 'todo', glyph: '\uf0ae', label: 'Tugas' },
  { id: 'standup', glyph: '\uf0c0', label: 'Standup' },
  { id: 'shelf', glyph: '\uf07b', label: 'Shelf' },
  { id: 'bluetooth', glyph: '\uf293', label: 'Bluetooth' },
  { id: 'wifi', glyph: '\uf1eb', label: 'Wi-Fi' },
  { id: 'prayer', glyph: '\uf02d', label: 'Jadwal sholat' },
  { id: 'chat', glyph: '\uf075', label: 'Chat' },
  { id: 'settings', glyph: '\uf013', label: 'Pengaturan' },
];

export const widthFor = (page, view) => {
  if (page === 'media' && view === 'lyrics') return NOTCH.lyrics.w;
  return NOTCH[page]?.w ?? NOTCH.expanded.w;
};

export const heightFor = (page) =>
  NOTCH[page]?.h ?? NOTCH.expanded.h;

export const radiusFor = (page) =>
  NOTCH[page]?.r ?? NOTCH.expanded.r;

export const DEMO = {
  clock: '23:17',
  date: 'Senin, 23 November',
  agenda: 'Besok 09:00 · Rapat mingguan tim',
  todo: {
    done: 2,
    total: 5,
    tasks: [
      { text: 'Rapat tim desain', due: '14:00', done: false },
      { text: 'Tulis dokumentasi instalasi', due: '', done: false },
      { text: 'Review pull request #42', due: '16:30', done: false },
      { text: 'Perbarui dependency', due: '', done: true },
      { text: 'Backup database', due: '', done: true },
    ],
  },
  water: { total: 1500, goal: 2000, next: 250 },
  weather: { temp: 26, feels: 31, city: 'Berawan' },
  media: {
    title: 'Yellow',
    artist: 'Coldplay',
    elapsed: '0:42',
    total: '4:27',
    source: 'Demo',
    progress: 0.157,
    lyrics: [
      { time: '0:00', text: 'Look at the stars' },
      { time: '0:06', text: 'Look how they shine for you' },
      { time: '0:12', text: 'And everything you do' },
      { time: '0:18', text: 'Yeah, they were all yellow' },
    ],
    active: 1,
  },
  pomodoro: { time: '04:26', mode: 'Istirahat singkat', next: 'Istirahat panjang' },
  timer: { time: '12:00', mode: 'Timer bebas', presets: ['1', '3', '5', '10', '15', '25'] },
  stats: { cpu: 23, ram: 61, temp: 52, disk: '48G / 512G', swap: '1.2G / 8G' },
  standup: { yesterday: 2, today: 1, blockers: 0 },
  shelf: ['screenshot.png', 'laporan.pdf'],
  bluetooth: { device: 'Redmi Buds 6', battery: 65, volume: 64 },
  wifi: [{ name: 'Rumah-5G', signal: 4, connected: true }, { name: 'Kantor', signal: 3 }],
  prayer: {
    next: 'Subuh',
    countdown: '05:07:19',
    times: [
      { name: 'Subuh', at: '04:25' },
      { name: 'Dzuhur', at: '12:06' },
      { name: 'Ashar', at: '15:29' },
      { name: 'Magrib', at: '18:22' },
      { name: 'Isya', at: '19:38' },
    ],
    city: 'Denpasar · Kemenag',
  },
  chat: [
    { from: 'user', text: 'Ringkas kenapa notch memakai layer shell?', at: '23:10' },
    { from: 'gemini', text: 'Karena notch harus menempel ke tepi layar tanpa dianggap jendela biasa, dan hanya layer surface yang bisa melakukannya di Wayland.', at: '23:10' },
  ],
  calendar: { month: 'November 2026', today: 23, marked: [20, 27] },
  settings: [
    ['Glow cover', 'Aktif'],
    ['Ukuran notch', 'Normal'],
    ['Ikuti monitor fokus', 'Aktif'],
    ['Notch di semua monitor', 'Nonaktif'],
  ],
};
