"""prop_crate: a plank crate, a 0.7 m cube, built from parts: a dark core, three planks a side, two frame boards up
each face, a lid of three boards lying askew (ART_BIBLE 7.4; P2). Instanced dressing (its box collider is tagged
`pierce`): one mesh, one material. Pivot: base centre.

    node tools/build-assets.mjs --only prop_crate
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

ASSET = "prop_crate"


S = 0.70
H = 0.66                       # to the top of the sides; the lid makes up the rest


def build(args):
    rng = scene.rng(args.seed)
    j = lambda a: rng.uniform(-a, a)
    parts = []
    core = dc.box("core", (S - 0.07, S - 0.07, H - 0.04), (0, 0, (H - 0.04) / 2 + 0.01), drop=("-z",))
    dc.paint(core, "linen", "board_dark", shade=0.6, ao=False); parts.append(core)
    wood = lambda: rng.choice(("board", "board", "board_bleached"))
    for side in range(4):
        a = side * math.pi / 2
        n = Vector((math.cos(a), math.sin(a), 0.0)); t = Vector((-n.y, n.x, 0.0))
        z = 0.012
        ws = [rng.uniform(0.17, 0.24) for _ in range(3)]
        k = (H - 0.012 - 2 * 0.012) / sum(ws)
        for i, w in enumerate(ws):
            w *= k
            c = n * (S / 2 - 0.035 + j(0.004)) + Vector((0, 0, z + w / 2)); z += w + 0.012
            half = S / 2 - 0.03 - rng.uniform(0.0, 0.012)
            b = dc.beam(f"p{side}{i}", c - t * half, c + t * half + Vector((0, 0, j(0.005))), w, 0.022, up=(0, 0, 1), cap=(False, False), drop=("front",) if t.cross(Vector((0, 0, 1))).dot(n) < 0 else ("back",))
            dc.paint(b, "linen", wood(), shade=rng.uniform(0.82, 0.98), ao=False); parts.append(b)
        for e in (-1, 1):                                               # the frame boards, standing at each end of the face
            c = n * (S / 2 - 0.012) + t * (e * (S / 2 - 0.045))
            b = dc.beam(f"f{side}{e}", c + Vector((0, 0, 0.0)), c + Vector((j(0.004), j(0.004), H + 0.005)), 0.085, 0.024, up=tuple(t), cap=(False, True), segs=2)
            dc.paint(b, "linen", "board_bleached", shade=rng.uniform(0.88, 1.02)); parts.append(b)
    # the lid: three boards and two battens, prised up and left lying across the top, turned
    lid = []
    x = -S / 2 + 0.01
    for i in range(3):
        w = (S - 0.02) / 3 + (j(0.02) if i < 2 else 0.0)
        b = dc.beam(f"lid{i}", (x + w / 2, -S / 2 - 0.01 + j(0.01), H + 0.03), (x + w / 2, S / 2 + 0.01 + j(0.012), H + 0.03 + j(0.003)), w - 0.01, 0.022, up=(1, 0, 0))
        dc.paint(b, "linen", wood(), shade=rng.uniform(0.95, 1.08)); lid.append(b); x += w
    for e in (-1, 1):
        b = dc.beam(f"batten{e}", (-S / 2 + 0.03, e * 0.22, H + 0.052), (S / 2 - 0.03, e * 0.22, H + 0.052), 0.06, 0.022, up=(0, 1, 0), drop=("back",) if True else ())
        dc.paint(b, "linen", "board", shade=0.85); lid.append(b)
    for o in lid:
        dc.place(o, (0.03, -0.02, 0.0), (math.radians(3.0), math.radians(-2.0), math.radians(8)))
    parts += lid
    dc.bake_ao(parts, distance=0.3)
    ob = dc.join(parts, ASSET + "_mesh")
    dc.smooth(ob, angle=30)

    def wear(p):
        p.mix(np.clip(1.0 - p.z / 0.18, 0, 1) * 0.45, "sand")
        p.mix((p.fnrm[:, 2] > 0.8) * (p.z > H) * 0.2, "board_bleached")
    dc.compose(ob, ao=0.85, gradient=(0.8, 1.08), part_jitter=0.07, seed=args.seed, painters=[wear], contact=(0.05, 0.65), quiet=True)


def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    build(args)
    dc.export_asset(ASSET, args)


if __name__ == "__main__":
    scene.run(main)
