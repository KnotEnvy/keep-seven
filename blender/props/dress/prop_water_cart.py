"""prop_water_cart: the town's water cart, left where it stopped: a two-wheeled cart carrying a 1.2 x 1.8 m staved
barrel on its side, its shafts dropped on the ground, the bung out (ART_BIBLE 7.4; P1). 3.2 x 2.1 x 1.6 m: cover in the
pump yard. Embedded (`placedBy: zone`): tint x AO x gradients, dust skirt, top bleach. Pivot: base centre.

The cart has pitched forward onto its shaft tips, so the barrel tilts nose-down and its tail stands highest. Four iron
hoops, staves each their own grey, two 1.3 m wheels with ten spokes, a spigot low in the rear head, the bung lying in
the sand under the hole it came out of.

    node tools/build-assets.mjs --only prop_water_cart
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

ASSET = "prop_water_cart"


AXLE_X, AXLE_Z = -0.55, 0.65
BED_Z = 0.74
PITCH = math.radians(13.0)
B_LEN, B_END, B_BELLY = 1.8, 0.50, 0.60
B_X0 = -1.45
B_Z = BED_Z + 0.03 + B_BELLY - 0.07          # the barrel's axis


def build(args):
    rng = scene.rng(args.seed)
    j = lambda a: rng.uniform(-a, a)
    parts = []
    def board(name, p0, p1, wide, up, colour, shade=1.0, segs=1, thick=0.07, cap=(True, True), ao=None, snap=(0.0, 0.0)):
        o = dc.beam(name, p0, p1, wide, thick, up=up, segs=segs, cap=cap, snap=snap, twist=j(0.01))
        dc.paint(o, "linen", colour, shade=shade * rng.uniform(0.93, 1.05), ao=ao); parts.append(o)
        return o
    # ---- the frame: two long rails that run on to become the shafts, four cross bars, the axle
    for s in (-1, 1):
        board(f"rail{s}", (-1.50, s * 0.50, BED_Z), (1.72, s * 0.36, BED_Z + 0.02), 0.10, (0, 0, 1), "board", segs=2, thick=0.075, snap=(0.0, 0.03 if s > 0 else 0.0))
    for i, (x, hw) in enumerate(((-1.42, 0.58), (-0.55, 0.60), (0.36, 0.53), (1.50, 0.40))):
        board(f"cross{i}", (x, -hw, BED_Z - 0.01), (x, hw, BED_Z - 0.01 + j(0.006)), 0.08, (0, 0, 1), "board_dark" if i < 3 else "board", segs=1, thick=0.09, shade=1.15, ao=False)
    board("axle", (AXLE_X, -0.72, AXLE_Z), (AXLE_X, 0.72, AXLE_Z), 0.10, (0, 0, 1), "board_dark", segs=2, thick=0.10, shade=1.1, cap=(False, False))
    # ---- two saddles the barrel lies in, and wedges knocked in beside it
    for i, x in enumerate((-1.12, 0.02)):
        board(f"saddle{i}", (x, -0.52, BED_Z + 0.085), (x, 0.52, BED_Z + 0.085), 0.11, (0, 0, 1), "board_bleached", segs=1, thick=0.12, ao=False, shade=0.85)
        for s in ((-1,) if i == 0 else ()):
            w = dc.box(f"wedge{i}{s}", (0.10, 0.20, 0.13), (x, s * 0.43, BED_Z + 0.20), rot=(s * 0.5, 0, j(0.1)), taper=(1.0, 0.25), drop=("-z",))
            dc.paint(w, "linen", "board", shade=0.9); parts.append(w)
    # ---- the barrel: staved, four iron hoops, sunk heads
    barrel, hoop_z = dc.staved("barrel", B_LEN, B_END, B_BELLY - 0.016, hoops=(0.31, 0.69), seg=8, head_inset=0.045, hoop_w=0.075, hoop_h=0.016, edge=0.005, chime=(False, False))
    dc.smooth(barrel, angle=42)
    dc.place(barrel, (B_X0, 0.0, B_Z), (0, math.radians(90), 0))
    dc.paint(barrel, "linen", "board")
    parts.append(barrel)
    # the bung hole on top of the belly (dark), and a spigot low in the rear head
    bx = B_X0 + B_LEN * 0.52
    hole = dc.poly("bung_hole", [(bx + 0.035 * math.cos(a), 0.035 * math.sin(a) + 0.02, B_Z + B_BELLY - 0.02) for a in [math.radians(72 * k) for k in range(5)]])
    dc.paint(hole, "linen", "#16110F", ao=False); parts.append(hole)
    sp = dc.beam("spigot", (B_X0 + 0.02, 0.0, B_Z - 0.30), (B_X0 - 0.13, 0.0, B_Z - 0.33), 0.045, 0.045, up=(0, 0, 1), cap=(False, False), taper=0.6)
    dc.paint(sp, "linen", "#3C3A3A"); parts.append(sp)
    tap = dc.beam("spigot_key", (B_X0 - 0.08, 0.0, B_Z - 0.30), (B_X0 - 0.085, 0.02, B_Z - 0.22), 0.05, 0.014, up=(1, 0, 0), cap=(False, False))
    dc.paint(tap, "linen", "#3C3A3A", shade=1.2, ao=False); parts.append(tap)
    # ---- wheels: 1.3 m, ten spokes, toed out a little on a worn axle. Pass i1: an 18-segment felloe with an iron tyre
    # (it was a decagon); paid for by the rails' and the axle's spare loops, the barrel's chime rings and one wedge
    for s in (-1, 1):
        parts += dc.wheel(f"wheel{s}", (AXLE_X, s * 0.66, AXLE_Z), (0.03 * s, s, 0.05), rng, R=0.65, spokes=10, rim_segs=18, shade=0.95, inner_cap=False, spoke_sides=3)
    # ---- pitch it forward onto the shaft tips
    R = Matrix.Translation((AXLE_X, 0, AXLE_Z)) @ Matrix.Rotation(PITCH, 4, 'Y') @ Matrix.Translation((-AXLE_X, 0, -AXLE_Z))
    for o in parts:
        o.data.transform(R); o.data.update()
    # the bung, in the sand under where it fell; the whole thing has sunk a little
    bung = dc.lathe("bung", [(0.034, 0.0), (0.04, 0.05)], seg=3, cap_last=True, centre=(bx - 0.25, -0.78, 0.0))
    dc.place(bung, (0, 0, 0.012), (0.9, 0.3, 0))
    dc.paint(bung, "linen", "board_bleached"); parts.append(bung)
    for o in parts:
        o.location = (0.0, 0.0, -0.03); mesh.apply_transform(o)
    dc.bake_ao(parts, distance=0.7)
    ob = dc.join(parts, ASSET + "_mesh")
    dc.smooth(ob, angle=38)
    dc.drop_faces(ob, lambda c, n: c.z < -0.02 and n.z < 0.3)

    # the barrel's own frame after the pitch, for the painter
    Ri = np.array(R.inverted(), dtype=np.float32)
    def staves(p):
        q = p.fcen.copy(); q[:, 2] += 0.03
        loc = q @ Ri[:3, :3].T + Ri[:3, 3]                              # back to the unpitched cart
        ax = loc[:, 0] - B_X0; rad = np.hypot(loc[:, 1], loc[:, 2] - B_Z)
        on = (ax > -0.01) & (ax < B_LEN + 0.01) & (rad > B_END * 0.3) & (rad < B_BELLY + 0.03) & (np.abs(loc[:, 1]) < 0.65) & (p.col[:, 0] > 0.1)
        body = on & (rad > B_END * 0.9)
        ang = np.arctan2(loc[:, 2] - B_Z, loc[:, 1])
        stave = np.floor((ang + math.pi) / (2 * math.pi) * 16).astype(np.int64) % 16     # two staves a facet
        table = np.random.default_rng(args.seed + 5).uniform(0.82, 1.08, 16).astype(np.float32)
        p.mul(body, 1.0); p.col[body] *= table[stave[body]][:, None]
        hoop = np.zeros(len(ax), dtype=bool)
        for z0, z1 in hoop_z: hoop |= (ax > z0 - 0.004) & (ax < z1 + 0.004)
        hoop &= body & (rad > B_END + 0.003)                            # the bands and their risers, not the chime
        wood = body & ~hoop
        grey = (np.random.default_rng(args.seed + 6).uniform(0.0, 0.8, 16) ** 1.5).astype(np.float32)
        p.mix(wood * grey[stave], "board_bleached")                     # some staves have gone grey
        for z0, z1 in hoop_z:                                           # and what has run out of them down the staves
            below = wood & (ax > z1) & (ax < z1 + 0.12) & (loc[:, 2] < B_Z)
            p.mix(below * 0.18, "rust")
        head = on & (rad < B_END * 0.9)
        p.mul(head, 0.8)
        # the wet that ran from the bung and from the spigot, long dried: a dark tongue
        p.mul(wood * np.clip(1.0 - np.abs(ax - B_LEN * 0.52) / 0.12, 0, 1) * (loc[:, 2] > B_Z), 0.75)
        p.mix(hoop * 0.94, "#43271C")                                   # the iron hoops last: dark brown rust, not orange
    dc.compose(ob, ao=0.85, gradient=(0.78, 1.08), dust=0.6, dust_height=0.6, bleach="board_bleached", bleach_fraction=0.22, bleach_amount=0.45,
               part_jitter=0.07, seed=args.seed, painters=[staves], contact=(0.08, 0.7), z_range=(0.0, 2.1))


def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    build(args)
    dc.export_asset(ASSET, args)


if __name__ == "__main__":
    scene.run(main)
