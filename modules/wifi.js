import GLib from 'gi://GLib';
import Variable from 'resource:///com/github/Aylur/ags/variable.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';
import CONFIG from '../config.js';
import { page } from '../state.js';

// NetworkManager lewat nmcli. Halaman ini menangani dua jenis jaringan:
//   - WPA/WPA2/WPA3 biasa: password diminta lewat rofi lalu dikirim ke nmcli.
//   - Captive portal: WiFi tersambung tetapi butuh login lewat halaman web.
//     NetworkManager menandainya sebagai connectivity "portal"; tombol
//     "Buka halaman login" membuka URL yang di-redirect oleh portal itu.

const SCAN_SECONDS = () => Math.max(5, Number(CONFIG.wifi?.scanSeconds ?? 20));
const AUTO_PORTAL = () => CONFIG.wifi?.autoPortal !== false;
const CHECK_URL = () => CONFIG.wifi?.portalUrl || 'http://connectivity-check.ubuntu.com/';

export const wifi = Variable({
    enabled: true,
    iface: '',
    networks: [],
    connected: '',
    ip: '',
    connectivity: '',
    busy: '',
    error: '',
    scanning: false,
    portalOpened: '',
    portalUrl: '',
});

const update = patch => { wifi.value = { ...wifi.value, ...patch }; };

const textOf = error => String(error?.message ?? error ?? '').replace(/\s+/g, ' ').trim();

// nmcli -t meng-escape ':' di dalam SSID sebagai '\:'; pisahkan dengan sadar
// escape supaya nama jaringan seperti "Kopi: Senja" tetap utuh.
const splitTerse = line => {
    const out = [];
    let cur = '';
    let escape = false;
    for (const ch of line) {
        if (escape) { cur += ch; escape = false; }
        else if (ch === '\\') escape = true;
        else if (ch === ':') { out.push(cur); cur = ''; }
        else cur += ch;
    }
    out.push(cur);
    return out;
};

let savedProfiles = new Set();
let portalNotified = '';

// Notifikasi portal memakai app "WiFi"; index.js mendaftarkan aksi lokal
// 'WiFi' supaya klik kartu (default action) maupun chip "Buka login"
// langsung memanggil openPortal().
const notifyPortal = ssid => {
    Utils.execAsync([
        'gdbus', 'call', '--session',
        '--dest', 'org.freedesktop.Notifications',
        '--object-path', '/org/freedesktop/Notifications',
        '--method', 'org.freedesktop.Notifications.Notify',
        'WiFi', '0', 'network-wireless',
        'WiFi butuh login',
        `${ssid} · klik untuk membuka halaman login`,
        "['default', 'Buka login']", '{}', '15000',
    ]).catch(() => { });
};

const refreshProfiles = async () => {
    try {
        const out = await Utils.execAsync(['nmcli', '-t', '-f', 'NAME,TYPE', 'connection', 'show']);
        savedProfiles = new Set(out.split('\n')
            .map(splitTerse)
            .filter(cols => cols[1] === '802-11-wireless')
            .map(cols => cols[0]));
    } catch (_) {
        savedProfiles = new Set();
    }
};

export const isSaved = ssid => savedProfiles.has(ssid);

export const securityLabel = security => {
    const text = String(security || '').trim();
    if (!text) return 'Terbuka';
    if (/wpa3/i.test(text)) return 'WPA3';
    if (/wpa2/i.test(text)) return 'WPA2';
    if (/wpa/i.test(text)) return 'WPA';
    if (/wep/i.test(text)) return 'WEP';
    if (/802\.1x|eap/i.test(text)) return '802.1X';
    return text;
};

export const isEnterprise = security => /802\.1x|wpa-eap|eap/i.test(String(security || ''));

export async function scan(rescan = false) {
    if (wifi.value.scanning) return;
    update({ scanning: true });
    try {
        await refreshProfiles();
        if (rescan)
            await Utils.execAsync(['nmcli', 'device', 'wifi', 'rescan']).catch(() => { });
        const out = await Utils.execAsync(
            ['nmcli', '-t', '-f', 'IN-USE,SSID,SIGNAL,SECURITY', 'device', 'wifi', 'list']);

        // nmcli mencantumkan satu baris per BSSID; gabungkan per SSID dan
        // ambil sinyal terkuat supaya daftar tidak penuh duplikat.
        const bySsid = new Map();
        for (const line of out.split('\n')) {
            const [use, ssid, signal, security] = splitTerse(line);
            if (!ssid) continue;
            const entry = {
                ssid,
                signal: Number(signal) || 0,
                security: security || '',
                inUse: String(use || '').trim() === '*',
                saved: savedProfiles.has(ssid),
            };
            const prev = bySsid.get(ssid);
            if (!prev || entry.inUse || entry.signal > prev.signal)
                bySsid.set(ssid, entry);
        }

        const networks = [...bySsid.values()].sort((a, b) =>
            (Number(b.inUse) - Number(a.inUse))
            || (Number(b.saved) - Number(a.saved))
            || (b.signal - a.signal)
            || a.ssid.localeCompare(b.ssid));
        update({ networks, error: '' });
    } catch (error) {
        update({ error: textOf(error) || 'Gagal memindai jaringan.' });
    } finally {
        update({ scanning: false });
    }
}

export async function refreshConnection() {
    let enabled = wifi.value.enabled;
    let iface = wifi.value.iface;
    let connected = '';
    let ip = '';
    let connectivity = '';

    try {
        enabled = String(await Utils.execAsync(['nmcli', 'radio', 'wifi'])).trim() === 'enabled';
    } catch (_) { }

    if (enabled) {
        if (!iface) {
            try {
                const out = await Utils.execAsync(['nmcli', '-t', '-f', 'DEVICE,TYPE', 'device', 'status']);
                const row = out.split('\n').map(splitTerse).find(cols => cols[1] === 'wifi');
                iface = row?.[0] ?? '';
            } catch (_) { }
        }
        if (iface) {
            try {
                const out = await Utils.execAsync(
                    ['nmcli', '-t', '-f', 'GENERAL.STATE,GENERAL.CONNECTION,GENERAL.IP4-CONNECTIVITY',
                        'device', 'show', iface]);
                const fields = {};
                for (const line of out.split('\n')) {
                    const at = line.indexOf(':');
                    if (at > 0) fields[line.slice(0, at)] = line.slice(at + 1);
                }
                if (/\(connected\)/.test(fields['GENERAL.STATE'] ?? ''))
                    connected = fields['GENERAL.CONNECTION'] ?? '';
                const state = fields['GENERAL.IP4-CONNECTIVITY'] ?? '';
                connectivity = /portal/i.test(state) ? 'portal'
                    : /limited/i.test(state) ? 'limited'
                        : /full/i.test(state) ? 'full'
                            : /none/i.test(state) ? 'none' : '';
                if (connected) {
                    try {
                        const addrs = await Utils.execAsync(
                            ['nmcli', '-g', 'IP4.ADDRESS', 'device', 'show', iface]);
                        ip = addrs.split('\n')
                            .map(line => line.split('/')[0].trim())
                            .find(Boolean) ?? '';
                    } catch (_) { }
                }
            } catch (_) { }
        }
    }

    if (connected !== wifi.value.connected && wifi.value.portalOpened && connected !== wifi.value.portalOpened)
        update({ portalOpened: '' });

    if (connectivity !== 'portal') {
        portalNotified = '';
        if (wifi.value.portalUrl) update({ portalUrl: '' });
    } else if (connected && portalNotified !== connected) {
        // Sekali per sesi portal. detectPortal() mencoba meng-cache URL login
        // lebih awal supaya klik notifikasi tidak perlu menunggu curl.
        portalNotified = connected;
        notifyPortal(connected);
        detectPortal().catch(() => { });
        // Auto-open juga di sini: NM kadang baru melaporkan "portal" beberapa
        // detik setelah connect(), jadi cek sekali di connect() saja tidak cukup.
        if (AUTO_PORTAL() && wifi.value.portalOpened !== connected) {
            update({ portalOpened: connected });
            openPortal();
        }
    }

    update({ enabled, iface, connected, ip, connectivity });
}

const friendlyError = error => {
    const raw = textOf(error);
    const text = raw.toLowerCase();
    if (text.includes('secrets were required') || text.includes('no secrets'))
        return 'Password salah atau tidak diisi.';
    if (text.includes('not authorized'))
        return 'Tidak diizinkan mengubah koneksi.';
    if (text.includes('no network with ssid'))
        return 'Jaringan tidak ditemukan.';
    if (text.includes('timeout'))
        return 'Koneksi timeout. Coba lagi.';
    return raw.slice(0, 140) || 'Gagal menyambung.';
};

// Input password lewat rofi (window island keymode 'none'). Submap navigasi
// island dinonaktifkan sementara supaya Escape/panah di rofi tidak ditelan.
const askPassword = async ssid => {
    const island = globalThis.dynIsland;
    island?.suppressNav?.(true);
    try {
        const out = await Utils.execAsync(
            ['rofi', '-dmenu', '-password', '-l', '0', '-p', `Password ${ssid}`]);
        const value = String(out).replace(/\n+$/, '');
        return value.length ? value : null;
    } catch (_) {
        return null;
    } finally {
        island?.suppressNav?.(false);
    }
};

// Password dikirim lewat stdin (`nmcli --ask`) dari file 0600, bukan argumen
// perintah: /proc/<pid>/cmdline bisa dibaca user lain dan akan membocorkan
// password kalau ditaruh di argv.
const connectWithPassword = async (ssid, password) => {
    const file = GLib.build_filenamev([
        GLib.get_user_runtime_dir(),
        `dyn-island-wifi-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    ]);
    GLib.file_set_contents(file, `${password}\n`);
    try {
        await Utils.execAsync(['chmod', '600', file]);
        try {
            await Utils.execAsync(
                ['sh', '-c', 'nmcli --ask device wifi connect "$1" < "$2"', 'sh', ssid, file]);
        } catch (error) {
            // Sebagian versi nmcli menolak membaca secret non-TTY; jalur
            // cadangan memakai argumen (hanya jika stdin benar-benar gagal).
            if (!/secret/i.test(textOf(error))) throw error;
            await Utils.execAsync(['nmcli', 'device', 'wifi', 'connect', ssid, 'password', password]);
        }
    } finally {
        Utils.execAsync(['rm', '-f', file]).catch(() => { });
    }
};

export async function connect(ssid, passwordOverride = null) {
    if (wifi.value.busy) return;
    const network = wifi.value.networks.find(item => item.ssid === ssid);
    const security = network?.security ?? '';
    const saved = network?.saved ?? isSaved(ssid);

    if (isEnterprise(security)) {
        update({ error: `${ssid}: jaringan 802.1X butuh pengaturan identitas dulu.` });
        return;
    }

    let password = passwordOverride;
    if (password === null && !saved && security) {
        password = await askPassword(ssid);
        if (password === null) return;
    }

    update({ busy: ssid, error: '' });
    try {
        if (saved && password === null)
            await Utils.execAsync(['nmcli', 'connection', 'up', 'id', ssid]);
        else if (password)
            await connectWithPassword(ssid, password);
        else
            await Utils.execAsync(['nmcli', 'device', 'wifi', 'connect', ssid]);
    } catch (error) {
        update({ busy: '', error: friendlyError(error) });
        await refreshConnection();
        return;
    }

    update({ busy: '', error: '' });
    await refreshConnection();
    await scan(false);

    if (wifi.value.connectivity === 'portal' && AUTO_PORTAL()
        && wifi.value.portalOpened !== ssid) {
        update({ portalOpened: ssid });
        openPortal();
    }
}

export async function disconnect() {
    if (!wifi.value.iface) return;
    update({ error: '' });
    try {
        await Utils.execAsync(['nmcli', 'device', 'disconnect', wifi.value.iface]);
    } catch (error) {
        update({ error: friendlyError(error) });
    }
    update({ portalOpened: '', portalUrl: '' });
    portalNotified = '';
    await refreshConnection();
    await scan(false);
}

export async function toggleRadio() {
    const next = wifi.value.enabled ? 'off' : 'on';
    try {
        await Utils.execAsync(['nmcli', 'radio', 'wifi', next]);
    } catch (error) {
        update({ error: friendlyError(error) });
    }
    await refreshConnection();
    if (next === 'on') await scan(true);
}

// URL login portal: Location (absolut/relatif), meta refresh, atau anchor
// pertama di halaman captive. Semua URL relatif di-resolve terhadap URI
// connectivity-check, bukan dibuang (dulu URL relatif jatuh ke halaman cek).
const PORTAL_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const resolvePortalUrl = (base, raw) => {
    const value = String(raw ?? '').trim().replace(/^["']|["']$/g, '');
    if (!value) return base;
    try {
        return GLib.Uri.resolve_relative(base, value, GLib.UriFlags.NONE);
    } catch (_) {
        return /^https?:\/\//i.test(value) ? value : base;
    }
};

export async function detectPortal() {
    const uri = CHECK_URL();
    let target = uri;
    try {
        const response = await Utils.execAsync([
            'curl', '-sS', '--compressed', '-A', PORTAL_UA,
            '-D', '-', '-m', '6', uri,
        ]);
        const split = response.indexOf('\r\n\r\n');
        const headers = split >= 0 ? response.slice(0, split) : response;
        const body = split >= 0 ? response.slice(split + 4) : '';
        const location = /^location:\s*(.+)$/im.exec(headers);
        if (location) {
            target = resolvePortalUrl(uri, location[1]);
        } else {
            const metaTags = body.match(/<meta\b[^>]*>/gi) || [];
            for (const tag of metaTags) {
                if (!/http-equiv=["']?refresh/i.test(tag)) continue;
                const content = /content=["']([^"']*)["']/i.exec(tag);
                const url = content ? /url\s*=\s*([^"';\s>]+)/i.exec(content[1]) : null;
                if (url) {
                    target = resolvePortalUrl(uri, url[1]);
                    break;
                }
            }
            if (target === uri) {
                const anchor = /<a\b[^>]*\bhref=["']([^"']+)["']/i.exec(body);
                if (anchor) target = resolvePortalUrl(uri, anchor[1]);
            }
        }
    } catch (_) { }
    update({ portalUrl: target });
    return target;
}

export async function openPortal(url = null) {
    let target = url || wifi.value.portalUrl;
    if (!target || !/^https?:\/\//i.test(target)) target = await detectPortal();
    try {
        await Utils.execAsync(['xdg-open', target]);
        update({ error: '' });
    } catch (error) {
        update({ error: `Gagal membuka halaman login: ${textOf(error)}` });
    }
}

export function watchWifi() {
    refreshConnection();
    scan(true);
    let lastScan = Date.now();
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 5000, () => {
        refreshConnection();
        if (page.value === 'wifi' && Date.now() - lastScan >= SCAN_SECONDS() * 1000) {
            lastScan = Date.now();
            scan(true);
        }
        return GLib.SOURCE_CONTINUE;
    });
}
