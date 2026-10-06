"""prop_rim_stone: the stone on the far rim. A flat slab 0.9 x 0.12 x 0.5 m, its top swept clean, with SEVEN shallow
seats in a row, 0.11 m apart, each fitting a 12 mm case head. Embedded (`placedBy: zone`).

SEATS (asset-local, game space: +X right, +Y up, +Z front): seat n (1..7) is at x = -0.11 * (7 - n), y = 0.12, z = 0.
Seat 7 is the ORIGIN column: it stands on the layout's `ia_stone_round` when the slab stands at `rim_stone`
(1.6, 18, 102.4), as the work order asks. The row therefore runs 0.66 m to the -X side, and the slab's body lies from
x = -0.78 to +0.12 (the order's 0.11 m pitch does not fit a 0.9 m slab centred on seat 7; docs/requests/art-props-dress.md).

    node tools/build-assets.mjs --only prop_rim_stone
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

ASSET = "prop_rim_stone"


PITCH = 0.11
TOP = 0.12
# Polish round 3 (lead ruling R5 / R7, the last close-up of the game): the six kept cases are part of the stone now and
# stand 2.6 x life size so they read as brass, mouth up, from 1.5 m (a 12 mm case is 4 px wide there). The zone's own
# life-size `prop_cartridge_kept` cases stand in the same seats and are swallowed by these (inside the wall, under the
# mouth). Two builds, chosen by the manifest's triBudget (docs/requests/art-props.md asks for 240):
#   budget < 230   three-sided cases with a bright mouth cap, a one-course slab          (75 triangles)
#   budget >= 230  six-sided cases with a rolled rim and a dark bore, the two-course slab and its flake (230 triangles)
CASE_H = 0.105
BRASS = "#B88A3A"; BRASS_LIT = "#D9B463"; BRASS_FOOT = "#6E4E22"; BORE = "#20140C"


def build(args):
    rng = scene.rng(args.seed)
    rich = int(manifest.asset(ASSET)["triBudget"]) >= 230
    cx = -0.33                                                          # the slab's own centre (seat 4)
    # ---- the slab: an eight-cornered flag of bedded sandstone, undercut at the foot, the arris knocked off the top
    outline = [(-0.45, -0.10), (-0.36, -0.235), (-0.05, -0.25), (0.30, -0.215), (0.45, -0.07), (0.41, 0.16), (0.27, 0.245),
               (0.20, 0.17), (0.07, 0.19), (-0.22, 0.235), (-0.43, 0.12)]   # the back edge has lost a bite (where the flake came from)
    outline = [(cx + x, y) for x, y in outline]
    N = len(outline)
    bm = mesh.new_bmesh()
    def ring(scale, z, dz=0.0):
        return [bm.verts.new((cx + (x - cx) * scale, y * scale, z + rng.uniform(-dz, dz))) for (x, y) in outline]
    if rich:
        r0 = ring(0.92, 0.0); r1 = ring(1.0, 0.066, 0.014); r2 = ring(0.95, TOP)
        rings = (r0, r1, r2)
    else:
        r0 = ring(0.90, 0.0); r2 = ring(0.97, TOP)
        rings = (r0, r2)
    for i, v in enumerate(r0):                                          # the undercut is uneven: the lower bed weathers back in places
        k = (0.90, 1.0, 0.86, 0.97, 0.88, 1.0, 0.93, 0.9, 0.95, 0.87, 1.0)[i % 11]
        v.co.x = cx + (v.co.x - cx) * k; v.co.y *= k
    for a, b in zip(rings[:-1], rings[1:]):
        for k in range(N):
            j = (k + 1) % N
            bm.faces.new((a[k], a[j], b[j], b[k]))
    bm.faces.new(r2)
    slab = mesh.new_mesh_object("slab", bm)
    dc.smooth(slab, angle=28)
    dc.paint(slab, "sand_pale", "rock_dark", shade=1.0)
    # ---- seat 7 (the origin): the one empty cup, a dark lozenge sized for the head of the round that stands in it
    s7 = 0.019
    seats = dc.poly("seats", [[(dx, dy, TOP + 0.0012) for dx, dy in ((-s7, 0.0), (0.0, -s7), (s7, 0.0), (0.0, s7))]])
    dc.paint(seats, "sand_pale", "#2B1716")
    parts = [slab, seats]
    # ---- the six kept cases in seats 1..6: spent, mouth up, each turned and leaning its own hair
    for i in range(6):
        x = -PITCH * (6 - i)
        if rich:
            c = dc.lathe(f"case{i}", [(0.0180, 0.0), (0.0175, CASE_H), (0.0150, CASE_H - 0.013)], seg=6, phase=0.5 * i, cap_last=True)
            dc.smooth(c, angle=65)                                      # round wall, hard mouth
        else:
            c = dc.lathe(f"case{i}", [(0.0205, 0.0), (0.0200, CASE_H)], seg=3, phase=0.9 + 1.7 * i, cap_last=True)
        # closer, polish round 3: the lean is 1.5 degrees at most (it was 2.5) and the bore 15 mm (14.2): at 2.5 degrees the
        # rich build's bore ring came within 10.2 mm of the seat's axis and tests/art_props/dress/variants.test.mjs asks 11
        dc.place(c, (x, 0.0, TOP - 0.002), (math.radians(rng.uniform(-1.5, 1.5)), math.radians(rng.uniform(-1.5, 1.5)), 0.0))
        dc.paint(c, "sand_pale", BRASS)                               # the pale cell: the lit mouth is paler than the `brass` cell allows
        parts.append(c)
    if rich:
        # a flake that spalled off the slab's back edge long ago, lying against its foot (the outline is never a lozenge)
        flake = dc.prism("flake", [(-0.09, 0.0), (0.10, 0.0), (0.02, 0.075)], 0.028, axis='y', cap_back=False)
        dc.place(flake, (cx + 0.15, 0.2, 0.004), (math.radians(-58), 0.0, math.radians(8)))
        dc.paint(flake, "sand_pale", "rock_dark", shade=0.92)
        parts.append(flake)
    ob = dc.join(parts, ASSET + "_mesh")

    dc.bake_ao([ob], distance=0.25)

    def paint(p):
        case = p.fcen[:, 2] > TOP + 0.01
        seat = (p.col[:, 0] < 0.05) & ~case
        top = (p.fnrm[:, 2] > 0.8) & (p.z > TOP - 0.004) & ~seat & ~case
        side = ~top & ~seat & ~case
        p.mix(top * 0.8, "#93604E")                                     # the top: swept clean, pale with handling
        p.mix(top * dc.P.near(p, (cx, 0.0, TOP), 0.5, scale=(1.0, 0.4, 1.0)) * 0.3, "#A8735C")   # worn palest along the row
        upper = side & (p.z > 0.05)
        p.mix(upper * 0.35, "#6E3F36")                                  # the upper bed of the slab, a redder course
        p.mix(side * np.clip(1.0 - p.z / 0.07, 0, 1) * 0.6, "#3B2A30")  # dust and shadow in the undercut
        # the cases: brass, tarnished at the foot, bright at the mouth
        up = p.fnrm[:, 2] > 0.6
        h = np.clip((p.z - TOP) / CASE_H, 0, 1)
        p.col[case] = np.asarray(vcol.rgb(BRASS), dtype=np.float32)[None, :]      # no stone AO on brass: it must read at dusk
        p.mix(case * (1.0 - h) * 0.5, BRASS_FOOT)
        p.mix(case * ~up * np.clip((h - 0.72) / 0.28, 0, 1) * 0.8, BRASS_LIT)
        facet = 0.86 + 0.14 * np.clip(0.5 + 0.5 * (p.fnrm[:, 0] * 0.35 - p.fnrm[:, 1] * 0.94), 0, 1)   # the side that faces the walker is the lit one
        p.mix(case * up * 1.0, BORE if rich else BRASS_LIT)             # six sides have a bore (its far wall is the lit rim);
                                                                        # three cannot afford one: the mouth is the bright cap
        p.col[case & ~up] *= facet[case & ~up, None]
    dc.compose(ob, ao=0.85, gradient=(0.8, 1.05), part_jitter=0.0, face_jitter=0.05, seed=args.seed, painters=[paint], contact=(0.03, 0.6))


def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    build(args)
    dc.export_asset(ASSET, args)


if __name__ == "__main__":
    scene.run(main)
