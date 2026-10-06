# Work order: `foundation-pipeline`

Phase 2 (foundation), built **second**, after `foundation-core`. You are a fresh agent: this
file plus the documents it names are everything you need.

Read first: `CLAUDE.md`, `docs/PLAN.md`, `docs/workorders/README.md`, then
`docs/research/blender-pipeline.md` **in full** (a verified cookbook for Blender 4.5.14
headless on this machine; its "twelve things" and "Traps" are mandatory) with the prototype
code in `docs/research/blender-pipeline-code/` (it ran; lift it), then `docs/ARCHITECTURE.md`
sections 1, 1.1, 7 (all), 8.1, 8.4, 9.1, 9.2, 15, `docs/ART_BIBLE.md` sections 2, 4, 5 and
7.1, and `docs/research/tech-web.md` section 12 (the optimise chain) and 2 (loading).

## 1. Mission

Six art builders start the moment you finish. Each must be able to write one Python script,
run **one command**, and get: a GLB that matches its manifest entry or a build failure that
says why, shared textures that already look right, baked light that survives the optimiser,
and a contact sheet a critic can open. And the game must already load a **placeholder with
final names, pivots, node positions, clips and durations for every one of the 84 manifest
assets and 18 textures**, so code is never blocked by art. Pillars: **5** (baked lighting and
budgets enforced at build time), **2** (the palette and trim sheets are where "a world that
has moved on" is drawn). `blender/lib/` is **frozen** when this phase closes.

## 2. Owned files (exclusive)

```
blender/lib/**               scene.py mesh.py uv.py material.py vcol.py bake.py rig.py anim.py export.py budget.py
                             + manifest.py layout.py zone.py knot.py brand.py (section 4.1)
blender/tex/*.py             the INITIAL version of every shared-texture script (section 4.4). From phase 3 each file
                             belongs to the owner named in assets.json textures.<id>.owner (README "texture files")
blender/placeholders.py
blender/tools/preview.py     contact sheets
blender/template_asset.py    the documented starting point every art script copies
tools/build-assets.mjs  tools/optimize-assets.mjs  tools/check-glb.mjs  tools/asset-status.mjs
tools/inspect-glb.mjs  tools/dump-attr.mjs  tools/dump-anim.mjs  tools/preview-asset.mjs
public/assets/**             only through tools/optimize-assets.mjs (placeholders now; owners overwrite their own ids later)
blender/export/**  blender/blend/**   generated, git-ignored (add blender/export/ to nothing: ask in your request file if .gitignore lacks it)
tests/pipeline/**
docs/requests/foundation-pipeline.md
shots/foundation-pipeline/
```

Do **not** edit `src/**`, `tests/core/**`, `tests/harness.mjs`, `design/*.json`,
`tools/gen_*`, `tools/validate_*`, `tools/layout_geom.mjs`, `package.json`, or the
per-owner art folders (`blender/env_exterior/` … `blender/boss/`), except for one
`README.md` stub in each art folder pointing at `blender/template_asset.py`. `tx_fx` and
`tx_noise` are drawn by `tools/gen_fx_atlas.mjs`, which belongs to `code-render`: you ship
only their placeholders.

## 3. Inputs

| Input | Use |
|---|---|
| `design/assets.json` | the manifest: `assets.*` (path, owner, priority, triBudget, drawCalls, materials, bake, bones, nodes, lampSets, codeDriven, nodePos, hitPoint, animations, placeholder, chunks, drawnNodes, lightmaps, lightLayers), `textures.*` (size, format, regions, neutralTexel, lightmapScale 2), `zones.*.dressing`, `meta.ownerFolders`, `meta.enums.placeholderAnchor`, `bindings` |
| `design/layout.json` | solids (box / ramp / cylinder conventions in `meta.conventions` and `tools/layout_geom.mjs`), markers, `meta.sun` (to-sun `(−0.686, 0.242, −0.686)` game space), `meta.surfaces` (surface → material) |
| ARCHITECTURE 7.1 | flow, the exact optimise chain, the 12-bit colour test |
| ARCHITECTURE 7.2 | what a GLB must look like (root, names, empties, materials are names, UV0/UV1, `COLOR_0`, extras, clips, thin geometry) |
| ARCHITECTURE 7.3 | placeholder rules |
| ARCHITECTURE 7.4 | baked lighting: `lightmapScale` = `VERTEX_LIGHT_SCALE` = 2, the neutral texel, light layers, embedded props |
| ARCHITECTURE 7.5 | chunk plans, dressing empties (`inst_<nnn>`, `brk_<nnn>`), lamp sets |
| ART_BIBLE 2.1, 4.2, 4.3, 5.6 | palette, trim sheet rows, `tx_mask` regions, the Pellam mark construction |
| `docs/research/blender-pipeline-code/*` | `common.py`, `artlib.py`, `materials.py`, `texbake.py`, `lightmap.py`, `cyclesutil.py`, `riglib.py`, `exportlib.py`, `preview.py`, `template_asset.py`, `optimize-glb.mjs`, `inspect-glb.mjs`, `dump-*.mjs`, `selftest.py` |
| `src/core/assets.ts`, `sandbox/viewer.html` (from `foundation-core`) | the real loader your files must survive; the viewer your previews use for the in-engine truth |

Environment: run Blender only as `tools/blender.sh -b --factory-startup --python-exit-code 1 -P <script> -- <args>`.
Cycles CPU is the default (20 threads); research found CUDA also works headless and OptiX
does not: `bake.use_cycles(device)` must return the device actually used and scripts must
not depend on a GPU. Blender point = game `(x, −z, y)`; export with `export_yup=True`.

## 4. Deliverables (checklist)

### 4.1 `blender/lib/` (the API every art script uses; document each function in its docstring)
- [ ] The modules and functions listed in `blender-pipeline.md` 11.1 (lift the "✔" prototypes, write the "new" ones): `scene`, `mesh` (incl. `finish(bevel, segments, smooth_angle, weighted)`, `delete_faces`, `join`, `tessellate_max_edge`), `uv`, `material`, `vcol`, `bake`, `rig`, `anim`, `export`, `budget`.
- [ ] `manifest.py`: `load()`, `asset(id)`, `texture(id)`, `owner_folder(owner)`, `piece_of(owner)` (shots folder name: `env_exterior` → `art-env-exterior`, `env_interior` → `art-env-interior`, `props_mech`/`props_dress` → `art-props`, `weapons` → `art-weapons`, `enemies` → `art-enemies`, `boss` → `art-boss`), `raw_path(id)` (`blender/export/<category>/<id>.glb`), `palette_uv(name)` and `emis_uv(name)` (cell centre UVs by palette colour name), `trim_v(sheet, region)` (V range of a trim row), `mask_uv(region)`.
- [ ] `layout.py`: `load()`, `to_blender(p)`, `solids(zone)`, `marker(id)`, `markers(zone, type)`, `sun()`, and `solid_mesh(solid)` building box / ramp (`rise`, `skirt`) / cylinder (`innerRadius`) exactly as `tools/layout_geom.mjs` defines them.
- [ ] `material.py`: `game_material(name)` for exactly `m_frontier`, `m_pellam`, `m_sand`, `m_flat`, `m_mask`, `m_emis`, `m_prop`, `m_gun` (named materials with back-face culling on; a preview node tree that shows vertex colour × the shared texture so Blender renders resemble the game; **no image is exported**: GLBs ship no textures).
- [ ] `vcol.py`: `compose_vertex_color` per ART_BIBLE 4.5 (base × lerp(1, AO, 0.8) × height ramp 0.75 → 1.10 × dust skirt (bottom 0.6 m, 60 % toward `sand`) × top bleach × per-face jitter ±6 % Frontier / 0 % Pellam), `streak_under(...)`, `emis_attr(ob, intensity, flicker_group, wrong_fade)` for `m_emis` (R, G, B), `bake_vertex_light(objs)` writing `tint × light ÷ 2` clamped to 1.
- [ ] `bake.py`: `bake_lightmap(...)` writing value ÷ `lightmapScale` (2), OIDN denoise through the compositor, `paint_neutral_texel(img, value)` (the 4 × 4 block at the top-left: white on a lightmap, black on a layer; margins kept out of it), `neutral_uv(texture_id)`, `set_vertex_lit_uv1(ob, faces, texture_id)` (points UV1 of vertex-lit faces at the neutral texel centre), `bake_light_layer(...)` (single-channel), `calibrate(key_target, ambient_target)` (the white test plane of ART_BIBLE 3: adjusts lamp and world strength until the plane reads the targets), `save_lightmap(img, texture_id)` to `blender/export/lm/<id>.png`.
- [ ] `zone.py`: `assign_chunks(objs, asset_id)` (each face to the chunk whose `box` or `part`/`solids` rule holds it; fails on a face in no chunk), `merge_chunks()` → meshes named `<chunk id>__<material>`, `embed_prop(asset_id, node, location, rot_z, material)` (imports the prop's raw GLB from `blender/export/`, placeholder or final, places it, folds `m_prop`/`m_flat` into the chunk's structure material with UV0 on the trim sheet's `flat` cell and the palette colour in `COLOR_0`, keeps it as a shadow caster, vertex-lights it in place), `copy_about_axis(objs, axis_point, n)` (the bore's six sectors, sharing lightmap UVs and vertex light), `dressing_empty(kind, n, asset, node, loc, rot_z, wind=0)` (`inst_<nnn>` / `brk_<nnn>` with extras), `lamp_set(name, quads)` (one `m_emis` mesh, lamp *i* has UV1.x = (i + 0.5)/N, extra `lampCount`), `collider_terrain(ob)`.
- [ ] `knot.py`: `build_knot(radius, collar='clustered'|'hex', seed)`: the shared knot of ART_BIBLE 6 (5–9 lobes of 20 tris round a central lobe ≥ 40 % of the diameter, husk-grey albedo `#8A8A92`, violet emissive cells, collar 1.3× in `steel_dark`), so three owners build it identically.
- [ ] `brand.py`: `pellam_mark(U, relief)` (six **open** discs radius 0.22 U at 30° + 60°n, stroke 0.08 U to (0, −2.10 U), solid seventh radius 0.28 U at (0, −2.38 U); box 2.44 U × 3.75 U), `numeral_mesh(text, height)` (geometry numerals with stencil bridges), `maker_plate()` (0.32 × 0.18 m, four rivets), `livery_band(...)`.
- [ ] `export.py`: `export_asset(asset_id, out, blend=None)`: the verified exporter call (`export_yup`, `export_apply`, `export_extras`, `export_vertex_color='ACTIVE'`, `export_all_vertex_colors=False`, `export_force_sampling=True`, `export_animation_mode='NLA_TRACKS'`, 30 fps, no images), preceded by an in-Blender self-check against the manifest (root named by id at the origin; every `nodes` / `bones` name present; `nodePos` within 0.03 m; clip names, loop flags and lengths within one frame; materials ⊆ manifest; `codeDriven` bones unkeyed) that raises with a readable list. `budget.assert_budget` against `triBudget`.

### 4.2 Tools
- [ ] `node tools/build-assets.mjs [--only <id|owner|piece>] [--placeholders] [--force] [--jobs n]`: **the one command.** Dependency order textures → props, weapons, enemies, boss → zones (zones depend on the raw exports of the props they embed and are rebuilt when those change) → optimise → check; skips outputs newer than their sources (`source` scripts, `blender/lib/**`, the design files); a manifest `source` ending in `.mjs` (`tools/gen_fx_atlas.mjs` for `tx_fx` / `tx_noise`, owner `render`) is run with `node <source> --out blender/export/tex` when the file exists, else the placeholder stays; `--only` accepts an asset or texture id, a manifest owner (`props_mech`, `render`, …) or a piece name (`art-props`); prints one line per asset (built / skipped / FAILED with the reason); non-zero exit on any failure. `npm run assets` runs it.
- [ ] `node tools/optimize-assets.mjs [ids…]`: exactly the chain of ARCHITECTURE 7.1: `dedup`, `weld`, `resample`, `prune({ keepLeaves, keepAttributes, keepExtras })`, remove every embedded image, `reorder`, `quantize` (normals 10 bit, UVs 14 bit, colours 12 bit), POSITION float32, `EXT_meshopt_compression`. **Never `join()`, never `instance()`.** Textures: `sharp` → WebP (lossy for colour, near-lossless for lightmaps and R8 data). Writes `public/assets/<category>/<id>.glb` and `public/assets/tex|lm/<id>.webp`. Refuses to overwrite a non-placeholder file with a placeholder.
- [ ] `node tools/check-glb.mjs [ids…|--all]`: fails when a shipped file breaks its manifest entry: triangles > `triBudget`; draw calls > `drawCalls` (one per non-emissive material + one per lamp set); material not in `materials`; a missing `nodes` / `bones` name (a manifest `nodes` name may be realised as an empty, **as a bone** of a rigid-skinned prop, as a variant / lamp-set / drawn mesh node, or as an animated empty with a child mesh: all are accepted; a name listed in both `nodes` and `bones` must be a bone; a `skinned: true` asset must contain a skinned mesh); a node with a `nodePos` or a hit role that is a mesh node; `nodePos` off by > 0.03 m; a clip missing, misnamed, with the wrong loop flag (first and last frames differ) or more than one frame from `seconds`; tracks on `codeDriven` bones; embedded images; `EXT_mesh_gpu_instancing`; zone files: meshes that are not exactly the chunk plan + `drawnNodes`, a chunk mesh outside its `box`, a `part: "high"` chunk within 3 m of the path's ground, dressing empties over the zone's allowance (`zones.<id>.dressing` tris / draw calls / allowed assets) or taller than 0.35 m on a nav link, `collider_terrain` more than 0.3 m off any nav node's ground or leaving a step over 0.35 m on a nav link; `lampCount` ≠ manifest; UV1 missing on `LM` meshes, vertex-lit vertices not on the neutral texel; **thin geometry** (every connected island longer than 0.5 m whose two smaller bounding dimensions are both under 3 cm fails unless its mesh carries `thin_ok: <metres>` and 2 mm per metre holds); for skinned assets every vertex weighted; lightmap images of the right size with the neutral texel painted. Prints file bytes per asset.
- [ ] `node tools/asset-status.mjs [--require=<0|1|2>] [--owner <o>]`: placeholders by owner and priority (assets and clips; a P2 clip that equals its `fallback` is reported as "fallback copy", not a failure); exits non-zero with `--require=0` while any P0 is a placeholder.
- [ ] `node tools/preview-asset.mjs <id> [--clip <name>] [--cycles] [--game]`: writes `shots/<piece>/<id>_sheet.png` (8-view Workbench turntable with vertex colours, about 0.5 s), per clip `shots/<piece>/<id>__<clip>.png` (frames at 0, 25, 50, 75, 100 %), with `--cycles` a lit beauty sheet, and with `--game` a frame from `sandbox/viewer.html?asset=<id>&shot=1` through the real loader with triangle and draw-call counts burnt in. Zones: `--zone` adds a dollhouse view (`--cull`), eye-level shots from each `vista_*` marker and each checkpoint marker of the zone, and a lightmap atlas image. `blender/tools/preview.py` is the Blender half (lift `preview.py`).
- [ ] `tools/inspect-glb.mjs`, `dump-attr.mjs`, `dump-anim.mjs` lifted from the research code.

### 4.3 Placeholders (`blender/placeholders.py`, driven by `build-assets --placeholders`)
- [ ] One file for **every** manifest asset (84) following ARCHITECTURE 7.3: `placeholder.shape` at `placeholder.size`, positioned by `placeholder.anchor`; flat category colour in `COLOR_0`; first material name; every `nodes` name as an empty at its `nodePos` (origin when it has none), lamp sets as small meshes with `lampCount` quads and indices in UV1; variant nodes as sibling child meshes; skinned assets (the creatures, the gun, `prop_share_cloth` and the 18 rigid-skinned multi-part props) with an armature holding every `bones` name, rigid-skinned to the first; a `nodes` name that is also in `bones` is made once, as the bone, at its `nodePos`; every clip with the right name, loop flag and length, moving the root (or first bone) visibly; root extra `placeholder: true`. Never overwrites a file whose root lacks that extra.
- [ ] **Zone placeholders = the greybox level** (`placeholder.source = "layout-solids"`, seven zones): the zone's layout solids through `layout.solid_mesh`, split into the manifest's chunks and materials (`meta.surfaces` maps surface → material), coloured by surface, vertex-lit by a fixed key so slopes and steps read, invisible / player-only solids omitted, seam solids (`sets`) included in `env_the_gallery`'s `chunk_gl_stair`, all `drawnNodes` present (`plug_door_tally` as a black panel in the Tally doorway), `collider_terrain` for `env_the_lip` built from its `terrain` solids. A lightmapped floor and a vertex-lit wall share one mesh in at least `env_tally_house` (the pipeline test needs it).
- [ ] **Collision check:** the game's colliders come from `src/core/greybox.ts`, yours from Python. `tests/pipeline/greybox.test.mjs` proves they agree: for each zone, vertex positions of the placeholder GLB's chunk meshes lie within 1 cm of the surface of the runtime collider set (sample ≥ 2 000 vertices), and at every nav node a downward ray onto the GLB's meshes returns the node's y within 2 cm.

### 4.4 Shared textures (final quality for the first six; they are the look)
Build to `blender/export/tex/<id>.png`, then WebP. Sizes, formats and region lists are `assets.json` `textures`; contents are ART_BIBLE 4.2 and 4.3. **Append-only contract:** a region or palette cell, once shipped, never moves.

| Texture | Size / format | You deliver |
|---|---|---|
| `tx_palette` | 256², RGBA sRGB, 16 × 16 cells of 16 px | **final**: every colour of ART_BIBLE 2.1 by name (ground/Frontier, Pellam, gun/Reeve families, UI-in-world), one cell each; the name → cell table exported as `blender/lib/palette.json` (also read by `manifest.palette_uv`) |
| `tx_palette_emis` | 256², RGBA sRGB | **final**: black except cells `flame`, `flame_core`, `aqua`, `aqua_core`, `violet`, `violet_core`, `violet_band`, `violet_band_core` |
| `tx_frontier_trim` | 1024 × 512, R8 | **final**: rows `plank_a` 64 px, `plank_b` 64, `plank_end` 32, `adobe` 128, `tin` 64, `strata` 96, `strap` 32, `cord` 32, plus the uniform 0.5 `flat` cell. Values 0.38–0.62 except seam lines (≥ 0.22). Tiles in U (`seam_error` < 2/255) |
| `tx_pellam_trim` | 1024 × 512, R8 | **final**: rows `panel` 128, `panel_rib` 64, `steel` 64, `floor` 128, `concrete` 96, `cable` 32, plus `flat` |
| `tx_sand` | 512², R8, tiles both ways | **final**: one-direction wind ripple (north-east to south-west), 4 m per repeat |
| `tx_mask` | 1024 × 512, R8, alpha-test 0.5 | **final**: all 19 regions of the manifest (`mark_cast`, `mark_brush_a/b/c` (c has five discs and a blob), `strike`, `numerals` 0–9, `wordmark` `PELLAM DEEPWORKS`, `station` `LIFT STATION 4`, `plate_lines` (the four lines exactly as in ART_BIBLE 4.3), `picto_daycell`, `picto_line`, `picto_charge`, `picto_misc` ×6, `tally` ×4, `family_marks` ×12, `grille`, `louvre`, `card_edges`, `card_dowser`); region rectangles exported as `blender/lib/mask_regions.json` |
| `tx_gun`, `tx_matcap_steel` | 1024 × 512 RGBA; 256² RGBA | **placeholder** (flat `gun_blue` with gloss 0.75 in alpha; a plausible matcap sphere). `art-weapons` makes them final |
| `tx_fx`, `tx_noise` | 1024 × 512 RGBA; 128² R8 | **placeholder** (labelled cells in the layout of ART_BIBLE 9.1; tiling value noise). `code-render` makes them final |
| the 8 lightmaps / layers | `lm_surface` 2048², `lm_tally` 1024², `lm_tally_hatch` 512² R8, `lm_gallery`, `lm_hall`, `lm_bore` 1024², `lm_bore_glow` 1024² R8, `lm_rim` 512² | **placeholder**: flat, displaying as mid-grey, neutral texel painted (white; black on the two layers) |

Trim-sheet UV mapping was **not prototyped** in research: prototype `uv.map_to_trim(ob, faces, sheet, region, metres_per_repeat)` and prove it in the reference asset below.

### 4.5 The reference asset and template
- [ ] `blender/template_asset.py`: the commented skeleton every art script starts from (argparse `--out --blend --seed`, `reset_scene`, try/except → `sys.exit(1)`, build, `compose_vertex_color`, materials, markers, `export_asset`, preview hook).
- [ ] Two worked examples in `tests/pipeline/fixtures/` that go through the whole command and are shown in the viewer: (a) a Frontier crate + Pellam panel pair (trim mapping, bevel, vertex colour, knot, mark) to prove "no primitive look" is reachable with the library; (b) a 6 × 4 m test room with a lightmapped floor, a vertex-lit wall in the same mesh, one lamp set, one embedded prop and a light layer.

## 5. Tests (`tests/pipeline/`, `node --test tests/pipeline/`)

- [ ] `pipeline.test.mjs` (ARCHITECTURE 11.4's `pipeline.test.mjs`, in `tests/pipeline/`): (a) `COLOR_0` 0.02, 0.5, 1.0 survives optimise + the real loader within 1/4096; **if it does not, take `COLOR_0` out of the quantise pattern (float32) and say so in the report**; (b) fixture room: UV1 present after the loader, wall vertices on the neutral texel, a screenshot where the wall shows vertex light and the floor its lightmap; (c) every manifest node of three sample assets resolvable through `AssetInstance.node()`, `nodePos` within 0.03 m; (d) no file contains `EXT_mesh_gpu_instancing` or an embedded image; (e) a clip authored at 0.30 s plays for exactly the manifest's seconds through `AssetInstance.action()`.
- [ ] `placeholders.test.mjs`: `check-glb --all` passes on the placeholder set; `asset-status` lists 84 placeholder assets; all 18 textures exist with manifest size and format.
- [ ] `greybox.test.mjs` (4.3). `checkglb.test.mjs`: mutation tests: at least twelve deliberately broken fixtures (over budget, missing node, wrong clip length, thin island, chunk outside its box, mesh-node gameplay position, embedded image, instancing extension, unweighted vertex, missing neutral texel, dressing over allowance, wrong lamp count), each caught.
- [ ] `determinism.test.mjs`: the same script and seed gives a byte-identical raw GLB twice.
- [ ] `textures.test.mjs`: trim rows tile; value ranges hold; the mark in `tx_mask` matches `brand.pellam_mark` within 2 px; every palette colour within ΔE 2 of ART_BIBLE 2.1.
- [ ] Re-run `node --test tests/core/` with your files in `public/assets/`: `boot`, `walk`, `seam`, `budget`, `determinism` still pass. A failure caused by core goes to `docs/requests/foundation-pipeline.md` with a repro; do not edit `src/core/`.

## 6. Definition of done (measured)

1. `node tools/build-assets.mjs --placeholders --force` completes from an empty `public/assets/` and `blender/export/`; report wall time (target under 10 minutes) and the time of a no-op rebuild (target under 5 s).
2. All tests of section 5 pass; `npx tsc --noEmit` reports nothing in your files.
3. Total size of `public/assets/` with placeholders reported; the six final shared textures total under 1.0 MB as WebP.
4. `shots/foundation-pipeline/`: `greybox_<zone>_sheet.png` × 7, `greybox_<zone>_game.png` × 7 (through the viewer), `tx_<id>.png` for the six final textures plus a 2 × 2 tiled preview of each trim sheet and `tx_sand`, `palette_named.png` (cells with names), `mask_regions.png`, `fixture_crate_panel_sheet.png` and `_game.png`, `fixture_room_game.png`, `knot_sheet.png`, `mark_sheet.png`, one clip strip of a skinned placeholder. Open each before citing it.
5. A report listing: the 12-bit colour verdict; the R8/WebP verdict as seen from your side; bake timings (a 1024² lightmap at the sample count you recommend; AO-to-vertex for a 2 500-triangle prop); every `lib` function that is new and not exercised by a test; anything not verified.

## 7. Non-goals

No final art for any manifest asset (placeholders only; the two fixtures are not manifest
assets). No runtime code. No changes to the manifest or the layout (requests only). No
`tx_fx` / `tx_noise` drawing, no final `tx_gun`. No in-file instancing, no KTX2, no new
Python packages (numpy ships with Blender), no audio.

## 8. Dependencies

- `foundation-core` is finished before you start: use its asset store, viewer and harness as
  they are. Your files replace its runtime-synthesised placeholders transparently.
- Six art pieces depend on you for everything. What they will do with your work is in their
  orders (`docs/workorders/art-*.md`): read one (`art-props.md`) before you design the
  library API, and make the template run that order's first asset in under 60 lines.
