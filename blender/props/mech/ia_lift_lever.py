"""ia_lift_lever: the floor-standing lift lever. A steel pedestal 0.3 x 0.3 x 1.0, a quadrant with two detents, a
0.6 m lever with a ceramic knob.

Pivot: base centre. `lever` is a vertical bone at the quadrant (0, 1.0, 0), so its frame is the game's axes: the
lever rests 32 degrees back from upright and `throw` drives it 64 degrees forward (toward the asset's front), into
the far detent, with a start, a slam and a short rattle."""

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

ASSET = "ia_lift_lever"

REST = 32.0


def build(args):
    static, lever = [], []
    static.append(mc.pillow("foot", 0.42, 0.42, 0.04, 0.02, "steel", centre=(0, 0, 0), rot=(math.radians(-90), 0, 0), sides=False))
    static.append(mc.slab("pedestal", (0.30, 0.30, 0.90), (0, 0, 0.49), "enamel", drop=("z-",), bevel=0.02, taper=(0.86, 0.86)))
    static.append(mc.slab("kick", (0.305, 0.305, 0.26), (0, 0, 0.17), "steel", drop=("z-", "z+"), taper=(0.955, 0.955)))
    band = brand.livery_band([(-0.139, -0.139), (0.139, -0.139), (0.139, 0.139), (-0.139, 0.139)][::-1], z=0.74, height=0.07, closed=True, offset=0.004)
    static.append(band)
    # the quadrant: two steel cheeks with the lever between, a notched arc
    for sx in (-1, 1):
        q = mc.prism("cheek", [(-0.17, 0.0), (0.17, 0.0), (0.15, 0.085), (0.09, 0.145), (0.0, 0.17), (-0.09, 0.145), (-0.15, 0.085)], 0.014, "steel_dark",
                     centre=(0, 0, 0), back=(sx < 0), front=(sx > 0))
        mc.place(q, (sx * 0.05 + 0.007, 0, 0.94), (0, 0, math.radians(90)))
        static.append(q)
    for a in (-REST, REST):                                                      # the two detent blocks
        static.append(mc.slab("detent", (0.07, 0.03, 0.03), (0, -math.sin(math.radians(a)) * 0.16, 0.94 + math.cos(math.radians(a)) * 0.16 + 0.01), "brass", drop=("z-", "x-", "x+")))
    static.append(mc.pillow("plate", 0.16, 0.09, 0.005, 0.004, "steel_dark", centre=(0, -0.148, 0.50), sides=False))
    static.append(mc.pillow("hatch", 0.19, 0.26, 0.004, 0.003, "enamel_stain", centre=(0, -0.140, 0.32), sides=False))      # a service hatch, bolted
    # the lever, modelled upright at the pivot then leaned back to rest
    bar = mc.slab("bar", (0.034, 0.05, 0.50), (0, 0, 0.25), "steel", drop=("z-",), taper=(0.8, 0.7))
    knob = mc.lathe("knob", [(0.0, 0.0), (0.03, 0.012), (0.046, 0.05), (0.036, 0.09), (0.0, 0.105)], 5, "chalk", centre=(0, 0, 0.495))
    hub = mc.lathe("hub", [(0.045, -0.045), (0.045, 0.045)], 6, "steel", rot=(0, math.radians(90), 0), cap_start=False, cap_end=False)
    for o in (bar, knob, hub):
        mc.place(o, (0, 0, 1.0), (math.radians(REST), 0, 0))                    # +X rotation leans the top toward +Y (back)
        lever.append(o)
    arm = rig.make_armature(ASSET + "_rig", [("root", (0, 0, 0), (0, 0, 0.1), None), ("lever", (0, 0, 1.0), (0, 0, 1.1), "root")])
    ob = rig.join_as_rigid_skin({"root": static, "lever": lever}, arm, ASSET + "_mesh")
    mc.ao_compose(ob, distance=0.3, jitter=0.0, seed=args.seed, gradient=(0.80, 1.05))
    vcol.darken_contact(ob, height=0.1, factor=0.75)
    # bone-local x = game x = Blender x; a NEGATIVE Blender-X turn brings the top toward -Y (the front)
    act = anim.new_action(arm, "throw"); n = anim.frames(ASSET, "throw")
    T = -2 * REST
    for f, a in ((0, 0), (2, 5), (4, 3), (8, T * 0.55), (10, T - 4), (11, T + 5), (13, T - 1.5), (15, T + 1), (n, T)):
        anim.key_pose(arm, f, {"lever": {"rot": (math.radians(a), 0, 0)}})
    mc.finish_actions(arm, [act])

if __name__ == "__main__":
    mc.std_main(ASSET, build)
