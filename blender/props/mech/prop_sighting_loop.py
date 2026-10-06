"""prop_sighting_loop: the sighting loop of the proving bay. A ceramic ring, 0.5 m inner diameter, 0.06 m section,
graduated ticks on its face, clamped on a steel post; the ring's centre is 2.018 m above the pivot (the post base).

The ring lies in the XZ plane: she looks through it along the asset's Z. `loop_rim` (lamp set 1, origin at the ring
centre, off until she is on the step) is a hairline annulus on both faces, inside the ticks (the ticks are on the face turned to the brass mark)."""

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

ASSET = "prop_sighting_loop"

ZC = 2.018
RI, RO, T = 0.25, 0.31, 0.03
SEG = 16


def build(args):
    R90 = (math.radians(90), 0, 0)
    parts = []
    ring = mc.lathe("ring", [(RI, -T), (RO, -T), (RO, T), (RI, T), (RI, -T)], SEG, "enamel", rot=R90, smooth=30, phase=mc.TAU / (2 * SEG))
    mc.place(ring, (0, 0, ZC))
    parts.append(ring)
    # graduated ticks on the face she looks at from the step (the layout turns the asset's BACK, +Y, to the brass mark):
    # eight, the four cardinal ones long
    YB = T + 0.0012
    for k in range(8):
        a = mc.TAU * k / 8
        long = (k % 2 == 0)
        r0 = RO - (0.036 if long else 0.022); r1 = RO - 0.004; w = 0.009 if long else 0.006
        c, s = math.cos(a), math.sin(a)
        pts = [(c * r0 - s * w, YB, ZC + s * r0 + c * w), (c * r0 + s * w, YB, ZC + s * r0 - c * w),
               (c * r1 + s * w, YB, ZC + s * r1 - c * w), (c * r1 - s * w, YB, ZC + s * r1 + c * w)]
        parts.append(mc.quad("tick", pts, "steel_dark"))
    # the post: tapered, a clamp under the ring, a foot plate bolted to the floor
    parts.append(mc.slab("post", (0.09, 0.09, ZC - RO - 0.02), (0, 0.0, (ZC - RO - 0.02) / 2), "steel", drop=("z-", "z+"), taper=(0.62, 0.62)))
    parts.append(mc.slab("clamp", (0.16, 0.085, 0.07), (0, 0.0, ZC - RO + 0.005), "steel_dark", drop=("z-",), taper=(0.8, 1.0)))
    parts.append(mc.pillow("foot", 0.30, 0.30, 0.03, 0.012, "steel", centre=(0, 0, 0), rot=(math.radians(-90), 0, 0), sides=False))
    ob = mesh.join(parts, ASSET + "_mesh")
    mc.ao_compose(ob, distance=0.25, jitter=0.0, seed=args.seed, gradient=(0.84, 1.04), ao_strength=0.7)
    vcol.darken_contact(ob, height=0.12, factor=0.75)
    lamp = []
    r0, r1 = RI + 0.004, RI + 0.017
    for k in range(SEG):
        a0 = mc.TAU * k / SEG + mc.TAU / (2 * SEG); a1 = a0 + mc.TAU / SEG
        y = T + 0.0015                                                          # the hairline annulus on the face the step sees
        q = [(math.cos(a0) * r0, y, ZC + math.sin(a0) * r0), (math.cos(a1) * r0, y, ZC + math.sin(a1) * r0),
             (math.cos(a1) * r1, y, ZC + math.sin(a1) * r1), (math.cos(a0) * r1, y, ZC + math.sin(a0) * r1)]
        lamp.append(q[::-1])
    for k in range(8):                                                          # the far face: the same line in eight chords, kept on the ring's face
        a0 = mc.TAU * k / 8; a1 = a0 + mc.TAU / 8; y = -T - 0.0015; s0, s1 = RI + 0.030, RI + 0.044
        lamp.append([(math.cos(a0) * s0, y, ZC + math.sin(a0) * s0), (math.cos(a1) * s0, y, ZC + math.sin(a1) * s0),
                     (math.cos(a1) * s1, y, ZC + math.sin(a1) * s1), (math.cos(a0) * s1, y, ZC + math.sin(a0) * s1)])
    zone.lamp_set("loop_rim", [lamp], colour="aqua", flicker_group=1.0, origin=(0, 0, ZC))

if __name__ == "__main__":
    mc.std_main(ASSET, build)
