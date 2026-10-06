"""prop_cartridge_line: the line round: brass case 12 x 33 mm, a turned `enamel` nose (41 mm overall) and an AQUA
EMISSIVE ring at the shoulder. 46 triangles, one mesh. Pivot: case head centre; it stands on its head.
Built by blender/weapons/ammo.py, the same function as `round_hand_line` in the gun.

    node tools/build-assets.mjs --only prop_cartridge_line
"""
import sys, os
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
while not (os.path.isfile(os.path.join(_d, "lib", "__init__.py")) or os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py"))):
    if os.path.dirname(_d) == _d: raise SystemExit(f"blender/lib not found above {os.path.abspath(__file__)}")   # never loop at the filesystem root
    _d = os.path.dirname(_d)
sys.path.insert(0, _d if os.path.isfile(os.path.join(_d, "lib", "__init__.py")) else os.path.join(_d, "blender"))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import math
import bpy, bmesh
from mathutils import Vector, Matrix
from lib import scene, mesh, uv, material, vcol, export, manifest
import ammo

ASSET = "prop_cartridge_line"


def build(args):
    ob = ammo.cartridge(ASSET + "_mesh", "line", n=6)
    ammo.finish_prop(ob, args.seed, ao_min=0.82)


def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    build(args)
    export.export_asset(ASSET, args.out, blend=args.blend)
    if args.preview: export.preview(ASSET, args.out)


if __name__ == "__main__":
    scene.run(main)
