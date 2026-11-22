#!/usr/bin/env python3
"""Injeksi tombol keyboard nyata lewat /dev/uinput (uji regresi Escape/Enter).

Butuh akses tulis ke /dev/uinput (user di grup `input`).

Pemakaian:
  uinput-key.py esc
  uinput-key.py enter
  uinput-key.py type "halo"
  uinput-key.py combo ctrl+s

Nama tombol yang didukung ada di KEYMAP (huruf, angka, esc, enter, tab,
backspace, space, panah, ctrl/alt/shift sebagai modifier percobaan combo).
Setelah injeksi, state jendela island dicetak supaya hasilnya bisa dibaca
tanpa perintah tambahan.
"""
import fcntl
import os
import struct
import subprocess
import sys
import time

UI_DEV_SETUP = 0x405C5503
UI_DEV_CREATE = 0x5501
UI_DEV_DESTROY = 0x5502
UI_SET_EVBIT = 0x40045564
UI_SET_KEYBIT = 0x40045565

EV_SYN, EV_KEY = 0, 1

KEYMAP = {
    'esc': 1, 'enter': 28, 'tab': 15, 'backspace': 14, 'space': 57,
    'left': 105, 'right': 106, 'up': 103, 'down': 108,
    'ctrl': 29, 'alt': 56, 'shift': 42,
    'a': 30, 'b': 48, 'c': 46, 'd': 32, 'e': 18, 'f': 33, 'g': 34,
    'h': 35, 'i': 23, 'j': 36, 'k': 37, 'l': 38, 'm': 50, 'n': 49,
    'o': 24, 'p': 25, 'q': 16, 'r': 19, 's': 31, 't': 20, 'u': 22,
    'v': 47, 'w': 17, 'x': 45, 'y': 21, 'z': 44,
    '1': 2, '2': 3, '3': 4, '4': 5, '5': 6,
    '6': 7, '7': 8, '8': 9, '9': 10, '0': 11,
}


def emit(fd, etype, code, value):
    os.write(fd, struct.pack('<qqHHi', 0, 0, etype, code, value))


def syn(fd):
    emit(fd, EV_SYN, 0, 0)


def tap(fd, code, hold=0.04):
    emit(fd, EV_KEY, code, 1)
    syn(fd)
    time.sleep(hold)
    emit(fd, EV_KEY, code, 0)
    syn(fd)


def island_state():
    try:
        out = subprocess.run(
            ['ags', '-r',
             "JSON.stringify({page:globalThis.dynIsland.page.value,"
             "hovered:globalThis.dynIsland.hovered.value,"
             "chat:globalThis.geminiChat?.win?.visible??null,"
             "todo:globalThis.todoWindow?.win?.visible??null,"
             "cal:globalThis.calendarWindow?.win?.visible??null,"
             "standup:globalThis.standupWindow?.win?.visible??null})"],
            capture_output=True, text=True, timeout=10)
        lines = [l for l in out.stdout.strip().splitlines() if l.strip()]
        return lines[-1] if lines else '(tanpa output)'
    except Exception as exc:          # noqa: BLE001
        return f'(probe gagal: {exc})'


def submap():
    try:
        return subprocess.check_output(['hyprctl', 'submap'], text=True).strip()
    except Exception:                 # noqa: BLE001
        return '?'


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    action = sys.argv[1]

    fd = os.open('/dev/uinput', os.O_WRONLY | os.O_NONBLOCK)
    try:
        fcntl.ioctl(fd, UI_SET_EVBIT, EV_KEY)
        for code in set(KEYMAP.values()):
            fcntl.ioctl(fd, UI_SET_KEYBIT, code)
        fcntl.ioctl(fd, UI_DEV_SETUP,
                    struct.pack('<HHHH80sI', 3, 0x1D6B, 0x0104, 1,
                                b'dyn-island-test-kbd', 0))
        fcntl.ioctl(fd, UI_DEV_CREATE)
        time.sleep(0.3)

        if action == 'combo':
            parts = sys.argv[2].lower().split('+')
            mods = [KEYMAP[p] for p in parts[:-1] if p in KEYMAP]
            key = KEYMAP.get(parts[-1])
            if key is None:
                print(f'x  tombol tidak dikenal: {parts[-1]}')
                return 2
            for mod in mods:
                emit(fd, EV_KEY, mod, 1)
                syn(fd)
                time.sleep(0.02)
            tap(fd, key)
            for mod in reversed(mods):
                emit(fd, EV_KEY, mod, 0)
                syn(fd)
            # beri compositor waktu memproses sebelum state dibaca
            time.sleep(0.35)
        elif action == 'type':
            for char in sys.argv[2]:
                code = KEYMAP.get(char.lower())
                if code is None:
                    continue
                shifted = char.isupper()
                if shifted:
                    emit(fd, EV_KEY, KEYMAP['shift'], 1)
                    syn(fd)
                tap(fd, code)
                if shifted:
                    emit(fd, EV_KEY, KEYMAP['shift'], 0)
                    syn(fd)
                time.sleep(0.02)
            time.sleep(0.35)
        else:
            code = KEYMAP.get(action.lower())
            if code is None:
                print(f'x  tombol tidak dikenal: {action}')
                return 2
            tap(fd, code)
            time.sleep(0.35)
    finally:
        try:
            fcntl.ioctl(fd, UI_DEV_DESTROY)
        except OSError:
            pass
        os.close(fd)

    print(f'state  : {island_state()}')
    print(f'submap : {submap()}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
