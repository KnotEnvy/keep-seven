"""The Bider: one build function for the skinned enemy and its three static derivatives (art-enemies-bider).

    enemy_bider.py           -> build_skinned(args)                     2 500 tris, 22 bones, 18 clips
    bider_seated_static.py   -> build_static(id, 'sit_down', last)      posed, decimated, emissive off, breath in UV1.x
    bider_felled_static.py   -> build_static(id, 'die_back', last)      posed, decimated, emissive off
    bider_table_static.py    -> build_static(id, 'sit_table', 0)        posed, decimated, small live knot, breath in UV1.x

How it is made
  * The figure is MODELLED UPRIGHT (the "design pose": 1.7 m, arms hanging) as lofted cloth parts, one palette colour
    per part, every vertex weighted by hand as it is created (no bone heat: deterministic, nothing collapses).
  * A pose is a dictionary of animator's numbers (bider_clips.py); `solve()` turns it into one rigid transform per
    bone (FK for the spine, two-bone IK for planted feet and pinned hands). The armature's REST pose is the stoop
    (first frame of `idle_stoop`): the design mesh is skinned into it in Python before the armature is bound.
  * COLOR_0 is composed here (not by vcol.compose_vertex_color) because the dust skirt must LIGHTEN dark cloth toward
    ground colour: faces below the knee point at the `sand` palette cell and the vertex colour multiplies it down.
Blender space: +Z up, the figure faces -Y; its left is +X.
"""
import math
import bpy, bmesh
import numpy as np
from mathutils import Vector, Matrix, Quaternion
from lib import scene, mesh, uv, material, vcol, rig, anim, export, manifest, knot
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tex"))
import cloth_atlas as cl            # pass i2: the painted cloth in the free rows of tx_palette (hood, coat, sleeve)
import knot_atlas as kn             # pass i3: the crown knot (bound glass) in free cells of tx_palette and tx_palette_emis

# ====================================================================================================== skeleton
BONES = ["root", "hips", "spine", "chest", "neck", "head", "shoulder_l", "shoulder_r", "upperarm_l", "upperarm_r",
         "forearm_l", "forearm_r", "hand_l", "hand_r", "thigh_l", "thigh_r", "shin_l", "shin_r", "foot_l", "foot_r",
         "coat_tail_l", "coat_tail_r"]
BI = {b: i for i, b in enumerate(BONES)}


def V(*a): return Vector(a)


_J = {"root": (0, 0, 0), "hips": (0, 0.010, 0.930), "spine": (0, 0.012, 1.040), "chest": (0, 0.008, 1.180),
      "neck": (0, 0.0, 1.365), "head": (0, -0.008, 1.445)}
_JS = {"shoulder": (0.035, 0.0, 1.325), "upperarm": (0.185, 0.0, 1.335), "forearm": (0.212, 0.008, 1.047),
       "hand": (0.236, -0.004, 0.778), "thigh": (0.088, 0.0, 0.885), "shin": (0.094, -0.008, 0.478),
       "foot": (0.094, 0.012, 0.088), "coat_tail": (0.085, 0.105, 0.900)}
_TIP = {"root": (0, 0, 0.12), "head": (0, -0.008, 1.70)}
_TIPS = {"hand": (0.250, -0.012, 0.565), "foot": (0.100, -0.165, 0.030), "coat_tail": (0.100, 0.150, 0.500)}
J = {k: V(*v) for k, v in _J.items()}
TIP = {k: V(*v) for k, v in _TIP.items()}
for _k, _v in _JS.items():
    J[_k + "_l"] = V(*_v); J[_k + "_r"] = V(-_v[0], _v[1], _v[2])
for _k, _v in _TIPS.items():
    TIP[_k + "_l"] = V(*_v); TIP[_k + "_r"] = V(-_v[0], _v[1], _v[2])
PARENT = {"root": None, "hips": "root", "spine": "hips", "chest": "spine", "neck": "chest", "head": "neck"}
for _s in "lr":
    PARENT.update({f"shoulder_{_s}": "chest", f"upperarm_{_s}": f"shoulder_{_s}", f"forearm_{_s}": f"upperarm_{_s}",
                   f"hand_{_s}": f"forearm_{_s}", f"thigh_{_s}": "hips", f"shin_{_s}": f"thigh_{_s}",
                   f"foot_{_s}": f"shin_{_s}", f"coat_tail_{_s}": "hips"})
_CHILD = {"hips": "spine", "spine": "chest", "chest": "neck", "neck": "head"}
for _s in "lr":
    _CHILD.update({f"shoulder_{_s}": f"upperarm_{_s}", f"upperarm_{_s}": f"forearm_{_s}", f"forearm_{_s}": f"hand_{_s}",
                   f"thigh_{_s}": f"shin_{_s}", f"shin_{_s}": f"foot_{_s}"})
for _b in BONES:
    if _b not in TIP: TIP[_b] = J[_CHILD[_b]].copy()
SIDE = {"l": 1.0, "r": -1.0}
# foot geometry relative to the ankle joint (design pose): where the sole touches
BALL = V(0.0, -0.180, -0.086); HEEL = V(0.0, 0.058, -0.088); ANKLE_H = 0.088


# ====================================================================================================== pose maths
def Rx(d): return Matrix.Rotation(math.radians(d), 3, 'X')
def Ry(d): return Matrix.Rotation(math.radians(d), 3, 'Y')
def Rz(d): return Matrix.Rotation(math.radians(d), 3, 'Z')


def eul(e, s=1.0):
    """(pitch, yaw, roll) degrees -> rotation. Pitch about X (+ = bend FORWARD for anything pointing up, toe DOWN for a
    foot), yaw about Z (+ = turn to the figure's left), roll about Y. `s` = -1 mirrors it for the right side."""
    return Rz(e[1] * s) @ Rx(e[0]) @ Ry(e[2] * s)


def limb(e, s=1.0):
    """(forward, out, twist) degrees for a limb that hangs down in the design pose: raise it forward, swing it out to
    its own side, twist it about its length (+ = inward)."""
    return Rx(-e[0]) @ Ry(-e[1] * s) @ Rz(e[2] * s)


def about(pos, R3, j):
    """The rigid transform that carries a bone from the design pose to: joint `j` at `pos`, turned by `R3`."""
    return Matrix.Translation(pos) @ R3.to_4x4() @ Matrix.Translation(-j)


def mslerp(A, B, w):
    if w <= 0.0: return A
    if w >= 1.0: return B
    return A.to_quaternion().slerp(B.to_quaternion(), w).to_matrix()


def _frame(n, d):
    d = d.normalized(); n = (n - d * n.dot(d))
    if n.length < 1e-6: n = d.orthogonal()
    n.normalize()
    m = Matrix((n, d, n.cross(d))); m.transpose()                 # columns n, d, n x d
    return m


def ik2(h, target, pole, la, lb, d0a, d0b, knee):
    """Two-bone IK. h = root joint, target = end joint, pole = the way the middle joint points (knee: forward; elbow:
    back). Returns (R upper, R lower) as rotations from the design pose."""
    v = target - h; L = v.length
    e = v / L if L > 1e-6 else V(0, 0, -1)
    Lc = min(max(L, abs(la - lb) + 1e-3), la + lb - 1e-4)
    u = pole - e * pole.dot(e)
    if u.length < 1e-5: u = e.orthogonal()
    u.normalize()
    x = (la * la - lb * lb + Lc * Lc) / (2 * Lc); y = math.sqrt(max(la * la - x * x, 0.0))
    k = h + e * x + u * y
    n = u.cross(e) if knee else e.cross(u)
    X = V(1, 0, 0)
    Ra = _frame(n, k - h) @ _frame(X, d0a).transposed()
    Rb = _frame(n, (h + e * Lc) - k) @ _frame(X, d0b).transposed()
    return Ra, Rb


def _add(a, b): return tuple(x + y for x, y in zip(a, b))


def solve(P):
    """Pose numbers -> {bone: 4x4 transform from the design pose}. See bider_clips.BASE for the channels."""
    G = {"root": Matrix.Identity(4)}; R = {}
    yaw = P["hip_r"][1]
    Rh = eul(P["hip_r"])
    if P.get("hip_qw", (0.0,))[0] > 0.0:                            # a tumbling body: the pelvis as a quaternion
        q = Quaternion(P["hip_q"]); q.normalize(); Rh = mslerp(Rh, q.to_matrix(), P["hip_qw"][0])
    R["hips"] = Rh; Ryaw = Rz(yaw)
    G["hips"] = about(V(*P["hip"]), Rh, J["hips"])

    def put(b, Rg):
        G[b] = about(G[PARENT[b]] @ J[b], Rg, J[b]); R[b] = Rg

    def torso(ds, dc):
        put("spine", Rh @ eul(_add(P["spine"], (ds, 0, 0))))
        put("chest", R["spine"] @ eul(_add(P["chest"], (dc, 0, 0))))
        put("neck", R["chest"] @ eul(P["neck"]))
        return G["neck"] @ J["head"]

    ds = dc = 0.0
    hw = P.get("hpin_w", (0.0,))[0]
    if hw > 0.0:                                                   # keep the head joint where the animator pinned it
        free = torso(0, 0); goal = free.lerp(V(*P["hpin"]), hw)
        for _ in range(12):
            p0 = torso(ds, dc); ey, ez = goal.y - p0.y, goal.z - p0.z
            if abs(ey) + abs(ez) < 2e-5: break
            pa = torso(ds + 0.5, dc); pb = torso(ds, dc + 0.5)
            a, b, c, d = (pa.y - p0.y) * 2, (pb.y - p0.y) * 2, (pa.z - p0.z) * 2, (pb.z - p0.z) * 2
            det = a * d - b * c
            if abs(det) < 1e-9: break
            ds += max(-12, min(12, (ey * d - b * ez) / det)); dc += max(-12, min(12, (a * ez - ey * c) / det))
    torso(ds, dc)
    Rhead = R["neck"] @ eul(P["head"])
    put("head", mslerp(Rhead, eul(P["headg"]), P["headg_w"][0]))
    for sd, s in SIDE.items():
        put(f"shoulder_{sd}", R["chest"] @ eul(P[f"sh_{sd}"], s))
        ref = mslerp(Rz(yaw), R["chest"], P["arm_ch"][0])
        Rua = ref @ limb(P[f"ua_{sd}"], s); Rfa = Rua @ Rx(-P[f"el_{sd}"][0])
        e = P[f"ha_{sd}"]
        Rha = Rfa @ (Rz(e[1] * s) @ Rx(-e[0]) @ Ry(-e[2] * s))
        w = P[f"pin_{sd}_w"][0]
        if w > 0.0:
            sh = G[f"shoulder_{sd}"] @ J[f"upperarm_{sd}"]
            la = (J[f"forearm_{sd}"] - J[f"upperarm_{sd}"]).length; lb = (J[f"hand_{sd}"] - J[f"forearm_{sd}"]).length
            Ia, Ib = ik2(sh, V(*P[f"pin_{sd}"]), Ryaw @ V(*P[f"ep_{sd}"]), la, lb,
                         J[f"forearm_{sd}"] - J[f"upperarm_{sd}"], J[f"hand_{sd}"] - J[f"forearm_{sd}"], knee=False)
            Rua = mslerp(Rua, Ia, w); Rfa = mslerp(Rfa, Ib, w)
            Rha = mslerp(Rha, limb(P[f"pin_{sd}_r"], s), w)
        put(f"upperarm_{sd}", Rua); put(f"forearm_{sd}", Rfa); put(f"hand_{sd}", Rha)
        # leg: IK to a planted ankle, optionally blended to FK (lying poses)
        hj = G["hips"] @ J[f"thigh_{sd}"]
        la = (J[f"shin_{sd}"] - J[f"thigh_{sd}"]).length; lb = (J[f"foot_{sd}"] - J[f"shin_{sd}"]).length
        Rt, Rs = ik2(hj, V(*P[f"ft_{sd}"]), Ryaw @ V(*P[f"kn_{sd}"]), la, lb,
                     J[f"shin_{sd}"] - J[f"thigh_{sd}"], J[f"foot_{sd}"] - J[f"shin_{sd}"], knee=True)
        Rf = eul(P[f"ft_{sd}_r"])
        w = P[f"legfk_{sd}"][0]
        if w > 0.0:
            Ft = Rh @ limb(P[f"th_{sd}"], s); Fs = Ft @ Rx(P[f"knf_{sd}"][0]); Ff = Fs @ eul(P[f"ftl_{sd}"], s)
            Rt = mslerp(Rt, Ft, w); Rs = mslerp(Rs, Fs, w); Rf = mslerp(Rf, Ff, w)
        put(f"thigh_{sd}", Rt); put(f"shin_{sd}", Rs); put(f"foot_{sd}", Rf)
        e = P[f"tail_{sd}"]
        ref = mslerp(Rz(yaw), Rh, P["tail_h"][0])
        put(f"coat_tail_{sd}", ref @ (Rx(e[0]) @ Ry(-e[1] * s) @ Rz(e[2] * s)))
    spin = P.get("root_yaw", (0.0,))[0]
    if spin:                                                        # the clip is authored in the world; code turns the root by `spin`
        Q = Rz(-spin).to_4x4()
        for b in BONES:
            if b != "root": G[b] = Q @ G[b]
    return G


def foot(x, y, lift=0.0, pitch=0.0, yaw=0.0):
    """Ankle position and foot rotation for a foot whose FLAT position has its ankle over (x, y): pitch > 0 rolls onto
    the ball (heel up), pitch < 0 onto the heel (toe up); `lift` raises the whole foot. -> (ankle, (pitch, yaw, 0))."""
    a0 = V(x, y, ANKLE_H); Ry_ = Rz(yaw); R = eul((pitch, yaw, 0))
    piv = BALL if pitch >= 0 else HEEL
    a = a0 + Ry_ @ piv - R @ piv
    return (a.x, a.y, a.z + lift), (pitch, yaw, 0.0)


BOOT_SECS = [(0.076, .030, .050, 0.012), (0.045, .046, .070, 0.0), (-0.050, .050, .092, 0.0), (-0.122, .053, .060, 0.0), (-0.180, .045, .044, 0.003), (-0.207, .026, .030, 0.010)]


def foot_points(sd):
    """The outline of a boot in the design pose (the corners of its sections and the foot of its shaft): what the
    ground clamp of bider_clips keeps above the floor."""
    cx, cy = J[f"foot_{sd}"].x, J[f"foot_{sd}"].y; pts = []
    for y, hw, top, lift in BOOT_SECS:
        for sx in (-1, 1):
            pts += [V(cx + sx * hw * .86, cy + y, lift), V(cx + sx * hw, cy + y, lift + 0.022), V(cx + sx * hw * .58, cy + y, top)]
    pts += [V(cx + dx, cy + 0.004 + dy, 0.040) for dx, dy in ((.05, 0), (-.05, 0), (0, .05), (0, -.05))]
    return pts


# ====================================================================================================== modelling kit
class Part:
    """One coloured part: a bmesh whose every vertex carries bone weights and a `paint` multiplier (hand-painted fold
    shadow). colour = the part's albedo (palette name or hex); cell = the palette cell its faces point at (default:
    the colour itself; `sand` for parts that fade into ground colour)."""

    def __init__(self, name, colour, cell=None, cloth=None):
        """cloth (pass i2): 'hood' | 'cape' | 'coat' | 'sleeve': the part's UV0 goes into that painted region of
        tx_palette (blender/tex/cloth_atlas.py) instead of a flat cell; every vertex then needs `at(...)`."""
        self.name = name; self.colour = colour; self.cell = cell or colour; self.cloth = cloth; self.smooth = 42
        self.bm = mesh.new_bmesh(); self.dl = self.bm.verts.layers.deform.verify()
        self.pl = self.bm.verts.layers.float.new("paint")
        self.ul = self.bm.verts.layers.float.new("ua"); self.tl = self.bm.verts.layers.float.new("ut")

    def at(self, vs, a, t):
        """Where vertices sit on the cloth: a = the angle round the garment in degrees (-180 .. 180; +-180 is the seam
        of the unrolled cloth; None = a pole, the middle of a fan), t = the height (hood, coat: design-pose z; cape:
        0 cord .. 1 hem .. 1.3 turned under; sleeve: 0 shoulder .. 1 cuff; t < 0 on coat and sleeve: the dark inside).
        a and t may be lists."""
        for i, v in enumerate(vs):
            ai = a[i] if isinstance(a, (list, tuple)) else a
            v[self.ul] = POLE if ai is None else ai
            v[self.tl] = t[i] if isinstance(t, (list, tuple)) else t
        return vs

    def vert(self, co, w, paint=1.0):
        v = self.bm.verts.new(co); tot = sum(w.values())
        for b, x in w.items():
            if x > 0: v[self.dl][BI[b]] = x / tot
        v[self.pl] = paint; v[self.ul] = NOUV
        return v

    def ring(self, pts, w, paint=None):
        """pts: positions; w: a weight dict or callable(point, i) -> dict; paint: None | number | list | callable."""
        out = []
        for i, p in enumerate(pts):
            ww = w(p, i) if callable(w) else w
            pp = 1.0 if paint is None else (paint(p, i) if callable(paint) else (paint[i] if isinstance(paint, (list, tuple)) else paint))
            out.append(self.vert(p, ww, pp))
        return out

    def face(self, vs, out=None):
        vs = [v for i, v in enumerate(vs) if v not in vs[:i]]
        if len(vs) < 3: return None
        try: f = self.bm.faces.new(vs)
        except ValueError: return None
        if out is not None:
            f.normal_update()
            if f.normal.dot(out) < 0: f.normal_flip()
        return f

    def bridge(self, a, b, closed=True, inward=False, out=None):
        """Quads between two rings of equal length (identical verts collapse to triangles). Faces are turned to look
        away from the rings' common centre (or toward it with inward=True, or along `out`)."""
        n = len(a); c = sum(((v.co for v in a + b)), Vector()) / (2 * n)
        made = []
        for i in range(n if closed else n - 1):
            j = (i + 1) % n
            f = self.face([a[i], a[j], b[j], b[i]])
            if f is None: continue
            f.normal_update()
            ref = out if out is not None else (f.calc_center_median() - c)
            if (f.normal.dot(ref) < 0) != bool(inward and out is None): f.normal_flip()
            made.append(f)
        return made

    def fan(self, ring, co, w, paint=1.0, out=None):
        cv = self.vert(co, w, paint); n = len(ring)
        c = sum((v.co for v in ring), Vector()) / n
        for i in range(n):
            f = self.face([ring[i], ring[(i + 1) % n], cv])
            if f is None: continue
            f.normal_update()
            if f.normal.dot(out if out is not None else (co - c)) < 0: f.normal_flip()
        return cv

    def tris(self):
        return sum(len(f.verts) - 2 for f in self.bm.faces)

    def finish(self, smooth=None):
        smooth = self.smooth if smooth is None else smooth
        me = bpy.data.meshes.new(self.name); ob = bpy.data.objects.new(self.name, me); scene.link(ob)
        for b in BONES: ob.vertex_groups.new(name=b)
        self.bm.to_mesh(me); self.bm.free()
        return _dress(ob, self.colour, self.cell, smooth, cloth=self.cloth)


NOUV = -999.0; POLE = 999.0
_CLOTH = {"hood": ("hood", lambda a, t: cl.hood_uv(a, t)), "cape": ("hood", lambda a, t: cl.cape_uv(a, t)),
          "coat": ("coat", lambda a, t: cl.coat_uv(a, max(t, 0.0), inside=t < 0.0)),
          "sleeve": ("sleeve", lambda a, t: cl.sleeve_uv((a + 180.0) / 360.0, max(t, 0.0), inside=t < 0.0)),
          # pass i3, the crown knot (blender/tex/knot_atlas.py). knot: a = the angle round the knot, t = knot radii from its
          # middle; kcord: a = 0..1 along the cord, t = 0..1 across it
          "knot": ("knot", lambda a, t: kn.top_uv(t, a)), "knot_dead": ("knot_dead", lambda a, t: kn.top_uv(t, a, dead=True)),
          "kcord": ("cord", lambda a, t: kn.cord_uv(a, t)), "kcord_dead": ("cord_dead", lambda a, t: kn.cord_uv(a, t, dead=True))}
_BASE = dict(cl.BASE); _BASE.update(kn.BASE)


def _cloth_uv(ob, cloth):
    """UV0 of a cloth part from its vertices' (angle, height). A vertex ON the seam of the unrolled cloth (+-180) takes
    the side of the face it is seen in; a pole takes the middle of its face."""
    me = ob.data; fn = _CLOTH[cloth][1]
    ua = np.empty(len(me.vertices), np.float32); me.attributes["ua"].data.foreach_get("value", ua)
    ut = np.empty(len(me.vertices), np.float32); me.attributes["ut"].data.foreach_get("value", ut)
    a = uv.get(ob)
    for p in me.polygons:
        vs = list(p.vertices); aa = [float(ua[v]) for v in vs]
        if any(x <= NOUV + 1 for x in aa): raise RuntimeError(f"{ob.name}: a vertex of cloth part '{cloth}' has no place on the cloth (Part.at)")
        known = [x for x in aa if abs(x) < 179.4]
        side = 1.0 if (not known or sum(known) >= 0.0) else -1.0
        res = [x if (abs(x) < 179.4 or x >= POLE - 1) else side * 180.0 for x in aa]
        k2 = [x for x in res if x < POLE - 1]
        mid = sum(k2) / len(k2) if k2 else 0.0
        for li, v, x in zip(p.loop_indices, vs, res): a[li] = fn(mid if x >= POLE - 1 else x, float(ut[v]))
    uv.put(ob, a)


def _dress(ob, colour, cell, smooth=42, paint_from=None, cloth=None):
    """Shading, material, palette cell, and the helper colour layers the composer reads (Tint, Cell, Paint)."""
    me = ob.data
    mesh.finish(ob, bevel=0.0, smooth_angle=smooth, weighted=False)
    material.assign(ob, "m_prop"); uv.map_to_palette(ob, cell)
    n = len(me.loops)
    li = np.empty(n, dtype=np.int32); me.loops.foreach_get("vertex_index", li)
    if paint_from is not None: pa = paint_from
    elif "paint" in me.attributes:
        pv = np.empty(len(me.vertices), dtype=np.float32); me.attributes["paint"].data.foreach_get("value", pv)
        pa = np.ones((n, 4), np.float32); pa[:, :3] = pv[li][:, None]
    else: pa = np.ones((n, 4), np.float32)
    if "paint" in me.attributes: me.attributes.remove(me.attributes["paint"])
    if cloth: _cloth_uv(ob, cloth); cell = _BASE[_CLOTH[cloth][0]]         # the painted cloth: COLOR_0 is divided by the region's base colour
    for nm in ("ua", "ut"):
        if nm in me.attributes: me.attributes.remove(me.attributes[nm])
    vcol.fill_color(ob, colour, "Tint"); vcol.fill_color(ob, cell, "Cell"); vcol.set_colors(ob, pa, "Paint")
    return ob


def sup(a_deg, rx, ryf, ryb=None, n=2.2):
    """A point of a super-ellipse: angle 0 = front (-Y), +90 = the figure's left (+X). Counter-clockwise from above."""
    a = math.radians(a_deg); s, c = math.sin(a), math.cos(a)
    ry = ryf if (c >= 0 or ryb is None) else ryb
    return (rx * math.copysign(abs(s) ** (2.0 / n), s), -ry * math.copysign(abs(c) ** (2.0 / n), c))


def rows_at(rows, z):
    """Interpolate a profile table [(z, a, b, ...)] (z descending or ascending) at z."""
    rs = sorted(rows)
    if z <= rs[0][0]: return rs[0][1:]
    if z >= rs[-1][0]: return rs[-1][1:]
    for lo, hi in zip(rs, rs[1:]):
        if lo[0] <= z <= hi[0]:
            t = (z - lo[0]) / (hi[0] - lo[0]); t = t * t * (3 - 2 * t) * 0.5 + t * 0.5
            return tuple(x + (y - x) * t for x, y in zip(lo[1:], hi[1:]))


# ---------------------------------------------------------------------------------------------------- the hood
HOOD_ROWS = [(1.392, .088, .088, .088, -.004), (1.425, .143, .131, .141, -.006), (1.490, .170, .153, .167, -.006),
             (1.568, .170, .157, .159, -.010), (1.630, .160, .150, .150, -.010), (1.680, .134, .126, .128, -.008),
             (1.708, .090, .085, .090, -.006)]
HOOD_TOP = V(0.0, -0.008, 1.722)
HOOD_N = 2.25
SLIT_Z = (1.5645, 1.5725); SLIT_X = (0.0125, 0.0575)


def hood_pt(a, z, off=0.0):
    rx, ryf, ryb, cy = rows_at(HOOD_ROWS, z)
    x, y = sup(a, rx + off, ryf + off, ryb + off, HOOD_N)
    return V(x, y + cy, z)


def _slit_angle(x):
    rx = rows_at(HOOD_ROWS, 0.5 * (SLIT_Z[0] + SLIT_Z[1]))[0]
    return math.degrees(math.asin((x / rx) ** (HOOD_N / 2.0)))


def _head_under(a, z):
    """What the head under the cloth does to the bag of the static derivatives (metres, outward; a = 0 front): the brow,
    the hollows the slits sit in, the push of the nose, the fall of the cloth under the chin, flat temples, the nape.
    No face is drawn (ART_BIBLE 6.1): these are the planes a sewn bag takes when a person wears it. Pass i1: the low
    hood was the bare super-ellipse, "a bald grey ball with a slit"."""
    aa = abs(a); f = max(0.0, math.cos(math.radians(min(aa, 90.0))))
    g = lambda z0, w: math.exp(-((z - z0) / w) ** 2)
    off = 0.012 * g(1.632, 0.026) * f                                                  # the brow
    off -= 0.013 * g(1.582, 0.022) * max(0.0, 1.0 - abs(aa - 30.0) / 26.0)           # the hollows
    off += 0.022 * g(1.538, 0.026) * max(0.0, 1.0 - aa / 34.0)                        # the nose
    off -= 0.010 * g(1.470, 0.030) * f                                                 # under the chin
    off -= 0.008 * g(1.590, 0.060) * max(0.0, 1.0 - abs(aa - 84.0) / 34.0)           # the temples
    # a bag tied at the neck hangs STRAIGHT from the cheekbones to the cord (the bare profile bellied out like a ball)
    if z < 1.560:
        r_free = 0.5 * (rows_at(HOOD_ROWS, z)[0] + rows_at(HOOD_ROWS, z)[1])
        r_line = 0.092 + (0.162 - 0.092) * (z - 1.392) / (1.560 - 1.392)
        off -= max(0.0, r_free - r_line) * (0.55 + 0.45 * (1.0 - f))                    # less at the front: the chin holds the cloth out
    if z > 1.66: off += 0.012 * (0.5 + 0.5 * math.cos(math.radians(2 * a)) ) * 0.0 + 0.010 * abs(math.sin(math.radians(a)))   # the bag's top is squarer at the ends of its seam
    return off


HOOD_LO = {   # sides (degrees, counter-clockwise from above; the slits lie on the facets either side of 0) and rows (z)
    2: ([-144.0, -102.0, -62.0, -28.0, 0.0, 28.0, 62.0, 102.0, 144.0, 180.0], (1.392, 1.430, 1.482, 1.535, 1.588, 1.632, 1.684)),
    1: ([-135.0, -82.0, -30.0, 0.0, 30.0, 82.0, 135.0, 180.0], (1.392, 1.432, 1.488, 1.535, 1.588, 1.640)),     # the large dead knot covers the crown
    0: ([-135.0, -82.0, -30.0, 0.0, 30.0, 82.0, 135.0, 180.0], (1.392, 1.440, 1.535, 1.588, 1.640)),
}


def build_hood_lo(parts, emissive, lo_level=2, detail=1, knot_radius=0.123):
    """The hood of the static derivatives (pass i1): a sewn linen bag on a head. The planes of the head under it
    (_head_under), gathers painted and pulled in where the cord ties it, the felled seam over the crown as a proud band
    from ear to ear, two dark slits lying on their own facets, and a cape whose hem lies in scallops on the collarbones.
    The room lights a static with one flat colour (render: instances.ts), so the folds are PAINTED as well as modelled."""
    ANG, ZS = HOOD_LO[detail]; H = {"head": 1.0}; n = len(ANG)
    hood = Part("hood", "linen", cloth="hood")
    kax = V(0, -math.sin(math.radians(KNOT_TILT)), math.cos(math.radians(KNOT_TILT)))

    def under_knot(q):
        """Under the knot's collar (and a finger's width round it) the cloth is the plain dome the knot is wrapped on:
        the brow and the squarer top would otherwise stand through the collar's rim."""
        d = (q - DOME_C).normalized(); th = math.acos(max(-1.0, min(1.0, d.dot(kax))))
        reach = knot_radius * 1.3 * 1.12 / 0.165
        if th >= reach + 0.12: return q
        w = 1.0 if th <= reach else 1.0 - (th - reach) / 0.12
        return q.lerp(dome_pt(d, -0.002), w)

    rows = []
    for k, z in enumerate(ZS):
        pts = []; pv = []
        for i, a in enumerate(ANG):
            gather = (1 if i % 2 else -1) * (0.011 if k == 1 else (0.004 if k == 2 else 0.0))
            # the two bodies that REPLACE a skinned Bider where it sat down or fell (detail 0, 1) take 0.6 of the planes:
            # the skinned hood is the bare profile, and the swap three seconds after the sit must not show
            q = hood_pt(a, z, ((_head_under(a, z) * (1.0 if detail >= 2 else 0.6)) if k else 0.0) + gather)
            # the surplus of the bag is folded into one pleat down the back of the head
            if k >= 2 and abs(a) > 179.0: q += V(0, 0.013 * (1.0 if k < len(ZS) - 1 else 0.5), 0)
            if k >= 2 and 130.0 < abs(a) < 179.0: q += V(0, -0.005, 0)
            q.z -= 0.006 * max(0.0, math.sin(math.radians(a))) * (1.0 if 0 < k < 4 else 0.0)                 # the cloth sags a little on its left
            q = under_knot(q)
            f = max(0.0, math.cos(math.radians(min(abs(a), 90.0))))
            # pass i2: the painted cloth (cloth_atlas) holds the pleats, the hollows and the rim's shade now; what is
            # painted per vertex is only the large form (it was both, and the hood of a freed Bider went near black)
            p = 1.0
            if k == 0: p = 0.86
            elif k == 1: p = 0.86 if gather < 0 else 0.98                                                    # the valleys of the gathers
            elif k == 2: p = (0.94 if gather < 0 else 1.0) * (1.0 - 0.06 * f)                               # under the chin
            elif abs(z - 1.588) < 0.004: p = 1.0 - 0.08 * max(0.0, 1.0 - abs(abs(a) - 30.0) / 34.0)        # the hollows hold shade
            elif abs(z - 1.632) < 0.01: p = 1.0 + 0.05 * f
            if k >= 2 and 130.0 < abs(a) < 179.0: p *= 0.90                                                  # the pleat's two valleys
            if 2 <= k <= 3: p *= 0.95                                                                        # the jaw is in the head's own shade
            pts.append(q); pv.append(p)
        rows.append(hood.at(hood.ring(pts, {"neck": 1.0} if k == 0 else ({"head": 0.7, "neck": 0.3} if k == 1 else H), pv), ANG, z))
    for a, b in zip(rows, rows[1:]): hood.bridge(a, b)
    hood.at([hood.fan(rows[-1], under_knot(HOOD_TOP + V(0, 0, -0.002)), H, 0.93)], None, cl.HOOD_ZT)
    if detail >= 2:
        # pass i2: a bag has two CORNERS, at the ends of the seam over the crown. They stand off the head like dog-ears
        # and are the silhouette that says "a sack pulled over a head" where the plain dome said "an egg"
        kt = len(ZS) - 2
        for sx in (1, -1):
            j = max(i for i in range(n) if 0 < ANG[i] <= 90.0) if sx > 0 else min(i for i in range(n) if -90.0 <= ANG[i] < 0)
            j2 = (j + sx) % n
            base = [rows[kt][j], rows[kt][j2], rows[kt + 1][j2], rows[kt + 1][j]]
            c = sum((v.co for v in base), Vector()) / 4
            old = hood.bm.faces.get(base)
            if old is not None: hood.bm.faces.remove(old)
            tip = hood.vert(c + V(sx * 0.050, 0.012, 0.030 if sx > 0 else 0.018), H, 1.04)
            hood.at([tip], sx * 90.0, 0.5 * (ZS[kt] + ZS[kt + 1]))
            for q in range(4):
                f = hood.face([base[q], base[(q + 1) % 4], tip], out=V(sx, 0, 0.6))
    # the slits: on the facets between the front edge and the next one, between the nose row and the hollow row
    dark = Part("hood_slit", "cable")
    ai, ao = _slit_angle(SLIT_X[0]), _slit_angle(SLIT_X[1])
    i0 = ANG.index(0.0); k0 = ZS.index(1.535); k1 = k0 + 1
    for sg in (1, -1):
        e = i0 + sg; a1 = abs(ANG[e])
        def facet(a, z, e=e, a1=a1):
            u = a / a1; t = (z - ZS[k0]) / (ZS[k1] - ZS[k0])
            lo_ = rows[k0][i0].co.lerp(rows[k0][e].co, u); hi_ = rows[k1][i0].co.lerp(rows[k1][e].co, u)
            return lo_.lerp(hi_, t) + V(0, -0.0025, 0)
        q = [facet(a, z) for a, z in ((ai + 3, SLIT_Z[0] - 0.003), (ao + 4, SLIT_Z[0] - 0.003), (ao + 4, SLIT_Z[1] + 0.003), (ai + 3, SLIT_Z[1] + 0.003))]
        dark.face(dark.ring(q, H, 0.5), out=V(0, -1, 0))
    # the seam over the crown, ear to ear: a flat felled band 24 mm wide, 5 mm proud of the cloth
    seam = Part("hood_seam", "linen")
    SEAM_GEO = False                                                  # pass i2: the seam is painted in the cloth (cloth_atlas); its 16 triangles went to the cape's edge
    if detail >= 2 and SEAM_GEO:
        def side_pt(k, sx):
            j = max(i for i in range(n) if 0 < ANG[i] <= 90.0) if sx > 0 else min(i for i in range(n) if -90.0 <= ANG[i] < 0)
            j2 = (j + (1 if sx > 0 else -1)) % n
            u = (90.0 - abs(ANG[j])) / max(1e-6, abs(ANG[j2]) - abs(ANG[j]))
            return rows[k][j].co.lerp(rows[k][j2].co, min(1.0, u))
        path = [(side_pt(k, 1), V(1, 0, 0.15)) for k in range(k0, len(ZS))]
        path += [(HOOD_TOP.copy(), V(0, 0, 1))]
        path += [(side_pt(k, -1), V(-1, 0, 0.15)) for k in range(len(ZS) - 1, k0 - 1, -1)]
        prev = None
        for c, nrm in path:
            nrm = nrm.normalized()
            sec = [seam.vert(c + V(0, -0.012, 0) + nrm * 0.005, H, 1.06), seam.vert(c + V(0, 0.012, 0) + nrm * 0.005, H, 0.90)]
            if prev: seam.face([prev[0], prev[1], sec[1], sec[0]], out=nrm)
            prev = sec
    # pass i2 (the reviewers: "a flat paper collar", "two flat triangles"): the folds are in the painted cloth now, so the
    # cape is rounder (its zig-zag made a star of ten points), and at the table its hem has a thickness: a rolled edge
    # turned under, which is what the eye reads from the side and from a chair's height
    cape = Part("hood_cape", "linen", cloth="cape")
    cr = []
    for dz, rx, ry, w, zig, p, f in ((1.392, .088, .088, {"neck": 1.0}, 0.0, 0.80, 0.0), (1.352, .156, .124, {"chest": 0.7, "neck": 0.3}, 0.004, 1.0, 0.5),
                                     (1.308, .192, .146, {"chest": 0.85, "neck": 0.15}, 0.007, 0.97, 1.0)):
        pts = []; pv = []
        for i, a in enumerate(ANG):
            fold = zig * (1 if i % 2 else -1); x, y = sup(a, rx + fold, ry + fold, None, 2.3)
            scallop = 0.007 * (1 if i % 2 else 0) if dz < 1.33 else 0.0                                      # the hem hangs longer on every fold
            pts.append(V(x, y - 0.002, dz - scallop - 0.014 * math.cos(math.radians(a)) ** 2 * (1.0 if dz < 1.36 else 0.3)))
            pv.append(p * (0.90 if fold < 0 else 1.0))
        cr.append(cape.at(cape.ring(pts, w, pv), ANG, f))
    if lo_level >= 3: cape.bridge(cr[2], cr[0])
    else: cape.bridge(cr[1], cr[0]); cape.bridge(cr[2], cr[1])
    if detail >= 2:
        under = []
        for v in cr[2]:
            d = V(v.co.x, v.co.y, 0.0); d = d.normalized() if d.length > 1e-6 else V(0, -1, 0)
            under.append(v.co - d * 0.020 + V(0, 0, -0.011))
        ur = cape.at(cape.ring(under, {"chest": 0.85, "neck": 0.15}, 0.55), ANG, 1.3)
        cape.bridge(ur, cr[2], out=V(0, 0, -1))
    parts += [hood, dark, cape] + ([seam] if detail >= 2 and SEAM_GEO else [])


def build_hood(parts, emissive=True, lo=False, detail=1, knot_radius=0.123):
    if lo: return build_hood_lo(parts, emissive, int(lo), detail, knot_radius)
    ai, ao = _slit_angle(SLIT_X[0]), _slit_angle(SLIT_X[1])
    half = [ai, ao, 40.0, 65.0, 90.0, 115.0, 140.0, 162.0]
    ANG = [-a for a in reversed(half)] + half + [180.0]          # 17, counter-clockwise from above
    H = {"head": 1.0}
    hood = Part("hood", "linen", cloth="hood")
    front = lambda i: abs(ANG[i]) <= ao + 0.1

    def row(z, w=H, zig=0.0, paint=1.0, off=0.0, slump=0.0):
        pts = []; pv = []
        for i, a in enumerate(ANG):
            fold = (zig * 0.35 if front(i) else zig) * (1 if i % 2 else -1)
            q = hood_pt(a, z, off + fold); q.z -= slump * max(0.0, math.sin(math.radians(a)))       # the cloth sags a little on its left
            pts.append(q); pv.append(paint * (0.90 if fold < 0 else 1.0))
        return hood.at(hood.ring(pts, w, pv), ANG, z)

    r0 = row(1.392, {"neck": 1.0}, paint=0.90)
    r1 = row(1.425, {"head": 0.7, "neck": 0.3}, zig=0.016, slump=0.004)
    r2 = row(1.490, zig=0.007, slump=0.008)
    zm = 0.5 * (SLIT_Z[0] + SLIT_Z[1])
    lo = []; hi = []
    for i, a in enumerate(ANG):
        if front(i):
            lo.append(hood.vert(hood_pt(a, SLIT_Z[0]), H)); hi.append(hood.vert(hood_pt(a, SLIT_Z[1]), H))
            hood.at([lo[-1]], a, SLIT_Z[0]); hood.at([hi[-1]], a, SLIT_Z[1])
        else:
            v = hood.vert(hood_pt(a, zm), H); lo.append(v); hi.append(v); hood.at([v], a, zm)
    r4 = row(1.630); r5 = row(1.680); r6 = row(1.708)
    for a, b in ((r0, r1), (r1, r2), (r2, lo), (hi, r4), (r4, r5), (r5, r6)): hood.bridge(a, b)
    # the slit band: the two openings are left out
    n = len(ANG); holes = []
    for i in range(n):
        j = (i + 1) % n
        if front(i) and front(j) and abs(ANG[i]) != abs(ANG[j]): holes.append((i, j)); continue
        hood.face([lo[i], lo[j], hi[j], hi[i]], out=V(0, -1, 0) if front(i) and front(j) else (lo[i].co - V(0, 0, zm)))
    hood.at([hood.fan(r6, HOOD_TOP, H)], None, cl.HOOD_ZT)
    # the seam over the crown (ear to ear): a flat felled band, proud of the cloth, down both sides
    seam = Part("hood_seam", "linen", cloth="hood")
    for sx in (1, -1):
        prev = None
        for z in (1.455, 1.52, 1.59, 1.65, 1.695):
            c = hood_pt(90.0 * sx, z); nrm = V(sx, 0, 0.25 if z > 1.62 else 0.0).normalized()
            sec = [seam.vert(c + V(0, dy, 0) + nrm * h, H, p) for dy, h, p in ((-0.011, -0.002, 0.8), (-0.007, 0.0045, 1.0), (0.007, 0.0045, 1.0), (0.011, -0.002, 0.8))]
            seam.at(sec, [sx * (90.0 + math.degrees(dy / 0.165)) for dy in (-0.011, -0.007, 0.007, 0.011)], z)      # it lies on the painted seam
            if prev: seam.bridge(prev, sec, closed=False, out=V(sx, 0, 0))
            prev = sec
    # slits: a dark recess 15 mm deep with a violet pinprick at the bottom
    dark = Part("hood_slit", "cable"); pin = Part("hood_pin", "violet_band" if emissive else "cable")
    for (i, j) in holes:
        rim = [lo[i].co.copy(), lo[j].co.copy(), hi[j].co.copy(), hi[i].co.copy()]
        back = [p + V(0, 0.015, 0) for p in rim]
        rv = dark.ring(rim, H, 0.55); bv = dark.ring(back, H, 0.35)
        dark.bridge(rv, bv, inward=True)
        dark.face(bv, out=V(0, -1, 0))
        c = sum(back, Vector()) / 4 + V(0, -0.0012, 0)
        pin.face(pin.ring([c + V(dx, 0, dz) for dx, dz in ((-0.007, -0.003), (0.007, -0.003), (0.007, 0.003), (-0.007, 0.003))], H), out=V(0, -1, 0))
    # the short cape below the tie: gathered, lying on the collarbones, with a rolled hem
    cape = Part("hood_cape", "linen", cloth="cape")

    def cape_row(dz, rx, ry, w, zig=0.0, paint=1.0, inner=False, f=0.0):
        pts = []; pv = []
        for i, a in enumerate(ANG):
            fold = zig * (1 if i % 2 else -1)
            x, y = sup(a, rx + fold, ry + fold, None, 2.3)
            droop = 0.014 * math.cos(math.radians(a)) ** 2 + 0.006 * (1 if i % 3 == 0 else 0)      # longer at front and back
            pts.append(V(x, y - 0.002, dz - droop * (1.0 if dz < 1.36 else 0.3))); pv.append(paint * (0.85 if fold < 0 else 1.0))
        return cape.at(cape.ring(pts, w, pv), ANG, f)

    c0 = cape_row(1.392, .088, .088, {"neck": 1.0}, paint=0.80, f=0.0)
    c1 = cape_row(1.366, .128, .108, {"neck": 0.6, "chest": 0.4}, zig=0.004, f=0.32)
    c2 = cape_row(1.336, .162, .132, {"chest": 0.8, "neck": 0.2}, zig=0.010, f=0.72)
    c3 = cape_row(1.318, .174, .141, {"chest": 0.85, "neck": 0.15}, zig=0.011, paint=0.93, f=1.0)
    c4 = cape_row(1.323, .160, .127, {"chest": 0.85, "neck": 0.15}, zig=0.008, paint=0.5, f=1.3)
    cape.bridge(c1, c0); cape.bridge(c2, c1); cape.bridge(c3, c2)
    cape.bridge(c4, c3, out=V(0, 0, -1))
    parts += [hood, seam, dark, pin, cape]


def build_cord(parts, lo=False):
    """The neck tie: three turns of well cord and two hanging ends (the only loose detail)."""
    cord = Part("cord", "cord"); N = {"neck": 1.0}
    if lo:
        rings = []
        for z, off, p in (((1.374, .003, 0.7), (1.392, .015, 1.0), (1.410, .003, 0.7)) if int(lo) == 1 else ((1.377, .013, 0.8), (1.407, .013, 1.0))):
            pts = []
            for i in range(6):
                x, y = sup(60.0 * i + 30.0, .088 + off, .088 + off); pts.append(V(x, y - 0.004, z))
            rings.append(cord.ring(pts, N, p))
        for a, b in zip(rings, rings[1:]): cord.bridge(a, b)
        k0 = V(0.034, -0.103, 1.388)
        for dx, ln in ((0.012, 0.125), (-0.010, 0.100)):
            a = [cord.vert(k0 + V(dx - 0.008, -0.004, 0), N), cord.vert(k0 + V(dx + 0.008, -0.004, 0), N)]
            b = [cord.vert(k0 + V(dx * 3 - 0.009, -0.052, -ln), {"chest": 1.0}, 0.9), cord.vert(k0 + V(dx * 3 + 0.009, -0.052, -ln), {"chest": 1.0}, 0.9)]
            cord.face([a[0], a[1], b[1], b[0]], out=V(0, -1, 0))
        parts.append(cord); return
    prof = [(1.372, .003, 0.7), (1.379, .013, 1.0), (1.3855, .005, 0.7), (1.392, .0145, 1.0), (1.3985, .005, 0.7), (1.405, .013, 1.0), (1.412, .003, 0.7)]
    rings = []
    for k, (z, off, p) in enumerate(prof):
        pts = []
        for i in range(8):
            a = 45.0 * i + 22.5
            x, y = sup(a, .088 + off, .088 + off)
            pts.append(V(x, y - 0.004, z + 0.0035 * math.sin(math.radians(a + 40))))
        rings.append(cord.ring(pts, N, p))
    for a, b in zip(rings, rings[1:]): cord.bridge(a, b)
    # the knot of the tie, front-left, and the two ends lying on the cape
    k0 = V(0.034, -0.097, 1.392)
    lump = [k0 + V(dx, dy, dz) for dx, dy, dz in ((-.016, -.006, 0), (0, -.016, -.008), (.016, -.006, 0), (0, -.014, .010))]
    lv = cord.ring(lump, N); cord.fan(lv, k0 + V(0, -0.022, 0.001), N, out=V(0, -1, 0))
    back = cord.ring([p + V(0, 0.012, 0) for p in lump], N, 0.7); cord.bridge(back, lv)
    for (dx, length, splay) in ((0.012, 0.125, 0.25), (-0.010, 0.100, -0.30)):
        prev = None
        for t, wid, w in ((0.0, .0075, {"neck": 1.0}), (0.35, .0070, {"neck": 0.5, "chest": 0.5}), (0.80, .0068, {"chest": 1.0}), (0.9, .0105, {"chest": 1.0}), (1.0, .0085, {"chest": 1.0})):
            c = k0 + V(dx + splay * length * t * 0.5, -0.018 - 0.046 * min(1.0, t * 2.2) + 0.012 * max(0.0, t - 0.5), -length * t)
            sec = cord.ring([c + V(wid, 0, 0), c + V(0, -wid, 0), c + V(-wid, 0, 0), c + V(0, wid, 0)], w, 1.0 if t < 0.85 else 0.9)
            if prev: cord.bridge(prev, sec)
            prev = sec
        cord.fan(prev, sum((v.co for v in prev), Vector()) / 4 + V(0, 0, -0.006), {"chest": 1.0}, out=V(0, 0, -1))
    parts.append(cord)


# ---------------------------------------------------------------------------------------------------- the coat
COAT_ROWS = [(1.372, .072, .070, .072, .004), (1.342, .150, .088, .094, .006), (1.290, .186, .116, .120, .006),
             (1.200, .182, .128, .128, .008), (1.110, .168, .124, .121, .010), (1.030, .162, .122, .118, .011),
             (0.950, .174, .132, .128, .010), (0.880, .187, .144, .140, .010), (0.740, .202, .158, .157, .010),
             (0.610, .214, .172, .172, .010), (0.500, .224, .182, .182, .010)]
COAT_N = 2.5


def coat_pt(a, z, off=0.0):
    rx, ryf, ryb, cy = rows_at(COAT_ROWS, z)
    x, y = sup(a, rx + off, ryf + off, ryb + off, COAT_N)
    return V(x, y + cy, z)


def _ss(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t)


def coat_w(a, z):
    """Bone weights of the coat at angle a (0 front, +90 left, 180 back) and height z."""
    if z >= 0.88:
        tab = [(1.372, {"chest": .6, "neck": .4}), (1.342, {"chest": 1}), (1.290, {"chest": 1}), (1.200, {"chest": .85, "spine": .15}),
               (1.110, {"spine": .7, "chest": .3}), (1.030, {"spine": .8, "hips": .2}), (0.950, {"hips": .7, "spine": .3}), (0.880, {"hips": 1})]
        w = dict(min(tab, key=lambda t: abs(t[0] - z))[1])
        if 1.25 < z < 1.36 and 55 < abs(a) < 125:                     # the shoulder seam follows the clavicle
            b = "shoulder_l" if a > 0 else "shoulder_r"; k = 0.4
            w = {q: x * (1 - k) for q, x in w.items()}; w[b] = k
        return w
    lw = _ss(0.88, 0.58, z) * 0.97                                   # how much the skirt belongs to the limbs
    aa = abs(a); sd = "l" if a > 0 else "r"
    tail = _ss(65, 120, aa)
    w = {"hips": 1 - lw}
    cl = 0.5 + 0.5 * max(-1.0, min(1.0, a / 28.0)) if aa < 90 else (1.0 if a > 0 else 0.0)        # left / right share at the front
    w["thigh_l"] = lw * (1 - tail) * cl; w["thigh_r"] = lw * (1 - tail) * (1 - cl)
    w[f"coat_tail_{sd}"] = lw * tail
    return {k: v for k, v in w.items() if v > 1e-4}


def build_coat_lo(parts, rng, lo=1, sash=True):
    """The coat of the static derivatives: eight sides, six rows, the skirt in two; a sash; no placket, pocket or toggles."""
    coat = Part("coat", "workcloth", cloth="coat")
    ANG = [-135.0, -90.0, -45.0, 0.0, 45.0, 90.0, 135.0, 180.0]
    top = [coat.at(coat.ring([coat_pt(a, z) for a in ANG], lambda p, i, z=z: coat_w(ANG[i], z)), ANG, z) for z in ((1.372, 1.342, 1.290, 1.110, 0.950, 0.880) if lo == 1 else (1.372, 1.290, 1.110, 0.880))]
    for a, b in zip(top, top[1:]): coat.bridge(b, a)
    SK = [-179.0] + ANG[:-1] + [179.0]
    rings = [[top[-1][7]] + top[-1][:7] + [top[-1][7]]]
    for z, zig, p in ((0.690, 0.008, 1.0), (0.500, 0.016, 0.92)):
        pts = []; pv = []
        for i, a in enumerate(SK):
            fold = zig * (1 if i % 2 else -1); q = coat_pt(a, z, fold)
            if z == 0.500: q.z += (0.0 if i in (0, len(SK) - 1) else rng.uniform(-0.022, 0.012))
            if abs(a) > 178: q.x += (0.012 if a < 0 else -0.004); q.y += (0.0 if a < 0 else 0.007)
            pts.append(q); pv.append(p * (0.86 if fold < 0 else 1.0))
        rings.append(coat.at(coat.ring(pts, lambda p_, i, z=z: coat_w(SK[i], z), pv), SK, z))
    for a, b in zip(rings, rings[1:]): coat.bridge(b, a, closed=False)
    inner = []
    for v, a in zip(rings[-1], SK):
        d = v.co - V(0, 0.01, v.co.z); d.z = 0
        inner.append(coat.vert(v.co - d * 0.16 + V(0, 0, 0.10), coat_w(a, 0.6), 0.3))
    coat.at(inner, SK, -1.0)
    if lo == 1: coat.bridge(inner, rings[-1], closed=False, inward=True)
    parts.append(coat)
    if not sash: return
    trim = Part("coat_trim", "workcloth_light")
    zs_ = lambda a: 1.012 - 0.030 * (0.5 + 0.5 * math.cos(math.radians(a))) + 0.012 * (0.5 - 0.5 * math.cos(math.radians(a)))
    sr = [trim.ring([coat_pt(a, zs_(a) + dz, 0.012) for a in ANG], lambda p_, i, dz=dz: coat_w(ANG[i], zs_(ANG[i]) + dz), p) for dz, p in ((0.026, 1.0), (-0.026, 0.8))]
    trim.bridge(sr[1], sr[0])
    parts.append(trim)


def build_coat(parts, rng, lo=False, sash=True):
    if lo: return build_coat_lo(parts, rng, int(lo), sash)
    coat = Part("coat", "workcloth", cloth="coat")
    ANG = [-150 + 30 * i for i in range(12)]                          # ... 150, 180
    top = []
    for z, *_ in COAT_ROWS[:8]:
        pts = []; pv = []
        for i, a in enumerate(ANG):
            off = 0.0; p = 1.0
            if 1.0 < z < 1.25 and abs(a) < 100:                        # the belly folds of a bent back
                off = (-0.006 if z in (1.110,) else 0.004); p = 0.86 if off < 0 else 1.0
            if z == 1.200 and abs(a) > 140: off = 0.012                # the hunch
            pts.append(coat_pt(a, z, off)); pv.append(p)
        top.append(coat.at(coat.ring(pts, lambda p, i, z=z: coat_w(ANG[i], z), pv), ANG, z))
    for a, b in zip(top, top[1:]): coat.bridge(b, a)
    # the skirt: open at the back (two tails), uneven hem
    SK = [-179.0] + ANG[:-1] + [179.0]
    hemj = [rng.uniform(-0.022, 0.012) for _ in SK]
    hemj[0] = hemj[-1] = 0.0
    prev = None; first = None
    rows = [(0.880, 0.0, 1.0), (0.740, 0.005, 1.0), (0.610, 0.011, 1.0), (0.500, 0.017, 0.92)]
    rings = []
    for z, zig, p in rows:
        pts = []; pv = []
        for i, a in enumerate(SK):
            fold = zig * (1 if i % 2 else -1)
            q = coat_pt(a, z, fold)
            if z == 0.500: q.z += hemj[i]
            if abs(a) > 178:                                           # the back vent: the left tail laps over the right
                q.x += (0.012 if a < 0 else -0.004) * _ss(0.88, 0.6, z); q.y += (0.0 if a < 0 else 0.007)
            pts.append(q); pv.append(p * (0.74 if fold < 0 else 1.0))
        if z == 0.880: rings.append([top[-1][11]] + top[-1][:11] + [top[-1][11]])     # the waist ring itself: no crack
        else: rings.append(coat.at(coat.ring(pts, lambda p_, i, z=z: coat_w(SK[i], max(z, 0.5)), pv), SK, z))
    for a, b in zip(rings, rings[1:]): coat.bridge(b, a, closed=False)
    # hem: rolled edge and the dark inside
    inner = []
    for v, a in zip(rings[-1], SK):
        c = V(0, 0.01, v.co.z); d = (v.co - c); d.z = 0
        inner.append(coat.vert(v.co - d.normalized() * 0.016 + V(0, 0, 0.012), coat_w(a, 0.5), 0.42))
    coat.at(inner, SK, -1.0)
    coat.bridge(inner, rings[-1], closed=False, out=V(0, 0, -1))
    lin = []
    for v, a in zip(inner, SK):
        c = V(0, 0.01, v.co.z); d = (v.co - c); d.z = 0
        lin.append(coat.vert(v.co - d * 0.10 + V(0, 0, 0.13), coat_w(a, 0.62), 0.30))
    coat.at(lin, SK, -1.0)
    coat.bridge(lin, inner, closed=False, inward=True)
    parts.append(coat)
    # the front placket (left over right), three horn toggles, a patch pocket and a mend
    trim = Part("coat_trim", "workcloth_light")
    zs = [1.300, 1.200, 1.110, 1.030, 0.950, 0.880, 0.740, 0.610, 0.512]
    prev = None
    for z in zs:
        sec = [trim.vert(coat_pt(4.0, z, 0.0005), coat_w(4.0, z), 0.7), trim.vert(coat_pt(4.5, z, 0.0075), coat_w(4.5, z), 1.0),
               trim.vert(coat_pt(17.0, z, 0.0075), coat_w(17.0, z), 1.0), trim.vert(coat_pt(20.0, z, 0.001), coat_w(20.0, z), 0.9)]
        if prev: trim.bridge(prev, sec, closed=False, out=V(0, -1, 0))
        prev = sec
    # pocket on the right hip
    for (a0, a1, z0, z1, off, paint) in ((-52.0, -22.0, 0.700, 0.835, 0.007, 1.0), (-53.0, -21.0, 0.815, 0.850, 0.012, 0.9), (62.0, 96.0, 0.560, 0.660, 0.006, 1.08)):
        g = [[None] * 3 for _ in range(3)]
        for r, z in enumerate((z0, 0.5 * (z0 + z1), z1)):
            for c, a in enumerate((a0, 0.5 * (a0 + a1), a1)):
                edge = (r in (0, 2) or c in (0, 2))
                g[r][c] = trim.vert(coat_pt(a, z, off if not edge else off * 0.75), coat_w(a, z), paint * (0.85 if edge else 1.0))
        rim = [g[0][0], g[0][1], g[0][2], g[1][2], g[2][2], g[2][1], g[2][0], g[1][0]]
        for k in range(8): trim.face([rim[k], rim[(k + 1) % 8], g[1][1]], out=coat_pt(0.5 * (a0 + a1), z0, 1.0) - V(0, 0.01, z0))
        base = [trim.vert(coat_pt(a, z, -0.002), coat_w(a, z), 0.6) for (a, z) in ((a0, z0), (0.5 * (a0 + a1), z0), (a1, z0), (a1, 0.5 * (z0 + z1)), (a1, z1), (0.5 * (a0 + a1), z1), (a0, z1), (a0, 0.5 * (z0 + z1)))]
        trim.bridge(base, rim)
    # a sash of the same cloth, sagging at the front, tied on the left hip with two short flat ends
    zs_ = lambda a: 1.012 - 0.030 * (0.5 + 0.5 * math.cos(math.radians(a))) + 0.012 * (0.5 - 0.5 * math.cos(math.radians(a)))
    sr = []
    for dz, off, p in ((0.026, 0.004, 0.8), (0.0, 0.014, 1.0), (-0.026, 0.005, 0.72)):
        sr.append(trim.ring([coat_pt(a, zs_(a) + dz, off) for a in ANG], lambda p_, i, dz=dz: coat_w(ANG[i], zs_(ANG[i]) + dz), p))
    trim.bridge(sr[1], sr[0]); trim.bridge(sr[2], sr[1])
    ka = 38.0; kc = coat_pt(ka, zs_(ka), 0.022); kw = coat_w(ka, zs_(ka))
    lump = [kc + V(dx, 0, dz) for dx, dz in ((-.022, 0), (0, -.020), (.022, 0), (0, .020))]
    lv = trim.ring(lump, kw, 0.9); trim.fan(lv, kc + V(0.004, -0.016, 0), kw, out=V(0.4, -1, 0))
    for (dx, ln, sw) in ((-0.014, 0.13, -0.02), (0.016, 0.10, 0.03)):
        q0 = kc + V(dx, 0, -0.012); pv_ = None
        for t, w_, p in ((0.0, .011, 0.8), (0.5, .013, 0.95), (1.0, .015, 0.85)):
            z_ = q0.z - ln * t; c = coat_pt(ka + dx * 200 + sw * 200 * t, z_, 0.012)
            sec = [trim.vert(c + V(-w_, 0, 0), coat_w(ka, z_), p * 0.85), trim.vert(c + V(0, -0.004, 0), coat_w(ka, z_), p), trim.vert(c + V(w_, 0, 0), coat_w(ka, z_), p * 0.85)]
            if pv_: trim.bridge(pv_, sec, closed=False, out=V(0.4, -1, 0))
            pv_ = sec
    parts.append(trim)
    tog = Part("coat_toggle", "leather")
    for z in (1.235, 1.115, 0.900):
        c = coat_pt(10.5, z, 0.008); w = coat_w(10.5, z)
        a = [tog.vert(c + V(-0.019, 0, dz) + V(0, dy, 0), w, p) for dy, dz, p in ((0.002, -0.007, 0.8), (-0.011, 0, 1.0), (0.002, 0.007, 0.9))]
        b = [tog.vert(c + V(0.019, 0, dz) + V(0, dy - 0.003, 0), w, p) for dy, dz, p in ((0.002, -0.007, 0.8), (-0.011, 0, 1.0), (0.002, 0.007, 0.9))]
        tog.bridge(a, b, out=V(0, -1, 0)); tog.face(a, out=V(-1, 0, 0)); tog.face(b, out=V(1, 0, 0))
    parts.append(tog)


# ---------------------------------------------------------------------------------------------------- limbs
def _ring_pts(c, d, r, n, mods=None, squash=1.0, phase=0.0):
    """n points round centre c in the plane across direction d. Angle 0 = toward +X (the figure's left), 90 = front."""
    d = d.normalized(); ax = V(1, 0, 0) - d * d.x; ax.normalize(); ay = d.cross(ax)
    if ay.y > 0: ay = -ay
    pts = []
    for i in range(n):
        a = 2 * math.pi * (i + phase) / n; rr = r + (mods(i, a) if mods else 0.0)
        pts.append(c + ax * (math.cos(a) * rr * squash) + ay * (math.sin(a) * rr))
    return pts


def build_arm(parts, sd, lo=False, sides=None, thumb=False):
    """sides / thumb (pass i1, the table static): a rounder sleeve, and a mitten with its thumb lying beside the palm."""
    s = SIDE[sd]; n = sides or (8, 5, 4, 4)[int(lo)]
    ua, fa, ha = J[f"upperarm_{sd}"], J[f"forearm_{sd}"], J[f"hand_{sd}"]
    du = (fa - ua).normalized(); df = (ha - fa).normalized(); dm = (du + df).normalized()
    U, F, S, C = f"upperarm_{sd}", f"forearm_{sd}", f"shoulder_{sd}", "chest"
    sl = Part(f"sleeve_{sd}", "workcloth", cloth="sleeve")
    SA = [-180.0 + 360.0 * i / n for i in range(n)]                    # round the arm; the seam of the unrolled cloth at i = 0
    ST = [0.0, 0.07, 0.20, 0.35, 0.43, 0.50, 0.56, 0.70, 0.85, 0.94]   # along it, one per section of `spec`
    zig = lambda amp: (lambda i, a: amp * (1 if i % 2 else -1))
    elbow = lambda i, a: 0.013 * max(0.0, -math.sin(a)) ** 2            # the point of the elbow (back)
    spec = [(ua + du * -0.012 + V(-0.022 * s, 0, 0), du, .050, {S: .5, C: .5}, None, 1.0),
            (ua + du * 0.040 + V(0.006 * s, 0, 0), du, .069, {U: .55, S: .45}, None, 1.0),
            (ua + du * 0.125, du, .060, {U: 1}, zig(0.002), 1.0),
            (ua + du * 0.215, du, .055, {U: 1}, zig(0.004), 1.0),
            (ua + du * 0.262, du, .054, {U: .75, F: .25}, zig(-0.004), 1.0),
            (fa, dm, .056, {U: .5, F: .5}, elbow, 1.0),
            (fa + df * 0.036, df, .052, {F: .8, U: .2}, zig(0.004), 1.0),
            (fa + df * 0.125, df, .051, {F: 1}, zig(-0.003), 1.0),
            (fa + df * 0.205, df, .060, {F: 1}, zig(0.003), 1.0),
            (fa + df * 0.258, df, .071, {F: 1}, zig(0.005), 0.94)]
    if lo:
        keep = (0, 1, 3, 5, 7, 9) if int(lo) == 1 else (0, 1, 5, 9)
        spec = [spec[i] for i in keep]; ST = [ST[i] for i in keep]
    rings = []
    for (c, d, r, w, mods, p), st in zip(spec, ST):
        if lo and mods is not elbow: mods = None
        pts = _ring_pts(c, d, r, n, mods)
        pv = [p * (0.86 if (mods and mods(i, 0) < 0 and mods is not elbow) else 1.0) for i in range(n)]
        if lo and sides:                                              # painted: the crook of the elbow and the under side of the sleeve hold shade
            pv = [p * (0.80 if c is fa else 1.0) * (0.84 if math.sin(2 * math.pi * i / n) > 0.5 else 1.0) for i in range(n)]
        rings.append(sl.at(sl.ring(pts, w, pv), SA, st))
    for a, b in zip(rings, rings[1:]): sl.bridge(a, b)
    sl.at([sl.fan(rings[0], ua + V(-0.012 * s, 0, 0.030), {S: .6, C: .4}, out=V(0, 0, 1))], None, 0.0)
    inner = sl.at(sl.ring(_ring_pts(fa + df * 0.236, df, .056, n), {F: 1}, 0.35), SA, -1.0)
    sl.bridge(rings[-1], inner, out=df)
    if not lo:
        deep = sl.at(sl.ring(_ring_pts(fa + df * 0.20, df, .040, n), {F: 1}, 0.25), SA, -1.0)
        sl.bridge(inner, deep, inward=True)
    parts.append(sl)
    # the hand: a mitten bound in strips of straining cloth. No fingers, no skin
    H = {f"hand_{sd}": 1.0}
    tip = TIP[f"hand_{sd}"]; dh = (tip - ha).normalized()
    wy = V(0, -1, 0) - dh * (-dh.y); wy.normalize(); tx = V(s, 0, 0) - dh * (dh.x * s); tx = (tx - wy * tx.dot(wy)).normalized()
    A6 = [90, 30, -30, -90, -150, 150]                                  # 90 = the thumb edge (front), 0 = back of the hand (outside)

    def hring(part, t, hw, ht, grow=0.0, skew=0.0, thumb=0.0, paint=1.0):
        pts = []
        for a in A6:
            ar = math.radians(a); cs, sn = math.cos(ar), math.sin(ar)
            tt = t + skew * sn
            w_ = (hw + grow) * sn + (thumb if a == 90 else 0.0); th = (ht + grow) * cs
            pts.append(ha + dh * tt + wy * w_ + tx * th)
        return part.ring(pts, H if t > 0.0 else {f"hand_{sd}": .6, F: .4}, paint)

    mitt = Part(f"mitt_{sd}", "cord"); wrap = Part(f"wrap_{sd}", "linen")
    prof = lambda t: (0.030 + 0.017 * _ss(0.0, 0.09, t) - 0.021 * _ss(0.13, 0.214, t), 0.029 - 0.010 * _ss(0.0, 0.08, t) - 0.007 * _ss(0.12, 0.214, t))
    if lo:                                                            # one bound mitten: three hard-edged bands (cloth, cord-dark gap, cloth)
        A6[:] = [90, 0, -90, 180]
        hand = Part(f"wrap_{sd}", "linen"); gap = Part(f"mitt_{sd}", "cord")
        th_ = lambda t: (0.012 if 0.05 < t < 0.14 else 0.0)
        bands3 = ((hand, -0.02, 0.072, 0.004, 0.62, 0.95), (gap, 0.072, 0.118, 0.0, 0.55, 0.62), (hand, 0.118, 0.205, 0.004, 0.95, 0.80))
        for part, t0, t1, g, p0, p1 in (bands3 if int(lo) < 3 else ((gap, -0.02, 0.060, 0.0, 0.55, 0.62), (hand, 0.060, 0.205, 0.004, 0.95, 0.80))):
            ra = hring(part, t0, *prof(t0), grow=g, skew=0.010, thumb=th_(t0), paint=p0)
            rb = hring(part, t1, *prof(t1), grow=g, skew=0.010, thumb=th_(t1), paint=p1)
            part.bridge(ra, rb)
            if t1 > 0.2: part.fan(rb, ha + dh * 0.216 + wy * 0.004, H, out=dh)
        if thumb:                                                     # the thumb: a bound stub lying along the palm's front edge
            b0 = ha + dh * 0.050 + wy * (prof(0.05)[0] + 0.002); b1 = ha + dh * 0.128 + wy * (prof(0.128)[0] + 0.026)
            sec = lambda c, r: [c + tx * r, c + wy * r * 0.9, c - tx * r, c - wy * r * 0.2]
            ra = hand.ring(sec(b0, 0.015), H, 0.72); rb = hand.ring(sec(b1, 0.012), H, 0.92)
            hand.bridge(ra, rb); hand.fan(rb, b1 + dh * 0.014 + wy * 0.003, H, 0.86, out=dh)
        parts += [gap, hand]; return
    bands = [("w", -0.022, 0.034), ("m", 0.034, 0.066), ("w", 0.066, 0.112), ("m", 0.112, 0.146), ("w", 0.146, 0.186), ("m", 0.186, 0.207)]
    for kind, t0, t1 in bands:
        part = wrap if kind == "w" else mitt; g = 0.004 if kind == "w" else 0.0
        sk = 0.010 if kind == "w" else 0.010
        th0 = 0.014 if 0.05 < t0 < 0.12 else (0.006 if 0.02 < t0 < 0.14 else 0.0); th1 = 0.014 if 0.05 < t1 < 0.12 else (0.006 if 0.02 < t1 < 0.14 else 0.0)
        ra = hring(part, t0, *prof(t0), grow=g, skew=sk, thumb=th0, paint=0.80 if kind == "w" else 0.62)
        rb = hring(part, t1, *prof(t1), grow=g, skew=sk, thumb=th1, paint=0.92 if kind == "w" else 0.72)
        part.bridge(ra, rb)
        if kind == "m" and t1 > 0.2: part.fan(rb, ha + dh * 0.216 + wy * 0.004, H, out=dh)
    # pass i2 (the reviewer: "hands with a mitten split"): the thumb, a bound stub lying along the front edge of the palm
    b0 = ha + dh * 0.046 + wy * (prof(0.046)[0] + 0.004); b1 = ha + dh * 0.092 + wy * (prof(0.092)[0] + 0.022); b2 = ha + dh * 0.138 + wy * (prof(0.138)[0] + 0.030)
    sec = lambda c, r: [c + tx * r, c + wy * r * 0.9, c - tx * r, c - wy * r * 0.35]
    ra = wrap.ring(sec(b0, 0.016), H, 0.70); rb = mitt.ring(sec(b1, 0.0145), H, 0.66)
    wrap.bridge(ra, wrap.ring(sec(b1, 0.0150), H, 0.92))
    rc = mitt.ring(sec(b2, 0.0115), H, 0.74)
    mitt.bridge(rb, rc); mitt.fan(rc, b2 + dh * 0.014 + wy * 0.003, H, 0.70, out=dh)
    parts += [mitt, wrap]


def build_leg(parts, sd, rng, lo=False, least=False):
    """least (pass i1): the legs of the figure at the table, which stand in the dark under it: a thigh, a shin, a boot."""
    s = SIDE[sd]; n = (8, 5, 4, 4)[int(lo)]
    th, sh, ft = J[f"thigh_{sd}"], J[f"shin_{sd}"], J[f"foot_{sd}"]
    dt = (sh - th).normalized(); ds_ = (ft - sh).normalized(); dm = (dt + ds_).normalized()
    T_, S_, F_ = f"thigh_{sd}", f"shin_{sd}", f"foot_{sd}"
    knee = lambda i, a: 0.013 * max(0.0, math.sin(a)) ** 2              # the kneecap (front)
    calf = lambda i, a: 0.009 * max(0.0, -math.sin(a)) ** 2
    bag = lambda i, a: 0.004 * (1 if i % 2 else -1)
    up = Part(f"trouser_{sd}", "workcloth_light")
    spec_u = [(th + dt * 0.10, dt, .086, {T_: 1}, None, 0.8), (th + dt * 0.255, dt, .075, {T_: 1}, bag, 1.0),
              (th + dt * 0.352, dt, .068, {T_: 1}, bag, 1.0)]
    if lo: spec_u = [spec_u[0], spec_u[2]] if (int(lo) < 3 and not least) else [spec_u[0]]
    ku = lambda p, i: ({T_: .68, S_: .32} if (p - sh).y < 0.0 else {T_: .5, S_: .5})
    ru = [up.ring(_ring_pts(c, d, r, n, m), w, [p * (0.87 if (m is bag and i % 2 == 0) else 1.0) for i in range(n)]) for c, d, r, w, m, p in spec_u]
    kr = up.ring(_ring_pts(sh, dm, .066, n, knee), ku)
    for a, b in zip(ru + [kr], (ru + [kr])[1:]): up.bridge(a, b)
    # from the knee down the cloth goes the colour of the ground: these faces point at the `sand` cell
    lo_ = Part(f"trouser_low_{sd}", "#6A4E3B", cell="sand")       # between workcloth and workcloth_light: the shin stays darker than sand
    kr2 = lo_.ring([v.co.copy() for v in kr], ku)
    spec_l = [(sh + ds_ * 0.050, ds_, .061, {S_: .85, T_: .15}, None, 1.0), (sh + ds_ * 0.165, ds_, .059, {S_: 1}, calf, 1.0),
              (sh + ds_ * 0.245, ds_, .067, {S_: 1}, bag, 1.0), (sh + ds_ * 0.285, ds_, .050, {S_: 1}, None, 0.7)]
    if lo: spec_l = [spec_l[1], spec_l[3]] if not least else [spec_l[3]]
    rl = [kr2] + [lo_.ring(_ring_pts(c, d, r, n, m), w, [p * (0.87 if (m is bag and i % 2 == 0) else 1.0) for i in range(n)]) for c, d, r, w, m, p in spec_l]
    for a, b in zip(rl, rl[1:]): lo_.bridge(a, b)
    parts += [up, lo_]
    if sd == "l" and not lo:                                                     # a mended knee
        pt = Part("knee_patch", "workcloth", cell="sand")
        g = []
        for (t, r) in ((-0.045, .0745), (0.0, .084), (0.05, .067)):
            c = sh + (dt * t if t < 0 else ds_ * t)
            row = [pt.vert(c + V(math.sin(math.radians(a)) * r * 0.95, -math.cos(math.radians(a)) * r, 0), ku(V(0, -1, 0) + sh, 0) if t == 0 else ({T_: 1} if t < 0 else {S_: .85, T_: .15}), 1.0 if abs(a) < 30 else 0.85)
                   for a in (-38, 0, 40)]
            g.append(row)
        for r0, r1 in zip(g, g[1:]): pt.bridge(r0, r1, closed=False, out=V(0, -1, 0))
        parts.append(pt)
    # the boot: a leather shaft with a turned cuff, a foot with a heel block and a worn toe
    boot = Part(f"boot_{sd}", "#4E3222", cell="sand")
    cx = ft.x; cy = ft.y
    shaft = [(0.222, .067, {S_: 1}, 1.0, 0.006), (0.150, .059, {S_: 1}, 1.0, 0.0), (0.100, .055, {S_: .5, F_: .5}, 0.95, 0.0), (0.040, .050, {F_: 1}, 0.9, 0.0)]
    if lo: shaft = [shaft[0], shaft[2], shaft[3]] if int(lo) == 1 else [shaft[0], shaft[3]]
    rs = []
    for z, r, w, p, jit in shaft:
        k = (0.222 - z) / 0.134
        c = V(cx, cy + 0.004 - 0.012 * (1 - min(1.0, k)), z)
        rs.append(boot.ring(_ring_pts(c, V(0, 0, -1), r, n, (lambda i, a, j=jit: j * (1 if i % 2 else -0.6)) if jit else None), w, p))
    if least != "no_shaft":
        for a, b in zip(rs, rs[1:]): boot.bridge(a, b)
    if not lo:
        lip = boot.ring(_ring_pts(V(cx, cy - 0.006, 0.212), V(0, 0, -1), .053, n), {S_: 1}, 0.4)
        boot.bridge(rs[0], lip, out=V(0, 0, 1))
    secs = list(BOOT_SECS)
    if lo: secs = [secs[0], secs[2], secs[3], secs[5]] if int(lo) == 1 else ([secs[0], secs[2], secs[5]] if not least else [secs[0], secs[4]])
    prev = None; first = None
    for y, hw, top, lift in secs:
        if int(lo) >= 2:                                              # four corners: sole, sole, upper, upper
            pts = [V(cx - hw * .9, cy + y, lift), V(cx + hw * .9, cy + y, lift), V(cx + hw * .66, cy + y, top), V(cx - hw * .66, cy + y, top)]
            sec = boot.ring(pts, {F_: 1}, [0.55, 0.55, 1.0, 1.0])
        else:
            pts = [V(cx - hw * .86, cy + y, lift), V(cx + hw * .86, cy + y, lift), V(cx + hw, cy + y, lift + 0.022), V(cx + hw * .58, cy + y, top),
                   V(cx - hw * .58, cy + y, top), V(cx - hw, cy + y, lift + 0.022)]
            sec = boot.ring(pts, {F_: 1}, [0.55, 0.55, 0.8, 1.0, 1.0, 0.8])
        if prev: boot.bridge(prev, sec)
        else: first = sec
        prev = sec
    boot.face(first, out=V(0, 1, 0)); boot.face(prev, out=V(0, -1, 0))
    parts.append(boot)


# ---------------------------------------------------------------------------------------------------- the knot
KNOT_TILT = 18.0                     # degrees forward of straight up, in the head's design frame: forward of the crown seam
DOME_C = V(0.0, -0.009, 1.555); DOME_R = V(0.170, 0.156, 0.167)


def dome_pt(d, off=0.0):
    """The point of the hood's dome (an ellipsoid) in direction d from its centre, `off` metres proud."""
    d = d.normalized()
    r = 1.0 / math.sqrt((d.x / DOME_R.x) ** 2 + (d.y / DOME_R.y) ** 2 + (d.z / DOME_R.z) ** 2)
    return DOME_C + d * (r + off)


def build_knot(parts, radius=0.123, emissive=True, seed=7):
    """lib.knot's clustered knot on the crown, forward of the seam, WRAPPED over the dome of the hood by arc length (a
    growth on cloth, not a plate on a machine); faces that lie against the cloth are removed. Returns the centre of
    the knot in the design pose (the `crown` socket)."""
    k = knot.build_knot(radius, 'clustered', seed=seed, name="crown_knot")
    lobes, collar = k["lobes"], k["collar"]
    a = V(0, -math.sin(math.radians(KNOT_TILT)), math.cos(math.radians(KNOT_TILT)))
    ex = V(1, 0, 0); ez = ex.cross(-a)                                   # knot-local X and Z on the dome
    Rm = 0.165
    for ob, sink in ((collar, 0.006), (lobes, 0.010)):
        mesh.delete_faces(ob, lambda f, c, nrm: nrm.y > 0.55)                          # against the cloth: never seen
        me = ob.data
        for v in me.vertices:
            p = v.co; rho = math.hypot(p.x, p.z); out = -p.y
            if rho < 1e-7: d = a.copy()
            else:
                lat = (ex * p.x + ez * p.z) / rho; th = rho / Rm
                d = a * math.cos(th) + lat * math.sin(th)
            v.co = dome_pt(d, out - sink)
        me.update()
        for g in BONES: ob.vertex_groups.new(name=g)
        ob.vertex_groups["head"].add(range(len(me.vertices)), 1.0, 'REPLACE')
    # palette cells: the lib mapped the lobes to `violet` and the central lobe to `violet_core` (husk grey albedo, the
    # violet in the emissive sheet only). _dress points everything at plain `husk` (a burst knot): put the live cells back
    pa = vcol.get_colors(lobes, "Color").copy(); live_uv = uv.get(lobes).copy()
    _dress(lobes, "husk", "husk", smooth=20, paint_from=pa)
    if emissive: uv.put(lobes, live_uv)
    pc = vcol.get_colors(collar, "Color").copy()
    _dress(collar, "cable", "cable", smooth=25, paint_from=pc)
    parts += [collar, lobes]
    return dome_pt(a, 0.716 * radius - 0.010)


def build_knot_lo(parts, radius=0.123, emissive=True, seed=7):
    """The knot of the static derivatives, about 75 triangles: the same picture (a dark seven-lobed collar, six lobes
    round a large central one, wrapped over the dome). ONE connected, smooth-shaded rosette (rim, lobe crowns and the
    valleys between them, a groove, the core), not separate spikes: at 500 triangles it has to read as a lump of
    growth, never as shards."""
    rng = scene.rng(seed)
    a = V(0, -math.sin(math.radians(KNOT_TILT)), math.cos(math.radians(KNOT_TILT)))
    ex = V(1, 0, 0); ez = ex.cross(-a); Rm = 0.165; H = {"head": 1.0}

    def at(rho, ang, out):
        th = rho / Rm; lat = ex * math.cos(ang) + ez * math.sin(ang)
        return dome_pt(a * math.cos(th) + lat * math.sin(th), out)
    collar = Part("crown_knot_collar", "cable"); R = radius * 1.3
    rim = collar.ring([at(R * (1.0 if i % 2 else 0.80) * rng.uniform(0.92, 1.06), 2 * math.pi * i / 14, 0.001) for i in range(14)], H, 0.75)
    mid = collar.ring([at(R * 0.66, 2 * math.pi * i / 14, radius * 0.24) for i in range(14)], H, 1.0)
    collar.bridge(rim, mid)
    lobes = Part("crown_knot_live", "husk", cell=("violet" if emissive else "husk"))
    core = Part("crown_knot_core", "husk", cell=("violet_core" if emissive else "husk"))
    ph = [rng.uniform(-0.10, 0.10) for _ in range(6)]; hgt = [rng.uniform(0.46, 0.56) for _ in range(6)]; wid = [rng.uniform(0.96, 1.06) for _ in range(6)]
    ang = lambda i: 2 * math.pi * (i / 12.0) + (ph[i // 2] * 0.5 if i % 2 == 0 else 0.0)                 # even = a lobe, odd = the valley after it
    r_rim = lobes.ring([at(radius * (1.00 * wid[i // 2] if i % 2 == 0 else 0.80), ang(i), radius * 0.13) for i in range(12)], H, 0.62)
    r_mid = lobes.ring([at(radius * (0.74 if i % 2 == 0 else 0.66), ang(i), radius * (hgt[i // 2] if i % 2 == 0 else 0.30)) for i in range(12)], H,
                       [1.0 if i % 2 == 0 else 0.60 for i in range(12)])
    lobes.bridge(r_rim, r_mid)
    gpt = [at(radius * 0.50, ang(2 * k + 1), radius * 0.44) for k in range(6)]
    grv = lobes.ring(gpt, H, 0.66)
    for k in range(6):
        m0, m1, m2 = r_mid[2 * k], r_mid[2 * k + 1], r_mid[(2 * k + 2) % 12]
        lobes.face([m0, m1, grv[k]], out=a); lobes.face([m1, m2, grv[k]], out=a)
        lobes.face([m0, grv[k], grv[(k - 1) % 6]], out=a)
    cr = core.ring([p.copy() for p in gpt], H, 0.85)
    core.fan(cr, at(0, 0, radius * 0.86), H, out=a)                       # as tall as the skinned knot: the statics' bounds match the clip pose
    parts += [collar, lobes, core]
    return dome_pt(a, 0.716 * radius - 0.010)


def build_knot_bound(parts, radius=0.123, emissive=True, detail=2, seed=7):
    """Pass i3 (both visual reviewers: "a flat-shaded violet and white gem ... a placeholder marker, not a knot"). The
    crown knot as BOUND GLASS: a clouded glass bead with a light in it, seated in a grommet of two turns of tarred cord
    and lashed down by three cords, the cord's own tie and two ends on the hood. Every surface is smooth-shaded and
    points its UV0 into the painted top view of blender/tex/knot_atlas.py (albedo in tx_palette, the light in the glass
    in tx_palette_emis: a white heart, violet, deep violet at the rim, black on the cords), so the form is carried by a
    picture and a silhouette, not by flat emissive facets. The same footprint as the old knot (grommet = the old collar,
    1.3 x radius), the same height (0.86 x radius), the same `crown` point. Wrapped over the hood's dome by arc length.

    detail 0: the freed statics (72 triangles: the bead and the grommet; the lashings are painted)
           1: the nine at the table (240: + the three lashings as geometry)
           2: the skinned Bider (about 400: + rounder, the tie and its two ends)
    emissive False = the knot of a freed Bider: the same picture with no light in the glass (`knot_dead`)."""
    rng = scene.rng(seed)
    a = V(0, -math.sin(math.radians(KNOT_TILT)), math.cos(math.radians(KNOT_TILT)))
    ex = V(1, 0, 0); ez = ex.cross(-a); Rm = 0.165; H = {"head": 1.0}; r = radius
    dd = "" if emissive else "_dead"

    def at(rho, ang, out):
        """rho knot radii from the middle (arc length on the dome), ang degrees (0 = the figure's left, 90 = its back), out knot radii proud."""
        th = rho * r / Rm; an = math.radians(ang); lat = ex * math.cos(an) + ez * math.sin(an)
        return dome_pt(a * math.cos(th) + lat * math.sin(th), out * r)
    N = (8, 12, 16)[detail]
    RG = kn.R_GLASS; G0, GA = 0.16, 0.86
    def glass_h(rho): return G0 + (GA - G0) * math.sqrt(max(0.0, 1.0 - min(rho / RG, 1.0) ** 2))
    # ---- the glass: a dome whose rim is tucked under the grommet
    bead = Part("crown_knot_live", "chalk", cloth="knot" + dd); bead.smooth = 80
    prev = None
    for k, ph in enumerate(((0, 38, 66), (0, 30, 56, 76), (0, 28, 54, 76))[detail]):
        q = math.cos(math.radians(ph)); an = [360.0 * (i + 0.5 * (k % 2)) / N for i in range(N)]
        ring = bead.ring([at(RG * q, an[i], glass_h(RG * q)) for i in range(N)], H, 0.82 if k == 0 else 1.0)
        bead.at(ring, an, RG * q)
        if prev is not None: bead.bridge(prev, ring, out=a)
        prev = ring
    top = bead.fan(prev, at(0, 0, GA), H, out=a); bead.at([top], None, 0.0)
    # ---- the grommet: two turns of cord (one rounded ring with a groove between the turns)
    # (the paint is over 1 on purpose: the ring lies in the shade of the bead and of the hood's own crown, and baked
    # occlusion at 0.9 drew it as a black band; a rope has to show its lay)
    # (and it lies LOW: at 0.36 of the radius the ring and the dome over it drew a little round hat)
    sec = ([(0.78, 0.13, 0.80), (0.985, 0.29, 1.55), (1.30, 0.0, 0.85)] if detail == 0 else
           [(0.78, 0.13, 0.70), (0.905, 0.30, 1.55), (1.025, 0.215, 0.95), (1.150, 0.245, 1.55), (1.30, 0.0, 0.75)])
    grom = Part("crown_knot_collar", "chalk", cloth="knot" + dd); grom.smooth = 80
    wob = [rng.uniform(-0.025, 0.025) for _ in range(N)]
    prev = None
    for k, (rho, h, pt) in enumerate(sec):
        an = [360.0 * i / N for i in range(N)]
        ring = grom.ring([at(rho + (wob[i] if 0 < k < len(sec) - 1 else 0.0), an[i], max(h + wob[i] * 0.8, 0.008) if h > 0 else 0.008) for i in range(N)], H, pt)
        grom.at(ring, an, rho)
        if prev is not None: grom.bridge(prev, ring, out=a)
        prev = ring
    out_parts = [grom, bead]
    # ---- the three lashings over the glass: ridged cords that dive under the grommet at both ends
    if detail >= 1:
        lash = Part("crown_knot_lash", "chalk", cloth="kcord" + dd); lash.smooth = 80
        K = 5 if detail == 1 else 6; W = kn.LASH_W * 1.10
        def hc(rho): return max(glass_h(min(rho, RG * 0.999)) + 0.050, 0.13 + (rho - 0.78) * 1.35)
        def pol(x, y): return math.hypot(x, y), math.degrees(math.atan2(y, x))
        for a0, D in kn.LASH:
            nx, ny = math.cos(math.radians(a0)), math.sin(math.radians(a0)); tx, ty = -ny, nx
            L = math.sqrt(0.90 ** 2 - D ** 2); rows = []
            for j in range(K + 1):
                s = -L + 2.0 * L * j / K; row = []
                for side, lift, tt in ((-1.0, -0.062, 0.0), (0.0, 0.022, 0.5), (1.0, -0.062, 1.0)):
                    x = nx * (D + side * W) + tx * s; y = ny * (D + side * W) + ty * s
                    rho, an = pol(x, y)
                    v = lash.vert(at(rho, an, hc(rho) + lift), H, 1.45 if side == 0.0 else 0.55)
                    lash.at([v], j / K * 1.0, tt); row.append(v)
                rows.append(row)
            for j in range(K):
                for c in (0, 1): lash.face([rows[j][c], rows[j][c + 1], rows[j + 1][c + 1], rows[j + 1][c]], out=a)
        out_parts.append(lash)
    # ---- the tie: where the cord is made fast, on the grommet over the left temple (clear of the slits), and its two ends lying on the hood
    if detail >= 2:
        tie = Part("crown_knot_tie", "chalk", cloth="kcord" + dd); tie.smooth = 80
        A0, RH, HH, RL = -14.0, 1.13, 0.24, 0.19
        def lump(ph, th, hh):
            rho = RH + RL * math.sin(math.radians(ph)) * math.cos(math.radians(th))
            an = A0 + math.degrees(RL * math.sin(math.radians(ph)) * math.sin(math.radians(th)) / RH)
            return at(rho, an, hh)
        prev = None
        for k, (ph, hh, pt) in enumerate(((100, HH - 0.05, 0.42), (62, HH + 0.13, 0.95))):
            ring = tie.ring([lump(ph, 60.0 * i + 30.0 * k, hh) for i in range(6)], H, pt)
            tie.at(ring, [i / 6.0 for i in range(6)], 0.12 if k == 0 else 0.40)
            if prev is not None: tie.bridge(prev, ring, out=a)
            prev = ring
        tp = tie.fan(prev, at(RH, A0, HH + 0.22), H, out=a); tie.at([tp], None, 0.5)
        for sg, spread, ln in ((-1.0, 15.0, 1.80), (1.0, 11.0, 1.66)):
            rows = []
            for j, f in enumerate((0.0, 0.34, 0.68, 1.0)):
                rho = 1.20 + (ln - 1.20) * f; an = A0 + sg * (5.0 + spread * f ** 1.4); row = []
                for side, lift, tt in ((-1.0, 0.0, 0.0), (0.0, 0.055, 0.5), (1.0, 0.0, 1.0)):
                    w = 0.058 * (1.0 + 0.5 * f * (j == 3))                       # the end is frayed a little wider
                    h = max(0.20 * (1.0 - f) ** 2.2, 0.0) + 0.034 + lift * (1.0 - 0.3 * f)
                    v = tie.vert(at(rho, an + side * math.degrees(w / rho), h), H, (0.95 if side == 0.0 else 0.48) * (1.0 - 0.25 * (j == 3)))
                    tie.at([v], 0.15 + 0.7 * f, tt); row.append(v)
                rows.append(row)
            for j in range(3):
                for c in (0, 1): tie.face([rows[j][c], rows[j][c + 1], rows[j + 1][c + 1], rows[j + 1][c]], out=a)
        out_parts.append(tie)
    parts += out_parts
    return dome_pt(a, 0.716 * radius - 0.010)


# ====================================================================================================== assembly
def build_parts(seed=1, emissive=True, knot_radius=0.123, lo=False, coat_lo=None, opts=None):
    """Every part of the figure in the DESIGN pose (upright). -> (objects, {'crown': point, 'socket': 4x4}).
    lo = the low-detail build of the static derivatives (fewer sides and rows, no trimmings)."""
    rng = scene.rng(seed)
    parts = []
    o_ = opts or {}
    build_hood(parts, emissive, lo, o_.get("hood", 1), knot_radius)
    build_cord(parts, lo)
    build_coat(parts, rng, lo if coat_lo is None else coat_lo, o_.get("sash", True))
    for sd in "lr":
        build_arm(parts, sd, lo, o_.get("arm_sides"), o_.get("thumb", False)); build_leg(parts, sd, rng, lo, o_.get("legs_least", False))
    # pass i3: bound glass (build_knot_bound) in place of the faceted lobes of lib.knot (build_knot, build_knot_lo: kept for reference)
    crown = build_knot_bound(parts, knot_radius, emissive, detail=(int(o_.get("knot", 0)) if lo else 2))
    for p in parts:
        if isinstance(p, Part): print(f"PART {p.name}: {p.tris()} tris")
        else: print(f"PART {p.name}: {mesh.tri_count(p)} tris")
    objs = [p.finish() if isinstance(p, Part) else p for p in parts]
    # the cup socket: in the right mitten, as a mug is held (thumb up, palm inward). Blender +Z of the empty = the cup's up
    ha = J["hand_r"]; dh = (TIP["hand_r"] - ha).normalized()
    pos = ha + dh * 0.105 + V(0.052, 0.0, 0.0) + V(0, 0.035, 0)
    sock = Matrix.Translation(pos) @ Rx(90).to_4x4()
    return objs, {"crown": crown, "socket": sock}


def skin(ob, G):
    """Linear-blend skin the vertices of `ob` by its vertex groups with the bone transforms G (in Python: this is how
    the design mesh gets into the rest pose, and how the statics are posed)."""
    names = [g.name for g in ob.vertex_groups]
    for v in ob.data.vertices:
        acc = Vector((0, 0, 0)); tot = 0.0
        for g in v.groups:
            if g.weight <= 0: continue
            acc += (G[names[g.group]] @ v.co) * g.weight; tot += g.weight
        if tot <= 0: raise RuntimeError(f"{ob.name}: vertex {v.index} has no weight")
        v.co = acc / tot
    ob.data.update()


def compose(ob, z0=0.0, z1=1.45, dust=0.24, dust_h=0.46, ao_strength=0.9, jitter=0.035, seed=1):
    """COLOR_0 = (tint x AO x height ramp x painted folds x under-side shade, dusted toward `sand` from the knee down)
    divided by the colour of the palette cell the face points at."""
    me = ob.data; n = len(me.loops)
    tint = vcol.get_colors(ob, "Tint")[:, :3]; cell = vcol.get_colors(ob, "Cell")[:, :3]; paint = vcol.get_colors(ob, "Paint")[:, :3]
    ao = vcol.get_colors(ob, "AO")[:, 0:1] if "AO" in me.color_attributes else np.ones((n, 1), np.float32)
    pos = vcol.corner_positions(ob); nrm = vcol.corner_normals(ob)
    z = pos[:, 2:3]; t = np.clip((z - z0) / (z1 - z0), 0, 1)
    under = 0.76 + 0.24 * np.clip(nrm[:, 2:3] * 0.8 + 0.62, 0, 1)
    col = tint * (1 - ao_strength + ao_strength * ao) * (0.76 + 0.32 * t) * paint * under
    sand = np.asarray(manifest.palette_rgb("sand"), np.float32)[None, :]
    k = dust * np.clip(1.0 - (z - z0) / dust_h, 0, 1) ** 1.5
    k = k * (cell.sum(axis=1, keepdims=True) > 0.9 * sand.sum())               # only faces on the sand cell can go that light
    col = col * (1 - k) + sand * (0.55 + 0.45 * ao) * (0.80 + 0.2 * paint) * k
    # a little unevenness, per VERTEX (per face would split every vertex in the file: twice the download)
    rng = np.random.default_rng(seed)
    li = np.empty(n, dtype=np.int32); me.loops.foreach_get("vertex_index", li)
    col = col * (1.0 + (rng.random(len(me.vertices), dtype=np.float32)[li][:, None] - 0.5) * 2 * jitter)
    res = np.ones((n, 4), np.float32); res[:, :3] = np.clip(col / np.maximum(cell, 1e-4), 0.0, 1.0)
    vcol.set_colors(ob, res, "Color")
    for extra in [c.name for c in me.color_attributes if c.name != "Color"]: me.color_attributes.remove(me.color_attributes[extra])
    vcol.color_layer(ob, "Color")


def rest_transforms():
    import bider_clips
    return solve(bider_clips.STOOP)


def make_rig(asset, Gs):
    spec = []
    for b in BONES:
        h = Gs[b] @ J[b]; t = Gs[b] @ TIP[b]
        spec.append((b, tuple(h), tuple(t), PARENT[b]))
    return rig.make_armature(asset + "_rig", spec)


KEY_STEP = {"idle_stoop": 3, "sit_breathe": 6, "sit_table": 6, "queue_stand": 5, "scoop_kneel": 2}     # frames between solved poses


def key_clips(asset, arm, Gs):
    """Every manifest clip, sampled on every frame from bider_clips (pose numbers -> solve -> bone-local keys)."""
    import bider_clips
    S = {b: arm.data.bones[b].matrix_local.copy() for b in BONES}
    Sl = {b: (S[PARENT[b]].inverted() @ S[b] if PARENT[b] else S[b]).inverted() for b in BONES}
    GsI = {b: Gs[b].inverted() for b in BONES}
    acts = []
    for c in manifest.asset(asset)["animations"]:
        name = c["name"]; n = anim.frames(asset, name)
        act = anim.new_action(arm, name); prev = {}
        step = KEY_STEP.get(name, 1); solved = {}
        for f in list(range(0, n, step)) + [n]:
            G = solve(bider_clips.pose(name, f, n))
            M = {b: G[b] @ GsI[b] @ S[b] for b in BONES}
            pose = {}
            for b in BONES:
                Bm = Sl[b] @ ((M[PARENT[b]].inverted() @ M[b]) if PARENT[b] else M[b])
                q = Bm.to_quaternion()
                if b in prev and prev[b].dot(q) < 0: q.negate()
                prev[b] = q
                pose[b] = {"rot": q.copy()}
                if b in ("hips", "root"): pose[b]["loc"] = Vector(Bm.translation)
            solved[f] = pose
        for f in range(n + 1):
            if f in solved: pose = solved[f]
            else:                                                      # slow clips: straight lines between solved frames (the optimiser drops them)
                f0 = (f // step) * step; f1 = min(n, f0 + step); t = (f - f0) / float(f1 - f0); pose = {}
                for b in BONES:
                    a_, b_ = solved[f0][b], solved[f1][b]
                    q = Quaternion([x + (y - x) * t for x, y in zip(a_["rot"], b_["rot"])])
                    pose[b] = {"rot": q}
                    if "loc" in a_: pose[b]["loc"] = a_["loc"].lerp(b_["loc"], t)
            anim.key_pose(arm, f, pose)
        anim.set_interpolation(act, 'LINEAR')
        acts.append(act)
    anim.push_to_nla(arm, acts)


def clip_report(asset, body, Gs, info):
    """Measured facts per clip, printed into the build log (blender/export/.logs/enemy_bider.log): the lowest vertex
    and where, the height range of the crown, the extremes of the hands and the cup socket. For the animator."""
    import bider_clips
    me = body.data; nv = len(me.vertices)
    P0 = np.ones((nv, 4)); W = np.zeros((nv, len(BONES)))
    names = [g.name for g in body.vertex_groups]
    for v in me.vertices:
        P0[v.index, :3] = v.co
        for g in v.groups:
            if names[g.group] in BI: W[v.index, BI[names[g.group]]] = g.weight
    W /= W.sum(axis=1, keepdims=True)
    dom = W.argmax(axis=1)
    GsI = {b: Gs[b].inverted() for b in BONES}
    crown0 = Gs["head"] @ info["crown"]; sock0 = (Gs["hand_r"] @ info["socket"]).translation
    for c in manifest.asset(asset)["animations"]:
        name = c["name"]; n = anim.frames(asset, name)
        zmin = (9, 0, ""); cz = []; hl = []; hr = []; sk = []; fwd = []; last = ""
        for f in range(n + 1):
            G = solve(bider_clips.pose(name, f, n))
            pos = np.zeros((nv, 3))
            for b in BONES:
                M = np.array(G[b] @ GsI[b]); pos += W[:, BI[b]:BI[b] + 1] * (P0 @ M.T)[:, :3]
            i = int(pos[:, 2].argmin())
            if pos[i, 2] < zmin[0]: zmin = (float(pos[i, 2]), f, BONES[dom[i]])
            if f == n:
                lowb = {}
                for j in np.nonzero(pos[:, 2] < -0.004)[0]: lowb[BONES[dom[j]]] = min(lowb.get(BONES[dom[j]], 0), float(pos[j, 2]))
                last = " ".join(f"{k} {v:+.3f}" for k, v in sorted(lowb.items()))
            cz.append((G["head"] @ GsI["head"] @ crown0).z)
            hl.append((G["forearm_l"] @ J["hand_l"]).z); hr.append((G["forearm_r"] @ J["hand_r"]).z)
            sk.append((G["hand_r"] @ GsI["hand_r"] @ sock0))
            fwd.append(G["head"].to_3x3() @ V(0, -1, 0))
        k12 = sk[min(12, n)]
        print(f"CLIP {name:15s} {n:3d}f  lowest z {zmin[0]:+.3f} (f{zmin[1]}, {zmin[2]})  crown z {min(cz):.3f}..{max(cz):.3f}  "
              f"hand_l z {min(hl):.3f}..{max(hl):.3f} hand_r z {min(hr):.3f}..{max(hr):.3f}  socket f12 ({k12.x:.3f}, {k12.y:.3f}, {k12.z:.3f})  "
              f"hood front, last frame ({fwd[-1].x:+.2f}, {fwd[-1].y:+.2f}, {fwd[-1].z:+.2f})  under ground at the end: {last or 'nothing'}")


def build_skinned(asset, args):
    Gs = rest_transforms()
    objs, info = build_parts(args.seed)
    for o in objs: skin(o, Gs)
    body = mesh.join(objs, asset + "_mesh")
    arm = make_rig(asset, Gs)
    rig.bind(body, arm)
    vcol.bake_ao_vertex([body], distance=0.35)
    compose(body, seed=args.seed)
    crown = export.marker("crown", tuple(Gs["head"] @ info["crown"])); rig.parent_to_bone(crown, arm, "head")
    sock = export.marker("hand_socket_r", (0, 0, 0)); sock.matrix_world = Gs["hand_r"] @ info["socket"]
    rig.parent_to_bone(sock, arm, "hand_r")
    mn, mx = mesh.bounds(body); c = Gs["head"] @ info["crown"]
    print(f"BIDER rest: bounds x {mn.x:.3f}..{mx.x:.3f}  y {mn.y:.3f}..{mx.y:.3f}  z {mn.z:.3f}..{mx.z:.3f}; crown ({c.x:.3f}, {c.y:.3f}, {c.z:.3f}); "
          f"hood top z {(Gs['head'] @ HOOD_TOP).z:.3f}; tris {mesh.tri_count(body)}")
    key_clips(asset, arm, Gs)
    clip_report(asset, body, Gs, info)
    return body, arm


def build_static(asset, args, clip, frame, budget, emissive, knot_radius=0.123, breath=False, lo=2, coat_lo=None, seat=None, opts=None):
    """The same figure, posed at `frame` of `clip` exactly as the runtime skins it, decimated to `budget` triangles."""
    import bider_clips
    Gs = rest_transforms(); nod = bool((opts or {}).get("nod"))
    n = anim.frames("enemy_bider", clip)
    Gp = solve(bider_clips.pose(clip, n if frame < 0 else frame, n))
    rel = {b: Gp[b] @ Gs[b].inverted() for b in BONES}
    objs, info = build_parts(args.seed, emissive=emissive, knot_radius=knot_radius, lo=lo, coat_lo=coat_lo, opts=opts)
    moved = 0
    for o in objs:
        skin(o, Gs); skin(o, rel)
        # a static is cloth at rest: what the one-bone tails and the stiff skirt push through the floor (or through the
        # chair it sits on: seat = (x0, y0, x1, y1, top, back) in Blender space) is laid ON it instead
        for v in o.data.vertices:
            c = v.co
            if c.z < 0.003: c.z = 0.003 + 0.25 * max(-0.012, c.z); moved += 1
            if seat is not None:
                x0, y0, x1, y1, top, back = seat
                if x0 < c.x < x1 and y0 < c.y and top - 0.22 < c.z < top + 0.006 and c.y < y1: c.z = top + 0.006; moved += 1
                if c.y > back and top < c.z < 1.0 and x0 < c.x < x1: c.y = back; moved += 1
        if breath:                                                    # chest = 1, falling off along the spine and shoulders
            w = {"chest": 1.0, "spine": 0.55, "shoulder_l": 0.7, "shoulder_r": 0.7, "neck": 0.5, "upperarm_l": 0.25, "upperarm_r": 0.25, "hips": 0.12, "head": 0.2}
            # pass i2: at the table the same weight also carries each instance's SLUMP (the trunk leans about the hips: materials.ts
            # DYN_VERT), so the neck and the head go with the chest; the forearms and hands stay where they lie on the table
            if nod: w.update({"neck": 1.0, "head": 1.0, "shoulder_l": 0.85, "shoulder_r": 0.85, "upperarm_l": 0.4, "upperarm_r": 0.4, "spine": 0.5, "hips": 0.0})
            names = [g.name for g in o.vertex_groups]; bg = o.vertex_groups.new(name="breath")
            for v in o.data.vertices:
                x = sum(g.weight * w.get(names[g.group], 0.0) for g in v.groups)
                bg.add([v.index], min(1.0, x), 'REPLACE')
        if nod:                                                       # how much of the vertex is the head's (the render system turns each instance's head a little: UV1.y)
            names = [g.name for g in o.vertex_groups]; hi = names.index("head"); ng = o.vertex_groups.new(name="nod")
            for v in o.data.vertices:
                ng.add([v.index], min(1.0, sum(g.weight for g in v.groups if g.group == hi)), 'REPLACE')
    # the low build is a little over the budget: the big plain parts give the rest (a mild, planar-friendly collapse)
    soft = [o for o in objs if o.name.split("_")[0] in ("coat", "sleeve", "trouser", "boot") and o.name != "coat_trim"]
    fixed = sum(mesh.tri_count(o) for o in objs if o not in soft)
    lo_, hi_ = 0.2, 1.0
    def total(r):
        t = fixed
        for o in soft:
            m = o.modifiers.new("Dec", 'DECIMATE'); m.ratio = r; t += mesh.tri_count(o); o.modifiers.remove(m)
        return t
    if total(1.0) > budget:
        for _ in range(12):
            mid = 0.5 * (lo_ + hi_)
            if total(mid) > budget: hi_ = mid
            else: lo_ = mid
        for o in soft:
            m = o.modifiers.new("Dec", 'DECIMATE'); m.ratio = lo_
            mesh.apply_modifiers(o)
        print(f"STATIC {asset}: low build {fixed} fixed + soft parts decimated at {lo_:.2f}; {moved} vertices laid on the floor / seat")
    for o in objs:                                                    # the knot is one soft lump: no hard facets on it
        # pass i2: so is the cape (its folds are painted; the facets of ten sides read as "a paper collar")
        if o.name.startswith(("crown_knot", "hood_cape")): o.vertex_groups.new(name="soft").add(range(len(o.data.vertices)), 1.0, 'REPLACE')
    body = mesh.join(objs, asset + "_mesh")
    soft = set()
    if "soft" in body.vertex_groups:
        gi = body.vertex_groups["soft"].index
        soft = {v.index for v in body.data.vertices if any(g.group == gi and g.weight > 0.5 for g in v.groups)}
    if breath:
        uv.ensure_layers(body, lightmap=True)
        gi = body.vertex_groups["breath"].index
        vw = np.zeros(len(body.data.vertices), np.float32)
        for v in body.data.vertices:
            for g in v.groups:
                if g.group == gi: vw[v.index] = g.weight
        li = np.empty(len(body.data.loops), dtype=np.int32); body.data.loops.foreach_get("vertex_index", li)
        u1 = np.zeros((len(li), 2), np.float32); u1[:, 0] = vw[li]
        if nod:
            gi = body.vertex_groups["nod"].index; vn = np.zeros(len(body.data.vertices), np.float32)
            for v in body.data.vertices:
                for g in v.groups:
                    if g.group == gi: vn[v.index] = g.weight
            # glTF flips V: what the shader reads as uv1.y is 1 - (Blender v)
            # pass i2: 0.02 on the body, so the shader knows the mesh (uv1.y > 0.01: this one slumps), 0.02 .. 1 = the head's weight
            u1[:, 1] = 1.0 - (0.02 + 0.98 * vn[li])
            pv = Gp["head"] @ (J["head"] + V(0, 0, -0.030))
            body["nod_pivot"] = [round(pv.x, 4), round(pv.z, 4), round(-pv.y, 4)]             # game space (+Y up), relative to the asset's origin
            hp = Gp["hips"] @ J["hips"]
            body["lean_pivot"] = [round(hp.x, 4), round(hp.z, 4), round(-hp.y, 4)]
            print(f"STATIC {asset}: nod pivot (game) {body['nod_pivot'][:]}  lean pivot (game) {body['lean_pivot'][:]}")
        else: u1[:, 1] = 1.0
        uv.put(body, u1, uv.UV1)
        body["breath"] = 1
    body.vertex_groups.clear()
    for p in body.data.polygons: p.use_smooth = True
    body.data.set_sharp_from_angle(angle=math.radians(50))
    for e in body.data.edges:
        if e.vertices[0] in soft and e.vertices[1] in soft: e.use_edge_sharp = False
    # a ground plane for the contact shadow, hidden from the export
    ground = mesh.box("ao_ground", (4, 4, 0.02), (0, 0, -0.012)); material.assign(ground, "m_prop")
    vcol.bake_ao_vertex([body], distance=0.35)
    scene.remove(ground)
    mn, mx = mesh.bounds(body)
    compose(body, z0=0.0, z1=max(0.9, mx.z), seed=args.seed)
    return body
