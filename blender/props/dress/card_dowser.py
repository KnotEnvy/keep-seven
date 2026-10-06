"""card_dowser: the Dowser billboard (ART_BIBLE 6.5). A 0.9 x 2.0 m alpha-tested quad using tx_mask region
`card_dowser`: a DARK long-coated figure (polish round 3, lead ruling R4: was pale) with a hat and a forked rod held out at his right arm's length, upright (polish round 4: it was held low and could not be seen), three-quarter away. Exactly two
triangles, `m_mask`, UNLIT; COLOR_0 is the coat, near black (#15121A). Pivot: the feet. Node `glint`: an empty at the rod tip
(read from the mask table, so a redrawn region moves it). Code billboards the card about Y and scales it.

    node tools/build-assets.mjs --only card_dowser
"""
import sys, os
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _d)
while not (os.path.isfile(os.path.join(_d, "lib", "__init__.py")) or os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py"))):
    if os.path.dirname(_d) == _d: raise SystemExit(f"blender/lib not found above {os.path.abspath(__file__)}")
    _d = os.path.dirname(_d)
sys.path.insert(0, _d if os.path.isfile(os.path.join(_d, "lib", "__init__.py")) else os.path.join(_d, "blender"))
import math
import numpy as np
from mathutils import Vector, Matrix
from lib import scene, mesh, uv, material, vcol, export, manifest, layout
import dress_common as dc

ASSET = "card_dowser"


W, H = 0.9, 2.0
COAT = "#15121A"              # near-black long coat, L* under 8 before haze


def build(args):
    card = dc.poly(ASSET + "_mesh", [(-W / 2, 0.0, 0.0), (W / 2, 0.0, 0.0), (W / 2, 0.0, H), (-W / 2, 0.0, H)])   # faces -Y: the asset's front
    material.assign(card, "m_mask")
    uv.map_to_mask(card, None, "card_dowser")
    # polish round 3, lead ruling R4: a DARK silhouette against clear sky (art-env-exterior stands him on the mesa's
    # skyline now; docs/requests/art-env-exterior.md row 18). Was the palette's `dowser_pale`.
    vcol.fill_color(card, COAT)
    card["bake"] = "UNLIT"
    reg = manifest.mask_regions()["regions"]["card_dowser"]
    gx, gy = reg.get("glint_px", (reg["px"][2] * 0.96, reg["px"][3] * 0.59))
    u = gx / reg["px"][2]; v = 1.0 - gy / reg["px"][3]
    # map_to_mask runs +U toward the viewer's right as she faces the card's front (-Y side): that is Blender -X ... checked
    # against the shipped file in tests/art_props/dress/variants.test.mjs (the glint lies on an opaque texel's edge)
    uvs = uv.get(card)
    xs = [card.data.vertices[card.data.loops[i].vertex_index].co.x for i in range(4)]
    u0, u1 = manifest.mask_uv("card_dowser")[0], manifest.mask_uv("card_dowser")[2]
    left_u = uvs[int(np.argmin(xs))][0]
    sign = 1.0 if abs(left_u - u0) < abs(left_u - u1) else -1.0        # +1: U grows with Blender +X
    export.marker("glint", (sign * (u - 0.5) * W, -0.01, v * H))


def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    build(args)
    dc.export_asset(ASSET, args)


if __name__ == "__main__":
    scene.run(main)
