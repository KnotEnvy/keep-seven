"""prop_bottle: three bottle shapes, 0.08 x 0.28 m: opaque `lens`-dark glass with ONE painted vertical highlight
(vertex colour; there is no transparency and no specular in this game). Instanced breakables, set in sixes on sills
(ART_BIBLE 7.4; P2). Three variant nodes, each one mesh and one material:

    bottle_a   a tall shouldered bottle, a long neck
    bottle_b   a squat flask with a wide lip
    bottle_c   a square-shouldered medicine bottle, its neck broken off short

Pivot: base centre.

    node tools/build-assets.mjs --only prop_bottle
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

ASSET = "prop_bottle"


GLASS = "#22343A"              # dark bottle glass: `lens` warmed toward petrol so it is not a hole in the picture
SHINE = "#8FB3B2"


def bottle(name, prof, seg, phase, shine, colour=GLASS, squash=1.0, shine_colour=SHINE):
    """shine = (angle, radius, z0, z1): the painted highlight, a narrow pale streak lying on the glass."""
    body = dc.lathe(name + "_glass", prof, seg=seg, phase=phase, sy=squash, cap_last=True)
    dc.smooth(body, angle=58)
    dc.paint(body, "enamel", colour)
    dc.bake_ao([body], distance=0.08)
    top = max(z for _, z in prof)
    a, r, z0, z1 = shine
    c, s_ = math.cos(a), math.sin(a) * squash
    t = Vector((-math.sin(a), math.cos(a) * squash, 0.0)).normalized() * 0.0045
    o = Vector((c * (r + 0.0012), s_ * (r + 0.0012), 0.0))
    streak = dc.poly(name + "_shine", [[o - t + Vector((0, 0, z0)), o + t + Vector((0, 0, z0)), o + t * 0.4 + Vector((0, 0, z1)), o - t * 0.4 + Vector((0, 0, z1))]])
    dc.paint(streak, "enamel", shine_colour, ao=False, part=False)
    ob = dc.join([body, streak], name)

    def glass(p):
        p.mix((p.z > top - 0.002) * (p.nrm[:, 2] > 0.5) * 0.7, "#0C1114")   # the bore of the neck
        fade = (p.col[:, 1] > 0.3) * np.clip((p.z - z0) / (z1 - z0), 0, 1)     # the streak thins to nothing at its top
        p.mix(fade * 0.55, colour)
    dc.compose(ob, ao=0.6, gradient=(0.9, 1.1), part_jitter=0.0, seed=1, painters=[glass], contact=(0.012, 0.7), quiet=True)
    return ob


def build(args):
    bottle("bottle_a", [(0.036, 0.0), (0.037, 0.15), (0.016, 0.195), (0.013, 0.262), (0.017, 0.266), (0.017, 0.28), (0.010, 0.279)], 5, 0.2, (-1.1, 0.034, 0.02, 0.14))
    bottle("bottle_b", [(0.038, 0.0), (0.040, 0.10), (0.018, 0.135), (0.016, 0.175), (0.023, 0.181), (0.023, 0.193), (0.012, 0.192)], 5, 0.7, (-1.9, 0.036, 0.015, 0.095), colour="#2F3A2C", squash=0.72, shine_colour="#A9B99A")
    bottle("bottle_c", [(0.032, 0.0), (0.033, 0.165), (0.026, 0.18), (0.014, 0.186), (0.0135, 0.214), (0.008, 0.209)], 4, math.pi / 4, (-1.3, 0.030, 0.02, 0.155), colour="#3A2E24", shine_colour="#C2AE92")


def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    build(args)
    dc.export_asset(ASSET, args)


if __name__ == "__main__":
    scene.run(main)
