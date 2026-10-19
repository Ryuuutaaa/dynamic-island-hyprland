import Gtk from 'gi://Gtk?version=3.0';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';
import { palette, hexToRgb } from '../theme.js';
import { todo, addTask, toggleTask, removeTask, doneCount, totalCount } from './todo.js';

const FG = hexToRgb(palette.fg);
// hijau dari palet (bisa di-override wallust via `@define-color ok ...`)
const GREEN = hexToRgb(palette.ok);

const LIST_W = 186;
const LIST_H = 92;

// Checkbox bulat: kosong saat belum selesai, hijau + centang saat selesai.
const Check = done => Widget.DrawingArea({
    className: 'dyn-island-todo-check',
    setup: self => self.set_size_request(16, 16),
    drawFn: (self, cr, width, height) => {
        const cx = width / 2;
        const cy = height / 2;
        const radius = Math.min(width, height) / 2 - 1;
        if (radius <= 0) return;

        if (!done) {
            cr.setLineWidth(1.4);
            cr.setSourceRGBA(FG[0], FG[1], FG[2], 0.45);
            cr.arc(cx, cy, radius, 0, Math.PI * 2);
            cr.stroke();
            return;
        }

        cr.setSourceRGBA(GREEN[0], GREEN[1], GREEN[2], 0.95);
        cr.arc(cx, cy, radius, 0, Math.PI * 2);
        cr.fill();

        cr.setLineWidth(1.6);
        cr.setSourceRGB(1, 1, 1);
        cr.moveTo(cx - radius * 0.45, cy);
        cr.lineTo(cx - radius * 0.1, cy + radius * 0.35);
        cr.lineTo(cx + radius * 0.5, cy - radius * 0.35);
        cr.stroke();
    },
});

const TaskRow = (task, editMode) => {
    const label = Widget.Label({
        className: `dyn-island-todo-text${task.done ? ' done' : ''}`,
        label: task.text,
        xalign: 0,
        truncate: 'end',
        maxWidthChars: 20,
    });

    const row = [Check(task.done), label];
    // jatuh tempo dipisah dari teks supaya tidak ikut terpotong saat
    // judul tugasnya panjang (dulu satu label: `teks · due`)
    if (task.due) {
        row.push(Widget.Label({
            className: `dyn-island-todo-due${task.done ? ' done' : ''}`,
            label: task.due,
            xalign: 1,
        }));
    }

    const button = Widget.Button({
        className: 'dyn-island-todo-row',
        tooltipText: task.done ? 'Tandai belum selesai' : 'Tandai selesai',
        child: Widget.Box({
            spacing: 6,
            valign: Gtk.Align.CENTER,
            children: row,
        }),
        onClicked: () => toggleTask(task.id),
    });

    if (!editMode) return button;

    return Widget.Box({
        className: 'dyn-island-todo-rowline',
        spacing: 2,
        children: [
            button,
            Widget.Button({
                className: 'dyn-island-todo-remove',
                tooltipText: 'Hapus tugas',
                child: Widget.Label({ className: 'dyn-island-todo-remove-label', label: '\uf00d' }),
                onClicked: () => removeTask(task.id),
            }),
        ],
    });
};

const pill = (label, onClicked, tooltip = null) => Widget.Button({
    className: 'dyn-island-pill',
    tooltipText: tooltip,
    child: Widget.Label({ className: 'dyn-island-pill-label', label }),
    onClicked,
});

export default () => {
    let editMode = false;

    const count = Widget.Label({ className: 'dyn-island-todo-count' });
    const editLabel = Widget.Label({ className: 'dyn-island-pill-label', label: 'Ubah' });

    // Panel tugas: ScrolledWindow nested (vscroll external supaya minimum
    // tingginya kecil dan scrollbar tidak digambar).
    const pane = Widget.Scrollable({
        className: 'dyn-island-todo-pane',
        hscroll: 'never',
        vscroll: 'external',
    });
    const list = Widget.Box({ className: 'dyn-island-todo-list', vertical: true, spacing: 3 });
    pane.child = list;
    pane.set_size_request(LIST_W, LIST_H);

    const rebuild = () => {
        const state = todo.value;
        count.label = `${doneCount(state)}/${totalCount(state)}`;
        if (!state.tasks.length) {
            list.children = [Widget.Label({
                className: 'dyn-island-todo-empty',
                label: 'Belum ada tugas',
                xalign: 0,
            })];
            return;
        }
        list.children = state.tasks.map(task => TaskRow(task, editMode));
    };

    const add = pill('\uf067 Tambah', () => {
        // input teks lewat rofi (layer-shell window ini keymode: none,
        // jadi tidak bisa menerima keyboard tanpa mengubah fokus)
        Utils.execAsync(['rofi', '-dmenu', '-p', 'Tugas baru', '-l', '0'])
            .then(text => { addTask(text); })
            .catch(error => {
                // batal (exit 1) bukan error; rofi yang tidak ada baru dilaporkan
                if (/not found|No such file|Failed to execute/i.test(String(error))) {
                    Utils.execAsync([
                        'notify-send', '-a', 'Notch', 'Tidak bisa membuka rofi',
                        'Pastikan rofi terpasang untuk menambah tugas.',
                    ]).catch(() => { });
                }
            });
    }, 'Tugas baru — bisa pakai @HH:MM untuk jatuh tempo');

    const edit = Widget.Button({
        className: 'dyn-island-pill',
        tooltipText: 'Tampilkan tombol hapus per tugas',
        child: editLabel,
        onClicked: () => {
            editMode = !editMode;
            editLabel.label = editMode ? 'Selesai' : 'Ubah';
            rebuild();
        },
    });

    return Widget.Box({
        className: 'dyn-island-todo',
        spacing: 16,
        halign: Gtk.Align.CENTER,
        valign: Gtk.Align.CENTER,
        children: [
            Widget.Box({
                className: 'dyn-island-todo-meta',
                vertical: true,
                spacing: 6,
                valign: Gtk.Align.CENTER,
                children: [
                    Widget.Box({
                        spacing: 6,
                        children: [
                            Widget.Label({ className: 'dyn-island-todo-title', label: 'Todo' }),
                            Widget.Label({ className: 'dyn-island-todo-title-sub', label: 'List' }),
                        ],
                    }),
                    Widget.Box({
                        spacing: 8,
                        children: [
                            count,
                            Widget.Label({ className: 'dyn-island-todo-done', label: 'Tugas selesai' }),
                        ],
                    }),
                    Widget.Box({ spacing: 6, children: [add, edit] }),
                ],
            }),
            pane,
        ],
        setup: self => {
            rebuild();
            self.hook(todo, () => rebuild());
        },
    });
};
