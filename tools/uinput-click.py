#!/usr/bin/env python3
"""Injeksi mouse nyata lewat /dev/uinput (untuk uji regresi navigasi).

Butuh akses tulis ke /dev/uinput (user di grup `input`).

Pemakaian (koordinat absolut, global — sama seperti `hyprctl cursorpos`):

  uinput-click.py flow  <nx> <ny> <ax> <ay> [wait_expand_ms] [hold_ms]
      masuk notch (nx,ny) -> tunggu ekspansi -> pindah ke (ax,ay) -> klik kiri

  uinput-click.py flow2 <nx> <ny> <x1> <x2> <y> [gap_ms] [wait_expand_ms]
      seperti flow tapi DUA klik pada <x1> lalu <x2> (baris y yang sama)

  uinput-click.py click <x> <y> [hold_ms] [settle_ms]
      pindah ke (x,y), tunggu, klik sekali

  uinput-click.py move <x> <y> [settle_ms]
      pindah ke (x,y) TANPA klik (untuk uji hover), lalu cetak state

Setelah klik, state island dicetak (page/hovered/geo/nav) SEBELUM device
dilepas, supaya hover masih aktif saat diukur.
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
UI_SET_RELBIT = 0x40045566
EV_SYN, EV_KEY, EV_REL = 0, 1, 2
REL_X, REL_Y = 0, 1
BTN_LEFT = 0x110
BTN_RIGHT = 0x111


def emit(fd, etype, code, value):
    os.write(fd, struct.pack('<qqHHi', 0, 0, etype, code, value))


def syn(fd):
    emit(fd, EV_SYN, 0, 0)


def cursor_pos():
    x, y = subprocess.check_output(['hyprctl', 'cursorpos']).decode().strip().split(',')
    return int(x), int(y)


def move_to(fd, x, y):
    for _ in range(600):
        cx, cy = cursor_pos()
        dx, dy = x - cx, y - cy
        if abs(dx) <= 1 and abs(dy) <= 1:
            return True
        step = 25 if max(abs(dx), abs(dy)) > 60 else 3
        emit(fd, EV_REL, REL_X, max(-step, min(step, dx)))
        emit(fd, EV_REL, REL_Y, max(-step, min(step, dy)))
        syn(fd)
        time.sleep(0.006)
    return False


def click(fd, hold_ms=70, button=BTN_LEFT):
    emit(fd, EV_KEY, button, 1)
    syn(fd)
    time.sleep(hold_ms / 1000.0)
    emit(fd, EV_KEY, button, 0)
    syn(fd)


def island_state():
    try:
        out = subprocess.run(
            ['ags', '-r',
             "await new Promise(r=>setTimeout(r,10));"
             "const d=globalThis.dynIsland;"
             "return 'page='+d.page.value+' hovered='+d.hovered.value"
             "+' geo='+Math.round(d.geo.w)+'x'+Math.round(d.geo.h)"
             "+' nav='+d.nav.visible"],
            capture_output=True, text=True, timeout=10)
        lines = [l for l in out.stdout.strip().splitlines() if l.strip()]
        return lines[-1] if lines else '(tanpa output)'
    except Exception as exc:          # noqa: BLE001
        return f'(probe gagal: {exc})'


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    action = sys.argv[1]
    fd = os.open('/dev/uinput', os.O_WRONLY | os.O_NONBLOCK)
    try:
        fcntl.ioctl(fd, UI_SET_EVBIT, EV_KEY)
        fcntl.ioctl(fd, UI_SET_EVBIT, EV_REL)
        fcntl.ioctl(fd, UI_SET_KEYBIT, BTN_LEFT)
        fcntl.ioctl(fd, UI_SET_KEYBIT, BTN_RIGHT)
        fcntl.ioctl(fd, UI_SET_RELBIT, REL_X)
        fcntl.ioctl(fd, UI_SET_RELBIT, REL_Y)
        fcntl.ioctl(fd, UI_DEV_SETUP,
                    struct.pack('<HHHH80sI', 3, 0x1D6B, 0x0104, 1, b'dyn-island-test-mouse', 0))
        fcntl.ioctl(fd, UI_DEV_CREATE)
        time.sleep(0.3)

        if action == 'flow':
            nx, ny, ax, ay = (int(v) for v in sys.argv[2:6])
            wait = int(sys.argv[6]) if len(sys.argv) > 6 else 500
            hold = int(sys.argv[7]) if len(sys.argv) > 7 else 70
            move_to(fd, nx, ny)
            time.sleep(wait / 1000.0)
            move_to(fd, ax, ay)
            time.sleep(0.1)
            print(f"sebelum klik: {island_state()}")
            click(fd, hold)
            time.sleep(0.45)
            print(f"sesudah klik: {island_state()}")
        elif action == 'flow2':
            nx, ny, x1, x2, y = (int(v) for v in sys.argv[2:7])
            gap = int(sys.argv[7]) if len(sys.argv) > 7 else 150
            wait = int(sys.argv[8]) if len(sys.argv) > 8 else 500
            move_to(fd, nx, ny)
            time.sleep(wait / 1000.0)
            move_to(fd, x1, y)
            time.sleep(0.1)
            print(f"awal   : {island_state()}")
            click(fd)
            time.sleep(gap / 1000.0)
            move_to(fd, x2, y)
            time.sleep(0.1)
            print(f"tengah : {island_state()}")
            click(fd)
            time.sleep(0.5)
            print(f"akhir  : {island_state()}")
        elif action == 'move':
            x, y = int(sys.argv[2]), int(sys.argv[3])
            settle = int(sys.argv[4]) if len(sys.argv) > 4 else 300
            move_to(fd, x, y)
            time.sleep(settle / 1000.0)
            print(f"setelah move: {island_state()}")
        elif action == 'click':
            x, y = int(sys.argv[2]), int(sys.argv[3])
            hold = int(sys.argv[4]) if len(sys.argv) > 4 else 70
            settle = int(sys.argv[5]) if len(sys.argv) > 5 else 500
            move_to(fd, x, y)
            time.sleep(settle / 1000.0)
            print(f"sebelum klik: {island_state()}")
            click(fd, hold)
            time.sleep(0.45)
            print(f"sesudah klik: {island_state()}")
        elif action == 'rclick':
            x, y = int(sys.argv[2]), int(sys.argv[3])
            hold = int(sys.argv[4]) if len(sys.argv) > 4 else 70
            settle = int(sys.argv[5]) if len(sys.argv) > 5 else 400
            move_to(fd, x, y)
            time.sleep(settle / 1000.0)
            print(f"sebelum klik kanan: {island_state()}")
            click(fd, hold, BTN_RIGHT)
            time.sleep(0.45)
            print(f"sesudah klik kanan: {island_state()}")
        else:
            print(f"aksi tidak dikenal: {action}")
            return 2
    finally:
        try:
            fcntl.ioctl(fd, UI_DEV_DESTROY)
        except OSError:
            pass
        os.close(fd)
    return 0


if __name__ == '__main__':
    sys.exit(main())
