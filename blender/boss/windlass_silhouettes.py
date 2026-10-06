"""48 px silhouettes, black on white: the Windlass (rest, and with the guard released) beside the Tamper, the Bider
and the Transit (ART_BIBLE 12, item 9: silhouettes distinct at 48 px). Fixer art-boss-windlass.

    tools/blender.sh -b --factory-startup --python-exit-code 1 -P blender/boss/windlass_silhouettes.py

Reads the RAW exports (blender/export/...), renders each from the front in Workbench (flat, one colour), fitted to a
48 x 48 tile, and writes shots/art-boss-windlass/windlass_silhouettes_48.png: the top row at 1:1, the bottom row the
same pixels x 5 (nearest).
"""
import sys, os
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
while not os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py")): _d = os.path.dirname(_d)
ROOT = _d
sys.path.insert(0, os.path.join(ROOT, "blender"))
import bpy, math
import numpy as np
from mathutils import Vector
from lib import scene as sc

OUT = os.path.join(ROOT, "shots", "art-boss-windlass", "windlass_silhouettes_48.png")
SUBJECTS = [("boss/boss_windlass.glb", None, 0), ("boss/boss_windlass.glb", "guard_drop", 18), ("enemies/enemy_tamper.glb", None, 0),
            ("enemies/enemy_bider.glb", None, 0), ("enemies/enemy_transit.glb", None, 0)]
PX = 48; UP = 5


def tile(rel, clip, frame):
    sc.reset_scene()
    path = os.path.join(ROOT, "blender", "export", rel)
    if not os.path.isfile(path): return None
    bpy.ops.import_scene.gltf(filepath=path)
    scene = bpy.context.scene
    arm = next((o for o in scene.objects if o.type == 'ARMATURE'), None)
    if clip and arm:
        act = bpy.data.actions.get(clip)
        if arm.animation_data is None: arm.animation_data_create()
        for t in list(arm.animation_data.nla_tracks): arm.animation_data.nla_tracks.remove(t)
        arm.animation_data.action = act
        if hasattr(arm.animation_data, "action_slot") and act.slots: arm.animation_data.action_slot = act.slots[0]
        scene.frame_set(frame)
    elif arm and arm.animation_data:
        for t in list(arm.animation_data.nla_tracks): arm.animation_data.nla_tracks.remove(t)
        arm.animation_data.action = None
        for pb in arm.pose.bones: pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.scale = (1, 1, 1)
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    lo = Vector((1e9, 1e9, 1e9)); hi = Vector((-1e9, -1e9, -1e9))
    for o in scene.objects:
        if o.type != 'MESH': continue
        e = o.evaluated_get(dg); me = e.to_mesh()
        for v in me.vertices:
            w = e.matrix_world @ v.co
            for i in range(3): lo[i] = min(lo[i], w[i]); hi[i] = max(hi[i], w[i])
        e.to_mesh_clear()
    lo.z = max(lo.z, -0.5)                                          # the Windlass's cables run 5 m down the bore: cut at the floor
    c = (lo + hi) / 2
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); scene.collection.objects.link(cam)
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = max(hi.x - lo.x, hi.z - lo.z) * 1.08
    cam.location = (c.x, lo.y - 30.0, c.z); cam.rotation_euler = (math.pi / 2, 0, 0); cam.data.clip_end = 200
    scene.camera = cam
    scene.render.engine = 'BLENDER_WORKBENCH'
    sh = scene.display.shading; sh.light = 'FLAT'; sh.color_type = 'SINGLE'; sh.single_color = (0, 0, 0)
    scene.display.render_aa = '8'
    if scene.world is None: scene.world = bpy.data.worlds.new("w")
    scene.world.use_nodes = False; scene.world.color = (1, 1, 1)
    scene.view_settings.view_transform = 'Standard'
    scene.render.resolution_x = PX; scene.render.resolution_y = PX; scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    p = os.path.join(bpy.app.tempdir, "sil.png"); scene.render.filepath = p; scene.render.image_settings.file_format = 'PNG'
    sc.must(bpy.ops.render.render(write_still=True), "render")
    img = bpy.data.images.load(p); a = np.empty(PX * PX * 4, np.float32); img.pixels.foreach_get(a)
    return a.reshape(PX, PX, 4).copy()


def main():
    tiles = [t for t in (tile(*s) for s in SUBJECTS) if t is not None]
    n = len(tiles); gap = 8
    Wd = n * (PX * UP + gap) + gap; Hd = gap + PX + gap + PX * UP + gap
    out = np.ones((Hd, Wd, 4), np.float32) * np.array([0.8, 0.8, 0.8, 1.0], np.float32)
    for i, t in enumerate(tiles):
        x = gap + i * (PX * UP + gap)
        out[gap + PX * UP + gap:gap + PX * UP + gap + PX, x:x + PX] = t                  # image rows run bottom-up: this is the TOP row
        out[gap:gap + PX * UP, x:x + PX * UP] = np.repeat(np.repeat(t, UP, axis=0), UP, axis=1)
    img = bpy.data.images.new("sheet", Wd, Hd); img.pixels.foreach_set(out.ravel())
    img.filepath_raw = OUT; img.file_format = 'PNG'; img.save()
    print("SILHOUETTES", n, "tiles ->", OUT)


if __name__ == "__main__":
    sc.run(main)
