import Gtk from 'gi://Gtk?version=3.0';
import Gdk from 'gi://Gdk?version=3.0';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import Audio from 'resource:///com/github/Aylur/ags/service/audio.js';
import Bluetooth from 'resource:///com/github/Aylur/ags/service/bluetooth.js';
import { glyphFor, primaryDevice } from './bluetooth.js';
import { eventButton, eventX } from './pointer.js';
import { palette, hexToRgb } from '../theme.js';
import { roundedRect } from '../draw.js';

const FG = hexToRgb(palette.fg);
const ACCENT = hexToRgb(palette.accent2);

const BLUETOOTH_GLYPH = '\uf293';

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
            self.set_size_request(width, 18);
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

export default () => {
    const icon = Widget.Label({ className: 'dyn-island-bt-icon' });
    const name = Widget.Label({
        className: 'dyn-island-bt-name',
        xalign: 0,
        truncate: 'end',
        maxWidthChars: 24,
    });
    const meta = Widget.Label({
        className: 'dyn-island-bt-meta',
        xalign: 0,
        truncate: 'end',
        maxWidthChars: 34,
    });
    const battIcon = Widget.Label({ className: 'dyn-island-bt-batt-icon' });
    const battText = Widget.Label({ className: 'dyn-island-bt-batt' });
    const volText = Widget.Label({ className: 'dyn-island-bt-vol-text' });

    let sink = null;

    const slider = VolumeSlider(190, value => {
        if (!sink) return;
        // menggeser slider saat bisu = niat user menyalakan suara
        if (sink.is_muted) sink.is_muted = false;
        sink.volume = value;
        refresh();
    });

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

    const battBox = Widget.Box({
        className: 'dyn-island-bt-batt-box',
        spacing: 6,
        valign: Gtk.Align.CENTER,
        children: [battIcon, battText],
    });
    battBox.set_no_show_all(true);

    const volRow = Widget.Box({
        className: 'dyn-island-bt-vol',
        spacing: 10,
        valign: Gtk.Align.CENTER,
        children: [muteButton, slider, volText],
    });
    volRow.set_no_show_all(true);

    const head = Widget.Box({
        className: 'dyn-island-bt-head',
        spacing: 12,
        valign: Gtk.Align.CENTER,
        children: [
            icon,
            Widget.Box({
                className: 'dyn-island-bt-text',
                vertical: true,
                spacing: 2,
                valign: Gtk.Align.CENTER,
                children: [name, meta],
            }),
            battBox,
        ],
    });

    const refresh = () => {
        const device = primaryDevice();
        if (!device) {
            icon.label = BLUETOOTH_GLYPH;
            name.label = 'Tidak ada perangkat';
            meta.label = Bluetooth.enabled
                ? 'Hubungkan headset atau speaker'
                : 'Bluetooth nonaktif';
            battBox.visible = false;
            volRow.visible = false;
            sink = null;
            return;
        }

        icon.label = glyphFor(device);
        name.label = device.name || device.alias || 'Perangkat';
        meta.label = `${device.type || 'Bluetooth'} · ${device.address}`;

        const battery = Number(device.battery_percentage) || 0;
        battBox.visible = battery > 0;
        battIcon.label = batteryGlyph(battery);
        battText.label = `${battery}%`;

        sink = sinkFor(device);
        volRow.visible = !!sink;
        if (!sink) return;

        const volume = Number(sink.volume) || 0;
        slider.setFraction(volume);
        slider.setMuted(sink.is_muted);
        volText.label = `${Math.round(volume * 100)}%`;
        muteLabel.label = volumeGlyph(sink.is_muted, volume);
    };

    return Widget.Box({
        className: 'dyn-island-bluetooth',
        vertical: true,
        spacing: 10,
        halign: Gtk.Align.CENTER,
        valign: Gtk.Align.CENTER,
        children: [head, volRow],
        setup: self => {
            refresh();
            self.hook(Bluetooth, refresh);
            self.hook(Audio, refresh);
        },
    });
};
