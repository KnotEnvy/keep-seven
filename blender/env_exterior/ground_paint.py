"""ground_paint: what wheels, feet and wind left on the sand, painted into lm_surface AFTER the bake (pass i1).

The visual reviewers: "a uniform rippled sand plane ... vary the sand with drifts against walls and a darker trodden
path baked into the lightmap". The ground sheets are 1.5 to 2 m grids (the Lip's is also the collider), so their vertex
colour cannot carry anything finer than a blotch; the lightmap has 16 texels a metre. Every ground chart is planar from
above (its chart coordinates are game (x, z)), so a texel's place in the world is an affine map of its UV, found here
by least squares from the charted corners. The baked light of those texels is then multiplied by:

    the Lip      the cart's two ruts from the wreck in the third reach down to the gate (they meet the street's modelled
                 ruts), ONE line of boot prints from the mouth of the overhang to the gate (the man she is behind), the
                 trodden middle, wind streaks, a dark foot and a pale drift line along every wall
    the yard     the ruts in through the yard door to the water cart, the trodden line from the door to the Tally House,
                 his prints across the yard to the ladder at the west wall, damp under the tank and at the trough

Nothing here costs a triangle, a texture or a draw call. bake_surface.py calls apply(S, img) before save_lightmap.
"""
import math
import numpy as np
from lib import layout, bake
import ext_kit as kit

LIP_CHARTS = ("lip_g", "lip_dr", "lip_fdr", "lip_bdr", "lip_gate_drift", "lip_north_drift")
YARD_CHARTS = ("yd_ground", "yd_drift", "yd_dr0", "yd_dr1", "yd_dr2", "yd_dr3", "yd_dr4", "yd_dr5", "st_g_court")


# ---------------------------------------------------------------------------------------------------- numpy noise
def _hash(ix, iy, seed):
    n = (ix.astype(np.int64) * 374761393 + iy.astype(np.int64) * 668265263 + int(seed) * 2147483647) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    n = (n ^ (n >> 16)) & 0xFFFFFFFF
    return n.astype(np.float64) / 4294967295.0


def vnoise(x, y, seed=0):
    ix = np.floor(x); iy = np.floor(y)
    fx = x - ix; fy = y - iy
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy)
    a = _hash(ix, iy, seed); b = _hash(ix + 1, iy, seed); c = _hash(ix, iy + 1, seed); d = _hash(ix + 1, iy + 1, seed)
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy


def fbm(x, y, seed=0, octaves=3):
    s = 0.0; a = 1.0; t = 0.0
    for o in range(octaves):
        s = s + (vnoise(x, y, seed + 17 * o) - 0.5) * 2 * a; t += a
        x = x * 2.03; y = y * 2.03; a *= 0.5
    return s / t


def sstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------------------------------------------- lines
def chaikin(pts, n=2):
    for _ in range(n):
        out = [pts[0]]
        for a, b in zip(pts[:-1], pts[1:]):
            out.append((0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1])); out.append((0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]))
        out.append(pts[-1]); pts = out
    return pts


def offset_line(pts, d):
    """The polyline moved d metres to its left (plan, looking along it)."""
    out = []
    for i, p in enumerate(pts):
        a = pts[max(i - 1, 0)]; b = pts[min(i + 1, len(pts) - 1)]
        tx, tz = b[0] - a[0], b[1] - a[1]; l = math.hypot(tx, tz) or 1.0
        out.append((p[0] + tz / l * d, p[1] - tx / l * d))
    return out


def line_coords(X, Z, pts):
    """For every point: (distance to the polyline, signed side (+ = left), length along it at the nearest point)."""
    best = np.full(X.shape, 1e9); side = np.zeros(X.shape); along = np.zeros(X.shape)
    acc = 0.0
    for a, b in zip(pts[:-1], pts[1:]):
        dx, dz = b[0] - a[0], b[1] - a[1]; l = math.hypot(dx, dz)
        if l < 1e-6: continue
        t = np.clip(((X - a[0]) * dx + (Z - a[1]) * dz) / (l * l), 0.0, 1.0)
        px = X - a[0] - dx * t; pz = Z - a[1] - dz * t
        d = np.hypot(px, pz)
        m = d < best
        best = np.where(m, d, best)
        side = np.where(m, (dz * (X - a[0]) - dx * (Z - a[1])) / l, side)
        along = np.where(m, acc + t * l, along)
        acc += l
    return best, side, along


def ruts(X, Z, pts, gauge=0.62, width=0.115, depth=0.38, seed=1, fade_ends=2.0):
    """Two wheel lines: a dark bottom, a pale shoulder thrown up outside each; broken where the wind has filled them."""
    d, side, along = line_coords(X, Z, pts)
    total = sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(pts[:-1], pts[1:]))
    near = d < gauge + 0.6
    r = np.abs(side) - gauge
    live = 0.45 + 0.55 * sstep(0.32, 0.6, vnoise(along / 2.7, np.sign(side) * 3.0 + 0.5, seed))        # each wheel's line comes and goes
    live = live * sstep(0.0, fade_ends, along) * sstep(0.0, fade_ends, total - along)
    k = np.exp(-(r / width) ** 2) * live * near
    sh = np.exp(-((r - 2.1 * width) / (1.2 * width)) ** 2) * live * near
    return 1.0 - depth * k + 0.11 * sh


def prints(X, Z, pts, stride=0.74, apart=0.11, length=0.29, breadth=0.115, depth=0.36, seed=3, skip=None):
    """One walker's boot prints along the line: left, right, left; a few lost to the wind. skip(along) -> 0..1 keeps."""
    d, side, along = line_coords(X, Z, pts)
    k = np.floor(along / stride)
    s = along - (k + 0.5) * stride
    off = np.where(np.mod(k, 2.0) < 0.5, apart, -apart) + 0.035 * (_hash(k, k * 0 + 7, seed) - 0.5)
    e = (s / (length / 2)) ** 2 + ((side - off) / (breadth / 2)) ** 2
    heel = ((s + 0.33 * length) / (0.2 * length)) ** 2 + ((side - off) / (0.42 * breadth)) ** 2              # the heel bites deeper
    keep = (_hash(k, k * 0 + 3, seed) > 0.14) & (d < 0.6)
    a = (1.0 - sstep(0.55, 1.15, e)) * keep
    a = np.maximum(a, 1.25 * (1.0 - sstep(0.5, 1.2, heel)) * keep)
    if skip is not None: a = a * skip(along)
    return 1.0 - depth * np.clip(a, 0.0, 1.25)


def trodden(X, Z, pts, width=1.2, depth=0.10, seed=5):
    d, side, along = line_coords(X, Z, pts)
    return 1.0 - depth * np.exp(-(d / width) ** 2) * (0.55 + 0.45 * vnoise(along / 3.0, side / 1.5, seed))


def wind(X, Z, bearing_deg=135.0, seed=9, amount=0.12):
    """Long streaks lying along the wind, and broad soft blotches under them."""
    b = math.radians(bearing_deg); wx, wz = math.sin(b), -math.cos(b)
    u = X * wx + Z * wz; v = -X * wz + Z * wx
    s = vnoise(u / 5.5, v / 0.42, seed) - 0.5
    s2 = vnoise(u / 2.3, v / 0.16, seed + 4) - 0.5
    return 1.0 + amount * (s + 0.5 * s2) + 0.10 * fbm(X / 6.0, Z / 6.0, seed + 9, 2)


def wash(X, Z, pts, seed=51):
    """A dry wash: a darker bed between pale silt rims, pebbles and a few mud cracks in it."""
    d, side, along = line_coords(X, Z, pts)
    total = sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(pts[:-1], pts[1:]))
    ends = sstep(0.0, 4.0, along) * sstep(0.0, 4.0, total - along)
    hw = 0.8 + 0.5 * vnoise(along / 4.5, 0.3, seed) + 0.12 * fbm(X / 0.9, Z / 0.9, seed + 1, 2)
    bed = (1.0 - sstep(hw - 0.22, hw + 0.08, d)) * ends
    rim = np.exp(-((d - hw - 0.3) / 0.24) ** 2) * ends
    peb = (vnoise(X * 5.3, Z * 5.3, seed + 2) > 0.80) * bed
    crack = (np.abs(vnoise(X * 1.5, Z * 1.5, seed + 3) - 0.5) < 0.022) * bed
    return (1.0 - 0.17 * bed) * (1.0 + 0.10 * rim) * (1.0 - 0.24 * peb) * (1.0 - 0.16 * crack)


def blot(X, Z, c, r, depth, soft=0.6):
    d = np.hypot(X - c[0], Z - c[1])
    return 1.0 - depth * (1.0 - sstep(r * (1.0 - soft), r, d))


# ---------------------------------------------------------------------------------------------------- the two places
def lip_lines(S):
    import lip_dress, lip_fields as lf
    import street_parts
    P = chaikin(lip_dress.path_points() + [(0.0, street_parts.rut_centre(0.0))], 2)
    # his prints: from the mouth of the overhang (z < 99.5) to the gate, a pace to the left of the line a player walks
    walk = [p for p in offset_line(P, 0.55) if p[1] < 99.5]
    # the cart: from the wreck against the west wall of the third reach back down to the gate
    site = S.extra["lip"].get("cart_site")
    cart = None
    if site is not None:
        x, z, nx, nz = site
        start = (x + nx * 1.9, z + nz * 1.9)
        i0 = min(range(len(P)), key=lambda i: math.hypot(P[i][0] - start[0], P[i][1] - start[1]) + (0.0 if P[i][1] < start[1] - 2.0 else 99.0))
        cart = chaikin([start] + offset_line(P, -0.35)[i0:], 1)
    return P, walk, cart


def paint_lip(S, X, Z):
    import lip_fields as lf
    P, walk, cart = lip_lines(S)
    m = wind(X, Z, 150.0, 9, 0.13)
    m = m * trodden(X, Z, P, 1.25, 0.09)
    # the walls' feet: lf.FIELD is the distance to the corridor's edge on a 0.5 m grid
    fx = np.clip((X - lf.GX[0]) / lf.RES, 0, len(lf.GX) - 1.001); fz = np.clip((Z - lf.GZ[0]) / lf.RES, 0, len(lf.GZ) - 1.001)
    ix = fx.astype(np.int64); iz = fz.astype(np.int64); tx = fx - ix; tz = fz - iz
    Fd = (lf.FIELD[iz, ix] * (1 - tx) + lf.FIELD[iz, ix + 1] * tx) * (1 - tz) + (lf.FIELD[iz + 1, ix] * (1 - tx) + lf.FIELD[iz + 1, ix + 1] * tx) * tz
    rag = 0.25 * fbm(X / 2.2, Z / 2.2, 41, 2)
    m = m * (1.0 - 0.20 * np.exp(-(np.maximum(Fd, 0.0) / (0.5 + rag)) ** 2))                 # damp and shade at the foot
    m = m * (1.0 + 0.10 * np.exp(-((Fd - 1.35 - rag) / 0.55) ** 2))                           # the pale line where the drift ends
    import lip_dress
    m = m * wash(X, Z, chaikin(lip_dress.wash_points(), 2))
    if cart is not None: m = m * ruts(X, Z, cart, seed=11)
    bl = S.extra.get("lip", {}).get("blanket")
    if bl is not None:                                                    # pass i3: the folded blanket's soft contact shadow on the sand
        r = math.radians(bl["rot"]); cr, sr = math.cos(r), math.sin(r)
        dx = X - bl["c"][0]; dz = Z - bl["c"][1]
        u = dx * cr - dz * sr; w = dx * sr + dz * cr
        ox = np.maximum(np.abs(u) - bl["L"] / 2 - 0.03, 0.0); oz = np.maximum(np.abs(w) - bl["W"] / 2 - 0.03, 0.0)
        m = m * (1.0 - 0.42 * np.exp(-(np.hypot(ox, oz) / 0.11) ** 2))
    under_roof = sstep(98.6, 99.6, Z)
    m = m * (1.0 - (1.0 - prints(X, Z, walk, seed=13)) * (1.0 - under_roof))
    return m


def yard_lines():
    import street_parts
    rut = chaikin([(-72.6, street_parts.rut_centre(-73.0)), (-76.5, 0.1), (-79.6, 0.0), (-82.6, -0.5), (-84.3, -2.2), (-86.0, -3.3), (-87.6, -3.7)], 2)
    trod = chaikin([(-73.0, 0.0), (-80.0, 0.0), (-85.8, 0.0), (-89.5, -0.4), (-91.0, -4.0), (-89.9, -8.0), (-89.1, -13.9)], 2)
    walk = chaikin([(-73.0, 0.9), (-80.3, 0.6), (-86.0, 1.5), (-92.0, 2.9), (-96.2, 3.5), (-103.0, 3.7), (-108.7, 3.85)], 2)
    return rut, trod, walk


def paint_yard(S, X, Z):
    rut, trod, walk = yard_lines()
    m = wind(X, Z, 135.0, 29, 0.12)
    # the packed middle (what the town's feet and the cart's wheels kept hard) against the loose sand along the walls
    dt, _, _ = line_coords(X, Z, trod)
    dr_, _, _ = line_coords(X, Z, rut)
    packed = 1.0 - sstep(1.6, 3.4, np.minimum(dt, dr_) + 1.1 * fbm(X / 3.1, Z / 3.1, 37, 2))
    m = m * (1.0 - 0.19 * packed)
    dw = np.minimum(np.minimum(X + 110.0, 14.0 - Z), np.minimum(Z + 14.0, -80.0 - X))                # to the yard's four walls
    rag = 0.5 * fbm(X / 2.4, Z / 2.4, 38, 2)
    m = m * (1.0 + 0.11 * (1.0 - sstep(0.9 + rag, 2.6 + rag, dw)) * (1.0 - packed))                   # loose pale sand banked along them
    m = m * (1.0 - 0.16 * np.exp(-(np.maximum(dw, 0.0) / 0.4) ** 2))                                  # and the dark line at their feet
    m = m * trodden(X, Z, trod, 1.1, 0.08, seed=31)
    m = m * ruts(X, Z, rut, seed=33, fade_ends=1.2)
    m = m * prints(X, Z, walk, seed=35)
    m = m * blot(X, Z, (-85.5, 7.5), 2.9, 0.16)                       # under the tank
    m = m * blot(X, Z, (-100.2, 12.9), 1.5, 0.16)                     # at the trough
    d = np.hypot(X + 101.0, Z + 3.0)
    m = m * (1.0 - 0.14 * np.exp(-((d - 4.25) / 0.5) ** 2))            # the drum's foot
    return m


# ---------------------------------------------------------------------------------------------------- the lightmap
def apply(S, img):
    """Multiply the baked light of the ground charts of `img` (a float Blender image) by the paint. Returns the number
    of texels painted per place."""
    import bpy
    W, H = img.size
    px = bake.pixels(img).copy()                                       # rows bottom-up, as Blender's UV runs
    ids = {c["id"]: name for name, c in kit.CHARTS.items()}
    data = {}
    for o in S.lm:
        me = o.data
        if kit.CHART_ATTR not in me.attributes or "UVLight" not in me.uv_layers: continue
        ch = np.zeros(len(me.polygons), np.int32); me.attributes[kit.CHART_ATTR].data.foreach_get("value", ch)
        lt = np.empty(len(me.polygons), np.int32); me.polygons.foreach_get("loop_total", lt)
        lc = np.repeat(ch, lt)
        uv = np.empty(len(me.loops) * 2, np.float32); me.uv_layers["UVLight"].data.foreach_get("uv", uv); uv = uv.reshape(-1, 2)
        vi = np.empty(len(me.loops), np.int32); me.loops.foreach_get("vertex_index", vi)
        co = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get("co", co); co = co.reshape(-1, 3)
        xz = np.stack([co[vi, 0], -co[vi, 1]], axis=1)                 # Blender (x, y, z) = game (x, -z, y)
        for cid in np.unique(lc):
            name = ids.get(int(cid))
            if name is None: continue
            place = "lip" if name.startswith(LIP_CHARTS) else ("yard" if name.startswith(YARD_CHARTS) else None)
            if place is None: continue
            m = lc == cid
            d = data.setdefault(int(cid), {"uv": [], "xz": [], "place": place, "name": name})
            d["uv"].append(uv[m]); d["xz"].append(xz[m])
    done = {"lip": 0, "yard": 0}
    for cid in sorted(data):
        d = data[cid]
        uv = np.concatenate(d["uv"]).astype(np.float64); xz = np.concatenate(d["xz"]).astype(np.float64)
        A = np.concatenate([uv, np.ones((len(uv), 1))], axis=1)
        M, res, rank, sv = np.linalg.lstsq(A, xz, rcond=None)
        err = float(np.abs(A @ M - xz).max())
        if rank < 3 or err > 0.05:
            print(f"GROUND PAINT: chart {d['name']} is not planar from above (rank {rank}, error {err:.3f} m): left alone"); continue
        x0 = max(0, int(math.floor(uv[:, 0].min() * W)) - 3); x1 = min(W, int(math.ceil(uv[:, 0].max() * W)) + 3)
        y0 = max(0, int(math.floor(uv[:, 1].min() * H)) - 3); y1 = min(H, int(math.ceil(uv[:, 1].max() * H)) + 3)
        if x1 <= x0 or y1 <= y0: continue
        uu, vv = np.meshgrid((np.arange(x0, x1) + 0.5) / W, (np.arange(y0, y1) + 0.5) / H)
        X = uu * M[0, 0] + vv * M[1, 0] + M[2, 0]; Z = uu * M[0, 1] + vv * M[1, 1] + M[2, 1]
        k = paint_lip(S, X, Z) if d["place"] == "lip" else paint_yard(S, X, Z)
        px[y0:y1, x0:x1, :3] *= np.clip(k, 0.45, 1.3)[:, :, None].astype(np.float32)
        done[d["place"]] += int(k.size)
    img.pixels.foreach_set(px.ravel())
    print(f"GROUND PAINT: {done['lip']} texels of the Lip, {done['yard']} of the yard, in {len(data)} charts")
    return done
