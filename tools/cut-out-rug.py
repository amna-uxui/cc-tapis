# Cut a rug out of a product photo on a white background, keeping its real soft edge and faint
# shadow: the white turns transparent, how far a pixel is from white decides how see-through it is.
# Saves a PNG cropped to the rug plus a small margin.
#
#   python3 tools/cut-out-rug.py photo.webp images/carpet-02-cacao-cut.png
#
# Rugs with cream or white wool: add --solid so the inside of the rug stays solid (only a band
# SOLID_EDGE pixels wide along its outline fades), else the cream turns see-through too.
#
# A rug that only ever sits on the white page doesn't need see-through edges: give the output a
# .jpg name and it's the photo itself, cropped the same way, on its own white (many times lighter
# than the PNG, so it loads at once on a phone):
#   python3 tools/cut-out-rug.py photo.jpg images/grandma-pinkblue.jpg
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
SOLID_EDGE = 12  # with --solid: how wide the soft band along the rug's outline is


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


def write_jpeg(path, w, h, px, left, top):
    # the crop as a plain BMP, then the Mac's own sips makes it a JPEG
    row = (w * 3 + 3) & ~3
    body = bytearray()
    for y in range(top + h - 1, top - 1, -1):  # BMP rows go bottom up
        line = bytearray()
        for x in range(left, left + w):
            r, g, b = px[y][x]
            line += bytes((b, g, r))
        body += line + b"\x00" * (row - w * 3)
    header = b"BM" + struct.pack("<IHHI", 54 + len(body), 0, 0, 54)
    info = struct.pack("<IiiHHIIiiII", 40, w, h, 1, 24, 0, len(body), 2835, 2835, 0, 0)
    with tempfile.TemporaryDirectory() as tmp:
        bmp = os.path.join(tmp, "crop.bmp")
        open(bmp, "wb").write(header + info + bytes(body))
        subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "72", bmp, "--out", path],
                       check=True, capture_output=True)


def write_png(path, w, h, rows):
    raw = b"".join(b"\x00" + bytes(r) for r in rows)
    def chunk(kind, body):
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body) & 0xFFFFFFFF)
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    open(path, "wb").write(png)


def main(src, out, solid=False):
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

    if out.lower().endswith(".jpg"):
        # on white, the crop can be generous: from the rug's furthest point on every side (pointed or
        # uneven rugs reach further than their main body), plus the margin
        rows = [y for y in range(h) if sum(dark(px[y][x]) for x in range(0, w, 2)) > 2]
        cols = [x for x in range(w) if sum(dark(px[y][x]) for y in range(0, h, 2)) > 2]
        left, right = max(0, cols[0] - MARGIN * 2), min(w - 1, cols[-1] + MARGIN * 2)
        top, bottom = max(0, rows[0] - MARGIN * 2), min(h - 1, rows[-1] + MARGIN * 2)
        write_jpeg(out, right - left + 1, bottom - top + 1, px, left, top)
        print(f"{out}: {right - left + 1} x {bottom - top + 1}")
        return

    # with --solid: the rug's outline, row by row, from where its edge first turns dark
    inside = {}
    if solid:
        for y in range(ys[0], ys[-1] + 1):
            row = [x for x in range(left, right + 1) if dark(px[y][x])]
            if row:
                inside[y] = (row[0] + SOLID_EDGE, row[-1] - SOLID_EDGE)

    rows = []
    for y in range(top, bottom + 1):
        line = []
        for x in range(left, right + 1):
            r, g, b = px[y][x]
            a = min(1.0, max(0.0, (WHITE - (r + g + b) / 3 - 1) / FADE))
            near = [inside.get(y + k) for k in (-SOLID_EDGE, 0, SOLID_EDGE)]
            if all(n and n[0] <= x <= n[1] for n in near):
                a = 1.0  # well inside the rug: solid, whatever its colour
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
    args = [a for a in sys.argv[1:] if a != "--solid"]
    main(args[0], args[1], solid="--solid" in sys.argv)
