"""Look pass i6: paint INTO a lightmap by world position (env_lift_hall, env_the_bore's stair).

The visual reviewers called the lift hall "very large pale pillars and walls with almost no surface breakup" and the
bore's stair "two large flat green walls". Both are lightmapped concrete and ceramic with a quiet detail row over
them: there is no triangle and no texture left for dirt. A lightmap texel is 6 to 7 cm there, which is exactly the
scale of what was missing: water stains under a cap band, a grimed base course, the dark line of a panel joint, the
floor's wear. `texel_map` gives every texel of the atlas its GAME position and normal; a zone's own `stain` function
multiplies the baked light with what it paints there (a stain is a darker, slightly warmer albedo). No runtime cost:
the same texture, the same draw calls.

Only env_lift_hall.py and env_the_bore.py import this file (interior_common.py is untouched, so the other three
interior zones do not go stale).
"""
import math
import numpy as np
import interior_common as ic


def texel_map(objs, res, pad=2.5):
    """(pos, nrm, oid, names): for every texel of the res x res atlas (rows bottom-up, as the bake's arrays) the GAME
    position and normal of the lightmapped face that covers it, and the index into `names` of its object (-1: none).
    A texel up to `pad` px outside an island takes the nearest triangle's plane (the bake's own margin is painted too)."""
    pos = np.zeros((res, res, 3), dtype=np.float32); nrm = np.zeros((res, res, 3), dtype=np.float32)
    oid = np.full((res, res), -1, dtype=np.int32); best = np.full((res, res), -1e9, dtype=np.float32)
    names = []
    for o in objs:
        me = o.data
        if "UVLight" not in me.uv_layers: continue
        names.append(o.name); k_obj = len(names) - 1
        n = len(me.loops); uvs = np.empty(n * 2, dtype=np.float32); me.uv_layers["UVLight"].data.foreach_get("uv", uvs); uvs = uvs.reshape(-1, 2) * res
        mw = o.matrix_world; nm = mw.to_3x3().inverted_safe().transposed()
        co = [mw @ v.co for v in me.vertices]
        idx = ic.LM_FACES.get(o.name)
        polys = me.polygons if idx is None else [me.polygons[i] for i in idx]
        for p in polys:
            li = list(p.loop_indices); q = uvs[li]
            P = np.array([[co[me.loops[l].vertex_index].x, co[me.loops[l].vertex_index].z, -co[me.loops[l].vertex_index].y] for l in li], dtype=np.float32)
            nb = (nm @ p.normal).normalized(); N = np.array([nb.x, nb.z, -nb.y], dtype=np.float32)
            for k in range(1, len(q) - 1):
                t = q[[0, k, k + 1]]; T = P[[0, k, k + 1]]
                area = (t[1, 0] - t[0, 0]) * (t[2, 1] - t[0, 1]) - (t[2, 0] - t[0, 0]) * (t[1, 1] - t[0, 1])
                if abs(area) < 1e-6: continue
                x0, x1 = max(int(math.floor(t[:, 0].min() - pad - 1)), 0), min(int(math.ceil(t[:, 0].max() + pad + 1)), res - 1)
                y0, y1 = max(int(math.floor(t[:, 1].min() - pad - 1)), 0), min(int(math.ceil(t[:, 1].max() + pad + 1)), res - 1)
                if x1 < x0 or y1 < y0: continue
                xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
                sg = 1.0 if area > 0 else -1.0; dist = np.full(xs.shape, 1e9, dtype=np.float32); w = []
                for a, b, c in ((1, 2, 0), (2, 0, 1), (0, 1, 2)):          # the edge opposite corner c
                    ex, ey = t[b, 0] - t[a, 0], t[b, 1] - t[a, 1]; el = math.hypot(ex, ey) or 1.0
                    e = sg * (ex * (ys - t[a, 1]) - ey * (xs - t[a, 0]))
                    dist = np.minimum(dist, e / el); w.append(e / abs(area))
                sub = best[y0:y1 + 1, x0:x1 + 1]
                take = (dist >= -pad) & (dist > sub)
                if not take.any(): continue
                pw = w[0][:, :, None] * T[0][None, None, :] + w[1][:, :, None] * T[1][None, None, :] + w[2][:, :, None] * T[2][None, None, :]
                pos[y0:y1 + 1, x0:x1 + 1][take] = pw[take]
                nrm[y0:y1 + 1, x0:x1 + 1][take] = N
                oid[y0:y1 + 1, x0:x1 + 1][take] = k_obj
                sub[take] = np.minimum(dist, 4.0)[take]
    return pos, nrm, oid, names


def ids(names, pred):
    """Boolean lookup table over object indices (index -1 -> False) for `oid` maps: ids(names, f)[oid]."""
    return np.array([bool(pred(n)) for n in names] + [False], dtype=bool)


# ------------------------------------------------------------------ noise
def hash2(ix, iy, seed=0):
    """Integer lattice hash -> float32 in [0, 1) (arrays of int64)."""
    h = (ix.astype(np.int64) * 374761393 + iy.astype(np.int64) * 668265263 + int(seed) * 1442695041) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    h = h ^ (h >> 16)
    return (h & 0xFFFFFF).astype(np.float32) / float(0x1000000)


def vnoise(x, y, seed=0):
    """Value noise in [0, 1], one lattice cell per unit."""
    x = np.asarray(x, dtype=np.float64); y = np.asarray(y, dtype=np.float64)
    ix = np.floor(x).astype(np.int64); iy = np.floor(y).astype(np.int64)
    fx = (x - ix).astype(np.float32); fy = (y - iy).astype(np.float32)
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy)
    a = hash2(ix, iy, seed); b = hash2(ix + 1, iy, seed); c = hash2(ix, iy + 1, seed); d = hash2(ix + 1, iy + 1, seed)
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy


def fbm(x, y, seed=0, octaves=3):
    """Three octaves of value noise, about [0, 1], mean 0.5."""
    out = 0.0; amp = 0.5; tot = 0.0
    for k in range(octaves):
        out = out + amp * vnoise(np.asarray(x) * (2 ** k), np.asarray(y) * (2 ** k), seed + 17 * k); tot += amp; amp *= 0.5
    return out / tot


def smooth(a, b, x):
    t = np.clip((np.asarray(x, dtype=np.float32) - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def drips(s, d, seed=0, width=0.24, density=0.45, lmin=0.4, lmax=2.4):
    """Water stains that run down from a source line: s = metres along the line, d = metres below it (negative: above,
    no stain). Columns `width` wide; a share `density` of them runs, each to its own length; strongest under the
    source, feathered across the column. Returns the stain's amount in [0, 1]."""
    s = np.asarray(s, dtype=np.float64); d = np.asarray(d, dtype=np.float32)
    jit = (vnoise(np.floor(s / width) * 3.7 + 0.5, d / 0.9, seed + 5) - 0.5) * 0.35 * width       # the run wanders a little on its way down
    u = (s + jit) / width; col = np.floor(u).astype(np.int64); f = (u - col).astype(np.float32)
    zero = np.zeros_like(col)
    on = hash2(col, zero, seed) < density
    L = lmin + (lmax - lmin) * hash2(col, zero + 1, seed) ** 2
    k = 0.45 + 0.55 * hash2(col, zero + 2, seed)
    across = np.sin(np.pi * f) ** 0.8
    down = np.clip(1.0 - d / L, 0.0, 1.0) ** 1.25
    return np.where(on & (d >= 0.0), across * down * k, 0.0).astype(np.float32)


def darken(light, amount, colour=(1.0, 1.0, 1.0)):
    """light x (1 - amount x colour): colour < 1 in a channel keeps more of it (a warm stain keeps its red)."""
    c = np.asarray(colour, dtype=np.float32)[None, None, :]
    return light * np.clip(1.0 - np.asarray(amount, dtype=np.float32)[:, :, None] * c, 0.0, 1.0)


def knee(light, start, ceiling):
    """Soft highlight compression of the brightest channel: unchanged below `start`, never above `ceiling`."""
    L = light.max(axis=2); span = max(ceiling - start, 1e-4)
    Ln = np.where(L > start, start + span * (1.0 - np.exp(-(L - start) / span)), L)
    return light * (Ln / np.maximum(L, 1e-6))[:, :, None]
