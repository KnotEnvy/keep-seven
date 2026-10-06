"""Vertex colour: COLOR_0 is where this game is painted (ART_BIBLE 4.1, 4.5; ARCHITECTURE 7.2).

What the exported `Color` attribute (COLOR_0, LINEAR, corner domain) must hold:
    m_frontier / m_pellam / m_sand, lightmapped vertices   albedo tint x AO
    m_frontier / m_pellam / m_sand, vertex-lit vertices    albedo tint x baked light / 2, clamped to 1  (bake_vertex_light)
    m_prop (palette supplies the colour through UV0)       AO x gradients, as a multiplier round 1    (compose mode 'ratio')
    m_flat                                                 gradients, light (backdrops)
    m_emis                                                 R intensity, G flicker group, B wrong_fade (emis_attr)

Typical prop:   vcol.tint(part, 'board') on each part -> join -> vcol.bake_ao_vertex([ob]) ->
                vcol.compose_vertex_color(ob, mode='ratio', jitter=0.06)
Only the attribute named "Color" is exported (export_vertex_color='ACTIVE'); helper layers are removed by compose.
"""
import bpy, time, math
import numpy as np
from . import manifest
from .scene import deselect_all

COLOR = "Color"
TINT = "Tint"
VERTEX_LIGHT_SCALE = 2.0
VL_FACE = "ks_vl"            # per-FACE int attribute: 1 = `Color` of this face holds tint x light / 2 (mark_vertex_lit)


def color_layer(ob, name=COLOR):
    """Get or create the float corner colour attribute `name` and make it the active and render one."""
    me = ob.data
    ca = me.color_attributes.get(name) or me.color_attributes.new(name, 'FLOAT_COLOR', 'CORNER')
    me.color_attributes.active_color = ca
    me.color_attributes.render_color_index = me.color_attributes.find(name)
    return ca


def get_colors(ob, name=COLOR):
    """Per-corner colours as an (n_loops, 4) float array (linear)."""
    ca = ob.data.color_attributes[name]
    a = np.empty(len(ca.data) * 4, dtype=np.float32); ca.data.foreach_get("color", a)
    return a.reshape(-1, 4)


def set_colors(ob, arr, name=COLOR):
    """Write an (n_loops, 4) array (linear) into attribute `name` (created when missing; becomes active)."""
    ca = color_layer(ob, name)
    ca.data.foreach_set("color", np.ascontiguousarray(arr, dtype=np.float32).ravel()); ob.data.update()


def adopt_imported(ob, name=COLOR):
    """Make the colour data of an IMPORTED mesh (any name, byte or float, point or corner domain) the float corner
    attribute `name`, and drop every other colour attribute. White when the mesh has none. No operators involved."""
    me = ob.data
    src = me.color_attributes.active_color or (me.color_attributes[0] if len(me.color_attributes) else None)
    if src is None: a = np.ones((len(me.loops), 4), dtype=np.float32)
    else:
        a = np.empty(len(src.data) * 4, dtype=np.float32); src.data.foreach_get("color", a); a = a.reshape(-1, 4)
        if src.domain == 'POINT':
            li = np.empty(len(me.loops), dtype=np.int32); me.loops.foreach_get("vertex_index", li); a = a[li]
    for n in [c.name for c in me.color_attributes]: me.color_attributes.remove(me.color_attributes[n])
    set_colors(ob, a, name)


def rgb(colour):
    """A colour argument -> linear (r, g, b): a palette name ('board'), a '#RRGGBB' string (sRGB) or an (r, g, b) tuple (linear)."""
    if isinstance(colour, str):
        return manifest.hex_to_linear(colour) if colour.startswith("#") else manifest.palette_rgb(colour)
    return tuple(colour)[:3]


def _loop_mask(ob, faces):
    from . import uv
    return uv._loops_of(ob, uv.face_indices(ob, faces))


def fill_color(ob, colour, name=COLOR, faces=None):
    """Fill attribute `name` with one colour (palette name, hex or linear rgb) on `faces` (default all)."""
    me = ob.data
    if name in me.color_attributes: a = get_colors(ob, name)
    else: a = np.ones((len(me.loops), 4), dtype=np.float32)
    m = _loop_mask(ob, faces)
    a[m, :3] = rgb(colour); a[m, 3] = 1.0
    set_colors(ob, a, name)


def tint(ob, colour, faces=None):
    """Record the base (albedo) colour of a part in the helper attribute "Tint" BEFORE joining parts. Also the colour
    `compose_vertex_color` paints with when it is given no `base`. For m_prop also call uv.map_to_palette(ob, name)."""
    fill_color(ob, colour, TINT, faces)
    color_layer(ob, COLOR) if COLOR in ob.data.color_attributes else None


def corner_positions(ob, world=True):
    """(n_loops, 3) positions of the mesh corners (world space by default)."""
    me = ob.data
    co = np.empty(len(me.vertices) * 3, dtype=np.float32); me.vertices.foreach_get("co", co); co = co.reshape(-1, 3)
    li = np.empty(len(me.loops), dtype=np.int32); me.loops.foreach_get("vertex_index", li)
    p = co[li]
    if world:
        bpy.context.view_layer.update()
        m = np.array(ob.matrix_world, dtype=np.float32)
        p = p @ m[:3, :3].T + m[:3, 3]
    return p


def corner_normals(ob, world=True):
    """(n_loops, 3) shading normals of the mesh corners."""
    me = ob.data
    n = np.empty(len(me.loops) * 3, dtype=np.float32); me.corner_normals.foreach_get("vector", n); n = n.reshape(-1, 3)
    if world:
        bpy.context.view_layer.update()
        m = np.array(ob.matrix_world.to_3x3().inverted_safe().transposed(), dtype=np.float32)
        n = n @ m.T
        n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)
    return n


def poly_of_loop(ob):
    """(n_loops,) polygon index of every corner."""
    me = ob.data
    lt = np.empty(len(me.polygons), dtype=np.int32); me.polygons.foreach_get("loop_total", lt)
    return np.repeat(np.arange(len(me.polygons)), lt)


BURIED_DARK = 0.35           # a face whose corners average below this share of the reference brightness is "dark" ...
BURIED_PEAK = 0.6            # ... with no corner above this (a corner in the open reads near 1: the face is sampled)
BURIED_EDGE = 0.25           # ... and a candidate when it is also longer than this (metres): light cannot vary along it
BURIED_OPEN = 0.6            # ... and "buried" when this share of the rays from its CENTRE is unobstructed
BURIED_AREA = 0.02           # m2 of buried faces on one object that earns a WARNING
_RAYS = [(math.sin(t) * math.cos(p), math.sin(t) * math.sin(p), math.cos(t))
         for t, n in ((math.radians(25), 4), (math.radians(55), 6), (math.radians(78), 6)) for p in [2 * math.pi * (k + 0.5 * (n % 4)) / n for k in range(n)]]


def buried_faces(ob, values, ref=1.0, faces=None, distance=0.5, dark=BURIED_DARK):
    """The faces of `ob` that a vertex bake could not sample: longer than BURIED_EDGE metres, with corner values
    (`values`: (n_loops,) or (n_loops, k), the brightest channel counts) averaging below `dark` x `ref` and none above
    BURIED_PEAK x `ref`, although
    the face's CENTRE is in the open (BURIED_OPEN or more of 16 rays over its hemisphere travel `distance` metres
    without a hit). That is the signature of a part with vertices only at its ends, both ends touching or inside
    neighbouring parts (a column between a plinth and a head, a leg between a floor and a seat): the whole part comes
    out dark although most of it is exposed. A face in a real crevice, or pressed against another part, has a blocked
    centre and is not reported. Returns (polygon indices, their area in m2, world centre of the largest one | None)."""
    me = ob.data
    if not len(me.polygons): return [], 0.0, None
    v = np.asarray(values, dtype=np.float32).reshape(len(me.loops), -1).max(axis=1)
    lt = np.empty(len(me.polygons), dtype=np.int32); me.polygons.foreach_get("loop_total", lt)
    ls = np.empty(len(me.polygons), dtype=np.int32); me.polygons.foreach_get("loop_start", ls)
    cand = np.nonzero((np.add.reduceat(v, ls) / lt < dark * ref) & (np.maximum.reduceat(v, ls) < BURIED_PEAK * ref))[0]
    if faces is not None:
        from . import uv
        cand = np.intersect1d(cand, np.asarray(uv.face_indices(ob, faces), dtype=np.int64))
    if not len(cand): return [], 0.0, None
    from mathutils import Vector
    pos = corner_positions(ob)
    dg = bpy.context.evaluated_depsgraph_get(); sc = bpy.context.scene
    out = []; area = 0.0; big = (0.0, None)
    for i in cand:
        p = pos[ls[i]:ls[i] + lt[i]]
        if float(np.linalg.norm(p - np.roll(p, -1, axis=0), axis=1).max()) <= BURIED_EDGE: continue
        nv = np.cross(p[1:-1] - p[0], p[2:] - p[0]).sum(axis=0); a = 0.5 * float(np.linalg.norm(nv))
        if a < 1e-9: continue
        n = Vector(nv / (2 * a)); c = Vector(p.mean(axis=0))
        t1 = n.orthogonal().normalized(); t2 = n.cross(t1)
        o = c + n * 0.002
        free = sum(0 if sc.ray_cast(dg, o, (t1 * d[0] + t2 * d[1] + n * d[2]).normalized(), distance=distance)[0] else 1 for d in _RAYS)
        if free < BURIED_OPEN * len(_RAYS): continue
        out.append(int(i)); area += a
        if a > big[0]: big = (a, tuple(c))
    return out, area, big[1]


def warn_buried(ob, values, what, ref=1.0, faces=None, distance=0.5, dark=BURIED_DARK):
    """Print `WARNING <object>: ...` when `buried_faces` finds BURIED_AREA m2 or more on `ob` (after a vertex AO or
    vertex light bake). The cure is in the message: an edge loop half-way along the part (mesh.tessellate_max_edge),
    or delete the caps nobody sees. Returns the number of buried faces."""
    idx, area, centre = buried_faces(ob, values, ref, faces, distance, dark)
    if area >= BURIED_AREA:
        total = sum(p.area for p in ob.data.polygons) or 1.0
        print(f"WARNING {ob.name}: {len(idx)} faces ({area:.3f} m2, {100.0 * area / total:.0f} % of its surface) baked dark from end to end "
              f"although they stand in the open ({what} at their corners below {dark * ref:.2f}; e.g. at Blender "
              f"({centre[0]:.2f}, {centre[1]:.2f}, {centre[2]:.2f})): their only vertices touch or sit inside neighbouring parts. "
              "Add an edge loop along the part (mesh.tessellate_max_edge) or delete the buried caps before baking")
    return len(idx)


def mark_vertex_lit(ob, faces=None):
    """Declare that `Color` on `faces` of `ob` (default: all of them) already holds tint x light / 2, the vertex-lit
    convention. `bake_vertex_light` calls it for the faces it updated; a script that computes its own light (the
    greybox placeholders) calls it by hand. The mark is the per-face attribute "ks_vl": it survives `mesh.join`,
    `rig.join_as_rigid_skin`, `mesh.tessellate_max_edge`, `zone.copy_about_axis` and `zone.merge_chunks`, and is not
    exported. `export.check_scene` and `zone.merge_chunks` fail every face that the runtime will show at COLOR_0 x 2
    (a mesh stamped bake 'VL', and the faces of an 'LM' mesh whose UV1 sits on the neutral texel) without it.
    The object property `vl_baked` is set once every face of the object is marked."""
    from . import uv
    me = ob.data
    attr = me.attributes.get(VL_FACE) or me.attributes.new(VL_FACE, 'INT', 'FACE')
    vals = np.zeros(len(me.polygons), dtype=np.int32); attr.data.foreach_get("value", vals)
    if faces is None: vals[:] = 1
    else: vals[np.asarray(uv.face_indices(ob, faces), dtype=np.int64)] = 1
    me.attributes[VL_FACE].data.foreach_set("value", vals)
    if len(vals) and vals.all(): ob["vl_baked"] = True


def vertex_lit_faces(ob):
    """(n_polygons,) bool: the faces of `ob` marked vertex-lit (`mark_vertex_lit`). An object without the per-face
    attribute counts as marked all over only when it carries the object property `vl_baked`."""
    me = ob.data
    attr = me.attributes.get(VL_FACE)
    if attr is None or attr.domain != 'FACE': return np.full(len(me.polygons), bool(ob.get("vl_baked")), dtype=bool)
    vals = np.zeros(len(me.polygons), dtype=np.int32); attr.data.foreach_get("value", vals)
    return vals != 0


def bake_ao_vertex(objs, name="AO", samples=64, distance=1.0):
    """Cycles ambient occlusion -> colour attribute `name` on each object (CPU: fastest for vertex bakes; about 0.05 s
    for a prop). distance = AO reach in metres (0.5-0.6 for props, 1-1.5 for rooms). Objects occlude each other, so
    pass everything that should cast (and hide what should not). Prints a WARNING for an object with long faces that
    baked dark from end to end (`warn_buried`: vertices buried in neighbouring parts). Returns seconds."""
    s = bpy.context.scene
    s.render.engine = 'CYCLES'; s.cycles.device = 'CPU'; s.cycles.samples = samples
    if s.world is None: s.world = bpy.data.worlds.new("World")
    s.world.light_settings.distance = distance
    deselect_all()
    for o in objs:
        color_layer(o, name); o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    s.render.bake.target = 'VERTEX_COLORS'
    t = time.perf_counter(); r = bpy.ops.object.bake(type='AO'); dt = time.perf_counter() - t
    s.render.bake.target = 'IMAGE_TEXTURES'
    if r != {'FINISHED'}: raise RuntimeError(f"vertex AO bake failed: {r}")
    for o in objs:
        warn_buried(o, get_colors(o, name)[:, :3], "AO", distance=distance)
        if COLOR in o.data.color_attributes: color_layer(o, COLOR)
    return dt


def compose_vertex_color(ob, base=None, mode='tint', ao_name="AO", ao_strength=0.8, gradient=(0.75, 1.10),
                         dust=0.0, dust_height=0.6, dust_colour='sand', bleach=None, bleach_fraction=0.15, bleach_amount=0.5,
                         jitter=0.06, seed=1, z_range=None, out=COLOR, keep=()):
    """Write the exported `Color` attribute per ART_BIBLE 4.5:

        base x lerp(1, AO, ao_strength) x height ramp (gradient[0] at the bottom -> gradient[1] at the top)
             x dust skirt (bottom `dust_height` m, `dust` (0.6 outdoors) of the way toward `dust_colour`)
             x top bleach (top `bleach_fraction` of the height, `bleach_amount` toward the colour `bleach`)
             x per-face jitter (+-`jitter`: 0.06 Frontier, 0 Pellam)

    base: None = the "Tint" attribute painted with vcol.tint() per part (white when absent); or a palette name / hex /
          linear rgb for the whole object.
    mode: 'tint'  -> Color = that colour (m_frontier, m_pellam, m_sand, m_flat: vertex colour IS the albedo).
          'ratio' -> Color = that colour / base, clamped to 1 (m_prop: the palette cell supplies the base through UV0,
                     vertex colour only shades it).
    z_range: (z0, z1) world heights for the ramp, skirt and bleach (default: the object's own extent; pass the whole
             asset's range when composing parts separately).
    Helper attributes (AO, Tint) are removed unless listed in `keep`. Linear values throughout.
    Composing AFTER `bake_vertex_light` throws the baked light away; it also removes the vertex-lit mark, so the build
    fails instead of shipping unlit colours at x 2. Order: compose, then bake the light."""
    me = ob.data
    pos = corner_positions(ob)
    n = len(pos)
    if base is None:
        b = get_colors(ob, TINT)[:, :3].copy() if TINT in me.color_attributes else np.ones((n, 3), np.float32)
    else:
        b = np.tile(np.asarray(rgb(base), dtype=np.float32)[None, :], (n, 1))
    ao = get_colors(ob, ao_name)[:, 0:1] if ao_name in me.color_attributes else np.ones((n, 1), np.float32)
    z = pos[:, 2:3]
    z0, z1 = z_range if z_range is not None else (float(z.min()), float(z.max()))
    t = np.clip((z - z0) / max(1e-6, z1 - z0), 0, 1)
    col = b * (1 - ao_strength + ao_strength * ao) * (gradient[0] + (gradient[1] - gradient[0]) * t)
    if dust > 0:
        k = dust * np.clip(1.0 - (z - z0) / dust_height, 0, 1) ** 1.5
        col = col * (1 - k) + np.asarray(rgb(dust_colour), np.float32)[None, :] * (1 - ao_strength * 0.5 + ao_strength * 0.5 * ao) * k
    if bleach is not None:
        k = bleach_amount * np.clip((t - (1 - bleach_fraction)) / max(1e-6, bleach_fraction), 0, 1)
        col = col * (1 - k) + np.asarray(rgb(bleach), np.float32)[None, :] * k
    if jitter > 0:
        rng = np.random.default_rng(seed)
        col = col * (1.0 + (rng.random(len(me.polygons), dtype=np.float32)[poly_of_loop(ob)][:, None] - 0.5) * 2 * jitter)
    if mode == 'ratio': col = col / np.maximum(b, 1e-4)
    elif mode != 'tint': raise ValueError("compose_vertex_color: mode is 'tint' or 'ratio'")
    res = np.ones((n, 4), dtype=np.float32); res[:, :3] = np.clip(col, 0.0, 1.0)
    set_colors(ob, res, out)
    for extra in [c.name for c in me.color_attributes if c.name != out and c.name not in keep]:
        me.color_attributes.remove(me.color_attributes[extra])
    color_layer(ob, out)
    if out == COLOR:                                               # Color was rebuilt from the tint: any baked light it held is gone,
        t = me.attributes.get(VL_FACE)                             # and so is the vertex-lit mark (compose first, bake light after)
        if t is not None: me.attributes.remove(t)
        if "vl_baked" in ob.keys(): del ob["vl_baked"]


def streak_under(ob, points, width=0.05, length=0.25, factor=0.8, out=COLOR):
    """Darken `out` in a streak below each world point in `points` (under fasteners, sills, seam ends, louvres:
    ART_BIBLE 4.5): x`factor` at the point fading to x1 `length` m below, `width` m wide (3-8 cm). Vertex colours only
    exist at vertices: give the surface an edge loop or two where the streak must show."""
    a = get_colors(ob, out); pos = corner_positions(ob)
    for q in points:
        q = np.asarray(q, dtype=np.float32)
        d = np.hypot(pos[:, 0] - q[0], pos[:, 1] - q[1]); dz = q[2] - pos[:, 2]
        k = np.clip(1.0 - d / (width * 0.5 + 1e-6) * 0.5, 0, 1) * (dz >= -1e-4) * np.clip(1.0 - dz / length, 0, 1)
        a[:, :3] *= (1.0 - (1.0 - factor) * k)[:, None]
    set_colors(ob, a, out)


def darken_contact(ob, height=0.06, factor=0.6, z0=None, out=COLOR):
    """The baked ground-contact shadow (ART_BIBLE 5.3 rule 6): corners within `height` m of the foot are multiplied
    by `factor`, fading out above."""
    a = get_colors(ob, out); pos = corner_positions(ob)
    z0 = float(pos[:, 2].min()) if z0 is None else z0
    k = np.clip(1.0 - (pos[:, 2] - z0) / height, 0, 1)
    a[:, :3] *= (1.0 - (1.0 - factor) * k)[:, None]
    set_colors(ob, a, out)


def emis_attr(ob, intensity=1.0, flicker_group=0.0, wrong_fade=0.0, faces=None, emit_strength=1.0):
    """COLOR_0 of an m_emis mesh: R = intensity (0..1), G = flicker group (0 steady, 0.5 flicker, 1 off until
    triggered), B = `wrong_fade` participation (1 = fades with the seventh). `emit_strength` scales the PREVIEW
    emission of this object in Cycles bakes (object property; 0 keeps the lamp out of the bake)."""
    me = ob.data
    a = get_colors(ob, COLOR) if COLOR in me.color_attributes else np.zeros((len(me.loops), 4), dtype=np.float32)
    m = _loop_mask(ob, faces)
    a[m] = (intensity, flicker_group, wrong_fade, 1.0)
    set_colors(ob, a, COLOR)
    ob["emit_strength"] = float(emit_strength)


def bake_vertex_light(objs, samples=2048, faces=None, scale=VERTEX_LIGHT_SCALE, out=COLOR, kind='DIFFUSE', light_tree=False):
    """Bake the scene's light (Cycles DIFFUSE, direct + indirect, no albedo) into the corners of `objs` and store
    `Color = Color x light / 2`, clamped to 1: the vertex-lit convention (ARCHITECTURE 7.4). `Color` must already
    hold tint x gradients (compose_vertex_color or an embedded prop's colours). `faces` = dict {object name: faces
    argument} restricts the update to the vertex-lit faces of a mixed mesh (lightmapped faces keep tint x AO).
    Everything visible in the scene casts.

    NOISE. Each vertex is one path-traced sample point and nothing denoises it, so the sample count IS the quality.
    Measured on the fixture room (sun through a window, sky, three lamp quads; error of the displayed light against a
    131 072-sample reference, mean / 90th percentile over 1 768 vertices; seconds on 20 CPU threads, quiet machine):
        256: 8 % / 18 %, 0.3 s    1024: 4.6 % / 10 %, 1.3 s    2048 (default): 3.4 % / 7.5 %, 2.6 s    4096: 2.4 % / 5 %, 3.3-5.3 s
    Pass samples=256 while iterating, leave the default for a build you look at, 4096 for a final interior. The time
    grows with samples x vertices (about 1.5 s per 1 000 vertices at 2048 here; more while other bakes share the machine).
    Under a sun and a sky alone (no emissive lamp meshes) the noise is far lower: 0.3 % at 256.
    `light_tree=False` switches Cycles' light tree OFF for this bake (and adaptive sampling, always): with a sun, a sky
    and a handful of lamp meshes the tree doubles the noise (the same room at 1024 samples: 10 % with it, 4.6 % without;
    at 256, the old recommendation: 21 %); with sun and sky alone it changes nothing. Pass light_tree=True only for a
    scene with dozens of emissive lamp meshes, and compare. Both settings are restored afterwards. A neighbour-smoothing
    pass was measured and rejected: the true light differs by about 25 % between neighbouring wall vertices in that room,
    so averaging neighbours costs more (30 % error) than the noise; an edge-preserving variant gained a tenth.

    Marks the faces it updated vertex-lit (`mark_vertex_lit`: export.check_scene asks for the mark on every face shown
    at COLOR_0 x 2) and prints a WARNING for an object with long vertex-lit faces that stayed BLACK from end to end
    (below 5 % of the 95th percentile of this call's light) although their centres stand in the open (`warn_buried`:
    buried vertices). Returns seconds."""
    from .bake import NonMetal
    s = bpy.context.scene
    if s.render.engine != 'CYCLES': s.render.engine = 'CYCLES'
    s.cycles.samples = samples
    saved = (s.cycles.use_adaptive_sampling, s.cycles.use_light_tree)
    s.cycles.use_adaptive_sampling = False; s.cycles.use_light_tree = bool(light_tree)
    b = s.render.bake
    b.target = 'VERTEX_COLORS'
    b.use_pass_direct = True; b.use_pass_indirect = True; b.use_pass_color = False
    deselect_all()
    for o in objs:
        if out not in o.data.color_attributes: fill_color(o, (1, 1, 1), out)
        color_layer(o, "_Light"); o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    t = time.perf_counter()
    try:
        with NonMetal(objs):
            r = bpy.ops.object.bake(type=kind)
    finally:
        b.target = 'IMAGE_TEXTURES'
        s.cycles.use_adaptive_sampling, s.cycles.use_light_tree = saved
    dt = time.perf_counter() - t
    if r != {'FINISHED'}: raise RuntimeError(f"vertex light bake failed: {r}")
    lights = {o.name: get_colors(o, "_Light")[:, :3].copy() for o in objs}
    ref = float(np.percentile(np.concatenate([l.max(axis=1) for l in lights.values()]), 95)) if lights else 0.0
    for o in objs:
        light = lights[o.name]
        a = get_colors(o, out)
        f = faces.get(o.name) if isinstance(faces, dict) else faces
        m = _loop_mask(o, f)
        if ref > 1e-3: warn_buried(o, light, "light", ref, f, dark=0.05)     # light: near black only (shadow is legitimate)
        a[m, :3] = np.clip(a[m, :3] * light[m] / scale, 0.0, 1.0)
        o.data.color_attributes.remove(o.data.color_attributes["_Light"])
        set_colors(o, a, out)
        mark_vertex_lit(o, f)
    return dt
