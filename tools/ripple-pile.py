# A seamless square of the real rug's pile: many small patches of its plain wool (well inside the
# dark leaves, so no pattern), blended softly into each other, wrapping round at the edges
# Usage: python3 tools/ripple-pile.py <the rug photo, as a .bmp crop> images/ripple-pile.png 512 (then save as .jpg)
import struct, zlib, sys, array, random, math
src, out, N = sys.argv[1], sys.argv[2], int(sys.argv[3])
d = open(src, 'rb').read()
off = struct.unpack_from('<I', d, 10)[0]; w, h = struct.unpack_from('<ii', d, 18); bp = struct.unpack_from('<H', d, 28)[0] // 8
flip = h > 0; h = abs(h); row = (w * bp + 3) & ~3
lum = array.array('f', [0.0]) * (w * h); dark = array.array('b', [0]) * (w * h)
for y in range(h):
    base = off + (h - 1 - y if flip else y) * row
    for x in range(w):
        b, g, r = d[base + x*bp], d[base + x*bp + 1], d[base + x*bp + 2]
        v = 0.3 * r + 0.59 * g + 0.11 * b
        lum[y*w + x] = v; dark[y*w + x] = 1 if (v < 95 and min(r, g, b) < 225) else 0
I = array.array('i', [0]) * ((w + 1) * (h + 1))
for y in range(h):
    s = 0
    for x in range(w):
        s += dark[y*w + x]; I[(y+1)*(w+1) + x + 1] = I[y*(w+1) + x + 1] + s
P = 56; M = 8  # patch size, and a margin round it that must be dark too
spots = []
for y in range(M, h - P - M, 4):
    for x in range(M, w - P - M, 4):
        x0, y0, x1, y1 = x - M, y - M, x + P + M, y + P + M
        if I[y1*(w+1)+x1] - I[y0*(w+1)+x1] - I[y1*(w+1)+x0] + I[y0*(w+1)+x0] == (P + 2*M) ** 2: spots.append((x, y))
print('patches to choose from', len(spots))
random.seed(7)
acc = array.array('d', [0.0]) * (N * N); wt = array.array('d', [0.0]) * (N * N)
win = [math.sin(math.pi * (i + 0.5) / P) ** 2 for i in range(P)]
step = P // 3
for gy in range(0, N, step):
    for gx in range(0, N, step):
        sx, sy = random.choice(spots)
        # each patch levelled to its own average, so the blend shows only the pile's texture
        mean = sum(lum[(sy+j)*w + sx + i] for j in range(P) for i in range(P)) / (P * P)
        ox, oy = gx + random.randint(-step//2, step//2), gy + random.randint(-step//2, step//2)
        for j in range(P):
            for i in range(P):
                k = ((oy + j) % N) * N + (ox + i) % N
                a = win[i] * win[j]
                acc[k] += a * lum[(sy+j)*w + sx + i] / mean; wt[k] += a
vals = [acc[k] / wt[k] for k in range(N * N)]
m = sum(vals) / len(vals); sd = (sum((v - m) ** 2 for v in vals) / len(vals)) ** 0.5
print('relative spread', sd / m)
rows = [bytes(max(0, min(255, round(128 + (vals[y*N + x] / m - 1) * 560))) for x in range(N)) for y in range(N)]
def chunk(t, b): return struct.pack('>I', len(b)) + t + b + struct.pack('>I', zlib.crc32(t + b) & 0xffffffff)
open(out, 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', N, N, 8, 0, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(b''.join(b'\x00' + r for r in rows), 9)) + chunk(b'IEND', b''))
