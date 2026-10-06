"""ia_cradle: the cradle (load-bearing). ONE cast ceramic wall unit: a block 0.5 x 0.5 x 0.2 whose top sweeps back in a
cast shoulder into the round-headed stele that carries the mark (10 mm relief, 0.5 m tall, brand.pellam_mark), a small
lamp at each disc: the six chambers and the seventh, whose lamp stays dark until the proof. In the block a lit recess
in a steel bezel, and in the recess, on a brass stem, the cradle: two forked brass cheeks with half-round seats bored
12.4 mm for the 12 mm case of prop_cartridge_kept, set 26 mm apart so the 9 mm band lies between them. It is empty.
Clean, with no stain and no dust, except one thumbprint in the dust on the niche lip. Overall 0.5 x 1.1 x 0.2.

Pivot: back centre of the whole unit (the block is the lower half, the mark the upper). `cradle_lamp` (1) is the
strip that lights the recess; `mark_lamps` (7): index 0-5 the ring clockwise from the upper right, index 6 the seventh.
Wall-mounted: no back faces, no top of the block (the shoulder covers it), nothing under the lip."""

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

ASSET = "ia_cradle"

BZ = -0.30            # centre height of the block (it spans -0.55 .. -0.05)
NX, NZ0, NZ1 = 0.11, -0.42, -0.17          # the recess: half width, foot, head
SEAT_Z = NZ0 + 0.118                       # the axis of a round lying in the cradle
CY = -0.125                                # the cradle's depth in the recess (Blender y)


def cheek(x):
    """One forked cheek of the cradle: a brass plate 6 mm thick across the round's axis, a half-round seat r 6.2 mm."""
    r = 0.0062; hw = 0.013; z0 = SEAT_Z - 0.020; z1 = SEAT_Z + 0.004
    arc = [(-r * math.cos(a), SEAT_Z - r * math.sin(a)) for a in (math.radians(k) for k in (0, 60, 120, 180))]      # from the +y lip down round to the -y lip
    out = [(-hw, z0), (hw, z0), (hw * 0.8, z1)] + [(-y, z) for (y, z) in arc] + [(-hw * 0.8, z1)]
    polys = []
    f0 = [(x - 0.003, CY + y, z) for (y, z) in out]; f1 = [(x + 0.003, CY + y, z) for (y, z) in out]
    polys.append(f1); polys.append(f0[::-1])
    n = len(out)
    for k in range(1, n):                                                          # no underside: it stands on the bar
        k2 = (k + 1) % n
        polys.append([f0[k], f0[k2], f1[k2], f1[k]])
    return mc.faces_obj("cheek", polys, "brass", smooth=50, recalc=True)


def build(args):
    parts, over = [], []
    # ---- the block: chamfered 20 mm, the recess let 0.13 into it; its top is the cast shoulder
    w, h, d, ch = 0.5, 0.5, 0.2, 0.02
    def rect(x, z, y): return [(-x, y, BZ - z), (x, y, BZ - z), (x, y, BZ + z), (-x, y, BZ + z)]
    back = rect(w / 2, h / 2, 0.0); mid = rect(w / 2, h / 2, -(d - ch)); fr = rect(w / 2 - ch, h / 2 - ch, -d)
    polys = []
    for k in range(4):
        j = (k + 1) % 4
        if k != 2: polys.append([back[k], back[j], mid[j], mid[k]])               # k = 2 is the top: the shoulder instead
        polys.append([mid[k], mid[j], fr[j], fr[k]])
    polys += mc.holed_front(-(w / 2 - ch), w / 2 - ch, BZ - h / 2 + ch, BZ + h / 2 - ch, -NX, NX, NZ0, NZ1, -d)
    # the shoulder: a concave cast sweep from the block's front edge up and back to the stele's face (y, z)
    sweep = [(-(d - ch), -0.05), (-0.110, -0.036), (-0.064, -0.008), (-0.040, 0.036)]
    for (ya, za), (yb, zb) in zip(sweep, sweep[1:]):
        polys.append([(-w / 2, ya, za), (w / 2, ya, za), (w / 2, yb, zb), (-w / 2, yb, zb)])
    for sx in (-1, 1):
        cap = [(sx * w / 2, 0.0, -0.05)] + [(sx * w / 2, y, z) for (y, z) in sweep] + [(sx * w / 2, 0.0, 0.036)]
        polys.append(cap if sx < 0 else cap[::-1])
    parts.append(mc.faces_obj("block", polys, "enamel", recalc=True))
    parts.append(mc.faces_obj("niche", mc.recess(-NX, NX, NZ0, NZ1, -d, 0.13), "enamel_stain"))
    # ---- the steel bezel round the recess (6 mm proud, a chamfered frame) and the niche lip: a cast sill 28 mm proud
    bz = 0.022; by = -d - 0.006
    o = [(-NX - bz, NZ0 - bz), (NX + bz, NZ0 - bz), (NX + bz, NZ1 + bz), (-NX - bz, NZ1 + bz)]
    i_ = [(-NX, NZ0), (NX, NZ0), (NX, NZ1), (-NX, NZ1)]
    o2 = [(x + (0.006 if x < 0 else -0.006), z + (0.006 if z < BZ else -0.006)) for x, z in o]
    bez = []
    for k in range(4):
        j = (k + 1) % 4
        bez.append([(o2[k][0], by, o2[k][1]), (o2[j][0], by, o2[j][1]), (i_[j][0], by, i_[j][1]), (i_[k][0], by, i_[k][1])])
        if k != 0: bez.append([(o[k][0], -d, o[k][1]), (o[j][0], -d, o[j][1]), (o2[j][0], by, o2[j][1]), (o2[k][0], by, o2[k][1])])      # the foot is behind the lip
    parts.append(mc.faces_obj("bezel", bez, "steel", recalc=True))
    LIP_H = 0.036
    parts.append(mc.slab("lip", (2 * NX + 0.09, 0.028, LIP_H), (0, -d - 0.014, NZ0 - LIP_H / 2), "enamel", drop=("y+", "z-"), taper=(0.95, 1.0)))
    # ---- the stele behind the mark: round-headed (Pellam radius 0.15), running down into the shoulder
    out = [(0.25, 0.036), (0.25, 0.40)] + [(0.10 + 0.15 * math.cos(math.radians(a)), 0.40 + 0.15 * math.sin(math.radians(a))) for a in (30, 60, 90)] \
        + [(-0.10 + 0.15 * math.cos(math.radians(a)), 0.40 + 0.15 * math.sin(math.radians(a))) for a in (90, 120, 150)] + [(-0.25, 0.40), (-0.25, 0.036)]
    slab = mc.prism("slab", out, 0.04, "enamel", chamfer=0.012)
    mesh.delete_faces(slab, lambda f, c, n: n.z < -0.9)                           # its foot is inside the shoulder
    parts.append(slab)
    U = 0.46 / (1.22 + 2.66)
    ring_z = 0.02 + 2.66 * U + 0.02
    mark = brand.pellam_mark(U, relief=0.010, segments=6, colour="steel")
    mc.place(mark, (0, -0.04, ring_z))
    cs = [(cx, ring_z + cz) for cx, cz in brand.mark_disc_centres(U)]
    ri = (brand.DISC_R - brand.DISC_WALL) * U
    def inner_wall(f, c, n):                                                     # the chambers' inner walls: the lamps fill them
        for (cx, cz) in cs[:6]:
            if math.hypot(c.x - cx, c.z - cz) < ri * 1.05 and abs(n.y) < 0.5: return True
        return False
    mesh.delete_faces(mark, inner_wall)
    parts.append(mark)
    lamps = [mc.lamp_disc((cx, -0.0445, cz), ri * 1.02, 6, phase=0.0) for (cx, cz) in cs[:6]]
    lamps.append(mc.lamp_disc((cs[6][0], -0.0505, cs[6][1]), brand.SEVENTH_R * U * 0.42, 4, phase=math.pi / 4))
    # ---- the brass cradle: a turned foot and stem, a cross bar, two forked cheeks 26 mm apart (the band lies between)
    stem = mc.lathe("stem", [(0.034, NZ0), (0.010, NZ0 + 0.022), (0.008, SEAT_Z - 0.026)], 5, "brass", phase=math.pi / 2)
    mc.place(stem, (0, CY, 0)); parts.append(stem)
    parts.append(mc.slab("bar", (0.050, 0.020, 0.008), (0, CY, SEAT_Z - 0.023), "brass", drop=("z+", "y+")))
    for sx in (-1, 1): parts.append(cheek(sx * 0.016))
    for o_ in parts: print("CRADLE part", o_.name, mesh.tri_count(o_, evaluated=False))
    ob = mesh.join(parts, ASSET + "_mesh")
    # ---- the one thumbprint: a dark oval in the dust on the niche lip (an overlay so it has its own vertices): the
    # whorl on the lip's face, and its smear over the lip's top edge
    tx = 0.052; tz = NZ0 - 0.016; ty = -d - 0.0288
    tp = mc.faces_obj("thumbprint", [[(tx + math.cos(a) * 0.017, ty - 0.0002 * math.sin(a), tz + math.sin(a) * 0.0125) for a in [mc.TAU * k / 8 + 0.3 for k in range(8)]]], "enamel_stain")
    mc.ao_compose(ob, distance=0.2, jitter=0.0, seed=args.seed, gradient=(0.97, 1.0), ao_strength=0.6, hidden=[tp])      # clean: no grade, no stain
    # the recess is LIT from its head: bright under the lamp strip, falling off toward the foot and tinted by the lamp,
    # so the niche is a dark, coloured hollow in a pale face and the brass stands out of it
    def lit(p, n):
        inside = (p[:, 1] > -d + 0.002) & (np.abs(p[:, 0]) < NX + 0.001) & (p[:, 2] > NZ0 - 0.001) & (p[:, 2] < NZ1 + 0.001) & (p[:, 1] < -d + 0.131)
        wall = inside & ((np.abs(np.abs(p[:, 0]) - NX) < 0.002) | (np.abs(p[:, 2] - NZ0) < 0.002) | (np.abs(p[:, 2] - NZ1) < 0.002) | (p[:, 1] > -d + 0.128))
        t = np.clip((p[:, 2] - NZ0) / (NZ1 - NZ0), 0, 1)
        k = (0.50 + 0.38 * t)[:, None] * np.array([[0.78, 1.0, 0.98]], dtype=np.float32)
        return np.where(wall[:, None], k, 1.0)
    mc.shade(ob, lit)
    vcol.compose_vertex_color(tp, mode='ratio', gradient=(0.5, 0.5), jitter=0.0)
    ob = mesh.join([ob, tp], ASSET + "_mesh")
    zone.lamp_set("cradle_lamp", [[[(-0.09, -0.195, NZ1 - 0.002), (-0.09, -0.08, NZ1 - 0.002), (0.09, -0.08, NZ1 - 0.002), (0.09, -0.195, NZ1 - 0.002)],
                                    mc.lamp_rect((0, -0.0715, NZ1 - 0.03), 0.18, 0.032)]], colour="aqua")      # the strip in the head of the recess and its return on the back wall
    zone.lamp_set("mark_lamps", lamps, colour="aqua", origin=(0, -0.044, ring_z))

if __name__ == "__main__":
    mc.std_main(ASSET, build)
