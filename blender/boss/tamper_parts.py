"""The Tamper's parts, skeleton and pose solver: shared by enemy_tamper.py (rigged, stained) and
tamper_cold_static.py (posed, clean). Owner: art-boss-tamper. Nothing here is imported by the Windlass half.

Blender space: +Z up, FRONT = -Y, the creature's LEFT = +X (so the big ram arm, its right arm, is at -X).
ART_BIBLE 6.3 / 7.6, work order art-boss 4.2:
    2.4 m high, 1.6 m wide; a ceramic barrel 1.3 m across and 1.4 m tall pitched 15 degrees forward on a steel ball
    joint; two short telescoping legs with broad square feet; one enormous right arm (shoulder housing 0.5 m, casing
    1.3 x 0.45 m, a steel piston with a 0.55 m tamping head); one small tucked left clamp arm; chest and back vents
    0.5 m across hinged at the top, a hex-collar knot (r 0.22) in the dark cavity behind each.

Rigid skin: every part belongs to exactly one of the 12 bones. Joints are drawn as round things on their pivot (ball
under the barrel, hip and ankle drums, the shoulder housing) so nothing opens up or collapses when a bone turns; the
ram is a piston that slides out of the casing (bone `arm_r_ram` translates along the arm), the legs telescope (the
foot slides on the thigh's post).
"""
import math, random
import bpy, bmesh
import numpy as np
from mathutils import Vector, Matrix, Quaternion
from lib import mesh, uv, material, vcol, knot, brand, manifest

# ---------------------------------------------------------------------------------------------------- the drawing
PITCH = math.radians(15.0)                    # the barrel's forward pitch in the rest pose
PIV = Vector((0.0, 0.0, 0.95))                # barrel pivot: the centre of the ball joint
R_BARREL = 0.65
FLAT_X = -0.46                                # the machined flat on the barrel's right side where the arm rides
HIP_C = Vector((0.0, 0.03, 0.68))             # pelvis pivot (between the hips)
HIP_X = 0.39
ANKLE_Z = 0.17
ARM_X = -0.74                                 # the arm's plane: the casing stands clear of the barrel's flat (a shadow gap)
SHOULDER_Z = 1.22                             # barrel-local height of the trunnion: its drum rides ABOVE the crown line (the hump)
ARM_REST = math.radians(17.0)                 # the arm hangs 17 degrees forward of plumb at rest: the head clear of the toe
MOUTH = 1.15                                  # casing mouth below the shoulder (along the arm)
HEAD_END = 1.84                               # the tamping face below the shoulder at rest: the head hangs past the knee
HEAD_RAKE = math.radians(15.0)                # the tamping head is set raked on the piston: its face lands flat on a forward slam
SHAFT_TOP = -0.24                             # arm-local top of the piston (inside the casing at every extension)
HUNCH_S = 0.28                                # the crown keeps this share of its height at the left brow (the hunch)
VENT_W, VENT_H, VENT_DEPTH = 0.49, 0.485, 0.33
LID_BACK = 0.075                              # the lid's insulated back stands this far into the cavity at its hinge edge when shut
                                              # (tapering to a plate at the free edge): with the slats the open awning is 0.11 m
                                              # thick at its root edge-on (2 px in a 48 px figure)
CHEST_FACE_Y, CHEST_Z = -0.93, 1.5035         # the chest hatch stands PLUMB (so the open lid is a level awning)
BACK_FACE_Y, BACK_Z = 0.69, 0.7425            # barrel-local: the back hatch lies on the barrel
CHEST_LOCAL_Z = 0.776                         # barrel-local height of the chest hatch's centre (the cold unit seats it flush there)
STAIN = (0.40, 0.44, 0.34)                    # enamel -> well past enamel_stain (linear ratio; enamel_stain itself is 0.69): run heads, the foot of the drum


def M_BARREL():
    """barrel-local (axis +Z, front -Y, origin at the pivot) -> world, rest pose."""
    return Matrix.Translation(PIV) @ Matrix.Rotation(PITCH, 4, 'X')


def bl(x, y, z):
    """A barrel-local point in the world (rest pose)."""
    return M_BARREL() @ Vector((x, y, z))


SHOULDER = bl(ARM_X, 0.0, SHOULDER_Z)
LARM = bl(0.475, -0.528, 0.80)


HUNCH_Z0 = 0.95                               # barrel-local height above which the crown is drawn down


def hunch_z(x, y, z):
    """Barrel-local: the hunched height of a crown point. Above HUNCH_Z0 every height is scaled toward it: not at all at
    the back-right (under the trunnion, which carries the arm), down to HUNCH_S at the brow on the left. The round
    crown becomes an oblique roof that runs down to the cowl and away from the big arm: hunched over, one shoulder
    hiked (with the 15 degree pitch the roof falls about 25 degrees toward the front), not a dome."""
    if z <= HUNCH_Z0: return z
    u = min(1.0, max(0.0, (y + 0.65) / 1.30))                 # 0 at the brow, 1 at the back
    w = min(1.0, max(0.0, (0.65 - x) / 1.30))                 # 0 on the left, 1 on the arm side
    s = HUNCH_S + (1.0 - HUNCH_S) * (0.62 * u + 0.38 * w)
    return HUNCH_Z0 + (z - HUNCH_Z0) * s


def hunch(ob):
    """Apply the hunch to a barrel-local object (before it is carried into the world)."""
    for v in ob.data.vertices:
        v.co.z = hunch_z(v.co.x, v.co.y, v.co.z)
    ob.data.update()
    return ob


def M_ARM():
    """arm-local (origin at the shoulder, the arm runs down -Z) -> world, rest pose."""
    return Matrix.Translation(SHOULDER) @ Matrix.Rotation(-ARM_REST, 4, 'X')


def hip(sx): return Vector((sx * HIP_X, HIP_C.y, HIP_C.z))
def ankle(sx): return Vector((sx * HIP_X, HIP_C.y, ANKLE_Z))


# ---------------------------------------------------------------------------------------------------- small kit
def paint(ob, colour):
    material.assign(ob, "m_prop"); uv.map_to_palette(ob, colour); vcol.tint(ob, colour)
    return ob


def set_mul(ob, rgb, faces=None):
    """The helper colour layer "Mul": multiplied into COLOR_0 after the compose (stain, edge wear)."""
    vcol.fill_color(ob, rgb, "Mul", faces)


def mark_emis(ob, faces=None):
    """Per-face mark: these faces sit on an emissive palette cell; their COLOR_0 is not shaded by AO."""
    me = ob.data
    at = me.attributes.get("ks_emis") or me.attributes.new("ks_emis", 'INT', 'FACE')
    vals = np.zeros(len(me.polygons), dtype=np.int32); at.data.foreach_get("value", vals)
    for i in uv.face_indices(ob, faces): vals[i] = 1
    me.attributes["ks_emis"].data.foreach_set("value", vals)


WEAR = {"steel": ("gun_worn", (0.40, 0.83, 0.87)), "steel_dark": ("steel", (0.56, 0.54, 0.58))}


def fin(ob, bevel=0.02, wear=None, smooth=35):
    """Bevel + weighted normals; with wear = 'steel' | 'steel_dark' the bevel faces are remembered (per-face mark
    ks_wear) and painted one step lighter by `paint_wear` after the part got its colour: the edges catch light."""
    pre = [p.normal.copy() for p in ob.data.polygons]
    mesh.finish(ob, bevel=bevel, smooth_angle=smooth)
    if wear and bevel > 0:
        me = ob.data
        at = me.attributes.new("ks_wear", 'INT', 'FACE')
        c = math.cos(math.radians(12.0))
        vals = [0 if max(p.normal.dot(n) for n in pre) > c else 1 for p in me.polygons]
        at.data.foreach_set("value", vals)
        ob["wear"] = wear
    return ob


def paint_wear(ob):
    me = ob.data
    at = me.attributes.get("ks_wear")
    if at is None: return ob
    vals = np.zeros(len(me.polygons), dtype=np.int32); at.data.foreach_get("value", vals)
    idx = [int(i) for i in np.nonzero(vals)[0]]
    cell, mul = WEAR[ob["wear"]]
    if idx:
        uv.map_to_palette(ob, cell, faces=idx); vcol.tint(ob, cell, faces=idx); set_mul(ob, mul, faces=idx)
    me.attributes.remove(me.attributes["ks_wear"])
    return ob


def xf(ob, M):
    ob.data.transform(M); ob.data.update()
    return ob


def lathe(name, prof, seg=24, phase=7.5, skip=None, cap_top=False, clamp=None):
    """Revolve the profile [(r, z)...] (bottom to top) about Z. Vertices stand at phase + k * 360 / seg degrees (with 24
    and 7.5 a column is centred dead ahead and dead astern). skip(row, column) leaves a face out; clamp = x floor."""
    bm = mesh.new_bmesh(); rings = []
    for (r, z) in prof:
        ring = []
        for j in range(seg):
            a = math.radians(phase + j * 360.0 / seg)
            x, y = r * math.cos(a), r * math.sin(a)
            if clamp is not None and x < clamp: x = clamp
            ring.append(bm.verts.new((x, y, z)))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for j in range(seg):
            if skip and skip(i, j): continue
            k = (j + 1) % seg
            bm.faces.new((rings[i][j], rings[i][k], rings[i + 1][k], rings[i + 1][j]))
    if cap_top: bm.faces.new(rings[-1])
    return mesh.new_mesh_object(name, bm)


def _ccw(pts):
    a = sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts)))
    return list(pts) if a > 0 else list(reversed(pts))


def prism(name, outline, h0, h1, axis='Z', caps=(True, True), rows=()):
    """Extrude a 2D outline from h0 to h1 along an axis. axis 'Z': outline (x, y); 'X': outline (y, z); 'Y': outline
    (x, z). `rows` = extra heights between h0 and h1 (edge loops for the vertex bake)."""
    pts = _ccw(outline)
    if axis == 'Y': pts = list(reversed(pts))                     # (x, h, z) swaps handedness
    hs = [h0] + sorted(rows) + [h1]
    put = {'Z': lambda u, v, h: (u, v, h), 'X': lambda u, v, h: (h, u, v), 'Y': lambda u, v, h: (u, h, v)}[axis]
    bm = mesh.new_bmesh()
    rings = [[bm.verts.new(put(u, v, h)) for (u, v) in pts] for h in hs]
    n = len(pts)
    for i in range(len(hs) - 1):
        for j in range(n):
            k = (j + 1) % n
            bm.faces.new((rings[i][j], rings[i][k], rings[i + 1][k], rings[i + 1][j]))
    if caps[1]: bm.faces.new(rings[-1])
    if caps[0]: bm.faces.new(list(reversed(rings[0])))
    return mesh.new_mesh_object(name, bm)


def rrect(w, h, r, n=3):
    """Rounded rectangle outline (CCW), corner radius r, n segments per corner."""
    out = []
    for (cx, cy, a0) in ((w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270)):
        for k in range(n + 1):
            a = math.radians(a0 + 90.0 * k / n)
            out.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return out


def circ(r, n, phase=0.0, c=(0.0, 0.0)):
    return [(c[0] + r * math.cos(math.radians(phase + 360.0 * k / n)), c[1] + r * math.sin(math.radians(phase + 360.0 * k / n))) for k in range(n)]


def bolt(name, at, normal, r=0.022, h=0.012, colour="steel_dark"):
    """A square-headed fastener: 4-sided frustum standing on `at` along `normal` (no underside)."""
    ob = mesh.cylinder(name, r, h, (0, 0, h / 2), segments=4, radius_top=r * 0.7)
    mesh.delete_faces(ob, lambda f, c, n: n.z < -0.9)
    q = Vector((0, 0, 1)).rotation_difference(Vector(normal).normalized())
    xf(ob, Matrix.Translation(Vector(at)) @ q.to_matrix().to_4x4() @ Matrix.Rotation(math.radians(45), 4, 'Z'))
    mesh.finish(ob, bevel=0.0, smooth_angle=30, weighted=False)
    return paint(ob, colour)


def stain_mul(k):
    return [1.0 - (1.0 - s) * k for s in STAIN]


def wall_k(z):
    """How far the barrel's enamel has gone toward STAIN at barrel-local height z (0..1): "heavily stained" (ART_BIBLE
    6.3). A thin film everywhere (nothing on the fighting unit is as clean as the cold one), and the lower half of the
    drum gone almost all the way, worst at its foot. The contrast is the point: the runs (below) are read against the
    paler enamel between them."""
    if z >= 1.05: return 0.30                                      # the crown: what settles on it stays
    if z >= 0.66: return 0.20
    return min(1.0, 0.20 + 0.74 * min(1.0, (0.66 - z) / 0.68) ** 0.7)


# the runs: what every 15 degree column of the drum has let down from the crown joint: (strength, length in metres),
# index = lathe column, angle 7.5 + 15 k degrees from +X. Heavy under the trunnion's edges, the lug, the battens' tops,
# the cowl's corners and the plate; a hand-set, uneven comb (dark column beside a pale one) so the streaks read as
# streaks at fight distance. Each starts on the fillet and fades out down the wall.
RUNS = ((0.85, 1.00), (0.10, 0.40), (0.45, 0.6), (0.90, 0.80), (0.20, 0.50), (0.00, 0.0), (0.00, 0.0), (0.80, 0.70),
        (0.30, 1.00), (0.95, 1.10), (0.50, 0.90), (0.20, 0.60), (0.25, 0.80), (0.55, 1.00), (0.95, 1.10), (0.15, 0.50),
        (0.80, 0.90), (0.00, 0.0), (0.00, 0.0), (0.85, 0.75), (0.10, 0.40), (0.90, 1.00), (0.35, 0.5), (0.65, 0.60))


def run_k(x, y, z):
    """Barrel-local: the column runs (0..1) at a point of the drum or its fillet."""
    if z > 1.26 or z < -0.05: return 0.0
    a = (math.degrees(math.atan2(y, x)) - 7.5) % 360.0 / 15.0
    i = int(math.floor(a + 1e-6)); t = a - i
    k = 0.0
    for (j, w) in ((i % 24, 1.0 - t), ((i + 1) % 24, t)):
        s, ln = RUNS[j]
        if s <= 0.0 or w <= 1e-6: continue
        if z > 1.05: k += w * s * 0.8 * (1.26 - z) / 0.21          # the head of the run, on the fillet
        else: k += w * s * max(0.0, 1.0 - (1.05 - z) / ln) ** 0.6
    return min(1.0, k)


def drum_k(x, y, z):
    """Barrel-local: the whole stain of the drum's enamel at a point (film x fitting washes x column runs)."""
    return 1.0 - (1.0 - wall_k(z)) * (1.0 - wash_k(x, y, z)) * (1.0 - run_k(x, y, z))


def stain_part(ob, fn):
    """Give an enamel part its stain: fn(vertex co) -> 0..1 toward STAIN, into the "Mul" layer."""
    me = ob.data
    col = np.ones((len(me.loops), 4), dtype=np.float32)
    for li, l in enumerate(me.loops):
        col[li, :3] = stain_mul(min(1.0, max(0.0, fn(me.vertices[l.vertex_index].co))))
    vcol.set_colors(ob, col, "Mul")
    return ob


# wash streaks on the drum (barrel-local): (angle from +X in degrees, top z, length, half-width in degrees, strength).
# Under the battens' bolts, under the shoulder, under both hatches' sills and the plate; they run down over the band.
WASH = ((-28, 0.95, 0.70, 7.0, 0.85), (130, 0.95, 0.75, 7.0, 0.9), (-130, 0.95, 0.72, 7.0, 0.9),   # the battens' bolts
        (148, 1.10, 1.05, 11.0, 0.95), (-148, 1.10, 1.05, 11.0, 0.95),   # the shoulder weeps down both edges of the flat
        (-75, 1.12, 0.50, 10.0, 0.75), (-105, 1.12, 0.46, 10.0, 0.7),    # under the cowl's two corners, down to the hatch
        (0, 0.80, 0.70, 12.0, 0.8), (-14, 0.80, 0.55, 8.0, 0.6),          # under the plate (broad)
        (-63, 0.44, 0.44, 8.0, 0.75), (-117, 0.44, 0.44, 8.0, 0.75), (-90, 0.40, 0.38, 9.0, 0.55),   # under the chest housing
        (68, 0.46, 0.40, 7.0, 0.7), (112, 0.46, 0.36, 7.0, 0.65), (92, 0.46, 0.30, 6.0, 0.5),       # under the back hatch's sill
        (6, 0.77, 0.52, 6.0, 0.6), (40, 0.50, 0.30, 7.0, 0.45),          # under the plate, under the number
        (-52, 1.02, 0.36, 5.0, 0.5), (58, 1.02, 0.42, 5.0, 0.55), (22, 1.02, 0.30, 5.0, 0.4))         # the crown joint


def wash_k(x, y, z):
    """Barrel-local: the streak wash at a point of the drum (0..1)."""
    a = math.degrees(math.atan2(y, x)); k = 0.0
    for (a0, z0, ln, hw, s) in WASH:
        da = abs((a - a0 + 180.0) % 360.0 - 180.0)
        if da > hw * 1.6 or z > z0 + 0.02 or z < z0 - ln: continue
        across = max(0.0, 1.0 - da / (hw * 1.6))
        along = (z0 - z) / ln
        k = max(k, s * across * (1.0 - along) ** 0.7)
    return k


def casing_k(z):
    """arm-local: the casing's enamel is filmed all over and its lower half has gone right to enamel_stain (the mouth
    throws grease and floor dust up it at every stroke)."""
    return min(0.95, 0.18 + 0.80 * min(1.0, max(0.0, (0.10 - z) / 1.10)) ** 0.7)


def streak(name, top, down, across, normal, length=0.3, width=0.06, strength=1.0, under=None, shade=1.0):
    """A stain under a fastener, sill or seam end (ART_BIBLE 4.5): a tapering strip 2 mm off the enamel, palette
    `enamel`, its head multiplied toward enamel_stain and fading to nothing at its foot. 4 triangles."""
    top = Vector(top); d = Vector(down).normalized(); a = Vector(across).normalized(); n = Vector(normal).normalized()
    bm = mesh.new_bmesh()
    rows = []
    for (t, w) in ((0.0, 1.0), (0.45, 0.8), (1.0, 0.35)):
        c = top + d * (length * t) + n * 0.003
        rows.append((bm.verts.new(c - a * (width * w / 2)), bm.verts.new(c + a * (width * w / 2))))
    for i in range(2):
        f = bm.faces.new((rows[i][0], rows[i][1], rows[i + 1][1], rows[i + 1][0]))
        f.normal_update()
        if f.normal.dot(n) < 0: f.normal_flip()
    ob = mesh.new_mesh_object(name, bm)
    paint(ob, "enamel")
    me = ob.data
    col = np.ones((len(me.loops), 4), dtype=np.float32)
    for li, l in enumerate(me.loops):
        co = me.vertices[l.vertex_index].co
        t = (co - top - n * 0.003).dot(d) / length
        k = strength * max(0.0, 1.0 - t) ** 0.8
        base = stain_mul(under(co)) if under else (1.0, 1.0, 1.0)     # the surface it lies on is itself stained
        col[li, :3] = [b * m * shade for b, m in zip(base, stain_mul(k))]      # shade: the AO of the wall it lies on (a streak takes none)
    vcol.set_colors(ob, col, "Mul")
    ob["flat_ao"] = True
    return ob


# ---------------------------------------------------------------------------------------------------- close-range surface
# Look team creatures-props, pass i4 (the playthrough reviewer: "the fight is played inside its slam range ... at that
# distance it reads as a large smooth dome and flat plates with no surface detail"). The fighting unit's drum is seen
# from one to two metres, where a 13 x 17 cm lathe cell is 80 px across. Sized for that distance, and on the fighting
# unit only (the cold unit is the clean casting it always was, and its zone is not rebuilt):
#   rows     five more edge loops round the wall: the stain is painted per vertex and had nothing finer to live on;
#   a seam   the wall is two courses of plate: a 12 mm joint let INTO the wall's own faces at SEAM_Z (two loops, the
#            strip between them dark), the upper course a shade off the lower, a row of rivets along both sides of it;
#   rivets   along both lips of the band and round the shoulder of the crown;
#   grime    blotches the size of a hand over the film, a tide line of dust on the band's upper lip, a dark skirt
#            under the seam; chips where the enamel has gone to the steel at the band's lower lip and the foot.
SEAM_Z = (0.669, 0.681)
ROWS_I4 = (0.10, 0.405, 0.545, 0.805)


def _vn(x, y, z):
    """Smooth value noise 0..1 (a lattice hash, trilinear)."""
    def h(i, j, k):
        t = math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453
        return t - math.floor(t)
    ix, iy, iz = math.floor(x), math.floor(y), math.floor(z)
    fx, fy, fz = x - ix, y - iy, z - iz
    fx, fy, fz = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy), fz * fz * (3 - 2 * fz)
    out = 0.0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                out += (fx if dx else 1 - fx) * (fy if dy else 1 - fy) * (fz if dz else 1 - fz) * h(ix + dx, iy + dy, iz + dz)
    return out


def grime_k(x, y, z):
    """Barrel-local: what the film alone does not say at arm's length (0..1 toward STAIN): hand-sized blotches, the
    dust that lies on the band's upper lip, the weep under the plate seam, the splash at the foot."""
    b = min(1.0, max(0.0, _vn(x * 5.5 + 3.1, y * 5.5 - 1.7, z * 6.0) - 0.40) / 0.22)        # patches with an edge, not a haze
    k = 0.62 * b
    k = max(k, 0.36 * min(1.0, max(0.0, _vn(x * 13.0, y * 13.0, z * 17.0 + 5.0) - 0.52) / 0.2))   # a finer speckle
    if 0.33 <= z <= 0.43: k = max(k, 0.55 * (1.0 - (z - 0.33) / 0.10) ** 1.5)                  # the band's upper lip holds dust
    if SEAM_Z[0] - 0.14 <= z <= SEAM_Z[0]: k = max(k, 0.42 * (1.0 - (SEAM_Z[0] - z) / 0.14) ** 1.2 * (0.4 + 0.6 * _vn(x * 9.0, y * 9.0, 0.5)))   # the seam weeps
    if z < 0.12: k = max(k, 0.5 * (1.0 - max(0.0, z) / 0.12))
    return min(1.0, k)


def scuff_k(x, y, z):
    """Barrel-local: where the film has been rubbed off again (0..1 of it GONE): long slanting scrapes at the height
    the drum meets door frames and pillars, and a worn patch under each hatch's sill. The pale of the enamel itself is
    the only light value the wall has: without it the grime is dark on dark."""
    if z < 0.36 or z > 1.02: return 0.0
    a = math.atan2(y, x) * 0.65
    s = _vn(a * 9.0 + z * 14.0, a * 2.0 - z * 3.0, 4.2)                # stretched along a slant
    k = min(1.0, max(0.0, s - 0.60) / 0.12)
    return k * min(1.0, (z - 0.36) / 0.05)


def wall_stain(x, y, z):
    """Barrel-local: the fighting drum's whole stain at a point: film x washes x runs x grime, less the scuffs."""
    return (1.0 - (1.0 - drum_k(x, y, z)) * (1.0 - grime_k(x, y, z))) * (1.0 - 0.85 * scuff_k(x, y, z))


def rivets(name, sites, r=0.013, h=0.007, colour="steel"):
    """Round-head rivets at this distance are three facets: a low three-sided point on each (position, normal)."""
    bm = mesh.new_bmesh()
    for q, (at, normal) in enumerate(sites):
        n = Vector(normal).normalized(); t = n.orthogonal().normalized(); b = n.cross(t)
        base = [bm.verts.new(Vector(at) + (t * math.cos(a) + b * math.sin(a)) * r) for a in (0.6 + q, 0.6 + q + 2.0944, 0.6 + q + 4.1888)]
        apex = bm.verts.new(Vector(at) + n * h)
        for i in range(3):
            f = bm.faces.new((base[i], base[(i + 1) % 3], apex)); f.normal_update()
            if f.normal.dot(n) < 0: f.normal_flip()
    ob = mesh.new_mesh_object(name, bm)
    mesh.finish(ob, bevel=0.0, smooth_angle=20, weighted=False)
    return paint(ob, colour)


def chip(name, at, normal, down, w, hgt, seed, under=None):
    """Enamel gone to the steel: a ragged four-cornered flake 2 mm off the wall."""
    n = Vector(normal).normalized(); d = Vector(down).normalized(); a = n.cross(d).normalized()
    rr = random.Random(seed)
    c = Vector(at) + n * 0.002
    pts = [c - a * w * rr.uniform(0.4, 0.6), c + a * w * rr.uniform(0.35, 0.6) + d * hgt * rr.uniform(0.0, 0.3), c + a * w * rr.uniform(0.1, 0.5) + d * hgt * rr.uniform(0.8, 1.0), c - a * w * rr.uniform(0.2, 0.55) + d * hgt * rr.uniform(0.5, 0.9)]
    bm = mesh.new_bmesh()
    f = bm.faces.new([bm.verts.new(q) for q in pts]); f.normal_update()
    if f.normal.dot(n) < 0: f.normal_flip()
    ob = mesh.new_mesh_object(name, bm)
    paint(ob, "steel"); ob["flat_ao"] = True
    return ob


# ---------------------------------------------------------------------------------------------------- the barrel
WALL = [(0.63, -0.04), (0.65, -0.01), (0.65, 0.21), (0.657, 0.22), (0.657, 0.32), (0.65, 0.33),
        (0.65, 0.48), (0.65, 0.61), (0.65, 0.74), (0.65, 0.87), (0.65, 1.05)]
BATTENS = (-28.0, 130.0, -130.0)               # degrees from +X (the creature's left): clear of plate, number, arm, vents
VENT_ROWS = (0.48, 1.05)                       # the wall rows the vent openings cut (barrel-local z)
FILLET = [(0.35 + 0.3 * math.cos(math.radians(a)), 1.05 + 0.3 * math.sin(math.radians(a))) for a in (22.5, 45.0, 67.5, 90.0)]
_PROFILE = WALL + FILLET


def _vent_col(j):
    c = (7.5 + (j + 0.5) * 15.0) % 360.0
    return abs(c - 270.0) < 23.0 or abs(c - 90.0) < 23.0


def _vent_row(i):
    return VENT_ROWS[0] - 1e-4 < _PROFILE[i][1] and _PROFILE[i + 1][1] < VENT_ROWS[1] + 1e-4


def barrel(clean, band):
    """The ceramic drum (barrel-local): no hoops (the band is its only ring), the raised band, the wall with both vent
    openings and enough rows for the AO and the stain wash, the 0.3 m fillet and the crown, cut down toward the brow
    (the hunch); a machined flat on the arm side. One lathe, coloured by row."""
    ob = lathe("tp_barrel", _PROFILE, skip=lambda i, j: _vent_row(i) and _vent_col(j), cap_top=True, clamp=FLAT_X)
    hunch(ob)
    mesh.finish(ob, bevel=0.0, smooth_angle=33)
    if not clean:
        for zc in ROWS_I4 + SEAM_Z: mesh.bisect(ob, (0.0, 0.0, zc), (0.0, 0.0, 1.0))     # (pass i4: see "close-range surface")
    paint(ob, "enamel")
    flat = lambda p: p.normal.x < -0.97 and 0.0 < p.center.z < 1.30          # the machined flat the arm rides on; the band stops at it
    bandf = lambda p: 0.21 - 1e-4 < p.center.z < 0.33 + 1e-4 and not flat(p)
    uv.map_to_palette(ob, band, faces=bandf); vcol.tint(ob, "husk" if band.startswith("violet") else band, faces=bandf)
    if band.startswith("violet"): mark_emis(ob, faces=bandf)
    if not clean:
        # the lower half goes past enamel_stain (worst at the foot), and wide wash streaks run down from every fitting
        me = ob.data
        col = np.ones((len(me.loops), 4), dtype=np.float32)
        for p in me.polygons:
            if bandf(p): continue
            cz = p.center.z
            seam = SEAM_Z[0] - 1e-4 < cz < SEAM_Z[1] + 1e-4 and not flat(p)
            course = 0.90 if SEAM_Z[1] < cz < 1.05 else 1.0              # the upper course of plate: a shade off the lower
            if -0.01 < cz < 1.05 and not flat(p):                         # ... and each plate (two facets wide, the courses half a plate out of step) its own
                pa = (math.degrees(math.atan2(p.center.y, p.center.x)) - 7.5) % 360.0
                pi = int((pa + (15.0 if cz > SEAM_Z[1] else 0.0)) // 30.0) + (40 if cz > SEAM_Z[1] else 0) + (80 if cz < 0.21 else 0)
                course *= 0.84 + 0.16 * (math.sin(pi * 12.9898) * 43758.5453 % 1.0)
            for li in p.loop_indices:
                co = me.vertices[me.loops[li].vertex_index].co
                k = wall_stain(co.x, co.y, co.z)
                col[li, :3] = [c * course for c in stain_mul(k)]
                if seam: col[li, :3] = (0.16, 0.17, 0.16)                 # the joint between the two courses
        vcol.set_colors(ob, col, "Mul")
    parts = [ob]
    # the ball the barrel turns on: a steel cone down to a sphere centred on the pivot (any pose looks seated)
    ball = lathe("tp_ball", [(0.30, -0.40), (0.40, -0.30), (0.462, -0.19), (0.60, -0.04)], seg=12, phase=0.0, clamp=FLAT_X + 0.012)
    mesh.recalc_normals(ball); mesh.finish(ball, bevel=0.0, smooth_angle=40)
    parts.append(paint(ball, "steel_dark"))
    # crown: a steel hatch disc and a capped exhaust stub (breaks the dome's outline, off centre)
    hatch = prism("tp_hatch", circ(0.29, 8, phase=22.5), 1.35, 1.375, caps=(False, True))
    parts.append(paint(fin(hatch, 0.0), "steel"))
    stub = mesh.cylinder("tp_stub", 0.055, 0.09, (0.13, 0.13, 1.42), segments=8, cap=False)
    parts.append(paint(fin(stub, 0.0), "steel_dark"))
    cap = prism("tp_stub_cap", circ(0.075, 8), 1.455, 1.48)
    parts.append(paint(fin(cap, 0.0), "steel"))
    # three steel battens where the drum's panels meet (bolted top and bottom), two lifting lugs on the dome's shoulder
    for k, a in enumerate((75.0,)):                                   # one lifting lug, on the high back of the crown
        lug = prism(f"tp_lug{k}", [(0.585, 1.10), (0.70, 1.10), (0.70, 1.17), (0.66, 1.235), (0.585, 1.235)], -0.035, 0.035, axis='Y')
        mesh.finish(lug, bevel=0.0, smooth_angle=30)
        parts.append(xf(paint(lug, "steel"), Matrix.Rotation(math.radians(a), 4, 'Z')))
    for k, a in enumerate(BATTENS):
        ca, sa = math.cos(math.radians(a)), math.sin(math.radians(a))
        bt = mesh.box(f"tp_batten{k}", (0.03, 0.07, 0.675), (0.655, 0.0, 0.6625))
        mesh.delete_faces(bt, lambda f, c, n: n.x < -0.9)
        xf(paint(fin(bt, 0.0), "steel"), Matrix.Rotation(math.radians(a), 4, 'Z'))
        parts.append(bt)
        for j, z in enumerate((0.40, 0.925)):
            parts.append(bolt(f"tp_batten{k}_bolt{j}", (0.67 * ca, 0.67 * sa, z), (ca, sa, 0), r=0.02))
    if not clean:
        # pass i4: rivets along the plate seam, both lips of the band and the crown's shoulder; chips at the band's lower lip and the foot
        sites = []
        for j in range(24):
            if _vent_col(j): continue
            for half in (0.25, 0.75):
                a = math.radians(7.5 + (j + half) * 15.0); ca, sa = math.cos(a), math.sin(a)
                rr = 0.65 * math.cos(math.radians(7.5)) / math.cos(math.radians(abs(half - 0.5) * 15.0)) - 0.001     # on the 24-sided wall's flat, not the circle
                if rr * ca < FLAT_X + 0.03: continue
                for z in (SEAM_Z[0] - 0.026, SEAM_Z[1] + 0.026): sites.append(((rr * ca, rr * sa, z), (ca, sa, 0.0)))
                if half < 0.5:
                    for z in (0.356, 0.184): sites.append(((rr * ca, rr * sa, z), (ca, sa, 0.0)))
            a = math.radians(7.5 + (j + 0.5) * 15.0); ca, sa = math.cos(a), math.sin(a)
            rf = (0.35 + 0.3 * math.cos(math.radians(33.75))) * math.cos(math.radians(7.5)) - 0.001
            if rf * ca > FLAT_X + 0.03: sites.append(((rf * ca, rf * sa, 1.05 + 0.3 * math.sin(math.radians(33.75))), (ca * 0.83, sa * 0.83, 0.56)))
        parts.append(rivets("tp_rivets", sites))
        for q, (a, z, w, hgt) in enumerate(((12, 0.208, 0.07, 0.05), (-40, 0.205, 0.05, 0.035), (64, 0.208, 0.09, 0.04), (-66, 0.205, 0.06, 0.05), (100, 0.206, 0.05, 0.03), (160, 0.207, 0.08, 0.045),
                                              (28, 0.06, 0.10, 0.06), (-58, 0.05, 0.08, 0.05), (118, 0.07, 0.12, 0.05), (-112, 0.05, 0.07, 0.06), (4, 0.662, 0.05, 0.03), (-20, 0.56, 0.045, 0.04), (48, 0.47, 0.05, 0.035))):
            ca, sa = math.cos(math.radians(a)), math.sin(math.radians(a))
            off = ((a - 7.5) % 15.0) - 7.5                                # degrees from the middle of its wall facet
            rw = 0.65 * math.cos(math.radians(7.5)) / math.cos(math.radians(off)) + (0.007 if 0.21 < z < 0.33 else 0.0)
            fa = math.radians(a - off); fn = (math.cos(fa), math.sin(fa), 0.0)   # the facet's own normal
            parts.append(chip(f"tp_chip{q}", (rw * ca, rw * sa, z), fn, (0, 0, -1), w * 0.6, hgt * 0.6, 40 + q))
    for o in parts: paint_wear(o)
    if not clean:
        # crisp heads under the battens' lower bolts and below the band's lip (the broad wash is in the drum's own colours)
        for k, (a, z, ln, w, s) in enumerate(((-28, 0.375, 0.30, 0.07, 1.0), (130, 0.375, 0.32, 0.07, 1.0), (-130, 0.375, 0.30, 0.07, 1.0),
                                               (20, 0.205, 0.17, 0.08, 1.0), (-48, 0.205, 0.16, 0.07, 0.9), (118, 0.205, 0.18, 0.08, 1.0), (52, 0.205, 0.15, 0.07, 0.9))):
            ca, sa = math.cos(math.radians(a)), math.sin(math.radians(a))
            under = lambda co: min(1.0, wall_stain(co.x, co.y, co.z) + 0.12)      # (pass i4: the wall under a streak is the grimed wall; the plates' own shade is not in it, so a shade darker,
            # and well darker under the band's lip: the wall there carries the lip's AO, a streak does not: they stood out as pale spikes)
            parts.append(streak(f"tp_streak{k}", (0.652 * ca, 0.652 * sa, z), (0, 0, -1), (-sa, ca, 0), (ca, sa, 0), ln, w, s, under=under, shade=0.6 if z < 0.3 else 0.85))
    for o in parts[1:]: hunch(o)
    for o in parts: xf(o, M_BARREL())
    return parts


def cowl(clean=False):
    """The low sensor cowl on the dome's brow (barrel-local): a hooded wedge with a dark lens strip. No head, no eyes."""
    hood = prism("tp_cowl", [(-0.24, 1.30), (-0.24, 1.405), (-0.60, 1.285), (-0.615, 1.15), (-0.50, 1.12)], -0.15, 0.15, axis='X')
    paint(fin(hood, 0.02), "enamel")
    if not clean: stain_part(hood, lambda co: 0.22 + 0.50 * min(1.0, max(0.0, (1.33 - co.z) / 0.20)))
    lens = mesh.box("tp_cowl_lens", (0.23, 0.02, 0.032), (0.0, -0.612, 1.212))
    paint(fin(lens, 0.0), "lens")
    bez = mesh.box("tp_cowl_bezel", (0.27, 0.02, 0.07), (0.0, -0.604, 1.212))
    paint(fin(bez, 0.0), "steel_dark")
    out = [hood, bez, lens]
    for o in out: xf(hunch(o), M_BARREL())
    return out


# ---------------------------------------------------------------------------------------------------- the vents
def vent(tag, seed, clean):
    """One vent in its own frame: the face plane is y = 0 looking toward -Y, the opening is centred on the origin.
    Returns {'fixed': [bezel bars, cavity, knot collar, knot lobes], 'lid': [...], 'hinge': Vector, 'knot': Vector}.
    The lid hangs from a hinge along X at its top edge."""
    hw, hh = VENT_W / 2, VENT_H / 2
    fixed, lid = [], []
    # the dark cavity: five inward faces (darkest world colour; a knot's bezel)
    bm = mesh.new_bmesh()
    d = VENT_DEPTH
    c = [bm.verts.new(p) for p in ((-hw, 0, -hh), (hw, 0, -hh), (hw, 0, hh), (-hw, 0, hh), (-hw, d, -hh), (hw, d, -hh), (hw, d, hh), (-hw, d, hh))]
    for q in ((0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7), (4, 5, 6, 7)): bm.faces.new([c[i] for i in q])
    cav = mesh.new_mesh_object(f"tp_{tag}_cavity", bm)
    mesh.finish(cav, bevel=0.0, smooth_angle=30, weighted=False)
    if clean: bpy.data.objects.remove(cav, do_unlink=True)             # the cold unit's lids never open: nothing behind them
    else: fixed.append(paint(cav, "cable"))
    # the dark bezel: four bars, 15 mm proud
    for name, size, at in (("top", (VENT_W + 0.13, 0.045, 0.065), (0, 0.0075, hh + 0.0325)), ("bot", (VENT_W + 0.13, 0.045, 0.062), (0, 0.0075, -hh - 0.031)),
                           ("l", (0.065, 0.045, VENT_H), (-hw - 0.0325, 0.0075, 0)), ("r", (0.065, 0.045, VENT_H), (hw + 0.0325, 0.0075, 0))):
        b = mesh.box(f"tp_{tag}_bar_{name}", size, at)
        mesh.delete_faces(b, lambda f, cc, n: n.y > 0.9)
        fixed.append(paint_wear(paint(fin(b, 0.008, "steel_dark"), "steel_dark")))
    # the knot at the back of the cavity (lib: husk lobes, violet only in the emissive cells, white core, hex collar)
    k = knot.build_knot(0.22, collar='hex', seed=seed, lobes=5, name=f"tp_{tag}_knot")
    for o in (k["lobes"], k["collar"]):
        if o is k["collar"]: xf(o, Matrix.Diagonal((0.85, 1.0, 0.84, 1.0)))
        xf(o, Matrix.Translation((0, d, 0)))
    lob = k["lobes"]
    if clean:
        uv.map_to_palette(lob, "husk")                                   # the cold unit: nothing glows
    else:
        mark_emis(lob)
    vcol.set_colors(lob, vcol.get_colors(lob, "Color").copy(), "Mul")
    vcol.set_colors(k["collar"], vcol.get_colors(k["collar"], "Color").copy(), "Mul")
    mark_emis(k["collar"])                                               # keeps the lib's own shading (Color = Mul)
    if clean:
        for o in (k["collar"], lob): bpy.data.objects.remove(o, do_unlink=True)
    else: fixed += [k["collar"], lob]
    # the lid: dark back plate, the glow behind the slats, four ceramic slats with hairline gaps, a hinge barrel
    lw, lh = VENT_W - 0.012, VENT_H - 0.014
    back = mesh.box(f"tp_{tag}_lid_back", (lw, LID_BACK + 0.012, lh), (0, (LID_BACK - 0.012) / 2, 0))
    if tag == "chest":                                                   # a wedge: full depth at the hinge, a plate at the free edge.
        for v in back.data.vertices:                                     # Open, the chest lid's free edge must not hang into the sight
            if v.co.y > 0 and v.co.z < 0: v.co.y = 0.012                 # line from eye height down to the knot; the back knot is
        back.data.update()                                               # looked UP at, so the back lid keeps its full slab
    lid.append(paint(fin(back, 0.0), "steel_dark"))
    bm = mesh.new_bmesh()
    g = [bm.verts.new(p) for p in ((-lw / 2 + 0.01, -0.015, -lh / 2 + 0.008), (lw / 2 - 0.01, -0.015, -lh / 2 + 0.008), (lw / 2 - 0.01, -0.015, lh / 2 - 0.008), (-lw / 2 + 0.01, -0.015, lh / 2 - 0.008))]
    f = bm.faces.new(g); f.normal_update()
    if f.normal.y > 0: f.normal_flip()
    glow = mesh.new_mesh_object(f"tp_{tag}_lid_glow", bm)
    if clean: paint(glow, "steel_dark")
    else:
        paint(glow, "violet"); vcol.tint(glow, "husk"); mark_emis(glow)
    if clean: bpy.data.objects.remove(glow, do_unlink=True)
    else: lid.append(glow)
    gap = 0.016; sh = (lh - 3 * gap) / 4
    for i in range(4):
        z0 = -lh / 2 + i * (sh + gap)
        prof = [(-0.016, z0), (-0.030, z0), (-0.039, z0 + 0.012), (-0.039, z0 + sh - 0.012), (-0.030, z0 + sh), (-0.016, z0 + sh)]
        s = prism(f"tp_{tag}_slat{i}", prof, -lw / 2, lw / 2, axis='X')
        mesh.finish(s, bevel=0.0, smooth_angle=30)
        mesh.delete_faces(s, lambda f, cc, n: n.y > 0.9)
        paint(s, "enamel")
        if not clean:                                                    # each louvre stains toward its lower lip
            me = s.data; col = np.ones((len(me.loops), 4), dtype=np.float32)
            for li, l in enumerate(me.loops):
                t = (me.vertices[l.vertex_index].co.z - z0) / sh
                col[li, :3] = stain_mul(0.25 + 0.60 * (1.0 - t))
            vcol.set_colors(s, col, "Mul")
        lid.append(s)
    hinge = Vector((0.0, -0.028, hh + 0.004))
    hb = mesh.cylinder(f"tp_{tag}_hinge", 0.017, lw - 0.06, (0, 0, 0), segments=6, rot=Matrix.Rotation(math.radians(90), 4, 'Y'))
    xf(hb, Matrix.Translation(hinge))
    lid.append(paint(fin(hb, 0.0), "steel_dark"))
    return {"fixed": fixed, "lid": lid, "hinge": hinge, "knot": Vector((0.0, VENT_DEPTH - 0.16, 0.0))}


def chest_housing(clean, plumb=True):
    """The chest hatch housing. plumb (the fighting unit, world): a ceramic wedge box standing proud of the pitched
    barrel so its face is plumb and the open lid is a level awning. plumb=False (the cold unit, which stands its barrel
    upright): a low box seated flush on the drum like the back one, so the hatch is square to the barrel."""
    if not plumb:
        z0, z1 = CHEST_LOCAL_Z - VENT_H / 2 - 0.05, CHEST_LOCAL_Z + VENT_H / 2 + 0.05
        hs = mesh.box("tp_chest_housing", (0.60, 0.19, z1 - z0), (0.0, -(BACK_FACE_Y - 0.115), (z0 + z1) / 2))
        mesh.delete_faces(hs, lambda f, c, n: abs(n.y) > 0.9)
        for x in (-0.15, 0.15): mesh.bisect(hs, (x, 0, 0), (1, 0, 0))   # loops where the box leaves the drum (contact AO)
        for z in (z0 + 0.2, z1 - 0.2): mesh.bisect(hs, (0, 0, z), (0, 0, 1))
        paint(fin(hs, 0.02), "enamel")
        return [xf(hs, M_BARREL())]
    z0, z1 = CHEST_Z - VENT_H / 2 - 0.055, CHEST_Z + VENT_H / 2 + 0.055
    y = CHEST_FACE_Y + 0.02
    hs = prism("tp_chest_housing", [(-0.58, z1), (y, z1), (y, z0), (-0.70, z0 - 0.095), (-0.58, z0 - 0.095)], -0.30, 0.30, axis='X')
    mesh.delete_faces(hs, lambda f, c, n: abs(n.y) > 0.9)
    paint(fin(hs, 0.02), "enamel")
    out = [hs]
    if not clean:
        stain_part(hs, lambda co: 0.22 + 0.58 * min(1.0, max(0.0, (z1 - co.z) / (z1 - z0 + 0.095))) ** 0.8)
        for k, x in enumerate((-0.305, 0.305)):                          # the sides weep from the top corners
            out.append(streak(f"tp_chest_streak{k}", (x, y + 0.03, z1 - 0.02), (0, 0.18, -1), (0, 1, 0.18), (1 if x > 0 else -1, 0, 0), 0.34, 0.06))
    return out


def back_housing(clean):
    """The back hatch boss (barrel-local): a low ceramic box on the drum under the bezel."""
    z0, z1 = BACK_Z - VENT_H / 2 - 0.05, BACK_Z + VENT_H / 2 + 0.05
    hs = mesh.box("tp_back_housing", (0.60, 0.19, z1 - z0), (0.0, BACK_FACE_Y - 0.115, (z0 + z1) / 2))
    mesh.delete_faces(hs, lambda f, c, n: abs(n.y) > 0.9)
    for x in (-0.15, 0.15): mesh.bisect(hs, (x, 0, 0), (1, 0, 0))     # loops where the box leaves the drum: real contact AO
    for z in (z0 + 0.2, z1 - 0.2): mesh.bisect(hs, (0, 0, z), (0, 0, 1))
    paint(fin(hs, 0.02), "enamel")
    out = [hs]
    if not clean:
        stain_part(hs, lambda co: 0.25 + 0.55 * min(1.0, max(0.0, (z1 - co.z) / (z1 - z0))) ** 0.8)
        for k, x in enumerate((-0.2, 0.05, 0.24)):                       # under the sill
            out.append(streak(f"tp_back_streak{k}", (x, math.sqrt(0.65 ** 2 - x * x) , z0 - 0.005), (0, 0, -1), (1, 0, 0), (x, math.sqrt(0.65 ** 2 - x * x), 0), 0.11, 0.06, under=lambda co: min(1.0, wall_stain(co.x, co.y, co.z) + 0.12), shade=0.7))
    for o in out: xf(o, M_BARREL())
    return out


def M_CHEST(plumb=True):
    if not plumb: return M_BARREL() @ Matrix.Translation((0.0, -BACK_FACE_Y, CHEST_LOCAL_Z))
    return Matrix.Translation((0.0, CHEST_FACE_Y, CHEST_Z))


def M_BACK():
    return M_BARREL() @ Matrix.Translation((0.0, BACK_FACE_Y, BACK_Z)) @ Matrix.Rotation(math.pi, 4, 'Z')


# ---------------------------------------------------------------------------------------------------- brand
def plate_and_number(number):
    """The cast plate on the left shoulder (mark + bars standing in for the wordmark and number: one material, so no
    m_mask decals) and the asset number stencilled round the back, below the band. Barrel-local."""
    out = []
    pad = mesh.box("tp_plate_pad", (0.37, 0.05, 0.23), (0, 0.025, 0))
    paint(fin(pad, 0.0), "steel"); out.append(pad)
    pl = brand.maker_plate(None, name="tp_plate", decals=False)["plate"]
    out.append(pl)
    U = 0.032
    mk = brand.pellam_mark(U, relief=0.0, segments=6, name="tp_plate_mark", colour="steel_dark")
    xf(mk, Matrix.Translation((-0.16 + 0.03 + 1.22 * U, -0.007, brand.mark_centre_offset(U))))
    out.append(mk)
    bm = mesh.new_bmesh()
    for (x0, z0, x1, z1) in ((-0.045, 0.014, 0.132, 0.03), (-0.045, -0.034, 0.05, -0.012)):
        f = bm.faces.new([bm.verts.new(p) for p in ((x0, -0.007, z0), (x1, -0.007, z0), (x1, -0.007, z1), (x0, -0.007, z1))])
        f.normal_update()
        if f.normal.y > 0: f.normal_flip()
    bars = paint(mesh.new_mesh_object("tp_plate_bars", bm), "steel_dark"); out.append(bars)
    M = Matrix.Translation((0.66, 0.0, 0.88)) @ Matrix.Rotation(math.radians(90), 4, 'Z')
    for o in out: xf(o, M)
    # the stencilled asset number on the back: flat faces wrapped onto the drum, 2 mm off the enamel
    num = brand.numeral_mesh(number, 0.105, depth=0.0, name="tp_number", colour="steel_dark")
    R = R_BARREL + 0.003
    for v in num.data.vertices:
        t = math.radians(50.0) - v.co.x / R                               # read from behind: +x of the text goes toward -X
        v.co = Vector((R * math.sin(t), R * math.cos(t), v.co.z + 0.56))
    num.data.update()
    p0 = num.data.polygons[0]
    if p0.normal.dot(Vector((p0.center.x, p0.center.y, 0.0))) < 0: num.data.flip_normals()
    out.append(num)
    # the house style's third item (ART_BIBLE 5.6): one pictogram beside the number, "hand off" (an open hand, struck
    # through, in a square frame), stencilled the same way under it
    pic = pictogram_hand_off("tp_picto")
    for v in pic.data.vertices:
        t = math.radians(50.0) - v.co.x / R
        rr = R + (0.0015 if v.co.y < -1e-4 else 0.0)                     # the strike lies 1.5 mm over the hand
        v.co = Vector((rr * math.sin(t), rr * math.cos(t), v.co.z + 0.445))
    pic.data.update()
    p0 = pic.data.polygons[0]
    if p0.normal.dot(Vector((p0.center.x, p0.center.y, 0.0))) < 0: pic.data.flip_normals()
    out.append(pic)
    for o in out: xf(o, M_BARREL())
    return out


def pictogram_hand_off(name, s=0.12, colour="steel_dark"):
    """A stencil pictogram in the XZ plane, centred on the origin, `s` across: a square frame, an open hand (palm, four
    fingers, thumb) and a diagonal strike (its vertices carry y = -0.001 so the wrap can lift them). 22 triangles."""
    bm = mesh.new_bmesh()
    def quad(pts, lift=False):
        y = -0.001 if lift else 0.0
        bm.faces.new([bm.verts.new((x, y, z)) for (x, z) in pts])
    h, w = s / 2, s * 0.1
    for (x0, z0, x1, z1) in ((-h, h - w, h, h), (-h, -h, h, -h + w), (-h, -h + w, -h + w, h - w), (h - w, -h + w, h, h - w)):
        quad(((x0, z0), (x1, z0), (x1, z1), (x0, z1)))
    u = s / 0.12                                                          # the hand drawn on a 0.12 grid
    quad(((-0.022 * u, -0.036 * u), (0.022 * u, -0.036 * u), (0.022 * u, 0.0), (-0.022 * u, 0.0)))
    for k in range(4):
        x0 = (-0.022 + k * 0.0118) * u
        top = (0.030, 0.036, 0.034, 0.026)[k] * u
        quad(((x0, 0.0), (x0 + 0.0082 * u, 0.0), (x0 + 0.0082 * u, top), (x0, top)))
    quad(((-0.034 * u, -0.022 * u), (-0.022 * u, -0.028 * u), (-0.022 * u, -0.006 * u), (-0.036 * u, 0.006 * u)))
    d = 0.0075 * u
    quad(((-0.040 * u - d, -0.040 * u + d), (-0.040 * u + d, -0.040 * u - d), (0.040 * u + d, 0.040 * u - d), (0.040 * u - d, 0.040 * u + d)), lift=True)
    ob = mesh.new_mesh_object(name, bm)
    return paint(ob, colour)


# ---------------------------------------------------------------------------------------------------- pelvis, legs
def pelvis():
    out = []
    core = mesh.box("tp_pelvis", (0.46, 0.50, 0.30), (0.0, 0.03, 0.66))
    out.append(paint(fin(core, 0.02, "steel"), "steel"))
    ring = lathe("tp_socket", [(0.50, 0.70), (0.525, 0.735), (0.525, 0.80), (0.47, 0.83)], seg=10, phase=0.0)
    mesh.finish(ring, bevel=0.0, smooth_angle=30)
    out.append(paint(ring, "steel_dark"))
    cw = mesh.box("tp_counterweight", (0.42, 0.17, 0.27), (0.0, 0.36, 0.645))
    out.append(paint(fin(cw, 0.02, "steel_dark"), "steel_dark"))
    skid = prism("tp_skid", [(-0.22, 0.52), (-0.22, 0.74), (-0.30, 0.70), (-0.30, 0.58)], -0.17, 0.17, axis='X')
    out.append(paint(fin(skid, 0.0), "steel"))
    for k, x in enumerate((-0.14, 0.14)):
        out.append(bolt(f"tp_cw_bolt{k}", (x, 0.445, 0.70), (0, 1, 0), r=0.028, colour="steel"))
    for sx in (-1, 1):
        capd = prism(f"tp_hipcap_{'l' if sx > 0 else 'r'}", circ(0.13, 8, phase=22.5, c=(HIP_C.y, HIP_C.z)), sx * 0.555, sx * 0.60, axis='X')
        mesh.recalc_normals(capd)
        out.append(paint(fin(capd, 0.0), "steel_dark"))
    for o in out: paint_wear(o)
    return out


def thigh(sx, clean=False):
    tag = 'l' if sx > 0 else 'r'
    c = (HIP_C.y, HIP_C.z)
    prof = [(c[0] + 0.21 * math.cos(math.radians(a)), c[1] + 0.21 * math.sin(math.radians(a))) for a in range(0, 181, 30)] + [(c[0] - 0.17, 0.42), (c[0] + 0.17, 0.42)]
    x0, x1 = sorted((sx * 0.22, sx * 0.56))
    hs = prism(f"tp_thigh_{tag}", prof, x0, x1, axis='X')
    paint(fin(hs, 0.02, "steel"), "steel")
    # the telescoping post: steel, with a loop at the height the player sees it (between the thigh housing and the
    # ankle drum) so its contact AO is baked there instead of from its two buried ends
    post = xf(lathe(f"tp_post_{tag}", [(0.11, 0.18), (0.11, 0.37), (0.11, 0.60)], seg=8, phase=22.5), Matrix.Translation((sx * HIP_X, HIP_C.y, 0.0)))
    paint(fin(post, 0.0), "steel")
    guard = prism(f"tp_kneeguard_{tag}", [(c[0] - 0.15, 0.43), (c[0] - 0.19, 0.70), (c[0] - 0.245, 0.665), (c[0] - 0.215, 0.455)], sx * 0.25, sx * 0.53, axis='X')
    mesh.recalc_normals(guard)
    paint(fin(guard, 0.012), "enamel")
    if not clean: stain_part(guard, lambda co: 0.50 + 0.40 * min(1.0, max(0.0, (0.70 - co.z) / 0.27)))
    out = [hs, post, guard]
    for o in out: paint_wear(o)
    return out


def foot(sx):
    tag = 'l' if sx > 0 else 'r'
    y = HIP_C.y
    prof = [(y - 0.36, 0.035), (y + 0.24, 0.035), (y + 0.24, 0.12), (y + 0.16, 0.215), (y - 0.14, 0.215), (y - 0.36, 0.11)]
    x0, x1 = sorted((sx * (HIP_X - 0.25), sx * (HIP_X + 0.25)))
    body = prism(f"tp_foot_{tag}", prof, x0, x1, axis='X')
    paint(fin(body, 0.022, "steel"), "steel")
    sole = mesh.box(f"tp_sole_{tag}", (0.53, 0.63, 0.045), (sx * HIP_X, y - 0.06, 0.0225))
    mesh.delete_faces(sole, lambda f, c, n: n.z < -0.9)
    paint(fin(sole, 0.0), "steel_dark")
    drum = prism(f"tp_ankle_{tag}", circ(0.125, 8, phase=22.5, c=(y, ANKLE_Z + 0.02)), sx * (HIP_X - 0.19), sx * (HIP_X + 0.19), axis='X')
    mesh.recalc_normals(drum)
    paint(fin(drum, 0.0), "steel_dark")
    toe = mesh.box(f"tp_toe_{tag}", (0.40, 0.03, 0.05), (sx * HIP_X, y - 0.355, 0.075), rot=Matrix.Rotation(math.radians(-17), 4, 'X'))
    paint(fin(toe, 0.0), "steel_dark")
    out = [body, sole, drum, toe]
    for o in out: paint_wear(o)
    return out


# ---------------------------------------------------------------------------------------------------- the arms
def shoulder_housing():
    """The trunnion drum on the barrel's flat (world): the arm casing turns inside it, so it belongs to the barrel."""
    out = []
    c = (SHOULDER.y, SHOULDER.z)
    xo = ARM_X - 0.255                                                   # the drum's outer face, just past the casing
    # the trunnion rides high on the barrel's flat: its upper half stands above the crown (the hump), so both ends are seen
    drum = prism("tp_shoulder", circ(0.25, 16, c=c), xo, -0.44, axis='X', caps=(True, True))
    out.append(paint(fin(drum, 0.025, "steel"), "steel"))
    hub = prism("tp_shoulder_hub", circ(0.10, 8, c=c), xo - 0.015, xo, axis='X', caps=(True, False))
    out.append(paint(fin(hub, 0.0), "steel_dark"))
    for k in range(6):
        a = math.radians(30 + 60 * k)
        out.append(bolt(f"tp_shoulder_bolt{k}", (xo, c[0] + 0.175 * math.cos(a), c[1] + 0.175 * math.sin(a)), (-1, 0, 0), r=0.026))
    # the saddle the drum is bolted to: a steel cheek on the flat, under the drum, that the casing swings past
    sd = bl(FLAT_X, 0.0, SHOULDER_Z - 0.30)
    saddle = prism("tp_saddle", [(sd.y - 0.24, sd.z - 0.16), (sd.y + 0.24, sd.z - 0.16), (sd.y + 0.20, sd.z + 0.22), (sd.y - 0.20, sd.z + 0.22)], -0.475, -0.445, axis='X', caps=(True, False))
    out.append(paint(fin(saddle, 0.0), "steel_dark"))
    for o in out: paint_wear(o)
    return out


def arm_casing(clean):
    """arm_r_upper (arm-local, then to the world): the ceramic casing, steel collars, the guide rail, a slave cylinder."""
    out = []
    cs = prism("tp_casing", rrect(0.45, 0.45, 0.15), -MOUTH, 0.15, caps=(True, False), rows=(-0.95, -0.62, -0.31))
    mesh.finish(cs, bevel=0.0, smooth_angle=35)
    paint(cs, "enamel")
    if not clean:
        me = cs.data; col = np.ones((len(me.loops), 4), dtype=np.float32)
        for li, l in enumerate(me.loops):
            z = me.vertices[l.vertex_index].co.z
            col[li, :3] = stain_mul(casing_k(z))
        vcol.set_colors(cs, col, "Mul")
    out.append(cs)
    mouth = prism("tp_casing_mouth", rrect(0.50, 0.50, 0.175), -MOUTH - 0.03, -MOUTH + 0.11)
    mesh.finish(mouth, bevel=0.0, smooth_angle=35)
    out.append(paint(mouth, "steel"))
    band = prism("tp_casing_band", rrect(0.475, 0.475, 0.1625), -0.36, -0.27, caps=(False, False))
    mesh.finish(band, bevel=0.0, smooth_angle=35)
    out.append(paint(band, "steel"))
    rail = mesh.box("tp_rail", (0.045, 0.11, 0.62), (-0.245, 0.0, -0.69))
    mesh.delete_faces(rail, lambda f, c, n: n.x > 0.9)
    out.append(paint(fin(rail, 0.012, "steel_dark"), "steel_dark"))
    for k, z in enumerate((-0.44, -0.69, -0.94)):
        out.append(bolt(f"tp_rail_bolt{k}", (-0.2675, 0.0, z), (-1, 0, 0), r=0.024, colour="steel"))
    door = mesh.box("tp_casing_door", (0.20, 0.02, 0.30), (0.0, -0.228, -0.80))
    mesh.delete_faces(door, lambda f, c, n: n.y > 0.9)
    out.append(paint(fin(door, 0.0), "steel"))
    for k, (x, z) in enumerate(((-0.075, -0.68), (0.075, -0.92))):
        out.append(bolt(f"tp_door_bolt{k}", (x, -0.238, z), (0, -1, 0), r=0.018))
    cyl = xf(lathe("tp_slave", [(0.06, -1.02), (0.06, -0.69), (0.06, -0.36)], seg=8, phase=22.5), Matrix.Translation((0.0, 0.275, 0.0)))
    out.append(paint(fin(cyl, 0.0), "steel_dark"))
    for k, z in enumerate((-0.40, -0.98)):
        blk = mesh.box(f"tp_slave_block{k}", (0.17, 0.12, 0.09), (0.0, 0.265, z))
        out.append(paint(fin(blk, 0.0), "steel"))
    for o in out: paint_wear(o)
    if not clean:
        for k, (x, y, n, a, ln) in enumerate(((0.15, -0.227, (0, -1, 0), (1, 0, 0), 0.42), (-0.14, -0.227, (0, -1, 0), (1, 0, 0), 0.26), (-0.227, 0.14, (-1, 0, 0), (0, 1, 0), 0.36), (-0.227, -0.13, (-1, 0, 0), (0, 1, 0), 0.22))):
            out.append(streak(f"tp_arm_streak{k}", (x, y, -0.365), (0, 0, -1), a, n, ln * 1.4, 0.075, under=lambda co: casing_k(co.z)))
    for o in out: xf(o, M_ARM())
    return out


def M_HEAD():
    """arm-local: the tamping head's rake on the piston (about the neck, arm-local X): on the forward slam and at rest
    the arm leans forward of plumb, and the raked head puts its face flat on the floor there."""
    n = Vector((0.0, 0.0, -(HEAD_END - 0.25)))
    return Matrix.Translation(n) @ Matrix.Rotation(HEAD_RAKE, 4, 'X') @ Matrix.Translation(-n)


def ram():
    """arm_r_ram (arm-local): the steel piston (long enough to stay in the casing at every extension), its neck, and
    the square tamping head (raked, M_HEAD) with one broad hazard diagonal."""
    out = []
    hc = -(HEAD_END - 0.15)                                              # the head box's centre
    bot = -(HEAD_END - 0.25)                                             # the neck / the head's top face
    shaft = mesh.cylinder("tp_shaft", 0.08, SHAFT_TOP - bot, (0, 0, (SHAFT_TOP + bot) / 2), segments=10, cap=False)
    paint(fin(shaft, 0.0), "steel"); out.append(shaft)
    head_parts = []
    neck = mesh.cylinder("tp_neck", 0.15, 0.07, (0, 0, bot + 0.025), segments=10, radius_top=0.11)
    mesh.delete_faces(neck, lambda f, c, n: n.z < -0.9)
    head_parts.append(paint(fin(neck, 0.0), "steel_dark"))
    head = mesh.box("tp_head", (0.55, 0.55, 0.20), (0, 0, hc))
    for c in (-0.06, 0.20):                                              # two cuts each way: the diagonal band between them
        mesh.bisect(head, (c, 0, hc), (1, 0, 1))
        mesh.bisect(head, (0, c, hc), (0, 1, 1))
    fin(head, 0.02, "steel")
    paint(head, "steel")
    hz = lambda p: ((-0.06 < (p.center.x + (p.center.z - hc)) < 0.20 and abs(p.normal.y) > 0.9)
                    or (-0.06 < (p.center.y + (p.center.z - hc)) < 0.20 and abs(p.normal.x) > 0.9))
    uv.map_to_palette(head, "hazard", faces=hz); vcol.tint(head, "hazard", faces=hz)
    paint_wear(head)
    # the hazard keeps its colour on its own bevels: only steel edges are bare metal
    head_parts.append(head)
    shoe = mesh.box("tp_shoe", (0.57, 0.57, 0.05), (0, 0, -(HEAD_END - 0.025)))
    head_parts.append(paint_wear(paint(fin(shoe, 0.012, "steel_dark"), "steel_dark")))
    for k, (x, y) in enumerate(((-0.2, -0.2), (0.2, -0.2), (0.2, 0.2), (-0.2, 0.2))):
        head_parts.append(bolt(f"tp_head_bolt{k}", (x, y, bot), (0, 0, 1), r=0.03))
    for o in head_parts: xf(o, M_HEAD())
    out += head_parts
    for o in out: xf(o, M_ARM())
    return out


def arm_left(clean=False):
    """arm_l: the small counter-arm, a three-fingered clamp held tucked against the chest (built at its pivot)."""
    out = []
    kn = mesh.cylinder("tp_larm_knuckle", 0.095, 0.16, (0, 0.03, 0), segments=8, rot=Matrix.Rotation(math.radians(90), 4, 'X'))
    out.append(paint(fin(kn, 0.0), "steel_dark"))
    up = mesh.box("tp_larm_upper", (0.14, 0.14, 0.34), (0, -0.07, -0.17))
    out.append(paint(fin(up, 0.02), "enamel"))
    if not clean: stain_part(up, lambda co: 0.30 + 0.45 * min(1.0, max(0.0, -co.z / 0.34)))
    el = mesh.cylinder("tp_larm_elbow", 0.08, 0.18, (0, -0.07, -0.35), segments=8, rot=Matrix.Rotation(math.radians(90), 4, 'Y'))
    out.append(paint(fin(el, 0.0), "steel_dark"))
    E = Matrix.Translation((0, -0.07, -0.35)) @ Matrix.Rotation(math.radians(-38), 4, 'X')    # the forearm folds up and forward
    fa = mesh.box("tp_larm_fore", (0.10, 0.25, 0.10), (0, -0.155, 0))
    out.append(xf(paint(fin(fa, 0.015, "steel"), "steel"), E))
    palm = mesh.box("tp_larm_palm", (0.17, 0.06, 0.15), (0, -0.30, 0))
    out.append(xf(paint(fin(palm, 0.0), "steel_dark"), E))
    hook = [(-0.33, 0.0), (-0.42, 0.0), (-0.47, -0.05), (-0.445, -0.065), (-0.41, -0.03), (-0.33, -0.03)]     # (y, z): a hooked finger
    for k, (x, zo, flip) in enumerate(((-0.05, 0.065, False), (0.05, 0.065, False), (0.0, -0.065, True))):
        pr = [(y, (-z if flip else z) + zo) for (y, z) in hook]
        fg = prism(f"tp_larm_finger{k}", pr, x - 0.02, x + 0.02, axis='X')
        mesh.recalc_normals(fg); mesh.finish(fg, bevel=0.0, smooth_angle=30)
        out.append(xf(paint(fg, "steel"), E))
    for o in out: paint_wear(o)
    for o in out: xf(o, Matrix.Translation(LARM))
    return out


# ---------------------------------------------------------------------------------------------------- assembly
BONE_SPEC = None


def build_parts(clean=False, band="violet_band", number="4-141", chest_plumb=True):
    """Every part where it sits in the rest pose. Returns ({bone: [objects]}, info) with info = sockets and hinges
    in world space. chest_plumb=False seats the chest hatch flush on the drum (the cold unit, whose barrel stands
    upright) instead of plumb in the world (the fighting unit, pitched 15 degrees)."""
    parts = {b: [] for b in ("pelvis", "barrel", "arm_r_upper", "arm_r_ram", "arm_l", "leg_l_upper", "leg_l_foot", "leg_r_upper", "leg_r_foot", "vent_chest", "vent_back")}
    parts["barrel"] += barrel(clean, band) + cowl(clean) + shoulder_housing() + chest_housing(clean, chest_plumb) + back_housing(clean) + plate_and_number(number)
    info = {}
    for tag, M, seed in (("chest", M_CHEST(chest_plumb), 3), ("back", M_BACK(), 8)):
        v = vent(tag, seed, clean)
        for o in v["fixed"] + v["lid"]: xf(o, M)
        parts["barrel"] += v["fixed"]; parts["vent_" + tag] += v["lid"]
        info[f"vent_{tag}_hinge"] = M @ v["hinge"]
        info[f"vent_{tag}_down"] = (M.to_3x3() @ Vector((0, 0, -1))).normalized()
        info[f"vent_{tag}_out"] = (M.to_3x3() @ Vector((0, -1, 0))).normalized()
        info[f"vent_{tag}_knot"] = M @ v["knot"]
    parts["pelvis"] += pelvis()
    for sx, tag in ((1, "l"), (-1, "r")):
        parts[f"leg_{tag}_upper"] += thigh(sx, clean); parts[f"leg_{tag}_foot"] += foot(sx)
    parts["arm_r_upper"] += arm_casing(clean)
    parts["arm_r_ram"] += ram()
    parts["arm_l"] += arm_left(clean)
    info["ram_head"] = M_ARM() @ M_HEAD() @ Vector((0, 0, -HEAD_END))
    info["foot_spark"] = Vector((-HIP_X, HIP_C.y - 0.33, 0.02))
    return parts, info


def bake_ao_groups(parts, distance=0.5):
    """Vertex AO per rigid group, the other groups hidden: a moving part must not print its rest-pose shadow on its
    neighbour (the arm on the barrel's flat, the piston inside the casing)."""
    groups = [["barrel", "vent_chest", "vent_back"], ["pelvis", "leg_l_upper", "leg_l_foot", "leg_r_upper", "leg_r_foot"], ["arm_r_upper"], ["arm_r_ram"], ["arm_l"]]
    allobs = [o for b in parts for o in parts[b]]
    for g in groups:
        mine = [o for b in g for o in parts.get(b, [])]
        if not mine: continue
        for o in allobs: o.hide_render = o not in mine
        vcol.bake_ao_vertex(mine, distance=distance)
        for o in mine:
            if o.get("flat_ao"): vcol.fill_color(o, (1.0, 1.0, 1.0), "AO")        # ends buried in neighbours: would bake dark end to end
    for o in allobs: o.hide_render = False


def compose(ob, z_range=None, gradient=(0.78, 1.10), ao_strength=0.8):
    """COLOR_0 of the joined mesh: AO x height ramp (ratio mode: the palette cell is the colour), times the stain / wear
    multiplier; emissive faces keep their own shading."""
    me = ob.data
    mul = vcol.get_colors(ob, "Mul")[:, :3].copy() if "Mul" in me.color_attributes else np.ones((len(me.loops), 3), np.float32)
    em = np.zeros(len(me.polygons), dtype=np.int32)
    if "ks_emis" in me.attributes: me.attributes["ks_emis"].data.foreach_get("value", em)
    vcol.compose_vertex_color(ob, mode='ratio', gradient=gradient, ao_strength=ao_strength, jitter=0.0, z_range=z_range)
    col = vcol.get_colors(ob, "Color")
    pol = vcol.poly_of_loop(ob)
    e = em[pol] != 0
    col[:, :3] = np.where(e[:, None], mul, np.clip(col[:, :3] * mul, 0.0, 1.0))
    col[:, :3] = np.round(col[:, :3] * 32.0) / 32.0                    # coarse steps: the shipped file compresses far better
    vcol.set_colors(ob, col, "Color")
    if "ks_emis" in me.attributes: me.attributes.remove(me.attributes["ks_emis"])
    for v in me.vertices: v.co = Vector([round(c * 1024.0) / 1024.0 for c in v.co])     # a 1 mm lattice, same reason
    me.update()


# ---------------------------------------------------------------------------------------------------- skeleton
def bone_table(info):
    """[(name, head, tail, parent, roll?)] for rig.make_armature. The vent bones lie down their lids from the hinge and
    are rolled so that +X rotation about the bone's own X axis OPENS the lid (the convention code is written to)."""
    def vent_bone(tag):
        h = info[f"vent_{tag}_hinge"]; y = info[f"vent_{tag}_down"]; out = info[f"vent_{tag}_out"]
        x = y.cross(out).normalized()         # the hinge axis with the sign that swings `down` toward `out` for a positive turn
        # check: rotating y about x by +90 degrees gives x cross y, which must be `out`
        if x.cross(y).dot(out) < 0: x = -x
        z = x.cross(y).normalized()
        m = Matrix((x, y, z)).transposed()
        _, roll = bpy.types.Bone.AxisRollFromMatrix(m, axis=y)
        return (f"vent_{tag}", tuple(h), tuple(h + y * 0.3), "barrel", roll)
    u = (M_ARM().to_3x3() @ Vector((0, 0, -1))).normalized()
    mouth = SHOULDER + u * MOUTH
    t = [("root", (0, 0, 0), (0, 0, 0.2), None),
         ("pelvis", tuple(HIP_C), tuple(HIP_C + Vector((0, 0, 0.2))), "root"),
         ("barrel", tuple(PIV), tuple(bl(0, 0, 0.3)), "pelvis"),
         ("arm_r_upper", tuple(SHOULDER), tuple(SHOULDER + u * 0.4), "barrel"),
         ("arm_r_ram", tuple(mouth), tuple(mouth + u * 0.3), "arm_r_upper"),
         ("arm_l", tuple(LARM), tuple(LARM + Vector((0, 0, -0.25))), "barrel")]
    for sx, tag in ((1, "l"), (-1, "r")):
        t.append((f"leg_{tag}_upper", tuple(hip(sx)), tuple(hip(sx) + Vector((0, 0, -0.3))), "pelvis"))
        t.append((f"leg_{tag}_foot", tuple(ankle(sx)), tuple(ankle(sx) + Vector((0, -0.2, 0))), f"leg_{tag}_upper"))
    t += [vent_bone("chest"), vent_bone("back")]
    return t


PARENT = {"pelvis": None, "barrel": "pelvis", "arm_r_upper": "barrel", "arm_r_ram": "arm_r_upper", "arm_l": "barrel",
          "leg_l_upper": "pelvis", "leg_l_foot": "leg_l_upper", "leg_r_upper": "pelvis", "leg_r_foot": "leg_r_upper",
          "vent_chest": "barrel", "vent_back": "barrel"}
LEG_MIN, LEG_MAX = 0.33, 0.645                # hip -> ankle: the ankle drum slides on the post (rest 0.51) and never leaves it


def _about(p, R):
    return Matrix.Translation(p) @ R.to_4x4() @ Matrix.Translation(-Vector(p))


def _rx(d): return Matrix.Rotation(math.radians(d), 3, 'X')
def _ry(d): return Matrix.Rotation(math.radians(d), 3, 'Y')
def _rz(d): return Matrix.Rotation(math.radians(d), 3, 'Z')


CHANNELS = ("px", "py", "pz", "pp", "pr", "pw", "bp", "br", "bw", "as", "ao", "ae", "lp", "lr", "lw",
            "flx", "fly", "flz", "flp", "flw", "frx", "fry", "frz", "frp", "frw", "vc", "vb")


def solve(p, info=None):
    """A pose in plain numbers -> {bone: D}, D = the rigid transform (world, 4x4) that carries the bone's rest-pose
    geometry to the pose. Degrees and metres:
        px py pz   pelvis offset            pp pr pw   pelvis pitch (+ forward), roll (+ to its left, +X), yaw (+ left)
        bp br bw   barrel pitch, roll, yaw about the ball joint (on top of the pelvis)
        as ao ae   right arm: swing (+ forward / up), out (+ away from the body), ram extension (m, along the arm)
        lp lr lw   left arm pitch (+ forward / up), roll, yaw
        f?x f?y f?z f?p f?w   each foot IN THE WORLD: offset, pitch (+ toe down), yaw. The legs are solved to reach.
        vc vb      vent lids, degrees open (only for the three clips that key them; None = unkeyed)
    Also returns 'leg_len' = (left, right) hip-ankle distances for the telescoping check."""
    g = lambda k: float(p.get(k, 0.0) or 0.0)
    D = {}
    D["pelvis"] = Matrix.Translation((g("px"), g("py"), g("pz"))) @ _about(HIP_C, _rz(g("pw")) @ _ry(g("pr")) @ _rx(g("pp")))
    D["barrel"] = D["pelvis"] @ _about(PIV, _rz(g("bw")) @ _ry(g("br")) @ _rx(g("bp")))
    D["arm_r_upper"] = D["barrel"] @ _about(SHOULDER, _rx(-g("as")) @ _ry(g("ao")))
    u = (M_ARM().to_3x3() @ Vector((0, 0, -1))).normalized()
    D["arm_r_ram"] = D["arm_r_upper"] @ Matrix.Translation(u * g("ae"))
    D["arm_l"] = D["barrel"] @ _about(LARM, _rz(g("lw")) @ _ry(g("lr")) @ _rx(-g("lp")))
    lens = []
    for sx, tag in ((1, "l"), (-1, "r")):
        H, A = hip(sx), ankle(sx)
        off = Vector((g(f"f{tag}x"), g(f"f{tag}y"), g(f"f{tag}z")))
        D[f"leg_{tag}_foot"] = Matrix.Translation(off) @ _about(A, _rz(g(f"f{tag}w")) @ _rx(g(f"f{tag}p")))
        h = D["pelvis"] @ H; a = A + off
        Rp = D["pelvis"].to_3x3()
        d0 = (Rp @ (A - H)).normalized(); d1 = (a - h).normalized()
        Rt = d0.rotation_difference(d1).to_matrix() @ Rp
        D[f"leg_{tag}_upper"] = Matrix.Translation(h) @ Rt.to_4x4() @ Matrix.Translation(-H)
        lens.append((a - h).length)
    D["leg_len"] = tuple(lens)
    if info is not None:
        for tag, k in (("chest", "vc"), ("back", "vb")):
            ang = g(k)
            y = info[f"vent_{tag}_down"]; out = info[f"vent_{tag}_out"]
            x = y.cross(out).normalized()
            if x.cross(y).dot(out) < 0: x = -x
            D[f"vent_{tag}"] = D["barrel"] @ _about(info[f"vent_{tag}_hinge"], Matrix.Rotation(math.radians(ang), 3, x))
    return D


def ram_point(D, info):
    """World position of the tamping face's centre in pose D."""
    return D["arm_r_ram"] @ info["ram_head"]


def aim_ram(p, target, info):
    """Set `as` and `ae` of pose p so the tamping face's centre lands on `target` (world; the arm's plane is x = ARM_X:
    only y and z are aimed). Returns p."""
    q = dict(p); q["as"] = 0.0; q["ae"] = 0.0
    D = solve(q)
    s = D["arm_r_upper"] @ SHOULDER
    h = D["arm_r_ram"] @ info["ram_head"]
    v0 = Vector((0.0, h.y - s.y, h.z - s.z)); v1 = Vector((0.0, target[1] - s.y, target[2] - s.z))
    a0 = math.atan2(-v0.y, -v0.z); a1 = math.atan2(-v1.y, -v1.z)        # angle forward of straight down
    p = dict(p); p["as"] = math.degrees(a1 - a0); p["ae"] = v1.length - v0.length
    return p
