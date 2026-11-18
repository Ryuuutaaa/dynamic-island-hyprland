// Widget desktop (kiri atas, di atas wallpaper): tiga kartu kaca terpisah.
//
//   ┌──────────────┐ ┌────────────────────┐
//   │ JADWAL SHOLAT│ │ TUGAS          1/7 │
//   └──────────────┘ └────────────────────┘
//   ┌─────────────────────────────────────┐
//   │ STANDUP · Rabu, 18 November [Simpan]│
//   └─────────────────────────────────────┘
//
// Data diambil dari modul yang sama dengan dynamic-island (prayer/todo/
// standup), jadi tidak ada salinan kedua dan tidak ada polling tambahan.

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

// Lebar kolom. Kartu sholat sengaja sempit (isinya pendek), kartu tugas lebih
// lebar supaya judul tugas tidak perlu dipotong.
const PRAYER_W = 236;
const TODO_W = 344;
const GAP = 12;
const TOTAL_W = PRAYER_W + GAP + TODO_W;

// waybar memesan 47px di atas; 16px jarak di bawahnya
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

// Batas jumlah baris yang tampil. Widget ini menempel di wallpaper, bukan
// panel interaktif: scroll di sini canggung (butuh pointer tepat di atasnya)
// dan GtkScrolledWindow memotong baris terakhir separuh serta menyisakan
// tinggi kosong. Lebih baik tampilkan beberapa baris utuh + penanda sisa.
const TODO_VISIBLE = 4;
const STANDUP_VISIBLE = 3;

const MoreRow = (count, label) => Widget.Label({
    className: 'dwm-more',
    label: `+${count} ${label}`,
    xalign: 0,
});

const Card = ({ className = '', width, children, setup }) => Widget.Box({
    className: `dwm-card ${className}`.trim(),
    vertical: true,
    widthRequest: width,
    spacing: 8,
    children,
    setup,
});

// Judul kartu: label kecil berhuruf jarak lebar + isi bebas di kanan.
const Head = (title, extra = []) => Widget.Box({
    className: 'dwm-head',
    spacing: 6,
    children: [
        Widget.Label({ className: 'dwm-title', label: title, xalign: 0 }),
        Widget.Label({ hexpand: true }),
        ...extra,
    ],
});

// ── kartu 1: jadwal sholat ────────────────────────────────────────────────
function PrayerCard() {
    const city = Widget.Label({
        className: 'dwm-sub',
        xalign: 1,
        truncate: 'end',
        maxWidthChars: 13,
    });

    const nextName = Widget.Label({
        className: 'dwm-prayer-next',
        xalign: 0,
        truncate: 'end',
        maxWidthChars: 15,
    });
    const countdown = tabular(Widget.Label({
        className: 'dwm-prayer-countdown',
        xalign: 1,
    }));

    const list = Widget.Box({
        className: 'dwm-prayer-list',
        vertical: true,
        spacing: 1,
    });

    // Baris waktu dibuat sekali (lima waktu tetap); hanya kelas & label yang
    // diperbarui, supaya tidak ada widget baru tiap detik.
    const rows = new Map();
    const ensureRows = times => {
        if (rows.size === times.length && times.every(t => rows.has(t.key))) return;
        rows.clear();
        list.children = times.map(time => {
            const name = Widget.Label({
                className: 'dwm-prayer-name',
                label: time.name,
                xalign: 0,
            });
            const value = tabular(Widget.Label({
                className: 'dwm-prayer-time',
                label: time.label,
                xalign: 1,
            }));
            const row = Widget.Box({
                className: 'dwm-prayer-row',
                spacing: 6,
                children: [name, Widget.Label({ hexpand: true }), value],
            });
            rows.set(time.key, row);
            return row;
        });
    };

    const tick = () => {
        const state = prayer.value;
        ensureRows(state?.times ?? []);

        if (!state?.times?.length) {
            nextName.label = 'Jadwal belum siap';
            countdown.label = '—';
            city.label = state?.error ?? '';
            for (const row of rows.values()) row.className = 'dwm-prayer-row';
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
            const row = rows.get(time.key);
            if (!row) continue;
            const isNext = time.key === next?.key;
            const isPast = !isNext && time.minutes < nowMinutes;
            row.className = 'dwm-prayer-row'
                + (isNext ? ' is-next' : '')
                + (isPast ? ' is-past' : '');
        }
    };

    return Card({
        className: 'dwm-card-prayer',
        width: PRAYER_W,
        children: [
            Head('JADWAL SHOLAT', [city]),
            Widget.Box({
                spacing: 8,
                valign: Gtk.Align.END,
                children: [nextName, Widget.Label({ hexpand: true }), countdown],
            }),
            list,
        ],
        setup: self => {
            tick();
            self.hook(prayer, tick);
            Utils.interval(1000, tick, self);
        },
    });
}

// ── kartu 2: tugas ────────────────────────────────────────────────────────
function TodoCard() {
    let pendingDelete = null;

    const counter = tabular(Widget.Label({ className: 'dwm-sub', xalign: 1 }));
    const addButton = Widget.Button({
        className: 'dwm-icon-btn',
        tooltipText: 'Tambah tugas lewat editor',
        child: iconLabel('dwm-icon', '\uf067'),
        onClicked: () => globalThis.todoWindow?.open?.(null),
    });

    const list = Widget.Box({ className: 'dwm-list', vertical: true, spacing: 1 });

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
        // Teks membungkus maksimal dua baris alih-alih dipotong satu baris:
        // judul tugas di sini sering panjang dan isinya perlu terbaca utuh.
        const text = Widget.Label({
            className: `dwm-todo-text${task.done ? ' done' : ''}`,
            label: task.text,
            xalign: 0,
            hexpand: true,
            wrap: true,
            lines: 2,
            ellipsize: 3,
            maxWidthChars: 44,
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
        counter.label = total ? `${done}/${total}` : '';
        counter.tooltipText = total ? `${done} dari ${total} selesai` : 'Belum ada tugas';

        if (pendingDelete !== null && !state.tasks.some(task => task.id === pendingDelete))
            pendingDelete = null;

        // aktif di atas, selesai di bawah; yang terbaru lebih dulu
        const ordered = state.tasks.slice().sort((a, b) =>
            (Number(a.done) - Number(b.done)) || (Number(b.id) - Number(a.id)));

        const shown = ordered.slice(0, TODO_VISIBLE);
        const rest = ordered.length - shown.length;

        list.children = ordered.length
            ? [
                ...shown.map(task => (pendingDelete === task.id ? DeleteRow(task) : TaskRow(task))),
                ...(rest > 0 ? [MoreRow(rest, 'lagi')] : []),
            ]
            : [Widget.Label({ className: 'dwm-empty', label: 'Belum ada tugas' })];
    };

    return Card({
        className: 'dwm-card-todo',
        width: TODO_W,
        children: [
            Head('TUGAS', [counter, addButton]),
            list,
            entry,
        ],
        setup: self => {
            rebuild();
            self.hook(todo, rebuild);
        },
    });
}

// ── kartu 3: daily standup ────────────────────────────────────────────────
function StandupCard() {
    // Satu bagian terbuka pada satu waktu; isinya memakai lebar penuh kartu
    // sehingga teks panjang tidak perlu dipotong.
    let expanded = 'today';

    const dayLabel = Widget.Label({
        className: 'dwm-sub',
        xalign: 1,
        truncate: 'end',
        maxWidthChars: 22,
    });
    const status = Widget.Label({ className: 'dwm-status' });
    const saveButton = Widget.Button({
        className: 'dwm-save',
        tooltipText: 'Simpan standup hari ini',
        child: Widget.Label({ className: 'dwm-save-label', label: 'Simpan' }),
        onClicked: () => {
            saveStandup();
            status.label = 'Tersimpan';
            Utils.timeout(1800, () => { status.label = ''; }, saveButton);
        },
    });

    const chips = Widget.Box({ className: 'dwm-chips', spacing: 6 });

    const body = Widget.Box({
        className: 'dwm-standup-body',
        vertical: true,
        spacing: 1,
    });

    const FIELDS = [
        {
            key: 'yesterday',
            short: 'Kemarin',
            title: () => standup.value.yesterdayTitle,
            placeholder: 'Kegiatan kemarin…',
        },
        {
            key: 'today',
            short: 'Hari ini',
            title: () => 'Hari ini',
            placeholder: 'Rencana hari ini…',
        },
        {
            key: 'blockers',
            short: 'Hambatan',
            title: () => 'Hambatan',
            placeholder: 'Hambatan (kalau ada)…',
        },
    ];

    const entry = Widget.Entry({
        className: 'dwm-entry',
        placeholderText: FIELDS[1].placeholder,
        hexpand: true,
    });

    const submit = () => {
        if (addItem(expanded, entry.text)) {
            entry.text = '';
            // bagian "hari ini" biasanya diisi berurutan; pertahankan fokus
            // supaya bisa langsung mengetik item berikutnya
            entry.grab_focus();
        }
    };
    entry.connect('activate', submit);
    const addButton = Widget.Button({
        className: 'dwm-icon-btn',
        tooltipText: 'Tambah item',
        child: iconLabel('dwm-icon', '\uf067'),
        onClicked: submit,
    });

    const chipButtons = new Map();
    chips.children = FIELDS.map(field => {
        const label = tabular(Widget.Label({ className: 'dwm-chip-label' }));
        const button = Widget.Button({
            className: 'dwm-chip',
            child: label,
            onClicked: () => {
                expanded = expanded === field.key ? null : field.key;
                rebuild();
            },
        });
        chipButtons.set(field.key, { button, label, field });
        return button;
    });

    const rebuild = () => {
        dayLabel.label = standup.value.dayLabel ?? '';

        for (const [, { button, label, field }] of chipButtons) {
            const list = standup.value[field.key] ?? [];
            label.label = `${field.short} ${list.length}`;
            button.tooltipText = field.title();
            button.className = 'dwm-chip' + (expanded === field.key ? ' is-active' : '');
        }

        const items = standup.value[expanded] ?? [];
        const shownItems = items.slice(0, STANDUP_VISIBLE);
        const restItems = items.length - shownItems.length;

        body.children = items.length
            ? [
                ...shownItems.map((text, index) => Widget.Box({
                    className: 'dwm-standup-item',
                    spacing: 6,
                    children: [
                        Widget.Label({ className: 'dwm-bullet', label: '•' }),
                        Widget.Label({
                            className: 'dwm-standup-text',
                            label: text,
                            xalign: 0,
                            hexpand: true,
                            wrap: true,
                            maxWidthChars: 68,
                        }),
                        Widget.Button({
                            className: 'dwm-row-action is-danger',
                            tooltipText: 'Hapus item',
                            child: iconLabel('dwm-row-icon', '\uf00d'),
                            onClicked: () => removeItem(expanded, index),
                        }),
                    ],
                })),
                ...(restItems > 0 ? [MoreRow(restItems, 'item lagi')] : []),
            ]
            : [Widget.Label({
                className: 'dwm-empty',
                label: expanded ? 'Belum ada item' : 'Pilih bagian di atas',
            })];

        const field = FIELDS.find(item => item.key === expanded);
        entry.placeholderText = field?.placeholder ?? 'Pilih bagian dulu…';
        entry.sensitive = !!field;
        addButton.sensitive = !!field;
    };

    return Card({
        className: 'dwm-card-standup',
        width: TOTAL_W,
        children: [
            Head('STANDUP', [status, dayLabel, saveButton]),
            chips,
            body,
            Widget.Box({ className: 'dwm-entry-row', spacing: 4, children: [entry, addButton] }),
        ],
        setup: self => {
            loadStandup();
            rebuild();
            self.hook(standup, rebuild);
        },
    });
}

export default () => {
    const topRow = Widget.Box({
        className: 'dwm-row-cards',
        spacing: GAP,
        children: [PrayerCard(), TodoCard()],
    });

    const standupCard = StandupCard();

    const column = Widget.Box({
        className: 'dwm-column',
        vertical: true,
        spacing: GAP,
        widthRequest: TOTAL_W,
        children: [topRow, standupCard],
    });

    const win = Widget.Window({
        name: 'dyn-island-desktop-widget',
        className: 'dwm-window',
        layer: 'bottom',
        anchor: ['top', 'left'],
        exclusivity: 'ignore',
        // on-demand: entry hanya mengambil keyboard setelah diklik, sehingga
        // klik di luar kartu tetap diteruskan ke desktop
        keymode: 'on-demand',
        margins: [TOP_MARGIN, 0, 0, LEFT_MARGIN],
        child: column,
    });

    // Layer surface memakai ukuran saat map dan TIDAK ikut tumbuh ketika
    // isinya bertambah tinggi. Terukur: window allocH=460 sementara kontennya
    // butuh 498, sehingga baris terpotong. `queue_resize()` saja tidak cukup
    // (sudah diuji) — ukuran window harus diminta ulang secara eksplisit dari
    // tinggi natural kolom.
    const requestResize = () => {
        let height = 0;
        try {
            height = column.get_preferred_height()[1] || 0;
        } catch (_) { }

        if (height > 0) {
            try {
                win.set_size_request(TOTAL_W, height);
            } catch (_) { }
        }

        for (const node of [standupCard, topRow, column, win]) {
            try {
                node?.queue_resize();
            } catch (_) { }
        }
    };

    // Tinggi berubah saat daftar tugas/standup berubah, jadi panggil ulang
    // beberapa kali: satu kali saat children diganti, sekali setelah layout.
    const resizeSoon = () => {
        Utils.idle(requestResize);
        Utils.timeout(60, requestResize, win);
        Utils.timeout(180, requestResize, win);
    };

    win.hook(todo, resizeSoon);
    win.hook(standup, resizeSoon);

    followFocused(win);
    return win;
};
