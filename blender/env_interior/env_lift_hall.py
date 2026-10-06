"""env_lift_hall: the 12 m machine hall of ten ribs (work order art-env-interior 4.3; ART_BIBLE 3.5, 7.3; LEVEL 5).

    node tools/build-assets.mjs --only env_lift_hall          (KS_Q=draft in the environment: quick bake)

One chunk `chunk_lh_hall` (m_pellam, m_mask, m_emis) + the lamp set `diagram_lamps`. Exact Old-World machinery on
the 1.2 m module: the gantry and its ramp, ten ceramic piers that flare into the ceiling with a 0.6 m fillet, a
satin plate floor with five grate recesses, the pounded bulkhead on the north wall, the ring (a 9 m ceramic portal
round the cage gate, a continuous aqua strip in its reveal), the lift-head diagram, the cold bay with the clean
Tamper under one clean lamp, and its inspection slot, shrouded.

Bake, mood L4: ambient #132547 x 0.22 x AO; fifteen pendant lamps 9 m up (one in eight dead), each a streak on the
floor; the ring's strip; the cold bay lamp; no violet. `lm_hall`: floor, ribs to 4 m, gantry, ramp, the ring;
walls above 4 m and the ceiling vertex-lit and simple.
"""
import sys, os
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
while not (os.path.isfile(os.path.join(_d, "lib", "__init__.py")) or os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py"))):
    if os.path.dirname(_d) == _d: raise SystemExit(f"blender/lib not found above {os.path.abspath(__file__)}")
    _d = os.path.dirname(_d)
sys.path.insert(0, _d if os.path.isfile(os.path.join(_d, "lib", "__init__.py")) else os.path.join(_d, "blender"))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import math, random, time
import bpy
import numpy as np
from mathutils import Vector, Matrix
from lib import scene, mesh, uv, material, vcol, bake, export, zone, layout, manifest, brand
import interior_common as ic
from interior_common import B, lin, cuts, frange

ASSET = "env_lift_hall"
def _env(k, d): return float(os.environ.get(k, d))
LM = "lm_hall"
AMBIENT = ic.ambient("#132547", 0.22)
FL, CE = -15.0, -3.0
XW, XE, ZN, ZS = -18.0, 20.0, -28.0, 0.0
LMH = 4.0
RIB_X = [-9.0, -3.0, 3.0, 9.0, 15.0]; RIB_Z = [-18.0, -10.0]
WIDE_T, WIDE_R, WIDE_P = _env("KS_WIDE_T", 0.16), _env("KS_WIDE_R", 10.5), _env("KS_WIDE_P", 1.5)        # the pendant's pool (polish round 2)
RING_T = _env("KS_RING_T", 1.0)     # polish round 5: 1.5 drew the gate's surround as one flat near-white mint field from the hall's checkpoint; at 1.0 its panel joints read
STREAK_T, STREAK_SPREAD = _env("KS_STREAK_T", 1.6), _env("KS_STREAK_S", 24.0)
DEAD = {"light_hall_4_n", "light_hall_2_s"}                       # one lamp in eight is dead (dark, not flickering)
RESERVE = {"tamper_cold_static": 1.0, "rd_plate": 1.0 / 3.0}
GRATES = ["sp_hall_grate_1", "sp_hall_grate_2", "sp_hall_grate_3", "sp_hall_grate_4", "sp_hall_vig_bider"]

parts, emb, dec, emi = [], [], [], []


def add(ob, into=None):
    (parts if into is None else into).append(ob); return ob


ENAMEL, STAIN = "enamel", "enamel_stain"
# fix pass 1 (critic round 1: value structure 8 : 27 : 65). The walls are the dark band of the hall: the shadowed,
# stained glaze, darker above the livery band and darker again above the string course; the ribs stay the paler
# stained ceramic so the two rows read against them, and the floor's satin plate carries the lamp streaks.
W_LOW = tuple(ic.mix("enamel_stain", "steel", 0.4))
W_MID = tuple(ic.mix("enamel_stain", "steel", 0.55))
W_HIGH = tuple(ic.mix("enamel_stain", "steel", 0.68))
RIB = tuple(ic.mix("enamel_stain", "enamel", 0.25))
# polish round 2: the satin floor is the pale plate the lamp streaks land on ("lightest thing: lamp streaks on the
# floor", ART_BIBLE 2.3). As steel-grey concrete a streak baked at the lightmap's ceiling (2.0) still drew at L* 57.
FLOOR_T = tuple(ic.mix("concrete", "enamel", _env("KS_FLOOR", 0.3)))
# polish round 3 (visual critic: the cage well a flat dark field; "gallery and lift hall are one continuous saturated teal
# wash ... no warm or neutral accent"). Teal is the LIGHT of the station, not the colour of everything it falls on: the
# streak under each pendant is a near-neutral white (the pool's core draws grey-white on the plate under the grade),
# the pendant's wide pool is half as saturated, the ambient stays the deep blue of the mood, and two sodium practicals
# stand where the story is: over the pounded bulkhead (the Tamper's arch) and over the line locker at the ramp's foot.
# Lead ruling R7 outranks ART_BIBLE 3.5's "aqua lamps" for the core's colour; the request file records it.
CAGE_T = tuple(ic.mix("enamel_stain", "steel", 0.4)); CAGE_LOW = tuple(ic.mix("enamel_stain", "steel", 0.68))
CORE_C = (1.0, _env("KS_CORE_G", 0.88), _env("KS_CORE_B", 0.84))                 # linear: the streak's colour
WIDE_C = tuple(float(x) for x in (lin("#7CF2E2") * 0.5 + np.array(CORE_C, dtype=np.float32) * 0.5))
SODIUM = "#FF9A3C"
ARCH_T, LOCK_T, CAGE_LAMP_T, CAGE_WASH_T = _env("KS_ARCH_T", 0.9), _env("KS_LOCK_T", 0.8), _env("KS_CAGE_T", 0.42), _env("KS_CAGEW_T", 0.30)     # resumed: 0.55 / 0.45 before the cage's lattice stood in front of the lining; 0.65 / 0.62 in round 3;
#   polish round 4 (visual critic: "both lift rides are a wall of bright mesh squares"): an evenly bright lining behind the
#   lattice IS the pattern. The wash is half as strong and dies within 5.5 m, so the lining is a soft pool behind the lever
#   that falls to dark toward the gate and the corners, and the lattice is dark on dark except where the light is
WARM = []


def wcell(i, j, uc, vc):
    if vc < FL + 0.3: return {"region": "steel", "tint": "steel", "row": 0.6, "vbase": FL, "vrange": (0.0, 0.5)}
    return {"tint": W_LOW if vc < FL + 1.2 else W_MID}


# ====================================================================================================== shell
def build_shell():
    rows_lm = [FL, FL + 0.3, FL + 1.2, FL + 2.4, FL + 3.6, FL + LMH]
    rows_vl = [FL + LMH, FL + LMH + 0.14, FL + 4.8, FL + 6.0, FL + 7.2, FL + 8.4, FL + 9.6, FL + 10.8, CE]
    def wall(tag, o, u, v, a, b, extra=(), skip=None, step=3.6, vl_step=3.6, rows=()):
        us = cuts(a, b, step, extra); usv = cuts(a, b, vl_step, extra)
        sk = skip or (lambda uc, vc: False)
        lo = ic.surface(f"wall_{tag}_lm", o, u, v, us, cuts(FL, FL + LMH, 1.2, rows_lm + list(rows)), "m_pellam", "panel", ENAMEL, vbase=FL, cell=wcell, skip=sk, lm=True)
        hi = ic.surface(f"wall_{tag}_vl", o, u, v, usv, rows_vl, "m_pellam", "panel", W_HIGH, vbase=FL, skip=sk, lm=False)
        add(lo); add(hi)
    door = layout.marker("door_gallery_far")["pos"]; dz0, dz1 = door[2] - 1.5, door[2] + 1.5
    # west wall (looks +x): the far door of the gallery opens onto the gantry deck (y -12 .. -9)
    wall("w", (XW, 0, 0), (0, 0, -1), (0, 1, 0), -ZS, -ZN, extra=[-dz1, -dz0], skip=lambda uc, vc: -dz1 < uc < -dz0 and FL + 3.0 < vc < FL + 6.0, rows=[FL + 3.0])
    # north wall (looks +z): the bulkhead is a recess of its own
    bk = layout.marker("sp_hall_tamper")["params"]["bulkheadAt"]; bx0, bx1 = bk[0] - 2.0, bk[0] + 2.0
    wall("n", (0, 0, ZN), (1, 0, 0), (0, 1, 0), XW, XE, extra=[bx0, bx1], skip=lambda uc, vc: bx0 < uc < bx1 and vc < FL + 4.0)
    # south wall (looks -z): the cold bay shutter x 4.5..7.5 (3 m) and the 0.4 m slot at x 2.8..3.2 (1.1 .. 2.2 m up)
    sh = layout.marker("door_cold_bay")["pos"]; sx0, sx1 = sh[0] - 1.5, sh[0] + 1.5
    wall("s", (0, 0, ZS), (-1, 0, 0), (0, 1, 0), -XE, -XW, extra=[-sx1, -sx0, -3.2, -2.8], step=3.6,
         skip=lambda uc, vc: (-sx1 < uc < -sx0 and vc < FL + 3.0) or (-3.2 < uc < -2.8 and FL + 1.1 < vc < FL + 2.2))
    # the slot rows need their own course lines: rebuild the low south wall with them
    lo = [o for o in parts if o.name == "wall_s_lm"][0]; parts.remove(lo); bpy.data.objects.remove(lo, do_unlink=True)
    add(ic.surface("wall_s_lm", (0, 0, ZS), (-1, 0, 0), (0, 1, 0), cuts(-XE, -XW, 3.6, [-sx1, -sx0, -3.2, -2.8]), sorted(set(rows_lm + [FL + 1.1, FL + 2.2, FL + 3.0])), "m_pellam", "panel", ENAMEL,
                   vbase=FL, cell=wcell, lm=True, skip=lambda uc, vc: (-sx1 < uc < -sx0 and vc < FL + 3.0) or (-3.2 < uc < -2.8 and FL + 1.1 < vc < FL + 2.2)))
    # east wall (looks -x): the cage gate opening z -17..-11, 3.5 m high, inside the ring
    gate = layout.marker("door_lift_cage"); gz0, gz1 = gate["pos"][2] - gate["size"][0] / 2, gate["pos"][2] + gate["size"][0] / 2; gh = gate["size"][1]
    add(ic.surface("wall_e_lm", (XE, 0, 0), (0, 0, 1), (0, 1, 0), cuts(ZN, ZS, 3.6, [gz0, gz1]), sorted(set(rows_lm + [FL + gh])), "m_pellam", "panel", ENAMEL, vbase=FL, cell=wcell, lm=True,
                   skip=lambda uc, vc: gz0 < uc < gz1 and vc < FL + gh))
    add(ic.surface("wall_e_vl", (XE, 0, 0), (0, 0, 1), (0, 1, 0), cuts(ZN, ZS, 3.6, [gz0, gz1]), rows_vl, "m_pellam", "panel", W_HIGH, vbase=FL, lm=False))
    # floor: satin plate, the 1.2 m module; holes for the five grate recesses
    gr = [layout.marker(m)["pos"] for m in GRATES]
    gx = [g[0] + d for g in gr for d in (-0.6, 0.6)]; gzz = [g[2] + d for g in gr for d in (-0.6, 0.6)]
    def in_grate(x, z): return any(abs(x - g[0]) < 0.6 and abs(z - g[2]) < 0.6 for g in gr)
    gant = layout.solid("lh_gantry"); gxs = (gant["pos"][0] - gant["size"][0] / 2, gant["pos"][0] + gant["size"][0] / 2); gzs = (gant["pos"][2] - gant["size"][2] / 2, gant["pos"][2] + gant["size"][2] / 2)
    ramp = layout.solid("lh_gantry_ramp"); rxs = (ramp["pos"][0] - 1.5, ramp["pos"][0] + 1.5); rzs = (ramp["pos"][2] - 3.0, ramp["pos"][2] + 3.0)
    def under(x, z): return (gxs[0] < x < gxs[1] and gzs[0] < z < gzs[1]) or (rxs[0] < x < rxs[1] and rzs[0] < z < rzs[1])
    xs = cuts(XW, XE, 3.6, gx + list(gxs) + list(rxs)); zs = cuts(ZN, ZS, 3.6, gzz + list(gzs) + list(rzs))
    add(ic.surface("floor", (0, FL, 0), (1, 0, 0), (0, 0, -1), xs, [-z for z in reversed(zs)], "m_pellam", "floor", FLOOR_T, row=1.2, vbase=-ZS, lm=True,
                   skip=lambda uc, vc: in_grate(uc, -vc) or under(uc, -vc)))
    for k, g in enumerate(gr):
        x0, x1, z0, z1, d = g[0] - 0.6, g[0] + 0.6, g[2] - 0.6, g[2] + 0.6, 0.04      # shallow: nav nodes stand on two of them
        f = [[(x0, FL, z0), (x1, FL, z0), (x1, FL - d, z0), (x0, FL - d, z0)], [(x1, FL, z1), (x0, FL, z1), (x0, FL - d, z1), (x1, FL - d, z1)],
             [(x0, FL, z1), (x0, FL, z0), (x0, FL - d, z0), (x0, FL - d, z1)], [(x1, FL, z0), (x1, FL, z1), (x1, FL - d, z1), (x1, FL - d, z0)],
             [(x0, FL - d, z0), (x1, FL - d, z0), (x1, FL - d, z1), (x0, FL - d, z1)]]
        add(ic.from_faces(f"grate_well_{k}", f, "m_pellam", tuple(lin("steel_dark") * 0.6), None, toward=(g[0], FL - 0.2, g[2])))
        rim = ic.rounded_rect(x0 - 0.12, z0 - 0.12, x1 + 0.12, z1 + 0.12, 0.15, 3)
        inner = [(x0, z0), (x1, z0), (x1, z1), (x0, z1)]
        add(ic.from_faces(f"grate_rim_{k}", [[(p[0], FL + 0.008, p[1]) for p in rim]], "m_pellam", "steel", "steel", away_from=(g[0], FL - 2, g[2]), mpr=3.6))
        ic.LM_FACES.pop(parts[-1].name, None)
        # the rim is a flat steel frame round the hole: cut the hole out of its n-gon
        bpy.data.objects.remove(parts.pop(), do_unlink=True)
        ring = []
        oc = [(x1 + 0.12, z1 + 0.12), (x0 - 0.12, z1 + 0.12), (x0 - 0.12, z0 - 0.12), (x1 + 0.12, z0 - 0.12)]
        ic_ = [(x1, z1), (x0, z1), (x0, z0), (x1, z0)]
        for i in range(4):
            j = (i + 1) % 4
            ring.append([(ic_[i][0], FL + 0.008, ic_[i][1]), (ic_[j][0], FL + 0.008, ic_[j][1]), (oc[j][0], FL + 0.008, oc[j][1]), (oc[i][0], FL + 0.008, oc[i][1])])
        add(ic.from_faces(f"grate_rim_{k}", ring, "m_pellam", "steel_dark", None, away_from=(g[0], FL - 2, g[2]), lm=True))
    # ceiling: the vault's flat panels, vertex-lit, simple
    add(ic.surface("ceiling", (0, CE, 0), (1, 0, 0), (0, 0, 1), cuts(XW, XE, 3.8), cuts(ZN, ZS, 3.5), "m_pellam", "panel", tuple(ic.mix(STAIN, "concrete", 0.5)), row=1.2, vbase=ZN, lm=False))
    # livery band and kick plate round the room (broken by the openings)
    def run(tag, pts):
        add(ic.band(f"band_{tag}", pts, FL + 1.2))
    run("n1", [(XW, ZN), (bx0 - 0.3, ZN)]); run("n2", [(bx1 + 0.3, ZN), (XE, ZN)])
    run("e1", [(XE, ZN), (XE, gz0 - 0.1)]); run("e2", [(XE, gz1 + 0.1), (XE, ZS)])
    run("s1", [(XE, ZS), (sx1, ZS)]); run("s2", [(sx0, ZS), (3.4, ZS)]); run("s3", [(2.6, ZS), (XW, ZS)])
    return (bx0, bx1, bk), (sx0, sx1), (gz0, gz1, gh)


# ====================================================================================================== ribs and pilasters
def pier(tag, cx, cz, w, d, h0=FL, h1=CE, fillet=0.6, r=0.15, faces=("x-", "x+", "z-", "z+"), plate_side=None, plate_no=None, lm=True):
    """A ceramic pier w (x) by d (z), vertical edges rounded to r, flaring into the ceiling with a 0.6 m fillet:
    lightmapped to 4 m, vertex-lit above; kick plate, livery band, a cast plate."""
    x0_, x1_, z0_, z1_ = cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2
    plan = ic.rounded_rect(x0_, z0_, x1_, z1_, r, 3) if r > 0 else [(x1_, z1_), (x0_, z1_), (x0_, z0_), (x1_, z0_)]
    n = len(plan)
    ys_lm = [h0, h0 + 0.3, h0 + 1.2, h0 + 2.4, h0 + LMH]
    # fix pass 1: a vertex ring just above the collar. The ring AT 4 m lies behind the collar and bakes dark; without
    # this one that darkness graded over the next 1.6 m (the critic's "two-tone step on every rib").
    ys_vl = [h0 + LMH, h0 + LMH + 0.16] + [h0 + LMH + 1.6 * i for i in range(1, 6) if h0 + LMH + 1.6 * i < h1 - fillet - 0.05] + [h1 - fillet]
    def shaft(name, ys, lm_):
        f = []
        for j in range(len(ys) - 1):
            for i in range(n):
                a, b = plan[i], plan[(i + 1) % n]
                f.append([(a[0], ys[j], a[1]), (b[0], ys[j], b[1]), (b[0], ys[j + 1], b[1]), (a[0], ys[j + 1], a[1])])
        return ic.from_faces(name, f, "m_pellam", RIB, "panel", away_from=(cx, (ys[0] + ys[-1]) / 2, cz), lm=lm_, smooth=50, mpr=3.6, fit='metric')
    lo = shaft(f"{tag}_lo", ys_lm, lm); hi = shaft(f"{tag}_hi", ys_vl, False)
    # colours by course: stain low, steel kick
    for o in (lo,):
        me = o.data; t = vcol.get_colors(o, "Tint") if "Tint" in me.color_attributes else None
    add(lo); add(hi)
    # the fillet: a quarter circle (r 0.6) from the pier face out onto the ceiling, all round
    f = []
    prof = [(math.sin(math.radians(a)) * fillet, h1 - fillet + (1 - math.cos(math.radians(a))) * fillet) for a in (0, 30, 60, 90)]
    for i in range(n):
        a, b = plan[i], plan[(i + 1) % n]
        # outward normal of this plan edge
        ex, ez = b[0] - a[0], b[1] - a[1]; L = math.hypot(ex, ez); nx, nz = ez / L, -ex / L
        if (a[0] + b[0]) / 2 * 0 + nx * ((a[0] + b[0]) / 2 - cx) + nz * ((a[1] + b[1]) / 2 - cz) < 0: nx, nz = -nx, -nz
        na = Vector((a[0] - cx, a[1] - cz)); nb = Vector((b[0] - cx, b[1] - cz))
        def off(p, dd, k):
            # corner points move along the average normal of their two edges (the plan is convex)
            q = Vector((p[0] - cx, p[1] - cz))
            sx = 1 if q.x > 0 else -1; sz = 1 if q.y > 0 else -1
            ax = abs(q.x) >= w / 2 - r - 1e-6; az = abs(q.y) >= d / 2 - r - 1e-6
            vx = sx * (1.0 if ax else 0.0); vz = sz * (1.0 if az else 0.0)
            if ax and az and r > 0:
                cxr, czr = cx + sx * (w / 2 - r), cz + sz * (d / 2 - r)
                v = Vector((p[0] - cxr, p[1] - czr)).normalized(); vx, vz = v.x, v.y
            return (p[0] + vx * dd, prof[k][1], p[1] + vz * dd)
        for k in range(len(prof) - 1):
            f.append([off(a, prof[k][0], k), off(b, prof[k][0], k), off(b, prof[k + 1][0], k + 1), off(a, prof[k + 1][0], k + 1)])
    add(ic.from_faces(f"{tag}_fillet", f, "m_pellam", RIB, None, away_from=(cx, h1 - 3.0, cz), smooth=50))
    # kick plate and livery band wrap the pier (1 cm proud)
    e = 0.012
    big = ic.rounded_rect(cx - w / 2 - e, cz - d / 2 - e, cx + w / 2 + e, cz + d / 2 + e, r + e, 3) if r > 0 else \
        [(cx + w / 2 + e, cz + d / 2 + e), (cx - w / 2 - e, cz + d / 2 + e), (cx - w / 2 - e, cz - d / 2 - e), (cx + w / 2 + e, cz - d / 2 - e)]
    kick, band = [], []
    for i in range(len(big)):
        a, b = big[i], big[(i + 1) % len(big)]
        kick.append([(a[0], h0, a[1]), (b[0], h0, b[1]), (b[0], h0 + 0.3, b[1]), (a[0], h0 + 0.3, a[1])])
        band.append([(a[0], h0 + 1.15, a[1]), (b[0], h0 + 1.15, b[1]), (b[0], h0 + 1.25, b[1]), (a[0], h0 + 1.25, a[1])])
    add(ic.from_faces(f"{tag}_kick", kick, "m_pellam", "steel", "steel", away_from=(cx, h0, cz), lm=lm, mpr=3.6))
    add(ic.from_faces(f"{tag}_band", band, "m_pellam", "livery", None, away_from=(cx, h0 + 1.2, cz)))
    if plate_side is not None:
        side, sgn = plate_side
        if side == "z": pos = (cx, h0 + 1.55, cz + sgn * (d / 2 + e)); facing = 180.0 if sgn > 0 else 0.0
        else: pos = (cx + sgn * (w / 2 + e), h0 + 1.55, cz); facing = -90.0 if sgn > 0 else 90.0
        pl, pd = ic.maker_plate(plate_no, pos, facing, name=f"{tag}_plate")
        add(pl)
        if pd is not None: dec.append(pd)


def build_ribs():
    k = 0
    for z in RIB_Z:
        for x in RIB_X:
            k += 1
            row = "n" if z < -14 else "s"
            pier(f"rib_{row}{RIB_X.index(x) + 1}", x, z, 1.6, 2.4, plate_side=("z", 1 if row == "n" else -1), plate_no=f"4-1{k:02d}")
            rib_collar(f"rib_{row}{RIB_X.index(x) + 1}", x, z, 1.6, 2.4)
    # engaged half-piers on the long walls, in line with the ribs (0.2 m proud): the rhythm reads down the hall
    for x in RIB_X:
        pier(f"pil_n{RIB_X.index(x)}", x, ZN + 0.1, 1.6, 0.2, r=0.0, fillet=0.6, lm=True)
        rib_collar(f"pil_n{RIB_X.index(x)}", x, ZN + 0.1, 1.6, 0.2, r=0.0)      # fix pass 1: the string course carries round the pilasters (it hid nothing of their lightmap / vertex-light seam before)
        if abs(x - 3.0) > 0.01:
            pier(f"pil_s{RIB_X.index(x)}", x, ZS - 0.1, 1.6, 0.2, r=0.0, fillet=0.6, lm=True)
            rib_collar(f"pil_s{RIB_X.index(x)}", x, ZS - 0.1, 1.6, 0.2, r=0.0)


# ====================================================================================================== vault, cornice, rails (pass 2)
def build_structure(bk, shutter, gate):
    """What makes the hall a built vault instead of a box (look-and-improve pass 2): two longitudinal girders over the
    rib rows and a cross beam on every rib line (a coffered vault, vertex-lit); a steel string course at 4 m on the
    walls between the pilasters and a collar round every rib at the same height (it covers the lightmap / vertex-light
    seam); two service mains on brackets high on the long walls; a pair of flush floor rails down the nave to the gate."""
    bx0, bx1, _ = bk; sx0, sx1 = shutter; gz0, gz1, gh = gate
    vt = tuple(ic.mix(STAIN, "concrete", 0.35))
    def beam(name, lo, hi, axis):
        """Three faces (two cheeks and the soffit) of a beam hanging from the ceiling; axis 'x' or 'z' = its run."""
        (x0, y0, z0), (x1, y1, z1) = lo, hi
        if axis == 'x':
            f = [[(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], [(x0, y0, z0), (x0, y1, z0), (x1, y1, z0), (x1, y0, z0)], [(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]]
        else:
            f = [[(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], [(x0, y0, z0), (x0, y0, z1), (x0, y1, z1), (x0, y1, z0)], [(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)]]
        c = ((x0 + x1) / 2, (y0 + y1) / 2 + 0.2, (z0 + z1) / 2)
        o = ic.from_faces(name, f, "m_pellam", vt, "panel", away_from=c, tess=2.0, mpr=3.6, fit='metric', along=(1, 0, 0) if axis == 'x' else (0, 1, 0))
        return add(o)
    for k, z in enumerate(RIB_Z):                                       # girders: 1.2 wide, 0.55 deep, over the rib rows
        beam(f"girder_{k}", (XW, CE - 0.55, z - 0.6), (XE, CE, z + 0.6), 'x')
        add(ic.box(f"girder_flange_{k}", (XW, CE - 0.61, z - 0.68), (XE, CE - 0.55, z + 0.68), "m_pellam", "steel", "steel", bevel=0.0, drop="y+ x- x+", tess=2.4, mpr=3.6))
    for k, x in enumerate(RIB_X):                                       # cross beams: 0.8 wide, 0.4 deep, wall to wall
        for j, (za, zb) in enumerate(((ZN, RIB_Z[0] - 0.6), (RIB_Z[0] + 0.6, RIB_Z[1] - 0.6), (RIB_Z[1] + 0.6, ZS))):
            beam(f"cross_{k}_{j}", (x - 0.4, CE - 0.4, za), (x + 0.4, CE, zb), 'z')
    # the string course at 4 m: steel, 0.12 high, 0.05 proud, between the pilasters and round the openings
    def course(tag, pts):
        f = []
        y0, y1 = FL + LMH - 0.02, FL + LMH + 0.10; o = 0.05
        for a, b in zip(pts[:-1], pts[1:]):
            d = Vector((b[0] - a[0], b[1] - a[1])).normalized(); nx, nz = -d.y, d.x
            A = (a[0] + nx * o, a[1] + nz * o); Bq = (b[0] + nx * o, b[1] + nz * o)
            f.append([(A[0], y0, A[1]), (Bq[0], y0, Bq[1]), (Bq[0], y1, Bq[1]), (A[0], y1, A[1])])
            f.append([(A[0], y1, A[1]), (Bq[0], y1, Bq[1]), (b[0], y1 + 0.03, b[1]), (a[0], y1 + 0.03, a[1])])
            f.append([(a[0], y0, a[1]), (b[0], y0, b[1]), (Bq[0], y0, Bq[1]), (A[0], y0, A[1])])
        add(ic.from_faces(f"course_{tag}", f, "m_pellam", "steel", "steel", mpr=3.6, tess=1.3))
    edges = [XW] + [v for x in RIB_X for v in (x - 0.8, x + 0.8)] + [XE]
    for i in range(0, len(edges), 2):
        xa, xb = edges[i], edges[i + 1]
        if not (xa < bx1 and xb > bx0): course(f"n{i}", [(xa, ZN), (xb, ZN)])                 # the bulkhead's frame takes its place
        else:
            if bx0 - xa > 0.3: course(f"n{i}a", [(xa, ZN), (bx0, ZN)])
            if xb - bx1 > 0.3: course(f"n{i}b", [(bx1, ZN), (xb, ZN)])
        course(f"s{i}", [(xb, ZS), (xa, ZS)])
    cz = (gz0 + gz1) / 2
    course("e1", [(XE, ZN), (XE, cz - 4.3)]); course("e2", [(XE, cz + 4.3), (XE, ZS)])
    door = layout.marker("door_gallery_far")["pos"]
    course("w1", [(XW, ZS), (XW, door[2] + 1.7)]); course("w2", [(XW, door[2] - 1.7), (XW, ZN)])
    # two service mains high on the long walls, on a bracket at every pilaster (r 0.16 and 0.10, 0.45 m off the wall)
    for tag, zw, sgn in (("n", ZN, 1.0), ("s", ZS, -1.0)):
        for k, (r, y, off) in enumerate(((0.16, FL + 6.3, 0.48), (0.10, FL + 6.85, 0.42))):
            z = zw + sgn * off
            keep = (lambda n: n.y < 0.5) if sgn > 0 else (lambda n: n.y > -0.5)             # the half the hall sees
            add(ic.cyl(f"main_{tag}{k}", (XW, y, z), (XE, y, z), r, 8, "m_pellam", tuple(ic.mix("steel", STAIN, 0.3 * k)), "steel", cap=False, keep=keep, tess=2.4, mpr=3.6))
        for i, x in enumerate(RIB_X):
            za, zb = sorted((zw + sgn * 0.2, zw + sgn * 0.66))
            add(ic.box(f"main_arm_{tag}{i}", (x - 0.05, FL + 6.0, za), (x + 0.05, FL + 6.12, zb), "m_pellam", "steel_dark", None, bevel=0.0, drop="z-" if sgn > 0 else "z+"))
            add(ic.box(f"main_strap_{tag}{i}", (x - 0.06, FL + 6.12, zw + sgn * 0.48 - 0.19), (x + 0.06, FL + 6.5, zw + sgn * 0.48 + 0.19), "m_pellam", "steel_dark", None, bevel=0.0, drop="y-"))
    # floor rails: a pair of flush steel channels down the nave, from under the gantry's edge to the cage gate
    for k, z in enumerate((cz - 0.75, cz + 0.75)):
        add(ic.surface(f"rail_{k}", (0, FL + 0.004, 0), (1, 0, 0), (0, 0, -1), cuts(-12.6, XE, 3.6), [-(z + 0.07), -(z - 0.07)], "m_pellam", "steel", "steel_dark", row=0.6, vbase=-(z + 0.07), lm=True))
    add(ic.surface("rail_end", (0, FL + 0.005, 0), (1, 0, 0), (0, 0, -1), [-12.9, -12.6], [-(cz + 0.95), -(cz - 0.95)], "m_pellam", "steel", "steel_dark", row=0.6, vbase=-(cz + 0.95), lm=True))

def rib_collar(tag, cx, cz, w, d, r=0.15):
    """A steel collar round a rib at the string course's height (0.14 m high, 25 mm proud)."""
    e = 0.025
    if r <= 0: e = 0.05                                                 # a pilaster: as proud as the string course it joins
    big = ic.rounded_rect(cx - w / 2 - e, cz - d / 2 - e, cx + w / 2 + e, cz + d / 2 + e, r + e, 3)
    y0, y1 = FL + LMH - 0.03, FL + LMH + 0.11
    f = []
    plan = ic.rounded_rect(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, r, 3)
    for i in range(len(big)):
        a, b = big[i], big[(i + 1) % len(big)]; pa, pb = plan[i], plan[(i + 1) % len(plan)]
        f.append([(a[0], y0, a[1]), (b[0], y0, b[1]), (b[0], y1, b[1]), (a[0], y1, a[1])])
        f.append([(a[0], y1, a[1]), (b[0], y1, b[1]), (pb[0], y1 + 0.02, pb[1]), (pa[0], y1 + 0.02, pa[1])])
        f.append([(pa[0], y0 - 0.02, pa[1]), (pb[0], y0 - 0.02, pb[1]), (b[0], y0, b[1]), (a[0], y0, a[1])])
    add(ic.from_faces(f"{tag}_collar", f, "m_pellam", "steel", "steel", away_from=(cx, FL + LMH, cz), mpr=3.6, smooth=50))


# ====================================================================================================== gantry, ramp, cabinet
def build_gantry(rng):
    g = layout.solid("lh_gantry"); gx0, gx1 = g["pos"][0] - 2.5, g["pos"][0] + 2.5; gz0, gz1 = g["pos"][2] - 5.0, g["pos"][2] + 5.0; deck = g["pos"][1] + g["size"][1] / 2
    r = layout.solid("lh_gantry_ramp"); rx0, rx1 = r["pos"][0] - 1.5, r["pos"][0] + 1.5; rz0, rz1 = r["pos"][2] - 3.0, r["pos"][2] + 3.0
    # the plinth under the deck: ceramic panel faces (east and north), steel kick, livery band
    rows = [FL, FL + 0.3, FL + 1.2, FL + 2.4, deck]
    add(ic.surface("gantry_e", (gx1, 0, 0), (0, 0, -1), (0, 1, 0), cuts(-gz1, -gz0, 3.6), rows, "m_pellam", "panel", ENAMEL, vbase=FL, cell=wcell, lm=True))
    add(ic.surface("gantry_n", (0, 0, gz0), (-1, 0, 0), (0, 1, 0), cuts(-gx1, -gx0, 3.6), rows, "m_pellam", "panel", ENAMEL, vbase=FL, cell=wcell, lm=True))
    add(ic.surface("gantry_s", (0, 0, gz1), (1, 0, 0), (0, 1, 0), cuts(rx1, gx1, 3.6), rows, "m_pellam", "panel", ENAMEL, vbase=FL, cell=wcell, lm=True))
    add(ic.band("gantry_band", [(gx0, gz0), (gx1, gz0), (gx1, gz1), (rx1, gz1)], FL + 1.2) if False else ic.band("gantry_band", [(gx1, gz0), (gx0, gz0)], FL + 1.2))
    add(ic.band("gantry_band_e", [(gx1, gz1), (gx1, gz0)], FL + 1.2)); add(ic.band("gantry_band_s", [(rx1, gz1), (gx1, gz1)], FL + 1.2))
    # deck: a steel frame on the 1.2 m module, grille cards over a dark pan (shots clank: the decking is open grating)
    pan = deck - 0.12
    add(ic.surface("deck_pan", (0, pan, 0), (1, 0, 0), (0, 0, -1), cuts(gx0, gx1, 2.5), [-z for z in reversed(cuts(gz0, gz1, 2.5))], "m_pellam", "flat", tuple(lin("steel_dark") * 0.45), lm=True))
    cells_x = [gx0 + 0.1 + 0.96 * i for i in range(6)]                 # 5 bays of 0.96 m across, 0.1 m members
    cells_z = [gz0 + 0.1 + 0.98 * i for i in range(11)]
    frame = []
    for i in range(len(cells_x) - 1):
        for j in range(len(cells_z) - 1):
            pass
    # members: longitudinal and transverse steel flats, their tops at deck level
    for x in [gx0, gx1 - 0.1] + [cells_x[i] - 0.05 for i in range(1, 5)]:
        add(ic.box(f"deck_long_{len(parts)}", (x, pan, gz0), (x + 0.1 if x in (gx0, gx1 - 0.1) else x + 0.06, deck, gz1), "m_pellam", "steel", "steel", bevel=0.0, drop="y- z- z+", lm=True, mpr=3.6))
    for z in [gz0] + [gz0 + 0.98 * j + 0.08 for j in range(1, 10)] + [gz1 - 0.1]:
        add(ic.box(f"deck_cross_{len(parts)}", (gx0, pan, z), (gx1, deck - 0.002, z + 0.08), "m_pellam", "steel", "steel", bevel=0.0, drop="y- x- x+", lm=True, mpr=3.6))
    grille = []
    tile = 0.48
    yg = deck - 0.012
    for i in range(int((gx1 - gx0) / tile)):
        for j in range(int((gz1 - gz0) / tile)):
            x0 = gx0 + 0.1 + i * tile; z0 = gz0 + 0.1 + j * tile
            if x0 + tile > gx1 - 0.1 + 1e-6 or z0 + tile > gz1 - 0.1 + 1e-6: continue
            grille.append(([(x0, yg, z0 + tile), (x0 + tile, yg, z0 + tile), (x0 + tile, yg, z0), (x0, yg, z0)], "grille", None, "steel"))
    dec.append(ic.decals("deck_grille", grille, "steel"))
    # ramp: steel plate with treads, a side face on the hall, the rail
    nr = 14
    f = []
    for i in range(nr):
        za, zb = rz0 + (rz1 - rz0) * i / nr, rz0 + (rz1 - rz0) * (i + 1) / nr
        ya, yb = deck - (deck - FL) * i / nr, deck - (deck - FL) * (i + 1) / nr
        f.append([(rx0, ya, za), (rx0, yb, zb), (rx1, yb, zb), (rx1, ya, za)])
    add(ic.from_faces("ramp_top", f, "m_pellam", tuple(ic.mix("steel", "concrete", 0.4)), "floor", away_from=(-16.5, FL - 5, -6), lm=True, along=(0, 1, 0), mpr=3.6))
    for i in range(1, nr):                                                # anti-slip bars across the ramp
        z = rz0 + (rz1 - rz0) * i / nr; y = deck - (deck - FL) * i / nr
        add(ic.box(f"ramp_bar_{i}", (rx0 + 0.15, y - 0.01, z - 0.025), (rx1 - 0.15, y + 0.025, z + 0.025), "m_pellam", "steel_dark", None, bevel=0.0, drop="y- x- x+"))
    side = [[(rx1, FL, rz0), (rx1, FL, rz1), (rx1, deck, rz0)]]
    add(ic.from_faces("ramp_side", side, "m_pellam", ENAMEL, "panel", away_from=(rx1 - 1, -13, -6), lm=True, mpr=3.6, fit='metric'))
    add(ic.from_faces("ramp_kick", [[(rx1 + 0.01, FL, rz0), (rx1 + 0.01, FL, rz1), (rx1 + 0.01, FL + 0.3, rz1 - 0.3 * 6 / 3), (rx1 + 0.01, FL + 0.3, rz0)]], "m_pellam", "steel", "steel", away_from=(rx1 - 1, -14, -6), mpr=3.6))
    # tube rails (0.08 m) on posts every 1.2 m: deck east and north edges, the deck's south lip, the ramp's open side
    def rail(tag, pts, h=1.05):
        P = [Vector(p) for p in pts]
        add(ic.tube(f"rail_{tag}", [tuple(p + Vector((0, h, 0))) for p in P], 0.04, 8, "m_pellam", "steel", "steel", mpr=3.6, tess=1.2))
        add(ic.tube(f"rail_{tag}_mid", [tuple(p + Vector((0, h * 0.5, 0))) for p in P], 0.025, 6, "m_pellam", "steel", "steel", mpr=3.6, tess=1.2))
        L = sum((P[i + 1] - P[i]).length for i in range(len(P) - 1)); k = 0
        for i in range(len(P) - 1):
            seg = P[i + 1] - P[i]; n = max(1, int(round(seg.length / 1.2)))
            for s in range(n + (1 if i == len(P) - 2 else 0)):
                q = P[i] + seg * (s / n)
                add(ic.box(f"post_{tag}_{k}", (q.x - 0.035, q.y, q.z - 0.035), (q.x + 0.035, q.y + h, q.z + 0.035), "m_pellam", "steel", None, bevel=0.0, drop="y- y+", tess=0.6)); k += 1
    rail("deck_e", [(gx1 - 0.06, deck, gz0 + 0.06), (gx1 - 0.06, deck, gz1 - 0.06)])
    rail("deck_n", [(gx0 + 0.06, deck, gz0 + 0.06), (gx1 - 0.06, deck, gz0 + 0.06)])
    rail("deck_s", [(rx1 + 0.06, deck, gz1 - 0.06), (gx1 - 0.06, deck, gz1 - 0.06)])
    pts = [(rx1 - 0.06, deck - (deck - FL) * t, rz0 + (rz1 - rz0) * t) for t in (0.0, 0.25, 0.5, 0.75, 1.0)]
    rail("ramp", pts)
    # the ramp-foot switchgear cabinet (layout lh_ramp_cabinet: 1.2 x 1.2 x 2.4 m, bolted down)
    c = layout.solid("lh_ramp_cabinet"); cx, cz = c["pos"][0], c["pos"][2]; ch = c["size"][1]
    add(ic.box("cabinet", (cx - 0.6, FL + 0.12, cz - 0.6), (cx + 0.6, FL + ch, cz + 0.6), "m_pellam", ENAMEL, "panel", bevel=0.02, drop="y-", tess=0.7, mpr=3.6, fit='metric'))
    add(ic.box("cabinet_plinth", (cx - 0.64, FL, cz - 0.64), (cx + 0.64, FL + 0.12, cz + 0.64), "m_pellam", "steel_dark", None, bevel=0.01, drop="y-"))
    for e, (x0, z0) in enumerate(((cx - 0.64, cz - 0.64), (cx + 0.56, cz - 0.64), (cx - 0.64, cz + 0.56), (cx + 0.56, cz + 0.56))):
        add(ic.cyl(f"cabinet_bolt_{e}", (x0 + 0.04, FL + 0.12, z0 + 0.04), (x0 + 0.04, FL + 0.17, z0 + 0.04), 0.025, 6, "m_pellam", "steel", None))
    # two doors on the east face (the hall side): a seam, handles, louvres, the plate and a pictogram
    xf = cx + 0.6
    add(ic.box("cabinet_seam", (xf, FL + 0.25, cz - 0.016), (xf + 0.004, FL + ch - 0.1, cz + 0.016), "m_pellam", "steel_dark", None, bevel=0.0, drop="x-"))
    for e, z in enumerate((cz - 0.09, cz + 0.09)):
        add(ic.box(f"cabinet_handle_{e}", (xf, FL + 1.2, z - 0.015), (xf + 0.04, FL + 1.5, z + 0.015), "m_pellam", "steel", None, bevel=0.006, drop="x-"))
    xd = xf + 0.002
    dd = [([(xd, FL + ch - 0.6, cz + 0.5), (xd, FL + ch - 0.6, cz + 0.15), (xd, FL + ch - 0.25, cz + 0.15), (xd, FL + ch - 0.25, cz + 0.5)], "louvre", None, "steel_dark"),
          ([(xd, FL + ch - 0.6, cz - 0.15), (xd, FL + ch - 0.6, cz - 0.5), (xd, FL + ch - 0.25, cz - 0.5), (xd, FL + ch - 0.25, cz - 0.15)], "louvre", None, "steel_dark"),
          ([(xd, FL + 0.55, cz - 0.2), (xd, FL + 0.55, cz - 0.42), (xd, FL + 0.77, cz - 0.42), (xd, FL + 0.77, cz - 0.2)], "picto_misc", 2, "steel_dark")]
    dec.append(ic.decals("cabinet_decals", dd))
    pl, pd = ic.maker_plate("4-140", (xd, FL + 1.75, cz + 0.32), -90.0, name="cabinet_plate"); add(pl); dec.append(pd) if pd else None
    add(ic.band("cabinet_band", [(xf, cz + 0.6), (xf, cz - 0.6)], FL + 1.2))


# ====================================================================================================== bulkhead, ring, diagram, bays
def build_bulkhead(bk):
    """The sealed bulkhead on the north wall: a 4 x 4 m steel door in a frame, dished 0.15 m over a 1.5 m circle where
    it has been pounded (sp_hall_tamper.params.bulkheadAt)."""
    bx0, bx1, c = bk; z = ZN + 0.06; top = FL + 4.0
    # recess reveal behind the frame
    add(ic.from_faces("bulk_reveal", [[(bx0, FL, ZN), (bx0, top, ZN), (bx0, top, ZN - 0.25), (bx0, FL, ZN - 0.25)], [(bx1, FL, ZN), (bx1, FL, ZN - 0.25), (bx1, top, ZN - 0.25), (bx1, top, ZN)],
                                      [(bx0, top, ZN), (bx1, top, ZN), (bx1, top, ZN - 0.25), (bx0, top, ZN - 0.25)]], "m_pellam", "steel_dark", None, toward=(c[0], FL + 2, ZN + 1), lm=True))
    # the door: a grid dished smoothly round the pound point
    pr, depth = 0.75, 0.15
    xs = cuts(bx0 + 0.25, bx1 - 0.25, 0.25); ys = cuts(FL, top - 0.25, 0.25)
    def disp(i, j, p):
        rr = math.hypot(p[0] - c[0], p[1] - c[1])
        k = max(0.0, 1.0 - (rr / pr) ** 2)
        return (0, 0, -depth * k * k * (3 - 2 * k) if False else -depth * k)
    add(ic.surface("bulk_door", (0, 0, ZN - 0.2), (1, 0, 0), (0, 1, 0), xs, ys, "m_pellam", "steel", "steel", row=0.6, vbase=FL, lm=True, disp=disp,
                   cell=lambda i, j, uc, vc: {"tint": tuple(ic.mix("steel", "steel_dark", min(1.0, 0.6 * max(0.0, 1.0 - math.hypot(uc - c[0], vc - c[1]) / 1.1))))}))
    fr = [((bx0, FL, ZN - 0.2), (bx0 + 0.25, top, ZN + 0.06)), ((bx1 - 0.25, FL, ZN - 0.2), (bx1, top, ZN + 0.06)), ((bx0, top - 0.25, ZN - 0.2), (bx1, top, ZN + 0.06))]
    for k, (lo, hi) in enumerate(fr):
        add(ic.box(f"bulk_frame_{k}", lo, hi, "m_pellam", "steel_dark", "steel", bevel=0.02, drop="z-" + (" y-" if k < 2 else ""), lm=True, mpr=3.6))
    # dogs: six clamp lugs round the door, and a hazard diagonal across the sill
    for k, (x, y) in enumerate(((bx0 + 0.12, FL + 1.0), (bx0 + 0.12, FL + 2.6), (bx1 - 0.12, FL + 1.0), (bx1 - 0.12, FL + 2.6), (c[0] - 1.0, top - 0.12), (c[0] + 1.0, top - 0.12))):
        add(ic.box(f"bulk_dog_{k}", (x - 0.09, y - 0.14, ZN + 0.06), (x + 0.09, y + 0.14, ZN + 0.16), "m_pellam", "steel", None, bevel=0.015, drop="z-"))
    # polish round 3: a sodium work lamp over the door: the one warm pool of the hall, where the Tamper pounds
    add(ic.box("arch_lamp_bezel", (c[0] - 0.8, top + 0.28, ZN), (c[0] + 0.8, top + 0.52, ZN + 0.12), "m_pellam", "steel_dark", None, bevel=0.01, drop="z-"))
    emi.append(ic.emis("arch_lamp", [[(c[0] - 0.7, top + 0.34, ZN + 0.125), (c[0] + 0.7, top + 0.34, ZN + 0.125), (c[0] + 0.7, top + 0.46, ZN + 0.125), (c[0] - 0.7, top + 0.46, ZN + 0.125)]], "flame"))
    if emi[-1].data.polygons[0].normal.dot(ic.Bd((0, 0, 1))) < 0: emi[-1].data.flip_normals()
    WARM.append(("arch", (c[0], top + 0.4, ZN + 0.3), (c[0], FL, ZN + 3.2), 1.4, 9.5, (c[0], FL, ZN + 2.6), ARCH_T))
    lk = layout.marker("ia_line_locker_hall")["pos"]
    add(ic.box("lock_lamp_bezel", (XW, FL + 2.18, lk[2] - 0.36), (XW + 0.09, FL + 2.38, lk[2] + 0.36), "m_pellam", "steel_dark", None, bevel=0.01, drop="x-"))
    emi.append(ic.emis("lock_lamp", [[(XW + 0.095, FL + 2.23, lk[2] + 0.3), (XW + 0.095, FL + 2.23, lk[2] - 0.3), (XW + 0.095, FL + 2.33, lk[2] - 0.3), (XW + 0.095, FL + 2.33, lk[2] + 0.3)]], "flame"))
    if emi[-1].data.polygons[0].normal.dot(ic.Bd((1, 0, 0))) < 0: emi[-1].data.flip_normals()
    WARM.append(("locker", (XW + 0.25, FL + 2.28, lk[2]), (XW + 1.6, FL, lk[2]), 0.6, 5.5, (XW + 1.4, FL, lk[2]), LOCK_T))
    add(ic.from_faces("bulk_hazard", [[(x, y, ZN + 0.065) for x, y in ic.diagonal_band(bx0 + 0.3, FL + 0.05, bx1 - 0.3, FL + 0.32, 0.3)]], "m_pellam", "hazard", None, away_from=(c[0], FL, ZN - 1)))


def build_ring(gate):
    """The ring (prop_hall_ring): a ceramic portal 9 m across and 1.2 m deep round the 6 x 3.5 m cage gate, standing
    proud of the east wall and running into the floor; a continuous aqua strip in its reveal; a geometry 4 on its crown."""
    gz0, gz1, gh = gate
    m = layout.marker("prop_hall_ring"); cz = m["pos"][2]
    R = m["params"]["diameter"] / 2.0; ri = 3.55; cy = FL + gh / 2.0             # centred on the gate's middle: it runs into the floor
    xb, xf = XE, XE - 1.2                                                # back (on the wall) and front faces
    a0 = math.degrees(math.asin((FL - cy) / R)); a1 = 180.0 - a0                 # where the outer circle meets the floor
    b0 = math.degrees(math.asin(max(-1.0, (FL - cy) / ri))); b1 = 180.0 - b0
    n = 36
    def pt(r, ang, x): return (x, cy + r * math.sin(math.radians(ang)), cz - r * math.cos(math.radians(ang)))
    outer = [pt(R, a0 + (a1 - a0) * i / n, xf) for i in range(n + 1)]
    inner = [pt(ri, b0 + (b1 - b0) * i / n, xf) for i in range(n + 1)]
    front = [[outer[i], outer[i + 1], inner[i + 1], inner[i]] for i in range(n)]
    rf = ic.from_faces("ring_front", front, "m_pellam", ENAMEL, "panel", away_from=(XE + 5, cy, cz), lm=True, mpr=3.6, smooth=20)
    # polish round 5 (visual critic: "the portal surround is a flat near-white field"): the ring's face was one island,
    # so the panel row was stretched once over its 9 m (its seams 3 m apart, its fasteners smears). The row now runs
    # ROUND the ring: V from the reveal to the rim (0.95 m of a 1.2 m row), U along the arc, a whole number of 1.2 m
    # panels: a joint every panel, a fastener in each corner, an arris along both edges.
    v0, v1 = manifest.trim_v(ic.SHEET["m_pellam"], "panel")
    n_pan = max(3, round((R + ri) / 2 * math.radians(a1 - a0) / 1.2))
    a = uv.get(rf); me = rf.data; mw = rf.matrix_world
    for l in me.loops:
        g = layout.to_game(mw @ me.vertices[l.vertex_index].co)
        rad = math.hypot(g[1] - cy, g[2] - cz); ang = math.degrees(math.atan2(g[1] - cy, -(g[2] - cz)))
        if ang < -90.0: ang += 360.0
        is_out = rad > (R + ri) / 2
        t = (ang - a0) / (a1 - a0) if is_out else (ang - b0) / (b1 - b0)
        a[l.index] = (t * n_pan / 3.0, v1 if is_out else v0)
    uv.put(rf, a)
    add(rf)
    ob = [[pt(R, a0 + (a1 - a0) * i / n, xf), pt(R, a0 + (a1 - a0) * i / n, xb), pt(R, a0 + (a1 - a0) * (i + 1) / n, xb), pt(R, a0 + (a1 - a0) * (i + 1) / n, xf)] for i in range(n)]
    add(ic.from_faces("ring_outer", ob, "m_pellam", ENAMEL, "panel", away_from=(XE - 0.6, cy, cz), lm=True, mpr=3.6, smooth=20))
    # the reveal: 1.2 m deep, the strip runs round it 0.35 m in from the front
    xs = [xf, xf + 0.3, xf + 0.4, xb]
    rv = []
    for i in range(n):
        for j in range(3):
            if j == 1: continue
            p = lambda ang, x: pt(ri, ang, x)
            aa, ab = b0 + (b1 - b0) * i / n, b0 + (b1 - b0) * (i + 1) / n
            rv.append([p(aa, xs[j]), p(ab, xs[j]), p(ab, xs[j + 1]), p(aa, xs[j + 1])])
    # polish round 5: the reveal is the stained glaze (it was the white enamel: 0.3 m from its own strip it drew as the
    # brightest and largest shape of the frame at the gate, a flat mint sheet); the strip in it is the light
    add(ic.from_faces("ring_reveal", rv, "m_pellam", tuple(ic.mix(STAIN, "steel", 0.25)), "panel_rib", toward=(XE - 0.6, cy, cz), lm=True, mpr=3.6, smooth=20))
    strip = []
    for i in range(n):
        aa, ab = b0 + (b1 - b0) * i / n, b0 + (b1 - b0) * (i + 1) / n
        strip.append([pt(ri - 0.004, aa, xs[1]), pt(ri - 0.004, ab, xs[1]), pt(ri - 0.004, ab, xs[2]), pt(ri - 0.004, aa, xs[2])])
    e = ic.emis("ring_strip", strip, "aqua")
    for p in e.data.polygons:
        c = p.center; v = Vector((0, c.y - B((XE, cy, cz)).y, c.z - cy))
        if p.normal.dot(-v) < 0: pass
    me = e.data
    import bmesh as _bm
    bm = _bm.new(); bm.from_mesh(me)
    cc = B((XE, cy, cz))
    for f in bm.faces:
        cen = f.calc_center_median(); to_axis = Vector((0, cc.y - cen.y, cc.z - cen.z))
        if f.normal.dot(to_axis) < 0: f.normal_flip()
    bm.to_mesh(me); bm.free()
    emi.append(e)
    # a geometry 4 on the crown, on a steel plate
    top = (xf - 0.02, cy + (R + ri) / 2 - 0.25, cz)
    add(ic.box("ring_plate", (xf - 0.03, top[1] - 0.12, cz - 0.4), (xf, top[1] + 0.58, cz + 0.4), "m_pellam", "steel_dark", None, bevel=0.02, drop="x+"))
    add(ic.numeral("4", 0.45, (xf - 0.032, top[1] - 0.02, cz), 90.0, depth=0.015, tint=ENAMEL, name="ring_numeral_4"))
    return (cy, cz, ri)


def build_diagram():
    """The lift-head diagram on the east wall at z -21.5: the mark 4 m tall in 20 mm relief on a ceramic panel; seven
    lamps (diagram_lamps: 0-5 the six discs, dim aqua; 6 the seventh, aqua-white, steady)."""
    m = layout.marker("prop_hall_diagram"); H = m["params"]["height"]; z = m["pos"][2]; y0 = m["pos"][1]
    U = H / brand.MARK_H
    cy_box = y0 + H / 2.0; ring_y = cy_box + brand.mark_centre_offset(U)
    x = XE - 0.06
    add(ic.box("diagram_panel", (x, y0 - 0.3, z - 1.75), (XE, y0 + H + 0.3, z + 1.75), "m_pellam", ENAMEL, "panel", bevel=0.02, drop="x+", lm=True, mpr=3.6, fit='metric'))
    add(ic.box("diagram_frame_t", (x - 0.04, y0 + H + 0.2, z - 1.8), (XE, y0 + H + 0.36, z + 1.8), "m_pellam", "steel", "steel", bevel=0.02, drop="x+", mpr=3.6))
    add(ic.box("diagram_frame_b", (x - 0.04, y0 - 0.36, z - 1.8), (XE, y0 - 0.2, z + 1.8), "m_pellam", "steel", "steel", bevel=0.02, drop="x+", mpr=3.6))
    mk = brand.pellam_mark(U, relief=0.02, segments=16, name="diagram_mark", colour="steel_dark", mat="m_prop")
    mk.matrix_world = Matrix.Translation(B((x, ring_y, z))) @ Matrix.Rotation(-math.pi / 2, 4, 'Z')       # its front (-Y) turned to face -x (west)
    mesh.apply_transform(mk); zone.fold_flat(mk, "m_pellam"); vcol.tint(mk, "steel_dark"); mk["lm"] = False
    mesh.tessellate_max_edge(mk, 0.6)
    add(mk)
    lamps = []
    for k, (u, v) in enumerate(brand.mark_disc_centres(U)):
        s = 0.12 if k < 6 else 0.17
        xl = x - 0.021 - 0.002
        zc = z + u; yc = ring_y + v                                     # the panel faces west: the mark's right (+u) is toward +z
        lamps.append([B((xl, yc - s, zc - s)), B((xl, yc - s, zc + s)), B((xl, yc + s, zc + s)), B((xl, yc + s, zc - s))])
    return lamps, (x, ring_y, z, U)


def build_cage_bay():
    """The cage bay behind the ring (x 21..27, z -17..-11, y -15..-11.5): a dark steel well the cage stands in.
    polish round 2: `ia_lift_cage` (6.3 m square, floor slab 0..-0.1, roof slab 3.5..3.68, at lift_depart_hall) stands in
    this well, and the well's floor (y -15) and ceiling (y -11.5) were coplanar with the cage's floor top and roof
    underside: they z-fought in combed rows (the visual critic's "stair-stepped, row-banded shadow" at the far end of
    the ride). Under the cage's footprint (x >= 20.84) the well's floor now lies 0.11 m lower and its ceiling 0.2 m
    higher than the cage's; the gate's threshold (x 20..20.84) is unchanged."""
    cz0, cz1, cx1, top = -17.0, -11.0, 27.0, -11.5
    # closer, polish round 2: 0.04 m, not 0.11 (the nav nodes n_lh_071 / n_lh_cage stand here and tests/pipeline/greybox
    # holds a zone floor within 0.05 m of every nav node). The plane is inside the cage's 0.1 m slab: still never coplanar
    xs, fl2, top2 = 20.84, FL - 0.04, -11.3
    # polish round 3 (resumed): `ia_lift_cage` carries a kick plate on local +-3.000..3.030, y 0..0.3: its inner face was
    # coplanar with this well's walls and z-fought in black wedges along the floor at the lever. The lining stands
    # 0.035 m further out than the 6 m interior, so the kick plate is a skirting proud of the wall.
    KICK = 0.035
    wz0, wz1, wx1 = cz0 - KICK, cz1 + KICK, cx1 + KICK
    wb = FL + 1.25                                                      # polish round 3: the walls start at the band's top (the dado is the wall below it):
    #   wall vertices that fell behind the dado and the band baked dark and drew a sawtooth over the band
    f = [[(xs, wb, wz0), (wx1, wb, wz0), (wx1, top2, wz0), (xs, top2, wz0)], [(wx1, wb, wz1), (xs, wb, wz1), (xs, top2, wz1), (wx1, top2, wz1)],
         [(wx1, wb, wz0), (wx1, wb, wz1), (wx1, top2, wz1), (wx1, top2, wz0)], [(xs, top2, wz0), (wx1, top2, wz0), (wx1, top2, wz1), (xs, top2, wz1)],
         [(xs, top, wz0), (xs, top2, wz0), (xs, top2, wz1), (xs, top, wz1)], [(xs, fl2, wz0), (xs, FL, wz0), (xs, FL, wz1), (xs, fl2, wz1)]]
    # polish round 3 (visual critic, major: "the lift ride frames are a flat dark field with a single prompt": the frame
    # at the lever was this well's back wall, dark steel x 0.8 under the ambient alone, L* p50 15). The well is lined in
    # stained enamel over a darker dado with the livery band; a work lamp over the lever washes the walls and the gate
    # head's light (the cage's own gate lamp hangs there) reaches the back wall.
    f += [[(xs, fl2, wz0), (xs, fl2, cz0), (xs, top2, cz0), (xs, top2, wz0)], [(xs, fl2, cz1), (xs, fl2, wz1), (xs, top2, wz1), (xs, top2, cz1)]]   # the two 35 mm returns to the gate's reveal
    add(ic.from_faces("cage_bay", f, "m_pellam", CAGE_T, "steel", toward=(24, -13, -14), tess=0.8, mpr=3.6))
    e = 0.0
    dado = [[(xs, fl2, wz0 + e), (wx1, fl2, wz0 + e), (wx1, FL + 1.15, wz0 + e), (xs, FL + 1.15, wz0 + e)], [(wx1, fl2, wz1 - e), (xs, fl2, wz1 - e), (xs, FL + 1.15, wz1 - e), (wx1, FL + 1.15, wz1 - e)],
            [(wx1 - e, fl2, wz0), (wx1 - e, fl2, wz1), (wx1 - e, FL + 1.15, wz1), (wx1 - e, FL + 1.15, wz0)]]
    add(ic.from_faces("cage_dado", dado, "m_pellam", CAGE_LOW, "steel", toward=(24, -14, -14), tess=0.8, mpr=3.6))
    e = 0.0                                                             # flush: dado, band and wall are one plane in three strips (no vertex behind another face)
    bandq = [[(xs, FL + 1.15, wz0 + e), (wx1, FL + 1.15, wz0 + e), (wx1, FL + 1.25, wz0 + e), (xs, FL + 1.25, wz0 + e)], [(wx1, FL + 1.15, wz1 - e), (xs, FL + 1.15, wz1 - e), (xs, FL + 1.25, wz1 - e), (wx1, FL + 1.25, wz1 - e)],
             [(wx1 - e, FL + 1.15, wz0), (wx1 - e, FL + 1.15, wz1), (wx1 - e, FL + 1.25, wz1), (wx1 - e, FL + 1.25, wz0)]]
    add(ic.from_faces("cage_band", bandq, "m_pellam", "livery", None, toward=(24, FL + 1.2, -14), tess=0.8))
    add(ic.box("cage_lamp_bezel", (wx1 - 0.08, FL + 3.02, -14.7), (wx1, FL + 3.28, -13.3), "m_pellam", "steel_dark", None, bevel=0.01, drop="x+"))
    emi.append(ic.emis("cage_lamp", [[(wx1 - 0.085, FL + 3.08, -13.4), (wx1 - 0.085, FL + 3.08, -14.6), (wx1 - 0.085, FL + 3.22, -14.6), (wx1 - 0.085, FL + 3.22, -13.4)]], "aqua_core"))
    if emi[-1].data.polygons[0].normal.dot(ic.Bd((-1, 0, 0))) < 0: emi[-1].data.flip_normals()
    add(ic.surface("cage_floor", (0, fl2, 0), (1, 0, 0), (0, 0, -1), cuts(xs, cx1, 3.5), [11.0, 14.0, 17.0], "m_pellam", "floor", "steel", row=1.2, vbase=11.0, lm=False))
    mesh.tessellate_max_edge(parts[-1], 1.6)
    add(ic.surface("cage_sill", (0, FL, 0), (1, 0, 0), (0, 0, -1), [XE, xs], [11.0, 14.0, 17.0], "m_pellam", "floor", "steel", row=1.2, vbase=11.0, lm=True))
    add(ic.from_faces("gate_reveal", [[(XE, FL, cz0), (xs, FL, cz0), (xs, top, cz0), (XE, top, cz0)], [(xs, FL, cz1), (XE, FL, cz1), (XE, top, cz1), (xs, top, cz1)],
                                      [(XE, top, cz0), (xs, top, cz0), (xs, top, cz1), (XE, top, cz1)]], "m_pellam", "steel", "steel", toward=(XE + 0.4, -13.5, -14), lm=True, mpr=3.6))


def build_cold_bay(shutter):
    """The cold bay (x 2..10, z 1..7, floor -15, ceiling -11): ceramic, clean, the second Tamper switched off under one
    clean aqua lamp; the knot's latch block behind the inspection slot; a shroud round the slot on the hall side."""
    sx0, sx1 = shutter
    X0, X1, Z0, Z1, top = 2.0, 10.0, 1.0, 7.0, -11.0
    rows = [FL, FL + 0.3, FL + 1.2, FL + 2.4, top]
    kw = dict(mat="m_pellam", region="panel", tint=ENAMEL, vbase=FL, cell=wcell, lm=True)
    add(ic.surface("cb_wall_w", (X0, 0, 0), (0, 0, -1), (0, 1, 0), [-Z1, -4.0, -Z0], rows, **kw))
    add(ic.surface("cb_wall_e", (X1, 0, 0), (0, 0, 1), (0, 1, 0), [Z0, 4.0, Z1], rows, **kw))
    add(ic.surface("cb_wall_s", (0, 0, Z1), (-1, 0, 0), (0, 1, 0), [-X1, -6.0, -X0], rows, **kw))
    # the bay side of the hall's south wall (z = 1, looks +z), the shutter opening and the slot through it
    add(ic.surface("cb_wall_n", (0, 0, Z0), (1, 0, 0), (0, 1, 0), [X0, 2.8, 3.2, sx0, sx1, X1], sorted(set(rows + [FL + 1.1, FL + 2.2, FL + 3.0])), "m_pellam", "panel", ENAMEL, vbase=FL, cell=wcell, lm=True,
                   skip=lambda uc, vc: (sx0 < uc < sx1 and vc < FL + 3.0) or (2.8 < uc < 3.2 and FL + 1.1 < vc < FL + 2.2)))
    add(ic.surface("cb_floor", (0, FL, 0), (1, 0, 0), (0, 0, -1), [X0, 6.0, X1], [-Z1, -4.0, -Z0], "m_pellam", "floor", tuple(ic.mix("steel", "concrete", 0.4)), row=1.2, vbase=-Z1, lm=True))
    add(ic.surface("cb_ceiling", (0, top, 0), (1, 0, 0), (0, 0, 1), [X0, 6.0, X1], [Z0, 4.0, Z1], "m_pellam", "panel", ENAMEL, row=1.2, vbase=Z0, lm=True))
    add(ic.band("cb_band", [(X0, Z0), (X0, Z1), (X1, Z1), (X1, Z0)][::-1] if False else [(X1, Z0), (X1, Z1), (X0, Z1), (X0, Z0)], FL + 1.2))
    # shutter opening reveal through the 1 m wall, and the slot's
    rv = [[(sx0, FL, 0), (sx0, FL, Z0), (sx0, FL + 3, Z0), (sx0, FL + 3, 0)], [(sx1, FL, Z0), (sx1, FL, 0), (sx1, FL + 3, 0), (sx1, FL + 3, Z0)],
          [(sx0, FL + 3, 0), (sx0, FL + 3, Z0), (sx1, FL + 3, Z0), (sx1, FL + 3, 0)], [(sx0, FL, 0), (sx1, FL, 0), (sx1, FL, Z0), (sx0, FL, Z0)]]
    add(ic.from_faces("cb_reveal", rv, "m_pellam", "steel", "steel", toward=((sx0 + sx1) / 2, FL + 1.5, 0.5), lm=True, mpr=3.6))
    sl = [[(2.8, FL + 1.1, -0.25), (2.8, FL + 1.1, Z0), (2.8, FL + 2.2, Z0), (2.8, FL + 2.2, -0.25)], [(3.2, FL + 1.1, Z0), (3.2, FL + 1.1, -0.25), (3.2, FL + 2.2, -0.25), (3.2, FL + 2.2, Z0)],
          [(2.8, FL + 1.1, -0.25), (3.2, FL + 1.1, -0.25), (3.2, FL + 1.1, Z0), (2.8, FL + 1.1, Z0)], [(2.8, FL + 2.2, Z0), (3.2, FL + 2.2, Z0), (3.2, FL + 2.2, -0.25), (2.8, FL + 2.2, -0.25)]]
    add(ic.from_faces("slot_reveal", sl, "m_pellam", "steel_dark", None, toward=(3.0, FL + 1.65, 0.4)))
    # the shroud: a steel collar 0.25 m proud round the slot on the hall side (narrows the angles the knot is seen from)
    for k, (lo, hi) in enumerate((((2.6, FL + 0.95, -0.25), (2.8, FL + 2.35, 0.0)), ((3.2, FL + 0.95, -0.25), (3.4, FL + 2.35, 0.0)),
                                  ((2.6, FL + 0.95, -0.25), (3.4, FL + 1.1, 0.0)), ((2.6, FL + 2.2, -0.25), (3.4, FL + 2.35, 0.0)))):
        add(ic.box(f"shroud_{k}", lo, hi, "m_pellam", "steel", "steel", bevel=0.01, drop="z+", mpr=3.6))
    # the latch block of the shutter, behind the slot, the knot's seat facing north (knot_cold_bay sits 0.08 m in front of it)
    k = layout.marker("knot_cold_bay")["pos"]
    add(ic.box("cb_latch", (k[0] - 0.3, FL + 0.9, k[2] + 0.08), (k[0] + 0.3, FL + 2.3, k[2] + 0.5), "m_pellam", "steel", "steel", bevel=0.02, drop="y-", tess=0.5, mpr=3.6))
    add(ic.box("cb_latch_seat", (k[0] - 0.24, k[1] - 0.24, k[2] + 0.08), (k[0] + 0.24, k[1] + 0.24, k[2] + 0.12), "m_pellam", "steel_dark", None, bevel=0.01))
    add(ic.box("cb_latch_bar", (k[0] + 0.25, FL + 1.6, k[2] + 0.12), (sx0 + 0.2, FL + 1.72, k[2] + 0.26), "m_pellam", "steel", "steel", bevel=0.01, tess=0.6, mpr=3.6))
    # the line locker's mount, the service plate (embedded) and the one clean lamp over the Tamper
    lk = layout.marker("ia_line_locker_secret")["pos"]
    add(ic.box("cb_locker_mount", (lk[0], FL, lk[2] - 0.4), (X1, FL + 1.5, lk[2] + 0.4), "m_pellam", ENAMEL, None, bevel=0.02, drop="y- x+", tess=0.6))
    m = layout.marker("rd_plate_service"); loc, rz = layout.placement(m)
    obs = zone.embed_prop("rd_plate", node="plate_service", location=loc, rot_z=rz, material_name="m_pellam", lightmap=LM)
    for o in obs: o["lm"] = False; mesh.tessellate_max_edge(o, 0.5)
    emb.extend(obs)
    t = layout.marker("sec_cold_bay")["pos"]
    loc, rz = layout.placement("sec_cold_bay")
    obs = zone.embed_prop("tamper_cold_static", node=None, location=loc, rot_z=rz, material_name="m_pellam", lightmap=LM)
    for o in obs: o["lm"] = False; mesh.tessellate_max_edge(o, 0.6)
    emb.extend(obs)
    add(ic.box("cb_lamp_bezel", (t[0] - 0.5, top - 0.06, t[2] - 0.12), (t[0] + 0.5, top, t[2] + 0.12), "m_pellam", "steel_dark", None, bevel=0.02, drop="y+"))
    yq = top - 0.062
    emi.append(ic.emis("cb_lamp", [[(t[0] - 0.42, yq, t[2] - 0.06), (t[0] + 0.42, yq, t[2] - 0.06), (t[0] + 0.42, yq, t[2] + 0.06), (t[0] - 0.42, yq, t[2] + 0.06)]], "aqua"))
    return t, top


def build_pendants():
    """Fifteen pendant lamps 9 m up at the layout's light_hall_* positions, on drop rods from the vault; one in eight dead."""
    out = []
    for mk in layout.markers("lift_hall", "light"):
        p = mk["pos"]; y = FL + 9.0
        add(ic.cyl(f"rod_{mk['id']}", (p[0], CE, p[2]), (p[0], y + 0.25, p[2]), 0.03, 6, "m_pellam", "steel", None))
        add(ic.cyl(f"hood_{mk['id']}", (p[0], y + 0.3, p[2]), (p[0], y, p[2]), 0.12, 12, "m_pellam", "steel_dark", None, radius_b=0.45, cap=False))
        add(ic.cyl(f"cap_{mk['id']}", (p[0], y + 0.36, p[2]), (p[0], y + 0.28, p[2]), 0.16, 8, "m_pellam", "steel", None, cap=True))
        ring = [(p[0] + 0.42 * math.cos(2 * math.pi * i / 12), y - 0.005, p[2] + 0.42 * math.sin(2 * math.pi * i / 12)) for i in range(12)]
        dead = mk["id"] in DEAD
        if dead:
            add(ic.from_faces(f"lens_{mk['id']}", [ring], "m_pellam", "lens", None, away_from=(p[0], y + 2, p[2])))
        else:
            e = ic.emis(f"lens_{mk['id']}", [list(reversed(ring))], "aqua")
            if e.data.polygons[0].normal.z > 0: e.data.flip_normals()
            emi.append(e)
        out.append((mk["id"], (p[0], y - 0.02, p[2]), dead))
    return out


# ====================================================================================================== main
def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    rng = scene.rng(args.seed)
    t0 = time.perf_counter()
    bk, shutter, gate = build_shell()
    build_ribs(); build_gantry(rng); build_bulkhead(bk)
    build_structure(bk, shutter, gate)
    ring = build_ring(gate)
    diag_lamps, diag = build_diagram()
    build_cage_bay()
    cold, cold_top = build_cold_bay(shutter)
    pend = build_pendants()
    own = ic.tris(parts) + ic.tris(dec) + ic.tris(emi)
    reserve = int(sum(manifest.asset(k)["triBudget"] * n for k, n in RESERVE.items()))
    print(f"TRIS own {own} + reserve for final embedded props {reserve} = {own + reserve} / {manifest.asset(ASSET)['triBudget']} (embedded now: {ic.tris(emb)})")
    if own + reserve > manifest.asset(ASSET)["triBudget"]: raise RuntimeError(f"{ASSET}: {own} own triangles leave no room for the final embedded props")
    # ---- paint
    geo = [o for o in parts]
    ic.paint(geo, z_range=(FL, CE), gradient=(0.97, 1.02), jitter=0.0, seed=args.seed, ao_strength=0.5, ao_distance=0.6)
    for o in dec:
        if "Tint" in o.data.color_attributes: ic.flat_paint(o)
    # ---- lights (mood L4)
    bake.use_cycles('CPU', samples=64); bake.set_world((0, 0, 0), 0.0)
    lamps = []
    for mid, p, dead in pend:
        if dead: continue
        # polish round 2 (visual critic, major: "near-flat dark ... lamps are small dots with no pools on walls or
        # pillars"; hall_gantry measured L* 17..29, 97 % dark). The pendant's wide light was an inverse-square wash that
        # reached every wall equally (0.13 on the floor) and so lit nothing in particular. It is a POOL now: a soft reach
        # of WIDE_R metres (irradiance a bump that dies at that distance), three times as strong beside the lamp, so
        # the floor under each lamp and the faces of the piers beside it are lit and the walls between lamps stay dark.
        wide = ic.area_light(f"pend_{mid}", p, (p[0], FL, p[2]), WIDE_C, 0.8, 0.8, energy=200.0, spread_deg=150.0, euler=(0, 0, 0), radius=WIDE_R, power=WIDE_P)
        streak = ic.area_light(f"streak_{mid}", (p[0], p[1] - 0.05, p[2]), (p[0], FL, p[2]), CORE_C, 3.6, 0.5, energy=100.0, spread_deg=STREAK_SPREAD, euler=(0, 0, 0))
        lamps.append((wide, streak))
    w0, s0 = lamps[0]
    ref = next(p for mid, p, dead in pend if not dead)
    r1 = ic.set_reading(w0, (ref[0] + 1.8, FL, ref[2] + 1.8), (0, 1, 0), WIDE_T, group=[w0])
    r2 = ic.set_reading(s0, (ref[0], FL, ref[2]), (0, 1, 0), STREAK_T, group=[s0])
    for w, s in lamps: w.data.energy = w0.data.energy; s.data.energy = s0.data.energy
    print(f"CALIBRATED pendants: open floor 2.5 m off a lamp reads {r1:.2f} from it (target {WIDE_T}); the streak under it {r2:.2f} more (target {STREAK_T}); reach {WIDE_R} m")
    cy, cz, ri = ring
    rl = []
    NR = 30                                                             # pass 3: thirty lights, a continuous strip (ten drew ten scallops on the ribs beside the ring)
    for k in range(NR):
        ang = math.radians(-20 + 220 * k / (NR - 1))
        q = (XE - 0.85, cy + (ri - 0.3) * math.sin(ang), cz - (ri - 0.3) * math.cos(ang))
        rl.append(ic.point_light(f"ring_{k}", q, "#7CF2E2", 4.0, size=0.15, power=1.5))
    # pass 4: the probe stands on the wall BETWEEN the gate's head and the reveal (it stood in the gate opening, 3.5 m
    # from the nearest light, so the strip was scaled up until everything inside the ring clipped to white)
    r = ic.set_reading(rl[0], (XE - 0.05, FL + gate[2] + 0.9, cz), (-1, 0, 0), RING_T, group=rl)       # polish round 2: 0.9 -> 1.5 ("a brighter far wall": the ring is the brightest large shape of the room, through 38 m of fog)
    rr = float(ic.probe((XE - 0.6, cy + ri - 0.01, cz), (0, -1, 0), lights=rl).max())
    print(f"CALIBRATED ring strip: the wall inside the ring over the gate reads {r:.2f} (target {RING_T}); the reveal's crown reads {rr:.2f} (a lightmap stores at most 2.0)")
    cl = ic.area_light("cold_lamp", (cold[0], cold_top - 0.08, cold[2]), (cold[0], FL, cold[2]), "#7CF2E2", 0.84, 0.12, energy=40.0, spread_deg=150.0, euler=(0, 0, 0))
    r = ic.set_reading(cl, (cold[0] - 1.2, FL, cold[2] + 1.2), (0, 1, 0), 0.8)
    print(f"CALIBRATED cold bay lamp: the floor beside the Tamper reads {r:.2f} (target 0.8)")
    # polish round 3: the sodium practicals and the cage well's two lamps
    warm_l = []
    for name, pos, to, size, reach, probe_at, target in WARM:
        l = ic.area_light(f"warm_{name}", pos, to, SODIUM, size, 0.12, energy=40.0, spread_deg=170.0, radius=reach, power=1.4)
        r = ic.set_reading(l, probe_at, (0, 1, 0), target)
        print(f"CALIBRATED sodium practical '{name}': the floor in front of it reads {r:.2f} (target {target}); reach {reach} m")
        warm_l.append(l)
    cage_l = ic.area_light("cage_lamp_l", (26.85, FL + 3.15, -14.0), (24.0, FL, -14.0), "#CFFFF6", 1.2, 0.14, energy=30.0, spread_deg=170.0, radius=8.0, power=1.4)
    r = ic.set_reading(cage_l, (24.0, FL - 0.03, -14.0), (0, 1, 0), CAGE_LAMP_T)
    cage_w = ic.area_light("cage_wash_l", (21.0, FL + 3.3, -14.0), (27.0, FL + 1.3, -14.0), "#CFFFF6", 1.0, 0.12, energy=30.0, spread_deg=170.0, radius=5.5, power=1.4)
    r2 = ic.set_reading(cage_w, (26.97, FL + 1.6, -13.2), (-1, 0, 0), CAGE_WASH_T)
    print(f"CALIBRATED cage well: the floor under the work lamp reads {r:.2f} (target {CAGE_LAMP_T}), the lever's wall {r2:.2f} (target {CAGE_WASH_T})")
    # ---- unwrap + bake
    everything = parts + emb + dec
    ic.unwrap(everything + emi, LM)
    lm_objs = [o for o in everything if ic.is_lm(o)]
    vl_objs = [o for o in everything if ic.is_vl(o)]
    # two passes that add up: every lamp but the ring's over everything, then the ring's strip alone over what stands
    # within its reach, at twice the samples (pass 3: with forty lamps and no light tree the ring's own ten lights got a
    # quarter of the samples, and the brightest shape in the room baked blotchy)
    tb = time.perf_counter()
    others = [w for w, s in lamps] + [s for w, s in lamps] + [cl] + warm_l + [cage_l, cage_w]
    def near_ring(o):
        c = [layout.to_game(o.matrix_world @ Vector(b)) for b in o.bound_box]
        return max(p[0] for p in c) > XE - 9.0
    with bake.only_lights(others): la = ic.lm_pass(lm_objs, LM, AMBIENT, ao_distance=5.0, samples=None if ic.DRAFT else 192)     # fix pass 1: 64 spp left the south wall mottled under thirty lamps
    with bake.only_lights(rl): lb = ic.lm_pass([o for o in lm_objs if near_ring(o)], LM, None, samples=(24 if ic.DRAFT else 1024))     # polish round 5: 256 left the reveal and the ring's foot mottled once the strip no longer clipped them
    ic.save_lm(la + lb, LM); t_lm = time.perf_counter() - tb
    t_vl = ic.bake_vertex(vl_objs, AMBIENT, ao_distance=5.0)
    print(f"BAKED {LM} {t_lm:.1f}s, vertex light {sum(len(o.data.polygons) for o in vl_objs)} faces {t_vl:.1f}s; ambient at an open floor {AMBIENT.max():.2f}; build {time.perf_counter() - t0:.1f}s")
    # polish round 4 (visual critic, minor: "both lift rides are a wall of bright mesh squares"): the well's lining is seen
    # only through the cage's lattice, and the ring's strip in the gate's reveal lit all of it evenly: every opening of
    # the lattice was a bright square. The lining keeps a pool of light behind the lever (the work lamp's) and falls to
    # WELL_DARK of its baked light 3 m from it, so the lattice stands on a soft shape, not on a field.
    WELL_DARK, WELL_R = _env("KS_WELL_DARK", 0.10), _env("KS_WELL_R", 2.4)
    pool = Vector(layout.to_blender((26.9, FL + 2.0, -14.0)))
    for o in everything:
        if o.name not in ("cage_bay", "cage_dado", "cage_band"): continue
        c = vcol.get_colors(o, "Color"); p = vcol.corner_positions(o)
        d = np.linalg.norm(p - np.array(pool, dtype=np.float32)[None, :], axis=1)
        before = float(c[:, :3].max(axis=1).mean())
        c[:, :3] *= (WELL_DARK + (1.0 - WELL_DARK) * np.exp(-(d / WELL_R) ** 2))[:, None]
        print(f"NOTE cage well {o.name}: mean vertex level {before:.2f} -> {float(c[:, :3].max(axis=1).mean()):.2f}")
        vcol.set_colors(o, c, "Color")
    ic.weld_colors(everything)
    zone.assign_chunks(everything + emi, ASSET)
    merged = zone.merge_chunks(ASSET)
    print("CHUNKS " + ", ".join(f"{k} {v}" for k, v in sorted(ic.chunk_tris(merged).items())))
    dg = zone.lamp_set("diagram_lamps", [[q] for q in diag_lamps], colour=["aqua"] * 6 + ["aqua_core"], intensity=1.0)
    vc_ = vcol.get_colors(dg, "Color"); vc_[:24, 0] = 0.55; vcol.set_colors(dg, vc_, "Color")      # the six discs dim, the seventh full
    dg["emit_strength"] = 0.0
    ic.snap_positions(list(merged.values()) + [dg])
    ic.vertex_report(list(merged.values()))
    # dressing: crates and barrels stacked in the dead corners, never on the walkable floor's paths
    n = 0
    for (a, x, z, r) in (("prop_crate", -16.9, -26.9, 0.3), ("prop_crate", -16.95, -26.15, -0.2), ("prop_barrel", -15.9, -27.1, 0.0),
                         ("prop_crate", 18.9, -1.0, 0.1), ("prop_barrel", 19.2, -2.0, 0.0), ("prop_crate", 7.5, 6.2, 0.2)):
        n += 1; zone.dressing_empty('inst', n, a, loc=layout.to_blender((x, FL, z)), rot_z=r)
    export.export_asset(ASSET, args.out, blend=args.blend)


if __name__ == "__main__":
    scene.run(main)
