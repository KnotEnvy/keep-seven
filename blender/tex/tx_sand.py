"""tx_sand: 512 x 512 greyscale detail (R8), tiles both ways, 4 m per repeat (128 px/m). ART_BIBLE 4.2.

    node tools/build-assets.mjs --only tx_sand

Wind ripple in ONE direction: the crests run north-east to south-west so the low north-west sun rakes across them.
Mapping convention (uv.map_planar_world): u = east / 4 m, v = north / 4 m, so in this image (row 0 = north) a crest
is a line from the lower left to the upper right. Neutral 0.5, values 0.38..0.62, no seam lines.
"""
import sys, os, math
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
while not (os.path.isfile(os.path.join(_d, "lib", "__init__.py")) or os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py"))):
    if os.path.dirname(_d) == _d: raise SystemExit(f"blender/lib not found above {os.path.abspath(__file__)}")   # never loop at the filesystem root
    _d = os.path.dirname(_d)
sys.path.insert(0, _d if os.path.isfile(os.path.join(_d, "lib", "__init__.py")) else os.path.join(_d, "blender"))
import numpy as np
from lib import texdraw as td

S = 512
METRES = 4.0
K = 26          # ripples crossed along either axis per repeat: wavelength 4 m / (26 * sqrt 2) = 0.109 m


def build(seed=7):
    X, Y = td.grid(S, S)
    u = X / S; v = 1.0 - Y / S                                                    # v up = north
    # phase is constant along (1, 1) (north-east); integer K keeps it periodic in u and in v
    warp = (td.fbm(S, S, 3, 3, octaves=3, seed=seed) - 0.5) * 2.6                 # bends and forks the crests
    warp += (td.fbm(S, S, 9, 9, octaves=2, seed=seed + 1) - 0.5) * 0.55
    ph = 2 * math.pi * (K * (u - v) + warp)
    # asymmetric profile: long windward slope, short lee slope (wind from the north-west)
    prof = np.sin(ph + 0.55 * np.sin(ph))
    amp = 0.55 + 0.45 * td.fbm(S, S, 4, 4, octaves=2, seed=seed + 2)               # ripples fade in patches
    a = 0.5 + 0.075 * prof * amp
    a += 0.018 * np.clip(prof, 0, 1) ** 6 * amp                                    # a bright line on the crest
    a += (td.fbm(S, S, 2, 2, octaves=3, seed=seed + 3) - 0.5) * 0.07               # broad drift tone
    grain = td.value_noise(S, S, 256, 256, seed + 4) - 0.5                         # grit
    a += grain * 0.035
    peb = td.value_noise(S, S, 128, 128, seed + 5)
    a -= 0.045 * np.clip((peb - 0.9) * 10.0, 0, 1)                                 # scattered small stones
    return td.finish_detail(a)


def main():
    out = sys.argv[sys.argv.index("--out") + 1]
    a = build()
    wx, ix, wy, iy = td.seam_error(a)
    td.write_png(out, a)
    print(f"OK tx_sand min {a.min():.3f} max {a.max():.3f} seam x {wx:.4f} (inner {ix:.4f}) y {wy:.4f} (inner {iy:.4f}) -> {out}")


if __name__ == "__main__":
    try: main()
    except SystemExit: raise
    except BaseException:
        import traceback; traceback.print_exc(); sys.exit(1)
