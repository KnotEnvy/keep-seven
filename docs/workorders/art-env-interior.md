# Work order: `art-env-interior`

Phase 3 (production, round 1). Manifest owner name: **`env_interior`**. You are a fresh agent:
this file plus the documents it names are everything you need.

Read first: `CLAUDE.md`, `docs/PLAN.md`, `docs/workorders/README.md` (**section 4, "Read first":
`docs/FOUNDATION_REPORT.md` sections 2 to 4, 6, 8c and 9, and `blender/lib/README.md`**: the
build driver, the viewer and the checks as they are now), `blender/env_interior/README.md`;
`docs/ART_BIBLE.md`
sections 1, 2, 3 (3.3–3.6 are yours), 4, 5 (5.5 and 5.6 above all), 7.1, 7.3, 12;
`docs/ARCHITECTURE.md` 7 (all of it; **7.2, 7.4, 7.5, 7.6 win over the art bible**) and 3.6
(the seam); `docs/LEVEL.md` 0, 3, 4, 5, 6 and `docs/level-map.png`; `docs/GDD.md` 8 (arena),
9.4–9.7, 13.2–13.4; then `blender/template_asset.py`, the docstrings of `blender/lib/`, and
`docs/research/blender-pipeline.md` "twelve things", section 5 (lightmaps) and "Traps".

## 1. Mission

You build the four rooms where the story turns and the fights happen: a dark civic hall with
eleven hooded figures at a table and three hairlines of sun; a stair of coat pegs dropping
into a cold ceramic gallery whose aqua strips recede to a point; a 12 m machine hall of ten
ribs; and the round bore chamber where the boss hangs over a violet shaft, which must turn
aqua from the bottom up when the kept round is fired. Underground there is almost no
runtime lighting: **your bakes are the lighting** (pillar 5), and your rooms carry pillar 2
("Old-World machinery still working for nobody": exact, over-scaled, identical, on a 1.2 m
module) and pillar 3 (the tally wall, the bare low pegs, the empty cradle's wall, the
diagram). Three of the four puzzles are staged against your walls, to the centimetre.

## 2. Owned files (exclusive)

```
blender/env_interior/**      env_tally_house.py  env_the_gallery.py  env_lift_hall.py  env_the_bore.py
                             env_lift_shaft.py  + your own helper modules
blender/tex/tx_pellam_trim.py   later revisions only, append-only
tests/art_env_interior/**
shots/art-env-interior/**
docs/requests/art-env-interior.md
public/assets/env/{env_tally_house,env_the_gallery,env_lift_hall,env_lift_shaft,env_the_bore}.glb
public/assets/lm/{lm_tally,lm_tally_hatch,lm_gallery,lm_hall,lm_bore,lm_bore_glow}.webp
                             written only by `node tools/build-assets.mjs --only env_interior`
```

Never edit `blender/lib/`, `design/*.json`, `tools/`, `src/`, or another owner's files.
Requests go to your request file.

## 3. Rules that bind every art piece (short form; ARCHITECTURE 7.2 is the full text)

- **The pipeline as built** (FOUNDATION_REPORT 4, 6, 8c and 9; `blender/lib/README.md`; `blender/env_interior/README.md`):
  - Nothing ships until the build passes: a `FAILED <id>` leaves the previous files in place. The Blender log is `blender/export/.logs/<id>.log`; bake warnings (`WARNING <object>: N faces … baked dark from end to end`) are **only** there or under `--verbose`: read it after every bake.
  - **Draw calls are counted one per mesh per material**; a zone ships exactly its planned chunk meshes, drawn nodes and plugs.
  - **A mesh stamped `VL` must have been vertex-lit** (`vcol.bake_vertex_light` marks it; `export.check_scene` fails otherwise). **A mesh stamped `LM` is not covered by that guard**: forget the vertex bake on the vertex-lit faces of a mixed chunk (the neutral-texel faces), or light only some of the objects, and the build passes and ships tint × 2: blown-out white walls beside a correctly lit floor. Every zone is a mixed chunk. Call `bake_vertex_light` on every object that has a vertex-lit face, and **open the `<id>_game.png` after every bake**: that frame is the only check.
  - **A lightmap your script did not write in this run is reported `skipped … did not write it in this run` with exit 0**, and the GLB (with its new UV1) ships pointing at the old or placeholder lightmap. Treat a `skipped lm_*` line as a failed build.
  - **Vertex-light samples**: the library's recommendation (256 spp for the final vertex light) is under-sampled for a closed interior: the round-3 critic measured about 21 % per-vertex noise at 256 spp in the fixture room (walls visibly mottled) and clean gradients at 4096 spp, which cost 4.0 s for 2 348 faces. Use `samples=2048` to `4096` for final vertex light indoors and compare a frame at both; lightmaps and light layers stay at 64 spp + OIDN.
  - **Bake times** were measured on a 6 × 4 m room only (1024² lightmap 7.5 s, 2048² 44 s, the whole zone build 90 s; CPU); nobody has baked 50 000 triangles under a real sun. Iterate at a reduced size or sample count and keep the full-size bake for final passes: the machine is shared.
  - **Dressing empties** reach the runtime as `Object3D` children of the zone root named `inst_<nnn>` / `brk_<nnn>` with `userData.asset`, `userData.node` (a variant, when the asset has one) and `userData.wind`; the placeholder zones already carry two or three (FOUNDATION_REPORT 5). Nothing instantiates them until `code-world` lands; `check-glb` holds them to the allowance.
  - `tools/preview-asset.mjs <texture id> --textures` writes into `shots/foundation-pipeline/` unless you pass **`--piece art-env-interior`**.
- **Judging colour**: the viewer (`sandbox/viewer.html?zone=<id>`, and every `<id>_game.png`) shows linear values up to 0.8 exactly as authored and rolls off only above that, and the game's renderer uses the same curve (README ruling 15). A display target measured in the viewer is therefore the file's colour below 0.8 linear (sRGB 231); a brighter one (lit sand) is slightly compressed by the shoulder: measure those on the Cycles preview and say which frame each number came from. The viewer is unlit beyond the baked light: no fog, sky or grade until `code-render` lands.
- **`tamper_cold_static`** comes from the piece `art-boss-tamper`, embedded props from `art-props-mech` / `art-props-dress`, cartridges from `art-weapons` (README section 1.1): you import whatever raw export is in `blender/export/` (placeholder or final) and write requests to that piece's file.
- One script per asset, run through `tools/blender.sh … --python-exit-code 1`; build with **`node tools/build-assets.mjs --only env_interior`** (export → optimise → `check-glb`). Deterministic (`random.Random(seed)`).
- Game space +Y up, −Z north; Blender point = game `(x, −z, y)`. **Zone GLBs are authored in world coordinates.** Every position and opening size comes from `design/layout.json` via `blender/lib/layout.py`.
- **Materials are names only.** Zone chunks use at most `m_pellam`, `m_frontier`, `m_mask`, `m_emis` as their chunk plan lists. `m_flat` and `m_prop` never occur in a zone GLB. No images in a GLB. UV0 = shared texture (trim row / `flat` cell / mask region); UV1 = lightmap UV, or lamp index on `m_emis`.
- **Chunk plan is law** (section 4): meshes named `<chunk id>__<material>` plus the listed drawn nodes; every face inside its chunk `box`.
- **Baked light.** Lightmap stored value = Cycles diffuse light (direct + indirect, no colour) ÷ 2. Lightmapped vertices: `COLOR_0` = tint × AO. Vertex-lit vertices: `COLOR_0` = tint × light ÷ 2, UV1 on the lightmap's neutral texel (white 4 × 4 block, top-left). Light layers (`lm_tally_hatch`, `lm_bore_glow`) are single-channel on the same UV1 with a **black** neutral texel. Use `blender/lib/bake.py`; calibrate with `bake.calibrate` (a white test plane must read the mood's targets).
- **Lamp sets**: any `m_emis` mesh named in the manifest's `lampSets` is one draw call of N lamps; lamp *i* has UV1.x = (i + 0.5)/N on all its vertices; mesh extra `lampCount`. `COLOR_0` on `m_emis`: R intensity, G flicker group (0 steady, 0.5 flicker, 1 off until triggered), B `wrong_fade` participation.
- **Copies, not instances**: the bore's six sectors, the gallery's modules and the Tally chairs are baked once, copied by `zone.copy_about_axis` / the script and merged. No `EXT_mesh_gpu_instancing`.
- **Embedded props**: `zone.embed_prop` from `blender/export/` (placeholder or final), cast in the bake, vertex-lit in place, folded into the chunk's structure material.
- **Dressing**: `inst_<nnn>` / `brk_<nnn>` empties with extras `{ asset, node, wind? }` within the zone's allowance; nothing over 0.35 m on a nav link.
- **Thin geometry**: ≥ 2 mm per metre of viewing distance. Pipe banks, peg rails, cables, the grille catwalk, aqua strips and rails are the items this bites: fatten, use `m_mask` `grille` / `louvre` cards, or drop.
- **Collision is the layout's.** Wall faces ±0.25 m at most; do not move doors, cover, ribs, the kerb, or anything on the puzzle lines.
- Pellam language: orthogonal + true circles, radii 0.15 / 0.3 / 0.6 m only, 20 mm bevel, no jitter, 1.2 m panel module, livery band 10 cm at 1.2 m, kick plate below 0.3 m, hazard = one broad ochre diagonal. Decay = a missing module, a stain below a seam, never a lean. The Tally House is Frontier (adobe, off-square, jittered) with one Pellam intrusion (the hatch frame and conduit).
- Homage, not copy: the hall is **strictly civic**: no altar, pulpit, pews, lectern or religious furniture. No in-world text beyond `tx_mask` regions and geometry numerals. No 19, 99, or decorative sixes / sevens beyond what is listed here.
- Priorities: tally, gallery, hall, bore are **P0**; `env_lift_shaft` is **P1**: do not start it until the four P0 zones pass `check-glb` and have final bakes.

## 4. Deliverables

### 4.1 `env_tally_house` — 17 000 tris, 4 draw calls, lightmaps `lm_tally` (1024², ~24 texels/m) + layer `lm_tally_hatch` (512² R8)

One chunk `chunk_ty_hall` (`m_frontier`, `m_pellam`, `m_mask`; box x −97..−81, y −1..6, z −38..−14) + drawn node **`strip_hatch`** (lamp set of 1, `m_emis`, G = 1.0 off until triggered).

- [ ] Hall interior x −96..−82, z −37..−15: **adobe walls 5.0 m under a flat roof**: round vigas 0.2 m running E–W under a board deck, spaced so none crosses a blade path, and one squared **tie-beam** (0.25 m) spanning E–W at z −32.8 over the hatch. `adobe_base` to 0.4 m. Plank floor (boards N–S, 0.2 m, two lifted).
- [ ] **South wall**: door opening 1.6 × 2.4 m (x −89.8..−88.2); east of it the **tally wall**: a dark board x −88..−82, y 0.4..3.2, wrapping 1.6 m onto the east wall, chalk tallies by household (`family_marks` then `tally` bundles of five; the last four rows the shaky variant, then none), **the last four days written exactly where the south blade lands: a 1.2 × 0.9 m patch centred (−87, 1.327, −15)** (`prop_tally_wall.params.sunPatch`).
- [ ] **East wall**: the hearth: an adobe chimney breast 1.2 D × 3.4 W × 2.6 H at z −20..−16.6 with a raised hearthstone 1.4 × 3.4 × 0.3 m; embedded `prop_camp_ash` / `ash_cold` in the firebox. At z −28 the barred front doors (2.4 × 2.6 m) with three embedded `prop_bench` stacked against them.
- [ ] **West wall**: three shutter openings **1.2 W × 0.9 H, 4.05–4.95 m up, centred z −24, −30.5, −36.3** (read `shutter_s/m/n`), in deep splayed reveals, each with a latch seat at 3.5 m beneath it. Around each shut opening a **15 mm hairline of sun**, baked as a thin lit streak on the surface its blade will land on.
- [ ] **North-west**: a rectangular Pellam ceramic frame 0.3 m wide with 0.15 m corner radii, flush in the floor round the **4 × 2 m opening x −93..−89, z −34..−32** (the leaves are a prop). The **latch block and its cowl** are zone geometry at the layout solids `ty_latch_cowl_back / _w / _e / _hood` (1.4 × 0.5 m, 1.5 m high, open to the **north** only; the knot seat at (−92.6, 0.9, −34.35) facing north). **Do not open the cowl to the south or the sides** (it keeps the risers 14.3 m from the shooter); keep 2.4 m of clear floor between it and the north wall.
- [ ] A Pellam conduit from the day-cell hanger along the tie-beam, down the west wall at z −32.8 and across the floor to the hatch frame, carrying **`strip_hatch`**; on the conduit at 1.5 m (−95.95, 1.5, −32.8) the **pictogram plate** (`picto_daycell` on `m_mask`).
- [ ] Embedded: `prop_tally_table` (footprint x −89.7..−88.3, z −29.6..−18.6; the dragged fifth leaf, 2.6 × 1.4 m, lying at an angle against the north wall at (−84.6, −35.6), is **zone geometry you model** at the layout solid of `tally_table_end`, in the table's plank style: boards 0.2 m, `board` / `board_bleached`, 8 mm bevel), **eleven `prop_chair`** (nine at `prop_tally_seated.params.seats`, two at `sp_tally_riser_w` (−90.15, 0, −19.6) and `sp_tally_riser_e` (−87.85, 0, −20.5)), `prop_head_chair` at (−85.5, 0, −20) facing the seated, `rd_ledger` at (−89, 0.82, −29.2), `rd_note` / `note_hearth` on the hearthstone. Nothing over 1.3 m in a blade path; rafters above 4.95 m on the blade lines.
- [ ] **Bake, mood L2**: ambient `#3A2A30` × 0.25 at floor level (warm brown-black; shadows `#2E222B`, never neutral); one lantern at (−89, 0.95, −18.9), flame `#FF9433`, baked radius 3.5 m; the hairline streaks; sun bounce warming the ceiling over each shutter. `lm_tally` covers the floor, walls to 3.2 m (the whole tally wall), table top and benches; above is vertex-lit. **`lm_tally_hatch`**: greyscale up-light from the hatch frame alone, radius 5 m, strong enough that a hood at 6 m reads `#4A7F86` when tinted aqua at weight 1 (this layer is the Reduce-Flashes fail-safe for the dark fight: GDD 13.2).
- [ ] Dressing allowance: 2 000 tris, 3 draw calls, assets `prop_lantern`, `prop_bottle`, `prop_sack`.

### 4.2 `env_the_gallery` — 32 000 tris, 10 draw calls, lightmap `lm_gallery` (1024², 16–20 texels/m)

| Chunk | Tris | Materials | Holds |
|---|---|---|---|
| `chunk_gl_stair` (x −95..−83, y −13..0, z −36..−18.5) | 6 000 | `m_pellam`, `m_emis` | three flights, two landings, the niche. **Contains the seam** |
| `chunk_gl_bay` (x −95..−81, y −13..−6, z −18.5..−9) | 6 000 | `m_pellam`, `m_mask`, `m_emis` | the proving bay |
| `chunk_gl_gallery` (x −81..−18, y −13..−6, z −19..−9) | 20 000 | `m_pellam`, `m_mask`, `m_emis` | the 62 m gallery |

Drawn nodes: **`strip_flicker`** (lamp set of 1: the one-in-eight strips, G = 0.5, **excluded from the bake**), **`violet_hairline`** (lamp set of 1: a 2 cm × 3 m emissive strip under the baffle door, `violet` cell, B = 1).

- [ ] **Peg stair**: 2 m wide, 12 m down, cast concrete, 0.3 m risers drawn over the 33.7° ramp colliders. Flight 1 east x −93 → −87 (y 0 → −4, z −34..−32); landing 1 at (−86, −4, −33); flight 2 south z −32 → −26 (y −4 → −8); landing 2 z −26..−24 with the **niche** x −85..−83.6 (1.4 deep × 2 W × 1.6 H; the watcher sits here: leave it empty); flight 3 south z −24 → −18 (y −8 → −12). Both walls: a peg rail at 1.6 m (board 0.15 m, pegs 0.03 × 0.12 m every 0.4 m: pegs need `thin_ok` or fattening to pass at 6 m) and **a low rail at 0.9 m with the same pegs, bare**, sitting in the pool of the second strip. One aqua strip per flight, **baked lit**. The seam solids (`gl_flight_1`, `gl_landing_1`, `gl_shaft_wall_n`, `_w_end`, `_s1`, `_e1`, `_w`, `gl_shaft_ceiling`) must be in this chunk: it is drawn under the Tally hatch while the surface set is resident.
- [ ] Peg dressing as `inst_` empties (allowance **6 000 tris, 5 draw calls**; assets `prop_coat_hung` nodes `coat_long` / `coat_short` / `coat_shawl`, `prop_hat_hung`, `prop_boots_pair`, `prop_crate`): coats with `wind: 1`, hats above, paired boots beneath; about one peg in five empty; **nothing on or under the low rail**; **exactly one coat with `wind: 0`**.
- [ ] **Proving bay** x −91..−81, z −18..−10, floor y −12, ceiling −7: concrete, livery band, a geometry `4`; the range wall on the south line z −10.95 with three plate hooks 1.5 m apart (x −86.5, −88, −89.5); the mount for the proving step at (−82.2, −12, −15) under **the one steady, slightly brighter lamp** (`light_gallery_mark`, aqua-white core, baked). Embedded: `rd_plate` / `plate_proving` at (−83.3, −10.4, −17.95) on the north wall (**load-bearing: on the critical path, lit, unobstructed**) and `rd_plate` / `plate_line` at (−85, −10.4, −10.05).
- [ ] **Gallery** x −81..−19, z −17.5..−10.5, 5 m high: a 3 m walkway of floor plate (z −15.5..−12.5) between pipe banks 2 m deep (pipes 0.5 / 0.35 / 0.2 m on saddles, a cable tray above) built as **one 3.6 m module copied 17×** with three variant modules (panel off showing ribs; a valve station; a sagging cable). The three knot seats, **to the centimetre**: a pipe elbow arching from the north bank with its seat at `knot_a` (−74.2, −9.327, −14.236), a cross-pipe valve bonnet at `knot_b` (−67.2, −8.56, −13.57), a ceiling conduit box at `knot_c` (−60.2, −7.8, −12.9). **Nothing may intrude on the straight line from the eye (−82.2, −10.2, −15.0) through those three points, nor into the walkway volume y −12..−7.** The baffle wall at x −59 (opening 3 × 3 m, the lamp bar is the prop's) and the far door frame at x −19..−18 (opening 3 × 3 m). No cover east of the baffle.
- [ ] **Bake, mood L3**: key = the aqua strips themselves (emissive `#7CF2E2`, one 1.2 m strip per 3.6 m of ceiling in a single receding row; positions `light_gallery_strip_1..8`), one in eight on `strip_flicker` and not baked; ambient `#132547` × 0.30; a smeared bright streak under each strip on the satin floor (footprint stretched 3× along the axis); a 0.6 m violet spill on the floor at the hairline. One module's lightmap is shared by its copies.

### 4.3 `env_lift_hall` — 36 000 tris, 4 draw calls, lightmap `lm_hall` (1024², ~12 texels/m)

One chunk `chunk_lh_hall` (`m_pellam`, `m_mask`, `m_emis`; box x −19..28, y −16..−2, z −29..8) + drawn node **`diagram_lamps`** (lamp set of 7: indices 0–5 the six discs, dim aqua; 6 the seventh, aqua-white, steady).

- [ ] Hall x −18..20, z −28..0, floor y −15, ceiling −3. **Gantry** on the west wall x −18..−13, z −19..−9, deck y −12: steel deck with `grille` decking and a 0.08 m tube rail; **ramp** x −18..−15, z −9 → −3 down to y −15 (26.6°). The ramp-foot switchgear cabinet at layout `lh_ramp_cabinet` (1.2 × 1.2 × 2.4 m, bolted down).
- [ ] **Ten ribs**: ceramic-clad piers 1.6 × 2.4 m in plan, full height, at x −9, −3, 3, 9, 15 on z −18 and z −10, flaring into the vault with a 0.6 m fillet; livery band, kick plate, one cast plate each. **Footprints exact** (charge-stun and slam line-of-sight depend on them); 4.4 m gaps. Floor: satin plate on the 1.2 m module, **nothing over 0.35 m anywhere the Tamper can walk** (1 m clearance) except the cabinet.
- [ ] North wall: a sealed bulkhead 4 × 4 m at x −6 (`sp_hall_tamper.params.bulkheadAt` (−6, −13.5, −28)), dished 0.15 m over a 1.5 m circle where it has been pounded. Keep the gantry-to-bulkhead sightline (`vista_tamper`), which passes north of rib n1.
- [ ] Five floor-grate recesses 1.2 × 1.2 m: `sp_hall_grate_1..4` at (12, −24.5), (12, −3.5), (18, −22), (18, −6) and the vignette grate `sp_hall_vig_bider` (−4.4, −23.8). The lids are props.
- [ ] East end: **the ring** (`prop_hall_ring`): a ceramic portal 9 m across, 1.2 m deep, a continuous aqua strip in its reveal (baked: the brightest large shape in the room), framing the cage gate opening **6.0 × 3.5 m** (`door_lift_cage`); the cage bay x 21..27, z −17..−11, y −15..−11.5 behind it (the cage is a prop). Beside it on the east wall at z −21.5: the **lift-head diagram**, 4 m tall, 20 mm relief (`brand.pellam_mark`), carrying `diagram_lamps`. A geometry `4` at the ring.
- [ ] South wall: the **cold bay** x 2..10, z 1..7 (8 × 6 × 5 m) behind the 3 × 3 m shutter opening x 4.5..7.5, and a **0.4 m inspection slot** in the south wall in line with rib s3 (x 3) through which `knot_cold_bay` (3, −13.4, 1.12) shows; add a shroud so it is seen only from behind that rib if you can. Embedded: `tamper_cold_static` at `sec_cold_bay` (8, −15, 4.5) under **one clean aqua lamp**, and `rd_plate` / `plate_service`.
- [ ] **Bake, mood L4**: two rows of aqua lamps 9 m up over the rib rows receding east (positions `light_hall_<1..5>_<n|c|s>`), **one in eight dead (dark)**; each bakes a streak on the floor; ambient `#132547` × 0.22. `lm_hall`: floor, ribs to 4 m, gantry, ramp, ring reveal; walls above 4 m and the ceiling vertex-lit and kept simple (the east wall is 70 % lost in fog). No violet anywhere in this bake.
- [ ] Dressing allowance: 2 000 tris, 3 draw calls, `prop_crate`, `prop_barrel` (never on the hall floor's walkable area).

### 4.4 `env_the_bore` — 40 000 tris, 10 draw calls, lightmap `lm_bore` (1024², ~20 texels/m in the sector) + layer `lm_bore_glow` (1024² R8)

| Chunk | Tris | Materials | Holds |
|---|---|---|---|
| `chunk_bo_ante` (x −3..31, y −45..−29, z 64..80.3) | 8 000 | `m_pellam`, `m_mask`, `m_emis` | antechamber and the stair down to it |
| `chunk_bo_chamber` (z 80.3..117, y −51..−29) | 32 000 | `m_pellam`, `m_mask`, `m_emis` | arrival bay, catwalk, chamber (six sectors), bore shaft, proving-lift room |

Nodes: **`bore_axis`** (empty at (14, −44, 96)), **`bore_glow`** (lamp set of 1: the emissive disc 6 m across below kerb level + the column mesh; `violet_band` cell, B = 1 so it turns aqua with `wrong_fade`), **`bay_lamps`** (6: one aqua wall lamp per bay at 5 m, index = bay − 1), **`mark_glows`** (6: an aqua disc 0.5 m on each proving mark, index = bay − 1, G = 1.0 off until triggered), **`ante_diagram_lamps`** (7, as the hall's).

Bearings are compass bearings from the axis, 0° = north (−Z) = the door, clockwise.

- [ ] **Arrival bay** for the cage: interior x −1..5, z 80..86, y −36..−32.5, gate on the east, a bulkhead x 5..5.4 with a 2 × 2.6 m hatchway. **Catwalk** x 5..23, z 82..84, deck y −36, enclosed in a grille tube 2.4 m high (`grille` cards; shots clank and skip on its collider), with a clear view from its centre down to the drum. **Stair**: flight 1 north x 26..28, z 82 → 76 (−36 → −40); landing; flight 2 west x 26 → 20, z 74..76 (−40 → −44).
- [ ] **Antechamber** x 9..19, z 66..80, floor −44, 5 m high: concrete, **dusty**, livery band. On the south (door) wall: the niche seat for the cradle at x 10.9, y −42.5 (**right of the door as faced**; the cradle is a prop and must stand clean on your dusty wall); left of the door a `4` plate position at x 16.3 (the plate is a prop) and the **wall diagram** at x 17.7, 2.4 m tall (`prop_ante_diagram`), carrying `ante_diagram_lamps`. The door frame for the 3 m disc (centre (14, −42.5, 80)); the disc is a prop. Embedded: `prop_camp_ash` / `ash_embers` and `prop_kettle` at (11.5, −44, 70) (**the only fire he leaves**), `rd_note` / `note_cradle` at y −43.1 under the cradle.
- [ ] **Chamber**: circular, radius 15, 14 m high (floor −44). **Modelled and baked as one 60° sector cut rib-centre to rib-centre (30° to 90°), then copied five times about `bore_axis`.** Each sector: one bay with its wall lamp at 5 m and one **embedded `ia_proving_mark`** (dark brass disc 0.5 m, flush) at r 4.9 on the bay centre; half a rib each side: ribs 1.6 m thick × 3.0 m radial (r 7.5..10.5), full height, at 30°, 90°, 150°, 210°, 270°, 330°. Satin concrete floor: **the lightest large surface in the room**.
- [ ] **Kerb**: inner radius 3.0, 0.6 m thick; 0.6 m high all round with six **merlons to 1.2 m over 25° of arc at the rib bearings**, leaving a **35° (2 m) notch at 0.6 m in front of each mark** (layout `bo_kerb`, `bo_kerb_hi_1..6`); a `hazard` diagonal on the top face. From a mark the open bore must be visible from 3.5° to 29° below the horizon: do not raise the notch.
- [ ] **The bore**: a 6 m shaft with panel courses going down 30 m to the emissive disc (`bore_glow`). Ceiling: a ring girder at the axis for the Windlass arm, cable runs to the walls.
- [ ] Placed on top of the sectors and **not in the sector bake**: the door bay (0°), the proving-lift room behind bearing 180° (interior x 12..16, z 112..116, 3.5 m high, opening 3 × 3 m in a 1 m wall at (14, −44, 111.5)), wall seats for the cartridge points at 90° and 270° and the line locker at 168°, three kerb-foot grate recesses at r 4.5 on 90°, 210°, 330°.
- [ ] **Bake, mood L5**, six-fold symmetric (ART_BIBLE checklist 30). `lm_bore` is the **fill** layer only: six aqua bay lamps (pools 3 m wide on the floor), the embers (flame, radius 4 m on the antechamber floor), the cradle lamp (aqua-white, tight), AO; fill ambient `#1A1030` × 0.2 (catwalk) / `#132547` × 0.2 (antechamber). **No bore light in it.** `lm_bore_glow` is the light from the bore alone, greyscale, strong on rib inner faces (target × 0.8), ceiling × 0.4, catwalk undersides × 0.6; the runtime tints it violet → aqua bottom-up by world height.

### 4.5 `env_lift_shaft` (P1) — 800 tris, 7 draw calls, `VL`, pivot cage floor centre
- [ ] A dark-ride shell: a square shaft section 12 m tall on a 6.4 × 6.4 m footprint (code scales it to the cage in use), concrete with guide rails (`m_pellam`), and six lamp bars 1.2 × 0.1 m as separate mesh nodes **`lamp_bar_1`…`lamp_bar_6`** (`m_emis`, code-driven: code scrolls them upward; never keyed).

## 5. Tests and evidence

`tests/art_env_interior/*.test.mjs` (`node --test tests/art_env_interior/`):

- [ ] `check.test.mjs`: `check-glb` on your five ids; `asset-status --require=0 --owner env_interior` exits 0.
- [ ] `puzzle_geometry.test.mjs`: (a) the three window openings are clear and each blade ray from its window centre along (0.686, −0.242, 0.686) reaches its layout landing point without hitting your geometry (S → tally wall patch; M → head chair seat then hearthstone; N → the day-cell at (−92.5, 3.266, −32.8)); (b) the line eye → `knot_a` → `knot_b` → `knot_c` is unobstructed and each knot seat surface is within 0.10 m behind its marker; (c) from each proving-mark centre at eye height 1.65 m the bore disc is visible between 3.5° and 29° below the horizon; (d) the cowl hides `knot_hatch_latch` from every nav node south of z −34.5; (e) the hatch opening is not visible from `trg_set_swap`.
- [ ] `openings.test.mjs`: every door / gate opening in your zones is clear at the marker's size; ribs and cover drawn within ±0.25 m of their solids; nothing over 0.35 m on a nav link.
- [ ] `symmetry.test.mjs`: the six chamber sectors share lightmap UVs; rotating the chamber's vertex light by 60° about `bore_axis` changes no vertex by more than 1/255.
- [ ] `viewer.test.mjs`: each zone through `sandbox/viewer.html?zone=`; no console error; nodes resolvable; counts within the manifest; lamp sets cycle; screenshots below.

`shots/art-env-interior/` (960 × 540; open every one): `<id>_sheet.png`, a dollhouse view, and `<id>_game.png` for each zone; eye-level Cycles and viewer frames at: `cp_tally_enter` looking north, the daylight stand spot (−86, 0, −23.5), the knot stand (−91.9, 0, −35.5), the hall from the hearth looking north-west **with the hatch layer at weight 1**, landing 1 looking up at the hatch, landing 2 with the bare low pegs, the brass-mark eye point looking down the knot line, the gallery from the baffle looking east, `vista_tamper`, the hall floor looking east to the ring, the cold bay, `vista_windlass` from the catwalk, the antechamber facing the door wall, each of two opposite proving marks looking into the bore, the chamber with `lm_bore_glow` shown violet and shown aqua; all six lightmap / layer images.

## 6. Definition of done (measured)

1. `node tools/build-assets.mjs --only env_interior` succeeds from clean; time reported (bake times per zone).
2. Triangles ≤ 17 000 / 32 000 (6 000 + 6 000 + 20 000) / 36 000 / 40 000 (8 000 + 32 000) / 800. Draw calls ≤ 4 / 10 / 4 / 10 / 7. Dressing within allowances.
3. Download share: five GLBs ≤ 2.5 MB total (the bore's copies cost about 0.4 MB); six lightmap files ≤ 3.0 MB total.
4. Value structure (ART_BIBLE 2.3): Tally 8 : 22 : 70, gallery 10 : 30 : 60, hall 8 : 27 : 65, bore 12 : 28 : 60, measured on a blurred 32 × 18 frame; no pixel under `#0B0D12`; no neutral-grey shadow in the Tally House.
5. ART_BIBLE section 12 items 1–4, 9–16, 18, 27–30 marked PASS / FAIL with the file looked at. Station `4` geometry numerals present at the bay, the ring and the bore antechamber wall and legible at 720p × 70 % from 6 m.
6. Any `tx_pellam_trim` revision is append-only and `tests/pipeline/textures.test.mjs` still passes.

## 7. Non-goals

Doors, hatch leaves, shutters, the baffle, lift cages, the lever, lockers, ammo boxes, the
cradle, the bore door, the proving step, the sighting loop, range plates, the day-cell, the
share cloth, grate lids, station plates (all `art-props`); the Windlass and Tampers
(`art-boss`); seated figures (`art-enemies`); sun-blade cards, dust motes, fog, the standing
line, flicker and `wrong_fade` shading (`code-render`); colliders; per-shutter relit bakes
(out of scope: GDD 20).

## 8. Dependencies

- Embedded props come from `art-props` (`prop_tally_table`, `prop_chair`, `prop_head_chair`, `prop_bench`, `prop_camp_ash`, `prop_kettle`, `rd_note`, `rd_ledger`, `rd_plate`, `ia_proving_mark`) and `art-boss` (`tamper_cold_static`). **Build against their placeholders in `blender/export/`**; the integrator rebuilds zones when finals land. Chairs must match where `art-enemies`' seated figures sit: both read the same seat markers.
- `art-env-exterior` builds the Tally House's outside from the same window and door markers.
- `code-render` implements the light layers, lamp sets and `wrong_fade`; until it lands the viewer's fallback material shows lightmap × vertex colour only. Put the layer previews in Cycles renders.
- `code-world` drives `strip_hatch`, `mark_glows`, `diagram_lamps` and the visibility of `chunk_gl_stair` under the hatch; nobody animates `bay_lamps` in round 1: author them steadily lit (G = 0).
