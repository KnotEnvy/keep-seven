"""pk_rounds_12: twelve rounds in a flat cartridge tin, tin gone to rust at the corners, the lid slid half back on
twelve case heads in two rows. No label. The Dowser's: square and neat. Modelled 1.6 x life: 0.18 x 0.07 x 0.12 m.
Pivot: base centre. One mesh, m_prop, AO + height ramp.

    node tools/build-assets.mjs --only pk_rounds_12
"""
import sys, os
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
while not (os.path.isfile(os.path.join(_d, "lib", "__init__.py")) or os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py"))):
    if os.path.dirname(_d) == _d: raise SystemExit(f"blender/lib not found above {os.path.abspath(__file__)}")   # never loop at the filesystem root
    _d = os.path.dirname(_d)
sys.path.insert(0, _d if os.path.isfile(os.path.join(_d, "lib", "__init__.py")) else os.path.join(_d, "blender"))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import math
import bpy, bmesh
from mathutils import Vector, Matrix
from lib import scene, mesh, uv, material, vcol, export, manifest
import ammo
from ammo_pickups import Build

ASSET = "pk_rounds_12"
W, D, H, C = 90.0, 60.0, 56.0, 6.0          # half width, half depth, wall height, corner chamfer (mm)


def octagon(hw, hd, c, z):
    return [(hw - c, -hd, z), (hw, -hd + c, z), (hw, hd - c, z), (hw - c, hd, z), (-hw + c, hd, z), (-hw, hd - c, z), (-hw, -hd + c, z), (-hw + c, -hd, z)]


def build(args):
    B = Build()
    lo = [B.v(p) for p in octagon(W, D, C, 0.0)]
    top = [B.v(p) for p in octagon(W, D, C, H)]
    inner = [B.v(p) for p in octagon(W - 2.4, D - 2.4, C - 1.0, H)]
    floor = [B.v(p) for p in octagon(W - 2.4, D - 2.4, C - 1.0, H - 14.0)]
    for i in range(8):
        j = (i + 1) % 8
        if i % 2 == 0:                                   # the short chamfer faces are the corners
            B.quad(lo[i], lo[j], top[j], top[i], "tin")
        else:                                            # a wall: one more vertex at the middle of its foot, so the rust (painted below) stays at the corners
            a, b = lo[i].co / 0.001, lo[j].co / 0.001
            m = B.v(((a.x + b.x) / 2, (a.y + b.y) / 2, 0.0))
            B.face([lo[i], m, lo[j], top[j], top[i]], "tin")
        B.quad(top[i], top[j], inner[j], inner[i], "tin")
        B.quad(inner[i], inner[j], floor[j], floor[i], "tin")
    B.face(list(reversed(floor)), "board_dark")
    # the lid, slid back over the left half, its folded edge hanging past the wall
    lz = H + 1.2
    lx0 = -W - 1.0; lx1 = 4.0
    pts = [(lx1, -D - 1.0), (lx1, D + 1.0), (lx0 + C, D + 1.0), (lx0, D + 1.0 - C), (lx0, -D - 1.0 + C), (lx0 + C, -D - 1.0)]
    lt = [B.v((x, y, lz)) for x, y in pts]; lb = [B.v((x, y, lz - 6.0)) for x, y in pts]
    B.face(list(reversed(lt)), "tin")
    for i in range(len(pts)):
        j = (i + 1) % len(pts)
        B.quad(lb[i], lb[j], lt[j], lt[i], "tin")
    # twelve heads in two rows; the six under the open half show
    for row in (-26.0, 26.0):
        for x in (20.0, 46.0, 72.0):
            B.disc((x, row, H - 14.0), 10.4, 10.5, 6, "brass")
    ob = B.finish(ASSET + "_mesh", recalc=False)
    mesh.recalc_normals(ob)
    ammo.finish_prop(ob, args.seed)
    # rust at the corners: no rust-coloured faces (they read as stickers). The tin's COLOR_0 is pulled toward the rust
    # cell at the foot of each of the four corners (a different amount at each), fading up the corner and along the
    # foot of the walls, and a little at the lid's two folded corners
    import numpy as np
    pos = vcol.corner_positions(ob, world=False) * 1000.0
    c = vcol.get_colors(ob)
    ratio = np.minimum(np.asarray(vcol.rgb("rust")) / np.asarray(vcol.rgb("tin")), 1.0)
    amount = {(1, -1): 0.95, (1, 1): 0.6, (-1, 1): 0.85, (-1, -1): 0.5}
    w = np.zeros(len(pos), dtype=np.float32)
    for (sx, sy), k in amount.items():
        at_corner = (np.abs(pos[:, 0] - sx * (W - C / 2)) < C) & (np.abs(pos[:, 1] - sy * (D - C / 2)) < C) & (np.abs(pos[:, 0]) > W - C - 0.5) | \
                    (np.abs(pos[:, 0] - sx * (W - C / 2)) < C) & (np.abs(pos[:, 1] - sy * (D - C / 2)) < C)
        w = np.where(at_corner & (pos[:, 2] < 1.0), k, w)                                           # the foot of the corner
        w = np.where(at_corner & (np.abs(pos[:, 2] - H) < 1.0) & (np.abs(np.hypot(pos[:, 0], pos[:, 1]) - np.hypot(W - C / 2, D - C / 2)) < 4.0), k * 0.12, w)
    lid_corner = (pos[:, 0] < -W + C + 0.5) & (np.abs(pos[:, 1]) > D - C - 0.5) & (pos[:, 2] > H - 6.0) & (pos[:, 2] < H - 3.0)
    w = np.where(lid_corner, 0.55, w)
    c[:, :3] *= (1.0 + (ratio[None, :] - 1.0) * w[:, None])
    vcol.set_colors(ob, c)


def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    build(args)
    export.export_asset(ASSET, args.out, blend=args.blend)
    if args.preview: export.preview(ASSET, args.out)


if __name__ == "__main__":
    scene.run(main)
