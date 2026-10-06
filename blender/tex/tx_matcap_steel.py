"""tx_matcap_steel: 256 x 256 RGBA sRGB matcap for the gun's specular (ART_BIBLE 4.2, 8.1): a blued-steel sphere seen
in view space: a dark body, ONE soft warm highlight upper left, ONE thin cool rim lower right.

    node tools/build-assets.mjs --only tx_matcap_steel

How it is used (m_gun, code-render): specular = matcap(view-space normal) x gloss (tx_gun alpha) x zone key colour,
ADDED to the lit albedo. So the body must stay near black (the gun is the darkest object in every frame) and all the
light is in the two features:
  * the gun is seen almost edge-on (its flats and its cylinder face at 70-90 degrees to the eye), so the features
    reach the rim of the disc: the warm key is a soft lobe centred at 0.78 of the radius, upper left, whose tail
    reaches the edge; the octagon flat whose normal points there catches it ("one flat always catches the key");
  * the cool rim is a thin crescent on the last 9 % of the radius, lower right only;
  * a faint, cool sky gradient (upper half brighter by a hair) keeps the body from a dead flat black.
Outside the disc (normals that only rounding error puts there) repeats the rim colour, so filtering never brings in
black. Alpha is 1.
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

S = 256
SS = 4


def matcap(n=S, ss=SS):
    X, Y = td.grid(n, n, ss)
    nx = (X - n / 2) / (n / 2); ny = -(Y - n / 2) / (n / 2)
    r = np.sqrt(nx * nx + ny * ny)
    rc = np.minimum(r, 1.0)
    sx = np.where(r > 1.0, nx / np.maximum(r, 1e-6), nx); sy = np.where(r > 1.0, ny / np.maximum(r, 1e-6), ny)
    nz = np.sqrt(np.clip(1.0 - rc * rc, 0.0, 1.0))
    body = np.array([0.0045, 0.0055, 0.0085], dtype=np.float32)
    lin = body[None, None, :] * (0.55 + 0.45 * nz[..., None])
    sky = np.clip(0.5 + 0.5 * sy, 0, 1) ** 2 * 0.010 * (0.4 + 0.6 * rc)
    lin = lin + sky[..., None] * np.array([0.55, 0.70, 1.0], dtype=np.float32)
    # the warm key: a soft lobe toward the upper left, its tail out to the rim
    kx, ky = -0.55, 0.55
    d = np.sqrt((sx - kx) ** 2 + (sy - ky) ** 2)
    core = np.exp(-(d / 0.13) ** 2) * 1.35 + np.exp(-(d / 0.30) ** 2) * 0.075          # a tight core and a faint tail: satin, and the body stays black (pass 2: the tail was 0.22 wide 0.38 and greyed every upward face)
    lin = lin + core[..., None] * np.array([1.0, 0.82, 0.60], dtype=np.float32)
    # the cool rim: a thin crescent on the last 9 % of the radius, lower right
    ang = np.arctan2(sy, sx)                                                # -135 deg is lower left, -45 lower right
    dir_ = np.clip(np.cos(ang + math.pi / 4.0), 0.0, 1.0) ** 3              # 1 at lower right
    rim = np.clip((rc - 0.91) / 0.09, 0.0, 1.0) ** 1.6 * dir_ * 0.55
    lin = lin + rim[..., None] * np.array([0.45, 0.68, 1.0], dtype=np.float32)
    img = np.ones((n * ss, n * ss, 4), dtype=np.float32)
    img[:, :, :3] = np.clip(lin, 0, 1)
    small = td.downsample(img, ss)
    out = np.ones((n, n, 4), dtype=np.float32)
    out[:, :, :3] = td.linear_to_srgb(small[:, :, :3])
    return out


def main():
    out = sys.argv[sys.argv.index("--out") + 1]
    td.write_png(out, matcap())
    print(f"OK tx_matcap_steel -> {out}")


if __name__ == "__main__":
    try: main()
    except SystemExit: raise
    except BaseException:
        import traceback; traceback.print_exc(); sys.exit(1)
