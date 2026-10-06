"""pk_canteen: a round blanket-covered canteen, 0.24 m across x 0.09 m, lying on its side (ART_BIBLE 7.4, P0).

`linen` blanket cover stitched round the rim, a `leather` strap looped twice (through two keepers, over the body, the
slack thrown down beside it), a `tin` neck with a cork. Instanced pickup: one mesh, one material. Pivot: base centre.
The tin neck and its collar are left clean and bright: the pickup glint (VFX) sits there.

    node tools/build-assets.mjs --only pk_canteen
"""
import sys, os
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _d)
while not (os.path.isfile(os.path.join(_d, "lib", "__init__.py")) or os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py"))):
    if os.path.dirname(_d) == _d: raise SystemExit(f"blender/lib not found above {os.path.abspath(__file__)}")
    _d = os.path.dirname(_d)
sys.path.insert(0, _d if os.path.isfile(os.path.join(_d, "lib", "__init__.py")) else os.path.join(_d, "blender"))
import math
import numpy as np
from mathutils import Vector, Matrix
from lib import scene
import dress_common as dc

ASSET = "pk_canteen"
R, T = 0.112, 0.088                # body radius and thickness (it lies flat: the disc is horizontal)


def build(args):
    rng = scene.rng(args.seed)
    SEG = 11
    # ---- the body: a pressed-tin flask under a blanket cover. Lens section, a stitched rim seam, a slightly sunk face
    prof = [(R * 0.80, 0.0), (R * 0.985, T * 0.36), (R + 0.006, T * 0.50), (R * 0.985, T * 0.64), (R * 0.82, T * 0.95), (R * 0.42, T), (0.0, T * 0.955)]

    def sag(v):                                                        # the blanket is baggy: nothing is quite round
        a = math.atan2(v.y, v.x)
        k = 1.0 + 0.014 * math.sin(3 * a + 0.7) + 0.007 * math.sin(5 * a)
        return Vector((v.x * k, v.y * k, v.z))
    body = dc.lathe("body", prof, seg=SEG, phase=math.radians(9), warp=sag)
    dc.smooth(body, angle=55)
    dc.paint(body, "chalk", "linen")
    # ---- neck and cork, out of the rim toward +X (tilted up a little: it rests on the neck's collar)
    def along(d, r, z_up=0.0): return (R - 0.012 + d, 0.0, T * 0.47 + z_up + d * 0.10)
    neck = dc.tube("neck", [along(0.0, 0), along(0.034, 0)], r=[0.021, 0.0175], sides=8, cap=False, up=(0, 0, 1))
    collar = dc.tube("collar", [along(0.026, 0), along(0.038, 0)], r=[0.023, 0.023], sides=6, cap=True, up=(0, 0, 1))
    cork = dc.tube("cork", [along(0.036, 0), along(0.058, 0)], r=[0.0135, 0.0155], sides=6, cap=True, up=(0, 0, 1))
    for o in (neck, collar): dc.smooth(o, angle=65); dc.paint(o, "chalk", "tin", shade=1.12)
    dc.smooth(cork, angle=75); dc.paint(cork, "cord", shade=0.95)
    dc.drop_faces(cork, lambda c, n: n.x < -0.8)
    dc.drop_faces(collar, lambda c, n: n.x < -0.8)
    # ---- the strap: two keepers on the rim either side of the neck, and the strap itself, 28 mm wide, looped twice:
    # twice across the face of the canteen, the slack end thrown down beside it
    parts = [body, neck, collar, cork]
    W = 0.014                                                           # half the strap's width (28 mm of leather)

    def curve(pts, n):
        """Catmull-Rom through `pts`, n points per span: leather bends, it does not kink."""
        P = [Vector(q) for q in pts]
        P = [P[0] * 2 - P[1]] + P + [P[-1] * 2 - P[-2]]
        out = []
        for i in range(1, len(P) - 2):
            for k in range(n):
                t = k / n
                out.append(0.5 * ((2 * P[i]) + (-P[i - 1] + P[i + 1]) * t + (2 * P[i - 1] - 5 * P[i] + 4 * P[i + 1] - P[i + 2]) * t * t
                                  + (-P[i - 1] + 3 * P[i] - 3 * P[i + 1] + P[i + 2]) * t ** 3))
        out.append(P[-2])
        return out

    def ribbon(name, pts, nrm, shade, both=()):
        """A strap as a ribbon: 2 mm of leather has no edge worth a triangle. `nrm(i, p)` = the side it shows;
        `both` = indices of spans that are seen from both sides (where it stands off the ground)."""
        bm = dc.mesh.new_bmesh()
        rows = []
        for i, q in enumerate(pts):
            t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
            n = Vector(nrm(i, q)).normalized()
            side = t.cross(n).normalized()
            rows.append((bm.verts.new(q - side * W + n * 0.002), bm.verts.new(q + side * W + n * 0.002)))
        for i in range(len(rows) - 1):
            (a0, a1), (b0, b1) = rows[i], rows[i + 1]
            bm.faces.new((a0, a1, b1, b0))
            if i in both: bm.faces.new([bm.verts.new(v.co) for v in (b0, b1, a1, a0)])
        o = dc._obj(name, bm)
        if sum(p.normal.dot(Vector(nrm(0, pts[0])).normalized()) for p in o.data.polygons[:1]) < 0:
            o.data.flip_normals()
        dc.smooth(o, angle=60); dc.paint(o, "leather", shade=shade)
        return o
    k = 0.72                                                            # where on the rim the keepers sit (radians off the neck)
    kp = [(math.cos(s * k) * (R + 0.004), math.sin(s * k) * (R + 0.004), T * 0.47) for s in (1, -1)]
    # loop one: from the upper keeper over the face of the canteen to the lower keeper (it lies on the cover)
    top = [(0.0, T * 0.955), (R * 0.42, T), (R * 0.82, T * 0.95), (R * 0.985, T * 0.64), (R + 0.006, T * 0.50)]
    def on_face(a, r, lift=0.005):
        zz = top[-1][1]
        for (r0, z0), (r1, z1) in zip(top, top[1:]):
            if r0 <= r <= r1: zz = z0 + (z1 - z0) * (r - r0) / (r1 - r0)
        return (math.cos(a) * r * 1.03, math.sin(a) * r * 1.03, zz + lift)
    loop1 = curve([on_face(k, R + 0.004, 0.0), on_face(k * 0.97, R * 0.84), on_face(0.55, R * 0.52), on_face(0.0, R * 0.36),
                   on_face(-0.55, R * 0.52), on_face(-k * 0.97, R * 0.84), on_face(-k, R + 0.004, 0.0)], 2)
    def face_n(i, q):
        rad = math.hypot(q.x, q.y)
        w = max(0.0, (rad - R * 0.7) / (R * 0.3))
        return (q.x / max(rad, 1e-6) * w, q.y / max(rad, 1e-6) * w, 1.0)
    parts.append(ribbon("strap_a", loop1, face_n, 1.0))
    # loop two: the second turn of the strap, wound straight across the face over the first (it crosses it near the
    # neck side) from the far rim to the near rim
    a0, a1 = 2.35, -1.05
    e0 = Vector((math.cos(a0), math.sin(a0), 0.0)); e1 = Vector((math.cos(a1), math.sin(a1), 0.0))
    def chord(f, lift):
        q = e0.lerp(e1, f) * (R + 0.004)
        rad = max(1e-4, math.hypot(q.x, q.y))
        return on_face(math.atan2(q.y, q.x), rad, lift)
    loop2 = [Vector(chord(f, 0.0105 if 0.05 < f < 0.95 else 0.002)) for f in (0.0, 0.08, 0.34, 0.66, 0.92, 1.0)]
    parts.append(ribbon("strap_b", loop2, face_n, 0.88))
    # the slack end: from the lower keeper down onto the ground, lying where it fell
    g = 0.003
    ctrl = [on_face(-k, R + 0.008, -0.004), (kp[1][0] + 0.016, kp[1][1] - 0.034, g + 0.004), (0.035, -R - 0.062, g), (-0.055, -R - 0.050, g)]
    loop3 = curve(ctrl, 2)
    def ground_n(i, q):
        if i < 2: return (q.x * 0.6, q.y * 0.6 - 0.05, 0.08)            # it drops from the keeper on edge, then lies down
        return (0.0, 0.0, 1.0)
    parts.append(ribbon("strap_c", loop3, ground_n, 0.86, both=(0, 1)))
    ob = dc.join(parts, ASSET + "_mesh")
    dc.drop_faces(ob, lambda c, n: n.z < -0.92 and c.z < 0.006)        # what lies on the ground is never seen

    dc.bake_ao([ob], distance=0.10)

    def cover(p):
        rad = np.hypot(p.x, p.y)
        cloth = (p.col[:, 0] > 0.55) & (rad < R * 1.05)                 # the linen (the palest thing here)
        seam = np.clip(1.0 - np.abs(p.z - T * 0.50) / 0.008, 0, 1) * cloth
        p.mul(seam, 0.72)                                               # the stitched seam round the rim
        worn = np.clip(1.0 - rad / (R * 0.5), 0, 1) * (p.z > T * 0.8) * cloth
        p.mix(worn * 0.35, "#E4DCC8")                                   # the crown of the cover rubbed pale
        p.mix(np.clip(1.0 - p.z / 0.03, 0, 1) * cloth * 0.55, "sand")   # dust wicks up from the ground
        damp = dc.P.near(p, (-0.03, 0.035, T), 0.07) * cloth
        p.mul(damp * 0.6, (0.86, 0.84, 0.80))                           # an old water stain
    dc.compose(ob, ao=0.75, gradient=(0.80, 1.03), part_jitter=0.04, seed=args.seed, painters=[cover], contact=(0.012, 0.72))


def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    build(args)
    dc.export_asset(ASSET, args)


if __name__ == "__main__":
    scene.run(main)
