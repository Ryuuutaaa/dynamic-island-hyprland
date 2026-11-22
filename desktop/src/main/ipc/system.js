const system = require('../system');

// IPC untuk operasi sistem. Renderer memanggil satu nama kanal; implementasi
// per OS ada di main/system.js.

module.exports = ipcMain => {
    ipcMain.handle('system:battery', () => system.battery());
    ipcMain.handle('system:volume', () => system.volume());
    ipcMain.handle('system:set-volume', (_e, value) => system.setVolume(value));
    ipcMain.handle('system:brightness', () => system.brightness());
    ipcMain.handle('system:notify', (_e, payload) => system.notify(payload ?? {}));
    ipcMain.handle('system:open', (_e, target) => system.openPath(target));
    ipcMain.handle('system:info', () => system.sysinfo());
    ipcMain.handle('system:support', () => system.platformSupport());
};
