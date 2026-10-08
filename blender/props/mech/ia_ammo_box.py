"""ia_ammo_box: the Pellam wall dispenser the town hung a tin cup beside (ART_BIBLE 7.4; a seam object: salvage + misreading).

Pivot: back-plate centre at floor level; the wall is the plane y = 0 (Blender), the front is -Y.
Parts: steel back-plate, enamel body (20 mm bevel, exact), a recessed steel lower housing with the dark chute mouth, a
tray lip, the spring flap (bone `flap`), a lamp bar in a dark bezel, the livery band, the cast maker's plate, a
stencilled 4 and an arrow; beside it on a bent nail the town's dented tin cup, and above it their brushed mark, struck
through.
"""
import sys, os
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
while not os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py")):
    if os.path.dirname(_d) == _d: raise SystemExit("blender/lib not found")
    _d = os.path.dirname(_d)
sys.path.insert(0, os.path.join(_d, "blender")); sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import math
import numpy as np
from lib import scene, mesh, uv, material, vcol, rig, anim, export, zone, brand
import mech_common as mc

ASSET = "ia_ammo_box"


def build(args):
    rng = scene.rng(args.seed)
    root, flap_parts = [], []
    # ---- Pellam: exact, orthogonal
    root.append(mc.slab("back", (0.66, 0.02, 0.98), (0, -0.01, 0.50), "steel", drop=("y+",)))
    body = mc.slab("body", (0.60, 0.23, 0.60), (0, -0.135, 0.62), "enamel", drop=("y+",), bevel=0.02)
    mc.recolour(body, "enamel_stain", lambda p: p.normal.z < -0.5)
    root.append(body)
    root.append(mc.slab("crown", (0.50, 0.17, 0.035), (0, -0.105, 0.9375), "steel", drop=("y+", "z-")))
    # lower housing, set back 30 mm under the body so the body throws a shadow line; the chute mouth is a dark recess
    X, Y0, Z0, Z1 = 0.285, -0.22, 0.04, 0.32
    hx, hz0, hz1 = 0.16, 0.10, 0.245
    root.append(mc.faces_obj("housing", mc.holed_front(-X, X, Z0, Z1, -hx, hx, hz0, hz1, Y0)
                             + [[(-X, -0.02, Z0), (-X, Y0, Z0), (-X, Y0, Z1), (-X, -0.02, Z1)], [(X, Y0, Z0), (X, -0.02, Z0), (X, -0.02, Z1), (X, Y0, Z1)],
                                [(-X, -0.02, Z0), (X, -0.02, Z0), (X, Y0, Z0), (-X, Y0, Z0)]], "steel"))
    root.append(mc.faces_obj("mouth", mc.recess(-hx, hx, hz0, hz1, Y0, 0.13), "steel_dark"))
    root.append(mc.slab("tray", (0.36, 0.10, 0.028), (0, -0.262, 0.088), "steel", drop=("y+",), rot=(math.radians(-14), 0, 0), taper=(0.94, 1.0)))
    for sx in (-1, 1):                                                           # tray cheeks
        root.append(mc.slab("cheek", (0.018, 0.085, 0.06), (sx * 0.172, -0.262, 0.118), "steel", drop=("y+", "z-"), taper=(1.0, 0.45), top_shift=(0, 0.02)))
    # the flap hangs in the mouth from a pin along X
    flap_parts.append(mc.slab("flap_leaf", (0.34, 0.012, 0.155), (0, -0.228, 0.178), "enamel_stain", drop=("y+",)))
    flap_parts.append(mc.tube("flap_pin", [(-0.18, -0.228, 0.258), (0.18, -0.228, 0.258)], 0.011, 4, "steel_dark"))
    # four bolt heads on the back-plate, louvre slots in the body's flanks, a cut cable hanging from the crown
    for sx in (-1, 1):
        for z in (0.045, 0.955):
            root.append(mc.pillow("bolt", 0.03, 0.03, 0.008, 0.006, "steel_dark", centre=(sx * 0.31, -0.02, z), sides=False))
        for k in range(3):
            z = 0.50 + k * 0.045
            root.append(mc.quad("slot", [(sx * 0.3006, -0.20, z), (sx * 0.3006, -0.08, z), (sx * 0.3006, -0.08, z + 0.016), (sx * 0.3006, -0.20, z + 0.016)][::sx], "steel_dark"))
    root.append(mc.tube("cable", [(-0.17, -0.06, 0.955), (-0.172, -0.045, 1.07), (-0.19, -0.035, 1.17), (-0.235, -0.05, 1.215)], 0.014, 3, "cable", caps=(False, True)))
    # lamp bezel, livery, plate
    root.append(mc.pillow("bezel", 0.46, 0.07, 0.012, 0.008, "steel_dark", centre=(0, -0.25, 0.855)))
    band = brand.livery_band([(-0.3, -0.135), (-0.3, -0.25), (0.3, -0.25), (0.3, -0.135)], z=0.735, height=0.06)
    root.append(band)
    plate = brand.maker_plate("4-112")
    for o in plate.values(): mc.place(o, (0.0, -0.25, 0.60))
    root.append(plate["plate"])
    # ---- the town: a bent nail in the wall and a dented tin cup hung on it by its wire handle
    cx, cy, cz = 0.43, -0.07, 0.70
    root.append(mc.tube("nail", [(cx - 0.004, 0.0, cz + 0.105), (cx, -0.062, cz + 0.118), (cx + 0.002, -0.07, cz + 0.136)], 0.006, 3, "rust"))
    cup = mc.lathe("cup", [(0.0, 0.0), (0.034, 0.0), (0.043, 0.082), (0.039, 0.080), (0.031, 0.006), (0.0, 0.006)], 7, "tin")
    me = cup.data                                                                # two dents and a bent rim
    for v in me.vertices:
        a = math.atan2(v.co.y, v.co.x)
        if v.co.z > 0.04: v.co.x *= 1.0 - 0.16 * max(0.0, math.cos(a - 0.6)) ** 3; v.co.z += 0.004 * math.sin(a * 2.0)
    mc.recolour(cup, "board_dark", lambda p: p.normal.z > 0.5 and p.center.z < 0.02)        # the dry dark inside
    mc.place(cup, (cx + 0.008, cy - 0.008, cz), (math.radians(9), math.radians(-13), 0.5))
    root.append(cup)
    root.append(mc.tube("cup_wire", [(cx + 0.02, cy + 0.03, cz + 0.07), (cx + 0.012, cy + 0.052, cz + 0.105), (cx, cy + 0.012, cz + 0.127),
                                     (cx - 0.004, cy - 0.01, cz + 0.10), (cx + 0.0, cy + 0.0, cz + 0.045)], 0.005, 3, "tin"))
    # ---- skeleton and skin
    arm = rig.make_armature(ASSET + "_rig", [("root", (0, 0, 0), (0, 0, 0.1), None), ("flap", (-0.1, -0.228, 0.258), (0.1, -0.228, 0.258), "root")])
    box = rig.join_as_rigid_skin({"root": root, "flap": flap_parts}, arm, ASSET + "_mesh")
    mc.ao_compose(box, distance=0.35, jitter=0.0, seed=args.seed, gradient=(0.80, 1.06))
    vcol.streak_under(box, [(-0.27, -0.25, 0.90), (0.27, -0.25, 0.90), (-0.144, -0.254, 0.51), (0.144, -0.254, 0.51)], width=0.06, length=0.28)
    mc.lift(box, lambda p, n: (p[:, 1] < -0.226) & (p[:, 1] > -0.236) & (np.abs(p[:, 0]) < 0.175) & (p[:, 2] > 0.09) & (p[:, 2] < 0.26), 0.78)   # the flap: baked against the mouth
    mc.grime_below(box, 0.04, 0.34, 0.86)                                         # kicked and handled low down
    mc.relight(box, 0.35)                                                         # release pass p0: upright faces take a third of a top key (it stood navy-black in the proving bay)
    # ---- lamp set and decals
    zone.lamp_set("lamp", [mc.lamp_rect((0, -0.2625, 0.855), 0.40, 0.034)], colour="aqua")
    d = mc.Decals()
    dec = plate["decals"]
    d.add((0.17, -0.25, 0.44), 0.11, 0.165, "numerals", 4, "steel_dark")
    d.add((-0.16, -0.25, 0.43), 0.13, 0.13, "picto_misc", 0, "steel_dark", roll=-math.pi / 2)
    d.add((0.02, 0.0, 1.36), 0.33, 0.495, "mark_brush_a", None, "town_paint", lift=0.003)
    d.add((0.02, 0.0, 1.38), 0.46, 0.058, "strike", None, "graphite", roll=math.radians(22), lift=0.005)
    mine = d.build("stencils")
    decals = mesh.join([dec, mine], "decals")
    # ---- clip: the flap kicks out and settles (hinge along +X at its top: negative swings out toward -Y)
    act = anim.new_action(arm, "dispense"); n = anim.frames(ASSET, "dispense")
    mc.key_curve(arm, "flap", [(0, 0), (1, 6), (3, -62), (5, -40), (7, 9), (9, -14), (10, 3), (11, -4), (n, 0)])
    mc.finish_actions(arm, [act])


if __name__ == "__main__":
    mc.std_main(ASSET, build)
