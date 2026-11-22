const { spawn } = require('node:child_process');

// Notifikasi MASUK.
//
// Linux: disadap dari D-Bus, sama seperti versi AGS (modules/notify.js).
//   `dbus-monitor --session interface=org.freedesktop.Notifications`
//   Parsing ada di lib/notify-parser.mjs supaya bisa diuji tanpa spawn.
//
// Windows/macOS: OS tidak mengizinkan aplikasi membaca notifikasi aplikasi
//   lain tanpa izin khusus (Aksesibilitas di macOS, UI Automation di Windows).
//   Modul ini melaporkan `captureExternal: false` apa adanya.

const MAX_ITEMS = 20;

const state = { unread: 0, items: [] };
let target = null;
let proc = null;
let restartTimer = null;

const push = item => {
    const entry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        at: Date.now(),
        app: String(item?.app ?? 'Aplikasi'),
        title: String(item?.title ?? ''),
        body: String(item?.body ?? ''),
    };
    state.items = [entry, ...state.items].slice(0, MAX_ITEMS);
    state.unread = Math.min(state.unread + 1, MAX_ITEMS);
    try {
        if (target && !target.isDestroyed()) target.send('notifications:push', entry);
    } catch (_) { }
    return entry;
};

const startLinux = async () => {
    if (proc) return;
    let createNotifyParser;
    try {
        // lib/ memakai ESM (.mjs); main process CommonJS memuatnya async.
        ({ createNotifyParser } = await import('../lib/notify-parser.mjs'));
    } catch (error) {
        console.error('[notifikasi] parser gagal dimuat:', error?.message ?? error);
        return;
    }
    const parse = createNotifyParser(push);

    try {
        proc = spawn('dbus-monitor', [
            '--session',
            'interface=org.freedesktop.Notifications',
            'type=method_call',
        ], { stdio: ['ignore', 'pipe', 'ignore'] });
    } catch (error) {
        console.error('[notifikasi] gagal menjalankan dbus-monitor:', error?.message ?? error);
        return;
    }

    let buffer = '';
    proc.stdout.on('data', chunk => {
        buffer += chunk.toString('utf8');
        let index;
        while ((index = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, index).trimEnd();
            buffer = buffer.slice(index + 1);
            try { parse(line); } catch (_) { }
        }
    });

    proc.on('error', error => {
        console.error('[notifikasi] dbus-monitor error:', error?.message ?? error);
        proc = null;
    });

    proc.on('close', () => {
        proc = null;
        if (restartTimer) return;
        // Sesi D-Bus bisa restart; pasang ulang setelah jeda singkat.
        restartTimer = setTimeout(() => {
            restartTimer = null;
            if (process.platform === 'linux') startLinux();
        }, 3000);
    });
};

const capability = () => ({
    captureExternal: process.platform === 'linux',
    internal: true,
    reason: process.platform === 'linux'
        ? 'Menyadap org.freedesktop.Notifications lewat dbus-monitor.'
        : 'OS tidak mengizinkan aplikasi membaca notifikasi aplikasi lain tanpa izin aksesibilitas.',
});

module.exports = ipcMain => {
    if (process.platform === 'linux') startLinux();

    ipcMain.handle('notifications:state', () => ({ ...state, capability: capability() }));
    ipcMain.handle('notifications:push', (_e, item) => push(item ?? {}));
    ipcMain.handle('notifications:clear', () => {
        state.items = [];
        state.unread = 0;
        return { ok: true };
    });
    ipcMain.handle('notifications:mark-read', () => {
        state.unread = 0;
        return { ok: true };
    });
    ipcMain.handle('notifications:register', event => {
        target = event.sender;
        return { ok: true, capability: capability() };
    });
};

module.exports.push = push;
module.exports.state = state;
module.exports.capability = capability;
