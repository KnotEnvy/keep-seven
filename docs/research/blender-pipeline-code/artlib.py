"""Stylised low/mid-poly look helpers (prototype for blender/lib/mesh.py + vcol.py). Verified on Blender 4.5.14."""
import bpy, bmesh, math, random, time
import numpy as np
from mathutils import Vector, Matrix, noise
from common import *

def bm_box(bm, size, center=(0, 0, 0), rot=None):
    """Append a box to bm. size = full extents. Returns its verts."""
    r = bmesh.ops.create_cube(bm, size=1.0)
    vs = r['verts']
    bmesh.ops.scale(bm, vec=size, verts=vs)
    if rot is not None: bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=rot, verts=vs)
    bmesh.ops.translate(bm, vec=center, verts=vs)
    return vs

def finish(ob, bevel=0.012, segments=1, smooth_angle=35, weighted=True, triangulate=False):
    """Standard finishing chain: bevel (angle-limited) -> smooth by angle -> weighted normals; all applied."""
    if bevel > 0:
        m = ob.modifiers.new("Bevel", 'BEVEL')
        m.width = bevel; m.segments = segments; m.limit_method = 'ANGLE'; m.angle_limit = math.radians(40)
        m.miter_outer = 'MITER_ARC'; m.harden_normals = False
    if triangulate:
        t = ob.modifiers.new("Tri", 'TRIANGULATE'); t.keep_custom_normals = True
    apply_modifiers(ob)
    me = ob.data
    for p in me.polygons: p.use_smooth = True
    me.set_sharp_from_angle(angle=math.radians(smooth_angle))
    if weighted:
        w = ob.modifiers.new("WN", 'WEIGHTED_NORMAL'); w.mode = 'FACE_AREA'; w.weight = 50; w.keep_sharp = True
        apply_modifiers(ob)
    return ob

def tessellate_max_edge(ob, max_len, max_iter=8):
    """Split every edge longer than max_len (world units) so per-vertex lighting has enough samples."""
    bm = bmesh.new(); bm.from_mesh(ob.data)
    sc = ob.matrix_world.to_scale()
    for _ in range(max_iter):
        long_edges = [e for e in bm.edges if ((e.verts[0].co - e.verts[1].co) * sc).length > max_len]
        if not long_edges: break
        bmesh.ops.subdivide_edges(bm, edges=long_edges, cuts=1)
        bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4], quad_method='BEAUTY', ngon_method='BEAUTY')
    bmesh.ops.triangulate(bm, faces=bm.faces[:], quad_method='BEAUTY', ngon_method='BEAUTY')
    bm.to_mesh(ob.data); bm.free()

def color_layer(ob, name="Color"):
    me = ob.data
    ca = me.color_attributes.get(name) or me.color_attributes.new(name, 'FLOAT_COLOR', 'CORNER')
    me.color_attributes.active_color = ca
    me.color_attributes.render_color_index = me.color_attributes.find(name)
    return ca

def get_colors(ob, name="Color"):
    ca = ob.data.color_attributes[name]
    a = np.empty(len(ca.data) * 4, dtype=np.float32); ca.data.foreach_get("color", a)
    return a.reshape(-1, 4)

def set_colors(ob, arr, name="Color"):
    ca = color_layer(ob, name)
    ca.data.foreach_set("color", np.ascontiguousarray(arr, dtype=np.float32).ravel()); ob.data.update()

def corner_positions(ob):
    me = ob.data
    co = np.empty(len(me.vertices) * 3, dtype=np.float32); me.vertices.foreach_get("co", co); co = co.reshape(-1, 3)
    li = np.empty(len(me.loops), dtype=np.int32); me.loops.foreach_get("vertex_index", li)
    return co[li]

def corner_normals(ob):
    me = ob.data
    n = np.empty(len(me.loops) * 3, dtype=np.float32); me.corner_normals.foreach_get("vector", n)
    return n.reshape(-1, 3)

def fill_color(ob, rgb, name="Color"):
    n = len(ob.data.loops)
    a = np.ones((n, 4), dtype=np.float32); a[:, :3] = rgb
    set_colors(ob, a, name)

def bake_ao_vertex(objs, name="AO", samples=64, distance=1.0):
    """Cycles AO -> vertex colour attribute `name` on each object (CPU is fastest for vertex bakes)."""
    s = bpy.context.scene
    s.render.engine = 'CYCLES'; s.cycles.device = 'CPU'; s.cycles.samples = samples
    if s.world is None: s.world = bpy.data.worlds.new("World")
    s.world.light_settings.distance = distance
    deselect_all()
    saved = {}
    for o in objs:
        saved[o.name] = o.data.color_attributes.active_color.name if o.data.color_attributes.active_color else None
        color_layer(o, name); o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    s.render.bake.target = 'VERTEX_COLORS'
    t = time.perf_counter(); r = bpy.ops.object.bake(type='AO'); dt = time.perf_counter() - t
    s.render.bake.target = 'IMAGE_TEXTURES'
    if r != {'FINISHED'}: raise RuntimeError(f"vertex AO bake failed: {r}")
    return dt

def compose_vertex_color(ob, base_rgb, ao_name="AO", ao_strength=0.8, gradient=(0.75, 1.1), up_tint=0.06,
                         jitter=0.06, seed=1, out="Color"):
    """Color = base * lerp(1, AO, s) * height gradient * (1 + up-facing boost) * per-face jitter. Linear RGB."""
    me = ob.data
    pos = corner_positions(ob); nrm = corner_normals(ob)
    ao = get_colors(ob, ao_name)[:, 0:1] if ao_name in me.color_attributes else np.ones((len(pos), 1), np.float32)
    z = pos[:, 2:3]; z0, z1 = z.min(), z.max()
    t = (z - z0) / max(1e-6, z1 - z0)
    grad = gradient[0] + (gradient[1] - gradient[0]) * t                       # darker at the base, lighter on top
    up = 1.0 + up_tint * np.clip(nrm[:, 2:3], 0, 1)                            # sky-facing faces slightly brighter
    rng = np.random.default_rng(seed)
    poly_of_loop = np.empty(len(me.loops), dtype=np.int32)
    ls = np.empty(len(me.polygons), dtype=np.int32); me.polygons.foreach_get("loop_start", ls)
    lt = np.empty(len(me.polygons), dtype=np.int32); me.polygons.foreach_get("loop_total", lt)
    poly_of_loop[:] = np.repeat(np.arange(len(me.polygons)), lt)
    jit = 1.0 + (rng.random(len(me.polygons), dtype=np.float32)[poly_of_loop][:, None] - 0.5) * 2 * jitter
    col = np.ones((len(pos), 4), dtype=np.float32)
    col[:, :3] = np.asarray(base_rgb, dtype=np.float32)[None, :] * (1 - ao_strength + ao_strength * ao) * grad * up * jit
    set_colors(ob, col, out)
    # export only `out`: drop helper layers
    for extra in [c.name for c in me.color_attributes if c.name != out]:
        me.color_attributes.remove(me.color_attributes[extra])
    color_layer(ob, out)

def vcol_material(name, roughness=0.8, metallic=0.0, attr="Color", image=None):
    """Principled whose Base Color = vertex colour (x optional image). Exports as COLOR_0 (+ baseColorTexture)."""
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    b.inputs["Roughness"].default_value = roughness; b.inputs["Metallic"].default_value = metallic
    vc = nt.nodes.new("ShaderNodeVertexColor"); vc.layer_name = attr
    if image is None:
        nt.links.new(vc.outputs["Color"], b.inputs["Base Color"])
    else:
        tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = image
        mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs["Factor"].default_value = 1.0
        nt.links.new(tex.outputs["Color"], mix.inputs["A"]); nt.links.new(vc.outputs["Color"], mix.inputs["B"])
        nt.links.new(mix.outputs["Result"], b.inputs["Base Color"])
    return m
