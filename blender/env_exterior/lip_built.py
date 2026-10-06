"""lip_built: what people and Pellam built at the gully mouth (env_the_lip): the gate wall with its timber lintel and
two piers, the low north wall of the forecourt, the dead pylon, stop one under the overhang, the embedded props and
the dressing empties."""
import math, random
import bpy
from lib import layout, manifest, brand, zone as zonelib, bake, vcol, uv as uvl
import ext_kit as kit
import ext_rock as rock
import ext_frontier as fr
import lip_fields as lf
from ext_kit import Part, lin, mix, mul, clamp, smooth, fbm, vnoise, row_uv, flat_uv, FT, PT

Z = "lip"
LM = "lm_surface"


# ====================================================================== gate wall, piers, north wall
def build_walls(S):
    lm = Part("lip_adobe_lm", Z, paint=fr.paint(lf.ground, jitter=0.03, dust=0.5))
    vl = Part("lip_adobe_vl", Z, paint=fr.paint(lf.ground, jitter=0.05))
    mask = Part("lip_marks", Z)
    rng = random.Random(31)
    g = layout.marker("door_jug_gate")
    half = g["size"][0] / 2; clear = g["size"][1]                       # 4.0 wide, 2.8 clear
    s0 = lf.SOL["lip_gate_wall_0"]; s2 = lf.SOL["lip_gate_wall_2"]
    x = s0["pos"][0]; thick = s0["size"][0]; H = s0["pos"][1] + s0["size"][1] / 2
    za = s0["pos"][2] - s0["size"][2] / 2; zb = s2["pos"][2] + s2["size"][2] / 2
    u_open = (g["pos"][2] - half - za, g["pos"][2] + half - za)
    hole = (u_open[0], u_open[1], 0.0, clear)
    top = lambda u: H - 0.12 + 0.16 * fbm(u / 2.1, 0.7, 5, 2) - 0.5 * smooth((abs(u - (zb - za) / 2) - 5.6) / 2.5) * vnoise(u / 3.0, 2.0, 9)
    F = fr.adobe_wall((lm, vl), (x, za), (x, zb), H, thick, "lip_gatewall", top_fn=top, holes=[hole], seed=3, density=1.0, fallen=0.8, ends="", batter=0.015)
    # the reveals of the opening and the timber lintel that carries the wall over it
    for u, flip in ((u_open[0], False), (u_open[1], True)):
        Fj = F.turned(u, -thick / 2, 90.0)                               # runs through the wall's thickness
        fr.adobe_face(lm, Fj, 0.0, thick, 0.0, clear, 0.0, kit.chart("lip_gate_jamb%d" % flip, 1.0), flip=not flip, seed=7 + flip, batter=0.0, step=1.0)
    nb = 5
    for k in range(nb):
        w0 = -thick / 2 - 0.06 + k * (thick + 0.12) / nb
        d = (thick + 0.12) / nb - 0.03
        fr.beam(vl, F, (u_open[0] - 0.45 - 0.1 * rng.random(), clear + 0.19, w0 + d / 2), (u_open[1] + 0.45 + 0.1 * rng.random(), clear + 0.19 + rng.uniform(-0.03, 0.03), w0 + d / 2),
                d, 0.36, "board_dark" if k in (0, nb - 1) else "board", chamfer=0.03, segs=4, caps="ab", shift=rng.uniform(0, 3))
    E = -thick / 2                                                       # the wall's east face in frame w (N = -x)
    # viga ends: the beams of the walk that ran along the wall's top, sawn off a hand proud of the plaster, each throwing
    # its own shadow down the face; one is gone (its socket is a dark square), one is broken short
    # (squared timbers, one loop each: they stand above 3 m, in the skyline chunk, which has no triangles to spare)
    u = 0.9; k = 0
    while u < (zb - za) - 0.6:
        k += 1
        yv = H - 0.8 + rng.uniform(-0.03, 0.03)
        if k == 4:
            fr.fbox(vl, F, u - 0.1, u + 0.1, yv - 0.1, yv + 0.1, E - 0.012, E, lin("ash_dark"), None, "u", "b")
        else:
            proud = 0.13 if k == 8 else 0.3 + 0.12 * rng.random()
            fr.beam(vl, F, (u, yv, E + 0.02), (u, yv - 0.025, E - proud), 0.18, 0.16, "board_dark" if k % 3 else "board", chamfer=0.0, taper=0.08, segs=1, caps="b", shift=rng.uniform(0, 3))
        u += rng.uniform(1.75, 2.05)
    # sand banked along the wall's foot either side of the gate (the forecourt side)
    drift = Part("lip_gate_drift", Z)
    Fe = fr.Frame((x + thick / 2, 0.0, zb), (0.0, -1.0))
    fr.sand_wedge(drift, Fe, 0.2, zb - (g["pos"][2] + half) - 1.3, 1.2, 0.34, rng, 5, kit.chart("lip_gate_drift0", 1.0))
    fr.sand_wedge(drift, Fe, zb - (g["pos"][2] - half) + 1.3, (zb - za) - 0.2, 1.0, 0.3, rng, 5, kit.chart("lip_gate_drift1", 1.0))
    # the two piers on the forecourt side: stone below, adobe above, a flat cap; timber guides for the drop-bar
    for side, uc in ((0, u_open[0] - 0.5), (1, u_open[1] + 0.5)):
        u0 = uc - 0.5; u1 = uc + 0.5; w0 = E - 0.75; w1 = E + 0.2
        lean = (0.03 if side else -0.02)
        Fp = F.sub(0, 0, 0, lean_deg=1.5 if side else -1.0)
        ch = kit.chart("lip_pier%d" % side, 1.0)
        # stone footing: three courses of rough blocks
        y = 0.0
        for course, hh in enumerate((0.34, 0.3, 0.26)):
            inset = 0.0 + 0.012 * course
            for (a, b) in ((u0 - 0.04 + inset, uc - 0.02 * course), (uc - 0.02 * course + 0.015, u1 + 0.04 - inset)):
                c = rock.rock_colour(3.0 + course * 1.5 + side, None, 0.0, 0.25 * rng.random(), 5, a, b)
                fr.fbox(lm, Fp, a, b, y, y + hh - 0.012, w0 - 0.04 + inset, w1, c, "strata" if False else None, "u", "btlr", chart=None, final=False)
            y += hh
        # adobe shaft (lightmapped: one chart, the three seen sides unfolded side by side)
        for face, (ua, ub, wa, wb, off) in {"e": (u0, u1, w0, w0, 0.0), "s": (u1, u1, w0, w1, 1.2), "n": (u0, u0, w1, w0, 2.4)}.items():
            ys = fr.adobe_rows(y, 3.0)
            for j in range(len(ys) - 1):
                if face == "e": q = [(u1, ys[j], w0), (u0, ys[j], w0), (u0, ys[j + 1], w0), (u1, ys[j + 1], w0)]; tu = [0.0, 1.0, 1.0, 0.0]
                elif face == "s": q = [(u1, ys[j], w1), (u1, ys[j], w0), (u1, ys[j + 1], w0), (u1, ys[j + 1], w1)]; tu = [0.0, 0.95, 0.95, 0.0]
                else: q = [(u0, ys[j], w0), (u0, ys[j], w1), (u0, ys[j + 1], w1), (u0, ys[j + 1], w0)]; tu = [0.0, 0.95, 0.95, 0.0]
                lm.poly([Fp.p(*p) for p in q], "m_frontier", [row_uv(FT, "adobe", off + t + side * 2.7, fr.adobe_v(p[1])) for p, t in zip(q, tu)],
                        [fr.adobe_colour(p[1], off + t, 20 + side, 0.9) for p, t in zip(q, tu)], ch, [(off + t, p[1]) for p, t in zip(q, tu)])
        fr.fbox(vl, Fp, u0 - 0.07, u1 + 0.07, 3.0, 3.1, w0 - 0.07, w1, mul(lin("rock_cap"), 0.95), None, "u", "btlrd")
        # guides: two timbers per pier making a slot on the face that looks at the opening
        ug = u1 if side == 0 else u0
        sgn = 1 if side == 0 else -1
        for wg in (w0 + 0.12, w0 + 0.5):
            fr.beam(vl, Fp, (ug + sgn * 0.06, 0.0, wg), (ug + sgn * 0.06, 3.35 + 0.1 * rng.random(), wg), 0.13, 0.15, "board", chamfer=0.02, segs=4, caps="b", shift=rng.uniform(0, 3))
        fr.fbox(vl, Fp, ug + sgn * 0.0 - 0.02, ug + sgn * 0.13 + 0.02, 3.05, 3.2, w0 + 0.03, w0 + 0.6, lin("board_dark"), "plank_b", "w", "fbtdlr")
        if side == 1:                                                    # the left pier as you face the gate: the town's mark, struck through
            Fm = Frame_east(Fp, u0, u1, w0)
            fr.door_mark(mask, Fm, 0.5, 1.5, 0.012, "mark_brush_a", 0.46)
    # the low north wall of the forecourt (3 m: the Rule and the pylon line are seen over it)
    sn = lf.SOL["lip_fc_wall_n"]
    zc = sn["pos"][2]; Hn = sn["pos"][1] + sn["size"][1] / 2
    # its top sags, and one run of it has come down to two metres (the capstones lie at its foot); a buttress every six
    # metres on the forecourt side; sand banked along its foot. Nothing here rises over 3 m.
    Ln = sn["pos"][0] + sn["size"][0] / 2 - 3.5 - thick
    gap = (9.4, 12.3)
    topn = lambda u: (Hn - 0.16 + 0.05 * fbm(u / 2.0, 0.3, 8, 2) - 0.16 * math.sin(math.pi * clamp(u / Ln)) ** 2
                      - 1.0 * smooth((u - gap[0] + 0.3) / 0.9) * smooth((gap[1] + 0.3 - u) / 0.9) * (0.75 + 0.25 * vnoise(u * 1.3, 0.2, 14)))
    Fn = fr.adobe_wall((lm, vl), (thick, zc), (thick + Ln, zc), Hn - 0.14, sn["size"][2], "lip_northwall",
                       top_fn=topn, cap=True, seed=5, density=1.0, sides="r", ends="", fallen=1.0, rng=rng, cap_gaps=[(gap[0] - 0.4, gap[1] + 0.4)], step=1.0)
    wf = sn["size"][2] / 2
    for k, ub in enumerate((2.6, 7.6, 14.4, 19.2)):
        fr.buttress(vl, Fn, ub, wf - 0.02, 1.0, h=2.25 + 0.2 * (k % 2), width=0.75, proj=0.5, top_proj=0.12, seed=61 + k)
    rub = Part("lip_fc_rubble", Z)
    fr.fallen_stones(rub, Fn, gap[0] - 0.3, gap[1] + 0.3, wf + 0.15, wf + 1.3, rng, n=6)
    fr.fallen_stones(rub, Fn, gap[0], gap[1], wf + 0.1, wf + 0.9, rng, n=4, col="adobe_base", size=(0.36, 0.12, 0.2))
    for k, (ua, ub) in enumerate(((3.2, 7.1), (8.2, 13.8), (15.0, 18.7))):
        fr.sand_wedge(drift, fr.Frame(Fn.p(0.0, 0.0, wf), (Fn.U[0], Fn.U[2])), ua, ub, 1.1, 0.3 if k != 1 else 0.42, rng, 5, kit.chart("lip_north_drift%d" % k, 1.0))
    return [lm, vl, mask, drift, rub]


def Frame_east(Fp, u0, u1, w0):
    """The east face of a pier as a frame of its own (u runs right to left of the wall frame: seen from the forecourt)."""
    o = Fp.p(u1, 0.0, w0)
    f = fr.Frame(o, (-Fp.U[0], -Fp.U[2]))
    return f


# ====================================================================== the dead pylon
def build_pylon(S):
    m = layout.marker("prop_pylon")
    base = tuple(m["pos"]); Ht = float(m["params"]["height"]); arm_to = tuple(m["params"]["stubArmTo"])
    p = Part("lip_pylon", Z, paint=dict(ground=0.0, dust=0.5, dust_h=0.7, grad=(0.9, 1.04), grad_h=16.0, jitter=0.0))
    tilt = math.radians(3.0); td = kit.vnorm((0.55, 0.0, 0.83))            # the ground moved: the whole mast leans, parts still square
    axis = kit.vnorm(kit.vcross((0.0, 1.0, 0.0), td))

    def rot(q, ang):
        v = kit.vsub(q, base); c = math.cos(ang); s = math.sin(ang)
        r = kit.vadd(kit.vadd(kit.vscale(v, c), kit.vscale(kit.vcross(axis, v), s)), kit.vscale(axis, kit.vdot(axis, v) * (1 - c)))
        return kit.vadd(base, r)

    enamel = lin("enamel"); stain = lin("enamel_stain"); steel = lin("steel"); rust = mix(lin("rust"), lin("steel_dark"), 0.45)
    # cast concrete foot
    fy = 0.62
    fr.fbox(p, fr.Frame((base[0] - 1.0, 0.0, base[2] - 1.0), (1.0, 0.0)), 0.0, 2.0, -0.1, fy - 0.12, -0.0, 2.0, lin("concrete"), None, "u", "fblr", mat="m_pellam")
    c0 = [(base[0] - 1.0, fy - 0.12, base[2] - 1.0), (base[0] - 1.0, fy - 0.12, base[2] + 1.0), (base[0] + 1.0, fy - 0.12, base[2] + 1.0), (base[0] + 1.0, fy - 0.12, base[2] - 1.0)]
    c1 = [(base[0] - 0.86, fy, base[2] - 0.86), (base[0] - 0.86, fy, base[2] + 0.86), (base[0] + 0.86, fy, base[2] + 0.86), (base[0] + 0.86, fy, base[2] - 0.86)]
    for k in range(4):
        j = (k + 1) % 4
        p.poly([c0[k], c0[j], c1[j], c1[k]], "m_pellam", flat_uv("m_pellam"), mul(lin("concrete"), 1.05))
    p.poly(c1, "m_pellam", flat_uv("m_pellam"), mul(lin("concrete"), 1.1))
    # the mast: ceramic-clad, tapered 1.4 m -> 0.6 m, on the 1.2 m module
    n = 8
    start = len(p.v)
    rad = lambda y: 0.70 - (0.70 - 0.30) * clamp((y - fy) / (Ht - fy))
    levels = [fy, fy + 0.3]
    y = 1.2
    while y < Ht - 0.3:
        for yy in (y - 0.05, y + 0.05) if abs(y - 1.2) < 1e-6 else (y,): levels.append(yy)
        if y < 4.0: levels.append(min(Ht - 0.35, y + 0.28))               # the stain under each seam, where it is seen close
        y += 1.2
    levels = sorted(set(round(v, 3) for v in levels if v < Ht - 0.3)) + [Ht - 0.3]
    rings = []
    for yv in levels:
        rings.append([p.vert((base[0] + math.cos(2 * math.pi * i / n) * rad(yv), yv, base[2] + math.sin(2 * math.pi * i / n) * rad(yv))) for i in range(n)])

    def mast_col(ya):
        if ya < fy + 0.3 - 1e-6: return steel
        if 1.15 - 1e-6 <= ya <= 1.25 - 1e-6: return lin("livery")
        k = (ya - 1.2) / 1.2; f = k - math.floor(k)
        c = mix(stain, enamel, smooth(f / 0.3)) if ya > 1.3 else stain          # a stain below every panel seam
        return mix(c, stain, 0.5 * clamp(1.0 - ya / 5.0))
    for r in range(len(levels) - 1):
        ya = levels[r]; yb = levels[r + 1]
        for i in range(n):
            j = (i + 1) % n
            uvs = [((i / n) * (4.0 / 3.0), manifest.trim_v(PT, "panel")[0] + (manifest.trim_v(PT, "panel")[1] - manifest.trim_v(PT, "panel")[0]) * (((yy - 1.2) / 1.2) % 1.0 if abs(((yy - 1.2) / 1.2) % 1.0) > 1e-6 or yy == ya else 1.0)) for (ii, yy) in ((i, ya), (i, yb), (j, yb), (j, ya))]
            uvs = [(((ii if ii else (n if k_ in (2, 3) and i == n - 1 else 0)) / n) * (4.0 / 3.0), uv[1]) for k_, ((ii, yy), uv) in enumerate(zip(((i, ya), (i, yb), (j, yb), (j, ya)), uvs))]
            ca = mast_col(ya); cb = mast_col(yb - 1e-4)
            p.face((rings[r][i], rings[r + 1][i], rings[r + 1][j], rings[r][j]), "m_pellam", uvs, [ca, cb, cb, ca])
    # the head: a steel cap, two horns with cable stumps
    kit.add_cyl(p, (base[0], Ht - 0.3, base[2]), 0.36, 0.3, "m_pellam", steel, segs=n, r_top=0.22)
    for sx in (-1, 1):
        kit.add_prism(p, (base[0], Ht - 0.12, base[2]), (base[0] + sx * 0.9 * td[2], Ht + 0.25, base[2] - sx * 0.9 * td[0]), 0.16, 0.16, "m_pellam", rust, chamfer=0.03, caps="b")
        e = (base[0] + sx * 0.86 * td[2], Ht + 0.2, base[2] - sx * 0.86 * td[0])
        kit.add_prism(p, e, (e[0] + 0.1 * sx, e[1] - (2.0 if sx > 0 else 1.2), e[2] + 0.12), 0.11, 0.11, "m_pellam", lin("cable"), segs=3)
    # cross-arms: the lowest stub reaches the layout's stubArmTo (the seventh jug hangs under it); one arm is missing
    target = rot(arm_to, -tilt)                                           # in the mast's own (untilted) frame
    d_low = kit.vnorm((target[0] - base[0], 0.0, target[2] - base[2]))
    arms = [(target[1], d_low, kit.vlen((target[0] - base[0], 0.0, target[2] - base[2])), True),
            (target[1], kit.vscale(d_low, -1), 0.5, False),                # the missing arm: a torn stub (it is the well-sweep now)
            (11.4, kit.vnorm((d_low[2], 0.0, -d_low[0])), 2.5, True), (11.4, kit.vnorm((-d_low[2], 0.0, d_low[0])), 2.5, True)]
    for (ay, d, ln, whole) in arms:
        a = (base[0] + d[0] * (rad(ay) - 0.1), ay - 0.05, base[2] + d[2] * (rad(ay) - 0.1))
        b = (base[0] + d[0] * ln, ay + (0.0 if whole else -0.06), base[2] + d[2] * ln)
        kit.add_prism(p, a, b, 0.45, 0.45 if whole else 0.4, "m_pellam", rust, chamfer=0.07, caps="b", taper=0.12 if whole else 0.0, segs=3 if whole else 1)
        # the collar where the arm meets the mast
        kit.add_cyl(p, (base[0], ay - 0.42, base[2]), rad(ay) + 0.07, 0.75, "m_pellam", steel, segs=n, cap_top=True, cap_bottom=True)
        if whole:
            # the insulator stack: white ceramic discs on a short hanger, under the arm's end (above it on the upper arms)
            ex = base[0] + d[0] * (ln - 0.28); ez = base[2] + d[2] * (ln - 0.28)
            up = ay < 9.0
            y0 = ay + 0.22 if not up else ay + 0.22
            for k in range(3):
                kit.add_cyl(p, (ex, y0 + 0.02 + k * 0.17, ez), 0.2 - 0.02 * k, 0.11, "m_pellam", enamel, segs=6, r_top=0.12 - 0.01 * k, cap_top=True, cap_bottom=True)
            kit.add_cyl(p, (ex, y0 - 0.02, ez), 0.07, 0.6, "m_pellam", steel, segs=6)
        else:
            kit.add_prism(p, b, (b[0] + 0.15, b[1] - 1.9, b[2] + 0.1), 0.12, 0.12, "m_pellam", lin("cable"), segs=3)
    p.transform(lambda q: rot(q, tilt), start)
    kit.tessellate(p, 2.6)
    S.extra["lip"]["pylon"] = dict(base=base, rot=rot, tilt=tilt, rad=rad)
    return [p]


# ====================================================================== stop one
def build_camp(S):
    m = layout.marker("prop_camp_one")
    p = Part("lip_shelf", Z, smooth=28)
    # one flat swept rock shelf (no hearth, no ash): the stone, the pot and the note sit on it
    rock.rock_box(p, (m["pos"][0] + 0.25, m["pos"][1] - 0.2, m["pos"][2] + 0.15), (2.3, 0.41, 1.5), rot=-14.0, seed=91, n=3, bulge=0.012, chamfer=0.1,
                  chart="lip_shelf", dark=0.35)
    # a rag caught under a stone by the mouth: the only cloth here (the m_mask of this chunk)
    rag = Part("lip_rag", Z)
    F = fr.Frame((20.55, 14.0, 102.4), (0.25, -1.0))
    fr.decal(rag, F, 0.0, 0.42, 0.02, 0.5, 0.62, "card_edges", 0, mul(lin("workcloth"), 1.1))
    st = Part("lip_ragstone", Z)
    rock.rock_chunk(st, (20.62, 14.72, 102.38), 0.2, seed=5, dark=0.4)
    return [p, rag, st]


def build_salvage(S):
    """The seam at the gate (ART_BIBLE 5.5: intrusion = the pylon, misreading = the brushed mark; this is the SALVAGE):
    a ceramic panel off the pylon bolted over a breach in the gate wall, the pylon's braided cable lashed twice round
    each pier as binding, and one insulator stack set on the right pier's cap like a finial."""
    p = Part("lip_salvage", Z, chunk="chunk_lip_gate", paint=None)
    s0 = lf.SOL["lip_gate_wall_0"]
    xf = s0["pos"][0] + s0["size"][0] / 2 + 0.03                          # the wall's forecourt face (x = 2)
    enamel = lin("enamel"); stain = lin("enamel_stain"); steel = lin("steel"); FLP = flat_uv("m_pellam")
    v0, v1 = manifest.trim_v(PT, "panel", 2)
    # the panel: one 1.2 m module, 6 cm thick, a 2 cm bevel, hung a little off level (it is Pellam: square to itself)
    c = (xf, 1.55, 6.35); tilt = math.radians(3.5); hw = 0.6
    def P(a, b, d):                                                       # a along the wall (z), b up, d out (+x)
        return (c[0] + d, c[1] + a * math.sin(tilt) + b * math.cos(tilt), c[2] + a * math.cos(tilt) - b * math.sin(tilt))
    f = [P(-hw + 0.02, -hw + 0.02, 0.06), P(hw - 0.02, -hw + 0.02, 0.06), P(hw - 0.02, hw - 0.02, 0.06), P(-hw + 0.02, hw - 0.02, 0.06)]
    o = [P(-hw, -hw, 0.04), P(hw, -hw, 0.04), P(hw, hw, 0.04), P(-hw, hw, 0.04)]
    w = [P(-hw, -hw, 0.0), P(hw, -hw, 0.0), P(hw, hw, 0.0), P(-hw, hw, 0.0)]
    east = (c[0] + 9.0, c[1], c[2])
    def face(q, col, uvs=None):
        n = kit.vcross(kit.vsub(q[1], q[0]), kit.vsub(q[2], q[0]))
        mid = kit.vscale(kit.vadd(kit.vadd(q[0], q[1]), kit.vadd(q[2], q[3])), 0.25)
        away = kit.vsub(mid, (c[0] - 2.0, c[1], c[2]))
        if kit.vdot(n, away) < 0: q = q[::-1]; uvs = uvs[::-1] if isinstance(uvs, list) else uvs
        p.poly(q, "m_pellam", uvs if uvs is not None else FLP, col, final=True)
    face(f, [mix(enamel, stain, 0.55), mix(enamel, stain, 0.55), mix(enamel, stain, 0.2), mix(enamel, stain, 0.2)], [(0.0, v0), (1.0 / 3.0, v0), (1.0 / 3.0, v1), (0.0, v1)])
    for k in range(4):
        j = (k + 1) % 4
        face([f[k], f[j], o[j], o[k]], mix(enamel, stain, 0.35 + 0.15 * (k == 0)))
        face([o[k], o[j], w[j], w[k]], mul(stain, 0.8))
    # the livery band still on it, running the wrong way now (the panel was hung on its side): the misfit that says salvage
    lb = [P(-0.18, -hw + 0.03, 0.062), P(-0.08, -hw + 0.03, 0.062), P(-0.08, hw - 0.03, 0.062), P(-0.18, hw - 0.03, 0.062)]
    face(lb, lin("livery"))
    for (a, b) in ((-0.5, -0.5), (0.5, -0.5), (0.5, 0.5), (-0.5, 0.5)):   # four rusted coach bolts with square washers
        kit.add_box(p, P(a, b, 0.07), (0.03, 0.09, 0.09), "m_pellam", mul(lin("rust"), 0.9), sides="nsewtb", final=True)
        kit.add_box(p, P(a, b, 0.095), (0.03, 0.045, 0.045), "m_pellam", mul(lin("rust"), 0.6), sides="nsewtb", final=True)
    # cable lashings round both piers, and the finial
    g = layout.marker("door_jug_gate"); half = g["size"][0] / 2
    for side, zc in ((0, g["pos"][2] - half - 0.5), (1, g["pos"][2] + half + 0.5)):
        x0 = xf - 0.03 - 0.02; x1 = xf - 0.03 + 0.8                        # the pier stands 0.75 m proud of the wall
        for k, yy in enumerate((1.72, 1.86) if side else (2.2, 2.33)):
            r = 0.56 + 0.012 * k; sag = 0.03 * k
            ring = [(x0, yy, zc - r), (x1 + 0.05, yy - sag, zc - r), (x1 + 0.05, yy - sag * 0.5, zc + r), (x0, yy + 0.02, zc + r)]
            for a_, b_ in zip(ring[:-1], ring[1:]):
                kit.add_prism(p, a_, b_, 0.07, 0.07, "m_pellam", lin("cable"), chamfer=0.0, segs=2, final=True)
        if side:
            kit.add_prism(p, (x1 + 0.05, 1.8, zc + 0.3), (x1 + 0.1, 1.05, zc + 0.36), 0.07, 0.07, "m_pellam", lin("cable"), chamfer=0.0, segs=2, final=True)     # the frayed end hangs
        else:
            cx = xf + 0.36
            kit.add_cyl(p, (cx, 3.1, zc), 0.05, 0.62, "m_pellam", steel, segs=6, final=True)
            for k in range(3):
                kit.add_cyl(p, (cx, 3.2 + k * 0.17, zc), 0.2 - 0.02 * k, 0.11, "m_pellam", enamel, segs=6, r_top=0.12 - 0.01 * k, cap_top=True, cap_bottom=True, final=True)
    kit.tessellate(p, 1.0)
    return [p]


def build(S):
    return build_walls(S) + build_pylon(S) + build_camp(S) + build_salvage(S)


# ====================================================================== embedded props, the maker's plate
def _take(S, objs, chunk):
    for o in objs:
        o["chunk"] = chunk; o["kzone"] = Z; o["klm"] = False
    S.objs[Z].extend(objs)


def embed(S):
    tb = layout.to_blender
    camp = layout.marker("prop_camp_one"); note = layout.marker("rd_note_lip")
    stone = manifest.asset("prop_flat_stone")["placeholder"]["size"]
    _take(S, zonelib.embed_prop("prop_flat_stone", location=tb(camp["pos"]), rot_z=math.radians(20), material_name="m_frontier", lightmap=LM), "chunk_lip_upper")
    _take(S, zonelib.embed_prop("prop_coffee_pot", location=tb((camp["pos"][0] + 0.06, camp["pos"][1] + stone[1], camp["pos"][2] - 0.02)), rot_z=math.radians(-35),
                                material_name="m_frontier", lightmap=LM), "chunk_lip_upper")
    _take(S, zonelib.embed_prop("rd_note", node="note_lip", location=tb(note["pos"]), rot_z=math.radians(12), material_name="m_frontier", lightmap=LM), "chunk_lip_upper")
    _take(S, zonelib.embed_prop("prop_cartridge_lead", node="round_spent", location=tb((note["pos"][0] + 0.02, note["pos"][1] + 0.006, note["pos"][2] - 0.03)),
                                rot_z=0.4, material_name="m_frontier", lightmap=LM), "chunk_lip_upper")
    # the maker's plate on the mast at 1.5 m, facing the forecourt
    py = S.extra["lip"]["pylon"]
    pl = brand.maker_plate("4-031", name="lip_pylon_plate")
    ang = math.radians(-35.0)                                           # facing east-north-east (toward the stand spot)
    d = (math.cos(ang), 0.0, math.sin(ang))
    pos = py["rot"]((py["base"][0] + d[0] * (py["rad"](1.5) + 0.004), 1.5, py["base"][2] + d[2] * (py["rad"](1.5) + 0.004)), py["tilt"])
    from mathutils import Matrix, Vector
    bd = Vector(tb(d)); yaw = math.atan2(bd.x, -bd.y)                    # the plate faces -Y at rest
    for o in (pl["plate"], pl["decals"]):
        o.matrix_world = Matrix.Translation(Vector(tb(pos))) @ Matrix.Rotation(yaw, 4, 'Z')
        bpy.context.view_layer.update()
        o.data.transform(o.matrix_world); o.matrix_world = Matrix.Identity(4)
        uvl.ensure_layers(o, lightmap=True)
    vcol.compose_vertex_color(pl["plate"], mode='tint', jitter=0.0, gradient=(1.0, 1.0))
    zonelib.fold_flat(pl["plate"], "m_pellam")
    for o in (pl["plate"], pl["decals"]): bake.set_vertex_lit_uv1(o, None, LM)
    _take(S, [pl["plate"], pl["decals"]], "chunk_lip_gate")


def dressing(S):
    tb = layout.to_blender
    n = 1
    for (x, z, r) in ((5.6, -6.2, 0.3), (6.45, -6.3, -0.5), (20.4, 7.6, 1.2), (17.7, -6.25, 0.9), (18.4, -6.1, 2.0)):
        zonelib.dressing_empty('inst', n, "prop_sack", loc=tb((x, 0.0, z)), rot_z=r); n += 1
    # three bottles in a row on the north wall's cap: somebody's target practice, long ago
    sn = lf.SOL["lip_fc_wall_n"]
    top = sn["pos"][1] + sn["size"][1] / 2
    for k, x in enumerate((6.3, 6.62, 6.95, 7.9, 8.2, 8.52)):                # six, in two threes: the middle of the row was shot away
        zonelib.dressing_empty('brk', k + 1, "prop_bottle", node="bottle_a", loc=tb((x, top - 0.2 - 0.16 * math.sin(math.pi * clamp((x - 2.0) / 20.5)) ** 2, sn["pos"][2] + sn["size"][2] / 2 - 0.25)), rot_z=0.7 * k)
