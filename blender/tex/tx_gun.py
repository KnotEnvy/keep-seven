"""tx_gun: 1024 x 512 RGBA sRGB: RGB = the revolver's albedo on its unique unwrap, A = gloss mask (ART_BIBLE 4.2, 8.1).

    node tools/build-assets.mjs --only tx_gun --force      (--force: edits of blender/weapons/gun_tex.py are not seen)

Drawn by blender/weapons/gun_tex.py (its docstring says what and how): assize.py builds the gun and its deterministic
unwrap (the same call weapon_revolver.py makes), five data passes are baked through it, numpy draws from them.
Alpha = gloss: blue 0.75, worn 0.9, walnut 0.35, brass 0.6. blender/weapons/tx_gun_points.json names four UV points
(blue, worn, walnut, brass) for tests/art_weapons/textures.test.mjs. tx_gun_detail is the same drawing's height.
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
    blue = np.asarray(manifest.palette_rgb("gun_blue"), dtype=np.float32)
    full = np.concatenate([np.clip(d["rgb"], 0, 1), np.clip(d["gloss"], 0, 1)[..., None]], axis=2)
    small = gun_tex.spread(full, d["covered"], np.concatenate([blue * 0.8, [0.75]]))
    outimg = np.empty((gun_tex.H, gun_tex.W, 4), dtype=np.float32)
    outimg[:, :, :3] = td.linear_to_srgb(small[:, :, :3]); outimg[:, :, 3] = small[:, :, 3]
    td.write_png(out, outimg)
    stats = {"density_px_per_m": round(float(d["density"]), 1), "size": [gun_tex.W, gun_tex.H], "blue_mean_srgb": d["blue_mean"], "points": d["points"]}
    td.write_json_if_changed(os.path.join(manifest.ROOT, "blender", "weapons", "tx_gun_points.json"), stats)
    print(f"OK tx_gun -> {out}  density {d['density']:.0f} px/m (weight 1)  blue mean sRGB {stats['blue_mean_srgb']}")


if __name__ == "__main__":
    try: main()
    except SystemExit: raise
    except BaseException:
        import traceback; traceback.print_exc(); sys.exit(1)
