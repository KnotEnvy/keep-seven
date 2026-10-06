"""ia_baffle: the Pellam baffle door of the gallery (3 x 3 x 0.3 m). Two ceramic leaves whose meeting edges interlock
in three steps, a broad hazard diagonal on each, the livery band, the cast plate, a hand-off pictogram; and the lamp
bar of three lamps that mounts on the wall ABOVE the lintel, outside the 3 x 3 leaf area (`door_lamps`).

Pivot: sill centre. Bones are vertical (frames = game axes): `leaf_l` slides to -X, `leaf_r` to +X. `open` (3.0 s)
grinds: the right leaf starts with a jolt and runs; the left one follows, sticks at 70 %, shudders, breaks free."""

import sys, os
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
while not os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py")):
    if os.path.dirname(_d) == _d: raise SystemExit("blender/lib not found")
    _d = os.path.dirname(_d)
sys.path.insert(0, os.path.join(_d, "blender")); sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import math
import numpy as np
from mathutils import Vector, Matrix
from lib import scene, mesh, uv, material, vcol, rig, anim, export, zone, brand, knot, layout, manifest
import mech_common as mc

ASSET = "ia_baffle"

STEP = 0.15           # half the depth of an interlocking step
TRAVEL = 1.68


def leaf(sign):
    """sign -1 = left leaf. The meeting edge steps +STEP / -STEP / +STEP from the sill up (the right leaf mirrors it
    as its complement)."""
    e = [STEP, -STEP, STEP]
    if sign < 0:
        outline = [(-1.5, 0.0), (e[0], 0.0), (e[0], 1.0), (e[1], 1.0), (e[1], 2.0), (e[2], 2.0), (e[2], 3.0), (-1.5, 3.0)]
    else:
        outline = [(1.5, 3.0), (e[2], 3.0), (e[2], 2.0), (e[1], 2.0), (e[1], 1.0), (e[0], 1.0), (e[0], 0.0), (1.5, 0.0)]
    parts, over = [], []
    core = mc.prism("core", outline, 0.26, "steel", centre=(0, 0.13, 0), front=True, back=True)
    parts.append(core)
    for face in (-1, 1):                                                        # -1 front (-Y), +1 back (+Y)
        for row in range(3):
            xe = e[row]
            x0, x1 = (-1.5 + 0.10, xe - 0.07) if sign < 0 else (xe + 0.07, 1.5 - 0.10)
            w = x1 - x0; cx = (x0 + x1) / 2; cz = row + 0.5
            p = mc.pillow("panel", w, 0.90, 0.02, 0.02, "enamel", centre=(cx if face < 0 else -cx, -0.13, cz), sides=False)
            if face > 0: p.data.transform(Matrix.Rotation(math.pi, 4, 'Z'))
            parts.append(p)
            y = face * 0.1515
            if sign > 0:                                                        # the dark seal along the stepped meeting edge
                c = [(xe - 0.016, y, row + 0.0), (xe + 0.016, y, row + 0.0), (xe + 0.016, y, row + 1.0), (xe - 0.016, y, row + 1.0)]
                over.append(mc.quad("seal", c if face < 0 else c[::-1], "cable"))
            if row == 1:                                                        # livery at 1.2 m
                c = [(x0 + 0.02, y, 1.15), (x1 - 0.02, y, 1.15), (x1 - 0.02, y, 1.25), (x0 + 0.02, y, 1.25)]
                over.append(mc.quad("band", c if face < 0 else c[::-1], "livery"))
            if row == 2:                                                        # the hazard diagonal, 0.3 m broad, 45 degrees
                d = 0.42; xa = cx - sign * 0.1
                c = [(xa - 0.38, y, 2.08), (xa - 0.38 + d, y, 2.08), (xa + 0.38 + d - 0.42, y, 2.92), (xa + 0.38 - 0.42, y, 2.92)]
                c = [(xa - 0.62, y, 2.08), (xa - 0.20, y, 2.08), (xa + 0.62, y, 2.90), (xa + 0.20, y, 2.90)]
                over.append(mc.quad("hazard", c if face < 0 else c[::-1], "hazard"))
    return parts, over


def build(args):
    lp, lo = leaf(-1); rp, ro = leaf(1)
    static, d = [], mc.Decals()
    # the lamp bar on the wall above the lintel, and the top track the leaves hang from
    static.append(mc.slab("lamp_bar", (1.5, 0.10, 0.20), (0, -0.20, 3.32), "steel_dark", drop=("y+",), bevel=0.015))
    static.append(mc.slab("track", (6.4, 0.26, 0.14), (0, 0.0, 3.08), "steel", drop=("z+",)))
    lamps = [mc.lamp_disc((x, -0.2515, 3.32), 0.06, 8) for x in (-0.5, 0.0, 0.5)]
    for x in (-0.5, 0.0, 0.5):
        static.append(mc.lathe("lamp_ring", [(0.085, 0.0), (0.075, 0.012), (0.062, 0.004)], 8, "steel", centre=(x, -0.25, 3.32), rot=(math.radians(90), 0, 0)))
    # the cast plate and a hand-off pictogram on the right leaf's front, an asset number on the left
    plate = brand.maker_plate("4-131")
    for o in plate.values(): mc.place(o, (0.82, -0.15, 1.55))
    rp.append(plate["plate"])
    dl, dr = mc.Decals(), mc.Decals()
    dr.add((0.82, -0.151, 0.62), 0.34, 0.34, "picto_misc", 2, "steel_dark")
    x = -1.12
    for ch in "4131":
        dl.add((x, -0.151, 0.52), 0.11, 0.165, "numerals", int(ch), "steel_dark"); x += 0.13 if ch != "4" or x > -1.1 else 0.2
    arm = rig.make_armature(ASSET + "_rig", [("root", (0, 0, 0), (0, 0, 0.1), None), ("leaf_l", (-0.75, 0, 0), (-0.75, 0, 0.1), "root"), ("leaf_r", (0.75, 0, 0), (0.75, 0, 0.1), "root")])
    pd = plate["decals"]
    ob = rig.join_as_rigid_skin({"root": static, "leaf_l": lp, "leaf_r": rp}, arm, ASSET + "_mesh")
    over = lo + ro
    mc.ao_compose(ob, distance=0.4, jitter=0.0, seed=args.seed, gradient=(0.80, 1.05), hidden=over + [pd])
    for o in lo: o.vertex_groups.new(name="leaf_l").add(range(len(o.data.vertices)), 1.0, 'REPLACE')
    for o in ro: o.vertex_groups.new(name="leaf_r").add(range(len(o.data.vertices)), 1.0, 'REPLACE')
    ob = mc.overlay_join(ob, over)
    mc.grime_below(ob, 0.0, 0.9, 0.84)
    dec = rig.join_as_rigid_skin({"leaf_l": [dl.build("num")], "leaf_r": [dr.build("picto"), pd]}, arm, "baffle_decals")
    zone.lamp_set("door_lamps", lamps, colour="aqua")
    # ---- clip (90 frames)
    act = anim.new_action(arm, "open"); n = anim.frames(ASSET, "open")
    R = [(0, 0), (3, 0.035), (5, 0.028), (12, 0.12), (40, 0.86), (62, 1.50), (70, TRAVEL), (72, TRAVEL - 0.02), (75, TRAVEL), (n, TRAVEL)]
    Lk = [(0, 0), (8, 0), (11, 0.03), (13, 0.022), (22, 0.20), (42, 0.7 * TRAVEL), (44, 0.7 * TRAVEL - 0.012), (47, 0.7 * TRAVEL + 0.008), (50, 0.7 * TRAVEL - 0.01),
          (54, 0.7 * TRAVEL + 0.006), (58, 0.7 * TRAVEL), (61, 0.7 * TRAVEL + 0.09), (80, TRAVEL - 0.05), (84, TRAVEL), (86, TRAVEL - 0.015), (88, TRAVEL), (n, TRAVEL)]
    for f, v in R: anim.key_pose(arm, f, {"leaf_r": {"loc": (v, 0, 0)}})
    for f, v in Lk: anim.key_pose(arm, f, {"leaf_l": {"loc": (-v, 0, 0)}})
    mc.finish_actions(arm, [act])

if __name__ == "__main__":
    mc.std_main(ASSET, build)
