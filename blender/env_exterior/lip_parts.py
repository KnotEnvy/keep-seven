"""lip_parts: every mesh of env_the_lip (docs/workorders/art-env-exterior.md 4.1), as ext_kit Parts in game space.

    ground      the gully floor and forecourt: one sand sheet over the layout's wedge slopes (lip_fields.ground)
    curtain     stratified sandstone walls along the corridor's edge: lightmapped to 3 m above the path, vertex-lit
                above (chunk_lip_rock), undercut bases, level bedding ledges, a broken skyline, a bleached cap
    plateau     the top of the rock mass, the west outer face (the skyline seen from the street)
    overhang    interior walls, the layered roof slab, the designed mouth (notch upper left, fallen slab lower right)
    boulders    the four cover boulders, the ledge, talus at the wall feet
    forecourt   gate wall with its timber lintel and piers, the low north wall, the dead pylon
"""
import math, random
from lib import layout, manifest, brand
import ext_kit as kit
import ext_rock as rock
import lip_fields as lf
from ext_kit import Part, lin, mix, mul, clamp, smooth, fbm, vnoise, row_uv, flat_uv, sand_uv, FT, PT

Z = "lip"
SEED = 7


# ====================================================================== ground
def sand_colour(x, z, gy):
    base = lin("sand")
    h = lf.path_h(z)
    rise = clamp((gy - h - 0.05) / 0.5)
    c = mix(base, lin("sand_pale"), 0.55 * rise + 0.25 * clamp(fbm(x / 9.0, z / 9.0, 23, 2) + 0.2))
    d = lf.F(x, z)
    c = mul(c, 0.92 + 0.08 * smooth(clamp((3.5 - d) / 3.5)) if d > 0 else 1.0)       # the trodden middle is a shade darker
    if lf.in_overhang(x, z): c = mul(mix(c, lin("rock_dark"), 0.25), 0.86)        # packed floor under the roof
    return c


GROUND_CHARTS = [(93.0, "lip_g0"), (78.0, "lip_g1"), (54.0, "lip_g2"), (30.0, "lip_g3"), (9.0, "lip_g4"), (-99.0, "lip_g5")]


def ground_chart(z):
    for z0, name in GROUND_CHARTS:
        if z >= z0: return kit.chart(name)


def build_ground(S):
    p = Part("lip_ground", Z, smooth=60)
    step = 1.5
    nx = int(round((lf.BX1 - lf.BX0) / step)); nz = int(round((lf.BZ1 - lf.BZ0) / step))
    nodes = {}
    for j in range(nz + 1):
        for i in range(nx + 1):
            x = lf.BX0 + i * (lf.BX1 - lf.BX0) / nx; z = lf.BZ0 + j * (lf.BZ1 - lf.BZ0) / nz
            nodes[(i, j)] = (x, z, lf.F(x, z))
    vid = {}
    S.extra["lip"]["ground_quads"] = quads = []

    def vert(i, j):
        if (i, j) not in vid:
            x, z, d = nodes[(i, j)]
            gy = lf.ground(x, z)
            vid[(i, j)] = (p.vert((x, gy, z)), (x, gy, z))
        return vid[(i, j)]

    for j in range(nz):
        for i in range(nx):
            ds = [nodes[(i + a, j + b)][2] for a, b in ((0, 0), (1, 0), (1, 1), (0, 1))]
            if max(ds) < -1.3: continue                               # deep in rock: never seen
            cx = sum(nodes[(i + a, j + b)][0] for a, b in ((0, 0), (1, 0), (1, 1), (0, 1))) / 4
            cz = sum(nodes[(i + a, j + b)][1] for a, b in ((0, 0), (1, 0), (1, 1), (0, 1))) / 4
            q = [vert(i, j), vert(i, j + 1), vert(i + 1, j + 1), vert(i + 1, j)]      # counter-clockwise seen from above
            pts = [v[1] for v in q]
            ch = ground_chart(cz)
            p.face([v[0] for v in q], "m_sand", [sand_uv(a) for a in pts], [sand_colour(a[0], a[2], a[1]) for a in pts], ch, [(a[0], a[2]) for a in pts], final=True)
            quads.append(pts)
    # integration (polish round 2): the dark underlay of the gate forecourt (see street_parts.build_ground): the gate wall's
    # foot and the seam with the street's ground at x = 0 no longer show the sky through a crack
    u = Part("lip_underlay_gate", Z, chunk="chunk_lip_gate")
    pts = [(0.0, -0.16, -8.5), (0.0, -0.16, 8.5), (7.0, -0.16, 8.5), (7.0, -0.16, -8.5)]
    u.poly(pts, "m_sand", [sand_uv(a) for a in pts], mul(lin("sand"), 0.12), final=True)
    return [p, u]


# ====================================================================== the rock curtain
BEDS = [1.5 + 3.0 * k for k in range(9)]            # absolute heights of the bedding ledges


def mass_top(x, z):
    """The top of the rock mass at a point inside it, as DRAWN: the layout solid's top with its slow undulation, broken
    into benches along the bedding (a skyline of steps, never one smooth line), and coming down in benches where a
    mass ends against something people built: the forecourt's east wall runs down into the 3 m north wall, the west
    wall of the last reach into the gate wall. Curtain, lids and step faces all read this one function."""
    t = lf.top_at(x, z)
    t += 0.6 * (1.5 * math.floor(t / 1.5 + 0.5) - t)
    if 28.0 < z < 41.0: t = min(t, 12.3 + 10.6 * smooth((z - 29.0) / 10.0) + 0.3 * fbm(z / 2.0 + x / 3.0, 0.7, 86, 2))     # the third reach's walls climb from the last reach's in benches (no 10 m fin at z 30)
    if z < 3.0 and x > 20.0: t = min(t, 3.35 + 6.2 * smooth((z + 7.6) / 8.5) + 0.25 * fbm(z / 2.0, 0.4, 87, 2))
    if z < 17.0 and x < 4.0: t = min(t, 5.9 + 6.5 * smooth((z - 9.0) / 7.0) + 0.25 * fbm(z / 2.0, 0.9, 88, 2))
    return t


class Col:
    __slots__ = ("x", "z", "nx", "nz", "u", "g", "pg", "top", "tmax", "tag", "oh")


def make_columns(loop):
    """Corridor-edge loop -> runs of rock columns (adobe and zone-edge stretches are dropped)."""
    pts = lf.resample(lf.simplify(loop + [loop[0]], 0.16), 2.5)[:-1]
    cols = []
    u = 0.0
    for i, (x, z) in enumerate(pts):
        if i: u += math.hypot(x - pts[i - 1][0], z - pts[i - 1][1])
        c = Col(); c.x = x; c.z = z; c.u = u
        c.nx, c.nz = lf.grad(x, z)
        c.tag = lf.tag_at(x, z)
        c.oh = lf.in_overhang(x, z) and z > 101.2
        # how deep the rock is behind this point (a spur is thin: the offsets must not cross its middle)
        t = 0.0
        while t < 4.0:
            t += 0.25
            if -lf.F(x - c.nx * t, z - c.nz * t) < t * 0.6: break
        c.tmax = max(0.3, t - 0.25)
        bx = x - c.nx * c.tmax; bz = z - c.nz * c.tmax
        # stay inside the zone's box (the chunk boxes allow 0.75 m outside; keep 0.3)
        for lim in (lambda q: q[0] - (lf.BX0 + 0.2), lambda q: (lf.BX1 + 0.4) - q[0], lambda q: (lf.BZ1 + 0.4) - q[1]):
            while c.tmax > 0.3 and lim((x - c.nx * c.tmax, z - c.nz * c.tmax)) < 0: c.tmax -= 0.1
        c.g = lf.ground(x, z)
        c.pg = kit.path_ground(Z, x, z)
        c.top = mass_top(x - c.nx * min(1.0, c.tmax), z - c.nz * min(1.0, c.tmax))
        if c.oh: c.top = c.pg + 3.4
        c.top = max(c.top, c.pg + 3.6) if not c.oh else c.top
        cols.append(c)
    # split into runs of rock
    runs = []; cur = []
    n = len(cols)
    start = next((i for i in range(n) if cols[i].tag != "rock"), 0)
    for k in range(n):
        c = cols[(start + k) % n]
        if c.tag == "rock": cur.append(c)
        else:
            if len(cur) > 1: runs.append(cur)
            cur = []
    if len(cur) > 1: runs.append(cur)
    return runs


def column_rows(c):
    """The profile of one column: [(y, inward offset, kind)], the same number of rows in every column.
    kind: 'lm' rows are the lightmapped foot (to 3 m above the path), 'hi' the vertex-lit cliff, 'cap' the rim."""
    rows = []
    und = 0.06 + 0.2 * vnoise(c.u / 5.0, 3.1, 5)                       # how deep the base is undercut here
    lipy = c.pg + 0.75 + 0.5 * vnoise(c.u / 7.0, 9.3, 6)
    rows.append((c.g - 0.45, -0.25, "lm"))
    rows.append((c.g + 0.05, und * 0.6, "lm"))
    rows.append((lipy, und, "lm"))
    rows.append((lipy + 0.28, -0.16 - 0.1 * vnoise(c.u / 3.0, 1.7, 8), "lm"))
    y3 = c.pg + 3.05
    rows.append((y3, 0.06, "lm"))
    # the cliff: hard sandstone beds that overhang the soft beds under them (a dark line under every lip, the light on
    # every lip), the soft beds retreating, the whole battered back about 5 degrees; level along the gully (absolute heights)
    o = 0.06; y_prev = y3
    bat = math.tan(math.radians(4.0))
    for k, b in enumerate(BEDS):
        by = b + 0.35 * fbm(c.u / 11.0, k * 3.7, 12, 2)
        lip = 0.14 + 0.24 * vnoise(c.u / 5.0, k * 2.9, 15)
        hh = 0.65 + 0.55 * vnoise(c.u / 7.0, k * 4.3, 16)
        o_s = o + bat * max(0.0, by - y_prev) + 0.08 + 0.2 * vnoise(c.u / 4.0, k * 1.7, 17)
        ya = clamp(by, y3, c.top); yb = clamp(by + 0.07, y3, c.top)
        rows += [(ya, o_s, "hi"), (yb, o_s - lip, "hi")]
        o = o_s - lip; y_prev = yb
    o += bat * max(0.0, c.top - y_prev)
    rows.append((c.top, o, "hi"))
    rows.append((c.top + 0.05, o + 1.2, "cap"))
    rows.append((c.top - 0.35, o + 3.2, "cap"))
    out = []
    for (y, o, kind) in rows:
        if kind != "lm" and not c.oh:
            f = smooth((y - c.pg - 1.2) / 2.5)
            o += 0.3 * fbm(c.u / 4.5, y / 2.6, 21, 2) * f
            o += 0.75 * smooth((vnoise(c.u / 3.1, 7.7, 44) - 0.7) / 0.12) * smooth((y - c.pg - 2.5) / 2.0)      # vertical joints: chimneys between blocks
            bump = max(0.0, vnoise(c.u / 16.0, 0.5, 33) - 0.62) / 0.38              # a buttress: a bulge that leans out overhead
            o -= 1.1 * bump * smooth((y - c.pg - 3.0) / 4.0) * (1.0 - 0.6 * smooth((y - c.top + 4.0) / 4.0))
        lim = c.tmax * (0.9 if kind != "cap" else 1.0)
        if kind == "cap": o = min(o, max(c.tmax, 0.6))
        else: o = min(o, lim)
        out.append((y, o, kind))
    return out


def build_curtain(S):
    lm = Part("lip_wall", Z, smooth=28)
    hi = Part("lip_cliff", Z, smooth=28)
    loops = lf.contours()
    runs = []
    for loop in loops: runs.extend(make_columns(loop))
    S.extra["lip"]["runs"] = runs
    chart_n = 0
    for run in runs:
        prof = [column_rows(c) for c in run]
        pos = [[(c.x - c.nx * o, y, c.z - c.nz * o) for (y, o, kind) in rows] for c, rows in zip(run, prof)]
        nrow = len(prof[0])
        vl = [[lm.vert(pos[i][r]) if prof[i][r][2] == "lm" else None for r in range(nrow)] for i in range(len(run))]
        vh = [[hi.vert(pos[i][r]) if (prof[i][r][2] != "lm" or r == 4) else None for r in range(nrow)] for i in range(len(run))]
        u0 = run[0].u; chart = None
        for i in range(len(run) - 1):
            a, b = run[i], run[i + 1]
            if chart is None or a.u - u0 > 70.0 or a.oh != run[max(0, i - 1)].oh:
                chart = kit.chart(f"lip_wall_{chart_n}", 1.0); chart_n += 1; u0 = a.u
            jump = abs(a.top - b.top) > 1.6 and not (a.oh or b.oh)
            if jump:
                # a taller block stands behind a lower one here: the step's own face (the taller column's profile carried
                # back into the mass), so the block has a side and is not a sail between two heights
                hc, lc, ih = (a, b, i) if a.top > b.top else (b, a, i + 1)
                depth = min(max(hc.tmax, 1.2), 3.6)
                rr = [r for r in range(4, nrow) if prof[ih][r][2] == "hi" and pos[ih][r][1] > lc.top - 0.4]
                for r0, r1 in zip(rr[:-1], rr[1:]):
                    A0, A1 = pos[ih][r0], pos[ih][r1]
                    if A1[1] - A0[1] < 0.03: continue
                    B0 = (A0[0] - hc.nx * depth, A0[1], A0[2] - hc.nz * depth); B1 = (A1[0] - hc.nx * depth, A1[1], A1[2] - hc.nz * depth)
                    q = facing_out([A0, A1, B1, B0], (lc.x - lc.nx * depth * 0.5 + (lc.x - hc.x) * 3.0, (A0[1] + A1[1]) / 2, lc.z - lc.nz * depth * 0.5 + (lc.z - hc.z) * 3.0))
                    hi.poly(q, "m_frontier", [rock.strata_uv(hc.u + (0.0 if v in (A0, A1) else depth), v[1]) for v in q],
                            [rock.rock_colour(v[1], hc.top, 0.0, 0.1, 3, v[0], v[2]) for v in q], final=True)
            for r in range(nrow - 1):
                kinds = (prof[i][r][2], prof[i][r + 1][2])
                if jump and "cap" in kinds and kinds[0] == "cap": continue          # the cap bed does not bridge a step
                low = kinds[1] == "lm"
                part = lm if low else hi
                vv = vl if low else vh
                idx = [vv[i][r], vv[i][r + 1], vv[i + 1][r + 1], vv[i + 1][r]]
                q = [(i, r), (i, r + 1), (i + 1, r + 1), (i + 1, r)]
                P = [pos[a_][r_] for a_, r_ in q]
                # drop collapsed corners (rows clamped to the same height)
                keep = [0]
                for t in range(1, 4):
                    if all(kit.vlen(kit.vsub(P[t], P[s])) > 0.02 for s in keep): keep.append(t)
                if len(keep) < 3: continue
                cols_ = []; uvs = []; st = []
                for t in keep:
                    ci = run[q[t][0]]; y, o, kind = prof[q[t][0]][q[t][1]]
                    pp = P[t]
                    rr = q[t][1]
                    phase = (rr - 5) % 2 if rr >= 5 else -1                          # 0: the soft bed's top (in the lip's shadow), 1: the lip
                    dark = 0.75 if ci.oh else (0.45 if rr in (1, 2) else (0.42 if phase == 0 else 0.0))
                    up = 1.0 if kind == "cap" else (0.4 if phase == 1 else 0.0)
                    cc = rock.rock_colour(y, ci.top, up, dark, 3, pp[0], pp[2])
                    if low:
                        h = y - ci.g
                        cc = mix(cc, lin("sand"), (0.22 if ci.oh else 0.6) * clamp(1.0 - h / 0.7) ** 1.5)            # the dust skirt
                    cols_.append(cc)
                    uvs.append(rock.strata_uv(ci.u, y))
                    st.append((ci.u, y - ci.pg))
                part.face([idx[t] for t in keep], "m_frontier", uvs, cols_, chart if low else None, st if low else None, final=True)
    kit.tessellate(hi, 7.0)
    return [lm, hi]


# ====================================================================== the top of the mass, the west outer face
def build_plateau(S):
    p = Part("lip_plateau", Z, smooth=28)
    step = 3.2
    nx = int(round((lf.BX1 + 0.4 - (lf.BX0 + 0.2)) / step)); nz = int(round((lf.BZ1 + 0.4 - lf.BZ0) / step))
    X = [lf.BX0 + 0.2 + i * (lf.BX1 + 0.2 - lf.BX0) / nx for i in range(nx + 1)]
    Zs = [lf.BZ0 + j * (lf.BZ1 + 0.4 - lf.BZ0) / nz for j in range(nz + 1)]
    node = {}
    for j, z in enumerate(Zs):
        for i, x in enumerate(X):
            d = lf.F(x, z)
            roof = lf.OH[0] - 1 <= x <= lf.OH[1] + 1 and z >= 100.6
            rocky = roof                                                   # the tops of the masses are never looked down on: only the roof's
            node[(i, j)] = (rocky, x, z)
    vid = {}

    def vert(i, j):
        if (i, j) not in vid:
            _, x, z = node[(i, j)]
            y = lf.top_at(x, z) - 0.35
            if lf.OH[0] - 1 <= x <= lf.OH[1] + 1 and z >= 100.6: y = 19.0 + 0.4 * fbm(x / 5, z / 5, 9, 2)
            vid[(i, j)] = (p.vert((x, y, z)), (x, y, z))
        return vid[(i, j)]

    for j in range(nz):
        for i in range(nx):
            if not all(node[(i + a, j + b)][0] for a, b in ((0, 0), (1, 0), (1, 1), (0, 1))): continue
            q = [vert(i, j), vert(i, j + 1), vert(i + 1, j + 1), vert(i + 1, j)]
            pts = [v[1] for v in q]
            cols = [mix(rock.rock_colour(a[1], a[1], 1.0, 0.0, 5, a[0], a[2]), lin("sand_pale"), 0.25 * vnoise(a[0] / 4, a[2] / 4, 3)) for a in pts]
            p.face([v[0] for v in q], "m_frontier", [row_uv(FT, "strata", a[0], 0.3 + 0.4 * vnoise(a[0], a[2], 2)) for a in pts], cols, final=True)
    # the west outer face: what the street sees behind and above the gate wall
    w = Part("lip_outer_w", Z, smooth=28)
    zs = [9.0 + k * (102.0 / 30) for k in range(31)]
    grid = []
    for k, z in enumerate(zs):
        top = mass_top(1.2, z)
        x0 = 0.1 + 0.25 * fbm(z / 7.0, 0.3, 51, 2)
        rows = []
        ys = [-0.6, 1.4, 3.6, 6.2, 9.2, 12.4, 15.6, 18.8, 22.0]
        off = 0.0
        for r, y in enumerate(ys):
            y = min(y + 0.6 * fbm(z / 9.0, r * 2.2, 52, 2), top)
            off = min(1.4, 0.07 * max(0.0, y) + (0.35 if r % 2 else 0.0) + 0.3 * fbm(z / 5.0, y / 3.0, 53, 2))
            rows.append((x0 + max(0.0, off), y, z, top))
        rows.append((x0 + min(2.2, off + 1.0), top - 0.1, z, top))
        grid.append([(w.vert((a[0], a[1], a[2])), a) for a in rows])
    for k in range(len(zs) - 1):
        for r in range(len(grid[0]) - 1):
            q = [grid[k][r], grid[k + 1][r], grid[k + 1][r + 1], grid[k][r + 1]]          # faces -x (west)
            P = [v[1] for v in q]
            keep = [0]
            for t in range(1, 4):
                if all(kit.vlen(kit.vsub(P[t][:3], P[s][:3])) > 0.05 for s in keep): keep.append(t)
            if len(keep) < 3: continue
            w.face([q[t][0] for t in keep], "m_frontier", [rock.strata_uv(P[t][2], P[t][1]) for t in keep],
                   [mix(rock.rock_colour(P[t][1], P[t][3], 0.0, 0.0, 6, P[t][0], P[t][2]), lin("sand"), 0.5 * clamp(1 - P[t][1] / 0.8)) for t in keep], final=True)
    return [p, w]


# ====================================================================== the mouth's masses, closed
def build_closure(S):
    """What makes the rock at the gully's mouth a MASS and not a curtain: seen from the forecourt, the gate and the
    street (which look at it from outside and from below its top) every block needs a top and, where a taller block
    stands behind a lower one, the face of the step between them. A 1 m heightfield over the rock north of z = 30:
    each cell a bench at `mass_top`, a bedded riser wherever two neighbours differ, and the north ends of the masses
    (the faces the street looks at). The corridor side is the curtain's; its cap bed laps over these benches.
    Forced into chunk_lip_gate (drawn from the street, with triangles to spare), whatever its height."""
    p = Part("lip_mass", Z, chunk="chunk_lip_gate", smooth=28)
    X0, X1, Z0, Z1 = 0, 32, -9, 31
    rocks = lf.MAIN + lf.SPUR

    def cell(i, j):
        if not (X0 <= i < X1 and Z0 <= j < Z1): return None
        x = i + 0.5; z = j + 0.5
        if float(lf.d_set(x, z, rocks)) > -0.05 or lf.F(x, z) > -1.25: return None
        h = mass_top(x, z) - 0.45
        return 0.75 * math.floor(h / 0.75 + 0.5)
    H = {(i, j): cell(i, j) for i in range(X0 - 1, X1 + 1) for j in range(Z0 - 1, Z1 + 1)}
    jit = lambda x, z: (x + 0.16 * fbm(x / 1.7, z / 1.7, 71, 2), z + 0.16 * fbm(x / 1.7 + 9.0, z / 1.7, 72, 2))

    def P(x, y, z):
        if z >= 29.99: z = 29.97                                           # the chunk's box ends at z = 30
        xx, zz = jit(x, z)
        return (clamp(xx, 0.05, 32.3), y, min(zz, 29.97))
    for (i, j), h in H.items():
        if h is None: continue
        if j < 30:
            q = [P(i, h, j), P(i, h, j + 1), P(i + 1, h, j + 1), P(i + 1, h, j)]
            p.poly(q, "m_frontier", [row_uv(FT, "strata", a[0], 0.3 + 0.4 * vnoise(a[0], a[2], 2)) for a in q],
                   [mix(rock.rock_colour(a[1], a[1], 1.0, 0.0, 5, a[0], a[2]), lin("sand_pale"), 0.25 * vnoise(a[0] / 4, a[2] / 4, 3)) for a in q], final=True, weld=True)
        # risers: toward each neighbour that stands lower (or, to the north, that is not rock at all)
        for (di, dj, e0, e1) in ((1, 0, (i + 1, j), (i + 1, j + 1)), (-1, 0, (i, j + 1), (i, j)), (0, 1, (i + 1, j + 1), (i, j + 1)), (0, -1, (i, j), (i + 1, j))):
            hb = H.get((i + di, j + dj))
            if hb is None:
                if dj != -1: continue                                      # an outer face nobody looks at (east, south) or the corridor's (the curtain)
                xb = i + 0.5; zb = j - 0.5
                if lf.F(xb, zb) > -0.3: continue                          # the corridor is there: the curtain's face
                hb = kit.path_ground(Z, xb, zb) + 3.0
            if hb >= h - 0.05: continue
            if j >= 30 and dj != -1: continue                              # beyond the box only the faces that look north along it
            ys = [hb] + [b_ for b_ in BEDS if hb + 0.35 < b_ < h - 0.35] + [h]
            rows = []
            for k, y in enumerate(ys):
                o = 0.16 * (k % 2) - 0.05 * (y - hb)                       # hard beds stand a hand proud; the whole face battered back
                rows.append((P(e0[0] + di * o, y, e0[1] + dj * o), P(e1[0] + di * o, y, e1[1] + dj * o)))
            for k in range(len(ys) - 1):
                q = [rows[k][0], rows[k][1], rows[k + 1][1], rows[k + 1][0]]
                q = facing_out(q, (i + 0.5 + di * 4.0, (ys[k] + ys[k + 1]) / 2, j + 0.5 + dj * 4.0))
                p.poly(q, "m_frontier", [rock.strata_uv(a[0] + a[2], a[1]) for a in q], [rock.rock_colour(a[1], h + 0.45, 0.0, 0.12 if k % 2 == 0 else 0.0, 6, a[0], a[2]) for a in q], final=True, weld=True)
    return [p]


def facing_out(pts, target):
    n = kit.vcross(kit.vsub(pts[1], pts[0]), kit.vsub(pts[2], pts[0]))
    return list(pts) if kit.vdot(n, kit.vsub(target, pts[0])) >= 0 else list(pts)[::-1]


# ====================================================================== overhang roof and mouth
NOTCH = (8.9, 11.4, 100.2, 102.3)       # x0, x1, z0, z1: the bite out of the lowest roof bed, upper left of the mouth


def ceiling_y(x, z):
    y = 17.06 + 0.22 * vnoise(x / 1.7, z / 1.7, 61) + 0.12 * vnoise(x / 0.7, z / 0.7, 62)
    # the notch: the lowest bed has broken away at the mouth's upper left (seen from inside, looking north)
    nx = smooth((x - NOTCH[0]) / 0.5) * smooth((NOTCH[1] - x) / 0.9)
    nzf = smooth((NOTCH[3] - z) / 0.7)
    y += 0.78 * nx * nzf
    return y


def build_overhang(S):
    roof = Part("lip_roof", Z, smooth=28)
    # the underside: a grid, finer toward the mouth
    xs = [7.0 + i * 14.0 / 16 for i in range(17)]
    zs = [100.3, 100.9, 101.5, 102.2, 103.0, 104.0, 105.2, 106.5, 107.8, 109.2, 110.4, 111.2]
    grid = [[None] * len(xs) for _ in zs]
    for j, z in enumerate(zs):
        for i, x in enumerate(xs):
            y = ceiling_y(x, z)
            grid[j][i] = (roof.vert((x, y, z)), (x, y, z))
    for j in range(len(zs) - 1):
        for i in range(len(xs) - 1):
            q = [grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]]              # faces down
            P = [v[1] for v in q]
            roof.face([v[0] for v in q], "m_frontier", [row_uv(FT, "strata", a[0], 0.2 + 0.5 * vnoise(a[0] / 2, a[2] / 2, 4)) for a in P],
                      [rock.rock_colour(a[1], None, 0.0, 0.8, 8, a[0], a[2]) for a in P], final=True)
    # the lintel: the roof slab's north face, three beds, the lowest overhanging
    beds = [(0.0, -0.55), (0.62, -0.5), (0.7, -0.05), (1.45, 0.0), (1.5, -0.3), (2.15, -0.22)]   # (height above the ceiling, z offset from 100.3: negative = toward the valley)
    cols = []
    for i, x in enumerate(xs):
        base = grid[0][i][1][1]
        col = []
        for (h, dz) in beds:
            y = base + h * (2.0 / 2.15) + 0.0
            zz = 100.3 + dz + 0.18 * fbm(x / 2.3, h * 2.0, 71, 2)
            if h == 0.0: zz = 100.3; y = base
            col.append((roof.vert((x, min(y, 19.4), zz)), (x, min(y, 19.4), zz)))
        col.append((roof.vert((x, 19.25 + 0.3 * fbm(x / 4, 0.2, 72, 2), 101.6)), (x, 19.3, 101.6)))
        cols.append(col)
    for i in range(len(xs) - 1):
        for r in range(len(beds)):
            q = [cols[i][r], cols[i][r + 1], cols[i + 1][r + 1], cols[i + 1][r]]            # faces north (-z) / up
            P = [v[1] for v in q]
            roof.face([v[0] for v in q], "m_frontier", [rock.strata_uv(a[0], a[1]) for a in P],
                      [rock.rock_colour(a[1], 19.4, 0.6 if r in (1, 3, 5) else 0.0, 0.25 if r in (1, 3) else 0.0, 9, a[0], a[2]) for a in P], final=True)
    # the fallen slab, lower right of the mouth: a bed that came down and leans against the east jamb
    slab = Part("lip_slab", Z, smooth=28)
    rock.rock_box(slab, (19.75, 14.55, 100.55), (2.05, 1.25, 0.42), rot=12.0, seed=77, n=2, bulge=0.06, chamfer=0.12,
                  chart="lip_slab", ground=lf.ground, lean=(0.42, -0.1))
    return [roof, slab]


# ====================================================================== boulders, ledge, talus
def build_boulders(S):
    out = []
    for k, s in enumerate(lf.BOULDERS):
        p = Part("lip_" + s["id"].replace("lip_", ""), Z, smooth=18)
        # broken bedrock: slabs lying on one another along the bedding, each with its own plan (within 0.25 m of the cover solid)
        rock.bedded_block(p, s["pos"], s["size"], rot=s.get("rotY", 0), seed=100 + k, beds=3 if s["size"][1] > 1.5 else 2, chart="lip_bo%d" % k, ground=lf.ground,
                          **(dict(grow=0.0, bulge=0.05, inset_max=0.12, n=2) if s["id"] == "lip_boulder_2" else dict(grow=0.12)))   # boulder 2 stands half a metre from a nav node: no growth there
        out.append(p)
        # sand banked on its windward (north-west) side
        d = Part("lip_bdrift%d" % k, Z, smooth=40)
        ax = s["pos"][0] - 0.3 * s["size"][0]; az = s["pos"][2] - 0.36 * s["size"][2]
        gy = lf.ground(ax, az)
        rock.drift_mound(d, (ax, gy + 0.45, az), 1.7, 315.0, 160.0, 7, chart="lip_bdr%d" % k, ground=lf.ground, seed=150 + k)
        out.append(d)
    # the ledge (the one optional jump): a low shelf of rock, its top the layout's platform
    s = lf.SOL["lip_ledge"]
    p = Part("lip_ledge", Z, smooth=28)
    top = s["pos"][1] + s["size"][1] / 2
    rock.rock_box(p, (s["pos"][0], top - 0.5, s["pos"][2]), (s["size"][0] + 0.5, 1.0, s["size"][2] + 0.3), seed=140, n=3, bulge=0.05, chamfer=0.1,
                  chart="lip_ledge", ground=None)
    out.append(p)
    # talus: small stones at the wall feet (inside the rock's footprint or under 0.3 m: nothing a body meets)
    t = Part("lip_talus", Z, smooth=None)
    rng = random.Random(SEED + 5)
    runs = S.extra["lip"]["runs"]
    n = 0
    for run in runs:
        for c in run:
            if c.oh or rng.random() > 0.16: continue
            for _ in range(rng.choice((1, 1, 2, 3))):
                back = rng.uniform(-0.25, 0.5); side = rng.uniform(-0.9, 0.9)
                x = c.x - c.nx * back - c.nz * side; z = c.z - c.nz * back + c.nx * side
                r = rng.uniform(0.16, 0.42) if back > 0.05 else rng.uniform(0.12, 0.24)
                rock.rock_chunk(t, (x, lf.ground(x, z) + 0.02, z), r, seed=rng.randrange(10 ** 6), dark=0.15)
                n += 1
    out.append(t)
    return out


# ====================================================================== collider
def build_collider(S):
    """collider_terrain: the drawn ground sheet (same vertices) plus the vertical faces and tops of the rock solids."""
    import bpy
    from lib import mesh as meshlib, zone as zonelib
    verts = []; faces = []; seen = {}

    def vid(q):
        k = (round(q[0], 3), round(q[1], 3), round(q[2], 3))
        if k not in seen: seen[k] = len(verts); verts.append(layout.to_blender(q))
        return seen[k]

    def tri_up(a, b, c):
        # counter-clockwise seen from above in game space (vertices shared: a collider carries positions only)
        n = kit.vcross(kit.vsub(b, a), kit.vsub(c, a))
        if n[1] < 0: b, c = c, b
        faces.append((vid(a), vid(b), vid(c)))

    for q in S.extra["lip"]["ground_quads"]:
        tri_up(q[0], q[1], q[2]); tri_up(q[0], q[2], q[3])
    for s in lf.MAIN + lf.SPUR:
        for f in layout.solid_faces(s):
            n = kit.vnorm(kit.vcross(kit.vsub(f[1], f[0]), kit.vsub(f[2], f[0])))
            if n[1] < -0.5: continue
            faces.append(tuple(vid(p) for p in f))
    me = bpy.data.meshes.new("me_collider_terrain"); me.from_pydata(verts, [], faces); me.update()
    for pl in me.polygons: pl.use_smooth = True
    ob = bpy.data.objects.new("collider_terrain", me); bpy.context.scene.collection.objects.link(ob)
    return zonelib.collider_terrain(ob)


# ====================================================================== assembly
def build(S):
    parts = []
    parts += build_ground(S)
    parts += build_curtain(S)
    parts += build_plateau(S)
    parts += build_closure(S)
    parts += build_overhang(S)
    parts += build_boulders(S)
    import lip_built
    parts += lip_built.build(S)
    S.extra["lip"]["post"] = post
    return parts


def embed(S):
    import lip_built
    lip_built.embed(S)


def post(S):
    import lip_built
    build_collider(S)
    lip_built.dressing(S)
