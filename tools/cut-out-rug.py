# Cut a rug out of a product photo on a white background, keeping its real soft edge and faint
# shadow: the white turns transparent, how far a pixel is from white decides how see-through it is.
# Saves a PNG cropped to the rug plus a small margin.
#
#   python3 tools/cut-out-rug.py photo.webp images/carpet-02-cacao-cut.png
#
# Needs only the Mac's own tools (sips converts the photo to BMP first).
import os
import struct
import subprocess
import sys
import tempfile
import zlib

MARGIN = 14      # pixels kept around the rug, for its fuzzy edge and shadow
WHITE = 254      # the background's brightness in these photos
FADE = 34        # how much darker than the background a pixel must be to be fully solid


def read_bmp(path):
    data = open(path, "rb").read()
    offset = struct.unpack_from("<I", data, 10)[0]
    w, h = struct.unpack_from("<ii", data, 18)
    bits = struct.unpack_from("<H", data, 28)[0]
    step = bits // 8
    row = (w * step + 3) & ~3
    height = abs(h)
    pixels = []
    for y in range(height):
        yy = y if h < 0 else height - 1 - y
        start = offset + yy * row
        line = []
        for x in range(w):
            i = start + x * step
            line.append((data[i + 2], data[i + 1], data[i]))
        pixels.append(line)
    return w, height, pixels


def write_png(path, w, h, rows):
    raw = b"".join(b"\x00" + bytes(r) for r in rows)
    def chunk(kind, body):
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body) & 0xFFFFFFFF)
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    open(path, "wb").write(png)


def main(src, out):
    with tempfile.TemporaryDirectory() as tmp:
        bmp = os.path.join(tmp, "photo.bmp")
        subprocess.run(["sips", "-s", "format", "bmp", src, "--out", bmp], check=True, capture_output=True)
        w, h, px = read_bmp(bmp)

    # the rug: everything clearly darker than the background
    dark = lambda p: sum(p) / 3 < WHITE - 20
    ys = [y for y in range(h) if sum(dark(px[y][x]) for x in range(0, w, 4)) > w / 16]
    xs = [x for x in range(w) if sum(dark(px[y][x]) for y in range(0, h, 4)) > h / 16]
    left, right = max(0, xs[0] - MARGIN), min(w - 1, xs[-1] + MARGIN)
    top, bottom = max(0, ys[0] - MARGIN), min(h - 1, ys[-1] + MARGIN)

    rows = []
    for y in range(top, bottom + 1):
        line = []
        for x in range(left, right + 1):
            r, g, b = px[y][x]
            a = min(1.0, max(0.0, (WHITE - (r + g + b) / 3 - 1) / FADE))
            if a <= 0:
                line += [255, 255, 255, 0]
                continue
            # the colour without the white behind it
            un = lambda c: int(min(255, max(0, (c - 255 * (1 - a)) / a)))
            line += [un(r), un(g), un(b), int(a * 255 + 0.5)]
        rows.append(line)
    write_png(out, right - left + 1, bottom - top + 1, rows)
    print(f"{out}: {right - left + 1} x {bottom - top + 1}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
