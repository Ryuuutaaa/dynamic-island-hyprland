import Gtk from 'gi://Gtk?version=3.0';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import {
    adjustTime, applyPreset, mmss, PRESETS, resetTimer, setMode, timer, toggleRunning,
} from './timer.js';
import { tabular } from './type.js';

// Halaman timer v2: satu angka fokus di kiri, kontrol bertingkat di kanan
// (mode -> preset 2 baris -> aksi utama). Tidak ada lagi delapan pill kecil
// berjejer yang saling menempel.

// Label memakai tanda menit (′) supaya terbaca sebagai durasi, dan tombol
// yang sedang aktif diberi kelas is-active (setara dengan total saat ini).
const presetButton = minutes => Widget.Button({
    className: 'dyn-island-timer-preset',
    child: Widget.Label({ label: `${minutes}′` }),
    onClicked: () => applyPreset(minutes),
});

const stepButton = (label, delta, tooltip) => Widget.Button({
    className: 'dyn-island-timer-step',
    tooltipText: tooltip,
    child: Widget.Label({ className: 'dyn-island-timer-step-label', label }),
    onClicked: () => adjustTime(delta),
});

export default () => {
    const time = tabular(Widget.Label({ className: 'dyn-island-timer-time', xalign: 0 }));
    const sub = tabular(Widget.Label({ className: 'dyn-island-timer-sub', xalign: 0 }));
    const minus = stepButton('\u2212', -60, 'Kurangi 1 menit');
    const plus = stepButton('+', 60, 'Tambah 1 menit');

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

    const buttons = PRESETS.map(minutes => ({ minutes, button: presetButton(minutes) }));
    const rows = [];
    for (let index = 0; index < buttons.length; index += 4) {
        rows.push(Widget.Box({
            className: 'dyn-island-timer-preset-row',
            spacing: 4,
            children: buttons.slice(index, index + 4).map(item => item.button),
        }));
    }

    const play = Widget.Button({
        className: 'dyn-island-timer-play',
        child: Widget.Label({ label: 'Mulai' }),
        onClicked: () => toggleRunning(),
    });
    const reset = Widget.Button({
        className: 'dyn-island-timer-reset',
        child: Widget.Label({ label: '\uf021' }),
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
        play.child.label = value.running ? '\uf04c  Jeda' : '\uf04b  Mulai';
        const totalMinutes = Math.round(value.total / 60);
        for (const item of buttons) {
            const active = isTimer && !value.running && item.minutes === totalMinutes;
            item.button.className = active
                ? 'dyn-island-timer-preset is-active'
                : 'dyn-island-timer-preset';
        }
        play.className = value.running ? 'dyn-island-timer-play is-running' : 'dyn-island-timer-play';
        modeTimer.className = isTimer ? 'dyn-island-timer-mode is-active' : 'dyn-island-timer-mode';
        modeStopwatch.className = isTimer ? 'dyn-island-timer-mode' : 'dyn-island-timer-mode is-active';
        presets.visible = isTimer;
        const canAdjust = isTimer && !value.running;
        minus.sensitive = canAdjust;
        plus.sensitive = canAdjust;
    };

    return Widget.Box({
        className: 'dyn-island-timer',
        spacing: 16,
        valign: Gtk.Align.CENTER,
        children: [
            Widget.Box({
                className: 'dyn-island-timer-main',
                vertical: true,
                spacing: 0,
                valign: Gtk.Align.CENTER,
                widthRequest: 128,
                children: [
                    time,
                    sub,
                    Widget.Box({
                        className: 'dyn-island-timer-modes',
                        spacing: 4,
                        margin_top: 2,
                        children: [modeTimer, modeStopwatch],
                    }),
                ],
            }),
            Widget.Box({
                className: 'dyn-island-timer-controls',
                vertical: true,
                spacing: 5,
                valign: Gtk.Align.CENTER,
                hexpand: true,
                children: [
                    presets,
                    Widget.Box({
                        className: 'dyn-island-timer-actions',
                        spacing: 4,
                        children: [minus, plus, play, reset],
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
