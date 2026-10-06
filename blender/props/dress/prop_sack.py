"""prop_sack: a slumped grain sack 0.7 x 0.3 x 0.4 m (ART_BIBLE 7.4; P2). Instanced dressing: one mesh, one material.
Pivot: base centre. It lies on its side, settled flat underneath, the full end fat, the tied neck flopped over, a seam
down its length. Just a sack: nothing on it reads as a face.

    node tools/build-assets.mjs --only prop_sack
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

ASSET = "prop_sack"


def build(args):
    rng = scene.rng(args.seed)
    L, D, HT = 0.60, 0.40, 0.30
    # a lathe along +X with an egg profile, squashed and settled
    prof = [(0.0, 0.0), (0.105, 0.03), (0.150, 0.16), (0.142, 0.34), (0.105, 0.50), (0.045, 0.585)]
    def settle(v):
        # v is in the lathe's own frame (axis +Z); lumps, then the axis is laid along X below
        a = math.atan2(v.y, v.x)
        k = 1.0 + 0.07 * math.sin(3 * a + v.z * 9.0) + 0.04 * math.sin(5 * a + 1.3)
        return Vector((v.x * k * (D / 0.30), v.y * k, v.z))
    body = dc.lathe("body", prof, seg=7, phase=0.3, warp=settle)
    dc.place(body, (-0.33, 0.0, 0.125), (0, math.radians(90), 0))
    def flat(v):
        if v.z < 0.0: v.z = 0.0 + (v.z) * 0.08                           # it has settled flat on the ground
        v.z += 0.02 * math.sin(v.x * 7.0)
        return v
    dc.deform(body, flat)
    dc.smooth(body, angle=55)
    dc.paint(body, "linen", "#A58B63")
    # the neck: gathered, tied with cord, the ears flopped over to one side
    neck = dc.tube("neck", [(0.255, 0.0, 0.135), (0.31, 0.02, 0.12), (0.365, 0.055, 0.075)], r=[0.046, 0.028, 0.058], sides=5, cap=True, flat=(1.0, 0.55), up=(0, 0, 1))
    dc.smooth(neck, angle=50); dc.paint(neck, "linen", "#A58B63", shade=0.92)
    tie = dc.tube("tie", [(0.303, 0.012, 0.123), (0.317, 0.022, 0.118)], r=[0.036, 0.036], sides=5, cap=False, flat=(1.0, 0.7), up=(0, 0, 1))
    dc.paint(tie, "linen", "#6E5A40", ao=False)
    parts = [body, neck, tie]
    dc.bake_ao(parts, distance=0.2)
    ob = dc.join(parts, ASSET + "_mesh")
    dc.drop_faces(ob, lambda c, n: c.z < 0.012 and n.z < -0.5)

    def cloth(p):
        p.mul(np.clip(1.0 - np.abs(p.y - 0.02) / 0.03, 0, 1) * (p.nrm[:, 2] > 0.4) * (p.x < 0.25), 0.82)   # the seam along its back
        p.mix(np.clip(1.0 - p.z / 0.08, 0, 1) * 0.5, "sand")
        p.mul(dc.P.near(p, (-0.12, -0.12, 0.2), 0.14), 0.85)             # a dark patch where something leaked once
    dc.compose(ob, ao=0.85, gradient=(0.82, 1.06), part_jitter=0.0, face_jitter=0.02, seed=args.seed, painters=[cloth], contact=(0.03, 0.65), quiet=True)


def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    build(args)
    dc.export_asset(ASSET, args)


if __name__ == "__main__":
    scene.run(main)
