#!/usr/bin/env bash
# Pencabut dynamic-island.
#
#   ./uninstall.sh            cabut semuanya
#   ./uninstall.sh -n         dry-run: cetak langkah, tidak mengubah apa pun
#   ./uninstall.sh --keep-env jangan hapus API key Gemini (default: dihapus)
#
# Yang dicabut (mengikuti urutan pemasangan):
#   1. import di ~/.config/ags/config.js
#   2. blok CSS ber-marker di theme waybar aktif
#   3. muting popup + gaya popup/control-center swaync (config.json dikembalikan
#      dari backup)
#   4. submap `island` + `chat` di UserKeybinds.lua/.conf (termasuk blok tanpa
#      marker yang ditambahkan manual)
#   5. symlink ~/.config/ags/dynamic-iland
#   6. (opsional) kredensial: ~/.config/dynamic-iland/.env + gemini.json
#
# Data pengguna TIDAK dihapus: todo, water, shelf, prayer, weather, calendar,
# standup, settings, timer. Hapus manual kalau memang ingin bersih total:
#   rm -rf ~/.config/dynamic-iland ~/.local/share/dynamic-iland
set -euo pipefail

DRY_RUN=0
KEEP_ENV=0

usage() {
    cat <<'TXT'
Pemakaian: ./uninstall.sh [opsi]

  -n, --dry-run   cetak langkah yang akan dijalankan tanpa mengubah apa pun
      --keep-env  pertahankan API key Gemini (~/.config/dynamic-iland/.env)
  -h, --help      tampilkan bantuan ini

Data pengguna (todo, air, rak, jadwal, kalender, settings) tidak disentuh.
TXT
}

for arg in "$@"; do
    case "$arg" in
        -n|--dry-run) DRY_RUN=1 ;;
        --keep-env) KEEP_ENV=1 ;;
        -h|--help) usage; exit 0 ;;
        *) echo "x  argumen tidak dikenal: ${arg} (coba --help)" >&2; exit 2 ;;
    esac
done

AGS_DIR="${HOME}/.config/ags"
LINK="${AGS_DIR}/dynamic-iland"
CONFIG="${AGS_DIR}/config.js"
WAYBAR_STYLE="$(readlink -f "${HOME}/.config/waybar/style.css" 2>/dev/null || true)"
SWAYNC_CONFIG="${HOME}/.config/swaync/config.json"
SWAYNC_STYLE="${HOME}/.config/swaync/style.css"
HYPR_KEYS="${HOME}/.config/hypr/UserConfigs/UserKeybinds.conf"
HYPR_KEYS_LUA="${HOME}/.config/hypr/UserConfigs/UserKeybinds.lua"
HYPRLOCK_CONF="${HOME}/.config/hypr/hyprlock.conf"
CONFIG_DIR="${HOME}/.config/dynamic-iland"

act() {
    if (( DRY_RUN )); then
        echo "   [dry-run] $*"
        return 0
    fi
    "$@"
}

note() {
    (( DRY_RUN )) && printf '   [dry-run] %s\n' "$*"
    return 0
}

(( DRY_RUN )) && echo "== MODE DRY-RUN: tidak ada file/proses yang diubah ==" && echo

CHANGED=0
mark() { CHANGED=1; }

# ── 1. import di config AGS ─────────────────────────────────────────────
if [[ -f "$CONFIG" ]] && grep -q "dyn-island" "$CONFIG"; then
    note "hapus baris import dyn-island dari ${CONFIG}"
    if (( ! DRY_RUN )); then
        grep -v "dyn-island" "$CONFIG" > "${CONFIG}.tmp" && mv "${CONFIG}.tmp" "$CONFIG"
        echo "-  import dihapus dari config.js"
    fi
    mark
fi

# ── 2. submap Hyprland (island + chat) ──────────────────────────────────
# Blok dari install.sh selalu ber-marker `dyn-island-kbd: begin/end`, tetapi
# blok yang ditambahkan manual sebelum marker ada tidak punya akhir yang jelas.
# Untuk kasus itu, hapus dari komentar pembuka sampai penutup submap.
removed=0

strip_conf_block() {
    local file="$1"
    if grep -q '^# dyn-island-kbd: begin' "$file"; then
        act sed -i '/^# dyn-island-kbd: begin/,/^# dyn-island-kbd: end/d' "$file"
        removed=1
    fi
    if grep -q '^# dyn-island: begin' "$file"; then
        act sed -i '/^# dyn-island: begin/,/^# dyn-island: end/d' "$file"
        removed=1
    fi
    # Blok manual: `# dyn-island-kbd:` .. `submap = reset`
    if grep -q '^# dyn-island-kbd:' "$file"; then
        note "hapus blok submap manual dari ${file}"
        if (( ! DRY_RUN )); then
            local tmp
            tmp="$(mktemp)"
            awk '
                drop == 0 && /^# dyn-island-kbd:/ { drop = 1; next }
                drop == 1 && /^submap = reset/ { drop = 0; next }
                drop == 0 { print }
            ' "$file" > "$tmp" && mv "$tmp" "$file"
        fi
        removed=1
    fi
}

strip_lua_block() {
    local file="$1"
    if grep -q '^-- dyn-island-kbd: begin' "$file"; then
        act sed -i '/^-- dyn-island-kbd: begin/,/^-- dyn-island-kbd: end/d' "$file"
        removed=1
    fi
    # Blok manual: komentar `-- dyn-island-kbd:` sampai `end)` penutup submap.
    if grep -q '^-- dyn-island-kbd:' "$file"; then
        note "hapus blok submap manual dari ${file}"
        if (( ! DRY_RUN )); then
            local tmp
            tmp="$(mktemp)"
            awk '
                drop == 0 && /^-- dyn-island-kbd:/ { drop = 1; next }
                drop == 1 && /^[[:space:]]*end\)/ { drop = 0; next }
                drop == 0 { print }
            ' "$file" > "$tmp" && mv "$tmp" "$file"
        fi
        removed=1
    fi
}

if [[ -f "$HYPR_KEYS" ]]; then
    strip_conf_block "$HYPR_KEYS"
fi

if [[ -f "$HYPR_KEYS_LUA" ]]; then
    strip_lua_block "$HYPR_KEYS_LUA"
fi

# Submap `chat` bisa tertinggal kalau bloknya ditulis manual tanpa marker.
for file in "$HYPR_KEYS_LUA" "$HYPR_KEYS"; do
    [[ -f "$file" ]] || continue
    if grep -qE 'define_submap\("chat"|submap = chat' "$file"; then
        note "periksa submap chat yang mungkin tertinggal di ${file}"
        removed=1
    fi
done

if (( removed )); then
    note "reset submap + hyprctl reload"
    if (( ! DRY_RUN )); then
        hyprctl dispatch 'hl.dsp.submap("reset")' >/dev/null 2>&1 || true
        hyprctl reload >/dev/null 2>&1 || true
        echo "-  keybind submap (island/chat) dihapus dari UserKeybinds"
    fi
    mark
fi

# ── 3. notch lockscreen (hyprlock) ──────────────────────────────────────
if [[ -f "$HYPRLOCK_CONF" ]] && grep -q '^# dyn-island-lock: begin' "$HYPRLOCK_CONF"; then
    act sed -i '/^# dyn-island-lock: begin/,/^# dyn-island-lock: end/d' "$HYPRLOCK_CONF"
    echo "-  notch lockscreen dihapus dari hyprlock.conf"
    mark
fi

# ── 4. swaync: muting popup ─────────────────────────────────────────────
if [[ -f "$SWAYNC_CONFIG" ]] && grep -q '"dyn-island-all"' "$SWAYNC_CONFIG"; then
    note "hapus entry dyn-island-all dari notification-visibility"
    if (( ! DRY_RUN )); then
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
    mark
fi

# ── 5. swaync: blok gaya ────────────────────────────────────────────────
if [[ -f "$SWAYNC_STYLE" ]]; then
    # install.sh menulis blok dengan awalan baris kosong; buang juga baris
    # kosong itu supaya file benar-benar kembali seperti sebelum install.
    drop_swaync_block() {
        local file="$1" begin="$2" end="$3" tmp
        tmp="$(mktemp)"
        awk -v b="$begin" -v e="$end" '
            index($0, b) {
                inblock = 1
                if (n > 0 && line[n - 1] == "") n--
                next
            }
            inblock {
                if (index($0, e)) inblock = 0
                next
            }
            { line[n++] = $0 }
            END { for (i = 0; i < n; i++) print line[i] }
        ' "$file" > "$tmp" && mv "$tmp" "$file"
    }

    if grep -q 'dyn-island-notif: begin' "$SWAYNC_STYLE"; then
        note "hapus blok popup swaync dari ${SWAYNC_STYLE}"
        if (( ! DRY_RUN )); then
            drop_swaync_block "$SWAYNC_STYLE" '/* dyn-island-notif: begin' '/* dyn-island-notif: end */'
            echo "-  gaya popup swaync dihapus"
        fi
        mark
    fi
    if grep -q 'dyn-island-cc: begin' "$SWAYNC_STYLE"; then
        note "hapus blok control-center swaync dari ${SWAYNC_STYLE}"
        if (( ! DRY_RUN )); then
            drop_swaync_block "$SWAYNC_STYLE" '/* dyn-island-cc: begin' '/* dyn-island-cc: end */'
            echo "-  gaya control-center swaync dihapus"
        fi
        mark
    fi
    if (( ! DRY_RUN )); then
        swaync-client -rs >/dev/null 2>&1 || true
    fi
fi

# ukuran panel/artwork swaync dikembalikan dari backup
if [[ -f "${SWAYNC_CONFIG}.dyn-island-cc.bak" ]]; then
    act cp "${SWAYNC_CONFIG}.dyn-island-cc.bak" "$SWAYNC_CONFIG"
    act rm -f "${SWAYNC_CONFIG}.dyn-island-cc.bak"
    note "swaync-client -R"
    if (( ! DRY_RUN )); then
        swaync-client -R >/dev/null 2>&1 || true
        echo "-  ukuran panel swaync dikembalikan"
    fi
    mark
fi

# ── 6. CSS waybar ───────────────────────────────────────────────────────
# Blok ber-marker: hapus blok + satu baris kosong pemisah sebelumnya, supaya
# hasilnya persis seperti sebelum install.
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

# Format lama tanpa marker akhir: hapus sampai dua kurung tutup berikutnya,
# supaya CSS user setelahnya selamat.
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

if [[ -n "$WAYBAR_STYLE" && -f "$WAYBAR_STYLE" ]] && grep -q "dyn-island" "$WAYBAR_STYLE"; then
    note "hapus blok penyeimbang tinggi dari ${WAYBAR_STYLE}"
    if (( ! DRY_RUN )); then
        if grep -q "dyn-island: end" "$WAYBAR_STYLE"; then
            remove_marked_block "$WAYBAR_STYLE"
        else
            drop_legacy_block "$WAYBAR_STYLE"
        fi
        echo "-  blok penyeimbang tinggi dihapus dari CSS waybar"
    fi
    mark
fi

# ── 7. kredensial (API key Gemini) ──────────────────────────────────────
ENV_FILE="${CONFIG_DIR}/.env"
JSON_FILE="${CONFIG_DIR}/gemini.json"
if (( KEEP_ENV )); then
    echo "•  API key dipertahankan (--keep-env): ${ENV_FILE}"
else
    if [[ -f "$ENV_FILE" ]]; then
        act rm -f "$ENV_FILE"
        echo "-  API key dihapus: ${ENV_FILE}"
        mark
    fi
    if [[ -f "$JSON_FILE" ]]; then
        act rm -f "$JSON_FILE"
        echo "-  fallback gemini.json dihapus"
        mark
    fi
    if [[ -f "$CONFIG_DIR/calendar.url" ]]; then
        echo "•  URL kalender dipertahankan: ${CONFIG_DIR}/calendar.url"
        echo "   hapus manual bila ingin melepas feed: rm ${CONFIG_DIR}/calendar.url"
    fi
fi

# ── 8. symlink ──────────────────────────────────────────────────────────
if [[ -L "$LINK" ]]; then
    act rm "$LINK"
    echo "-  symlink dihapus: ${LINK}"
    mark
fi

# ── 9. restart bar & shell ──────────────────────────────────────────────
# Argumen asli dipertahankan; tanpa itu waybar/AGS kembali ke config default.
if pgrep -x waybar > /dev/null 2>&1; then
    WAYBAR_ARGS="$(ps -o args= -p "$(pgrep -x waybar | head -1)" 2>/dev/null \
        | sed 's/^[^[:space:]]*waybar//' || true)"
    note "pkill -x waybar"
    if (( ! DRY_RUN )); then
        pkill -x waybar || true
        sleep 1
        # shellcheck disable=SC2086  # word splitting memang diinginkan
        (setsid nohup waybar $WAYBAR_ARGS > /dev/null 2>&1 < /dev/null &) || true
        echo "+  waybar direstart${WAYBAR_ARGS:+ (args:${WAYBAR_ARGS})}"
    fi
fi

AGS_CMD=""
if pgrep -f "com.github.Aylur.ags" > /dev/null 2>&1; then
    AGS_CMD="$(pgrep -af '^(/[^ ]*/)?ags([[:space:]]|$)' 2>/dev/null \
        | grep -v 'com.github.Aylur' | head -1 | cut -d' ' -f2- || true)"
    [[ -n "$AGS_CMD" ]] || AGS_CMD="ags"
    note "ags quit"
    if (( ! DRY_RUN )); then
        ags quit > /dev/null 2>&1 || true
        sleep 1
        # shellcheck disable=SC2086
        (setsid nohup $AGS_CMD > /dev/null 2>&1 < /dev/null &) || true
        echo "+  AGS direstart${AGS_CMD:+ (via: ${AGS_CMD})}"
    fi
else
    echo "•  AGS tidak sedang berjalan"
fi

# ── ringkasan ───────────────────────────────────────────────────────────
echo
if (( DRY_RUN )); then
    echo "== dry-run selesai: tidak ada file maupun proses yang diubah =="
elif (( CHANGED )); then
    echo "dynamic island dicabut."
else
    echo "tidak ada jejak dynamic island yang ditemukan (sudah bersih?)"
fi

cat <<'TXT'

Data pengguna TIDAK dihapus. Kalau ingin bersih total:
  rm -rf ~/.config/dynamic-iland ~/.local/share/dynamic-iland
Backup config yang dibuat installer tetap ada dengan akhiran .dyn-island.bak.
TXT
