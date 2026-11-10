import Gtk from 'gi://Gtk?version=3.0';
import Gdk from 'gi://Gdk?version=3.0';
import GdkPixbuf from 'gi://GdkPixbuf?version=2.0';
import GLib from 'gi://GLib';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';
import { ramp } from '../spring.js';
import { palette, hexToRgb } from '../theme.js';
import { roundedRect } from '../draw.js';
import { latest, notificationClosed, invokeAction, closeNotification } from './notify.js';
import { followFocused } from './monitor.js';
import { muteApp } from './settings.js';
import { eventButton, rootX, rootY } from './pointer.js';

// Popup notifikasi kanan atas, digambar sendiri (bukan swaync) supaya bisa:
// slide masuk dari kanan, loading bar 5 detik, tombol X, klik -> buka aplikasi,
// dan action ringkas (install/update -> ikon unduh).
//
// Popup menampilkan satu kartu; notifikasi baru masuk antrean FIFO dan
// ditampilkan setelah kartu aktif selesai/ditutup. Hanya kartu aktif yang
// punya loading bar dan menjadi acuan timer tampil.
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
const INSET = 12;         // jarak kartu dari tepi kanan layar
// Di bawah waybar (47px) dan notch closed (50px); 64 dipakai juga oleh
// window chat/standup supaya semua overlay punya garis atas yang sama.
const TOP_INSET = 64;
const FULL = W + 2 * PAD;      // window = kartu + padding 10 kiri/kanan
const CONTENT = W - 2 * PAD - 2; // isi kartu (dikurangi border 1px)
const DURATION = 5000;    // loading bar = sisa waktu tampil (ms)
const DURATION_MIN = 3000;
const DURATION_MAX = 15000;
const NEVER_EXPIRE_MS = 12000;
const OPACITY = [1]; // satu kartu, selalu penuh

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
const DRAG_CLOSE = 60;    // px ke kanan -> tutup
const DRAG_SNOOZE = 24;   // px ke atas -> tunda (clickArea hanya 32px tinggi)
const SNOOZE_MS = 5 * 60 * 1000;
const snoozeDuration = () => {
    const override = Number(globalThis.__notifSnoozeMs);
    return Number.isFinite(override) && override > 0 ? override : SNOOZE_MS;
};

const ACCENT = hexToRgb(palette.accent2);
const FG = hexToRgb(palette.fg);

// Sesi drag aktif. Release bisa jatuh di luar clickArea (drag ke atas) atau
// bahkan di luar surface; window-level release memakai sesi ini sebagai
// fallback supaya gesture tidak menggantung.
let activeDrag = null;

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

const buildCard = (item, index, { dismiss, open, close, dragMove, dragEnd }) => {
    const icon = Widget.Icon({ className: 'dyn-island-popup-icon', size: 26 });
    const glyph = Widget.Label({ className: 'dyn-island-popup-glyph', label: '\uf0f3' });
    // Ikon situs (Chromium) yang sudah disalin ke cache oleh notify.js.
    const photo = Gtk.Image.new();
    photo.set_size_request(26, 26);

    const appName = String(item.app || '').trim();
    const summaryText = String(item.summary || '').trim();
    const appLabel = Widget.Label({
        className: 'dyn-island-popup-app',
        xalign: 0,
        truncate: 'end',
        maxWidthChars: 28,
        label: truncate(appName, 28),
        tooltipText: appName,
        // Jangan ulang "IBus" di atas judul "IBus".
        visible: !!appName && appName.toLowerCase() !== summaryText.toLowerCase(),
    });
    const summary = Widget.Label({
        className: 'dyn-island-popup-title',
        xalign: 0,
        truncate: 'end',
        maxWidthChars: 30,
        label: truncate(item.summary || '(notifikasi)', MAX_SUMMARY),
        tooltipText: item.summary || '',
    });
    const body = Widget.Label({
        className: 'dyn-island-popup-body',
        xalign: 0,
        wrap: true,
        maxWidthChars: 40,
        label: truncate(item.body || '', MAX_BODY),
        tooltipText: item.body || '',
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
        spacing: 8,
        visible: false,
    });
    addActions(item, actionRow, dismiss);

    const clickArea = Widget.EventBox({
        className: 'dyn-island-popup-hit',
        child: Widget.Box({
            spacing: 8,
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
                    spacing: 4,
                    children: [appLabel, summary, body],
                }),
            ],
        }),
        setup: self => {
            let pressed = false;
            let dragging = false;
            let startX = 0;
            let startY = 0;
            self.add_events(Gdk.EventMask.BUTTON1_MOTION_MASK | Gdk.EventMask.BUTTON_RELEASE_MASK);
            self.connect('button-press-event', (_w, event) => {
                if (eventButton(event) !== 1) return false;
                pressed = true;
                dragging = false;
                startX = rootX(event);
                startY = rootY(event);
                activeDrag = { item, card: self.dragCard, startX, startY };
                return true;
            });
            self.connect('motion-notify-event', (_w, event) => {
                if (!pressed) return false;
                const dx = rootX(event) - startX;
                const dy = rootY(event) - startY;
                if (!dragging && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) dragging = true;
                if (dragging) dragMove(dx, dy, self.dragCard);
                return true;
            });
            self.connect('button-release-event', (_w, event) => {
                if (!pressed) return false;
                pressed = false;
                const dx = rootX(event) - startX;
                const dy = rootY(event) - startY;
                const wasDragging = dragging;
                dragging = false;
                activeDrag = null;
                if (wasDragging) dragEnd(dx, dy, item, self.dragCard, close);
                else open(item);
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
        child: Widget.Icon({ className: 'dyn-island-popup-mute-icon', icon: 'notifications-disabled-symbolic', size: 12 }),
        onClicked: () => {
            if (item.app) muteApp(item.app);
            dismiss(item);
        },
    });

    // Window.show_all() akan menampilkan kembali child yang visible=false.
    // Kunci semua elemen kondisional supaya hanya satu ikon yang pernah tampil.
    [icon, glyph, photo, appLabel, body, actionRow, muteButton]
        .forEach(w => w.set_no_show_all(true));
    // Container AGS memanggil show_all saat child ditambahkan; terapkan ulang
    // visibility SETELAH semua container selesai supaya hanya satu ikon tampil.
    icon.visible = useIcon;
    glyph.visible = !!provider || (!pixbuf && !useIcon);
    photo.visible = !!pixbuf;
    appLabel.visible = !!appName && appName.toLowerCase() !== summaryText.toLowerCase();
    body.visible = !!item.body;
    muteButton.visible = !!item.app;

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

    const card = Widget.Box({
        className: 'dyn-island-popup',
        vertical: true,
        widthRequest: W,
        children: [inner],
    });
    clickArea.dragCard = card;
    return card;
};

export default () => {
    let items = [];
    const seen = new Set();
    let hidden = true;
    let hiding = false;
    let slideTween = null;

    let timer = 0;
    let left = DURATION;
    let duration = DURATION;
    let last = 0;
    let hovered = false;
    let hoveredAt = 0;
    // Kartu yang sedang dihitung + timeout slide-in yang masih tertunda.
    // Keduanya harus dilacak: tanpa itu, satu transisi yang terlewat
    // meninggalkan popup menggantung (kartu tidak hilang / antrean berhenti).
    let activeSeq = 0;
    let showTimer = 0;

    const stopTimer = () => {
        if (timer) {
            GLib.source_remove(timer);
            timer = 0;
        }
        last = 0;
    };

    const cancelShow = () => {
        if (showTimer) {
            GLib.source_remove(showTimer);
            showTimer = 0;
        }
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
        cancelShow();
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
        slideTo(adj.value, 0, () => {
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
        if (!newest) {
            timer = 0;
            if (!hidden) hide();
            return GLib.SOURCE_REMOVE;
        }
        // Kartu terdepan berubah tanpa startTimer (mis. render sebelumnya
        // gagal): adopsi kartu itu dan mulai ulang hitungannya, jangan biarkan
        // popup menampilkan kartu lama tanpa timer.
        if (newest.seq !== activeSeq) {
            timer = 0;
            try {
                render();
                startTimer(durationFor(newest));
                if (hidden || hiding) show(newest);
            } catch (error) {
                console.error('[dyn-island] popup tidak sinkron:', error);
            }
            return GLib.SOURCE_REMOVE;
        }
        if (newest.bar) newest.bar.setFraction(duration > 0 ? left / duration : 0);
        if (left <= 0) {
            timer = 0;
            dismiss(newest);
            return GLib.SOURCE_REMOVE;
        }
        return GLib.SOURCE_CONTINUE;
    };

    const startTimer = (ms = DURATION) => {
        stopTimer();
        duration = ms;
        left = ms;
        hovered = false;
        activeSeq = items[0]?.seq ?? 0;
        if (items[0]?.bar) items[0].bar.setFraction(1);
        timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, tick);
    };

    // Lanjutkan hitungan yang berhenti tanpa mengulang dari durasi penuh
    // (dipakai jaring pengaman saat timer mati di tengah jalan).
    const resumeTimer = () => {
        if (timer) return;
        timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, tick);
    };

    // Hapus satu kartu dari tumpukan. Kalau masih ada kartu lain, timer
    // dihitung ulang untuk kartu yang sekarang paling baru.
    const dismiss = item => {
        const index = items.indexOf(item);
        // Klik X dua kali atau aksi ganda: item sudah tidak ada di antrean.
        // Dulu ini me-render ulang kartu yang sedang tampil dan mengulang
        // timernya, sehingga notifikasi berikutnya tertunda.
        if (index < 0) return;
        items.splice(index, 1);
        if (!items.length) {
            hide();
            return;
        }
        try {
            render();
            // drag kanan bisa menyisakan offset; tampilkan kartu baru di posisi normal
            const page = Math.round(adj.page_size) || FULL;
            adj.value = Math.min(page, Math.max(0, adj.upper - adj.page_size));
            startTimer(durationFor(items[0]));
        } catch (error) {
            console.error('[dyn-island] render kartu berikutnya gagal:', error);
            items = [];
            hide(true);
        }
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
        spacing: 0,
        widthRequest: W,
    });

    // diisi setelah adj/show siap; render memanggilnya saat event
    let dragMove = () => { };
    let dragEnd = () => { };

    const render = () => {
        items.forEach(item => { item.bar = null; });
        stack.children = items.length
            ? [buildCard(items[0], 0, { dismiss, open, close, dragMove, dragEnd })]
            : [];
        // Tinggi kartu berubah saat antrean maju; paksa layer surface ikut
        // resize supaya kartu terakhir tidak terpotong di tepi bawah.
        stack.queue_resize();
        pad.queue_resize();
        hoverArea.queue_resize();
        sw.queue_resize();
        win.queue_resize();
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
    win.stackVisible = () => stack.get_children().length;
    win.dismissTop = () => { if (items[0]) dismiss(items[0]); };
    // fallback: drag ke atas meninggalkan clickArea/window sebelum release
    win.connect('button-release-event', (_w, event) => {
        if (!activeDrag) return false;
        const { item, card, startX, startY } = activeDrag;
        activeDrag = null;
        const dx = rootX(event) - startX;
        const dy = rootY(event) - startY;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragEnd(dx, dy, item, card, close);
        else open(item);
        return true;
    });

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
            win.margins = [TOP_INSET, Math.max(0, INSET - extra), 0, 0];
            // tunggu layout selesai: sebelum itu adj.upper masih 0 sehingga
            // nilai scroll ter-clamp ke 0 dan animasi tidak bergerak
            cancelShow();
            showTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 80, () => {
                showTimer = 0;
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

    const snooze = item => {
        const copy = { ...item };
        dismiss(item);
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, snoozeDuration(), () => {
            if (!items.some(entry => entry.seq === copy.seq)) {
                const revived = { ...copy, bar: null };
                items.push(revived);
                if (items.length === 1) {
                    render();
                    show(revived);
                }
            }
            return GLib.SOURCE_REMOVE;
        });
    };

    dragMove = (dx, dy, card) => {
        if (slideTween) {
            slideTween.stop();
            slideTween = null;
        }
        const page = Math.round(adj.page_size) || FULL;
        const max = Math.max(0, adj.upper - adj.page_size);
        adj.value = Math.max(0, Math.min(max, page - dx));
        if (card) card.set_opacity(dy < 0 ? Math.max(0.25, 1 + dy / 120) : 1);
    };

    dragEnd = (dx, dy, item, card, closeItem) => {
        if (card) card.set_opacity(1);
        if (dx >= DRAG_CLOSE) {
            closeItem(item);
            return;
        }
        if (dy <= -DRAG_SNOOZE) {
            snooze(item);
            return;
        }
        const page = Math.round(adj.page_size) || FULL;
        if (Math.abs(adj.value - page) > 1) slideTo(adj.value, page);
    };

    latest.connect('changed', () => {
        const item = latest.value;
        if (!item) return;
        // Update id untuk notifikasi yang sudah ada di antrean; jangan
        // menambah kartu baru saat method_return menyusul.
        const existing = items.find(entry => entry.seq === item.seq);
        if (existing) {
            if (item.id) existing.id = item.id;
            return;
        }
        // Notifikasi yang sudah pernah ditutup tidak boleh hidup lagi hanya
        // karena method_return-nya datang terlambat.
        if (seen.has(item.seq)) return;
        seen.add(item.seq);
        if (seen.size > 200) {
            const oldest = seen.values().next().value;
            seen.delete(oldest);
        }
        // FIFO: yang pertama masuk menjadi kartu aktif; sisanya menunggu.
        items.push(item);
        if (items.length === 1) {
            try {
                render();
                show(item);
            } catch (error) {
                console.error('[dyn-island] render popup gagal:', error);
                items = [];
                hide(true);
            }
        }
    });

    // Notifikasi bisa ditutup dari luar (tombol X swaync, TTL sweeper AGS,
    // timer 6 jam `swaync-client --close-all`). Tanpa hook ini kartu popup
    // island tetap menetap karena antreannya lokal, bukan milik swaync.
    let lastClosedSeq = 0;
    notificationClosed.connect('changed', () => {
        const closed = notificationClosed.value;
        if (!closed?.id || closed.seq === lastClosedSeq) return;
        lastClosedSeq = closed.seq;
        const item = items.find(entry => entry.id === closed.id);
        if (item) dismiss(item);
    });

    // Jaring pengaman: rekonsiliasi state popup dengan antrean tiap detik.
    // Tanpa ini, satu transisi yang terlewat (render gagal, animasi
    // dihentikan, timer mati) membuat kartu menetap atau antrean berhenti.
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
        try {
            const active = items[0] || null;
            if (!active) {
                if (!hidden && !hiding) hide();
                return GLib.SOURCE_CONTINUE;
            }
            if (hidden) {
                render();
                show(active);
                return GLib.SOURCE_CONTINUE;
            }
            if (active.seq !== activeSeq) {
                render();
                startTimer(durationFor(active));
                if (hiding) show(active);
            } else if (!timer) {
                resumeTimer();
            }
        } catch (error) {
            console.error('[dyn-island] popup watchdog gagal:', error);
        }
        return GLib.SOURCE_CONTINUE;
    });

    win.debugState = () => ({
        items: items.length,
        hidden,
        hiding,
        hovered,
        left: Math.round(left),
        duration,
        timer: !!timer,
        showTimer: !!showTimer,
        activeSeq,
    });
    // Uji jaring pengaman: matikan timer seperti state macet.
    win.debugStall = () => stopTimer();

    return win;
};
