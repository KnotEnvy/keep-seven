"""prop_station_plate: the station plate. Enamel, 0.8 x 0.8 x 0.03, a geometry 4 0.4 m tall, the mark cast at its
left, the wordmark and LIFT STATION 4 as cast raised bars (the manifest gives this asset no m_mask, so the two lines
are bars, as every unread plate line is), and the subject lamp `plate_lamp` in a dark bezel along its head.

Pivot: back centre."""

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

ASSET = "prop_station_plate"


def build(args):
    parts, over = [], []
    # (outline break, ART_BIBLE 5.3: the lower right fixing failed and the corner went with it; a cut feed cable hangs below)
    outline = [(x, z) for (x, z) in mc.rounded_rect(0.8, 0.8, 0.05, 1) if not (x > 0.3 and z < -0.3)]
    k = next(i for i, (x, z) in enumerate(outline) if x > 0.3)
    outline[k:k] = [(0.24, -0.40), (0.40, -0.29)]
    plate = mc.prism("plate", outline, 0.03, "enamel", chamfer=0.012)
    parts.append(mc.tube("cable", [(-0.24, -0.012, -0.39), (-0.205, -0.02, -0.66)], 0.016, 3, "cable", caps=(False, False), up=(0, 1, 0)))
    parts.append(plate)
    parts.append(mc.pillow("rim", 0.70, 0.52, 0.006, 0.006, "enamel_stain", centre=(0, -0.03, -0.06), sides=False))
    four = brand.numeral_mesh("4", 0.4, depth=0.0, colour="steel_dark")
    mc.place(four, (0.12, -0.0368, -0.26))
    over.append(four)
    U = 0.30 / 3.88
    mark = brand.pellam_mark(U, relief=0.0, segments=6, colour="steel_dark")
    mc.place(mark, (-0.22, -0.0368, 0.06))
    over.append(mark)
    # the two cast lines as raised bars under the lamp
    parts.append(mc.pillow("bar_word", 0.46, 0.032, 0.006, 0.004, "steel", centre=(0.06, -0.03, 0.262), sides=False))
    parts.append(mc.pillow("bar_station", 0.34, 0.026, 0.006, 0.004, "steel", centre=(0.0, -0.03, -0.355), sides=False))
    parts.append(mc.pillow("bezel", 0.62, 0.066, 0.012, 0.008, "steel_dark", centre=(0, -0.03, 0.335)))
    for sx in (-1, 1):
        for sz in (-1, 1):
            if sx > 0 and sz < 0: continue
            parts.append(mc.lathe("rivet", [(0.014, 0.0), (0.0, 0.008)], 4, "steel", centre=(sx * 0.35, -0.03, sz * 0.35), rot=(math.radians(90), 0, 0)))
    ob = mesh.join(parts, ASSET + "_mesh")
    mc.ao_compose(ob, distance=0.2, jitter=0.0, seed=args.seed, gradient=(0.88, 1.04), hidden=over, ao_strength=0.7)
    ob = mc.overlay_join(ob, over)
    vcol.streak_under(ob, [(-0.35, -0.03, 0.34), (0.35, -0.03, 0.34), (0.0, -0.045, 0.30)], width=0.07, length=0.3, factor=0.85)
    zone.lamp_set("plate_lamp", [mc.lamp_rect((0, -0.0425, 0.335), 0.56, 0.034)], colour="aqua", flicker_group=1.0)

if __name__ == "__main__":
    mc.std_main(ASSET, build)
