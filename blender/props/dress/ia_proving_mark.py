"""ia_proving_mark: a brass disc 0.5 m across let flush into the floor, a raised rim, and the plumb glyph (a dot under
a short stroke) in relief. Dark brass. Embedded six times in the bore sector by the zone script (bake class LM there;
its glow is the zone's lamp set `mark_glows`). Pivot: centre at floor level. The glyph reads upright to someone standing
at the asset's front (-Y in Blender, +Z in the game) looking in.

    node tools/build-assets.mjs --only ia_proving_mark
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

ASSET = "ia_proving_mark"


BRASS_DARK = "#7C5E2A"        # brass that nobody polishes: the `brass` cell darkened
BRASS_WORN = "#B88A3A"


def build(args):
    SEG = 18
    # the disc: Pellam circles are true, so the triangles go into the round (18 sides) and not into a wall nobody
    # sees: the rim is one dished ring, 6 mm proud at its outer edge (the floor it is let into hides the 6 mm side),
    # falling to a field 2 mm proud
    disc = dc.lathe("disc", [(0.25, 0.006), (0.214, 0.002)], seg=SEG, phase=math.radians(10), cap_last=True)
    dc.smooth(disc, angle=30)
    dc.paint(disc, "brass", BRASS_DARK)
    # the plumb glyph in 3 mm relief: a short stroke, and the bob beneath it (toward the reader)
    z = 0.005
    stroke = dc.poly("stroke", [(-0.015, 0.006, z), (0.015, 0.006, z), (0.015, 0.125, z), (-0.015, 0.125, z)])
    bob = dc.poly("bob", [(0.044 * math.cos(a), -0.074 + 0.044 * math.sin(a), z) for a in [math.radians(30 + 60 * k) for k in range(6)]])
    for o in (stroke, bob): dc.paint(o, "brass", BRASS_WORN)
    ob = dc.join([disc, stroke, bob], ASSET + "_mesh")

    dc.bake_ao([ob], distance=0.06, ground=0.0)

    def wear(p):
        rad = np.hypot(p.x, p.y)
        field = (p.z < 0.004) & (rad < 0.22)
        p.mul(field * np.clip(rad / 0.21, 0, 1) ** 2, 0.6)             # grime gathers against the rim
        p.mix(((p.z > 0.0055) & (rad > 0.2)) * 0.55, BRASS_WORN)        # the rim's crest, scuffed by boots that came this far
    dc.compose(ob, ao=0.6, gradient=(1.0, 1.0), part_jitter=0.0, face_jitter=0.03, seed=args.seed, painters=[wear])


def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    build(args)
    dc.export_asset(ASSET, args)


if __name__ == "__main__":
    scene.run(main)
