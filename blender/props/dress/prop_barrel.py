"""prop_barrel: a staved barrel 0.6 x 0.9 m, three hoops, a sunken lid (ART_BIBLE 7.4; P2). Instanced dressing: one
mesh, one material. Pivot: base centre. Staves each their own grey, one sprung proud of the rest; the hoops brown
rust; the head a hand's depth below the chime, with a drift of dust in it.

    node tools/build-assets.mjs --only prop_barrel
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

ASSET = "prop_barrel"


HGT, R_END, R_BELLY = 0.90, 0.25, 0.288
SEG = 12


def build(args):
    rng = scene.rng(args.seed)
    ob, hoops = dc.staved("barrel", HGT, R_END, R_BELLY, hoops=(0.5,), seg=SEG, head_inset=0.05, hoop_w=0.06, hoop_h=0.014,
                           bottom=False, belly=(0.27, 0.73))
    # one stave sprung, and the whole thing a little out of round
    sprung = 2 * math.pi * 4.5 / SEG
    def warp(v):
        a = math.atan2(v.y, v.x); r = math.hypot(v.x, v.y)
        if r > R_END * 0.95:
            k = 1.0 + 0.015 * math.sin(2 * a + 0.4)
            d = abs(math.atan2(math.sin(a - sprung), math.cos(a - sprung)))
            if d < 0.3 and 0.25 < v.z / HGT: k += 0.035 * (v.z / HGT - 0.25)
            v.x *= k; v.y *= k
        return v
    dc.deform(ob, warp)
    dc.smooth(ob, angle=40)
    # the hoop steps are sharp by angle; the stave seams (30 degrees) are marked, so every stave is a flat board with
    # its own colour, while the iron bands run round unbroken
    in_hoop = lambda z: any(z0 - 0.006 < z < z1 + 0.006 for z0, z1 in hoops)
    dc.sharpen(ob, lambda a, b: abs(a.z - b.z) > 0.02 and math.hypot(a.x, a.y) > R_END * 0.95 and not in_hoop((a.z + b.z) / 2))
    dc.paint(ob, "linen", "board")
    ob.name = ASSET + "_mesh"
    dc.bake_ao([ob], distance=0.3)

    def staves(p):
        rad = np.hypot(p.fcen[:, 0], p.fcen[:, 1])
        body = rad > R_END * 0.9
        a = np.arctan2(p.fcen[:, 1], p.fcen[:, 0])
        stave = np.floor((a + math.pi) / (2 * math.pi) * SEG * 2 + 0.5).astype(np.int64) % (SEG * 2)
        r2 = np.random.default_rng(args.seed + 3)
        table = r2.uniform(0.66, 1.12, SEG * 2).astype(np.float32)
        grey = (r2.uniform(0.0, 0.85, SEG * 2) ** 1.5).astype(np.float32)          # some staves have gone grey, some are still brown
        hoop = np.zeros(len(rad), dtype=bool)
        for z0, z1 in hoops: hoop |= (p.fcen[:, 2] > z0 - 0.003) & (p.fcen[:, 2] < z1 + 0.003)
        chime = body & (p.fnrm[:, 2] > 0.9) & (p.fcen[:, 2] > HGT - 0.005)
        hoop &= body & ~chime                                            # not the chime (the staves' cut ends)
        wood = body & ~hoop
        p.mix(wood * grey[stave], "board_bleached")
        p.col[wood] *= table[stave[wood]][:, None]
        for z0, z1 in hoops: p.mix(wood * (p.z < z0) * (p.z > z0 - 0.14) * 0.16, "rust")   # rust weeps below each hoop
        p.mix(chime * 0.5, "board_bleached")
        head = (~body) & (p.fcen[:, 2] > HGT * 0.5)
        p.mul(head, 0.75); p.mix(head * 0.3, "sand")                    # the sunk head holds dust
        p.mix(wood * np.clip(1.0 - p.z / 0.25, 0, 1) * 0.5, "sand")
        p.mix(wood * np.clip((p.z - HGT * 0.8) / (HGT * 0.2), 0, 1) * 0.25, "board_bleached")
        # the iron hoops last: dark brown rust over everything, a little dust on the lowest
        p.mix(hoop * 0.94, "#43271C")
        p.mix(hoop * np.clip(1.0 - p.z / 0.1, 0, 1) * 0.3, "sand")
    dc.compose(ob, ao=0.85, gradient=(0.8, 1.08), part_jitter=0.0, seed=args.seed, painters=[staves], contact=(0.05, 0.65), quiet=True)


def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    build(args)
    dc.export_asset(ASSET, args)


if __name__ == "__main__":
    scene.run(main)
