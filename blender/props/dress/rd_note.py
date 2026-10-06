"""rd_note: a sheet of ledger paper 0.13 x 0.2 m, folded once and opened again, written in graphite
(ART_BIBLE 7.4, P0). Four variant nodes, one per place the Dowser leaves one (each: one mesh, all `m_prop`: the paper
and his handwriting as thin pencil-grey word strokes; the weights are `art-weapons` cases placed by the zone script):

    note_lip      on the flat stone under the overhang: the two leaves tented at the fold, one corner lifting
    note_hearth   square to the hearthstone edge: lying almost flat, the fold a shallow valley
    note_cradle   tucked into the niche lip under the cradle: the back leaf lies in, the front leaf hangs over the lip,
                  one edge bent
    note_stone    on the rim stone, its far leaf pinned flat under the FIRST kept case (seat 1 of prop_rim_stone), the
                  near leaf free, one near corner curling. Its mesh is offset from the pivot (the layout's
                  `rd_note_stone` marker) so that it lies under that case: see `stone_offset`

The model shows pencil strokes only: no words (the readable carries the text). Pivot: centre.
Polish round 3: the ink was full-width `m_mask` strike bars over ruled lines; embedded in a zone at 1.5 m they read as a
bar-code label. It is handwriting now: twelve short slanted word strokes per note, ragged right, a signature low on the
near leaf, drawn as geometry in `m_prop` so the look does not depend on the mask sheet.
Long axis front to back (Blender Y); the fold runs across at y = 0. The writing reads from the front (-Y).

    node tools/build-assets.mjs --only rd_note
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

ASSET = "rd_note"


W, L = 0.13, 0.20
PAPER = "#DDD5BE"
STROKE = 0.0045               # the height of a written word stroke (m): a pencil line seen as a word at arm's length
PENCIL = "#4A4A52"            # his pencil: `graphite`, a soft lead on paper (never black)


def bilerp(c, u, v):
    a = Vector(c[0]).lerp(Vector(c[1]), u); b = Vector(c[3]).lerp(Vector(c[2]), u)
    return a.lerp(b, v)


def leaf_normal(c):
    return (Vector(c[1]) - Vector(c[0])).cross(Vector(c[3]) - Vector(c[0])).normalized()


def note(name, back, front, rows, dog=None, shift=(0.0, 0.0), seed=1):
    """back / front = the two leaves, each four corners wound counter-clockwise seen from above:
    [near-left, near-right, far-right, far-left]. rows = [(leaf, v, [(u0, u1), ...]), ...]: the words of one written
    line on leaf 0 (near) / 1 (far) at height v (0 = the leaf's near edge), each word from u0 to u1 across the sheet.
    shift = (x, y) moves the whole sheet off the pivot."""
    sh = Vector((shift[0], shift[1], 0.0))
    back = [Vector(p) + sh for p in back]; front = [Vector(p) + sh for p in front]
    tris_ = [[front[0], front[1], front[2]], [front[0], front[2], front[3]], [back[0], back[1], back[2]], [back[0], back[2], back[3]]]
    if dog is not None:                                                 # a dog-eared corner: folded over, its tip lifting
        leaf, k, size, lift = dog
        c = front if leaf == 0 else back
        P0 = Vector(c[k]); Pa = Vector(c[(k + 1) % 4]); Pb = Vector(c[(k - 1) % 4])
        a = P0.lerp(Pa, size / (Pa - P0).length); b = P0.lerp(Pb, size / (Pb - P0).length)
        n = leaf_normal(c)
        tip = (a + b) - P0 + n * lift                                   # the corner folded back over the leaf
        tri = [a + n * 0.0008, tip, b + n * 0.0008]
        if (Vector(tri[1]) - Vector(tri[0])).cross(Vector(tri[2]) - Vector(tri[0])).dot(n) < 0: tri.reverse()
        tris_.append(tri)
    paper = dc.poly(name + "_paper", tris_)
    dc.paint(paper, "chalk", PAPER, part=False)
    if dog is not None: dc.paint(paper, "chalk", PAPER, shade=0.9, faces=[len(tris_) - 1], part=False)
    rng = scene.rng(seed)
    quads = []
    for (leaf, v, words) in rows:
        c = front if leaf == 0 else back
        n = leaf_normal(c) * 0.0007
        for (u0, u1) in words:
            h = STROKE * rng.uniform(0.85, 1.2) / 0.1 / 2               # half the stroke's height, in the leaf's v
            rise = rng.uniform(0.006, 0.02) * (u1 - u0) / 0.3           # his hand climbs a little along each word
            v0 = v + rng.uniform(-0.008, 0.008)
            quads.append([bilerp(c, u0, v0 - h) + n, bilerp(c, u1, v0 + rise - h) + n, bilerp(c, u1, v0 + rise + h) + n, bilerp(c, u0, v0 + h) + n])
    ink = dc.poly(name + "_ink", quads)
    dc.paint(ink, "chalk", PENCIL, part=False)
    return paper, ink


def stone_offset():
    """Where seat 1 of prop_rim_stone is, in the stone note's own frame (Blender x right, y away from the reader).
    blender/env_exterior/env_far_rim.py stands the stone's pivot (seat 7) on `ia_stone_round` turned by the `rim_stone`
    solid's rotY, and this note on `rd_note_stone` turned 6 degrees more; seat 1 is 6 x 0.11 m along the stone's -x."""
    a = layout.to_blender(layout.marker("ia_stone_round")["pos"]); b = layout.to_blender(layout.marker("rd_note_stone")["pos"])
    r = math.radians(float(layout.solid("rim_stone").get("rotY", 20.0)))
    sx = a[0] - 0.66 * math.cos(r) - b[0]; sy = a[1] - 0.66 * math.sin(r) - b[1]
    t = -(r + math.radians(6.0))
    return (sx * math.cos(t) - sy * math.sin(t), sx * math.sin(t) + sy * math.cos(t))


def build(args):
    hw = W / 2
    out = {}
    # near = toward the reader (-Y), far = +Y. Heights in metres above the resting surface (z = 0 is the pivot plane).
    def flat(ridge, near_z=(0.0, 0.0), far_z=(0.0, 0.0), skew=0.0):
        front = [(-hw, -L / 2, near_z[0]), (hw, -L / 2, near_z[1]), (hw + skew, 0.0, ridge), (-hw + skew, 0.0, ridge)]
        back = [(-hw + skew, 0.0, ridge), (hw + skew, 0.0, ridge), (hw, L / 2, far_z[1]), (-hw, L / 2, far_z[0])]
        return back, front
    # the written lines differ from note to note: three lines on the far leaf, two and his name on the near one
    def hand(a, b, c, d, e, sig=(0.40, 0.72)):                         # his name stops short of the dog-eared corner
        return [(1, 0.80, a), (1, 0.55, b), (1, 0.30, c), (0, 0.80, d), (0, 0.55, e), (0, 0.22, [sig])]
    b, f = flat(0.011, near_z=(0.004, 0.004), far_z=(0.001, 0.001), skew=0.002)
    out["note_lip"] = note("note_lip", b, f, hand([(0.08, 0.30), (0.35, 0.52), (0.58, 0.90)], [(0.08, 0.42), (0.48, 0.66), (0.71, 0.86)], [(0.08, 0.36), (0.42, 0.62)],
                                                  [(0.08, 0.46), (0.52, 0.80)], [(0.08, 0.34)]), dog=(0, 1, 0.026, 0.008), seed=args.seed + 1)
    b, f = flat(0.0008, near_z=(0.004, 0.004), far_z=(0.005, 0.005))
    out["note_hearth"] = note("note_hearth", b, f, hand([(0.08, 0.38), (0.44, 0.60), (0.66, 0.92)], [(0.08, 0.26), (0.32, 0.70)], [(0.08, 0.40), (0.46, 0.58), (0.64, 0.88)],
                                                        [(0.08, 0.30), (0.36, 0.72)], [(0.08, 0.50)], sig=(0.62, 0.9)), seed=args.seed + 2)
    # tucked into the niche lip: the far leaf lies in, the near leaf hangs over the lip and its right edge is bent out
    back = [(-hw, 0.0, 0.0015), (hw, 0.0, 0.0015), (hw, L / 2, 0.0025), (-hw, L / 2, 0.0025)]
    front = [(-hw, -0.036, -0.090), (hw, -0.036, -0.090), (hw, 0.0, 0.0015), (-hw, 0.0, 0.0015)]
    out["note_cradle"] = note("note_cradle", back, front, hand([(0.08, 0.34), (0.40, 0.90)], [(0.08, 0.28), (0.34, 0.56), (0.62, 0.80)], [(0.08, 0.48), (0.54, 0.74)],
                                                               [(0.08, 0.40), (0.46, 0.62), (0.68, 0.90)], [(0.08, 0.44)], sig=(0.55, 0.88)), dog=(0, 1, 0.032, 0.012), seed=args.seed + 3)
    # on the rim stone: the far leaf pinned flat under the first kept case (it stands at CASE on the sheet; the words
    # run round it), the near leaf free with its left corner curling up
    CASE = (-0.032, 0.066)
    sx, sy = stone_offset()
    b, f = flat(0.003, near_z=(0.013, 0.003), far_z=(0.0015, 0.0015), skew=-0.0015)
    rows = [(1, 0.66, [(0.52, 0.72), (0.77, 0.92)]), (1, 0.40, [(0.50, 0.90)]), (1, 0.16, [(0.08, 0.30), (0.36, 0.58), (0.64, 0.90)]),
            (0, 0.82, [(0.08, 0.44), (0.50, 0.68), (0.74, 0.92)]), (0, 0.58, [(0.08, 0.26), (0.32, 0.62)]), (0, 0.26, [(0.38, 0.70)])]
    out["note_stone"] = note("note_stone", b, f, rows, dog=(0, 1, 0.03, 0.014), shift=(sx - CASE[0], sy - CASE[1]), seed=args.seed + 4)
    print(f"note_stone: seat 1 at ({sx:.3f}, {sy:.3f}) in the note's frame; sheet centre at ({sx - CASE[0]:.3f}, {sy - CASE[1]:.3f})")
    for name, (paper, ink) in out.items():
        ob = dc.join([paper, ink], name)
        cx, cy = (sx - CASE[0], sy - CASE[1]) if name == "note_stone" else (0.0, 0.0)
        dc.bake_ao([ob], distance=0.03, ground=-0.0005)
        def fold(p, cx=cx, cy=cy):
            paper_ = p.col[:, 0] > 0.3
            p.mul(paper_ * np.clip(1.0 - np.abs(p.y - cy) / 0.012, 0, 1), 0.86)       # the fold: a soft grey line
            p.mul(paper_ * np.clip((np.abs(p.x - cx) - (hw - 0.012)) / 0.012, 0, 1) * 0.5, (0.93, 0.9, 0.82))   # thumbed, yellowed edges
        dc.compose(ob, ao=0.5, gradient=(1.0, 1.0), part_jitter=0.0, face_jitter=0.025, seed=args.seed, painters=[fold], quiet=True)
        vcol.color_layer(ob, vcol.COLOR)


def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    build(args)
    dc.export_asset(ASSET, args)


if __name__ == "__main__":
    scene.run(main)
