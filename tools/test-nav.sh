#!/usr/bin/env bash
# Uji regresi navigasi dynamic-island dengan klik mouse nyata (uinput).
#
#   ./tools/test-nav.sh [rounds]
#
# Menguji: klik tunggal next/prev di beberapa halaman, dua klik cepat (geser
# 6px seperti mouse manusia), klik titik-titik (tidak boleh navigasi), dan
# klik di luar island (harus menutup notch).
#
# Butuh: /dev/uinput bisa ditulis (grup `input`), AGS jalan, python3.
set -euo pipefail

ROUNDS="${1:-3}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLICK="$HERE/uinput-click.py"
J() { timeout 20 ags -r "$1" 2>&1 | tail -1; }

if [[ ! -w /dev/uinput ]]; then
    echo "x  /dev/uinput tidak bisa ditulis — tambahkan user ke grup 'input'." >&2
    exit 1
fi

# Geometri: island selalu di tengah monitor yang fokus. Posisi panah/titik
# DIUKUR dari widget (bukan asumsi offset): jumlah dot berubah-ubah, dan pill
# yang lebih sempit menggeser panah beberapa px.
CX=$(hyprctl monitors -j | jq -r '.[]|select(.focused)|(.x + .width/2)' | cut -d. -f1)
LAYERPOS() { hyprctl layers -j | jq -r 'to_entries[].value.levels|to_entries[]|.value[]|select(.namespace=="dynamic-island")|"\(.x) \(.w)"' | head -1; }
# NAVPOS <tooltip> -> "localX localY" relatif ke window island
NAVPOS() {
    timeout 20 ags -r "await new Promise(r=>setTimeout(r,10)); const d=globalThis.dynIsland; const walk=(w,p)=>{ if(p(w)) return w; const c=w.get_children?w.get_children():[]; for(const k of c){const r=walk(k,p); if(r) return r;} return null; }; const b=walk(d.window,w=>w.get_mapped&&w.get_mapped()&&w.tooltip_text==='$1'); if(!b) return ''; const a=b.get_allocation(); const [ok,x,y]=b.translate_coordinates(d.window,0,0); return Math.round(x+a.width/2)+' '+Math.round(y+a.height/2);" 2>/dev/null | tail -1
}
CX_L=""; CX_R=""; NY=118
measure_nav() {
    prep media
    python3 "$CLICK" click "$CX" 12 70 400 >/dev/null 2>&1
    sleep 1.1
    local lx lw lp rp
    read -r lx lw <<< "$(LAYERPOS)"
    lp=$(NAVPOS 'Halaman sebelumnya'); rp=$(NAVPOS 'Halaman berikutnya')
    if [[ -n "$lp" && -n "$rp" && -n "$lx" ]]; then
        CX_L=$((CX + ${lp% *} - lw / 2)); NY=${lp#* }
        CX_R=$((CX + ${rp% *} - lw / 2))
        echo "nav terukur: kiri=$CX_L kanan=$CX_R y=$NY (layer x=$lx w=$lw)"
    else
        CX_L=$((CX - 55)); CX_R=$((CX + 54))
        echo "nav tidak terukur, fallback kiri=$CX_L kanan=$CX_R y=$NY"
    fi
}

prep() {
    hyprctl dispatch movecursor "$CX" 700 >/dev/null 2>&1
    timeout 15 ags -r "await new Promise(r=>setTimeout(r,10)); const d=globalThis.dynIsland; d.hovered.value=false; d.pinPage('$1',{sticky:true}); await new Promise(r=>setTimeout(r,350)); return d.page.value" >/dev/null 2>&1
    sleep 0.15
}

page_of() {  # $1 = output tool, $2 = label baris
    printf '%s' "$1" | sed -n "s/.*$2.*: page=\([a-z]*\).*/\1/p"
}

# posisi global panah SAAT INI (nav bergerak selama animasi buka)
ARROW_AT() {  # $1 tooltip
    local pos lx lw
    pos=$(NAVPOS "$1"); [ -z "$pos" ] && return 1
    read -r lx lw <<< "$(LAYERPOS)"
    read -r ax ay <<< "$pos"
    echo "$((lx + ax)) $ay"
}

check_single() {  # label start tooltip expected
    local ok=0 g
    for _ in $(seq 1 "$ROUNDS"); do
        prep "$2"
        # buka island lalu bidik panah di posisi yang terlihat saat itu
        python3 "$CLICK" click "$CX" 12 700 30 >/dev/null 2>&1
        g=$(ARROW_AT "$3")
        [[ -z "$g" ]] && continue
        python3 "$CLICK" click "${g% *}" "${g#* }" 30 40 >/dev/null 2>&1
        sleep 0.45
        [[ "$(J "await new Promise(r=>setTimeout(r,10)); const d=globalThis.dynIsland; return d.page.value")" == "$4" ]] && ok=$((ok + 1))
    done
    printf '  %-34s %d/%d\n' "$1" "$ok" "$ROUNDS"
}

check_rapid() {  # label start tooltip expected (dua klik cepat)
    local ok=0 g
    for _ in $(seq 1 "$ROUNDS"); do
        prep "$2"
        python3 "$CLICK" click "$CX" 12 700 30 >/dev/null 2>&1
        g=$(ARROW_AT "$3"); [[ -z "$g" ]] && continue
        python3 "$CLICK" click "${g% *}" "${g#* }" 30 30 >/dev/null 2>&1
        python3 "$CLICK" click "$(( ${g% *} + 6 ))" "${g#* }" 30 30 >/dev/null 2>&1
        sleep 0.45
        [[ "$(J "await new Promise(r=>setTimeout(r,10)); const d=globalThis.dynIsland; return d.page.value")" == "$4" ]] && ok=$((ok + 1))
    done
    printf '  %-34s %d/%d\n' "$1" "$ok" "$ROUNDS"
}

echo
echo "== ukur posisi nav =="
measure_nav
echo
echo "== klik tunggal =="
check_single "media next -> pomodoro"   media    "Halaman berikutnya" pomodoro
check_single "pomodoro next -> water"   pomodoro "Halaman berikutnya" water
check_single "media prev -> idle"       media    "Halaman sebelumnya" idle
check_single "shelf next -> bluetooth"  shelf    "Halaman berikutnya" bluetooth
check_single "bluetooth next -> idle"   bluetooth "Halaman berikutnya" idle

echo
echo "== dua klik cepat (geser 6px) =="
check_rapid "media 2x next -> water"    media    "Halaman berikutnya" water
check_rapid "pomodoro 2x next -> todo"  pomodoro "Halaman berikutnya" todo
check_rapid "water 2x next -> shelf"    water    "Halaman berikutnya" shelf

echo
echo "== klik dots (harus tidak navigasi) =="
prep media
out=$(python3 "$CLICK" flow2 "$CX" 12 "$CX" $((CX + 2)) "$NY" 150 450 2>&1)
got=$(page_of "$out" 'akhir')
[[ "$got" == "media" ]] && echo "  ok (tetap media)" || echo "  x  berubah jadi ${got:-?}"

echo
echo "== lirik = sub-tampilan media =="
prep media
python3 "$CLICK" click "$CX" 12 70 400 >/dev/null 2>&1
sleep 0.9
POS=$(timeout 20 ags -r "await new Promise(r=>setTimeout(r,10)); const d=globalThis.dynIsland; const walk=(w,p)=>{ if(p(w)) return w; const c=w.get_children?w.get_children():[]; for(const k of c){const r=walk(k,p); if(r) return r;} return null; }; const b=walk(d.window,w=>w.get_mapped&&w.get_mapped()&&w.tooltip_text==='Tampilkan lirik'); if(!b) return ''; const a=b.get_allocation(); const [ok,x,y]=b.translate_coordinates(d.window,0,0); return Math.round(x+a.width/2)+','+Math.round(y+a.height/2);" 2>/dev/null | tail -1)
if [[ -n "$POS" ]]; then
    IFS=, read -r bx by <<< "$POS"
    LX=$(hyprctl layers -j | jq -r 'to_entries[].value.levels|to_entries[]|.value[]|select(.namespace=="dynamic-island")|.x' | head -1)
    python3 "$CLICK" click "$((LX + bx))" "$by" 70 400 >/dev/null 2>&1
    sleep 1.0
    echo "  buka lirik: $(timeout 15 ags -r "await new Promise(r=>setTimeout(r,10)); const d=globalThis.dynIsland; return 'page='+d.page.value+' view='+d.mediaView.value+' geo='+Math.round(d.geo.w)+'x'+Math.round(d.geo.h)+' nav='+d.nav.visible" 2>/dev/null | tail -1)"
    python3 "$CLICK" flow "$CX" 12 "$CX_L" "$NY" 450 70 >/dev/null 2>&1
    sleep 0.6
    echo "  panah kiri: $(timeout 15 ags -r "await new Promise(r=>setTimeout(r,10)); const d=globalThis.dynIsland; return 'page='+d.page.value+' view='+d.mediaView.value+' geo='+Math.round(d.geo.w)" 2>/dev/null | tail -1)"
else
    echo "  -  tombol lirik tidak ditemukan (tidak ada player)"
fi

echo
echo "== klik di luar island (harus menutup notch) =="
prep media
python3 "$CLICK" click "$CX" 12 70 400 >/dev/null 2>&1
sleep 0.3
python3 "$CLICK" click "$CX" 700 70 300 >/dev/null 2>&1
sleep 0.3
timeout 15 ags -r "await new Promise(r=>setTimeout(r,10)); const d=globalThis.dynIsland; return 'hovered=' + d.hovered.value + ' geo=' + Math.round(d.geo.w)" 2>/dev/null | tail -1

hyprctl dispatch movecursor "$CX" 700 >/dev/null 2>&1
echo
echo "selesai."
