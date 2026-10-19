#!/usr/bin/env bash
# Analisis cepat: untuk satu gambar pill, laporkan setiap elemen
# (run kolom yang berisi) beserta rentang y dan titik tengah vertikalnya.
# Pemakaian: analyze-pill.sh <gambar.png>
set -euo pipefail

img="$1"

convert "$img" -depth 8 txt:- | awk -F'[,:() ]+' '
NR==1 { next }
{
    x=$1; y=$2; r=$3; g=$4; b=$5
    v=(r>g?r:g); v=(v>b?v:b)
    if (x>W) W=x
    if (y>H) H=y
    if (v>35) {
        if (ymin[x]=="" || y<ymin[x]) ymin[x]=y
        if (y>ymax[x]) ymax[x]=y
        if (v>colmax[x]) colmax[x]=v
    }
}
END {
    printf "gambar: %dx%d  (center vertikal = %.1f)\n", W+1, H+1, (H)/2
    run=0
    for (x=0; x<=W+1; x++) {
        if (colmax[x]!="") {
            if (!run) { start=x; run=1; rmin=ymin[x]; rmax=ymax[x] }
            else {
                if (ymin[x]<rmin) rmin=ymin[x]
                if (ymax[x]>rmax) rmax=ymax[x]
            }
        }
        else if (run) {
            printf "  x=%3d..%3d (w=%3d)  y=%2d..%2d  y_center=%5.1f  delta_vs_center=%+.1f\n", \
                start, x-1, x-start, rmin, rmax, (rmin+rmax)/2, (rmin+rmax)/2 - (H)/2
            run=0
        }
    }
}'
