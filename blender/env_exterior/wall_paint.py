"""wall_paint: weather, courses, cracks and stains painted into lm_surface AFTER the bake (pass i2).

Both visual reviewers: "the adobe walls are single flat-coloured planes several metres across with no cracks, courses or
staining", "big single-colour rock slabs ... no facet wider than about 4 m may be a single flat tone", "the tank fills
the frame with a plain blue-violet surface". The walls are a few large quads (a vertex colour cannot carry a stain) and
their detail texture is a fine grain that goes flat in the shade; the lightmap has 8 to 16 texels a metre on every one of
them. ground_paint.py does this for the sand (planar charts from above); here every lightmapped triangle that is NOT
ground is rasterised into the atlas, so each texel knows its place in the world (game x, y, z), its face's normal, its
chart and its height over the ground, whatever the chart's shape (flat walls, the drum's cylinder, the gully's curtains).
The baked light of those texels is then multiplied (RGB: a stain may be warm or cool) by, per kind of surface:

    adobe     broad plaster tones, patches where the render has fallen and the courses of the bricks show (a shadow line
              under each patch's upper lip), hairline cracks, rain streaks under the wall's top, a damp dark band at the
              foot with the pale line of blown sand above it
    rock      beds: bands of the strata a hand to a pace thick that run on round every corner (they are a function of the
              height), broad warm and cool fields, dark varnish streaks under the ledges, joints
    ceramic   (the yard's drum) plate rows with rivets, a rust skirt at the foot and a weep under each band, a streak of
              the wrong-coloured water under the valve
    timber    grey weather toward the top, damp at the foot

Nothing here costs a triangle, a texture or a draw call. bake_surface.py calls apply(S, img) before save_lightmap.
"""
import math
import numpy as np
from lib import bake
import ext_kit as kit
from ground_paint import vnoise, fbm, sstep, _hash, LIP_CHARTS, YARD_CHARTS

GROUND_NY = 0.80            # a face whose normal points up more than this is ground or a top: left to ground_paint
MARGIN = 3.5                # texels a chart's paint runs past its edge (the bake's own margin is 4)


# ---------------------------------------------------------------------------------------------------- the texel map
def texel_map(S, W, H):
    """pos (H, W, 3) game coordinates, nrm (H, W, 3), cid (H, W) chart id (0 = none), rows BOTTOM-UP like bake.pixels."""
    pos = np.zeros((H, W, 3), np.float32); nrm = np.zeros((H, W, 3), np.float32)
    cid_map = np.zeros((H, W), np.int32); inside = np.zeros((H, W), bool)
    neutral = None
    n_tri = 0
    for o in sorted(S.lm, key=lambda o: o.name):
        me = o.data
        if kit.CHART_ATTR not in me.attributes or "UVLight" not in me.uv_layers: continue
        me.calc_loop_triangles()
        nt = len(me.loop_triangles)
        if nt == 0: continue
        tl = np.empty(nt * 3, np.int32); me.loop_triangles.foreach_get("loops", tl); tl = tl.reshape(-1, 3)
        tp = np.empty(nt, np.int32); me.loop_triangles.foreach_get("polygon_index", tp)
        ch = np.zeros(len(me.polygons), np.int32); me.attributes[kit.CHART_ATTR].data.foreach_get("value", ch)
        uv = np.empty(len(me.loops) * 2, np.float32); me.uv_layers["UVLight"].data.foreach_get("uv", uv); uv = uv.reshape(-1, 2)
        vi = np.empty(len(me.loops), np.int32); me.loops.foreach_get("vertex_index", vi)
        co = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get("co", co); co = co.reshape(-1, 3)
        mw = np.array(o.matrix_world, np.float64)
        cw = co.astype(np.float64) @ mw[:3, :3].T + mw[:3, 3]
        g = np.stack([cw[:, 0], cw[:, 2], -cw[:, 1]], axis=1)                       # Blender (x, y, z) -> game (x, z, -y)
        for t in range(nt):
            c = int(ch[tp[t]])
            if c == 0: continue
            l = tl[t]
            a = uv[l].astype(np.float64) * (W, H)                                    # texel coordinates
            p = g[vi[l]]
            e1 = a[1] - a[0]; e2 = a[2] - a[0]
            det = e1[0] * e2[1] - e1[1] * e2[0]
            if abs(det) < 1e-9: continue
            n = np.cross(p[1] - p[0], p[2] - p[0]); ln = np.linalg.norm(n)
            if ln < 1e-12: continue
            n = n / ln
            x0 = max(0, int(math.floor(a[:, 0].min() - MARGIN))); x1 = min(W, int(math.ceil(a[:, 0].max() + MARGIN)) + 1)
            y0 = max(0, int(math.floor(a[:, 1].min() - MARGIN))); y1 = min(H, int(math.ceil(a[:, 1].max() + MARGIN)) + 1)
            if x1 <= x0 or y1 <= y0: continue
            xs, ys = np.meshgrid(np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5)
            dx = xs - a[0, 0]; dy = ys - a[0, 1]
            b1 = (dx * e2[1] - dy * e2[0]) / det; b2 = (dy * e1[0] - dx * e1[1]) / det; b0 = 1.0 - b1 - b2
            # signed distance to each edge in texels: barycentric x the triangle's height over that edge
            area2 = abs(det)
            h0 = area2 / max(np.hypot(*(a[2] - a[1])), 1e-9); h1 = area2 / max(np.hypot(*e2), 1e-9); h2 = area2 / max(np.hypot(*e1), 1e-9)
            dist = np.minimum(np.minimum(b0 * h0, b1 * h1), b2 * h2)
            ins = dist >= -1e-4
            near = (dist >= -MARGIN) & ~inside[y0:y1, x0:x1]
            m = ins | near
            if not m.any(): continue
            P = b0[..., None] * p[0] + b1[..., None] * p[1] + b2[..., None] * p[2]
            sub = pos[y0:y1, x0:x1]; sub[m] = P[m]
            nrm[y0:y1, x0:x1][m] = n
            cid_map[y0:y1, x0:x1][m] = c
            inside[y0:y1, x0:x1] |= ins
            n_tri += 1
    return pos, nrm, cid_map, n_tri


def chart_names():
    return {c["id"]: name for name, c in kit.CHARTS.items()}


# ---------------------------------------------------------------------------------------------------- what a chart is
import re
ADOBE = re.compile(r"^(lip_gatewall|lip_gate_jamb|lip_northwall|lip_pier|st_end_|st_gate_jamb|st_gatehouse|st_ruin_(bk|fa|fb|se|sw)|st_wall_|"
                   r"st_cover_stub_._[lr]$|yd_cover_stub_._[lr]$|yd_jamb|yd_shed|yd_tally|yd_wall_._[lr]$|yd_well|st_(assay2|tack|corral|smithy)_[fs]$)")
TIMBER = re.compile(r"^(st_(assay|feed|board|dry|under|wash|meet|saddle)_[fs]$|yd_tank_boards|st_feed_dock)")
ROCK = re.compile(r"^(lip_wall_|lip_bo\d|lip_ledge_|lip_shelf_|lip_slab_)")
CERAMIC = re.compile(r"^(yd_drum)$")


GAIN = {"adobe": 1.5, "rock": 1.3, "ceramic": 1.45, "timber": 1.3}


def kind_of(name):
    if name is None: return None
    if ADOBE.match(name): return "adobe"
    if TIMBER.match(name): return "timber"
    if ROCK.match(name): return "rock"
    if CERAMIC.match(name): return "ceramic"
    return None


def _lerp3(k, c):
    """1 -> c by k, per channel: (N,) and a 3-tuple -> (N, 3)."""
    return 1.0 + k[:, None] * (np.asarray(c, np.float64)[None, :] - 1.0)


# ---------------------------------------------------------------------------------------------------- adobe
BRICK_H = 0.19; BRICK_L = 0.42


def paint_adobe(P, N, dense, y_top):
    """P (n, 3) game positions, N (n, 3) normals, dense: the chart has texels enough for courses, y_top: the chart's top."""
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    u = x * N[:, 2] - z * N[:, 0]                                         # metres along the wall
    sd = 100 + np.round(N[:, 0] * 3 + N[:, 2] * 5 + np.abs(np.round(x * np.abs(N[:, 0]) + z * np.abs(N[:, 2])))).astype(np.int64) % 97   # each wall plane its own weather
    sd = int(np.bincount(sd - sd.min()).argmax() + sd.min())
    m = np.ones((len(x), 3))
    # broad plaster tones: a patch re-rendered warmer, one gone grey
    broad = fbm(u / 2.9, y / 2.1, sd, 3); mid = fbm(u / 0.8, y / 0.55, sd + 1, 2)
    m *= (1.0 + 0.16 * broad + 0.06 * mid)[:, None]
    m *= _lerp3(np.clip(broad * 1.6, 0, 1) * 0.5, (1.05, 0.99, 0.93)); m *= _lerp3(np.clip(-broad * 1.6, 0, 1) * 0.5, (0.95, 0.98, 1.05))
    # fallen render: likelier at the foot and at corners of the top; the bricks' courses show
    # (a) the eroded foot: along most of a wall the render is gone to a ragged line a hand to a pace up; (b) a few large
    # patches higher on the wall, likelier under its top
    soft = 0.10 if dense else 0.16
    foot_on = sstep(0.30, 0.50, vnoise(u / 5.5, 0.37 + y * 0, sd + 6))
    foot_h = (0.22 + 0.75 * (fbm(u / 1.9, y * 0 + 0.11, sd + 5, 3) * 0.5 + 0.5) + 0.10 * fbm(u / 0.33, y * 0 + 0.5, sd + 4, 2)) * foot_on
    def patch_field(yy):
        hi = 0.07 * sstep(1.0, 0.2, y_top - yy)
        mid = sstep(0.665 - hi, 0.665 - hi + soft * 1.2, fbm(u / 2.6, yy / 1.7, sd + 7, 3) * 0.5 + 0.5 + 0.05 * fbm(u / 0.4, yy / 0.4, sd + 8, 2)) * sstep(0.5, 1.0, yy)
        return np.maximum(mid, sstep(foot_h + soft, foot_h - soft, yy))
    inp = patch_field(y)
    lip = (1.0 - patch_field(y + 0.11)) * inp                             # under the plaster's broken upper edge
    sill = (1.0 - inp) * patch_field(y + 0.09)                            # the plaster's edge above a patch catches light
    brick = np.ones(len(x))
    if dense:
        row = np.floor(y / BRICK_H); fy = y / BRICK_H - row
        fu = (u + (row % 2) * 0.5 * BRICK_L) / BRICK_L; col = np.floor(fu); fu = fu - col
        tone = _hash(col, row, sd + 3)
        brick = (0.90 + 0.2 * tone) * (1.0 - 0.26 * np.maximum(fy < 0.30, fu < 0.13))
    else:
        brick = 0.93 + 0.1 * fbm(u / 0.5, y / 0.25, sd + 3, 2)
    # under the plum render the wall is the buttresses' bare adobe: a patch is LIGHTER and warmer than the plaster round it
    m *= (1.0 + inp * (brick - 1.0))[:, None]
    m *= _lerp3(inp, (1.55, 1.16, 0.80))
    m *= (1.0 - 0.45 * lip)[:, None]; m *= (1.0 + 0.12 * sill)[:, None]
    # hairline cracks: one to a 3.1 m bay (two bays in three), from the top down or from the foot up, wandering
    bay = np.floor(u / 3.1); has = _hash(bay, bay * 0 + 5, sd + 11) < 0.68
    uc = (bay + 0.2 + 0.6 * _hash(bay, bay * 0 + 9, sd + 12)) * 3.1 + 0.32 * fbm(y / 0.7, bay * 3.3, sd + 13, 3) + 0.10 * (y - 1.5) * (_hash(bay, bay * 0 + 2, sd + 14) - 0.5) * 2
    down = _hash(bay, bay * 0 + 4, sd + 15) < 0.55; reach = 0.9 + 1.9 * _hash(bay, bay * 0 + 6, sd + 16)
    live = np.where(down, sstep(reach + 0.3, reach - 0.3, y_top - y), sstep(reach + 0.3, reach - 0.3, y))
    w = 0.028 if dense else 0.05
    m *= (1.0 - 0.36 * np.exp(-((u - uc) / w) ** 2) * live * has * (1.0 - inp))[:, None]
    # rain: dark streaks that hang from the wall's top
    hang = 1.0 - sstep(0.15, 1.9, y_top - y)
    st = sstep(0.60, 0.80, vnoise(u / 0.16, y / 3.5, sd + 21)) * (0.4 + 0.6 * vnoise(u / 1.7, 0.5 + y * 0, sd + 22))
    m *= _lerp3(0.42 * st * hang, (0.74, 0.76, 0.84))
    # the foot: damp and dark, and above it the pale line of sand the wind left on the wall
    rag = 0.22 * fbm(u / 1.1, y * 0 + 0.7, sd + 31, 2)
    damp = 1.0 - sstep(0.16 + rag, 0.48 + rag, y)
    m *= _lerp3(0.30 * damp * (1.0 - 0.6 * inp), (0.70, 0.72, 0.82))
    dust = np.exp(-((y - 0.62 - rag) / 0.20) ** 2) * (0.6 + 0.4 * vnoise(u / 0.6, y * 0 + 0.2, sd + 32))
    m *= _lerp3(0.30 * dust, (1.30, 1.20, 1.02))
    return m


# ---------------------------------------------------------------------------------------------------- rock
def paint_rock(P, N):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    u = z + 0.35 * x
    m = np.ones((len(x), 3))
    side = 1.0 - sstep(0.55, 0.85, np.abs(N[:, 1]))                       # walls take all of it, tops and undersides the fields only
    # broad fields: a warm iron-rich reach, a paler leached one (the same field on both walls of the gully)
    f = fbm(u / 6.5, y / 3.2 + x / 9.0, 61, 3)
    m *= (1.0 + 0.20 * f)[:, None]
    m *= _lerp3(np.clip(f * 1.8, 0, 1) * 0.6, (1.07, 0.97, 0.90)); m *= _lerp3(np.clip(-f * 1.8, 0, 1) * 0.6, (0.93, 0.98, 1.06))
    # thin beds: lamination lines a hand apart that run level, wandering a little, some strong, most faint
    yb = y + 0.10 * fbm(u / 7.0, x / 7.0, 63, 2)
    k = np.floor(yb / 0.31); fy = yb / 0.31 - k
    strong = _hash(k, k * 0 + 1, 64)
    m *= (1.0 - side * (0.05 + 0.17 * (strong > 0.62)) * np.exp(-((fy - 0.5) / 0.16) ** 2) * (0.5 + 0.5 * vnoise(u / 2.3, k * 1.7, 65)))[:, None]
    m *= (1.0 + side * 0.07 * (_hash(k, k * 0 + 2, 66) - 0.5) * 2)[:, None]                               # each thin bed its own tone
    # desert varnish: dark streaks under the lips, long and narrow, in families
    fam = sstep(0.45, 0.75, vnoise(u / 3.4, 0.3 + y * 0, 67))
    st = sstep(0.55, 0.85, vnoise(u / 0.22, y / 4.0, 68))
    m *= _lerp3(side * 0.42 * st * fam, (0.66, 0.66, 0.78))
    # joints: a vertical fracture every few metres, not everywhere
    bay = np.floor(u / 4.3); has = _hash(bay, bay * 0 + 3, 69) < 0.6
    uc = (bay + 0.25 + 0.5 * _hash(bay, bay * 0 + 4, 70)) * 4.3 + 0.18 * fbm(y / 0.8, bay * 2.1, 71, 2)
    m *= (1.0 - side * 0.30 * np.exp(-((u - uc) / 0.05) ** 2) * has)[:, None]
    # pass i3: the wall's foot. A band of damp, flood-stained rock a pace high over the gully's floor (ragged, darker and
    # cooler), and over it the pale line the last flood's silt left: the walls stand ON the floor instead of ending at it
    hy = y - _floor_y(z)
    rag = 0.45 * fbm(u / 2.4, x / 5.0, 73, 3)
    band = (1.0 - sstep(0.55 + rag, 1.25 + rag, hy)) * sstep(-2.5, -1.0, hy)
    m *= _lerp3(side * 0.34 * band, (0.66, 0.68, 0.80))
    silt = np.exp(-((hy - 1.3 - rag) / 0.16) ** 2) * (0.5 + 0.5 * vnoise(u / 0.9, 0.3 + y * 0, 74))
    m *= _lerp3(side * 0.22 * silt, (1.22, 1.16, 1.04))
    return m


_FLOOR = None


def _floor_y(z):
    """The gully floor's height by z (the critical path's own), for the rock's base band."""
    global _FLOOR
    if _FLOOR is None:
        from lib import layout
        L = layout.load()
        nodes = {n["id"]: n for n in L["nav"]["nodes"]}
        pts = sorted((nodes[i]["pos"][2], nodes[i]["pos"][1]) for i in L["nav"]["criticalPath"] if i in nodes and nodes[i].get("zone") == "the_lip")
        _FLOOR = (np.array([p[0] for p in pts]), np.array([p[1] for p in pts]))
    return np.interp(z, _FLOOR[0], _FLOOR[1])


# ---------------------------------------------------------------------------------------------------- stop one's shelf
def paint_shelf(P, N):
    """The swept rock shelf the pot stands on (ART_BIBLE 3.6: no hearth, no ash). In the notch's sun it was one flat
    saturated orange disc with a hard edge on the pale sand ("reads as a sticker"): the slab is leached and dusty, sand
    lies over its rim in tongues, two joints cross it, and the broom's last strokes show."""
    from lib import layout
    m_ = layout.marker("prop_camp_one")["pos"]
    cx, cz = m_[0] + 0.25, m_[2] + 0.15
    r = math.radians(-14.0); cr, sr = math.cos(r), math.sin(r)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    lx = (x - cx) * cr - (z - cz) * sr; lz = (x - cx) * sr + (z - cz) * cr
    top = sstep(0.5, 0.8, N[:, 1])
    m = np.ones((len(x), 3))
    m *= _lerp3(0.75 * top, (0.80, 0.90, 1.06))                             # leached, dusty: toward the sand's hue under the same sun
    e = np.maximum(np.abs(lx) / 1.15, np.abs(lz) / 0.75) + 0.22 * fbm(x / 0.5, z / 0.5, 71, 3)
    over = sstep(0.62, 0.98, e) * top                                       # sand over the rim, in tongues
    m *= _lerp3(over, (1.10, 1.22, 1.38))
    for (o_, a_, sd) in ((0.25, 0.5, 72), (-0.42, -0.9, 73)):               # two joints
        d = (lx - o_) - a_ * lz + 0.07 * fbm(lz / 0.3, lx * 0 + 0.3, sd, 2)
        m *= (1.0 - 0.42 * np.exp(-(d / 0.030) ** 2) * top * (1.0 - over))[:, None]
    m *= (1.0 + 0.07 * top * (vnoise((lx + 0.35 * lz) / 0.07, lz / 0.9, 74) - 0.5) * 2 * (1.0 - over))[:, None]      # the broom
    return m


# ---------------------------------------------------------------------------------------------------- the drum
def paint_ceramic(P, N, centre, radius):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    th = np.arctan2(z - centre[1], x - centre[0]); s = th * radius
    m = np.ones((len(x), 3))
    # plates: a horizontal lap every 0.6 m with a row of rivets under it, vertical laps every 1.2 m of arc, staggered
    row = np.floor(y / 0.6); fy = y - row * 0.6
    lap = np.exp(-((fy - 0.02) / 0.035) ** 2)
    m *= (1.0 - 0.34 * lap)[:, None]; m *= (1.0 + 0.10 * np.exp(-((fy - 0.11) / 0.05) ** 2))[:, None]
    so = s + (row % 2) * 0.6
    col = np.floor(so / 1.2); fs = so - col * 1.2
    m *= (1.0 - 0.26 * np.exp(-((fs - 0.02) / 0.035) ** 2))[:, None]
    riv = np.exp(-(((s / 0.3) - np.round(s / 0.3)) * 0.3 / 0.04) ** 2) * np.exp(-((fy - 0.11) / 0.04) ** 2)
    rivv = np.exp(-(((y / 0.3) - np.round(y / 0.3)) * 0.3 / 0.04) ** 2) * np.exp(-((fs - 0.10) / 0.04) ** 2)
    m *= (1.0 - 0.48 * np.maximum(riv, rivv))[:, None]
    m *= (1.0 + 0.14 * (_hash(col, row, 81) - 0.5) * 2)[:, None]                                          # each plate its own enamel
    # weeps under the laps: rust that ran down from a rivet row, strongest under the band at 1.2 m
    wp = sstep(0.62, 0.86, vnoise(s / 0.13, row * 3.1, 82)) * (1.0 - fy / 0.6) ** 1.5 * (0.35 + 0.65 * (row == 1) + 0.3 * (row >= 4))
    m *= _lerp3(0.9 * wp, (1.18, 0.66, 0.40))
    # the rust skirt: ragged, to a knee's height
    rag = 0.35 * fbm(s / 0.9, y * 0 + 0.4, 83, 3)
    sk = 1.0 - sstep(0.35 + rag * 0.4, 1.25 + rag, y)
    m *= _lerp3(0.85 * sk * (0.6 + 0.4 * vnoise(s / 0.2, y / 0.2, 84)), (1.22, 0.70, 0.40))
    # the wrong-coloured water: one long green-white mineral streak under the tap on the yard's side (it faces the gate)
    d = (th - math.radians(-28.0)) * radius
    wet = np.exp(-(d / (0.10 + 0.16 * sstep(1.9, 0.2, y))) ** 2) * sstep(1.95, 1.75, y) * (0.7 + 0.3 * vnoise(d / 0.05, y / 0.6, 85))
    m *= _lerp3(0.55 * wet, (0.62, 1.02, 0.92))
    m *= _lerp3(0.35 * np.exp(-(d / 0.035) ** 2) * sstep(1.95, 1.75, y), (1.25, 1.3, 1.2))
    return m


# ---------------------------------------------------------------------------------------------------- timber
def paint_timber(P, N, y_top):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    u = x * N[:, 2] - z * N[:, 0]
    m = np.ones((len(x), 3))
    m *= (1.0 + 0.07 * fbm(u / 1.3, y / 2.8, 91, 2))[:, None]
    m *= _lerp3(0.20 * (1.0 - sstep(0.1, 0.55 + 0.2 * fbm(u / 0.9, y * 0, 92, 2), y)), (0.72, 0.74, 0.82))       # damp at the foot
    hang = 1.0 - sstep(0.1, 1.6, y_top - y)
    m *= _lerp3(0.16 * hang * sstep(0.5, 0.8, vnoise(u / 0.14, y / 3.0, 93)), (0.80, 0.82, 0.86))                # rain from the eave
    return m


# ---------------------------------------------------------------------------------------------------- the lightmap
def apply(S, img, base_density=16.0):
    """Multiply the baked light of every wall chart of `img` (a float Blender image) by its weather. Returns the texels
    painted per kind."""
    W, H = img.size
    px = bake.pixels(img).copy()
    pos, nrm, cid, n_tri = texel_map(S, W, H)
    names = chart_names()
    dens = {c["id"]: c["density"] for c in kit.CHARTS.values()}
    done = {}
    drum_c = None
    try:
        import street_yard
        drum_c = (tuple(street_yard.C), float(street_yard.R))
    except Exception as e:                                                # noqa: BLE001  (the drum is the only chart that needs them)
        print("WALL PAINT: no drum centre:", e)
    for c in np.unique(cid):
        if c == 0: continue
        name = names.get(int(c)); kind = kind_of(name)
        if kind is None: continue
        m = cid == c
        P = pos[m].astype(np.float64); N = nrm[m].astype(np.float64)
        y_top = float(P[:, 1].max())
        if kind == "adobe": k = paint_adobe(P, N, dens.get(int(c), 1.0) * base_density >= 12.0, y_top)
        elif kind == "rock":
            k = paint_rock(P, N)
            if name.startswith("lip_shelf"): k = k * paint_shelf(P, N)
        elif kind == "timber": k = paint_timber(P, N, y_top)
        elif kind == "ceramic":
            if drum_c is None: continue
            k = paint_ceramic(P, N, drum_c[0], drum_c[1])
        if kind != "rock":
            wall = (np.abs(N[:, 1]) < GROUND_NY)[:, None]                 # a wall's own top or a sand wedge in its chart is left alone
            k = np.where(wall, k, 1.0)
        # pass i3 (both visual reviewers: the adobe walls "are broad single-tone planes", the gully's rock "big flat faces", the
        # tank wall "near-blank with faint panel lines"): every weather term at GAIN times its own strength about 1
        k = 1.0 + (k - 1.0) * GAIN[kind]
        sub = px[m]; sub[:, :3] *= np.clip(k, 0.34, 1.8).astype(np.float32); px[m] = sub
        done[kind] = done.get(kind, 0) + int(m.sum())
    img.pixels.foreach_set(px.ravel())
    print("WALL PAINT:", ", ".join(f"{done[k]} texels of {k}" for k in sorted(done)), f"({n_tri} triangles rasterised)")
    return done
