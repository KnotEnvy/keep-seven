"""env_tally_house: the civic water-share hall of Plenty (work order art-env-interior 4.1; ART_BIBLE 3.3, 7.3; LEVEL 3).

    node tools/build-assets.mjs --only env_tally_house          (KS_Q=draft in the environment: quick bake)

An adobe hall 14 x 22 m under a flat viga roof, shut four days: plank floor, the tally wall, the hearth, three high
shutter openings, the barred front doors, and ONE Pellam intrusion: the hatch frame, its latch cowl and the conduit
that carries `strip_hatch` down from the day-cell hanger. Frontier parts are off-square and jittered (seeded);
Pellam parts are exact. Every position comes from design/layout.json.

Bake, mood L2: ambient #3A2A30 x 0.25 x AO + one lantern (flame, soft reach 3.5 m) + the three shutter hairlines
(collimated slits along the true sun) + a warm bounce over each shutter. `lm_tally`: floor, walls to 3.2 m, the
tally wall, hearthstone, table top. `lm_tally_hatch`: the hatch frame's up-light alone, greyscale.
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

ASSET = "env_tally_house"
LM, LAYER = "lm_tally", "lm_tally_hatch"
X0, X1, Z0, Z1, H = -96.0, -82.0, -37.0, -15.0, 5.0          # interior: west, east, north, south faces; ceiling
LMH = 3.2                                                     # lightmap height on the walls
TRAVEL = (0.686, -0.242, 0.686)                               # the sun's light (layout meta.sun.travel)
AMBIENT = ic.ambient("#3A2A30", 0.25, gain=0.44)
RESERVE = {"prop_tally_table": 1, "prop_chair": 11, "prop_head_chair": 1, "prop_bench": 3, "prop_camp_ash": 0.5, "rd_ledger": 1, "rd_note": 0.25}

parts, emb, dec = [], [], []        # painted by this script / embedded props (own colours) / decals


def add(ob, into=None):
    (parts if into is None else into).append(ob); return ob


def wobble(rng_seed, amp=0.03):
    """Deterministic plaster undulation: a wall vertex moves along the wall normal by a value hashed from its place."""
    def f(normal, fixed):
        def disp(i, j, p):
            if fixed(i, j, p): return (0, 0, 0)
            r = random.Random(f"{rng_seed}:{p[0]:.2f}:{p[1]:.2f}:{p[2]:.2f}").uniform(-amp, amp)
            return (normal[0] * r, normal[1] * r, normal[2] * r)
        return disp
    return f


# ====================================================================================================== shell
def build_shell(rng):
    wins = [layout.marker(m)["pos"][2] for m in ("shutter_s", "shutter_m", "shutter_n")]            # -24, -30.5, -36.3
    win_edges = sorted(e for c in wins for e in (c - 0.6, c + 0.6))
    dx0, dx1 = -89.8, -88.2
    wob = wobble("ty")

    PLASTER = tuple(ic.mix("adobe", "board_dark", 0.38))                # four days shut, generations of lantern smoke
    BASE = tuple(ic.mix("adobe_base", "board_dark", 0.35))

    def adobe_cell(tag):
        def cell(i, j, uc, vc):
            rr = random.Random(f"pl:{tag}:{i}:{j}")
            if vc < 0.4: return {"tint": BASE, "row": 2.0, "vbase": 0.0}
            if vc < 2.0:                                               # plaster fallen from the lower metre: soft patches of the base colour
                def patch(p):
                    if p[1] > 1.3: return PLASTER
                    t = random.Random(f"pf:{tag}:{p[0]:.1f}:{p[1]:.1f}:{p[2]:.1f}").random()
                    return tuple(ic.mix(PLASTER, BASE, 0.85 if t < 0.3 else (0.35 if t < 0.5 else 0.0)))
                return {"tint": patch, "row": 2.0, "vbase": 0.0}
            return {"row": 3.0, "vbase": 2.0, "vrange": (0.32, 1.0), "tint": PLASTER}
        return cell

    def wall(tag, o, u, v, a, b, normal, extra_u=(), extra_v=(), skip=None, pinned=(), hi_lm=False):
        us = cuts(a, b, 1.05, extra_u)
        pin = set(round(x, 3) for x in list(extra_u) + [a, b] + list(pinned))
        def fixed(i, j, p): return round(us[i], 3) in pin
        lo = cuts(0.0, LMH, 0.9, [0.4, 2.0] + [e for e in extra_v if e < LMH])
        hi = cuts(LMH, H, 0.6, [e for e in extra_v if e > LMH])
        add(ic.surface(f"wall_{tag}_lo", o, u, v, us, lo, "m_frontier", "adobe", "adobe", cell=adobe_cell(tag), skip=skip, lm=True, disp=wob(normal, fixed)))
        add(ic.surface(f"wall_{tag}_hi", o, u, v, us, hi, "m_frontier", "adobe", "adobe", cell=adobe_cell(tag), skip=skip, lm=hi_lm, disp=wob(normal, fixed)))

    # west wall (x = -96, looks +x): u runs north (-z); three shutter openings 1.2 x 0.9 at 4.05..4.95
    wall("w", (X0, 0, 0), (0, 0, -1), (0, 1, 0), -Z1, -Z0, (1, 0, 0), extra_u=[-e for e in win_edges] + [32.8], extra_v=[4.05, 4.95],
         skip=lambda uc, vc: 4.05 < vc < 4.95 and any(abs(-uc - c) < 0.6 for c in wins), hi_lm=True)
    # (pass 3: the west and north walls are lightmapped to the roof: the hatch layer lights them 3 m from the frame, and a
    #  layer reaches lightmapped faces only: stopping at 3.2 m drew a hard line of aqua across both walls)
    # east wall (x = -82, looks -x): u runs south (+z); front-door recess z -29.2..-26.8 to 2.6; behind the hearth breast and the tally wrap
    wall("e", (X1, 0, 0), (0, 0, 1), (0, 1, 0), Z0, Z1, (-1, 0, 0), extra_u=[-29.2, -26.8, -20.0, -16.6], extra_v=[2.6],
         skip=lambda uc, vc: (vc < 2.6 and -29.2 < uc < -26.8) or (vc < 2.6 and -20.0 < uc < -16.6) or (0.4 < vc < LMH and uc > -16.6))
    # north wall (z = -37, looks +z)
    nich = [(-95.0, -94.3), (-88.2, -87.5)]                            # two wall niches (nichos), 0.24 m deep, between 1.1 and 1.95 m
    wall("n", (0, 0, Z0), (1, 0, 0), (0, 1, 0), X0, X1, (0, 0, 1), extra_u=[e for n in nich for e in n], extra_v=[1.1, 1.95],
         skip=lambda uc, vc: 1.1 < vc < 1.95 and any(a < uc < b for a, b in nich), hi_lm=True)
    for k, (a, b) in enumerate(nich):
        zr = Z0 - 0.24
        add(ic.from_faces(f"nicho_{k}", [[(a, 1.1, Z0), (b, 1.1, Z0), (b, 1.1, zr), (a, 1.1, zr)], [(a, 1.95, Z0), (a, 1.95, zr), (b - 0.0, 2.02, zr), (b, 1.95, Z0)],
                                         [(a, 1.1, Z0), (a, 1.1, zr), (a, 1.95, zr), (a, 1.95, Z0)], [(b, 1.1, Z0), (b, 1.95, Z0), (b, 2.02, zr), (b, 1.1, zr)],
                                         [(a, 1.1, zr), (b, 1.1, zr), (b, 2.02, zr), (a, 1.95, zr)]], "m_frontier", BASE, "adobe", toward=((a + b) / 2, 1.5, Z0 + 0.1), tess=0.5))
        add(ic.box(f"nicho_sill_{k}", (a - 0.06, 1.05, Z0 - 0.03), (b + 0.06, 1.1, Z0 + 0.07), "m_frontier", "board", "plank_a", bevel=0.01, drop="z-", tess=0.5))
    # south wall (z = -15, looks -z): u runs west (-x); the door 1.6 x 2.4; the tally board covers x -88..-82, y 0.4..3.2
    wall("s", (0, 0, Z1), (-1, 0, 0), (0, 1, 0), -X1, -X0, (0, 0, -1), extra_u=[-dx1, -dx0, 88.0], extra_v=[2.4],
         skip=lambda uc, vc: (vc < 2.4 and -dx1 < uc < -dx0) or (0.4 < vc < LMH and uc < 88.0))

    # fix pass 1 (critic round 1: "a bright light-leak line under the tally wall"). The line is not this zone's bake:
    # env_plenty_street's sand (chunk_st_yard, m_sand, sunlit) reaches 0.2 m inside this room along the whole south
    # wall, 0.01 to 0.14 m above the plank floor (z -15.2 .. -15.0; request filed with art-env-exterior). Until that
    # ground is clipped at the wall, the wall's foot is battered: the adobe swells out 0.26 m at the floor, as such
    # walls are built, and covers it. The door's own width is left open (sand drifted onto the sill is right there).
    zf = Z1 - 0.26; zt = Z1 + 0.04
    for k, (xa, xb) in enumerate(((X0, dx0 - 0.14), (dx1 + 0.14, X1))):
        bf = []
        xs_b = cuts(xa, xb, 1.5)
        for x0_, x1_ in zip(xs_b[:-1], xs_b[1:]):
            bf.append([(x0_, 0.0, zf), (x1_, 0.0, zf), (x1_, 0.16, zf), (x0_, 0.16, zf)])
            bf.append([(x0_, 0.16, zf), (x1_, 0.16, zf), (x1_, 0.34, zt), (x0_, 0.34, zt)])
        for x in (xa, xb):
            bf.append([(x, 0.0, zf), (x, 0.16, zf), (x, 0.34, zt), (x, 0.0, zt)])
        add(ic.from_faces(f"batter_s_{k}", bf, "m_frontier", BASE, "adobe", bevel=0.0, lm=True, away_from=((xa + xb) / 2, -3.0, Z1 + 2.0), mpr=4.0))

    # ---- plank floor: boards run north-south, 0.2 m, two to a grid row; butt joints staggered per row; the hatch frame is cut out
    fx0, fx1 = X0 - 0.1, X1 + 0.1
    zs = cuts(Z0 - 0.1, Z1 + 0.1, 3.2, [-34.3, -31.7])
    xs = cuts(fx0, fx1, 0.4, [-93.3, -88.7])
    rowinfo = {}
    def floor_cell(i, j, uc, vc):
        r = int(math.floor((vc - fx0) / 0.4 + 1e-6))
        if r not in rowinfo:
            rr = random.Random(f"floor{r}")
            joints = sorted(rr.sample(range(1, len(zs) - 1), 3))
            groups = [(rr.random(), rr.uniform(0.0, 1.0)) for _ in range(4)]
            rowinfo[r] = (joints, groups)
        joints, groups = rowinfo[r]
        g = sum(1 for q in joints if q <= i)
        uo, t = groups[g]
        return {"uoff": uo, "tint": tuple(ic.mix("board", "board_bleached", 0.15 + 0.55 * t)), "row": 0.4, "vbase": fx0}
    add(ic.surface("floor", (0, 0, 0), (0, 0, 1), (1, 0, 0), zs, xs, "m_frontier", ("plank_a", "plank_b"), "board", cell=floor_cell, lm=True,
                   skip=lambda uc, vc: -34.3 < uc < -31.7 and -93.3 < vc < -88.7))
    # two lifted boards (GDD: "two lifted"): proud at one end, a dark slot beneath
    for k, (bx, bz, lift, yaw) in enumerate(((-86.3, -31.4, 0.055, 1.2), (-93.9, -21.8, 0.04, -0.8))):
        bd = ic.box(f"lifted_board_{k}", (bx - 0.098, 0.004, bz - 0.85), (bx + 0.098, 0.034, bz + 0.85), "m_frontier", "board_bleached", "plank_b", bevel=0.008, drop="y-", tess=0.5)
        m = Matrix.Translation(B((bx, 0.004, bz + 0.85))) @ Matrix.Rotation(math.radians(yaw), 4, 'Z') @ Matrix.Rotation(math.atan2(lift, 1.7), 4, 'X') @ Matrix.Translation(-B((bx, 0.004, bz + 0.85)))
        ic.transform([bd], m); add(bd)
        add(ic.from_faces(f"lifted_slot_{k}", [[(bx - 0.1, 0.003, bz + 0.86), (bx + 0.1, 0.003, bz + 0.86), (bx + 0.1, 0.003, bz - 0.86), (bx - 0.1, 0.003, bz - 0.86)]],
                          "m_frontier", tuple(lin("board_dark") * 0.45), None, away_from=(bx, -5, bz)))
    # door threshold: a worn stone sill through the 1 m wall
    add(ic.from_faces("door_sill", [[(dx0, 0.0, Z1), (dx1, 0.0, Z1), (dx1, 0.0, Z1 + 1.0), (dx0, 0.0, Z1 + 1.0)]], "m_frontier", "adobe_base", "adobe", lm=True, away_from=(-89, -5, -14.5)))
    add(ic.from_faces("door_reveal", [[(dx0, 0, Z1), (dx0, 0, Z1 + 1.0), (dx0, 2.4, Z1 + 1.0), (dx0, 2.4, Z1)], [(dx1, 0, Z1), (dx1, 0, Z1 + 1.0), (dx1, 2.4, Z1 + 1.0), (dx1, 2.4, Z1)],
                                      [(dx0, 2.4, Z1), (dx1, 2.4, Z1), (dx1, 2.4, Z1 + 1.0), (dx0, 2.4, Z1 + 1.0)]], "m_frontier", "adobe", "adobe", toward=(-89, 1.2, -14.5), tess=0.6))
    # timber door frame, the lintel sagging 1.5 degrees
    for k, x in enumerate((dx0 - 0.07, dx1 + 0.07)):
        add(ic.box(f"door_post_{k}", (x - 0.07, 0, Z1 - 0.05), (x + 0.07, 2.42, Z1 + 0.09), "m_frontier", "board", "plank_a", bevel=0.012, drop="y- y+ z+", tess=0.6))
    lt = ic.box("door_lintel", (dx0 - 0.42, 2.4, Z1 - 0.07), (dx1 + 0.42, 2.62, Z1 + 0.1), "m_frontier", "board_dark", "plank_b", bevel=0.015, drop="z+", tess=0.6)
    ic.transform([lt], Matrix.Translation(B((-89, 2.5, Z1))) @ Matrix.Rotation(math.radians(1.5), 4, 'Y') @ Matrix.Translation(-B((-89, 2.5, Z1)))); add(lt)

    # ---- windows: deep reveals through the 1 m wall, splayed toward the sun (north and up); a timber sill; a latch seat at 3.5 m
    for k, c in enumerate(wins):
        zi0, zi1 = c - 0.6, c + 0.6                                    # inner opening (north, south edge)
        zo0, zo1 = max(c - 1.5, Z0 - 0.7), c + 0.72                    # outer opening
        yi0, yi1, yo0, yo1 = 4.05, 4.95, 3.97, 5.0
        xi, xo = X0, X0 - 1.0
        add(ic.from_faces(f"win_reveal_{k}", [
            [(xi, yi0, zi1), (xi, yi0, zi0), (xo, yo0, zo0), (xo, yo0, zo1)],            # sill
            [(xi, yi1, zi0), (xi, yi1, zi1), (xo, yo1, zo1), (xo, yo1, zo0)],            # head
            [(xi, yi0, zi0), (xi, yi1, zi0), (xo, yo1, zo0), (xo, yo0, zo0)],            # north jamb
            [(xi, yi1, zi1), (xi, yi0, zi1), (xo, yo0, zo1), (xo, yo1, zo1)],            # south jamb
        ], "m_frontier", "adobe", "adobe", toward=(xi - 0.4, 4.5, c - 0.1), tess=0.45))
        add(ic.box(f"win_sill_{k}", (X0 - 0.02, 3.985, c - 0.74), (X0 + 0.07, 4.05, c + 0.74), "m_frontier", "board_bleached", "plank_a", bevel=0.01, drop="x-", tess=0.5))
        # latch seat: a timber pad with an iron staple plate where the insulator hangs (ia_latch_* at 3.5 m)
        add(ic.box(f"latch_pad_{k}", (X0 - 0.01, 3.3, c - 0.16), (X0 + 0.045, 3.7, c + 0.16), "m_frontier", "board", "plank_b", bevel=0.01, drop="x-"))
        add(ic.box(f"latch_iron_{k}", (X0 + 0.04, 3.56, c - 0.05), (X0 + 0.058, 3.68, c + 0.05), "m_frontier", "rust", None, bevel=0.004, drop="x-"))

    # ---- roof: a board deck at 5.0 over round vigas (none over a blade's first metre), a squared tie-beam over the hatch
    xs_d = cuts(X0 - 0.1, X1 + 0.1, 0.4)
    zs_d = cuts(Z0 - 0.1, Z1 + 0.1, 2.3)
    add(ic.surface("deck", (0, H, 0), (1, 0, 0), (0, 0, 1), xs_d, zs_d, "m_frontier", ("plank_b", "plank_a"), "board_dark", row=0.4, vbase=X0 - 0.1, swap=True,
                   cell=lambda i, j, uc, vc: {"uoff": random.Random(f"deck{i}").random(), "tint": tuple(ic.mix("board_dark", "board", random.Random(f"dk{i}:{j // 2}").uniform(0.0, 0.45)))}))
    viga_z = [-34.8, -33.75, -31.75, -28.95, -27.85, -26.75, -25.65, -22.5, -21.4, -20.3, -19.2, -18.1, -17.0, -15.9]
    for k, z in enumerate(viga_z):
        r0 = rng.uniform(0.095, 0.11); r1 = r0 * rng.uniform(0.86, 0.95); dz = rng.uniform(-0.05, 0.05); y = H - r0 + 0.012
        a, b = ((X0 - 0.15, y, z), (X1 + 0.15, y - rng.uniform(0.0, 0.02), z + dz))
        if k % 2: a, b = b, a
        add(ic.cyl(f"viga_{k}", a, b, r0, 6, "m_frontier", ic.mix("board_dark", "board", rng.uniform(0.1, 0.5)), "plank_a", radius_b=r1, cap=False, tess=1.9,
                   keep=lambda n: n.z < 0.3, smooth=70))
        for e, x in enumerate((X0, X1)):                                # a carved corbel under each end
            s = 1 if e == 0 else -1
            add(ic.from_faces(f"corbel_{k}_{e}", _corbel(x, y - r0 + 0.01, z, s), "m_frontier", "board_dark", None, away_from=(x + s * 0.2, y - r0 - 0.05, z)))
    build_wall_timber(rng)
    tb = ic.box("tie_beam", (X0 - 0.12, 4.45, -32.925), (X1 + 0.12, 4.70, -32.675), "m_frontier", "board", "plank_a", bevel=0.02, drop="x- x+", tess=1.0)
    add(tb)
    for e, x in enumerate((X0, X1)):                                    # knee braces
        s = 1 if e == 0 else -1
        br = ic.box(f"tie_brace_{e}", (-0.07, -0.55, -0.08), (0.07, 0.55, 0.08), "m_frontier", "board_dark", "plank_b", bevel=0.012, tess=0.6)
        ic.transform([br], Matrix.Translation(B((x + s * 0.42, 4.08, -32.8))) @ Matrix.Rotation(math.radians(-42 * s), 4, 'Y'))
        add(br)


def build_wall_timber(rng):
    """Wall posts with carved zapatas under chosen vigas, a chair rail at 1.2 m, and the soft adobe corners."""
    posts = [(X0, 1, z) for z in (-33.75, -27.85, -21.4, -17.0)] + [(X1, -1, z) for z in (-34.8, -31.75, -25.65, -21.4)]
    for k, (x, s, z) in enumerate(posts):
        w = rng.uniform(0.085, 0.1); d = 0.17; top = 4.5
        f = []
        xa, xb = x + s * 0.0, x + s * d
        for (z0, z1, dx0, dx1) in ((z - w, z + w, xa, xb),):
            f += [[(dx1, 0, z0), (dx1, 0, z1), (dx1 - s * 0.012, top, z1 - 0.008), (dx1 - s * 0.012, top, z0 + 0.008)],       # face (tapers)
                  [(dx0, 0, z0), (dx1, 0, z0), (dx1 - s * 0.012, top, z0 + 0.008), (dx0, top, z0 + 0.008)],
                  [(dx0, 0, z1), (dx0, top, z1 - 0.008), (dx1 - s * 0.012, top, z1 - 0.008), (dx1, 0, z1)]]
        add(ic.from_faces(f"post_{k}", f, "m_frontier", "board", "plank_a", bevel=0.012, away_from=(x, 2.2, z), tess=0.75, along=(0, 0, 1)))
        # zapata: a stepped bracket 0.9 m long under the viga
        L = 0.46; h = 0.28
        zp = [[(xb + s * 0.02, top, z - L), (xb + s * 0.02, top, z + L), (xb + s * 0.02, top + h, z + L), (xb + s * 0.02, top + h, z - L)],
              [(xa, top, z - L * 0.55), (xb + s * 0.02, top, z - L * 0.55), (xb + s * 0.02, top, z + L * 0.55), (xa, top, z + L * 0.55)],
              [(xa, top + h * 0.45, z - L), (xb + s * 0.02, top + h * 0.45, z - L), (xb + s * 0.02, top, z - L * 0.55), (xa, top, z - L * 0.55)],
              [(xa, top, z + L * 0.55), (xb + s * 0.02, top, z + L * 0.55), (xb + s * 0.02, top + h * 0.45, z + L), (xa, top + h * 0.45, z + L)],
              [(xa, top + h * 0.45, z - L), (xa, top + h, z - L), (xb + s * 0.02, top + h, z - L), (xb + s * 0.02, top + h * 0.45, z - L)],
              [(xa, top + h * 0.45, z + L), (xb + s * 0.02, top + h * 0.45, z + L), (xb + s * 0.02, top + h, z + L), (xa, top + h, z + L)]]
        zf = [[q for q in face] for face in zp]
        zf[0] = [(xb + s * 0.02, top + h * 0.45, z - L), (xb + s * 0.02, top, z - L * 0.55), (xb + s * 0.02, top, z + L * 0.55), (xb + s * 0.02, top + h * 0.45, z + L),
                 (xb + s * 0.02, top + h, z + L), (xb + s * 0.02, top + h, z - L)]
        add(ic.from_faces(f"zapata_{k}", zf, "m_frontier", "board_dark", "plank_b", bevel=0.01, away_from=(x, top + h * 0.6, z), tess=0.6, along=(0, 1, 0)))
    # chair rail at 1.2 m: broken by the doors, the hearth, the tally wall and the hatch conduit
    runs = [("w", X0, 1, [(-36.95, -32.95), (-32.65, -15.05)]), ("e", X1, -1, [(-36.95, -29.5), (-26.5, -20.05)])]
    for tag, x, s, segs in runs:
        for k, (a, b) in enumerate(segs):
            add(ic.box(f"rail_{tag}_{k}", (min(x, x + s * 0.05), 1.16, a), (max(x, x + s * 0.05), 1.25, b), "m_frontier", "board", "plank_b", bevel=0.01, drop="x-" if s > 0 else "x+", tess=1.0))
    for k, (a, b, zf_, s) in enumerate(((X0 + 0.05, X1 - 0.05, Z0, 1), (X0 + 0.05, -89.95, Z1, -1))):
        cut = [(a, b)] if s < 0 else [(a, -95.05), (-94.25, -88.25), (-87.45, b)]
        for j, (u0, u1) in enumerate(cut):
            add(ic.box(f"rail_ns_{k}_{j}", (u0, 1.16, min(zf_, zf_ + s * 0.05)), (u1, 1.25, max(zf_, zf_ + s * 0.05)), "m_frontier", "board", "plank_b", bevel=0.01, drop="z-" if s > 0 else "z+", tess=1.0))
    # soft adobe corners: a 90 mm chamfer down each room corner
    c = 0.09
    for k, (x, z, sx, sz) in enumerate(((X0, Z0, 1, 1), (X1, Z0, -1, 1), (X0, Z1, 1, -1), (X1, Z1, -1, -1))):
        ys = cuts(0.0, H, 1.0)
        f = [[(x + sx * c, ys[i], z), (x, ys[i], z + sz * c), (x, ys[i + 1], z + sz * c), (x + sx * c, ys[i + 1], z)] for i in range(len(ys) - 1)]
        if k == 3: continue                                            # the tally board turns that corner
        add(ic.from_faces(f"corner_{k}", f, "m_frontier", tuple(ic.mix("adobe", "board_dark", 0.38)), "adobe", away_from=(x - sx * 0.1, 2.5, z - sz * 0.1)))


def _has(mid):
    try: layout.marker(mid); return True
    except KeyError: return False


def _corbel(x, y, z, s):
    """A stepped timber corbel under a viga end: seen from below and from the room side. s = +1 on the west wall."""
    w = 0.085; L = 0.5; d = 0.17
    p = lambda dx, dy, dz: (x + s * dx, y + dy, z + dz)
    return [
        [p(0, -d, -w), p(0, -d, w), p(L * 0.45, -d, w), p(L * 0.45, -d, -w)],                 # underside, inner step
        [p(L * 0.45, -d, -w), p(L * 0.45, -d, w), p(L, -d * 0.35, w), p(L, -d * 0.35, -w)],   # the sloped nose
        [p(L, -d * 0.35, -w), p(L, -d * 0.35, w), p(L, 0, w), p(L, 0, -w)],                   # end
        [p(0, -d, w), p(0, 0, w), p(L, 0, w), p(L, -d * 0.35, w), p(L * 0.45, -d, w)],        # south cheek
        [p(0, -d, -w), p(L * 0.45, -d, -w), p(L, -d * 0.35, -w), p(L, 0, -w), p(0, 0, -w)],   # north cheek
    ]


# ====================================================================================================== hearth, doors, tally wall
def build_hearth(rng):
    """The chimney breast on the east wall (layout ty_hearth: x -83.2..-82, z -20..-16.6, 2.6 high), its firebox,
    a timber mantel, the flue up to the roof and the raised hearthstone (ty_hearthstone, 0.3 m)."""
    bx, z0, z1, top = -83.2, -20.0, -16.6, 2.6
    fz0, fz1, fy0, fy1, fd = -19.05, -17.55, 0.3, 1.2, 0.8             # firebox opening and depth
    sh = 1.6; back = 0.25                                             # the breast is plumb to 1.6 m, then leans back to its shoulder
    us = cuts(z0, z1, 0.6, [fz0, fz1]); vs = cuts(0.0, sh, 0.65, [fy0, fy1, 0.4])
    front = ic.surface("hearth_front", (bx, 0, 0), (0, 0, 1), (0, 1, 0), us, vs, "m_frontier", "adobe", "adobe", row=2.6, vrange=(0.3, 1.0),
                       skip=lambda uc, vc: fy0 < vc < fy1 and fz0 < uc < fz1,
                       cell=lambda i, j, uc, vc: {"tint": tuple(ic.mix("adobe", "ash_dark", 0.55 * max(0.0, 1.0 - abs(uc - (fz0 + fz1) / 2) / 1.1) * max(0.0, 1.0 - abs(vc - 1.5) / 0.9)))} if vc > fy1 else ({"tint": "adobe_base"} if vc < 0.4 else None))
    add(front)
    sides = [
        [(bx, 0, z0), (bx, sh, z0), (bx + back, top, z0), (X1, top, z0), (X1, 0, z0)], [(bx, 0, z1), (X1, 0, z1), (X1, top, z1), (bx + back, top, z1), (bx, sh, z1)],
        [(bx + back, top, z0), (bx + back, top, z1), (X1, top, z1), (X1, top, z0)],                                                  # the shoulder
        [(bx, sh, z0), (bx, sh, z1), (bx + back, top, z1), (bx + back, top, z0)],                                                    # the lean
    ]
    add(ic.from_faces("hearth_sides", sides, "m_frontier", "adobe", "adobe", away_from=(-82.6, 1.0, -18.3), tess=0.6))
    # firebox: sooted, back wall leaning forward
    fb = [
        [(bx, fy0, fz0), (bx + fd, fy0, fz0 + 0.12), (bx + fd, fy1 - 0.1, fz0 + 0.12), (bx, fy1, fz0)],
        [(bx, fy0, fz1), (bx, fy1, fz1), (bx + fd, fy1 - 0.1, fz1 - 0.12), (bx + fd, fy0, fz1 - 0.12)],
        [(bx + fd, fy0, fz0 + 0.12), (bx + fd, fy0, fz1 - 0.12), (bx + fd, fy1 - 0.1, fz1 - 0.12), (bx + fd, fy1 - 0.1, fz0 + 0.12)],
        [(bx, fy1, fz0), (bx + fd, fy1 - 0.1, fz0 + 0.12), (bx + fd, fy1 - 0.1, fz1 - 0.12), (bx, fy1, fz1)],
        [(bx, fy0, fz0), (bx, fy0, fz1), (bx + fd, fy0, fz1 - 0.12), (bx + fd, fy0, fz0 + 0.12)],
    ]
    add(ic.from_faces("firebox", fb, "m_frontier", tuple(ic.mix("adobe_base", "ash_dark", 0.8)), None, toward=(bx + 0.3, 0.75, -18.3), tess=0.5))
    add(ic.box("mantel", (bx - 0.16, 1.24, -19.6), (bx + 0.04, 1.44, -17.0), "m_frontier", tuple(ic.mix("ash", "adobe_base", 0.5)), "adobe", bevel=0.03, drop="x+", tess=0.6, mpr=4.0))
    add(ic.box("mantel_shelf", (bx - 0.22, 1.56, -19.8), (bx + 0.04, 1.62, -16.8), "m_frontier", "board_dark", "plank_b", bevel=0.012, drop="x+", tess=0.7))
    # flue: narrower, tapering to the roof
    f = [(-82.78, -19.2, -17.4), (-82.5, -18.95, -17.65)]             # (x face, z0, z1) at 2.6 and at 5.0
    (xa, a0, a1), (xb, b0, b1) = f
    flue = [
        [(xa, top, a0), (xa, top, a1), (xb, H, b1), (xb, H, b0)],
        [(xa, top, a0), (xb, H, b0), (X1, H, b0), (X1, top, a0)], [(xa, top, a1), (X1, top, a1), (X1, H, b1), (xb, H, b1)],
    ]
    add(ic.from_faces("flue", flue, "m_frontier", "adobe", "adobe", away_from=(-82.3, 3.8, -18.3), tess=0.6))
    # hearthstone: three flags with open joints, 0.3 m high (the layout's platform)
    edges = [z0, -18.88, -17.71, z1]
    for k in range(3):
        st = ic.box(f"hearthstone_{k}", (-84.6 + rng.uniform(0, 0.015), 0.0, edges[k] + 0.012), (bx + 0.02, 0.3 - rng.uniform(0, 0.006), edges[k + 1] - 0.012), "m_frontier",
                    tuple(ic.mix("ash", "adobe_base", 0.35 + 0.2 * k)), "adobe", bevel=0.03, drop="y- x+", mpr=4.0)
        ic.lm_some(st, lambda p: p.normal.z > 0.9)
        mesh.tessellate_max_edge(st, 0.7)
        ic.LM_FACES.pop(st.name, None); ic.lm_some(st, lambda p: p.normal.z > 0.9)
        add(st)


def build_front_doors(rng):
    """East wall at z -28: the barred front doors, 2.4 x 2.6 m, in a shallow recess; a timber bar across both leaves."""
    z0, z1, top, xr = -29.2, -26.8, 2.6, X1 + 0.2
    add(ic.from_faces("fdoor_recess", [[(X1, 0, z0), (xr, 0, z0), (xr, top, z0), (X1, top, z0)], [(X1, 0, z1), (X1, top, z1), (xr, top, z1), (xr, 0, z1)],
                                       [(X1, top, z0), (xr, top, z0), (xr, top, z1), (X1, top, z1)]], "m_frontier", "adobe", "adobe", toward=(X1 + 0.1, 1.3, -28), tess=0.7))
    zs = cuts(z0, z1, 0.2); ys = cuts(0.0, top, 0.9)
    def cell(i, j, uc, vc):
        r = int((uc - z0) / 0.2 + 1e-6); rr = random.Random(f"fd{r}")
        return {"region": "plank_a" if r % 2 else "plank_b", "uoff": rr.random(), "tint": tuple(ic.mix("board", "board_bleached", rr.uniform(0.0, 0.6)))}
    leaves = ic.surface("fdoor_leaves", (xr - 0.03, 0, 0), (0, 0, 1), (0, 1, 0), zs, ys, "m_frontier", "plank_a", "board", row=0.2, vbase=z0, cell=cell, swap=True,
                        disp=lambda i, j, p: (random.Random(f"fdd{i}").uniform(-0.006, 0.006) if 0 < i < len(zs) - 1 and abs(zs[i] + 28.0) > 0.05 else 0.0, 0, 0))
    add(leaves)
    add(ic.box("fdoor_gap", (xr - 0.035, 0, -28.02), (xr - 0.02, top, -27.98), "m_frontier", tuple(lin("board_dark") * 0.4), None, bevel=0, drop="x+ y- y+ z- z+"))
    for k, y in enumerate((0.35, 1.9)):                                 # ledges
        for s, (a, b) in enumerate(((z0 + 0.06, -28.04), (-27.96, z1 - 0.06))):
            add(ic.box(f"fdoor_ledge_{k}_{s}", (xr - 0.075, y, a), (xr - 0.03, y + 0.14, b), "m_frontier", "board_dark", "plank_b", bevel=0.008, drop="x+", tess=0.6))
    add(ic.box("fdoor_lintel", (X1 - 0.06, top, z0 - 0.3), (xr, top + 0.24, z1 + 0.3), "m_frontier", "board_dark", "plank_a", bevel=0.015, drop="x+", tess=0.7))
    # the bar: a squared timber dropped into two iron brackets
    bar = ic.box("fdoor_bar", (xr - 0.2, 1.08, z0 - 0.12), (xr - 0.08, 1.24, z1 + 0.12), "m_frontier", "board", "plank_a", bevel=0.012, tess=0.6)
    ic.transform([bar], Matrix.Translation(B((xr - 0.14, 1.16, -28))) @ Matrix.Rotation(math.radians(0.8), 4, 'X') @ Matrix.Translation(-B((xr - 0.14, 1.16, -28)))); add(bar)
    for k, z in enumerate((z0 + 0.22, z1 - 0.22)):
        add(ic.box(f"fdoor_bracket_{k}", (xr - 0.225, 1.0, z - 0.035), (xr - 0.03, 1.27, z + 0.035), "m_frontier", "rust", "strap", bevel=0.006, drop="x+"))


def build_tally_wall():
    """The dark board on the south wall east of the door (x -88..-82, y 0.4..3.2), wrapping 1.6 m onto the east wall,
    and the chalk: one row a household (family mark, then bundles of five), one block a span of days, oldest on the
    east wrap, newest by the door. In the newest block, which is the 1.2 x 0.9 m patch the south blade lands on
    (prop_tally_wall.params.sunPatch), the last four rows are in a shaking hand, and the two below them are empty."""
    m = layout.marker("prop_tally_wall")["params"]
    (bx0, bx1), (by0, by1) = m["extent"]["x"], m["extent"]["y"]
    pc, ps = m["sunPatch"]["centre"], m["sunPatch"]["size"]
    zb = Z1 - 0.035
    dark = lambda t: tuple(ic.mix(lin("board_dark") * 0.75, "board_dark", t))
    def cell(i, j, uc, vc):
        rr = random.Random(f"tw{j}")
        return {"uoff": rr.random(), "tint": dark(rr.uniform(0.0, 1.0))}
    ys = cuts(by0, by1, 0.4)
    add(ic.surface("tally_board_s", (0, 0, zb), (-1, 0, 0), (0, 1, 0), cuts(-bx1, -bx0, 1.5), ys, "m_frontier", ("plank_a", "plank_b"), "board_dark", row=0.4, vbase=by0, cell=cell, lm=True))
    xb = X1 - 0.035
    add(ic.surface("tally_board_e", (xb, 0, 0), (0, 0, 1), (0, 1, 0), cuts(-16.6, Z1 - 0.035, 1.6), ys, "m_frontier", ("plank_a", "plank_b"), "board_dark", row=0.4, vbase=by0, cell=cell, lm=True))
    # frame: head and foot rails, the west stile, the end stile on the east wall
    add(ic.box("tally_rail_top", (bx0 - 0.05, by1 - 0.02, zb - 0.03), (bx1, by1 + 0.07, Z1), "m_frontier", "board", "plank_a", bevel=0.01, drop="z+ x+", tess=0.8))
    add(ic.box("tally_rail_foot", (bx0 - 0.05, by0 - 0.09, zb - 0.06), (bx1, by0 + 0.02, Z1), "m_frontier", "board", "plank_b", bevel=0.01, drop="z+ x+", tess=0.8))
    add(ic.box("tally_stile_w", (bx0 - 0.06, by0 - 0.09, zb - 0.03), (bx0 + 0.03, by1 + 0.07, Z1), "m_frontier", "board", "plank_a", bevel=0.01, drop="z+", tess=0.8))
    add(ic.box("tally_rail_top_e", (xb - 0.03, by1 - 0.02, -16.65), (X1, by1 + 0.07, Z1 - 0.03), "m_frontier", "board", "plank_a", bevel=0.01, drop="x+ z+", tess=0.8))
    add(ic.box("tally_rail_foot_e", (xb - 0.06, by0 - 0.09, -16.65), (X1, by0 + 0.02, Z1 - 0.03), "m_frontier", "board", "plank_b", bevel=0.01, drop="x+ z+", tess=0.8))
    # chalk. Rows: 0.225 m; rows 6..9 of the newest block are exactly the sun patch (y 0.877..1.777, x -87.6..-86.4)
    rh = ps[1] / 4.0; y_top0 = pc[1] + ps[1] / 2 + 6 * rh; px_w, px_e = pc[0] - ps[0] / 2, pc[0] + ps[0] / 2
    items = []
    zc = zb - 0.004
    def row_s(x_left, r, shaky, n_cells=2):
        """One household row on the south wall, read left (east, +x) to right (west, -x)."""
        yt = y_top0 - r * rh; y0, y1 = yt - rh + 0.02, yt - 0.015
        tone = tuple(lin("chalk") * (0.92 if not shaky else 1.0))
        items.append(([(x_left, y0, zc), (x_left - 0.19, y0, zc), (x_left - 0.19, y1, zc), (x_left, y1, zc)], "family_marks", r % 12, tone))
        rr = random.Random(f"tally{x_left:.2f}:{r}")
        for c in range(n_cells):
            xl = x_left - 0.24 - c * 0.46
            idx = 1 if shaky else (2 if (c == n_cells - 1 and rr.random() < 0.4) else 0)
            if shaky and c == n_cells - 1 and r >= 8: idx = 2
            items.append(([(xl, y0, zc), (xl - 0.42, y0, zc), (xl - 0.42, y1, zc), (xl, y1, zc)], "tally", idx, tone))
    for r in range(10): row_s(px_e - 0.02, r, shaky=r >= 6)             # the newest block: six neat rows, four shaky, then none
    for b in range(1, 4):                                               # older blocks, every household present
        for r in range(12): row_s(px_e - 0.02 + b * 1.42, r, False)
    xe = xb - 0.004                                                     # the wrap on the east wall: read left (north) to right (south)
    for r in range(12):
        yt = y_top0 - r * rh; y0, y1 = yt - rh + 0.02, yt - 0.015
        zl = -16.5
        items.append(([(xe, y0, zl), (xe, y0, zl + 0.19), (xe, y1, zl + 0.19), (xe, y1, zl)], "family_marks", r % 12))
        for c in range(2):
            z = zl + 0.24 + c * 0.46
            items.append(([(xe, y0, z), (xe, y0, z + 0.42), (xe, y1, z + 0.42), (xe, y1, z)], "tally", 0))
    # a ruled chalk line under the header row of each block
    for b in range(4):
        xl = px_e - 0.02 + b * 1.42; y = y_top0 + 0.03
        items.append(([(xl, y, zc), (xl - 1.16, y, zc), (xl - 1.16, y + 0.07, zc), (xl, y + 0.07, zc)], "tally", 3, tuple(lin("chalk") * 0.8)))
    add(ic.decals("tally_chalk", items, "chalk"), dec)
    # fix pass 1 (critic: the south shutter's hairline was a blobby smear: a 15 mm streak in 3 cm texels on a board of
    # albedo 0.04). The streak is geometry now: four 15 mm quads 3 mm off the board, the outline of the patch the blade
    # will fill, written directly as emissive-lit colour (COLOR_0 = display / 2; vcol.mark_vertex_lit), crisp at any
    # distance. The baked hairline lights stay as its soft warm halo.
    x0_, x1_, y0_, y1_ = px_w, px_e, pc[1] - ps[1] / 2, pc[1] + ps[1] / 2; t = 0.015; zh = zb - 0.007
    # (a shutter leaks unevenly: each side is three runs with a gap at the hinge or the bar, the head the widest)
    hq = []
    def hrun(xa, xb, ya, yb): hq.append([(xb, ya, zh), (xa, ya, zh), (xa, yb, zh), (xb, yb, zh)])
    W_, H_ = x1_ - x0_, y1_ - y0_
    for (fa, fb) in ((0.0, 0.3), (0.34, 0.71), (0.75, 1.0)):
        hrun(x0_ + W_ * fa, x0_ + W_ * fb, y1_ - t, y1_); hrun(x0_ + W_ * fa, x0_ + W_ * fb, y0_, y0_ + 0.01)
    for (fa, fb) in ((0.03, 0.22), (0.3, 0.68), (0.76, 0.97)):
        hrun(x0_, x0_ + 0.01, y0_ + H_ * fa, y0_ + H_ * fb); hrun(x1_ - 0.012, x1_, y0_ + H_ * fa, y0_ + H_ * fb)
    hl = ic.from_faces("tally_hairline", hq, "m_frontier", (0.33, 0.19, 0.085), None, away_from=((x0_ + x1_) / 2, pc[1], Z1 + 1.0), weld=False)
    hl["thin_ok"] = 6.0; hl["prelit"] = True
    add(hl)
    return (px_w, px_e, pc[1] - ps[1] / 2, pc[1] + ps[1] / 2)


# ====================================================================================================== the Pellam intrusion
def build_hatch_frame():
    """A ceramic frame 0.3 m wide, flush in the floor round the 4 x 2 m opening (x -93..-89, z -34..-32); the opening's
    corners are true 0.15 m radii; the lip goes down through the 0.3 m floor to the stair shaft."""
    h = layout.marker("ia_hatch"); cx, cz = h["pos"][0], h["pos"][2]; sx, sz = h["size"][0] / 2, h["size"][2] / 2
    x0, x1, z0, z1 = cx - sx, cx + sx, cz - sz, cz + sz
    inner = ic.rounded_rect(x0, z0, x1, z1, 0.15, 3)
    oc = [(x1 + 0.3, z1 + 0.3), (x0 - 0.3, z1 + 0.3), (x0 - 0.3, z0 - 0.3), (x1 + 0.3, z0 - 0.3)]
    outer = [oc[k // 4] for k in range(16)]
    y = 0.004
    top, lip = [], []
    n = len(inner)
    for i in range(n):
        j = (i + 1) % n
        top.append([(inner[i][0], y, inner[i][1]), (inner[j][0], y, inner[j][1]), (outer[j][0], y, outer[j][1]), (outer[i][0], y, outer[i][1])])
        lip.append([(inner[i][0], y, inner[i][1]), (inner[j][0], y, inner[j][1]), (inner[j][0], -0.3, inner[j][1]), (inner[i][0], -0.3, inner[i][1])])
    f = ic.from_faces("hatch_frame_top", top, "m_pellam", "enamel", None, away_from=(cx, -9, cz), lm=True)
    l = ic.from_faces("hatch_frame_lip", lip, "m_pellam", "steel", "steel", toward=(cx, -0.15, cz), tess=0.7, mpr=3.6)
    add(f); add(l)
    return (x0, x1, z0, z1)


def build_cowl():
    """The latch block and its cowl at the hatch's north-west corner (layout ty_latch_*): open to the NORTH only.
    The knot seats on a dark plate at (-92.6, 0.9, -34.35), facing north."""
    S = {s["id"]: s for s in layout.solids("tally_house")}
    def ext(sid):
        s = S[sid]; return ([s["pos"][i] - s["size"][i] / 2 for i in range(3)], [s["pos"][i] + s["size"][i] / 2 for i in range(3)])
    lo, hi = ext("ty_latch_cowl_back"); lo2, hi2 = ext("ty_latch_cowl_w"); lo3, hi3 = ext("ty_latch_cowl_hood")
    # one body: a tombstone outline (true 0.15 m radii at the two top corners) drawn through the whole depth, with the
    # latch cavity cut into its north face. The collision solids are its back wall, two cheeks and hood.
    x0, x1, top, r = lo[0], hi[0], hi[1], 0.15
    zs_, zn = hi[2], lo2[2]                                            # south face, north face
    ci0, ci1, ch = lo3[0], hi3[0], lo3[1]                              # cavity: between the cheeks, under the hood
    outline = [(x1, 0.0)] + [(x1 - r + r * math.cos(math.radians(a)), top - r + r * math.sin(math.radians(a))) for a in (0, 22.5, 45, 67.5, 90)] \
        + [(x0 + r + r * math.cos(math.radians(a)), top - r + r * math.sin(math.radians(a))) for a in (90, 112.5, 135, 157.5, 180)] + [(x0, 0.0)]
    f = [[(x, y, zs_) for x, y in outline]]
    for i in range(len(outline) - 1):
        (xa, ya), (xb, yb) = outline[i], outline[i + 1]
        f.append([(xa, ya, zs_), (xb, yb, zs_), (xb, yb, zn), (xa, ya, zn)])
    f.append([(x, y, zn) for x, y in outline] + [(ci0, 0.0, zn), (ci0, ch, zn), (ci1, ch, zn), (ci1, 0.0, zn)])
    f += [[(ci0, 0, zn), (ci0, 0, lo[2]), (ci0, ch, lo[2]), (ci0, ch, zn)], [(ci1, 0, zn), (ci1, ch, zn), (ci1, ch, lo[2]), (ci1, 0, lo[2])],
          [(ci0, ch, zn), (ci0, ch, lo[2]), (ci1, ch, lo[2]), (ci1, ch, zn)], [(ci0, 0, lo[2]), (ci1, 0, lo[2]), (ci1, ch, lo[2]), (ci0, ch, lo[2])]]
    body = ic.from_faces("cowl_body", f, "m_pellam", "enamel", None, bevel=0.02, recalc=True, tess=0.45, smooth=30)
    add(body)
    lo4, hi4 = ext("ty_latch_block")
    add(ic.box("latch_block", lo4, (hi4[0], hi4[1], hi4[2] + 0.01), "m_pellam", "steel", "steel", bevel=0.02, drop="y- z+", tess=0.5, mpr=3.6))
    k = layout.marker("knot_hatch_latch")["pos"]
    # the latch: a broad ochre hazard diagonal on the block (a moving part), two throw-bolts into the frame, bolt heads on the seat
    zf = lo4[2] - 0.003
    add(ic.from_faces("latch_hazard", [[(x, y, zf) for x, y in ic.diagonal_band(lo4[0] + 0.03, 0.03, hi4[0] - 0.03, hi4[1] - 0.03, 0.3)]], "m_pellam", "hazard", None, away_from=(k[0], 0.4, -34.2)))
    for e, x in enumerate((lo4[0] + 0.1, hi4[0] - 0.1)):
        add(ic.box(f"latch_bolt_{e}", (x - 0.04, 0.0, lo4[2] - 0.07), (x + 0.04, 0.22, lo4[2] + 0.0), "m_pellam", "steel_dark", None, bevel=0.01, drop="y- z+"))
        add(ic.cyl(f"seat_stud_{e}", (x, k[1] + 0.2, k[2] + 0.005), (x, k[1] + 0.2, k[2] - 0.03), 0.03, 6, "m_pellam", "steel", None))
        add(ic.cyl(f"seat_stud_b{e}", (x, k[1] - 0.14, k[2] + 0.005), (x, k[1] - 0.14, k[2] - 0.03), 0.03, 6, "m_pellam", "steel", None))
    add(ic.box("latch_seat", (k[0] - 0.27, hi4[1], k[2]), (k[0] + 0.27, k[1] + 0.3, hi4[2] + 0.01), "m_pellam", "steel_dark", None, bevel=0.02, drop="y- z+", tess=0.5))
    # kick plate (steel below 0.3 m) and the livery band at 1.2 m on the face the hall sees (south), and round the cheeks
    zs = hi[2] + 0.003
    kick = []
    for (a, b) in (((hi[0] + 0.003, zn + 0.02), (hi[0] + 0.003, hi[2] - 0.0)), ((hi[0], zs), (lo[0], zs)), ((lo[0] - 0.003, hi[2] - 0.0), (lo[0] - 0.003, zn + 0.02))):
        kick.append([(a[0], 0.0, a[1]), (b[0], 0.0, b[1]), (b[0], 0.3, b[1]), (a[0], 0.3, a[1])])
    add(ic.from_faces("cowl_kick", kick, "m_pellam", "steel", "steel", away_from=(k[0], 0.2, -34.25), mpr=3.6))
    # a louvred vent low on the south face, and the "hands off" pictogram with the unit number stencilled beside the plate
    lv = [([(k[0] - 0.62, 0.42, zs + 0.001), (k[0] - 0.18, 0.42, zs + 0.001), (k[0] - 0.18, 0.64, zs + 0.001), (k[0] - 0.62, 0.64, zs + 0.001)], "louvre", None, "steel_dark"),
          ([(k[0] + 0.36, 0.5, zs + 0.001), (k[0] + 0.52, 0.5, zs + 0.001), (k[0] + 0.52, 0.66, zs + 0.001), (k[0] + 0.36, 0.66, zs + 0.001)], "picto_misc", 2, "steel_dark")]
    dec.append(ic.decals("cowl_decals", lv, "steel_dark"))
    band = []
    for (a, b) in (((hi[0] + 0.003, zn + 0.02), (hi[0] + 0.003, hi[2] - 0.02)), ((hi[0] - 0.02, zs), (lo[0] + 0.02, zs)), ((lo[0] - 0.003, hi[2] - 0.02), (lo[0] - 0.003, zn + 0.02))):
        band.append([(a[0], 1.15, a[1]), (b[0], 1.15, b[1]), (b[0], 1.25, b[1]), (a[0], 1.25, a[1])])
    add(ic.from_faces("cowl_band", band, "m_pellam", "livery", None, away_from=(k[0], 1.2, -34.25)))
    plate(ASSET_NO, (k[0] + 0.3, 0.9, zs + 0.001), 180.0)


ASSET_NO = "4-031"


def plate(number, pos, facing_deg, name="plate"):
    """A cast maker's plate (brand.maker_plate) at GAME pos (its back centre), its face looking along layout rotY
    `facing_deg` + 180 (0 = the plate faces south, +z ... as an asset: front +Z)."""
    p = brand.maker_plate(number, name=f"{name}_{len(parts)}")
    m = Matrix.Translation(B(pos)) @ Matrix.Rotation(math.radians(facing_deg) + math.pi, 4, 'Z')
    for o in p.values():
        if o is None: continue
        o.matrix_world = m; mesh.apply_transform(o)
    zone.fold_flat(p["plate"], "m_pellam"); vcol.tint(p["plate"], "steel"); p["plate"]["lm"] = False
    add(p["plate"])
    if p["decals"] is not None: p["decals"]["lm"] = False; dec.append(p["decals"])


def build_conduit(frame):
    """The Pellam conduit: day-cell hanger -> along the tie-beam -> down the west wall at z -32.8 -> across the floor to
    the hatch frame. It carries `strip_hatch` (returned as lamp polygons) and, at 1.5 m, the pictogram plate."""
    z = -32.8; w = 0.06
    cell = layout.marker("day_cell")["pos"]; hx = cell[0] + 0.14
    yb = 4.45                                                          # the tie-beam's underside
    add(ic.box("conduit_beam", (X0 + 0.1, yb - 0.07, z - w), (hx + 0.1, yb, z + w), "m_pellam", "enamel", None, bevel=0.012, drop="y+ x-", tess=0.9))
    add(ic.box("conduit_wall", (X0, 0.07, z - w), (X0 + 0.1, yb, z + w), "m_pellam", "enamel", None, bevel=0.012, drop="x- y-", tess=0.7))
    xe = frame[0] - 0.3 - 0.2                                           # the run stops short of the frame and turns north to the latch cowl
    add(ic.box("conduit_floor", (X0, 0.0, z - w), (xe + w, 0.07, z + w), "m_pellam", "enamel", None, bevel=0.012, drop="y- x-", tess=0.7))
    add(ic.box("conduit_floor_n", (xe - w, 0.0, -34.3), (xe + w, 0.07, z - w), "m_pellam", "enamel", None, bevel=0.012, drop="y- z+", tess=0.7))
    add(ic.box("conduit_gland", (xe - 0.09, 0.0, -34.42), (frame[0] - 0.3, 0.16, -34.24), "m_pellam", "steel", None, bevel=0.012, drop="y-"))
    for k, y in enumerate((0.6, 2.4, 3.6)):                            # steel saddles
        add(ic.box(f"conduit_clamp_{k}", (X0, y, z - w - 0.03), (X0 + 0.115, y + 0.06, z + w + 0.03), "m_pellam", "steel", None, bevel=0.006, drop="x-"))
    # junction box with the pictogram plate at 1.5 m (prop_daycell_plate)
    pm = layout.marker("prop_daycell_plate")["pos"]
    add(ic.box("conduit_box", (X0, pm[1] - 0.2, z - 0.42), (X0 + 0.13, pm[1] + 0.2, z + 0.42), "m_pellam", "enamel", None, bevel=0.02, drop="x-", tess=0.5))
    add(ic.box("conduit_box_kick", (X0, pm[1] - 0.26, z - 0.36), (X0 + 0.11, pm[1] - 0.2, z + 0.36), "m_pellam", "steel", None, bevel=0.006, drop="x- y+"))
    xf = X0 + 0.134
    dec.append(ic.decals("picto_plate", [([(xf, pm[1] - 0.09, z + 0.36), (xf, pm[1] - 0.09, z - 0.36), (xf, pm[1] + 0.09, z - 0.36), (xf, pm[1] + 0.09, z + 0.36)], "picto_daycell", None)], "steel_dark"))
    # the drop-arm of the day-cell: a steel hanger from the beam with a yoke behind the disc (the disc is a prop)
    add(ic.box("hanger_arm", (hx - 0.03, cell[1] - 0.05, z + 0.11), (hx + 0.03, yb, z + 0.17), "m_pellam", "steel", "steel", bevel=0.008, drop="y+", tess=0.5, mpr=3.6))
    yoke = ic.box("hanger_yoke", (-0.16, -0.035, -0.035), (0.16, 0.035, 0.035), "m_pellam", "steel", None, bevel=0.008)
    ic.transform([yoke], Matrix.Translation(B((cell[0] + 0.06, cell[1], cell[2] + 0.08))) @ Matrix.Rotation(math.radians(-45), 4, 'Z')); add(yoke)
    add(ic.box("hanger_boss", (hx - 0.07, yb - 0.1, z + 0.07), (hx + 0.07, yb, z + 0.21), "m_pellam", "steel_dark", None, bevel=0.01, drop="y+"))
    # strip_hatch: one lamp of three runs, 5 cm wide, on the conduit's visible faces (off until hatch_powered)
    s = 0.025; e = 0.002
    under = [(X0 + 0.12, yb - 0.07 - e, z - s), (hx + 0.06, yb - 0.07 - e, z - s), (hx + 0.06, yb - 0.07 - e, z + s), (X0 + 0.12, yb - 0.07 - e, z + s)]
    wall = [(X0 + 0.1 + e, 0.09, z + s), (X0 + 0.1 + e, 0.09, z - s), (X0 + 0.1 + e, yb - 0.09, z - s), (X0 + 0.1 + e, yb - 0.09, z + s)]
    floor = [(X0 + 0.12, 0.07 + e, z + s), (xe + s, 0.07 + e, z + s), (xe + s, 0.07 + e, z - s), (X0 + 0.12, 0.07 + e, z - s)]
    north = [(xe - s, 0.07 + e, z - s), (xe + s, 0.07 + e, z - s), (xe + s, 0.07 + e, -34.22), (xe - s, 0.07 + e, -34.22)]
    return [[B(p) for p in poly] for poly in (under, wall, floor, north)]


def build_table_end(rng):
    """The dragged fifth leaf of the tally table (layout ty_table_end: 2.6 x 1.4 m, 0.8 high, turned 8 degrees): zone
    geometry in the table's plank style: boards 0.2 m with 8 mm bevels on two trestles."""
    s = layout.solid("ty_table_end"); cx, cz = s["pos"][0], s["pos"][2]; L, Wd = s["size"][0], s["size"][2]; top = s["pos"][1] + s["size"][1] / 2
    objs = []
    n = 7; bw = Wd / n
    for k in range(n):
        z = cz - Wd / 2 + bw * (k + 0.5); dl = rng.uniform(0.0, 0.02); dy = rng.uniform(-0.003, 0.003)
        bd = ic.box(f"leaf_board_{k}", (cx - L / 2 + dl, top - 0.04 + dy, z - bw / 2 + 0.003), (cx + L / 2 - rng.uniform(0, 0.02), top + dy, z + bw / 2 - 0.003), "m_frontier",
                    "board_bleached" if k % 3 else "board", "plank_a" if k % 2 else "plank_b", bevel=0.008, drop="y-", tess=0.7)
        objs.append(bd)
    for k, x in enumerate((cx - 0.95, cx + 0.95)):                     # trestles: a cap rail on two splayed legs and a stretcher
        objs.append(ic.box(f"leaf_cap_{k}", (x - 0.045, top - 0.12, cz - Wd / 2 + 0.08), (x + 0.045, top - 0.04, cz + Wd / 2 - 0.08), "m_frontier", "board_dark", "plank_b", bevel=0.008, drop="y+", tess=0.7))
        for e, sgn in enumerate((-1, 1)):
            leg = ic.box(f"leaf_leg_{k}_{e}", (-0.04, 0.0, -0.035), (0.04, top - 0.11, 0.035), "m_frontier", "board", "plank_a", bevel=0.008, drop="y- y+", tess=0.6)
            ic.transform([leg], Matrix.Translation(B((x, 0, cz + sgn * (Wd / 2 - 0.2)))) @ Matrix.Rotation(math.radians(8 * sgn), 4, 'X'))
            objs.append(leg)
        objs.append(ic.box(f"leaf_stretcher_{k}", (x - 0.02, 0.22, cz - Wd / 2 + 0.2), (x + 0.02, 0.3, cz + Wd / 2 - 0.2), "m_frontier", "board", "plank_b", bevel=0.006, tess=0.7))
    objs.append(ic.box("leaf_rail", (cx - 0.95, 0.5, cz - 0.03), (cx + 0.95, 0.58, cz + 0.03), "m_frontier", "board", "plank_a", bevel=0.008, tess=0.7))
    ic.transform(objs, ic.rot_about((cx, 0, cz), s.get("rotY", 0)))
    for o in objs: add(o)


# ====================================================================================================== props
def embed():
    def put(asset, node, marker=None, pos=None, rot=0.0):
        if marker is not None: loc, rz = layout.placement(marker)
        else: loc, rz = layout.to_blender(pos), math.radians(rot) + math.pi
        obs = zone.embed_prop(asset, node=node, location=loc, rot_z=rz, material_name="m_frontier", lightmap=LM)
        for o in obs:
            mesh.tessellate_max_edge(o, 0.75); o["lm"] = False
        emb.extend(obs); return obs
    t = layout.solid("ty_table")
    table = put("prop_tally_table", None, pos=(t["pos"][0], 0.0, t["pos"][2]), rot=180.0)
    for o in table: ic.lm_some(o, lambda p: p.normal.z > 0.9 and p.center.z > 0.6 and p.area > 0.02)     # the table top is lightmapped
    seats = layout.marker("prop_tally_seated")["params"]["seats"] + [{"pos": layout.marker(m)["pos"], "rotY": layout.marker(m)["rotY"]} for m in ("sp_tally_riser_w", "sp_tally_riser_e")]
    for s in seats: put("prop_chair", None, marker={"pos": s["pos"], "rotY": s["rotY"]})
    put("prop_head_chair", None, marker="prop_head_chair")
    put("rd_ledger", None, marker="rd_ledger")
    put("rd_note", "note_hearth", marker="rd_note_hearth")
    put("prop_camp_ash", "ash_cold", pos=(-82.78, 0.3, -18.3), rot=90.0)
    # three benches stacked against the barred doors: one on the floor, one on top of it, one tipped against them
    b1 = put("prop_bench", None, pos=(-82.36, 0.0, -28.0), rot=90.0)
    b2 = put("prop_bench", None, pos=(-82.36, 0.455, -27.9), rot=90.0)
    ic.transform(b2, Matrix.Translation(B((-82.36, 0.455, -27.9))) @ Matrix.Rotation(math.radians(4), 4, 'Z') @ Matrix.Translation(-B((-82.36, 0.455, -27.9))))
    b3 = put("prop_bench", None, pos=(-82.95, 0.0, -28.1), rot=90.0)
    piv = B((-82.95, 0.0, -28.1))
    ic.transform(b3, Matrix.Translation(piv + Vector((0.12, 0, 0.12))) @ Matrix.Rotation(math.radians(-58), 4, 'Y') @ Matrix.Translation(-piv))


def dressing():
    n = [0]
    def inst(asset, node, pos, rot=0.0):
        n[0] += 1; zone.dressing_empty('inst', n[0], asset, node=node, loc=layout.to_blender(pos), rot_z=math.radians(rot))
    lan = layout.marker("light_tally_lantern")["pos"]
    inst("prop_lantern", "lantern_lit", (lan[0], 0.8 + 0.34, lan[2]))
    for k, (x, z, r) in enumerate(((-95.55, -16.0, 20), (-95.5, -17.1, -35), (-94.9, -15.5, 80), (-82.5, -36.4, 10), (-83.4, -36.55, 140))):
        inst("prop_sack", None, (x, 0.0, z), r)
    for k, (x, y, z) in enumerate(((-88.75, 0.8, -19.7), (-89.3, 0.8, -22.6), (-83.5, 0.3, -17.0), (-95.4, 0.0, -18.0), (-84.9, 0.8, -35.9))):
        inst("prop_bottle", "bottle_a", (x, y, z), 37 * k)


# ====================================================================================================== light
def lights(patch):
    """The practicals of mood L2, calibrated on a white probe (ART_BIBLE 3: bake-output targets, not magic numbers)."""
    lan = layout.marker("light_tally_lantern"); lp = lan["pos"]; R = lan["params"]["radius"]
    lantern = ic.point_light("lantern", (lp[0], lp[1] + 0.08, lp[2]), "#FF9433", R + 2.5, size=0.06, power=2.0)
    r = ic.set_reading(lantern, (lp[0], 1.2, lp[2] + 1.3), (0, 0, -1), 1.5)
    print(f"CALIBRATED lantern: a face 1.3 m off, turned to it, reads {r:.3f} (target 1.5); soft reach {R + 2.5} m (half strength near {R} m)")
    # fix pass 1 (critic round 1: "no pool of lantern light on the room"). The flame stands 0.23 m over a table 1.4 m
    # wide: everything on the floor within 4 m lies in the table's own shadow, so the art bible's "baked radius 3.5 m,
    # falloff soft" never reached the floor. The pool is art-directed: a second soft source 2.6 m up over the flame
    # (the light a lantern throws off a low ceiling), reaching the same 3.5 m, calibrated on the floor beside the table.
    pool = ic.area_light("lantern_pool", (lp[0], 2.6, lp[2]), (lp[0], 0.0, lp[2]), "#FF9433", 0.5, 0.5, energy=50.0, spread_deg=160.0, radius=R + 1.3, power=1.5, euler=(0, 0, 0))
    rp = ic.set_reading(pool, (lp[0] + 1.6, 0.0, lp[2] + 1.2), (0, 1, 0), 0.8)
    print(f"CALIBRATED lantern pool: the floor 2 m from the flame reads {rp:.3f} (target 0.8); gone {R + 1.3} m out")
    hair = []
    for sid in ("shutter_s", "shutter_m", "shutter_n"):
        w = layout.marker(sid)["pos"]; x = X0 + 0.03
        t = Vector(TRAVEL)
        for k, (dy, dz, su, sv) in enumerate(((0.45, 0, 1.2, 0.02), (-0.45, 0, 1.2, 0.02), (0, -0.6, 0.02, 0.9), (0, 0.6, 0.02, 0.9))):
            p = (x, w[1] + dy, w[2] + dz)
            L = ic.area_light(f"hair_{sid}_{k}", p, (p[0] + t.x, p[1] + t.y, p[2] + t.z), "#FFD09A", su, sv, energy=40.0, spread_deg=1.0)
            hair.append(L)
    # one reading for all twelve slits: the south blade's streak on the tally wall
    px = (patch[0] + patch[1]) / 2
    top_y = patch[3]
    r = ic.set_reading(hair[0], (px, top_y, Z1 - 0.036), (0, 0, -1), 0.9, group=hair)
    print(f"CALIBRATED hairlines: the streak on the tally wall reads {r:.3f} (target 0.9)")
    warm = []
    for sid in ("shutter_s", "shutter_m", "shutter_n"):
        w = layout.marker(sid)["pos"]
        warm.append(ic.point_light(f"bounce_{sid}", (X0 + 0.35, 4.55, w[2] + 0.25), "#FFD09A", 2.6, size=0.3))
    r = ic.set_reading(warm[0], (X0 + 0.9, H, -23.6), (0, -1, 0), 0.22, group=[warm[0]])
    for o in warm[1:]: o.data.energy = warm[0].data.energy
    print(f"CALIBRATED shutter bounce: the deck over the south shutter reads {r:.3f} (target 0.22)")
    # the hatch up-light (layer): the frame glows; a hood at 6 m, 1.2 m up must read #4A7F86 when tinted aqua at weight 1
    hm = layout.marker("light_tally_hatch")["pos"]
    hatch = ic.area_light("hatch_glow", (hm[0], 0.06, hm[2]), (hm[0], 3.0, hm[2]), (1, 1, 1), 4.4, 2.4, energy=200.0, spread_deg=180.0, radius=10.5, power=1.6, euler=(math.pi, 0, 0))
    aqua, linen, want = lin("#7CF2E2"), lin("linen"), lin("#4A7F86")
    need = float(np.median(want / (aqua * linen)))                     # the light a linen hood must receive
    hatch.hide_render = False
    r = ic.set_reading(hatch, (hm[0], 1.2, hm[2] + 6.0), (0, -0.35, -1), need)
    shown = aqua * linen * r
    print(f"CALIBRATED hatch layer: a hood 6 m south at 1.2 m receives {r:.3f} (need {need:.3f}); linen x aqua x that = {manifest_hex(shown)} (target #4A7F86)")
    hatch.hide_render = True
    return lantern, hair, warm, hatch


def manifest_hex(c):
    s = [int(round(255 * (12.92 * x if x <= 0.0031308 else 1.055 * x ** (1 / 2.4) - 0.055))) for x in np.clip(c, 0, 1)]
    return "#%02X%02X%02X" % tuple(s)


# ====================================================================================================== main
def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    rng = scene.rng(args.seed)
    t0 = time.perf_counter()
    build_shell(rng); build_hearth(rng); build_front_doors(rng)
    patch = build_tally_wall()
    frame = build_hatch_frame(); build_cowl()
    strip_polys = build_conduit(frame)
    build_table_end(rng)
    embed()
    own = ic.tris(parts) + ic.tris(dec)
    reserve = sum(int(manifest.asset(k)["triBudget"] * n) for k, n in RESERVE.items())
    print(f"TRIS own {own} + reserve for final embedded props {reserve} = {own + reserve} / {manifest.asset(ASSET)['triBudget']} (embedded now: {ic.tris(emb)})")
    if own + reserve > manifest.asset(ASSET)["triBudget"]: raise RuntimeError(f"{ASSET}: {own} own triangles leave no room for the final embedded props ({reserve})")
    strip = zone.lamp_set("strip_hatch", [strip_polys], colour="aqua", intensity=1.0, flicker_group=1.0)
    strip["emit_strength"] = 0.0
    # ---- paint
    pell = [o for o in parts if material.names(o) == ["m_pellam"]]
    fron = [o for o in parts if o not in pell]
    ic.paint(fron, z_range=(0.0, H), gradient=(1.0, 0.5), jitter=0.0, seed=args.seed, ao_strength=0.55, ao_distance=0.5)
    ic.paint(pell, z_range=(0.0, H), gradient=(0.94, 1.03), jitter=0.0, seed=args.seed, ao_strength=0.55, ao_distance=0.4)
    for o in dec:
        if "Tint" in o.data.color_attributes: ic.flat_paint(o)
    # ---- light
    bake.use_cycles('CPU', samples=64)
    bake.set_world((0, 0, 0), 0.0)
    lantern, hair, warm, hatch = lights(patch)
    # the share cloth hangs square across the north blade until it is shot down: the north hairline stops there
    cm = layout.marker("prop_share_cloth"); cs = cm["params"]["size"]
    cloth = mesh.box("_cloth_blocker", (cs[0], 0.02, cs[1]), (0, 0, 0)); cloth.location = B(cm["pos"]); cloth.rotation_euler = (0, 0, math.radians(cm["rotY"]))
    everything = parts + emb + dec
    ic.unwrap(everything, LM)
    lm_objs = [o for o in everything if ic.is_lm(o)]
    prelit = [o for o in everything if o.get("prelit")]                  # the hairline quads: colour written by hand, not baked
    vl_objs = [o for o in everything if ic.is_vl(o) and o not in prelit]
    for o in prelit:
        o.hide_render = True; ic.flat_paint(o); vcol.mark_vertex_lit(o)
    light, t_lm = ic.bake_lightmap(lm_objs, LM, AMBIENT, ao_distance=2.5, samples=None if ic.DRAFT else 128)
    hatch.hide_render = False
    _, t_layer = ic.bake_layer(lm_objs, LAYER, [hatch])
    hatch.hide_render = True
    t_vl = ic.bake_vertex(vl_objs, AMBIENT, ao_distance=2.5)
    for o in prelit: o.hide_render = False
    print(f"BAKED {LM} {t_lm:.1f}s, layer {t_layer:.1f}s, vertex light {sum(len(o.data.polygons) for o in vl_objs)} faces {t_vl:.1f}s; open floor ambient reads {AMBIENT.max():.3f} "
          f"({manifest_hex(AMBIENT)} x albedo); build {time.perf_counter() - t0:.1f}s")
    ic.remove([cloth])
    ic.weld_colors(everything)
    ic.vertex_report(everything)
    # ---- chunks
    zone.assign_chunks(everything, ASSET)
    merged = zone.merge_chunks(ASSET)
    print("CHUNKS " + ", ".join(f"{k} {v}" for k, v in sorted(ic.chunk_tris(merged).items())))
    ic.snap_positions(list(merged.values()) + [strip])
    dressing()
    export.export_asset(ASSET, args.out, blend=args.blend)


if __name__ == "__main__":
    scene.run(main)
