"""prop_wagon_tipped: a freight wagon tipped on its side: full-height cover on Front Street (ART_BIBLE 7.4, P0).
The bed is 3.3 x 1.5 x 0.85 m and lies on its side (3.6 m over the broken tongue, 2.1 m to the rim of the wheel in the
air, 1.5 m deep): its plank floor stands as a wall, its open top faces the asset's FRONT (-Y), a drift of sand lies in
it. One 1.2 m wheel with twelve fat spokes hangs in the air on the upper end of the front axle; one lies half buried at
the foot of the rear axle; the other two are long gone. The tongue is snapped off short. One floor board is missing and
one is broken, one sideboard has lost its outer plank: the silhouette is never a box.

Embedded (`placedBy: zone`, bake VL): tint x AO x gradients here (dust skirt, top bleach), lit in place by the zone.
Long boards carry edge loops every 0.8 m so the zone's vertex light has somewhere to fall. Pivot: base centre.

    node tools/build-assets.mjs --only prop_wagon_tipped
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
import bpy

ASSET = "prop_wagon_tipped"


X0, X1 = -1.72, 1.50          # the bed, tail to front
WALL_Y = 0.17                 # the inside face of the floor (now a wall)
OPEN_Y = -0.63                # the open edge of the bed, toward the street
BT = 0.04                     # board thickness
HGT = 1.5                     # the bed's width, now its height
AX_R, AX_F = -1.20, 1.00      # rear and front axle (x)
AX_Y = 0.42


def wheel(name, centre, normal, rng, R=0.6, parts=None, shade=1.0):
    """A 1.2 m wagon wheel: twelve fat spokes, a felloe with an iron tyre, a turned hub. Built flat, then turned so
    its axle lies along `normal`."""
    out = []
    n = 12
    circle = [(math.cos(2 * math.pi * k / n) * (R - 0.04), math.sin(2 * math.pi * k / n) * (R - 0.04), 0.0) for k in range(n)]
    rim = dc.tube(name + "_rim", circle, r=1.0, sides=4, closed=True, flat=(0.035 / math.cos(math.pi / 4), 0.04 / math.cos(math.pi / 4)), phase=math.pi / 4, up=(0, 0, 1))
    dc.paint(rim, "linen", "board", shade=0.9 * shade); out.append(rim)
    for k in range(n):
        a = 2 * math.pi * (k + 0.5) / n + rng.uniform(-0.02, 0.02)
        sp = dc.beam(f"{name}_spoke{k}", (math.cos(a) * 0.085, math.sin(a) * 0.085, 0.0), (math.cos(a) * (R - 0.075), math.sin(a) * (R - 0.075), 0.0),
                     0.062, 0.05, up=(0, 0, 1), cap=(False, False), taper=0.72)
        dc.paint(sp, "linen", "board_bleached", shade=rng.uniform(0.7, 0.86) * shade, ao=False); out.append(sp)
    hub = dc.lathe(name + "_hub", [(0.075, -0.12), (0.11, -0.03), (0.11, 0.05), (0.06, 0.15)], seg=6, cap_first=True, cap_last=True)
    dc.smooth(hub, angle=40); dc.paint(hub, "linen", "board_dark", shade=1.1 * shade); out.append(hub)
    q = Vector((0, 0, 1)).rotation_difference(Vector(normal).normalized())
    for o in out:
        o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = q; o.location = centre
        mesh.apply_transform(o)
        o.rotation_mode = 'XYZ'
    return out


def build(args):
    rng = scene.rng(args.seed)
    j = lambda a: rng.uniform(-a, a)
    parts = []
    def board(name, p0, p1, wide, up, colour, shade=1.0, segs=4, snap=(0.0, 0.0), sag=0.0, thick=BT, drop=(), cap=(True, True), ao=None):
        o = dc.beam(name, p0, p1, wide, thick, up=up, segs=segs, snap=snap, sag=sag, cap=cap, drop=drop, twist=j(0.012))
        dc.paint(o, "linen", colour, shade=shade * rng.uniform(0.92, 1.05), ao=ao); parts.append(o)
        return o
    wood = lambda: rng.choice(("board", "board", "board_bleached"))
    # ---- the floor, standing as a wall: seven boards along the bed, never two the same width. One is gone (the gap
    # shows the running gear behind it), one is snapped off short at the tail
    ws = [rng.uniform(0.17, 0.24) for _ in range(7)]
    k = (HGT - 0.06 - 6 * 0.012) / sum(ws); ws = [w * k for w in ws]
    z = 0.03
    for i, w in enumerate(ws):
        zc = z + w / 2; z += w + 0.012
        if i == 4: continue                                             # the missing board
        x0 = X0 + 0.03 + j(0.015); x1 = X1 - 0.03 + j(0.015); snap = (0.0, 0.0)
        if i == 5: x0 = -0.62; snap = (0.11, 0.0)                       # the broken one
        board(f"floor{i}", (x0, WALL_Y + BT / 2 + j(0.004), zc), (x1, WALL_Y + BT / 2 + j(0.004), zc + j(0.006)), w, (0, 0, 1), wood(), segs=4 if i != 5 else 3, snap=snap)
    # ---- the upper sideboard: three boards, now a shelf over the bed. The outer one is broken away for half its run
    ys = [WALL_Y - 0.02 - 0.265 * i for i in range(4)]
    for i in range(3):
        yc = (ys[i] + ys[i + 1]) / 2
        x0, x1, snap, segs = X0 + 0.02, X1 - 0.02, (0.0, 0.0), 4
        if i == 2: x1 = 0.35; snap = (0.0, 0.16); segs = 3
        board(f"side_u{i}", (x0, yc, HGT - BT / 2 + j(0.006)), (x1, yc + j(0.008), HGT - BT / 2 + j(0.006) - (0.035 if i == 2 else 0.0)), 0.253, (0, 1, 0), "board_bleached", shade=1.05, segs=segs + 1, snap=snap, sag=0.02 * i)
    # ---- the lower sideboard: on the ground, under the drift; only its top and its street edge are ever seen
    for i in range(3):
        yc = (ys[i] + ys[i + 1]) / 2
        board(f"side_l{i}", (X0 + 0.02, yc, BT / 2 + 0.005), (X1 - 0.02, yc, BT / 2 + 0.005), 0.253, (0, 1, 0), "board", shade=0.9, segs=3, drop=("back",) if i < 2 else (), cap=(False, False))
    # ---- the front board (four planks across the bed, now upright) and what is left of the tailgate
    for i in range(4):
        yc = WALL_Y - 0.10 - 0.2 * i
        board(f"front{i}", (X1 - BT / 2, yc + j(0.004), 0.03), (X1 - BT / 2 + j(0.01), yc + j(0.004), HGT - 0.03 - (0.22 if i == 3 else 0.0)), 0.19, (0, 1, 0), wood(), segs=2, snap=(0.0, 0.07 if i == 3 else 0.0))
    board("tail0", (X0 + BT / 2, WALL_Y - 0.12, 0.03), (X0 + BT / 2, WALL_Y - 0.12, HGT - 0.04), 0.21, (0, 1, 0), "board", segs=2)
    board("tail1", (X0 - 0.01, WALL_Y - 0.36, 0.05), (X0 - 0.07, WALL_Y - 0.66, 0.95), 0.2, (0.9, 0.3, 0), "board_bleached", segs=2, snap=(0.0, 0.09))   # swung out on one nail
    # ---- cleats across the upper sideboard (they were its stakes), and the bed's cross sills on the underside
    for i, x in enumerate((X0 + 0.22, -0.1, X1 - 0.25)):
        if i == 2:
            board(f"cleat{i}", (x, WALL_Y, HGT + 0.03), (x, OPEN_Y + 0.26, HGT + 0.03), 0.07, (1, 0, 0), "board_dark", segs=1, thick=0.05, drop=("down",))
        else:
            board(f"cleat{i}", (x, WALL_Y, HGT + 0.03), (x, OPEN_Y - 0.02, HGT + 0.03 - 0.02 * i), 0.07, (1, 0, 0), "board_dark", segs=1, thick=0.05, drop=("down",))
    for i, x in enumerate((AX_R, AX_F)):
        board(f"sill{i}", (x, WALL_Y + BT + 0.07, 0.02), (x, WALL_Y + BT + 0.07, HGT - 0.02), 0.14, (0, 1, 0), "board_dark", segs=3, thick=0.13)
    # ---- the running gear: two axles standing up, the reach between them, the tongue snapped off short
    for i, x in enumerate((AX_R, AX_F)):
        board(f"axle{i}", (x, AX_Y, -0.04), (x, AX_Y + j(0.01), HGT + 0.20), 0.11, (0, 1, 0), "board", shade=0.85, segs=2, thick=0.10)
    board("reach", (AX_R, AX_Y, 0.74), (AX_F, AX_Y, 0.76), 0.09, (0, 0, 1), "board", shade=0.8, segs=4, thick=0.08, cap=(False, False), ao=False)
    for i, sz in enumerate((-1, 1)):                                    # the hounds: two braces from the front axle to the reach
        board(f"hound{i}", (AX_F - 0.02, AX_Y + 0.02, 0.75 + sz * 0.52), (AX_F - 0.85, AX_Y + 0.02, 0.75 + sz * 0.05), 0.06, (0, 1, 0), "board", shade=0.72, segs=2, thick=0.05, cap=(False, False), ao=False)
    board("tongue", (AX_F + 0.04, AX_Y + 0.02, 0.72), (X1 + 0.26, AX_Y + 0.12, 0.28), 0.10, (0, 0, 1), "board_bleached", segs=2, thick=0.085, snap=(0.0, 0.12))
    # iron: the tyre of each wheel is painted on the rim; here the two straps that held the front board
    for i, zz in enumerate((0.35, 1.15)):
        st = dc.beam(f"strap{i}", (X1 + 0.004, WALL_Y + 0.06, zz), (X1 + 0.004, OPEN_Y + 0.24, zz), 0.05, 0.008, up=(0, 0, 1), cap=(False, False), drop=("back",))
        dc.paint(st, "linen", "rust", shade=0.8); parts.append(st)
    # ---- wheels: one in the air on the front axle, canted, free to turn; one half buried at the foot of the rear axle
    top = wheel("wheel_air", (AX_F, AX_Y - 0.02, HGT + 0.20), (-0.12, 0.74, 0.66), rng)
    low = wheel("wheel_sunk", (AX_R + 0.03, AX_Y - 0.02, -0.06), (0.10, -0.42, 0.90), rng, shade=0.92)
    for o in low: dc.drop_faces(o, lambda c, n: c.z < -0.035 or c.y > 0.80)   # what the sand has taken
    gone = [o for o in low if not len(o.data.polygons)]
    low = [o for o in low if len(o.data.polygons)]
    for o in gone: scene.remove(o)
    parts += top + low
    # ---- the drift: sand blown into the open bed, banked against the floor-wall, spilling over the lower board
    def drift(u, v):
        x = X0 + 0.05 + u * (X1 - X0 - 0.10)
        back = 0.42 + 0.20 * math.cos(u * 2.4) + 0.05 * math.sin(u * 9.0)   # how high it stands against the wall
        y = WALL_Y - 0.005 - v * (WALL_Y - OPEN_Y + 0.16)
        t = v * (1.0 + 0.25 * math.sin(u * 6.0 + 1.0) * (1 - v))
        zz = back * max(0.0, 1.0 - t) ** 1.6 + 0.045 * (1 - v) + 0.012 * math.sin(u * 13.0) * (1 - v) * v * 4
        if v > 0.99: zz = 0.003; y -= 0.05 * math.sin(u * 7.0 + 0.5)
        return (x, y, zz)
    sand = dc.sheet("drift", 8, 4, drift, flip=True)
    dc.smooth(sand, angle=60)
    dc.paint(sand, "sand_pale", "sand")
    parts.append(sand)

    # the whole wreck leans back a few degrees on its buried side and has sunk into the street
    for o in parts:
        o.rotation_euler = (math.radians(-3.5), math.radians(0.8), 0.0); o.location = (0.10, 0.02, -0.035)
        mesh.apply_transform(o)
    dc.bake_ao(parts, distance=0.7)
    ob = dc.join(parts, ASSET + "_mesh")
    dc.smooth(ob, angle=30)
    dc.drop_faces(ob, lambda c, n: c.z < -0.02 and n.z < 0.2)

    def weather(p):
        wood_ = p.col[:, 1] < 0.33                                      # everything but the sand
        # iron tyres: the outer face of each rim
        for (c, nrm) in (((AX_F + 0.10, AX_Y, HGT + 0.165), (-0.12, 0.74, 0.66)), ((AX_R + 0.13, AX_Y, -0.095), (0.10, -0.42, 0.90))):
            nv = np.asarray(Vector(nrm).normalized(), dtype=np.float32)
            d = p.fcen - np.asarray(c, dtype=np.float32)[None, :]
            axial = d @ nv
            radial = np.linalg.norm(d - axial[:, None] * nv[None, :], axis=1)
            rn = (p.fnrm * (d - axial[:, None] * nv[None, :])).sum(axis=1) / np.maximum(radial, 1e-4)
            tyre = (radial > 0.55) & (radial < 0.66) & (np.abs(axial) < 0.08) & (rn > 0.7)
            p.mix(tyre * 0.85, "#6A3B28")
        # the bed's inside: shaded, greyer; the sun never got at it
        inside = wood_ & (p.y < WALL_Y + 0.02) & (p.y > OPEN_Y) & (p.z < HGT - 0.05) & (p.fnrm[:, 1] < -0.5)
        p.mul(inside, 0.9)
        # rust weeps from the straps and the cleat nails
        p.mix(wood_ * np.clip(1.0 - np.abs(p.x - (X1 + 0.1)) / 0.05, 0, 1) * (p.z < 1.15) * (p.z > 0.6) * 0.25, "rust")
    dc.compose(ob, ao=0.85, gradient=(0.78, 1.08), dust=0.6, dust_height=0.6, bleach="board_bleached", bleach_fraction=0.2, bleach_amount=0.45,
               part_jitter=0.07, face_jitter=0.0, seed=args.seed, painters=[weather], contact=(0.08, 0.7), z_range=(0.0, 2.1))


def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    build(args)
    dc.export_asset(ASSET, args)


if __name__ == "__main__":
    scene.run(main)
