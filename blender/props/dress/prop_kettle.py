"""prop_kettle: a squat tin kettle 0.2 x 0.18 m with a bail (stop three: still warm; its steam is VFX).
Embedded (`placedBy: zone`). Pivot: base centre. Front is -Y; the spout points to +X.
The Dowser's: tidy, the bail stood upright, the lid seated, the bottom blacked by one small fire.

    node tools/build-assets.mjs --only prop_kettle
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

ASSET = "prop_kettle"


def build(args):
    SEG = 8
    ph = math.radians(22.5)
    parts = []
    body = dc.lathe("body", [(0.082, 0.0), (0.100, 0.035), (0.094, 0.085), (0.052, 0.112), (0.052, 0.120)], seg=SEG, phase=ph)
    dc.smooth(body, angle=50); dc.paint(body, "chalk", "tin"); parts.append(body)
    lid = dc.lathe("lid", [(0.056, 0.118), (0.05, 0.128), (0.0, 0.136)], seg=SEG, phase=ph)
    dc.smooth(lid, angle=50); dc.paint(lid, "chalk", "tin", shade=1.08); parts.append(lid)
    knob = dc.box("knob", (0.018, 0.018, 0.018), (0, 0, 0.143), taper=(1.4, 1.4), drop=("-z",), rot=(0, 0, 0.4))
    dc.paint(knob, "chalk", "#2A2623"); parts.append(knob)
    spout = dc.tube("spout", [(0.075, 0, 0.04), (0.125, 0, 0.075), (0.148, 0, 0.122)], r=[0.024, 0.016, 0.011], sides=4, cap=True, phase=math.pi / 4, up=(0, 1, 0))
    dc.smooth(spout, angle=50); dc.paint(spout, "chalk", "tin", shade=0.95); parts.append(spout)
    # ears and the bail, standing (he set it so): fat wire with a turned wood grip
    for s in (-1, 1):
        ear = dc.box(f"ear{s}", (0.012, 0.022, 0.03), (0, s * 0.062, 0.118), rot=(s * -0.35, 0, 0), drop=("-z",))
        dc.paint(ear, "chalk", "tin", shade=0.8, ao=False); parts.append(ear)
    bail = dc.tube("bail", [(0, -0.064, 0.125), (0.004, -0.07, 0.158), (0.008, -0.032, 0.181), (0.008, 0.032, 0.181), (0.004, 0.07, 0.158), (0, 0.064, 0.125)], r=0.0048, sides=3, cap=False, up=(1, 0, 0))
    dc.paint(bail, "chalk", "#3C3A3A", ao=False); parts.append(bail)
    grip = dc.tube("grip", [(0.008, -0.026, 0.181), (0.008, 0.026, 0.181)], r=0.0095, sides=4, cap=True, up=(1, 0, 0))
    dc.paint(grip, "chalk", "board", ao=False); parts.append(grip)
    dc.bake_ao(parts, distance=0.15)
    ob = dc.join(parts, ASSET + "_mesh")
    dc.drop_faces(ob, lambda c, n: False)

    def soot(p):
        rad = np.hypot(p.x, p.y)
        tin = (p.col[:, 0] > 0.15) & (p.col[:, 0] < 0.5)
        p.mix(tin * np.clip(1.0 - p.z / 0.06, 0, 1) ** 0.8 * 0.92, "#1B1817")         # blacked by the fire
        p.mix(tin * np.clip(1.0 - np.abs(p.z - 0.085) / 0.03, 0, 1) * (rad > 0.08) * 0.25, "#B9B3A6")   # the shoulder scoured bright
    dc.compose(ob, ao=0.8, gradient=(0.9, 1.05), part_jitter=0.0, face_jitter=0.02, seed=args.seed, painters=[soot], contact=(0.012, 0.7))


def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    build(args)
    dc.export_asset(ASSET, args)


if __name__ == "__main__":
    scene.run(main)
