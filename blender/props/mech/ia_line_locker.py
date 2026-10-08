"""ia_line_locker: a Pellam line locker, 0.6 x 1.2 x 0.3. An enamel cabinet on a steel kick, a rounded door of opaque
`lens` glass in a steel rim (hinged on the left, 0.15 m corner radii), an aqua lamp bar across the top (`lamp`), and
inside, on a lit shelf, a brass cradle for ONE upright line round (`round_slot`: the case head's seat; code shows a
prop_cartridge_line there). picto_line on the door, the station 4 on both flanks, the cast plate under the door.

Pivot: back centre at floor level. Bones are vertical: `door` stands on the hinge line at the cabinet's front left."""

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

ASSET = "ia_line_locker"

W, D = 0.6, 0.3
Z0, Z1 = 0.20, 1.20            # the enamel body above the kick
OX, OZ0, OZ1 = 0.22, 0.40, 1.02  # the door opening
SHELF = 0.60


LEAN = 0.55                    # how far an upright face's shading normal leans up (mech_common.relight): 29 degrees


def build(args):
    static, door = [], []
    ch = 0.02
    # ---- body: sides, top, the exact 20 mm chamfer round the front, the front holed for the opening
    def rect(x, y): return [(-x, y, Z0), (x, y, Z0), (x, y, Z1), (-x, y, Z1)]
    back = rect(W / 2, 0.0); mid = rect(W / 2, -(D - ch))
    fr = [(-(W / 2 - ch), -D, Z0 + ch), (W / 2 - ch, -D, Z0 + ch), (W / 2 - ch, -D, Z1 - ch), (-(W / 2 - ch), -D, Z1 - ch)]
    polys = []
    for k in range(4):
        j = (k + 1) % 4
        if k != 0: polys.append([back[k], back[j], mid[j], mid[k]])
        polys.append([mid[k], mid[j], fr[j], fr[k]])
    polys += mc.holed_front(-(W / 2 - ch), W / 2 - ch, Z0 + ch, Z1 - ch, -OX, OX, OZ0, OZ1, -D)
    static.append(mc.faces_obj("body", polys, "enamel"))
    # release pass p0: the niche is an enamel-lined light box (it was steel_dark, and its strip faced the shelf: from eye
    # height the round stood in a black hole). The liner takes the light from above (`relight`), the strip faces the room.
    inner = mc.faces_obj("inside", mc.recess(-OX, OX, OZ0, OZ1, -D, 0.24), "enamel_stain")
    static.append(inner)
    static.append(mc.slab("kick", (W - 0.03, D - 0.03, Z0), (0, -(D - 0.03) / 2, Z0 / 2), "steel", drop=("y+", "z-", "z+")))
    # ---- inside: the shelf, an always-lit aqua strip under the head of the recess, the brass cradle
    static.append(mc.slab("shelf", (2 * OX, 0.20, 0.03), (0, -0.17, SHELF - 0.015), "steel", drop=("y+", "x-", "x+")))
    gy = -D + 0.24 - 0.004
    static.append(mc.quad("glow", [(-0.18, gy, 0.80), (0.18, gy, 0.80), (0.18, gy, 0.832), (-0.18, gy, 0.832)], "aqua"))   # over the round's head, in sight from eye height
    seat_z = SHELF + 0.03
    seat = mc.lathe("seat", [(0.05, SHELF), (0.05, SHELF + 0.012), (0.018, seat_z), (0.0125, seat_z + 0.012), (0.0063, seat_z + 0.012), (0.0063, seat_z), (0.0, seat_z)], 6, "brass")
    mc.place(seat, (0, -0.17, 0)); static.append(seat)
    for s in (-1, 1):                                                           # two sprung fingers to the round's shoulder
        static.append(mc.tube("finger", [(s * 0.034, -0.17, SHELF + 0.012), (s * 0.03, -0.17, seat_z + 0.022), (s * 0.011, -0.17, seat_z + 0.034)], 0.0045, 3, "brass",
                              caps=(False, True), up=(0, 1, 0)))
    # ---- the top: lamp bar in its dark bezel, the livery band round the head
    static.append(mc.pillow("bezel", 0.50, 0.075, 0.014, 0.008, "steel_dark", centre=(0, -D, 1.095)))
    # breaking the box: a steel hood over the lamp bar that overhangs the flanks, and the feed cable it never got,
    # cut and hanging from the hood's back corner
    static.append(mc.slab("hood", (W + 0.07, D + 0.07, 0.045), (0, -(D + 0.07) / 2 + 0.012, Z1 + 0.0225), "steel", bevel=0.008))
    static.append(mc.tube("cable", [(0.24, -0.06, Z1 + 0.045), (0.25, -0.05, Z1 + 0.16), (0.30, -0.06, Z1 + 0.25), (0.37, -0.09, Z1 + 0.22), (0.39, -0.12, Z1 + 0.12)],
                          0.017, 3, "cable", caps=(False, True)))
    band = brand.livery_band([(-W / 2, -0.02), (-W / 2, -(D - ch)), (-(W / 2 - ch), -D), (W / 2 - ch, -D), (W / 2, -(D - ch)), (W / 2, -0.02)], z=0.325, height=0.06, offset=0.0015)
    static.append(band)
    plate = brand.maker_plate("4-118", rivet_segments=3)
    for o in plate.values(): mc.place(o, (0.0, -D, 0.305))
    for o in plate.values(): o.data.transform(Matrix.Scale(0.8, 4, (1, 0, 0)) @ Matrix.Identity(4))
    static.append(plate["plate"])
    # release pass p0 (the reviewer: "flat untextured volumes"): the flanks were two bare enamel rectangles. Three louvre
    # slots over the numeral and a service seam under it, each with its stain (below)
    for sx in (-1, 1):
        xf = sx * (W / 2 + 0.0006)
        for k in range(3):
            z = 0.985 + k * 0.045
            static.append(mc.quad("louvre", [(xf, -0.24, z), (xf, -0.10, z), (xf, -0.10, z + 0.018), (xf, -0.24, z + 0.018)][::sx], "steel_dark"))
        static.append(mc.quad("flank_seam", [(xf, -0.285, 0.43), (xf, -0.015, 0.43), (xf, -0.015, 0.437), (xf, -0.285, 0.437)][::sx], "steel_dark"))
    for z in (0.50, 0.92):                                                      # hinge knuckles on the left edge
        static.append(mc.lathe("knuckle", [(0.016, -0.05), (0.016, 0.05)], 5, "steel", centre=(-OX - 0.03, -D - 0.012, z), cap_start=True, cap_end=True))
    # ---- the door: rounded lens glass in a steel rim, a pull on the right; the inside face shows when it stands open
    outline = mc.rounded_rect(2 * OX + 0.05, OZ1 - OZ0 + 0.05, 0.15, 3)
    glass = mc.prism("glass", outline, 0.028, "lens", centre=(0, -D, (OZ0 + OZ1) / 2), chamfer=0.016, back=True)
    mc.recolour(glass, "steel", lambda p: abs(p.normal.y) < 0.85)
    mc.recolour(glass, "enamel_stain", lambda p: p.normal.y > 0.85)             # the inside face: an enamel liner, seen when the door stands open
    door.append(glass)
    door.append(mc.slab("pull", (0.03, 0.035, 0.16), (OX - 0.045, -D - 0.045, (OZ0 + OZ1) / 2), "steel", drop=("y+",)))
    hx, hy = -OX - 0.03, -D - 0.012
    arm = rig.make_armature(ASSET + "_rig", [("root", (0, 0, 0), (0, 0, 0.1), None), ("door", (hx, hy, OZ0), (hx, hy, OZ0 + 0.1), "root")])
    pd = plate["decals"]
    ob = rig.join_as_rigid_skin({"root": static, "door": door}, arm, ASSET + "_mesh")
    mc.ao_compose(ob, distance=0.3, jitter=0.0, seed=args.seed, gradient=(0.84, 1.05), hidden=[pd])
    vcol.streak_under(ob, [(-0.27, -D, 1.05), (0.27, -D, 1.05)], width=0.05, length=0.3)
    vcol.streak_under(ob, [(sx * W / 2, y, 0.985) for sx in (-1, 1) for y in (-0.22, -0.12)], width=0.05, length=0.26)   # the louvres weep
    mc.grime_below(ob, Z0, Z0 + 0.42, 0.80)                                     # kicked and handled low down
    # the niche was baked shut behind its door: lift it, then paint the strip's light down the liner (aqua, falling off
    # to the shelf and toward the door)
    def niche(p, n): return (np.abs(p[:, 0]) < OX + 0.001) & (p[:, 1] > -D + 0.004) & (p[:, 1] < -0.055) & (p[:, 2] > OZ0 - 0.001) & (p[:, 2] < OZ1 + 0.001)
    mc.lift(ob, niche, 0.82)
    def strip_light(p, n):
        k = np.clip(1.0 - np.abs(p[:, 2] - 0.82) / 0.42, 0, 1) ** 1.3 * (0.45 + 0.55 * np.clip((p[:, 1] + D) / 0.24, 0, 1))
        f = (0.30 + 0.70 * k)[:, None] * np.array([[0.62, 1.0, 0.96]], np.float32)
        return np.where(niche(p, n)[:, None], f, 1.0)
    mc.shade(ob, strip_light)
    # the door was baked shut: its rim and inside face must not stay AO-black when it stands open
    mc.lift(ob, lambda p, n: (p[:, 1] < -D + 0.001) & (np.abs(p[:, 0]) < OX + 0.04) & (p[:, 2] > OZ0 - 0.04) & (p[:, 2] < OZ1 + 0.04), 0.8)
    # the lens glass: one painted highlight (two pale diagonals), so it reads as glass and not as a hole
    hl = []
    for (xa, wdt) in ((-0.10, 0.05), (-0.01, 0.018)):
        y = -D - 0.0285
        hl.append(mc.quad("sheen", [(xa, y, 0.90), (xa + wdt, y, 0.90), (xa + wdt + 0.07, y, 0.985), (xa + 0.07, y, 0.985)], "steel"))
    for o in hl: o.vertex_groups.new(name="door").add(range(len(o.data.vertices)), 1.0, 'REPLACE')
    ob = mc.overlay_join(ob, hl)
    mc.relight(ob, LEAN, niche)                                                 # upright faces take half the key; the liner all of it
    zone.lamp_set("lamp", [mc.lamp_rect((0, -D - 0.0145, 1.095), 0.44, 0.036)], colour="aqua")
    dd, ds = mc.Decals(), mc.Decals()
    dd.add((0.0, -D - 0.028, 0.80), 0.34, 0.085, "picto_line", None, "enamel", lift=0.001)
    for s, nrm in ((-1, "-x"), (1, "+x")):
        ds.add((s * W / 2, -0.15, 0.80), 0.16, 0.24, "numerals", 4, "steel_dark", nrm)
    dec = rig.join_as_rigid_skin({"door": [dd.build("door_picto")], "root": [ds.build("flank_four"), pd]}, arm, "locker_decals")
    export.marker("round_slot", (0, -0.17, seat_z))
    # ---- clips: vertical bone, local y = up: a negative turn swings the free edge out toward the front
    n = anim.frames(ASSET, "open")
    a1 = anim.new_action(arm, "open")
    for f, a in ((0, 0), (1, 1.0), (3, -14), (8, -98), (10, -113), (12, -106), (14, -110.5), (n, -110)):
        anim.key_pose(arm, f, {"door": {"rot": (0, math.radians(a), 0)}})
    anim.reset_pose(arm)
    a2 = anim.new_action(arm, "close")
    for f, a in ((0, -110), (2, -112), (5, -80), (10, -6), (11, 0), (12, -2.2), (13, 0), (n, 0)):
        anim.key_pose(arm, f, {"door": {"rot": (0, math.radians(a), 0)}})
    mc.finish_actions(arm, [a1, a2])

if __name__ == "__main__":
    mc.std_main(ASSET, build)
