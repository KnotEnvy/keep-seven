"""Modelling helpers. Blender space, metres. Verified on Blender 4.5.14 (docs/research/blender-pipeline.md 2, 5.6)."""
import bpy, bmesh, math
from mathutils import Vector, Matrix
from .scene import link, deselect_all, select_only, select, must


def new_mesh_object(name, bm, coll=None):
    """bmesh -> a linked mesh object named `name` (frees the bmesh). Always create a UV layer BEFORE building:
    `bm.loops.layers.uv.new("UVMap")`, or use `mesh.new_bmesh()`."""
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    return link(ob, coll)


def new_bmesh():
    """An empty bmesh that already has the UV0 layer "UVMap" (bmesh ops with calc_uvs need an existing layer)."""
    bm = bmesh.new()
    bm.loops.layers.uv.new("UVMap")
    return bm


def bm_box(bm, size, center=(0, 0, 0), rot=None):
    """Append a box to `bm`. size = full extents (x, y, z); rot = optional mathutils Matrix applied about the box centre.
    Returns its 8 verts."""
    vs = bmesh.ops.create_cube(bm, size=1.0)['verts']
    bmesh.ops.scale(bm, vec=size, verts=vs)
    if rot is not None: bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=rot, verts=vs)
    bmesh.ops.translate(bm, vec=center, verts=vs)
    return vs


def bm_cylinder(bm, radius, depth, center=(0, 0, 0), segments=16, radius_top=None, cap=True, rot=None):
    """Append a cylinder / cone frustum along +Z to `bm` (radius at the bottom, radius_top at the top). Returns its verts."""
    r = bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=segments, radius1=radius,
                              radius2=radius if radius_top is None else radius_top, depth=depth)
    vs = r['verts']
    if rot is not None: bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=rot, verts=vs)
    bmesh.ops.translate(bm, vec=center, verts=vs)
    return vs


def box(name, size, center=(0, 0, 0), rot=None, coll=None):
    """A box object (see bm_box) with a UV0 layer."""
    bm = new_bmesh(); bm_box(bm, size, center, rot)
    return new_mesh_object(name, bm, coll)


def cylinder(name, radius, depth, center=(0, 0, 0), segments=16, radius_top=None, cap=True, rot=None, coll=None):
    """A cylinder / frustum object (see bm_cylinder) with a UV0 layer."""
    bm = new_bmesh(); bm_cylinder(bm, radius, depth, center, segments, radius_top, cap, rot)
    return new_mesh_object(name, bm, coll)


def apply_modifiers(ob):
    """Apply every modifier of `ob` in stack order (raises when one fails)."""
    select_only(ob)
    for name in [m.name for m in ob.modifiers]:
        must(bpy.ops.object.modifier_apply(modifier=name), f"apply modifier {name} on {ob.name}")


def apply_scale(ob):
    """Apply the object's scale to its mesh (array offsets and bevel widths are in object space)."""
    select_only(ob)
    must(bpy.ops.object.transform_apply(location=False, rotation=False, scale=True), f"apply scale on {ob.name}")


def apply_transform(ob):
    """Bake location, rotation and scale into the mesh; the object ends at the origin, unrotated. (Updates the view
    layer first: `matrix_world` is stale right after setting `location` / `rotation_euler`.)"""
    bpy.context.view_layer.update()
    ob.data.transform(ob.matrix_world)
    ob.matrix_world = Matrix.Identity(4)


def finish(ob, bevel=0.012, segments=1, smooth_angle=35, weighted=True, triangulate=False, bevel_angle=40):
    """The standard finishing chain (ART_BIBLE 5.2): angle-limited bevel -> smooth shading with sharp edges above
    `smooth_angle` degrees -> weighted normals (flat big faces, the highlight on the bevel). All applied.
    bevel = width in metres (0 = none: rocks); segments = 1 is enough. Unwrap AFTER this (bevels perturb UVs)."""
    if bevel > 0:
        m = ob.modifiers.new("Bevel", 'BEVEL')
        m.width = bevel; m.segments = segments; m.limit_method = 'ANGLE'; m.angle_limit = math.radians(bevel_angle)
        m.miter_outer = 'MITER_ARC'; m.harden_normals = False
    if triangulate:
        t = ob.modifiers.new("Tri", 'TRIANGULATE'); t.keep_custom_normals = True
    if ob.modifiers: apply_modifiers(ob)
    me = ob.data
    for p in me.polygons: p.use_smooth = True
    me.set_sharp_from_angle(angle=math.radians(smooth_angle))
    if weighted:
        w = ob.modifiers.new("WN", 'WEIGHTED_NORMAL'); w.mode = 'FACE_AREA'; w.weight = 50; w.keep_sharp = True
        apply_modifiers(ob)
    return ob


def tri_count(ob, evaluated=True):
    """Triangles of `ob` after triangulation (evaluated = with modifiers)."""
    if evaluated:
        dg = bpy.context.evaluated_depsgraph_get()
        e = ob.evaluated_get(dg); me = e.to_mesh()
        n = sum(len(p.vertices) - 2 for p in me.polygons)
        e.to_mesh_clear()
        return n
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


def set_origin(ob, world_point):
    """Move the pivot to `world_point` without moving the geometry (no operator, no cursor)."""
    bpy.context.view_layer.update()
    mw = ob.matrix_world.copy()
    local = mw.inverted() @ Vector(world_point)
    ob.data.transform(Matrix.Translation(-local))
    ob.matrix_world = mw @ Matrix.Translation(local)


def tessellate_max_edge(ob, max_len, max_iter=8):
    """Split every edge longer than `max_len` metres so per-vertex lighting has enough samples (0.5 m near, 1.5 m far).
    Triangulates the mesh."""
    bpy.context.view_layer.update()
    bm = bmesh.new(); bm.from_mesh(ob.data)
    sc = ob.matrix_world.to_scale()
    for _ in range(max_iter):
        long_edges = [e for e in bm.edges if ((e.verts[0].co - e.verts[1].co) * sc).length > max_len]
        if not long_edges: break
        bmesh.ops.subdivide_edges(bm, edges=long_edges, cuts=1)
        bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4], quad_method='BEAUTY', ngon_method='BEAUTY')
    bmesh.ops.triangulate(bm, faces=bm.faces[:], quad_method='BEAUTY', ngon_method='BEAUTY')
    bm.to_mesh(ob.data); bm.free()


def bisect(ob, point, normal):
    """Cut `ob` along the plane through world `point` with world `normal`: an edge loop exactly where you want one,
    nothing removed (UVs, colours and marks are interpolated). Use it where a part disappears under another one (a
    panel behind a band, a post behind a rail): a vertex bake samples only at vertices, so without a loop at the edge
    of the cover the buried, dark vertices shade the visible face all the way to its next vertex. Returns the number
    of faces afterwards."""
    bpy.context.view_layer.update()
    mw = ob.matrix_world; inv = mw.inverted()
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=inv @ Vector(point),
                           plane_no=(mw.to_3x3().transposed() @ Vector(normal)).normalized())
    n = len(bm.faces)
    bm.to_mesh(ob.data); bm.free()
    return n


def harmonise(objs):
    """Give every mesh in `objs` the same colour attributes, UV layers and per-face marks before a join: a layer one part
    lacks is created there (colours white, UVs zero, marks 0). Join leaves a missing layer UNINITIALISED otherwise, which
    shows up as garbage colours and as GLBs that differ from run to run."""
    import numpy as np
    cols = []; uvs = []; marks = []
    for o in objs:
        for c in o.data.color_attributes:
            if c.name not in cols: cols.append(c.name)
        for l in o.data.uv_layers:
            if l.name not in uvs: uvs.append(l.name)
        for t in o.data.attributes:                                  # the library's per-face marks ("ks_vl": vertex-lit, "ks_group")
            if t.name.startswith("ks_") and t.domain == 'FACE' and t.data_type == 'INT' and t.name not in marks: marks.append(t.name)
    for o in objs:
        me = o.data
        active = me.color_attributes.active_color.name if me.color_attributes.active_color else None
        for l in uvs:
            if l not in me.uv_layers: me.uv_layers.new(name=l)
        for t in marks:                                              # a part without the mark joins as 0 (not marked), never as garbage
            if t not in me.attributes:
                me.attributes.new(t, 'INT', 'FACE').data.foreach_set("value", np.zeros(len(me.polygons), dtype=np.int32))
        for c in cols:
            if c not in me.color_attributes:
                ca = me.color_attributes.new(c, 'FLOAT_COLOR', 'CORNER')
                ca.data.foreach_set("color", np.ones(len(me.loops) * 4, dtype=np.float32))
        if active: me.color_attributes.active_color = me.color_attributes[active]
        if len(me.uv_layers): me.uv_layers.active = me.uv_layers[0]


def join(objs, name=None):
    """Join mesh objects into the first (which keeps its origin). UV layers, colour attributes and vertex groups merge BY
    NAME; layers a part lacks are created first (`harmonise`). Returns the survivor, renamed to `name` if given."""
    objs = [o for o in objs if o is not None]
    if not objs: raise RuntimeError("mesh.join: nothing to join")
    harmonise(objs)
    bpy.context.view_layer.update()                                # object matrices may be stale after setting location
    if len(objs) > 1:
        select(objs)
        must(bpy.ops.object.join(), "join")
    ob = objs[0]
    if name: ob.name = name; ob.data.name = "me_" + name
    return ob


def linked_duplicate(src, name, loc=(0, 0, 0), rot_z=0.0, coll=None):
    """A linked duplicate (same mesh datablock). Apply modifiers on `src` first or every copy exports its own mesh."""
    d = bpy.data.objects.new(name, src.data)
    d.location = loc; d.rotation_euler = (0, 0, rot_z)
    return link(d, coll)


def duplicate(src, name, coll=None):
    """An independent copy of a mesh object (own mesh data, same transform)."""
    d = bpy.data.objects.new(name, src.data.copy())
    d.matrix_world = src.matrix_world.copy()
    return link(d, coll)


def delete_faces(ob, predicate):
    """Delete the faces for which `predicate(face, world_centre, world_normal)` is true: bottoms, backs against walls,
    interior faces nobody sees (ART_BIBLE 5.3 rule 7). `face` is a BMFace; centre and normal are WORLD space.
    (Only this function takes three arguments: the `faces=` callables of uv / vcol / material take the polygon alone.)
    Returns the number removed."""
    bpy.context.view_layer.update()
    bm = bmesh.new(); bm.from_mesh(ob.data)
    mw = ob.matrix_world; nm = mw.to_3x3().inverted_safe().transposed()
    dead = [f for f in bm.faces if predicate(f, mw @ f.calc_center_median(), (nm @ f.normal).normalized())]
    n = len(dead)
    if dead: bmesh.ops.delete(bm, geom=dead, context='FACES')
    bm.to_mesh(ob.data); bm.free()
    return n


def bounds(objs):
    """World-space (min, max) Vectors over the vertices of `objs` (mesh objects)."""
    if not isinstance(objs, (list, tuple)): objs = [objs]
    bpy.context.view_layer.update()
    mn = Vector((1e18,) * 3); mx = Vector((-1e18,) * 3)
    for ob in objs:
        if ob.type != 'MESH': continue
        mw = ob.matrix_world
        for v in ob.data.vertices:
            w = mw @ v.co
            mn = Vector(map(min, mn, w)); mx = Vector(map(max, mx, w))
    return mn, mx


def recalc_normals(ob):
    """Make every face normal point outward (after hand-built bmesh geometry)."""
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(ob.data); bm.free()
