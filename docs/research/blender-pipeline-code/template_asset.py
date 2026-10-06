"""Asset script template.  tools/blender.sh -b --factory-startup --python-exit-code 1 -P blender/<name>.py -- --out public/assets/props/x.glb [--seed 7]"""
import bpy, bmesh, sys, os, argparse, random, traceback
from mathutils import Vector, noise

def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []   # everything after "--" is ours
    p = argparse.ArgumentParser(prog=os.path.basename(__file__))
    p.add_argument("--out", required=True)
    p.add_argument("--blend", default=None, help="also save the .blend here")
    p.add_argument("--seed", type=int, default=1)
    return p.parse_args(argv)

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

def build(args):
    rng = random.Random(args.seed)                          # never the global RNG, never time-based seeds
    noise.seed_set(args.seed)                               # only affects mathutils.noise.random*(); fractal/noise() are pure functions
    bm = bmesh.new()
    bm.loops.layers.uv.new("UVMap")                         # calc_uvs only fills an existing layer
    bmesh.ops.create_cube(bm, size=1.0, calc_uvs=True)
    for v in bm.verts: v.co += Vector((rng.uniform(-.02, .02), rng.uniform(-.02, .02), 0))
    me = bpy.data.meshes.new("Thing"); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new("Thing", me)
    bpy.context.scene.collection.objects.link(ob)
    return [ob]

def main():
    args = parse_args()
    reset_scene()
    build(args)
    out = os.path.abspath(args.out); os.makedirs(os.path.dirname(out), exist_ok=True)
    must(bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', check_existing=False, export_apply=True, export_extras=True), "gltf export")
    if args.blend:
        b = os.path.abspath(args.blend); os.makedirs(os.path.dirname(b), exist_ok=True)
        must(bpy.ops.wm.save_as_mainfile(filepath=b, compress=True, check_existing=False), "save blend")
    print(f"OK {out} {os.path.getsize(out)} bytes")

if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except BaseException:
        traceback.print_exc()
        sys.exit(1)                                         # without this (or --python-exit-code) Blender exits 0 on a Python error
