# Requests from `foundation-pipeline`

**Status (integrator pass before phase 3).**

| # | Status | Where it lives now |
|---|---|---|
| 1 | RESOLVED | `.gitignore` (FOUNDATION_REPORT 8) |
| 2 | RESOLVED | `package.json` scripts (FOUNDATION_REPORT 8; ARCHITECTURE 18) |
| 3 | RESOLVED | `index.js` per test directory: ARCHITECTURE 11 and 18, work-order README 4 |
| 4 | OPEN, level owner (`design/layout.json` is not a document) | ARCHITECTURE 18 "Chunk-box tolerance 0.75 m" |
| 5 | RESOLVED | `sandbox/viewer.html?overlay=` (ARCHITECTURE 11.1) |
| 6 | RESOLVED: accepted | ARCHITECTURE 18 "`check-glb` readings"; (c) superseded by row 7 |
| 7 | RESOLVED: 7.2 and the section 18 row reworded to "one per mesh primitive" | ARCHITECTURE 7.2 (draw-call bullet) and 18; `art-props` 3 and the "pipeline as built" bullet of every art order |
| 8 | DOCUMENT PART RESOLVED: the orders state the sockets and the bones they ride (`art-weapons` 3, `art-boss` 3; `art-enemies` 3 already did). The manifest entries (`nodePos` / `nodeParent`) are OPEN with the architecture owner: `design/assets.json` was not edited | `art-weapons` 3, `art-boss` 3 (with the note that `canister_muzzle` is a guess) |
| 9 | RESOLVED in code (core round 2) | FOUNDATION_REPORT 8d |
| 10 | RESOLVED | work-order README 3 (the generated tables in `blender/lib/` are owned with the texture scripts; an append rebuilds nothing) |
| 11 | OPEN, manifest (`design/assets.json` was not edited); harmless: the shipped placeholders are right | — |
| r3: `preview-asset --textures` writes to `shots/foundation-pipeline/` | RESOLVED in the orders (pass `--piece`) | README 1.1; `art-weapons` 5; both env orders; `code-render` 4.8 |
| r3: `tx_noise` needs `.toColourspace('b-w')` | RESOLVED | `code-render` 4.8 |
| r3: `LM` mesh never vertex-lit, 256-spp vertex light, skipped lightmap, bake warnings only in the log | RESOLVED as warnings in the orders (the code is the pipeline owner's) | `art-env-exterior` 3, `art-env-interior` 3, the "pipeline as built" bullet of the other art orders |
| r3: the shared `lm_surface` recipe is unbuilt; tin row and seam floor of `tx_frontier_trim` | RESOLVED in the order | `art-env-exterior` 3 ("build the three-script skeleton first"; the two texture defects) |

1. **`.gitignore`** (foundation / integrator): add `tests/pipeline/fixtures/export/` (raw fixture exports, stamps, logs:
   generated, like `blender/export/`). `tests/pipeline/fixtures/public/` is small (about 240 kB) and may be committed or
   ignored: the tests rebuild it.
2. **`package.json` scripts** (frozen; integrator's call): `"assets:placeholders": "node tools/build-assets.mjs --placeholders"`,
   `"test:pipeline": "node --test \"tests/pipeline/*.test.mjs\""`, `"check:assets": "node tools/check-glb.mjs --all"`.
3. **`node --test tests/<dir>/` does not work on this Node (v24.21)**: a directory argument is treated as a module
   ("Cannot find module"). Use a glob: `node --test "tests/pipeline/*.test.mjs"`. `docs/workorders/README.md` section 4
   and ARCHITECTURE 11 state the directory form.
4. **Layout / manifest (level owner, architect)**: the gallery's shaft walls (`gl_shaft_wall_w` and neighbours) poke 0.5 m
   out of `chunk_gl_stair`'s box (z −18.5) into a height range no chunk box holds (y > −6 in `chunk_gl_bay`). The
   placeholder assigns such faces to the nearest box and `check-glb` tolerates 0.75 m; widening `chunk_gl_stair`'s box to
   z −18 (or moving the walls) would let the tolerance go back to 0.25 m.
5. **Viewer (foundation-core)**: `sandbox/viewer.html` shows manifest assets only. The two pipeline fixtures are shown
   through the same loader by `tests/pipeline/fixture_view.html` (it constructs `AssetStoreImpl` with the fixture
   overlay). An `?overlay=<manifest url>` parameter on the viewer would make that page unnecessary.
6. **`check-glb` reading of the spec (architect, for the record)**: (a) a lamp set that has a `nodePos` (`loop_rim`,
   `listen_lamps`) is a mesh node whose ORIGIN sits on the `nodePos` (POSITION stays float32, so the optimiser does not
   move mesh nodes); every other `nodePos` / hit-role name must be an empty or a bone. (b) "tracks on codeDriven bones"
   is enforced as "no motion": the exporter writes constant rest-pose tracks for every bone, and those pass.
   (c) draw calls = distinct non-emissive materials + `m_emis` meshes (variants are not multiplied).
7. **Draw calls (architect; ARCHITECTURE 7.2 and section 18 "`check-glb` readings")**: the documents say "one per
   non-emissive material plus one per lamp set". The runtime joins nothing, so two meshes sharing a material are two
   calls. `check-glb` and `export.check_scene` now count **one per mesh primitive**, variant nodes (manifest `nodes`
   realised as plain meshes, shown one at a time) counted as the largest one; zones unchanged (one per planned mesh).
   All 84 placeholders pass under the new rule. Please reword 7.2 and row "`check-glb` readings" (c) of section 18.
8. **`nodePos` / `nodeParent` for the weapon and the creatures (level / architecture owner, `tools/gen_assets.mjs`)**:
   `weapon_revolver`, `enemy_bider`, `enemy_transit`, `enemy_tamper` and `boss_windlass` have no `nodePos`, and the
   manifest does not say which bone a socket rides. Until it does, `blender/placeholders.py` carries the table (`RIGS`:
   bone heads with parents, sockets with the bone they ride, from art-weapons 4.1, art-enemies 4.1 / 4.3, art-boss 4.1 /
   4.2) and `tests/pipeline/placeholders.test.mjs` holds the placeholders to it. Both tools already honour the
   manifest when it has the fields: `nodePos` wins over the table, and a `nodeParent: { socket: bone }` map is checked
   by `export.check_scene` and `check-glb` (mutation test 23). Requested entries (asset-local game space, front +Z; the
   revolver in camera space): revolver `muzzle` (0.075, -0.070, -0.56) on `gun`, `eject` (0.13, -0.085, -0.305) on `gun`,
   `cam_look` (0, 0, -12) on `root`; Bider `crown` (0, 1.34, 0.21) on `head`, `hand_socket_r` (-0.27, 0.50, 0.20) on
   `hand_r`; Transit `lens` (0, 1.62, 0.17) and `stake_muzzle` (0, 1.46, 0.18) on `head`; Tamper `vent_chest_knot`
   (0, 1.70, 0.45) and `vent_back_knot` (0, 1.60, -0.45) on `barrel`, `ram_head` (-0.80, 0.45, 0.35) on `arm_r_ram`,
   `foot_spark` (-0.38, 0.02, 0.22) on `leg_r_foot`; Windlass `knot_n_hit` on the r = 1.7 ring round the hub (0, 4.0) at
   z 2.8 and `thread_anchor_n` on the same ring at z 3.1, both on `drum_spin`; `pawl_l_hit` / `pawl_r_hit`
   (-/+1.6, 6.0, 2.6), `muzzle_top` (0, 5.7, 3.1), `canister_muzzle` (0, 4.0, 3.1: a guess, the documents give no
   number) on `arm_yaw`. The art orders should state the same parents (art-enemies and art-boss already do in prose).
9. **Viewer zone page under `?test=1` (foundation-core)**: its panel's `frame` line is written by the rAF loop, which
   does not run in test mode, so it reads `0 calls ... 0 tris`. `tools/preview-asset.mjs --zone --game` measures with
   `__dbg.perfRun(4)` and writes that line itself before the screenshot; `say()` on a drawn `step` would make that
   unnecessary.
10. **`docs/workorders/README.md` section 3 (producer)**: it should say that `blender/lib/palette.json`,
    `tx_*_trim.json` and `mask_regions.json` are generated by the texture scripts and owned with them (the one
    exception to "nobody edits `blender/lib`"), and that an append rebuilds nothing (the driver hashes the entries an
    asset read). `blender/lib/README.md` says so now.
11. **`placeholder` boxes of `weapon_revolver` and `boss_windlass` (manifest)**: the manifest's `placeholder` (a 0.3 x
    0.3 x 0.6 box centred on the camera; a 5 x 13 x 5 cylinder on the bore axis) is what core synthesises when a file is
    missing. The shipped placeholder files instead put the gun box at the idle placement (in front of, below and to the
    right of the camera, muzzle at its -Z end) and the Windlass body at the drum (1.5 .. 6.5 m up, 0.9 .. 2.7 m out,
    riding `drum_spin`). The manifest entries could follow.


## Round 3 (pipeline fixer): what the code does now, and the document lines it makes untrue

The pipeline issues of `docs/requests/foundation-r3-issues.json` are fixed **in code** (`blender/lib`, `tools/*.mjs`,
`blender/tex`, the fixtures; tests in `tests/pipeline/`). The orders were given warnings for those issues while the code
was still open (the `r3:` rows of the table above); those warnings now describe behaviour that no longer exists. The
pipeline does not own the documents: the sentences below are for the document owner / integrator.
`blender/lib/README.md` is current and is the text to copy from.

| # | Document line (as it reads today) | What is true now |
|---|---|---|
| R3-1 | `art-env-exterior` 3 and `art-env-interior` 3: "**A mesh stamped `LM` is not covered by that guard** … the build passes and ships tint × 2" (and the same in the "pipeline as built" bullets) | Covered, per face. `vcol.bake_vertex_light` marks the faces it lit; `zone.merge_chunks` RAISES (naming the objects) and `export_asset` fails a standalone mesh for every face shown at COLOR_0 × 2 without the mark: all faces of a `VL` mesh and the neutral-texel faces of an `LM` mesh, also after a `faces=`-restricted bake. A face that was never given a lightmap UV fails too. Tests: `tests/pipeline/guards.test.mjs` |
| R3-2 | the same sections: "**A lightmap your script did not write in this run is reported `skipped` … with exit 0** … Treat a `skipped lm_*` line as a failed build" | It IS a failed build now: `FAILED <id>: its lightmap <lm> was not written in this run …`, nothing ships. `--allow-stale-lightmap` ships it while iterating and prints `STALE LIGHTMAP <lm>` on the asset's line. For `lm_surface` (a bake script of its own): `STALE lm_surface …` and exit 1 when a zone is rebuilt and the stale lightmap is not part of the run |
| R3-3 | the same sections: "**Vertex-light samples**: the library's recommendation (256 spp …) is under-sampled … Use `samples=2048` to `4096`" | The default of `vcol.bake_vertex_light` is 2048 and every bake runs with Cycles' light tree off, which halves the noise at equal samples: fixture room 3.4 % mean error at the default (was 21 % at the old recommendation), 2.4 % at 4096 (3.3–5.3 s for the room). 256 while iterating, the default to look at, 4096 for a final interior; an exterior under sun and sky alone is clean at 256 (0.3 %). The table is in `blender/lib/README.md` |
| R3-4 | every art order, "bake warnings … are **only** there [in the log] or under `--verbose`: read it after every bake" | The build line counts them: `built <id> … (2 warnings: see blender/export/.logs/<id>.log)`. Still read the log when the count is not zero |
| R3-5 | work-order README 1.1 last bullet and the "Previews" bullet of the three split orders: "pass **`--piece <piece name>`** on every preview"; `art-env-*` 3: "`--textures` writes into `shots/foundation-pipeline/` unless you pass `--piece`" | `preview-asset.mjs` (and `export.preview`) choose the folder of the PIECE that builds the id, split pieces included (`tools/pipeline-lib.mjs` `pieceOf`: `enemy_tamper` → `shots/art-boss-tamper/`, `tx_palette` → `shots/art-props-mech/`, `tx_gun` → `shots/art-weapons/`). No flag is needed; `--piece` still overrides. `--textures` with no id writes the six-texture overview to `shots/foundation-pipeline/` |
| R3-6 | work-order README 1.1 "**Build only your own ids** … not `--only enemies` / `--only boss` / `--only art-props`" and "`art-props-dress` builds by asset id, not `--only props_dress`" | Still true for owners and order names, but the PIECE names now select exactly one builder's ids: `--only art-boss-tamper`, `--only art-enemies-bider`, `--only art-props-dress` (29 assets, no texture), `--only art-props-mech` (28 assets + `tx_mask`, `tx_palette`, `tx_palette_emis`). `asset-status` lists one row per piece and takes `--owner <piece>` |
| R3-7 | `art-env-exterior` 3: "**`tx_frontier_trim` (yours from phase 3)**: two defects … clamp seam lines at 57 / 255 … redraw the [tin] row in place" | Both done in the foundation's version. Stored values are 58…157 / 255 in the PNG and 57…158 in the shipped WebP (`texdraw.finish_detail` keeps one code of headroom; `tx_pellam_trim` too), and the test holds raw and shipped to 0.22…0.62 exactly. The tin row is 12 soft bars per 1.0 m sheet, running ACROSS the row (constant along V, 21 px each), so a tin surface of any height may stretch the row; U must run across the corrugations. **ART_BIBLE 4.2 could say so**: "tin 64 (0.8 m; corrugation as 12 soft bars per 1.0 m sheet, running across the row)" |
| R3-8 | `art-env-exterior` 3: "The shared 2048² `lm_surface` … is a written recipe" | Built and tested in small: `tests/pipeline/shared_atlas.test.mjs` (two zone scripts + one bake script over one helper module through the driver). `blender/env_exterior/README.md` has the result and still says: build the real three-script skeleton from layout solids on day one. Not done: a 2048² bake of 50 000 triangles |
| R3-9 | `code-render` 4.8: `.toColourspace('b-w')` | Unchanged and right; the optimiser's FAILED message now names the cure as well |
| R3-10 | FOUNDATION_REPORT 4 step 3: "`<id>_sheet.png` (8 Workbench views)"; section 6 "Recommended sample counts: … 256 spp for the final vertex light"; section 9 "The `VL` mark is per object … a warning does not fail the build and is only in the log" | Sheets are fitted per view (about 10 % margin); a room or zone is a dollhouse (back faces culled, `--cycles` shows the baked light); `--zoom / --angles / --elev / --bounds` frame close-ups. Vertex light: default 2048, 4096 final interior (table in `blender/lib/README.md`). The mark is per FACE and the guard fails the build; warnings are counted on the build line |
| R3-11 | `art-props` / `art-boss` / any order that states a hinge sign, and `art-boss` 6 item 6 | `anim.key_pose`'s docstring and `blender/lib/README.md` now state the convention (right-hand rule about the bone's head → tail; a hinge bone along +X: a positive angle lowers what is in front of the hinge). The template's flap had the wrong sign (it kicked into the chute) and is corrected |

Nothing here needs a manifest change. `design/*.json`, `docs/ART_BIBLE.md`, `docs/FOUNDATION_REPORT.md` and the orders
were not edited by the pipeline fixer.

## Art integrator, polish round 2 (2026-10-04): what was decided on the rows above

| Row | Decision |
|---|---|
| 4 (chunk-box tolerance), 8 (`nodePos` of the creatures), 11 (placeholder boxes of the revolver and the Windlass) | **CLOSED without change**: all 84 assets are final files; the manifest's placeholder fields no longer describe anything that ships |

## Code integrator, polish round 2 (2026-10-04): what was decided on the code-side rows

| Row | Decision |
|---|---|
| four `tests/pipeline` tests written against placeholder files | **REWRITTEN**: they build placeholder copies of `env_tally_house`, `env_the_lip` and `prop_crate` into the fixtures folders through an overlay manifest (`tests/pipeline/common.mjs` `buildPlaceholderCopies`); `fixture_view.js` takes `?overlay=<path>`. 83 pass, 0 fail |

