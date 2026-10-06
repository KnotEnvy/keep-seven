"""glTF export defaults, markers, budgets. Verified on Blender 4.5.14 / io_scene_gltf2 4.5.51 (doc sections 8 and 10)."""
import bpy, os, math

EXPORT_DEFAULTS = dict(
    export_format='GLB', check_existing=False,
    export_yup=True,                      # Blender +Z up -> glTF +Y up
    export_apply=True,                    # apply modifiers (never the Armature); disables shape-key export
    export_texcoords=True, export_normals=True, export_tangents=False,
    export_materials='EXPORT', export_image_format='AUTO',
    export_vertex_color='ACTIVE', export_all_vertex_colors=False, export_active_vertex_color_when_no_material=True,
    export_attributes=False,
    export_extras=True,                   # custom properties -> extras -> three userData
    export_cameras=False, export_lights=False,
    export_skins=True, export_def_bones=False, export_influence_nb=4, export_all_influences=False,
    export_morph=False,
    export_animations=True, export_animation_mode='ACTIONS', export_force_sampling=True, export_frame_step=1,
    export_anim_slide_to_zero=True, export_optimize_animation_size=True, export_anim_single_armature=True,
    export_reset_pose_bones=True, export_rest_position_armature=True, export_current_frame=False,
    export_nla_strips=True, export_bake_animation=False,
    export_draco_mesh_compression_enable=False,   # meshopt is applied later by a node script; keep exporter output uncompressed
    export_gpu_instances=False, export_shared_accessors=False,
    use_selection=False, use_visible=False, use_renderable=False, use_active_collection=False, use_active_scene=True,
)

def export_glb(path, **overrides):
    kw = dict(EXPORT_DEFAULTS); kw.update(overrides)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    r = bpy.ops.export_scene.gltf(filepath=path, **kw)
    if r != {'FINISHED'}: raise RuntimeError(f"glTF export failed: {r}")
    return path

def marker(name, loc, rot_z_deg=0.0, coll=None, **props):
    """Empty -> glTF node without mesh. Blender (x, y, z) arrives in three as (x, z, -y); an unrotated marker faces three +Z."""
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = 'ARROWS'; e.empty_display_size = 0.5
    e.location = loc; e.rotation_euler = (0, 0, math.radians(rot_z_deg))
    for k, v in props.items(): e[k] = v
    (coll or bpy.context.scene.collection).objects.link(e)
    return e

def budget_report(objects=None):
    """Triangles of the evaluated meshes (after modifiers), materials, images and estimated GPU bytes (RGBA8 + mips)."""
    dg = bpy.context.evaluated_depsgraph_get()
    objects = objects or [o for o in bpy.context.scene.objects if o.type == 'MESH']
    rep = {"objects": {}, "tris": 0, "materials": set(), "images": {}}
    for o in objects:
        e = o.evaluated_get(dg); me = e.to_mesh()
        me.calc_loop_triangles()
        t = len(me.loop_triangles)
        rep["objects"][o.name] = {"tris": t, "verts": len(me.vertices),
                                  "materials": [s.material.name for s in o.material_slots if s.material],
                                  "uv_layers": [l.name for l in o.data.uv_layers], "colors": [c.name for c in o.data.color_attributes],
                                  "shared_mesh": o.data.name if o.data.users > 1 else None}
        rep["tris"] += t
        e.to_mesh_clear()
        for s in o.material_slots:
            if not s.material: continue
            rep["materials"].add(s.material.name)
            if s.material.use_nodes:
                for n in s.material.node_tree.nodes:
                    if n.type == 'TEX_IMAGE' and n.image:
                        w, h = n.image.size
                        rep["images"][n.image.name] = {"size": [w, h], "gpu_bytes": int(w * h * 4 * 4 / 3)}
    rep["materials"] = sorted(rep["materials"])
    rep["draw_calls_est"] = sum(max(1, len(v["materials"])) for v in rep["objects"].values())   # one call per object per material
    rep["gpu_texture_mb"] = round(sum(i["gpu_bytes"] for i in rep["images"].values()) / 1048576, 2)
    return rep

def assert_budget(rep, max_tris=None, max_materials=None, max_texture_mb=None):
    errs = []
    if max_tris is not None and rep["tris"] > max_tris: errs.append(f"tris {rep['tris']} > {max_tris}")
    if max_materials is not None and len(rep["materials"]) > max_materials: errs.append(f"materials {len(rep['materials'])} > {max_materials}")
    if max_texture_mb is not None and rep["gpu_texture_mb"] > max_texture_mb: errs.append(f"textures {rep['gpu_texture_mb']} MB > {max_texture_mb}")
    if errs: raise RuntimeError("BUDGET EXCEEDED: " + "; ".join(errs))
