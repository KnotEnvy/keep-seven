"""First-person and close-up Cycles previews of weapon_revolver (art-weapons evidence; not part of the build).

    tools/blender.sh -b --factory-startup --python-exit-code 1 -P blender/weapons/fp_preview.py -- <out.png> [options]

    --glb PATH            the raw export (default blender/export/weapons/weapon_revolver.glb)
    --clip NAME           pose from this clip (default: the rest pose)       --frames 0,2,4   or  --seconds 0,0.4,0.9
    --view fp             the game's view-model camera: at the origin, 52 degrees vertical, 16:9 (default)
    --view "x,y,z>x,y,z"  a free camera (game coordinates: eye > target), several separated by ';'  (--lens MM)
    --view "g:x,y,z>x,y,z" the same in GUN space, millimetres (+Y muzzle, +Z up, +X the gate side): follows the gun bone
    --mood studio|L1|L4   light: a neutral studio, the daylight street or the lift hall (zone ambient + key, as m_gun gets)
    --pose "bone:axis:deg,..."  extra bone rotations about a bone-local axis on top of the pose (close-ups: gate open)
    --scale "bone:0@<27"  what code does to a code-driven bone (kept_loop hidden before frame 27; "@>=27": from it on)
    --size WxH --cols N --samples N --tx PATH (another tx_gun.png) --device CUDA|CPU

The gun's material is what `m_gun` will be in the game, built from nodes: tx_gun albedo x COLOR_0 lit by ambient + key,
plus tx_matcap_steel looked up by the view-space normal, x gloss (tx_gun alpha) x key colour, as emission.
"""
import sys, os, math, argparse
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
while not (os.path.isfile(os.path.join(_d, "lib", "__init__.py")) or os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py"))):
    if os.path.dirname(_d) == _d: raise SystemExit("blender/lib not found")
    _d = os.path.dirname(_d)
sys.path.insert(0, _d if os.path.isfile(os.path.join(_d, "lib", "__init__.py")) else os.path.join(_d, "blender"))
import bpy
import numpy as np
from mathutils import Vector, Matrix, Euler
from lib import scene as sc, texdraw as td, manifest, bake

MOODS = {   # background (linear), ambient colour x strength, key colour x strength, key direction (Blender, toward the light)
    "studio": ((0.16, 0.17, 0.19), (0.62, 0.68, 0.80), 0.55, (1.0, 0.86, 0.68), 3.2, (-0.55, -0.45, 0.70)),
    "L1": ((0.80, 0.52, 0.36), (0.42, 0.36, 0.52), 0.85, (1.0, 0.72, 0.42), 4.2, (-0.60, 0.35, 0.50)),
    "L4": ((0.012, 0.022, 0.030), (0.10, 0.30, 0.30), 0.30, (0.45, 0.95, 0.88), 0.9, (0.25, 0.30, 0.92)),
}


def parse():
    p = argparse.ArgumentParser()
    p.add_argument("out")
    p.add_argument("--glb", default=os.path.join(manifest.ROOT, "blender/export/weapons/weapon_revolver.glb"))
    p.add_argument("--clip", default=None); p.add_argument("--frames", default=None); p.add_argument("--seconds", default=None)
    p.add_argument("--view", default="fp"); p.add_argument("--lens", type=float, default=60.0)
    p.add_argument("--mood", default="studio"); p.add_argument("--pose", default="")
    p.add_argument("--size", default="640x360"); p.add_argument("--cols", type=int, default=0); p.add_argument("--samples", type=int, default=40)
    p.add_argument("--tx", default=None); p.add_argument("--device", default="CUDA")
    p.add_argument("--hide", default="")
    p.add_argument("--scale", default="", help='code-driven bones: "kept_loop:0,round_3:0", or "kept_loop:0@<27" / "@>=27" (frames)')
    return p.parse_args(sc.argv_after_dashes())


def image(path, cs):
    img = bpy.data.images.load(path, check_existing=True); img.colorspace_settings.name = cs
    return img


def gun_material(tx, matcap, key_col):
    m = bpy.data.materials.new("pv_gun"); m.use_nodes = True
    nt = m.node_tree; N = nt.nodes; L = nt.links
    for n in list(N): N.remove(n)
    out = N.new("ShaderNodeOutputMaterial")
    vc = N.new("ShaderNodeVertexColor"); vc.layer_name = "Color"
    tex = N.new("ShaderNodeTexImage"); tex.image = image(tx, 'sRGB'); tex.interpolation = 'Linear'
    mul = N.new("ShaderNodeMix"); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs["Factor"].default_value = 1.0
    L.new(tex.outputs["Color"], mul.inputs["A"]); L.new(vc.outputs["Color"], mul.inputs["B"])
    dif = N.new("ShaderNodeBsdfDiffuse"); L.new(mul.outputs["Result"], dif.inputs["Color"])
    geo = N.new("ShaderNodeNewGeometry")
    vt = N.new("ShaderNodeVectorTransform"); vt.vector_type = 'NORMAL'; vt.convert_from = 'WORLD'; vt.convert_to = 'CAMERA'
    L.new(geo.outputs["Normal"], vt.inputs["Vector"])
    mp = N.new("ShaderNodeMapping"); mp.vector_type = 'POINT'
    mp.inputs["Scale"].default_value = (0.49, 0.49, 0.0); mp.inputs["Location"].default_value = (0.5, 0.5, 0.0)
    L.new(vt.outputs["Vector"], mp.inputs["Vector"])
    mc = N.new("ShaderNodeTexImage"); mc.image = image(matcap, 'sRGB'); mc.extension = 'EXTEND'
    L.new(mp.outputs["Vector"], mc.inputs["Vector"])
    sm = N.new("ShaderNodeMix"); sm.data_type = 'RGBA'; sm.blend_type = 'MULTIPLY'; sm.inputs["Factor"].default_value = 1.0
    L.new(mc.outputs["Color"], sm.inputs["A"]); sm.inputs["B"].default_value = (*key_col, 1.0)
    em = N.new("ShaderNodeEmission"); L.new(sm.outputs["Result"], em.inputs["Color"]); L.new(tex.outputs["Alpha"], em.inputs["Strength"])
    add = N.new("ShaderNodeAddShader"); L.new(dif.outputs[0], add.inputs[0]); L.new(em.outputs[0], add.inputs[1])
    L.new(add.outputs[0], out.inputs["Surface"])
    m.use_backface_culling = True
    return m


def prop_material(pal, emis):
    m = bpy.data.materials.new("pv_prop"); m.use_nodes = True
    nt = m.node_tree; N = nt.nodes; L = nt.links
    for n in list(N): N.remove(n)
    out = N.new("ShaderNodeOutputMaterial")
    vc = N.new("ShaderNodeVertexColor"); vc.layer_name = "Color"
    tex = N.new("ShaderNodeTexImage"); tex.image = image(pal, 'sRGB'); tex.interpolation = 'Closest'
    mul = N.new("ShaderNodeMix"); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs["Factor"].default_value = 1.0
    L.new(tex.outputs["Color"], mul.inputs["A"]); L.new(vc.outputs["Color"], mul.inputs["B"])
    dif = N.new("ShaderNodeBsdfDiffuse"); L.new(mul.outputs["Result"], dif.inputs["Color"])
    et = N.new("ShaderNodeTexImage"); et.image = image(emis, 'sRGB'); et.interpolation = 'Closest'
    em = N.new("ShaderNodeEmission"); L.new(et.outputs["Color"], em.inputs["Color"]); em.inputs["Strength"].default_value = 1.6
    add = N.new("ShaderNodeAddShader"); L.new(dif.outputs[0], add.inputs[0]); L.new(em.outputs[0], add.inputs[1])
    L.new(add.outputs[0], out.inputs["Surface"])
    return m


def main():
    a = parse()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = 30                       # BEFORE the import: the glTF importer turns seconds into frames with the scene's rate (24 by default)
    sc.must(bpy.ops.import_scene.gltf(filepath=os.path.abspath(a.glb)), "import")
    s = bpy.context.scene
    bg, amb, amb_k, key, key_k, key_dir = MOODS[a.mood]
    tex_dir = os.path.join(manifest.ROOT, "blender/export/tex")
    gm = gun_material(a.tx or os.path.join(tex_dir, "tx_gun.png"), os.path.join(tex_dir, "tx_matcap_steel.png"), key)
    pm = prop_material(os.path.join(tex_dir, "tx_palette.png"), os.path.join(tex_dir, "tx_palette_emis.png"))
    hide = {x for x in a.hide.split(",") if x}
    for ob in s.objects:
        if ob.type != 'MESH': continue
        if ob.name in hide: ob.hide_render = True
        me = ob.data
        ca = me.color_attributes.active_color or (me.color_attributes[0] if len(me.color_attributes) else None)
        if ca is not None: ca.name = "Color"
        for i, m in enumerate(me.materials):
            if m is None: continue
            me.materials[i] = gm if m.name.startswith("m_gun") else pm
    dev = bake.use_cycles(a.device, a.samples)
    s.cycles.samples = a.samples; s.cycles.use_denoising = True; s.cycles.use_adaptive_sampling = True
    s.view_settings.view_transform = 'Standard'; s.render.film_transparent = False
    w = bake.set_world(amb, amb_k)
    nt = s.world.node_tree
    lp = nt.nodes.new("ShaderNodeLightPath"); cb = nt.nodes.new("ShaderNodeBackground"); mix = nt.nodes.new("ShaderNodeMixShader")
    cb.inputs["Color"].default_value = (*bg, 1.0)
    outw = next(n for n in nt.nodes if n.type == 'OUTPUT_WORLD')
    nt.links.new(lp.outputs["Is Camera Ray"], mix.inputs[0]); nt.links.new(w.outputs[0], mix.inputs[1]); nt.links.new(cb.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], outw.inputs["Surface"])
    bake.add_sun(Vector(key_dir).normalized(), strength=key_k, colour=key, angle_deg=6.0, name="Key")
    W, H = (int(x) for x in a.size.split("x"))
    s.render.resolution_x = W; s.render.resolution_y = H; s.render.resolution_percentage = 100
    s.render.image_settings.file_format = 'PNG'
    cd = bpy.data.cameras.new("pv"); cam = bpy.data.objects.new("pv", cd); s.collection.objects.link(cam); s.camera = cam
    arm = next((o for o in s.objects if o.type == 'ARMATURE'), None)
    fps = 30.0
    frames = [None]
    if a.clip:
        ad = arm.animation_data; found = None
        for tr in ad.nla_tracks:
            tr.mute = True
            if tr.name == a.clip and tr.strips: found = tr.strips[0]
        if found is None: raise SystemExit(f"no clip {a.clip}")
        ad.action = found.action
        if found.action.slots: ad.action_slot = found.action_slot or found.action.slots[0]
        f0, f1 = found.action.frame_range
        if a.frames: frames = [float(x) for x in a.frames.split(",")]
        elif a.seconds: frames = [float(x) * fps for x in a.seconds.split(",")]
        else: frames = [f0 + (f1 - f0) * i / 4 for i in range(5)]
    elif arm is not None and arm.animation_data:
        for tr in arm.animation_data.nla_tracks: tr.mute = True
        arm.animation_data.action = None
    views = a.view.split(";")
    tiles = []
    tmp = os.path.join(os.path.dirname(os.path.abspath(a.out)), f".pv_{os.getpid()}.png")
    for fr in frames:
        if fr is not None: s.frame_set(int(math.floor(fr)), subframe=fr - math.floor(fr))
        if a.scale and arm is not None:
            for spec in a.scale.split(","):
                b, v = spec.split(":"); cond = None
                if "@" in v: v, cond = v.split("@")
                on = True
                if cond and fr is not None: on = (fr >= float(cond[2:])) if cond.startswith(">=") else (fr < float(cond[1:]))
                x = float(v) if on else 1.0
                arm.pose.bones[b].scale = (x, x, x)
            bpy.context.view_layer.update()
        if a.pose and arm is not None:
            for spec in a.pose.split(","):
                b, ax, deg = spec.split(":")
                pb = arm.pose.bones[b]; pb.rotation_mode = 'QUATERNION'
                pb.rotation_quaternion = pb.rotation_quaternion @ Euler(tuple(math.radians(float(deg)) if k == ax else 0.0 for k in "xyz"), 'XYZ').to_quaternion()
            bpy.context.view_layer.update()
        for v in views:
            if v == "fp":
                cam.location = (0, 0, 0); cam.rotation_euler = (math.radians(90.0), 0.0, 0.0)
                cd.sensor_fit = 'VERTICAL'; cd.sensor_height = 24.0; cd.lens = 12.0 / math.tan(math.radians(26.0))
                cd.clip_start = 0.02; cd.clip_end = 50.0
            else:
                gunspace = v.startswith("g:")                         # "g:x,y,z>x,y,z": eye > target in GUN space, millimetres (assize.py)
                e, t = v[2:].split(">") if gunspace else v.split(">")
                e = [float(x) for x in e.split(",")]; t = [float(x) for x in t.split(",")]
                if gunspace:
                    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
                    import revolver_rig
                    Wg = arm.matrix_world @ arm.pose.bones["gun"].matrix @ arm.data.bones["gun"].matrix_local.inverted() if arm is not None else Matrix.Identity(4)
                    eye = Wg @ revolver_rig.g(e); tgt = Wg @ revolver_rig.g(t)
                else:
                    eye = Vector((e[0], -e[2], e[1])); tgt = Vector((t[0], -t[2], t[1]))
                cam.location = eye; cam.rotation_euler = (tgt - eye).to_track_quat('-Z', 'Y').to_euler()
                cd.sensor_fit = 'AUTO'; cd.lens = a.lens; cd.clip_start = 0.005; cd.clip_end = 50.0
            s.render.filepath = tmp
            bpy.ops.render.render(write_still=True)
            tiles.append(td.read_png(tmp)[0][:, :, :3].copy())
    if os.path.isfile(tmp): os.remove(tmp)
    cols = a.cols or len(tiles)
    rows = (len(tiles) + cols - 1) // cols
    sheet = np.zeros((rows * H, cols * W, 3), dtype=np.uint8)
    for i, t in enumerate(tiles): sheet[(i // cols) * H:(i // cols + 1) * H, (i % cols) * W:(i % cols + 1) * W] = t
    td.write_png(a.out, sheet)
    print(f"PREVIEW {a.out} ({len(tiles)} tiles, {dev})")


if __name__ == "__main__":
    sc.run(main)
