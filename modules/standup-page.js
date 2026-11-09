import Gtk from 'gi://Gtk?version=3.0';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import { standup } from './standup.js';

// Halaman ringkas di island: status pengisian + tiga chip progres + tombol
// membuka popup.
const makeChip = () => {
    const icon = Widget.Label({ className: 'dyn-island-standup-chip-icon' });
    const label = Widget.Label({ className: 'dyn-island-standup-chip-label' });
    const widget = Widget.Box({
        className: 'dyn-island-standup-chip',
        spacing: 8,
        valign: Gtk.Align.CENTER,
        children: [icon, label],
    });
    return { widget, icon, label };
};

export default () => {
    const bell = Widget.Label({ className: 'standup-page-bell', label: '\uf0f3' });
    const title = Widget.Label({ className: 'standup-page-title', label: 'Standup Harian', xalign: 0 });
    const sub = Widget.Label({ className: 'standup-page-sub', xalign: 0 });

    const openBtn = Widget.Button({
        className: 'dyn-island-pill',
        child: Widget.Label({ className: 'dyn-island-pill-label', label: 'Isi' }),
        onClicked: () => {
            try { globalThis.dynIsland?.standupWindow?.open?.(); } catch (_) { }
        },
    });

    const yesterday = makeChip();
    const today = makeChip();
    const blockers = makeChip();
    const chips = Widget.Box({
        className: 'dyn-island-standup-chips',
        spacing: 8,
        halign: Gtk.Align.CENTER,
        children: [yesterday.widget, today.widget, blockers.widget],
    });

    const setChip = (chip, state, text) => {
        chip.icon.label = state === 'done' ? '\uf00c'
            : state === 'warn' ? '\uf071' : '\uf10c';
        chip.icon.className = `dyn-island-standup-chip-icon${state === 'done' ? ' done' : state === 'warn' ? ' warn' : ''}`;
        chip.label.label = text;
    };

    const refresh = () => {
        const value = standup.value;
        const count = list => list?.length ?? 0;
        const y = count(value.yesterday);
        const t = count(value.today);
        const b = count(value.blockers);
        setChip(yesterday, y > 0 ? 'done' : 'empty', `Kemarin ${y}`);
        setChip(today, t > 0 ? 'done' : 'empty', `Hari ini ${t}`);
        setChip(blockers, b > 0 ? 'warn' : 'done', `Hambatan ${b}`);
        sub.label = value.dayLabel
            ? `${value.dayLabel}${value.saved ? ' · tersimpan' : ''}`
            : (value.saved ? 'Tersimpan' : 'Belum diisi');
        openBtn.child.label = value.saved ? 'Lihat' : 'Isi';
    };

    const top = Widget.Box({
        className: 'dyn-island-standup-top',
        spacing: 12,
        valign: Gtk.Align.CENTER,
        children: [
            bell,
            Widget.Box({ vertical: true, spacing: 4, children: [title, sub] }),
            Widget.Label({ hexpand: true }),
            openBtn,
        ],
    });

    return Widget.Box({
        className: 'standup-page',
        vertical: true,
        spacing: 4,
        valign: Gtk.Align.CENTER,
        children: [top, chips],
        setup: self => {
            refresh();
            self.hook(standup, refresh);
        },
    });
};
