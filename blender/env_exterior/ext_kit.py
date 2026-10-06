"""ext_kit: the modelling kit of art-env-exterior (helper module: imported by surface_common, env_far_rim and the
backdrops; the build driver tracks it through <raw>.deps.json).

Everything here is authored in GAME space (x east, y up, z south; metres) and converted once, in `Part.realize`
(game (x, y, z) -> Blender (x, -z, y): a rotation, so winding is kept). A `Part` is a bag of polygons with, per face:
a material name, UV0 per corner (already pointing at the shared texture), a base tint, and optionally a lightmap chart
with metric chart coordinates per corner. `realize` paints the tint (height ramp, dust skirt, bleach, per-face jitter:
ART_BIBLE 4.5), cuts the faces at the zone's chunk planes, sorts them into chunks and writes one Blender object per
(chunk, lightmapped | vertex-lit). `pack_charts` then lays every chart of every object into ONE atlas by pure
arithmetic (no smart_project: same input, same atlas in every process, and the texel density is chosen, not found).
"""
import bpy, bmesh, math, random
import numpy as np
from mathutils import Vector
from lib import manifest, layout, material, uv as uvl, vcol, bake
from lib.scene import link

FT = "tx_frontier_trim"
PT = "tx_pellam_trim"
ST_LAYER = "lm_st"            # temporary UV layer: metric chart coordinates (removed by pack_charts)
CHART_ATTR = "ks_chart"       # per-face int: chart number (0 = vertex-lit)
SHEET = {"m_frontier": FT, "m_pellam": PT}
SNAP = 256.0                  # vertex positions are snapped to 1 / 256 m: float32 positions then compress far better (meshopt)


# ------------------------------------------------------------------ small maths
def lin(c):
    """palette name | '#RRGGBB' | (r, g, b) linear -> linear (r, g, b)."""
    return tuple(float(x) for x in vcol.rgb(c))


def mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(len(a)))


def mul(a, k):
    return tuple(x * k for x in a)


def clamp(x, a=0.0, b=1.0):
    return a if x < a else (b if x > b else x)


def smooth(t):
    t = clamp(t)
    return t * t * (3 - 2 * t)


def _h(ix, iy, seed):
    n = (ix * 374761393 + iy * 668265263 + seed * 2147483647) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    n = (n ^ (n >> 16)) & 0xFFFFFFFF
    return n / 4294967295.0


def vnoise(x, y, seed=0):
    """Smooth value noise in [0, 1]."""
    ix = math.floor(x); iy = math.floor(y)
    fx = x - ix; fy = y - iy
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy)
    a = _h(ix, iy, seed); b = _h(ix + 1, iy, seed); c = _h(ix, iy + 1, seed); d = _h(ix + 1, iy + 1, seed)
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy


def fbm(x, y, seed=0, octaves=3):
    """Fractal value noise, roughly in [-1, 1]."""
    s = 0.0; a = 1.0; t = 0.0
    for o in range(octaves):
        s += (vnoise(x, y, seed + 17 * o) - 0.5) * 2 * a; t += a
        x *= 2.03; y *= 2.03; a *= 0.5
    return s / t


def vsub(a, b): return (a[0] - b[0], a[1] - b[1], a[2] - b[2])
def vadd(a, b): return (a[0] + b[0], a[1] + b[1], a[2] + b[2])
def vscale(a, k): return (a[0] * k, a[1] * k, a[2] * k)
def vdot(a, b): return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
def vcross(a, b): return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
def vlen(a): return math.sqrt(vdot(a, a))


def vnorm(a):
    l = vlen(a)
    return (a[0] / l, a[1] / l, a[2] / l) if l > 1e-12 else (0.0, 1.0, 0.0)


def rot_y(p, deg, about=(0.0, 0.0, 0.0)):
    """Rotate game point p about the vertical through `about` by layout rotY degrees (three.js sense)."""
    r = math.radians(deg); c = math.cos(r); s = math.sin(r)
    x = p[0] - about[0]; z = p[2] - about[2]
    return (about[0] + x * c + z * s, p[1], about[2] - x * s + z * c)


# ------------------------------------------------------------------ shared-texture UVs
def row_v(sheet, region, inset=0.5):
    return manifest.trim_v(sheet, region, inset)


def row_uv(sheet, region, u_m, t, inset=0.5, repeat=None):
    """UV0 on a trim row: u_m metres along the row, t in 0..1 across it (0 = the row's lower edge)."""
    reg = manifest.trim_region(sheet, region)
    v0, v1 = manifest.trim_v(sheet, region, inset)
    return (u_m / (repeat or reg["metres_u"]), v0 + (v1 - v0) * clamp(t))


def flat_uv(mat):
    return manifest.trim_flat_uv(SHEET[mat])


def sand_uv(p):
    """m_sand: world planar, 4 m per repeat, +V north (uv.map_planar_world)."""
    return (p[0] / 4.0, -p[2] / 4.0)


def tri(h, period=3.0):
    """Triangle wave 0..1..0 of height: the strata row mapped by height without a seam."""
    t = (h / period) % 2.0
    return t if t <= 1.0 else 2.0 - t


# ------------------------------------------------------------------ charts
CHARTS = {}      # name -> {"id": n, "density": weight}


def chart(name, density=1.0):
    """Register (or fetch) a lightmap chart. `density` weights its texel density against the atlas' base density."""
    c = CHARTS.get(name)
    if c is None:
        c = {"id": len(CHARTS) + 1, "density": float(density), "name": name}
        CHARTS[name] = c
    return name


def reset_charts():
    CHARTS.clear()


# ------------------------------------------------------------------ Part
class Part:
    """Polygons in game space. paint: None (cols are final) or a dict:
         ground   callable(x, z) -> y of the ground under a point, or a float (default 0)
         dust     0..1 strength of the dust skirt (bottom `dust_h` m toward sand)        [0.6 outdoors]
         grad     (bottom, top) value ramp over `grad_h` metres above the ground
         bleach   (colour, amount): up-facing faces and the top of the part go toward it
         jitter   +- per-face value jitter (0.06 Frontier, 0 Pellam)
    """
    def __init__(self, name, zone, chunk=None, smooth=None, paint=None, seed=1):
        self.name = name; self.zone = zone; self.chunk = chunk; self.smooth = smooth
        self.paint = paint; self.seed = seed
        self.v = []; self.f = []
        self._weld = {}

    def vert(self, p, weld=False):
        if weld:
            k = (round(p[0], 4), round(p[1], 4), round(p[2], 4))
            i = self._weld.get(k)
            if i is None:
                i = len(self.v); self.v.append((float(p[0]), float(p[1]), float(p[2]))); self._weld[k] = i
            return i
        self.v.append((float(p[0]), float(p[1]), float(p[2])))
        return len(self.v) - 1

    def face(self, idx, mat, uv0, col, chart=None, st=None, final=False):
        """idx: vertex indices (counter-clockwise seen from outside); uv0: one UV or one per corner; col: one linear rgb
        or one per corner; chart + st (metres per corner): lightmapped; final=True: `col` is not painted again."""
        n = len(idx)
        if not isinstance(uv0[0], (tuple, list)): uv0 = [uv0] * n
        if not isinstance(col[0], (tuple, list)): col = [col] * n
        if chart is not None and st is None: raise ValueError("a charted face needs st")
        self.f.append((tuple(idx), mat, list(uv0), [tuple(c[:3]) for c in col], chart, None if st is None else list(st), final))

    def poly(self, pts, mat, uv0, col, chart=None, st=None, final=False, weld=False):
        self.face([self.vert(p, weld) for p in pts], mat, uv0, col, chart, st, final)

    def tris(self):
        return sum(len(f[0]) - 2 for f in self.f)

    def extend(self, other):
        o = len(self.v); self.v.extend(other.v)
        for (idx, mat, uv0, col, ch, st, fin) in other.f:
            self.f.append((tuple(i + o for i in idx), mat, uv0, col, ch, st, fin))

    def transform(self, fn, start=0):
        """Apply fn(p) -> p to every vertex from index `start` (lean, shear, placement)."""
        for i in range(start, len(self.v)): self.v[i] = tuple(float(c) for c in fn(self.v[i]))


def _painted(part):
    """Per-face per-corner final colours (linear)."""
    out = []
    p = part.paint
    rng = random.Random(part.seed * 7919 + 13)
    sand = lin("sand")
    for (idx, mat, uv0, col, ch, st, fin) in part.f:
        if p is None or fin:
            out.append(col); continue
        pts = [part.v[i] for i in idx]
        n = (0.0, 1.0, 0.0)
        if len(pts) >= 3:
            nn = (0.0, 0.0, 0.0)
            for k in range(len(pts)):                               # Newell
                a = pts[k]; b = pts[(k + 1) % len(pts)]
                nn = (nn[0] + (a[1] - b[1]) * (a[2] + b[2]), nn[1] + (a[2] - b[2]) * (a[0] + b[0]), nn[2] + (a[0] - b[0]) * (a[1] + b[1]))
            n = vnorm(nn)
        g = p.get("ground", 0.0)
        dust = p.get("dust", 0.6); dust_h = p.get("dust_h", 0.6)
        g0, g1 = p.get("grad", (0.8, 1.08)); gh = p.get("grad_h", 4.0)
        bleach = p.get("bleach"); jit = p.get("jitter", 0.06)
        j = 1.0 + (rng.random() - 0.5) * 2 * jit if jit > 0 else 1.0
        cc = []
        for k, q in enumerate(pts):
            gy = g(q[0], q[2]) if callable(g) else g
            h = q[1] - gy
            c = col[k]
            c = mul(c, (g0 + (g1 - g0) * clamp(h / gh)) * j)
            if bleach is not None:
                amt = bleach[1] * (0.9 * clamp(n[1]) + 0.35 * clamp((h - 0.75 * gh) / (0.5 * gh)))
                if amt > 0: c = mix(c, mul(lin(bleach[0]), j), clamp(amt))
            if dust > 0:
                kk = dust * clamp(1.0 - h / dust_h) ** 1.5
                if kk > 0: c = mix(c, sand, kk)
            cc.append(tuple(clamp(x) for x in c))
        out.append(cc)
    return out


# ------------------------------------------------------------------ chunks
ZONE_ASSET = {"lip": "env_the_lip", "street": "env_plenty_street", "rim": "env_far_rim"}
ZONE_ID = {"lip": "the_lip", "street": "plenty_street", "rim": "far_rim"}
PLANES = {"lip": [(2, 30.0), (2, 54.0)], "street": [(0, -37.0), (0, -80.0)], "rim": []}     # (game axis, value)
HIGH_MARGIN = 3.02
_pg_cache = {}


def path_ground(zone, x, z):
    k = (zone, round(x, 2), round(z, 2))
    v = _pg_cache.get(k)
    if v is None:
        v = layout.path_ground(ZONE_ID[zone], x, z); _pg_cache[k] = v
    return v


def chunk_of(zone, pts, mat):
    """The chunk of a face (game-space corner points) by this piece's rule (the manifest's plan, ARCHITECTURE 7.5)."""
    if zone == "rim": return "chunk_rim_ledge"
    cx = sum(p[0] for p in pts) / len(pts); cz = sum(p[2] for p in pts) / len(pts)
    if zone == "lip":
        if mat in ("m_frontier", "m_pellam") and all(p[1] >= path_ground(zone, p[0], p[2]) + HIGH_MARGIN for p in pts): return "chunk_lip_rock"
        return "chunk_lip_upper" if cz >= 54.0 else ("chunk_lip_mid" if cz >= 30.0 else "chunk_lip_gate")
    return "chunk_st_east" if cx > -37.0 else ("chunk_st_west" if cx > -80.0 else "chunk_st_yard")


_ALLOWED = {}


def allowed(zone, chunk):
    key = (zone, chunk)
    if key not in _ALLOWED:
        a = manifest.asset(ZONE_ASSET[zone])
        _ALLOWED[key] = next(c["materials"] for c in a["chunks"] if c["id"] == chunk)
    return _ALLOWED[key]


def _to_b(p): return (p[0], -p[2], p[1])


def realize(part):
    """Part -> Blender mesh objects, one per (chunk, lightmapped / vertex-lit). Returns the list."""
    if not part.f: return []
    cols = _painted(part)
    bm = bmesh.new()
    uv0 = bm.loops.layers.uv.new("UVMap"); stl = bm.loops.layers.uv.new(ST_LAYER)
    cl = bm.loops.layers.float_color.new("Color")
    chl = bm.faces.layers.int.new(CHART_ATTR); ml = bm.faces.layers.int.new("ks_mat"); hl = bm.faces.layers.int.new("ks_high")
    mats = []
    vs = [bm.verts.new(_to_b(p)) for p in part.v]
    for fi, (idx, mat, u0, col, ch, st, fin) in enumerate(part.f):
        try: f = bm.faces.new([vs[i] for i in idx])
        except ValueError: continue                                  # a duplicate face
        if mat not in mats: mats.append(mat)
        f[ml] = mats.index(mat); f[chl] = CHARTS[ch]["id"] if ch is not None else 0
        f.smooth = part.smooth is not None
        high = 0
        if part.zone == "lip" and part.chunk is None and mat in ("m_frontier", "m_pellam"):
            high = 1 if all(part.v[i][1] >= path_ground("lip", part.v[i][0], part.v[i][2]) + HIGH_MARGIN for i in idx) else 0
        f[hl] = high
        for k, l in enumerate(f.loops):
            l[uv0].uv = u0[k]; l[stl].uv = st[k] if st is not None else (0.0, 0.0)
            c = cols[fi][k]; l[cl] = (c[0], c[1], c[2], 1.0)
    for v in [v for v in bm.verts if not v.link_faces]: bm.verts.remove(v)
    # cut at the chunk planes (not the skyline faces, not a part forced into one chunk)
    if part.chunk is None:
        for axis, value in PLANES[part.zone]:
            co = [0.0, 0.0, 0.0]; no = [0.0, 0.0, 0.0]; co[axis] = value; no[axis] = 1.0
            fs = [f for f in bm.faces if f[hl] == 0]
            if not fs: continue
            lo = min(layout.to_game(v.co)[axis] for f in fs for v in f.verts); hi = max(layout.to_game(v.co)[axis] for f in fs for v in f.verts)
            if not (lo + 1e-4 < value < hi - 1e-4): continue
            es = {e for f in fs for e in f.edges}; vv = {v for f in fs for v in f.verts}
            bmesh.ops.bisect_plane(bm, geom=list(vv) + list(es) + fs, plane_co=layout.to_blender(co), plane_no=layout.to_blender(no))
    bm.verts.index_update(); bm.faces.index_update()
    bm.faces.ensure_lookup_table(); bm.verts.ensure_lookup_table()
    buckets = {}
    for f in bm.faces:
        mat = mats[f[ml]]
        if part.chunk is not None: ch = part.chunk
        elif f[hl]: ch = "chunk_lip_rock"
        else: ch = chunk_of(part.zone, [layout.to_game(v.co) for v in f.verts], "m_sand")     # never 'high' here
        buckets.setdefault((ch, f[chl] != 0), []).append(f)
    out = []
    for (ch, lm) in sorted(buckets):
        fs = buckets[(ch, lm)]
        ok = allowed(part.zone, ch)
        verts = {}; pv = []; pf = []
        for f in fs:
            ii = []
            for v in f.verts:
                if v.index not in verts: verts[v.index] = len(pv); pv.append(tuple(round(c * SNAP) / SNAP for c in v.co))
                ii.append(verts[v.index])
            pf.append(ii)
        me = bpy.data.meshes.new("me_" + part.name)
        me.from_pydata(pv, [], pf)
        nl = sum(len(p) for p in pf)
        u = np.zeros((nl, 2), np.float32); s = np.zeros((nl, 2), np.float32); c = np.ones((nl, 4), np.float32)
        charts = np.zeros(len(pf), np.int32); mi = np.zeros(len(pf), np.int32); sm = np.zeros(len(pf), bool)
        used = []
        k = 0
        for j, f in enumerate(fs):
            mat = mats[f[ml]]; fold = None
            if mat not in ok:                                         # e.g. the pylon mast in the skyline chunk: frontier, flat cell
                fold = next(m for m in ok if m in ("m_frontier", "m_pellam")); mat = fold
            if mat not in used: used.append(mat)
            mi[j] = used.index(mat); charts[j] = f[chl]; sm[j] = f.smooth
            k0 = k
            for l in f.loops:
                u[k] = flat_uv(fold) if fold else l[uv0].uv
                s[k] = l[stl].uv; c[k] = l[cl]; k += 1
            if mat in ("m_frontier", "m_pellam") and not fold:
                # the trim rows tile in U: bring every face into 0..1 so the optimiser can store UV0 as 16-bit (a whole
                # number of repeats where the face allows it: no change in what is drawn)
                fu = u[k0:k, 0]
                lo = float(fu.min()); hi = float(fu.max()); span = hi - lo
                if span > 1.0: fu[:] = (fu - lo) / span
                elif math.floor(lo + 1e-5) == math.floor(hi - 1e-5) or hi - math.floor(lo + 1e-5) <= 1.0 + 1e-5: fu[:] = np.clip(fu - math.floor(lo + 1e-5), 0.0, 1.0)
                else: fu[:] = fu - lo + min(lo - math.floor(lo), 1.0 - span)
        for m in used: me.materials.append(material.game_material(m))
        me.polygons.foreach_set("material_index", mi)
        me.polygons.foreach_set("use_smooth", sm)
        l0 = me.uv_layers.new(name="UVMap"); l0.data.foreach_set("uv", u.ravel())
        l1 = me.uv_layers.new(name="UVLight"); l1.data.foreach_set("uv", np.zeros(nl * 2, np.float32))
        l2 = me.uv_layers.new(name=ST_LAYER); l2.data.foreach_set("uv", s.ravel())
        ca = me.color_attributes.new("Color", 'FLOAT_COLOR', 'CORNER'); ca.data.foreach_set("color", c.ravel())
        at = me.attributes.new(CHART_ATTR, 'INT', 'FACE'); at.data.foreach_set("value", charts)
        me.update()
        if part.smooth is not None: me.set_sharp_from_angle(angle=math.radians(part.smooth))
        me.uv_layers.active = me.uv_layers[0]
        me.color_attributes.active_color = me.color_attributes["Color"]
        me.color_attributes.render_color_index = 0
        ob = bpy.data.objects.new(f"{part.name}__{ch.split('_', 1)[1]}_{'lm' if lm else 'vl'}", me); link(ob)
        ob["chunk"] = ch; ob["kzone"] = part.zone; ob["klm"] = bool(lm)
        out.append(ob)
    bm.free()
    return out


# ------------------------------------------------------------------ the atlas
def pack_charts(objs, lm_id, target=16.0, margin=5, top_reserve=20):
    """Lay every chart of `objs` into the atlas of lightmap `lm_id` and write UV1 ("UVLight"); faces without a chart go
    to the neutral texel. Shelf packing of the charts' bounding boxes at `density x s` texels per metre, s the largest
    value up to `target` that fits. Pure arithmetic on the charts' metric coordinates: identical in every process.
    Returns (s, used fraction, [(name, w_px, h_px)])."""
    res = manifest.texture(lm_id)["size"][0]
    neutral = bake.neutral_uv(lm_id)
    by_id = {c["id"]: c for c in CHARTS.values()}
    box = {}
    data = []
    for ob in objs:
        me = ob.data
        if ST_LAYER not in me.uv_layers:
            data.append((ob, None, None)); continue
        st = uvl.get(ob, ST_LAYER)
        ch = np.zeros(len(me.polygons), np.int32); me.attributes[CHART_ATTR].data.foreach_get("value", ch)
        lt = np.empty(len(me.polygons), np.int32); me.polygons.foreach_get("loop_total", lt)
        lc = np.repeat(ch, lt)
        data.append((ob, st, lc))
        for cid in np.unique(lc):
            if cid == 0: continue
            m = lc == cid
            lo = st[m].min(axis=0); hi = st[m].max(axis=0)
            b = box.get(int(cid))
            box[int(cid)] = (lo, hi) if b is None else (np.minimum(b[0], lo), np.maximum(b[1], hi))
    order = sorted(box, key=lambda cid: (-min(box[cid][1][0] - box[cid][0][0], box[cid][1][1] - box[cid][0][1]) * by_id[cid]["density"], by_id[cid]["name"]))

    def layout_at(s):
        x = 0; y = 0; shelf = 0; place = {}
        for cid in order:
            lo, hi = box[cid]; d = by_id[cid]["density"] * s
            w = (hi[0] - lo[0]) * d; h = (hi[1] - lo[1]) * d
            rot = h > w
            if rot: w, h = h, w
            pw = int(math.ceil(w)) + 2 * margin; ph = int(math.ceil(h)) + 2 * margin
            if pw > res: return None
            if x + pw > res: x = 0; y += shelf; shelf = 0
            if y + ph > res - top_reserve: return None
            place[cid] = (x + margin, y + margin, rot, d); x += pw; shelf = max(shelf, ph)
        return place, y + shelf

    lo_s, hi_s = 0.25, target
    best = layout_at(hi_s)
    if best is None:
        for _ in range(28):
            mid = (lo_s + hi_s) / 2
            if layout_at(mid) is None: hi_s = mid
            else: lo_s = mid
        best = layout_at(lo_s); s = lo_s
        if best is None: raise RuntimeError("pack_charts: the charts do not fit the atlas at any density")
    else: s = hi_s
    place, used_h = best
    for ob, st, lc in data:
        me = ob.data
        a = np.empty((len(me.loops), 2), np.float32); a[:] = neutral
        if st is not None:
            for cid in np.unique(lc):
                if cid == 0: continue
                m = lc == cid
                ox, oy, rot, d = place[int(cid)]; lo = box[int(cid)][0]
                p = (st[m] - lo) * d
                if rot: p = p[:, ::-1]
                a[m, 0] = (ox + p[:, 0]) / res; a[m, 1] = (oy + p[:, 1]) / res
            me.uv_layers.remove(me.uv_layers[ST_LAYER])
        uvl.put(ob, a, "UVLight")
        me.uv_layers.active = me.uv_layers[0]
    area = sum((box[c][1][0] - box[c][0][0]) * (box[c][1][1] - box[c][0][1]) * (by_id[c]["density"] * s) ** 2 for c in box)
    return s, area / (res * res), [(by_id[c]["name"], place[c]) for c in order]


# ------------------------------------------------------------------ generic builders
def planar_st(p, origin, ud, vd):
    d = vsub(p, origin)
    return (vdot(d, ud), vdot(d, vd))


def add_quad(part, pts, mat, uvs, col, chart=None, frame=None, final=False, weld=False):
    """A polygon; when charted, `frame` = (origin, udir, vdir) projects its corners into the chart (metres)."""
    st = [planar_st(p, *frame) for p in pts] if chart is not None else None
    part.poly(pts, mat, uvs, col, chart, st, final, weld)


def box_pts(c, size, rot=0.0, lean=(0.0, 0.0)):
    """The 8 corners of a box (centre c, full size, rotY degrees): bottom 4 then top 4, counter-clockwise from above
    starting at (-x, -z). lean = (dx, dz) shift of the top."""
    hx, hy, hz = size[0] / 2, size[1] / 2, size[2] / 2
    out = []
    for y, sh in ((-hy, (0.0, 0.0)), (hy, lean)):
        for sx, sz in ((-1, -1), (-1, 1), (1, 1), (1, -1)):
            p = rot_y((c[0] + sx * hx, c[1] + y, c[2] + sz * hz), rot, c)
            out.append((p[0] + sh[0], p[1], p[2] + sh[1]))
    return out


def add_box(part, c, size, mat, col, rot=0.0, uv=None, sides="nsewtb", row=None, chart=None, lean=(0.0, 0.0), taper=0.0, final=False, u_shift=0.0):
    """A plain box. sides: which faces to build (w -x, e +x, n -z, s +z, t top, b bottom). uv: one UV0 for all (flat
    cell), or `row` = (sheet, region, lengthwise: 'x'|'y'|'z') maps every side onto a trim row with U along that axis.
    chart: every face gets its own planar frame in that chart family (name + side letter)."""
    P = box_pts(c, size, rot, lean)
    if taper:
        for i in range(4, 8):
            P[i] = (c[0] + (P[i][0] - c[0] - lean[0]) * (1 - taper) + lean[0], P[i][1], c[2] + (P[i][2] - c[2] - lean[1]) * (1 - taper) + lean[1])
    faces = {"w": (0, 1, 5, 4), "s": (1, 2, 6, 5), "e": (2, 3, 7, 6), "n": (3, 0, 4, 7), "t": (4, 5, 6, 7), "b": (3, 2, 1, 0)}
    for s in sides:
        q = [P[i] for i in faces[s]]
        if row is not None:
            sheet, region, axis = row
            ax = {"x": 0, "y": 1, "z": 2}[axis]
            # U along `axis`, V across: the other in-plane direction
            e1 = vsub(q[1], q[0]); e2 = vsub(q[3], q[0])
            along = e1 if abs(e1[ax]) >= abs(e2[ax]) else e2
            across = e2 if along is e1 else e1
            la = vlen(along); lc = vlen(across)
            if la < 1e-6 or lc < 1e-6: continue
            ua = vnorm(along); uc = vnorm(across)
            uvs = [row_uv(sheet, region, vdot(vsub(p, q[0]), ua) + u_shift, vdot(vsub(p, q[0]), uc) / lc) for p in q]
        else: uvs = uv if uv is not None else flat_uv(mat)
        ch = None; st = None
        if chart is not None:
            ch = chart if isinstance(chart, str) else chart.get(s)
            if ch is not None:
                e1 = vnorm(vsub(q[1], q[0])); nn = vnorm(vcross(vsub(q[1], q[0]), vsub(q[3], q[0]))); e2 = vcross(nn, e1)
                off = "nsewtb".index(s) * 1000.0                    # one chart, six separated islands
                st = [(vdot(vsub(p, q[0]), e1) + off, vdot(vsub(p, q[0]), e2)) for p in q]
        part.poly(q, mat, uvs, col, ch, st, final)


def add_prism(part, a, b, w, d, mat, col, row=None, chamfer=0.0, taper=0.0, up=(0.0, 1.0, 0.0), caps="", u_shift=0.0, segs=1, final=False):
    """A beam / post from a to b with a w x d section (w along `side`, d along the other), chamfered corners (an
    octagon section when chamfer > 0) and optional taper toward b. row = (sheet, region): U along the beam. segs: edge
    loops along it (vertex light needs vertices)."""
    ax = vsub(b, a); L = vlen(ax)
    if L < 1e-6: return
    t = vnorm(ax)
    side = vcross(t, up)
    if vlen(side) < 1e-3: side = vcross(t, (1.0, 0.0, 0.0))
    side = vnorm(side); fwd = vnorm(vcross(side, t))
    hw, hd = w / 2, d / 2; c = min(chamfer, hw * 0.45, hd * 0.45)
    if c > 0: prof = [(-hw + c, -hd), (hw - c, -hd), (hw, -hd + c), (hw, hd - c), (hw - c, hd), (-hw + c, hd), (-hw, hd - c), (-hw, -hd + c)]
    else: prof = [(-hw, -hd), (hw, -hd), (hw, hd), (-hw, hd)]
    rings = []
    for k in range(segs + 1):
        f = k / segs; sc = 1.0 - taper * f
        o = vadd(a, vscale(ax, f))
        rings.append([part.vert(vadd(o, vadd(vscale(side, x * sc), vscale(fwd, y * sc)))) for (x, y) in prof])
    n = len(prof)
    per = [0.0]
    for i in range(n):
        j = (i + 1) % n
        per.append(per[-1] + math.hypot(prof[j][0] - prof[i][0], prof[j][1] - prof[i][1]))
    for k in range(segs):
        for i in range(n):
            j = (i + 1) % n
            idx = (rings[k][j], rings[k][i], rings[k + 1][i], rings[k + 1][j])
            if row is not None:
                u0 = L * k / segs + u_shift; u1 = L * (k + 1) / segs + u_shift
                big = (per[i + 1] - per[i]) > c * 1.5
                t0, t1 = (0.0, 1.0) if big else (0.0, 0.12)
                uvs = [row_uv(row[0], row[1], u0, t1), row_uv(row[0], row[1], u0, t0), row_uv(row[0], row[1], u1, t0), row_uv(row[0], row[1], u1, t1)]
            else: uvs = flat_uv(mat)
            part.face(idx, mat, uvs, col, final=final)
    if "a" in caps: part.face(tuple(rings[0]), mat, flat_uv(mat) if row is None else row_uv(FT, "plank_end", 0.1, 0.5), col, final=final)
    if "b" in caps: part.face(tuple(reversed(rings[-1])), mat, flat_uv(mat) if row is None else row_uv(FT, "plank_end", 0.1, 0.5), col, final=final)


def add_cyl(part, c, r, h, mat, col, segs=12, r_top=None, cap_top=True, cap_bottom=False, rows=1, uv=None, final=False, lean=(0.0, 0.0)):
    """A vertical cylinder / frustum standing on c (base centre)."""
    rt = r if r_top is None else r_top
    rings = []
    for k in range(rows + 1):
        f = k / rows; rr = r + (rt - r) * f
        rings.append([part.vert((c[0] + math.cos(2 * math.pi * i / segs) * rr + lean[0] * f, c[1] + h * f, c[2] + math.sin(2 * math.pi * i / segs) * rr + lean[1] * f)) for i in range(segs)])
    u = uv if uv is not None else flat_uv(mat)
    for k in range(rows):
        for i in range(segs):
            j = (i + 1) % segs
            part.face((rings[k][i], rings[k + 1][i], rings[k + 1][j], rings[k][j]), mat, u, col, final=final)
    if cap_top: part.face(tuple(reversed(rings[-1])), mat, u, col, final=final)
    if cap_bottom: part.face(tuple(rings[0]), mat, u, col, final=final)


def tessellate(part, max_edge, start_face=0):
    """Split the quads / triangles of `part` (from face index start_face) so no edge is longer than max_edge: vertex
    light needs vertices. Quads are split along their long direction first; UV0, colours and chart coordinates are
    interpolated."""
    work = part.f[start_face:]; del part.f[start_face:]
    out = []
    guard = 0
    while work:
        f = work.pop(); guard += 1
        idx, mat, uv0, col, ch, st, fin = f
        n = len(idx)
        if n not in (3, 4) or guard > 400000: out.append(f); continue
        P = [part.v[i] for i in idx]
        L = [vlen(vsub(P[(k + 1) % n], P[k])) for k in range(n)]
        if max(L) <= max_edge: out.append(f); continue

        def midp(k):
            j = (k + 1) % n
            m = part.vert(vscale(vadd(P[k], P[j]), 0.5), weld=True)
            return m, mix(uv0[k], uv0[j], 0.5), mix(col[k], col[j], 0.5), (mix(st[k], st[j], 0.5) if st is not None else None)

        if n == 4:
            a = 0 if max(L[0], L[2]) >= max(L[1], L[3]) else 1          # split edges a and a+2
            m0 = midp(a); m1 = midp(a + 2)
            i = [(a + k) % 4 for k in range(4)]

            def mk(vi, uu, cc, ss):
                work.append((tuple(vi), mat, uu, cc, ch, ss if st is not None else None, fin))

            mk((idx[i[0]], m0[0], m1[0], idx[i[3]]), [uv0[i[0]], m0[1], m1[1], uv0[i[3]]], [col[i[0]], m0[2], m1[2], col[i[3]]],
               [st[i[0]], m0[3], m1[3], st[i[3]]] if st is not None else None)
            mk((m0[0], idx[i[1]], idx[i[2]], m1[0]), [m0[1], uv0[i[1]], uv0[i[2]], m1[1]], [m0[2], col[i[1]], col[i[2]], m1[2]],
               [m0[3], st[i[1]], st[i[2]], m1[3]] if st is not None else None)
        else:
            a = L.index(max(L)); b = (a + 1) % 3; c = (a + 2) % 3
            m = midp(a)
            work.append(((idx[a], m[0], idx[c]), mat, [uv0[a], m[1], uv0[c]], [col[a], m[2], col[c]], ch, [st[a], m[3], st[c]] if st is not None else None, fin))
            work.append(((m[0], idx[b], idx[c]), mat, [m[1], uv0[b], uv0[c]], [m[2], col[b], col[c]], ch, [m[3], st[b], st[c]] if st is not None else None, fin))
    part.f.extend(reversed(out))


def solid_part(part, s, mat, col, uv=None, chart=None, skip_bottom=True):
    """A layout solid as plain polygons (the day-one skeleton, and plugs)."""
    for k, f in enumerate(layout.solid_faces(s)):
        n = vnorm(vcross(vsub(f[1], f[0]), vsub(f[2], f[0])))
        if skip_bottom and n[1] < -0.9: continue
        ch = None; st = None
        if chart is not None and (chart is True or n[1] > 0.5):
            e1 = vnorm(vsub(f[1], f[0])); e2 = vcross(n, e1)
            ch = globals()["chart"](f"{s['id']}_{k}"); st = [(vdot(vsub(p, f[0]), e1), vdot(vsub(p, f[0]), e2)) for p in f]
        part.poly(f, mat, uv if uv is not None else ([sand_uv(p) for p in f] if mat == "m_sand" else flat_uv(mat)), col, ch, st)


def merge_corner_colours(objs, name="Color", tol=0.9995):
    """After a vertex-light bake: give every corner of a vertex that shares its shading normal the mean of their colours.
    Each corner is its own path-traced sample, so smooth-shaded neighbours come back a few percent apart; left alone
    that noise splits every vertex in the shipped file (and is noise). Hard edges keep their own values."""
    for ob in objs:
        me = ob.data
        if name not in me.color_attributes or not len(me.loops): continue
        col = vcol.get_colors(ob, name)
        nrm = np.empty(len(me.loops) * 3, np.float32); me.corner_normals.foreach_get("vector", nrm); nrm = nrm.reshape(-1, 3)
        vi = np.empty(len(me.loops), np.int32); me.loops.foreach_get("vertex_index", vi)
        key = np.concatenate([vi[:, None].astype(np.float64), np.round(nrm.astype(np.float64) * 32.0)], axis=1)
        _, inv = np.unique(key, axis=0, return_inverse=True)
        inv = inv.ravel()
        n = int(inv.max()) + 1
        acc = np.zeros((n, 4), np.float64); cnt = np.zeros(n, np.float64)
        np.add.at(acc, inv, col); np.add.at(cnt, inv, 1.0)
        vcol.set_colors(ob, (acc / cnt[:, None])[inv].astype(np.float32), name)
