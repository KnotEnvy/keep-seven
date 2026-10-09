"""prop_hat_hung: a broad-brimmed felt hat, 0.38 m across x 0.15 m, hung on a peg (ART_BIBLE 7.4, peg stair; P1).
Instanced dressing: one mesh, one material. Pivot: the END of the zone's peg. Pass i4: the hat hangs by its brim, the
brim against the rail board (+Y is the wall), the crown out toward the stair (-Y) and 8 degrees down, the whole peg
inside the crown under its upper side. The closed underside faces the wall.

    node tools/build-assets.mjs --only prop_hat_hung
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
from mathutils import Euler
import dress_common as dc

ASSET = "prop_hat_hung"


# Pass i4 (visual reviewer: "low-polygon flat-shaded shapes and the glowing pegs poke through the crowns"): the hat no longer
# SITS on the peg crown-up (the peg, 0.13 m of pale enamel, came out through its closed underside and its crown). It HANGS:
# the brim against the rail board, the crown toward the stair and tipped down a little, the peg wholly inside the crown,
# under its upper side, as a hat is hung. Ten sides, one welded smooth skin with a band and a pinched, creased crown.
# The zone's peg, in this asset's frame (Blender, +Y is the wall): tip at the origin, root at (0, 0.12, -0.02) on the
# board's face; the board is 0.15 m tall, the wall at y = 0.15.
TILT = math.radians(98.0)               # the crown's axis: out from the wall (-Y) and 8 degrees down
# Pass i5: felt, band and worn edge are a grey khaki (they were brown #6A5443 / #A8926C / #8A7460: under the stair's teal a
# brown turns olive green, "outside the teal palette"); a near-neutral albedo takes the room's hue and sits in it.
FELT = "#6C665E"; BAND = "#A9A294"; EDGE = "#8C867C"
SEAT = (0.0, 0.122, -0.045)             # the centre of the brim's plane: the peg bears on the inside of the crown, 6 cm above its axis


def build(args):
    def warp(v):
        a = math.atan2(v.y, v.x); r = math.hypot(v.x, v.y)
        if r > 0.10:
            k = (r - 0.10) / 0.09
            v.z += k * k * (0.030 * abs(math.cos(a)) ** 1.5 + 0.004) - k * 0.006           # both sides curl forward; top and bottom lie flat to the wall
            v.x *= 1.0 - 0.04 * k * abs(math.cos(a))
        elif v.z > 0.03 and r > 0.01:
            t = min(1.0, (v.z - 0.03) / 0.08)
            v.x *= 1.0 - 0.18 * t; v.y *= 1.0 + 0.12 * t                                    # the crown is pinched long (its long axis hangs upright)
            v.z += 0.010 * abs(math.sin(a)) * t - 0.012 * max(0.0, math.sin(a)) ** 2 * t    # the front pinch (the upper side as it hangs) is lower
        return v
    # Pass i5 (both visual reviewers: "eight-sided green plungers", "brims are dark 12-sided discs ... bottle caps"): the
    # BRIM's edge has twice the crown's sides (18 over 9: the brim is the silhouette, the crown is seen end-on), stitched
    # to the crown's foot by a fan. 108 triangles.
    from lib import mesh as _mesh
    from mathutils import Vector
    bm = _mesh.new_bmesh()
    # Pass i6 (both visual reviewers: "octagonal crowns", "a ring with a faceted knob"): the crown has TWELVE sides under
    # one smooth skin (nine), paid for by its top ring: the crease is a dent from the shoulder to the middle. The brim
    # keeps eighteen. 108 triangles.
    NC = 12; NB = 18
    def ring(r, z, n):
        return [bm.verts.new((math.cos(0.3 + 2 * math.pi * k / n) * r, math.sin(0.3 + 2 * math.pi * k / n) * r, z)) for k in range(n)]
    E = ring(0.19, 0.0, NB); C = ring(0.096, 0.013, NC); B = ring(0.089, 0.046, NC); S = ring(0.074, 0.134, NC)
    P = bm.verts.new((0.0, 0.0, 0.123))
    for v in list(bm.verts): v.co = warp(v.co.copy())
    for k, v in enumerate(E):                                           # a worn brim is not a disc: it waves, and its lower side has dropped
        a = 0.3 + 2 * math.pi * k / NB
        v.co.z += 0.007 * math.sin(3.0 * a + 0.8) + 0.012 * max(0.0, -math.sin(a)) ** 2
        v.co.x *= 1.0 + 0.03 * math.sin(2.0 * a + 2.0); v.co.y *= 1.0 - 0.05 * max(0.0, -math.sin(a))
    Q = bm.verts.new((0.0, 0.0, -0.02))                                # the back: a shallow cone into the board (a flat cap across the curled edge cut through the brim's face)
    for k in range(NB): bm.faces.new((E[(k + 1) % NB], E[k], Q))
    for m in range(6):                                                  # two sides of the crown's foot to three of the brim's edge
        c0, c1, c2 = C[2 * m], C[2 * m + 1], C[(2 * m + 2) % NC]
        e0, e1, e2, e3 = E[3 * m], E[3 * m + 1], E[3 * m + 2], E[(3 * m + 3) % NB]
        for f in ((c0, e0, e1), (c0, e1, c1), (c1, e1, e2), (c1, e2, c2), (c2, e2, e3)): bm.faces.new(f)
    for k in range(NC):
        j = (k + 1) % NC
        for lo, hi in ((C, B), (B, S)): bm.faces.new((lo[k], lo[j], hi[j], hi[k]))
        bm.faces.new((S[k], S[j], P))
    hat = _mesh.new_mesh_object("hat", bm)
    hat.name = ASSET + "_mesh"
    dc.smooth(hat, angle=95)                                           # (pass i6: one skin over the shoulder too: a soft crown; its foot and the band are sharpened below)
    dc.paint(hat, "linen", FELT)
    R = np.array(Euler((TILT, 0.0, math.radians(3.0)), 'XYZ').to_matrix(), dtype=np.float32)
    dc.place(hat, (0.0, 0.0, 0.0), (TILT, 0.0, math.radians(3.0)))
    dc.place(hat, SEAT)
    # (Pass i6, tried and removed: bending the brim's upper and lower arcs back onto the wall, so that High's contact shade,
    # src/render/post.ts AO_THIN 28 mm, has no gap to draw. The rail board is 3 cm proud of the wall and runs at the
    # stair's slope, not level in this asset's frame: the board then cut through the bent brim.)
    def own(v): return (np.array(v, dtype=np.float32) - np.array(SEAT, dtype=np.float32)) @ R
    def band_top(a, b):
        qa, qb = own(a), own(b)
        return all(0.036 < q[2] < 0.062 and math.hypot(q[0], q[1]) > 0.06 for q in (qa, qb))
    dc.sharpen(hat, band_top)                                          # the ribbon's upper edge is a hard line of colour
    def foot(a, b):
        return all(0.004 < q[2] < 0.032 and math.hypot(q[0], q[1]) < 0.125 for q in (own(a), own(b)))
    dc.sharpen(hat, foot)                                              # where the crown stands on the brim
    wall = dc.box("_wall", (1.2, 0.02, 1.2), (0.0, 0.16, 0.0))        # the wall and the board shade the brim's back in the AO
    board = dc.box("_board", (1.2, 0.03, 0.15), (0.0, 0.135, -0.02))
    dc.bake_ao([hat], distance=0.14, ground=None, extra=(wall, board))
    scene.remove(wall); scene.remove(board)

    def felt(p):
        # back in the hat's own frame (brim plane z = 0, the crown along +Z)
        off = np.array(SEAT, dtype=np.float32)
        q = (p.pos - off) @ R; fq = (p.fcen - off) @ R
        r = np.hypot(q[:, 0], q[:, 1]); z = q[:, 2]; fr = np.hypot(fq[:, 0], fq[:, 1]); fz = fq[:, 2]
        crown = (fr < 0.098) & (fz > 0.012)
        band = crown & (fz < 0.045)
        p.mix(band * 0.9, BAND)                                                     # the band: a pale plaited cord round the foot of the crown
        p.mul(crown * ~band * np.clip(1.0 - (z - 0.045) / 0.03, 0, 1), 0.7)                # the cord's shadow on the felt above it   # felt worn pale above the band
        top = (r < 0.03) & (z > 0.10)
        p.mul(top, 0.74)                                                                 # the crease holds a shadow
        p.mul(crown * (z > 0.125) * (r > 0.03), 1.06)                                   # the ridge round the crease catches the light
        p.mul(crown * ~band, 0.90)                                                       # (pass i6) crown and brim are one felt
        brim = ~crown & ((p.fnrm @ R[:, 2]) >= -0.3)
        aov = vcol.get_colors(p.ob, "AO")[:, 0]                                        # (the board's shade made the brim a dark disc under a pale crown: two thirds of it are taken back)
        p.col[brim] *= (1.0 * (0.4 + 0.6 * (0.72 + 0.28 * aov)) / (0.4 + 0.6 * aov))[brim, None]   # (pass i6: 0.86 and 0.6 + 0.4: a dark ring round a pale knob)
        p.mix(brim * np.clip((r - 0.165) / 0.025, 0, 1) * 0.3, EDGE)                      # the brim's edge worn pale
        p.mul(brim * np.clip(1.0 - (r - 0.095) / 0.035, 0, 1), 0.72)                     # the brim is dark where it turns into the crown
        p.mix(np.clip(p.nrm[:, 2], 0, 1) ** 1.5 * 0.22, "sand")                          # dust on what faces up as it hangs
        p.mul(np.clip(-p.nrm[:, 2], 0, 1), 0.8)                                          # its underside in its own shade
        back = (p.fnrm @ R[:, 2]) < -0.3
        p.mix(back * 0.8, "#1F1714")                                                     # the sweatband side, against the wall
    dc.compose(hat, ao=0.6, gradient=(0.94, 1.04), part_jitter=0.0, face_jitter=0.0, seed=args.seed, painters=[felt], quiet=True)


def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    build(args)
    dc.export_asset(ASSET, args)


if __name__ == "__main__":
    scene.run(main)
