import Gtk from 'gi://Gtk?version=3.0';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import { weather, glyphFor, labelFor } from './weather.js';

// Halaman cuaca v2: satu blok fokus (ikon + suhu) di kiri, tiga kartu hari di
// kanan. Semua teks memakai skala yang sama dengan halaman lain (suhu 34px,
// label 10px), jadi tidak terasa seperti tabel kecil yang berdesakan.

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
    const glyph = Widget.Label({ className: 'dyn-island-weather-glyph' });
    const temp = Widget.Label({ className: 'dyn-island-weather-temp' });
    const condition = Widget.Label({ className: 'dyn-island-weather-condition', xalign: 0 });
    const meta = Widget.Label({ className: 'dyn-island-weather-meta', xalign: 0 });
    const place = Widget.Label({ className: 'dyn-island-weather-place', xalign: 1 });
    const days = Widget.Box({ className: 'dyn-island-weather-days', spacing: 6 });

    const sync = () => {
        const value = weather.value;
        const has = value.ok && value.temp !== null;
        glyph.label = has ? glyphFor(value.code, value.isDay) : '·';
        temp.label = has ? `${value.temp}°` : '—';
        condition.label = has
            ? labelFor(value.code)
            : (value.error ? 'Tidak ada data' : 'Memuat…');
        meta.label = has ? `terasa ${value.feels}°` : '';
        meta.visible = has;
        place.label = [value.city, clockOf(value.updatedAt)].filter(Boolean).join(' · ');

        days.children = (value.daily || []).slice(1, 4).map((day, index) => Widget.Box({
            className: 'dyn-island-weather-tile',
            vertical: true,
            spacing: 1,
            children: [
                Widget.Label({
                    className: 'dyn-island-weather-tile-day',
                    label: dayName(day.date, index + 1),
                    xalign: 0.5,
                }),
                Widget.Label({ className: 'dyn-island-weather-tile-glyph', label: glyphFor(day.code) }),
                Widget.Label({
                    className: 'dyn-island-weather-tile-temp',
                    label: `${day.max}° / ${day.min}°`,
                }),
            ],
        }));
    };

    return Widget.Box({
        className: 'dyn-island-weather',
        spacing: 16,
        valign: Gtk.Align.CENTER,
        children: [
            Widget.Box({
                className: 'dyn-island-weather-now',
                spacing: 8,
                valign: Gtk.Align.CENTER,
                widthRequest: 148,
                children: [
                    glyph,
                    Widget.Box({
                        className: 'dyn-island-weather-readout',
                        vertical: true,
                        spacing: 0,
                        valign: Gtk.Align.CENTER,
                        children: [temp, condition, meta],
                    }),
                ],
            }),
            Widget.Box({
                className: 'dyn-island-weather-right',
                vertical: true,
                spacing: 4,
                valign: Gtk.Align.CENTER,
                hexpand: true,
                children: [place, days],
            }),
        ],
        setup: self => {
            sync();
            self.hook(weather, sync);
        },
    });
};
