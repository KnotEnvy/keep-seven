"""Lightmap baking helpers (prototype for blender/lib/bake.py). Verified on Blender 4.5.14, see docs/research/blender-pipeline.md."""
import bpy, math, os, time
import numpy as np
from common import *

def ensure_uv(ob, name):
    uvl = ob.data.uv_layers.get(name) or ob.data.uv_layers.new(name=name)
    return uvl

def unwrap_lightmap(objs, uv_name="UVLight", margin_px=4, res=1024, angle=66):
    """One shared atlas for all objs. Leaves UV0 as the active_render layer; sets uv_name ACTIVE (bake target)."""
    for o in objs:
        if len(o.data.uv_layers) == 0:
            o.data.uv_layers.new(name="UVMap")           # keep slot 0 for the material UVs => lightmap is TEXCOORD_1
        ensure_uv(o, uv_name)
        o.data.uv_layers.active = o.data.uv_layers[uv_name]
    deselect_all()
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    r = bpy.ops.uv.smart_project(angle_limit=math.radians(angle), margin_method='FRACTION', island_margin=margin_px / res,
                                 rotate_method='AXIS_ALIGNED', area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    if r != {'FINISHED'}: raise RuntimeError(f"smart_project failed: {r}")

def uv_density(objs, uv_name, res):
    import bmesh
    area3d = 0.0; areauv = 0.0
    for ob in objs:
        bm = bmesh.new(); bm.from_mesh(ob.data); bm.transform(ob.matrix_world)
        uv = bm.loops.layers.uv[uv_name]
        bmesh.ops.triangulate(bm, faces=bm.faces)
        for f in bm.faces:
            area3d += f.calc_area()
            a, b, c = (l[uv].uv for l in f.loops)
            areauv += abs((b - a).cross(c - a)) * 0.5
        bm.free()
    return math.sqrt(areauv * res * res / area3d), areauv, area3d

class BakeTarget:
    """Adds an (active, selected) Image Texture node holding `img` to every material of objs; removes them on exit."""
    def __init__(self, objs, img): self.objs = objs; self.img = img; self.nodes = []
    def __enter__(self):
        seen = set()
        for o in self.objs:
            for slot in o.material_slots:
                m = slot.material
                if m is None or m.name in seen: continue
                seen.add(m.name)
                if not m.use_nodes: m.use_nodes = True
                nt = m.node_tree
                n = nt.nodes.new("ShaderNodeTexImage"); n.image = self.img
                for x in nt.nodes: x.select = False
                n.select = True; nt.nodes.active = n
                self.nodes.append((nt, n))
        return self
    def __exit__(self, *a):
        for nt, n in self.nodes: nt.nodes.remove(n)

class NonMetal:
    """Diffuse bakes return black for metallic=1 surfaces. Temporarily force Metallic to 0 (unlink + zero) for the bake."""
    def __init__(self, objs): self.objs = objs; self.saved = []
    def __enter__(self):
        seen = set()
        for o in self.objs:
            for slot in o.material_slots:
                m = slot.material
                if m is None or m.name in seen or not m.use_nodes: continue
                seen.add(m.name)
                for n in m.node_tree.nodes:
                    if n.type == 'BSDF_PRINCIPLED':
                        sock = n.inputs["Metallic"]
                        src = sock.links[0].from_socket if sock.is_linked else None
                        if src: m.node_tree.links.remove(sock.links[0])
                        self.saved.append((m.node_tree, sock, sock.default_value, src))
                        sock.default_value = 0.0
        return self
    def __exit__(self, *a):
        for nt, sock, val, src in self.saved:
            sock.default_value = val
            if src: nt.links.new(src, sock)

def bake_lightmap(objs, img, uv_name="UVLight", samples=64, margin_px=4, direct=True, indirect=True, clear=True):
    s = bpy.context.scene
    s.cycles.samples = samples
    b = s.render.bake
    b.target = 'IMAGE_TEXTURES'
    b.use_selected_to_active = False
    b.margin = margin_px; b.margin_type = 'EXTEND'
    b.use_clear = clear
    b.use_pass_direct = direct; b.use_pass_indirect = indirect; b.use_pass_color = False
    deselect_all()
    for o in objs:
        o.select_set(True)
        o.data.uv_layers.active = o.data.uv_layers[uv_name]
    bpy.context.view_layer.objects.active = objs[0]
    with BakeTarget(objs, img), NonMetal(objs):
        t = time.perf_counter()
        r = bpy.ops.object.bake(type='DIFFUSE')
        dt = time.perf_counter() - t
    if r != {'FINISHED'}:                                   # e.g. a material without an image node -> {'CANCELLED'}, no exception
        raise RuntimeError(f"lightmap bake failed: {r}")
    for o in objs:
        o.data.uv_layers.active = o.data.uv_layers[0]
    return dt

def bake_vertex_light(objs, attr="Color", samples=64, kind='DIFFUSE'):
    """Bake light ('DIFFUSE', direct+indirect, no albedo) or 'AO' into a CORNER float colour attribute. Needs no UVs or materials.
    Values can exceed 1: scale before export (COLOR_0 is normalised)."""
    s = bpy.context.scene
    s.cycles.samples = samples
    b = s.render.bake
    b.target = 'VERTEX_COLORS'
    b.use_pass_direct = True; b.use_pass_indirect = True; b.use_pass_color = False
    deselect_all()
    for o in objs:
        ca = o.data.color_attributes.get(attr) or o.data.color_attributes.new(attr, 'FLOAT_COLOR', 'CORNER')
        o.data.color_attributes.active_color = ca          # the bake writes the ACTIVE colour attribute
        o.data.color_attributes.render_color_index = o.data.color_attributes.find(attr)
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    with NonMetal(objs):
        r = bpy.ops.object.bake(type=kind)
    b.target = 'IMAGE_TEXTURES'
    if r != {'FINISHED'}: raise RuntimeError(f"vertex bake failed: {r}")

def pixels(img):
    w, h = img.size
    a = np.empty(w * h * 4, dtype=np.float32); img.pixels.foreach_get(a)
    return a.reshape(h, w, 4)

def srgb_oetf(x):
    x = np.clip(x, 0.0, 1.0)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)

def save_lightmap_png(img, path, scale=1.0):
    """Float linear lightmap -> 8-bit sRGB PNG holding (value / scale). In three: colorSpace = SRGBColorSpace, lightMapIntensity = PI * scale."""
    a = pixels(img).copy()
    a[:, :, :3] = srgb_oetf(a[:, :, :3] / scale); a[:, :, 3] = 1.0
    w, h = img.size
    o = bpy.data.images.new("lm_out", w, h, alpha=False, float_buffer=False)
    o.colorspace_settings.name = 'sRGB'
    o.pixels.foreach_set(a.ravel())
    o.filepath_raw = path; o.file_format = 'PNG'; o.save()
    bpy.data.images.remove(o)

def denoise_image_compositor(img, out_path_exr):
    """Run OIDN on an image through the compositor (bake itself is never denoised). Returns a new float image datablock."""
    s = bpy.data.scenes.new("DenoiseScene")
    s.render.resolution_x, s.render.resolution_y = img.size; s.render.resolution_percentage = 100
    s.use_nodes = True
    nt = s.node_tree
    for n in list(nt.nodes): nt.nodes.remove(n)
    i = nt.nodes.new("CompositorNodeImage"); i.image = img
    d = nt.nodes.new("CompositorNodeDenoise"); d.use_hdr = True; d.prefilter = 'NONE'
    c = nt.nodes.new("CompositorNodeComposite")
    nt.links.new(i.outputs["Image"], d.inputs["Image"]); nt.links.new(d.outputs["Image"], c.inputs["Image"])
    s.render.image_settings.file_format = 'OPEN_EXR'; s.render.image_settings.color_depth = '32'
    s.render.image_settings.color_mode = 'RGB'
    s.render.filepath = out_path_exr
    s.view_settings.view_transform = 'Standard'
    win = bpy.context.window
    old = win.scene
    win.scene = s
    bpy.ops.render.render(write_still=True, scene=s.name)
    win.scene = old
    bpy.data.scenes.remove(s)
    return bpy.data.images.load(out_path_exr)
