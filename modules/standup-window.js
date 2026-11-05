import GLib from 'gi://GLib';
import Gdk from 'gi://Gdk?version=3.0';
import Gtk from 'gi://Gtk?version=3.0';
import App from 'resource:///com/github/Aylur/ags/app.js';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';
import { applyFocused } from './monitor.js';
import {
    addItem, BLOCKER_TITLE, loadStandup, removeItem, saveStandup, standup, TODAY_TITLE,
} from './standup.js';

// Popup Daily Standup: tiga daftar (kemarin / hari ini / blocker). Dibuka dari
// notifikasi jam 10:00 atau dari halaman standup di island.

const NAME = 'dyn-island-standup';
const TOP_MARGIN = 64;
const MAX_LIST_HEIGHT = 132;

const SECTIONS = [
    { key: 'yesterday', title: () => standup.value.yesterdayTitle, placeholder: 'Tambah poin kemarin…' },
    { key: 'today', title: () => TODAY_TITLE, placeholder: 'Tambah rencana hari ini…' },
    { key: 'blockers', title: () => BLOCKER_TITLE, placeholder: 'Tambah blocker (kalau ada)…' },
];

export default () => {
    const entries = [];

    const buildSection = ({ key, title, placeholder }) => {
        const titleLabel = Widget.Label({ className: 'standup-section-title', xalign: 0 });
        const items = Widget.Box({ className: 'standup-items', vertical: true, spacing: 4 });
        const pane = Widget.Scrollable({
            className: 'standup-list-pane',
            hscroll: 'never',
            vscroll: 'automatic',
            propagateNaturalHeight: false,
        });
        pane.child = items;
        pane.set_overlay_scrolling(false);
        const syncPaneHeight = () => {
            let natural = 0;
            try { natural = items.get_preferred_height()[1]; } catch (_) { }
            const height = Math.min(MAX_LIST_HEIGHT, Math.max(0, natural));
            if (pane.get_allocated_height() !== height)
                pane.set_size_request(-1, height);
        };

        const entry = Widget.Entry({
            className: 'standup-entry',
            hexpand: true,
            placeholderText: placeholder,
        });
        entries.push(entry);

        const submit = () => {
            if (addItem(key, entry.text)) entry.text = '';
        };
        entry.connect('activate', submit);

        const add = Widget.Button({
            className: 'standup-add',
            child: Widget.Label({ label: '+' }),
            onClicked: submit,
        });

        const widget = Widget.Box({
            className: 'standup-section',
            vertical: true,
            spacing: 6,
            children: [
                titleLabel,
                pane,
                Widget.Box({ className: 'standup-input-row', spacing: 6, children: [entry, add] }),
            ],
        });

        const rebuild = () => {
            titleLabel.label = title();
            const list = standup.value[key] || [];
            items.children = list.map((text, index) => Widget.Box({
                className: 'standup-item',
                spacing: 8,
                children: [
                    Widget.Label({ className: 'standup-bullet', label: '•' }),
                    Widget.Label({
                        className: 'standup-item-text',
                        label: text,
                        xalign: 0,
                        hexpand: true,
                        wrap: true,
                        maxWidthChars: 52,
                    }),
                    Widget.Button({
                        className: 'standup-remove',
                        child: Widget.Label({ label: '\uf00d' }),
                        onClicked: () => removeItem(key, index),
                    }),
                ],
            }));
            pane.visible = list.length > 0;
            Utils.idle(syncPaneHeight);
        };

        return { widget, rebuild, entry };
    };

    const sections = SECTIONS.map(buildSection);

    const title = Widget.Label({ className: 'standup-title', label: 'Daily Standup', xalign: 0 });
    const day = Widget.Label({ className: 'standup-day', xalign: 0 });
    const status = Widget.Label({ className: 'standup-status', label: '' });

    const closeBtn = Widget.Button({
        className: 'standup-icon-btn',
        child: Widget.Label({ label: '\uf00d' }),
        onClicked: () => close(),
    });

    const saveBtn = Widget.Button({
        className: 'standup-save',
        child: Widget.Label({ label: 'Simpan' }),
        onClicked: () => {
            saveStandup();
            status.label = 'Tersimpan \uf00c';
            Utils.timeout(700, () => close());
        },
    });

    const dismissBtn = Widget.Button({
        className: 'standup-dismiss',
        child: Widget.Label({ label: 'Tutup' }),
        onClicked: () => close(),
    });

    const card = Widget.Box({
        className: 'standup-card',
        vertical: true,
        widthRequest: 560,
        spacing: 12,
        children: [
            Widget.Box({
                className: 'standup-head',
                spacing: 10,
                children: [
                    Widget.Box({
                        vertical: true,
                        spacing: 1,
                        children: [title, day],
                    }),
                    Widget.Label({ hexpand: true }),
                    closeBtn,
                ],
            }),
            ...sections.map(section => section.widget),
            Widget.Box({
                className: 'standup-foot',
                spacing: 8,
                children: [
                    status,
                    Widget.Label({ hexpand: true }),
                    dismissBtn,
                    saveBtn,
                ],
            }),
        ],
    });

    const win = Widget.Window({
        name: NAME,
        className: 'standup-window',
        layer: 'overlay',
        anchor: ['top'],
        exclusivity: 'ignore',
        keymode: 'exclusive',
        margins: [TOP_MARGIN, 0, 0, 0],
        visible: false,
        child: card,
    });

    let focusTimers = [];
    const clearFocusTimers = () => {
        for (const id of focusTimers) {
            try { GLib.source_remove(id); } catch (_) { }
        }
        focusTimers = [];
    };

    const focusFirstEmpty = () => {
        clearFocusTimers();
        const target = entries[1] || entries[0];
        for (const delay of [0, 60, 180, 400]) {
            let id = 0;
            id = Utils.timeout(delay, () => {
                focusTimers = focusTimers.filter(timer => timer !== id);
                try { target?.grab_focus(); } catch (_) { }
            });
            focusTimers.push(id);
        }
    };

    const refresh = () => {
        day.label = standup.value.dayLabel || '';
        for (const section of sections) section.rebuild();
        status.label = standup.value.saved ? 'Sudah tersimpan hari ini' : '';
    };

    const open = async () => {
        loadStandup();
        refresh();
        try { await globalThis.dynIsland?.suppressNav?.(true); } catch (_) { }
        applyFocused(win, () => { }).catch(() => { });
        App.openWindow(NAME);
        focusFirstEmpty();
    };

    const close = () => {
        clearFocusTimers();
        App.closeWindow(NAME);
        try { globalThis.dynIsland?.suppressNav?.(false); } catch (_) { }
    };

    const onKey = (_widget, event) => {
        if (event.get_keyval() === Gdk.KEY_Escape) {
            close();
            return true;
        }
        return false;
    };

    win.connect('key-press-event', onKey);
    for (const entry of entries) entry.connect('key-press-event', onKey);

    win.connect('map', () => {
        refresh();
        focusFirstEmpty();
    });
    win.connect('unmap', () => clearFocusTimers());

    // limit tinggi daftar ditangani per-section oleh pane di buildSection;
    // jangan set seluruh section ke -1 (itu no-op dan tidak membatasi apa pun).

    globalThis.standupWindow = {
        open,
        close,
        toggle: () => (win.visible ? close() : open()),
        win,
    };

    win.hook(standup, () => {
        if (win.visible) refresh();
    });

    return win;
};
