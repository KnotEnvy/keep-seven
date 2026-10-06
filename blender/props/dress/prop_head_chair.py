"""prop_head_chair: NOT ONE OF THEIRS. A folding camp chair of pale canvas and turned wood, 0.5 x 0.85 x 0.5 m, clean
(ART_BIBLE 7.4; nar_tally_chair). The Dowser's: pulled out to face the seated. The middle blade of sun lands on it.
Embedded (`placedBy: zone`). Pivot: base centre. Front is -Y.

Crossed legs pinned at the X, two seat rails, raked back uprights with turned finials, a slung canvas seat and a canvas
back band. Everything on it is square, pinned and unworn: the opposite of the eleven chairs it faces.

    node tools/build-assets.mjs --only prop_head_chair
"""
import sys, os
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _d)
while not (os.path.isfile(os.path.join(_d, "lib", "__init__.py")) or os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py"))):
    if os.path.dirname(_d) == _d: raise SystemExit(f"blender/lib not found above {os.path.abspath(__file__)}")
    _d = os.path.dirname(_d)
sys.path.insert(0, _d if os.path.isfile(os.path.join(_d, "lib", "__init__.py")) else os.path.join(_d, "blender"))
import math
import numpy as np
from mathutils import Vector, Matrix
from lib import scene, mesh, uv, material, vcol, export, manifest, layout
import dress_common as dc

ASSET = "prop_head_chair"


WOOD = "#6E4A2C"              # oiled, turned hardwood: nothing in Plenty is this colour
CANVAS = "#D6CCB2"


def build(args):
    parts = []
    X = 0.215                                                           # the two side frames
    SEAT = 0.45
    def turned(name, pts, radii, sides=5, cap=False, shade=1.0, up=(1, 0, 0)):
        o = dc.tube(name, pts, r=radii, sides=sides, cap=cap, up=up)
        dc.smooth(o, angle=50); dc.paint(o, "glove", WOOD, shade=shade); parts.append(o)
        return o
    for s in (-1, 1):
        x = s * X
        # the X: two legs crossing at a pin, each swelling where the pin goes through (turned work)
        turned(f"leg_a{s}", [(x - s * 0.012, -0.225, 0.0), (x - s * 0.012, 0.0, SEAT * 0.5), (x - s * 0.012, 0.205, SEAT - 0.01)], [0.015, 0.021, 0.016], sides=4)
        turned(f"leg_b{s}", [(x + s * 0.012, 0.225, 0.0), (x + s * 0.012, 0.0, SEAT * 0.5), (x + s * 0.012, -0.205, SEAT - 0.01)], [0.015, 0.021, 0.016], sides=4)
        # the seat rail the canvas is sleeved on, proud of the legs front and back
        turned(f"rail{s}", [(x, -0.245, SEAT), (x, 0.235, SEAT)], [0.017, 0.017], sides=4, cap=True, up=(0, 0, 1))
        # the back upright, raked, with a turned finial
        turned(f"upright{s}", [(x, 0.20, SEAT - 0.02), (x, 0.245, 0.80)], [0.017, 0.0145], sides=5, up=(1, 0, 0))
        fin = dc.lathe(f"finial{s}", [(0.013, 0.0), (0.022, 0.016), (0.0, 0.05)], seg=4, phase=math.pi / 4, centre=(x, 0.245, 0.80))
        dc.smooth(fin, angle=50); dc.paint(fin, "glove", WOOD, shade=1.08); parts.append(fin)
    # two floor stretchers tie the feet (they are what lets it fold)
    turned("foot_f", [(-X, -0.225, 0.02), (X, -0.225, 0.02)], [0.012, 0.012], sides=4, up=(0, 0, 1), shade=0.9)
    turned("foot_b", [(-X, 0.225, 0.02), (X, 0.225, 0.02)], [0.012, 0.012], sides=4, up=(0, 0, 1), shade=0.9)
    # ---- canvas: a slung seat between the rails, and a back band sleeved over the uprights
    def seat_fn(u, v):
        x = (u - 0.5) * 2 * (X + 0.004)
        sag = 0.045 * (1 - (2 * u - 1) ** 2) * (0.75 + 0.25 * math.sin(math.pi * v))
        return (x, -0.215 + v * 0.42, SEAT + 0.018 - sag)
    seat = dc.sheet("canvas_seat", 4, 1, seat_fn, double=True, back_offset=0.004)
    def back_fn(u, v):
        x = (u - 0.5) * 2 * (X + 0.02)
        z = 0.60 + v * 0.20
        y = 0.20 + 0.045 * (z - (SEAT - 0.02)) / (0.80 - SEAT + 0.02) + 0.035 * (1 - (2 * u - 1) ** 2) - 0.018
        return (-x, y, z)                                                # normal toward the sitter's back (-Y)
    back = dc.sheet("canvas_back", 4, 1, back_fn, double=True, back_offset=0.004)
    for o in (seat, back):
        dc.smooth(o, angle=40); dc.paint(o, "chalk", CANVAS); parts.append(o)
    dc.bake_ao(parts, distance=0.3)
    ob = dc.join(parts, ASSET + "_mesh")

    def clean(p):
        canvas = p.col[:, 0] > 0.4
        hem = canvas & ((np.abs(p.y + 0.215) < 0.01) | (np.abs(p.y - 0.205) < 0.01)) & (p.z < 0.5)
        p.mul(hem, 0.9)                                                  # the stitched hems of the seat
        p.mul(canvas * (p.z > 0.55) * (np.abs(np.abs(p.x) - X) < 0.03), 0.9)   # the sleeves over the uprights
    dc.compose(ob, ao=0.7, gradient=(0.9, 1.04), part_jitter=0.02, face_jitter=0.0, seed=args.seed, painters=[clean], contact=(0.03, 0.75))


def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    build(args)
    dc.export_asset(ASSET, args)


if __name__ == "__main__":
    scene.run(main)
