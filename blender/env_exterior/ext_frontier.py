"""ext_frontier: the Frontier building kit of the exterior zones (helper module): adobe, boards, posts, tin, decals.

Frontier things are made by hand from what was lying around (ART_BIBLE 5.5): off-square, leaning 2-4 degrees, sagging,
jittered, never twice the same. So everything here is built in a wall FRAME (u along the wall, y up, w out of the
wall) that can lean, every board has its own width, depth and tone, and every generator takes a seeded RNG.
Surfaces map onto the rows of tx_frontier_trim (planks: U along the board; adobe: the 2 m row once, then its plaster
half mirrored up the wall; tin: U across the corrugations). Colour is vertex colour (ext_kit paints the height ramp,
dust skirt, bleach and jitter)."""
import math, random
from lib import manifest
import ext_kit as kit
from ext_kit import lin, mix, mul, clamp, smooth, fbm, vnoise, row_uv, flat_uv, FT

FRONTIER_PAINT = dict(dust=0.6, dust_h=0.6, grad=(0.82, 1.06), grad_h=5.0, jitter=0.06)


def paint(ground=0.0, **kw):
    d = dict(FRONTIER_PAINT); d["ground"] = ground; d.update(kw)
    return d


class Frame:
    """A wall frame: origin (game x, y, z), `udir` = unit (x, z) along the wall; the wall's outward normal is U x Y.
    lean_deg shears the wall along itself (the top travels along +u), tilt_deg leans it outward (the top travels
    along +w). sag(u) lowers points (a tired porch)."""
    def __init__(self, origin, udir, lean_deg=0.0, tilt_deg=0.0, sag=None):
        l = math.hypot(udir[0], udir[1])
        self.o = tuple(float(c) for c in origin); self.U = (udir[0] / l, 0.0, udir[1] / l)
        self.N = kit.vcross(self.U, (0.0, 1.0, 0.0))
        self.lean = math.tan(math.radians(lean_deg)); self.tilt = math.tan(math.radians(tilt_deg)); self.sag = sag

    def p(self, u, y, w=0.0):
        uu = u + self.lean * y; ww = w + self.tilt * y
        yy = y - (self.sag(u, y, w) if self.sag else 0.0)
        return (self.o[0] + self.U[0] * uu + self.N[0] * ww, self.o[1] + yy, self.o[2] + self.U[2] * uu + self.N[2] * ww)

    def sub(self, du=0.0, dy=0.0, dw=0.0, lean_deg=None, tilt_deg=None):
        f = Frame(self.p(du, dy, dw), (self.U[0], self.U[2]), 0.0, 0.0, None)
        f.lean = self.lean if lean_deg is None else math.tan(math.radians(lean_deg))
        f.tilt = self.tilt if tilt_deg is None else math.tan(math.radians(tilt_deg))
        return f

    def turned(self, u, w, deg):
        """A frame whose origin is this frame's (u, 0, w) and whose wall runs `deg` degrees from this one's (90 = the
        wall goes out along +w... i.e. a side wall)."""
        r = math.radians(deg)
        ud = (self.U[0] * math.cos(r) + self.N[0] * math.sin(r), self.U[2] * math.cos(r) + self.N[2] * math.sin(r))
        return Frame(self.p(u, 0.0, w), ud)


# ------------------------------------------------------------------ UV helpers
def adobe_v(y):
    """V on the adobe row for a height y above the wall's foot: the whole 2 m row once (brick course at the foot), then
    its plaster part mirrored back and forth, so a 5 m wall shows one brick course and no repeat line."""
    if y <= 2.0: return clamp(y / 2.0)
    t = ((y - 2.0) / 1.1) % 2.0
    t = t if t <= 1.0 else 2.0 - t
    return 1.0 - 0.55 * t


def adobe_rows(y0, y1):
    """Heights at which an adobe face needs a row of vertices (where adobe_v turns)."""
    ys = [y0]
    for y in [0.42, 2.0] + [2.0 + 1.1 * k for k in range(1, 12)]:
        if y0 + 0.05 < y < y1 - 0.05: ys.append(y)
    ys.append(y1)
    return ys


def adobe_colour(y, u=0.0, seed=0, fallen=0.0):
    """Plaster: `adobe`, the bottom 0.4 m `adobe_base` (damp line, brick showing), patches fallen from the lower metre."""
    c = lin("adobe")
    k = clamp(1.0 - (y - 0.3) / 0.25)
    if fallen > 0 and y < 1.25: k = max(k, fallen * smooth((vnoise(u / 1.3, y / 0.9, seed) - 0.45) / 0.2) * clamp(1.3 - y))
    return mix(c, lin("adobe_base"), clamp(k))


# ------------------------------------------------------------------ faces in a frame
def grid_face(part, F, us, ys, w, mat, uv_fn, col_fn, chart=None, holes=(), flip=False, st_off=(0.0, 0.0), w_fn=None, final=False, top_fn=None):
    """A wall face as a grid over the breakpoints `us` x `ys` at depth w (or w_fn(u, y)), with rectangular holes
    [(u0, u1, y0, y1), ...] left out (the breakpoints must include the hole edges: `breaks` does that). top_fn(u):
    the top row follows it (an eroded or broken top)."""
    vid = {}

    def vert(i, j):
        if (i, j) not in vid:
            u = us[i]; y = ys[j]
            if top_fn is not None and j == len(ys) - 1: y = top_fn(u)
            elif top_fn is not None: y = min(y, top_fn(u))
            ww = w_fn(u, y) if w_fn else w
            vid[(i, j)] = (part.vert(F.p(u, y, ww)), u, y)
        return vid[(i, j)]

    for j in range(len(ys) - 1):
        for i in range(len(us) - 1):
            cu = (us[i] + us[i + 1]) / 2; cy = (ys[j] + ys[j + 1]) / 2
            if any(h[0] - 1e-6 <= cu <= h[1] + 1e-6 and h[2] - 1e-6 <= cy <= h[3] + 1e-6 for h in holes): continue
            q = [vert(i, j), vert(i + 1, j), vert(i + 1, j + 1), vert(i, j + 1)]
            if abs(q[3][2] - q[0][2]) < 1e-4 and abs(q[2][2] - q[1][2]) < 1e-4: continue
            if flip: q = [q[0], q[3], q[2], q[1]]
            part.face([v[0] for v in q], mat, [uv_fn(v[1], v[2]) for v in q], [col_fn(v[1], v[2]) for v in q], chart,
                      [(v[1] + st_off[0], v[2] + st_off[1]) for v in q] if chart else None, final)


def breaks(a, b, step, extra=()):
    n = max(1, int(round((b - a) / step)))
    out = {round(a + (b - a) * k / n, 4) for k in range(n + 1)}
    for e in extra:
        if a < e < b: out.add(round(e, 4))
    return sorted(out)


def adobe_face(part, F, u0, u1, y0, y1, w=0.0, chart=None, holes=(), flip=False, step=1.6, seed=0, fallen=0.5, top_fn=None, st_off=(0.0, 0.0), batter=0.02, u_tex=0.0):
    us = breaks(u0, u1, step, [h[k] for h in holes for k in (0, 1)])
    ys = sorted(set(adobe_rows(y0, y1) + [h[k] for h in holes for k in (2, 3) if y0 < h[k] < y1]))
    sgn = -1.0 if flip else 1.0
    grid_face(part, F, us, ys, w, "m_frontier", lambda u, y: row_uv(FT, "adobe", u + u_tex, adobe_v(y - y0)), lambda u, y: adobe_colour(y - y0, u, seed, fallen),
              chart, holes, flip, st_off, w_fn=lambda u, y: w - sgn * batter * (y - y0), top_fn=top_fn)


def fbox(part, F, u0, u1, y0, y1, w0, w1, col, row=None, along="u", sides="fbtlrd", mat="m_frontier", shift=0.0, final=False, chart=None, st_off=(0.0, 0.0)):
    """A box in frame coordinates. sides: f front (+w), b back (-w), t top, d bottom, l (u0), r (u1). row = a trim row
    name ('plank_a' ...): U runs along `along` ('u' | 'y' | 'w'), V across the face. chart: the FRONT face is charted
    with st = (u, y) (+ st_off)."""
    P = {}
    for iu, u in enumerate((u0, u1)):
        for iy, y in enumerate((y0, y1)):
            for iw, w in enumerate((w0, w1)):
                P[(iu, iy, iw)] = (F.p(u, y, w), (u, y, w))
    faces = {"f": [(0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)], "b": [(1, 0, 0), (0, 0, 0), (0, 1, 0), (1, 1, 0)],
             "t": [(0, 1, 1), (1, 1, 1), (1, 1, 0), (0, 1, 0)], "d": [(0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1)],
             "l": [(0, 0, 0), (0, 0, 1), (0, 1, 1), (0, 1, 0)], "r": [(1, 0, 1), (1, 0, 0), (1, 1, 0), (1, 1, 1)]}
    ax = "uyw".index(along)
    for s in sides:
        q = [P[k] for k in faces[s]]
        if row is not None:
            loc = [v[1] for v in q]
            # across = the in-face axis that is not `along`
            varying = [k for k in range(3) if max(l[k] for l in loc) - min(l[k] for l in loc) > 1e-6]
            if ax in varying:
                ac = [k for k in varying if k != ax]
                ac = ac[0] if ac else None
                lo = min(l[ac] for l in loc) if ac is not None else 0.0; span = (max(l[ac] for l in loc) - lo) if ac is not None else 1.0
                uvs = [row_uv(FT, row, l[ax] + shift, (l[ac] - lo) / span if ac is not None else 0.5) for l in loc]
            else:                                                     # an end: end grain
                a_, b_ = varying[0], varying[1] if len(varying) > 1 else varying[0]
                lo_a = min(l[a_] for l in loc); lo_b = min(l[b_] for l in loc); sp_b = max(1e-6, max(l[b_] for l in loc) - lo_b)
                uvs = [row_uv(FT, "plank_end", l[a_] - lo_a + shift, (l[b_] - lo_b) / sp_b) for l in loc]
        else: uvs = flat_uv(mat)
        ch = chart if (chart and s == "f") else None
        part.face([part.vert(v[0]) for v in q], mat, uvs, col, ch, [(v[1][0] + st_off[0], v[1][1] + st_off[1]) for v in q] if ch else None, final)


def boards(part, F, u0, u1, y0, y1, w=0.0, vertical=True, tint="board", rng=None, chart=None, holes=(), miss=0.0, top_fn=None, bottom_fn=None,
           wmin=0.16, wmax=0.24, depth_jit=0.004, seg=0.0, tone_jit=0.10, bleached=0.35, st_off=(0.0, 0.0), flip=False, end_jit=0.0):
    """A wall of boards between u0..u1 and y0..y1: each its own width, depth, tone and texture offset; never two equal
    neighbours. vertical=True: boards stand (false fronts, board-and-batten); else they lie (clapboard). holes: boards
    are cut round them. miss: chance that a board is gone. top_fn(u) / bottom_fn(u): ragged ends for standing boards.
    seg: maximum length between edge loops (vertex-lit boards need vertices). Returns the list of missing spans."""
    rng = rng or random.Random(1)
    a0, a1 = (u0, u1) if vertical else (y0, y1)
    gone = []
    a = a0; last = 0.0
    while a < a1 - 1e-6:
        wd = rng.uniform(wmin, wmax)
        while abs(wd - last) < 0.012: wd = rng.uniform(wmin, wmax)
        last = wd
        b = min(a1, a + wd)
        if a1 - b < wmin * 0.6: b = a1
        dz = rng.uniform(-depth_jit, depth_jit)
        tone = 1.0 + rng.uniform(-tone_jit, tone_jit)
        base = mix(lin(tint), lin("board_bleached"), bleached * rng.random()) if tint == "board" else lin(tint)
        col = mul(base, tone)
        ush = rng.uniform(0.0, 3.6)
        reg = "plank_a" if rng.random() < 0.6 else "plank_b"
        if rng.random() < miss:
            gone.append((a, b)); a = b; continue
        if vertical:
            lo = y0 if bottom_fn is None else bottom_fn((a + b) / 2)
            hi = y1 if top_fn is None else top_fn((a + b) / 2)
            hi += rng.uniform(-end_jit, end_jit) if end_jit else 0.0
            spans = [(lo, hi)]
            for h in holes:
                if h[0] < b - 1e-6 and h[1] > a + 1e-6:
                    nxt = []
                    for (s0, s1) in spans:
                        if h[2] > s0 + 1e-6: nxt.append((s0, min(s1, h[2])))
                        if h[3] < s1 - 1e-6: nxt.append((max(s0, h[3]), s1))
                    spans = [s for s in nxt if s[1] - s[0] > 0.02]
            for (s0, s1) in spans:
                n = max(1, int(math.ceil((s1 - s0) / seg))) if seg else 1
                for k in range(n):
                    ya = s0 + (s1 - s0) * k / n; yb = s0 + (s1 - s0) * (k + 1) / n
                    q = [(a, ya), (b, ya), (b, yb), (a, yb)]
                    if flip: q = [q[0], q[3], q[2], q[1]]
                    part.poly([F.p(u, y, w + dz) for u, y in q], "m_frontier", [row_uv(FT, reg, y + ush, (u - a) / (b - a)) for u, y in q], col, chart,
                              [(u + st_off[0], y + st_off[1]) for u, y in q] if chart else None)
        else:
            spans = [(u0, u1)]
            for h in holes:
                if h[2] < b - 1e-6 and h[3] > a + 1e-6:
                    nxt = []
                    for (s0, s1) in spans:
                        if h[0] > s0 + 1e-6: nxt.append((s0, min(s1, h[0])))
                        if h[1] < s1 - 1e-6: nxt.append((max(s0, h[1]), s1))
                    spans = [s for s in nxt if s[1] - s[0] > 0.02]
            for (s0, s1) in spans:
                n = max(1, int(math.ceil((s1 - s0) / seg))) if seg else 1
                for k in range(n):
                    ua = s0 + (s1 - s0) * k / n; ub = s0 + (s1 - s0) * (k + 1) / n
                    q = [(ua, a), (ub, a), (ub, b), (ua, b)]
                    if flip: q = [q[0], q[3], q[2], q[1]]
                    part.poly([F.p(u, y, w + dz) for u, y in q], "m_frontier", [row_uv(FT, reg, u + ush, (y - a) / (b - a)) for u, y in q], col, chart,
                              [(u + st_off[0], y + st_off[1]) for u, y in q] if chart else None)
        a = b
    return gone


def beam(part, F, a, b, sx, sy, col="board", chamfer=0.02, taper=0.0, segs=1, caps="", up=None, row="plank_a", shift=0.0):
    """A timber from frame point a = (u, y, w) to b, section sx x sy, chamfered arrises (ART_BIBLE 5.2), plank grain along it."""
    pa = F.p(*a); pb = F.p(*b)
    upv = up if up is not None else (F.N if abs(pb[1] - pa[1]) > 0.7 * kit.vlen(kit.vsub(pb, pa)) else (0.0, 1.0, 0.0))
    kit.add_prism(part, pa, pb, sx, sy, "m_frontier", lin(col) if isinstance(col, str) else col, row=(FT, row) if row else None, chamfer=chamfer, taper=taper,
                  up=upv, caps=caps, segs=segs, u_shift=shift)


def tin_sheets(part, F, u0, u1, a, b, rng, lifted=None, col="tin", seg=0.0, thickness=True):
    """A corrugated roof / wall in the frame: from line a = (y, w) to line b = (y, w) (eave to ridge), between u0 and u1,
    as lapped sheets about 0.9 m wide whose ends never line up. lifted = index of a sheet that has come loose (it is
    hinged up at the ridge end). U of the tin row runs along u (across the corrugations)."""
    u = u0; k = 0
    while u < u1 - 1e-6:
        wd = min(u1 - u, rng.uniform(0.82, 1.0))
        if u1 - (u + wd) < 0.3: wd = u1 - u
        e0 = rng.uniform(-0.05, 0.08); e1 = rng.uniform(-0.03, 0.03)
        ya, wa = a; yb, wb = b
        dy = yb - ya; dw = wb - wa
        l = math.hypot(dy, dw)
        ya2 = ya - dy / l * e0; wa2 = wa - dw / l * e0
        lift = 0.0
        if lifted is not None and k == lifted: lift = 0.55
        tone = 1.0 + rng.uniform(-0.08, 0.08)
        c = mul(mix(lin(col), lin("rust"), 0.12 * rng.random()), tone)
        n = max(1, int(math.ceil(l / seg))) if seg else 1
        for s in range(n):
            f0 = s / n; f1 = (s + 1) / n
            q = []
            for (uu, f) in ((u, f0), (u + wd, f0), (u + wd, f1), (u, f1)):
                y = ya2 + (yb - ya2) * f + lift * (1 - f) * (0.4 + 0.6 * (uu - u) / wd)
                w = wa2 + (wb - wa2) * f
                q.append((F.p(uu, y + 0.004 * k, w), row_uv(FT, "tin", uu, f)))
            part.poly([v[0] for v in q], "m_frontier", [v[1] for v in q], c)
        u += wd; k += 1


def decal(part, F, u, y, w, width, height, region, index=None, col="town_paint", rot_deg=0.0):
    """An m_mask quad in the frame, centred at (u, y), `w` off the wall, turned rot_deg in the wall's plane."""
    u0, v0, u1, v1 = manifest.mask_uv(region, index)
    r = math.radians(rot_deg); c = math.cos(r); s = math.sin(r)
    pts = []
    for (du, dy) in ((-width / 2, -height / 2), (width / 2, -height / 2), (width / 2, height / 2), (-width / 2, height / 2)):
        pts.append(F.p(u + du * c - dy * s, y + du * s + dy * c, w))
    part.poly(pts, "m_mask", [(u0, v0), (u1, v0), (u1, v1), (u0, v1)], lin(col) if isinstance(col, str) else col, final=True)


def door_mark(part, F, u, y, w, variant="mark_brush_a", size=0.44, strike=True):
    """The town's brushed well mark, 0.35-0.5 m tall at 1.5 m, and the Dowser's ruled graphite line through it:
    always the same neat 22 degrees (ART_BIBLE 5.6)."""
    decal(part, F, u, y, w, size * 96.0 / 144.0, size, variant, None, "town_paint")
    if strike: decal(part, F, u, y, w + 0.004, size * 1.25, size * 1.25 * 32.0 / 256.0, "strike", None, "graphite", 22.0)


def shut_door(parts, F, u, width=1.2, height=2.2, w=0.0, rng=None, mark=None, chart=None, st_off=(0.0, 0.0), sill=0.06):
    """A shut dressing door: a frame of three timbers, four or five planks set back 6 cm, two ledges, a strap, a block
    latch. parts = (lightmapped part, vertex-lit part, mask part). mark = the mark variant ('mark_brush_a' ...) or None."""
    lm, vl, mask = parts
    rng = rng or random.Random(3)
    u0 = u - width / 2; u1 = u + width / 2
    boards(lm, F, u0, u1, sill, height, w - 0.06, True, "board", rng, chart, st_off=st_off, wmin=0.2, wmax=0.3)
    for (a, b) in (((u0 - 0.07, 0, w + 0.02), (u0 - 0.07, height + 0.1, w + 0.02)), ((u1 + 0.07, 0, w + 0.02), (u1 + 0.07, height + 0.1, w + 0.02))):
        beam(vl, F, a, b, 0.14, 0.1, "board_dark" if rng.random() < 0.3 else "board", segs=2)
    beam(vl, F, (u0 - 0.2, height + 0.14, w + 0.03), (u1 + 0.2, height + 0.1 + rng.uniform(-0.03, 0.03), w + 0.03), 0.12, 0.16, "board", segs=1)
    for yy in (0.45, height - 0.4):
        fbox(vl, F, u0 + 0.03, u1 - 0.03, yy, yy + 0.13, w - 0.06, w - 0.03, lin("board_bleached"), "plank_b", "u", "ftd")
    fbox(vl, F, u1 - 0.22, u1 - 0.1, 1.0, 1.14, w - 0.06, w - 0.01, lin("rust"), "strap", "u", "ftdlr")
    # the Z-brace on the leaf: a diagonal batten between the two ledges
    beam(vl, F, (u0 + 0.12, 0.58, w - 0.045), (u1 - 0.12, height - 0.45, w - 0.045), 0.12, 0.03, "board_bleached", chamfer=0.0, up=F.N)
    if mark: door_mark(mask, F, u - 0.05, 1.5, w - 0.03, mark)
    # integration (polish round 2): the leaf stands 3 cm behind its frame; the slit between them showed daylight from behind
    # the false front. A shallow black box behind the leaf closes it.
    dark_box(vl, F, u0 - 0.05, u1 + 0.05, 0.0, height + 0.05, 0.3, w - 0.062, col=mul(lin("board_dark"), 0.7))     # deep shadow, not a black line


def shutter_window(parts, F, u, y, width=0.8, height=1.0, w=0.0, rng=None, ajar=False, chart=None, st_off=(0.0, 0.0)):
    """A shuttered window: sill, lintel, two board shutters shut (one may hang from a single hinge)."""
    lm, vl, mask = parts
    rng = rng or random.Random(5)
    u0 = u - width / 2; u1 = u + width / 2
    boards(lm, F, u0, u1, y, y + height, w - 0.04, True, "board_bleached", rng, chart, st_off=st_off, wmin=0.14, wmax=0.2, tone_jit=0.12)
    fbox(vl, F, u0 - 0.14, u1 + 0.14, y - 0.1, y, w - 0.02, w + 0.1, lin("board"), "plank_a", "u", "ftdlr")
    fbox(vl, F, u0 - 0.16, u1 + 0.16, y + height, y + height + 0.13, w - 0.02, w + 0.07, lin("board"), "plank_b", "u", "ftdlr")
    fbox(vl, F, u0 - 0.2, u1 + 0.2, y + height + 0.13, y + height + 0.17, w - 0.02, w + 0.12, lin("board_bleached"), "plank_a", "u", "ftdlr")
    for uu in (u0 - 0.06, u1 + 0.06):                                     # side casings
        fbox(vl, F, uu - 0.06, uu + 0.06, y, y + height, w - 0.02, w + 0.04, lin("board"), "plank_a", "y", "flr")
    fbox(vl, F, u0 + 0.02, u1 - 0.02, y + height * 0.28, y + height * 0.28 + 0.09, w - 0.04, w - 0.015, lin("board"), "plank_a", "u", "ftd")
    fbox(vl, F, u0 + 0.02, u1 - 0.02, y + height * 0.72, y + height * 0.72 + 0.09, w - 0.04, w - 0.015, lin("board"), "plank_a", "u", "ftd")
    dark_box(vl, F, u0 - 0.04, u1 + 0.04, y - 0.03, y + height + 0.03, 0.25, w - 0.042, col=mul(lin("board_dark"), 0.7))      # integration: closes the slit beside the shutters


def dark_box(part, F, u0, u1, y0, y1, depth=1.0, w=0.0, col=None):
    """The black void behind an opening: five inward faces 1 m deep, near-black (interiors are never modelled)."""
    c = col or mul(lin("board_dark"), 0.22)
    q = lambda pts: part.poly([F.p(*p) for p in pts], "m_frontier", flat_uv("m_frontier"), c, final=True)
    q([(u0, y0, w - depth), (u1, y0, w - depth), (u1, y1, w - depth), (u0, y1, w - depth)])       # back
    q([(u0, y0, w), (u0, y0, w - depth), (u0, y1, w - depth), (u0, y1, w)])                       # left
    q([(u1, y0, w - depth), (u1, y0, w), (u1, y1, w), (u1, y1, w - depth)])                       # right
    q([(u0, y1, w), (u0, y1, w - depth), (u1, y1, w - depth), (u1, y1, w)])                       # top
    q([(u0, y0, w - depth), (u0, y0, w), (u1, y0, w), (u1, y0, w - depth)])                       # floor


def sand_wedge(part, F, u0, u1, w1, h, rng=None, n=4, chart=None, st_off=(0.0, 0.0)):
    """Sand banked against a wall foot (ART_BIBLE 5.4): a ramp from height h at the wall down to nothing at w1, its
    crest wandering. m_sand."""
    rng = rng or random.Random(2)
    us = [u0 + (u1 - u0) * k / n for k in range(n + 1)]
    hs = [h * (0.0 if k in (0, n) else rng.uniform(0.6, 1.0)) for k in range(n + 1)]
    for k in range(n):
        a = F.p(us[k], hs[k], 0.03); b = F.p(us[k + 1], hs[k + 1], 0.03)
        ws = [w1 * (0.35 + 0.65 * (hs[k] / h if h else 0)), w1 * (0.35 + 0.65 * (hs[k + 1] / h if h else 0))]
        c = F.p(us[k + 1], 0.01, ws[1]); d = F.p(us[k], 0.01, ws[0])
        pts = [d, c, b, a]
        cols = [lin("sand"), lin("sand"), lin("sand_pale"), lin("sand_pale")]
        st = [(us[k] + st_off[0], st_off[1]), (us[k + 1] + st_off[0], st_off[1]), (us[k + 1] + st_off[0], st_off[1] + 1.0), (us[k] + st_off[0], st_off[1] + 1.0)]
        part.poly(pts, "m_sand", [kit.sand_uv(p) for p in pts], cols, chart, st if chart else None, final=True)


# ------------------------------------------------------------------ free-standing adobe walls
def buttress(part, F, u, w0, sgn=1.0, h=2.3, width=0.7, proj=0.45, top_proj=0.14, seed=0, steps=2):
    """An adobe buttress against a wall face: a battered pier `width` wide at `u`, standing `proj` out from the face at
    w0 (sgn: +1 toward +w) at its foot and `top_proj` at its sloped head, in `steps` lifts with a weathered shoulder
    between them (ART_BIBLE 5.3: a wall is a slab plus base course plus cap plus piers). Vertex-lit; rows every lift."""
    rng = random.Random(seed * 13 + 5)
    hw0 = width / 2; lean = rng.uniform(-0.03, 0.03)
    ys = [0.0] + [h * (k + 1) / steps for k in range(steps)]
    prof = []
    for k, y in enumerate(ys):
        f = y / h
        pr = proj + (top_proj - proj) * f
        hw = hw0 * (1.0 - 0.18 * f)
        prof.append((y, hw, pr))
    for k in range(len(ys) - 1):
        (ya, ha, pa), (yb, hb, pb) = prof[k], prof[k + 1]
        if k > 0: pa -= 0.05; ha -= 0.03                                   # the shoulder: each lift stands inside the one below
        P = lambda uu, y, pr: F.p(u + uu + lean * y, y, w0 + sgn * pr)
        quads = [[P(-ha, ya, pa), P(ha, ya, pa), P(hb, yb, pb), P(-hb, yb, pb)],                 # front
                 [P(-ha, ya, 0.0), P(-ha, ya, pa), P(-hb, yb, pb), P(-hb, yb, 0.0)],             # side at -u
                 [P(ha, ya, pa), P(ha, ya, 0.0), P(hb, yb, 0.0), P(hb, yb, pb)]]                 # side at +u
        if k > 0:
            (y0_, h0_, p0_) = prof[k]
            quads.append([P(-h0_, y0_, p0_), P(h0_, y0_, p0_), P(ha, ya, pa), P(-ha, ya, pa)])   # the shoulder's top
        if k == len(ys) - 2: quads.append([P(-hb, yb, pb), P(hb, yb, pb), P(hb, yb + 0.22, 0.0), P(-hb, yb + 0.22, 0.0)])     # the weathered head
        for q in quads:
            n = kit.vcross(kit.vsub(q[1], q[0]), kit.vsub(q[2], q[0]))
            c = kit.vscale(kit.vadd(kit.vadd(q[0], q[1]), kit.vadd(q[2], q[3])), 0.25)
            away = kit.vsub(c, F.p(u, c[1] - F.o[1] - 0.3, w0 - sgn * 1.0))
            if kit.vdot(n, away) < 0: q = q[::-1]
            part.poly(q, "m_frontier", [row_uv(FT, "adobe", 0.37 * seed + 0.6 * i_, adobe_v(v[1] - F.o[1])) for i_, v in enumerate(q)], [adobe_colour(v[1] - F.o[1], u + 0.3 * i_, seed, 1.0) for i_, v in enumerate(q)])


def fallen_stones(part, F, u0, u1, w0, w1, rng, n=6, col="rock_cap", size=(0.45, 0.1, 0.3)):
    """Capstones and bricks lying where they came down (none over 0.3 m: nothing a body meets)."""
    for k in range(n):
        u = rng.uniform(u0, u1); w = rng.uniform(w0, w1)
        sz = (size[0] * rng.uniform(0.7, 1.15), size[1] * rng.uniform(0.8, 1.2), size[2] * rng.uniform(0.7, 1.1))
        c = F.p(u, sz[1] * rng.uniform(0.25, 0.6) + (0.09 if k == 0 else 0.0), w)
        t = rng.uniform(-0.06, 0.06)
        kit.add_box(part, c, sz, "m_frontier", mul(mix(lin(col), lin("adobe"), 0.5 * rng.random()), rng.uniform(0.85, 1.05)), rot=rng.uniform(0, 180), sides="nsewt", lean=(t, -t), final=True)


def adobe_wall(parts, a, b, height, thick=0.6, name="wall", y0=0.0, top_fn=None, cap=False, rng=None, density=0.5, sides="lr", ends="ab", seed=0,
               holes=(), step=1.6, fallen=0.5, batter=0.02, chart_prefix=None, cap_col="rock_cap", cap_gaps=()):
    """A plastered adobe wall from a = (x, z) to b on the ground at y0: two battered faces (each one lightmap chart),
    an eroded top, optional flat capstones. parts = (lightmapped part, vertex-lit part). sides: 'l' = the face on the
    left of a -> b, 'r' the right. holes: [(u0, u1, y0, y1)] openings (the caller builds lintels / reveals).
    top_fn(u) overrides the height (stepped broken ends). Returns the Frame of the left face."""
    lm, vl = parts
    rng = rng or random.Random(seed + 11)
    L = math.hypot(b[0] - a[0], b[1] - a[1])
    ud = ((b[0] - a[0]) / L, (b[1] - a[1]) / L)
    Fc = Frame((a[0], y0, a[1]), ud)
    tf = top_fn or (lambda u: height + 0.07 * fbm(u / 2.3, seed * 1.7, seed + 3, 2))
    pre = chart_prefix or name
    # frame normal N = U x Y. For a wall along +x (U = (1,0,0)), N = (0,0,1): the face at w = +thick/2 looks toward +z, which is the RIGHT of travel (z south). So 'r' = +w, 'l' = -w.
    if "r" in sides:
        adobe_face(lm, Fc, 0.0, L, 0.0, height, thick / 2, kit.chart(pre + "_r", density), holes, False, step, seed, fallen, tf, batter=batter)
    if "l" in sides:
        us = breaks(0.0, L, step, [h[k] for h in holes for k in (0, 1)])
        ys = sorted(set(adobe_rows(0.0, height) + [h[k] for h in holes for k in (2, 3) if 0 < h[k] < height]))
        grid_face(lm, Fc, us, ys, -thick / 2, "m_frontier", lambda u, y: row_uv(FT, "adobe", L - u + 3.3, adobe_v(y)), lambda u, y: adobe_colour(y, u + 9.0, seed + 1, fallen),
                  kit.chart(pre + "_l", density), holes, True, w_fn=lambda u, y: -thick / 2 + batter * y, top_fn=tf)
    # top
    us = breaks(0.0, L, step)
    for i in range(len(us) - 1):
        skip = any(h[0] - 1e-6 <= (us[i] + us[i + 1]) / 2 <= h[1] + 1e-6 and h[3] >= height - 1e-3 for h in holes)
        if skip: continue
        q = [(us[i], thick / 2 - batter * tf(us[i])), (us[i + 1], thick / 2 - batter * tf(us[i + 1])), (us[i + 1], -thick / 2 + batter * tf(us[i + 1])), (us[i], -thick / 2 + batter * tf(us[i]))]
        vl.poly([Fc.p(u, tf(u), w) for u, w in q], "m_frontier", [row_uv(FT, "adobe", u, 0.75 + 0.2 * (w / thick)) for u, w in q], mix(lin("adobe"), lin("sand_pale"), 0.35))
    # ends
    for e, u in (("a", 0.0), ("b", L)):
        if e not in ends: continue
        ys = adobe_rows(0.0, tf(u))
        for j in range(len(ys) - 1):
            q = [(-thick / 2 + batter * ys[j], ys[j]), (thick / 2 - batter * ys[j], ys[j]), (thick / 2 - batter * ys[j + 1], ys[j + 1]), (-thick / 2 + batter * ys[j + 1], ys[j + 1])]
            if e == "b": q = [q[1], q[0], q[3], q[2]]
            vl.poly([Fc.p(u, y, w) for w, y in q], "m_frontier", [row_uv(FT, "adobe", w + 0.5, adobe_v(y)) for w, y in q], [adobe_colour(y, w, seed + 2, fallen) for w, y in q])
    if cap:
        u = 0.0
        while u < L - 0.05:
            ln = min(L - u, rng.uniform(0.85, 1.6))
            skip = any(h[0] - 1e-6 <= u + ln / 2 <= h[1] + 1e-6 and h[3] >= height - 1e-3 for h in holes) or any(g[0] <= u + ln / 2 <= g[1] for g in cap_gaps)
            if not skip:
                th = rng.uniform(0.07, 0.11); ov = rng.uniform(0.04, 0.09)
                yb = max(tf(u), tf(u + ln)) - 0.01
                c = mul(mix(lin(cap_col), lin("adobe"), 0.4 * rng.random()), 1 + rng.uniform(-0.08, 0.08))
                fbox(vl, Fc, u + 0.015, u + ln - 0.015, yb, yb + th, -thick / 2 - ov, thick / 2 + ov, c, None, "u", "fbtlr", final=False)
            u += ln
    return Fc


def stepped_wall_r1(parts, a, b, steps, thick=0.5, name="stub", seed=0, density=1.0, batter=0.02, fallen=1.0):
    """A broken adobe wall with STEPPED broken ends: `steps` = [(u0, u1, top), ...] along a -> b, each segment level on
    top; between segments of different height a vertical riser shows the brick courses inside (ART_BIBLE 7.2, the wall
    stubs: "stepped broken ends showing brick"). parts = (lightmapped part, vertex-lit part). Returns the frame."""
    lm, vl = parts
    L = math.hypot(b[0] - a[0], b[1] - a[1])
    F = Frame((a[0], 0.0, a[1]), ((b[0] - a[0]) / L, (b[1] - a[1]) / L))
    brick = lambda y, u: mix(lin("adobe_base"), lin("rust"), 0.12 * vnoise(u * 3.0, y * 4.0, seed))
    hw = thick / 2
    for k, (u0, u1, top) in enumerate(steps):
        adobe_face(lm, F, u0, u1, 0.0, top, hw, kit.chart(name + "_r", density), [], False, 0.9, seed, fallen, batter=batter)
        us = breaks(u0, u1, 0.9)
        ys = adobe_rows(0.0, top)
        grid_face(lm, F, us, ys, -hw, "m_frontier", lambda u, y: row_uv(FT, "adobe", L - u + 3.3, adobe_v(y)), lambda u, y: adobe_colour(y, u + 9.0, seed + 1, fallen),
                  kit.chart(name + "_l", density), (), True, w_fn=lambda u, y: -hw + batter * y)
        # the top of this step: broken plaster, the brick core showing
        wt = hw - batter * top
        q = [(u0, wt), (u1, wt), (u1, -wt), (u0, -wt)]
        vl.poly([F.p(u, top, w) for u, w in q], "m_frontier", [row_uv(FT, "adobe", u, 0.06 + 0.1 * (w / thick + 0.5)) for u, w in q], [brick(top, u) for u, w in q])
        # the riser to the next step, facing the lower side
        if k + 1 < len(steps):
            t2 = steps[k + 1][2]
            lo_, hi_ = (top, t2) if t2 > top else (t2, top)
            u = u1
            q = [(-hw + batter * lo_, lo_), (hw - batter * lo_, lo_), (hw - batter * hi_, hi_), (-hw + batter * hi_, hi_)]
            if t2 < top: q = [q[1], q[0], q[3], q[2]]                     # the riser looks along +u
            vl.poly([F.p(u, y, w) for w, y in q], "m_frontier", [row_uv(FT, "adobe", w + 0.7, 0.05 + 0.12 * (y - lo_) / max(hi_ - lo_, 1e-3)) for w, y in q], [brick(y, u) for w, y in q])
    # the two end faces (rubble-broken: the brick shows here too)
    for (u, top, flip) in ((steps[0][0], steps[0][2], False), (steps[-1][1], steps[-1][2], True)):
        q = [(-hw, 0.0), (hw, 0.0), (hw - batter * top, top), (-hw + batter * top, top)]
        if flip: q = [q[1], q[0], q[3], q[2]]
        vl.poly([F.p(u, y, w) for w, y in q], "m_frontier", [row_uv(FT, "adobe", w + 0.3, 0.04 + 0.15 * y / top) for w, y in q], [brick(y, u) for w, y in q])
    return F


# ------------------------------------------------------------------ polish round 2: broken adobe, not stacked cuboids
def weather(part, fn, start=0):
    """Multiply the colours of the faces of `part` from index `start` by fn(point) (rain streaks under a parapet, a
    stain under a canale, broad blotches): the bake's AO alone leaves a shaded 16 m wall one flat tone."""
    for k in range(start, len(part.f)):
        idx, mat, uv0, col, ch, st, fin = part.f[k]
        part.f[k] = (idx, mat, uv0, [mul(c, fn(part.v[i])) for c, i in zip(col, idx)], ch, st, fin)


def wall_weather(axis, H, seed, stains=(), y0=0.0):
    """fn for `weather`: axis 0 = the wall runs along x, 2 = along z. Streaks hang from the top (strongest there, gone
    2.4 m down), blotches all over, a widening stain under each canale in `stains` (positions along the axis)."""
    def fn(p):
        a = p[axis]; y = p[1] - y0
        k = smooth((vnoise(a * 1.9, 0.5, seed) - 0.5) / 0.25)
        fade = clamp((y - (H - 2.4)) / 2.4)
        d = 1.0 - 0.3 * k * fade
        d *= 0.88 + 0.24 * fbm(a / 2.7, y / 1.9, seed + 4, 2)
        for cx in stains:
            w = 0.35 + 0.25 * clamp((H - y) / H)
            dd = abs(a - cx)
            if dd < w: d *= 1.0 - 0.42 * (1.0 - dd / w) * clamp(0.35 + (y / H))
        return d
    return fn


def _wall_from_profile(lm, vl, F, L, prof, thick, name, seed, density, batter, H):
    """The faces of a broken wall whose top follows `prof` [(u, y), ...]: two lightmapped sides, the brick core on top
    and at both ends, plaster off near every break. Returns top(u)."""
    hw = thick / 2
    prof = sorted(prof)
    prof = [q for k, q in enumerate(prof) if k == 0 or q[0] - prof[k - 1][0] > 0.012]

    def top(u):
        if u <= prof[0][0]: return prof[0][1]
        for k in range(len(prof) - 1):
            if prof[k][0] <= u <= prof[k + 1][0]:
                t = (u - prof[k][0]) / max(prof[k + 1][0] - prof[k][0], 1e-6)
                return prof[k][1] + (prof[k + 1][1] - prof[k][1]) * t
        return prof[-1][1]
    brick = lambda y, u: mul(mix(lin("adobe_base"), lin("rust"), 0.14 * vnoise(u * 3.0, y * 4.0, seed)), 0.78 + 0.2 * vnoise(u * 7.0, y * 9.0, seed + 2))

    def col(u, y, sd):
        c = adobe_colour(y, u + sd * 9.0, seed + sd, 1.0)
        t = top(u)
        k = max(smooth(1.0 - (t - y) / 0.3), smooth(1.0 - min(u, L - u) / 0.35) * 0.9,
                0.85 * smooth((vnoise(u * 1.1 + sd * 3.0, y * 1.3, seed + 7) - 0.62) / 0.12))          # the top edge, the two ends, a patch or two on the face
        return mix(c, brick(y, u), clamp(k) * 0.85)
    us = [q[0] for q in prof]
    ys = adobe_rows(0.0, H)                                               # no more rows than the texture needs: every tooth is a column
    grid_face(lm, F, us, ys, hw, "m_frontier", lambda u, y: row_uv(FT, "adobe", u, adobe_v(y)), lambda u, y: col(u, y, 0),
              kit.chart(name + "_r", density), (), False, w_fn=lambda u, y: hw - batter * y, top_fn=top)
    grid_face(lm, F, us, ys, -hw, "m_frontier", lambda u, y: row_uv(FT, "adobe", L - u + 3.3, adobe_v(y)), lambda u, y: col(u, y, 1),
              kit.chart(name + "_l", density), (), True, w_fn=lambda u, y: -hw + batter * y, top_fn=top)
    # the broken top: the brick core, each piece between two profile points
    for k in range(len(prof) - 1):
        (u0, y0), (u1, y1) = prof[k], prof[k + 1]
        w0 = hw - batter * y0; w1 = hw - batter * y1
        q = [(u0, y0, w0), (u1, y1, w1), (u1, y1, -w1), (u0, y0, -w0)]
        vl.poly([F.p(*v) for v in q], "m_frontier", [row_uv(FT, "adobe", v[0], 0.06 + 0.1 * (v[2] / thick + 0.5)) for v in q], [brick(v[1], v[0]) for v in q])
    for (u, flip) in ((0.0, False), (L, True)):
        t = top(u)
        q = [(-hw, 0.0), (hw, 0.0), (hw - batter * t, t), (-hw + batter * t, t)]
        if flip: q = [q[1], q[0], q[3], q[2]]
        vl.poly([F.p(u, y, w) for w, y in q], "m_frontier", [row_uv(FT, "adobe", w + 0.3, 0.04 + 0.15 * y / t) for w, y in q], [brick(y, u) for w, y in q])
    return top


def ruin_wall(parts, a, b, H, thick=0.52, name="stub", seed=0, density=1.0, batter=0.025, ends=(0.55, 0.55), drops=(0.95, 1.05)):
    """A broken adobe wall (cover): the top has SLUMPED (it sags and has one bite out of it, never more than 0.2 m under
    H), both ends are raked breaks in brick-course teeth (a tread of a hand or two, a riser of one or two courses: the
    brick core shows, darker), the plaster has come off near every break. parts = (lightmapped, vertex-lit). The body
    stays the layout's cover: full height between the two end rakes. Returns (frame, top(u))."""
    lm, vl = parts
    rng = random.Random(seed * 17 + 3)
    L = math.hypot(b[0] - a[0], b[1] - a[1])
    F = Frame((a[0], 0.0, a[1]), ((b[0] - a[0]) / L, (b[1] - a[1]) / L))
    hw = thick / 2
    prof = []

    def rake(e, drop, flip):
        n = max(3, int(round(drop / 0.3)))
        out = []; u = 0.0; y = H - drop
        runs = [rng.uniform(0.6, 1.5) for _ in range(n)]; rises = [rng.uniform(0.6, 1.4) for _ in range(n)]
        sr = sum(runs); sy = sum(rises)
        out.append((0.0, y))
        for k in range(n):
            ru = e * runs[k] / sr; ri = drop * rises[k] / sy
            out.append((u + max(0.04, ru - 0.035), y + 0.02))                # the tread: a broken course, barely rising
            u += ru; y += ri
            out.append((u, y))                                              # the riser: one or two courses
        return [(L - uu, yy) for (uu, yy) in out][::-1] if flip else out
    left = rake(ends[0], drops[0], False); right = rake(ends[1], drops[1], True)
    bite = rng.uniform(ends[0] + 0.5, L - ends[1] - 0.5); bw = rng.uniform(0.28, 0.45); bd = rng.uniform(0.12, 0.2)
    mid = []
    for u in breaks(ends[0], L - ends[1], 0.45)[1:-1]:
        if abs(u - bite) < bw + 0.1: continue
        mid.append((u, H - 0.02 - 0.07 * abs(fbm(u / 0.9, seed * 0.7, seed + 9, 2)) - 0.05 * math.sin(math.pi * (u - ends[0]) / max(L - ends[0] - ends[1], 0.1))))
    mid += [(bite - bw, H - 0.03), (bite - bw * 0.3, H - bd), (bite + bw * 0.5, H - bd * 0.8), (bite + bw, H - 0.04)]
    top = _wall_from_profile(lm, vl, F, L, left + mid + right, thick, name, seed, density, batter, H)
    return F, top


def rubble_heap(part, c, r, rng, n=8, hmax=0.3):
    """What came off a broken wall end: bricks and slabs of plaster lying where they fell, some on one another, half in
    the sand (nothing over `hmax`: nothing a body meets)."""
    for k in range(n):
        a = rng.uniform(0, 2 * math.pi); d = r * rng.random() ** 0.7
        x = c[0] + math.cos(a) * d; z = c[1] + math.sin(a) * d
        slab = k % 3 == 2
        sz = (rng.uniform(0.34, 0.6), rng.uniform(0.04, 0.07), rng.uniform(0.3, 0.45)) if slab else (rng.uniform(0.3, 0.42), rng.uniform(0.1, 0.14), rng.uniform(0.17, 0.22))
        lift = (0.11 if (k % 4 == 0 and not slab) else 0.0) * (1.0 - d / max(r, 1e-3))
        y = min(hmax - sz[1] / 2 - 0.03, sz[1] * rng.uniform(0.15, 0.5) + lift)
        t = rng.uniform(-0.09, 0.09)
        colr = mul(mix(lin("adobe_base"), lin("adobe"), rng.uniform(0.1, 0.9) if slab else rng.uniform(0.0, 0.5)), rng.uniform(0.8, 1.05))
        kit.add_box(part, (x, y, z), sz, "m_frontier", colr, rot=rng.uniform(0, 180), sides="nsewt", lean=(t, -t), final=True)


def stepped_wall(parts, a, b, steps, thick=0.5, name="stub", seed=0, density=1.0, batter=0.02, fallen=1.0):
    """Polish round 2: the same broken wall as round 1's `stepped_wall_r1` (`steps` = [(u0, u1, top), ...]), but it no
    longer reads as cuboids stacked side by side: each level's top has slumped (it sags and tips), and the break between
    two levels is a RAKE of brick-course teeth (a hand or two of tread, one or two courses of riser) across the
    boundary, not one plumb riser. The heights and lengths are the caller's (within a course)."""
    lm, vl = parts
    rng = random.Random(seed * 23 + 11)
    L = math.hypot(b[0] - a[0], b[1] - a[1])
    F = Frame((a[0], 0.0, a[1]), ((b[0] - a[0]) / L, (b[1] - a[1]) / L))
    H = max(t for (_, _, t) in steps)
    half = []                                                             # half-width of the rake at each inner boundary
    for k in range(len(steps) - 1):
        dh = abs(steps[k + 1][2] - steps[k][2])
        half.append(min(0.32 * dh + 0.06, 0.42 * (steps[k][1] - steps[k][0]), 0.42 * (steps[k + 1][1] - steps[k + 1][0])))
    prof = []
    for k, (u0, u1, top) in enumerate(steps):
        ua = u0 + (half[k - 1] if k > 0 else 0.0); ub = u1 - (half[k] if k < len(steps) - 1 else 0.0)
        tip = rng.uniform(-0.05, 0.05)
        for u in breaks(ua, ub, 0.5):
            t = (u - ua) / max(ub - ua, 1e-3)
            prof.append((u, top - 0.02 - 0.05 * abs(fbm(u / 0.8, seed * 0.9, seed + 5, 2)) + tip * (t - 0.5) - 0.04 * math.sin(math.pi * t)))
        if k < len(steps) - 1:
            t2 = steps[k + 1][2]; hw_ = half[k]
            y0 = prof[-1][1]; y1 = t2 - 0.03
            n = max(2, int(round(abs(y1 - y0) / 0.32)))
            runs = [rng.uniform(0.6, 1.4) for _ in range(n)]; rises = [rng.uniform(0.6, 1.4) for _ in range(n)]
            sr = sum(runs); sy = sum(rises)
            u = ub; y = y0
            for j in range(n):
                ru = 2 * hw_ * runs[j] / sr; ri = (y1 - y0) * rises[j] / sy
                if y1 < y0:                                                # going down: riser first, then the tread
                    prof.append((u + 0.03, y + ri)); prof.append((u + ru - 0.01, y + ri - 0.015))
                else:                                                      # going up: tread first, then the riser
                    prof.append((u + max(0.03, ru - 0.04), y + 0.015)); prof.append((u + ru - 0.005, y + ri))
                u += ru; y += ri
    prof = sorted(prof)
    prof = [q for k, q in enumerate(prof) if k == 0 or q[0] - prof[k - 1][0] > 0.012]
    F0 = F.sub(du=prof[0][0])                                             # the wall is as long as its steps, not as a -> b
    prof = [(u - prof[0][0], y) for (u, y) in prof]
    _wall_from_profile(lm, vl, F0, prof[-1][0], prof, thick, name, seed, density, batter, H)
    return F


# ------------------------------------------------------------------ polish round 3: a wall's foot
def plinth(part, F, u0, u1, w_face, sgn=1.0, h=0.5, proud=0.07, seed=0, step=1.7):
    """A base course standing `proud` of a wall face (at w_face, on its +w side when sgn > 0): laid in lengths of
    about `step` m whose tops are not level with one another, damp-dark (the stained line a plastered wall has along
    its foot). Vertex-lit. Stays inside the 0.35 m a body keeps from the wall's collider."""
    rng = random.Random(seed * 17 + 3)
    us = breaks(u0, u1, step)
    for k in range(len(us) - 1):
        hh = h * rng.uniform(0.82, 1.12); pr = proud * rng.uniform(0.8, 1.25)
        c = mul(mix(lin("adobe_base"), lin("rock_dark"), 0.25), rng.uniform(0.62, 0.8))
        if sgn > 0: fbox(part, F, us[k] + 0.01, us[k + 1] - 0.01, 0.0, hh, w_face, w_face + pr, c, "adobe", "u", "ftlr")
        else: fbox(part, F, us[k] + 0.01, us[k + 1] - 0.01, 0.0, hh, w_face - pr, w_face, c, "adobe", "u", "btlr")
