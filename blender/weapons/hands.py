"""The Reeve's hands and forearms (helper of weapon_revolver.py): unlined work gloves in pale tan leather with a seam
along each finger and a short gauntlet, 20 mm of bare wrist with the cord of the glove's tie, a dark oilcloth cuff with
a leather-bound edge and one horn button, the sleeve ending 0.25 m up the forearm (ART_BIBLE 8.2).

A hand is described in HAND SPACE (millimetres): wrist centre at the origin, fingers toward +Y, the back of the hand
+Z, the palm -Z; the thumb of a RIGHT hand lies toward -X (a left hand is the mirror image in X). `Hand.build(M)`
turns the description into mesh parts placed by the matrix M (hand space mm -> rest space m): overlapping closed
forms (a palm block, four finger tubes, a thumb, gauntlet, wrist, cuff, sleeve), as a glove is cut. Every part carries
its vertex groups (the bone names) already, so weapon_revolver.py only has to join and bind.

Finger units (ARCHITECTURE: three on the right hand, four on the left): thumb (2 bones), index (2 bones), the other
three fingers as ONE bone (`grip_r` / `fingers_l`).
"""
import bpy, bmesh, math
from mathutils import Vector, Matrix, Quaternion
from lib import mesh, material, uv, vcol

MM = 0.001
FINGERS = ("index", "middle", "ring", "pinky")
# Polish round 2 (the visual critic): the pale tan glove (`glove` #8A6A48, OKLCH chroma 0.063) took every zone's key as a
# fourth colour (orange in the street, olive in the gallery, maroon and purple in the bore) and out-shouted the gun. It
# is now a weathered grey buckskin: the neutral `tin` cell shaded down by COLOR_0 (m_prop: cell x vertex colour) to
# #5A5048 (chroma 0.02), worn palm and trigger finger #6E6459. Still lighter than the cuff and the gun (ART_BIBLE 8.2).
# Look-dev, polish round 3: the coat cuff drew as a featureless black slab in `load_kept` (the showpiece: the back of the
# cuff stands in the middle of the frame for a second). It is now a dark slate oilcloth with soft lengthwise folds
# (alternate vertices of the sleeve rings shaded): still the darkest part of the arm, no longer a hole in the picture.
GLOVE = {"glove": ("tin", "#5A5048"), "glove_worn": ("tin", "#6E6459"), "cuff": ("tin", "#35313C")}
KNUCKLE = {"index": (-27.0, 90.0, -2.0), "middle": (-8.0, 95.0, 0.0), "ring": (11.0, 91.0, -2.0), "pinky": (27.0, 82.0, -6.0)}
LENGTH = {"index": (43.0, 26.0, 23.0), "middle": (47.0, 29.0, 24.0), "ring": (43.0, 27.0, 23.0), "pinky": (34.0, 21.0, 20.0)}
# Polish round 5 (both critics: "a fingerless mitten", "two brown lumps", "both gloves large and mitten-like"): the fingers
# were 22 mm thick and lay against each other as one mass. They are a tenth slimmer (so a gap shows between two of them),
# each joint carries a crease in COLOR_0 and the sides of a finger are darker than its back (SIDE_SHADE, CREASE).
RADIUS = {"index": (10.1, 9.2, 8.4, 7.0), "middle": (10.3, 9.4, 8.6, 7.1), "ring": (9.9, 9.0, 8.2, 6.9), "pinky": (8.9, 8.0, 7.3, 6.2)}     # gloved: a millimetre of leather all round (round 5: x 0.9)
SIDE_SHADE, CREASE = 0.36, 0.66
# Release pass p0 (ruling R14; both final reviewers: "two smooth sausage fingers", "two brown lumps"): the hands are now
# m_hands, with their own texture set (tx_hands: albedo + gloss, tx_hands_detail: height; blender/weapons/hands_tex.py
# draws both from LAYOUT and the stations below) and about three times the triangles: twelve-sided fingers whose
# joints are three rings each (a knuckle that stands proud on the back, a crease that pinches on the inside), pads
# between the joints, a domed fingertip. COLOR_0 is AO only: the seams, creases, wear and stitching are in the texture.
# LAYOUT: where each part lies on the 512 x 512 sheet (pixels, origin top left): x, y, w, h, rot. A part's `s` runs along
# it (finger: root -> tip; palm, gauntlet, sleeve: toward the knuckles / up the arm) and `v` round it (0.5 = the back,
# 0 and 1 = the palm side). rot = 1: s runs DOWN the rectangle and v across it. The two hands share every rectangle.
SHEET = 512
INSET = 3.0
LAYOUT = {"index": (4, 4, 232, 60, 0), "middle": (4, 68, 232, 60, 0), "ring": (4, 132, 232, 60, 0), "pinky": (4, 196, 232, 60, 0),
          "thumb": (4, 260, 232, 72, 0), "palm": (244, 4, 264, 216, 0), "gauntlet": (244, 224, 264, 108, 0),
          "wrist": (4, 336, 60, 60, 0), "sleeve": (68, 336, 440, 172, 1), "cord": (4, 400, 60, 50, 0), "button": (4, 454, 60, 54, 0)}
FINGER_S = (0.0, 0.14, 0.50, 0.76, 1.0)        # s of: the root inside the palm, the knuckle, the two joints, the end of the fingertip
THUMB_S = (0.0, 0.10, 0.45, 0.74, 1.0)         # root, cmc, mcp, ip, end
# Fingerless: the glove ends just beyond the middle joint of each finger (and the thumb's knuckle); the last two joints
# are bare: skin, a nail, the creases of the end joint. A hand is known by its fingertips: gloved to the end, the two
# digits the idle frame shows were "two smooth sausage fingers" whatever was drawn on them.
# Pass i1 (both visual reviewers: "smooth brown bulbs", "two unjointed brown cylinders" at idle, against "the reload's
# stitched glove already looks right"): the bare ends were the only part of the hand the idle frame shows, and bare skin
# carries no seam, stitch or wear. The gloves are whole again (None = no cut): the side seams with their stitch rows,
# the joint wrinkles and the worn pads run to the fingertip, which is what the eye is given at idle.
FINGER_CUT, THUMB_CUT = None, None
PALM_Y = (-6.0, 100.0)                         # hand-space y of s = 0 and s = 1 on the palm
SLEEVE_D = (64.0, 252.0)                       # mm up the forearm of s = 0 and s = 1 on the cuff and sleeve
GAUNTLET_D = (-4.0, 44.0)


def rect_uv(part, s, v):
    """(s, v) on a part -> UV0 (Blender: origin bottom left)."""
    x, y, w, h, rot = LAYOUT[part]
    if rot: px = x + INSET + (w - 2 * INSET) * v; py = y + INSET + (h - 2 * INSET) * s
    else: px = x + INSET + (w - 2 * INSET) * s; py = y + INSET + (h - 2 * INSET) * v
    return (px / SHEET, 1.0 - py / SHEET)


def _ring(bm, c, t, up, ru, rs, n, seam=0.0, phase=0.0, dors=0.0, palm=0.0):
    """n vertices round centre c in the plane normal to t; `up` is the dorsal direction (radius ru), rs the side radius.
    Counter-clockwise about t, starting at `up`. dors / palm: millimetres added on the back / the inside (a knuckle
    that stands proud, a pad, or a crease when negative), falling off toward the sides."""
    t = t.normalized()
    n1 = (up - t * up.dot(t)).normalized(); n2 = t.cross(n1)
    out = []
    for k in range(n):
        a = phase + 2 * math.pi * k / n
        ca = math.cos(a)
        r1 = ru * ca; r2 = rs * math.sin(a)
        if seam and k == 0: r1 += seam
        if ca > 0: r1 += dors * ca * ca
        else: r1 -= palm * ca * ca
        out.append(bm.verts.new(c + n1 * r1 + n2 * r2))
    return out


class Part:
    """A bmesh under construction with per-vertex weights and UV0 on the hands' sheet (LAYOUT)."""
    def __init__(self, name, rect="palm"):
        self.name = name; self.bm = bmesh.new(); self.uvl = self.bm.loops.layers.uv.new("UVMap")
        self.rect = rect
        self.vfold = None
        self.rev = False            # a mirrored part whose rings run the other way round: every face is built reversed
        self.w = {}                 # vert -> {bone: weight}
        self.s = {}                 # vert -> s along the part
        self.shade = {}             # vert -> a multiplier painted into COLOR_0 (the inside of a cuff)
        self.ao_from = {}           # buried vert -> the vert whose AO it takes (a finger's root ring inside the palm)
        self.ao_min = {}            # vert -> the least AO it may bake to (the knuckle end of the palm, among the finger roots)

    def ring(self, c, t, up, ru, rs, n, weights, seam=0.0, phase=0.0, s=0.0, dors=0.0, palm=0.0):
        r = _ring(self.bm, c, t, up, ru, rs, n, seam, phase, dors, palm)
        for v in r: self.w[v] = dict(weights); self.s[v] = s
        return r

    def _uv(self, f, sv):
        vf = self.vfold
        for l, (s, v) in zip(f.loops, sv):
            if vf: v = vf[0] + (vf[1] - vf[0]) * (1.0 - abs(2.0 * v - 1.0))      # a patch of another part's rectangle, folded so it has no wrap
            l[self.uvl].uv = rect_uv(self.rect, s, v)

    def _face(self, vs, sv):
        if self.rev: vs = list(reversed(vs)); sv = list(reversed(sv))
        f = self.bm.faces.new(vs); self._uv(f, sv); return f

    def strip(self, A, B, colour=None):
        """Quads between two rings of the same count. v: 0.5 at the ring's first vertex (the back), the wrap on the inside."""
        n = len(A)
        for k in range(n):
            k2 = (k + 1) % n
            va = k / n + 0.5; vb = (k + 1) / n + 0.5
            if va >= 1.0 - 1e-9: va -= 1.0; vb -= 1.0
            self._face((A[k], A[k2], B[k2], B[k]), ((self.s[A[k]], va), (self.s[A[k2]], vb), (self.s[B[k2]], vb), (self.s[B[k]], va)))

    def cap(self, A, colour=None, flip=False):
        n = len(A)
        ks = list(reversed(range(n))) if flip else list(range(n))
        self._face([A[k] for k in ks], [(self.s[A[k]], (k / n + 0.5) % 1.0) for k in ks])

    def fan(self, A, c, weights, colour=None, flip=False, s=1.0):
        v = self.bm.verts.new(c); self.w[v] = dict(weights); self.s[v] = s
        n = len(A)
        for k in range(n):
            k2 = (k + 1) % n
            va = k / n + 0.5; vb = (k + 1) / n + 0.5
            if va >= 1.0 - 1e-9: va -= 1.0; vb -= 1.0
            if flip: self._face((A[k2], A[k], v), ((self.s[A[k2]], vb), (self.s[A[k]], va), (s, (va + vb) / 2)))
            else: self._face((A[k], A[k2], v), ((self.s[A[k]], va), (self.s[A[k2]], vb), (s, (va + vb) / 2)))

    def flat(self, vs, s=0.5, v=0.5):
        """A face whose loops all take one point of the part's rectangle (a swatch: cord, knot)."""
        f = self.bm.faces.new(vs); self._uv(f, [(s, v)] * len(vs)); return f

    def finish(self, M, smooth=62.0):
        bm = self.bm
        bm.verts.index_update(); bm.faces.index_update()
        wv = [self.w.get(v, {}) for v in bm.verts]
        sv = [self.shade.get(v, 1.0) for v in bm.verts]
        af = [self.ao_from[v].index if v in self.ao_from else -1 for v in bm.verts]
        am = [self.ao_min.get(v, 0.0) for v in bm.verts]
        for f in bm.faces: f.smooth = True
        bm.transform(M)
        ob = mesh.new_mesh_object(self.name, bm)
        mesh.finish(ob, bevel=0.0, smooth_angle=smooth, weighted=False)
        material.assign(ob, "m_hands"); vcol.tint(ob, (1.0, 1.0, 1.0))
        if any(x != 1.0 for x in sv):
            import numpy as np
            li = np.empty(len(ob.data.loops), dtype=np.int32); ob.data.loops.foreach_get("vertex_index", li)
            a = np.ones((len(li), 4), dtype=np.float32); a[:, :3] = np.asarray(sv, dtype=np.float32)[li][:, None]
            vcol.set_colors(ob, a, "Seam")
        if self.ao_min:
            at2 = ob.data.attributes.new("ao_min", 'FLOAT', 'POINT'); at2.data.foreach_set("value", am)
        if any(x >= 0 for x in af):
            at = ob.data.attributes.new("ao_from", 'INT', 'POINT'); at.data.foreach_set("value", af)
        groups = {}
        for i, w in enumerate(wv):
            s = sum(w.values()) or 1.0
            for b, x in w.items(): groups.setdefault(b, []).append((i, x / s))
        for b in sorted(groups):
            vg = ob.vertex_groups.new(name=b)
            for i, x in groups[b]: vg.add([i], x, 'REPLACE')
        return ob


CUT_FRAC = 0.26      # the glove ends this far along the phalanx beyond the cut joint (= digit_path's frac: the joint's last ring)
BARE = 0.90          # a bare finger against the gloved one


def cut_station(stations, joint):
    """s of the glove's edge on a digit cut beyond `joint` (index into the stations)."""
    return stations[joint] + (stations[joint + 1] - stations[joint]) * CUT_FRAC


def digit_path(src, stations, radii, frac=CUT_FRAC, tip=(0.42, 0.74, 0.90, 0.985), tip_r=(1.0, 0.97, 0.80, 0.47), cut=None):
    """The rings of a finger or a thumb along its joints `src` = [root, j0, j1, j2, tip] (j0 = the knuckle).
    Returns a list of dicts: p (centre), t (tangent), seg (source segment), blend (0..1 toward the next segment's bone),
    s (station), r (radius), joint (0 none, 1 = a ring at a joint: proud on the back, pinched inside; 0.5 its neighbours),
    pad (1 at the middle of a phalanx). The last phalanx ends in a dome."""
    out = []
    def add(p, t, seg, blend, s, r, joint=0.0, pad=0.0): out.append({"p": p, "t": t.normalized(), "seg": seg, "blend": blend, "s": s, "r": r, "joint": joint, "pad": pad})
    n = len(src)
    add(src[0], src[1] - src[0], 0, 0.0, stations[0], radii[0])
    for i in range(1, n - 1):
        a, b, c = src[i - 1], src[i], src[i + 1]
        d1 = (b - a).normalized(); d2 = (c - b).normalized()
        la, lc = (b - a).length, (c - b).length
        ds0 = stations[i] - stations[i - 1]; ds1 = stations[i + 1] - stations[i]
        if i >= 2:                                                           # the middle of the phalanx that ends here
            add(a.lerp(b, 0.5), d1, i - 1, 0.0, stations[i - 1] + 0.5 * ds0, 0.5 * (radii[i - 1] + radii[i]) * 0.93, pad=1.0)
        if d1.dot(d2) > 0.985:                                               # nearly straight: one ring
            add(b, d1 + d2, i - 1, 0.5, stations[i], radii[i], joint=1.0 if i >= 2 else 0.6)
            continue
        k1 = min(la, lc) * frac
        tb = d1 + d2
        add(b - d1 * k1, d1 * 0.75 + d2 * 0.25, i - 1, 0.2, stations[i] - ds0 * k1 / la, radii[i] * 1.0, joint=0.5)
        add(b + (d2 - d1) * (k1 * 0.27), tb, i - 1, 0.5, stations[i], radii[i] * 1.06, joint=1.0)
        add(b + d2 * k1, d1 * 0.25 + d2 * 0.75, i, 0.0, stations[i] + ds1 * k1 / lc, radii[i] * 1.0, joint=0.5)
        out[-1]["after"] = True
        if cut == i:                                                         # the fingerless glove's rolled edge, then the bare finger
            out[-1]["r"] *= 1.05; out[-1]["joint"] = 0.0
            sc = stations[i] + ds1 * k1 / lc
            add(b + d2 * (k1 + 0.6), d2, i, 0.0, sc + 0.004, radii[i] * 1.05)
            add(b + d2 * (k1 + 1.0), d2, i, 0.0, sc + 0.012, radii[i] * BARE * 0.97)
            radii = list(radii[:i + 1]) + [r * BARE for r in radii[i + 1:]]
    a, b = src[-2], src[-1]; d = (b - a).normalized(); L = (b - a).length
    r0, r1 = radii[-2], radii[-1]
    for f, k in zip(tip, tip_r):
        add(a + d * (L * f), d, n - 2, 0.0, stations[-2] + (stations[-1] - stations[-2]) * f, (r0 + (r1 - r0) * min(f / 0.74, 1.0)) * k, pad=1.0 if f < 0.5 else 0.6 if f < 0.8 else 0.0)
    return out, a + d * (L * 1.03)


class Hand:
    """side: 'r' | 'l'. curls: {finger: (spread deg, mcp, pip, dip flex deg)}. thumb: four hand-space points
    (cmc, mcp, ip, tip) for a RIGHT hand layout (mirrored for the left)."""
    def __init__(self, side, curls, thumb, thumb_r=(11.3, 9.8, 8.8, 7.0), forearm=(0.0, -1.0, 0.0), forearm_up=(0.0, 0.0, 1.0), loop=False, web_through=None):
        self.side = side; self.s = "_" + side
        self.web_through = None if web_through is None else Vector(web_through)     # pass i3: a hand-space point the web's middle passes through (the right hand: behind the back strap)
        self.curls = curls; self.thumb = [Vector(p) for p in thumb]; self.thumb_r = thumb_r
        self.forearm = Vector(forearm).normalized(); self.forearm_up = Vector(forearm_up)
        self.mx = -1.0 if side == "l" else 1.0
        self.loop = loop

    def v(self, p):
        return Vector((p[0] * self.mx, p[1], p[2]))

    def finger_joints(self, name):
        sp, a1, a2, a3 = self.curls[name]
        sp = math.radians(sp)
        f = Vector((math.sin(sp), math.cos(sp), 0.0)); Z = Vector((0, 0, 1))
        p = Vector(KNUCKLE[name]); pts = [p]; ups = []
        ang = 0.0
        for L, a in zip(LENGTH[name], (a1, a2, a3)):
            ang += math.radians(a)
            d = f * math.cos(ang) - Z * math.sin(ang)
            p = p + d * L; pts.append(p)
        return [self.v(q) for q in pts], self.v(f), None

    def bones(self):
        """{bone: (head, tail)} in hand space (mm) for this hand's digits."""
        s = self.s; out = {}
        ij, _, _ = self.finger_joints("index")
        out["index" + s + "_1"] = (ij[0], ij[1]); out["index" + s + "_2"] = (ij[1], ij[2])
        mj, _, _ = self.finger_joints("middle")
        out["grip_r" if self.side == "r" else "fingers_l"] = (mj[0], mj[1])
        t = [self.v(p) for p in self.thumb]
        out["thumb" + s + "_1"] = (t[0], t[1]); out["thumb" + s + "_2"] = (t[2], t[3])
        out["hand" + s] = (Vector((0, 0, 0)), Vector((0, 60, 0)))
        fa = self.v(self.forearm)
        out["arm" + s] = (fa * 250.0, fa * 20.0)
        return out

    def _digit(self, P, rows, ups, n, bones, tip_w, apex, flat=0.93, seam=0.0, knuckle=1.0):
        """Rings of a digit from digit_path rows; bones[seg] = the bone of each source segment."""
        hand = "hand" + self.s
        rings = []
        for i, (q, up) in enumerate(zip(rows, ups)):
            b0 = bones[q["seg"]]; b1 = bones[min(q["seg"] + 1, len(bones) - 1)]
            if i == 0: w = {hand: 1.0}
            elif q.get("after") and bones[q["seg"] - 1] != b0: w = {bones[q["seg"] - 1]: 0.2, b0: 0.8}
            elif q["blend"] > 0 and b0 != b1: w = {b0: 1.0 - q["blend"], b1: q["blend"]}
            else: w = {b0: 1.0}
            r = q["r"]; j = q["joint"]
            dors = (1.9 * j * knuckle) if i > 0 else 0.0                     # pass i3: 1.25 -> 1.9 (the fingers are seen side-on at idle now: the knuckle must break the outline)                    # the knuckle stands proud of the back
            palm = (-1.5 * j if j >= 1.0 else -0.4 * j) + 0.9 * q["pad"]      # the crease pinches, the pad swells
            rings.append(P.ring(q["p"], q["t"], up, r * flat, r * q.get("wide", 1.0), n, w, s=q["s"], dors=dors, palm=palm))
        for A, B in zip(rings[:-1], rings[1:]): P.strip(A, B)
        P.cap(rings[0], flip=True)
        P.fan(rings[-1], apex, tip_w, s=1.0)
        for a, b in zip(rings[0], rings[1]): P.ao_from[a] = b
        return rings

    def build(self, M):
        """Mesh parts (objects, metres) placed by M (hand space mm -> rest space). Vertex groups are set."""
        s = self.s; hand = "hand" + s; arm = "arm" + s
        grip = "grip_r" if self.side == "r" else "fingers_l"
        M = M @ Matrix.Scale(1.0, 4)
        parts = []
        flip = self.side == "l"
        Zv = Vector((0, 0, 1))
        # ---------------- palm: a block of rounded sections from the wrist to the knuckle row
        P = Part("h_palm" + s, "palm")
        #        y     x     z    half width  half thickness
        secs = [(-6.0, 0.0, 0.0, 29.0, 20.5), (8.0, -1.0, -0.8, 30.0, 20.0), (28.0, -3.0, -2.0, 36.0, 19.5), (52.0, -2.5, -2.0, 40.5, 17.0),
                (74.0, -1.0, -2.0, 41.5, 14.5), (90.0, 0.0, -2.5, 40.0, 12.0), (100.0, 0.5, -3.0, 36.5, 9.0)]
        rings = []
        N = 16
        for (y, x, z, hw, ht) in secs:
            ring = []
            for k in range(N):
                a = 2 * math.pi * k / N
                ca, sa = math.cos(a), math.sin(a)
                px = hw * sa * (abs(sa) ** 0.12)
                pz = ht * ca * (abs(ca) ** 0.05)
                if pz < 0:                                                  # the palm side: the heel and the thenar pad swell near the wrist
                    pz *= 1.0 + 0.22 * max(0.0, 1.0 - abs(y - 26.0) / 36.0) * (1.0 if px < 0 else 0.55)
                else:                                                       # the back of the hand: flatter, falling toward the little finger
                    pz *= 0.94 - 0.10 * max(0.0, px) / hw
                yy = y - 5.0 * max(0.0, px) / hw * (1.0 if y > 60 else 0.0)  # the knuckle row slants back toward the little finger
                v = P.bm.verts.new(self.v((x + px, yy, z + pz)))
                P.w[v] = {hand: 1.0} if y > 4 else {hand: 0.8, arm: 0.2}
                P.s[v] = (y - PALM_Y[0]) / (PALM_Y[1] - PALM_Y[0])
                if y > 80: P.ao_min[v] = 0.62
                ring.append(v)
            rings.append(ring)
        P.rev = flip                                                          # the mirrored hand's rings run the other way round
        for A, B in zip(rings[:-1], rings[1:]): P.strip(A, B)
        P.cap(rings[-1]); P.cap(rings[0], flip=True)
        parts.append(P.finish(M, smooth=80.0))
        # ---------------- fingers
        for name in FINGERS:
            F = Part(f"h_{name}{s}", name)
            j, fdir, _ = self.finger_joints(name)
            # polish round 3: the root of a finger lies INSIDE the palm, toward the wrist
            base = j[0] - Vector((0.0, 17.0, 2.5))
            src = [base] + j
            R = RADIUS[name]
            # pass i2 (the reviewers: "the lower finger ends in a round blunt pad", "one bulbous fingertip"): the last joint
            # kept its full girth to a short dome (a 15 mm ball seen end-on, which is how the idle frame sees the gripping
            # fingers). It tapers now from the end joint and closes in a longer, flatter end
            rows, apex = digit_path(src, FINGER_S, [R[0] * 0.80, R[0] * 1.08, R[1] * 1.04, R[2] * 1.00, R[3] * 0.93], cut=FINGER_CUT,
                                    tip=(0.34, 0.62, 0.82, 0.95), tip_r=(1.0, 0.97, 0.85, 0.56))
            side_axis = fdir.cross(Zv)                                       # the hinge axis
            ups = []
            for i, q in enumerate(rows):
                up = side_axis.cross(q["t"]) * (-1.0)
                if up.length < 1e-6: up = Zv.copy()
                if up.dot(Zv) < 0 and i < 2: up = -up
                ups.append(up.normalized())
            for i in range(1, len(ups)):                                     # make the dorsal vector continuous
                if ups[i].dot(ups[i - 1]) < 0: ups[i] = -ups[i]
            if name == "index": bones = [hand, "index" + s + "_1", "index" + s + "_2", "index" + s + "_2"]
            else: bones = [hand, grip, grip, grip]
            nf = 10 if name == "pinky" else 12
            self._digit(F, rows, ups, nf, bones, {bones[-1]: 1.0}, apex)
            parts.append(F.finish(M))
        # ---------------- thumb
        T = Part("h_thumb" + s, "thumb")
        tj = [self.v(p) for p in self.thumb]
        base = tj[0] - (tj[1] - tj[0]).normalized() * 12.0 + (Vector((0.0, 30.0, 0.0)) - tj[0]).normalized() * 9.0   # (pass i2) drawn toward the middle of the palm
        src = [base] + tj
        t1, t2 = "thumb" + s + "_1", "thumb" + s + "_2"
        R = self.thumb_r
        # pass i2: the thumb's root is no longer a broad flap that ended in a flat cap beside the palm (seen from behind-left,
        # a mitten's cuff): it starts small and deep inside the palm and swells to the ball of the thumb; the end joint tapers
        rows, apex = digit_path(src, THUMB_S, [R[0] * 0.95, R[0] * 1.20, R[1] * 1.06, R[2] * 1.02, R[3] * 1.00], tip=(0.36, 0.66, 0.86, 0.97), tip_r=(1.0, 0.98, 0.84, 0.52), cut=THUMB_CUT)
        ups = []
        # the thumb is opposed: its back (and its nail) looks AWAY from what the hand holds, not the way the back of the
        # hand looks. The held thing is in front of the palm, under the forefinger's first joint.
        ij, _, _ = self.finger_joints("index")
        held = ij[0].lerp(ij[2], 0.5) + self.v(Vector((6.0, -22.0, 0.0)))
        for i, q in enumerate(rows):
            k = min(1.0, max(0.0, (i - 2) / 4.0))                            # the root turns with the palm, the end joints are opposed
            away = q["p"] - held
            up = (Vector((0, 0, 1)) * (1.0 - k) + away.normalized() * k)
            up = up - q["t"] * up.dot(q["t"])
            ups.append(up.normalized() if up.length > 1e-6 else Vector((0, 1, 0)))
        for i in range(1, len(ups)):
            if ups[i].dot(ups[i - 1]) < 0: ups[i] = -ups[i]
        # the ball of the thumb and the web toward the forefinger: the first joint is a broad mass that runs into the palm
        # (it was a tube that began at the wrist: from behind, a hose laid over the grip)
        for q, k in zip(rows, (1.05, 1.34, 1.22, 1.06)): q["wide"] = k
        self._digit(T, rows, ups, 12, [hand, t1, t1, t2], {t2: 1.0}, apex, flat=0.90, knuckle=1.0)
        parts.append(T.finish(M))
        # ---------------- the web between the thumb and the forefinger: a saddle of leather from the thumb's knuckle
        # round to the first knuckle of the hand (on the gun it lies over the top of the back strap). Without it the
        # thumb was a tube that began at the wrist: seen from behind, a hose laid across the grip.
        T = Part("h_web" + s, "palm"); T.vfold = (0.295, 0.385)
        a = tj[1].lerp(tj[0], 0.12); d = self.v(Vector(KNUCKLE["index"]) + Vector((0.0, -9.0, -4.5)))
        mid = a.lerp(d, 0.5); pull = (self.v(Vector((0.0, 30.0, -6.0))) - mid)
        m = mid + pull.normalized() * min(pull.length, 1.0) * 0.0 + self.v(Vector((0.0, -1.0, 0.0))) * 7.0
        if self.web_through is not None: m = self.v(self.web_through) * 2.0 - mid
        wr = []
        for i, u in enumerate((0.0, 0.2, 0.4, 0.6, 0.8, 1.0)):
            p0 = a.lerp(m, u); p1 = m.lerp(d, u); c = p0.lerp(p1, u); tg = (p1 - p0)
            r = 9.6 + 4.2 * math.sin(math.pi * u) + 1.5 * u
            if self.web_through is not None: r = (7.4 + 5.6 * math.sin(math.pi * u) + 1.0 * u)      # its ends are small and lie inside the thumb and the first knuckle (they showed as two flat hexagons)
            up = Zv - tg.normalized() * tg.normalized().z
            w = {hand: 0.55, t1: 0.45} if i == 0 else ({hand: 0.8, t1: 0.2} if i == 1 else {hand: 1.0})
            wr.append(T.ring(c, tg, up.normalized(), r * 0.78, r * 1.22, 10, w, s=0.42 + 0.34 * u))
        for A, B in zip(wr[:-1], wr[1:]): T.strip(A, B)
        T.cap(wr[0], flip=True); T.cap(wr[-1])
        parts.append(T.finish(M))
        # ---------------- gauntlet, cord, wrist, cuff, sleeve (along the forearm)
        fa = self.v(self.forearm); fu = self.v(self.forearm_up); fu = (fu - fa * fu.dot(fa)).normalized()
        def at(d, lift=0.0): return fa * d + fu * lift
        def gs(d): return (d - GAUNTLET_D[0]) / (GAUNTLET_D[1] - GAUNTLET_D[0]) * 0.86
        G = Part("h_gauntlet" + s, "gauntlet")
        N = 16
        g_sec = [(-4.0, 31.0, 20.0, {hand: 1.0}), (9.0, 29.0, 19.5, {hand: 0.75, arm: 0.25}), (18.0, 30.6, 21.6, {hand: 0.55, arm: 0.45}), (26.0, 34.0, 25.0, {hand: 0.4, arm: 0.6}),
                 (36.0, 37.6, 28.6, {hand: 0.25, arm: 0.75}), (44.0, 40.0, 31.0, {hand: 0.15, arm: 0.85})]
        rings = [G.ring(at(d), fa, fu, ht, hw, N, w, s=gs(d)) for d, hw, ht, w in g_sec]
        for A, B in zip(rings[:-1], rings[1:]): G.strip(A, B)
        lip = G.ring(at(45.2), fa, fu, 29.6, 38.6, N, {hand: 0.15, arm: 0.85}, s=0.93)     # the rolled edge
        G.strip(rings[-1], lip)
        deep = G.ring(at(37.0), fa, fu, 20.4, 28.4, N, {hand: 0.3, arm: 0.7}, s=1.0)        # the inside of the flare, down to the wrist: seen from the elbow
        G.strip(lip, deep)                                                           # side the gauntlet was a hoop round the arm (nothing is two-sided)
        for v in deep: G.shade[v] = 0.45
        parts.append(G.finish(M))
        # the tie cord round the glove's neck, with a knot and two tails on the back of the wrist
        C = Part("h_cord" + s, "cord")
        cn = 12
        ring_pts = []
        for k in range(cn):
            a = 2 * math.pi * k / cn
            ring_pts.append(at(10.0) + fu * (21.2 * math.cos(a)) + fa.cross(fu) * (30.6 * math.sin(a)))
        for k in range(cn):
            a = ring_pts[k]; b = ring_pts[(k + 1) % cn]
            out_a = (a - at(10.0)).normalized(); out_b = (b - at(10.0)).normalized()
            q = [C.bm.verts.new(a + out_a * 1.9), C.bm.verts.new(a + fa * 1.8), C.bm.verts.new(a - fa * 1.8),
                 C.bm.verts.new(b + out_b * 1.9), C.bm.verts.new(b + fa * 1.8), C.bm.verts.new(b - fa * 1.8)]
            for v in q: C.w[v] = {hand: 0.75, arm: 0.25}
            for (i0, i1) in ((0, 1), (2, 0)):
                f = C.bm.faces.new((q[i0], q[i1], q[i1 + 3], q[i0 + 3]))
                C._uv(f, ((0.5, 0.2), (0.5, 0.8), ((k + 1) / cn, 0.8), ((k + 1) / cn, 0.2)))
        k0 = at(10.0) + fu * 22.5
        kn = [C.bm.verts.new(k0 + d) for d in (fu * 3.4, fa * 3.2, fa.cross(fu) * 3.2, -fa * 3.2, -fa.cross(fu) * 3.2)]
        for v in kn: C.w[v] = {hand: 0.75, arm: 0.25}
        for i in range(4): C.flat((kn[0], kn[1 + i], kn[1 + (i + 1) % 4]))
        bmesh.ops.recalc_face_normals(C.bm, faces=C.bm.faces[:])
        for (dx, dl, ln) in ((7.0, 5.0, 24.0), (-5.0, 9.0, 19.0)):               # the tails lying back over the bare wrist (two-sided)
            side = fa.cross(fu)
            a = k0 + side * dx * 0.2; b = k0 + side * dx + fa * ln + fu * (dl - 6.0)
            w2 = side * 1.7
            for order in (1, -1):
                q = [C.bm.verts.new(a - w2 + fu * 1.5), C.bm.verts.new(a + w2 + fu * 1.5), C.bm.verts.new(b + w2), C.bm.verts.new(b - w2)]
                for v in q[:2]: C.w[v] = {hand: 0.75, arm: 0.25}
                for v in q[2:]: C.w[v] = {hand: 0.3, arm: 0.7}
                C.flat(q if order > 0 else list(reversed(q)))
        parts.append(C.finish(M))
        # bare wrist
        S = Part("h_wrist" + s, "wrist")
        r0 = S.ring(at(34.0), fa, fu, 19.5, 27.5, 12, {hand: 0.3, arm: 0.7}, s=0.0); r1 = S.ring(at(74.0), fa, fu, 20.5, 28.5, 12, {arm: 1.0}, s=1.0)
        S.strip(r0, r1)
        parts.append(S.finish(M))
        # coat cuff with a leather-bound edge, the sleeve behind it
        K = Part("h_cuff" + s, "sleeve")
        N = 16
        def ks(d): return (d - SLEEVE_D[0]) / (SLEEVE_D[1] - SLEEVE_D[0])
        k_sec = [(64.0, 30.5, 38.5, 0.0), (65.5, 33.5, 41.5, 0.0), (76.0, 34.0, 42.0, 0.0), (77.0, 32.5, 40.5, 0.0),
                 (98.0, 34.6, 42.4, 1.2), (120.0, 36.5, 44.0, 2.0), (160.0, 39.6, 47.0, 1.2), (205.0, 43.0, 50.2, 0.4), (252.0, 46.0, 53.0, 0.0)]
        rings = []
        for i, (d, ht, hw, lf) in enumerate(k_sec):
            r = K.ring(at(d, lf), fa, fu, ht, hw, N, {arm: 1.0}, phase=math.pi / N, s=ks(d))
            if i >= 4:                                                        # soft lengthwise folds in the oilcloth: alternate vertices fall in a little
                for k, v in enumerate(r):
                    c = at(d, lf); v.co = c + (v.co - c) * (1.0 - (0.030, 0.0, 0.018, 0.0)[k % 4] * min(1.0, (i - 3) / 2.0))
            rings.append(r)
        for A, B in zip(rings[:-1], rings[1:]): K.strip(A, B)
        inr = K.ring(at(71.0), fa, fu, 21.2, 29.2, N, {arm: 1.0}, phase=math.pi / N, s=0.0)    # the mouth of the sleeve closes on the wrist
        K.strip(inr, rings[0])
        for v in inr: K.shade[v] = 0.5
        parts.append(K.finish(M, smooth=50.0))
        # one horn button on the back of the cuff
        Bt = Part("h_button" + s, "button")
        bc = at(96.0) + fa.cross(fu) * (-34.0 * self.mx) + fu * 20.0
        bn = (bc - at(96.0)).normalized()
        b0 = Bt.ring(bc + bn * 0.3, bn, fa, 6.6, 6.6, 10, {arm: 1.0}, s=0.0); b1 = Bt.ring(bc + bn * 3.0, bn, fa, 6.6, 6.6, 10, {arm: 1.0}, s=0.0)
        b2 = Bt.ring(bc + bn * 3.9, bn, fa, 5.4, 5.4, 10, {arm: 1.0}, s=0.0)
        n = 10
        def disc(k, r): return (0.5 + 0.46 * r * math.cos(2 * math.pi * k / n), 0.5 + 0.46 * r * math.sin(2 * math.pi * k / n))
        for A, B, ra, rb in ((b0, b1, 1.0, 0.94), (b1, b2, 0.94, 0.78)):
            for k in range(n):
                k2 = (k + 1) % n
                f = Bt.bm.faces.new((A[k], A[k2], B[k2], B[k])); Bt._uv(f, (disc(k, ra), disc(k2, ra), disc(k2, rb), disc(k, rb)))
        f = Bt.bm.faces.new(b2); Bt._uv(f, [disc(k, 0.78) for k in range(n)])
        parts.append(Bt.finish(M, smooth=50.0))
        return parts


def _seg_dist(p, a, b):
    ab = b - a; u = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-12)))
    return (p - (a + ab * u)).length


def _flip_all(bm):
    bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
