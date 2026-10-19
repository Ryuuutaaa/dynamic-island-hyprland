import Gtk from 'gi://Gtk?version=3.0';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import Mpris from 'resource:///com/github/Aylur/ags/service/mpris.js';
import CONFIG from '../config.js';
import { mediaView } from '../state.js';
import Progress, { activePlayer } from './progress.js';
import Cover from './cover.js';

export default () => {
    const cover = Cover({ size: 72, radius: 10 });
    const title = Widget.Label({
        className: 'dyn-island-media-title',
        xalign: 0,
        truncate: 'end',
        maxWidthChars: CONFIG.mediaMaxChars,
    });
    const artist = Widget.Label({
        className: 'dyn-island-media-artist',
        xalign: 0,
        truncate: 'end',
        maxWidthChars: CONFIG.mediaMaxChars,
    });
    const progress = Progress();
    const playGlyph = Widget.Label({ className: 'dyn-island-ctl-icon' });

    const refresh = () => {
        const player = activePlayer();
        cover.setPath(player?.cover_path ?? '');
        title.label = player ? (player.track_title || 'Judul tidak diketahui') : 'Tidak ada yang diputar';
        artist.label = player ? (player.track_artists || []).join(', ') : '';
        playGlyph.label = player?.play_back_status === 'Playing' ? '\uf04c' : '\uf04b';
    };

    const control = (glyph, action, tooltip) => Widget.Button({
        className: 'dyn-island-ctl',
        tooltipText: tooltip,
        child: Widget.Label({ className: 'dyn-island-ctl-icon', label: glyph }),
        onClicked: () => {
            const player = activePlayer();
            if (player) action(player);
        },
    });

    return Widget.Box({
        className: 'dyn-island-media',
        spacing: 14,
        halign: Gtk.Align.CENTER,
        valign: Gtk.Align.CENTER,
        children: [
            cover,
            Widget.Box({
                className: 'dyn-island-media-text',
                vertical: true,
                spacing: 6,
                children: [title, artist, progress],
            }),
            Widget.Box({
                className: 'dyn-island-media-ctls',
                spacing: 2,
                valign: Gtk.Align.CENTER,
                children: [
                    control('\uf048', player => player.previous(), 'Sebelumnya'),
                    Widget.Button({
                        className: 'dyn-island-ctl',
                        tooltipText: 'Putar atau jeda',
                        child: playGlyph,
                        onClicked: () => activePlayer()?.playPause(),
                    }),
                    control('\uf051', player => player.next(), 'Berikutnya'),
                    // masuk tampilan lirik: sub-bagian dari kartu media, bukan
                    // halaman nav tersendiri (dot tetap di "media")
                    Widget.Button({
                        className: 'dyn-island-ctl',
                        tooltipText: 'Tampilkan lirik',
                        child: Widget.Label({ className: 'dyn-island-ctl-icon', label: '\uf075' }),
                        onClicked: () => { mediaView.value = 'lyrics'; },
                    }),
                ],
            }),
        ],
        setup: self => {
            refresh();
            self.hook(Mpris, refresh, 'changed');
            self.hook(Mpris, refresh, 'player-changed');
        },
    });
};
