import Cairo from 'gi://cairo?version=1.0';
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import Gtk from 'gi://Gtk?version=3.0';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';
import { prayer } from './prayer.js';
import { nextPrayer } from './prayer-calc.js';
import { palette, hexToRgb } from '../theme.js';
import { tabular } from './type.js';

const FG = hexToRgb(palette.fg);
const MUTED = hexToRgb(palette.muted);
const ACCENT = hexToRgb(palette.accent2);

const CHART_W = 360;
const CHART_H = 82;
const BASE_Y = 38;
const LABEL_Y = 48;
const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTH_NAMES = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli',
    'Agustus', 'September', 'Oktober', 'November', 'Desember'];

const pad2 = n => String(n).padStart(2, '0');

const formatCountdown = ms => {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
};

// Override waktu untuk pengujian/desain: `__prayerNowMinutes = 1200` (20:00).
// Dipakai juga oleh nextPrayer supaya label "Besok Subuh" dan posisi matahari
// tetap konsisten saat menguji state malam.
const overrideDate = () => {
    const date = new Date();
    const override = globalThis.__prayerNowMinutes;
    if (typeof override === 'number' && Number.isFinite(override)) {
        const minutes = ((override % 1440) + 1440) % 1440;
        date.setHours(Math.floor(minutes / 60), Math.floor(minutes % 60),
            Math.floor((minutes % 1) * 60), 0);
    }
    return date;
};

const minutesOf = date => date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;

const dateLabel = date =>
    `${DAY_NAMES[date.getDay()]}, ${date.getDate()} ${MONTH_NAMES[date.getMonth()]}`;

const makeLayout = (cr, text, size, { bold = false, tabular: tabularText = false } = {}) => {
    const layout = PangoCairo.create_layout(cr);
    layout.set_font_description(Pango.FontDescription.from_string(
        `${bold ? 'Ubuntu Bold' : 'Ubuntu'} ${size}`));
    layout.set_text(String(text), -1);
    if (tabularText) {
        const attrs = Pango.AttrList.new();
        attrs.insert(Pango.attr_font_features_new('tnum 1'));
        layout.set_attributes(attrs);
    }
    return layout;
};

const layoutWidth = layout => layout.get_pixel_size()[0];

const paint = (cr, layout, x, y, rgb, alpha) => {
    cr.setSourceRGBA(rgb[0], rgb[1], rgb[2], alpha);
    cr.moveTo(x, y);
    PangoCairo.show_layout(cr, layout);
};

// Timeline 24 jam: label waktu berada di posisi jam sebenarnya, bukan dibagi
// rata. Busur matahari hanya digambar dari terbit sampai terbenam sehingga
// Dzuhur/Ashar/Maghrib jatuh tepat di bawah titik yang sesuai; Subuh/Isya
// berada di luar busur (sebelum terbit / sesudah terbenam).
const SkyChart = () => {
    const area = Widget.DrawingArea({
        className: 'dyn-island-prayer-chart',
        setup: self => self.set_size_request(CHART_W, CHART_H),
        drawFn: (self, cr, width, height) => {
            const state = prayer.value;
            if (!state?.times?.length) return;

            const nowDate = overrideDate();
            const nowM = minutesOf(nowDate);
            const next = nextPrayer(state, nowDate);
            const times = state.times.map(time => ({ ...time }));
            if (next?.tomorrow) {
                const fajr = times.find(time => time.key === 'fajr');
                if (fajr) {
                    fajr.minutes = next.minutes;
                    fajr.label = next.label;
                    fajr.tomorrow = true;
                }
            }

            const sunrise = Number.isFinite(state.sunrise)
                ? state.sunrise
                : times[0].minutes + 80;
            const maghrib = times.find(time => time.key === 'maghrib')?.minutes
                ?? times[3].minutes;
            const xFor = minutes => Math.max(0, Math.min(width, (minutes / 1440) * width));
            const base = BASE_Y;
            const dayStart = xFor(sunrise);
            const dayEnd = xFor(maghrib);

            cr.setLineWidth(1);
            cr.setSourceRGBA(MUTED[0], MUTED[1], MUTED[2], 0.16);
            cr.moveTo(0, base);
            cr.lineTo(width, base);
            cr.stroke();

            // pita siang: terang tipis dari terbit sampai terbenam
            cr.setLineWidth(3);
            cr.setSourceRGBA(ACCENT[0], ACCENT[1], ACCENT[2], 0.10);
            cr.moveTo(dayStart, base);
            cr.lineTo(dayEnd, base);
            cr.stroke();

            const point = q => [
                dayStart + q * (dayEnd - dayStart),
                base - Math.sin(Math.PI * q) * (base - 8),
            ];
            const strokeArc = (from, to, steps = 44) => {
                cr.moveTo(...point(from));
                for (let i = 1; i <= steps; i++)
                    cr.lineTo(...point(from + (to - from) * (i / steps)));
            };

            cr.setLineWidth(1.2);
            cr.setSourceRGBA(MUTED[0], MUTED[1], MUTED[2], 0.24);
            strokeArc(0, 1);
            cr.stroke();

            const isDay = nowM >= sunrise && nowM <= maghrib;
            const dayProgress = isDay
                ? Math.max(0, Math.min(1, (nowM - sunrise) / Math.max(1, maghrib - sunrise)))
                : 0;
            if (isDay && dayProgress > 0) {
                cr.setLineWidth(1.6);
                cr.setSourceRGBA(ACCENT[0], ACCENT[1], ACCENT[2], 0.62);
                strokeArc(0, dayProgress);
                cr.stroke();
            }

            const nowX = xFor(nowM);
            cr.setLineWidth(1);
            cr.setSourceRGBA(MUTED[0], MUTED[1], MUTED[2], 0.24);
            cr.moveTo(nowX, 6);
            cr.lineTo(nowX, base + 3);
            cr.stroke();

            if (isDay) {
                const [x, y] = point(dayProgress);
                cr.setSourceRGBA(ACCENT[0], ACCENT[1], ACCENT[2], 0.14);
                cr.arc(x, y, 8, 0, Math.PI * 2);
                cr.fill();
                cr.setSourceRGBA(ACCENT[0], ACCENT[1], ACCENT[2], 0.95);
                cr.arc(x, y, 3.2, 0, Math.PI * 2);
                cr.fill();
            } else {
                // bulan: posisi sekarang di timeline malam
                const y = base - 12;
                cr.setSourceRGBA(0.78, 0.84, 1.0, 0.12);
                cr.arc(nowX, y, 9, 0, Math.PI * 2);
                cr.fill();
                cr.setFillRule(Cairo.FillRule.EVEN_ODD);
                cr.newSubPath();
                cr.arc(nowX, y, 4.6, 0, Math.PI * 2);
                cr.newSubPath();
                cr.arc(nowX + 2.1, y - 1.3, 3.9, 0, Math.PI * 2);
                cr.setSourceRGBA(0.86, 0.90, 1.0, 0.95);
                cr.fill();
                cr.setFillRule(Cairo.FillRule.WINDING);
            }

            const nextKey = next?.key ?? null;
            const items = times.map(time => {
                const isNext = time.key === nextKey;
                const isPast = !time.tomorrow && time.minutes < nowM && !isNext;
                const name = time.key === 'fajr' && time.tomorrow ? 'Subuh besok' : time.name;
                const nameLayout = makeLayout(cr, name, 9.5, { bold: isNext });
                const timeLayout = makeLayout(cr, time.label, 11, {
                    bold: isNext,
                    tabular: true,
                });
                return {
                    time,
                    isNext,
                    isPast,
                    nameLayout,
                    timeLayout,
                    nameWidth: layoutWidth(nameLayout),
                    timeWidth: layoutWidth(timeLayout),
                    x: xFor(time.minutes),
                };
            });
            items.sort((a, b) => a.x - b.x);

            // Cegah label Magrib/Isya saling menimpa: geser label ke kanan,
            // lalu sambungkan dengan garis tipis ke tick waktu aslinya.
            let cursor = 0;
            const gap = 6;
            for (const item of items) {
                const itemWidth = Math.max(item.nameWidth, item.timeWidth);
                let center = item.x;
                if (center - itemWidth / 2 < cursor) center = cursor + itemWidth / 2;
                center = Math.max(itemWidth / 2 + 2,
                    Math.min(width - itemWidth / 2 - 2, center));
                item.labelWidth = itemWidth;
                item.center = center;
                cursor = center + itemWidth / 2 + gap;
            }
            const overflow = cursor - gap - (width - 2);
            if (overflow > 0) {
                for (const item of items)
                    item.center = Math.max(item.labelWidth / 2 + 2, item.center - overflow);
            }

            for (const item of items) {
                const color = item.isNext ? ACCENT : item.isPast ? MUTED : FG;
                const alpha = item.isNext ? 1 : item.isPast ? 0.62 : 0.82;

                cr.setLineWidth(item.isNext ? 2 : 1);
                cr.setSourceRGBA(color[0], color[1], color[2], item.isNext ? 1 : 0.34);
                cr.moveTo(item.x, base + 2);
                cr.lineTo(item.x, base + 6);
                cr.stroke();

                if (Math.abs(item.center - item.x) > 1.5) {
                    cr.setLineWidth(1);
                    cr.setSourceRGBA(MUTED[0], MUTED[1], MUTED[2], 0.22);
                    cr.moveTo(item.x, base + 6);
                    cr.lineTo(item.center, LABEL_Y - 3);
                    cr.stroke();
                }

                paint(cr, item.nameLayout,
                    item.center - item.nameWidth / 2, LABEL_Y, color, alpha);
                paint(cr, item.timeLayout,
                    item.center - item.timeWidth / 2, LABEL_Y + 12, color, alpha);
            }
        },
    });
    return area;
};

export default () => {
    const date = Widget.Label({ className: 'dyn-island-prayer-date', xalign: 0 });
    const nextName = Widget.Label({
        className: 'dyn-island-prayer-next',
        xalign: 0,
        truncate: 'end',
        maxWidthChars: 18,
    });
    const countdown = tabular(Widget.Label({
        className: 'dyn-island-prayer-count',
        xalign: 0,
    }));
    const city = Widget.Label({
        className: 'dyn-island-prayer-city',
        xalign: 0,
        truncate: 'end',
        maxWidthChars: 26,
    });

    const info = Widget.Box({
        className: 'dyn-island-prayer-info',
        vertical: true,
        spacing: 0,
        widthRequest: 150,
        valign: Gtk.Align.CENTER,
        children: [date, nextName, countdown, city],
    });

    const chart = SkyChart();

    const tick = self => {
        const now = overrideDate();
        date.label = dateLabel(now);
        const state = prayer.value;
        if (!state?.times?.length) {
            nextName.label = '—';
            countdown.label = '—';
            city.label = state?.error || 'Lokasi belum siap';
            chart.queue_draw();
            return;
        }

        city.label = `${state.city} · ${state.method}`;
        city.tooltipText = city.label;
        const next = nextPrayer(state, now);
        if (next) {
            nextName.label = next.tomorrow ? `Besok ${next.name}` : next.name;
            nextName.tooltipText = nextName.label;
            countdown.label = formatCountdown(next.timestamp - now.getTime());
        } else {
            nextName.label = '—';
            countdown.label = '—';
        }
        chart.queue_draw();
    };

    return Widget.Box({
        className: 'dyn-island-prayer',
        spacing: 14,
        halign: Gtk.Align.CENTER,
        valign: Gtk.Align.CENTER,
        children: [info, chart],
        setup: self => {
            tick(self);
            self.hook(prayer, () => tick(self));
            Utils.interval(1000, () => tick(self), self);
        },
    });
};
