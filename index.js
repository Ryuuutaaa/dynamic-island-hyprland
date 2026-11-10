import GLib from 'gi://GLib';
import Gdk from 'gi://Gdk?version=3.0';
import Gtk from 'gi://Gtk?version=3.0';
import Cairo from 'gi://cairo?version=1.0';
import App from 'resource:///com/github/Aylur/ags/app.js';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';
import CONFIG from './config.js';
// Side effect: baca ~/.config/dynamic-iland/settings.json dan terapkan ke
// CONFIG sebelum state/nav/halaman dievaluasi.
import { glow as glowEnabled } from './modules/settings.js';
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
import Notify, { watchNotifications, current as notifCurrent, latest as notifLatest, registerLocalAction, invokeAction as notifInvoke, sweepNotificationAges as notifSweep } from './modules/notify.js';
import Nav from './modules/nav.js';
import LyricsPage from './modules/lyrics-page.js';
import PomodoroPage from './modules/pomodoro-page.js';
import WaterPage from './modules/water-page.js';
import TodoPage from './modules/todo-page.js';
import ShelfPage from './modules/shelf-page.js';
import BluetoothPage from './modules/bluetooth-page.js';
import WifiPage from './modules/wifi-page.js';
import PrayerPage from './modules/prayer-page.js';
import ChatPage from './modules/chat-page.js';
import {
    chat as chatState, send as chatSend, retry as chatRetry,
    clearChat as chatClear, ask as chatAsk,
} from './modules/chat.js';
import { watchPrayer, prayer as prayerState, notifyPrayer } from './modules/prayer.js';
import { sky, watchSky, drawSky, refreshSky } from './modules/sky.js';
import { coverColor } from './modules/cover-color.js';
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
import { btPreview, watchAudioRouting } from './modules/bluetooth.js';
import {
    watchWifi, wifi as wifiState,
    connect as wifiConnect, disconnect as wifiDisconnect,
    scan as wifiScan, openPortal as wifiPortal,
} from './modules/wifi.js';
import { focusedRect, refresh as refreshMonitors, followFocused, applyFocused } from './modules/monitor.js';
import { onResume } from './modules/timefmt.js';
import { scrollDelta } from './modules/pointer.js';
import ClickAway from './modules/clickaway.js';
import NotificationPopup from './modules/notif-popup.js';
import PomodoroOsd from './modules/pomodoro-osd.js';
import StandupPage from './modules/standup-page.js';
import WeatherPage from './modules/weather-page.js';
import { watchWeather, weather as weatherState, refreshWeather } from './modules/weather.js';
import TimerPage from './modules/timer-page.js';
import StatsPage from './modules/stats-page.js';
import CalendarPage from './modules/calendar-page.js';
import { watchCalendar, calendar as calendarState, refreshCalendar } from './modules/calendar.js';
import { watchCalendarNotes, calendarNotes, addNote as calendarNoteAdd, removeNote as calendarNoteRemove, checkNotes as calendarNotesCheck, notesFor as calendarNotesFor } from './modules/calendar-notes.js';
import { watchStats, stats as statsState } from './modules/sysstats.js';
import { watchWellness, toggleWellness, wellness as wellnessState, reminderNow as wellnessReminder, onWellnessAction } from './modules/wellness.js';
import { timer as timerState, restoreTimer, applyPreset as timerPreset, toggleRunning as timerToggle, resetTimer as timerReset, setMode as timerSetMode } from './modules/timer.js';
import StandupWindow from './modules/standup-window.js';
import CalendarWindow from './modules/calendar-window.js';
import { scheduleStandupReminder, titleForDay as standupTitle, addItem as standupAdd, removeItem as standupRemove, saveStandup as standupSave, loadStandup as standupLoad, remindNow as standupRemind, standup as standupStore } from './modules/standup.js';
import GeminiChat from './modules/chat-window.js';
import SettingsPage from './modules/settings-page.js';

const STYLE_PATH = `${App.configDir}/dynamic-iland/style.css`;

// chrome notch: padding 13+13 horizontal, 3+3 vertikal, tanpa border
const CHROME_X = 32; // notch padding 16px kiri+kanan
const CHROME_Y = 6;
// tinggi baris ikon nav (24) + margin-bottom CSS-nya (8)
const NAV_SPACE = 32;

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
    if (CONFIG.notch?.followFocus === false) {
        // Pengaturan "Tetap": pasang sekali ke monitor fokus saat dibuat,
        // jangan ikut pindah saat fokus berpindah.
        applyFocused(window, () => { hovered.value = false; }).catch(() => { });
        return;
    }
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

// ── buka paksa lewat hotkey (gaya Alt+N di Poni) ───────────────────
// Hover hanya membuka selama pointer di atas notch. Hotkey global butuh notch
// tetap terbuka walau kursor di tempat lain, jadi flag ini membuat watchdog
// hover dan leave-notify tidak menutupnya sampai hotkey ditekan lagi.
let forcedOpen = false;
let forcedTimer = 0;
// Layer penuh layar untuk menutup island saat klik di luar notch.
let clickAway = null;

// Batas waktu buka-paksa: kalau tidak ada interaksi, notch kembali menutup
// sendiri. Tanpa ini island bisa tertahan terbuka setelah SUPER+N (bug yang
// membuat "tidak bisa balik ke default").
const FORCED_TIMEOUT = CONFIG.pinTimeout ?? 10000;

function toggleOpen(force) {
    forcedOpen = typeof force === 'boolean' ? force : !forcedOpen;
    if (forcedTimer) {
        GLib.source_remove(forcedTimer);
        forcedTimer = 0;
    }
    if (forcedOpen) {
        forcedTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, FORCED_TIMEOUT, () => {
            forcedTimer = 0;
            forcedOpen = false;
            if (clickAway) clickAway.visible = false;
            hovered.value = false;
            try { refreshBase(); } catch (_) { }
            return GLib.SOURCE_REMOVE;
        });
    }
    if (clickAway) {
        clickAway.visible = forcedOpen;
        if (forcedOpen) clickAway.setHole({
            w: CONFIG.geometry.expanded.w + 2 * CONFIG.geometry.expanded.ear + 2,
            h: CONFIG.geometry.expanded.h + 1,
        });
    }
    hovered.value = forcedOpen;
    // kembali ke halaman default (idle/media) saat ditutup, jangan tinggalkan
    // halaman statistik/kalender menempel di base page
    if (!forcedOpen) { try { refreshBase(); } catch (_) { } }
    return forcedOpen;
}

const closeIsland = () => toggleOpen(false);

function DynamicIsland() {
    const GEO = CONFIG.geometry;
    const REDUCED = !!CONFIG.motion?.reduced;
    const SIZE_DURATION = REDUCED ? 120 : CONFIG.motion.sizeDuration;
    const SIZE_CURVE = REDUCED ? [0.2, 0, 0, 1] : CONFIG.motion.sizeCurve;
    const CONTENT_FADE = REDUCED ? 120 : CONFIG.contentFade;
    const CONTENT_DELAY = REDUCED ? 0 : CONFIG.contentDelay;
    // Ukuran berjalan (dianimasikan). Dideklarasikan di awal karena dipakai
    // pointerOnIsland() untuk hit-test hover.
    const geo = { w: GEO.closed.w, h: GEO.closed.h, ear: GEO.closed.ear };
    const notch = Widget.Box({ className: 'dyn-island-notch' });
    notch.skyRadius = GEO.closed.r;
    // Background langit digambar sendiri (bukan CSS) supaya bisa gradient +
    // bintang. CSS notch dibuat transparan; dasar hitam primary tetap digambar
    // di sini agar warna utama tidak hilang.
    notch.connect('draw', (self, cr) => {
        drawSky(
            cr,
            self.get_allocated_width(),
            self.get_allocated_height(),
            self.skyRadius,
            sky.value,
            glowEnabled.value ? coverColor.value : null,
        );
        return false;
    });

    notch.hook(coverColor, () => notch.queue_draw());
    notch.hook(glowEnabled, () => notch.queue_draw());

    const stack = Widget.Stack({
        children: {
            closed: Closed(),
            idle: Idle(),
            media: Media(),
            weather: WeatherPage(),
            lyrics: LyricsPage(),
            pomodoro: PomodoroPage(),
            timer: TimerPage(),
            stats: StatsPage(),
            calendar: CalendarPage(),
            water: WaterPage(),
            todo: TodoPage(),
            standup: StandupPage(),
            shelf: ShelfPage(),
            bluetooth: BluetoothPage(),
            wifi: WifiPage(),
            prayer: PrayerPage(),
            chat: ChatPage(),
            settings: SettingsPage(),
            volume: VolumeOsd(),
            brightness: BrightnessOsd(),
            notify: Notify(),
        },
        setup: self => {
            self.hhomogeneous = false;
            self.vhomogeneous = false;
            self.transition = CONFIG.transition;
            self.transition_duration = REDUCED ? 120 : CONFIG.transitionDuration;
            self.shown = 'closed';
        },
    });

    // AGS Stack bisa melewati `shown='closed'` di setup saat child-nya bukan
    // Box biasa (Closed() sekarang Overlay untuk hairline progres), sehingga
    // konten idle tampil di window 329x74. Setelah konstruksi, setter-nya
    // terbukti bekerja; paksa state awal tertutup di sini.
    stack.shown = 'closed';

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
            // focusedRect() menyimpan koordinat LOGIS (x/y dari Hyprland,
            // lebar/tinggi sudah dibagi scale oleh modules/monitor.js), sama
            // seperti hyprctl cursorpos. Jangan pakai lebar fisik di sini:
            // pada scale 0.8333 hotspot bergeser ~191px.
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
            if (!inside && !forcedOpen) hovered.value = false;
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
    // Handler hover dipasang di WINDOW, bukan di hoverArea EventBox.
    //
    // EventBox punya GdkWindow sendiri, tetapi anaknya (clip / GtkScrolledWindow)
    // juga punya GdkWindow dan mengisi 100% areanya. GDK mengirim crossing
    // event ke window TERDALAM (clip), dan propagasi berhenti di batas window
    // itu — jadi enter-notify-event di EventBox tidak pernah fire (terukur 0
    // saat kursor tepat di notch). Window layer-shell selalu menerima
    // enter/leave untuk seluruh surface, jadi dipakai sebagai sumber hover.
    // Hover-intent: kursor yang hanya melintas di tepi atas tidak langsung
    // membuka notch. Timer dibatalkan oleh leave atau saat kursor keluar.
    let hoverIntent = 0;
    const cancelHoverIntent = () => {
        if (hoverIntent) {
            GLib.source_remove(hoverIntent);
            hoverIntent = 0;
        }
    };

    const scheduleHover = () => {
        if (hovered.value || hoverIntent) return;
        hoverIntent = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 120, () => {
            hoverIntent = 0;
            hovered.value = true;
            return GLib.SOURCE_REMOVE;
        });
    };

    const onIslandEnter = (self, event) => {
        // Jangan langsung percaya enter: window layer-shell juga mencakup
        // area transparan (lebar dikunci selama animasi). Kalau pointer masuk
        // dari samping saat lock 464px masih aktif, notch akan berkedip
        // terbuka lalu ditutup watchdog. Validasi dengan koordinat event
        // (window-local, sinkron) terhadap badan visual island.
        const token = ++hoverToken;
        const apply = inside => {
            if (token === hoverToken && inside) scheduleHover();
        };

        let coords = null;
        try { coords = event?.get_coords?.(); } catch (_) { coords = null; }

        if (Array.isArray(coords) && coords[0]) {
            const x = Number(coords[1]);
            const y = Number(coords[2]);
            const winW = self.get_allocated_width();
            const visualW = geo.w + 2 * geo.ear;
            const left = (winW - visualW) / 2;
            apply(Number.isFinite(x) && Number.isFinite(y)
                && x >= left - 1 && x <= left + visualW + 1
                && y >= -1 && y <= geo.h + 1);
            return false;
        }

        // fallback: event tidak mengekspos koordinat
        pointerOnIsland().then(apply);
        return false;
    };
    const onIslandLeave = () => {
        // Jangan batalkan hover-intent hanya karena GTK mengirim leave saat
        // pointer masuk ke child ber-GdkWindow (clip/DrawingArea): enter dan
        // leave datang ~14ms berurutan, dan dulu leave langsung membatalkan
        // timer 120ms sehingga notch tidak pernah terbuka. Cek posisi asli
        // dulu; batalkan/closing hanya kalau pointer benar-benar di luar.
        // Token mencegah hasil cek yang basi setelah pointer kembali masuk.
        const token = ++hoverToken;
        pointerOnIsland().then(inside => {
            if (token !== hoverToken || inside) return;
            cancelHoverIntent();
            if (!forcedOpen) hovered.value = false;
        });
        return false;
    };
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
    // `geo` sudah dideklarasikan di atas (dipakai hit-test hover).
    let target = GEO.closed;
    let tween = null;
    let radiusNow = GEO.closed.r;

    // Nav tampil di semua state besar (expanded + lirik yang lebih lebar).
    // Tanpa ini halaman lirik jadi jalan buntu: tombol panah satu-satunya
    // jalan keluar, tapi pill-nya tidak pernah muncul.
    // Halaman transient (volume/brightness/notify) memakai geometri expanded,
    // tetapi bukan halaman nav. Tanpa cek PAGE_ORDER, OSD yang dibuka saat
    // hover menampilkan nav dengan tab pertama (idle) aktif.
    const navVisibleFor = next =>
        PAGE_ORDER.includes(page.value)
        && (next === GEO.expanded || next === GEO.lyrics || next === GEO.prayer
            || next === GEO.chat || next === GEO.settings || next === GEO.calendar);

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
            // halaman sholat lebih lebar: busur matahari + 5 waktu
            if (page.value === 'prayer' && GEO.prayer) return GEO.prayer;
            // chat: riwayat + input butuh kartu lebih tinggi
            if (page.value === 'chat' && GEO.chat) return GEO.chat;
            // settings: daftar pengaturan yang bisa di-scroll
            if (page.value === 'settings' && GEO.settings) return GEO.settings;
            // kalender: grid bulan 7 kolom x 6 baris
            if (page.value === 'calendar' && GEO.calendar) return GEO.calendar;
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
        // Lubang input click-away mengikuti geometri kartu (lirik/sholat/chat
        // lebih lebar dari expanded biasa).
        if (clickAway) clickAway.setHole({
            w: next.w + 2 * next.ear + 2,
            h: next.h + 1,
        });
        const from = { ...geo };
        const fromR = radiusNow;
        const prevNav = navVisibleFor(prevTarget);
        const nextNav = navVisibleFor(next);
        const navAnimated = prevNav || nextNav;
        if (tween) tween.stop();

        if (navAnimated) {
            nav.visible = true;
            // closing: mulai dari opacity 1 (bukan 0). Dulu `prevNav &&
            // nextNav` membuat nav sempat opacity 0 satu frame saat mulai
            // menutup, lalu kembali 1 — terlihat sebagai kedip.
            nav.set_opacity(prevNav ? 1 : 0);
            nav.set_sensitive(prevNav && nextNav);
        } else {
            nav.visible = false;
        }

        // lebar window dikunci ke maksimum(from, to) + headroom 16px selama
        // transisi lebar, supaya surface tidak resize per frame (press mouse
        // jadi hilang). Headroom perlu karena tween overshoot: tanpa itu
        // notch 429 + telinga membuat window ikut melebar 464 -> 473 -> 464.
        const widthChanges = Math.abs(next.w - from.w) > 0.5;
        let widthLocked = false;
        if (widthChanges) {
            // headroom 16px hanya saat membuka: kurva overshoot membuat notch
            // melebihi target (429 vs 420). Saat menutup nilainya di-clamp ke
            // target, jadi headroom cuma membuat window melebar 464 -> 480
            // tanpa ada yang perlu ditampung.
            const headroom = next.w > from.w ? 16 : 0;
            // Sertakan lebar yang SEDANG teralokasi: konten (mis. halaman
            // media) bisa lebih lebar dari geometri target, sehingga tanpa ini
            // surface ikut menyusut 480 -> 464 per frame saat menutup.
            const lockWidth = Math.round(Math.max(
                frameWrap.get_allocated_width(),
                Math.max(next.w, from.w) + 2 * Math.max(next.ear, from.ear) + headroom,
            ));
            frameWrap.set_size_request(lockWidth, -1);
            widthLocked = true;
        } else {
            // Jangan biarkan lebar terkunci kalau animasi ini TIDAK mengubah
            // lebar. Kasus nyata: animasi buka dihentikan sebelum frame
            // pertama (hover flicker <16ms) -> geo masih 150, animasi tutup
            // menghitung widthChanges=false. Dulu reset hanya di onDone,
            // sehingga lock 480px tertinggal permanen di surface transparan
            // (menelan klik di atas waybar).
            frameWrap.set_size_request(-1, -1);
        }

        // radius diinterpolasi bertahap (5 langkah): GTK3 tidak bisa
        // menganimasikan border-radius, dan set sekali di awal membuat sudut
        // "snap" 14 <-> 32 di frame pertama.
        let radiusStep = -1;
        tween = bezierTween({
            duration: SIZE_DURATION,
            curve: SIZE_CURVE,
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
                    notch.skyRadius = r;
                    notch.css = `border-radius: 0px 0px ${r}px ${r}px;`;
                    notch.queue_draw();
                }
                applyGeometry();
                applyEar();
                // Saat menutup, lepas lock begitu notch visual mencapai
                // target. Tween masih berjalan (nilai di-clamp), tapi surface
                // transparan tidak perlu tetap lebar sampai onDone (~620ms) —
                // itu 350ms area mati yang bisa menelan klik di top bar.
                if (widthLocked && next.w < from.w && geo.w <= next.w + 0.5) {
                    frameWrap.set_size_request(-1, -1);
                    widthLocked = false;
                }
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
                if (widthLocked) frameWrap.set_size_request(-1, -1);
                widthLocked = false;
                radiusNow = next.r;
                notch.skyRadius = next.r;
                notch.css = `border-radius: 0px 0px ${next.r}px ${next.r}px;`;
                notch.queue_draw();
                // page bisa berubah di tengah tween (mis. OSD muncul saat
                // hover); jangan pakai nextNav yang sudah basi.
                const navNow = navVisibleFor(target);
                stack.margin_bottom = navNow ? NAV_SPACE : 0;
                nav.visible = navNow;
                nav.set_opacity(navNow ? 1 : 0);
                nav.set_sensitive(navNow);
                // nav.visible baru berubah di sini; tanpa sync ulang submap
                // `island` tertinggal aktif setelah island tertutup
                syncSubmap();
            },
        });
        tween.start();
    };

    // ── konten bertahap (Nusa: keluar .2s, masuk .32s delay .2s) ────
    const fadeIn = ramp({
        duration: CONTENT_FADE,
        onFrame: value => stack.set_opacity(value),
    });
    let swapTimer = 0;
    let fadeOut = null;

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
        // Jangan restart fade-out close yang sedang berjalan. Sebelum ini,
        // sync() yang datang beruntun (hover/page) menghapus swapTimer dan
        // menghentikan ramp, sehingga Stack bisa tertahan di halaman terakhir
        // dan window tidak kembali ke 170x50.
        if (target === GEO.closed && fadeOut) return;
        if (swapTimer) {
            GLib.source_remove(swapTimer);
            swapTimer = 0;
        }
        if (fadeOut) {
            fadeOut.stop();
            fadeOut = null;
        }
        fadeIn.stop();
        if (target === GEO.closed) {
            // Konten halaman fade-out cepat (140ms) sebelum konten closed
            // dipasang. Tanpa ini, konten halaman yang masih penuh terlihat
            // terpotong oleh kartu yang menyusut pada frame-frame awal.
            const prev = stack.shown;
            if (prev && prev !== 'closed') {
                let finished = false;
                let out = null;
                const finish = () => {
                    if (finished) return;
                    finished = true;
                    if (swapTimer) {
                        GLib.source_remove(swapTimer);
                        swapTimer = 0;
                    }
                    if (fadeOut === out) fadeOut = null;
                    setShown('closed');
                    stack.set_opacity(1);
                };
                out = ramp({
                    duration: REDUCED ? 80 : 140,
                    onFrame: value => stack.set_opacity(1 - value),
                    // Swap di frame yang sama dengan tick terakhir fade-out:
                    // tidak ada frame kartu kosong antara opacity 0 dan 1.
                    onDone: finish,
                });
                fadeOut = out;
                out.start();
                // jaring pengaman bila ramp terhenti tanpa onDone
                swapTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT,
                    REDUCED ? 120 : 200, () => {
                        swapTimer = 0;
                        finish();
                        return GLib.SOURCE_REMOVE;
                    });
                return;
            }
            setShown('closed');
            stack.set_opacity(1);
            return;
        }
        // membuka: bentuk dulu, konten menyusul
        swapTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, CONTENT_DELAY, () => {
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
    // Nav aktif (bisa dipakai keyboard) berbeda dari nav.visible: opacity
    // memudar sampai onDone, tetapi submap harus lepas begitu island mulai
    // menutup. Tanpa ini panah tetap tertelan ~620ms setelah notch tertutup.
    let navActive = false;
    // Sementara dimatikan saat rofi (input chat) terbuka, supaya Escape/
    // panah tidak ditelan submap `island`.
    let navSuppressed = false;
    let submapTimer = 0;
    let submapRunning = false;
    let submapAgain = false;

    const applySubmap = async () => {
        submapRunning = true;
        try {
            const current = String(await Utils.execAsync(['hyprctl', 'submap'])).trim();
            // Baca ulang setelah await: suppressNav(true) bisa terjadi saat
            // query masih berjalan (rofi baru dibuka).
            const want = navActive;
            if (want && current === 'default')
                await Utils.execAsync(['hyprctl', 'dispatch', `hl.dsp.submap("${SUBMAP}")`]);
            else if (!want && current === SUBMAP)
                await Utils.execAsync(['hyprctl', 'dispatch', 'hl.dsp.submap("reset")']);
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
        const navNow = navVisibleFor(next);
        navActive = !navSuppressed && navNow;
        // Transient OSD bisa muncul saat tween buka masih berjalan; jangan
        // biarkan nav dari halaman sebelumnya tertinggal sampai onDone.
        if (!navNow) {
            nav.visible = false;
            nav.set_opacity(0);
            stack.margin_bottom = 0;
        }
        syncSubmap();
        if (next === target && tween && tween.running) return;
        animateTo(next);
        syncContent();
    };

    // Dipakai modul chat saat rofi terbuka. true = lepas submap segera;
    // false = hitung ulang setelah rofi selesai.
    const setNavSuppressed = async value => {
        navSuppressed = !!value;
        if (!navSuppressed) {
            sync();
            return;
        }
        navActive = false;
        if (submapTimer) {
            GLib.source_remove(submapTimer);
            submapTimer = 0;
        }
        try {
            await Utils.execAsync(['hyprctl', 'dispatch', 'hl.dsp.submap("reset")']);
        } catch (_) { }
    };

    bindVariable(hovered, sync);
    bindVariable(page, sync);
    // buka/tutup tampilan lirik: lebar kartu (520) dan isi stack ikut berubah
    bindVariable(mediaView, sync);
    // background langit berubah tiap fase sholat
    bindVariable(sky, () => notch.queue_draw());

    // state awal: tertutup
    notch.skyRadius = GEO.closed.r;
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
        if (!navActive) return false;
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
    // hover: window layer-shell menerima enter/leave untuk seluruh surface
    // (lihat onIslandEnter/onIslandLeave).
    island.connect('enter-notify-event', onIslandEnter);
    island.connect('leave-notify-event', onIslandLeave);
    // Wheel di atas notch = halaman berikut/sebelumnya. Halaman yang punya
    // scroll internal (chat, todo, shelf, bluetooth, wifi, lirik) dibiarkan
    // menangani wheel sendiri agar daftar di dalamnya tetap bisa digulir.
    let lastWheelAt = 0;
    island.connect('scroll-event', (_self, event) => {
        if (!hovered.value || !navActive) return false;
        if (['chat', 'todo', 'shelf', 'settings', 'bluetooth', 'wifi'].includes(page.value) || inLyricsView()) return false;
        const delta = scrollDelta(event);
        if (!delta) return false;
        // Satu notch roda bisa tiba sebagai dua event (diskret + halus);
        // tanpa dedupe halaman melompat dua langkah.
        const now = GLib.get_monotonic_time() / 1000;
        if (now - lastWheelAt < 60) return true;
        lastWheelAt = now;
        stepPage(delta > 0 ? 1 : -1);
        return true;
    });
    // jangan biarkan nav nyangkut setelah window dipindah / di-map ulang
    nav.visible = false;
    // sekaligus membersihkan submap `island` yang mungkin tertinggal kalau AGS
    // mati saat island sedang terbuka
    syncSubmap();
    island.connect('notify::monitor', () => {
        nav.visible = navVisibleFor(target);
        navActive = !navSuppressed && nav.visible;
        syncSubmap();
    });
    island.connect('map', () => {
        nav.visible = false;
        navActive = false;
        syncSubmap();
        // Setter `shown` di setup/konstruksi bisa diabaikan saat Stack
        // di-realize dengan child Overlay; setelah map, setter terbukti
        // bekerja. Ini mengembalikan window ke 170x50 saat start/rebuild.
        stack.shown = 'closed';
        stack.set_opacity(1);
    });
    // Teardown: lepas semua yang hidup di luar umur window (lihat bindVariable
    // dan komentar di atasnya), hentikan animasi/timer yang masih menunjuk
    // widget yang akan disposed.
    island.connect('destroy', () => {
        dead = true;
        if (clickAway) clickAway.visible = false;
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
        if (fadeOut) {
            fadeOut.stop();
            fadeOut = null;
        }
    });

    island.stack = stack;
    island.notch = notch;
    island.clip = clip;
    island.nav = nav;
    island.sync = sync;
    island.geo = geo;
    island.target = () => target;
    island.navKey = navKey;
    island.suppressNav = setNavSuppressed;
    return island;
}

// Referensi window di `dynIsland` bisa berubah saat window dibangun ulang
// (lihat mountIsland), jadi objeknya dibuat sekali di sini dan field window
// diisi ulang oleh publishIsland().
const dyn = {
    page, hovered, showTransient, refreshBase, config: CONFIG,
    notif: notifCurrent, notifLatest, notifSweep,
    wifi: wifiState,
    wifiConnect, wifiDisconnect, wifiScan, wifiPortal,
    stepPage, pinPage, PAGE_ORDER, isPinned, mediaView, btPreview,
    lyrics: lyricsStore, retryLyrics, pomodoro,
    prayer: prayerState, prayerNotify: notifyPrayer,
    chat: chatState, chatSend, chatRetry, chatClear, chatAsk,
    sky, skyRefresh: refreshSky,
    pomodoroModes, pomodoroSetMode, pomodoroToggle, pomodoroReset,
    water, waterDrink, waterSetGoal, waterToggleReminder,
    todo, todoAdd, todoToggle, todoRemove,
    shelf, shelfAdd, shelfRemove, shelfClear, shelfDragOver, shelfUndo, shelfUndoLast,
    toggleOpen, closeIsland,
    weather: weatherState, refreshWeather,
    timer: timerState, timerPreset, timerToggle, timerReset, timerSetMode,
    wellness: wellnessState, wellnessToggle: toggleWellness, wellnessReminder,
    stats: statsState,
    calendar: calendarState, refreshCalendar,
    coverColor,
};
globalThis.dynIsland = dyn;

let island = null;
let mounting = false;
let rebuildTimer = 0;
// Mirror closed-only di monitor lain (opsi "Notch di semua monitor").
let mirrors = [];

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
    dyn.suppressNav = win.suppressNav;
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
        // state hover/buka-paksa milik window lama tidak berlaku untuk window
        // baru; click-away juga harus lepas supaya tidak menahan input.
        forcedOpen = false;
        if (forcedTimer) {
            GLib.source_remove(forcedTimer);
            forcedTimer = 0;
        }
        if (clickAway) clickAway.visible = false;
        hovered.value = false;
        // submap keyboard bisa tertinggal aktif kalau window mati saat nav tampil
        Utils.execAsync(['hyprctl', 'dispatch', 'hl.dsp.submap("reset")']).catch(() => { });

        const win = DynamicIsland();
        App.addWindow(win);
        island = win;
        publishIsland(win);
        // mirror harus tahu monitor island berubah (ikuti fokus / tetap)
        win.connect('notify::monitor', () => syncMirrors());
        syncMirrors();
        console.log('[dyn-island] window dipasang');

        win.connect('destroy', () => {
            if (mounting) return;
            island = null;
            syncMirrors();
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

// ── mirror closed-only untuk mode "Notch di semua monitor" ───────────────
// Island interaktif tetap satu (mengikuti fokus atau tetap di monitor awal).
// Monitor lain mendapat notch closed yang menampilkan data yang sama, sehingga
// tidak perlu menduplikasi state/nav/page. Mirror tidak menerima input.
function buildMirror(index) {
    const closed = CONFIG.geometry.closed;
    const notch = Widget.Box({ className: 'dyn-island-notch' });
    notch.skyRadius = closed.r;
    notch.css = `border-radius: 0px 0px ${closed.r}px ${closed.r}px;`;
    notch.set_size_request(closed.w, closed.h);
    notch.connect('draw', (self, cr) => {
        drawSky(
            cr,
            self.get_allocated_width(),
            self.get_allocated_height(),
            self.skyRadius,
            sky.value,
            glowEnabled.value ? coverColor.value : null,
        );
        return false;
    });
    notch.hook(sky, () => notch.queue_draw());
    notch.hook(coverColor, () => notch.queue_draw());
    notch.hook(glowEnabled, () => notch.queue_draw());
    notch.child = Closed();

    const leftEar = Ear('left');
    const rightEar = Ear('right');
    leftEar.setSize(closed.ear);
    rightEar.setSize(closed.ear);
    const frame = Widget.Box({
        className: 'dyn-island-frame',
        children: [leftEar.widget, notch, rightEar.widget],
    });
    const win = Widget.Window({
        name: `dynamic-island-mirror-${index}`,
        className: 'dyn-island-window',
        layer: 'top',
        anchor: ['top'],
        exclusivity: 'ignore',
        keymode: 'none',
        monitor: index,
        margins: [CONFIG.marginTop, 0, 0, 0],
        visible: false,
        child: frame,
    });
    win.connect('map', () => {
        try {
            const region = new Cairo.Region();
            win.get_window()?.input_shape_combine_region(region, 0, 0);
        } catch (_) { }
    });
    return win;
}

function destroyMirrors() {
    for (const win of mirrors) {
        try {
            if (!win.is_destroyed) App.removeWindow(win);
        } catch (_) { }
        try {
            if (!win.is_destroyed) win.destroy();
        } catch (_) { }
    }
    mirrors = [];
}

function mountMirrors() {
    destroyMirrors();
    if (!CONFIG.notch?.perMonitor) return;
    const display = Gdk.Display.get_default();
    if (!display) return;
    for (let i = 0; i < display.get_n_monitors(); i++) {
        const win = buildMirror(i);
        App.addWindow(win);
        mirrors.push(win);
    }
    syncMirrors();
}

function syncMirrors() {
    const primary = island && !island.is_destroyed
        ? (Number.isInteger(island.monitor) ? island.monitor : 0)
        : -1;
    mirrors.forEach((win, index) => {
        if (win.is_destroyed) return;
        win.visible = primary >= 0 && index !== primary;
    });
}

dyn.mirrorWindows = () => mirrors;
dyn.mountMirrors = mountMirrors;
dyn.syncMirrors = syncMirrors;

try {
    watchMpris();
    watchNotifications();
    watchAudioRouting();
    watchWifi();
    const gdkDisplay = Gdk.Display.get_default();
    if (gdkDisplay) {
        gdkDisplay.connect('monitor-added', () => mountMirrors());
        gdkDisplay.connect('monitor-removed', () => mountMirrors());
    }
// Layer transparan yang menutup island saat klik di luar notch. Dibuat
// sebelum window lain supaya tetap di bawah popup/island bila stacking layer
// mengikuti urutan pembuatan.
clickAway = ClickAway({ onClose: closeIsland });
App.addWindow(clickAway);
dyn.clickAway = clickAway;

// Kartu pomodoro di kanan atas (terpisah dari island, lihat pomodoro-osd.js).
// Dibuat SEBELUM popup notifikasi: layer yang dibuat belakangan berada di atas,
// jadi popup notifikasi tidak bisa tertutup kartu pomodoro.
const pomodoroCard = PomodoroOsd();
App.addWindow(pomodoroCard);
dyn.pomodoroCard = pomodoroCard;

// popup notifikasi kanan atas digambar island sendiri (slide + loading bar).
// Popup bawaan swaync dimatikan lewat notification-visibility "muted";
// notifikasi tetap masuk control center swaync.
const notifPopup = NotificationPopup();
App.addWindow(notifPopup);
dyn.notifPopup = notifPopup;

// Jendela chat Gemini di luar island (keymode exclusive). Dibuka dari tombol
// "Tanya Gemini" di halaman chat island atau lewat keybind SUPER+ALT+G.
const geminiChat = GeminiChat();
App.addWindow(geminiChat);
dyn.chatWindow = geminiChat;

// Daily standup: popup + pengingat Senin-Jumat 10:00. Klik notifikasi
// "Standup" membuka popup ini (aksi lokal, bukan ActionInvoked DBus).
const standupWin = StandupWindow();
App.addWindow(standupWin);
// API { open, close, toggle, win } dibuat oleh modul; widget-nya disimpan terpisah
dyn.standupWindow = globalThis.standupWindow;
registerLocalAction('Wellness', onWellnessAction);
dyn.standupWinWidget = standupWin;
registerLocalAction('Standup', () => globalThis.standupWindow?.toggle?.());

// Popup kalender: grid bulan + editor catatan per hari.
const calendarWin = CalendarWindow();
App.addWindow(calendarWin);
dyn.calendarWindow = globalThis.calendarWindow;
dyn.calendarWinWidget = calendarWin;
// Notifikasi timer/pomodoro/water/prayer/calendar memakai app "Notch" dan
// sebagian menulis "klik untuk membuka island"; registry ini yang menjalankan
// janji tersebut (default action-nya membuka paksa island).
registerLocalAction('Notch', () => toggleOpen(true));
scheduleStandupReminder();
// Cuaca hanya di-poll kalau modulnya aktif (prinsip: tanpa request diam-diam).
if (CONFIG.modules?.weather !== false) watchWeather();
restoreTimer();
watchWellness();
watchStats();
watchCalendar();
watchCalendarNotes();
dyn.calendarNotes = calendarNotes;
dyn.calendarApi = {
    add: calendarNoteAdd, remove: calendarNoteRemove,
    check: calendarNotesCheck, notesFor: calendarNotesFor,
};
dyn.notifInvoke = notifInvoke;
dyn.standupApi = {
    add: standupAdd, remove: standupRemove, save: standupSave,
    load: standupLoad, remind: standupRemind, state: standupStore, titleFor: standupTitle,
};
// Catatan: DND TIDAK dipaksa lagi. Dulu island menjalankan `swaync-client -dn`
// tiap 3 detik supaya popup swaync tidak dobel, akibatnya toggle DND user
// selalu kembali nyala (indikator DND tidak bisa dimatikan). Penggantinya:
// config swaync `notification-visibility` state "muted" (popup tidak muncul,
// control center tetap menerima), jadi DND bebas dipakai user.
    watchLyrics();
    watchWater();
    watchTodo();
    watchPrayer();
    watchSky();
    App.connect('config-parsed', applyStyle);
    mountIsland();
    mountMirrors();
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
