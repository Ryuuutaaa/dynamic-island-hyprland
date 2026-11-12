import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import Gtk from 'gi://Gtk?version=3.0';
import Battery from 'resource:///com/github/Aylur/ags/service/battery.js';
import { todo, doneCount, totalCount } from './todo.js';
import { water, total as waterTotal, liters } from './water.js';
import { weather, glyphFor as weatherGlyph, labelFor as weatherLabel } from './weather.js';
import { calendar } from './calendar.js';
import { calendarEvents } from './calendar-events.js';
import { formatClock, formatDate, formatDateShort, onMinute } from './timefmt.js';
import BluetoothBar from './bluetooth.js';
import { pinPage, isStickyPage } from '../state.js';
import { palette, hexToRgb } from '../theme.js';
import { roundedRect } from '../draw.js';
import { tabular } from './type.js';

const FG = hexToRgb(palette.fg);
const ACCENT = hexToRgb(palette.accent2);
const DAY_MS = 86400000;

const pad2 = value => String(value).padStart(2, '0');

const greetingFor = hour =>
    hour < 4 ? 'Selamat malam'
        : hour < 11 ? 'Selamat pagi'
            : hour < 15 ? 'Selamat siang'
                : hour < 19 ? 'Selamat sore' : 'Selamat malam';

const openPage = name => pinPage(name, { sticky: isStickyPage(name) });

const ProgressLine = () => {
    let fraction = 0;
    const area = Widget.DrawingArea({
        className: 'dyn-island-idle-progress',
        setup: self => self.set_size_request(-1, 2),
        drawFn: (self, cr, width, height) => {
            const y = Math.max(0, (height - 2) / 2);
            cr.setSourceRGBA(FG[0], FG[1], FG[2], 0.14);
            roundedRect(cr, 0, y, width, 2, 1);
            cr.fill();
            if (fraction <= 0) return;
            cr.setSourceRGBA(ACCENT[0], ACCENT[1], ACCENT[2], 0.95);
            roundedRect(cr, 0, y, Math.max(2, width * fraction), 2, 1);
            cr.fill();
        },
    });
    area.setFraction = value => {
        fraction = Math.max(0, Math.min(1, Number(value) || 0));
        area.queue_draw();
    };
    return area;
};

const StatCard = ({ icon, label, value, fraction = null, page = null, tooltip = '' }) => {
    const labelEl = Widget.Label({ className: 'dyn-island-idle-card-label', label });
    const valueEl = tabular(Widget.Label({
        className: 'dyn-island-idle-card-value',
        label: String(value ?? '—'),
        xalign: 0,
        truncate: 'end',
        maxWidthChars: 14,
    }));
    const progress = fraction === null ? null : ProgressLine();
    const children = [
        Widget.Box({
            className: 'dyn-island-idle-card-head',
            spacing: 6,
            valign: Gtk.Align.CENTER,
            children: [icon, labelEl],
        }),
        valueEl,
    ];
    if (progress) children.push(progress);

    const card = Widget.EventBox({
        className: `dyn-island-idle-card${page ? ' is-action' : ''}`,
        hexpand: true,
        tooltipText: tooltip,
        child: Widget.Box({ vertical: true, spacing: 2, children }),
        setup: self => {
            if (!page) return;
            self.connect('button-press-event', () => {
                openPage(page);
                return true;
            });
        },
    });
    if (progress) progress.setFraction(fraction);

    return {
        widget: card,
        setLabel: text => { labelEl.label = text; },
        setValue: text => { valueEl.label = text; },
        setProgress: value => { progress?.setFraction(value); },
    };
};

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

export default () => {
    const greeting = Widget.Label({ className: 'dyn-island-idle-greeting', xalign: 0 });
    const time = tabular(Widget.Label({ className: 'dyn-island-idle-time', xalign: 0 }));
    const date = Widget.Label({ className: 'dyn-island-idle-date', xalign: 0 });

    const agendaText = Widget.Label({
        className: 'dyn-island-idle-agenda-text',
        xalign: 0,
        truncate: 'end',
        maxWidthChars: 20,
    });
    const agendaIcon = Widget.Label({
        className: 'dyn-island-idle-agenda-icon',
        label: '\uf073',
    });
    const agenda = Widget.EventBox({
        className: 'dyn-island-idle-agenda is-empty',
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

    const weatherIcon = Widget.Label({ className: 'dyn-island-idle-card-icon' });
    const weatherCard = StatCard({
        icon: weatherIcon,
        label: 'Cuaca',
        value: '—',
        page: 'weather',
        tooltip: 'Buka cuaca',
    });
    const batteryIcon = Widget.Icon({ className: 'dyn-island-idle-card-icon', size: 12 });
    const batteryCard = StatCard({
        icon: batteryIcon,
        label: 'Baterai',
        value: '—',
        tooltip: 'Baterai',
    });
    const taskIcon = Widget.Label({ className: 'dyn-island-idle-card-icon', label: '\uf0ae' });
    const taskCard = StatCard({
        icon: taskIcon,
        label: 'Tugas',
        value: '0/0',
        fraction: 0,
        page: 'todo',
        tooltip: 'Buka tugas',
    });
    const waterIcon = Widget.Label({ className: 'dyn-island-idle-card-icon', label: '\uf043' });
    const waterCard = StatCard({
        icon: waterIcon,
        label: 'Air',
        value: '0/0 L',
        fraction: 0,
        page: 'water',
        tooltip: 'Buka air',
    });

    const gridTop = Widget.Box({
        spacing: 4,
        hexpand: true,
        children: [taskCard.widget, waterCard.widget],
    });
    const gridBottom = Widget.Box({
        spacing: 4,
        hexpand: true,
        children: [weatherCard.widget, batteryCard.widget],
    });

    const left = Widget.Box({
        className: 'dyn-island-idle-left',
        vertical: true,
        spacing: 2,
        widthRequest: 156,
        valign: Gtk.Align.CENTER,
        children: [greeting, time, date, agenda],
    });

    const right = Widget.Box({
        className: 'dyn-island-idle-right',
        vertical: true,
        spacing: 4,
        widthRequest: 248,
        valign: Gtk.Align.CENTER,
        children: [gridTop, gridBottom, BluetoothBar()],
    });

    const refreshClock = () => {
        const now = new Date();
        time.label = formatClock();
        date.label = formatDate();
        greeting.label = greetingFor(now.getHours());
    };

    const refreshAgenda = () => {
        const event = nextEvent();
        if (!event) {
            agendaText.label = 'Tidak ada acara';
            agenda.className = 'dyn-island-idle-agenda is-empty';
            agenda.tooltipText = 'Buka kalender';
            return;
        }
        const text = agendaTextFor(event);
        agendaText.label = text;
        agenda.className = 'dyn-island-idle-agenda';
        agenda.tooltipText = `${text}\nKlik untuk buka kalender`;
    };

    const refreshStats = () => {
        if (Battery.available) {
            batteryIcon.visible = true;
            batteryIcon.icon = Battery.charging && !String(Battery.icon_name).includes('charging')
                ? 'battery-full-charging-symbolic'
                : Battery.icon_name;
            batteryCard.setValue(`${Math.round(Battery.percent)}%`);
        } else {
            batteryIcon.visible = false;
            batteryCard.setValue('—');
        }

        const todoState = todo.value;
        const done = doneCount(todoState);
        const total = totalCount(todoState);
        taskCard.setValue(`${done}/${total}`);
        taskCard.setProgress(total > 0 ? done / total : 0);

        const waterState = water.value;
        const drunk = waterTotal(waterState);
        const goal = Number(waterState.goal) || 0;
        waterCard.setValue(`${liters(drunk)}/${liters(goal)} L`);
        waterCard.setProgress(goal > 0 ? drunk / goal : 0);

        const current = weather.value;
        if (current?.ok) {
            const condition = weatherLabel(current.code);
            weatherIcon.label = weatherGlyph(current.code, current.isDay);
            weatherCard.setLabel(condition);
            weatherCard.setValue(`${current.temp}°`);
            weatherCard.widget.tooltipText =
                `Cuaca: ${condition} · ${current.temp}° · terasa ${current.feels}°`
                + ` · kelembapan ${current.humidity}%`;
        } else {
            weatherIcon.label = '\uf0c2';
            weatherCard.setLabel('Cuaca');
            weatherCard.setValue('—');
            weatherCard.widget.tooltipText = 'Cuaca belum tersedia · klik untuk detail';
        }
    };

    const refreshTimed = () => {
        refreshClock();
        refreshAgenda();
    };

    return Widget.Box({
        className: 'dyn-island-idle',
        spacing: 24,
        halign: Gtk.Align.CENTER,
        valign: Gtk.Align.CENTER,
        children: [left, right],
        setup: self => {
            refreshTimed();
            refreshStats();
            self.hook(Battery, refreshStats);
            self.hook(todo, refreshStats);
            self.hook(water, refreshStats);
            self.hook(weather, refreshStats);
            self.hook(calendar, refreshAgenda);
            self.hook(calendarEvents, refreshAgenda);
            onMinute(refreshTimed, self);
        },
    });
};
