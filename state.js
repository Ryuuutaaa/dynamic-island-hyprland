import GLib from 'gi://GLib';
import Variable from 'resource:///com/github/Aylur/ags/variable.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';
import Mpris from 'resource:///com/github/Aylur/ags/service/mpris.js';
import CONFIG from './config.js';

// Urutan halaman untuk navigasi manual (page dots + panah).
// Hanya halaman "nyata": volume/brightness/notify adalah transient (muncul
// sendiri saat OSD/notifikasi) dan dulu ikut bisa di-pin lewat panah.
export const PAGE_ORDER = ['idle', 'media', 'pomodoro', 'water', 'todo', 'shelf'];

export const page = Variable('idle');

// Sub-tampilan kartu media: 'main' | 'lyrics'.
// Lirik BUKAN halaman nav tersendiri: tidak punya dot, tidak ikut PAGE_ORDER.
// Ia dibuka dari tombol lirik di kartu media dan tetap dihitung sebagai
// "media" untuk dot, geometri, dan arus navigasi.
export const mediaView = Variable('main');

export const inLyricsView = () =>
    page.value === 'media' && mediaView.value === 'lyrics';

// true saat pointer berada di atas notch -> notch membesar (gaya Nusa)
export const hovered = Variable(false);

let transientTimer = 0;
let transientActive = false;
let pinned = null;
let pinTimer = 0;

export const isTransientActive = () => transientActive;

export const isPlaying = () =>
    Mpris.players.some(player => player.play_back_status === 'Playing');

// Player yang masih ada (Playing ATAU Paused) tetap menahan halaman media jadi
// base: kalau tidak, menekan pause menghapus kartunya sendiri dan tombol play
// ikut hilang.
const hasActivePlayer = () =>
    Mpris.players.some(player => player.play_back_status !== 'Stopped');

export const basePage = () => (hasActivePlayer() ? 'media' : 'idle');

// Halaman tujuan saat tidak ada transient: pin manual menang.
const restingPage = () => pinned ?? basePage();

export const isPinned = () => pinned !== null;

// Halaman "istirahat" bukan media -> tutup sub-tampilan lirik supaya tidak
// terbawa ke kunjungan media berikutnya.
const rest = () => {
    const next = restingPage();
    if (next !== 'media') mediaView.value = 'main';
    page.value = next;
};

export function refreshBase() {
    if (transientActive || pinned) return;
    rest();
}

export function showTransient(name, ms) {
    transientActive = true;
    page.value = name;
    if (transientTimer) GLib.source_remove(transientTimer);
    transientTimer = Utils.timeout(ms, () => {
        transientTimer = 0;
        transientActive = false;
        page.value = restingPage();
    });
}

// Pilih halaman manual (dari panah navigasi). Bertahan CONFIG.pinTimeout,
// lalu kembali ke base supaya notifikasi/OSD tidak tertahan selamanya.
export function pinPage(name, { sticky = false } = {}) {
    if (!PAGE_ORDER.includes(name)) return;
    pinned = name;
    transientActive = false;
    if (transientTimer) {
        GLib.source_remove(transientTimer);
        transientTimer = 0;
    }
    if (pinTimer) {
        GLib.source_remove(pinTimer);
        pinTimer = 0;
    }
    // sticky: bertahan sampai user pindah halaman (dipakai halaman lirik)
    if (!sticky) {
        pinTimer = Utils.timeout(CONFIG.pinTimeout, () => {
            pinTimer = 0;
            pinned = null;
            rest();
        });
    }
    page.value = name;
}

export function stepPage(delta) {
    // Dari tampilan lirik, panah kiri = kembali ke kartu musik (bukan ke
    // halaman sebelumnya): lirik adalah sub-bagian dari media, bukan halaman.
    if (delta < 0 && inLyricsView()) {
        mediaView.value = 'main';
        return;
    }
    const index = PAGE_ORDER.indexOf(page.value);
    const next = PAGE_ORDER[(index + delta + PAGE_ORDER.length) % PAGE_ORDER.length];
    // sub-tampilan tidak ikut terbawa saat pindah halaman
    if (next !== 'media') mediaView.value = 'main';
    pinPage(next);
}

export function watchMpris() {
    Mpris.connect('player-changed', refreshBase);
    Mpris.connect('player-closed', refreshBase);
    Mpris.connect('changed', refreshBase);
    Utils.timeout(1200, refreshBase);
}
