import Gtk from 'gi://Gtk?version=3.0';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';
import { calendar, chooseNext, refreshCalendar } from './calendar.js';
import { tabular } from './type.js';

// Halaman kalender: acara berikutnya (judul, jam, hitung mundur) + maksimal dua
// acara sesudahnya. Empty state punya ikon dan tombol muat ulang; error tidak
// lagi hanya menampilkan pesan curl mentah.

const DAY_MS = 86400000;
const DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

const hhmm = epoch => {
    const date = new Date(epoch);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const startOfDay = epoch => {
    const date = new Date(epoch);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
};

const dayDiff = (epoch, now) => Math.round((startOfDay(epoch) - startOfDay(now)) / DAY_MS);

const dayLabel = (epoch, now) => {
    const diff = dayDiff(epoch, now);
    if (diff === 0) return 'Hari ini';
    if (diff === 1) return 'Besok';
    if (diff === -1) return 'Kemarin';
    const date = new Date(epoch);
    return `${DAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]}`;
};

const shortDay = (epoch, now) => {
    const diff = dayDiff(epoch, now);
    if (diff === 0) return '';
    if (diff === 1) return 'Besok ';
    const date = new Date(epoch);
    return `${DAYS[date.getDay()]} `;
};

const formatDuration = ms => {
    const minutes = Math.max(0, Math.round(ms / 60000));
    if (minutes < 1) return 'kurang dari 1 mnt';
    if (minutes < 60) return `${minutes} mnt`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (hours < 24) return `${hours} j${rest ? ` ${rest} m` : ''}`;
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return `${days} hari${remainingHours ? ` ${remainingHours} j` : ''}`;
};

const truncate = (text, max) => {
    const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
    return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
};

export default () => {
    const title = Widget.Label({
        className: 'dyn-island-cal-title',
        xalign: 0,
        truncate: 'end',
        maxWidthChars: 34,
    });
    const when = Widget.Label({
        className: 'dyn-island-cal-when',
        xalign: 0,
        truncate: 'end',
        maxWidthChars: 46,
    });
    const list = Widget.Box({ className: 'dyn-island-cal-list', vertical: true, spacing: 3 });

    const content = Widget.Box({
        className: 'dyn-island-cal-content',
        vertical: true,
        spacing: 2,
        halign: Gtk.Align.FILL,
        children: [title, when, list],
    });
    content.set_no_show_all(true);

    const emptyIcon = Widget.Label({
        className: 'dyn-island-cal-empty-icon',
        label: '\uf073',
        halign: Gtk.Align.CENTER,
    });
    const emptyTitle = Widget.Label({
        className: 'dyn-island-cal-empty-title',
        halign: Gtk.Align.CENTER,
    });
    const emptyHint = Widget.Label({
        className: 'dyn-island-cal-empty-hint',
        halign: Gtk.Align.CENTER,
        wrap: true,
        maxWidthChars: 42,
    });
    const retry = Widget.Button({
        className: 'dyn-island-chip dyn-island-cal-retry',
        halign: Gtk.Align.CENTER,
        child: Widget.Label({ className: 'dyn-island-chip-label', label: 'Muat ulang' }),
        onClicked: () => { refreshCalendar(); },
    });
    retry.set_no_show_all(true);

    const empty = Widget.Box({
        className: 'dyn-island-cal-empty',
        vertical: true,
        spacing: 4,
        halign: Gtk.Align.CENTER,
        valign: Gtk.Align.CENTER,
        children: [emptyIcon, emptyTitle, emptyHint, retry],
    });
    empty.set_no_show_all(true);

    const sync = () => {
        const value = calendar.value;
        const now = Date.now();
        const next = chooseNext(value.events, now);

        if (!next) {
            content.visible = false;
            empty.visible = true;
            empty.show();
            const error = String(value.error ?? '');
            if (error === 'URL belum diisi') {
                emptyTitle.label = 'Kalender belum siap';
                emptyHint.label = 'Isi URL iCal di config.calendar.icsUrl.\nGoogle/Outlook: pakai secret address.';
                retry.visible = false;
            } else if (error) {
                emptyTitle.label = 'Kalender gagal dimuat';
                emptyHint.label = truncate(error, 90);
                retry.visible = true;
                retry.show();
                retry.child.visible = true;
                retry.child.show();
            } else {
                emptyTitle.label = 'Tidak ada acara';
                emptyHint.label = 'Belum ada acara dalam 400 hari ke depan.';
                retry.visible = true;
                retry.show();
                retry.child.visible = true;
                retry.child.show();
            }
            return;
        }

        empty.visible = false;
        content.visible = true;
        content.show();

        const fullTitle = String(next.title ?? 'Acara');
        title.label = truncate(fullTitle, 34);
        title.tooltipText = fullTitle;

        const ongoing = next.start <= now && next.end > now;
        const day = dayLabel(next.start, now);
        if (next.allDay) {
            when.label = `${day} · sepanjang hari`;
        } else {
            const prefix = day === 'Hari ini' ? '' : `${day} · `;
            const status = ongoing
                ? `berakhir dalam ${formatDuration(next.end - now)}`
                : `dalam ${formatDuration(next.start - now)}`;
            when.label = `${prefix}${hhmm(next.start)} – ${hhmm(next.end)} · ${status}`;
        }

        const rest = (value.events || [])
            .filter(event => event.start > next.start && event.end > now)
            .slice(0, 2);
        list.visible = rest.length > 0;
        list.children = rest.map(event => Widget.Box({
            className: 'dyn-island-cal-row',
            spacing: 8,
            children: [
                tabular(Widget.Label({
                    className: 'dyn-island-cal-row-time',
                    label: `${shortDay(event.start, now)}${hhmm(event.start)}`,
                })),
                Widget.Label({
                    className: 'dyn-island-cal-row-title',
                    label: truncate(event.title, 30),
                    xalign: 0,
                    truncate: 'end',
                    maxWidthChars: 30,
                    tooltipText: event.title,
                }),
            ],
        }));
    };

    return Widget.Box({
        className: 'dyn-island-cal',
        vertical: true,
        halign: Gtk.Align.FILL,
        valign: Gtk.Align.CENTER,
        children: [content, empty],
        setup: self => {
            sync();
            self.hook(calendar, sync);
            // Hitung mundur dan perpindahan ke acara berikutnya tetap jalan
            // walau feed tidak di-refresh.
            Utils.interval(30_000, sync, self);
        },
    });
};
