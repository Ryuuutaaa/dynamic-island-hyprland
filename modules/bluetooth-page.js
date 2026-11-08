import Gtk from 'gi://Gtk?version=3.0';
import Gdk from 'gi://Gdk?version=3.0';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import Audio from 'resource:///com/github/Aylur/ags/service/audio.js';
import Bluetooth from 'resource:///com/github/Aylur/ags/service/bluetooth.js';
import { glyphFor, primaryDevice, sinkFor } from './bluetooth.js';
import { eventButton, eventX } from './pointer.js';
import { page } from '../state.js';
import { palette, hexToRgb } from '../theme.js';
import { roundedRect } from '../draw.js';
import { tabular } from './type.js';

const FG = hexToRgb(palette.fg);
const ACCENT = hexToRgb(palette.accent2);

const BLUETOOTH_GLYPH = '\uf293';
const LIST_W = 200;
const LIST_H = 70;
const RIGHT_W = 190;

const nameOf = device => device?.name || device?.alias || 'Perangkat';

const volumeGlyph = (muted, volume) => {
    if (muted || volume <= 0) return '\uf026';
    return volume < 0.34 ? '\uf027' : '\uf028';
};

// Slider volume: Cairo + click/drag, karena Gtk.Scale diregangkan penuh oleh
// Box AGS dan tidak mengikuti gaya notch.
const VolumeSlider = (width, onChange) => {
    let fraction = 0;
    let muted = false;
    let pressed = false;

    const area = Widget.DrawingArea({
        className: 'dyn-island-bt-slider',
        setup: self => {
            self.set_size_request(width, 24);
            self.add_events(Gdk.EventMask.BUTTON_PRESS_MASK
                | Gdk.EventMask.BUTTON_RELEASE_MASK
                | Gdk.EventMask.POINTER_MOTION_MASK);

            const apply = x => {
                const w = Math.max(1, self.get_allocated_width());
                const next = Math.max(0, Math.min(1, x / w));
                fraction = next;
                self.queue_draw();
                onChange(next);
            };

            self.connect('button-press-event', (_w, event) => {
                if (eventButton(event) !== 1) return false;
                pressed = true;
                apply(eventX(event));
                return true;
            });
            self.connect('button-release-event', () => {
                pressed = false;
                return true;
            });
            self.connect('motion-notify-event', (_w, event) => {
                if (!pressed) return false;
                apply(eventX(event));
                return true;
            });
        },
        drawFn: (self, cr, w, h) => {
            const barH = 5;
            const y = (h - barH) / 2;

            cr.setSourceRGBA(FG[0], FG[1], FG[2], 0.16);
            roundedRect(cr, 0, y, w, barH, barH / 2);
            cr.fill();

            if (fraction <= 0) return;
            cr.setSourceRGBA(ACCENT[0], ACCENT[1], ACCENT[2], muted ? 0.28 : 0.95);
            roundedRect(cr, 0, y, Math.max(barH, w * fraction), barH, barH / 2);
            cr.fill();

            const knob = Math.max(4, Math.min(w - 4, w * fraction));
            cr.setSourceRGBA(FG[0], FG[1], FG[2], 0.95);
            cr.arc(knob, h / 2, 4, 0, Math.PI * 2);
            cr.fill();
        },
    });

    area.setFraction = value => {
        const next = Math.max(0, Math.min(1, Number(value) || 0));
        if (next === fraction) return;
        fraction = next;
        area.queue_draw();
    };
    area.setMuted = value => {
        const next = !!value;
        if (next === muted) return;
        muted = next;
        area.queue_draw();
    };
    return area;
};

// Satu baris = satu perangkat. Klik badan memilih (panel kanan ikut berganti),
// klik badge langsung menyambung / memutus tanpa perlu memilih dulu.
const DeviceRow = (device, selected, onSelect, onToggle) => {
    const connected = !!device.connected;
    const icon = Widget.Label({
        className: `dyn-island-bt-device-icon${connected ? ' is-on' : ''}`,
        label: glyphFor(device),
    });
    const name = Widget.Label({
        className: 'dyn-island-bt-device-name',
        label: nameOf(device),
        truncate: 'end',
        maxWidthChars: 14,
        xalign: 0,
    });
    const badge = Widget.Button({
        className: `dyn-island-bt-badge${connected ? ' is-on' : ''}`
            + (device.connecting ? ' is-busy' : ''),
        child: Widget.Label({
            className: 'dyn-island-bt-badge-label',
            label: device.connecting ? '…' : connected ? 'Putus' : 'Sambung',
        }),
        sensitive: Bluetooth.enabled && !device.connecting,
        tooltipText: connected
            ? `Putuskan ${nameOf(device)}`
            : `Sambungkan ${nameOf(device)}`,
        onClicked: () => onToggle(device),
    });

    const row = Widget.EventBox({
        className: `dyn-island-bt-device${selected ? ' is-selected' : ''}`,
        child: Widget.CenterBox({
            startWidget: Widget.Box({ spacing: 7, children: [icon, name] }),
            endWidget: badge,
        }),
        setup: self => {
            self.connect('button-press-event', (_w, event) => {
                if (eventButton(event) !== 1) return false;
                onSelect(device);
                return true;
            });
        },
    });
    row.set_size_request(LIST_W, -1);
    return row;
};

export default () => {
    let selectedAddress = null;
    let userSelected = false;
    let sink = null;

    // ── kolom kiri: judul + daya + daftar perangkat ─────────────────────────
    const powerDot = Widget.Label({ className: 'dyn-island-bt-power-dot', label: '●' });
    const powerLabel = Widget.Label({ className: 'dyn-island-bt-power-label', label: 'Aktif' });
    const power = Widget.Button({
        className: 'dyn-island-bt-power',
        child: Widget.Box({ spacing: 6, children: [powerDot, powerLabel] }),
        tooltipText: 'Nyalakan / matikan Bluetooth',
        onClicked: () => Bluetooth.toggle(),
    });
    const title = Widget.Label({ className: 'dyn-island-bt-title', label: 'Bluetooth' });
    const header = Widget.CenterBox({
        className: 'dyn-island-bt-header',
        startWidget: title,
        endWidget: power,
    });
    header.set_size_request(LIST_W, -1);

    const list = Widget.Box({ className: 'dyn-island-bt-list', vertical: true, spacing: 2 });
    const pane = Widget.Scrollable({
        className: 'dyn-island-bt-pane',
        hscroll: 'never',
        vscroll: 'external',
    });
    pane.child = list;
    pane.set_size_request(LIST_W, LIST_H);

    const scrollPane = event => {
        let dy = 0;
        try {
            const deltas = event.get_scroll_deltas?.();
            if (Array.isArray(deltas) && deltas[0]) dy = Number(deltas[2]) || 0;
        } catch (_) { }
        if (!dy) return false;
        const adjustment = pane.get_vadjustment();
        if (!adjustment) return false;
        const max = Math.max(0, adjustment.upper - adjustment.page_size);
        if (max <= 0) return false;
        adjustment.value = Math.max(0, Math.min(max, adjustment.value + dy * 36));
        return true;
    };
    pane.connect('scroll-event', (_self, event) => scrollPane(event));

    const left = Widget.Box({
        className: 'dyn-island-bt-left',
        vertical: true,
        spacing: 6,
        widthRequest: LIST_W,
        valign: Gtk.Align.CENTER,
        children: [header, pane],
    });

    // ── kolom kanan: detail perangkat terpilih + volume ───────────────────────
    const icon = Widget.Label({ className: 'dyn-island-bt-icon' });
    const name = Widget.Label({
        className: 'dyn-island-bt-name',
        xalign: 0,
        truncate: 'end',
        maxWidthChars: 14,
    });
    const meta = Widget.Label({
        className: 'dyn-island-bt-meta',
        xalign: 0,
        truncate: 'end',
        maxWidthChars: 18,
    });
    const statusDot = Widget.Label({ className: 'dyn-island-bt-status-dot', label: '●' });
    const statusText = Widget.Label({ className: 'dyn-island-bt-status-text' });
    const status = Widget.Box({
        className: 'dyn-island-bt-status',
        spacing: 6,
        valign: Gtk.Align.CENTER,
        children: [statusDot, statusText],
    });
    const hint = Widget.Label({
        className: 'dyn-island-bt-hint',
        xalign: 0,
        wrap: true,
        maxWidthChars: 26,
    });

    const head = Widget.Box({
        className: 'dyn-island-bt-head',
        spacing: 10,
        valign: Gtk.Align.CENTER,
        widthRequest: RIGHT_W,
        children: [
            icon,
            Widget.Box({
                className: 'dyn-island-bt-text',
                vertical: true,
                spacing: 1,
                widthRequest: 132,
                valign: Gtk.Align.CENTER,
                children: [name, meta],
            }),
        ],
    });

    const volText = tabular(Widget.Label({ className: 'dyn-island-bt-vol-text' }));
    const muteLabel = Widget.Label({ className: 'dyn-island-ctl-icon' });
    const muteButton = Widget.Button({
        className: 'dyn-island-ctl',
        tooltipText: 'Bisukan / nyalakan suara',
        child: muteLabel,
        onClicked: () => {
            if (!sink) return;
            sink.is_muted = !sink.is_muted;
            refresh();
        },
    });
    const slider = VolumeSlider(106, value => {
        if (!sink) return;
        if (sink.is_muted) sink.is_muted = false;
        sink.volume = value;
        refresh();
    });
    const volRow = Widget.Box({
        className: 'dyn-island-bt-vol',
        spacing: 8,
        valign: Gtk.Align.CENTER,
        widthRequest: RIGHT_W,
        children: [muteButton, slider, volText],
    });

    const right = Widget.Box({
        className: 'dyn-island-bt-right',
        vertical: true,
        spacing: 6,
        widthRequest: RIGHT_W,
        valign: Gtk.Align.CENTER,
        children: [head, status, volRow, hint],
    });

    for (const widget of [status, volRow, hint])
        widget.set_no_show_all(true);

    // Pilihan eksplisit user dipertahankan; kalau belum ada (atau perangkatnya
    // hilang), ikuti perangkat audio yang sedang tersambung — bukan sekadar
    // entri pertama, supaya panel kanan langsung menampilkan yang aktif.
    const selectedDevice = () => {
        const devices = Bluetooth.devices;
        if (!devices.length) return null;
        let device = userSelected
            ? devices.find(item => item.address === selectedAddress)
            : null;
        if (!device) {
            device = primaryDevice()
                ?? devices.find(item => item.connected)
                ?? devices[0];
            selectedAddress = device?.address ?? null;
        }
        return device ?? null;
    };

    const select = device => {
        userSelected = true;
        selectedAddress = device.address;
        refresh();
    };

    const toggle = device => {
        if (!Bluetooth.enabled || device.connecting) return;
        userSelected = true;
        selectedAddress = device.address;
        device.setConnection(!device.connected);
        refresh();
    };

    const refresh = () => {
        const enabled = Bluetooth.enabled;
        powerLabel.label = enabled ? 'Aktif' : 'Mati';
        power.className = `dyn-island-bt-power${enabled ? ' is-on' : ''}`;
        powerDot.className = `dyn-island-bt-power-dot${enabled ? ' is-on' : ''}`;

        const devices = Bluetooth.devices;
        // Perangkat aktif di atas supaya aksi yang paling sering dipakai dekat.
        const ordered = devices.slice().sort((a, b) =>
            (Number(b.connected) - Number(a.connected))
            || nameOf(a).localeCompare(nameOf(b)));
        const device = selectedDevice();

        list.children = ordered.length
            ? ordered.map(item => DeviceRow(
                item,
                item.address === device?.address,
                select,
                toggle))
            : [Widget.Label({
                className: 'dyn-island-bt-empty',
                label: enabled ? 'Belum ada perangkat' : 'Bluetooth nonaktif',
                xalign: 0,
            })];

        if (!device) {
            icon.label = BLUETOOTH_GLYPH;
            name.label = enabled ? 'Tidak ada perangkat' : 'Bluetooth nonaktif';
            meta.label = enabled ? 'Tidak ada yang dipasangkan' : 'Nyalakan untuk memakai';
            status.visible = false;
            volRow.visible = false;
            hint.visible = true;
            hint.label = enabled
                ? 'Pasangkan perangkat lewat bluetoothctl atau pengaturan sistem.'
                : 'Tekan tombol daya di kiri untuk menyalakan Bluetooth.';
            sink = null;
            return;
        }

        icon.label = glyphFor(device);
        name.label = nameOf(device);
        name.tooltipText = name.label;
        const battery = Number(device.battery_percentage) || 0;
        meta.label = (device.type || 'Bluetooth')
            + (battery > 0 ? ` · baterai ${battery}%` : '');
        meta.tooltipText = meta.label;

        status.visible = true;
        statusDot.className = `dyn-island-bt-status-dot${device.connected ? ' is-on' : ''}`;
        statusText.label = device.connecting
            ? 'Menyambungkan…'
            : device.connected ? 'Tersambung' : 'Tidak tersambung';

        sink = device.connected ? sinkFor(device) : null;
        volRow.visible = !!sink;
        hint.visible = !sink;
        if (!sink) {
            hint.label = enabled
                ? 'Tekan Sambung untuk menghubungkan perangkat ini.'
                : 'Bluetooth sedang nonaktif.';
            return;
        }

        const volume = Number(sink.volume) || 0;
        slider.setFraction(volume);
        slider.setMuted(sink.is_muted);
        volText.label = `${Math.round(volume * 100)}%`;
        muteLabel.label = volumeGlyph(sink.is_muted, volume);
    };

    return Widget.Box({
        className: 'dyn-island-bluetooth',
        spacing: 12,
        halign: Gtk.Align.CENTER,
        valign: Gtk.Align.CENTER,
        children: [left, right],
        setup: self => {
            refresh();
            self.hook(Bluetooth, refresh);
            self.hook(Audio, refresh);
            self.connect('map', () => {
                const top = self.get_toplevel();
                if (!top || top.__btScrollHooked) return;
                top.__btScrollHooked = true;
                top.connect('scroll-event', (_w, event) => {
                    if (page.value !== 'bluetooth' || !pane.get_mapped()) return false;
                    return scrollPane(event);
                });
            });
        },
    });
};
