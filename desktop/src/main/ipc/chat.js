const fs = require('node:fs');
const path = require('node:path');
const { app, ipcMain, safeStorage } = require('electron');

// Gemini untuk versi Electron.
//
// Kredensial TIDAK ikut settings.json. Dua lapis:
//   1. safeStorage (Keychain macOS / DPAPI Windows / libsecret Linux) bila ada
//   2. fallback file JSON mode 0600 (Linux/macOS) atau ACL user (Windows)
//
// Model dipilih oleh fungsi yang sama dengan versi AGS (core.js), jadi
// perilakunya identik di semua platform.

const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

const credDir = () => path.join(app.getPath('userData'), 'credentials');
const credFile = () => path.join(credDir(), 'gemini.json');

const readCred = () => {
    try {
        const raw = JSON.parse(fs.readFileSync(credFile(), 'utf8'));
        if (raw?.encrypted && safeStorage.isEncryptionAvailable()) {
            return safeStorage.decryptString(Buffer.from(raw.encrypted, 'base64'));
        }
        return String(raw?.apiKey ?? '');
    } catch (_) {
        return '';
    }
};

const writeCred = apiKey => {
    fs.mkdirSync(credDir(), { recursive: true });
    let payload;
    if (safeStorage.isEncryptionAvailable()) {
        payload = { encrypted: safeStorage.encryptString(apiKey).toString('base64') };
    } else {
        payload = { apiKey };
    }
    // mode 0600: hanya pemilik yang bisa membaca.
    fs.writeFileSync(credFile(), JSON.stringify(payload), { mode: 0o600 });
    try { fs.chmodSync(credFile(), 0o600); } catch (_) { }
};

const clearCred = () => {
    try { fs.unlinkSync(credFile()); } catch (_) { }
};

const keyOk = key => /^[A-Za-z0-9_.-]+$/.test(String(key ?? '').trim());

const mask = (value, head = 6, tail = 4) => {
    const text = String(value ?? '');
    if (!text) return '';
    if (text.length <= head + tail + 1) return `${text.slice(0, 2)}${'•'.repeat(6)}`;
    return `${text.slice(0, head)}${'•'.repeat(8)}${text.slice(-tail)}`;
};

const fetchJson = async (url, { apiKey, body } = {}) => {
    const response = await fetch(url, {
        method: body ? 'POST' : 'GET',
        headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': String(apiKey ?? ''),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(30_000),
    });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch (_) { throw new Error('Respons bukan JSON.'); }
    if (!response.ok || data?.error)
        throw new Error(data?.error?.message ?? `HTTP ${response.status}`);
    return data;
};

const testKey = async apiKey => {
    const key = String(apiKey ?? '').trim();
    if (!keyOk(key)) return { ok: false, error: 'Format API key tidak valid.' };
    try {
        const data = await fetchJson(`${ENDPOINT}?pageSize=200`, { apiKey: key });
        const models = Array.isArray(data?.models) ? data.models : [];
        if (!models.length) return { ok: false, error: 'Tidak ada model yang bisa dipakai key ini.' };
        return { ok: true, models };
    } catch (error) {
        return { ok: false, error: String(error?.message ?? error) };
    }
};

module.exports = ipcMain => {
    ipcMain.handle('chat:key-status', () => {
        const key = readCred();
        const has = !!key && keyOk(key);
        return {
            has,
            masked: mask(key),
            source: has ? credFile() : '',
            secureStorage: safeStorage.isEncryptionAvailable(),
        };
    });

    ipcMain.handle('chat:save-key', async (_e, apiKey) => {
        const tested = await testKey(apiKey);
        if (!tested.ok) return { ok: false, error: tested.error };
        try {
            writeCred(String(apiKey).trim());
            return { ok: true, models: tested.models };
        } catch (error) {
            return { ok: false, error: `Gagal menyimpan: ${error?.message ?? error}` };
        }
    });

    ipcMain.handle('chat:clear-key', () => {
        clearCred();
        return { ok: true };
    });

    ipcMain.handle('chat:test-key', async (_e, apiKey) => {
        const key = apiKey ? String(apiKey) : readCred();
        if (!key) return { ok: false, error: 'Belum ada API key.' };
        return testKey(key);
    });

    ipcMain.handle('chat:send', async (_e, { messages, model } = {}) => {
        const apiKey = readCred();
        if (!apiKey) return { ok: false, error: 'API key belum di-set.' };
        const started = Date.now();
        try {
            const data = await fetchJson(`${ENDPOINT}/${model ?? DEFAULT_MODEL}:generateContent`, {
                apiKey,
                body: {
                    contents: (messages ?? []).map(message => ({
                        role: message.role === 'model' ? 'model' : 'user',
                        parts: [{ text: String(message.text ?? '') }],
                    })),
                    generationConfig: { maxOutputTokens: 300 },
                },
            });
            const text = (data?.candidates?.[0]?.content?.parts ?? [])
                .map(part => part?.text ?? '')
                .join('')
                .trim();
            if (!text) return { ok: false, error: 'Jawaban Gemini kosong.' };
            return { ok: true, text, latencyMs: Date.now() - started };
        } catch (error) {
            return { ok: false, error: String(error?.message ?? error), latencyMs: Date.now() - started };
        }
    });

    ipcMain.handle('chat:credentials-path', () => credFile());
};
