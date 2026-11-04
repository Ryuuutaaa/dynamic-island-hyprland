import GLib from 'gi://GLib';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import CONFIG from '../config.js';
import { followFocused } from './monitor.js';
import { MODES, pomodoro, pomodoroOsd } from './pomodoro.js';

// Kartu kecil di pojok kanan atas, terpisah dari island. Dulu umpan balik
// pomodoro memakai showTransient() sehingga notch di tengah layar ikut
// mengembang setiap kali timer dimulai/dijeda — terlalu mengganggu.
const HIDE_MS = Math.max(1800, (CONFIG.osdTimeout ?? 1600) + 600);

const clock = seconds => {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
};

export default () => {
    const time = Widget.Label({ className: 'dyn-island-pomo-osd-time', xalign: 0 });
    const mode = Widget.Label({ className: 'dyn-island-pomo-osd-mode', xalign: 0 });
    const state = Widget.Label({ className: 'dyn-island-pomo-osd-state' });

    const card = Widget.Box({
        className: 'dyn-island-pomo-osd',
        vertical: true,
        widthRequest: 188,
        children: [
            Widget.Box({
                className: 'dyn-island-pomo-osd-head',
                spacing: 8,
                children: [
                    Widget.Label({
                        className: 'dyn-island-pomo-osd-title',
                        label: 'Pomodoro',
                        xalign: 0,
                    }),
                    Widget.Label({ hexpand: true }),
                    state,
                ],
            }),
            time,
            mode,
        ],
    });

    const win = Widget.Window({
        name: 'dyn-island-pomo-osd',
        className: 'dyn-island-pomo-osd-window',
        layer: 'overlay',
        anchor: ['top', 'right'],
        exclusivity: 'ignore',
        keymode: 'none',
        margins: [12, 12, 0, 0],
        visible: false,
        child: card,
    });
    followFocused(win);

    let hideTimer = 0;

    const refresh = () => {
        const current = pomodoro.value;
        time.label = clock(current.remaining);
        mode.label = MODES[current.mode]?.label ?? '';
        state.label = current.running ? 'berjalan' : 'dijeda';
    };

    const hide = () => {
        hideTimer = 0;
        win.visible = false;
    };

    const show = () => {
        refresh();
        win.visible = true;
        if (hideTimer) GLib.source_remove(hideTimer);
        hideTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, HIDE_MS, () => {
            hide();
            return GLib.SOURCE_REMOVE;
        });
    };

    // dipicu dari modules/pomodoro.js setiap start/pause/ganti mode
    win.hook(pomodoroOsd, () => show());
    // hitung mundur di dalam kartu tetap jalan selama kartu tampil
    win.hook(pomodoro, () => {
        if (win.visible) refresh();
    });

    return win;
};
