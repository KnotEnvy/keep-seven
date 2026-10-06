"""prop_bench: a plank bench 2.2 x 0.45 x 0.3 m (three of them bar the Tally House's front doors, stacked; others
stand along walls) (ART_BIBLE 7.4; P2). Embedded (`placedBy: zone`). Pivot: base centre.
One wide seat board on two slab ends, a stretcher let through them and wedged. The board sags where people sat.

    node tools/build-assets.mjs --only prop_bench
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

ASSET = "prop_bench"


LEN, HGT, DEP = 2.2, 0.45, 0.30


def build(args):
    rng = scene.rng(args.seed)
    j = lambda a: rng.uniform(-a, a)
    parts = []
    seat = dc.beam("seat", (-LEN / 2, 0.0, HGT - 0.02), (LEN / 2, j(0.006), HGT - 0.02 + j(0.004)), DEP, 0.04, up=(0, 1, 0), segs=4, sag=0.018)
    dc.paint(seat, "linen", "board_bleached"); parts.append(seat)
    for s in (-1, 1):
        x = s * (LEN / 2 - 0.22)
        end = dc.box(f"end{s}", (0.045, DEP - 0.03, HGT - 0.04), (x, 0.0, (HGT - 0.04) / 2), rot=(0, s * -0.07, j(0.02)), taper=(1.0, 0.82), drop=("-z", "+z"))
        dc.paint(end, "linen", "board", shade=0.92 + j(0.05)); parts.append(end)
    st = dc.beam("stretcher", (-LEN / 2 + 0.12, 0.0, 0.17), (LEN / 2 - 0.12, 0.0, 0.17 + j(0.006)), 0.09, 0.035, up=(0, 0, 1), segs=3, cap=(True, True))
    dc.paint(st, "linen", "board", shade=0.85); parts.append(st)
    dc.bake_ao(parts, distance=0.35)
    ob = dc.join(parts, ASSET + "_mesh")
    dc.smooth(ob, angle=30)

    def worn(p):
        top = (p.fnrm[:, 2] > 0.8) & (p.z > HGT - 0.06)
        for x in (-0.6, 0.05, 0.62):
            p.mix(top * np.clip(1.0 - np.abs(p.x - x) / 0.3, 0, 1) * 0.3, "#B49A80")     # three places people sat
        p.mul((p.z < 0.12) * np.clip(1.0 - p.z / 0.12, 0, 1), 0.75)
    dc.compose(ob, ao=0.85, gradient=(0.8, 1.06), part_jitter=0.06, seed=args.seed, painters=[worn], contact=(0.04, 0.65), quiet=True)


def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    build(args)
    dc.export_asset(ASSET, args)


if __name__ == "__main__":
    scene.run(main)
