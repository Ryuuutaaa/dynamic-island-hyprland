const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app } = require('electron');

// Autostart saat login, per OS:
//   Linux  : ~/.config/autostart/<app>.desktop (XDG Autostart)
//   Windows: HKCU\...\Run lewat app.setLoginItemSettings
//   macOS  : Login Items lewat app.setLoginItemSettings
//
// Linux ditangani manual karena Electron tidak menulis file .desktop. Nama
// file mengikuti executableName dari electron-builder supaya konsisten dengan
// paket yang dipasang.

const APP_NAME = 'dynamic-island';
const LINUX_DIR = path.join(os.homedir(), '.config', 'autostart');
const LINUX_FILE = path.join(LINUX_DIR, `${APP_NAME}.desktop`);

// Saat dijalankan dari source (`electron .`), argumen perlu disertakan supaya
// autostart membuka aplikasi yang sama, bukan biner `electron` tanpa target.
const execCommand = () => {
    const exe = process.execPath;
    // app.isPackaged true pada AppImage/deb/nsis/dmg.
    const args = app.isPackaged ? [] : [path.resolve(process.argv[1] ?? '.')];
    const quoted = [exe, ...args].map(part => `"${part}"`).join(' ');
    // --no-sandbox hanya untuk sesi dev di sistem dengan AppArmor ketat.
    return app.isPackaged ? quoted : `${quoted} --no-sandbox`;
};

const linuxDesktopEntry = () => [
    '[Desktop Entry]',
    'Type=Application',
    'Name=Dynamic Island',
    'Comment=Notch di tengah atas layar',
    `Exec=${execCommand()}`,
    'Terminal=false',
    'X-GNOME-Autostart-enabled=true',
    'StartupNotify=false',
    '',
].join('\n');

const linuxEnabled = () => fs.existsSync(LINUX_FILE);

const setLinux = enabled => {
    try {
        if (enabled) {
            fs.mkdirSync(LINUX_DIR, { recursive: true });
            fs.writeFileSync(LINUX_FILE, linuxDesktopEntry(), 'utf8');
        } else if (fs.existsSync(LINUX_FILE)) {
            fs.unlinkSync(LINUX_FILE);
        }
        return { ok: true, enabled: linuxEnabled() };
    } catch (error) {
        return { ok: false, error: String(error?.message ?? error) };
    }
};

const get = () => {
    if (process.platform === 'linux')
        return { supported: true, enabled: linuxEnabled(), method: 'xdg-autostart' };
    if (process.platform === 'win32' || process.platform === 'darwin') {
        const value = app.getLoginItemSettings();
        return {
            supported: true,
            enabled: !!value.openAtLogin,
            method: process.platform === 'win32' ? 'registry-run' : 'login-items',
        };
    }
    return { supported: false, enabled: false, method: 'none' };
};

const set = enabled => {
    if (process.platform === 'linux') return setLinux(!!enabled);
    if (process.platform === 'win32' || process.platform === 'darwin') {
        try {
            app.setLoginItemSettings({
                openAtLogin: !!enabled,
                // Argumen agar mode dev tetap membuka config yang benar.
                ...(app.isPackaged ? {} : { args: ['--no-sandbox'] }),
            });
            return { ok: true, enabled: !!app.getLoginItemSettings().openAtLogin };
        } catch (error) {
            return { ok: false, error: String(error?.message ?? error) };
        }
    }
    return { ok: false, error: 'autostart tidak didukung di platform ini' };
};

module.exports = { get, set, path: () => (process.platform === 'linux' ? LINUX_FILE : null) };
