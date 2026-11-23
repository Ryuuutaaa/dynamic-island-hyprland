#!/usr/bin/env node
// Salin shared/ (root repo) ke desktop/src/shared/.
//
// Kenapa disalin, bukan di-import langsung dari luar desktop/:
//   - electron-builder memaket berkas dari dalam folder app; berkas di luar
//     `desktop/` tidak ikut ke app.asar kecuali lewat extraResources, dan itu
//     membuat jalur import berbeda antara mode dev dan mode paket.
//   - Dengan menyalin ke src/shared/, import statis `../shared/x.js` bekerja
//     identik di kedua mode.
//
// Sumber kebenaran tetap `shared/` di root. Folder salinan diberi penanda
// .gitignore agar tidak di-commit dan tidak pernah diedit langsung.

import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const src = path.resolve(here, '..', '..', 'shared');
const dest = path.resolve(here, '..', 'src', 'shared');

if (!fs.existsSync(src)) {
    console.error(`x  folder sumber tidak ditemukan: ${src}`);
    process.exit(1);
}

fs.mkdirSync(dest, { recursive: true });

const copied = [];
for (const name of fs.readdirSync(src)) {
    if (!name.endsWith('.js')) continue;
    fs.copyFileSync(path.join(src, name), path.join(dest, name));
    copied.push(name);
}

// Penanda: siapa pun yang membuka folder ini tahu isinya hasil salinan.
fs.writeFileSync(
    path.join(dest, 'README.md'),
    '# Salinan otomatis\n\n'
    + 'Folder ini dihasilkan oleh `desktop/tools/sync-shared.mjs` dari `shared/`\n'
    + 'di root repo. **Jangan diedit di sini** — ubah `shared/` lalu jalankan\n'
    + '`pnpm sync` (otomatis sebelum start/check/verify/dist).\n'
    + 'Folder ini diabaikan git.\n',
);

console.log(`ok  shared -> src/shared (${copied.length} berkas: ${copied.join(', ')})`);
