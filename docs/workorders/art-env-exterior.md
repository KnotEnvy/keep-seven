# Work order: `art-env-exterior`

Phase 3 (production, round 1). Manifest owner name: **`env_exterior`**. You are a fresh agent:
this file plus the documents it names are everything you need.

Read first: `CLAUDE.md`, `docs/PLAN.md`, `docs/workorders/README.md` (**section 4, "Read first":
`docs/FOUNDATION_REPORT.md` sections 2 to 4, 6, 8c and 9, and `blender/lib/README.md`**: the
build driver, the viewer and the checks as they are now), `blender/env_exterior/README.md`
(the shared `lm_surface` recipe); `docs/ART_BIBLE.md`
sections 1, 2, 3 (3.1, 3.2, 3.7 are yours), 4, 5, 7.1, 7.2, 12; `docs/ARCHITECTURE.md` 7
(all of it: 7.2, 7.4, 7.5, 7.6 are binding and **win over the art bible**); `docs/LEVEL.md`
0, 1, 2, 7 and `docs/level-map.png`; `docs/GDD.md` 9.2, 9.3, 9.8, 11; then
`blender/template_asset.py`, the docstrings of `blender/lib/`, and
`docs/research/blender-pipeline.md` "twelve things" and "Traps".

## 1. Mission

You build the first image and the last image of the demo, and every exterior metre between:
the black overhang with the blazing valley and the leaning Rule beyond it; a 95 m gully of
red rock; a frontier street walked into low sun, where every post throws a long mauve shadow
at the player; a walled pump yard under a 14 m wind-pump; and the blue-hour rim where the
stage ends looking back at the town. Pillars: **2 (a world that has moved on)** and
**3 (story through place)** are judged mostly on your screenshots; **5** depends on you
holding the chunk plan, because the street and the lip are drawn together and sit at
112 381 of the 120 000-triangle cap. The look is baked light, fog and silhouette: "shape
before surface", no primitives, no noise, three glows only (ART_BIBLE 1.2, 1.3).

## 2. Owned files (exclusive)

```
blender/env_exterior/**      env_the_lip.py  env_plenty_street.py  env_far_rim.py  rim_town_card.py
                             env_backdrop_day.py  env_backdrop_dusk.py  bake_surface.py  + your own helper modules
blender/tex/tx_frontier_trim.py   blender/tex/tx_sand.py     later revisions only, append-only (see 6)
tests/art_env_exterior/**
shots/art-env-exterior/**
docs/requests/art-env-exterior.md
public/assets/env/{env_the_lip,env_plenty_street,env_far_rim,rim_town_card,env_backdrop_day,env_backdrop_dusk}.glb
public/assets/lm/{lm_surface,lm_rim}.webp      written only by `node tools/build-assets.mjs --only env_exterior`
```

Never edit `blender/lib/`, `design/*.json`, `tools/`, `src/`, another owner's folder or
files. Need a change elsewhere: write it in your request file and work around it.

## 3. Rules that bind every art piece (short form; ARCHITECTURE 7.2 is the full text)

- **The pipeline as built** (FOUNDATION_REPORT 4, 6, 8c and 9; `blender/lib/README.md`; `blender/env_exterior/README.md`):
  - Nothing ships until the build passes: a `FAILED <id>` leaves the previous files in place. The Blender log is `blender/export/.logs/<id>.log`; bake warnings (`WARNING <object>: N faces … baked dark from end to end`) are **only** there or under `--verbose`: read it after every bake.
  - **Draw calls are counted one per mesh per material**; a zone ships exactly its planned chunk meshes, drawn nodes and plugs.
  - **A mesh stamped `VL` must have been vertex-lit** (`vcol.bake_vertex_light` marks it; `export.check_scene` fails otherwise). **A mesh stamped `LM` is not covered by that guard**: forget the vertex bake on the vertex-lit faces of a mixed chunk (the neutral-texel faces), or light only some of the objects, and the build passes and ships tint × 2: blown-out white walls beside a correctly lit floor. Every zone is a mixed chunk. Call `bake_vertex_light` on every object that has a vertex-lit face, and **open the `<id>_game.png` after every bake**: that frame is the only check.
  - **A lightmap your script did not write in this run is reported `skipped … did not write it in this run` with exit 0**, and the GLB (with its new UV1) ships pointing at the old or placeholder lightmap. Treat a `skipped lm_*` line as a failed build.
  - **Vertex-light samples**: the library's recommendation (256 spp for the final vertex light) is under-sampled for a closed interior: the round-3 critic measured about 21 % per-vertex noise at 256 spp in the fixture room (walls visibly mottled) and clean gradients at 4096 spp, which cost 4.0 s for 2 348 faces. Use `samples=2048` to `4096` for final vertex light indoors and compare a frame at both; lightmaps and light layers stay at 64 spp + OIDN.
  - **Bake times** were measured on a 6 × 4 m room only (1024² lightmap 7.5 s, 2048² 44 s, the whole zone build 90 s; CPU); nobody has baked 50 000 triangles under a real sun. Iterate at a reduced size or sample count and keep the full-size bake for final passes: the machine is shared.
  - **Dressing empties** reach the runtime as `Object3D` children of the zone root named `inst_<nnn>` / `brk_<nnn>` with `userData.asset`, `userData.node` (a variant, when the asset has one) and `userData.wind`; the placeholder zones already carry two or three (FOUNDATION_REPORT 5). Nothing instantiates them until `code-world` lands; `check-glb` holds them to the allowance.
  - `tools/preview-asset.mjs <texture id> --textures` writes into `shots/foundation-pipeline/` unless you pass **`--piece art-env-exterior`**.
- **Judging colour**: the viewer (`sandbox/viewer.html?zone=<id>`, and every `<id>_game.png`) shows linear values up to 0.8 exactly as authored and rolls off only above that, and the game's renderer uses the same curve (README ruling 15). A display target measured in the viewer is therefore the file's colour below 0.8 linear (sRGB 231); a brighter one (lit sand) is slightly compressed by the shoulder: measure those on the Cycles preview and say which frame each number came from. The viewer is unlit beyond the baked light: no fog, sky or grade until `code-render` lands.
- **Build the three-script skeleton first** (minutes, before any modelling): `env_the_lip.py`, `env_plenty_street.py` and `bake_surface.py` over one helper module, made from the layout solids only, through `node tools/build-assets.mjs --only env_exterior`. The shared 2048² `lm_surface` (two zone scripts and one bake over one helper) is a written recipe (`blender/env_exterior/README.md`) that **no script has run through the driver yet**; what was measured is that `uv.unwrap_lightmap` on the name-sorted list of both zones' visible solids (107 objects) gives identical UV1 in three separate Blender processes. A driver problem must show on day one, not at the final bake.
- **`tx_frontier_trim` (yours from phase 3)**: two defects the round-3 critic measured in the foundation's version: 52 px at value 55 (0.216), under the 0.22 seam floor: clamp seam lines at 57 / 255 after encoding; and the tin row is drawn as about 20 fine corrugations where ART_BIBLE 4.2 says 12 soft bars per module: redraw the row in place (the row does not move: append-only is about positions).
- One script per asset: `tools/blender.sh -b --factory-startup --python-exit-code 1 -P blender/env_exterior/<id>.py -- --out <raw> [--blend <path>] [--seed n]`. Build everything with **`node tools/build-assets.mjs --only env_exterior`** (export → optimise → `check-glb`). Deterministic: `random.Random(seed)`, never iterate a set.
- Game space is +Y up, −Z north; Blender point = game `(x, −z, y)`. **Zone GLBs are authored in world coordinates** (root at the origin). Every position comes from `design/layout.json` through `blender/lib/layout.py`; never type a coordinate that the layout holds.
- **Materials are names only**: `m_sand`, `m_frontier`, `m_pellam`, `m_mask`, `m_emis` in zone chunks; `m_flat` for the backdrops and the town card. No images in a GLB. UV0 addresses the shared texture (trim row, palette cell, mask region); UV1 (`UVLight`) is the lightmap UV, or the lamp index on `m_emis`.
- **Chunk plan is law**: a zone's static geometry exports as exactly the meshes `<chunk id>__<material>` of section 4, plus the listed drawn nodes. Every face lies inside its chunk's `box`. Nothing in a `part: "high"` chunk within 3 m of the path's ground.
- **Baked light**: lightmapped vertices: `COLOR_0` = tint × AO. Vertex-lit vertices: `COLOR_0` = tint × light ÷ 2 (clamped to 1) and UV1 on the lightmap's **neutral texel** (the white 4 × 4 block at the top-left), so both kinds share one mesh per material. Lightmap stored value = light ÷ 2. `blender/lib/bake.py` does all of this; do not hand-roll it.
- **Embedded props** (`placedBy: "zone"`): import the prop's raw GLB from `blender/export/` with `zone.embed_prop` (placeholder today, final later; the build driver rebuilds your zone when it changes), place it at its layout solid or marker, let it cast in the bake, vertex-light it in place, fold it into the chunk's structure material (UV0 on the `flat` cell, colour in `COLOR_0`).
- **Dressing** is yours to place: empties `inst_<nnn>` (instanced decoration) and `brk_<nnn>` (breakable) with extras `{ asset, node, wind? }`, within the zone's allowance; nothing taller than 0.35 m on a nav link.
- **Thin geometry**: at least 2 mm wide per metre of the farthest normal viewing distance (3 cm at 15 m, 6 cm at 30 m, 20 cm at 100 m). Thinner things are fattened, become `m_mask` cards, or are dropped. `check-glb` fails islands under 3 cm without a justified `thin_ok`.
- **Collision is the layout's**, not yours. You may move a wall face ±0.25 m, lean it, break its outline and dress it, but may not move a door, narrow a walkway under 3 m, move / shrink / lower a `cover` solid, put anything over 0.35 m on a nav link, or block a listed sightline (LEVEL.md "preserve").
- Homage, not copy: nothing from `docs/research/art-tone.md` 1.5 / 1.6 (no roses, no dark spire on the horizon, no faces, no scarecrow shapes); no in-world text that is not in `design/story.json`; no 19, 99, or decorative sixes and sevens.
- Priorities: all six of your assets are **P0**. If you run out of time, the cut order is: dressing empties first, then cloud cards, then facade detail (keep silhouettes), never a chunk or a node.

## 4. Deliverables

### 4.1 `env_the_lip` — 27 000 tris, 10 draw calls, `LM+VL`, lightmap `lm_surface`, node `collider_terrain`

Zone bounds x 0..32, y −1..26, z −9..111. Mood L1, opening on L0 (same bake; only the grade differs).

| Chunk mesh(es) | Tris | Materials | Holds |
|---|---|---|---|
| `chunk_lip_rock` (`part: high`) | 8 000 | `m_frontier` | every rock face more than 3 m above the path, the overhang roof, the pylon mast above 3 m: the skyline, vertex-lit |
| `chunk_lip_upper` (z ≥ 54) | 7 000 | `m_sand`, `m_frontier`, `m_mask` | overhang interior and the first two reaches, to 3 m |
| `chunk_lip_mid` (z 30..54) | 4 000 | `m_sand`, `m_frontier` | the third reach, to 3 m |
| `chunk_lip_gate` (z < 30) | 8 000 | `m_sand`, `m_frontier`, `m_pellam`, `m_mask` | last reach, forecourt, gate wall and piers, pylon foot, to 3 m |

- [ ] **Overhang** (interior x 8..20, z 101..110, floor y 14, ceiling y 17; 12 W × 9 D × 3 H, mouth north). Roof slab 1.5–2.5 m, layered. **The mouth outline is designed**: one notch upper left, one fallen slab 2 × 1.2 m lower right: a clean dark frame, the first and last composition of the game (`far_rim` mirrors it). Packed-sand floor with one flat swept rock shelf at stop one (11.5, 14, 104.5): **no hearth, no ash, no fire**. Rock inside reads `#2A1A1E`–`#48272D`.
- [ ] Embedded at stop one (`bindings.zoneEmbedded.prop_camp_one`, `readable.rd_note_lip`): `prop_flat_stone`, `prop_coffee_pot` on it, `prop_cartridge_lead` / `round_spent` weighting `rd_note` / `note_lip` at (12.2, 14.05, 104.9).
- [ ] **Gully**: 95 m, z 93 → 9, y 14 → 0, 14–20 m wide, built over the layout's four wedge slopes and six rock spurs (keep each spur's reach ±0.5 m: each reach hides the next). Slopes 8–11°; terraces allowed, **no step over 0.35 m on the path**. Floor grid ≤ 2 m on the path, 4 m at the edges; wind ripples, drift wedges on the west side. Optional ledge x 21..25, z 94..99, top y 14.5 (the 0.5 m step).
- [ ] **Walls**: stratified red sandstone 8–15 m, battered back 5–10°, five bedding bands (`strata` row mapped by height), undercut bases, three buttresses a side, talus cones, a broken skyline with `rock_cap` on the top 10 %. No bevel on rock; `smooth_angle` 28°.
- [ ] **`collider_terrain`**: one low-poly mesh node (not drawn; extra `collider: true`) replacing this zone's `terrain` solids: within 0.25 m of them; `check-glb` samples every nav node (ground within 0.3 m, no step over 0.35 m on a link).
- [ ] **Dead pylon** at the gully mouth (layout `prop_pylon`: base (4, 0, 6.5), footprint x 3..5, z 5.5..7.5, **16 m tall**): tapered ceramic-clad mast 1.4 m at the base, 0.6 m at the top, on a cast concrete foot; three stub cross-arms (2.5 m, 0.45 m thick) each with a white insulator stack, one arm missing; the lowest stub 7.6 m up reaching `stubArmTo` (2.8, 7.6, 4.4) so the seventh jug (a prop, body at (2.8, 7.0, 4.4)) hangs under it; top 4 m leans 3° (whole mast tilts from the foot); maker's plate at 1.5 m (`brand.maker_plate`). Below 3 m in `chunk_lip_gate`, above in `chunk_lip_rock`.
- [ ] **Gate wall and piers**: wall x 0..2 with the opening z −2..2 (`door_jug_gate`, 4.0 × 2.8 m clear); two adobe-and-stone piers 1.0 × 1.0 × 3.1 m with timber guides for the drop-bar; the brushed mark struck through on the left pier (`mark_brush_a` + `strike` at 22°). The gate, sweep and jugs are props. Forecourt x 0..22, z −7..9, y 0; its **north wall is 3 m and nothing taller than 3 m may stand north of z −7 between x 0 and 26** (the doorway shot's sightline to the Rule).
- [ ] Dressing allowance: 1 000 tris, 2 draw calls, assets `prop_bottle`, `prop_sack`.

### 4.2 `env_plenty_street` — 54 000 tris, 16 draw calls, `LM+VL`, lightmap `lm_surface`

Zone bounds x −111..0, z −16..16. Drawn nodes: **`pump_rotor`**, **`pump_tail`** (code-driven; never keyed), **`drum_lamp`** (lamp set of 1), **`plug_door_tally`**.

| Chunk mesh(es) | Tris | Materials | Holds |
|---|---|---|---|
| `chunk_st_east` (x −37..0) | 16 000 | `m_sand`, `m_frontier`, `m_pellam`, `m_mask` | Front Street east half, with the ceramic rib |
| `chunk_st_west` (x −80..−37) | 16 000 | `m_sand`, `m_frontier`, `m_mask` | Front Street west half and the gate court |
| `chunk_st_yard` (x −111..−80) | 14 000 | `m_sand`, `m_frontier`, `m_mask` | yard ground, walls, stubs, shed, cart, the Tally House exterior |
| `chunk_st_works` (`part: high`; solids `yd_drum`, `yd_pump_tower`, `yd_tank*`) | 8 000 | `m_frontier`, `m_pellam` | the whole drum, the wind-pump derrick, the tank on its stilts with deck and ramp |

- [ ] **Ground** (≈ 7k): street x −73..0, z −7..7 (14 m between facades) and yard x −110..−80, z −14..14; packed sand, two wheel ruts down the centre that swerve round the rib, drifts against every north-west face, a swept bare circle 3 m across round the trough. Grid 1.5 m on the street centre. Centre lane |z| < 1.5 clear its whole length.
- [ ] **Nine facades** (≈ 2.4k each, 22k total; north row z −12..−7, south row z 7..12; cross-alleys 3 m wide at x −14.5, −45.5, −61.5 north and −21.5, −39.5, −57.5 south; alleys z ∓15..∓12): false fronts in board on an adobe base, each 6–9 m wide, 5–7 m tall, 2.4 m porch eaves on posts, leaning 2–4° in alternating directions, no two alike: 01 saddlery (south, west end; open doorway x −67.2..−65.2 for wave C; a saddle-tree shape on its bracket, no lettering), 02 feed store (north, x −30..−16; **loft door open at x −24..−22.4** with a hoist arm; loft floor y 3; keep the line from the street centre (−23, 1.65, 0) to the bell rope at (−23.2, 5.05, −8.0) clear), 03 assay shed (tin roof, one sheet lifted), 04 dry-goods (porch collapsed at one end), 05 smithy (open front, cold forge), 06 boarding house (two storeys, a balcony with a missing rail), 07 wash-house (a cord line for strain-cloth dressing), 08 undertaker's shed (plain, shuttered, planed boards stacked; no coffins), 09 gatehouse lean-to. Each: a shut dressing door 1.2 × 2.2 m, 1–3 shuttered windows, a sand ramp at the door. Backs and roofs never seen are deleted; interiors are black voids behind a 1 m deep dark box.
- [ ] **Nine door marks** at the layout markers `prop_door_mark_1..9` (decal quads on `m_mask`, the variant from each marker's `params.variant`; number 9, on the feed store, is the miscounted `mark_brush_c`, used exactly once), each **struck through with the same ruled `strike` at 22°** in `graphite`, and the brushed mark on the trough end.
- [ ] **Cover, east to west** (footprints and heights are the layout's; all ≥ 2.2 m except the trough): embedded `prop_wagon_tipped` at (−10, 3.6); adobe stub A (−19, −3.8); the **ceramic rib** (−28, 4.4): 9 m long, 1.6 m thick, 1.9 m at the crown, a true circular arc with 0.6 m shoulders, panel seams every 1.2 m, one panel missing showing steel ribs and cable, sand banked north-west (700 tris, `m_pellam`); adobe stub B (−37, −3.8); embedded `prop_trough_pump` (pump post (−46.6, −3.3), trough (−44.5, −3.1)). Wall stubs: 3–4 m long, 0.5 m thick, 2.2–2.6 m, stepped broken ends showing brick, 80 mm soft corners, ≈ 300 tris each.
- [ ] **Gate court** x −79..−74, z −5..5: the opening for `door_yard_gate` (x −73.5, z −2..2, 4.0 × 3.0 m) and the adobe frame for `ia_yard_door` (x −80..−79, z −1.3..1.3, 2.6 × 2.8 m); `door_alley` opening (x −80..−79, z −13.8..−12.2, 1.6 × 2.4 m). The leaves are props.
- [ ] **Yard wall**: 3 m adobe, 0.6 m thick, flat capstones, buttress every 6 m, one section patched with tin (≈ 2.5k). **Nothing taller than 3 m west of x −95 between z −14 and −7.5; stub 1 no taller than 2.3 m** (the Dowser sightline, due west).
- [ ] **Well-house and drum** (≈ 5k; drum centre (−101, −3), radius 4, 6 m high): adobe well-house 9 × 9 × 3.5 m with the celadon ceramic drum coming up through its broken roof, panelled on the 1.2 m module, livery band at 1.2 m, a 0.4 m geometry `4` (`brand.numeral_mesh`); a Pellam door opening 2.4 × 3 m in the drum's **east** face with its leaf slid half aside and stuck (zone geometry: Transits emerge through the gap at `sp_yard_t1/t2`); the floor-grate recess 1.2 × 1.2 m at the drum base for `sp_yard_grate_1/2` (the grate lid is a prop); **`drum_lamp`**: one aqua status lamp by the door (lamp set of 1, `m_emis`), with a tin cup shape hung under it.
- [ ] **Wind-pump** (≈ 3k, in `chunk_st_works` except the two nodes): timber derrick to 14 m on the drum top, four tapered legs 0.3 m thick, X-braces 0.2 m (fat), a platform at 11 m; **`pump_rotor`** (own mesh node, origin on the hub axis, 5 m across, seven vane sockets with **one vane missing**: six tin vanes 0.5 × 1.9 m; code spins it 9°/s) and **`pump_tail`** (tail vane with the brushed mark). Both `m_frontier`, vertex-lit, extra `wind: 0`.
- [ ] **Tank and catwalk** (≈ 2.5k; deck x −88..−83, z 5..10 at y 3.5; tank r 1.5; ramp x −95..−88, z 8.2..9.8): boarded tank 3 m × 2.6 m on four 0.4 m stilts boarded on the **north** side only; a cleated ramp 1.6 m wide. Tank shed lean-to x −110..−106, z 10..14. Embedded `prop_water_cart` at (−86, −3.5). Yard stubs at (−92, −9), (−97, 6.2), (−105, 6). The bell post is a prop.
- [ ] **Tally House exterior** (≈ 2.5k, in `chunk_st_yard`): a 14 × 22 m adobe hall, walls 5 m, flat roof with a low parapet, viga ends in a row and one canale; three high west shutter openings 1.2 × 0.9 m at 4.05–4.95 m (z −24, −30.5, −36.3: read them from `shutter_*`), the south door opening (x −89.8..−88.2, 2.4 m tall), east front doors barred; corner buttresses, plaster fallen from the lower metre. **Openings must match `env_tally_house` exactly** (both read the layout). Nothing on its roof rises into the Dowser sightline.
- [ ] **`plug_door_tally`**: a black panel (`m_frontier`, `COLOR_0` black, UV0 on `flat`) filling the Tally doorway just inside where the leaf swings; its own mesh node.
- [ ] Embedded in the loft: `rd_rain_tally`. Dressing allowance: 6 000 tris, 6 draw calls, assets `prop_lantern` (dark variant on the street), `prop_bottle` (in sixes on sills, `brk_`), `prop_crate`, `prop_barrel`, `prop_sack`, `prop_strain_cloth` (wash-house line, `wind: 1`; **one hangs dead still**, `wind: 0`).

### 4.3 `lm_surface` — 2048², one bake scene for both zones (`bake_surface.py`)
- [ ] Lightmapped: gully floor and the first 3 m of walls, street ground, facades to the eave, yard ground, yard walls, drum base, wall stubs, the rib. Vertex-lit: everything above the eave, the wind-pump frame, rock above 3 m, embedded props. About 16 texels/m within 10 m of the path; nothing thinner than 10 cm is lightmapped.
- [ ] Mood **L1 Long Light**: sun azimuth 315°, elevation 14°, to-sun `(−0.686, 0.242, −0.686)` game space, angular diameter 4°. Calibrate with `bake.calibrate`: sun-facing white reads **`#FFD09A` × 1.30**, open shade facing up reads **`#7A86D8` × 0.90** (violet-blue on purpose: mauve shadows). Two bounces, AO. Shadows are large soft shapes (nothing finer than 15 cm), 4.0× the caster's height, running south-east.
- [ ] Display targets (measure on a Cycles preview and again in the viewer): lit sand `#F4A272`, shadow on sand `#5C4E59`, lit rock `#B65239`, rock shadow `#48272D`, lit board `#7E4C38`, board shadow `#2E222B`.

### 4.4 `env_far_rim` — 14 000 tris, 3 draw calls, lightmap `lm_rim` 512²
- [ ] One chunk `chunk_rim_ledge` (`m_sand`, `m_frontier`, `m_mask`; box x −2..30, y 17..25, z 100..121). Ledge x −1..29, z 101..111, y 18; a black rock frame (z 111..112) round the 3 × 3 m cage opening, **the mouth outline of `lip_overhang` mirrored in composition** (camera height and frame shape matched: ART_BIBLE checklist 31); a natural rock shelf at the north-west edge for the stone; two foreground boulders (max 1.6 m); the drop to the plain. Open sky north and north-west from the whole ledge.
- [ ] Embedded: `prop_rim_stone` at (1.6, 18, 102.4) with six `prop_cartridge_kept` / `round_spent` in its seats 1–6 (mouth up, band intact) and `rd_note` / `note_stone` under the first; **seat 7 stays empty** (the violet round is a runtime prop).
- [ ] Mood **L6 blue hour**, its own bake: no sun; sky dome key `#A9B8E0` × 0.75 from above, ambient `#4A5A96` × 0.50. Targets: lit ledge `#65656D`, shadow `#1F2233`.

### 4.5 `rim_town_card` — 600 tris, 2 draw calls (`m_flat`, `m_emis`), `UNLIT`, world coordinates
- [ ] Plenty as a silhouette 250 m off and below, at the layout's `vista_plenty` target (−60, 4, 0): roofs, the wind-pump, the drum; a 60 × 14 m card set in three layers. Nodes: **`town_windows`**: one `m_emis` mesh of **48 window quads** (0.9 × 1.1 m at card scale) that is a lamp set (quad *i* has UV1.x = (i + 0.5)/48; lighting order spreads outward from the Tally House; `COLOR_0` R = intensity, flame cell); **`socket_thread`**: an empty at the base of the plumb aqua thread.

### 4.6 `env_backdrop_day` (2 500 tris) and `env_backdrop_dusk` (2 000 tris) — 1 draw call each, `m_flat`, `UNLIT`, world coordinates
- [ ] Day: four layers of mesa silhouette cards at 200, 350, 550 and 800 m, each lighter and nearer the fog colour, at least 20 m apart; the far rim at 250 m **due west of the yard** kept dark and clear of the sun's disc and halo (the Dowser card must read pale on it); the **pylon line**: nine pylon cards marching north to the foot of the Rule, each 0.6× the last; five faceted flat-bottomed cloud cards, all in the western half (lit edge `#FFE0B0`, body `#B9A79C`). Empties: **`socket_dowser`** at `vista_dowser.params.target` (−332.537, 53.628, −10.5); **`socket_rule_base`** due north (azimuth 0°).
- [ ] Dusk: the same horizon re-coloured to L6 (zenith `#1B2440`, horizon ember band `#D9967A` strongest at 315°), the plain with the pylon line; empty **`socket_last_fire`** on the line of `vista_fire.params.target` (40, −10, −420).
- [ ] One mesh each (one draw call). Nothing on the northern horizon may read as a dark spire.

## 5. Tests and evidence

`tests/art_env_exterior/*.test.mjs` (run with `node --test tests/art_env_exterior/`), using `tests/harness.mjs` and the pipeline tools:

- [ ] `check.test.mjs`: `node tools/check-glb.mjs` on your six ids passes; `node tools/asset-status.mjs --require=0 --owner env_exterior` exits 0.
- [ ] `openings.test.mjs`: for every door / shutter marker in your zones, a ray grid through the opening hits no triangle of your GLB; every `cover` solid is covered by drawn geometry within ±0.25 m; no drawn triangle above 0.35 m intersects a nav link's body sweep (0.45 m radius).
- [ ] `sightlines.test.mjs`: from `player_start` to `vista_rule`'s target, from `vista_kneeler`, from every nav node in `trg_dowser` and from `cp_yard_clear` to `socket_dowser`, and from the stand spot (11, 0, 0) to each jug marker: unobstructed by your geometry.
- [ ] `viewer.test.mjs`: loads each zone in `sandbox/viewer.html?zone=` through the real asset store, asserts no console error, node names resolvable, triangles and draw calls within the manifest, and writes the screenshots below.

`shots/art-env-exterior/` (960 × 540; open every one): `<id>_sheet.png` and `<id>_game.png` for all six; eye-level Cycles previews **and** viewer frames at: `player_start` looking north (the doorway shot), each gully reach, the stand spot facing the gate, `vista_kneeler`, the street centre at x −20 / −40 / −60 looking west, the yard from `ia_yard_door`, `cp_yard_clear` looking west, the catwalk, `lift_arrival_rim` looking north (the closing shot) and `vista_plenty`; `lm_surface.png`, `lm_rim.png`; a black-on-white silhouette of the overhang mouth and of the street skyline.

## 6. Definition of done (measured; report every number)

1. `node tools/build-assets.mjs --only env_exterior` succeeds from clean; time reported.
2. Triangles: lip ≤ 27 000 (chunks ≤ 8 000 / 7 000 / 4 000 / 8 000), street ≤ 54 000 (16 000 / 16 000 / 14 000 / 8 000), rim ≤ 14 000, card ≤ 600, backdrops ≤ 2 500 / 2 000. Draw calls ≤ 10 / 16 / 3 / 2 / 1 / 1. Dressing within the allowances.
3. Download share: your six GLBs ≤ 2.0 MB total; `lm_surface.webp` + `lm_rim.webp` ≤ 3.5 MB.
4. Squint test (ART_BIBLE 2.3, checklist A1): the doorway shot and the street hero shot blurred to 32 × 18 show three luminance clusters ≥ 18 L* apart; overhang ratio about 25 : 5 : 70, Long Light about 60 : 30 : 10. Sampled display colours within ΔE 10 of the targets in 4.3 (state which render you sampled).
5. ART_BIBLE section 12 items 1–3, 6, 8–15, 17, 27, 28, 31 marked PASS / FAIL with the file looked at. Each zone shows at least three seam objects (intrusion, salvage, misreading).
6. Shared-texture revisions (if any) are append-only: no existing trim row or region moved; `tests/pipeline/textures.test.mjs` still passes.

## 7. Non-goals

The sky, the sun disc, the Rule, the aqua thread, fog, cloud shadows, heat shimmer, the last
fire (all `code-render`); the Dowser card, gates, doors, jugs, the well-sweep, bell, pickups,
readables' meshes and all furniture (`art-props`: you embed or leave room for them);
colliders other than `collider_terrain`; enemies; any interior; LOD chains; normal maps.

## 8. Dependencies

- `art-props` owns the props you embed (`prop_wagon_tipped`, `prop_trough_pump`, `prop_water_cart`, `prop_flat_stone`, `prop_coffee_pot`, `rd_note`, `rd_rain_tally`, `prop_rim_stone`) and `art-weapons` the cartridges. **Work against their placeholders in `blender/export/`**; the zone script must not care whether the file is final. The integrator rebuilds zones at the end of the round.
- `art-env-interior` builds the Tally House interior behind your exterior: both read the same layout markers; do not coordinate by hand.
- `code-render` supplies the real materials, sky and fog. Until it lands, the viewer shows your bake through the core fallback material (vertex colour × lightmap, plain fog): judge light and shape there and in Cycles; the grade is re-judged at integration.
- `code-world` shows and hides your chunks by the visibility cells; if you break a wall's outline so far that a hidden chunk becomes visible, that is a request, not a code change.
