import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import Variable from 'resource:///com/github/Aylur/ags/variable.js';
import Bluetooth from 'resource:///com/github/Aylur/ags/service/bluetooth.js';

// Preview untuk menguji tampilan tanpa device fisik (tidak dipakai di jalur
// normal): kalau kosong, sumbernya tetap Bluetooth.connected_devices.
export const btPreview = Variable([]);

// Glyph mengikuti icon_name dari BlueZ (audio-headset, input-keyboard, ...).
// Urut dari yang paling spesifik: 'audio-speaker' harus jadi speaker, bukan
// headphone, karena juga mengandung kata 'audio'.
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

const glyphFor = device => {
    const icon = String(device.icon_name ?? '').toLowerCase();
    for (const [key, glyph] of GLYPHS)
        if (icon.includes(key)) return glyph;
    return BT_GLYPH;
};

const devices = () =>
    btPreview.value.length ? btPreview.value : Bluetooth.connected_devices;

const nameOf = device => device.name || device.alias || 'Perangkat';

const describe = device => {
    const percent = Number(device.battery_percentage);
    return percent > 0 ? `${nameOf(device)} · ${percent}%` : nameOf(device);
};

// Satu baris ringkas, sejajar dengan baris baterai/tugas/air di halaman idle.
// Tidak dirender sama sekali saat tidak ada device yang terhubung.
export default () => {
    const icon = Widget.Label({ className: 'dyn-island-idle-stat-icon' });
    const text = Widget.Label({
        className: 'dyn-island-idle-stat',
        xalign: 0,
        truncate: 'end',
        maxWidthChars: 20,
    });
    const row = Widget.Box({
        className: 'dyn-island-idle-stat-row',
        spacing: 8,
        children: [icon, text],
    });

    row.set_no_show_all(true); // visible dikendalikan manual, bukan show_all()

    const refresh = () => {
        const list = devices();
        row.visible = list.length > 0;
        if (!list.length) return;
        // device audio diprioritaskan kalau ada beberapa yang terhubung
        const primary = list.find(d => /audio|headset|headphone|speaker/.test(String(d.icon_name ?? ''))) ?? list[0];
        icon.label = glyphFor(primary);
        text.label = describe(primary) + (list.length > 1 ? ` +${list.length - 1}` : '');
        // tooltip hanya berguna kalau ada lebih dari satu device (teks baris
        // sudah lengkap untuk satu device)
        row.tooltipText = list.length > 1 ? list.map(d => ` ${describe(d)}`).join('\n') : '';
    };

    refresh();
    row.hook(Bluetooth, refresh);
    row.hook(btPreview, refresh);
    return row;
};
