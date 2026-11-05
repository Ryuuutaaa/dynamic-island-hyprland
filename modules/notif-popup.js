import Gtk from 'gi://Gtk?version=3.0';
import GdkPixbuf from 'gi://GdkPixbuf?version=2.0';
import GLib from 'gi://GLib';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';
import { ramp } from '../spring.js';
import { palette, hexToRgb } from '../theme.js';
import { roundedRect } from '../draw.js';
import { latest, invokeAction, closeNotification } from './notify.js';
import { followFocused } from './monitor.js';
import { muteApp } from './settings.js';

// Popup notifikasi kanan atas, digambar sendiri (bukan swaync) supaya bisa:
// slide masuk dari kanan, loading bar 5 detik, tombol X, klik -> buka aplikasi,
// dan action ringkas (install/update -> ikon unduh).
//
// Sejak P0 Poni, popup menampilkan tumpukan maksimal tiga kartu dengan jarak
// 6px; kartu terbaru paling atas, kartu tertua memudar. Hanya kartu terbaru
// yang punya loading bar dan menjadi acuan timer tampil.
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
const DURATION_MIN = 3000;
const DURATION_MAX = 15000;
const NEVER_EXPIRE_MS = 12000;
const STACK_SIZE = 3;
const STACK_GAP = 6;
const OPACITY = [1, 0.72, 0.45]; // terbaru -> tertua

// expire_time dari pengirim: -1 = default server, 0 = tidak pernah
// kedaluwarsa, >0 = durasi yang diminta. Dibatasi supaya popup tidak
// menetap terlalu lama atau hilang terlalu cepat.
const durationFor = item => {
    const expire = Number(item?.expire);
    if (!Number.isFinite(expire)) return DURATION;
    if (expire === 0) return NEVER_EXPIRE_MS;
    if (expire < 0) return DURATION;
    return Math.max(DURATION_MIN, Math.min(DURATION_MAX, expire));
};
const HOVER_MAX = 15000;  // batas hover: leave-notify bisa tidak terkirim
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

const loadingBar = () => {
    let fraction = 1;
    return Widget.DrawingArea({
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
};

const addActions = (item, actionRow, dismiss) => {
    const pairs = [];
    for (let i = 0; i + 1 < (item.actions || []).length; i += 2) {
        const key = item.actions[i];
        const label = item.actions[i + 1] || key;
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
            if (item.id) invokeAction(item.id, key, item.app);
            dismiss(item);
        },
    }));
    actionRow.visible = pairs.length > 0;
};

const buildCard = (item, index, { dismiss, open, close }) => {
    const icon = Widget.Icon({ className: 'dyn-island-popup-icon', size: 26 });
    const glyph = Widget.Label({ className: 'dyn-island-popup-glyph', label: '\uf0f3' });
    // Ikon situs (Chromium) yang sudah disalin ke cache oleh notify.js.
    const photo = Gtk.Image.new();
    photo.set_size_request(26, 26);

    const summary = Widget.Label({
        className: 'dyn-island-popup-title',
        xalign: 0,
        truncate: 'end',
        maxWidthChars: 30,
        label: truncate(item.summary || '(notifikasi)', MAX_SUMMARY),
    });
    const body = Widget.Label({
        className: 'dyn-island-popup-body',
        xalign: 0,
        wrap: true,
        maxWidthChars: 40,
        label: truncate(item.body || '', MAX_BODY),
    });
    body.visible = !!item.body;

    // Prioritas ikon: glyph provider (native WA/Telegram/Discord) ->
    // ikon situs yang disalin saat notifikasi masuk (web app di browser) ->
    // nama ikon tema -> lonceng.
    const provider = item.provider || null;
    let pixbuf = null;
    if (!provider && item.iconLocal) {
        try {
            pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_scale(item.iconLocal, 26, 26, true);
        } catch (_) {
            pixbuf = null;
        }
    }
    photo.visible = !!pixbuf;
    if (pixbuf) photo.set_from_pixbuf(pixbuf);

    const useIcon = !provider && !pixbuf && !!item.icon
        && !item.icon.startsWith('/') && !item.icon.includes('.');
    icon.visible = useIcon;
    if (useIcon) icon.icon = item.icon;
    // Glyph TAMPIL kalau ada provider; kalau tidak, hanya saat tidak ada
    // ikon situs maupun ikon tema (fallback lonceng).
    glyph.visible = !!provider || (!pixbuf && !useIcon);
    glyph.label = provider ? provider.glyph : '\uf0f3';

    const actionRow = Widget.Box({
        className: 'dyn-island-popup-actions',
        spacing: 6,
        visible: false,
    });
    addActions(item, actionRow, dismiss);

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
                    children: [icon, glyph, photo],
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
                open(item);
                return true;
            });
        },
    });

    const closeButton = Widget.Button({
        className: 'dyn-island-popup-close',
        tooltipText: 'Tutup',
        valign: Gtk.Align.START,
        // target klik 17x15 terukur terlalu kecil untuk sudut kartu
        widthRequest: 24,
        heightRequest: 24,
        child: Widget.Label({ className: 'dyn-island-popup-close-icon', label: '\uf00d' }),
        onClicked: () => close(item),
    });

    const muteButton = Widget.Button({
        className: 'dyn-island-popup-mute',
        tooltipText: item.app ? `Bisukan ${item.app}` : 'Bisukan aplikasi ini',
        valign: Gtk.Align.START,
        widthRequest: 24,
        heightRequest: 24,
        visible: !!item.app,
        child: Widget.Label({ className: 'dyn-island-popup-mute-icon', label: '\uf1f6' }),
        onClicked: () => {
            if (item.app) muteApp(item.app);
            dismiss(item);
        },
    });

    const head = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL });
    head.get_style_context().add_class('dyn-island-popup-head');
    // lebar isi dikunci: kalau mengikuti natural teks, lebar kartu bergeser
    // 2px antar notifikasi (terukur 342 vs 344) dan inset kanan tidak simetris
    head.set_size_request(CONTENT, -1);
    head.pack_start(clickArea, true, true, 0);
    head.pack_end(closeButton, false, false, 0);
    head.pack_end(muteButton, false, false, 0);

    // margin di level widget: `margin-top` lewat CSS GTK tidak diterapkan pada
    // DrawingArea/Box di sini (terukur bar menempel ke konten)
    actionRow.set_margin_top(10);

    const bar = loadingBar();
    bar.set_margin_top(10);
    // hanya kartu terbaru yang menghitung mundur; kartu lama sudah "berjalan"
    // dan cukup memudar sebagai konteks. no_show_all wajib: show_all milik
    // window akan menampilkan kembali child yang sudah visible=false.
    bar.visible = index === 0;
    if (index > 0) bar.set_no_show_all(true);
    item.bar = index === 0 ? bar : null;

    // Opacity hanya pada isi, bukan kartu: latar tetap hitam solid supaya
    // terminal/wallpaper di belakang tidak membocor dan teks lama tetap
    // terbaca. (Opacity di kartu membuat 3 lapis kartu tembus pandang.)
    const inner = Widget.Box({
        className: 'dyn-island-popup-inner',
        vertical: true,
        children: [head, actionRow, bar],
    });
    inner.set_opacity(OPACITY[index] ?? OPACITY[OPACITY.length - 1]);

    return Widget.Box({
        className: 'dyn-island-popup',
        vertical: true,
        widthRequest: W,
        children: [inner],
    });
};

export default () => {
    let items = [];
    let shownSeq = -1;
    let hidden = true;
    let hiding = false;
    let slideTween = null;

    let timer = 0;
    let left = DURATION;
    let duration = DURATION;
    let last = 0;
    let hovered = false;
    let hoveredAt = 0;

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
            items = [];
            stack.children = [];
            return;
        }
        hiding = true;
        slideTo(Math.round(adj.page_size) || FULL, 0, () => {
            // notifikasi baru bisa membatalkan exit (lihat show)
            if (!hiding) return;
            hiding = false;
            win.visible = false;
            hidden = true;
            items = [];
            stack.children = [];
        });
    };

    const tick = () => {
        const now = GLib.get_monotonic_time() / 1000;
        // Kartu digeser di dalam ScrolledWindow dan surface bisa di-unmap saat
        // animasi; pada kondisi itu leave-notify tidak selalu terkirim sehingga
        // `hovered` tertahan true dan hitungan mundur berhenti selamanya
        // (gejala: notifikasi menetap sampai diklik). Batas ini jaring pengaman.
        if (hovered && hoveredAt && now - hoveredAt > HOVER_MAX) hovered = false;
        if (!hovered && last) left -= now - last;
        last = now;
        const newest = items[0];
        if (newest?.bar) newest.bar.setFraction(duration > 0 ? left / duration : 0);
        if (left <= 0) {
            timer = 0;
            hide();
            return GLib.SOURCE_REMOVE;
        }
        return GLib.SOURCE_CONTINUE;
    };

    const startTimer = (ms = DURATION) => {
        stopTimer();
        duration = ms;
        left = ms;
        hovered = false;
        if (items[0]?.bar) items[0].bar.setFraction(1);
        timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, tick);
    };

    // Hapus satu kartu dari tumpukan. Kalau masih ada kartu lain, timer
    // dihitung ulang untuk kartu yang sekarang paling baru.
    const dismiss = item => {
        const index = items.indexOf(item);
        if (index >= 0) items.splice(index, 1);
        if (!items.length) {
            hide();
            return;
        }
        render();
        startTimer(durationFor(items[0]));
    };

    const close = item => {
        closeNotification(item.id);
        dismiss(item);
    };

    const open = item => {
        if (item.id) {
            invokeAction(item.id, 'default', item.app);
            dismiss(item);
            return;
        }
        // tanpa id (jarang): fokuskan window aplikasi sumber kalau ada
        const query = String(item.app || '').toLowerCase();
        if (query) {
            Utils.execAsync(['hyprctl', '-j', 'clients'])
                .then(raw => {
                    const hit = JSON.parse(raw).find(c =>
                        `${c.class} ${c.title}`.toLowerCase().includes(query));
                    if (hit) Utils.execAsync(['hyprctl', 'dispatch', `hl.dsp.focus({window="address:${hit.address}"})`]);
                })
                .catch(() => { });
        }
        dismiss(item);
    };

    const stack = Widget.Box({
        className: 'dyn-island-popup-stack',
        vertical: true,
        spacing: STACK_GAP,
        widthRequest: W,
    });

    const render = () => {
        items.forEach(item => { item.bar = null; });
        stack.children = items.map((item, index) =>
            buildCard(item, index, { dismiss, open, close }));
    };

    // Hover menahan countdown supaya notifikasi bisa dibaca/diklik.
    // lebar pad dikunci ke FULL: kalau mengikuti natural kartu, CenterBox
    // menaruhnya di x=0/2 dan inset kanan kartu bergeser 2px antar notifikasi
    const pad = Widget.Box({ className: 'dyn-island-popup-pad', children: [stack] });
    pad.set_size_request(FULL, -1);

    const hoverArea = Widget.EventBox({
        className: 'dyn-island-popup-hover',
        child: pad,
        setup: self => {
            self.connect('enter-notify-event', () => {
                hovered = true;
                hoveredAt = GLib.get_monotonic_time() / 1000;
                return false;
            });
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
    win.stackItems = () => items.length;
    win.dismissTop = () => { if (items[0]) dismiss(items[0]); };

    // ikuti monitor yang sedang fokus (sama seperti island). Pemetaannya lewat
    // modules/monitor.js: id Hyprland bukan index GdkMonitor.
    followFocused(win);

    const show = item => {
        // update id untuk notifikasi yang sudah tampil tidak menambah kartu
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
        } else if (hiding) {
            // sedang slide keluar: tarik kembali ke dalam supaya notifikasi
            // baru tidak ikut ter-unmap saat exit selesai
            hiding = false;
            slideTo(adj.value, Math.round(adj.page_size) || FULL);
        }
        startTimer(durationFor(item));
    };

    latest.connect('changed', () => {
        const item = latest.value;
        if (!item) return;
        if (item.seq === shownSeq) {
            // id menyusul dari method return: simpan, jangan tampil ulang
            const shown = items.find(entry => entry.seq === shownSeq);
            if (shown) shown.id = item.id || shown.id;
            return;
        }
        shownSeq = item.seq;
        items.unshift(item);
        items = items.slice(0, STACK_SIZE);
        render();
        show(item);
    });

    return win;
};
