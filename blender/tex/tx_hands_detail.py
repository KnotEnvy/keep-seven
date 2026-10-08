"""tx_hands_detail: 512 x 512 R8: the height of the hands' surface in tx_hands' layout, 0.5 = flat (ruling R14):
seams and their stitches, joint creases and wrinkles, the stitched points on the back of the hand, the bound edges, the
oilcloth's weave and folds. m_hands turns it into a bump (src/render/materials.ts).

    node tools/build-assets.mjs --only tx_hands_detail
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
    _, _, hgt = hands_tex.draw()
    td.write_png(out, np.clip(hgt, 0, 1))
    print(f"OK tx_hands_detail -> {out}  mean {float(hgt.mean()):.3f}  range {float(hgt.min()):.2f} .. {float(hgt.max()):.2f}")


if __name__ == "__main__":
    try: main()
    except SystemExit: raise
    except BaseException:
        import traceback; traceback.print_exc(); sys.exit(1)
