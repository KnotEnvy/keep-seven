"""ia_hatch: the Pellam floor hatch of the Tally House. Two enamel leaves, each 4.0 x 1.0 m, meeting on the long
centreline and sliding apart north and south into the frame (the frame, latch block and cowl are zone geometry).

Pivot: the opening's centre at floor level; the leaves' tops are 20 mm proud of it, their bodies hang below.
The asset's front (+Z game, Blender -Y) is north: `leaf_a` is the north leaf, `leaf_b` the south one.
Bones are vertical (their frames are game axes): `open` slides each leaf 1.0 m, LINEAR in time, so the clip held at
15 % is the 0.3 m "ajar" gap. `socket_knot` (1.6, 0.9, 1.35) marks layout knot_hatch_latch; `latch_lamp` (lamp set 1)
is the status bar let into the north edge beside it."""

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

ASSET = "ia_hatch"

L, WID, TH = 4.0, 1.0, 0.12


def leaf(side):
    """One leaf, authored as the SOUTH leaf (y 0..1), mirrored for the north one. side = +1 south, -1 north."""
    p = []
    yc = WID / 2
    # steel carrier: top, underside, the meeting edge
    p.append(mc.slab("carrier", (L - 0.01, WID - 0.004, TH), (0, yc + 0.002, -TH / 2), "steel", drop=("x-", "x+", "y+")))
    # three ceramic panels on the 1.2 m module, 20 mm bevel exactly, between 0.2 m end rails
    for i in (-1, 0, 1):
        q = mc.pillow("panel", 1.16, 0.74, 0.02, 0.02, "enamel", centre=(i * 1.2, yc + 0.03, 0.0), sides=False, rot=(math.radians(-90), 0, 0))
        mesh.bisect(q, (i * 1.2 - 0.2, 0, 0), (1, 0, 0)); mesh.bisect(q, (i * 1.2 + 0.2, 0, 0), (1, 0, 0))
        p.append(q)
    # the meeting edge: a hazard strip, two recessed pull slots, a tread bar at the outer edge
    p.append(mc.quad("hazard", [(-1.9, 0.02, 0.0015), (1.9, 0.02, 0.0015), (1.9, 0.12, 0.0015), (-1.9, 0.12, 0.0015)], "hazard"))
    for x in (-1.2, 1.2):
        p.append(mc.faces_obj("slot", mc.recess(-0.11, 0.11, -0.03, 0.03, 0.0, 0.03), "steel_dark"))
        mc.place(p[-1], (x, 0.20, 0.021), (math.radians(-90), 0, 0))
    # underside: three ribs and the roller rail (seen from the stair below once the hatch has shut behind her)
    for x in (-1.3, 0.0, 1.3):
        p.append(mc.slab("rib", (0.10, WID - 0.1, 0.10), (x, yc, -TH - 0.05), "steel_dark", drop=("z+", "y+")))
    p.append(mc.slab("rail", (L - 0.2, 0.08, 0.07), (0, 0.10, -TH - 0.035), "steel_dark", drop=("z+", "x-", "x+")))
    ob = mesh.join(p, "leaf")
    if side < 0:
        ob.data.transform(Matrix.Rotation(math.pi, 4, 'Z'))
    return ob


def build(args):
    south = leaf(1); north = leaf(-1)
    # the station numeral, stencilled flat on the north leaf's middle panel (geometry: taller than 0.25 m)
    four = brand.numeral_mesh("4", 0.4, depth=0.0)
    mc.place(four, (0.0, -0.62, 0.0215), (math.radians(-90), 0, 0))      # read from the south door
    arm = rig.make_armature(ASSET + "_rig", [("root", (0, 0, 0), (0, 0, 0.1), None),
                                             ("leaf_a", (0, -0.5, 0), (0, -0.5, 0.1), "root"), ("leaf_b", (0, 0.5, 0), (0, 0.5, 0.1), "root")])
    ob = rig.join_as_rigid_skin({"leaf_a": [north, four], "leaf_b": [south]}, arm, ASSET + "_mesh")
    mc.ao_compose(ob, distance=0.25, jitter=0.0, seed=args.seed, gradient=(0.9, 1.0), ao_strength=0.7)
    # boots: the panels are worn dull along the walking line across the middle bay, and stained at the meeting edge
    def wear(p, n):
        top = (p[:, 2] > 0.015)
        k = 1.0 - 0.14 * np.clip(1.0 - np.abs(p[:, 0]) / 0.25, 0, 1) - 0.10 * np.clip(1.0 - np.abs(p[:, 1]) / 0.2, 0, 1)
        return np.where(top, k, 1.0)
    mc.shade(ob, wear)
    zone.lamp_set("latch_lamp", [mc.lamp_rect((1.6, -0.975, 0.024), 0.5, 0.035, "+z")], colour="aqua")
    export.marker("socket_knot", (1.6, -1.35, 0.9))
    # ---- clips: vertical bones, loc = (game x, y, z); north is +z (the asset's front)
    n = anim.frames(ASSET, "open")
    a_open = anim.new_action(arm, "open")
    anim.key_pose(arm, 0, {"leaf_a": {"loc": (0, 0, 0)}, "leaf_b": {"loc": (0, 0, 0)}})
    anim.key_pose(arm, n, {"leaf_a": {"loc": (0, 0, 1.0)}, "leaf_b": {"loc": (0, 0, -1.0)}})
    anim.set_interpolation(a_open, 'LINEAR')
    anim.reset_pose(arm)
    a_close = anim.new_action(arm, "close"); n = anim.frames(ASSET, "close")
    for f, d in ((0, 1.0), (3, 0.97), (22, 0.10), (25, 0.0), (26, 0.012), (28, 0.0), (n, 0.0)):      # gathers, runs home, meets with a knock
        anim.key_pose(arm, f, {"leaf_a": {"loc": (0, 0, d)}, "leaf_b": {"loc": (0, 0, -d)}})
    mc.finish_actions(arm, [a_open, a_close], linear=("open",))

if __name__ == "__main__":
    mc.std_main(ASSET, build)
