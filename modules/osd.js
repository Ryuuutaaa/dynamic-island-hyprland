import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=3.0';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';
import Audio from 'resource:///com/github/Aylur/ags/service/audio.js';
import CONFIG from '../config.js';
import { palette, hexToRgb } from '../theme.js';
import { showTransient } from '../state.js';
import { roundedRect } from '../draw.js';

const BAR_HEIGHT = 5;
const BAR_WIDTH = 110;
const TRACK_RGB = hexToRgb(palette.fg);
const FILL_RGB = hexToRgb(palette.accent2);

const valueLabel = () => Widget.Label({ className: 'dyn-island-osd-value' });
const iconLabel = () => Widget.Label({ className: 'dyn-island-osd-icon' });

// Bar digambar manual, bukan Gtk.ProgressBar: AGS menambahkan child ke Box
// dengan fill=TRUE (valign/vpack diabaikan), jadi Gtk.ProgressBar selalu
// diregangkan setinggi box dan trough-nya jatuh ke bawah. Dengan DrawingArea
// kita selalu menggambar di tengah tinggi yang diberikan.
const bar = () => {
    let fraction = 0;
    return Widget.DrawingArea({
        className: 'dyn-island-bar',
        hexpand: true,
        setup: self => {
            // DrawingArea tidak punya natural size: tanpa ini lebarnya kolaps
            // (hexpand diabaikan karena AGS menambah child dengan expand=FALSE)
            self.set_size_request(BAR_WIDTH, BAR_HEIGHT);
            self.setFraction = (value) => {
                const next = Math.max(0, Math.min(1, value || 0));
                if (next === fraction) return;
                fraction = next;
                self.queue_draw();
            };
        },
        drawFn: (self, cr, width, height) => {
            const y = (height - BAR_HEIGHT) / 2;
            cr.setSourceRGBA(TRACK_RGB[0], TRACK_RGB[1], TRACK_RGB[2], 0.16);
            roundedRect(cr, 0, y, width, BAR_HEIGHT, BAR_HEIGHT / 2);
            cr.fill();

            const filled = width * fraction;
            if (filled <= 0) return;
            cr.setSourceRGBA(FILL_RGB[0], FILL_RGB[1], FILL_RGB[2], 1);
            roundedRect(cr, 0, y, Math.max(BAR_HEIGHT, filled), BAR_HEIGHT, BAR_HEIGHT / 2);
            cr.fill();
        },
    });
};

const volumeMark = () => {
    const speaker = Audio.speaker;
    if (!speaker) return null;
    // nama device ikut masuk mark supaya **ganti default sink** juga memunculkan
    // OSD, walau persentase volumenya kebetulan sama
    const device = speaker.name ?? speaker.id ?? '';
    return `${device}:${speaker.is_muted ? 'm' : Math.round(speaker.volume * 100)}`;
};

export function VolumeOsd() {
    const icon = iconLabel();
    const label = valueLabel();
    const progress = bar();

    const refresh = () => {
        const speaker = Audio.speaker;
        const volume = speaker ? speaker.volume : 0;
        const muted = speaker ? speaker.is_muted : false;
        progress.setFraction(muted ? 0 : volume);
        label.label = muted ? 'bisu' : `${Math.round(volume * 100)}%`;
        icon.label = muted ? '\uf026' : volume < 0.34 ? '\uf027' : '\uf028';
    };

    return Widget.Box({
        className: 'dyn-island-osd',
        spacing: 10,
        // compact & center: OSD juga dipakai di dalam kartu besar saat hover
        halign: Gtk.Align.CENTER,
        children: [icon, progress, label],
        setup: self => {
            // null berarti "belum tahu" supaya OSD tidak muncul sendiri saat boot
            let last = null;
            refresh();
            Utils.timeout(1200, () => { last = volumeMark(); });
            self.hook(Audio, () => {
                const mark = volumeMark();
                if (last !== null && mark !== null && mark !== last)
                    showTransient('volume', CONFIG.osdTimeout);
                last = mark;
                refresh();
            }, 'speaker-changed');
        },
    });
}

function readNumber(path) {
    try {
        const [ok, bytes] = GLib.file_get_contents(path);
        if (!ok) return null;
        const value = Number(new TextDecoder().decode(bytes).trim());
        return Number.isFinite(value) ? value : null;
    } catch (_) {
        return null;
    }
}

// Beberapa laptop punya lebih dari satu entry (mis. intel_backlight +
// acpi_video0). Ambil yang paling relevan: utamakan perangkat GPU nyata
// (bukan acpi_video*) dan rentang brightness paling besar.
function backlightPath() {
    try {
        const directory = Gio.File.new_for_path('/sys/class/backlight');
        const enumerator = directory.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
        const names = [];
        let info;
        while ((info = enumerator.next_file(null)) !== null)
            names.push(info.get_name());
        if (!names.length) return null;

        const score = name => (name.startsWith('acpi_video') ? 0 : 1_000_000)
            + (readNumber(`/sys/class/backlight/${name}/max_brightness`) || 0);
        names.sort((a, b) => score(b) - score(a));
        return `/sys/class/backlight/${names[0]}`;
    } catch (_) { }
    return null;
}

export function BrightnessOsd() {
    const icon = iconLabel();
    const label = valueLabel();
    const progress = bar();
    icon.label = '\uf185';

    return Widget.Box({
        className: 'dyn-island-osd',
        spacing: 10,
        // compact & center: OSD juga dipakai di dalam kartu besar saat hover
        halign: Gtk.Align.CENTER,
        children: [icon, progress, label],
        setup: self => {
            const path = backlightPath();
            if (!path) {
                label.label = '—';
                return;
            }
            const max = readNumber(`${path}/max_brightness`) || 1;
            let last = null;
            const update = () => {
                const raw = readNumber(`${path}/brightness`);
                if (raw === null) return;
                const percent = (raw / max) * 100;
                if (last !== null && percent !== last)
                    showTransient('brightness', CONFIG.osdTimeout);
                last = percent;
                progress.setFraction(percent / 100);
                label.label = `${Math.round(percent)}%`;
            };
            update();
            // sysfs tidak punya event, jadi harus dipoll. 250ms -> 750ms:
            // tetap responsif tapi 3x lebih hemat bangun CPU.
            Utils.interval(750, update, self);
        },
    });
}
