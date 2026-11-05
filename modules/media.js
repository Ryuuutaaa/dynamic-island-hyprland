import Gtk from 'gi://Gtk?version=3.0';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import Mpris from 'resource:///com/github/Aylur/ags/service/mpris.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';
import CONFIG from '../config.js';
import { mediaView } from '../state.js';
import Progress, { activePlayer } from './progress.js';
import Cover from './cover.js';
import { updateCoverColor, coverColor } from './cover-color.js';
import { glow as glowEnabled } from './settings.js';
import { tabular } from './type.js';

const formatTime = seconds => {
    const value = Number(seconds);
    if (!Number.isFinite(value) || value < 0) return '--:--';
    const total = Math.floor(value);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const rest = total % 60;
    return hours > 0
        ? `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
        : `${minutes}:${String(rest).padStart(2, '0')}`;
};

export default () => {
    const cover = Cover({ size: 84, radius: 12 });
    cover.setGlow(glowEnabled.value ? coverColor.value : null);
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
    const elapsed = tabular(Widget.Label({ className: 'dyn-island-media-time', xalign: 0 }));
    const total = tabular(Widget.Label({ className: 'dyn-island-media-time', xalign: 1 }));
    const source = Widget.Label({
        className: 'dyn-island-media-source',
        xalign: 1,
        truncate: 'end',
        maxWidthChars: 10,
    });
    const timeRow = Widget.CenterBox({
        className: 'dyn-island-media-timerow',
        startWidget: elapsed,
        endWidget: Widget.Box({ spacing: 6, children: [total, source] }),
    });

    const refreshTimes = () => {
        const player = activePlayer();
        const length = Number(player?.length) || 0;
        const position = Number(player?.position) || 0;
        const known = length > 0;
        const identity = player?.identity || player?.name || '';
        // Stream/video tanpa length tetap menampilkan nama aplikasi sumber;
        // elapsed/total hanya muncul kalau durasi benar-benar dilaporkan.
        timeRow.visible = known || !!identity;
        elapsed.visible = known;
        total.visible = known;
        if (known) {
            elapsed.label = formatTime(position);
            total.label = formatTime(length);
        }
        source.label = identity;
        source.visible = !!identity;
    };

    const refresh = () => {
        const player = activePlayer();
        cover.setPath(player?.cover_path ?? '');
        updateCoverColor(player?.cover_path ?? '');
        cover.setGlow(glowEnabled.value ? coverColor.value : null);
        title.label = player ? (player.track_title || 'Judul tidak diketahui') : 'Tidak ada yang diputar';
        artist.label = player
            ? (player.track_artists || []).join(', ')
            : 'Putar musik untuk memulai';
        title.tooltipText = title.label;
        artist.tooltipText = artist.label;
        progress.visible = !!player;
        controls.visible = !!player;
        playGlyph.label = player?.play_back_status === 'Playing' ? '\uf04c' : '\uf04b';
        refreshTimes();
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

    const controls = Widget.Box({
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
                children: [title, artist, progress, timeRow],
            }),
            controls,
        ],
        setup: self => {
            refresh();
            self.hook(Mpris, refresh, 'changed');
            self.hook(Mpris, refresh, 'player-changed');
            self.hook(coverColor, () => cover.setGlow(glowEnabled.value ? coverColor.value : null));
            self.hook(glowEnabled, () => cover.setGlow(glowEnabled.value ? coverColor.value : null));
            // posisi MPRIS ikut berjalan setiap detik, bukan hanya saat track
            // berganti; label elapsed diperbarui di sini.
            Utils.interval(1000, refreshTimes, self);
        },
    });
};
