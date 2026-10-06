"""prop_grate: a steel floor grate 1.2 x 0.06 x 1.2, a `grille` panel (tx_mask, alpha-tested) in a 0.08 m frame, hinged
on one edge. Eight placements (yard drum base, four in the lift hall, three at the bore kerb): Biders climb out after
it flips.

Pivot: centred on the marker (as the placeholder and the climb_out binding place it) at mid-thickness; the hinge,
bone `lid`, runs along the back edge (asset -Z). `flip_open` (0.4 s): thrown back 110 degrees, clangs, stays."""

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

ASSET = "prop_grate"

S, T, F = 1.2, 0.06, 0.08


def build(args):
    h = S / 2
    def ring(z, flip):
        outer = [(-h, -h), (h, -h), (h, h), (-h, h)]; inner = [(-h + F, -h + F), (h - F, -h + F), (h - F, h - F), (-h + F, h - F)]
        polys = []
        for k in range(4):
            j = (k + 1) % 4
            q = [(outer[k][0], outer[k][1], z), (outer[j][0], outer[j][1], z), (inner[j][0], inner[j][1], z), (inner[k][0], inner[k][1], z)]
            polys.append(q[::-1] if flip else q)
        return polys
    polys = ring(T / 2, False) + ring(-T / 2, True)
    sides = [((-h, -h), (h, -h)), ((h, -h), (h, h)), ((h, h), (-h, h)), ((-h, h), (-h, -h))]
    for a, b in sides: polys.append([(a[0], a[1], -T / 2), (b[0], b[1], -T / 2), (b[0], b[1], T / 2), (a[0], a[1], T / 2)])
    frame = mc.faces_obj("frame", polys, "steel")
    knuckles = [mc.slab("knuckle", (0.14, 0.05, 0.05), (x, h + 0.02, 0.0), "steel_dark", drop=("x-", "x+", "y-", "z-")) for x in (-0.35, 0.35)]
    arm = rig.make_armature(ASSET + "_rig", [("root", (0, 0, 0), (0, 0, 0.1), None), ("lid", (0, h, 0), (0, h, 0.1), "root")])
    ob = rig.join_as_rigid_skin({"lid": [frame] + knuckles}, arm, ASSET + "_mesh")
    mc.ao_compose(ob, distance=0.2, jitter=0.0, seed=args.seed, gradient=(0.85, 1.0))
    d = mc.Decals()
    t = (S - 2 * F) / 2
    for ix in (-0.5, 0.5):
        for iy in (-0.5, 0.5):
            d.add((ix * t, iy * t, 0.004), t, t, "grille", None, "steel_dark", "+z", lift=0.0)
    g = d.build("grille")
    rig.join_as_rigid_skin({"lid": [g]}, arm, "grate_grille")
    # vertical bone at the back edge: game +X turn; a NEGATIVE turn lifts the front edge and throws it back over the hinge
    act = anim.new_action(arm, "flip_open"); n = anim.frames(ASSET, "flip_open")
    for f, a in ((0, 0), (1, -6), (4, -62), (7, -112), (8, -106), (9, -111), (10, -109), (n, -110)):
        anim.key_pose(arm, f, {"lid": {"rot": (math.radians(a), 0, 0)}})
    mc.finish_actions(arm, [act])

if __name__ == "__main__":
    mc.std_main(ASSET, build)
