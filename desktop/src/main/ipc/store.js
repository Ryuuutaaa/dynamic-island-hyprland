const settings = require('../settings');

// IPC penyimpanan setelan + kredensial. Kredensial TIDAK disimpan di
// settings.json: file terpisah dengan mode 0600 di Linux/macOS.

module.exports = ipcMain => {
    ipcMain.handle('store:get', (_e, key) => settings.get(key));
    ipcMain.handle('store:set', (_e, patch) => settings.set(patch ?? {}));
    ipcMain.handle('store:path', () => settings.resolvePath());
};
