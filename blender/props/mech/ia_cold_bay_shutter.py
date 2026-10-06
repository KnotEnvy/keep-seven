"""ia_cold_bay_shutter: secret 2. A steel roller shutter filling door_cold_bay (3 x 3 m) of ten 0.3 m slats, a hazard
bottom rail, steel guides, and the roller housing above the opening.

Pivot: sill centre. `shutter` is a vertical bone at the sill (frame = game axes): `open` (1.5 s) rolls the curtain up
into the housing (the bone's height scale closes to 7 % while it rises). `root` keeps the guides and the housing.
`socket_knot` (3, 1.6, -0.62) marks layout knot_cold_bay (its latch block is zone geometry)."""

import sys, os
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
while not os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py")):
    if os.path.dirname(_d) == _d: raise SystemExit("blender/lib not found")
    _d = os.path.dirname(_d)
sys.path.insert(0, os.path.join(_d, "blender")); sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import math
import numpy as np
from mathutils import Vector, Matrix
from lib import scene, mesh, uv, material, vcol, rig, anim, export, zone, brand, knot, layout, manifest
import mech_common as mc

ASSET = "ia_cold_bay_shutter"

W, H = 3.0, 3.0


def build(args):
    rng = scene.rng(args.seed)
    static, curtain = [], []
    n = 10; h = H / n
    for k in range(n):
        z0 = k * h
        bow = 0.018 + rng.uniform(-0.002, 0.002)
        polys = []
        X = W / 2 - 0.03                                                        # the slat ends stop at the guides' inner faces
        for xa, xb in ((-X, 0.0), (0.0, X)):                                    # a loop down the middle: the AO has a vertex there
            polys += [[(xa, -0.02, z0), (xb, -0.02, z0), (xb, -0.02 - bow, z0 + h * 0.5), (xa, -0.02 - bow, z0 + h * 0.5)],
                      [(xa, -0.02 - bow, z0 + h * 0.5), (xb, -0.02 - bow, z0 + h * 0.5), (xb, -0.02, z0 + h), (xa, -0.02, z0 + h)],
                      [(xa, 0.02, z0 + h), (xb, 0.02, z0 + h), (xb, 0.02, z0), (xa, 0.02, z0)]]
        s = mc.faces_obj(f"slat{k}", polys, "steel" if k not in (2, 7) else "steel_dark")
        dent = rng.uniform(-0.01, 0.01)
        for v in s.data.vertices:
            if abs(v.co.x) < 0.01: v.co.y += dent
        curtain.append(s)
    curtain.append(mc.slab("foot", (W, 0.07, 0.12), (0, 0, 0.06), "hazard", drop=("x-", "x+")))
    for x in (-0.6, 0.6):
        curtain.append(mc.tube("handle", [(x - 0.1, -0.075, 0.30), (x - 0.08, -0.11, 0.30), (x + 0.08, -0.11, 0.30), (x + 0.1, -0.075, 0.30)], 0.014, 3, "steel_dark", caps=(False, False)))
    for s in (-1, 1):
        static.append(mc.slab("guide", (0.12, 0.16, H + 0.45), (s * (W / 2 + 0.03), 0, (H + 0.45) / 2), "steel_dark", drop=("z-", "y+", "x+" if s < 0 else "x-")))
    static.append(mc.slab("housing", (W + 0.3, 0.5, 0.48), (0, -0.04, H + 0.24), "steel", drop=("y+",), bevel=0.02))
    static.append(mc.quad("hz", [(-W / 2 - 0.1, -0.2915, H + 0.06), (-W / 2 + 0.34, -0.2915, H + 0.06), (-W / 2 + 0.74, -0.2915, H + 0.42), (-W / 2 + 0.3, -0.2915, H + 0.42)], "hazard"))
    arm = rig.make_armature(ASSET + "_rig", [("root", (0, 0, 0), (0, 0, 0.1), None), ("shutter", (0, 0, 0), (0, 0, 0.1), "root")])
    ob = rig.join_as_rigid_skin({"root": static, "shutter": curtain}, arm, ASSET + "_mesh")
    mc.ao_compose(ob, distance=0.4, jitter=0.0, seed=args.seed, gradient=(0.78, 1.04))
    vcol.streak_under(ob, [(x, -0.04, H) for x in (-1.1, -0.2, 0.7)], width=0.12, length=0.9, factor=0.82)
    mc.grime_below(ob, 0.0, 0.6, 0.8)
    export.marker("socket_knot", (3.0, 0.62, 1.6))
    act = anim.new_action(arm, "open"); nf = anim.frames(ASSET, "open")
    for f, sc, up in ((0, 1.0, 0.0), (3, 1.0, 0.03), (5, 1.0, 0.0), (12, 0.86, 0.36), (30, 0.3, 2.0), (40, 0.075, 2.95), (42, 0.07, 3.02), (nf, 0.07, 3.0)):
        anim.key_pose(arm, f, {"shutter": {"scale": (1.0, sc, 1.0), "loc": (0.0, up, 0.0)}})
    mc.finish_actions(arm, [act])
    for pb in arm.pose.bones: pb.scale = (1, 1, 1)

if __name__ == "__main__":
    mc.std_main(ASSET, build)
