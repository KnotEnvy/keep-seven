"""Pellam Deepworks: the mark, stencil lettering, the maker's plate, the livery band (ART_BIBLE 5.6).

Everything here faces Blender -Y (an asset's front) and lies in the XZ plane at y = 0 (relief grows toward -Y), with
the origin stated per function. Pellam is exact: nothing here takes a seed.

The mark, with U = radius from the ring's centre to each disc centre:
    six OPEN discs (outer radius 0.22 U, wall 0.07 U) at 30 + 60 n degrees from the top,
    a stroke 0.08 U wide from the ring's centre (0, 0) straight down to (0, -2.10 U),
    a SOLID seventh disc of radius 0.28 U at (0, -2.38 U).
    Overall box 2.44 U wide x 3.75 U tall. Always upright, never mirrored, never enclosed.
"""
import bpy, bmesh, math
import numpy as np
from mathutils import Vector
from . import mesh, uv, vcol, material, manifest

MARK_W = 2.44        # x U
MARK_H = 3.75        # x U
DISC_R = 0.22; DISC_WALL = 0.07; STROKE_W = 0.08; STROKE_END = -2.10; SEVENTH_R = 0.28; SEVENTH_Y = -2.38


def mark_disc_centres(U=1.0):
    """[(x, z)] centres of the six ring discs (index 0 = upper right, clockwise seen from the front) and the seventh."""
    out = []
    for n in range(6):
        a = math.radians(30 + 60 * n)                       # from the top, clockwise
        out.append((math.sin(a) * U, math.cos(a) * U))
    out.append((0.0, SEVENTH_Y * U))
    return out


def mark_coverage(X, Z, U=1.0, open_discs=True):
    """The mark as a signed distance on numpy grids X (right), Z (UP), same units as U, origin = ring centre.
    Negative inside. This is the single definition both `pellam_mark` and tx_mask's `mark_cast` are drawn from."""
    d = np.full(X.shape, 1e9, dtype=np.float32)
    for (cx, cz) in mark_disc_centres(U)[:6]:
        r = np.hypot(X - cx, Z - cz)
        dd = r - DISC_R * U
        if open_discs: dd = np.maximum(dd, (DISC_R - DISC_WALL) * U - r)
        d = np.minimum(d, dd)
    sx = np.abs(X) - STROKE_W * U / 2; sz = np.abs(Z - STROKE_END * U / 2) - abs(STROKE_END) * U / 2
    d = np.minimum(d, np.maximum(sx, sz))
    d = np.minimum(d, np.hypot(X, Z - SEVENTH_Y * U) - SEVENTH_R * U)
    return d


def mark_centre_offset(U=1.0):
    """Z of the ring centre above the centre of the mark's bounding box (the ink spans z = +1.22 U .. -2.66 U; the
    art bible's 2.44 U x 3.75 U box is that extent trimmed)."""
    top = (1.0 + DISC_R) * U; bottom = (SEVENTH_Y - SEVENTH_R) * U
    return -(top + bottom) / 2.0


def _extrude(bm, relief):
    """Give flat faces at y = 0 a thickness toward -Y: the faces move to the front, side walls close the outline, the
    back stays open. Built by hand in element order (bmesh.ops.extrude_face_region orders its output differently from
    run to run, which would break byte-identical exports)."""
    if relief <= 0: return
    boundary = [e for e in bm.edges if len(e.link_faces) == 1]
    for v in bm.verts: v.co.y -= relief
    back = {}
    for e in boundary:
        a, b = e.verts
        for v in (a, b):
            if v not in back: back[v] = bm.verts.new((v.co.x, v.co.y + relief, v.co.z))
        bm.faces.new((a, b, back[b], back[a]))


def _face_front(bm):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    # recalc on an open flat sheet may choose either side: make the front cap faces look toward -Y
    flat = [f for f in bm.faces if abs(f.normal.y) > 0.5]
    front_y = min((min(v.co.y for v in f.verts) for f in flat), default=0.0)
    for f in flat:
        is_front = abs(min(v.co.y for v in f.verts) - front_y) < 1e-6
        if (f.normal.y > 0) == is_front: f.normal_flip()


def pellam_mark(U, relief=0.0, segments=16, name="pellam_mark", colour="steel_dark", mat="m_prop"):
    """The Pellam mark as geometry. U = ring radius in metres (the mark is 2.44 U wide, 3.75 U tall); origin = the
    RING'S CENTRE (the seventh disc is 2.38 U below it). relief = how far it stands proud toward -Y (0 = flat faces:
    a stencilled mark; 0.002 on plates, 0.010 on the cradle, 0.020 on the wall diagrams).
    segments = sides of each disc (16: about 200 triangles flat, 500 in relief; 8 for small or distant marks).
    Returns one mesh object with material `mat`, UV0 on palette cell `colour`, and a flat Tint (compose after joining).
    The seven disc centres are `brand.mark_disc_centres(U)` (where lamps go on the cradle)."""
    bm = mesh.new_bmesh()
    def ring(cx, cz, ro, ri):
        ov = [bm.verts.new((cx + math.cos(2 * math.pi * k / segments) * ro, 0.0, cz + math.sin(2 * math.pi * k / segments) * ro)) for k in range(segments)]
        if ri <= 0:
            bm.faces.new(ov); return
        iv = [bm.verts.new((cx + math.cos(2 * math.pi * k / segments) * ri, 0.0, cz + math.sin(2 * math.pi * k / segments) * ri)) for k in range(segments)]
        for k in range(segments):
            j = (k + 1) % segments
            bm.faces.new((ov[k], ov[j], iv[j], iv[k]))
    cs = mark_disc_centres(U)
    for (cx, cz) in cs[:6]: ring(cx, cz, DISC_R * U, (DISC_R - DISC_WALL) * U)
    ring(cs[6][0], cs[6][1], SEVENTH_R * U, 0.0)
    w = STROKE_W * U / 2
    bm.faces.new([bm.verts.new(p) for p in ((-w, 0, 0), (w, 0, 0), (w, 0, STROKE_END * U), (-w, 0, STROKE_END * U))])
    _extrude(bm, relief)
    _face_front(bm)
    ob = mesh.new_mesh_object(name, bm)
    material.assign(ob, mat)
    if mat in ("m_prop", "m_flat"): uv.map_to_palette(ob, colour)
    vcol.tint(ob, colour)
    return ob


# ------------------------------------------------------------------ lettering
def _text_object(text, height, tracking, widen):
    cu = bpy.data.curves.new("txt", 'FONT')
    cu.body = text; cu.align_x = 'LEFT'; cu.align_y = 'BOTTOM_BASELINE'
    cu.size = 1.0; cu.space_character = 1.0 + tracking
    cu.resolution_u = 3
    ob = bpy.data.objects.new("txt", cu)
    bpy.context.scene.collection.objects.link(ob)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    bpy.data.objects.remove(ob, do_unlink=True); bpy.data.curves.remove(cu)
    bm = bmesh.new(); bm.from_mesh(me); bpy.data.meshes.remove(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    if not bm.verts: bm.free(); raise ValueError(f"text '{text}' produced no geometry")
    # normalise: capital height = `height`, baseline at 0, left edge at 0, optional widening
    zs = [v.co.y for v in bm.verts]; xs = [v.co.x for v in bm.verts]
    cap = max(zs) - min(zs)
    s = height / cap
    for v in bm.verts:
        v.co = Vector(((v.co.x - min(xs)) * s * widen, 0.0, (v.co.y - min(zs)) * s))
    return bm


def _components(bm):
    """Connected face groups (one per glyph for capitals and digits), left to right."""
    left = set(bm.faces); groups = []
    while left:
        f = left.pop(); grp = [f]; stack = [f]
        while stack:
            g = stack.pop()
            for e in g.edges:
                for h in e.link_faces:
                    if h in left: left.discard(h); grp.append(h); stack.append(h)
        groups.append(grp)
    groups.sort(key=lambda g: min(v.co.x for f in g for v in f.verts))
    return groups


def _counters(tris, x0, x1, z0, z1, res=72):
    """Closed counters of a glyph: [(cx, zmin, zmax)] in glyph units, found by flood-filling the background of a
    small raster from its border."""
    from . import texdraw as td
    w = max(8, int(res * (x1 - x0) / max(z1 - z0, 1e-9))) + 4; h = res + 4
    sx = (w - 4) / max(x1 - x0, 1e-9); sz = (h - 4) / max(z1 - z0, 1e-9)
    px = np.empty((len(tris), 3, 2), dtype=np.float64)
    for i, t in enumerate(tris):
        for k in range(3):
            px[i, k, 0] = (t[k][0] - x0) * sx + 2; px[i, k, 1] = (z1 - t[k][1]) * sz + 2
    ink = td.raster_triangles(px, w, h, ss=2) > 0.5
    bg = ~ink
    reach = np.zeros_like(bg); reach[0, :] = bg[0, :]; reach[-1, :] = bg[-1, :]; reach[:, 0] = bg[:, 0]; reach[:, -1] = bg[:, -1]
    while True:
        grow = reach.copy()
        grow[1:, :] |= reach[:-1, :]; grow[:-1, :] |= reach[1:, :]; grow[:, 1:] |= reach[:, :-1]; grow[:, :-1] |= reach[:, 1:]
        grow &= bg
        if (grow == reach).all(): break
        reach = grow
    holes = bg & ~reach
    out = []
    # split holes into vertical runs (an 8 or a B has two counters, one above the other)
    rows = np.where(holes.any(axis=1))[0]
    if len(rows) == 0: return out
    start = rows[0]; prev = rows[0]
    runs = []
    for r in rows[1:]:
        if r != prev + 1: runs.append((start, prev)); start = r
        prev = r
    runs.append((start, prev))
    for r0, r1 in runs:
        cols = np.where(holes[r0:r1 + 1].any(axis=0))[0]
        if (r1 - r0 + 1) * len(cols) < 12: continue                 # raster speck
        cx = (cols.min() + cols.max() + 1) / 2.0
        out.append(((cx - 2) / sx + x0, z1 - (r1 + 1 - 2) / sz, z1 - (r0 - 2) / sz))
    return out


def _bridge(bm, height, slot):
    """Cut stencil bridges: one thin vertical slot through the strokes above and below every closed counter."""
    for grp in _components(bm):
        fs = set(grp)
        x0 = min(v.co.x for f in grp for v in f.verts); x1 = max(v.co.x for f in grp for v in f.verts)
        z0 = min(v.co.z for f in grp for v in f.verts); z1 = max(v.co.z for f in grp for v in f.verts)
        tris = []
        for f in grp:
            vs = [(v.co.x, v.co.z) for v in f.verts]
            for k in range(1, len(vs) - 1): tris.append((vs[0], vs[k], vs[k + 1]))
        for (cx, cz0, cz1) in _counters(tris, x0, x1, z0, z1):
            lo = max(z0 - 1e-4, cz0 - 0.30 * height); hi = min(z1 + 1e-4, cz1 + 0.30 * height)
            for sign in (-1, 1):
                geom = [g for g in (bm.verts[:] + bm.edges[:] + bm.faces[:])]
                bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(cx + sign * slot / 2, 0, 0), plane_no=(1, 0, 0))
            dead = [f for f in bm.faces if abs(f.calc_center_median().x - cx) < slot / 2 and lo <= f.calc_center_median().z <= hi
                    and x0 - 1e-6 <= f.calc_center_median().x <= x1 + 1e-6]
            if dead: bmesh.ops.delete(bm, geom=dead, context='FACES')


def text_bmesh(text, height, tracking=0.18, bridges=True, widen=1.12, slot=None):
    """Flat lettering as a bmesh in the XZ plane: capital height `height`, baseline at z = 0, left edge at x = 0.
    Wide capitals from Blender's built-in font, tracking +18 %. bridges=True cuts the stencil slots (two thin vertical
    cuts per closed counter). Use only strings that exist in design/story.json, digits and asset numbers `4-nnn`."""
    bm = _text_object(text, height, tracking, widen)
    if bridges: _bridge(bm, height, slot if slot is not None else 0.065 * height)
    return bm


def text_triangles(text, height, tracking=0.18, bridges=True, widen=1.12):
    """(triangles (n, 3, 2) as (x, z) in metres, width, height) of flat lettering: what tx_mask rasterises."""
    bm = text_bmesh(text, height, tracking, bridges, widen)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    tris = np.array([[(v.co.x, v.co.z) for v in f.verts] for f in bm.faces], dtype=np.float64)
    w = max(v.co.x for v in bm.verts); h = max(v.co.z for v in bm.verts)
    bm.free()
    return tris, w, h


def numeral_mesh(text, height, depth=0.004, name=None, colour="steel_dark", mat="m_prop", bridges=True):
    """Geometry numerals / capitals with stencil bridges (anything taller than 0.25 m in the world is geometry, not
    the atlas: the "4" of station plates at 0.4 m, port numerals 1-8 at 0.22 m). Origin = bottom centre of the text;
    `depth` = thickness toward -Y (0 = flat faces to lay 1-2 mm off a surface). Returns a mesh object with `mat`,
    UV0 on palette cell `colour`."""
    bm = text_bmesh(text, height, bridges=bridges)
    w = max(v.co.x for v in bm.verts)
    for v in bm.verts: v.co.x -= w / 2
    _extrude(bm, depth)
    _face_front(bm)
    bm.loops.layers.uv.verify()
    ob = mesh.new_mesh_object(name or ("num_" + "".join(c if c.isalnum() else "_" for c in text.lower())), bm)
    ob.data.uv_layers[0].name = "UVMap"
    material.assign(ob, mat)
    if mat in ("m_prop", "m_flat"): uv.map_to_palette(ob, colour)
    vcol.tint(ob, colour)
    return ob


def maker_plate(number=None, name="maker_plate", decals=True, bevel=0.0, rivet_segments=4):
    """The cast maker's plate every Pellam machine carries: 0.32 x 0.18 m (16:9), 4 mm proud, four corner rivets;
    the mark at the left, PELLAM DEEPWORKS at the right, an asset number beneath (`number` such as "4-112": digits
    from the mask's numerals; never 19 or 99, no added sevens).
    About 50 triangles (bevel > 0 adds a 1-segment bevel to the plate: +34). Origin = back centre; faces -Y. Returns {'plate': mesh (m_prop, palette `steel`), 'decals': mesh (m_mask) or None}.
    The decal quads sit 1 mm off the plate and use tx_mask regions mark_cast, wordmark and numerals; tint them
    with vcol (default `steel_dark`). Join `plate` into the asset's m_prop mesh and `decals` into its m_mask mesh."""
    W, Hh, T = 0.32, 0.18, 0.004
    bm = mesh.new_bmesh()
    mesh.bm_box(bm, (W, T, Hh), (0, -T / 2, 0))
    for sx in (-1, 1):
        for sz in (-1, 1):
            mesh.bm_cylinder(bm, 0.006, 0.003, (sx * (W / 2 - 0.016), -T - 0.0015, sz * (Hh / 2 - 0.016)), segments=rivet_segments,
                             radius_top=0.004, rot=mesh_rot_x(90))
    plate = mesh.new_mesh_object(name, bm)
    mesh.delete_faces(plate, lambda f, c, n: n.y > 0.9)                              # the back and the rivets' undersides
    mesh.finish(plate, bevel=bevel, segments=1)
    material.assign(plate, "m_prop"); uv.map_to_palette(plate, "steel"); vcol.tint(plate, "steel")
    dec = None
    if decals:
        y = -T - 0.001
        quads = []      # (x0, z0, x1, z1, region, index)
        mh = Hh - 0.05; mw = mh * 128.0 / 192.0
        quads.append((-W / 2 + 0.03, -mh / 2, -W / 2 + 0.03 + mw, mh / 2, "mark_cast", None))
        wx0 = -W / 2 + 0.03 + mw + 0.012; ww = W / 2 - 0.028 - wx0; wh = ww * 48.0 / 512.0
        quads.append((wx0, 0.012, wx0 + ww, 0.012 + wh, "wordmark", None))
        if number:
            dh = 0.022; dw = dh * 64.0 / 96.0; x = wx0
            for ch in number:
                if ch.isdigit(): quads.append((x, -0.012 - dh, x + dw, -0.012, "numerals", int(ch)))
                x += dw * (1.0 if ch.isdigit() else 0.6)
        bm = mesh.new_bmesh()
        faces = []
        for (x0, z0, x1, z1, reg, idx) in quads:
            f = bm.faces.new([bm.verts.new(p) for p in ((x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1))])
            faces.append((reg, idx))
        dec = mesh.new_mesh_object(name + "_decals", bm)
        material.assign(dec, "m_mask")
        for i, (reg, idx) in enumerate(faces): uv.map_to_mask(dec, [i], reg, idx)
        vcol.fill_color(dec, "steel_dark")
    return {"plate": plate, "decals": dec}


def mesh_rot_x(deg):
    """Rotation matrix about X (helper for cylinders that must point along -Y / +Y)."""
    from mathutils import Matrix
    return Matrix.Rotation(math.radians(deg), 4, 'X')


def livery_band(points, z=1.2, height=0.10, offset=0.002, closed=False, name="livery_band", colour="livery", mat="m_prop"):
    """The painted 10 cm livery band at 1.2 m above the floor: a strip of quads following the plan polyline `points`
    [(x, y), ...] (Blender XY, walked so the VISIBLE side is on the RIGHT of the walking direction... i.e. the
    outward normal is to the right), centred at height `z` (relative to the points' frame), pushed `offset` off the
    wall. closed=True joins the last point to the first (round a room; break it at doors by calling it per run).
    Non-emissive paint. Returns a mesh object with `mat`, UV0 on palette cell `colour`."""
    pts = [Vector((p[0], p[1], 0.0)) for p in points]
    n = len(pts)
    if n < 2: raise ValueError("livery_band: at least two points")
    bm = mesh.new_bmesh()
    segs = [(i, (i + 1) % n) for i in range(n if closed else n - 1)]
    for i, j in segs:
        d = (pts[j] - pts[i]);
        if d.length < 1e-6: continue
        d.normalize()
        nrm = Vector((d.y, -d.x, 0.0))                              # to the right of the direction of travel
        a = pts[i] + nrm * offset; b = pts[j] + nrm * offset
        vs = [bm.verts.new((a.x, a.y, z - height / 2)), bm.verts.new((b.x, b.y, z - height / 2)),
              bm.verts.new((b.x, b.y, z + height / 2)), bm.verts.new((a.x, a.y, z + height / 2))]
        f = bm.faces.new(vs)
        f.normal_update()
        if f.normal.dot(nrm) < 0: f.normal_flip()
    ob = mesh.new_mesh_object(name, bm)
    material.assign(ob, mat)
    if mat in ("m_prop", "m_flat"): uv.map_to_palette(ob, colour)
    vcol.tint(ob, colour)
    return ob
