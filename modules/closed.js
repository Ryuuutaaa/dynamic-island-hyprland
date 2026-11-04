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
import { formatClock, formatDateShort, onMinute } from './timefmt.js';
import { pomodoro } from './pomodoro.js';
import { todo } from './todo.js';
import { water, total, liters } from './water.js';
import { weather } from './weather.js';

const RING = 15;
const RING_THICK = 2;

const BARS = 5;
const BAR_W = 2;
const BAR_GAP = 2;
const BARS_H = 14;
const BARS_W = BARS * BAR_W + (BARS - 1) * BAR_GAP;

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
    const time = Widget.Label({
        className: 'dyn-island-closed-time',
        label: formatClock(),
    });
    // Saat tidak ada musik, equalizer cuma stub redup (tidak informatif), jadi
    // ruangnya dipakai untuk tanggal — satu-satunya tempat tanggal tampil
    // (modul clock waybar sudah dihapus untuk memberi ruang ke notch).
    const date = Widget.Label({
        className: 'dyn-island-closed-date',
        label: formatDateShort(),
        visible: false,
    });
    // Sisa waktu pomodoro: menggantikan tanggal saat sesi fokus/istirahat
    // aktif (musik tetap prioritas tertinggi lewat equalizer).
    const todoLabel = Widget.Label({ className: 'dyn-island-closed-pomo', visible: false });
    const waterLabel = Widget.Label({ className: 'dyn-island-closed-pomo', visible: false });
    const pomo = Widget.Label({
        className: 'dyn-island-closed-pomo',
        visible: false,
        setup: self => self.set_no_show_all(true),
    });
    const eq = Equalizer();

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
        .filter(name => ['music', 'pomodoro', 'todo', 'water', 'weather', 'date'].includes(name));

    const syncPomo = () => {
        pomo.label = mmss(pomodoro.value.remaining);
    };

    const syncClock = () => {
        time.label = formatClock();
        date.label = formatDateShort();
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
            date: formatDateShort(),
        };
        let chosen = 'date';
        for (const name of INDICATORS) {
            if (values[name]) { chosen = name; break; }
        }
        eq.visible = chosen === 'music';
        pomo.visible = chosen === 'pomodoro';
        todoLabel.visible = chosen === 'todo';
        waterLabel.visible = chosen === 'water';
        date.visible = chosen === 'date';
        if (chosen === 'pomodoro') syncPomo();
        if (chosen === 'todo') todoLabel.label = values.todo;
        if (chosen === 'water') waterLabel.label = values.water;
    };

    return Widget.Box({
        className: 'dyn-island-closed',
        spacing: 8,
        halign: Gtk.Align.CENTER,
        valign: Gtk.Align.CENTER,
        children: [BatteryRing(), time, date, pomo, todoLabel, waterLabel, eq],
        setup: self => {
            syncMode();
            self.hook(Mpris, syncMode, 'changed');
            self.hook(Mpris, syncMode, 'player-changed');
            // remaining dipublikasikan tiap detik oleh modul pomodoro
            self.hook(pomodoro, () => { syncMode(); syncPomo(); });
            self.hook(todo, syncMode);
            self.hook(water, syncMode);
            self.hook(weather, syncMode);
            onMinute(syncClock, self);
        },
    });
};
