"""street_parts: Front Street of env_plenty_street (docs/workorders/art-env-exterior.md 4.2): the ground with its wheel
ruts, the nine false fronts and the gatehouse, the cover between them, the alley walls, the gate court. The pump yard
is street_yard. ext_kit Parts in game space; every position comes from design/layout.json.

Light is the design constraint here: the sun stands north-west, 14 degrees up, so the north row throws its shadow four
times its own height across the street. The north row is therefore LOW where the art bible lets it be (the assay shed
and the undertaker's shed are plain sheds, the dry-goods front has lost boards), and the south row carries the tall
fronts, which face the sun."""
import math, random
from lib import layout, manifest
import ext_kit as kit
import ext_rock as rock
import ext_frontier as fr
from ext_kit import Part, lin, mix, mul, clamp, smooth, fbm, vnoise, row_uv, flat_uv, sand_uv, FT, PT
from ext_frontier import fbox

Z = "street"
ZID = "plenty_street"
SOL = {s["id"]: s for s in layout.solids(ZID)}
D = 5.0                      # depth of every block (z 7..12)
INSET = 0.13                 # every front stands this far inside its block's ends: a lean never carries it into an alley
ZF = 7.0                     # the facade line


def ground_y(x, z):
    return 0.0


# ====================================================================== ground
def rut_centre(x):
    """The wheel ruts follow the street's middle and swerve north round the ceramic rib."""
    return -1.25 * math.exp(-((x + 28.0) / 7.5) ** 2) + 0.35 * fbm(x / 23.0, 0.3, 4, 2)


def street_sand(x, z, extra=0.0):
    c = mix(lin("sand"), lin("sand_pale"), clamp(0.35 + 0.5 * fbm(x / 8.0, z / 8.0, 31, 2) + extra))
    return c


def build_ground(S):
    p = Part("st_ground", Z, smooth=60)

    def sheet(name, xs, zrow, colour=None, height=None, density=1.0):
        """A ground sheet over xs with per-x rows zrow(x) -> [z...]; one lightmap chart."""
        ch = kit.chart(name, density)
        cols = []
        for x in xs:
            zs = zrow(x)
            cols.append([(x, z) for z in zs])
        vid = {}

        def v(i, j):
            if (i, j) not in vid:
                x, z = cols[i][j]
                y = height(x, z, j) if height else 0.0
                vid[(i, j)] = (p.vert((x, y, z)), (x, y, z), j)
            return vid[(i, j)]
        for i in range(len(xs) - 1):
            for j in range(len(cols[i]) - 1):
                q = [v(i, j), v(i, j + 1), v(i + 1, j + 1), v(i + 1, j)]
                pts = [a[1] for a in q]
                cc = [colour(a[1][0], a[1][2], a[2]) if colour else street_sand(a[1][0], a[1][2]) for a in q]
                p.face([a[0] for a in q], "m_sand", [sand_uv(a) for a in pts], cc, ch, [(a[0], a[2]) for a in pts], final=True)

    # the street: two wheel ruts down the middle (rows 4..10 of 15 follow them)
    def zrow(x):
        c = rut_centre(x)
        return [-7.7, -6.0, -4.5, -3.0, c - 1.0, c - 0.78, c - 0.56, c, c + 0.56, c + 0.78, c + 1.0, 3.0, 4.5, 6.0, 7.7]

    def zh(x, z, j):
        y = 0.035 * fbm(x / 5.0, z / 5.0, 12, 2)
        if j in (5, 9): y -= 0.045                                     # the rut
        if j in (4, 6, 8, 10): y += 0.012                              # its shoulders
        if z < -6.5: y += 0.03
        if z > 6.5: y += 0.10 + 0.05 * vnoise(x / 2.0, 0.0, 5)          # sand drifts against the south row (it faces north-west)
        return y

    def zc(x, z, j):
        c = street_sand(x, z, 0.25 if z > 6.5 else 0.0)
        if j in (5, 9): c = mul(c, 0.86)
        if 4 <= j <= 10: c = mul(c, 0.95)
        return c
    xs = fr.breaks(-73.0, 0.0, 1.5, [-37.0])
    sheet("st_g_street", xs, zrow, zc, zh, 1.0)
    # alleys behind both rows, the six cross-alleys, the saddlery passage
    flat = lambda x, z, j: 0.03 * fbm(x / 4.0, z / 4.0, 14, 2) + (0.06 if j == 0 or j == 3 else 0.0)
    sheet("st_g_alley_n", fr.breaks(-80.0, 0.0, 2.0, [-37.0]), lambda x: [-15.2, -14.2, -12.8, -11.8], None, flat, 0.6)
    sheet("st_g_alley_s", fr.breaks(-74.0, 0.0, 2.0, [-37.0]), lambda x: [11.8, 12.8, 14.2, 15.2], None, flat, 0.6)
    for k, xc in enumerate((-14.5, -45.5, -61.5)):
        sheet("st_g_xn%d" % k, [xc - 1.6, xc - 0.5, xc + 0.5, xc + 1.6], lambda x: [-12.0, -10.3, -8.6, -7.5], None, lambda x, z, j: 0.03 if j in (0, 3) else 0.0, 0.6)
    for k, xc in enumerate((-21.5, -39.5, -57.5)):
        sheet("st_g_xs%d" % k, [xc - 1.6, xc - 0.5, xc + 0.5, xc + 1.6], lambda x: [7.5, 8.6, 10.3, 12.0], None, lambda x, z, j: 0.03 if j in (0, 3) else 0.0, 0.6)
    sheet("st_g_saddlery", [-67.3, -66.2, -65.1], lambda x: [7.5, 9.0, 10.5, 11.6], lambda x, z, j: mul(lin("sand"), 0.8), None, 0.6)
    # the gate court
    sheet("st_g_court", fr.breaks(-80.2, -72.8, 1.5), lambda x: [-5.6, -4.0, -2.0, 0.0, 2.0, 4.0, 5.6], None, lambda x, z, j: 0.03 * fbm(x / 4.0, z / 4.0, 15, 2), 1.0)
    # the swept bare circle round the kneeler's trough: 3 m across, a low rim of swept-out sand (the wrong thing here)
    t = SOL["st_trough"]["pos"]
    ch = kit.chart("st_g_swept", 1.0)
    sw = Part("st_swept_drift", Z, smooth=60)        # pass i4: its own part: it takes light but casts none on the sheet under it (bake_surface.py)
    n = 16
    ring = lambda r, y: [(t[0] + math.cos(2 * math.pi * k / n) * r, y, t[2] + math.sin(2 * math.pi * k / n) * r) for k in range(n)]
    r0 = ring(1.5, 0.022); r1 = ring(1.72, 0.06); r2 = ring(2.15, 0.012)
    c = (t[0], 0.02, t[2])
    packed = mul(mix(lin("sand"), lin("adobe_base"), 0.3), 0.9)
    for k in range(n):
        j = (k + 1) % n
        sw.poly([c, r0[j], r0[k]], "m_sand", [sand_uv(a) for a in (c, r0[j], r0[k])], packed, ch, [(a[0], a[2]) for a in (c, r0[j], r0[k])], final=True)
        sw.poly([r0[k], r0[j], r1[j], r1[k]], "m_sand", [sand_uv(a) for a in (r0[k], r0[j], r1[j], r1[k])], [packed, packed, lin("sand_pale"), lin("sand_pale")], ch,
               [(a[0], a[2]) for a in (r0[k], r0[j], r1[j], r1[k])], final=True)
        sw.poly([r1[k], r1[j], r2[j], r2[k]], "m_sand", [sand_uv(a) for a in (r1[k], r1[j], r2[j], r2[k])], [lin("sand_pale"), lin("sand_pale"), street_sand(r2[j][0], r2[j][2]), street_sand(r2[k][0], r2[k][2])], ch,
               [(a[0], a[2]) for a in (r1[k], r1[j], r2[j], r2[k])], final=True)
    # integration (polish round 2): a dark underlay 16 cm under the ground of each chunk. A crack at a wall foot, between two
    # ground sheets or at the seam with the lip's ground (x = 0 in the gate) showed the SKY as bright dashes; it now shows
    # shadow. Vertex-lit, buried: it bakes black on purpose. Six triangles.
    under = []
    for cid, ux0, ux1 in (("chunk_st_east", -37.0, 0.7), ("chunk_st_west", -80.0, -37.0), ("chunk_st_yard", -111.0, -80.0)):
        u = Part("st_underlay_" + cid[9:], Z, chunk=cid)
        pts = [(ux0, -0.16, -15.0), (ux0, -0.16, 15.9), (ux1, -0.16, 15.9), (ux1, -0.16, -15.0)]      # under the deepest rut (-0.10)
        u.poly(pts, "m_sand", [sand_uv(a) for a in pts], mul(lin("sand"), 0.12), final=True)
        under.append(u)
    return [p, sw] + under


# ====================================================================== a building
class B:
    """One false front: the frames and parts every piece of it is built in."""
    def __init__(self, name, x0, x1, side, lean=0.0, seed=1):
        x0 += INSET; x1 -= INSET
        self.name = name; self.x0 = x0; self.x1 = x1; self.side = side; self.W = x1 - x0
        self.rng = random.Random(seed * 101 + 7); self.seed = seed
        if side == "n": self.F = fr.Frame((x0, 0.0, -ZF), (1.0, 0.0), lean_deg=lean)
        else: self.F = fr.Frame((x1, 0.0, ZF), (-1.0, 0.0), lean_deg=lean)
        self.lean = lean
        self.lm = Part("st_" + name + "_lm", Z, paint=fr.paint(0.0, jitter=0.04))
        self.vl = Part("st_" + name + "_vl", Z, paint=fr.paint(0.0))
        self.mask = Part("st_" + name + "_mk", Z)
        self.sand = Part("st_" + name + "_sd", Z)
        self.cf = kit.chart("st_" + name + "_f", 1.0)
        self.cs = kit.chart("st_" + name + "_s", 0.5)

    def u_of(self, x):
        return x - self.x0 if self.side == "n" else self.x1 - x

    @property
    def parts(self): return [self.lm, self.vl, self.mask, self.sand]

    def side_frame(self, left):
        """The frame of a side wall: left = at u = 0 (looks along -u), else at u = W. Its u runs from the back to the front."""
        if left: f = self.F.turned(0.0, -D, 90.0)          # U' = N: from the back to the front, looking along -u
        else: f = self.F.turned(self.W, 0.0, -90.0)        # U' = -N: from the front to the back, looking along +u
        f.tilt = -self.F.lean if left else self.F.lean      # the front's lean, seen from the side
        return f


def top_profile(kind, W, H, rng):
    """The outline of a false front's top: height as a function of u."""
    if kind == "flat": return lambda u: H
    if kind == "step":
        a = W * rng.uniform(0.2, 0.28)
        return lambda u: H if a <= u <= W - a else H - 0.75
    if kind == "ped":
        return lambda u: H - 0.9 + 0.9 * (1.0 - abs(u - W / 2) / (W / 2)) ** 0.9
    if kind == "arch":
        return lambda u: H - 0.8 + 0.8 * math.sqrt(max(0.0, 1.0 - ((u - W / 2) / (W / 2 + 0.01)) ** 2))
    if kind == "ragged":
        return lambda u: H - 0.5 * vnoise(u / 0.9, 0.0, 77)
    return lambda u: H


def top_profile_min(Ht, u, W, d=0.5):
    """The lowest point of the top's outline within d metres of u (a backing behind a stepped top must not show over it)."""
    return min(Ht(clamp(u + k * d / 2, 0.0, W)) for k in (-2, -1, 0, 1, 2))


def building(b, style="boards_v", base=0.6, eave=2.8, H=5.5, top="step", doors=(), windows=(), openings=(), upper=True, miss=0.04,
             side_h=None, back_h=None, roof="boards", cornice=True, upper_windows=(), tint="board", wedge=True, sides="lr", back=True, dark=True, sign=True,
             skeleton=False):
    """The shell of a block: front (lightmapped to the eave, vertex-lit false front above), two side walls, the back
    wall on the alley, a roof behind the front. doors: [(u, mark variant | None)]; windows: [(u, y, w, h)];
    openings: [(u0, u1, y0, y1)] dark holes (the caller dresses them)."""
    F = b.F; W = b.W; rng = b.rng
    holes = [(u - 0.6, u + 0.6, 0.0, 2.2) for (u, mk) in doors] + [(u - w / 2, u + w / 2, y, y + h) for (u, y, w, h) in windows] + list(openings)
    lo = [h for h in holes if h[2] < eave]
    _st = rng.getstate(); Ht_pre = top_profile(top, W, H, rng); rng.setstate(_st)      # the same outline the boards will get (the RNG is put back)
    # ---- the backing: a near-black skin a hand behind the boards, so no gap between two boards (each has its own
    # width, so their ends never share a vertex) shows the sky; the recessed doors and shutters get their own
    VOID = mul(lin("board_dark"), 0.12)
    if style != "adobe":
        allh = holes + [(u - w / 2, u + w / 2, y, y + h) for (u, y, w, h) in upper_windows]
        Hb = eave if (not upper or skeleton) else H - 0.03
        y0b = 0.05
        prof = upper and not skeleton and style == "boards_v" and top != "flat"          # standing boards end on the top's outline
        us_b = fr.breaks(0.0, W, 0.9 if prof else 3.0, [h[k] for h in allh for k in (0, 1)])
        ys_b = sorted({y0b, Hb} | {h[k] for h in allh for k in (2, 3) if y0b < h[k] < Hb} | ({eave + 0.9} if prof else set()))
        fr.grid_face(b.vl, F, us_b, ys_b, -0.14 if miss > 0 else -0.022, "m_frontier", lambda u, y: flat_uv("m_frontier"), lambda u, y: VOID, None, allh, final=True,
                     top_fn=(lambda u: top_profile_min(Ht_pre, u, W) - 0.14) if prof else None)
        if base > 0:
            # the base course's top: a ledge a hand deep under the lowest board (weathered, sand lying on it)
            wl = 0.05 - 0.03 * base
            for (ua, ub) in zip(fr.breaks(0.0, W, 1.5)[:-1], fr.breaks(0.0, W, 1.5)[1:]):
                if any(h[0] - 1e-6 <= (ua + ub) / 2 <= h[1] + 1e-6 and h[2] < base for h in holes): continue
                q = [(ua, base - 0.004, wl + 0.004), (ub, base - 0.004, wl + 0.004), (ub, base + 0.012, -0.03), (ua, base + 0.012, -0.03)]
                b.vl.poly([F.p(*v) for v in q], "m_frontier", [row_uv(FT, "adobe", v[0], 0.3) for v in q], mix(lin("adobe_base"), lin("sand"), 0.45))
    for (u, mk) in doors:
        b.vl.poly([F.p(u - 0.62, 0.0, -0.085), F.p(u + 0.62, 0.0, -0.085), F.p(u + 0.62, 2.22, -0.085), F.p(u - 0.62, 2.22, -0.085)], "m_frontier", flat_uv("m_frontier"), VOID, final=True)
    for (u, y, w, h) in list(windows) + list(upper_windows):
        b.vl.poly([F.p(u - w / 2 - 0.02, y - 0.02, -0.065), F.p(u + w / 2 + 0.02, y - 0.02, -0.065), F.p(u + w / 2 + 0.02, y + h + 0.02, -0.065), F.p(u - w / 2 - 0.02, y + h + 0.02, -0.065)],
                  "m_frontier", flat_uv("m_frontier"), VOID, final=True)
    # ---- front, lower: lightmapped
    if style == "adobe":
        fr.adobe_face(b.lm, F, 0.0, W, 0.0, eave, 0.0, b.cf, lo, seed=b.seed, fallen=0.7, step=1.5, batter=0.012)
    else:
        if base > 0:
            fr.adobe_face(b.lm, F, 0.0, W, 0.0, base, 0.05, b.cf, [h for h in lo if h[2] < base], seed=b.seed, fallen=1.0, step=1.5, batter=0.03)
        fr.boards(b.lm, F, 0.0, W, base, eave, 0.0, style == "boards_v", tint, rng, b.cf, lo, miss=0.0)
    # ---- front, upper: the false front, vertex-lit, boards with their own ends
    Ht = top_profile(top, W, H, rng)
    if upper:
        up_holes = [h for h in holes if h[3] > eave] + [(u - w / 2, u + w / 2, y, y + h) for (u, y, w, h) in upper_windows]
        if style == "adobe":
            fr.adobe_face(b.vl, F, 0.0, W, eave, H, -0.012 * eave, None, up_holes, seed=b.seed + 4, fallen=0.0, step=1.5, top_fn=lambda u: Ht(u) + 0.06 * fbm(u / 1.7, 0.2, b.seed, 2), batter=0.012)
        else:
            gone = fr.boards(b.vl, F, 0.0, W, eave, H, 0.0, style == "boards_v", tint, rng, None, up_holes, miss=miss, top_fn=Ht if style == "boards_v" else None,
                             seg=1.6, end_jit=0.05)
            # the frame behind the boards shows where one is gone: two rails and the studs
            if gone and style == "boards_v" and not skeleton:
                for yy in (eave + 0.5, min(H - 1.2, eave + 2.3)):
                    fr.fbox(b.vl, F, 0.0, W, yy, yy + 0.12, -0.12, -0.02, mul(lin("board_dark"), 0.8), "plank_a", "u", "ftd")
            if skeleton:
                # most of the false front has gone for firewood: what stands is its frame (studs, two rails, the top
                # plate), seen from both sides, with the low sun coming through it in bars
                for k, yy in enumerate((eave + 0.55, eave + (H - eave) * 0.62)):
                    for (ua, ub) in zip(fr.breaks(0.0, W, 2.2)[:-1], fr.breaks(0.0, W, 2.2)[1:]):
                        if Ht((ua + ub) / 2) < yy + 0.3: continue
                        fr.fbox(b.vl, F, ua, ub, yy, yy + 0.13, -0.15, -0.03, mul(lin("board_dark" if k else "board"), 0.95), "plank_a", "u", "fbtd", shift=rng.uniform(0, 3))
                n_st = max(4, int(round(W / 1.15)))
                for k in range(n_st + 1):
                    u = 0.08 + (W - 0.16) * k / n_st + (rng.uniform(-0.12, 0.12) if 0 < k < n_st else 0.0)
                    top_u = Ht(u) - (0.0 if k % 4 else rng.uniform(0.2, 0.9))
                    fr.beam(b.vl, F, (u, eave - 0.05, -0.09), (u + rng.uniform(-0.03, 0.03), top_u, -0.09), 0.12, 0.13, "board" if k % 3 else "board_bleached", chamfer=0.0,
                            segs=2, caps="b", shift=rng.uniform(0, 3))
        if cornice and top in ("flat", "step"):
            a = W * 0.24 if top == "step" else 0.0
            for (ua, ub, yy) in ([(0.0, W, H)] if top == "flat" else [(a - 0.05, W - a + 0.05, H), (-0.05, a, H - 0.75), (W - a, W + 0.05, H - 0.75)]):
                yb = yy
                fr.beam(b.vl, F, (ua - 0.12, yb + 0.02, 0.05), (ub + 0.12, yb + 0.02 + rng.uniform(-0.03, 0.03), 0.05), 0.2, 0.14, "board_bleached", chamfer=0.025, segs=max(1, int((ub - ua) / 1.6)),
                        caps="ab", shift=rng.uniform(0, 3))
    # battens: the frame shows through clapboard as posts every couple of metres; a belt course at the eave
    if style == "boards_h":
        for k in range(1, int(W / 2.4)):
            u = k * W / int(W / 2.4)
            if any(h[0] - 0.15 < u < h[1] + 0.15 and h[2] < eave for h in holes): continue
            fbox(b.vl, F, u - 0.05, u + 0.05, base, eave - 0.02, 0.0, 0.035, mul(lin("board"), 0.85), "plank_a", "y", "flr")
    if upper and style != "adobe":
        fr.beam(b.vl, F, (-0.05, eave + 0.02, 0.04), (W + 0.05, eave + 0.03, 0.04), 0.16, 0.08, "board_dark", chamfer=0.015, segs=max(1, int(W / 1.6)), caps="ab", shift=rng.uniform(0, 3))
    # a signboard, blank: the letters went with the people (no in-world text)
    allholes = holes + [(u - w / 2, u + w / 2, y, y + h) for (u, y, w, h) in upper_windows]
    sw = min(W * 0.5, rng.uniform(2.4, 3.4)); sy = eave + 0.55 + rng.uniform(0.0, 0.4)
    spot = None
    for su in (W / 2 + rng.uniform(-0.5, 0.5), W * 0.3, W * 0.7):
        if not any(h[0] - 0.3 < su + sw / 2 and h[1] + 0.3 > su - sw / 2 and h[2] - 0.3 < sy + 0.7 and h[3] + 0.3 > sy for h in allholes): spot = su; break
    if upper and sign and spot is not None and H - eave > 1.6:
        su = spot
        sc = mix(lin("board_bleached"), lin("sand_pale"), 0.25)
        us_s = fr.breaks(su - sw / 2 + 0.03, su + sw / 2 - 0.03, 0.7); ys_s = [sy + 0.03, sy + 0.215, sy + 0.4, sy + 0.59]      # three planks
        for j in range(3):
            tj = mul(sc, 0.93 + 0.14 * rng.random()); shj = rng.uniform(0, 3)
            for i in range(len(us_s) - 1):
                q = [(us_s[i], ys_s[j] + 0.006), (us_s[i + 1], ys_s[j] + 0.006), (us_s[i + 1], ys_s[j + 1] - 0.006), (us_s[i], ys_s[j + 1] - 0.006)]
                b.vl.poly([F.p(u_, y_, 0.085 + 0.004 * j) for u_, y_ in q], "m_frontier", [row_uv(FT, "plank_a", u_ + shj, (y_ - ys_s[j]) / (ys_s[j + 1] - ys_s[j])) for u_, y_ in q], tj)
        for (yy, hh) in ((sy - 0.06, 0.08), (sy + 0.6, 0.08)):
            fbox(b.vl, F, su - sw / 2 - 0.06, su + sw / 2 + 0.06, yy, yy + hh, 0.0, 0.08, lin("board_dark"), "plank_b", "u", "ftdlr")
        for uu in (su - sw / 2 - 0.06, su + sw / 2 - 0.02):
            fbox(b.vl, F, uu, uu + 0.08, sy - 0.06, sy + 0.68, 0.0, 0.08, lin("board_dark"), "plank_b", "y", "flr")
    # corner boards
    for u in (0.02, W - 0.02):
        fr.beam(b.vl, F, (u, 0.0, 0.03), (u, (Ht(u) if upper else eave) + 0.02, 0.03), 0.16, 0.1, "board_dark", chamfer=0.02, segs=3, shift=rng.uniform(0, 3))
    # ---- doors and windows
    for (u, mk) in doors:
        fr.shut_door((b.lm, b.vl, b.mask), F, u, 1.2, 2.2, 0.0, rng, mk, b.cf)
        if wedge: fr.sand_wedge(b.sand, F, u - 1.1, u + 1.1, 0.9, 0.2, rng, 3, b.cf, st_off=(0.0, 4.9))
    for (u, y, w, h) in list(windows) + list(upper_windows):
        fr.shutter_window((b.lm if y < eave else b.vl, b.vl, b.mask), F, u, y, w, h, 0.0, rng, False, b.cf if y < eave else None)
    for (u0, u1, y0, y1) in (openings if dark else ()):
        fr.dark_box(b.vl, F, u0, u1, y0, y1, 1.2)
    # ---- sides, back, roof
    sh = side_h if side_h is not None else eave + 0.9
    bh = back_h if back_h is not None else sh - 0.5
    for left in (True, False):
        if ("l" if left else "r") not in sides: continue
        Fs = b.side_frame(left)
        top_fn = (lambda u: bh + (sh - bh) * (u / D)) if left else (lambda u: sh + (bh - sh) * (u / D))
        st_off = (0.0, 0.0) if left else (D + 1.0, 0.0)
        us = fr.breaks(0.0, D, 1.7)
        lowy = fr.adobe_rows(0.0, min(2.6, bh - 0.2))
        fr.grid_face(b.lm, Fs, us, lowy, 0.0, "m_frontier", lambda u, y: row_uv(FT, "adobe", u + (7.1 if left else 2.3), fr.adobe_v(y)),
                     lambda u, y: mul(fr.adobe_colour(y, u, b.seed + (5 if left else 6), 0.8), 0.9 + 0.2 * fbm(u / 2.3, y / 1.7, b.seed + 21, 2)), b.cs, st_off=st_off)
        upy = [lowy[-1]] + [v for v in (lowy[-1] + 1.1, lowy[-1] + 2.2, lowy[-1] + 3.3) if v < max(sh, bh) - 0.3] + [max(sh, bh)]
        # polish round 2: the upper part of a side wall is LIGHTMAPPED with the lower (same chart). Vertex-lit, its
        # lower corners lay on the lower panel's top edge and baked as buried, so it took the light of its top corners
        # alone: a flat darker panel over a lit one, with a ruled seam along every alley (shots/r2-visual D_hud_street_wall).
        fr.grid_face(b.lm, Fs, us, upy, 0.0, "m_frontier", lambda u, y: row_uv(FT, "adobe", u + (7.1 if left else 2.3), fr.adobe_v(y)),
                     lambda u, y: mul(fr.adobe_colour(y, u, b.seed + 5, 0.0), 0.9 + 0.2 * fbm(u / 2.3, y / 1.7, b.seed + 21, 2)), b.cs, st_off=st_off, top_fn=top_fn)
    if back:
        Fb = fr.Frame(b.F.p(W, 0.0, -D), (-b.F.U[0], -b.F.U[2])); Fb.lean = -b.F.lean
        lowy = fr.adobe_rows(0.0, min(2.6, bh - 0.2))
        fr.grid_face(b.lm, Fb, fr.breaks(0.0, W, 2.0), lowy, 0.0, "m_frontier", lambda u, y: row_uv(FT, "adobe", u + 1.7, fr.adobe_v(y)),
                     lambda u, y: fr.adobe_colour(y, u, b.seed + 8, 0.9), b.cs, st_off=(2 * D + 2.0, 0.0))
        fr.grid_face(b.vl, Fb, fr.breaks(0.0, W, 2.0), [lowy[-1], bh], 0.0, "m_frontier", lambda u, y: row_uv(FT, "adobe", u + 1.7, fr.adobe_v(y)),
                     lambda u, y: fr.adobe_colour(y, u, b.seed + 8, 0.0), None, top_fn=lambda u: bh + 0.06 * fbm(u / 2.0, 0.4, b.seed, 2))
    if roof:
        # a shed roof falling to the alley, seen from the loft, the catwalk and the gully
        for (ua, ub) in zip(fr.breaks(0.0, W, 2.4)[:-1], fr.breaks(0.0, W, 2.4)[1:]):
            q = [(ua, sh, -0.05), (ub, sh, -0.05), (ub, bh, -D + 0.05), (ua, bh, -D + 0.05)]
            if roof == "tin": uvs = [row_uv(FT, "tin", u, 0.0 if k < 2 else 1.0) for k, (u, y, w) in enumerate(q)]
            else: uvs = [row_uv(FT, "plank_b", -w, (u - ua) / (ub - ua)) for (u, y, w) in q]
            b.vl.poly([F.p(*v) for v in q], "m_frontier", uvs, mul(lin("tin" if roof == "tin" else "board_bleached"), 0.95 + 0.1 * rng.random()))
    return Ht


def porch(b, u0, u1, y_wall=3.0, y_eave=2.45, depth=1.9, post_w=0.95, posts=None, kind="boards", collapsed=None, sag=0.07, floor=False, strut=True):
    """A porch roof on posts: the posts stand 0.95 m from the wall (inside the walking line along the fronts), the roof
    overhangs them above 2.4 m. collapsed: 'l' | 'r': that end has come down (the eave lies on the ground there)."""
    F = b.F; rng = b.rng; vl = b.vl
    span = u1 - u0
    n = posts if posts is not None else max(2, int(round(span / 2.4)) + 1)
    pu = [u0 + 0.15 + (span - 0.3) * k / (n - 1) for k in range(n)]

    def drop(u):
        if collapsed == "l": return smooth((u0 + span * 0.45 - u) / (span * 0.4))
        if collapsed == "r": return smooth((u - (u1 - span * 0.45)) / (span * 0.4))
        return 0.0

    def eave_y(u):
        s = sag * math.sin(math.pi * clamp((u - u0) / span)) ** 2 + 0.03 * fbm(u / 1.3, 0.1, b.seed + 3, 2)
        return (y_eave - s) * (1 - drop(u)) + (y_wall - 0.35 - depth * 0.93) * drop(u)

    def wall_y(u):
        return y_wall - 0.35 * drop(u)

    def reach(u):
        # the broken end hangs down the wall from its rafters (it never reaches the walking line along the fronts)
        return depth * 0.36 + depth * 0.64 * (1 - drop(u)) ** 4
    us = fr.breaks(u0, u1, 1.25)
    nw = 3
    for i in range(len(us) - 1):
        for k in range(nw):
            f0 = k / nw; f1 = (k + 1) / nw
            q = []
            for (u, f) in ((us[i], f1), (us[i + 1], f1), (us[i + 1], f0), (us[i], f0)):
                y = wall_y(u) + (eave_y(u) - wall_y(u)) * f
                q.append((F.p(u, y, reach(u) * f), u, f))
            tone = 0.92 + 0.14 * rng.random()
            if kind == "tin":
                uvs = [row_uv(FT, "tin", v[1], v[2]) for v in q]; c = mul(mix(lin("tin"), lin("rust"), 0.1 * rng.random()), tone)
            else:
                uvs = [row_uv(FT, "plank_a" if k % 2 else "plank_b", v[1] + k * 0.7, (v[2] - f0) / (f1 - f0)) for v in q]; c = mul(lin("board_bleached"), tone)
            vl.poly([v[0] for v in q], "m_frontier", uvs, c)
            # the underside: what a body under the porch looks up at
            und = [q[3], q[2], q[1], q[0]]
            vl.poly([(v[0][0], v[0][1] - 0.035, v[0][2]) for v in und], "m_frontier", [row_uv(FT, "plank_b", v[1], (v[2] - f0) / (f1 - f0)) for v in und], mul(lin("board_dark"), 0.9))
    # fascia beam on the posts, rafters from the wall
    for i in range(len(us) - 1):
        ua, ub = us[i], us[i + 1]
        if drop(ua) > 0.05 or drop(ub) > 0.05: continue                  # the fascia is down with the posts
        fr.beam(vl, F, (ua, eave_y(ua) + (y_wall - y_eave) * (1 - post_w / depth) * (1 - drop(ua)) - 0.1, post_w), (ub, eave_y(ub) + (y_wall - y_eave) * (1 - post_w / depth) * (1 - drop(ub)) - 0.1, post_w),
                0.13, 0.16, "board", chamfer=0.02, shift=rng.uniform(0, 3))
    for i in range(0, len(us), 2):
        u = us[i]
        fr.beam(vl, F, (u, wall_y(u) - 0.08, 0.0), (u, eave_y(u) - 0.06, reach(u) - 0.05), 0.09, 0.12, "board_dark", chamfer=0.015, shift=rng.uniform(0, 3))
    for k, u in enumerate(pu):
        if drop(u) > 0.25:
            # a fallen post lying where it dropped
            a = F.p(u - 1.2, 0.08, 0.25 + 0.1 * rng.random()); bq = F.p(u + 1.0, 0.09, 0.45 + 0.1 * rng.random())
            kit.add_prism(vl, a, bq, 0.14, 0.14, "m_frontier", lin("board_bleached"), row=(FT, "plank_a"), chamfer=0.02, caps="ab")
            continue
        top = eave_y(u) + (y_wall - y_eave) * (1 - post_w / depth) - 0.18
        ln = rng.uniform(-0.03, 0.03)
        fr.beam(vl, F, (u, 0.0, post_w), (u + ln, top, post_w + rng.uniform(-0.02, 0.02)), 0.14, 0.14, "board" if rng.random() < 0.7 else "board_bleached", chamfer=0.025, taper=0.05,
                segs=3, shift=rng.uniform(0, 3))
        if strut:
            for sgn in (-1, 1):
                if (k == 0 and sgn < 0) or (k == n - 1 and sgn > 0): continue
                fr.beam(vl, F, (u + ln, top - 0.55, post_w), (u + ln + sgn * 0.5, top - 0.02, post_w), 0.07, 0.09, "board_dark", chamfer=0.012, shift=rng.uniform(0, 3))


# ====================================================================== the nine fronts
def marker_u(b, mid):
    m = layout.marker(mid)
    return b.u_of(m["pos"][0]), m["params"]["variant"]


def b_assay(S):
    """03 assay shed (north, x -13..0): a plain low shed, tin roof pitched to the street, one sheet lifted."""
    out = []
    b = B("assay", -13.0, -4.6, "n", lean=-2.0, seed=3)
    u, mk = marker_u(b, "prop_door_mark_1")
    building(b, "boards_v", base=0.55, eave=2.75, H=2.75, upper=False, doors=[(u, mk)], windows=[(2.0, 1.1, 0.8, 0.95), (4.2, 1.1, 0.8, 0.95)], side_h=2.9, back_h=3.9, roof=None, tint="board")
    F = b.F
    fr.tin_sheets(b.vl, F, -0.25, b.W + 0.25, (2.55, 1.15), (3.95, -D), b.rng, lifted=5, seg=2.2)
    for k, uu in enumerate((0.3, b.W / 2, b.W - 0.3)):
        fr.beam(b.vl, F, (uu, 0.0, 1.0), (uu + 0.02 * k, 2.52, 1.0), 0.13, 0.13, "board", chamfer=0.02, taper=0.05, segs=3)
    fr.beam(b.vl, F, (-0.2, 2.6, 1.0), (b.W + 0.2, 2.57, 1.0), 0.12, 0.15, "board", chamfer=0.02, segs=4)
    out += b.parts
    # the lean-to store beside it: lower, open-fronted, a rail across
    c = B("assay2", -4.2, 0.0, "n", lean=1.5, seed=4)
    building(c, "adobe", eave=2.3, H=2.3, upper=False, openings=[(0.5, 3.6, 0.0, 1.95)], side_h=2.45, back_h=2.9, roof="tin", wedge=False)
    fr.beam(c.vl, c.F, (0.4, 2.02, 0.04), (3.7, 2.0, 0.04), 0.16, 0.2, "board_dark", chamfer=0.03, segs=2, caps="ab")
    fr.beam(c.vl, c.F, (0.5, 0.95, 0.02), (3.6, 1.0, 0.02), 0.09, 0.09, "board_bleached", chamfer=0.015, segs=2)
    out += c.parts
    return out


def b_feed(S):
    """02 feed store (north, x -30..-16): two storeys; the loft door stands open with a hoist arm over it."""
    b = B("feed", -30.0, -16.0, "n", lean=2.0, seed=5)
    S.extra["street"]["feed"] = b
    u, mk = marker_u(b, "prop_door_mark_9")
    lw0 = SOL["st_loft_wall_front_0"]; lw2 = SOL["st_loft_wall_front_2"]
    d0 = b.u_of(lw0["pos"][0] + lw0["size"][0] / 2); d1 = b.u_of(lw2["pos"][0] - lw2["size"][0] / 2)          # the loft door: x -24..-22.4
    lin_s = SOL["st_loft_wall_front_lintel1"]; dtop = lin_s["pos"][1] - lin_s["size"][1] / 2
    floor = SOL["st_facade_n2_base"]["pos"][1] + SOL["st_facade_n2_base"]["size"][1] / 2                       # the loft floor, y 3
    roof = SOL["st_loft_roof"]["pos"][1] + SOL["st_loft_roof"]["size"][1] / 2
    Ht = building(b, "boards_h", base=0.7, eave=floor, H=roof + 0.55, top="step", doors=[(u, mk)], windows=[(2.2, 1.15, 0.85, 1.0), (12.4, 1.15, 0.85, 1.0)],
                  openings=[(d0, d1, floor, dtop)], miss=0.0, side_h=roof, back_h=roof - 0.3, roof="boards")
    F = b.F; rng = b.rng
    # a hoist arm over the loft door, a block and a hook; the bell and its rope are a prop (sec_loft_bell)
    um = (d0 + d1) / 2
    fr.beam(b.vl, F, (um, dtop + 0.42, -0.6), (um, dtop + 0.5, 1.25), 0.16, 0.2, "board_dark", chamfer=0.03, caps="b", segs=2)
    fr.beam(b.vl, F, (um, dtop + 0.42, 0.02), (um, dtop + 1.25, 0.02), 0.12, 0.12, "board", chamfer=0.02)
    fr.beam(b.vl, F, (um, dtop + 1.2, 0.05), (um, dtop + 0.55, 1.0), 0.09, 0.09, "board", chamfer=0.015)
    # the loft door's frame
    for uu in (d0 - 0.07, d1 + 0.07):
        fr.beam(b.vl, F, (uu, floor - 0.05, 0.03), (uu, dtop + 0.12, 0.03), 0.14, 0.1, "board_dark", chamfer=0.02, segs=2)
    fr.beam(b.vl, F, (d0 - 0.2, dtop + 0.08, 0.04), (d1 + 0.2, dtop + 0.1, 0.04), 0.14, 0.14, "board_dark", chamfer=0.02)
    # the loading dock under the loft door (the layout's porch block): a timber crib boarded on three sides
    dk = SOL["st_loft_porch"]
    k0 = b.u_of(dk["pos"][0] - dk["size"][0] / 2); k1 = b.u_of(dk["pos"][0] + dk["size"][0] / 2); kd = dk["size"][2]; kt = dk["pos"][1] + dk["size"][1] / 2
    ch = kit.chart("st_feed_dock", 1.0)
    Ff = fr.Frame(F.p(k0, 0.0, kd), (F.U[0], F.U[2]))
    fr.boards(b.lm, Ff, 0.0, k1 - k0, 0.0, kt - 0.06, 0.0, False, "board", rng, ch, wmin=0.2, wmax=0.3)
    for (uu, deg, off) in ((k0, -90.0, 3.0), (k1, 90.0, 6.0)):
        # left side looks along -u, right side along +u
        if deg < 0:
            Fl = fr.Frame(F.p(uu, 0.0, 0.0), (F.N[0], F.N[2]))                     # U = N: its normal is -U_front
            fr.boards(b.lm, Fl, 0.0, kd, 0.0, kt - 0.06, 0.0, False, "board", rng, ch, wmin=0.2, wmax=0.3, st_off=(off, 0.0))
        else:
            Fr_ = fr.Frame(F.p(uu, 0.0, kd), (-F.N[0], -F.N[2]))                   # U = -N: its normal is +U_front
            fr.boards(b.lm, Fr_, 0.0, kd, 0.0, kt - 0.06, 0.0, False, "board", rng, ch, wmin=0.2, wmax=0.3, st_off=(off, 0.0))
    fr.fbox(b.vl, F, k0 - 0.06, k1 + 0.06, kt - 0.07, kt, 0.0, kd + 0.08, lin("board_bleached"), "plank_a", "w", "ftlrd")
    for (uu, ww) in ((k0 + 0.02, kd - 0.02), (k1 - 0.02, kd - 0.02)):
        fr.beam(b.vl, F, (uu, 0.0, ww), (uu, kt - 0.05, ww), 0.18, 0.18, "board_dark", chamfer=0.03, segs=3)
    # the loft: floor, back, sides, the roof's underside, the inside of the front wall
    il = Part("st_feed_loft", Z, paint=fr.paint(floor, dust=0.25, jitter=0.07, grad=(0.75, 1.0), grad_h=3.0))
    Fi = fr.Frame(F.p(0.5, floor, -0.5), (F.U[0], F.U[2]))                                               # inside faces: built in a frame at the loft floor
    Wi = b.W - 1.0; Di = 4.0; Hi = roof - 0.3 - floor
    Ffl = fr.Frame(F.p(0.5, floor + 0.01, -0.5), (F.U[0], F.U[2]))
    # floor boards (running along u), as a horizontal sheet: use a frame laid flat by building quads directly
    w = 0.0
    while w < Di - 1e-6:
        wd = min(Di - w, rng.uniform(0.34, 0.5))
        if Di - (w + wd) < 0.15: wd = Di - w
        for (ua, ub) in zip(fr.breaks(0.0, Wi, 3.4)[:-1], fr.breaks(0.0, Wi, 3.4)[1:]):
            q = [(ua, -w), (ub, -w), (ub, -w - wd), (ua, -w - wd)]
            il.poly([Fi.p(uu, 0.0, ww) for uu, ww in q], "m_frontier", [row_uv(FT, "plank_a", uu + w * 3.1, (-ww - w) / wd) for uu, ww in q], mul(lin("board"), 0.9 + 0.2 * rng.random()))
        w += wd
    Fb = fr.Frame(Fi.p(0.0, 0.0, -Di), (F.U[0], F.U[2]))
    fr.boards(il, Fb, 0.0, Wi, 0.0, Hi, 0.0, True, "board", rng, None, seg=3.2, wmin=0.34, wmax=0.5)
    Fl = fr.Frame(Fi.p(0.0, 0.0, 0.0), (-F.N[0], -F.N[2])); Fr2 = fr.Frame(Fi.p(Wi, 0.0, -Di), (F.N[0], F.N[2]))
    fr.boards(il, Fl, 0.0, Di, 0.0, Hi, 0.0, True, "board", rng, None, seg=3.2, wmin=0.34, wmax=0.5)
    fr.boards(il, Fr2, 0.0, Di, 0.0, Hi, 0.0, True, "board", rng, None, seg=3.2, wmin=0.34, wmax=0.5)
    Ffr = fr.Frame(Fi.p(Wi, 0.0, 0.0), (-F.U[0], -F.U[2]))                                               # the front wall seen from inside
    fr.boards(il, Ffr, 0.0, Wi, 0.0, Hi, 0.0, True, "board_dark", rng, None, [(Wi - (d1 - 0.5), Wi - (d0 - 0.5), -1.0, dtop - floor)], seg=3.2, wmin=0.34, wmax=0.5)
    for (ua, ub) in zip(fr.breaks(0.0, Wi, 1.6)[:-1], fr.breaks(0.0, Wi, 1.6)[1:]):                       # roof underside + rafters
        q = [(ua, 0.0), (ua, -Di), (ub, -Di), (ub, 0.0)]
        il.poly([Fi.p(uu, Hi, ww) for uu, ww in q], "m_frontier", [row_uv(FT, "plank_b", -ww, (uu - ua) / (ub - ua)) for uu, ww in q], lin("board_dark"))
        fr.beam(il, Fi, (ua, Hi - 0.08, 0.0), (ua, Hi - 0.08, -Di), 0.1, 0.16, "board_dark", chamfer=0.02, segs=2)
    kit.tessellate(il, 2.6)
    return b.parts + [il]


def b_boarding(S, x0=-16.2, x1=-7.0, side="s", lean=-3.0, seed=7, mark="prop_door_mark_5", name="board"):
    """06 boarding house (south, x -16.2..-7: it faces the sun): two storeys, a balcony with a missing rail."""
    b = B(name, x0, x1, side, lean=lean, seed=seed)
    u, mk = marker_u(b, mark)
    W = b.W
    wl = [uu for uu in (W * 0.16, W * 0.84) if abs(uu - u) > 1.5] or [W * 0.84]
    building(b, "boards_h", base=0.5, eave=3.0, H=6.0, top="flat", doors=[(u, mk)], windows=[(uu, 1.1, 0.9, 1.1) for uu in wl],
             upper_windows=[(uu, 3.95, 0.9, 1.15) for uu in (W * 0.16, W * 0.84) if abs(uu - u) > 1.3], openings=[], miss=0.0, side_h=5.6, back_h=5.1, roof="boards", wedge=False, sign=False)
    F = b.F; rng = b.rng; vl = b.vl
    # an upper door onto the balcony (shut), the balcony deck on four posts, the rail with one bay gone
    fr.shut_door((vl, vl, b.mask), F.sub(0, 3.05, 0), u, 1.1, 2.1, 0.012, rng, None, None)
    vl.poly([F.p(u - 0.6, 3.05, -0.075), F.p(u + 0.6, 3.05, -0.075), F.p(u + 0.6, 5.2, -0.075), F.p(u - 0.6, 5.2, -0.075)], "m_frontier", flat_uv("m_frontier"), mul(lin("board_dark"), 0.12), final=True)
    deck_y = 3.0; dw = 1.5
    for (ua, ub) in zip(fr.breaks(0.6, W - 0.6, 1.5)[:-1], fr.breaks(0.6, W - 0.6, 1.5)[1:]):
        s_ = 0.05 * math.sin(math.pi * (ua - 0.6) / (W - 1.2))
        fr.fbox(vl, F, ua, ub - 0.015, deck_y - 0.1 - s_, deck_y - 0.03 - s_, 0.0, dw, mul(lin("board_bleached"), 0.9 + 0.2 * rng.random()), "plank_a", "w", "ftd")
    fr.beam(vl, F, (0.5, deck_y - 0.2, 0.95), (W - 0.5, deck_y - 0.22, 0.95), 0.14, 0.18, "board", chamfer=0.02, segs=6)
    pus = [0.7, W * 0.36, W * 0.66, W - 0.7]
    for k, uu in enumerate(pus):
        fr.beam(vl, F, (uu, 0.0, 0.95), (uu + rng.uniform(-0.03, 0.03), deck_y - 0.26, 0.95), 0.15, 0.15, "board", chamfer=0.025, taper=0.04, segs=3, shift=rng.uniform(0, 3))
        fr.beam(vl, F, (uu, deck_y - 0.04, dw - 0.06), (uu + rng.uniform(-0.02, 0.02), deck_y + (1.0 if k != 2 else 0.55), dw - 0.06), 0.09, 0.09, "board_bleached", chamfer=0.015)
    for (ua, ub, present) in ((pus[0], pus[1], True), (pus[1], pus[2], False), (pus[2], pus[3], True)):
        if present:
            fr.beam(vl, F, (ua, deck_y + 0.95, dw - 0.06), (ub, deck_y + 0.93, dw - 0.06), 0.08, 0.07, "board_bleached", chamfer=0.012, segs=2)
            fr.beam(vl, F, (ua, deck_y + 0.45, dw - 0.06), (ub, deck_y + 0.47, dw - 0.06), 0.07, 0.06, "board", chamfer=0.012, segs=2)
        else:
            fr.beam(vl, F, (ua, deck_y + 0.95, dw - 0.06), (ua + 1.7, deck_y + 0.2, dw + 0.25), 0.08, 0.07, "board_bleached", chamfer=0.012)      # the rail hangs by one end
    # a small roof over the balcony door
    fr.tin_sheets(vl, F, u - 1.3, u + 1.3, (5.35, 1.0), (5.8, 0.0), rng, seg=0.0)
    fr.sand_wedge(b.sand, F, 0.2, W - 0.2, 1.0, 0.28, rng, 5, b.cf, st_off=(0.0, 3.6))
    return b.parts


def b_ruin(S):
    """North, x -44..-30: what is left of the old livery. Its roof went for timber and firewood long ago; the adobe
    stands in broken, stepped lengths between one and three metres, the door still shut in its frame with its mark
    struck through like every other, the roof posts and three rafters against the sky. It is LOW on purpose: the sun
    (north-west, 14 degrees up) comes over it and lays the posts' shadows across the street, at the player."""
    out = []
    x0 = -44.0 + INSET; x1 = -30.0 - INSET; W = x1 - x0
    F = fr.Frame((x0, 0.0, -ZF), (1.0, 0.0))
    m = layout.marker("prop_door_mark_2"); ud = m["pos"][0] - x0; mk = m["params"]["variant"]
    rng = random.Random(733)
    lm = Part("st_ruin_lm", Z, paint=fr.paint(0.0, jitter=0.04)); vl = Part("st_ruin_vl", Z, paint=fr.paint(0.0)); mask = Part("st_ruin_mk", Z); sand = Part("st_ruin_sd", Z)
    zf = -ZF - 0.26
    # the front wall in two lengths either side of the door, each stepped down at its broken end; a window whose
    # lintel has gone is a gap with a sill
    # (pass i2, the visual reviewer: "a light-leaking gap between a wall and the door post beside it": the walls stopped
    # 0.78 m from the door's middle and the frame's posts, which lean, end at 0.74: the walls now run into the posts)
    GAPW = 0.66
    wa = (x0, zf); wb = (x0 + ud - GAPW, zf); wc = (x0 + ud + GAPW, zf); wd = (x1, zf)
    La = ud - GAPW; Lb = W - ud - GAPW
    fr.stepped_wall((lm, vl), wa, wb, [(0.0, 0.55, 2.95), (0.55, 1.3, 2.55), (1.3, 2.3, 1.55), (2.3, 3.5, 1.05), (3.5, 4.1, 1.9), (4.1, 5.3, 2.7), (5.3, La, 2.95)], 0.5, "st_ruin_fa", seed=741, density=1.0, batter=0.02)
    fr.stepped_wall((lm, vl), wc, wd, [(0.0, 1.0, 2.95), (1.0, 1.5, 2.45), (1.5, 2.7, 1.0), (2.7, 3.3, 2.5), (3.3, 4.5, 2.8), (4.5, 5.2, 1.85), (5.2, Lb, 1.25)], 0.5, "st_ruin_fb", seed=743, density=1.0, batter=0.02)
    # the door in its frame: two posts, a lintel, the leaf shut and marked
    Fd = fr.Frame((x0, 0.0, zf + 0.12), (1.0, 0.0), lean_deg=1.5)
    fr.shut_door((vl, vl, mask), Fd, ud, 1.2, 2.2, 0.0, rng, mk, None)
    vl.poly([Fd.p(ud - 0.62, 0.0, -0.085), Fd.p(ud + 0.62, 0.0, -0.085), Fd.p(ud + 0.62, 2.22, -0.085), Fd.p(ud - 0.62, 2.22, -0.085)], "m_frontier", flat_uv("m_frontier"), mul(lin("board_dark"), 0.3), final=True)
    fr.beam(vl, Fd, (ud - 0.86, 2.47, -0.1), (ud + 0.9, 2.5, -0.1), 0.3, 0.24, "board_dark", chamfer=0.03, caps="ab", segs=2)
    # side walls and the back wall on the alley
    fr.stepped_wall((lm, vl), (x0 + 0.25, -ZF - D), (x0 + 0.25, zf - 0.25), [(0.0, 1.6, 2.9), (1.6, 2.9, 2.6), (2.9, 3.6, 1.7), (3.6, D - 0.5, 2.3)], 0.5, "st_ruin_sw", seed=745, density=0.6, batter=0.02)
    fr.stepped_wall((lm, vl), (x1 - 0.25, -ZF - D), (x1 - 0.25, zf - 0.25), [(0.0, 1.2, 2.7), (1.2, 2.4, 2.2), (2.4, 3.4, 1.4), (3.4, D - 0.5, 0.9)], 0.5, "st_ruin_se", seed=747, density=0.6, batter=0.02)
    fr.stepped_wall((lm, vl), (x0, -ZF - D + 0.25), (x1, -ZF - D + 0.25), [(0.0, 2.4, 2.9), (2.4, 4.0, 2.5), (4.0, 6.1, 2.95), (6.1, 7.0, 2.0), (7.0, 8.3, 1.2), (8.3, 9.2, 2.1), (9.2, 12.0, 2.85), (12.0, W, 2.6)],
                    0.5, "st_ruin_bk", seed=749, density=0.6, batter=0.02)
    # the floor inside: blown sand, deeper against the north-west walls
    ch = kit.chart("st_ruin_floor", 0.6)
    xs = fr.breaks(x0 + 0.4, x1 - 0.4, 2.2); zs = [-ZF - D + 0.45, -ZF - 3.4, -ZF - 1.9, zf - 0.2]
    fy = lambda x, z: 0.08 + 0.3 * clamp((-ZF - 1.2 - z) / 3.6) ** 1.5 * (0.6 + 0.4 * vnoise(x / 2.3, 0.3, 91)) + 0.04 * fbm(x / 2.0, z / 2.0, 92, 2)
    for i in range(len(xs) - 1):
        for j in range(len(zs) - 1):
            q = [(xs[i], zs[j]), (xs[i], zs[j + 1]), (xs[i + 1], zs[j + 1]), (xs[i + 1], zs[j])]
            pts = [(x, fy(x, z), z) for x, z in q]
            sand.poly(pts, "m_sand", [sand_uv(a) for a in pts], [mix(lin("sand"), lin("sand_pale"), clamp(0.3 + 1.5 * (a[1] - 0.08))) for a in pts], ch, [(a[0], a[2]) for a in pts], final=True, weld=True)
    # what stands of the roof: the posts down the middle and along the old porch, a length of ridge, three rafters
    mid = -2.6
    posts = [(1.9, 3.25, True), (5.3, 3.1, True), (8.9, 3.3, True), (12.2, 2.4, False)]
    for k, (u, h, whole) in enumerate(posts):
        fr.beam(vl, F, (u, 0.05, mid), (u + rng.uniform(-0.08, 0.08), h, mid + rng.uniform(-0.06, 0.06)), 0.19, 0.19, "board_dark" if k % 2 else "board", chamfer=0.03, taper=0.06, segs=4,
                caps="b", shift=rng.uniform(0, 3))
    fr.beam(vl, F, (1.5, 3.3, mid), (5.7, 3.18, mid), 0.17, 0.2, "board", chamfer=0.025, segs=4, caps="ab", shift=1.3)
    fr.beam(vl, F, (5.5, 3.2, mid + 0.12), (8.6, 0.35, mid + 0.9), 0.17, 0.2, "board_bleached", chamfer=0.025, segs=4, caps="ab", shift=0.4)          # the next length has come down at one end
    for u in (2.2, 3.4, 4.9):
        fr.beam(vl, F, (u, 3.42, mid + 0.25), (u + 0.05, 2.9, -D + 0.3), 0.11, 0.13, "board_bleached", chamfer=0.015, segs=3, caps="ab", shift=rng.uniform(0, 3))
    # the porch: its posts still stand along the walking line, bare (each lays a long bar of shadow across the street)
    for k, (u, h) in enumerate(((0.9, 2.5), (4.3, 2.62), (9.7, 2.45), (13.0, 1.5))):
        fr.beam(vl, F, (u, 0.0, 0.95), (u + rng.uniform(-0.05, 0.05), h, 0.95 + rng.uniform(-0.03, 0.03)), 0.15, 0.15, "board" if k != 1 else "board_bleached", chamfer=0.025, taper=0.05, segs=4,
                caps="b", shift=rng.uniform(0, 3))
    fr.beam(vl, F, (0.6, 2.56, 0.95), (4.7, 2.66, 0.95), 0.13, 0.16, "board", chamfer=0.02, segs=4, caps="ab", shift=2.2)
    kit.add_prism(vl, F.p(6.0, 0.08, 0.5), F.p(8.3, 0.1, 0.78), 0.14, 0.14, "m_frontier", lin("board_bleached"), row=(FT, "plank_a"), chamfer=0.02, caps="ab", segs=2)        # a fallen post
    # drifts against the front, bricks where the wall came down
    fr.sand_wedge(sand, F, 0.3, ud - 0.9, 0.9, 0.3, rng, 5, kit.chart("st_ruin_dr0", 1.0))
    fr.sand_wedge(sand, F, ud + 0.9, W - 0.3, 0.9, 0.32, rng, 5, kit.chart("st_ruin_dr1", 1.0))
    rb = Part("st_ruin_rb", Z)
    for (uc, n) in ((2.9, 4), (9.8, 4), (13.2, 3)):
        for k in range(n):
            u = uc + rng.uniform(-0.8, 0.8); w = rng.uniform(-0.2, 0.75)
            sz = (rng.uniform(0.3, 0.42), rng.uniform(0.1, 0.14), rng.uniform(0.17, 0.22))
            col = kit.mul(kit.mix(lin("adobe_base"), lin("adobe"), rng.uniform(0.1, 0.7)), rng.uniform(0.85, 1.05))
            c = F.p(u, sz[1] * rng.uniform(0.2, 0.6) + (0.1 if k == 0 else 0.0), w)
            t = rng.uniform(-0.05, 0.05)
            kit.add_box(rb, c, sz, "m_frontier", col, rot=rng.uniform(0, 180), sides="nsewt", lean=(t, -t), final=True)
    kit.tessellate(vl, 1.6)
    return [lm, vl, mask, sand, rb]


def b_drygoods(S):
    """04 dry-goods (north, x -60..-47): the porch has come down at its west end; the false front has lost boards."""
    b = B("dry", -60.0, -47.0, "n", lean=3.0, seed=9)
    u, mk = marker_u(b, "prop_door_mark_3")
    building(b, "boards_v", base=0.6, eave=2.9, H=5.0, top="step", doors=[(u, mk)], windows=[(2.6, 1.05, 1.3, 1.1), (10.3, 1.05, 1.3, 1.1)], miss=0.74, side_h=3.05, back_h=2.75, roof="tin",
             skeleton=True, sign=False)
    porch(b, 0.4, b.W - 0.4, y_wall=2.95, y_eave=2.42, depth=1.9, collapsed="l", kind="boards")
    return b.parts


def b_undertaker(S):
    """08 undertaker's shed (north, west end, x -73..-63): plain, shuttered, planed boards stacked; no coffins."""
    b = B("under", -73.0, -63.0, "n", lean=-2.0, seed=11)
    u, mk = marker_u(b, "prop_door_mark_4")
    building(b, "boards_v", base=0.0, eave=2.7, H=3.05, top="flat", doors=[(u, mk)], windows=[(2.0, 1.1, 0.9, 1.0)], miss=0.0, side_h=2.95, back_h=2.6, roof="boards", tint="board_bleached", sign=False)
    F = b.F; rng = b.rng
    # planed boards stacked on two trestles against the wall, a few stood on end: new wood in a grey town
    y = 0.42
    for uu in (6.9, 8.7):
        fr.beam(b.vl, F, (uu, 0.0, 0.2), (uu, 0.42, 0.2), 0.08, 0.08, "board_dark", chamfer=0.012)
        fr.beam(b.vl, F, (uu, 0.0, 0.7), (uu, 0.42, 0.7), 0.08, 0.08, "board_dark", chamfer=0.012)
        fr.beam(b.vl, F, (uu, 0.4, 0.12), (uu, 0.4, 0.8), 0.08, 0.07, "board_dark", chamfer=0.012)
    for layer in range(4):
        w = 0.14
        while w < 0.7:
            wd = rng.uniform(0.18, 0.24)
            fr.fbox(b.vl, F, 6.3 + rng.uniform(-0.12, 0.12), 9.3 + rng.uniform(-0.15, 0.15), y, y + 0.038, w, w + wd - 0.012, mul(mix(lin("board_bleached"), lin("sand_pale"), 0.45), 0.95 + 0.1 * rng.random()),
                    "plank_a", "u", "ftlrd", shift=rng.uniform(0, 3))
            w += wd
        y += 0.045
    for k in range(3):
        uu = 9.55 + 0.17 * k
        fr.fbox(b.vl, fr.Frame(F.p(uu, 0.0, 0.03), (F.U[0], F.U[2]), tilt_deg=-6.0 - 2 * k), 0.0, 0.2, 0.0, 2.3 + 0.2 * k, 0.24, 0.28, mix(lin("board_bleached"), lin("sand_pale"), 0.4), "plank_b", "y", "ftlr")
    return b.parts


def b_livery(S):
    """South row, x -20..0: the boarding house (06; two storeys: it faces the sun), a low tack room and a walled corral."""
    out = []
    a = B("tack", -6.6, 0.0, "s", lean=2.0, seed=13)                                   # u = 0 at x = 0
    building(a, "adobe", eave=2.8, H=3.6, top="ragged", windows=[(2.2, 1.2, 0.8, 0.9), (4.6, 1.2, 0.8, 0.9)], side_h=3.4, back_h=3.0, roof="boards", wedge=False)
    # viga ends through the plaster under the parapet
    for k in range(7):
        uu = 0.6 + k * 0.9
        fr.beam(a.vl, a.F, (uu, 3.0, -0.3), (uu + 0.01 * k, 2.98, 0.32 + 0.06 * a.rng.random()), 0.15, 0.15, "board_dark", chamfer=0.035, caps="b")
    fr.sand_wedge(a.sand, a.F, 0.2, a.W - 0.2, 1.0, 0.3, a.rng, 4, a.cf, st_off=(0.0, 3.6))
    out += a.parts
    out += b_boarding(S)
    # the corral: a low adobe wall with a gap closed by rails (the south sun never comes through: this side is the alley)
    c = B("corral", -20.0, -16.6, "s", lean=0.0, seed=17)
    building(c, "adobe", eave=2.3, H=2.3, upper=False, side_h=2.3, back_h=2.3, roof=None, wedge=False, sides="r", back=False)
    fr.sand_wedge(c.sand, c.F, 0.1, c.W - 0.1, 0.9, 0.3, c.rng, 3, c.cf, st_off=(0.0, 3.6))
    out += c.parts
    return out


def b_smithy(S):
    """05 smithy (south, x -38..-23): adobe, open front under a heavy lintel, the forge cold inside."""
    b = B("smithy", -38.0, -23.0, "s", lean=2.5, seed=19)
    u, mk = marker_u(b, "prop_door_mark_6")
    o0, o1 = 8.9, 13.9
    building(b, "adobe", eave=3.0, H=5.0, top="ragged", doors=[(u, mk)], windows=[(3.0, 1.2, 0.9, 1.0)], openings=[(o0, o1, 0.0, 2.6)], side_h=4.4, back_h=3.9, roof="boards", wedge=False)
    F = b.F; rng = b.rng; vl = b.vl
    fr.beam(vl, F, (o0 - 0.5, 2.78, 0.02), (o1 + 0.5, 2.74, 0.02), 0.3, 0.38, "board_dark", chamfer=0.04, segs=3, caps="ab")
    fr.beam(vl, F, ((o0 + o1) / 2, 0.0, -0.05), ((o0 + o1) / 2 + 0.04, 2.58, -0.05), 0.22, 0.22, "board_dark", chamfer=0.035, segs=3)
    # the forge: a block of adobe, a hood, a chimney through the roof; an anvil stump (shapes in the dark)
    dark = mul(lin("adobe_base"), 0.5)
    fr.fbox(vl, F, o0 + 0.8, o0 + 2.4, 0.0, 0.95, -1.15, -0.25, dark, None, "u", "ftlr")
    fr.fbox(vl, F, o0 + 0.9, o0 + 2.3, 1.75, 2.6, -1.1, -0.3, mul(dark, 0.8), None, "u", "fdlr")
    fr.fbox(vl, F, o1 - 1.3, o1 - 0.8, 0.0, 0.62, -0.75, -0.3, mul(lin("board_dark"), 0.6), "plank_end", "u", "ftlr")
    fr.fbox(vl, F, o1 - 1.42, o1 - 0.7, 0.62, 0.84, -0.7, -0.36, mul(lin("steel_dark"), 1.2), None, "u", "ftlrd")
    # the chimney above the roof: a silhouette on the south skyline
    Fc = fr.Frame(F.p(o0 + 1.0, 0.0, -1.6), (F.U[0], F.U[2]), lean_deg=-2.0)
    for (y0, y1, s) in ((3.9, 5.6, 0.0), (5.6, 6.5, 0.07)):
        fr.fbox(vl, Fc, s, 1.2 - s, y0, y1, s, 1.0 - s, lin("adobe"), "adobe", "u", "fblrt")
    porch(b, 0.3, o0 - 0.6, y_wall=3.0, y_eave=2.45, depth=1.8, kind="tin", posts=4)
    fr.sand_wedge(b.sand, F, 0.3, o0 - 0.3, 1.0, 0.3, rng, 4, b.cf, st_off=(0.0, 3.6))
    return b.parts


def b_wash(S):
    """South, x -56..-41: the wash-house (07; the cord line of strain cloths hangs in front of it) and the tall meeting rooms."""
    out = []
    a = B("wash", -50.0, -41.0, "s", lean=-2.0, seed=21)                                 # u = 0 at x = -41
    u, mk = marker_u(a, "prop_door_mark_7")
    building(a, "boards_h", base=0.9, eave=2.7, H=3.4, top="flat", doors=[(u, mk)], windows=[(1.8, 1.25, 0.8, 0.8), (4.3, 1.25, 0.8, 0.8)], miss=0.0, side_h=3.3, back_h=2.9, roof="tin", wedge=False)
    # two posts for the cord line (the cord itself is 0.05 m fat: 2 mm per metre at 25 m), a stone tub
    F = a.F; rng = a.rng
    pu = (0.9, 6.3)
    S.extra["street"]["wash_line"] = [F.p(pu[0], 1.95, 0.9), F.p(pu[1], 1.9, 0.9), F]
    for uu in pu:
        fr.beam(a.vl, F, (uu, 0.0, 0.9), (uu + rng.uniform(-0.04, 0.04), 2.1, 0.9), 0.11, 0.11, "board_bleached", chamfer=0.02, taper=0.08, segs=3)
    kit.add_prism(a.vl, F.p(pu[0], 1.97, 0.9), F.p(pu[1], 1.92, 0.9), 0.05, 0.05, "m_frontier", lin("cord"), row=(FT, "cord"), segs=4)
    # the wash trough: a stone tub of four thick slabs on two sleepers, dry sand in it; a wash-board left leaning on it
    tub = mix(lin("adobe_base"), lin("rock_dark"), 0.3)
    Ft = fr.Frame(F.p(2.6, 0.0, 0.2), (F.U[0], F.U[2]), lean_deg=-1.5)
    for (ua, ub) in ((0.1, 0.28), (1.02, 1.2)): fr.fbox(a.vl, Ft, ua, ub, 0.0, 0.14, -0.04, 0.72, lin("board_dark"), "plank_a", "w", "ftlr")
    for (ua, ub, wa, wb, hh, tone) in ((0.0, 1.3, 0.56, 0.68, 0.56, 1.0), (0.0, 1.3, 0.0, 0.12, 0.6, 0.92), (0.0, 0.12, 0.12, 0.56, 0.58, 1.06), (1.18, 1.3, 0.12, 0.56, 0.54, 0.96)):
        fr.fbox(a.vl, Ft, ua, ub, 0.12, hh, wa, wb, mul(tub, tone), None, "u", "fbtlr")
    for (ua, ub) in ((0.12, 0.65), (0.65, 1.18)):
        a.vl.poly([Ft.p(ua, 0.4, 0.12), Ft.p(ua, 0.4, 0.56), Ft.p(ub, 0.4, 0.56), Ft.p(ub, 0.4, 0.12)][::-1], "m_frontier", flat_uv("m_frontier"), mul(lin("sand"), 0.8))
    fr.fbox(a.vl, fr.Frame(Ft.p(1.42, 0.0, 0.2), (Ft.U[0], Ft.U[2]), tilt_deg=-14.0), 0.0, 0.34, 0.0, 0.62, 0.3, 0.33, lin("board_bleached"), "plank_b", "y", "fbtlr")
    fr.sand_wedge(a.sand, F, 0.2, a.W - 0.2, 0.9, 0.25, rng, 4, a.cf, st_off=(0.0, 3.6))
    out += a.parts
    b = B("meet", -56.0, -50.4, "s", lean=3.0, seed=23)
    building(b, "boards_v", base=0.6, eave=3.0, H=6.5, top="ped", windows=[(1.3, 1.1, 0.8, 1.2), (4.3, 1.1, 0.8, 1.2)], openings=[], upper_windows=[(b.W / 2, 4.1, 0.9, 1.2)], miss=0.05,
             side_h=5.0, back_h=4.4, roof="boards")
    porch(b, 0.3, b.W - 0.3, y_wall=3.0, y_eave=2.45, depth=1.7, kind="boards", posts=3)
    fr.sand_wedge(b.sand, b.F, 0.2, b.W - 0.2, 1.0, 0.3, b.rng, 3, b.cf, st_off=(0.0, 3.6))
    out += b.parts
    return out


def b_saddlery(S):
    """01 saddlery (south, west end, x -73..-59): the open doorway wave C comes through; a saddle tree on its bracket."""
    out = []
    sw = SOL["st_facade_s4_w"]; se = SOL["st_facade_s4_e"]; lt = SOL["st_facade_s4_lintel"]
    xd0 = sw["pos"][0] + sw["size"][0] / 2; xd1 = se["pos"][0] - se["size"][0] / 2                  # the doorway: x -67.2..-65.2
    dh = lt["pos"][1] - lt["size"][1] / 2                                                          # 2.6 m
    b = B("saddle", -73.0, -59.0, "s", lean=-4.0, seed=25)
    u, mk = marker_u(b, "prop_door_mark_8")
    d0 = b.u_of(xd1); d1 = b.u_of(xd0)
    building(b, "boards_v", base=0.6, eave=3.0, H=5.5, top="step", doors=[(u, mk)], windows=[(11.6, 1.1, 0.9, 1.0)], openings=[(d0, d1, 0.0, dh)], miss=0.06, side_h=4.2, back_h=3.6, roof="boards", dark=False, wedge=False)
    F = b.F; rng = b.rng; vl = b.vl
    # the passage behind the doorway: dark boards, a back wall (the layout's s4_back), a ceiling; the building's dark box is replaced
    psg = Part("st_saddle_psg", Z, paint=fr.paint(0.0, dust=0.3, grad=(0.5, 0.42), grad_h=2.6, jitter=0.08))
    Fl = fr.Frame(F.p(d0, 0.0, 0.0), (-F.N[0], -F.N[2])); Fr_ = fr.Frame(F.p(d1, 0.0, -4.5), (F.N[0], F.N[2]))
    fr.boards(psg, Fl, 0.0, 4.5, 0.0, dh, 0.0, True, "board_dark", rng, None, seg=1.4, wmin=0.22, wmax=0.3)
    fr.boards(psg, Fr_, 0.0, 4.5, 0.0, dh, 0.0, True, "board_dark", rng, None, seg=1.4, wmin=0.22, wmax=0.3)
    fr.boards(psg, fr.Frame(F.p(d0, 0.0, -4.5), (F.U[0], F.U[2])), 0.0, d1 - d0, 0.0, dh, 0.0, True, "board_dark", rng, None, seg=1.4, wmin=0.22, wmax=0.3)
    for (wa, wb) in ((0.0, -1.5), (-1.5, -3.0), (-3.0, -4.5)):
        psg.poly([F.p(d0, dh, wa), F.p(d0, dh, wb), F.p(d1, dh, wb), F.p(d1, dh, wa)], "m_frontier", flat_uv("m_frontier"), mul(lin("board_dark"), 0.9))
    out.append(psg)
    # the doorway's frame and the sign bracket: a saddle tree (the wooden frame of a saddle), no lettering
    for uu in (d0 - 0.08, d1 + 0.08):
        fr.beam(vl, F, (uu, 0.0, 0.03), (uu, dh + 0.1, 0.03), 0.16, 0.12, "board_dark", chamfer=0.025, segs=3)
    fr.beam(vl, F, (d0 - 0.3, dh + 0.12, 0.04), (d1 + 0.3, dh + 0.16, 0.04), 0.16, 0.2, "board_dark", chamfer=0.025)
    um = (d0 + d1) / 2
    fr.beam(vl, F, (um, 3.85, 0.0), (um, 3.9, 1.5), 0.1, 0.12, "board_dark", chamfer=0.02, caps="b")
    fr.beam(vl, F, (um, 3.2, 0.03), (um, 3.82, 0.75), 0.07, 0.07, "board", chamfer=0.012)
    tree = fr.Frame(F.p(um, 3.02, 1.12), (F.N[0], F.N[2]))                                         # hangs square to the street: seen side-on by someone walking it
    c = mix(lin("board_bleached"), lin("leather"), 0.35)
    fr.beam(vl, tree, (-0.3, 0.0, 0.0), (-0.24, 0.42, 0.0), 0.07, 0.3, c, chamfer=0.02)            # fork (pommel arch)
    fr.beam(vl, tree, (0.3, 0.0, 0.0), (0.22, 0.3, 0.0), 0.07, 0.3, c, chamfer=0.02)               # cantle
    for ww in (-0.11, 0.11):
        fr.beam(vl, tree, (-0.32, 0.03, ww), (0.34, 0.0, ww), 0.07, 0.06, c, chamfer=0.015)        # the two bars
    fr.beam(vl, tree, (-0.24, 0.42, 0.0), (-0.24, 0.84, 0.0), 0.04, 0.04, lin("cord"), chamfer=0.0)
    fr.beam(vl, tree, (0.22, 0.3, 0.0), (0.2, 0.84, 0.0), 0.04, 0.04, lin("cord"), chamfer=0.0)
    porch(b, 0.3, d0 - 0.4, y_wall=3.0, y_eave=2.45, depth=1.8, kind="boards", posts=3)
    fr.sand_wedge(b.sand, F, 0.2, d0 - 0.2, 1.0, 0.3, rng, 4, b.cf, st_off=(0.0, 3.6))
    fr.sand_wedge(b.sand, F, d1 + 0.2, b.W - 0.2, 1.0, 0.32, rng, 4, b.cf, st_off=(0.0, 3.6))
    out += b.parts
    return out


# ====================================================================== cover on the street
def stub_wall(S, sid, seed, extra=0.12, ragged=False, lanes=(False, False), dens=2.8, kdens=3.6):      # pass i6: 2.0 / 2.5 (the painted bond is half the size: wall_paint.BOND_H)
    """A broken adobe wall stub: 0.5 m thick, the layout's cover height, stepped broken ends showing brick."""
    s = SOL[sid]
    along_z = s["size"][2] > s["size"][0]
    L = max(s["size"][0], s["size"][2]); H = s["size"][1] + extra
    c = s["pos"]
    a = (c[0], c[2] - L / 2) if along_z else (c[0] - L / 2, c[2])
    b = (c[0], c[2] + L / 2) if along_z else (c[0] + L / 2, c[2])
    rng = random.Random(seed)
    # polish round 2: a broken wall, not two stacked cuboids at each end (fr.ruin_wall: slumped top, raked ends in brick
    # courses, plaster off near the breaks); the body between the rakes stays the layout's cover height
    e0 = rng.uniform(0.45, 0.62); e1 = rng.uniform(0.45, 0.62)
    lm = Part("st_" + sid.replace("st_cover_", "").replace("yd_cover_", "y") + "_lm", Z, paint=fr.paint(0.0, jitter=0.03))
    vl = Part("st_" + sid.replace("st_cover_", "").replace("yd_cover_", "y") + "_vl", Z, paint=fr.paint(0.0))
    drops = (rng.uniform(0.85, 1.0), rng.uniform(0.95, 1.15))
    if ragged:
        # pass i5: the breaks are brickwork (fr.break_wall: the same ends, drops and cover as before)
        fr.break_wall((lm, vl), a, b, H, 0.52, sid, seed=seed, density=dens, batter=0.025, ends=(e0, e1), drops=drops, lanes=lanes, kdens=kdens)
    else:
        fr.ruin_wall((lm, vl), a, b, H, 0.52, sid, seed=seed, density=1.0, batter=0.025, ends=(e0, e1), drops=drops, ragged=False)
    sd = Part("st_" + sid.replace("st_cover_", "").replace("yd_cover_", "y") + "_sd", Z)
    # sand banked on the north-west side (pass i5, the brickwork stubs: lower and longer, six pieces: a bank, not a ramp)
    wh, ww, wn = (0.27, 1.15, 6) if ragged else (0.4, 0.9, 4)
    if along_z: fr.sand_wedge(sd, fr.Frame((a[0] - 0.26, 0.0, a[1]), (0.0, 1.0)), 0.1, L - 0.1, ww, wh, rng, wn, kit.chart(sid + "_sand", 1.0))      # west face
    else: fr.sand_wedge(sd, fr.Frame((b[0], 0.0, b[1] - 0.26), (-1.0, 0.0)), 0.1, L - 0.1, ww, wh, rng, wn, kit.chart(sid + "_sand", 1.0))            # north face
    # what fell from the broken ends: bricks and plaster lying where they dropped, half in the sand (none over 0.3 m).
    # Pass i5, the brickwork stubs: bricks only (a flat slab on the sand read as a decal), on a low fan of adobe gone
    # back to earth, and ALL of it lightmapped (vertex-lit, High's sun map shaded it whole in the yard's shade: dark blue)
    rb = Part("st_" + sid.replace("st_cover_", "").replace("yd_cover_", "y") + "_rb", Z)
    ux, uz = (0.0, 1.0) if along_z else (1.0, 0.0)
    isl = fr.Isles(sid + "_q", 1.5) if ragged else None
    for k_, (end, sgn) in enumerate(((a, -1.0), (b, 1.0))):
        if ragged:
            fr.rubble_fan(sd, (end[0] + sgn * ux * 0.38, end[1] + sgn * uz * 0.38), 0.8, rng, chart=kit.chart(sid + "_fan%d" % k_, 1.0))      # (in the loose-sand part: it casts nothing into the bake, bake_surface)
            fr.rubble_bricks(isl, lm, (end[0] + sgn * ux * 0.45, end[1] + sgn * uz * 0.45), 0.6, rng, n=rng.choice((5, 6)))
        else: fr.rubble_heap(rb, (end[0] + sgn * ux * 0.45, end[1] + sgn * uz * 0.45), 0.6, rng, n=rng.choice((6, 7, 8)))
    return [lm, vl, sd, rb]


def build_rib(S):
    """The ceramic rib of the old works surfacing through the street like a whale's back: 9 m long, 1.6 m thick, a
    true circular arc in section (0.6 m shoulders), panel seams every 1.2 m, one panel missing (steel ribs and cable
    show), sand banked north-west. Its back is level over the layout's cover solid (2.2 m: the layout's height wins
    over the art bible's 1.9) and dives into the ground at both ends. Pellam: exact, no jitter."""
    s = SOL["st_cover_rib"]
    c = s["pos"]; rot = s.get("rotY", 0)
    p = Part("st_rib", Z, paint=None)
    Lh = 4.5; flat = s["size"][2] / 2 - 0.22; crown = s["size"][1]; T = s["size"][0] / 2       # the nose ends at the cover solid's end
    ch = kit.chart("st_rib", 1.0)
    nseg = 15
    enamel = lin("enamel"); stain = lin("enamel_stain")

    def height(s_):
        a = abs(s_)
        if a <= flat: return crown + 0.05 * (1.0 - (a / flat) ** 2)
        if a <= flat + 0.22:                                                  # a steep nose into the sand
            t = clamp((a - flat) / 0.22)
            return max(crown * math.sqrt(max(0.0, 1.0 - t * t)), 0.3)
        return 0.3 * clamp(1.0 - (a - flat - 0.22) / (Lh - flat - 0.22)) ** 0.7   # the rest of its back, a low ridge under the drift

    def section(h):
        """12 points across the rib at height h: sides, two 0.6 m quarter-circle shoulders, a flat top."""
        r = min(0.6, max(h, 0.0))
        pts = [(-T, -0.25), (-T, max(h - r, 0.0))]
        for a in (157.5, 135.0, 112.5, 90.0):
            pts.append((-T + 0.6 + 0.6 * math.cos(math.radians(a)), h - r + r * math.sin(math.radians(a))))
        for a in (90.0, 67.5, 45.0, 22.5, 0.0):
            pts.append((T - 0.6 + 0.6 * math.cos(math.radians(a)), h - r + r * math.sin(math.radians(a))))
        pts.append((T, -0.25))
        return pts

    cum = [0.0]
    ref = section(crown)
    for k in range(len(ref) - 1): cum.append(cum[-1] + math.hypot(ref[k + 1][0] - ref[k][0], ref[k + 1][1] - ref[k][1]))
    ss = sorted({round(-Lh + 9.0 * i / nseg, 4) for i in range(nseg + 1)} | {round(sg * (flat + d), 4) for sg in (-1, 1) for d in (0.0, 0.08, 0.15, 0.22)})
    nseg = len(ss) - 1
    secs = [section(height(v)) for v in ss]
    world = [[kit.rot_y((c[0] + a, y, c[2] + sv), rot, c) for (a, y) in sec] for sv, sec in zip(ss, secs)]
    missing = tuple(i for i in range(nseg) if 0.9 - 1e-6 <= ss[i] and ss[i + 1] <= 2.1 + 1e-6)          # one 1.2 m panel of the east flank
    v0, v1 = manifest.trim_v(PT, "panel", 2)
    nk = len(ref)
    for i in range(nseg):
        for k in range(nk - 1):
            if i in missing and k >= nk - 3: continue
            pts = [world[i][k], world[i + 1][k], world[i + 1][k + 1], world[i][k + 1]]
            keep = [0]
            for t in range(1, 4):
                if all(kit.vlen(kit.vsub(pts[t], pts[q])) > 0.01 for q in keep): keep.append(t)
            if len(keep) < 3: continue
            q = [(i, k), (i + 1, k), (i + 1, k + 1), (i, k + 1)]
            uvs = [((ss[a] + Lh) / 3.6, v0 + (v1 - v0) * (cum[b] / cum[-1])) for a, b in q]
            cols = []
            for (a, b) in q:
                y = world[a][b][1]
                seam = abs(((ss[a] + Lh) / 1.2) % 1.0 - 0.5) > 0.4
                cc = mix(enamel, stain, clamp(0.7 * clamp(1.0 - y / 0.9) + (0.22 if seam else 0.0)))
                cols.append(mix(cc, lin("sand"), 0.55 * clamp(1.0 - y / 0.45) ** 1.5))
            p.poly([pts[t] for t in keep], "m_pellam", [uvs[t] for t in keep], [cols[t] for t in keep], ch, [(ss[q[t][0]], cum[q[t][1]]) for t in keep], final=True)
    # behind the missing panel: a dark cavity, three steel ribs, a hank of cable
    s0 = ss[missing[0]]; s1 = ss[missing[-1] + 1]
    dark = mul(lin("steel_dark"), 0.5)
    inner = lambda sv, y: kit.rot_y((c[0] + T - 0.5, y, c[2] + sv), rot, c)
    outer = lambda sv, y: kit.rot_y((c[0] + T, y, c[2] + sv), rot, c)
    hh = crown - 0.6
    p.poly([inner(s1, -0.2), inner(s0, -0.2), inner(s0, hh + 0.45), inner(s1, hh + 0.45)], "m_pellam", flat_uv("m_pellam"), dark, final=True)
    p.poly([outer(s0, -0.2), inner(s0, -0.2), inner(s0, hh + 0.45), outer(s0, hh)][::-1], "m_pellam", flat_uv("m_pellam"), dark, final=True)
    p.poly([outer(s1, -0.2), inner(s1, -0.2), inner(s1, hh + 0.45), outer(s1, hh)], "m_pellam", flat_uv("m_pellam"), dark, final=True)
    p.poly([outer(s0, hh), inner(s0, hh + 0.45), inner(s1, hh + 0.45), outer(s1, hh)][::-1], "m_pellam", flat_uv("m_pellam"), dark, final=True)
    for k in range(3):
        sv = s0 + (s1 - s0) * (k + 0.5) / 3
        kit.add_prism(p, kit.rot_y((c[0] + T - 0.12, -0.2, c[2] + sv), rot, c), kit.rot_y((c[0] + T - 0.16, hh + 0.2, c[2] + sv), rot, c), 0.09, 0.14, "m_pellam", lin("steel"), chamfer=0.0, up=(1.0, 0.0, 0.0), final=True)
    kit.add_prism(p, kit.rot_y((c[0] + T - 0.25, hh, c[2] + s0 + 0.1), rot, c), kit.rot_y((c[0] + T + 0.05, 0.05, c[2] + s1 - 0.45), rot, c), 0.09, 0.09, "m_pellam", lin("cable"), chamfer=0.0, segs=2, final=True)
    sd = Part("st_rib_sand", Z)
    d = kit.rot_y((0.0, 0.0, 1.0), rot)
    Fw = fr.Frame(kit.rot_y((c[0] - T, 0.0, c[2] - Lh + 0.3), rot, c), (d[0], d[2]))        # along the west flank, looking north-west
    fr.sand_wedge(sd, Fw, 2.0, 6.6, 0.45, 0.32, random.Random(5), 4, kit.chart("st_rib_sand", 1.0))
    return [p, sd]


def build_pump_house(S):
    """The well-head over the street pump (the layout's `pump_post` cover): four posts, boarded all round, a cap of boards.
    The iron pump stands against its east side, the trough beyond it: both are a prop (prop_trough_pump, embedded)."""
    s = SOL["st_cover_pump_post"]
    c = s["pos"]; hx = s["size"][0] / 2; H = s["size"][1]
    lm = Part("st_pumphouse_lm", Z, paint=fr.paint(0.0, jitter=0.05)); vl = Part("st_pumphouse_vl", Z, paint=fr.paint(0.0))
    rng = random.Random(41)
    ch = kit.chart("st_pumphouse", 1.0)
    F = fr.Frame((c[0] - hx, 0.0, c[2] + hx), (1.0, 0.0), lean_deg=2.0)                    # south face
    fr.boards(lm, F, 0.0, 2 * hx, 0.0, H - 0.35, 0.0, True, "board", rng, ch, wmin=0.18, wmax=0.26, top_fn=lambda u: H - 0.4 + 0.1 * vnoise(u * 3, 0.0, 3))
    Fn = fr.Frame((c[0] + hx, 0.0, c[2] - hx), (-1.0, 0.0), lean_deg=-2.0)                 # north face
    fr.boards(lm, Fn, 0.0, 2 * hx, 0.0, H - 0.35, 0.0, True, "board", rng, ch, wmin=0.18, wmax=0.26, st_off=(3.0, 0.0), top_fn=lambda u: H - 0.45 + 0.12 * vnoise(u * 3, 1.0, 3))
    Fw = fr.Frame((c[0] - hx, 0.0, c[2] - hx), (0.0, 1.0))                                 # west face (N = U x Y = (0,0,1)x(0,1,0) = (-1,0,0))
    fr.boards(lm, Fw, 0.0, 2 * hx, 0.0, H - 0.35, 0.0, True, "board_bleached", rng, ch, wmin=0.18, wmax=0.26, st_off=(6.0, 0.0), top_fn=lambda u: H - 0.4 + 0.1 * vnoise(u * 3, 2.0, 3))
    for (dx, dz) in ((-1, -1), (-1, 1), (1, 1), (1, -1)):
        kit.add_prism(vl, (c[0] + dx * (hx - 0.07), 0.0, c[2] + dz * (hx - 0.07)), (c[0] + dx * (hx - 0.1), H - 0.22, c[2] + dz * (hx - 0.1)), 0.15, 0.15, "m_frontier", lin("board_dark"),
                      row=(FT, "plank_a"), chamfer=0.025, segs=3)
    fr.fbox(vl, fr.Frame((c[0] - hx - 0.12, 0.0, c[2] - hx - 0.12), (1.0, 0.0)), 0.0, 2 * hx + 0.24, H - 0.24, H - 0.17, -(2 * hx + 0.24), 0.0, lin("board_bleached"), "plank_b", "u", "fbtlrd")
    fr.fbox(vl, fr.Frame((c[0] - hx + 0.1, 0.0, c[2] - hx + 0.1), (1.0, 0.0)), 0.0, 2 * hx - 0.2, H - 0.17, H + 0.0, -(2 * hx - 0.2), 0.0, lin("board"), "plank_a", "u", "fbtlr")
    Fe = fr.Frame((c[0] + hx, 0.0, c[2] + hx), (0.0, -1.0), lean_deg=1.5)                 # east face, toward the trough and the pump
    fr.boards(lm, Fe, 0.0, 2 * hx, 0.0, H - 0.35, 0.0, True, "board", rng, ch, wmin=0.18, wmax=0.26, st_off=(9.0, 0.0), top_fn=lambda u: H - 0.42 + 0.1 * vnoise(u * 3, 3.0, 3))
    return [lm, vl]


# ====================================================================== alley walls, the street's ends, the gate court
def build_walls(S):
    lm = Part("st_walls_lm", Z, paint=fr.paint(0.0, jitter=0.03)); vl = Part("st_walls_vl", Z, paint=fr.paint(0.0))
    rng = random.Random(51)
    out = [lm, vl]
    wn = SOL["st_wall_n"]; ws = SOL["st_wall_s"]
    # the alley walls: only their inner faces are ever seen
    for (s, side, name) in ((wn, "r", "st_wall_n"), (ws, "l", "st_wall_s")):
        x0 = s["pos"][0] - s["size"][0] / 2; x1 = s["pos"][0] + s["size"][0] / 2; zc = s["pos"][2]; H = s["size"][1]
        for k, (xa, xb) in enumerate(((x0, -37.0), (-37.0, x1))):
            fr.adobe_wall((lm, vl), (xa, zc), (xb, zc), H, s["size"][2], f"{name}{k}", seed=60 + k + (5 if side == "l" else 0), density=0.5, sides=side, ends="", step=2.2,
                          top_fn=lambda u, kk=k, HH=H: HH - 0.1 + 0.22 * fbm(u / 3.0, kk * 3.1, 7, 2) - 0.5 * max(0.0, vnoise(u / 6.0, kk + 4.0, 8) - 0.72) / 0.28)
    # the east end of the north alley (nothing in the layout closes it): the town wall turns the corner
    fr.adobe_wall((lm, vl), (0.3, -16.0), (0.3, -8.9), 4.0, 0.6, "st_end_n", seed=71, density=0.5, sides="r", ends="")
    # the west wall of the street with the yard gate's opening, the two gatehouse blocks, the court
    g = layout.marker("door_yard_gate"); gh = g["size"][1]; half = g["size"][0] / 2
    w0 = SOL["st_wall_w_0"]; w2 = SOL["st_wall_w_2"]
    xw = w0["pos"][0]; za = w0["pos"][2] - w0["size"][2] / 2; zb = w2["pos"][2] + w2["size"][2] / 2; Hw = w0["size"][1]
    hole = (g["pos"][2] - half - za, g["pos"][2] + half - za, 0.0, gh)
    Fw = fr.adobe_wall((lm, vl), (xw, za), (xw, zb), Hw, w0["size"][0], "st_wall_w", holes=[hole], seed=73, density=1.0, ends="", fallen=0.8,
                       top_fn=lambda u: Hw - 0.06 + 0.12 * fbm(u / 2.4, 0.9, 9, 2) + 0.55 * smooth(1.0 - abs(u - (hole[0] + hole[1]) / 2) / 3.2))
    for u, flip in ((hole[0], False), (hole[1], True)):
        Fj = Fw.turned(u, -w0["size"][0] / 2, 90.0)
        fr.adobe_face(lm, Fj, 0.0, w0["size"][0], 0.0, gh, 0.0, kit.chart("st_gate_jamb%d" % flip, 1.0), flip=not flip, seed=75 + flip, batter=0.0, step=1.0)
    for k in range(3):
        wq = -w0["size"][0] / 2 - 0.04 + k * (w0["size"][0] + 0.08) / 3
        fr.beam(vl, Fw, (hole[0] - 0.4, gh + 0.17, wq + 0.17), (hole[1] + 0.4, gh + 0.17 + rng.uniform(-0.02, 0.02), wq + 0.17), 0.33, 0.32, "board_dark", chamfer=0.03, segs=3, caps="ab",
                shift=rng.uniform(0, 3))
    # piers against the street wall, either side of the gate, on the court side and the street side; sand at their feet
    for k, uu in enumerate((hole[0] - 1.6, hole[1] + 1.6)):
        fr.buttress(vl, Fw, uu, w0["size"][0] / 2, 1.0, h=2.6, width=0.85, proj=0.5, top_proj=0.14, seed=141 + k)
        fr.buttress(vl, Fw, uu + (0.7 if k else -0.7), -w0["size"][0] / 2, -1.0, h=2.7, width=0.85, proj=0.55, top_proj=0.14, seed=145 + k)
    # polish round 3 (the visual critic: the wall round the yard gate was one flat plane at the end of the street): a
    # stained base course on both faces either side of the gate, rain streaks and blotches in the wall's colour
    Lg = zb - za; hw_ = w0["size"][0] / 2
    for (ua, ub, sd_) in ((0.5, hole[0] - 2.25, 41), (hole[1] + 2.25, Lg - 0.5, 42)):
        fr.plinth(vl, Fw, ua, ub, hw_, 1.0, h=0.6, proud=0.09, seed=sd_)
        fr.plinth(vl, Fw, ua, ub, -hw_, -1.0, h=0.6, proud=0.09, seed=sd_ + 4)
    # put-log poles left in the wall under its top (two runs of four on the street face), and a canale either side
    # of the gate with the stain it has left down the plaster
    CANS = (za + 3.3, zb - 3.8)
    for (ua, sd_) in ((1.2, 0), (hole[1] + 3.0, 1)):
        for k in range(4):
            uu = ua + k * 1.35 + 0.1 * math.sin(k * 2.3 + sd_)
            if uu > Lg - 0.8 or (hole[0] - 2.4 < uu < hole[1] + 2.4): continue
            fr.beam(vl, Fw, (uu, Hw - 1.05, -hw_ + 0.2), (uu, Hw - 1.08, -hw_ - 0.38 - 0.08 * (k % 2)), 0.13, 0.13, "board_dark", chamfer=0.03, caps="b")
    for zc in CANS:
        uc = zc - za
        fr.fbox(vl, Fw, uc - 0.12, uc + 0.12, Hw - 0.5, Hw - 0.39, -hw_ - 0.6, -hw_ + 0.1, lin("board_bleached"), "plank_a", "w", "fbtlrd")
    ww_ = fr.wall_weather(2, Hw, 221, stains=CANS)
    wfn = lambda p: ww_(p) if (abs(p[0] - xw) < hw_ + 0.2 and za - 0.1 < p[2] < zb + 0.1) else 1.0
    fr.weather(lm, wfn); fr.weather(vl, wfn)
    sdw = Part("st_wallw_sd", Z); out.append(sdw)
    Fst = fr.Frame(Fw.p(zb - za, 0.0, -w0["size"][0] / 2), (-Fw.U[0], -Fw.U[2]))                     # the street side (looks east)
    fr.sand_wedge(sdw, Fst, 0.6, (zb - za) - hole[1] - 2.3, 1.0, 0.3, rng, 5, kit.chart("st_wallw_dr0", 0.7))
    fr.sand_wedge(sdw, Fst, (zb - za) - hole[0] + 2.3, (zb - za) - 0.6, 1.0, 0.34, rng, 5, kit.chart("st_wallw_dr1", 0.7))
    # 09 the gatehouse: two adobe blocks flanking the court, a lean-to roof on each toward the court
    for (sid, zface, sgn) in (("st_gatehouse_n", SOL["st_gatehouse_n"]["pos"][2] + SOL["st_gatehouse_n"]["size"][2] / 2, 1), ("st_gatehouse_s", SOL["st_gatehouse_s"]["pos"][2] - SOL["st_gatehouse_s"]["size"][2] / 2, -1)):
        s = SOL[sid]; x0 = s["pos"][0] - s["size"][0] / 2; x1 = s["pos"][0] + s["size"][0] / 2; H = s["size"][1]
        if sgn > 0: F = fr.Frame((x0, 0.0, zface), (1.0, 0.0), lean_deg=1.5)           # looks south into the court
        else: F = fr.Frame((x1, 0.0, zface), (-1.0, 0.0), lean_deg=-2.0)               # looks north into the court
        ch = kit.chart(sid + "_f", 1.0)
        Wd = x1 - x0
        door = (2.2, 3.4, 0.0, 2.2) if sgn > 0 else None
        fr.adobe_face(lm, F, 0.0, Wd, 0.0, 2.9, 0.0, ch, [door] if door else [], seed=80 + sgn, fallen=0.8, step=1.5, batter=0.012)
        fr.adobe_face(vl, F, 0.0, Wd, 2.9, H, -0.035, None, [], seed=82 + sgn, fallen=0.0, step=1.5, top_fn=lambda u, HH=H, kk=sgn: HH + 0.08 * fbm(u / 1.6, kk, 5, 2), batter=0.012)
        if door:
            fr.shut_door((lm, vl, vl), F, 2.8, 1.2, 2.2, 0.0, rng, None, ch)
        # the lean-to: tin on three posts, the posts close to the wall
        fr.tin_sheets(vl, F, 0.4, Wd - 0.4, (2.42, 1.45), (3.0, 0.0), rng, seg=0.0)
        for uu in (0.6, Wd / 2, Wd - 0.6):
            fr.beam(vl, F, (uu, 0.0, 0.9), (uu, 2.5, 0.9), 0.12, 0.12, "board", chamfer=0.02, taper=0.05, segs=3)
        fr.beam(vl, F, (0.4, 2.56, 0.9), (Wd - 0.4, 2.52, 0.9), 0.1, 0.14, "board", chamfer=0.02, segs=3)
        # viga ends under the parapet, the block's roof (seen from the catwalk)
        for k in range(6):
            uu = 0.5 + k * (Wd - 1.0) / 5
            fr.beam(vl, F, (uu, H - 0.75, -0.3), (uu, H - 0.77, 0.3), 0.14, 0.14, "board_dark", chamfer=0.03, caps="b")
        z1 = s["pos"][2] - sgn * s["size"][2] / 2
        zlo, zhi = min(zface, z1), max(zface, z1)
        vl.poly([(x0, H - 0.3, zlo), (x0, H - 0.3, zhi), (x1, H - 0.3, zhi), (x1, H - 0.3, zlo)], "m_frontier", row_uv(FT, "adobe", 0.5, 0.9), mix(lin("adobe"), lin("sand_pale"), 0.4))
        # its east face rises over the street's west wall; its alley face
        Le = s["size"][2]
        fr.adobe_face(vl, fr.Frame((x1, 0.0, max(zface, z1)), (0.0, -1.0)), 0.0, Le, Hw - 0.3, H, 0.0, None, [], seed=85 + sgn, fallen=0.0, step=2.0, batter=0.0,
                      top_fn=lambda u, HH=H, kk=sgn: HH + 0.08 * fbm(u / 1.6, kk + 9, 5, 2))
        if sgn > 0:                                                                  # the alley side of the north block (z = -12)
            fr.adobe_face(lm, fr.Frame((x1, 0.0, z1), (-1.0, 0.0)), 0.0, Wd, 0.0, 2.6, 0.0, kit.chart(sid + "_b", 0.5), [], seed=88, fallen=0.8, step=2.0, batter=0.012)
            fr.adobe_face(vl, fr.Frame((x1, 0.0, z1), (-1.0, 0.0)), 0.0, Wd, 2.6, H, -0.03, None, [], seed=89, fallen=0.0, step=2.0, batter=0.012)
    return out


def build_cover(S):
    out = []
    out += stub_wall(S, "st_cover_stub_a", 91, ragged=True)
    out += stub_wall(S, "st_cover_stub_b", 93, ragged=True)
    out += build_rib(S)
    out += build_pump_house(S)
    return out


def build(S):
    parts = build_ground(S)
    for fn in (b_assay, b_feed, b_ruin, b_drygoods, b_undertaker, b_livery, b_smithy, b_wash, b_saddlery):
        parts += fn(S)
    parts += build_cover(S)
    parts += build_walls(S)
    import street_yard
    parts += street_yard.build(S)
    S.extra["street"]["post"] = street_yard.post
    return parts


def embed(S):
    import street_yard
    street_yard.embed(S)
