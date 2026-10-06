"""prop_day_cell: the day-cell. A pale ceramic disc 0.6 across and 0.08 thick, slightly domed, in a steel bezel, on a
1.0 m steel drop-arm bracketed to the tie-beam above the hatch, tilted up toward the north shutter.

Pivot: the disc's back centre; the front (-Y) is the face the blade of sun must reach. `cell_face` (lamp set 1, off
until the blade lands) is the lens at the dome's centre in its dark bezel. The pictogram plate is zone geometry."""

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

ASSET = "prop_day_cell"

TILT = math.radians(-12)          # about +X: the face looks 12 degrees up toward the window
SEG = 16


def build(args):
    R90 = (math.radians(90), 0, 0)                                               # lathe axis +Z -> the asset's front (-Y)
    parts = []
    bezel = mc.lathe("bezel", [(0.31, 0.0), (0.31, 0.066), (0.286, 0.084)], SEG, "steel", rot=R90, cap_start=True)
    dome = mc.lathe("dome", [(0.286, 0.084), (0.115, 0.104)], SEG, "enamel", rot=R90)
    iris = mc.lathe("iris", [(0.115, 0.104), (0.092, 0.092)], SEG, "steel_dark", rot=R90)
    disc = [bezel, dome, iris]
    for o in disc: mc.place(o, (0, 0, 0), (TILT, 0, 0))
    parts += disc
    # the drop-arm: a yoke behind the disc, a square steel arm up to the beam bracket, a cable down its back
    parts.append(mc.slab("yoke", (0.12, 0.10, 0.16), (0, 0.05, 0.03), "steel", drop=("y-",), taper=(0.7, 1.0)))
    parts.append(mc.slab("arm", (0.07, 0.07, 0.94), (0, 0.075, 0.55), "steel", drop=("z-", "z+")))
    parts.append(mc.slab("bracket", (0.30, 0.18, 0.045), (0, 0.075, 1.0), "steel_dark", drop=("z+",), bevel=0.0))
    parts.append(mc.tube("cable", [(0.03, 0.125, 0.02), (0.03, 0.13, 0.98)], 0.016, 3, "cable", caps=(False, False), up=(1, 0, 0)))
    mesh.bisect(parts[-3], (0, 0.075, 0.55), (0, 0, 1))                          # the arm: a loop half way, both its ends are buried
    ob = mesh.join(parts, ASSET + "_mesh")
    mc.ao_compose(ob, distance=0.3, jitter=0.0, seed=args.seed, gradient=(0.86, 1.05))
    c, s = math.cos(TILT), math.sin(TILT)
    lamp = [tuple(Matrix.Rotation(TILT, 3, 'X') @ Vector(p)) for p in mc.lamp_disc((0, -0.094, 0), 0.092, SEG)]
    zone.lamp_set("cell_face", [lamp], colour="aqua", flicker_group=1.0)
    mc.lift(ob, lambda p, n: (np.abs(p[:, 0]) < 0.036) & (p[:, 1] > 0.035) & (p[:, 1] < 0.115) & (p[:, 2] > 0.1) & (p[:, 2] < 0.975), 0.8)   # the arm: both ends buried
    ob["thin_ok"] = 12.0

if __name__ == "__main__":
    mc.std_main(ASSET, build)
