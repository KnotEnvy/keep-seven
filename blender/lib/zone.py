"""Zone GLBs (ARCHITECTURE 7.4, 7.5): chunk plans, embedded props, sector copies, dressing empties, lamp sets,
the terrain collider.

A zone GLB is authored in WORLD coordinates (root at the origin). Its static geometry is exported as exactly the
meshes of its chunk plan in design/assets.json: one mesh per (chunk, material), named `<chunk id>__<material>`.
Named drawn nodes (lamp sets, the rotor, plugs) sit beside them.

Typical zone script:
    build parts (world coordinates) -> zone.embed_prop(...) for every `placedBy: zone` asset ->
    uv.unwrap_lightmap(parts, 'lm_x', faces=lightmapped) -> bake.bake_lightmap + bake.save_lightmap ->
    vcol.bake_vertex_light(every object with vertex-lit faces, faces={mixed object: its vertex-lit faces}) ->
    zone.assign_chunks(parts, asset_id) -> zone.merge_chunks(asset_id) -> zone.lamp_set / dressing_empty ->
    export.export_asset(asset_id, args.out)
merge_chunks refuses (RuntimeError, the build prints FAILED) a face that is shown at COLOR_0 x 2 and was never
vertex-lit, and a face that has no lightmap UV: see its docstring.
"""
import bpy, bmesh, math, os
import numpy as np
from mathutils import Vector, Matrix
from . import manifest, layout, material, uv, vcol, export
from .scene import link, deselect_all, select_only, select, must
from . import mesh as meshlib

GROUP = "ks_group"            # per-face int attribute written by assign_chunks
STRUCTURE = ("m_frontier", "m_pellam", "m_sand")
HIGH_CLEARANCE = 3.0


def chunk_plan(asset_id):
    """The chunk plan of a zone asset: list of {id, tris, materials, box{min,max}, part?, solids?} (game space)."""
    a = manifest.asset(asset_id)
    if not a.get("chunks"): raise KeyError(f"{asset_id} has no chunk plan (not a zone asset)")
    return a["chunks"]


def _in_box(box, p, tol):
    return all(box["min"][i] - tol <= p[i] <= box["max"][i] + tol for i in range(3))


def _box_distance(box, p):
    return math.sqrt(sum(max(box["min"][i] - p[i], 0.0, p[i] - box["max"][i]) ** 2 for i in range(3)))


def chunk_for(asset_id, centre_game, min_y, tol=0.75):
    """The chunk whose rule holds a face with game-space centre `centre_game` and lowest corner height `min_y`.
    Chunks with a `solids` list are skipped (they only take tagged objects). A `part` chunk must agree with the
    height rule: 'high' = the face's lowest corner is 3 m or more above the path's ground (layout.path_ground) at that
    spot, 'low' = it is not. Among the chunks that agree, the first whose box contains the centre wins; when none
    does, the nearest box within `tol` metres (a wall that pokes just outside its chunk). Returns the chunk or None."""
    a = manifest.asset(asset_id)
    ground = None; near = None; nd = tol
    for c in a["chunks"]:
        if c.get("solids"): continue
        part = c.get("part")
        if part:
            if ground is None:
                ground = layout.path_ground(a["zone"], centre_game[0], centre_game[2])
                if ground is None: ground = -1e9
            high = min_y >= ground + HIGH_CLEARANCE - 1e-4
            if (part == "high") != high: continue
        if _in_box(c["box"], centre_game, 1e-4): return c
        d = _box_distance(c["box"], centre_game)
        if d <= nd: nd = d; near = c
    return near


def cut_at_chunk_boxes(ob, asset_id):
    """Bisect a world-space mesh along every chunk-box plane that crosses it, so no face straddles two chunks.
    (Greybox solids and long walls; final art usually models to the boundaries instead.)"""
    planes = set()
    for c in chunk_plan(asset_id):
        if c.get("solids"): continue
        for i in range(3):
            planes.add((i, c["box"]["min"][i])); planes.add((i, c["box"]["max"][i]))
    mn, mx = meshlib.bounds(ob)
    gmin = layout.to_game(mn); gmax = layout.to_game(mx)
    lo = [min(gmin[i], gmax[i]) for i in range(3)]; hi = [max(gmin[i], gmax[i]) for i in range(3)]
    bm = bmesh.new(); bm.from_mesh(ob.data)
    cut = False
    for axis, value in sorted(planes):
        if not (lo[axis] + 1e-4 < value < hi[axis] - 1e-4): continue
        co = [0.0, 0.0, 0.0]; no = [0.0, 0.0, 0.0]; co[axis] = value; no[axis] = 1.0
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=layout.to_blender(co), plane_no=layout.to_blender(no))
        cut = True
    if cut: bm.to_mesh(ob.data)
    bm.free()
    return cut


def assign_chunks(objs, asset_id, cut=False, tol=0.75):
    """Assign every face of `objs` (world-space meshes, transforms applied) to a chunk of the plan and remember it
    with its material in the per-face attribute "ks_group" (`merge_chunks` reads it).

      * an object with the custom property `chunk` (a chunk id) goes there whole: that is how a `solids` skyline
        chunk gets its parts (the drum, the tank, the wind-pump);
      * every other face goes to `chunk_for(...)`: the chunk whose box holds its centre and whose `part` rule agrees.
    FAILS (RuntimeError listing them) on a face in no chunk and on a face whose material the chunk does not allow
    (fold m_prop / m_flat parts first: zone.fold_flat or zone.embed_prop). cut=True bisects at the chunk boxes first.
    Returns {group name '<chunk>__<material>': triangle count}."""
    a = manifest.asset(asset_id); plan = a["chunks"]
    by_id = {c["id"]: c for c in plan}
    groups = bpy.context.scene.get("_ks_groups")
    names = list(groups) if groups else []
    counts = {}; errs = []
    bpy.context.view_layer.update()
    for ob in objs:
        if ob.type != 'MESH': continue
        if max(abs(x) for row in (ob.matrix_world - Matrix.Identity(4)) for x in row) > 1e-6: meshlib.apply_transform(ob)
        forced = ob.get("chunk")
        if forced is not None and forced not in by_id: raise KeyError(f"{ob.name}: custom property chunk='{forced}' is not a chunk of {asset_id}")
        if cut and forced is None: cut_at_chunk_boxes(ob, asset_id)
        me = ob.data
        attr = me.attributes.get(GROUP) or me.attributes.new(GROUP, 'INT', 'FACE')
        vals = np.zeros(len(me.polygons), dtype=np.int32)
        for p in me.polygons:
            mat = me.materials[p.material_index].name if p.material_index < len(me.materials) and me.materials[p.material_index] else None
            cg = layout.to_game(p.center)
            if forced is not None: c = by_id[forced]
            else:
                c = chunk_for(asset_id, cg, min(me.vertices[v].co.z for v in p.vertices), tol)
            if c is None:
                if len(errs) < 12: errs.append(f"{ob.name}: face at game ({cg[0]:.2f}, {cg[1]:.2f}, {cg[2]:.2f}) is in no chunk box of {asset_id}")
                continue
            if mat not in c["materials"]:
                if len(errs) < 12: errs.append(f"{ob.name}: a face with material {mat} lies in {c['id']}, which allows only {c['materials']}")
                continue
            key = f"{c['id']}__{mat}"
            if key not in names: names.append(key)
            vals[p.index] = names.index(key) + 1
            counts[key] = counts.get(key, 0) + (len(p.vertices) - 2)
        attr = me.attributes[GROUP]
        attr.data.foreach_set("value", vals)
    if errs: raise RuntimeError("assign_chunks failed:\n  - " + "\n  - ".join(errs))
    bpy.context.scene["_ks_groups"] = names
    for c in plan:
        t = sum(n for k, n in counts.items() if k.startswith(c["id"] + "__"))
        if t > c["tris"]: print(f"WARNING {c['id']}: {t} triangles in these objects, the chunk's share is {c['tris']}")
    return counts


def merge_chunks(asset_id, objs=None, lightmap=None, light_layer=None):
    """Join every assigned object and split the result into the plan's meshes `<chunk id>__<material>` (attributes,
    UV layers and custom normals survive). objs: default every mesh that carries "ks_group". Sets the mesh extras the
    runtime reads: `bake` ('LM' when any vertex of the mesh is lightmapped: its UV1 is off the neutral texel; else 'VL';
    'UNLIT' for m_emis), `lightmap` and `lightLayer` (default: the asset's first `lightmaps` / `lightLayers` id).

    THE VERTEX-LIGHT GUARD. A face is shown at COLOR_0 x 2 when it is vertex-lit: its UV1 is on the lightmap's neutral
    texel (or the zone has no lightmap, or its material is not a structure material). Every such face must carry the
    mark `vcol.bake_vertex_light` leaves on the faces it lit (`vcol.mark_vertex_lit` for a script that writes
    tint x light / 2 itself); it is tracked PER FACE, so a `faces=`-restricted bake and a mixed LM + VL chunk are
    covered. Otherwise this function RAISES, naming the objects: the build prints FAILED and ships nothing (unlit
    faces used to ship at twice their tint, washed-out white, in every mixed chunk). It also raises for a
    structure-material face without a lightmap UV (UV1 a single point off the neutral texel, or still the copy of UV0
    that a new layer starts as): an object that was never passed to `uv.unwrap_lightmap`. Returns {name: object}."""
    from . import bake
    a = manifest.asset(asset_id)
    names = list(bpy.context.scene.get("_ks_groups") or [])
    if objs is None: objs = [o for o in bpy.context.scene.objects if o.type == 'MESH' and GROUP in o.data.attributes]
    objs = [o for o in objs if len(o.data.polygons) > 0]
    if not objs: raise RuntimeError("merge_chunks: nothing assigned (zone.assign_chunks first)")
    lm = lightmap or (a.get("lightmaps") or [None])[0]
    ll = light_layer or (a.get("lightLayers") or [None])[0]
    unlit = []; bare_objs = []
    for o in objs:
        uv.ensure_layers(o, lightmap=True)
        if "Color" not in o.data.color_attributes: vcol.fill_color(o, (1, 1, 1))
        vcol.color_layer(o, "Color")
        # the guard, while the faces still have an object name: who is shown at COLOR_0 x 2, and was it lit?
        mats = export.face_materials(o)
        marked = vcol.vertex_lit_faces(o)
        neutral, bare = export.uv1_faces(o, lm)
        structure = np.array([m in STRUCTURE for m in mats], dtype=bool); emis = np.array([m == "m_emis" for m in mats], dtype=bool)
        need = ~emis & (neutral | ~structure)
        miss = need & ~marked; bare = bare & structure
        if miss.any(): unlit.append(f"{o.name}: {int(miss.sum())} of {len(miss)} faces (e.g. at {export._face_at(o, miss)})")
        if bare.any(): bare_objs.append(f"{o.name}: {int(bare.sum())} of {len(bare)} faces (e.g. at {export._face_at(o, bare)})")
        # the join drops object properties: the per-face mark carries "vertex-lit" into the chunk meshes for check_scene
        attr = o.data.attributes.get(vcol.VL_FACE) or o.data.attributes.new(vcol.VL_FACE, 'INT', 'FACE')
        o.data.attributes[vcol.VL_FACE].data.foreach_set("value", marked.astype(np.int32))
        for k in list(o.keys()): del o[k]
        o.parent = None
    if unlit or bare_objs:
        msg = []
        if unlit:
            msg.append(f"merge_chunks({asset_id}): {len(unlit)} object{'s have' if len(unlit) != 1 else ' has'} vertex-lit faces that were never vertex-lit. "
                       f"Their UV1 is on the neutral texel{' of ' + lm if lm else ' (the zone has no lightmap)'}, so the runtime shows them at COLOR_0 x 2: "
                       "unlit they ship at twice their tint, washed-out white. Pass these objects to vcol.bake_vertex_light "
                       "(faces={name: ...} for an object that also has lightmapped faces) before zone.merge_chunks, or call "
                       "vcol.mark_vertex_lit(ob, faces) if the script writes tint x light / 2 itself:\n  - " + "\n  - ".join(sorted(unlit)[:16])
                       + (f"\n  - ... and {len(unlit) - 16} more" if len(unlit) > 16 else ""))
        if bare_objs:
            msg.append(f"merge_chunks({asset_id}): {len(bare_objs)} object{'s have' if len(bare_objs) != 1 else ' has'} faces without a lightmap UV (UV1 is a single "
                       f"point off the neutral texel of {lm}, or still the copy of UV0 a new layer starts as). Pass these objects to uv.unwrap_lightmap, with faces=[] (or a faces "
                       "argument that leaves the faces out) when they are vertex-lit:\n  - " + "\n  - ".join(sorted(bare_objs)[:16])
                       + (f"\n  - ... and {len(bare_objs) - 16} more" if len(bare_objs) > 16 else ""))
        raise RuntimeError("\n".join(msg))
    whole = meshlib.join(sorted(objs, key=lambda o: o.name), "_zone_merge")
    me = whole.data
    vals = np.zeros(len(me.polygons), dtype=np.int32); me.attributes[GROUP].data.foreach_get("value", vals)
    if (vals == 0).any(): raise RuntimeError(f"merge_chunks: {int((vals == 0).sum())} faces were never assigned to a chunk")
    out = {}
    present = sorted(set(int(v) for v in vals))
    bpy.context.tool_settings.mesh_select_mode = (False, False, True)
    for gi in present[:-1]:
        me = whole.data
        vals = np.zeros(len(me.polygons), dtype=np.int32); me.attributes[GROUP].data.foreach_get("value", vals)
        me.polygons.foreach_set("select", (vals == gi))
        me.edges.foreach_set("select", np.zeros(len(me.edges), dtype=bool))
        me.vertices.foreach_set("select", np.zeros(len(me.vertices), dtype=bool))
        select_only(whole)
        before = set(bpy.data.objects)
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_mode(type='FACE')
        r = bpy.ops.mesh.separate(type='SELECTED')
        bpy.ops.object.mode_set(mode='OBJECT')
        must(r, f"separate {names[gi - 1]}")
        new = [o for o in bpy.data.objects if o not in before]
        if len(new) != 1: raise RuntimeError(f"merge_chunks: separate produced {len(new)} objects for {names[gi - 1]}")
        out[names[gi - 1]] = new[0]
    out[names[present[-1] - 1]] = whole
    for name in sorted(out):
        o = out[name]
        o.name = name; o.data.name = "me_" + name
        mat = name.split("__", 1)[1]
        o.data.attributes.remove(o.data.attributes[GROUP])
        # keep only the slot in use
        o.data.materials.clear(); o.data.materials.append(material.game_material(mat))
        for p in o.data.polygons: p.material_index = 0
        if mat == "m_emis": o["bake"] = "UNLIT"
        else:
            lit = False
            if lm is not None and mat in STRUCTURE:
                nu = np.array(bake.neutral_uv(lm), dtype=np.float32)
                u1 = uv.get(o, uv.UV1)
                lit = bool((np.abs(u1 - nu[None, :]).max(axis=1) > 1e-4).any())
            o["bake"] = "LM" if lit else "VL"
            if vcol.vertex_lit_faces(o).all(): vcol.mark_vertex_lit(o)   # the object property `vl_baked`; the per-face mark stays for check_scene
            if lm is not None and mat in STRUCTURE:
                o["lightmap"] = lm
                if ll is not None: o["lightLayer"] = ll
        vcol.color_layer(o, "Color")
        o.data.uv_layers.active = o.data.uv_layers[0]
    del bpy.context.scene["_ks_groups"]
    return out


def fold_flat(ob, structure_material, faces=None, colour=None):
    """Turn flat-coloured faces into the chunk's structure material (ARCHITECTURE 7.2: m_flat and m_prop do not occur
    in a zone GLB): material -> `structure_material` ('m_frontier' | 'm_pellam'), UV0 -> that trim sheet's uniform
    `flat` cell, and the colour carried in COLOR_0. `colour` (palette name / hex / linear rgb) multiplies the existing
    Color; None keeps Color as it is."""
    if structure_material not in ("m_frontier", "m_pellam"): raise ValueError("fold_flat: structure material is m_frontier or m_pellam (they have a flat cell)")
    idx = uv.face_indices(ob, faces)
    material.assign(ob, structure_material, idx)
    uv.map_flat(ob, manifest.SHEET_OF[structure_material], idx)
    if colour is not None:
        if "Color" not in ob.data.color_attributes: vcol.fill_color(ob, (1, 1, 1))
        a = vcol.get_colors(ob, "Color"); m = uv._loops_of(ob, idx)
        a[m, :3] *= np.asarray(vcol.rgb(colour), dtype=np.float32)[None, :]
        vcol.set_colors(ob, a, "Color")


def _base(name):
    """'m_prop.001' -> 'm_prop' (the importer renames duplicates)."""
    return name.split(".")[0] if name else name


def embed_prop(asset_id, node=None, location=(0, 0, 0), rot_z=0.0, material_name="m_frontier", lightmap=None,
               light=False, scale=1.0, name=None):
    """Merge a `placedBy: zone` asset into the zone (ARCHITECTURE 7.4): import its RAW export from blender/export/
    (placeholder or final: whatever is there), place it, and make it zone geometry.

      asset_id       the prop ('prop_tally_table'); node = one variant node of it ('note_lip', 'ash_embers') or None = all
      location       Blender world position of the asset's pivot; rot_z = radians about +Z
                     (`layout.placement(marker, offset)` returns both, following the manifest's binding rule)
      material_name  the chunk's structure material the prop takes ('m_frontier' | 'm_pellam'): its m_prop / m_flat
                     faces get UV0 on the trim sheet's `flat` cell and palette colour x their own COLOR_0 in COLOR_0;
                     m_mask and m_emis faces keep their material
      lightmap       the zone's lightmap id: the prop is vertex-lit, so its UV1 goes to that lightmap's neutral texel
      light=True     bake its vertex light now (`vcol.bake_vertex_light`; the scene's lights must be final). Usually
                     leave False and light all embedded props in one call after everything is placed.
    The prop stays a shadow caster for the zone bake. Returns the list of new mesh objects (world space).
    The build driver rebuilds the zone when the prop's raw export changes."""
    path = manifest.raw_path(asset_id)
    if not os.path.isfile(path):
        raise FileNotFoundError(f"embed_prop: no raw export of {asset_id} at {path}. Build it first: node tools/build-assets.mjs --only {asset_id}")
    for gm in manifest.MATERIALS: material.game_material(gm)          # so the importer cannot claim a game material's name
    before_o = set(bpy.data.objects); before_m = set(bpy.data.materials); before_me = set(bpy.data.meshes)
    before_a = set(bpy.data.actions); before_arm = set(bpy.data.armatures)
    try: r = bpy.ops.import_scene.gltf(filepath=path, disable_bone_shape=True)
    except TypeError: r = bpy.ops.import_scene.gltf(filepath=path)
    must(r, f"import {path}")
    new = [o for o in bpy.data.objects if o not in before_o]
    bpy.context.view_layer.update()
    roots = [o for o in new if o.parent is None]
    if len(roots) != 1: raise RuntimeError(f"embed_prop: {path} has {len(roots)} roots, expected the one named {asset_id}")
    root = roots[0]
    meshes = [o for o in new if o.type == 'MESH' and _base(o.name) != export.COLLIDER]
    if node is not None:
        picked = [o for o in new if _base(o.name) == node]
        if not picked: raise KeyError(f"embed_prop: {asset_id} has no node '{node}' (has {sorted(_base(o.name) for o in new)})")
        keep = set()
        stack = list(picked)
        while stack:
            o = stack.pop(); keep.add(o); stack.extend(o.children)
        meshes = [o for o in meshes if o in keep]
    if not meshes: raise RuntimeError(f"embed_prop: nothing to embed from {asset_id}" + (f" node {node}" if node else ""))
    place = Matrix.Translation(Vector(location)) @ Matrix.Rotation(rot_z, 4, 'Z') @ Matrix.Diagonal((scale, scale, scale, 1.0))
    rinv = root.matrix_world.inverted()
    sheet = manifest.SHEET_OF[material_name]
    dg = bpy.context.evaluated_depsgraph_get()
    out = []
    for i, src in enumerate(sorted(meshes, key=lambda o: o.name)):
        me = bpy.data.meshes.new_from_object(src.evaluated_get(dg)) if any(m.type == 'ARMATURE' for m in src.modifiers) else src.data.copy()
        me.transform(place @ rinv @ src.matrix_world)
        ob = bpy.data.objects.new(f"{name or 'emb_' + asset_id}_{len(out)}_{_uid()}", me); link(ob)
        while len(ob.vertex_groups): ob.vertex_groups.remove(ob.vertex_groups[0])
        # UV layers: the importer names them UVMap, UVMap.001
        if len(me.uv_layers) == 0: me.uv_layers.new(name=uv.UV0)
        me.uv_layers[0].name = uv.UV0
        if len(me.uv_layers) > 1: me.uv_layers[1].name = uv.UV1
        uv.ensure_layers(ob, lightmap=True)
        vcol.adopt_imported(ob)                                    # the importer makes a byte attribute: take it as float "Color"
        col = vcol.get_colors(ob, "Color"); u0 = uv.get(ob, uv.UV0)
        slot_names = [_base(m.name) if m else None for m in me.materials]
        me.materials.clear()
        want = []
        for p in me.polygons:
            src_mat = slot_names[p.material_index] if p.material_index < len(slot_names) else None
            if src_mat in ("m_prop", "m_flat", None):
                for li in range(p.loop_start, p.loop_start + p.loop_total):
                    cell = manifest.palette_name_at(float(u0[li, 0]), float(u0[li, 1]))
                    if cell is not None: col[li, :3] *= manifest.palette_rgb(cell)
                want.append((material_name, True))
            else: want.append((src_mat, False))
        vcol.set_colors(ob, col, "Color")
        used = []
        for p, (mn, flat) in zip(me.polygons, want):
            if mn not in used: used.append(mn); me.materials.append(material.game_material(mn))
            p.material_index = used.index(mn)
        flat_faces = [p.index for p, (mn, flat) in zip(me.polygons, want) if flat]
        if flat_faces: uv.map_flat(ob, sheet, flat_faces)
        if lightmap is not None:
            from . import bake
            bake.set_vertex_lit_uv1(ob, None, lightmap)
        ob["embedded"] = asset_id
        out.append(ob)
    # remove everything the import brought in
    for o in new: bpy.data.objects.remove(o, do_unlink=True)
    for me in [m for m in bpy.data.meshes if m not in before_me and m.users == 0]: bpy.data.meshes.remove(me)
    for m in [m for m in bpy.data.materials if m not in before_m and m.users == 0]: bpy.data.materials.remove(m)
    for x in [x for x in bpy.data.actions if x not in before_a]: bpy.data.actions.remove(x)
    for x in [x for x in bpy.data.armatures if x not in before_arm and x.users == 0]: bpy.data.armatures.remove(x)
    bpy.context.view_layer.update()
    export.note_embedded(asset_id)
    if light: vcol.bake_vertex_light(out)
    return out


_counter = [0]


def _uid():
    _counter[0] += 1
    return f"{_counter[0]:03d}"


def copy_about_axis(objs, axis_point, n, name_suffix="_s"):
    """Copy world-space mesh objects n - 1 times about the vertical axis through `axis_point` (Blender x, y[, z]):
    the bore's six sectors (n = 6, about the `bore_axis` marker). Copies share lightmap UVs and carry the copied
    vertex light, so bake ONE sector first, then copy, then assign and merge. Nothing is instanced: the copies are
    ordinary triangles and count in the triangle budget. Returns originals + copies."""
    ax = Vector((axis_point[0], axis_point[1], 0.0))
    bpy.context.view_layer.update()
    out = list(objs)
    for k in range(1, n):
        rot = Matrix.Translation(ax) @ Matrix.Rotation(2 * math.pi * k / n, 4, 'Z') @ Matrix.Translation(-ax)
        for o in objs:
            if max(abs(x) for row in (o.matrix_world - Matrix.Identity(4)) for x in row) > 1e-6: meshlib.apply_transform(o)
            d = bpy.data.objects.new(f"{o.name}{name_suffix}{k}", o.data.copy()); link(d)
            d.data.transform(rot)
            for key in o.keys(): d[key] = o[key]
            out.append(d)
    return out


def dressing_empty(kind, n, asset, node=None, loc=(0, 0, 0), rot_z=0.0, wind=0, scale=1.0):
    """A dressing anchor in a zone GLB (ARCHITECTURE 7.5): an Empty named `inst_<nnn>` (instanced decoration) or
    `brk_<nnn>` (breakable: gets a hit volume) with extras {asset, node, wind}. World instantiates all of them.
    kind = 'inst' | 'brk'; n = running number per kind; asset = an id from the zone's dressing allowance
    (assets.json zones.<id>.dressing.assets); node = variant node or None; loc = Blender world position of the asset's
    pivot; rot_z radians. Nothing taller than 0.35 m may stand on a nav link (check-glb)."""
    if kind not in ("inst", "brk"): raise ValueError("dressing_empty: kind is 'inst' or 'brk'")
    manifest.asset(asset)
    props = {"asset": asset}
    if node: props["node"] = node
    if wind: props["wind"] = wind
    e = export.marker(f"{kind}_{int(n):03d}", loc, math.degrees(rot_z), **props)
    if scale != 1.0: e.scale = (scale, scale, scale)
    return e


def lamp_set(name, lamps, colour="aqua", intensity=1.0, flicker_group=0.0, wrong_fade=0.0, origin=(0, 0, 0), emit_strength=1.0):
    """One m_emis mesh holding N lamps = one draw call (ARCHITECTURE 7.5). `lamps` = N entries, each a polygon
    [(x, y, z), ...] or a list of polygons (a lamp may be several faces), Blender coordinates, wound counter-clockwise
    seen from the lit side. Lamp i gets UV1.x = (i + 0.5) / N on all its vertices; the mesh gets the extra
    `lampCount` = N. UV0 -> emissive palette cell `colour` (one name, or a list of N names). COLOR_0: R intensity,
    G flicker group (0 steady, 0.5 flicker, 1 off until triggered), B wrong_fade participation.
    origin = where the mesh node sits (a lamp set that has a `nodePos` must have its origin there).
    Name it exactly as the manifest's lamp set. Returns the object."""
    n = len(lamps)
    if n == 0: raise ValueError("lamp_set: no lamps")
    o = Vector(origin)
    bm = meshlib.new_bmesh()
    owner = []
    for i, lamp in enumerate(lamps):
        polys = lamp if isinstance(lamp[0][0], (list, tuple, Vector)) else [lamp]
        for poly in polys:
            bm.faces.new([bm.verts.new(Vector(p) - o) for p in poly]); owner.append(i)
    ob = meshlib.new_mesh_object(name, bm)
    ob.location = o
    material.assign(ob, "m_emis")
    uv.ensure_layers(ob, lightmap=True)
    for i in range(n):
        fs = [k for k, w in enumerate(owner) if w == i]
        uv.lamp_index(ob, i, n, fs)
        uv.map_to_emis(ob, colour[i] if isinstance(colour, (list, tuple)) else colour, fs)
    vcol.emis_attr(ob, intensity, flicker_group, wrong_fade, emit_strength=emit_strength)
    ob["lampCount"] = n
    ob["bake"] = "UNLIT"
    return ob


def collider_terrain(ob):
    """Turn a mesh into the zone's `collider_terrain` node (env_the_lip): collision only, replaces the layout's
    `terrain` solids, never drawn. It loses its materials, UVs and colours and is triangulated. It must stay within
    0.3 m of every nav node's ground and leave no step over 0.35 m on a nav link (check-glb)."""
    ob.name = export.COLLIDER
    me = ob.data
    me.materials.clear()
    while len(me.uv_layers): me.uv_layers.remove(me.uv_layers[0])
    while len(me.color_attributes): me.color_attributes.remove(me.color_attributes[0])
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.to_mesh(me); bm.free()
    for k in list(ob.keys()): del ob[k]
    ob["collider"] = True
    return ob
