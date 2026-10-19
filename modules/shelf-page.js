import Gtk from 'gi://Gtk?version=3.0';
import Gdk from 'gi://Gdk?version=3.0';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';
import { shelf, shelfDragOver, shelfUndo, removeItem, clearShelf, undoLast, formatSize } from './shelf.js';

const CARD_W = 76;
const CARD_H = 70;
const CARD_GAP = 6;
const ZONE_W = 380;
const ZONE_H = 54;
// berapa kartu yang muat tanpa perlu digeser (pane tidak menggambar scrollbar)
const FITS = Math.floor(ZONE_W / (CARD_W + CARD_GAP));

// Target drag keluar: kartu diseret ke aplikasi lain sebagai file asli.
const DRAG_TARGETS = [Gtk.TargetEntry.new('text/uri-list', 0, 0)];

const THEME_ICON = { folder: 'folder', file: 'text-x-generic', missing: 'dialog-question' };

// tooltip 3 baris (path panjang + hint) meluber keluar notch dan menutupi
// kartu tetangga, jadi path-nya dipendekkan
const shortenPath = path => (path.length > 46 ? `…${path.slice(-45)}` : path);

const Thumb = item => Widget.Icon({
    className: 'dyn-island-shelf-thumb',
    icon: item.missing ? THEME_ICON.missing : item.kind === 'image' ? item.path : THEME_ICON[item.kind],
    size: 36,
});

const Card = item => Widget.Button({
    className: `dyn-island-shelf-card${item.missing ? ' missing' : ''}`,
    tooltipText: `${shortenPath(item.path)}\n${item.missing ? 'File tidak ditemukan · ' : ''}klik: buka · seret: keluar · klik kanan: hapus`,
    child: Widget.Box({
        vertical: true,
        spacing: 3,
        valign: Gtk.Align.CENTER,
        children: [
            Thumb(item),
            Widget.Label({
                className: 'dyn-island-shelf-name',
                label: item.name,
                truncate: 'middle',
                maxWidthChars: 12,
                xalign: 0.5,
            }),
            Widget.Label({
                className: 'dyn-island-shelf-size',
                label: item.missing ? 'hilang' : item.kind === 'folder' ? 'Folder' : formatSize(item.size),
                xalign: 0.5,
            }),
        ],
    }),
    setup: self => {
        self.set_size_request(CARD_W, CARD_H);

        // drag out: `gtk_drag_source_set` + isi text/uri-list
        self.drag_source_set(Gdk.ModifierType.BUTTON1_MASK, DRAG_TARGETS, Gdk.DragAction.COPY);
        self.connect('drag-data-get', (_widget, _context, data) => {
            if (!item.missing) data.set_uris([item.uri]);
        });

        // klik kanan: hapus dari shelf (file asli tidak disentuh)
        self.connect('button-press-event', (_widget, event) => {
            if (event.button !== 3) return false;
            removeItem(item.id);
            return true;
        });
    },
    onClicked: () => {
        if (item.missing) return;
        Utils.execAsync(['xdg-open', item.path]).catch(() => { });
    },
});

const DropZone = over => Widget.Box({
    className: `dyn-island-shelf-zone${over ? ' over' : ''}`,
    halign: Gtk.Align.FILL,
    valign: Gtk.Align.FILL,
    child: Widget.Box({
        className: 'dyn-island-shelf-zone-inner',
        vertical: true,
        spacing: 2,
        // AGS/Box memasang child dengan pack_start(expand=FALSE, fill=TRUE),
        // jadi box ini harus di-hexpand sendiri supaya label bisa center.
        hexpand: true,
        halign: Gtk.Align.FILL,
        valign: Gtk.Align.CENTER,
        children: [
            Widget.Label({ className: 'dyn-island-shelf-zone-icon', label: '\uf0ed', xalign: 0.5 }),
            Widget.Label({
                className: 'dyn-island-shelf-zone-title',
                label: over ? 'Lepas untuk menambah' : 'Letakkan berkas di sini',
                xalign: 0.5,
            }),
            Widget.Label({
                className: 'dyn-island-shelf-zone-sub',
                label: 'Seret keluar · klik untuk buka',
                xalign: 0.5,
            }),
        ],
    }),
    setup: self => self.set_size_request(ZONE_W, ZONE_H),
});

export default () => {
    const content = Widget.Box({
        className: 'dyn-island-shelf-content',
        halign: Gtk.Align.CENTER,
        valign: Gtk.Align.CENTER,
    });

    const count = Widget.Label({ className: 'dyn-island-shelf-count' });

    const clear = Widget.Button({
        className: 'dyn-island-chip',
        tooltipText: 'Kosongkan shelf (file asli tidak dihapus, bisa diurungkan)',
        child: Widget.Label({ className: 'dyn-island-chip-label', label: 'Kosongkan' }),
        onClicked: () => clearShelf(),
    });

    // Undo satu langkah untuk hapus/bersihkan; muncul 8s setelah aksi
    const undo = Widget.Button({
        className: 'dyn-island-chip',
        tooltipText: 'Kembalikan item yang terakhir dihapus',
        child: Widget.Label({ className: 'dyn-island-chip-label' }),
        onClicked: () => undoLast(),
        setup: self => {
            const sync = () => {
                self.visible = shelfUndo.value.available;
                self.tooltipText = shelfUndo.value.label || 'Kembalikan item terakhir';
                self.child.label = 'Urungkan';
            };
            sync();
            self.hook(shelfUndo, sync);
        },
    });

    const rebuild = () => {
        const state = shelf.value;
        const total = state.items.length;
        // kalau lebih banyak dari yang muat, beri tahu bahwa daftarnya bisa digeser
        count.label = total > FITS ? `${total} item · geser ›` : `${total} item`;
        count.visible = total > 0;

        // drop zone tampil saat kosong ATAU saat ada drag masuk (jadi target
        // drop selalu terlihat saat dibutuhkan)
        if (!state.items.length || shelfDragOver.value) {
            content.children = [DropZone(shelfDragOver.value)];
            return;
        }

        const list = Widget.Box({
            className: 'dyn-island-shelf-list',
            spacing: 6,
            children: state.items.map(Card),
        });
        const pane = Widget.Scrollable({
            className: 'dyn-island-shelf-pane',
            hscroll: 'external',
            vscroll: 'never',
        });
        pane.child = list;
        pane.set_size_request(ZONE_W, CARD_H + 4);
        content.children = [pane];
    };

    return Widget.Box({
        className: 'dyn-island-shelf',
        vertical: true,
        spacing: 4,
        halign: Gtk.Align.CENTER,
        valign: Gtk.Align.CENTER,
        children: [
            Widget.Box({
                className: 'dyn-island-shelf-head',
                spacing: 8,
                children: [
                    Widget.Label({ className: 'dyn-island-shelf-title', label: 'Shelf' }),
                    count,
                    clear,
                    undo,
                ],
            }),
            content,
        ],
        setup: self => {
            rebuild();
            self.hook(shelf, () => rebuild());
            self.hook(shelfDragOver, () => rebuild());
        },
    });
};
