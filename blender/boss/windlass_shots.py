"""Evidence renders of the Windlass in a mock of the bore chamber (Cycles; builder art-boss-windlass).

    tools/blender.sh -b --factory-startup --python-exit-code 1 -P blender/boss/windlass_shots.py -- [shot ...] [--samples 48]

Reads the RAW export (blender/export/boss/boss_windlass.glb), stands it over a kerb (r 3.0 to 3.6 m, six merlons), a
floor and a 6 m bore disc, lights it as mood L5 (violet from the bore, six aqua wall lamps) and writes into
shots/art-boss-windlass/:  windlass_from_catwalk  windlass_face_states  windlass_back_flutes  windlass_gauge_20m
windlass_greyscale  windlass_floor_views. Poses come from the file's own clips (held at a frame) plus the turns code
makes (every lid gets mouth_1's pose: the retarget).
"""
import sys, os
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
while not os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py")): _d = os.path.dirname(_d)
ROOT = _d
sys.path.insert(0, os.path.join(ROOT, "blender")); sys.path.insert(0, os.path.join(ROOT, "blender", "tools"))
import bpy, math
import numpy as np
from mathutils import Vector, Matrix
from lib import scene as sc, texdraw as td, bake
import preview

GLB = os.path.join(ROOT, "blender", "export", "boss", "boss_windlass.glb")
OUT = os.path.join(ROOT, "shots", "art-boss-windlass")
W, H = 960, 540


def flat(name, rgb, emit=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1); b.inputs["Roughness"].default_value = 0.8
    if emit: b.inputs["Emission Color"].default_value = (*rgb, 1); b.inputs["Emission Strength"].default_value = emit
    return m


def chamber():
    import bmesh
    def add(name, bm, mat):
        me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
        o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o); me.materials.append(mat); return o
    conc = flat("mock_concrete", (0.16, 0.19, 0.18)); cer = flat("mock_ceramic", (0.55, 0.60, 0.55))
    bm = bmesh.new()                                                # floor: an annulus r 3.6 .. 15
    n = 48
    a = [bm.verts.new((3.6 * math.cos(2 * math.pi * k / n), 3.6 * math.sin(2 * math.pi * k / n), 0)) for k in range(n)]
    b = [bm.verts.new((15 * math.cos(2 * math.pi * k / n), 15 * math.sin(2 * math.pi * k / n), 0)) for k in range(n)]
    for k in range(n): bm.faces.new((a[k], a[(k + 1) % n], b[(k + 1) % n], b[k]))
    add("mock_floor", bm, conc)
    bm = bmesh.new()                                                # kerb ring 0.6 m and the bore wall below it
    for r, z0, z1 in ((3.0, -6.0, 0.6), (3.6, 0.0, 0.6)):
        lo = [bm.verts.new((r * math.cos(2 * math.pi * k / n), r * math.sin(2 * math.pi * k / n), z0)) for k in range(n)]
        hi = [bm.verts.new((r * math.cos(2 * math.pi * k / n), r * math.sin(2 * math.pi * k / n), z1)) for k in range(n)]
        for k in range(n): bm.faces.new((lo[k], lo[(k + 1) % n], hi[(k + 1) % n], hi[k]))
        if r == 3.0: top_in = hi
        else: top_out = hi
    for k in range(n): bm.faces.new((top_in[k], top_in[(k + 1) % n], top_out[(k + 1) % n], top_out[k]))
    add("mock_kerb", bm, cer)
    for k in range(6):                                              # merlons at the rib bearings, ribs behind them
        ang = math.radians(30 + 60 * k)
        for (size, r, z, mat) in (((1.6, 0.6, 0.6), 3.3, 0.9, cer), ((1.6, 3.0, 14.0), 9.0, 7.0, cer)):
            bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
            bmesh.ops.scale(bm, vec=size, verts=bm.verts)
            o = add("mock_block", bm, mat)
            o.location = (r * math.sin(ang), -r * math.cos(ang), z); o.rotation_euler = (0, 0, ang)
    bm = bmesh.new(); bmesh.ops.create_circle(bm, cap_ends=True, segments=48, radius=3.0)
    o = add("mock_bore", bm, flat("mock_bore", (0.45, 0.10, 1.0), emit=2.2)); o.location = (0, 0, -2.5)
    for k in range(6):                                              # the six aqua wall lamps, 5 m up
        ang = math.radians(60 * k)
        d = bpy.data.lights.new("mock_lamp", 'POINT'); d.energy = 900; d.color = (0.55, 1.0, 0.92); d.shadow_soft_size = 0.5
        o = bpy.data.objects.new("mock_lamp", d); bpy.context.scene.collection.objects.link(o)
        o.location = (13.5 * math.sin(ang), -13.5 * math.cos(ang), 5.0)


def rig():
    return next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')


def hold(clip=None, t=1.0):
    """Hold `clip` at fraction t of its length and FREEZE the pose (so further turns survive the render)."""
    arm = rig(); scene = bpy.context.scene
    for pb in arm.pose.bones: pb.matrix_basis = Matrix.Identity(4)
    if clip:
        f0, f1 = preview.activate_clip(scene, clip)
        scene.frame_set(int(round(f0 + (f1 - f0) * t)))
        basis = {pb.name: pb.matrix_basis.copy() for pb in arm.pose.bones}
    else: basis = {}
    for ob in scene.objects:
        if ob.animation_data:
            ob.animation_data.action = None
            for tr in ob.animation_data.nla_tracks: tr.mute = True
    for pb in arm.pose.bones: pb.matrix_basis = basis.get(pb.name, Matrix.Identity(4))
    bpy.context.view_layer.update()
    return basis


def open_mouths(which=range(1, 7)):
    arm = rig()
    m = hold("mouth_open", 1.0)["mouth_1"]
    hold(None)
    for n in which: arm.pose.bones[f"mouth_{n}"].matrix_basis = m
    bpy.context.view_layer.update()


def overlay(extra):
    """Put a frozen pose of other bones on top (dict name -> matrix_basis)."""
    arm = rig()
    for k, m in extra.items(): arm.pose.bones[k].matrix_basis = m
    bpy.context.view_layer.update()


def shoot(eye, target, lens=24.0, size=(W, H)):
    scene = bpy.context.scene
    cam = preview.camera(scene, lens)
    eye = Vector(eye); target = Vector(target)
    cam.location = eye; cam.rotation_euler = (target - eye).to_track_quat('-Z', 'Y').to_euler()
    cam.data.clip_start = 0.05; cam.data.clip_end = 200
    scene.render.resolution_x, scene.render.resolution_y = size
    path = os.path.join(bpy.app.tempdir, "shot.png"); scene.render.filepath = path
    sc.must(bpy.ops.render.render(write_still=True), "render")
    img = bpy.data.images.load(path); w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32); img.pixels.foreach_get(px); bpy.data.images.remove(img)
    return np.clip(np.rint(px.reshape(h, w, 4)[::-1, :, :3] * 255.0), 0, 255).astype(np.uint8)


def save(name, tiles, cols):
    h, w = tiles[0].shape[:2]; rows = math.ceil(len(tiles) / cols)
    sheet = np.full((rows * h, cols * w, 3), 20, dtype=np.uint8)
    for i, t in enumerate(tiles):
        r, c = divmod(i, cols); sheet[r * h:(r + 1) * h, c * w:(c + 1) * w] = t
    td.write_png(os.path.join(OUT, name + ".png"), sheet); print("SHOT", os.path.join(OUT, name + ".png"))


def grey(img):
    g = (0.2126 * img[..., 0] + 0.7152 * img[..., 1] + 0.0722 * img[..., 2]).astype(np.uint8)
    return np.repeat(g[..., None], 3, axis=2)


FRONT = ((0.0, -12.0, 3.2), (0.0, -3.1, 4.3))


def main():
    argv = sc.argv_after_dashes(); samples = 48
    if "--samples" in argv: i = argv.index("--samples"); samples = int(argv[i + 1]); del argv[i:i + 2]
    want = set(argv)
    go = lambda n: not want or n in want
    scene = preview.load(GLB)
    bake.use_cycles('CUDA', samples)
    scene.render.image_settings.file_format = 'PNG'; scene.view_settings.view_transform = 'Standard'
    preview.game_materials(scene)
    bake.set_world((0.12, 0.08, 0.22), 0.5)
    chamber()
    half = (W // 2, H // 2)
    if go("windlass_from_catwalk"):
        hold(None)
        save("windlass_from_catwalk", [shoot((0.0, -13.0, 8.0), (0.0, -3.1, 3.6), lens=26.0)], 1)
    if go("windlass_face_states"):
        tiles = []
        hold(None); tiles.append(shoot(*FRONT, size=half))
        open_mouths(); tiles.append(shoot(*FRONT, size=half))
        hold("guard_slide_on", 1.0); tiles.append(shoot(*FRONT, size=half))
        g = hold("guard_drop", 1.0); open_mouths(); overlay({k: v for k, v in g.items() if k.startswith("guard")}); tiles.append(shoot(*FRONT, size=half))
        hold("guard_shatter", 0.33); tiles.append(shoot(*FRONT, size=half))
        hold("sag_death", 1.0); tiles.append(shoot(*FRONT, size=half))
        save("windlass_face_states", tiles, 3)
    if go("windlass_back_flutes"):
        hold(None)
        save("windlass_back_flutes", [shoot((3.2, 8.5, 3.0), (0.0, -1.4, 4.2), lens=24.0)], 1)
    if go("windlass_gauge_20m"):
        hold(None)
        save("windlass_gauge_20m", [shoot((2.0, -20.0, 1.65), (0.6, -3.1, 5.2), lens=24.0)], 1)
    if go("windlass_greyscale"):
        open_mouths()
        save("windlass_greyscale", [grey(shoot((0.0, -9.0, 1.65), (0.0, -3.1, 4.6), lens=22.0))], 1)
    if go("windlass_floor_views"):
        tiles = []
        hold(None); tiles.append(shoot((4.5, -9.5, 1.65), (0.0, -2.5, 5.0), lens=18.0, size=half))
        open_mouths(); tiles.append(shoot((-3.0, -8.0, 1.65), (0.0, -3.0, 4.6), lens=18.0, size=half))
        hold("guard_slide_on", 1.0); tiles.append(shoot((0.0, -7.0, 1.65), (0.0, -3.0, 5.0), lens=16.0, size=half))
        hold(None); tiles.append(shoot((9.0, 3.0, 1.65), (0.0, -1.0, 5.5), lens=18.0, size=half))
        save("windlass_floor_views", tiles, 2)


if __name__ == "__main__":
    sc.run(main)
