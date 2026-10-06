# blender/lib: the art pipeline library (FROZEN after phase 2)

Every art script imports it the same way (copy the header of `blender/template_asset.py`). Each function has a
docstring; this page is the map. Author in Blender space: **+Z up, an asset's front is −Y**; a game point `(x, y, z)`
is Blender `(x, −z, y)` (`layout.to_blender`).

```
node tools/build-assets.mjs --only <id[,id] | piece | owner>   the one command: build -> optimise -> check (FAILED says why)
        [--force] [--verbose] [--placeholders] [--jobs n] [--manifest overlay.json] [--allow-stale-lightmap]
node tools/build-assets.mjs --reset <id>                       back to the placeholder (only once the id's script is removed)
node tools/preview-asset.mjs <id> [--clip <name>|all] [--cycles] [--game] [--zone]      evidence in shots/<your piece>/
        [--piece <shots folder>] [--name <file stem>] [--manifest overlay.json]
        [--zoom 2] [--angles "az:el;az:el"] [--elev 35] [--bounds=x0,y0,z0,x1,y1,z1]    close-ups (the sheets)
        [--dist 2 --yaw -30 --pitch 15]                                                 the --game frame's camera
node tools/preview-asset.mjs --textures <texture id> [...]     tx_<id>.png, tx_<id>_tiled.png into the owner piece's folder
node tools/asset-status.mjs --owner <piece | owner>            what is still a placeholder, by priority
node tools/check-glb.mjs <id | piece>   node tools/inspect-glb.mjs <file.glb>   node tools/dump-attr.mjs / dump-anim.mjs
```

**`<piece>` is your builder name**: `art-env-exterior`, `art-env-interior`, `art-props-mech`, `art-props-dress`,
`art-weapons`, `art-enemies-bider`, `art-enemies-transit`, `art-boss-windlass`, `art-boss-tamper`. The tools know which
ids are whose (`tools/pipeline-lib.mjs` `pieceOf`, `manifest.piece_of_id`): `--only art-boss-tamper` builds exactly
`enemy_tamper` and `tamper_cold_static`; `--only art-props-mech` builds the 28 mech assets and the three shared textures
whose scripts are mech's; `--only art-props-dress` builds the 29 dress assets and no texture. A manifest owner (`boss`,
`props_dress`) or an order name (`art-boss`) selects BOTH builders' halves: leave those to the integrator.

**The line a build prints** is the whole verdict; read all of it:

```
built    ia_ammo_box   17.1 kB  0.5 s  tris 184/400 dc 3/3  (2 warnings: see blender/export/.logs/ia_ammo_box.log)
FAILED   env_tally_house: RuntimeError: merge_chunks(env_tally_house): 3 objects have vertex-lit faces that were never vertex-lit ...
STALE    lm_surface: env_the_lip was rebuilt and its mesh ... points at this lightmap, but ... was not run again ...
```

`(N warnings: …)` counts the library's `WARNING` lines of that run (buried vertices, lightmapped faces that were also
vertex-lit, a chunk over its triangle share): open the log, or run with `--verbose`. `FAILED` and `STALE` exit 1.

**Previews land in your own folder** (`shots/<piece>/`) without a flag; `--piece` is for a critic's or a scratch folder,
`--name` renames the files (before / after pairs). Every view is fitted to the subject (about 10 % of the tile to spare).
A room or zone (an asset with a chunk plan) is shown as a **dollhouse**: from 50° up with back faces culled; its
`--cycles` sheet shows the **baked** result as the game draws it (COLOR_0 × texture × lightmap × 2 on lightmapped
faces, COLOR_0 × texture × 2 on vertex-lit ones). For a detail, frame a Blender box:
`node tools/preview-asset.mjs <id> --bounds=-0.3,-0.3,0.6,0.3,0.1,1.0 --angles "0:10;60:25"`; for a close `_game.png`
(the real loader, the shared textures bound) add `--game --dist 2 --yaw -30 --pitch 15`. **Open every image.**

| Module | What it gives you |
|---|---|
| `scene` | `asset_args()` (`--out --blend --seed --preview`), `reset_scene()`, `rng(seed)`, `must(result, what)`, `select_only`, `Timer`, `save_blend`, `run(main)` |
| `mesh` | `box`, `cylinder`, `bm_box`, `bm_cylinder`, `new_bmesh`, `new_mesh_object`, `finish(ob, bevel, segments, smooth_angle, weighted)`, `join(objs, name)` (harmonises layers and marks), `delete_faces(ob, predicate)`, `tessellate_max_edge`, `bisect(ob, point, normal)` (an edge loop exactly there), `set_origin`, `apply_transform`, `apply_scale`, `duplicate`, `linked_duplicate`, `bounds`, `tri_count` |
| `material` | `game_material(name)`, `assign(ob, name, faces=None)`: the eight names `m_frontier m_pellam m_sand m_flat m_mask m_emis m_prop m_gun` |
| `faces` | the `faces` argument of `uv.*`, `vcol.*`, `material.assign`, `zone.fold_flat`: `None` (all) \| polygon indices (`[]` = none) \| `callable(polygon) -> bool`, ONE argument in object space (`lambda p: p.normal.z > 0.9`). **Not** the `mesh.delete_faces` predicate `(face, world_centre, world_normal)`: a three-argument lambda here fails with a message that says so |
| `uv` | `map_to_trim(ob, faces, sheet, region, metres_per_repeat, along, fit, rng)`, `map_to_palette`, `map_to_emis`, `map_flat`, `map_to_mask(ob, faces, region, index)` (the faces of ONE side), `map_planar_world` (sand), `lamp_index`, `cube_project(ob | [obs])`, `unwrap_lightmap(objs, texture_id, faces=...)`, `uv_density`, `ensure_layers` |
| `vcol` | `tint(ob, colour)`, `bake_ao_vertex(objs)`, `compose_vertex_color(ob, mode='tint'|'ratio', dust, bleach, jitter)`, `streak_under`, `darken_contact`, `emis_attr`, `bake_vertex_light(objs, samples=2048, faces=...)`, `mark_vertex_lit(ob, faces=None)`, `vertex_lit_faces(ob)`, `buried_faces` / `warn_buried`, `get_colors / set_colors / fill_color`, `adopt_imported` |
| `bake` | `use_cycles(device)`, `add_sun`, `set_world`, `calibrate(key, ambient)`, `bake_lightmap(objs, texture_id)`, `bake_light_layer(objs, texture_id, lights)`, `save_lightmap(img, texture_id)`, `neutral_uv`, `set_vertex_lit_uv1`, `paint_neutral_texel`, `only_lights`, `denoise_image_compositor`, the procedural-tile helpers |
| `rig` | `make_armature(name, bones)`, `join_as_rigid_skin({bone: [parts]}, arm, name)`, `skin_rigid`, `bind`, `auto_weights`, `parent_to_bone(empty, arm, bone)`, `unweighted` |
| `anim` | `frames(asset, clip)`, `new_action`, `key_pose` (its docstring has the hinge sign table), `key_object`, `set_interpolation`, `fix_quaternion_flips`, `push_to_nla` |
| `export` | `marker(name, loc, ...)`, `ensure_root`, `check_scene`, `vertex_light_errors`, `uv1_faces`, `draw_calls`, `stamp_bake`, **`export_asset(asset_id, args.out)`**, `preview(asset_id, glb)` |
| `budget` | `budget_report`, `assert_budget` |
| `manifest` | `asset(id)`, `texture(id)`, `clip_frames`, `raw_path`, `piece_of_id(id)`, `shots_dir(id)`, `palette_uv / emis_uv / palette_rgb(name)`, `trim_v(sheet, region)`, `trim_flat_uv`, `mask_uv(region, index)` |
| `layout` | `to_blender / to_game`, `solids(zone)`, `solid_mesh(solid)`, `marker(id)`, `markers(zone, type)`, `placement(marker, offset)`, `sun()`, `path_ground(zone, x, z)` |
| `zone` | `embed_prop(asset, node, location, rot_z, material_name, lightmap)`, `fold_flat`, `assign_chunks(objs, asset)`, `merge_chunks(asset)`, `copy_about_axis(objs, axis, n)`, `dressing_empty(kind, n, asset, ...)`, `lamp_set(name, lamps, colour)`, `collider_terrain(ob)`, `cut_at_chunk_boxes` |
| `knot` | `build_knot(radius, collar='hex'|'clustered', seed)` |
| `brand` | `pellam_mark(U, relief, segments)`, `mark_disc_centres(U)`, `numeral_mesh(text, height, depth)`, `maker_plate(number)`, `livery_band(points, z, height)`, `text_triangles` |
| `texdraw` | numpy drawing kit of `blender/tex/*.py`: `write_png`, `read_png`, noise, SDF shapes, `raster_triangles`, `finish_detail` |

Tables written by `blender/tex/*.py` (append-only): `palette.json`, `tx_frontier_trim.json`, `tx_pellam_trim.json`,
`mask_regions.json`. They live here because every script reads them, but **each belongs to its texture script and that
script's owner** (`assets.json` `textures.*.owner`; for `tx_mask`, `tx_palette`, `tx_palette_emis`: `art-props-mech`):
they are generated output, the one exception to "nobody edits `blender/lib`", and they change only by running the
texture script. The build driver hashes the ENTRIES an asset read (recorded through
`manifest.palette_uv / trim_region / mask_uv ...`), so appending a cell or a region rebuilds nothing; moving or
recolouring an existing one rebuilds its users, which is why that is forbidden.

## What the build holds you to (the things that are easy to get wrong)

- **Draw calls = one per mesh per material.** Nothing is joined at load, so two meshes that share `m_prop` are two
  draw calls. `export_asset` fails in Blender with the mesh names (`export.draw_calls`), `check-glb` fails the shipped
  file. Join static parts (`mesh.join`), rigid-skin moving ones (`rig.join_as_rigid_skin`, one mesh per material).
  Variant nodes (`jug_intact` / `jug_broken`: manifest `nodes` that are plain meshes) show one at a time and count once.
- **Baked-light extras.** `export_asset` stamps every mesh of a standalone asset with the extra `bake` the manifest's
  `bake` asks for (`AO`, `VL`, `UNLIT`; for `LM` / `LM+VL` a mesh with lightmapped UV1 gets `LM` + `lightmap`, any other
  `VL`); the runtime shows COLOR_0 x 2 or binds the lightmap from those extras, and `check-glb` fails a mesh without
  them. Set `ob["bake"]` yourself only to choose between `LM` and `VL` by hand. Zones: `zone.merge_chunks` does it.
  **A prop its zone lights is `AO` in its own file**: a manifest `bake: VL` asset with `placedBy: zone` (17 props) and an
  `LM` asset without a lightmap of its own deliver unlit tint x AO x gradients (art-props 4: "do not bake light into
  them"); `zone.embed_prop` + the zone's `vcol.bake_vertex_light` do the lighting.
- **Every face shown at COLOR_0 × 2 must have been vertex-lit, face by face.** Those faces are: every face of a mesh
  stamped `VL`, and, in a mesh stamped `LM` (every zone chunk is such a mixed mesh), the faces whose UV1 sits on the
  lightmap's neutral texel. `vcol.bake_vertex_light` marks the faces it lit (a per-face mark that survives `mesh.join`,
  `rig.join_as_rigid_skin`, `mesh.tessellate_max_edge`, `zone.copy_about_axis` and `zone.merge_chunks`; it is not
  exported). Forget the bake, light only some of the objects, or restrict it with `faces=` to too few faces, and
  **the build FAILS**: `zone.merge_chunks` raises with the object names and a place to look, `export_asset` fails a
  standalone mesh with the count (`export.vertex_light_errors`). Unlit, those faces would ship at twice their tint:
  washed-out white beside a correctly lit floor. A script that writes tint × light / 2 itself says so with
  `vcol.mark_vertex_lit(ob, faces)`. The same guard fails a face that was never given a lightmap UV at all (its object
  was left out of `uv.unwrap_lightmap`), and prints a `WARNING` for a lightmapped face that was vertex-lit as well
  (`faces=` forgotten on an object that has both kinds: it would show dark).
- **A lightmap your meshes point at must be written in the same run.** A script whose meshes carry `lightmap` /
  `lightLayer` = an id that is the script's own by-product, and which did not call `bake.save_lightmap(img, id)` in
  this run, FAILS (`its lightmap <id> was not written in this run`): the new GLB has a new UV1 atlas and would sample
  the old or the placeholder lightmap. While iterating on geometry with the bake switched off, pass
  `--allow-stale-lightmap`: the asset ships and its line says `STALE LIGHTMAP <id>`. A lightmap with a bake script of
  its own that two zones share (`lm_surface`) is checked at the end of the run: rebuild a zone without re-baking a stale
  `lm_surface` and the run prints `STALE lm_surface` with the command that builds them together, and exits 1.
- **Sockets ride bones.** An empty that code follows (`muzzle`, `crown`, `*_hit`) is parented with
  `rig.parent_to_bone`; where the manifest has `nodeParent` the build checks the parent's name.
- **Which way a hinge turns.** `anim.key_pose(arm, frame, {bone: {'rot': (rx, ry, rz)}})` turns about the bone's OWN
  axes; local Y runs from the bone's head to its tail, so a hinge bone laid along its hinge line turns about Y, by the
  right-hand rule about head → tail. Measured: a hinge bone running along **+X** (head on the left as you stand in
  front of the asset) with a **positive** angle LOWERS what lies in front of the hinge and RAISES what lies behind it:
  a lid hinged at its back edge opens with a **negative** angle, and a flap hanging from a hinge at its top swings out
  toward the front with a negative angle (`blender/template_asset.py`). A vertical hinge bone (+Z, a door post):
  positive is counter-clockwise seen from above. Wrong way round: negate the angle or swap head and tail, and look at
  `node tools/preview-asset.mjs <id> --clip <name>` before anything else.
- **Nothing ships until it passes.** The driver runs your script with `--out` set to a temporary name and
  `bake.save_lightmap` writes temporary names too (`KS_STAGE_TAG`); the optimiser writes a temporary file; `check-glb`
  judges that file; only then are the raw GLB, its lightmaps and the shipped files renamed into place, together. A FAILED
  build leaves the previous files (placeholder or final) untouched. So: write the GLB only to `args.out`, lightmaps only
  through `bake.save_lightmap(img, id)`.
- **Staleness.** An asset is rebuilt when its script, any `blender/lib/*.py`, a design file, a table entry it read, an
  embedded prop's raw export, or **a project module it imported** (`import common` beside your script: recorded in
  `<raw>.deps.json`) changed. A helper that is read as data or `exec`'d is not seen: use `--force`.
- **Trim rows have no gutter.** `uv.map_to_trim(..., inset_px=0.5)` is exact at full size; rows end in their own seam
  line, so lower mips mix seam with seam. Pass `inset_px=2` where a pale edge must stay clean at a distance.
- **The `tin` row** of `tx_frontier_trim` is 12 soft bars per 1.0 m sheet running ACROSS the row (constant along V), so
  a tin surface of any height can stretch the row in V; U (one repeat = four sheets, 4.0 m) must run across the
  corrugations: level on a wall (the default of `map_to_trim`), along the eave on a roof (`along=(x, y, z)`).

## Bake timings and sample counts (measured here: CPU, 20 threads; plan iterations with these)

| Bake | Samples | Time |
|---|---|---|
| lightmap 256² (the fixture room, 24 m² of floor) | 64 spp + OIDN | 0.4 s, light layer 0.4 s |
| lightmap **1024²** (same room, 166 texels/m) | 64 spp + OIDN | **7.5 s**, light layer 9.6 s; shipped WebP 239 kB |
| lightmap **2048²** (same room; the size of `lm_surface`) | 64 spp + OIDN | **44 s**, light layer 41 s; shipped WebP 862 kB |
| AO to vertex colour, a 4 140-triangle prop (`vcol.bake_ao_vertex`) | 64 / 256 spp | 0.024 s / 0.029 s |
| vertex light, the same prop in the open (2 074 vertices) | 256 / 2048 / 4096 spp | 0.11 s / 0.8 s / 1.6 s |
| vertex light, the fixture room (2 348 faces, 1 768 vertices; lamp meshes, light through a window) | 256 / 1024 / 2048 / 4096 spp | 0.3 s / 1.3 s / 2.6 s / 3.3–5.3 s; up to 0.5 s / 2 s / 4 s / 8 s while others bake |

**Vertex light: the sample count is the quality.** Each vertex is one path-traced point and nothing denoises it.
Error of the displayed light against a 131 072-sample reference, fixture room (sun through a window, sky, three lamp
quads), mean / 90th percentile over its vertices:

| `samples=` | 256 | 1024 | **2048 (default)** | 4096 |
|---|---|---|---|---|
| this library (light tree off) | 8 % / 18 % | 4.6 % / 10 % | **3.4 % / 7.5 %** | 2.4 % / 5 % |
| before round 3 (light tree on; 256 was the recommendation) | 21 % / 44 % | 10 % / 23 % | 7 % / 17 % | 5 % / 11 % |

Use `samples=256` while iterating, the **default (2048)** for a build you look at, **4096 for a final interior**
(`tests/pipeline/fixtures/fixture_room.py` does). Under a sun and a sky alone (an exterior without lamp meshes) the noise
is far lower: 0.3 % at 256, so 256–1024 is final there. Before / after frames:
`shots/pipeline-fix-r3/room_vl_before_256_lighttree.png`, `room_vl_after_4096.png`.

Two things were measured and decided for you: every bake of this library (`bake_vertex_light`, `bake_lightmap`,
`bake_light_layer`) runs with **Cycles' light tree off** (with a few emissive lamp meshes the tree doubles the vertex
noise and triples the raw lightmap noise: the room's lightmap at 64 spp is 4.4 % off after OIDN with it, 2.4 % without;
under a sun and a sky alone it changes nothing; `light_tree=True` is there for a scene with dozens of lamp meshes), and
there is **no neighbour-smoothing pass**: the true light differs by about 25 % between neighbouring wall vertices in
that room, so averaging neighbours cost more (30 % error) than the noise it removed, and an edge-preserving variant
gained only a tenth.

Lightmaps: **64 spp + OIDN** (`bake.bake_lightmap(samples=64)`: the denoiser does the rest; time grows with texels,
about 4 x per size step); **64 spp for vertex AO**. Bake time is set by the atlas size, not by the room: a 2048² zone
iteration costs about a minute and a half with its layer, so iterate at 512² (pass `res=` / a smaller overlay size) and
bake full size last. Scratch scripts: `scratch/pipeline-fix-r3/vl_*.py`, `lm_noise.py`; `scratch/pipeline-fix-r2/`.

## Traps this library already steps round (do not undo them)

- `matrix_world` is stale right after you set `location` / `rotation_euler`: the library updates the view layer where
  it reads it; in your own code call `bpy.context.view_layer.update()` or use `mesh.apply_transform`.
- Finish (bevel) first, map UVs and tint afterwards.
- `bmesh.ops.extrude_face_region`, `create_uvsphere` and `remove_doubles` order their output by memory address;
  `export_asset` re-sorts and triangulates every mesh so exports stay byte-identical. Do not rely on face order.
- A join leaves layers that a part lacks uninitialised: `mesh.join` / `rig.join_as_rigid_skin` create them first.
- `uv.unwrap_lightmap` unwraps with `correct_aspect=False` (the preview material holds a 2:1 trim image).
- A UV layer made by `uv.ensure_layers` starts as a COPY of UV0, not as zeros: an object that never went through
  `uv.unwrap_lightmap` looks lightmapped until the build's guard refuses it ("faces have no lightmap UV").
- Importing a GLB brings materials called `m_prop` again: `zone.embed_prop` and the previews deal with it.
- **A vertex bake samples only at vertices.** Three shapes of the same trap, all in the worked examples:
  1. A long part with vertices only at its two ends, both ends touching or inside other parts (a column between a
     plinth and a head, a leg between floor and seat, a board whose ends sit under battens) bakes dark from end to end
     although it stands in the open. `vcol.bake_ao_vertex` and `vcol.bake_vertex_light` print
     `WARNING <object>: N faces ... baked dark from end to end` (counted on the build line). Cure: an edge loop along
     the part (`mesh.tessellate_max_edge(part, 0.3)`, after UV mapping and tinting) or delete the buried caps
     (`fixture_stool.py` legs, `fixture_crate_panel.py` planks).
  2. A big flat face with SOME corners under another part (a 1.2 m panel whose foot lies behind the livery band):
     no warning, but the dark corners grade across the whole face. Cure: `mesh.bisect(part, point, normal)` exactly
     where the cover ends, then `mesh.tessellate_max_edge(part, 0.3)` (`fixture_crate_panel.py` panels).
  3. Small fittings on a big surface (a plate, a knot, a numeral on a wall): the wall has no vertices to hold their
     contact shadow, and the few wall vertices behind a fitting bake black and smear 0.3 m. Cure: bake the big
     surfaces with the fittings hidden (`ob.hide_render = True`), then the fittings with everything in place
     (`fixture_crate_panel.py` `main`).
- Vertex colour in `m_prop` assets is a MULTIPLIER over the palette cell (`compose_vertex_color(mode='ratio')`); in
  `m_frontier / m_pellam / m_sand` it IS the albedo (`mode='tint'`).

## Worked examples (each is built and tested by `node --test tests/pipeline/`)

| File | Read it for |
|---|---|
| `blender/template_asset.py` | the skeleton of a prop: parts, rigid skin, a hinge clip with the right sign, a lamp set, decals |
| `tests/pipeline/fixtures/fixture_crate_panel.py` | an `m_frontier` / `m_pellam` asset: trim mapping, jitter, the three vertex-AO cures, the knot, the mark, the plate |
| `tests/pipeline/fixtures/fixture_room.py` | a zone: lightmapped floor + vertex-lit walls in one mesh, an embedded prop, a lamp set, a light layer, calibration, chunks |
| `tests/pipeline/guards.test.mjs` | what the build refuses: the room without its vertex bake, a prop with too few faces lit, a lightmap not written |
| `tests/pipeline/shared_atlas.test.mjs` | ONE lightmap for TWO zone GLBs baked by a THIRD script over one helper module (the shape of `lm_surface`) |
