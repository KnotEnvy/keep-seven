"""env_the_lip: The Lip: overhang, gully, forecourt, gate wall, dead pylon (docs/workorders/art-env-exterior.md 4).

    node tools/build-assets.mjs --only env_exterior        # both zones + lm_surface, always together

The geometry of BOTH exterior zones, the light and the lm_surface atlas come from surface_common.build(); this script
vertex-lights its own vertex-lit faces with both zones in the scene, keeps its own objects and exports its chunk plan.
"""
import sys, os
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _d)
while not (os.path.isfile(os.path.join(_d, "lib", "__init__.py")) or os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py"))):
    if os.path.dirname(_d) == _d: raise SystemExit(f"blender/lib not found above {os.path.abspath(__file__)}")
    _d = os.path.dirname(_d)
sys.path.insert(0, _d if os.path.isfile(os.path.join(_d, "lib", "__init__.py")) else os.path.join(_d, "blender"))
from lib import scene
import surface_common

ASSET = "env_the_lip"


def main():
    args = scene.asset_args(os.path.basename(__file__))
    S = surface_common.build()
    surface_common.finish_zone(S, "lip", ASSET, args)


if __name__ == "__main__":
    scene.run(main)
