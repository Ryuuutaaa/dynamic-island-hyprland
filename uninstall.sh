#!/usr/bin/env bash
set -euo pipefail

AGS_DIR="${HOME}/.config/ags"
LINK="${AGS_DIR}/dynamic-iland"
CONFIG="${AGS_DIR}/config.js"
WAYBAR_STYLE="$(readlink -f "${HOME}/.config/waybar/style.css" 2>/dev/null || true)"

# Blok ber-marker: hapus bloknya + satu baris kosong pemisah tepat sebelumnya,
# supaya hasilnya persis seperti sebelum install (bukan menyisakan baris kosong).
remove_marked_block() {
    local file="$1" tmp
    tmp="$(mktemp)"
    awk '
        /^\/\* dyn-island: begin/ {
            inblock = 1
            if (n > 0 && line[n - 1] == "") n--
            next
        }
        inblock {
            if ($0 ~ /^\/\* dyn-island: end/) inblock = 0
            next
        }
        { line[n++] = $0 }
        END { for (i = 0; i < n; i++) print line[i] }
    ' "$file" > "$tmp" && mv "$tmp" "$file"
}

# Blok format lama (hasil script versi lama) tidak punya marker akhir: hapus
# dari penanda sampai dua kurung tutup berikutnya (akhir .modules-left/.modules-right
# lalu .modules-center), supaya CSS user setelah blok itu selamat.
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

if [[ -f "$CONFIG" ]] && grep -q "dyn-island" "$CONFIG"; then
    grep -v "dyn-island" "$CONFIG" > "${CONFIG}.tmp" && mv "${CONFIG}.tmp" "$CONFIG"
    echo "-  import dihapus dari config.js"
fi

# keybind panah di Hyprland (versi submap dan versi bindn lama)
HYPR_KEYS="${HOME}/.config/hypr/UserConfigs/UserKeybinds.conf"
if [[ -f "$HYPR_KEYS" ]]; then
    removed=0
    if grep -q '^# dyn-island-kbd: begin' "$HYPR_KEYS"; then
        sed -i '/^# dyn-island-kbd: begin/,/^# dyn-island-kbd: end/d' "$HYPR_KEYS"
        removed=1
    fi
    if grep -q '^# dyn-island: begin' "$HYPR_KEYS"; then
        sed -i '/^# dyn-island: begin/,/^# dyn-island: end/d' "$HYPR_KEYS"
        removed=1
    fi
    if (( removed )); then
        hyprctl dispatch submap reset >/dev/null 2>&1 || true
        hyprctl reload >/dev/null 2>&1 || true
        echo "-  keybind panah dihapus dari UserKeybinds.conf"
    fi
fi

# notch lockscreen (hyprlock)
HYPRLOCK_CONF="${HOME}/.config/hypr/hyprlock.conf"
if [[ -f "$HYPRLOCK_CONF" ]] && grep -q '^# dyn-island-lock: begin' "$HYPRLOCK_CONF"; then
    sed -i '/^# dyn-island-lock: begin/,/^# dyn-island-lock: end/d' "$HYPRLOCK_CONF"
    echo "-  notch lockscreen dihapus dari hyprlock.conf"
fi

# muted popup swaync (notification-visibility)
SWAYNC_CONFIG="${HOME}/.config/swaync/config.json"
if [[ -f "$SWAYNC_CONFIG" ]] && grep -q '"dyn-island-all"' "$SWAYNC_CONFIG"; then
    python3 - "$SWAYNC_CONFIG" <<'PYJSON'
import json
import sys

path = sys.argv[1]
with open(path, encoding="utf-8") as handle:
    cfg = json.load(handle)
vis = cfg.get("notification-visibility")
if isinstance(vis, dict):
    vis.pop("dyn-island-all", None)
    if not vis:
        cfg.pop("notification-visibility", None)
with open(path, "w", encoding="utf-8") as handle:
    json.dump(cfg, handle, indent=2, ensure_ascii=False)
PYJSON
    swaync-client -R >/dev/null 2>&1 || true
    echo "-  muting popup swaync dihapus"
fi

# gaya popup notifikasi (swaync)
SWAYNC_STYLE="${HOME}/.config/swaync/style.css"
if [[ -f "$SWAYNC_STYLE" ]] && grep -q 'dyn-island-notif: begin' "$SWAYNC_STYLE"; then
    sed -i '/^\/\* dyn-island-notif: begin/,/^\/\* dyn-island-notif: end \*\//d' "$SWAYNC_STYLE"
    swaync-client -rs >/dev/null 2>&1 || true
    echo "-  gaya popup swaync dihapus (swaync-client -rs)"
fi

if [[ -n "$WAYBAR_STYLE" && -f "$WAYBAR_STYLE" ]] && grep -q "dyn-island" "$WAYBAR_STYLE"; then
    if grep -q "dyn-island: end" "$WAYBAR_STYLE"; then
        # format ber-marker: hapus blok-nya saja, CSS user sesudahnya tidak ikut
        remove_marked_block "$WAYBAR_STYLE"
    else
        # format lama: blok ditulis setelahnya tanpa marker, hapus blok-nya saja
        drop_legacy_block "$WAYBAR_STYLE"
    fi
    echo "-  blok penyeimbang tinggi dihapus dari CSS waybar"
fi

if [[ -L "$LINK" ]]; then
    rm "$LINK"
    echo "-  symlink dihapus: ${LINK}"
fi

if pgrep -x waybar > /dev/null 2>&1; then
    pkill -x waybar || true
    sleep 1
    (setsid nohup waybar > /dev/null 2>&1 < /dev/null &) || true
    echo "+  waybar direstart"
fi

if pgrep -f "com.github.Aylur.ags" > /dev/null 2>&1; then
    ags quit > /dev/null 2>&1 || true
    sleep 1
    (setsid nohup ags > /dev/null 2>&1 < /dev/null &) || true
    echo "+  AGS direstart"
else
    echo "•  AGS tidak sedang berjalan"
fi
