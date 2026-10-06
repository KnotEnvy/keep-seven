"""The modelling and posing kit of art-enemies-transit (imported by enemy_transit.py and proj_stake.py; recorded in
deps.json, so a change here rebuilds both).

Budgets are 2 000 and 48 triangles, so nothing is a `create_cube` + bevel modifier (44 triangles a box). Parts are built
face by face with exactly the faces that can be seen:

    lathe    a profile (r, h) turned about an axis; walking the profile with the OUTSIDE ON THE RIGHT of the direction
             of travel in the (r, h) plane gives outward normals (up the outside of a post, inward over its top)
    loft     rings of points joined by quads (chamfered beams, rods, blades), optional end caps
    slab     a box with only the listed faces

Every builder returns a finished object: smooth shading with sharp edges, weighted normals, material m_prop, UV0 on a
palette cell (or an emissive cell) and the Tint helper layer. Blender space: +Z up, the asset's front is -Y.

`Tripod` is an authoring-time two-bone solver: a pose is described by where the hub, the drum and the three FEET are,
and comes back as bone-local keys for `anim.key_pose`. The game plays plain FK clips (GDD 7.2: no runtime IK).
"""
import math
import bpy, bmesh
import numpy as np
from mathutils import Vector, Matrix, Quaternion, Euler
from lib import mesh, uv, material, vcol, manifest

TAU = math.pi * 2


# ----------------------------------------------------------------------------------------------- finishing
def paint(ob, colour, emis=False):
    """Material m_prop, the palette cell (or the emissive cell: same UV, the glow lives in tx_palette_emis) and Tint."""
    material.assign(ob, "m_prop")
    if emis: uv.map_to_emis(ob, colour)
    else: uv.map_to_palette(ob, colour)
    vcol.tint(ob, colour)
    return ob


def finish(name, bm, colour, emis=False, smooth=35.0, M=None):
    """bmesh -> finished, painted object (optionally transformed by the 4x4 `M`)."""
    if M is not None: bmesh.ops.transform(bm, matrix=M, verts=bm.verts[:])
    ob = mesh.new_mesh_object(name, bm)
    mesh.finish(ob, bevel=0.0, smooth_angle=smooth)
    return paint(ob, colour, emis)


def frame(origin, z_axis, x_hint):
    """4x4 with its origin at `origin`, local Z along `z_axis`, local X as close to `x_hint` as a right angle allows."""
    z = Vector(z_axis).normalized()
    x = Vector(x_hint) - z * Vector(x_hint).dot(z)
    x.normalize()
    y = z.cross(x)
    m = Matrix.Identity(4)
    for i in range(3):
        m[i][0] = x[i]; m[i][1] = y[i]; m[i][2] = z[i]; m[i][3] = origin[i]
    return m


# ----------------------------------------------------------------------------------------------- primitives
def lathe_bm(bm, profile, seg, phase=0.0):
    """Turn `profile` [(r, h), ...] about local +Z into `bm` (r = 0 collapses to a pole). Normals face the right-hand
    side of the direction of travel in the (r, h) plane: (dh, -dr). phase = turn of the first vertex in segments."""
    rings = []
    for (r, h) in profile:
        if r < 1e-7: rings.append([bm.verts.new((0.0, 0.0, h))])
        else:
            rings.append([bm.verts.new((r * math.cos(TAU * (k + phase) / seg), r * math.sin(TAU * (k + phase) / seg), h)) for k in range(seg)])
    for i in range(len(rings) - 1):
        a, b = rings[i], rings[i + 1]
        if len(a) == 1 and len(b) == 1: continue
        for k in range(seg):
            j = (k + 1) % seg
            if len(a) == 1: bm.faces.new((a[0], b[j], b[k]))
            elif len(b) == 1: bm.faces.new((a[k], a[j], b[0]))
            else: bm.faces.new((a[k], a[j], b[j], b[k]))
    return rings


def lathe(name, profile, seg, colour, M=None, phase=0.0, emis=False, smooth=35.0):
    bm = mesh.new_bmesh()
    lathe_bm(bm, profile, seg, phase)
    return finish(name, bm, colour, emis, smooth, M)


def loft_bm(bm, rings, cap_start=False, cap_end=False):
    """Join rings of points (each wound counter-clockwise about the direction of travel, right-hand rule) with
    quads; a ring of one point is an apex."""
    vr = [[bm.verts.new(p) for p in ring] for ring in rings]
    for i in range(len(vr) - 1):
        a, b = vr[i], vr[i + 1]
        n = max(len(a), len(b))
        for k in range(n):
            j = (k + 1) % n
            if len(a) == 1: bm.faces.new((a[0], b[j], b[k]))
            elif len(b) == 1: bm.faces.new((a[k], a[j], b[0]))
            else: bm.faces.new((a[k], a[j], b[j], b[k]))
    if cap_start and len(vr[0]) > 2: bm.faces.new(list(reversed(vr[0])))
    if cap_end and len(vr[-1]) > 2: bm.faces.new(vr[-1])
    return vr


def loft(name, rings, colour, cap_start=False, cap_end=False, M=None, emis=False, smooth=35.0):
    bm = mesh.new_bmesh()
    loft_bm(bm, rings, cap_start, cap_end)
    return finish(name, bm, colour, emis, smooth, M)


def section(w, c, z, d=None):
    """A chamfered rectangle (half-width w along X, half-depth d along Y, chamfer c) at height z, counter-clockwise."""
    d = w if d is None else d
    pts = [(w, -d + c), (w, d - c), (w - c, d), (-w + c, d), (-w, d - c), (-w, -d + c), (-w + c, -d), (w - c, -d)]
    return [(x, y, z) for (x, y) in pts]


def square(w, z, d=None, turn=False):
    """A plain rectangle (or, turned, a diamond) of half-width w at height z, counter-clockwise."""
    d = w if d is None else d
    if turn: return [(w, 0, z), (0, d, z), (-w, 0, z), (0, -d, z)]
    return [(w, -d, z), (w, d, z), (-w, d, z), (-w, -d, z)]


_BOX_FACES = {"x-": (0, 4, 7, 3), "x+": (1, 2, 6, 5), "y-": (0, 1, 5, 4), "y+": (3, 7, 6, 2), "z-": (0, 3, 2, 1), "z+": (4, 5, 6, 7)}


def slab(name, size, centre, colour, drop=(), M=None, taper=(1.0, 1.0), smooth=35.0):
    """A box of full extents `size` at `centre` WITHOUT the faces named in `drop` ('x-' 'x+' 'y-' 'y+' 'z-' 'z+').
    taper scales the top (z+) rectangle in x and y."""
    sx, sy, sz = size[0] / 2, size[1] / 2, size[2] / 2
    tx, ty = taper
    co = [(-sx, -sy, -sz), (sx, -sy, -sz), (sx, sy, -sz), (-sx, sy, -sz), (-sx * tx, -sy * ty, sz), (sx * tx, -sy * ty, sz), (sx * tx, sy * ty, sz), (-sx * tx, sy * ty, sz)]
    bm = mesh.new_bmesh()
    vs = [bm.verts.new((c[0] + centre[0], c[1] + centre[1], c[2] + centre[2])) for c in co]
    for k, idx in _BOX_FACES.items():
        if k not in drop: bm.faces.new([vs[i] for i in idx])
    for v in [v for v in vs if not v.link_faces]: bm.verts.remove(v)
    return finish(name, bm, colour, False, smooth, M)


def quads(name, faces, colour, M=None, emis=False, facing=None):
    """Loose quads / polygons: `faces` is a list of point lists (counter-clockwise seen from the visible side, or any
    winding when `facing` gives the direction they must look, in the builder's own space)."""
    bm = mesh.new_bmesh()
    for pts in faces:
        f = bm.faces.new([bm.verts.new(p) for p in pts])
        f.normal_update()
        if facing is not None and f.normal.dot(Vector(facing)) < 0: f.normal_flip()
    return finish(name, bm, colour, emis, 35.0, M)


def tube(name, points, radius, colour, sides=4, x_hint=(1, 0, 0)):
    """A polygon swept along a polyline (a cable, a conduit): open ends, meant to start and finish inside other parts."""
    pts = [Vector(p) for p in points]
    rings = []
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        M = frame(p, t, x_hint)
        rings.append([tuple(M @ Vector((radius * math.cos(TAU * (k + 0.5) / sides), radius * math.sin(TAU * (k + 0.5) / sides), 0.0))) for k in range(sides)])
    return loft(name, rings, colour, smooth=50.0)


def place(ob, M):
    """Bake the 4x4 `M` into a finished part (normals included)."""
    ob.data.transform(M); ob.data.update()
    return ob


# ----------------------------------------------------------------------------------------------- paint passes
def cell_of_loops(ob):
    """Palette cell name under UV0 of every loop of `ob` (a list of str | None)."""
    u = uv.get(ob)
    cache = {}
    out = []
    for a, b in u:
        k = (round(float(a), 4), round(float(b), 4))
        if k not in cache: cache[k] = manifest.palette_name_at(k[0], k[1])
        out.append(cache[k])
    return out


def multiply(ob, factor_fn, cells=None):
    """Color *= factor_fn(world position (n, 3)) -> (n,) or (n, 3), on the loops whose palette cell is in `cells`
    (None = all). Used for the stain of the lower third and the streaks below joints."""
    a = vcol.get_colors(ob)
    pos = vcol.corner_positions(ob)
    f = np.asarray(factor_fn(pos), dtype=np.float32)
    if f.ndim == 1: f = f[:, None]
    if cells is not None:
        names = cell_of_loops(ob)
        m = np.array([n in cells for n in names], dtype=bool)
        f = np.where(m[:, None], f, 1.0)
    a[:, :3] = np.clip(a[:, :3] * f, 0.0, 1.0)
    vcol.set_colors(ob, a)


def whiten(ob, cells):
    """Color = 1 on the loops of the given (emissive) cells: nothing dims a glow."""
    a = vcol.get_colors(ob)
    names = cell_of_loops(ob)
    m = np.array([n in cells for n in names], dtype=bool)
    a[m, :3] = 1.0
    vcol.set_colors(ob, a)


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


# ----------------------------------------------------------------------------------------------- posing
def rot_xyz(rx=0.0, ry=0.0, rz=0.0):
    """Rz * Rx * Ry as a 4x4 (yaw about the vertical first, then pitch about the turned X, then roll about the turned Y)."""
    return Matrix.Rotation(rz, 4, 'Z') @ Matrix.Rotation(rx, 4, 'X') @ Matrix.Rotation(ry, 4, 'Y')


class Tripod:
    """Authoring-time solver for a hub, a head on a ball joint and three two-bone legs. All inputs are ARMATURE space
    (= asset space in Blender axes). The root bone only ever rises, falls and tilts about the asset origin: it never
    translates horizontally (code moves the enemy)."""

    def __init__(self, arm, legs, head_pivot):
        self.arm = arm
        self.rest = {b.name: b.matrix_local.copy() for b in arm.data.bones}
        self.legs = legs                      # name -> dict(H=hip, K=knee, F=foot, er=radial unit vector), rest pose
        self.pivot = Vector(head_pivot)
        for n, g in legs.items():
            g["U"] = (g["K"] - g["H"]).length; g["L"] = (g["F"] - g["K"]).length
            g["N0"] = self._plane(g["H"], g["K"], g["F"], g["er"] + Vector((0, 0, 0.35)))

    @staticmethod
    def _plane(h, k, f, pole):
        n = (f - h).normalized()
        p = (k - h) - n * (k - h).dot(n)
        if p.length < 1e-6: p = pole - n * pole.dot(n)
        return n.cross(p.normalized()).normalized()

    @staticmethod
    def _align(y0, n0, y1, n1):
        f0 = Matrix((n0, y0, n0.cross(y0))).transposed()
        f1 = Matrix((n1, y1, n1.cross(y1))).transposed()
        return (f1 @ f0.transposed()).to_4x4()

    def knee(self, name, hip, target, pole):
        """World knee position and the (possibly clamped) foot position of leg `name`."""
        g = self.legs[name]
        U, L = g["U"], g["L"]
        d = (target - hip).length
        lim = U + L - 0.0015
        if d > lim:                                                   # out of reach: the leg goes straight toward the target
            target = hip + (target - hip) * (lim / d); d = lim
        d = max(d, abs(U - L) + 1e-4)
        n = (target - hip) / d
        a = (U * U - L * L + d * d) / (2 * d)
        h = math.sqrt(max(U * U - a * a, 0.0))
        p = pole - n * pole.dot(n)
        if p.length < 1e-6: p = Vector((0, 0, 1)) - n * n.z
        p.normalize()
        return hip + n * a + p * h, target

    def solve(self, hub_z=0.0, hub_rot=(0.0, 0.0, 0.0), head=(0.0, 0.0, 0.0), head_loc=(0.0, 0.0, 0.0), level=False, steady=False,
              feet=None, poles=None, knees=None):
        """One pose.
          hub_z     rise (+) / fall (-) of the hub, metres
          hub_rot   (rx, ry, rz) tilt of the whole body about the asset ORIGIN (rx > 0 tips the top FORWARD, toward -Y;
                    ry > 0 tips it toward +X), radians
          head      (yaw, pitch, roll) of the drum about its ball joint: yaw > 0 turns the lens toward +X (its left),
                    pitch > 0 dips the lens, roll about the sight line
          head_loc  the drum's offset from its seat in hub space (recoil: +Y is backward)
          level     True: the drum ignores the hub's tilt (it glides level while the body rocks)
          steady    True: the ball joint also stays over the origin while the body rocks (millimetres of play in the socket)
          feet      {leg: Vector} where each foot (the centre of its ground plate) is; default: the rest stance
          poles     {leg: Vector} which way each knee bulges; default: outward and a little up
          knees     {leg: Vector} FK: the knee is put exactly THERE (hub space is the caller's business) and the foot
                    where `feet` says, with no solve and with the leg's rest bend plane kept. Use it wherever a leg
                    passes through straight (the knee crosses the hip-foot line): a pole vector flips there
        Returns {bone: {'loc': Vector, 'rot': Quaternion}} for anim.key_pose."""
        feet = feet or {}; poles = poles or {}; knees = knees or {}
        R = self.rest
        Hm = Matrix.Translation((0, 0, hub_z)) @ rot_xyz(hub_rot[0], hub_rot[1], hub_rot[2])      # rx > 0: the top goes forward (-Y)
        out = {}
        root_pose = Hm @ R["root"]
        l = R["root"].inverted() @ root_pose
        out["root"] = {"loc": l.to_translation(), "rot": l.to_quaternion()}
        # the drum: about the ball joint
        yaw, pitch, roll = head
        piv = (self.pivot + Vector((0, 0, hub_z))) if steady else (Hm @ self.pivot)
        base = Matrix.Identity(4) if level else Hm.to_3x3().to_4x4()
        Rh = rot_xyz(pitch, roll, yaw)
        off = base @ Vector(head_loc)
        head_pose = Matrix.Translation(piv + off) @ base @ Rh @ Matrix.Translation(-self.pivot) @ R["head"]
        l = (root_pose @ R["root"].inverted() @ R["head"]).inverted() @ head_pose
        out["head"] = {"loc": l.to_translation(), "rot": l.to_quaternion()}
        # the legs
        for name, g in self.legs.items():
            hip = Hm @ g["H"]
            target = Vector(feet.get(name, g["F"]))
            pole = Vector(poles[name]) if name in poles else (Hm.to_3x3() @ g["er"] + Vector((0, 0, 0.35)))
            if name in knees:
                k = Vector(knees[name]); n1 = (Hm.to_3x3() @ g["N0"]).normalized()
            else:
                k, target = self.knee(name, hip, target, pole)
                n1 = self._plane(hip, k, target, pole)
            up, lo = f"leg_{name}_upper", f"leg_{name}_lower"
            a1 = self._align((g["K"] - g["H"]).normalized(), g["N0"], (k - hip).normalized(), n1)
            up_pose = Matrix.Translation(hip) @ a1 @ Matrix.Translation(-g["H"]) @ R[up]
            l = (root_pose @ R["root"].inverted() @ R[up]).inverted() @ up_pose
            out[up] = {"rot": l.to_quaternion()}
            a2 = self._align((g["F"] - g["K"]).normalized(), g["N0"], (target - k).normalized(), n1)
            lo_pose = Matrix.Translation(k) @ a2 @ Matrix.Translation(-g["K"]) @ R[lo]
            l = (up_pose @ R[up].inverted() @ R[lo]).inverted() @ lo_pose
            out[lo] = {"rot": l.to_quaternion()}
        return out


# easing kit (all take and return plain floats)
def clamp01(t): return 0.0 if t < 0 else 1.0 if t > 1 else t
def ease(t): t = clamp01(t); return t * t * (3 - 2 * t)                      # slow in, slow out
def ease_in(t, p=2.0): return clamp01(t) ** p                                # accelerates (a fall)
def ease_out(t, p=2.0): return 1 - (1 - clamp01(t)) ** p                     # arrives fast, settles
def span(f, f0, f1): return clamp01((f - f0) / float(f1 - f0)) if f1 != f0 else (1.0 if f >= f0 else 0.0)
def lerp(a, b, t): return a + (b - a) * t


def keys(f, table):
    """Piecewise value through `table` [(frame, value[, easing fn]), ...]: the easing of a row shapes the way INTO it."""
    if f <= table[0][0]: return table[0][1]
    for i in range(1, len(table)):
        f0, v0 = table[i - 1][0], table[i - 1][1]
        f1, v1 = table[i][0], table[i][1]
        if f <= f1:
            e = table[i][2] if len(table[i]) > 2 else ease
            return lerp(v0, v1, e(span(f, f0, f1)))
    return table[-1][1]
