"""prop_lantern: a square tin lantern 0.16 x 0.34 x 0.16 m: four horn panes (opaque, warm), a wire bail, a flame cell
inside (an emissive quad cross), a pierced tin cap (ART_BIBLE 7.4; P1). Instanced, breakable dressing: two variant
nodes, each ONE mesh and one material (`m_prop`; the flame is the palette's emissive `flame` / `flame_core` cells):

    lantern_lit    the Tally lantern: the panes glow warm, the flame cross is lit
    lantern_dark   the street lanterns: horn gone grey, a cold wick

One pane is long broken out of each (a shard left in the corner of the frame): that is how the flame is seen.
Pivot: the top of the bail (it hangs below the origin).

    node tools/build-assets.mjs --only prop_lantern
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

ASSET = "prop_lantern"


W = 0.16
TOP = -0.075                   # the top of the cap, below the bail's top (the pivot)
BODY_T, BODY_B = -0.135, -0.315
FOOT = -0.34


def variant(name, lit, seed):
    import random
    rng = random.Random(seed)
    parts = []
    hw = W / 2
    tin = lambda o, shade=1.0, ao=None: (dc.paint(o, "chalk", "tin", shade=shade, ao=ao), parts.append(o))
    # base tray and four corner posts
    tin(dc.box(name + "_base", (W, W, 0.028), (0, 0, FOOT + 0.014), taper=(0.9, 0.9)), 0.85)
    for i, (sx, sy) in enumerate(((-1, -1), (1, -1), (1, 1), (-1, 1))):
        tin(dc.beam(f"{name}_post{i}", (sx * (hw - 0.01), sy * (hw - 0.01), BODY_B), (sx * (hw - 0.01), sy * (hw - 0.01), BODY_T), 0.02, 0.02, up=(1, 0, 0), cap=(False, False)), 0.8, ao=False)
    # the cap: a hipped tin roof, a pierced vent box on it, and the ring the bail hooks through
    roof = dc.lathe(name + "_roof", [(hw * 1.5, BODY_T - 0.004), (hw * 0.62, TOP - 0.022)], seg=4, phase=math.pi / 4, cap_last=True)
    tin(roof, 0.9)
    tin(dc.box(name + "_vent", (0.07, 0.07, 0.03), (0, 0, TOP - 0.012), taper=(0.7, 0.7), drop=("-z",)), 0.72)
    # the panes: horn, set back in the frame; the front one is broken out, a shard left low in one corner
    horn = "#E2BC78" if lit else "#9A8A6A"
    for i, a in enumerate((90, 180, 270)):
        c, s = math.cos(math.radians(a)), math.sin(math.radians(a))
        d = hw - 0.018
        t = (-s, c)
        q = [(c * d - t[0] * (hw - 0.02), s * d - t[1] * (hw - 0.02), BODY_B), (c * d + t[0] * (hw - 0.02), s * d + t[1] * (hw - 0.02), BODY_B),
             (c * d + t[0] * (hw - 0.02), s * d + t[1] * (hw - 0.02), BODY_T), (c * d - t[0] * (hw - 0.02), s * d - t[1] * (hw - 0.02), BODY_T)]
        pane = dc.poly(f"{name}_pane{i}", [q])
        dc.paint(pane, "chalk", horn, shade=rng.uniform(0.9, 1.0), ao=False); parts.append(pane)
    d = hw - 0.018
    shard = dc.poly(name + "_shard", [[(-(hw - 0.02), -d, BODY_B), (0.012, -d, BODY_B), (-(hw - 0.02), -d, BODY_B + 0.075)]])
    dc.paint(shard, "chalk", horn, shade=0.85, ao=False); parts.append(shard)
    # the candle stub and the flame: a quad cross (seen from every side through the broken pane)
    tin(dc.lathe(name + "_candle", [(0.016, BODY_B), (0.014, BODY_B + 0.05)], seg=5, cap_last=True), 1.2)
    fz0, fz1 = BODY_B + 0.05, BODY_B + (0.115 if lit else 0.068)
    fw = 0.024 if lit else 0.004
    cross = []
    for a in (0.3, 0.3 + math.pi / 2):
        c, s = math.cos(a), math.sin(a)
        cross.append([(-c * fw, -s * fw, fz0), (c * fw, s * fw, fz0), (c * fw * 0.25, s * fw * 0.25, fz1), (-c * fw * 0.25, -s * fw * 0.25, fz1)])
    flame = dc.poly(name + "_flame", cross, double=True)
    if lit:
        dc.paint(flame, "flame", ao=False, part=False)                  # the palette's emissive cell: it glows
    else:
        dc.paint(flame, "chalk", "#1B1817", ao=False, part=False)       # a cold wick
    parts.append(flame)
    # the bail: fat wire from ear to ear over the cap, to the pivot
    bail = dc.tube(name + "_bail", [(-hw * 1.02, 0, BODY_T + 0.006), (-hw * 0.95, 0, TOP + 0.03), (-0.02, 0, -0.004), (0.02, 0, -0.004), (hw * 0.95, 0, TOP + 0.03), (hw * 1.02, 0, BODY_T + 0.006)],
                   r=0.0055, sides=3, cap=False, up=(0, 1, 0))
    tin(bail, 0.6, ao=False)
    dc.bake_ao(parts, distance=0.15, ground=None)
    ob = dc.join(parts, name)
    dc.smooth(ob, angle=35)

    def glow(p):
        if lit:
            inside = (np.abs(p.x) < hw - 0.012) & (np.abs(p.y) < hw - 0.012) & (p.z < BODY_T) & (p.z > BODY_B)
            p.mix(inside * dc.P.near(p, (0, 0, fz1), 0.16) * 0.5, "#FFD9A0")          # the panes hottest opposite the flame
        tinm = (p.col[:, 0] < 0.5) & (p.col[:, 0] > 0.1)
        p.mix(tinm * (p.z > BODY_T - 0.01) * 0.45, "#2A2623")                           # the cap is sooted black
        p.mix(tinm * (p.z < BODY_B + 0.005) * 0.25, "rust")                             # the foot rusts where it stands
    dc.compose(ob, ao=0.8, gradient=(0.92, 1.04), part_jitter=0.03, seed=seed, painters=[glow], quiet=True)
    return ob


def build(args):
    variant("lantern_lit", True, args.seed + 1)
    variant("lantern_dark", False, args.seed + 2)


def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    build(args)
    dc.export_asset(ASSET, args)


if __name__ == "__main__":
    scene.run(main)
