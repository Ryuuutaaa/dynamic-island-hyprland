import Gtk from 'gi://Gtk?version=3.0';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';
import { prayer } from './prayer.js';
import { nextPrayer } from './prayer-calc.js';
import { palette, hexToRgb } from '../theme.js';

const FG = hexToRgb(palette.fg);
const MUTED = hexToRgb(palette.muted);
const ACCENT = hexToRgb(palette.accent2);

const ARC_W = 360;
const ARC_H = 56;
const COL_W = 72;

const pad2 = n => String(n).padStart(2, '0');

const formatCountdown = ms => {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
};

const minutesNow = () => {
    // debug animasi siang: ags -r "globalThis.__prayerNowMinutes = 720"
    const override = globalThis.__prayerNowMinutes;
    if (typeof override === 'number' && Number.isFinite(override)) return override;
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
};

// Busur langit: Subuh di kiri, Magrib di kanan, matahari bergerak mengikuti
// waktu sekarang. Isya ditandai di bawah ujung kanan (setelah terbenam).
const SkyArc = () => Widget.DrawingArea({
    className: 'dyn-island-prayer-arc',
    setup: self => self.set_size_request(ARC_W, ARC_H),
    drawFn: (self, cr, width, height) => {
        const state = prayer.value;
        if (!state?.times?.length) return;

        const times = state.times;
        const fajr = times[0].minutes;
        const maghrib = times[3].minutes;
        const span = Math.max(1, maghrib - fajr);
        const now = minutesNow();
        const t = (now - fajr) / span;
        const next = nextPrayer(state);
        const nextKey = next?.key ?? '';

        const base = height - 5;
        const peak = 7;
        const point = q => {
            const clamped = Math.max(0, Math.min(1, q));
            return [
                clamped * width,
                base - Math.sin(Math.PI * clamped) * (base - peak),
            ];
        };
        const strokeArc = (from, to, steps = 40) => {
            cr.moveTo(...point(from));
            for (let i = 1; i <= steps; i++)
                cr.lineTo(...point(from + (to - from) * (i / steps)));
        };

        cr.setLineWidth(1.2);
        cr.setSourceRGBA(MUTED[0], MUTED[1], MUTED[2], 0.22);
        strokeArc(0, 1);
        cr.stroke();

        if (t > 0) {
            cr.setLineWidth(1.6);
            cr.setSourceRGBA(ACCENT[0], ACCENT[1], ACCENT[2], 0.62);
            strokeArc(0, Math.min(1, t));
            cr.stroke();
        }

        // marker Subuh/Dzuhur/Ashar/Magrib di busur
        for (let i = 0; i < 4; i++) {
            const key = times[i].key;
            const [x, y] = point((times[i].minutes - fajr) / span);
            const active = nextKey === key;

            if (active) {
                cr.setSourceRGBA(ACCENT[0], ACCENT[1], ACCENT[2], 0.28);
                cr.arc(x, y, 6, 0, Math.PI * 2);
                cr.fill();
            }
            cr.setSourceRGBA(
                active ? FG[0] : MUTED[0],
                active ? FG[1] : MUTED[1],
                active ? FG[2] : MUTED[2],
                active ? 0.95 : 0.55,
            );
            cr.arc(x, y, active ? 2.6 : 2, 0, Math.PI * 2);
            cr.fill();
        }

        // Isya: setelah Magrib, jadi ditandai di bawah ujung kanan busur
        const ishaActive = nextKey === 'isha';
        const ishaX = width - 1;
        const ishaY = base + 10;
        cr.setLineWidth(1);
        cr.setSourceRGBA(MUTED[0], MUTED[1], MUTED[2], 0.22);
        cr.moveTo(width, base);
        cr.lineTo(ishaX, ishaY - 3);
        cr.stroke();
        if (ishaActive) {
            cr.setSourceRGBA(ACCENT[0], ACCENT[1], ACCENT[2], 0.28);
            cr.arc(ishaX, ishaY, 6, 0, Math.PI * 2);
            cr.fill();
        }
        cr.setSourceRGBA(
            ishaActive ? FG[0] : MUTED[0],
            ishaActive ? FG[1] : MUTED[1],
            ishaActive ? FG[2] : MUTED[2],
            ishaActive ? 0.95 : 0.55,
        );
        cr.arc(ishaX, ishaY, ishaActive ? 2.6 : 2, 0, Math.PI * 2);
        cr.fill();

        // matahari hanya terlihat saat sudah terbit dan belum terbenam
        if (t >= 0 && t <= 1) {
            const [x, y] = point(t);
            cr.setSourceRGBA(ACCENT[0], ACCENT[1], ACCENT[2], 0.14);
            cr.arc(x, y, 8, 0, Math.PI * 2);
            cr.fill();
            cr.setSourceRGBA(ACCENT[0], ACCENT[1], ACCENT[2], 0.95);
            cr.arc(x, y, 3.2, 0, Math.PI * 2);
            cr.fill();
        }
    },
});

export default () => {
    const city = Widget.Label({
        className: 'dyn-island-prayer-city',
        xalign: 0,
        truncate: 'end',
        maxWidthChars: 24,
    });
    const nextName = Widget.Label({ className: 'dyn-island-prayer-next', xalign: 0 });
    const countdown = Widget.Label({ className: 'dyn-island-prayer-count', xalign: 0 });

    const arc = SkyArc();
    const timesBox = Widget.Box({ className: 'dyn-island-prayer-times', spacing: 0 });
    const columns = new Map();
    let builtDate = '';

    const buildTimes = state => {
        columns.clear();
        timesBox.children = state.times.map(time => {
            const box = Widget.Box({
                className: 'dyn-island-prayer-time',
                vertical: true,
                widthRequest: COL_W,
                children: [
                    Widget.Label({
                        className: 'dyn-island-prayer-time-name',
                        label: time.name,
                        xalign: 0.5,
                    }),
                    Widget.Label({
                        className: 'dyn-island-prayer-time-value',
                        label: time.label,
                        xalign: 0.5,
                    }),
                ],
            });
            columns.set(time.key, box);
            return box;
        });
        city.label = `${state.city} · ${state.method}`;
    };

    const tick = self => {
        const state = prayer.value;
        if (!state?.times?.length) return;
        if (state.date !== builtDate) {
            builtDate = state.date;
            buildTimes(state);
        }

        const next = nextPrayer(state) ?? state.next;
        if (next) {
            nextName.label = next.tomorrow ? `Besok ${next.name}` : next.name;
            countdown.label = formatCountdown(next.timestamp - Date.now());
            for (const [key, box] of columns)
                box.toggleClassName('on', key === next.key);
        }
        arc.queue_draw();
    };

    const info = Widget.Box({
        className: 'dyn-island-prayer-info',
        vertical: true,
        spacing: 0,
        widthRequest: 150,
        children: [city, nextName, countdown],
    });

    const right = Widget.Box({
        className: 'dyn-island-prayer-right',
        vertical: true,
        spacing: 2,
        children: [arc, timesBox],
    });

    return Widget.Box({
        className: 'dyn-island-prayer',
        spacing: 14,
        halign: Gtk.Align.CENTER,
        valign: Gtk.Align.CENTER,
        children: [info, right],
        setup: self => {
            tick(self);
            self.hook(prayer, () => tick(self));
            Utils.interval(1000, () => tick(self), self);
        },
    });
};
