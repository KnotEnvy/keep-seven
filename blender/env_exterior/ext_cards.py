"""ext_cards: flat, unlit far scenery (helper module): the backdrops' mesa rings, the pylon line, clouds, the plain, and the
town card. `m_flat` meshes: UV0 on the palette's palest cell (`ui_pale`), the colour carried in COLOR_0 as a ratio to
it, so the shipped colour is palette x COLOR_0 (the core fallback and, unless code-render rules otherwise, the game).
Everything in GAME space; `Card` collects polygons and realizes ONE mesh object."""
import math, random
import bpy
import numpy as np
from lib import manifest, material, layout, vcol
from lib.scene import link
import ext_kit as kit
from ext_kit import lin, mix, mul, clamp, smooth, fbm, vnoise

BASE_CELL = "ui_pale"


def hexlin(h):
    return kit.lin(h)


class Card:
    def __init__(self, name):
        self.name = name; self.v = []; self.f = []; self.c = []; self.u = []; self.m = []; self.u1 = []

    def poly(self, pts, cols, mat="m_flat", uv=None, uv1=None):
        if not isinstance(cols[0], (tuple, list)): cols = [cols] * len(pts)
        i0 = len(self.v)
        self.v.extend(pts)
        self.f.append(tuple(range(i0, i0 + len(pts))))
        self.c.append([tuple(c) for c in cols]); self.m.append(mat)
        self.u.append(uv if uv is not None else manifest.palette_uv(BASE_CELL))
        self.u1.append(uv1)

    def tris(self):
        return sum(len(f) - 2 for f in self.f)

    def realize(self, name=None, ratio=True):
        base = np.array(manifest.palette_rgb(BASE_CELL), np.float32)
        me = bpy.data.meshes.new("me_" + (name or self.name))
        me.from_pydata([layout.to_blender(p) for p in self.v], [], self.f)
        nl = sum(len(f) for f in self.f)
        uv0 = np.zeros((nl, 2), np.float32); uv1 = np.zeros((nl, 2), np.float32); col = np.ones((nl, 4), np.float32)
        mats = []; mi = np.zeros(len(self.f), np.int32)
        k = 0
        for j, f in enumerate(self.f):
            if self.m[j] not in mats: mats.append(self.m[j])
            mi[j] = mats.index(self.m[j])
            for t in range(len(f)):
                uv0[k] = self.u[j]
                if self.u1[j] is not None: uv1[k] = self.u1[j]
                c = np.array(self.c[j][t], np.float32)
                col[k, :3] = np.clip(c / base, 0, 1) if (ratio and self.m[j] == "m_flat") else c
                k += 1
        for m in mats: me.materials.append(material.game_material(m))
        me.polygons.foreach_set("material_index", mi)
        me.uv_layers.new(name="UVMap").data.foreach_set("uv", uv0.ravel())
        if any(u is not None for u in self.u1): me.uv_layers.new(name="UVLight").data.foreach_set("uv", uv1.ravel())
        me.color_attributes.new("Color", 'FLOAT_COLOR', 'CORNER').data.foreach_set("color", col.ravel())
        me.update()
        ob = bpy.data.objects.new(name or self.name, me); link(ob)
        ob["bake"] = "UNLIT"
        return ob


# ------------------------------------------------------------------ shapes
def mesa_profile(theta, seed, base_h, var):
    """Height of a mesa ring at bearing theta (radians): buttes with flat tops and steep sides, talus aprons, gaps."""
    n = vnoise(theta * 2.6, 0.5, seed) * 0.7 + vnoise(theta * 7.0, 2.5, seed + 5) * 0.3
    level = smooth((n - 0.42) / 0.08) * 0.55 + smooth((n - 0.62) / 0.05) * 0.45      # two shelf levels, cliffs between
    apron = 0.22 + 0.1 * vnoise(theta * 19.0, 1.0, seed + 2)
    gap = smooth((vnoise(theta * 4.5, 3.0, seed + 1) - 0.7) / 0.08)
    return base_h * max(apron, 0.25 + 0.75 * level) * (1.0 - 0.8 * gap) * (0.9 + 0.2 * var * vnoise(theta * 31.0, 4.0, seed + 3))


def mesa_step(theta, seed, base_h, var=1.0):
    """mesa_profile as a far mesa is SEEN: flat tops at a few unequal levels with cliffs between them (the caller draws
    each card with one height: no sloping top edge, so a ring never reads as the rim of a drum), and narrow notches
    where a canyon comes through."""
    w = 0.085                                                             # a bench is some five degrees wide, none the same width as its neighbour
    tq = (math.floor((theta + 0.035 * math.sin(theta * 17.0 + seed)) / w) + 0.5) * w
    h = mesa_profile(tq, seed, base_h, var)
    lv = base_h / 3.6
    hq = lv * math.floor(h / lv + 0.5 + 0.9 * (vnoise(tq * 13.0, 5.0, seed + 11) - 0.5))
    notch = smooth((vnoise(tq * 9.0, 6.0, seed + 7) - 0.66) / 0.04)
    return max(0.0, (0.15 * h + 0.85 * hq) * (1.0 - 0.5 * notch))


def ring(card, centre, radius, seed, base_h, col_top, col_bot, segs=56, y0=-2.0, skip=None, override=None):
    """A ring of mesa silhouette cards round `centre`: vertical quads with flat tops (two vertices at each step so the
    cliffs are sharp). override(theta) -> height or None lets a bearing be shaped by hand (the Dowser's rim)."""
    pts = []
    for k in range(segs):
        a = 2 * math.pi * k / segs
        h = mesa_profile(a, seed, base_h, 1.0)
        if override:
            o = override(a)
            if o is not None: h = o
        pts.append((a, h))
    for k in range(segs):
        a0, h0 = pts[k]; a1, _ = pts[(k + 1) % segs]
        if a1 < a0: a1 += 2 * math.pi
        if skip and skip(a0): continue
        p0 = (centre[0] + math.sin(a0) * radius, y0, centre[2] - math.cos(a0) * radius)
        p1 = (centre[0] + math.sin(a1) * radius, y0, centre[2] - math.cos(a1) * radius)
        # the inward-facing side is what the player sees: wind so the normal points to the centre
        q = [p0, (p0[0], h0, p0[2]), (p1[0], h0, p1[2]), p1]
        cols = [col_bot, col_top, col_top, col_bot]
        card.poly(q[::-1], cols[::-1])


def disc(card, centre, r0, r1, y, col0, col1, segs=24):
    """A ring of ground. col0 / col1 (inner / outer): a colour, or callable(bearing) -> colour."""
    c0 = col0 if callable(col0) else (lambda a: col0); c1 = col1 if callable(col1) else (lambda a: col1)
    for k in range(segs):
        a0 = 2 * math.pi * k / segs; a1 = 2 * math.pi * (k + 1) / segs
        q = [(centre[0] + math.sin(a0) * r0, y, centre[2] - math.cos(a0) * r0), (centre[0] + math.sin(a0) * r1, y, centre[2] - math.cos(a0) * r1),
             (centre[0] + math.sin(a1) * r1, y, centre[2] - math.cos(a1) * r1), (centre[0] + math.sin(a1) * r0, y, centre[2] - math.cos(a1) * r0)]
        card.poly(q[::-1], [c0(a0), c1(a0), c1(a1), c0(a1)][::-1])


def pylon_card(card, base, h, facing, col, col_top=None):
    """A Pellam line pylon in silhouette: a tapered mast, two stub arms, insulators as nubs; faces `facing` (x, z)."""
    r = (facing[1], 0.0, -facing[0])                                    # across the view
    wb = 0.09 * h; wt = 0.04 * h
    P = lambda u, y: (base[0] + r[0] * u, base[1] + y, base[2] + r[2] * u)
    ct = col_top or col
    card.poly([P(-wb / 2, 0), P(wb / 2, 0), P(wt / 2, h), P(-wt / 2, h)], [col, col, ct, ct])
    for (y, s) in ((0.48, 1), (0.71, -1)):
        aw = 0.16 * h; th = 0.03 * h
        card.poly([P(0, y * h), P(s * aw, y * h + th * 0.3), P(s * aw, y * h + th), P(0, y * h + th * 1.2)][::(1 if s > 0 else -1)], ct)
    card.poly([P(-wt * 0.9, h), P(wt * 0.9, h), P(0, h * 1.05)], ct)


def cloud(card, centre, w, h, facing, lit, body, seed):
    """A faceted, flat-bottomed cloud: a fan of facets over a straight base, the top edge lit."""
    rng = random.Random(seed)
    r = (facing[1], 0.0, -facing[0])
    n = 9
    pts = []
    for k in range(n + 1):
        t = k / n
        u = (t - 0.5) * w
        y = h * (0.35 + 0.65 * math.sin(math.pi * t) ** 0.7) * rng.uniform(0.75, 1.1) if 0 < k < n else 0.0
        pts.append((u, y))
    P = lambda u, y: (centre[0] + r[0] * u, centre[1] + y, centre[2] + r[2] * u)
    mid = (0.0, h * 0.25)
    for k in range(n):
        a, b = pts[k], pts[k + 1]
        tri = [P(*mid), P(*b), P(*a)]
        card.poly(tri, [body, mix(body, lit, 0.85 if b[1] > 0.2 * h else 0.2), mix(body, lit, 0.85 if a[1] > 0.2 * h else 0.2)])
    card.poly([P(*mid), P(*pts[0]), P(*pts[-1])], body)


# ------------------------------------------------------------------ eroded mesas (polish round 2)
def mesas(seed, H, R, low=None, clear=None, detail=1.0):
    """The outline of one ring of far country at radius R, as a list of landforms; each is a list of points
    (bearing, top, talus): `top` the skyline there, `talus` the height at which the scree apron meets the cliff (equal
    to `top` on a slope). Three kinds, none with a right-angle step: a MESA (scree aprons at 29-37 degrees, a battered
    cliff, a top that is nearly level and sags, often with a lower bench at one end and one notch), a BUTTE (the same,
    narrow) and a HOGBACK (a low asymmetric ridge, all scree). low(bearing) -> 0..1 scales the height (the north stays
    low); clear(b0, b1) -> True where nothing may stand (the Dowser's line)."""
    rng = random.Random(seed * 7919 + 13)
    out = []
    u = rng.uniform(0.0, 0.6) * H
    C = 2 * math.pi * R
    while True:
        r = rng.random()
        kind = "mesa" if r < 0.5 else ("butte" if r < 0.74 else "hog")
        h = H * rng.uniform(0.62, 1.0)
        k_low = low((u + 1.5 * H) / R) if low else 1.0
        if k_low < 0.99: kind = "hog"; h = H * rng.uniform(0.5, 0.9) * k_low * 1.4
        pts = []
        if kind == "hog":
            h *= 0.36 if k_low >= 0.99 else 1.0
            W = h * rng.uniform(5.0, 9.0)
            crest = rng.uniform(0.3, 0.7)
            for (t, y) in ((0.0, 0.0), (crest * 0.45, 0.55), (crest, 1.0), (crest + (1 - crest) * 0.3, 0.8 + 0.1 * rng.random()), (crest + (1 - crest) * 0.65, 0.4), (1.0, 0.0)):
                pts.append((t * W, y * h, y * h))
        else:
            ht = h * rng.uniform(0.4, 0.58)
            sl = rng.uniform(0.55, 0.75); sr = rng.uniform(0.55, 0.75)
            rl = ht / sl; rr = ht / sr
            bl = (h - ht) * rng.uniform(0.14, 0.32); br = (h - ht) * rng.uniform(0.14, 0.32)          # the cliff is battered (72-82 degrees), never plumb
            top_w = h * (rng.uniform(1.4, 4.2) if kind == "mesa" else rng.uniform(0.22, 0.6))
            W = rl + bl + top_w + br + rr
            # the scree: concave (steeper under the cliff), its head not at one height all the way along
            pts += [(0.0, 0.0, 0.0), (rl * 0.42, ht * 0.3, ht * 0.3), (rl * 0.8, ht * 0.74, ht * 0.74), (rl, ht, ht)]
            n = max(2, int(round((4 if kind == "mesa" else 2) * detail)))
            sag = rng.uniform(0.02, 0.06) * h
            bench = rng.random() < 0.6 and kind == "mesa"
            b_at = rng.uniform(0.55, 0.75) if rng.random() < 0.5 else -rng.uniform(0.25, 0.45)       # the bench: the last part of the top (or, negative, the first)
            b_h = rng.uniform(0.72, 0.86)
            notch = rng.randrange(1, n) if (kind == "mesa" and rng.random() < 0.5) else -1
            tops = []
            for k in range(n + 1):
                t = k / n
                y = h - sag * math.sin(math.pi * t) * rng.uniform(0.4, 1.0) - (0.03 * h if k in (0, n) else 0.0)
                tops.append([rl + bl + top_w * t, y])
            if bench:
                # one end of the top stands a bed lower; the break between them is a short slope, not a step
                cut = abs(b_at)
                new = []
                for (x, y) in tops:
                    t = (x - rl - bl) / top_w
                    lowside = (t > cut) if b_at > 0 else (t < cut)
                    new.append([x, ht + (y - ht) * b_h if lowside else y])
                xc = rl + bl + top_w * cut; dxs = 0.3 * (h - ht) * (1 - b_h)
                hi = h - sag * 0.5; lo = ht + (hi - ht) * b_h
                brk = [[xc - dxs, hi], [xc + dxs, lo]] if b_at > 0 else [[xc - dxs, lo], [xc + dxs, hi]]
                tops = sorted([p for p in new if abs(p[0] - xc) > dxs * 1.5] + brk)
            if notch > 0 and notch < len(tops) - 1:
                x, y = tops[notch]
                d = (y - ht) * rng.uniform(0.25, 0.5); wn = d * rng.uniform(0.5, 0.9)
                tops = sorted(tops[:notch] + [[x - wn, y], [x + wn * 0.15, y - d], [x + wn, y - 0.02 * h]] + tops[notch + 1:])
                tops = [p for k, p in enumerate(tops) if k == 0 or p[0] - tops[k - 1][0] > 0.5]
            for (x, y) in tops:
                tt = ht * (1.0 + 0.1 * (vnoise(x / (0.8 * h), seed * 1.7, seed + 3) - 0.5))
                pts.append((x, y, min(tt, y)))
            x1 = rl + bl + top_w + br
            pts += [(x1, ht * (1.0 + 0.04 * rng.uniform(-1, 1)), None), (x1 + rr * 0.2, ht * 0.74, None), (x1 + rr * 0.58, ht * 0.3, None), (x1 + rr, 0.0, None)]
            pts = [(p[0], p[1], p[1] if p[2] is None else p[2]) for p in pts]
        # no outline edge steeper than 81 degrees: where two points stand closer than 0.16 x their difference in height,
        # everything after them moves along
        fixed = [pts[0]]; shift = 0.0
        for k in range(1, len(pts)):
            x = pts[k][0] + shift
            need = 0.16 * abs(pts[k][1] - fixed[-1][1])
            if x - fixed[-1][0] < need: shift += fixed[-1][0] + need - x; x = fixed[-1][0] + need
            fixed.append((x, pts[k][1], pts[k][2]))
        pts = fixed; W = pts[-1][0]
        if (u + W) / R > 2 * math.pi - 0.3 * H / R: break
        b0 = u / R; b1 = (u + W) / R
        if not (clear and clear(b0, b1)):
            out.append([(b0 + (b1 - b0) * (p[0] / W), p[1], p[2]) for p in pts])
        u += W + H * rng.uniform(0.25, 2.2)
    return out


def mesa_cards(card, centre, R, forms, col, y0=-3.0):
    """Draw `mesas` forms as vertical cards facing the centre: a scree band (y0 .. talus) and, where the cliff stands,
    a cliff band (talus .. top). col(bearing, level): 0 the foot, 1 the scree's head, 2 the cliff's foot, 3 the rim."""
    P = lambda a, y: (centre[0] + math.sin(a) * R, y, centre[2] - math.cos(a) * R)
    for pts in forms:
        for k in range(len(pts) - 1):
            (a0, t0, s0), (a1, t1, s1) = pts[k], pts[k + 1]
            card.poly([P(a1, y0), P(a1, s1), P(a0, s0), P(a0, y0)], [col(a1, 0), col(a1, 1), col(a0, 1), col(a0, 0)])
            d0 = t0 - s0 > 0.3; d1 = t1 - s1 > 0.3
            if d0 and d1: card.poly([P(a1, s1), P(a1, t1), P(a0, t0), P(a0, s0)], [col(a1, 2), col(a1, 3), col(a0, 3), col(a0, 2)])
            elif d1: card.poly([P(a1, s1), P(a1, t1), P(a0, s0)], [col(a1, 2), col(a1, 3), col(a0, 2)])
            elif d0: card.poly([P(a1, s1), P(a0, t0), P(a0, s0)], [col(a1, 2), col(a0, 3), col(a0, 2)])
