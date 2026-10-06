"""ia_bore_door: the door of the Asking. A ceramic disc 3 m across and 0.25 m thick that rolls aside on a steel track,
framed by four steel spandrels with hazard diagonals. On its antechamber face (asset +Z, Blender -Y): eight ports on a
1.0 m ring, each a dark socket 0.3 across in a brass bezel with a lamp at its rim, numbered 1-8 in 0.22 m geometry
numerals clockwise from the top (the numeral sits inside the ring, between its socket and the hub); and an outer ring
of twelve listening lamps in brass bezels at 1.42 m, filling clockwise from the top.

Pivot: disc centre. `door_disc` is a vertical bone at the centre (its frame = game axes). The lamp sets `port_lamps`
(8) and `listen_lamps` (12, origin (0, 0, 0.145)) and the `port_1..8` empties ride the bone. `open` (2.5 s): the seal
breaks, the disc rolls 3.1 m to the left (-X) turning 200 degrees, stops hard and rocks back."""

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

ASSET = "ia_bore_door"

R, T = 1.5, 0.25
SEG = 24
FRONT = -T / 2
R90 = (math.radians(90), 0, 0)


def ring_pos(i, n, r):
    """Blender (x, z) of item i of n on a ring, clockwise from the top as seen from the front (-Y)."""
    a = mc.TAU * i / n
    return math.sin(a) * r, math.cos(a) * r


def build(args):
    disc, static, over, over_static = [], [], [], []
    # ---- the disc: a chamfered ceramic slab, a stained rim, a steel hub; panel seams as three concentric steps
    prof = [(0.0, -T / 2), (R - 0.02, -T / 2), (R, -T / 2 + 0.02), (R, T / 2 - 0.02), (R - 0.02, T / 2), (0.0, T / 2)]
    body = mc.lathe("disc", prof, SEG, "enamel", rot=R90, smooth=30)
    mc.recolour(body, "enamel_stain", lambda p: abs(p.normal.y) < 0.5)
    disc.append(body)
    disc.append(mc.lathe("hub", [(0.30, T / 2), (0.27, T / 2 + 0.03), (0.20, T / 2 + 0.03), (0.17, T / 2 + 0.07), (0.0, T / 2 + 0.07)], 10, "steel", rot=R90))
    # the back (chamber side): four radial ribs and a boss
    for k in range(4):
        rib = mc.slab("rib", (0.16, 0.05, 1.05), (0, T / 2 + 0.024, 0.85), "steel", drop=("y-", "z-"))
        rib.data.transform(Matrix.Rotation(math.radians(45 + 90 * k), 4, 'Y')); disc.append(rib)
    disc.append(mc.lathe("boss", [(0.0, -T / 2 - 0.05), (0.26, -T / 2 - 0.05), (0.32, -T / 2)], 8, "steel", rot=R90))
    # ---- eight ports: brass bezel proud of the face, the dark socket inside it; numerals inside the ring
    port_lamps, ports = [], []
    for i in range(8):
        x, z = ring_pos(i, 8, 1.0)
        bez = mc.lathe("bezel", [(0.182, T / 2 - 0.004), (0.182, T / 2 + 0.03), (0.15, T / 2 + 0.036)], 8, "brass", rot=R90, phase=mc.TAU / 16)
        sock = mc.lathe("socket", [(0.15, T / 2 + 0.036), (0.115, T / 2 + 0.014), (0.0, T / 2 + 0.012)], 8, "lens", rot=R90, phase=mc.TAU / 16)
        for o in (bez, sock): mc.place(o, (x, 0, z)); disc.append(o)
        ports.append((x, -0.145, z))
        lx, lz = ring_pos(i, 8, 1.0 + 0.232)                                     # the port's lamp: at its rim, outboard
        port_lamps.append(mc.lamp_disc((lx, FRONT - 0.002, lz), 0.034, 6))
        nx, nz = ring_pos(i, 8, 0.64)
        num = brand.numeral_mesh(str(i + 1), 0.22, depth=0.0, colour="steel_dark")
        mc.place(num, (nx, FRONT - 0.0135, nz - 0.11))
        over.append(num)
    # ---- twelve listening lamps at 1.42 m
    listen = []
    for i in range(12):
        x, z = ring_pos(i, 12, 1.42)
        disc.append(mc.lathe("l_bezel", [(0.062, T / 2 - 0.004), (0.043, T / 2 + 0.016)], 6, "brass", centre=(x, 0, z), rot=R90))
        listen.append(mc.lamp_disc((x, FRONT - 0.0165, z), 0.042, 6))
    # ---- static: the track under and over, four spandrels with hazard diagonals
    static.append(mc.slab("track", (6.3, 0.34, 0.10), (-1.6, 0.0, -R - 0.05), "steel", drop=("z-",)))
    static.append(mc.slab("guide", (6.3, 0.34, 0.12), (-1.6, 0.0, R + 0.06), "steel", drop=("z+",)))
    static.append(mc.slab("stop", (0.14, 0.36, 0.30), (-4.68, 0.0, -R + 0.15), "steel_dark", drop=("z-",)))
    for sx in (-1, 1):
        for sz in (-1, 1):
            Rs = R + 0.03
            arc = [(sx * math.cos(math.radians(a)) * Rs, sz * math.sin(math.radians(a)) * Rs) for a in (62, 45, 28)]
            e = math.sqrt(Rs * Rs - 1.5 * 1.5)
            outline = [(sx * 1.5, sz * e), (sx * 1.5, sz * 1.5), (sx * e, sz * 1.5)] + arc
            if sx * sz < 0: outline = outline[::-1]
            sp = mc.prism("spandrel", outline, 0.10, "steel", centre=(0, 0.05 - 0.13, 0), front=True, back=False, sides=True)
            static.append(sp)
            hz = [(sx * 1.47, FRONT - 0.0565, sz * 1.02), (sx * 1.47, FRONT - 0.0565, sz * 1.32), (sx * 1.32, FRONT - 0.0565, sz * 1.47), (sx * 1.02, FRONT - 0.0565, sz * 1.47)]
            over_static.append(mc.quad("hazard", hz if sx * sz > 0 else hz[::-1], "hazard"))
    arm = rig.make_armature(ASSET + "_rig", [("root", (0, 0, 0), (0, 0, 0.1), None), ("door_disc", (0, 0, 0), (0, 0, 0.12), "root")])
    ob = rig.join_as_rigid_skin({"root": static, "door_disc": disc}, arm, ASSET + "_mesh")
    mc.ao_compose(ob, distance=0.35, jitter=0.0, seed=args.seed, gradient=(0.84, 1.04), hidden=over + over_static, ao_strength=0.75)
    for o in over: o.vertex_groups.new(name="door_disc").add(range(len(o.data.vertices)), 1.0, 'REPLACE')
    for o in over_static: o.vertex_groups.new(name="root").add(range(len(o.data.vertices)), 1.0, 'REPLACE')
    ob = mc.overlay_join(ob, over + over_static)
    # the stain: streaks under every bezel, a grey foot where the track's dust rides up
    vcol.streak_under(ob, [(p[0], FRONT, p[2] - 0.15) for p in ports], width=0.16, length=0.4, factor=0.86)
    mc.lift(ob, lambda p, n: (p[:, 2] < -R - 0.0) | (p[:, 2] > R + 0.0), 0.8)        # the track and guide: long faces buried under the frame
    mc.grime_below(ob, -R, -R + 0.7, 0.86)
    pl = zone.lamp_set("port_lamps", port_lamps, colour="aqua", flicker_group=1.0, origin=(0, -0.145, 0))
    ll = zone.lamp_set("listen_lamps", listen, colour="aqua", flicker_group=1.0, origin=(0, -0.145, 0))
    for o in (pl, ll): rig.parent_to_bone(o, arm, "door_disc")
    for i, p in enumerate(ports):
        e = export.marker(f"port_{i + 1}", p); rig.parent_to_bone(e, arm, "door_disc")
    # ---- clip (75 frames): vertical bone: loc x = game x; a roll to the left is a POSITIVE turn about game +Z
    act = anim.new_action(arm, "open"); n = anim.frames(ASSET, "open")
    D, A = -3.1, 200.0
    keys = [(0, 0.0), (4, -0.004), (7, 0.006), (10, 0.0), (16, 0.012), (28, 0.11), (44, 0.46), (58, 0.86), (65, 1.012), (68, 0.992), (71, 1.003), (n, 1.0)]
    for f, t in keys:
        anim.key_pose(arm, f, {"door_disc": {"loc": (D * t, 0.0, 0.0), "rot": (0.0, 0.0, math.radians(A * t))}})
    # in-betweens so no step of the 200 degree turn is ambiguous
    mc.finish_actions(arm, [act])

if __name__ == "__main__":
    mc.std_main(ASSET, build)
