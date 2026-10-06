"""pk_rounds_6: six rounds in a brown paper packet tied with cord; one corner torn, two brass case heads showing.
Modelled 1.6 x life: 0.14 x 0.06 x 0.09 m (game x, y, z). Pivot: base centre. One mesh, m_prop, AO + height ramp.

    node tools/build-assets.mjs --only pk_rounds_6
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
from ammo_pickups import Build, prism

ASSET = "pk_rounds_6"


def head(B, x, y, z, r, h, n=6):
    """A case head looking out of the torn end: axis +X, cap at x + h."""
    ring = lambda xx: [B.v((xx, y + r * math.cos(2 * math.pi * k / n + 0.3), z + r * math.sin(2 * math.pi * k / n + 0.3))) for k in range(n)]
    a = ring(x); b = ring(x + h)
    B.face(b, "brass")
    for k in range(n): B.quad(a[k], a[(k + 1) % n], b[(k + 1) % n], b[k], "brass")
    p = [B.v((x + h + 0.3, y + 3.6 * math.cos(2 * math.pi * k / 4), z + 3.6 * math.sin(2 * math.pi * k / 4))) for k in range(4)]
    B.face(p, "ui_brass_dim")                                   # the primer


def build(args):
    rng = scene.rng(args.seed)
    B = Build()
    XS, NY, NZ = 50.0, -5.0, 27.0                              # the torn corner: everything right of XS, in front of NY, above NZ is gone
    # the packet: a wrapped block, soft top edges, a little crumpled at its whole end (Frontier paper: jittered)
    prof = [(-44.0, 0.0), (44.0, 0.0), (45.0, 47.0), (39.0, 59.5), (-38.5, 60.0), (-45.0, 47.5)]       # (y = depth, z) ; y toward the back
    J = {}
    def jit(i, side):
        k = (i, side)
        if k not in J: J[k] = (0.0, 0.0, 0.0) if side == 1 else (rng.uniform(-1.5, 1.5), rng.uniform(-1.6, 1.6), 0.0 if prof[i][1] == 0 else rng.uniform(-1.8, 1.2))
        return J[k]
    a, b = prism(B, prof, -70.0, XS, "board_bleached", jitter=jit, caps=False)
    B.face(list(reversed(a)), "board_bleached")
    B.face(b, "board_dark")                                    # the back of the opening: the dark inside of the packet
    # the rest of that end, the corner torn out of it: the floor and the side of the notch are the inside of the paper
    end = [(-44.0, 0.0), (44.0, 0.0), (45.0, 47.0), (39.0, 59.5), (NY, 60.0), (NY, NZ), (-44.6, NZ)]
    ea = [B.v((XS, y, z)) for y, z in end]; eb = [B.v((70.0, y, z)) for y, z in end]
    for i in range(len(end)):
        j = (i + 1) % len(end)
        B.quad(ea[i], ea[j], eb[j], eb[i], "board_dark" if i in (4, 5) else "board_bleached")
    B.face(eb, "board_bleached")
    # two case heads in the opening, brass, primers darker
    head(B, XS, -34.6, 43.6, 9.6, 6.0); head(B, XS + 0.0, -15.0, 43.0, 9.6, 4.5)
    # the torn paper: a flap folded up and back over the top, a tongue hanging from the floor of the tear, a curl at the back
    def flap(pts, c0="board_bleached", c1="workcloth_light"):
        q = [B.v(p) for p in pts]; B.face(q, c0)
        B.face(list(reversed([B.v(p) for p in pts])), c1)
    flap([(XS + 1.0, NY, 60.0), (70.0, NY, 60.0), (64.0, NY + 9.0, 69.0)])
    flap([(XS + 2.0, -44.6, NZ), (69.0, -44.6, NZ), (63.0, -51.0, NZ - 11.0)])
    flap([(XS, -37.0, 60.0), (XS, -9.0, 60.2), (XS - 6.0, -22.0, 67.0)])
    # the cord: once round the short way (not under the base), once the long way, a knot and two tails on top
    def band_short(x, w):
        pts = [(46.6, 0.0), (46.6, 47.5), (40.5, 61.5), (-40.0, 62.0), (-46.6, 48.0), (-46.6, 0.0)]
        rows = [[B.v((x - w, y, z)) for y, z in pts], [B.v((x + w, y, z)) for y, z in pts]]
        for i in range(len(pts) - 1): B.quad(rows[0][i], rows[0][i + 1], rows[1][i + 1], rows[1][i], "cord")
    band_short(-12.0, 2.2)
    top = 61.6
    L = [B.v((-72.0, 12.0, 0.0)), B.v((-72.0, 16.4, 0.0)), B.v((-72.0, 12.0, 47.5)), B.v((-72.0, 16.4, 47.5)), B.v((-62.0, 12.0, top)), B.v((-62.0, 16.4, top)),
         B.v((62.0, 12.0, top)), B.v((62.0, 16.4, top)), B.v((72.0, 12.0, 47.5)), B.v((72.0, 16.4, 47.5)), B.v((72.0, 12.0, 0.0)), B.v((72.0, 16.4, 0.0))]
    for i in (0, 2, 4, 6, 8): B.quad(L[i], L[i + 2], L[i + 3], L[i + 1], "cord")
    kx, ky = -12.0, 14.2
    k = [B.v((kx, ky, top + 4.2)), B.v((kx - 3.5, ky - 3.5, top)), B.v((kx + 3.5, ky - 3.5, top)), B.v((kx + 3.5, ky + 3.5, top)), B.v((kx - 3.5, ky + 3.5, top))]
    for i in range(4): B.face([k[0], k[1 + i], k[1 + (i + 1) % 4]], "cord")
    for (dx, dy) in ((11.0, -15.0), (-8.0, -19.0)):
        flap([(kx, ky - 1.5, top + 1.2), (kx, ky + 1.5, top + 1.2), (kx + dx, ky + dy + 1.5, top + 0.6), (kx + dx, ky + dy - 1.5, top + 0.6)], "cord", "cord")
    ob = B.finish(ASSET + "_mesh", recalc=False)
    from lib import mesh as M
    M.recalc_normals(ob)
    ammo.finish_prop(ob, args.seed, ao_min=0.62)


MM_ = 0.001


def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    build(args)
    export.export_asset(ASSET, args.out, blend=args.blend)
    if args.preview: export.preview(ASSET, args.out)


if __name__ == "__main__":
    scene.run(main)
