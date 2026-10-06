"""ia_shutter: a board shutter leaf 1.2 x 0.9 hinged along its BOTTOM edge, held shut by an iron pull-rod that runs
down the inside of the wall to a white ceramic insulator: the latch, the brightest small thing in the Tally House.

Pivot: the hinge axis centre (the leaf's bottom edge, 0.45 m below the opening's centre). The wall's inner face is the
plane y = 0 (Blender); the room is on -Y (the asset's front), outdoors on +Y.
Bones: `shutter_leaf` (hinge along +X at the pivot), `latch` (the insulator, at nodePos (0, -0.55, 0.06) game: the hit
target; it collapses on frame 0 of the clip, its shatter is VFX), `root` carries the freed rod, which the clip drops
to the foot of the wall (the manifest gives this asset no fourth bone: nothing else rides `root`)."""

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

ASSET = "ia_shutter"

FLOOR = -4.05        # the hall floor below the pivot (shutter sill 4.05 m up: layout shutter_* window.yMin)


def insulator(name):
    """White ceramic, two skirts, axis vertical: 0.12 across x 0.16 tall."""
    prof = [(0.0, -0.08), (0.045, -0.072), (0.06, -0.045), (0.034, -0.01), (0.06, 0.02), (0.03, 0.062), (0.0, 0.08)]
    return mc.lathe(name, prof, 6, "chalk", phase=0.5)


def build(args):
    rng = scene.rng(args.seed)
    leaf, rod, latch = [], [], []
    # ---- the leaf: five boards (never two equal), two ledges on the room side, two strap hinges on the sill
    ws = [rng.uniform(0.17, 0.28) for _ in range(5)]
    k = 1.19 / sum(ws); ws = [w * k for w in ws]
    x = -0.595
    for i, w in enumerate(ws):
        drop = (["x-"] if i else []) + (["x+"] if i < 4 else []) + ["z-"]
        leaf.append(mc.slab(f"board{i}", (w - 0.005, 0.03 + rng.uniform(-0.003, 0.003), 0.895 - rng.uniform(0, 0.012)), (x + w / 2, 0.03 + rng.uniform(-0.003, 0.003), 0.45),
                            "board_bleached" if i != 3 else "board", drop=drop, rot=(0, rng.uniform(-0.006, 0.006), 0)))
        x += w
    for j, z in enumerate((0.17, 0.72)):
        leaf.append(mc.slab(f"ledge{j}", (1.08, 0.028, 0.10), (rng.uniform(-0.01, 0.01), 0.004, z), "board", drop=("y+", "x-", "x+"), rot=(0, rng.uniform(-0.015, 0.015), 0)))
    for sx in (-0.38, 0.36):
        leaf.append(mc.slab("hinge", (0.07, 0.012, 0.20), (sx, -0.014, 0.10), "steel_dark", drop=("y+", "z-", "x-", "x+"), taper=(0.5, 1.0)))
    # ---- the rod: hooked over the leaf's top edge, down the wall, through the insulator
    rod.append(mc.tube("rod", [(0.0, 0.058, 0.85), (0.0, 0.0, 0.94), (0.0, -0.06, 0.86), (0.0, -0.06, -0.66)], 0.017, 3, "steel_dark",
                       caps=(True, True), up=(1, 0, 0), phase=math.pi / 2))
    # ---- the latch: a dark iron wall plate (so the white reads), the insulator on it
    latch.append(mc.prism("latch_plate", mc.circle(0.125, 8, phase=math.pi / 8), 0.012, "steel_dark", centre=(0, 0, -0.55), chamfer=0.008, sides=False))
    ins = insulator("insulator"); mc.place(ins, (0, -0.06, -0.55))
    latch.append(ins)
    arm = rig.make_armature(ASSET + "_rig", [("root", (0, 0, 0), (0, 0, 0.1), None),
                                             ("shutter_leaf", (-0.2, 0, 0), (0.2, 0, 0), None),
                                             ("latch", (0, -0.06, -0.55), (0, -0.06, -0.45), None)])     # siblings of root: the rod (root) falls alone
    ob = rig.join_as_rigid_skin({"shutter_leaf": leaf, "root": rod, "latch": latch}, arm, ASSET + "_mesh")
    mc.ao_compose(ob, distance=0.3, jitter=0.06, seed=args.seed, gradient=(0.82, 1.06), ao_strength=0.7)
    mc.shade(ob, lambda p, n: np.where((p[:, 2] < -0.4) & (p[:, 1] < -0.02), 1.12, 1.0))       # keep the insulator at full white
    ob["thin_ok"] = 12.0                                                         # the 32 mm rod is seen from the hall floor, 4 to 12 m off
    # ---- clip. The insulator is gone by frame 1 (33 ms: VFX covers it). The rod, freed, drops down the wall and falls flat at
    # its foot; the leaf hesitates, falls outward 150 degrees, bangs on the outer wall and rattles twice.
    act = anim.new_action(arm, "drop_open"); n = anim.frames(ASSET, "drop_open")
    anim.key_pose(arm, 0, {"latch": {"scale": (1.0, 1.0, 1.0)}})                 # frame 0 is the rest pose (sheets and strips show the latch); it is gone one frame later
    anim.key_pose(arm, 1, {"latch": {"scale": (0.001, 0.001, 0.001)}})
    anim.key_pose(arm, n, {"latch": {"scale": (0.001, 0.001, 0.001)}})
    # leaf: hinge bone along +X, a NEGATIVE angle tips what is above the hinge toward +Y (outward)
    mc.key_curve(arm, "shutter_leaf", [(0, 0), (1, -1.5), (3, -14), (6, -78), (8, -150), (9, -139), (10, -150), (11, -144.5), (12, -150), (13, -148), (n, -150)])
    # rod (root bone, vertical: local Y = world Z, local Z = world -Y by the rig's roll for vertical bones)
    drop = FLOOR + 0.66 + 0.02
    for f, dz, tilt in ((0, 0.0, 0), (1, -0.06, 0), (4, -0.9, 3), (7, -2.5, 8), (9, drop, 14), (11, drop + 0.07, 60), (13, drop - 0.62, 88), (n, drop - 0.64, 90)):
        anim.key_pose(arm, f, {"root": {"loc": (0.0, dz, 0.0), "rot": (math.radians(tilt), 0.0, math.radians(tilt * 0.12))}})
    mc.finish_actions(arm, [act])

if __name__ == "__main__":
    mc.std_main(ASSET, build)
