"""ext_rock: sandstone for the exterior zones (helper module). Red stratified rock per ART_BIBLE 5.2 ("Rock: no bevel,
smooth_angle 28 so some edges stay faceted"), 7.2 (`lip_gully_walls`): bedding bands mapped by ABSOLUTE height (the
`strata` row as a triangle wave of height, so beds run level along the whole gully), ledges at the bed tops, undercut
bases, a bleached cap. Game space throughout (ext_kit)."""
import math, random
import ext_kit as kit
from ext_kit import lin, mix, mul, clamp, smooth, fbm, vnoise, row_uv, tri, FT

BED = 3.0          # metres per strata repeat


def bed_tone(y):
    """Tone multiplier of the bed at absolute height y: alternating darker / lighter beds, level along the gully."""
    k = math.floor((y + 0.4) / 1.5)
    return (0.86, 1.04, 0.93, 1.10, 0.80, 1.0)[k % 6]


def rock_colour(y, y_top=None, up=0.0, dark=0.0, seed=0, x=0.0, z=0.0):
    """Albedo of rock at height y: `rock`, banded by bed, toward `rock_dark` by `dark` (undercuts, interiors), toward
    `rock_cap` near the top of the mass and on up-facing ledges (`up` 0..1)."""
    c = mul(lin("rock"), bed_tone(y) * (0.94 + 0.12 * vnoise(x * 0.35, z * 0.35 + y * 0.6, seed)))
    if dark > 0: c = mix(c, lin("rock_dark"), clamp(dark))
    cap = 0.0
    if y_top is not None: cap = smooth((y - (y_top - 1.6)) / 1.6) * 0.75
    cap = max(cap, 0.55 * up)
    if cap > 0: c = mix(c, lin("rock_cap"), clamp(cap))
    return c


def strata_uv(u_m, y):
    return row_uv(FT, "strata", u_m, tri(y, BED))


def rock_box(part, c, size, rot=0.0, seed=1, n=3, bulge=0.2, chamfer=0.25, chart=None, ground=None, sink=0.0, dark=0.0, lean=(0.0, 0.0), cuts=0, slope=0.0, cut_depth=(0.35, 0.7)):
    """A boulder / slab from a box: every face an n x n grid, the corners and edges pulled in (never further than
    `chamfer` from the box), the faces pushed about by +-`bulge` x noise, so the silhouette is a faceted block and the
    drawn rock stays within 0.25 m of a cover solid. The bottom is left out. chart: a chart-name prefix; each side
    becomes its own chart `<prefix>_<side>`. ground(x, z): the rock is cut off 0.3 m below it."""
    hx, hy, hz = size[0] / 2, size[1] / 2, size[2] / 2
    rng = random.Random(seed)
    ph = [rng.uniform(0, 50) for _ in range(3)]
    # facets: a few corners struck off by planes (a block that broke off a bed), the top tilted along its bedding
    planes = []
    for k in range(cuts):
        sx = rng.choice((-1, 1)); sy = rng.choice((-1, 1, 1)); sz = rng.choice((-1, 1))
        nrm = kit.vnorm((sx / hx, sy / hy, sz / hz))
        depth = rng.uniform(*cut_depth)
        planes.append((nrm, kit.vdot(nrm, (sx * hx, sy * hy, sz * hz)) - depth))
    sdir = rng.uniform(0, 2 * math.pi)

    def shape(lx, ly, lz):
        # normalised position on the box surface -> displaced point (game)
        ax, ay, az = abs(lx) / hx, abs(ly) / hy, abs(lz) / hz
        # round the edges: scale each coordinate in when two or three coordinates are near the surface
        e = sorted((ax, ay, az))
        edge = smooth((e[1] - 0.55) / 0.45)                           # 1 on an edge, 0 mid-face
        corner = smooth((e[0] - 0.55) / 0.45)
        pull = chamfer * (0.55 * edge + 0.45 * corner)
        l = math.sqrt(lx * lx + ly * ly + lz * lz) or 1.0
        nz = fbm(lx * 0.9 + ph[0], ly * 0.9 + ph[1] + lz * 0.7, seed, 2) * bulge
        nz2 = fbm(lz * 0.8 + ph[2], ly * 1.1 + lx * 0.6, seed + 5, 2) * bulge
        k = 1.0 - pull / l
        px = lx * k + (nz if ax > 0.98 else 0.0) * (1 if lx > 0 else -1) * (1 - edge)
        pz = lz * k + (nz2 if az > 0.98 else 0.0) * (1 if lz > 0 else -1) * (1 - edge)
        py = ly * k + ((nz + nz2) * 0.5 if ay > 0.98 else 0.0) * (1 - edge)
        for (nrm, d) in planes:
            e = kit.vdot(nrm, (px, py, pz)) - d
            if e > 0: px, py, pz = px - nrm[0] * e, py - nrm[1] * e, pz - nrm[2] * e
        if slope and ly > 0: py += slope * (math.cos(sdir) * lx / hx + math.sin(sdir) * lz / hz) * (ly / hy)
        f = (ly + hy) / (2 * hy)
        p = kit.rot_y((c[0] + px + lean[0] * f, c[1] + py - sink, c[2] + pz + lean[1] * f), rot, c)
        return p

    sides = {"e": (lambda a, b: (hx, b, -a)), "w": (lambda a, b: (-hx, b, a)), "s": (lambda a, b: (a, b, hz)),
             "n": (lambda a, b: (-a, b, -hz)), "t": (lambda a, b: (a, hy, -b))}
    ext = {"e": (hz, hy), "w": (hz, hy), "s": (hx, hy), "n": (hx, hy), "t": (hx, hz)}
    y_top = c[1] + hy - sink
    for sname in "ewsnt":
        fn = sides[sname]; ea, eb = ext[sname]
        ch = kit.chart(f"{chart}_{sname}") if chart else None
        grid = []
        for j in range(n + 1):
            row = []
            for i in range(n + 1):
                a = -ea + 2 * ea * i / n; b = -eb + 2 * eb * j / n
                p = shape(*fn(a, b))
                if ground is not None:
                    gy = ground(p[0], p[2]) - 0.3
                    if p[1] < gy: p = (p[0], gy, p[2])
                row.append((part.vert(p, weld=True), p, (a, b)))
            grid.append(row)
        for j in range(n):
            for i in range(n):
                q = [grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]]
                if len({v[0] for v in q}) < 3: continue
                pts = [v[1] for v in q]
                up = 1.0 if sname == "t" else 0.0
                cols = [rock_colour(p[1], y_top, up, dark, seed, p[0], p[2]) for p in pts]
                uvs = [strata_uv(v[2][0] + ea, p[1]) if sname != "t" else kit.flat_uv("m_frontier") for v, p in zip(q, pts)]     # tops: no bedding lines (they read as wood grain from above)
                st = [(v[2][0], v[2][1]) for v in q] if ch else None
                idx = [v[0] for v in q]
                if len(set(idx)) == 3:
                    keep = [];
                    for t, v in enumerate(idx):
                        if v not in [w for w in idx[:t]]: keep.append(t)
                    part.face([idx[t] for t in keep], "m_frontier", [uvs[t] for t in keep], [cols[t] for t in keep], ch, [st[t] for t in keep] if st else None, final=True)
                else:
                    part.face(idx, "m_frontier", uvs, cols, ch, st, final=True)


def rock_chunk(part, c, r, seed=1, dark=0.0, flat=0.6):
    """A small faceted stone (talus, scree): a squashed, jittered octahedron-ish lump, 8-16 triangles, half buried."""
    rng = random.Random(seed)
    ring = []
    n = rng.choice((5, 6))
    for i in range(n):
        a = 2 * math.pi * (i + rng.uniform(-0.25, 0.25)) / n
        rr = r * rng.uniform(0.75, 1.15)
        ring.append((c[0] + math.cos(a) * rr, c[1] + r * flat * rng.uniform(0.05, 0.45), c[2] + math.sin(a) * rr))
    foot = [(c[0] + (p[0] - c[0]) * 1.15, c[1] - r * 0.25, c[2] + (p[2] - c[2]) * 1.15) for p in ring]
    top = (c[0] + rng.uniform(-0.2, 0.2) * r, c[1] + r * flat * rng.uniform(0.8, 1.1), c[2] + rng.uniform(-0.2, 0.2) * r)
    vi = [part.vert(p) for p in ring]; fi = [part.vert(p) for p in foot]; ti = part.vert(top)
    for i in range(n):
        j = (i + 1) % n
        col = rock_colour(c[1] + 0.3 * i, None, 0.0, dark, seed + i, c[0], c[2])
        part.face((vi[j], vi[i], ti), "m_frontier", [strata_uv(i * 0.4, c[1] + 0.2), strata_uv(i * 0.4 + 0.4, c[1] + 0.2), strata_uv(i * 0.4 + 0.2, c[1] + 0.6)],
                  mix(col, lin("rock_cap"), 0.35), final=True)
        part.face((fi[j], fi[i], vi[i], vi[j]), "m_frontier", [strata_uv(i * 0.4, c[1] - 0.2), strata_uv(i * 0.4 + 0.4, c[1] - 0.2), strata_uv(i * 0.4 + 0.4, c[1] + 0.2), strata_uv(i * 0.4, c[1] + 0.2)],
                  mix(col, lin("sand"), 0.35), final=True)


def bedded_block(part, c, size, rot=0.0, seed=1, beds=3, chart=None, ground=None, grow=0.1, n=3, dark=0.0, top_slope=0.14, dip=0.07, bulge=0.12, inset_max=0.28):
    """A cover boulder that reads as a fallen block of bedrock, not as a box: `beds` slabs lying on one another along
    the bedding, each a faceted `rock_box` of its own plan (every side set back by its own 0..0.28 m from the solid
    grown by `grow`, so the drawn rock stays within 0.25 m of the layout's cover solid: c = its centre, size = its
    full size), turned a few degrees against its neighbours, corners struck off, the joints between the beds open as
    shadow lines. The bedding DIPS (`dip`: metres of rise per metre across, in a seeded direction): the block came
    down and lies tilted, so its joints are not level like the cliff's. Only what stands above the ground is bedded.
    chart: prefix of the lightmap charts (one family per bed)."""
    rng = random.Random(seed * 31 + 7)
    y0 = c[1] - size[1] / 2; y1 = c[1] + size[1] / 2 + 0.05
    if ground is not None: y0 = max(y0, ground(c[0], c[2]) - 0.5)
    H = y1 - y0
    w = [rng.uniform(0.75, 1.3) for _ in range(beds)]; tot = sum(w)
    start = len(part.v)
    y = y0
    for k in range(beds):
        h = H * w[k] / tot
        ins = [0.0 if k == 0 else min(inset_max, rng.choice((0.0, 0.05, 0.12, 0.2, 0.28))) for _ in range(4)]      # w, e, n, s
        sx = size[0] + 2 * grow - ins[0] - ins[1]; sz = size[2] + 2 * grow - ins[2] - ins[3]
        off = kit.rot_y(((ins[0] - ins[1]) / 2, 0.0, (ins[2] - ins[3]) / 2), rot)
        sink = 0.07 if k > 0 else 0.0
        last = k == beds - 1
        rock_box(part, (c[0] + off[0], y + h / 2 - sink / 2, c[2] + off[2]), (sx, h + sink, sz), rot=rot + (rng.uniform(-3.5, 3.5) if k else 0.0), seed=seed * 10 + k, n=n,
                 bulge=bulge, chamfer=0.16 if last else 0.09, chart=(f"{chart}_{k}" if chart else None), ground=ground if k == 0 else None, dark=dark,
                 cuts=(4 if last else 2) if k else 1, slope=top_slope if last else 0.03, cut_depth=(0.25, 0.5) if last else (0.16, 0.36))
        y += h
    a = rng.uniform(0, 2 * math.pi); dx = math.cos(a) * dip; dz = math.sin(a) * dip
    def tilt(p):
        f = clamp((p[1] - y0) / max(H, 1e-3))
        return (p[0], p[1] + f * (dx * (p[0] - c[0]) + dz * (p[2] - c[2])), p[2])
    part.transform(tilt, start)


def drift_mound(part, apex, toe_r, bearing_deg, spread_deg=150.0, segs=7, chart=None, ground=None, seed=1):
    """A wedge of sand blown against something: a half cone from `apex` (on the thing's face, its height the drift's
    height) down to a ragged toe `toe_r` metres out, fanning `spread_deg` about `bearing_deg` (0 = north, clockwise).
    m_sand (the ripples), paler toward the crest; chart: lightmap chart name (planar from above)."""
    from ext_kit import sand_uv
    ch = kit.chart(chart) if chart else None
    a0 = math.radians(bearing_deg - spread_deg / 2)
    ring = []; mid = []
    for i in range(segs + 1):
        a = a0 + math.radians(spread_deg) * i / segs
        edge = math.sin(math.pi * i / segs) ** 0.6
        r = toe_r * (0.45 + 0.55 * edge) * (0.85 + 0.3 * vnoise(i * 0.9, 0.3, seed))
        for (f, store) in ((1.0, ring), (0.45, mid)):
            x = apex[0] + math.sin(a) * r * f; z = apex[2] - math.cos(a) * r * f
            gy = ground(x, z) if ground else apex[1]
            hh = (apex[1] - gy) * (1.0 - f) ** 1.6 * (0.5 + 0.5 * edge) if f < 1.0 else 0.0
            store.append((x, gy + hh - (0.02 if f == 1.0 else 0.0), z))
    pale = mix(lin("sand"), lin("sand_pale"), 0.75); base = mix(lin("sand"), lin("sand_pale"), 0.25)
    for i in range(segs):
        q = [ring[i], mid[i], mid[i + 1], ring[i + 1]]
        part.poly(q, "m_sand", [sand_uv(v) for v in q], [base, mix(base, pale, 0.6), mix(base, pale, 0.6), base], ch, [(v[0], v[2]) for v in q] if ch else None, final=True)
        t = [mid[i], apex, mid[i + 1]]
        part.poly(t, "m_sand", [sand_uv(v) for v in t], [mix(base, pale, 0.6), pale, mix(base, pale, 0.6)], ch, [(v[0], v[2]) for v in t] if ch else None, final=True)


def retint(part, start_face, colour, amount):
    """Mix the final colours of the faces of `part` from index start_face toward `colour` (a boulder of another bed:
    the pale caprock of the rim)."""
    for k in range(start_face, len(part.f)):
        idx, mat, uv0, col, ch, st, fin = part.f[k]
        part.f[k] = (idx, mat, uv0, [mix(c, colour, amount) for c in col], ch, st, fin)
