import Gtk from 'gi://Gtk?version=3.0';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import { weather, glyphFor, labelFor, refreshWeather } from './weather.js';
import { tabular } from './type.js';

// Cuaca v4: satu baris tiga kolom—kondisi sekarang, per jam, lalu tiga hari.
// Tidak ada kartu atau chip: semua kolom rata kiri dan memakai tinggi baris
// yang sama supaya mudah dipindai.

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
    spacing: 6,
    halign: Gtk.Align.START,
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
    spacing: 6,
    hexpand: true,
    valign: Gtk.Align.CENTER,
    children: [
        Widget.Label({
            className: 'dyn-island-weather-tile-day',
            label: value.day,
            xalign: 0,
            widthRequest: 36,
        }),
        Widget.Label({ className: 'dyn-island-weather-tile-glyph', label: value.glyph }),
        Widget.Box({ hexpand: true }),
        tabular(Widget.Label({ className: 'dyn-island-weather-tile-max', label: `${value.max}°` })),
        tabular(Widget.Label({ className: 'dyn-island-weather-tile-min', label: `${value.min}°` })),
    ],
});

export default () => {
    const glyph = Widget.Label({ className: 'dyn-island-weather-glyph' });
    const temp = tabular(Widget.Label({ className: 'dyn-island-weather-temp' }));
    const condition = Widget.Label({ className: 'dyn-island-weather-condition', xalign: 0 });
    const place = Widget.Label({ className: 'dyn-island-weather-place', xalign: 0 });
    const days = Widget.Box({
        className: 'dyn-island-weather-days',
        vertical: true,
        spacing: 4,
        widthRequest: 128,
    });
    const hours = Widget.Box({
        className: 'dyn-island-weather-hours',
        vertical: true,
        spacing: 4,
        widthRequest: 108,
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
        // forecast lama tidak boleh tetap tampil saat data gagal dimuat:
        // kombinasi tiles + "Muat ulang" melebarkan kartu dari 464 ke 478.
        days.visible = has && days.children.length > 0;

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
        spacing: 12,
        valign: Gtk.Align.CENTER,
        children: [
            Widget.Box({
                className: 'dyn-island-weather-now',
                vertical: true,
                spacing: 4,
                valign: Gtk.Align.CENTER,
                widthRequest: 156,
                children: [
                    Widget.Box({
                        className: 'dyn-island-weather-hero',
                        spacing: 8,
                        children: [glyph, temp],
                    }),
                    condition,
                    place,
                ],
            }),
            hours,
            days,
            retry,
        ],
    });

    return Widget.Box({
        className: 'dyn-island-weather',
        halign: Gtk.Align.CENTER,
        valign: Gtk.Align.CENTER,
        children: [main],
        setup: self => {
            sync();
            self.hook(weather, sync);
        },
    });
};
