"""Shared helpers (prototype of blender/lib/scene.py + mesh.py). Verified on Blender 4.5.14."""
import bpy, bmesh, sys, os, time, math
from mathutils import Vector, Matrix

def argv_after_dashes():
    return sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []

def reset_scene(fps=30):
    bpy.ops.wm.read_factory_settings(use_empty=True)        # no cube/camera/light, default prefs
    bpy.context.preferences.filepaths.save_version = 0      # no .blend1 backups
    s = bpy.context.scene
    s.unit_settings.system = 'METRIC'; s.unit_settings.scale_length = 1.0
    s.render.fps = fps; s.frame_start = 0
    return s

def must(result, what):
    """Operators report failure by RETURN VALUE ({'CANCELLED'}), not by raising."""
    if result != {'FINISHED'}:
        raise RuntimeError(f"{what} -> {result}")

def set_origin(ob, world_point):
    """Move the pivot without moving the geometry (no operator, no cursor)."""
    mw = ob.matrix_world
    local = mw.inverted() @ Vector(world_point)
    ob.data.transform(Matrix.Translation(-local))
    ob.matrix_world = mw @ Matrix.Translation(local)

def link(ob, coll=None):
    (coll or bpy.context.scene.collection).objects.link(ob)
    return ob

def new_mesh_object(name, bm, coll=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    return link(ob, coll)

def deselect_all():
    vl = bpy.context.view_layer
    vl.update()                         # bpy.data.objects.remove() leaves a stale None in view_layer.objects until an update
    for o in vl.objects:
        if o is not None: o.select_set(False)

def select_only(ob):
    deselect_all()
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob

def apply_modifiers(ob):
    select_only(ob)
    for m in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)

def tri_count(ob, evaluated=True):
    if evaluated:
        dg = bpy.context.evaluated_depsgraph_get()
        me = ob.evaluated_get(dg).to_mesh()
        n = sum(len(p.vertices) - 2 for p in me.polygons)
        ob.evaluated_get(dg).to_mesh_clear()
        return n
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)

class Timer:
    def __init__(self, label): self.label = label
    def __enter__(self): self.t = time.perf_counter(); return self
    def __exit__(self, *a):
        self.dt = time.perf_counter() - self.t
        print(f"[time] {self.label}: {self.dt:.2f}s")
