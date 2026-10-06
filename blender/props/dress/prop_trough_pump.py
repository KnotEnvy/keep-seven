"""prop_trough_pump: the dry trough on Front Street. A plank trough 0.6 m wide and 0.5 m high with a hand-pump on a
timber post at its west end (iron, the long handle left UP), sand to the brim, the town's brushed mark on the trough's
east end, struck through with one ruled graphite line at 22 degrees (ART_BIBLE 5.6, 7.4; nar_marks). Overall
2.4 x 1.6 x 0.6 m. Embedded (`placedBy: zone`). Pivot: base centre.

The kneeler sets its cup on the rim: each long side carries a FLAT cap board 0.12 m wide at 0.5 m. The sand inside is
scooped hollow on the front (-Y) side, where it kneels.

    node tools/build-assets.mjs --only prop_trough_pump
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

ASSET = "prop_trough_pump"


TX0, TX1 = -0.82, 1.20         # the trough, pump end to mark end
RIM = 0.50
HW_TOP, HW_BOT = 0.30, 0.215   # half widths over the rims / at the floor: the sides flare
PX = -1.02                     # the pump post


def brushed_mark(parts, rng):
    """The town's copy of the mark on the trough end (+X face): six blobs, a dragged stroke that wanders, a
    thumb-print seventh; then the Dowser's line through it, ruled, at 22 degrees."""
    U = 0.088
    x = TX1 + 0.006
    cz = 0.385                                                         # ring centre
    polys = []
    def blob(cy, czz, r, n=6):
        ph = rng.uniform(0, 1.0)
        return [(x, cy + math.cos(ph + 2 * math.pi * k / n) * r * rng.uniform(0.8, 1.15), czz + math.sin(ph + 2 * math.pi * k / n) * r * rng.uniform(0.8, 1.15)) for k in range(n)]
    for n in range(6):
        a = math.radians(30 + 60 * n + rng.uniform(-7, 7))
        polys.append(blob(math.sin(a) * U * rng.uniform(0.9, 1.08), cz + math.cos(a) * U * rng.uniform(0.9, 1.08), 0.25 * U))
    w = 0.012
    mid = (0.012, cz - U * 1.05)
    polys.append([(x, -w, cz + 0.005), (x, w, cz), (x, mid[0] + w, mid[1]), (x, mid[0] - w, mid[1])])
    polys.append([(x, mid[0] - w, mid[1]), (x, mid[0] + w, mid[1]), (x, -0.004 + w * 0.8, cz - U * 2.08), (x, -0.004 - w * 0.8, cz - U * 2.1)])
    polys.append(blob(-0.004, cz - U * 2.36, 0.30 * U))
    mark = dc.poly("mark", polys)
    dc.paint(mark, "linen", "town_paint", shade=0.95, ao=False)
    # the strike: one ruled line, 22 degrees, a little longer than the mark is wide
    t = math.radians(22); L = 0.20; h = 0.0045
    c = (0.0, cz - U * 0.7)
    d = (math.cos(t), math.sin(t)); n2 = (-d[1], d[0])
    q = [(x + 0.003, c[0] + sx * d[0] * L + sy * n2[0] * h, c[1] + sx * d[1] * L + sy * n2[1] * h) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    strike = dc.poly("strike", [q])
    dc.paint(strike, "linen", "graphite", ao=False)
    for o in (mark, strike): dc.drop_faces(o, lambda c_, n_: False)
    parts += [mark, strike]


def build(args):
    rng = scene.rng(args.seed)
    j = lambda a: rng.uniform(-a, a)
    parts = []
    def board(name, p0, p1, wide, up, colour, shade=1.0, segs=3, thick=0.035, snap=(0.0, 0.0), drop=(), cap=(True, True), sag=0.0, ao=None):
        o = dc.beam(name, p0, p1, wide, thick, up=up, segs=segs, snap=snap, cap=cap, drop=drop, sag=sag, twist=j(0.01))
        dc.paint(o, "linen", colour, shade=shade * rng.uniform(0.93, 1.05), ao=ao); parts.append(o)
        return o
    wood = lambda: rng.choice(("board", "board", "board_bleached"))
    # ---- the two long sides: two planks each, flaring out to the rim; a flat cap board on top of each
    for s in (-1, 1):
        flare = Vector((0.0, s * (HW_TOP - 0.06 - HW_BOT), RIM - 0.11)).normalized()
        for i in range(2):
            z0, z1 = 0.105 + i * 0.185, 0.105 + (i + 1) * 0.185 - 0.01
            zc = (z0 + z1) / 2; f = (zc - 0.10) / (RIM - 0.11)
            yc = s * (HW_BOT + (HW_TOP - 0.06 - HW_BOT) * f)
            board(f"side{s}{i}", (TX0 + j(0.01), yc, zc), (TX1 + j(0.012), yc + j(0.004), zc + j(0.004)), z1 - z0, flare, wood(), segs=3, cap=(True, True))
        board(f"rim{s}", (TX0 - 0.03, s * (HW_TOP - 0.06), RIM - 0.016), (TX1 + 0.035, s * (HW_TOP - 0.06) + j(0.004), RIM - 0.016 + j(0.003)), 0.12, (0, 1, 0), "board_bleached", shade=1.06, segs=3, thick=0.032)
    # ---- the ends: two planks each, let in between the sides
    for e, x in ((0, TX0 + 0.02), (1, TX1 - 0.02)):
        for i in range(2):
            z0, z1 = 0.105 + i * 0.185, 0.105 + (i + 1) * 0.185 - 0.008
            hw = HW_BOT + (HW_TOP - 0.06 - HW_BOT) * ((z0 + z1) / 2 - 0.10) / (RIM - 0.11) + 0.02
            board(f"end{e}{i}", (x, -hw, (z0 + z1) / 2), (x, hw, (z0 + z1) / 2 + j(0.004)), z1 - z0, (0, 0, 1), wood(), segs=1, thick=0.04, cap=(False, False), ao=False, shade=0.9)
    # ---- two sleepers it stands on, and two iron straps round its belly
    for i, x in enumerate((TX0 + 0.33, TX1 - 0.36)):
        board(f"sleeper{i}", (x + j(0.02), -0.30, 0.05), (x + j(0.02), 0.30 + j(0.02), 0.05), 0.11, (0, 0, 1), "board_dark", shade=1.1, segs=1, thick=0.13)
        xs = x + 0.16 * (1 if i == 0 else -1)
        for s in (-1, 1):
            st = dc.poly(f"strap{i}{s}", [[(xs - 0.022, s * (HW_BOT - 0.012), 0.10), (xs + 0.022, s * (HW_BOT - 0.012), 0.10), (xs + 0.022, s * (HW_TOP - 0.036), RIM - 0.034), (xs - 0.022, s * (HW_TOP - 0.036), RIM - 0.034)][::(1 if s < 0 else -1)]])
            dc.deform(st, lambda v, s=s: Vector((v.x, v.y + s * 0.022, v.z)))
            dc.paint(st, "linen", "#6E3A26", shade=0.9, ao=False); parts.append(st)
    # ---- sand to the brim: mounded against the pump end, scooped hollow at the front where the kneeler works
    def sand_fn(u, v):
        x = TX0 + 0.04 + u * (TX1 - TX0 - 0.08)
        y = (v - 0.5) * 2 * (HW_TOP - 0.085)
        z = RIM - 0.045 + 0.022 * math.cos(u * 3.0) - 0.03 * (abs(2 * v - 1) ** 2)
        scoop = math.exp(-((x - 0.25) / 0.22) ** 2 - ((y + 0.10) / 0.13) ** 2)
        return (x, y, z - 0.085 * scoop)
    sand = dc.sheet("sand", 7, 2, sand_fn)
    dc.smooth(sand, angle=60); dc.paint(sand, "sand_pale", "sand"); parts.append(sand)
    brushed_mark(parts, rng)
    # ---- the pump: a timber post, an iron barrel with a domed cap and a spout over the trough, the handle left up
    board("post", (PX, 0.0, 0.0), (PX + 0.012, 0.01, 0.86), 0.15, (0, 1, 0), "board", shade=0.9, segs=2, thick=0.15, cap=(False, True))
    board("post_foot", (PX - 0.15, 0.0, 0.035), (PX + 0.21, 0.0, 0.035), 0.24, (0, 1, 0), "board_dark", shade=1.1, segs=1, thick=0.07)
    barrel = dc.lathe("barrel", [(0.072, 0.0), (0.066, 0.36), (0.082, 0.38), (0.082, 0.42), (0.03, 0.47)], seg=6, cap_last=True, centre=(PX + 0.012, 0.01, 0.84))
    dc.smooth(barrel, angle=40); dc.paint(barrel, "linen", "#3C3A3A"); parts.append(barrel)
    spout = dc.tube("spout", [(PX + 0.06, 0.01, 1.08), (PX + 0.2, 0.01, 1.10), (PX + 0.27, 0.01, 1.03)], r=[0.036, 0.032, 0.03], sides=4, cap=True, phase=math.pi / 4, up=(0, 1, 0))
    dc.smooth(spout, angle=40); dc.paint(spout, "linen", "#3C3A3A", shade=0.95); parts.append(spout)
    # the fulcrum bracket on the back of the head, the lever through it (grip up and away from the trough), the rod
    piv = Vector((PX - 0.10, 0.01, 1.30))
    o = dc.beam("bracket", (PX - 0.03, 0.01, 1.18), piv + Vector((0, 0, 0.03)), 0.05, 0.03, up=(0, 1, 0), cap=(False, True)); dc.paint(o, "linen", "#3C3A3A", shade=0.85, ao=False); parts.append(o)
    grip = piv + Vector((-0.17, 0.0, 0.37)); nose = piv + Vector((0.12, 0.0, -0.06))
    o = dc.beam("lever", nose, grip, 0.045, 0.022, up=(0, 1, 0), segs=2, taper=0.75); dc.paint(o, "linen", "#3C3A3A", shade=1.0); parts.append(o)
    o = dc.beam("rod", nose + Vector((-0.02, 0, 0.0)), (PX + 0.012, 0.01, 1.30), 0.02, 0.02, up=(0, 1, 0), cap=(False, False)); dc.paint(o, "linen", "#3C3A3A", shade=0.8, ao=False); parts.append(o)

    # nothing in Plenty stands true: the trough has settled toward the pump, and into the street
    for o in parts:
        o.rotation_euler = (math.radians(1.2), math.radians(-1.1), math.radians(0.0)); o.location = (-0.0, 0.0, -0.02)
        mesh.apply_transform(o)
    dc.bake_ao(parts, distance=0.5)
    ob = dc.join(parts, ASSET + "_mesh")
    dc.smooth(ob, angle=32)
    dc.drop_faces(ob, lambda c, n: c.z < -0.015 and n.z < 0.3)

    def weather(p):
        iron = (p.col[:, 0] < 0.06) & (p.x < TX0 + 0.1)
        p.mix(iron * np.clip(p.nrm[:, 2], 0, 1) * 0.35, "rust")        # rust blooms on what faces the sky
        p.mix(iron * np.clip(1.0 - np.abs(p.z - 1.03) / 0.06, 0, 1) * (p.x > PX + 0.15) * 0.5, "#6E7A78")   # the spout's lip: lime, the last water
        wood_ = (p.col[:, 0] > 0.06) & (p.col[:, 1] < 0.33)
        # the rim: polished pale where arms and cups have rested
        p.mix(wood_ * (p.z > RIM - 0.04) * (p.fnrm[:, 2] > 0.7) * 0.3, "#B49A80")
        # a dark tide line inside the lip, from when it held water
        inside = wood_ & (np.abs(p.y) < HW_TOP - 0.07) & (p.z > RIM - 0.14) & (p.x > TX0) & (p.x < TX1)
        p.mul(inside, 0.8)
        # rust weeps under the straps
        for xs in (TX0 + 0.49, TX1 - 0.52):
            p.mix(wood_ * np.clip(1.0 - np.abs(p.x - xs) / 0.06, 0, 1) * (p.z < 0.3) * 0.3, "rust")
    dc.compose(ob, ao=0.85, gradient=(0.8, 1.06), dust=0.6, dust_height=0.45, bleach="board_bleached", bleach_fraction=0.25, bleach_amount=0.35,
               part_jitter=0.07, seed=args.seed, painters=[weather], contact=(0.07, 0.65), z_range=(0.0, 1.6))


def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    build(args)
    dc.export_asset(ASSET, args)


if __name__ == "__main__":
    scene.run(main)
