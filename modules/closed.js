import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=3.0';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';
import Battery from 'resource:///com/github/Aylur/ags/service/battery.js';
import Mpris from 'resource:///com/github/Aylur/ags/service/mpris.js';
import CONFIG from '../config.js';
import { isPlaying } from '../state.js';
import { palette, hexToRgb } from '../theme.js';
import { roundedRect } from '../draw.js';
import { ramp } from '../spring.js';
import { formatClock, formatDateShort, onMinute } from './timefmt.js';
import { tabular } from './type.js';
import { pomodoro } from './pomodoro.js';
import { todo } from './todo.js';
import { water, total, liters } from './water.js';
import { weather } from './weather.js';
import { timer as timerState, mmss as timerClock } from './timer.js';

const RING = 15;
const RING_THICK = 2;

const BARS = 5;
const BAR_W = 2;
const BAR_GAP = 2;
const BARS_H = 14;
const BARS_W = BARS * BAR_W + (BARS - 1) * BAR_GAP;

// Ikon untuk indikator teks di notch tertutup. Musik memakai equalizer, jadi
// tidak punya ikon terpisah; tanggal juga tidak perlu ikon.
const ACTIVITY_ICONS = {
    pomodoro: '\uf252',
    todo: '\uf0ae',
    water: '\uf043',
    timer: '\uf2f2',
    weather: '\uf0c2',
};

const FG = hexToRgb(palette.fg);
const ACCENT = hexToRgb(palette.accent2);
// saat mengisi daya busur memakai warna "ok" (bisa di-override wallust)
const OK = hexToRgb(palette.ok);

// Ring baterai (pengganti conic-gradient di web)
const BatteryRing = () => Widget.DrawingArea({
    className: 'dyn-island-ring',
    setup: self => {
        self.set_size_request(RING, RING);
        self.hook(Battery, () => self.queue_draw());
    },
    drawFn: (self, cr, width, height) => {
        const thickness = RING_THICK;
        const radius = Math.min(width, height) / 2 - thickness / 2;
        if (radius <= 0) return;
        const cx = width / 2;
        const cy = height / 2;

        cr.setLineWidth(thickness);
        cr.setSourceRGBA(FG[0], FG[1], FG[2], 0.18);
        cr.arc(cx, cy, radius, 0, Math.PI * 2);
        cr.stroke();

        const percent = Battery.available ? Math.max(0, Math.min(100, Battery.percent)) : 0;
        if (percent <= 0) return;
        // notch tertutup cuma 150px: status mengisi daya dibedakan lewat warna
        // busur, bukan teks tambahan
        const arc = Battery.charging ? OK : ACCENT;
        cr.setSourceRGBA(arc[0], arc[1], arc[2], 0.95);
        cr.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * percent) / 100);
        cr.stroke();
    },
});

// Equalizer 5 bar; timer-nya hanya hidup saat ada musik yang playing
const Equalizer = () => {
    let phase = 0;
    let timer = 0;

    return Widget.DrawingArea({
        className: 'dyn-island-eq',
        setup: self => {
            self.set_size_request(BARS_W, BARS_H);

            const tick = () => {
                phase += 0.55;
                self.queue_draw();
            };
            // dulu interval 90ms hidup terus — 11x bangun CPU per detik,
            // sepanjang waktu, walau tidak ada yang diputar
            const sync = () => {
                if (isPlaying() && !timer) {
                    timer = Utils.interval(90, tick, self);
                    return;
                }
                if (!isPlaying() && timer) {
                    GLib.source_remove(timer);
                    timer = 0;
                    phase = 0;
                    self.queue_draw();
                }
            };
            sync();
            self.hook(Mpris, sync, 'changed');
            self.hook(Mpris, sync, 'player-changed');
        },
        drawFn: (self, cr, width, height) => {
            const playing = isPlaying();
            const mid = height / 2;
            for (let i = 0; i < BARS; i++) {
                const wave = Math.sin(phase + i * 1.1) * 0.5 + 0.5;
                const barH = playing ? 3 + wave * (height - 3) : 3;
                const x = i * (BAR_W + BAR_GAP);
                const y = mid - barH / 2;
                cr.setSourceRGBA(FG[0], FG[1], FG[2], playing ? 0.85 : 0.3);
                roundedRect(cr, x, y, BAR_W, barH, BAR_W / 2);
                cr.fill();
            }
        },
    });
};

export default () => {
    const time = tabular(Widget.Label({
        className: 'dyn-island-closed-time',
        label: formatClock(),
    }));
    // Satu label aktivitas menggantikan lima label terpisah: hanya satu yang
    // terlihat, dan natural width-nya tidak lagi menjumlahkan semua indikator
    // (itu yang dulu membuat window closed melebar).
    const activity = tabular(Widget.Label({
        className: 'dyn-island-closed-activity',
        visible: false,
        truncate: 'end',
        maxWidthChars: 10,
    }));
    const activityIcon = Widget.Label({
        className: 'dyn-island-closed-activity-icon',
        visible: false,
    });
    const eq = Equalizer();
    let fade = null;
    let lastChosen = '';
    let dead = false;

    // Saat indikator berganti, fade 180ms (bukan snap). Hanya label/ikon
    // aktivitas yang memudar; jam/ring baterai tetap.
    const fadeIn = widgets => {
        if (dead || !widgets.length) return;
        if (fade) fade.stop();
        for (const widget of widgets) widget.set_opacity(0);
        let current = null;
        current = ramp({
            duration: CONFIG.motion?.reduced ? 120 : 180,
            onFrame: value => {
                if (dead) return;
                for (const widget of widgets) widget.set_opacity(value);
            },
            onDone: () => {
                if (fade === current) fade = null;
            },
        });
        fade = current;
        fade.start();
    };

    // Garis progres 2px di dasar notch: hanya untuk sesi yang punya durasi
    // (pomodoro / timer), bukan stopwatch atau musik.
    const progress = Widget.DrawingArea({
        className: 'dyn-island-closed-progress',
        halign: Gtk.Align.CENTER,
        valign: Gtk.Align.END,
        setup: self => {
            // lebar mengikuti geometry closed (compact/large)
            self.set_size_request(Math.max(80, (CONFIG.geometry.closed.w ?? 150) - 26), 2);
            self.active = false;
            self.fraction = 0;
            self.setProgress = (active, fraction) => {
                const next = Math.max(0, Math.min(1, Number(fraction) || 0));
                if (self.active === active && Math.abs(self.fraction - next) < 0.001) return;
                self.active = active;
                self.fraction = next;
                self.queue_draw();
            };
        },
        drawFn: (self, cr, width, height) => {
            if (!self.active) return;
            const barHeight = Math.max(1, height);
            const radius = barHeight / 2;
            cr.setSourceRGBA(FG[0], FG[1], FG[2], 0.16);
            roundedRect(cr, 0, 0, width, barHeight, radius);
            cr.fill();
            if (self.fraction <= 0) return;
            cr.setSourceRGBA(ACCENT[0], ACCENT[1], ACCENT[2], 0.95);
            roundedRect(cr, 0, 0, Math.max(barHeight, width * self.fraction), barHeight, radius);
            cr.fill();
        },
    });

    const mmss = seconds => {
        const total = Math.max(0, Math.floor(Number(seconds) || 0));
        return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
    };

    const sessionActive = () => {
        const state = pomodoro.value;
        return state.running || state.remaining < state.total;
    };

    // Hanya tugas yang punya jam (due) — itu yang "hampir jatuh tempo" ala Poni.
    // Daftar tugas tanpa jam tidak boleh merebut slot notch tertutup.
    const dueTasks = () => (todo.value.tasks || []).filter(task => !task.done && task.due).length;
    const waterText = () => `${liters(total(water.value))}/${liters(water.value.goal)}L`;

    // Urutan prioritas dari config; 'date' jadi fallback bila tidak ada yang aktif.
    const INDICATORS = (CONFIG.closedIndicators ?? ['music', 'pomodoro', 'todo', 'date'])
        .filter(name => ['music', 'pomodoro', 'timer', 'todo', 'water', 'weather', 'date'].includes(name));

    const syncClock = () => {
        time.label = formatClock();
        syncMode();
    };

    // Hanya SATU indikator kontekstual yang tampil (plus jam & ring baterai)
    // supaya notch tertutup tetap tenang walau banyak modul aktif.
    const syncMode = () => {
        const values = {
            music: isPlaying() ? 'eq' : '',
            pomodoro: sessionActive() ? mmss(pomodoro.value.remaining) : '',
            todo: dueTasks() ? `${dueTasks()} tugas` : '',
            water: total(water.value) > 0 ? waterText() : '',
            weather: weather.value.ok && weather.value.temp !== null ? `${weather.value.temp}°` : '',
            timer: timerState.value.running
                || (timerState.value.mode === 'timer' && timerState.value.remaining < timerState.value.total)
                ? timerClock(timerState.value.mode === 'timer'
                    ? timerState.value.remaining
                    : timerState.value.elapsed)
                : '',
            date: formatDateShort(),
        };
        let chosen = 'date';
        for (const name of INDICATORS) {
            if (values[name]) { chosen = name; break; }
        }
        const music = chosen === 'music';
        eq.visible = music;
        activity.visible = !music;
        activity.label = music ? '' : (values[chosen] || '');
        const icon = ACTIVITY_ICONS[chosen] || '';
        activityIcon.label = icon;
        activityIcon.visible = !music && !!icon;

        if (chosen !== lastChosen) {
            lastChosen = chosen;
            const widgets = music
                ? [eq]
                : [activityIcon, activity].filter(widget => widget.visible);
            fadeIn(widgets);
        }

        const pomodoroState = pomodoro.value;
        const timerValue = timerState.value;
        let barActive = false;
        let fraction = 0;
        if (chosen === 'pomodoro' && pomodoroState.total > 0) {
            barActive = true;
            fraction = pomodoroState.remaining / pomodoroState.total;
        } else if (chosen === 'timer' && timerValue.mode === 'timer' && timerValue.total > 0) {
            barActive = true;
            fraction = timerValue.remaining / timerValue.total;
        }
        progress.setProgress(barActive, fraction);
    };

    const content = Widget.Box({
        className: 'dyn-island-closed',
        spacing: 4,
        halign: Gtk.Align.CENTER,
        valign: Gtk.Align.CENTER,
        children: [BatteryRing(), time, activityIcon, activity, eq],
    });

    return Widget.Overlay({
        child: content,
        overlays: [progress],
        setup: self => {
            syncMode();
            self.hook(Mpris, syncMode, 'changed');
            self.hook(Mpris, syncMode, 'player-changed');
            // remaining dipublikasikan tiap detik oleh modul pomodoro
            self.hook(pomodoro, syncMode);
            self.hook(todo, syncMode);
            self.hook(water, syncMode);
            self.hook(weather, syncMode);
            self.hook(timerState, syncMode);
            onMinute(syncClock, self);
            self.connect('destroy', () => {
                dead = true;
                if (fade) {
                    fade.stop();
                    fade = null;
                }
            });
        },
    });
};
