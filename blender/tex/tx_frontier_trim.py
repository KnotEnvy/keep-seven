"""tx_frontier_trim: 1024 x 512 greyscale detail (R8). Horizontal strips, each tiling in U (ART_BIBLE 4.1, 4.2).

    node tools/build-assets.mjs --only tx_frontier_trim

`out = vertex colour x detail x 2`: neutral is 0.5, values stay in 0.38..0.62 except drawn seam lines, nail heads and
cracks (down to 0.22: the darkest stored value is 58 / 255, so neither the 8-bit PNG nor the near-lossless WebP goes
under the art bible's floor). It never carries colour. Rows (top to bottom, px tall, world size of the row / of one U repeat):

    plank_a    64   0.20 m x 3.6 m   one board: grain, a check, two nail heads every 1.2 m
    plank_b    64   0.20 m x 3.6 m   a second board: a knot, a split running in from u = 0 (put a board's end there)
    plank_end  32   0.10 m x 3.2 m   end grain, eight board ends of 0.4 m
    adobe     128   2.0 m  x 8.0 m   trowel sweep, three hairline cracks, exposed brick course along the lower edge
    tin        64   0.8 m  x 4.0 m   corrugation as 12 soft bars per 1.0 m sheet, running ACROSS the row (so the row may
                                     be stretched to any height), side laps every metre, nails on the crowns
    strata     96   3.0 m  x 8.0 m   five uneven bedding bands for rock
    strap      32   0.06 m x 2.4 m   iron strap, a rivet every 0.15 m
    cord       32   0.04 m x 0.64 m  twisted cord
    flat       16 x 16 px of uniform 0.5 (128) at (736, 192), in the adobe row. Embedded props and flat parts point UV0
               at its centre. The plaster fades to 0.5 round it without an edge (tests/pipeline/textures.test.mjs), and
               it lies on the 16 px grid: exact at its centre through mip 4.

The row table is written to blender/lib/tx_frontier_trim.json (`manifest.trim_v`, `uv.map_to_trim`).
APPEND-ONLY after phase 2: a row or the flat cell never moves. The sheet is full; a new strip needs a new texture.
"""
import sys, os, math
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
while not (os.path.isfile(os.path.join(_d, "lib", "__init__.py")) or os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py"))):
    if os.path.dirname(_d) == _d: raise SystemExit(f"blender/lib not found above {os.path.abspath(__file__)}")   # never loop at the filesystem root
    _d = os.path.dirname(_d)
sys.path.insert(0, _d if os.path.isfile(os.path.join(_d, "lib", "__init__.py")) else os.path.join(_d, "blender"))
import numpy as np
from lib import texdraw as td, manifest

W, H = 1024, 512
ROWS = [  # name, px tall, metres_v (world height of the row), metres_u (world length of one U repeat)
    ("plank_a", 64, 0.20, 3.6), ("plank_b", 64, 0.20, 3.6), ("plank_end", 32, 0.10, 3.2), ("adobe", 128, 2.0, 8.0),
    ("tin", 64, 0.8, 4.0), ("strata", 96, 3.0, 8.0), ("strap", 32, 0.06, 2.4), ("cord", 32, 0.04, 0.64),
]
FLAT = (736, 192, 16, 16)       # x, y (sheet pixels, top-left origin), w, h: in the adobe row's plaster, on the 16 px grid


def grain(w, h, seed, warp=None, lines=22.0, strength=0.075):
    """Wood grain along U: long streaks + fine growth lines that wander. warp = optional (h, w) offset in px added to
    the line phase (bends the grain round a knot)."""
    X, Y = td.grid(w, h)
    streak = td.fbm(w, h, 5, 14, octaves=3, seed=seed) - 0.5                      # long soft streaks
    fine = td.fbm(w, h, 24, 40, octaves=2, seed=seed + 7) - 0.5                   # fibre
    wander = (td.fbm(w, h, 4, 3, octaves=3, seed=seed + 3) - 0.5) * 7.0           # px of sideways drift of the lines
    ph = (Y + wander + (warp if warp is not None else 0.0)) / h * lines
    saw = np.abs((ph % 1.0) - 0.5) * 2.0                                          # 0 at a line centre
    line = np.clip(1.0 - saw * 2.6, 0, 1) ** 1.5                                  # thin dark growth lines
    vary = td.value_noise(w, h, 9, 13, seed + 11)                                 # lines fade in and out
    return streak * 0.20 + fine * 0.07 - line * strength * (0.25 + vary), X, Y


def plank(w, h, seed, kind):
    warp = None; X, Y = td.grid(w, h)
    knot = None
    if kind == "b":                                                               # a knot: grain flows round it
        kx, ky = 610.0, h * 0.60
        dx = td.wrap_dx(X, kx, w); dy = Y - ky
        r2 = (dx / 30.0) ** 2 + (dy / 11.0) ** 2
        warp = np.sign(dy + 1e-6) * 9.0 * np.exp(-r2 * 0.9)
        knot = (dx, dy)
    a, X, Y = grain(w, h, seed, warp)
    a = a + 0.5
    seam = np.zeros((h, w), dtype=np.float32)
    # the long edges: a worn arris, then the shadow gap between boards
    edge = np.minimum(Y, h - Y)
    a -= 0.05 * np.clip(1.0 - edge / 5.0, 0, 1)
    td.hline(a, seam, Y, 0.0, 1.3, 0.27); td.hline(a, seam, Y, float(h), 1.3, 0.27)
    # a weathering check: a hairline along the grain, fading at both ends
    cx, cy, ln = (250.0, h * 0.36, 150.0) if kind == "a" else (860.0, h * 0.30, 110.0)
    dx = td.wrap_dx(X, cx, w)
    wav = (td.value_noise(w, h, 18, 1, seed + 5)[0:1, :] - 0.5) * 3.0
    c = td.cover(np.abs(Y - cy - wav) - 0.55, 1.2) * np.clip(1.0 - np.abs(dx) / ln, 0, 1) ** 0.6
    td.over(a, c, 0.26); np.maximum(seam, c, out=seam)
    # two nail heads every 1.2 m (3 pairs per 3.6 m repeat), each with a short dark weep below
    for k in range(3):
        nx = (k + 0.5) * w / 3.0 + (11.0 if kind == "b" else 0.0)
        for ny in (h * 0.24, h * 0.76):
            dxn = td.wrap_dx(X, nx, w)
            weep = np.clip(1.0 - np.abs(dxn) / 1.6, 0, 1) * np.clip((Y - ny) / 2.0, 0, 1) * np.clip(1.0 - (Y - ny) / 13.0, 0, 1)
            a -= 0.045 * weep
            td.dot(a, seam, X, Y, nx, ny, 2.3, 0.25, w)
            a += 0.05 * td.cover(np.hypot(dxn + 0.9, Y - ny + 0.9) - 0.8, 1.0)       # a glint on the head
    if kind == "b":
        dx, dy = knot
        r = np.sqrt((dx / 13.0) ** 2 + (dy / 7.0) ** 2)
        a -= 0.085 * np.clip(1.0 - r, 0, 1)                                        # dark heart
        ring = td.cover(np.abs(r - 1.0) * 6.0 - 0.6, 1.5)
        td.over(a, ring * 0.8, 0.30); np.maximum(seam, ring * 0.8, out=seam)
        a += 0.02 * np.cos(r * 11.0) * np.clip(1.0 - r, 0, 1)
        # a split running in from the board end at u = 0, tapering over 0.42 m
        sx = td.wrap_dx(X, 0.0, w); ln = 120.0
        t = np.clip(sx / ln, 0, 1)
        wob = (td.value_noise(w, h, 30, 1, seed + 9)[0:1, :] - 0.5) * 4.0
        half = 1.5 * (1.0 - t) ** 0.7
        c = td.cover(np.abs(Y - h * 0.52 - wob - t * 4.0) - half, 1.1) * np.clip((sx - 2.0) / 4.0, 0, 1) * (sx <= ln)   # starts 2 px in: the row still tiles
        td.over(a, c, 0.23); np.maximum(seam, c, out=seam)
    return td.finish_detail(a, seam)


def plank_end(w, h, seed):
    """Eight board ends of 128 px: growth rings seen end-on, radial checks, a saw-cut gap between boards."""
    X, Y = td.grid(w, h)
    a = np.full((h, w), 0.5, dtype=np.float32); seam = np.zeros((h, w), dtype=np.float32)
    rng = np.random.default_rng(seed)
    cell = w / 8.0
    idx = np.floor(X / cell).astype(np.int64)
    ox = rng.uniform(-0.35, 0.35, 8).astype(np.float32); oy = rng.uniform(1.4, 3.2, 8).astype(np.float32)
    fr = rng.uniform(0.75, 1.05, 8).astype(np.float32)
    lx = X - (idx + 0.5) * cell
    cx = ox[idx] * cell; cy = oy[idx] * h                                          # ring centre, below the board
    r = np.hypot(lx - cx, Y - cy)
    rough = (td.fbm(w, h, 32, 6, octaves=2, seed=seed + 2) - 0.5)
    a += 0.055 * np.sin(r * fr[idx] * 0.95 + rough * 2.5) + rough * 0.06
    ang = np.arctan2(Y - cy, lx - cx)
    chk = np.clip(1.0 - np.abs(np.sin(ang * 9.0 + idx * 1.7)) * 14.0, 0, 1) * (td.value_noise(w, h, 16, 3, seed + 4) > 0.62)
    td.over(a, chk * 0.7, 0.28); np.maximum(seam, chk * 0.7, out=seam)
    tone = rng.uniform(-0.035, 0.035, 8).astype(np.float32)
    a += tone[idx]
    for k in range(8): td.vline(a, seam, X, k * cell, 1.2, 0.25, w)
    td.hline(a, seam, Y, 0.0, 1.0, 0.30); td.hline(a, seam, Y, float(h), 1.0, 0.30)
    return td.finish_detail(a, seam)


def adobe(w, h, seed, flat_local):
    """Plaster with a soft trowel sweep, three hairline cracks and a course of exposed brick along the lower edge."""
    X, Y = td.grid(w, h)
    seam = np.zeros((h, w), dtype=np.float32)
    # trowel: broad overlapping arcs, plus sand in the plaster
    sweep = td.fbm(w, h, 6, 2, octaves=3, seed=seed) - 0.5
    arcs = np.sin((X / w * 2 * math.pi * 7.0) + Y / h * 3.2 + sweep * 9.0) * 0.5
    arcs2 = np.sin((X / w * 2 * math.pi * 13.0) - Y / h * 5.0 + sweep * 6.0) * 0.5
    speck = td.value_noise(w, h, 256, 40, seed + 1) - 0.5
    broad = td.fbm(w, h, 3, 1, octaves=2, seed=seed + 40) - 0.5
    # pass i2 ("single flat-coloured planes several metres across"): the broad tone and the trowel's sweep half as strong again
    a = 0.5 + sweep * 0.22 + broad * 0.16 + arcs * 0.05 + arcs2 * 0.028 + speck * 0.04
    # three hairline cracks: wandering, mostly vertical, one branching toward the brick
    rng = np.random.default_rng(seed + 3)
    for i, (cx, y0, y1, lean) in enumerate(((150.0, 4.0, 86.0, 0.25), (470.0, 30.0, 104.0, -0.4), (905.0, 0.0, 70.0, 0.15))):
        wob = (td.fbm(w, h, 3, 9, octaves=3, seed=seed + 20 + i) - 0.5) * 30.0
        dx = td.wrap_dx(X, cx + (Y - y0) * lean, w) + wob
        t = np.clip((Y - y0) / (y1 - y0), 0, 1)
        fade = np.clip((Y - y0) / 6.0, 0, 1) * np.clip((y1 - Y) / 14.0, 0, 1)
        c = td.cover(np.abs(dx) - (0.2 + 0.6 * (1 - t)), 1.3) * fade
        td.over(a, c * 0.9, 0.25); np.maximum(seam, c * 0.9, out=seam)
    # the eroded foot: plaster gone, brick showing. A ragged line 20..34 px above the bottom edge
    rag = td.fbm(w, h, 9, 1, octaves=4, seed=seed + 5)[0:1, :] * 22.0 + (td.fbm(w, h, 60, 1, octaves=2, seed=seed + 6)[0:1, :] - 0.5) * 5.0
    line = h - 20.0 - rag
    below = td.cover(line - Y, 1.5)                                                # 1 below the ragged line
    bh = 12.0; rowi = np.floor((Y - (h - 3 * bh)) / bh)
    bw = w / 24.0                                                                  # 24 bricks per repeat: 0.33 m each
    off = (rowi % 2) * 0.5 * bw
    bx = ((X + off) % bw) / bw; by = ((Y - (h - 3 * bh)) % bh) / bh
    bid = (np.floor((X + off) / bw) % 24.0) + rowi * 37.0                 # wraps with the row: the sheet tiles in U
    tone = (np.sin(bid * 12.9898) * 43758.5453) % 1.0
    brick = 0.47 + (tone - 0.5) * 0.09 + (td.value_noise(w, h, 128, 30, seed + 8) - 0.5) * 0.05
    mort = np.maximum(td.cover((np.minimum(bx, 1 - bx) * bw) - 1.3, 1.2) * 0 + (np.minimum(bx, 1 - bx) * bw < 1.2),
                      (np.minimum(by, 1 - by) * bh < 1.1)).astype(np.float32)
    mort = td.blur(mort, 0.6)
    brick = brick * (1 - mort) + 0.30 * mort
    lip = td.cover(np.abs(Y - line) - 1.2, 1.5)                                    # the broken plaster edge casts a shadow
    a = a * (1 - below) + brick * below
    a -= 0.10 * lip * (1 - below * 0.5)
    np.maximum(seam, mort * below, out=seam); np.maximum(seam, lip * 0.6, out=seam)
    # damp line above the break
    a -= 0.03 * np.clip(1.0 - (line - Y) / 16.0, 0, 1) * (1 - below)
    a = td.finish_detail(a, seam)
    # the flat cell: 16 x 16 px of exactly 0.5 (128). It must not read as a patch on a wall, so the plaster's own
    # detail FADES to 0.5 round it (a smooth bell 30 px wide, no edge anywhere: a spot where the float went over twice),
    # and it sits on the 16 px grid, so mips 0..4 each hold a texel that is the cell alone.
    fx, fy, fw, fh = flat_local
    d = np.maximum(td.sd_box(X, Y, fx + fw / 2, fy + fh / 2, fw / 2, fh / 2), 0.0)
    k = np.exp(-(d / 30.0) ** 2 * 2.0)
    a = 0.5 + (a - 0.5) * (1.0 - k)
    a[fy:fy + fh, fx:fx + fw] = 128.0 / 255.0
    return a


def tin(w, h, seed):
    """Corrugated sheet: 12 soft bars per 1.0 m sheet (ART_BIBLE 4.2), four sheets per 4.0 m repeat. The corrugations
    run ACROSS the row (constant along V), 21.3 px each: broad enough to stay bars through three mip levels, and a
    surface of any height can stretch the row in V without changing their pitch (`uv.map_to_trim` puts U level on
    walls: the sheets stand upright; on a roof give `along` the eave direction). Sheets lap side over side in a
    trough every metre; lead-head nails sit on crowns along two purlin lines; rain streaks run down the troughs."""
    X, Y = td.grid(w, h)
    seam = np.zeros((h, w), dtype=np.float32)
    bars = -np.cos(X / w * 2 * math.pi * 48.0)                                    # 48 = 4 sheets x 12; a trough at every lap
    a = 0.5 + 0.075 * bars
    a += (td.fbm(w, h, 48, 2, octaves=3, seed=seed) - 0.5) * 0.05                 # streaky weathering down the corrugations
    a += (td.fbm(w, h, 6, 3, octaves=2, seed=seed + 1) - 0.5) * 0.035             # dents and oil-canning
    pitch = w / 48.0
    for k in range(4):                                                             # side laps: 1.0 m sheets
        x = k * w / 4.0
        dx = td.wrap_dx(X, x, w)
        a -= 0.05 * np.clip(1.0 - np.abs(dx - 3.0) / 5.0, 0, 1) * (dx > 0)         # shadow of the lapping edge
        td.vline(a, seam, X, x, 0.8, 0.27, w)
        for crown in (0, 3, 6, 9):                                                 # lead-head nails on every third crown, at two purlins
            nx = x + (crown + 0.5) * pitch
            for ny in (h * 0.22, h * 0.78):
                td.dot(a, seam, X, Y, nx, ny, 2.0, 0.26, w)
                a += 0.05 * td.cover(np.hypot(td.wrap_dx(X, nx - 0.8, w), Y - ny + 0.8) - 0.7, 1.0)
    edge = np.minimum(Y, h - Y)                                                    # the sheets' top and bottom ends: a soft shadow, a cut line
    a -= 0.04 * np.clip(1.0 - edge / 4.0, 0, 1)
    td.hline(a, seam, Y, 0.0, 1.0, 0.30); td.hline(a, seam, Y, float(h), 1.0, 0.30)
    return td.finish_detail(a, seam)


def strata(w, h, seed):
    """Five uneven bedding bands: each its own tone and grain, dark bedding planes that pinch out, a few joints."""
    X, Y = td.grid(w, h)
    seam = np.zeros((h, w), dtype=np.float32)
    cuts = np.array([0.0, 0.16, 0.37, 0.52, 0.80, 1.0], dtype=np.float32) * h      # uneven thicknesses
    # pass i2 (both visual reviewers: "big single-colour rock slabs with faint vertical streaks"): the beds' tones were
    # +-0.05 of the sheet (one in ten of the albedo, gone in the gully's shade); now a bed is plainly darker or lighter
    # than its neighbour, desert varnish hangs in streaks under every bedding plane, and two thin pale seams run through
    tones = np.array([0.10, -0.13, 0.04, -0.09, 0.13], dtype=np.float32)
    a = np.full((h, w), 0.5, dtype=np.float32)
    und = [(td.fbm(w, h, 3 + i, 1, octaves=3, seed=seed + 10 * i)[0:1, :] - 0.5) * (9.0 + 3.0 * (i % 2)) for i in range(6)]
    band = np.zeros((h, w), dtype=np.int64)
    for i in range(1, 5):
        band += (Y > cuts[i] + und[i]).astype(np.int64)
    a += tones[band]
    lam = td.fbm(w, h, 4, 30, octaves=3, seed=seed + 2) - 0.5                      # fine lamination inside a band
    blocky = td.fbm(w, h, 14, 5, octaves=3, seed=seed + 3) - 0.5                   # fracture blocks
    grit = td.value_noise(w, h, 300, 60, seed + 4) - 0.5
    a += lam * 0.16 + blocky * 0.15 + grit * 0.035
    streak = td.fbm(w, h, 46, 2, octaves=3, seed=seed + 7) - 0.5                   # narrow in U, long in V: what the rain left
    broad_s = td.fbm(w, h, 5, 1, octaves=2, seed=seed + 8)
    hang = np.zeros((h, w), dtype=np.float32)
    for i in range(0, 5):                                                          # each streak starts under a plane and fades down its bed
        y_top = cuts[i] + (und[i] if i > 0 else 0.0); span = float(cuts[i + 1] - cuts[i])
        t = np.clip((Y - y_top) / max(span, 1.0), 0, 1) * (Y >= y_top) * (Y < cuts[i + 1] + und[min(i + 1, 5)])
        hang = np.maximum(hang, (1.0 - t) ** 1.4 * (t > 0))
    a -= 0.16 * np.clip(streak * 3.0 + 0.25, 0, 1) * hang * np.clip(broad_s * 2.4 - 0.55, 0, 1)
    for (yy, amp, sd) in ((0.27, 0.085, 61), (0.66, 0.07, 62)):                   # pale seams: a hand thick, wandering, broken
        wob = (td.fbm(w, h, 3, 1, octaves=3, seed=seed + sd)[0:1, :] - 0.5) * 7.0
        on = np.clip(td.value_noise(w, h, 5, 1, seed + sd + 3)[0:1, :] * 2.6 - 0.6, 0, 1)
        a += amp * np.exp(-((Y - yy * h - wob) / 1.6) ** 2) * on
    for i in range(1, 5):                                                          # bedding planes
        strong = td.value_noise(w, h, 7, 1, seed + 30 + i)[0:1, :]
        c = td.cover(np.abs(Y - cuts[i] - und[i]) - (0.3 + 1.1 * strong), 1.4) * np.clip(strong * 2.2 - 0.25, 0, 1)
        td.over(a, c, 0.20); np.maximum(seam, c, out=seam)
        a -= 0.085 * np.clip(1.0 - (Y - cuts[i] - und[i]) / 6.0, 0, 1) * (Y > cuts[i] + und[i])   # undercut shadow
    rng = np.random.default_rng(seed + 5)
    for j in range(7):                                                             # joints: short cracks across one or two bands
        x = rng.uniform(0, w); b0 = int(rng.integers(0, 4)); b1 = min(5, b0 + int(rng.integers(1, 3)))
        wob = (td.fbm(w, h, 2, 6, octaves=2, seed=seed + 50 + j) - 0.5) * 16.0
        dx = td.wrap_dx(X, x, w) + wob
        ya = cuts[b0] + und[b0]; yb = cuts[b1] + und[b1]
        c = td.cover(np.abs(dx) - 0.5, 1.3) * (Y > ya) * (Y < yb)
        td.over(a, c * 0.85, 0.27); np.maximum(seam, c * 0.85, out=seam)
    return td.finish_detail(a, seam)


def strap(w, h, seed):
    """Forged iron strap: hammered face, two arrises, a domed rivet every 0.15 m (16 per 2.4 m repeat)."""
    X, Y = td.grid(w, h)
    seam = np.zeros((h, w), dtype=np.float32)
    a = 0.5 + (td.fbm(w, h, 26, 3, octaves=3, seed=seed) - 0.5) * 0.10           # hammer facets
    a += (td.fbm(w, h, 6, 12, octaves=2, seed=seed + 1) - 0.5) * 0.04              # drawn along the bar
    yy = (Y - h / 2) / (h / 2)
    a += 0.035 * (1.0 - yy * yy) - 0.02                                            # slight crown
    td.hline(a, seam, Y, 2.5, 1.0, 0.27); td.hline(a, seam, Y, h - 2.5, 1.0, 0.27)
    a[:2] = np.minimum(a[:2], 0.40); a[-2:] = np.minimum(a[-2:], 0.40)
    step = w / 16.0
    for k in range(16):
        cx = (k + 0.5) * step; cy = h / 2 + (0.8 if k % 5 == 2 else 0.0)
        dx = td.wrap_dx(X, cx, w); r = np.hypot(dx, Y - cy)
        ring = td.cover(np.abs(r - 6.2) - 0.7, 1.2)
        td.over(a, ring, 0.26); np.maximum(seam, ring, out=seam)
        dome = np.clip(1.0 - r / 5.6, 0, 1)
        a += (0.05 - 0.13 * (dx + (Y - cy)) / 8.0) * np.clip(dome * 3.0, 0, 1) * (r < 5.6)             # lit upper-left, dark lower-right
    return td.finish_detail(a, seam)


def cord(w, h, seed):
    """Three-strand twist: 64 strand crossings per repeat at 45 degrees, round in section."""
    X, Y = td.grid(w, h)
    seam = np.zeros((h, w), dtype=np.float32)
    n = 64.0
    ph = (X / w * n + Y / h * 2.0) % 1.0
    strand = np.sin(ph * math.pi)                                                  # 0 at the groove between strands
    a = 0.5 + 0.10 * (strand - 0.62)
    groove = np.clip(1.0 - strand * 3.2, 0, 1)
    td.over(a, groove * 0.9, 0.27); np.maximum(seam, groove * 0.9, out=seam)
    fibre = td.value_noise(w, h, 256, 16, seed) - 0.5
    a += fibre * 0.045
    yy = (Y - h / 2) / (h / 2)
    a += 0.06 * np.sqrt(np.clip(1.0 - yy * yy, 0, 1)) - 0.045                      # the round of the cord
    edge = np.clip(1.0 - (1.0 - np.abs(yy)) * h / 2 / 2.2, 0, 1)
    td.over(a, edge * 0.8, 0.30); np.maximum(seam, edge * 0.8, out=seam)
    return td.finish_detail(a, seam)


def build():
    sheet = np.full((H, W), 0.5, dtype=np.float32)
    regions = {}; y = 0
    for i, (name, hpx, mv, mu) in enumerate(ROWS):
        seed = 100 + 17 * i
        if name == "plank_a": row = plank(W, hpx, seed, "a")
        elif name == "plank_b": row = plank(W, hpx, seed, "b")
        elif name == "plank_end": row = plank_end(W, hpx, seed)
        elif name == "adobe": row = adobe(W, hpx, seed, (FLAT[0], FLAT[1] - y, FLAT[2], FLAT[3]))
        elif name == "tin": row = tin(W, hpx, seed)
        elif name == "strata": row = strata(W, hpx, seed)
        elif name == "strap": row = strap(W, hpx, seed)
        else: row = cord(W, hpx, seed)
        sheet[y:y + hpx] = row
        regions[name] = {"px": [0, y, W, hpx], "metres_u": mu, "metres_v": mv}
        y += hpx
    assert y == H
    regions["flat"] = {"px": list(FLAT), "metres_u": 0, "metres_v": 0}
    return sheet, {"size": [W, H], "regions": regions}


def main():
    out = sys.argv[sys.argv.index("--out") + 1]
    sheet, tab = build()
    td.write_json_if_changed(os.path.join(manifest.LIB, "tx_frontier_trim.json"), tab)
    td.write_png(out, sheet)
    print(f"OK tx_frontier_trim rows {[r[0] for r in ROWS]} min {sheet.min():.3f} max {sheet.max():.3f} -> {out}")


if __name__ == "__main__":
    try: main()
    except SystemExit: raise
    except BaseException:
        import traceback; traceback.print_exc(); sys.exit(1)
