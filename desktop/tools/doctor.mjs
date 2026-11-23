#!/usr/bin/env node
// Doctor: periksa apakah lingkungan siap menjalankan Dynamic Island Desktop.
//
//   node tools/doctor.mjs            # laporan manusia
//   node tools/doctor.mjs --json     # keluaran mesin (untuk issue/CI)
//
// Dijalankan TANPA Electron supaya bisa dipakai sebelum `pnpm install`
// selesai, dan di OS mana pun. Semua pemeriksaan bersifat read-only.

import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const JSON_OUT = process.argv.includes('--json');

const has = cmd => {
    try {
        const finder = process.platform === 'win32' ? 'where' : 'which';
        execFileSync(finder, [cmd], { stdio: 'ignore' });
        return true;
    } catch (_) {
        return false;
    }
};

const capture = (cmd, args = []) => {
    try {
        return execFileSync(cmd, args, { encoding: 'utf8', timeout: 5000 }).trim();
    } catch (_) {
        return '';
    }
};

const results = [];
const add = (name, ok, detail, level = 'wajib') => {
    results.push({ name, ok: !!ok, detail, level });
};

// ── runtime ─────────────────────────────────────────────────────────────
const nodeMajor = Number(process.versions.node.split('.')[0]);
add('Node.js >= 20', nodeMajor >= 20, `v${process.versions.node}`);

// Dibaca langsung dari package.json: modul ini ESM, jadi `require` tidak
// tersedia, dan meng-import "electron" dari Node biasa akan menjalankan
// shim-nya, bukan membaca versi.
const electronVersion = (() => {
    try {
        const file = path.join('node_modules', 'electron', 'package.json');
        return JSON.parse(fs.readFileSync(file, 'utf8')).version;
    } catch (_) {
        return '';
    }
})();
add('Electron terpasang', !!electronVersion,
    electronVersion || 'jalankan: pnpm install', 'wajib');

add('Biner Electron terunduh',
    fs.existsSync(path.join('node_modules', 'electron', 'dist')),
    fs.existsSync(path.join('node_modules', 'electron', 'dist')) ? 'ada' : 'jalankan: node node_modules/electron/install.js');

// ── platform ────────────────────────────────────────────────────────────
const isWayland = process.platform === 'linux'
    && (!!process.env.WAYLAND_DISPLAY || process.env.XDG_SESSION_TYPE === 'wayland');

add('Platform', true, `${process.platform} ${process.arch}`, 'info');

// ── Linux: perkakas integrasi ───────────────────────────────────────────
if (process.platform === 'linux') {
    add('Wayland terdeteksi', isWayland,
        isWayland ? 'ya (posisi jendela ditentukan compositor)' : 'tidak (X11)', 'info');

    add('dbus-monitor (notifikasi masuk)', has('dbus-monitor'),
        has('dbus-monitor') ? 'ada' : 'apt install dbus', 'opsional');
    add('notify-send (notifikasi keluar)', has('notify-send'),
        has('notify-send') ? 'ada' : 'apt install libnotify-bin', 'opsional');
    add('wpctl atau pamixer (volume)',
        has('wpctl') || has('pamixer'),
        has('wpctl') ? 'wpctl' : has('pamixer') ? 'pamixer' : 'apt install pipewire-bin / pulseaudio-utils',
        'opsional');
    add('brightnessctl (kecerahan)', has('brightnessctl'),
        has('brightnessctl') ? 'ada' : 'apt install brightnessctl', 'opsional');

    const sandbox = path.join('node_modules', 'electron', 'dist', 'chrome-sandbox');
    if (fs.existsSync(sandbox)) {
        const mode = fs.statSync(sandbox).mode & 0o777;
        const uidIsRoot = fs.statSync(sandbox).uid === 0;
        add('chrome-sandbox bisa dipakai', uidIsRoot && mode === 0o4755,
            uidIsRoot && mode === 0o4755
                ? 'root + 4755'
                : `mode ${mode.toString(8)}, uid ${fs.statSync(sandbox).uid} — jalankan dengan --no-sandbox bila AppArmor ketat`,
            'opsional');
    }
}

// ── Windows ─────────────────────────────────────────────────────────────
if (process.platform === 'win32') {
    add('PowerShell tersedia', has('powershell.exe'),
        has('powershell.exe') ? 'ada (baterai & notifikasi)' : 'tidak ada', 'opsional');
    add('WebView/Chromium GPU', true,
        'bila jendela tidak muncul, set DYNAMIC_ISLAND_NO_GPU=1', 'info');
}

// ── macOS ───────────────────────────────────────────────────────────────
if (process.platform === 'darwin') {
    add('pmset (baterai)', has('pmset'), has('pmset') ? 'ada' : 'tidak ada', 'opsional');
    add('osascript (volume & notifikasi)', has('osascript'),
        has('osascript') ? 'ada' : 'tidak ada', 'opsional');
    add('Gatekeeper', true,
        'dmg tanpa tanda tangan akan diblokir; buka lewat klik kanan > Open', 'info');
}

// ── struktur proyek ─────────────────────────────────────────────────────
const required = [
    'src/main/index.js',
    'src/preload/index.js',
    'src/renderer/index.html',
    'src/renderer/app.js',
    'src/renderer/lib/core.js',
];
const missing = required.filter(file => !fs.existsSync(file));
add('Berkas sumber lengkap', missing.length === 0,
    missing.length ? `hilang: ${missing.join(', ')}` : `${required.length} berkas`);

// ── logika inti (tanpa Electron) ────────────────────────────────────────
try {
    const core = await import('../src/renderer/lib/core.js');
    const times = core.computeTimes(new Date(2026, 10, 22), {
        latitude: -8.65, longitude: 115.2167, method: 'kemenag',
    });
    const ok = times.times[0]?.label === '04:25';
    add('Logika waktu sholat', ok,
        ok ? `Subuh ${times.times[0].label}` : `tak terduga: ${times.times[0]?.label}`);
} catch (error) {
    add('Logika waktu sholat', false, `gagal dimuat: ${error?.message ?? error}`);
}

// ── ringkasan ───────────────────────────────────────────────────────────
const wajibGagal = results.filter(item => item.level === 'wajib' && !item.ok);
const opsionalGagal = results.filter(item => item.level === 'opsional' && !item.ok);

if (JSON_OUT) {
    console.log(JSON.stringify({
        platform: process.platform,
        arch: process.arch,
        node: process.versions.node,
        wayland: isWayland,
        ok: wajibGagal.length === 0,
        results,
    }, null, 2));
} else {
    const icon = item => (item.level === 'info' ? '·' : item.ok ? 'ok' : item.level === 'wajib' ? 'X' : '!');
    const width = Math.max(...results.map(item => item.name.length));
    console.log(`Doctor — ${process.platform} ${process.arch}, Node v${process.versions.node}\n`);
    for (const item of results)
        console.log(`  ${icon(item)}  ${item.name.padEnd(width)}  ${item.detail}`);

    console.log();
    if (wajibGagal.length) {
        console.log(`${wajibGagal.length} pemeriksaan WAJIB gagal — aplikasi belum bisa dijalankan.`);
        process.exitCode = 1;
    } else if (opsionalGagal.length) {
        console.log(`Siap dijalankan. ${opsionalGagal.length} fitur opsional tidak tersedia.`);
    } else {
        console.log('Siap dijalankan. Semua pemeriksaan lolos.');
    }
}
