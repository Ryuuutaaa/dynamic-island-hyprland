import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import Gtk from 'gi://Gtk?version=3.0';
import Battery from 'resource:///com/github/Aylur/ags/service/battery.js';
import { todo, doneCount, totalCount } from './todo.js';
import { water, total, liters } from './water.js';
import { formatClock, formatDate, onMinute } from './timefmt.js';
import BluetoothBar from './bluetooth.js';

// Halaman idle dulu hanya jam + baterai (106 dari 394 px terpakai). Sekarang
// diisi ringkasan yang berguna: jam besar, tanggal, lalu baterai + progres
// tugas + air (semua dari state yang sudah ada, bukan fitur baru).
const statLabel = () => Widget.Label({
    className: 'dyn-island-idle-stat',
    xalign: 0,
});

const glyphIcon = glyph => Widget.Label({
    className: 'dyn-island-idle-stat-icon',
    label: glyph,
});

const statRow = (icon, label) => Widget.Box({
    className: 'dyn-island-idle-stat-row',
    spacing: 8,
    children: [icon, label],
});

export default () => {
    const time = Widget.Label({ className: 'dyn-island-idle-time', xalign: 0 });
    const date = Widget.Label({ className: 'dyn-island-idle-date', xalign: 0 });
    const battIcon = Widget.Icon({ className: 'dyn-island-idle-stat-icon', size: 13 });
    const batt = statLabel();
    const task = statLabel();
    const drink = statLabel();

    const refreshClock = () => {
        time.label = formatClock();
        date.label = formatDate();
    };
    refreshClock();

    const refreshStats = () => {
        if (Battery.available) {
            battIcon.visible = true;
            battIcon.icon = Battery.charging && !String(Battery.icon_name).includes('charging')
                ? 'battery-full-charging-symbolic'
                : Battery.icon_name;
            batt.label = `${Math.round(Battery.percent)}%`;
        } else {
            battIcon.visible = false;
            batt.label = '—';
        }
        const todoState = todo.value;
        task.label = `${doneCount(todoState)}/${totalCount(todoState)} tugas`;
        const waterState = water.value;
        drink.label = `${liters(total(waterState))} / ${liters(waterState.goal)} L`;
    };
    refreshStats();

    return Widget.Box({
        className: 'dyn-island-idle',
        spacing: 56,
        halign: Gtk.Align.CENTER,
        valign: Gtk.Align.CENTER,
        children: [
            Widget.Box({
                className: 'dyn-island-idle-clock',
                vertical: true,
                spacing: 0,
                children: [time, date],
            }),
            Widget.Box({
                className: 'dyn-island-idle-stats',
                vertical: true,
                spacing: 7,
                valign: Gtk.Align.CENTER,
                children: [
                    statRow(battIcon, batt),
                    statRow(glyphIcon('\uf0ae'), task),
                    statRow(glyphIcon('\uf043'), drink),
                    // hanya tampil saat ada device Bluetooth yang terhubung
                    BluetoothBar(),
                ],
            }),
        ],
        setup: self => {
            self.hook(Battery, refreshStats);
            self.hook(todo, refreshStats);
            self.hook(water, refreshStats);
            onMinute(refreshClock, self);
        },
    });
};
