#!/usr/bin/env python3
"""Query the terminal and generate a PNG for an explicit 48-column / 12-row placement."""
import base64
import binascii
import json
import os
import re
import select
import struct
import sys
import termios
import time
import tty
import zlib

fd = os.open(os.ctermid(), os.O_RDWR)
saved = termios.tcgetattr(fd)
replies = {}
try:
    tty.setraw(fd)
    for name, query in (("16t", b"\x1b[16t"), ("14t", b"\x1b[14t"), ("18t", b"\x1b[18t")):
        os.write(fd, query)
        reply = bytearray()
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            if not select.select([fd], [], [], max(0, deadline - time.monotonic()))[0]:
                break
            reply.extend(os.read(fd, 256))
            if reply.endswith(b"t"):
                break
        replies[name] = reply.decode("ascii")
finally:
    termios.tcsetattr(fd, termios.TCSANOW, saved)
    os.close(fd)

match = re.fullmatch(r"\x1b\[6;(\d+);(\d+)t", replies["16t"])
if not match:
    raise RuntimeError("No valid CSI 16t reply: " + repr(replies["16t"]))
cell_h, cell_w = map(int, match.groups())
cols, rows = 48, 12
width, height = cols * cell_w, rows * cell_h
replies.update(cellWidth=cell_w, cellHeight=cell_h, imageWidth=width, imageHeight=height,
               placementColumns=cols, placementRows=rows)
with open(sys.argv[1], "w") as target:
    json.dump(replies, target, indent=2)
if "--probe" in sys.argv:
    sys.exit(0)

pixels = bytearray(width * height * 3)
for y in range(height):
    for x in range(width):
        if y < height // 4:
            color = (15, 24, 42)
        elif y < height // 2:
            color = (245, 171, 54) if x % cell_w and y % (cell_h // 2) else (14, 24, 40)
        elif x < width // 2:
            color = (255, 255, 255) if (x + y) % 2 else (0, 0, 0)
        else:
            color = (255, 255, 255) if (x // 2 + y // 2) % 2 else (0, 0, 0)
        offset = (y * width + x) * 3
        pixels[offset:offset + 3] = bytes(color)

# A tiny bitmap face keeps the reproduction Python-stdlib-only.
font = {
    "A": [14,17,17,31,17,17,17], "C": [14,17,16,16,16,17,14],
    "D": [30,17,17,17,17,17,30], "E": [31,16,16,30,16,16,31],
    "F": [31,16,16,30,16,16,16], "G": [14,17,16,23,17,17,15],
    "H": [17,17,17,31,17,17,17], "I": [31,4,4,4,4,4,31],
    "L": [16,16,16,16,16,16,31], "N": [17,25,25,21,19,19,17],
    "O": [14,17,17,17,17,17,14], "P": [30,17,17,30,16,16,16],
    "R": [30,17,17,30,20,18,17], "S": [15,16,16,14,1,1,30],
    "T": [31,4,4,4,4,4,4], "W": [17,17,17,21,21,21,10],
    "X": [17,17,10,4,10,17,17], "Y": [17,17,10,4,4,4,4],
    "0": [14,17,19,21,25,17,14], "1": [4,12,4,4,4,4,14],
    "2": [14,17,1,2,4,8,31], "4": [2,6,10,18,31,2,2],
    "8": [14,17,17,14,17,17,14], " ": [0]*7,
}
scale = max(1, cell_w // 8)
for line, text in enumerate(("HI DPI  1 PX LINES", "48 COLS X 12 ROWS")):
    for index, letter in enumerate(text):
        for yy, bits in enumerate(font[letter]):
            for xx in range(5):
                if bits & (1 << (4 - xx)):
                    for dy in range(scale):
                        for dx in range(scale):
                            x = 8 * scale + index * 6 * scale + xx * scale + dx
                            y = 5 * scale + line * 17 * scale + yy * scale + dy
                            offset = (y * width + x) * 3
                            pixels[offset:offset + 3] = bytes((235, 244, 255))

# Every line and border is exactly one source pixel wide.
for y in range(height):
    for x in range(width):
        if x in (0, width - 1) or y in (0, height - 1, height // 4, height // 2):
            offset = (y * width + x) * 3
            pixels[offset:offset + 3] = b"\x44\xcc\xff"

def chunk(kind, data):
    return struct.pack("!I", len(data)) + kind + data + struct.pack("!I", binascii.crc32(kind + data) & 0xffffffff)

scanlines = b"".join(b"\0" + pixels[y * width * 3:(y + 1) * width * 3] for y in range(height))
png = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack("!IIBBBBB", width, height, 8, 2, 0, 0, 0))
       + chunk(b"IDAT", zlib.compress(scanlines, 9)) + chunk(b"IEND", b""))
reply = replies["16t"][2:-1]
header = ("\x1b_Ga=d,d=A,q=2\x1b\\\x1b[2J\x1b[H\x1b[?25l"
          "CELL-SIZED KITTY  |  48 cols x 12 rows\r\n"
          f"CSI 16t {reply}  |  source {width} x {height} px\r\n\r\n").encode()
image = b"\x1b_Gf=100,a=T,i=101,c=48,r=12,q=2;" + base64.b64encode(png) + b"\x1b\\"
footer = b"\x1b[17;1HGrid: 1-px lines. Bottom: 1-px / 2-px checks.\r\n"
sys.stdout.buffer.write(header + image + footer)
sys.stdout.buffer.flush()
