import GLib from 'gi://GLib';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import { applyFocused } from './monitor.js';
import { MODES, pomodoro, pomodoroOsd, reset, setMode, toggleRunning } from './pomodoro.js';

// Kartu pomodoro di pojok kanan atas, terpisah dari island:
// - lebar, memuat mode, sisa waktu, bar progres, dan tombol aksi
// - MENETAP selama sesi berjalan/dijeda (tidak auto-hide seperti notifikasi)
// - berkedip sebentar saat sesi selesai / masuk waktu istirahat
// - dipasang sekali ke monitor yang sedang fokus, tidak ikut berpindah monitor

const NEXT_MODE = { focus: 'break', break: 'longBreak', longBreak: 'focus' };
const NEXT_LABEL = { focus: 'Istirahat', break: 'Istirahat panjang', longBreak: 'Fokus' };

const LINGER_AFTER_ACTION = 4000;   // jeda singkat setelah pause/ganti mode
const LINGER_AFTER_FINISH = 6000;   // biar animasi selesai sempat terlihat

const clock = seconds => {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
};

// Widget AGS bukan Gtk.Widget: add/remove_style_class_name tidak tersedia,
// jadi kelas animasi di-set lewat properti className.
const setFinished = (box, on) => {
    box.className = on ? 'dyn-island-pomo-osd is-finished' : 'dyn-island-pomo-osd';
};

const actionButton = (label, onClicked, tooltip) => Widget.Button({
    className: 'dyn-island-pomo-osd-btn',
    ...(tooltip ? { tooltipText: tooltip } : {}),
    child: Widget.Label({ label }),
    onClicked,
});

export default () => {
    const time = Widget.Label({ className: 'dyn-island-pomo-osd-time', xalign: 0 });
    const modeText = Widget.Label({ className: 'dyn-island-pomo-osd-mode', xalign: 0 });
    const stateText = Widget.Label({ className: 'dyn-island-pomo-osd-state' });
    const bar = Widget.ProgressBar({ className: 'dyn-island-pomo-osd-bar', value: 0 });

    const play = actionButton('⏸', () => toggleRunning(), 'Mulai / jeda');
    const skip = actionButton('Istirahat', () => setMode(NEXT_MODE[pomodoro.value.mode]), 'Mode berikutnya');
    const redo = actionButton('↻', () => reset(), 'Reset');

    const card = Widget.Box({
        className: 'dyn-island-pomo-osd',
        vertical: true,
        widthRequest: 320,
        spacing: 6,
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
                    stateText,
                ],
            }),
            Widget.Box({
                className: 'dyn-island-pomo-osd-clock',
                spacing: 10,
                children: [time, modeText],
            }),
            bar,
            Widget.Box({
                className: 'dyn-island-pomo-osd-actions',
                spacing: 6,
                children: [play, skip, redo],
            }),
        ],
    });

    const win = Widget.Window({
        name: 'dyn-island-pomo-osd',
        className: 'dyn-island-pomo-osd-window',
        layer: 'overlay',
        anchor: ['top', 'right'],
        exclusivity: 'ignore',
        keymode: 'none',
        // 110 = margin 12 + tinggi popup notifikasi 90 + jarak 8
        margins: [110, 12, 0, 0],
        visible: false,
        child: card,
    });

    // pasang sekali ke monitor yang aktif sekarang; sengaja bukan followFocused
    // supaya kartu tidak melompat pindah monitor saat kursor berpindah
    applyFocused(win).catch(() => { });

    let hideTimer = 0;
    let blinkTimer = 0;
    let celebrating = false;
    // true setelah sesi selesai: kartu tetap tampil sampai user mulai atau reset
    let pinned = false;

    const clearHide = () => {
        if (hideTimer) GLib.source_remove(hideTimer);
        hideTimer = 0;
    };

    const scheduleHide = ms => {
        clearHide();
        hideTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            hideTimer = 0;
            // jangan sembunyikan kalau ternyata timer jalan lagi
            if (!pomodoro.value.running && !celebrating && !pinned) win.visible = false;
            return GLib.SOURCE_REMOVE;
        });
    };

    // Animasi selesai: kartu menyala ke warna aksen (transisi CSS) lalu
    // memudar kembali. Tidak berkedip supaya tidak terasa seperti flicker.
    const celebrate = () => {
        if (blinkTimer) GLib.source_remove(blinkTimer);
        celebrating = true;
        setFinished(card, true);
        blinkTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2600, () => {
            blinkTimer = 0;
            celebrating = false;
            setFinished(card, false);
            // kalau tidak ada sesi aktif, jangan menggantung di layar
            if (!pomodoro.value.running && !pinned) scheduleHide(400);
            return GLib.SOURCE_REMOVE;
        });
    };

    const refresh = () => {
        const current = pomodoro.value;
        const total = Math.max(1, current.total);
        const done = Math.min(1, Math.max(0, (total - current.remaining) / total));
        time.label = clock(current.remaining);
        modeText.label = MODES[current.mode]?.label ?? '';
        stateText.label = current.running ? 'berjalan' : 'dijeda';
        play.child.label = current.running ? '⏸' : '▶';
        skip.child.label = NEXT_LABEL[current.mode] ?? 'Mode';
        bar.value = current.running || current.remaining < total ? done : 0;
    };

    const show = kind => {
        refresh();
        win.visible = true;
        const current = pomodoro.value;
        if (kind === 'done') {
            // sesi selesai: animasi + kartu menetap menunggu aksi berikutnya
            celebrate();
            pinned = true;
            clearHide();
            return;
        }
        pinned = false;
        // sesi aktif (jalan atau dijeda) = kartu menetap, tidak dijadwalkan hilang
        if (current.running || current.remaining < current.total) {
            clearHide();
            return;
        }
        scheduleHide(LINGER_AFTER_ACTION);
    };

    win.hook(pomodoroOsd, () => show(pomodoroOsd.value.kind));
    win.hook(pomodoro, () => {
        refresh();
        if (pomodoro.value.running) {
            pinned = false;
            clearHide();
            win.visible = true;
        }
    });

    win.connect('destroy', () => {
        if (hideTimer) GLib.source_remove(hideTimer);
        if (blinkTimer) GLib.source_remove(blinkTimer);
    });

    return win;
};
