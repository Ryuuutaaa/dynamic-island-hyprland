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
