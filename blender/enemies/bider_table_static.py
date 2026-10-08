"""bider_table_static: a Bider at the tally table (sit_table, frame 0). 600 tris, a small live knot, hands flat, breath weight in UV1.x. Pivot: the floor under the chair.

    node tools/build-assets.mjs --only bider_table_static

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

ASSET = "bider_table_static"


def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    bider_build.build_static(ASSET, args, clip="sit_table", frame=0, budget=900, emissive=True, knot_radius=0.075, breath=True, lo=2, coat_lo=2,
                              seat=(-0.24, -0.235, 0.24, 0.27, 0.450, 0.212),
                              # pass i1: the triangles go where she looks (the hood, the sleeves and hands on the table), not under the table
                              opts={"hood": 2, "arm_sides": 6, "thumb": True, "legs_least": "no_shaft", "sash": False, "nod": True, "knot": 1})   # pass i3: 900 triangles (R14); the lashings of the knot are geometry here
    export.export_asset(ASSET, args.out, blend=args.blend)
    if args.preview: export.preview(ASSET, args.out)


if __name__ == "__main__":
    scene.run(main)
