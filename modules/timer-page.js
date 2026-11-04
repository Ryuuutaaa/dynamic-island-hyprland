import Gtk from 'gi://Gtk?version=3.0';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import {
    applyPreset, mmss, PRESETS, resetTimer, setMode, timer, toggleRunning,
} from './timer.js';

// Halaman timer bebas + stopwatch. Ringkas: waktu besar di kiri, kontrol di
// kanan (mode, preset durasi, play/pause, reset).

const pill = (label, onClicked, className = 'dyn-island-pill') => Widget.Button({
    className,
    child: Widget.Label({ className: 'dyn-island-pill-label', label }),
    onClicked,
});

export default () => {
    const time = Widget.Label({ className: 'dyn-island-timer-time', xalign: 0 });
    const sub = Widget.Label({ className: 'dyn-island-timer-sub', xalign: 0 });

    const timerBtn = pill('Timer', () => setMode('timer'));
    const stopwatchBtn = pill('Stopwatch', () => setMode('stopwatch'));

    const presets = Widget.Box({
        className: 'dyn-island-timer-presets',
        spacing: 4,
        children: PRESETS.map(minutes => Widget.Button({
            className: 'dyn-island-timer-preset',
            child: Widget.Label({ label: `${minutes}` }),
            onClicked: () => applyPreset(minutes),
        })),
    });

    const play = Widget.Button({
        className: 'dyn-island-timer-btn',
        child: Widget.Label({ label: '▶' }),
        onClicked: () => toggleRunning(),
    });
    const reset = Widget.Button({
        className: 'dyn-island-timer-btn',
        child: Widget.Label({ label: '↻' }),
        onClicked: () => resetTimer(),
    });

    const refresh = () => {
        const value = timer.value;
        const isTimer = value.mode === 'timer';
        time.label = mmss(isTimer ? value.remaining : value.elapsed);
        const total = Math.round(value.total / 60);
        sub.label = isTimer
            ? `Timer · ${total} menit${value.running ? '' : ' · jeda'}`
            : `Stopwatch${value.running ? ' · berjalan' : ' · jeda'}`;
        play.child.label = value.running ? '⏸' : '▶';
        timerBtn.className = isTimer ? 'dyn-island-pill is-active' : 'dyn-island-pill';
        stopwatchBtn.className = isTimer ? 'dyn-island-pill' : 'dyn-island-pill is-active';
        presets.visible = isTimer;
    };

    return Widget.Box({
        className: 'dyn-island-timer',
        spacing: 14,
        valign: Gtk.Align.CENTER,
        children: [
            Widget.Box({
                vertical: true,
                spacing: 2,
                valign: Gtk.Align.CENTER,
                hexpand: true,
                children: [time, sub],
            }),
            Widget.Box({
                vertical: true,
                spacing: 5,
                valign: Gtk.Align.CENTER,
                children: [
                    Widget.Box({ spacing: 4, children: [timerBtn, stopwatchBtn] }),
                    presets,
                    Widget.Box({ spacing: 4, children: [play, reset] }),
                ],
            }),
        ],
        setup: self => {
            refresh();
            self.hook(timer, refresh);
        },
    });
};
