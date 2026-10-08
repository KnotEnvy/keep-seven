"""lip_dress: the mid-scale dressing of env_the_lip (pass i1; the visual reviewers: "wide empty sand between flat slabs,
few mid-scale forms; composition on arrival is carried by the distant landmark alone").

What lies in the gully between its landmarks, none of it with a collider (the collider is the ground sheet and the
layout's rock solids, unchanged). The rule that keeps a body from meeting it:
  - within about 1.5 m of a wall's foot: scree aprons, slabs that came off the beds and lean against the wall they
    fell from, dead scrub, the Old World's litter (a line pylon's cross-arm with its insulators, a length of cable);
  - on the open floor: nothing over 0.35 m. Low drifts of blown sand lying across the floor (m_sand, lightmapped:
    their crests take the light and throw long shadows under a 14 degree sun), and the hoops and felloes of a cart
    that did not make it up the gully.
Everything but the drifts is vertex-lit m_frontier (cheap, and it casts into the lightmap all the same).
Triangles: printed as DRESS lip ... per chunk; the manifest's chunk plans are the budget.
"""
import math, random
from lib import layout
import ext_kit as kit
import ext_rock as rock
import lip_fields as lf
from ext_kit import Part, lin, mix, mul, clamp, smooth, fbm, vnoise, flat_uv, row_uv, sand_uv, FT

Z = "lip"
FLF = None


def path_points():
    """The critical path through the Lip as a plan polyline [(x, z)] (design/layout.json nav.criticalPath)."""
    L = layout.load()
    nodes = {n["id"]: n for n in L["nav"]["nodes"]}
    out = []
    for i in L["nav"]["criticalPath"]:
        n = nodes.get(i)
        if n and n.get("zone") == "the_lip": out.append((n["pos"][0], n["pos"][2]))
    return out


_PATH = None


def path_dist(x, z):
    """Plan distance from (x, z) to the critical path."""
    global _PATH
    if _PATH is None: _PATH = path_points()
    best = 1e9
    for (a, b) in zip(_PATH[:-1], _PATH[1:]):
        dx, dz = b[0] - a[0], b[1] - a[1]; l2 = dx * dx + dz * dz or 1.0
        t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / l2)
        best = min(best, math.hypot(x - a[0] - dx * t, z - a[1] - dz * t))
    return best


def nav_dist(x, z, zone="the_lip"):
    """Plan distance from (x, z) to the nearest nav link of the zone. tests/art_env_exterior/openings.test.mjs holds
    every drawn triangle more than 0.35 m over the floor to 0.45 m or more from every link (bodies walk them)."""
    best = 1e9
    for a, b in layout.nav_segments(zone):
        dx, dz = b[0] - a[0], b[2] - a[2]; l2 = dx * dx + dz * dz
        t = 0.0 if l2 < 1e-12 else clamp(((x - a[0]) * dx + (z - a[2]) * dz) / l2)
        best = min(best, math.hypot(x - a[0] - dx * t, z - a[2] - dz * t))
    return best


def guard(part, f0, v0, ground=None, zone="the_lip"):
    """Take back what was just added to `part` (faces from f0, vertices from v0) if any of it stands more than 0.3 m
    over the floor within 0.55 m of a nav link and under head height. Returns True when it was kept."""
    ground = ground or lf.ground
    for q in part.v[v0:]:
        d = nav_dist(q[0], q[2], zone)
        if d >= 0.55: continue
        # the floor a body walks is the nav link's own height there (the drawn sand may lie a hand over it)
        h = q[1] - min(ground(q[0], q[2]), kit.path_ground("lip" if zone == "the_lip" else "street", q[0], q[2]))
        if 0.3 < h < 1.85:
            del part.f[f0:]
            return False
    return True


def keep_clear(x, z, r=1.5):
    """True when (x, z) is within r of something the player uses or reads (pickups, notes, props, puzzle pieces)."""
    for m in layout.markers("the_lip"):
        if m["type"] in ("pickup", "readable", "prop", "interactable", "puzzle_element", "door", "light") and math.hypot(m["pos"][0] - x, m["pos"][2] - z) < r: return True
    return False


# ---------------------------------------------------------------------------------------------------- small makers
def twig(part, a, b, r0, r1, col, col_b=None):
    """A tapered three-sided stick from a to b (6 triangles)."""
    ax = kit.vsub(b, a)
    if kit.vlen(ax) < 1e-4: return
    t = kit.vnorm(ax)
    s = kit.vcross(t, (0.0, 1.0, 0.0))
    if kit.vlen(s) < 1e-3: s = kit.vcross(t, (1.0, 0.0, 0.0))
    s = kit.vnorm(s); f = kit.vnorm(kit.vcross(s, t))
    ra = []; rb = []
    for k in range(3):
        an = 2 * math.pi * k / 3
        d = kit.vadd(kit.vscale(s, math.cos(an)), kit.vscale(f, math.sin(an)))
        ra.append(part.vert(kit.vadd(a, kit.vscale(d, r0)))); rb.append(part.vert(kit.vadd(b, kit.vscale(d, r1))))
    cb = col_b or col
    for k in range(3):
        j = (k + 1) % 3
        part.face((ra[j], ra[k], rb[k], rb[j]), "m_frontier", flat_uv("m_frontier"), [col, col, cb, cb], final=True)


def bush(part, c, h, rng, tone=1.0):
    """Dead scrub: grey stems forking up and out of one root, bleached at the tips (about 80 triangles)."""
    dark = mul(mix(lin("board_dark"), lin("ash_dark"), 0.5), 0.75 * tone); pale = mul(mix(lin("board_bleached"), lin("ash"), 0.4), 0.9 * tone)
    n = rng.choice((4, 5, 5, 6))
    a0 = rng.uniform(0, 2 * math.pi)
    for k in range(n):
        an = a0 + 2 * math.pi * k / n + rng.uniform(-0.4, 0.4)
        out = rng.uniform(0.35, 0.75) * h; up = rng.uniform(0.55, 1.0) * h
        root = (c[0] + math.cos(an) * 0.04, c[1] - 0.05, c[2] + math.sin(an) * 0.04)
        mid = (c[0] + math.cos(an) * out * 0.45, c[1] + up * 0.5, c[2] + math.sin(an) * out * 0.45)
        an2 = an + rng.uniform(-0.5, 0.5)
        tip = (c[0] + math.cos(an2) * out, c[1] + up, c[2] + math.sin(an2) * out)
        twig(part, root, mid, 0.03 * h + 0.014, 0.018 * h + 0.01, dark, mix(dark, pale, 0.5))
        twig(part, mid, tip, 0.018 * h + 0.01, 0.007, mix(dark, pale, 0.5), pale)
        if rng.random() < 0.75:                                           # a side shoot from the bend
            an3 = an + rng.choice((-1, 1)) * rng.uniform(0.6, 1.2)
            t2 = (mid[0] + math.cos(an3) * out * 0.5, mid[1] + up * rng.uniform(0.15, 0.4), mid[2] + math.sin(an3) * out * 0.5)
            twig(part, mid, t2, 0.014 * h + 0.008, 0.006, mix(dark, pale, 0.5), pale)


def scree_fan(part, x, z, nx, nz, rng, reach=1.5, n=6, big=0.55, ground=None, dark=0.12, lite=False):
    """A fan of fallen stone at a wall's foot: the biggest pieces against the wall, smaller ones further out."""
    ground = ground or lf.ground
    made = 0
    for _ in range(n):
        t = rng.uniform(0.0, 1.0) ** 1.4 * reach
        side = rng.uniform(-1.3, 1.3) * (0.5 + 0.5 * t / reach)
        px = x + nx * (t + 0.05) - nz * side; pz = z + nz * (t + 0.05) + nx * side
        if lf.F(px, pz) < 0.02 or keep_clear(px, pz) or path_dist(px, pz) < 1.15: continue
        r = (big * (1.0 - 0.72 * t / reach)) * rng.uniform(0.7, 1.15)
        r = min(r, 0.3 + 0.28 * clamp(1.0 - (lf.F(px, pz) - 0.5) / 1.0))      # nothing knee-high in the open
        if nav_dist(px, pz) < 0.6 + 1.2 * r: r = min(r, 0.26)                  # nor on a nav link (a stone's height is under its radius)
        f0, v0 = len(part.f), len(part.v)
        rock.rock_chunk(part, (px, ground(px, pz) + 0.02, pz), r, seed=rng.randrange(10 ** 6), dark=dark + 0.15 * rng.random(), flat=rng.uniform(0.55, 0.95))
        made += 1 if guard(part, f0, v0, ground) else 0
    return made


def leaning_slab(part, x, z, nx, nz, rng, L=2.0, H=1.3, T=0.34, seed=1):
    """A slab that came off a bed and stands on edge against the wall it fell from (vertex-lit, 40 triangles)."""
    tx, tz = -nz, nx
    rot = math.degrees(math.atan2(-tz, tx)) + rng.uniform(-9, 9)
    cx = x + nx * 0.48; cz = z + nz * 0.48
    gy = lf.ground(cx, cz)
    rock.rock_box(part, (cx, gy + H / 2 - 0.12, cz), (L, H + 0.25, T), rot=rot, seed=seed, n=2, bulge=0.07, chamfer=0.1, ground=lf.ground,
                  lean=(rng.uniform(-0.12, 0.12), 0.42), cuts=3, slope=rng.uniform(-0.2, 0.2), cut_depth=(0.12, 0.3), dark=0.1)


def drift(part, c, length, width, h, bearing_deg, name, seed=1, ground=None, k_col=1.0, ground_col=None):
    """A low drift of blown sand lying across the floor: a crest `length` long (its middle bowed downwind), a long
    windward slope and a short slip face. bearing_deg: where the wind goes TO (0 = north, clockwise). m_sand, one
    lightmap chart (planar from above), never over `h` (keep it under 0.35 m on the open floor). ground_col(x, z, y):
    the colour of the ground sheet there: the drift's toe takes exactly that colour (a drift with its own colour to its
    edge read as a plate lying on the sand), the crest goes pale and the slip face a shade darker."""
    ground = ground or lf.ground
    ch = kit.chart(name, 1.0)
    b = math.radians(bearing_deg)
    wx, wz = math.sin(b), -math.cos(b)                                    # downwind
    cx_, cz_ = -wz, wx                                                    # along the crest
    n = 6
    rows = [(-0.78, 0.0), (-0.34, 0.55), (0.0, 1.0), (0.13, 0.5), (0.3, 0.0)]      # (across, in widths: negative = upwind; height share)
    grid = []
    for i in range(n + 1):
        f = i / n; s_ = (f - 0.5) * length
        end = math.sin(math.pi * f) ** 0.7                                # the horns taper to nothing
        bow = 0.35 * width * (math.sin(math.pi * f) - 0.6) + 0.12 * width * (vnoise(i * 0.83, seed * 0.37, seed) - 0.5)
        col = []
        for (a, hh) in rows:
            px = c[0] + cx_ * s_ + wx * (a * width * (0.45 + 0.55 * end) + bow); pz = c[1] + cz_ * s_ + wz * (a * width * (0.45 + 0.55 * end) + bow)
            col.append((px, ground(px, pz) + h * hh * end * (0.8 + 0.4 * vnoise(i * 0.7 + 3.0, a * 2.0, seed)) + (0.006 if hh == 0.0 else 0.0), pz, hh * end, a))
        grid.append(col)
    base = mix(lin("sand"), lin("sand_pale"), 0.3); pale = mix(lin("sand"), lin("sand_pale"), 0.95)
    for i in range(n):
        for r in range(len(rows) - 1):
            q = [grid[i][r], grid[i + 1][r], grid[i + 1][r + 1], grid[i][r + 1]]
            P = [(v[0], v[1], v[2]) for v in q]
            if kit.vlen(kit.vsub(P[0], P[1])) < 0.03 and kit.vlen(kit.vsub(P[3], P[2])) < 0.03: continue
            def vc(v):
                g = ground_col(v[0], v[2], v[1]) if ground_col else base
                if v[3] <= 1e-4: return g                                  # the toe: the ground's own colour
                lee = v[4] > 0.05
                return mix(g, mul(pale, (0.74 if lee else 1.06) * k_col), clamp(v[3] * (1.0 if lee else 1.25)))
            cols = [vc(v) for v in q]
            nrm = kit.vcross(kit.vsub(P[1], P[0]), kit.vsub(P[2], P[0]))
            if nrm[1] < 0: P = P[::-1]; cols = cols[::-1]
            part.poly(P, "m_sand", [sand_uv(v) for v in P], cols, ch, [(v[0], v[2]) for v in P], final=True, weld=True)


def plate(part, c, size, rot, seed, h=0.22, ground=None):
    """Bedrock showing through the sand of the open floor: a low faceted slab (never over 0.35 m: nothing a body
    meets), its top swept bare and paler, its sides the cliff's red. About 40 triangles, vertex-lit."""
    ground = ground or lf.ground
    gy = ground(c[0], c[1])
    n0 = len(part.f); v0 = len(part.v)
    h = min(h, 0.26)                                                      # with its bulge and tilt the top stays under 0.33 m: a nav link may cross it
    rock.rock_box(part, (c[0], gy + h / 2 - 0.1, c[1]), (size[0], h + 0.2, size[1]), rot=rot, seed=seed, n=2, bulge=0.04, chamfer=0.09, ground=ground,
                  cuts=4, slope=0.025, cut_depth=(0.14, 0.34), dark=0.08)
    part.transform(lambda q: (q[0], q[1] + ground(q[0], q[2]) - gy, q[2]), v0)      # it lies WITH the slope (level, its downhill end stood half a metre over the floor)
    rock.retint(part, n0, lin("rock_dark"), 0.22)
    # dust lies on its top: the up-facing faces go half way to the sand's colour (a bare red top read as a painted tile)
    for i in range(n0, len(part.f)):
        idx, mat, uv0, col, ch, st, fin = part.f[i]
        a, b, c_ = part.v[idx[0]], part.v[idx[1]], part.v[idx[2]]
        n = kit.vcross(kit.vsub(b, a), kit.vsub(c_, a)); l = kit.vlen(n) or 1.0
        t = smooth((n[1] / l - 0.5) / 0.4)
        if t > 0: part.f[i] = (idx, mat, uv0, [mix(cc, mul(lin("sand"), 0.92), 0.5 * t) for cc in col], ch, st, fin)


def tree(part, root, lean, h, rng, tone=1.0):
    """A dead tree standing out of a crack at the wall's foot: a trunk that leans `lean` (dx, dz per metre of height),
    forks twice, grey and split, its tips bleached. No collider: its trunk stands inside the hand's breadth of wall a
    body cannot enter and is over head height where it comes out over the floor. About 170 triangles."""
    dark = mul(mix(lin("board_dark"), lin("ash_dark"), 0.4), 0.7 * tone); mid = mul(mix(lin("board"), lin("ash"), 0.5), 0.75 * tone); pale = mul(mix(lin("board_bleached"), lin("ash"), 0.3), 0.95 * tone)

    def limb(a, b, r0, r1, c0, c1, sides=5):
        ax = kit.vsub(b, a); t = kit.vnorm(ax)
        s_ = kit.vcross(t, (0.0, 1.0, 0.0))
        if kit.vlen(s_) < 1e-3: s_ = (1.0, 0.0, 0.0)
        s_ = kit.vnorm(s_); f = kit.vnorm(kit.vcross(s_, t))
        ra = []; rb = []
        for k in range(sides):
            an = 2 * math.pi * k / sides
            d = kit.vadd(kit.vscale(s_, math.cos(an)), kit.vscale(f, math.sin(an)))
            ra.append(part.vert(kit.vadd(a, kit.vscale(d, r0)))); rb.append(part.vert(kit.vadd(b, kit.vscale(d, r1))))
        for k in range(sides):
            j = (k + 1) % sides
            sh = 0.82 + 0.3 * (k % 2)
            part.face((ra[j], ra[k], rb[k], rb[j]), "m_frontier", [row_uv(FT, "plank_a", 0.0, 0.2), row_uv(FT, "plank_a", 0.0, 0.8), row_uv(FT, "plank_a", kit.vlen(ax), 0.8), row_uv(FT, "plank_a", kit.vlen(ax), 0.2)],
                      [mul(c0, sh), mul(c0, sh), mul(c1, sh), mul(c1, sh)], final=True)
    p0 = (root[0], root[1] - 0.25, root[2])
    p1 = (root[0] + lean[0] * 0.5 * h, root[1] + 0.5 * h, root[2] + lean[1] * 0.5 * h)
    p2 = (root[0] + lean[0] * 0.95 * h + rng.uniform(-0.15, 0.15), root[1] + 0.82 * h, root[2] + lean[1] * 0.95 * h + rng.uniform(-0.15, 0.15))
    limb(p0, p1, 0.042 * h, 0.03 * h, dark, mid, 6)
    limb(p1, p2, 0.03 * h, 0.017 * h, mid, mid, 5)
    a0 = rng.uniform(0, 2 * math.pi)
    for k in range(4):
        base = p1 if k < 2 else p2
        f0 = 0.3 + 0.5 * rng.random() if k < 2 else 0.0
        o = (base[0] + (p2[0] - p1[0]) * f0 * (k < 2), base[1] + (p2[1] - p1[1]) * f0 * (k < 2), base[2] + (p2[2] - p1[2]) * f0 * (k < 2))
        an = a0 + k * 1.7 + rng.uniform(-0.4, 0.4)
        ln = h * rng.uniform(0.3, 0.48)
        e = (o[0] + math.cos(an) * ln * 0.8 + lean[0] * ln * 0.5, o[1] + ln * rng.uniform(0.35, 0.8), o[2] + math.sin(an) * ln * 0.8 + lean[1] * ln * 0.5)
        limb(o, e, 0.017 * h, 0.008 * h, mid, pale, 4)
        for j in range(2):                                                # twigs
            an2 = an + rng.uniform(-1.0, 1.0)
            fm = rng.uniform(0.45, 1.0)
            m_ = (o[0] + (e[0] - o[0]) * fm, o[1] + (e[1] - o[1]) * fm, o[2] + (e[2] - o[2]) * fm)
            t_ = (m_[0] + math.cos(an2) * ln * 0.5, m_[1] + ln * rng.uniform(0.2, 0.55), m_[2] + math.sin(an2) * ln * 0.5)
            twig(part, m_, t_, 0.008 * h, 0.004 * h, mix(mid, pale, 0.5), pale)


def wheel(part, c, r, yaw_deg, tilt_deg, rng, sunk=0.12, spokes=10, missing=(3,), tone=1.0):
    """A cart wheel standing on its rim, turned yaw_deg about the vertical and leaning tilt_deg off it (toward its own
    +normal), sunk `sunk` into the sand: a twelve-sided felloe, an iron tyre's edge, a hub, spokes (some gone)."""
    wood = mul(lin("board_bleached"), 1.1 * tone); dark = mul(lin("board_dark"), 0.85 * tone); iron = mul(mix(lin("rust"), lin("steel_dark"), 0.5), 0.6 * tone)
    start = len(part.v)
    n = 12
    for k in range(n):
        a0 = 2 * math.pi * k / n; a1 = 2 * math.pi * (k + 1) / n
        p0 = (math.cos(a0) * r, math.sin(a0) * r, 0.0); p1 = (math.cos(a1) * r, math.sin(a1) * r, 0.0)
        kit.add_prism(part, p0, p1, 0.085, 0.1, "m_frontier", wood if k % 2 else mul(wood, 0.88), row=(FT, "plank_a"), up=(0.0, 0.0, 1.0), final=True, u_shift=k * 0.37)
        q0 = (math.cos(a0) * (r + 0.05), math.sin(a0) * (r + 0.05), 0.0); q1 = (math.cos(a1) * (r + 0.05), math.sin(a1) * (r + 0.05), 0.0)
        o = [(q0[0], q0[1], -0.04), (q0[0], q0[1], 0.04), (q1[0], q1[1], 0.04), (q1[0], q1[1], -0.04)]
        part.poly(o, "m_frontier", flat_uv("m_frontier"), iron, final=True)                 # the tyre, seen edge-on
    kit.add_prism(part, (0.0, 0.0, -0.12), (0.0, 0.0, 0.14), 0.2, 0.2, "m_frontier", dark, chamfer=0.06, caps="ab", up=(0.0, 1.0, 0.0), final=True)
    for k in range(spokes):
        if k in missing: continue
        a = 2 * math.pi * (k + 0.5) / spokes
        twig_r = 0.028
        kit.add_prism(part, (math.cos(a) * 0.09, math.sin(a) * 0.09, 0.0), (math.cos(a) * (r - 0.04), math.sin(a) * (r - 0.04), 0.0), twig_r * 2, twig_r * 1.6, "m_frontier", wood, up=(0.0, 0.0, 1.0), final=True)
    tl = math.radians(tilt_deg); yw = math.radians(yaw_deg)

    def place(p):
        x, y, z = p
        y += r                                                            # stand it on its rim
        y, z = y * math.cos(tl) - z * math.sin(tl), y * math.sin(tl) + z * math.cos(tl)       # lean about the ground line
        x, z = x * math.cos(yw) + z * math.sin(yw), -x * math.sin(yw) + z * math.cos(yw)
        return (c[0] + x, c[1] + y - sunk, c[2] + z)
    part.transform(place, start)


def cable(part, pts, r=0.045, col=None):
    col = col or lin("cable")
    for a, b in zip(pts[:-1], pts[1:]): twig(part, a, b, r, r, col)


# ---------------------------------------------------------------------------------------------------- the gully
def wash_points():
    """The dry wash: the line the last flood took down the gully, wandering either side of the trodden path and
    keeping off the walls. [(x, z)], from the first reach to the forecourt. ground_paint.py paints it; the bedrock
    plates and loose stones of build() lie along it."""
    P = path_points()
    P = [p for p in P if 9.5 < p[1] < 96.5]
    out = []; s_ = 0.0
    for i, p in enumerate(P):
        a = P[max(i - 1, 0)]; b = P[min(i + 1, len(P) - 1)]
        if i: s_ += math.hypot(p[0] - P[i - 1][0], p[1] - P[i - 1][1])
        tx, tz = b[0] - a[0], b[1] - a[1]; l = math.hypot(tx, tz) or 1.0
        off = 2.4 * math.sin(s_ / 7.5 + 0.9)
        for _ in range(8):
            q = (p[0] + tz / l * off, p[1] - tx / l * off)
            if lf.F(q[0], q[1]) > 1.5 and lf.d_boulder(q[0], q[1]) > 1.2: break
            off *= 0.7
        out.append(q)
    return out


def build(S):
    runs = S.extra["lip"]["runs"]
    rng = random.Random(4117)
    sc = Part("lip_scree", Z, smooth=None)
    sl = Part("lip_slabs", Z, smooth=18)
    bu = Part("lip_scrub", Z, smooth=None)
    ow = Part("lip_litter", Z, smooth=None)
    dr = Part("lip_drifts", Z, smooth=40)
    pl = Part("lip_plates", Z, smooth=18)
    n_sc = n_sl = n_bu = n_pl = 0
    last_slab = -99.0; last_bush = -99.0
    # chunk_lip_gate (z < 30: the last reach and the forecourt) has under a thousand triangles to spare, and the
    # eye-level beds of its walls take three hundred of them: a handful of stones and one bush there, no slab
    GATE_STONES, GATE_BUSHES = 9, 1
    g_sc = g_bu = 0
    for ri, run in enumerate(runs):
        for c in run:
            if c.oh or c.z > 100.5: continue
            gate = c.z < 30.5
            # --- scree: stretches of the wall's foot, heavier under the chimneys and buttresses
            heavy = vnoise(c.u / 9.0, 2.3 + ri, 77)
            if heavy > (0.66 if gate else 0.6) and not (gate and g_sc >= GATE_STONES):
                m = scree_fan(sc, c.x, c.z, c.nx, c.nz, rng, reach=1.1 + 1.3 * (heavy - 0.5), n=2 if gate else rng.choice((2, 3)), big=0.5 + 0.5 * (heavy - 0.5))
                n_sc += m; g_sc += m if gate else 0
            # --- a slab on edge against the wall, every 16 m or so
            if not gate and c.u - last_slab > 15.0 and vnoise(c.u / 5.0, 5.5 + ri, 78) > 0.52 and lf.F(c.x + c.nx * 0.9, c.z + c.nz * 0.9) > 0.6 \
                    and not keep_clear(c.x + c.nx * 0.5, c.z + c.nz * 0.5, 2.2) and nav_dist(c.x + c.nx * 0.6, c.z + c.nz * 0.6) > 2.0:
                f0, v0 = len(sl.f), len(sl.v)
                leaning_slab(sl, c.x, c.z, c.nx, c.nz, rng, L=rng.uniform(1.6, 2.6), H=rng.uniform(1.05, 1.6), T=rng.uniform(0.28, 0.4), seed=900 + n_sl)
                guard(sl, f0, v0)
                n_sc += scree_fan(sc, c.x, c.z, c.nx, c.nz, rng, reach=1.5, n=3, big=0.5)
                n_sl += 1; last_slab = c.u
            # --- dead scrub in the lee of the wall
            if c.u - last_bush > (17.0 if not gate else 12.0) and vnoise(c.u / 4.0, 7.7 + ri, 79) > 0.5 and not (gate and g_bu >= GATE_BUSHES):
                t = rng.uniform(0.5, 1.1)
                bx = c.x + c.nx * t; bz = c.z + c.nz * t
                if lf.F(bx, bz) > 0.3 and not keep_clear(bx, bz, 1.6) and nav_dist(bx, bz) > 1.6 and min(abs(bz - 30.0), abs(bz - 54.0)) > 1.3:      # (a twig cut by a chunk plane leaves a sliver)
                    f0, v0 = len(bu.f), len(bu.v)
                    bush(bu, (bx, lf.ground(bx, bz), bz), rng.uniform(0.8, 1.2), rng)
                    guard(bu, f0, v0)
                    n_bu += 1; last_bush = c.u; g_bu += 1 if gate else 0
    # --- three dead trees standing out of the walls' feet, where the walk down the gully sees them against the haze
    # (each tree is forced whole into the chunk it stands in: left to the chunk rule its crown, over 3 m, went to the
    # skyline chunk chunk_lip_rock, which has no triangles to spare)
    trees = []
    for k, (x, z, hh) in enumerate(((7.4, 88.5, 4.4), (27.6, 63.0, 5.0), (20.8, 38.5, 4.2), (5.0, 46.8, 3.8))):
        site = _wall_site(runs, x, z)
        if site is None: continue
        wx, wz, nx, nz = site
        if min(abs(wz - 54.0), abs(wz - 30.0)) < 3.2 or nav_dist(wx, wz) < 0.95: continue      # its crown would leave its chunk's box; its trunk would stand on a nav link
        tr = Part("lip_tree%d" % k, Z, chunk="chunk_lip_upper" if wz >= 54.0 else "chunk_lip_mid", smooth=None)
        tree(tr, (wx + nx * 0.02, lf.ground(wx + nx * 0.3, wz + nz * 0.3), wz + nz * 0.02), (nx * 0.16 - nz * 0.08, nz * 0.16 + nx * 0.08), hh, rng)
        trees.append(tr)
    # --- the dry wash: bedrock showing through the floor along it, and the stones the last flood left
    W_ = wash_points()
    acc = 0.0; nxt = 3.0; side = 1.0
    for i in range(1, len(W_)):
        a, b = W_[i - 1], W_[i]
        l = math.hypot(b[0] - a[0], b[1] - a[1]); 
        if l < 1e-6: continue
        while acc + l > nxt:
            f = (nxt - acc) / l
            tx, tz = (b[0] - a[0]) / l, (b[1] - a[1]) / l
            ok = False
            for o in (side * 1.3, -side * 1.3, side * 2.1, -side * 2.1, side * 0.5, side * 3.0, -side * 3.0):
                x = a[0] + (b[0] - a[0]) * f + tz * o; z = a[1] + (b[1] - a[1]) * f - tx * o
                if lf.F(x, z) > 1.0 and lf.d_boulder(x, z) > 0.9 and not keep_clear(x, z, 1.8) and path_dist(x, z) > 0.7 and min(abs(z - 30.0), abs(z - 54.0)) > 1.6: ok = True; break
            gate = z < 30.5
            nxt += rng.uniform(6.0, 8.5) if not gate else rng.uniform(8.5, 11.0); side = -side
            if not ok: continue
            f0, v0 = len(pl.f), len(pl.v)
            plate(pl, (x, z), (rng.uniform(1.5, 2.6), rng.uniform(1.0, 1.7)), math.degrees(math.atan2(-tz, tx)) + rng.uniform(-25, 25), 700 + n_pl, h=rng.uniform(0.16, 0.3))
            n_pl += 1 if guard(pl, f0, v0) else 0
            for _ in range(1 if gate else 2):
                sx = x + rng.uniform(-1.6, 1.6); sz = z + rng.uniform(-1.6, 1.6)
                if lf.F(sx, sz) > 0.6 and nav_dist(sx, sz) > 0.6 and not keep_clear(sx, sz):
                    f0, v0 = len(sc.f), len(sc.v)
                    rock.rock_chunk(sc, (sx, lf.ground(sx, sz) + 0.01, sz), rng.uniform(0.1, 0.2), seed=rng.randrange(10 ** 6), dark=0.2, flat=0.8); n_sc += 1
                    guard(sc, f0, v0)
        acc += l
    # --- low drifts where the floor is widest (the toe of each takes the ground's own colour)
    import lip_parts
    for k, (x, z, L, W, h, brg) in enumerate(((10.2, 49.6, 4.4, 2.3, 0.3, 145.0),
                                             (16.4, 43.4, 4.6, 2.4, 0.32, 160.0))):
        if path_dist(x, z) < 0.6 or lf.F(x, z) < 1.6: continue
        drift(dr, (x, z), L, W, h, brg, "lip_dr%d" % k, seed=500 + k, ground_col=lip_parts.sand_colour)
    # --- the forecourt (chunk_lip_gate): bedrock at the east rock's foot and by the pylon, scrub against the north wall
    for k, (x, z, sx, sz, rot_, hh) in enumerate(((20.4, 2.6, 2.4, 1.5, 20.0, 0.28), (18.9, -4.4, 1.9, 1.3, -35.0, 0.22), (8.2, 9.7, 2.0, 1.2, 60.0, 0.2))):
        plate(pl, (x, z), (sx, sz), rot_, 760 + k, h=hh); n_pl += 1
    for (x, z, hh) in ((13.2, -6.45, 1.0), (21.6, 5.9, 0.9)):
        if nav_dist(x, z) > 1.6: bush(bu, (x, lf.ground(x, z), z), hh, rng); n_bu += 1
    # --- the third reach (chunk_lip_mid has triangles): more of the wash's stones, two more bushes
    for (x, z, hh) in ((19.6, 49.6, 1.0), (6.6, 33.6, 0.9)):
        if lf.F(x, z) > 0.3 and nav_dist(x, z) > 1.6: bush(bu, (x, lf.ground(x, z), z), hh, rng); n_bu += 1
    # --- the Old World's litter: a cross-arm off a line pylon that stood on the rim, come down into the second reach
    # with its insulators and a length of its cable; it lies against the east wall's foot
    rust = mix(lin("rust"), lin("steel_dark"), 0.45); enamel = lin("enamel"); stain = lin("enamel_stain")
    site = _wall_site(runs, 24.0, 69.0)
    print(f"DRESS lip: the cross-arm lies at {site}")
    if site is not None:
        x, z, nx, nz = site
        tx, tz = -nz, nx
        a = (x + nx * 0.75 - tx * 1.7, lf.ground(x + nx * 0.75 - tx * 1.7, z + nz * 0.75 - tz * 1.7) - 0.16, z + nz * 0.75 - tz * 1.7)
        b = (x + nx * 1.15 + tx * 1.5, lf.ground(x + nx * 1.15 + tx * 1.5, z + nz * 1.15 + tz * 1.5) + 0.7, z + nz * 1.15 + tz * 1.5)
        kit.add_prism(ow, a, b, 0.4, 0.4, "m_frontier", mix(enamel, stain, 0.45), chamfer=0.07, caps="b", taper=0.12, segs=2, final=True)      # ceramic-clad, as the mast at the gate is
        kit.add_prism(ow, kit.vadd(a, kit.vscale(kit.vsub(b, a), 0.42)), kit.vadd(a, kit.vscale(kit.vsub(b, a), 0.5)), 0.43, 0.43, "m_frontier", lin("livery"), chamfer=0.075, final=True)
        d = kit.vnorm(kit.vsub(b, a))
        e = kit.vadd(b, kit.vscale(d, -0.3))
        for k in range(3):
            kit.add_cyl(ow, (e[0], e[1] - 0.52 + k * 0.15, e[2]), 0.19 - 0.02 * k, 0.1, "m_frontier", mix(enamel, stain, 0.35), segs=6, r_top=0.11 - 0.01 * k, cap_top=True, cap_bottom=True,
                        uv=flat_uv("m_frontier"), final=True)
        kit.add_cyl(ow, (e[0], e[1] - 0.6, e[2]), 0.06, 0.6, "m_frontier", mul(lin("steel"), 0.7), segs=6, uv=flat_uv("m_frontier"), final=True)
        pts = []
        for k in range(8):
            f = k / 7.0
            px = e[0] + nx * (0.2 + 0.75 * math.sin(f * 2.6)) + tx * 2.6 * f; pz = e[2] + nz * (0.2 + 0.75 * math.sin(f * 2.6)) + tz * 2.6 * f
            pts.append((px, (e[1] - 0.6) * (1 - f) ** 2 + (lf.ground(px, pz) + 0.035) * (1 - (1 - f) ** 2), pz))
        cable(ow, pts)
        scree_fan(sc, x, z, nx, nz, rng, reach=1.6, n=5, big=0.42)
    # two cladding panels off the pylon, half under the sand of the last reach
    for k, (px, pz, rot, tilt) in enumerate(((19.4, 26.4, 25.0, 0.34), (20.6, 24.9, -40.0, 0.2))):
        if lf.F(px, pz) < 0.4: continue
        n0 = len(ow.v)
        kit.add_box(ow, (0.0, 0.0, 0.0), (1.2, 0.06, 1.2), "m_frontier", mix(enamel, stain, 0.5 + 0.2 * k), sides="nsewt", uv=flat_uv("m_frontier"), final=True)
        cr = math.cos(math.radians(rot)); sr = math.sin(math.radians(rot)); gy = lf.ground(px, pz)
        ow.transform(lambda q: (px + q[0] * cr + q[2] * sr, gy + 0.04 + (q[0] + 0.6) * tilt + q[1], pz - q[0] * sr + q[2] * cr), n0)
    # --- the cart that did not make it up: one wheel against the west wall of the third reach, its mate flat in the
    # sand, the axle and a shaft; the ruts it left run down to the gate (painted into the lightmap: ground_paint.py)
    site = _wall_site(runs, 5.4, 41.0)
    S.extra["lip"]["cart_site"] = site
    print(f"DRESS lip: the cart stands at {site}")
    if site is not None:
        x, z, nx, nz = site
        tx, tz = -nz, nx
        yaw = math.degrees(math.atan2(-tz, tx))
        wx_ = x + nx * 0.7; wz_ = z + nz * 0.7                               # (the wall's first bed stands a span proud at hub height: at 0.34 m the wheel was in the rock)
        wheel(ow, (wx_, lf.ground(wx_, wz_), wz_), 0.62, yaw, 24.0, rng, sunk=0.12, missing=(2, 7))
        fx = x + nx * 1.5 + tx * 1.5; fz = z + nz * 1.5 + tz * 1.5
        wheel(ow, (fx, lf.ground(fx, fz) + 0.03, fz), 0.62, yaw + 30.0, 84.0, rng, sunk=0.04, missing=(0, 1, 5, 6), tone=0.9)      # lying flat, half drifted over
        ax0 = (wx_ + nx * 0.1, lf.ground(wx_, wz_) + 0.5, wz_ + nz * 0.1); ax1 = (x + nx * 1.5 + tx * 0.5, lf.ground(x + nx * 1.5, z + nz * 1.5) + 0.06, z + nz * 1.5 + tz * 0.5)
        kit.add_prism(ow, ax0, ax1, 0.11, 0.11, "m_frontier", mul(lin("board_dark"), 0.8), chamfer=0.02, caps="b", row=(FT, "plank_a"), final=True)
        for k, (o_t, o_n, ln, rot_) in enumerate(((-1.4, 0.9, 2.4, 12.0), (-0.9, 1.25, 1.6, -20.0), (0.4, 0.75, 1.1, 48.0))):      # boards of its bed
            cx_ = x + nx * o_n + tx * o_t; cz_ = z + nz * o_n + tz * o_t
            kit.add_box(ow, (cx_, lf.ground(cx_, cz_) + 0.035, cz_), (ln, 0.045, 0.2), "m_frontier", mul(lin("board_bleached"), rng.uniform(0.75, 1.0)), rot=yaw + rot_, sides="nsewt",
                        row=(FT, "plank_a", "x"), u_shift=rng.uniform(0, 3), final=True)
        bush(bu, (x + nx * 0.7 - tx * 1.9, lf.ground(x + nx * 0.7 - tx * 1.9, z + nz * 0.7 - tz * 1.9), z + nz * 0.7 - tz * 1.9), 0.8, rng)
    # --- pass i2 (the visual reviewer: "the lip gate court is a wide flat floor with plain walls and one pylon ... nothing
    # in the mid-ground"; chunk_lip_gate has 130 triangles to spare): what is left of the stock fence that ran from the
    # north wall to the gully's mouth along the east rock's foot, the side of the court nobody crosses: six posts out of true, a rail still up
    # between two of them, one hanging by an end, one on the sand. No collider (as the scrub: a post is a hand wide and
    # stands off every nav link: guard()).
    fn = Part("lip_fence", Z, chunk="chunk_lip_gate", smooth=None)
    frng = random.Random(8831)
    fa, fb = (21.12, -4.7), (21.02, 5.3)                               # the one strip of the court no nav link crosses: along the east rock's foot
    tops = []
    for k in range(6):
        f = k / 5.0
        x = fa[0] + (fb[0] - fa[0]) * f + frng.uniform(-0.06, 0.06); z = fa[1] + (fb[1] - fa[1]) * f + frng.uniform(-0.15, 0.15)
        hh = (1.05, 1.15, 0.55, 1.1, 0.95, 1.2)[k]
        lx, lz = frng.uniform(-0.05, 0.1), frng.uniform(-0.16, 0.16)
        gy = lf.ground(x, z)
        f0, v0 = len(fn.f), len(fn.v)
        top = (x + lx, gy + hh, z + lz)
        kit.add_prism(fn, (x, gy - 0.12, z), top, 0.11, 0.1, "m_frontier", mul(lin("board_bleached" if k % 3 else "board"), frng.uniform(0.72, 0.95)), caps="b", taper=0.12, row=(FT, "plank_a"),
                      u_shift=frng.uniform(0, 3), final=True)
        tops.append(top if guard(fn, f0, v0) else None)
    def rail(a_, b_, col):
        if a_ is None or b_ is None: return
        kit.add_prism(fn, a_, b_, 0.035, 0.11, "m_frontier", col, row=(FT, "plank_b"), u_shift=frng.uniform(0, 3), final=True)
    dn = lambda q, d: None if q is None else (q[0], q[1] - d, q[2])
    rail(dn(tops[0], 0.22), dn(tops[1], 0.3), mul(lin("board_bleached"), 0.85))                                   # still up
    if tops[3] is not None and tops[4] is not None:
        g4 = (tops[4][0] + 0.1, lf.ground(tops[4][0] + 0.1, tops[4][2] - 0.2) + 0.04, tops[4][2] - 0.2)
        rail(dn(tops[3], 0.28), g4, mul(lin("board"), 0.8))                                                      # hanging by one end
    if tops[1] is not None and tops[2] is not None:
        la = (tops[1][0] - 0.35, lf.ground(tops[1][0] - 0.35, tops[1][2] + 0.3) + 0.035, tops[1][2] + 0.3); lb = (tops[2][0] - 0.2, lf.ground(tops[2][0] - 0.2, tops[2][2] - 0.2) + 0.035, tops[2][2] - 0.2)
        rail(la, lb, mul(lin("board_bleached"), 0.75))                                                           # on the sand
    # --- the Old World under the gully: a length of ceramic main the floods have uncovered, crossing the third reach from
    # wall to wall, a hand proud of the sand in the middle and under it at both ends (nothing here stands over 0.3 m: no
    # collider, as the bedrock plates), its livery collar at the one joint in sight
    pp = Part("lip_main", Z, chunk="chunk_lip_mid", smooth=30)
    P_ = path_points()
    i0 = min(range(1, len(P_) - 1), key=lambda i: abs(P_[i][1] - 37.6))
    c0 = P_[i0]; tx, tz = P_[i0 + 1][0] - P_[i0 - 1][0], P_[i0 + 1][1] - P_[i0 - 1][1]; tl = math.hypot(tx, tz) or 1.0; tx, tz = tx / tl, tz / tl
    ang = math.radians(24.0); ca, sa = math.cos(ang), math.sin(ang)
    nx_, nz_ = tz * ca + tx * sa, -tx * ca + tz * sa                                                           # across the path, 24 degrees off square
    def reach(sgn):
        d = 0.5
        while d < 9.0 and lf.F(c0[0] + nx_ * sgn * d, c0[1] + nz_ * sgn * d) > 0.15: d += 0.25
        return d + 0.5
    ra_, rb_ = reach(-1.0), reach(1.0)
    NP = 7; line = []
    for k in range(NP + 1):
        f = k / NP; o = -ra_ + (ra_ + rb_) * f
        x = c0[0] + nx_ * o; z = c0[1] + nz_ * o
        proud = 0.10 * math.sin(math.pi * f) ** 0.6 - 0.16 - 0.34 * max(0.0, abs(f - 0.5) * 2 - 0.72) / 0.28
        # (its crown stands 0.12 m over the floor a body walks, which may lie a hand under the drawn sand: the nav-link rule)
        line.append((x, min(lf.ground(x, z), kit.path_ground("lip", x, z)) + proud, z))
    enamel_m = mix(enamel, stain, 0.55)
    for k in range(NP):
        kit.add_prism(pp, line[k], line[k + 1], 0.36, 0.36, "m_frontier", mul(enamel_m, 0.9 + 0.1 * (k % 2)), chamfer=0.105, final=True)
    jm = 3
    jd = kit.vnorm(kit.vsub(line[jm + 1], line[jm]))
    kit.add_prism(pp, kit.vadd(line[jm], kit.vscale(jd, -0.11)), kit.vadd(line[jm], kit.vscale(jd, 0.11)), 0.44, 0.44, "m_frontier", lin("livery"), chamfer=0.13, final=True)
    print(f"DRESS lip (pass i2): fence {fn.tris()} triangles ({sum(1 for t_ in tops if t_ is not None)} posts), main {pp.tris()} triangles from {line[0]} to {line[-1]}")
    parts = [sc, sl, bu, ow, dr, pl, fn, pp] + trees + build_i3(S, runs)
    by = {}
    for p in parts:
        for f in p.f:
            pts = [p.v[i] for i in f[0]]
            ch = kit.chunk_of(Z, pts, "m_sand")
            by[ch] = by.get(ch, 0) + len(f[0]) - 2
    print(f"DRESS lip: {n_sc} stones, {n_sl} slabs, {n_bu} bushes, {n_pl} plates, {sum(t.tris() for t in trees)} tree triangles; triangles by chunk {by}; total {sum(p.tris() for p in parts)}")
    return parts



# ---------------------------------------------------------------------------------------------------- pass i3
# Both visual reviewers of pass i3: "the walk down the gully is the plainest stretch of the stage, and it comes in the
# first minute: a wall left, a wall right and empty floor; nothing draws the eye but the far pole". Ruling R14 moved
# triangles here (chunk_lip_upper + 1 500, chunk_lip_mid + 2 000, chunk_lip_gate + 1 500). What follows has its OWN
# random stream, so nothing of passes i1 / i2 above moves. A beat every 10 to 15 m of the walk:
#   z 87  the mule that did not make the climb: ribs, spine and skull half under the sand, in a shaft of sun (SHAFTS)
#   z 72  the Old World's line still hangs from rim to rim: a sagging cable, a parted strand with its insulators
#   z 64  a second shaft across the path; talus under both walls
#   z 38  the third shaft lies on the uncovered main and its livery collar
#   z 22  two line poles of the Frontier's own at the walls' feet, a third down along the east rock
#   court a shade roof that fell where it stood: posts' stumps, beams, the roof's poles fanned over the sand
# The rules of the passes before hold: nothing here has a collider; on the open floor nothing stands over 0.3 m;
# at a wall's foot nothing stands further out than a body's reach of the rock; guard() after every maker.
SHAFTS = (                                              # (where the shaft lands, where it comes from): surface_common.add_fills
    ((15.7, 87.3), (11.1, 78.6)),
    ((16.4, 64.4), (12.3, 55.9)),
    ((12.7, 38.2), (8.4, 29.3)),
)
BONE = (0.62, 0.58, 0.50)


def _arc(part, pts, r0, r1, col):
    n = len(pts) - 1
    for k in range(n):
        ra = r0 + (r1 - r0) * k / n; rb = r0 + (r1 - r0) * (k + 1) / n
        twig(part, pts[k], pts[k + 1], ra, rb, mul(col, 0.92 + 0.16 * (k % 2)))


def carcass(part, c, yaw_deg, rng, ground=None):
    """A pack mule's bones lying on their side, half under the sand: the spine, nine ribs of the upper side arching a
    hand over the floor (never over 0.3 m), the skull a little apart, a shoulder blade, two leg bones. About 330 triangles."""
    ground = ground or lf.ground
    yw = math.radians(yaw_deg); ax = (math.sin(yw), -math.cos(yw)); lat = (ax[1], -ax[0])     # along the spine (to the head), to the belly
    col = lin(BONE); old = mul(mix(lin(BONE), lin("sand"), 0.45), 0.9)

    def P(a, l, h):
        x = c[0] + ax[0] * a + lat[0] * l; z = c[1] + ax[1] * a + lat[1] * l
        return (x, ground(x, z) + h, z)
    spine = [P(-0.75 + 0.25 * k, 0.03 * math.sin(k * 0.9), 0.045 + 0.03 * math.sin(k * 0.55)) for k in range(7)]
    _arc(part, spine, 0.045, 0.035, col)
    for k in range(9):
        a = -0.5 + 0.11 * k
        R = (0.2, 0.25, 0.28, 0.29, 0.29, 0.28, 0.26, 0.23, 0.19)[k]
        if k in (3, 7): R *= 0.55                                           # two are broken short
        th1 = 2.5 if k not in (3, 7) else 1.5
        pts = []
        for j in range(4):
            th = th1 * j / 3.0
            pts.append(P(a + 0.045 * j, R * 0.85 * (1.0 - math.cos(th)) + 0.02, 0.04 + R * 0.9 * math.sin(th) * (0.82 + 0.3 * vnoise(k * 1.7, j * 0.9, 31))))
        _arc(part, pts, 0.03, 0.017, col if k % 3 else old)
    # the skull: a long wedge on its side, the jaw beside it
    h0 = P(1.02, -0.1, 0.07); h1 = P(1.5, 0.02, 0.05)
    kit.add_prism(part, h0, h1, 0.2, 0.15, "m_frontier", col, chamfer=0.05, taper=0.52, caps="ab", segs=2, final=True)
    kit.add_prism(part, P(1.08, 0.12, 0.02), P(1.46, 0.2, 0.025), 0.035, 0.09, "m_frontier", old, taper=0.5, final=True)
    kit.add_box(part, P(1.16, -0.05, 0.135), (0.07, 0.035, 0.06), "m_frontier", mul(lin("ash_dark"), 0.8), rot=yaw_deg, sides="nsewt", uv=flat_uv("m_frontier"), final=True)   # the orbit
    # shoulder blade and legs
    kit.add_prism(part, P(0.55, 0.3, 0.03), P(0.8, 0.6, 0.035), 0.13, 0.03, "m_frontier", old, taper=0.7, final=True)
    _arc(part, [P(0.8, 0.62, 0.035), P(1.0, 1.02, 0.03), P(0.86, 1.36, 0.02)], 0.03, 0.022, col)
    _arc(part, [P(-0.7, 0.2, 0.04), P(-0.95, 0.7, 0.03), P(-0.72, 1.12, 0.02)], 0.032, 0.022, old)
    kit.add_prism(part, P(-0.86, -0.05, 0.05), P(-0.62, 0.22, 0.07), 0.26, 0.1, "m_frontier", old, chamfer=0.03, taper=0.3, caps="ab", final=True)      # the pelvis


def sawbuck(part, c, yaw_deg, rng, ground=None):
    """The mule's pack saddle: two crossed pairs of boards and the bars between them, on its side in the sand."""
    ground = ground or lf.ground
    yw = math.radians(yaw_deg); ax = (math.sin(yw), -math.cos(yw)); lat = (ax[1], -ax[0])
    wood = mul(lin("board_bleached"), 0.9); dark = mul(lin("board_dark"), 0.9)

    def P(a, l, h):
        x = c[0] + ax[0] * a + lat[0] * l; z = c[1] + ax[1] * a + lat[1] * l
        return (x, ground(x, z) + h, z)
    for a in (-0.28, 0.28):
        kit.add_prism(part, P(a, -0.3, 0.03), P(a + 0.04, 0.3, 0.24), 0.07, 0.035, "m_frontier", wood, row=(FT, "plank_a"), u_shift=rng.uniform(0, 3), final=True)
        kit.add_prism(part, P(a, 0.3, 0.03), P(a + 0.04, -0.26, 0.2), 0.07, 0.035, "m_frontier", mul(wood, 0.85), row=(FT, "plank_a"), u_shift=rng.uniform(0, 3), final=True)
    for (l, h) in ((-0.2, 0.06), (0.2, 0.07)):
        kit.add_prism(part, P(-0.36, l, h), P(0.38, l + 0.03, h + 0.02), 0.03, 0.12, "m_frontier", dark, row=(FT, "plank_b"), u_shift=rng.uniform(0, 3), final=True)
    cable(part, [P(0.3, 0.3, 0.05), P(0.55, 0.62, 0.025), P(0.42, 1.0, 0.02), P(0.7, 1.3, 0.015)], r=0.018, col=mul(lin("leather"), 0.7))     # a cinch strap


def talus(part, site, rng, n=6, big=0.7, reach=1.25, dark=0.14):
    """A pile of fallen stone at a wall's foot: the large pieces within a body's reach of the rock (their tops under
    1.1 m), smaller ones tumbled out from them. Returns how many were kept."""
    x, z, nx, nz = site
    tx, tz = -nz, nx
    made = 0
    for k in range(n):
        f = k / max(n - 1, 1)
        t = 0.25 + reach * f ** 1.3 * rng.uniform(0.7, 1.1)
        s_ = rng.uniform(-1.5, 1.5) * (0.35 + 0.65 * f)
        px = x + nx * t + tx * s_; pz = z + nz * t + tz * s_
        if lf.F(px, pz) < 0.02 or keep_clear(px, pz) or path_dist(px, pz) < 1.3: continue
        r = big * (1.0 - 0.62 * f) * rng.uniform(0.8, 1.15)
        if nav_dist(px, pz) < 0.6 + 1.2 * r: r = min(r, 0.26)
        f0, v0 = len(part.f), len(part.v)
        rock.rock_chunk(part, (px, lf.ground(px, pz) + 0.02, pz), r, seed=rng.randrange(10 ** 6), dark=dark + 0.16 * rng.random(), flat=rng.uniform(0.7, 1.25))
        rock.retint(part, f0, mul(lin("rock_dark"), 0.9), 0.5)            # the wall's own lower beds, not the pale cap rock (pale, they read as lit shards in the shade)
        made += 1 if guard(part, f0, v0) else 0
    return made


def fallen_block(part, site, rng, size, seed):
    """A block of the wall's own beds lying where it came down, hard against the wall's foot (no collider: it stands
    within a body's reach of the rock, its top under 1.2 m)."""
    x, z, nx, nz = site
    tx, tz = -nz, nx
    cx = x + nx * (size[2] * 0.5 + 0.05); cz = z + nz * (size[2] * 0.5 + 0.05)
    if lf.F(cx, cz) < 0.05 or keep_clear(cx, cz, 2.0) or nav_dist(cx, cz) < 0.75 + size[2] * 0.5: return False
    f0, v0 = len(part.f), len(part.v)
    gy = lf.ground(cx, cz)
    rock.bedded_block(part, (cx, gy + size[1] / 2 - 0.15, cz), size, rot=math.degrees(math.atan2(-tz, tx)) + rng.uniform(-14, 14), seed=seed, beds=2, ground=lf.ground, grow=0.0, n=2, dark=0.1,
                      top_slope=0.2, dip=0.12, bulge=0.08)
    return guard(part, f0, v0)


def line_pole(part, foot, lean, h, yaw_deg, rng, arm=1.5, wire_to=None):
    """A line pole of the Frontier's own: a split grey trunk a hand and a half thick, a cross-arm with two glass
    insulators, leaning. It stands in the wall's foot like the dead trees (no collider)."""
    wood = mul(mix(lin("board"), lin("ash"), 0.45), 0.8); dark = mul(lin("board_dark"), 0.8); glass = mul(lin("town_paint"), 0.85)
    top = (foot[0] + lean[0] * h, foot[1] + h, foot[2] + lean[1] * h)
    kit.add_prism(part, (foot[0], foot[1] - 0.3, foot[2]), top, 0.2, 0.19, "m_frontier", wood, row=(FT, "plank_a"), chamfer=0.045, taper=0.3, caps="b", segs=3, u_shift=rng.uniform(0, 3), final=True)
    yw = math.radians(yaw_deg); dx, dz = math.cos(yw), math.sin(yw)
    ay = foot[1] + h * 0.9; axx = foot[0] + lean[0] * h * 0.9; azz = foot[2] + lean[1] * h * 0.9
    sag = rng.uniform(-0.12, 0.12)
    a = (axx - dx * arm / 2, ay - sag, azz - dz * arm / 2); b = (axx + dx * arm / 2, ay + sag, azz + dz * arm / 2)
    kit.add_prism(part, a, b, 0.09, 0.11, "m_frontier", dark, row=(FT, "plank_b"), caps="ab", u_shift=rng.uniform(0, 3), final=True)
    kit.add_prism(part, (axx, ay - 0.55, azz), (axx + dx * arm * 0.36, ay - 0.04, azz + dz * arm * 0.36), 0.04, 0.05, "m_frontier", dark, final=True)       # the brace
    ends = []
    for q in (a, b):
        e = (q[0] + (axx - q[0]) * 0.12, q[1] + 0.05, q[2] + (azz - q[2]) * 0.12)
        kit.add_cyl(part, e, 0.05, 0.13, "m_frontier", glass, segs=5, r_top=0.03, cap_top=True, uv=flat_uv("m_frontier"), final=True)
        ends.append((e[0], e[1] + 0.1, e[2]))
    if wire_to is not None:                                               # a parted wire hangs from one insulator to the sand
        pts = []
        for k in range(6):
            f = k / 5.0
            pts.append((ends[0][0] + (wire_to[0] - ends[0][0]) * f, ends[0][1] + (wire_to[1] - ends[0][1]) * (1 - (1 - f) ** 2.2), ends[0][2] + (wire_to[2] - ends[0][2]) * f))
        cable(part, pts, r=0.022)
    return ends


def build_i3(S, runs):
    rng = random.Random(90731)
    up = Part("lip_i3_upper", Z, chunk="chunk_lip_upper", smooth=None)
    md = Part("lip_i3_mid", Z, chunk="chunk_lip_mid", smooth=None)
    gt = Part("lip_i3_gate", Z, chunk="chunk_lip_gate", smooth=None)
    ub = Part("lip_i3_upper_blocks", Z, chunk="chunk_lip_upper", smooth=18)
    mb = Part("lip_i3_mid_blocks", Z, chunk="chunk_lip_mid", smooth=18)
    gb = Part("lip_i3_gate_blocks", Z, chunk="chunk_lip_gate", smooth=18)
    bones = Part("lip_i3_bones", Z, chunk="chunk_lip_upper", smooth=40)

    def part_at(z, blocks=False):
        if z >= 54.0: return ub if blocks else up
        if z >= 30.0: return mb if blocks else md
        return gb if blocks else gt
    # --- the mule (first reach), in the first shaft
    (sx, sz), _ = SHAFTS[0]
    carcass(bones, (sx + 0.15, sz + 0.1), 205.0, rng)
    sawbuck(up, (sx + 1.5, sz - 1.25), 70.0, rng)
    n_t = 0; n_b = 0
    # --- talus and fallen blocks under the walls: (near x, z, stones, biggest, a block's size or None)
    for (x, z, n, big, blk) in ((7.2, 91.0, 4, 0.62, None), (20.8, 90.6, 5, 0.6, (1.9, 1.0, 0.8)), (7.4, 82.5, 6, 0.7, (1.6, 0.9, 0.7)), 
                                (10.4, 71.5, 7, 0.75, (2.1, 1.1, 0.8)), (27.6, 74.0, 6, 0.7, None), (10.3, 62.5, 6, 0.65, None), (27.7, 58.5, 6, 0.7, (1.8, 1.0, 0.75)),
                                (21.2, 50.0, 6, 0.7, (2.0, 1.05, 0.8)), (5.3, 51.0, 6, 0.65, None), (21.2, 44.5, 5, 0.6, None), (21.3, 36.0, 7, 0.75, (1.7, 0.95, 0.7)), (5.2, 33.2, 6, 0.65, None),
                                (2.4, 24.5, 6, 0.65, (1.8, 1.0, 0.75)), (21.6, 18.5, 6, 0.7, None), (2.4, 13.5, 5, 0.6, None), (21.6, 11.5, 5, 0.6, (1.5, 0.85, 0.7))):
        site = _wall_site(runs, x, z, far=4.5)
        if site is None or min(abs(site[1] - 54.0), abs(site[1] - 30.0)) < 2.4: continue
        if blk is not None and fallen_block(part_at(site[1], True), site, rng, blk, 4000 + n_b): n_b += 1
        n_t += talus(part_at(site[1]), site, rng, n=n, big=big)
    # --- the third reach: a fall off the east wall that ran out over the floor, and scrub in the lee of both walls
    site = _wall_site(runs, 21.2, 40.6, far=4.5)
    if site is not None:
        fallen_block(mb, site, rng, (2.2, 1.1, 0.85), 4100)
        n_t += talus(md, site, rng, n=14, big=0.8, reach=4.2)
    site = _wall_site(runs, 5.3, 46.0, far=4.5)
    if site is not None: n_t += talus(md, site, rng, n=8, big=0.7, reach=2.4)
    for (x, z, hh) in ((20.7, 46.4, 1.1), (20.9, 33.4, 0.95), (5.6, 36.4, 1.0)):
        st_ = _wall_site(runs, x, z, far=3.0)
        if st_ is None: continue
        bx, bz = st_[0] + st_[2] * 0.7, st_[1] + st_[3] * 0.7
        if lf.F(bx, bz) > 0.3 and not keep_clear(bx, bz, 1.6) and nav_dist(bx, bz) > 1.6 and min(abs(bz - 30.0), abs(bz - 54.0)) > 1.3:
            f0, v0 = len(md.f), len(md.v)
            bush(md, (bx, lf.ground(bx, bz), bz), hh, rng)
            guard(md, f0, v0)
    # --- the Old World's line across the second reach: from the west rim to the east, one strand parted
    wa = _wall_site(runs, 10.2, 72.6); wb = _wall_site(runs, 27.8, 70.4)
    if wa is not None and wb is not None:
        ya = min(lf.top_at(wa[0] - wa[2] * 0.8, wa[1] - wa[3] * 0.8), lf.ground(wa[0], wa[1]) + 13.0); yb = min(lf.top_at(wb[0] - wb[2] * 0.8, wb[1] - wb[3] * 0.8), lf.ground(wb[0], wb[1]) + 12.0)
        A = (wa[0] - wa[2] * 0.3, ya - 0.4, wa[1] - wa[3] * 0.3); B = (wb[0] - wb[2] * 0.3, yb - 0.4, wb[1] - wb[3] * 0.3)
        mid_g = lf.ground((A[0] + B[0]) / 2, (A[2] + B[2]) / 2)
        sag = max(1.1, min(A[1], B[1]) - (mid_g + 6.2))
        pts = [(A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f - sag * 4 * f * (1 - f), A[2] + (B[2] - A[2]) * f) for f in [k / 15.0 for k in range(16)]]
        cable(up, pts, r=0.032)
        # the parted strand: from the west anchor out to a third of the span, then straight down, its insulator string at the end
        q0 = pts[5]; end_y = lf.ground(q0[0], q0[2]) + 2.35
        drop = q0[1] - 0.25 - end_y
        # the second conductor: it runs under the first to a third of the span, where it parted, and hangs from the spacer there
        strand = [(pts[k][0], pts[k][1] - 0.3 - 0.12 * math.sin(math.pi * k / 5.0), pts[k][2] + 0.1) for k in range(6)]
        strand += [(q0[0] + 0.05 * math.sin(j * 1.3), q0[1] - 0.25 - drop * (j / 5.0) ** 0.9, q0[2] + 0.1 + 0.03 * j) for j in range(1, 6)]
        cable(up, strand, r=0.028)
        e = strand[-1]
        enamel = lin("enamel"); stain = lin("enamel_stain")
        for k in range(3):
            kit.add_cyl(up, (e[0], e[1] - 0.14 - k * 0.15, e[2]), 0.11 + 0.02 * k, 0.1, "m_frontier", mix(enamel, stain, 0.3 + 0.2 * k), segs=6, r_top=0.06 + 0.02 * k, cap_top=True, cap_bottom=True, uv=flat_uv("m_frontier"), final=True)
        print(f"DRESS lip (pass i3): the line hangs from {A} to {B}, sag {sag:.2f}; its strand ends at {e}")
    # --- the last reach: the Frontier's own line poles at the walls' feet, one down
    for k, (x, z, hh, yaw, wire) in enumerate(((2.3, 21.0, 5.6, 78.0, True), (21.7, 15.5, 5.0, 96.0, False))):
        site = _wall_site(runs, x, z, far=4.5)
        if site is None or nav_dist(site[0], site[1]) < 0.95: continue
        wx, wz, nx, nz = site
        foot = (wx + nx * 0.06, lf.ground(wx + nx * 0.3, wz + nz * 0.3), wz + nz * 0.06)
        to = None
        if wire:
            tx_, tz_ = wx + nx * 0.9, wz + nz * 0.9 - 2.2
            to = (tx_, lf.ground(tx_, tz_) + 0.03, tz_)
        line_pole(gt, foot, (nx * 0.07 + (0.05 if k else -0.04), nz * 0.07 + 0.05), hh, yaw, rng, wire_to=to)
    # bedrock through the sand of the last reach, either side of the ruts (under 0.3 m: bodies cross them), and scrub at the east wall
    for k, (x, z, sx_, sz_, rot_, hh) in enumerate(((13.6, 24.2, 2.3, 1.4, 35.0, 0.24), (5.9, 19.6, 1.9, 1.3, -20.0, 0.2), (14.3, 15.4, 2.5, 1.5, 70.0, 0.26), (5.6, 12.4, 1.7, 1.2, 15.0, 0.2))):
        if lf.F(x, z) < 1.0 or keep_clear(x, z, 1.8) or path_dist(x, z) < 0.9: continue
        f0, v0 = len(gb.f), len(gb.v)
        plate(gb, (x, z), (sx_, sz_), rot_, 4300 + k, h=hh)
        guard(gb, f0, v0)
    st_ = _wall_site(runs, 21.6, 21.4, far=3.0)
    if st_ is not None:
        bx, bz = st_[0] + st_[2] * 0.7, st_[1] + st_[3] * 0.7
        if lf.F(bx, bz) > 0.3 and nav_dist(bx, bz) > 1.6:
            f0, v0 = len(gt.f), len(gt.v)
            bush(gt, (bx, lf.ground(bx, bz), bz), 1.0, rng)
            guard(gt, f0, v0)
    site = _wall_site(runs, 21.7, 24.0, far=4.5)
    if site is not None:                                                  # the third pole lies along the east wall's foot, its arm in the sand
        wx, wz, nx, nz = site
        a = (wx + nx * 0.55, lf.ground(wx + nx * 0.55, wz + 2.2) + 0.1, wz + 2.2); b = (wx + nx * 0.8, lf.ground(wx + nx * 0.8, wz - 2.4) + 0.07, wz - 2.4)
        f0, v0 = len(gt.f), len(gt.v)
        kit.add_prism(gt, a, b, 0.2, 0.19, "m_frontier", mul(mix(lin("board"), lin("ash"), 0.45), 0.75), row=(FT, "plank_a"), chamfer=0.045, taper=0.25, caps="ab", segs=2, final=True)
        kit.add_prism(gt, (b[0] - 0.2, b[1] + 0.0, b[2] + 0.55), (b[0] + 0.75, b[1] + 0.16, b[2] + 0.35), 0.09, 0.11, "m_frontier", mul(lin("board_dark"), 0.8), row=(FT, "plank_b"), caps="ab", final=True)
        guard(gt, f0, v0)
    # --- the forecourt: the shade roof that fell where it stood (all of it under 0.3 m: bodies and the jug puzzle's lines cross it)
    wood = lin("board_bleached"); dark = lin("board_dark")
    cx, cz, rot = 15.6, 3.4, math.radians(24.0)
    def Q(a, b, h=0.0):
        x = cx + a * math.cos(rot) + b * math.sin(rot); z = cz - a * math.sin(rot) + b * math.cos(rot)
        return (x, lf.ground(x, z) + h, z)
    f0, v0 = len(gt.f), len(gt.v)
    for (a, b, hh) in ((-1.7, -1.3, 0.26), (1.7, -1.3, 0.2), (1.7, 1.3, 0.28), (-1.7, 1.3, 0.14)):       # the posts, rotted off a hand over the sand
        p0 = Q(a, b, -0.1); p1 = Q(a + 0.03, b + 0.02, hh)
        kit.add_prism(gt, p0, p1, 0.17, 0.16, "m_frontier", mul(wood, 0.55), row=(FT, "plank_a"), chamfer=0.04, caps="b", u_shift=rng.uniform(0, 3), final=True)
    kit.add_prism(gt, Q(-2.0, -1.05, 0.07), Q(1.75, -0.7, 0.085), 0.15, 0.14, "m_frontier", mul(wood, 0.8), row=(FT, "plank_a"), chamfer=0.035, caps="ab", u_shift=1.3, final=True)     # the two beams
    kit.add_prism(gt, Q(-1.5, 1.2, 0.07), Q(2.1, 0.45, 0.2), 0.15, 0.14, "m_frontier", mul(wood, 0.72), row=(FT, "plank_a"), chamfer=0.035, caps="ab", u_shift=0.4, final=True)       # one end still on its stump
    for k in range(9):                                                    # the roof's poles, fanned as they slid
        a = -1.55 + 0.38 * k + rng.uniform(-0.08, 0.08); sk = rng.uniform(-0.28, 0.28)
        l0 = rng.uniform(-1.25, -0.8); l1 = rng.uniform(0.7, 1.35)
        if k in (2, 6): l1 = rng.uniform(-0.1, 0.3)                       # two broke
        kit.add_prism(gt, Q(a - sk, l0, 0.05 + 0.03 * rng.random()), Q(a + sk, l1, 0.1 + 0.1 * rng.random() if k % 3 == 0 else 0.05), 0.065, 0.06, "m_frontier",
                      mul(wood, rng.uniform(0.7, 1.0)), row=(FT, "plank_b"), taper=0.25, u_shift=rng.uniform(0, 3), final=True)
    guard(gt, f0, v0)
    n_t += talus(gt, (20.9, -1.2, -1.0, 0.0), rng, n=5, big=0.5)          # stones off the east rock, by the fence
    parts = [up, md, gt, ub, mb, gb, bones]
    print(f"DRESS lip (pass i3): {n_t} talus stones, {n_b} fallen blocks; triangles upper {up.tris() + ub.tris() + bones.tris()}, mid {md.tris() + mb.tris()}, gate {gt.tris() + gb.tris()}")
    return [p for p in parts if p.f]


def _wall_site(runs, x, z, far=6.0):
    """The wall column nearest to (x, z) that is rock in the open gully: (x, z, nx, nz) of the wall's foot there."""
    best = None; bd = far
    for run in runs:
        for c in run:
            if c.oh: continue
            d = math.hypot(c.x - x, c.z - z)
            if d < bd: bd = d; best = (c.x, c.z, c.nx, c.nz)
    return best
