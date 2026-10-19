import Gdk from 'gi://Gdk?version=3.0';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';
import Mpris from 'resource:///com/github/Aylur/ags/service/mpris.js';
import { palette, hexToRgb } from '../theme.js';
import { roundedRect } from '../draw.js';

const FG = hexToRgb(palette.fg);
const ACCENT = hexToRgb(palette.accent2);

export const activePlayer = () =>
    Mpris.players.find(player => player.play_back_status === 'Playing')
    || Mpris.players[0]
    || null;

// Progress bar digambar Cairo (GTK3 tidak bisa animasi width via CSS).
// Posisi di-poll dari MPRIS; kalau player tidak mendukung, tetap 0.
// Bisa diklik untuk lompat ke posisi itu (player yang tidak mendukung
// SetPosition akan melempar error yang ditangkap, bukan crash).
export default function Progress(width = 150) {
    let fraction = 0;

    return Widget.DrawingArea({
        className: 'dyn-island-progress',
        setup: self => {
            self.set_size_request(width, 4);
            self.tooltipText = 'Klik untuk melompat ke posisi itu';
            // DrawingArea tidak meminta event tombol secara default — tanpa ini
            // handler button-press-event tidak pernah dipanggil
            self.add_events(Gdk.EventMask.BUTTON_PRESS_MASK);
            Utils.interval(1000, () => {
                const player = activePlayer();
                const length = player?.length ?? 0;
                const position = player?.position ?? 0;
                // AGS: length & position sama-sama DETIK (mpris:length / 1e6),
                // length = -1 kalau player tidak melaporkannya
                const next = length > 0 ? Math.max(0, Math.min(1, position / length)) : 0;
                if (Math.abs(next - fraction) < 0.005) return;
                fraction = next;
                self.queue_draw();
            }, self);
            self.connect('button-press-event', (_widget, event) => {
                if (event.button !== 1) return false;
                const player = activePlayer();
                const length = player?.length ?? 0;
                if (!player || length <= 0) return false;
                const area = self.get_allocation();
                const ratio = Math.min(1, Math.max(0, event.x / Math.max(1, area.width)));
                try {
                    player.position = ratio * length;
                } catch (error) {
                    console.log(`[dyn-island] seek tidak didukung player: ${error}`);
                }
                return true;
            });
        },
        drawFn: (self, cr, w, height) => {
            const barH = 4;
            const y = (height - barH) / 2;
            const player = activePlayer();
            const known = (player?.length ?? 0) > 0;
            // panjang tidak diketahui (mis. stream/video): bar diredupkan
            cr.setSourceRGBA(FG[0], FG[1], FG[2], known ? 0.16 : 0.08);
            roundedRect(cr, 0, y, w, barH, barH / 2);
            cr.fill();
            if (!known || fraction <= 0) return;
            cr.setSourceRGBA(ACCENT[0], ACCENT[1], ACCENT[2], 1);
            roundedRect(cr, 0, y, Math.max(barH, w * fraction), barH, barH / 2);
            cr.fill();
        },
    });
}
