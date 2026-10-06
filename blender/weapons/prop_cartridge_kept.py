"""prop_cartridge_kept: the kept round: the same brass case with THE BAND, an enamel sleeve 9 mm wide round the waist
with a livery hairline. Three variant nodes, 48 triangles each (five sides, so the band and its hairline fit the budget):
    round_sealed   band whole, grey lead nose
    round_spent    the empty case, mouth up, band intact (six stand on the rim stone)
    round_violet   unfired; the band's hairline is the faint VIOLET EMISSIVE cell (the stone's seventh)
Pivot: case head centre. Built by blender/weapons/ammo.py, the same function as `kept_loop` / `round_hand_kept` in the gun.

    node tools/build-assets.mjs --only prop_cartridge_kept
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

ASSET = "prop_cartridge_kept"


def build(args):
    obs = [ammo.cartridge("round_sealed", "kept", n=5),
           ammo.cartridge("round_spent", "kept", n=5, spent=True),
           ammo.cartridge("round_violet", "kept", n=5, hairline="violet")]
    for ob in obs: ammo.finish_prop(ob, args.seed, ao_min=0.82)


def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    build(args)
    export.export_asset(ASSET, args.out, blend=args.blend)
    if args.preview: export.preview(ASSET, args.out)


if __name__ == "__main__":
    scene.run(main)
