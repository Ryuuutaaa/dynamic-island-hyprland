import Gtk from 'gi://Gtk?version=3.0';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import { palette, hexToRgb } from '../theme.js';
import { pomodoro, MODES, setMode, toggleRunning, reset } from './pomodoro.js';

const RING = 88;
const THICK = 7;
// merah dari palet (default theme.js, bisa di-override wallust via
// `@define-color danger ...`) — dulu [1, 0.35, 0.42] hardcoded
const RED = hexToRgb(palette.danger);

const format = seconds => {
    const safe = Math.max(0, Math.round(seconds));
    const minutes = Math.floor(safe / 60);
    const rest = safe % 60;
    return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
};

// Ring merah menunjukkan SISA waktu (busur menyusut), gaya Nusa.
const Ring = () => Widget.DrawingArea({
    className: 'dyn-island-pomo-ring',
    setup: self => {
        self.set_size_request(RING, RING);
        self.hook(pomodoro, () => self.queue_draw());
    },
    drawFn: (self, cr, width, height) => {
        const { remaining, total } = pomodoro.value;
        const fraction = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
        const radius = Math.min(width, height) / 2 - THICK / 2;
        if (radius <= 0) return;
        const cx = width / 2;
        const cy = height / 2;

        cr.setLineWidth(THICK);
        cr.setSourceRGBA(RED[0], RED[1], RED[2], 0.22);
        cr.arc(cx, cy, radius, 0, Math.PI * 2);
        cr.stroke();

        if (fraction <= 0) return;
        cr.setSourceRGBA(RED[0], RED[1], RED[2], 0.95);
        cr.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fraction);
        cr.stroke();
    },
});

const pillLabel = text => Widget.Label({ className: 'dyn-island-pill-label', label: text });

// tooltipText hanya dipasang kalau ada: GJS menolak `tooltipText: undefined`
// ("Invalid value 'undefined' for property tooltip-text").
const pill = (child, onClicked, tooltip) => Widget.Button({
    className: 'dyn-island-pill',
    ...(tooltip ? { tooltipText: tooltip } : {}),
    child,
    onClicked,
});

// Pill mode memutar siklus fokus -> istirahat singkat -> istirahat panjang.
// Label menampilkan mode BERIKUTNYA supaya satu pill cukup.
const NEXT_MODE = { focus: 'break', break: 'longBreak', longBreak: 'focus' };
const NEXT_LABEL = { focus: 'Istirahat', break: 'Istirahat panjang', longBreak: 'Fokus' };

export default () => {
    const time = Widget.Label({ className: 'dyn-island-pomo-time' });
    const modeText = Widget.Label({ className: 'dyn-island-pomo-mode' });
    const playLabel = pillLabel('\uf04b');
    const modePillLabel = pillLabel('Istirahat');

    const modePill = pill(
        modePillLabel,
        () => setMode(NEXT_MODE[pomodoro.value.mode] ?? 'focus'),
        'Ganti mode: fokus → istirahat singkat → istirahat panjang',
    );

    const playPill = pill(playLabel, () => toggleRunning());

    const resetPill = pill(pillLabel('\uf021'), () => reset());

    const refresh = () => {
        const current = pomodoro.value;
        time.label = format(current.remaining);
        modeText.label = MODES[current.mode].label;
        playLabel.label = current.running ? '\uf04c' : '\uf04b';
        modePillLabel.label = NEXT_LABEL[current.mode] ?? 'Fokus';
    };

    return Widget.Box({
        className: 'dyn-island-pomodoro',
        spacing: 22,
        halign: Gtk.Align.CENTER,
        valign: Gtk.Align.CENTER,
        children: [
            Ring(),
            Widget.Box({
                className: 'dyn-island-pomo-text',
                vertical: true,
                spacing: 4,
                valign: Gtk.Align.CENTER,
                children: [
                    Widget.Label({ className: 'dyn-island-pomo-title', label: 'Pomodoro', xalign: 0 }),
                    time,
                    modeText,
                ],
            }),
            Widget.Box({
                className: 'dyn-island-pomo-pills',
                vertical: true,
                spacing: 6,
                valign: Gtk.Align.CENTER,
                children: [modePill, playPill, resetPill],
            }),
        ],
        setup: self => {
            refresh();
            self.hook(pomodoro, refresh);
        },
    });
};
