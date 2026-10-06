"""prop_cup_tin: a dented tin cup 0.09 x 0.08 m with a wire handle (ART_BIBLE 7.4; work order art-props 5, P0).

The kneeler's hand prop, the cup hung by the dispensers, and the Dowser's cup at stop two: the dregs dried to a dark
ring inside (vertex colour). Instanced: one mesh, one material. Pivot: base centre. 60 triangles.

    node tools/build-assets.mjs --only prop_cup_tin
    node tools/preview-asset.mjs prop_cup_tin --cycles --game
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
from mathutils import Vector
from lib import scene
import dress_common as dc

ASSET = "prop_cup_tin"


def build(args):
    R0, R1, H = 0.036, 0.045, 0.08                                     # foot radius, lip radius (it flares), height
    SEG = 7
    knock = math.radians(-35)                                          # where the lip took its knock: front-right
    kd = Vector((math.cos(knock), math.sin(knock), 0.0))

    def warp(v):
        d = Vector((v.x, v.y, 0.0))
        if d.length > 1e-6 and v.z > 0.05:
            # a dent, not a notch: the knock lies BETWEEN two lip vertices (the phase below), so a whole segment of the
            # lip is pushed in flat and a little down, and the lip either side of it bulges
            c = d.normalized().dot(kd)
            if c > 0.8: v = v - kd * 0.0045 - Vector((0, 0, 0.0015))
            elif c > 0.2: v = v + d.normalized() * 0.001
        v.x += 0.003 * (v.z / H)                                       # it no longer stands quite true
        return v

    # one skin: up the outside, over a knife lip (tin is 1 mm), down the inside to the floor
    prof = [(R0, 0.0), (R1, H), (R0 - 0.003, 0.006)]
    body = dc.lathe("cup_body", prof, seg=SEG, phase=knock + math.pi / SEG, warp=warp, cap_last=True)
    dc.smooth(body, angle=75)
    dc.paint(body, "chalk", "tin")                                     # a pale cell: the worn lip is brighter than tin
    # the wire handle: a round ear of bent wire at the back-left (drawn fat: 8 mm), five points so it is a loop
    a = math.radians(150); ux, uy = math.cos(a), math.sin(a)
    def at(r, z): return (ux * r, uy * r, z)
    pts = [at(R1 - 0.007, H - 0.018), at(R1 + 0.010, H - 0.013), at(R1 + 0.019, H - 0.030), at(R1 + 0.010, 0.032), at(R0 + 0.004, 0.030)]
    handle = dc.tube("cup_handle", pts, r=0.0036, sides=3, cap=False, up=(0, 0, 1))
    dc.smooth(handle, angle=60)
    dc.paint(handle, "chalk", "tin", shade=0.7)
    cup = dc.join([body, handle], ASSET + "_mesh")

    dc.bake_ao([cup], distance=0.12)

    def inside(p):
        rad = np.hypot(p.fcen[:, 0], p.fcen[:, 1])
        inward = (p.fnrm[:, 0] * p.fcen[:, 0] + p.fnrm[:, 1] * p.fcen[:, 1]) < 0
        bore = inward & (rad < R1) & (np.abs(p.fnrm[:, 2]) < 0.8)
        floor = (p.fnrm[:, 2] > 0.8) & (rad < R0)
        # the dried ring: bright tin at the lip, running down to a near-black band where the wall meets the floor;
        # the floor itself a paler dry brown, so the band reads as a RING from above (wall and floor split at the corner)
        t = np.clip((p.z - 0.006) / (H - 0.006), 0, 1)
        p.col[bore] *= (0.42 + 0.50 * t[bore] ** 0.6)[:, None]
        p.mix(bore * np.clip(1.0 - t / 0.45, 0, 1) ** 0.7 * 0.92, "#1C120C")
        p.col[floor] = np.asarray(dc.vcol.rgb("#6B5846"), dtype=np.float32)[None, :]
    def lip(p):
        outer = (p.fnrm[:, 0] * p.fcen[:, 0] + p.fnrm[:, 1] * p.fcen[:, 1]) > 0
        p.mix(outer * np.clip((p.z - (H - 0.02)) / 0.02, 0, 1) * 0.3, "#C9C3B4")   # worn bright by mouths
        p.mul(dc.P.near(p, tuple(kd * R1 * 0.95 + Vector((0, 0, H - 0.01))), 0.03), 0.8)   # the dent holds a shadow
    dc.compose(cup, ao=0.6, gradient=(0.82, 1.06), part_jitter=0.0, face_jitter=0.03, seed=args.seed,
               painters=[inside, lip], contact=(0.012, 0.7))


def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    build(args)
    dc.export_asset(ASSET, args)


if __name__ == "__main__":
    scene.run(main)
