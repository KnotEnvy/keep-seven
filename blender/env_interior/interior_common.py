"""Shared helpers of the four interior zones (art-env-interior). Imported by env_tally_house.py, env_the_gallery.py,
env_lift_hall.py, env_the_bore.py and env_lift_shaft.py (the build driver records it in <raw>.deps.json, so editing
this file makes all five stale).

Everything here takes GAME coordinates (+Y up, -Z north) and converts once (`B`), because every number of the work
order and of design/layout.json is game space.

Lighting model of an interior (ART_BIBLE 3.3-3.6; ARCHITECTURE 7.4):
    light = Cycles DIFFUSE (direct + indirect, no albedo) of the practicals   (lamp objects with a soft authored reach)
          + ambient colour x strength x AO                                    (the mood's "ambient at floor level")
The rooms are closed boxes, so a Cycles world light would never get in: the mood's ambient is added analytically,
times a long-range ambient-occlusion bake, to the lightmap texels and to the vertex light. An open stretch of floor
therefore reads the mood's ambient target exactly (measured and printed by every zone script: `probe`).
Lightmapped faces: COLOR_0 = tint x gradients; vertex-lit faces: COLOR_0 = tint x gradients x light / 2.

KS_Q=draft in the environment bakes at low sample counts (iteration); anything else is the final quality.
"""
import bpy, bmesh, math, os, time
import numpy as np
from mathutils import Vector, Matrix
from lib import scene, mesh, uv, material, vcol, bake, export, zone, layout, manifest

DRAFT = os.environ.get("KS_Q", "") == "draft"
PT, FT = "tx_pellam_trim", "tx_frontier_trim"
SHEET = manifest.SHEET_OF


def B(p):
    """Game (x, y, z) -> Blender Vector."""
    return Vector(layout.to_blender(p))


def Bd(d):
    """Game direction -> Blender Vector (same rotation as points)."""
    return Vector((d[0], -d[2], d[1]))


def lin(c):
    """Palette name / '#hex' / linear rgb -> numpy linear rgb."""
    return np.array(vcol.rgb(c), dtype=np.float32)


def mix(a, b, t):
    return lin(a) * (1.0 - t) + lin(b) * t


AMBIENT_GAIN = 0.30


def ambient(hex_colour, mult, gain=AMBIENT_GAIN):
    """The mood's ambient as the linear light an open floor receives (fix pass 1, critic round 1).
    The art bible writes it `#132547 x 0.30`. The first build read that as "the colour's hue with its brightest
    channel at 0.30", which lit every unlit wall to a saturated mid blue (enamel x 0.30 = sRGB 148 in blue) and left
    no dark band at all: gallery 12 : 49 : 39 against 10 : 30 : 60. The value structure of ART_BIBLE 2.3 is the
    measured definition of done and outranks the multiplier, so the hue is kept and the level is `mult x gain`
    (gain 0.30: the brightest channel of the gallery's ambient reads 0.09, pale enamel in open shade about
    sRGB (17, 34, 64): a dark blue close to the mood's own hex). Pools, streaks and practicals carry the mid band."""
    c = lin(hex_colour)
    return c / c.max() * mult * gain


def frange(a, b, step):
    """a, a+step, ... and exactly b at the end (cells never larger than step)."""
    n = max(1, int(math.ceil((b - a) / step - 1e-6)))
    return [a + (b - a) * i / n for i in range(n + 1)]


def cuts(a, b, step, extra=()):
    """Sorted cut positions from a to b no further apart than `step`, with every `extra` position inside included."""
    pts = [a, b] + [e for e in extra if a + 1e-6 < e < b - 1e-6]
    pts = sorted(set(round(p, 6) for p in pts))
    out = [pts[0]]
    for p in pts[1:]:
        seg = frange(out[-1], p, step)
        out.extend(seg[1:])
    return out


# ------------------------------------------------------------------ geometry
def surface(name, o, u, v, us, vs, mat="m_pellam", region="panel", tint="enamel", row=None, mpr=None, vbase=0.0,
            uoff=0.0, vrange=(0.0, 1.0), skip=None, lm=False, disp=None, cell=None, swap=False):
    """A connected grid surface: vertices at o + u * us[i] + v * vs[j] (GAME space; u, v unit vectors), visible from
    the side its normal u x v points to. UV0 goes onto ONE ROW of the material's trim sheet: U = distance along u /
    the row's repeat (+ uoff), V = the row used once per `row` metres of v (default: the row's natural height) counted
    from `vbase`, so `vs` must hold every course boundary. region 'flat' = the uniform cell. vrange = the share of the
    row's height used (to keep the adobe row's brick course out of upper courses).
      skip(uc, vc) -> True    leaves the cell out (openings);  disp(i, j, p) -> game offset added to a vertex (jitter)
      cell(i, j, uc, vc) -> dict(region=, uoff=, tint=, vrange=)   per-cell overrides (boards, missing modules)
      tint: palette name / rgb, or callable(p_game) -> rgb per corner
      swap=True: U runs along v and the rows are counted along u (boards running along v)
    lm=True marks the object as lightmapped (bake_zone)."""
    o = Vector(o); u = Vector(u); v = Vector(v)
    sheet = SHEET[mat]
    bm = mesh.new_bmesh(); uvl = bm.loops.layers.uv[0]
    cl = bm.loops.layers.float_color.new("Tint")
    grid = {}
    def vert(i, j):
        if (i, j) not in grid:
            p = o + u * us[i] + v * vs[j]
            if disp is not None: p = p + Vector(disp(i, j, p))
            grid[(i, j)] = (bm.verts.new(B(p)), p)
        return grid[(i, j)]
    regs = {}
    def reg(r):
        if r not in regs:
            if r == "flat": regs[r] = (None, manifest.trim_flat_uv(sheet))
            elif isinstance(r, tuple):                               # two adjacent rows used as one (upper, lower)
                ra = manifest.trim_region(sheet, r[0]); rb = manifest.trim_region(sheet, r[1])
                regs[r] = ({"metres_u": ra["metres_u"], "metres_v": ra["metres_v"] + rb["metres_v"]},
                           (manifest.trim_v(sheet, r[1])[0], manifest.trim_v(sheet, r[0])[1]))
            else:
                rr = manifest.trim_region(sheet, r); regs[r] = (rr, manifest.trim_v(sheet, r))
        return regs[r]
    const_tint = None if callable(tint) else lin(tint)
    for j in range(len(vs) - 1):
        for i in range(len(us) - 1):
            uc = (us[i] + us[i + 1]) / 2; vc = (vs[j] + vs[j + 1]) / 2
            if skip is not None and skip(uc, vc): continue
            ov = cell(i, j, uc, vc) if cell is not None else None
            r = (ov or {}).get("region", region); uo = (ov or {}).get("uoff", uoff); vr = (ov or {}).get("vrange", vrange)
            ct = (ov or {}).get("tint")
            rr, vv = reg(r)
            corners = [(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)]
            f = bm.faces.new([vert(*c)[0] for c in corners])
            for lp, (ci, cj) in zip(f.loops, corners):
                if rr is None: lp[uvl].uv = vv
                else:
                    along, across = (vs[cj], us[ci]) if swap else (us[ci], vs[cj])
                    lo, hi = (us[i], us[i + 1]) if swap else (vs[j], vs[j + 1])
                    rh = (ov or {}).get("row") or row or rr["metres_v"]; m = mpr or rr["metres_u"]
                    vb = (ov or {}).get("vbase", vbase)
                    k = math.floor((lo - vb) / rh + 1e-6)
                    fr = min(1.0, max(0.0, (across - vb) / rh - k))
                    fr = vr[0] + fr * (vr[1] - vr[0])
                    lp[uvl].uv = (along / m + uo, vv[0] + fr * (vv[1] - vv[0]))
                if ct is not None: c = lin(ct(grid[(ci, cj)][1]) if callable(ct) else ct)
                elif const_tint is not None: c = const_tint
                else: c = lin(tint(grid[(ci, cj)][1]))
                lp[cl] = (float(c[0]), float(c[1]), float(c[2]), 1.0)
    bm.normal_update()
    ob = mesh.new_mesh_object(name, bm)
    material.assign(ob, mat)
    for p in ob.data.polygons: p.use_smooth = True                    # one normal per vertex: the exporter can share them
    ob["lm"] = bool(lm)
    return ob


def box(name, lo, hi, mat="m_pellam", tint="enamel", region=None, bevel=0.02, drop="", lm=False, tess=None, rot_y=0.0,
        along='auto', fit='stretch', mpr=None):
    """A bevelled box from GAME corners lo / hi. drop = faces to delete, any of 'x- x+ y- y+ z- z+' (game axes: y- is
    the bottom). region None -> flat cell (colour only); else the trim row (uv.map_to_trim). rot_y = degrees about the
    box centre's vertical (layout rotY). tess = max edge length for vertex light."""
    c = [(lo[i] + hi[i]) / 2 for i in range(3)]; s = [abs(hi[i] - lo[i]) for i in range(3)]
    ob = mesh.box(name, layout.size_to_blender(s), (0, 0, 0))
    if drop:
        want = {"x-": Vector((-1, 0, 0)), "x+": Vector((1, 0, 0)), "y-": Vector((0, 0, -1)), "y+": Vector((0, 0, 1)),
                "z-": Vector((0, 1, 0)), "z+": Vector((0, -1, 0))}
        ds = [want[k] for k in drop.split()]
        mesh.delete_faces(ob, lambda f, cc, n: any(n.dot(d) > 0.9 for d in ds))
    if bevel > 0: mesh.finish(ob, bevel=bevel)
    else: mesh.finish(ob, bevel=0)
    ob.rotation_euler = (0, 0, math.radians(rot_y)); ob.location = B(c)
    mesh.apply_transform(ob)
    return dress(ob, mat, tint, region, lm, tess, along, fit, mpr)


def dress(ob, mat, tint, region=None, lm=False, tess=None, along='auto', fit='stretch', mpr=None, rng=None):
    """Material, UV0 (flat cell or a trim row), base tint, optional tessellation; marks lightmapped objects."""
    material.assign(ob, mat)
    if region is None: uv.map_flat(ob, SHEET[mat])
    elif isinstance(along, str): uv.map_to_trim(ob, None, SHEET[mat], region, metres_per_repeat=mpr, along=along, fit=fit, rng=rng)
    else:                                                              # a world direction: faces square to it fall back to 'auto'
        a = Vector(along).normalized()
        end = [p.index for p in ob.data.polygons if abs(p.normal.dot(a)) > 0.9]
        side = [p.index for p in ob.data.polygons if abs(p.normal.dot(a)) <= 0.9]
        if side: uv.map_to_trim(ob, side, SHEET[mat], region, metres_per_repeat=mpr, along=tuple(a), fit=fit, rng=rng, angle=25.0)
        if end: uv.map_to_trim(ob, end, SHEET[mat], region, metres_per_repeat=mpr, along='auto', fit=fit, rng=rng)
    vcol.tint(ob, tint if isinstance(tint, str) else tuple(float(x) for x in tint))
    if tess: mesh.tessellate_max_edge(ob, tess)
    ob["lm"] = bool(lm)
    return ob


def cyl(name, a, b, radius, segs=8, mat="m_pellam", tint="steel", region=None, radius_b=None, cap=True, lm=False, tess=None,
        smooth=60, keep=None, mpr=None):
    """A cylinder / frustum from GAME point a to b. keep(normal_blender) -> False deletes side faces nobody sees."""
    A = B(a); Bv = B(b); d = Bv - A; L = d.length
    rot = d.normalized().to_track_quat('Z', 'Y').to_matrix().to_4x4()
    ob = mesh.cylinder(name, radius, L, (0, 0, 0), segments=segs, radius_top=radius_b, cap=cap)
    ob.matrix_world = Matrix.Translation((A + Bv) / 2) @ rot
    mesh.apply_transform(ob)
    if keep is not None: mesh.delete_faces(ob, lambda f, c, n: not keep(n))
    mesh.finish(ob, bevel=0, smooth_angle=smooth)
    return dress(ob, mat, tint, region, lm, tess, along=tuple(d.normalized()) if region else 'auto', mpr=mpr)


def poly_prism(name, pts, y0, y1, mat="m_pellam", tint="enamel", region=None, bevel=0.02, lm=False, tess=None, drop_bottom=True,
               drop_top=False, smooth=35):
    """A vertical prism over the GAME plan polygon pts [(x, z), ...] from y0 to y1 (any winding)."""
    bm = mesh.new_bmesh()
    lo = [bm.verts.new(B((x, y0, z))) for x, z in pts]; hi = [bm.verts.new(B((x, y1, z))) for x, z in pts]
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    if not drop_top: bm.faces.new(hi)
    if not drop_bottom: bm.faces.new(list(reversed(lo)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    ob = mesh.new_mesh_object(name, bm)
    mesh.finish(ob, bevel=bevel, smooth_angle=smooth)
    return dress(ob, mat, tint, region, lm, tess)


def from_faces(name, faces, mat="m_pellam", tint="enamel", region=None, bevel=0.0, lm=False, tess=None, smooth=35, weld=True,
               along='auto', recalc=False, mpr=None, fit='stretch', away_from=None, toward=None):
    """A mesh from GAME-space polygons [[(x, y, z), ...], ...] wound counter-clockwise seen from the visible side.
    away_from / toward = a GAME point: every face is flipped, if needed, to look away from / toward it."""
    bm = mesh.new_bmesh(); cache = {}
    def vert(p):
        k = (round(p[0], 5), round(p[1], 5), round(p[2], 5))
        if not weld: return bm.verts.new(B(p))
        if k not in cache: cache[k] = bm.verts.new(B(p))
        return cache[k]
    for f in faces:
        vs = []
        for p in f:
            q = vert(p)
            if q not in vs: vs.append(q)
        if len(vs) < 3: continue
        try: bm.faces.new(vs)
        except ValueError: pass
    bm.normal_update()
    if away_from is not None or toward is not None:
        ref = B(away_from if away_from is not None else toward); sign = 1.0 if away_from is not None else -1.0
        for f in bm.faces:
            if f.normal.dot(f.calc_center_median() - ref) * sign < 0: f.normal_flip()
    if recalc: bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.normal_update()
    ob = mesh.new_mesh_object(name, bm)
    mesh.finish(ob, bevel=bevel, smooth_angle=smooth)
    return dress(ob, mat, tint, region, lm, tess, along=along, mpr=mpr, fit=fit)


def tube(name, pts, radius, segs=8, mat="m_pellam", tint="steel", region=None, cap=False, lm=False, tess=None, closed=False, mpr=None, smooth=60):
    """A round tube swept along GAME points `pts` (a polyline: elbows are drawn by sampling their arc). One ring per
    point, parallel-transported so it does not twist. radius = a number or one per point."""
    P = [B(p) for p in pts]; n = len(P)
    bm = mesh.new_bmesh(); rings = []
    t0 = (P[1] - P[0]).normalized()
    ref = Vector((0, 0, 1)) if abs(t0.z) < 0.9 else Vector((1, 0, 0))
    nrm = (ref - t0 * ref.dot(t0)).normalized()
    for i in range(n):
        if closed: t = (P[(i + 1) % n] - P[i - 1]).normalized()
        else: t = ((P[min(i + 1, n - 1)] - P[i]).normalized() + (P[i] - P[max(i - 1, 0)]).normalized() if 0 < i < n - 1 else (P[min(i + 1, n - 1)] - P[max(i - 1, 0)])).normalized()
        nrm = (nrm - t * nrm.dot(t)).normalized(); bn = t.cross(nrm)
        r = radius[i] if isinstance(radius, (list, tuple)) else radius
        if 0 < i < n - 1 and not closed:                                # mitre: keep the tube's true radius through a bend
            c = max(0.5, t.dot((P[i + 1] - P[i]).normalized())); r = r / c
        rings.append([bm.verts.new(P[i] + (nrm * math.cos(2 * math.pi * k / segs) + bn * math.sin(2 * math.pi * k / segs)) * r) for k in range(segs)])
    m = n if closed else n - 1
    for i in range(m):
        a, b = rings[i], rings[(i + 1) % n]
        for k in range(segs):
            j = (k + 1) % segs
            bm.faces.new((a[k], a[j], b[j], b[k]))
    if cap and not closed:
        bm.faces.new(list(reversed(rings[0]))); bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    ob = mesh.new_mesh_object(name, bm)
    mesh.finish(ob, bevel=0, smooth_angle=smooth)
    material.assign(ob, mat)
    if region is None: uv.map_flat(ob, SHEET[mat])
    else:                                                              # U along the run, V round the tube
        reg = manifest.trim_region(SHEET[mat], region); v0, v1 = manifest.trim_v(SHEET[mat], region); mp = mpr or reg["metres_u"]
        me = ob.data; a = uv.get(ob)
        dist = [0.0]
        for i in range(1, n): dist.append(dist[-1] + (P[i] - P[i - 1]).length)
        vid = {}
        for i, ring in enumerate(rings):
            pass
        co = [v.co.copy() for v in me.vertices]
        # vertex order = creation order: ring i, segment k -> index i * segs + k
        for poly in me.polygons:
            ids = list(poly.vertices)
            ks = [vi % segs for vi in ids]; wrap = max(ks) - min(ks) > segs / 2
            for li, vi in zip(range(poly.loop_start, poly.loop_start + poly.loop_total), ids):
                if vi >= n * segs: continue
                i, k = divmod(vi, segs)
                kk = k + segs if (wrap and k < segs / 2) else k
                a[li] = (dist[i] / mp, v0 + (v1 - v0) * (kk / segs))
        uv.put(ob, a)
    vcol.tint(ob, tint if isinstance(tint, str) else tuple(float(x) for x in tint))
    if tess: mesh.tessellate_max_edge(ob, tess)
    ob["lm"] = bool(lm)
    return ob


def arc3(c, a, b, n):
    """n + 1 GAME points on the circular arc with centre c from point a to point b (same radius, less than 180 degrees)."""
    C, A, Bp = Vector(c), Vector(a), Vector(b)
    u = A - C; w = Bp - C; r = u.length
    ang = u.angle(w); axis = u.cross(w).normalized()
    from mathutils import Quaternion
    return [tuple(C + Quaternion(axis, ang * i / n) @ u) for i in range(n + 1)]


def emis(name, polys, cell="aqua", intensity=1.0, flicker=0.0, fade=0.0):
    """Emissive faces that belong to a chunk's m_emis mesh (steady lamps drawn with the chunk, not a lamp set).
    polys = GAME polygons, counter-clockwise seen from the lit side."""
    bm = mesh.new_bmesh()
    for poly in polys: bm.faces.new([bm.verts.new(B(p)) for p in poly])
    ob = mesh.new_mesh_object(name, bm)
    material.assign(ob, "m_emis"); uv.ensure_layers(ob, lightmap=True)
    uv.map_to_emis(ob, cell); vcol.emis_attr(ob, intensity, flicker, fade, emit_strength=0.0)
    ob["lm"] = False
    return ob


def numeral(text, height, pos, facing_deg, depth=0.02, tint="steel_dark", mat="m_pellam", name=None):
    """Geometry numerals (brand.numeral_mesh) at GAME pos (bottom centre), facing layout rotY `facing_deg`
    (0 = north, 90 = west, 180 = south, -90 = east), folded into the chunk's structure material."""
    from lib import brand
    ob = brand.numeral_mesh(text, height, depth=depth, name=name)
    ob.matrix_world = Matrix.Translation(B(pos)) @ Matrix.Rotation(math.radians(facing_deg) + math.pi, 4, 'Z')
    mesh.apply_transform(ob)
    zone.fold_flat(ob, mat); vcol.tint(ob, tint); ob["lm"] = False
    return ob


def maker_plate(number, pos, facing_deg, mat="m_pellam", name="plate"):
    """A cast maker's plate (brand.maker_plate) with its back centre at GAME pos, facing layout rotY `facing_deg`.
    Returns (plate object to paint, decal object or None: has its own colours)."""
    from lib import brand
    p = brand.maker_plate(number, name=name)
    m = Matrix.Translation(B(pos)) @ Matrix.Rotation(math.radians(facing_deg) + math.pi, 4, 'Z')
    for o in p.values():
        if o is None: continue
        o.matrix_world = m; mesh.apply_transform(o); o["lm"] = False
    zone.fold_flat(p["plate"], mat); vcol.tint(p["plate"], "steel")
    return p["plate"], p["decals"]


def band(name, pts_xz, y, height=0.10, colour="livery", mat="m_pellam", offset=0.004):
    """The painted livery band: quads following the GAME plan polyline pts_xz [(x, z), ...] at height y (centre),
    visible from the RIGHT of the walking direction, pushed `offset` off the wall."""
    f = []
    for (a, b) in zip(pts_xz[:-1], pts_xz[1:]):
        d = Vector((b[0] - a[0], b[1] - a[1])); d.normalize()
        nx, nz = -d.y, d.x                                            # to the right of travel in (x, z) seen from above (y up)
        ax, az, bx, bz = a[0] + nx * offset, a[1] + nz * offset, b[0] + nx * offset, b[1] + nz * offset
        f.append([(ax, y - height / 2, az), (bx, y - height / 2, bz), (bx, y + height / 2, bz), (ax, y + height / 2, az)])
    ob = from_faces(name, f, mat, colour, None)
    for p in ob.data.polygons: pass
    return ob


def seat(name, pos, facing, w, h):
    """The empty seat of a wall-hung prop (a locker, an ammunition box): a recessed dark back plate in a bevelled
    steel rim, two slotted hanger rails and four bolt heads, so the mount reads as a place something hangs even
    before the prop lands (fix pass 1; the first build left a blank ceramic slab). pos = GAME centre of the face,
    facing = the compass bearing the face looks along (0 = north = -z, 90 = east, clockwise), w x h metres.
    Built facing north round the origin, then turned and moved. Vertex-lit, flat cells. Returns the objects."""
    out = []
    hw, hh = w / 2, h / 2
    pale = tuple(mix("steel", "enamel_stain", 0.45))
    out.append(from_faces(name + "_back", [[(hw - 0.06, -hh + 0.06, -0.004), (-hw + 0.06, -hh + 0.06, -0.004), (-hw + 0.06, hh - 0.06, -0.004), (hw - 0.06, hh - 0.06, -0.004)]],
                          "m_pellam", tuple(lin("steel_dark") * 0.8), None, away_from=(0, 0, 1), tess=0.5))
    for k, (lo, hi) in enumerate((((-hw, -hh, -0.035), (-hw + 0.07, hh, 0.0)), ((hw - 0.07, -hh, -0.035), (hw, hh, 0.0)),
                                  ((-hw + 0.07, hh - 0.07, -0.035), (hw - 0.07, hh, 0.0)), ((-hw + 0.07, -hh, -0.035), (hw - 0.07, -hh + 0.07, 0.0)))):
        out.append(box(f"{name}_rim_{k}", lo, hi, "m_pellam", "steel", None, bevel=0.008, drop="z+", tess=0.6))
    for k, y in enumerate((hh * 0.45, -hh * 0.45)):
        out.append(box(f"{name}_rail_{k}", (-hw + 0.1, y - 0.03, -0.028), (hw - 0.1, y + 0.03, -0.004), "m_pellam", pale, None, bevel=0.006, drop="z+", tess=0.6))
        for j, x in enumerate((-hw * 0.5, 0.0, hw * 0.5)):             # the slots the prop's lugs drop into
            out.append(box(f"{name}_slot_{k}{j}", (x - 0.045, y - 0.012, -0.0295), (x + 0.045, y + 0.012, -0.028), "m_pellam", tuple(lin("steel_dark") * 0.5), None, bevel=0.0, drop="z+ x- x+ y- y+"))
    for k, (x, y) in enumerate(((-hw + 0.035, -hh + 0.035), (hw - 0.035, -hh + 0.035), (hw - 0.035, hh - 0.035), (-hw + 0.035, hh - 0.035))):
        out.append(box(f"{name}_bolt_{k}", (x - 0.016, y - 0.016, -0.047), (x + 0.016, y + 0.016, -0.035), "m_pellam", pale, None, bevel=0.004, drop="z+"))
    transform(out, Matrix.Translation(B(pos)) @ Matrix.Rotation(-math.radians(facing), 4, 'Z'))
    return out


def quad(p0, p1, p2, p3):
    return [p0, p1, p2, p3]


def arc(cx, cz, r, a0, a1, n):
    """Plan arc points (x, z), angles in degrees measured from +x toward +z."""
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)), cz + r * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]


def rounded_rect(x0, z0, x1, z1, r, n=3):
    """Plan outline of a rectangle with corner radius r (true quarter circles, n segments each), counter-clockwise in (x, z)."""
    pts = []
    for cx, cz, a in ((x1 - r, z1 - r, 0), (x0 + r, z1 - r, 90), (x0 + r, z0 + r, 180), (x1 - r, z0 + r, 270)):
        pts += arc(cx, cz, r, a, a + 90, n)
    return pts


def diagonal_band(x0, y0, x1, y1, width, up=True):
    """The broad hazard diagonal (ART_BIBLE 5.6: one band of ochre, 0.3 m wide, at 45 degrees): the part of a 45-degree
    band through the centre of the rectangle x0..x1, y0..y1 that lies inside it, as a 2D polygon."""
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2; h = width / math.sqrt(2.0); s = 1.0 if up else -1.0
    poly = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    def clip(pts, a, b, c):                                           # keep a x + b y <= c
        out = []
        for i in range(len(pts)):
            p, q = pts[i], pts[(i + 1) % len(pts)]
            dp, dq = a * p[0] + b * p[1] - c, a * q[0] + b * q[1] - c
            if dp <= 0: out.append(p)
            if (dp < 0) != (dq < 0) and abs(dp - dq) > 1e-12:
                t = dp / (dp - dq); out.append((p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t))
        return out
    k = -s * cx + cy                                                   # the band's centre line: y = s x + k
    poly = clip(poly, -s, 1.0, k + h)
    poly = clip(poly, s, -1.0, -(k - h))
    return poly


def decals(name, items, tint="chalk", mat="m_mask"):
    """m_mask decal quads in ONE mesh. items = [(corners, region, index[, tint])], corners = 4 GAME points: bottom-left,
    bottom-right, top-right, top-left as read from the front. COLOR_0 = tint (vertex-lit by bake_zone)."""
    bm = mesh.new_bmesh(); uvl = bm.loops.layers.uv[0]; cl = bm.loops.layers.float_color.new("Tint")
    for it in items:
        corners, region, index = it[0], it[1], it[2]
        c = lin(it[3] if len(it) > 3 else tint)
        u0, v0, u1, v1 = manifest.mask_uv(region, index)
        f = bm.faces.new([bm.verts.new(B(p)) for p in corners])
        for lp, q in zip(f.loops, ((u0, v0), (u1, v0), (u1, v1), (u0, v1))):
            lp[uvl].uv = q; lp[cl] = (float(c[0]), float(c[1]), float(c[2]), 1.0)
    bm.normal_update()
    ob = mesh.new_mesh_object(name, bm)
    material.assign(ob, mat)
    ob["lm"] = False
    return ob


def transform(objs, m):
    """Apply a Blender-space matrix to mesh objects (already at identity)."""
    for o in objs: o.data.transform(m); o.data.update()


def rot_about(p_game, deg_y):
    """Blender matrix: rotation by deg_y (layout rotY sense, about +Y game = +Z Blender) about the vertical through p."""
    p = B(p_game)
    return Matrix.Translation(p) @ Matrix.Rotation(math.radians(deg_y), 4, 'Z') @ Matrix.Translation(-p)


def tris(objs):
    return sum(len(p.vertices) - 2 for o in objs for p in o.data.polygons)


# ------------------------------------------------------------------ paint
def paint(objs, z_range=None, gradient=(0.85, 1.06), jitter=0.0, seed=1, ao=None, ao_strength=0.6, ao_distance=0.6, dust=0.0,
          dust_height=0.6, dust_colour="sand"):
    """COLOR_0 = Tint x gradients (x AO for vertex-lit objects: `ao` = the objects that occlude, default the same list).
    z_range in GAME y (default: each object's own extent). Lightmapped objects get no vertex AO (their lightmap holds it)."""
    vl = [o for o in objs if not o.get("lm") and SHEET_OF(o) != "tx_mask"]
    if vl and ao_strength > 0: vcol.bake_ao_vertex(vl, distance=ao_distance)
    for k, o in enumerate(objs):
        vcol.compose_vertex_color(o, mode='tint', ao_strength=ao_strength if o in vl else 0.0, gradient=gradient, jitter=jitter,
                                  seed=seed + k, z_range=z_range, dust=dust, dust_height=dust_height, dust_colour=dust_colour)


def SHEET_OF(o):
    m = material.names(o)
    return SHEET.get(m[0], "") if m else ""


def flat_paint(ob):
    """Decals: COLOR_0 = Tint, nothing else."""
    vcol.compose_vertex_color(ob, mode='tint', ao_strength=0.0, gradient=(1.0, 1.0), jitter=0.0)


# ------------------------------------------------------------------ lights
def _falloff_nodes(d, radius, power=2.0):
    """Light shader: emission x d^2 x (1 - (d / R)^2)^power, so the irradiance a surface receives is a smooth bump that
    reaches zero at `radius` (the art bible's "baked radius, falloff soft") instead of an inverse-square spike."""
    d.use_nodes = True
    nt = d.node_tree; N = nt.nodes; L = nt.links
    em = next(n for n in N if n.type == 'EMISSION')
    lp = N.new("ShaderNodeLightPath")
    def m(op, a, b=None):
        n = N.new("ShaderNodeMath"); n.operation = op
        for k, x in enumerate((a, b)):
            if x is None: continue
            if isinstance(x, (int, float)): n.inputs[k].default_value = x
            else: L.new(x, n.inputs[k])
        return n.outputs[0]
    q = m('DIVIDE', lp.outputs["Ray Length"], radius)
    one_minus = m('MAXIMUM', m('SUBTRACT', 1.0, m('MULTIPLY', q, q)), 0.0)
    bump = m('POWER', one_minus, power)
    d2 = m('MULTIPLY', lp.outputs["Ray Length"], lp.outputs["Ray Length"])
    L.new(m('MULTIPLY', bump, d2), em.inputs["Strength"])


def point_light(name, pos, colour, radius, energy=10.0, size=0.08, power=2.0):
    """A soft practical at GAME pos reaching `radius` metres (see _falloff_nodes). Calibrate with `set_reading`."""
    d = bpy.data.lights.new(name, 'POINT'); d.color = tuple(float(x) for x in lin(colour)); d.energy = energy; d.shadow_soft_size = size
    _falloff_nodes(d, radius, power)
    o = bpy.data.objects.new(name, d); scene.link(o); o.location = B(pos)
    return o


def area_light(name, pos, to, colour, size_u, size_v, energy=10.0, spread_deg=180.0, radius=None, power=2.0, up=(0, 1, 0), euler=None):
    """A rectangular lamp at GAME pos shining toward GAME point `to` (size_u across, size_v along `up` projected).
    spread_deg < 180 narrows the beam (Cycles area-light spread). radius = soft reach as for point_light."""
    d = bpy.data.lights.new(name, 'AREA'); d.shape = 'RECTANGLE'; d.size = size_u; d.size_y = size_v
    d.color = tuple(float(x) for x in lin(colour)); d.energy = energy; d.spread = math.radians(spread_deg)
    if radius: _falloff_nodes(d, radius, power)
    o = bpy.data.objects.new(name, d); scene.link(o)
    direction = (B(to) - B(pos)).normalized()
    o.location = B(pos)
    if euler is not None: o.rotation_euler = euler                  # (pi, 0, 0): straight up, local X = game x, local Y = game z
    else: o.rotation_euler = (-direction).to_track_quat('Z', 'Y').to_euler() if abs(direction.dot(Bd(up))) < 0.99 else (-direction).to_track_quat('Z', 'X').to_euler()
    return o


def probe(pos, normal, lights=None, samples=512, size=0.2):
    """Cycles DIFFUSE light (direct + indirect, no albedo: what a lightmap stores before the / 2) on a small white
    plane at GAME pos facing GAME normal, as linear rgb. lights = measure these lights alone (bake.only_lights)."""
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=2, y_segments=2, size=size / 2)
    ob = mesh.new_mesh_object("_probe", bm)
    ob.location = B(pos) + Bd(normal).normalized() * 0.01
    ob.rotation_euler = Bd(normal).normalized().to_track_quat('Z', 'Y').to_euler()
    bpy.context.view_layer.update()
    s = bpy.context.scene
    if s.render.engine != 'CYCLES': bake.use_cycles('CPU', samples)
    old = (s.cycles.samples, s.cycles.use_adaptive_sampling, s.cycles.use_light_tree)
    s.cycles.samples = samples; s.cycles.use_adaptive_sampling = False; s.cycles.use_light_tree = False
    b = s.render.bake; b.target = 'VERTEX_COLORS'; b.use_pass_direct = True; b.use_pass_indirect = True; b.use_pass_color = False
    def run():
        scene.deselect_all(); vcol.color_layer(ob, "_cal"); ob.select_set(True); bpy.context.view_layer.objects.active = ob
        r = bpy.ops.object.bake(type='DIFFUSE')
        if r != {'FINISHED'}: raise RuntimeError(f"probe bake failed: {r}")
        return vcol.get_colors(ob, "_cal")[:, :3].mean(axis=0)
    try:
        if lights is not None:
            with bake.only_lights(lights): val = run()
        else: val = run()
    finally:
        b.target = 'IMAGE_TEXTURES'
        s.cycles.samples, s.cycles.use_adaptive_sampling, s.cycles.use_light_tree = old
        me = ob.data; bpy.data.objects.remove(ob, do_unlink=True); bpy.data.meshes.remove(me)
        bpy.context.view_layer.update()
    return np.asarray(val, dtype=np.float32)


def set_reading(light, pos, normal, target, group=None):
    """Bake calibration (ART_BIBLE 3): scale `light` (or every light of `group`) so that the white probe at GAME pos
    facing GAME normal reads `target` in its brightest channel from that light (group) alone. Returns the reading."""
    ls = group or [light]
    r = float(probe(pos, normal, lights=ls).max())
    if r < 1e-6: raise RuntimeError(f"set_reading: {light.name} does not reach the probe at {pos}")
    k = target / r
    for l in ls: l.data.energy *= k
    return float(probe(pos, normal, lights=ls).max())


# ------------------------------------------------------------------ bake
def _ao_image(objs, texture_id, distance, samples):
    """Ambient occlusion of the lightmapped faces as a float image on UV1 (same atlas as the lightmap)."""
    s = bpy.context.scene
    w, h = manifest.texture(texture_id)["size"]
    img = bake.new_image("ao_" + texture_id, w, h)
    if s.world is None: s.world = bpy.data.worlds.new("World")
    s.world.light_settings.distance = distance
    s.cycles.samples = samples
    b = s.render.bake; b.target = 'IMAGE_TEXTURES'; b.use_selected_to_active = False; b.margin = 4; b.margin_type = 'EXTEND'; b.use_clear = True
    scene.deselect_all()
    for o in objs:
        o.select_set(True); o.data.uv_layers.active = o.data.uv_layers["UVLight"]
    bpy.context.view_layer.objects.active = objs[0]
    with bake.BakeTarget(objs, img):
        r = bpy.ops.object.bake(type='AO')
    for o in objs: o.data.uv_layers.active = o.data.uv_layers[0]
    if r != {'FINISHED'}: raise RuntimeError(f"AO image bake failed: {r}")
    return bake.denoise_image_compositor(img)


def _image_from(arr_bottom_up, name):
    h, w = arr_bottom_up.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=True, float_buffer=True)
    a = np.ones((h, w, 4), dtype=np.float32); a[:, :, :3] = arr_bottom_up[:, :, :3]
    img.pixels.foreach_set(a.ravel())
    return img


LM_FACES = {}        # object name -> polygon indices that are lightmapped (a MIXED object: the rest is vertex-lit)


def lm_some(ob, pred):
    """Make `ob` a mixed object: the polygons for which pred(polygon) holds are lightmapped, the others vertex-lit."""
    idx = [p.index for p in ob.data.polygons if pred(p)]
    if idx: LM_FACES[ob.name] = idx
    return ob


def _vl_faces(o):
    if o.name in LM_FACES:
        lit = set(LM_FACES[o.name]); return [p.index for p in o.data.polygons if p.index not in lit]
    return None


def is_lm(o): return bool(o.get("lm")) or o.name in LM_FACES
def is_vl(o): return not o.get("lm")


def unwrap(objs, lm_id):
    """UV1 of every object: lightmapped objects (ob['lm']) and the LM_FACES of mixed objects into the atlas, everything
    else on the neutral texel."""
    uv.unwrap_lightmap(objs, lm_id, faces={o.name: (LM_FACES[o.name] if o.name in LM_FACES else (None if o.get("lm") else [])) for o in objs})
    lit = [o for o in objs if is_lm(o)]
    d = uv.uv_density(lit, res=manifest.texture(lm_id)["size"][0])
    print(f"UNWRAP {lm_id}: {d[0]:.1f} texels/m over {d[2]:.0f} m2 ({100 * d[1]:.0f} % of the atlas)")
    return d


def bake_lightmap(lm_objs, lm_id, ambient, ao_distance=3.0, samples=None, extra=None, save=True):
    """Lamps (Cycles DIFFUSE, 64 spp + OIDN) + ambient x AO -> the lightmap `lm_id`. ambient = linear rgb at an open
    floor. extra(arr_bottom_up) may edit the linear light before it is saved. Returns (linear light array, seconds)."""
    t = time.perf_counter()
    spp = samples or (16 if DRAFT else 64)
    img, _ = bake.bake_lightmap(lm_objs, lm_id, samples=spp)
    light = bake.pixels(img)[:, :, :3].copy()
    ao = bake.pixels(_ao_image(lm_objs, lm_id, ao_distance, 16 if DRAFT else 48))[:, :, :1]
    light = light + np.asarray(ambient, dtype=np.float32)[None, None, :] * ao
    if extra is not None: light = extra(light)
    if save: bake.save_lightmap(_image_from(light, "final_" + lm_id), lm_id)
    return light, time.perf_counter() - t


def lm_pass(lm_objs, lm_id, ambient, ao_distance=3.0, hide=(), samples=None, ao_samples=None):
    """One pass of a lightmap built in several passes (the bore: the sector with the asymmetric parts hidden, then the
    rest): lamps + ambient x AO for `lm_objs` only, with `hide` out of the render. Returns the linear light array
    (bottom-up); the islands of other objects stay black, so passes add up. Save with `save_lm`."""
    saved = [(o, o.hide_render) for o in hide]
    for o in hide: o.hide_render = True
    try:
        img, _ = bake.bake_lightmap(lm_objs, lm_id, samples=samples or (16 if DRAFT else 64))
        light = bake.pixels(img)[:, :, :3].copy()
        if ambient is not None:
            ao = bake.pixels(_ao_image(lm_objs, lm_id, ao_distance, 16 if DRAFT else (ao_samples or 48)))[:, :, :1]
            light = light + np.asarray(ambient, dtype=np.float32)[None, None, :] * ao
    finally:
        for o, h in saved: o.hide_render = h
    return light


def layer_pass(lm_objs, layer_id, lights, hide=(), samples=None):
    saved = [(o, o.hide_render) for o in hide]
    for o in hide: o.hide_render = True
    try:
        img, _ = bake.bake_light_layer(lm_objs, layer_id, lights, samples=samples or (16 if DRAFT else 64))
        return bake.pixels(img)[:, :, :3].copy()
    finally:
        for o, h in saved: o.hide_render = h


def save_lm(arr, tex_id):
    bake.save_lightmap(_image_from(arr, "final_" + tex_id), tex_id)


def bake_layer(lm_objs, layer_id, lights, samples=None, gain=1.0):
    """One switchable light into the single-channel layer `layer_id` (same UV1)."""
    t = time.perf_counter()
    img, _ = bake.bake_light_layer(lm_objs, layer_id, lights, samples=samples or (16 if DRAFT else 64))
    a = bake.pixels(img)[:, :, :3].copy() * gain
    bake.save_lightmap(_image_from(a, "final_" + layer_id), layer_id)
    return a, time.perf_counter() - t


def bake_vertex(vl_objs, ambient, ao_distance=3.0, samples=None):
    """Vertex light of the vertex-lit objects: COLOR_0 = COLOR_0 x (lamps + ambient x AO) / 2 (marked vertex-lit)."""
    if not vl_objs: return 0.0
    t = time.perf_counter()
    spp = samples or (192 if DRAFT else 2048)
    base = {o.name: vcol.get_colors(o, "Color").copy() for o in vl_objs}
    vcol.bake_ao_vertex(vl_objs, name="AmbAO", distance=ao_distance, samples=16 if DRAFT else 64)
    amb = {o.name: vcol.get_colors(o, "AmbAO")[:, :1].copy() for o in vl_objs}
    for o in vl_objs:
        o.data.color_attributes.remove(o.data.color_attributes["AmbAO"]); vcol.color_layer(o, "Color")
    faces = {o.name: _vl_faces(o) for o in vl_objs}
    vcol.bake_vertex_light(vl_objs, samples=spp, faces=faces)
    a3 = np.asarray(ambient, dtype=np.float32)[None, :]
    for o in vl_objs:
        c = vcol.get_colors(o, "Color")
        m = uv._loops_of(o, uv.face_indices(o, faces[o.name]))
        c[m, :3] = np.clip(c[m, :3] + base[o.name][m, :3] * a3 * amb[o.name][m] / vcol.VERTEX_LIGHT_SCALE, 0.0, 1.0)
        vcol.set_colors(o, c, "Color")
    return time.perf_counter() - t


def weld_colors(objs):
    """Give the corners that the exporter could share (same vertex, normal, UV0 and UV1) ONE colour: their mean.
    A vertex bake writes every face corner separately, so neighbouring corners differ by noise and every vertex is
    split per face in the GLB (2.2 vertices per triangle measured; about 0.8 after this), and the averaged samples
    are less noisy. Hard edges (different normals) and UV seams keep their own colours."""
    for o in objs:
        me = o.data
        if not len(me.loops) or "Color" not in me.color_attributes: continue
        n = len(me.loops)
        li = np.empty(n, dtype=np.int64); me.loops.foreach_get("vertex_index", li)
        nr = np.empty(n * 3, dtype=np.float32); me.corner_normals.foreach_get("vector", nr); nr = nr.reshape(-1, 3)
        key = [li, np.round(nr[:, 0] * 16).astype(np.int64), np.round(nr[:, 1] * 16).astype(np.int64), np.round(nr[:, 2] * 16).astype(np.int64)]
        for l in list(me.uv_layers)[:2]:
            u = uv.get(o, l.name)
            key += [np.round(u[:, 0] * 16384).astype(np.int64), np.round(u[:, 1] * 16384).astype(np.int64)]
        k = np.stack(key, axis=1)
        _, inv = np.unique(k, axis=0, return_inverse=True)
        inv = inv.reshape(-1)
        c = vcol.get_colors(o, "Color")
        acc = np.zeros((int(inv.max()) + 1, 4), dtype=np.float64); cnt = np.zeros(int(inv.max()) + 1, dtype=np.float64)
        np.add.at(acc, inv, c); np.add.at(cnt, inv, 1.0)
        vcol.set_colors(o, (acc / cnt[:, None])[inv].astype(np.float32), "Color")


def vertex_report(objs, top=14):
    """Print the objects that cost the most exported vertices (unique position + normal + UV0 + UV1 + colour)."""
    rows = []
    for o in objs:
        me = o.data; n = len(me.loops)
        if not n: continue
        li = np.empty(n, dtype=np.int64); me.loops.foreach_get("vertex_index", li)
        nr = np.empty(n * 3, dtype=np.float32); me.corner_normals.foreach_get("vector", nr); nr = nr.reshape(-1, 3)
        key = [li] + [np.round(nr[:, i] * 64).astype(np.int64) for i in range(3)]
        for l in list(me.uv_layers)[:2]:
            u = uv.get(o, l.name); key += [np.round(u[:, 0] * 16384).astype(np.int64), np.round(u[:, 1] * 16384).astype(np.int64)]
        c = vcol.get_colors(o, "Color"); key += [np.round(c[:, i] * 4095).astype(np.int64) for i in range(3)]
        uniq = len(np.unique(np.stack(key, axis=1), axis=0))
        t = sum(len(p.vertices) - 2 for p in me.polygons)
        rows.append((uniq, t, o.name))
    rows.sort(reverse=True)
    tot_v = sum(r[0] for r in rows); tot_t = sum(r[1] for r in rows)
    print(f"VERTS {tot_v} for {tot_t} triangles ({tot_v / max(tot_t, 1):.2f} per triangle); most: " + ", ".join(f"{n} {v}/{t}" for v, t, n in rows[:top]))


def snap_positions(objs, grid=1.0 / 1024.0):
    """Round every vertex to a binary grid (about 1 mm). POSITION ships as float32 (ARCHITECTURE 7.1): coordinates
    with a short mantissa compress far better under meshopt, and nothing here is modelled finer than 2 mm."""
    for o in objs:
        me = o.data
        co = np.empty(len(me.vertices) * 3, dtype=np.float64); me.vertices.foreach_get("co", co)
        me.vertices.foreach_set("co", np.round(co / grid) * grid); me.update()


def box_report(asset_id, merged, tol=0.75):
    """Print the faces of each chunk mesh whose vertices leave the chunk's box (check-glb fails them), with places."""
    plan = {c["id"]: c for c in manifest.asset(asset_id)["chunks"]}
    for name, o in merged.items():
        c = plan[name.split("__")[0]]; bad = []
        for p in o.data.polygons:
            for vi in p.vertices:
                g = layout.to_game(o.matrix_world @ o.data.vertices[vi].co)
                d = max(max(c["box"]["min"][k] - g[k], g[k] - c["box"]["max"][k]) for k in range(3))
                if d > tol: bad.append((round(d, 2), tuple(round(x, 2) for x in layout.to_game(o.matrix_world @ p.center)))); break
        if bad: print(f"BOX {name}: {len(bad)} faces outside, e.g. {sorted(bad, reverse=True)[:5]}")


def hide_lamp_meshes(objs):
    """Lamp-set meshes do not light the bake themselves (the calibrated light objects do)."""
    for o in objs: o["emit_strength"] = 0.0


def remove(objs):
    for o in objs:
        me = o.data if o.type == 'MESH' else None
        bpy.data.objects.remove(o, do_unlink=True)
        if me is not None and me.users == 0: bpy.data.meshes.remove(me)
    bpy.context.view_layer.update()


def chunk_tris(merged):
    """{chunk id: triangles} of merge_chunks' result (m_emis lamp sets are counted by the caller)."""
    out = {}
    for name, o in merged.items():
        c = name.split("__")[0]
        out[c] = out.get(c, 0) + sum(len(p.vertices) - 2 for p in o.data.polygons)
    return out


# ------------------------------------------------------------------ look pass i2: oriented faces, the wall diagram's dress
def oriented(name, items, mat="m_pellam", tint="enamel", region=None, lm=False, smooth=35, tess=None, mpr=None, along='auto'):
    """A mesh from [(GAME polygon, GAME normal), ...]: every face is turned to look along its own normal (from_faces
    can only turn a whole mesh toward or away from one point: a ring with a bore, a groove or a chamfer has faces that
    look both ways)."""
    ob = from_faces(name, [p for p, _ in items], mat, tint, region, bevel=0.0, lm=lm, smooth=smooth, mpr=mpr, along=along)
    cen = [(sum((B(q) for q in p), Vector()) / len(p), Bd(n)) for p, n in items]
    me = ob.data; bm = bmesh.new(); bm.from_mesh(me); mw = ob.matrix_world
    for f in bm.faces:
        c = mw @ f.calc_center_median()
        want = min(cen, key=lambda cn: (cn[0] - c).length_squared)[1]
        if f.normal.dot(want) < 0: f.normal_flip()
    bm.to_mesh(me); bm.free(); me.update()
    if tess: mesh.tessellate_max_edge(ob, tess)
    return ob


def diagram_dress(prefix, O, right, out, U, n_lamp=12):
    """Look pass i2 (visual reviewer: "a plain black low-poly disc hanging from a black bar ... reads as an unfinished
    placeholder shape"). The lift-head diagram's seventh, "hung apart" and dark by the story, was a flat 16-sided black
    disc on a flat black stroke: walked up to, a primitive. It is a dead signal lamp now: a steel bezel with a bolt
    circle standing proud of the panel, a pale reflector with eight spokes behind a dark lens, hung on a conduit that
    two saddle clamps and a shackle hold to the panel. The six lit lamps are round (they were squares behind round
    rings) and each ring carries a thin steel bezel.
    O = GAME point of the ring's centre ON THE MARK'S FACE, right = GAME unit vector of the mark's +u as read from the
    front, out = GAME unit vector toward the reader. Returns (objects, lamp polygons in Blender space: six + the seventh)."""
    from lib import brand
    Ov, R, N, UP = Vector(O), Vector(right), Vector(out), Vector((0.0, 1.0, 0.0))
    def Q(u, v, d): return tuple(Ov + R * u + UP * v + N * d)
    def circ(cu, cv, r, d, n, a0=0.0): return [Q(cu + r * math.sin(a0 + 2 * math.pi * i / n), cv + r * math.cos(a0 + 2 * math.pi * i / n), d) for i in range(n)]
    def rad(cu, cv, i, n, a0=0.0):
        a = a0 + 2 * math.pi * (i + 0.5) / n; return tuple(R * math.sin(a) + UP * math.cos(a))
    objs, lamps = [], []
    cs = brand.mark_disc_centres(U)
    nrm = tuple(N)
    # the six: a thin bezel round each ring (a lit lamp sits in a housing), and a round lens
    bez = []
    for (cu, cv) in cs[:6]:
        ro, ri, d = (brand.DISC_R + 0.035) * U, (brand.DISC_R - 0.01) * U, 0.016 * U + 0.004
        a, b = circ(cu, cv, ro, d, 16), circ(cu, cv, ri, d, 16); c = circ(cu, cv, ro, -0.019, 16)
        for i in range(16):
            j = (i + 1) % 16
            bez.append(([a[i], a[j], b[j], b[i]], nrm))
            bez.append(([c[i], c[j], a[j], a[i]], rad(cu, cv, i, 16)))
        lamps.append([B(p) for p in circ(cu, cv, (brand.DISC_R - brand.DISC_WALL) * U * 0.98, 0.003, n_lamp)][::-1])      # counter-clockwise seen from the front
    objs.append(oriented(prefix + "_bezels", bez, "m_pellam", "steel", None, smooth=40))
    # the seventh: bezel, bolt circle, reflector, spokes, lens ring; the lamp itself is the dark lens in the middle
    cu, cv = cs[6]; r7 = brand.SEVENTH_R * U
    n = 24; d0 = 0.045 * U
    a, b, c, e = circ(cu, cv, r7 + 0.06 * U, d0, n), circ(cu, cv, r7 - 0.035 * U, d0, n), circ(cu, cv, r7 + 0.075 * U, -0.019, n), circ(cu, cv, r7 - 0.035 * U, 0.008, n)
    hous = []
    for i in range(n):
        j = (i + 1) % n; ro = rad(cu, cv, i, n)
        hous.append(([a[i], a[j], b[j], b[i]], nrm))
        hous.append(([c[i], c[j], a[j], a[i]], tuple(Vector(ro) * 0.9 + N * 0.44)))
        hous.append(([b[i], b[j], e[j], e[i]], tuple(-Vector(ro))))
    objs.append(oriented(prefix + "_seventh_bezel", hous, "m_pellam", "steel", None, smooth=40))
    refl = []
    ra, rb_ = circ(cu, cv, r7 - 0.035 * U, 0.008, n), circ(cu, cv, 0.125 * U, 0.014, n)
    for i in range(n):
        j = (i + 1) % n
        refl.append(([ra[i], ra[j], rb_[j], rb_[i]], nrm))
    objs.append(oriented(prefix + "_seventh_reflector", refl, "m_pellam", "enamel", None, smooth=40))
    dark = []
    la, lb = circ(cu, cv, 0.14 * U, 0.02, 16), circ(cu, cv, 0.108 * U, 0.02, 16)
    for i in range(16):
        j = (i + 1) % 16
        dark.append(([la[i], la[j], lb[j], lb[i]], nrm))
    for k in range(8):                                                  # spokes of the reflector
        a_ = 2 * math.pi * (k + 0.5) / 8; w = 0.009 * U
        t = (math.cos(a_), -math.sin(a_))
        p = lambda r_, s_: Q(cu + r_ * math.sin(a_) + s_ * t[0], cv + r_ * math.cos(a_) + s_ * t[1], 0.0165)
        dark.append(([p(0.14 * U, -w), p(0.14 * U, w), p(r7 - 0.04 * U, w), p(r7 - 0.04 * U, -w)], nrm))
    objs.append(oriented(prefix + "_seventh_dark", dark, "m_pellam", "steel_dark", None))
    for k in range(6):                                                  # the bolt circle
        a_ = 2 * math.pi * (k + 0.5) / 6; rb2 = r7 + 0.0125 * U; s = 0.016 * U
        bu, bv = cu + rb2 * math.sin(a_), cv + rb2 * math.cos(a_)
        lo, hi = Q(bu - s, bv - s, d0), Q(bu + s, bv + s, d0 + 0.012)
        f = [([Q(bu - s, bv - s, d0 + 0.012), Q(bu + s, bv - s, d0 + 0.012), Q(bu + s, bv + s, d0 + 0.012), Q(bu - s, bv + s, d0 + 0.012)], nrm)]
        for (u0, v0, u1, v1, nn) in ((-s, -s, s, -s, -UP), (s, -s, s, s, R), (s, s, -s, s, UP), (-s, s, -s, -s, -R)):
            f.append(([Q(bu + u0, bv + v0, d0), Q(bu + u1, bv + v1, d0), Q(bu + u1, bv + v1, d0 + 0.012), Q(bu + u0, bv + v0, d0 + 0.012)], tuple(nn)))
        objs.append(oriented(f"{prefix}_seventh_bolt{k}", f, "m_pellam", "steel_dark", None))
    lamps.append([B(p) for p in circ(cu, cv, 0.108 * U, 0.021, n_lamp)][::-1])
    # the hanger: a conduit down the stroke, two saddle clamps, a shackle on the seventh's crown
    def block(name, u0, u1, v0, v1, d1, tint):
        f = [([Q(u0, v0, d1), Q(u1, v0, d1), Q(u1, v1, d1), Q(u0, v1, d1)], nrm)]
        for (ua, va, ub, vb, nn) in ((u0, v0, u1, v0, -UP), (u1, v0, u1, v1, R), (u1, v1, u0, v1, UP), (u0, v1, u0, v0, -R)):
            f.append(([Q(ua, va, -0.019), Q(ub, vb, -0.019), Q(ub, vb, d1), Q(ua, va, d1)], tuple(nn)))
        objs.append(oriented(name, f, "m_pellam", tint, None))
    v_top, v_bot = -1.22 * U, cv + r7 + 0.06 * U
    objs.append(cyl(prefix + "_conduit", Q(0, v_top, 0.012), Q(0, v_bot, 0.012), 0.03 * U, 8, "m_pellam", "steel", None, cap=False))
    for k, v in enumerate((-1.36 * U, -1.86 * U)):
        block(f"{prefix}_clamp{k}", -0.11 * U, 0.11 * U, v - 0.035 * U, v + 0.035 * U, 0.05 * U, "steel")
        for s_ in (-1, 1):
            block(f"{prefix}_clamp{k}_bolt{s_}", s_ * 0.08 * U - 0.014 * U, s_ * 0.08 * U + 0.014 * U, v - 0.014 * U, v + 0.014 * U, 0.05 * U + 0.01, "steel_dark")
    block(prefix + "_shackle", -0.075 * U, 0.075 * U, v_bot - 0.03 * U, v_bot + 0.1 * U, 0.06 * U, "steel")
    for o in objs: o["lm"] = False
    return objs, lamps
