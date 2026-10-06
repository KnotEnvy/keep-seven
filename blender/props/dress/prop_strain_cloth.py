"""prop_strain_cloth: a square of well-linen, 0.8 x 0.8 m, hung by its top edge over a line (ART_BIBLE 7.4; P2).
Instanced dressing with wind: one mesh, one material, mesh extra `wind` = 1. Pivot: the top edge (the fixed end): it
hangs below the origin, so the wind weight is the distance below the pivot. Both sides are modelled (back-face culling).

    node tools/build-assets.mjs --only prop_strain_cloth
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

ASSET = "prop_strain_cloth"


def build(args):
    """Hung over a line (the pivot: the middle of the fold): the long side falls 0.6 m in front, the short side 0.2 m
    behind; five folds of 3-4 cm that open toward the hem; one corner torn and hanging lower."""
    S = 0.8
    NU = 5
    fold = [0.0, 1.0, -0.8, 0.9, -1.0, 0.3]                             # per column: out (+) / in (-)
    hem = [-0.035, 0.012, -0.012, 0.016, -0.004, 0.03]                  # the hem is nowhere level; the torn corner hangs
    def front(u, v):
        i = min(NU, int(round(u * NU)))
        d = 0.0 if v < 0.01 else (0.45 if v < 0.6 else 1.0)             # the folds deepen down the cloth
        x = (u - 0.5) * S * (1.0 - 0.10 * v) + 0.012 * fold[i] * d
        y = -0.010 - 0.038 * fold[i] * d - 0.03 * v
        z = -0.60 * (0.0 if v < 0.01 else (0.42 if v < 0.6 else 1.0)) + hem[i] * (v > 0.9) - 0.006 * abs(fold[i]) * (v < 0.01)
        return (x, y, z)
    def flap(u, v):
        i = min(NU, int(round(u * NU)))
        x = (u - 0.5) * S * (1.0 - 0.04 * v) + 0.008 * fold[i] * v
        y = 0.010 + 0.022 * fold[i] * v + 0.02 * v
        z = -0.20 * v + 0.5 * hem[NU - i] * v - 0.006 * abs(fold[i]) * (v < 0.01)
        if v < 0.01: y = -0.010                                         # the two sides meet on the line
        return (x, y, z)
    a = dc.sheet("front", NU, 2, front, double=True, back_offset=0.003, flip=True)
    b = dc.sheet("flap", NU, 1, flap, double=True, back_offset=0.003)
    cloth = dc.join([a, b], ASSET + "_mesh")
    dc.smooth(cloth, angle=50)
    dc.paint(cloth, "chalk", "linen")
    dc.bake_ao([cloth], distance=0.12, ground=None)

    def weave(p):
        t = np.clip(-p.z / 0.6, 0, 1)
        col = np.clip(np.round((p.x / (S * 0.93) + 0.5) * NU), 0, NU).astype(np.int64)
        f = np.asarray(fold, dtype=np.float32)[col]
        valley = np.clip(-f, 0, 1) * (p.y < 0.0) + np.clip(f, 0, 1) * (p.y > 0.0)
        p.mul(valley * np.clip(t * 3.0, 0, 1), 0.66)                    # the valleys of its folds
        p.mix(np.clip(np.abs(f) - 0.2, 0, 1) * (1 - valley) * np.clip(t * 3.0, 0, 1) * 0.25, "chalk")   # the ridges catch the light
        p.mix(np.clip((t - 0.75) / 0.25, 0, 1) * (p.y < 0.0) * 0.45, "#B49A74")   # the drip edge: stained by what it strained
        p.mul(np.clip(1.0 - t / 0.06, 0, 1), 0.78)                      # the crease over the line
    dc.compose(cloth, ao=0.75, gradient=(1.0, 1.0), part_jitter=0.0, seed=args.seed, painters=[weave], quiet=True)
    cloth["wind"] = 1


def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    build(args)
    dc.export_asset(ASSET, args)


if __name__ == "__main__":
    scene.run(main)
