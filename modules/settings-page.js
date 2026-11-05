import Gtk from 'gi://Gtk?version=3.0';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import { page } from '../state.js';
import { settings, saveSettings, OPTIONS } from './settings.js';

const ROW_W = 480;
const PANE_H = 148;

const MODULE_LABELS = [
    ['weather', 'Cuaca'],
    ['calendar', 'Kalender'],
    ['pomodoro', 'Pomodoro'],
    ['timer', 'Timer'],
    ['stats', 'Statistik'],
    ['water', 'Air'],
    ['todo', 'Tugas'],
    ['standup', 'Standup'],
    ['shelf', 'Shelf'],
    ['bluetooth', 'Bluetooth'],
    ['prayer', 'Sholat'],
    ['chat', 'Chat'],
];

const PAGE_LABELS = {
    idle: 'Ringkasan',
    weather: 'Cuaca',
    stats: 'Statistik',
    todo: 'Tugas',
};

const section = text => Widget.Label({
    className: 'dyn-island-settings-section',
    label: text,
    xalign: 0,
});

const row = (text, value, onClicked, on = false) => {
    const valueLabel = Widget.Label({
        className: `dyn-island-settings-value${on ? ' on' : ''}`,
        label: value,
        xalign: 1,
    });
    const button = Widget.Button({
        className: 'dyn-island-settings-row',
        child: Widget.CenterBox({
            startWidget: Widget.Label({
                className: 'dyn-island-settings-label',
                label: text,
                xalign: 0,
            }),
            endWidget: valueLabel,
        }),
        onClicked,
    });
    button.set_size_request(ROW_W, -1);
    return button;
};

export default () => {
    const list = Widget.Box({
        className: 'dyn-island-settings-list',
        vertical: true,
        spacing: 1,
    });
    const pane = Widget.Scrollable({
        className: 'dyn-island-settings-pane',
        hscroll: 'never',
        vscroll: 'external',
    });
    pane.child = list;
    pane.set_size_request(ROW_W, PANE_H);

    const scrollPane = event => {
        let dy = 0;
        try {
            const deltas = event.get_scroll_deltas?.();
            if (Array.isArray(deltas) && deltas[0]) dy = Number(deltas[2]) || 0;
        } catch (_) { }
        if (!dy) return false;
        const adjustment = pane.get_vadjustment();
        if (!adjustment) return false;
        const max = Math.max(0, adjustment.upper - adjustment.page_size);
        if (max <= 0) return false;
        adjustment.value = Math.max(0, Math.min(max, adjustment.value + dy * 36));
        return true;
    };
    pane.connect('scroll-event', (_self, event) => scrollPane(event));

    const cycleSize = () => {
        const current = settings.value.notch.size;
        const index = OPTIONS.sizes.indexOf(current);
        const next = OPTIONS.sizes[(index + 1) % OPTIONS.sizes.length];
        saveSettings({ notch: { size: next } });
    };

    const cyclePage = () => {
        const current = settings.value.defaultPage;
        const index = OPTIONS.pages.indexOf(current);
        const next = OPTIONS.pages[(index + 1) % OPTIONS.pages.length];
        saveSettings({ defaultPage: next });
    };

    const rebuild = () => {
        const value = settings.value;
        const rows = [
            section('TAMPILAN'),
            row('Glow cover', value.glow ? 'Aktif' : 'Nonaktif',
                () => saveSettings({ glow: !value.glow }), value.glow),
            row('Ukuran notch', OPTIONS.sizeLabel[value.notch.size] ?? 'Normal',
                cycleSize, false),
            row('Ikuti monitor fokus', value.notch.followFocus ? 'Aktif' : 'Tetap',
                () => saveSettings({ notch: { followFocus: !value.notch.followFocus } }),
                value.notch.followFocus),
            section('HALAMAN'),
            row('Halaman default', PAGE_LABELS[value.defaultPage] ?? 'Ringkasan',
                cyclePage, false),
            section('MODUL'),
        ];

        for (const [name, label] of MODULE_LABELS) {
            const on = value.modules[name] !== false;
            rows.push(row(label, on ? 'Aktif' : 'Nonaktif',
                () => saveSettings({ modules: { [name]: !on } }), on));
        }
        list.children = rows;
    };

    const title = Widget.Label({
        className: 'dyn-island-settings-title',
        label: 'Pengaturan',
        xalign: 0,
    });
    const note = Widget.Label({
        className: 'dyn-island-settings-note',
        label: 'modul/ukuran/monitor: restart AGS',
        xalign: 1,
    });
    const header = Widget.Box({
        className: 'dyn-island-settings-head',
        spacing: 8,
        children: [title, Widget.Label({ hexpand: true }), note],
    });
    header.set_size_request(ROW_W, -1);

    return Widget.Box({
        className: 'dyn-island-settings',
        vertical: true,
        spacing: 4,
        halign: Gtk.Align.CENTER,
        valign: Gtk.Align.CENTER,
        children: [header, pane],
        setup: self => {
            rebuild();
            self.hook(settings, rebuild);
            self.connect('map', () => {
                const top = self.get_toplevel();
                if (!top || top.__settingsScrollHooked) return;
                top.__settingsScrollHooked = true;
                top.connect('scroll-event', (_w, event) => {
                    if (page.value !== 'settings' || !pane.get_mapped()) return false;
                    return scrollPane(event);
                });
            });
        },
    });
};
