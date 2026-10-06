"""lip_fields: the plan-view fields the Lip's terrain and rock are built from (helper module, pure Python + numpy).

Everything is derived from the layout's solids (design/layout.json): the walkable corridor W is flood-filled from
`player_start` between the rock and adobe solids; F(x, z) is the distance to its edge (positive inside W, negative in
rock); the path's height is the four wedge slopes; `top_at` is the height of the rock mass above a point. The drawn
ground, the collider and the rock curtain all read the same functions, so they agree by construction."""
import math
import numpy as np
from lib import layout
from ext_kit import fbm, vnoise, clamp, smooth

ZONE = "the_lip"
BX0, BX1, BZ0, BZ1 = 0.0, 32.0, -9.0, 111.0
SOL = {s["id"]: s for s in layout.solids(ZONE)}
MAIN = [s for s in SOL.values() if s["role"] == "terrain" and s["surface"] == "stone" and "spur" not in s["id"]]
SPUR = [s for s in SOL.values() if "spur" in s["id"]]
ADOBE = [SOL["lip_gate_wall_0"], SOL["lip_gate_wall_2"], SOL["lip_fc_wall_n"]]
BOULDERS = [s for s in SOL.values() if "boulder" in s["id"]]
OH = (8.0, 20.0, 101.0, 110.0)          # overhang interior x0, x1, z0, z1
OH_FLOOR = 14.0


def sd_box(x, z, s, grow=0.0):
    """Signed distance (plan) to a box solid; works on floats and numpy arrays."""
    r = math.radians(s.get("rotY", 0) or 0); c = math.cos(r); sn = math.sin(r)
    dx = x - s["pos"][0]; dz = z - s["pos"][2]
    lx = dx * c - dz * sn; lz = dx * sn + dz * c
    qx = np.abs(lx) - (s["size"][0] / 2 + grow); qz = np.abs(lz) - (s["size"][2] / 2 + grow)
    return np.hypot(np.maximum(qx, 0), np.maximum(qz, 0)) + np.minimum(np.maximum(qx, qz), 0)


def d_set(x, z, solids):
    d = None
    for s in solids:
        v = sd_box(x, z, s)
        d = v if d is None else np.minimum(d, v)
    return d


def d_bounds(x, z):
    return np.minimum(np.minimum(x - BX0, BX1 - x), np.minimum(z - BZ0, BZ1 - z))


def path_h(z):
    """Height of the path at game z: the overhang and first flat, four wedge slopes, the forecourt."""
    if z >= 93: return 14.0
    if z >= 78: return 11.5 + (z - 78) / 15 * 2.5
    if z >= 54: return 7.5 + (z - 54) / 24 * 4.0
    if z >= 30: return 3.0 + (z - 30) / 24 * 4.5
    if z >= 9: return (z - 9) / 21 * 3.0
    return 0.0


# ---------------------------------------------------------------- the walkable corridor
RES = 0.5
GX = np.arange(BX0 - 1.0, BX1 + 1.0 + 1e-6, RES)
GZ = np.arange(BZ0 - 1.0, BZ1 + 1.0 + 1e-6, RES)
_XX, _ZZ = np.meshgrid(GX, GZ)                                  # [iz, ix]
_DM = d_set(_XX, _ZZ, MAIN); _DS = d_set(_XX, _ZZ, SPUR); _DA = d_set(_XX, _ZZ, ADOBE)
_BLOCK = np.minimum(np.minimum(np.minimum(_DM, _DS), _DA), d_bounds(_XX, _ZZ))


def _flood():
    free = _BLOCK > 0.0
    w = np.zeros_like(free)
    ix = int(round((16.0 - GX[0]) / RES)); iz = int(round((107.5 - GZ[0]) / RES))
    stack = [(iz, ix)]; w[iz, ix] = True
    H, Wd = free.shape
    while stack:
        a, b = stack.pop()
        for da, db in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            p, q = a + da, b + db
            if 0 <= p < H and 0 <= q < Wd and free[p, q] and not w[p, q]:
                w[p, q] = True; stack.append((p, q))
    return w


W = _flood()


def _depth():
    """Distance from every grid node outside the corridor to the corridor (metres): the depth into the rock mass."""
    edge = W & ~(np.roll(W, 1, 0) & np.roll(W, -1, 0) & np.roll(W, 1, 1) & np.roll(W, -1, 1))
    ez, ex = np.nonzero(edge)
    ex = GX[ex]; ez = GZ[ez]
    out = np.zeros(W.shape, dtype=np.float64)
    oz, ox = np.nonzero(~W)
    for k in range(0, len(oz), 2000):
        a = slice(k, k + 2000)
        d = np.hypot(GX[ox[a]][:, None] - ex[None, :], GZ[oz[a]][:, None] - ez[None, :]).min(axis=1)
        out[oz[a], ox[a]] = d
    return out


DEPTH = _depth()
# > 0 in the corridor (distance to the solids), < 0 outside it (minus the depth; exact against the solids near the edge)
FIELD = np.where(W, np.maximum(_BLOCK, 0.01), -np.where((_BLOCK < 0) & (DEPTH < 1.0), np.maximum(-_BLOCK, 0.01), np.maximum(DEPTH - 0.25, 0.05)))


def _bilinear(a, x, z):
    fx = (x - GX[0]) / RES; fz = (z - GZ[0]) / RES
    ix = int(math.floor(fx)); iz = int(math.floor(fz))
    ix = max(0, min(len(GX) - 2, ix)); iz = max(0, min(len(GZ) - 2, iz))
    tx = clamp(fx - ix); tz = clamp(fz - iz)
    return (a[iz, ix] * (1 - tx) + a[iz, ix + 1] * tx) * (1 - tz) + (a[iz + 1, ix] * (1 - tx) + a[iz + 1, ix + 1] * tx) * tz


def in_w(x, z):
    ix = int(round((x - GX[0]) / RES)); iz = int(round((z - GZ[0]) / RES))
    if ix < 0 or iz < 0 or ix >= len(GX) or iz >= len(GZ): return False
    return bool(W[iz, ix])


_PRE = [(s["pos"][0], s["pos"][2], math.cos(math.radians(s.get("rotY", 0) or 0)), math.sin(math.radians(s.get("rotY", 0) or 0)), s["size"][0] / 2, s["size"][2] / 2)
        for s in MAIN + SPUR + ADOBE]


def _block(x, z):
    best = min(x - BX0, BX1 - x, z - BZ0, BZ1 - z)
    for (px, pz, c, sn, hx, hz) in _PRE:
        dx = x - px; dz = z - pz
        qx = abs(dx * c - dz * sn) - hx; qz = abs(dx * sn + dz * c) - hz
        d = math.hypot(max(qx, 0.0), max(qz, 0.0)) + min(max(qx, qz), 0.0)
        if d < best: best = d
    return best


def F(x, z):
    """Distance to the corridor's edge: positive in the corridor (exact against the solids), negative outside it
    (minus the depth into the rock mass; exact against the solids within a metre of the edge)."""
    f = _bilinear(FIELD, x, z)
    b = _block(x, z)
    if f > 0.3: return b if b > 0 else f
    if f > -1.0 and abs(b) < 1.2 and (b < 0 or in_w(x, z) or f > 0): return b
    return f


def grad(x, z, e=0.15):
    """Unit vector (x, z) pointing INTO the corridor."""
    gx = F(x + e, z) - F(x - e, z); gz = F(x, z + e) - F(x, z - e)
    l = math.hypot(gx, gz)
    if l < 1e-6:
        gx = _bilinear(FIELD, x + 0.6, z) - _bilinear(FIELD, x - 0.6, z); gz = _bilinear(FIELD, x, z + 0.6) - _bilinear(FIELD, x, z - 0.6)
        l = math.hypot(gx, gz) or 1.0
    return gx / l, gz / l


def in_overhang(x, z):
    return OH[0] - 1.2 <= x <= OH[1] + 1.2 and z >= OH[2] - 0.05


def tag_at(x, z):
    """What bounds the corridor at an edge point: 'rock', 'adobe' (the forecourt's walls) or 'bound' (the zone's edge)."""
    da = float(d_set(x, z, ADOBE)); dr = float(min(d_set(x, z, MAIN), d_set(x, z, SPUR))); db = float(d_bounds(x, z))
    if db < 0.3 and db <= min(da, dr) + 0.05: return "bound"
    if da < dr + 0.05 and da < 0.4: return "adobe"
    return "rock"


def top_at(x, z, noise=True):
    """Height of the top of the rock mass at a point inside rock (the layout solid's top; a spur's own top on a spur)."""
    best = None
    for s in MAIN:
        if sd_box(x, z, s) < 0.35:
            t = s["pos"][1] + s["size"][1] / 2
            best = t if best is None else max(best, t)
    if best is None:
        for s in SPUR:
            if sd_box(x, z, s) < 0.35:
                t = s["pos"][1] + s["size"][1] / 2
                best = t if best is None else max(best, t)
    if best is None:
        near = min(MAIN, key=lambda s: float(sd_box(x, z, s)))
        best = near["pos"][1] + near["size"][1] / 2
    if z > 92.5: best = max(best, 19.1)                                   # the roof slab over the overhang and its shoulders
    if noise: best += 1.5 * fbm(x / 8.0, z / 8.0, 41, 3) - 0.3
    return min(best, 25.6)


def d_boulder(x, z):
    return float(d_set(x, z, BOULDERS))


# integration: where the layout stands a body by marker (the start, the gate checkpoint, spawns) the collider must BE the
# layout's plane: 4 mm of undulation above it put the spawned capsule inside the terrain (capsuleFree false at cp_lip_start,
# restart_checkpoint 14.0041 for 14). The relief fades in between 3 and 5 m from each such marker (the sheet has a vertex every 1 to 2 m).
_LEVEL = [(m["pos"][0], m["pos"][2]) for m in layout.markers("the_lip") if m["type"] in ("checkpoint", "player_start", "enemy_spawn")] \
    if hasattr(layout, "markers") else []


def ground(x, z):
    g = _ground_raw(x, z)
    if not _LEVEL: return g
    d = min(math.hypot(x - mx, z - mz) for mx, mz in _LEVEL)
    if d >= 5.0: return g
    base = OH_FLOOR if (in_overhang(x, z) and OH[0] <= x <= OH[1]) else path_h(z)
    return base + (g - base) * smooth(clamp((d - 3.0) / 2.0))


def _ground_raw(x, z):
    """The drawn ground (and the collider's floor): the path's height, a slow undulation, sand banked against the rock
    (more on the west side: the wind is from the north-west), a rise against the boulders. Within 0.3 m of the layout's
    floor everywhere a body can stand."""
    h = path_h(z)
    if in_overhang(x, z) and OH[0] <= x <= OH[1]: return OH_FLOOR + 0.02 * fbm(x / 3.0, z / 3.0, 7, 2)
    if x < 2.8 and abs(z) < 2.6: return h + 0.02 * fbm(x / 3.0, z / 3.0, 9, 2)            # the gate's passage: level with the street
    d = F(x, z)
    und = 0.07 * fbm(x / 6.0, z / 6.0, 3, 3) if z > 9.5 else 0.03 * fbm(x / 5.0, z / 5.0, 3, 2)
    west = 1.0 if grad(x, z)[0] > 0.3 else 0.0                               # the wall is to the west of this point
    amp = 0.20 + 0.05 * west
    reach = 2.2 + 1.3 * west
    if d >= 0: rise = amp * (1.0 - clamp(d / reach)) ** 2
    else: rise = amp + min(1.7, -d * (0.75 + 0.35 * vnoise(x * 0.4, z * 0.4, 11)))
    db = d_boulder(x, z)
    if db < 1.2: rise = max(rise, 0.2 * (1.0 - clamp(db / 1.2)) ** 2)
    if z < 9.5: rise *= 0.6 if d >= 0 else 1.0
    return h + und * smooth(clamp(d / 1.0)) + rise


# ---------------------------------------------------------------- the corridor's edge as polylines
def contours():
    """Marching squares on FIELD = 0 -> closed loops [(x, z), ...], the corridor on the LEFT of the direction of travel."""
    H, Wd = FIELD.shape
    segs = []

    def cross(ax, az, av, bx, bz, bv):
        t = av / (av - bv)
        return (ax + (bx - ax) * t, az + (bz - az) * t)

    for iz in range(H - 1):
        for ix in range(Wd - 1):
            v = [FIELD[iz, ix], FIELD[iz, ix + 1], FIELD[iz + 1, ix + 1], FIELD[iz + 1, ix]]
            p = [(GX[ix], GZ[iz]), (GX[ix + 1], GZ[iz]), (GX[ix + 1], GZ[iz + 1]), (GX[ix], GZ[iz + 1])]
            ins = [x > 0 for x in v]
            if all(ins) or not any(ins): continue
            pts = []
            for k in range(4):
                j = (k + 1) % 4
                if ins[k] != ins[j]: pts.append((k, cross(p[k][0], p[k][1], v[k], p[j][0], p[j][1], v[j])))
            if len(pts) == 2: pairs = [(pts[0][1], pts[1][1])]
            else: pairs = [(pts[0][1], pts[1][1]), (pts[2][1], pts[3][1])] if ins[0] else [(pts[0][1], pts[3][1]), (pts[1][1], pts[2][1])]
            for a, b in pairs:
                # orient: the corridor (FIELD > 0) on the left of a -> b. Game plan (x east, z south): left of d is (dz, -dx)
                mx = (a[0] + b[0]) / 2; mz = (a[1] + b[1]) / 2
                dx = b[0] - a[0]; dz = b[1] - a[1]
                if _bilinear(FIELD, mx + dz * 0.3, mz - dx * 0.3) < _bilinear(FIELD, mx - dz * 0.3, mz + dx * 0.3): a, b = b, a
                segs.append((a, b))
    key = lambda p: (round(p[0], 3), round(p[1], 3))
    nxt = {}
    for a, b in segs: nxt.setdefault(key(a), []).append(b)
    loops = []
    used = set()
    for a, b in segs:
        if key(a) in used: continue
        loop = [a]; cur = b; used.add(key(a))
        while key(cur) not in used:
            loop.append(cur); used.add(key(cur))
            c = nxt.get(key(cur))
            if not c: break
            cur = c[0]
        if len(loop) > 8: loops.append(loop)
    return loops


def simplify(pts, tol):
    """Douglas-Peucker on an open polyline."""
    if len(pts) < 3: return list(pts)
    a = pts[0]; b = pts[-1]
    dx = b[0] - a[0]; dz = b[1] - a[1]; l = math.hypot(dx, dz)
    best = -1.0; bi = -1
    for i in range(1, len(pts) - 1):
        p = pts[i]
        d = abs((p[0] - a[0]) * dz - (p[1] - a[1]) * dx) / l if l > 1e-9 else math.hypot(p[0] - a[0], p[1] - a[1])
        if d > best: best = d; bi = i
    if best <= tol: return [a, b]
    return simplify(pts[:bi + 1], tol)[:-1] + simplify(pts[bi:], tol)


def resample(pts, step):
    out = [pts[0]]
    for i in range(1, len(pts)):
        a = out[-1]; b = pts[i]
        l = math.hypot(b[0] - a[0], b[1] - a[1])
        n = max(1, int(math.ceil(l / step)))
        for k in range(1, n + 1): out.append((a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n))
    return out
