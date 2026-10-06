# Blender pipeline cookbook (headless Blender 4.5.14 -> glTF -> three.js r186)

Everything here was run on this machine through `tools/blender.sh` (Blender 4.5.14 LTS,
glTF add-on `io_scene_gltf2` 4.5.51) and checked either by inspecting the GLB with
`@gltf-transform/core` 4.5 or by loading it in three 0.186.1 inside the project's headless
Chromium. Anything that was **not** run is flagged in bold in place — **(not verified)**, **(not measured)**,
**(not reproduced)** or "Not exercised".

- Machine: WSL2, Intel Core Ultra 7 265F (20 threads), 31 GB, NVIDIA RTX 5070 12 GB (driver 615.71 / CUDA 13.4).
- Verified reference code (copy from here, it is what actually ran): `docs/research/blender-pipeline-code/`
  - Python: `common.py`, `cyclesutil.py`, `materials.py`, `texbake.py`, `lightmap.py`, `riglib.py`, `artlib.py`, `exportlib.py`, `preview.py`, `template_asset.py`
  - Node: `inspect-glb.mjs`, `optimize-glb.mjs`, `dump-anim.mjs`, `dump-attr.mjs`, `web/{serve,shot}.mjs`, `web/{inspect,lightmap}.html`
  - Regression test that exercises every helper and asserts on the exported GLBs (passes on CPU and CUDA, a few seconds):
    `tools/blender.sh -b --factory-startup --python-exit-code 1 -P docs/research/blender-pipeline-code/selftest.py -- <out_dir> CUDA`
    then `node docs/research/blender-pipeline-code/selftest-check.mjs <out_dir>`
- Evidence renders: `shots/research-blender/` (git-ignored). Raw experiments: `scratch/research-blender/exp*.py` (git-ignored, may vanish).
- These files are prototypes for `blender/lib/` (section 11). I do not own `blender/lib/`; its owner should lift them.

Contents: 1 skeleton · 2 modelling · 3 materials · 4 texture baking + GPU verdict · 5 lightmaps ·
6 rigging · 7 animation · 8 export · 9 previews · 10 budgets · 11 library layout + art workflow · Traps

---

## 0. The twelve things to remember

1. Run with `--python-exit-code 1` **and** wrap `main()` in try/except -> `sys.exit(1)`. Operators fail by *returning* `{'CANCELLED'}`; check the return value.
2. `bmesh.ops.create_*(calc_uvs=True)` creates **no** UVs unless `bm.loops.layers.uv.new()` was called first.
3. `mesh.use_auto_smooth` is gone. Use `polygon.use_smooth = True` + `mesh.set_sharp_from_angle(angle=...)`. `bpy.ops.object.shade_auto_smooth` is `CANCELLED` headless.
4. Procedural shader nodes do not export (you get white base colour, roughness 1). Bake them or use vertex colours.
5. Vertex colours: export with `export_vertex_color='ACTIVE', export_all_vertex_colors=False`. The default (`MATERIAL` + all) can put a fake white `COLOR_0` in front of your data.
6. `TEXCOORD_n` follows UV-layer **order**, not the render flag. Material UVs must be layer 0, lightmap UVs layer 1.
7. GPU: **CUDA works headless, OptiX does not** (init error 7804). Cycles ignores `use_denoising` and adaptive sampling when baking; denoise the baked image with the compositor OIDN node.
8. Diffuse bakes are black on `Metallic = 1` surfaces. Force metallic to 0 while baking light.
9. three.js: `lightMapIntensity = Math.PI * scale`, `texture.channel = 1`, `texture.flipY = false`.
10. Animations: always `export_force_sampling=True`. Put every clip on its own NLA track and export with `export_animation_mode='NLA_TRACKS'` (track name = clip name). `ACTIONS` mode silently drops non-active actions as soon as the file has two armatures.
11. gltf-transform: `prune()` deletes `TEXCOORD_1` (and any UV set no glTF texture references) unless `keepAttributes: true`; `quantize()/meshopt()` rewrites the TRS of mesh nodes. Game code must read gameplay transforms from empties, never from mesh nodes.
12. Names must be unique across objects, bones and meshes and contain no `. [ ] : /` or spaces. three renames collisions to `name_1` and strips those characters.

---

## 1. Script skeleton

Verified template: `blender-pipeline-code/template_asset.py`. Same seed -> byte-identical GLB (sha256 equal over repeated runs), different seed -> different GLB.

```
tools/blender.sh -b --factory-startup --python-exit-code 1 -P blender/<script>.py -- --out public/assets/props/x.glb --seed 7
```

```python
import bpy, bmesh, sys, os, argparse, random, traceback
from mathutils import Vector, noise

def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []   # everything after "--" is ours
    p = argparse.ArgumentParser(prog=os.path.basename(__file__))
    p.add_argument("--out", required=True)
    p.add_argument("--blend", default=None, help="also save the .blend here")
    p.add_argument("--seed", type=int, default=1)
    return p.parse_args(argv)

def reset_scene(fps=30):
    bpy.ops.wm.read_factory_settings(use_empty=True)        # no cube/camera/light, default prefs
    bpy.context.preferences.filepaths.save_version = 0      # no .blend1 backups
    s = bpy.context.scene
    s.unit_settings.system = 'METRIC'; s.unit_settings.scale_length = 1.0
    s.render.fps = fps; s.frame_start = 0
    return s

def must(result, what):
    """Operators report failure by RETURN VALUE ({'CANCELLED'}), not by raising."""
    if result != {'FINISHED'}:
        raise RuntimeError(f"{what} -> {result}")

def main():
    args = parse_args()
    reset_scene()
    rng = random.Random(args.seed)                          # never the global RNG, never time-based seeds
    noise.seed_set(args.seed)
    # ... build ...
    out = os.path.abspath(args.out); os.makedirs(os.path.dirname(out), exist_ok=True)
    must(bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', check_existing=False,
                                   export_apply=True, export_extras=True), "gltf export")
    if args.blend:
        b = os.path.abspath(args.blend); os.makedirs(os.path.dirname(b), exist_ok=True)
        must(bpy.ops.wm.save_as_mainfile(filepath=b, compress=True, check_existing=False), "save blend")

if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except BaseException:
        traceback.print_exc()
        sys.exit(1)
```

Measured exit codes (`scratch/.../exp01*`):

| Situation | Exit code |
|---|---|
| Script finishes | 0 |
| Uncaught exception, no flag | **0** (Blender swallows it) |
| Uncaught exception, `--python-exit-code 3` (must come before `-P`) | 3 |
| `sys.exit(1)` from the except block | 1 |
| argparse error (missing/unknown argument) | 2 |

Determinism rules (all observed):

- `random.Random(seed)`; `mathutils.noise.fractal/noise/cell` are pure functions of position (offset the input by the seed).
- **Never iterate a `set` of strings** — order changed between two runs of the same script (`PYTHONHASHSEED` is randomised). Sort first.
- Geometry from bmesh ops, Displace(Clouds texture, `texture_coords='GLOBAL'`) and Decimate was byte-identical across runs.
- **Bevel + pre-existing UVs is not byte-deterministic**: UVs interpolated through a bevel (modifier or `bmesh.ops.bevel`) differ by ~1e-7 between runs, even with `-t 1`. Bevel geometry itself is deterministic. Unwrap *after* bevelling and the GLB is byte-identical again (`exp10b`).
- `.blend` files are not byte-stable (two saves of the same scene differed in size). Only compare GLBs.
- numpy ships inside Blender's Python and is used throughout (`foreach_get/foreach_set`).
- A helper module imported with `sys.path.insert(0, dirname(__file__))` writes `__pycache__` next to it; set `sys.dont_write_bytecode = True` first if that matters.

---

## 2. Procedural modelling

All of this ran in `exp02_model.py`, `exp12_art.py`, `exp13_misc.py`.

### 2.1 bmesh -> object

```python
def new_mesh_object(name, bm, coll=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    (coll or bpy.context.scene.collection).objects.link(ob)
    return ob

def bm_box(bm, size, center=(0, 0, 0), rot=None):            # append a box to an existing bmesh
    vs = bmesh.ops.create_cube(bm, size=1.0)['verts']
    bmesh.ops.scale(bm, vec=size, verts=vs)
    if rot is not None: bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=rot, verts=vs)
    bmesh.ops.translate(bm, vec=center, verts=vs)
    return vs
```

Useful ops that ran: `create_cube/grid/cone/icosphere/uvsphere`, `scale/translate/rotate`,
`inset_region`, `extrude_face_region`, `bevel(geom=edges, offset, segments, affect='EDGES', profile=0.5)`,
`bisect_plane`, `subdivide_edges`, `triangulate`, `delete(context='FACES')`, `recalc_face_normals`.
`create_grid(size=s)` takes the **half** extent (size=20 -> 40 m wide).

### 2.2 Modifiers and applying them

```python
def deselect_all():
    vl = bpy.context.view_layer
    vl.update()                         # bpy.data.objects.remove() leaves a stale None in view_layer.objects until an update
    for o in vl.objects:
        if o is not None: o.select_set(False)

def select_only(ob):
    deselect_all()
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob

def apply_modifiers(ob):
    select_only(ob)
    for m in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)
```

| Modifier | Settings that worked | Notes |
|---|---|---|
| `BEVEL` | `width=0.008..0.03`, `segments=1..2`, `limit_method='ANGLE'`, `angle_limit=radians(30..40)`, `harden_normals=False` | 12-tri box -> 108 tris with 2 segments, 44 with 1 |
| `WEIGHTED_NORMAL` | `mode='FACE_AREA'`, `weight=50`, `keep_sharp=True` | needs smooth-shaded faces; after apply `mesh.has_custom_normals == True`; **survives glTF export** (24/24 flat-face vertices kept the exact face normal; 0/24 without it) |
| `SOLIDIFY` | `thickness`, `offset=1.0` | |
| `ARRAY` | `use_relative_offset=False`, `use_constant_offset=True`, `constant_offset_displace=(dx,0,0)` | offsets are in **object space**: apply scale first |
| `BOOLEAN` | `operation='DIFFERENCE'`, `solver='EXACT'`, `object=cutter` | instant for boxes; leaves n-gons (fine, the exporter triangulates); delete the cutter afterwards |
| `DISPLACE` | `texture=bpy.data.textures.new(n,'CLOUDS')`, `strength`, `mid_level=0.5`, `texture_coords='GLOBAL'` | GLOBAL makes neighbouring terrain chunks line up |
| `DECIMATE` | `decimate_type='COLLAPSE', ratio=0.25` or `'DISSOLVE', angle_limit=radians(8)` | 8192-tri terrain -> 2048 in 0.03 s |
| `TRIANGULATE` | `keep_custom_normals=True` | optional; the exporter triangulates anyway |

`bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)` works headless on the active selected object.

### 2.3 Normals in 4.5

`mesh.use_auto_smooth` does not exist any more (`hasattr` is False).

```python
me = ob.data
for p in me.polygons: p.use_smooth = True
me.set_sharp_from_angle(angle=math.radians(35))    # writes the 'sharp_edge' attribute; normals_domain becomes 'CORNER'
```

- `bpy.ops.object.shade_smooth_by_angle(angle=..., keep_sharp_edges=False)` -> `{'FINISHED'}` headless (same effect, operator form).
- `bpy.ops.object.shade_auto_smooth(...)` -> `{'CANCELLED'}` headless with "Asset loading is unfinished" (it needs the Smooth-by-Angle node group from the essentials asset library). Do not use.

The standard finishing chain (verified, `artlib.finish`):

```python
def finish(ob, bevel=0.012, segments=1, smooth_angle=35, weighted=True):
    if bevel > 0:
        m = ob.modifiers.new("Bevel", 'BEVEL')
        m.width = bevel; m.segments = segments; m.limit_method = 'ANGLE'; m.angle_limit = math.radians(40)
        m.miter_outer = 'MITER_ARC'; m.harden_normals = False
    apply_modifiers(ob)
    me = ob.data
    for p in me.polygons: p.use_smooth = True
    me.set_sharp_from_angle(angle=math.radians(smooth_angle))
    if weighted:
        w = ob.modifiers.new("WN", 'WEIGHTED_NORMAL'); w.mode = 'FACE_AREA'; w.weight = 50; w.keep_sharp = True
        apply_modifiers(ob)
    return ob
```

In three (`shots/research-blender/exp13_three_tex.png`): the weighted-normal cube has flat faces with a tight
bevel highlight; the plain smooth-bevel cube shades "pillowy".

### 2.4 Noise for rocks and terrain

```python
from mathutils import noise
bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=3, radius=0.5)
off = Vector((seed * 3.7, seed * 1.3, 0))
for v in bm.verts:
    d = v.co.normalized()
    n1 = noise.fractal(d * 1.4 + off, 1.0, 2.0, 3, noise_basis='PERLIN_ORIGINAL')
    cell = noise.cell(d * 2.2 + off)                       # faceted chunks
    v.co = d * 0.5 * (1.0 + 0.30 * n1 + 0.10 * cell)
    v.co.z = max(v.co.z * 0.75, -0.125)                    # squash + flat bottom
rock = new_mesh_object("Rock", bm)
d = rock.modifiers.new("Dec", 'DECIMATE'); d.ratio = 0.22   # 1280 tris -> 70
apply_modifiers(rock)
```

### 2.5 Joining, origins, transforms

```python
deselect_all()
for o in parts: o.select_set(True)
bpy.context.view_layer.objects.active = parts[0]            # the survivor; keeps its name, origin and material slots
bpy.ops.object.join()

def set_origin(ob, world_point):                            # move the pivot without moving the geometry (no operator)
    mw = ob.matrix_world
    local = mw.inverted() @ Vector(world_point)
    ob.data.transform(Matrix.Translation(-local))
    ob.matrix_world = mw @ Matrix.Translation(local)
```

Join merges UV layers by name and vertex groups by name (that is how `join_as_rigid_skin` in section 6 works).
The cursor variant also works headless: set `scene.cursor.location`, then `bpy.ops.object.origin_set(type='ORIGIN_CURSOR')`.

Conventions (axes verified in section 8): author in Blender space (+Z up, front faces −Y). Put the object origin where the
game needs the pivot: base-centre for props, hinge line for doors. Keep object scale at 1 (apply it); rotation/location stay on
the object and export as node TRS. An unrotated Blender object faces −Y, which is **+Z in three** (the direction `Object3D.lookAt` uses).

---

## 3. Materials for export

Tested in `exp03_materials.py`, `exp03b_vcol.py`, `exp13_misc.py`, `exp18_alpha.py`.

### 3.1 What survives

| Blender (Principled BSDF) | glTF | three r186 |
|---|---|---|
| Base Color value | `baseColorFactor` | `color` |
| Metallic / Roughness values | `metallicFactor` / `roughnessFactor` | same |
| Image -> Base Color | `baseColorTexture` | `map` |
| Image(s) -> Roughness and/or Metallic | one packed `metallicRoughnessTexture` (G = rough, B = metal), named `metal-rough`; factors become 1 | `roughnessMap`/`metalnessMap` |
| Image -> Normal Map node -> Normal | `normalTexture` | `normalMap` (no TANGENT needed; `export_tangents=True` adds TANGENT and ~20% more vertices) |
| Emission Color + Strength | `emissiveFactor` + `KHR_materials_emissive_strength` | `emissive`, `emissiveIntensity` |
| Mapping node (scale/offset) before an image | `KHR_texture_transform` | handled by GLTFLoader |
| Color Attribute node -> Base Color | `COLOR_0` | `material.vertexColors = true` automatically, multiplies `color`/`map` |
| Mix(MULTIPLY) of image × Color Attribute -> Base Color | `baseColorTexture` + `COLOR_0` | both multiply |
| Alpha value < 1, or anything linked to Alpha | `alphaMode: BLEND` | transparent, sorted, no depth write — avoid |
| Image alpha -> Math(`GREATER_THAN` 0.5) -> Alpha | `alphaMode: MASK` | alpha test — use this for grates/foliage |
| `material.use_backface_culling = True` | `doubleSided: false` | `FrontSide` |
| Custom property on material | `material.extras` | `material.userData` |
| "glTF Material Output" node group, `Occlusion` input | `occlusionTexture` (R channel only) with its own `texCoord` | `aoMap` (+ `channel`) |

What does **not** survive:

- **Any procedural node** (Noise, Brick, ColorRamp, ...) feeding a socket: the material exports as `baseColor = 1,1,1`, `roughness = 1`, no texture, no warning that helps. Bake to images (section 4) or to vertex colours (section 5.6).
- `material.blend_method = 'CLIP'`: ignored in 4.5 (the property reads back `HASHED`); export is `BLEND`. Use the Math node route above.
- Materials are **double-sided by default** (`doubleSided: true`). Set `use_backface_culling = True` on every material unless you really need two sides — double-sided costs fill rate.
- Lights, world, shadows, subsurface, displacement: not used by this project's runtime (lighting is baked).

Minimal constructors:

```python
def principled(name, base=(0.8, 0.8, 0.8, 1), metallic=0.0, roughness=0.5, emission=None, emission_strength=1.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    m.use_backface_culling = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = base
    b.inputs["Metallic"].default_value = metallic
    b.inputs["Roughness"].default_value = roughness
    if emission:
        b.inputs["Emission Color"].default_value = (*emission, 1)      # 4.x socket names: "Emission Color", "Emission Strength"
        b.inputs["Emission Strength"].default_value = emission_strength
    return m

def textured(name, albedo_png, rough_png=None, normal_png=None):
    m = principled(name); nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    def tex(path, cs):
        i = bpy.data.images.load(path); i.colorspace_settings.name = cs       # 'sRGB' or 'Non-Color'
        n = nt.nodes.new("ShaderNodeTexImage"); n.image = i; return n
    nt.links.new(tex(albedo_png, 'sRGB').outputs["Color"], b.inputs["Base Color"])
    if rough_png: nt.links.new(tex(rough_png, 'Non-Color').outputs["Color"], b.inputs["Roughness"])
    if normal_png:
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(tex(normal_png, 'Non-Color').outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    return m
```

Images referenced from disk (`bpy.data.images.load`) and packed/generated images both get embedded in the GLB as PNG
(`export_image_format='AUTO'`). Rendered in three after WebP + meshopt: `shots/research-blender/exp13_three_tex.png`.

### 3.2 Vertex colours (colour attributes -> `COLOR_0`)

```python
ca = me.color_attributes.new("Color", 'FLOAT_COLOR', 'CORNER')    # or 'BYTE_COLOR'; 'POINT' domain also exports
for d in ca.data: d.color = (0.5, 0.25, 0.1, 1.0)                 # .color is LINEAR. (.color_srgb reads 0.735, 0.537, 0.349)
me.color_attributes.active_color = ca
me.color_attributes.render_color_index = me.color_attributes.find("Color")
```

Export settings and what came out (`dump-attr.mjs`):

| Settings | Result |
|---|---|
| `export_vertex_color='ACTIVE', export_all_vertex_colors=False` (**use this**) | `COLOR_0` = the render colour attribute, VEC4 u16-normalised, **linear** values (0.5, 0.25, 0.1 came back exactly), with or without a material |
| `='NAME', export_vertex_color_name='Color', all=False` | same, picked by name |
| default (`'MATERIAL'`, `all=True`), material uses a Color Attribute node | `COLOR_0` VEC3 float |
| default, material does **not** use the attribute | a **fake white `COLOR_0`** (u8) plus your data as `COLOR_1` — three reads the fake one |
| `'NONE'` | no colours |

three side (read in `GLTFLoader.js`): `COLOR_0` -> geometry attribute `color`; the loader clones the material and sets
`vertexColors = true`; values are treated as linear and multiply the base colour. Verified: all four test meshes loaded
with `attributes.color` and `material.vertexColors === true`.

Helper material whose Blender preview matches the export (`artlib.vcol_material`): Color Attribute node -> Base Color
(optionally `Mix(MULTIPLY)` with an image). Exported as `baseColorFactor = 1` + `COLOR_0`.

After `optimize-glb.mjs`, `COLOR_0` becomes VEC3 **u8** normalised. That is 8-bit *linear*, which bands in dark
gradients **(banding not measured)**; pass `quantizeColor: 12` or more to `meshopt()` if vertex colours carry lighting.

---

## 4. Tileable procedural textures baked to images (and the GPU verdict)

Script: `exp05_texbake.py`. Renders: `shots/research-blender/exp05_cpu_512_*_tiled2x2.png`.

### 4.1 Making procedural noise tile

Feed 4D noise with UVs mapped onto a torus. Brick / Wave / Checker textures tile on their own when their repeat counts are integers in UV space.

```python
def torus_coords(nt, scale=1.0, scale_v=None):
    """UV (0..1) -> 4D point on a Clifford torus. Returns (vector_socket, w_socket). 4D noise fed with these tiles exactly.
    scale / scale_v = feature count per tile along U / V (different values = stretched grain)."""
    N = nt.nodes; L = nt.links
    tc = N.new("ShaderNodeTexCoord")
    sep = N.new("ShaderNodeSeparateXYZ"); L.new(tc.outputs["UV"], sep.inputs[0])
    def trig(src, fn, sc):
        m = N.new("ShaderNodeMath"); m.operation = 'MULTIPLY'; m.inputs[1].default_value = 2 * math.pi; L.new(src, m.inputs[0])
        t = N.new("ShaderNodeMath"); t.operation = fn; L.new(m.outputs[0], t.inputs[0])
        k = N.new("ShaderNodeMath"); k.operation = 'MULTIPLY'; k.inputs[1].default_value = sc / (2 * math.pi); L.new(t.outputs[0], k.inputs[0])
        return k.outputs[0]
    su = scale; sv = scale if scale_v is None else scale_v
    comb = N.new("ShaderNodeCombineXYZ")
    L.new(trig(sep.outputs["X"], 'COSINE', su), comb.inputs["X"])
    L.new(trig(sep.outputs["X"], 'SINE', su), comb.inputs["Y"])
    L.new(trig(sep.outputs["Y"], 'COSINE', sv), comb.inputs["Z"])
    return comb.outputs[0], trig(sep.outputs["Y"], 'SINE', sv)

vec, w = torus_coords(nt, scale=3.0, scale_v=40.0)
n = nt.nodes.new("ShaderNodeTexNoise"); n.noise_dimensions = '4D'
nt.links.new(vec, n.inputs["Vector"]); nt.links.new(w, n.inputs["W"])
```

Measured seam error (mean abs difference between the wrap-around columns/rows vs. neighbouring interior ones): roughness 0.0009 vs 0.0010, normal 0.0012 vs 0.0014 — the seam is as smooth as the interior. The 2×2 tiled previews show no seam.

### 4.2 Baking albedo / roughness / normal

Bake on a 1×1 m plane whose UVs are 0..1 (remember the UV-layer trap):

```python
bm = bmesh.new(); bm.loops.layers.uv.new("UVMap")
bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5, calc_uvs=True)

def bake_target(mat, name, size, colorspace):
    img = bpy.data.images.new(name, size, size, alpha=False, float_buffer=False)
    img.colorspace_settings.name = colorspace                       # 'sRGB' for albedo, 'Non-Color' for data
    n = mat.node_tree.nodes.new("ShaderNodeTexImage"); n.image = img
    for x in mat.node_tree.nodes: x.select = False
    n.select = True; mat.node_tree.nodes.active = n                 # the bake writes into the ACTIVE image node
    return img, n

def bake_socket_as_emit(ob, mat, socket_name, img_name, size, colorspace, samples=4):
    """Bake whatever feeds Principled.<socket_name> by routing it through an Emission shader.
    Works for any channel and for metals (a DIFFUSE/COLOR bake of a metal is black)."""
    nt = mat.node_tree; N = nt.nodes; L = nt.links
    bsdf = N["Principled BSDF"]; outn = next(n for n in N if n.type == 'OUTPUT_MATERIAL')
    orig = outn.inputs["Surface"].links[0].from_socket
    em = N.new("ShaderNodeEmission")
    sock = bsdf.inputs[socket_name]
    if sock.is_linked: L.new(sock.links[0].from_socket, em.inputs["Color"])
    else:
        v = sock.default_value
        em.inputs["Color"].default_value = (v, v, v, 1) if isinstance(v, float) else v
    L.new(em.outputs[0], outn.inputs["Surface"])
    img, node = bake_target(mat, img_name, size, colorspace)
    bpy.context.scene.cycles.samples = samples
    select_only(ob)
    r = bpy.ops.object.bake(type='EMIT', margin=0, use_clear=True)  # margin 0: a tile must not be dilated
    L.new(orig, outn.inputs["Surface"]); N.remove(em); N.remove(node)
    if r != {'FINISHED'}: raise RuntimeError(f"bake {socket_name} failed: {r}")
    return img

def bake_normal(ob, mat, img_name, size, samples=4):                # Bump/Normal nodes -> tangent-space normal map
    img, node = bake_target(mat, img_name, size, 'Non-Color')
    bpy.context.scene.cycles.samples = samples
    select_only(ob)
    r = bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', margin=0, use_clear=True)
    mat.node_tree.nodes.remove(node)
    if r != {'FINISHED'}: raise RuntimeError(f"normal bake failed: {r}")
    return img

def save_png(img, path):
    img.filepath_raw = path; img.file_format = 'PNG'; img.save()    # writes the pixels as stored; no view transform
```

Bump tips from the run: use the Brick texture's `Mortar Smooth` (0.6) so grooves get a slope wider than one texel, and a
Bump `Distance` around 0.01 with `Strength` 1.0; with a hard mortar edge the normal map came out visually flat. The default
normal bake is +Y-up (OpenGL), which is what glTF/three expect (grooves light correctly in the three render).

Bake failures seen (`exp17`): no material -> raises "No active image found"; material without an image node -> returns
`{'CANCELLED'}` **without raising**; engine not Cycles -> raises "Current render engine does not support baking".

### 4.3 Timings (plank material, 4 spp, one 1 m plane)

| Size | CPU albedo / rough / normal | CUDA albedo / rough / normal | Whole process CPU | Whole process CUDA | PNG sizes (albedo / rough / normal) |
|---|---|---|---|---|---|
| 512 | 0.08 / 0.06 / 0.12 s | 0.39 / 0.30 / 0.30 s | 0.7 s | 1.5 s | 150 / 109 / 374 kB |
| 1024 | 0.21 / 0.21 / 0.50 s | 0.43 / 0.40 / 0.41 s | 1.4 s | 1.8 s | ~413 / 358 / 693 kB |
| 2048 | 0.72 / 0.67 / 1.79 s | 0.86 / 0.73 / 0.87 s | 4.0 s | 3.4 s | ~1.0 / 1.0 / 1.8 MB |

(File sizes for 1024 and 2048 are from an earlier, less detailed version of the material; expect somewhat more.)

Texture-set bakes are effectively free; use CPU unless the size is 2048.
A 512 set shrank from 656 kB to 51 kB in the GLB after WebP (q85) in `optimize-glb.mjs --webp`. GPU memory is unchanged
by WebP: a 512² RGBA8 texture with mips is 1.33 MB, 1024² is 5.3 MB, 2048² is 21 MB — three textures per material, so
budget accordingly (Low tier total is 64 MB).

### 4.4 GPU verdict

```python
def use_cycles(device='CPU', samples=64, denoise=True):
    """device: 'CPU' | 'CUDA'. Returns the device actually selected (falls back to CPU)."""
    s = bpy.context.scene
    s.render.engine = 'CYCLES'
    c = s.cycles; c.samples = samples; c.use_adaptive_sampling = True; c.use_denoising = denoise
    if device == 'CPU':
        c.device = 'CPU'; return 'CPU'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = device
    prefs.get_devices()
    found = False
    for d in prefs.devices:
        d.use = (d.type == device); found = found or d.use
    if not found:
        c.device = 'CPU'; return 'CPU'
    c.device = 'GPU'
    return device
```

- **CUDA: works headless** for both F12 renders and bakes. No kernel compile wait was observed (first render 9.2 s including ~3 s kernel load, later ones 4.2 s).
- **OptiX: does not work.** `get_devices_for_type('OPTIX')` is empty; `--debug-cycles` logs `OptiX initialization failed with error code 7804` (library not found). Pointing `LD_LIBRARY_PATH` at the WSL driver store changes it to 7805 (entry symbol not found). Asking for OPTIX with the function above falls back to CPU, so always check the returned value.
- CUDA and CPU produce the same image (bake RMSE vs. reference identical to 4 digits).

| Job | CPU | CUDA | Speed-up |
|---|---|---|---|
| F12 render 1280×720, 128 spp + OIDN (test room) | 30 s | 4.2 s | 7× |
| Lightmap 1024², 256 spp, room joined to one mesh | 45.9 s | 4.7 s | 10× |
| Lightmap 1024², 64 spp, 10 separate objects | 13.3 s | 5.1 s | 2.6× |
| Lightmap 512², 16 spp, 10 objects | 0.8 s | 2.9 s | **CPU wins** |
| Texture tile 512² (3 maps) | 0.26 s | 1.0 s | **CPU wins** |
| Vertex-colour light bake, 5k tris, 64 spp | 0.21 s | 2.4 s | **CPU wins** |

CUDA has a fixed cost of roughly 2.5 s per process plus ~0.3 s per baked object (scene re-upload). Rule: **CUDA for
lightmaps ≥ 1024² or ≥ 64 spp and for Cycles beauty renders; CPU for texture tiles, vertex bakes and tiny previews.**
All timings in this document come from `time.perf_counter()` inside Blender. Do not time jobs with `date` or `time` from the
shell here: the WSL wall clock gets stepped while jobs run (shell timings were off by up to 2 s on 30 s jobs and once came out negative).

---

## 5. Lightmap baking

Scripts: `exp06_uv2.py`, `exp06_bake.py`, `exp06d_variants.py`, `exp06e_vertexbake.py`, `exp07_lightmap_export.py`,
library `lightmap.py`. three.js proof: `shots/research-blender/exp07_three_standard.png` next to the Cycles reference
`exp07_cycles_ref.png` — they match in brightness, colour bleed and shadow shape with **no lights in the three scene**
(11 draw calls, 528 triangles).

Test scene ("room-sized"): 8 × 6 × 3 m room, door and window cut by booleans, 2 crates, table with 4 legs, pillar, emissive
strip; sun through the window + warm point light + sky. 10 objects, 528 triangles, 194 m² of lightmapped surface.

### 5.1 Second UV set

```python
def unwrap_lightmap(objs, uv_name="UVLight", margin_px=4, res=1024, angle=66):
    """One shared atlas for all objs. UV0 stays layer 0; the lightmap layer becomes ACTIVE (operators and bakes use the active layer)."""
    for o in objs:
        if len(o.data.uv_layers) == 0:
            o.data.uv_layers.new(name="UVMap")           # keep slot 0 for material UVs => lightmap is TEXCOORD_1
        if uv_name not in o.data.uv_layers: o.data.uv_layers.new(name=uv_name)
        o.data.uv_layers.active = o.data.uv_layers[uv_name]
    deselect_all()
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode='EDIT')                 # multi-object edit mode: all selected meshes
    bpy.ops.mesh.select_all(action='SELECT')
    r = bpy.ops.uv.smart_project(angle_limit=math.radians(angle), margin_method='FRACTION', island_margin=margin_px / res,
                                 rotate_method='AXIS_ALIGNED', area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    if r != {'FINISHED'}: raise RuntimeError(f"smart_project failed: {r}")
```

Verified facts:

- `smart_project` on several objects in one edit session packs **all of them into one 0..1 atlas at uniform texel density**
  (per-object density 42.5–42.8 texels/m in the test). 71–81% coverage. 0.01 s.
- `bpy.ops.uv.lightmap_pack(PREF_CONTEXT='ALL_FACES', PREF_PACK_IN_ONE=True, PREF_NEW_UVLAYER=False, PREF_BOX_DIV=24, PREF_MARGIN_DIV=0.3)`
  works from object mode and gives one island per face: fine for boxy architecture, bad for bevelled props (hundreds of tiny islands).
- `bpy.ops.uv.pack_islands(...)` returns `{'CANCELLED'}` unless UVs are selected: call `bpy.ops.uv.select_all(action='SELECT')` first.
  It then works headless without any context override.
- `bpy.ops.uv.cube_project(cube_size=2.0, correct_aspect=True, scale_to_bounds=False)` gives metric, tileable UV0 for architecture.
- `bpy.ops.uv.export_layout(mode='PNG')` **fails headless** ("GPU functions for drawing are not available in background mode"). Look at the baked lightmap instead.
- Export order follows layer order: `[UVMap, UVLight]` -> `TEXCOORD_0`, `TEXCOORD_1`. A mesh whose first layer was the lightmap
  layer exported it as `TEXCOORD_0` even though the other layer had `active_render = True` (`exp14`).

Texel density: `texels_per_metre = sqrt(coverage * res² / area)`. With ~70% coverage:

| Atlas | 16 texels/m | 32 texels/m | GPU memory (RGBA8, no mips) |
|---|---|---|---|
| 512² | 717 m² | 179 m² | 1 MB |
| 1024² | 2 870 m² | 717 m² | 4 MB |
| 2048² | 11 470 m² | 2 870 m² | 16 MB |

Quality seen in three for the room: 31 texels/m (512²) is indistinguishable from 62 texels/m (1024²) at eye height;
15.5 texels/m (256²) keeps soft light correct but blurs the sun-patch edge and breaks on thin parts (the 8 cm table
legs went black — their islands are ~1 texel wide). **Use ~32 texels/m indoors, ~16 for large soft-lit exteriors, and do
not lightmap anything thinner than ~3 texels: give those vertex colours instead.**

Margins: island margin ≥ 2× the bake margin; the tests used island margin 8 px + bake margin 4 px at 1024² (2 + 2 at 256²)
with mipmaps off and saw no bleeding.

### 5.2 Baking

```python
class BakeTarget:
    """Adds an (active, selected) Image Texture node holding `img` to every material of objs; removes them on exit."""
    def __init__(self, objs, img): self.objs = objs; self.img = img; self.nodes = []
    def __enter__(self):
        seen = set()
        for o in self.objs:
            for slot in o.material_slots:
                m = slot.material
                if m is None or m.name in seen: continue
                seen.add(m.name)
                if not m.use_nodes: m.use_nodes = True
                nt = m.node_tree
                n = nt.nodes.new("ShaderNodeTexImage"); n.image = self.img
                for x in nt.nodes: x.select = False
                n.select = True; nt.nodes.active = n
                self.nodes.append((nt, n))
        return self
    def __exit__(self, *a):
        for nt, n in self.nodes: nt.nodes.remove(n)

class NonMetal:
    """Diffuse bakes return black for metallic=1 surfaces. Temporarily force Metallic to 0 for the bake."""
    def __init__(self, objs): self.objs = objs; self.saved = []
    def __enter__(self):
        seen = set()
        for o in self.objs:
            for slot in o.material_slots:
                m = slot.material
                if m is None or m.name in seen or not m.use_nodes: continue
                seen.add(m.name)
                for n in m.node_tree.nodes:
                    if n.type == 'BSDF_PRINCIPLED':
                        sock = n.inputs["Metallic"]
                        src = sock.links[0].from_socket if sock.is_linked else None
                        if src: m.node_tree.links.remove(sock.links[0])
                        self.saved.append((m.node_tree, sock, sock.default_value, src))
                        sock.default_value = 0.0
        return self
    def __exit__(self, *a):
        for nt, sock, val, src in self.saved:
            sock.default_value = val
            if src: nt.links.new(src, sock)

def bake_lightmap(objs, img, uv_name="UVLight", samples=64, margin_px=4, direct=True, indirect=True, clear=True):
    s = bpy.context.scene
    s.cycles.samples = samples
    b = s.render.bake
    b.target = 'IMAGE_TEXTURES'; b.use_selected_to_active = False
    b.margin = margin_px; b.margin_type = 'EXTEND'; b.use_clear = clear
    b.use_pass_direct = direct; b.use_pass_indirect = indirect; b.use_pass_color = False   # light only, no albedo
    deselect_all()
    for o in objs:
        o.select_set(True)
        o.data.uv_layers.active = o.data.uv_layers[uv_name]
    bpy.context.view_layer.objects.active = objs[0]
    with BakeTarget(objs, img), NonMetal(objs):
        t = time.perf_counter()
        r = bpy.ops.object.bake(type='DIFFUSE')
        dt = time.perf_counter() - t
    if r != {'FINISHED'}: raise RuntimeError(f"lightmap bake failed: {r}")
    for o in objs: o.data.uv_layers.active = o.data.uv_layers[0]
    return dt

img = bpy.data.images.new("LM_zone", res, res, alpha=True, float_buffer=True)   # float: values exceed 1 (5.8 next to the lamp)
```

One `bake` call with several objects selected writes all of them into the same image (cleared once). Every material on every
object needs the image node, hence `BakeTarget`. The alpha channel of the result is the coverage mask (78% in the test).

Verified behaviours (`exp06d`):

| Question | Answer |
|---|---|
| Does `scene.cycles.use_denoising` denoise a bake? | **No.** RMSE identical on/off (0.0806). |
| Does adaptive sampling change a bake? | No (same time, same RMSE). |
| Metallic = 1 surface, DIFFUSE bake | mean 0.0000 without `NonMetal`, 0.0905 with it |
| Emissive mesh | lights the bake (lamp strip glow on the wall) |
| `type='AO'` to an image, 1024², 64 spp | 4.0 s CUDA / 6.0 s CPU; distance is `world.light_settings.distance` (default 10 m — set ~1–1.5) |
| `type='COMBINED'` | works (4.7 s CUDA / 13.4 s CPU); bakes albedo × light, so resolution-bound and view-dependent parts are frozen. Not recommended. |

### 5.3 Denoising and saving

```python
def denoise_image_compositor(img, out_path_exr):
    """Run OIDN on an image through the compositor. Returns a new float image datablock."""
    s = bpy.data.scenes.new("DenoiseScene")
    s.render.resolution_x, s.render.resolution_y = img.size; s.render.resolution_percentage = 100
    s.use_nodes = True
    nt = s.node_tree
    for n in list(nt.nodes): nt.nodes.remove(n)
    i = nt.nodes.new("CompositorNodeImage"); i.image = img
    d = nt.nodes.new("CompositorNodeDenoise"); d.use_hdr = True; d.prefilter = 'NONE'
    c = nt.nodes.new("CompositorNodeComposite")
    nt.links.new(i.outputs["Image"], d.inputs["Image"]); nt.links.new(d.outputs["Image"], c.inputs["Image"])
    s.render.image_settings.file_format = 'OPEN_EXR'; s.render.image_settings.color_depth = '32'
    s.render.image_settings.color_mode = 'RGB'
    s.render.filepath = out_path_exr
    s.view_settings.view_transform = 'Standard'
    win = bpy.context.window; old = win.scene
    win.scene = s
    bpy.ops.render.render(write_still=True, scene=s.name)      # no camera needed: the tree has no Render Layers node
    win.scene = old
    bpy.data.scenes.remove(s)
    return bpy.data.images.load(out_path_exr)

def srgb_oetf(x):
    x = np.clip(x, 0.0, 1.0)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)

def save_lightmap_png(img, path, scale=1.0):
    """Float linear lightmap -> 8-bit sRGB PNG holding (value / scale).
    three: colorSpace = SRGBColorSpace, lightMapIntensity = PI * scale."""
    w, h = img.size
    a = np.empty(w * h * 4, dtype=np.float32); img.pixels.foreach_get(a); a = a.reshape(h, w, 4).copy()
    a[:, :, :3] = srgb_oetf(a[:, :, :3] / scale); a[:, :, 3] = 1.0
    o = bpy.data.images.new("lm_out", w, h, alpha=False, float_buffer=False)
    o.colorspace_settings.name = 'sRGB'
    o.pixels.foreach_set(a.ravel())
    o.filepath_raw = path; o.file_format = 'PNG'; o.save()
    bpy.data.images.remove(o)
```

Compositor OIDN cost: 0.06 s at 512², 0.2 s at 1024², 0.6–1.2 s at 2048². Before/after:
`shots/research-blender/exp06_lm_cuda_512_16.png` vs `..._16_dn.png`. The bake margin keeps the black background from
bleeding into islands during denoising.

Why `scale`: baked values go above 1 (sun patch ≈ 1, wall next to the lamp strip 5.8). Storing `value / 4` sRGB-encoded in
8 bits keeps dark precision and gives headroom up to 4.0; brighter texels clip (only the 20 cm around the lamp did).

### 5.4 Timings and sample guidance (room scene)

Bake only (`bpy.ops.object.bake`), 10 separate objects:

| Atlas (texels/m) | spp | CPU | CUDA | RMSE vs 1024-spp reference |
|---|---|---|---|---|
| 512² (31) | 16 | 0.8 s | 2.9 s | 0.081 |
| 512² | 64 | 2.4 s | 3.0 s | 0.039 |
| 512² | 256 | 9.8 s | 4.4 s | 0.023 |
| 1024² (62) | 16 | 4.1 s | 4.0 s | 0.081 |
| 1024² | 64 | 13.3 s | 5.1 s | 0.039 |
| 1024² | 256 | 47.8 s | 9.0 s | 0.023 |
| 1024² | 1024 | — | 19.0 s | reference |
| 2048² (124) | 16 | 18.2 s | 8.8 s | 0.080 |
| 2048² | 64 | 57.4 s | 12.5 s | 0.038 |
| 2048² | 256 | not run | 27.0 s | 0.023 |
| 2048² | 1024 | — | 61.7 s | reference |

Same room joined into **one** object, 1024²: CUDA 0.65 / 1.4 / 4.7 s and CPU 3.2 / 11.9 / 45.9 s for 16 / 64 / 256 spp.

- **16 spp + OIDN has RMSE 0.020–0.026, the same as 256 spp raw.** (The 0.023 floor is mostly the reference's own noise.)
- Recommended production setting: **64 spp + OIDN, CUDA, ~32 texels/m.** Whole pipeline for the room (unwrap + bake +
  denoise + PNG) measured end to end: **2.8 s at 256², 3.2 s at 512², 5.4 s at 1024²** on CUDA.
- GPU pays ~0.3 s per baked object. Join static geometry per zone (or per zone and material) before baking; that also cuts draw calls.

### 5.5 Export and three.js wiring

glTF has no lightmap slot. What was verified end to end:

1. Blender: lightmap UVs as layer 1, lightmap written as a separate PNG, and two custom properties on each object.
2. Export with `export_extras=True` -> `TEXCOORD_1` plus `extras: {lightmap, lightmapScale}`.
3. Runtime: load the PNG, set channel 1, clone materials per (material, lightmap).

```python
for o in objs:
    o["lightmap"] = "interior_a"; o["lightmapScale"] = 4.0     # -> node.extras -> Object3D.userData
```

```js
// verified in docs/research/blender-pipeline-code/web/lightmap.html (three r186, WebGL2)
const lmCache = new Map(), matCache = new Map();
async function getLightmap(name) {
  if (!lmCache.has(name)) {
    const t = await new THREE.TextureLoader().loadAsync(`${dir}/${name}.png`);
    t.flipY = false;                         // glTF UV convention (GLTFLoader does the same for its own textures)
    t.colorSpace = THREE.SRGBColorSpace;     // our PNG is sRGB-encoded (value / scale)
    t.channel = 1;                           // sample with geometry attribute `uv1` (= TEXCOORD_1)
    t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    lmCache.set(name, t);
  }
  return lmCache.get(name);
}
gltf.scene.traverse(o => {
  if (!o.isMesh) return;
  const src = o.userData.lightmap ? o : o.parent;   // a multi-material mesh loads as Group + child meshes; extras sit on the Group
  const name = src.userData.lightmap; if (!name) return;
  jobs.push((async () => {
    const tex = await getLightmap(name);
    const key = o.material.uuid + '|' + name;
    let m = matCache.get(key);
    if (!m) {
      m = o.material.clone();
      m.lightMap = tex;
      m.lightMapIntensity = Math.PI * src.userData.lightmapScale;   // Cycles diffuse bake = E/PI; three wants irradiance E
      matCache.set(key, m);
    }
    o.material = m;
  })());
});
```

Why π: a Cycles DIFFUSE bake without the colour pass stores outgoing radiance / albedo = E/π. three's shaders
(`lights_fragment_maps.glsl.js`, `meshbasic.glsl.js`, read in `node_modules`) add `texel * lightMapIntensity` as irradiance and
multiply by `albedo/π` — for `MeshStandardMaterial`, `MeshLambertMaterial` **and** `MeshBasicMaterial`. So the intensity is
`π × scale` for all three. The visual match with the Cycles reference confirms it. `MeshBasicMaterial + lightMap` rendered
correctly too (`exp07_three_basic.png`) and is the cheapest shader for the Low tier.

Things the runtime owner must know:

- A metallic `MeshStandardMaterial` renders **black** under a lightmap alone (no diffuse; needs an environment map). In the
  test the iron pillar is black with Standard and fine with Basic. Either give metals an env map or author "metal" as
  roughness-painted dielectric.
- The lightmapped, meshopt-compressed GLB still renders identically (`final_three_lightmap_opt.png`) **provided the optimiser
  keeps unused attributes** (section 8.5).
- Greyscale AO can live inside the GLB: an image on `UVLight` -> "glTF Material Output" group `Occlusion` input exported as
  `occlusionTexture` with `texCoord: 1` (verified). Only the R channel survives, so this route cannot carry a colour lightmap.
- Linked duplicates share UVs, so instances cannot have individual lightmap texels. Lightmap unique static geometry;
  give instanced props vertex-colour AO.
- Light leaks: Cycles lights every face it can reach. Geometry that pokes outside the room (a floor slab extending under
  the walls) gets sky light on the outside part and the bilinear filter pulls it indoors **(reasoned, not measured — the
  test room was built with exact interior faces to avoid it)**. Delete unseen faces before unwrapping; it also saves texels
  (the shell with outer faces was 454 m², interior-only 179 m²).

### 5.6 Cheaper alternative: light and AO in vertex colours

```python
def tessellate_max_edge(ob, max_len, max_iter=8):
    """Split every edge longer than max_len (world units) so per-vertex lighting has enough samples."""
    bm = bmesh.new(); bm.from_mesh(ob.data)
    sc = ob.matrix_world.to_scale()
    for _ in range(max_iter):
        long_edges = [e for e in bm.edges if ((e.verts[0].co - e.verts[1].co) * sc).length > max_len]
        if not long_edges: break
        bmesh.ops.subdivide_edges(bm, edges=long_edges, cuts=1)
        bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4], quad_method='BEAUTY', ngon_method='BEAUTY')
    bmesh.ops.triangulate(bm, faces=bm.faces[:], quad_method='BEAUTY', ngon_method='BEAUTY')
    bm.to_mesh(ob.data); bm.free()

def bake_vertex_light(objs, attr="Color", samples=64, kind='DIFFUSE'):       # kind: 'DIFFUSE' or 'AO'
    s = bpy.context.scene
    s.cycles.samples = samples
    b = s.render.bake
    b.target = 'VERTEX_COLORS'
    b.use_pass_direct = True; b.use_pass_indirect = True; b.use_pass_color = False
    deselect_all()
    for o in objs:
        ca = o.data.color_attributes.get(attr) or o.data.color_attributes.new(attr, 'FLOAT_COLOR', 'CORNER')
        o.data.color_attributes.active_color = ca          # the bake writes the ACTIVE colour attribute
        o.data.color_attributes.render_color_index = o.data.color_attributes.find(attr)
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    with NonMetal(objs):
        r = bpy.ops.object.bake(type=kind)
    b.target = 'IMAGE_TEXTURES'
    if r != {'FINISHED'}: raise RuntimeError(f"vertex bake failed: {r}")
```

Vertex bakes need no material and no UVs. Measured on the room:

| Max edge | Triangles | CPU 16 / 64 / 256 spp | CUDA | Look |
|---|---|---|---|---|
| 0.5 m | 528 -> 5 146 | 0.09 / 0.21 / 0.72 s | ~2.5 s | soft, painterly, sun patch jagged (`exp06e_vertexlit_0.5.png`) |
| 0.25 m | 528 -> 19 076 | not run | 2.5–3.2 s | clearly better shadows, still blotchy (`exp06e_vertexlit_0.25.png`) |

AO to vertex colours: 0.03–0.10 s on CPU for props. Each vertex is one noisy sample, so use ≥ 256 spp (still < 1 s) for
light. Baked values exceed 1 (max 3.5–7 here) but `COLOR_0` is exported normalised, so **divide by a scale before export
and multiply the material colour by the same scale in three (scaling step not verified in three)**.
Use this for props, terrain, enemies and anything instanced; use lightmaps for rooms and any surface that needs a readable
shadow edge.

---

## 6. Rigging by script

Scripts: `exp08_rig.py`, `exp09_anim2.py`, `exp09b_autow.py`; library `riglib.py`. Loaded and played in three:
`shots/research-blender/exp08_three_walk0.png`.

### 6.1 Armature

```python
def make_armature(name, bones, coll=None):
    """bones: list of (name, head, tail, parent_name|None[, roll]). Blender space, metres."""
    arm = bpy.data.armatures.new(name)
    ob = bpy.data.objects.new(name, arm)
    (coll or bpy.context.scene.collection).objects.link(ob)
    select_only(ob)
    bpy.ops.object.mode_set(mode='EDIT')                 # edit_bones only exist in edit mode
    for spec in bones:
        bname, head, tail, parent = spec[:4]
        eb = arm.edit_bones.new(bname)
        eb.head = head; eb.tail = tail
        if len(spec) > 4: eb.roll = spec[4]
        else: eb.align_roll(Vector((0, 0, 1)) if abs((Vector(tail) - Vector(head)).normalized().z) < 0.99 else Vector((0, -1, 0)))
        if parent:
            eb.parent = arm.edit_bones[parent]; eb.use_connect = False
    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in ob.pose.bones: pb.rotation_mode = 'QUATERNION'
    return ob
```

Bone-local axes: **Y runs along the bone** (head -> tail). A revolver cylinder bone laid along the barrel spins with a local
Y rotation; a hinge bone laid along the hinge does the same. Each bone becomes a glTF node (a three `Bone`) named after it,
with the rest pose in its TRS; the armature object becomes a parent node.

Naming: letters, digits, `_` only. No `.`, spaces, `[ ] : /` — three strips them (`arm.L` would become `armL`). Use
`arm_L`. Names must be unique across objects, meshes **and bones**: an object `head` parented to bone `head` loaded as
`head_1` in three (the original stays in `userData.name`).

### 6.2 Three ways to attach geometry

| Method | Result in three | Use for |
|---|---|---|
| **Rigid skin**: one joined mesh, each part weighted 1.0 to one bone | one `SkinnedMesh`, **1 draw call**, exact rigid motion | robots, mechanical enemies, the revolver (frame/cylinder/hammer/trigger), doors with several leaves |
| Smooth skin (manual falloff or automatic weights) | one `SkinnedMesh` | arms, cloth-like or organic parts |
| Object parented to a bone (no skin) | plain `Mesh` as child of the `Bone`, **1 draw call per part** | a part that must be shown/hidden/swapped alone |

The robot test: rigid skin = 1 call; bone-parented parts = 4 calls for the same 48 triangles.

```python
def bind(mesh_ob, arm_ob):
    mesh_ob.parent = arm_ob
    mesh_ob.matrix_parent_inverse = arm_ob.matrix_world.inverted()
    mod = mesh_ob.modifiers.new("Armature", 'ARMATURE'); mod.object = arm_ob

def join_as_rigid_skin(parts, arm_ob, name):
    """parts: {bone_name: [objects]}. Joins everything; each source object's vertices get weight 1.0 to its bone."""
    tagged = []
    for bone, obs in parts.items():
        for o in obs:
            vg = o.vertex_groups.new(name=bone)                    # vertex group name == bone name
            vg.add(range(len(o.data.vertices)), 1.0, 'REPLACE')
            tagged.append(o)
    deselect_all()
    for o in tagged: o.select_set(True)
    bpy.context.view_layer.objects.active = tagged[0]
    bpy.ops.object.join()                                          # vertex groups merge by name
    ob = tagged[0]; ob.name = name; ob.data.name = name
    bind(ob, arm_ob)
    return ob

def parent_to_bone(ob, arm_ob, bone_name):
    """Rigid attach WITHOUT skinning. Keeps the object's world transform. Bone-parent space sits at the bone TAIL."""
    mw = ob.matrix_world.copy()
    ob.parent = arm_ob; ob.parent_type = 'BONE'; ob.parent_bone = bone_name
    bpy.context.view_layer.update()
    bone = arm_ob.pose.bones[bone_name]
    parent_m = arm_ob.matrix_world @ bone.matrix @ Matrix.Translation((0, bone.length, 0))
    ob.matrix_parent_inverse = parent_m.inverted()
    ob.matrix_world = mw
```

Model each part in its final world position (object origin anywhere), then join. Export of the rigid skin:
`JOINTS_0` VEC4 u8, `WEIGHTS_0` VEC4 float, skin with the 5 joints; export with `export_apply=False` or `True` both keep
the armature (the Armature modifier is never applied by the exporter).

Manual smooth weights (verified, bend zone between two bones):

```python
up = ob.vertex_groups.new(name="upper"); low = ob.vertex_groups.new(name="lower")
for v in ob.data.vertices:
    t = min(1.0, max(0.0, (v.co.z - 0.35) / 0.3)); t = t * t * (3 - 2 * t)     # blend zone z = 0.35..0.65
    if t < 1: up.add([v.index], 1 - t, 'REPLACE')
    if t > 0: low.add([v.index], t, 'REPLACE')
```

Automatic weights headless:

```python
def auto_weights(mesh_ob, arm_ob):
    """Bone-heat automatic weights (works headless). Raises if any vertex ended up unweighted."""
    deselect_all()
    mesh_ob.select_set(True); arm_ob.select_set(True); bpy.context.view_layer.objects.active = arm_ob
    r = bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    if r != {'FINISHED'}: raise RuntimeError(f"auto weights -> {r}")
    if not all(len(v.groups) > 0 for v in mesh_ob.data.vertices):
        raise RuntimeError("bone heat failed: unweighted vertices")
```

It returned `FINISHED` and sensible weights on a closed tube (sums 0.985–1.0, 50/50 at the joint) and on a mesh made of
three separate/interpenetrating shells. Bone heat is known to fail silently on some non-manifold meshes **(failure not
reproduced here)** — keep the check. For mechanical things prefer rigid skin: it is exact and needs no solver.

Exporter options: `export_def_bones=True` + `export_armature_object_remove=True` removed the armature node and kept the
hierarchy (root bone at top level). `export_influence_nb=4` is the default and what three supports.

---

## 7. Animation by script

### 7.1 Actions and slots in 4.5

4.4+ actions are *layered* with *slots*. What happens (printed in `exp08`): assigning an action and calling
`keyframe_insert` creates one layer, one keyframe strip and one slot named after the object (identifier `OB<ObjectName>`),
and binds it. `action.is_action_layered` is True, `is_action_legacy` False.

```python
def new_action(arm_ob, name):
    if arm_ob.animation_data is None: arm_ob.animation_data_create()
    act = bpy.data.actions.new(name)
    act.use_fake_user = True                               # otherwise unassigned actions are dropped when the .blend is saved
    arm_ob.animation_data.action = act                     # slot is auto-created by the first keyframe_insert
    return act

def reset_pose(arm_ob):
    for pb in arm_ob.pose.bones:
        pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.scale = (1, 1, 1)

def key_pose(arm_ob, frame, pose):
    """pose: {bone: {'loc': (x,y,z), 'rot': (rx,ry,rz) radians in bone-local axes | Quaternion, 'scale': (..)}}"""
    for bname, ch in pose.items():
        pb = arm_ob.pose.bones[bname]
        if 'loc' in ch:
            pb.location = ch['loc']; pb.keyframe_insert("location", frame=frame)
        if 'rot' in ch:
            r = ch['rot']
            q = r if isinstance(r, Quaternion) else Euler(r, 'XYZ').to_quaternion()
            pb.rotation_quaternion = q; pb.keyframe_insert("rotation_quaternion", frame=frame)
        if 'scale' in ch:
            pb.scale = ch['scale']; pb.keyframe_insert("scale", frame=frame)

def action_fcurves(act):                                    # 4.4+ layered API
    out = []
    for layer in act.layers:
        for strip in layer.strips:
            for cb in strip.channelbags:
                out.extend(cb.fcurves)
    return out

def set_interpolation(act, interp='BEZIER'):
    for fc in action_fcurves(act):
        for kp in fc.keyframe_points: kp.interpolation = interp
        fc.update()

def fix_quaternion_flips(act):
    """Make consecutive quaternion keys take the short path (keyframe_insert does not do this for you)."""
    by_path = {}
    for fc in action_fcurves(act):
        if fc.data_path.endswith("rotation_quaternion"):
            by_path.setdefault(fc.data_path, [None] * 4)[fc.array_index] = fc
    for path, fcs in by_path.items():
        if any(f is None for f in fcs): continue
        prev = None
        for i in range(len(fcs[0].keyframe_points)):
            q = Quaternion([fcs[k].keyframe_points[i].co[1] for k in range(4)])
            if prev is not None and prev.dot(q) < 0:
                for k in range(4):
                    kp = fcs[k].keyframe_points[i]
                    kp.co[1] = -kp.co[1]; kp.handle_left[1] = -kp.handle_left[1]; kp.handle_right[1] = -kp.handle_right[1]
                q = -q
            prev = q
        for f in fcs: f.update()
```

`fix_quaternion_flips` matters: two keys for the same 50° rotation with opposite quaternion sign exported a midpoint of
155° (long way round); after the fix the midpoint is 25° (`exp16`).

Creating curves without `keyframe_insert` (one Action driving several objects, verified in `exp09 slots`):

```python
act = bpy.data.actions.new("Open"); act.use_fake_user = True
layer = act.layers.new("Layer"); strip = layer.strips.new(type='KEYFRAME')
for o, sign in ((door_l, -1), (door_r, 1)):
    o.rotation_mode = 'XYZ'
    slot = act.slots.new(id_type='OBJECT', name=o.name)
    cb = strip.channelbag(slot, ensure=True)
    fc = cb.fcurves.new("rotation_euler", index=2)
    fc.keyframe_points.add(2)
    fc.keyframe_points[0].co = (0, 0.0); fc.keyframe_points[1].co = (30, sign * math.radians(100))
    for kp in fc.keyframe_points: kp.interpolation = 'BEZIER'; kp.handle_left_type = kp.handle_right_type = 'AUTO_CLAMPED'
    fc.update()
    o.animation_data_create(); o.animation_data.action = act; o.animation_data.action_slot = slot
```

For bones the data path is `'pose.bones["name"].rotation_quaternion'` and the slot `id_type` is `'OBJECT'` (the armature object).
The legacy `action.fcurves.new(...)` still works in 4.5 but creates a slot called "Legacy Slot" (`XXLegacy Slot`) that is
not bound to anything — do not use it.

### 7.2 What each export mode produced

One armature, three actions (Idle 0–60, Walk 0–30, Fire 0–12 at 30 fps); `Fire` was the active action.

| `export_animation_mode` | glTF animations |
|---|---|
| `'ACTIONS'` (default) | `Fire` 0.4 s, `Idle` 2 s, `Walk` 1 s — all actions, because the file has a **single** armature (`export_anim_single_armature=True`) |
| `'ACTIVE_ACTIONS'` | one animation named **"Animation"** (only the active action) |
| `'NLA_TRACKS'` after `push_to_nla` | `Idle`, `Walk`, `Fire` — names from the **track** names, in track order |
| `'ACTIONS'`, **two armatures**, two actions each | **only the active action of each rig**; the others are silently dropped |
| `'NLA_TRACKS'`, two armatures, tracks named `Idle`/`Fire` on both | `Fire` and `Idle`, each driving **both** rigs (12 channels) |
| Two plain objects, one action each, `'ACTIONS'` | `DoorL_Open`, `DoorR_Open` (two clips) |
| Two plain objects, NLA track `Open` on both | one clip `Open` with both nodes |
| One slotted Action `Open` (2 slots) on two objects, `'ACTIONS'` | one clip `Open` with both nodes; with `export_merge_animation='NONE'` two clips both named `Open` |

**Recommendation: always push clips to NLA tracks and export `NLA_TRACKS`.** It behaves the same for one or many rigs,
clip names are explicit, and tracks with the same name on different objects merge into one clip (gun + arms firing together).

```python
def push_to_nla(arm_ob, actions):
    """One NLA track per action, track name = glTF clip name."""
    ad = arm_ob.animation_data
    ad.action = None
    for act in actions:
        tr = ad.nla_tracks.new(); tr.name = act.name
        st = tr.strips.new(act.name, int(act.frame_range[0]), act)   # the strip picked up the action's slot (OB<name>) by itself
        st.name = act.name
        if st.action_slot is None and act.slots: st.action_slot = act.slots[0]
        tr.mute = False
    return ad.nla_tracks

reset_pose(arm); push_to_nla(arm, actions)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', check_existing=False,
    export_animation_mode='NLA_TRACKS', export_force_sampling=True, export_frame_step=1,
    export_anim_slide_to_zero=True, export_optimize_animation_size=True)
```

Clip names and durations were verified with `inspect-glb.mjs` and again in three (`gltf.animations`: Idle 2 s, Walk 1 s,
Fire 0.4 s, 15 tracks each, `AnimationMixer` played them on the meshopt-compressed file).

### 7.3 Sampling, looping, timing

- Time = frame / `scene.render.fps`. Set fps 30 and key at integer frames: a 60-frame loop is exactly 2.0 s.
- `export_force_sampling=True` (default) samples every frame, bakes constraints (a Copy Rotation follower bone exported its
  motion, `exp13`) and emits LINEAR keys; channels that never change become 2-key STEP tracks. Every clip contains T/R/S
  for **every** bone (15 channels for 5 bones), so clips fully overwrite each other when cross-faded.
- `export_force_sampling=False` is a trap: a 0° -> 360° Euler spin exported as 2 identical keys (**no motion**), Bezier curves
  became CUBICSPLINE. Keep sampling on. With sampling the same spin exports correctly (mid key = 180°).
- `export_frame_step=2` halves the keys (31 -> 16) at 15 Hz; fine for slow idles, three interpolates.
- An action keyed on frames 10–40 exports as 0.333–1.333 s unless `export_anim_slide_to_zero=True` (then 0–1 s). Start every
  action at frame 0 and set the flag anyway.
- Loops: key the same pose on the first and last frame. Verified: first key == last key for every channel, so `LoopRepeat`
  in three is seamless. Default Bezier keys ease in and out at the loop point, so place the loop point at a motion extreme
  (e.g. the end of an arm swing) or key a periodic function every 2–3 frames **(the ease-at-loop-point pause was not measured)**.
- Rotations of more than 180° between two keys must be Euler-keyed (`rotation_mode='XYZ'`, as in the spin test) or split into
  several quaternion keys; sampling then makes them safe. The exporter may flip quaternion sign between samples (seen in
  the Walk clip); three's slerp takes the short path, so playback is correct.
- `use_fake_user = True` on every action, or they vanish from the saved `.blend`.
- Object-level animation (no armature) exports as node TRS tracks the same way.

---

## 8. glTF export

### 8.1 Recommended call

All parameters below exist in 4.5.51 (full list with defaults dumped by `exp03_props.py` into
`scratch/research-blender/out/gltf_props.txt`). This exact dictionary is `exportlib.EXPORT_DEFAULTS` and is what the
regression test exports with; pass `export_animation_mode='NLA_TRACKS'` for animated assets (section 7).

```python
EXPORT_DEFAULTS = dict(
    export_format='GLB', check_existing=False,
    export_yup=True,                      # Blender +Z up -> glTF +Y up
    export_apply=True,                    # apply modifiers (never the Armature); disables shape-key export
    export_texcoords=True, export_normals=True, export_tangents=False,
    export_materials='EXPORT', export_image_format='AUTO',
    export_vertex_color='ACTIVE', export_all_vertex_colors=False, export_active_vertex_color_when_no_material=True,
    export_attributes=False,
    export_extras=True,                   # custom properties -> extras -> three userData
    export_cameras=False, export_lights=False,
    export_skins=True, export_def_bones=False, export_influence_nb=4, export_all_influences=False,
    export_morph=False,
    export_animations=True, export_animation_mode='ACTIONS', export_force_sampling=True, export_frame_step=1,
    export_anim_slide_to_zero=True, export_optimize_animation_size=True, export_anim_single_armature=True,
    export_reset_pose_bones=True, export_rest_position_armature=True, export_current_frame=False,
    export_nla_strips=True, export_bake_animation=False,
    export_draco_mesh_compression_enable=False,   # meshopt is applied later by a node script; keep exporter output uncompressed
    export_gpu_instances=False, export_shared_accessors=False,
    use_selection=False, use_visible=False, use_renderable=False, use_active_collection=False, use_active_scene=True,
)

def export_glb(path, **overrides):
    kw = dict(EXPORT_DEFAULTS); kw.update(overrides)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    r = bpy.ops.export_scene.gltf(filepath=path, **kw)
    if r != {'FINISHED'}: raise RuntimeError(f"glTF export failed: {r}")
    return path
```

Scope options that were exercised: `collection="Props"` (+ `use_active_scene=False`) exports only that collection;
`use_selection=True` exports the selected objects (children came along); `use_visible=True` drops objects with
`hide_viewport`; without it **hidden objects are exported**; `export_hierarchy_full_collections=True` adds one node per
collection (`Scene Collection` -> `Props` -> ...), which three sanitises to `Scene_Collection`.
`export_cameras=True` exports the scene camera with the correct orientation (used for the three/Cycles comparison).
Not exercised: `export_morph` (shape keys), `export_lights`, Draco, `export_bake_animation`, `export_pointer_animation`.

### 8.2 Axes and markers

Verified numerically: Blender `(2, −5, 0)` -> glTF/three `(2, 0, 5)`; `(4, 3, 0)` -> `(4, 0, −3)`; i.e. `(x, y, z) -> (x, z, −y)`.
A +90° rotation about Blender Z -> quaternion `(0, 0.7071, 0, 0.7071)` = +90° about three Y. Scale `(2, 1, 2.2)` -> `(2, 2.2, 1)`.

```python
def marker(name, loc, rot_z_deg=0.0, coll=None, **props):
    e = bpy.data.objects.new(name, None)                   # an Empty: exports as a node without mesh
    e.empty_display_type = 'ARROWS'; e.empty_display_size = 0.5
    e.location = loc; e.rotation_euler = (0, 0, math.radians(rot_z_deg))
    for k, v in props.items(): e[k] = v
    (coll or bpy.context.scene.collection).objects.link(e)
    return e

marker("MK_spawn_player", (2.0, -5.0, 0.0), 0, type="spawn")
marker("MK_enemy_01", (4.0, 3.0, 0.0), 90, type="enemy", archetype="husk")
```

Empties keep parent/child relations, keep their TRS through `optimize-glb.mjs` (with `keepLeaves`) and arrive in three as
`Object3D` with `userData`. An unrotated marker faces Blender −Y = three **+Z**.

### 8.3 Custom properties -> extras

`ob["key"] = value` with str, int, float, bool, list and nested dict all arrived intact in `node.extras`
(`{"kind":"prop","hp":25,"mass":12.5,"tags":["wood","breakable"],"drop":{"item":"ammo","count":6},"flag":true}`).
`mesh["k"]` -> `mesh.extras`, `material["k"]` -> `material.extras`. In three they are merged into `userData`
(node extras on the node's object; for a multi-material mesh that object is a `Group` and its primitives are child meshes
named `Name_1`, `Name_2` with empty `userData`).

### 8.4 Instancing and linked duplicates

```python
d = bpy.data.objects.new("Crate_07", crate.data)           # linked duplicate: same mesh datablock
d.location = (x, y, 0); d.rotation_euler = (0, 0, rz); coll.objects.link(d)
```

| Setup | GLB | three |
|---|---|---|
| 40 linked duplicates, **no modifiers on the objects**, `export_apply=True` | 1 mesh, 40 nodes (9.6 kB) | 40 `Mesh` objects sharing one geometry, **40 draw calls** |
| Linked duplicates that each carry a modifier, `export_apply=True` | **one mesh copy per object** (4 crates: 15.8 kB instead of 3.9 kB) | no sharing |
| Same 40, all parented to one Empty, `export_gpu_instances=True` | 1 node with `EXT_mesh_gpu_instancing` | (not loaded in three; same extension as the next row) |
| Plain 40-node file through `optimize-glb.mjs --instance` (gltf-transform `instance({min: 5})`) | 1 node, 40 instances | `InstancedMesh`, **1 draw call** (measured: 40 calls -> 1) |

Apply modifiers in the script *before* creating linked duplicates. Instancing by either route discards the per-instance
node names and extras, so only instance pure decoration.

### 8.5 Compression: exporter stays uncompressed, node does meshopt

Leave `export_draco_mesh_compression_enable=False` (three would need the Draco decoder; meshopt decodes faster and the
team already has `meshoptimizer`). Verified post-process (`blender-pipeline-code/optimize-glb.mjs`):

```js
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, instance, meshopt, textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(input);
// keepAttributes: TEXCOORD_1 (lightmap UVs) is not referenced by any glTF texture -> default prune() deletes it.
// keepLeaves: marker empties must survive.  keepExtras: don't merge things that differ only by extras.
const PRUNE = { keepAttributes: true, keepLeaves: true, keepExtras: true, keepSolidTextures: true };
await doc.transform(
  dedup(), prune(PRUNE),
  // instance({ min: 5 }),                                        // optional
  // textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 85 }),   // optional
  meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizeTexcoord: 14, cleanup: false }),  // cleanup:false = no second prune
);
await io.write(output, doc);
```

three side: `loader.setMeshoptDecoder(MeshoptDecoder)` from `three/addons/libs/meshopt_decoder.module.js` (verified; WebP
textures need nothing extra).

Measured: textured cubes 656 kB -> 51 kB (WebP); rigged robot 17.4 -> 14.9 kB; very small files grow slightly.
Two behaviours of this step that affect content and game code:

- With default `prune()` the lightmapped room lost `TEXCOORD_0/1` on every material without textures, and on the one material
  with an occlusion map the lightmap UVs were **renumbered** to `TEXCOORD_0`. With the options above both UV sets survive
  and the lightmapped render is unchanged.
- `quantize` (inside `meshopt`) stores positions as int16 and **changes mesh-node transforms**: `Crate` went from
  `t=(0,0,0) s=1` to `t=(0,0.4,0) s=0.4`; animated mesh nodes get an unnamed child node that holds the mesh instead;
  skinned meshes and empties are untouched. World-space geometry is identical. **Consequence: never read position/scale
  from a mesh node. Put an Empty at every gameplay pivot (or parent the mesh under an Empty) and read that.**
  UVs outside 0..1 are left as floats ("Skipping TEXCOORD_0; out of [0,1] range"), so tiling UVs are safe.

### 8.6 What three does with names

(`GLTFLoader.createUniqueName`, read in `node_modules` and observed.) Whitespace -> `_`; `[ ] . : /` removed; duplicates across
nodes **and meshes** get `_1`, `_2`. A single-material mesh node becomes one `Mesh` with the node's name. A multi-material
mesh becomes a `Group` with the node's name plus children `Name_1..n`. `userData.name` always holds the original name.

---

## 9. Preview renders for critics

Script: `blender-pipeline-code/preview.py` (argparse, standalone). It loads a `.glb` (imported into an empty scene) or a
`.blend`, fits a camera to the bounds of all meshes, renders N views and writes **one contact-sheet PNG**.

```
B=tools/blender.sh; P=docs/research/blender-pipeline-code/preview.py
$B -b --factory-startup --python-exit-code 1 -P $P -- in.glb out.png                          # 8-view Workbench turntable
$B ... -P $P -- in.glb out.png --engine CYCLES --views 4 --device CUDA --samples 32            # lit beauty views
$B ... -P $P -- in.blend out.png --color VERTEX --zoom 2                                       # show baked vertex colours
$B ... -P $P -- room.glb out.png --cull --elev 40                                              # dollhouse view into an interior
$B ... -P $P -- rig.blend out.png --action Walk --views 4 --wire                               # 4 frames of one action
$B ... -P $P -- room.glb out.png --engine CYCLES --cam=3.3,-2.6,1.65 --look=-1,1,1 --lens 18   # eye-level shot (Blender coords)
```

Options: `--views --cols --size --elev --zoom --color MATERIAL|TEXTURE|VERTEX --cull --wire --action --frames --cam --look --lens --engine --device --samples`.
Pass negative coordinates as `--look=-1,1,1` (argparse treats a leading `-` as a flag otherwise).

| Preview | Time |
|---|---|
| Workbench, 8 views × 480 px, 2.8k tris | 0.6 s render, 0.7 s total |
| Workbench, 4 views × 480 px, room GLB incl. import | 0.4 s render, 0.5 s total |
| Workbench, 4-frame action sheet | 0.35 s |
| Cycles 32 spp + OIDN, 8 views × 480 px | 4.5 s CUDA, 3.1 s CPU (GPU overhead dominates small scenes) |
| Cycles 32 spp, 2 views × 640 px | 1.7 s |
| Cycles single eye-level interior shot 640 px | 1.3 s |

Workbench works headless; it prints `EGL Error (0x3009): EGL_BAD_MATCH` three times and renders correctly anyway.
Workbench settings used: `shading.light='STUDIO'`, `color_type`, cavity on, shadows on, outline on, `render_aa='8'`,
view transform `Standard`. Cycles preview lighting: sun 2.0 + sky 0.5 (3.0 + 0.8 blew out to white).

For the real thing, `web/shot.mjs` renders a GLB in three r186 through the project browser and prints the scene tree, clip
list, draw calls and triangles:

```
node docs/research/blender-pipeline-code/web/shot.mjs "docs/research/blender-pipeline-code/web/inspect.html?glb=/path/from/root.glb&clip=Walk&t=0.25" out.png
node docs/research/blender-pipeline-code/web/shot.mjs "docs/research/blender-pipeline-code/web/lightmap.html?glb=/path/room.glb&lmdir=/dir/with/pngs" out.png
```

It starts its own static server on an OS-assigned port. Use plain `node` with absolute paths (no `cd`).

---

## 10. Budget checks

Python (ran in `exp13_misc.py`; counts the evaluated mesh, i.e. after modifiers):

```python
def budget_report(objects=None):
    dg = bpy.context.evaluated_depsgraph_get()
    objects = objects or [o for o in bpy.context.scene.objects if o.type == 'MESH']
    rep = {"objects": {}, "tris": 0, "materials": set(), "images": {}}
    for o in objects:
        e = o.evaluated_get(dg); me = e.to_mesh()
        me.calc_loop_triangles()
        t = len(me.loop_triangles)
        rep["objects"][o.name] = {"tris": t, "verts": len(me.vertices),
                                  "materials": [s.material.name for s in o.material_slots if s.material],
                                  "uv_layers": [l.name for l in o.data.uv_layers], "colors": [c.name for c in o.data.color_attributes],
                                  "shared_mesh": o.data.name if o.data.users > 1 else None}
        rep["tris"] += t
        e.to_mesh_clear()
        for s in o.material_slots:
            if not s.material: continue
            rep["materials"].add(s.material.name)
            if s.material.use_nodes:
                for n in s.material.node_tree.nodes:
                    if n.type == 'TEX_IMAGE' and n.image:
                        w, h = n.image.size
                        rep["images"][n.image.name] = {"size": [w, h], "gpu_bytes": int(w * h * 4 * 4 / 3)}   # RGBA8 + mips
    rep["materials"] = sorted(rep["materials"])
    rep["draw_calls_est"] = sum(max(1, len(v["materials"])) for v in rep["objects"].values())   # one call per object per material
    rep["gpu_texture_mb"] = round(sum(i["gpu_bytes"] for i in rep["images"].values()) / 1048576, 2)
    return rep

def assert_budget(rep, max_tris=None, max_materials=None, max_texture_mb=None):
    errs = []
    if max_tris is not None and rep["tris"] > max_tris: errs.append(f"tris {rep['tris']} > {max_tris}")
    if max_materials is not None and len(rep["materials"]) > max_materials: errs.append(f"materials {len(rep['materials'])} > {max_materials}")
    if max_texture_mb is not None and rep["gpu_texture_mb"] > max_texture_mb: errs.append(f"textures {rep['gpu_texture_mb']} MB > {max_texture_mb}")
    if errs: raise RuntimeError("BUDGET EXCEEDED: " + "; ".join(errs))
```

Output for two bevelled cubes with a 3-texture material: `tris 216, materials ["M_PlankTex"], draw_calls_est 2, gpu_texture_mb 4.0`;
`assert_budget(rep, max_tris=100)` raised `BUDGET EXCEEDED: tris 216 > 100`.

Node (source of truth, measures the shipped file):

```
node docs/research/blender-pipeline-code/inspect-glb.mjs file.glb          # human-readable
node docs/research/blender-pipeline-code/inspect-glb.mjs file.glb --json   # machine-readable
```

It prints per node: parent, mesh, skin, TRS, extras; per primitive: material, vertex and triangle counts, attribute types;
total triangles with instancing; per material: factors, alpha mode, double-sidedness, textures and their `texCoord`,
extensions; per texture: mime, size, file bytes, estimated GPU bytes (RGBA8 + mips); per animation: name, start/end seconds,
channels, max keys, interpolation, targets; skins and joints. It decodes meshopt files. `dump-attr.mjs` prints attribute
values, `dump-anim.mjs` prints first/middle/last keys of a channel.

Numbers worth knowing: vertices ≈ 2.2 × triangles for hard-edged, per-face-coloured props (crate: 1 276 tris, 2 784
vertices). The triangle count the GPU sees equals the exported count; draw calls = objects × materials unless instanced or
joined.

---

## 11. Recommended `blender/lib/` layout and art workflow

### 11.1 Library layout

Every function listed with "✔" exists in `docs/research/blender-pipeline-code/` and is exercised by `selftest.py` or by the
experiments above; "new" means it should be written from the snippets in this document. Where the prototypes live today:
`scene.py`/`mesh.py` <- `common.py` + `artlib.py`; `uv.py`/`bake.py` <- `lightmap.py`, `texbake.py`, `cyclesutil.py`;
`material.py` <- `materials.py`, `artlib.py`; `vcol.py` <- `artlib.py`, `lightmap.py`; `rig.py`/`anim.py` <- `riglib.py`;
`export.py`/`budget.py` <- `exportlib.py`.

```
blender/lib/
  scene.py     ✔ argv_after_dashes() -> list[str]
               ✔ reset_scene(fps=30) -> Scene
               ✔ must(result, what) -> None                      # raise unless {'FINISHED'}
               ✔ deselect_all() -> None ; select_only(ob) -> None
               ✔ link(ob, coll=None) -> Object
               ✔ class Timer(label)                               # context manager, prints "[time] label: 1.23s"
               new save_blend(path) -> None
  mesh.py      ✔ new_mesh_object(name, bm, coll=None) -> Object
               ✔ bm_box(bm, size, center=(0,0,0), rot=None) -> list[BMVert]
               ✔ apply_modifiers(ob) -> None
               ✔ finish(ob, bevel=0.012, segments=1, smooth_angle=35, weighted=True, triangulate=False) -> Object
               ✔ tri_count(ob, evaluated=True) -> int
               ✔ set_origin(ob, world_point) -> None                           (section 2.5)
               ✔ tessellate_max_edge(ob, max_len, max_iter=8) -> None           (section 5.6)
               new join(objs, name) -> Object ; linked_duplicate(src, name, loc, rot_z) -> Object
               new delete_faces(ob, predicate) -> None                          # hidden-face removal
  uv.py        ✔ unwrap_lightmap(objs, uv_name="UVLight", margin_px=4, res=1024, angle=66) -> None
               ✔ uv_density(objs, uv_name, res) -> (texels_per_m, uv_area, area_m2)
               new cube_project(objs, cube_size=2.0) -> None                    (operator call in section 5.1)
  material.py  ✔ principled(name, base=(.8,.8,.8,1), metallic=0.0, roughness=0.5, emission=None, emission_strength=1.0) -> Material
               ✔ textured(name, albedo_png, rough_png=None, normal_png=None) -> Material
               ✔ vcol_material(name, roughness=0.8, metallic=0.0, attr="Color", image=None) -> Material
               ✔ alpha_mask(material, threshold=0.5) -> Material                # alphaMode MASK
               ✔ gltf_occlusion_group() -> NodeTree ; set_occlusion_map(material, image, uv_name="UVLight") -> Material
  vcol.py      ✔ color_layer(ob, name="Color") -> Attribute                     # creates + makes active/render
               ✔ get_colors(ob, name="Color") -> ndarray[n_loops, 4]
               ✔ set_colors(ob, arr, name="Color") -> None
               ✔ fill_color(ob, rgb, name="Color") -> None
               ✔ corner_positions(ob) / corner_normals(ob) -> ndarray[n_loops, 3]
               ✔ bake_ao_vertex(objs, name="AO", samples=64, distance=1.0) -> seconds
               ✔ compose_vertex_color(ob, base_rgb, ao_name="AO", ao_strength=0.8, gradient=(0.75, 1.1),
                                      up_tint=0.06, jitter=0.06, seed=1, out="Color") -> None
               ✔ bake_vertex_light(objs, attr="Color", samples=64, kind='DIFFUSE') -> None   (section 5.6)
  bake.py      ✔ use_cycles(device='CPU', samples=64, denoise=True) -> str      # returns device actually used
               ✔ class BakeTarget(objs, img) ; class NonMetal(objs)             # context managers
               ✔ bake_lightmap(objs, img, uv_name="UVLight", samples=64, margin_px=4, direct=True, indirect=True, clear=True) -> seconds
               ✔ denoise_image_compositor(img, out_path_exr) -> Image
               ✔ save_lightmap_png(img, path, scale=1.0) -> None
               ✔ pixels(img) -> ndarray[h, w, 4]
               ✔ torus_coords(nt, scale=1.0, scale_v=None) -> (vector_socket, w_socket)      (section 4.1)
               ✔ unit_plane(name="BakePlane") -> Object ; bake_target(mat, name, size, colorspace) -> (Image, Node)
               ✔ bake_socket_as_emit(ob, mat, socket_name, img_name, size, colorspace, samples=4) -> Image
               ✔ bake_normal(ob, mat, img_name, size, samples=4) -> Image
               ✔ save_png(img, path) ; seam_error(img) -> (wrap_x, inner_x, wrap_y, inner_y) ; tile_preview(img, path, n=2)
               ✔ make_plank_material(name) -> Material                           # worked example of a tileable procedural
  rig.py       ✔ make_armature(name, bones, coll=None) -> Object
               ✔ bind(mesh_ob, arm_ob) ; skin_rigid(mesh_ob, arm_ob, assign) ; join_as_rigid_skin(parts, arm_ob, name) -> Object
               ✔ parent_to_bone(ob, arm_ob, bone_name) -> None
               ✔ auto_weights(mesh_ob, arm_ob) -> None                          # raises on unweighted vertices
  anim.py      ✔ new_action(arm_ob, name) -> Action ; reset_pose(arm_ob)
               ✔ key_pose(arm_ob, frame, pose) ; action_fcurves(act) -> list[FCurve]
               ✔ set_interpolation(act, interp='BEZIER', easing=None) ; fix_quaternion_flips(act)
               ✔ push_to_nla(arm_ob, actions) -> NlaTracks
  export.py    ✔ EXPORT_DEFAULTS ; export_glb(path, **overrides) -> path                    (section 8.1)
               ✔ marker(name, loc, rot_z_deg=0.0, coll=None, **props) -> Object             (section 8.2)
  budget.py    ✔ budget_report(objects=None) -> dict ; assert_budget(rep, max_tris, max_materials, max_texture_mb)
blender/tools/
  preview.py   ✔ contact sheets (section 9)
tools/
  inspect-glb.mjs ✔   optimize-glb.mjs ✔   (plus dump-attr.mjs, dump-anim.mjs for debugging)
```

Scripts import the library with `sys.path.insert(0, <repo>/blender)` then `from lib import mesh, ...`. Keep the library free
of module-level side effects (one experiment script without an `if __name__ == "__main__"` guard re-ran its whole scene when
imported).

### 11.2 Art workflow: stylised low/mid-poly that reads as hand-made

Before/after proof with the same three props, same triangle order of magnitude:
`shots/research-blender/preview_art_primitive_cycles.png` (raw primitives, flat colour) vs
`preview_art_styled_cycles.png` (workflow below), and in three after meshopt: `exp12_three_styled.png`.
Styled crate 1 276 tris, barrel 332, rock 70. Script: `exp12_art.py`, helpers `artlib.py`.

1. **Build from parts, not from one primitive.** A crate is an inner box plus 4 planks per side, 2 frame boards per side
   and lid planks — each a `bm_box`. A barrel is a 5-ring profile × 14 segments with an inset, sunken lid and three hoop
   bands. Separate overlapping parts give gaps, shadow lines and a silhouette that is not a box.
2. **Break regularity with seeded jitter.** Per plank: ±0.012 rad wobble, ±4 mm depth offset, 0–2 cm length variation,
   lid planks at slightly different heights. Rocks: fractal noise + `noise.cell` chunks on an icosphere, squash, flat
   bottom, decimate to 20–25%. Always from `random.Random(seed)`.
3. **Bevel every hard edge a little, then weighted normals** (`finish(ob, bevel=0.006..0.012, segments=1)`). One segment
   is enough; the weighted normals make the big faces flat and put the highlight on the bevel. Rocks: no bevel,
   `smooth_angle≈28` so some edges stay faceted.
4. **Vertex colour does the painting.** `bake_ao_vertex` (CPU, 0.03 s for these props, AO distance 0.5–0.6 m), then
   `compose_vertex_color`: `base × lerp(1, AO, 0.8) × height gradient (0.75 bottom -> 1.1 top) × (1 + 0.06 × up-facing) × per-face jitter ±6–10%`.
   The per-face jitter is what makes individual planks and stones read as separate pieces. Only the final `Color`
   layer is kept; export puts it in `COLOR_0`.
5. **Texture detail comes from a few shared tiling/trim textures**, multiplied by the vertex colour
   (`vcol_material(..., image=...)` exports `baseColorTexture` + `COLOR_0`). Bake them with section 4 at 512². A trim sheet is
   the same bake with several horizontal strips (planks, iron band, rivets) on one plane; map faces to strips by setting UV
   V-ranges in bmesh **(trim-sheet UV mapping was not prototyped; only the tiling plank set was baked and used)**.
6. **Lighting:** rooms and unique large surfaces get lightmaps at ~32 texels/m; props, terrain and instanced objects get
   AO/gradient vertex colours; no real-time shadows on Low.
7. **Clean up for the budget:** delete faces nobody can see (the crate's inner box and plank backs are ~40% of its
   triangles and have AO 0 — `AO mean 0.27` gave it away), set `use_backface_culling = True`, join static pieces per zone
   and material, check with `budget_report` and `inspect-glb.mjs`.
8. **Review loop:** `preview.py --color VERTEX` (0.4 s) while iterating, one Cycles sheet for the critic, and
   `web/shot.mjs` for the truth in three.

Per-asset order of operations that keeps output deterministic and exports clean:
model -> apply modifiers -> smooth/sharp + weighted normals -> UV0 (cube project or trim mapping) -> `UVLight` if lightmapped
-> AO/vertex colour -> materials -> markers/extras -> `budget_report` -> export -> `optimize-glb.mjs` -> `inspect-glb.mjs` -> preview.

---

## Traps (things that failed, and why)

Skeleton and shell
- A Python exception does **not** fail the process: exit code 0 without `--python-exit-code` or an explicit `sys.exit(1)`.
- Operators signal failure by returning `{'CANCELLED'}`: seen with `uv.pack_islands`, `object.shade_auto_smooth`, and `object.bake` on a material without an image node.
- `--look -1,1,1` -> argparse error "expected one argument". Write `--look=-1,1,1`.
- `cd` in a shell command prints an fnm error and can abort the chain; use absolute paths.
- Iterating a `set` of strings gives a different order each run.
- Importing a script that has no `__main__` guard re-executes its scene build.
- After `bpy.data.objects.remove(ob)`, `bpy.context.view_layer.objects` holds a stale `None` (and misses newly linked objects) until `view_layer.update()`; a plain "deselect everything" loop then dies with `'NoneType' object has no attribute 'select_set'`. Use `deselect_all()`.

Modelling
- `bmesh.ops.create_cube/create_grid(calc_uvs=True)` without `bm.loops.layers.uv.new()` first: no UV layer at all; export has no `TEXCOORD_0`; bake raises "No active UV layer found".
- `mesh.use_auto_smooth` no longer exists; `bpy.ops.object.shade_auto_smooth` is cancelled headless ("Asset loading is unfinished").
- Array constant offsets are in object space; an unapplied scale of 0.2 turned a 0.22 m step into 0.044 m.
- `create_grid(size=)` is the half-size.
- Bevel perturbs pre-existing UVs by ~1e-7 non-deterministically; unwrap after bevelling.
- Weighted Normal does nothing on flat-shaded faces; set `use_smooth` first.

Materials and colours
- Procedural nodes export as white/rough-1 with no error.
- `blend_method='CLIP'` is ignored in 4.5; linked alpha exports as `BLEND`. Use `Math(GREATER_THAN)` for `MASK`.
- Default materials export `doubleSided: true`.
- Default vertex-colour export mode can emit a fake white `COLOR_0` and push real data to `COLOR_1`.
- Several Image Texture nodes using the same image in one material print "More than one shader node tex image used for a texture" (harmless, but the sampler of the first node wins).

Baking
- `cycles.use_denoising` and adaptive sampling have no effect on bakes.
- Metallic surfaces bake black in DIFFUSE; and a metallic `MeshStandardMaterial` is black under a lightmap without an env map.
- Baked light exceeds 1.0; an 8-bit image without a scale factor clips it.
- A bump with a 1-texel step and small distance bakes to a visually flat normal map.
- GPU baking is slower than CPU for small jobs (2.5 s start-up + ~0.3 s per object).
- OptiX is listed as a compute type but has no device (error 7804/7805); requesting it silently means CPU unless you check.
- `uv.pack_islands` is cancelled when no UVs are selected; `uv.export_layout(mode='PNG')` cannot run in background mode.
- AO distance defaults to 10 m (`world.light_settings.distance`), which darkens whole rooms.
- UV layer order, not `active_render`, decides `TEXCOORD_0/1`.
- At 15 texels/m, parts thinner than ~10 cm get wrong (black) lightmap texels.

Rigging and animation
- A bone-parented object is positioned relative to the bone **tail**; set `matrix_parent_inverse` (see `parent_to_bone`).
- Object and bone with the same name: three renames one to `name_1`.
- `export_force_sampling=False` lost a 360° spin completely.
- `ACTIVE_ACTIONS` exports one clip called "Animation".
- `ACTIONS` with two armatures exports only each rig's active action.
- Quaternion keys of opposite sign interpolate the long way; run `fix_quaternion_flips`.
- Actions that start after frame 0 export with dead time unless `export_anim_slide_to_zero=True`.
- Actions without `use_fake_user` are lost on save when unassigned.
- Legacy `action.fcurves.new` creates an unbound "Legacy Slot".

Export and post-process
- `export_apply=True` + linked duplicates that carry modifiers: every object gets its own mesh copy.
- Objects hidden in viewport/render are still exported unless `use_visible` / `use_renderable`.
- `export_hierarchy_full_collections` adds a node named "Scene Collection" (space -> `_` in three).
- gltf-transform `prune()` removes or renumbers UV sets that no glTF texture references (lightmap UVs).
- gltf-transform `quantize`/`meshopt` changes mesh-node TRS; instancing drops instance names and extras.
- `COLOR_0` is quantised to 8-bit linear by default in the optimiser.

Previews
- Workbench prints EGL errors but works. A turntable of an interior shows only wall backs: use `--cull` or `--cam/--look`.
- Cycles "Standard" view with sun 3 + sky 0.8 over-exposes default-grey assets.
- Appending a wire material to a mesh that has no material makes it slot 0 and turns the whole mesh black; add a base material first.
