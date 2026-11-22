// Jembatan aman antara renderer (tanpa Node) dan main process.
// Hanya fungsi yang dibutuhkan UI yang diekspos, bukan `require` mentah.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('island', {
    platform: () => ipcRenderer.invoke('app:platform'),

    window: {
        place: () => ipcRenderer.invoke('window:place'),
        notchRect: rect => ipcRenderer.invoke('window:notch-rect', rect),
        pointer: () => ipcRenderer.invoke('window:pointer'),
        bounds: () => ipcRenderer.invoke('window:bounds'),
    },

    store: {
        get: key => ipcRenderer.invoke('store:get', key),
        set: patch => ipcRenderer.invoke('store:set', patch),
        path: () => ipcRenderer.invoke('store:path'),
    },

    system: {
        battery: () => ipcRenderer.invoke('system:battery'),
        volume: () => ipcRenderer.invoke('system:volume'),
        setVolume: value => ipcRenderer.invoke('system:set-volume', value),
        brightness: () => ipcRenderer.invoke('system:brightness'),
        notify: payload => ipcRenderer.invoke('system:notify', payload),
        open: target => ipcRenderer.invoke('system:open', target),
        info: () => ipcRenderer.invoke('system:info'),
        support: () => ipcRenderer.invoke('system:support'),
    },

    notifications: {
        register: () => ipcRenderer.invoke('notifications:register'),
        state: () => ipcRenderer.invoke('notifications:state'),
        clear: () => ipcRenderer.invoke('notifications:clear'),
        markRead: () => ipcRenderer.invoke('notifications:mark-read'),
        push: item => ipcRenderer.invoke('notifications:push', item),
        onPush: callback => {
            // Listener tetap terpasang selama renderer hidup; dipakai untuk
            // menampilkan notifikasi masuk di kartu notch tanpa polling.
            const handler = (_event, item) => callback(item);
            ipcRenderer.on('notifications:push', handler);
            return () => ipcRenderer.removeListener('notifications:push', handler);
        },
    },

    autostart: {
        get: () => ipcRenderer.invoke('autostart:get'),
        set: enabled => ipcRenderer.invoke('autostart:set', enabled),
    },

    chat: {
        keyStatus: () => ipcRenderer.invoke('chat:key-status'),
        saveKey: key => ipcRenderer.invoke('chat:save-key', key),
        clearKey: () => ipcRenderer.invoke('chat:clear-key'),
        testKey: key => ipcRenderer.invoke('chat:test-key', key),
        send: payload => ipcRenderer.invoke('chat:send', payload),
        credentialsPath: () => ipcRenderer.invoke('chat:credentials-path'),
    },
});
