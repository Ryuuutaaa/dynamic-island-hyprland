import Gtk from 'gi://Gtk?version=3.0';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import { weather, glyphFor, labelFor, refreshWeather } from './weather.js';
import { tabular } from './type.js';

// Cuaca v3: hero di kiri (ikon + suhu sebaris, kondisi di bawahnya) dan tiga
// kartu hari di kanan. Suhu maks/min dibedakan bobot & warna, bukan ditulis
// "31°/24°" yang sulit dipindai.

const DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const dayName = (iso, index) => {
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

const hourOf = iso => {
    const date = new Date(iso);
    return Number.isNaN(date.getTime())
        ? ''
        : `${String(date.getHours()).padStart(2, '0')}:00`;
};

const hourCell = hour => Widget.Box({
    className: 'dyn-island-weather-hour',
    spacing: 4,
    halign: Gtk.Align.CENTER,
    valign: Gtk.Align.CENTER,
    children: [
        Widget.Label({
            className: 'dyn-island-weather-hour-time',
            label: hourOf(hour.time),
        }),
        Widget.Label({
            className: 'dyn-island-weather-hour-glyph',
            label: glyphFor(hour.code, hour.isDay !== false),
        }),
        tabular(Widget.Label({
            className: 'dyn-island-weather-hour-temp',
            label: `${hour.temp}°`,
        })),
    ],
});

const dayTile = value => Widget.Box({
    className: 'dyn-island-weather-tile',
    vertical: true,
    spacing: 2,
    children: [
        Widget.Label({ className: 'dyn-island-weather-tile-day', label: value.day }),
        Widget.Label({ className: 'dyn-island-weather-tile-glyph', label: value.glyph }),
        Widget.Box({
            className: 'dyn-island-weather-tile-temps',
            spacing: 3,
            halign: Gtk.Align.CENTER,
            children: [
                tabular(Widget.Label({ className: 'dyn-island-weather-tile-max', label: `${value.max}°` })),
                tabular(Widget.Label({ className: 'dyn-island-weather-tile-min', label: `${value.min}°` })),
            ],
        }),
    ],
});

export default () => {
    const glyph = Widget.Label({ className: 'dyn-island-weather-glyph' });
    const temp = tabular(Widget.Label({ className: 'dyn-island-weather-temp' }));
    const condition = Widget.Label({ className: 'dyn-island-weather-condition', xalign: 0 });
    const place = Widget.Label({ className: 'dyn-island-weather-place', xalign: 0 });
    const days = Widget.Box({ className: 'dyn-island-weather-days', spacing: 6 });
    const hours = Widget.Box({
        className: 'dyn-island-weather-hours',
        spacing: 6,
        halign: Gtk.Align.CENTER,
        visible: false,
    });
    const retry = Widget.Button({
        className: 'dyn-island-chip dyn-island-weather-retry',
        child: Widget.Label({ className: 'dyn-island-chip-label', label: 'Muat ulang' }),
        onClicked: () => { refreshWeather(); },
    });
    retry.set_no_show_all(true);

    const sync = () => {
        const value = weather.value;
        const has = value.ok && value.temp !== null;
        glyph.label = has ? glyphFor(value.code, value.isDay) : '·';
        temp.label = has ? `${value.temp}°` : '—';
        condition.label = has
            ? `${labelFor(value.code)} · terasa ${value.feels}°`
            : (value.error ? 'Tidak ada data' : 'Memuat…');
        place.label = [value.city, clockOf(value.updatedAt)].filter(Boolean).join('  ·  ');

        const showRetry = !has && !!value.error;
        retry.visible = showRetry;
        if (showRetry) {
            retry.show();
            retry.child.show();
        }

        days.children = (value.daily || []).slice(1, 4).map(day => dayTile({
            day: dayName(day.date, value.daily.indexOf(day)),
            glyph: glyphFor(day.code),
            max: day.max,
            min: day.min,
        }));

        const now = Date.now();
        const upcoming = (value.hourly || [])
            .filter(hour => {
                const stamp = new Date(hour.time).getTime();
                return Number.isFinite(stamp) && stamp > now;
            })
            .slice(0, 3);
        hours.children = upcoming.map(hourCell);
        hours.visible = has && upcoming.length > 0;
    };

    const main = Widget.Box({
        className: 'dyn-island-weather-main',
        spacing: 14,
        valign: Gtk.Align.CENTER,
        children: [
            Widget.Box({
                className: 'dyn-island-weather-now',
                vertical: true,
                spacing: 2,
                valign: Gtk.Align.CENTER,
                widthRequest: 168,
                children: [
                    Widget.Box({
                        className: 'dyn-island-weather-hero',
                        spacing: 6,
                        children: [glyph, temp],
                    }),
                    condition,
                    place,
                ],
            }),
            Widget.Box({ className: 'dyn-island-weather-spacer', hexpand: true }),
            days,
            retry,
        ],
    });

    return Widget.Box({
        className: 'dyn-island-weather',
        vertical: true,
        spacing: 3,
        valign: Gtk.Align.CENTER,
        children: [main, hours],
        setup: self => {
            sync();
            self.hook(weather, sync);
        },
    });
};
