import GLib from 'gi://GLib';
import Gdk from 'gi://Gdk?version=3.0';
import Gtk from 'gi://Gtk?version=3.0';
import App from 'resource:///com/github/Aylur/ags/app.js';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';
import CONFIG from '../config.js';
import { applyFocused } from './monitor.js';
import { calendar } from './calendar.js';
import { calendarNotes, addNote, updateNote, removeNote, isoDay, normalizeTime } from './calendar-notes.js';
import { calendarEvents, addEvent, updateEvent, removeEvent } from './calendar-events.js';
import { buildGrid, Legend, MONTHS } from './calendar-grid.js';
import { tabular } from './type.js';

const NAME = 'dyn-island-calendar';
const TOP_MARGIN = 64;
const WIN_W = 560;
const DETAIL_H = 140;
const DAY_FULL = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

const pad2 = value => String(value).padStart(2, '0');
const hhmm = epoch => {
    const date = new Date(epoch);
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
};
const defaultTime = () => `${pad2(Number(CONFIG.calendar?.noteDefaultHour ?? 8))}:00`;
const noteTime = note => note.time ?? defaultTime();
const dayTitle = date =>
    `${DAY_FULL[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;

const eventDays = () => {
    const days = new Set();
    for (const event of calendar.value.events ?? [])
        days.add(isoDay(new Date(event.start)));
    for (const day of Object.keys(calendarEvents.value))
        days.add(day);
    return days;
};
const noteDays = () => new Set(Object.keys(calendarNotes.value));

export default () => {
    const now = new Date();
    let viewYear = now.getFullYear();
    let viewMonth = now.getMonth();
    let selected = { year: viewYear, month: viewMonth, day: now.getDate() };
    let composerMode = null; // 'note' | 'event'
    let editingKind = null;  // 'note' | 'event'
    let editingId = null;
    let editDayKey = '';
    let deleting = null;     // { kind: 'note'|'event', id }

    const title = Widget.Label({ className: 'cal-title', xalign: 0 });
    const sub = Legend({ prefix: 'cal' });

    const todayButton = Widget.Button({
        className: 'cal-chip',
        child: Widget.Label({ className: 'cal-chip-label', label: 'Hari ini' }),
        onClicked: () => goToday(),
    });
    const prevButton = Widget.Button({
        className: 'cal-nav-btn',
        tooltipText: 'Bulan sebelumnya',
        child: Widget.Label({ className: 'cal-nav-label', label: '\uf053' }),
        onClicked: () => shiftMonth(-1),
    });
    const nextButton = Widget.Button({
        className: 'cal-nav-btn',
        tooltipText: 'Bulan berikutnya',
        child: Widget.Label({ className: 'cal-nav-label', label: '\uf054' }),
        onClicked: () => shiftMonth(1),
    });
    const closeButton = Widget.Button({
        className: 'cal-icon-btn',
        tooltipText: 'Tutup (Esc)',
        child: Widget.Label({ className: 'cal-icon-label', label: '\uf00d' }),
        onClicked: () => close(),
    });

    const header = Widget.Box({
        className: 'cal-head',
        spacing: 4,
        children: [
            Widget.Box({ vertical: true, spacing: 2, hexpand: true, children: [title, sub] }),
            todayButton,
            prevButton,
            nextButton,
            closeButton,
        ],
    });

    const { box: grid, render: renderGrid } = buildGrid({
        cellW: 64,
        cellH: 30,
        spacing: 4,
        prefix: 'cal',
        onSelect: (year, month, day) => {
            // Edit terikat ke hari lama: batalkan saat pindah hari.
            if (editingKind !== null) closeComposer();
            deleting = null;
            selected = { year, month, day };
            render();
        },
    });

    const selectedLabel = Widget.Label({ className: 'cal-selected', xalign: 0 });

    const detail = Widget.Box({ className: 'cal-detail', vertical: true, spacing: 4 });
    const detailScroll = Widget.Scrollable({
        className: 'cal-detail-scroll',
        hscroll: 'never',
        vscroll: 'automatic',
    });
    detailScroll.child = detail;
    detailScroll.set_size_request(-1, DETAIL_H);

    const timeEntry = Widget.Entry({
        className: 'cal-entry cal-time-entry',
        placeholderText: '09:00',
        maxLength: 5,
        widthChars: 5,
        tooltipText: 'Jam notifikasi (opsional)',
    });
    const timeIcon = Widget.Label({ className: 'cal-time-icon', label: '\uf017' });
    const textEntry = Widget.Entry({
        className: 'cal-entry cal-text-entry',
        placeholderText: 'Catatan atau jadwal…',
        hexpand: true,
    });
    const saveLabel = Widget.Label({ className: 'cal-add-label', label: 'Tambah' });
    const saveButton = Widget.Button({
        className: 'cal-add-btn',
        child: saveLabel,
        onClicked: () => submitNote(),
    });

    const eventTitleEntry = Widget.Entry({
        className: 'cal-entry cal-event-title',
        placeholderText: 'Judul acara…',
        hexpand: true,
    });
    const eventStartEntry = Widget.Entry({
        className: 'cal-entry cal-time-entry',
        placeholderText: '09:00',
        maxLength: 5,
        widthChars: 5,
        tooltipText: 'Jam mulai',
    });
    const eventEndEntry = Widget.Entry({
        className: 'cal-entry cal-time-entry',
        placeholderText: '10:00',
        maxLength: 5,
        widthChars: 5,
        tooltipText: 'Jam selesai (opsional)',
    });
    const eventSaveLabel = Widget.Label({ className: 'cal-add-label', label: 'Tambah' });
    const eventSaveButton = Widget.Button({
        className: 'cal-add-btn',
        child: eventSaveLabel,
        onClicked: () => submitEvent(),
    });
    const eventIcon = Widget.Label({ className: 'cal-time-icon', label: '\uf073' });
    const eventDash = Widget.Label({ className: 'cal-time-dash', label: '–' });

    const cancelButton = () => Widget.Button({
        className: 'cal-cancel-btn',
        child: Widget.Label({ className: 'cal-cancel-label', label: 'Batal' }),
        onClicked: () => closeComposer(),
    });
    const noteCancel = cancelButton();
    const eventCancel = cancelButton();

    const hint = Widget.Label({ className: 'cal-hint', xalign: 0, label: '' });
    hint.visible = false;
    hint.set_no_show_all(true);

    const addRow = Widget.Box({
        className: 'cal-add-row',
        spacing: 8,
        children: [timeIcon, timeEntry, textEntry, saveButton, noteCancel],
    });
    addRow.visible = false;
    addRow.set_no_show_all(true);

    const eventRow = Widget.Box({
        className: 'cal-add-row',
        spacing: 8,
        children: [
            eventIcon, eventTitleEntry, eventStartEntry, eventDash,
            eventEndEntry, eventSaveButton, eventCancel,
        ],
    });
    eventRow.visible = false;
    eventRow.set_no_show_all(true);

    const sectionAdd = (tooltip, onAdd) => Widget.Button({
        className: 'cal-section-add',
        tooltipText: tooltip,
        halign: Gtk.Align.END,
        child: Widget.Box({
            spacing: 4,
            children: [
                Widget.Label({ className: 'cal-section-add-icon', label: '\uf067' }),
                Widget.Label({ className: 'cal-section-add-label', label: 'Tambah' }),
            ],
        }),
        onClicked: onAdd,
    });
    const sectionHeader = (label, button) => Widget.CenterBox({
        className: 'cal-section-row',
        startWidget: Widget.Label({ className: 'cal-section', label, xalign: 0 }),
        endWidget: button,
    });

    const composerLabel = Widget.Label({ className: 'cal-composer-label', xalign: 0 });
    composerLabel.visible = false;
    composerLabel.set_no_show_all(true);

    const card = Widget.Box({
        className: 'cal-card',
        vertical: true,
        widthRequest: WIN_W,
        spacing: 8,
        children: [header, grid, selectedLabel, detailScroll,
            composerLabel, addRow, eventRow, hint],
    });

    const win = Widget.Window({
        name: NAME,
        className: 'cal-window',
        layer: 'overlay',
        anchor: ['top'],
        exclusivity: 'ignore',
        keymode: 'exclusive', // wajib: Entry hanya bisa diketik di window ini
        margins: [TOP_MARGIN, 0, 0, 0],
        visible: false,
        child: card,
    });

    let focusTimers = [];

    function clearFocusTimers() {
        for (const id of focusTimers) {
            try { GLib.source_remove(id); } catch (_) { }
        }
        focusTimers = [];
    }

    function focusTarget() {
        clearFocusTimers();
        const target = composerMode === 'note' ? textEntry
            : composerMode === 'event' ? eventTitleEntry
                : todayButton;
        for (const delay of [0, 60, 180, 400]) {
            let id = 0;
            id = Utils.timeout(delay, () => {
                focusTimers = focusTimers.filter(timer => timer !== id);
                try { target.grab_focus(); } catch (_) { }
            });
            focusTimers.push(id);
        }
    }

    function openNoteComposer(note = null, key = null) {
        composerMode = 'note';
        editingKind = 'note';
        editingId = note ? note.id : null;
        editDayKey = note ? (key ?? '') : '';
        deleting = null;
        timeEntry.text = note?.time ?? '';
        textEntry.text = note?.text ?? '';
        saveLabel.label = note ? 'Simpan' : 'Tambah';
        composerLabel.label = note ? 'EDIT CATATAN' : 'CATATAN BARU';
        composerLabel.visible = true;
        composerLabel.show();
        eventRow.visible = false;
        addRow.visible = true;
        addRow.show();
        clearHint();
        focusTarget();
    }

    function openEventComposer(event = null, key = null) {
        composerMode = 'event';
        editingKind = 'event';
        editingId = event ? event.id : null;
        editDayKey = event ? (key ?? '') : '';
        deleting = null;
        eventTitleEntry.text = event?.title ?? '';
        eventStartEntry.text = event?.time ?? '';
        eventEndEntry.text = event?.end ?? '';
        eventSaveLabel.label = event ? 'Simpan' : 'Tambah';
        composerLabel.label = event ? 'EDIT ACARA' : 'ACARA BARU';
        composerLabel.visible = true;
        composerLabel.show();
        addRow.visible = false;
        eventRow.visible = true;
        eventRow.show();
        clearHint();
        focusTarget();
    }

    function closeComposer() {
        composerMode = null;
        editingKind = null;
        editingId = null;
        editDayKey = '';
        timeEntry.text = '';
        textEntry.text = '';
        eventTitleEntry.text = '';
        eventStartEntry.text = '';
        eventEndEntry.text = '';
        addRow.visible = false;
        eventRow.visible = false;
        composerLabel.visible = false;
        clearHint();
        focusTarget();
    }

    function shiftMonth(delta) {
        const next = new Date(viewYear, viewMonth + delta, 1);
        viewYear = next.getFullYear();
        viewMonth = next.getMonth();
        const lastDay = new Date(viewYear, viewMonth + 1, 0).getDate();
        selected = { year: viewYear, month: viewMonth, day: Math.min(selected.day, lastDay) };
        render();
    }

    function goToday() {
        const today = new Date();
        viewYear = today.getFullYear();
        viewMonth = today.getMonth();
        selected = { year: viewYear, month: viewMonth, day: today.getDate() };
        render();
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

    const confirmRow = (text, onConfirm) => Widget.Box({
        className: 'cal-delete-confirm',
        spacing: 8,
        children: [
            Widget.Label({
                className: 'cal-delete-text',
                label: text,
                xalign: 0,
                hexpand: true,
            }),
            Widget.Button({
                className: 'cal-chip',
                child: Widget.Label({ className: 'cal-chip-label', label: 'Batal' }),
                onClicked: () => { deleting = null; render(); },
            }),
            Widget.Button({
                className: 'cal-delete-ok',
                child: Widget.Label({ className: 'cal-delete-ok-label', label: 'Hapus' }),
                onClicked: onConfirm,
            }),
        ],
    });

    const icalRow = event => Widget.Box({
        className: 'cal-detail-row',
        spacing: 8,
        children: [
            tabular(Widget.Label({
                className: 'cal-detail-time',
                label: event.allDay ? 'Sehari' : hhmm(event.start),
            })),
            Widget.Label({
                className: 'cal-detail-text',
                label: String(event.title ?? 'Acara'),
                xalign: 0,
                hexpand: true,
                wrap: true,
                maxWidthChars: 46,
            }),
            Widget.Label({ className: 'cal-detail-badge', label: 'iCal' }),
        ],
    });

    const localEventRow = (key, event) => {
        if (deleting?.kind === 'event' && deleting.id === event.id) {
            return confirmRow('Hapus acara ini?', () => {
                removeEvent(key, event.id);
                deleting = null;
                render();
            });
        }

        const editButton = Widget.Button({
            className: 'cal-note-action',
            tooltipText: 'Edit acara',
            child: Widget.Label({ className: 'cal-note-action-icon', label: '\uf044' }),
            onClicked: () => openEventComposer(event, key),
        });
        const deleteButton = Widget.Button({
            className: 'cal-note-action is-danger',
            tooltipText: 'Hapus acara',
            child: Widget.Label({ className: 'cal-note-action-icon', label: '\uf1f8' }),
            onClicked: () => { deleting = { kind: 'event', id: event.id }; render(); },
        });

        return Widget.Box({
            className: 'cal-note-row',
            spacing: 8,
            children: [
                tabular(Widget.Label({
                    className: 'cal-detail-time',
                    label: event.end ? `${event.time}–${event.end}` : event.time,
                })),
                Widget.Label({
                    className: 'cal-note-text',
                    label: event.title,
                    xalign: 0,
                    hexpand: true,
                    wrap: true,
                    maxWidthChars: 34,
                }),
                editButton,
                deleteButton,
            ],
        });
    };

    const noteRow = (key, note) => {
        if (deleting?.kind === 'note' && deleting.id === note.id) {
            return confirmRow('Hapus catatan ini?', () => {
                removeNote(key, note.id);
                deleting = null;
                render();
            });
        }

        const editButton = Widget.Button({
            className: 'cal-note-action',
            tooltipText: 'Edit catatan',
            child: Widget.Label({ className: 'cal-note-action-icon', label: '\uf044' }),
            onClicked: () => openNoteComposer(note, key),
        });
        const deleteButton = Widget.Button({
            className: 'cal-note-action is-danger',
            tooltipText: 'Hapus catatan',
            child: Widget.Label({ className: 'cal-note-action-icon', label: '\uf1f8' }),
            onClicked: () => { deleting = { kind: 'note', id: note.id }; render(); },
        });

        return Widget.Box({
            className: 'cal-note-row',
            spacing: 8,
            children: [
                tabular(Widget.Label({
                    className: 'cal-detail-time',
                    label: noteTime(note),
                })),
                Widget.Label({
                    className: 'cal-note-text',
                    label: note.text,
                    xalign: 0,
                    hexpand: true,
                    wrap: true,
                    maxWidthChars: 34,
                }),
                editButton,
                deleteButton,
            ],
        });
    };

    function render() {
        title.label = `${MONTHS[viewMonth]} ${viewYear}`;
        renderGrid({
            year: viewYear,
            month: viewMonth,
            selected,
            eventDays: eventDays(),
            noteDays: noteDays(),
        });

        const date = new Date(selected.year, selected.month, selected.day);
        const key = isoDay(date);
        selectedLabel.label = dayTitle(date);

        const events = (calendar.value.events ?? [])
            .filter(event => isoDay(new Date(event.start)) === key)
            .sort((a, b) => a.start - b.start);
        const localEvents = calendarEvents.value[key] ?? [];
        const notes = calendarNotes.value[key] ?? [];
        const rows = [];

        rows.push(sectionHeader('ACARA',
            sectionAdd('Tambah acara', () => openEventComposer())));
        const merged = [
            ...events.map(event => ({
                kind: 'ical',
                sort: event.allDay ? '00:00' : hhmm(event.start),
                event,
            })),
            ...localEvents.map(event => ({
                kind: 'local',
                sort: event.time,
                event,
            })),
        ].sort((a, b) => a.sort.localeCompare(b.sort));
        if (merged.length) {
            rows.push(...merged.map(entry => entry.kind === 'ical'
                ? icalRow(entry.event)
                : localEventRow(key, entry.event)));
        } else {
            rows.push(Widget.Label({
                className: 'cal-empty',
                label: 'Belum ada acara.',
                xalign: 0,
            }));
        }

        rows.push(sectionHeader('CATATAN',
            sectionAdd('Tambah catatan', () => openNoteComposer())));
        if (notes.length) {
            rows.push(...notes.map(note => noteRow(key, note)));
        } else {
            rows.push(Widget.Label({
                className: 'cal-empty',
                label: 'Belum ada catatan.',
                xalign: 0,
            }));
        }
        detail.children = rows;
        // Tinggi detail mengikuti isi, dibatasi DETAIL_H agar tetap bisa
        // di-scroll kalau catatan banyak.
        const wanted = detail.get_preferred_height()[1];
        detailScroll.set_size_request(-1, Math.min(DETAIL_H, Math.max(40, wanted)));
    }

    function submitNote() {
        const text = String(textEntry.text ?? '').trim();
        if (!text) {
            showHint('Tulis catatan dulu.');
            return;
        }
        const rawTime = String(timeEntry.text ?? '').trim();
        const time = rawTime ? normalizeTime(rawTime) : null;
        if (rawTime && !time) {
            showHint('Format jam harus HH:MM.');
            return;
        }
        if (editingKind === 'note' && editingId !== null && editDayKey) {
            updateNote(editDayKey, editingId, text, time);
        } else {
            const key = isoDay(new Date(selected.year, selected.month, selected.day));
            addNote(key, text, time);
        }
        closeComposer();
        render();
    }

    function submitEvent() {
        const title = String(eventTitleEntry.text ?? '').trim();
        if (!title) {
            showHint('Isi judul acara.');
            return;
        }
        const start = normalizeTime(eventStartEntry.text);
        if (!start) {
            showHint('Isi jam mulai (HH:MM).');
            return;
        }
        const rawEnd = String(eventEndEntry.text ?? '').trim();
        const end = rawEnd ? normalizeTime(rawEnd) : null;
        if (rawEnd && !end) {
            showHint('Format jam selesai harus HH:MM.');
            return;
        }
        if (end && end <= start) {
            showHint('Jam selesai harus setelah jam mulai.');
            return;
        }
        if (editingKind === 'event' && editingId !== null && editDayKey) {
            updateEvent(editDayKey, editingId, title, start, end);
        } else {
            const key = isoDay(new Date(selected.year, selected.month, selected.day));
            addEvent(key, title, start, end);
        }
        closeComposer();
        render();
    }

    async function open(day = new Date(), compose = false) {
        const date = day instanceof Date && !Number.isNaN(day.getTime()) ? day : new Date();
        viewYear = date.getFullYear();
        viewMonth = date.getMonth();
        selected = { year: viewYear, month: viewMonth, day: date.getDate() };
        composerMode = null;
        editingKind = null;
        editingId = null;
        editDayKey = '';
        deleting = null;
        timeEntry.text = '';
        textEntry.text = '';
        eventTitleEntry.text = '';
        eventStartEntry.text = '';
        eventEndEntry.text = '';
        addRow.visible = false;
        eventRow.visible = false;
        clearHint();
        render();
        try { await globalThis.dynIsland?.suppressNav?.(true); } catch (_) { }
        applyFocused(win, () => { }).catch(() => { });
        App.openWindow(NAME);
        if (compose) openNoteComposer();
        else focusTarget();
    }

    function close() {
        clearFocusTimers();
        App.closeWindow(NAME);
        try { globalThis.dynIsland?.suppressNav?.(false); } catch (_) { }
    }

    const onKey = (_widget, event) => {
        if (event.get_keyval() !== Gdk.KEY_Escape) return false;
        if (deleting) {
            deleting = null;
            render();
            return true;
        }
        if (composerMode) {
            closeComposer();
            return true;
        }
        close();
        return true;
    };
    win.connect('key-press-event', onKey);
    for (const entry of [timeEntry, textEntry, eventTitleEntry, eventStartEntry, eventEndEntry])
        entry.connect('key-press-event', onKey);

    timeEntry.connect('activate', () => submitNote());
    textEntry.connect('activate', () => submitNote());
    eventTitleEntry.connect('activate', () => submitEvent());
    eventStartEntry.connect('activate', () => submitEvent());
    eventEndEntry.connect('activate', () => submitEvent());

    win.connect('map', () => { render(); focusTarget(); });
    win.connect('unmap', () => clearFocusTimers());
    win.hook(calendar, () => { if (win.visible) render(); });
    win.hook(calendarNotes, () => { if (win.visible) render(); });
    win.hook(calendarEvents, () => { if (win.visible) render(); });

    render();

    globalThis.calendarWindow = {
        open,
        close,
        toggle: () => (win.visible ? close() : open()),
        win,
        textEntry,
        timeEntry,
        eventTitleEntry,
    };

    return win;
};
