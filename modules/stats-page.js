import Gtk from 'gi://Gtk?version=3.0';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import { palette, hexToRgb } from '../theme.js';
import { roundedRect } from '../draw.js';
import { stats } from './sysstats.js';
import { tabular } from './type.js';

// Halaman statistik v2: tiga kartu permukaan (bukan teks mengambang) dengan
// label kecil, angka besar, bar, dan satu baris detail per kartu. Semua info
// penting ada di dalam kartunya, jadi tidak ada lagi dua baris footer panjang.

const FG = hexToRgb(palette.fg);
const ACCENT = hexToRgb(palette.accent2);
const DANGER = hexToRgb(palette.danger ?? palette.accent);
const WARN_AT = 80;

const sparkline = width => {
    let values = [];
    let warn = false;

    return Widget.DrawingArea({
        className: 'dyn-island-stats-sparkline',
        setup: self => {
            self.set_size_request(width, 13);
            self.setValues = (next, isWarn) => {
                values = (next ?? []).slice(-15);
                warn = isWarn;
                self.queue_draw();
            };
        },
        drawFn: (self, cr, w, height) => {
            cr.setLineWidth(1);
            cr.setSourceRGBA(FG[0], FG[1], FG[2], 0.12);
            cr.moveTo(0, height - 1);
            cr.lineTo(w, height - 1);
            cr.stroke();
            if (values.length < 2) return;

            const color = warn ? DANGER : ACCENT;
            const step = w / Math.max(1, values.length - 1);
            const point = (value, index) => [
                index * step,
                height - 2 - Math.max(0, Math.min(1, value / 100)) * (height - 4),
            ];
            cr.setLineWidth(1.4);
            cr.setSourceRGBA(color[0], color[1], color[2], 0.9);
            const [x0, y0] = point(values[0], 0);
            cr.moveTo(x0, y0);
            for (let i = 1; i < values.length; i++)
                cr.lineTo(...point(values[i], i));
            cr.stroke();

            const [x, y] = point(values[values.length - 1], values.length - 1);
            cr.setSourceRGBA(color[0], color[1], color[2], 1);
            cr.arc(x, y, 1.8, 0, Math.PI * 2);
            cr.fill();
        },
    });
};

const card = (title, width) => {
    const value = tabular(Widget.Label({ className: 'dyn-island-stats-value', xalign: 0 }));
    const detail = Widget.Label({ className: 'dyn-island-stats-detail', xalign: 0 });
    const spark = sparkline(width);

    const widget = Widget.Box({
        className: 'dyn-island-stats-card',
        vertical: true,
        spacing: 3,
        hexpand: true,
        children: [
            Widget.Label({ className: 'dyn-island-stats-label', label: title, xalign: 0 }),
            value,
            spark,
            detail,
        ],
    });

    return { widget, value, detail, spark };
};

const gb = mb => (Number(mb) || 0) / 1024;

export default () => {
    const cpu = card('CPU', 100);
    const ram = card('RAM', 100);
    const temp = card('SUHU', 100);
    const history = { cpu: [], ram: [], temp: [] };
    const push = (key, value) => {
        const list = history[key];
        const next = Math.max(0, Math.min(100, Number(value) || 0));
        if (!list.length) {
            for (let i = 0; i < 15; i++) list.push(next);
            return;
        }
        list.push(next);
        if (list.length > 15) list.shift();
    };
    const diskLabel = Widget.Label({ className: 'dyn-island-stats-footer', xalign: 0 });
    const swapLabel = Widget.Label({ className: 'dyn-island-stats-footer', xalign: 0 });

    const footer = Widget.Box({
        className: 'dyn-island-stats-footer-row',
        spacing: 12,
        halign: Gtk.Align.CENTER,
        children: [diskLabel, swapLabel],
    });

    const cards = Widget.Box({
        className: 'dyn-island-stats',
        spacing: 8,
        valign: Gtk.Align.CENTER,
        children: [cpu.widget, ram.widget, temp.widget],
    });

    const sync = () => {
        const value = stats.value;
        if (!value) {
            for (const item of [cpu, ram, temp]) {
                item.value.label = '—';
                item.detail.label = '';
            }
            diskLabel.label = '';
            swapLabel.label = '';
            return;
        }

        const cpuPercent = Number(value.cpu) || 0;
        const mem = value.mem ?? {};
        const swap = value.swap ?? {};
        const degrees = Number(value.temp);
        const load = Number(value.load?.[0]) || 0;

        cpu.value.label = `${cpuPercent.toFixed(cpuPercent < 10 ? 1 : 0)}%`;
        push('cpu', cpuPercent);
        cpu.spark.setValues(history.cpu, cpuPercent >= WARN_AT);
        cpu.detail.label = `load ${load.toFixed(2)}`;

        const memPercent = Number(mem.pct) || 0;
        ram.value.label = `${memPercent}%`;
        push('ram', memPercent);
        ram.spark.setValues(history.ram, memPercent >= WARN_AT);
        ram.detail.label = `${gb(mem.used).toFixed(1)} / ${gb(mem.total).toFixed(1)} GB`;

        temp.value.label = Number.isFinite(degrees) ? `${Math.round(degrees)}°` : '—';
        push('temp', Number.isFinite(degrees) ? degrees : 0);
        temp.spark.setValues(history.temp, degrees >= 85);
        temp.detail.label = !Number.isFinite(degrees)
            ? ''
            : degrees >= 85 ? 'panas' : degrees >= 70 ? 'hangat' : 'normal';

        const disk = value.disk ?? {};
        const diskPct = disk.root?.pct ?? 0;
        diskLabel.label = `\uf0a0 disk ${diskPct}%`;
        diskLabel.tooltipText = `Disk root ${diskPct}% terpakai`;
        const swapUsed = Number(swap.used) || 0;
        swapLabel.label = swapUsed > 0 ? `\uf0aa swap ${gb(swapUsed).toFixed(1)} GB` : '';
        swapLabel.tooltipText = `Swap ${gb(swapUsed).toFixed(1)} GB terpakai`;
        swapLabel.visible = swapUsed > 0;
    };

    return Widget.Box({
        className: 'dyn-island-stats-root',
        vertical: true,
        spacing: 4,
        halign: Gtk.Align.CENTER,
        valign: Gtk.Align.CENTER,
        children: [cards, footer],
        setup: self => {
            sync();
            self.hook(stats, sync);
        },
    });
};
