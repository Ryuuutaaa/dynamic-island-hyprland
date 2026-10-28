import GLib from 'gi://GLib';
import Gdk from 'gi://Gdk?version=3.0';
import Gtk from 'gi://Gtk?version=3.0';
import App from 'resource:///com/github/Aylur/ags/app.js';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';
import CONFIG from './config.js';
import {
    page, hovered, isTransientActive, watchMpris, showTransient, refreshBase,
    stepPage, pinPage, PAGE_ORDER, isPinned, mediaView, inLyricsView,
} from './state.js';
import { buildCss, hexToRgb, NOTCH_COLOR, NOTCH_ALPHA } from './theme.js';
import { ramp, bezierTween } from './spring.js';
import Idle from './modules/idle.js';
import Media from './modules/media.js';
import Closed from './modules/closed.js';
import { VolumeOsd, BrightnessOsd } from './modules/osd.js';
import Notify, { watchNotifications, current as notifCurrent, latest as notifLatest } from './modules/notify.js';
import Nav from './modules/nav.js';
import LyricsPage from './modules/lyrics-page.js';
import PomodoroPage from './modules/pomodoro-page.js';
import WaterPage from './modules/water-page.js';
import TodoPage from './modules/todo-page.js';
import ShelfPage from './modules/shelf-page.js';
import {
    shelf, shelfDragOver, shelfUndo, undoLast as shelfUndoLast,
    addPaths as shelfAdd, removeItem as shelfRemove, clearShelf as shelfClear,
} from './modules/shelf.js';
import {
    todo, watchTodo, addTask as todoAdd, toggleTask as todoToggle, removeTask as todoRemove,
} from './modules/todo.js';
import {
    water, watchWater, drink as waterDrink, setGoal as waterSetGoal,
    toggleReminder as waterToggleReminder,
} from './modules/water.js';
import { pomodoro, MODES as pomodoroModes, setMode as pomodoroSetMode, toggleRunning as pomodoroToggle, reset as pomodoroReset } from './modules/pomodoro.js';
import { watchLyrics, lyrics as lyricsStore, retryLyrics } from './modules/lyrics.js';
import { btPreview } from './modules/bluetooth.js';
import { focusedRect, refresh as refreshMonitors, followFocused, applyFocused } from './modules/monitor.js';
import { onResume } from './modules/timefmt.js';
import NotificationPopup from './modules/notif-popup.js';

const STYLE_PATH = `${App.configDir}/dynamic-iland/style.css`;

// chrome notch: padding 13+13 horizontal, 3+3 vertikal, tanpa border
const CHROME_X = 26;
const CHROME_Y = 6;
// tinggi pill nav (26) + margin-bottom CSS-nya (8)
const NAV_SPACE = 34;

function applyStyle() {
    try {
        if (!GLib.file_test(STYLE_PATH, GLib.FileTest.EXISTS)) {
            console.error(`[dyn-island] style.css tidak ditemukan: ${STYLE_PATH}`);
            return;
        }
        const template = new TextDecoder().decode(GLib.file_get_contents(STYLE_PATH)[1]);
        App.applyCss(buildCss(template));
        console.log('[dyn-island] styles applied');
    } catch (error) {
        console.error('[dyn-island] gagal memuat style:', error);
    }
}

function patchMonitor(window) {
    if (typeof CONFIG.monitor === 'number') {
        window.monitor = CONFIG.monitor;
        return;
    }
    // `Window.monitor` AGS adalah index GdkMonitor, sedangkan Hyprland memberi
    // `id` monitor — bukan namespace yang sama. followFocused mencocokkan
    // keduanya lewat geometri (lihat modules/monitor.js) dan melepas state
    // hover saat window benar-benar pindah monitor.
    followFocused(window, () => { hovered.value = false; });
}

// "Telinga" notch: kurva konkaf di kiri/kanan tepi atas supaya notch
// menyatu ke bezel layar. Digambar Cairo karena radial-gradient CSS tidak
// ter-render di GTK3. Ukurannya ikut dianimasikan (10 -> 22 -> 13).
function Ear(side) {
    const area = Widget.DrawingArea({
        className: 'dyn-island-ear',
        setup: self => {
            const start = CONFIG.geometry.closed.ear;
            self.set_size_request(start, start);
            self.setEarSize = size => {
                self.set_size_request(size, size);
                self.queue_draw();
            };
        },
        drawFn: (self, cr, width, height) => {
            const e = Math.min(width, height);
            if (e <= 0) return;
            const rgb = hexToRgb(NOTCH_COLOR);
            cr.setSourceRGBA(rgb[0], rgb[1], rgb[2], NOTCH_ALPHA);
            if (side === 'left') {
                cr.moveTo(0, 0);
                cr.lineTo(e, 0);
                cr.lineTo(e, e);
                cr.arcNegative(0, e, e, 0, -Math.PI / 2);
            } else {
                cr.moveTo(e, 0);
                cr.lineTo(0, 0);
                cr.lineTo(0, e);
                cr.arc(e, e, e, Math.PI, 1.5 * Math.PI);
            }
            cr.closePath();
            cr.fill();
        },
    });
    const column = Widget.Box({
        className: 'dyn-island-ear-col',
        vertical: true,
        children: [area],
    });
    return { widget: column, setSize: size => area.setEarSize(size) };
}

function DynamicIsland() {
    const GEO = CONFIG.geometry;
    const notch = Widget.Box({ className: 'dyn-island-notch' });

    const stack = Widget.Stack({
        children: {
            closed: Closed(),
            idle: Idle(),
            media: Media(),
            lyrics: LyricsPage(),
            pomodoro: PomodoroPage(),
            water: WaterPage(),
            todo: TodoPage(),
            shelf: ShelfPage(),
            volume: VolumeOsd(),
            brightness: BrightnessOsd(),
            notify: Notify(),
        },
        setup: self => {
            self.hhomogeneous = false;
            self.vhomogeneous = false;
            self.transition = CONFIG.transition;
            self.transition_duration = CONFIG.transitionDuration;
            self.shown = 'closed';
        },
    });

    // Wadah clipping untuk width DAN height: propagate natural dimatikan
    // supaya ukuran notch bisa dianimasikan / lebih kecil dari konten
    // (kontennya dipotong, sama seperti notch asli).
    const clip = Widget.Scrollable({
        className: 'dyn-island-clip',
        hscroll: 'never',
        vscroll: 'never',
        propagateNaturalWidth: false,
        propagateNaturalHeight: false,
    });
    clip.child = stack;

    const nav = Nav();
    nav.set_no_show_all(true);
    const content = Widget.Overlay({ child: clip, overlays: [nav] });

    // EventBox = area hover + drop target (butuh GdkWindow sendiri).
    const hoverArea = Widget.EventBox({ child: content });

    // Cek posisi pointer yang sebenarnya lewat kompositor.
    //
    // GTK3 mengirim `leave-notify-event` juga ketika pointer pindah ke CHILD
    // yang punya GdkWindow sendiri (tombol panah, dots, DrawingArea, isi
    // halaman). Idealnya kasus itu dikenali dari `event.detail === INFERIOR`,
    // tapi di GJS/AGS ini objek event-nya tidak mengekspos field apa pun
    // (`event.detail` undefined — sudah diperiksa), sehingga pengecekan itu
    // tidak pernah cocok dan notch menutup setiap kali pointer menyentuh
    // konten. Akibatnya klik "next" kadang berhasil (kalau press mendahului
    // animasi tutup) dan kadang tidak — yang terlihat sebagai island "keluar".
    // Rect monitor di-cache bersama oleh modules/monitor.js: pengecekan
    // pointer dan penentuan monitor window memakai satu hasil `hyprctl -j
    // monitors`, diperbarui saat monitor fokus berubah.
    const pointerOnIsland = async () => {
        try {
            // hyprctl -j dipakai karena objek `Hyprland.active.monitor` dari
            // AGS tidak punya field x/width (rect jadi NaN -> pointer selalu
            // dianggap di luar, hover lepas setiap ada crossing).
            let monRect = focusedRect();
            if (!monRect) {
                const rects = await refreshMonitors();
                monRect = rects.find(m => m.focused) ?? null;
            }
            if (!monRect) return false;
            const cursor = JSON.parse(await Utils.execAsync(['hyprctl', '-j', 'cursorpos']));
            if (!Number.isFinite(cursor?.x) || !Number.isFinite(cursor?.y)) return false;

            const w = geo.w + 2 * geo.ear;
            const left = monRect.x + monRect.w / 2 - w / 2;
            const top = monRect.y + CONFIG.marginTop;
            return cursor.x >= left && cursor.x <= left + w
                && cursor.y >= top && cursor.y <= top + geo.h;
        } catch (_) {
            return false;
        }
    };

    // leave-notify hanya terkirim sekali, saat pointer keluar dari EventBox
    // (area isi). Badan notch masih punya padding 3/13px: kalau pointer
    // berhenti di situ, pengecekan saat leave menjawab "di dalam" dan tidak ada
    // event lanjutan -> notch tertahan terbuka. Watchdog memastikan state hover
    // mengikuti posisi pointer sebenarnya.
    let hoverWatch = 0;
    const startHoverWatch = () => {
        if (hoverWatch) return;
        hoverWatch = Utils.interval(100, async () => {
            if (!hovered.value) return;
            const token = hoverToken;
            const inside = await pointerOnIsland();
            if (token !== hoverToken) return;
            if (!inside) hovered.value = false;
        });
    };
    const stopHoverWatch = () => {
        if (!hoverWatch) return;
        GLib.source_remove(hoverWatch);
        hoverWatch = 0;
    };
    // Variable global (hovered/page/mediaView) hidup lebih lama dari window.
    // Koneksi di bawah wajib dilepas saat window di-destroy: setelah rebuild,
    // handler window lama masih menunjuk widget yang sudah disposed sehingga
    // membanjiri log dengan Gjs-CRITICAL dan mengganggu handler window baru.
    let dead = false;
    const variableConns = [];
    const bindVariable = (variable, callback) => {
        variableConns.push([variable, variable.connect('changed', callback)]);
    };

    bindVariable(hovered, () => {
        if (hovered.value) startHoverWatch();
        else stopHoverWatch();
    });

    let hoverToken = 0;
    hoverArea.connect('enter-notify-event', () => {
        hoverToken += 1;
        hovered.value = true;
        return false;
    });
    hoverArea.connect('leave-notify-event', () => {
        // Jangan langsung menutup: pastikan pointer benar-benar sudah keluar
        // dari badan island. Token mencegah hasil cek yang basi menutup notch
        // setelah pointer kembali masuk.
        const token = ++hoverToken;
        pointerOnIsland().then(inside => {
            if (token === hoverToken && !inside) hovered.value = false;
        });
        return false;
    });
    notch.child = hoverArea;

    // ── drag & drop masuk (shelf) ───────────────────────────────────
    // EventBox punya GdkWindow sendiri, jadi bisa didaftarkan sebagai drop
    // target. Saat drag masuk: notch dibuka + drop zone ditampilkan.
    // Hanya berkas (text/uri-list): 'text/plain' dulu menerima potongan teks
    // apa pun dan mengubahnya jadi item shelf yang "hilang".
    const DROP_TARGETS = [Gtk.TargetEntry.new('text/uri-list', 0, 0)];
    hoverArea.drag_dest_set(Gtk.DestDefaults.ALL, DROP_TARGETS, Gdk.DragAction.COPY);
    hoverArea.connect('drag-motion', () => {
        shelfDragOver.value = true;
        hovered.value = true;
        return true;
    });
    hoverArea.connect('drag-leave', () => {
        shelfDragOver.value = false;
        hovered.value = false;
        return true;
    });
    hoverArea.connect('drag-data-received', (_widget, context, _x, _y, data, _info, time) => {
        let paths = [];
        try {
            paths = data.get_uris() ?? [];
        } catch (_) {
            paths = [];
        }

        const added = shelfAdd(paths);
        shelfDragOver.value = false;
        // sukses hanya kalau benar-benar ada item baru, supaya aplikasi sumber
        // tahu kapan drop-nya tidak diterima
        Gtk.drag_finish(context, added.length > 0, false, time);

        if (added.length) {
            // langsung tampilkan halaman shelf supaya item barunya terlihat
            pinPage('shelf', { sticky: true });
        }
        return true;
    });

    const leftEar = Ear('left');
    const rightEar = Ear('right');

    // ── mesin geometri ──────────────────────────────────────────────
    const geo = { w: GEO.closed.w, h: GEO.closed.h, ear: GEO.closed.ear };
    let target = GEO.closed;
    let tween = null;
    let radiusNow = GEO.closed.r;

    // Nav tampil di semua state besar (expanded + lirik yang lebih lebar).
    // Tanpa ini halaman lirik jadi jalan buntu: tombol panah satu-satunya
    // jalan keluar, tapi pill-nya tidak pernah muncul.
    const navVisibleFor = next => next === GEO.expanded || next === GEO.lyrics;

    const applyGeometry = () => {
        const w = Math.max(1, Math.round(geo.w));
        const h = Math.max(1, Math.round(geo.h));
        notch.set_size_request(w, h);
        // clip = area konten penuh (nav di-overlay di atasnya, tidak menambah ukuran)
        clip.set_size_request(
            Math.max(1, w - CHROME_X),
            Math.max(1, h - CHROME_Y),
        );
        // catatan: ruang nav (stack.margin_bottom) TIDAK dipasang di sini.
        // Kalau dipasang sejak awal animasi buka, konten closed ikut bergeser
        // 17px ke atas selama 200ms pertama. Dipasang di syncContent() saat
        // konten benar-benar berganti.
    };

    const applyEar = () => {
        const size = Math.max(1, Math.round(geo.ear));
        leftEar.setSize(size);
        rightEar.setSize(size);
    };

    const targetFor = () => {
        // Peek hanya dipakai saat notch tertutup. Kalau pointer sedang di atas
        // notch (hover) lalu user menekan tombol volume / ada notifikasi,
        // kontennya ditampilkan di kartu besar — notch tidak menyusut di bawah
        // kursor dan hover tidak "ditahan" oleh durasi peek.
        if (isTransientActive() && !hovered.value) return GEO.peek;
        if (hovered.value) {
            // tampilan lirik lebih lebar (Nusa: 520) — bagian dari kartu media
            if (inLyricsView() && GEO.lyrics) return GEO.lyrics;
            return GEO.expanded;
        }
        return GEO.closed;
    };

    // alpha nav dari tinggi kartu: 0 di bawah 60px, penuh di 100px. Dipakai
    // supaya pill tidak muncul menimpa konten closed di frame-frame pertama.
    const navAlpha = () => Math.min(1, Math.max(0, (geo.h - 60) / 40));

    const animateTo = next => {
        const prevTarget = target;
        target = next;
        const from = { ...geo };
        const fromR = radiusNow;
        const prevNav = navVisibleFor(prevTarget);
        const nextNav = navVisibleFor(next);
        const navAnimated = prevNav || nextNav;
        if (tween) tween.stop();

        if (navAnimated) {
            nav.visible = true;
            nav.set_opacity(prevNav && nextNav ? 1 : 0);
            nav.set_sensitive(prevNav && nextNav);
        } else {
            nav.visible = false;
        }

        // lebar window dikunci ke maksimum(from, to) + headroom 16px selama
        // transisi lebar, supaya surface tidak resize per frame (press mouse
        // jadi hilang). Headroom perlu karena tween overshoot: tanpa itu
        // notch 429 + telinga membuat window ikut melebar 464 -> 473 -> 464.
        const widthChanges = Math.abs(next.w - from.w) > 0.5;
        if (widthChanges) {
            // headroom 16px hanya saat membuka: kurva overshoot membuat notch
            // melebihi target (429 vs 420). Saat menutup nilainya di-clamp ke
            // target, jadi headroom cuma membuat window melebar 464 -> 480
            // tanpa ada yang perlu ditampung.
            const headroom = next.w > from.w ? 16 : 0;
            frameWrap.set_size_request(
                Math.round(Math.max(next.w, from.w) + 2 * Math.max(next.ear, from.ear)) + headroom,
                -1,
            );
        }

        // radius diinterpolasi bertahap (5 langkah): GTK3 tidak bisa
        // menganimasikan border-radius, dan set sekali di awal membuat sudut
        // "snap" 14 <-> 32 di frame pertama.
        let radiusStep = -1;
        tween = bezierTween({
            duration: CONFIG.motion.sizeDuration,
            curve: CONFIG.motion.sizeCurve,
            onFrame: value => {
                geo.w = from.w + (next.w - from.w) * value;
                geo.h = from.h + (next.h - from.h) * value;
                geo.ear = from.ear + (next.ear - from.ear) * value;
                // menutup: jangan undershoot di bawah target. Kurva punya
                // overshoot 1.32; saat menutup nilainya melewati 1 dan notch
                // sempat mengecil ke 141x26 sebelum "pop" balik ke 150x30.
                if (next.w < from.w) geo.w = Math.max(next.w, geo.w);
                if (next.h < from.h) geo.h = Math.max(next.h, geo.h);
                if (next.ear < from.ear) geo.ear = Math.max(next.ear, geo.ear);
                const clamped = Math.min(1, Math.max(0, value));
                radiusNow = fromR + (next.r - fromR) * clamped;
                const step = Math.round(clamped * 10);
                if (step !== radiusStep) {
                    radiusStep = step;
                    const r = Math.round(fromR + (next.r - fromR) * (step / 10));
                    notch.css = `border-radius: 0px 0px ${r}px ${r}px;`;
                }
                applyGeometry();
                applyEar();
                // Ruang nav disusutkan mengikuti tinggi kartu. Dulu margin
                // dicabut sekaligus (34 -> 0) saat konten swap di awal tutup,
                // sehingga konten closed melompat turun ~15px (terukur
                // closedY 47 -> 62) — terlihat seperti "adjustment".
                const alpha = navAnimated ? (prevNav && nextNav ? 1 : navAlpha()) : 0;
                stack.margin_bottom = Math.round(NAV_SPACE * alpha);
                if (navAnimated) {
                    nav.set_opacity(alpha);
                    nav.set_sensitive(alpha > 0.6);
                }
            },
            onDone: () => {
                if (widthChanges) frameWrap.set_size_request(-1, -1);
                radiusNow = next.r;
                notch.css = `border-radius: 0px 0px ${next.r}px ${next.r}px;`;
                stack.margin_bottom = nextNav ? NAV_SPACE : 0;
                nav.visible = nextNav;
                nav.set_opacity(nextNav ? 1 : 0);
                nav.set_sensitive(true);
                // nav.visible baru berubah di sini; tanpa sync ulang submap
                // `island` tertinggal aktif setelah island tertutup
                syncSubmap();
            },
        });
        tween.start();
    };

    // ── konten bertahap (Nusa: keluar .2s, masuk .32s delay .2s) ────
    const fadeIn = ramp({
        duration: CONFIG.contentFade,
        onFrame: value => stack.set_opacity(value),
    });
    let swapTimer = 0;

    // Ganti isi stack. Crossfade hanya untuk page <-> page; saat melewati
    // state closed crossfade membuat konten lama dan konten closed tampil
    // tumpang tindih (terekam di frame: teks media + jam closed sekaligus),
    // jadi transisinya dimatikan dan fade opacity yang mengurus.
    const setShown = next => {
        const prev = stack.shown;
        stack.transition = (prev === 'closed' || next === 'closed')
            ? 'none' : CONFIG.transition;
        stack.shown = next;
    };

    const syncContent = () => {
        if (swapTimer) {
            GLib.source_remove(swapTimer);
            swapTimer = 0;
        }
        fadeIn.stop();
        if (target === GEO.closed) {
            // Konten halaman fade-out cepat (140ms) sebelum konten closed
            // dipasang. Tanpa ini, konten halaman yang masih penuh terlihat
            // terpotong oleh kartu yang menyusut pada frame-frame awal.
            const prev = stack.shown;
            if (prev && prev !== 'closed') {
                const out = ramp({
                    duration: 140,
                    onFrame: value => stack.set_opacity(1 - value),
                });
                out.start();
                swapTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 140, () => {
                    swapTimer = 0;
                    // hentikan ramp fade-out dulu: tick terakhirnya bisa jatuh
                    // setelah swap dan menimpa opacity 1 (terukur opacity 0).
                    out.stop();
                    setShown('closed');
                    stack.set_opacity(1);
                    return GLib.SOURCE_REMOVE;
                });
                return;
            }
            setShown('closed');
            stack.set_opacity(1);
            return;
        }
        // membuka: bentuk dulu, konten menyusul
        swapTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, CONFIG.contentDelay, () => {
            swapTimer = 0;
            // lirik = sub-tampilan media, bukan halaman nav tersendiri
            setShown(inLyricsView() ? 'lyrics' : page.value);
            stack.set_opacity(0);
            fadeIn.start();
            return GLib.SOURCE_REMOVE;
        });
    };

    // --- submap keyboard -----------------------------------------------------
    // Panah di submap `island` bersifat *consuming*, jadi aplikasi yang sedang
    // fokus (YouTube, editor, dsb) tidak ikut menerima tombol selama island
    // terbuka. Submap hanya diaktifkan saat nav tampil dan tidak pernah
    // menyentuh submap lain (mis. resize): switch hanya dari `default`, reset
    // hanya dari `island`. `escape` di dalam submap = jalan keluar manual.
    const SUBMAP = 'island';
    let submapTimer = 0;
    let submapRunning = false;
    let submapAgain = false;

    const applySubmap = async () => {
        submapRunning = true;
        try {
            const want = nav.visible;
            const current = String(await Utils.execAsync(['hyprctl', 'submap'])).trim();
            if (want && current === 'default')
                await Utils.execAsync(['hyprctl', 'dispatch', 'submap', SUBMAP]);
            else if (!want && current === SUBMAP)
                await Utils.execAsync(['hyprctl', 'dispatch', 'submap', 'reset']);
        }
        catch (_) {
            // Hyprland tidak tersedia: navigasi keyboard memang tidak aktif.
        }
        finally {
            submapRunning = false;
            if (submapAgain) {
                submapAgain = false;
                syncSubmap();
            }
        }
    };

    const syncSubmap = () => {
        if (dead) return;
        if (submapTimer) {
            GLib.source_remove(submapTimer);
            submapTimer = 0;
        }
        // debounce singkat: hover masuk/keluar beruntun cukup satu switch
        submapTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 80, () => {
            submapTimer = 0;
            if (submapRunning) submapAgain = true;
            else applySubmap();
            return GLib.SOURCE_REMOVE;
        });
    };

    const sync = () => {
        if (dead) return;
        const next = targetFor();
        syncSubmap();
        if (next === target && tween && tween.running) return;
        animateTo(next);
        syncContent();
    };

    bindVariable(hovered, sync);
    bindVariable(page, sync);
    // buka/tutup tampilan lirik: lebar kartu (520) dan isi stack ikut berubah
    bindVariable(mediaView, sync);

    // state awal: tertutup
    notch.css = `border-radius: 0px 0px ${GEO.closed.r}px ${GEO.closed.r}px;`;
    applyGeometry();
    applyEar();

    const frame = Widget.Box({
        className: 'dyn-island-frame',
        children: [leftEar.widget, notch, rightEar.widget],
    });
    // Pembungkus center: selama animasi LEBAR, lebar window dikunci ke nilai
    // maksimum (dari/ke) supaya permukaan tidak di-resize tiap frame (resize
    // per frame menelan press mouse). CenterBox (bukan Box!) penting di sini:
    // AGS mem-pack child Box dari KIRI, sehingga saat kartu menyusut di dalam
    // window yang lebar-nya dikunci, frame ikut bergeser ke kiri ~50px lalu
    // snap balik di akhir — itu yang membuat pill nav terlihat bergeser.
    const frameWrap = Widget.CenterBox({
        className: 'dyn-island-frame-wrap',
        centerWidget: frame,
    });

    // Navigasi lewat keyboard. Dipanggil dari submap Hyprland `island`, yang
    // hanya aktif saat nav tampil (lihat syncSubmap di atas):
    //   submap = island
    //   bind = , left,  exec, ags -r "globalThis.dynIsland.navKey(-1)"
    //   bind = , right, exec, ags -r "globalThis.dynIsland.navKey(1)"
    // Bind di dalam submap bersifat consuming, jadi aplikasi fokus (YouTube,
    // editor) tidak ikut menerima panah selama island terbuka.
    const navKey = delta => {
        if (!nav.visible) return false;
        stepPage(delta);
        return true;
    };

    const island = Widget.Window({
        name: 'dynamic-island',
        className: 'dyn-island-window',
        layer: 'top',
        anchor: ['top'],
        exclusivity: 'ignore',
        keymode: 'none',
        margins: [CONFIG.marginTop, 0, 0, 0],
        child: frameWrap,
    });

    // harus setelah konstruksi: gtk_layer_init_for_window baru jalan di situ
    patchMonitor(island);
    // jangan biarkan nav nyangkut setelah window dipindah / di-map ulang
    nav.visible = false;
    // sekaligus membersihkan submap `island` yang mungkin tertinggal kalau AGS
    // mati saat island sedang terbuka
    syncSubmap();
    island.connect('notify::monitor', () => {
        nav.visible = navVisibleFor(target);
        syncSubmap();
    });
    island.connect('map', () => {
        nav.visible = false;
        syncSubmap();
    });
    // Teardown: lepas semua yang hidup di luar umur window (lihat bindVariable
    // dan komentar di atasnya), hentikan animasi/timer yang masih menunjuk
    // widget yang akan disposed.
    island.connect('destroy', () => {
        dead = true;
        for (const [variable, id] of variableConns)
            variable.disconnect(id);
        variableConns.length = 0;
        stopHoverWatch();
        if (submapTimer) {
            GLib.source_remove(submapTimer);
            submapTimer = 0;
        }
        if (swapTimer) {
            GLib.source_remove(swapTimer);
            swapTimer = 0;
        }
        if (tween) tween.stop();
        fadeIn.stop();
    });

    island.stack = stack;
    island.notch = notch;
    island.clip = clip;
    island.nav = nav;
    island.sync = sync;
    island.geo = geo;
    island.target = () => target;
    island.navKey = navKey;
    return island;
}

// Referensi window di `dynIsland` bisa berubah saat window dibangun ulang
// (lihat mountIsland), jadi objeknya dibuat sekali di sini dan field window
// diisi ulang oleh publishIsland().
const dyn = {
    page, hovered, showTransient, refreshBase, config: CONFIG,
    notif: notifCurrent, notifLatest,
    stepPage, pinPage, PAGE_ORDER, isPinned, mediaView, btPreview,
    lyrics: lyricsStore, retryLyrics, pomodoro,
    pomodoroModes, pomodoroSetMode, pomodoroToggle, pomodoroReset,
    water, waterDrink, waterSetGoal, waterToggleReminder,
    todo, todoAdd, todoToggle, todoRemove,
    shelf, shelfAdd, shelfRemove, shelfClear, shelfDragOver, shelfUndo, shelfUndoLast,
};
globalThis.dynIsland = dyn;

let island = null;
let mounting = false;
let rebuildTimer = 0;

const publishIsland = win => {
    dyn.window = win;
    dyn.notch = win.notch;
    dyn.clip = win.clip;
    dyn.stack = win.stack;
    dyn.nav = win.nav;
    dyn.sync = win.sync;
    dyn.geo = win.geo;
    dyn.target = win.target;
    dyn.navKey = win.navKey;
};

// Lepaskan window dari daftar App tanpa menyentuh window yang sudah
// di-dispose (memanggil destroy()/nama pada objek disposed hanya memunculkan
// Gjs-CRITICAL "already disposed").
const detachWindow = name => {
    const map = App._windows;
    const existing = map?.get?.(name)
        ?? App.windows.find(w => {
            try {
                return w.name === name;
            } catch (_) {
                return false;
            }
        });
    if (!existing) return;

    if (!existing.is_destroyed) {
        App.removeWindow(existing);
        return;
    }
    if (typeof map?.delete === 'function')
        map.delete(name);
};

// Bangun window island dari nol. Dipakai saat start dan saat window lama mati:
// gtk-layer-shell memanggil gtk_window_close() ketika compositor mengirim
// zwlr_layer_surface_v1.closed (monitor dicabut / hilang saat resume), dan GTK3
// menghancurkan window-nya. Window yang sudah di-dispose tidak bisa hidup lagi
// lewat `visible = true`, jadi satu-satunya jalan adalah membuat instance baru.
function mountIsland() {
    if (mounting) return island;
    if (island && !island.is_destroyed) return island;

    // Jangan membuat layer-shell window saat GDK belum melihat monitor:
    // gtk-layer-shell tidak bisa map dan GTK bisa keluar saat map tanpa monitor.
    const display = Gdk.Display.get_default();
    if (!display || display.get_n_monitors() === 0) return null;

    mounting = true;
    try {
        detachWindow('dynamic-island');
        island = null;
        // state hover milik window lama tidak berlaku untuk window baru
        hovered.value = false;
        // submap keyboard bisa tertinggal aktif kalau window mati saat nav tampil
        Utils.execAsync(['hyprctl', 'dispatch', 'submap', 'reset']).catch(() => { });

        const win = DynamicIsland();
        App.addWindow(win);
        island = win;
        publishIsland(win);
        console.log('[dyn-island] window dipasang');

        win.connect('destroy', () => {
            if (mounting) return;
            island = null;
            // compositor menutup layer surface: bangun ulang setelah event loop
            // selesai, jangan dari dalam sinyal destroy
            if (rebuildTimer) return;
            rebuildTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
                rebuildTimer = 0;
                mountIsland();
                return GLib.SOURCE_REMOVE;
            });
        });
    } catch (error) {
        console.error('[dyn-island] gagal memasang window:', error);
    } finally {
        mounting = false;
    }
    return island;
}

try {
    watchMpris();
    watchNotifications();
// popup notifikasi kanan atas digambar island sendiri (slide + loading bar).
// Popup bawaan swaync dimatikan lewat DND supaya tidak dobel; notifikasi tetap
// masuk control center swaync.
const notifPopup = NotificationPopup();
App.addWindow(notifPopup);
dyn.notifPopup = notifPopup;
// Catatan: DND TIDAK dipaksa lagi. Dulu island menjalankan `swaync-client -dn`
// tiap 3 detik supaya popup swaync tidak dobel, akibatnya toggle DND user
// selalu kembali nyala (indikator DND tidak bisa dimatikan). Penggantinya:
// config swaync `notification-visibility` state "muted" (popup tidak muncul,
// control center tetap menerima), jadi DND bebas dipakai user.
    watchLyrics();
    watchWater();
    watchTodo();
    App.connect('config-parsed', applyStyle);
    mountIsland();
} catch (error) {
    console.error('[dyn-island] gagal inisialisasi:', error);
}

// ── watchdog kesehatan window ───────────────────────────────────────────────
// Setelah suspend/hotplug, window layer-shell bisa DI-DISPOSE oleh GTK (bukan
// sekadar tidak ter-map): terukur window.is_destroyed=true, visible=false, dan
// layer "dynamic-island" hilang dari compositor. Watchdog lama hanya set
// `visible = true` sehingga tidak pernah memulihkan apa pun. Sekarang window
// yang mati dibangun ulang; window hidup yang sekadar tidak ter-map ditampilkan.
Utils.interval(2000, () => {
    try {
        if (!island || island.is_destroyed) {
            mountIsland();
            return;
        }
        if (!island.visible) island.visible = true;
    } catch (error) {
        console.error('[dyn-island] watchdog gagal:', error);
    }
});

// Resume: pastikan window hidup dan monitor di-resolve ulang. Sinyal monitor
// Hyprland bisa terlewat saat socket-nya putus beberapa ratus ms setelah resume.
onResume(() => {
    mountIsland();
    if (island && !island.is_destroyed)
        applyFocused(island, () => { hovered.value = false; }).catch(() => { });
});
