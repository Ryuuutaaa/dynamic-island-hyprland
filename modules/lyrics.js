import Variable from 'resource:///com/github/Aylur/ags/variable.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';
import Mpris from 'resource:///com/github/Aylur/ags/service/mpris.js';

const API = 'https://lrclib.net/api/get';
const USER_AGENT = 'dynamic-iland-ags/1.0 (https://rama2555.github.io/nusa/)';
const CACHE_LIMIT = 40;

// { key, status: idle|loading|synced|plain|instrumental|none|error, lines: [{time,text}], title }
export const lyrics = Variable({ key: '', status: 'idle', lines: [], title: '', source: 'LRCLIB' });

const cache = new Map();
let loading = '';

const activePlayer = () =>
    Mpris.players.find(player => player.play_back_status === 'Playing')
    || Mpris.players[0]
    || null;

// [mm:ss.xx] teks  (bisa juga [mm:ss] atau [mm:ss.xxx])
const LRC_LINE = /^\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]\s?(.*)$/;

function parseLrc(text) {
    const lines = [];
    for (const raw of text.split('\n')) {
        const match = raw.match(LRC_LINE);
        if (!match) continue;
        const minutes = Number(match[1]);
        const seconds = Number(match[2]);
        const fraction = match[3] ? Number(match[3].padEnd(3, '0')) / 1000 : 0;
        const content = match[4].trim();
        if (!content) continue;
        lines.push({ time: minutes * 60 + seconds + fraction, text: content });
    }
    lines.sort((a, b) => a.time - b.time);
    return lines;
}

function parsePlain(text) {
    return text
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map(text => ({ time: -1, text }));
}

// AGS memakai "Unknown artist"/"Unknown title" kalau metadata kosong, dan
// MPRIS kadang melaporkan suara notifikasi (log: "(43) WhatsApp") sebagai lagu.
// Tanpa filter ini LRCLIB ditembak untuk yang bukan musik (404/400 sia-sia).
const isJunk = (artist, title) =>
    !artist.trim() || !title.trim() || artist === 'Unknown artist' || title === 'Unknown title';

// null kalau sumbernya bukan musik yang layak dicari liriknya.
const trackInfo = player => {
    const artist = (player?.track_artists || [])[0] || '';
    const title = player?.track_title || '';
    if (isJunk(artist, title)) return null;
    return { artist, title, key: `${artist} - ${title}` };
};

const publish = (key, value) => {
    cache.set(key, value);
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
    lyrics.value = value;
};

async function load(player) {
    const info = trackInfo(player);
    if (!info) return;
    const { key, artist, title } = info;

    if (cache.has(key)) {
        lyrics.value = cache.get(key);
        return;
    }
    if (loading === key) return;
    loading = key;

    lyrics.value = { key, status: 'loading', lines: [], title, source: 'LRCLIB' };

    try {
        // Catatan: Utils.fetch (libsoup3) mengembalikan HTTP 400 untuk SEMUA
        // request di mesin ini (termasuk example.com), jadi pakai curl.
        // Diuji: URL + User-Agent yang sama lewat curl -> 200.
        const url = `${API}?artist_name=${encodeURIComponent(artist)}`
            + `&track_name=${encodeURIComponent(title)}`;
        const raw = await Utils.execAsync([
            'curl', '-fsS', '--connect-timeout', '5', '--max-time', '15', '-A', USER_AGENT, url,
        ]);
        const data = JSON.parse(raw);

        let value;
        if (data.instrumental) {
            value = { key, status: 'instrumental', lines: [], title, source: 'LRCLIB' };
        } else {
            const synced = data.syncedLyrics ? parseLrc(data.syncedLyrics) : [];
            value = synced.length
                ? { key, status: 'synced', lines: synced, title, source: 'LRCLIB' }
                : data.plainLyrics
                    ? { key, status: 'plain', lines: parsePlain(data.plainLyrics), title, source: 'LRCLIB' }
                    : { key, status: 'none', lines: [], title, source: 'LRCLIB' };
        }
        publish(key, value);
        console.log(`[dyn-island] lyrics ${key}: ${value.status} (${value.lines.length} baris)`);
    } catch (error) {
        // 404 = lagu tidak ada di LRCLIB -> jawaban pasti, aman di-cache.
        // Error jaringan (DNS/timeout) TIDAK di-cache: dulu ini bikin lagu
        // "mati" sampai AGS restart, padahal cuma gagal sesaat.
        const notFound = String(error).includes('404');
        const value = { key, status: notFound ? 'none' : 'error', lines: [], title, source: 'LRCLIB' };
        if (notFound) publish(key, value);
        else lyrics.value = value;
        if (!notFound) console.log(`[dyn-island] lyrics gagal ${key}: ${error}`);
    } finally {
        loading = '';
    }
}

// Tombol "coba lagi" di halaman lirik: buang cache lagu ini lalu ambil ulang.
export function retryLyrics() {
    const player = activePlayer();
    if (!player) return;
    const info = trackInfo(player);
    if (!info) return;
    cache.delete(info.key);
    lyrics.value = { key: '', status: 'idle', lines: [], title: '', source: 'LRCLIB' };
    load(player);
}

export function watchLyrics() {
    const sync = () => {
        const player = activePlayer();
        if (!player) return;
        const info = trackInfo(player);
        if (!info) return;
        if (lyrics.value.key === info.key) return;
        load(player);
    };
    Mpris.connect('changed', sync);
    Mpris.connect('player-changed', sync);
    Utils.timeout(1500, sync);
}

export default lyrics;
