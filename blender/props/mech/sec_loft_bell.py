"""sec_loft_bell: secret 1. The same white insulator as the yard bell, hung on a 1.2 m rope (0.05 fat) from the feed
store's hoist arm inside the loft, and the loft ladder lashed up along the facade above the porch by the same rope.

Pivot: the hoist arm tip (the pulley block is ours, the arm is the facade's). Bones are vertical (frames = game
axes): `rope` (0, -0.6, 0) carries the lower half of the rope (the hit target), `bell` (0, -1.2, 0) the insulator,
`ladder` its hinge at the top of the layout's ramp st_loft_ladder.
`fall` (0.9 s): the rope parts, the bell drops to the loft floor and bounces; the ladder swings down 74 degrees and
comes to rest along st_loft_ladder (37 degrees). The ramp is 4 x 3 m, so the ladder is 5 m long (the order's 3.2 m
cannot lie on it): the layout wins on positions."""

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

ASSET = "sec_loft_bell"

PIV = (-23.2, 5.65, -8.0)                   # game: the marker sec_loft_bell + the binding offset (0, 1.05, 0)


def local(p):
    """A world game point -> Blender, asset-local (the binding turns the asset 180 degrees: rotY 0 + pi)."""
    g = (-(p[0] - PIV[0]), p[1] - PIV[1], -(p[2] - PIV[2]))
    return layout.to_blender(g)


def build(args):
    rng = scene.rng(args.seed)
    root, rope, bell, ladder = [], [], [], []
    ramp = layout.solid("st_loft_ladder")
    rx, ry, rz = ramp["pos"]; sx, sy, sz = ramp["size"]
    top = local((rx + sx / 2, ry + sy / 2, rz)); foot = local((rx - sx / 2, ry - sy / 2, rz))
    L = (Vector(foot) - Vector(top)).length
    d_rest = (Vector(foot) - Vector(top)).normalized()
    ang = math.atan2(-d_rest.z, d_rest.x) * 2                                     # stowed: mirrored up about the horizontal
    up = Vector((d_rest.x, 0, -d_rest.z))
    # ---- the pulley block at the arm tip, the rope: upper half stays, lower half falls with the bell
    root.append(mc.slab("block", (0.10, 0.12, 0.16), (0, 0, -0.02), "board_dark", rot=(0, 0, 0.1)))
    root.append(mc.tube("rope_hi", [(0.0, 0.0, -0.08), (0.004, 0.0, -0.56)], 0.026, 4, "cord", caps=(False, True)))
    rope.append(mc.tube("rope_lo", [(0.002, 0.0, -0.58), (0.0, 0.0, -1.0)], 0.026, 4, "cord", caps=(True, False)))
    prof = [(0.0, -0.2), (0.06, -0.2), (0.14, -0.16), (0.075, -0.125), (0.14, -0.075), (0.075, -0.035), (0.14, 0.015), (0.075, 0.055), (0.135, 0.105), (0.06, 0.15), (0.03, 0.2), (0.0, 0.2)]
    bell.append(mc.lathe("stack", prof, 6, "chalk", centre=(0, 0, -1.2), phase=0.3))
    # ---- the ladder, built lying along the ramp, then lifted to its stowed pose (the clip brings it down)
    side = Vector((0, 1, 0))
    for s in (-1, 1):
        a = Vector(top) + side * 0.24 * s; b = Vector(foot) + side * 0.24 * s
        ladder.append(mc.tube("rail", [a, b], 0.04, 4, "board_bleached", phase=math.pi / 4, caps=(True, True)))
    n_r = 8
    for k in range(n_r):
        c = Vector(top) + (Vector(foot) - Vector(top)) * ((k + 0.6) / (n_r + 0.2))
        ladder.append(mc.tube("rung", [c - side * 0.205, c + side * 0.205], 0.026, 3, "board", caps=(False, False), phase=rng.uniform(0, 1)))
    ladder.append(mc.slab("lashing", (0.1, 0.56, 0.1), Vector(top) + d_rest * 0.4, "cord", drop=("x-", "x+")))
    T = Vector(top)
    rot = Matrix.Translation(T) @ Matrix.Rotation(-ang, 4, 'Y') @ Matrix.Translation(-T)        # to the stowed pose
    for o in ladder: o.data.transform(rot)
    arm = rig.make_armature(ASSET + "_rig", [("root", (0, 0, 0), (0, 0, 0.1), None), ("rope", (0, 0, -0.6), (0, 0, -0.5), "root"),
                                             ("bell", (0, 0, -1.2), (0, 0, -1.1), "root"), ("ladder", tuple(T), (T.x, T.y, T.z + 0.1), "root")])
    ob = rig.join_as_rigid_skin({"root": root, "rope": rope, "bell": bell, "ladder": ladder}, arm, ASSET + "_mesh")
    mc.ao_compose(ob, distance=0.3, jitter=0.05, seed=args.seed, gradient=(0.82, 1.05))
    ob["thin_ok"] = 20.0
    floor = local((0, 3.0, 0))[2]                                                 # the loft floor
    drop = floor - (-1.2 - 0.2)
    act = anim.new_action(arm, "fall"); n = anim.frames(ASSET, "fall")
    # bell and lower rope: free fall to the floor (frame 15), a bounce, a topple
    for f, dz, tilt in ((0, 0, 0), (4, 0.18 * drop, 0), (8, 0.6 * drop, 2), (12, drop, 4), (15, drop + 0.12, 10), (18, drop, 24), (21, drop + 0.03, 60), (24, drop, 84), (n, drop, 86)):
        anim.key_pose(arm, f, {"bell": {"loc": (0.0, dz, 0.0), "rot": (math.radians(tilt), 0, 0)}, "rope": {"loc": (0.0, dz * 0.97, 0.0), "rot": (math.radians(tilt * 0.4), 0, math.radians(tilt * 0.5))}})
    # ladder: lifted ang degrees about game -Z at rest; swings down, slams, a small rebound
    A = math.degrees(ang)
    for f, a in ((0, 0), (3, 0.04), (9, 0.4), (14, 1.0), (17, 0.925), (20, 1.0), (22, 0.972), (24, 1.0), (25, 0.992), (26, 1.0), (n, 1.0)):
        anim.key_pose(arm, f, {"ladder": {"rot": (0, 0, math.radians(-A * a))}})
    mc.finish_actions(arm, [act])
    print("LADDER", L, A)

if __name__ == "__main__":
    mc.std_main(ASSET, build)
