const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('node:path');
const settings = require('./settings');

// Beberapa lingkungan Wayland (VM, driver rusak) membuat proses GPU gagal
// diluncurkan dan Electron keluar dengan "GPU process isn't usable".
// Default tetap memakai GPU; matikan lewat env bila itu terjadi:
//   DYNAMIC_ISLAND_NO_GPU=1
if (process.env.DYNAMIC_ISLAND_NO_GPU === '1')
    app.disableHardwareAcceleration();

// Dynamic island lintas OS: jendela frameless, always-on-top, menempel di
// tengah tepi atas layar.
//
// PENTING — kenapa jendela selalu besar:
// Kalau jendela hanya sebesar notch tertutup (150x50), notch tidak akan pernah
// bisa membesar saat hover: kursor keluar dari jendela sebelum event mouse
// terkirim, dan tidak ada layer-shell yang bisa memperbesar permukaan keluar
// bounds. Karena itu surface dibuat sebesar notch terbuka maksimum; area di
// luar badan notch transparan dan klik menembus ke aplikasi di bawahnya.
const SURFACE_W = 564;
const SURFACE_H = 232;

let win = null;
let hitTimer = 0;
let notchRect = null;
let ignoring = null;

// Wayland TIDAK memberi tahu klien posisi absolutnya: dibuktikan di mesin ini,
// screen.getCursorScreenPoint() mengembalikan {0,0} dan win.getBounds()
// mengembalikan {x:0,y:0} walau jendela berada di [678,0]. Hit-test berbasis
// koordinat karena itu selalu salah dan menembuskan SEMUA event mouse —
// akibatnya hover mati total. Di Wayland kita matikan hit-test dan terima
// konsekuensinya (surface besar menangkap klik di area transparan).
const IS_WAYLAND = process.platform === 'linux'
    && (!!process.env.WAYLAND_DISPLAY || process.env.XDG_SESSION_TYPE === 'wayland');

const placeWindow = () => {
    if (!win || win.isDestroyed()) return;
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const { x, y, width } = display.workArea;
    win.setBounds({
        x: Math.round(x + (width - SURFACE_W) / 2),
        y,
        width: SURFACE_W,
        height: SURFACE_H,
    });
};

// Renderer melaporkan bentuk notch yang terlihat (koordinat jendela).
const setNotchRect = rect => {
    notchRect = rect && rect.width > 0 && rect.height > 0 ? rect : null;
    applyHitTest(true);
};

const applyHitTest = force => {
    if (!win || win.isDestroyed()) return;
    if (IS_WAYLAND) {
        // Jangan pernah menembuskan: surface butuh event mouse untuk hover.
        if (ignoring !== false) {
            ignoring = false;
            win.setIgnoreMouseEvents(false);
        }
        return;
    }
    const bounds = win.getBounds();
    const point = screen.getCursorScreenPoint();
    const localX = point.x - bounds.x;
    const localY = point.y - bounds.y;

    // Belum ada laporan bentuk: anggap seluruh surface interaktif supaya UI
    // tidak terkunci di luar jangkauan mouse.
    const rect = notchRect ?? { x: 0, y: 0, width: bounds.width, height: bounds.height };
    const inside = localX >= rect.x && localX <= rect.x + rect.width
        && localY >= rect.y && localY <= rect.y + rect.height;

    const next = !inside;
    if (force || next !== ignoring) {
        ignoring = next;
        win.setIgnoreMouseEvents(next, { forward: true });
    }
};

const startHitTest = () => {
    if (IS_WAYLAND) return;   // lihat catatan IS_WAYLAND di atas
    if (hitTimer) return;
    // 60ms: cukup responsif untuk hover, murah (satu query per tick).
    hitTimer = setInterval(() => applyHitTest(false), 60);
};

const createWindow = () => {
    win = new BrowserWindow({
        width: SURFACE_W,
        height: SURFACE_H,
        frame: false,
        transparent: true,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        skipTaskbar: true,
        show: false,
        hasShadow: false,
        alwaysOnTop: true,
        // `type: panel` di macOS = jendela utilitas di atas aplikasi lain
        // tanpa muncul di Dock.
        ...(process.platform === 'darwin' ? { type: 'panel' } : {}),
        webPreferences: {
            preload: path.join(__dirname, '..', 'preload', 'index.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            backgroundThrottling: false,
        },
    });

    win.setAlwaysOnTop(true, 'screen-saver');
    if (process.platform === 'darwin')
        win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    win.webContents.on('did-fail-load', (_e, code, desc, url) => {
        console.error('[renderer gagal dimuat]', code, desc, url);
    });
    win.webContents.on('console-message', event => {
        // Bentuk event baru (Electron >= 35); argumen lama deprecated.
        if (event?.level === 'error') console.error('[renderer]', event.message);
    });

    win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

    win.once('ready-to-show', () => {
        placeWindow();
        win.showInactive();
        startHitTest();
    });

    screen.on('display-metrics-changed', placeWindow);
    screen.on('display-added', placeWindow);
    screen.on('display-removed', placeWindow);

    win.on('closed', () => {
        if (hitTimer) clearInterval(hitTimer);
        hitTimer = 0;
        win = null;
    });

    return win;
};

app.whenReady().then(() => {
    settings.load();
    createWindow();
    app.on('activate', () => {
        if (!win || win.isDestroyed()) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// ── IPC ─────────────────────────────────────────────────────────────────
// Renderer tanpa akses Node (contextIsolation). Semua operasi sistem lewat sini.

ipcMain.handle('window:place', () => {
    placeWindow();
    return { ok: true };
});

ipcMain.handle('window:notch-rect', (_e, rect) => {
    setNotchRect(rect ?? null);
    return { ok: true };
});

ipcMain.handle('window:pointer', () => {
    const point = screen.getCursorScreenPoint();
    const bounds = win && !win.isDestroyed() ? win.getBounds() : { x: 0, y: 0 };
    return { x: point.x - bounds.x, y: point.y - bounds.y, screenX: point.x, screenY: point.y };
});

ipcMain.handle('window:bounds', () => {
    if (!win || win.isDestroyed()) return null;
    return win.getBounds();
});

ipcMain.handle('app:platform', () => ({
    platform: process.platform,
    arch: process.arch,
    version: app.getVersion(),
}));

require('./ipc/system')(ipcMain);
require('./ipc/store')(ipcMain);
require('./ipc/chat')(ipcMain);
require('./ipc/notifications')(ipcMain);
require('./ipc/app')(ipcMain);
