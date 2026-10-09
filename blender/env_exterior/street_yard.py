"""street_yard: the pump yard of env_plenty_street (docs/workorders/art-env-exterior.md 4.2): yard ground and walls, the
ruined well-house round the celadon drum, the wind-pump derrick with its rotor and tail (drawn nodes), the boarded
tank on its stilts with deck and ramp, the tank shed, three wall stubs, the Tally House's south front, the embedded
props, the dressing. The drum, derrick and tank are forced into chunk_st_works (the skyline seen down the street)."""
import math, random
import bpy
from mathutils import Matrix, Vector
from lib import layout, manifest, brand, zone as zonelib, bake, vcol, uv as uvl, export
from lib.scene import link
import ext_kit as kit
import ext_rock as rock
import ext_frontier as fr
from ext_kit import Part, lin, mix, mul, clamp, smooth, fbm, vnoise, row_uv, flat_uv, sand_uv, FT, PT

Z = "street"
ZID = "plenty_street"
LM = "lm_surface"
SOL = {s["id"]: s for s in layout.solids(ZID)}
WORKS = "chunk_st_works"
DRUM = SOL["yd_drum"]
C = (DRUM["pos"][0], DRUM["pos"][2]); R = DRUM["size"][0] / 2; DH = DRUM["size"][1]
PELLAM_PAINT = None
NSEG = 42                                   # 21 panels of 1.197 m round the drum, two segments each
DOOR_T = 2.4 / R / 2                        # half the door's angle (2.4 m of arc)


def dpt(theta, y, r=R):
    return (C[0] + math.cos(theta) * r, y, C[1] + math.sin(theta) * r)


# ====================================================================== ground, walls
def build_ground(S):
    p = Part("yd_ground", Z, smooth=60)
    ch = kit.chart("yd_ground", 1.0)
    xs = fr.breaks(-111.2, -79.5, 2.0); zs = fr.breaks(-15.0, 15.2, 2.0)      # integration: the sand stops at the Tally House inner wall face (it ran 0.2 m into the room)
    vid = {}

    def h(x, z):
        if x > -79.9: return 0.0
        y = 0.035 * fbm(x / 5.0, z / 5.0, 21, 2)
        d = min(x + 110.0, 14.0 - z, z + 14.0)
        return y + 0.12 * (1 - clamp(d / 1.6)) ** 2

    def v(i, j):
        if (i, j) not in vid:
            x, z = xs[i], zs[j]
            vid[(i, j)] = (p.vert((x, h(x, z), z)), (x, h(x, z), z))
        return vid[(i, j)]
    for i in range(len(xs) - 1):
        for j in range(len(zs) - 1):
            q = [v(i, j), v(i, j + 1), v(i + 1, j + 1), v(i + 1, j)]
            pts = [a[1] for a in q]
            cc = [mul(mix(lin("sand"), lin("sand_pale"), clamp(0.3 + 0.5 * fbm(a[0] / 7.0, a[2] / 7.0, 22, 2))), 0.93 if math.hypot(a[0] - C[0], a[2] - C[1]) < R + 2.5 else 1.0) for a in pts]
            p.face([a[0] for a in q], "m_sand", [sand_uv(a) for a in pts], cc, ch, [(a[0], a[2]) for a in pts], final=True)
    return [p]


def build_walls(S):
    lm = Part("yd_walls_lm", Z, paint=fr.paint(0.0, jitter=0.03)); vl = Part("yd_walls_vl", Z, paint=fr.paint(0.0))
    mask = Part("yd_marks", Z)
    rng = random.Random(151)
    # the wall's top sags between its buttresses; on each side one run has shed its capstones and a course or two of brick
    GAPS = {3: (17.5, 20.2), 5: (19.0, 21.5), 7: (5.2, 7.4)}
    def top3(seed):
        g = GAPS[seed]
        return lambda u: (2.86 + 0.05 * fbm(u / 2.2, seed * 1.3, seed, 2) - 0.1 * math.sin(math.pi * ((u - 3.0) / 6.0 % 1.0)) ** 2
                          - 0.62 * smooth((u - g[0] + 0.3) / 0.8) * smooth((g[1] + 0.3 - u) / 0.8) * (0.7 + 0.3 * vnoise(u * 1.4, 0.3, seed)))
    # west, south, north-west: 3 m adobe, capped with flat stones, a buttress every 6 m
    fw = fr.adobe_wall((lm, vl), (-110.3, -14.6), (-110.3, 14.6), 2.9, 0.6, "yd_wall_w", top_fn=top3(3), cap=True, seed=101, density=1.0, sides="l", ends="", rng=rng, cap_gaps=[(GAPS[3][0] - 0.4, GAPS[3][1] + 0.4)], step=1.1, fallen=1.0)
    fs = fr.adobe_wall((lm, vl), (-110.6, 14.3), (-79.4, 14.3), 2.9, 0.6, "yd_wall_s", top_fn=top3(5), cap=True, seed=103, density=1.0, sides="l", ends="", rng=rng,
                       holes=[(9.2, 11.6, 0.0, 2.9)], cap_gaps=[(GAPS[5][0] - 0.4, GAPS[5][1] + 0.4)], step=1.1, fallen=1.0)
    fn = fr.adobe_wall((lm, vl), (-110.6, -14.3), (-96.9, -14.3), 2.9, 0.6, "yd_wall_n", top_fn=top3(7), cap=True, seed=105, density=1.0, sides="r", ends="", rng=rng, cap_gaps=[(GAPS[7][0] - 0.4, GAPS[7][1] + 0.4)], step=1.1, fallen=1.0)
    for (F, L, side) in ((fw, 29.2, -1), (fs, 31.2, -1), (fn, 13.7, 1)):
        u = 3.0
        while u < L - 2.0:
            if not (F is fs and 8.5 < u < 12.4):
                w0 = side * 0.3
                for (y0, y1, a0, a1) in ((0.0, 1.3, 0.34, 0.24), (1.3, 2.45, 0.24, 0.1)):
                    pts = [F.p(u - 0.3, y0, w0), F.p(u + 0.3, y0, w0), F.p(u + 0.3, y0, w0 + side * a0), F.p(u - 0.3, y0, w0 + side * a0),
                           F.p(u - 0.26, y1, w0), F.p(u + 0.26, y1, w0), F.p(u + 0.26, y1, w0 + side * a1), F.p(u - 0.26, y1, w0 + side * a1)]
                    quads = [(3, 2, 6, 7), (0, 3, 7, 4), (2, 1, 5, 6)] if side > 0 else [(2, 3, 7, 6), (3, 0, 4, 7), (1, 2, 6, 5)]
                    for q in quads + ([(7, 6, 5, 4)] if (y1 > 2 and side > 0) else ([(4, 5, 6, 7)] if y1 > 2 else [])):
                        vl.poly([pts[k] for k in q], "m_frontier", [row_uv(FT, "adobe", pts[k][0] * 0.5 + pts[k][2] * 0.5, fr.adobe_v(pts[k][1])) for k in q],
                                [fr.adobe_colour(pts[k][1], u, 7, 1.0) for k in q])
            u += 6.0
    # what came off the walls lies at their feet; sand banked in the lee of every buttress
    rub = Part("yd_wall_rubble", Z); sd = Part("yd_wall_sd", Z)
    for (F, side, seed, L) in ((fw, -1, 3, 29.2), (fs, -1, 5, 31.2), (fn, 1, 7, 13.7)):
        g = GAPS[seed]
        fr.fallen_stones(rub, F, g[0] - 0.3, g[1] + 0.3, side * 0.45, side * 1.5, rng, n=5)
        fr.fallen_stones(rub, F, g[0], g[1], side * 0.4, side * 1.1, rng, n=3, col="adobe_base", size=(0.36, 0.12, 0.2))
        Fs_ = fr.Frame(F.p(0.0, 0.0, side * 0.3), (F.U[0] * side, F.U[2] * side)) if side > 0 else fr.Frame(F.p(L, 0.0, side * 0.3), (-F.U[0], -F.U[2]))
        k = 0; u = 3.6
        while u < L - 5.6:
            if not (F is fs and 6.0 < u < 13.0) and k % 2 == 0:
                ua = u if side > 0 else L - u - 4.6
                fr.sand_wedge(sd, Fs_, ua, ua + 4.6, 1.0, 0.3, rng, 4, kit.chart("yd_wall_dr%d_%d" % (seed, k), 0.7))
            u += 6.0; k += 1
    # the tin patch in the south wall: a breach closed with roofing sheets and two rails (decay with repair says people)
    Ft = fr.Frame(fs.p(11.7, 0.0, -0.22), (-fs.U[0], -fs.U[2]))                          # looks north into the yard
    fr.tin_sheets(vl, Ft, 0.0, 2.6, (0.05, 0.0), (2.75, 0.0), rng, seg=1.4)
    for yy in (0.8, 2.1):
        fr.beam(vl, Ft, (-0.2, yy, 0.06), (2.8, yy + 0.04, 0.06), 0.09, 0.07, "board_bleached", chamfer=0.012, segs=2)
    # the households' marks brushed on the south wall by the tank: who draws how much (the m_mask of this chunk)
    Fm = fr.Frame(fs.p(27.0, 0.0, -0.31), (-fs.U[0], -fs.U[2]))
    for k in range(5):
        fr.decal(mask, Fm, 0.4 + 0.62 * k, 1.45 + 0.05 * math.sin(k * 2.1), 0.012, 0.34, 0.34, "family_marks", (k * 5 + 2) % 12, "town_paint", rot_deg=4.0 * math.sin(k * 1.7))
    fr.decal(mask, Fm, 1.6, 1.0, 0.012, 1.3, 0.33, "tally", 2, "chalk")
    # the east wall: the alley door and the yard door (a Pellam access panel in an adobe frame: the seam)
    we = SOL["yd_wall_e_2"]; xe = we["pos"][0]; He = we["size"][1]
    da = layout.marker("door_alley"); dy = layout.marker("ia_yard_door")
    za = -16.0; zb = 15.0
    holes = [(da["pos"][2] - da["size"][0] / 2 - za, da["pos"][2] + da["size"][0] / 2 - za, 0.0, da["size"][1]),
             (dy["pos"][2] - dy["size"][0] / 2 - za, dy["pos"][2] + dy["size"][0] / 2 - za, 0.0, dy["size"][1])]
    # polish round 3: the parapet is broken in two places (a bite 0.55 m deep north of the yard door, a shallower one south)
    fe = fr.adobe_wall((lm, vl), (xe, za), (xe, zb), He, 0.9, "yd_wall_e", holes=holes, seed=107, density=1.0, ends="", fallen=0.7,
                       top_fn=lambda u: (He - 0.08 + 0.1 * fbm(u / 2.4, 0.4, 11, 2) + 0.35 * smooth(1 - abs(u - (holes[1][0] + holes[1][1]) / 2) / 2.6)
                                         - 0.55 * smooth(1 - abs(u - 9.4) / 1.3) * (0.75 + 0.25 * vnoise(u * 1.7, 0.2, 31)) - 0.32 * smooth(1 - abs(u - 22.6) / 0.9)))
    for hi, (h0, h1, _, hh) in enumerate(holes):
        for u, flip in ((h0, False), (h1, True)):
            Fj = fe.turned(u, -0.45, 90.0)
            fr.adobe_face(lm, Fj, 0.0, 0.9, 0.0, hh, 0.0, kit.chart("yd_jamb%d%d" % (hi, flip), 1.0), flip=not flip, seed=109 + hi, batter=0.0, step=1.0)
        if hi == 0:
            fr.beam(vl, fe, (h0 - 0.3, hh + 0.12, -0.3), (h1 + 0.3, hh + 0.12, -0.3), 0.28, 0.24, "board_dark", chamfer=0.03, caps="ab", segs=2)
            fr.beam(vl, fe, (h0 - 0.3, hh + 0.12, 0.3), (h1 + 0.3, hh + 0.14, 0.3), 0.28, 0.24, "board_dark", chamfer=0.03, caps="ab", segs=2)
        else:
            # the adobe frame round the access panel: a proud surround on the court side, a steel lintel salvaged with it
            for (ua, ub, ya, yb) in ((h0 - 0.75, h0 - 0.4, 0.0, hh + 0.35), (h1 + 0.4, h1 + 0.75, 0.0, hh + 0.35), (h0 - 0.75, h1 + 0.75, hh, hh + 0.35)):
                fr.fbox(vl, fe, ua, ub, ya, yb, -0.57, -0.45, mix(lin("adobe"), lin("adobe_base"), 0.25), "adobe", "u", "btlrd", final=False)
            fr.fbox(vl, fe, h0 - 0.1, h1 + 0.1, hh - 0.02, hh + 0.1, -0.5, 0.5, lin("steel"), None, "u", "fbd")
    # the gate court's long walls: piers either side of both gateways, drift along the feet
    for k, uu in enumerate((holes[1][0] - 1.9, holes[1][1] + 1.9)):
        fr.buttress(vl, fe, uu, -0.45, -1.0, h=2.5, width=0.8, proj=0.5, top_proj=0.14, seed=131 + k)          # court side of the yard wall
        fr.buttress(vl, fe, uu + (0.5 if k else -0.5), 0.45, 1.0, h=2.4, width=0.8, proj=0.5, top_proj=0.14, seed=135 + k)   # yard side
    # polish round 2: the yard side of the east wall had two piers in 31 m; two more on each long run (0.3 m proud at the
    # foot: inside the 0.35 m a body keeps from the wall's collider), and every yard wall weathered: streaks from the
    # top, blotches, so a wall in open shade is not one flat tone
    for k, uu in enumerate((7.6, 11.4, 20.6, 24.4, 28.2)):
        fr.buttress(vl, fe, uu, 0.45, 1.0, h=2.5 + 0.1 * (k % 2), width=0.75, proj=0.3, top_proj=0.1, seed=141 + k)
    # polish round 3 (the visual critic: "the rear walls are blank flat planes"): a stained base course along the foot
    # of every yard wall (broken at the doors and the tin patch), a harness rail on pegs by the alley door
    n_w = len(vl.f)
    for (ua, ub, sd_) in ((0.35, holes[0][0] - 0.25, 21), (holes[0][1] + 0.25, holes[1][0] - 0.3, 22), (holes[1][1] + 0.3, zb - za - 0.35, 23)):
        fr.plinth(vl, fe, ua, ub, 0.45, 1.0, h=0.52, proud=0.08, seed=sd_)
    fr.beam(vl, fe, (5.0, 1.72, 0.52), (8.2, 1.70, 0.52), 0.07, 0.11, "board_bleached", chamfer=0.012, segs=2, caps="ab")
    for uu in (5.3, 6.1, 6.9, 7.8):
        fr.beam(vl, fe, (uu, 1.69, 0.5), (uu, 1.75, 0.68), 0.045, 0.045, "board_dark", chamfer=0.008, caps="b")
    for (F_, L_, sd_, sgn_) in ((fw, 29.2, 24, -1.0), (fs, 31.2, 25, -1.0), (fn, 13.7, 26, 1.0)):
        for (ua, ub) in (((0.5, 8.9), (12.0, L_ - 0.5)) if F_ is fs else ((0.5, L_ - 0.5),)):
            fr.plinth(vl, F_, ua, ub, sgn_ * 0.3, sgn_, h=0.44, proud=0.07, seed=sd_)
    # polish round 4 (the visual critic: "the yard's far walls are large blank adobe planes"): what hangs ABOVE a head
    # on the east wall (nothing here has a collider, so nothing stands lower than 2.3 m or further than 0.3 m out):
    # (1) a tin pentice on two brackets over the alley door, (2) put-log poles left in the wall along its sunlit south
    # run: each throws a metre of raking shadow down the wall (the sun stands 14 degrees up in the north-west),
    # (3) the end of the washing line that comes across from the Tally House (build_tally).
    a0, a1 = holes[0][0] - 0.75, holes[0][1] + 0.75
    fr.tin_sheets(vl, fe, a0, a1, (2.9, 1.62), (3.2, 0.46), rng, seg=0.6)
    und = mul(lin("board_dark"), 0.55)
    for (ua, ub) in zip(fr.breaks(a0, a1, 0.8)[:-1], fr.breaks(a0, a1, 0.8)[1:]):
        vl.poly([fe.p(ua, 2.885, 1.6), fe.p(ua, 3.185, 0.46), fe.p(ub, 3.185, 0.46), fe.p(ub, 2.885, 1.6)], "m_frontier", row_uv(FT, "plank_a", ua, 0.5), und)
    for uu in (a0 + 0.22, a1 - 0.22):
        fr.beam(vl, fe, (uu, 3.13, 0.44), (uu, 2.85, 1.58), 0.08, 0.1, "board_dark", chamfer=0.012, caps="b", segs=2)
        fr.beam(vl, fe, (uu, 2.3, 0.45), (uu, 2.86, 1.3), 0.07, 0.07, "board", chamfer=0.01, segs=2)
    fr.beam(vl, fe, (a0 - 0.05, 2.87, 1.56), (a1 + 0.05, 2.86, 1.56), 0.07, 0.09, "board_bleached", chamfer=0.012, caps="ab", segs=3)
    for k, uu in enumerate((21.7, 22.95, 25.7, 26.95, 29.5)):
        fr.beam(vl, fe, (uu, 2.74 + 0.05 * (k % 2), 0.3), (uu + 0.03 * (k % 3 - 1), 2.7 + 0.05 * (k % 2), 1.2 + 0.12 * ((k * 7) % 3)), 0.13, 0.13, "board_dark" if k % 2 else "board", chamfer=0.03, caps="b", segs=2)
    for (part_, ax, seed_) in ((lm, None, 0), (vl, None, 0)):
        def fn(p, lm_=part_):
            # which wall is this point on?
            if p[0] < -109.5: return fr.wall_weather(2, 2.9, 201)(p)
            if p[0] > -80.6: return fr.wall_weather(2, He, 203)(p)
            if p[2] > 13.5: return fr.wall_weather(0, 2.9, 205)(p)
            if p[2] < -13.5: return fr.wall_weather(0, 2.9, 207)(p)
            return 1.0
        fr.weather(part_, fn)
    return [lm, vl, mask, rub, sd]


# ====================================================================== the Tally House's south front
def build_tally(S):
    lm = Part("yd_tally_lm", Z, paint=fr.paint(0.0, jitter=0.03)); vl = Part("yd_tally_vl", Z, paint=fr.paint(0.0, grad_h=6.0))
    rng = random.Random(171)
    w0 = layout.solid("ty_wall_s_0"); wl = layout.solid("ty_wall_s_lintel1"); ww = layout.solid("ty_wall_w"); we = layout.solid("ty_wall_e")
    x0 = ww["pos"][0] - ww["size"][0] / 2; x1 = we["pos"][0] + we["size"][0] / 2                       # -97 .. -81
    zf = w0["pos"][2] + w0["size"][2] / 2; H = w0["pos"][1] + w0["size"][1] / 2                         # the south face z = -14, 5 m
    d = layout.marker("door_tally")
    F = fr.Frame((x0, 0.0, zf), (1.0, 0.0))
    hole = (d["pos"][0] - d["size"][0] / 2 - x0, d["pos"][0] + d["size"][0] / 2 - x0, 0.0, d["size"][1])
    PAR = 0.62
    ch = kit.chart("yd_tally_f", 1.0)
    # polish round 2: a finer grid (0.8 m) so the face can carry weather in its vertex colours; the parapet is chipped
    # (two shallow bites and a sag), not a ruled line
    CAN = (3.3, 12.4)                                                     # the two canales
    par_top = lambda u: (H + PAR - 0.06 + 0.07 * fbm(u / 1.9, 0.6, 13, 2) - 0.16 * smooth(1 - abs(u - 5.9) / 0.7) - 0.22 * smooth(1 - abs(u - 14.3) / 0.55)
                         - 0.06 * math.sin(math.pi * u / (x1 - x0)) ** 2)
    fr.adobe_face(lm, F, 0.0, x1 - x0, 0.0, 3.0, 0.0, ch, [hole], seed=173, fallen=1.0, step=0.8, batter=0.012)
    # the upper wall is lightmapped with the lower (one chart): vertex-lit, it baked a flat darker band over the lit wall
    # with a ruled seam at 3 m (the same fault as the alleys' side walls)
    # (and its texture and colour run on from the lower wall's: adobe_face restarts both at its own foot, which drew a
    # second brick course and damp line 3 m up)
    fr.grid_face(lm, F, fr.breaks(0.0, x1 - x0, 0.8), fr.adobe_rows(3.0, H + PAR), 0.0, "m_frontier", lambda u, y: row_uv(FT, "adobe", u, fr.adobe_v(y)),
                 lambda u, y: fr.adobe_colour(y, u, 173, 0.0), ch, w_fn=lambda u, y: -0.012 * y, top_fn=par_top)
    ww = fr.wall_weather(0, H + PAR, 211, stains=[x0 + c for c in CAN])
    fr.weather(lm, ww); fr.weather(vl, ww)
    # two piers either side of the door (0.3 m proud at the foot), a low bench of adobe along the foot west of it
    for k, uu in enumerate((hole[0] - 1.9, hole[1] + 1.9)):
        fr.buttress(vl, F, uu, 0.0, 1.0, h=3.6, width=0.85, proj=0.3, top_proj=0.08, seed=191 + k, steps=3)
    # polish round 3 (the visual critic: the front round the door was a blank plane): a stained base course between the
    # corner buttresses and the piers, an adobe bench against the wall west of the door, and the board the day's tally
    # was pinned to beside it (bare planks in a frame: nothing is written on it)
    Lw = x1 - x0
    for (ua, ub, sd_) in ((1.25, hole[0] - 2.4, 31), (hole[0] - 1.42, hole[0] - 0.12, 32), (hole[1] + 0.12, hole[1] + 1.42, 33), (hole[1] + 2.4, Lw - 1.25, 34)):
        if ub - ua > 0.4: fr.plinth(vl, F, ua, ub, 0.0, 1.0, h=0.56, proud=0.08, seed=sd_)
    bu0 = max(1.5, hole[0] - 6.3); bu1 = hole[0] - 2.6
    if bu1 - bu0 > 1.2:
        fr.fbox(vl, F, bu0, bu1, 0.0, 0.46, 0.0, 0.3, mul(mix(lin("adobe"), lin("adobe_base"), 0.5), 0.9), "adobe", "u", "ftlr")
    nb0 = hole[1] + 0.28; nb1 = hole[1] + 1.26
    fr.fbox(vl, F, nb0, nb1, 1.22, 2.02, 0.0, 0.035, lin("board_bleached"), "plank_a", "y", "ftlrd")
    for yy in (1.2, 2.0):
        fr.beam(vl, F, (nb0 - 0.06, yy, 0.05), (nb1 + 0.06, yy + 0.01, 0.05), 0.07, 0.06, "board_dark", chamfer=0.012, caps="ab")
    for (su, sy, sw_, sh_) in ((nb0 + 0.1, 1.62, 0.24, 0.3), (nb0 + 0.42, 1.5, 0.2, 0.26), (nb0 + 0.68, 1.66, 0.22, 0.24)):       # scraps of paper still pinned to it, blank
        fr.fbox(vl, F, su, su + sw_, sy, sy + sh_, 0.036, 0.042, mul(mix(lin("sand_pale"), (1.0, 1.0, 1.0), 0.35), 1.0), None, "u", "f")
    # the parapet's top and inner face, the roof behind it (as far as this chunk's box goes: z >= -16.7)
    zb = -16.7
    tw = 0.5
    for (ua, ub) in zip(fr.breaks(0.0, x1 - x0, 2.0)[:-1], fr.breaks(0.0, x1 - x0, 2.0)[1:]):
        t = H + PAR - 0.06
        vl.poly([F.p(ua, min(t, par_top(ua)), -0.1), F.p(ub, min(t, par_top(ub)), -0.1), F.p(ub, t, -tw), F.p(ua, t, -tw)], "m_frontier", row_uv(FT, "adobe", ua, 0.85), mix(lin("adobe"), lin("sand_pale"), 0.4))
        vl.poly([F.p(ub, H, -tw), F.p(ua, H, -tw), F.p(ua, t, -tw), F.p(ub, t, -tw)], "m_frontier", row_uv(FT, "adobe", ua, 0.7), mul(lin("adobe"), 0.8))
        vl.poly([F.p(ua, H, -tw), F.p(ub, H, -tw), F.p(ub, H, zb - zf), F.p(ua, H, zb - zf)], "m_frontier", row_uv(FT, "adobe", ua, 0.9), mix(lin("adobe_base"), lin("sand"), 0.5))
    # door reveal and its timber lintel
    for u, flip in ((hole[0], False), (hole[1], True)):
        Fj = F.turned(u, -0.5, 90.0)
        fr.adobe_face(lm, Fj, 0.0, 0.5, 0.0, hole[3], 0.0, kit.chart("yd_tally_jamb%d" % flip, 1.0), flip=not flip, seed=177, batter=0.0, step=1.0)
    fr.beam(vl, F, (hole[0] - 0.35, hole[3] + 0.13, -0.12), (hole[1] + 0.35, hole[3] + 0.15, -0.12), 0.3, 0.26, "board_dark", chamfer=0.03, caps="ab", segs=2)
    # viga ends in a row under the parapet, one canale
    n = 13
    for k in range(n):
        u = 1.3 + k * (x1 - x0 - 2.6) / (n - 1)
        fr.beam(vl, F, (u, H - 0.42, -0.3), (u + 0.01 * (k % 3 - 1), H - 0.44 - 0.02 * rng.random(), 0.3 + 0.1 * rng.random()), 0.17, 0.17, "board_dark", chamfer=0.04, caps="b")
    for uc in CAN:
        fr.fbox(vl, F, uc - 0.13, uc + 0.13, H - 0.05, H + 0.07, -0.2, 0.75, lin("board_bleached"), "plank_a", "w", "fbtlrd")
        fr.fbox(vl, F, uc - 0.09, uc + 0.09, H + 0.07, H + 0.09, -0.2, 0.75, mul(lin("board_dark"), 0.7), None, "w", "t")
    # corner buttresses, plaster fallen from the lower metre (adobe_face fallen=1)
    for (ua, ub) in ((0.0, 1.2), (x1 - x0 - 1.2, x1 - x0)):
        pts = [F.p(ua, 0.0, 0.0), F.p(ub, 0.0, 0.0), F.p(ub, 0.0, 0.34), F.p(ua, 0.0, 0.34), F.p(ua + 0.08, 3.3, 0.0), F.p(ub - 0.08, 3.3, 0.0), F.p(ub - 0.08, 3.3, 0.08), F.p(ua + 0.08, 3.3, 0.08)]
        chb = kit.chart("yd_tally_but%d" % (ua > 1), 1.0)
        for qi, q in enumerate(((3, 2, 6, 7), (0, 3, 7, 4), (2, 1, 5, 6), (7, 6, 5, 4))):
            st = [(qi * 1.6 + (0.0 if k in (0, 3) else 1.2), 0.0 if k < 2 else 3.3) for k in range(4)]
            lm.poly([pts[k] for k in q], "m_frontier", [row_uv(FT, "adobe", s_[0] + 0.3, fr.adobe_v(pts[k][1])) for k, s_ in zip(q, st)], [fr.adobe_colour(pts[k][1], s_[0], 179, 1.0) for k, s_ in zip(q, st)],
                    chb, st)
    # the returns: west and east faces above the yard's walls, as far as the box goes
    for (xx, ud, seed) in ((x0, (0.0, 1.0), 181), (x1, (0.0, -1.0), 183)):
        Fr_ = fr.Frame((xx, 0.0, zb if ud[1] > 0 else zf), ud)
        fr.adobe_face(vl, Fr_, 0.0, zf - zb, 2.7, H + PAR, 0.0, None, [], seed=seed, fallen=0.0, step=1.4, batter=0.0, top_fn=lambda u: H + PAR - 0.06 + 0.05 * fbm(u / 1.5, 0.3, 17, 2))
    # ---- polish round 4 (the visual critic: "the Tally House front reads close to blockout: a big flat mauve plane
    # with a door and a board"). The front never sees the sun (it looks south, the sun stands north-west), so it is
    # broken by VALUE and HUE and by what is fixed to it: a lime-washed dado that has come off in places, the town's
    # teal round the door, a tin awning on brackets over the door and the board, a peg rail with what hangs from it, the
    # roof ladder, the brushed well mark with the count chalked under it, and the washing line to the east wall.
    # Nothing below 2.3 m stands more than 0.3 m off the wall (no collider is added).
    mask = Part("yd_tally_marks", Z)
    wd = Part("yd_tally_wood", Z, paint=fr.paint(0.0, jitter=0.05))
    hue = Part("yd_tally_hue", Z, paint=None)
    lime = mul(mix(mix(lin("chalk"), lin("sand_pale"), 0.5), lin("adobe"), 0.3), 0.86)
    teal = mul(mix(lin("town_paint"), lin("adobe_base"), 0.3), 0.8)        # the town's paint, thirty years of dust in it
    for (ua, ub) in ((1.25, 4.85), (5.75, hole[0] - 0.36), (hole[1] + 0.36, 10.25), (11.15, Lw - 1.25)):
        us = fr.breaks(ua, ub, 0.95)
        for k in range(len(us) - 1):
            if rng.random() < 0.1 and us[k + 1] - us[k] > 0.6 and 0 < k < len(us) - 2: continue      # a length of it has fallen
            top = 1.27 + 0.05 * rng.random()
            fr.fbox(vl, F, us[k], us[k + 1], 0.5, top, -0.02, 0.014, mul(lime, rng.uniform(0.93, 1.04)), "adobe", "u", "ft")
            fr.fbox(hue, F, us[k], us[k + 1], top - 0.11, top - 0.035, -0.02, 0.017, mul(teal, rng.uniform(0.85, 1.0)), None, "u", "f", final=True)
    for (ua, ub, ya, yb) in ((hole[0] - 0.33, hole[0] - 0.015, 0.58, 1.5), (hole[0] - 0.31, hole[0] - 0.015, 1.52, 2.39), (hole[1] + 0.015, hole[1] + 0.32, 0.58, 1.38), (hole[1] + 0.015, hole[1] + 0.33, 1.4, 2.39),
                             (hole[0] - 0.33, hole[0] + 0.62, 2.68, 2.93), (hole[0] + 0.64, hole[1] + 0.33, 2.68, 2.95)):
        fr.fbox(hue, F, ua, ub, ya, yb, -0.03, 0.016, mul(teal, rng.uniform(0.82, 1.0)), None, "u", "f", final=True)
    # the door hood: tin on three brackets, between the piers. It stands only 0.36 m off the wall: trg_dowser's volume
    # begins at z -13.6, and nothing may stand in the line from any place in it to the man on the far rim (R4)
    b0, b1 = hole[0] - 1.38, hole[1] + 1.38
    fr.tin_sheets(wd, F, b0, b1, (3.0, 0.36), (3.18, -0.03), rng, seg=0.0)
    und = mul(lin("board_dark"), 0.5)
    for (ua, ub) in zip(fr.breaks(b0, b1, 0.8)[:-1], fr.breaks(b0, b1, 0.8)[1:]):
        hue.poly([F.p(ua, 2.985, 0.35), F.p(ua, 3.165, -0.03), F.p(ub, 3.165, -0.03), F.p(ub, 2.985, 0.35)], "m_frontier", row_uv(FT, "plank_a", ua, 0.5), und, final=True)
    for uu in (b0 + 0.2, (b0 + b1) / 2 + 0.9, b1 - 0.2):
        fr.beam(wd, F, (uu, 3.12, -0.04), (uu, 2.96, 0.33), 0.08, 0.1, "board_dark", chamfer=0.012, caps="b")
        fr.beam(wd, F, (uu, 2.7, -0.02), (uu, 2.95, 0.26), 0.055, 0.055, "board", chamfer=0.01)
    fr.beam(wd, F, (b0 - 0.05, 2.975, 0.33), (b1 + 0.05, 2.97, 0.33), 0.06, 0.08, "board_bleached", chamfer=0.012, caps="ab", segs=3)
    # the peg rail over the bench: three strings of dried peppers, a shovel, a coil of the works' cable
    fr.beam(wd, F, (1.85, 2.02, 0.03), (4.45, 2.0, 0.03), 0.06, 0.1, "board_bleached", chamfer=0.012, caps="ab", segs=2)
    for uu in (2.1, 2.42, 2.78, 3.5, 4.15):
        fr.beam(wd, F, (uu, 2.02, 0.03), (uu, 2.06, 0.2), 0.04, 0.04, "board_dark", chamfer=0.008, caps="b")
    red = mul(mix(lin("rust"), lin("clay"), 0.35), 0.62)
    for k, (uu, ln) in enumerate(((2.1, 0.78), (2.42, 0.62), (2.78, 0.86))):
        kit.add_prism(hue, F.p(uu, 1.98, 0.15), F.p(uu + 0.02 * (k - 1), 1.98 - ln, 0.13), 0.2, 0.16, "m_frontier", mul(red, 0.9 + 0.12 * k), chamfer=0.05, taper=0.55, up=F.N, caps="b", segs=2, final=True)
    fr.beam(wd, F, (3.5, 2.03, 0.12), (3.56, 0.72, 0.1), 0.045, 0.045, "board", chamfer=0.01, segs=2)
    fr.fbox(hue, F, 3.44, 3.68, 0.44, 0.76, 0.07, 0.1, mul(lin("tin"), 0.8), None, "u", "ftlrd", final=True)
    for k in range(3):
        fr.fbox(hue, F, 3.95 - 0.02 * k, 4.35 + 0.02 * k, 1.5 - 0.05 * k, 1.56 - 0.05 * k + 0.44, 0.03 + 0.03 * k, 0.09 + 0.03 * k, mul(lin("cable"), 1.0 + 0.25 * k), None, "u", "ftlrd" if k == 2 else "tlrd", final=True)
    # the roof ladder east of the door: it has stood there long enough to leave its own stain
    lu = 13.3
    for uu in (lu, lu + 0.52):
        fr.beam(wd, F, (uu, 0.0, 0.33), (uu + 0.03, 5.98, -0.05), 0.06, 0.075, "board_bleached", chamfer=0.012, caps="b", segs=5)
    for k in range(17):
        t = (k + 0.9) / 18.0
        fr.beam(wd, F, (lu + 0.03 * t, 5.98 * t, 0.33 - 0.38 * t), (lu + 0.52 + 0.03 * t, 5.98 * t + 0.01 * (k % 3 - 1), 0.33 - 0.38 * t), 0.045, 0.045, "board", chamfer=0.0)
    # the town's mark, brushed large on the plaster, and the tally chalked under it
    fr.decal(mask, F, 12.15, 2.72, -0.012, 0.96, 1.44, "mark_brush_b", None, mul(lin("town_paint"), 0.8), rot_deg=-2.0)
    fr.decal(mask, F, 12.2, 1.72, 0.0, 0.92, 0.46, "tally", 1, "chalk", rot_deg=1.5)
    fr.decal(mask, F, 2.9, 3.0, -0.016, 0.34, 0.34, "family_marks", 3, mul(lin("town_paint"), 0.8))
    fr.decal(mask, F, 3.45, 2.95, -0.016, 0.34, 0.34, "family_marks", 8, mul(lin("town_paint"), 0.8), rot_deg=5.0)
    # the washing line: from the ninth viga's end across the corner of the yard to a pole in the east wall, sagging; what
    # is pegged to it hangs clear of a head (lowest hem 2.3 m). Cloth has two faces a hand apart (each is lit by its own side).
    ln_a = F.p(1.3 + 9 * (x1 - x0 - 2.6) / 12.0, H - 0.47, 0.34); ln_b = (-80.2, 3.22, -2.9)
    Lr = math.hypot(ln_b[0] - ln_a[0], ln_b[2] - ln_a[2]); ud = ((ln_b[0] - ln_a[0]) / Lr, (ln_b[2] - ln_a[2]) / Lr)
    Fl = fr.Frame((ln_a[0], 0.0, ln_a[2]), ud)
    line_y = lambda u: ln_a[1] + (ln_b[1] - ln_a[1]) * (u / Lr) - 0.62 * 4.0 * (u / Lr) * (1.0 - u / Lr)
    NL = 12
    for k in range(NL):
        ua, ub = Lr * k / NL, Lr * (k + 1) / NL
        kit.add_prism(hue, Fl.p(ua, line_y(ua), 0.0), Fl.p(ub, line_y(ub), 0.0), 0.04, 0.04, "m_frontier", mul(lin("cord"), 0.8), final=True)
    fr.beam(wd, fr.Frame((0.0, 0.0, 0.0), (1.0, 0.0)), (-79.98, 3.2, -2.9), (-80.75, 3.24, -2.92), 0.1, 0.1, "board_dark", chamfer=0.02, caps="b")
    FLF_ = flat_uv("m_frontier")
    cloths = ((0.36, 0.85, 0.82, "linen", 4.0), (0.455, 0.62, 0.95, "workcloth_light", -5.0), (0.55, 1.05, 0.66, "linen", 3.0), (0.66, 0.5, 0.86, "town_paint", -3.0), (0.745, 0.9, 0.9, "linen", 6.0), (0.86, 0.7, 0.7, "workcloth", -4.0))
    crng = random.Random(613)
    for k, (t, cw, chh, cname, tilt) in enumerate(cloths):
        # a cloth is not a card: it hangs from two or three pegs (its top edge sags between them), its hem is not level,
        # it bellies a hand with the wind and narrows a little toward the hem. Two faces, back to back.
        uc = Lr * t
        cc = mul(lin(cname), 0.9 if cname == "linen" else 1.0)
        nu = 3 if cw > 0.8 else 2; nv = 3
        hem = [crng.uniform(-0.07, 0.07) for _ in range(nu + 1)]
        ph = crng.uniform(0.0, 6.0)
        G_ = []
        for j in range(nv + 1):
            fy = j / nv
            row_ = []
            for i in range(nu + 1):
                fu = i / nu
                uu = uc + (fu - 0.5) * cw * (1.0 - 0.08 * fy)
                top = line_y(uu) - 0.02 - 0.05 * math.sin(math.pi * fu * (nu - 1 if nu > 2 else 1)) ** 2
                yy = top - (chh + hem[i]) * fy
                ww = 0.09 * math.sin(ph + fu * 2.6 + fy * 1.4) * fy + math.tan(math.radians(tilt)) * (top - yy)
                row_.append((uu, yy, ww))
            G_.append(row_)
        for j in range(nv):
            for i in range(nu):
                q = [G_[j][i], G_[j][i + 1], G_[j + 1][i + 1], G_[j + 1][i]]
                tone = [0.8 + 0.2 * (1.0 - (j + dj) / nv) + 0.06 * math.sin(ph + 2.0 * (i + di)) for (di, dj) in ((0, 0), (1, 0), (1, 1), (0, 1))]
                hue.poly([Fl.p(a_[0], a_[1], a_[2] + 0.008) for a_ in q][::-1], "m_frontier", FLF_, [mul(cc, tn) for tn in tone][::-1], final=True)
                hue.poly([Fl.p(a_[0], a_[1], a_[2] - 0.008) for a_ in q], "m_frontier", FLF_, [mul(cc, tn) for tn in tone], final=True)
    S.extra["street"]["tally"] = dict(F=F, hole=hole)
    return [lm, vl, mask, wd, hue]


# ====================================================================== the drum and the ruined well-house
def facing(pts, target):
    """The polygon wound so that it looks at `target` (a game point)."""
    n = kit.vcross(kit.vsub(pts[1], pts[0]), kit.vsub(pts[2], pts[0]))
    return list(pts) if kit.vdot(n, kit.vsub(target, pts[0])) >= 0 else list(pts)[::-1]


MISSING = (6, 7)                            # the panel that has come off (segments, theta 51..69 degrees: the south-east, seen from the yard door and the catwalk)


def build_drum(S):
    p = Part("yd_drum", Z, chunk=WORKS)
    ch = kit.chart("yd_drum", 1.8)            # pass i3: 1.0 -> 1.8 (29 texels a metre: the rivet rows and the plate laps of wall_paint.paint_ceramic are drawn, not smeared)
    enamel = lin("enamel"); stain = lin("enamel_stain"); steel = lin("steel"); sdark = lin("steel_dark")
    FL = flat_uv("m_pellam")
    ys = [0.0, 0.3, 1.15, 1.2, 1.25, 2.4, 3.0, 3.6, 4.8, DH]
    v0, v1 = manifest.trim_v(PT, "panel", 2)

    def col(y, hi=False):
        if y < 0.3 - 1e-6: return steel
        if 1.15 - 1e-6 <= y <= 1.25 - 1e-6 and not hi: return lin("livery")
        f = (y / 1.2) % 1.0
        c = mix(enamel, stain, 0.35 * (1.0 - f) + 0.45 * clamp(1.0 - y / 2.2))
        return c
    dth = 2 * math.pi / NSEG
    door_segs = [NSEG - 2, NSEG - 1, 0, 1]                                # the east face: four segments = 2.4 m of arc
    for i in range(NSEG):
        ta = i * dth; tb = (i + 1) * dth
        for j in range(len(ys) - 1):
            ya, yb = ys[j], ys[j + 1]
            if i in door_segs and yb <= 3.0 + 1e-6: continue
            if i in MISSING and j == 7: continue
            k0 = math.floor((ya + 1e-4) / 1.2)
            va = v0 + (v1 - v0) * clamp((ya - k0 * 1.2) / 1.2); vb = v0 + (v1 - v0) * clamp((yb - k0 * 1.2) / 1.2)
            if ya < 0.3 - 1e-6: uvs = FL
            else: uvs = [(i / 6.0, va), (i / 6.0, vb), ((i + 1) / 6.0, vb), ((i + 1) / 6.0, va)]
            ca = col(ya + 1e-4); cb = col(yb - 1e-4)
            if ya >= 0.3 - 1e-6:
                ca = mix(ca, lin("sand"), 0.5 * clamp(1.0 - (ya - 0.3) / 0.5))
            lmf = yb <= 3.0 + 1e-6
            pts = [dpt(ta, ya), dpt(ta, yb), dpt(tb, yb), dpt(tb, ya)]
            p.poly(pts, "m_pellam", uvs, [ca, cb, cb, ca], ch if lmf else None, [(R * ta, ya), (R * ta, yb), (R * tb, yb), (R * tb, ya)] if lmf else None, final=True)
    # the top: a shallow cone to a hub the derrick is bolted to
    for i in range(0, NSEG, 3):
        ta = i * dth; tb = (i + 3) * dth
        p.poly([dpt(ta, DH), dpt(ta, DH + 0.25, R * 0.45), dpt(tb, DH + 0.25, R * 0.45), dpt(tb, DH)], "m_pellam", FL, mix(enamel, stain, 0.5), final=True)
        p.poly([dpt(ta, DH + 0.25, R * 0.45), (C[0], DH + 0.3, C[1]), dpt(tb, DH + 0.25, R * 0.45)], "m_pellam", FL, mix(enamel, stain, 0.6), final=True)
    # ---- relief (vertex-lit, its own part: the lightmapped shell under it keeps its chart): the 1.2 m module made
    # solid. A cover strip stands proud over every panel seam, a steel plinth and a coping ring the shell, so the drum
    # has edges that catch the light instead of being a cylinder with lines drawn on it
    r_ = Part("yd_drum_relief", Z, chunk=WORKS)
    out_pt = lambda t: dpt(t, 3.0, R + 6.0)
    strip_c = mix(stain, steel, 0.12)
    levels = [0.3, 1.15, 1.25, 2.4, 3.6, 4.8, DH]
    for i in range(0, NSEG, 2):
        t = i * dth
        lv = levels
        if i == 0: lv = [3.3, 3.6, 4.8, DH]                              # over the door: from the header up
        if i in (NSEG - 2, 2, 4): lv = [3.3, 3.6, 4.8, DH]               # the door's jambs and the parked leaf stand here
        if i in (MISSING[0], MISSING[0] + 2): lv = [0.3, 1.15, 1.25, 2.4, 3.6]
        if i == 16: lv = [1.9, 2.4, 3.6, 4.8, DH]                         # the firing point by the drum's west side: a body stands against the shell here
        hw = 0.055 / R
        for k in range(len(lv) - 1):
            ya, yb = lv[k], lv[k + 1]
            cc = lin("livery") if abs(ya - 1.15) < 1e-6 else mix(strip_c, lin("sand"), 0.45 * clamp(1.0 - (ya - 0.3) / 0.6))
            ct = lin("livery") if abs(ya - 1.15) < 1e-6 else strip_c
            a0 = dpt(t - hw, ya, R + 0.035); a1 = dpt(t - hw, yb, R + 0.035); b0 = dpt(t + hw, ya, R + 0.035); b1 = dpt(t + hw, yb, R + 0.035)
            r_.poly(facing([a0, a1, b1, b0], out_pt(t)), "m_pellam", FL, [cc, ct, ct, cc] if kit.vdot(kit.vcross(kit.vsub(a1, a0), kit.vsub(b1, a0)), kit.vsub(out_pt(t), a0)) >= 0 else [cc, ct, ct, cc][::-1], final=True)
    for i in range(NSEG):
        ta = i * dth; tb = (i + 1) * dth; tm = (ta + tb) / 2
        # the coping: a ring 0.18 m tall standing 8 cm proud of the shell's top, weathered on its upper face
        q = [dpt(ta, DH - 0.14, R + 0.08), dpt(ta, DH + 0.04, R + 0.08), dpt(tb, DH + 0.04, R + 0.08), dpt(tb, DH - 0.14, R + 0.08)]
        r_.poly(facing(q, out_pt(tm)), "m_pellam", FL, mix(enamel, stain, 0.25), final=True)
        q = [dpt(ta, DH + 0.04, R + 0.08), dpt(ta, DH + 0.04, R - 0.3), dpt(tb, DH + 0.04, R - 0.3), dpt(tb, DH + 0.04, R + 0.08)]
        r_.poly(facing(q, dpt(tm, DH + 9.0, R)), "m_pellam", FL, mix(enamel, stain, 0.65), final=True)
        q = [dpt(ta, DH - 0.14, R - 0.01), dpt(ta, DH - 0.14, R + 0.08), dpt(tb, DH - 0.14, R + 0.08), dpt(tb, DH - 0.14, R - 0.01)]
        r_.poly(facing(q, dpt(tm, 0.0, R + 0.03)), "m_pellam", FL, mul(stain, 0.6), final=True)
        # the plinth: cast steel, 6 cm proud, a chamfered shoulder (not across the door)
        if i in door_segs or i in (15, 16): continue                       # (the plinth is under the sand at the firing point)
        q = [dpt(ta, -0.05, R + 0.07), dpt(ta, 0.24, R + 0.07), dpt(tb, 0.24, R + 0.07), dpt(tb, -0.05, R + 0.07)]
        r_.poly(facing(q, out_pt(tm)), "m_pellam", FL, [mix(steel, lin("sand"), 0.5), steel, steel, mix(steel, lin("sand"), 0.5)], final=True)
        q = [dpt(ta, 0.24, R + 0.07), dpt(ta, 0.32, R - 0.01), dpt(tb, 0.32, R - 0.01), dpt(tb, 0.24, R + 0.07)]
        r_.poly(facing(q, dpt(tm, 6.0, R + 3.0)), "m_pellam", FL, mul(steel, 1.25), final=True)
    # the missing panel: the shell is 0.3 m of ceramic on steel ribs; behind it the dark, two ribs, a hank of cable
    ta = MISSING[0] * dth; tb = (MISSING[-1] + 1) * dth; tm = (ta + tb) / 2; ya, yb = 3.6, 4.8
    void = mul(sdark, 0.3); look = dpt(tm, 4.2, R + 8.0)
    r_.poly(facing([dpt(ta, ya, R - 0.42), dpt(ta, yb, R - 0.42), dpt(tb, yb, R - 0.42), dpt(tb, ya, R - 0.42)], look), "m_pellam", FL, mul(void, 0.5), final=True)
    for (t_, sg) in ((ta, 1), (tb, -1)):
        r_.poly(facing([dpt(t_, ya, R), dpt(t_, yb, R), dpt(t_, yb, R - 0.42), dpt(t_, ya, R - 0.42)], dpt(tm, 4.2, R - 0.2)), "m_pellam", FL, mix(stain, void, 0.6), final=True)
    r_.poly(facing([dpt(ta, ya, R), dpt(ta, ya, R - 0.42), dpt(tb, ya, R - 0.42), dpt(tb, ya, R)], dpt(tm, 9.0, R - 0.2)), "m_pellam", FL, mix(stain, void, 0.4), final=True)
    r_.poly(facing([dpt(ta, yb, R), dpt(ta, yb, R - 0.42), dpt(tb, yb, R - 0.42), dpt(tb, yb, R)], dpt(tm, 0.0, R - 0.2)), "m_pellam", FL, void, final=True)
    for f in (0.3, 0.72):
        t_ = ta + (tb - ta) * f
        kit.add_prism(r_, dpt(t_, ya, R - 0.2), dpt(t_, yb, R - 0.2), 0.11, 0.2, "m_pellam", steel, chamfer=0.0, up=kit.vsub(dpt(t_, 0, R + 1), dpt(t_, 0, R)), segs=2, final=True)
    cb0 = dpt(ta + (tb - ta) * 0.5, yb - 0.1, R - 0.15); cb1 = dpt(ta + (tb - ta) * 0.56, ya + 0.2, R + 0.02); cb2 = dpt(ta + (tb - ta) * 0.62, ya - 0.95, R + 0.07)
    kit.add_prism(r_, cb0, cb1, 0.08, 0.08, "m_pellam", lin("cable"), chamfer=0.0, segs=2, final=True)
    kit.add_prism(r_, cb1, cb2, 0.08, 0.08, "m_pellam", lin("cable"), chamfer=0.0, segs=2, final=True)
    # ---- the door: a cast steel portal, the leaf hung from a track, slid half aside and stuck
    t0 = -2 * dth; t1 = 2 * dth; tl = 4 * dth
    eye = dpt(-dth, 1.6, R + 5.0)                                           # where a body looks in from
    black = (0.004, 0.005, 0.006)
    rin = R - 2.6
    quad = lambda pts, c, tg=None: r_.poly(facing(pts, tg or eye), "m_pellam", FL, c, final=True)
    # the throat: a closed dark box as deep as the Transits need to stand in (everything looks at the opening)
    quad([dpt(t0, 0.0, rin), dpt(t0, 3.0, rin), dpt(0.0, 3.0, rin), dpt(0.0, 0.0, rin)], black)
    quad([dpt(0.0, 0.0, rin), dpt(0.0, 3.0, rin), dpt(t1, 3.0, rin), dpt(t1, 0.0, rin)], black)
    mid_in = dpt(0.0, 1.5, (R + rin) / 2)
    quad([dpt(t0, 0.0, R - 0.02), dpt(t0, 3.0, R - 0.02), dpt(t0, 3.0, rin), dpt(t0, 0.0, rin)], [mul(sdark, 0.5), mul(sdark, 0.5), black, black], mid_in)
    quad([dpt(t1, 0.0, R - 0.02), dpt(t1, 3.0, R - 0.02), dpt(t1, 3.0, rin), dpt(t1, 0.0, rin)], [mul(sdark, 0.5), mul(sdark, 0.5), black, black], mid_in)
    for (ta_, tb_) in ((t0, 0.0), (0.0, t1)):
        quad([dpt(ta_, 3.0, R), dpt(ta_, 3.0, rin), dpt(tb_, 3.0, rin), dpt(tb_, 3.0, R)], [mul(sdark, 0.35), black, black, mul(sdark, 0.35)], dpt(0.0, 0.0, R - 1.0))
        quad([dpt(ta_, 0.02, R + 0.3), dpt(ta_, 0.02, rin), dpt(tb_, 0.02, rin), dpt(tb_, 0.02, R + 0.3)], [mix(steel, lin("sand"), 0.4), black, black, mix(steel, lin("sand"), 0.4)], dpt(0.0, 9.0, R - 1.0))
    # shapes in the dark: two risers and a hand-wheel's stem, just inside
    for (t_, rr, rad) in ((t0 * 0.55, R - 1.5, 0.2), (t0 * 0.2, R - 1.9, 0.14)):
        c_ = dpt(t_, 0.0, rr)
        kit.add_cyl(r_, c_, rad, 3.0, "m_pellam", mul(sdark, 0.75), segs=8, cap_top=False, rows=2, final=True)
        kit.add_cyl(r_, (c_[0], 1.35, c_[2]), rad + 0.06, 0.16, "m_pellam", mul(steel, 0.7), segs=8, cap_top=True, cap_bottom=True, final=True)
    # jambs: steel posts 0.2 m wide standing 0.16 m proud, to the header
    for (t_, sg) in ((t0, -1), (t1, 1)):
        wj = 0.2 / R
        A = [dpt(t_, 0.0, R + 0.16), dpt(t_, 3.02, R + 0.16), dpt(t_ + sg * wj, 3.02, R + 0.16), dpt(t_ + sg * wj, 0.0, R + 0.16)]
        if sg > 0: continue                                                 # the south jamb stands behind the parked leaf
        quad(A, [mix(steel, lin("sand"), 0.45), steel, steel, mix(steel, lin("sand"), 0.45)], dpt(t_ + sg * wj / 2, 1.5, R + 5))
        quad([dpt(t_, 0.0, R - 0.02), dpt(t_, 3.02, R - 0.02), dpt(t_, 3.02, R + 0.16), dpt(t_, 0.0, R + 0.16)], mul(steel, 0.8), mid_in)
        quad([dpt(t_ + sg * wj, 0.0, R - 0.01), dpt(t_ + sg * wj, 3.02, R - 0.01), dpt(t_ + sg * wj, 3.02, R + 0.16), dpt(t_ + sg * wj, 0.0, R + 0.16)], mul(steel, 0.9), dpt(t_ + sg * 1.0, 1.5, R + 2))
    # the header and its track: a box beam from the north jamb to the end of the leaf's travel
    hb = [t0 - 0.2 / R] + [k * dth for k in range(-1, 5)] + [tl + 0.25 / R]
    for k in range(len(hb) - 1):
        ta_, tb_ = hb[k], hb[k + 1]; tm_ = (ta_ + tb_) / 2
        quad([dpt(ta_, 3.02, R + 0.3), dpt(ta_, 3.34, R + 0.3), dpt(tb_, 3.34, R + 0.3), dpt(tb_, 3.02, R + 0.3)], steel, dpt(tm_, 3.2, R + 5))
        quad([dpt(ta_, 3.02, R - 0.01), dpt(ta_, 3.02, R + 0.3), dpt(tb_, 3.02, R + 0.3), dpt(tb_, 3.02, R - 0.01)], mul(steel, 0.55), dpt(tm_, 0.0, R + 0.15))
        quad([dpt(ta_, 3.34, R + 0.3), dpt(ta_, 3.34, R - 0.01), dpt(tb_, 3.34, R - 0.01), dpt(tb_, 3.34, R + 0.3)], mul(steel, 1.3), dpt(tm_, 9.0, R + 0.15))
    for t_ in (hb[0], hb[-1]):
        quad([dpt(t_, 3.02, R - 0.01), dpt(t_, 3.34, R - 0.01), dpt(t_, 3.34, R + 0.3), dpt(t_, 3.02, R + 0.3)], mul(steel, 0.85), dpt(t_ + (1 if t_ > 0 else -1), 3.2, R + 0.2))
    # the leaf: 6 cm of ceramic on a steel frame, theta 0 .. 4 segments (it covers the south half of the opening)
    rl0 = R + 0.1; rl = R + 0.17
    stile = mix(steel, stain, 0.15)
    for i in range(4):
        ta_ = i * dth; tb_ = (i + 1) * dth; tm_ = (ta_ + tb_) / 2
        for (ya_, yb_) in ((0.07, 0.3), (0.3, 1.05), (1.05, 1.15), (1.15, 2.4), (2.4, 2.98)):
            c_ = steel if yb_ <= 0.3 + 1e-6 else (lin("livery") if (ya_ > 1.0 and yb_ < 1.2) else mix(enamel, stain, 0.4))
            uv_ = FL if (yb_ <= 0.3 + 1e-6 or (ya_ > 1.0 and yb_ < 1.2)) else [(i / 2.0, v0 + (v1 - v0) * (ya_ / 3.0)), (i / 2.0, v0 + (v1 - v0) * (yb_ / 3.0)), ((i + 1) / 2.0, v0 + (v1 - v0) * (yb_ / 3.0)), ((i + 1) / 2.0, v0 + (v1 - v0) * (ya_ / 3.0))]
            r_.poly([dpt(ta_, ya_, rl), dpt(ta_, yb_, rl), dpt(tb_, yb_, rl), dpt(tb_, ya_, rl)], "m_pellam", uv_, c_, final=True)
        quad([dpt(ta_, 2.98, rl0), dpt(ta_, 2.98, rl), dpt(tb_, 2.98, rl), dpt(tb_, 2.98, rl0)], mul(stile, 1.1), dpt(tm_, 9.0, rl))
        if i < 2: quad([dpt(ta_, 0.07, rl0), dpt(ta_, 2.98, rl0), dpt(tb_, 2.98, rl0), dpt(tb_, 0.07, rl0)], mul(sdark, 0.4), dpt(tm_, 1.5, 0.0))      # its back, seen from inside the throat
    quad([dpt(0.0, 0.07, rl0), dpt(0.0, 2.98, rl0), dpt(0.0, 2.98, rl), dpt(0.0, 0.07, rl)], stile, dpt(-1.0, 1.5, rl))                                    # the leading edge
    quad([dpt(tl, 0.07, rl0), dpt(tl, 2.98, rl0), dpt(tl, 2.98, rl), dpt(tl, 0.07, rl)], stile, dpt(tl + 1.0, 1.5, rl))
    # stiles and a rail on the leaf's face, the pull bar at its leading edge, two hangers up to the track
    for t_ in (0.06 / R, tl - 0.06 / R):
        kit.add_prism(r_, dpt(t_, 0.07, rl + 0.02), dpt(t_, 2.98, rl + 0.02), 0.11, 0.05, "m_pellam", stile, chamfer=0.0, up=kit.vsub(dpt(t_, 0, R + 1), dpt(t_, 0, R)), segs=3, final=True)
    for t_ in (0.45 / R, tl - 0.45 / R):
        kit.add_box(r_, dpt(t_, 3.0, rl - 0.03), (0.16, 0.2, 0.12), "m_pellam", mul(steel, 1.15), rot=-math.degrees(t_), sides="nsewt", final=True)
    # the pull: a recessed grip plate (anything standing proud of the leaf here is inside a nav link's body sweep)
    ga = 0.55 / R; gb = 0.75 / R
    quad([dpt(ga, 1.0, rl + 0.006), dpt(ga, 1.6, rl + 0.006), dpt(gb, 1.6, rl + 0.006), dpt(gb, 1.0, rl + 0.006)], mul(sdark, 0.9), dpt((ga + gb) / 2, 1.3, rl + 5))
    quad([dpt(ga + 0.03 / R, 1.08, rl + 0.01), dpt(ga + 0.03 / R, 1.52, rl + 0.01), dpt(gb - 0.03 / R, 1.52, rl + 0.01), dpt(gb - 0.03 / R, 1.08, rl + 0.01)], mul(sdark, 0.35), dpt((ga + gb) / 2, 1.3, rl + 5))
    # the sill: a steel threshold with the leaf's guide rail running on to where it parks
    for k in range(-2, 4):
        ta_ = k * dth; tb_ = (k + 1) * dth; tm_ = (ta_ + tb_) / 2
        quad([dpt(ta_, 0.05, R + 0.34), dpt(ta_, 0.05, R - 0.02), dpt(tb_, 0.05, R - 0.02), dpt(tb_, 0.05, R + 0.34)], mix(steel, lin("sand"), 0.3), dpt(tm_, 9.0, R + 0.2))
        quad([dpt(ta_, -0.03, R + 0.34), dpt(ta_, 0.05, R + 0.34), dpt(tb_, 0.05, R + 0.34), dpt(tb_, -0.03, R + 0.34)], mix(steel, lin("sand"), 0.55), dpt(tm_, 0.0, R + 5))
    kit.tessellate(r_, 1.3)
    # the grate apron at the drum's south foot: a Pellam floor plate with two recesses (the grate lids are props)
    g1 = layout.marker("sp_yard_grate_1")["pos"]; g2 = layout.marker("sp_yard_grate_2")["pos"]
    ax0 = min(g1[0], g2[0]) - 0.9; ax1 = max(g1[0], g2[0]) + 0.9; az0 = g1[2] - 0.85; az1 = g1[2] + 0.85
    fv0, fv1 = manifest.trim_v(PT, "floor", 2)
    cha = kit.chart("yd_apron", 1.0)
    xs_ = sorted({ax0, g1[0] - 0.6, g1[0] + 0.6, g2[0] - 0.6, g2[0] + 0.6, ax1}); zs_ = [az0, g1[2] - 0.6, g1[2] + 0.6, az1]
    for i in range(len(xs_) - 1):
        for j in range(3):
            hole = j == 1 and any(abs((xs_[i] + xs_[i + 1]) / 2 - g[0]) < 0.6 for g in (g1, g2))
            y = 0.012 if hole else 0.035
            pts = [(xs_[i], y, zs_[j]), (xs_[i], y, zs_[j + 1]), (xs_[i + 1], y, zs_[j + 1]), (xs_[i + 1], y, zs_[j])]
            p.poly(pts, "m_pellam", FL if hole else [((a[0] - ax0) / 3.6, fv0 + (fv1 - fv0) * (a[2] - az0) / 1.7) for a in pts],
                   mul(lin("steel_dark"), 0.4) if hole else mix(lin("steel"), lin("sand"), 0.35), cha, [(a[0], a[2]) for a in pts], final=True)
    # ---- the well-house: adobe built round the drum (the seam of the yard): three walls stand, broken and stepped;
    # the east side is the drum's door; its corners are down (the nav links pass them). What is left of the roof
    # still lies on its vigas between the wall heads and the drum's shoulder, in the two western pockets
    lm = Part("yd_well_lm", Z, paint=fr.paint(0.0, jitter=0.03)); vl = Part("yd_well_vl", Z, paint=fr.paint(0.0))
    rng = random.Random(191)
    half = R + 0.09
    zn = C[1] - half; zs = C[1] + half; xw = C[0] - half
    fr.stepped_wall((lm, vl), (C[0] - 3.1, zn), (C[0] + 3.4, zn), [(0.0, 0.4, 1.3), (0.4, 0.9, 2.2), (0.9, 2.3, 3.15), (2.3, 3.2, 2.7), (3.2, 4.45, 3.2), (4.45, 4.85, 2.72), (4.85, 5.2, 2.9), (5.2, 5.5, 2.28), (5.5, 5.8, 1.72), (5.8, 6.05, 1.9), (6.05, 6.3, 1.2), (6.3, 6.5, 0.62)],      # pass i4: the east end is the sighting's foreground: a ragged break (it was four even steps)
                    0.3, "yd_well_n", seed=194, density=1.0, batter=0.015, fallen=1.0)
    fr.stepped_wall((lm, vl), (xw, C[1] - 3.3), (xw, C[1] + 1.3), [(0.0, 0.45, 1.5), (0.45, 1.0, 2.6), (1.0, 2.6, 3.5), (2.6, 3.4, 3.2), (3.4, 4.1, 2.3), (4.1, 4.6, 1.2)],
                    0.3, "yd_well_w", seed=195, density=1.0, batter=0.015, fallen=1.0)
    fr.stepped_wall((lm, vl), (C[0] - 1.3, zs), (C[0] + 2.1, zs), [(0.0, 0.4, 1.4), (0.4, 1.1, 2.5), (1.1, 2.4, 3.3), (2.4, 3.0, 2.4), (3.0, 3.4, 1.3)],
                    0.3, "yd_well_s", seed=196, density=1.0, batter=0.015, fallen=1.0)
    # vigas from the wall heads to the drum, and what is left of the roof on them: latillas, a crust of adobe
    def viga(a, b_, w=0.18):
        kit.add_prism(vl, a, b_, w, w, "m_frontier", lin("board_dark"), row=(FT, "plank_a"), chamfer=0.04, caps="ab", segs=3, u_shift=rng.uniform(0, 3))
    yv = 3.05
    vg = []
    for xk in (C[0] - 1.6, C[0] - 0.2, C[0] + 1.2):                       # off the north wall, running south to the shell
        dz = math.sqrt(max(R * R - (xk - C[0]) ** 2, 0.0))
        a = (xk, yv, zn - 0.3); b_ = (xk + 0.05, yv - 0.04, C[1] - dz + 0.25); viga(a, b_); vg.append((a, b_))
    for zk in (C[1] - 1.9, C[1] - 0.6):                                   # off the west wall, running east
        dx = math.sqrt(max(R * R - (zk - C[1]) ** 2, 0.0))
        viga((xw - 0.3, yv + 0.32, zk), (C[0] - dx + 0.25, yv + 0.28, zk + 0.04))
    viga((C[0] + 0.3, 3.1, zs + 0.3), (C[0] + 0.35, 3.06, C[1] + math.sqrt(R * R - 0.1) - 0.25))
    # the north-west pocket still has its deck: sticks across two vigas and a slab of roof adobe, broken off ragged
    (a0, b0), (a1, b1) = vg[0], vg[1]
    for k in range(7):
        f = 0.08 + k * 0.1
        pa = kit.vadd(kit.mix(a0, b0, f), (-0.25, 0.11, 0.0)); pb = kit.vadd(kit.mix(a1, b1, f + rng.uniform(-0.02, 0.02)), (0.2 + rng.uniform(0.0, 0.3), 0.11, 0.0))
        kit.add_prism(vl, pa, pb, 0.07, 0.07, "m_frontier", lin("board_bleached") if k % 2 else lin("board"), row=(FT, "plank_a"), chamfer=0.0, segs=2, u_shift=rng.uniform(0, 3))
    sl = [(a0[0] - 0.3, 3.2, zn - 0.2), (a1[0] + 0.25, 3.2, zn - 0.2), (a1[0] + 0.4, 3.2, zn + 0.45), (a1[0] - 0.3, 3.2, zn + 0.72), (a0[0] + 0.2, 3.2, zn + 0.58), (a0[0] - 0.35, 3.2, zn + 0.3)]
    top = [(q[0], q[1] + 0.16, q[2]) for q in sl]
    crust = mix(lin("adobe"), lin("sand_pale"), 0.35)
    vl.poly(facing(top, (C[0], 20.0, zn)), "m_frontier", [row_uv(FT, "adobe", q[0], 0.8) for q in facing(top, (C[0], 20.0, zn))], crust)
    for k in range(len(sl)):
        j = (k + 1) % len(sl)
        mid_ = kit.vscale(kit.vadd(sl[k], sl[j]), 0.5)
        outp = (mid_[0] + (mid_[0] - (a0[0] + a1[0]) / 2) * 3, mid_[1], mid_[2] + (mid_[2] - (zn + 0.25)) * 3)
        vl.poly(facing([sl[k], sl[j], top[j], top[k]], outp), "m_frontier", row_uv(FT, "adobe", 0.3 * k, 0.1), mix(lin("adobe_base"), lin("rust"), 0.1))
    # rubble where the corners came down: low heaps (under 0.35 m: nothing a body meets)
    rb = Part("yd_well_rubble", Z)
    hc = R + 0.2
    for (cx, cz) in ((C[0] - hc + 0.3, C[1] + hc - 0.3), (C[0] + hc - 0.6, C[1] + hc - 0.2), (C[0] - hc + 0.2, C[1] - hc + 0.3), (C[0] + hc - 0.5, C[1] - hc + 0.3)):
        for k in range(4):
            x = cx + rng.uniform(-0.9, 0.9); z = cz + rng.uniform(-0.9, 0.9)
            if math.hypot(x - C[0], z - C[1]) < R + 0.25: continue
            rock.rock_chunk(rb, (x, 0.02, z), rng.uniform(0.18, 0.34), seed=rng.randrange(10 ** 6), dark=0.0, flat=0.55)
    for f in rb.f:                                                         # adobe lumps, not rock
        for k in range(len(f[3])): f[3][k] = mix(lin("adobe_base"), lin("sand"), 0.35 + 0.3 * (k % 2))
    kit.tessellate(vl, 1.5)
    S.extra["street"]["drum"] = dict(dth=dth)
    return [p, r_, lm, vl, rb]


# ====================================================================== the wind-pump
HUB_Y = 13.25
WIND = kit.vnorm((-1.0, 0.0, -1.0))                                         # the rotor faces the north-west wind (and the sun)


def derrick_lean(q):
    """The whole derrick leans 2 degrees to the south-east from its foot on the drum."""
    base = (C[0], DH, C[1])
    ang = math.radians(2.0); ax = kit.vnorm(kit.vcross((0.0, 1.0, 0.0), kit.vscale(WIND, -1.0)))
    v = kit.vsub(q, base); c = math.cos(ang); s = math.sin(ang)
    r = kit.vadd(kit.vadd(kit.vscale(v, c), kit.vscale(kit.vcross(ax, v), s)), kit.vscale(ax, kit.vdot(ax, v) * (1 - c)))
    return kit.vadd(base, r)


def build_derrick(S):
    p = Part("yd_derrick", Z, chunk=WORKS, paint=fr.paint(DH, dust=0.0, grad=(0.85, 1.08), grad_h=8.0, jitter=0.07, bleach=("board_bleached", 0.5)))
    rng = random.Random(211)
    y0 = DH + 0.25; y1 = 13.7
    half = lambda y: 1.7 + (0.55 - 1.7) * (y - y0) / (y1 - y0)
    corners = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
    leg = lambda k, y: (C[0] + corners[k][0] * half(y), y, C[1] + corners[k][1] * half(y))
    for k in range(4):
        kit.add_prism(p, leg(k, y0 - 0.2), leg(k, y1), 0.3, 0.3, "m_frontier", lin("board"), row=(FT, "plank_a"), chamfer=0.05, taper=0.25, segs=5, caps="b", u_shift=rng.uniform(0, 3))
        # a steel shoe bolting the leg to the drum
        b = leg(k, y0 - 0.2)
        kit.add_box(p, (b[0], y0 - 0.05, b[2]), (0.5, 0.36, 0.5), "m_frontier", mul(lin("rust"), 0.8), sides="nsewt")
    tiers = [y0 + 0.3, 8.3, 10.3, 12.2]
    for t in range(len(tiers)):
        y = tiers[t]
        for k in range(4):
            a = leg(k, y); b = leg((k + 1) % 4, y)
            kit.add_prism(p, a, b, 0.2, 0.22, "m_frontier", lin("board"), row=(FT, "plank_b"), chamfer=0.03, segs=2, u_shift=rng.uniform(0, 3))
            if t < len(tiers) - 1:
                yb = tiers[t + 1]
                skip = (t == 1 and k == 2)                                 # one brace is gone
                for (i0, i1) in (((k, y), ((k + 1) % 4, yb)), (((k + 1) % 4, y), (k, yb))):
                    if skip and i0[0] == k: continue
                    kit.add_prism(p, leg(*i0), leg(*i1), 0.2, 0.14, "m_frontier", lin("board_bleached") if (t + k) % 3 == 0 else lin("board"), row=(FT, "plank_a"), chamfer=0.0, segs=2, u_shift=rng.uniform(0, 3))
    # the platform at 11 m: planks on two bearers, a rail on three sides
    py = 11.0; ph = 1.55
    for k in range(8):
        x = C[0] - ph + 0.01 + k * (2 * ph / 8)
        if k == 5: continue                                                 # a plank is missing
        kit.add_box(p, (x + ph / 8, py, C[1]), (2 * ph / 8 - 0.03, 0.06, 2 * ph + rng.uniform(-0.1, 0.25)), "m_frontier", mul(lin("board_bleached"), 0.9 + 0.2 * rng.random()),
                    row=(FT, "plank_a", "z"), sides="nsewtb", u_shift=rng.uniform(0, 3))
    for (dx, dz) in corners:
        kit.add_prism(p, (C[0] + dx * ph, py, C[1] + dz * ph), (C[0] + dx * ph, py + 1.0, C[1] + dz * ph), 0.1, 0.1, "m_frontier", lin("board"), row=(FT, "plank_a"), chamfer=0.015)
    for k in (0, 1, 3):
        a = (C[0] + corners[k][0] * ph, py + 0.95, C[1] + corners[k][1] * ph); b = (C[0] + corners[(k + 1) % 4][0] * ph, py + 0.95, C[1] + corners[(k + 1) % 4][1] * ph)
        kit.add_prism(p, a, b, 0.09, 0.09, "m_frontier", lin("board_bleached"), row=(FT, "plank_a"), chamfer=0.015, segs=2)
    # the head: a cap frame and the bearing box the rotor's shaft runs in
    kit.add_box(p, (C[0], y1 + 0.1, C[1]), (1.5, 0.22, 1.5), "m_frontier", lin("board_dark"), row=(FT, "plank_b", "x"), sides="nsewtb")
    kit.add_box(p, (C[0], HUB_Y, C[1]), (0.7, 0.6, 0.7), "m_frontier", mul(lin("rust"), 0.7), sides="nsewtb", rot=45.0)
    # the pump rod down the middle (fat: it is seen from the street), a ladder up the east side
    kit.add_prism(p, (C[0], DH + 0.3, C[1]), (C[0], y1, C[1]), 0.14, 0.14, "m_frontier", mul(lin("rust"), 0.75), chamfer=0.0, segs=4)
    for sx in (-0.28, 0.28):
        kit.add_prism(p, (C[0] + half(y0) + 0.02, y0, C[1] + sx), (C[0] + half(py) + 0.02, py, C[1] + sx), 0.09, 0.09, "m_frontier", lin("board"), row=(FT, "plank_a"), chamfer=0.0, segs=3)
    for k in range(9):
        y = y0 + 0.4 + k * 0.5
        kit.add_prism(p, (C[0] + half(y) + 0.02, y, C[1] - 0.3), (C[0] + half(y) + 0.02, y, C[1] + 0.3), 0.07, 0.07, "m_frontier", lin("board_bleached"), row=(FT, "plank_a"), chamfer=0.0)
    p.transform(derrick_lean)
    kit.tessellate(p, 1.6)
    return [p]


def rotor_part():
    """pump_rotor: 5 m across, seven vane sockets, six tin vanes 0.5 x 1.9 m (one missing). Built facing the wind;
    realize_node turns it into its own frame (origin on the hub axis)."""
    p = Part("pump_rotor", Z, paint=fr.paint(DH, dust=0.0, grad=(0.95, 1.05), grad_h=9.0, jitter=0.05))
    hub = derrick_lean(kit.vadd((C[0], HUB_Y, C[1]), kit.vscale(WIND, 1.5)))
    axis = WIND
    side = kit.vnorm(kit.vcross((0.0, 1.0, 0.0), axis)); up = (0.0, 1.0, 0.0)
    rng = random.Random(221)
    rad = lambda a, r, d=0.0: kit.vadd(kit.vadd(hub, kit.vscale(kit.vadd(kit.vscale(side, math.cos(a)), kit.vscale(up, math.sin(a))), r)), kit.vscale(axis, d))
    # hub and shaft
    kit.add_prism(p, kit.vadd(hub, kit.vscale(axis, -1.3)), kit.vadd(hub, kit.vscale(axis, 0.3)), 0.2, 0.2, "m_frontier", mul(lin("rust"), 0.7), chamfer=0.04, caps="b")
    kit.add_prism(p, kit.vadd(hub, kit.vscale(axis, -0.12)), kit.vadd(hub, kit.vscale(axis, 0.14)), 0.62, 0.62, "m_frontier", lin("board_dark"), chamfer=0.16, caps="ab")
    n = 7
    for k in range(n):
        a = 2 * math.pi * k / n + 0.21
        kit.add_prism(p, rad(a, 0.25), rad(a, 2.5), 0.11, 0.09, "m_frontier", lin("board"), row=(FT, "plank_a"), chamfer=0.0, up=axis, segs=2, u_shift=rng.uniform(0, 3))
        if k == 4: continue                                                 # the missing vane: a bare arm
        # a tin vane, pitched 24 degrees about its arm, both faces
        t = kit.vnorm(kit.vsub(rad(a + 0.01, 1.0), rad(a - 0.01, 1.0)))     # tangential
        pitch = math.radians(24.0)
        w = kit.vadd(kit.vscale(t, math.cos(pitch)), kit.vscale(axis, math.sin(pitch)))
        r0 = 0.6; r1 = 2.5; hw0 = 0.2; hw1 = 0.3
        tone = mul(mix(lin("tin"), lin("rust"), 0.15 * rng.random()), 0.92 + 0.16 * rng.random())
        for (ra, rb) in ((r0, (r0 + r1) / 2), ((r0 + r1) / 2, r1)):
            ha = hw0 + (hw1 - hw0) * (ra - r0) / (r1 - r0); hb = hw0 + (hw1 - hw0) * (rb - r0) / (r1 - r0)
            q = [kit.vadd(rad(a, ra, 0.06), kit.vscale(w, -ha)), kit.vadd(rad(a, ra, 0.06), kit.vscale(w, ha)), kit.vadd(rad(a, rb, 0.06), kit.vscale(w, hb)), kit.vadd(rad(a, rb, 0.06), kit.vscale(w, -hb))]
            uvs = [row_uv(FT, "tin", 0.0, 0.0), row_uv(FT, "tin", 2 * ha, 0.0), row_uv(FT, "tin", 2 * hb, 1.0), row_uv(FT, "tin", 0.0, 1.0)]
            p.poly(q, "m_frontier", uvs, tone); p.poly(q[::-1], "m_frontier", uvs[::-1], mul(tone, 0.85))
    # two hoops tie the arms
    for (r, th) in ((1.25, 0.1), (2.42, 0.12)):
        m = 14
        for k in range(m):
            a = 2 * math.pi * k / m + 0.21; b = 2 * math.pi * (k + 1) / m + 0.21
            kit.add_prism(p, rad(a, r, -0.03), rad(b, r, -0.03), th, 0.05, "m_frontier", mul(lin("rust"), 0.75), chamfer=0.0, up=axis)
    return p, hub


def tail_part():
    """pump_tail: the boom and the tin tail vane with the town's brushed mark (geometry: it is 0.6 m tall)."""
    p = Part("pump_tail", Z, paint=fr.paint(DH, dust=0.0, grad=(0.95, 1.05), grad_h=9.0, jitter=0.04))
    pivot = derrick_lean((C[0], HUB_Y, C[1]))
    back = kit.vscale(WIND, -1.0); up = (0.0, 1.0, 0.0)
    at = lambda d, y=0.0: kit.vadd(kit.vadd(pivot, kit.vscale(back, d)), (0.0, y, 0.0))
    kit.add_prism(p, at(0.3, 0.1), at(3.4, 0.25), 0.14, 0.12, "m_frontier", lin("board"), row=(FT, "plank_a"), chamfer=0.02, segs=3)
    kit.add_prism(p, at(0.3, -0.5), at(2.6, 0.1), 0.09, 0.08, "m_frontier", lin("board_bleached"), row=(FT, "plank_a"), chamfer=0.0, segs=2)
    q = [at(2.5, -0.55), at(4.1, -0.85), at(4.25, 1.05), at(2.5, 0.75)]
    side = kit.vnorm(kit.vcross(up, back))
    tin = mul(lin("tin"), 0.98)
    for sgn in (1, -1):
        pts = [kit.vadd(v, kit.vscale(side, 0.02 * sgn)) for v in q]
        mid = [kit.vscale(kit.vadd(pts[0], pts[3]), 0.5), kit.vscale(kit.vadd(pts[1], pts[2]), 0.5)]
        for quad in ([pts[0], pts[1], mid[1], mid[0]], [mid[0], mid[1], pts[2], pts[3]]):
            if sgn < 0: quad = quad[::-1]
            p.poly(quad, "m_frontier", [row_uv(FT, "tin", kit.vdot(kit.vsub(v, pts[0]), back), clamp((v[1] - pts[0][1] + 0.3) / 1.9)) for v in quad], tin)
        # the mark, brushed by hand: six blobs in a ring, a dragged stroke, a thumbed seventh
        cc = at(3.25, 0.42); U = 0.2; paint_c = lin("town_paint")
        rr = random.Random(5)
        def blob(cx, cy, r):
            c0 = kit.vadd(kit.vadd(kit.vadd(cc, kit.vscale(back, cx * sgn)), (0.0, cy, 0.0)), kit.vscale(side, 0.028 * sgn))
            ring = [kit.vadd(kit.vadd(c0, kit.vscale(back, math.cos(2 * math.pi * k / 6) * r * rr.uniform(0.8, 1.2) * sgn)), (0.0, math.sin(2 * math.pi * k / 6) * r * rr.uniform(0.8, 1.2), 0.0)) for k in range(6)]
            p.poly(ring if sgn > 0 else ring, "m_frontier", flat_uv("m_frontier"), paint_c, final=True)
        for k in range(6):
            a = math.radians(30 + 60 * k) + rr.uniform(-0.12, 0.12)
            blob(math.sin(a) * U, math.cos(a) * U, 0.06)
        blob(0.02, -2.38 * U, 0.075)
        s0 = kit.vadd(kit.vadd(cc, kit.vscale(side, 0.028 * sgn)), (0.0, 0.0, 0.0)); s1 = kit.vadd(kit.vadd(kit.vadd(cc, kit.vscale(back, 0.03 * sgn)), (0.0, -2.1 * U, 0.0)), kit.vscale(side, 0.028 * sgn))
        wv = kit.vscale(back, 0.022)
        strip = [kit.vsub(s0, wv), kit.vadd(s0, wv), kit.vadd(s1, wv), kit.vsub(s1, wv)]
        p.poly(strip if sgn < 0 else strip[::-1], "m_frontier", flat_uv("m_frontier"), paint_c, final=True)
    return p, pivot


def realize_node(part, name, origin, yaw_front=None):
    """One mesh object from a Part (a drawn node, not a chunk mesh): origin at game point `origin`; yaw_front: the game
    (x, z) direction the node's FRONT (+Z in game, -Y in Blender) looks along."""
    cols = kit._painted(part)
    verts = [layout.to_blender(v) for v in part.v]
    me = bpy.data.meshes.new("me_" + name)
    faces = [f[0] for f in part.f]
    me.from_pydata(verts, [], faces)
    import numpy as np
    nl = sum(len(f) for f in faces)
    u = np.zeros((nl, 2), np.float32); c = np.ones((nl, 4), np.float32)
    k = 0
    for fi, f in enumerate(part.f):
        for j in range(len(f[0])):
            u[k] = f[2][j]; c[k, :3] = cols[fi][j]; k += 1
    me.uv_layers.new(name="UVMap").data.foreach_set("uv", u.ravel())
    me.color_attributes.new("Color", 'FLOAT_COLOR', 'CORNER').data.foreach_set("color", c.ravel())
    from lib import material
    me.materials.append(material.game_material("m_frontier"))
    me.update()
    ob = bpy.data.objects.new(name, me); link(ob)
    o = Vector(layout.to_blender(origin))
    rz = 0.0
    if yaw_front is not None:
        d = Vector(layout.to_blender((yaw_front[0], 0.0, yaw_front[1])))
        rz = math.atan2(d.x, -d.y)                                          # local -Y -> d
    M = Matrix.Translation(o) @ Matrix.Rotation(rz, 4, 'Z')
    me.transform(M.inverted()); ob.matrix_world = M
    ob["bake"] = "VL"; ob["wind"] = 0
    return ob


# ====================================================================== the tank, its deck and ramp, the shed, the stubs
def build_tank(S):
    p = Part("yd_tank", Z, chunk=WORKS, paint=fr.paint(0.0, jitter=0.07, bleach=("board_bleached", 0.4)))
    lmp = Part("yd_tank_lm", Z, chunk=WORKS, paint=fr.paint(0.0, jitter=0.05))
    rng = random.Random(231)
    dk = SOL["yd_tank_deck"]; tk = SOL["yd_tank"]; bd = SOL["yd_tank_boards"]; rp = SOL["yd_tank_ramp"]
    x0 = dk["pos"][0] - dk["size"][0] / 2; x1 = dk["pos"][0] + dk["size"][0] / 2; z0 = dk["pos"][2] - dk["size"][2] / 2; z1 = dk["pos"][2] + dk["size"][2] / 2
    top = dk["pos"][1] + dk["size"][1] / 2                                   # 3.5
    # stilts with knee braces
    for k in range(1, 5):
        s = SOL["yd_tank_stilt_%d" % k]
        kit.add_prism(p, (s["pos"][0], 0.0, s["pos"][2]), (s["pos"][0] + rng.uniform(-0.03, 0.03), top - 0.3, s["pos"][2] + rng.uniform(-0.03, 0.03)), 0.4, 0.4, "m_frontier", lin("board_dark"),
                      row=(FT, "plank_a"), chamfer=0.06, taper=0.08, segs=4, u_shift=rng.uniform(0, 3))
    for (xa, za, xb, zb) in ((x0 + 0.2, z0 + 0.2, x1 - 0.2, z0 + 0.2), (x0 + 0.2, z1 - 0.2, x1 - 0.2, z1 - 0.2), (x0 + 0.2, z0 + 0.2, x0 + 0.2, z1 - 0.2), (x1 - 0.2, z0 + 0.2, x1 - 0.2, z1 - 0.2)):
        kit.add_prism(p, (xa, top - 0.42, za), (xb, top - 0.42, zb), 0.2, 0.26, "m_frontier", lin("board"), row=(FT, "plank_b"), chamfer=0.03, segs=3, u_shift=rng.uniform(0, 3))
        # knee braces from each stilt to the beam, high (the space under the deck is walked)
        for (px, pz, qx, qz) in ((xa, za, xb, zb), (xb, zb, xa, za)):
            d = math.hypot(qx - px, qz - pz); ux, uz = (qx - px) / d, (qz - pz) / d
            kit.add_prism(p, (px + ux * 0.2, 2.15, pz + uz * 0.2), (px + ux * 1.0, top - 0.5, pz + uz * 1.0), 0.14, 0.12, "m_frontier", lin("board_bleached"), row=(FT, "plank_a"), chamfer=0.0)
    # the deck: planks along x, 1 m clear all round the tank
    z = z0
    while z < z1 - 1e-6:
        wd = min(z1 - z, rng.uniform(0.3, 0.42))
        kit.add_box(p, ((x0 + x1) / 2 + rng.uniform(-0.05, 0.05), top - 0.04, z + wd / 2), (x1 - x0 + rng.uniform(0.0, 0.16), 0.08, wd - 0.015), "m_frontier",
                    mul(lin("board_bleached"), 0.88 + 0.2 * rng.random()), row=(FT, "plank_a", "x"), sides="nsewtb", u_shift=rng.uniform(0, 3))
        z += wd
    # the north side boarded from the ground to the deck: full-height cover facing the yard (lightmapped: it is at eye level)
    Fn = fr.Frame((x1, 0.0, bd["pos"][2] - bd["size"][2] / 2), (-1.0, 0.0), lean_deg=1.0)
    fr.boards(lmp, Fn, 0.0, x1 - x0, 0.0, top - 0.42, 0.0, True, "board", rng, kit.chart("yd_tank_boards", 1.0), wmin=0.2, wmax=0.3, tone_jit=0.12)
    Fs = fr.Frame((x0, 0.0, bd["pos"][2] + bd["size"][2] / 2), (1.0, 0.0))
    fr.boards(p, Fs, 0.0, x1 - x0, 0.0, top - 0.42, 0.0, True, "board_dark", rng, None, wmin=0.3, wmax=0.45, seg=1.7)
    # the tank: staves, three hoops, a board lid
    tc = (tk["pos"][0], tk["pos"][2]); tr = tk["size"][0] / 2; ty0 = tk["pos"][1] - tk["size"][1] / 2; ty1 = tk["pos"][1] + tk["size"][1] / 2
    n = 24
    for i in range(n):
        a = 2 * math.pi * i / n; b = 2 * math.pi * (i + 1) / n
        tone = mul(mix(lin("board"), lin("board_bleached"), rng.random() * 0.6), 0.9 + 0.2 * rng.random())
        sh = rng.uniform(0, 3); reg = "plank_a" if i % 3 else "plank_b"
        for (ya, yb) in ((ty0, (ty0 + ty1) / 2), ((ty0 + ty1) / 2, ty1 + rng.uniform(-0.03, 0.05))):
            ra = tr * 0.95; rb_ = tr * 0.95                                      # within the solid: the catwalk's links pass 0.45 m from it
            q = [(tc[0] + math.cos(a) * ra, ya, tc[1] + math.sin(a) * ra), (tc[0] + math.cos(a) * rb_, yb, tc[1] + math.sin(a) * rb_),
                 (tc[0] + math.cos(b) * rb_, yb, tc[1] + math.sin(b) * rb_), (tc[0] + math.cos(b) * ra, ya, tc[1] + math.sin(b) * ra)]
            p.poly(q, "m_frontier", [row_uv(FT, reg, ya + sh, 0.0), row_uv(FT, reg, yb + sh, 0.0), row_uv(FT, reg, yb + sh, 1.0), row_uv(FT, reg, ya + sh, 1.0)], tone)
    for hy in (ty0 + 0.25, ty0 + 1.3, ty1 - 0.3):
        kit.add_cyl(p, (tc[0], hy, tc[1]), tr * 0.95 + 0.035, 0.09, "m_frontier", mul(lin("rust"), 0.8), segs=n, cap_top=True, cap_bottom=True, uv=row_uv(FT, "strap", 0.1, 0.5))
    kit.add_cyl(p, (tc[0], ty1 - 0.02, tc[1]), tr * 0.99, 0.07, "m_frontier", lin("board_bleached"), segs=n, r_top=tr * 0.6, cap_top=True)
    # the ramp: three long boards on stringers and trestles, cleats across
    rx0 = rp["pos"][0] - rp["size"][0] / 2; rx1 = rp["pos"][0] + rp["size"][0] / 2; rz0 = rp["pos"][2] - rp["size"][2] / 2; rz1 = rp["pos"][2] + rp["size"][2] / 2
    ry = lambda x: (x - rx0) / (rx1 - rx0) * rp["size"][1]
    zz = rz0
    k = 0
    while zz < rz1 - 1e-6:
        wd = min(rz1 - zz, rng.uniform(0.45, 0.6))
        kit.add_prism(p, (rx0 - 0.1, ry(rx0) - 0.035, zz + wd / 2), (rx1 + 0.05, ry(rx1) - 0.035, zz + wd / 2), wd - 0.02, 0.07, "m_frontier", mul(lin("board_bleached"), 0.9 + 0.2 * rng.random()),
                      row=(FT, "plank_a" if k % 2 else "plank_b"), chamfer=0.0, segs=5, u_shift=rng.uniform(0, 3), caps="ab")
        zz += wd; k += 1
    x = rx0 + 0.45
    while x < rx1 - 0.2:
        kit.add_box(p, (x, ry(x) + 0.025, (rz0 + rz1) / 2), (0.07, 0.05, rz1 - rz0 - 0.1), "m_frontier", lin("board_dark"), sides="nsewt", rot=0.0)
        x += 0.5
    for zs in (rz0 + 0.1, rz1 - 0.1):
        kit.add_prism(p, (rx0, ry(rx0) - 0.17, zs), (rx1, ry(rx1) - 0.17, zs), 0.12, 0.2, "m_frontier", lin("board"), row=(FT, "plank_b"), chamfer=0.02, segs=5)
    for x in (rx0 + 2.4, rx0 + 4.7):
        for zs in (rz0 + 0.1, rz1 - 0.1):
            kit.add_prism(p, (x, 0.0, zs), (x, ry(x) - 0.25, zs), 0.16, 0.16, "m_frontier", lin("board_dark"), row=(FT, "plank_a"), chamfer=0.025, segs=2)
        kit.add_prism(p, (x, ry(x) - 0.33, rz0 + 0.1), (x, ry(x) - 0.33, rz1 - 0.1), 0.14, 0.14, "m_frontier", lin("board"), row=(FT, "plank_a"), chamfer=0.02)
    kit.tessellate(p, 2.6)
    return [p, lmp]


def build_shed(S):
    """The tank shed: an adobe lean-to in the yard's south-west corner; the third Transit comes out of its east door."""
    s = SOL["yd_shed"]
    x0 = s["pos"][0] - s["size"][0] / 2; x1 = s["pos"][0] + s["size"][0] / 2; z0 = s["pos"][2] - s["size"][2] / 2; z1 = s["pos"][2] + s["size"][2] / 2; H = s["size"][1]
    lm = Part("yd_shed_lm", Z, paint=fr.paint(0.0, jitter=0.03)); vl = Part("yd_shed_vl", Z, paint=fr.paint(0.0))
    rng = random.Random(241)
    Fe = fr.Frame((x1, 0.0, z1), (0.0, -1.0))                                  # east face (N = +x), u from the south end
    door = (1.3, 2.7, 0.0, 2.15)
    fr.adobe_face(lm, Fe, 0.0, z1 - z0, 0.0, H - 0.25, 0.0, kit.chart("yd_shed_e", 1.0), [door], seed=243, fallen=0.9, step=1.3, batter=0.015,
                  top_fn=lambda u: H - 0.55 + 0.3 * (u / (z1 - z0)))
    fr.dark_box(vl, Fe, door[0], door[1], 0.0, door[3], 1.3)
    fr.beam(vl, Fe, (door[0] - 0.3, door[3] + 0.1, 0.02), (door[1] + 0.3, door[3] + 0.13, 0.02), 0.22, 0.2, "board_dark", chamfer=0.03, caps="ab")
    Fn = fr.Frame((x0, 0.0, z0), (1.0, 0.0)); Fn.N = (0.0, 0.0, -1.0)
    Fn = fr.Frame((x1, 0.0, z0), (-1.0, 0.0))                                  # north face (N = -z)
    fr.adobe_face(lm, Fn, 0.0, x1 - x0, 0.0, H - 0.05, 0.0, kit.chart("yd_shed_n", 1.0), [], seed=245, fallen=0.9, step=1.3, batter=0.015)
    # tin roof falling to the south, lapped over the walls
    Fr_ = fr.Frame((x0, 0.0, z0), (1.0, 0.0))                                  # N = +z: w runs south
    fr.tin_sheets(vl, Fr_, -0.15, x1 - x0 + 0.2, (H - 0.55, z1 - z0), (H + 0.05, -0.2), rng, seg=2.2)
    return [lm, vl]


def build_dress(S):
    """Polish round 2: the yard was walls on empty sand. What the town did with the works, along the walls where nobody
    walks (the nav links keep 0.85 m from every wall; anything on the open floor is under 0.35 m): Pellam pipe standing
    out of the ground by the west wall and one run of it lying toward the drum (intrusion), a plank trough on the south
    wall fed by a length of the works' cable used as a rope (salvage), a ladder and a stack of new adobe at the gap in
    the west wall (repair), spare vigas along the east wall. Vertex-lit, on the chunk's own m_frontier (colour in
    COLOR_0 on the flat cell where the thing is ceramic or steel: this chunk has no m_pellam)."""
    FLF = flat_uv("m_frontier")
    rng = random.Random(277)
    d = Part("yd_dress", Z, paint=None)
    w = Part("yd_dress_wood", Z, paint=fr.paint(0.0, jitter=0.05))
    enamel = lin("enamel"); stain = lin("enamel_stain"); steel = lin("steel"); livery = lin("livery")
    gy = lambda x, z: 0.035 * fbm(x / 5.0, z / 5.0, 21, 2)

    def pipe(x, z, r, h, broken=False, lean=(0.0, 0.0)):
        kit.add_cyl(d, (x, -0.1, z), r, h + 0.1, "m_frontier", mix(enamel, stain, 0.45), segs=10, r_top=r, cap_top=not broken, rows=1, uv=FLF, final=True, lean=lean)
        kit.add_cyl(d, (x, 0.0, z), r + 0.05, 0.14, "m_frontier", mul(steel, 0.8), segs=10, cap_top=True, uv=FLF, final=True)            # the collar at the ground
        if not broken:
            kit.add_cyl(d, (x + lean[0] * h, h - 0.16, z + lean[1] * h), r + 0.035, 0.1, "m_frontier", mul(livery, 0.8), segs=10, cap_top=True, uv=FLF, final=True)   # livery band under the cap
        else:
            kit.add_cyl(d, (x + lean[0] * h, h - 0.3, z + lean[1] * h), r - 0.06, 0.28, "m_frontier", mul(lin("steel_dark"), 0.4), segs=10, cap_top=True, uv=FLF, final=True)   # the bore: dark
    # --- by the west wall, north of the gap: three risers of the old works, one broken off, and the run to the drum
    pipe(-109.42, -4.1, 0.24, 1.15, lean=(0.03, 0.0))
    pipe(-109.38, -2.95, 0.24, 0.62, broken=True)
    pipe(-109.5, -5.3, 0.17, 0.84, lean=(0.0, -0.04))
    run = [(-109.1, 0.12, -3.55), (-107.6, 0.1, -3.4), (-106.3, 0.07, -3.15), (-105.3, 0.02, -3.05)]
    for a_, b_ in zip(run[:-1], run[1:]): kit.add_prism(d, a_, b_, 0.3, 0.3, "m_frontier", mix(enamel, stain, 0.55), chamfer=0.08, final=True)
    kit.add_prism(d, (-108.35, 0.12, -3.48), (-108.2, 0.12, -3.46), 0.38, 0.38, "m_frontier", mul(steel, 0.75), chamfer=0.1, final=True)       # a coupling
    # a tin pail the town left under the broken riser (the misreading: it is watched like a spring)
    kit.add_cyl(d, (-108.92, 0.0, -2.6), 0.13, 0.26, "m_frontier", lin("tin"), segs=8, r_top=0.16, cap_top=False, cap_bottom=True, uv=FLF, final=True)
    kit.add_cyl(d, (-108.92, 0.2, -2.6), 0.145, 0.004, "m_frontier", mul(lin("tin"), 0.3), segs=8, cap_top=True, uv=FLF, final=True)
    # --- one more riser with a hand-wheel on the east wall, south of the yard door
    pipe(-80.52, 4.3, 0.2, 0.95)
    kit.add_cyl(d, (-80.52, 1.0, 4.3), 0.26, 0.05, "m_frontier", mul(lin("rust"), 0.8), segs=8, cap_top=True, uv=FLF, final=True)
    kit.add_prism(d, (-80.52, 0.9, 4.3), (-80.52, 1.03, 4.3), 0.06, 0.06, "m_frontier", mul(steel, 0.6), final=True)
    # --- the plank trough on the south wall, its legs, the dark of its dry floor
    Ft = fr.Frame((-98.9, 0.0, 13.94), (-1.0, 0.0))                       # looks north into the yard; w runs north
    TL = 2.6
    for (u0, u1, w0, w1) in ((0.0, TL, 0.56, 0.62), (0.0, TL, 0.04, 0.1), (0.0, 0.06, 0.1, 0.56), (TL - 0.06, TL, 0.1, 0.56)):
        fr.fbox(w, Ft, u0, u1, 0.26, 0.66, w0, w1, lin("board"), "plank_a", "u" if u1 - u0 > 1 else "w", "fbtlr", shift=rng.uniform(0, 3))
    w.poly([Ft.p(0.06, 0.36, 0.1), Ft.p(0.06, 0.36, 0.56), Ft.p(TL - 0.06, 0.36, 0.56), Ft.p(TL - 0.06, 0.36, 0.1)][::-1], "m_frontier", FLF, mul(lin("board_dark"), 0.35), final=True)
    w.poly([Ft.p(0.0, 0.26, 0.04), Ft.p(TL, 0.26, 0.04), Ft.p(TL, 0.26, 0.62), Ft.p(0.0, 0.26, 0.62)], "m_frontier", FLF, mul(lin("board_dark"), 0.3), final=True)
    for u in (0.3, TL - 0.3):
        for ww_ in (0.1, 0.5):
            fr.fbox(w, Ft, u - 0.05, u + 0.05, 0.0, 0.26, ww_, ww_ + 0.09, lin("board_dark"), "plank_a", "y", "fblr")
    # the cable: a length of the works' braided line, from a peg by the drum's south side across the yard to the trough,
    # where it goes up over a peg in the wall: a rope for the pail (7 cm: it lies on the sand)
    cab = lin("cable")
    cr = [(-103.9, 1.6), (-103.3, 3.4), (-102.2, 5.2), (-101.9, 7.6), (-100.9, 9.9), (-100.6, 12.2), (-100.25, 13.3)]
    crp = [(x, gy(x, z) + 0.05, z) for (x, z) in cr]
    for a_, b_ in zip(crp[:-1], crp[1:]): kit.add_prism(d, a_, b_, 0.075, 0.075, "m_frontier", cab, chamfer=0.0, segs=1, final=True)
    kit.add_prism(d, crp[-1], (-100.2, 1.55, 13.86), 0.07, 0.07, "m_frontier", cab, chamfer=0.0, final=True)
    kit.add_prism(d, (-100.2, 1.5, 13.95), (-100.2, 1.62, 13.74), 0.06, 0.06, "m_frontier", mul(lin("rust"), 0.75), chamfer=0.0, caps="b", final=True)
    kit.add_prism(d, (crp[0][0], -0.05, crp[0][2]), (crp[0][0] + 0.03, 0.3, crp[0][2]), 0.06, 0.06, "m_frontier", mul(lin("rust"), 0.75), chamfer=0.0, caps="b", final=True)
    # --- repair at the gap in the west wall (z 2.9..5.6): a stack of new adobe and a ladder against the wall
    for k, (dx_, dz_, n_) in enumerate(((0.0, 0.0, 4), (0.0, 0.46, 4), (0.02, 0.92, 3), (0.42, 0.2, 2))):
        for j in range(n_):
            kit.add_box(w, (-109.35 + dx_ + rng.uniform(-0.02, 0.02), 0.06 + 0.125 * j, 6.5 + dz_ + rng.uniform(-0.02, 0.02)), (0.4, 0.115, 0.42), "m_frontier",
                        mul(mix(lin("adobe"), lin("adobe_base"), 0.35 + 0.3 * rng.random()), rng.uniform(0.9, 1.08)), rot=rng.uniform(-5, 5), sides="nsewt",
                        uv=row_uv(FT, "adobe", 0.3 * k + 0.1 * j, 0.1), final=False)
    for zz in (3.55, 4.05):
        fr.beam(w, fr.Frame((0.0, 0.0, 0.0), (1.0, 0.0)), (-108.92, 0.0, zz), (-109.82, 2.75, zz), 0.07, 0.06, "board_bleached", chamfer=0.01, caps="b", segs=2)
    for k in range(6):
        t = (k + 0.7) / 6.6
        x = -108.92 + (-109.82 + 108.92) * t; y = 2.75 * t
        fr.beam(w, fr.Frame((0.0, 0.0, 0.0), (1.0, 0.0)), (x, y, 3.5), (x, y, 4.1), 0.055, 0.055, "board", chamfer=0.0)
    # --- spare vigas along the east wall, south of the riser: two on the sand, one across them
    for k, (x, y, z0, z1, r_) in enumerate(((-80.42, 0.11, 6.1, 9.7, 0.22), (-80.68, 0.1, 6.4, 10.1, 0.2), (-80.55, 0.29, 5.8, 9.2, 0.19))):
        fr.beam(w, fr.Frame((0.0, 0.0, 0.0), (1.0, 0.0)), (x, y, z0), (x + 0.03 * (k - 1), y + 0.01, z1), r_, r_, "board_dark" if k != 1 else "board", chamfer=0.06, caps="ab", segs=2, shift=rng.uniform(0, 3))
    # --- the footing of the building the three stubs were walls of: a course of adobe and stone a hand high, running
    # between them (a doorway's gap in the north run), so the stubs read as one ruin and the open floor is not empty.
    # Nothing over 0.3 m: it lies across the nav links and nobody's body meets it.
    ft = Part("yd_footing", Z, smooth=24)
    frng = random.Random(291)
    runs = [((-103.3, 6.0), (-97.55, 6.15), (-101.2, -99.9)), ((-97.0, 7.95), (-97.05, 11.3), None), ((-106.45, 6.45), (-106.4, 9.7), None)]
    for (pa, pb, gap) in runs:
        L_ = math.hypot(pb[0] - pa[0], pb[1] - pa[1]); u = 0.0; k = 0
        ang = math.degrees(math.atan2(-(pb[1] - pa[1]), pb[0] - pa[0]))
        while u < L_ - 0.3:
            ln = min(L_ - u, frng.uniform(0.5, 0.95)); hh = frng.uniform(0.14, 0.28)
            x = pa[0] + (pb[0] - pa[0]) * (u + ln / 2) / L_; z = pa[1] + (pb[1] - pa[1]) * (u + ln / 2) / L_
            if not (gap and gap[0] < x < gap[1]) and frng.random() < 0.86:
                n0 = len(ft.f)
                rock.rock_box(ft, (x + frng.uniform(-0.04, 0.04), hh / 2 - 0.06, z + frng.uniform(-0.05, 0.05)), (ln - 0.04, hh + 0.12, frng.uniform(0.4, 0.52)), rot=ang + frng.uniform(-6, 6),
                              seed=300 + k + int(abs(x) * 7), n=2, bulge=0.03, chamfer=0.06, cuts=1, cut_depth=(0.05, 0.12))
                rock.retint(ft, n0, mul(mix(lin("adobe_base"), lin("sand"), 0.25 + 0.3 * frng.random()), frng.uniform(0.8, 1.0)), 0.85)
            u += ln; k += 1
    # boards that came off the tank and the ramp, lying where they were dropped
    for (x, z, r_, ln) in ((-93.6, 11.2, 14.0, 2.3), (-92.9, 11.55, 31.0, 1.8), (-89.4, 2.9, -52.0, 2.5), (-99.2, 8.3, 78.0, 2.1), (-84.6, 12.2, 5.0, 2.6)):
        kit.add_box(w, (x, 0.035 + gy(x, z), z), (ln, 0.04, 0.2), "m_frontier", mul(lin("board_bleached"), rng.uniform(0.8, 1.05)), rot=r_, sides="nsewt", row=(FT, "plank_a", "x"), u_shift=rng.uniform(0, 3))
    # sand drifted on the north-west side of what stands in the yard
    dr = Part("yd_drifts", Z, smooth=40)
    for k, (ax, az, hh, tr) in enumerate(((-93.4, -9.3, 0.3, 1.5), (-97.3, 4.9, 0.32, 1.5), (-106.4, 5.7, 0.3, 1.6), (-87.9, 5.0, 0.3, 1.4), (-87.3, -4.0, 0.26, 1.5))):
        rock.drift_mound(dr, (ax, hh, az), tr, 315.0, 160.0, 7, chart="yd_drift%d" % k, ground=lambda x, z: 0.0, seed=280 + k)
    # --- crates the town left along the walls (zone geometry: the dressing allowance of this zone is spent on the street)
    for k, (x, z, sz, r_) in enumerate(((-80.62, 11.7, (0.72, 0.6, 0.72), 8.0), (-80.6, 12.55, (0.6, 0.45, 0.6), -14.0), (-109.3, -9.6, (0.8, 0.62, 0.7), 5.0),
                                         (-109.28, -8.75, (0.6, 0.5, 0.62), -9.0), (-109.3, -9.5, (0.55, 0.42, 0.55), 21.0), (-96.6, 13.45, (0.78, 0.55, 0.7), 4.0))):
        y = sz[1] / 2 + (0.62 if k == 4 else 0.0)
        kit.add_box(w, (x, y, z), sz, "m_frontier", mul(lin("board"), rng.uniform(0.85, 1.1)), rot=r_, sides="nsewt", row=(FT, "plank_b", "x"), u_shift=rng.uniform(0, 3))
        for (sx, sz_) in ((-1, -1), (1, -1), (1, 1), (-1, 1)):                    # corner battens: the crate is not a cube
            c = kit.rot_y((x + sx * (sz[0] / 2 - 0.02), y, z + sz_ * (sz[2] / 2 - 0.02)), r_, (x, y, z))
            kit.add_box(w, c, (0.09, sz[1] + 0.03, 0.09), "m_frontier", mul(lin("board_dark"), 0.9), rot=r_, sides="nsewt")
    # --- pass i1 (the visual reviewers: "large empty sand, blank adobe walls"): low drifts of blown sand lying across the
    # open floor (never over 0.3 m: bodies and nav links pass over them; lightmapped, so under the 14 degree sun each
    # crest is lit and throws a long shadow), dead scrub in three corners nobody walks into, a cart wheel left against
    # the south wall, and the bricks that came out of the west wall's gap. What wheels and feet left on the sand is
    # painted into the lightmap (ground_paint.py).
    import lip_dress
    gyd = lambda x, z: 0.035 * fbm(x / 5.0, z / 5.0, 21, 2)
    gcol = lambda x, z, y: mul(mix(lin("sand"), lin("sand_pale"), clamp(0.3 + 0.5 * fbm(x / 7.0, z / 7.0, 22, 2))), 0.93 if math.hypot(x - C[0], z - C[1]) < R + 2.5 else 1.0)     # build_ground's colour
    dn = Part("yd_dunes", Z, smooth=40)
    for k, (x, z, L_, W_, hh, brg) in enumerate(((-84.6, -9.0, 5.0, 2.6, 0.33, 140.0), (-95.6, -11.0, 4.6, 2.4, 0.3, 128.0), (-100.4, 10.0, 5.2, 2.6, 0.33, 132.0), (-106.9, -9.6, 4.0, 2.2, 0.28, 150.0))):
        lip_dress.drift(dn, (x, z), L_, W_, hh, brg, "yd_dr%d" % k, seed=620 + k, ground=gyd, ground_col=gcol)
    sb = Part("yd_scrub", Z, smooth=None)
    srng = random.Random(631)
    for (x, z, hh) in ((-109.35, -13.35, 1.0), (-90.6, 13.5, 0.85)):       # (the only wall feet in the yard more than 1.5 m from every nav link)
        lip_dress.bush(sb, (x, gyd(x, z), z), hh, srng)
    # a dead cottonwood in the south-west corner, between the west wall and the shed (its trunk half in the west wall's face:
    # inside the body's reach of it; twenty metres south of every line to the man on the rim)
    lip_dress.tree(sb, (-109.9, 0.0, 9.0), (0.05, -0.08), 4.6, srng)
    lip_dress.wheel(sb, (-94.6, 0.0, 13.62), 0.6, 180.0, -15.0, srng, sunk=0.1, missing=(4,))
    rb = Part("yd_rubble", Z, smooth=24)
    fr.rubble_heap(rb, (-109.2, 4.9), 0.8, srng, n=7, hmax=0.3)
    fr.rubble_heap(rb, (-108.6, 2.6), 0.55, srng, n=4, hmax=0.22)
    print(f"DRESS yard: {dn.tris()} + {sb.tris()} + {rb.tris()} triangles")
    return [d, w, ft, dr, dn, sb, rb]


def build(S):
    import street_parts as sp
    parts = build_ground(S) + build_walls(S) + build_tally(S) + build_drum(S) + build_derrick(S) + build_tank(S) + build_shed(S) + build_dress(S)
    parts += sp.stub_wall(S, "yd_cover_stub_1", 251, extra=-0.02, ragged=True, lanes=(True, True), dens=3.2, kdens=4.2)           # no taller than 2.3 m: the Dowser line (pass i5: the stub in the sighting's own frame, both wythes)
    parts += sp.stub_wall(S, "yd_cover_stub_2", 253, ragged=True)
    parts += sp.stub_wall(S, "yd_cover_stub_3", 255, ragged=True)
    return parts


# ====================================================================== embedded props, drawn nodes
def _take(S, objs, chunk):
    for o in objs:
        o["chunk"] = chunk; o["kzone"] = Z; o["klm"] = False
    S.objs[Z].extend(objs)


def embed(S):
    tb = layout.to_blender
    import street_parts as sp
    w = sp.SOL["st_cover_wagon"]; t = sp.SOL["st_trough"]; c = SOL["yd_cover_cart"]
    _take(S, zonelib.embed_prop("prop_wagon_tipped", location=tb((w["propPivot"][0], 0.0, w["propPivot"][2])), rot_z=math.radians(w["rotY"]), material_name="m_frontier", lightmap=LM), "chunk_st_east")
    _take(S, zonelib.embed_prop("prop_trough_pump", location=tb((t["pos"][0], 0.0, t["pos"][2])), rot_z=0.0, material_name="m_frontier", lightmap=LM), "chunk_st_west")
    _take(S, zonelib.embed_prop("prop_water_cart", location=tb((c["propPivot"][0], 0.0, c["propPivot"][2])), rot_z=math.radians(c["rotY"]), material_name="m_frontier", lightmap=LM), "chunk_st_yard")
    loc, rz = layout.placement("rd_rain_tally")
    _take(S, zonelib.embed_prop("rd_rain_tally", location=loc, rot_z=rz, material_name="m_frontier", lightmap=LM), "chunk_st_east")
    # the station numeral and the maker's plate by the drum door (their decals go to the yard chunk's m_mask)
    dth = S.extra[Z]["drum"]["dth"]
    def on_drum(o, theta, y, off=0.012):
        d = (math.cos(theta), 0.0, math.sin(theta))
        pos = (C[0] + d[0] * (R + off), y, C[1] + d[2] * (R + off))
        bd = Vector(tb(d)); yaw = math.atan2(bd.x, -bd.y)
        o.matrix_world = Matrix.Translation(Vector(tb(pos))) @ Matrix.Rotation(yaw + math.pi, 4, 'Z')
        bpy.context.view_layer.update()
        o.data.transform(o.matrix_world); o.matrix_world = Matrix.Identity(4)
        uvl.ensure_layers(o, lightmap=True)
    num = brand.numeral_mesh("4", 0.4, depth=0.02, name="yd_numeral")
    on_drum(num, -5.0 * dth, 2.0, 0.024)
    vcol.compose_vertex_color(num, mode='tint', jitter=0.0, gradient=(1.0, 1.0)); zonelib.fold_flat(num, "m_pellam")
    pl = brand.maker_plate("4-018", name="yd_plate")
    for o in (pl["plate"], pl["decals"]): on_drum(o, -3.55 * dth, 1.5, 0.004)
    vcol.compose_vertex_color(pl["plate"], mode='tint', jitter=0.0, gradient=(1.0, 1.0)); zonelib.fold_flat(pl["plate"], "m_pellam")
    for o in (num, pl["plate"], pl["decals"]):
        bake.set_vertex_lit_uv1(o, None, LM); o["kfit"] = True
    _take(S, [num, pl["plate"]], WORKS); _take(S, [pl["decals"]], "chunk_st_yard")
    # ---- drawn nodes: rotor, tail, lamp, plug
    rp, hub = rotor_part(); rotor = realize_node(rp, "pump_rotor", hub, (WIND[0], WIND[2]))
    tp, piv = tail_part(); tail = realize_node(tp, "pump_tail", piv, (WIND[0], WIND[2]))
    th = -2.9 * dth
    d = (math.cos(th), 0.0, math.sin(th)); side = (-d[2], 0.0, d[0])
    c0 = (C[0] + d[0] * (R + 0.05), 1.72, C[1] + d[2] * (R + 0.05))
    quad = [kit.vadd(c0, kit.vadd(kit.vscale(side, sx * 0.06), (0.0, sy * 0.1, 0.0))) for sx, sy in ((1, -1), (-1, -1), (-1, 1), (1, 1))]
    lamp = zonelib.lamp_set("drum_lamp", [[tb(q) for q in quad]], colour="aqua", emit_strength=0.0)
    ty = S.extra[Z]["tally"]; F = ty["F"]; h = ty["hole"]
    pp = Part("plug_door_tally", Z)
    pp.poly([F.p(h[0] - 0.05, 0.0, -1.0), F.p(h[1] + 0.05, 0.0, -1.0), F.p(h[1] + 0.05, h[3] + 0.05, -1.0), F.p(h[0] - 0.05, h[3] + 0.05, -1.0)], "m_frontier", flat_uv("m_frontier"), (0.0, 0.0, 0.0), final=True)
    # pass i3 (the visual reviewer: "the closed Tally House door shows a bright sliver of light along its top and sides"): the
    # plug was one card a metre behind the wall; past the leaves' edges and over their top the eye went by it to the sky.
    # It is a recess now: the card, a soffit over the leaves and a reveal either side, all black
    pc_ = F.p((h[0] + h[1]) / 2, h[3] / 2, -0.5)
    for q_ in ([F.p(h[0] - 0.05, h[3] + 0.05, -1.0), F.p(h[1] + 0.05, h[3] + 0.05, -1.0), F.p(h[1] + 0.05, h[3] + 0.05, -0.02), F.p(h[0] - 0.05, h[3] + 0.05, -0.02)],
               [F.p(h[0] - 0.05, 0.0, -1.0), F.p(h[0] - 0.05, h[3] + 0.05, -1.0), F.p(h[0] - 0.05, h[3] + 0.05, -0.02), F.p(h[0] - 0.05, 0.0, -0.02)],
               [F.p(h[1] + 0.05, 0.0, -1.0), F.p(h[1] + 0.05, h[3] + 0.05, -1.0), F.p(h[1] + 0.05, h[3] + 0.05, -0.02), F.p(h[1] + 0.05, 0.0, -0.02)]):
        n_ = kit.vcross(kit.vsub(q_[1], q_[0]), kit.vsub(q_[2], q_[0])); mid_ = kit.vscale(kit.vadd(kit.vadd(q_[0], q_[1]), kit.vadd(q_[2], q_[3])), 0.25)
        if kit.vdot(n_, kit.vsub(pc_, mid_)) < 0: q_ = q_[::-1]
        pp.poly(q_, "m_frontier", flat_uv("m_frontier"), (0.0, 0.0, 0.0), final=True)
    plug = realize_node(pp, "plug_door_tally", (0.0, 0.0, 0.0))
    del plug["wind"]
    vcol.mark_vertex_lit(plug)
    S.extra[Z]["vl_nodes"] = [rotor, tail]
    S.extra[Z]["keep"] = [rotor, tail, lamp, plug]
    # the lamp's dark bezel and the tin cup the town hung under it (zone geometry, works chunk)
    b = Part("yd_lamp_bezel", Z, chunk=WORKS)
    bz = [kit.vadd(c0, kit.vadd(kit.vscale(side, sx * 0.11), kit.vadd((0.0, sy * 0.16, 0.0), kit.vscale(d, -0.012)))) for sx, sy in ((1, -1), (-1, -1), (-1, 1), (1, 1))]
    b.poly(bz, "m_pellam", flat_uv("m_pellam"), lin("steel_dark"), final=True)
    # the cup: a tin mug a hand tall on a cord from a bent nail under the lamp (big enough to read from the yard door)
    cup = (c0[0] + d[0] * 0.1, 1.27, c0[2] + d[2] * 0.1)
    kit.add_cyl(b, cup, 0.058, 0.13, "m_pellam", lin("tin"), segs=8, r_top=0.066, cap_top=False, cap_bottom=True, final=True)
    kit.add_cyl(b, (cup[0], cup[1] + 0.105, cup[2]), 0.06, 0.004, "m_pellam", mul(lin("tin"), 0.3), segs=8, cap_top=True, final=True)
    hd = kit.vadd(cup, kit.vscale(side, 0.062))
    kit.add_prism(b, (hd[0], cup[1] + 0.03, hd[2]), (hd[0] + side[0] * 0.045, cup[1] + 0.065, hd[2] + side[2] * 0.045), 0.02, 0.02, "m_pellam", mul(lin("tin"), 0.8), final=True)
    kit.add_prism(b, (hd[0] + side[0] * 0.045, cup[1] + 0.065, hd[2] + side[2] * 0.045), (hd[0], cup[1] + 0.105, hd[2]), 0.02, 0.02, "m_pellam", mul(lin("tin"), 0.8), final=True)
    kit.add_prism(b, (cup[0], cup[1] + 0.13, cup[2]), (c0[0] + d[0] * 0.03, 1.56, c0[2] + d[2] * 0.03), 0.025, 0.025, "m_pellam", lin("cord"), final=True)
    kit.add_prism(b, (c0[0] - d[0] * 0.01, 1.56, c0[2] - d[2] * 0.01), (c0[0] + d[0] * 0.06, 1.57, c0[2] + d[2] * 0.06), 0.02, 0.02, "m_pellam", mul(lin("rust"), 0.8), final=True)
    # a folded strain-cloth on a flat stone beneath it, set like a hearth (the misreading)
    foot = (C[0] + d[0] * (R + 0.42), 0.0, C[1] + d[2] * (R + 0.42))
    kit.add_box(b, (foot[0], 0.05, foot[2]), (0.5, 0.1, 0.38), "m_pellam", mix(lin("adobe_base"), lin("rock_dark"), 0.4), rot=25.0, sides="nsewt", final=True)
    kit.add_box(b, (foot[0], 0.135, foot[2]), (0.26, 0.07, 0.2), "m_pellam", lin("linen"), rot=32.0, sides="nsewt", final=True)
    objs = kit.realize(b)
    for o in objs:
        bake.set_vertex_lit_uv1(o, None, LM); o["kfit"] = True
        o.data.uv_layers.remove(o.data.uv_layers[kit.ST_LAYER])
    S.objs[Z].extend(objs)


def post(S):
    dressing(S)


def dressing(S):
    tb = layout.to_blender
    n = {"inst": 0, "brk": 0}

    def put(kind, asset, pos, rot=0.0, node=None, wind=None):
        n[kind] += 1
        e = zonelib.dressing_empty(kind, n[kind], asset, node=node, loc=tb(pos), rot_z=rot, wind=wind or 0)
        if wind is not None: e["wind"] = int(wind)                       # 0 is written too: "this one hangs dead still"
        return e
    # dark lanterns under the porches (they are lit only on the rim card at the end)
    for (x, z) in ((-52.0, -6.0), (-11.6, 6.1), (-33.0, 6.1), (-70.0, 6.1)):
        put("inst", "prop_lantern", (x, 2.2, z), 0.3, "lantern_dark")
    # six bottles on a sill, mouth up
    for k in range(6):
        put("brk", "prop_bottle", (-41.0 - 1.4 - 0.13 * k, 1.26, 6.93), 0.5 * k, "bottle_a")
    for k in range(6):                                                     # and six on the dry-goods sill, one knocked over long ago
        put("brk", "prop_bottle", (-57.62 + 0.15 * k, 1.07, -6.94), 0.8 * k, "bottle_a")
    for (x, z, r) in ((-1.9, -6.2, 0.2), (-2.75, -6.3, 0.9), (-64.4, -6.35, 0.4), (-36.4, 6.3, 1.1), (-108.9, 6.6, 0.3), (-35.6, 6.45, 0.3), (-58.3, -6.3, 1.2)):
        put("inst", "prop_crate", (x, 0.0, z), r)
    # polish round 3: the yard's barrel stood 0.5 m from both walls of the north-west corner (-109.2, -13.2): a sprinting,
    # jumping capsule came down between its box and the two walls and hung there at y 0.75, not grounded, for up to 24 s
    # (scratch/r3-playthrough/sweep.log). It stands against the west wall now, 4.7 m from the corner, touching the wall.
    for (x, z) in ((-29.0, -6.5), (-46.2, 6.45), (-83.2, 13.3), (-109.62, -9.3)):
        put("inst", "prop_barrel", (x, 0.0, z), 0.4)
    for (x, z, r) in ((-17.2, -6.5, 0.3), (-18.1, -6.35, 1.4), (-24.9, -4.9, 0.2), (-104.6, 12.9, 0.8), (-41.0, -9.2, 0.5), (-41.8, -9.6, 1.9), (-62.3, 6.4, 0.9)):
        put("inst", "prop_sack", (x, 0.0, z), r)
    # the wash-house line: four strain-cloths, three stir, one hangs dead still (the wrong thing on this street)
    a, b, F = S.extra[Z]["wash_line"]
    for k, f in enumerate((0.16, 0.38, 0.6, 0.83)):
        pos = (a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f - 0.03, a[2] + (b[2] - a[2]) * f)
        put("inst", "prop_strain_cloth", pos, math.pi, None, 0 if k == 2 else 1)
