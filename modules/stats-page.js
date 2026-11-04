import Gtk from 'gi://Gtk?version=3.0';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import { palette, hexToRgb } from '../theme.js';
import { roundedRect } from '../draw.js';
import { stats } from './sysstats.js';

// Halaman statistik: tiga metrik utama (CPU / RAM / suhu) dengan bar tipis,
// lalu dua baris ringkas untuk swap, load, uptime, dan disk. Semua angka
// berasal dari satu panggilan Rust (`hypr-status stats`).

const FG = hexToRgb(palette.fg);
const ACCENT = hexToRgb(palette.accent2);
const DANGER = hexToRgb(palette.danger ?? palette.accent);
const WARN_AT = 0.8;

const gauge = (width = 104) => {
    let fraction = 0;
    let warn = false;

    return Widget.DrawingArea({
        className: 'dyn-island-stats-bar',
        setup: self => {
            self.set_size_request(width, 5);
            self.setValue = (value, isWarn) => {
                const next = Math.max(0, Math.min(1, Number(value) || 0));
                if (next === fraction && isWarn === warn) return;
                fraction = next;
                warn = isWarn;
                self.queue_draw();
            };
        },
        drawFn: (self, cr, w, height) => {
            const barH = 5;
            const y = (height - barH) / 2;
            cr.setSourceRGBA(FG[0], FG[1], FG[2], 0.16);
            roundedRect(cr, 0, y, w, barH, barH / 2);
            cr.fill();
            if (fraction <= 0) return;
            const [r, g, b] = warn ? DANGER : ACCENT;
            cr.setSourceRGBA(r, g, b, 1);
            roundedRect(cr, 0, y, Math.max(barH, w * fraction), barH, barH / 2);
            cr.fill();
        },
    });
};

const metric = (title, width = 104) => {
    const value = Widget.Label({ className: 'dyn-island-stats-value', xalign: 0 });
    const bar = gauge(width);
    const widget = Widget.Box({
        className: 'dyn-island-stats-metric',
        vertical: true,
        spacing: 2,
        hexpand: true,
        children: [
            Widget.Label({ className: 'dyn-island-stats-label', label: title, xalign: 0 }),
            value,
            bar,
        ],
    });
    return { widget, value, bar };
};

export default () => {
    const cpu = metric('CPU');
    const ram = metric('RAM');
    const temp = metric('SUHU');

    const footA = Widget.Label({ className: 'dyn-island-stats-foot', xalign: 0 });
    const footB = Widget.Label({ className: 'dyn-island-stats-foot', xalign: 0 });

    const sync = () => {
        const value = stats.value;
        if (!value) {
            cpu.value.label = '—';
            ram.value.label = '—';
            temp.value.label = '—';
            footA.label = 'Memuat statistik…';
            footB.label = '';
            return;
        }

        const cpuPct = Number(value.cpu) || 0;
        const mem = value.mem ?? {};
        const swap = value.swap ?? {};
        const disk = value.disk ?? {};

        cpu.value.label = `${cpuPct.toFixed(cpuPct < 10 ? 1 : 0)}%`;
        cpu.bar.setValue(cpuPct / 100, cpuPct >= WARN_AT * 100);

        ram.value.label = `${mem.pct ?? 0}%`;
        ram.bar.setValue((mem.pct ?? 0) / 100, (mem.pct ?? 0) >= WARN_AT * 100);

        const degrees = Number(value.temp);
        temp.value.label = Number.isFinite(degrees) ? `${Math.round(degrees)}°` : '—';
        temp.bar.setValue(Number.isFinite(degrees) ? Math.min(1, degrees / 100) : 0, degrees >= 85);

        footA.label = [
            `${(mem.used / 1024).toFixed(1)} / ${(mem.total / 1024).toFixed(1)} GB`,
            `swap ${(swap.used / 1024).toFixed(1)} / ${(swap.total / 1024).toFixed(1)} GB`,
            `load ${(value.load?.[0] ?? 0).toFixed(2)}`,
        ].join('  ·  ');

        const minutes = Math.floor((value.uptime ?? 0) / 60);
        const uptime = minutes >= 60 ? `${Math.floor(minutes / 60)}j ${minutes % 60}m` : `${minutes}m`;
        footB.label = [
            `up ${uptime}`,
            `disk / ${disk.root?.pct ?? 0}%`,
            `/home ${disk.home?.pct ?? 0}%`,
        ].join('  ·  ');
    };

    return Widget.Box({
        className: 'dyn-island-stats',
        vertical: true,
        spacing: 5,
        valign: Gtk.Align.CENTER,
        children: [
            Widget.Box({
                className: 'dyn-island-stats-row',
                spacing: 14,
                children: [cpu.widget, ram.widget, temp.widget],
            }),
            footA,
            footB,
        ],
        setup: self => {
            sync();
            self.hook(stats, sync);
        },
    });
};
