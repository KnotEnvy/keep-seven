"""bider_seated_static: the freed Bider, seated on its heels (last frame of sit_down). 500 tris, knot dead (husk grey), slits dark, breath weight in UV1.x.

    node tools/build-assets.mjs --only bider_seated_static

The same build function as enemy_bider (bider_build.py), skinned into the pose exactly as the runtime skins the enemy,
then decimated part by part (one palette cell per part, so no colour bleeds), AO baked on the posed mesh over a ground.
"""
import sys, os
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _d)
while not (os.path.isfile(os.path.join(_d, "lib", "__init__.py")) or os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py"))):
    if os.path.dirname(_d) == _d: raise SystemExit(f"blender/lib not found above {os.path.abspath(__file__)}")
    _d = os.path.dirname(_d)
sys.path.insert(0, _d if os.path.isfile(os.path.join(_d, "lib", "__init__.py")) else os.path.join(_d, "blender"))
from lib import scene, export
import bider_build

ASSET = "bider_seated_static"


def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    bider_build.build_static(ASSET, args, clip="sit_down", frame=-1, budget=500, emissive=False, breath=True)
    export.export_asset(ASSET, args.out, blend=args.blend)
    if args.preview: export.preview(ASSET, args.out)


if __name__ == "__main__":
    scene.run(main)
