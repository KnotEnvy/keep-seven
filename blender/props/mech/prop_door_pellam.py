"""prop_door_pellam: the gallery's far door. A Pellam sliding leaf 3.0 x 3.0 x 0.12: enamel panels on the 1.2 m
module in a steel edge frame, the livery band, a pull recess at 1.6 m, and the top track (0.2 m deep, above the
opening) it hangs from by two roller trucks.

Pivot: sill centre, closed. Bones are vertical: `leaf` slides 2.9 m to +X (to the right as she faces the front);
`root` keeps the track. `open`: unlatches, runs, a hard stop and settle. `close`: the reverse, home with a knock."""

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

ASSET = "prop_door_pellam"


def build(args):
    leaf, static, over = [], [], []
    # the steel core: both faces holed for the pull recess in the leading stile (x -1.44..-1.29, 1.42..1.78 m up)
    front = mc.holed_front(-1.5, 1.5, 0.0, 3.0, -1.44, -1.29, 1.42, 1.78, -0.04)
    back = [[(p[0], 0.04, p[2]) for p in q][::-1] for q in front]
    ends = [[(-1.5, -0.04, 0), (-1.5, -0.04, 3), (-1.5, 0.04, 3), (-1.5, 0.04, 0)][::-1], [(1.5, -0.04, 0), (1.5, -0.04, 3), (1.5, 0.04, 3), (1.5, 0.04, 0)]]
    leaf.append(mc.faces_obj("core", front + back + ends, "steel"))
    leaf.append(mc.faces_obj("pull", mc.recess(-1.44, -1.29, 1.42, 1.78, -0.04, 0.08, back=False) + [[(-1.365, -0.04, 1.42), (-1.365, 0.04, 1.42), (-1.365, 0.04, 1.78), (-1.365, -0.04, 1.78)]], "steel_dark"))
    for face in (-1, 1):
        for ix in (-0.6, 0.6):
            for iz in (0.9, 2.1):
                p = mc.pillow("panel", 1.16, 1.16, 0.02, 0.02, "enamel", centre=(ix, -0.04, iz), sides=False)
                if face > 0: p.data.transform(Matrix.Rotation(math.pi, 4, 'Z'))
                leaf.append(p)
            y = face * 0.0615
            c = [(ix - 0.56, y, 1.15), (ix + 0.56, y, 1.15), (ix + 0.56, y, 1.25), (ix - 0.56, y, 1.25)]
            over.append(mc.quad("band", c if face < 0 else c[::-1], "livery"))
        # the pull recess at 1.6 m in the leading stile, a hazard flash on the leading edge
        c = [(-1.48, face * 0.0405, 0.32), (-1.26, face * 0.0405, 0.32), (-1.26, face * 0.0405, 1.3), (-1.48, face * 0.0405, 1.08)]
        over.append(mc.quad("hazard", c if face < 0 else c[::-1], "hazard"))
    for x in (-0.95, 0.95):                                                      # roller trucks
        leaf.append(mc.slab("truck", (0.34, 0.14, 0.16), (x, 0, 3.07), "steel_dark", drop=("z-",), taper=(0.7, 1.0)))
    leaf.append(mc.pillow("plate", 0.32, 0.18, 0.006, 0.004, "steel", centre=(0.6, -0.06, 1.62), sides=False))
    # the track above the opening: 0.2 m deep, long enough for the leaf's travel, an end stop, one hanging cable
    static.append(mc.slab("track", (6.1, 0.20, 0.16), (1.45, 0, 3.22), "steel", bevel=0.0))
    static.append(mc.slab("stop", (0.12, 0.24, 0.26), (4.46, 0, 3.12), "steel_dark", drop=("z+",)))
    static.append(mc.tube("cable", [(3.6, 0.07, 3.14), (3.62, 0.09, 2.78), (3.75, 0.09, 2.64), (3.95, 0.08, 3.14)], 0.02, 3, "cable", caps=(False, False), up=(0, 1, 0)))
    arm = rig.make_armature(ASSET + "_rig", [("root", (0, 0, 0), (0, 0, 0.1), None), ("leaf", (0, 0, 1.5), (0, 0, 1.6), "root")])
    ob = rig.join_as_rigid_skin({"root": static, "leaf": leaf}, arm, ASSET + "_mesh")
    mc.ao_compose(ob, distance=0.4, jitter=0.0, seed=args.seed, gradient=(0.80, 1.05), hidden=over)
    for o in over: o.vertex_groups.new(name="leaf").add(range(len(o.data.vertices)), 1.0, 'REPLACE')
    ob = mc.overlay_join(ob, over)
    mc.grime_below(ob, 0.0, 0.9, 0.85)
    ob["thin_ok"] = 20.0
    T = 2.9
    n = anim.frames(ASSET, "open")
    a1 = anim.new_action(arm, "open")
    for f, v in ((0, 0), (2, -0.012), (5, 0.06), (14, 1.25), (22, 2.72), (24, T + 0.0), (25, T - 0.035), (27, T), (n, T)):
        anim.key_pose(arm, f, {"leaf": {"loc": (v, 0, 0)}})
    anim.reset_pose(arm)
    a2 = anim.new_action(arm, "close")
    for f, v in ((0, T), (3, T - 0.04), (12, 1.75), (21, 0.2), (24, 0.0), (25, 0.03), (27, 0.0), (n, 0.0)):
        anim.key_pose(arm, f, {"leaf": {"loc": (v, 0, 0)}})
    mc.finish_actions(arm, [a1, a2])

if __name__ == "__main__":
    mc.std_main(ASSET, build)
