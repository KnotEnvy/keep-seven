"""UV mapping onto the shared textures (UV0, layer "UVMap") and the lightmap unwrap (UV1, layer "UVLight").

TEXCOORD_n follows UV-layer ORDER: "UVMap" must be layer 0 and "UVLight" layer 1 (`ensure_layers`).
All UVs here are Blender UVs (origin bottom-left). Map UVs AFTER `mesh.finish` (bevels perturb existing UVs).

`faces` arguments (uv.*, vcol.*, material.assign, zone.fold_flat) accept:
    None                          every face
    an iterable of ints           polygon indices
    callable(polygon) -> bool     ONE argument, a bpy MeshPolygon in OBJECT space: `lambda p: p.normal.z > 0.9`,
                                  `lambda p: p.center.y < 0`
This is NOT the predicate of `mesh.delete_faces(ob, predicate(face, world_centre, world_normal))`, which takes three
arguments in WORLD space. A three-argument lambda passed here fails with a message saying so (`face_indices`).
"""
import bpy, bmesh, math
import numpy as np
from mathutils import Vector
from . import manifest
from .scene import deselect_all, select_only, must

UV0 = "UVMap"
UV1 = "UVLight"
LENGTH_ROWS = {"plank_a", "plank_b", "strap", "cord", "steel", "cable"}     # rows whose U runs along the part's length


def ensure_layers(ob, lightmap=False):
    """Make sure layer 0 is "UVMap" (and, with lightmap=True, layer 1 is "UVLight"). Returns the UV0 layer."""
    me = ob.data
    if len(me.uv_layers) == 0: me.uv_layers.new(name=UV0)
    if me.uv_layers[0].name != UV0:
        if UV0 in me.uv_layers: raise RuntimeError(f"{ob.name}: layer '{UV0}' exists but is not layer 0 (TEXCOORD_0)")
        me.uv_layers[0].name = UV0
    if lightmap:
        if UV1 not in me.uv_layers: me.uv_layers.new(name=UV1)
        if me.uv_layers[1].name != UV1: raise RuntimeError(f"{ob.name}: '{UV1}' must be UV layer 1 (TEXCOORD_1), found order {[l.name for l in me.uv_layers]}")
    me.uv_layers.active = me.uv_layers[0]
    return me.uv_layers[0]


def face_indices(ob, faces):
    """Resolve a `faces` argument to a sorted list of polygon indices: None = every face | an iterable of polygon
    indices | callable(polygon) -> bool (ONE argument: a MeshPolygon, object space; not the delete_faces signature)."""
    me = ob.data
    if faces is None: return list(range(len(me.polygons)))
    if callable(faces):
        try: return [p.index for p in me.polygons if faces(p)]
        except TypeError as e:
            if "positional argument" not in str(e): raise
            raise TypeError(f"{ob.name}: a `faces` callable takes ONE argument, the polygon (object space): lambda p: p.normal.z > 0.9. "
                            f"The three-argument (face, world_centre, world_normal) form belongs to mesh.delete_faces only ({e})") from None
    return sorted(int(i) for i in faces)


def get(ob, layer=UV0):
    """Per-loop UVs of a layer as an (n_loops, 2) float array."""
    l = ob.data.uv_layers[layer]
    a = np.empty(len(ob.data.loops) * 2, dtype=np.float32); l.data.foreach_get("uv", a)
    return a.reshape(-1, 2)


def put(ob, arr, layer=UV0):
    """Write an (n_loops, 2) array into a UV layer."""
    ob.data.uv_layers[layer].data.foreach_set("uv", np.ascontiguousarray(arr, dtype=np.float32).ravel())
    ob.data.update()


def _loops_of(ob, idx):
    me = ob.data
    ls = np.empty(len(me.polygons), dtype=np.int32); me.polygons.foreach_get("loop_start", ls)
    lt = np.empty(len(me.polygons), dtype=np.int32); me.polygons.foreach_get("loop_total", lt)
    mask = np.zeros(len(me.loops), dtype=bool)
    for i in idx: mask[ls[i]:ls[i] + lt[i]] = True
    return mask


def fill(ob, uv, faces=None, layer=UV0):
    """Point every loop of `faces` at one UV (a palette cell, the flat cell, the neutral texel)."""
    ensure_layers(ob, lightmap=(layer == UV1))
    a = get(ob, layer)
    a[_loops_of(ob, face_indices(ob, faces))] = uv
    put(ob, a, layer)


def map_to_palette(ob, name, faces=None):
    """UV0 -> the centre of palette cell `name` of tx_palette (m_prop, m_flat). Colour gradients are vertex colour's job."""
    fill(ob, manifest.palette_uv(name), faces)


def map_to_emis(ob, name, faces=None):
    """UV0 -> emissive cell `name` of tx_palette_emis (m_emis lamp sets; emissive faces of m_prop)."""
    fill(ob, manifest.emis_uv(name), faces)


def map_flat(ob, sheet, faces=None):
    """UV0 -> the uniform 0.5 `flat` cell of a trim sheet: the face then shows its vertex colour alone."""
    fill(ob, manifest.trim_flat_uv(sheet), faces)


def map_planar_world(ob, metres=4.0, faces=None):
    """UV0 = world (X, Y) / metres: the terrain mapping of m_sand (tx_sand is 4 m per repeat; +V = north)."""
    ensure_layers(ob)
    bpy.context.view_layer.update()
    me = ob.data; mw = ob.matrix_world
    a = get(ob); mask = _loops_of(ob, face_indices(ob, faces))
    co = np.empty(len(me.vertices) * 3, dtype=np.float32); me.vertices.foreach_get("co", co); co = co.reshape(-1, 3)
    li = np.empty(len(me.loops), dtype=np.int32); me.loops.foreach_get("vertex_index", li)
    m = np.array(mw, dtype=np.float32)
    w = co[li] @ m[:3, :3].T + m[:3, 3]
    a[mask, 0] = w[mask, 0] / metres; a[mask, 1] = w[mask, 1] / metres
    put(ob, a)


def _islands(bm, sel, angle_deg):
    """Group the selected faces: flood from the largest unassigned face over edge-connected selected faces whose normal
    is within angle_deg of the seed's. Bevel faces join the big face beside them."""
    cosang = math.cos(math.radians(angle_deg))
    left = set(sel); out = []
    order = sorted(sel, key=lambda f: -f.calc_area())
    for seed in order:
        if seed not in left: continue
        n0 = seed.normal.copy(); grp = [seed]; left.discard(seed); stack = [seed]
        while stack:
            f = stack.pop()
            for e in f.edges:
                for g in e.link_faces:
                    if g in left and g.normal.dot(n0) >= cosang:
                        left.discard(g); grp.append(g); stack.append(g)
        out.append((seed, grp))
    return out


def map_to_trim(ob, faces, sheet, region, metres_per_repeat=None, along='auto', fit='stretch', u_offset=0.0, rng=None,
                angle=50.0, inset_px=0.5):
    """Map faces onto one ROW of a trim sheet ('tx_frontier_trim' | 'tx_pellam_trim'). The row tiles in U and is used
    ONCE in V.

    Faces are grouped into islands (a big face plus the bevels round it). For each island:
      U runs `along`: 'length' = the island's longest in-plane direction (planks, straps, cords), 'horizontal' = level
        for walls and world +X for floors (adobe, strata, tin, panels, concrete), 'auto' = whichever the row is meant
        for, or a world-space vector (x, y, z). u = distance / metres_per_repeat (default: the row's natural repeat
        from the table, so texel density is right) + u_offset (+ a random shift when `rng` is given, so neighbouring
        planks never match).
      V spans the island across the row: fit='stretch' maps the island's extent to the whole row (a 0.18 m plank and
        a 0.24 m plank both show one board); fit='metric' keeps the row's world height when the island is no taller
        (the brick course stays brick-sized on a low wall), otherwise it stretches.
    inset_px: how far V stays inside the row (sheet pixels, each side). The rows are packed edge to edge with NO
      gutter, and every row is drawn with its own dark seam line along both long edges, so the default 0.5 px is exact
      at mip 0 and what bleeds in at lower mips is the neighbour's seam line onto this row's seam line. On a surface
      that is seen small and whose edge must not darken (a pale panel beside a dark row), pass inset_px=2 (clean down
      to mip 2, at the cost of 4 px of the row's height).
    Returns the number of islands."""
    ensure_layers(ob)
    idx = set(face_indices(ob, faces))
    reg = manifest.trim_region(sheet, region)
    v0, v1 = manifest.trim_v(sheet, region, inset_px)
    mpr = metres_per_repeat or reg["metres_u"]
    if not mpr: raise ValueError(f"{sheet}/{region} has no natural repeat: pass metres_per_repeat (or use uv.map_flat)")
    mode = along
    if along == 'auto': mode = 'length' if region in LENGTH_ROWS else 'horizontal'
    me = ob.data
    bpy.context.view_layer.update()
    bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
    bm.transform(ob.matrix_world)                                 # world metres (the result is not written back)
    bm.normal_update()
    sel = [f for f in bm.faces if f.index in idx]
    result = {}
    Z = Vector((0, 0, 1)); Xw = Vector((1, 0, 0))
    groups = _islands(bm, sel, angle)
    for seed, grp in groups:
        n = seed.normal
        if abs(n.z) < 0.95: hdir = Z.cross(n).normalized()        # level direction on a wall
        else: hdir = (Xw - n * Xw.dot(n)).normalized()            # world X on a floor / ceiling
        vdir = n.cross(hdir).normalized()
        if abs(n.z) < 0.95 and vdir.z < 0: vdir = -vdir; hdir = -hdir
        pts = [l.vert.co for f in grp for l in f.loops]
        if isinstance(mode, str) and mode == 'length':
            eh = [p.dot(hdir) for p in pts]; ev = [p.dot(vdir) for p in pts]
            if (max(ev) - min(ev)) > (max(eh) - min(eh)) * 1.05: hdir, vdir = vdir, -hdir
        elif not isinstance(mode, str):
            a = Vector(mode); a = a - n * a.dot(n)
            if a.length < 1e-6: raise ValueError("map_to_trim: `along` is perpendicular to the face")
            hdir = a.normalized(); vdir = n.cross(hdir).normalized()
        eu = [p.dot(hdir) for p in pts]; ev = [p.dot(vdir) for p in pts]
        umin = min(eu); vmin = min(ev); vext = max(max(ev) - vmin, 1e-9)
        shift = u_offset + (rng.random() if rng is not None else 0.0)
        vscale = (v1 - v0) / vext
        if fit == 'metric' and reg["metres_v"] and vext <= reg["metres_v"]: vscale = (v1 - v0) / reg["metres_v"]
        for f in grp:
            start = me.polygons[f.index].loop_start             # bmesh loop order == mesh loop order per face
            for k, l in enumerate(f.loops):
                p = l.vert.co
                result[start + k] = ((p.dot(hdir) - umin) / mpr + shift, v0 + (p.dot(vdir) - vmin) * vscale)
    bm.free()
    a = get(ob)
    for li, uv in result.items(): a[li] = uv
    put(ob, a)
    return len(groups)


def map_to_mask(ob, faces, region, index=None, up=None, flip_u=False):
    """Fit `faces` (one flat decal: a quad or a few coplanar faces) to a tx_mask region, or to cell `index` of a
    multi-cell region (numerals, plate_lines, picto_misc, tally, family_marks). The faces are projected along their
    average normal; +V is world up (or `up`, a world vector, for horizontal decals)."""
    ensure_layers(ob)
    u0, v0, u1, v1 = manifest.mask_uv(region, index)
    idx = set(face_indices(ob, faces))
    bpy.context.view_layer.update()
    me = ob.data; mw = ob.matrix_world; nm = mw.to_3x3().inverted_safe().transposed()
    n = Vector((0, 0, 0))
    for i in idx: n += (nm @ me.polygons[i].normal) * me.polygons[i].area
    if n.length < 1e-9 * max(1.0, sum(me.polygons[i].area for i in idx)):
        raise ValueError(f"map_to_mask: the {len(idx)} face(s) of '{ob.name}' given for region '{region}' have no common facing "
                         "(their area-weighted normals cancel: a closed box, or front and back together). A decal is ONE flat side: "
                         "pass only the faces that show it, e.g. faces=lambda p: p.normal.y < -0.9 for the front (-Y) of a panel")
    n.normalize()
    upv = Vector(up) if up is not None else (Vector((0, 0, 1)) if abs(n.z) < 0.95 else Vector((0, 1, 0)))
    vdir = (upv - n * upv.dot(n)).normalized(); hdir = vdir.cross(n).normalized()
    if flip_u: hdir = -hdir
    a = get(ob); pts = {}
    for i in idx:
        p = me.polygons[i]
        for li in range(p.loop_start, p.loop_start + p.loop_total):
            w = mw @ me.vertices[me.loops[li].vertex_index].co
            pts[li] = (w.dot(hdir), w.dot(vdir))
    us = [p[0] for p in pts.values()]; vs = [p[1] for p in pts.values()]
    du = max(max(us) - min(us), 1e-9); dv = max(max(vs) - min(vs), 1e-9)
    for li, (pu, pv) in pts.items():
        a[li] = (u0 + (pu - min(us)) / du * (u1 - u0), v0 + (pv - min(vs)) / dv * (v1 - v0))
    put(ob, a)


def lamp_index(ob, index, count, faces=None):
    """UV1.x = (index + 0.5) / count on `faces`: the lamp index of an m_emis lamp set (ARCHITECTURE 7.5)."""
    ensure_layers(ob, lightmap=True)
    a = get(ob, UV1); mask = _loops_of(ob, face_indices(ob, faces))
    a[mask, 0] = (index + 0.5) / count; a[mask, 1] = 0.5
    put(ob, a, UV1)


def cube_project(objs, cube_size=2.0):
    """Metric box mapping of UV0 (quick tiling UVs for blockouts). Prefer map_to_trim for final art.
    `objs` = one mesh object or a list of them (like its siblings, which take one object)."""
    if isinstance(objs, bpy.types.Object): objs = [objs]
    objs = list(objs)
    if not objs: raise ValueError("cube_project: no objects")
    for o in objs: ensure_layers(o)
    deselect_all()
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    r = bpy.ops.uv.cube_project(cube_size=cube_size, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    must(r, "cube_project")


def unwrap_lightmap(objs, texture_id=None, res=None, margin_px=4, angle=66, faces=None, reserve_px=12):
    """Unwrap the lightmapped faces of `objs` into ONE shared atlas on layer "UVLight" (UV1) at uniform texel density.

    texture_id (e.g. 'lm_tally') gives the atlas size from the manifest (or pass res). `faces` = dict
    {object name: faces argument} or one faces argument applied to every object, where a faces argument is None (all) |
    polygon indices ([] = none) | callable(polygon) -> bool, e.g. {floor.name: lambda p: p.normal.z > 0.9} (one
    argument, object space: NOT the mesh.delete_faces signature). ONLY those faces are unwrapped; every
    other face is vertex-lit and gets its UV1 on the lightmap's neutral texel when texture_id is given (ARCHITECTURE
    7.4). Island margin is 2 x margin_px (bake with margin_px). The atlas is squeezed away from the top-left corner by
    `reserve_px` so no island or bake margin touches the neutral 4 x 4 block."""
    from . import bake
    if res is None:
        if texture_id is None: raise ValueError("unwrap_lightmap: pass texture_id or res")
        res = manifest.texture(texture_id)["size"][0]
    sel = {}
    for o in objs:
        ensure_layers(o, lightmap=True)
        f = faces.get(o.name) if isinstance(faces, dict) else faces
        idx = set(face_indices(o, f)); sel[o.name] = idx
        for p in o.data.polygons: p.select = p.index in idx
        for e in o.data.edges: e.select = False
        for v in o.data.vertices: v.select = False
        o.data.uv_layers.active = o.data.uv_layers[UV1]
    work = [o for o in objs if sel[o.name]]
    if work:
        deselect_all()
        for o in work: o.select_set(True)
        bpy.context.view_layer.objects.active = work[0]
        for o in work:
            for p in o.data.polygons: p.select = p.index in sel[o.name]
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_mode(type='FACE')
        r = bpy.ops.uv.smart_project(angle_limit=math.radians(angle), margin_method='FRACTION', island_margin=2 * margin_px / res,
                                     rotate_method='AXIS_ALIGNED', area_weight=0.0, correct_aspect=False, scale_to_bounds=False)   # correct_aspect would read the 2:1 trim image
        bpy.ops.object.mode_set(mode='OBJECT')
        must(r, "smart_project (lightmap unwrap)")
    s = 1.0 - reserve_px / res
    for o in objs:
        a = get(o, UV1); mask = _loops_of(o, sel[o.name])
        a[mask, 0] = 1.0 - (1.0 - np.clip(a[mask, 0], 0, 1)) * s       # squeeze toward the bottom-right corner
        a[mask, 1] = np.clip(a[mask, 1], 0, 1) * s
        if texture_id is not None: a[~mask] = bake.neutral_uv(texture_id)
        put(o, a, UV1)
        o.data.uv_layers.active = o.data.uv_layers[0]
    return res


def uv_density(objs, uv_name=UV1, res=1024):
    """(texels per metre, uv area used, surface area m2) of a UV layer over objs (zero-area UV faces are skipped)."""
    area3d = 0.0; areauv = 0.0
    bpy.context.view_layer.update()
    for ob in objs:
        bm = bmesh.new(); bm.from_mesh(ob.data); bm.transform(ob.matrix_world)
        uv = bm.loops.layers.uv[uv_name]
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
        for f in bm.faces:
            a, b, c = (l[uv].uv for l in f.loops)
            ua = abs((b - a).cross(c - a)) * 0.5
            if ua < 1e-12: continue
            area3d += f.calc_area(); areauv += ua
        bm.free()
    if area3d == 0: return 0.0, 0.0, 0.0
    return math.sqrt(areauv * res * res / area3d), areauv, area3d
