import Gtk from 'gi://Gtk?version=3.0';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import { isoDay } from './calendar-notes.js';
import { eventButton } from './pointer.js';

export const DAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
export const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

export const dayKey = (year, month, day) =>
    isoDay(new Date(year, month, day));

const monthCells = (year, month) => {
    const first = new Date(year, month, 1);
    const lead = (first.getDay() + 6) % 7; // Senin = 0
    const total = new Date(year, month + 1, 0).getDate();
    const prevTotal = new Date(year, month, 0).getDate();
    const cells = [];
    for (let i = lead; i > 0; i--)
        cells.push({ day: prevTotal - i + 1, inMonth: false });
    for (let day = 1; day <= total; day++)
        cells.push({ day, inMonth: true });
    let next = 1;
    while (cells.length < 42)
        cells.push({ day: next++, inMonth: false });
    return cells;
};

// buildGrid dipakai halaman island (compact, 24px) dan popup (32px).
// Render ulang seluruh sel saat bulan/selection berubah; jumlahnya kecil.
export const buildGrid = ({
    cellW = 64,
    cellH = 32,
    spacing = 4,
    prefix = 'cal',
    onSelect = () => { },
} = {}) => {
    const box = Widget.Box({
        className: `${prefix}-month`,
        vertical: true,
        spacing: 2,
        halign: Gtk.Align.CENTER,
    });

    const render = ({ year, month, selected = null, eventDays = new Set(), noteDays = new Set() }) => {
        const heading = Widget.Box({
            className: `${prefix}-week-head`,
            spacing,
            halign: Gtk.Align.CENTER,
            children: DAYS.map(name => {
                const label = Widget.Label({
                    className: `${prefix}-week-name`,
                    label: name,
                    xalign: 0.5,
                });
                label.set_size_request(cellW, -1);
                return label;
            }),
        });

        const rows = [];
        const cells = monthCells(year, month);
        for (let row = 0; row < 6; row++) {
            const children = cells.slice(row * 7, row * 7 + 7).map(cell => {
                const key = dayKey(year, month, cell.day);
                const today = isoDay(new Date()) === key;
                const isSelected = selected
                    && selected.year === year
                    && selected.month === month
                    && selected.day === cell.day;
                const number = Widget.Label({
                    className: `${prefix}-day-num`,
                    label: String(cell.day),
                    xalign: 0.5,
                });
                // Dot fixed 4px: acara iCal = muted, catatan lokal = accent.
                const dot = kind => {
                    const box = Widget.Box({ className: `${prefix}-day-dot ${kind}` });
                    box.set_size_request(4, 4);
                    return box;
                };
                const marks = [];
                if (eventDays.has(key)) marks.push(dot('is-event'));
                if (noteDays.has(key)) marks.push(dot('is-note'));
                const markRow = marks.length
                    ? Widget.Box({
                        spacing: 2,
                        halign: Gtk.Align.CENTER,
                        valign: Gtk.Align.CENTER,
                        children: marks,
                    })
                    : null;
                const content = Widget.Box({
                    vertical: true,
                    spacing: 0,
                    halign: Gtk.Align.CENTER,
                    valign: Gtk.Align.CENTER,
                    children: markRow ? [number, markRow] : [number],
                });
                const className = `${prefix}-day`
                    + (cell.inMonth ? '' : ' is-outside')
                    + (today ? ' is-today' : '')
                    + (isSelected ? ' is-selected' : '');
                // EventBox, bukan Button: padding/min-height tema tombol
                // menambah 6px per baris dan membuat grid melar.
                const button = Widget.EventBox({
                    className,
                    child: content,
                    sensitive: cell.inMonth,
                    setup: self => {
                        self.connect('button-press-event', (_w, event) => {
                            if (eventButton(event) !== 1) return false;
                            if (!cell.inMonth) return false;
                            onSelect(year, month, cell.day);
                            return true;
                        });
                    },
                });
                button.set_size_request(cellW, cellH);
                return button;
            });

            rows.push(Widget.Box({
                className: `${prefix}-week`,
                spacing,
                halign: Gtk.Align.CENTER,
                children,
            }));
        }

        box.children = [heading, ...rows];
    };

    return { box, render };
};

// Legenda dot: acara iCal (muted) vs catatan lokal (accent).
export const Legend = ({ prefix = 'cal' } = {}) => {
    const item = (kind, label) => {
        const dot = Widget.Box({ className: `${prefix}-day-dot ${kind}` });
        dot.set_size_request(4, 4);
        return Widget.Box({
            spacing: 4,
            children: [
                dot,
                Widget.Label({ className: `${prefix}-legend-label`, label }),
            ],
        });
    };
    return Widget.Box({
        className: `${prefix}-legend`,
        spacing: 10,
        children: [
            item('is-event', 'Acara'),
            item('is-note', 'Catatan'),
        ],
    });
};
