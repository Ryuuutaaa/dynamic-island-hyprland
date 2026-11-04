import GLib from 'gi://GLib';
import Variable from 'resource:///com/github/Aylur/ags/variable.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';
import { page } from '../state.js';

// Statistik sistem dari `hypr-status stats` (Rust, satu proses + satu JSON).
// Polling 2 detik HANYA saat halaman stats terlihat — sesuai prinsip "tidak ada
// request/polling diam-diam". Di luar itu tidak ada proses yang berjalan.

export const stats = Variable(null);

let timer = 0;
let busy = false;

const fetchStats = async () => {
    if (busy) return;
    busy = true;
    try {
        const raw = await Utils.execAsync(['hypr-status', 'stats']);
        stats.value = JSON.parse(raw);
    } catch (error) {
        console.log(`[dyn-island] stats gagal: ${error}`);
    } finally {
        busy = false;
    }
};

export function watchStats() {
    const sync = () => {
        const visible = page.value === 'stats';
        if (visible && !timer) {
            fetchStats();
            timer = Utils.interval(2000, fetchStats);
        } else if (!visible && timer) {
            GLib.source_remove(timer);
            timer = 0;
        }
    };

    page.connect('changed', sync);
    sync();
}
