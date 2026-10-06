"""tx_mask: 1024 x 512 single-channel mask (R8), alpha test 0.5, white = opaque (ART_BIBLE 4.3, 5.6).

    node tools/build-assets.mjs --only tx_mask

All in-world writing and every alpha cut-out lives here, so the game has exactly one alpha-tested material (m_mask).
The region rectangles are written to blender/lib/mask_regions.json (`manifest.mask_uv(region[, index])`,
`uv.map_to_mask`). Text is limited to strings that exist in design/story.json.

APPEND-ONLY: a shipped region never moves. Free space: x 640..896, y 192..384 except where noted in LAYOUT; x 896..1024,
y 480..512; the strip under `louvre`. Region pixels are [x, y, w, h] from the TOP-LEFT of the image.
"""
import sys, os, math
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
while not (os.path.isfile(os.path.join(_d, "lib", "__init__.py")) or os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py"))):
    if os.path.dirname(_d) == _d: raise SystemExit(f"blender/lib not found above {os.path.abspath(__file__)}")   # never loop at the filesystem root
    _d = os.path.dirname(_d)
sys.path.insert(0, _d if os.path.isfile(os.path.join(_d, "lib", "__init__.py")) else os.path.join(_d, "blender"))
import numpy as np
from lib import texdraw as td, manifest, brand

W, H = 1024, 512
SS = 4                      # supersampling of the SDF drawing
PAD = 3                     # px kept clear inside every region / cell (mip bleed)

# name: (x, y, w, h, columns, rows)   cells run left to right, then top to bottom
LAYOUT = {
    "mark_cast": (0, 0, 128, 192, 1, 1),
    "picto_charge": (128, 0, 96, 192, 1, 1),
    "mark_brush_a": (224, 0, 96, 144, 1, 1),
    "mark_brush_b": (320, 0, 96, 144, 1, 1),
    "mark_brush_c": (416, 0, 96, 144, 1, 1),
    "strike": (224, 152, 256, 32, 1, 1),
    "grille": (512, 0, 128, 128, 1, 1),
    "louvre": (512, 128, 128, 64, 1, 1),
    "plate_lines": (640, 0, 384, 128, 1, 4),
    "picto_misc": (640, 128, 384, 64, 6, 1),
    "numerals": (0, 192, 640, 96, 10, 1),
    "tally": (0, 288, 512, 64, 4, 1),
    "picto_daycell": (512, 288, 256, 64, 1, 1),
    "picto_line": (0, 352, 256, 64, 1, 1),
    "station": (256, 352, 384, 48, 1, 1),
    "wordmark": (0, 416, 512, 48, 1, 1),
    "family_marks": (0, 464, 576, 48, 12, 1),
    "card_edges": (640, 384, 256, 128, 3, 1),
    "card_dowser": (896, 192, 128, 288, 1, 1),
}
PLATE_LINES = ["LINE CHARGE. FOR SIGHTING.", "PROVING CHARGE. BANDED.", "DO NOT KEEP.", "TAMPING UNIT."]


def cells_of(name):
    x, y, w, h, cols, rows = LAYOUT[name]
    cw, ch = w // cols, h // rows
    return [[x + c * cw, y + r * ch, cw, ch] for r in range(rows) for c in range(cols)]


def table():
    regs = {}
    for name, (x, y, w, h, cols, rows) in LAYOUT.items():
        r = {"px": [x, y, w, h]}
        if cols * rows > 1 or name == "card_edges": r["cells"] = cells_of(name)
        regs[name] = r
    return {"size": [W, H], "regions": regs}


class Canvas:
    """A supersampled drawing surface for one region / cell. Coordinates are in the cell's own pixels, Y down."""
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.X, self.Y = td.grid(w, h, SS)
        self.a = np.zeros(self.X.shape, dtype=np.float32)
    def add(self, sd, soft=None): self.a = np.maximum(self.a, td.cover(sd, 1.0 / SS if soft is None else soft)); return self
    def cut(self, sd): self.a = np.minimum(self.a, 1.0 - td.cover(sd, 1.0 / SS)); return self
    def done(self): return td.downsample(self.a, SS)


def wob(c, seed, amp, cells=5):
    """A noise field (in px) to roughen an SDF edge: hand-made things are never clean."""
    n = td.fbm(c.X.shape[1], c.X.shape[0], cells, cells, octaves=3, seed=seed, tile_x=False, tile_y=False)
    return (n - 0.5) * 2.0 * amp


def text_fit(text, w, h, bridges=True):
    """Largest capital height (px) at which `text` fits a w x h cell."""
    tris, tw, th = brand.text_triangles(text, 1.0, bridges=bridges)
    return min((w - 2 * PAD - 2) / tw, (h - 2 * PAD - 2) / th) * th


def text_cover(text, w, h, cap_px=None, bridges=True, align="centre"):
    """Rasterise stencil text into a (h, w) coverage image: capital height cap_px (default: fit), centred."""
    tris, tw, th = brand.text_triangles(text, 1.0, bridges=bridges)
    s = min((w - 2 * PAD - 2) / tw, (h - 2 * PAD - 2) / th)
    if cap_px is not None: s = min(s, cap_px / th)
    ox = (w - tw * s) / 2 if align == "centre" else PAD
    oy = (h - th * s) / 2
    px = np.empty_like(tris); px[:, :, 0] = tris[:, :, 0] * s + ox; px[:, :, 1] = (th - tris[:, :, 1]) * s + oy
    return td.raster_triangles(px, w, h, ss=SS)


# ------------------------------------------------------------------ the mark
def mark_cast(w, h):
    """The Pellam mark, exact: U chosen so the 2.44 U x 3.75 U box fills the region less the padding."""
    U = min((w - 2 * PAD - 2) / brand.MARK_W, (h - 2 * PAD - 2) / (1.0 + brand.DISC_R - brand.SEVENTH_Y + brand.SEVENTH_R))
    c = Canvas(w, h)
    cx = w / 2.0; cz = h / 2.0 - brand.mark_centre_offset(U)          # ring centre, image Y down
    c.add(brand.mark_coverage(c.X - cx, -(c.Y - cz), U, open_discs=True))
    return c.done(), {"U_px": U, "ring_centre_px": [cx, cz]}


def mark_brush(w, h, seed, discs=6, blob=False):
    """The town's hand-brushed copy: uneven solid discs, a dragged stroke that wanders, a thumb-print seventh.
    Variant c: five discs and a blob (they miscounted)."""
    rng = np.random.default_rng(seed)
    U = min((w - 16) / 2.6, (h - 14) / 3.9)
    c = Canvas(w, h)
    cx = w / 2.0 + rng.uniform(-2, 2); cz = 10 + 1.25 * U
    edge = wob(c, seed, 2.2, 7)
    for n in range(6):
        if n >= discs: break
        a = math.radians(30 + 60 * n + rng.uniform(-9, 9))
        r = U * rng.uniform(0.9, 1.08)
        dx, dz = math.sin(a) * r, -math.cos(a) * r
        rad = U * rng.uniform(0.27, 0.37)
        ex = rng.uniform(0.8, 1.25)
        sd = np.hypot((c.X - cx - dx) / ex, (c.Y - cz - dz)) - rad
        c.add(sd + edge)
    if blob:                                                           # where the sixth should be: a smear, dragged
        a = math.radians(30 + 60 * 5); dx, dz = math.sin(a) * U, -math.cos(a) * U
        sd = td.sd_segment(c.X, c.Y, cx + dx - 3, cz + dz - 2, cx + dx + 9, cz + dz + 7, U * 0.22)
        c.add(sd + edge * 1.6)
    # the stroke: one drag of the brush, thick where it lands, starved at the end
    steps = 14; px = cx + rng.uniform(-1, 1); pz = cz + 0.1 * U
    for i in range(steps):
        t = i / (steps - 1)
        nx = cx + math.sin(t * 2.3 + seed) * U * 0.10 + rng.uniform(-0.6, 0.6); nz = cz + (0.1 + 2.0 * t) * U
        wd = U * (0.12 * (1.0 - 0.5 * t) + 0.03)
        c.add(td.sd_segment(c.X, c.Y, px, pz, nx, nz, wd) + edge * (0.5 + t))
        px, pz = nx, nz
    # the seventh: a thumb print
    sd = np.hypot((c.X - px - 1.0) / 1.15, (c.Y - (cz + 2.42 * U)) / 0.95) - U * 0.34
    c.add(sd + edge * 1.2)
    # dry brush: starve the paint here and there
    dry = td.fbm(c.X.shape[1], c.X.shape[0], 18, 30, octaves=2, seed=seed + 9, tile_x=False, tile_y=False)
    c.a *= np.clip((dry - 0.16) * 9.0, 0.0, 1.0)
    return c.done()


def strike(w, h):
    """One ruled pencil line with a slight start hook (laid at 22 degrees through every door mark, by geometry)."""
    c = Canvas(w, h)
    y = h / 2.0
    c.add(td.sd_segment(c.X, c.Y, 12.0, y, w - 8.0, y, 1.9))
    c.add(td.sd_segment(c.X, c.Y, 12.0, y, 6.5, y + 5.0, 1.7))      # the hook where the pencil lands
    c.add(td.sd_segment(c.X, c.Y, 6.5, y + 5.0, 5.0, y + 3.0, 1.4))
    return c.done()


# ------------------------------------------------------------------ pictograms (exact, Pellam's hand)
def arrow(c, x0, y0, x1, y1, shaft, head):
    d = math.hypot(x1 - x0, y1 - y0); ux, uy = (x1 - x0) / d, (y1 - y0) / d
    bx, by = x1 - ux * head, y1 - uy * head
    c.add(td.sd_segment(c.X, c.Y, x0, y0, bx, by, shaft))
    c.add(td.sd_polygon(c.X, c.Y, [(x1, y1), (bx - uy * head * 0.62, by + ux * head * 0.62), (bx + uy * head * 0.62, by - ux * head * 0.62)]))


def cartridge(c, cx, top, bot, r, band=True):
    """A cartridge standing on its base, nose up: rim, case, ogive; with a band round its waist."""
    c.add(td.sd_box(c.X, c.Y, cx, bot - r * 0.16, r * 1.22, r * 0.16, r * 0.1))                 # rim
    case_top = top + (bot - top) * 0.36
    c.add(td.sd_box(c.X, c.Y, cx, (case_top + bot) / 2, r, (bot - case_top) / 2))               # case
    nose = np.maximum(np.hypot((c.X - cx) / (r * 0.86), (c.Y - case_top) / (case_top - top)) - 1.0, c.Y - case_top) * r * 0.86
    c.add(nose)
    if band:
        y = case_top + (bot - case_top) * 0.42
        c.cut(td.sd_box(c.X, c.Y, cx, y - r * 0.36, r * 1.3, r * 0.10))
        c.cut(td.sd_box(c.X, c.Y, cx, y + r * 0.36, r * 1.3, r * 0.10))


def picto_charge(w, h):
    c = Canvas(w, h)
    cartridge(c, w / 2.0, 10.0, h - 10.0, w * 0.27)
    return c.done()


def picto_daycell(w, h):
    """sun -> disc ; open hatch: daylight on the cell opens the hatch. Four signs in a row."""
    c = Canvas(w, h); y = h / 2.0; q = w / 4.0
    cx = q * 0.5                                                       # sun: a disc with eight rays
    c.add(td.sd_circle(c.X, c.Y, cx, y, 9.0))
    for k in range(8):
        a = k * math.pi / 4
        c.add(td.sd_segment(c.X, c.Y, cx + math.cos(a) * 14, y + math.sin(a) * 14, cx + math.cos(a) * 21, y + math.sin(a) * 21, 2.2))
    arrow(c, q * 1.0 + 6, y, q * 2.0 - 8, y, 2.6, 13.0)                # arrow
    cx = q * 2.5                                                       # the day cell: a disc in a bezel on a drop arm
    c.add(td.sd_ring(c.X, c.Y, cx, y + 4, 19.0, 15.0)); c.add(td.sd_circle(c.X, c.Y, cx, y + 4, 10.5))
    c.add(td.sd_box(c.X, c.Y, cx, y - 20, 2.6, 7.0))
    cx = q * 3.5                                                       # open hatch: two leaves parted, a gap between
    c.add(td.sd_box(c.X, c.Y, cx - 19, y + 6, 9.0, 3.2)); c.add(td.sd_box(c.X, c.Y, cx + 19, y + 6, 9.0, 3.2))
    c.add(td.sd_box(c.X, c.Y, cx, y + 16, 29.0, 2.2))
    arrow(c, cx - 4, y - 6, cx - 22, y - 6, 2.0, 8.0); arrow(c, cx + 4, y - 6, cx + 22, y - 6, 2.0, 8.0)
    return c.done()


def picto_line(w, h):
    """three discs, one line through them, one eye: sight one line through all it meets."""
    c = Canvas(w, h); y = h / 2.0
    ex = 34.0                                                          # the eye: a lens outline and a pupil
    up = td.sd_circle(c.X, c.Y, ex, y + 13.0, 22.0); dn = td.sd_circle(c.X, c.Y, ex, y - 13.0, 22.0)
    lens = np.maximum(up, dn)
    c.add(np.abs(lens + 2.2) - 2.2)
    c.add(td.sd_circle(c.X, c.Y, ex, y, 5.6))
    for cx in (104.0, 156.0, 208.0): c.add(td.sd_ring(c.X, c.Y, cx, y, 15.0, 10.0))
    c.add(td.sd_segment(c.X, c.Y, 62.0, y, w - 12.0, y, 2.2))
    return c.done()


def picto_misc(i, w, h):
    c = Canvas(w, h); cx, cy = w / 2.0, h / 2.0
    if i == 0:                                                         # arrow (pointing right; rotate by geometry)
        arrow(c, 10, cy, w - 8, cy, 5.0, 24.0)
    elif i == 1:                                                       # stand here: a pair of footprints
        for sx, rot in ((-1, -0.16), (1, 0.16)):
            fx = cx + sx * 11
            c.add(np.hypot((c.X - fx - (c.Y - cy) * rot) / 7.5, (c.Y - cy + 6) / 15.0) * 7.5 - 7.5)       # sole
            c.add(np.hypot((c.X - fx - (c.Y - cy) * rot) / 6.0, (c.Y - cy - 17) / 6.0) * 6.0 - 6.0)        # heel
    elif i == 2:                                                       # hand off: a flat palm and a bar through it
        c.add(td.sd_box(c.X, c.Y, cx, cy + 9, 12.0, 11.0, 5.0))
        for k, fh in enumerate((15.0, 19.0, 20.0, 16.0)):
            fx = cx - 9.6 + k * 6.4
            c.add(td.sd_segment(c.X, c.Y, fx, cy - 1, fx, cy - fh, 2.6))
        c.add(td.sd_segment(c.X, c.Y, cx - 13, cy + 9, cx - 21, cy - 1, 2.6))
        bar = td.sd_segment(c.X, c.Y, 9, h - 12, w - 9, 12, 3.0)
        c.cut(bar - 2.6); c.add(bar)
    elif i == 3:                                                       # tone wave: three arcs from a point
        c.add(td.sd_circle(c.X, c.Y, 13, cy, 5.0))
        for r in (17.0, 28.0, 39.0):
            ring = np.abs(np.hypot(c.X - 13, c.Y - cy) - r) - 2.3
            c.add(np.maximum(ring, np.abs(c.Y - cy) - (c.X - 13) * 0.9))
    elif i == 4:                                                       # drop (water)
        r = 14.0; by = cy + 9
        c.add(td.sd_circle(c.X, c.Y, cx, by, r))
        c.add(td.sd_polygon(c.X, c.Y, [(cx, cy - 25), (cx + r * 0.93, by - r * 0.36), (cx - r * 0.93, by - r * 0.36)]))
    else:                                                              # no keep: a charge with a return arrow round it
        cartridge(c, cx, 13.0, h - 12.0, 7.0)
        ring = np.abs(np.hypot(c.X - cx, c.Y - cy) - 24.0) - 2.1
        c.add(np.maximum(ring, -(np.abs(c.Y - cy + 4) - 0) + 0 * ring - 1e9 * 0))
        gap = td.sd_box(c.X, c.Y, cx + 22, cy - 11, 9.0, 7.0)
        c.cut(gap)
        c.add(td.sd_polygon(c.X, c.Y, [(cx + 24.0, cy - 2.0), (cx + 16.5, cy - 12.0), (cx + 31.0, cy - 12.5)]))
    return c.done()


# ------------------------------------------------------------------ the town's hand: chalk and brands
def tally(i, w, h, seed):
    """Chalk strokes in bundles of five; a shaky variant; a count left at three; a ruled underline."""
    rng = np.random.default_rng(seed + i)
    c = Canvas(w, h)
    edge = wob(c, seed + i, 1.1, 9)
    def bundle(x0, n, shake):
        for k in range(min(n, 4)):
            x = x0 + k * 9.0 + rng.uniform(-1, 1) * (1 + shake)
            top = 12 + rng.uniform(-3, 3) * (1 + shake); bot = h - 12 + rng.uniform(-3, 3) * (1 + shake)
            lean = rng.uniform(-2.5, 2.5) * (1 + shake * 1.5)
            if shake:
                mid = (x + rng.uniform(-2.5, 2.5), (top + bot) / 2)
                c.add(td.sd_segment(c.X, c.Y, x + lean, top, mid[0], mid[1], 1.9) + edge)
                c.add(td.sd_segment(c.X, c.Y, mid[0], mid[1], x - lean, bot, 1.9) + edge)
            else:
                c.add(td.sd_segment(c.X, c.Y, x + lean, top, x - lean, bot, 2.0) + edge)
        if n >= 5:
            c.add(td.sd_segment(c.X, c.Y, x0 - 6, h - 17 + rng.uniform(-3, 3), x0 + 33, 17 + rng.uniform(-3, 3), 2.0) + edge)
    if i == 0: bundle(12, 5, 0); bundle(68, 5, 0)
    elif i == 1: bundle(12, 5, 1); bundle(68, 5, 1)
    elif i == 2: bundle(14, 5, 0); bundle(72, 3, 0.4)
    else:
        c.add(td.sd_segment(c.X, c.Y, 8, h / 2 + 1, w - 8, h / 2 - 1, 1.8) + edge * 0.5)
    chalk = td.fbm(c.X.shape[1], c.X.shape[0], 40, 20, octaves=2, seed=seed + 20 + i, tile_x=False, tile_y=False)
    c.a *= np.clip((chalk - 0.22) * 5.0, 0.0, 1.0)                     # chalk skips on the board
    return c.done()


def family_mark(i, w, h):
    """Household glyphs burnt or brushed: combinations of bar, hook, dot and chevron. No letters."""
    c = Canvas(w, h); cx, cy = w / 2.0, h / 2.0; t = 2.7
    edge = wob(c, 900 + i, 0.9, 6)
    def bar(x0, y0, x1, y1): c.add(td.sd_segment(c.X, c.Y, cx + x0, cy + y0, cx + x1, cy + y1, t) + edge)
    def dot(x, y, r=4.0): c.add(td.sd_circle(c.X, c.Y, cx + x, cy + y, r) + edge)
    def chevron(y, s=1.0, up=True):
        k = -1 if up else 1
        bar(-12 * s, y - k * 7 * s, 0, y + k * 7 * s); bar(0, y + k * 7 * s, 12 * s, y - k * 7 * s)
    def hook(x, y0, y1, side=1):
        bar(x, y0, x, y1); bar(x, y1, x + side * 8, y1); bar(x + side * 8, y1, x + side * 8, y1 - 7)
    g = [
        lambda: (bar(-13, 0, 13, 0), dot(0, -11), dot(0, 11)),
        lambda: (chevron(-6), bar(-13, 12, 13, 12)),
        lambda: (hook(-6, -15, 13), dot(9, -9)),
        lambda: (bar(-9, -15, -9, 15), bar(9, -15, 9, 15), dot(0, 0)),
        lambda: (chevron(-9), chevron(7)),
        lambda: (bar(0, -16, 0, 6), chevron(12, 0.9, up=False), dot(-11, -8), dot(11, -8)),
        lambda: (hook(-10, -14, 12, 1), hook(10, -14, 12, -1) if False else bar(10, -14, 10, 12)),
        lambda: (bar(-14, -9, 14, -9), bar(-14, 9, 14, 9), bar(0, -9, 0, 9)),
        lambda: (dot(-10, -10), dot(10, -10), dot(0, 3), bar(-13, 15, 13, 15)),
        lambda: (chevron(-2, 1.15), dot(0, 12)),
        lambda: (bar(-13, -13, 13, 13), hook(-12, 2, 14, 1) if False else dot(-10, 10), dot(10, -10)),
        lambda: (hook(0, -16, 4, 1), bar(-13, 14, 13, 14), dot(-9, -9)),
    ]
    g[i]()
    return c.done()


# ------------------------------------------------------------------ cut-outs
def grille(w, h):
    """Catwalk and grate mesh, tiling: 40 mm bars at 120 mm pitch (bars are fat: the 2-pixel rule). 4 x 4 cells."""
    X, Y = td.grid(w, h, SS)
    p = w / 4.0; bar = p / 3.0
    dx = np.abs(((X + bar / 2) % p) - bar / 2) - bar / 2; dy = np.abs(((Y + bar / 2) % p) - bar / 2) - bar / 2
    return td.downsample(td.cover(np.minimum(dx, dy), 1.0 / SS), SS)


def louvre(w, h):
    """Vent slats, tiling in U and V: four slats per tile, opaque slat 11 px, gap 5 px."""
    X, Y = td.grid(w, h, SS)
    p = h / 4.0
    d = np.abs((Y % p) - p * 0.345) - p * 0.345
    return td.downsample(td.cover(d, 1.0 / SS), SS)


def card_edge(i, w, h, seed):
    """Opaque above, ragged below: 0 torn cloth hem, 1 coat hem, 2 frayed canvas. Tiles in U within its cell."""
    c = Canvas(w, h)
    n = c.X.shape[1]
    x = c.X[0:1, :]
    def per(cells, sd, amp):                                           # periodic 1D noise across the cell
        return (td.fbm(n, 1, cells, 1, octaves=3, seed=sd)[0:1, :] - 0.5) * 2 * amp
    if i == 0:
        line = h * 0.52 + per(3, seed, 22) + per(14, seed + 1, 7) + per(40, seed + 2, 2.5)
        c.add(c.Y - line)
        for k in range(5):                                             # hanging shreds
            sx = (k + 0.5) * w / 5 + ((k * 37) % 11 - 5); l = 12 + (k * 53) % 26
            y0 = float(np.interp(sx, x[0], line[0])) - 3
            c.add(td.sd_segment(c.X, c.Y, sx, y0, sx + ((k * 7) % 5 - 2), y0 + l, 1.6))
    elif i == 1:
        line = h * 0.78 + per(2, seed + 5, 6) + np.abs(np.sin(x / w * math.pi * 3)) * -7 + per(30, seed + 6, 1.6)
        c.add(c.Y - line)
    else:
        line = h * 0.60 + per(4, seed + 9, 5) + per(24, seed + 10, 2)
        c.add(c.Y - line)
        thr = td.value_noise(n, 1, 44, 1, seed + 11)[0:1, :]
        ln = 6 + thr * 30
        thread = (np.abs(((c.X + 1.6) % 4.4) - 1.6) - 1.05)
        c.add(np.maximum(thread, np.maximum(line - 2 - c.Y, c.Y - (line + ln))))
    out = c.done()
    out[:PAD] = 1.0 if True else out[:PAD]
    return out


def card_dowser(w, h):
    """The Dowser, three-quarter AWAY (we see his back and his right side), clerkly and upright, weight on the left
    leg; a long coat with a back vent and a turned-up collar; a flat-crowned hat, its brim level. No face (he looks
    away), no robe, no hood. (Drawn by art-props-dress, docs/requests/art-props-dress.md row 1; ART_BIBLE 6.5. Same rectangle.)
    Polish round 4 (exterior look; the story critic: "the line names a forked rod that cannot be seen"): the card is seen
    30 px tall, 250 m off, where one screen pixel is ten of these. The rod was a 2 px line held low against the coat. He
    now stands in the left of the rectangle and holds the rod OUT at his right arm's length, upright, clear of his
    body and his hat: a Y nine pixels thick, its two tines a hand apart against the sky (the glint is the outer tine's tip)."""
    c = Canvas(w, h)
    X, Y = c.X, c.Y
    cx = w * 0.30; top = 9.0; foot = h - 7.0
    H = foot - top
    # hat: a level brim (a thin lens, the near side a little lower: we see it from just above its rim), a flat crown
    brim_y = top + H * 0.062
    c.add(td.sd_polygon(X, Y, [(cx - w * 0.235, brim_y + 1.5), (cx - w * 0.05, brim_y - 2.8), (cx + w * 0.15, brim_y - 2.6),
                               (cx + w * 0.255, brim_y + 0.6), (cx + w * 0.12, brim_y + 3.4), (cx - w * 0.10, brim_y + 3.6)]) - 1.0)
    c.add(td.sd_polygon(X, Y, [(cx - w * 0.095, brim_y - 1), (cx - w * 0.085, top + 1.5), (cx + w * 0.105, top + 0.5), (cx + w * 0.115, brim_y - 1)]) - 1.2)
    # the back of the head and the turned-up collar (no face: he looks away, up the slope)
    head_y = brim_y + 6.5
    c.add(np.hypot((X - cx - 2.5) / 8.0, (Y - head_y) / 7.0) * 7.0 - 7.0)
    sh = brim_y + H * 0.085                                             # shoulder line
    c.add(td.sd_polygon(X, Y, [(cx - 7, head_y + 4), (cx + 11, head_y + 3.5), (cx + 15, sh + 3), (cx - 10, sh + 4)]) - 1.0)
    c.cut(td.sd_segment(X, Y, cx - 6, head_y + 6.5, cx + 11, head_y + 6.0, 0.7))   # the collar's edge against the neck
    # the coat: shoulders squared (his right, nearer us, a little lower), falling straight to a flared hem at mid-calf
    hem = foot - H * 0.16
    coat = [(cx - w * 0.20, sh + 3), (cx - w * 0.02, sh - 2), (cx + w * 0.19, sh + 1), (cx + w * 0.235, sh + 9),
            (cx + w * 0.215, sh + H * 0.30), (cx + w * 0.255, hem - 3), (cx + w * 0.17, hem + 2), (cx - w * 0.02, hem + 4),
            (cx - w * 0.235, hem), (cx - w * 0.215, sh + H * 0.30), (cx - w * 0.235, sh + 10)]
    c.add(td.sd_polygon(X, Y, coat) - 2.5)
    # legs and boots under the hem: the left leg straight under him, the right half a step back (its heel turned up)
    c.add(td.sd_box(X, Y, cx - w * 0.07, (hem + foot) / 2 - 2, 5.0, (foot - hem) / 2, 1.5))
    c.add(td.sd_box(X, Y, cx - w * 0.07 + 2, foot - 3, 7.5, 3.2, 2.0))
    c.add(td.sd_segment(X, Y, cx + w * 0.09, hem, cx + w * 0.13, foot - 7, 4.6))
    c.add(td.sd_polygon(X, Y, [(cx + w * 0.10, foot - 9), (cx + w * 0.19, foot - 7), (cx + w * 0.18, foot - 3), (cx + w * 0.11, foot - 3.5)]) - 1.2)
    # the near (right) arm, straight, held out and down from the shoulder; the far arm only as an elbow
    hand = (cx + w * 0.50, sh + H * 0.175)
    c.add(td.sd_segment(X, Y, cx + w * 0.19, sh + 7, cx + w * 0.36, sh + H * 0.105, 6.2)); c.add(td.sd_segment(X, Y, cx + w * 0.36, sh + H * 0.105, hand[0], hand[1], 5.4))
    c.add(np.hypot(X - hand[0], Y - hand[1]) - 6.6)                       # the fist
    c.add(td.sd_segment(X, Y, cx - w * 0.205, sh + 10, cx - w * 0.245, sh + H * 0.17, 4.2))
    # the rod: the stem up from the fist, then the two tines parting (each as thick as a screen pixel at 250 m)
    meet = (hand[0] + 5.0, hand[1] - 30.0)
    tip_in = (hand[0] - 5.0, max(top + 4.0, hand[1] - 72.0)); tip = (min(w - 8.0, hand[0] + 19.0), max(top + 8.0, hand[1] - 68.0))
    c.add(td.sd_segment(X, Y, hand[0], hand[1] + 9.0, meet[0], meet[1], 4.6))
    c.add(td.sd_segment(X, Y, meet[0], meet[1], tip_in[0], tip_in[1], 4.3))
    c.add(td.sd_segment(X, Y, meet[0], meet[1], tip[0], tip[1], 4.3))
    # cut the coat: the back vent from the waist to the hem
    c.cut(td.sd_segment(X, Y, cx + w * 0.015, sh + H * 0.40, cx + w * 0.03, hem + 3, 1.1))
    tip = (tip[0] - 1.0, tip[1] + 2.5)
    return c.done(), {"glint_px": [float(tip[0]), float(tip[1])]}


def build():
    img = np.zeros((H, W), dtype=np.float32)
    tab = table(); info = {}
    def put(name, a, cell=None):
        x, y, w, h = (cells_of(name)[cell] if cell is not None else LAYOUT[name][:4])
        a = np.array(a, dtype=np.float32)
        if name not in ("grille", "louvre", "card_edges"):               # keep a clear border (tiles run to the edge)
            m = np.zeros_like(a); m[PAD:h - PAD, PAD:w - PAD] = 1.0; a = a * m
        img[y:y + h, x:x + w] = a
    a, info["mark_cast"] = mark_cast(128, 192); put("mark_cast", a)
    put("mark_brush_a", mark_brush(96, 144, 11)); put("mark_brush_b", mark_brush(96, 144, 29))
    put("mark_brush_c", mark_brush(96, 144, 47, discs=5, blob=True))
    put("strike", strike(256, 32))
    put("picto_charge", picto_charge(96, 192)); put("picto_daycell", picto_daycell(256, 64)); put("picto_line", picto_line(256, 64))
    for i in range(6): put("picto_misc", picto_misc(i, 64, 64), i)
    for i in range(10): put("numerals", text_cover(str(i), 64, 96, cap_px=78), i)
    put("wordmark", text_cover("PELLAM DEEPWORKS", 512, 48))
    put("station", text_cover("LIFT STATION 4", 384, 48))
    cap = min(text_fit(s, 384, 32, bridges=False) for s in PLATE_LINES)        # one size for all four lines
    for i, s in enumerate(PLATE_LINES): put("plate_lines", text_cover(s, 384, 32, cap_px=cap, bridges=False, align="left"), i)
    tab["regions"]["plate_lines"]["cap_px"] = cap
    for i in range(4): put("tally", tally(i, 128, 64, 500), i)
    for i in range(12): put("family_marks", family_mark(i, 48, 48), i)
    put("grille", grille(128, 128)); put("louvre", louvre(128, 64))
    for i in range(3):
        cw = cells_of("card_edges")[i][2]
        put("card_edges", card_edge(i, cw, 128, 700), i)
    a, info["card_dowser"] = card_dowser(128, 288); put("card_dowser", a)
    for k, v in info.items(): tab["regions"][k].update(v)
    return img, tab


def main():
    import bpy
    bpy.ops.wm.read_factory_settings(use_empty=True)
    out = sys.argv[sys.argv.index("--out") + 1]
    img, tab = build()
    td.write_json_if_changed(os.path.join(manifest.LIB, "mask_regions.json"), tab)
    td.write_png(out, img)
    print(f"OK tx_mask {len(tab['regions'])} regions, coverage {float((img > 0.5).mean()) * 100:.1f} % -> {out}")


if __name__ == "__main__":
    try: main()
    except SystemExit: raise
    except BaseException:
        import traceback; traceback.print_exc(); sys.exit(1)
