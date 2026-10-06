"""prop_flat_stone: a flat river stone 0.5 x 0.08 x 0.35 m (stop one: the coffee pot stands on it; the first note lies
on it under a spent case). Embedded (`placedBy: zone`). Pivot: base centre.
Water-worn: no hard arris anywhere, a flat top a pot can stand on, one end thicker than the other.

    node tools/build-assets.mjs --only prop_flat_stone
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

ASSET = "prop_flat_stone"


def build(args):
    rng = scene.rng(args.seed)
    N = 9
    outline = []
    for k in range(N):
        a = 2 * math.pi * k / N + rng.uniform(-0.12, 0.12)
        r = 1.0 + rng.uniform(-0.09, 0.07) + 0.07 * math.cos(2 * a + 0.6)
        outline.append((math.cos(a) * 0.25 * r, math.sin(a) * 0.175 * r))
    bm = mesh.new_bmesh()
    def ring(scale, z, tilt=0.0):
        return [bm.verts.new((x * scale, y * scale, z + tilt * x)) for (x, y) in outline]
    r0 = ring(0.80, 0.0); r1 = ring(1.0, 0.032, 0.02); r2 = ring(0.84, 0.072, 0.03)
    for a, b in ((r0, r1), (r1, r2)):
        for k in range(N):
            j = (k + 1) % N
            bm.faces.new((a[k], a[j], b[j], b[k]))
    bm.faces.new(r2)
    bm.normal_update()
    stone = mesh.new_mesh_object(ASSET + "_mesh", bm)
    dc.smooth(stone, angle=70)
    dc.paint(stone, "sand_pale", "#7E6A5C")
    dc.bake_ao([stone], distance=0.2)

    def water(p):
        top = p.nrm[:, 2] > 0.75
        p.mix(top * 0.35, "#9C8573")                                    # the top, rubbed pale by a river long gone
        p.mix(dc.P.near(p, (0.06, 0.02, 0.08), 0.13) * top * 0.45, "#3A302B")   # the ring a hot pot left
        p.mix((~top) * np.clip(1.0 - p.z / 0.04, 0, 1) * 0.4, "sand")
    dc.compose(stone, ao=0.8, gradient=(0.82, 1.05), part_jitter=0.0, face_jitter=0.0, seed=args.seed, painters=[water], contact=(0.02, 0.65))


def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    build(args)
    dc.export_asset(ASSET, args)


if __name__ == "__main__":
    scene.run(main)
