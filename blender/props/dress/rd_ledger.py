"""rd_ledger: the town's ledger, at the head of the tally table: a bound ledger (0.3 x 0.05 x 0.42 m closed), cloth
spine, lying OPEN at the last written page, a pencil laid in the gutter (ART_BIBLE 7.4; P1). Embedded. `m_prop` only:
the ruled lines and the written lines are thin graphite quads, not words (the readable carries the text).
Pivot: base centre. The reader stands at the front (-Y); open, it is 0.6 m across.

The left page is full of entries; the right has three lines, the last one short, then nothing.

    node tools/build-assets.mjs --only rd_ledger
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

ASSET = "rd_ledger"


PW, PD = 0.292, 0.41           # one page
PAPER = "#D9D0B8"


def build(args):
    rng = scene.rng(args.seed)
    parts = []
    # the boards: one dark cloth-covered slab, a paler cloth spine down the middle
    cover = dc.box("cover", (0.62, 0.435, 0.008), (0, 0, 0.004), drop=("-z",))
    dc.paint(cover, "linen", "#3A3432"); parts.append(cover)
    spine = dc.poly("spine", [[(-0.035, -0.2175, 0.0085), (0.035, -0.2175, 0.0085), (0.035, 0.2175, 0.0085), (-0.035, 0.2175, 0.0085)]])
    dc.paint(spine, "linen", "#6B5A4A", ao=False); parts.append(spine)
    # the two page blocks: highest beside the gutter, falling away to the fore-edge; the left block is the thicker
    def block(name, s, thick):
        def top(u, v):
            x = s * (0.006 + u * PW)
            z = 0.008 + thick * (0.35 + 0.65 * math.sin(math.pi * (0.12 + 0.88 * (1 - u)) / 2) ** 0.7) - (0.012 * (1 - u) ** 3)
            return (x, -PD / 2 + v * PD, z)
        sh = dc.sheet(name, 3, 1, top, flip=(s < 0))
        dc.paint(sh, "chalk", PAPER, part=False)
        # fore-edge and the two ends of the block (the cut pages: a shade darker)
        e = []
        for (u0, u1) in ((1.0, 1.0),):
            a = Vector(top(1, 0)); b = Vector(top(1, 1))
            e.append([a, (a.x, a.y, 0.008), (b.x, b.y, 0.008), b] if s > 0 else [b, (b.x, b.y, 0.008), (a.x, a.y, 0.008), a])
        for v, flipf in ((0, False), (1, True)):
            pts = [Vector(top(u / 3, v)) for u in range(4)]
            poly = pts + [(pts[3].x, pts[3].y, 0.008), (pts[0].x, pts[0].y, 0.008)]
            if (s > 0) == flipf: poly = poly[::-1]
            e.append(poly)
        ed = dc.poly(name + "_edge", e)
        dc.paint(ed, "chalk", PAPER, shade=0.8)
        return sh, ed, top
    lsh, led, ltop = block("pages_l", -1, 0.034)
    rsh, red, rtop = block("pages_r", 1, 0.016)
    parts += [lsh, led, rsh, red]
    # ruled entries in graphite: thin quads lying on the page (left: every line written; right: four, then none)
    lines = []
    def entry(top, s, v, u0, u1, h=0.004):
        us = [u0] + [k / 3 for k in (1, 2) if u0 + 0.02 < k / 3 < u1 - 0.02] + [u1]     # follow the page's own bends
        up = Vector((0, 0, 0.0012))
        for ua, ub in zip(us, us[1:]):
            a = Vector(top(ua, v)) + up; b = Vector(top(ub, v)) + up
            lines.append([a + Vector((0, -h, 0)), b + Vector((0, -h, 0)), b + Vector((0, h, 0)), a + Vector((0, h, 0))] if s > 0 else
                         [b + Vector((0, -h, 0)), a + Vector((0, -h, 0)), a + Vector((0, h, 0)), b + Vector((0, h, 0))])
    for k in range(5): entry(ltop, -1, 0.86 - k * 0.16, 0.12, rng.uniform(0.7, 0.92))
    for k in range(3): entry(rtop, 1, 0.86 - k * 0.16, 0.10, rng.uniform(0.7, 0.9) if k < 2 else 0.30)
    ink = dc.poly("entries", lines)
    dc.paint(ink, "chalk", "graphite", ao=False); parts.append(ink)
    # the pencil in the gutter
    pencil = dc.tube("pencil", [(0.004, -0.10, 0.03), (-0.002, 0.045, 0.031)], r=[0.0045, 0.0045], sides=4, cap=True, up=(0, 0, 1))
    dc.paint(pencil, "chalk", "#8A6A3A", ao=False); parts.append(pencil)
    point = dc.tube("pencil_point", [(-0.002, 0.045, 0.031), (-0.003, 0.058, 0.031)], r=[0.0045, 0.0008], sides=4, cap=False, up=(0, 0, 1))
    dc.paint(point, "chalk", "graphite", ao=False); parts.append(point)
    dc.bake_ao(parts, distance=0.08)
    ob = dc.join(parts, ASSET + "_mesh")
    dc.smooth(ob, angle=40)

    def age(p):
        paper = p.col[:, 0] > 0.5
        p.mul(paper * np.clip(1.0 - np.abs(p.x) / 0.03, 0, 1), 0.75)                 # the gutter
        p.mul(paper * np.clip((np.abs(p.x) - 0.25) / 0.05, 0, 1) * 0.6, (0.92, 0.88, 0.78))   # thumbed fore-edges
        p.mul(paper * dc.P.near(p, (0.22, -0.16, 0.03), 0.12) * 0.5, (0.9, 0.86, 0.78))      # where a hand held the page down
    dc.compose(ob, ao=0.7, gradient=(1.0, 1.0), part_jitter=0.0, seed=args.seed, painters=[age], contact=(0.006, 0.7), quiet=True)


def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    build(args)
    dc.export_asset(ASSET, args)


if __name__ == "__main__":
    scene.run(main)
