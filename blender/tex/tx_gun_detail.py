"""tx_gun_detail: 1024 x 512 R8: the height of the revolver's surface in tx_gun's layout, 0.5 = flat (ruling R14): the
grip frame's seams, a milled panel and a counterbore round each screw on the frame's flanks, screw slots, the bolt
notches and their leads, turned lines, tool marks, pitting, the walnut's grain and pores, the stamp. m_gun bends what
the steel mirrors with it and shades its hollows (src/render/materials.ts, GUN branch).

    node tools/build-assets.mjs --only tx_gun_detail --force      (--force: edits of blender/weapons/gun_tex.py are not seen)
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
import gun_tex


def main():
    out = sys.argv[sys.argv.index("--out") + 1]
    d = gun_tex.draw()
    small = gun_tex.spread(np.clip(d["height"], 0, 1)[..., None], d["covered"], [0.5])[:, :, 0]
    td.write_png(out, small)
    print(f"OK tx_gun_detail -> {out}  mean {float(small.mean()):.3f}  range {float(small.min()):.2f} .. {float(small.max()):.2f}")


if __name__ == "__main__":
    try: main()
    except SystemExit: raise
    except BaseException:
        import traceback; traceback.print_exc(); sys.exit(1)
