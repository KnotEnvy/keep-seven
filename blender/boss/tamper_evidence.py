"""Evidence helper of art-boss-tamper (not an asset script): poses the RAW export and either saves a static posed
.blend for blender/tools/preview.py, or renders black-on-white silhouettes, front and side, all at one scale.

    tools/blender.sh -b --factory-startup --python-exit-code 1 -P blender/boss/tamper_evidence.py -- <raw.glb> \
        --blend out.blend --pose "stagger:20:80:80"          # clip : frame : vent_chest degrees : vent_back degrees
        --sil out.png --poses "idle:0:0:0;slam_windup:30:0:0;charge:0:0:0;charge_stun:60:0:0" [--px 48]
        --also other.glb@1.9                                 # --blend: a second file beside it, shifted along X
        --emis out.png --poses "idle:0:0:0@25:6:3.2;idle:0:80:0@20:4:2.2"    # clip:frame:chest:back @ yaw:pitch:distance
            what the game's m_prop shader draws, unlit: tx_palette x COLOR_0 + tx_palette_emis (the emissive cells: band,
            slat glow, knot lobes and cores), one tile per pose; second row = the same frames with the colour removed

The vent angles are applied the way code does it: on top of the clip's pose, about the bone's own X axis.
"""
import sys, os
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
while not os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py")):
    if os.path.dirname(_d) == _d: raise SystemExit("blender/lib not found")
    _d = os.path.dirname(_d)
sys.path.insert(0, os.path.join(_d, "blender"))
import bpy, math, argparse, tempfile
import numpy as np
from mathutils import Vector, Quaternion, Matrix
from lib import scene as sc, texdraw as td


def parse():
    p = argparse.ArgumentParser()
    p.add_argument("src")
    p.add_argument("--blend"); p.add_argument("--pose", default=":0:0:0")
    p.add_argument("--sil"); p.add_argument("--poses", default="")
    p.add_argument("--px", type=int, default=0, help="--sil: also append a row with the figures scaled to this height in pixels")
    p.add_argument("--also", default="")
    p.add_argument("--emis")
    return p.parse_args(sc.argv_after_dashes())


def load(src, dx=0.0):
    before = set(bpy.data.objects)
    try: r = bpy.ops.import_scene.gltf(filepath=src, disable_bone_shape=True)
    except TypeError: r = bpy.ops.import_scene.gltf(filepath=src)
    sc.must(r, "import glb")
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        if o.parent is None: o.location.x += dx
    return new


def freeze(objs, clip, frame, vc, vb):
    """Evaluate `clip` at `frame`, add the vent turns, and bake the result into the meshes (no armature left)."""
    scene = bpy.context.scene
    arm = next((o for o in objs if o.type == 'ARMATURE'), None)
    if arm is None: return
    ad = arm.animation_data
    if ad:
        found = None
        for tr in ad.nla_tracks:
            tr.mute = True
            if tr.name == clip and tr.strips: found = tr.strips[0]
        if clip and found is None: raise RuntimeError(f"no clip '{clip}'")
        ad.action = found.action if found else None
        if found and found.action.slots: ad.action_slot = found.action_slot or found.action.slots[0]
    scene.frame_set(int(frame))
    bpy.context.view_layer.update()
    basis = {pb.name: pb.matrix_basis.copy() for pb in arm.pose.bones}
    if ad: arm.animation_data_clear()
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        m = basis[pb.name]
        if pb.name == "vent_chest": m = m @ Quaternion((1, 0, 0), math.radians(vc)).to_matrix().to_4x4()
        if pb.name == "vent_back": m = m @ Quaternion((1, 0, 0), math.radians(vb)).to_matrix().to_4x4()
        pb.matrix_basis = m
    bpy.context.view_layer.update()
    for o in objs:
        if o.type != 'MESH': continue
        sc.select_only(o)
        for md in [m.name for m in o.modifiers if m.type == 'ARMATURE']:
            sc.must(bpy.ops.object.modifier_apply(modifier=md), "apply armature")
        mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
    for o in objs:
        if o.type in ('ARMATURE', 'EMPTY'): bpy.data.objects.remove(o, do_unlink=True)
    bpy.context.view_layer.update()


def silhouettes(a):
    poses = [p.split(":") for p in a.poses.split(";") if p]
    scene = bpy.context.scene
    H = 300; W = 300; span = 5.2                                     # metres across a tile: the wind-up (4.5 m) fits
    tiles = []
    for (clip, frame, vc, vb) in poses:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        scene = bpy.context.scene
        objs = load(os.path.abspath(a.src))
        freeze(objs, clip, int(frame), float(vc), float(vb))
        scene.render.engine = 'BLENDER_WORKBENCH'
        sh = scene.display.shading
        sh.light = 'FLAT'; sh.color_type = 'SINGLE'; sh.single_color = (0, 0, 0); sh.background_type = 'VIEWPORT'; sh.background_color = (1, 1, 1)
        scene.world = bpy.data.worlds.new("white"); scene.world.color = (1, 1, 1)
        scene.view_settings.view_transform = 'Standard'
        scene.render.film_transparent = False
        scene.render.resolution_x = W; scene.render.resolution_y = H; scene.render.resolution_percentage = 100
        cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); scene.collection.objects.link(cam); scene.camera = cam
        cam.data.type = 'ORTHO'; cam.data.ortho_scale = span
        for (pos, rot) in (((0, -30, span / 2 - 0.25), (math.pi / 2, 0, 0)), ((-30, -0.4, span / 2 - 0.25), (math.pi / 2, 0, -math.pi / 2))):   # front, then its right side
            cam.location = pos; cam.rotation_euler = rot
            f = os.path.join(tempfile.mkdtemp(prefix="ks_sil_"), "t.png"); scene.render.filepath = f
            sc.must(bpy.ops.render.render(write_still=True), "render")
            img = bpy.data.images.load(f); px = np.empty(W * H * 4, dtype=np.float32); img.pixels.foreach_get(px); bpy.data.images.remove(img)
            tiles.append(np.where(px.reshape(H, W, 4)[::-1, :, :3] > 0.5, 255, 0).astype(np.uint8))
    n = len(poses)
    rows = 2 + (1 if a.px else 0)
    sheet = np.full((rows * H, n * W, 3), 255, dtype=np.uint8)
    for i in range(n):
        sheet[0:H, i * W:(i + 1) * W] = tiles[2 * i]; sheet[H:2 * H, i * W:(i + 1) * W] = tiles[2 * i + 1]
    if a.px:                                                         # the 30 m read: the IDLE figure is `px` pixels tall, the rest at the same scale
        ink = np.nonzero((tiles[0][:, :, 0] < 128).any(axis=1))[0]
        k = a.px / float(ink.max() - ink.min() + 1)
        for i in range(2 * n):
            t = tiles[i]
            hh = max(1, int(round(H * k))); ww = max(1, int(round(W * k)))
            ys = (np.arange(hh) / k).astype(int).clip(0, H - 1); xs = (np.arange(ww) / k).astype(int).clip(0, W - 1)
            small = t[ys][:, xs]
            x0 = (i // 2) * W + (W // 4 if i % 2 == 0 else 3 * W // 4) - ww // 2; y0 = 2 * H + (H - hh) // 2
            sheet[y0:y0 + hh, x0:x0 + ww] = np.minimum(sheet[y0:y0 + hh, x0:x0 + ww], small)
    td.write_png(os.path.abspath(a.sil), sheet)
    print(f"SIL {a.sil}")


def emissive(a):
    """The emissive cells as the game adds them (c = albedo x COLOR_0 + emissive texel), unlit, in Cycles."""
    from lib import material
    W, H = 640, 480
    tiles = []
    for spec in [p for p in a.poses.split(";") if p]:
        pose, view = spec.split("@")
        clip, frame, vc, vb = pose.split(":"); yaw, pitch, dist = (float(v) for v in view.split(":"))
        bpy.ops.wm.read_factory_settings(use_empty=True)
        scene = bpy.context.scene
        objs = load(os.path.abspath(a.src))
        freeze(objs, clip, int(frame), float(vc), float(vb))
        m = bpy.data.materials.new("emis_proof"); m.use_nodes = True; m.use_backface_culling = True
        N = m.node_tree.nodes; L = m.node_tree.links
        for n in list(N): N.remove(n)
        out = N.new("ShaderNodeOutputMaterial"); em = N.new("ShaderNodeEmission")
        vc_n = N.new("ShaderNodeVertexColor"); vc_n.layer_name = "Color"
        alb = N.new("ShaderNodeTexImage"); alb.image = material._image("tx_palette", 'sRGB'); alb.interpolation = 'Closest'
        emi = N.new("ShaderNodeTexImage"); emi.image = material._image("tx_palette_emis", 'sRGB'); emi.interpolation = 'Closest'
        if alb.image is None or emi.image is None: raise RuntimeError("tx_palette / tx_palette_emis are not built")
        mul = N.new("ShaderNodeMix"); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs["Factor"].default_value = 1.0
        add = N.new("ShaderNodeMix"); add.data_type = 'RGBA'; add.blend_type = 'ADD'; add.inputs["Factor"].default_value = 1.0
        L.new(alb.outputs["Color"], mul.inputs["A"]); L.new(vc_n.outputs["Color"], mul.inputs["B"])
        L.new(mul.outputs["Result"], add.inputs["A"]); L.new(emi.outputs["Color"], add.inputs["B"])
        L.new(add.outputs["Result"], em.inputs["Color"]); L.new(em.outputs["Emission"], out.inputs["Surface"])
        for o in bpy.data.objects:
            if o.type == 'MESH':
                o.data.materials.clear(); o.data.materials.append(m)
        scene.render.engine = 'CYCLES'; scene.cycles.samples = 16; scene.cycles.use_denoising = False; scene.cycles.device = 'CPU'
        scene.world = bpy.data.worlds.new("dark"); scene.world.color = (0.02, 0.02, 0.025)
        scene.view_settings.view_transform = 'Standard'
        scene.render.resolution_x = W; scene.render.resolution_y = H; scene.render.resolution_percentage = 100
        cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); scene.collection.objects.link(cam); scene.camera = cam
        cam.data.lens = 35
        # yaw 0 = from the front (Blender -Y), positive toward the creature's left (+X); the camera looks at chest height
        y, pt = math.radians(yaw), math.radians(pitch)
        tgt = Vector((0.0, 0.0, 1.25))
        cam.location = tgt + Vector((math.sin(y) * math.cos(pt), -math.cos(y) * math.cos(pt), math.sin(pt))) * dist
        cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
        f = os.path.join(tempfile.mkdtemp(prefix="ks_emis_"), "t.png"); scene.render.filepath = f
        scene.render.image_settings.file_format = 'PNG'
        sc.must(bpy.ops.render.render(write_still=True), "render")
        img = bpy.data.images.load(f); px = np.empty(W * H * 4, dtype=np.float32); img.pixels.foreach_get(px); bpy.data.images.remove(img)
        tiles.append((px.reshape(H, W, 4)[::-1, :, :3] * 255.0 + 0.5).clip(0, 255).astype(np.uint8))
    n = len(tiles)
    sheet = np.zeros((2 * H, n * W, 3), dtype=np.uint8)
    for i, t in enumerate(tiles):
        sheet[0:H, i * W:(i + 1) * W] = t
        g = (t[:, :, 0] * 0.2126 + t[:, :, 1] * 0.7152 + t[:, :, 2] * 0.0722).astype(np.uint8)
        sheet[H:2 * H, i * W:(i + 1) * W] = g[:, :, None]
    td.write_png(os.path.abspath(a.emis), sheet)
    print(f"EMIS {a.emis}")


def main():
    a = parse()
    if a.sil:
        silhouettes(a); return
    if a.emis:
        emissive(a); return
    bpy.ops.wm.read_factory_settings(use_empty=True)
    clip, frame, vc, vb = a.pose.split(":")
    objs = load(os.path.abspath(a.src))
    freeze(objs, clip, int(frame), float(vc), float(vb))
    if a.also:
        f, dx = a.also.split("@")
        load(os.path.abspath(f), float(dx))
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(a.blend))
    print(f"BLEND {a.blend}")


if __name__ == "__main__":
    sc.run(main)
