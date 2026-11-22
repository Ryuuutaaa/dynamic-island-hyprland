import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Variable from 'resource:///com/github/Aylur/ags/variable.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';
import CONFIG from '../config.js';
import {
    readSecret, writeSecret, removeSecret, maskSecret,
} from './secret-file.js';

// API key sengaja tidak ada di repo/config.js. Urutan pencarian:
//   1. GEMINI_API_KEY di environment
//   2. ~/.config/dynamic-iland/.env  (GEMINI_API_KEY=...)
//   3. ~/.config/dynamic-iland/gemini.json  ({"apiKey":"..."})
const CONFIG_DIR = `${GLib.get_user_config_dir()}/dynamic-iland`;
const ENV_FILE = `${CONFIG_DIR}/.env`;
const KEY_FILE = `${CONFIG_DIR}/gemini.json`;
const KEY_HELP = `Isi GEMINI_API_KEY di ${ENV_FILE.replace(GLib.get_home_dir(), '~')} `
    + `(chmod 600) atau {"apiKey":"..."} di ${KEY_FILE.replace(GLib.get_home_dir(), '~')} `
    + 'lalu coba lagi.';

// { status: idle|loading|ready|error, messages: [{role, text}], error, latencyMs }
export const chat = Variable({ status: 'idle', messages: [], error: '', latencyMs: 0 });

const MAX_HISTORY = Math.max(2, (Number(CONFIG.chat?.maxTurns) || 6) * 2);
let requestSerial = 0;

const set = patch => {
    chat.value = { ...chat.value, ...patch };
};

const readEnvFile = () => {
    try {
        const [ok, bytes] = GLib.file_get_contents(ENV_FILE);
        if (!ok) return '';
        const text = new TextDecoder().decode(bytes);
        for (const line of text.split('\n')) {
            const match = /^\s*(?:export\s+)?GEMINI_API_KEY\s*=\s*(.*)\s*$/.exec(line);
            if (!match) continue;
            let value = match[1].trim();
            if ((value.startsWith('"') && value.endsWith('"'))
                || (value.startsWith("'") && value.endsWith("'")))
                value = value.slice(1, -1);
            if (value) return value.trim();
        }
    } catch (_) { }
    return '';
};

const readJsonFile = () => {
    try {
        const [ok, bytes] = GLib.file_get_contents(KEY_FILE);
        if (!ok) return '';
        const raw = new TextDecoder().decode(bytes).trim();
        if (!raw) return '';
        if (raw.startsWith('{')) {
            try {
                return String(JSON.parse(raw)?.apiKey ?? '').trim();
            } catch (_) {
                return '';
            }
        }
        return raw;
    } catch (_) {
        return '';
    }
};

const keyInfo = () => {
    const env = String(GLib.getenv('GEMINI_API_KEY') ?? '').trim();
    if (env) return { key: env, file: '' };

    const dotenv = readEnvFile();
    if (dotenv) return { key: dotenv, file: ENV_FILE };

    const json = readJsonFile();
    if (json) return { key: json, file: KEY_FILE };

    return { key: '', file: '' };
};

const readKey = () => keyInfo().key;

// Hanya karakter yang aman untuk header curl config. API key format baru
// Google memakai titik (contoh: AQ.xxxx), jadi titik harus diizinkan.
const keyOk = key => /^[A-Za-z0-9_.-]+$/.test(key);

const checkKeyMode = () => {
    const { file } = keyInfo();
    if (!file) return;
    try {
        const info = Gio.File.new_for_path(file).query_info(
            'unix::mode', Gio.FileQueryInfoFlags.NONE, null);
        const mode = info.get_attribute_uint32('unix::mode') & 0o777;
        if (mode & 0o077)
            console.warn(`[dyn-island] chat: file key terlalu terbuka; jalankan chmod 600 ${file}`);
    } catch (_) { }
};

const writePrivate = (path, text) => {
    const file = Gio.File.new_for_path(path);
    const stream = file.replace(null, false, Gio.FileCreateFlags.PRIVATE, null);
    try {
        stream.write_all(new TextEncoder().encode(text), null);
    } finally {
        stream.close(null);
    }
};

const removeFile = path => {
    try {
        Gio.File.new_for_path(path).delete(null);
    } catch (_) { }
};

const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
// Model yang dipilih UI saat key diverifikasi. Disimpan di settings.json
// (bukan kredensial, jadi aman di file biasa) supaya pilihan model bertahan.
const MODEL_FILE = `${CONFIG_DIR}/settings.json`;

const configuredModel = () => {
    try {
        const [ok, bytes] = GLib.file_get_contents(MODEL_FILE);
        if (ok) {
            const saved = JSON.parse(new TextDecoder().decode(bytes));
            const model = String(saved?.chatModel ?? '').trim();
            if (/^[A-Za-z0-9._-]+$/.test(model)) return model;
        }
    } catch (_) { }
    return '';
};

const modelName = () => {
    const model = configuredModel() || String(CONFIG.chat?.model ?? DEFAULT_MODEL);
    return /^[A-Za-z0-9._-]+$/.test(model) ? model : DEFAULT_MODEL;
};

export const currentModel = () => modelName();

// ── pengelolaan API key dari UI ───────────────────────────────────────────
// Key disimpan di .env (0600), bukan di config.js/repo. Dibaca ulang tiap
// request, jadi perubahan dari UI langsung berlaku tanpa restart AGS.

export const keyStatus = () => {
    const info = keyInfo();
    return {
        has: !!info.key && keyOk(info.key),
        key: info.key,
        masked: maskSecret(info.key),
        source: info.file || (info.key ? 'environment' : ''),
    };
};

export function saveKey(key) {
    const value = String(key ?? '').trim();
    if (!keyOk(value)) return { ok: false, error: 'API key mengandung karakter tidak valid.' };
    try {
        // Pertahankan variabel lain di .env; hanya baris GEMINI_API_KEY yang
        // diganti supaya konfigurasi lain milik user tidak hilang.
        const existing = readSecret(ENV_FILE);
        const kept = existing
            ? existing.split('\n').filter(line => !/^\s*(?:export\s+)?GEMINI_API_KEY\s*=/.test(line))
            : [];
        const body = [...kept.filter(line => line.trim() !== ''),
            `GEMINI_API_KEY=${value}`].join('\n') + '\n';
        writeSecret(ENV_FILE, body);
        // File JSON fallback bisa menimpa key lama; buang agar tidak ambigu.
        if (GLib.file_test(KEY_FILE, GLib.FileTest.EXISTS)) removeSecret(KEY_FILE);
        return { ok: true };
    } catch (error) {
        return { ok: false, error: `Gagal menyimpan key: ${error?.message ?? error}` };
    }
}

// Model pilihan UI disimpan di settings.json. Ditulis lewat saveSettings()
// milik modul settings supaya kunci lain (glow, modul, dst.) tidak hilang.
export async function useModel(model) {
    const id = String(model ?? '').trim();
    if (!/^[A-Za-z0-9._-]+$/.test(id)) return { ok: false, error: 'Nama model tidak valid.' };
    try {
        const { saveSettings } = await import('./settings.js');
        saveSettings({ chatModel: id });
        return { ok: true, model: id };
    } catch (error) {
        return { ok: false, error: String(error?.message ?? error) };
    }
}

// Uji key lalu simpan + pilih model. Satu langkah untuk UI: user tidak perlu
// tahu urutan verifikasi -> rekomendasi -> siap.
export async function setupKey(key) {
    const tested = await testKey(key);
    if (!tested.ok) return { ok: false, error: tested.error };

    const saved = saveKey(key);
    if (!saved.ok) return { ok: false, error: saved.error };

    const model = recommendModel(tested.models) ?? DEFAULT_MODEL;
    await useModel(model);
    return { ok: true, model, count: tested.models.length };
}

export function clearKey() {
    try {
        const existing = readSecret(ENV_FILE);
        if (existing) {
            const kept = existing.split('\n')
                .filter(line => !/^\s*(?:export\s+)?GEMINI_API_KEY\s*=/.test(line));
            const body = kept.filter(line => line.trim() !== '').join('\n');
            if (body) writeSecret(ENV_FILE, body + '\n');
            else removeSecret(ENV_FILE);
        }
        if (GLib.file_test(KEY_FILE, GLib.FileTest.EXISTS)) removeSecret(KEY_FILE);
        return { ok: true };
    } catch (error) {
        return { ok: false, error: `Gagal menghapus key: ${error?.message ?? error}` };
    }
}

// Uji key ke endpoint daftar model. 200 = key valid, dan responsnya sekaligus
// dipakai untuk memilih model yang tersedia di akun tersebut.
export async function testKey(key) {
    const value = String(key ?? '').trim();
    if (!keyOk(value)) return { ok: false, error: 'Format API key tidak valid.' };

    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const cfgPath = `${GLib.get_tmp_dir()}/dyn-island-key-${stamp}.cfg`;
    try {
        writePrivate(cfgPath, [
            `url = "${String(CONFIG.chat?.endpoint ?? 'https://generativelanguage.googleapis.com/v1beta/models')}?pageSize=200"`,
            `header = "x-goog-api-key: ${value}"`,
        ].join('\n') + '\n');
        const raw = await Utils.execAsync([
            'curl', '-sS', '--connect-timeout', '6', '--max-time', '20', '--config', cfgPath,
        ]);
        let data;
        try {
            data = JSON.parse(raw);
        } catch (_) {
            return { ok: false, error: 'Respons bukan JSON. Periksa koneksi.' };
        }
        if (data?.error)
            return { ok: false, error: data.error.message || 'API key ditolak Google.' };
        const models = Array.isArray(data?.models) ? data.models : [];
        if (!models.length) return { ok: false, error: 'Tidak ada model yang bisa dipakai key ini.' };
        return { ok: true, models };
    } catch (error) {
        return { ok: false, error: String(error?.message ?? error).replace(/\s+/g, ' ').trim() };
    } finally {
        removeFile(cfgPath);
    }
}

// Model yang tidak relevan untuk chat teks di notch.
const SKIP_MODEL = /(image|imagen|veo|tts|audio|live|native-audio|embedding|embed|robotics|computer-use|deep-research|transcribe|omni|lyria|gemma)/i;

// Di notch, kecepatan lebih penting daripada kecerdasan maksimum. Urutan
// prioritas: (1) varian teringan, (2) generasi terbaru, (3) stabil > preview.
// Tanpa pembobotan ini, model flagship reasoning (mis. gemini-4-argon) menang
// dan chat terasa lambat sekali untuk jawaban pendek.
const TIER = [
    [/flash-lite/, 300],
    [/flash/, 200],
    [/pro/, 100],
    [/argon/, 60],
];

const scoreModel = name => {
    const n = String(name).toLowerCase();
    if (SKIP_MODEL.test(n)) return -Infinity;

    let score = 0;
    for (const [pattern, weight] of TIER) {
        if (pattern.test(n)) { score += weight; break; }
    }
    // Peringkat generasi hanya pembeda di dalam tier yang sama.
    const version = /gemini-(\d+)(?:[.-](\d+))?/.exec(n);
    if (version) score += Math.min(90, Number(version[1]) * 10 + Number(version[2] ?? 0));

    if (/preview|experimental|-exp\b/.test(n)) score -= 25;
    if (/-latest\b/.test(n)) score += 15;  // alias resmi selalu terbaru
    if (/customtools/.test(n)) score -= 10;
    return score;
};

// Pilih model paling direkomendasikan dari daftar models.list.
export function recommendModel(models) {
    const usable = (models ?? []).filter(model => {
        const methods = model?.supportedGenerationMethods ?? [];
        return methods.includes('generateContent')
            && !SKIP_MODEL.test(String(model?.name ?? ''));
    });
    if (!usable.length) return null;
    const ranked = usable
        .map(model => {
            const id = String(model.name).replace(/^models\//, '');
            return { id, score: scoreModel(id) };
        })
        .filter(item => Number.isFinite(item.score))
        .sort((a, b) => b.score - a.score);
    return ranked[0]?.id ?? null;
}

const endpoint = () => {
    const base = String(CONFIG.chat?.endpoint
        ?? 'https://generativelanguage.googleapis.com/v1beta/models').replace(/\/+$/, '');
    return `${base}/${modelName()}:generateContent`;
};

// Label GTK tidak merender markdown; buang penanda yang paling mengganggu.
const stripMarkdown = text => String(text ?? '')
    .replace(/\r/g, '')
    .replace(/```[\s\S]*?```/g, block => block.replace(/```[a-zA-Z0-9_-]*/g, '').trim())
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .trim();

const parseReply = data => {
    const block = data?.promptFeedback?.blockReason;
    if (block) return { error: `Diblokir filter Gemini (${block}).` };

    const candidate = data?.candidates?.[0];
    if (!candidate) return { error: data?.error?.message || 'Gemini tidak mengembalikan jawaban.' };
    if (candidate.finishReason && !['STOP', 'MAX_TOKENS'].includes(candidate.finishReason))
        return { error: `Jawaban dihentikan: ${candidate.finishReason}.` };

    const text = (candidate.content?.parts ?? [])
        .map(part => part?.text ?? '')
        .join('')
        .trim();
    return text ? { text: stripMarkdown(text) } : { error: 'Jawaban Gemini kosong.' };
};

const request = async () => {
    const started = GLib.get_monotonic_time() / 1000;
    const key = readKey();
    if (!key) {
        set({ status: 'error', error: `API key belum di-set. ${KEY_HELP}`, latencyMs: 0 });
        return;
    }
    if (!keyOk(key)) {
        set({ status: 'error', error: 'API key mengandung karakter tidak valid. Cek file gemini.json.', latencyMs: 0 });
        return;
    }
    checkKeyMode();

    const my = ++requestSerial;
    const history = chat.value.messages.slice(-MAX_HISTORY);
    const body = {
        contents: history.map(m => ({
            role: m.role === 'model' ? 'model' : 'user',
            parts: [{ text: m.text }],
        })),
    };
    if (CONFIG.chat?.systemPrompt)
        body.systemInstruction = { parts: [{ text: String(CONFIG.chat.systemPrompt) }] };
    if (Number(CONFIG.chat?.maxOutputTokens) > 0)
        body.generationConfig = { maxOutputTokens: Number(CONFIG.chat.maxOutputTokens) };
    if (CONFIG.chat?.thinkingLevel) {
        body.generationConfig = {
            ...(body.generationConfig ?? {}),
            thinkingConfig: { thinkingLevel: String(CONFIG.chat.thinkingLevel) },
        };
    }

    set({ status: 'loading', error: '', latencyMs: 0 });

    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const bodyPath = `${GLib.get_tmp_dir()}/dyn-island-chat-${stamp}.json`;
    const cfgPath = `${GLib.get_tmp_dir()}/dyn-island-chat-${stamp}.cfg`;
    try {
        writePrivate(bodyPath, JSON.stringify(body));
        // Key ditaruh di curl --config (file 0600), bukan argv — supaya tidak
        // terlihat di `ps`/`/proc/<pid>/cmdline`.
        writePrivate(cfgPath, [
            `url = "${endpoint()}"`,
            'header = "Content-Type: application/json"',
            `header = "x-goog-api-key: ${key}"`,
        ].join('\n') + '\n');

        const raw = await Utils.execAsync([
            'curl', '-sS',
            '--connect-timeout', '5',
            '--max-time', String(Math.max(10, Number(CONFIG.chat?.timeoutSec) || 40)),
            '--config', cfgPath,
            '--data-binary', `@${bodyPath}`,
        ]);
        if (my !== requestSerial) return;

        let data;
        try {
            data = JSON.parse(raw);
        } catch (_) {
            throw new Error('Respons Gemini bukan JSON.');
        }
        if (data?.error) throw new Error(data.error.message || 'Gemini API error');

        const reply = parseReply(data);
        if (reply.error) throw new Error(reply.error);
        if (my !== requestSerial) return;

        const messages = [...chat.value.messages,
            { role: 'model', text: reply.text, at: Date.now() }]
            .slice(-MAX_HISTORY);
        const latencyMs = Math.round(GLib.get_monotonic_time() / 1000 - started);
        set({ status: 'ready', messages, error: '', latencyMs });
    } catch (error) {
        if (my !== requestSerial) return;
        const message = String(error?.message ?? error).replace(/\s+/g, ' ').trim();
        const latencyMs = Math.round(GLib.get_monotonic_time() / 1000 - started);
        set({ status: 'error', error: message || 'Gagal menghubungi Gemini.', latencyMs });
    } finally {
        removeFile(bodyPath);
        removeFile(cfgPath);
    }
};

export function send(text) {
    const value = String(text ?? '').trim();
    if (!value || chat.value.status === 'loading') return false;
    chat.value = {
        ...chat.value,
        status: 'idle',
        error: '',
        latencyMs: 0,
        messages: [...chat.value.messages,
            { role: 'user', text: value, at: Date.now() }].slice(-MAX_HISTORY),
    };
    request();
    return true;
}

export function retry() {
    if (chat.value.status === 'loading') return;
    if (!chat.value.messages.some(m => m.role === 'user')) return;
    request();
}

export function clearChat() {
    // Batalkan respons yang masih terbang.
    requestSerial += 1;
    chat.value = { status: 'idle', messages: [], error: '', latencyMs: 0 };
}

// Buka rofi untuk mengetik pertanyaan. Window island `keymode: 'none'`,
// jadi input keyboard lewat rofi; submap `island` dinonaktifkan sementara
// supaya Escape/panah di rofi tidak ditelan submap.
export async function ask() {
    const key = readKey();
    if (!key || !keyOk(key)) {
        set({
            status: 'error',
            error: key ? 'API key tidak valid.' : `API key belum di-set. ${KEY_HELP}`,
        });
        return false;
    }
    if (chat.value.status === 'loading') return false;

    const island = globalThis.dynIsland;
    if (island?.suppressNav) {
        try {
            await island.suppressNav(true);
        } catch (_) { }
    }

    let text = '';
    try {
        text = String(await Utils.execAsync([
            'rofi', '-dmenu', '-p', 'Tanya Gemini', '-l', '0', '-i',
        ])).trim();
    } catch (error) {
        const message = String(error);
        if (/not found|No such file|Failed to execute/i.test(message))
            set({ status: 'error', error: 'rofi tidak ditemukan. Pasang rofi untuk input chat.' });
    } finally {
        island?.suppressNav?.(false);
    }

    if (!text) return false;
    return send(text);
}

export const hasKey = () => {
    const key = readKey();
    return !!key && keyOk(key);
};
export const keyPath = () => KEY_FILE;
export const keyHelp = () => KEY_HELP;
export default chat;
