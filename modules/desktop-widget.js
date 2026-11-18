// Widget desktop (kiri atas, di atas wallpaper): jadwal sholat, tugas, dan
// daily standup. Semua data diambil dari modul yang sama dengan dynamic-island
// (prayer/todo/standup), jadi perubahan di satu tempat langsung terlihat di
// widget ini tanpa penyimpanan terpisah.

import Gtk from 'gi://Gtk?version=3.0';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';
import { palette, hexToRgb } from '../theme.js';
import { prayer } from './prayer.js';
import { nextPrayer } from './prayer-calc.js';
import { todo, addTaskWithDue, toggleTask, removeTask } from './todo.js';
import { standup, addItem, removeItem, loadStandup, saveStandup } from './standup.js';
import { tabular } from './type.js';
import { followFocused } from './monitor.js';

const FG = hexToRgb(palette.fg);
const ACCENT = hexToRgb(palette.accent2);
const GREEN = hexToRgb(palette.ok);
const MUTED = hexToRgb(palette.muted);
const DANGER = hexToRgb(palette.danger ?? palette.accent);

const CARD_W = 340;
const TODO_MAX_H = 190;
const STANDUP_MAX_H = 150;
// waybar memesan 47px di atas; beri jarak 16px di bawahnya
const TOP_MARGIN = 63;
const LEFT_MARGIN = 24;

const pad2 = value => String(value).padStart(2, '0');

const formatCountdown = ms => {
    const total = Math.max(0, Math.floor(ms / 1000));
    return `${pad2(Math.floor(total / 3600))}:`
        + `${pad2(Math.floor((total % 3600) / 60))}:`
        + `${pad2(total % 60)}`;
};

// Checkbox bulat; digambar Cairo karena border-radius tidak meng-clip arc.
const Check = done => Widget.DrawingArea({
    className: 'dwm-todo-check',
    setup: self => self.set_size_request(15, 15),
    drawFn: (self, cr, width, height) => {
        const cx = width / 2;
        const cy = height / 2;
        const radius = Math.min(width, height) / 2 - 1;
        if (radius <= 0) return;

        if (!done) {
            cr.setLineWidth(1.3);
            cr.setSourceRGBA(MUTED[0], MUTED[1], MUTED[2], 0.55);
            cr.arc(cx, cy, radius, 0, Math.PI * 2);
            cr.stroke();
            return;
        }

        cr.setSourceRGBA(GREEN[0], GREEN[1], GREEN[2], 0.95);
        cr.arc(cx, cy, radius, 0, Math.PI * 2);
        cr.fill();

        cr.setLineWidth(1.5);
        cr.setSourceRGB(1, 1, 1);
        cr.moveTo(cx - radius * 0.45, cy);
        cr.lineTo(cx - radius * 0.1, cy + radius * 0.35);
        cr.lineTo(cx + radius * 0.5, cy - radius * 0.35);
        cr.stroke();
    },
});

const iconLabel = (className, label) => Widget.Label({ className, label });

// Samakan tinggi pane dengan isinya, dibatasi `max` supaya kartu tidak
// memanjang saat daftar bertambah.
const fitPane = (pane, content, max) => () => {
    let natural = 0;
    try {
        natural = content.get_preferred_height()[1];
    } catch (_) { }
    const height = Math.min(max, Math.max(0, natural));
    if (pane.get_allocated_height() !== height)
        pane.set_size_request(-1, height);
};

// Versi untuk daftar baris: tinggi dibulatkan ke KELIPATAN tinggi baris,
// supaya tidak ada baris yang terpotong separuh di tepi bawah pane.
const fitRows = (pane, content, max) => () => {
    const children = content.children ?? [];
    if (!children.length) {
        pane.set_size_request(-1, 0);
        return;
    }

    let rowHeight = 30;
    try {
        rowHeight = children[0].get_preferred_height()[1] || 30;
    } catch (_) { }

    const step = rowHeight + 1; // spacing list
    const visible = Math.max(1, Math.floor((max + 1) / step));
    const height = Math.min(children.length, visible) * step - 1;
    pane.set_size_request(-1, Math.max(0, Math.round(height)));
};

const SectionHead = (title, extra = []) => Widget.Box({
    className: 'dwm-head',
    spacing: 8,
    children: [
        Widget.Label({ className: 'dwm-title', label: title, xalign: 0 }),
        Widget.Label({ hexpand: true }),
        ...extra,
    ],
});

// ── jadwal sholat ────────────────────────────────────────────────────────
function PrayerSection() {
    const nextName = Widget.Label({
        className: 'dwm-prayer-next',
        xalign: 0,
        truncate: 'end',
        maxWidthChars: 16,
    });
    const countdown = tabular(Widget.Label({
        className: 'dwm-prayer-countdown',
        xalign: 0,
    }));
    const city = Widget.Label({
        className: 'dwm-sub',
        xalign: 1,
        truncate: 'end',
        maxWidthChars: 14,
    });

    const cells = new Map();
    const timesRow = Widget.Box({
        className: 'dwm-prayer-times',
        homogeneous: true,
        spacing: 2,
    });

    const buildCells = () => {
        const times = prayer.value?.times ?? [];
        if (
            timesRow.children.length === times.length
            && times.every(time => cells.has(time.key))
        ) return;

        cells.clear();
        timesRow.children = times.map(time => {
            const name = Widget.Label({
                className: 'dwm-prayer-cell-name',
                label: time.name,
            });
            const value = tabular(Widget.Label({
                className: 'dwm-prayer-cell-time',
                label: time.label,
            }));
            const cell = Widget.Box({
                className: 'dwm-prayer-cell',
                vertical: true,
                spacing: 1,
                children: [name, value],
            });
            cells.set(time.key, cell);
            return cell;
        });
    };

    const tick = () => {
        const state = prayer.value;
        buildCells();

        if (!state?.times?.length) {
            nextName.label = 'Jadwal belum siap';
            countdown.label = '—';
            city.label = state?.error ?? '';
            for (const cell of cells.values()) cell.className = 'dwm-prayer-cell';
            return;
        }

        city.label = state.city;
        city.tooltipText = `${state.city} · ${state.method}`;

        const now = new Date();
        const nowMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
        const next = nextPrayer(state, now);

        if (next) {
            nextName.label = next.tomorrow ? `Besok ${next.name}` : next.name;
            nextName.tooltipText = nextName.label;
            countdown.label = formatCountdown(next.timestamp - now.getTime());
        } else {
            nextName.label = '—';
            countdown.label = '—';
        }

        for (const time of state.times) {
            const cell = cells.get(time.key);
            if (!cell) continue;
            const isNext = time.key === next?.key;
            const isPast = !isNext && time.minutes < nowMinutes;
            cell.className = 'dwm-prayer-cell'
                + (isNext ? ' is-next' : '')
                + (isPast ? ' is-past' : '');
        }
    };

    return Widget.Box({
        className: 'dwm-section',
        vertical: true,
        spacing: 4,
        children: [
            SectionHead('Jadwal Sholat', [city]),
            Widget.Box({
                spacing: 8,
                valign: Gtk.Align.END,
                children: [nextName, Widget.Label({ hexpand: true }), countdown],
            }),
            timesRow,
        ],
        setup: self => {
            tick();
            self.hook(prayer, tick);
            Utils.interval(1000, tick, self);
        },
    });
}

// ── tugas ────────────────────────────────────────────────────────────────
function TodoSection() {
    let pendingDelete = null;

    const context = Widget.Label({ className: 'dwm-sub', xalign: 1 });
    const addButton = Widget.Button({
        className: 'dwm-icon-btn',
        tooltipText: 'Tambah tugas (buka editor)',
        child: iconLabel('dwm-icon', '\uf067'),
        onClicked: () => globalThis.todoWindow?.open?.(null),
    });
    const head = SectionHead('Tugas', [context, addButton]);

    const pane = Widget.Scrollable({
        className: 'dwm-pane',
        hscroll: 'never',
        vscroll: 'automatic',
        propagateNaturalHeight: false,
    });
    const list = Widget.Box({ className: 'dwm-list', vertical: true, spacing: 1 });
    pane.child = list;
    const syncPane = fitRows(pane, list, TODO_MAX_H);

    const entry = Widget.Entry({
        className: 'dwm-entry',
        placeholderText: 'Tugas baru, Enter untuk menyimpan…',
        hexpand: true,
    });
    entry.connect('activate', () => {
        const text = String(entry.text ?? '').trim();
        if (!text) return;
        if (addTaskWithDue(text, null)) entry.text = '';
    });

    const TaskRow = task => {
        const text = Widget.Label({
            className: `dwm-todo-text${task.done ? ' done' : ''}`,
            label: task.text,
            xalign: 0,
            hexpand: true,
            truncate: 'end',
            maxWidthChars: 34,
        });
        const main = Widget.Button({
            className: 'dwm-todo-main',
            hexpand: true,
            tooltipText: task.done ? 'Tandai belum selesai' : 'Tandai selesai',
            child: Widget.Box({
                spacing: 7,
                valign: Gtk.Align.CENTER,
                children: [
                    Check(task.done),
                    text,
                    ...(task.due
                        ? [tabular(Widget.Label({
                            className: `dwm-todo-due${task.done ? ' done' : ''}`,
                            label: task.due,
                        }))]
                        : []),
                ],
            }),
            onClicked: () => toggleTask(task.id),
        });
        const edit = Widget.Button({
            className: 'dwm-row-action',
            tooltipText: 'Edit tugas',
            child: iconLabel('dwm-row-icon', '\uf044'),
            onClicked: () => globalThis.todoWindow?.open?.(task),
        });
        const remove = Widget.Button({
            className: 'dwm-row-action is-danger',
            tooltipText: 'Hapus tugas',
            child: iconLabel('dwm-row-icon', '\uf1f8'),
            onClicked: () => {
                pendingDelete = task.id;
                rebuild();
            },
        });

        return Widget.Box({
            className: 'dwm-row',
            spacing: 1,
            children: [main, edit, remove],
        });
    };

    const DeleteRow = task => Widget.Box({
        className: 'dwm-row is-confirm',
        spacing: 6,
        children: [
            Widget.Label({
                className: 'dwm-confirm-text',
                label: `Hapus “${task.text}”?`,
                xalign: 0,
                hexpand: true,
                truncate: 'end',
                maxWidthChars: 26,
            }),
            Widget.Button({
                className: 'dwm-mini-btn',
                child: Widget.Label({ className: 'dwm-mini-label', label: 'Batal' }),
                onClicked: () => {
                    pendingDelete = null;
                    rebuild();
                },
            }),
            Widget.Button({
                className: 'dwm-mini-btn is-danger',
                child: Widget.Label({ className: 'dwm-mini-label', label: 'Hapus' }),
                onClicked: () => {
                    removeTask(task.id);
                    pendingDelete = null;
                    rebuild();
                },
            }),
        ],
    });

    const rebuild = () => {
        const state = todo.value;
        const total = state.tasks.length;
        const done = state.tasks.filter(task => task.done).length;
        context.label = total ? `${done}/${total}` : 'kosong';

        if (pendingDelete !== null && !state.tasks.some(task => task.id === pendingDelete))
            pendingDelete = null;

        // aktif di atas, selesai di bawah; yang terbaru lebih dulu
        const ordered = state.tasks.slice().sort((a, b) =>
            (Number(a.done) - Number(b.done)) || (Number(b.id) - Number(a.id)));

        list.children = ordered.length
            ? ordered.map(task => (pendingDelete === task.id ? DeleteRow(task) : TaskRow(task)))
            : [Widget.Label({
                className: 'dwm-empty',
                label: 'Belum ada tugas',
                halign: Gtk.Align.CENTER,
            })];

        Utils.idle(syncPane);
        // GTK baru memperbarui tinggi natural setelah satu siklus layout;
        // ukur ulang sekali lagi agar baris yang baru dibuka tidak terpotong.
        Utils.timeout(80, syncPane, pane);
    };

    return Widget.Box({
        className: 'dwm-section',
        vertical: true,
        spacing: 6,
        children: [head, pane, entry],
        setup: self => {
            rebuild();
            self.hook(todo, rebuild);
        },
    });
}

// ── daily standup ────────────────────────────────────────────────────────
function StandupSection() {
    // Hanya satu bagian terbuka agar kartu tidak langsung memanjang.
    let expanded = 'today';

    const dayLabel = Widget.Label({ className: 'dwm-sub', xalign: 1 });
    const saveButton = Widget.Button({
        className: 'dwm-save',
        tooltipText: 'Simpan standup hari ini',
        child: Widget.Label({ className: 'dwm-save-label', label: 'Simpan' }),
        onClicked: () => {
            saveStandup();
            status.label = 'Tersimpan';
            Utils.timeout(1600, () => { status.label = ''; }, saveButton);
        },
    });
    const status = Widget.Label({ className: 'dwm-status' });

    const body = Widget.Box({ className: 'dwm-standup-body', vertical: true, spacing: 2 });
    const pane = Widget.Scrollable({
        className: 'dwm-pane',
        hscroll: 'never',
        vscroll: 'automatic',
        propagateNaturalHeight: false,
    });
    pane.child = body;
    const syncPane = fitPane(pane, body, STANDUP_MAX_H);

    const FIELDS = [
        { key: 'yesterday', title: () => standup.value.yesterdayTitle, placeholder: 'Kegiatan kemarin…' },
        { key: 'today', title: () => 'Hari ini', placeholder: 'Rencana hari ini…' },
        { key: 'blockers', title: () => 'Hambatan', placeholder: 'Hambatan (kalau ada)…' },
    ];

    const buildField = ({ key, title, placeholder }) => {
        const titleLabel = Widget.Label({
            className: 'dwm-standup-title',
            xalign: 0,
            hexpand: true,
            truncate: 'end',
            maxWidthChars: 22,
        });
        const count = tabular(Widget.Label({ className: 'dwm-standup-count' }));
        const chevron = Widget.Label({ className: 'dwm-standup-chevron' });

        const items = Widget.Box({
            className: 'dwm-standup-items',
            vertical: true,
            spacing: 1,
        });
        const entry = Widget.Entry({
            className: 'dwm-entry dwm-standup-entry',
            placeholderText: placeholder,
            hexpand: true,
        });
        const add = Widget.Button({
            className: 'dwm-icon-btn is-small',
            tooltipText: 'Tambah',
            child: iconLabel('dwm-icon', '\uf067'),
            onClicked: () => {
                if (addItem(key, entry.text)) entry.text = '';
            },
        });
        entry.connect('activate', () => {
            if (addItem(key, entry.text)) entry.text = '';
        });

        const row = Widget.Button({
            className: 'dwm-standup-row',
            child: Widget.Box({
                spacing: 6,
                valign: Gtk.Align.CENTER,
                children: [titleLabel, count, chevron],
            }),
            onClicked: () => {
                expanded = expanded === key ? null : key;
                rebuild();
            },
        });

        const detail = Widget.Box({
            className: 'dwm-standup-detail',
            vertical: true,
            spacing: 3,
            children: [
                items,
                Widget.Box({ spacing: 4, children: [entry, add] }),
            ],
        });

        const root = Widget.Box({
            className: 'dwm-standup-field',
            vertical: true,
            spacing: 2,
            children: [row, detail],
        });

        return { key, root, titleLabel, count, chevron, items, detail, title };
    };

    const fields = FIELDS.map(buildField);
    body.children = fields.map(field => field.root);

    const rebuild = () => {
        dayLabel.label = standup.value.dayLabel ?? '';
        for (const field of fields) {
            const list = standup.value[field.key] ?? [];
            field.titleLabel.label = field.title();
            field.count.label = String(list.length);
            field.chevron.label = expanded === field.key ? '\uf078' : '\uf054';

            const show = expanded === field.key;
            field.detail.no_show_all = !show;
            field.detail.visible = show;

            field.items.children = list.length
                ? list.map((text, index) => Widget.Box({
                    className: 'dwm-standup-item',
                    spacing: 6,
                    children: [
                        Widget.Label({ className: 'dwm-bullet', label: '•' }),
                        Widget.Label({
                            className: 'dwm-standup-item-text',
                            label: text,
                            xalign: 0,
                            hexpand: true,
                            wrap: true,
                            maxWidthChars: 32,
                        }),
                        Widget.Button({
                            className: 'dwm-row-action is-danger',
                            tooltipText: 'Hapus item',
                            child: iconLabel('dwm-row-icon', '\uf00d'),
                            onClicked: () => removeItem(field.key, index),
                        }),
                    ],
                }))
                : [];
            field.items.visible = list.length > 0;
            field.items.no_show_all = list.length === 0;
        }
        Utils.idle(syncPane);
        // GTK baru memperbarui tinggi natural setelah satu siklus layout;
        // ukur ulang sekali lagi agar baris yang baru dibuka tidak terpotong.
        Utils.timeout(80, syncPane, pane);
    };

    return Widget.Box({
        className: 'dwm-section',
        vertical: true,
        spacing: 4,
        children: [
            SectionHead('Standup', [status, dayLabel]),
            pane,
            Widget.Box({
                className: 'dwm-foot',
                spacing: 6,
                children: [Widget.Label({ hexpand: true }), saveButton],
            }),
        ],
        setup: self => {
            loadStandup();
            rebuild();
            self.hook(standup, rebuild);
        },
    });
}

export default () => {
    const divider = () => Widget.Box({ className: 'dwm-divider' });

    const card = Widget.Box({
        className: 'dwm-card',
        vertical: true,
        widthRequest: CARD_W,
        spacing: 10,
        children: [
            PrayerSection(),
            divider(),
            TodoSection(),
            divider(),
            StandupSection(),
        ],
    });

    const win = Widget.Window({
        name: 'dyn-island-desktop-widget',
        className: 'dwm-window',
        layer: 'bottom',
        anchor: ['top', 'left'],
        exclusivity: 'ignore',
        // on-demand: entry hanya mengambil keyboard saat diklik, sehingga
        // klik di luar kartu tetap diteruskan ke desktop
        keymode: 'on-demand',
        margins: [TOP_MARGIN, 0, 0, LEFT_MARGIN],
        child: card,
    });

    followFocused(win);
    return win;
};
