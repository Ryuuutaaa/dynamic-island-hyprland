import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import Gtk from 'gi://Gtk?version=3.0';
import { todo, doneCount, totalCount } from './todo.js';
import { water, total as waterTotal, liters } from './water.js';
import { weather, glyphFor as weatherGlyph, labelFor as weatherLabel } from './weather.js';
import { calendar } from './calendar.js';
import { calendarEvents } from './calendar-events.js';
import { formatClock, formatDate, formatDateShort, onMinute } from './timefmt.js';
import { pinPage, isStickyPage } from '../state.js';
import { tabular } from './type.js';

const DAY_MS = 86400000;
const pad2 = value => String(value).padStart(2, '0');
const openPage = name => pinPage(name, { sticky: isStickyPage(name) });

const nextEvent = (now = Date.now()) => {
    const candidates = [];
    for (const event of calendar.value.events ?? []) {
        const start = Number(event?.start);
        const end = Number(event?.end);
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= now) continue;
        candidates.push({
            start,
            allDay: !!event.allDay,
            title: String(event.title ?? 'Acara'),
        });
    }

    const localEpoch = (day, clock) => {
        if (!day || !clock) return 0;
        const date = new Date(`${day}T${clock}:00`);
        return Number.isNaN(date.getTime()) ? 0 : date.getTime();
    };
    for (const [day, events] of Object.entries(calendarEvents.value ?? {})) {
        for (const event of events ?? []) {
            const start = localEpoch(day, event.time);
            if (!start) continue;
            const end = event.end ? localEpoch(day, event.end) : start + 30 * 60000;
            if (end <= now) continue;
            candidates.push({
                start,
                allDay: false,
                title: String(event.title ?? 'Acara'),
            });
        }
    }

    candidates.sort((a, b) => a.start - b.start);
    return candidates[0] ?? null;
};

const agendaTextFor = event => {
    const start = new Date(event.start);
    const now = new Date();
    const startOfDay = value =>
        new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
    const diff = Math.round((startOfDay(start) - startOfDay(now)) / DAY_MS);
    const clock = `${pad2(start.getHours())}:${pad2(start.getMinutes())}`;

    let when;
    if (diff === 0) when = event.allDay ? 'Hari ini' : clock;
    else if (diff === 1) when = event.allDay ? 'Besok' : `Besok ${clock}`;
    else when = event.allDay ? formatDateShort(start) : `${formatDateShort(start)} ${clock}`;

    return `${when} · ${event.title}`;
};

const StatRow = ({ icon, label, value, page }) => {
    const valueEl = tabular(Widget.Label({
        className: 'dyn-island-idle-row-value',
        xalign: 1,
        hexpand: true,
        truncate: 'end',
        maxWidthChars: 18,
    }));
    const labelEl = Widget.Label({
        className: 'dyn-island-idle-row-label',
        label,
        xalign: 0,
    });
    const row = Widget.EventBox({
        className: 'dyn-island-idle-row',
        tooltipText: `Buka ${label.toLowerCase()}`,
        child: Widget.Box({
            spacing: 8,
            valign: Gtk.Align.CENTER,
            children: [icon, labelEl, valueEl],
        }),
        setup: self => self.connect('button-press-event', () => {
            openPage(page);
            return true;
        }),
    });
    valueEl.label = value;
    return {
        widget: row,
        setValue: text => { valueEl.label = text; },
    };
};

export default () => {
    const time = tabular(Widget.Label({ className: 'dyn-island-idle-time', xalign: 0 }));
    const date = Widget.Label({ className: 'dyn-island-idle-date', xalign: 0 });

    const agendaIcon = Widget.Label({
        className: 'dyn-island-idle-agenda-icon',
        label: '\uf073',
    });
    const agendaText = Widget.Label({
        className: 'dyn-island-idle-agenda-text',
        xalign: 0,
        truncate: 'end',
        maxWidthChars: 28,
    });
    const agenda = Widget.EventBox({
        className: 'dyn-island-idle-agenda',
        tooltipText: 'Buka kalender',
        child: Widget.Box({
            spacing: 6,
            valign: Gtk.Align.CENTER,
            children: [agendaIcon, agendaText],
        }),
        setup: self => self.connect('button-press-event', () => {
            openPage('calendar');
            return true;
        }),
    });
    agenda.visible = false;
    agenda.set_no_show_all(true);

    const weatherIcon = Widget.Label({ className: 'dyn-island-idle-row-icon' });
    const weatherRow = StatRow({
        icon: weatherIcon,
        label: 'Cuaca',
        value: '—',
        page: 'weather',
    });
    const taskIcon = Widget.Label({ className: 'dyn-island-idle-row-icon', label: '\uf0ae' });
    const taskRow = StatRow({
        icon: taskIcon,
        label: 'Tugas',
        value: '0/0',
        page: 'todo',
    });
    const waterIcon = Widget.Label({ className: 'dyn-island-idle-row-icon', label: '\uf043' });
    const waterRow = StatRow({
        icon: waterIcon,
        label: 'Air',
        value: '0/0 L',
        page: 'water',
    });

    const left = Widget.Box({
        className: 'dyn-island-idle-left',
        vertical: true,
        spacing: 4,
        widthRequest: 180,
        valign: Gtk.Align.CENTER,
        children: [time, date, agenda],
    });
    const right = Widget.Box({
        className: 'dyn-island-idle-right',
        vertical: true,
        spacing: 8,
        widthRequest: 207,
        valign: Gtk.Align.CENTER,
        children: [taskRow.widget, waterRow.widget, weatherRow.widget],
    });
    const divider = Widget.Box({ className: 'dyn-island-idle-divider' });
    divider.set_size_request(1, 64);

    const refreshClock = () => {
        time.label = formatClock();
        date.label = formatDate();
    };

    const refreshAgenda = () => {
        const event = nextEvent();
        if (!event) {
            agenda.visible = false;
            return;
        }
        const text = agendaTextFor(event);
        agendaText.label = text;
        agenda.tooltipText = `${text}\nKlik untuk buka kalender`;
        agenda.visible = true;
        agenda.show();
    };

    const refreshStats = () => {
        const todoState = todo.value;
        taskRow.setValue(`${doneCount(todoState)}/${totalCount(todoState)}`);

        const waterState = water.value;
        const drunk = waterTotal(waterState);
        const goal = Number(waterState.goal) || 0;
        waterRow.setValue(`${liters(drunk)}/${liters(goal)} L`);

        const current = weather.value;
        if (current?.ok) {
            const condition = weatherLabel(current.code);
            weatherIcon.label = weatherGlyph(current.code, current.isDay);
            weatherRow.setValue(`${current.temp}° · ${condition}`);
            weatherRow.widget.tooltipText =
                `Cuaca: ${condition} · ${current.temp}° · terasa ${current.feels}°`
                + ` · kelembapan ${current.humidity}%`;
        } else {
            weatherIcon.label = '\uf0c2';
            weatherRow.setValue('—');
            weatherRow.widget.tooltipText = 'Cuaca belum tersedia · klik untuk detail';
        }
    };

    const refreshTimed = () => {
        refreshClock();
        refreshAgenda();
    };

    return Widget.Box({
        className: 'dyn-island-idle',
        spacing: 20,
        halign: Gtk.Align.CENTER,
        valign: Gtk.Align.CENTER,
        children: [left, divider, right],
        setup: self => {
            refreshTimed();
            refreshStats();
            self.hook(todo, refreshStats);
            self.hook(water, refreshStats);
            self.hook(weather, refreshStats);
            self.hook(calendar, refreshAgenda);
            self.hook(calendarEvents, refreshAgenda);
            onMinute(refreshTimed, self);
        },
    });
};
