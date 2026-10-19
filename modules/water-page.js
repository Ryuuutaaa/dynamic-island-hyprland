import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import Gtk from 'gi://Gtk?version=3.0';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import { palette, hexToRgb } from '../theme.js';
import { roundedRect } from '../draw.js';
import {
    water, total, percent, liters, lastHours, drink, setGoal, toggleReminder,
} from './water.js';

const FG = hexToRgb(palette.fg);
const ACCENT = hexToRgb(palette.accent2);

const CHART_W = 124;
const CHART_H = 62;
const CHART_BARS = 8;
const CHART_MIN_SCALE = 400;   // ml untuk tinggi penuh (skala minimum)
const GUTTER = 18;             // ruang label sumbu di kiri

// Skala mengikuti data, bukan angka mati: dulu selalu 400 ml sehingga 3 botol
// dalam satu jam langsung mentok dan target besar (sampai 5000 ml) tidak
// pernah terwakili. Label gridline ikut skala yang dipakai.
const scaleFor = values => {
    const peak = Math.max(0, ...values);
    return Math.max(CHART_MIN_SCALE, Math.ceil(peak / 200) * 200);
};

const scaleLabel = ml => (ml >= 1000 ? `${(ml / 1000).toFixed(ml % 1000 ? 1 : 0)}L` : `${ml}`);

const drawText = (cr, text, x, y, alpha, bold = false) => {
    const layout = PangoCairo.create_layout(cr);
    layout.set_font_description(
        Pango.FontDescription.from_string(bold ? 'Sans Bold 6.5' : 'Sans 6.5'));
    layout.set_text(String(text), -1);
    cr.setSourceRGBA(FG[0], FG[1], FG[2], alpha);
    cr.moveTo(x, y);
    PangoCairo.show_layout(cr, layout);
};

// Grafik per jam: 8 jam terakhir, gridline putus-putus 400/200/0 ml
const Chart = () => Widget.DrawingArea({
    className: 'dyn-island-water-chart',
    setup: self => {
        self.set_size_request(CHART_W, CHART_H);
        self.hook(water, () => self.queue_draw());
        // redraw tiap menit supaya jendela jam ikut bergeser
        const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 60000, () => {
            self.queue_draw();
            return GLib.SOURCE_CONTINUE;
        });
        self.connect('destroy', () => GLib.source_remove(id));
    },
    drawFn: (self, cr, width, height) => {
        const state = water.value;
        const hours = lastHours(CHART_BARS);
        const values = hours.map(key => state.log[key] || 0);
        const scaleMax = scaleFor(values);
        const plotW = width - GUTTER;
        const plotH = height - 12;      // sisakan baris label jam di bawah
        const baseline = plotH - 1;
        const slot = plotW / CHART_BARS;

        cr.setLineWidth(1);
        cr.setDash([1.5, 2.5], 0);
        for (const [fraction, ml] of [[1, scaleMax], [0.5, scaleMax / 2], [0, 0]]) {
            const y = baseline - fraction * (plotH - 4);
            cr.setSourceRGBA(FG[0], FG[1], FG[2], 0.14);
            cr.moveTo(GUTTER, y);
            cr.lineTo(width, y);
            cr.stroke();
            drawText(cr, scaleLabel(ml), 0, Math.max(6, y - 4), 0.45);
        }
        cr.setDash([], 0);

        const barW = Math.max(3, slot - 4);
        values.forEach((ml, i) => {
            const fraction = Math.max(0, Math.min(1, ml / scaleMax));
            const barH = ml > 0 ? Math.max(3, fraction * (plotH - 4)) : 2;
            const x = GUTTER + i * slot + (slot - barW) / 2;
            const y = baseline - barH;
            cr.setSourceRGBA(ACCENT[0], ACCENT[1], ACCENT[2], ml > 0 ? 0.95 : 0.22);
            roundedRect(cr, x, y, barW, barH, Math.min(2, barW / 2));
            cr.fill();
        });

        hours.forEach((key, i) => {
            const cx = GUTTER + i * slot + slot / 2;
            const current = i === hours.length - 1;
            // label digambar di dalam kotak (dulu height-8 -> turun 1px keluar)
            drawText(cr, key, cx - 4, height - 9, current ? 0.92 : 0.4, current);
        });
    },
});

const Progress = () => Widget.DrawingArea({
    className: 'dyn-island-water-progress',
    setup: self => {
        self.set_size_request(190, 5);
        self.hook(water, () => self.queue_draw());
    },
    drawFn: (self, cr, width, height) => {
        const state = water.value;
        const fraction = state.goal > 0 ? Math.min(1, total(state) / state.goal) : 0;
        cr.setSourceRGBA(FG[0], FG[1], FG[2], 0.16);
        roundedRect(cr, 0, 0, width, height, height / 2);
        cr.fill();
        if (fraction <= 0) return;
        cr.setSourceRGBA(ACCENT[0], ACCENT[1], ACCENT[2], 1);
        roundedRect(cr, 0, 0, Math.max(height, width * fraction), height, height / 2);
        cr.fill();
    },
});

// Switch pengingat: track + knob (Cairo)
const Switch = () => {
    const area = Widget.DrawingArea({
        setup: self => {
            self.set_size_request(30, 16);
            self.hook(water, () => self.queue_draw());
        },
        drawFn: (self, cr, width, height) => {
            const on = water.value.reminder;
            const radius = height / 2;
            if (on) cr.setSourceRGBA(ACCENT[0], ACCENT[1], ACCENT[2], 0.95);
            else cr.setSourceRGBA(1, 1, 1, 0.18);
            roundedRect(cr, 0, 0, width, height, radius);
            cr.fill();
            cr.setSourceRGB(1, 1, 1);
            cr.arc(on ? width - radius : radius, radius, radius - 2.5, 0, Math.PI * 2);
            cr.fill();
        },
    });
    return Widget.Button({
        className: 'dyn-island-switch',
        tooltipText: 'Pengingat minum tiap jam',
        child: area,
        onClicked: () => toggleReminder(),
    });
};

const pill = (label, onClicked, tooltip = null) => Widget.Button({
    className: 'dyn-island-pill',
    tooltipText: tooltip,
    child: Widget.Label({ className: 'dyn-island-pill-label', label }),
    onClicked,
});

export default () => {
    const volume = Widget.Label({ className: 'dyn-island-water-volume' });
    const goal = Widget.Label({ className: 'dyn-island-water-goal' });
    // status ringkas di kanan baris volume: "50% · 750 ml lagi"
    const status = Widget.Label({ className: 'dyn-island-water-status', xalign: 1 });

    const refresh = () => {
        const state = water.value;
        const used = total(state);
        const left = Math.max(0, state.goal - used);
        const pct = percent(state);
        volume.label = liters(used);
        goal.label = `/ ${liters(state.goal)} L`;
        status.label = left > 0
            ? `${pct}% · ${left} ml lagi`
            : `${pct}% · target tercapai`;
    };

    return Widget.Box({
        className: 'dyn-island-water',
        spacing: 16,
        halign: Gtk.Align.CENTER,
        valign: Gtk.Align.CENTER,
        children: [
            Widget.Box({
                className: 'dyn-island-water-meta',
                vertical: true,
                // 8px: bar progress dulu cuma 4px dari teks & pill di atas/bawahnya
                spacing: 8,
                valign: Gtk.Align.CENTER,
                children: [
                    Widget.Box({
                        spacing: 6,
                        children: [
                            Widget.Label({ className: 'dyn-island-water-title', label: 'Air' }),
                            Widget.Label({ className: 'dyn-island-water-sub', label: 'Pengingat' }),
                            Switch(),
                        ],
                    }),
                    // CenterBox: volume di kiri, status di kanan (Grid tidak ada
                    // di AGS, dan hexpand pada child Box AGS diabaikan)
                    Widget.CenterBox({
                        className: 'dyn-island-water-volrow',
                        startWidget: Widget.Box({ spacing: 6, children: [volume, goal] }),
                        endWidget: status,
                    }),
                    Progress(),
                    Widget.Box({
                        spacing: 6,
                        children: [
                            pill('\uf043 Minum', () => drink(), 'Tambah satu botol (250 ml)'),
                            // caption supaya jelas −/+ mengubah TARGET, bukan jumlah minum
                            Widget.Label({ className: 'dyn-island-water-goalcap', label: 'target' }),
                            pill('\u2212', () => setGoal(water.value.goal - 250), 'Kurangi target 250 ml'),
                            pill('+', () => setGoal(water.value.goal + 250), 'Tambah target 250 ml'),
                        ],
                    }),
                ],
            }),
            Chart(),
        ],
        setup: self => {
            refresh();
            self.hook(water, refresh);
        },
    });
};
