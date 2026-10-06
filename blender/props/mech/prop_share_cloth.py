"""prop_share_cloth: the town's banner. Well-linen 1.6 x 1.2 on a cane spreader, hung from a viga by ONE 0.25 m cord
(0.05 fat: the hit target), twelve family marks brushed in town paint in a grid, the hem frayed.

Pivot: the cord top (node `cord`); the cloth's centre is 0.855 m below it (node `cloth`). The asset's front (-Y) faces
the north shutter. Skinned: `cloth_root` keeps the cord stub on the viga; `cloth_1/2/3` carry the three bands of the
cloth, each hinged to the one above along its top edge (bones are vertical: their frames are game axes). The cloth is
a 4 x 3 grid of 0.4 m cells (one family mark fills each cell, on both faces, on the SAME vertices, so a mark can never
leave the cloth). The batten row follows `cloth_1` alone; every other grid vertex is BLENDED between the three bones by
its own share (`WEIGHTS`), which changes nothing while the bones agree (hanging) and crumples the sheet between the
three folded bands when they part: the clip drops the cloth 3.3 m to the hall floor and it settles in a heap."""

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

ASSET = "prop_share_cloth"

TOP, BAND, HALF = -0.255, 0.40, 0.80          # top edge of the cloth, height of one band, half width
FLOOR = -4.72                                 # the hall floor below the cord top (layout ia_cloth_cord: 4.72 m up)
COLS, ROWS, CELL = 4, 3, 0.40

# Shares of (cloth_1, cloth_2, cloth_3) for grid vertex [row][column]; row 0 = the batten hem, row 3 = the free hem.
# Uneven on purpose: no crease of the heap runs straight across the cloth, no cell stays flat.
WEIGHTS = [
    [(1, 0, 0)] * 5,
    [(0.70, 0.30, 0.00), (0.35, 0.50, 0.15), (0.60, 0.40, 0.00), (0.25, 0.45, 0.30), (0.55, 0.45, 0.00)],
    [(0.00, 0.45, 0.55), (0.25, 0.60, 0.15), (0.00, 0.30, 0.70), (0.30, 0.55, 0.15), (0.10, 0.40, 0.50)],
    [(0.00, 0.10, 0.90), (0.00, 0.35, 0.65), (0.15, 0.00, 0.85), (0.00, 0.30, 0.70), (0.00, 0.00, 1.00)]]


def wave(x, z):
    """The hang of the cloth: shallow vertical folds that deepen toward the free hem; a held-up left corner."""
    d = (TOP - z) / 1.2
    return 0.012 * math.sin(3.1 * x + 0.6) * (0.35 + d) + 0.02 * d * math.sin(1.3 * x - 0.4)


def grid(r, c, off=0.0):
    x = -HALF + CELL * c; z = TOP - BAND * r
    return (x, wave(x, z) + off, z + (0.05 if (r == ROWS and c == 0) else 0.0))      # a corner of the hem torn away


def cell(r, c, back, off=0.0):
    q = [grid(r + 1, c, off), grid(r + 1, c + 1, off), grid(r, c + 1, off), grid(r, c, off)]
    return [q[1], q[0], q[3], q[2]] if back else q


def split(ob):
    """Cut every quad along the SAME diagonal (lower left to upper right of its cell): a cloth cell, its back face and
    its two marks then fold along one crease, and no mark sinks through the cloth when the cell bends."""
    import bmesh
    bm = bmesh.new(); bm.from_mesh(ob.data)
    for f in [f for f in bm.faces if len(f.verts) == 4]:
        vs = sorted(f.verts, key=lambda v: v.co.x + v.co.z)
        bmesh.utils.face_split(f, vs[0], vs[-1])
    bm.to_mesh(ob.data); bm.free()


def blend(ob):
    """Give every vertex on or below the batten hem the shares of its grid vertex (cloth, marks and fringe alike)."""
    gs = [ob.vertex_groups.get(f"cloth_{i + 1}") or ob.vertex_groups.new(name=f"cloth_{i + 1}") for i in range(3)]
    for v in ob.data.vertices:
        if v.co.z > TOP + 1e-4: continue
        r = min(ROWS, max(0, int(round((TOP - v.co.z) / BAND)))); c = min(COLS, max(0, int(round((v.co.x + HALF) / CELL))))
        for g, w in zip(gs, WEIGHTS[r][c]):
            if w > 0: g.add([v.index], w, 'REPLACE')
            else: g.remove([v.index])


def build(args):
    rng = scene.rng(args.seed)
    parts = {"cloth_root": [], "cloth_1": [], "cloth_2": [], "cloth_3": []}
    for back in (False, True):
        parts["cloth_1"].append(mc.faces_obj("cloth_b" if back else "cloth_f", [cell(r, c, back) for r in range(ROWS) for c in range(COLS)], "linen", smooth=60))
        split(parts["cloth_1"][-1])
    # the cane spreader in the top hem and the cord: the upper stub stays on the viga, the lower half goes with the cloth
    parts["cloth_1"].append(mc.tube("cane", [(-HALF - 0.05, 0.0, TOP + 0.004), (0.0, 0.004, TOP + 0.012), (HALF + 0.04, 0.0, TOP - 0.002)], 0.016, 4, "cord", up=(0, 1, 0)))
    parts["cloth_1"].append(mc.tube("cord_low", [(0.0, 0.0, -0.13), (0.003, 0.0, TOP + 0.02)], 0.025, 4, "cord", caps=(True, False), up=(0, 1, 0)))
    # the turn round the viga, knotted: it centres the visible target on the hit sphere (the `cord` node, r 0.12)
    parts["cloth_root"].append(mc.lathe("viga_knot", [(0.0, -0.05), (0.066, 0.005), (0.0, 0.06)], 4, "cord", centre=(0.0, 0.0, 0.0), phase=0.4))
    parts["cloth_root"].append(mc.tube("cord_top", [(0.0, 0.0, 0.0), (0.002, 0.0, -0.13)], 0.025, 4, "cord", caps=(True, True), up=(0, 1, 0)))
    # twelve family marks, one to a cell, on both faces, on the cloth's own grid points (5 mm proud); the frayed hem
    dec = mc.Decals()
    for r in range(ROWS):
        for c in range(COLS):
            dec.items.append((cell(r, c, False, -0.005), "family_marks", r * COLS + c, "town_paint"))
            dec.items.append((cell(r, c, True, 0.005), "family_marks", r * COLS + c, "town_paint"))
    for c in range(1, COLS):                                                      # the torn corner carries no fringe
        top = [grid(ROWS, c), grid(ROWS, c + 1)]
        dec.items.append(([(top[0][0], top[0][1], top[0][2] - 0.13), (top[1][0], top[1][1], top[1][2] - 0.13), top[1], top[0]], "card_edges", (c % 2) + 1, "linen"))
    # vertical bones: local axes = game axes (x right, y up, z toward the asset's front)
    arm = rig.make_armature(ASSET + "_rig", [("cloth_root", (0, 0, 0), (0, 0, 0.1), None),
                                             ("cloth_1", (0, 0, TOP), (0, 0, TOP + 0.1), "cloth_root"),
                                             ("cloth_2", (0, 0, TOP - BAND), (0, 0, TOP - BAND + 0.1), "cloth_1"),
                                             ("cloth_3", (0, 0, TOP - 2 * BAND), (0, 0, TOP - 2 * BAND + 0.1), "cloth_2")])
    cloth = rig.join_as_rigid_skin(parts, arm, ASSET + "_mesh")
    marks = rig.join_as_rigid_skin({"cloth_1": [dec.build("marks")]}, arm, "cloth_marks")
    blend(cloth); blend(marks)
    split(marks)
    mc.ao_compose(cloth, distance=0.25, jitter=0.0, seed=args.seed, gradient=(0.86, 1.04), ao_strength=0.5)      # one woven sheet: no per-face jitter (it would draw every triangle)
    # the sheet's two faces lie on one another, so their vertex AO is noise (each face shadows the other): the cloth hangs
    # in the open and takes an open value instead; the fold shading below gives it its form
    a_ = vcol.get_colors(cloth, vcol.COLOR); zz = vcol.corner_positions(cloth)[:, 2]
    sheet = zz < TOP + 0.001
    a_[sheet, :3] = (0.90 + 0.10 * np.clip((zz[sheet] - (TOP - 1.2)) / 1.2, 0, 1))[:, None]
    vcol.set_colors(cloth, a_, vcol.COLOR)
    # the folds: shade by the wave's slope so the cloth reads as hanging, and a grey hem where hands took it down
    def folds(p, n):
        x = p[:, 0]; d = np.clip((TOP - p[:, 2]) / 1.2, 0, 1)
        k = 1.0 - 0.10 * (0.5 + 0.5 * np.cos(3.1 * x + 0.6)) * (0.4 + d) - 0.10 * np.clip((d - 0.85) / 0.15, 0, 1)
        return np.where(p[:, 2] < TOP + 0.001, k, 1.0)
    mc.shade(cloth, folds)
    cloth["thin_ok"] = 12.0
    export.marker("cord", (0, 0, 0)); export.marker("cloth", (0, 0, -0.855))
    # ---- clip `fall` (36 frames). The cord parts; the cloth drops, its hem leading and the bands billowing back;
    # the hem lands (frame 22) and the bands crumple down over it, each at its own angle and yaw, the width bunching
    # to 70 %; the cane batten comes down last, one end first, bounces once and lies across the heap.
    # Angles are in the world sense about game +X (0 = hanging); yaw about game +Y, roll about game +Z (bone-local).
    # From the landing on, the DROP IS SOLVED: each key's pose is evaluated and the cloth is set down so that its lowest
    # vertex rests on the hall floor (plus `air`), so the heap neither sinks into the floor nor hovers over it.
    import bpy
    act = anim.new_action(arm, "fall"); n = anim.frames(ASSET, "fall")
    R = math.radians
    from mathutils import Quaternion
    def pose(drop, fwd, a, yaw, roll, sx, side=0.0):
        """World orientation of band i = yaw about the vertical x roll about the front axis x fold about game X: a yaw
        turns a lying band ON the floor (it does not twist it about its own length); bone frames are game axes."""
        qs = [Quaternion((0, 1, 0), R(yaw[i])) @ Quaternion((0, 0, 1), R(roll[i])) @ Quaternion((1, 0, 0), R(a[i])) for i in range(3)]
        return {"cloth_1": {"loc": (side, drop, fwd), "rot": qs[0], "scale": (sx, 1.0, 1.0)},
                "cloth_2": {"rot": qs[0].inverted() @ qs[1]},
                "cloth_3": {"rot": qs[1].inverted() @ qs[2]}}
    def lowest(p):
        from mathutils import Euler
        for b, ch in p.items():
            pb = arm.pose.bones[b]
            pb.location = ch.get("loc", (0, 0, 0)); pb.rotation_quaternion = ch["rot"]; pb.scale = ch.get("scale", (1, 1, 1))
        bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get(); dg.update()
        z = 1e9
        for o in (cloth, marks):
            ev = o.evaluated_get(dg); me = ev.to_mesh()
            wi = o.vertex_groups["cloth_root"].index if "cloth_root" in o.vertex_groups else -1
            for v, v0 in zip(me.vertices, o.data.vertices):
                if any(g.group == wi and g.weight > 0.5 for g in v0.groups): continue      # the stub that stays on the viga
                z = min(z, (ev.matrix_world @ v.co).z)
            ev.to_mesh_clear()
        return z
    keys = [  # frame, drop (None = rest the lowest vertex `air` above the floor), air, forward, folds (a1, a2, a3), yaws, rolls, width, sideways
        (0, 0.0, 0, 0.0, (0, 0, 0), (0, 0, 0), (0, 0, 0), 1.0, 0.0),
        (2, -0.02, 0, 0.0, (3, -2, 1), (0, 0, 0), (0.5, 0, 0), 1.0, 0.0),
        (8, -0.52, 0, -0.02, (9, -7, 6), (1, -1, 2), (2, 1, 0), 0.99, 0.0),
        (15, -1.75, 0, -0.04, (13, -12, 14), (2, -2, 5), (3, 2, 0), 0.97, 0.01),
        (21, None, 0.10, -0.05, (10, -16, 24), (3, -3, 8), (4, 2, 0), 0.95, 0.02),
        (22, None, 0.0, -0.05, (6, -22, 36), (3, -4, 10), (4, 2, 0), 0.94, 0.02),
        (25, None, 0.0, -0.02, (-30, -36, 70), (6, -6, 18), (6, 3, 0), 0.88, 0.03),
        (28, None, 0.0, 0.04, (-82, -46, 86), (10, -9, 24), (9, 4, 0), 0.80, 0.045),
        (31, None, 0.0, 0.08, (-127, -50, 90), (14, -11, 28), (7, 5, 0), 0.72, 0.06),
        (33, None, 0.0, 0.085, (-119, -48, 90), (14, -11, 28), (4, 5, 0), 0.73, 0.06),
        (35, None, 0.0, 0.085, (-125, -50, 90), (14, -11, 28), (6.5, 5, 0), 0.72, 0.06),
        (n, None, 0.0, 0.085, (-124, -50, 90), (14, -11, 28), (6, 5, 0), 0.72, 0.06)]
    for f, drop, air, fwd, a, yaw, roll, sx, side in keys:
        if drop is None:
            p0 = pose(0.0, fwd, a, yaw, roll, sx, side)
            drop = (FLOOR + 0.004 + air) - lowest(p0)
        p = pose(drop, fwd, a, yaw, roll, sx, side)
        if f == n: print("CLOTH heap: lowest vertex %.3f (floor %.3f), drop %.3f" % (lowest(p), FLOOR, drop))
        anim.key_pose(arm, f, p)
    mc.finish_actions(arm, [act])
    anim.reset_pose(arm)
    for pb in arm.pose.bones: pb.scale = (1, 1, 1)

if __name__ == "__main__":
    mc.std_main(ASSET, build)
