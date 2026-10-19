#!/usr/bin/env bash
# Uji popup notifikasi island (butuh sesi TIDAK terkunci).
#
#   ./tools/test-popup.sh
#
# Memeriksa: slide masuk/keluar (margin kartu), loading bar 5 detik yang
# menyusut, auto-hide, tombol X, klik badan -> ActionInvoked(default), dan
# action "Install" yang tampil sebagai ikon unduh.
set -u

cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1
SP="/tmp/dyn-island-popup-test"
mkdir -p "$SP"

JS_LAYER='to_entries[].value.levels|to_entries[]|.value[]|select(.namespace=="dyn-island-notif-popup")|"\(.x) \(.y) \(.w) \(.h)"'
J() { timeout 20 ags -r "$1" 2>&1 | tail -1; }
LAYER() { hyprctl layers -j | jq -r "$JS_LAYER" | head -1; }
STATE() { J "const d=globalThis.dynIsland; const w=d.notifPopup; const a=w.popupAdj; return 'visible='+w.visible+' scroll='+Math.round(a.value)+'/'+Math.round(a.upper)+'/'+Math.round(a.page_size)+' win='+w.get_allocated_width()+'x'+w.get_allocated_height()"; }
send() { timeout 6 notify-send -t 5000 "$@" >/dev/null 2>&1 & }

if [ "$(J "const d=globalThis.dynIsland; return d && d.notifPopup ? 'ok' : 'no'")" != "ok" ]; then
    echo "x  AGS/island tidak jalan"; exit 1
fi
if pgrep -x hyprlock >/dev/null 2>&1; then
    echo "!  hyprlock sedang aktif — buka lock dulu, kalau tidak layer surface tidak dirender"
fi

echo "== 0. state awal =="
echo "  popup   : $(J "const d=globalThis.dynIsland; return typeof d.notifPopup")"
echo "  dnd     : $(swaync-client -D 2>&1 | tail -1)   (harus true: popup swaync dimatikan)"
echo "  layer   : '$(LAYER)'"
echo "  swaync  : '$(hyprctl layers -j | jq -r 'to_entries[].value.levels|to_entries[]|.value[]|select(.namespace|test("swaync-notification"))|"\(.w)x\(.h)"' | head -1)'"

echo
echo "== 1. slide masuk dari kanan =="
send -a 'WhatsApp' -i whatsapp 'Pesan baru' 'Halo, ini tes popup island.'
for t in 0.06 0.12 0.2 0.3 0.5; do
    sleep "$t"
    echo "  +${t}s  $(STATE)"
done
read -r PX PY PW PH <<< "$(LAYER)"
echo "  layer: ${PX:-?},${PY:-?} ${PW:-?}x${PH:-?}"
[ -n "${PX:-}" ] && { grim -g "$((PX - 12)),$((PY - 8)) $((PW + 24))x$((PH + 24))" "$SP/popup.png"; echo "  screenshot: $SP/popup.png"; }

echo
echo "== 2. loading bar menyusut =="
sample() { grim -g "$PX,$PY ${PW}x${PH}" "$SP/bar.png" >/dev/null 2>&1; convert "$SP/bar.png" -format "%[pixel:p{60,$1}]" info: 2>/dev/null; }
Y=$((PH - 23))
echo "  t≈0.7s: $(sample "$Y")"
sleep 1.8
echo "  t≈2.5s: $(sample "$Y")  ujung kanan: $(grim -g "$PX,$PY ${PW}x${PH}" "$SP/bar.png" >/dev/null 2>&1; convert "$SP/bar.png" -format "%[pixel:p{$((PW-22)),$Y}]" info:)"

echo
echo "== 3. auto-hide (5 detik) =="
sleep 3.0
echo "  $(STATE) | layer: '$(LAYER)'"

echo
echo "== 4. action Install -> ikon unduh =="
send -a 'Update' -i system-software-update -A install=Install -A later=Nanti 'Pembaruan tersedia' 'Paket siap dipasang.'
sleep 0.8
read -r PX PY PW PH <<< "$(LAYER)"
echo "  chips: $(J "const d=globalThis.dynIsland; const walk=(x,p)=>{ if(p(x)) return x; const c=x.get_children?x.get_children():[]; for(const k of c){const r=walk(k,p); if(r) return r;} return null; }; const rows=walk(d.notifPopup,w=>w.get_style_context().has_class('dyn-island-popup-actions')); if(!rows) return 'TIDAK ADA'; return rows.get_children().map(b=>{const l=b.get_child().label; return Array.from(l).map(c=>'U+'+c.codePointAt(0).toString(16)).join('');}).join(' | ')")"
echo "  (U+f019 = glyph unduh, sisanya teks)"

echo
echo "== 5. klik badan -> ActionInvoked(default) =="
timeout 3 dbus-monitor --session "interface=org.freedesktop.Notifications,member=ActionInvoked" > "$SP/action.log" 2>&1 &
MON=$!
sleep 0.4
python3 tools/uinput-click.py click "$((PX + 120))" "$((PY + 40))" 70 400 >/dev/null 2>&1
sleep 0.9
kill "$MON" 2>/dev/null || true
echo "  signal: $(grep -c 'member=ActionInvoked' "$SP/action.log" 2>/dev/null) | $(grep -o 'uint32 [0-9]*' "$SP/action.log" | tail -1)"
echo "  $(STATE)"

echo
echo "== 6. tombol X =="
send -a 'WhatsApp' -i whatsapp 'Pesan lain' 'Tutup lewat tombol X.'
sleep 0.8
read -r PX PY PW PH <<< "$(LAYER)"
[ -n "${PX:-}" ] && python3 tools/uinput-click.py click "$((PX + PW - 40))" "$((PY + 24))" 70 400 >/dev/null 2>&1
sleep 1.0
echo "  $(STATE) | layer: '$(LAYER)'"

echo
echo "== 7. ringkasan =="
echo "  dnd: $(swaync-client -D 2>&1 | tail -1) | swaync popup: '$(hyprctl layers -j | jq -r 'to_entries[].value.levels|to_entries[]|.value[]|select(.namespace|test("swaync-notification"))|"\(.w)x\(.h)"' | head -1)'"
echo "  error log: $(grep -acE 'ERROR|CRITICAL' ~/.cache/ags-dynamic-island.log)"
echo "  kembalikan popup swaync: swaync-client -df"
