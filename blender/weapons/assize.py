"""The Assize six: the revolver's GUN geometry, built in GUN SPACE (helper of weapon_revolver.py and tx_gun.py).

GUN SPACE (Blender axes, authored in millimetres, scaled to metres per part):
    +Y  along the bore toward the muzzle; the bore is the Y axis (x = 0, z = 0)
    +Z  up (top strap, sights, hammer spur);  +X the gun's right side (loading gate, ejector housing)
    y = 0    front wall of the cylinder window (the barrel's breech);   y = 190   the muzzle crown
    y = -148 the heel of the butt  ->  0.345 m overall;   z = +16.5 (sight) .. -128 (butt)  ->  0.145 m tall
The cylinder turns about the line x = 0, z = CYL_Z (13 mm under the bore: a chamber at 12 o'clock is the bore).

`build()` returns the parts as separate mesh objects, each carrying
    ob["bone"]   the bone it is rigid-skinned to (gun, cylinder, hammer, trigger, gate, ejector, round_1 .. round_6)
    ob["part"]   an integer id (PARTS) the texture script keys its drawing on
    ob["role"]   0 blued steel, 1 walnut, 2 brass, 3 dark cavity
    ob["chart"]  how `unwrap()` charts it ('box', or 'cyl' = unrolled about a line parallel to Y) and ob["dens"], its
                 texel-density weight
Both scripts call build() + unwrap(): the unwrap is computed from the geometry alone, in a fixed order, so the texture
that tx_gun.py bakes and the UVs that weapon_revolver.py exports are the same layout.
"""
import bpy, bmesh, math
import numpy as np
from mathutils import Vector, Matrix
from mathutils.geometry import tessellate_polygon
from lib import mesh, scene

MM = 0.001
CYL_Z = -13.0                 # cylinder axis under the bore (mm)
CYL_R = 21.0                  # 42 mm across
CYL_Y0, CYL_Y1 = -42.2, -1.2  # 41 mm long, 1.2 mm gap to the barrel
CHAMBER_R = 13.0              # chamber circle
MUZZLE_Y = 190.0
HAMMER_PIVOT = (-72.0, -22.0)     # (y, z)
HAMMER_COCK = math.radians(48.0)  # full cock: the rest (idle) pose of the hammer part
TRIGGER_PIVOT = (-50.0, -42.0)
GATE_HINGE = (12.6, -30.4)        # (x, z) of the gate's hinge line (parallel to Y), at its lower edge
GATE_A0, GATE_A1 = 20.0, 150.0    # the gate's sector of the recoil shield, degrees clockwise from 12 o'clock seen from behind
SHIELD_R = 21.5
WEB_Y = -45.6                     # the face under the gate (carries the stamp)
MARK_C = (14.3, -20.6)            # (x, z) centre of the 9 mm stamp's bounding box on that face
MARK_H = 9.0
EJ_C = (9.6, -9.6)                # ejector housing axis (x, z)
SCREWS = [(-72.0, -22.0, 25.0), (-39.0, -40.2, 100.0), (-21.0, -40.2, 62.0)]   # (y, z, slot angle deg) on the LEFT side
PIN = (-131.0, -108.0)            # brass pin through the butt (y, z)
GRIP_AXIS = Vector((0.0, -0.44, -0.90)).normalized()

PARTS = ["barrel_oct", "barrel_round", "sight", "ejector_housing", "ejector_head", "base_pin", "cylinder", "frame", "shield",
         "web", "gate", "screws", "guard", "straps", "grip", "pin", "hammer", "trigger", "case_head"]
PID = {n: i for i, n in enumerate(PARTS)}
STEEL, WALNUT, BRASS, DARK = 0, 1, 2, 3


# ------------------------------------------------------------------ small geometry kit (millimetres)
def _new():
    bm = bmesh.new(); bm.loops.layers.uv.new("UVMap")
    return bm


def _face(bm, vs):
    try: return bm.faces.new(vs)
    except ValueError: return None


def lathe(bm, prof, seg, cx=0.0, cz=0.0, a0=0.0, a1=360.0, rfun=None, angles=None):
    """Rings about the line (x = cx, z = cz) parallel to Y. prof = [(y, r)]; r = 0 closes with an n-gon cap. Traced so
    that the solid lies on the inner side: rear cap -> outer surface toward +Y -> front face gives outward normals; a
    profile that turns back toward -Y at a smaller radius (a bore) faces the axis. Angles are degrees clockwise from
    +Z seen from behind (from -Y). `angles` = explicit list (a closed ring), else `seg` steps from a0 to a1.
    rfun(i, angle_deg, r) -> r lets a ring leave the circle (flutes). Returns the rings."""
    closed = angles is not None or abs((a1 - a0) - 360.0) < 1e-6
    if angles is None: angles = [a0 + (a1 - a0) * k / seg for k in range(seg if closed else seg + 1)]
    rings = []
    for i, (y, r) in enumerate(prof):
        if r <= 1e-9: rings.append(None); continue
        ring = []
        for a in angles:
            rr = rfun(i, a, r) if rfun else r
            t = math.radians(a)
            ring.append(bm.verts.new((cx + rr * math.sin(t), y, cz + rr * math.cos(t))))
        rings.append(ring)
    n = len(angles)
    for i in range(len(prof) - 1):
        A, B = rings[i], rings[i + 1]
        if A is None and B is None: continue
        if A is None:                                                       # a cap at the start (same winding rule as the strips)
            if closed: _face(bm, list(reversed(B)))
            continue
        if B is None:
            if closed: _face(bm, A)
            continue
        for k in range(n if closed else n - 1):
            k2 = (k + 1) % n
            _face(bm, (A[k], A[k2], B[k2], B[k]))
    return rings


def _area(poly):
    return 0.5 * sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1] for i in range(len(poly)))


def _inset(poly, c):
    """Offset a CCW polygon inward by c (mitred, limited)."""
    out = []; n = len(poly)
    for i in range(n):
        p0 = Vector(poly[i - 1]); p1 = Vector(poly[i]); p2 = Vector(poly[(i + 1) % n])
        d1 = (p1 - p0).normalized(); d2 = (p2 - p1).normalized()
        n1 = Vector((-d1.y, d1.x)); n2 = Vector((-d2.y, d2.x))
        k = 1.0 + n1.dot(n2)
        off = (n1 + n2) * (c / max(k, 0.45))
        out.append((p1.x + off.x, p1.y + off.y))
    return out


def prism(bm, outline, hw, chamfer=0.0, holes=(), x0=0.0):
    """A side profile [(y, z)] extruded along X to half-width hw about x0, the outer contour chamfered by `chamfer`
    (the caps are the inset outline). holes = [(y, z) loops] cut straight through."""
    if _area(outline) < 0: outline = list(reversed(outline))
    holes = [list(reversed(h)) if _area(h) > 0 else list(h) for h in holes]
    xs = [hw, hw - chamfer, -(hw - chamfer), -hw] if chamfer > 0 else [hw, -hw]
    loops = [(_inset(outline, chamfer) if chamfer > 0 and abs(x) > hw - 1e-9 else outline) for x in xs]
    rings = [[bm.verts.new((x0 + x, p[0], p[1])) for p in lp] for x, lp in zip(xs, loops)]
    n = len(outline)
    for a, b in zip(rings[:-1], rings[1:]):
        for i in range(n):
            j = (i + 1) % n
            _face(bm, (a[i], b[i], b[j], a[j]))
    hrings = []
    for h in holes:
        ha = [bm.verts.new((x0 + hw, p[0], p[1])) for p in h]; hb = [bm.verts.new((x0 - hw, p[0], p[1])) for p in h]
        for i in range(len(h)):
            j = (i + 1) % len(h)
            _face(bm, (ha[i], hb[i], hb[j], ha[j]))
        hrings.append((ha, hb))
    for side, ring in ((0, rings[0]), (1, rings[-1])):
        flat = [ring] + [hr[side] for hr in hrings]
        allv = [v for lp in flat for v in lp]
        tris = tessellate_polygon([[Vector((v.co.y, v.co.z, 0.0)) for v in lp] for lp in flat])
        want = 1.0 if side == 0 else -1.0
        for t in tris:
            a, b, c = (allv[k] for k in t)
            nx = (b.co - a.co).cross(c.co - a.co).x
            if abs(nx) < 1e-9: continue
            _face(bm, (a, b, c) if nx * want > 0 else (a, c, b))
    return rings


def sweep(bm, path, hw, t, x0=0.0, faces=(True, True, True, True), close_ends=True):
    """A strap: rectangular section (2 hw wide in X, t thick) swept along a path [(y, z)] in the Y-Z plane; the path is
    the strap's OUTER face (to the right of travel), the thickness goes inward. faces = (outer, +x side, inner, -x side)."""
    n = len(path); rows = []
    for i in range(n):
        p = Vector(path[i]); a = Vector(path[max(i - 1, 0)]); b = Vector(path[min(i + 1, n - 1)])
        d = (b - a).normalized(); nin = Vector((-d.y, d.x))                 # left of travel = inward
        q = p + nin * t
        rows.append([bm.verts.new((x0 + hw, p.x, p.y)), bm.verts.new((x0 - hw, p.x, p.y)),
                     bm.verts.new((x0 - hw, q.x, q.y)), bm.verts.new((x0 + hw, q.x, q.y))])
    for i in range(n - 1):
        A, B = rows[i], rows[i + 1]
        for k in range(4):
            if not faces[k]: continue
            k2 = (k + 1) % 4
            _face(bm, (A[k], A[k2], B[k2], B[k]))
    if close_ends:
        _face(bm, list(reversed(rows[0]))); _face(bm, rows[-1])
    return rows


def chaikin(pts, it=1, keep_ends=True):
    for _ in range(it):
        out = [pts[0]] if keep_ends else []
        for a, b in zip(pts[:-1], pts[1:]):
            out.append((a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25))
            out.append((a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75))
        if keep_ends: out.append(pts[-1])
        pts = out
    return pts


def arc(c, r, a0, a1, n):
    """Points on a circle in a 2-D plane: angle in degrees counter-clockwise from the first axis."""
    return [(c[0] + r * math.cos(math.radians(a0 + (a1 - a0) * k / n)), c[1] + r * math.sin(math.radians(a0 + (a1 - a0) * k / n))) for k in range(n + 1)]


def _finish(bm, name, bone, part, role=STEEL, chart="box", dens=1.0, bevel=0.0, smooth=35.0, recalc=False, flip=False, **props):
    if recalc: bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    if flip: bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    bmesh.ops.scale(bm, vec=(MM, MM, MM), verts=bm.verts[:])
    ob = mesh.new_mesh_object(name, bm)
    mesh.finish(ob, bevel=bevel * MM, segments=1, smooth_angle=smooth, weighted=True)
    ob["bone"] = bone; ob["part"] = PID[part]; ob["role"] = role; ob["chart"] = chart; ob["dens"] = dens
    for k, v in props.items(): ob[k] = v
    return ob


def _cut(ob, cutters):
    """Boolean difference with box cutters [(min, max)] in millimetres (exact solver), applied."""
    for i, (mn, mx) in enumerate(cutters):
        c = mesh.box(f"_cut{i}", [(mx[k] - mn[k]) * MM for k in range(3)], [(mx[k] + mn[k]) * 0.5 * MM for k in range(3)])
        m = ob.modifiers.new("cut", 'BOOLEAN'); m.operation = 'DIFFERENCE'; m.object = c; m.solver = 'EXACT'
        mesh.apply_modifiers(ob)
        scene.remove(c)
    return ob


def rot_x(p, pivot, ang):
    """Rotate (y, z) about `pivot` by `ang` about +X (positive: what is above the pivot goes back)."""
    y, z = p[0] - pivot[0], p[1] - pivot[1]
    return (pivot[0] + y * math.cos(ang) - z * math.sin(ang), pivot[1] + y * math.sin(ang) + z * math.cos(ang))


# ------------------------------------------------------------------ the parts
def barrel():
    out = []
    # octagonal rear: 19 mm across the flats, flats at 0, 45 ... (one faces straight up)
    R = 9.5 / math.cos(math.radians(22.5))
    bm = _new()
    lathe(bm, [(16.0, R), (110.0, R), (110.0, 0.0)], 8, a0=22.5, a1=382.5)
    out.append(_finish(bm, "g_barrel_oct", "gun", "barrel_oct", chart="cyl", dens=1.3, bevel=0.7, cyl=(0.0, 0.0), seam=157.5, sym=4))
    # turned round front with a shoulder ring, a recessed crown and a dark bore 14 mm deep
    bm = _new()
    prof = [(109.6, 9.3), (111.4, 9.3), (112.3, 8.85), (187.6, 8.85), (189.4, 7.9), (190.0, 7.0), (188.7, 5.7), (176.0, 5.7), (176.0, 0.0)]
    lathe(bm, prof, 32)                                                     # release pass p0 (R14): 24 -> 32
    out.append(_finish(bm, "g_barrel_round", "gun", "barrel_round", chart="cyl", dens=1.1, cyl=(0.0, 0.0), seam=180.0, sym=4))
    # blade front sight, 7 mm high, 2.5 mm thick
    bm = _new()
    top = 8.85
    prism(bm, [(170.5, top - 0.8), (187.3, top - 0.8), (186.4, top + 3.2), (184.2, top + 6.0), (181.0, top + 7.0), (177.5, top + 6.7), (174.0, top + 4.6), (171.6, top + 1.6)], 1.25)
    out.append(_finish(bm, "g_sight", "gun", "sight", dens=1.4, bevel=0.4, mirror=1))
    return out


def ejector():
    out = []
    bm = _new()
    lathe(bm, [(17.0, 5.2), (160.0, 5.2), (164.2, 4.5), (165.6, 3.0), (165.6, 0.0)], 16, cx=EJ_C[0], cz=EJ_C[1], a0=15.0, a1=375.0)
    out.append(_finish(bm, "g_ejector_housing", "gun", "ejector_housing", chart="cyl", dens=1.0, cyl=EJ_C, seam=315.0, sym=3))
    # pass i2: the one screw that holds the housing to the barrel, a low domed head on its outer flank near the breech
    bm = _new()
    ax = Vector((0.80, 0.0, -0.60)); c0 = Vector((EJ_C[0], 31.0, EJ_C[1])) + ax * 5.0
    u = Vector((0.0, 1.0, 0.0)); w = ax.cross(u)
    rs = []
    for (h, r) in ((0.0, 2.5), (0.75, 2.5), (1.25, 1.7)):
        rs.append([bm.verts.new(c0 + ax * h + u * (r * math.cos(2 * math.pi * k / 10)) + w * (r * math.sin(2 * math.pi * k / 10))) for k in range(10)])
    for A, B in zip(rs[:-1], rs[1:]):
        for k in range(10): _face(bm, (A[k], A[(k + 1) % 10], B[(k + 1) % 10], B[k]))
    _face(bm, rs[-1])
    out.append(_finish(bm, "g_ejector_screw", "gun", "screws", dens=2.0, recalc=True, smooth=50.0))
    # the crescent head of the rod: a curved thumb-piece wrapped round the outside of the housing near its front
    bm = _new()
    a0, a1, n = 65.0, 205.0, 6
    ri, ro, y0, y1 = 5.0, 8.3, 149.0, 156.5
    rings = []
    for (y, r) in ((y0, ri), (y0, ro - 0.8), (y0 + 0.8, ro), (y1 - 0.8, ro), (y1, ro - 0.8), (y1, ri)):
        ring = []
        for k in range(n + 1):
            a = math.radians(a0 + (a1 - a0) * k / n)
            w = 1.0 - 0.55 * abs(2.0 * k / n - 1.0) ** 2.2                 # the crescent thins toward its horns
            rr = ri + (r - ri) * w
            ring.append(bm.verts.new((EJ_C[0] + rr * math.sin(a), y, EJ_C[1] + rr * math.cos(a))))
        rings.append(ring)
    for A, B in zip(rings[:-1], rings[1:]):
        for k in range(n): _face(bm, (A[k], A[k + 1], B[k + 1], B[k]))
    _face(bm, [r[0] for r in rings]); _face(bm, [r[-1] for r in reversed(rings)])
    out.append(_finish(bm, "g_ejector_head", "ejector", "ejector_head", dens=1.2, recalc=True))
    # base pin head under the barrel
    bm = _new()
    lathe(bm, [(17.0, 3.1), (26.2, 3.1), (26.6, 3.9), (30.0, 3.9), (30.6, 3.0), (30.6, 0.0)], 6, cx=0.0, cz=CYL_Z - 2.0)
    out.append(_finish(bm, "g_base_pin", "gun", "base_pin", chart="cyl", dens=0.9, cyl=(0.0, CYL_Z), seam=180.0))
    return out


FLUTE_HALF = 16.5
FLUTE_DEPTH = 3.1
# release pass p0 (R14): ten stations a sector (it was six: a flute was three flat facets), four along the flute's run-in
CYL_ANGLES = [60.0 * s + a for s in range(6) for a in (0.0, 7.0, 13.5, 16.5, 20.5, 25.0, 30.0, 35.0, 39.5, 43.5, 46.5, 53.0)]


def _flute(a):
    """Depth of the flute scallop (0..1) at angle a: flutes are centred between the chambers (30 + 60 n)."""
    d = abs(((a - 30.0) % 60.0 + 30.0) % 60.0 - 30.0)
    if d >= FLUTE_HALF - 1e-6: return 0.0
    x = d / FLUTE_HALF
    return (1.0 - x * x) ** 0.75


def cylinder():
    bm = _new()
    #        y            r           flute depth factor
    body = [(CYL_Y0, CYL_R - 0.9, 0.0), (CYL_Y0 + 0.8, CYL_R, 0.0), (-27.5, CYL_R, 0.0), (-26.6, CYL_R, 0.22), (-25.2, CYL_R, 0.55), (-23.7, CYL_R, 0.84), (-22.0, CYL_R, 1.0),
            (CYL_Y1 - 0.7, CYL_R, 1.0), (CYL_Y1, CYL_R - 0.6, 1.0)]
    depth = {i: b[2] for i, b in enumerate(body)}
    rings = lathe(bm, [(b[0], b[1]) for b in body], 36, cz=CYL_Z, angles=CYL_ANGLES,
                  rfun=lambda i, a, r: r - FLUTE_DEPTH * depth[i] * _flute(a))
    _face(bm, list(reversed(rings[0])))                                     # rear face (chambers are drawn; case heads sit on it)
    _face(bm, rings[-1])                                                    # front face
    lathe(bm, [(CYL_Y0 - 2.0, 0.0), (CYL_Y0 - 2.0, 4.6), (CYL_Y0 + 0.2, 5.4)], 16, cz=CYL_Z)       # ratchet hub
    lathe(bm, [(CYL_Y1 - 0.2, 4.6), (CYL_Y1 + 0.9, 4.2), (CYL_Y1 + 0.9, 0.0)], 12, cz=CYL_Z)       # front bushing
    return [_finish(bm, "g_cylinder", "cylinder", "cylinder", chart="cyl", dens=1.3, cyl=(0.0, CYL_Z), seam=0.0, smooth=30.0, sym=3)]


FRAME_HW = 9.5
# (y, r) about the cylinder's axis, rear -> rim: the recoil shield's rear face and chamfer (pass i1)
SHIELD_FLARE = [(-51.8, 8.6), (-51.8, 19.3), (-50.6, 20.9), (-49.0, SHIELD_R)]
# Polish round 4 (both critics: "an open wrench jaw"): the frame's rear is a high rounded hump (the ears either side of the
# hammer slot) instead of a slope that fell away under the cocked hammer; the hammer nests in its notch.
# Pass i1 (both visual reviewers: "a domed back", "closer to a ray gun than a classic revolver"): that hump carried the top
# strap's line 45 mm behind the cylinder and hid all but 4 mm of the cocked hammer: seen from behind-left the rear of the
# gun was one helmet. The frame now falls away behind the window as a single action's does (the standing breech, then the
# ears sloping to the back strap), and the slim hammer of round 4 stands 10 to 18 mm proud of it: the spur is a spur.
FRAME_OUT = [(20.0, 15.5), (-47.6, 15.5), (-52.6, 14.4), (-57.6, 11.2), (-63.5, 7.0), (-71.0, 3.2), (-79.0, 0.0), (-87.0, -3.2), (-94.0, -7.0),
             (-99.6, -12.0), (-103.6, -19.0), (-102.6, -32.0), (-99.0, -36.5), (-74.0, -47.0), (-50.0, -43.4), (-2.0, -42.0),
             (5.0, -41.0), (11.0, -37.4), (16.0, -31.0), (19.0, -23.5), (20.0, -15.0)]
WINDOW = [(-1.2, 8.6), (0.0, 7.4), (0.0, -33.8), (-1.2, -35.0), (-43.4, -35.0), (-44.6, -33.8), (-44.6, 7.4), (-43.4, 8.6)]


def frame():
    out = []
    bm = _new()
    # release pass p0 (R14): the hump and the tail are rounded once more (their facets showed along the skyline)
    outline = FRAME_OUT[:1] + chaikin(FRAME_OUT[1:15], 1) + FRAME_OUT[15:]
    prism(bm, outline, FRAME_HW, chamfer=2.4, holes=[WINDOW])     # polish round 4: 1.5 -> 2.4, the top strap reads rounded, not as a flat plate
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bmesh.ops.scale(bm, vec=(MM, MM, MM), verts=bm.verts[:])
    ob = mesh.new_mesh_object("g_frame", bm)
    _cut(ob, [((-3.3, -110.0, -31.0), (3.3, -48.6, 30.0)),                 # the hammer slot through the standing breech
              ((-1.15, -56.0, 13.9), (1.15, 26.0, 20.0))])                 # the sighting groove along the top strap
    b2 = bmesh.new(); b2.from_mesh(ob.data)                                 # coplanar cap triangles -> clean polygons
    bmesh.ops.remove_doubles(b2, verts=b2.verts[:], dist=1e-6)
    bmesh.ops.dissolve_limit(b2, angle_limit=math.radians(0.6), verts=b2.verts[:], edges=b2.edges[:])
    bmesh.ops.triangulate(b2, faces=[f for f in b2.faces if len(f.verts) > 4], quad_method='BEAUTY', ngon_method='BEAUTY')
    b2.to_mesh(ob.data); b2.free()
    mesh.finish(ob, bevel=0.55 * MM, segments=1, smooth_angle=35, weighted=True)
    ob["bone"] = "gun"; ob["part"] = PID["frame"]; ob["role"] = STEEL; ob["chart"] = "box"; ob["dens"] = 1.25; ob["mirror"] = 1
    out.append(ob)
    # recoil shield: the left lobe (the right lobe is the loading gate over its web)
    bm = _new()
    # pass i1 (both visual reviewers: "a large smooth dome", "a domed back"): the left lobe was a 12 mm pill with a round
    # shoulder, as fat as the cylinder: seen from behind-left it was the biggest form of the gun. It is now what a single
    # action's recoil shield is: a turned disc 7 mm thick with a flat rear face and a crisp chamfer (the face carries the
    # turning rings of tx_gun_detail), so the eye reads a machined flange, not a casting, and the cylinder stands proud of it.
    sp = SHIELD_FLARE + [(-45.5, SHIELD_R), (-44.6, SHIELD_R - 0.8), (-44.6, 9.0)]
    lathe(bm, sp, 20, cz=CYL_Z, a0=198.0, a1=342.0)                         # release pass p0: 8 -> 20 steps
    out.append(_finish(bm, "g_shield_l", "gun", "shield", chart="box", dens=1.2, smooth=40.0))
    # the web under the gate: a flat face at WEB_Y with a bite where the chamber shows; it carries the stamp
    bm = _new()
    pc = (CHAMBER_R * math.sin(math.radians(60.0)), CYL_Z + CHAMBER_R * math.cos(math.radians(60.0))); pr = 6.9
    xw = FRAME_HW - 0.3
    dz = math.sqrt(pr * pr - (xw - pc[0]) ** 2)
    pts = [(SHIELD_R * 0.985 * math.sin(math.radians(a)), CYL_Z + SHIELD_R * 0.985 * math.cos(math.radians(a))) for a in [GATE_A0 + (GATE_A1 - GATE_A0) * k / 13 for k in range(14)]]
    pts += [(xw, pts[-1][1]), (xw, pc[1] - dz)]
    a_lo = math.degrees(math.atan2(-dz, xw - pc[0])); a_hi = math.degrees(math.atan2(dz, xw - pc[0]))
    pts += [(pc[0] + pr * math.cos(math.radians(a)), pc[1] + pr * math.sin(math.radians(a))) for a in [a_lo + (a_hi - a_lo) * k / 10 for k in range(1, 10)]]
    pts += [(xw, pc[1] + dz), (xw, pts[0][1])]
    vs = [bm.verts.new((p[0], WEB_Y, p[1])) for p in pts]
    for t in tessellate_polygon([[Vector((p[0], p[1], 0.0)) for p in pts]]):
        a, b, c = (vs[k] for k in t)
        ny = (b.co - a.co).cross(c.co - a.co).y
        _face(bm, (a, b, c) if ny < 0 else (a, c, b))                       # faces -Y (toward the shooter)
    # the wall of the bite, from the web forward to the cylinder's rear
    bite = vs[15:26]
    fw = [bm.verts.new((v.co.x, CYL_Y0 - 0.3, v.co.z)) for v in bite]
    for k in range(len(bite) - 1): _face(bm, (bite[k], bite[k + 1], fw[k + 1], fw[k]))
    out.append(_finish(bm, "g_web", "gun", "web", dens=3.6, recalc=False))
    return out


def gate():
    """The loading gate: the right lobe of the recoil shield, hinged at its lower edge, with a thumb lip."""
    bm = _new()
    sp = [(WEB_Y - 0.3, 9.4), (WEB_Y - 0.3, SHIELD_R - 0.7), (WEB_Y - 1.0, SHIELD_R), (-52.4, SHIELD_R), (-54.1, 20.8), (-55.4, 19.6), (-56.2, 17.8), (-56.6, 16.0), (-56.6, 9.4)]
    rings = lathe(bm, sp, 18, cz=CYL_Z, a0=GATE_A0, a1=GATE_A1)
    _face(bm, [r[0] for r in rings]); _face(bm, [r[-1] for r in reversed(rings)])      # the two radial ends
    for k in range(18): _face(bm, (rings[-1][k], rings[-1][k + 1], rings[0][k + 1], rings[0][k]))   # the inner (frame-side) wall
    # thumb lip: a small raised nail-catch on the outer edge, high on the gate
    a = math.radians(52.0)
    c = Vector((SHIELD_R * math.sin(a), -50.6, CYL_Z + SHIELD_R * math.cos(a)))
    rad = Vector((math.sin(a), 0.0, math.cos(a))); tan = Vector((math.cos(a), 0.0, -math.sin(a)))
    lip = []
    for (dy, dr, dt) in ((-2.2, -0.6, -3.4), (2.2, -0.6, -3.4), (2.2, -0.6, 3.4), (-2.2, -0.6, 3.4), (-1.5, 1.5, -2.6), (1.5, 1.5, -2.6), (1.5, 1.5, 2.6), (-1.5, 1.5, 2.6)):
        lip.append(bm.verts.new(c + Vector((0, dy, 0)) + rad * dr + tan * dt))
    for q in ((4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)): _face(bm, [lip[i] for i in q])
    return [_finish(bm, "g_gate", "gate", "gate", dens=1.5, recalc=True, smooth=40.0, bevel=0.0)]


def screws():
    out = []
    for i, (y, z, ang) in enumerate(SCREWS):
        bm = _new()
        x = -FRAME_HW
        ring0 = [bm.verts.new((x + 0.2, y + 2.8 * math.cos(2 * math.pi * k / 12), z + 2.8 * math.sin(2 * math.pi * k / 12))) for k in range(12)]
        ring2 = [bm.verts.new((x - 0.75, y + 2.3 * math.cos(2 * math.pi * k / 12), z + 2.3 * math.sin(2 * math.pi * k / 12))) for k in range(12)]
        for k in range(12): _face(bm, (ring0[k], ring0[(k + 1) % 12], ring2[(k + 1) % 12], ring2[k]))
        _face(bm, ring2)
        out.append(_finish(bm, f"g_screw_{i + 1}", "gun", "screws", dens=2.2, recalc=True, smooth=50.0))
    return out


GUARD_PATH = [(-21.0, -41.0), (-23.0, -51.5), (-27.5, -61.5), (-34.5, -69.0), (-43.5, -73.2), (-53.0, -73.0), (-61.5, -68.5), (-67.5, -61.0), (-71.0, -52.0), (-72.5, -44.5)]
FRONT_STRAP = [(-71.5, -45.0), (-74.3, -57.0), (-78.3, -71.0), (-83.8, -87.0), (-90.5, -103.0), (-97.5, -117.5), (-103.5, -129.0)]
BUTT = [(-103.5, -129.0), (-119.0, -126.8), (-136.0, -121.2), (-151.0, -113.0)]
BACK_STRAP = [(-151.0, -113.0), (-144.5, -106.0), (-134.0, -93.5), (-124.5, -78.5), (-116.5, -62.0), (-111.0, -46.0), (-108.0, -32.0), (-106.0, -22.0), (-103.2, -15.0)]


def strap(bm, path, hw, t, ch=0.8, inner=True, x0=0.0):
    """A strap with chamfered outer corners swept along a path [(y, z)] whose points are its OUTER face; the solid lies
    to the left of travel. Section: outer face, two chamfers, two sides (and the inner face)."""
    n = len(path); rows = []
    for i in range(n):
        p = Vector(path[i]); a = Vector(path[max(i - 1, 0)]); b = Vector(path[min(i + 1, n - 1)])
        d = (b - a).normalized(); nin = Vector((-d.y, d.x))
        q = p + nin * ch; r = p + nin * t
        sec = [(hw - ch, p), (-(hw - ch), p), (-hw, q), (-hw, r), (hw, r), (hw, q)]
        rows.append([bm.verts.new((x0 + x, v.x, v.y)) for x, v in sec])
    for A, B in zip(rows[:-1], rows[1:]):
        for k in range(6):
            if k == 3 and not inner: continue
            k2 = (k + 1) % 6
            _face(bm, (A[k], A[k2], B[k2], B[k]))
    _face(bm, list(reversed(rows[0]))); _face(bm, rows[-1])
    return rows


def guard_and_straps():
    out = []
    bm = _new()
    strap(bm, list(reversed(chaikin(GUARD_PATH, 1))), 6.2, 3.0, ch=0.9)       # release pass p0: the bow is rounded once more
    out.append(_finish(bm, "g_guard", "gun", "guard", dens=0.9, smooth=40.0, mirror=1))
    bm = _new()
    strap(bm, list(reversed(chaikin(FRONT_STRAP, 1) + BUTT[1:] + chaikin(BACK_STRAP, 1)[1:])), 5.7, 3.2, ch=0.9, inner=False)
    out.append(_finish(bm, "g_straps", "gun", "straps", dens=0.8, smooth=40.0, mirror=1))
    return out


GRIP_ROWS = 12       # release pass p0 (R14): 8 -> 12 stations down the grip, 7 -> 9 across each panel


def _grip_sections():
    """Stations down the grip: (front strap point, back strap point) pairs, top to butt."""
    fs = [(-70.0, -40.0)] + FRONT_STRAP; bs = [(-102.5, -30.0)] + list(reversed(BACK_STRAP))[3:]
    def along(path, n):
        L = [0.0]
        for a, b in zip(path[:-1], path[1:]): L.append(L[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
        out = []
        for k in range(n):
            s = L[-1] * k / (n - 1); i = max(j for j in range(len(L)) if L[j] <= s + 1e-9); i = min(i, len(path) - 2)
            t = (s - L[i]) / max(L[i + 1] - L[i], 1e-9)
            out.append((path[i][0] + (path[i + 1][0] - path[i][0]) * t, path[i][1] + (path[i + 1][1] - path[i][1]) * t))
        return out
    return list(zip(along(fs, GRIP_ROWS), along(bs, GRIP_ROWS)))


def grip():
    """One-piece walnut between the straps: two swelling panels, a flat butt, proud of the steel by a hair."""
    out = []
    secs = _grip_sections()
    half8 = [8.8, 12.4, 14.2, 15.0, 15.0, 14.6, 14.0, 13.2]              # half thickness down the grip (the palm swell)
    half = [float(np.interp(i * 7.0 / (GRIP_ROWS - 1), range(8), half8)) for i in range(GRIP_ROWS)]
    us = [0.0, 0.06, 0.16, 0.32, 0.5, 0.68, 0.84, 0.94, 1.0]
    bm = _new()
    for side in (1.0, -1.0):
        rows = []
        for (f, b), h in zip(secs, half):
            row = []
            for u in us:
                w = (1.0 - abs(2.0 * u - 1.0) ** 2.6) ** 0.55                # lens section: flat in the middle, tucked at the straps
                x = side * (5.2 + (h - 5.2) * w)
                L = math.hypot(b[0] - f[0], b[1] - f[1]); uu = (3.3 + (L - 6.6) * u) / L     # the wood sits INSIDE the straps
                y = f[0] + (b[0] - f[0]) * uu; z = f[1] + (b[1] - f[1]) * uu
                # keep the wood just inside the straps' outer faces
                row.append(bm.verts.new((x, y, z)))
            rows.append(row)
        for A, B in zip(rows[:-1], rows[1:]):
            for k in range(len(us) - 1):
                q = (A[k], A[k + 1], B[k + 1], B[k])
                _face(bm, q if side > 0 else tuple(reversed(q)))
        # the butt end of the panel, closed down to the strap
        last = rows[-1]
        f = _face(bm, last if side < 0 else list(reversed(last)))
        f.normal_update()
        if f.normal.dot(GRIP_AXIS) < 0: bmesh.ops.reverse_faces(bm, faces=[f])
    out.append(_finish(bm, "g_grip", "gun", "grip", role=WALNUT, dens=0.85, recalc=False, smooth=60.0, mirror=1))
    bmesh_clean(out[-1])
    # the brass pin through the butt (the only brass on the gun)
    for side in (1.0, -1.0):
        bm = _new()
        x = side * 13.55
        r0 = [bm.verts.new((x - side * 0.6, PIN[0] + 1.5 * math.cos(2 * math.pi * k / 8), PIN[1] + 1.5 * math.sin(2 * math.pi * k / 8))) for k in range(8)]
        r1 = [bm.verts.new((x + side * 0.35, PIN[0] + 1.5 * math.cos(2 * math.pi * k / 8), PIN[1] + 1.5 * math.sin(2 * math.pi * k / 8))) for k in range(8)]
        for k in range(8): _face(bm, (r0[k], r0[(k + 1) % 8], r1[(k + 1) % 8], r1[k]))
        _face(bm, r1)
        out.append(_finish(bm, "g_pin_r" if side > 0 else "g_pin_l", "gun", "pin", role=BRASS, dens=2.0, recalc=True, smooth=50.0, share="pin", mirror=1))
    return out


def bmesh_clean(ob):
    """Drop loose vertices."""
    bm = bmesh.new(); bm.from_mesh(ob.data)
    loose = [v for v in bm.verts if not v.link_faces]
    if loose: bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bm.to_mesh(ob.data); bm.free()


# Polish round 4: a slim neck and a low spur. At full cock the old hammer was a 15 mm thick wedge whose spur stood 20 mm
# above and 18 mm behind the frame (the upper prong of the "wrench"); this one lies back along the frame's hump, its
# crest 4 mm and its spur 2 to 3 mm above the steel. HAMMER[7] stays the top of the spur (revolver_anim reads it).
# Pass i1: with the frame's hump gone the cocked hammer is in the skyline. Its face is cut down (the nose lies inside the
# slot; at full cock it leaves the frame at the standing breech) and its top is one arc from the nose to the spur, the
# spur thickening into the body: a horn, not the two prongs the tall face and the thin spur bar made.
HAMMER = [(-48.8, -8.0), (-48.8, 0.5), (-50.6, 4.6), (-54.2, 8.8), (-58.8, 12.6), (-64.0, 16.0), (-69.5, 18.8), (-75.0, 20.4), (-79.6, 21.0),
          (-81.4, 19.6), (-80.4, 17.6), (-75.0, 15.2), (-70.0, 11.8), (-66.6, 7.4), (-65.0, 2.4), (-65.0, -3.0), (-67.0, -10.0), (-76.0, -19.0), (-77.0, -29.0), (-66.0, -30.0), (-57.5, -20.0)]
HAMMER_HW = 2.9            # 5.8 mm in a 6.6 mm slot (it was 9 in 9.6: the slot split the frame's rear into two thin prongs)


def hammer():
    """Built DOWN (against the frame), then turned back to full cock about its screw: the rest pose is the idle pose."""
    bm = _new()
    prism(bm, HAMMER, HAMMER_HW, chamfer=0.7)
    # the thumb-piece. Pass i2 (the visual reviewer: "the hammer spur ends in a comb of long teeth ... reads as a saw"):
    # round 1's three bars and pass i1's five ribs were geometry, and at 3 px a rib they drew a comb on the skyline of the
    # frame every second. The spur is now what a single action's is: one low pad, 8.6 mm wide over the 5.8 mm neck, that
    # follows the spur's curve and rolls up a little at its end; its chequering is cut in tx_gun_detail (gun_tex.py), fine
    # and shallow, and shows as a matt patch, never as teeth.
    top = HAMMER[5:9]                                                        # the spur's top line, body -> tip (HAMMER[7] is its crest)
    path = [(top[0][0] * 0.35 + top[1][0] * 0.65, top[0][1] * 0.35 + top[1][1] * 0.65), top[1], ((top[1][0] + top[2][0]) * 0.5, (top[1][1] + top[2][1]) * 0.5 + 0.1), top[2], top[3], (top[3][0] - 1.5, top[3][1] + 0.55)]
    up = []; dn = []
    for i, q in enumerate(path):
        a = Vector(path[max(i - 1, 0)]); b = Vector(path[min(i + 1, len(path) - 1)]); d = (b - a).normalized(); nrm = Vector((-d.y, d.x))
        if nrm.y < 0: nrm = -nrm
        k = 0.55 if i in (0, len(path) - 1) else 1.0                        # the pad thins at both ends
        up.append(Vector(q) + nrm * 0.38 * k); dn.append(Vector(q) - nrm * 0.75)
    prism(bm, [(v.x, v.y) for v in up] + [(v.x, v.y) for v in reversed(dn)], 4.3, chamfer=0.7)
    # the fixed firing pin on the face
    lathe(bm, [(-48.9, 1.5), (-46.6, 0.7), (-46.6, 0.0)], 6, cx=0.0, cz=0.6)
    ob = _finish(bm, "g_hammer", "hammer", "hammer", dens=1.5, bevel=0.0, recalc=True, smooth=40.0, mirror=1)
    piv = Vector((0.0, HAMMER_PIVOT[0] * MM, HAMMER_PIVOT[1] * MM))
    ob.data.transform(Matrix.Translation(piv) @ Matrix.Rotation(HAMMER_COCK, 4, 'X') @ Matrix.Translation(-piv))
    return [ob]


TRIGGER = [(-46.6, -43.0), (-46.2, -52.0), (-47.6, -60.0), (-50.6, -66.2), (-52.8, -65.4), (-51.0, -59.0), (-50.2, -51.0), (-53.6, -43.0)]


def trigger():
    bm = _new()
    prism(bm, TRIGGER, 2.6, chamfer=0.6)
    return [_finish(bm, "g_trigger", "trigger", "trigger", dens=1.0, recalc=True, smooth=40.0, mirror=1)]


def chamber_centre(i):
    """(x, z) of chamber i (0 = under the hammer, clockwise seen from behind)."""
    a = math.radians(60.0 * i)
    return (CHAMBER_R * math.sin(a), CYL_Z + CHAMBER_R * math.cos(a))


def case_heads():
    """The six case heads on the cylinder's rear face (round_1 .. round_6): rim 13 mm, proud 1.6 mm."""
    out = []
    for i in range(6):
        cx, cz = chamber_centre(i)
        bm = _new()
        lathe(bm, [(CYL_Y0 + 0.1, 6.5), (CYL_Y0 - 1.3, 6.5), (CYL_Y0 - 1.6, 6.1), (CYL_Y0 - 1.6, 0.0)], 12, cx=cx, cz=cz, a0=15.0, a1=375.0)
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
        out.append(_finish(bm, f"g_case_head_{i + 1}", f"round_{i + 1}", "case_head", role=BRASS, dens=1.6, smooth=50.0, chart="cyl", cyl=(cx, cz), seam=15.0, sym=12, share="case_head"))
    return out


def build():
    """All gun parts, gun space, metres. Deterministic order."""
    parts = barrel() + ejector() + cylinder() + frame() + gate() + screws() + guard_and_straps() + grip() + hammer() + trigger() + case_heads()
    bpy.context.view_layer.update()
    return parts


# ------------------------------------------------------------------ the unwrap (deterministic, computed from geometry)
BOX_DIRS = [Vector(d) for d in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1))]


def _basis(n):
    """Two in-plane axes for a projection along n (deterministic)."""
    ref = Vector((0, 1, 0)) if abs(n.y) < 0.9 else Vector((1, 0, 0))
    u = (ref - n * ref.dot(n)).normalized(); v = n.cross(u)
    return u, v


def _islands_of(ob):
    """[(loop uvs {loop index: (u, v)} METRES, density, signature | None)] for one part.
    ob["mirror"] = 1 folds the part about x = 0: an island on the left takes the UVs of its mirror image, so the two
    share texels (the drawing is symmetric there). ob["sym"] = n folds a 'cyl' chart n times round its axis."""
    me = ob.data
    bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table(); bm.normal_update()
    kind = ob.get("chart", "box"); dens = float(ob.get("dens", 1.0)); mirror = bool(ob.get("mirror", 0)); sym = int(ob.get("sym", 1))
    cls = {}
    if kind == "cyl":
        cx, cz = [c * MM for c in ob["cyl"]]
        for f in bm.faces:
            if abs(f.normal.y) > 0.75: cls[f.index] = 2 if f.normal.y > 0 else 3
            else: cls[f.index] = 100
    else:
        for f in bm.faces:
            cls[f.index] = max(range(6), key=lambda k: (round(f.normal.dot(BOX_DIRS[k]), 4), -k))
    order = sorted(bm.faces, key=lambda f: tuple(round(c, 6) for c in f.calc_center_median()) + (round(f.calc_area(), 10),))
    seen = set(); islands = []
    for seed in order:
        if seed.index in seen: continue
        grp = [seed]; seen.add(seed.index); stack = [seed]
        while stack:
            f = stack.pop()
            for e in f.edges:
                for g in e.link_faces:
                    if g.index not in seen and cls[g.index] == cls[seed.index]:
                        seen.add(g.index); grp.append(g); stack.append(g)
        uvs = {}; sig = None
        c = cls[seed.index]
        if c == 100:
            seam = math.radians(float(ob.get("seam", 180.0)))
            rref = max(math.hypot(v.co.x - cx, v.co.z - cz) for f in grp for v in f.verts)
            step = 2 * math.pi / sym
            for f in grp:
                fc = f.calc_center_median(); ac = (math.atan2(fc.x - cx, fc.z - cz) - seam) % (2 * math.pi)
                fold = math.floor(ac / step + 1e-6) * step if sym > 1 else 0.0
                for l in f.loops:
                    a = (math.atan2(l.vert.co.x - cx, l.vert.co.z - cz) - seam) % (2 * math.pi)
                    if a - ac > math.pi: a -= 2 * math.pi
                    elif ac - a > math.pi: a += 2 * math.pi
                    uvs[l.index] = (l.vert.co.y, (a - fold) * rref)
            if ob.get("share"): sig = (ob["share"], 100)
        else:
            cen = Vector((0, 0, 0)); area = 0.0
            for f in grp:
                fa = f.calc_area(); cen += f.calc_center_median() * fa; area += fa
            cen /= max(area, 1e-12)
            flip = mirror and cen.x < -2e-5
            n = BOX_DIRS[c].copy()
            if flip: n.x = -n.x
            u, v = _basis(n)
            for f in grp:
                for l in f.loops:
                    p = l.vert.co.copy()
                    if flip: p.x = -p.x
                    uvs[l.index] = (p.dot(u), p.dot(v))
            if ob.get("share"): sig = (ob["share"], [k for k in range(6) if (BOX_DIRS[k] - n).length < 1e-6][0])
            elif mirror and abs(cen.x) > 2e-5:
                us = [q[0] for q in uvs.values()]; vs = [q[1] for q in uvs.values()]
                dirk = [k for k in range(6) if (BOX_DIRS[k] - n).length < 1e-6][0]
                sig = (ob.name, dirk, round(min(us) / 4e-5), round(min(vs) / 4e-5), round(max(us) / 4e-5), round(max(vs) / 4e-5))
        islands.append((uvs, dens, sig))
    bm.free()
    return islands


PAD = 3.0          # pixels of gutter round every island at 1024 x 512


def _pack(sizes, W, H, scale):
    """Skyline (bottom-left) packing of rectangles [(w, h, density)] metres at `scale` px/m, each with PAD px all round.
    Deterministic. Returns [(x, y, rotated)] in pixels (top-left origin) or None when they do not fit."""
    items = []
    for i, (w, h, d) in enumerate(sizes):
        pw = w * d * scale + 2 * PAD; ph = h * d * scale + 2 * PAD; rot = False
        if ph > pw: pw, ph = ph, pw; rot = True
        items.append((ph, pw, i, rot))
    order = sorted(items, key=lambda t: (-round(t[0], 4), -round(t[1], 4), t[2]))
    out = [None] * len(sizes)
    sky = [[0.0, 0.0, float(W)]]                      # x, y, width
    for ph, pw, i, rot in order:
        if pw > W or ph > H: return None
        best = None
        for k in range(len(sky)):
            x = sky[k][0]
            if x + pw > W + 1e-6: break
            y = 0.0; j = k; left = pw
            while left > 1e-9:
                y = max(y, sky[j][1]); left -= sky[j][2]; j += 1
                if j >= len(sky) and left > 1e-9: y = None; break
            if y is None or y + ph > H + 1e-6: continue
            if best is None or (y + ph, x) < (best[0] + ph, best[1]): best = (y, x, k)
        if best is None: return None
        y, x, k = best
        out[i] = (x, y, rot)
        new = [x, y + ph, pw]; end = x + pw
        rest = []
        for seg in sky[k:]:
            if seg[0] + seg[2] <= end + 1e-9: continue
            if seg[0] < end: rest.append([end, seg[1], seg[0] + seg[2] - end])
            else: rest.append(seg)
        sky = sky[:k] + [new] + rest
    return out


def unwrap(parts, W=1024, H=512):
    """Give every part its UV0 on the shared 1024 x 512 sheet. Returns the texel density reached (px per metre at
    density weight 1). Blender UVs (origin bottom-left). Mirror-image islands of a part with ob["mirror"] share texels."""
    from lib import uv as uvl
    all_islands = []            # (part index, uvs, dens, (umin, vmin, w, h), slot)
    slots = {}; sizes = []
    for pi, ob in enumerate(parts):
        uvl.ensure_layers(ob)
        for uvs, dens, sig in _islands_of(ob):
            us = [p[0] for p in uvs.values()]; vs = [p[1] for p in uvs.values()]
            box = (min(us), min(vs), max(max(us) - min(us), 1e-5), max(max(vs) - min(vs), 1e-5))
            if sig is not None and sig in slots: slot = slots[sig]
            else:
                slot = len(sizes); sizes.append((box[2], box[3], dens))
                if sig is not None: slots[sig] = slot
            all_islands.append((pi, uvs, dens, box, slot))
    lo, hi = 200.0, 12000.0
    for _ in range(36):
        mid = (lo + hi) / 2
        if _pack(sizes, W, H, mid) is None: hi = mid
        else: lo = mid
    scale = lo; place = _pack(sizes, W, H, scale)
    arrays = [uvl.get(ob).copy() for ob in parts]
    for (pi, uvs, dens, (u0, v0, w, h), slot) in all_islands:
        x, y, rot = place[slot]
        a = arrays[pi]; s = dens * scale
        for li, (u, v) in uvs.items():
            pu = (u - u0) * s; pv = (v - v0) * s
            if rot: pu, pv = pv, pu
            a[li] = ((x + PAD + pu) / W, 1.0 - (y + PAD + pv) / H)
    for ob, a in zip(parts, arrays): uvl.put(ob, a)
    used = sum((w * d * scale + 2 * PAD) * (h * d * scale + 2 * PAD) for w, h, d in sizes) / (W * H)
    print(f"UNWRAP {len(all_islands)} islands in {len(sizes)} slots, {scale:.0f} px/m at weight 1, {100 * used:.0f} % of the sheet")
    return scale
