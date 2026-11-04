import Gtk from 'gi://Gtk?version=3.0';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import { weather, glyphFor, labelFor } from './weather.js';

// Halaman cuaca: ringkas dan tenang — kondisi sekarang di kiri, 3 hari ke depan
// di kanan, plus baris kecil kelembapan/angin/waktu update.

const DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const dayName = (iso, index) => {
    if (index === 0) return 'Hari ini';
    if (index === 1) return 'Besok';
    const [year, month, day] = String(iso).split('-').map(Number);
    const date = new Date(year, (month ?? 1) - 1, day ?? 1);
    return Number.isNaN(date.getTime()) ? '' : DAYS[date.getDay()];
};

const clockOf = epoch => {
    if (!epoch) return '';
    const date = new Date(epoch);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

export default () => {
    const bigGlyph = Widget.Label({ className: 'dyn-island-weather-glyph' });
    const bigTemp = Widget.Label({ className: 'dyn-island-weather-temp' });
    const condition = Widget.Label({ className: 'dyn-island-weather-condition', xalign: 0 });
    const city = Widget.Label({ className: 'dyn-island-weather-city', xalign: 0 });
    const meta = Widget.Label({ className: 'dyn-island-weather-meta', xalign: 0 });

    const daysBox = Widget.Box({ vertical: true, spacing: 3 });

    const sync = () => {
        const value = weather.value;
        const has = value.ok && value.temp !== null;
        bigGlyph.label = has ? glyphFor(value.code, value.isDay) : '—';
        bigTemp.label = has ? `${value.temp}°` : '—';
        condition.label = has ? labelFor(value.code) : (value.error ? 'Tidak ada data' : 'Memuat…');
        city.label = value.city || '';
        meta.label = has
            ? `terasa ${value.feels}° · ${value.wind} km/j · ${value.humidity}%`
            : '';
        meta.visible = has;

        daysBox.children = (value.daily || []).slice(0, 3).map((day, index) => Widget.Box({
            className: 'dyn-island-weather-day',
            spacing: 6,
            children: [
                Widget.Label({
                    className: 'dyn-island-weather-dayname',
                    label: dayName(day.date, index),
                    xalign: 0,
                    widthRequest: 52,
                }),
                Widget.Label({ className: 'dyn-island-weather-dayglyph', label: glyphFor(day.code) }),
                Widget.Label({
                    className: 'dyn-island-weather-daytemp',
                    label: `${day.max}°/${day.min}°`,
                    xalign: 1,
                    hexpand: true,
                }),
            ],
        }));
    };

    return Widget.Box({
        className: 'dyn-island-weather',
        spacing: 14,
        valign: Gtk.Align.CENTER,
        children: [
            Widget.Box({
                className: 'dyn-island-weather-now',
                spacing: 10,
                valign: Gtk.Align.CENTER,
                children: [
                    bigGlyph,
                    Widget.Box({
                        vertical: true,
                        spacing: 0,
                        valign: Gtk.Align.CENTER,
                        children: [bigTemp, condition],
                    }),
                ],
            }),
            Widget.Box({
                vertical: true,
                spacing: 2,
                valign: Gtk.Align.CENTER,
                hexpand: true,
                children: [
                    Widget.Box({
                        spacing: 6,
                        children: [
                            city,
                            Widget.Label({ hexpand: true }),
                            Widget.Label({ className: 'dyn-island-weather-updated', label: clockOf(weather.value.updatedAt) }),
                        ],
                    }),
                    meta,
                    Widget.Box({ className: 'dyn-island-weather-spacer', vexpand: true }),
                    daysBox,
                ],
            }),
        ],
        setup: self => {
            sync();
            self.hook(weather, sync);
        },
    });
};
