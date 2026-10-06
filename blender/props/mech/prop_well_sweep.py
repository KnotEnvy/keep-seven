"""prop_well_sweep: the pylon's fallen arm made a well-sweep. The ceramic arm (5.5 m: an eight-sided cast spar with
a jointing collar, its root end broken off ragged with three cable stubs hanging out, its three-skirt insulator
stack still on the tip) lies in the fork of a timber post 3 m tall (a leaning trunk split into two real prongs, cord
wraps under the crotch, a chock stone and a drift of sand at its foot) and is lashed there with cable; five stones in
a cable net hang from the short end; a cord runs from the tip toward the gate bar. The lip's seam object.

AUTHORED IN WORLD COORDINATES (binding space: world): the fork is at game (3.6, 3.0, 3.6) beside the gate, the arm's
tip at the layout's prop_pylon.params.sweepTo (1, 4.2, 0); the trunk leans 3 degrees, its foot 0.14 m off the plumb.
`sweep_arm` is a vertical bone at the fork (identity frame = game axes); code raises the arm by turning it about the
horizontal game axis perpendicular to the arm, extra `hingeAxis` on the bone: +4 degrees per jug raises the tip."""

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

ASSET = "prop_well_sweep"

POST = (3.6, 0.0, 3.6)                       # game


def g2b(p): return layout.to_blender(p)


def build(args):
    rng = scene.rng(args.seed)
    tip = layout.marker("prop_pylon")["params"]["sweepTo"]
    fork = (POST[0], 3.0, POST[2])
    d = Vector((tip[0] - fork[0], tip[1] - fork[1], tip[2] - fork[2]))
    L_long = d.length; u = d.normalized()
    short = Vector(fork) - u * (5.5 - L_long)
    post, arm_parts = [], []
    A = Vector(g2b(short)); B = Vector(g2b(tip)); F = Vector(g2b(fork))
    ax = (B - A).normalized()
    up = Vector((0, 0, 1))
    side = ax.cross(up).normalized()                                             # across the arm, level
    along = up.cross(side).normalized()                                          # along the arm, level
    # ---- the forked post: a leaning, tapering trunk (a ring half way up holds its vertex AO), two prongs that part
    # under the arm and stand up either side of it, cord wraps under the crotch, a chock stone, a drift of sand
    foot = Vector((F.x, F.y, 0.0)) - along * 0.11 + side * 0.08
    crotch = F - up * 0.50
    tq = (crotch - foot).to_track_quat('Z', 'Y').to_euler()
    H = (crotch - foot).length
    trunk = mc.lathe("trunk", [(0.165, -0.06), (0.150, H * 0.45), (0.125, H + 0.05)], 7, "board", phase=0.3, smooth=50)
    for v in trunk.data.vertices: v.co += Vector((rng.uniform(-0.012, 0.012), rng.uniform(-0.012, 0.012), 0))
    trunk.rotation_euler = tq; trunk.location = foot; mesh.apply_transform(trunk); post.append(trunk)
    for s_ in (-1, 1):
        p0 = crotch - up * 0.12 + side * (s_ * 0.045)
        p1 = F - up * 0.20 + side * (s_ * 0.285) + along * (0.02 * s_)
        p2 = F + up * (0.30 if s_ > 0 else 0.22) + side * (s_ * 0.315) - along * (0.03 * s_)
        post.append(mc.tube("prong", [p0, p1, p2], 0.08, 5, "board_bleached", radii=[0.095, 0.08, 0.055], caps=(False, True), up=tuple(along)))
    for k, (zz, r) in enumerate(((0.66, 0.158), (0.57, 0.150))):
        wr = mc.lathe("wrap", [(r + 0.012, -0.04), (r + 0.006, 0.04)], 6, "cord", phase=0.5 + k)
        wr.rotation_euler = tq; wr.location = F - up * zz + (foot - crotch).normalized() * 0.0; mesh.apply_transform(wr); post.append(wr)
    chock = mc.lathe("chock", [(0.0, -0.05), (0.17, 0.0), (0.13, 0.12), (0.0, 0.17)], 5, "rock", phase=0.9, squash=0.75)
    for v in chock.data.vertices: v.co += Vector((rng.uniform(-0.02, 0.02), rng.uniform(-0.02, 0.02), rng.uniform(-0.015, 0.015)))
    chock.location = foot + along * 0.22 - side * 0.10; mesh.apply_transform(chock); post.append(chock)
    drift = mc.lathe("drift", [(0.62, -0.01), (0.20, 0.10)], 6, "sand", phase=0.2, squash=0.7)
    drift.location = foot - along * 0.16 + side * 0.05; mesh.apply_transform(drift); post.append(drift)
    # ---- the arm: an eight-sided ceramic spar, taller than wide, a jointing collar, tapering to the tip
    rot = ax.to_track_quat('Z', 'Y').to_euler()
    length = (B - A).length
    prof = [(0.150, 0.0), (0.215, 0.05), (0.215, 1.30), (0.240, 1.33), (0.240, 1.43), (0.208, 1.46),
            (0.150, length - 0.36), (0.085, length - 0.30)]
    spar = mc.lathe("spar", prof, 8, "enamel", phase=math.pi / 8, smooth=30, squash=0.72, cap_start=True)
    for v in spar.data.vertices:                                                  # the root end broke off the pylon: ragged
        if v.co.z < 0.06: v.co.z += rng.uniform(-0.05, 0.11)
    mc.recolour(spar, "steel_dark", lambda p: p.center.z < 0.08 and abs(p.normal.z) > 0.5)      # the broken face: the dark core
    spar.rotation_euler = rot; spar.location = A; mesh.apply_transform(spar)
    mc.recolour(spar, "enamel_stain", lambda p: p.normal.z < -0.3)
    arm_parts.append(spar)
    for k, (dx, dz, ln, sag) in enumerate(((0.05, 0.04, 0.34, 0.20), (-0.06, -0.02, 0.22, 0.10), (0.0, -0.07, 0.42, 0.34))):
        a0 = A + side * dx + up * dz + ax * 0.06
        arm_parts.append(mc.tube("stub", [a0, a0 - ax * (ln * 0.6) - up * (sag * 0.3), a0 - ax * ln - up * sag], 0.022, 3, "cable", caps=(False, True)))
    ins = mc.lathe("insulator", [(0.085, -0.34), (0.165, -0.30), (0.075, -0.235), (0.165, -0.185), (0.075, -0.12), (0.150, -0.07), (0.060, -0.01), (0.0, 0.02)], 7, "chalk", smooth=30)
    ins.rotation_euler = rot; ins.location = B; mesh.apply_transform(ins); arm_parts.append(ins)
    for t in (-0.13, 0.13):                                                       # cable lashing over arm and prongs
        C = F + ax * t
        ring_pts = [C + side * (math.cos(a) * 0.40) + ax.cross(side) * (math.sin(a) * 0.30) + ax * (0.05 * math.cos(a) * (1 if t > 0 else -1)) for a in [mc.TAU * k / 5 + 0.3 for k in range(5)]]
        arm_parts.append(mc.tube("lash", ring_pts, 0.03, 3, "cable", closed=True))
    # ---- the counterweight: five stones in a cable net slung under the short end
    hang = A + ax * 0.42
    cen = hang - up * 0.62
    stones = [((0.0, 0.0, -0.13), 0.20, "rock_dark"), ((0.19, 0.06, 0.03), 0.165, "rock"), ((-0.17, 0.09, 0.05), 0.15, "rock_dark"),
              ((0.03, -0.19, 0.06), 0.16, "rock"), ((-0.02, 0.05, 0.20), 0.13, "rock_cap")]
    for k, (o, r, col) in enumerate(stones):
        st = mc.lathe("stone", [(0.0, -r * 0.8), (r * 0.9, -r * 0.3), (r, r * 0.25), (0.0, r * 0.75)], 5, col, phase=k * 1.3, squash=0.85, smooth=40)
        for v in st.data.vertices: v.co += Vector((rng.uniform(-0.025, 0.025), rng.uniform(-0.025, 0.025), rng.uniform(-0.02, 0.02)))
        st.location = cen + side * o[0] + along * o[1] + up * o[2]; mesh.apply_transform(st); arm_parts.append(st)
    for k in range(4):
        a = mc.TAU * k / 4 + 0.5
        out = side * math.cos(a) + along * math.sin(a)
        top = hang + out * 0.10 - up * 0.10
        arm_parts.append(mc.tube("net", [top, cen + out * 0.29 + up * 0.03, cen + out * 0.08 - up * 0.33], 0.022, 3, "cord", caps=(False, False)))
    arm_parts.append(mc.tube("gate_cord", [B - ax * 0.42, B - ax * 0.42 + Vector((0.3, -0.05, -1.2))], 0.028, 3, "cord", caps=(False, True)))
    fb = g2b(fork)
    arm = rig.make_armature(ASSET + "_rig", [("root", (0, 0, 0), (0, 0, 0.1), None), ("sweep_arm", fb, (fb[0], fb[1], fb[2] + 0.1), "root")])
    hinge = Vector((-(tip[2] - fork[2]), 0.0, tip[0] - fork[0])).normalized()
    if (hinge.z * d.x - hinge.x * d.z) < 0: hinge = -hinge                       # so that a positive turn raises the tip
    arm.data.bones["sweep_arm"]["hingeAxis"] = [round(hinge.x, 4), 0.0, round(hinge.z, 4)]
    ob = rig.join_as_rigid_skin({"root": post, "sweep_arm": arm_parts}, arm, ASSET + "_mesh")
    mc.ao_compose(ob, distance=0.5, jitter=0.0, seed=args.seed, gradient=(0.78, 1.07))      # no per-face jitter: every part here is ONE log, stone or casting (and smooth parts keep shared vertices: 6 kB)
    vcol.darken_contact(ob, height=0.4, factor=0.65)
    ob["thin_ok"] = 25.0
    print("SWEEP hingeAxis", list(hinge), "long", L_long)

if __name__ == "__main__":
    mc.std_main(ASSET, build)
