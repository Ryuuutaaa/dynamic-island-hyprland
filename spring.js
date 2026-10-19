import GLib from 'gi://GLib';

const FRAME_MS = 16;

// Ramp 0..1 dengan ease-out cubic, dijalankan per frame lewat GLib.timeout_add.
// Dipakai untuk fade opacity konten: easing harus monoton, jadi tween bezier
// dengan overshoot (> 1) tidak cocok di sini.
export function ramp({ duration = 220, onFrame, onDone } = {}) {
    let start = 0;
    let source = 0;

    const frame = () => {
        const now = GLib.get_monotonic_time() / 1000;
        const q = Math.min(1, Math.max(0, (now - start) / duration));
        if (onFrame) onFrame(1 - Math.pow(1 - q, 3));
        if (q >= 1) {
            source = 0;
            if (onDone) onDone();
            return GLib.SOURCE_REMOVE;
        }
        return GLib.SOURCE_CONTINUE;
    };

    return {
        start() {
            if (source) return;
            start = GLib.get_monotonic_time() / 1000;
            source = GLib.timeout_add(GLib.PRIORITY_DEFAULT, FRAME_MS, frame);
        },
        stop() {
            if (!source) return;
            GLib.source_remove(source);
            source = 0;
        },
        get running() { return source !== 0; },
    };
}

// Cubic-bezier tween (kurva easing CSS), supaya motion notch sama persis
// dengan `cubic-bezier(.34,1.32,.5,1)` milik Nusa. Sumbu X = waktu,
// sumbu Y = progres (boleh > 1 = overshoot).
const bezierAxis = (t, p1, p2) => {
    const u = 1 - t;
    return 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t;
};

const bezierSolve = (x, x1, x2) => {
    let lo = 0;
    let hi = 1;
    let t = x;
    for (let i = 0; i < 20; i++) {
        const v = bezierAxis(t, x1, x2);
        if (Math.abs(v - x) < 0.0005) break;
        if (v < x) lo = t;
        else hi = t;
        t = (lo + hi) / 2;
    }
    return t;
};

export function bezierTween({
    duration = 620,
    curve = [0.34, 1.32, 0.5, 1],
    onFrame,
    onDone,
} = {}) {
    const [x1, y1, x2, y2] = curve;
    let start = 0;
    let source = 0;

    const frame = () => {
        const now = GLib.get_monotonic_time() / 1000;
        const q = Math.min(1, Math.max(0, (now - start) / duration));
        const t = bezierSolve(q, x1, x2);
        if (onFrame) onFrame(bezierAxis(t, y1, y2));
        if (q >= 1) {
            source = 0;
            if (onDone) onDone();
            return GLib.SOURCE_REMOVE;
        }
        return GLib.SOURCE_CONTINUE;
    };

    return {
        start() {
            if (source) return;
            start = GLib.get_monotonic_time() / 1000;
            source = GLib.timeout_add(GLib.PRIORITY_DEFAULT, FRAME_MS, frame);
        },
        stop() {
            if (!source) return;
            GLib.source_remove(source);
            source = 0;
        },
        get running() { return source !== 0; },
    };
}
