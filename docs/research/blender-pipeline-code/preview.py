"""Contact-sheet / turntable preview for critics.
tools/blender.sh -b --factory-startup -P preview.py -- <in.glb|in.blend> <out.png> [--engine WORKBENCH|CYCLES] [--views 8]
     [--cols 4] [--size 480] [--elev 20] [--color MATERIAL|TEXTURE|VERTEX] [--action NAME --frames 0,10,20] [--device CUDA|CPU] [--wire]
"""
import bpy, sys, os, math, time, argparse, tempfile, traceback
import numpy as np
from mathutils import Vector

def parse():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("src"); p.add_argument("out")
    p.add_argument("--engine", default="WORKBENCH", choices=["WORKBENCH", "CYCLES"])
    p.add_argument("--views", type=int, default=8); p.add_argument("--cols", type=int, default=4)
    p.add_argument("--size", type=int, default=480); p.add_argument("--elev", type=float, default=20.0)
    p.add_argument("--color", default="MATERIAL"); p.add_argument("--samples", type=int, default=32)
    p.add_argument("--action", default=None); p.add_argument("--frames", default=None)
    p.add_argument("--device", default="CUDA"); p.add_argument("--wire", action="store_true")
    p.add_argument("--zoom", type=float, default=1.0)          # >1 = closer than the bounding-sphere fit
    p.add_argument("--cull", action="store_true")              # Workbench backface culling: dollhouse view into interiors
    p.add_argument("--cam", default=None); p.add_argument("--look", default=None)   # explicit Blender-space eye/target "x,y,z" (single view)
    p.add_argument("--lens", type=float, default=50.0)
    return p.parse_args(argv)

def load(src):
    if src.lower().endswith(".blend"):
        bpy.ops.wm.open_mainfile(filepath=src)
    else:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=src)
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

def setup_engine(scene, a):
    r = scene.render
    r.resolution_x = r.resolution_y = a.size; r.resolution_percentage = 100
    r.image_settings.file_format = 'PNG'; r.film_transparent = False
    scene.view_settings.view_transform = 'Standard'
    if a.engine == "WORKBENCH":
        r.engine = 'BLENDER_WORKBENCH'
        sh = scene.display.shading
        sh.light = 'STUDIO'; sh.color_type = a.color            # MATERIAL | TEXTURE | VERTEX | OBJECT | SINGLE
        sh.show_cavity = True; sh.cavity_type = 'BOTH'; sh.show_shadows = True; sh.shadow_intensity = 0.35
        sh.show_object_outline = True; sh.show_specular_highlight = True
        sh.show_backface_culling = a.cull
        scene.display.render_aa = '8'
        if scene.world is None: scene.world = bpy.data.worlds.new("W")
        scene.world.color = (0.18, 0.19, 0.21)
    else:
        r.engine = 'CYCLES'
        c = scene.cycles; c.samples = a.samples; c.use_denoising = True
        if a.device != 'CPU':
            prefs = bpy.context.preferences.addons['cycles'].preferences
            prefs.compute_device_type = a.device; prefs.get_devices()
            ok = False
            for d in prefs.devices:
                d.use = (d.type == a.device); ok = ok or d.use
            c.device = 'GPU' if ok else 'CPU'
        w = bpy.data.worlds.new("PreviewWorld"); w.use_nodes = True
        w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.55, 0.62, 0.75, 1)
        w.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.5
        scene.world = w
        for o in [o for o in scene.objects if o.type == 'LIGHT']: bpy.data.objects.remove(o)
        sun = bpy.data.lights.new("PreviewSun", 'SUN'); sun.energy = 2.0; sun.angle = math.radians(3)
        so = bpy.data.objects.new("PreviewSun", sun); scene.collection.objects.link(so)
        so.rotation_euler = (math.radians(50), 0, math.radians(35))

def add_wire(scene):
    m = bpy.data.materials.new("PreviewWire"); m.diffuse_color = (0, 0, 0, 1)
    base = bpy.data.materials.new("PreviewBase"); base.diffuse_color = (0.7, 0.7, 0.7, 1)
    for ob in [o for o in scene.objects if o.type == 'MESH']:
        if len(ob.data.materials) == 0: ob.data.materials.append(base)      # else the wire material would become slot 0
        mod = ob.modifiers.new("PreviewWire", 'WIREFRAME'); mod.thickness = 0.004; mod.use_replace = False; mod.use_even_offset = False
        ob.data.materials.append(m); mod.material_offset = len(ob.data.materials) - 1

def camera_for(scene, mn, mx, az, elev, lens=50, zoom=1.0):
    cam = scene.camera
    if cam is None or cam.name != "PreviewCam":
        cd = bpy.data.cameras.new("PreviewCam"); cd.lens = lens
        cam = bpy.data.objects.new("PreviewCam", cd); scene.collection.objects.link(cam); scene.camera = cam
    c = (mn + mx) / 2; radius = (mx - mn).length / 2
    fov = 2 * math.atan(36 / 2 / cam.data.lens)                # sensor 36 mm, square image
    dist = radius / math.sin(fov / 2) * 1.05 / zoom
    d = Vector((math.cos(elev) * math.sin(az), -math.cos(elev) * math.cos(az), math.sin(elev)))   # az 0 = looking along +Y (front view)
    cam.location = c + d * dist
    cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam.data.clip_start = max(0.01, dist - radius * 1.5); cam.data.clip_end = dist + radius * 3
    return cam

def read_png(path):
    img = bpy.data.images.load(path)
    w, h = img.size
    a = np.empty(w * h * 4, dtype=np.float32); img.pixels.foreach_get(a)
    bpy.data.images.remove(img)
    return a.reshape(h, w, 4)

def write_png(arr, path):
    h, w, _ = arr.shape
    img = bpy.data.images.new("sheet", w, h, alpha=False)
    img.pixels.foreach_set(arr.ravel()); img.filepath_raw = path; img.file_format = 'PNG'; img.save()
    bpy.data.images.remove(img)

def main():
    a = parse(); t0 = time.perf_counter()
    scene = load(os.path.abspath(a.src))
    setup_engine(scene, a)
    if a.wire: add_wire(scene)
    shots = []          # (azimuth, frame)
    if a.action:
        arm = next(o for o in scene.objects if o.animation_data and o.type == 'ARMATURE')
        act = bpy.data.actions[a.action]
        arm.animation_data.action = act
        if act.slots: arm.animation_data.action_slot = act.slots[0]
        f0, f1 = act.frame_range
        frames = [int(f) for f in a.frames.split(",")] if a.frames else [round(f0 + (f1 - f0) * i / (a.views - 1)) for i in range(a.views)]
        shots = [(math.radians(35), f) for f in frames]
    else:
        shots = [(2 * math.pi * i / a.views + math.radians(35), scene.frame_current) for i in range(1 if a.cam else a.views)]
    scene.frame_set(shots[0][1])
    mn, mx = world_bounds(scene)
    tiles = []; tmp = tempfile.mkdtemp(prefix="preview_")
    t_render = 0.0
    for i, (az, frame) in enumerate(shots):
        scene.frame_set(frame)
        cam = camera_for(scene, mn, mx, az, math.radians(a.elev), a.lens, a.zoom)
        if a.cam and a.look:
            eye = Vector([float(x) for x in a.cam.split(",")]); tgt = Vector([float(x) for x in a.look.split(",")])
            cam.location = eye; cam.rotation_euler = (tgt - eye).to_track_quat('-Z', 'Y').to_euler()
            cam.data.clip_start = 0.05; cam.data.clip_end = 500
        scene.render.filepath = os.path.join(tmp, f"v{i:02d}.png")
        t = time.perf_counter(); bpy.ops.render.render(write_still=True); t_render += time.perf_counter() - t
        tiles.append(read_png(scene.render.filepath))
    cols = min(a.cols, len(tiles)); rows = math.ceil(len(tiles) / cols)
    sheet = np.zeros((rows * a.size, cols * a.size, 4), dtype=np.float32); sheet[:, :, 3] = 1
    for i, t in enumerate(tiles):
        r, c = divmod(i, cols)
        y0 = (rows - 1 - r) * a.size                      # image origin is bottom-left
        sheet[y0:y0 + a.size, c * a.size:(c + 1) * a.size] = t
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    write_png(sheet, os.path.abspath(a.out))
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in scene.objects if o.type == 'MESH')
    print(f"PREVIEW {a.engine} {len(tiles)} views {a.size}px: render {t_render:.2f}s total {time.perf_counter() - t0:.2f}s tris {tris} -> {a.out}")

try: main()
except Exception:
    traceback.print_exc(); sys.exit(1)
