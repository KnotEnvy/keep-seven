"""ia_yard_bell: the yard bell. A white ceramic insulator stack (0.28 across x 0.4, four skirts) hung by trunnions in
a timber yoke on a 2.2 m post: salvage, a seam object.

Pivot: post base. `bell` is a vertical bone at (0, 2.2, 0): the axle through the stack's middle, and the hit point.
`ring` (1.2 s): the stack swings 18 degrees about the axle (game X) and damps out."""

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

ASSET = "ia_yard_bell"

ZB = 2.2


def build(args):
    rng = scene.rng(args.seed)
    post, bell = [], []
    post.append(mc.slab("post", (0.2, 0.2, 2.0), (0, 0, 1.0), "board", drop=("z-",), taper=(0.74, 0.76), rot=(0.02, -0.015, 0.04)))
    for sx in (-1, 1):
        post.append(mc.slab("cheek", (0.07, 0.14, 0.62), (sx * 0.215, 0.0, 2.15), "board_bleached", drop=("z-",), rot=(0, sx * 0.03, 0)))
    post.append(mc.slab("yoke", (0.56, 0.16, 0.12), (0, 0.0, 1.96), "board_bleached", rot=(0, 0.02, 0)))
    post.append(mc.slab("wrap", (0.23, 0.23, 0.08), (0, 0, 1.78), "cord", drop=("z-", "z+")))
    for sx in (-1, 1):                                                            # knee braces: let into the post, up under the yoke's ends
        post.append(mc.tube("brace", [(sx * 0.07, 0.0, 1.30 + 0.04 * sx), (sx * 0.245, 0.0, 1.925)], 0.042, 4, "board", phase=math.pi / 4, caps=(False, False), up=(0, 1, 0)))
    prof = [(0.0, -0.2), (0.06, -0.2), (0.14, -0.16), (0.075, -0.125), (0.14, -0.075), (0.075, -0.035), (0.14, 0.015), (0.075, 0.055), (0.135, 0.105), (0.06, 0.15), (0.05, 0.2), (0.0, 0.2)]
    stack = mc.lathe("stack", prof, 8, "chalk", centre=(0, 0, ZB), phase=0.3)
    bell.append(stack)
    bell.append(mc.tube("axle", [(-0.255, 0.0, ZB), (0.255, 0.0, ZB)], 0.022, 4, "rust", phase=math.pi / 4))
    bell.append(mc.slab("cap", (0.10, 0.10, 0.04), (0, 0, ZB + 0.21), "rust", drop=("z-",)))
    arm = rig.make_armature(ASSET + "_rig", [("root", (0, 0, 0), (0, 0, 0.1), None), ("bell", (0, 0, ZB), (0, 0, ZB + 0.1), "root")])
    ob = rig.join_as_rigid_skin({"root": post, "bell": bell}, arm, ASSET + "_mesh")
    mc.ao_compose(ob, distance=0.3, jitter=0.05, seed=args.seed, gradient=(0.78, 1.06))
    vcol.darken_contact(ob, height=0.3, factor=0.7)
    act = anim.new_action(arm, "ring"); n = anim.frames(ASSET, "ring")
    mc.key_curve(arm, "bell", [(f, v) for f, v in mc.damped(n, 18.0, 2.4, decay=2.6)][::2] + [(n, 0.0)], axis=0)
    mc.finish_actions(arm, [act])

if __name__ == "__main__":
    mc.std_main(ASSET, build)
