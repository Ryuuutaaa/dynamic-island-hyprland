import Gtk from 'gi://Gtk?version=3.0';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import { palette, hexToRgb } from '../theme.js';
import { roundedRect } from '../draw.js';
import { stats } from './sysstats.js';

// Halaman statistik v2: tiga kartu permukaan (bukan teks mengambang) dengan
// label kecil, angka besar, bar, dan satu baris detail per kartu. Semua info
// penting ada di dalam kartunya, jadi tidak ada lagi dua baris footer panjang.

const FG = hexToRgb(palette.fg);
const ACCENT = hexToRgb(palette.accent2);
const DANGER = hexToRgb(palette.danger ?? palette.accent);
const WARN_AT = 80;

const gauge = width => {
    let fraction = 0;
    let warn = false;

    return Widget.DrawingArea({
        className: 'dyn-island-stats-bar',
        setup: self => {
            self.set_size_request(width, 6);
            self.setValue = (value, isWarn) => {
                const next = Math.max(0, Math.min(1, Number(value) || 0));
                if (next === fraction && isWarn === warn) return;
                fraction = next;
                warn = isWarn;
                self.queue_draw();
            };
        },
        drawFn: (self, cr, w, height) => {
            const barH = 6;
            const y = (height - barH) / 2;
            cr.setSourceRGBA(FG[0], FG[1], FG[2], 0.14);
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

const card = (title, width) => {
    const value = Widget.Label({ className: 'dyn-island-stats-value', xalign: 0 });
    const detail = Widget.Label({ className: 'dyn-island-stats-detail', xalign: 0 });
    const bar = gauge(width);

    const widget = Widget.Box({
        className: 'dyn-island-stats-card',
        vertical: true,
        spacing: 3,
        hexpand: true,
        children: [
            Widget.Label({ className: 'dyn-island-stats-label', label: title, xalign: 0 }),
            value,
            bar,
            detail,
        ],
    });

    return { widget, value, detail, bar };
};

const gb = mb => (Number(mb) || 0) / 1024;

export default () => {
    const cpu = card('CPU', 100);
    const ram = card('RAM', 100);
    const temp = card('SUHU', 100);

    const sync = () => {
        const value = stats.value;
        if (!value) {
            for (const item of [cpu, ram, temp]) {
                item.value.label = '—';
                item.detail.label = '';
            }
            return;
        }

        const cpuPercent = Number(value.cpu) || 0;
        const mem = value.mem ?? {};
        const swap = value.swap ?? {};
        const degrees = Number(value.temp);
        const load = Number(value.load?.[0]) || 0;

        cpu.value.label = `${cpuPercent.toFixed(cpuPercent < 10 ? 1 : 0)}%`;
        cpu.bar.setValue(cpuPercent / 100, cpuPercent >= WARN_AT);
        cpu.detail.label = `load ${load.toFixed(2)}`;

        const memPercent = Number(mem.pct) || 0;
        ram.value.label = `${memPercent}%`;
        ram.bar.setValue(memPercent / 100, memPercent >= WARN_AT);
        ram.detail.label = `${gb(mem.used).toFixed(1)} / ${gb(mem.total).toFixed(1)} GB`;
        if (Number(swap.used) > 0)
            ram.detail.label += ` · swap ${gb(swap.used).toFixed(1)}`;

        temp.value.label = Number.isFinite(degrees) ? `${Math.round(degrees)}°` : '—';
        temp.bar.setValue(Number.isFinite(degrees) ? Math.min(1, degrees / 100) : 0, degrees >= 85);
        const disk = value.disk ?? {};
        // detail kartu suhu harus berbicara soal suhu dulu; disk ikut sebagai
        // info sekunder supaya label kartu tidak menipu.
        const state = !Number.isFinite(degrees) ? '' : degrees >= 85 ? 'panas' : degrees >= 70 ? 'hangat' : 'normal';
        temp.detail.label = [state, `disk / ${disk.root?.pct ?? 0}%`].filter(Boolean).join(' · ');
    };

    return Widget.Box({
        className: 'dyn-island-stats',
        spacing: 8,
        valign: Gtk.Align.CENTER,
        children: [cpu.widget, ram.widget, temp.widget],
        setup: self => {
            sync();
            self.hook(stats, sync);
        },
    });
};
