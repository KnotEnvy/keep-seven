"""ia_range_plate: a ceramic test plate of the proving bay, a disc 0.7 across and 0.04 thick, hung by two cable loops
from a hook (three instances; the collider is the layout's pierce-tagged solid).

Pivot: the hook. `plate` is a vertical bone at the hook: the loops and the disc swing about the hook's pin (game X).
`ring` (0.8 s): swings 10 degrees and damps. The plate centre (the hit point) is 0.45 m below the hook."""

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

ASSET = "ia_range_plate"

ZC = -0.45


def build(args):
    hook, plate = [], []
    disc = mc.lathe("disc", [(0.0, -0.02), (0.325, -0.02), (0.35, -0.006), (0.35, 0.02), (0.0, 0.02)], 12, "enamel", rot=(math.radians(-90), 0, 0), phase=mc.TAU / 24)
    for v in disc.data.vertices:                                                  # a chip knocked out of the lower right edge
        if v.co.x > 0.2 and v.co.z < -0.1 and abs(v.co.z + 0.18) < 0.06: v.co.x -= 0.035; v.co.z += 0.02
    mc.place(disc, (0, 0, ZC))
    plate.append(disc)
    for sx in (-1, 1):
        plate.append(mc.tube("loop", [(0.0, 0.0, -0.035), (sx * 0.19, 0.0, ZC + 0.29)], 0.012, 3, "cable", caps=(False, False), up=(0, 1, 0)))
    hook.append(mc.tube("hook", [(0.0, 0.10, 0.06), (0.0, -0.02, 0.03), (0.0, 0.01, -0.05)], 0.014, 3, "rust", caps=(False, True), up=(1, 0, 0)))
    arm = rig.make_armature(ASSET + "_rig", [("root", (0, 0, 0.0), (0, 0, 0.1), None), ("plate", (0, 0, 0), (0, 0, 0.1), "root")])
    ob = rig.join_as_rigid_skin({"root": hook, "plate": plate}, arm, ASSET + "_mesh")
    mc.ao_compose(ob, distance=0.2, jitter=0.0, seed=args.seed, gradient=(0.85, 1.04))
    for (x, z, r) in ((0.06, ZC + 0.03, 0.05), (-0.12, ZC - 0.08, 0.04), (0.15, ZC + 0.14, 0.035)):     # where the practice rounds struck
        mc.spot(ob, (x, -0.02, z), r, 0.72)
    ob["thin_ok"] = 12.0
    act = anim.new_action(arm, "ring"); n = anim.frames(ASSET, "ring")
    mc.key_curve(arm, "plate", [(f, v) for f, v in mc.damped(n, -10.0, 1.8, decay=2.8)][::2] + [(n, 0.0)], axis=0)
    mc.finish_actions(arm, [act])

if __name__ == "__main__":
    mc.std_main(ASSET, build)
