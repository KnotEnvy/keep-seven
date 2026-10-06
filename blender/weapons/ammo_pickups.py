"""Helper of pk_rounds_6.py and pk_rounds_12.py: small bmesh builders for the two ammunition pickups (millimetres in,
metres out; each face carries its palette cell). Pickups are modelled 1.6 x life so they read on the ground."""
import math
import bmesh
from mathutils import Vector
from lib import mesh, material, uv, vcol

MM = 0.001


class Build:
    def __init__(self):
        self.bm = bmesh.new(); self.bm.loops.layers.uv.new("UVMap"); self.col = []

    def v(self, p): return self.bm.verts.new(Vector(p) * MM)

    def face(self, vs, colour):
        f = self.bm.faces.new(vs); self.col.append((f, colour)); return f

    def quad(self, a, b, c, d, colour): return self.face([a, b, c, d], colour)

    def disc(self, centre, r, h, n, colour, wall=True):
        """A raised n-gon (a case head): cap at centre.z + h, wall down to centre.z."""
        cx, cy, cz = centre
        top = [self.v((cx + r * math.cos(2 * math.pi * k / n + 0.3), cy + r * math.sin(2 * math.pi * k / n + 0.3), cz + h)) for k in range(n)]
        self.face(top, colour)
        if wall:
            bot = [self.v((cx + r * math.cos(2 * math.pi * k / n + 0.3), cy + r * math.sin(2 * math.pi * k / n + 0.3), cz)) for k in range(n)]
            for k in range(n): self.quad(bot[k], bot[(k + 1) % n], top[(k + 1) % n], top[k], colour)
        return top

    def finish(self, name, recalc=True, smooth=40.0):
        bm = self.bm
        if recalc: bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        bm.faces.index_update()
        cols = [c for _, c in sorted(((f.index, c) for f, c in self.col), key=lambda t: t[0])]
        ob = mesh.new_mesh_object(name, bm)
        mesh.finish(ob, bevel=0.0, smooth_angle=smooth, weighted=True)
        material.assign(ob, "m_prop")
        by = {}
        for i, c in enumerate(cols): by.setdefault(c, []).append(i)
        for c, idx in by.items():
            uv.map_to_palette(ob, c, idx); vcol.tint(ob, c, idx)
        return ob


def prism(B, outline, x0, x1, colour, caps=True, jitter=None):
    """A side profile [(y, z)] extruded along X from x0 to x1 (mm). jitter(i, side) -> (dx, dy, dz) crumples paper."""
    a = []; b = []
    for i, (y, z) in enumerate(outline):
        ja = jitter(i, 0) if jitter else (0, 0, 0); jb = jitter(i, 1) if jitter else (0, 0, 0)
        a.append(B.v((x0 + ja[0], y + ja[1], z + ja[2]))); b.append(B.v((x1 + jb[0], y + jb[1], z + jb[2])))
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        B.quad(a[i], a[j], b[j], b[i], colour)
    if caps:
        B.face(list(reversed(a)), colour); B.face(b, colour)
    return a, b
