import Gtk from 'gi://Gtk?version=3.0';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import { palette, hexToRgb } from '../theme.js';
import { page } from '../state.js';
import { todo, toggleTask, removeTask, doneCount, totalCount } from './todo.js';
import { scrollDelta } from './pointer.js';

const FG = hexToRgb(palette.fg);
const GREEN = hexToRgb(palette.ok);

const PAGE_W = 428;
const LIST_H = 88;

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

const icon = (className, label) => Widget.Label({ className, label });

export default () => {
    let pendingDelete = null;

    const title = Widget.Label({ className: 'dyn-island-todo-title', label: 'Tugas' });
    const context = Widget.Label({
        className: 'dyn-island-todo-context',
        truncate: 'end',
        maxWidthChars: 30,
    });
    const add = Widget.Button({
        className: 'dyn-island-todo-add',
        tooltipText: 'Tambah tugas',
        child: Widget.Box({
            spacing: 4,
            children: [
                icon('dyn-island-todo-add-icon', '\uf067'),
                Widget.Label({ className: 'dyn-island-todo-add-label', label: 'Tambah' }),
            ],
        }),
        onClicked: () => globalThis.todoWindow?.open?.(null),
    });
    const header = Widget.CenterBox({
        className: 'dyn-island-todo-header',
        startWidget: Widget.Box({ spacing: 8, children: [title, context] }),
        endWidget: add,
    });
    header.set_size_request(PAGE_W, 24);

    const pane = Widget.Scrollable({
        className: 'dyn-island-todo-pane',
        hscroll: 'never',
        vscroll: 'external',
    });
    const list = Widget.Box({ className: 'dyn-island-todo-list', vertical: true, spacing: 2 });
    pane.child = list;
    pane.set_size_request(PAGE_W, LIST_H);

    const scrollPane = event => {
        const dy = scrollDelta(event);
        if (!dy) return false;
        const adjustment = pane.get_vadjustment();
        if (!adjustment) return false;
        const max = Math.max(0, adjustment.upper - adjustment.page_size);
        if (max <= 0) return false;
        adjustment.value = Math.max(0, Math.min(max, adjustment.value + dy * 36));
        return true;
    };
    pane.connect('scroll-event', (_self, event) => scrollPane(event));

    const TaskRow = task => {
        const text = Widget.Label({
            className: `dyn-island-todo-text${task.done ? ' done' : ''}`,
            label: task.text,
            xalign: 0,
            hexpand: true,
            truncate: 'end',
            maxWidthChars: 40,
        });
        const children = [Check(task.done), text];
        if (task.due) {
            children.push(Widget.Label({
                className: `dyn-island-todo-due${task.done ? ' done' : ''}`,
                label: task.due,
            }));
        }

        const main = Widget.Button({
            className: 'dyn-island-todo-main',
            hexpand: true,
            tooltipText: `${task.text}${task.due ? ` · ${task.due}` : ''}\n`
                + (task.done ? 'Tandai belum selesai' : 'Tandai selesai'),
            child: Widget.Box({
                spacing: 8,
                valign: Gtk.Align.CENTER,
                children,
            }),
            onClicked: () => toggleTask(task.id),
        });
        const edit = Widget.Button({
            className: 'dyn-island-todo-action',
            tooltipText: 'Edit tugas',
            child: icon('dyn-island-todo-action-icon', '\uf044'),
            onClicked: () => globalThis.todoWindow?.open?.(task),
        });
        const remove = Widget.Button({
            className: 'dyn-island-todo-action is-danger',
            tooltipText: 'Hapus tugas',
            child: icon('dyn-island-todo-action-icon', '\uf1f8'),
            onClicked: () => {
                pendingDelete = task.id;
                rebuild();
            },
        });

        return Widget.Box({
            className: 'dyn-island-todo-task',
            spacing: 2,
            hexpand: true,
            children: [main, edit, remove],
        });
    };

    const DeleteRow = task => {
        const cancel = Widget.Button({
            className: 'dyn-island-todo-confirm-cancel',
            child: Widget.Label({ className: 'dyn-island-todo-confirm-cancel-label', label: 'Batal' }),
            onClicked: () => {
                pendingDelete = null;
                rebuild();
            },
        });
        const confirm = Widget.Button({
            className: 'dyn-island-todo-confirm-ok',
            child: Widget.Label({ className: 'dyn-island-todo-confirm-ok-label', label: 'Hapus' }),
            onClicked: () => {
                removeTask(task.id);
                pendingDelete = null;
                rebuild();
            },
        });
        return Widget.Box({
            className: 'dyn-island-todo-confirm',
            spacing: 8,
            hexpand: true,
            children: [
                Widget.Label({
                    className: 'dyn-island-todo-confirm-text',
                    label: `Hapus “${task.text}”?`,
                    xalign: 0,
                    hexpand: true,
                    truncate: 'end',
                    maxWidthChars: 38,
                }),
                cancel,
                confirm,
            ],
        });
    };

    const rebuild = () => {
        const state = todo.value;
        const total = totalCount(state);
        const done = doneCount(state);
        context.label = total ? `${done}/${total} selesai` : 'Belum ada tugas';

        if (pendingDelete !== null
            && !state.tasks.some(task => task.id === pendingDelete)) {
            pendingDelete = null;
        }

        // Aktif dulu, selesai di bawah; yang terbaru di atas agar tugas baru
        // langsung terlihat tanpa perlu scroll.
        const ordered = state.tasks.slice().sort((a, b) =>
            (Number(a.done) - Number(b.done))
            || (Number(b.id) - Number(a.id)));

        list.children = ordered.length
            ? ordered.map(task => (pendingDelete === task.id
                ? DeleteRow(task)
                : TaskRow(task)))
            : [Widget.Label({
                className: 'dyn-island-todo-empty',
                label: 'Belum ada tugas',
                xalign: 0.5,
                halign: Gtk.Align.CENTER,
                valign: Gtk.Align.CENTER,
                vexpand: true,
            })];
    };

    return Widget.Box({
        className: 'dyn-island-todo',
        vertical: true,
        spacing: 4,
        halign: Gtk.Align.CENTER,
        valign: Gtk.Align.CENTER,
        children: [header, pane],
        setup: self => {
            rebuild();
            self.hook(todo, rebuild);
            self.hook(page, () => {
                if (page.value !== 'todo' && pendingDelete !== null) {
                    pendingDelete = null;
                    rebuild();
                }
            });
            self.connect('map', () => {
                const top = self.get_toplevel();
                if (!top || top.__todoScrollHooked) return;
                top.__todoScrollHooked = true;
                top.connect('scroll-event', (_w, event) => {
                    if (page.value !== 'todo' || !pane.get_mapped()) return false;
                    return scrollPane(event);
                });
            });
        },
    });
};
