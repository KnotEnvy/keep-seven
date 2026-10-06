"""knot_mech: the mechanism knot on its hexagonal collar (ART_BIBLE 6; blender/lib/knot.py builds it, never by hand).

ONE mesh node `knot_live` (the manifest allows one draw call): lobes and collar together, pivot at the collar's back
centre, the knot's centre 0.08 m in front of it (the hit point). Six bolt studs on the collar's lip are ours."""

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

ASSET = "knot_mech"


def build(args):
    k = knot.build_knot(0.16, 'hex', seed=5, lobes=6)
    studs = []
    R = 0.16 * 1.3 - 0.016
    for i in range(6):
        a = math.pi / 6 + i * math.pi / 3
        s = mc.lathe("stud", [(0.011, 0.0), (0.007, 0.008), (0.0, 0.008)], 3, "steel", rot=(math.radians(90), 0, 0), phase=i)
        mc.place(s, (math.cos(a) * R * 0.985, -0.08, math.sin(a) * R * 0.985))
        vcol.compose_vertex_color(s, mode='ratio', gradient=(1.0, 1.0), jitter=0.0)
        studs.append(s)
    ob = mesh.join([k["lobes"], k["collar"]] + studs, "knot_live")
    mesh.delete_faces(ob, lambda f, c, n: c.y > -0.075 and n.y > 0.2 and abs(c.x) < 0.14 and abs(c.z) < 0.14)   # lobe backs buried in the plate

if __name__ == "__main__":
    mc.std_main(ASSET, build)
