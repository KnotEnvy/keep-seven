"""proj_stake: the Transit's survey stake (ART_BIBLE 7.6, work order art-enemies 4.4). 2 x 24 triangles, instanced.

    node tools/build-assets.mjs --only proj_stake
    node tools/preview-asset.mjs proj_stake --game --cycles --piece art-enemies-transit

A forged pin 0.6 m long and 0.04 m across its head: a leaf-shaped head (the tip third), a narrow neck, a shaft that
thickens to a struck butt. The TIP is the origin and points +Z in game space (Blender -Y: the direction of flight); the
rod runs back along game -Z. Two variant nodes, one shown at a time:
    stake_hot    in flight and freshly stuck: head `flame` (emissive), its point `flame_core` (the white core)
    stake_cool   cooled in whatever it hit: head in dull orange `stake_cool` (#B5522B, paint, no glow), point darker
Diamond section (an edge up), so one facet always catches the key light and the rod never reads as a flat strip.
"""
import sys, os
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
while not (os.path.isfile(os.path.join(_d, "lib", "__init__.py")) or os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py"))):
    if os.path.dirname(_d) == _d: raise SystemExit(f"blender/lib not found above {os.path.abspath(__file__)}")
    _d = os.path.dirname(_d)
sys.path.insert(0, _d if os.path.isfile(os.path.join(_d, "lib", "__init__.py")) else os.path.join(_d, "blender"))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from mathutils import Matrix
from lib import scene, mesh, vcol, export
import transit_common as tc

ASSET = "proj_stake"
LENGTH = 0.60
HEAD = 0.07            # where the head is widest, from the tip
NECK = 0.20            # the end of the hot third
BUTT = 0.565
# local +Z of the builders -> Blender +Y (the rod runs back from the tip), local Y -> Blender -Z
ALONG = Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, -1, 0, 0), (0, 0, 0, 1)))


def stake(name, head, point, glow):
    tip = [(0.0, 0.0, 0.0)]
    a = tc.square(0.020, HEAD, turn=True); b = tc.square(0.0125, NECK, turn=True); c = tc.square(0.020, BUTT, turn=True)
    parts = [tc.loft(name + "_point", [tip, a], point, M=ALONG, emis=glow, smooth=20),
             tc.loft(name + "_head", [a, b], head, M=ALONG, emis=glow, smooth=20),
             tc.loft(name + "_shaft", [b, c, [(0.0, 0.0, LENGTH)]], "steel", M=ALONG, smooth=20)]
    ob = mesh.join(parts, name)
    vcol.compose_vertex_color(ob, mode='ratio', gradient=(1.0, 1.0), jitter=0.0)
    # paint: the shaft is sooted where it leaves the head and worn pale at the struck butt; a cooled head darkens to
    # its point (quenched in whatever it hit). Nothing dims a glowing face.
    tc.multiply(ob, lambda p: 0.62 + 0.38 * tc.smoothstep(NECK, BUTT, p[:, 1]), cells=("steel",))
    if glow: tc.whiten(ob, ("flame", "flame_core"))
    else: tc.multiply(ob, lambda p: 0.55 + 0.45 * tc.smoothstep(0.0, NECK, p[:, 1]), cells=("stake_cool",))
    return ob


def build(args):
    stake("stake_hot", "flame", "flame_core", True)
    stake("stake_cool", "stake_cool", "stake_cool", False)


def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    build(args)
    export.export_asset(ASSET, args.out, blend=args.blend)
    if args.preview: export.preview(ASSET, args.out, clips=False)


if __name__ == "__main__":
    scene.run(main)
