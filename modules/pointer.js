// GJS tidak mengekspos field GdkEvent (`event.x`, `event.button`, `event.detail`
// semuanya undefined di AGS/GTK3 ini). Method gdk_event_get_* tetap tersedia,
// jadi semua handler yang butuh tombol/koordinat memakai helper ini.

export const eventButton = event => {
    try {
        const result = event.get_button?.();
        if (Array.isArray(result)) return result[0] ? result[1] : -1;
    } catch (_) { }
    return typeof event.button === 'number' ? event.button : -1;
};

export const eventX = event => {
    try {
        const result = event.get_coords?.();
        if (Array.isArray(result) && result[0]) return result[1];
    } catch (_) { }
    return typeof event.x === 'number' ? event.x : 0;
};

export const eventY = event => {
    try {
        const result = event.get_coords?.();
        if (Array.isArray(result) && result[0]) return result[2];
    } catch (_) { }
    return typeof event.y === 'number' ? event.y : 0;
};

// Koordinat root tidak ikut bergeser saat kartu digeser; dipakai untuk
// gesture drag supaya ambang 60px mengukur gerakan pointer, bukan gerakan
// kartu yang mengikuti pointer.
export const rootX = event => {
    try {
        const result = event.get_root_coords?.();
        if (Array.isArray(result) && result[0]) return result[1];
    } catch (_) { }
    return eventX(event);
};

export const rootY = event => {
    try {
        const result = event.get_root_coords?.();
        if (Array.isArray(result) && result[0]) return result[2];
    } catch (_) { }
    return eventY(event);
};

// Roda mouse klasik mengirim event diskret: get_scroll_deltas() mengembalikan
// [false, 0, 0], jadi arah harus dibaca dari get_scroll_direction()
// (GDK_SCROLL_UP = 0, GDK_SCROLL_DOWN = 1). Trackpad tetap memakai delta
// halusnya. Nilai positif = gulir ke bawah.
export const scrollDelta = event => {
    try {
        const deltas = event.get_scroll_deltas?.();
        if (Array.isArray(deltas) && deltas[0]) {
            const value = Number(deltas[2]) || 0;
            if (value) return value;
        }
    } catch (_) { }
    try {
        const result = event.get_scroll_direction?.();
        if (Array.isArray(result) && result[0]) {
            if (result[1] === 0) return -1;
            if (result[1] === 1) return 1;
        }
    } catch (_) { }
    return 0;
};
