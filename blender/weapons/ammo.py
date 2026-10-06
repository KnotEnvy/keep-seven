"""The ammunition family: ONE cartridge function for the world props, the pickups and the rounds in the gun
(art-weapons 4.3: "build them from one function"). Helper module of the scripts in blender/weapons/.

A cartridge stands on its head: case head centre at the origin, nose toward +Z (Blender up = game +Y). Millimetres:
    case 12 x 33, overall 41, rim 13 x 1.5 (hero rounds only), bullet 11.5 at the mouth;
    line round: an `enamel` nose and an AQUA EMISSIVE ring at the shoulder (31.4 .. 33);
    kept round: the band, an `kept_band` (enamel) sleeve from 12 to 21 mm round the waist with a `livery` hairline at
    16 .. 17 mm (a thin ring floating 0.2 mm proud of the sleeve, so a 48-triangle prop can afford it).
`cartridge()` returns one m_prop mesh object with UV0 on the palette cells, the "Tint" attribute painted and smooth
shading. Triangles: sides n, world props: lead 40 (n 7), line 46 (n 6), kept 48 (n 5); hero (n 8, rim, ogive) 92 .. 140.
"""
import bpy, bmesh, math
import numpy as np
from mathutils import Vector, Matrix
from lib import mesh, material, uv, vcol

MM = 0.001
CASE_R, CASE_L, OAL = 6.0, 33.0, 41.0
RIM_R, RIM_T = 6.5, 1.5
BAND_Z0, BAND_Z1, BAND_R = 12.0, 21.0, 6.5
HAIR_Z0, HAIR_Z1, HAIR_R = 16.0, 17.0, 6.75
LEAD = "gun_worn"              # grey lead (the palette's cool dark grey)
INSIDE = "ash_dark"            # the dark inside an empty case


def cartridge(name, kind="lead", n=6, rim=False, spent=False, nose="cone", hairline="livery", phase=0.0):
    """kind: 'lead' | 'line' | 'kept'. spent=True: the empty case, mouth open. nose: 'cone' (a fan to the tip: the
    budget form) | 'ogive' (two rings and a flat tip: hero rounds). hairline: palette cell of the kept band's line
    ('livery'; 'violet' = the emissive cell for the stone's seventh). Returns the object (metres)."""
    bm = bmesh.new(); bm.loops.layers.uv.new("UVMap")
    faces = []                    # (face, colour, emissive?)

    def ring(z, r):
        return [bm.verts.new((r * math.sin(phase + 2 * math.pi * k / n), -r * math.cos(phase + 2 * math.pi * k / n), z)) for k in range(n)]

    def strip(A, B, colour, emis=False):
        for k in range(n):
            faces.append((bm.faces.new((A[k], A[(k + 1) % n], B[(k + 1) % n], B[k])), colour, emis))

    def fan(A, z, colour, up=True):
        c = bm.verts.new((0, 0, z))
        for k in range(n):
            f = bm.faces.new((A[k], A[(k + 1) % n], c) if up else (A[(k + 1) % n], A[k], c))
            faces.append((f, colour, False))

    def cap(A, colour, up=True):
        faces.append((bm.faces.new(A if up else list(reversed(A))), colour, False))

    nose_col = {"lead": LEAD, "line": "enamel", "kept": LEAD}[kind]
    # ---- head and case wall
    if rim:
        r1 = ring(0.0, RIM_R); r2 = ring(RIM_T, RIM_R); r3 = ring(RIM_T + 0.5, CASE_R)
        cap(r1, "brass", up=False); strip(r1, r2, "brass"); strip(r2, r3, "brass")
        base = r3
    else:
        base = ring(0.0, CASE_R); cap(base, "brass", up=False)
    top_z = CASE_L
    if kind == "kept":
        # the band is a SLEEVE round the case (0.5 mm of enamel), the hairline a ring round the sleeve: the case wall stays
        # one strip, which is what lets a 48-triangle prop afford a round nose
        mouth = ring(top_z, CASE_R); strip(base, mouth, "brass")
        b0 = ring(BAND_Z0, BAND_R); b1 = ring(BAND_Z1, BAND_R); strip(b0, b1, "kept_band")
        h0 = ring(HAIR_Z0, HAIR_R); h1 = ring(HAIR_Z1, HAIR_R)
        strip(h0, h1, hairline, emis=(hairline != "livery"))
    elif kind == "line" and not spent:
        s0 = ring(CASE_L - 1.6, CASE_R); mouth = ring(top_z, CASE_R + 0.05)
        strip(base, s0, "brass"); strip(s0, mouth, "aqua", emis=True)
    else:
        mouth = ring(top_z, CASE_R); strip(base, mouth, "brass")
    # ---- nose, or the open mouth
    if spent:
        if nose == "ogive":
            lip = ring(top_z - 0.3, CASE_R - 0.75); strip(mouth, lip, "brass")
            deep = ring(top_z - 9.0, CASE_R - 0.9); strip(lip, deep, INSIDE); cap(deep, INSIDE, up=True)
        elif n >= 7:
            lip = ring(top_z - 0.8, CASE_R - 0.8); strip(mouth, lip, INSIDE); fan(lip, top_z - 7.0, INSIDE)
        else:
            fan(mouth, top_z - 6.0, INSIDE)
    elif nose == "ogive":
        o1 = ring(36.6, 5.35); o2 = ring(39.4, 3.9); o3 = ring(OAL, 1.9)
        strip(mouth, o1, nose_col); strip(o1, o2, nose_col); strip(o2, o3, nose_col); cap(o3, nose_col)
    elif nose == "ogive2":                                     # the rounds of the left arm: one ring and a flat tip (round-nosed)
        o1 = ring(38.3, 5.0); o2 = ring(OAL, 2.7)
        strip(mouth, o1, nose_col); strip(o1, o2, nose_col); cap(o2, nose_col)
    elif n >= 6 or kind == "kept":                             # a blunt round nose: the ring high and wide, a shallow crown (it read as a crayon)
        o1 = ring(38.9, 4.75); strip(mouth, o1, nose_col); fan(o1, OAL, nose_col)
    else:
        fan(mouth, OAL, nose_col)
    for f, _, _ in faces: f.smooth = True
    order = {f.index: (c, e) for f, c, e in faces}
    bm.faces.index_update()
    cols = [(c, e) for f, c, e in faces]
    bmesh.ops.scale(bm, vec=(MM, MM, MM), verts=bm.verts[:])
    ob = mesh.new_mesh_object(name, bm)
    mesh.finish(ob, bevel=0.0, smooth_angle=(48.0 if n >= 8 else 76.0), weighted=False)      # the case wall is round (5 sides turn 72 degrees); head and mouth stay crisp
    material.assign(ob, "m_prop")
    by = {}
    for i, (c, e) in enumerate(cols): by.setdefault((c, e), []).append(i)
    for (c, e), idx in by.items():
        (uv.map_to_emis if e else uv.map_to_palette)(ob, c, idx)
        vcol.tint(ob, c, idx)
    return ob


def tri_count(kind, n, rim, spent, nose):
    """For the docs and the tests: triangles of a variant."""
    ob = cartridge("_count", kind, n, rim, spent, nose)
    t = mesh.tri_count(ob)
    bpy.data.objects.remove(ob, do_unlink=True)
    return t


def finish_prop(ob, seed=1, ground=True, ao_min=0.0):
    """AO + height ramp into COLOR_0 (ratio mode: the palette supplies the colour) and a contact shade at the foot."""
    vcol.bake_ao_vertex([ob], distance=0.03)
    a = vcol.get_colors(ob, "AO"); a[:, :3] = np.maximum(a[:, :3], ao_min); vcol.set_colors(ob, a, "AO")    # no smear across a case quad
    vcol.compose_vertex_color(ob, mode='ratio', jitter=0.0, seed=seed, gradient=(0.8, 1.1))
    if ground: vcol.darken_contact(ob, height=0.004, factor=0.7)
    return ob
