import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import { calendar } from './calendar.js';

// Halaman kalender: acara berikutnya (judul, jam, hitung mundur) + maksimal dua
// acara sesudahnya. Kalau feed belum diisi, tampil petunjuk singkat.

const hhmm = epoch => {
    const date = new Date(epoch);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const countdown = ms => {
    const minutes = Math.max(0, Math.round(ms / 60000));
    if (minutes < 60) return `dalam ${minutes} mnt`;
    const hours = Math.floor(minutes / 60);
    return `dalam ${hours} j ${minutes % 60} m`;
};

export default () => {
    const title = Widget.Label({ className: 'dyn-island-cal-title', xalign: 0, maxWidthChars: 34 });
    const when = Widget.Label({ className: 'dyn-island-cal-when', xalign: 0 });
    const hint = Widget.Label({ className: 'dyn-island-cal-hint', xalign: 0, wrap: true, maxWidthChars: 36 });
    const list = Widget.Box({ className: 'dyn-island-cal-list', vertical: true, spacing: 3 });

    const sync = () => {
        const value = calendar.value;
        const next = value.next;
        if (!next) {
            title.label = value.error ? 'Kalender belum siap' : 'Tidak ada acara';
            when.label = '';
            hint.label = value.error === 'URL belum diisi'
                ? 'URL iCal belum diisi (config.calendar.icsUrl).'
                : (value.error || '');
            hint.visible = !!hint.label;
            list.children = [];
            return;
        }

        // judul panjang tidak boleh melebarkan notch melebihi geometri 420
        title.label = String(next.title ?? '').length > 34
            ? `${String(next.title).slice(0, 33)}…`
            : String(next.title ?? '');
        when.label = next.allDay
            ? 'sepanjang hari'
            : `${hhmm(next.start)} – ${hhmm(next.end)}  ·  ${countdown(next.start - Date.now())}`;
        hint.visible = false;

        const rest = (value.events || []).filter(event => event.start > next.start).slice(0, 2);
        list.children = rest.map(event => Widget.Box({
            className: 'dyn-island-cal-row',
            spacing: 8,
            children: [
                Widget.Label({ className: 'dyn-island-cal-row-time', label: hhmm(event.start) }),
                Widget.Label({ className: 'dyn-island-cal-row-title', label: event.title, xalign: 0, hexpand: true }),
            ],
        }));
    };

    return Widget.Box({
        className: 'dyn-island-cal',
        vertical: true,
        spacing: 2,
        children: [title, when, hint, list],
        setup: self => {
            sync();
            self.hook(calendar, sync);
        },
    });
};
