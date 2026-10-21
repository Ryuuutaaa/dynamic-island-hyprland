import Gtk from 'gi://Gtk?version=3.0';
import GLib from 'gi://GLib';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';
import Hyprland from 'resource:///com/github/Aylur/ags/service/hyprland.js';
import { ramp } from '../spring.js';
import { palette, hexToRgb } from '../theme.js';
import { roundedRect } from '../draw.js';
import { latest, invokeAction, closeNotification } from './notify.js';

// Popup notifikasi kanan atas, digambar sendiri (bukan swaync) supaya bisa:
// slide masuk dari kanan, loading bar 5 detik, tombol X, klik -> buka aplikasi,
// dan action ringkas (install/update -> ikon unduh).
//
// Slide dianimasikan manual (parse GLib, seperti notch), bukan lewat animasi
// GTK:
//   - margin layer negatif ditolak compositor -> surface tidak ter-mount, dan
//   - Gtk.Revealer tidak pernah menyelesaikan transisinya di surface AGS ini
//     (`child_revealed` tetap false walau alokasinya penuh).
// Window diberi ukuran minimum tetap; kartu di-pin ke kanan oleh CenterBox lalu
// digeser lewat margin_end negatif (kartu bergeser, lebarnya tidak berubah).

const W = 340;            // lebar kartu
const PAD = 14;           // padding kiri/kanan kartu (sama dengan CSS)
const INSET = 12;         // jarak kartu dari tepi atas/kanan layar
const FULL = W + 2 * PAD;      // window = kartu + padding 10 kiri/kanan
const CONTENT = W - 2 * PAD - 2; // isi kartu (dikurangi border 1px)
const DURATION = 5000;    // loading bar = sisa waktu tampil (ms)
const SLIDE = 240;        // durasi animasi masuk/keluar (ms)

const ACCENT = hexToRgb(palette.accent2);
const FG = hexToRgb(palette.fg);

const isInstall = text => /install|instal|update|upgrade|unduh|pasang|download/i.test(text);
const MAX_BODY = 140;
const MAX_SUMMARY = 60;

const truncate = (text, max) => {
    const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
    return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
};

export default () => {
    const icon = Widget.Icon({ className: 'dyn-island-popup-icon', size: 26 });
    const glyph = Widget.Label({ className: 'dyn-island-popup-glyph', label: '\uf0f3' });
    const summary = Widget.Label({
        className: 'dyn-island-popup-title',
        xalign: 0,
        truncate: 'end',
        maxWidthChars: 30,
    });
    const body = Widget.Label({
        className: 'dyn-island-popup-body',
        xalign: 0,
        wrap: true,
        maxWidthChars: 40,
    });

    // Loading bar: Cairo, fraksi disimpan supaya bisa digambar ulang per tick.
    let fraction = 1;
    const bar = Widget.DrawingArea({
        className: 'dyn-island-popup-bar',
        setup: self => {
            self.set_size_request(CONTENT, 3);
            self.setFraction = value => {
                fraction = Math.max(0, Math.min(1, value));
                self.queue_draw();
            };
        },
        drawFn: (self, cr, width, height) => {
            const radius = height / 2;
            cr.setSourceRGBA(FG[0], FG[1], FG[2], 0.12);
            roundedRect(cr, 0, 0, width, height, radius);
            cr.fill();
            if (fraction <= 0) return;
            cr.setSourceRGBA(ACCENT[0], ACCENT[1], ACCENT[2], 0.85);
            roundedRect(cr, 0, 0, Math.max(height, width * fraction), height, radius);
            cr.fill();
        },
    });

    let currentId = 0;
    let currentApp = '';
    let shownSeq = -1;
    let hidden = true;
    let hiding = false;
    let slideTween = null;

    let timer = 0;
    let left = DURATION;
    let last = 0;
    let hovered = false;

    const stopTimer = () => {
        if (timer) {
            GLib.source_remove(timer);
            timer = 0;
        }
        last = 0;
    };


    const slideTo = (from, to, onDone) => {
        if (slideTween) slideTween.stop();
        slideTween = ramp({
            duration: SLIDE,
            onFrame: p => { adj.value = from + (to - from) * p; },
            onDone: () => {
                slideTween = null;
                if (onDone) onDone();
            },
        });
        slideTween.start();
    };

    const hide = (immediate = false) => {
        if (hidden) return;
        stopTimer();
        hovered = false;
        if (immediate) {
            hiding = false;
            if (slideTween) slideTween.stop();
            slideTween = null;
            adj.value = 0;
            win.visible = false;
            hidden = true;
            return;
        }
        hiding = true;
        slideTo(Math.round(adj.page_size) || FULL, 0, () => {
            // notifikasi baru bisa membatalkan exit (lihat show)
            if (!hiding) return;
            hiding = false;
            win.visible = false;
            hidden = true;
        });
    };

    const tick = () => {
        const now = GLib.get_monotonic_time() / 1000;
        if (!hovered && last) left -= now - last;
        last = now;
        bar.setFraction(left / DURATION);
        if (left <= 0) {
            timer = 0;
            hide();
            return GLib.SOURCE_REMOVE;
        }
        return GLib.SOURCE_CONTINUE;
    };

    const startTimer = () => {
        stopTimer();
        left = DURATION;
        hovered = false;
        bar.setFraction(1);
        timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, tick);
    };

    const openSource = () => {
        if (currentId) {
            invokeAction(currentId, 'default');
            hide();
            return;
        }
        // tanpa id (jarang): fokuskan window aplikasi sumber kalau ada
        const query = String(currentApp).toLowerCase();
        if (query) {
            Utils.execAsync(['hyprctl', '-j', 'clients'])
                .then(raw => {
                    const hit = JSON.parse(raw).find(c =>
                        `${c.class} ${c.title}`.toLowerCase().includes(query));
                    if (hit) Utils.execAsync(['hyprctl', 'dispatch', 'focuswindow', `address:${hit.address}`]);
                })
                .catch(() => { });
        }
        hide();
    };

    const actionRow = Widget.Box({
        className: 'dyn-island-popup-actions',
        spacing: 6,
        visible: false,
    });

    const buildActions = actions => {
        const pairs = [];
        for (let i = 0; i + 1 < actions.length; i += 2) {
            const key = actions[i];
            const label = actions[i + 1] || key;
            if (!key || key === 'default') continue;
            pairs.push([key, label]);
        }
        actionRow.children = pairs.map(([key, label]) => Widget.Button({
            className: 'dyn-island-popup-action',
            tooltipText: label,
            child: Widget.Label({
                className: 'dyn-island-popup-action-label',
                label: isInstall(label) ? '\uf019' : truncate(label, 16),
            }),
            onClicked: () => {
                if (currentId) invokeAction(currentId, key);
                hide();
            },
        }));
        actionRow.visible = pairs.length > 0;
    };

    const clickArea = Widget.EventBox({
        className: 'dyn-island-popup-hit',
        child: Widget.Box({
            spacing: 10,
            children: [
                Widget.Box({
                    className: 'dyn-island-popup-iconbox',
                    valign: Gtk.Align.START,
                    // lebar tetap: ikon tema (26) vs glyph fallback (22) dulu
                    // menggeser awal teks 4px antar notifikasi
                    widthRequest: 26,
                    children: [icon, glyph],
                }),
                Widget.Box({
                    className: 'dyn-island-popup-text',
                    vertical: true,
                    spacing: 2,
                    children: [summary, body],
                }),
            ],
        }),
        setup: self => {
            self.connect('button-press-event', () => {
                openSource();
                return true;
            });
        },
    });

    const closeButton = Widget.Button({
        className: 'dyn-island-popup-close',
        tooltipText: 'Tutup',
        valign: Gtk.Align.START,
        // target klik 17x15 terukur terlalu kecil untuk sudut kartu
        widthRequest: 20,
        heightRequest: 20,
        child: Widget.Label({ className: 'dyn-island-popup-close-icon', label: '\uf00d' }),
        onClicked: () => {
            closeNotification(currentId);
            hide();
        },
    });

    const head = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL });
    head.get_style_context().add_class('dyn-island-popup-head');
    // lebar isi dikunci: kalau mengikuti natural teks, lebar kartu bergeser
    // 2px antar notifikasi (terukur 342 vs 344) dan inset kanan tidak simetris
    head.set_size_request(CONTENT, -1);
    head.pack_start(clickArea, true, true, 0);
    head.pack_end(closeButton, false, false, 0);

    // margin di level widget: `margin-top` lewat CSS GTK tidak diterapkan pada
    // DrawingArea/Box di sini (terukur bar menempel ke konten)
    actionRow.set_margin_top(10);
    bar.set_margin_top(10);

    const card = Widget.Box({
        className: 'dyn-island-popup',
        vertical: true,
        widthRequest: W,
        children: [
            // Gtk.Box mentah: pack_start(expand) membuat area klik mengisi,
            // X tetap selebar natural-nya di pojok kanan. (CenterBox tanpa
            // center widget membagi sisa ruang ke X -> terukur 105px.)
            head,
            actionRow,
            bar,
        ],
    });

    // Hover menahan countdown supaya notifikasi bisa dibaca/diklik.
    // lebar pad dikunci ke FULL: kalau mengikuti natural kartu, CenterBox
    // menaruhnya di x=0/2 dan inset kanan kartu bergeser 2px antar notifikasi
    const pad = Widget.Box({ className: 'dyn-island-popup-pad', children: [card] });
    pad.set_size_request(FULL, -1);

    const hoverArea = Widget.EventBox({
        className: 'dyn-island-popup-hover',
        child: pad,
        setup: self => {
            self.connect('enter-notify-event', () => { hovered = true; return false; });
            self.connect('leave-notify-event', () => { hovered = false; return false; });
        },
    });

    // Slide = geser kartu di dalam viewport tetap, lewat scroll offset.
    // Ini satu-satunya cara yang terukur benar-benar MEMINDAHKAN kartu:
    //   - margin_end hanya mengubah alokasi internal (posisi kartu tetap),
    //   - Gtk.Revealer hanya meng-clip child (allocation-nya tetap x=0),
    //   - margin layer negatif ditolak compositor (surface tidak ter-mount).
    // Kartu diletakkan di x=FULL dalam Fixed selebar 2*FULL; viewport mulai
    // di offset 0 (kartu di luar kanan) lalu digeser ke FULL.
    const fixed = new Gtk.Fixed();
    fixed.set_size_request(2 * FULL + 2 * PAD, -1);
    fixed.put(hoverArea, FULL, 0);

    const sw = new Gtk.ScrolledWindow({
        hscrollbar_policy: Gtk.PolicyType.EXTERNAL,
        vscrollbar_policy: Gtk.PolicyType.NEVER,
    });
    sw.set_propagate_natural_width(false);
    sw.set_propagate_natural_height(true);
    sw.set_size_request(FULL, -1);
    sw.get_style_context().add_class('dyn-island-popup-scroll');
    sw.add(fixed);
    const adj = sw.get_hadjustment();
    adj.value = 0;

    const win = Widget.Window({
        name: 'dyn-island-notif-popup',
        className: 'dyn-island-popup-window',
        layer: 'overlay',
        anchor: ['top', 'right'],
        exclusivity: 'ignore',
        keymode: 'none',
        margins: [INSET, INSET, 0, 0],
        visible: false,
        child: sw,
    });
    win.popupPad = hoverArea; // untuk pengujian (ags -r)
    win.popupAdj = adj;       // untuk pengujian (ags -r)
    win.hidePopup = () => hide();   // untuk pengujian (ags -r)

    // ikuti monitor yang sedang fokus (sama seperti island)
    const follow = () => {
        const id = Hyprland.active?.monitor?.id;
        if (typeof id === 'number' && win.monitor !== id) win.monitor = id;
    };
    follow();
    win.hook(Hyprland.active.monitor, follow, 'changed');

    const show = item => {
        currentId = item.id || 0;
        currentApp = item.app || '';
        summary.label = truncate(item.summary || '(notifikasi)', MAX_SUMMARY);
        body.label = truncate(item.body || '', MAX_BODY);
        body.visible = !!item.body;
        // Provider dikenal (WhatsApp/Telegram/Discord) -> glyph brand.
        // Selain itu: nama ikon tema kalau ada, kalau tidak lonceng.
        const provider = item.provider || null;
        const useIcon = !provider && !!item.icon
            && !item.icon.startsWith('/') && !item.icon.includes('.');
        icon.visible = useIcon;
        glyph.visible = !useIcon;
        if (useIcon) icon.icon = item.icon;
        glyph.label = provider ? provider.glyph : '\uf0f3';
        buildActions(item.actions || []);

        if (hiding) {
            // sedang slide keluar: tarik kembali ke dalam supaya notifikasi
            // baru tidak ikut ter-unmap saat exit selesai
            hiding = false;
            slideTo(adj.value, Math.round(adj.page_size) || FULL);
        }
        if (hidden) {
            win.visible = true;
            hidden = false;
            // posisi kartu = lebar viewport (baru diketahui setelah layout)
            const page = Math.round(adj.page_size) || FULL;
            fixed.move(hoverArea, page, 0);
            adj.value = 0;
            // ScrolledWindow menambah ~8px di kanan; kurangi margin layer
            // supaya inset kanan kartu sama dengan inset atas (12px)
            const extra = Math.max(0, page - FULL);
            win.margins = [INSET, Math.max(0, INSET - extra), 0, 0];
            // tunggu layout selesai: sebelum itu adj.upper masih 0 sehingga
            // nilai scroll ter-clamp ke 0 dan animasi tidak bergerak
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 80, () => {
                slideTo(0, Math.min(Math.round(adj.page_size) || FULL,
                    adj.upper - adj.page_size));
                return GLib.SOURCE_REMOVE;
            });
        }
        startTimer();
    };

    latest.connect('changed', () => {
        const item = latest.value;
        if (!item) return;
        if (item.seq === shownSeq) {
            // id menyusul dari method return: simpan, jangan tampil ulang
            currentId = item.id || currentId;
            return;
        }
        shownSeq = item.seq;
        show(item);
    });

    return win;
};
