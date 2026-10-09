"""dress_common: the modelling and painting kit shared by the props_dress asset scripts (art-props-dress owns this
folder; a helper imported by an asset script is recorded in its <raw>.deps.json, so editing this file rebuilds them).

Blender space throughout: +Z up, an asset's FRONT is -Y, metres. Everything is built at world coordinates with the
object origin at the world origin (= the asset's pivot), so joined parts need no transform.

Painting model (ART_BIBLE 4.5, m_prop):  shown colour = palette cell (UV0) x COLOR_0.
    paint(part, cell, colour)   UV0 -> `cell`; remembers the cell's colour ("Cell") and the colour the part should
                                really have ("Tint": a palette name, a hex or linear rgb; default the cell itself).
                                `colour` must not be lighter than the cell in any channel (COLOR_0 only darkens): pick
                                a pale cell (chalk, linen, sand_pale, enamel) for a part whose dust skirt, bleach or
                                highlight has to rise above its base colour.
    bake_ao(objs)               Cycles AO to vertex colour, with a temporary ground so feet get a contact shadow.
    compose(ob, ...)            COLOR_0 = Tint x AO x height ramp x dust skirt x bleach x jitter x painters / Cell.
"""
import bpy, bmesh, math
import numpy as np
from mathutils import Vector, Matrix, Euler
from lib import scene, mesh, uv, material, vcol, export, manifest

CELL = "Cell"
TINT = vcol.TINT
PARTID = "ks_part"            # per-face int: which part a face came from (per-part value jitter)
_part_counter = [0]


# ------------------------------------------------------------------------------------------------ geometry
def _obj(name, bm):
    bm.normal_update()
    ob = mesh.new_mesh_object(name, bm)
    return ob


def lathe(name, profile, seg=8, phase=0.0, sx=1.0, sy=1.0, centre=(0.0, 0.0, 0.0), cap_first=False, cap_last=False,
          warp=None, sweep=None):
    """Revolve `profile` [(r, z), ...] about +Z. Walk the profile so that the surface is on your LEFT hand's outside:
    up the outside, over the rim, down the inside (normals then face outward / inward / up correctly).
    r == 0 makes a pole (a triangle fan). cap_first / cap_last close an open end ring with one n-gon (n - 2 tris).
    sx, sy squash the section; phase rotates it (radians); warp(Vector) -> Vector deforms every vertex (dents, lean).
    sweep = (a0, a1) radians revolves a partial arc with seg segments (open ends)."""
    bm = mesh.new_bmesh()
    cx, cy, cz = centre
    full = sweep is None
    n = seg if full else seg + 1
    rings = []
    for (r, z) in profile:
        if r <= 1e-9:
            rings.append([bm.verts.new((cx, cy, cz + z))])
        else:
            ring = []
            for k in range(n):
                a = phase + (2 * math.pi * k / seg if full else sweep[0] + (sweep[1] - sweep[0]) * k / seg)
                ring.append(bm.verts.new((cx + math.cos(a) * r * sx, cy + math.sin(a) * r * sy, cz + z)))
            rings.append(ring)
    m = seg
    for i in range(len(rings) - 1):
        a, b = rings[i], rings[i + 1]
        for k in range(m):
            j = (k + 1) % n if full else k + 1
            if len(a) == 1 and len(b) == 1: continue
            if len(a) == 1: bm.faces.new((a[0], b[j], b[k]))
            elif len(b) == 1: bm.faces.new((a[k], a[j], b[0]))
            else: bm.faces.new((a[k], a[j], b[j], b[k]))
    if cap_first and len(rings[0]) > 2: bm.faces.new(list(reversed(rings[0])))
    if cap_last and len(rings[-1]) > 2: bm.faces.new(rings[-1])
    if warp is not None:
        for v in bm.verts: v.co = Vector(warp(v.co.copy()))
    return _obj(name, bm)


def tube(name, pts, r=0.01, sides=4, cap=True, closed=False, phase=0.0, flat=None, up=None):
    """Sweep an n-sided section along the polyline `pts` (wire handles, bails, cords, straps, hoops).
    r = radius, or one per point. flat = (a, b) scales the section's two axes (a strap: flat=(1, 0.25)); `up` is the
    direction the section's first axis starts along (kept by parallel transport). closed joins the last point to the
    first. Outward normals."""
    P = [Vector(p) for p in pts]
    n = len(P)
    rs = list(r) if isinstance(r, (list, tuple)) else [r] * n
    fa, fb = flat if flat is not None else (1.0, 1.0)
    T = []
    for i in range(n):
        if closed: t = P[(i + 1) % n] - P[i - 1]
        elif i == 0: t = P[1] - P[0]
        elif i == n - 1: t = P[-1] - P[-2]
        else: t = (P[i + 1] - P[i]).normalized() + (P[i] - P[i - 1]).normalized()
        T.append(t.normalized())
    ref = Vector(up) if up is not None else (Vector((0, 0, 1)) if abs(T[0].z) < 0.9 else Vector((1, 0, 0)))
    nrm = (ref - T[0] * ref.dot(T[0])).normalized()
    bm = mesh.new_bmesh()
    rings = []
    for i in range(n):
        if i > 0:                                                    # parallel transport of the frame
            ax = T[i - 1].cross(T[i])
            if ax.length > 1e-9:
                ang = T[i - 1].angle(T[i])
                nrm = (Matrix.Rotation(ang, 3, ax.normalized()) @ nrm)
            nrm = (nrm - T[i] * nrm.dot(T[i])).normalized()
        b = T[i].cross(nrm).normalized()
        ring = []
        for k in range(sides):
            a = phase + 2 * math.pi * k / sides
            ring.append(bm.verts.new(P[i] + nrm * (math.cos(a) * rs[i] * fa) + b * (math.sin(a) * rs[i] * fb)))
        rings.append(ring)
    m = n if closed else n - 1
    for i in range(m):
        a, b2 = rings[i], rings[(i + 1) % n]
        for k in range(sides):
            j = (k + 1) % sides
            bm.faces.new((a[k], a[j], b2[j], b2[k]))
    if cap and not closed and sides > 2:
        bm.faces.new(list(reversed(rings[0]))); bm.faces.new(rings[-1])
    return _obj(name, bm)


def beam(name, p0, p1, wide, thick, up=(0, 0, 1), segs=1, cap=(True, True), taper=1.0, sag=0.0, snap=(0.0, 0.0), twist=0.0, drop=()):
    """A straight board / baulk / pole from p0 to p1 with a rectangular section: `wide` along `up` (made perpendicular
    to the run), `thick` across. segs = segments along it (give long boards 3-6: vertex AO and the zone's vertex light
    sample only at vertices). cap = (start, end) end faces. taper = width and thickness scale at p1. sag = how far
    the middle hangs along -up. snap = (start, end): a BROKEN end: its four corners are pushed along the run by up to
    this much, unevenly (a splintered break). twist = radians of wind over the length.
    drop = sides to leave out: 'up', 'down' (the two THIN edges, looking along +up / -up), 'front', 'back' (the two
    WIDE faces; 'front' looks along run x up)."""
    a = Vector(p0); b = Vector(p1)
    t = (b - a).normalized()
    u = Vector(up); u = (u - t * u.dot(t))
    if u.length < 1e-6: raise ValueError("beam: `up` is parallel to the run")
    u.normalize(); w = t.cross(u).normalized()
    bm = mesh.new_bmesh()
    rings = []
    corners = ((1, 1), (-1, 1), (-1, -1), (1, -1))                      # (up, across)
    snaps = (0.9, -0.5, 0.35, -1.0)
    for i in range(segs + 1):
        f = i / segs
        c = a.lerp(b, f) - u * (sag * math.sin(math.pi * f))
        k = 1.0 + (taper - 1.0) * f
        ang = twist * f
        uu = u * math.cos(ang) + w * math.sin(ang); ww = t.cross(uu).normalized()
        ring = []
        for q, (su, sw) in enumerate(corners):
            p = c + uu * (su * wide / 2 * k) + ww * (sw * thick / 2 * k)
            if i == 0 and snap[0]: p = p + t * (snap[0] * snaps[q])
            if i == segs and snap[1]: p = p + t * (snap[1] * snaps[q])
            ring.append(bm.verts.new(p))
        rings.append(ring)
    side_of = {0: "front", 1: "down", 2: "back", 3: "up"}             # the face between corner q and q + 1
    made = []
    for i in range(segs):
        r0, r1 = rings[i], rings[i + 1]
        axis = sum((v.co for v in r0 + r1), Vector()) / 8.0
        for q in range(4):
            if side_of[q] in drop: continue
            j = (q + 1) % 4
            f = bm.faces.new((r0[q], r0[j], r1[j], r1[q])); made.append((f, axis, None))
    if cap[0]: made.append((bm.faces.new(list(reversed(rings[0]))), None, -t))
    if cap[1]: made.append((bm.faces.new(rings[-1]), None, t))
    bm.normal_update()
    for f, axis, want in made:
        d = (f.calc_center_median() - axis) if axis is not None else want
        if f.normal.dot(d) < 0: f.normal_flip()
    return _obj(name, bm)


_FACES = {"-x": (0, 3, 7, 4), "+x": (1, 5, 6, 2), "-y": (0, 4, 5, 1), "+y": (3, 2, 6, 7), "-z": (0, 1, 2, 3), "+z": (4, 7, 6, 5)}


def box(name, size, centre=(0, 0, 0), rot=None, taper=(1.0, 1.0), drop=(), shear=(0.0, 0.0)):
    """A box of full extents `size` at `centre`. taper = (x, y) scale of the +Z face (posts taper, boards thin);
    shear = (x, y) offset of the +Z face (a lean); rot = Euler angles (radians) about the box centre;
    drop = faces to leave out, by LOCAL normal: '-z' (the bottom nobody sees), '+y' (against a wall) ..."""
    sx, sy, sz = size[0] / 2, size[1] / 2, size[2] / 2
    tx, ty = taper
    co = [(-sx, -sy, -sz), (sx, -sy, -sz), (sx, sy, -sz), (-sx, sy, -sz),
          (-sx * tx + shear[0], -sy * ty + shear[1], sz), (sx * tx + shear[0], -sy * ty + shear[1], sz),
          (sx * tx + shear[0], sy * ty + shear[1], sz), (-sx * tx + shear[0], sy * ty + shear[1], sz)]
    R = Euler(rot, 'XYZ').to_matrix() if rot is not None else Matrix.Identity(3)
    c = Vector(centre)
    bm = mesh.new_bmesh()
    vs = [bm.verts.new(c + R @ Vector(p)) for p in co]
    for key, idx in _FACES.items():
        if key in drop: continue
        f = bm.faces.new([vs[i] for i in idx])
    ob = _obj(name, bm)
    _fix_winding_box(ob, c, R)
    return ob


def _fix_winding_box(ob, c, R):
    """Make every face of an open box point away from the box centre."""
    bm = bmesh.new(); bm.from_mesh(ob.data)
    for f in bm.faces:
        if f.normal.dot(f.calc_center_median() - c) < 0: f.normal_flip()
    bm.to_mesh(ob.data); bm.free()


def prism(name, outline, depth, axis='y', centre=0.0, cap_front=True, cap_back=True, sides=True):
    """Extrude a flat polygon. outline = [(a, b), ...] wound COUNTER-CLOCKWISE as seen from the front of the axis:
    axis 'y': points are (x, z), seen from -Y (the asset's front); axis 'z': (x, y) seen from above;
    axis 'x': (y, z) seen from +X. `depth` is the thickness, centred on `centre` along the axis."""
    bm = mesh.new_bmesh()
    h = depth / 2
    def P(a, b, d):
        if axis == 'y': return (a, centre + d, b)
        if axis == 'z': return (a, b, centre + d)
        return (centre + d, a, b)
    sgn = -1 if axis == 'y' else 1                                    # which way is "front" along the axis
    fr = [bm.verts.new(P(a, b, sgn * h)) for (a, b) in outline]
    bk = [bm.verts.new(P(a, b, -sgn * h)) for (a, b) in outline]
    n = len(outline)
    if cap_front: bm.faces.new(fr)
    if cap_back: bm.faces.new(list(reversed(bk)))
    if sides:
        for k in range(n):
            j = (k + 1) % n
            bm.faces.new((fr[j], fr[k], bk[k], bk[j]))
    ob = _obj(name, bm)
    _outward(ob)
    return ob


def _outward(ob):
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(ob.data); bm.free()


def poly(name, pts, double=False):
    """Flat faces from 3D points: `pts` = one polygon [(x, y, z), ...] (counter-clockwise seen from its visible side) or
    a list of polygons. double=True adds the same faces reversed (a sheet seen from both sides)."""
    polys = pts if isinstance(pts[0][0], (list, tuple, Vector)) else [pts]
    bm = mesh.new_bmesh()
    for pl in polys:
        vs = [bm.verts.new(p) for p in pl]
        bm.faces.new(vs)
        if double: bm.faces.new([bm.verts.new(p) for p in reversed(pl)])
    return _obj(name, bm)


def sheet(name, nu, nv, fn, double=False, back_offset=0.0, flip=False):
    """A parametric surface: fn(u, v) -> (x, y, z) for u, v in 0..1, nu x nv quads. Front = the side from which u
    runs to the right and v up... i.e. normal = dP/du x dP/dv. double=True adds the back (reversed, pushed
    `back_offset` m behind along the normal) so cloth and paper are seen from both sides under back-face culling."""
    bm = mesh.new_bmesh()
    def grid(off):
        g = []
        for j in range(nv + 1):
            row = []
            for i in range(nu + 1):
                p = Vector(fn(i / nu, j / nv))
                if off:
                    e = 1e-3
                    du = Vector(fn(min(1, i / nu + e), j / nv)) - Vector(fn(max(0, i / nu - e), j / nv))
                    dv = Vector(fn(i / nu, min(1, j / nv + e))) - Vector(fn(i / nu, max(0, j / nv - e)))
                    nn = du.cross(dv)
                    if nn.length > 1e-12: p = p - nn.normalized() * off
                row.append(bm.verts.new(p))
            g.append(row)
        return g
    g = grid(0.0)
    for j in range(nv):
        for i in range(nu):
            q = (g[j][i], g[j][i + 1], g[j + 1][i + 1], g[j + 1][i])
            bm.faces.new(tuple(reversed(q)) if flip else q)            # flip: the front is the other side (v running DOWN)
    if double:
        h = grid(back_offset)                                           # its own vertices: the two sides shade apart
        for j in range(nv):
            for i in range(nu):
                bm.faces.new((h[j][i], h[j + 1][i], h[j + 1][i + 1], h[j][i + 1]))
    return _obj(name, bm)


def rock(name, size, rng, centre=(0, 0, 0), subdiv=1, rough=0.18, flat_bottom=None):
    """A faceted stone: an icosphere (20 tris at subdiv 1, 80 at 2) squashed to `size` (full extents), every vertex
    pushed in or out by up to `rough`; flat_bottom = z (relative to the centre, in units of the half height, e.g.
    -0.5) below which vertices are clamped so it sits."""
    bm = mesh.new_bmesh()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
    vs = sorted(bm.verts, key=lambda v: (round(v.co.z, 5), round(v.co.y, 5), round(v.co.x, 5)))
    for v in vs:
        k = 1.0 + rng.uniform(-rough, rough)
        p = v.co * k
        if flat_bottom is not None and p.z < flat_bottom: p.z = flat_bottom
        v.co = Vector((centre[0] + p.x * size[0] / 2, centre[1] + p.y * size[1] / 2, centre[2] + p.z * size[2] / 2))
    return _obj(name, bm)


def place(ob, loc=(0, 0, 0), rot=(0, 0, 0), scale=None):
    """Move / rotate (Euler XYZ radians) / scale an object and bake it into the mesh (origin back at the world origin)."""
    ob.location = loc; ob.rotation_euler = rot
    if scale is not None: ob.scale = scale if isinstance(scale, (tuple, list)) else (scale, scale, scale)
    mesh.apply_transform(ob)
    return ob


def deform(ob, fn):
    """Move every vertex: fn(Vector) -> Vector (dents, sags, leans)."""
    for v in ob.data.vertices: v.co = Vector(fn(v.co.copy()))
    ob.data.update()
    return ob


def drop_faces(ob, pred):
    """Delete faces by pred(centre: Vector, normal: Vector) in world space."""
    return mesh.delete_faces(ob, lambda f, c, n: pred(c, n))


def smooth(ob, angle=35, weighted=False):
    """Smooth shading with sharp edges above `angle` degrees (no bevel)."""
    return mesh.finish(ob, bevel=0.0, smooth_angle=angle, weighted=weighted)


def bevel(ob, width, angle=35, limit=40):
    """The standard finishing chain: one-segment bevel on edges sharper than `limit`, smooth, weighted normals."""
    return mesh.finish(ob, bevel=width, smooth_angle=angle, bevel_angle=limit)


def sharpen(ob, pred):
    """Mark more edges sharp after `smooth`: pred(a: Vector, b: Vector) -> bool on the edge's two end points (world).
    A sharp edge splits the shading normal, and with it COLOR_0 (`compose` welds only corners that share a normal):
    the way to keep a hard colour step (stave against stave, a painted band) on a surface too gentle for the angle."""
    me = ob.data; mw = ob.matrix_world
    for e in me.edges:
        if pred(mw @ me.vertices[e.vertices[0]].co, mw @ me.vertices[e.vertices[1]].co): e.use_edge_sharp = True
    me.update()
    return ob


def tris(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


IRON_TYRE = "#43271C"        # a rusted iron tyre / nave band: dark brown, not orange


def wheel(name, centre, normal, rng, R=0.6, spokes=12, shade=1.0, rim_segs=12, wood=("board", "board_bleached", "board_dark"), inner_cap=True,
          tyre=IRON_TYRE, spoke_sides=4, hub_seg=6, felloes=6, tyre_band=0.0, form=0.0, ridge=False):
    """A wagon wheel as a LIST of parts (join them with the rest after the AO bake). Pass i1 (the visual reviewer: "the
    wheel rims are ten straight segments and the hub a plain block"): the rim is `rim_segs` segments (18 to 20 reads as
    a circle from a pace away) made of `felloes` sawn felloes, each its own part (its own value under `compose`'s part
    jitter), shod with an iron tyre (the rim's outer face, colour `tyre`; None = bare wood: the caller paints it);
    `spokes` spokes that taper from the nave to the rim (spoke_sides 3 = a flat face outward and a ridge behind: six
    triangles a spoke, for a wheel seen from its outside); the hub is a turned nave with an iron-banded nose. Built
    flat, then turned so its axle lies along `normal` at `centre` (local +Z = the wheel's outside). The spokes take no
    AO (their only vertices are in the hub and in the rim).
    Pass i5 (visual reviewer, the wagon's wheel from a pace away: "flat untextured spokes ... a single fill"):
    tyre_band > 0 turns that much of the rim's FRONT face into the tyre's edge (one more ring: the iron shows from in
    front of the wheel, not only from its tread); form > 0 gives the faces their own value by where they look, as a
    carpenter's drawing does: a spoke's and a felloe's face a step paler, their flanks and the rim's inside darker by
    `form` (a vertex-lit wheel in shade has no light of its own to show which way a face looks).
    Pass i6 (both visual reviewers: "flat dark slabs for spokes", "add spoke bevels"): ridge=True turns a four-sided spoke
    on its edge, as a spoke is shaved: a ridge down its face, one flank of the ridge a step paler and the other a step
    darker (the same triangles)."""
    out = []
    N = rim_segs; ro, ri, hw = R, R - 0.085, 0.036
    bm = mesh.new_bmesh(); rings = []
    for k in range(N):
        a = 2 * math.pi * k / N; c, s_ = math.cos(a), math.sin(a)
        sec = [(ro, hw), (ro, -hw), (ri, -hw), (ri, hw)] + ([(ro - tyre_band, hw)] if tyre_band > 0 else [])
        rings.append([bm.verts.new((c * r, s_ * r, z)) for r, z in sec])    # outer front, outer back, inner back, inner front (, the tyre's edge on the front)
    M_ = len(rings[0])
    f_tyre = []; f_fel = [[] for _ in range(felloes)]; f_in = []; fi = 0
    for k in range(N):
        a, b = rings[k], rings[(k + 1) % N]
        for j in range(M_):
            j2 = (j + 1) % M_
            bm.faces.new((a[j], a[j2], b[j2], b[j]))
            (f_tyre if j in (0, 4) else f_fel[(k * felloes) // N]).append(fi)
            if j == 2: f_in.append(fi)
            fi += 1
    rim = _obj(name + "_rim", bm); _outward(rim)
    if tyre is None: f_fel[0] += f_tyre
    else: paint(rim, "linen", tyre, faces=f_tyre, shade=shade)
    for g in f_fel:
        if not g: continue
        sh = 0.9 * shade * rng.uniform(0.86, 1.06)
        paint(rim, "linen", wood[0], faces=g, shade=sh)
        if form > 0:
            gi = [f for f in g if f in set(f_in)]
            if gi: paint(rim, "linen", wood[0], faces=gi, shade=sh * (1.0 - form), part=False)
    out.append(rim)
    r0, r1 = 0.085, ri + 0.012
    for k in range(spokes):
        a = 2 * math.pi * (k + 0.5) / spokes + rng.uniform(-0.02, 0.02)
        d = Vector((math.cos(a), math.sin(a), 0.0)); t = Vector((-d.y, d.x, 0.0))
        if spoke_sides == 3:
            bm = mesh.new_bmesh(); secs = []
            for r, k_ in ((r0, 1.0), (r1, 0.70)):
                c = d * r
                secs.append([bm.verts.new(c + t * (0.034 * k_) + Vector((0, 0, 0.022 * k_))), bm.verts.new(c - t * (0.034 * k_) + Vector((0, 0, 0.022 * k_))),
                             bm.verts.new(c + Vector((0, 0, -0.030 * k_)))])
            for j in range(3): bm.faces.new((secs[0][j], secs[0][(j + 1) % 3], secs[1][(j + 1) % 3], secs[1][j]))
            sp = _obj(f"{name}_spoke{k}", bm); _outward(sp)
        elif ridge:
            sp = beam(f"{name}_spoke{k}", tuple(d * r0), tuple(d * r1), 0.062, 0.062, up=tuple(t + Vector((0, 0, 1))), cap=(False, False), taper=0.62)
        else:
            sp = beam(f"{name}_spoke{k}", tuple(d * r0), tuple(d * r1), 0.066, 0.052, up=(0, 0, 1), cap=(False, False), taper=0.68)
        sh = rng.uniform(0.7, 0.86) * shade
        paint(sp, "linen", wood[1], shade=sh * (1.0 + 0.45 * form), ao=False)
        if ridge:
            lee = [pl.index for pl in sp.data.polygons if pl.normal.z > 0.2 and pl.normal.dot(t) < 0]
            back = [pl.index for pl in sp.data.polygons if pl.normal.z <= 0.2]
            if lee: paint(sp, "linen", wood[1], faces=lee, shade=sh * (1.0 - 0.6 * form), part=False, ao=False)
            if back: paint(sp, "linen", wood[1], faces=back, shade=sh * (1.0 - form), part=False, ao=False)
        elif form > 0:
            flank = [pl.index for pl in sp.data.polygons if abs(pl.normal.z) < 0.6]
            if flank: paint(sp, "linen", wood[1], faces=flank, shade=sh * (1.0 - form), part=False, ao=False)
        out.append(sp)
    nave = lathe(name + "_hub", [(0.080, -0.12), (0.118, -0.035), (0.118, 0.045)] if hub_seg >= 8 else [(0.086, -0.12), (0.118, 0.045)], seg=hub_seg, cap_first=inner_cap, cap_last=False)
    smooth(nave, angle=40); paint(nave, "linen", wood[2], shade=1.1 * shade); out.append(nave)
    nose = lathe(name + "_nose", [(0.104, 0.045), (0.090, 0.115), (0.050, 0.150)], seg=hub_seg, cap_first=False, cap_last=True)
    smooth(nose, angle=40); paint(nose, "linen", tyre or IRON_TYRE, shade=1.25 * shade); out.append(nose)
    q = Vector((0, 0, 1)).rotation_difference(Vector(normal).normalized())
    for o in out:
        o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = q; o.location = centre
        mesh.apply_transform(o)
        o.rotation_mode = 'XYZ'
    return out


def staved(name, length, r_end, r_belly, hoops, seg=10, head_inset=0.03, hoop_w=0.05, hoop_h=0.013, bottom=True,
           edge=0.004, belly=(), chime=(True, True)):
    """A staved barrel along +Z from z = 0 to `length`: a bellied body, a head hoop at each chime and one more at
    every fraction in `hoops` (0..1 along the length), and a sunken head at each end (bottom=False: the z = 0 end is
    left open, it stands on the ground). Every hoop is a real STEP: a band `hoop_h` proud with a riser `edge` long at
    each side, steep enough that `smooth` marks it sharp, so the band keeps its own normals AND its own colour (a
    smooth vertex has one COLOR_0: without the step the iron smears into the staves). belly = extra rings (fractions)
    that round the profile between hoops. chime = (start, end): the flat stave-end ring between hoop and sunk head;
    False saves a ring (the head then slopes straight from the hoop). Returns (object, [z ranges of the hoops])."""
    def rad(z):
        f = min(1.0, max(0.0, z / length))
        return r_end + (r_belly - r_end) * math.sin(math.pi * f) ** 0.8
    zs = [(0.0, hoop_w)]
    prof = []
    if bottom:
        prof.append((r_end * 0.86, head_inset))
        if chime[0]: prof.append((r_end * 0.93, 0.0))
    prof += [(r_end + hoop_h, 0.0), (rad(hoop_w) + hoop_h, hoop_w), (rad(hoop_w + edge), hoop_w + edge)]
    mid = []
    for h in hoops:
        z0 = h * length - hoop_w / 2; z1 = h * length + hoop_w / 2
        mid += [(rad(z0 - edge), z0 - edge), (rad(z0) + hoop_h, z0), (rad(z1) + hoop_h, z1), (rad(z1 + edge), z1 + edge)]
        zs.append((z0, z1))
    for f in belly: mid.append((rad(f * length), f * length))
    prof += sorted(mid, key=lambda p: p[1])
    z0 = length - hoop_w
    prof += [(rad(z0 - edge), z0 - edge), (rad(z0) + hoop_h, z0), (r_end + hoop_h, length)]
    if chime[1]: prof.append((r_end * 0.93, length))
    prof.append((r_end * 0.86, length - head_inset))
    zs.append((z0, length))
    ob = lathe(name, prof, seg=seg, cap_first=bottom, cap_last=True)
    return ob, zs


# ------------------------------------------------------------------------------------------------ paint
AOW = "ks_aow"               # per-face int: AO strength of the part in percent (0 = not set = 100)


def paint(ob, cell, colour=None, faces=None, shade=1.0, mat="m_prop", part=True, ao=None):
    """UV0 -> palette `cell`, material m_prop, and the part's real colour for `compose` (default: the cell's own).
    shade multiplies the colour (a darker board, a paler patch <= 1 relative to the cell).
    ao = 0..1 scales how much of the baked AO this part takes: a stick whose only vertices are at its two ends, both
    let into other parts (a stretcher, a rung), bakes dark from end to end (a vertex bake samples only at vertices);
    give it ao=0.3 instead of an edge loop it cannot afford; or ao=False: the part is left out of the AO bake
    altogether (it still casts onto the others) when `bake_ao` is given the PARTS, before the join."""
    idx = uv.face_indices(ob, faces)
    material.assign(ob, mat, idx)
    uv.map_to_palette(ob, cell, idx)
    crgb = np.asarray(manifest.palette_rgb(cell), dtype=np.float32)
    trgb = np.asarray(vcol.rgb(colour if colour is not None else cell), dtype=np.float32) * shade
    vcol.fill_color(ob, tuple(crgb), CELL, idx)
    vcol.fill_color(ob, tuple(trgb), TINT, idx)
    if part:
        me = ob.data
        attr = me.attributes.get(PARTID) or me.attributes.new(PARTID, 'INT', 'FACE')
        vals = np.zeros(len(me.polygons), dtype=np.int32); attr.data.foreach_get("value", vals)
        _part_counter[0] += 1
        vals[np.asarray(idx, dtype=np.int64)] = _part_counter[0]
        me.attributes[PARTID].data.foreach_set("value", vals)
    if ao is False:
        ob["ao_skip"] = True                                            # casts in the AO bake, receives none (bake_ao)
    elif ao is not None:
        me = ob.data
        attr = me.attributes.get(AOW) or me.attributes.new(AOW, 'INT', 'FACE')
        vals = np.zeros(len(me.polygons), dtype=np.int32); attr.data.foreach_get("value", vals)
        vals[np.asarray(idx, dtype=np.int64)] = max(1, int(round(ao * 100)))
        me.attributes[AOW].data.foreach_set("value", vals)
    return ob


def emis(ob, cell, faces=None, intensity=1.0, flicker=0.0, wrong_fade=0.0):
    """Faces that glow: material m_emis, UV0 -> emissive cell, and the m_emis COLOR_0 convention remembered for
    `compose` (R intensity, G flicker group, B wrong_fade). They keep their material when a zone embeds the prop."""
    idx = uv.face_indices(ob, faces)
    material.assign(ob, "m_emis", idx)
    uv.map_to_emis(ob, cell, idx)
    vcol.fill_color(ob, (1.0, 1.0, 1.0), CELL, idx)
    vcol.fill_color(ob, (intensity, flicker, wrong_fade), TINT, idx)
    return ob


def join(parts, name):
    """Join parts into one mesh named `name` (origin at the world origin = the pivot)."""
    parts = [p for p in parts if p is not None]
    ob = mesh.join(parts, name)
    return ob


def bake_ao(objs, distance=0.5, samples=256, ground=0.0, ground_size=30.0, extra=()):
    """AO into the helper attribute "AO" of each object in `objs`. ground = z of a temporary floor that occludes
    (None = no floor: hanging things); `extra` = other objects that should cast (already in the scene) are left alone."""
    g = None
    if ground is not None:
        g = mesh.box("_ao_ground", (ground_size, ground_size, 0.2), (0, 0, ground - 0.1))
        material.assign(g, "m_prop")
    keep = set(o.name for o in objs) | set(o.name for o in extra) | ({g.name} if g is not None else set())
    hidden = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o.name not in keep and not o.hide_render]
    for o in hidden: o.hide_render = True                              # other variants stand on the same spot: they must not cast
    try:
        recv = [o for o in objs if not o.get("ao_skip")]
        vcol.bake_ao_vertex(recv, distance=distance, samples=samples)
    finally:
        for o in hidden: o.hide_render = False
        if g is not None: scene.remove(g)


class P:
    """What a painter sees: world positions, normals, the true colour array (n, 3; edit in place), face index per corner."""
    def __init__(self, ob, col):
        self.ob = ob
        self.pos = vcol.corner_positions(ob)
        self.nrm = vcol.corner_normals(ob)
        self.col = col
        self.face = vcol.poly_of_loop(ob)
        self.x, self.y, self.z = self.pos[:, 0], self.pos[:, 1], self.pos[:, 2]
        me = ob.data; m = np.array(ob.matrix_world, dtype=np.float32)
        fn = np.empty(len(me.polygons) * 3, dtype=np.float32); me.polygons.foreach_get("normal", fn)
        fc = np.empty(len(me.polygons) * 3, dtype=np.float32); me.polygons.foreach_get("center", fc)
        self.fnrm = (fn.reshape(-1, 3) @ m[:3, :3].T)[self.face]       # the FACE's normal and centre, per corner: lets a
        self.fcen = (fc.reshape(-1, 3) @ m[:3, :3].T + m[:3, 3])[self.face]   # painter colour whole faces (hard edges)

    def mix(self, k, colour):
        """Blend toward `colour` (palette name / hex / linear rgb) by weight k (per corner, 0..1)."""
        c = np.asarray(vcol.rgb(colour), dtype=np.float32)[None, :]
        k = np.clip(np.asarray(k, dtype=np.float32), 0, 1)[:, None]
        self.col[:] = self.col * (1 - k) + c * k

    def mul(self, k, factor):
        """Multiply by `factor` (a number or rgb) with weight k (per corner, 0..1)."""
        f = np.asarray(factor, dtype=np.float32).reshape(1, -1)
        k = np.clip(np.asarray(k, dtype=np.float32), 0, 1)[:, None]
        self.col[:] = self.col * (1 - k + k * f)

    def near(self, point, radius, power=1.0, scale=(1, 1, 1)):
        """Weight 1 at `point` falling to 0 at `radius` (an ellipsoid with `scale`)."""
        d = np.linalg.norm((self.pos - np.asarray(point, dtype=np.float32)[None, :]) / np.asarray(scale, dtype=np.float32)[None, :], axis=1)
        return np.clip(1.0 - d / radius, 0, 1) ** power


def compose(ob, ao=0.8, gradient=(0.75, 1.10), dust=0.0, dust_height=0.6, dust_colour="sand", bleach=None,
            bleach_fraction=0.15, bleach_amount=0.5, part_jitter=0.06, face_jitter=0.0, seed=1, z_range=None,
            painters=(), contact=None, up_light=0.0, quiet=False, weld=True):
    """weld: see `_weld_corners` (corners of a smooth vertex share one colour: fewer vertices in the file).

    Write COLOR_0 ("Color") of an m_prop mesh (and of m_emis faces in it):

        true colour = Tint x lerp(1, AO, ao) x height ramp x (1 + up_light x normal.z) -> dust skirt -> top bleach
                      -> per-part jitter (+-part_jitter: each plank, stone, stave its own value) x per-face jitter
                      -> painters (stains, wear, patches: callables taking a `P`) -> contact (darken the foot)
        Color       = true colour / Cell colour, clamped to 1.

    contact = (height, factor): corners within `height` of the lowest point x factor, fading out above.
    Prints how much was clamped: a part painted lighter than its palette cell (choose a paler cell for it)."""
    me = ob.data
    pos = vcol.corner_positions(ob); nrm = vcol.corner_normals(ob)
    n = len(pos)
    tint = vcol.get_colors(ob, TINT)[:, :3].copy() if TINT in me.color_attributes else np.ones((n, 3), np.float32)
    cell = vcol.get_colors(ob, CELL)[:, :3].copy() if CELL in me.color_attributes else np.ones((n, 3), np.float32)
    aov = vcol.get_colors(ob, "AO")[:, 0:1] if "AO" in me.color_attributes else np.ones((n, 1), np.float32)
    mats = export.face_materials(ob)
    pol = vcol.poly_of_loop(ob)
    is_emis = np.array([m == "m_emis" for m in mats], dtype=bool)[pol]
    z = pos[:, 2:3]
    z0, z1 = z_range if z_range is not None else (float(z.min()), float(z.max()))
    t = np.clip((z - z0) / max(1e-6, z1 - z0), 0, 1)
    aos = np.full((n, 1), ao, dtype=np.float32)
    if AOW in me.attributes:
        w = np.zeros(len(me.polygons), dtype=np.int32); me.attributes[AOW].data.foreach_get("value", w)
        aos = aos * np.where(w == 0, 1.0, w / 100.0).astype(np.float32)[pol][:, None]
    col = tint * (1 - aos + aos * aov) * (gradient[0] + (gradient[1] - gradient[0]) * t)
    if up_light: col = col * (1.0 + up_light * nrm[:, 2:3])
    if dust > 0:
        k = dust * np.clip(1.0 - (z - z0) / dust_height, 0, 1) ** 1.5
        k = k * np.clip(0.55 + 0.6 * nrm[:, 2:3], 0.35, 1.15)             # dust lies on what faces up, less on undersides
        k = np.clip(k, 0, 1)
        col = col * (1 - k) + np.asarray(vcol.rgb(dust_colour), np.float32)[None, :] * (1 - ao * 0.5 + ao * 0.5 * aov) * k
    if bleach is not None:
        k = bleach_amount * np.clip((t - (1 - bleach_fraction)) / max(1e-6, bleach_fraction), 0, 1)
        col = col * (1 - k) + np.asarray(vcol.rgb(bleach), np.float32)[None, :] * k
    rng = np.random.default_rng(seed)
    if part_jitter > 0 and PARTID in me.attributes:
        pid = np.zeros(len(me.polygons), dtype=np.int32); me.attributes[PARTID].data.foreach_get("value", pid)
        table = 1.0 + (rng.random(int(pid.max()) + 2, dtype=np.float32) - 0.5) * 2 * part_jitter
        col = col * table[pid][pol][:, None]
    if face_jitter > 0:
        col = col * (1.0 + (rng.random(len(me.polygons), dtype=np.float32)[pol][:, None] - 0.5) * 2 * face_jitter)
    pp = P(ob, col)
    for fn in painters: fn(pp)
    col = pp.col
    if contact is not None:
        h, f = contact
        k = np.clip(1.0 - (z - z0) / h, 0, 1)
        col = col * (1.0 - (1.0 - f) * k)
    ratio = col / np.maximum(cell, 1e-4)
    over = (ratio.max(axis=1) > 1.02) & ~is_emis
    if over.any() and not quiet:
        print(f"NOTE {ob.name}: {int(over.sum())} of {n} corners painted lighter than their palette cell (clamped, worst x{float(ratio[~is_emis].max()):.2f})")
    ratio[is_emis] = tint[is_emis]                                      # m_emis: R intensity, G flicker, B wrong_fade as given
    if weld: ratio = _weld_corners(ob, ratio, nrm, cell)
    res = np.ones((n, 4), dtype=np.float32); res[:, :3] = np.clip(ratio, 0.0, 1.0)
    vcol.set_colors(ob, res, vcol.COLOR)
    for extra in [c.name for c in me.color_attributes if c.name != vcol.COLOR]:
        me.color_attributes.remove(me.color_attributes[extra])
    vcol.color_layer(ob, vcol.COLOR)
    for extra in (PARTID, AOW):
        if extra in me.attributes: me.attributes.remove(me.attributes[extra])
    return ob


def _weld_corners(ob, ratio, nrm, cell):
    """Give the corners that meet at one vertex with the SAME shading normal and the same palette cell one colour
    (their mean). A vertex AO bake samples every corner on its own, so the corners of a smooth vertex come back a
    hair apart (sampling noise): invisible, but the exporter then writes one vertex per corner. Welded, a smooth
    surface ships a third of the vertices; hard edges (different normals) keep their own colours."""
    me = ob.data
    li = np.empty(len(me.loops), dtype=np.int64); me.loops.foreach_get("vertex_index", li)
    key = np.concatenate([li[:, None].astype(np.float64), np.round(nrm.astype(np.float64) * 200.0), np.round(cell.astype(np.float64) * 500.0)], axis=1)
    _, inv = np.unique(key, axis=0, return_inverse=True)
    inv = inv.ravel()
    cnt = np.bincount(inv).astype(np.float64)
    out = np.empty_like(ratio)
    for c in range(3):
        out[:, c] = (np.bincount(inv, weights=ratio[:, c].astype(np.float64)) / cnt)[inv]
    return out


# common painters --------------------------------------------------------------------------------
def stain_below(points, width=0.04, length=0.2, factor=0.8):
    """Dark streaks under fasteners / sills / seam ends (world points)."""
    def fn(p):
        for q in points:
            d = np.hypot(p.pos[:, 0] - q[0], p.pos[:, 1] - q[1]); dz = q[2] - p.pos[:, 2]
            k = np.clip(1.0 - d / (width + 1e-6), 0, 1) * (dz >= -1e-4) * np.clip(1.0 - dz / length, 0, 1)
            p.mul(k, factor)
    return fn


def spot(point, radius, colour=None, factor=None, power=1.0, scale=(1, 1, 1), amount=1.0):
    """A soft patch round a world point: blend toward `colour`, or multiply by `factor`."""
    def fn(p):
        k = p.near(point, radius, power, scale) * amount
        if colour is not None: p.mix(k, colour)
        else: p.mul(k, factor)
    return fn


def up_faces(colour, amount=0.3, min_z=0.7):
    """Blend faces that look up toward `colour` (bleach on tops, dust on ledges)."""
    def fn(p):
        k = np.clip((p.nrm[:, 2] - min_z) / max(1e-6, 1 - min_z), 0, 1) * amount
        p.mix(k, colour)
    return fn


# ------------------------------------------------------------------------------------------------ export
GRID = 1.0 / 4096.0           # 0.244 mm


def snap_to_grid(grid=GRID):
    """Round every mesh vertex in the scene to a power-of-two grid (a quarter of a millimetre). The shipped file keeps
    positions as float32 under meshopt's byte codec: a coordinate that is a multiple of 2^-12 has its low mantissa
    bytes zero, which that codec packs to almost nothing (about a fifth off every file of the piece; the download share
    is 0.3 MB). Invisible: the finest authored step in the piece is a 2 mm relief."""
    inv = 1.0 / grid
    for ob in bpy.context.scene.objects:
        if ob.type != 'MESH': continue
        me = ob.data
        co = np.empty(len(me.vertices) * 3, dtype=np.float64); me.vertices.foreach_get("co", co)
        co = np.round(co * inv) * grid
        me.vertices.foreach_set("co", co.astype(np.float32)); me.update()


def export_asset(asset, args):
    """Snap to the grid + check + export + (with --preview) the contact sheet."""
    snap_to_grid()
    rep = export.export_asset(asset, args.out, blend=args.blend)
    if args.preview: export.preview(asset, args.out)
    return rep


def variant_root(name):
    """An Empty at the origin that carries a variant's meshes (when a variant is more than one mesh)."""
    return export.marker(name, (0, 0, 0))
