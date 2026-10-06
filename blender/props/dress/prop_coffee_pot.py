"""prop_coffee_pot: his coffee pot (stop one). A blue-grey enamelled tin pot 0.16 x 0.22 m: spout, wire handle, the rim
chipped to black iron, the foot sooted, the lid off and set beside it, the inside black (the coffee gone to tar: it is
how she reads two days). Embedded by the zone (`placedBy: zone`): AO + gradients here, lit in place there.
Pivot: base centre of the pot. Front is -Y; the spout points to +X, the lid lies beside the pot on the +X side
(on the flat stone: pot and lid both fit its 0.5 x 0.35 m top).

    node tools/build-assets.mjs --only prop_coffee_pot
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

ASSET = "prop_coffee_pot"


ENAMEL = "#7B91A3"            # blue-grey enamel, painted over the pale `enamel` cell
IRON = "#23201F"


def build(args):
    SEG = 8
    RB, RT, H = 0.079, 0.058, 0.215
    ph = math.radians(22.5)
    # ---- the pot: up the outside (a shoulder loop), over the rolled lip, down the neck to the tar
    prof = [(RB, 0.0), (RB - 0.004, 0.11), (RT + 0.002, H), (RT - 0.006, H - 0.004), (RT - 0.004, 0.13)]
    pot = dc.lathe("pot", prof, seg=SEG, phase=ph, cap_last=True)
    dc.smooth(pot, angle=50)
    dc.paint(pot, "enamel", ENAMEL)
    # ---- the spout: a tapering square-ish tube from low on the +X side, open at the tip
    sp = [(RB - 0.022, 0.0, 0.07), (RB + 0.03, 0.0, 0.135), (RB + 0.052, 0.0, 0.197)]
    spout = dc.tube("spout", sp, r=[0.024, 0.016, 0.0115], sides=4, cap=False, phase=math.pi / 4, up=(0, 1, 0))
    dc.smooth(spout, angle=50); dc.paint(spout, "enamel", ENAMEL)
    tip = dc.tube("spout_bore", [(sp[2][0] - 0.004, 0, sp[2][2] - 0.011), (sp[2][0] - 0.0005, 0, sp[2][2] - 0.001)], r=0.0095, sides=4, cap=True, phase=math.pi / 4, up=(0, 1, 0))
    dc.drop_faces(tip, lambda c, n: n.z < 0.3)                          # only the dark mouth of the spout
    dc.paint(tip, "enamel", IRON)
    # ---- the handle: a bent iron strap on the -X side, riveted at the shoulder and at the belly
    hp = [(-RT - 0.002, 0.0, H - 0.034), (-RT - 0.034, 0.0, H - 0.014), (-RB - 0.040, 0.0, H - 0.055), (-RB - 0.046, 0.0, 0.115), (-RB + 0.004, 0.0, 0.058)]   # an ear, not a bracket
    handle = dc.tube("handle", hp, r=[0.0095, 0.0085, 0.0085, 0.0085, 0.010], sides=4, cap=False, flat=(0.45, 1.0), phase=math.pi / 4, up=(0, 0, 1))
    dc.smooth(handle, angle=40); dc.paint(handle, "enamel", IRON)
    # ---- the lid, set down in front of the pot, the right way up, its knob to the sky
    lx, ly = RB + 0.082, -0.03
    lid = dc.lathe("lid", [(RT + 0.007, 0.0), (RT + 0.004, 0.008), (0.0, 0.03)], seg=SEG, phase=ph + 0.3, centre=(lx, ly, 0.0))
    dc.smooth(lid, angle=50); dc.paint(lid, "enamel", ENAMEL)
    knob = dc.lathe("lid_knob", [(0.0065, 0.026), (0.0125, 0.042)], seg=5, phase=0.6, centre=(lx, ly, 0.0), cap_last=True)   # a turned button
    dc.smooth(knob, angle=50)
    dc.paint(knob, "enamel", IRON)
    ob = dc.join([pot, spout, tip, handle, lid, knob], ASSET + "_mesh")
    # the lid does not lie quite flat: one edge rides on a pebble's worth of grit
    for v in ob.data.vertices:
        d = math.hypot(v.co.x - lx, v.co.y - ly)
        if d < RT + 0.02 and v.co.x > RB + 0.004: v.co.z += 0.004 + 0.07 * (v.co.y - ly + 0.07) * 0.5
    ob.data.update()

    dc.bake_ao([ob], distance=0.2)

    def wear(p):
        rad = np.hypot(p.x, p.y)
        on_pot = rad < RB + 0.004
        # the inside: black. Faces looking inward at the axis, and the tar itself
        inward = ((p.fnrm[:, 0] * p.fcen[:, 0] + p.fnrm[:, 1] * p.fcen[:, 1]) < -1e-4) & (np.hypot(p.fcen[:, 0], p.fcen[:, 1]) < RT)
        tar = (p.fnrm[:, 2] > 0.9) & (np.hypot(p.fcen[:, 0], p.fcen[:, 1]) < RT * 0.7) & (p.fcen[:, 2] > 0.1)
        p.mix((inward | tar) * 0.93, "#141110")
        # soot: the foot stood in a fire for years; it climbs highest on the side away from the handle
        outer = on_pot & ~inward & ~tar
        soot = np.clip(1.0 - p.z / (0.075 + 0.03 * np.clip(p.x / RB, -1, 1)), 0, 1) ** 1.2
        p.mix(outer * soot * 0.85, "#1B1817")
        # the chipped rim: enamel gone to black iron in three bites, and a bright worn band where the lid rides
        ang = np.arctan2(p.y, p.x)
        rim = on_pot & (p.z > H - 0.012) & ~inward
        chips = np.zeros_like(p.z)
        for a0, w in ((0.6, 0.5), (2.5, 0.42), (-1.9, 0.6)):
            d = np.abs(np.angle(np.exp(1j * (ang - a0))))
            chips = np.maximum(chips, np.clip(1.0 - d / w, 0, 1))
        p.mix(rim * np.clip(chips * 1.6, 0, 1), IRON)
        # the lid: chipped at its edge, sooted underneath, dusty on top
        on_lid = (np.hypot(p.x - lx, p.y - ly) < RT + 0.012) & (p.x > RB + 0.004)
        lid_edge = on_lid & (p.z < 0.016)
        d2 = np.abs(np.angle(np.exp(1j * (np.arctan2(p.y - ly, p.x - lx) - 2.2))))
        p.mix(lid_edge * np.clip(1.0 - d2 / 0.9, 0, 1), IRON)
        p.mix(on_lid * (p.fnrm[:, 2] > 0.3) * (p.z < 0.034) * 0.07, "sand")
        # dust on the shoulder: two days of wind under the overhang
        p.mix(outer * np.clip(p.nrm[:, 2], 0, 1) * 0.3, "sand")
    dc.compose(ob, ao=0.8, gradient=(0.9, 1.04), part_jitter=0.0, face_jitter=0.025, seed=args.seed, painters=[wear], contact=(0.015, 0.7))


def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    build(args)
    dc.export_asset(ASSET, args)


if __name__ == "__main__":
    scene.run(main)
