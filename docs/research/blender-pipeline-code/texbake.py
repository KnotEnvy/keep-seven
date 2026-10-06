"""Tileable procedural texture -> baked albedo / roughness / normal. Verified on Blender 4.5.14 (doc section 4)."""
import bpy, bmesh, math
import numpy as np
from common import *

def unit_plane(name="BakePlane"):
    bm = bmesh.new()
    bm.loops.layers.uv.new("UVMap")            # calc_uvs only fills an EXISTING uv layer
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5, calc_uvs=True)   # 1 x 1 m, UV 0..1
    return new_mesh_object(name, bm)

def torus_coords(nt, scale=1.0, scale_v=None):
    """UV (0..1) -> 4D point on a Clifford torus. Returns (vector_socket, w_socket). 4D noise fed with these tiles exactly.
    scale / scale_v = feature count per tile along U / V (different values = stretched grain)."""
    N = nt.nodes; L = nt.links
    tc = N.new("ShaderNodeTexCoord")
    sep = N.new("ShaderNodeSeparateXYZ"); L.new(tc.outputs["UV"], sep.inputs[0])
    def trig(src, fn, sc):
        m = N.new("ShaderNodeMath"); m.operation = 'MULTIPLY'; m.inputs[1].default_value = 2 * math.pi; L.new(src, m.inputs[0])
        t = N.new("ShaderNodeMath"); t.operation = fn; L.new(m.outputs[0], t.inputs[0])
        k = N.new("ShaderNodeMath"); k.operation = 'MULTIPLY'; k.inputs[1].default_value = sc / (2 * math.pi); L.new(t.outputs[0], k.inputs[0])
        return k.outputs[0]
    su = scale; sv = scale if scale_v is None else scale_v
    comb = N.new("ShaderNodeCombineXYZ")
    L.new(trig(sep.outputs["X"], 'COSINE', su), comb.inputs["X"])
    L.new(trig(sep.outputs["X"], 'SINE', su), comb.inputs["Y"])
    L.new(trig(sep.outputs["Y"], 'COSINE', sv), comb.inputs["Z"])
    return comb.outputs[0], trig(sep.outputs["Y"], 'SINE', sv)

def make_plank_material(name="M_PlankProc"):
    """Example procedural: staggered planks (Brick texture, integer repeats) + stretched 4D grain noise + bump."""
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; N = nt.nodes; L = nt.links
    bsdf = N["Principled BSDF"]
    vec, w = torus_coords(nt, scale=3.0, scale_v=40.0)     # grain: long along U, fine along V
    n1 = N.new("ShaderNodeTexNoise"); n1.noise_dimensions = '4D'
    n1.inputs["Scale"].default_value = 1.0; n1.inputs["Detail"].default_value = 6.0; n1.inputs["Roughness"].default_value = 0.6
    L.new(vec, n1.inputs["Vector"]); L.new(w, n1.inputs["W"])
    tc = N.new("ShaderNodeTexCoord")
    br = N.new("ShaderNodeTexBrick")
    br.inputs["Scale"].default_value = 1.0
    br.inputs["Brick Width"].default_value = 0.5; br.inputs["Row Height"].default_value = 0.125   # 8 rows, 2 per row
    br.inputs["Mortar Size"].default_value = 0.008; br.inputs["Mortar Smooth"].default_value = 0.6; br.offset = 0.5
    br.inputs["Color1"].default_value = (0.30, 0.19, 0.10, 1); br.inputs["Color2"].default_value = (0.24, 0.15, 0.08, 1)
    br.inputs["Mortar"].default_value = (0.03, 0.02, 0.015, 1)
    L.new(tc.outputs["UV"], br.inputs["Vector"])
    mr = N.new("ShaderNodeMapRange"); mr.inputs["To Min"].default_value = 0.65; mr.inputs["To Max"].default_value = 1.15
    L.new(n1.outputs["Fac"], mr.inputs["Value"])
    mix = N.new("ShaderNodeMix"); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs["Factor"].default_value = 1.0
    L.new(br.outputs["Color"], mix.inputs["A"]); L.new(mr.outputs["Result"], mix.inputs["B"])
    L.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
    mr2 = N.new("ShaderNodeMapRange"); mr2.inputs["To Min"].default_value = 0.55; mr2.inputs["To Max"].default_value = 0.9
    L.new(n1.outputs["Fac"], mr2.inputs["Value"]); L.new(mr2.outputs["Result"], bsdf.inputs["Roughness"])
    hmix = N.new("ShaderNodeMath"); hmix.operation = 'MULTIPLY_ADD'   # height = 0.35 * noise + (1 - mortar)
    inv = N.new("ShaderNodeMath"); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1.0; L.new(br.outputs["Fac"], inv.inputs[1])
    L.new(n1.outputs["Fac"], hmix.inputs[0]); hmix.inputs[1].default_value = 0.35; L.new(inv.outputs[0], hmix.inputs[2])
    bump = N.new("ShaderNodeBump"); bump.inputs["Strength"].default_value = 1.0; bump.inputs["Distance"].default_value = 0.01
    L.new(hmix.outputs[0], bump.inputs["Height"]); L.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return m

def bake_target(mat, name, size, colorspace):
    img = bpy.data.images.new(name, size, size, alpha=False, float_buffer=False)
    img.colorspace_settings.name = colorspace                       # 'sRGB' for albedo, 'Non-Color' for data
    n = mat.node_tree.nodes.new("ShaderNodeTexImage"); n.image = img
    for x in mat.node_tree.nodes: x.select = False
    n.select = True; mat.node_tree.nodes.active = n                 # the bake writes into the ACTIVE image node
    return img, n

def bake_socket_as_emit(ob, mat, socket_name, img_name, size, colorspace, samples=4):
    """Bake whatever feeds Principled.<socket_name> by routing it through an Emission shader.
    Works for any channel and for metals (a DIFFUSE/COLOR bake of a metal is black)."""
    nt = mat.node_tree; N = nt.nodes; L = nt.links
    bsdf = N["Principled BSDF"]; outn = next(n for n in N if n.type == 'OUTPUT_MATERIAL')
    orig = outn.inputs["Surface"].links[0].from_socket
    em = N.new("ShaderNodeEmission")
    sock = bsdf.inputs[socket_name]
    if sock.is_linked: L.new(sock.links[0].from_socket, em.inputs["Color"])
    else:
        v = sock.default_value
        em.inputs["Color"].default_value = (v, v, v, 1) if isinstance(v, float) else v
    L.new(em.outputs[0], outn.inputs["Surface"])
    img, node = bake_target(mat, img_name, size, colorspace)
    bpy.context.scene.cycles.samples = samples
    select_only(ob)
    r = bpy.ops.object.bake(type='EMIT', margin=0, use_clear=True)  # margin 0: a tile must not be dilated
    L.new(orig, outn.inputs["Surface"]); N.remove(em); N.remove(node)
    if r != {'FINISHED'}: raise RuntimeError(f"bake {socket_name} failed: {r}")
    return img

def bake_normal(ob, mat, img_name, size, samples=4):                # Bump/Normal nodes -> tangent-space normal map (+Y up)
    img, node = bake_target(mat, img_name, size, 'Non-Color')
    bpy.context.scene.cycles.samples = samples
    select_only(ob)
    r = bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', margin=0, use_clear=True)
    mat.node_tree.nodes.remove(node)
    if r != {'FINISHED'}: raise RuntimeError(f"normal bake failed: {r}")
    return img

def save_png(img, path):
    img.filepath_raw = path; img.file_format = 'PNG'; img.save()    # writes the pixels as stored; no view transform

def seam_error(img):
    """(wrap_x, inner_x, wrap_y, inner_y): mean abs difference across the tile seam vs. between interior neighbours."""
    w, h = img.size
    a = np.empty(w * h * 4, dtype=np.float32); img.pixels.foreach_get(a); a = a.reshape(h, w, 4)[:, :, :3]
    return (float(np.abs(a[:, 0] - a[:, -1]).mean()), float(np.abs(a[:, 1:] - a[:, :-1]).mean()),
            float(np.abs(a[0] - a[-1]).mean()), float(np.abs(a[1:] - a[:-1]).mean()))

def tile_preview(img, path, n=2):
    w, h = img.size
    a = np.empty(w * h * 4, dtype=np.float32); img.pixels.foreach_get(a); a = a.reshape(h, w, 4)
    t = np.tile(a, (n, n, 1))
    o = bpy.data.images.new("tile_preview", w * n, h * n, alpha=False)
    o.colorspace_settings.name = img.colorspace_settings.name
    o.pixels.foreach_set(t.ravel()); save_png(o, path); bpy.data.images.remove(o)
