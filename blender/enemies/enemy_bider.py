"""enemy_bider: a townsperson of Plenty, hooded, waiting. One skinned mesh (m_prop), 22 bones, 18 clips.

    node tools/build-assets.mjs --only enemy_bider
    node tools/preview-asset.mjs enemy_bider --piece art-enemies-bider --clip all --cycles --game

The figure, the rig and the solver are in bider_build.py; the clips are in bider_clips.py (ART_BIBLE 6.1, 7.6; GDD 7.1).
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

ASSET = "enemy_bider"


def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    bider_build.build_skinned(ASSET, args)
    export.export_asset(ASSET, args.out, blend=args.blend)
    if args.preview: export.preview(ASSET, args.out, clips=True)


if __name__ == "__main__":
    scene.run(main)
