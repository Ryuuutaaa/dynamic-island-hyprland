import Gtk from 'gi://Gtk?version=3.0';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import {
    applyPreset, mmss, PRESETS, resetTimer, setMode, timer, toggleRunning,
} from './timer.js';

// Halaman timer v2: satu angka fokus di kiri, kontrol bertingkat di kanan
// (mode -> preset 2 baris -> aksi utama). Tidak ada lagi delapan pill kecil
// berjejer yang saling menempel.

const presetButton = minutes => Widget.Button({
    className: 'dyn-island-timer-preset',
    child: Widget.Label({ label: `${minutes}m` }),
    onClicked: () => applyPreset(minutes),
});

export default () => {
    const time = Widget.Label({ className: 'dyn-island-timer-time', xalign: 0 });
    const sub = Widget.Label({ className: 'dyn-island-timer-sub', xalign: 0 });

    const modeTimer = Widget.Button({
        className: 'dyn-island-timer-mode',
        child: Widget.Label({ label: 'Timer' }),
        onClicked: () => setMode('timer'),
    });
    const modeStopwatch = Widget.Button({
        className: 'dyn-island-timer-mode',
        child: Widget.Label({ label: 'Stopwatch' }),
        onClicked: () => setMode('stopwatch'),
    });

    const rows = [];
    for (let index = 0; index < PRESETS.length; index += 4) {
        rows.push(Widget.Box({
            className: 'dyn-island-timer-preset-row',
            spacing: 4,
            children: PRESETS.slice(index, index + 4).map(presetButton),
        }));
    }

    const play = Widget.Button({
        className: 'dyn-island-timer-play',
        child: Widget.Label({ label: 'Mulai' }),
        onClicked: () => toggleRunning(),
    });
    const reset = Widget.Button({
        className: 'dyn-island-timer-reset',
        child: Widget.Label({ label: '↻' }),
        onClicked: () => resetTimer(),
    });

    const presets = Widget.Box({
        className: 'dyn-island-timer-presets',
        vertical: true,
        spacing: 4,
        children: rows,
    });

    const refresh = () => {
        const value = timer.value;
        const isTimer = value.mode === 'timer';
        time.label = mmss(isTimer ? value.remaining : value.elapsed);
        sub.label = isTimer
            ? `${Math.round(value.total / 60)} menit${value.running ? '' : ' · jeda'}`
            : `Stopwatch${value.running ? ' · jalan' : ' · jeda'}`;
        play.child.label = value.running ? 'Jeda' : 'Mulai';
        play.className = value.running ? 'dyn-island-timer-play is-running' : 'dyn-island-timer-play';
        modeTimer.className = isTimer ? 'dyn-island-timer-mode is-active' : 'dyn-island-timer-mode';
        modeStopwatch.className = isTimer ? 'dyn-island-timer-mode' : 'dyn-island-timer-mode is-active';
        presets.visible = isTimer;
    };

    return Widget.Box({
        className: 'dyn-island-timer',
        spacing: 16,
        valign: Gtk.Align.CENTER,
        children: [
            Widget.Box({
                className: 'dyn-island-timer-main',
                vertical: true,
                spacing: 1,
                valign: Gtk.Align.CENTER,
                widthRequest: 132,
                children: [time, sub],
            }),
            Widget.Box({
                className: 'dyn-island-timer-controls',
                vertical: true,
                spacing: 6,
                valign: Gtk.Align.CENTER,
                hexpand: true,
                children: [
                    Widget.Box({
                        className: 'dyn-island-timer-modes',
                        spacing: 4,
                        children: [modeTimer, modeStopwatch],
                    }),
                    presets,
                    Widget.Box({
                        className: 'dyn-island-timer-actions',
                        spacing: 4,
                        children: [play, reset],
                    }),
                ],
            }),
        ],
        setup: self => {
            refresh();
            self.hook(timer, refresh);
        },
    });
};
