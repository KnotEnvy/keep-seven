"""boss_windlass: the lift head of Station 4 (GDD 8, ART_BIBLE 6.4 / 7.7, order art-boss 4.1). Builder: art-boss-windlass.

    node tools/build-assets.mjs --only boss_windlass
    node tools/preview-asset.mjs boss_windlass --clip all --cycles --game --piece art-boss-windlass

The player's cylinder, five metres across, seen from the wrong end: a fluted drum with six lidded mouths in a ring,
hung face-out from a gantry arm over the bore. One rigid-skinned `body_mesh` on 26 bones + the lamp sets `boss_lamps`
(14) and `gauge` (26): 3 draw calls.

FRAMES. Everything is authored in GAME space (+Y up, the arm's heading +Z, origin on the bore axis at floor level; a
viewer in front of the drum has +X on her right) and written through windlass_geo.G2B. Every bone but the six lids is a
vertical bone, so its glTF rest frame IS the game frame (x right, y up, z out of the face):
    arm_yaw      turn about local Y
    drum_spin    turn about local Z (the face normal); a POSITIVE angle (counter-clockwise seen from the front) brings
                 mouth 2 to the top (mouths are numbered clockwise seen from the front)
    knot_n, pawl_l/r   head on the collar plate: scale local Z to squash the lobes onto it
    mouth_n      the game frame turned about Z by the mouth's angle (local Y = outward along the mouth's radius, local Z =
                 the face normal), head on the hinge pin: the clip on mouth_1 retargets by renaming its tracks.
                 open = +0.10 m along local Z (the lid lifts out of its recess), then +110 degrees about local Z
    root         head at the slew ring (0, 12.5, 0): the head sways and sags about its suspension, without translation.
                 `present` and `sag_death` tilt it about the ROOT's X axis (toward the root's +Z): they are authored for
                 arm_yaw = 0. To play them at another index, turn the instance's scene node by the index and leave the bone
                 at 0 (the same pose), or the head tips sideways
DESIGN NOTES (what the documents left open; see docs/requests/art-boss-windlass.md):
    * the flutes are cut through the whole depth, so the face has the scalloped outline of a cylinder's front. The
      pawl knots stood in the two upper flutes, 0.5 m behind the face (the documents' z 2.6), and the 0.5 m channel
      behind the face flange let them ride clear while the drum spun. Polish round 2: there the seated guard hid
      them from the floor (4 px of core showed at 960 x 540 from the door bay), so they now stand 0.85 m in FRONT of
      the face at (-/+1.6, 6.0, 3.95), r 0.30, on dog plates hung from outriggers under the crosshead's ends, clear
      of the guard in every clip (tests/art_boss/windlass_clearance). The channel stays as a groove round the drum;
    * the guard parks above the drum in front of two guide columns, so the gauge hangs beside the drum instead (never
      hidden by the parked plate); guard 4.46 m across so the lamps at 2.35 m stay countable with the guard on;
    * the guard is a FAN: five ceramic leaves on a centre boss, hung from the top beam on two hoist links whose top ends
      ride arm_yaw and whose bottom ends ride guard (they pay out; they are never off their pins). guard_drop: the leaves
      slap shut onto leaf 1 and the pack is run 2.85 m up, clear of the face. It does not go below the drum: nothing
      2.1 m wide can get from the face into the bore between the drum (1.5 m), the kerb (0.6 m), its merlons (1.2 m) and
      the player's head (docs/requests/art-boss-windlass.md 2.3). guard_drop and guard_raise therefore key guard AND
      guard_piece_1..5; guard_slide_on keys guard only; guard_shatter keys the five leaves from the seated pose.
"""
import sys, os
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
while not (os.path.isfile(os.path.join(_d, "lib", "__init__.py")) or os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py"))):
    if os.path.dirname(_d) == _d: raise SystemExit(f"blender/lib not found above {os.path.abspath(__file__)}")
    _d = os.path.dirname(_d)
sys.path.insert(0, _d if os.path.isfile(os.path.join(_d, "lib", "__init__.py")) else os.path.join(_d, "blender"))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import math
import bpy
import numpy as np
from mathutils import Matrix, Vector
from lib import scene, mesh, uv, material, vcol, rig, anim, export, zone, brand, knot
import windlass_geo as wg
from windlass_geo import Geo, gb, frame, circle

ASSET = "boss_windlass"
D2R = math.pi / 180.0

# ------------------------------------------------------------------ the numbers (game metres)
HUB = (0.0, 4.0, 2.0)
R_DRUM = 2.5; W_FACE = 1.1; W_BACK = -1.1                 # the drum in its own frame (u right, v up, w out of the face)
RC = 2.8; RF = 0.8                                          # flute cutter: centre radius, radius (deepest point r = 2.0)
FLUTE_INSET = (0.05, 0.08, 0.12, 0.14, 0.12, 0.08, 0.05)    # the cast edge of the face: wider inside the flutes
EDGE = 0.10                                                 # ... and this deep
R_CHAN = 2.25; W_CH0 = 0.35; W_CH1 = 0.85                   # the pawl channel behind the face flange
CHAMFER = 0.04
R_MOUTH = 1.7; MOUTH_R = 0.45; RECESS_R = 0.50; LIP_R = 0.62; LIP_H = 0.015; LID_R = 0.48; LID_T = 0.08
KNOT_R = 0.38; KNOT_Z = 2.8                                 # hit centre: 0.3 m behind the face
LAMP_R = 2.35; BEZEL_R = 0.11; LAMP_DISC_R = 0.08
PIVOT_T = 0.494; PIVOT_R = 0.305                            # the lid's hinge pin from the mouth centre (tangential, radial)
LID_POP = 0.10; LID_SWING = 110.0
PAWL = (1.6, 6.0, 3.95); PAWL_KNOT_R = 0.30                 # the hit centre: in FRONT of the guard's travel (polish round 2; see build_arm)
PAWL_ZB = PAWL[2] - 0.21                                    # the collar's back = the front of the pawl plate
GUARD_R = 2.23; GUARD_T = 0.12; GUARD_Z = 3.36
GUARD_PARK_Y = 9.45; GUARD_SEAT_Y = 4.0
GUARD_POP = 0.08; GUARD_UP = 2.85                           # released: the fan shut, stood 8 cm off its seat, run 2.85 m up
HOIST_Y = 11.5; LINK_X = 2.23 * math.sin(34.0 * D2R)        # the two hoist links: from the top beam to the rim, 34 degrees either side of the top
GAUGE_X = (2.90, 3.20); GAUGE_Y0 = 2.42; GAUGE_Z = 3.185
CABLE_X = (-0.28, 0.0, 0.28); CABLE_Z = 0.42; CABLE_TOP = 3.45; CABLE_BOTTOM = -5.6
MUZZLE_TOP = (0.0, 5.7, 3.1); CANISTER_MUZZLE = (0.0, 5.7, 3.3)

MD = Matrix.Translation(HUB)                                # drum frame -> game


def mouth_angle(n): return 60.0 * (n - 1)                   # degrees clockwise from the top, seen from the front
def er(a): return Vector((math.sin(a * D2R), math.cos(a * D2R), 0.0))      # outward
def et(a): return Vector((math.cos(a * D2R), -math.sin(a * D2R), 0.0))     # clockwise
def mouth_centre(n): return er(mouth_angle(n)) * R_MOUTH
def mouth_pivot(n): a = mouth_angle(n); return mouth_centre(n) + et(a) * PIVOT_T + er(a) * PIVOT_R
def game(p_drum): return (p_drum[0] + HUB[0], p_drum[1] + HUB[1], p_drum[2] + HUB[2])


def drum_profile(R=R_DRUM, inset=0.0, clamp=None, face=False):
    """The drum's outline, 48 points CLOCKWISE from the top (8 per sixth: land centre, then 7 points of the flute
    after it). `inset` pulls every point toward the hub; `clamp` limits the radius (the channel); face=True is the
    outline of the face itself (inside the cast edge: FLUTE_INSET)."""
    phi = math.acos((RC * RC + RF * RF - R * R) / (2 * RC * RF))
    pts = []
    for k in range(6):
        a = 60.0 * k
        pts.append(er(a) * R)
        d = er(a + 30.0); t = et(a + 30.0); cc = d * RC
        for j in range(7):
            psi = -phi + j * (2 * phi / 6)
            pts.append(cc + (-d * math.cos(psi) + t * math.sin(psi)) * RF)
    out = []
    for i, p in enumerate(pts):
        r = p.length; r2 = r - inset
        if face: r2 = r - (FLUTE_INSET[0] if i % 8 == 0 else FLUTE_INSET[i % 8 - 1])
        if clamp is not None: r2 = min(r2, clamp)
        out.append((p.x * r2 / r, p.y * r2 / r))
    return out


def ccw(pts): return list(reversed(pts))


# ------------------------------------------------------------------ the drum (bone drum_spin)
def build_drum(parts):
    P = lambda **kw: ccw(drum_profile(**kw))
    # the shell: back chamfer, body, face flange (steel)
    g = Geo(MD)
    rb0 = g.ring(P(inset=CHAMFER), W_BACK); rb1 = g.ring(P(), W_BACK + CHAMFER)
    rm = g.ring(P(), -0.35); rc0 = g.ring(P(), W_CH0)
    g.strip(rb0, rb1); g.strip(rb1, rm); g.strip(rm, rc0)
    rf0 = g.ring(P(), W_CH1); rf1 = g.ring(P(), W_FACE - EDGE)
    g.strip(rf0, rf1)
    parts["drum_spin"].append(g.done("drum_shell", "steel", smooth=50))
    wg.set_mark(parts["drum_spin"][-1], FACE_MARK, DRUM_SHELL)
    g = Geo(MD)                                                             # the worn front edge
    g.strip(g.ring(P(), W_FACE - EDGE), g.ring(P(face=True), W_FACE))
    parts["drum_spin"].append(g.done("drum_edge", "livery", shade=92, smooth=50))    # the livery band, drawn round the face's own outline
    # the channel: floor and its two walls (only where the lands are cut down)
    g = Geo(MD)
    full = P(); low = P(clamp=R_CHAN)
    a0 = g.ring(full, W_CH0); b0 = g.ring(low, W_CH0); b1 = g.ring(low, W_CH1); a1 = g.ring(full, W_CH1)
    cut = [math.hypot(*full[i]) > R_CHAN + 1e-6 for i in range(48)]
    for k in range(48):
        j = (k + 1) % 48
        if cut[k] or cut[j]:
            g.face((a0[k], a0[j], b0[j], b0[k])); g.face((b1[k], b1[j], a1[j], a1[k]))
        g.face((b0[k], b0[j], b1[j], b1[k]))
    parts["drum_spin"].append(g.done("drum_channel", "steel_dark", smooth=50))
    # the face: six enamel panels with a 30 mm seam on each flute's centre line, one mouth recess each
    cw = drum_profile(face=True)
    gap = 0.015
    g = Geo(MD)
    for k in range(6):
        a = 60.0 * k
        def seam_pt(rho, f, side):                                           # a point `gap` off the seam at angle f
            return tuple((er(f) * math.sqrt(max(rho * rho - gap * gap, 0.0)) + et(f) * (side * gap))[:2])
        deep = RC - math.sqrt(RF * RF - gap * gap) - FLUTE_INSET[3]
        outer = [seam_pt(deep, a - 30.0, +1)] + [cw[(8 * k - 4 + i) % 48] for i in range(1, 8)] + [seam_pt(deep, a + 30.0, -1)]
        inner = [seam_pt(0.60, a + 30.0, -1)] + [tuple((er(a + s) * 0.60)[:2]) for s in (15.0, 0.0, -15.0)] + [seam_pt(0.60, a - 30.0, +1)]
        c = mouth_centre(k + 1)
        g.fill([outer + inner, circle(LIP_R, 16, c.x, c.y)], W_FACE)
    parts["drum_spin"].append(g.done("drum_face", "enamel"))
    wg.set_mark(parts["drum_spin"][-1], FACE_MARK)
    g = Geo(MD)                                                              # what shows in the seams
    for k in range(6):
        f = 60.0 * k + 30.0
        g.face(g.ring([(-0.04, 0.56), (0.04, 0.56), (0.04, RC - RF - 0.02), (-0.04, RC - RF - 0.02)], W_FACE - 0.03, wg.rot_z(-f)))
    parts["drum_spin"].append(g.done("drum_seams", "steel_dark"))
    # mouths: lid recess, lip, bore and back wall; the lamp bezel; the hinge pin
    g = Geo(MD); gz = Geo(MD); gp = Geo(MD); gl = Geo(MD)
    for n in range(1, 7):
        c = mouth_centre(n); a = mouth_angle(n)
        zb = KNOT_Z - HUB[2] - 0.27                                          # the knot's collar sits on this wall
        gl.lathe([(LIP_R, W_FACE), (RECESS_R, W_FACE + LIP_H)], 16, Matrix.Translation(c))     # the dark bezel: a raised lip
        g.lathe([(RECESS_R, W_FACE + LIP_H), (RECESS_R, W_FACE - LID_T), (MOUTH_R, W_FACE - LID_T), (MOUTH_R, zb), (0.0, zb)], 16, Matrix.Translation(c))
        lc = er(a) * LAMP_R
        gz.lathe([(BEZEL_R, W_FACE), (BEZEL_R, W_FACE + 0.05), (LAMP_DISC_R, W_FACE + 0.04)], 8, Matrix.Translation(lc), phase=math.pi / 8)
        pv = mouth_pivot(n)
        gp.lathe([(0.07, W_FACE), (0.07, W_FACE + 0.16), (0.0, W_FACE + 0.16)], 6, Matrix.Translation(pv))
    parts["drum_spin"].append(gl.done("drum_lips", "steel_dark", shade=105, smooth=50))
    parts["drum_spin"].append(g.done("drum_mouths", "steel_dark", shade=80, smooth=50))
    parts["drum_spin"].append(gz.done("drum_bezels", "brass", smooth=50))
    parts["drum_spin"].append(gp.done("drum_pins", "steel", shade=110, smooth=70))
    # the hub: a low ceramic cap and its nut
    g = Geo(MD)
    g.lathe([(0.585, W_FACE - 0.03), (0.585, W_FACE + 0.035), (0.52, W_FACE + 0.07), (0.0, W_FACE + 0.07)], 16)
    parts["drum_spin"].append(g.done("drum_cap", "enamel", smooth=40))
    wg.set_mark(parts["drum_spin"][-1], FACE_MARK, DRUM_CAP)
    g = Geo(MD)
    g.lathe([(0.15, W_FACE + 0.07), (0.15, W_FACE + 0.14), (0.0, W_FACE + 0.14)], 6)
    parts["drum_spin"].append(g.done("drum_nut", "steel", smooth=30))
    # the back: "the cylinder from the right end": a plate, six chamber heads with their primers, the ratchet, the barrel
    back = Matrix.Translation((0, 0, W_BACK)) @ Matrix.Rotation(math.pi, 4, 'X')        # local z = out of the back
    g = Geo(MD)
    g.fill([[(p[0], -p[1]) for p in drum_profile(inset=CHAMFER)], circle(0.90, 12)], 0.0, back)
    parts["drum_spin"].append(g.done("drum_back", "steel", shade=100))
    wg.set_mark(parts["drum_spin"][-1], FACE_MARK, DRUM_SHELL)
    g = Geo(MD); gp = Geo(MD)
    for n in range(1, 7):
        c = mouth_centre(n); F = back @ Matrix.Translation((c.x, -c.y, 0))
        g.lathe([(0.50, 0.0), (0.50, 0.07), (0.42, 0.10), (0.0, 0.10)], 12, F)
        gp.lathe([(0.13, 0.10), (0.13, 0.135), (0.0, 0.135)], 6, F)
    parts["drum_spin"].append(g.done("drum_heads", "steel", shade=138, smooth=40))
    parts["drum_spin"].append(gp.done("drum_primers", "brass", smooth=70))
    star = []
    for k in range(12):                                                      # twelve saw teeth: it only ever turns one way
        t0 = 2 * math.pi * k / 12
        star.append((0.98 * math.cos(t0), 0.98 * math.sin(t0)))
        star.append((0.78 * math.cos(t0 + 0.06), 0.78 * math.sin(t0 + 0.06)))
    g = Geo(MD)
    g.prism(star, 0.0, 0.13, back, caps=(False, True))
    parts["drum_spin"].append(g.done("drum_ratchet", "steel", shade=118))
    g = Geo(MD)                                                              # the haul barrel on the axle: z 0.40 .. 0.90
    g.lathe([(0.60, 0.13), (0.60, 0.44), (0.72, 0.44), (0.72, 0.50), (0.0, 0.50)], 10, back)
    parts["drum_spin"].append(g.done("drum_barrel", "cable", shade=130, smooth=50))


FACE_MARK = "ks_face"
ARM_POST, DRUM_SHELL, DRUM_CAP = 6, 7, 9                     # FACE_MARK values (1 face, 2 lid, 3-5 and 8 the guard)
POST_COLLARS = (6.65, 7.45, 9.75)                            # undersides of the neck and the two splices on the king post


def paint_steel(body):
    """Rules on the bare steel. The drum's shell and back: the six lands (the ridges between the flutes) are rubbed
    one value step lighter and the flute bottoms hold grime, so the cylinder reads from behind in the bore's dark.
    The king post: rust-stain run down half a metre from the underside of each collar."""
    me = body.data
    at = me.attributes.get(FACE_MARK)
    if at is None: return
    mark = np.zeros(len(me.polygons), dtype=np.int32); at.data.foreach_get("value", mark)
    pm = mark[vcol.poly_of_loop(body)]
    a = vcol.get_colors(body); pos = vcol.corner_positions(body)
    r = np.hypot(pos[:, 0] - HUB[0], pos[:, 2] - HUB[1])
    sh = pm == DRUM_SHELL
    k = np.clip((r - 2.02) / 0.46, 0.0, 1.0)
    a[sh, :3] = np.clip(a[sh, :3] * (0.90 + 0.60 * k[sh] ** 2)[:, None], 0.0, 1.0)
    po = pm == ARM_POST
    f = np.ones(len(pos), np.float32)
    for yb in POST_COLLARS:
        t = (yb - pos[:, 2]) / 0.5
        f = np.where((t >= 0.0) & (t <= 1.0), np.minimum(f, 0.58 + 0.42 * t), f)
    a[po, :3] = a[po, :3] * (f[po][:, None] * np.array([[1.0, 0.93, 0.86]], np.float32) ** (1.0 - f[po][:, None]))
    vcol.set_colors(body, a)


def paint_face(body):
    """The face of the drum, painted by rule instead of by the vertex AO bake. The bake samples only at the panels' few
    vertices, and the hinge pins and straps made single lip vertices dark: long dark wedges across a panel (pass 3 of
    the look-and-improve log). The rule is the same on every panel and does not depend on the drum's angle (the face
    spins, so there is no height ramp on it: its gradients are radial). Polish round 2 (the face read as one flat tone
    at 6 to 12 m): the enamel is at full value on the lands (it was x 0.86 all over), a little soot at each bezel
    (x 0.86), grime in the flutes where the edge is cast deepest (x 0.78) and round the hub (x 0.74). The panels have
    vertices only on their outline, the hub arc and the lips, so a deep stain at the lip darkens the whole panel
    (tried: x 0.42 made the face darker than the steel behind it in the game); the dark ring is the bezel itself
    (12 cm of steel_dark) and the gradient is on the lid: clean in the middle, sooted at the rim (x 0.50), so a
    shut mouth is a dark ring with a pale dish in it. The hub cap is dark at its shoulder."""
    me = body.data
    at = me.attributes.get(FACE_MARK)
    if at is None: return
    mark = np.zeros(len(me.polygons), dtype=np.int32); at.data.foreach_get("value", mark)
    pm = mark[vcol.poly_of_loop(body)]
    sel = pm == 1; lid = pm == 2; cap = pm == DRUM_CAP
    a = vcol.get_colors(body); pos = vcol.corner_positions(body)          # Blender space: game (x, y, z) = (x, z, -y)
    u = pos[:, 0] - HUB[0]; v = pos[:, 2] - HUB[1]
    r = np.hypot(u, v)
    d = np.full(len(pos), 1e9)
    for n in range(1, 7):
        c = mouth_centre(n); d = np.minimum(d, np.hypot(u - c.x, v - c.y))
    stain = np.asarray(vcol.rgb("enamel_stain"), np.float32) / np.maximum(np.asarray(vcol.rgb("enamel"), np.float32), 1e-4)
    soot = (0.35 + 0.65 * stain)[None, :]
    one = np.ones((1, 3), np.float32)
    lip = (d < LIP_R + 0.01)[:, None]
    edge = np.clip((r - 1.95) / 0.5, 0.0, 1.0)[:, None]                      # 0 at the flute bottoms, 1 at the lands' rim
    hubr = (r < 0.62)[:, None]
    col = np.where(lip, 0.86 * soot, np.where(hubr, 0.74 * soot, (1.0 - 0.22 * (1.0 - edge)) * one))
    a[sel, :3] = np.clip(col[sel], 0.0, 1.0)
    # the lids: clean in the middle, soot at the rim and down the edge, so the 20 mm shadow gap reads as a drawn line
    k = (d > LID_R * 0.5)[:, None]
    a[lid, :3] = np.clip(np.where(k, 0.50 * soot, one), 0.0, 1.0)[lid]
    # the hub cap: a pale boss with a dark shoulder
    kc = np.clip((r - 0.30) / 0.285, 0.0, 1.0)[:, None]
    a[cap, :3] = np.clip(1.0 - kc * (1.0 - 0.45 * soot), 0.0, 1.0)[cap]
    vcol.set_colors(body, a)
    me.attributes.remove(me.attributes[FACE_MARK])


# ------------------------------------------------------------------ lids (mouth_n), knots (knot_n), lamps
def build_mouths(parts, lamps, cores):
    for n in range(1, 7):
        c = mouth_centre(n); a = mouth_angle(n); F = Matrix.Translation(c)
        g = Geo(MD)                                                          # the ceramic lid, flush in its recess
        g.lathe([(0.0, W_FACE - LID_T), (LID_R, W_FACE - LID_T), (LID_R, W_FACE - 0.015), (LID_R - 0.015, W_FACE), (0.0, W_FACE)], 16, F)
        parts[f"mouth_{n}"].append(g.done(f"lid_{n}", "enamel", smooth=40))
        wg.set_mark(parts[f"mouth_{n}"][-1], FACE_MARK, 2)
        g = Geo(MD)                                                          # the hinge strap from the lid to its pin
        d = mouth_pivot(n) - c; L = d.length; d.normalize()
        ang = math.atan2(d.y, d.x)
        g.box((L - 0.30, 0.15, 0.045), c + d * (0.30 + (L - 0.30) / 2) + Vector((0, 0, W_FACE + 0.0275)), R=Matrix.Rotation(ang, 4, 'Z'))
        g.lathe([(0.12, W_FACE + 0.005), (0.12, W_FACE + 0.05), (0.07, W_FACE + 0.05)], 6, Matrix.Translation(mouth_pivot(n)))
        parts[f"mouth_{n}"].append(g.done(f"lid_strap_{n}", "steel_dark", shade=125, smooth=70))
        # the knot: the hex collar rides the drum, the lobes ride knot_n, the white core is lamp 6 + (n - 1)
        kn = knot.build_knot(KNOT_R, collar='hex', seed=10 + n, lobes=6, name=f"k{n}")
        back = game((c.x, c.y, 0.0)); back = (back[0], back[1], KNOT_Z - 0.27)
        cores.append(place_knot(kn, back, a, parts, f"knot_{n}", "drum_spin"))
        lc = er(a) * LAMP_R                                                  # the lamp beside the mouth: lamp n - 1
        lamps.append([gb(game((p[0], p[1], W_FACE + 0.035))) for p in circle(LAMP_DISC_R + 0.004, 8, lc.x, lc.y, math.pi / 8)])


def place_knot(kn, back, turn_deg, parts, bone, collar_bone):
    """Stand a library knot (facing game +Z) with its collar's back at game point `back`; -> the core's lamp polygons."""
    lobes, collar = kn["lobes"], kn["collar"]
    for o in (lobes, collar):
        o.rotation_euler = (0.0, turn_deg * D2R, 0.0); o.location = gb(back)
        mesh.apply_transform(o)
        wg.shade_from_color(o)
    core_n = 20                                                              # the central lobe's faces come first
    centre = sum((lobes.data.vertices[v].co for p in lobes.data.polygons[:core_n] for v in p.vertices), Vector()) / (3 * core_n)
    polys = [[centre + (lobes.data.vertices[v].co - centre) * 1.05 for v in p.vertices] for p in lobes.data.polygons[:core_n]]
    uv.map_to_palette(lobes, "husk", faces=range(core_n))                    # under the lamp: husk, so a dark core IS dark
    vcol.tint(lobes, "husk"); vcol.tint(collar, "steel_dark")
    parts[bone].append(lobes); parts[collar_bone].append(collar)
    return polys


# ------------------------------------------------------------------ the arm (bone arm_yaw)
def build_arm(parts, lamps, cores):
    A = parts["arm_yaw"]
    def box(name, x, y, z, cell="steel", shade=100, bevel=0.02, R=None, tess=0.0):
        g = Geo(); g.span(x, y, z, R=R); A.append(g.done(name, cell, shade=shade, bevel=bevel, tess=tess)); return A[-1]
    # slew ring and king post
    g = Geo()
    g.lathe([(0.70, 12.0), (0.70, 12.3), (0.95, 12.3), (0.95, 12.5), (0.55, 12.5), (0.55, 13.0), (0.0, 13.0)], 12, frame((0, 0, 0), (0, 1, 0)))
    A.append(g.done("arm_slew", "steel", smooth=50))
    post = box("arm_post", (-0.4, 0.4), (1.6, 12.0), (-0.7, 0.3), tess=2.4)
    for yb in POST_COLLARS:                                                  # loops for the stain that runs down from each collar
        for y in (yb - 0.02, yb - 0.5): mesh.bisect(post, gb((0, y, 0)), (0, 0, 1))
    wg.set_mark(post, FACE_MARK, ARM_POST)
    for i, y in enumerate((7.6, 9.9)):
        box(f"arm_splice_{i}", (-0.46, 0.46), (y - 0.15, y + 0.15), (-0.76, 0.36), shade=112, bevel=0.0)
    box("arm_foot", (-0.5, 0.5), (1.5, 1.78), (-0.78, 0.38), shade=90, bevel=0.0)
    # jib, brace and the guard frame: top beam and two guide columns
    box("arm_jib", (-0.4, 0.4), (11.5, 12.0), (0.3, 2.8), tess=1.0)
    box("arm_top", (-1.75, 1.75), (11.5, 12.0), (2.8, 3.2))
    g = Geo()
    L = math.hypot(2.3, 2.1)
    g.box((0.4, L, 0.4), (0.0, 10.35, 1.35), R=Matrix.Rotation(math.atan2(2.1, 2.3), 4, 'X'))
    A.append(g.done("arm_brace", "steel", shade=95, bevel=0.02, tess=0.8))
    for s in (-1, 1):
        box("arm_column", (s * LINK_X - 0.12, s * LINK_X + 0.12), (7.15, 11.5), (2.9, 3.15), shade=95, bevel=0.0, tess=1.2)
        for y in (8.0,):                                                     # the guide shoe behind the link
            box("arm_shoe", (s * LINK_X - 0.17, s * LINK_X + 0.17), (y - 0.09, y + 0.09), (3.15, 3.24), cell="steel_dark", shade=120, bevel=0.0)
        box("arm_hoist", (s * LINK_X - 0.13, s * LINK_X + 0.13), (11.42, 11.74), (3.2, 3.47), cell="steel_dark", shade=135, bevel=0.0)   # the link pays out of this
    # the yoke over the drum: crosshead and neck
    web = box("arm_crosshead", (-2.9, 2.9), (6.69, 7.11), (2.3, 3.1), tess=1.5)   # the web, between its flanges (its end caps' corners in the open)
    mesh.bisect(web, gb((0, 6.9, 0)), (0, 0, 1))                             # a loop at mid height: every other vertex of the web is in a flange's corner
    for y in (6.61, 7.11):                                                   # an I-section: flanges proud of the web
        box("arm_flange", (-2.9, 2.9), (y, y + 0.08), (2.24, 3.16), shade=112, bevel=0.0, tess=1.5)
    box("arm_neck", (-0.4, 0.4), (6.65, 7.15), (0.3, 2.3))
    g = Geo()                                                                # the web's bolts: a row under the top flange
    for x in (-1.55, -1.0, -0.55, 0.55, 1.0, 1.55, 2.2, 2.7):
        q = [g.vert((x + sx * 0.05, 7.02 + sy * 0.05, 3.1)) for sx, sy in ((1, 0), (0, 1), (-1, 0), (0, -1))]
        ap = g.vert((x, 7.02, 3.135))
        for i in range(4): g.face((q[i], q[(i + 1) % 4], ap))
    A.append(g.done("arm_bolts", "steel", shade=150))
    g = Geo()                                                                # gussets: neck to post, jib to post
    for x in (-0.36, 0.30):
        g.prism([(6.65, 0.3), (5.75, 0.3), (6.65, 0.88)], x, x + 0.06, frame((0, 0, 0), (1, 0, 0), (0, 1, 0)))     # (y, z) outlines
        g.prism([(11.5, 0.3), (10.7, 0.3), (11.5, 1.0)], x, x + 0.06, frame((0, 0, 0), (1, 0, 0), (0, 1, 0)))
    A.append(g.done("arm_gussets", "steel", shade=112))
    g = Geo()                                                                # the conduit down the back of the post
    g.lathe([(0.09, 2.2), (0.09, 11.6)], 6, frame((0.22, 0, -0.79), (0, 1, 0)))
    for y in (3.4, 6.0, 8.8, 11.0): g.span((0.08, 0.36), (y, y + 0.12), (-0.9, -0.7))
    A.append(g.done("arm_conduit", "steel_dark", shade=130, smooth=70))
    # the fixed pawl over the firing mouth: plain geometry, 0.5 m, pointing down at the top land
    g = Geo()
    g.prism([(-0.19, 7.0), (-0.035, 6.5), (0.035, 6.5), (0.19, 7.0)], 3.0, 3.2)
    g.span((-0.3, 0.3), (6.93, 7.15), (3.1, 3.21))
    A.append(g.done("arm_dog", "steel", shade=128))
    # the two pawls. They stand IN FRONT of the guard's plane of travel (z 3.28 .. 3.55 seated, released or on its way; 3.63 for a leaf in guard_shatter),
    # each on a dog plate carried by an outrigger under the crosshead's end, outside the guard's 2.23 m: a knot 0.5 m
    # behind the face (where the documents' z 2.6 put it) is hidden by the seated guard from every place the player can
    # stand in the haul, which is the only time it is a target (polish round 2, docs/requests/art-boss.md 1)
    for s, bone in ((-1, "pawl_l"), (1, "pawl_r")):
        x = s * PAWL[0]; zb = PAWL_ZB
        sx = lambda a, b: (min(s * a, s * b), max(s * a, s * b))
        box("arm_pawl_beam", sx(2.30, 2.56), (6.33, 6.61), (2.90, zb + 0.10), shade=104, bevel=0.0)
        g = Geo()
        g.prism([(s * px, py) for px, py in ((2.30, 6.61), (2.30, 6.36), (2.04, 6.05), (2.04, 5.80), (1.82, 5.56), (1.38, 5.56), (1.16, 5.80), (1.16, 6.40), (1.38, 6.61))], zb - 0.06, zb)
        A.append(g.done("arm_pawl_plate", "steel", shade=84))
        kn = knot.build_knot(PAWL_KNOT_R, collar='hex', seed=30 + s, lobes=6, name=f"p{bone[-1]}")
        cores.append(place_knot(kn, (x, PAWL[1], zb), 0.0, parts, bone, "arm_yaw"))
        g = Geo()
        Fl = Matrix.Translation((x, 6.50, zb))
        g.lathe([(0.085, 0.0), (0.085, 0.045), (0.055, 0.035)], 8, Fl)
        A.append(g.done("arm_pawl_bezel", "brass", smooth=50))
        g = Geo(); g.face(g.ring(circle(0.057, 8), 0.03, Fl))
        A.append(g.done("arm_pawl_lamp", "aqua_core"))
    # the axle bearing, the foot beam, the cable fairlead
    g = Geo()
    g.lathe([(0.52, 0.3), (0.52, 0.4), (0.0, 0.4)], 12, frame((0, HUB[1], 0), (0, 0, 1)))
    A.append(g.done("arm_bearing", "steel", shade=112, smooth=50))
    box("arm_hook_beam", (-1.6, 1.6), (1.53, 1.9), (-0.45, 0.05), tess=0.8)
    box("arm_fairlead", (-0.5, 0.5), (1.54, 1.75), (0.3, 0.54), cell="steel_dark", shade=120, bevel=0.0)
    # the gauge housing, hung from the crosshead's end beside the drum: a slot of dark steel behind 26 segments
    gx0, gx1 = GAUGE_X[0] - 0.10, GAUGE_X[1] + 0.10
    top = gauge_y(25) + 0.10
    box("arm_gauge_back", (gx0, gx1), (2.3, 6.65), (2.92, 3.17), tess=1.2)
    box("arm_gauge_corbel", (2.9, gx1), (6.65, 6.95), (2.72, 3.1), shade=95, bevel=0.0)
    box("arm_gauge_rib", (3.0, 3.1), (2.6, 6.65), (2.72, 2.92), shade=90, bevel=0.0)
    g = Geo()
    g.span((gx0, gx0 + 0.07), (2.3, 6.65), (3.17, 3.22)); g.span((gx1 - 0.07, gx1), (2.3, 6.65), (3.17, 3.22))
    g.span((gx0 + 0.07, gx1 - 0.07), (2.3, GAUGE_Y0 - 0.05), (3.17, 3.22)); g.span((gx0 + 0.07, gx1 - 0.07), (top + 0.05, 6.65), (3.17, 3.22))
    for i in (9, 19):
        y = (gauge_y(i) + 0.10 + gauge_y(i + 1)) / 2
        g.span((gx0 + 0.07, gx1 - 0.07), (y - 0.04, y + 0.04), (3.17, 3.22))
    A.append(g.done("arm_gauge_frame", "steel", shade=118, weld=True, tess=1.2))
    mesh.delete_faces(A[-1], lambda f, c, n: n.y > 0.9 and abs(c.y + 3.17) < 2e-3)     # the frame's back, against the housing
    g = Geo()                                                                # the slot: a column of vertices down its middle, in the open
    F = frame((0, 0, 0), (0, 0, 1)); xm = (gx0 + gx1) / 2; ys = [2.3 + (6.65 - 2.3) * i / 8 for i in range(9)]
    cols = [[g.vert((x, y, 3.174), F) for y in ys] for x in (gx0 + 0.07, xm, gx1 - 0.07)]
    for c in range(2):
        for i in range(8): g.face((cols[c][i], cols[c + 1][i], cols[c + 1][i + 1], cols[c][i + 1]))
    A.append(g.done("arm_gauge_slot", "steel_dark", shade=70))
    # the brand: an enamel tag with the mark, the cast plate, the livery stripe
    box("arm_tag", (-2.13, -1.77), (6.69, 7.12), (3.1, 3.112), cell="enamel", bevel=0.0)
    mk = brand.pellam_mark(0.10, relief=0.0, segments=6, name="arm_mark", colour="steel_dark")
    mk.location = gb((-1.95, 6.985, 3.114)); mesh.apply_transform(mk); wg.set_shade(mk, 100); A.append(mk)
    pl = brand.maker_plate(None, name="arm_plate", decals=False)["plate"]
    pl.location = gb((-2.5, 6.9, 3.1)); mesh.apply_transform(pl); wg.set_shade(pl, 125); A.append(pl)
    lv = brand.livery_band([(0.45, -3.1), (2.86, -3.1)], z=6.8, height=0.10, name="arm_livery")
    wg.set_shade(lv, 100); A.append(lv)


def gauge_y(i):
    """Bottom edge of gauge segment i: 0.10 m segments on a 0.15 m pitch, 0.10 m more after the tenth and the twentieth."""
    return GAUGE_Y0 + 0.15 * i + 0.10 * ((i > 9) + (i > 19))


# ------------------------------------------------------------------ the guard (bones guard, guard_piece_1..5)
GUARD_BAND = 0.13                                            # the raised steel rim band
LEAF_TURN = (0.0, 72.0, 144.0, -144.0, -72.0)                # the fan: each leaf turns this far about the boss to lie on leaf 1
LEAF_BACK = (0.0, 0.015, 0.045, 0.06, 0.03)                  # ... and sits this far behind it
LUG_A = 34.0                                                 # the two hoist clamps on the rim, either side of the top
GUARD_FRONT, GUARD_HAZARD, GUARD_STREAK, GUARD_BACK = 3, 4, 5, 8   # FACE_MARK values (1 = drum face, 2 = lid)


def build_guard(parts):
    """A five-leaf ceramic fan. Seated or parked it is one disc (the leaves meet on scored cuts); released, the leaves
    turn about the centre boss onto leaf 1 and the pack is run up clear of the face on its two hoist links
    (guard_drop). Each leaf: enamel front with the hazard diagonal, a raised dark rim band with two fasteners, old
    discharge stain run down from them; leaf 1 carries the boss and the station numeral."""
    MG = Matrix.Translation((0.0, GUARD_PARK_Y, GUARD_Z))                    # plate frame: u right, v up, w toward +Z
    R = GUARD_R; hf = GUARD_T / 2; inset = 0.02; groove = 0.03
    cross = math.degrees(math.asin(0.15 / R))
    alphas = sorted(set([9.0 * k for k in range(40)] + [round(x % 360.0, 6) for x in (45 - cross, 45 + cross, 225 - cross, 225 + cross)]))
    def fan(g, poly, h):
        """A convex polygon as a triangle fan from its vertex nearest the boss (vertex colours then run boss -> rim)."""
        vs = g.ring(poly, h); i0 = min(range(len(poly)), key=lambda i: math.hypot(*poly[i]))
        for j in range(1, len(vs) - 1): g.face((vs[i0], vs[(i0 + j) % len(vs)], vs[(i0 + j + 1) % len(vs)]))
    for k in range(5):
        a0 = 72.0 * k - 36.0; a1 = 72.0 * k + 36.0
        arc = [a for a in alphas if a0 - 1e-6 <= a <= a1 + 1e-6] + [a for a in alphas if a0 - 1e-6 <= a - 360.0 <= a1 + 1e-6]
        arc = sorted(set(arc), key=lambda a: (a - a0) % 360.0)
        sector = [(0.0, 0.0)] + [tuple((er(a) * R)[:2]) for a in reversed(arc)]         # counter-clockwise
        n0 = et(a0); n1 = -et(a1)                                            # into the sector, from its two cuts
        body = wg.clip_poly(wg.clip_poly(sector, n0.x, n0.y, -inset), n1.x, n1.y, -inset)
        s2 = math.sqrt(0.5)
        regions = [("enamel", wg.clip_poly(body, -s2, s2, -0.15)), ("hazard", wg.clip_poly(wg.clip_poly(body, s2, -s2, 0.15), -s2, s2, 0.15)),
                   ("enamel", wg.clip_poly(body, s2, -s2, -0.15))]
        geo = {"enamel": Geo(MG), "hazard": Geo(MG)}
        front = []
        for cell, poly in regions:
            if len(poly) < 3 or abs(wg.poly_area(poly)) < 1e-6: continue
            if wg.poly_area(poly) < 0: poly = list(reversed(poly))
            fan(geo[cell], poly, hf); front += poly
        bone = f"guard_piece_{k + 1}"
        for cell in ("enamel", "hazard"):
            if len(geo[cell].bm.faces):
                parts[bone].append(geo[cell].done(f"guard_{k + 1}_{cell}", cell))
                wg.set_mark(parts[bone][-1], FACE_MARK, GUARD_FRONT if cell == "enamel" else GUARD_HAZARD)
            else: geo[cell].bm.free()
        # the score lines (a V groove on each cut), the cut faces, the rim and the back
        gd = Geo(MG); gs = Geo(MG); gk = Geo(MG)
        for (ab, nrm) in ((a0, n0), (a1, n1)):
            d = er(ab)
            on = sorted({round(p[0] * d.x + p[1] * d.y, 5) for p in front if abs(p[0] * nrm.x + p[1] * nrm.y - inset) < 1e-5})
            top = [gd.vert((d.x * r + nrm.x * inset, d.y * r + nrm.y * inset, hf)) for r in on]
            bot = [gd.vert((d.x * r, d.y * r, hf - groove)) for r in on]
            for i in range(len(on) - 1): orient(gd, gd.face((top[i], top[i + 1], bot[i + 1], bot[i])), (-nrm.x, -nrm.y, 0.6))
            e = (d.x * R, d.y * R)
            orient(gd, gd.face((gd.vert((0, 0, hf - groove)), gd.vert((e[0], e[1], hf - groove)), gd.vert((e[0], e[1], -hf)), gd.vert((0, 0, -hf)))), (-nrm.x, -nrm.y, 0.0))
        rim = sorted({(round(p[0], 6), round(p[1], 6)) for p in front if math.hypot(*p) > R - 0.012}, key=lambda p: (math.degrees(math.atan2(p[0], p[1])) - a0) % 360.0)
        c0 = tuple((er(a0) * R)[:2]); c1 = tuple((er(a1) * R)[:2])
        up = [gs.vert((c0[0], c0[1], hf - groove))] + [gs.vert((p[0], p[1], hf)) for p in rim] + [gs.vert((c1[0], c1[1], hf - groove))]
        dn = [gs.vert((c0[0], c0[1], -hf))] + [gs.vert((p[0], p[1], -hf)) for p in rim] + [gs.vert((c1[0], c1[1], -hf))]
        for i in range(len(up) - 1): orient(gs, gs.face((up[i], up[i + 1], dn[i + 1], dn[i])), tuple(er(72.0 * k)))
        bk = [(0.0, 0.0)] + [c0] + rim + [c1]                                # the back: a fan from the boss, flat
        vs = [gk.vert((p[0], p[1], -hf)) for p in bk]
        for j in range(1, len(vs) - 1): orient(gk, gk.face((vs[0], vs[j], vs[j + 1])), (0, 0, -1))
        parts[bone].append(gd.done(f"guard_{k + 1}_cut", "steel_dark", shade=120))
        parts[bone].append(gs.done(f"guard_{k + 1}_rim", "enamel_stain", smooth=50))
        parts[bone].append(gk.done(f"guard_{k + 1}_back", "enamel_stain", shade=82))
        wg.set_mark(parts[bone][-1], FACE_MARK, GUARD_BACK)
        # the rim band: a raised dark steel hoop, in four chords a leaf, and its two fasteners
        g = Geo(MG); hb = hf + 0.012
        angs = [a0 + 0.9 + (72.0 - 1.8) * i / 4 for i in range(5)]
        o = [g.vert(((er(a) * R).x, (er(a) * R).y, hb)) for a in angs]
        i_t = [g.vert(((er(a) * (R - GUARD_BAND)).x, (er(a) * (R - GUARD_BAND)).y, hb)) for a in angs]
        i_b = [g.vert(((er(a) * (R - GUARD_BAND)).x, (er(a) * (R - GUARD_BAND)).y, hf)) for a in angs]
        for i in range(4):
            orient(g, g.face((o[i], o[i + 1], i_t[i + 1], i_t[i])), (0, 0, 1))
            m = er((angs[i] + angs[i + 1]) / 2)
            orient(g, g.face((i_t[i], i_t[i + 1], i_b[i + 1], i_b[i])), (-m.x, -m.y, 0.3))
        parts[bone].append(g.done(f"guard_{k + 1}_band", "steel_dark", shade=135))
        g = Geo(MG); gt = Geo(MG)
        for b in (72.0 * k - 18.0, 72.0 * k + 18.0):
            c = er(b) * (R - GUARD_BAND / 2); t = et(b); r_ = er(b)
            q = [g.vert((c.x + (r_.x * sx + t.x * sy) * 0.042, c.y + (r_.y * sx + t.y * sy) * 0.042, hb)) for sx, sy in ((1, 0), (0, 1), (-1, 0), (0, -1))]
            ap = g.vert((c.x, c.y, hb + 0.03))
            for i in range(4):
                mid = ((q[i].co + q[(i + 1) % 4].co) / 2); f = g.face((q[i], q[(i + 1) % 4], ap))
                f.normal_update()
                if f.normal.dot(G2B_N) < 0: f.normal_flip()
            # the stain that has run down from the fastener, where the plate lies below it
            p0 = er(b) * (R - GUARD_BAND)
            if math.hypot(p0.x, p0.y - 0.46) < R - GUARD_BAND - 0.03 and abs(((math.degrees(math.atan2(p0.x, p0.y - 0.46)) - 72.0 * k + 180.0) % 360.0) - 180.0) < 34.0:
                orient(gt, gt.face((gt.vert((p0.x - 0.04, p0.y + 0.01, hf + 0.004)), gt.vert((p0.x + 0.04, p0.y + 0.01, hf + 0.004)), gt.vert((p0.x, p0.y - 0.46, hf + 0.004)))), (0, 0, 1))
        parts[bone].append(g.done(f"guard_{k + 1}_studs", "steel", shade=150))
        if k in (2, 3):                                                       # and from the boss, down the two lower leaves
            sx = 1 if k == 2 else -1
            orient(gt, gt.face((gt.vert((sx * 0.05, -0.24, hf + 0.004)), gt.vert((sx * 0.17, -0.20, hf + 0.004)), gt.vert((sx * 0.10, -1.05, hf + 0.004)))), (0, 0, 1))
        if len(gt.bm.faces):
            parts[bone].append(gt.done(f"guard_{k + 1}_streak", "enamel"))
            wg.set_mark(parts[bone][-1], FACE_MARK, GUARD_STREAK)
        else: gt.bm.free()
    # leaf 1: the station numeral, 0.4 m of geometry (it stays upright when the fan is shut), and the boss the leaves turn on
    num = brand.numeral_mesh("4", 0.4, depth=0.012, name="guard_numeral", colour="steel_dark")
    num.location = gb((0.0, GUARD_PARK_Y + 1.02, GUARD_Z + hf)); mesh.apply_transform(num); wg.set_shade(num, 100)
    parts["guard_piece_1"].append(num)
    g = Geo(MG)
    g.lathe([(0.27, hf), (0.27, hf + 0.035), (0.21, hf + 0.06), (0.0, hf + 0.06)], 8, phase=math.pi / 8)
    parts["guard_piece_1"].append(g.done("guard_boss", "steel_dark", shade=140, smooth=40))
    g = Geo(MG)
    g.lathe([(0.10, hf + 0.06), (0.10, hf + 0.10), (0.0, hf + 0.10)], 6)
    parts["guard_piece_1"].append(g.done("guard_boss_nut", "steel", shade=130, smooth=30))
    # the two hoist clamps on the rim (bone guard: they and the links stay when the plate shatters)
    g = Geo(MG)
    for s in (-1, 1):
        p = er(s * LUG_A) * R
        g.span((p.x - 0.10, p.x + 0.10), (p.y - 0.14, p.y + 0.10), (-0.085, 0.085))
    parts["guard"].append(g.done("guard_clamps", "steel", shade=112))


G2B_N = Vector((0.0, -1.0, 0.0))                             # game +Z (out of the plate's front) in Blender space


def build_links():
    """The two hoist links: square bars from the hoist boxes on the top beam down to the clamps. Their top ends ride
    arm_yaw and their bottom ends ride guard, so they pay out as the plate comes down and are never off their pins."""
    out = []
    for s in (-1, 1):
        p = er(s * LUG_A) * GUARD_R
        g = Geo()
        y0 = GUARD_PARK_Y + p.y + 0.06; y1 = HOIST_Y
        a = g.ring([(p.x - 0.035, -GUARD_Z - 0.035), (p.x + 0.035, -GUARD_Z - 0.035), (p.x + 0.035, -GUARD_Z + 0.035), (p.x - 0.035, -GUARD_Z + 0.035)], y0, frame((0, 0, 0), (0, 1, 0)))
        b = g.ring([(p.x - 0.035, -GUARD_Z - 0.035), (p.x + 0.035, -GUARD_Z - 0.035), (p.x + 0.035, -GUARD_Z + 0.035), (p.x - 0.035, -GUARD_Z + 0.035)], y1, frame((0, 0, 0), (0, 1, 0)))
        g.strip(a, b)
        ob = g.done("guard_link", "cable", shade=150)
        for v in ob.data.vertices:
            bn = "arm_yaw" if v.co.z > (y0 + y1) / 2 else "guard"          # Blender z = game y
            (ob.vertex_groups.get(bn) or ob.vertex_groups.new(name=bn)).add([v.index], 1.0, 'REPLACE')
        out.append(ob)
    return out


def paint_guard(body):
    """The guard's front by rule (as paint_face: a vertex AO bake has only the rim and the boss to sample at): clean
    enamel at the boss, old discharge stain drawn in from the rim and deepening toward the lower edge where it runs
    off; the streaks under the fasteners are stain at their head and the plate's own colour at their tip."""
    me = body.data
    at = me.attributes.get(FACE_MARK)
    if at is None: return
    mark = np.zeros(len(me.polygons), dtype=np.int32); at.data.foreach_get("value", mark)
    pm = mark[vcol.poly_of_loop(body)]
    a = vcol.get_colors(body); pos = vcol.corner_positions(body)
    u = pos[:, 0]; v = pos[:, 2] - GUARD_PARK_Y; r = np.hypot(u, v)
    stain = np.asarray(vcol.rgb("enamel_stain"), np.float32) / np.maximum(np.asarray(vcol.rgb("enamel"), np.float32), 1e-4)
    k = np.clip(0.75 * np.clip((0.5 - v) / 2.7, 0.0, 1.0) ** 1.3 + 0.55 * np.clip((r - 0.9) / (GUARD_R - 0.9), 0.0, 1.0) ** 2, 0.0, 1.0)[:, None]
    deep = 0.62 * stain[None, :]                                             # stain on stain: where it has run for years
    plate = 0.97 * (1.0 - k + k * deep)
    front = pm == GUARD_FRONT
    a[front, :3] = plate[front]
    hz = pm == GUARD_HAZARD
    a[hz, :3] = (0.97 * (1.0 - 0.45 * k) * np.ones((1, 3), np.float32))[hz]
    bk = pm == GUARD_BACK                                                    # the back: flat unglazed biscuit, grimed toward the rim
    a[bk, :3] = (0.72 * (1.0 - 0.30 * np.clip(r / GUARD_R, 0.0, 1.0) ** 2)[:, None] * np.ones((1, 3), np.float32))[bk]
    for pl in me.polygons:
        if mark[pl.index] != GUARD_STREAK: continue
        li = list(pl.loop_indices); tip = min(li, key=lambda i: pos[i, 2])
        for i in li: a[i, :3] = plate[i] if i == tip else plate[i] * 0.66 * stain
    vcol.set_colors(body, a)


def orient(g, face, want_local):
    """Make `face` look toward `want_local` (a direction in the Geo's local frame)."""
    if face is None: return
    face.normal_update()
    w = (g.M.to_3x3() @ Vector(want_local)).normalized()
    if face.normal.dot(w) < 0: face.normal_flip()


# ------------------------------------------------------------------ cables (cable_a/b/c, ends on arm_yaw)
CABLE_RINGS = (CABLE_TOP, 2.9, 1.4, -0.4, -2.4, -4.4, CABLE_BOTTOM)


def build_cables():
    out = []
    for i, name in enumerate(("cable_a", "cable_b", "cable_c")):
        g = Geo()
        rings = [g.ring(circle(0.075, 4, CABLE_X[i], -CABLE_Z), y, frame((0, 0, 0), (0, 1, 0))) for y in reversed(CABLE_RINGS)]
        for j in range(len(rings) - 1): g.strip(rings[j], rings[j + 1])
        ob = g.done(name + "_geo", "cable", shade=135, smooth=100)
        for v in ob.data.vertices:
            y = v.co.z                                                       # Blender z = game y
            b = "arm_yaw" if (y > CABLE_RINGS[2] + 0.01 or y < CABLE_RINGS[4] - 0.01) else name     # the bone holds the middle: a belly, pinned above and below
            (ob.vertex_groups.get(b) or ob.vertex_groups.new(name=b)).add([v.index], 1.0, 'REPLACE')
        out.append(ob)
    return out


# ------------------------------------------------------------------ skeleton, sockets, lamp sets
def build_rig():
    up = lambda h, L=0.3: (gb(h), gb(h) + Vector((0, 0, L)))
    Z = (0, -1, 0)                                                           # every bone's local Z = game +Z
    bones = [("root",) + up((0, 12.5, 0), 0.5) + (None, Z), ("arm_yaw",) + up((0, 12.5, 0), 0.4) + ("root", Z),
             ("drum_spin",) + up(HUB) + ("arm_yaw", Z)]
    for n in range(1, 7):
        a = mouth_angle(n); pv = mouth_pivot(n); c = mouth_centre(n)
        h = gb(game((pv.x, pv.y, W_FACE)))
        bones.append((f"mouth_{n}", h, h + Vector((math.sin(a * D2R), 0, math.cos(a * D2R))) * 0.3, "drum_spin", Z))
        bones.append((f"knot_{n}",) + up((c.x, HUB[1] + c.y, KNOT_Z - 0.27 + KNOT_R * 0.275), 0.15) + ("drum_spin", Z))
    bones.append(("guard",) + up((0, GUARD_PARK_Y, GUARD_Z)) + ("arm_yaw", Z))
    for k in range(5):
        c = er(72.0 * k) * 1.3
        bones.append((f"guard_piece_{k + 1}",) + up((c.x, GUARD_PARK_Y + c.y, GUARD_Z), 0.2) + ("guard", Z))
    for s, name in ((-1, "pawl_l"), (1, "pawl_r")):
        bones.append((name,) + up((s * PAWL[0], PAWL[1], PAWL_ZB + PAWL_KNOT_R * 0.275), 0.15) + ("arm_yaw", Z))
    for i, name in enumerate(("cable_a", "cable_b", "cable_c")):
        bones.append((name,) + up((CABLE_X[i], CABLE_RINGS[1], CABLE_Z)) + ("arm_yaw", Z))
    return wg.make_rig(ASSET + "_rig", bones)


def build_sockets(arm):
    def sock(name, p, bone):
        rig.parent_to_bone(export.marker(name, gb(p)), arm, bone)
    for n in range(1, 7):
        c = mouth_centre(n)
        sock(f"knot_{n}_hit", (c.x, HUB[1] + c.y, KNOT_Z), "drum_spin")
        sock(f"thread_anchor_{n}", (c.x, HUB[1] + c.y, HUB[2] + W_FACE), "drum_spin")
    sock("pawl_l_hit", (-PAWL[0], PAWL[1], PAWL[2]), "arm_yaw")
    sock("pawl_r_hit", (PAWL[0], PAWL[1], PAWL[2]), "arm_yaw")
    sock("muzzle_top", MUZZLE_TOP, "arm_yaw")
    sock("canister_muzzle", CANISTER_MUZZLE, "arm_yaw")


def build_lamps(arm, lamps, cores):
    """boss_lamps: 0-5 the lamps beside mouths 1-6 (drum_spin), 6-11 the knot cores (knot_n), 12-13 the pawl cores."""
    all_l = lamps + cores
    bones = ["drum_spin"] * 6 + [f"knot_{n}" for n in range(1, 7)] + ["pawl_l", "pawl_r"]
    ob = zone.lamp_set("boss_lamps", all_l, colour=["aqua_core"] * 6 + ["violet_core"] * 8)
    owner = []
    for i, lamp in enumerate(all_l):
        polys = lamp if isinstance(lamp[0], (list, tuple)) else [lamp]
        owner += [i] * sum(len(p) for p in polys)
    core_faces = [p.index for p in ob.data.polygons if owner[p.vertices[0]] >= 6]
    vcol.emis_attr(ob, 1.0, 0.0, 1.0, faces=core_faces)                      # violet cores die with the seventh
    rig.skin_rigid(ob, arm, lambda v: bones[owner[v.index]])
    quads = []
    for i in range(26):
        y = gauge_y(i)
        quads.append([gb((GAUGE_X[0], y, GAUGE_Z)), gb((GAUGE_X[1], y, GAUGE_Z)), gb((GAUGE_X[1], y + 0.10, GAUGE_Z)), gb((GAUGE_X[0], y + 0.10, GAUGE_Z))])
    gauge = zone.lamp_set("gauge", quads, colour="aqua_core")
    rig.skin_rigid(gauge, arm, lambda v: "arm_yaw")
    return ob, gauge


# ------------------------------------------------------------------ clips
def clips(arm):
    R = math.radians
    acts = []
    def clip(name, keys, interp='LINEAR'):
        act = anim.new_action(arm, name)
        for f, pose in keys: anim.key_pose(arm, f, pose)
        anim.set_interpolation(act, interp); anim.fix_quaternion_flips(act)
        anim.reset_pose(arm); acts.append(act)
        return act
    N = lambda c: anim.frames(ASSET, c)
    # idle_sway (loop, P1): the head swings half a degree on its slew ring, with a quarter-degree of roll at twice the rate
    n = N("idle_sway")
    clip("idle_sway", [(f, {"root": {"rot": (R(0.5) * math.sin(2 * math.pi * f / n), 0.0, R(0.22) * math.sin(4 * math.pi * f / n))}}) for f in range(0, n + 1, 6)], 'BEZIER')
    # present: a short draw back, the drum put 0.3 m toward the door with a dip, a hard stop, a count held, back on its marks
    out = -math.degrees(math.asin(0.3 / 8.5))
    def cab(a, b, c): return {"cable_a": {"rot": (R(a), 0, 0)}, "cable_b": {"rot": (R(b), 0, 0)}, "cable_c": {"rot": (R(c), 0, 0)}}
    def rootp(deg, dip=0.0): return {"root": {"rot": (R(deg), 0, 0), "loc": (0, dip, 0)}}
    clip("present", [
        (0, {**rootp(0), **cab(0, 0, 0)}), (3, {**rootp(0.35), **cab(-0.2, -0.3, -0.2)}),
        (10, {**rootp(out - 0.3, -0.07), **cab(1.6, 1.9, 1.5)}), (12, {**rootp(out, -0.06), **cab(0.9, 0.6, 1.0)}),
        (14, {**rootp(out, -0.06), **cab(-0.4, -0.5, -0.3)}), (17, {**rootp(out, -0.06), **cab(0.15, 0.1, 0.15)}),
        (21, {**rootp(out, -0.06), **cab(0, 0, 0)}), (27, {**rootp(0.18, 0.0), **cab(-1.0, -1.2, -0.9)}),
        (29, {**rootp(0, 0), **cab(0.3, 0.4, 0.3)}), (30, {**rootp(0, 0), **cab(0, 0, 0)})])
    # mouth_open (authored on mouth_1): the lid lifts out of its recess in one frame, swings 110 degrees about its pin, 3
    # degrees past and back onto the stop. mouth_close: the reverse, a 4 degree bounce off the seat, then home
    S = LID_SWING
    def lid(deg, out): return {"mouth_1": {"rot": (0, 0, R(deg)), "loc": (0, 0, out)}}
    clip("mouth_open", [(0, lid(0, 0)), (1, lid(0, LID_POP)), (2, lid(38, LID_POP)), (3, lid(84, LID_POP)), (4, lid(S + 3, LID_POP)), (5, lid(S - 1, LID_POP)), (6, lid(S, LID_POP))])
    clip("mouth_close", [(0, lid(S, LID_POP)), (1, lid(64, LID_POP)), (2, lid(18, LID_POP)), (3, lid(0, LID_POP)), (4, lid(4, LID_POP)), (5, lid(0, LID_POP * 0.4)), (6, lid(0, 0))])
    # the guard. Rest = parked above the drum. Seated = 5.45 m lower. Released = the fan shut and run 2.85 m up on its links
    seat = GUARD_SEAT_Y - GUARD_PARK_Y
    def gd(y, z=0.0, lean=0.0): return {"guard": {"loc": (0, y, z), "rot": (R(lean), 0, 0)}}
    # guard_slide_on: unlatched with a 5 cm lift, a held beat, then down in one run to 2 cm short, and seated with a knock
    clip("guard_slide_on", [(0, gd(0)), (3, gd(0.05)), (6, gd(0.05)), (10, gd(-0.35)), (16, gd(-1.55)), (22, gd(-3.25)), (27, gd(seat + 0.02, 0.02)),
                            (29, gd(seat + 0.02, 0.02)), (31, gd(seat, 0.0)), (33, gd(seat + 0.006, 0.004)), (36, gd(seat))])
    # guard_drop / guard_raise. The plate is a fan of five leaves on a centre boss, hung from the top beam on two links.
    # Released (the pawls burst): it drops 6 cm onto its links and stands 8 cm off the seat, the four free leaves swing
    # round the boss and slap shut on leaf 1 (5 degrees past, and back), and the hoist runs the pack 2.85 m up, clear of
    # the top mouth and its lamp, to a hard stop. Nothing leaves the plane of the face: no kerb, no floor, r < 4.2 m.
    # (A rigid leaf 2.1 m wide cannot go BELOW the drum: see docs/requests/art-boss-windlass.md section 2.)
    def fan(y, z, fold, pop):
        pose = gd(seat + y, z)
        for i in range(5):
            c = er(72.0 * i) * 1.3; b = R(LEAF_TURN[i] * fold)
            pose[f"guard_piece_{i + 1}"] = {"loc": (c.x * math.cos(b) - c.y * math.sin(b) - c.x, c.x * math.sin(b) + c.y * math.cos(b) - c.y, -LEAF_BACK[i] * pop),
                                            "rot": (0, 0, b), "scale": (1, 1, 1)}
        return pose
    P = GUARD_POP; U = GUARD_UP
    clip("guard_drop", [(0, fan(0, 0, 0, 0)), (1, fan(-0.06, P, 0, 1)), (2, fan(-0.05, P, 0.12, 1)), (3, fan(-0.05, P, 0.46, 1)), (4, fan(-0.05, P, 0.86, 1)),
                        (5, fan(-0.05, P, 1.035, 1)), (6, fan(-0.03, P, 0.99, 1)), (7, fan(0.22, P, 1, 1)), (8, fan(0.72, P, 1, 1)), (9, fan(1.34, P, 1, 1)),
                        (10, fan(1.96, P, 1, 1)), (11, fan(2.50, P, 1, 1)), (12, fan(U + 0.05, P, 1, 1)), (13, fan(U - 0.025, P, 1, 1)), (14, fan(U + 0.01, P, 1, 1)),
                        (15, fan(U, P, 1, 1)), (18, fan(U, P, 1, 1))])
    # guard_raise (the name is the documents': the guard is put back over the face). Unlatched with a 3 cm lift, run down
    # to a hard stop, the leaves thrown open and caught on their cuts, and the plate knocked home onto the seat
    clip("guard_raise", [(0, fan(U, P, 1, 1)), (1, fan(U + 0.03, P, 1, 1)), (2, fan(2.45, P, 1, 1)), (3, fan(1.85, P, 1, 1)), (4, fan(1.15, P, 1, 1)),
                         (5, fan(0.5, P, 1, 1)), (6, fan(0.0, P, 1, 1)), (7, fan(0.04, P, 0.98, 1)), (8, fan(0.02, P, 0.80, 1)), (9, fan(0.02, P, 0.46, 1)),
                         (10, fan(0.02, P, 0.14, 1)), (11, fan(0.02, P, -0.012, 1)), (12, fan(0.02, P, 0.006, 1)), (13, fan(0.02, P, 0, 1)), (14, fan(0.02, P * 0.8, 0, 0.6)),
                         (15, fan(0.02, 0.02, 0, 0)), (16, fan(0, 0, 0, 0)), (17, fan(0.006, 0.004, 0, 0)), (18, fan(0, 0, 0, 0))])
    # guard_shatter: from the seated plate. A crack (the leaves jump apart along their own radii and off the seat), then
    # each falls turning in its own plane. A leaf is 2.2 m long and the kerb is 1.2 m under the plate's lower edge, so
    # each leaf breaks down (scales away about its bone) as it comes to the kerb line: no vertex ever goes below 1.3 m or
    # past r 4.7 m; render's shards and dust carry the fall on into the bore
    n = N("guard_shatter")
    keys = {}
    for k in range(5):
        d = er(72.0 * k); spin = (1.0, -0.8, 1.3, -1.1, 0.7)[k]; lag = (0, 2, 1, 3, 1)[k]
        for f in range(0, n + 1):
            pose = keys.setdefault(f, {"guard": {"loc": (0, seat, 0), "rot": (0, 0, 0)}})
            if f <= 2: off = 0.05 * f; fall = 0.0; tw = 0.0; out = 0.04 * f
            else:
                t = max(0.0, (f - 2 - lag) / 30.0)
                off = 0.10 + 0.30 * min(t, 0.4); fall = 0.5 * 9.81 * 1.5 * t * t; tw = 100.0 * t * spin; out = 0.08 + 0.5 * min(t, 0.4)
            fall = min(fall, GUARD_SEAT_Y + d.y * (1.3 + off) - 1.36)        # gone at the kerb line: the bone stops there
            by = GUARD_SEAT_Y + d.y * (1.3 + off) - fall                     # the bone's height: no vertex is more than 1.40 m from it
            sc = 0.0 if f == n else min(1.0, max(0.0, (by - 1.35) / 1.45))
            pose[f"guard_piece_{k + 1}"] = {"loc": (d.x * off, d.y * off - fall, out), "rot": (R(tw * 0.08), R(tw * 0.10 * spin), R(tw)), "scale": (sc, sc, sc)}
    clip("guard_shatter", sorted(keys.items()))
    # sag_death: the drum has already run down in code. A hang, then the head swings 6 degrees in over the bore onto its own weight and drops
    # 0.4 m on its ring as it goes; cable_c lets go: half a metre of it runs out, its belly swings wide, comes back against cable_b, and again,
    # smaller each time (the cable is pinned above and below: the bone carries its middle, so slack is a belly, not a splay); one long half-swing back, and it stays
    def sag(drop, deg, a=0.0, b=0.0, c=0.0, bx=0.0, by=0.0, bz=0.0):
        return {"root": {"loc": (0, drop, 0), "rot": (R(deg), 0, 0)},
                "cable_a": {"rot": (R(a - deg), 0, 0)}, "cable_b": {"rot": (R(b - deg), 0, 0)},
                "cable_c": {"rot": (R(c - deg), 0, 0), "loc": (bx, by, bz), "scale": (1, 1, 1)}}
    clip("sag_death", [
        (0, sag(0, 0)), (6, sag(0.015, -0.25)), (10, sag(0.015, -0.25)),
        (14, sag(-0.05, 1.7, 0.6, 0.9, 0.6)), (19, sag(-0.30, 4.3, 2.0, 2.6, 2.0, 0.10, -0.18, -0.03)), (22, sag(-0.42, 5.7, 1.0, 1.4, 1.5, 0.30, -0.40, -0.12)),
        (27, sag(-0.385, 7.3, -1.2, -1.0, 0.5, 0.46, -0.52, -0.22)), (34, sag(-0.40, 6.6, -0.6, -0.8, 0.0, -0.15, -0.50, -0.10)),
        (44, sag(-0.40, 5.3, 0.5, 0.6, 0.0, 0.40, -0.52, -0.26)), (55, sag(-0.40, 6.3, 0.2, 0.2, 0.0, -0.04, -0.50, -0.16)),
        (66, sag(-0.40, 5.9, 0.0, 0.0, 0.0, 0.32, -0.52, -0.24)), (78, sag(-0.40, 6.02, 0.0, 0.0, 0.0, 0.17, -0.51, -0.20)), (90, sag(-0.40, 6.0, 0, 0, 0, 0.23, -0.52, -0.22))], 'BEZIER')
    anim.push_to_nla(arm, acts)


# ------------------------------------------------------------------ assembly
def build(args):
    bone_names = (["arm_yaw", "drum_spin", "guard", "pawl_l", "pawl_r"] + [f"mouth_{n}" for n in range(1, 7)]
                  + [f"knot_{n}" for n in range(1, 7)] + [f"guard_piece_{k}" for k in range(1, 6)])
    parts = {b: [] for b in bone_names}
    lamps = []; cores = []
    build_drum(parts)
    build_mouths(parts, lamps, cores)
    build_arm(parts, lamps, cores)
    build_guard(parts)
    cables = build_cables() + build_links()
    arm = build_rig()
    for b, obs in parts.items():
        for o in obs: wg.bone_tag(o, b)
    moving = [o for b, obs in parts.items() if b.startswith("mouth_") or b.startswith("guard") for o in obs]
    fixed = [o for b, obs in parts.items() if not (b.startswith("mouth_") or b.startswith("guard")) for o in obs] + cables
    report = {b: sum(mesh.tri_count(o, False) for o in obs) for b, obs in parts.items()}
    report["cables"] = sum(mesh.tri_count(o, False) for o in cables)
    if os.environ.get("WINDLASS_DEBUG"):
        rows = {}
        for o in fixed + moving:
            me = o.data; n = len(me.loops)
            li = np.empty(n, dtype=np.int32); me.loops.foreach_get("vertex_index", li)
            nr = np.empty(n * 3, dtype=np.float32); me.corner_normals.foreach_get("vector", nr); nr = np.round(nr.reshape(-1, 3), 3)
            k = len({(int(a), *map(float, b)) for a, b in zip(li, nr)})
            key = o.name.split(".")[0].rstrip("0123456789_")
            r = rows.setdefault(key, [0, 0]); r[0] += mesh.tri_count(o, False); r[1] += k
        for key, r in sorted(rows.items(), key=lambda kv: -kv[1][1]): print(f"PART {key:22s} tris {r[0]:5d} verts {r[1]:5d}")
    body = mesh.join(fixed, "body_fixed"); lids = mesh.join(moving, "body_moving")
    # AO in two passes: the drum, arm and knots with the lids and the parked guard out of the way (an open mouth must not
    # be black), then the lids and the guard with everything in place
    lids.hide_render = True
    vcol.bake_ao_vertex([body], distance=0.9)
    if os.environ.get("WINDLASS_DEBUG"):
        bf = vcol.buried_faces(body, vcol.get_colors(body, "AO")[:, :3], distance=0.9)
        print("BURIED", bf)
        try:
            for i in bf[0][:20]:
                pl = body.data.polygons[int(i)]; c = pl.center; print("BURIED face", int(i), "game (%.2f, %.2f, %.2f)" % (c.x, c.z, -c.y), "area %.3f" % pl.area, "n (%.1f, %.1f, %.1f)" % (pl.normal.x, pl.normal.z, -pl.normal.y))
        except Exception as e: print("BURIED err", e)
    lids.hide_render = False
    vcol.bake_ao_vertex([lids], distance=0.9)
    body = mesh.join([body, lids], "body_mesh")
    vcol.compose_vertex_color(body, mode='ratio', ao_strength=0.85, gradient=(0.80, 1.06), jitter=0.0, seed=args.seed, z_range=(1.5, 13.0))
    wg.share_colors(body)
    wg.apply_shade(body)
    paint_steel(body)
    paint_guard(body)
    paint_face(body)
    rig.bind(body, arm)
    if os.environ.get("WINDLASS_DEBUG"):
        me = body.data; n = len(me.loops)
        li = np.empty(n, dtype=np.int32); me.loops.foreach_get("vertex_index", li)
        nr = np.empty(n * 3, dtype=np.float32); me.corner_normals.foreach_get("vector", nr); nr = np.round(nr.reshape(-1, 3), 3)
        col = np.round(vcol.get_colors(body)[:, :3], 3); u = np.round(uv.get(body), 4)
        k1 = {(int(a), *map(float, b)) for a, b in zip(li, nr)}
        k2 = {(int(a), *map(float, b), *map(float, c)) for a, b, c in zip(li, nr, col)}
        k3 = {(int(a), *map(float, b), *map(float, c), *map(float, d)) for a, b, c, d in zip(li, nr, col, u)}
        print(f"SPLITS verts {len(me.vertices)} +normal {len(k1)} +colour {len(k2)} +uv {len(k3)} loops {n}")
    build_lamps(arm, lamps, cores)
    build_sockets(arm)
    clips(arm)
    print("WINDLASS triangles by bone: " + ", ".join(f"{k} {v}" for k, v in report.items()) + f"; body total {mesh.tri_count(body, False)}")


def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    build(args)
    export.export_asset(ASSET, args.out, blend=args.blend)
    if args.preview: export.preview(ASSET, args.out, clips=True)


if __name__ == "__main__":
    scene.run(main)
