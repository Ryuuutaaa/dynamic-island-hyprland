import Gtk from 'gi://Gtk?version=3.0';
import Gdk from 'gi://Gdk?version=3.0';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import Audio from 'resource:///com/github/Aylur/ags/service/audio.js';
import Bluetooth from 'resource:///com/github/Aylur/ags/service/bluetooth.js';
import { glyphFor, primaryDevice, sinkFor } from './bluetooth.js';
import { eventButton, eventX, scrollDelta } from './pointer.js';
import { page } from '../state.js';
import { palette, hexToRgb } from '../theme.js';
import { roundedRect } from '../draw.js';
import { tabular } from './type.js';

const FG = hexToRgb(palette.fg);
const ACCENT = hexToRgb(palette.accent2);

const PAGE_W = 428;
const LIST_FULL = 88;
const LIST_VOL = 60;

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

// Satu baris = satu perangkat. Klik badan memilih (volume mengikuti), badge
// di kanan menyambung/memutus langsung.
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
        maxWidthChars: 24,
        xalign: 0,
    });
    const battery = Number(device.battery_percentage) || 0;
    const metaText = `${device.type || 'Bluetooth'}${battery > 0 ? ` · ${battery}%` : ''}`;
    const meta = Widget.Label({
        className: 'dyn-island-bt-meta',
        label: metaText,
        truncate: 'end',
        maxWidthChars: 30,
        xalign: 0,
    });
    const badgeLabel = Widget.Label({
        className: 'dyn-island-bt-badge-label',
        label: device.connecting ? '…' : connected ? 'Putus' : 'Sambung',
    });
    const badge = Widget.Button({
        className: `dyn-island-bt-badge${connected ? ' is-on' : ''}`
            + (device.connecting ? ' is-busy' : ''),
        child: badgeLabel,
        sensitive: Bluetooth.enabled && !device.connecting,
        tooltipText: connected
            ? `Putuskan ${nameOf(device)}`
            : `Sambungkan ${nameOf(device)}`,
        onClicked: () => onToggle(device),
    });

    const row = Widget.EventBox({
        className: `dyn-island-bt-device${selected ? ' is-selected' : ''}`,
        tooltipText: `${nameOf(device)}\n${metaText}`,
        child: Widget.CenterBox({
            startWidget: Widget.Box({
                spacing: 8,
                children: [
                    icon,
                    Widget.Box({
                        className: 'dyn-island-bt-text',
                        vertical: true,
                        spacing: 2,
                        valign: Gtk.Align.CENTER,
                        children: [name, meta],
                    }),
                ],
            }),
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
    row.set_size_request(PAGE_W, -1);
    return row;
};

export default () => {
    let selectedAddress = null;
    let userSelected = false;
    let sink = null;

    // ── header: judul + status + daya ───────────────────────────────────────
    const title = Widget.Label({ className: 'dyn-island-bt-title', label: 'Bluetooth' });
    const context = Widget.Label({
        className: 'dyn-island-bt-context',
        truncate: 'end',
        maxWidthChars: 30,
    });
    const powerDot = Widget.Label({ className: 'dyn-island-bt-power-dot', label: '●' });
    const powerLabel = Widget.Label({ className: 'dyn-island-bt-power-label', label: 'Aktif' });
    const power = Widget.Button({
        className: 'dyn-island-bt-power',
        child: Widget.Box({ spacing: 8, children: [powerDot, powerLabel] }),
        tooltipText: 'Nyalakan / matikan Bluetooth',
        onClicked: () => Bluetooth.toggle(),
    });
    const header = Widget.CenterBox({
        className: 'dyn-island-bt-header',
        startWidget: Widget.Box({ spacing: 8, children: [title, context] }),
        endWidget: power,
    });
    header.set_size_request(PAGE_W, 24);

    // ── satu kolom: daftar perangkat ────────────────────────────────────────
    const list = Widget.Box({ className: 'dyn-island-bt-list', vertical: true, spacing: 2 });
    const pane = Widget.Scrollable({
        className: 'dyn-island-bt-pane',
        hscroll: 'never',
        vscroll: 'external',
    });
    pane.child = list;
    pane.set_size_request(PAGE_W, LIST_FULL);

    const scrollPane = event => {
        const dy = scrollDelta(event);
        if (!dy) return false;
        const adjustment = pane.get_vadjustment();
        if (!adjustment) return false;
        const max = Math.max(0, adjustment.upper - adjustment.page_size);
        if (max <= 0) return false;
        adjustment.value = Math.max(0, Math.min(max, adjustment.value + dy * 36));
        return true;
    };
    pane.connect('scroll-event', (_self, event) => scrollPane(event));

    // ── volume: hanya muncul untuk perangkat audio yang tersambung ──────────
    const volText = tabular(Widget.Label({
        className: 'dyn-island-bt-vol-text',
        xalign: 1,
    }));
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
    const slider = VolumeSlider(296, value => {
        if (!sink) return;
        if (sink.is_muted) sink.is_muted = false;
        sink.volume = value;
        refresh();
    });
    const volRow = Widget.Box({
        className: 'dyn-island-bt-vol',
        spacing: 8,
        valign: Gtk.Align.CENTER,
        widthRequest: PAGE_W - 24,
        children: [muteButton, slider, volText],
    });
    volRow.set_no_show_all(true);

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
        const ordered = devices.slice().sort((a, b) =>
            (Number(b.connected) - Number(a.connected))
            || nameOf(a).localeCompare(nameOf(b)));
        const device = selectedDevice();
        const connected = ordered.filter(item => item.connected);
        const connecting = ordered.some(item => item.connecting);

        context.label = !enabled
            ? 'Nonaktif'
            : connecting
                ? 'Menyambungkan…'
                : connected.length ? 'Tersambung' : 'Siap';
        context.className = 'dyn-island-bt-context';
        context.tooltipText = connected.length
            ? connected.map(nameOf).join(', ')
            : enabled ? 'Belum ada perangkat tersambung' : 'Bluetooth nonaktif';

        list.children = ordered.length
            ? ordered.map(item => DeviceRow(
                item,
                item.address === device?.address,
                select,
                toggle))
            : [Widget.Label({
                className: 'dyn-island-bt-empty',
                label: enabled ? 'Belum ada perangkat' : 'Bluetooth nonaktif',
                xalign: 0.5,
                halign: Gtk.Align.CENTER,
                valign: Gtk.Align.CENTER,
                vexpand: true,
            })];

        sink = device?.connected ? sinkFor(device) : null;
        volRow.visible = !!sink;
        pane.set_size_request(PAGE_W, sink ? LIST_VOL : LIST_FULL);
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
        vertical: true,
        spacing: 4,
        halign: Gtk.Align.CENTER,
        valign: Gtk.Align.CENTER,
        children: [header, pane, volRow],
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
