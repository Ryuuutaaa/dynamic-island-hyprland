const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

// Integrasi sistem yang berbeda per OS. Renderer memanggil satu API yang sama;
// implementasinya dipilih di sini. Setiap fungsi selalu mengembalikan bentuk
// yang sama supaya UI tidak perlu tahu platform.

const run = (cmd, args = [], { timeout = 8000 } = {}) => new Promise(resolve => {
    execFile(cmd, args, { timeout, windowsHide: true }, (error, stdout, stderr) => {
        resolve({
            ok: !error,
            stdout: String(stdout ?? ''),
            stderr: String(stderr ?? ''),
            error: error ? (error.code ?? error.message) : null,
        });
    });
});

const platform = () => process.platform;

// ── baterai ─────────────────────────────────────────────────────────────
// Linux: sysfs (tanpa proses tambahan). macOS: pmset. Windows: PowerShell
// WMI lewat CIM (Get-CimInstance). Semua dibaca dari main process.

const readLinuxBattery = () => {
    const base = '/sys/class/power_supply';
    try {
        for (const name of fs.readdirSync(base)) {
            if (!name.startsWith('BAT')) continue;
            const dir = path.join(base, name);
            const read = file => {
                try { return fs.readFileSync(path.join(dir, file), 'utf8').trim(); } catch (_) { return ''; }
            };
            const capacity = Number(read('capacity'));
            if (!Number.isFinite(capacity)) continue;
            return {
                available: true,
                percent: capacity,
                charging: read('status').toLowerCase() === 'charging',
            };
        }
    } catch (_) { }
    return { available: false, percent: 0, charging: false };
};

const readMacBattery = async () => {
    const out = await run('pmset', ['-g', 'batt']);
    const percent = Number(/(\d+)%/.exec(out.stdout)?.[1]);
    const charging = /AC Power|charging/i.test(out.stdout) && !/discharging/i.test(out.stdout);
    return Number.isFinite(percent)
        ? { available: true, percent, charging }
        : { available: false, percent: 0, charging: false };
};

const readWindowsBattery = async () => {
    // Win32_Battery hanya ada di perangkat dengan baterai; desktop mengembalikan kosong.
    const out = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        'Get-CimInstance Win32_Battery | Select-Object -First 1 EstimatedChargeRemaining,BatteryStatus | ConvertTo-Json -Compress']);
    try {
        const data = JSON.parse(out.stdout.trim());
        const percent = Number(data?.EstimatedChargeRemaining);
        if (!Number.isFinite(percent)) throw new Error('kosong');
        // BatteryStatus 2 = AC (mengisi daya).
        return { available: true, percent, charging: Number(data?.BatteryStatus) === 2 };
    } catch (_) {
        return { available: false, percent: 0, charging: false };
    }
};

const battery = async () => {
    if (platform() === 'linux') return readLinuxBattery();
    if (platform() === 'darwin') return readMacBattery();
    if (platform() === 'win32') return readWindowsBattery();
    return { available: false, percent: 0, charging: false };
};

// ── volume ──────────────────────────────────────────────────────────────
// Linux: wpctl (PipeWire) lalu pamixer (Pulse) sebagai cadangan.
// macOS: osascript. Windows: PowerShell audio API tidak tersedia tanpa modul,
// jadi dikembalikan tidak didukung (UI menyembunyikan slider-nya).

const volume = async () => {
    if (platform() === 'linux') {
        const wp = await run('wpctl', ['get-volume', '@DEFAULT_AUDIO_SINK@']);
        const match = /Volume:\s*([\d.]+)/.exec(wp.stdout);
        if (wp.ok && match) {
            return { supported: true, volume: Number(match[1]), muted: /MUTED/.test(wp.stdout) };
        }
        const pam = await run('pamixer', ['--get-volume-human']);
        if (pam.ok) {
            const text = pam.stdout.trim();
            return { supported: true, volume: Number(text.replace('%', '')) / 100 || 0, muted: /muted/i.test(text) };
        }
        return { supported: false, volume: 0, muted: false };
    }
    if (platform() === 'darwin') {
        const out = await run('osascript', ['-e', 'output volume of (get volume settings)']);
        const percent = Number(out.stdout.trim());
        if (!Number.isFinite(percent)) return { supported: false, volume: 0, muted: false };
        return { supported: true, volume: percent / 100, muted: percent === 0 };
    }
    return { supported: false, volume: 0, muted: false };
};

const setVolume = async (value) => {
    const percent = Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100);
    if (platform() === 'linux') {
        const wp = await run('wpctl', ['set-volume', '@DEFAULT_AUDIO_SINK@', `${percent / 100}`]);
        if (wp.ok) return { ok: true };
        return { ok: (await run('pamixer', ['--set-volume', String(percent)])).ok };
    }
    if (platform() === 'darwin')
        return { ok: (await run('osascript', ['-e', `set volume output volume ${percent}`])).ok };
    return { ok: false, error: 'volume tidak didukung di platform ini' };
};

// ── kecerahan ───────────────────────────────────────────────────────────

const brightness = async () => {
    if (platform() === 'linux') {
        const out = await run('brightnessctl', ['-m']);
        if (!out.ok) return { supported: false, percent: 0 };
        // Format: device,class,current,percent%
        const percent = Number(/,(\d+)%/.exec(out.stdout)?.[1]);
        return Number.isFinite(percent)
            ? { supported: true, percent }
            : { supported: false, percent: 0 };
    }
    if (platform() === 'darwin') {
        // AppleScript tidak bisa membaca kecerahan tanpa modul pihak ketiga.
        return { supported: false, percent: 0 };
    }
    return { supported: false, percent: 0 };
};

// ── notifikasi sistem ───────────────────────────────────────────────────

const notify = async ({ title, body }) => {
    if (platform() === 'linux')
        return { ok: (await run('notify-send', ['-a', 'Dynamic Island', String(title ?? ''), String(body ?? '')])).ok };
    if (platform() === 'darwin') {
        const script = `display notification ${JSON.stringify(String(body ?? ''))} with title ${JSON.stringify(String(title ?? ''))}`;
        return { ok: (await run('osascript', ['-e', script])).ok };
    }
    if (platform() === 'win32') {
        // Toast Windows butuh modul/PS script; pakai balloon lewat PowerShell.
        const script = [
            'Add-Type -AssemblyName System.Windows.Forms',
            '$n = New-Object System.Windows.Forms.NotifyIcon',
            '$n.Icon = [System.Drawing.SystemIcons]::Information',
            `$n.Visible = $true; $n.ShowBalloonTip(4000, ${JSON.stringify(String(title ?? ''))}, ${JSON.stringify(String(body ?? ''))}, 'Info')`,
            'Start-Sleep -Milliseconds 4500; $n.Dispose()',
        ].join('; ');
        return { ok: (await run('powershell.exe', ['-NoProfile', '-Command', script])).ok };
    }
    return { ok: false };
};

// ── buka berkas / URL ───────────────────────────────────────────────────

const openPath = async target => {
    // Electron punya shell.openPath, tapi modul ini dipakai juga dari skrip
    // diagnostik; execFile lebih jujur soal keberhasilan per platform.
    if (platform() === 'linux') return { ok: (await run('xdg-open', [String(target)])).ok };
    if (platform() === 'darwin') return { ok: (await run('open', [String(target)])).ok };
    if (platform() === 'win32') return { ok: (await run('cmd', ['/c', 'start', '', String(target)], { timeout: 4000 })).ok };
    return { ok: false };
};

// ── info sistem (pengganti sysstats) ────────────────────────────────────

const sysinfo = async () => {
    const total = os.totalmem();
    const free = os.freemem();
    const load = os.loadavg()[0];
    const memPercent = total > 0 ? Math.round(((total - free) / total) * 100) : 0;
    return {
        platform: platform(),
        arch: os.arch(),
        hostname: os.hostname(),
        cpus: os.cpus().length,
        memoryPercent: memPercent,
        memoryUsedMb: Math.round((total - free) / 1024 / 1024),
        memoryTotalMb: Math.round(total / 1024 / 1024),
        load1: Number(load?.toFixed?.(2) ?? 0),
        uptimeSec: Math.round(os.uptime()),
    };
};

// Wayland menyembunyikan posisi absolut window dari klien, sehingga fitur
// yang bergantung pada koordinat layar (memusatkan notch) tidak dapat
// diandalkan.
const isWayland = () => platform() === 'linux'
    && (!!process.env.WAYLAND_DISPLAY || process.env.XDG_SESSION_TYPE === 'wayland');

// Laporan kemampuan apa adanya. Setiap nilai di sini punya alasan teknis yang
// bisa diperiksa, bukan tebakan: lebih baik UI menyembunyikan fitur daripada
// menampilkan tombol yang tidak melakukan apa pun.
const platformSupport = () => {
    const os = platform();
    return {
        platform: os,
        features: {
            // Semua OS: jendela frameless always-on-top bisa dibuat.
            overlayWindow: true,
            // Notch menempel ke tepi bezel tanpa mengganggu aplikasi lain:
            // hanya mungkin dengan layer-shell (Wayland). Di OS lain jendela
            // biasa yang selalu di atas.
            layerShellNotch: false,
            // Memusatkan jendela sendiri: di Wayland klien tidak menentukan
            // posisinya, jadi hasilnya bergantung compositor.
            windowPositioning: !isWayland(),
            battery: os !== 'linux' || fs.existsSync('/sys/class/power_supply'),
            volume: os !== 'win32',
            brightness: os === 'linux',
            // Menyadap notifikasi aplikasi lain: hanya Linux (D-Bus).
            captureNotifications: os === 'linux',
            // Mengirim notifikasi keluar: tersedia di semua OS.
            sendNotifications: true,
            autostart: os === 'linux' || os === 'win32' || os === 'darwin',
        },
        notes: isWayland()
            ? ['Wayland: posisi jendela ditentukan compositor, bukan aplikasi.']
            : [],
    };
};

module.exports = {
    run, platform, battery, volume, setVolume, brightness, notify,
    openPath, sysinfo, platformSupport,
};
