import GLib from 'gi://GLib';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import Variable from 'resource:///com/github/Aylur/ags/variable.js';
import Audio from 'resource:///com/github/Aylur/ags/service/audio.js';
import Bluetooth from 'resource:///com/github/Aylur/ags/service/bluetooth.js';
import { pinPage } from '../state.js';

// Preview untuk menguji tampilan tanpa device fisik (tidak dipakai di jalur
// normal): kalau kosong, sumbernya tetap Bluetooth.connected_devices.
export const btPreview = Variable([]);

// Glyph mengikuti icon_name dari BlueZ (audio-headset, input-keyboard, ...).
// Urut dari yang paling spesifik: 'audio-speaker' harus jadi speaker, bukan
// headphone, karena juga mengandung kata "audio".
const GLYPHS = [
    ['headset', '\uf025'],
    ['headphone', '\uf025'],
    ['speaker', '\uf028'],
    ['keyboard', '\uf11c'],
    ['mouse', '\uf245'],
    ['phone', '\uf10b'],
    ['audio', '\uf025'],
];
const BT_GLYPH = '\uf293';

export const glyphFor = device => {
    const icon = String(device?.icon_name ?? '').toLowerCase();
    for (const [key, glyph] of GLYPHS)
        if (icon.includes(key)) return glyph;
    return BT_GLYPH;
};

const devices = () =>
    btPreview.value.length ? btPreview.value : Bluetooth.connected_devices;

export const connectedDevices = devices;

// Device audio diprioritaskan kalau ada beberapa yang terhubung; halaman
// bluetooth memakai device yang sama dengan baris ringkas di halaman idle.
export const primaryDevice = () => {
    const list = devices();
    return list.find(d => /audio|headset|headphone|speaker/.test(String(d.icon_name ?? '')))
        ?? list[0]
        ?? null;
};

const AUDIO_DEVICE = /audio|headset|headphone|speaker/;

// Sink PipeWire milik device Bluetooth. Nama sink memuat alamat device dengan
// ':' diganti '_' (bluez_output.64_8F_DB_52_8A_74.1).
export const sinkFor = device => {
    if (!device) return null;
    const address = String(device.address ?? '').replace(/:/g, '_').toLowerCase();
    const sinks = Audio.speakers ?? [];
    if (address) {
        const byAddress = sinks.find(s =>
            String(s.name ?? '').toLowerCase().includes(`bluez_output.${address}`));
        if (byAddress) return byAddress;
    }
    return sinks.find(s => s.description === device.name) ?? null;
};

// Begitu device audio Bluetooth tersambung, jadikan sink-nya default supaya
// suara langsung pindah tanpa membuka pengaturan audio. Hanya transisi yang
// dipicu: sink yang sudah aktif saat AGS start tidak diambil alih, dan pilihan
// manual user saat device tetap tersambung tidak dilawan.
export function watchAudioRouting() {
    let known = null;
    let retrySeq = 0;

    const switchTo = device => {
        const sink = sinkFor(device);
        if (!sink) return false;
        if (Audio.speaker?.name === sink.name) return true;
        Audio.speaker = sink;
        return true;
    };

    const check = () => {
        const connected = new Map();
        for (const device of Bluetooth.devices) {
            if (!device.connected) continue;
            if (!AUDIO_DEVICE.test(String(device.icon_name ?? ''))) continue;
            connected.set(device.address, device);
        }
        const previous = known;
        known = new Set(connected.keys());
        if (previous === null) return; // jangan rebut default saat AGS baru start

        for (const [address, device] of connected) {
            if (previous.has(address)) continue;
            if (switchTo(device)) continue;
            // Sink PipeWire baru muncul beberapa ratus ms setelah connect.
            const seq = ++retrySeq;
            let tries = 0;
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, () => {
                if (seq !== retrySeq) return GLib.SOURCE_REMOVE;
                if (switchTo(device) || ++tries >= 6) return GLib.SOURCE_REMOVE;
                return GLib.SOURCE_CONTINUE;
            });
        }
    };

    Bluetooth.connect('changed', check);
    check();
}

const nameOf = device => device.name || device.alias || 'Perangkat';

const describe = device => {
    const percent = Number(device.battery_percentage);
    return percent > 0 ? `${nameOf(device)} · ${percent}%` : nameOf(device);
};

// Baris ringkas di halaman idle. Dulu hanya Box (tidak bisa diklik); sekarang
// EventBox supaya klik membuka halaman detail bluetooth. EventBox dipakai
// (bukan Gtk.Button) agar tidak menambah tinggi/background bawaan tema.
export default () => {
    const icon = Widget.Label({ className: 'dyn-island-idle-stat-icon' });
    const text = Widget.Label({
        className: 'dyn-island-idle-stat',
        xalign: 0,
        truncate: 'end',
        maxWidthChars: 20,
    });
    const row = Widget.EventBox({
        className: 'dyn-island-idle-stat-row dyn-island-bt-row',
        child: Widget.Box({ spacing: 8, children: [icon, text] }),
        setup: self => {
            // visible dikendalikan manual, bukan show_all()
            self.set_no_show_all(true);
            self.connect('button-press-event', () => {
                pinPage('bluetooth');
                return true;
            });
        },
    });

    const refresh = () => {
        const list = devices();
        row.visible = list.length > 0;
        if (!list.length) return;
        const primary = primaryDevice();
        icon.label = glyphFor(primary);
        text.label = describe(primary) + (list.length > 1 ? ` +${list.length - 1}` : '');
        row.tooltipText = [...list.map(d => ` ${describe(d)}`), 'Klik untuk detail'].join('\n');
    };

    refresh();
    row.hook(Bluetooth, refresh);
    row.hook(btPreview, refresh);
    return row;
};
