import Cairo from 'gi://cairo?version=1.0';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=3.0';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';
import { prayer } from './prayer.js';
import { computeTimes, formatMinutes, nextPrayer } from './prayer-calc.js';
import { palette, hexToRgb } from '../theme.js';
import { tabular } from './type.js';

const MUTED = hexToRgb(palette.muted);
const ACCENT = hexToRgb(palette.accent2);

const ARC_W = 360;
const ARC_H = 56;
// Matahari asli bergerak ~0,008 px/detik (360 px per 12 jam) sehingga tidak
// terlihat. Saat halaman dibuka, matahari "meluncur" dari titik terbit ke
// posisi sekarang supaya rotasinya terlihat; setelah itu mengikuti waktu asli.
const SWEEP_MS = 1800;
const sweep = { active: false, start: 0, from: 0 };
// ease-in-out: matahari melaju rata di tengah, tidak "menyentak" di awal
const easeOut = p => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const nowMs = () => GLib.get_monotonic_time() / 1000;

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

// Malam = sebelum terbit atau sesudah Magrib.
const isNightNow = state => {
    if (!state?.times?.length) return false;
    const now = minutesNow();
    const sunrise = Number.isFinite(state.sunrise) ? state.sunrise : state.times[0].minutes + 80;
    return now < sunrise || now >= state.times[3].minutes;
};

// Subuh yang akan datang setelah Magrib adalah Subuh besok.
const fajrTomorrow = state => {
    try {
        const day = new Date();
        day.setDate(day.getDate() + 1);
        const next = computeTimes(day, state.location ?? {});
        return next.times?.[0]?.minutes ?? state.times[0].minutes + 1;
    } catch (_) {
        return state.times[0].minutes + 1;
    }
};

// Busur langit: matahari bergerak dari TERBIT sampai TERBENAM sehingga
// puncaknya jatuh tepat di Dzuhur (tengah antara sunrise dan maghrib).
// Busur sengaja tanpa titik per-waktu: label waktu di bawahnya rata 5 kolom,
// jadi marker di busur akan tampak tidak sejajar dan menyesatkan.
const SkyArc = () => Widget.DrawingArea({
    className: 'dyn-island-prayer-arc',
    setup: self => self.set_size_request(ARC_W, ARC_H),
    drawFn: (self, cr, width, height) => {
        const state = prayer.value;
        if (!state?.times?.length) return;

        const times = state.times;
        const fajr = times[0].minutes;
        const maghrib = times[3].minutes;
        // data lama bisa tanpa sunrise: perkirakan 80 menit setelah Subuh
        const sunrise = Number.isFinite(state.sunrise) ? state.sunrise : fajr + 80;
        const span = Math.max(1, maghrib - sunrise);
        const nowM = minutesNow();
        const dayT = (nowM - sunrise) / span;
        // Malam: Magrib -> Subuh besok, supaya ujung busur sama dengan label
        // terakhir di baris malam. Sebelum Subuh, rentangnya mulai dari Magrib
        // kemarin malam (digeser -24 jam).
        const evening = nowM >= maghrib;
        const nightStart = evening ? maghrib : maghrib - 1440;
        const nightEnd = evening ? fajrTomorrow(state) + 1440 : fajr;
        const nightT = (nowM - nightStart) / Math.max(1, nightEnd - nightStart);
        const isNight = dayT < 0 || dayT > 1;
        const realT = isNight ? nightT : dayT;
        let t = realT;
        if (sweep.active) {
            const p = Math.min(1, (nowMs() - sweep.start) / SWEEP_MS);
            if (p >= 1) {
                sweep.active = false;
            } else {
                const target = Math.max(0, Math.min(1, realT));
                t = sweep.from + (target - sweep.from) * easeOut(p);
            }
        }

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

        const progress = Math.max(0, Math.min(1, t));
        if (progress > 0) {
            cr.setLineWidth(1.6);
            cr.setSourceRGBA(ACCENT[0], ACCENT[1], ACCENT[2], 0.62);
            strokeArc(0, progress);
            cr.stroke();
        }

        // malam: bulan sabit bergerak dari Magrib ke terbit
        if (isNight && t >= 0 && t <= 1) {
            const [x, y] = point(t);
            cr.setSourceRGBA(0.78, 0.84, 1.0, 0.13);
            cr.arc(x, y, 9, 0, Math.PI * 2);
            cr.fill();
            // sabit: lingkaran luar dikurangi lingkaran offset (even-odd)
            cr.setFillRule(Cairo.FillRule.EVEN_ODD);
            cr.newSubPath();
            cr.arc(x, y, 4.6, 0, Math.PI * 2);
            cr.newSubPath();
            cr.arc(x + 2.1, y - 1.3, 3.9, 0, Math.PI * 2);
            cr.setSourceRGBA(0.86, 0.90, 1.0, 0.95);
            cr.fill();
            cr.setFillRule(Cairo.FillRule.WINDING);
        }

        // matahari: hanya saat sudah terbit dan belum terbenam
        if (!isNight && t >= 0 && t <= 1) {
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
    const countdown = tabular(Widget.Label({ className: 'dyn-island-prayer-count', xalign: 0 }));
    // Jam berjalan sebagai pembanding hitungan mundur di sebelah kiri.
    const clock = tabular(Widget.Label({ className: 'dyn-island-prayer-clock', xalign: 1 }));

    const arc = SkyArc();
    // Label waktu = baris rata 5 kolom. Posisi waktu asli tidak dipakai di sini:
    // jarak Subuh->Dzuhur 50% lebar sementara Ashar->Magrib 24%, sehingga label
    // jadi renggang-sempit dan Magrib/Isya bertumpuk. Busur tetap menunjukkan
    // posisi matahari yang sebenarnya.
    const timesBox = Widget.Box({
        className: 'dyn-island-prayer-times',
        spacing: 0,
        homogeneous: true,
    });
    timesBox.set_size_request(ARC_W, -1);
    const columns = new Map();
    let builtMode = '';

    const buildTimes = (state, night) => {
        columns.clear();

        let items = state.times;
        if (night) {
            // Baris malam hanya memuat waktu yang relevan: Magrib, Isya, Subuh
            // (Subuh besok bila sekarang sudah lewat Magrib).
            const nowM = minutesNow();
            const fajr = nowM >= state.times[3].minutes ? fajrTomorrow(state) : state.times[0].minutes;
            items = [
                state.times[3],
                state.times[4],
                { key: 'fajr', name: 'Subuh', minutes: fajr, label: formatMinutes(fajr) },
            ];
        }

        timesBox.children = items.map(time => {
            const box = Widget.Box({
                className: 'dyn-island-prayer-time',
                vertical: true,
                children: [
                    Widget.Label({
                        className: 'dyn-island-prayer-time-name',
                        label: time.name,
                        xalign: 0.5,
                    }),
                    tabular(Widget.Label({
                        className: 'dyn-island-prayer-time-value',
                        label: time.label,
                        xalign: 0.5,
                    })),
                ],
            });
            columns.set(time.key, box);
            return box;
        });
        city.label = `${state.city} · ${state.method}`;
    };

    const startSweep = () => {
        sweep.from = 0;
        sweep.start = nowMs();
        sweep.active = true;
    };

    const sweepFrame = () => {
        if (!sweep.active) return GLib.SOURCE_REMOVE;
        arc.queue_draw();
        return GLib.SOURCE_CONTINUE;
    };

    // Picu animasi tepat saat halaman prayer aktif. `globalThis.dynIsland`
    // belum ada saat modul ini dievaluasi, jadi hook dipasang dari tick()
    // (idempoten) begitu variabelnya tersedia.
    let hookedPage = null;
    const hookPage = () => {
        const page = globalThis.dynIsland?.page;
        if (!page || page === hookedPage) return;
        hookedPage = page;
        page.connect('changed', () => {
            if (page.value !== 'prayer') return;
            startSweep();
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 16, sweepFrame);
        });
    };

    const tick = self => {
        hookPage();

        const now = new Date();
        clock.label = `sekarang ${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;

        const state = prayer.value;
        if (!state?.times?.length) return;
        const night = isNightNow(state);
        const mode = `${state.date}:${night ? 'night' : 'day'}`;
        if (mode !== builtMode) {
            builtMode = mode;
            buildTimes(state, night);
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

    const clockRow = Widget.Box({
        className: 'dyn-island-prayer-clockrow',
        hexpand: true,
        halign: Gtk.Align.END,
        children: [clock],
    });

    const right = Widget.Box({
        className: 'dyn-island-prayer-right',
        vertical: true,
        spacing: 2,
        children: [clockRow, arc, timesBox],
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
