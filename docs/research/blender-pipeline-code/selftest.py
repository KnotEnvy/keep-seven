"""Smoke test for every prototype helper in this folder. Exits non-zero on failure.
tools/blender.sh -b --factory-startup --python-exit-code 1 -P docs/research/blender-pipeline-code/selftest.py -- <out_dir> [CPU|CUDA]
then:  node docs/research/blender-pipeline-code/selftest-check.mjs <out_dir>
"""
import bpy, bmesh, sys, os, math, traceback
sys.dont_write_bytecode = True          # keep __pycache__ out of docs/
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
import cyclesutil, lightmap as LM, riglib as R, artlib as A, materials as M, texbake as TB, exportlib as X
import numpy as np
from mathutils import Quaternion

def box(n, size, loc):
    bm = bmesh.new(); A.bm_box(bm, size, loc); return new_mesh_object(n, bm)

def test_art(out):
    reset_scene()
    bm = bmesh.new(); A.bm_box(bm, (0.8, 0.8, 0.8), (0, 0, 0.4)); A.bm_box(bm, (0.9, 0.1, 0.1), (0, -0.42, 0.7))
    ob = new_mesh_object("Crate", bm)
    A.finish(ob, bevel=0.01)
    assert ob.data.has_custom_normals
    set_origin(ob, (0.4, 0.4, 0.0)); bpy.context.view_layer.update()
    assert abs(ob.matrix_world.translation.x - 0.4) < 1e-6 and abs(min(v.co.x for v in ob.data.vertices) + 0.85) < 1e-4
    A.bake_ao_vertex([ob], "AO", samples=16, distance=0.5)
    A.compose_vertex_color(ob, (0.35, 0.22, 0.11))
    ob.data.materials.append(A.vcol_material("M_Wood"))
    assert [c.name for c in ob.data.color_attributes] == ["Color"]
    X.marker("MK_spawn", (2.0, -5.0, 0.0), 90, type="spawn")
    rep = X.budget_report()
    assert rep["tris"] == tri_count(ob, False) and rep["materials"] == ["M_Wood"], rep
    try: X.assert_budget(rep, max_tris=10); raise AssertionError("budget should have failed")
    except RuntimeError: pass
    X.export_glb(os.path.join(out, "selftest_art.glb"))

def test_textures(out, device):
    reset_scene()
    got = cyclesutil.use_cycles('CPU', samples=4, denoise=False)
    plane = TB.unit_plane(); pm = TB.make_plank_material(); plane.data.materials.append(pm)
    alb = TB.bake_socket_as_emit(plane, pm, "Base Color", "T_alb", 256, 'sRGB')
    rgh = TB.bake_socket_as_emit(plane, pm, "Roughness", "T_rgh", 256, 'Non-Color')
    nrm = TB.bake_normal(plane, pm, "T_nrm", 256)
    paths = {}
    for img, k in ((alb, "albedo"), (rgh, "rough"), (nrm, "normal")):
        paths[k] = os.path.join(out, f"selftest_plank_{k}.png"); TB.save_png(img, paths[k])
        wx, ix, wy, iy = TB.seam_error(img)
        assert wx < 3 * ix + 0.01 and wy < 3 * iy + 0.01, f"{k} does not tile: {wx} {ix} {wy} {iy}"
    TB.tile_preview(alb, os.path.join(out, "selftest_plank_tiled.png"))
    n = LM.pixels(nrm)[:, :, :3]
    assert n[:, :, 2].mean() > 0.9 and (n[:, :, 0].max() - n[:, :, 0].min()) > 0.2, "normal map is flat or wrong"
    bpy.data.objects.remove(plane)
    # use the baked set on a cube; plus an alpha-tested grate
    cube = box("TexCube", (1, 1, 1), (0, 0, 0.5))
    select_only(cube); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    must(bpy.ops.uv.cube_project(cube_size=1.0, correct_aspect=True, scale_to_bounds=False), "cube_project")
    bpy.ops.object.mode_set(mode='OBJECT')
    cube.data.materials.append(M.textured("M_Plank", paths["albedo"], paths["rough"], paths["normal"]))
    gimg = bpy.data.images.new("T_grate", 32, 32, alpha=True)
    a = np.ones((32, 32, 4), dtype=np.float32); a[::8, :, 3] = 0; a[:, ::8, 3] = 0; gimg.pixels.foreach_set(a.ravel()); gimg.pack()
    bm = bmesh.new(); bm.loops.layers.uv.new("UVMap"); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5, calc_uvs=True)
    grate = new_mesh_object("Grate", bm); grate.location = (2, 0, 0)
    gm = M.principled("M_Grate", (0.2, 0.2, 0.2, 1), 1.0, 0.4, emission=(1, 0.3, 0.1), emission_strength=3.0)
    t = gm.node_tree.nodes.new("ShaderNodeTexImage"); t.image = gimg
    gm.node_tree.links.new(t.outputs["Color"], gm.node_tree.nodes["Principled BSDF"].inputs["Base Color"])
    M.alpha_mask(gm); grate.data.materials.append(gm)
    X.export_glb(os.path.join(out, "selftest_tex.glb"))

def test_lightmap(out, device):
    reset_scene()
    objs = []
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=3.0); objs.append(new_mesh_object("Floor", bm))
    objs.append(box("Box", (1, 1, 1), (0, 0, 0.5)))
    m = M.principled("M_Lit", (0.6, 0.5, 0.4, 1), 1.0, 0.8)           # metallic on purpose: NonMetal must rescue the bake
    for o in objs: o.data.materials.append(m)
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", 'SUN')); sun.data.energy = 3; sun.rotation_euler = (0.8, 0, 0.5)
    bpy.context.scene.collection.objects.link(sun)
    got = cyclesutil.use_cycles(device, samples=8, denoise=False)
    LM.unwrap_lightmap(objs, "UVLight", margin_px=4, res=256)
    assert [l.name for l in objs[0].data.uv_layers] == ["UVMap", "UVLight"]
    d, auv, a3 = LM.uv_density(objs, "UVLight", 256)
    assert 20 < d < 60 and abs(a3 - 42.0) < 0.01, (d, a3)
    img = bpy.data.images.new("LM", 256, 256, alpha=True, float_buffer=True)
    dt = LM.bake_lightmap(objs, img, samples=8, margin_px=2)
    assert LM.pixels(img)[:, :, :3].max() > 0.1, "lightmap is black"
    dn = LM.denoise_image_compositor(img, os.path.join(out, "selftest_lm.exr"))
    LM.save_lightmap_png(dn, os.path.join(out, "selftest_lm.png"), scale=4.0)
    # AO map on the lightmap UVs -> glTF occlusion slot (texCoord 1)
    ao = bpy.data.images.new("AO_zone", 128, 128, alpha=False); ao.colorspace_settings.name = 'Non-Color'
    bpy.context.scene.world = bpy.data.worlds.new("World"); bpy.context.scene.world.light_settings.distance = 1.0
    for o in objs: o.select_set(True); o.data.uv_layers.active = o.data.uv_layers["UVLight"]
    with LM.BakeTarget(objs, ao):
        must(bpy.ops.object.bake(type='AO'), "AO image bake")
    for o in objs: o.data.uv_layers.active = o.data.uv_layers[0]
    ao.pack(); M.set_occlusion_map(m, ao, "UVLight")
    for o in objs: o["lightmap"] = "selftest_lm"; o["lightmapScale"] = 4.0
    X.export_glb(os.path.join(out, "selftest_lightmap.glb"))
    # vertex-colour light on a tessellated copy of the floor
    A.tessellate_max_edge(objs[0], 1.0)
    assert tri_count(objs[0], False) > 30
    cyclesutil.use_cycles('CPU', samples=16, denoise=False)
    LM.bake_vertex_light(objs, "Color", samples=16)
    c = A.get_colors(objs[0], "Color")
    assert c[:, :3].max() > 0.1 and c[:, :3].min() < c[:, :3].max() * 0.9, "vertex light bake has no shadow/light variation"
    print(f"lightmap bake on {got}: {dt:.2f}s")

def test_rig(out):
    s = reset_scene(); s.render.fps = 30
    bones = [("root", (0, 0, 0), (0, 0, 0.3), None), ("body", (0, 0, 0.7), (0, 0, 1.3), "root"), ("arm_L", (0.35, 0, 1.3), (0.35, 0, 0.7), "body")]
    arm = R.make_armature("BotRig", bones)
    mesh = R.join_as_rigid_skin({"body": [box("b", (0.5, 0.3, 0.6), (0, 0, 1.0))], "arm_L": [box("a", (0.12, 0.12, 0.6), (0.35, 0, 1.0))]}, arm, "Bot")
    lamp = box("BotLamp", (0.1, 0.1, 0.1), (0, -0.2, 1.2)); R.parent_to_bone(lamp, arm, "body")
    bpy.context.view_layer.update()
    assert lamp.matrix_world.translation.length < 1e-5, "parent_to_bone moved the object"
    acts = []
    a = R.new_action(arm, "Idle"); R.reset_pose(arm)
    for f, y in ((0, 0), (30, 0.03), (60, 0)): R.key_pose(arm, f, {"body": {"loc": (0, y, 0)}})
    acts.append(a)
    a = R.new_action(arm, "Wave"); R.reset_pose(arm)
    q = Quaternion((1, 0, 0), math.radians(60)); q.negate()                      # deliberately flipped sign
    R.key_pose(arm, 0, {"arm_L": {"rot": (0, 0, 0)}}); R.key_pose(arm, 10, {"arm_L": {"rot": q}}); R.key_pose(arm, 20, {"arm_L": {"rot": (0, 0, 0)}})
    R.set_interpolation(a, 'LINEAR')
    acts.append(a)
    for a in acts: R.fix_quaternion_flips(a)
    R.reset_pose(arm)
    R.push_to_nla(arm, acts)
    X.export_glb(os.path.join(out, "selftest_rig.glb"), export_animation_mode='NLA_TRACKS')
    # smooth skin variants on a tube
    s = reset_scene()
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=0.08, radius2=0.06, depth=1.0)
    bmesh.ops.translate(bm, vec=(0, 0, 0.5), verts=bm.verts)
    for z in (0.2, 0.4, 0.5, 0.6, 0.8):
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, z), plane_no=(0, 0, 1))
    tube = new_mesh_object("Tube", bm)
    arm = R.make_armature("TubeRig", [("upper", (0, 0, 0), (0, 0, 0.5), None), ("lower", (0, 0, 0.5), (0, 0, 1.0), "upper")])
    R.auto_weights(tube, arm)
    tube2 = box("Blocks", (0.1, 0.1, 1.0), (0.5, 0, 0.5))
    R.skin_rigid(tube2, arm, lambda v: "upper" if v.co.z < 0.5 else "lower")
    assert {g.name for g in tube2.vertex_groups} == {"upper", "lower"}
    X.export_glb(os.path.join(out, "selftest_skin.glb"), export_animations=False)

def main():
    argv = argv_after_dashes(); out = os.path.abspath(argv[0]); device = argv[1] if len(argv) > 1 else 'CPU'
    os.makedirs(out, exist_ok=True)
    test_art(out); test_textures(out, device); test_lightmap(out, device); test_rig(out)
    print("SELFTEST OK")

try: main()
except BaseException:
    traceback.print_exc(); sys.exit(1)
