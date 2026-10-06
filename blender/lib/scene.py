"""Scene, selection and script-skeleton helpers. Verified on Blender 4.5.14 (docs/research/blender-pipeline.md 1, 2.2)."""
import bpy, sys, os, time, argparse, traceback, random

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
"""Absolute path of the repository."""

FPS = 30


def argv_after_dashes():
    """The script's own arguments: everything after `--` on the Blender command line."""
    return sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def asset_args(prog=None, extra=None):
    """Parse the standard asset-script arguments: --out <raw glb> [--blend <path>] [--seed n] [--preview].
    `extra(parser)` may add more. Returns the argparse namespace (argparse exits with code 2 on a bad argument)."""
    p = argparse.ArgumentParser(prog=prog or "asset script")
    p.add_argument("--out", required=True, help="raw GLB path (blender/export/<category>/<id>.glb)")
    p.add_argument("--blend", default=None, help="also save the .blend here")
    p.add_argument("--seed", type=int, default=1)
    p.add_argument("--preview", action="store_true", help="render the contact sheet after export (art scripts)")
    if extra: extra(p)
    return p.parse_args(argv_after_dashes())


def reset_scene(fps=FPS):
    """Empty factory scene (no cube, camera or light), metres, `fps`, frame_start 0, no .blend1 backups. Returns the scene."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    s = bpy.context.scene
    s.unit_settings.system = 'METRIC'; s.unit_settings.scale_length = 1.0
    s.render.fps = fps; s.frame_start = 0
    return s


def rng(seed):
    """The only random source an asset script may use: `random.Random(seed)`. Never the global RNG, never the clock."""
    return random.Random(seed)


def must(result, what):
    """Operators report failure by RETURN VALUE ({'CANCELLED'}), not by raising. Raise unless {'FINISHED'}."""
    if result != {'FINISHED'}:
        raise RuntimeError(f"{what} -> {result}")


def link(ob, coll=None):
    """Link an object to a collection (default: the scene collection). Returns the object."""
    (coll or bpy.context.scene.collection).objects.link(ob)
    return ob


def deselect_all():
    """Deselect everything. Safe after bpy.data.objects.remove() (updates the view layer first)."""
    vl = bpy.context.view_layer
    vl.update()
    for o in vl.objects:
        if o is not None: o.select_set(False)


def select_only(ob):
    """Make `ob` the only selected and the active object."""
    deselect_all()
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob


def select(objs):
    """Select exactly `objs`; the first becomes active."""
    deselect_all()
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


def remove(ob):
    """Delete an object and its now-unused mesh data."""
    data = ob.data
    bpy.data.objects.remove(ob, do_unlink=True)
    if data is not None and data.users == 0 and isinstance(data, bpy.types.Mesh): bpy.data.meshes.remove(data)


class Timer:
    """`with Timer("bake"):` prints "[time] bake: 1.23s" (perf_counter inside Blender: the WSL wall clock is unreliable)."""
    def __init__(self, label): self.label = label
    def __enter__(self): self.t = time.perf_counter(); return self
    def __exit__(self, *a):
        self.dt = time.perf_counter() - self.t
        print(f"[time] {self.label}: {self.dt:.2f}s")


def save_blend(path):
    """Save the scene as a compressed .blend (parent folders created). .blend files are not byte-stable: never compare them."""
    path = os.path.abspath(path); os.makedirs(os.path.dirname(path), exist_ok=True)
    must(bpy.ops.wm.save_as_mainfile(filepath=path, compress=True, check_existing=False), "save blend")


def run(main):
    """Run `main()` so that any failure exits non-zero with a traceback. Use as the last line of every script:
    `if __name__ == "__main__": scene.run(main)`. (Blender exits 0 on an uncaught Python error otherwise.)"""
    try:
        main()
    except SystemExit:
        raise
    except BaseException:
        traceback.print_exc()
        sys.stdout.flush(); sys.stderr.flush()
        sys.exit(1)
