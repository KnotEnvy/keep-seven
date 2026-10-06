"""prop_boots_pair: a pair of work boots set side by side under a coat, 0.3 x 0.28 x 0.25 m (ART_BIBLE 7.4, peg
stair; P1). Instanced dressing: one mesh, one material. Pivot: base centre. Toes to the front (-Y).
Set down neatly and not picked up again: the left has slumped at the ankle, the right still stands.

    node tools/build-assets.mjs --only prop_boots_pair
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

ASSET = "prop_boots_pair"


def boot(name, x, slump, rng):
    """One boot from 45 triangles: a foot lofted through four sections (a low rounded toe cap, the rise of the vamp,
    the instep, a heel that tucks in), a five-sided shaft with a third ring so its top can flare and slump, and the
    dark of its mouth."""
    parts = []
    L = 0.25
    # sections toe -> heel: (y, half width at the sole, half width at the top, height, how far the top leans back)
    secs = [(-L / 2, 0.026, 0.016, 0.030, 0.022), (-L / 2 + 0.05, 0.050, 0.038, 0.052, 0.012),
            (-0.012, 0.047, 0.040, 0.088, 0.0), (L / 2 - 0.012, 0.034, 0.030, 0.083, -0.016)]
    bm = dc.mesh.new_bmesh()
    rings = []
    for (y, wb, wt, h, lean) in secs:
        rings.append([bm.verts.new((x - wb, y, 0.0)), bm.verts.new((x - wt, y + lean, h)), bm.verts.new((x + wt, y + lean, h)), bm.verts.new((x + wb, y, 0.0))])
    for i in range(3):
        r0, r1 = rings[i], rings[i + 1]
        for q in range(3):
            bm.faces.new((r0[q], r1[q], r1[q + 1], r0[q + 1]))
    bm.faces.new(rings[0]); bm.faces.new(list(reversed(rings[3])))      # the toe's end, the heel's back
    foot = dc._obj(name + "_foot", bm)
    dc._outward(foot)
    dc.paint(foot, "linen", "leather", shade=0.8); parts.append(foot)
    # the shaft: five-sided, pinched at the ankle, flaring to a mouth that has slumped over (or still stands)
    top = (x + slump * 0.030, 0.060 + slump * 0.016, 0.285 - abs(slump) * 0.055)
    mid = (x + slump * 0.012, 0.056, 0.175 - abs(slump) * 0.02)
    shaft = dc.tube(name + "_shaft", [(x, 0.052, 0.080), mid, top], r=[0.046, 0.045, 0.054], sides=5, cap=False, flat=(1.0, 1.2), up=(1, 0, 0))
    dc.paint(shaft, "linen", "leather", shade=0.9); parts.append(shaft)
    n = (Vector(top) - Vector(mid)).normalized()
    inner = dc.tube(name + "_dark", [Vector(top) - n * 0.02, Vector(top) - n * 0.019], r=[0.052, 0.052], sides=5, cap=True, flat=(1.0, 1.2), up=(1, 0, 0))
    dc.drop_faces(inner, lambda c, nn: nn.dot(n) < 0.5)
    dc.paint(inner, "linen", "#1B1512", ao=False); parts.append(inner)
    return parts


def build(args):
    rng = scene.rng(args.seed)
    parts = boot("boot_l", -0.078, 0.8, rng) + boot("boot_r", 0.078, -0.2, rng)
    for o in parts[:3]: dc.place(o, (0, 0, 0), (0, 0, 0.09))
    for o in parts[3:]: dc.place(o, (0, 0, 0.0), (0, 0, -0.05))
    for o in parts[3:]: dc.place(o, (0, 0.018, 0.0))                    # one kicked off a little ahead of the other
    dc.bake_ao(parts, distance=0.15)
    ob = dc.join(parts, ASSET + "_mesh")
    dc.smooth(ob, angle=80)

    def wear(p):
        sole = np.clip(1.0 - p.z / 0.012, 0, 1)
        p.mix(sole * 0.85, "#2A1D15")                                   # the sole and the heel: a dark line at the ground
        p.mix(np.clip(1.0 - np.abs(p.z - 0.03) / 0.03, 0, 1) * 0.35, "sand")       # dust to the welt
        p.mix((p.y < -0.06) * (p.z > 0.02) * (p.z < 0.07) * 0.4, "#9A7250")   # toes scuffed pale
        p.mul(np.clip(1.0 - np.abs(p.z - 0.085) / 0.03, 0, 1) * (p.y > 0.0), 0.72)   # the crease at the ankle
        p.mix(np.clip((p.z - 0.21) / 0.06, 0, 1) * 0.3, "#8A6444")      # the mouth of the shaft, worn by hands pulling it on
    dc.compose(ob, ao=0.85, gradient=(0.85, 1.05), part_jitter=0.05, seed=args.seed, painters=[wear], contact=(0.008, 0.8), quiet=True)


def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    build(args)
    dc.export_asset(ASSET, args)


if __name__ == "__main__":
    scene.run(main)
