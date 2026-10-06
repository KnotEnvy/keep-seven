"""Geometry kit of the Windlass (helper of blender/boss/boss_windlass.py; builder art-boss-windlass).

Everything is authored in GAME coordinates (metres, +Y up, the arm's heading +Z, a viewer in front of the drum sees +X on
her right) or in a frame derived from them, and written to Blender through `G2B` (game (x, y, z) -> Blender (x, -z, y),
a pure rotation, so winding is kept). Faces are wound by rule, never by `recalc_face_normals` (open shells: lids,
panels, recesses):

    lathe / strip   two rings of the same count, the second ring FURTHER along the profile; ring points run
                    counter-clockwise about the axis. The normal is the profile direction turned clockwise in the
                    (r, h) half-plane: up the side -> outward, inward across a top -> +h, down a bore -> toward the axis.
    prism           a polygon counter-clockwise seen from +h.
"""
import bpy, bmesh, math
import numpy as np
from mathutils import Matrix, Vector
from lib import mesh, material, uv, vcol

G2B = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
SHADE = "ks_shade"            # per-face int, percent: a multiplier on the composed colour (100 = none; 0 = unset = 100)


def gb(p):
    """Game point -> Blender point."""
    return Vector((p[0], -p[2], p[1]))


def frame(origin, zaxis, xaxis=(1, 0, 0)):
    """A right-handed frame as a matrix: local z -> `zaxis`, local x -> `xaxis` (made perpendicular), at `origin`."""
    z = Vector(zaxis).normalized(); x = Vector(xaxis); x = (x - z * x.dot(z)).normalized(); y = z.cross(x)
    m = Matrix.Identity(4)
    for i in range(3): m[i][0] = x[i]; m[i][1] = y[i]; m[i][2] = z[i]; m[i][3] = origin[i]
    return m


def rot_z(deg):
    return Matrix.Rotation(math.radians(deg), 4, 'Z')


class Geo:
    """A bmesh under construction. Points are given in a local frame; `M` maps that frame to GAME space."""

    def __init__(self, M=None):
        self.bm = mesh.new_bmesh()
        self.M = G2B @ (M if M is not None else Matrix.Identity(4))

    def vert(self, p, F=None):
        q = Vector((p[0], p[1], p[2]))
        if F is not None: q = F @ q
        return self.bm.verts.new(self.M @ q)

    def face(self, verts):
        vs = [v for i, v in enumerate(verts) if v is not verts[i - 1]]
        if len(vs) >= 3: return self.bm.faces.new(vs)
        return None

    def strip(self, a, b, closed=True):
        """Quads between two vertex rings of equal length (see the module docstring for the winding)."""
        n = len(a)
        for k in range(n if closed else n - 1):
            j = (k + 1) % n
            if a[k] is a[j] and b[k] is b[j]: continue
            if a[k] is a[j]: self.face((a[k], b[j], b[k]))
            elif b[k] is b[j]: self.face((a[k], a[j], b[k]))
            else: self.face((a[k], a[j], b[j], b[k]))

    def ring(self, pts2d, h, F=None):
        """Vertices for a polygon [(x, y)] at height h."""
        return [self.vert((p[0], p[1], h), F) for p in pts2d]

    def lathe(self, profile, n, F=None, phase=0.0):
        """Revolve [(r, h), ...] about local z in `n` segments. r = 0 gives an apex (a fan). Returns the rings."""
        rings = []
        for (r, h) in profile:
            if r <= 1e-9:
                v = self.vert((0, 0, h), F); rings.append([v] * n)
            else:
                rings.append([self.vert((r * math.cos(phase + 2 * math.pi * j / n), r * math.sin(phase + 2 * math.pi * j / n), h), F) for j in range(n)])
        for i in range(len(rings) - 1): self.strip(rings[i], rings[i + 1])
        return rings

    def prism(self, poly, h0, h1, F=None, caps=(True, True)):
        """Extrude a polygon (counter-clockwise seen from +h) from h0 up to h1."""
        if poly_area(poly) < 0: poly = list(reversed(poly))
        a = self.ring(poly, h0, F); b = self.ring(poly, h1, F)
        self.strip(a, b)
        if caps[0]: self.face(list(reversed(a)))
        if caps[1]: self.face(b)
        return a, b

    def box(self, size, centre, F=None, R=None):
        """A box of full extents `size` about `centre`; R = an optional rotation (3x3 or 4x4) about the centre."""
        c = Vector(centre); vs = {}
        for ix in (0, 1):
            for iy in (0, 1):
                for iz in (0, 1):
                    d = Vector(((ix - 0.5) * size[0], (iy - 0.5) * size[1], (iz - 0.5) * size[2]))
                    if R is not None: d = R.to_3x3() @ d
                    vs[(ix, iy, iz)] = self.vert(c + d, F)
        for q in (((1, 0, 0), (1, 1, 0), (1, 1, 1), (1, 0, 1)), ((0, 0, 0), (0, 0, 1), (0, 1, 1), (0, 1, 0)),
                  ((0, 1, 0), (0, 1, 1), (1, 1, 1), (1, 1, 0)), ((0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1)),
                  ((0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)), ((0, 0, 0), (0, 1, 0), (1, 1, 0), (1, 0, 0))):
            self.face([vs[k] for k in q])

    def span(self, x, y, z, F=None, R=None):
        """A box from its extents: x = (x0, x1), y = (y0, y1), z = (z0, z1)."""
        self.box((x[1] - x[0], y[1] - y[0], z[1] - z[0]), ((x[0] + x[1]) / 2, (y[0] + y[1]) / 2, (z[0] + z[1]) / 2), F, R)

    def fill(self, loops, h, F=None, up=True):
        """A flat face with holes: `loops` = [outer polygon, hole polygon, ...] (any winding) at height h, triangulated.
        up = the faces look toward +h of the frame."""
        edges = []
        for poly in loops:
            vs = self.ring(poly, h, F)
            for k in range(len(vs)): edges.append(self.bm.edges.new((vs[k], vs[(k + 1) % len(vs)])))
        nz = Vector((0, 0, 1 if up else -1))
        if F is not None: nz = F.to_3x3() @ nz
        nz = (self.M.to_3x3() @ nz).normalized()
        r = bmesh.ops.triangle_fill(self.bm, use_beauty=True, use_dissolve=False, edges=edges, normal=nz)
        for f in [g for g in r['geom'] if isinstance(g, bmesh.types.BMFace)]:
            f.normal_update()
            if f.normal.dot(nz) < 0: f.normal_flip()

    def done(self, name, cell, shade=100, bevel=0.0, smooth=35, weld=False, tess=0.0):
        """-> a finished m_prop part: bevel / smooth / weighted normals, palette cell on UV0, Tint, the shade mark.
        tess = longest edge (metres) for a long part whose ends sit in other parts (a vertex AO bake samples only at
        vertices: without loops along it, it bakes dark from end to end)."""
        if weld: bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts[:], dist=1e-5)
        ob = mesh.new_mesh_object(name, self.bm)
        mesh.finish(ob, bevel=bevel, smooth_angle=smooth)
        if tess: mesh.tessellate_max_edge(ob, tess)
        return paint(ob, cell, shade)


def paint(ob, cell, shade=100):
    material.assign(ob, "m_prop"); uv.map_to_palette(ob, cell); vcol.tint(ob, cell)
    set_shade(ob, shade)
    return ob


def set_shade(ob, shade, faces=None):
    me = ob.data
    at = me.attributes.get(SHADE) or me.attributes.new(SHADE, 'INT', 'FACE')
    vals = np.zeros(len(me.polygons), dtype=np.int32); at.data.foreach_get("value", vals)
    if faces is None: vals[:] = int(shade)
    else: vals[np.asarray(list(faces), dtype=np.int64)] = int(shade)
    me.attributes[SHADE].data.foreach_set("value", vals)


def set_mark(ob, name, value=1):
    """A per-face int mark `name` on every face of a part (it survives mesh.join; unmarked faces read 0)."""
    me = ob.data
    at = me.attributes.get(name) or me.attributes.new(name, 'INT', 'FACE')
    me.attributes[name].data.foreach_set("value", np.full(len(me.polygons), int(value), dtype=np.int32))


def shade_from_color(ob):
    """Keep the per-face variation a library part already painted into `Color` (the knot's facets) as the shade mark."""
    me = ob.data
    col = vcol.get_colors(ob)[:, :3].mean(axis=1)
    pol = vcol.poly_of_loop(ob)
    per = np.zeros(len(me.polygons)); cnt = np.zeros(len(me.polygons))
    np.add.at(per, pol, col); np.add.at(cnt, pol, 1.0)
    per = per / np.maximum(cnt, 1)
    per = per / max(per.mean(), 1e-6)
    at = me.attributes.get(SHADE) or me.attributes.new(SHADE, 'INT', 'FACE')
    me.attributes[SHADE].data.foreach_set("value", np.round(per * 100).astype(np.int32))


def apply_shade(ob):
    """Multiply `Color` by the shade mark and drop the mark."""
    me = ob.data
    at = me.attributes.get(SHADE)
    if at is None: return
    vals = np.zeros(len(me.polygons), dtype=np.int32); at.data.foreach_get("value", vals)
    k = np.where(vals <= 0, 100, vals).astype(np.float32) / 100.0
    a = vcol.get_colors(ob)
    a[:, :3] = np.clip(a[:, :3] * k[vcol.poly_of_loop(ob)][:, None], 0.0, 1.0)
    vcol.set_colors(ob, a)
    me.attributes.remove(me.attributes[SHADE])


def share_colors(ob):
    """One colour per VERTEX: every corner of a vertex gets the mean of its corners' colours. Vertex AO is baked per
    corner, and corners that differ by a hair split the vertex in the file; shared, a smooth part exports about half
    the vertices (the download share of this asset is set by its vertex count)."""
    me = ob.data
    a = vcol.get_colors(ob)
    li = np.empty(len(me.loops), dtype=np.int32); me.loops.foreach_get("vertex_index", li)
    acc = np.zeros((len(me.vertices), 4), dtype=np.float64); cnt = np.zeros(len(me.vertices), dtype=np.float64)
    np.add.at(acc, li, a); np.add.at(cnt, li, 1.0)
    vcol.set_colors(ob, (acc / np.maximum(cnt, 1.0)[:, None])[li])


def bone_tag(ob, bone):
    """Weight every vertex of a part 1.0 to `bone` (the group survives mesh.join by name)."""
    for g in list(ob.vertex_groups): ob.vertex_groups.remove(g)
    vg = ob.vertex_groups.new(name=bone)
    vg.add(range(len(ob.data.vertices)), 1.0, 'REPLACE')
    return ob


def circle(r, n, cx=0.0, cy=0.0, phase=0.0):
    """n points counter-clockwise from angle `phase` (radians, from +x)."""
    return [(cx + r * math.cos(phase + 2 * math.pi * k / n), cy + r * math.sin(phase + 2 * math.pi * k / n)) for k in range(n)]


def clip_poly(poly, a, b, c):
    """Sutherland-Hodgman: keep the part of a convex polygon where a x + b y + c >= 0."""
    out = []
    n = len(poly)
    for i in range(n):
        p = poly[i]; q = poly[(i + 1) % n]
        dp = a * p[0] + b * p[1] + c; dq = a * q[0] + b * q[1] + c
        if dp >= -1e-9: out.append(p)
        if (dp > 1e-9 and dq < -1e-9) or (dp < -1e-9 and dq > 1e-9):
            t = dp / (dp - dq)
            out.append((p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t))
    # drop repeats
    res = []
    for p in out:
        if not res or (abs(p[0] - res[-1][0]) > 1e-7 or abs(p[1] - res[-1][1]) > 1e-7): res.append(p)
    if len(res) > 1 and abs(res[0][0] - res[-1][0]) < 1e-7 and abs(res[0][1] - res[-1][1]) < 1e-7: res.pop()
    return res


def poly_area(poly):
    return 0.5 * sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1] for i in range(len(poly)))


def make_rig(name, bones):
    """Like lib.rig.make_armature, with the roll stated: bones = [(name, head, tail, parent | None, z_axis)], all in
    BLENDER space; the bone's local Z is aligned to `z_axis`. Pose rotation mode QUATERNION."""
    from lib.scene import link, select_only, must
    arm = bpy.data.armatures.new(name)
    ob = bpy.data.objects.new(name, arm)
    link(ob)
    select_only(ob)
    must(bpy.ops.object.mode_set(mode='EDIT'), "armature edit mode")
    for (bname, head, tail, parent, zaxis) in bones:
        eb = arm.edit_bones.new(bname)
        eb.head = head; eb.tail = tail
        eb.align_roll(Vector(zaxis))
        if parent: eb.parent = arm.edit_bones[parent]; eb.use_connect = False
    must(bpy.ops.object.mode_set(mode='OBJECT'), "armature object mode")
    for pb in ob.pose.bones: pb.rotation_mode = 'QUATERNION'
    return ob
