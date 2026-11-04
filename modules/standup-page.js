import Gtk from 'gi://Gtk?version=3.0';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import { standup } from './standup.js';

// Halaman ringkas di island: status pengisian + tombol membuka popup.
export default () => {
    const bell = Widget.Label({ className: 'standup-page-bell', label: '\uf0f3' });
    const title = Widget.Label({ className: 'standup-page-title', label: 'Daily Standup', xalign: 0 });
    const sub = Widget.Label({ className: 'standup-page-sub', xalign: 0 });

    const openBtn = Widget.Button({
        className: 'dyn-island-pill',
        child: Widget.Label({ className: 'dyn-island-pill-label', label: 'Isi' }),
        onClicked: () => {
            try { globalThis.dynIsland?.standupWindow?.open?.(); } catch (_) { }
        },
    });

    const refresh = () => {
        const value = standup.value;
        const parts = [
            `kemarin ${value.yesterday?.length ?? 0}`,
            `hari ini ${value.today?.length ?? 0}`,
            `blocker ${value.blockers?.length ?? 0}`,
        ];
        sub.label = value.saved ? `Tersimpan · ${parts.join(' · ')}` : `Belum diisi · ${parts.join(' · ')}`;
        openBtn.child.label = value.saved ? 'Lihat' : 'Isi';
    };

    return Widget.Box({
        className: 'standup-page',
        spacing: 12,
        valign: Gtk.Align.CENTER,
        children: [
            bell,
            Widget.Box({ vertical: true, spacing: 1, children: [title, sub] }),
            Widget.Label({ hexpand: true }),
            openBtn,
        ],
        setup: self => {
            refresh();
            self.hook(standup, refresh);
        },
    });
};
