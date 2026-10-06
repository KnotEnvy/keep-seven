"""prop_chair: a plain ladder-back chair with a rush seat, 0.45 x 0.95 x 0.45 m (ART_BIBLE 7.4, Tally House; P0).
Seat height 0.45 m: `art-enemies`' seated figure sits on it. Embedded eleven times in env_tally_house (the zone script
jitters each copy), so this is shape, AO and colour only. Pivot: base centre. Front (the sitter's knees) is -Y.

Made by hands: the back posts rake and are not the same height, no two slats or stretchers are equal, the rush has
sunk in the middle and worn dark at the front rail.

    node tools/build-assets.mjs --only prop_chair
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

ASSET = "prop_chair"


SEAT = 0.45


def build(args):
    rng = scene.rng(args.seed)
    parts = []
    j = lambda a: rng.uniform(-a, a)
    FX, FY = 0.205, -0.195            # front legs
    BX, BY = 0.172, 0.185             # back posts at the floor (the seat narrows to the back)
    RAKE = 0.055                      # how far the post tops lean back
    # ---- legs and posts: square stock, tapering to the foot, no bottoms
    for s in (-1, 1):
        leg = dc.box(f"leg_f{s}", (0.038, 0.038, 0.463 + j(0.003)), (s * FX, FY, 0.2315), rot=(j(0.012), j(0.012), j(0.05)), taper=(1.12, 1.12), drop=("-z",))
        dc.paint(leg, "linen", "board", shade=1.0 + j(0.05)); parts.append(leg)
        h = 0.95 - (0.012 if s < 0 else 0.0)
        post = dc.box(f"post{s}", (0.04, 0.038, h), (s * BX, BY, h / 2), rot=(0, j(0.01), j(0.05)), taper=(0.8, 0.8), shear=(s * 0.004, RAKE), drop=("-z",))
        dc.paint(post, "linen", "board", shade=1.0 + j(0.05)); parts.append(post)
    def back_y(z): return BY + RAKE * z / 0.95
    # ---- the ladder: three slats, shaved thin and bowed to the back, let into the posts
    for k, (z, hh) in enumerate(((0.565, 0.05), (0.715, 0.055), (0.87, 0.075))):
        tilt = j(0.012); bow = 0.016 + j(0.004); t = 0.014
        y0 = back_y(z) - 0.004
        xs = (-BX + 0.006, 0.0, BX - 0.006)
        f = []; b = []
        for i, x in enumerate(xs):
            yy = y0 + (bow if i == 1 else 0.0); dz = tilt * x / BX
            f.append(((x, yy - t / 2, z - hh / 2 + dz), (x, yy - t / 2, z + hh / 2 + dz + (0.008 if (i == 1 and k == 2) else 0.0))))
            b.append(((x, yy + t / 2, z - hh / 2 + dz), (x, yy + t / 2, z + hh / 2 + dz + (0.008 if (i == 1 and k == 2) else 0.0))))
        faces = []
        for i in range(2):
            faces.append([f[i][0], f[i + 1][0], f[i + 1][1], f[i][1]])            # front
            faces.append([b[i + 1][0], b[i][0], b[i][1], b[i + 1][1]])            # back
            faces.append([f[i][1], f[i + 1][1], b[i + 1][1], b[i][1]])            # top edge
        slat = dc.poly(f"slat{k}", faces)
        dc.paint(slat, "linen", "board_bleached", shade=(0.93, 0.86, 1.0)[k] + j(0.03)); parts.append(slat)
    # ---- the seat: four rails hidden under the rush; the rush wound in four wedges that meet off-centre and sag
    zt = SEAT + 0.004
    c0 = [(-0.215, -0.215), (0.215, -0.215), (0.182, 0.20), (-0.182, 0.20)]
    mid = (0.008, -0.012, SEAT - 0.014)
    rim = [(x, y, zt + j(0.002)) for x, y in c0]
    low = [(x * 0.985, y * 0.985, SEAT - 0.034) for x, y in c0]
    rush = dc.poly("rush", [[rim[i], rim[(i + 1) % 4], mid] for i in range(4)])
    dc.paint(rush, "cord", shade=1.0, part=False)
    skirt = dc.poly("rush_edge", [[low[i], low[(i + 1) % 4], rim[(i + 1) % 4], rim[i]] for i in range(4)])
    dc.paint(skirt, "cord", shade=0.72, ao=False)
    parts += [rush, skirt]
    # ---- stretchers: two in front, two a side, one behind; turned thin where they enter the legs
    def stretcher(name, a, b, w, shade):
        a = Vector(a); b = Vector(b)
        o = dc.tube(name, [a, b], r=w, sides=4, cap=False, phase=math.pi / 4, up=(0, 0, 1))
        dc.paint(o, "linen", "board", shade=shade + j(0.05), ao=False); parts.append(o)
    stretcher("st_f1", (-FX, FY, 0.30 + j(0.01)), (FX, FY, 0.30 + j(0.01)), 0.017, 0.92)
    stretcher("st_f2", (-FX, FY, 0.14 + j(0.01)), (FX, FY, 0.13 + j(0.01)), 0.017, 0.80)       # the one boots rest on
    for s in (-1, 1):
        stretcher(f"st_s{s}a", (s * FX, FY, 0.25 + j(0.012)), (s * BX, back_y(0.25), 0.25 + j(0.012)), 0.015, 0.9)
        stretcher(f"st_s{s}b", (s * FX, FY, 0.10 + j(0.012)), (s * BX, back_y(0.10), 0.11 + j(0.012)), 0.015, 0.85)
    stretcher("st_b", (-BX, back_y(0.2), 0.20), (BX, back_y(0.2), 0.21), 0.015, 0.85)
    dc.bake_ao(parts, distance=0.3)                                    # sticks let into the legs at both ends cast, but take no AO
    ob = dc.join(parts, ASSET + "_mesh")
    dc.smooth(ob, angle=30)

    def wear(p):
        on_rush = (np.abs(p.z - SEAT) < 0.02) & (p.fnrm[:, 2] > 0.5)
        # the rush: the wedges read as four because front/back and the two sides catch the light differently
        side = np.abs(p.fnrm[:, 0]) > np.abs(p.fnrm[:, 1])
        p.mul(on_rush & side, 0.86)
        p.mul(on_rush * dc.P.near(p, (0.0, -0.21, SEAT), 0.16), 0.7)     # worn dark and greasy at the front rail
        p.mul(on_rush * dc.P.near(p, mid, 0.1), 0.8)
        # hands: the top slat and the post tops are polished pale
        p.mix((p.z > 0.84) * (p.fnrm[:, 1] < 0.5) * 0.3, "#A98C74")
        # boots: the low front stretcher and the feet are scuffed dark
        p.mul((p.z < 0.2) * np.clip(1.0 - p.z / 0.2, 0, 1), 0.72)
    dc.compose(ob, ao=0.85, gradient=(0.8, 1.08), part_jitter=0.05, face_jitter=0.03, seed=args.seed, painters=[wear], contact=(0.04, 0.6))


def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    build(args)
    dc.export_asset(ASSET, args)


if __name__ == "__main__":
    scene.run(main)
