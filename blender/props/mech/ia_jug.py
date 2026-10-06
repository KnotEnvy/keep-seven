"""ia_jug: a hand-thrown clay jug in a cord cradle, hanging on 0.6 m of cord (seven instances; variants intact / broken).

Pivot: the cord top. The body (0.32 across x 0.42) hangs from 0.60 to 1.02 m below it: body centre 0.81 m below the
pivot = the manifest's hitPoint. `jug_broken`: the neck, the lugs and a ragged collar of shoulder still in the cradle."""

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

ASSET = "ia_jug"

BOT = -1.02          # Blender z of the jug's foot


def wobble(ob, rng, amt=0.006):
    """Hand-thrown: every ring is a little off-centre and a little oval."""
    zs = sorted({round(v.co.z, 4) for v in ob.data.vertices})
    off = {z: (rng.uniform(-amt, amt), rng.uniform(-amt, amt), 1.0 + rng.uniform(-0.03, 0.03)) for z in zs}
    for v in ob.data.vertices:
        ox, oy, s = off[round(v.co.z, 4)]
        v.co.x = v.co.x * s + ox; v.co.y = v.co.y / s + oy


def lug(side, rng, short=False):
    x = side * 0.047
    pts = [(side * 0.04, 0, BOT + 0.385), (side * 0.118, 0, BOT + 0.392), (side * 0.15, 0, BOT + 0.335), (side * 0.124, 0, BOT + 0.268)]
    return mc.tube("lug", pts,
                   0.016, 3, "clay", caps=(False, False), up=(0, 1, 0), flat=(0.02, 0.014))


def cradle(parts, ring_pts):
    """The cord: one fat strand from the hook, a knot, two strands to the lugs, a turn round the neck."""
    parts.append(mc.tube("cord", [(0, 0, 0.0), (0, 0, -0.545)], 0.016, 3, "cord", caps=(True, False)))
    for s in (-1, 1):
        parts.append(mc.tube("strand", [(s * 0.008, 0, -0.535), (s * 0.142, 0, BOT + 0.35)], 0.012, 3, "cord", caps=(False, False), up=(0, 1, 0)))
    r = 0.058
    parts.append(mc.tube("neck_turn", [(math.cos(mc.TAU * k / ring_pts + 0.4) * r, math.sin(mc.TAU * k / ring_pts + 0.4) * r, BOT + 0.352 + 0.006 * math.sin(k * 2.1))
                                       for k in range(ring_pts)], 0.012, 3, "cord", closed=True))


def paint_jug(ob, seed, bottom):
    mc.ao_compose(ob, distance=0.3, jitter=0.05, seed=seed, gradient=(0.9, 1.05), z_range=(BOT, BOT + 0.42), ao_strength=0.7)
    # kiln-dark foot, a paler dry band on the shoulder where hands and cord rub, soot inside the mouth
    def f(p, n):
        h = (p[:, 2] - BOT) / 0.42
        k = 1.0 - 0.22 * np.clip(1.0 - h / 0.3, 0, 1) - 0.12 * np.clip((h - 0.8) / 0.2, 0, 1) * (p[:, 2] < BOT + 0.43)
        return np.where(p[:, 2] > BOT + 0.44, 1.0, k)
    mc.shade(ob, f)


def build(args):
    rng = scene.rng(args.seed)
    # ---- intact
    prof = [(0.0, 0.0), (0.072, 0.0), (0.132, 0.048), (0.16, 0.135), (0.154, 0.215), (0.112, 0.288), (0.052, 0.326), (0.042, 0.388), (0.062, 0.42), (0.04, 0.412)]
    body = mc.lathe("body", prof, 8, "clay", centre=(0, 0, BOT), phase=0.2, cap_end=True)
    wobble(body, rng)
    mc.recolour(body, "board_dark", lambda p: p.normal.z > 0.5 and p.center.z > BOT + 0.39)          # the dark of the mouth
    a = [body, lug(-1, rng), lug(1, rng)]
    cradle(a, 4)
    intact = mesh.join(a, "jug_intact")
    # ---- broken: what the cradle still holds. The break is a ragged ring through the shoulder
    rng2 = scene.rng(args.seed + 11)
    prof_b = [(0.14, 0.245), (0.112, 0.288), (0.052, 0.326), (0.042, 0.388), (0.062, 0.42), (0.04, 0.412)]
    neck = mc.lathe("neck", prof_b, 8, "clay", centre=(0, 0, BOT), phase=0.2, cap_end=True)
    zmin = min(v.co.z for v in neck.data.vertices)
    for v in neck.data.vertices:                                                # the ragged edge: teeth up and down
        if abs(v.co.z - zmin) < 1e-4:
            t = rng2.uniform(-0.3, 1.0)
            v.co.z += 0.045 * t; k = 1.0 - 0.22 * max(t, 0.0)
            v.co.x *= k; v.co.y *= k
    mc.recolour(neck, "board_dark", lambda p: p.normal.z > 0.5 and p.center.z > BOT + 0.39)
    b = [neck, lug(-1, rng2, True), lug(1, rng2, True)]
    cradle(b, 4)
    broken = mesh.join(b, "jug_broken")
    broken.hide_render = True
    paint_jug(intact, args.seed, BOT)
    broken.hide_render = False; intact.hide_render = True
    paint_jug(broken, args.seed + 3, BOT)
    intact.hide_render = False
    # cords are 24-32 mm fat over 0.6 m: seen from the gate at up to 15 m
    intact["thin_ok"] = 12.0; broken["thin_ok"] = 12.0

if __name__ == "__main__":
    mc.std_main(ASSET, build)
