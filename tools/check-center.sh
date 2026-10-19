#!/usr/bin/env bash
# Verifikasi apakah dynamic island benar-benar berada di tengah monitornya.
# Membandingkan center layer surface island dengan center monitor.
set -euo pipefail

layers="$(hyprctl layers -j)"
monitors="$(hyprctl monitors -j)"

echo "== dynamic island centering check =="
echo

found=0
# nilai dibaca sebagai kolom TSV, bukan `eval` atas string yang dibangun dari
# data JSON (nama monitor bisa berisi karakter shell)
while IFS=$'\t' read -r name mx mwidth ix iw iy ih; do
    [[ -z "$name" ]] && continue
    found=1
    printf 'monitor %-8s width=%-5s origin_x=%-6s center=%-6s\n' \
        "$name" "$mwidth" "$mx" "$(( mx + mwidth / 2 ))"
    printf '  island  x=%-6s w=%-5s y=%-3s h=%-3s       center=%-6s\n' \
        "$ix" "$iw" "$iy" "$ih" "$(( ix + iw / 2 ))"
    printf '  OFFSET  = %s px\n\n' "$(( ix + iw / 2 - (mx + mwidth / 2) ))"
done < <(
    jq -r --slurpfile mon <(echo "$monitors") '
        to_entries[] | .key as $m | .value.levels | to_entries[] | .value[]
        | select(.namespace=="dynamic-island")
        | ($mon[0][] | select(.name==$m)) as $mo
        | [$m, $mo.x, $mo.width, .x, .w, .y, .h] | @tsv
    ' <<< "$layers"
)

if [[ "$found" -eq 0 ]]; then
    echo "x  window 'dynamic-island' tidak ditemukan (AGS jalan?)."
    exit 1
fi

echo "OFFSET 0 px = tepat di tengah. Nilai positif = geser ke kanan."
