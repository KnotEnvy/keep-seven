"""ia_proving_lift_cage: the proving lift, interior 4 x 3.5 x 4 m (nav.portals ride_proving_lift), a 3 x 3 m gate on
+Z between fixed grille screens, a call station on the back wall (`control` at (0, 1.2, -1.8)). Built from the same
parts as ia_lift_cage on the 1.2 m module (mech_cage.py), not scaled from it."""

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

ASSET = "ia_proving_lift_cage"

import mech_cage


def build(args):
    p = layout.load()["nav"]["portals"][1]
    assert p["id"] == "ride_proving_lift"
    w, h, d = p["cageInterior"]
    gw, gh = layout.marker("door_proving_lift")["size"][:2]
    mech_cage.build_cage(ASSET, args, w, d, gate_w=gw, gate_h=gh, control=(0.0, 1.8, 1.2), number="4-141", tight=True)
    export.marker("control", (0.0, 1.8, 1.2))

if __name__ == "__main__":
    mc.std_main(ASSET, build)
