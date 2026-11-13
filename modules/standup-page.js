import Gtk from 'gi://Gtk?version=3.0';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import { standup } from './standup.js';

const summaryItem = () => {
    const icon = Widget.Label({ className: 'standup-page-summary-icon' });
    const text = Widget.Label({ className: 'standup-page-summary-text' });
    const widget = Widget.Box({
        spacing: 6,
        valign: Gtk.Align.CENTER,
        children: [icon, text],
    });
    return { widget, icon, text };
};

export default () => {
    const title = Widget.Label({
        className: 'standup-page-title',
        label: 'Standup',
        xalign: 0,
    });
    const sub = Widget.Label({
        className: 'standup-page-sub',
        xalign: 0,
    });
    const openButton = Widget.Button({
        className: 'standup-page-open',
        tooltipText: 'Buka form Daily Standup',
        child: Widget.Label({
            className: 'standup-page-open-label',
            label: 'Isi',
        }),
        onClicked: () => {
            try { globalThis.dynIsland?.standupWindow?.open?.(); } catch (_) { }
        },
    });

    const header = Widget.Box({
        className: 'standup-page-header',
        spacing: 8,
        valign: Gtk.Align.CENTER,
        children: [
            Widget.Box({
                vertical: true,
                spacing: 2,
                children: [title, sub],
            }),
            Widget.Label({ hexpand: true }),
            openButton,
        ],
    });

    const yesterday = summaryItem();
    const today = summaryItem();
    const blockers = summaryItem();
    const summary = Widget.Box({
        className: 'standup-page-summary',
        spacing: 20,
        children: [yesterday.widget, today.widget, blockers.widget],
    });

    const setItem = (item, state, text) => {
        item.icon.label = state === 'done' ? '\uf00c'
            : state === 'warn' ? '\uf071' : '\uf10c';
        item.icon.className = 'standup-page-summary-icon'
            + (state === 'done' ? ' done' : state === 'warn' ? ' warn' : '');
        item.text.label = text;
    };

    const refresh = () => {
        const value = standup.value;
        const count = list => list?.length ?? 0;
        const y = count(value.yesterday);
        const t = count(value.today);
        const b = count(value.blockers);

        setItem(yesterday, y > 0 ? 'done' : 'empty', `Kemarin ${y}`);
        setItem(today, t > 0 ? 'done' : 'empty', `Hari ini ${t}`);
        setItem(blockers, b > 0 ? 'warn' : 'done', `Hambatan ${b}`);

        const day = value.dayLabel ?? '';
        const status = value.saved ? 'tersimpan' : 'belum diisi';
        sub.label = day ? `${day} · ${status}` : status;
        openButton.child.label = value.saved ? 'Lihat' : 'Isi';
    };

    return Widget.Box({
        className: 'dyn-island-standup-page',
        vertical: true,
        spacing: 8,
        valign: Gtk.Align.CENTER,
        children: [header, summary],
        setup: self => {
            refresh();
            self.hook(standup, refresh);
        },
    });
};
