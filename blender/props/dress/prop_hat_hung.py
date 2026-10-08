"""prop_hat_hung: a broad-brimmed felt hat, 0.38 m across x 0.14 m, hung on a peg (ART_BIBLE 7.4, peg stair; P1).
Instanced dressing: one mesh, one material. Pivot: the peg, whose end sits inside the crown under its top: the hat
rests on it crown-up, the brim against the wall (+Y) pushed up so it tips toward the stair (-Y). The brim's underside
is modelled (it is seen from the stair below).

    node tools/build-assets.mjs --only prop_hat_hung
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
from lib import scene, mesh, uv, material, vcol, export, manifest, layout
from mathutils import Euler
import dress_common as dc

ASSET = "prop_hat_hung"


def build(args):
    rng = scene.rng(args.seed)
    SEG = 8
    # ONE skin: out along the underside of the brim, round its edge, in over the top, up the crown, into the crease.
    # The brim is a wedge of felt 9 mm thick at the crown thinning to its edge: one edge, no doubled sheet.
    def warp(v):
        a = math.atan2(v.y, v.x); r = math.hypot(v.x, v.y)
        if r > 0.10:
            k = (r - 0.10) / 0.09
            v.z += k * k * (0.028 * math.cos(2 * a) + 0.010) - k * 0.012 * math.sin(a)   # both sides curl up; the front dips
            v.x *= 1.0 - 0.03 * k * max(0.0, math.cos(2 * a))                              # ...and the curl draws them in
        elif v.z > 0.06 and r > 0.01:
            v.x *= 0.80; v.y *= 1.16                                                        # the crown is pinched long
            v.z += 0.012 * abs(math.cos(a)) - 0.010 * max(0.0, -math.sin(a))               # high at the sides, low at the front pinch
        return v
    top_z = 0.128
    # pass i2 (the reviewer, from the flight below: "faceted black ribbons and loops"): the skin began at the crown's foot,
    # so from under the brim the crown was an open hole and the hat a seven-sided LOOP on the wall. The underside is a
    # closed disc now (a pole under the crown: the dark of the sweatband is painted), and the brim has eight sides
    hat = dc.lathe("hat", [(0.0, 0.006), (0.19, 0.004), (0.092, 0.012), (0.080, 0.112), (0.0, 0.086)], seg=SEG, phase=0.2, warp=warp)
    hat.name = ASSET + "_mesh"
    dc.smooth(hat, angle=55)
    dc.paint(hat, "linen", "#6A5443")
    # it sits on the peg crown-up: the peg's end is inside the crown, under its top; the brim against the wall (+Y) is
    # pushed up, so the whole hat tips toward the stair
    dc.place(hat, (0.0, 0.0, -(top_z - 0.012)))
    dc.place(hat, (0.0, 0.0, 0.0), (math.radians(-17), math.radians(4), 0.0))
    dc.place(hat, (0.0, 0.06, 0.0))
    dc.bake_ao([hat], distance=0.12, ground=None)

    def felt(p):
        # back in the hat's own frame (before it was tipped on the peg)
        q = (p.pos - np.array([0.0, 0.06, 0.0], dtype=np.float32)) @ np.array(Euler((math.radians(-17), math.radians(4), 0.0), 'XYZ').to_matrix(), dtype=np.float32)
        fq = (p.fcen - np.array([0.0, 0.06, 0.0], dtype=np.float32)) @ np.array(Euler((math.radians(-17), math.radians(4), 0.0), 'XYZ').to_matrix(), dtype=np.float32)
        z = q[:, 2] + (top_z - 0.012); fr = np.hypot(fq[:, 0], fq[:, 1]); fz = fq[:, 2] + (top_z - 0.012)
        wall = (fr < 0.095) & (fz > 0.03) & (fz < 0.10)
        p.mix(wall * np.clip(1.0 - (z - 0.012) / 0.05, 0, 1) ** 0.5 * 0.9, "#2B211B")     # the band: dark at the foot of the crown
        top = (fr < 0.07) & (fz > 0.085)
        p.mul(top * np.clip(1.0 - np.hypot(q[:, 0], q[:, 1]) / 0.04, 0, 1), 0.62)        # the crease holds a shadow
        p.mix(np.clip(p.nrm[:, 2], 0, 1) * (~wall) * 0.28, "sand")                        # dust on what faces up
        under = (fr > 0.095) & (p.fnrm[:, 2] < -0.3)
        p.mul(under, 0.95)                                                                # the underside of the brim in shade
        low = (p.fnrm[:, 2] < -0.3)
        p.mix(low * np.clip(1.0 - np.hypot(q[:, 0], q[:, 1]) / 0.085, 0, 1) ** 0.5 * 0.85, "#1F1714")   # the dark inside of the crown, seen from below
        p.mix((~under) * (~wall) * np.clip((np.hypot(q[:, 0], q[:, 1]) - 0.15) / 0.04, 0, 1) * 0.25, "#8A7460")   # the brim's edge worn pale
    dc.compose(hat, ao=0.45, gradient=(0.9, 1.05), part_jitter=0.0, face_jitter=0.0, seed=args.seed, painters=[felt], quiet=True)


def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    build(args)
    dc.export_asset(ASSET, args)


if __name__ == "__main__":
    scene.run(main)
