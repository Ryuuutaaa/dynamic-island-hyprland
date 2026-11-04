import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Gdk from 'gi://Gdk?version=3.0';
import Gtk from 'gi://Gtk?version=3.0';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';
import Audio from 'resource:///com/github/Aylur/ags/service/audio.js';
import CONFIG from '../config.js';
import { palette, hexToRgb } from '../theme.js';
import { showTransient, page } from '../state.js';
import { roundedRect } from '../draw.js';
import { eventButton, eventX } from './pointer.js';

const BAR_HEIGHT = 6;
// Area klik/geser lebih tinggi dari bar: 5px terlalu tipis untuk ditunjuk.
const BAR_HIT = 18;
const BAR_WIDTH = 110;
const TRACK_RGB = hexToRgb(palette.fg);
const FILL_RGB = hexToRgb(palette.accent2);

const valueLabel = () => Widget.Label({ className: 'dyn-island-osd-value' });
const iconLabel = () => Widget.Label({ className: 'dyn-island-osd-icon' });

// Bar digambar manual, bukan Gtk.ProgressBar: AGS menambahkan child ke Box
// dengan fill=TRUE (valign/vpack diabaikan), jadi Gtk.ProgressBar selalu
// diregangkan setinggi box dan trough-nya jatuh ke bawah. Dengan DrawingArea
// kita selalu menggambar di tengah tinggi yang diberikan.
// `onSet` menerima fraksi 0..1 saat bar diklik/digeser. Area interaksi dibuat
// 18px (bar tetap digambar 5px di tengah) supaya mudah ditunjuk; ada knob kecil
// di ujung isi sebagai petunjuk bahwa bar bisa digeser.
const bar = (onSet = null) => {
    let fraction = 0;
    let dragging = false;

    return Widget.DrawingArea({
        className: 'dyn-island-bar',
        hexpand: true,
        setup: self => {
            // DrawingArea tidak punya natural size: tanpa ini lebarnya kolaps
            // (hexpand diabaikan karena AGS menambah child dengan expand=FALSE)
            self.set_size_request(BAR_WIDTH, BAR_HIT);
            self.setFraction = (value) => {
                const next = Math.max(0, Math.min(1, value || 0));
                if (next === fraction) return;
                fraction = next;
                self.queue_draw();
            };

            if (!onSet) return;

            self.add_events(Gdk.EventMask.BUTTON_PRESS_MASK
                | Gdk.EventMask.BUTTON1_MOTION_MASK
                | Gdk.EventMask.BUTTON_RELEASE_MASK);

            const apply = event => {
                const area = self.get_allocation();
                const ratio = Math.min(1, Math.max(0, eventX(event) / Math.max(1, area.width)));
                self.setFraction(ratio);
                onSet(ratio);
            };

            self.connect('button-press-event', (_widget, event) => {
                if (eventButton(event) !== 1) return false;
                dragging = true;
                apply(event);
                return true;
            });
            self.connect('motion-notify-event', (_widget, event) => {
                if (!dragging) return false;
                apply(event);
                return true;
            });
            self.connect('button-release-event', () => {
                if (!dragging) return false;
                dragging = false;
                return true;
            });
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

            // knob: titik terang di ujung isi, petunjuk bar bisa digeser
            const knob = Math.min(width - 2, Math.max(2, filled));
            cr.arc(knob, height / 2, 4.2, 0, Math.PI * 2);
            cr.setSourceRGBA(TRACK_RGB[0], TRACK_RGB[1], TRACK_RGB[2], 0.95);
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
    const progress = bar(value => {
        const speaker = Audio.speaker;
        if (!speaker) return;
        if (value > 0 && speaker.is_muted) speaker.is_muted = false;
        speaker.volume = value;
    });

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
                // Saat halaman bluetooth aktif, slider/mute di sana sudah
                // menampilkan volume; jangan ganti halamannya dengan OSD
                // transient (page akan tertutup 1.6 detik tiap perubahan).
                if (last !== null && mark !== null && mark !== last && page.value !== 'bluetooth')
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
    const path = backlightPath();
    const max = path ? (readNumber(`${path}/max_brightness`) || 1) : 1;

    // brightnessctl dipakai (bukan tulis sysfs langsung): file brightness milik
    // root:video dan user ini tidak ada di grup video. brightnessctl setuid root
    // dan sudah menjadi jalur resmi pengaturan backlight di mesin ini.
    const progress = bar(value => {
        if (!path) return;
        const percent = Math.round(value * 100);
        label.label = `${percent}%`;
        progress.setFraction(percent / 100);
        Utils.execAsync(['brightnessctl', 'set', `${percent}%`]).catch(error =>
            console.log(`[dyn-island] brightnessctl gagal: ${error}`));
    });
    icon.label = '\uf185';

    return Widget.Box({
        className: 'dyn-island-osd',
        spacing: 10,
        // compact & center: OSD juga dipakai di dalam kartu besar saat hover
        halign: Gtk.Align.CENTER,
        children: [icon, progress, label],
        setup: self => {
            if (!path) {
                label.label = '—';
                return;
            }
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
