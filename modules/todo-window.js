import GLib from 'gi://GLib';
import Gdk from 'gi://Gdk?version=3.0';
import Gtk from 'gi://Gtk?version=3.0';
import App from 'resource:///com/github/Aylur/ags/app.js';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';
import { applyFocused } from './monitor.js';
import { addTaskWithDue, updateTask, normalizeDue } from './todo.js';

const NAME = 'dyn-island-todo-editor';
const TOP_MARGIN = 64;

export default () => {
    let editingId = null;
    let focusTimers = [];

    const title = Widget.Label({
        className: 'todo-editor-title',
        label: 'Tugas baru',
        xalign: 0,
        hexpand: true,
    });
    const closeButton = Widget.Button({
        className: 'todo-editor-close',
        tooltipText: 'Tutup (Esc)',
        child: Widget.Label({ className: 'todo-editor-close-icon', label: '\uf00d' }),
        onClicked: () => close(),
    });
    const header = Widget.Box({
        className: 'todo-editor-head',
        spacing: 8,
        children: [title, closeButton],
    });

    const textLabel = Widget.Label({
        className: 'todo-field-label',
        label: 'Tugas',
        xalign: 0,
    });
    const textEntry = Widget.Entry({
        className: 'todo-entry',
        placeholderText: 'Apa yang perlu dikerjakan?',
        hexpand: true,
    });
    const dueEntry = Widget.Entry({
        className: 'todo-entry todo-time-entry',
        placeholderText: 'HH:MM',
        maxLength: 5,
        widthChars: 5,
        tooltipText: 'Jam pengingat, opsional',
    });
    const dueIcon = Widget.Label({ className: 'todo-field-icon', label: '\uf017' });
    const dueLabel = Widget.Label({
        className: 'todo-field-label',
        label: 'Jatuh tempo (opsional)',
    });
    const dueRow = Widget.Box({
        className: 'todo-field-row',
        spacing: 8,
        valign: Gtk.Align.CENTER,
        children: [dueIcon, dueEntry, dueLabel],
    });

    const hint = Widget.Label({ className: 'todo-hint', xalign: 0 });
    hint.visible = false;
    hint.set_no_show_all(true);

    const cancelButton = Widget.Button({
        className: 'todo-cancel',
        child: Widget.Label({ className: 'todo-cancel-label', label: 'Batal' }),
        onClicked: () => close(),
    });
    const saveLabel = Widget.Label({
        className: 'todo-save-label',
        label: 'Tambah',
    });
    const saveButton = Widget.Button({
        className: 'todo-save',
        child: saveLabel,
        onClicked: () => submit(),
    });
    const actions = Widget.Box({
        className: 'todo-actions',
        spacing: 8,
        halign: Gtk.Align.END,
        children: [cancelButton, saveButton],
    });

    const card = Widget.Box({
        className: 'todo-card',
        vertical: true,
        widthRequest: 380,
        spacing: 8,
        children: [header, textLabel, textEntry, dueRow, hint, actions],
    });

    const win = Widget.Window({
        name: NAME,
        className: 'todo-window',
        layer: 'overlay',
        anchor: ['top'],
        exclusivity: 'ignore',
        keymode: 'exclusive', // wajib: Entry hanya bisa diketik di window ini
        margins: [TOP_MARGIN, 0, 0, 0],
        visible: false,
        child: card,
    });

    function clearFocusTimers() {
        for (const id of focusTimers) {
            try { GLib.source_remove(id); } catch (_) { }
        }
        focusTimers = [];
    }

    function focusText() {
        clearFocusTimers();
        for (const delay of [0, 60, 180, 400]) {
            let id = 0;
            id = Utils.timeout(delay, () => {
                focusTimers = focusTimers.filter(timer => timer !== id);
                try { textEntry.grab_focus(); } catch (_) { }
            });
            focusTimers.push(id);
        }
    }

    function showHint(message) {
        hint.label = message;
        hint.visible = true;
        hint.show();
    }

    function clearHint() {
        hint.label = '';
        hint.visible = false;
    }

    function submit() {
        const text = String(textEntry.text ?? '').trim();
        if (!text) {
            showHint('Tulis tugas dulu.');
            try { textEntry.grab_focus(); } catch (_) { }
            return;
        }
        const rawDue = String(dueEntry.text ?? '').trim();
        const due = normalizeDue(rawDue);
        if (rawDue && !due) {
            showHint('Format jam harus HH:MM.');
            try { dueEntry.grab_focus(); } catch (_) { }
            return;
        }
        if (editingId !== null) {
            if (!updateTask(editingId, text, due)) {
                showHint('Tugas sudah tidak ada.');
                return;
            }
        } else if (!addTaskWithDue(text, due)) {
            showHint('Tugas tidak bisa disimpan.');
            return;
        }
        close();
    }

    async function open(task = null) {
        editingId = task?.id ?? null;
        title.label = task ? 'Edit tugas' : 'Tugas baru';
        saveLabel.label = task ? 'Simpan' : 'Tambah';
        textEntry.text = task?.text ?? '';
        dueEntry.text = task?.due ?? '';
        clearHint();
        try { await globalThis.dynIsland?.suppressNav?.(true); } catch (_) { }
        applyFocused(win, () => { }).catch(() => { });
        App.openWindow(NAME);
        focusText();
    }

    function close() {
        clearFocusTimers();
        App.closeWindow(NAME);
        try { globalThis.dynIsland?.suppressNav?.(false); } catch (_) { }
    }

    const onKey = (_widget, event) => {
        if (event.get_keyval() !== Gdk.KEY_Escape) return false;
        close();
        return true;
    };
    win.connect('key-press-event', onKey);
    for (const entry of [textEntry, dueEntry])
        entry.connect('key-press-event', onKey);

    textEntry.connect('activate', () => submit());
    dueEntry.connect('activate', () => submit());
    win.connect('map', () => focusText());
    win.connect('unmap', () => clearFocusTimers());

    globalThis.todoWindow = {
        open,
        close,
        toggle: () => (win.visible ? close() : open()),
        submit,
        win,
        textEntry,
        dueEntry,
    };

    return win;
};
