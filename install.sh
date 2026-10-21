#!/usr/bin/env bash
# Pemasang dynamic-island untuk AGS.
#
#   ./install.sh              pasang / perbarui
#   ./install.sh --dry-run    tunjukkan apa yang akan diubah, tanpa menyentuh
#                             file maupun proses (aman untuk inspeksi)
set -euo pipefail

DRY_RUN=0

usage() {
    cat <<'TXT'
Pemakaian: ./install.sh [opsi]

  -n, --dry-run   cetak langkah yang akan dijalankan tanpa mengubah apa pun
  -h, --help      tampilkan bantuan ini

Yang diubah saat mode normal:
  1. symlink ~/.config/ags/dynamic-iland -> folder proyek ini
  2. satu baris import di ~/.config/ags/config.js (dengan backup .dyn-island.bak)
  3. blok CSS ber-marker di theme waybar aktif (dengan backup .dyn-island.bak)
  4. submap `island` (panah kiri/kanan) di Hyprland UserKeybinds.conf
  5. blok gaya popup notifikasi di ~/.config/swaync/style.css (backup .dyn-island.bak)
  6. restart waybar & AGS memakai argumen yang sama seperti proses yang jalan
TXT
}

for arg in "$@"; do
    case "$arg" in
        -n|--dry-run) DRY_RUN=1 ;;
        -h|--help) usage; exit 0 ;;
        *) echo "x  argumen tidak dikenal: ${arg} (coba --help)" >&2; exit 2 ;;
    esac
done

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGS_DIR="${HOME}/.config/ags"
LINK="${AGS_DIR}/dynamic-iland"
CONFIG="${AGS_DIR}/config.js"
IMPORT_LINE="import './dynamic-iland/index.js'; // dyn-island"
MARKER="dyn-island"
WAYBAR_STYLE="$(readlink -f "${HOME}/.config/waybar/style.css" 2>/dev/null || true)"

# act: jalankan perintah, atau cetak saja saat --dry-run
act() {
    if (( DRY_RUN )); then
        echo "   [dry-run] $*"
        return 0
    fi
    "$@"
}

# note: keterangan langkah yang hanya masuk akal saat --dry-run
note() {
    (( DRY_RUN )) && printf '   [dry-run] %s\n' "$*"
    return 0
}

(( DRY_RUN )) && echo "== MODE DRY-RUN: tidak ada file/proses yang diubah ==" && echo

# Blok dyn-island format lama (hasil script versi lama) tidak punya marker
# akhir: hapus dari penanda sampai dua kurung tutup berikutnya, supaya CSS user
# yang ditambahkan setelah blok itu tidak ikut terhapus.
#
# Catatan: penanda versi-lama ini HARUS di kolom 0. Kalau theme sudah dirapikan
# manual (penandanya di-indentasi di dalam rule milik theme), pola tidak cocok
# dan tidak ada yang dihapus — sengaja, karena menghapus dari situ akan merusak
# tanda kurung rule theme tersebut.
drop_legacy_block() {
    local file="$1" tmp
    tmp="$(mktemp)"
    awk '
        drop == 0 && /^\/\* dyn-island: samakan tinggi bar/ { drop = 1; next }
        drop == 1 { if ($0 == "}") drop = 2; next }
        drop == 2 { if ($0 == "}") drop = 0; next }
        { print }
    ' "$file" > "$tmp" && mv "$tmp" "$file"
}

# Predikat read-only: apakah ada blok format lama yang benar-benar bisa dibuang?
# Dipakai supaya pesan install jujur di mode normal maupun --dry-run.
legacy_block_present() {
    local file="$1" tmp
    tmp="$(mktemp)"
    awk '
        drop == 0 && /^\/\* dyn-island: samakan tinggi bar/ { drop = 1; next }
        drop == 1 { if ($0 == "}") drop = 2; next }
        drop == 2 { if ($0 == "}") drop = 0; next }
        { print }
    ' "$file" > "$tmp"
    local result=1
    cmp -s "$file" "$tmp" || result=0
    rm -f "$tmp"
    return "$result"
}

if [[ ! -f "$CONFIG" ]]; then
    echo "x  ${CONFIG} tidak ditemukan — ini bukan instalasi AGS." >&2
    exit 1
fi

# 1. symlink proyek ke config AGS
if [[ -L "$LINK" || -e "$LINK" ]]; then
    echo "•  symlink sudah ada: ${LINK}"
else
    act ln -s "$SRC_DIR" "$LINK"
    echo "+  symlink: ${LINK} -> ${SRC_DIR}"
fi

# 2. sisipkan import ke config.js
if grep -q "$MARKER" "$CONFIG"; then
    echo "•  config.js sudah dipatch"
else
    act cp "$CONFIG" "${CONFIG}.dyn-island.bak"
    echo "+  backup: ${CONFIG}.dyn-island.bak"

    note "menyisipkan '${IMPORT_LINE}' ke ${CONFIG}"
    if (( ! DRY_RUN )); then
        awk -v line="$IMPORT_LINE" '
            { print }
            /^import .*overview.*\.js.;?[[:space:]]*$/ && !done { print line; done = 1 }
        ' "$CONFIG" > "${CONFIG}.tmp" && mv "${CONFIG}.tmp" "$CONFIG"

        if ! grep -q "$MARKER" "$CONFIG"; then
            echo "x  gagal menyisipkan import — cek ${CONFIG}.dyn-island.bak" >&2
            exit 1
        fi
        echo "+  config.js dipatch (1 baris import)"
    fi
fi

# 3. samakan tinggi bar waybar dengan island.
#    Ditambal di akhir file CSS supaya menang cascade; harus dijalankan ulang
#    setiap kali theme waybar diganti. Blok diberi marker begin/end supaya
#    uninstall bisa menghapusnya tanpa menelan CSS lain.
if [[ -n "$WAYBAR_STYLE" && -f "$WAYBAR_STYLE" ]]; then
    if grep -q "dyn-island: end" "$WAYBAR_STYLE"; then
        echo "•  CSS waybar sudah dipatch"
    else
        act cp "$WAYBAR_STYLE" "${WAYBAR_STYLE}.dyn-island.bak"
        if legacy_block_present "$WAYBAR_STYLE"; then
            # blok format lama (tanpa marker akhir): buang bloknya saja dulu,
            # lalu tulis ulang dalam format ber-marker
            act drop_legacy_block "$WAYBAR_STYLE"
            echo "•  blok CSS lama dimigrasi ke format ber-marker"
        elif grep -q "dyn-island" "$WAYBAR_STYLE"; then
            echo "•  penanda 'dyn-island' sudah menyatu di theme (dirapikan manual)"
        fi
        note "menambahkan blok '/* dyn-island: begin ... end */' ke ${WAYBAR_STYLE}"
        if (( ! DRY_RUN )); then
            cat >> "$WAYBAR_STYLE" <<'CSS'

/* dyn-island: begin — jangan hapus marker ini (dipakai uninstall.sh) */
/* samakan tinggi bar dengan dynamic island */
.modules-left,
.modules-right {
	padding-top: 9px;
	padding-bottom: 9px;
}

/* center dikosongkan, island yang mengisi tengah */
.modules-center {
	background-color: transparent;
	border-radius: 0px;
	padding-top: 0px;
	padding-bottom: 0px;
	padding-left: 0px;
	padding-right: 0px;
}
/* dyn-island: end */
CSS
            echo "+  CSS waybar dipatch: ${WAYBAR_STYLE}"
            echo "   backup: ${WAYBAR_STYLE}.dyn-island.bak"
        fi
    fi
else
    echo "!  style.css waybar tidak ditemukan, tinggi bar tidak disamakan"
fi

# 3b. swaync: popup di tengah layar akan bertabrakan dengan notch.
#     Posisi hanya diperingatkan (tidak dipatch otomatis) supaya config user
#     tidak diubah tanpa sepengetahuannya. Gaya popup-nya ikut disamakan
#     dengan notch (append-only, ber-marker, bisa dihapus uninstall).
SWAYNC_CONFIG="${HOME}/.config/swaync/config.json"
if [[ -f "$SWAYNC_CONFIG" ]] && grep -qE '"positionX"[[:space:]]*:[[:space:]]*"center"' "$SWAYNC_CONFIG"; then
    echo "!  swaync positionX masih \"center\" — ubah ke \"right\" supaya notifikasi"
    echo "   tidak menabrak notch: ${SWAYNC_CONFIG}"
fi

# Popup swaync dimatikan TANPA DND: state "muted" -> popup tidak muncul,
# control center tetap menerima, dan DND tetap bebas dipakai user (dulu island
# memaksa `swaync-client -dn` tiap 3 detik sehingga toggle DND selalu kembali).
if [[ -f "$SWAYNC_CONFIG" ]] && ! grep -q '"dyn-island-all"' "$SWAYNC_CONFIG"; then
    act cp "$SWAYNC_CONFIG" "${SWAYNC_CONFIG}.dyn-island.bak"
    note "menambahkan notification-visibility muted ke ${SWAYNC_CONFIG}"
    if (( ! DRY_RUN )); then
        python3 - "$SWAYNC_CONFIG" <<'PYJSON'
import json
import sys

path = sys.argv[1]
with open(path, encoding="utf-8") as handle:
    cfg = json.load(handle)
cfg.setdefault("notification-visibility", {})["dyn-island-all"] = {
    "state": "muted",
    "app-name": ".*",
}
with open(path, "w", encoding="utf-8") as handle:
    json.dump(cfg, handle, indent=2, ensure_ascii=False)
PYJSON
        swaync-client -R >/dev/null 2>&1 || true
        echo "+  popup swaync dimute (DND tetap bebas dipakai)"
    fi
elif [[ -f "$SWAYNC_CONFIG" ]]; then
    echo "•  popup swaync sudah dimute"
fi

SWAYNC_STYLE="${HOME}/.config/swaync/style.css"
if [[ -f "$SWAYNC_STYLE" ]]; then
    if grep -q 'dyn-island-notif: begin' "$SWAYNC_STYLE"; then
        echo "•  gaya popup swaync sudah ada"
    else
        act cp "$SWAYNC_STYLE" "${SWAYNC_STYLE}.dyn-island.bak"
        note "append blok popup notifikasi ke ${SWAYNC_STYLE}"
        if (( ! DRY_RUN )); then
            cat >> "$SWAYNC_STYLE" <<'NOTIF'

/* dyn-island-notif: begin — popup notifikasi (kanan atas) disamakan dengan
   bahasa visual notch: hitam pekat, hairline halus, sudut 14px, teks Noto
   Sans 13px normal (bukan mono bold 16px), tombol tutup redup. Hanya
   `.floating-notifications`; panel control-center tidak diubah. */
.floating-notifications .notification {
    background: rgba(0, 0, 0, 0.94);
    border: 1px solid alpha(@foreground, 0.12);
    border-radius: 14px;
    padding: 11px 13px;
    box-shadow: 0 6px 22px rgba(0, 0, 0, 0.45);
}

.floating-notifications .notification:hover {
    background: rgba(0, 0, 0, 0.97);
    border-color: alpha(@foreground, 0.20);
}

.floating-notifications .notification-row,
.floating-notifications .notification-content,
.floating-notifications .notification-default-action,
.floating-notifications .notification-action {
    border: none;
    border-radius: 14px;
    background: transparent;
    box-shadow: none;
}

.floating-notifications .notification * {
    font-family: "Noto Sans", "DejaVu Sans", sans-serif;
    font-weight: normal;
    font-size: 13px;
}

.floating-notifications .summary {
    color: @foreground;
    margin-bottom: 2px;
}

.floating-notifications .body {
    color: alpha(@foreground, 0.72);
}

.floating-notifications .time {
    color: alpha(@foreground, 0.40);
    font-size: 11px;
}

.floating-notifications .close-button {
    background: alpha(@foreground, 0.10);
    color: alpha(@foreground, 0.65);
    border-radius: 8px;
    margin: 6px;
    padding: 0;
    min-width: 18px;
    min-height: 18px;
}

.floating-notifications .close-button:hover {
    background: alpha(@foreground, 0.18);
    color: @foreground;
    box-shadow: none;
    transition: all .15s ease-in-out;
}
/* dyn-island-notif: end */
NOTIF
            swaync-client -rs >/dev/null 2>&1 || true
            echo "+  popup swaync disamakan dengan notch (swaync-client -rs)"
        fi
    fi
else
    echo "•  swaync tidak terpasang, gaya popup dilewati"
fi

# 3b-2. Panel control-center: kartu notifikasi dulu hanya kebagian ~1,5 kartu
#       karena media player memakan ~160px dari panel 560px. Blok CSS disimpan
#       di repo (swaync/control-center.css) supaya installer cukup append.
if [[ -f "$SWAYNC_STYLE" ]]; then
    if grep -q 'dyn-island-cc: begin' "$SWAYNC_STYLE"; then
        echo "•  gaya control-center swaync sudah ada"
    else
        act cp "$SWAYNC_STYLE" "${SWAYNC_STYLE}.dyn-island.bak"
        note "append blok control-center dari ${SRC_DIR}/swaync/control-center.css"
        if (( ! DRY_RUN )); then
            { echo; cat "${SRC_DIR}/swaync/control-center.css"; } >> "$SWAYNC_STYLE"
            swaync-client -rs >/dev/null 2>&1 || true
            echo "+  control-center disamakan dengan notch (swaync-client -rs)"
        fi
    fi
fi

# Ukuran panel + kartu: dinaikkan hanya kalau masih di bawah target, jadi nilai
# user yang lebih besar tidak ditimpa. Backup .dyn-island-cc.bak dibuat sekali,
# sebelum perubahan pertama, dan dipakai uninstall untuk mengembalikannya.
if [[ -f "$SWAYNC_CONFIG" ]]; then
    if (( DRY_RUN )); then
        note "kecilkan artwork mpris + perbesar tinggi panel/kartu notifikasi bila perlu"
    else
        CC_CHANGED="$(python3 - "$SWAYNC_CONFIG" <<'PYCC'
import json
import os
import shutil
import sys

path = sys.argv[1]
with open(path, encoding="utf-8") as handle:
    cfg = json.load(handle)

changes = []
if cfg.get("control-center-height", 0) < 800:
    cfg["control-center-height"] = 800
    changes.append("control-center-height=800")
if cfg.get("notification-icon-size", 0) < 26:
    cfg["notification-icon-size"] = 26
    changes.append("notification-icon-size=26")
mpris = cfg.setdefault("widget-config", {}).setdefault("mpris", {})
if mpris.get("image-size", 64) > 32:
    mpris["image-size"] = 32
    changes.append("mpris.image-size=32")

if changes:
    backup = path + ".dyn-island-cc.bak"
    if not os.path.exists(backup):
        shutil.copy2(path, backup)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(cfg, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
print(" ".join(changes))
PYCC
)"
        if [[ -n "$CC_CHANGED" ]]; then
            swaync-client -R >/dev/null 2>&1 || true
            echo "+  panel swaync disesuaikan: ${CC_CHANGED}"
        else
            echo "•  ukuran panel swaync sudah sesuai"
        fi
    fi
fi

# 3c. panah keyboard untuk navigasi island. Submap `island` berisi bind
#     *consuming*: selama island terbuka panah tidak diteruskan ke aplikasi
#     yang fokus (YouTube tidak ikut seek); di luar itu panah normal.
HYPR_KEYS="${HOME}/.config/hypr/UserConfigs/UserKeybinds.conf"
if [[ -f "$HYPR_KEYS" ]]; then
    if grep -q 'dyn-island-kbd: begin' "$HYPR_KEYS"; then
        echo "•  keybind panah sudah ada"
    else
        act cp "$HYPR_KEYS" "${HYPR_KEYS}.dyn-island.bak"
        # versi lama memakai bindn (non-consuming) -> buang supaya tidak dobel
        if grep -q '^# dyn-island: begin' "$HYPR_KEYS"; then
            note "menghapus blok bindn lama (non-consuming)"
            if (( ! DRY_RUN )); then
                sed -i '/^# dyn-island: begin/,/^# dyn-island: end/d' "$HYPR_KEYS"
            fi
        fi
        note "menambahkan submap island (panah consuming) ke ${HYPR_KEYS}"
        if (( ! DRY_RUN )); then
            cat >> "$HYPR_KEYS" <<'KEYS'

# dyn-island-kbd: begin — panah kiri/kanan untuk navigasi halaman island.
# Submap `island` hanya aktif saat island terbuka. Di dalamnya panah bersifat
# CONSUMING (bind, bukan bindn), jadi aplikasi fokus -- mis. YouTube -- tidak
# ikut menerima panah. `escape` = jalan keluar manual bila submap tertinggal.
submap = island
bind = , left, exec, ags -r "globalThis.dynIsland.navKey(-1)"
bind = , right, exec, ags -r "globalThis.dynIsland.navKey(1)"
bind = , escape, exec, hyprctl dispatch submap reset
submap = reset
# dyn-island-kbd: end
KEYS
            hyprctl reload >/dev/null 2>&1 || true
            echo "+  keybind panah (submap island) ditambahkan (hyprctl reload)"
        fi
    fi
else
    echo "!  ${HYPR_KEYS} tidak ditemukan, keybind panah dilewati"
fi


# 4. restart bar + shell, memakai argumen yang sama seperti proses yang jalan.
#    Kalau tidak, waybar/AGS yang diluncurkan dengan flag (mis. `waybar -c ... -s ...`
#    atau `ags -c ...`) akan kembali ke konfigurasi default setelah install.
if pgrep -x waybar > /dev/null 2>&1; then
    WAYBAR_ARGS="$(ps -o args= -p "$(pgrep -x waybar | head -1)" 2>/dev/null \
        | sed 's/^[^[:space:]]*waybar//' || true)"
    act pkill -x waybar
    if (( ! DRY_RUN )); then
        sleep 1
        # shellcheck disable=SC2086  # word splitting memang diinginkan di sini
        (setsid nohup waybar $WAYBAR_ARGS > "${HOME}/.cache/waybar-dynisland.log" 2>&1 < /dev/null &) || true
        sleep 1
    fi
    echo "+  waybar direstart${WAYBAR_ARGS:+ (args:${WAYBAR_ARGS})}"
    if (( ! DRY_RUN )) && ! pgrep -x waybar > /dev/null 2>&1; then
        echo "!  waybar tidak kembali jalan — cek ${HOME}/.cache/waybar-dynisland.log" >&2
    fi
fi

AGS_CMD=""
if pgrep -f "com.github.Aylur.ags" > /dev/null 2>&1; then
    # Ambil command line asli peluncur ags (bukan proses gjs-nya) supaya flag
    # seperti -c/-r ikut terbawa; pola di-anchor ke AWAL command line supaya
    # tidak menangkap shell/script lain yang kebetulan memuat kata "ags"
    # (mis. `bash -c '... ags -r ...'`). Fallback ke `ags` polos.
    AGS_CMD="$(pgrep -af '^(/[^ ]*/)?ags([[:space:]]|$)' 2>/dev/null \
        | grep -v 'com.github.Aylur' | head -1 | cut -d' ' -f2- || true)"
    [[ -n "$AGS_CMD" ]] || AGS_CMD="ags"
    act ags quit
    if (( ! DRY_RUN )); then
        sleep 1
        # shellcheck disable=SC2086
        (setsid nohup $AGS_CMD > "${HOME}/.cache/ags-dynamic-island.log" 2>&1 < /dev/null &) || true
        sleep 2
    fi
    if hyprctl layers -j 2>/dev/null | grep -q '"dynamic-island"'; then
        echo "+  dynamic island aktif (via: ${AGS_CMD})"
    else
        echo "!  window belum terdeteksi — cek: ~/.cache/ags-dynamic-island.log" >&2
        echo "   kalau AGS-nya tidak jalan, coba: ags &" >&2
    fi
else
    echo "•  AGS tidak sedang berjalan. Jalankan: ags &"
fi

echo
echo "Geometri bar & island:"
hyprctl layers -j 2>/dev/null | jq -r '[to_entries[]|.value.levels|to_entries[]|.value[]|select(.namespace=="waybar" or .namespace=="dynamic-island")|"  \(.namespace): y=\(.y) h=\(.h)"]|unique[]' 2>/dev/null || true

(( DRY_RUN )) && { echo; echo "== dry-run selesai: tidak ada file maupun proses yang diubah =="; }
exit 0
