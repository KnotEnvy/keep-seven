"""The low-poly modelling kit of art-props-mech (imported by every blender/props/mech/<id>.py; recorded in deps.json).

Budgets here are 40-1 400 triangles an asset, so nothing is built from `create_cube` + a bevel modifier (44 triangles a
box). Parts are built face by face with exactly the faces that can be seen:

    slab     a box with only the listed faces, optional taper, optional true bevel       2 tris a face
    pillow   a raised panel: front face + four chamfers (+ four side walls)              10 / 18 tris
    prism    an outline in the XZ plane extruded along Y, optional chamfered front        rounded doors, plates, straps
    lathe    a profile turned about an axis                                               jugs, insulators, bezels, knobs
    tube     a polygon swept along a polyline, optional per-point radius                 cords, rods, hooks, rails
    quad     one face                                                                     bands, lamps, decals

Every builder returns a finished object: smooth shading with sharp edges, weighted normals, material m_prop, UV0 on a
palette cell and the Tint helper layer. Blender space: +Z up, the asset's front is -Y; game (x, y, z) = (x, -z, y).
"""
import math
import bpy, bmesh
import numpy as np
from mathutils import Vector, Matrix, Euler
from lib import scene, mesh, uv, material, vcol, rig, anim, export, manifest, zone, brand

TAU = math.pi * 2


# ----------------------------------------------------------------------------------------------- paint and finish
def paint(ob, colour, mat="m_prop"):
    """Material, palette cell (m_prop) and the Tint helper layer of a part."""
    material.assign(ob, mat)
    if mat in ("m_prop", "m_flat"): uv.map_to_palette(ob, colour)
    vcol.tint(ob, colour)
    return ob


def recolour(ob, colour, faces):
    """Point some faces of a painted part at another palette cell (a stained panel foot, an end-grain face)."""
    uv.map_to_palette(ob, colour, faces); vcol.tint(ob, colour, faces)
    return ob


def _finish(name, bm, colour, bevel=0.0, smooth=35.0, mat="m_prop", loc=None, rot=None, weighted=True):
    ob = mesh.new_mesh_object(name, bm)
    if rot is not None: ob.rotation_euler = rot
    if loc is not None: ob.location = loc
    if rot is not None or loc is not None: mesh.apply_transform(ob)
    mesh.finish(ob, bevel=bevel, smooth_angle=smooth, weighted=weighted)
    if colour is not None: paint(ob, colour, mat)
    return ob


def place(ob, loc=(0, 0, 0), rot=(0, 0, 0)):
    """Rotate (Euler XYZ, radians) then move a finished part, and bake it into the mesh."""
    ob.rotation_euler = rot; ob.location = loc
    mesh.apply_transform(ob)
    return ob


def jit(rng, a=0.012):
    """A Frontier rotation jitter (ART_BIBLE 5.3: +-0.012 rad)."""
    return (rng.uniform(-a, a), rng.uniform(-a, a), rng.uniform(-a, a))


# ----------------------------------------------------------------------------------------------- primitives
_BOX_FACES = {"x-": (0, 4, 7, 3), "x+": (1, 2, 6, 5), "y-": (0, 1, 5, 4), "y+": (3, 7, 6, 2), "z-": (0, 3, 2, 1), "z+": (4, 5, 6, 7)}


def slab(name, size, centre, colour, drop=(), bevel=0.0, rot=None, taper=(1.0, 1.0), top_shift=(0.0, 0.0), mat="m_prop", smooth=35.0):
    """A box of full extents `size` at `centre`, WITHOUT the faces named in `drop` ('x-' 'x+' 'y-' 'y+' 'z-' 'z+':
    backs against walls, bottoms, buried ends). taper = scale of the top (z+) rectangle in x and y; top_shift moves it
    (a lean, a batter). bevel = a real one-segment bevel on the remaining hard edges. rot = Euler about the centre."""
    sx, sy, sz = size[0] / 2, size[1] / 2, size[2] / 2
    tx, ty = taper
    co = [(-sx, -sy, -sz), (sx, -sy, -sz), (sx, sy, -sz), (-sx, sy, -sz),
          (-sx * tx + top_shift[0], -sy * ty + top_shift[1], sz), (sx * tx + top_shift[0], -sy * ty + top_shift[1], sz),
          (sx * tx + top_shift[0], sy * ty + top_shift[1], sz), (-sx * tx + top_shift[0], sy * ty + top_shift[1], sz)]
    bm = mesh.new_bmesh()
    vs = [bm.verts.new(c) for c in co]
    for k, idx in _BOX_FACES.items():
        if k in drop: continue
        bm.faces.new([vs[i] for i in idx])
    for v in [v for v in vs if not v.link_faces]: bm.verts.remove(v)
    return _finish(name, bm, colour, bevel=bevel, loc=centre, rot=rot, mat=mat, smooth=smooth)


def pillow(name, w, h, d, ch, colour, centre=(0, 0, 0), sides=True, rot=None, mat="m_prop", back_w=None, back_h=None):
    """A raised panel facing -Y: back outline (w x h) at y = 0, front face at y = -d inset by the chamfer `ch` on
    every side. sides=False leaves out the four side walls (a panel let into a frame). `centre` is the back centre."""
    bw = (back_w if back_w is not None else w) / 2; bh = (back_h if back_h is not None else h) / 2
    bm = mesh.new_bmesh()
    def rect(x, z, y): return [bm.verts.new(p) for p in ((-x, y, -z), (x, y, -z), (x, y, z), (-x, y, z))]
    mid = rect(w / 2, h / 2, -(d - ch)); front = rect(w / 2 - ch, h / 2 - ch, -d)
    bm.faces.new(front)
    for k in range(4):
        j = (k + 1) % 4
        bm.faces.new((mid[k], mid[j], front[j], front[k]))
    if sides:
        back = rect(bw, bh, 0.0)
        for k in range(4):
            j = (k + 1) % 4
            bm.faces.new((back[k], back[j], mid[j], mid[k]))
    return _finish(name, bm, colour, loc=centre, rot=rot, mat=mat)


def rounded_rect(w, h, r, seg=3):
    """Outline [(x, z)] of a w x h rectangle with corner radius r, counter-clockwise seen from the front (-Y),
    centred on the origin."""
    out = []
    for cx, cz, a0 in ((w / 2 - r, -h / 2 + r, -90), (w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180)):
        for k in range(seg + 1):
            a = math.radians(a0 + 90.0 * k / seg)
            out.append((cx + math.cos(a) * r, cz + math.sin(a) * r))
    return out


def circle(r, n, phase=0.0, rz=None):
    """Outline [(x, z)] of an n-gon (counter-clockwise seen from the front), radius r (rz = vertical radius)."""
    return [(math.cos(phase + TAU * k / n) * r, math.sin(phase + TAU * k / n) * (rz if rz is not None else r)) for k in range(n)]


def _inset(outline, d):
    """Offset a convex outline inward by d (mitred)."""
    n = len(outline); out = []
    for i in range(n):
        p0 = Vector(outline[i - 1]); p1 = Vector(outline[i]); p2 = Vector(outline[(i + 1) % n])
        e1 = (p1 - p0); e2 = (p2 - p1)
        if e1.length < 1e-9: e1 = e2
        if e2.length < 1e-9: e2 = e1
        n1 = Vector((-e1.y, e1.x)).normalized(); n2 = Vector((-e2.y, e2.x)).normalized()      # left of travel = inward for ccw
        m = (n1 + n2)
        if m.length < 1e-9: m = n1
        m.normalize()
        k = d / max(0.3, m.dot(n1))
        out.append((p1.x + m.x * k, p1.y + m.y * k))
    return out


def prism(name, outline, depth, colour, centre=(0, 0, 0), front=True, back=False, sides=True, chamfer=0.0, rot=None, mat="m_prop",
          bevel=0.0, smooth=35.0):
    """An outline [(x, z)] (counter-clockwise seen from the front) extruded from y = 0 (back) to y = -depth (front).
    chamfer > 0 insets the front face by that much and joins it with a chamfer ring (convex outlines only)."""
    bm = mesh.new_bmesh(); n = len(outline)
    bk = [bm.verts.new((x, 0.0, z)) for x, z in outline]
    yf = -depth
    if chamfer > 0:
        md = [bm.verts.new((x, yf + chamfer, z)) for x, z in outline]
        fr = [bm.verts.new((x, yf, z)) for x, z in _inset(outline, chamfer)]
    else:
        md = fr = [bm.verts.new((x, yf, z)) for x, z in outline]
    for k in range(n):
        j = (k + 1) % n
        if sides: bm.faces.new((bk[k], bk[j], md[j], md[k]))
        if chamfer > 0: bm.faces.new((md[k], md[j], fr[j], fr[k]))
    if front: bm.faces.new(fr)
    if back: bm.faces.new(list(reversed(bk)))
    if not sides:
        for v in [v for v in bk if not v.link_faces]: bm.verts.remove(v)
    return _finish(name, bm, colour, bevel=bevel, loc=centre, rot=rot, mat=mat, smooth=smooth)


def lathe(name, profile, seg, colour, centre=(0, 0, 0), rot=None, cap_start=False, cap_end=False, phase=0.0, squash=1.0, mat="m_prop",
          smooth=40.0, arc=None):
    """Turn `profile` [(radius, z), ...] about +Z with `seg` sides. Walk the profile bottom to top up the OUTSIDE (the
    normals then face outward); coming back down inside gives an inner wall facing the axis (a cup, a socket).
    radius 0 closes to a point. cap_start / cap_end close the first / last ring with one polygon.
    squash scales Y (an oval section). arc = (a0, a1) radians turns only part of the way (open)."""
    bm = mesh.new_bmesh()
    rings = []
    nseg = seg if arc is None else seg + 1
    for r, z in profile:
        if r <= 1e-9: rings.append([bm.verts.new((0, 0, z))])
        else:
            ring = []
            for k in range(nseg):
                a = phase + (TAU * k / seg if arc is None else arc[0] + (arc[1] - arc[0]) * k / seg)
                ring.append(bm.verts.new((math.cos(a) * r, math.sin(a) * r * squash, z)))
            rings.append(ring)
    span = seg if arc is None else seg
    for i in range(len(rings) - 1):
        a, b = rings[i], rings[i + 1]
        for k in range(span):
            j = (k + 1) % nseg
            if len(a) == 1 and len(b) == 1: continue
            if len(a) == 1: bm.faces.new((a[0], b[j], b[k]))
            elif len(b) == 1: bm.faces.new((a[k], a[j], b[0]))
            else: bm.faces.new((a[k], a[j], b[j], b[k]))
    if cap_start and len(rings[0]) > 2: bm.faces.new(list(reversed(rings[0])))
    if cap_end and len(rings[-1]) > 2: bm.faces.new(rings[-1])
    return _finish(name, bm, colour, loc=centre, rot=rot, mat=mat, smooth=smooth)


def tube(name, pts, radius, sides, colour, caps=(True, True), radii=None, up=(0, 0, 1), phase=0.0, closed=False, mat="m_prop", smooth=50.0,
         flat=None):
    """Sweep a `sides`-gon of `radius` (or radii[i]) along the polyline `pts` (mitred joints). caps = (start, end).
    closed=True joins the last point to the first (a loop of cord). flat = (rx, rz) makes the section an ellipse /
    flat strap in the frame (side, up)."""
    P = [Vector(p) for p in pts]; n = len(P)
    bm = mesh.new_bmesh(); rings = []
    upv = Vector(up).normalized()
    prev_side = None
    for i in range(n):
        if closed: d0 = P[i] - P[i - 1]; d1 = P[(i + 1) % n] - P[i]
        else:
            d0 = P[i] - P[i - 1] if i > 0 else P[1] - P[0]
            d1 = P[i + 1] - P[i] if i < n - 1 else P[-1] - P[-2]
        t = (d0.normalized() + d1.normalized())
        if t.length < 1e-6: t = d1
        t.normalize()
        side = t.cross(upv)
        if side.length < 1e-3: side = prev_side if prev_side is not None else t.cross(Vector((1, 0, 0)))
        side.normalize()
        if prev_side is not None and side.dot(prev_side) < 0: side = -side
        prev_side = side
        u2 = side.cross(t).normalized()
        cosh = max(0.35, d0.normalized().dot(t))                   # mitre: keep the section's width through a bend
        r = (radii[i] if radii is not None else radius)
        ring = []
        for k in range(sides):
            a = phase + TAU * k / sides
            ca, sa = math.cos(a), math.sin(a)
            if flat is not None: off = side * (ca * flat[0]) + u2 * (sa * flat[1])
            else: off = side * (ca * r) + u2 * (sa * r)
            # stretch the component that lies along the bend's bisector
            b = (d1.normalized() - d0.normalized())
            if b.length > 1e-6:
                b.normalize(); off = off + b * (off.dot(b)) * (1.0 / cosh - 1.0)
            ring.append(bm.verts.new(P[i] + off))
        rings.append(ring)
    last = n if closed else n - 1
    for i in range(last):
        a, b = rings[i], rings[(i + 1) % n]
        for k in range(sides):
            j = (k + 1) % sides
            bm.faces.new((a[k], a[j], b[j], b[k]))
    if not closed:
        if caps[0] and sides > 2: bm.faces.new(list(reversed(rings[0])))
        if caps[1] and sides > 2: bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return _finish(name, bm, colour, mat=mat, smooth=smooth)


def quad(name, corners, colour, mat="m_prop"):
    """One face from four (or more) Blender points, counter-clockwise seen from its lit side."""
    bm = mesh.new_bmesh()
    bm.faces.new([bm.verts.new(p) for p in corners])
    return _finish(name, bm, colour, mat=mat, weighted=False)


def faces_obj(name, polys, colour, mat="m_prop", smooth=35.0, recalc=False):
    """Free-form part: `polys` = list of point lists (shared points are welded)."""
    bm = mesh.new_bmesh(); cache = {}
    def v(p):
        k = (round(p[0], 5), round(p[1], 5), round(p[2], 5))
        if k not in cache: cache[k] = bm.verts.new(p)
        return cache[k]
    for poly in polys:
        try: bm.faces.new([v(p) for p in poly])
        except ValueError: pass
    if recalc: bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return _finish(name, bm, colour, mat=mat, smooth=smooth)


# ----------------------------------------------------------------------------------------------- decals (m_mask)
class Decals:
    """Collects alpha-tested quads on tx_mask regions into ONE m_mask mesh (one draw call).
    add(centre, w, h, region, index, colour, normal, roll): a w x h quad centred at a Blender point, lying 1.5 mm off
    the surface whose outward normal is `normal` ('-y' front, '+y' back, '+z' top, '-x', '+x'), rolled `roll` radians
    counter-clockwise as you look at it."""
    FRAMES = {"-y": ((1, 0, 0), (0, 0, 1), (0, -1, 0)), "+y": ((-1, 0, 0), (0, 0, 1), (0, 1, 0)),
              "+z": ((1, 0, 0), (0, 1, 0), (0, 0, 1)), "-x": ((0, -1, 0), (0, 0, 1), (-1, 0, 0)), "+x": ((0, 1, 0), (0, 0, 1), (1, 0, 0))}

    def __init__(self): self.items = []

    def add(self, centre, w, h, region, index=None, colour="steel_dark", normal="-y", roll=0.0, lift=0.0015, frame=None):
        r, u, n = (Vector(a) for a in (frame or self.FRAMES[normal]))
        c, s = math.cos(roll), math.sin(roll)
        r2 = r * c + u * s; u2 = u * c - r * s
        o = Vector(centre) + n * lift
        self.items.append(([o - r2 * w / 2 - u2 * h / 2, o + r2 * w / 2 - u2 * h / 2, o + r2 * w / 2 + u2 * h / 2, o - r2 * w / 2 + u2 * h / 2], region, index, colour))
        return self

    def build(self, name):
        if not self.items: return None
        bm = mesh.new_bmesh()
        for corners, *_ in self.items: bm.faces.new([bm.verts.new(p) for p in corners])
        ob = mesh.new_mesh_object(name, bm)
        material.assign(ob, "m_mask")
        a = uv.get(ob)
        for i, (_, region, index, colour) in enumerate(self.items):
            u0, v0, u1, v1 = manifest.mask_uv(region, index)
            ls = ob.data.polygons[i].loop_start
            a[ls + 0] = (u0, v0); a[ls + 1] = (u1, v0); a[ls + 2] = (u1, v1); a[ls + 3] = (u0, v1)
            vcol.fill_color(ob, colour, faces=[i])
        uv.put(ob, a)
        return ob


def mask_aspect(region, index=None):
    """Width / height of a tx_mask region (or one of its cells) in pixels."""
    t = manifest.mask_regions(); r = t["regions"][region]
    x, y, w, h = r["px"] if index is None else r["cells"][index]
    return w / h


# ----------------------------------------------------------------------------------------------- vertex colour
def ao_compose(ob, distance=0.5, jitter=0.0, seed=1, gradient=(0.78, 1.08), ao_strength=0.8, samples=128, z_range=None, others=(), hidden=()):
    """Vertex AO, then the art bible's composition in ratio mode (m_prop: the palette cell supplies the colour).
    hidden = objects kept out of the bake (overlay faces that `overlay_join` adds afterwards; decal meshes)."""
    for o in hidden: o.hide_render = True
    vcol.bake_ao_vertex([ob] + list(others), distance=distance, samples=samples)
    for o in hidden: o.hide_render = False
    vcol.compose_vertex_color(ob, mode='ratio', jitter=jitter, seed=seed, gradient=gradient, ao_strength=ao_strength, z_range=z_range)
    for o in others: vcol.compose_vertex_color(o, mode='ratio', jitter=jitter, seed=seed + 7, gradient=gradient, ao_strength=ao_strength, z_range=z_range)
    return ob


def shade(ob, fn):
    """Multiply COLOR_0 by fn(pos (n, 3) world, normal (n, 3) world) -> (n,) or (n, 3): streaks, wear, grime, prints."""
    a = vcol.get_colors(ob, vcol.COLOR)
    k = np.asarray(fn(vcol.corner_positions(ob), vcol.corner_normals(ob)), dtype=np.float32)
    if k.ndim == 1: k = k[:, None]
    a[:, :3] = np.clip(a[:, :3] * k, 0.0, 1.0)
    vcol.set_colors(ob, a, vcol.COLOR)


def grime_below(ob, z0, z1, factor=0.82):
    """Darken toward the foot: x factor at z0 fading to x1 at z1 (the stain below seams, the kicked lower third)."""
    shade(ob, lambda p, n: 1.0 - (1.0 - factor) * np.clip((z1 - p[:, 2]) / max(1e-6, z1 - z0), 0, 1))


def spot(ob, centre, radius, factor=0.7):
    """A soft dark (or, factor > 1, pale) spot round a Blender point: a hand-worn patch, a print, a scorch."""
    c = np.asarray(centre, dtype=np.float32)
    shade(ob, lambda p, n: 1.0 - (1.0 - factor) * np.clip(1.0 - np.linalg.norm(p - c[None, :], axis=1) / radius, 0, 1))


# ----------------------------------------------------------------------------------------------- lamps
def lamp_disc(centre, r, n=6, normal=(0, -1, 0), phase=0.0):
    """One lamp polygon: an n-gon of radius r at `centre` facing `normal` (counter-clockwise seen from the lit side)."""
    nv = Vector(normal).normalized()
    t = nv.orthogonal().normalized() if abs(nv.z) > 0.9 else Vector((0, 0, 1)).cross(nv).normalized()
    b = nv.cross(t)
    c = Vector(centre)
    return [tuple(c + t * (math.cos(phase + TAU * k / n) * r) + b * (math.sin(phase + TAU * k / n) * r)) for k in range(n)]


def lamp_rect(centre, w, h, normal="-y"):
    """One lamp quad w x h at `centre` facing a Decals-style normal."""
    r, u, n = (Vector(a) for a in Decals.FRAMES[normal])
    o = Vector(centre)
    return [tuple(o - r * w / 2 - u * h / 2), tuple(o + r * w / 2 - u * h / 2), tuple(o + r * w / 2 + u * h / 2), tuple(o - r * w / 2 + u * h / 2)]


# ----------------------------------------------------------------------------------------------- animation
def key_curve(arm, bone, keys, axis=1, channel="rot", scale=1.0):
    """Key one bone channel from a list of (frame, value): rot about a bone-local axis (degrees) or loc along it
    (metres x scale)."""
    for f, v in keys:
        vec = [0.0, 0.0, 0.0]
        vec[axis] = math.radians(v) if channel == "rot" else v * scale
        anim.key_pose(arm, f, {bone: {channel: tuple(vec)}})


def finish_actions(ob, acts, linear=()):
    """Short way round for quaternions, optional LINEAR interpolation by action name, then NLA."""
    for a in acts:
        anim.fix_quaternion_flips(a)
        if a.name in linear: anim.set_interpolation(a, 'LINEAR')
    anim.push_to_nla(ob, acts)


def damped(n, amp, cycles, decay=3.0, phase=0.0):
    """[(frame, value)] of a damped swing over n frames: amp * exp(-decay t) * sin(2 pi cycles t + phase), ending at 0."""
    out = []
    for f in range(n + 1):
        t = f / n
        v = amp * math.exp(-decay * t) * math.sin(TAU * cycles * t + phase) * (1.0 - t ** 4)
        out.append((f, v))
    out[-1] = (n, 0.0)
    return out


def std_main(asset, build):
    """The script skeleton shared by every mech asset."""
    import os
    def main():
        args = scene.asset_args(asset + ".py")
        scene.reset_scene()
        build(args)
        export.export_asset(asset, args.out, blend=args.blend)
        if args.preview: export.preview(asset, args.out, clips=True)
    scene.run(main)


# ----------------------------------------------------------------------------------------------- openings
def holed_front(x0, x1, z0, z1, hx0, hx1, hz0, hz1, y):
    """Four quads facing -Y: the rectangle (x0..x1, z0..z1) at depth y with the hole (hx0..hx1, hz0..hz1) left open."""
    return [[(x0, y, z0), (x1, y, z0), (hx1, y, hz0), (hx0, y, hz0)], [(x1, y, z0), (x1, y, z1), (hx1, y, hz1), (hx1, y, hz0)],
            [(x1, y, z1), (x0, y, z1), (hx0, y, hz1), (hx1, y, hz1)], [(x0, y, z1), (x0, y, z0), (hx0, y, hz0), (hx0, y, hz1)]]


def recess(hx0, hx1, hz0, hz1, y, d, back=True):
    """The inside of a hole in a -Y face at depth y: four walls going d deeper (+Y) and the back."""
    out = [[(hx0, y, hz0), (hx1, y, hz0), (hx1, y + d, hz0), (hx0, y + d, hz0)], [(hx0, y, hz1), (hx0, y + d, hz1), (hx1, y + d, hz1), (hx1, y, hz1)],
           [(hx0, y, hz0), (hx0, y + d, hz0), (hx0, y + d, hz1), (hx0, y, hz1)], [(hx1, y, hz0), (hx1, y, hz1), (hx1, y + d, hz1), (hx1, y + d, hz0)]]
    if back: out.append([(hx0, y + d, hz0), (hx1, y + d, hz0), (hx1, y + d, hz1), (hx0, y + d, hz1)])
    return out


def overlay_join(ob, overlays, gradient=(1.0, 1.0)):
    """Join flat overlay faces (hazard paint, bands, ticks laid 1-2 mm over a surface) into `ob` AFTER its AO bake:
    left in the bake they would black out the vertices they cover. Each overlay is composed without AO."""
    for o in overlays:
        vcol.compose_vertex_color(o, mode='ratio', gradient=gradient, jitter=0.0)
    arm = next((m.object for m in ob.modifiers if m.type == 'ARMATURE'), None)
    name = ob.name
    out = mesh.join([ob] + list(overlays), name)
    return out


def relight(ob, lean=0.55, up_fn=None):
    """Lean the shading normals of upright faces up by atan(lean); corners where up_fn(pos (n, 3), normal (n, 3)) is
    true point (almost) straight up. Call it LAST, on the joined mesh: geometry is untouched.

    Release pass p0. A dynamic prop is lit by its room's mood: a small ambient and a key that, in the Pellam rooms
    (moods.ts L3, L4, L5), comes straight down. An upright enamel face took the ambient alone, and a white cabinet stood
    as a navy-black box against lit enamel walls (shots/p0-team-creatures-props/before/locker_front_low.png,
    ammo_bay_front_low.png). Leaning, an upright face takes a share of the key, as the walls beside it do from their
    strips. Under the low sun of the surface the lean changes little (the sun's height is 0.24)."""
    me = ob.data
    n = len(me.loops)
    nrm = np.empty(n * 3, dtype=np.float32); me.corner_normals.foreach_get("vector", nrm); nrm = nrm.reshape(-1, 3)
    vi = np.empty(n, dtype=np.int32); me.loops.foreach_get("vertex_index", vi)
    co = np.empty(len(me.vertices) * 3, dtype=np.float32); me.vertices.foreach_get("co", co); co = co.reshape(-1, 3)[vi]
    out = nrm.copy()
    out[np.abs(nrm[:, 2]) < 0.75, 2] += lean
    if up_fn is not None:
        m = np.asarray(up_fn(co, nrm), dtype=bool) & (nrm[:, 2] > -0.5)
        out[m] = nrm[m] * 0.25 + np.array([[0.0, 0.0, 1.0]], np.float32)
    out /= np.maximum(np.linalg.norm(out, axis=1, keepdims=True), 1e-6)
    me.normals_split_custom_set([tuple(v) for v in out.tolist()])
    me.update()
    return ob


def lift(ob, mask_fn, minimum=0.7):
    """Raise COLOR_0 to at least `minimum` where mask_fn(pos, normal) is true: the back of a door that was baked shut
    against its cabinet is seen once it opens, and must not be AO-black."""
    a = vcol.get_colors(ob, vcol.COLOR)
    m = np.asarray(mask_fn(vcol.corner_positions(ob), vcol.corner_normals(ob)), dtype=bool)
    a[m, :3] = np.maximum(a[m, :3], minimum)
    vcol.set_colors(ob, a, vcol.COLOR)
