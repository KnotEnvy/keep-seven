"""The knot: the shared weak point (ART_BIBLE 6), built identically by three owners.

A clustered growth of 5-9 faceted lobes (squashed icospheres, 20 triangles each) packed round one larger central
lobe (at least 40 % of the knot's diameter seen from the front), sitting in a dark collar 1.3x its diameter:
'clustered' (an irregular seven-lobed growth, on hoods) or 'hex' (a flat six-sided plate with a 20 mm lip, on
machines). The lobes' ALBEDO is husk grey and their violet is EMISSIVE ONLY (palette cells `violet` / `violet_core`
hold husk grey in tx_palette and the glow in tx_palette_emis), so a burst knot is the same lobes with the emissive
off. The pulse is a shader term, never an animation.
"""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix
from . import mesh, uv, vcol, material


def build_knot(radius, collar='clustered', seed=1, lobes=None, name="knot"):
    """Build a knot of visual `radius` (metres) facing Blender -Y (the asset's front), its collar's back centre at
    the origin. Returns {'lobes': object, 'collar': object}, both with material m_prop, UV0 on the palette
    (lobes: `violet`, central lobe: `violet_core`; collar: `steel_dark`), and COLOR_0 shading.

    collar: 'hex' (machines: plate 1.3 x the diameter across, 20 mm lip) | 'clustered' (hoods: seven dark lobes).
    lobes:  number of outer lobes, 5..9 (default: seeded choice of 6 or 7).
    Keep `lobes` as its own node named `<name>_live` on rigid assets (code squashes it when the knot bursts); join
    both into the skinned mesh on creatures. About 160-200 triangles."""
    if collar not in ('clustered', 'hex'): raise ValueError("build_knot: collar is 'clustered' or 'hex'")
    rng = random.Random(seed)
    n = lobes if lobes is not None else rng.choice((6, 7))
    if not 5 <= n <= 9: raise ValueError("build_knot: 5 to 9 outer lobes")
    depth = radius * 0.5                                           # the plate / growth thickness behind the lobes
    # ---- lobes
    bm = mesh.new_bmesh()
    def lobe(centre, r, squash, tilt):
        vs = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r)['verts']
        bmesh.ops.scale(bm, vec=(1.0, squash, 1.0), verts=vs)
        bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=tilt, verts=vs)
        bmesh.ops.translate(bm, vec=centre, verts=vs)
        return vs
    rc = radius * 0.48                                             # central lobe: 48 % of the diameter
    central = lobe((0, -depth - rc * 0.45, 0), rc, 0.7, Matrix.Rotation(rng.uniform(0, 6.28), 4, 'Y'))
    core_faces = {f.index for f in bm.faces}
    bm.faces.ensure_lookup_table()
    core_n = len(bm.faces)
    ro = radius * 0.34
    for i in range(n):
        a = 2 * math.pi * (i + rng.uniform(-0.18, 0.18)) / n
        d = radius - ro * rng.uniform(0.82, 1.0)
        r = ro * rng.uniform(0.78, 1.08)
        tilt = Matrix.Rotation(rng.uniform(0, 6.28), 4, 'Y') @ Matrix.Rotation(rng.uniform(-0.5, 0.5), 4, 'X')
        lobe((math.cos(a) * d, -depth - r * 0.30 * rng.uniform(0.6, 1.1), math.sin(a) * d), r, 0.62, tilt)
    lobes_ob = mesh.new_mesh_object(name + "_live", bm)
    mesh.finish(lobes_ob, bevel=0.0, smooth_angle=20, weighted=False)         # faceted: every edge stays sharp
    material.assign(lobes_ob, "m_prop")
    uv.map_to_palette(lobes_ob, "violet")
    uv.map_to_palette(lobes_ob, "violet_core", faces=range(core_n))
    vcol.tint(lobes_ob, "husk")
    vcol.compose_vertex_color(lobes_ob, mode='ratio', gradient=(0.8, 1.05), jitter=0.10, seed=seed)
    # ---- collar
    R = radius * 1.3
    bm = mesh.new_bmesh()
    if collar == 'hex':
        lip = 0.02
        outer = [Vector((math.cos(math.pi / 6 + k * math.pi / 3) * R, 0.0, math.sin(math.pi / 6 + k * math.pi / 3) * R)) for k in range(6)]
        inner = [v * ((R - lip * 1.6) / R) for v in outer]
        y_face = -depth * 0.55; y_lip = -depth
        ov = [bm.verts.new((v.x, 0.0, v.z)) for v in outer]            # back rim (against the surface)
        lv = [bm.verts.new((v.x, y_lip, v.z)) for v in outer]          # lip top, outside
        li = [bm.verts.new((v.x, y_lip, v.z)) for v in inner]          # lip top, inside
        fv = [bm.verts.new((v.x, y_face, v.z)) for v in inner]         # recessed face
        for k in range(6):
            j = (k + 1) % 6
            bm.faces.new((ov[k], ov[j], lv[j], lv[k]))                 # outer wall
            bm.faces.new((lv[k], lv[j], li[j], li[k]))                 # lip top
            bm.faces.new((li[k], li[j], fv[j], fv[k]))                 # inner wall
        bm.faces.new(fv)                                               # the plate face
    else:
        for i in range(7):
            a = 2 * math.pi * (i + rng.uniform(-0.25, 0.25)) / 7
            r = R * rng.uniform(0.40, 0.52)
            d = R - r * rng.uniform(0.75, 0.95)
            vs = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r)['verts']
            bmesh.ops.scale(bm, vec=(1.0, 0.42, 1.0), verts=vs)
            bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(rng.uniform(0, 6.28), 4, 'Y'), verts=vs)
            bmesh.ops.translate(bm, vec=(math.cos(a) * d, -depth * 0.45, math.sin(a) * d), verts=vs)
        # nothing behind the surface it grows on
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, 0), plane_no=(0, 1, 0), clear_outer=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    collar_ob = mesh.new_mesh_object(name + "_collar", bm)
    mesh.finish(collar_ob, bevel=0.0, smooth_angle=25, weighted=False)
    material.assign(collar_ob, "m_prop")
    uv.map_to_palette(collar_ob, "steel_dark" if collar == 'hex' else "cable")
    vcol.tint(collar_ob, "steel_dark" if collar == 'hex' else "cable")
    vcol.compose_vertex_color(collar_ob, mode='ratio', gradient=(0.8, 1.05), jitter=0.0 if collar == 'hex' else 0.08, seed=seed + 1)
    return {"lobes": lobes_ob, "collar": collar_ob}
