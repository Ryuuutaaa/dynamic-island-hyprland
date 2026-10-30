import Gdk from 'gi://Gdk?version=3.0';
import Hyprland from 'resource:///com/github/Aylur/ags/service/hyprland.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';

// AGS `Window.monitor` adalah INDEX GdkMonitor, sedangkan Hyprland memberi
// `id` monitor. Keduanya bukan namespace yang sama: setelah monitor dicabut /
// ditambah saat resume, urutan index GDK bisa bergeser dari id Hyprland.
// Kalau id dipakai langsung, window bisa dipasang ke monitor yang tidak ada
// (AGS: "Could not find monitor with id") atau ke monitor yang salah.
//
// Pencocokan dilakukan lewat geometri (x/y/lebar), dengan satu monitor sebagai
// jalan pintas supaya tidak perlu memanggil hyprctl sama sekali di mayoritas
// sesi. `refresh()` menormalkan lebar/tinggi Hyprland (fisik) ke koordinat
// logis dengan membaginya `scale`; x/y Hyprland memang sudah logis.

let rects = [];
let inflight = null;

export function refresh() {
    if (inflight)
        return inflight;

    inflight = Utils.execAsync(['hyprctl', '-j', 'monitors'])
        .then(raw => {
            rects = JSON.parse(raw).map(m => {
                // Hyprland: x/y sudah LOGIS (layout), tetapi width/height
                // masih FISIK. GDK memakai koordinat logis, dan
                // `hyprctl cursorpos` juga logis — jadi normalisasi di sini.
                // Tanpa ini, pada scale 0.8333 lebar 1920 vs 2304 membuat
                // hit-test bergeser ~191px dan gdkIndex tidak pernah cocok.
                const scale = Number(m.scale) || 1;
                return {
                    name: m.name,
                    id: m.id,
                    x: m.x,
                    y: m.y,
                    w: m.width / scale,
                    h: m.height / scale,
                    scale,
                    focused: !!m.focused,
                };
            });
            return rects;
        })
        .catch(() => rects)
        .finally(() => { inflight = null; });

    return inflight;
}

export const focusedRect = () => rects.find(m => m.focused) ?? null;

export function gdkIndex(rect) {
    const display = Gdk.Display.get_default();
    if (!display) return -1;

    const count = display.get_n_monitors();
    if (count <= 0) return -1;
    if (count === 1) return 0;
    if (!rect) return -1;

    const match = (x, y, width) => {
        for (let i = 0; i < count; i++) {
            const geo = display.get_monitor(i).get_geometry();
            if (geo.width === width
                && Math.abs(geo.x - x) <= 2
                && Math.abs(geo.y - y) <= 2)
                return i;
        }
        return -1;
    };

    const index = match(rect.x, rect.y, rect.w);
    if (index >= 0) return index;

    // Cadangan untuk GDK yang melaporkan ukuran fisik (mis. GDK_SCALE > 1):
    // kalikan koordinat logis dengan scale. Jangan membagi x/y — x/y dari
    // Hyprland sudah logis, dan membaginya adalah bug lama.
    if (rect.scale === 1) return -1;
    return match(
        Math.round(rect.x * rect.scale),
        Math.round(rect.y * rect.scale),
        Math.round(rect.w * rect.scale),
    );
}

// Pasang window ke monitor yang sedang fokus. `onChange` dipanggil hanya saat
// monitor benar-benar berubah (dipakai island untuk melepas state hover).
export async function applyFocused(win, onChange) {
    if (!win || win.is_destroyed) return false;

    await refresh();
    const index = gdkIndex(focusedRect());
    if (index < 0) return false;

    const target = Gdk.Display.get_default()?.get_monitor(index) ?? null;
    if (!target) return false;

    // Bandingkan OBJEK GdkMonitor, bukan hanya index: setelah monitor dicabut
    // lalu dipasang lagi, GDK membuat objek monitor baru pada index yang sama.
    // Kalau hanya index yang dicek, layer surface tetap menempel ke output lama
    // yang sudah hilang dan compositor mengirim `closed` lagi.
    if (win.gdkmonitor === target) return false;

    win.monitor = index;
    if (onChange) {
        try {
            onChange();
        } catch (_) { }
    }
    return true;
}

// Ikuti monitor fokus selama umur window. Signal di-hook ke window, jadi
// koneksinya ikut lepas saat window dihancurkan (rebuild tidak menumpuk).
export function followFocused(win, onChange) {
    const sync = () => { applyFocused(win, onChange); };

    sync();
    win.hook(Hyprland.active.monitor, sync, 'changed');
    win.hook(Hyprland, sync, 'monitor-added');
    win.hook(Hyprland, sync, 'monitor-removed');
}
