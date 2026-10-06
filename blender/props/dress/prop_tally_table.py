"""prop_tally_table: the long trestle table of the Tally House, 11.0 m long (game Z) x 1.4 m wide (game X), top at
0.76 to 0.80 m: four plank leaves on five trestles; eleven pairs of pale patches where hands rest (ART_BIBLE 7.4, P0).
One mesh, `m_prop`. Embedded: it stands on the layout solid `ty_table` and casts into `lm_tally`. Pivot: centre at floor.

The hand patches are read from the layout: the nine seats of `prop_tally_seated` and the two riser seats, so the
patches, the chairs (`art-env-interior`) and the seated figures (`art-enemies`) agree. The dragged fifth leaf is zone
geometry in this plank style: boards 0.16-0.24 m, `board` / `board_bleached`, never two equal neighbours.

    node tools/build-assets.mjs --only prop_tally_table
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

ASSET = "prop_tally_table"


LEN, WID = 11.0, 1.4
T = 0.035                      # board thickness
PALE = "#C0A68C"               # where hands have rested for forty years


def seats():
    """[(x, y)] of the eleven seats in the table's own Blender frame (x right, y = -game z)."""
    tab = layout.solid("ty_table")["pos"]
    out = []
    for m in layout.marker("prop_tally_seated")["params"]["seats"]: out.append(m["pos"])
    for rid in ("sp_tally_riser_w", "sp_tally_riser_e"): out.append(layout.marker(rid)["pos"])
    return [(p[0] - tab[0], -(p[2] - tab[2])) for p in out]


def plank(name, x0, x1, y0, y1, zf, loops, side=0, ends=(False, False)):
    """One board: top faces between the y loops (zf(y) = its top height there), an outer side strip sharing the top's
    vertices when `side` is -1 / +1, end faces where asked."""
    ys = sorted(set([y0, y1] + [y for y in loops if y0 + 0.03 < y < y1 - 0.03]))
    bm = mesh.new_bmesh()
    L = [bm.verts.new((x0, y, zf(y))) for y in ys]; R = [bm.verts.new((x1, y, zf(y))) for y in ys]
    for i in range(len(ys) - 1): bm.faces.new((L[i], R[i], R[i + 1], L[i + 1]))
    if side:
        E = L if side < 0 else R
        B = [bm.verts.new((v.co.x, v.co.y, v.co.z - T)) for v in E]
        for i in range(len(ys) - 1):
            if side < 0: bm.faces.new((E[i + 1], B[i + 1], B[i], E[i]))
            else: bm.faces.new((E[i], B[i], B[i + 1], E[i + 1]))
    for k, on in enumerate(ends):
        if not on: continue
        a, b = (L[0], R[0]) if k == 0 else (R[-1], L[-1])
        bm.faces.new((a, b, bm.verts.new((b.co.x, b.co.y, b.co.z - T)), bm.verts.new((a.co.x, a.co.y, a.co.z - T))))
    bm.normal_update()
    return mesh.new_mesh_object(name, bm)


def trestle(name, y, top, rng, parts):
    """A sawhorse: a beam across the table, four splayed legs, a board nailed across each pair."""
    j = lambda a: rng.uniform(-a, a)
    bz = top - 0.055
    beam = dc.box(name + "_beam", (1.22 + j(0.03), 0.10, 0.11), (j(0.01), y, bz), rot=(0, j(0.006), j(0.012)), drop=("+z",))
    dc.paint(beam, "linen", "board", shade=0.9 + j(0.05)); parts.append(beam)
    for sx in (-1, 1):
        for sy in (-1, 1):
            foot = Vector((sx * (0.55 + j(0.02)), y + sy * (0.30 + j(0.02)), 0.0)); head = Vector((sx * 0.47, y + sy * 0.04, bz + 0.02))
            leg = dc.tube(f"{name}_leg{sx}{sy}", [foot, head], r=[0.05, 0.043], sides=4, cap=False, phase=math.pi / 4, flat=(1.0, 0.72), up=(1, 0, 0))
            dc.paint(leg, "linen", "board", shade=0.95 + j(0.06), ao=False); parts.append(leg)
    for sy in (-1, 1):
        zb = 0.30 + j(0.03); k = zb / (bz + 0.02)
        yb = y + sy * (0.30 - 0.26 * k + 0.028)
        brace = dc.box(f"{name}_brace{sy}", (1.16 + j(0.04), 0.022, 0.085 + j(0.01)), (j(0.01), yb, zb), rot=(sy * -0.33, 0, j(0.015)), drop=("-x", "+x"))
        dc.paint(brace, "linen", "board_bleached", shade=0.82 + j(0.05), ao=False); parts.append(brace)


def build(args):
    rng = scene.rng(args.seed)
    S = seats()
    parts = []
    GAP = 0.012
    leaf_len = LEN / 4
    hand_loops = {-1: [], 1: []}
    hands = []                                                         # (side, y centre)
    for (sx, sy) in S:
        side = -1 if sx < 0 else 1
        for h in (-0.17, 0.17):
            c = sy + h
            hands.append((side, c)); hand_loops[side] += [c - 0.11, c, c + 0.11]
    for leaf in range(4):
        y0 = -LEN / 2 + leaf * leaf_len + (GAP / 2 if leaf else 0.0); y1 = -LEN / 2 + (leaf + 1) * leaf_len - (GAP / 2 if leaf < 3 else 0.0)
        base = (0.790, 0.776, 0.786, 0.790)[leaf]                        # no two leaves at one height (top 0.76-0.80)
        sag = (0.008, 0.012, 0.007, 0.010)[leaf]
        tilt = rng.uniform(-0.004, 0.004)
        # seven boards, 0.16 to 0.24 m, never two equal neighbours
        ws = [rng.uniform(0.16, 0.24) for _ in range(7)]
        k = (WID - 6 * 0.006) / sum(ws); ws = [w * k for w in ws]
        x = -WID / 2
        for b, w in enumerate(ws):
            lift = rng.uniform(-0.003, 0.003); cup = rng.uniform(0.0, 0.006) if rng.random() < 0.3 else 0.0
            def zf(y, base=base, sag=sag, lift=lift, cup=cup, y0=y0, y1=y1, tilt=tilt):
                u = (y - y0) / (y1 - y0)
                return base - sag * math.sin(math.pi * u) + lift + cup * (1 - min(u, 1 - u) * 6 if min(u, 1 - u) < 1 / 6 else 0.0) + tilt * (u - 0.5)
            edge = -1 if b == 0 else (1 if b == 6 else 0)
            loops = [y0 + (y1 - y0) * f for f in ((0.5,) if edge == 0 else (1 / 3, 2 / 3))]
            if edge: loops += hand_loops[edge]
            ya = y0 + (rng.uniform(0.0, 0.02) if leaf == 0 else 0.0); yb = y1 - (rng.uniform(0.0, 0.02) if leaf == 3 else 0.0)
            p = plank(f"leaf{leaf}_b{b}", x, x + w, ya, yb, zf, loops, side=edge, ends=(leaf == 0, leaf == 3))
            pale = rng.random() < 0.35
            dc.paint(p, "linen", "board_bleached" if pale else "board", shade=rng.uniform(0.9, 1.06))
            parts.append(p)
            x += w + 0.006
    for i, y in enumerate((-LEN / 2 + 0.40, -leaf_len, 0.0, leaf_len, LEN / 2 - 0.40)):
        trestle(f"tr{i}", y + rng.uniform(-0.02, 0.02), 0.782 - T - 0.014, rng, parts)
    dc.bake_ao(parts, distance=0.5)
    ob = dc.join(parts, ASSET + "_mesh")
    dc.smooth(ob, angle=30)

    def hands_paint(p):
        top = (p.fnrm[:, 2] > 0.7) & (p.z > 0.7)
        for side, c in hands:
            xe = side * WID / 2
            k = np.clip(1.0 - np.abs(p.y - c) / 0.105, 0, 1) * np.clip(1.0 - np.abs(p.x - xe) / 0.30, 0, 1) ** 0.6 * top
            p.mix(k * 0.92, PALE)
        # the long edges, rubbed by forearms and coats all down their length
        p.mix(top * np.clip(1.0 - (WID / 2 - np.abs(p.x)) / 0.03, 0, 1) * 0.35, PALE)
        # the middle of the table, where nothing was ever set down that was not wiped up: darker, greasier
        p.mul(top * np.clip(1.0 - np.abs(p.x) / 0.45, 0, 1), 0.86)
    dc.compose(ob, ao=0.85, gradient=(0.72, 1.06), part_jitter=0.07, face_jitter=0.0, seed=args.seed, painters=[hands_paint], contact=(0.06, 0.6))


def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    build(args)
    dc.export_asset(ASSET, args)


if __name__ == "__main__":
    scene.run(main)
