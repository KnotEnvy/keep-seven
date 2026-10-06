"""rd_rain_tally: a child's wood-framed slate, 0.22 x 0.3 m: chalk strokes in fives (`tally` on `m_mask`), a cord
loop to hang it by, a nub of chalk on the frame's sill (ART_BIBLE 7.4; P2; the feed-store loft). The model shows
strokes only: no words. Embedded. `m_prop` + `m_mask`. Pivot: base centre; it faces -Y.

    node tools/build-assets.mjs --only rd_rain_tally
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

ASSET = "rd_rain_tally"


W, H, T = 0.22, 0.30, 0.016
FR = 0.026                     # frame width


def build(args):
    rng = scene.rng(args.seed)
    parts = []
    # the frame: four sticks, lapped at the corners (the stiles run through), none quite square
    def stick(name, p0, p1, up, shade):
        o = dc.beam(name, p0, p1, FR, T, up=up, cap=(False, up == (1, 0, 0)), drop=("front",) if up == (1, 0, 0) else ("back",))   # the side against the wall
        dc.paint(o, "linen", "board_bleached", shade=shade, ao=False); parts.append(o)
    for s in (-1, 1):
        stick(f"stile{s}", (s * (W / 2 - FR / 2), 0, 0.0), (s * (W / 2 - FR / 2) + s * 0.002, 0, H), (1, 0, 0), 0.95 + 0.06 * s)
    stick("rail_b", (-W / 2 + FR, -0.001, FR / 2), (W / 2 - FR, -0.001, FR / 2 + 0.002), (0, 0, 1), 0.85)
    stick("rail_t", (-W / 2 + FR, -0.001, H - FR / 2), (W / 2 - FR, -0.001, H - FR / 2 - 0.002), (0, 0, 1), 1.0)
    slate = dc.poly("slate", [[(-W / 2 + FR, -0.003, FR), (W / 2 - FR, -0.003, FR), (W / 2 - FR, -0.003, H - FR), (-W / 2 + FR, -0.003, H - FR)]])
    dc.paint(slate, "linen", "#3A3A40", ao=False); parts.append(slate)
    # a nub of chalk on the bottom rail, and the cord loop from the top corners
    chalk = dc.beam("chalk_nub", (0.03, -T / 2 - 0.006, FR + 0.005), (0.058, -T / 2 - 0.007, FR + 0.006), 0.011, 0.011, up=(0, 0, 1), cap=(False, True), drop=("down", "front"))
    dc.paint(chalk, "chalk", ao=False); parts.append(chalk)
    cord = dc.tube("cord", [(-W / 2 + 0.03, 0.0, H - 0.008), (0.006, 0.0, H + 0.05), (W / 2 - 0.03, 0.0, H - 0.008)], r=0.005, sides=3, cap=False, up=(0, 1, 0))
    dc.paint(cord, "linen", "cord", ao=False); parts.append(cord)
    body = dc.join(parts, ASSET + "_mesh")

    def chalked(p):
        slate_ = p.col[:, 0] < 0.06
        p.mix(slate_ * dc.P.near(p, (0.02, 0, H * 0.45), 0.2) * 0.25, "#6A6A70")   # wiped with a sleeve, never clean
    dc.compose(body, ao=0.0, gradient=(0.92, 1.05), part_jitter=0.04, seed=args.seed, painters=[chalked], contact=(0.02, 0.75), quiet=True)
    # the tally: two rows of strokes in fives (cells of the mask's `tally` region), and a shaky third
    y = -0.0045
    quads = [((-W / 2 + FR + 0.012, H - FR - 0.085), (W / 2 - FR - 0.012, H - FR - 0.018), 0),
             ((-W / 2 + FR + 0.012, H - FR - 0.165), (W / 2 - FR - 0.012, H - FR - 0.098), 1),
             ((-W / 2 + FR + 0.012, H - FR - 0.235), (W / 2 - FR - 0.050, H - FR - 0.178), 2)]
    dec = dc.poly("tally", [[(a[0], y, a[1]), (b[0], y, a[1]), (b[0], y, b[1]), (a[0], y, b[1])] for a, b, _ in quads])
    material.assign(dec, "m_mask")
    for i, (_, _, cell) in enumerate(quads): uv.map_to_mask(dec, [i], "tally", cell)
    vcol.fill_color(dec, "chalk")
    ob = dc.join([body, dec], ASSET + "_mesh")
    vcol.color_layer(ob, vcol.COLOR)


def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    build(args)
    dc.export_asset(ASSET, args)


if __name__ == "__main__":
    scene.run(main)
