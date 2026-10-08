"""tx_hands: 512 x 512 RGBA sRGB: RGB = the albedo of the Reeve's gloves, wrists and cuffs, A = gloss (ruling R14).

    node tools/build-assets.mjs --only tx_hands

Drawn by blender/weapons/hands_tex.py (numpy, nothing baked) in the layout blender/weapons/hands.py gives the hands'
UV0 (hands.LAYOUT). tx_hands_detail is the same drawing's height.
"""
import sys, os, math, json
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
while not (os.path.isfile(os.path.join(_d, "lib", "__init__.py")) or os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py"))):
    if os.path.dirname(_d) == _d: raise SystemExit(f"blender/lib not found above {os.path.abspath(__file__)}")   # never loop at the filesystem root
    _d = os.path.dirname(_d)
sys.path.insert(0, _d if os.path.isfile(os.path.join(_d, "lib", "__init__.py")) else os.path.join(_d, "blender"))
import numpy as np
from lib import texdraw as td, manifest
sys.path.insert(0, os.path.join(manifest.ROOT, "blender", "weapons"))
import hands_tex


def main():
    out = sys.argv[sys.argv.index("--out") + 1]
    alb, gloss, _ = hands_tex.draw()
    img = np.empty((hands_tex.H, hands_tex.W, 4), dtype=np.float32)
    img[:, :, :3] = td.linear_to_srgb(np.clip(alb, 0, 1)); img[:, :, 3] = np.clip(gloss, 0, 1)
    td.write_png(out, img)
    print(f"OK tx_hands -> {out}  mean sRGB {[round(float(v) * 255, 1) for v in img[:, :, :3].mean(axis=(0, 1))]}")


if __name__ == "__main__":
    try: main()
    except SystemExit: raise
    except BaseException:
        import traceback; traceback.print_exc(); sys.exit(1)
