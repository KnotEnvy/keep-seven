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
RADIUS = {"index": (11.2, 10.2, 9.3, 7.7), "middle": (11.4, 10.4, 9.5, 7.9), "ring": (11.0, 10.0, 9.1, 7.6), "pinky": (9.9, 8.9, 8.1, 6.9)}     # gloved: a millimetre of leather all round


def _ring(bm, c, t, up, ru, rs, n, seam=0.0, phase=0.0):
    """n vertices round centre c in the plane normal to t; `up` is the dorsal direction (radius ru), rs the side radius.
    Counter-clockwise about t, starting at `up`."""
    t = t.normalized()
    n1 = (up - t * up.dot(t)).normalized(); n2 = t.cross(n1)
    out = []
    for k in range(n):
        a = phase + 2 * math.pi * k / n
        r1 = ru * math.cos(a); r2 = rs * math.sin(a)
        if seam and k == 0: r1 += seam
        out.append(bm.verts.new(c + n1 * r1 + n2 * r2))
    return out


def _strip(bm, A, B):
    n = len(A); fs = []
    for k in range(n):
        fs.append(bm.faces.new((A[k], A[(k + 1) % n], B[(k + 1) % n], B[k])))
    return fs


class Part:
    """A bmesh under construction with per-vertex weights and per-face colours."""
    def __init__(self, name):
        self.name = name; self.bm = bmesh.new(); self.bm.loops.layers.uv.new("UVMap")
        self.w = {}                 # vert -> {bone: weight}
        self.col = {}               # face -> palette name
        self.seam = set()           # verts on a glove seam (darkened in COLOR_0 by weapon_revolver.paint)
        self.shade = {}             # vert -> a multiplier painted into COLOR_0 with the seams (the gaps between fingers, welts)
        self.ao_from = {}           # buried vert -> the vert whose AO it takes (a finger's root ring inside the palm)
        self.ao_min = {}            # vert -> the least AO it may bake to (the knuckle end of the palm, among the finger roots)

    def ring(self, c, t, up, ru, rs, n, weights, seam=0.0, phase=0.0):
        r = _ring(self.bm, c, t, up, ru, rs, n, seam, phase)
        for v in r: self.w[v] = dict(weights)
        if seam: self.seam.add(r[0])
        return r

    def strip(self, A, B, colour):
        for f in _strip(self.bm, A, B): self.col[f] = colour

    def cap(self, A, colour, flip=False):
        f = self.bm.faces.new(list(reversed(A)) if flip else A); self.col[f] = colour

    def fan(self, A, c, weights, colour, flip=False):
        v = self.bm.verts.new(c); self.w[v] = dict(weights)
        n = len(A)
        for k in range(n):
            f = self.bm.faces.new((A[(k + 1) % n], A[k], v) if flip else (A[k], A[(k + 1) % n], v)); self.col[f] = colour

    def tube(self, pts, ups, radii, n, weights, colours, seam=0.0, start_cap=None, end="round", side_scale=1.0, phase=0.0):
        """Rings along pts (Vectors), ups (dorsal Vectors), radii, weights (dict per point), colours (per strip).
        end: 'round' closes with a small dome, 'flat' with a cap, None leaves it open. Returns the rings."""
        rings = []
        for i, p in enumerate(pts):
            a = pts[max(i - 1, 0)]; b = pts[min(i + 1, len(pts) - 1)]
            t = (b - a)
            ru = radii[i] if not isinstance(radii[i], tuple) else radii[i][0]
            rs = radii[i] * side_scale if not isinstance(radii[i], tuple) else radii[i][1]
            rings.append(self.ring(p, t, ups[i], ru, rs, n, weights[i], seam, phase))
        for i in range(len(rings) - 1): self.strip(rings[i], rings[i + 1], colours[min(i, len(colours) - 1)])
        if start_cap: self.cap(rings[0], start_cap, flip=True)
        if end == "round":
            t = (pts[-1] - pts[-2]).normalized()
            ru = radii[-1] if not isinstance(radii[-1], tuple) else radii[-1][0]
            self.fan(rings[-1], pts[-1] + t * ru * 0.55, weights[-1], colours[-1])
        elif end == "flat": self.cap(rings[-1], colours[-1])
        return rings

    def finish(self, M, smooth=62.0):
        bm = self.bm
        bm.verts.index_update(); bm.faces.index_update()
        wv = [self.w.get(v, {}) for v in bm.verts]; cf = [self.col.get(f, "glove") for f in bm.faces]
        sv = [(0.68 if v in self.seam else 1.0) * self.shade.get(v, 1.0) for v in bm.verts]
        af = [self.ao_from[v].index if v in self.ao_from else -1 for v in bm.verts]
        am = [self.ao_min.get(v, 0.0) for v in bm.verts]
        for f in bm.faces: f.smooth = True
        bm.transform(M)
        ob = mesh.new_mesh_object(self.name, bm)
        mesh.finish(ob, bevel=0.0, smooth_angle=smooth, weighted=False)
        material.assign(ob, "m_prop")
        by = {}
        for i, c in enumerate(cf): by.setdefault(c, []).append(i)
        for c, idx in by.items():
            cell, colour = GLOVE.get(c, (c, c))
            uv.map_to_palette(ob, cell, idx); vcol.tint(ob, colour, idx)
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


def round_corners(pts, frac=0.24):
    """Cut each interior corner of a polyline into two points. Returns (points, [index of the source segment per point],
    [0..1 blend toward the NEXT segment per point])."""
    out = [pts[0]]; seg = [0]; blend = [0.0]
    for i in range(1, len(pts) - 1):
        a, b, c = pts[i - 1], pts[i], pts[i + 1]
        if (b - a).normalized().dot((c - b).normalized()) > 0.96:              # nearly straight: one ring, shared by both segments
            out.append(b); seg.append(i - 1); blend.append(0.5); continue
        k1 = min((b - a).length, (c - b).length) * frac
        out.append(b + (a - b).normalized() * k1); seg.append(i - 1); blend.append(0.3)
        out.append(b + (c - b).normalized() * k1); seg.append(i); blend.append(0.0)
    out.append(pts[-1]); seg.append(len(pts) - 2); blend.append(0.0)
    return out, seg, blend


class Hand:
    """side: 'r' | 'l'. curls: {finger: (spread deg, mcp, pip, dip flex deg)}. thumb: four hand-space points
    (cmc, mcp, ip, tip) for a RIGHT hand layout (mirrored for the left)."""
    def __init__(self, side, curls, thumb, thumb_r=(12.6, 10.8, 9.6, 7.6), forearm=(0.0, -1.0, 0.0), forearm_up=(0.0, 0.0, 1.0), loop=False):
        self.side = side; self.s = "_" + side
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

    def build(self, M):
        """Mesh parts (objects, metres) placed by M (hand space mm -> rest space). Vertex groups are set."""
        s = self.s; hand = "hand" + s; arm = "arm" + s
        grip = "grip_r" if self.side == "r" else "fingers_l"
        M = M @ Matrix.Scale(1.0, 4)
        parts = []
        flip = self.side == "l"
        Zv = Vector((0, 0, 1))
        # ---------------- palm: a block of rounded sections from the wrist to the knuckle row
        P = Part("h_palm" + s)
        #        y     x     z    half width  half thickness
        secs = [(-6.0, 0.0, 0.0, 29.0, 20.5), (8.0, -1.0, -0.8, 30.0, 20.0), (28.0, -3.0, -2.0, 36.0, 19.5), (52.0, -2.5, -2.0, 40.5, 17.0),
                (74.0, -1.0, -2.0, 41.5, 14.5), (90.0, 0.0, -2.5, 40.0, 12.0), (100.0, 0.5, -3.0, 36.5, 9.0)]
        rings = []
        N = 14
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
                if y > 80: P.ao_min[v] = 0.62
                ring.append(v)
            rings.append(ring)
        for A, B in zip(rings[:-1], rings[1:]):
            for k in range(N):
                f = P.bm.faces.new((A[k], A[(k + 1) % N], B[(k + 1) % N], B[k]))
                P.col[f] = "glove"
        P.cap(rings[-1], "glove"); P.cap(rings[0], "glove", flip=True)
        # the three "points" of a glove: stitched welts on the back of the hand, running from between the knuckles toward
        # the wrist. They give the back of the hand its direction and separate the knuckles (an unlit frame shows only
        # COLOR_0, so they are darker than the leather as well as raised)
        def back_z(x, y):
            for (y0, x0, z0, w0, t0), (y1, x1, z1, w1, t1) in zip(secs[:-1], secs[1:]):
                if y <= y1 or y1 == secs[-1][0]:
                    u = max(0.0, min(1.0, (y - y0) / (y1 - y0)))
                    xc, zc, hw, ht = x0 + (x1 - x0) * u, z0 + (z1 - z0) * u, w0 + (w1 - w0) * u, t0 + (t1 - t0) * u
                    sa = min(0.98, abs(x - xc) / hw) ** (1.0 / 1.12); ca = math.sqrt(1.0 - sa * sa)
                    return zc + ht * ca ** 1.05 * (0.94 - 0.10 * max(0.0, x - xc) / hw)
        for gx in (-17.5, 1.5, 19.0):
            st = []
            for y, k, h in ((40.0, 0.62, -0.6), (62.0, 0.82, 1.5), (86.0, 1.0, 1.7)):
                x = gx * k; z = back_z(x, y)
                tri = [P.bm.verts.new(self.v((x - 1.9, y, z - 1.2))), P.bm.verts.new(self.v((x, y, z + h))), P.bm.verts.new(self.v((x + 1.9, y, z - 1.2)))]
                for v in tri: P.w[v] = {hand: 1.0}; P.shade[v] = 0.60
                st.append(tri)
            for A, B in zip(st[:-1], st[1:]):
                for i in (0, 1):
                    f = P.bm.faces.new((A[i], B[i], B[i + 1], A[i + 1])); P.col[f] = "glove"
        if flip: _flip_all(P.bm)
        # palm side worn paler: the faces looking -Z
        P.bm.normal_update()
        for f in P.bm.faces:
            if f.normal.z < -0.55: P.col[f] = "glove_worn"
        parts.append(P.finish(M, smooth=80.0))
        # ---------------- fingers
        for name in FINGERS:
            F = Part(f"h_{name}{s}")
            j, fdir, _ = self.finger_joints(name)
            # polish round 3: the root of a finger lies INSIDE the palm, toward the wrist (it used to continue the first
            # phalanx backward: on a curled finger the root then rose out of the back of the hand, and its end cap showed
            # from behind as a row of dark notches along the knuckles)
            base = j[0] - Vector((0.0, 17.0, 2.5))
            src = [base] + j
            pts, seg, blend = round_corners(src, 0.22)
            Zm = Zv
            ups = []
            for i, p in enumerate(pts):
                a = pts[max(i - 1, 0)]; b = pts[min(i + 1, len(pts) - 1)]; t = (b - a).normalized()
                side_axis = fdir.cross(Zm)                                  # the hinge axis
                up = side_axis.cross(t) * (-1.0)
                if up.length < 1e-6: up = Zm.copy()
                if up.dot(Zm) < 0 and i < 2: up = -up
                ups.append(up.normalized())
            # make the dorsal vector continuous
            for i in range(1, len(ups)):
                if ups[i].dot(ups[i - 1]) < 0: ups[i] = -ups[i]
            R = RADIUS[name]; rsrc = [R[0] * 0.80, R[0] * 1.10, R[1] * 1.05, R[2], R[3]]
            radii = []
            for p in pts:
                best = min(range(len(src) - 1), key=lambda q: _seg_dist(p, src[q], src[q + 1]))
                a, b = src[best], src[best + 1]; u = max(0.0, min(1.0, (p - a).dot(b - a) / (b - a).length_squared))
                r = rsrc[best] + (rsrc[best + 1] - rsrc[best]) * u
                r *= 1.0 - 0.07 * math.sin(math.pi * u) * (1.0 if best in (1, 2) else 0.0)        # the shafts are slimmer than the joints
                radii.append((r * (1.20 if (p - src[1]).length < 1e-6 else 0.93), r))                         # the knuckle stands proud of the back of the hand
            if name == "index": bones = [hand, "index" + s + "_1", "index" + s + "_2", "index" + s + "_2"]
            else: bones = [hand, grip, grip, grip]
            weights = []
            for i, p in enumerate(pts):
                b0 = bones[seg[i]]; b1 = bones[min(seg[i] + 1, 3)]
                if i == 0: weights.append({hand: 1.0})
                elif blend[i] > 0 and b0 != b1: weights.append({b0: 1.0 - blend[i], b1: blend[i]})
                elif i > 0 and blend[i - 1] > 0 and bones[seg[i - 1]] != b0 and seg[i - 1] != seg[i]: weights.append({bones[seg[i - 1]]: 0.3, b0: 0.7})
                else: weights.append({b0: 1.0})
            worn = name == "index"
            cols = ["glove_worn" if worn and i >= 2 else "glove" for i in range(len(pts))]
            nf = 6 if name == "pinky" else 8                                # the little finger is the least seen: it pays for the knuckle rings (arms <= 2 800 tris)
            rr = F.tube(pts, ups, radii, nf, weights, cols, seam=0.9, end="round", phase=0.0, start_cap="glove")
            for a, b in zip(rr[0], rr[1]): F.ao_from[a] = b
            for ring in rr:                                                 # the gaps between the fingers: the sides darker than the back
                for k, v in enumerate(ring):
                    F.shade[v] = 1.0 - 0.26 * math.sin(2 * math.pi * k / nf) ** 2
            parts.append(F.finish(M))
        # ---------------- thumb
        T = Part("h_thumb" + s)
        tj = [self.v(p) for p in self.thumb]
        base = tj[0] - (tj[1] - tj[0]).normalized() * 12.0
        src = [base] + tj
        pts, seg, blend = round_corners(src, 0.25)
        t1, t2 = "thumb" + s + "_1", "thumb" + s + "_2"
        bones = [hand, t1, t1, t2]
        ups = []
        nrm = (tj[1] - tj[0]).cross(tj[3] - tj[1])
        if nrm.length < 1e-6: nrm = Vector((0, 0, 1))
        for i, p in enumerate(pts):
            a = pts[max(i - 1, 0)]; b = pts[min(i + 1, len(pts) - 1)]; t = (b - a).normalized()
            up = Vector((0, 0, 1)) - t * t.z
            ups.append(up.normalized() if up.length > 1e-6 else Vector((0, 1, 0)))
        R = self.thumb_r; rsrc = [R[0] * 1.05, R[0], R[1], R[2], R[3]]
        radii = []; weights = []
        for i, p in enumerate(pts):
            best = min(range(len(src) - 1), key=lambda q: _seg_dist(p, src[q], src[q + 1]))
            a, b = src[best], src[best + 1]; u = max(0.0, min(1.0, (p - a).dot(b - a) / (b - a).length_squared))
            r = rsrc[best] + (rsrc[best + 1] - rsrc[best]) * u
            if best >= 1: r *= 1.0 - 0.15 * math.sin(math.pi * u)             # slimmer shafts between fuller joints: the knuckle break (polish round 4: 0.10 -> 0.15)
            radii.append((r * 0.9, r))
            b0 = bones[seg[i]]
            if i == 0: weights.append({hand: 1.0})
            elif i == 1: weights.append({hand: 0.6, t1: 0.4})
            elif blend[i] > 0 and bones[min(seg[i] + 1, 3)] != b0: weights.append({b0: 0.7, bones[min(seg[i] + 1, 3)]: 0.3})
            elif seg[i - 1] != seg[i] and bones[seg[i - 1]] != b0: weights.append({bones[seg[i - 1]]: 0.3, b0: 0.7})
            else: weights.append({b0: 1.0})
        rr = T.tube(pts, ups, radii, 8, weights, ["glove"] * len(pts), seam=0.9, end="round", start_cap="glove")
        for a, b in zip(rr[0], rr[1]): T.ao_from[a] = b
        for i, ring in enumerate(rr):
            # polish round 4: a crease across each joint (the ring just before a corner), so the thumb breaks into phalanges
            crease = 0.74 if (0 < i < len(rr) - 1 and seg[i] != seg[i + 1]) else 1.0
            for k, v in enumerate(ring): T.shade[v] = crease * (1.0 - 0.18 * math.sin(2 * math.pi * k / 8) ** 2)
        parts.append(T.finish(M))
        # ---------------- gauntlet, cord, wrist, cuff, sleeve (along the forearm)
        fa = self.v(self.forearm); fu = self.v(self.forearm_up); fu = (fu - fa * fu.dot(fa)).normalized()
        def at(d, lift=0.0): return fa * d + fu * lift
        G = Part("h_gauntlet" + s)
        N = 12
        g_sec = [(-4.0, 31.0, 20.0, {hand: 1.0}), (9.0, 29.0, 19.5, {hand: 0.75, arm: 0.25}), (26.0, 34.0, 25.0, {hand: 0.4, arm: 0.6}),
                 (44.0, 40.0, 31.0, {hand: 0.15, arm: 0.85})]
        rings = [G.ring(at(d), fa, fu, ht, hw, N, w) for d, hw, ht, w in g_sec]
        for A, B in zip(rings[:-1], rings[1:]): G.strip(A, B, "glove")
        lip = G.ring(at(44.0), fa, fu, 28.6, 37.6, N, {hand: 0.15, arm: 0.85})
        G.strip(rings[-1], lip, "glove_worn")
        deep = G.ring(at(37.0), fa, fu, 20.4, 28.4, N, {hand: 0.3, arm: 0.7})          # the inside of the flare, down to the wrist: seen from the elbow
        G.strip(lip, deep, "glove")                                                  # side the gauntlet was a hoop round the arm (nothing is two-sided)
        for v in deep: G.shade[v] = 0.45
        parts.append(G.finish(M))
        # the tie cord round the glove's neck, with a knot and two tails on the back of the wrist
        C = Part("h_cord" + s)
        cn = 9
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
                f = C.bm.faces.new((q[i0], q[i1], q[i1 + 3], q[i0 + 3])); C.col[f] = "cord"
        k0 = at(10.0) + fu * 22.5
        kn = [C.bm.verts.new(k0 + d) for d in (fu * 3.4, fa * 3.2, fa.cross(fu) * 3.2, -fa * 3.2, -fa.cross(fu) * 3.2)]
        for v in kn: C.w[v] = {hand: 0.75, arm: 0.25}
        for i in range(4):
            f = C.bm.faces.new((kn[0], kn[1 + i], kn[1 + (i + 1) % 4])); C.col[f] = "cord"
        bmesh.ops.recalc_face_normals(C.bm, faces=C.bm.faces[:])
        for (dx, dl, ln) in ((7.0, 5.0, 24.0), (-5.0, 9.0, 19.0)):               # the tails lying back over the bare wrist (two-sided)
            side = fa.cross(fu)
            a = k0 + side * dx * 0.2; b = k0 + side * dx + fa * ln + fu * (dl - 6.0)
            w2 = side * 1.7
            for order in (1, -1):
                q = [C.bm.verts.new(a - w2 + fu * 1.5), C.bm.verts.new(a + w2 + fu * 1.5), C.bm.verts.new(b + w2), C.bm.verts.new(b - w2)]
                for v in q[:2]: C.w[v] = {hand: 0.75, arm: 0.25}
                for v in q[2:]: C.w[v] = {hand: 0.3, arm: 0.7}
                f = C.bm.faces.new(q if order > 0 else list(reversed(q))); C.col[f] = "cord"
        parts.append(C.finish(M))
        # bare wrist
        S = Part("h_wrist" + s)
        r0 = S.ring(at(34.0), fa, fu, 19.5, 27.5, 8, {hand: 0.3, arm: 0.7}); r1 = S.ring(at(74.0), fa, fu, 20.5, 28.5, 8, {arm: 1.0})     # polish round 4: 10 -> 8 sides (it pays for the thumb's knuckle rings)
        S.strip(r0, r1, "skin")
        parts.append(S.finish(M))
        # coat cuff with a leather-bound edge, the sleeve behind it
        K = Part("h_cuff" + s)
        N = 12
        k_sec = [(64.0, 30.5, 38.5, 0.0, "leather"), (65.5, 33.5, 41.5, 0.0, "leather"), (76.0, 34.0, 42.0, 0.0, "leather"), (77.0, 32.5, 40.5, 0.0, "cuff"),
                 (120.0, 36.5, 44.0, 2.0, "cuff"), (252.0, 46.0, 53.0, 0.0, "cuff")]
        rings = [K.ring(at(d, lf), fa, fu, ht, hw, N, {arm: 1.0}, phase=math.pi / N) for d, ht, hw, lf, c in k_sec]
        for i, (A, B) in enumerate(zip(rings[:-1], rings[1:])): K.strip(A, B, k_sec[i][4])
        inr = K.ring(at(71.0), fa, fu, 21.2, 29.2, N, {arm: 1.0}, phase=math.pi / N)    # the mouth of the sleeve closes on the wrist
        K.strip(inr, rings[0], "cuff")
        for v in inr: K.shade[v] = 0.5
        # (m_prop's vertex colour is a RATIO to the palette cell: the tint cancels, so the oilcloth is the `tin` cell shaded down here)
        for ri in (4, 5):
            for k, v in enumerate(rings[ri]): K.shade[v] = (0.36, 0.25, 0.33, 0.23)[k % 4]
        for k, v in enumerate(rings[3]): K.shade[v] = (0.50, 0.42)[k % 2]
        # one horn button on the back of the cuff
        bc = at(96.0) + fa.cross(fu) * (-34.0 * self.mx) + fu * 20.0
        bn = (bc - at(96.0)).normalized()
        b0 = K.ring(bc + bn * 0.5, bn, fa, 6.5, 6.5, 6, {arm: 1.0}); b1 = K.ring(bc + bn * 3.4, bn, fa, 6.0, 6.0, 6, {arm: 1.0})
        K.strip(b0, b1, "cord"); K.cap(b1, "cord")
        parts.append(K.finish(M, smooth=50.0))
        return parts


def _seg_dist(p, a, b):
    ab = b - a; u = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-12)))
    return (p - (a + ab * u)).length


def _flip_all(bm):
    bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
