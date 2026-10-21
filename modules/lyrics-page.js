import Gtk from 'gi://Gtk?version=3.0';
import GLib from 'gi://GLib';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';
import CONFIG from '../config.js';
import { page, mediaView } from '../state.js';
import { lyrics, retryLyrics } from './lyrics.js';
import Progress, { activePlayer } from './progress.js';
import Cover from './cover.js';

const PANE_W = 208;
const PANE_H = 100;
// jeda auto-scroll setelah user menggulir sendiri (ms)
const SCROLL_HOLD = 8000;

const LINE_CLASS = 'dyn-island-lyric';

function seek(time) {
    if (time < 0) return;
    const player = activePlayer();
    if (!player) return;
    try {
        player.position = time;
    } catch (error) {
        console.log(`[dyn-island] seek tidak didukung player: ${error}`);
    }
}

export default () => {
    const cover = Cover({ size: 56, radius: 8 });
    const title = Widget.Label({
        className: 'dyn-island-lyrics-title',
        xalign: 0,
        truncate: 'end',
        maxWidthChars: CONFIG.mediaMaxChars,
    });
    const artist = Widget.Label({
        className: 'dyn-island-lyrics-artist',
        xalign: 0,
        truncate: 'end',
        maxWidthChars: CONFIG.mediaMaxChars,
    });
    const playGlyph = Widget.Label({ className: 'dyn-island-ctl-icon' });

    const control = (glyph, action, tooltip) => Widget.Button({
        className: 'dyn-island-ctl',
        tooltipText: tooltip,
        child: Widget.Label({ className: 'dyn-island-ctl-icon', label: glyph }),
        onClicked: () => {
            const player = activePlayer();
            if (player) action(player);
        },
    });

    // Panel lirik: ScrolledWindow nested. Pakai vscroll 'external' supaya
    // minimum-nya tetap kecil (kalau 'never', minimum = tinggi SELURUH isi
    // lirik -> notch ikut melar ~974px) dan scrollbar tidak digambar di dalam.
    const pane = Widget.Scrollable({
        className: 'dyn-island-lyrics-pane',
        hscroll: 'never',
        vscroll: 'external',
    });
    const list = Widget.Box({ className: 'dyn-island-lyrics-list', vertical: true, spacing: 1 });
    pane.child = list;
    pane.set_size_request(PANE_W, PANE_H);

    let activeIndex = -1;
    let holdUntil = 0;

    // User menggulir sendiri -> tahan auto-scroll sebentar supaya baris
    // berikutnya bisa dibaca. Tanpa ini tick 500ms selalu menarik balik.
    pane.connect('scroll-event', () => {
        holdUntil = GLib.get_monotonic_time() / 1000 + SCROLL_HOLD;
        return false;
    });

    const scrollToActive = () => {
        if (GLib.get_monotonic_time() / 1000 < holdUntil) return;
        const children = list.get_children();
        const child = children[activeIndex];
        if (!child) return;
        const allocation = child.get_allocation();
        const adjustment = pane.get_vadjustment();
        if (!adjustment) return;
        const target = allocation.y + allocation.height / 2 - pane.get_allocated_height() / 2;
        const max = Math.max(0, adjustment.upper - adjustment.page_size);
        adjustment.value = Math.max(0, Math.min(max, target));
    };

    const setActive = index => {
        const children = list.get_children();
        children.forEach((child, i) => child.toggleClassName('on', i === index));
        activeIndex = index;
    };

    const syncActive = force => {
        const current = lyrics.value;
        if (current.status !== 'synced' || !current.lines.length) return;
        if (page.value !== 'media' || mediaView.value !== 'lyrics') return;
        const player = activePlayer();
        const position = player?.position ?? -1;
        if (position < 0) return;

        let index = -1;
        for (let i = 0; i < current.lines.length; i++) {
            if (current.lines[i].time <= position) index = i;
            else break;
        }
        if (!force && index === activeIndex) {
            // index tidak berubah, tapi tetap coba scroll: layout bisa belum
            // siap saat percobaan sebelumnya (allocation.y masih 0)
            Utils.idle(scrollToActive);
            return;
        }
        setActive(index);
        Utils.idle(scrollToActive);
    };

    const emptyLine = (label, retry = false) => retry
        ? Widget.Button({
            className: 'dyn-island-lyrics-retry',
            child: Widget.Label({ className: 'dyn-island-lyrics-empty', label, xalign: 0 }),
            onClicked: () => retryLyrics(),
        })
        : Widget.Label({ className: 'dyn-island-lyrics-empty', label, xalign: 0 });

    const rebuild = () => {
        const current = lyrics.value;
        const player = activePlayer();
        cover.setPath(player?.cover_path ?? '');
        title.label = current.title || player?.track_title || 'Lirik';
        artist.label = player ? (player.track_artists || []).join(', ') : '';
        playGlyph.label = player?.play_back_status === 'Playing' ? '\uf04c' : '\uf04b';

        const lines = current.lines || [];
        if (current.status === 'loading' || current.status === 'idle') {
            list.children = [emptyLine('Mencari lirik…')];
        } else if (current.status === 'instrumental') {
            list.children = [emptyLine('Instrumental')];
        } else if (current.status === 'error') {
            // gagal jaringan: bukan "tidak ditemukan", dan bisa dicoba lagi
            list.children = [emptyLine('Gagal memuat lirik — klik untuk coba lagi', true)];
        } else if (!lines.length) {
            list.children = [emptyLine('Lirik tidak ditemukan')];
        } else {
            list.children = lines.map(line => Widget.Button({
                className: LINE_CLASS,
                child: Widget.Label({ className: 'dyn-island-lyric-text', label: line.text, xalign: 0, truncate: 'end' }),
                onClicked: () => seek(line.time),
            }));
        }
        activeIndex = -1;
        syncActive(true);
    };

    return Widget.Box({
        className: 'dyn-island-lyrics',
        spacing: 12,
        halign: Gtk.Align.CENTER,
        valign: Gtk.Align.CENTER,
        children: [
            Widget.Box({
                className: 'dyn-island-lyrics-meta',
                vertical: true,
                // 4px: 6px membuat tinggi konten 102px (ruang hanya 100px)
                spacing: 4,
                children: [
                    Widget.Box({
                        spacing: 10,
                        children: [
                            cover,
                            Widget.Box({ vertical: true, spacing: 2, children: [title, artist] }),
                        ],
                    }),
                    Progress(150),
                    Widget.Box({
                        className: 'dyn-island-media-ctls',
                        spacing: 2,
                        children: [
                            // keluar dari tampilan lirik: kembali ke kartu media
                            Widget.Button({
                                className: 'dyn-island-ctl',
                                tooltipText: 'Kembali ke musik',
                                child: Widget.Label({ className: 'dyn-island-ctl-icon', label: '\uf0a8' }),
                                onClicked: () => { mediaView.value = 'main'; },
                            }),
                            control('\uf048', player => player.previous(), 'Sebelumnya'),
                            Widget.Button({
                                className: 'dyn-island-ctl',
                                tooltipText: 'Putar atau jeda',
                                child: playGlyph,
                                onClicked: () => activePlayer()?.playPause(),
                            }),
                            control('\uf051', player => player.next(), 'Berikutnya'),
                        ],
                    }),
                ],
            }),
            pane,
        ],
        setup: self => {
            rebuild();
            self.hook(lyrics, rebuild);
            Utils.interval(500, () => syncActive(false), self);
        },
    });
};
