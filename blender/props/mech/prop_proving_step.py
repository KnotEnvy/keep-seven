"""prop_proving_step: the proving bay's raised step, 1.6 x 0.15 x 1.6: a steel-edged plate with a brass disc 0.5 m
across let into its centre (the brass mark she stands on), stencilled footprints, and the aqua rim that lights when
she stands right (`mark_glow`, lamp set 1, off until then).

Pivot: base centre. The asset's front (-Y Blender) is the way she faces down the gallery."""

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

ASSET = "prop_proving_step"


def build(args):
    S, H = 1.6, 0.15
    UP = (math.radians(-90), 0, 0)                                               # a -Y facing part laid flat, face up
    parts = []; over = []
    parts.append(mc.slab("edge", (S, S, H), (0, 0, H / 2), "steel", drop=("z-",), bevel=0.02))
    parts.append(mc.pillow("deck", S - 0.16, S - 0.16, 0.008, 0.008, "concrete", centre=(0, 0, H), sides=False, rot=UP))
    # the brass disc: a dark seat ring, the disc slightly domed by a chamfer, worn bright in the middle
    seat = mc.lathe("seat", [(0.30, 0.009), (0.262, 0.010)], 12, "steel_dark", centre=(0, 0, H))
    disc = mc.lathe("disc", [(0.25, 0.010), (0.232, 0.018), (0.0, 0.018)], 12, "brass", centre=(0, 0, H))
    parts += [seat, disc]
    # a hazard diagonal across the two rear corners (ochre, broad), a cast tag on the front riser
    for sx in (-1, 1):
        c = [(sx * 0.72, 0.72, H + 0.0095), (sx * 0.72, 0.36, H + 0.0095), (sx * 0.36, 0.72, H + 0.0095)]
        over.append(mc.quad("hazard", c[::-1] if sx > 0 else c, "hazard"))
    parts.append(mc.pillow("tag", 0.32, 0.08, 0.006, 0.004, "steel_dark", centre=(0.5, -S / 2, 0.075), sides=False))
    ob = mesh.join(parts, ASSET + "_mesh")
    mc.ao_compose(ob, distance=0.25, jitter=0.0, seed=args.seed, gradient=(0.82, 1.04), hidden=over)
    ob = mc.overlay_join(ob, over)                                    # (kept bright: boots polish the brass)
    mc.shade(ob, lambda p, n: np.where((np.hypot(p[:, 0], p[:, 1]) > 0.2) & (np.hypot(p[:, 0], p[:, 1]) < 0.26) & (p[:, 2] > H + 0.009), 0.72, 1.0))
    # the rim: a ring of twelve lamp faces in the seat, one lamp
    ring = []
    for k in range(12):
        a0 = mc.TAU * k / 12; a1 = mc.TAU * (k + 1) / 12
        ring.append([(math.cos(a0) * 0.262, math.sin(a0) * 0.262, H + 0.011), (math.cos(a1) * 0.262, math.sin(a1) * 0.262, H + 0.011),
                     (math.cos(a1) * 0.288, math.sin(a1) * 0.288, H + 0.011), (math.cos(a0) * 0.288, math.sin(a0) * 0.288, H + 0.011)][::-1])
    zone.lamp_set("mark_glow", [ring], colour="aqua", flicker_group=1.0)
    d = mc.Decals()
    d.add((0, 0.0, H + 0.018), 0.36, 0.36, "picto_misc", 1, "steel_dark", "+z", roll=math.pi)      # toes toward the front (-Y)
    d.add((0.385, -S / 2 - 0.006, 0.075), 0.035, 0.052, "numerals", 4, "enamel", "-y", lift=0.001)
    d.add((0.47, -S / 2 - 0.006, 0.075), 0.035, 0.052, "numerals", 2, "enamel", "-y", lift=0.001)
    d.add((0.51, -S / 2 - 0.006, 0.075), 0.035, 0.052, "numerals", 0, "enamel", "-y", lift=0.001)
    d.add((0.55, -S / 2 - 0.006, 0.075), 0.035, 0.052, "numerals", 4, "enamel", "-y", lift=0.001)
    d.build("stencils")

if __name__ == "__main__":
    mc.std_main(ASSET, build)
