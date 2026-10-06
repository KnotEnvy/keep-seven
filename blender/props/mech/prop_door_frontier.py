"""prop_door_frontier: a ledged-and-braced plank door, 1.6 x 2.4 x 0.08 (door_alley, door_tally).

Pivot: the hinge axis at ground; the leaf runs along +X. Unskinned: the animated empty `leaf` carries the one mesh.
Planks never two alike (0.16-0.24 m), one replaced (darker, unbleached), one short at the foot; three ledges and two
braces on the asset's front (-Y: the room side), leather hinge straps and a peg latch on the back (+Y: the yard side)."""

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

ASSET = "prop_door_frontier"

W, H, T = 1.6, 2.4, 0.08


def build(args):
    rng = scene.rng(args.seed)
    parts = []
    # ---- planks: random widths that sum to the door, a 4 mm gap between neighbours
    ws = [rng.uniform(0.16, 0.24) for _ in range(8)]
    k = (W - 0.02) / sum(ws); ws = [w * k for w in ws]
    x = 0.01
    for i, w in enumerate(ws):
        short = 0.07 if i == 5 else rng.uniform(0.0, 0.015)                  # one plank rotted short at the foot
        top = H - rng.uniform(0.0, 0.02)
        drop = ["z-"] + (["x-"] if i else []) + (["x+"] if i < len(ws) - 1 else [])
        if i in (4, 5, 6): drop = ["z-"] if i == 5 else [d for d in drop if not ((i == 4 and d == "x+") or (i == 6 and d == "x-"))]
        col = "board" if i == 2 else "board_bleached"                        # the replaced board is the dark one
        p = mc.slab(f"plank{i}", (w - 0.004, 0.034 + rng.uniform(-0.003, 0.003), top - short), (x + w / 2, 0.012 + rng.uniform(-0.004, 0.004), short + (top - short) / 2),
                    col, drop=drop, rot=(0, rng.uniform(-0.004, 0.004), 0))
        parts.append(p); x += w
    # ---- ledges and braces on the front (-Y)
    for j, z in enumerate((0.28, 1.2, 2.12)):
        parts.append(mc.slab(f"ledge{j}", (W - 0.10 - rng.uniform(0, 0.03), 0.036, 0.15 + rng.uniform(-0.012, 0.012)), (W / 2 + rng.uniform(-0.01, 0.01), -0.022, z),
                             "board", drop=("y+",), rot=(0, rng.uniform(-0.012, 0.012), 0)))
    for j, (z0, z1) in enumerate(((0.36, 1.12), (1.28, 2.04))):
        dx = W - 0.34; dz = z1 - z0; L = math.hypot(dx, dz); a = math.atan2(dz, dx)
        parts.append(mc.slab(f"brace{j}", (L, 0.034, 0.12), (W / 2, -0.021, (z0 + z1) / 2), "board", drop=("y+", "x-", "x+"), rot=(0, -a, 0)))
    # ---- back (+Y): two leather hinge straps nailed across, and the peg latch at the free edge
    for j, z in enumerate((0.42, 1.98)):
        parts.append(mc.prism(f"strap{j}", [(0.025, -0.05), (0.025, 0.05), (-0.48, 0.035), (-0.54, 0.0), (-0.48, -0.035)][::-1], 0.008, "leather",
                              centre=(0.0, 0.029, z + rng.uniform(-0.01, 0.01)), rot=(0, rng.uniform(-0.03, 0.03), math.pi)))
    parts.append(mc.slab("keeper", (0.20, 0.03, 0.09), (W - 0.13, 0.044, 1.08), "board_dark", drop=("y-",), rot=(0, 0.03, 0)))
    parts.append(mc.tube("peg", [(W - 0.16, 0.05, 1.085), (W - 0.165, 0.115, 1.10)], 0.017, 4, "board_bleached", caps=(False, True)))
    door = mesh.join(parts, ASSET + "_mesh")
    mc.ao_compose(door, distance=0.3, jitter=0.07, seed=args.seed, gradient=(0.74, 1.08))
    vcol.darken_contact(door, height=0.25, factor=0.72)                        # splash and rot at the foot
    mc.spot(door, (W - 0.16, 0.03, 1.1), 0.22, 0.8)                            # hands at the latch
    mc.spot(door, (W - 0.12, -0.03, 1.15), 0.22, 0.82)
    # ---- the animated empty, and the clip: the peg lifts (a twitch), the leaf swings in 100 degrees, knocks, settles
    leaf = export.marker("leaf", (0, 0, 0))
    door.parent = leaf
    act = anim.new_action(leaf, "open"); n = anim.frames(ASSET, "open")
    for f, deg in ((0, 0), (2, 1.2), (5, -18), (9, -62), (12, -96), (13, -101), (15, -93), (17, -98), (n, -97)):
        anim.key_object(leaf, f, rot=(0, 0, math.radians(deg)))
    anim.push_to_nla(leaf, [act])

if __name__ == "__main__":
    mc.std_main(ASSET, build)
