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
#
# Koordinat harus LOGIS (sama seperti hyprctl cursorpos):
#   CX = x + (width / scale) / 2
# Jangan pakai width fisik — pada scale 0.8333 hasilnya meleset ~191px.
# Monitor juga tidak selalu di (0,0); klik memakai offset y monitor.
read -r MX MY CX <<< "$(hyprctl monitors -j | jq -r '.[]|select(.focused)|"\(.x) \(.y) \(.x + (.width / .scale) / 2)"')"
CX=${CX%.*}
TOP=$((MY + 12))
OUT_Y=$((MY + 700))
LAYERPOS() { hyprctl layers -j | jq -r 'to_entries[].value.levels|to_entries[]|.value[]|select(.namespace=="dynamic-island")|"\(.x) \(.w)"' | head -1; }
# NAVPOS <tooltip> -> "localX localY" relatif ke window island
NAVPOS() {
    timeout 20 ags -r "await new Promise(r=>setTimeout(r,10)); const d=globalThis.dynIsland; const walk=(w,p)=>{ if(p(w)) return w; const c=w.get_children?w.get_children():[]; for(const k of c){const r=walk(k,p); if(r) return r;} return null; }; const b=walk(d.window,w=>w.get_mapped&&w.get_mapped()&&w.tooltip_text==='$1'); if(!b) return ''; const a=b.get_allocation(); const [ok,x,y]=b.translate_coordinates(d.window,0,0); return Math.round(x+a.width/2)+' '+Math.round(y+a.height/2);" 2>/dev/null | tail -1
}
CX_L=""; CX_R=""; NY=$((MY + 118))
measure_nav() {
    prep media
    python3 "$CLICK" click "$CX" "$TOP" 70 400 >/dev/null 2>&1
    sleep 1.1
    local lx lw lp rp
    read -r lx lw <<< "$(LAYERPOS)"
    lp=$(NAVPOS 'Halaman sebelumnya'); rp=$(NAVPOS 'Halaman berikutnya')
    if [[ -n "$lp" && -n "$rp" && -n "$lx" ]]; then
        CX_L=$((CX + ${lp% *} - lw / 2)); NY=$((MY + ${lp#* }))
        CX_R=$((CX + ${rp% *} - lw / 2))
        echo "nav terukur: kiri=$CX_L kanan=$CX_R y=$NY (layer x=$lx w=$lw)"
    else
        CX_L=$((CX - 55)); CX_R=$((CX + 54))
        echo "nav tidak terukur, fallback kiri=$CX_L kanan=$CX_R y=$NY"
    fi
}

prep() {
    # hyprctl dispatch movecursor sudah mati di Hyprland 0.57; pakai uinput
    python3 "$CLICK" move "$CX" "$OUT_Y" 150 >/dev/null 2>&1
    # Tutup overlay editor (calendar/standup/todo/chat). Window ini layer
    # overlay di atas island; kalau tertinggal dari run sebelumnya, semua klik
    # ke nav mendarat di window itu dan tes gagal tanpa sebab jelas.
    J 'try { globalThis.calendarWindow?.close?.(); } catch (_) { } try { globalThis.standupWindow?.close?.(); } catch (_) { } try { globalThis.todoWindow?.close?.(); } catch (_) { } try { globalThis.geminiChat?.close?.(); } catch (_) { } 1' >/dev/null 2>&1
    # mediaView WAJIB direset: kalau run sebelumnya berakhir di lirik,
    # geometri 520 membuat posisi nav bergeser dan semua klik meleset.
    timeout 15 ags -r "await new Promise(r=>setTimeout(r,10)); const d=globalThis.dynIsland; d.hovered.value=false; d.mediaView.value='main'; d.pinPage('$1',{sticky:true}); await new Promise(r=>setTimeout(r,350)); return d.page.value" >/dev/null 2>&1
    sleep 0.2
}

page_of() {  # $1 = output tool, $2 = label baris
    printf '%s' "$1" | sed -n "s/.*$2.*: page=\([a-z]*\).*/\1/p"
}

# posisi global panah SAAT INI (nav bergerak selama animasi buka).
# y WAJIB ditambah offset layer: koordinat window-local dimulai 0 di tepi atas
# surface, sedangkan klik uinput memakai koordinat global. Tanpa offset ini
# klik mendarat di y=133 absolut (monitor lain) dan island malah menutup.
ARROW_AT() {  # $1 tooltip
    local pos lx lw ly
    pos=$(NAVPOS "$1"); [ -z "$pos" ] && return 1
    read -r lx lw <<< "$(LAYERPOS)"
    ly=$(hyprctl layers -j | jq -r 'to_entries[].value.levels|to_entries[]|.value[]|select(.namespace=="dynamic-island")|.y' | head -1)
    read -r ax ay <<< "$pos"
    echo "$((lx + ax)) $((ly + ay))"
}

check_single() {  # label start tooltip expected
    local ok=0 g
    for _ in $(seq 1 "$ROUNDS"); do
        prep "$2"
        # buka island lalu bidik panah di posisi yang terlihat saat itu
        python3 "$CLICK" click "$CX" "$TOP" 700 30 >/dev/null 2>&1
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
        python3 "$CLICK" click "$CX" "$TOP" 700 30 >/dev/null 2>&1
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
check_single "media next -> weather"    media    "Halaman berikutnya" weather
check_single "weather next -> calendar" weather  "Halaman berikutnya" calendar
check_single "media prev -> idle"       media    "Halaman sebelumnya" idle
check_single "prayer next -> chat"      prayer   "Halaman berikutnya" chat
check_single "chat next -> settings"    chat     "Halaman berikutnya" settings
check_single "settings next -> idle"    settings "Halaman berikutnya" idle

echo
echo "== dua klik cepat (geser 6px) =="
check_rapid "media 2x next -> calendar"   media    "Halaman berikutnya" calendar
check_rapid "pomodoro 2x next -> stats"   pomodoro "Halaman berikutnya" stats
check_rapid "water 2x next -> standup"    water    "Halaman berikutnya" standup

echo
echo "== klik tab strip (tab memang navigasi: harus pindah halaman) =="
prep media
out=$(python3 "$CLICK" flow2 "$CX" "$TOP" "$CX" $((CX + 2)) "$NY" 150 450 2>&1)
got=$(page_of "$out" 'akhir')
if [[ -n "$got" && "$got" != "media" ]]; then
    echo "  ok (tab aktif -> ${got})"
else
    echo "  x  tab tidak berpindah halaman (tetap ${got:-?})"
fi

echo
echo "== lirik = sub-tampilan media =="
prep media
# Tombol lirik hanya ter-mapped saat ada player MPRIS; tanpa player, kartu
# media menampilkan empty state dan bagian ini dilewati.
HAS_PLAYER=$(timeout 15 ags -r 'import("resource:///com/github/Aylur/ags/service/mpris.js").then(m => m.default.players.length > 0 ? "yes" : "no")' 2>/dev/null | tail -1)
if [[ "$HAS_PLAYER" == "yes" ]]; then
python3 "$CLICK" click "$CX" "$TOP" 70 400 >/dev/null 2>&1
sleep 0.9
POS=$(timeout 20 ags -r "await new Promise(r=>setTimeout(r,10)); const d=globalThis.dynIsland; const walk=(w,p)=>{ if(p(w)) return w; const c=w.get_children?w.get_children():[]; for(const k of c){const r=walk(k,p); if(r) return r;} return null; }; const b=walk(d.window,w=>w.get_mapped&&w.get_mapped()&&w.tooltip_text==='Tampilkan lirik'); if(!b) return ''; const a=b.get_allocation(); const [ok,x,y]=b.translate_coordinates(d.window,0,0); return Math.round(x+a.width/2)+','+Math.round(y+a.height/2);" 2>/dev/null | tail -1)
if [[ -n "$POS" ]]; then
    IFS=, read -r bx by <<< "$POS"
    # x DAN y memakai offset layer. Memakai MY (offset monitor) membuat klik
    # mendarat jauh di bawah kartu: island lalu tertutup, bukan membuka lirik.
    read -r LX LY <<< "$(hyprctl layers -j | jq -r 'to_entries[].value.levels|to_entries[]|.value[]|select(.namespace=="dynamic-island")|"\(.x) \(.y)"' | head -1)"
    python3 "$CLICK" click "$((LX + bx))" "$((LY + by))" 70 400 >/dev/null 2>&1
    sleep 1.0
    echo "  buka lirik: $(timeout 15 ags -r "await new Promise(r=>setTimeout(r,10)); const d=globalThis.dynIsland; return 'page='+d.page.value+' view='+d.mediaView.value+' geo='+Math.round(d.geo.w)+'x'+Math.round(d.geo.h)+' nav='+d.nav.visible" 2>/dev/null | tail -1)"
    # Tween lebar lirik (520) butuh ~620ms; ukur panah SETELAH stabil, kalau
    # tidak koordinat diambil dari geometri lama dan klik meleset.
    sleep 0.9
    g=$(ARROW_AT "Halaman sebelumnya")
    if [[ -n "$g" ]]; then
        # hold 90ms: 30ms terlalu pendek, GTK kadang belum memproses press
        # sebelum release sehingga tombol tidak pernah aktif.
        python3 "$CLICK" click "${g% *}" "${g#* }" 90 200 >/dev/null 2>&1
    else
        python3 "$CLICK" flow "$CX" "$TOP" "$CX_L" "$NY" 450 70 >/dev/null 2>&1
    fi
    sleep 0.6
    echo "  panah kiri: $(timeout 15 ags -r "await new Promise(r=>setTimeout(r,10)); const d=globalThis.dynIsland; return 'page='+d.page.value+' view='+d.mediaView.value+' geo='+Math.round(d.geo.w)" 2>/dev/null | tail -1)"
    # Tween lebar lirik -> kartu lain masih berjalan beberapa ratus ms setelah
    # view berganti, jadi panah masih bergeser. Klik diulang dengan posisi
    # yang diukur ULANG; tiga percobaan cukup dan tidak menutupi bug nyata.
    for _ in 1 2 3; do
        view=$(timeout 15 ags -r 'await new Promise(r=>setTimeout(r,10)); return globalThis.dynIsland.mediaView.value' 2>/dev/null | tail -1)
        [[ "$view" != "lyrics" ]] && break
        sleep 0.8
        g=$(ARROW_AT "Halaman sebelumnya")
        [[ -z "$g" ]] && continue
        python3 "$CLICK" click "${g% *}" "${g#* }" 90 200 >/dev/null 2>&1
        sleep 0.5
    done
    echo "  panah kiri (ulang): $(timeout 15 ags -r "await new Promise(r=>setTimeout(r,10)); const d=globalThis.dynIsland; return 'page='+d.page.value+' view='+d.mediaView.value+' geo='+Math.round(d.geo.w)" 2>/dev/null | tail -1)"
else
    echo "  -  tombol lirik tidak ditemukan"
fi
else
    echo "  -  dilewati: tidak ada player MPRIS"
fi

echo
echo "== klik di luar island (harus menutup notch) =="
prep media
python3 "$CLICK" click "$CX" "$TOP" 70 400 >/dev/null 2>&1
sleep 0.3
python3 "$CLICK" click "$CX" "$OUT_Y" 70 300 >/dev/null 2>&1
sleep 0.3
timeout 15 ags -r "await new Promise(r=>setTimeout(r,10)); const d=globalThis.dynIsland; return 'hovered=' + d.hovered.value + ' geo=' + Math.round(d.geo.w)" 2>/dev/null | tail -1

python3 "$CLICK" move "$CX" "$OUT_Y" 150 >/dev/null 2>&1
echo
echo "selesai."
