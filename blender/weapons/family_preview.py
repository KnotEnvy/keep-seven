"""ammo_family.png: every cartridge variant and both pickups at ONE scale beside the gun's cylinder (art-weapons evidence;
not part of the build). Reads the raw exports in blender/export/, lays them out under the revolver seen from its right
side, renders with Cycles under the studio light of fp_preview.py.

    tools/blender.sh -b --factory-startup --python-exit-code 1 -P blender/weapons/family_preview.py -- <out.png> [--device CPU]
"""
import sys, os, math
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
while not (os.path.isfile(os.path.join(_d, "lib", "__init__.py")) or os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py"))):
    if os.path.dirname(_d) == _d: raise SystemExit("blender/lib not found")
    _d = os.path.dirname(_d)
sys.path.insert(0, _d if os.path.isfile(os.path.join(_d, "lib", "__init__.py")) else os.path.join(_d, "blender"))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector, Matrix
from lib import scene as sc, manifest, bake
import fp_preview as fp, revolver_rig as R

MM = 0.001


def load(asset_id):
    before = set(bpy.data.objects)
    sc.must(bpy.ops.import_scene.gltf(filepath=manifest.raw_path(asset_id)), "import " + asset_id)
    return [o for o in bpy.data.objects if o not in before]


def main():
    argv = sc.argv_after_dashes(); out = os.path.abspath(argv[0]); device = argv[argv.index("--device") + 1] if "--device" in argv else "CUDA"
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene; s.render.fps = 30
    tex = os.path.join(manifest.ROOT, "blender/export/tex")
    bg, amb, amb_k, key, key_k, key_dir = fp.MOODS["studio"]
    # the gun, laid along +Y with its right side toward +X (gun space), hands hidden
    objs = load("weapon_revolver")
    inv = R.GUN_M.inverted()
    for o in objs:
        if o.parent is None: o.matrix_world = inv @ o.matrix_world
        if o.type == 'MESH' and o.name.startswith("arms"): o.hide_render = True
        if o.type == 'ARMATURE' and o.animation_data:
            for tr in o.animation_data.nla_tracks: tr.mute = True
            o.animation_data.action = None
    # the cartridges standing in a row under the gun, the pickups under them (metres; the camera looks down -X)
    row = [("prop_cartridge_lead", "round_live"), ("prop_cartridge_lead", "round_spent"), ("prop_cartridge_line", None),
           ("prop_cartridge_kept", "round_sealed"), ("prop_cartridge_kept", "round_spent"), ("prop_cartridge_kept", "round_violet")]
    loaded = {}
    for i, (aid, node) in enumerate(row):
        if aid not in loaded: loaded[aid] = [o for o in load(aid) if o.type == 'MESH']
        ob = next(o for o in loaded[aid] if node is None or o.name.split('.')[0] == node)        # a second import of a name gets .001
        rot = ob.matrix_world.to_3x3().to_4x4()                     # the importer's Y-up -> Z-up turn lives on the parent: keep it
        ob.parent = None; ob.matrix_world = Matrix.Translation((0.05, (-0.10 + 0.045 * i), -0.195)) @ rot
    for aid, y in (("pk_rounds_6", -0.06), ("pk_rounds_12", 0.14)):
        for o in load(aid):
            if o.parent is None: o.matrix_world = Matrix.Translation((0.10, y, -0.31)) @ Matrix.Rotation(math.radians(-60.0), 4, 'Z') @ o.matrix_world
    bpy.context.view_layer.update()
    gm = fp.gun_material(os.path.join(tex, "tx_gun.png"), os.path.join(tex, "tx_matcap_steel.png"), key)
    pm = fp.prop_material(os.path.join(tex, "tx_palette.png"), os.path.join(tex, "tx_palette_emis.png"))
    for ob in s.objects:
        if ob.type != 'MESH': continue
        me = ob.data
        ca = me.color_attributes.active_color or (me.color_attributes[0] if len(me.color_attributes) else None)
        if ca is not None: ca.name = "Color"
        for i, m in enumerate(me.materials):
            if m is not None: me.materials[i] = gm if m.name.startswith("m_gun") else pm
    dev = bake.use_cycles(device, 64)
    s.cycles.samples = 64; s.cycles.use_denoising = True; s.view_settings.view_transform = 'Standard'
    w = bake.set_world(amb, amb_k)
    nt = s.world.node_tree
    lp = nt.nodes.new("ShaderNodeLightPath"); cb = nt.nodes.new("ShaderNodeBackground"); mix = nt.nodes.new("ShaderNodeMixShader")
    cb.inputs["Color"].default_value = (*bg, 1.0)
    outw = next(n for n in nt.nodes if n.type == 'OUTPUT_WORLD')
    nt.links.new(lp.outputs["Is Camera Ray"], mix.inputs[0]); nt.links.new(w.outputs[0], mix.inputs[1]); nt.links.new(cb.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], outw.inputs["Surface"])
    bake.add_sun(Vector((0.75, -0.35, 0.60)).normalized(), strength=key_k, colour=key, angle_deg=6.0, name="Key")
    cd = bpy.data.cameras.new("pv"); cam = bpy.data.objects.new("pv", cd); s.collection.objects.link(cam); s.camera = cam
    cd.type = 'ORTHO'; cd.ortho_scale = 0.50
    eye = Vector((1.0, 0.02, 0.22)); tgt = Vector((0.0, 0.02, -0.16))       # from the gun's right, a little above
    cam.location = eye; cam.rotation_euler = (tgt - eye).to_track_quat('-Z', 'Y').to_euler()
    s.render.resolution_x = 1280; s.render.resolution_y = 1040; s.render.resolution_percentage = 100
    s.render.image_settings.file_format = 'PNG'; s.render.filepath = out
    bpy.ops.render.render(write_still=True)
    print(f"PREVIEW {out} ({dev})")


if __name__ == "__main__":
    sc.run(main)
