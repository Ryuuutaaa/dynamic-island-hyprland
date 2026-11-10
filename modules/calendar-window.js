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
    return days;
};
const noteDays = () => new Set(Object.keys(calendarNotes.value));

export default () => {
    const now = new Date();
    let viewYear = now.getFullYear();
    let viewMonth = now.getMonth();
    let selected = { year: viewYear, month: viewMonth, day: now.getDate() };
    let composerOpen = false;
    let editingId = null;
    let editDayKey = '';
    let deletingId = null;

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
            if (editingId !== null) closeComposer();
            deletingId = null;
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
        onClicked: () => submit(),
    });
    const cancelButton = Widget.Button({
        className: 'cal-cancel-btn',
        child: Widget.Label({ className: 'cal-cancel-label', label: 'Batal' }),
        onClicked: () => closeComposer(),
    });
    const hint = Widget.Label({ className: 'cal-hint', xalign: 0, label: '' });
    hint.visible = false;
    hint.set_no_show_all(true);

    const addRow = Widget.Box({
        className: 'cal-add-row',
        spacing: 8,
        children: [timeIcon, timeEntry, textEntry, saveButton, cancelButton],
    });
    addRow.visible = false;
    addRow.set_no_show_all(true);

    // Aksi tambah yang jelas; composer baru muncul setelah diklik.
    const addTrigger = Widget.Button({
        className: 'cal-add-trigger',
        hexpand: true,
        child: Widget.Box({
            spacing: 6,
            halign: Gtk.Align.CENTER,
            children: [
                Widget.Label({ className: 'cal-add-trigger-icon', label: '\uf067' }),
                Widget.Label({ className: 'cal-add-trigger-label', label: 'Tambah catatan' }),
            ],
        }),
        onClicked: () => openComposer(),
    });

    const card = Widget.Box({
        className: 'cal-card',
        vertical: true,
        widthRequest: WIN_W,
        spacing: 8,
        children: [header, grid, selectedLabel, detailScroll, addTrigger, addRow, hint],
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
        const target = composerOpen ? textEntry : addTrigger;
        for (const delay of [0, 60, 180, 400]) {
            let id = 0;
            id = Utils.timeout(delay, () => {
                focusTimers = focusTimers.filter(timer => timer !== id);
                try { target.grab_focus(); } catch (_) { }
            });
            focusTimers.push(id);
        }
    }

    function openComposer(note = null, key = null) {
        composerOpen = true;
        editingId = note ? note.id : null;
        editDayKey = note ? (key ?? '') : '';
        deletingId = null;
        timeEntry.text = note?.time ?? '';
        textEntry.text = note?.text ?? '';
        saveLabel.label = note ? 'Simpan' : 'Tambah';
        addTrigger.visible = false;
        addRow.visible = true;
        addRow.show();
        clearHint();
        focusTarget();
    }

    function closeComposer() {
        composerOpen = false;
        editingId = null;
        editDayKey = '';
        timeEntry.text = '';
        textEntry.text = '';
        addRow.visible = false;
        addTrigger.visible = true;
        addTrigger.show();
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

    const eventRow = event => Widget.Box({
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
                maxWidthChars: 48,
            }),
        ],
    });

    const noteRow = (key, note) => {
        if (deletingId === note.id) {
            return Widget.Box({
                className: 'cal-delete-confirm',
                spacing: 8,
                children: [
                    Widget.Label({
                        className: 'cal-delete-text',
                        label: 'Hapus catatan ini?',
                        xalign: 0,
                        hexpand: true,
                    }),
                    Widget.Button({
                        className: 'cal-chip',
                        child: Widget.Label({ className: 'cal-chip-label', label: 'Batal' }),
                        onClicked: () => { deletingId = null; render(); },
                    }),
                    Widget.Button({
                        className: 'cal-delete-ok',
                        child: Widget.Label({ className: 'cal-delete-ok-label', label: 'Hapus' }),
                        onClicked: () => {
                            removeNote(key, note.id);
                            deletingId = null;
                            render();
                        },
                    }),
                ],
            });
        }

        const editButton = Widget.Button({
            className: 'cal-note-action',
            tooltipText: 'Edit catatan',
            child: Widget.Label({ className: 'cal-note-action-icon', label: '\uf044' }),
            onClicked: () => openComposer(note, key),
        });
        const deleteButton = Widget.Button({
            className: 'cal-note-action is-danger',
            tooltipText: 'Hapus catatan',
            child: Widget.Label({ className: 'cal-note-action-icon', label: '\uf1f8' }),
            onClicked: () => { deletingId = note.id; render(); },
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
                    maxWidthChars: 38,
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
        const notes = calendarNotes.value[key] ?? [];
        const rows = [];
        if (events.length) {
            rows.push(Widget.Label({ className: 'cal-section', label: 'ACARA', xalign: 0 }));
            rows.push(...events.map(eventRow));
        }
        rows.push(Widget.Label({ className: 'cal-section', label: 'CATATAN', xalign: 0 }));
        if (notes.length) {
            rows.push(...notes.map(note => noteRow(key, note)));
        } else {
            rows.push(Widget.Label({
                className: 'cal-empty',
                label: 'Belum ada catatan. Tambahkan di bawah.',
                xalign: 0,
            }));
        }
        detail.children = rows;
        // Tinggi detail mengikuti isi, dibatasi DETAIL_H agar tetap bisa
        // di-scroll kalau catatan banyak.
        const wanted = detail.get_preferred_height()[1];
        detailScroll.set_size_request(-1, Math.min(DETAIL_H, Math.max(40, wanted)));
    }

    function submit() {
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
        if (editingId !== null && editDayKey) {
            updateNote(editDayKey, editingId, text, time);
        } else {
            const key = isoDay(new Date(selected.year, selected.month, selected.day));
            addNote(key, text, time);
        }
        closeComposer();
        render();
    }

    async function open(day = new Date(), compose = false) {
        const date = day instanceof Date && !Number.isNaN(day.getTime()) ? day : new Date();
        viewYear = date.getFullYear();
        viewMonth = date.getMonth();
        selected = { year: viewYear, month: viewMonth, day: date.getDate() };
        composerOpen = false;
        editingId = null;
        editDayKey = '';
        deletingId = null;
        timeEntry.text = '';
        textEntry.text = '';
        addRow.visible = false;
        addTrigger.visible = true;
        addTrigger.show();
        clearHint();
        render();
        try { await globalThis.dynIsland?.suppressNav?.(true); } catch (_) { }
        applyFocused(win, () => { }).catch(() => { });
        App.openWindow(NAME);
        if (compose) openComposer();
        else focusTarget();
    }

    function close() {
        clearFocusTimers();
        App.closeWindow(NAME);
        try { globalThis.dynIsland?.suppressNav?.(false); } catch (_) { }
    }

    const onKey = (_widget, event) => {
        if (event.get_keyval() !== Gdk.KEY_Escape) return false;
        if (deletingId !== null) {
            deletingId = null;
            render();
            return true;
        }
        if (composerOpen) {
            closeComposer();
            return true;
        }
        close();
        return true;
    };
    win.connect('key-press-event', onKey);
    timeEntry.connect('key-press-event', onKey);
    textEntry.connect('key-press-event', onKey);

    timeEntry.connect('activate', () => submit());
    textEntry.connect('activate', () => submit());
    win.connect('map', () => { render(); focusTarget(); });
    win.connect('unmap', () => clearFocusTimers());
    win.hook(calendar, () => { if (win.visible) render(); });
    win.hook(calendarNotes, () => { if (win.visible) render(); });

    render();

    globalThis.calendarWindow = {
        open,
        close,
        toggle: () => (win.visible ? close() : open()),
        win,
        textEntry,
        timeEntry,
    };

    return win;
};
