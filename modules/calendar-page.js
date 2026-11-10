import Gtk from 'gi://Gtk?version=3.0';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';
import { calendar } from './calendar.js';
import { calendarNotes, isoDay } from './calendar-notes.js';
import { buildGrid, MONTHS } from './calendar-grid.js';

// Halaman kalender: grid bulan penuh (7 kolom x 6 baris). Klik hari membuka
// popup editor; semua pengeditan catatan ada di popup karena window island
// tidak menerima keyboard (keymode: none).

const eventDays = () => {
    const days = new Set();
    for (const event of calendar.value.events ?? [])
        days.add(isoDay(new Date(event.start)));
    return days;
};

const noteDays = () => new Set(Object.keys(calendarNotes.value));

export default () => {
    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth();

    const monthLabel = Widget.Label({
        className: 'dyn-island-cal-month-title',
        xalign: 0,
    });

    const navButton = (glyph, delta, tooltip) => Widget.Button({
        className: 'dyn-island-cal-nav',
        tooltipText: tooltip,
        child: Widget.Label({ className: 'dyn-island-cal-nav-icon', label: glyph }),
        onClicked: () => {
            const next = new Date(year, month + delta, 1);
            year = next.getFullYear();
            month = next.getMonth();
            render();
        },
    });
    const prevButton = navButton('\uf053', -1, 'Bulan sebelumnya');
    const nextButton = navButton('\uf054', 1, 'Bulan berikutnya');

    const todayButton = Widget.Button({
        className: 'dyn-island-cal-chip',
        child: Widget.Label({ className: 'dyn-island-cal-chip-label', label: 'Hari ini' }),
        onClicked: () => {
            const today = new Date();
            year = today.getFullYear();
            month = today.getMonth();
            render();
        },
    });

    const notesButton = Widget.Button({
        className: 'dyn-island-cal-chip is-primary',
        tooltipText: 'Buka catatan kalender',
        child: Widget.Label({ className: 'dyn-island-cal-chip-label', label: 'Catatan' }),
        onClicked: () => {
            const today = new Date();
            const target = year === today.getFullYear() && month === today.getMonth()
                ? today
                : new Date(year, month, 1);
            try { globalThis.calendarWindow?.open?.(target, true); } catch (_) { }
        },
    });

    const header = Widget.CenterBox({
        className: 'dyn-island-cal-month-head',
        startWidget: Widget.Box({
            spacing: 4,
            children: [monthLabel, prevButton, nextButton],
        }),
        endWidget: Widget.Box({
            spacing: 4,
            halign: Gtk.Align.END,
            children: [todayButton, notesButton],
        }),
    });

    const { box: grid, render: renderGrid } = buildGrid({
        cellW: 65,
        cellH: 30,
        spacing: 2,
        prefix: 'dyn-island-cal',
        onSelect: (y, m, d) => {
            try { globalThis.calendarWindow?.open?.(new Date(y, m, d)); } catch (_) { }
        },
    });

    const render = () => {
        monthLabel.label = `${MONTHS[month]} ${year}`;
        renderGrid({
            year,
            month,
            selected: null,
            eventDays: eventDays(),
            noteDays: noteDays(),
        });
    };

    return Widget.Box({
        className: 'dyn-island-cal',
        vertical: true,
        spacing: 2,
        halign: Gtk.Align.FILL,
        valign: Gtk.Align.FILL,
        children: [header, grid],
        setup: self => {
            render();
            self.hook(calendar, render);
            self.hook(calendarNotes, render);
            // Ganti hari (tengah malam) tetap memperbarui highlight "hari ini".
            Utils.interval(60_000, render, self);
        },
    });
};
