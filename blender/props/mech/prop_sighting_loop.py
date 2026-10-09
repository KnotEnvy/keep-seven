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
SEG = 14          # pass i3: 16 -> 14, the sixteen triangles went to the cradle and the pedestal (the budget is 220)


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
    # Look team creatures-props, pass i3 (the reviewer: "a plain black ring on a thin black pole ... reads as a primitive").
    # It was a ring, a stick and a clamp. It is an instrument stand now: a ceramic pedestal with a hazard collar where
    # the steel post is let into it, and a forked CRADLE whose two arms take the ring by its lower flanks (the ring is
    # carried, not skewered). The ring, its ticks and its hairline are where they were: the sight line is the layout's.
    ZP = 0.52                                                                    # the top of the pedestal
    ZH = ZC - RO - 0.105                                                         # the hub the cradle springs from
    parts.append(mc.slab("pedestal", (0.17, 0.15, ZP), (0, 0.0, ZP / 2), "enamel_stain", drop=("z-",), taper=(0.70, 0.70)))
    parts.append(mc.slab("collar", (0.135, 0.120, 0.05), (0, 0.0, ZP + 0.012), "hazard", drop=("z-", "z+")))
    # (the post's only vertices are let into the collar and the hub: left in the bake its four faces come out black from
    # end to end, so it is joined after the bake, like an overlay)
    post = mc.slab("post", (0.062, 0.062, ZH - ZP), (0, 0.0, (ZH + ZP) / 2), "steel", drop=("z-", "z+"), taper=(0.8, 0.8))
    for sg in (-1, 1):
        x0, z0 = sg * 0.012, ZH - 0.02
        a = math.radians(-48.0)
        x1, z1 = sg * (RO - 0.02) * math.cos(a), ZC + (RO - 0.02) * math.sin(a)
        ln = math.hypot(x1 - x0, z1 - z0)
        parts.append(mc.slab(f"arm{sg}", (0.050, 0.070, ln), ((x0 + x1) / 2, 0.0, (z0 + z1) / 2), "steel_dark", drop=("z-", "z+"),
                             rot=(0, math.atan2(x1 - x0, z1 - z0), 0), taper=(0.72, 0.9)))
    parts.append(mc.pillow("foot", 0.34, 0.30, 0.03, 0.012, "steel", centre=(0, 0, 0), rot=(math.radians(-90), 0, 0), sides=False))
    ob = mesh.join(parts, ASSET + "_mesh")
    mc.ao_compose(ob, distance=0.25, jitter=0.0, seed=args.seed, gradient=(0.84, 1.04), ao_strength=0.7, hidden=[post])
    vcol.darken_contact(ob, height=0.12, factor=0.75)
    ob = mc.overlay_join(ob, [post], gradient=(0.80, 0.98))
    lamp = []
    # pass i4 (the visual reviewer wants a rim "that survives at distance"): the line is 22 mm on the face the step sees and
    # 24 mm on the far face (they were 13 mm: under a pixel from 30 m down the gallery)
    r0, r1 = RI + 0.004, RI + 0.026
    for k in range(SEG):
        a0 = mc.TAU * k / SEG + mc.TAU / (2 * SEG); a1 = a0 + mc.TAU / SEG
        y = T + 0.0015                                                          # the hairline annulus on the face the step sees
        q = [(math.cos(a0) * r0, y, ZC + math.sin(a0) * r0), (math.cos(a1) * r0, y, ZC + math.sin(a1) * r0),
             (math.cos(a1) * r1, y, ZC + math.sin(a1) * r1), (math.cos(a0) * r1, y, ZC + math.sin(a0) * r1)]
        lamp.append(q[::-1])
    for k in range(SEG):                                                        # the far face: the same line, on the ring's own chords
        a0 = mc.TAU * k / SEG + mc.TAU / (2 * SEG); a1 = a0 + mc.TAU / SEG; y = -T - 0.0015; s0, s1 = RI + 0.010, RI + 0.034
        lamp.append([(math.cos(a0) * s0, y, ZC + math.sin(a0) * s0), (math.cos(a1) * s0, y, ZC + math.sin(a1) * s0),
                     (math.cos(a1) * s1, y, ZC + math.sin(a1) * s1), (math.cos(a0) * s1, y, ZC + math.sin(a0) * s1)])
    zone.lamp_set("loop_rim", [lamp], colour="aqua", flicker_group=1.0, origin=(0, 0, ZC))

if __name__ == "__main__":
    mc.std_main(ASSET, build)
