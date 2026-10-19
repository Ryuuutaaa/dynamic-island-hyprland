// Helper gambar Cairo yang dipakai bersama oleh bar OSD dan page dots.
export function roundedRect(cr, x, y, width, height, radius) {
    const r = Math.min(radius, height / 2, width / 2);
    cr.newSubPath();
    cr.arc(x + width - r, y + r, r, -Math.PI / 2, 0);
    cr.arc(x + width - r, y + height - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + height - r, r, Math.PI / 2, Math.PI);
    cr.arc(x + r, y + r, r, Math.PI, (3 * Math.PI) / 2);
    cr.closePath();
}
