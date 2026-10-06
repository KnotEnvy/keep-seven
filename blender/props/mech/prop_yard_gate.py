"""prop_yard_gate: the double timber wagon gate of the yard (door_yard_gate, 4.0 x 3.0 m). Two leaves of vertical
planks, ledged and Z-braced, on hand-forged strap hinges, held by a bar across the yard face that splits when wave D
bursts it.

Pivot: hinge line centre at ground; the leaves hinge at x = -2 and +2 and meet at x = 0. Bones are vertical (frames =
game axes) on the two hinge lines. `burst_open` (0.5 s): both leaves fly outward (toward the asset's front) 100
degrees, each taking its half of the split bar, hit their stops, rebound and hold the open pose."""

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

ASSET = "prop_yard_gate"

W, H = 4.0, 3.0


def leaf(side, rng):
    """side -1 = left leaf (hinge at x = -2). Planks on the front (-Y), ledges and the Z-brace on the yard face (+Y)."""
    hx = side * W / 2
    parts = []
    ws = [rng.uniform(0.18, 0.25) for _ in range(9)]
    k = (W / 2 - 0.012) / sum(ws); ws = [w * k for w in ws]
    x = 0.006
    for i, w in enumerate(ws):
        top = H - rng.uniform(0.0, 0.06) - (0.12 if i == 6 else 0.0)            # one plank split short at the head
        xa = -side * x if False else None
        cx = hx - side * (x + w / 2)
        drop = ["z-"]
        if i: drop.append("x+" if side < 0 else "x-")
        if i < len(ws) - 1: drop.append("x-" if side < 0 else "x+")
        parts.append(mc.slab("plank", (w - 0.006, 0.04, top - 0.02), (cx, rng.uniform(-0.004, 0.004), 0.02 + (top - 0.02) / 2),
                             "board_bleached" if i != 3 else "board", drop=drop, rot=(0, rng.uniform(-0.006, 0.006), 0)))
        x += w
    mid = hx - side * W / 4
    for z in (0.35, 1.5, 2.65):
        parts.append(mc.slab("ledge", (W / 2 - 0.12, 0.045, 0.17), (mid, 0.042, z), "board", drop=("y-", "x-", "x+"), rot=(0, rng.uniform(-0.01, 0.01), 0)))
    for z0, z1 in ((0.45, 1.4), (1.6, 2.55)):
        dx = W / 2 - 0.34; dz = z1 - z0; a = math.atan2(dz, dx) * (-side)
        parts.append(mc.slab("brace", (math.hypot(dx, dz), 0.04, 0.14), (mid, 0.042, (z0 + z1) / 2), "board", drop=("y-", "x-", "x+"), rot=(0, a, 0)))
    for z in (0.35, 2.65):                                                       # strap hinges on the front, spear to the middle
        o = [(0.0, -0.05), (1.15, -0.03), (1.28, 0.0), (1.15, 0.03), (0.0, 0.05)]
        if side > 0: o = [(-p[0], p[1]) for p in o][::-1]
        s = mc.prism("strap", o, 0.01, "rust", centre=(hx, -0.02, z))
        parts.append(s)
        parts.append(mc.lathe("pintle", [(0.022, -0.1), (0.022, 0.1), (0.0, 0.11)], 5, "rust", centre=(hx - side * 0.014, -0.03, z)))
    # the half bar on the yard face, its broken end ragged where the two halves meet
    bar = mc.prism("bar", [(-0.02, -0.07), (0.98, -0.07), (1.02, -0.02), (0.97, 0.03), (1.0, 0.07), (-0.02, 0.07)], 0.12, "board_dark", rot=(0, 0, 0))
    bar.data.transform(Matrix.Rotation(math.pi / 2, 4, 'X'))
    bar.data.transform(Matrix.Translation((0, 0, 0)))
    if side > 0: bar.data.transform(Matrix.Scale(-1, 4, (1, 0, 0))); bar.data.flip_normals()
    mc.place(bar, (side * 1.0, 0.12, 1.5))
    parts.append(bar)
    parts.append(mc.slab("keeper", (0.12, 0.10, 0.22), (hx - side * 1.55, 0.115, 1.5), "rust", drop=("y-",)))
    return parts


def build(args):
    rng = scene.rng(args.seed)
    l = leaf(-1, rng); r = leaf(1, rng)
    arm = rig.make_armature(ASSET + "_rig", [("root", (0, 0, 0), (0, 0, 0.1), None), ("leaf_l", (-W / 2, 0, 0), (-W / 2, 0, 0.1), "root"), ("leaf_r", (W / 2, 0, 0), (W / 2, 0, 0.1), "root")])
    ob = rig.join_as_rigid_skin({"leaf_l": l, "leaf_r": r}, arm, ASSET + "_mesh")
    mc.ao_compose(ob, distance=0.4, jitter=0.07, seed=args.seed, gradient=(0.76, 1.08))
    vcol.darken_contact(ob, height=0.4, factor=0.7)
    ob["thin_ok"] = 15.0
    act = anim.new_action(arm, "burst_open"); n = anim.frames(ASSET, "burst_open")
    for f, a in ((0, 0), (1, -4), (3, -38), (6, -92), (8, -106), (10, -96), (12, -101), (n, -100)):
        anim.key_pose(arm, f, {"leaf_l": {"rot": (0, math.radians(a), 0)}, "leaf_r": {"rot": (0, math.radians(-a * 0.97), 0)}})
    mc.finish_actions(arm, [act])

if __name__ == "__main__":
    mc.std_main(ASSET, build)
