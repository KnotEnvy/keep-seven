"""numpy drawing kit for the shared textures (blender/tex/*.py). No bpy import.

Images are float32 arrays, ROW 0 = TOP (image convention; a top-left pixel rectangle [x, y, w, h] is a[y:y+h, x:x+w]).
Greyscale = (h, w); colour = (h, w, 4), values 0..1 stored as-is (no colour management: write sRGB bytes as sRGB).
Everything is deterministic for a given seed.
"""
import zlib, struct, math, os
import numpy as np


# ------------------------------------------------------------------ PNG in / out (8 bit, no interlace)
def _chunk(tag, data):
    c = struct.pack(">I", len(data)) + tag + data
    return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def to_bytes(a):
    """float 0..1 -> uint8 with rounding (uint8 passes through)."""
    if a.dtype == np.uint8: return a
    return np.clip(np.rint(np.asarray(a, dtype=np.float64) * 255.0), 0, 255).astype(np.uint8)


def write_png(path, a, text=None):
    """Write `a` as an 8-bit PNG: (h, w) -> greyscale, (h, w, 3) -> RGB, (h, w, 4) -> RGBA. Row 0 is the top row.
    `text` = {key: value} goes into tEXt chunks (the pipeline marks placeholders with {'placeholder': '1'}).
    Byte-deterministic. Written to a temp file and renamed, so a reader never sees half a file."""
    b = to_bytes(a)
    if b.ndim == 2: ct = 0; ch = 1
    elif b.shape[2] == 3: ct = 2; ch = 3
    elif b.shape[2] == 4: ct = 6; ch = 4
    else: raise ValueError("write_png: array must be (h,w), (h,w,3) or (h,w,4)")
    h, w = b.shape[:2]
    raw = np.empty((h, w * ch + 1), dtype=np.uint8); raw[:, 0] = 0; raw[:, 1:] = b.reshape(h, w * ch)
    out = b"\x89PNG\r\n\x1a\n" + _chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, ct, 0, 0, 0))
    for k in sorted((text or {})):
        out += _chunk(b"tEXt", k.encode("latin-1") + b"\x00" + str(text[k]).encode("latin-1"))
    out += _chunk(b"IDAT", zlib.compress(raw.tobytes(), 9)) + _chunk(b"IEND", b"")
    path = os.path.abspath(path); os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + f".tmp{os.getpid()}"
    with open(tmp, "wb") as f: f.write(out)
    os.replace(tmp, path)
    return path


def read_png(path):
    """Read an 8-bit non-interlaced PNG -> (uint8 array (h, w) or (h, w, c), {text chunks})."""
    with open(path, "rb") as f: d = f.read()
    if d[:8] != b"\x89PNG\r\n\x1a\n": raise ValueError(f"{path}: not a PNG")
    pos = 8; idat = b""; text = {}; w = h = ct = None
    while pos < len(d):
        n = struct.unpack(">I", d[pos:pos + 4])[0]; tag = d[pos + 4:pos + 8]; body = d[pos + 8:pos + 8 + n]; pos += 12 + n
        if tag == b"IHDR":
            w, h, depth, ct, _, _, inter = struct.unpack(">IIBBBBB", body)
            if depth != 8 or inter != 0 or ct not in (0, 2, 4, 6): raise ValueError(f"{path}: unsupported PNG (depth {depth}, type {ct})")
        elif tag == b"IDAT": idat += body
        elif tag == b"tEXt":
            k, v = body.split(b"\x00", 1); text[k.decode("latin-1")] = v.decode("latin-1")
    ch = {0: 1, 2: 3, 4: 2, 6: 4}[ct]; stride = w * ch
    raw = np.frombuffer(zlib.decompress(idat), dtype=np.uint8).reshape(h, stride + 1)
    out = np.zeros((h, stride), dtype=np.uint8); prev = np.zeros(stride, dtype=np.int32)
    for y in range(h):
        ft = int(raw[y, 0]); line = raw[y, 1:].astype(np.int32)
        if ft == 0: cur = line
        elif ft == 2: cur = (line + prev) & 255
        elif ft == 1:
            cur = line.copy()
            for i in range(ch, stride): cur[i] = (cur[i] + cur[i - ch]) & 255
        else:
            cur = np.zeros(stride, dtype=np.int32)
            for i in range(stride):
                a = cur[i - ch] if i >= ch else 0; b = prev[i]; c = prev[i - ch] if i >= ch else 0
                if ft == 3: p = (a + b) >> 1
                else:
                    pa = abs(b - c); pb = abs(a - c); pc = abs(a + b - 2 * c)
                    p = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                cur[i] = (line[i] + p) & 255
        out[y] = cur; prev = cur
    return (out.reshape(h, w) if ch == 1 else out.reshape(h, w, ch)), text


# ------------------------------------------------------------------ colour
def srgb_to_linear(c):
    c = np.asarray(c, dtype=np.float64)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(c):
    c = np.clip(np.asarray(c, dtype=np.float64), 0.0, 1.0)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def hex_rgb(h):
    """'#CDA070' -> (r, g, b) floats 0..1, sRGB-encoded (what a colour PNG stores)."""
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


# ------------------------------------------------------------------ grids and noise
def grid(w, h, ss=1):
    """Pixel-centre coordinates (X, Y) of a w x h image supersampled `ss` times, in PIXELS, Y down."""
    xs = (np.arange(w * ss, dtype=np.float32) + 0.5) / ss
    ys = (np.arange(h * ss, dtype=np.float32) + 0.5) / ss
    return np.meshgrid(xs, ys)


def downsample(a, ss):
    """Box-filter a supersampled array back to its target size."""
    if ss == 1: return a
    h, w = a.shape[0] // ss, a.shape[1] // ss
    return a.reshape(h, ss, w, ss, *a.shape[2:]).mean(axis=(1, 3))


def _smooth(t): return t * t * (3.0 - 2.0 * t)


def value_noise(w, h, cells_x, cells_y, seed=1, tile_x=True, tile_y=True, offset=(0.0, 0.0)):
    """Smooth value noise in 0..1 on a w x h image with `cells_x` x `cells_y` lattice cells. Periodic along an axis
    when tile_* (the lattice wraps), so the image tiles there. cells_* must be integers >= 1."""
    rng = np.random.default_rng(seed)
    cx, cy = int(cells_x), int(cells_y)
    lat = rng.random((cy + (0 if tile_y else 1), cx + (0 if tile_x else 1)), dtype=np.float32)
    x = (np.arange(w, dtype=np.float32) + 0.5) / w * cx + offset[0]
    y = (np.arange(h, dtype=np.float32) + 0.5) / h * cy + offset[1]
    x0 = np.floor(x).astype(np.int64); y0 = np.floor(y).astype(np.int64)
    fx = _smooth(x - x0); fy = _smooth(y - y0)
    if tile_x: xa = x0 % cx; xb = (x0 + 1) % cx
    else: xa = np.clip(x0, 0, cx); xb = np.clip(x0 + 1, 0, cx)
    if tile_y: ya = y0 % cy; yb = (y0 + 1) % cy
    else: ya = np.clip(y0, 0, cy); yb = np.clip(y0 + 1, 0, cy)
    top = lat[ya][:, xa] * (1 - fx)[None, :] + lat[ya][:, xb] * fx[None, :]
    bot = lat[yb][:, xa] * (1 - fx)[None, :] + lat[yb][:, xb] * fx[None, :]
    return (top * (1 - fy)[:, None] + bot * fy[:, None]).astype(np.float32)


def fbm(w, h, cells_x, cells_y, octaves=4, gain=0.5, seed=1, tile_x=True, tile_y=True):
    """Fractal sum of value_noise octaves (each doubles the cell counts), normalised to about 0..1."""
    a = np.zeros((h, w), dtype=np.float32); amp = 1.0; tot = 0.0
    for o in range(octaves):
        a += amp * value_noise(w, h, max(1, int(cells_x) << o), max(1, int(cells_y) << o), seed + 101 * o, tile_x, tile_y)
        tot += amp; amp *= gain
    return a / tot


def blur(a, radius, wrap_x=False, wrap_y=False, passes=3):
    """Approximate gaussian blur: `passes` box blurs of half-width `radius` px per axis, wrapping where asked."""
    r = int(round(radius))
    if r <= 0: return a
    out = np.asarray(a, dtype=np.float32)
    for axis, wrap in ((1, wrap_x), (0, wrap_y)):
        for _ in range(passes):
            pad = [(0, 0)] * out.ndim; pad[axis] = (r + 1, r)
            p = np.pad(out, pad, mode='wrap' if wrap else 'edge')
            c = np.cumsum(p, axis=axis, dtype=np.float64)
            n = out.shape[axis]
            hi = np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis=axis)
            lo = np.take(c, np.arange(0, n), axis=axis)
            out = ((hi - lo) / (2 * r + 1)).astype(np.float32)
    return out


def seam_error(a):
    """(wrap_x, inner_x, wrap_y, inner_y): mean abs difference across the tile seam versus between interior
    neighbours, in 0..1 units. A tiling image has wrap ~ inner."""
    a = np.asarray(a, dtype=np.float32)
    if a.dtype == np.uint8: a = a / 255.0
    return (float(np.abs(a[:, 0] - a[:, -1]).mean()), float(np.abs(a[:, 1:] - a[:, :-1]).mean()),
            float(np.abs(a[0] - a[-1]).mean()), float(np.abs(a[1:] - a[:-1]).mean()))


def tile(a, nx=2, ny=2):
    """The image repeated nx x ny times (for a tiling preview)."""
    return np.tile(a, (ny, nx) + (1,) * (a.ndim - 2))


# ------------------------------------------------------------------ signed distance shapes (pixels, Y down)
def sd_circle(X, Y, cx, cy, r): return np.hypot(X - cx, Y - cy) - r


def sd_ring(X, Y, cx, cy, r_outer, r_inner): return np.abs(np.hypot(X - cx, Y - cy) - (r_outer + r_inner) / 2) - (r_outer - r_inner) / 2


def sd_box(X, Y, cx, cy, hx, hy, radius=0.0):
    """Box centred (cx, cy) with half extents (hx, hy) and corner radius."""
    dx = np.abs(X - cx) - (hx - radius); dy = np.abs(Y - cy) - (hy - radius)
    return np.hypot(np.maximum(dx, 0), np.maximum(dy, 0)) + np.minimum(np.maximum(dx, dy), 0) - radius


def sd_segment(X, Y, ax, ay, bx, by, r):
    """Capsule from (ax, ay) to (bx, by) with radius r."""
    px = X - ax; py = Y - ay; bxa = bx - ax; bya = by - ay
    t = np.clip((px * bxa + py * bya) / max(1e-9, bxa * bxa + bya * bya), 0.0, 1.0)
    return np.hypot(px - bxa * t, py - bya * t) - r


def sd_polygon(X, Y, pts):
    """Signed distance to a simple polygon [(x, y), ...] (negative inside)."""
    pts = np.asarray(pts, dtype=np.float32); n = len(pts)
    d = np.full(X.shape, 1e18, dtype=np.float32); inside = np.zeros(X.shape, dtype=bool)
    for i in range(n):
        ax, ay = pts[i]; bx, by = pts[(i + 1) % n]
        d = np.minimum(d, sd_segment(X, Y, ax, ay, bx, by, 0.0))
        cond = ((ay > Y) != (by > Y)) & (X < (bx - ax) * (Y - ay) / (by - ay + 1e-12) + ax)
        inside ^= cond
    return np.where(inside, -d, d)


def cover(sd, soft=1.0):
    """Signed distance (px) -> anti-aliased coverage 0..1 (`soft` = edge width in px)."""
    return np.clip(0.5 - sd / soft, 0.0, 1.0)


def over(dst, cov, value):
    """Composite `value` over `dst` with coverage `cov` (in place; returns dst)."""
    dst += (value - dst) * cov
    return dst


def raster_triangles(tris, w, h, ss=4):
    """Coverage (h, w) of 2D triangles. tris: array (n, 3, 2) of PIXEL coordinates (Y down). Supersampled ss x ss."""
    W, H = w * ss, h * ss
    out = np.zeros((H, W), dtype=bool)
    t = np.asarray(tris, dtype=np.float64) * ss
    for a, b, c in t:
        x0 = max(0, int(math.floor(min(a[0], b[0], c[0])))); x1 = min(W, int(math.ceil(max(a[0], b[0], c[0]))) + 1)
        y0 = max(0, int(math.floor(min(a[1], b[1], c[1])))); y1 = min(H, int(math.ceil(max(a[1], b[1], c[1]))) + 1)
        if x1 <= x0 or y1 <= y0: continue
        X, Y = np.meshgrid(np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5)
        e0 = (b[0] - a[0]) * (Y - a[1]) - (b[1] - a[1]) * (X - a[0])
        e1 = (c[0] - b[0]) * (Y - b[1]) - (c[1] - b[1]) * (X - b[0])
        e2 = (a[0] - c[0]) * (Y - c[1]) - (a[1] - c[1]) * (X - c[0])
        out[y0:y1, x0:x1] |= ((e0 >= 0) & (e1 >= 0) & (e2 >= 0)) | ((e0 <= 0) & (e1 <= 0) & (e2 <= 0))
    return downsample(out.astype(np.float32), ss)


def paste(dst, src, x, y):
    """Copy `src` into dst at top-left (x, y)."""
    h, w = src.shape[:2]
    dst[y:y + h, x:x + w] = src
    return dst


def write_json_if_changed(path, obj):
    """Write a JSON table atomically, only when its content changed (keeps mtimes and readers stable)."""
    import json
    s = json.dumps(obj, indent=1, sort_keys=True) + "\n"
    if os.path.isfile(path):
        with open(path, "r", encoding="utf-8") as f:
            if f.read() == s: return False
    tmp = path + f".tmp{os.getpid()}"
    with open(tmp, "w", encoding="utf-8") as f: f.write(s)
    os.replace(tmp, path)
    return True


# ------------------------------------------------------------------ detail-texture helpers (trim sheets)
def wrap_dx(X, cx, w):
    """Signed x distance to cx on an image that wraps every w pixels (features that straddle the seam tile cleanly)."""
    return (X - cx + w / 2.0) % w - w / 2.0


def finish_detail(a, seam=None, lo=0.38, hi=0.62, seam_floor=0.22, target_mean=0.5):
    """Bring a detail row into the art bible's range: the non-seam pixels are recentred on `target_mean` and clipped
    to lo..hi; pixels where `seam` (0..1 coverage of drawn seam lines, holes, nail heads) is set may go down to
    `seam_floor`. The floor is applied to the value as STORED: 8 bits round 0.22 down to 56 / 255 = 0.2196 and the
    near-lossless WebP may move a texel one code more, so the darkest value written is the next code but one above
    the floor (58 / 255 for 0.22) and the shipped texture never goes under it; likewise one code under `hi` at the top.
    Returns the row."""
    a = np.asarray(a, dtype=np.float32)
    if seam is None: seam = np.zeros(a.shape, dtype=np.float32)
    body = seam < 0.02
    if body.any(): a = a + (target_mean - float(a[body].mean()))
    stored_floor = (math.ceil(seam_floor * 255.0 - 1e-6) + 1) / 255.0
    stored_hi = (math.floor(hi * 255.0 + 1e-6) - 1) / 255.0           # the same at the top: 157 / 255 for 0.62
    floor = lo + (stored_floor - lo) * np.clip(seam, 0, 1)
    return np.clip(a, floor, stored_hi)


def dot(a, seam, X, Y, cx, cy, r, value, w=None, soft=1.0):
    """Paint a round mark (nail head, tie hole) of radius r at (cx, cy) to `value`, registering it as a seam feature.
    With `w` the x distance wraps."""
    dx = wrap_dx(X, cx, w) if w else X - cx
    c = cover(np.hypot(dx, Y - cy) - r, soft)
    over(a, c, value); np.maximum(seam, c, out=seam)
    return c


def hline(a, seam, Y, y, half, value, soft=1.0, mask=1.0):
    """A horizontal line at y (half-width `half` px) painted to `value` and registered as a seam."""
    c = cover(np.abs(Y - y) - half, soft) * mask
    over(a, c, value); np.maximum(seam, c, out=seam)
    return c


def vline(a, seam, X, x, half, value, w=None, soft=1.0, mask=1.0):
    """A vertical line at x (wrapping every w px when given)."""
    dx = wrap_dx(X, x, w) if w else X - x
    c = cover(np.abs(dx) - half, soft) * mask
    over(a, c, value); np.maximum(seam, c, out=seam)
    return c
