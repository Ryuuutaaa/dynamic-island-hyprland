<script>
import { h } from 'vue';

// Ikon asli di AGS memakai Nerd Font, yang tidak tersedia di browser. Bentuk
// diganti ikon garis 24×24 dengan stroke 2. Setiap ikon adalah daftar
// primitif SVG, bukan string HTML: `v-html` tidak andal di dalam SVG karena
// browser mem-parse children-nya di namespace yang salah.
const PATHS = {
  clock: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M12 7v5l3.5 2' }]],
  // Nav memakai id halaman, bukan nama ikon. 'idle' adalah halaman Ringkasan.
  idle: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M12 7v5l3.5 2' }]],
  music: [
    ['circle', { cx: 8, cy: 17, r: 2.4 }],
    ['path', { d: 'M10.4 17V6l7 3.2v3' }],
  ],
  weather: [['path', { d: 'M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.7-1.3A4.2 4.2 0 0 1 17 18z' }]],
  calendar: [
    ['rect', { x: 3, y: 5, width: 18, height: 16, rx: 2 }],
    ['path', { d: 'M3 10h18M8 3v4M16 3v4' }],
  ],
  pomodoro: [
    ['path', { d: 'M8 4h8M9 4c0 4-3 6-3 10a4 4 0 0 1 8 0c0-4-3-6-3-10' }],
    ['path', { d: 'M9 20h6' }],
  ],
  timer: [
    ['circle', { cx: 12, cy: 13, r: 8 }],
    ['path', { d: 'M12 9v4l2.5 1.5M9 2h6' }],
  ],
  stats: [['path', { d: 'M4 20V12M10 20V6M16 20v-5M22 20V9' }]],
  water: [['path', { d: 'M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z' }]],
  todo: [
    ['path', { d: 'M4 7h11l2.5 3-2.5 3H4' }],
    ['path', { d: 'M4 17h11l2.5 3-2.5 3H4', opacity: 0.55 }],
  ],
  standup: [
    ['circle', { cx: 8.5, cy: 9, r: 3 }],
    ['circle', { cx: 16.5, cy: 9, r: 3 }],
    ['path', { d: 'M3 19a5.5 5.5 0 0 1 11 0M10 19a5.5 5.5 0 0 1 11 0' }],
  ],
  shelf: [['path', { d: 'M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' }]],
  bluetooth: [['path', { d: 'M9 3l7 5-7 5V3M9 21l7-5-7-5v10' }]],
  wifi: [
    ['path', { d: 'M2.5 9.5a14 14 0 0 1 19 0M6 14a9 9 0 0 1 12 0' }],
    ['circle', { cx: 12, cy: 18.5, r: 1.4, fill: 'currentColor', stroke: 'none' }],
  ],
  prayer: [
    ['path', { d: 'M5 15a7 7 0 0 1 14 0M12 5v3M12 19v2' }],
    ['circle', { cx: 12, cy: 9, r: 1.6, fill: 'currentColor', stroke: 'none' }],
  ],
  chat: [['path', { d: 'M4 5h16v9a3 3 0 0 1-3 3H9l-5 4V5z' }]],
  settings: [
    ['circle', { cx: 12, cy: 12, r: 3 }],
    ['path', { d: 'M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2' }],
  ],
  chevronLeft: [['path', { d: 'M14.5 6 9 12l5.5 6' }]],
  chevronRight: [['path', { d: 'M9.5 6 15 12l-5.5 6' }]],
  play: [['path', { d: 'M7 5l10 7-10 7z' }]],
  pause: [['path', { d: 'M9 6v12M15 6v12', 'stroke-width': 3 }]],
  prev: [['path', { d: 'M10 6v12M10 6l-5 6 5 6' }]],
  next: [['path', { d: 'M14 6v12M14 6l5 6-5 6' }]],
  refresh: [['path', { d: 'M20 12a8 8 0 1 1-2.6-5.9M20 4v4h-4' }]],
  plus: [['path', { d: 'M12 5v14M5 12h14' }]],
  close: [['path', { d: 'M6 6l12 12M18 6L6 18' }]],
};

export default {
  props: {
    name: { type: String, required: true },
    size: { type: Number, default: 15 },
  },
  setup(props) {
    return () =>
      h(
        'svg',
        {
          width: props.size,
          height: props.size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': 2,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'aria-hidden': 'true',
          focusable: 'false',
        },
        (PATHS[props.name] ?? []).map(([tag, attrs]) => h(tag, attrs)),
      );
  },
};
</script>
