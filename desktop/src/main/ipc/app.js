const autostart = require('../autostart');

// IPC untuk autostart saat login. Implementasi per OS ada di ../autostart.js.

module.exports = ipcMain => {
    ipcMain.handle('autostart:get', () => autostart.get());
    ipcMain.handle('autostart:set', (_e, enabled) => autostart.set(!!enabled));
};
