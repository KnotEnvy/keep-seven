"""Contact sheets for critics (the Blender half of `node tools/preview-asset.mjs`).

    tools/blender.sh -b --factory-startup --python-exit-code 1 -P blender/tools/preview.py -- <in.glb|in.blend> <out.png> [options]

    (default)                 8-view Workbench turntable showing vertex colours, about 0.5 s. Every view is FITTED: the
                              subject's bounding box fills its tile with about 10 % to spare (--no-fit: one distance for
                              all views, from the bounding sphere, so a turntable keeps its scale)
    --clip NAME               5 frames of a clip at 0, 25, 50, 75, 100 % (or --frames 0,10,20), all from one view
                              (--angles "az:el" chooses it), framed on the whole clip so the subject does not jump
    --engine CYCLES           lit beauty views (--device CPU|CUDA, --samples 32); game materials are rebuilt so the shared
                              textures show (vertex colour x texture)
    --cull --elev 50          dollhouse view into a room or zone: back faces are not drawn, so the walls between the
                              camera and the interior vanish (Workbench and Cycles)
    --baked                   CYCLES: no preview light; every surface EMITS what the runtime draws from the file's baked
                              light: COLOR_0 x texture x lightmap x 2 on lightmapped faces, COLOR_0 x texture x 2 on
                              vertex-lit ones (the mesh extras `bake` / `lightmap` decide). The look of a baked room
    --shots "x,y,z>x,y,z;..." eye-level shots: camera position > look-at target, Blender coordinates, one tile each
    --angles "0:90;35:48"     orbit views by azimuth:elevation instead of a turntable
    --bounds x0,y0,z0,x1,y1,z1 frames that box (a zone's layout bounds) instead of everything in the file
    --views N --cols N --size PX --zoom F --lens MM --color VERTEX|MATERIAL|TEXTURE --wire
Negative coordinates: write --shots=... (argparse takes a leading `-` for a flag otherwise).
"""
import sys, os
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
while not (os.path.isfile(os.path.join(_d, "lib", "__init__.py")) or os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py"))):
    if os.path.dirname(_d) == _d: raise SystemExit(f"blender/lib not found above {os.path.abspath(__file__)}")   # never loop at the filesystem root
    _d = os.path.dirname(_d)
sys.path.insert(0, _d if os.path.isfile(os.path.join(_d, "lib", "__init__.py")) else os.path.join(_d, "blender"))
import bpy, math, time, argparse, tempfile
import numpy as np
from mathutils import Vector
from lib import scene as sc, texdraw as td, manifest


def parse():
    p = argparse.ArgumentParser(prog="preview.py")
    p.add_argument("src"); p.add_argument("out")
    p.add_argument("--engine", default="WORKBENCH", choices=["WORKBENCH", "CYCLES"])
    p.add_argument("--views", type=int, default=8); p.add_argument("--cols", type=int, default=4)
    p.add_argument("--size", type=int, default=480); p.add_argument("--elev", type=float, default=20.0)
    p.add_argument("--color", default="VERTEX"); p.add_argument("--samples", type=int, default=32)
    p.add_argument("--clip", default=None); p.add_argument("--frames", default=None)
    p.add_argument("--device", default="CPU"); p.add_argument("--wire", action="store_true")
    p.add_argument("--zoom", type=float, default=1.0); p.add_argument("--cull", action="store_true")
    p.add_argument("--shots", default=None); p.add_argument("--lens", type=float, default=50.0)
    p.add_argument("--aspect", type=float, default=1.0, help="tile width / height (16:9 for eye-level shots)")
    p.add_argument("--hide", default="", help="comma-separated object names to hide (collider_terrain is always hidden)")
    p.add_argument("--sun", default="front", choices=["front", "layout"], help="Cycles: light from the asset's front-left, or the level's sun")
    p.add_argument("--cut-above", type=float, default=None, help="remove everything above this Blender Z (open a roofed zone)")
    p.add_argument("--angles", default=None, help='orbit views as "azimuth:elevation;..." in degrees (azimuth 0 = from the front, -Y; elevation 90 = plan view)')
    p.add_argument("--fit", action="store_true", help="(the default now) fit each view to the projected bounds: the subject fills its tile")
    p.add_argument("--no-fit", action="store_true", help="one distance for all views, from the bounding sphere (a turntable that keeps its scale)")
    p.add_argument("--margin", type=float, default=0.10, help="share of the tile left free round a fitted subject")
    p.add_argument("--baked", action="store_true", help="CYCLES: surfaces emit the baked result the runtime draws (lightmap / vertex light), no preview light")
    p.add_argument("--bounds", default=None, help='frame this Blender box "x0,y0,z0,x1,y1,z1" instead of the mesh bounds (a zone: its layout bounds)')
    return p.parse_args(sc.argv_after_dashes())


def load(src):
    if src.lower().endswith(".blend"):
        sc.must(bpy.ops.wm.open_mainfile(filepath=src), "open blend")
    else:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        try: r = bpy.ops.import_scene.gltf(filepath=src, disable_bone_shape=True)       # no icosphere meshes for bones
        except TypeError: r = bpy.ops.import_scene.gltf(filepath=src)
        sc.must(r, "import glb")
    return bpy.context.scene


def world_bounds(scene):
    dg = bpy.context.evaluated_depsgraph_get()
    mn = Vector((1e9,) * 3); mx = Vector((-1e9,) * 3); n = 0
    for ob in scene.objects:
        if ob.type != 'MESH' or ob.hide_render: continue
        e = ob.evaluated_get(dg)
        for c in e.bound_box:
            w = e.matrix_world @ Vector(c)
            mn = Vector(map(min, mn, w)); mx = Vector(map(max, mx, w)); n += 1
    if n == 0: raise RuntimeError("no mesh objects to preview")
    return mn, mx


def game_materials(scene):
    """Swap imported materials (m_prop, m_prop.001 ...) for the library's preview materials so textures show."""
    from lib import material
    for m in list(bpy.data.materials):                                # imported materials keep the name: move them aside
        if m.name.split(".")[0] in manifest.MATERIALS: m.name = "imported_" + m.name
    for ob in scene.objects:
        if ob.type != 'MESH': continue
        me = ob.data
        from lib import vcol
        vcol.adopt_imported(ob)
        if len(me.uv_layers): me.uv_layers[0].name = "UVMap"
        for i, m in enumerate(me.materials):
            if m is None: continue
            base = m.name.replace("imported_", "").split(".")[0]
            if base in manifest.MATERIALS:
                me.materials[i] = material.game_material(base)
        if ob.get("emit_strength") is None: ob["emit_strength"] = 1.0


_lightmaps = {}


def lightmap_pixels(texture_id):
    """The raw lightmap as linear light / 2, (h, w, 3) top-down; None when it has not been baked or built yet."""
    if texture_id not in _lightmaps:
        path = manifest.raw_texture_path(texture_id); a = None
        if os.path.isfile(path):
            a = td.read_png(path)[0].astype(np.float32) / 255.0
            if a.ndim == 2: a = np.repeat(a[..., None], 3, axis=2)
            a = td.srgb_to_linear(a[:, :, :3]) if manifest.texture(texture_id).get("colorSpace", "srgb") == "srgb" else a[:, :, :3]
        _lightmaps[texture_id] = a
    return _lightmaps[texture_id]


def baked_materials(scene, cull):
    """--baked: every mesh gets materials that EMIT what the runtime draws from the file's baked light, by the mesh
    extras: bake 'LM' -> colour x lightmap(UV1) x 2 (the neutral texel is white, so the vertex-lit faces of a mixed mesh
    come out at COLOR_0 x 2, as in the game); 'VL' -> colour x 2; anything else -> colour. `colour` is what the
    library's preview material feeds its Base Color: vertex colour x the shared texture. cull = back faces are not drawn."""
    made = {}
    for ob in scene.objects:
        if ob.type != 'MESH': continue
        me = ob.data
        if len(me.uv_layers) > 1: me.uv_layers[1].name = "UVLight"
        kind = ob.get("bake"); lm = ob.get("lightmap") if kind == "LM" else None
        for i, m in enumerate(me.materials):
            if m is None: continue
            key = (m.name, kind, lm)
            if key not in made: made[key] = emit_material(m, kind, lm, cull)
            me.materials[i] = made[key]


def emit_material(src, kind, lm, cull):
    m = src.copy(); m.name = f"baked_{src.name}_{kind}_{lm}"
    nt = m.node_tree; N = nt.nodes; L = nt.links
    b = next((n for n in N if n.type == 'BSDF_PRINCIPLED'), None); out = next(n for n in N if n.type == 'OUTPUT_MATERIAL')
    if b is None: return m
    shader = b.outputs[0]
    if src.name.split(".")[0] != "m_emis":
        base = b.inputs["Base Color"]
        col = base.links[0].from_socket if base.is_linked else None
        em = N.new("ShaderNodeEmission"); em.inputs["Strength"].default_value = 2.0 if kind in ("LM", "VL") else 1.0
        if col is None: em.inputs["Color"].default_value = base.default_value
        img = None
        if lm:
            path = manifest.raw_texture_path(lm)
            if os.path.isfile(path): img = bpy.data.images.load(path, check_existing=True)
        if img is not None and col is not None:
            img.colorspace_settings.name = 'sRGB' if manifest.texture(lm).get("colorSpace", "srgb") == "srgb" else 'Non-Color'
            uvn = N.new("ShaderNodeUVMap"); uvn.uv_map = "UVLight"
            tex = N.new("ShaderNodeTexImage"); tex.image = img; tex.interpolation = 'Linear'; tex.extension = 'EXTEND'
            L.new(uvn.outputs["UV"], tex.inputs["Vector"])
            mul = N.new("ShaderNodeMix"); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs["Factor"].default_value = 1.0
            L.new(col, mul.inputs["A"]); L.new(tex.outputs["Color"], mul.inputs["B"]); col = mul.outputs["Result"]
        if col is not None: L.new(col, em.inputs["Color"])
        shader = em.outputs[0]
        alpha = b.inputs["Alpha"]
        if alpha.is_linked:                                           # m_mask: cut by the mask, as the runtime's alpha test
            tr = N.new("ShaderNodeBsdfTransparent"); mx = N.new("ShaderNodeMixShader")
            L.new(alpha.links[0].from_socket, mx.inputs[0]); L.new(tr.outputs[0], mx.inputs[1]); L.new(shader, mx.inputs[2]); shader = mx.outputs[0]
    L.new(cull_shader(nt, shader) if cull else shader, out.inputs["Surface"])
    return m


def cull_shader(nt, shader):
    """`shader` on front faces, nothing on back faces (for every kind of ray: light enters a culled room as it does a set)."""
    N = nt.nodes; L = nt.links
    geo = N.new("ShaderNodeNewGeometry"); tr = N.new("ShaderNodeBsdfTransparent"); mx = N.new("ShaderNodeMixShader")
    L.new(geo.outputs["Backfacing"], mx.inputs[0]); L.new(shader, mx.inputs[1]); L.new(tr.outputs[0], mx.inputs[2])
    return mx.outputs[0]


def cull_materials(scene):
    """--cull under Cycles: back faces of every material become transparent."""
    seen = set()
    for ob in scene.objects:
        if ob.type != 'MESH': continue
        for m in ob.data.materials:
            if m is None or m.name in seen or not m.use_nodes: continue
            seen.add(m.name)
            out = next((n for n in m.node_tree.nodes if n.type == 'OUTPUT_MATERIAL'), None)
            if out is None or not out.inputs["Surface"].is_linked: continue
            m.node_tree.links.new(cull_shader(m.node_tree, out.inputs["Surface"].links[0].from_socket), out.inputs["Surface"])


def preview_colours(scene):
    """Workbench shows only the vertex colour. Fold in what the game's materials add, so the 0.5 s sheet reads like
    the asset: the palette cell under UV0 for m_prop / m_flat, the emissive cell for m_emis, x 2 on vertex-lit
    vertices (COLOR_0 holds light / 2 there)."""
    from lib import uv as uvl, vcol
    pal = manifest.palette()
    for ob in scene.objects:
        if ob.type != 'MESH' or ob.hide_render: continue
        me = ob.data
        vcol.adopt_imported(ob)
        col = vcol.get_colors(ob, "Color")
        u0 = uvl.get(ob, me.uv_layers[0].name) if len(me.uv_layers) else None
        u1 = uvl.get(ob, me.uv_layers[1].name) if len(me.uv_layers) > 1 else None
        bake_kind = ob.get("bake"); lm = ob.get("lightmap")
        neutral = None; light = None
        if lm and lm in manifest.load()["textures"]:
            nu = manifest.texture(lm)["neutralTexel"]["uv"]; neutral = (nu[0], 1.0 - nu[1])
            light = lightmap_pixels(lm)
        names = [m.name.split(".")[0] if m else None for m in me.materials]
        for p in me.polygons:
            mat = names[p.material_index] if p.material_index < len(names) else None
            for li in range(p.loop_start, p.loop_start + p.loop_total):
                if mat in ("m_prop", "m_flat") and u0 is not None:
                    cell = manifest.palette_name_at(float(u0[li, 0]), float(u0[li, 1]))
                    if cell: col[li, :3] *= manifest.palette_rgb(cell)
                elif mat == "m_emis" and u0 is not None:
                    cell = manifest.palette_name_at(float(u0[li, 0]), float(u0[li, 1]))
                    e = pal["cells"].get(cell, {}).get("emis") if cell else None
                    col[li, :3] = manifest.hex_to_linear(e) if e else (1.0, 0.2, 0.9)
                if bake_kind == "VL" or (bake_kind == "LM" and neutral is not None and u1 is not None
                                         and abs(u1[li, 0] - neutral[0]) < 1e-3 and abs(u1[li, 1] - neutral[1]) < 1e-3):
                    col[li, :3] *= 2.0
                elif bake_kind == "LM" and light is not None and u1 is not None:      # the lightmap, sampled at the corner (coarse)
                    h, w = light.shape[:2]
                    x = min(w - 1, max(0, int(u1[li, 0] * w))); y = min(h - 1, max(0, int((1.0 - u1[li, 1]) * h)))
                    col[li, :3] *= light[y, x] * 2.0
        vcol.set_colors(ob, np.clip(col, 0, 1), "Color")


def setup_engine(scene, a, w, h):
    r = scene.render
    r.resolution_x = w; r.resolution_y = h; r.resolution_percentage = 100
    r.image_settings.file_format = 'PNG'; r.film_transparent = False
    scene.view_settings.view_transform = 'Standard'
    if scene.world is None: scene.world = bpy.data.worlds.new("W")
    if a.engine == "WORKBENCH":
        r.engine = 'BLENDER_WORKBENCH'
        sh = scene.display.shading
        sh.light = 'STUDIO'; sh.color_type = a.color
        sh.show_cavity = True; sh.cavity_type = 'BOTH'; sh.show_shadows = not a.cull; sh.shadow_intensity = 0.3
        sh.show_object_outline = True; sh.show_specular_highlight = False
        sh.show_backface_culling = a.cull
        scene.display.render_aa = '8'
        scene.world.color = (0.16, 0.17, 0.19)
        if a.color == 'VERTEX': preview_colours(scene)
    else:
        r.engine = 'CYCLES'
        c = scene.cycles; c.samples = a.samples; c.use_denoising = True
        from lib import bake
        bake.use_cycles(a.device, a.samples)
        game_materials(scene)
        bg = bake.set_world((0.19, 0.24, 0.69), 0.55)                 # the art bible's violet-blue ambient, toned for a sheet
        nt = scene.world.node_tree                                    # the camera sees neutral grey, not the ambient colour
        lp = nt.nodes.new("ShaderNodeLightPath"); grey = nt.nodes.new("ShaderNodeBackground"); mix = nt.nodes.new("ShaderNodeMixShader")
        grey.inputs["Color"].default_value = (0.16, 0.17, 0.19, 1.0)
        out = next(n for n in nt.nodes if n.type == 'OUTPUT_WORLD')
        nt.links.new(lp.outputs["Is Camera Ray"], mix.inputs[0]); nt.links.new(bg.outputs[0], mix.inputs[1]); nt.links.new(grey.outputs[0], mix.inputs[2])
        nt.links.new(mix.outputs[0], out.inputs["Surface"])
        for o in [o for o in scene.objects if o.type == 'LIGHT']: bpy.data.objects.remove(o)
        scene.cycles.transparent_max_bounces = 16
        if a.baked:                                                   # the file's own baked light, emitted: no sun, no sky
            bg.inputs["Strength"].default_value = 0.0
            c.use_denoising = False
            baked_materials(scene, a.cull)
            return
        if a.cull: cull_materials(scene)
        from lib import layout
        if a.sun == "layout":
            v = Vector(layout.sun()); v.z = max(v.z, 0.6)             # raise the low sun: a sheet wants to see the tops
        else: v = Vector((-0.45, -0.65, 0.62))                        # from the front-left (an asset's front is -Y)
        bake.add_sun(v.normalized(), strength=3.2, colour=(1.0, 0.82, 0.62), angle_deg=4.0, name="PreviewSun")


def add_wire(scene):
    m = bpy.data.materials.new("PreviewWire"); m.diffuse_color = (0, 0, 0, 1)
    base = bpy.data.materials.new("PreviewBase"); base.diffuse_color = (0.7, 0.7, 0.7, 1)
    for ob in [o for o in scene.objects if o.type == 'MESH']:
        if len(ob.data.materials) == 0: ob.data.materials.append(base)
        mod = ob.modifiers.new("PreviewWire", 'WIREFRAME'); mod.thickness = 0.004; mod.use_replace = False; mod.use_even_offset = False
        ob.data.materials.append(m); mod.material_offset = len(ob.data.materials) - 1


def camera(scene, lens):
    cam = scene.camera
    if cam is None or cam.name != "PreviewCam":
        cd = bpy.data.cameras.new("PreviewCam")
        cam = bpy.data.objects.new("PreviewCam", cd); scene.collection.objects.link(cam); scene.camera = cam
    cam.data.lens = lens
    return cam


def world_points(scene):
    """World-space vertices of every visible mesh as an (n, 3) array (evaluated: a posed skin is where it is drawn)."""
    dg = bpy.context.evaluated_depsgraph_get(); out = []
    for ob in scene.objects:
        if ob.type != 'MESH' or ob.hide_render: continue
        e = ob.evaluated_get(dg); me = e.to_mesh()
        co = np.empty(len(me.vertices) * 3, dtype=np.float32); me.vertices.foreach_get("co", co)
        e.to_mesh_clear()
        m = np.array(e.matrix_world, dtype=np.float32)
        out.append(co.reshape(-1, 3) @ m[:3, :3].T + m[:3, 3])
    return np.concatenate(out) if out else np.zeros((0, 3), dtype=np.float32)


def box_points(mn, mx):
    return np.array([[mx.x if i & 1 else mn.x, mx.y if i & 2 else mn.y, mx.z if i & 4 else mn.z] for i in range(8)], dtype=np.float32)


def orbit(scene, mn, mx, az, elev, lens, zoom, aspect, fit=True, margin=0.10, points=None):
    """Aim the preview camera at the subject from azimuth / elevation (radians). fit=True (the default): the camera
    looks at the middle of what it will see and stands at the nearest distance at which every one of `points` (the
    subject's vertices; default the eight corners of the box mn..mx) is inside the frame with `margin` of the tile to
    spare, so the subject fills its tile whatever its shape. fit=False: aimed at the box centre from one distance for
    all views, from the bounding sphere (a turntable that keeps its scale, at the price of a small subject)."""
    cam = camera(scene, lens)
    c = (mn + mx) / 2; radius = max((mx - mn).length / 2, 0.02)
    elev = min(elev, math.radians(89.9))
    d = Vector((math.cos(elev) * math.sin(az), -math.cos(elev) * math.cos(az), math.sin(elev)))
    tan_h = 36 / 2 / lens if aspect >= 1.0 else 36 / 2 / lens * aspect
    tan_v = tan_h / aspect
    if fit:
        q = (-d).to_track_quat('-Z', 'Y'); right = q @ Vector((1, 0, 0)); up = q @ Vector((0, 1, 0))
        P = (box_points(mn, mx) if points is None or not len(points) else np.asarray(points, dtype=np.float32)) - np.array(c, dtype=np.float32)
        x = P @ np.array(right, dtype=np.float32); y = P @ np.array(up, dtype=np.float32); depth = P @ np.array(d, dtype=np.float32)
        k = 1.0 - margin
        cx = (float(x.min()) + float(x.max())) / 2; cy = (float(y.min()) + float(y.max())) / 2; dist = 0.05
        for _ in range(8):                                             # perspective: a near point needs more room than a far one
            dist = max(0.05, float(np.max(depth + np.abs(x - cx) / (tan_h * k))), float(np.max(depth + np.abs(y - cy) / (tan_v * k))))
            z = np.maximum(dist - depth, 1e-4)                         # recentre on the middle of the PROJECTED extent
            sx = (x - cx) / z; sy = (y - cy) / z
            ex = (float(sx.min()) + float(sx.max())) / 2; ey = (float(sy.min()) + float(sy.max())) / 2
            if abs(ex) < 1e-3 * tan_h and abs(ey) < 1e-3 * tan_v: break
            cx += ex * dist * 0.9; cy += ey * dist * 0.9
        dist = dist / zoom
        c = c + right * cx + up * cy
    else:
        fov = 2 * math.atan(36 / 2 / lens / max(aspect, 1.0))
        dist = radius / math.sin(fov / 2) * 1.05 / zoom
    cam.location = c + d * dist
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    cam.data.clip_start = max(0.005, dist - radius * 2.5); cam.data.clip_end = dist + radius * 4
    return cam


def activate_clip(scene, clip):
    """Make `clip` (an NLA track name on any object) the evaluated animation. Returns (first frame, last frame)."""
    f0 = f1 = None
    for ob in scene.objects:
        ad = ob.animation_data
        if ad is None: continue
        found = None
        for tr in ad.nla_tracks:
            tr.mute = True
            if tr.name == clip and tr.strips: found = tr.strips[0]
        if found is None and ad.action is not None and ad.action.name.split(".")[0] == clip: continue
        if found is not None:
            ad.action = found.action
            if found.action.slots: ad.action_slot = found.action_slot or found.action.slots[0]
            a, b = found.action.frame_range
            f0 = a if f0 is None else min(f0, a); f1 = b if f1 is None else max(f1, b)
        else: ad.action = None
    if f0 is None:
        names = sorted({tr.name for ob in scene.objects if ob.animation_data for tr in ob.animation_data.nla_tracks})
        raise RuntimeError(f"no clip '{clip}' in the file (has: {', '.join(names) or 'none'})")
    return f0, f1


def main():
    a = parse(); t0 = time.perf_counter()
    scene = load(os.path.abspath(a.src))
    hide = {"collider_terrain"} | {x for x in a.hide.split(",") if x}
    for o in scene.objects:
        if o.name.split(".")[0] in hide: o.hide_render = True
    if a.cut_above is not None:
        import bmesh
        for o in scene.objects:
            if o.type != 'MESH' or o.hide_render: continue
            bm = bmesh.new(); bm.from_mesh(o.data)
            mw = o.matrix_world
            bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=mw.inverted() @ Vector((0, 0, a.cut_above)),
                                   plane_no=mw.to_3x3().inverted_safe().transposed().inverted_safe() @ Vector((0, 0, 1)), clear_outer=True)
            if len(bm.faces) == 0: o.hide_render = True
            bm.to_mesh(o.data); bm.free()
    w = int(a.size * a.aspect); h = a.size
    setup_engine(scene, a, w, h)
    if a.wire: add_wire(scene)
    views = []                    # (kind, payload, frame)
    if a.shots:
        for s in a.shots.split(";"):
            eye, tgt = s.split(">")
            views.append(("shot", (Vector([float(x) for x in eye.split(",")]), Vector([float(x) for x in tgt.split(",")])), scene.frame_current))
    elif a.clip:
        f0, f1 = activate_clip(scene, a.clip)
        frames = [int(f) for f in a.frames.split(",")] if a.frames else [round(f0 + (f1 - f0) * i / 4) for i in range(5)]
        view = tuple(math.radians(float(x)) for x in a.angles.split(";")[0].split(":")) if a.angles else (math.radians(35), math.radians(a.elev))
        views = [("orbit", view, f) for f in frames]                    # one view for the whole strip (--angles "az:el" chooses it)
    elif a.angles:
        views = [("orbit", tuple(math.radians(float(x)) for x in spec.split(":")), scene.frame_current) for spec in a.angles.split(";") if spec]
    else:
        views = [("orbit", (2 * math.pi * i / a.views + math.radians(35), math.radians(a.elev)), scene.frame_current) for i in range(a.views)]
    scene.frame_set(int(views[0][2]))
    mn, mx = world_bounds(scene)
    if a.clip:                                    # bounds over the whole clip so the framing does not jump
        for _, _, f in views:
            scene.frame_set(int(f)); m2, x2 = world_bounds(scene)
            mn = Vector(map(min, mn, m2)); mx = Vector(map(max, mx, x2))
    if a.bounds:
        b = [float(x) for x in a.bounds.split(",")]
        mn = Vector((min(b[0], b[3]), min(b[1], b[4]), min(b[2], b[5]))); mx = Vector((max(b[0], b[3]), max(b[1], b[4]), max(b[2], b[5])))
    # what a fitted view must contain: the vertices themselves (tighter than their box), a box when one was asked for,
    # the box over the whole clip when the subject moves
    pts = None if (a.bounds or a.clip) else world_points(scene)
    tiles = []; tmp = tempfile.mkdtemp(prefix="ks_preview_")
    t_render = 0.0
    for i, (kind, payload, frame) in enumerate(views):
        scene.frame_set(int(frame))
        if kind == "shot":
            cam = camera(scene, a.lens if a.lens != 50.0 else 18.0)
            eye, tgt = payload
            cam.location = eye; cam.rotation_euler = (tgt - eye).to_track_quat('-Z', 'Y').to_euler()
            cam.data.clip_start = 0.05; cam.data.clip_end = 2000
        else:
            orbit(scene, mn, mx, payload[0], payload[1], a.lens, a.zoom, a.aspect, not a.no_fit, a.margin, pts)
        scene.render.filepath = os.path.join(tmp, f"v{i:02d}.png")
        t = time.perf_counter(); sc.must(bpy.ops.render.render(write_still=True), "render"); t_render += time.perf_counter() - t
        img = bpy.data.images.load(scene.render.filepath)
        px = np.empty(w * h * 4, dtype=np.float32); img.pixels.foreach_get(px)
        bpy.data.images.remove(img)
        tiles.append(np.clip(np.rint(px.reshape(h, w, 4)[::-1, :, :3] * 255.0), 0, 255).astype(np.uint8))
    cols = min(a.cols, len(tiles)); rows = math.ceil(len(tiles) / cols)
    sheet = np.full((rows * h, cols * w, 3), 41, dtype=np.uint8)           # a tile left over shows the backdrop grey, not black
    for i, t in enumerate(tiles):
        r, c = divmod(i, cols)
        sheet[r * h:(r + 1) * h, c * w:(c + 1) * w] = t
    td.write_png(os.path.abspath(a.out), sheet)
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in scene.objects if o.type == 'MESH' and not o.hide_render)
    print(f"PREVIEW {a.engine} {len(tiles)} views {w}x{h}: render {t_render:.2f}s total {time.perf_counter() - t0:.2f}s tris {tris} -> {a.out}")


if __name__ == "__main__":
    sc.run(main)
