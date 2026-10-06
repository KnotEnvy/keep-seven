"""ia_yard_door: a Pellam access panel the town hung as the yard door, 2.6 x 2.8 x 0.12 (salvage: a seam object).

Pivot: the hinge axis at ground (bottom of the -X edge); the leaf runs along +X. Unskinned: the animated empty `leaf`
carries the one mesh. Street face = asset -Z (Blender +Y): the steel latch plate (the knot's seat: `knot_mech` stands on the door face with its centre 0.08 m proud, at socket_knot), 0.95 m from the
door centre toward the latch edge, and two hand-forged strap hinges. Yard face = asset +Z (Blender -Y).
`socket_knot` (2.25, 1.3, -0.14) stays with the root: it marks layout knot_yard_latch."""

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

ASSET = "ia_yard_door"

W, H = 2.6, 2.8


def build(args):
    rng = scene.rng(args.seed)
    parts = []
    # ---- the Pellam panel: a steel edge frame with 0.15 m corners, two enamel panels a side with the exact 20 mm bevel
    # (outline break, ART_BIBLE 5.3: the top corner on the latch side was broken out of the frame when it was salvaged)
    outline = [(x, z) for (x, z) in mc.rounded_rect(W, H, 0.15, 3) if not (x > W / 2 - 0.2 and z > H / 2 - 0.2)]
    k = next(i for i, (x, z) in enumerate(outline) if x < W / 2 - 0.2 and z > H / 2 - 0.2)      # first point after the removed corner (ccw)
    outline[k:k] = [(W / 2, H / 2 - 0.36), (W / 2 - 0.10, H / 2 - 0.20), (W / 2 - 0.17, H / 2 - 0.22), (W / 2 - 0.33, H / 2)]
    core = mc.prism("frame", outline, 0.08, "steel", centre=(W / 2, 0.04, H / 2), front=True, back=True)
    parts.append(core)
    for side in (-1, 1):                                                       # -1: yard face (-Y), +1: street face (+Y)
        for px in (0.2 + 0.54, W - 0.2 - 0.54):
            p = mc.pillow("panel", 1.08, 2.38, 0.02, 0.02, "enamel", centre=(px, -0.04 * 1, H / 2), sides=False)
            if side > 0: mc.place(p, (0, 0, 0), (0, 0, 0)); p.data.transform(Matrix.Rotation(math.pi, 4, 'Z') @ Matrix.Translation((-2 * px, 0, 0)))
            mesh.bisect(p, (0, 0, 1.12), (0, 0, 1))                             # a loop: the stain grades down from the band
            parts.append(p)
            y = -0.0615 * (-side) if side > 0 else -0.0615
            x0, x1 = px - 0.52, px + 0.52
            c = [(x0, y, 1.15), (x1, y, 1.15), (x1, y, 1.25), (x0, y, 1.25)]
            parts.append(mc.quad("band", c if side < 0 else c[::-1], "livery"))
    # ---- street face: the latch block (the knot's collar seats on it), a bolt throw toward the jamb
    parts.append(mc.pillow("latch_plate", 0.30, 0.30, 0.014, 0.008, "steel", centre=(2.25, 0.06, 1.3), rot=(0, 0, math.pi)))      # thin: the knot's collar seats on it (its back is the door face)
    parts.append(mc.slab("bolt", (0.22, 0.03, 0.07), (2.49, 0.075, 1.3), "steel_dark", drop=("y-", "x-")))
    # ---- hand-forged strap hinges (rust), spear-ended, and their pintles on the hinge axis
    for j, z in enumerate((0.55, 2.25)):
        s = mc.prism(f"strap{j}", [(-0.02, -0.055), (0.80, -0.03), (0.92, 0.0), (0.80, 0.03), (-0.02, 0.055)], 0.012, "rust", centre=(0, 0, 0), rot=(0, rng.uniform(-0.02, 0.02), math.pi))
        mc.place(s, (0.0 + 0.0, 0.06, z + rng.uniform(-0.01, 0.01)))
        s.data.transform(Matrix.Scale(-1, 4, (1, 0, 0))); s.data.flip_normals()
        parts.append(s)
        parts.append(mc.lathe(f"pintle{j}", [(0.034, -0.09), (0.034, 0.09), (0.0, 0.10)], 5, "rust", centre=(-0.012, 0.062, z)))
    # ---- yard face: the cast plate (no decals: one material), a pull bar the town bolted on
    parts.append(mc.pillow("plate", 0.32, 0.18, 0.006, 0.004, "steel", centre=(0.74, -0.06, 1.62), sides=False))
    parts.append(mc.tube("pull", [(2.30, -0.06, 1.10), (2.30, -0.12, 1.14), (2.30, -0.12, 1.42), (2.30, -0.06, 1.46)], 0.02, 4, "board", caps=(False, False), up=(1, 0, 0)))
    # the town's repair: a grey board nailed across the lower hinge corner of the street face, and a tin patch
    parts.append(mc.slab("patch_board", (1.05, 0.03, 0.17), (0.56, 0.077, 0.30), "board_bleached", drop=("y-",), rot=(0.01, math.radians(-17), 0.012)))
    parts.append(mc.slab("patch_tin", (0.42, 0.012, 0.34), (1.92, -0.067, 0.42), "tin", drop=("y+",), rot=(0, math.radians(4), 0)))
    door = mesh.join(parts, ASSET + "_mesh")
    mc.ao_compose(door, distance=0.4, jitter=0.0, seed=args.seed, gradient=(0.80, 1.06))
    vcol.streak_under(door, [(0.45, 0.062, 0.52), (0.7, 0.062, 0.53), (0.45, 0.062, 2.22), (0.7, 0.062, 2.23), (2.25, 0.062, 1.15)], width=0.08, length=0.45, factor=0.78)
    mc.shade(door, lambda p, n: np.where((np.abs(p[:, 1]) > 0.055) & (np.abs(p[:, 1]) < 0.063), 1.0 - 0.2 * np.clip((1.12 - p[:, 2]) / 1.0, 0, 1), 1.0))
    vcol.darken_contact(door, height=0.3, factor=0.8)
    leaf = export.marker("leaf", (0, 0, 0))
    door.parent = leaf
    export.marker("socket_knot", (2.25, 0.14, 1.3))
    # ---- clip: heavy. The latch lets go (a start), it gathers way, swings in 95 degrees, hits the jamb and bounces
    act = anim.new_action(leaf, "open"); n = anim.frames(ASSET, "open")
    for f, deg in ((0, 0), (2, 0.8), (6, -9), (11, -44), (15, -86), (17, -97), (19, -89.5), (21, -95.5), (23, -94.2), (n, -95)):
        anim.key_object(leaf, f, rot=(0, 0, math.radians(deg)))
    anim.push_to_nla(leaf, [act])

if __name__ == "__main__":
    mc.std_main(ASSET, build)
