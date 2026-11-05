import Gtk from 'gi://Gtk?version=3.0';
import Gdk from 'gi://Gdk?version=3.0';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import Audio from 'resource:///com/github/Aylur/ags/service/audio.js';
import Bluetooth from 'resource:///com/github/Aylur/ags/service/bluetooth.js';
import { glyphFor, primaryDevice } from './bluetooth.js';
import { eventButton, eventX } from './pointer.js';
import { page } from '../state.js';
import { palette, hexToRgb } from '../theme.js';
import { roundedRect } from '../draw.js';
import { tabular } from './type.js';

const FG = hexToRgb(palette.fg);
const ACCENT = hexToRgb(palette.accent2);
const OK = hexToRgb(palette.ok);

const BLUETOOTH_GLYPH = '\uf293';
const LIST_W = 190;
const LIST_H = 64;
const RIGHT_W = 190;

const batteryGlyph = percent => {
    if (percent >= 90) return '\uf240';
    if (percent >= 65) return '\uf241';
    if (percent >= 40) return '\uf242';
    if (percent >= 15) return '\uf243';
    return '\uf244';
};

const volumeGlyph = (muted, volume) => {
    if (muted || volume <= 0) return '\uf026';
    return volume < 0.34 ? '\uf027' : '\uf028';
};

// Sink audio milik device Bluetooth. Nama sink PipeWire memuat alamat device
// dengan ':' diganti '_' (bluez_output.64_8F_DB_52_8A_74.1), jadi device yang
// terhubung bisa dipetakan ke sink yang tepat — bukan sekadar sink default.
const sinkFor = device => {
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

const stateText = device => {
    if (!device) return '';
    if (device.connecting) return '…';
    if (device.connected) {
        const battery = Number(device.battery_percentage) || 0;
        return battery > 0 ? `${battery}%` : 'aktif';
    }
    return 'paired';
};

const DeviceRow = (device, selected, onSelect) => {
    const icon = Widget.Label({
        className: 'dyn-island-bt-device-icon',
        label: glyphFor(device),
    });
    const name = Widget.Label({
        className: 'dyn-island-bt-device-name',
        label: device.name || device.alias || 'Perangkat',
        truncate: 'end',
        maxWidthChars: 12,
        xalign: 0,
    });
    const state = Widget.Label({
        className: `dyn-island-bt-device-state${device.connected ? ' on' : ''}`,
        label: stateText(device),
        xalign: 1,
    });

    const row = Widget.Button({
        className: `dyn-island-bt-device${selected ? ' is-selected' : ''}`,
        child: Widget.CenterBox({
            startWidget: Widget.Box({ spacing: 6, children: [icon, name] }),
            endWidget: state,
        }),
        onClicked: () => onSelect(device),
    });
    row.set_size_request(LIST_W - 4, -1);
    return row;
};

export default () => {
    let selectedAddress = null;

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

    const powerLabel = Widget.Label({ className: 'dyn-island-chip-label', label: 'Aktif' });
    const power = Widget.Button({
        className: 'dyn-island-chip dyn-island-bt-power',
        child: powerLabel,
        tooltipText: 'Nyalakan / matikan Bluetooth',
        onClicked: () => Bluetooth.toggle(),
    });
    const title = Widget.Label({ className: 'dyn-island-bt-title', label: 'Bluetooth' });
    const header = Widget.Box({
        className: 'dyn-island-bt-header',
        spacing: 8,
        children: [title, power],
    });

    const left = Widget.Box({
        className: 'dyn-island-bt-left',
        vertical: true,
        spacing: 4,
        widthRequest: LIST_W,
        valign: Gtk.Align.CENTER,
        children: [header, pane],
    });

    const icon = Widget.Label({ className: 'dyn-island-bt-icon' });
    const name = Widget.Label({
        className: 'dyn-island-bt-name',
        xalign: 0,
        truncate: 'end',
        maxWidthChars: 12,
    });
    const meta = Widget.Label({
        className: 'dyn-island-bt-meta',
        xalign: 0,
        truncate: 'end',
        maxWidthChars: 16,
    });
    const actionLabel = Widget.Label({ className: 'dyn-island-chip-label', label: 'Sambung' });
    const action = Widget.Button({
        className: 'dyn-island-chip dyn-island-bt-action',
        child: actionLabel,
        onClicked: () => {
            const device = Bluetooth.devices.find(item => item.address === selectedAddress);
            if (device && Bluetooth.enabled) device.setConnection(!device.connected);
        },
    });
    action.set_no_show_all(true);

    const head = Widget.Box({
        className: 'dyn-island-bt-head',
        spacing: 6,
        valign: Gtk.Align.CENTER,
        widthRequest: RIGHT_W,
        children: [
            icon,
            Widget.Box({
                className: 'dyn-island-bt-text',
                vertical: true,
                spacing: 0,
                widthRequest: 80,
                valign: Gtk.Align.CENTER,
                children: [name, meta],
            }),
            action,
        ],
    });

    const volText = tabular(Widget.Label({ className: 'dyn-island-bt-vol-text' }));
    const muteLabel = Widget.Label({ className: 'dyn-island-ctl-icon' });
    let sink = null;
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
    const slider = VolumeSlider(110, value => {
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
    volRow.set_no_show_all(true);

    const right = Widget.Box({
        className: 'dyn-island-bt-right',
        vertical: true,
        spacing: 4,
        widthRequest: RIGHT_W,
        valign: Gtk.Align.CENTER,
        children: [head, volRow],
    });

    const selectedDevice = () => {
        const devices = Bluetooth.devices;
        if (!devices.length) return null;
        let device = devices.find(item => item.address === selectedAddress);
        if (!device) {
            const primary = primaryDevice();
            device = devices.find(item => item.address === primary?.address) ?? devices[0];
            selectedAddress = device?.address ?? null;
        }
        return device ?? null;
    };

    const refresh = () => {
        const enabled = Bluetooth.enabled;
        powerLabel.label = enabled ? 'Aktif' : 'Mati';
        power.className = `dyn-island-chip dyn-island-bt-power${enabled ? ' is-on' : ''}`;

        const devices = Bluetooth.devices;
        const device = selectedDevice();

        list.children = devices.length
            ? devices.map(item => DeviceRow(item, item.address === device?.address, next => {
                selectedAddress = next.address;
                refresh();
            }))
            : [Widget.Label({
                className: 'dyn-island-bt-empty',
                label: enabled ? 'Tidak ada perangkat paired' : 'Bluetooth nonaktif',
                xalign: 0,
            })];

        if (!device) {
            icon.label = BLUETOOTH_GLYPH;
            name.label = 'Tidak ada perangkat';
            meta.label = enabled ? 'Pasangkan lewat bluetoothctl' : 'Bluetooth nonaktif';
            action.visible = false;
            volRow.visible = false;
            sink = null;
            return;
        }

        icon.label = glyphFor(device);
        name.label = device.name || device.alias || 'Perangkat';
        const battery = Number(device.battery_percentage) || 0;
        meta.label = `${device.type || 'Bluetooth'} · ${device.address}`
            + (battery > 0 ? ` · ${battery}%` : '');

        action.visible = enabled;
        action.sensitive = !device.connecting;
        actionLabel.label = device.connecting ? '…' : device.connected ? 'Putus' : 'Sambung';
        if (enabled) {
            action.show();
            action.child.show();
        }

        sink = device.connected ? sinkFor(device) : null;
        volRow.visible = !!sink;
        if (!sink) return;
        volRow.show();

        const volume = Number(sink.volume) || 0;
        slider.setFraction(volume);
        slider.setMuted(sink.is_muted);
        volText.label = `${Math.round(volume * 100)}%`;
        muteLabel.label = volumeGlyph(sink.is_muted, volume);
    };

    return Widget.Box({
        className: 'dyn-island-bluetooth',
        spacing: 10,
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
