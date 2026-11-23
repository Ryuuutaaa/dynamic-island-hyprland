<script setup>
import {
  NOTCH, MOTION, DEMO, PAGES, PALETTE,
  widthFor, heightFor, radiusFor,
} from '~/composables/useDemo';
import DemoIcon from '~/components/DemoIcon.vue';

// Keadaan notch. 'closed' | 'expanded' | 'peek'
const state = ref('closed');
const page = ref('idle');
const view = ref('card');
const pinned = ref(false);
const osd = ref(null);

const demoRoot = ref(null);
const stage = ref(null);
const notch = ref(null);

const geo = computed(() => {
  if (state.value === 'peek') {
    return { ...NOTCH.peek, label: 'peek' };
  }
  if (state.value === 'closed') {
    return { ...NOTCH.closed, label: 'closed' };
  }
  const w = widthFor(page.value, view.value);
  const h = heightFor(page.value);
  const r = radiusFor(page.value);
  return { w, h, r, ear: NOTCH.expanded.ear, label: page.value };
});

const styleVars = computed(() => ({
  '--demo-w': `${geo.value.w}px`,
  '--demo-h': `${geo.value.h}px`,
  '--demo-r': `${geo.value.r}px`,
  '--demo-ear': `${geo.value.ear}px`,
}));

// PAGE_ORDER window: 7 slot di sekitar halaman aktif, seperti nav AGS.
const navSlots = computed(() => {
  const index = PAGES.findIndex((p) => p.id === page.value);
  const size = Math.min(7, PAGES.length);
  const start = Math.min(Math.max(index - 3, 0), PAGES.length - size);
  return PAGES.slice(start, start + size);
});

function open() {
  if (state.value === 'peek') return;
  state.value = 'expanded';
}

function close() {
  if (pinned.value) return;
  if (view.value === 'lyrics') view.value = 'card';
  state.value = 'closed';
}

function togglePin() {
  pinned.value = !pinned.value;
  state.value = pinned.value ? 'expanded' : 'closed';
}

// Klik pada child SVG tidak memindahkan fokus ke tombol. Tanpa ini panah dan
// Escape tidak pernah sampai ke handler keyboard.
function onNotchClick(event) {
  notch.value?.focus();
  togglePin();
}

function go(id) {
  page.value = id;
  view.value = 'card';
  state.value = 'expanded';
  pinned.value = true;
}

function step(delta) {
  // Di tampilan lirik, panah kiri kembali ke kartu musik (bukan ke halaman
  // sebelumnya) — sama seperti perilaku aslinya.
  if (view.value === 'lyrics' && delta === -1) {
    view.value = 'card';
    return;
  }
  const index = PAGES.findIndex((p) => p.id === page.value);
  const next = (index + delta + PAGES.length) % PAGES.length;
  page.value = PAGES[next].id;
  view.value = 'card';
  state.value = 'expanded';
  pinned.value = true;
}

function onKey(event) {
  // Hanya tangani saat fokus berada di dalam demo (notch atau kontrolnya),
  // supaya panah tidak dibajak saat pengguna membaca halaman lain.
  // Panah bekerja dari mana pun di dalam demo, bukan hanya saat notch
  // terfokus: tombol pintas halaman juga memindahkan fokus. Yang penting
  // halaman lain tidak dibajak, jadi root demo harus memuat elemen aktif.
  const root = demoRoot.value;
  const active = document.activeElement;
  const focusOutside =
    active && active !== document.body && !['undefined', 'null'].includes(String(active))
      ? !root?.contains(active)
      : false;
  const isOption = ['INPUT', 'TEXTAREA', 'SELECT'].includes(active?.tagName);
  if (focusOutside || isOption) return;

  if (event.key === 'ArrowRight') {
    event.preventDefault();
    step(1);
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault();
    step(-1);
  } else if (event.key === 'Escape') {
    pinned.value = false;
    close();
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    togglePin();
  }
}

onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));

function showOsd() {
  osd.value = 'volume';
  state.value = 'peek';
  setTimeout(() => {
    if (osd.value === 'volume') {
      osd.value = null;
      if (!pinned.value) state.value = 'closed';
    }
  }, 6000);
}

// Bentuk telinga, diturunkan langsung dari Cairo di modules/index.js:
//   kiri : (0,0) -> (e,0) -> (e,e) -> busur pusat (0,e) kembali ke (0,0)
//   kanan: (e,0) -> (0,0) -> (0,e) -> busur pusat (e,e) kembali ke (e,0)
// Busur itu yang membuat sisi dalamnya konkaf, bukan cembung.
const leftEarPath = computed(() => {
  const e = geo.value.ear;
  return `M0,0 L${e},0 L${e},${e} A${e},${e} 0 0 1 0,0 Z`;
});

const rightEarPath = computed(() => {
  const e = geo.value.ear;
  return `M${e},0 L0,0 L0,${e} A${e},${e} 0 0 0 ${e},0 Z`;
});

// November 2026 mulai hari Minggu, jadi 5 sel kosong di depan (Senin-Minggu)
// lalu 30 hari. Tanpa padding ini tanggal 32-35 ikut tampil.
const calendarCells = computed(() => {
  const lead = 5;
  return Array.from({ length: lead + 30 }, (_, i) =>
    i < lead ? { key: `lead${i}`, day: 0 } : { key: `d${i}`, day: i - lead + 1 });
});

const battery = 82;
const todoRatio = DEMO.todo.done / DEMO.todo.total;
const waterRatio = DEMO.water.total / DEMO.water.goal;
</script>

<template>
  <div ref="demoRoot" class="demo" :style="styleVars">
    <!-- panggung: area wallpaper supaya notch terbaca sebagai lubang -->
    <div
      ref="stage"
      class="demo__stage"
      :class="{ 'is-open': state === 'expanded' }"
      @mouseenter="open"
      @mouseleave="close"
    >
      <div class="demo__notch-wrap">
        <!-- Telinga kiri: sama seperti arcNegative(0, e, e, 0, -PI/2) di
             modules/index.js. Lengkung konkaf menghadap badan notch, sehingga
             siluetnya menyatu ke bezel. -->
        <svg
          class="demo__ear demo__ear--l"
          :width="geo.ear"
          :height="geo.ear"
          :viewBox="`0 0 ${geo.ear} ${geo.ear}`"
          aria-hidden="true"
        >
          <path :d="leftEarPath" fill="currentColor" />
        </svg>

        <div
          ref="notch"
          class="demo__notch"
          role="button"
          tabindex="0"
          :aria-expanded="state === 'expanded'"
          aria-label="Notch interaktif. Enter untuk membuka, panah kiri dan kanan untuk berpindah halaman"
          @click="onNotchClick"
        >
          <!-- ── tertutup ─────────────────────────────────────────── -->
          <div v-if="state === 'closed'" class="demo-closed">
            <svg class="demo-ring" width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
              <circle cx="7.5" cy="7.5" r="6.5" fill="none" stroke="currentColor" stroke-opacity="0.18" stroke-width="2" />
              <circle
                cx="7.5" cy="7.5" r="6.5" fill="none"
                :stroke="PALETTE.ok" stroke-width="2"
                :stroke-dasharray="`${battery * 0.4084} 100`"
                transform="rotate(-90 7.5 7.5)"
              />
            </svg>
            <span class="demo-clock">{{ DEMO.clock }}</span>
            <span class="demo-eq" aria-hidden="true">
              <i /><i /><i /><i /><i />
            </span>
          </div>

          <!-- ── OSD volume ───────────────────────────────────────── -->
          <div v-else-if="state === 'peek'" class="demo-osd">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <path d="M4 9v6h4l5 4V5L8 9z" />
              <path d="M17 9.5a4 4 0 0 1 0 5M20 7a8 8 0 0 1 0 10" />
            </svg>
            <div class="demo-osd__bar"><span :style="{ width: `${DEMO.bluetooth.volume}%` }" /></div>
            <span class="demo-osd__pct">{{ DEMO.bluetooth.volume }}%</span>
            <span class="demo-osd__name">dbE Nimbo Three Analog Stereo</span>
          </div>

          <!-- ── halaman ──────────────────────────────────────────── -->
          <template v-else>
            <div class="demo-page">
              <!-- Ringkasan -->
              <div v-if="page === 'idle'" class="demo-idle">
                <div>
                  <div class="demo-idle__clock">{{ DEMO.clock }}</div>
                  <div class="demo-idle__date">{{ DEMO.date }}</div>
                  <div class="demo-idle__agenda">{{ DEMO.agenda }}</div>
                </div>
                <div class="demo-idle__stats">
                  <div><span>Tugas</span><b>{{ DEMO.todo.done }}/{{ DEMO.todo.total }}</b></div>
                  <div><span>Air</span><b>1.5/2 L</b></div>
                  <div><span>Cuaca</span><b>{{ DEMO.weather.temp }}°</b></div>
                </div>
              </div>

              <!-- Media -->
              <div v-else-if="page === 'media'" class="demo-media">
                <div class="demo-media__cover" aria-hidden="true" />
                <div v-if="view === 'card'" class="demo-media__body">
                  <div class="demo-media__title">{{ DEMO.media.title }}</div>
                  <div class="demo-media__artist">{{ DEMO.media.artist }}</div>
                  <div class="demo-media__bar"><span :style="{ width: `${DEMO.media.progress * 100}%` }" /></div>
                  <div class="demo-media__times">
                    <span>{{ DEMO.media.elapsed }}</span>
                    <span>{{ DEMO.media.total }} · {{ DEMO.media.source }}</span>
                  </div>
                  <div class="demo-media__ctls">
                    <button type="button" aria-label="Sebelumnya"><DemoIcon name="prev" :size="14" /></button>
                    <button type="button" aria-label="Jeda"><DemoIcon name="pause" :size="14" /></button>
                    <button type="button" aria-label="Berikutnya"><DemoIcon name="next" :size="14" /></button>
                    <button
                      type="button"
                      aria-label="Tampilkan lirik"
                      @click.stop="view = 'lyrics'"
                    ><DemoIcon name="chat" :size="14" /></button>
                  </div>
                </div>
                <div v-else class="demo-lyrics">
                  <div class="demo-lyrics__head">
                    {{ DEMO.media.title }} · {{ DEMO.media.artist }}
                  </div>
                  <div class="demo-lyrics__list">
                    <p
                      v-for="(line, i) in DEMO.media.lyrics"
                      :key="line.text"
                      :class="{ 'is-active': i === DEMO.media.active }"
                    >{{ line.text }}</p>
                  </div>
                  <button type="button" class="demo-lyrics__back" @click.stop="view = 'card'">
                    ← Kembali ke musik
                  </button>
                </div>
              </div>

              <!-- Cuaca -->
              <div v-else-if="page === 'weather'" class="demo-weather">
                <div class="demo-weather__now">
                  <div class="demo-weather__temp">{{ DEMO.weather.temp }}°</div>
                  <div class="demo-weather__meta">{{ DEMO.weather.city }} · terasa {{ DEMO.weather.feels }}°</div>
                </div>
                <div class="demo-weather__hours">
                  <div v-for="(h, i) in ['00:00', '01:00', '02:00']" :key="h">
                    <span>{{ h }}</span>
                    <DemoIcon name="weather" :size="14" />
                    <b>{{ 26 + i }}°</b>
                  </div>
                </div>
                <div class="demo-weather__days">
                  <div v-for="(d, i) in ['Besok', 'Rab', 'Kam']" :key="d">
                    <span>{{ d }}</span><b>{{ 30 - i }}°/{{ 25 }}°</b>
                  </div>
                </div>
              </div>

              <!-- Pomodoro -->
              <div v-else-if="page === 'pomodoro'" class="demo-pomodoro">
                <svg width="88" height="88" viewBox="0 0 88 88" aria-hidden="true">
                  <circle cx="44" cy="44" r="41" fill="none" :stroke="PALETTE.danger" stroke-opacity="0.2" stroke-width="3" />
                  <circle
                    cx="44" cy="44" r="41" fill="none" :stroke="PALETTE.danger" stroke-width="3"
                    stroke-dasharray="60 258" transform="rotate(-90 44 44)"
                  />
                </svg>
                <div>
                  <div class="demo-pomodoro__time">{{ DEMO.pomodoro.time }}</div>
                  <div class="demo-pomodoro__mode">{{ DEMO.pomodoro.mode }}</div>
                </div>
                <div class="demo-pills">
                  <span class="demo-pill">Istirahat panjang</span>
                  <span class="demo-pill"><DemoIcon name="play" :size="12" /></span>
                  <span class="demo-pill"><DemoIcon name="refresh" :size="12" /></span>
                </div>
              </div>

              <!-- Timer -->
              <div v-else-if="page === 'timer'" class="demo-timer">
                <div class="demo-timer__time">{{ DEMO.timer.time }}</div>
                <div class="demo-timer__mode">{{ DEMO.timer.mode }}</div>
                <div class="demo-timer__presets">
                  <span v-for="p in DEMO.timer.presets" :key="p">{{ p }}</span>
                </div>
                <div class="demo-pills">
                  <span class="demo-pill">−</span>
                  <span class="demo-pill"><DemoIcon name="play" :size="12" /></span>
                  <span class="demo-pill"><DemoIcon name="refresh" :size="12" /></span>
                  <span class="demo-pill">+</span>
                </div>
              </div>

              <!-- Statistik -->
              <div v-else-if="page === 'stats'" class="demo-stats">
                <div v-for="m in [
                  { k: 'CPU', v: DEMO.stats.cpu },
                  { k: 'RAM', v: DEMO.stats.ram },
                  { k: 'SUHU', v: DEMO.stats.temp },
                ]" :key="m.k" class="demo-stats__cell">
                  <span>{{ m.k }}</span>
                  <b>{{ m.v }}<em>%</em></b>
                  <svg width="62" height="16" viewBox="0 0 62 16" aria-hidden="true">
                    <polyline
                      :points="m.k === 'SUHU'
                        ? '0,11 10,10 20,12 30,9 40,10 50,8 62,9'
                        : '0,12 10,9 20,11 30,7 40,9 50,6 62,8'"
                      fill="none"
                      :stroke="m.v > 80 ? PALETTE.danger : PALETTE.accent2"
                      stroke-width="1.4"
                    />
                  </svg>
                </div>
                <div class="demo-stats__foot">disk {{ DEMO.stats.disk }} · swap {{ DEMO.stats.swap }}</div>
              </div>

              <!-- Air -->
              <div v-else-if="page === 'water'" class="demo-water">
                <div class="demo-water__head">
                  <b>Air</b><span>Pengingat</span>
                  <i class="demo-switch" aria-hidden="true" />
                </div>
                <div class="demo-water__total">
                  1.5<em>/ 2 L</em>
                  <span>{{ Math.round(waterRatio * 100) }}% · {{ DEMO.water.goal - DEMO.water.total }} ml lagi</span>
                </div>
                <div class="demo-progress"><span :style="{ width: `${waterRatio * 100}%` }" /></div>
                <div class="demo-pills">
                  <span class="demo-pill">Minum</span>
                  <span class="demo-pill is-ghost">target</span>
                  <span class="demo-pill">−</span>
                  <span class="demo-pill">+</span>
                </div>
                <div class="demo-water__chart" aria-hidden="true">
                  <svg width="124" height="52" viewBox="0 0 124 52">
                    <line x1="18" y1="10" x2="124" y2="10" stroke="currentColor" stroke-opacity=".12" stroke-dasharray="2 3" />
                    <line x1="18" y1="28" x2="124" y2="28" stroke="currentColor" stroke-opacity=".12" stroke-dasharray="2 3" />
                    <line x1="18" y1="46" x2="124" y2="46" stroke="currentColor" stroke-opacity=".12" stroke-dasharray="2 3" />
                    <g :fill="PALETTE.accent2" fill-opacity=".85">
                      <rect x="18" y="30" width="9" height="16" rx="1.5" />
                      <rect x="31" y="40" width="9" height="6" rx="1.5" opacity=".45" />
                      <rect x="44" y="24" width="9" height="22" rx="1.5" />
                      <rect x="57" y="40" width="9" height="6" rx="1.5" opacity=".45" />
                      <rect x="70" y="16" width="9" height="30" rx="1.5" />
                      <rect x="83" y="40" width="9" height="6" rx="1.5" opacity=".45" />
                      <rect x="96" y="36" width="9" height="10" rx="1.5" />
                    </g>
                  </svg>
                </div>
              </div>

              <!-- Tugas -->
              <div v-else-if="page === 'todo'" class="demo-todo">
                <div class="demo-todo__head">
                  <b>Tugas</b>
                  <span>{{ DEMO.todo.done }}/{{ DEMO.todo.total }} selesai</span>
                  <i class="demo-todo__add">+ Tambah</i>
                </div>
                <div class="demo-todo__list">
                  <div
                    v-for="task in DEMO.todo.tasks"
                    :key="task.text"
                    class="demo-todo__row"
                    :class="{ 'is-done': task.done }"
                  >
                    <i class="demo-todo__check" aria-hidden="true" />
                    <span class="demo-todo__text">{{ task.text }}</span>
                    <span v-if="task.due" class="demo-todo__due">{{ task.due }}</span>
                  </div>
                </div>
              </div>

              <!-- Standup -->
              <div v-else-if="page === 'standup'" class="demo-standup">
                <div class="demo-standup__head">
                  <b>Standup</b><span>{{ DEMO.date }} · tersimpan</span>
                  <i class="demo-pill">Lihat</i>
                </div>
                <div class="demo-standup__rows">
                  <div><span><i class="demo-tick" aria-hidden="true" />Kemarin</span><b>{{ DEMO.standup.yesterday }}</b></div>
                  <div><span><i class="demo-tick" aria-hidden="true" />Hari ini</span><b>{{ DEMO.standup.today }}</b></div>
                  <div><span><i class="demo-tick" aria-hidden="true" />Hambatan</span><b>{{ DEMO.standup.blockers }}</b></div>
                </div>
              </div>

              <!-- Shelf -->
              <div v-else-if="page === 'shelf'" class="demo-shelf">
                <div class="demo-shelf__head"><b>Shelf</b><span>{{ DEMO.shelf.length }} item</span></div>
                <div class="demo-shelf__cards">
                  <div v-for="(f, i) in DEMO.shelf" :key="f" class="demo-shelf__card">
                    <span class="demo-shelf__thumb" :style="{ background: i === 0 ? 'linear-gradient(135deg,#9a6b3f,#3d2a3a)' : 'linear-gradient(135deg,#3a4a63,#22202e)' }" aria-hidden="true" />
                    <span>{{ f }}</span>
                  </div>
                </div>
              </div>

              <!-- Bluetooth -->
              <div v-else-if="page === 'bluetooth'" class="demo-bt">
                <div class="demo-bt__head">
                  <b>Bluetooth</b><span>Tersambung</span>
                  <DemoIcon name="bluetooth" :size="14" />
                </div>
                <div class="demo-bt__row">
                  <DemoIcon name="music" :size="14" />
                  <span>{{ DEMO.bluetooth.device }}</span>
                  <b>{{ DEMO.bluetooth.battery }}%</b>
                </div>
                <div class="demo-bt__vol">
                  <DemoIcon name="music" :size="13" />
                  <span class="demo-progress demo-progress--sm"><i :style="{ width: `${DEMO.bluetooth.volume}%` }" /></span>
                  <b>{{ DEMO.bluetooth.volume }}%</b>
                </div>
              </div>

              <!-- Wi-Fi -->
              <div v-else-if="page === 'wifi'" class="demo-wifi">
                <div class="demo-wifi__head">
                  <b>Wi-Fi</b><span>Tersambung</span>
                  <DemoIcon name="refresh" :size="13" />
                  <DemoIcon name="wifi" :size="14" />
                </div>
                <div v-for="net in DEMO.wifi" :key="net.name" class="demo-wifi__row" :class="{ 'is-current': net.connected }">
                  <DemoIcon name="wifi" :size="14" />
                  <span>{{ net.name }}</span>
                  <b>{{ net.connected ? 'Terputus' : 'Sambung' }}</b>
                </div>
              </div>

              <!-- Jadwal sholat -->
              <div v-else-if="page === 'prayer'" class="demo-prayer">
                <div class="demo-prayer__side">
                  <div class="demo-prayer__next">Besok {{ DEMO.prayer.next }}</div>
                  <div class="demo-prayer__cd">{{ DEMO.prayer.countdown }}</div>
                  <div class="demo-prayer__city">{{ DEMO.prayer.city }}</div>
                </div>
                <div class="demo-prayer__chart">
                  <svg viewBox="0 0 320 82" width="100%" height="82" aria-hidden="true">
                    <path d="M0 74a160 62 0 0 1 320 0" fill="none" stroke="currentColor" stroke-opacity=".18" stroke-dasharray="2 3" />
                    <path d="M0 74a160 62 0 0 1 320 0" fill="none" :stroke="PALETTE.accent2" stroke-opacity=".5" />
                    <circle cx="250" cy="34" r="5" fill="currentColor" fill-opacity=".85" />
                  </svg>
                  <div class="demo-prayer__times">
                    <div v-for="t in DEMO.prayer.times" :key="t.name">
                      <span>{{ t.name }}</span><b>{{ t.at }}</b>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Chat -->
              <div v-else-if="page === 'chat'" class="demo-chat">
                <div class="demo-chat__head">
                  <div><b>Chat</b><span>Gemini · gemini-3.5-flash-lite</span></div>
                  <i class="demo-pill">Tanya Gemini</i>
                </div>
                <div class="demo-chat__list">
                  <div v-for="m in DEMO.chat" :key="m.text" class="demo-chat__msg" :class="`is-${m.from}`">
                    <span class="demo-chat__avatar" aria-hidden="true">{{ m.from === 'user' ? 'K' : 'G' }}</span>
                    <div>
                      <p>{{ m.text }}</p><time>{{ m.at }}</time>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Kalender -->
              <div v-else-if="page === 'calendar'" class="demo-cal">
                <div class="demo-cal__head">
                  <b>{{ DEMO.calendar.month }}</b>
                  <span class="demo-pill is-ghost">Hari ini</span>
                </div>
                <div class="demo-cal__grid">
                  <span v-for="d in ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']" :key="d" class="demo-cal__dow">{{ d }}</span>
                  <span
                    v-for="n in calendarCells"
                    :key="`d${n.key}`"
                    class="demo-cal__day"
                    :class="{
                      'is-empty': !n.day,
                      'is-today': n.day === 23,
                      'is-marked': DEMO.calendar.marked.includes(n.day),
                    }"
                  >{{ n.day || '' }}</span>
                </div>
              </div>

              <!-- Pengaturan -->
              <div v-else class="demo-settings">
                <div class="demo-settings__head"><b>Pengaturan</b></div>
                <div v-for="[k, v] in DEMO.settings" :key="k" class="demo-settings__row">
                  <span>{{ k }}</span><b>{{ v }}</b>
                </div>
              </div>
            </div>

            <!-- navigasi: ‹ [7 ikon] › -->
            <div class="demo-nav">
              <button type="button" class="demo-nav__arrow" aria-label="Halaman sebelumnya" @click.stop="step(-1)">
                <DemoIcon name="chevronLeft" :size="13" />
              </button>
              <div class="demo-nav__slots">
                <button
                  v-for="slot in navSlots"
                  :key="slot.id"
                  type="button"
                  class="demo-nav__btn"
                  :class="{ 'is-active': slot.id === page }"
                  :aria-label="slot.label"
                  :aria-current="slot.id === page ? 'page' : undefined"
                  @click.stop="go(slot.id)"
                >
                  <DemoIcon :name="slot.id" :size="15" />
                </button>
              </div>
              <button type="button" class="demo-nav__arrow" aria-label="Halaman berikutnya" @click.stop="step(1)">
                <DemoIcon name="chevronRight" :size="13" />
              </button>
            </div>
          </template>
        </div>

        <svg
          class="demo__ear demo__ear--r"
          :width="geo.ear"
          :height="geo.ear"
          :viewBox="`0 0 ${geo.ear} ${geo.ear}`"
          aria-hidden="true"
        >
          <path :d="rightEarPath" fill="currentColor" />
        </svg>
      </div>
    </div>

    <!-- kontrol -->
    <div class="demo__controls">
      <div class="demo__row">
        <button
          type="button"
          class="btn btn--quiet demo__btn"
          :aria-pressed="pinned"
          @click="togglePin"
        >
          {{ pinned ? 'Tutup notch' : 'Buka notch' }}
        </button>
        <button type="button" class="btn btn--link demo__btn" @click="showOsd">
          Lihat OSD volume
        </button>
      </div>

      <p class="demo__readout">
        <span class="demo__dot" :class="{ 'is-live': state === 'expanded' }" aria-hidden="true" />
        <code>{{ geo.label }}</code>
        {{ geo.w }} × {{ geo.h }} px · radius {{ geo.r }} · telinga {{ geo.ear }}
      </p>

      <p class="demo__hint">
        Arahkan pointer ke notch untuk membuka. Klik notch atau tekan
        <kbd>Enter</kbd> untuk menahan terbuka, lalu panah
        <kbd>←</kbd> <kbd>→</kbd> untuk berpindah halaman. <kbd>Esc</kbd>
        menutup.
      </p>

      <div class="demo__pages" role="group" aria-label="Buka halaman tertentu">
        <button
          v-for="slot in PAGES"
          :key="`pick-${slot.id}`"
          type="button"
          class="demo__pick"
          :class="{ 'is-active': slot.id === page && state === 'expanded' }"
          @click="go(slot.id)"
        >
          {{ slot.label }}
        </button>
      </div>

      <p class="demo__note">
        Geometri, durasi {{ MOTION.duration }} ms, dan kurva
        {{ MOTION.curve }} diambil dari <code>config.js</code>. Isi halaman
        memakai data contoh, bukan data pengguna.
      </p>
    </div>
  </div>
</template>
