"""prop_cartridge_lead: one .45 round, life size (brass case 12 x 33 mm, grey lead nose, 41 mm overall). Two variant
nodes, 40 triangles each: `round_live`, and `round_spent` (the empty case: the weight on the first note). Pivot: case
head centre; the round stands on its head. Built by blender/weapons/ammo.py, the same function as the rounds in the gun.

    node tools/build-assets.mjs --only prop_cartridge_lead
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

ASSET = "prop_cartridge_lead"


def build(args):
    live = ammo.cartridge("round_live", "lead", n=7)
    spent = ammo.cartridge("round_spent", "lead", n=7, spent=True)
    for ob in (live, spent): ammo.finish_prop(ob, args.seed, ao_min=0.82)


def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    build(args)
    export.export_asset(ASSET, args.out, blend=args.blend)
    if args.preview: export.preview(ASSET, args.out)


if __name__ == "__main__":
    scene.run(main)
