"""prop_stock_gate: the drop-bar gate of the gully mouth (door_jug_gate, 4.0 x 2.8 m). A bar 4.6 x 0.3 x 0.35 of three
lashed baulks whose underside is 2.35 m up when shut, six iron hooks on its lip-side face 0.7 m apart (the jugs hang
from them), and a slatted hurdle 3.9 x 2.35 hanging from it.

Pivot: bottom centre of the hurdle, closed. Asset -Z (Blender +Y) is the forecourt side: the side she comes from, the
hooks' side. Everything is skinned to `gate_bar` (code raises it 0.2 m per jug; a vertical bone, so its frame is the
game's axes); `hook_1..6` are empties riding it at the crook of each hook. Baulks and hurdle are m_frontier (plank
rows of tx_frontier_trim), the iron and the cord m_prop."""

import sys, os
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
while not os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py")):
    if os.path.dirname(_d) == _d: raise SystemExit("blender/lib not found")
    _d = os.path.dirname(_d)
sys.path.insert(0, os.path.join(_d, "blender")); sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import math
import numpy as np
from mathutils import Vector, Matrix
from lib import scene, mesh, uv, material, vcol, rig, anim, export, zone, brand, knot, layout, manifest
import mech_common as mc

ASSET = "prop_stock_gate"

FT = "tx_frontier_trim"
BAR_Z = 2.35


def timber(ob, rng, row=None, ends=True):
    """Trim-map a Frontier timber: a plank row along its length, end grain on the two small faces."""
    uv.map_to_trim(ob, None, FT, row or rng.choice(("plank_a", "plank_b")), rng=rng)
    return ob


def baulk(name, length, w, h, centre, rng, tint):
    ch = min(w, h) * 0.22
    outline = [(-w / 2 + ch, -h / 2), (w / 2 - ch, -h / 2), (w / 2, -h / 2 + ch), (w / 2, h / 2 - ch), (w / 2 - ch, h / 2), (-w / 2 + ch, h / 2), (-w / 2, h / 2 - ch), (-w / 2, -h / 2 + ch)]
    ob = mc.prism(name, outline, length, tint, front=True, back=True, mat="m_frontier", smooth=50)
    ob.data.transform(Matrix.Translation((0, length / 2, 0)))
    mc.place(ob, centre, (rng.uniform(-0.006, 0.006), rng.uniform(-0.01, 0.01), math.pi / 2 + rng.uniform(-0.004, 0.004)))
    uv.map_to_trim(ob, lambda p: abs(p.normal.x) < 0.7, FT, "plank_b" if rng.random() < 0.4 else "plank_a", rng=rng, metres_per_repeat=2.4)
    uv.map_to_trim(ob, lambda p: abs(p.normal.x) >= 0.7, FT, "plank_end", along='horizontal')
   
    return ob


def build(args):
    rng = scene.rng(args.seed)
    wood, iron = [], []
    # ---- the bar: two baulks below, one above, never the same length; the lower back one carries the hooks
    wood.append(baulk("baulk_front", 4.6, 0.17, 0.165, (0.0, -0.088, BAR_Z + 0.083), rng, "board"))
    wood.append(baulk("baulk_back", 4.52, 0.172, 0.16, (0.03, 0.089, BAR_Z + 0.08), rng, "board_bleached"))
    wood.append(baulk("baulk_top", 4.44, 0.21, 0.14, (-0.05, 0.004, BAR_Z + 0.232), rng, "board_bleached"))
    for x in (-1.92, -0.62, 0.66, 1.9):                                           # cord lashings round the three
        l = mc.slab("lash", (0.09, 0.372, 0.325), (x, 0.0, BAR_Z + 0.152), "cord", drop=("x-", "x+"), mat="m_frontier", rot=(0, 0, rng.uniform(-0.05, 0.05)))
        uv.map_to_trim(l, None, FT, "cord", rng=rng); wood.append(l)
    for sx in (-1, 1):                                                           # iron bands where the ends ride the piers' guides
        b = mc.slab("band", (0.07, 0.366, 0.318), (sx * 2.16, 0.0, BAR_Z + 0.15), "rust", drop=("x-", "x+"), mat="m_frontier")
        uv.map_to_trim(b, None, FT, "strap", rng=rng); wood.append(b)
    # ---- the hurdle: three stiles, slats on the lip side with their ends free; one slat gone, one broken and hanging
    for i, x in enumerate((-1.86, 0.02, 1.86)):
        s = mc.slab(f"stile{i}", (0.11, 0.06, 2.33), (x, -0.01, 1.185), "board", drop=("z-",), mat="m_frontier", rot=mc.jit(rng), taper=(0.95, 1.0))
        timber(s, rng); wood.append(s)
    z = 0.12; k = 0
    while z < 2.2:
        h = rng.uniform(0.16, 0.24); gap = rng.uniform(0.10, 0.15)
        if k == 4: z += h + gap; k += 1; continue                               # the missing one
        tint = "board" if k == 2 else "board_bleached"
        if k == 6:                                                              # broken: half of it hangs by one nail
            s = mc.slab(f"slat{k}", (1.75, 0.03, h), (-1.05, 0.035, z + h / 2 - 0.12), tint, mat="m_frontier", rot=(0.02, math.radians(-9), 0.01))
        else:
            s = mc.slab(f"slat{k}", (3.9 - rng.uniform(0, 0.04), 0.03, h), (rng.uniform(-0.01, 0.01), 0.035 + rng.uniform(-0.004, 0.004), z + h / 2), tint,
                        mat="m_frontier", rot=mc.jit(rng))
        timber(s, rng); wood.append(s)
        z += h + gap; k += 1
    br = mc.slab("brace", (4.1, 0.03, 0.14), (0.0, -0.05, 1.15), "board", mat="m_frontier", rot=(0, math.radians(-28), 0), drop=("y+",))
    timber(br, rng); wood.append(br)
    for x in (-1.86, 0.02, 1.86):                                               # the hurdle is tied up to the bar
        l = mc.slab("tie", (0.07, 0.24, 0.22), (x, 0.0, BAR_Z - 0.04), "cord", drop=("x-", "x+", "z+"), mat="m_frontier")
        uv.map_to_trim(l, None, FT, "cord", rng=rng); wood.append(l)
    # ---- six iron hooks driven into the lower back baulk; the jug cord sits in the crook at (x, 2.36, -0.15) game
    xs = (-1.75, -1.05, -0.35, 0.35, 1.05, 1.75)
    for i, x in enumerate(xs):
        j = rng.uniform(-0.008, 0.008)
        iron.append(mc.tube(f"hook{i}", [(x + j, 0.165, BAR_Z + 0.115), (x + j, 0.215, BAR_Z + 0.075), (x, 0.205, BAR_Z - 0.012), (x, 0.15, BAR_Z - 0.03), (x, 0.118, BAR_Z + 0.0)],
                            0.018, 3, "rust", caps=(False, True), up=(1, 0, 0)))
    iron.append(mc.tube("sweep_cord", [(2.08, 0.0, BAR_Z + 0.30), (2.10, 0.01, BAR_Z + 0.52)], 0.022, 3, "cord", caps=(False, True)))
    arm = rig.make_armature(ASSET + "_rig", [("root", (0, 0, 0), (0, 0, 0.1), None), ("gate_bar", (0, 0, BAR_Z), (0, 0, BAR_Z + 0.1), "root")])
    w = rig.join_as_rigid_skin({"gate_bar": wood}, arm, ASSET + "_mesh")
    m = rig.join_as_rigid_skin({"gate_bar": iron}, arm, "gate_iron")
    vcol.bake_ao_vertex([w, m], distance=0.4, samples=128)
    vcol.compose_vertex_color(w, mode='tint', dust=0.45, dust_height=0.7, bleach="board_bleached", bleach_amount=0.35, jitter=0.07, seed=args.seed, gradient=(0.8, 1.08))
    vcol.compose_vertex_color(m, mode='ratio', jitter=0.05, seed=args.seed, gradient=(0.9, 1.0), z_range=(0, 2.7))
    vcol.streak_under(w, [(x, 0.18, BAR_Z + 0.02) for x in xs], width=0.07, length=0.3, factor=0.75)      # rust runs under every hook
    m["thin_ok"] = 12.0
    for i, x in enumerate(xs):
        e = export.marker(f"hook_{i + 1}", (x, 0.15, 2.36))
        rig.parent_to_bone(e, arm, "gate_bar")

if __name__ == "__main__":
    mc.std_main(ASSET, build)
