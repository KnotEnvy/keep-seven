"""Cycles baking: lightmaps, light layers, the neutral texel, calibration, procedural tiles. Verified on Blender 4.5.14
(docs/research/blender-pipeline.md 4, 5; ARCHITECTURE 7.4).

Baked light in this game:
  * a LIGHTMAP stores Cycles diffuse light (direct + indirect, no albedo) / lightmapScale (2), sRGB-encoded, 8 bit, in
    blender/export/lm/<id>.png. Runtime: albedo x texel x 2.
  * every lightmap reserves a NEUTRAL TEXEL: the 4 x 4 block at its top-left corner, painted white (black on a light
    layer). A vertex-lit vertex of a lightmapped mesh puts UV1 at its centre (`set_vertex_lit_uv1`), so its COLOR_0
    (tint x light / 2) displays exactly as on a pure vertex-lit mesh: one mesh, one shader, both kinds of surface.
  * a LIGHT LAYER is a single-channel image on the same UV1 holding one switchable light (`bake_light_layer`).

Recommended: 64 samples + OIDN (`bake_lightmap(denoise=True)`); CPU for anything under 1024 px, 'CUDA' above
(`use_cycles` returns the device actually used: never depend on a GPU). Blender image rows run bottom-up.
Every bake here (and `vcol.bake_vertex_light`) runs with Cycles' light tree OFF unless asked otherwise: measured, it
doubles to triples the noise of a room lit by a few emissive lamp meshes and changes nothing under a sun and a sky.
"""
import bpy, bmesh, math, os, time, tempfile
import numpy as np
from mathutils import Vector
from . import manifest, texdraw
from .scene import deselect_all, select_only, link
from .mesh import new_mesh_object


# ------------------------------------------------------------------ engine and lights
def use_cycles(device='CPU', samples=64, denoise=True, threads=0):
    """Switch the scene to Cycles. device: 'CPU' | 'CUDA' ('OPTIX' has no device on this machine). Returns the device
    ACTUALLY selected (falls back to 'CPU'): scripts must work on CPU."""
    s = bpy.context.scene
    s.render.engine = 'CYCLES'
    c = s.cycles; c.samples = samples; c.use_adaptive_sampling = True; c.use_denoising = denoise
    if threads:
        s.render.threads_mode = 'FIXED'; s.render.threads = threads
    if device == 'CPU':
        c.device = 'CPU'; return 'CPU'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    try:
        prefs.compute_device_type = device
        prefs.get_devices()
    except Exception:
        c.device = 'CPU'; return 'CPU'
    found = False
    for d in prefs.devices:
        d.use = (d.type == device); found = found or d.use
    if not found:
        c.device = 'CPU'; return 'CPU'
    c.device = 'GPU'
    return device


def add_sun(to_sun, strength=3.0, colour=(1.0, 0.63, 0.32), angle_deg=4.0, name="Sun"):
    """A sun lamp shining FROM the Blender-space direction `to_sun` (see layout.sun()). angle_deg = angular diameter
    (4 degrees in the art bible: large soft shadows). Returns the light object."""
    d = bpy.data.lights.new(name, 'SUN'); d.energy = strength; d.color = colour; d.angle = math.radians(angle_deg)
    o = bpy.data.objects.new(name, d); link(o)
    o.rotation_euler = Vector(to_sun).normalized().to_track_quat('Z', 'Y').to_euler()   # a sun shines along its -Z
    return o


def set_world(colour=(0.19, 0.24, 0.69), strength=1.0):
    """Uniform world (sky / ambient) light. Returns the Background node (its "Strength" is what calibrate adjusts)."""
    s = bpy.context.scene
    if s.world is None: s.world = bpy.data.worlds.new("World")
    s.world.use_nodes = True
    bg = s.world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (*colour, 1.0); bg.inputs["Strength"].default_value = strength
    return bg


class only_lights:
    """`with bake.only_lights([hatch_lamp]):` hides every other light, zeroes the world and silences emissive
    objects that are not listed, for baking one light layer."""
    def __init__(self, keep): self.keep = {o.name for o in keep}; self.saved = []
    def __enter__(self):
        s = bpy.context.scene
        for o in s.objects:
            if o.type == 'LIGHT' and o.name not in self.keep:
                self.saved.append(('hide', o, o.hide_render)); o.hide_render = True
            elif "emit_strength" in o.keys() and o.name not in self.keep:
                self.saved.append(('emit', o, o["emit_strength"])); o["emit_strength"] = 0.0
        if s.world and s.world.use_nodes:
            bg = s.world.node_tree.nodes.get("Background")
            if bg:
                self.saved.append(('world', bg, bg.inputs["Strength"].default_value)); bg.inputs["Strength"].default_value = 0.0
        return self
    def __exit__(self, *a):
        for kind, o, v in self.saved:
            if kind == 'hide': o.hide_render = v
            elif kind == 'emit': o["emit_strength"] = v
            else: o.inputs["Strength"].default_value = v


# ------------------------------------------------------------------ bake plumbing
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
    """Diffuse bakes return black for metallic surfaces: force Metallic to 0 for the duration of the bake."""
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


def pixels(img):
    """Pixels of a Blender image as an (h, w, 4) float array, rows BOTTOM-UP."""
    w, h = img.size
    a = np.empty(w * h * 4, dtype=np.float32); img.pixels.foreach_get(a)
    return a.reshape(h, w, 4)


def new_image(name, width, height, fill=(0.0, 0.0, 0.0, 0.0)):
    """A float RGBA image datablock (bake targets must be float: baked light exceeds 1)."""
    img = bpy.data.images.new(name, width, height, alpha=True, float_buffer=True)
    a = np.empty((height, width, 4), dtype=np.float32); a[:] = fill
    img.pixels.foreach_set(a.ravel())
    return img


def denoise_image_compositor(img, out_path_exr=None):
    """Run OIDN on an image through the compositor (a bake is never denoised by Cycles itself). Returns a new float
    image datablock. 16 spp + OIDN matches 256 spp raw."""
    tmp = out_path_exr or os.path.join(tempfile.mkdtemp(prefix="ks_dn_"), "dn.exr")
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
    s.render.filepath = tmp
    s.view_settings.view_transform = 'Standard'
    win = bpy.context.window; old = win.scene if win else None
    if win: win.scene = s
    r = bpy.ops.render.render(write_still=True, scene=s.name)
    if win and old: win.scene = old
    bpy.data.scenes.remove(s)
    if r != {'FINISHED'}: raise RuntimeError(f"compositor denoise failed: {r}")
    out = bpy.data.images.load(tmp)
    out.pixels[0]                       # force the load before the temp file can go away
    return out


def bake_lightmap(objs, texture_id=None, img=None, uv_name="UVLight", samples=64, margin_px=4, direct=True, indirect=True,
                  clear=True, denoise=True, light_tree=False):
    """Bake diffuse light (no albedo) of `objs` into one float image through their "UVLight" layer.

    texture_id: the lightmap's manifest id ('lm_tally'): the image is created at the manifest size. Or pass `img`.
    Every material on every object gets the bake image node for the duration; metallic is forced to 0.
    Everything visible in the scene lights and occludes (embedded props, emissive lamp meshes). Vertex-lit faces
    (UV1 collapsed on the neutral texel) receive nothing: paint the neutral block afterwards (save_lightmap does).
    `light_tree=False`: Cycles' light tree is switched OFF for the bake (and restored). In a room lit by a sun, a sky
    and a few emissive lamp meshes the tree triples the noise the denoiser has to hide (the fixture room at 64 samples,
    error against 8 192: 25.6 % raw / 4.4 % denoised with it, 8.0 % / 2.4 % without, and faster); under a sun and a
    sky alone it makes no difference. Pass True only for a scene with dozens of lamp meshes, and compare.
    Returns (image, seconds). Save with `save_lightmap(image, texture_id)`: that divides by lightmapScale."""
    s = bpy.context.scene
    if s.render.engine != 'CYCLES': use_cycles('CPU', samples)
    if img is None:
        if texture_id is None: raise ValueError("bake_lightmap: pass texture_id or img")
        w, h = manifest.texture(texture_id)["size"]
        img = new_image("bake_" + texture_id, w, h)
    s.cycles.samples = samples
    b = s.render.bake
    b.target = 'IMAGE_TEXTURES'; b.use_selected_to_active = False
    b.margin = margin_px; b.margin_type = 'EXTEND'; b.use_clear = clear
    b.use_pass_direct = direct; b.use_pass_indirect = indirect; b.use_pass_color = False
    deselect_all()
    for o in objs:
        if uv_name not in o.data.uv_layers: raise RuntimeError(f"bake_lightmap: {o.name} has no '{uv_name}' layer (uv.unwrap_lightmap first)")
        if not o.material_slots: raise RuntimeError(f"bake_lightmap: {o.name} has no material (material.assign first)")
        o.select_set(True)
        o.data.uv_layers.active = o.data.uv_layers[uv_name]
    bpy.context.view_layer.objects.active = objs[0]
    saved_tree = s.cycles.use_light_tree; s.cycles.use_light_tree = bool(light_tree)
    try:
        with BakeTarget(objs, img), NonMetal(objs):
            t = time.perf_counter()
            r = bpy.ops.object.bake(type='DIFFUSE')
            dt = time.perf_counter() - t
    finally: s.cycles.use_light_tree = saved_tree
    for o in objs: o.data.uv_layers.active = o.data.uv_layers[0]
    if r != {'FINISHED'}: raise RuntimeError(f"lightmap bake failed: {r}")
    if denoise:
        t = time.perf_counter(); img = denoise_image_compositor(img); dt += time.perf_counter() - t
    return img, dt


def bake_light_layer(objs, texture_id, lights, samples=64, margin_px=4, denoise=True, light_tree=False):
    """Bake ONE switchable light into a single-channel layer on the same UV1 as the zone's lightmap (lm_tally_hatch,
    lm_bore_glow). `lights` = the light objects and / or emissive mesh objects that make up the layer; everything else
    is switched off for the bake. Returns (image, seconds); save_lightmap stores its luminance / 2."""
    with only_lights(lights):
        return bake_lightmap(objs, texture_id, samples=samples, margin_px=margin_px, denoise=denoise, light_tree=light_tree)


# ------------------------------------------------------------------ the neutral texel
def neutral_uv(texture_id):
    """Blender UV of the centre of the lightmap's neutral 4 x 4 block (top-left corner of the image)."""
    u, v = manifest.texture(texture_id)["neutralTexel"]["uv"]
    return (u, 1.0 - v)


def set_vertex_lit_uv1(ob, faces, texture_id):
    """Point UV1 ("UVLight") of the vertex-lit `faces` at the neutral texel centre of lightmap `texture_id`."""
    from . import uv
    uv.fill(ob, neutral_uv(texture_id), faces, layer=uv.UV1)


def paint_neutral_texel(a, value, px=(0, 0, 4, 4)):
    """Paint the neutral block of a TOP-DOWN array (h, w[, c]) in place: `value` in every channel (alpha 1)."""
    x, y, w, h = px
    if a.ndim == 2: a[y:y + h, x:x + w] = value
    else:
        a[y:y + h, x:x + w, :3] = value
        if a.shape[2] == 4: a[y:y + h, x:x + w, 3] = 1.0
    return a


def encode_lightmap(lin, texture_id):
    """Linear light (h, w, 3|4) TOP-DOWN -> what the PNG stores: / lightmapScale, sRGB OETF for colour lightmaps,
    luminance kept linear for r8 layers; neutral texel painted. Returns the array to write."""
    t = manifest.texture(texture_id)
    scale = t.get("lightmapScale", 2)
    x = np.clip(np.asarray(lin, dtype=np.float32)[:, :, :3] / scale, 0.0, 1.0)
    if t["format"] == "r8":
        out = (x[:, :, 0] * 0.2126 + x[:, :, 1] * 0.7152 + x[:, :, 2] * 0.0722).astype(np.float32)
        if t.get("colorSpace") == "srgb": out = texdraw.linear_to_srgb(out).astype(np.float32)
    else:
        out = np.ones(x.shape[:2] + (3,), dtype=np.float32)
        out[:, :, :3] = texdraw.linear_to_srgb(x) if t.get("colorSpace", "srgb") == "srgb" else x
    nt = t["neutralTexel"]
    v = nt["value"]
    return paint_neutral_texel(out, v, tuple(nt["px"]))


def save_lightmap(img, texture_id, path=None, placeholder=False):
    """Write a baked float image as the lightmap / layer `texture_id`: blender/export/lm/<id>.png (see
    `staged_lightmap_path`: the build driver ships it with the zone), value / 2, neutral texel painted, size checked
    against the manifest. Returns the path written.
    A lightmap with a bake script of its own (its manifest `source` is no asset's script: `lm_surface` from
    bake_surface.py) also gets `<path>.deps.json`, like an asset's: the project modules this run imported and the props
    it embedded, so the build driver re-bakes it when a shared helper module or an embedded prop changes."""
    t = manifest.texture(texture_id)
    w, h = img.size
    if [w, h] != list(t["size"]): raise RuntimeError(f"save_lightmap: {texture_id} must be {t['size']}, image is {[w, h]}")
    lin = pixels(img)[::-1]                                    # to top-down
    out = encode_lightmap(lin, texture_id)
    path = path or staged_lightmap_path(texture_id)
    texdraw.write_png(path, out, {"placeholder": "1"} if placeholder else None)
    src = t.get("source")
    if src and not placeholder and not any(a.get("source") == src for a in manifest.load()["assets"].values()):
        import json
        from . import export
        with open(path + ".deps.json", "w", encoding="utf-8") as f:
            json.dump({"texture": texture_id, "embedded": sorted(export._embedded), "modules": export.project_modules(), "tables": manifest.tables_used()}, f)
    return path


def staged_lightmap_path(texture_id):
    """Where `save_lightmap` writes: blender/export/lm/<id>.png when the script is run by hand; under the build driver
    (environment KS_STAGE_TAG) the temporary name `.<id>.<tag>.png` beside it, which the driver renames together with
    the zone's GLB only after Blender, the optimiser and check-glb all passed. A failed zone never leaves a new
    lightmap next to an old GLB."""
    final = manifest.raw_texture_path(texture_id)
    tag = os.environ.get("KS_STAGE_TAG")
    if not tag: return final
    return os.path.join(os.path.dirname(final), f".{texture_id}.{tag}.png")


def save_png(img, path):
    """Write a Blender image as an 8-bit PNG exactly as stored (no view transform)."""
    a = pixels(img)[::-1]
    texdraw.write_png(path, a if img.channels == 4 else a[:, :, :3])
    return path


# ------------------------------------------------------------------ calibration (ART_BIBLE 3)
def calibrate(key_target, ambient_target, sun=None, world=None, samples=256, height=None):
    """"Bake calibration, not magic numbers" (ART_BIBLE 3): set the sun's strength so that a white diffuse test plane
    FACING THE KEY reads `key_target` from the sun alone, and the world's strength so that a plane FACING UP IN OPEN
    SHADE reads `ambient_target` from the sky alone. Readings are bake output (Cycles DIFFUSE, direct + indirect, no
    albedo: the same quantity a lightmap stores before the / 2), linear, in the light's brightest channel, so the
    art bible's "#FFD09A x 1.30" means: colour the lamp #FFD09A, calibrate to 1.30.
    `sun` = the SUN light object (default: the first in the scene; None and no sun in the scene = interiors: only the
    world is calibrated); `world` = the Background node (default: the scene world's). The planes sit `height` m above
    everything, so only the sky occludes them, and are removed afterwards. Other lights are hidden while measuring.
    Returns (sun_strength, world_strength, {'key': reading, 'ambient': reading})."""
    from . import vcol
    s = bpy.context.scene
    if s.render.engine != 'CYCLES': use_cycles('CPU', samples)
    if sun is None: sun = next((o for o in s.objects if o.type == 'LIGHT' and o.data.type == 'SUN'), None)
    if world is None:
        if s.world is None or not s.world.use_nodes: set_world()
        world = s.world.node_tree.nodes.get("Background")
    bpy.context.view_layer.update()
    top = max([max((o.matrix_world @ Vector(c)).z for c in o.bound_box) for o in s.objects if o.type == 'MESH'] or [0.0])
    z = top + (height if height is not None else 200.0)

    def plane(name, loc, normal):
        bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=4, y_segments=4, size=0.5)
        ob = new_mesh_object(name, bm)
        ob.location = loc; ob.rotation_euler = Vector(normal).normalized().to_track_quat('Z', 'Y').to_euler()
        return ob

    to_sun = (sun.matrix_world.to_3x3() @ Vector((0, 0, 1))).normalized() if sun is not None else Vector((0, 0, 1))
    pk = plane("_cal_key", (0, 0, z), to_sun); pa = plane("_cal_amb", (60, 0, z), (0, 0, 1))
    bpy.context.view_layer.update()
    hidden = [o for o in s.objects if o.type == 'LIGHT' and o is not sun and not o.hide_render]
    for o in hidden: o.hide_render = True
    emit = [(o, o["emit_strength"]) for o in s.objects if "emit_strength" in o.keys()]
    for o, _ in emit: o["emit_strength"] = 0.0
    old_samples = s.cycles.samples

    def measure(sun_e, world_e):
        if sun is not None: sun.data.energy = sun_e
        world.inputs["Strength"].default_value = world_e
        s.cycles.samples = samples
        b = s.render.bake; b.target = 'VERTEX_COLORS'
        b.use_pass_direct = True; b.use_pass_indirect = True; b.use_pass_color = False
        deselect_all()
        for o in (pk, pa): vcol.color_layer(o, "_cal"); o.select_set(True)
        bpy.context.view_layer.objects.active = pk
        r = bpy.ops.object.bake(type='DIFFUSE')
        b.target = 'IMAGE_TEXTURES'
        if r != {'FINISHED'}: raise RuntimeError(f"calibration bake failed: {r}")
        return [float(vcol.get_colors(o, "_cal")[:, :3].mean(axis=0).max()) for o in (pk, pa)]

    _, a_w = measure(0.0, 1.0)                                 # the sky alone, in open shade
    world_e = ambient_target / max(a_w, 1e-9)
    sun_e = 0.0; key = 0.0
    if sun is not None:
        k_s, _ = measure(1.0, 0.0)                             # the sun alone, on the plane facing it
        sun_e = key_target / max(k_s, 1e-9)
        key = measure(sun_e, 0.0)[0]
    amb = measure(0.0, world_e)[1]
    if sun is not None: sun.data.energy = sun_e
    world.inputs["Strength"].default_value = world_e
    s.cycles.samples = old_samples
    for o in hidden: o.hide_render = False
    for o, v in emit: o["emit_strength"] = v
    for o in (pk, pa):
        me = o.data; bpy.data.objects.remove(o, do_unlink=True); bpy.data.meshes.remove(me)
    bpy.context.view_layer.update()
    return sun_e, world_e, {"key": key, "ambient": amb}


# ------------------------------------------------------------------ procedural tiles baked to images (optional route)
def torus_coords(nt, scale=1.0, scale_v=None):
    """UV (0..1) -> a 4D point on a Clifford torus: 4D noise fed with these tiles exactly. Returns (vector socket,
    w socket). scale / scale_v = feature count per tile along U / V."""
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


def unit_plane(name="BakePlane"):
    """A 1 x 1 m plane with UVs 0..1 (the surface a procedural tile is baked on)."""
    bm = bmesh.new()
    bm.loops.layers.uv.new("UVMap")
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5, calc_uvs=True)
    return new_mesh_object(name, bm)


def bake_target(mat, name, size, colorspace):
    """Add an active image node to `mat` for a bake. size = int or (w, h). Returns (image, node)."""
    w, h = (size, size) if isinstance(size, int) else size
    img = bpy.data.images.new(name, w, h, alpha=False, float_buffer=False)
    img.colorspace_settings.name = colorspace
    n = mat.node_tree.nodes.new("ShaderNodeTexImage"); n.image = img
    for x in mat.node_tree.nodes: x.select = False
    n.select = True; mat.node_tree.nodes.active = n
    return img, n


def bake_socket_as_emit(ob, mat, socket_name, img_name, size, colorspace, samples=4):
    """Bake whatever feeds Principled.<socket_name> of `mat` by routing it through an Emission shader (works for any
    channel). margin 0: a tile must not be dilated. Returns the image."""
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
    if bpy.context.scene.render.engine != 'CYCLES': use_cycles('CPU', samples)
    bpy.context.scene.cycles.samples = samples
    select_only(ob)
    r = bpy.ops.object.bake(type='EMIT', margin=0, use_clear=True)
    L.new(orig, outn.inputs["Surface"]); N.remove(em); N.remove(node)
    if r != {'FINISHED'}: raise RuntimeError(f"bake {socket_name} failed: {r}")
    return img


def bake_normal(ob, mat, img_name, size, samples=4):
    """Bake Bump / Normal nodes of `mat` to a tangent-space normal map (+Y up). Unused by the world (no normal maps in
    this game); kept for the gun owner's experiments."""
    img, node = bake_target(mat, img_name, size, 'Non-Color')
    bpy.context.scene.cycles.samples = samples
    select_only(ob)
    r = bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', margin=0, use_clear=True)
    mat.node_tree.nodes.remove(node)
    if r != {'FINISHED'}: raise RuntimeError(f"normal bake failed: {r}")
    return img


def seam_error(img):
    """(wrap_x, inner_x, wrap_y, inner_y) of a Blender image: see texdraw.seam_error."""
    return texdraw.seam_error(pixels(img)[:, :, :3])


def tile_preview(img, path, n=2):
    """Write the image repeated n x n times as a PNG (does it tile?)."""
    a = pixels(img)[::-1]
    texdraw.write_png(path, texdraw.tile(a[:, :, :3], n, n))
    return path
