import GLib from 'gi://GLib';
import Variable from 'resource:///com/github/Aylur/ags/variable.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';
import CONFIG from '../config.js';

// Jeda mata 20-20-20 dan pengingat gerak. Keduanya hanya mengirim notifikasi
// (masuk ke popup island yang sudah ada) dan tidak menyimpan data apa pun.
// Tidak ada request jaringan; timer berhenti sendiri di luar jam kerja.

const DEFAULTS = {
    enabled: true,
    everyMinutes: 20,
    lookSeconds: 20,
    startHour: 8,
    endHour: 22,
    moveEveryMinutes: 60,
    moveEnabled: true,
};

export const wellness = Variable({
    enabled: true,
    eyeLastAt: 0,
    moveLastAt: 0,
    nextEyeAt: 0,
});

const cfg = () => ({ ...DEFAULTS, ...(CONFIG.wellness ?? {}) });

let eyeTimer = 0;
let moveTimer = 0;

const inHours = () => {
    const { startHour, endHour } = cfg();
    const hour = new Date().getHours();
    return hour >= startHour && hour < endHour;
};

const chime = () => {
    Utils.execAsync(['canberra-gtk-play', '-i', 'bell']).catch(() => { });
};

const notify = (summary, body) => {
    Utils.execAsync(['notify-send', '-a', 'Notch', summary, body]).catch(() => { });
};

const fireEye = () => {
    const { lookSeconds } = cfg();
    wellness.value = {
        ...wellness.value,
        eyeLastAt: Date.now(),
        nextEyeAt: Date.now() + cfg().everyMinutes * 60 * 1000,
    };
    notify('Jeda mata 20-20-20',
        `Lihat objek sejauh ~6 meter selama ${lookSeconds} detik.`);
    chime();
};

const fireMove = () => {
    wellness.value = { ...wellness.value, moveLastAt: Date.now() };
    notify('Waktunya gerak', 'Berdiri dan bergerak ringan selama 2 menit.');
};

const arm = () => {
    const options = cfg();
    if (eyeTimer) GLib.source_remove(eyeTimer);
    if (moveTimer) GLib.source_remove(moveTimer);
    eyeTimer = 0;
    moveTimer = 0;

    const enabled = wellness.value.enabled && options.enabled !== false;
    if (!enabled) return;

    eyeTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT,
        Math.max(1, options.everyMinutes) * 60 * 1000, () => {
            eyeTimer = 0;
            if (wellness.value.enabled && inHours()) fireEye();
            arm();
            return GLib.SOURCE_REMOVE;
        });

    if (options.moveEnabled !== false) {
        moveTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT,
            Math.max(5, options.moveEveryMinutes) * 60 * 1000, () => {
                moveTimer = 0;
                if (wellness.value.enabled && inHours()) fireMove();
                arm();
                return GLib.SOURCE_REMOVE;
            });
    }

    wellness.value = { ...wellness.value, nextEyeAt: Date.now() + options.everyMinutes * 60 * 1000 };
};

export function watchWellness() {
    wellness.value = { ...wellness.value, enabled: cfg().enabled !== false };
    arm();
}

export function toggleWellness() {
    wellness.value = { ...wellness.value, enabled: !wellness.value.enabled };
    arm();
    return wellness.value.enabled;
}

export function reminderNow() {
    fireEye();
}
