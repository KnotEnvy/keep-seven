"""glTF export. `export_asset(asset_id, out)` is the ONLY way an art script writes its GLB: it checks the scene
against the manifest first (a readable list of everything wrong, then exit 1) and exports with the verified call
(docs/research/blender-pipeline.md 8; ARCHITECTURE 7.2).

What a GLB must look like:
  * one root node named by the asset id at the origin (`ensure_root` makes it and parents everything to it);
  * snake_case names, unique across objects, meshes and bones;
  * every manifest `nodes` / `bones` name present; a name in both is the bone; positions that gameplay reads are
    empties (`marker`) or bones, never mesh nodes (lamp sets excepted: their mesh origin sits on their `nodePos`);
  * materials are the eight game materials, by name; no images;
  * UV0 "UVMap", UV1 "UVLight"; the colour attribute "Color" -> COLOR_0;
  * clips = NLA tracks named as in the manifest, from frame 0, within one frame of the manifest's seconds.
"""
import bpy, os, re, json, math
from mathutils import Vector, Matrix
from . import manifest, budget
from .scene import link, deselect_all, save_blend

NAME_RE = re.compile(r"^[a-z][a-z0-9_]*$")
NODE_TOLERANCE = 0.03
COLLIDER = "collider_terrain"

EXPORT_SETTINGS = dict(
    export_format='GLB', check_existing=False,
    export_yup=True,                      # Blender +Z up -> glTF +Y up (game space)
    export_apply=True,                    # apply modifiers (never the Armature)
    export_texcoords=True, export_normals=True, export_tangents=False,
    export_materials='EXPORT', export_image_format='NONE',          # materials are names: no image leaves Blender
    export_vertex_color='ACTIVE', export_all_vertex_colors=False, export_active_vertex_color_when_no_material=True,
    export_attributes=False,
    export_extras=True,                   # custom properties -> extras -> three userData
    export_cameras=False, export_lights=False,
    export_skins=True, export_def_bones=False, export_influence_nb=4, export_all_influences=False,
    export_morph=False,
    export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True, export_frame_step=1,
    export_anim_slide_to_zero=True, export_optimize_animation_size=True, export_anim_single_armature=True,
    export_reset_pose_bones=True, export_rest_position_armature=True, export_current_frame=False,
    export_nla_strips=True, export_bake_animation=False,
    export_draco_mesh_compression_enable=False,                     # meshopt is applied by tools/optimize-assets.mjs
    export_gpu_instances=False, export_shared_accessors=False,
    use_selection=True, use_visible=False, use_renderable=False, use_active_collection=False, use_active_scene=True,
)

_embedded = []        # asset ids merged in by zone.embed_prop (written beside the GLB for the build driver)


def note_embedded(asset_id):
    """Record that this scene imported the raw export of `asset_id` (zone.embed_prop calls it)."""
    if asset_id not in _embedded: _embedded.append(asset_id)


def marker(name, loc, rot_z_deg=0.0, parent=None, coll=None, **props):
    """An Empty: a glTF node without mesh (a socket, a muzzle, a hit point, a dressing anchor). loc = Blender
    coordinates (world, or local to `parent` when given). Custom properties given as keywords become extras.
    An unrotated marker faces Blender -Y = game +Z."""
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = 'ARROWS'; e.empty_display_size = 0.25
    e.location = loc; e.rotation_euler = (0, 0, math.radians(rot_z_deg))
    for k, v in props.items(): e[k] = v
    link(e, coll)
    if parent is not None: e.parent = parent
    return e


def ensure_root(asset_id):
    """Get or create the root Empty named `asset_id` at the origin and parent every parentless mesh, empty and
    armature to it (world transforms kept). Returns the root."""
    root = bpy.data.objects.get(asset_id)
    if root is None:
        root = bpy.data.objects.new(asset_id, None); root.empty_display_size = 0.1; link(root)
    elif root.type != 'EMPTY':
        raise RuntimeError(f"the object named '{asset_id}' must be the root Empty, not a {root.type}")
    bpy.context.view_layer.update()
    for o in sorted(bpy.context.scene.objects, key=lambda o: o.name):
        if o is root or o.parent is not None or o.type not in ('MESH', 'EMPTY', 'ARMATURE'): continue
        mw = o.matrix_world.copy()
        o.parent = root; o.matrix_parent_inverse = Matrix.Identity(4); o.matrix_world = mw
    bpy.context.view_layer.update()
    return root


def _descendants(root):
    out = []; stack = [root]
    while stack:
        o = stack.pop(); out.append(o)
        stack.extend(sorted(o.children, key=lambda c: c.name, reverse=True))
    return out


def _game(v):
    return (v[0], v[2], -v[1])


def _fcurves(act):
    out = []
    for layer in act.layers:
        for strip in layer.strips:
            for cb in strip.channelbags: out.extend(cb.fcurves)
    return out


def variant_names(a):
    """Variant nodes of a standalone asset: the manifest `nodes` names realised as plain mesh nodes that are shown ONE
    AT A TIME (jug_intact / jug_broken ...). Not bones, lamp sets, drawn or code-driven nodes, nor `*_mesh` names.
    Same rule as tools/check-glb.mjs variantNames."""
    no = set(a.get("bones") or []) | set(a.get("lampSets") or {}) | set(a.get("drawnNodes") or []) | set(a.get("codeDriven") or [])
    return [n for n in a.get("nodes", []) if n not in no and not n.endswith("_mesh")]


def _used_materials(o):
    me = o.data
    return {(me.materials[p.material_index].name if p.material_index < len(me.materials) and me.materials[p.material_index] else None) for p in me.polygons}


def draw_calls(asset_id, meshes):
    """Draw calls of one instance of a standalone asset, as the runtime pays them: ONE PER MESH PER MATERIAL (nothing
    is joined at load: two meshes sharing a material are two calls). Variant nodes show one at a time, so only the
    largest variant counts. Returns (count, [(mesh name, calls)] of the always-drawn meshes, (variant name, calls) | None)."""
    a = manifest.asset(asset_id)
    variants = set(variant_names(a))
    fixed = []; per = {}
    for o in meshes:
        if o.name == COLLIDER: continue
        n = len(_used_materials(o)); v = None; p = o
        while p is not None:
            if p.name in variants: v = p.name; break
            p = p.parent
        if v is None: fixed.append((o.name, n))
        else: per[v] = per.get(v, 0) + n
    worst = max(sorted(per.items()), key=lambda kv: kv[1]) if per else None
    return sum(n for _, n in fixed) + (worst[1] if worst else 0), fixed, worst


BAKE_EXTRAS = {"AO": ("AO",), "VL": ("VL",), "UNLIT": ("UNLIT",), "LM": ("LM",), "LM+VL": ("LM", "VL")}


def bake_extras(a):
    """The `bake` extras a mesh of standalone asset `a` may carry (same rule as tools/check-glb.mjs).
      * An asset whose bake is LM but which lists no lightmap of its own is embedded and lightmapped by its ZONE
        (ia_proving_mark): its own file is 'AO' (or 'VL').
      * An asset whose bake is VL and which is `placedBy: zone` is LIT BY THE ZONE that embeds it (zone.embed_prop +
        vcol.bake_vertex_light there): its own file carries unlit tint x AO x gradients, so it is 'AO'. Stamped 'VL'
        the viewer would show it at twice its authored brightness."""
    kind = a.get("bake")
    if kind in ("LM", "LM+VL") and not a.get("lightmaps"): return ("AO", "VL")
    if kind == "VL" and a.get("placedBy") == "zone": return ("AO",)
    return BAKE_EXTRAS.get(kind)


def stamp_bake(asset_id, meshes):
    """Set the mesh extras the runtime lights a STANDALONE asset by (zones: zone.merge_chunks does it per chunk mesh):
    `bake` = the manifest's bake ('AO' | 'VL' | 'UNLIT'); for 'LM' / 'LM+VL' a mesh whose UV1 ("UVLight") has a vertex
    off the lightmap's neutral texel gets 'LM' + `lightmap` (the asset's first lightmap), any other mesh 'VL'.
    An asset that its ZONE lights (bake LM without a lightmap of its own, or bake VL with `placedBy: zone`) holds
    unlit colours in its own file: 'AO'. An all-m_emis mesh gets 'UNLIT'.
    A value the script set itself is kept (check_scene judges it). Every face that ends up shown at COLOR_0 x 2 (a
    mesh stamped 'VL'; the faces of an 'LM' mesh whose UV1 is on the neutral texel) must have been through
    `vcol.bake_vertex_light`, which marks the faces it lit: check_scene fails the others (`vertex_light_errors`)."""
    a = manifest.asset(asset_id)
    if a.get("chunks"): return
    kind = a.get("bake"); lm = (a.get("lightmaps") or [None])[0]
    for o in meshes:
        if o.name == COLLIDER or "bake" in o.keys(): continue
        used = _used_materials(o)
        if used and used <= {"m_emis"}: o["bake"] = "UNLIT"; continue
        if kind in ("LM", "LM+VL") and lm is None: o["bake"] = "AO"
        elif kind == "VL" and a.get("placedBy") == "zone": o["bake"] = "AO"
        elif kind in ("LM", "LM+VL"):
            lit = False
            if lm is not None and len(o.data.uv_layers) > 1:
                import numpy as np
                from . import bake, uv
                nu = np.array(bake.neutral_uv(lm), dtype=np.float32)
                lit = bool((np.abs(uv.get(o, uv.UV1) - nu[None, :]).max(axis=1) > 1e-4).any())
            if lit: o["bake"] = "LM"; o["lightmap"] = lm
            elif kind == "LM+VL": o["bake"] = "VL"
            else: o["bake"] = "LM"; o["lightmap"] = lm
        elif kind in BAKE_EXTRAS: o["bake"] = kind


def uv1_faces(o, lightmap):
    """Per polygon of `o`, how its UV1 ("UVLight") stands to lightmap `lightmap`: (neutral, bare) bool arrays.
    neutral = every corner on the lightmap's neutral texel: a VERTEX-LIT face, shown at COLOR_0 x 2.
    bare    = the face was never given a lightmap UV at all: its UV1 is a single point that is not the neutral texel, or
              is still identical to UV0 (a UV layer created by `uv.ensure_layers` starts as a copy of UV0).
    Without a lightmap (None, unknown id) or without a UV1 layer every face is neutral."""
    import numpy as np
    from . import bake, uv
    me = o.data; n = len(me.polygons)
    try: nu = None if lightmap is None or uv.UV1 not in me.uv_layers else np.array(bake.neutral_uv(lightmap), dtype=np.float32)
    except KeyError: nu = None
    if nu is None or n == 0: return np.ones(n, dtype=bool), np.zeros(n, dtype=bool)
    u1 = uv.get(o, uv.UV1)
    ls = np.empty(n, dtype=np.int32); me.polygons.foreach_get("loop_start", ls)
    lt = np.empty(n, dtype=np.int32); me.polygons.foreach_get("loop_total", lt)
    owner = np.zeros(len(me.loops), dtype=np.int64)               # polygon of every loop (loops of a polygon are contiguous)
    owner[np.repeat(ls, lt) + (np.arange(int(lt.sum())) - np.repeat(np.cumsum(lt) - lt, lt))] = np.repeat(np.arange(n), lt)
    u = u1
    off = np.zeros(n, dtype=bool); np.logical_or.at(off, owner, np.abs(u - nu[None, :]).max(axis=1) > 1e-4)
    lo = np.full((n, 2), np.inf, dtype=np.float32); hi = np.full((n, 2), -np.inf, dtype=np.float32)
    np.minimum.at(lo, owner, u); np.maximum.at(hi, owner, u)
    neutral = ~off
    bare = (hi - lo).max(axis=1) < 1e-7                              # one point
    if len(me.uv_layers) and me.uv_layers[0].name != uv.UV1:         # or still the copy of UV0 that a new layer starts as
        same = np.ones(n, dtype=bool); np.logical_and.at(same, owner, np.abs(u - uv.get(o, me.uv_layers[0].name)).max(axis=1) < 1e-7)
        bare |= same
    return neutral, (~neutral) & bare


def face_materials(o):
    """Material name (or None) of every polygon of `o`."""
    me = o.data
    names = [m.name if m else None for m in me.materials]
    return [names[p.material_index] if p.material_index < len(names) else None for p in me.polygons]


def _face_at(o, mask):
    """'Blender (x, y, z)' of the largest polygon of `o` in `mask` (world space): where to look."""
    import numpy as np
    me = o.data; idx = np.nonzero(mask)[0]
    p = me.polygons[int(max(idx, key=lambda i: me.polygons[int(i)].area))]
    c = o.matrix_world @ p.center
    return f"Blender ({c.x:.2f}, {c.y:.2f}, {c.z:.2f})"


def vertex_light_errors(meshes, warn=True):
    """The vertex-light guard of `check_scene`. For every mesh stamped bake 'VL' or 'LM':
      * 'VL': every face is shown at COLOR_0 x 2 and must carry the vertex-lit mark (`vcol.mark_vertex_lit`, set by
        `vcol.bake_vertex_light` on the faces it updated);
      * 'LM': the faces whose UV1 sits on the neutral texel of the mesh's lightmap are the vertex-lit ones and must
        carry the mark. A mixed LM + VL mesh whose vertex bake was forgotten, or run on some objects or faces only,
        ships those faces at twice their tint (washed-out white) and used to pass;
      * 'LM': a face whose UV1 is one point off the neutral texel, or still equal to UV0, has no lightmap UV at all (its
        object was left out of `uv.unwrap_lightmap`) and would sample arbitrary texels.
    m_emis faces are exempt. A lightmapped face that ALSO carries the mark (tint x light / 2 under a lightmap: dark)
    is printed as a WARNING. Returns the error strings."""
    import numpy as np
    from . import vcol
    errs = []
    for o in meshes:
        kind = o.get("bake")
        if o.name == COLLIDER or kind not in ("VL", "LM") or not len(o.data.polygons): continue
        emis = np.array([m == "m_emis" for m in face_materials(o)], dtype=bool)
        marked = vcol.vertex_lit_faces(o)
        if kind == "VL":
            miss = ~emis & ~marked
            if miss.any():
                errs.append(f"mesh '{o.name}' is stamped bake VL (shown at COLOR_0 x 2) but {int(miss.sum())} of its {len(miss)} faces were never vertex-lit "
                            f"(e.g. the face at {_face_at(o, miss)}): call vcol.bake_vertex_light on it (on every object that goes into "
                            "it, before the join or zone.merge_chunks), or vcol.mark_vertex_lit(ob) if the script writes tint x light / 2 itself")
            continue
        lm = o.get("lightmap")
        neutral, bare = uv1_faces(o, lm)
        need = neutral & ~emis; miss = need & ~marked; bare = bare & ~emis
        if miss.any():
            errs.append(f"mesh '{o.name}' (bake LM, lightmap {lm}): {int(miss.sum())} of the {int(need.sum())} faces whose UV1 is on the neutral texel "
                        f"(the vertex-lit faces of a mixed mesh, shown at COLOR_0 x 2) were never vertex-lit (e.g. the face at {_face_at(o, miss)}): "
                        "unlit they ship at twice their tint, washed-out white. Pass their objects to vcol.bake_vertex_light (with "
                        "faces={name: ...} for an object that also has lightmapped faces) before the join, or vcol.mark_vertex_lit(ob, faces) "
                        "if the script writes tint x light / 2 itself")
        if bare.any():
            errs.append(f"mesh '{o.name}' (bake LM, lightmap {lm}): {int(bare.sum())} faces have no lightmap UV (their UV1 is a single point off the "
                        f"neutral texel, or still the copy of UV0 a new layer starts as; e.g. the face at {_face_at(o, bare)}): pass their object "
                        "to uv.unwrap_lightmap, with faces=[] (or a faces argument that leaves them out) when they are vertex-lit")
        both = ~neutral & marked & ~emis
        if warn and both.any():
            print(f"WARNING {o.name}: {int(both.sum())} lightmapped faces (e.g. at {_face_at(o, both)}) were ALSO vertex-lit: their COLOR_0 holds "
                  "tint x light / 2 under a lightmap and will show dark. Restrict vcol.bake_vertex_light with faces={name: the vertex-lit faces}")
    return errs


def project_modules():
    """Repo-relative paths of the project's own Python files this run imported (helpers beside the asset script).
    blender/lib and the script itself are left out: the build driver hashes those anyway. Written to <out>.deps.json
    so that editing a shared helper module makes every asset that imported it stale."""
    import sys
    root = manifest.ROOT + os.sep; lib = manifest.LIB + os.sep; out = set()
    for m in list(sys.modules.values()):
        f = getattr(m, "__file__", None)
        if not f or getattr(m, "__name__", "") == "__main__": continue
        f = os.path.abspath(f)
        if f.startswith(root) and not f.startswith(lib) and f.endswith(".py") and os.sep + ".tools" + os.sep not in f:
            out.add(os.path.relpath(f, manifest.ROOT).replace(os.sep, "/"))
    return sorted(out)


def check_scene(asset_id, placeholder=False):
    """Compare the scene with the manifest entry of `asset_id`. Returns a list of error strings (empty = good)."""
    a = manifest.asset(asset_id)
    errs = []
    root = bpy.data.objects.get(asset_id)
    if root is None or root.type != 'EMPTY': return [f"no root Empty named '{asset_id}' (export.ensure_root)"]
    bpy.context.view_layer.update()
    if max(abs(x) for row in (root.matrix_world - Matrix.Identity(4)) for x in row) > 1e-6:
        errs.append("the root must be at the origin, unrotated, unscaled")
    objs = _descendants(root)
    arms = [o for o in objs if o.type == 'ARMATURE']
    meshes = [o for o in objs if o.type == 'MESH']
    names = {}
    for o in objs: names.setdefault(o.name, []).append(f"object({o.type.lower()})")
    bones = {}
    for arm in arms:
        for b in arm.data.bones:
            names.setdefault(b.name, []).append(f"bone of {arm.name}"); bones[b.name] = (arm, b)
    for n in sorted(names):
        if len(names[n]) > 1: errs.append(f"name '{n}' is used twice ({', '.join(names[n])}): names are unique across objects and bones")
        if not NAME_RE.match(n): errs.append(f"name '{n}' is not snake_case (letters, digits, _)")
    want_bones = a.get("bones", []) or []
    lamp_sets = a.get("lampSets", {}) or {}
    node_pos = a.get("nodePos", {}) or {}
    by_name = {o.name: o for o in objs}
    for b in want_bones:
        if b not in bones: errs.append(f"bone '{b}' is missing" + (" (it exists as an object: a name in `bones` must be the bone)" if b in by_name else ""))
    for n in a.get("nodes", []):
        if n in want_bones: continue
        if n not in by_name: errs.append(f"node '{n}' is missing" + (" (it exists as a bone but the manifest does not list it in `bones`)" if n in bones else ""))
    for n, p in sorted(node_pos.items()):
        if n in bones and n in want_bones:
            arm, b = bones[n]; w = arm.matrix_world @ b.head_local
        elif n in by_name:
            o = by_name[n]; w = o.matrix_world.translation
            if o.type == 'MESH' and n not in lamp_sets:
                errs.append(f"node '{n}' has a nodePos: it must be an empty or a bone, not a mesh (the optimiser may move mesh nodes)")
        else: continue
        g = _game(w); d = math.sqrt(sum((g[i] - p[i]) ** 2 for i in range(3)))
        if d > NODE_TOLERANCE:
            errs.append(f"node '{n}' is at ({g[0]:.3f}, {g[1]:.3f}, {g[2]:.3f}) game space; the manifest's nodePos is {p} ({d:.3f} m off, tolerance {NODE_TOLERANCE})")
    for n, parent in sorted((a.get("nodeParent") or {}).items()):
        o = by_name.get(n)
        if o is None: continue
        has = o.parent_bone if (o.parent is not None and o.parent.type == 'ARMATURE' and o.parent_type == 'BONE') else (o.parent.name if o.parent else None)
        if has != parent: errs.append(f"node '{n}' must ride '{parent}' (manifest nodeParent); its parent is '{has}' (rig.parent_to_bone)")
    # draw calls and baked-light extras of a standalone asset
    if not a.get("chunks"):
        n_dc, fixed, worst = draw_calls(asset_id, meshes)
        if n_dc > a["drawCalls"]:
            errs.append(f"{n_dc} draw calls > drawCalls {a['drawCalls']}: one per mesh per material ("
                        + ", ".join(f"{nm} x{k}" if k > 1 else nm for nm, k in fixed)
                        + (f"; variants show one at a time, the largest is {worst[0]}" if worst else "")
                        + "). Join static parts into one mesh per material (mesh.join) or rigid-skin moving ones (rig.join_as_rigid_skin)")
        want = bake_extras(a)
        for o in meshes:
            if o.name == COLLIDER or "bake" not in o.keys(): continue           # export_asset stamps the missing ones
            used = _used_materials(o)
            if used and used <= {"m_emis"}:
                if o["bake"] != "UNLIT": errs.append(f"mesh '{o.name}' (m_emis) has bake '{o['bake']}': it must be UNLIT")
            elif want and o["bake"] not in want:
                errs.append(f"mesh '{o.name}' has bake '{o['bake']}'; the manifest's bake {a['bake']} allows {list(want)}")
            elif o["bake"] == "LM" and (o.get("lightmap") not in (a.get("lightmaps") or []) or len(o.data.uv_layers) < 2):
                errs.append(f"mesh '{o.name}' is bake LM: it needs UV1 'UVLight' and the extra lightmap = one of {a.get('lightmaps') or []}")
    # every face the runtime shows at COLOR_0 x 2 must hold baked light / 2 (standalone assets and zone chunk meshes alike)
    errs.extend(vertex_light_errors(meshes))
    # lamp sets
    for n, count in sorted(lamp_sets.items()):
        o = by_name.get(n)
        if o is None: continue
        if o.type != 'MESH': errs.append(f"lamp set '{n}' must be a mesh with material m_emis"); continue
        if o.get("lampCount") != count: errs.append(f"lamp set '{n}': custom property lampCount is {o.get('lampCount')}, the manifest says {count} (zone.lamp_set sets it)")
        used = {s.material.name for s in o.material_slots if s.material}
        if used != {"m_emis"}: errs.append(f"lamp set '{n}' must use only m_emis, has {sorted(used)}")
        if len(o.data.uv_layers) < 2: errs.append(f"lamp set '{n}' has no UV1 (lamp index in UV1.x)")
    # materials, UV order, colour
    allowed = set(a["materials"])
    for o in meshes:
        if o.name == COLLIDER: continue
        used = set()
        me = o.data
        for p in me.polygons:
            m = me.materials[p.material_index] if p.material_index < len(me.materials) else None
            used.add(m.name if m else None)
        if not me.polygons: errs.append(f"mesh '{o.name}' has no faces")
        for m in sorted(used, key=str):
            if m is None: errs.append(f"mesh '{o.name}' has faces without a material (material.assign)")
            elif m not in manifest.MATERIALS: errs.append(f"mesh '{o.name}' uses '{m}', which is not a game material")
            elif m not in allowed: errs.append(f"mesh '{o.name}' uses {m}; the manifest allows {sorted(allowed)} for {asset_id}")
        if len(me.uv_layers) == 0 or me.uv_layers[0].name != "UVMap": errs.append(f"mesh '{o.name}': UV layer 0 must be 'UVMap' (has {[l.name for l in me.uv_layers]})")
        if len(me.uv_layers) > 1 and me.uv_layers[1].name != "UVLight": errs.append(f"mesh '{o.name}': UV layer 1 must be 'UVLight'")
        if len(me.uv_layers) > 2: errs.append(f"mesh '{o.name}' has {len(me.uv_layers)} UV layers; only UVMap and UVLight are exported")
        ac = me.color_attributes.active_color
        if "Color" not in me.color_attributes or ac is None or ac.name != "Color":
            errs.append(f"mesh '{o.name}' has no active colour attribute 'Color' (COLOR_0): a flat mesh is a fail (vcol.compose_vertex_color)")
        if any(abs(s - 1.0) > 1e-4 for s in o.matrix_world.to_scale()) and not any(m.type == 'ARMATURE' for m in o.modifiers):
            errs.append(f"mesh '{o.name}' has an unapplied scale {tuple(round(s, 3) for s in o.matrix_world.to_scale())}")
    # zone plan
    if a.get("chunks"):
        plan = {f"{c['id']}__{m}" for c in a["chunks"] for m in c["materials"]} | set(a.get("drawnNodes", [])) | {COLLIDER}
        for o in meshes:
            if o.name not in plan: errs.append(f"mesh '{o.name}' is not in the chunk plan of {asset_id} (expected <chunk>__<material> or a drawn node; zone.merge_chunks)")
        for n in sorted(plan - {COLLIDER} - {o.name for o in meshes}):
            errs.append(f"planned mesh '{n}' is missing")
    # skin
    if a.get("skinned"):
        skinned = [o for o in meshes if any(m.type == 'ARMATURE' and m.object is not None for m in o.modifiers)]
        if not skinned: errs.append("the manifest says skinned: true but no mesh has an Armature modifier (rig.join_as_rigid_skin)")
        for o in skinned:
            arm = next(m.object for m in o.modifiers if m.type == 'ARMATURE')
            groups = {g.index: g.name for g in o.vertex_groups}
            bad = 0
            for v in o.data.vertices:
                if sum(g.weight for g in v.groups if groups.get(g.group) in arm.data.bones) <= 1e-6: bad += 1
            if bad: errs.append(f"skinned mesh '{o.name}': {bad} vertices have no bone weight")
    # clips
    want = {c["name"]: c for c in a.get("animations", [])}
    have = {}
    for o in objs:
        if not o.animation_data: continue
        if o.animation_data.action is not None and not placeholder:
            errs.append(f"'{o.name}' still has an active action '{o.animation_data.action.name}': push every action to NLA (anim.push_to_nla)")
        for tr in o.animation_data.nla_tracks:
            for st in tr.strips:
                if st.action is not None: have.setdefault(tr.name, []).append((o, st.action))
    for n in sorted(want):
        if n not in have: errs.append(f"clip '{n}' is missing (an NLA track with that exact name)")
    for n in sorted(have):
        if n not in want: errs.append(f"clip '{n}' is not in the manifest (has {sorted(want)})"); continue
        c = want[n]
        f0 = min(act.frame_range[0] for _, act in have[n]); f1 = max(act.frame_range[1] for _, act in have[n])
        if abs(f0) > 1e-6: errs.append(f"clip '{n}' starts at frame {f0:g}; clips start at frame 0")
        dur = (f1 - f0) / manifest.FPS
        if abs(dur - c["seconds"]) > 1.0 / manifest.FPS + 1e-6:
            errs.append(f"clip '{n}' is {f1 - f0:g} frames = {dur:.3f} s; the manifest says {c['seconds']} s (author {manifest.clip_frames(asset_id, n)} frames)")
        if c.get("loop"):
            for _, act in have[n]:
                for fc in _fcurves(act):
                    if abs(fc.evaluate(f0) - fc.evaluate(f1)) > 1e-4:
                        errs.append(f"clip '{n}' is a loop but '{fc.data_path}[{fc.array_index}]' differs between its first and last frame"); break
    # code-driven names are never keyed
    for n in a.get("codeDriven", []) or []:
        for cname in sorted(have):
            for o, act in have[cname]:
                for fc in _fcurves(act):
                    if f'pose.bones["{n}"]' in fc.data_path or (o.name == n and not fc.data_path.startswith("pose.")):
                        errs.append(f"clip '{cname}' keys the code-driven node '{n}' ({fc.data_path})"); break
    return errs


def export_glb(path, objects=None, **overrides):
    """The verified exporter call on `objects` (default: everything selected). Raises unless it finishes."""
    kw = dict(EXPORT_SETTINGS); kw.update(overrides)
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    if objects is not None:
        deselect_all()
        for o in objects: o.select_set(True)
    r = bpy.ops.export_scene.gltf(filepath=os.path.abspath(path), **kw)
    if r != {'FINISHED'}: raise RuntimeError(f"glTF export failed: {r}")
    return path


def export_asset(asset_id, out, blend=None, placeholder=False, check=True):
    """Check the scene against the manifest and export the RAW GLB of `asset_id` to `out`
    (blender/export/<category>/<id>.glb: pass args.out; `manifest.raw_path(asset_id)` is the same path).

    1. `ensure_root(asset_id)`: everything is parented to the root Empty.
    2. `stamp_bake` (standalone assets: the `bake` / `lightmap` extras the runtime lights the mesh by), then
       `check_scene`: root, names, every face shown at COLOR_0 x 2 was really vertex-lit (`vertex_light_errors`: a 'VL'
       mesh, and the neutral-texel faces of an 'LM' mesh), every `nodes` / `bones` name, `nodePos` within 0.03 m, `nodeParent`, draw calls
       (one per mesh per material, variants counted once) against `drawCalls`, lamp sets, materials, UV layers, the
       chunk plan (zones), skin weights, clip names / lengths / loop flags, `codeDriven` unkeyed.
       Any error -> RuntimeError listing all of them (the script exits 1, the build prints FAILED with the list).
    3. `budget.assert_budget` against the manifest's `triBudget`.
    4. Mesh datablocks are renamed `me_<object>` (names must not collide with nodes in three); every mesh is
       triangulated here (fixed diagonal, custom normals kept) so the same scene always exports the same bytes.
    5. The verified glTF call: Y up, modifiers applied, extras, COLOR_0 from "Color", NLA tracks as clips at 30 fps,
       no images, no compression.
    `placeholder=True` is for blender/placeholders.py only (root extra `placeholder: true`).
    Returns the budget report. Also writes `<out>.deps.json` for the build driver (the assets a zone embedded, the
    project modules this run imported, the texture-table entries it read) and, with `blend`, the .blend."""
    a = manifest.asset(asset_id)
    root = ensure_root(asset_id)
    for o in _descendants(root):
        if o.type == 'ARMATURE':
            for pb in o.pose.bones:
                pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.rotation_euler = (0, 0, 0); pb.scale = (1, 1, 1)
    bpy.context.scene.frame_set(0)
    stamp_bake(asset_id, [o for o in _descendants(root) if o.type == 'MESH'])
    if check:
        errs = check_scene(asset_id, placeholder)
        if errs:
            raise RuntimeError(f"{asset_id} does not match its manifest entry ({len(errs)} problem{'s' if len(errs) != 1 else ''}):\n  - " + "\n  - ".join(errs))
    objs = [o for o in _descendants(root) if o.type in ('MESH', 'EMPTY', 'ARMATURE')]
    meshes = [o for o in objs if o.type == 'MESH']
    for o in meshes:                                               # the vertex-lit mark has been judged: it is not part of the asset
        t = o.data.attributes.get("ks_vl")
        if t is not None: o.data.attributes.remove(t)
    rep = budget.budget_report([o for o in meshes if o.name != COLLIDER])
    budget.assert_budget(rep, max_tris=a["triBudget"], what=asset_id)
    import bmesh
    done = set()
    for o in meshes:                                               # a fixed, single-threaded triangulation: Blender's own
        if o.data.name in done: continue                           # (exporter or modifier) orders triangles differently
        done.add(o.data.name)                                      # from run to run on meshes that mix triangles and quads
        bm = bmesh.new(); bm.from_mesh(o.data)
        bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3], quad_method='FIXED', ngon_method='EAR_CLIP')
        # canonical element order: some bmesh operators (create_uvsphere, remove_doubles, extrude) order their output
        # by memory address, which changes from run to run
        vs = sorted(bm.verts, key=lambda v: (round(v.co.x, 6), round(v.co.y, 6), round(v.co.z, 6)))
        for i, v in enumerate(vs): v.index = i
        bm.verts.sort()                                             # no key: reorders by the indices just set
        fs = sorted(bm.faces, key=lambda f: (f.material_index,) + tuple(round(c, 6) for c in f.calc_center_median()) + (round(f.calc_area(), 9),))
        for i, f in enumerate(fs): f.index = i
        bm.faces.sort()
        bm.to_mesh(o.data); bm.free()
    seen = set()
    for o in meshes:
        if o.data.name in seen: continue
        seen.add(o.data.name)
        o.data.name = "me_" + o.name
    for arm in (o for o in objs if o.type == 'ARMATURE'): arm.data.name = "arm_" + arm.name
    root["asset"] = asset_id
    if placeholder: root["placeholder"] = True
    elif "placeholder" in root.keys(): del root["placeholder"]
    bpy.context.scene.render.fps = manifest.FPS
    export_glb(out, objs)
    deps = os.path.abspath(out) + ".deps.json"
    with open(deps, "w", encoding="utf-8") as f:
        json.dump({"asset": asset_id, "embedded": sorted(_embedded), "modules": project_modules(), "tables": manifest.tables_used()}, f)
    if blend: save_blend(blend)
    print(f"EXPORTED {asset_id}: {budget.summary(rep)} (budget {a['triBudget']}) -> {out}")
    return rep


def preview(asset_id, glb, clips=False, out_dir=None):
    """The preview hook of an art script: render the contact sheet of the raw GLB just exported into
    shots/<piece>/<id>_sheet.png (8-view Workbench turntable with vertex colours, each view fitted to the subject,
    about a second; `<piece>` = `manifest.piece_of_id`: the builder of this asset) and, with
    clips=True, one 5-frame strip per clip (<id>__<clip>.png). Runs blender/tools/preview.py in a fresh process.
    Failures are printed, never raised: a preview must not fail a build. Same output as
    `node tools/preview-asset.mjs <id>`."""
    import subprocess
    a = manifest.asset(asset_id)
    out_dir = out_dir or manifest.shots_dir(asset_id)
    os.makedirs(out_dir, exist_ok=True)
    exe = os.path.join(manifest.ROOT, "tools", "blender.sh"); script = os.path.join(manifest.ROOT, "blender", "tools", "preview.py")
    jobs = [((["--cull", "--elev", "50"] if a.get("chunks") else []), os.path.join(out_dir, asset_id + "_sheet.png"))]   # a room or zone: a dollhouse
    if clips: jobs += [(["--clip", c["name"], "--cols", "5"], os.path.join(out_dir, f"{asset_id}__{c['name']}.png")) for c in a.get("animations", [])]
    for extra, png in jobs:
        r = subprocess.run([exe, "-b", "--factory-startup", "--python-exit-code", "1", "-P", script, "--", os.path.abspath(glb), png] + extra,
                           capture_output=True, text=True)
        print(f"PREVIEW {png}" if r.returncode == 0 else f"PREVIEW FAILED {png}: {(r.stdout + r.stderr).strip().splitlines()[-1:]}")
