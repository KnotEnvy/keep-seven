"""ia_lift_cage: the hall lift cage, interior 6 x 3.5 x 6 m (nav.portals ride_lift_hall). Steel frame, grille walls,
plate floor, a folding lattice gate filling the whole +Z side, a lamp bar on the header. See mech_cage.py."""

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

ASSET = "ia_lift_cage"

import mech_cage


def build(args):
    w, h, d = layout.load()["nav"]["portals"][0]["cageInterior"]
    assert layout.load()["nav"]["portals"][0]["id"] == "ride_lift_hall" and abs(h - mech_cage.H) < 1e-6
    mech_cage.build_cage(ASSET, args, w, d, gate_w=w, gate_h=h, number="4-140")

if __name__ == "__main__":
    mc.std_main(ASSET, build)
