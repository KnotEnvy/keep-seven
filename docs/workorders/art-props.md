# Work order: `art-props`

Phase 3 (production, round 1). Manifest owner names: **`props_mech`** (28 assets, 24 clips:
everything with a clip or a hit target) and **`props_dress`** (29 static assets). You are a
fresh agent: this file plus the documents it names are everything you need. The piece is
large and is cut in two on purpose, and **production builds it as two pieces** (the box
below); they share no file.

> **Split (README section 1.1): this order is built by two builders at once. You are one of them.**
>
> | Piece | Manifest owner | You build | You own (files) |
> |---|---|---|---|
> | **`art-props-mech`** | `props_mech` | section 4: 28 assets, 24 clips | `blender/props/mech/**`, `tests/art_props/mech/**`, **and the texture scripts `blender/tex/tx_mask.py`, `tx_palette.py`, `tx_palette_emis.py`** (append-only; with the tables they generate, `blender/lib/palette.json` and `mask_regions.json`), `shots/art-props-mech/`, `docs/requests/art-props-mech.md` |
> | **`art-props-dress`** | `props_dress` | section 5: 29 assets | `blender/props/dress/**`, `tests/art_props/dress/**`, `shots/art-props-dress/`, `docs/requests/art-props-dress.md` |
>
> - **`art-props-dress` does not edit the three texture scripts.** A palette cell, an emissive cell or a mask region it needs (the `card_dowser` drawing, `family_marks`, `tally`, a new colour) is a **request to `art-props-mech`** written in `docs/requests/art-props-dress.md`: the cell or region name, the colour or what is drawn (with a reference image in `shots/art-props-dress/` for a drawing), and the asset that needs it. `art-props-mech` reads that file at the start of every pass and before finishing, appends the cell or region (nothing moves), rebuilds the texture and marks the row done. Until then `art-props-dress` builds against what the texture already has (the placeholder region, the nearest palette cell) and lists the open rows in its report. Section 5's "You own the `card_dowser` region drawing" means: `art-props-dress` supplies the drawing as a request, `art-props-mech` puts it into `tx_mask.py`.
> - **Builds**: `art-props-mech`: `node tools/build-assets.mjs --only props_mech`, and the textures by id (`--only tx_palette,tx_palette_emis,tx_mask`). `art-props-dress`: **by asset id** (`--only pk_canteen,prop_chair,…`), never `--only props_dress` or `--only art-props`: the manifest lists the three textures under the owner name `props_dress`, and an owner build would run the other builder's texture scripts.
> - **Previews**: pass `--piece art-props-mech` / `--piece art-props-dress` to `tools/preview-asset.mjs` (its default folder is `shots/art-props/`, which nobody owns now). Wherever this order says `shots/art-props/` or `docs/requests/art-props.md`, read your piece's folder and file. The group contact sheets of section 6 belong to the piece whose assets they show: `seam_objects`, `daylight_set`, `proving_set`, `asking_set`, `bore_door_720p70` → mech; `stops`, `rim_stone` → dress.
> - **Tests**: `tests/art_props/index.js`, `tests/art_props/mech/index.js` and `tests/art_props/dress/index.js` are each an unchanged copy of `tests/core/index.js`; whoever arrives first creates the shared one, nobody edits it. Run your own folder: `node --test tests/art_props/mech/` or `…/dress/`.
> - **Definition of done** (section 7) is per piece: your owner's build, your owner's assets and clips, your half of the 0.8 MB (mech 0.5 MB, dress 0.3 MB), and item 6 (append-only textures) is mech's.
> - The two halves share no file and import nothing from each other. The sizes one half needs from the other are in this order.

Read first: `CLAUDE.md`, `docs/PLAN.md`, `docs/workorders/README.md` (**section 4, "Read first":
`docs/FOUNDATION_REPORT.md` sections 2 to 4, 6, 8c and 9, and `blender/lib/README.md`**: they
describe the build driver, the viewer and the checks as they are now); `docs/ART_BIBLE.md`
sections 1, 2, 4, 5 (all), 6 (the knot paragraph), 7.1, 7.4, 12; `docs/ARCHITECTURE.md` 1.1,
7.2, 7.3, 7.5, 7.6, 9.1, 9.2 (**these win over the art bible on names, nodes, pivots and
budgets**); `docs/GDD.md` 13 (the four puzzles: your mechanisms are their moving parts) and
14; then `blender/template_asset.py`, the docstrings of `blender/lib/` (`knot.py`,
`brand.py`, `rig.py`, `anim.py`), and `docs/research/blender-pipeline.md` "twelve things",
sections 6, 7 and "Traps".

## 1. Mission

Everything the player shoots, opens, reads or picks up that is not a wall or a creature.
Pillar 4 (**puzzles that use the gun and the player's attention**) lives in your mechanisms:
the jug gate, the three shutters and their white insulators, the share cloth, the hatch, the
sighting loop, the baffle, the bore door with its eight ports and twelve listening lamps, the
empty cradle. Pillar 3 (**story through place**) lives in your small objects: his coffee pot,
the chair that is not one of theirs, the struck-through tin cup, the plate with a banded
cartridge cast on it, the stone with seven seats. ART_BIBLE 5.5: "the seam is where the story
is, and where every interactable sits": most of your assets are seam objects (Pellam parts
salvaged by the town). Detail is rationed and **spent here**, where hands and eyes go. None
of it may read as a primitive.

## 2. Owned files (exclusive)

```
blender/props/mech/**        one script per props_mech asset: <id>.py
blender/props/dress/**       one script per props_dress asset: <id>.py
blender/tex/tx_mask.py  tx_palette.py  tx_palette_emis.py     art-props-mech ONLY; later revisions only, APPEND-ONLY (no region or cell moves)
tests/art_props/mech/**  tests/art_props/dress/**
shots/art-props-mech/**  shots/art-props-dress/**
docs/requests/art-props-mech.md  docs/requests/art-props-dress.md
public/assets/props/<id>.glb for your ids        written only by `node tools/build-assets.mjs --only …` (the Split box says with what)
```

Each builder owns the `mech` half or the `dress` half of that list, as the Split box says.

Not yours although they live in `public/assets/props/`: `pk_rounds_6`, `pk_rounds_12`,
`prop_cartridge_lead`, `prop_cartridge_line`, `prop_cartridge_kept` (`art-weapons`). Never
edit `blender/lib/`, `design/*.json`, `tools/`, `src/`.

## 3. Rules (short form; ARCHITECTURE 7.2 is the full text)

- One script per asset; build with `node tools/build-assets.mjs --only props_mech` (mech), or a comma list of ids (dress: the Split box), or one id. Deterministic: `random.Random(seed)`. **Nothing ships until it passes**: a `FAILED <id>` leaves the previous files in place; the Blender log is `blender/export/.logs/<id>.log`, and **bake warnings (`WARNING <object>: N faces … baked dark from end to end`) are only in that log** (or with `--verbose`): read it after every build of an asset with AO.
- **Draw calls are counted one per mesh per material** (two meshes sharing a material are two calls; variant nodes count once, as the largest), in Blender and on the shipped file (ARCHITECTURE 7.2).
- **`placedBy: zone` props with bake class `VL` are stamped `AO` in their own file** (the pipeline does it: `export.bake_extras`): you deliver tint × AO × gradients, the zone lights them in place.
- **Judging colour**: the viewer and every `<id>_game.png` show linear values up to 0.8 exactly as authored (README ruling 15: the game uses the same curve), so a palette colour in a viewer frame is the colour in the file. The viewer is unlit; the Cycles sheet (`--cycles`) carries the lit look. A `&shot=1` frame without `&dist=` is fitted (the asset's bounding box fills 90 % of the frame); add `&dist=<metres>` for a close-up of trim or decal detail.
- **Asset-local frame**: root node named by the asset id at the origin; **front is +Z**, up is +Y (game space; author in Blender with front −Y). The pivot is where the table says and where `placeholder.anchor` puts it. **A marker's position is the asset's pivot plus the manifest's `offset`**: you never place anything in the world (exception: `prop_well_sweep`, authored in world coordinates).
- **Names are the contract.** Every name in the "Nodes" column must exist exactly; `nodePos` values are asset-local and `check-glb` holds you to them within 0.03 m; **the visible target must be on its `hitPoint` / node** (the game puts the hit sphere there). Gameplay positions are **empties or bones, never mesh nodes**.
- **Draw calls = one mesh per non-emissive material + one per lamp set.** Therefore (ARCHITECTURE 7.2, ART_BIBLE 7.4): an asset with **more than one moving part, or a moving part beside static parts, is one rigid-skinned mesh per material on a small armature** (one weight per vertex). The manifest lists these (`skinned: true`): `bones` = `root` (the static parts) + one bone per moving part, **named as in the Nodes column**; a name in both `nodes` and `bones` is the bone, every other node is an empty or a lamp-set mesh. They are `ia_ammo_box` (`flap`), `ia_line_locker` (`door`), `prop_stock_gate` (`gate_bar`), `prop_well_sweep` (`sweep_arm`), `prop_yard_gate` (`leaf_l`, `leaf_r`), `ia_yard_bell` (`bell`), `sec_loft_bell` (`rope`, `bell`, `ladder`), `ia_shutter` (`shutter_leaf`, `latch`), `ia_hatch` (`leaf_a`, `leaf_b`), `ia_range_plate` (`plate`), `ia_baffle` (`leaf_l`, `leaf_r`), `prop_door_pellam` (`leaf`), `prop_grate` (`lid`), `ia_cold_bay_shutter` (`shutter`), both lift cages (`gate`), `ia_lift_lever` (`lever`), `ia_bore_door` (`door_disc`), plus `prop_share_cloth` with its own bones. An asset whose whole body is the single moving part and that the manifest leaves unskinned (`ia_yard_door`, `prop_door_frontier`) is an animated empty of that name with the mesh as its child. Code only ever uses `AssetInstance.node(name)` and `action(clip)`, so both forms work. Lamp-set meshes stay separate (`m_emis`, lamp *i* at UV1.x = (i + 0.5)/N, extra `lampCount`).
- **Variant nodes** are sibling child mesh nodes of the root, all present in the file (code shows one).
- **Materials are names only**: `m_prop` (UV0 → a `tx_palette` cell via `manifest.palette_uv(name)`; emissive faces → a `tx_palette_emis` cell), `m_emis` (lamp sets), `m_mask` (signage / cut-outs from `tx_mask` regions), `m_frontier` only where the table lists it. No images in a GLB.
- **`COLOR_0`** (linear) = tint × AO × gradients: `vcol.compose_vertex_color` with AO, height ramp 0.75 → 1.10, per-face jitter ±6 % on Frontier parts and 0 % on Pellam parts, a dark streak under every fastener / sill / seam end; assets that stand outdoors and are **embedded** (`placedBy: zone`) also get the dust skirt and top bleach. A flat-coloured asset is a fail. Bake class `AO` = lit at runtime; `VL` = the zone script lights it in place (you still deliver AO + gradients).
- **Clips**: NLA tracks named exactly, 30 fps, from frame 0, authored length the nearest whole frame to the manifest's seconds, no root motion; never key a `codeDriven` node. Every clip eases out and settles (ART_BIBLE 8.4: weight, then precision), except where stated linear.
- **Modelling**: bevel every hard edge (hand props 2–4 mm; furniture, doors, crates, planks 6–12 mm; Pellam panels exactly 20 mm; one segment, then weighted normals: `mesh.finish`), at least three overlapping parts for anything larger than a cup, Frontier jitter (rotation ±0.012 rad, depth ±4 mm, plank widths 0.16–0.24 m, never two equal neighbours), Pellam exactness (1.2 m module, radii 0.15 / 0.3 / 0.6 m, livery band, cast plate via `brand.maker_plate`, pictogram + asset number `4-nnn`: never 19 or 99, no added sevens). Delete faces nobody sees.
- **Thin geometry**: ≥ 2 mm per metre of viewing distance; cords, rods, rails, rungs and wires are drawn fat (0.03–0.07 m as listed) and carry `thin_ok` where needed.
- **Knots** come from `blender/lib/knot.py` (`collar='hex'`), never hand-built.
- Homage, not copy: no faces, no text that is not in `design/story.json` (plates carry only the four `plate_lines` strings; other lines are raised bars), nothing from `docs/research/art-tone.md` 1.5 / 1.6.
- **Priority order is binding**: all P0 of an owner final before any P1, all P1 before P2. `node tools/asset-status.mjs --owner props_mech` shows where you are. Running out of time: stop at a priority boundary and say which.

## 4. Deliverables: `props_mech` (28)

Sizes are the asset's own, W × H × D in metres. "dc" = draw calls. Openings are sized by the layout marker: read `size` from the marker (`layout.marker(id)`), do not type it.

### P0 (21)

| id | What it is | Tris / dc | Materials | Pivot | Nodes (`nodePos`) | Clips (s) |
|---|---|---|---|---|---|---|
| `ia_ammo_box` | Pellam wall dispenser: enamel box 0.6 × 0.9 × 0.25 on a steel back-plate, a chute with a spring flap, a cast plate, a stencilled `4`; **a dented tin cup on a nail beside it** and a brushed mark above (the town's) | 400 / 3 | `m_prop`, `m_emis`, `m_mask` | back-plate centre at floor level | `lamp` (lamp set 1, aqua), `flap` | `dispense` 0.4: the flap kicks and settles |
| `ia_line_locker` | Pellam locker 0.6 × 1.2 × 0.3: rounded door of opaque `lens` glass, an aqua lamp bar across the top, a brass cradle inside for one upright line round, `picto_line` on the door | 500 / 3 | `m_prop`, `m_emis`, `m_mask` | back centre at floor level | `door` (hinge left), `lamp` (1), `round_slot` (empty: code shows a `prop_cartridge_line` there) | `open` 0.5, `close` 0.5 |
| `ia_jug` | hand-thrown clay jug 0.32 across × 0.42, narrow neck, two lugs, a cord cradle, hanging on a 0.6 m cord. Instanced, no clips | 400 (260 + 140) / 1 | `m_prop` | cord top | variants `jug_intact`, `jug_broken` (neck and lugs still in the cradle, body gone). `hitPoint` (0, −0.81, 0): **the body centre is 0.81 m below the pivot** | — |
| `prop_stock_gate` | the drop-bar gate for `door_jug_gate` (4.0 × 2.8 m): a bar 4.6 × 0.3 × 0.35 of three lashed baulks, underside 2.35 m up when shut, six iron hooks on its −Z face 0.7 m apart, a slatted hurdle 3.9 × 2.35 hanging from it | 500 / 2 | `m_prop`, `m_frontier` | bottom centre of the hurdle, closed | `gate_bar` (**code-driven**: raised 0.2 m per jug, to 2.6 m; everything hangs from it), `hook_1…6` at (−1.75, −1.05, −0.35, 0.35, 1.05, 1.75; 2.36; −0.15), children of `gate_bar` | — |
| `ia_yard_door` | a Pellam access panel used as a door, 2.6 × 2.8 × 0.12: two enamel panels and a 0.2 m edge frame, rounded corners, two hand-forged strap hinges, a steel latch plate 0.3 m square on the street face | 300 / 1 | `m_prop` | hinge axis at ground (bottom of the −X edge) | `leaf`, `socket_knot` (2.25, 1.3, −0.14): 1.3 m up, 0.95 m from the door centre toward the latch edge, on the −Z face | `open` 0.8: swings in 95°, bounces |
| `knot_mech` | the mechanism knot: visual radius 0.16 on a hexagonal collar plate 0.42 across (`knot.build_knot(0.16, 'hex')`). Used ×6 (`knot_a/b/c` at scale 1.25) | 220 / 1 | `m_prop` | collar back centre | `knot_live` (the lobe cluster: code squashes it to half height when burst). `hitPoint` (0, 0, 0.08) | — |
| `prop_door_frontier` | ledged-and-braced plank door 1.6 × 2.4 × 0.08, leather hinge straps, a peg latch (`door_alley`, `door_tally`) | 160 / 1 | `m_prop` | hinge axis at ground | `leaf` | `open` 0.6 |
| `ia_shutter` | board shutter leaf 1.2 × 0.9 hinged along its **bottom** edge, held by an iron pull-rod (0.03 m, fat) running down the wall to a **white ceramic insulator 0.12 × 0.16**, the brightest small thing in the room | 160 / 1 | `m_prop` | hinge axis centre (bottom edge of the leaf; 0.45 m below the opening centre) | `shutter_leaf`, `latch` (0, −0.55, 0.06): the insulator's centre, 0.06 m proud of the wall; hit radius 0.14 | `drop_open` 0.5: the rod drops, the leaf falls **outward** 150°, bangs, rattles twice (the insulator vanishes on frame 0: its shatter is VFX) |
| `prop_share_cloth` | the town's banner: `linen` 1.6 × 1.2 on one 0.25 m cord (0.05 m fat), twelve `family_marks` in `town_paint` in a grid, a frayed hem (`card_edges`). **Skinned**, bones `cloth_root`, `cloth_1`, `cloth_2`, `cloth_3` | 200 / 2 | `m_prop`, `m_mask` | cord top | `cord` (0, 0, 0): hit target; `cloth` (0, −0.855, 0) | `fall` 1.2: the cord parts, the cloth drops and settles in a heap |
| `prop_day_cell` | pale ceramic disc 0.6 across, 0.08 thick, slightly domed, in a steel bezel on a 1.0 m steel drop-arm | 200 / 2 | `m_prop`, `m_emis` | back centre | `cell_face` (lamp set 1: off → aqua) | — |
| `ia_hatch` | Pellam floor hatch filling 4 × 2 m: two enamel leaves 4.0 × 1.0 meeting on the long centreline, sliding apart north and south into the frame. (Latch block and cowl are zone geometry.) | 500 / 2 | `m_prop`, `m_emis` | opening centre at floor level (leaves hang below: placeholder anchor `top`) | `leaf_a`, `leaf_b`, `socket_knot` (1.6, 0.9, 1.35), `latch_lamp` (1) | `open` 1.0: each leaf slides 1.0 m, **linear in time** (code holds it at 15 % for "ajar": a 0.3 m gap); `close` 1.0 |
| `prop_proving_step` | steel-edged step 1.6 × 0.15 × 1.6 with a `brass` disc 0.5 across let into its centre and `picto_misc` footprints | 160 / 3 | `m_prop`, `m_emis`, `m_mask` | base centre | `mark_glow` (lamp set 1: aqua rim, off until "standing right") | — |
| `prop_sighting_loop` | ceramic ring 0.5 inner diameter, 0.06 section, graduated ticks on its face, on a steel post | 220 / 2 | `m_prop`, `m_emis` | post base | `loop_rim` (lamp set 1) at (0, 2.018, 0): **the ring centre is 2.018 m above the pivot** | — |
| `ia_baffle` | Pellam baffle door 3 × 3 × 0.3: two ceramic leaves with interlocking stepped edges and a `hazard` diagonal; a lamp bar that mounts on the wall **above the lintel, outside the 3 × 3 leaf area** | 500 / 3 | `m_prop`, `m_emis`, `m_mask` | sill centre | `leaf_l`, `leaf_r`, `door_lamps` (lamp set 3) | `open` 3.0: grinds apart, uneven: the left leaf sticks at 70 % then frees |
| `prop_door_pellam` | Pellam sliding door leaf 3.0 × 3.0 × 0.12: enamel panels on the 1.2 m module, steel edge frame, livery band, a pull recess at 1.6 m, a top track 0.2 m deep above the opening | 220 / 1 | `m_prop` | sill centre, closed | `leaf` | `open` 1.0 (slides right 2.9 m, a hard stop and settle), `close` 1.0 |
| `ia_lift_cage` | the hall lift cage, **interior 6 × 3.5 × 6**: steel frame, grille walls (`grille` on `m_mask`), plate floor, a folding gate filling the whole +Z side, a lamp. Two instances | 900 / 3 | `m_prop`, `m_emis`, `m_mask` | floor centre | `gate` (0, 0, 2.95), `gate_lamp` (lamp set 1: off / aqua) | `gate_open` 1.0, `gate_close` 1.0 |
| `ia_proving_lift_cage` | the proving lift, **interior 4 × 3.5 × 4**, a 3 × 3 m gate on +Z, a call plate on the back wall. **Built from the same parts as `ia_lift_cage` (1.2 m module), not scaled from it.** Two instances | 700 / 3 | `m_prop`, `m_emis`, `m_mask` | floor centre | `gate` (0, 0, 1.95), `gate_lamp` (1), `control` (0, 1.2, −1.8) | `gate_open` 1.0, `gate_close` 1.0 |
| `ia_lift_lever` | floor lever: steel pedestal 0.3 × 0.3 × 1.0, a 0.6 m lever with a ceramic knob, a quadrant with two detents | 180 / 1 | `m_prop` | base centre | `lever` (0, 1.0, 0): pivot at the quadrant (the grip is 1.2 m up: the layout marker) | `throw` 0.6 |
| `ia_bore_door` | ceramic disc **3 m across**, 0.25 thick, in a steel frame with `hazard` diagonals. On the +Z (antechamber) face: a ring of **eight ports** at 1.0 m radius, each a dark recessed socket 0.3 across with a brass bezel and a lamp at its rim, and a **geometry numeral 1–8, 0.22 m tall** inside the ring beside it (`brand.numeral_mesh`), numbered **clockwise from the top as seen from the antechamber**; an outer ring of **twelve listening lamps** (0.08, brass bezels) at 1.42 m radius | 1 400 / 3 | `m_prop`, `m_emis` | disc centre | `door_disc`; `port_1…8` empties at (0, 1, 0.145), (0.707, 0.707, 0.145), (1, 0, 0.145), (0.707, −0.707, 0.145), (0, −1, 0.145), (−0.707, −0.707, 0.145), (−1, 0, 0.145), (−0.707, 0.707, 0.145); `port_lamps` (lamp set 8), `listen_lamps` (lamp set 12, at (0, 0, 0.145), filling clockwise from the top) | `open` 2.5: the disc rolls aside to the left on its track, rotating 200° as it goes |
| `ia_cradle` | **load-bearing.** A cast ceramic wall unit 0.5 × 0.5 × 0.2 with a lit recess holding a brass cradle shaped for **one banded round, empty**; clean (no dust skirt, no stain) **except one thumbprint in the dust on the niche lip** (a dark oval in vertex colour); above it the mark in 10 mm relief, 0.5 m tall (`brand.pellam_mark`), a small lamp at each disc. Overall 0.5 × 1.1 × 0.2. A `prop_cartridge_kept` (12 × 41 mm, banded) must fit the cradle exactly | 400 / 3 | `m_prop`, `m_emis` | back centre | `cradle_lamp` (lamp set 1), `mark_lamps` (lamp set 7; index 6 = the seventh disc, dark until the proof) | — |
| `prop_station_plate` | enamel plate 0.8 × 0.8 × 0.03 with a geometry `4` 0.4 m tall, the wordmark and `LIFT STATION 4` | 220 / 2 | `m_prop`, `m_emis` | back centre | `plate_lamp` (lamp set 1) | — |

### P1 (5)

| id | What it is | Tris / dc | Materials | Pivot | Nodes | Clips |
|---|---|---|---|---|---|---|
| `prop_well_sweep` | the pylon's fallen arm (ceramic, 5.5 m, insulator stack on its tip) lashed with cable to a forked timber post 3 m tall as a counter-weighted sweep; a net of stones on the short end; a cord to the gate bar. **Authored in world coordinates**: post beside the gate, arm tip at layout `prop_pylon.params.sweepTo` (1, 4.2, 0) | 600 / 1 | `m_prop` | world origin | `sweep_arm` (**code-driven**: pivot at the fork, rotated 4° per jug) | — |
| `prop_yard_gate` | double timber wagon gate filling 4.0 × 3.0: two leaves 2.0 × 2.9, Z-braced, strap hinges, a bar | 400 / 1 | `m_prop` | hinge line centre at ground | `leaf_l`, `leaf_r` | `burst_open` 0.5: both leaves fly outward 100°, the bar splits; holds the open pose |
| `ia_yard_bell` | white ceramic insulator stack 0.28 × 0.4 (four skirts) in a timber yoke on a 2.2 m post | 260 / 1 | `m_prop` | post base | `bell` (0, 2.2, 0): swing pivot; also the `hitPoint` | `ring` 1.2: swings 18° and damps |
| `ia_range_plate` | ceramic test plate: disc 0.7 across, 0.04 thick, on two cable loops from a hook. Three instances | 100 / 1 | `m_prop` | hook | `plate`. `hitPoint` (0, −0.45, 0) | `ring` 0.8: swings 10° and damps |
| `prop_grate` | steel grate 1.2 × 0.06 × 1.2: `grille` in a 0.08 m frame, hinged on one edge. Eight placements | 40 / 2 | `m_prop`, `m_mask` | hinge edge centre | `lid` | `flip_open` 0.4: thrown back 110°, clangs, stays |

### P2 (2; GDD 20.1 rows 1 and 7: cuttable secrets)

| id | What it is | Tris / dc | Pivot | Nodes | Clips |
|---|---|---|---|---|---|
| `sec_loft_bell` | the same insulator on a 1.2 m cord (0.05 m fat) from a hoist arm, and a 3.2 m ladder (rails 0.07 m, six rungs) stowed above | 300 / 1 (`m_prop`) | hoist arm tip | `rope` (0, −0.6, 0): hit target; `bell` (0, −1.2, 0); `ladder` | `fall` 0.9: the rope parts, the bell drops and bounces, the ladder swings down to rest along the layout ramp `st_loft_ladder` (37°) |
| `ia_cold_bay_shutter` | steel roller shutter 3 × 3 × 0.1 of 0.3 m slats | 260 / 1 (`m_prop`) | sill centre | `shutter`, `socket_knot` (3, 1.6, −0.62) | `open` 1.5: rolls up |

## 5. Deliverables: `props_dress` (29; no clips)

"Embedded" = `placedBy: zone`: the zone scripts import your **raw** export from `blender/export/props/` and merge it; it is never loaded on its own, so your job is shape, AO and colour. "Instanced" = one mesh, one material, no skin, per variant node.

### P0 (15)

| id | What it is | Tris | Materials | Pivot | Variant nodes / notes |
|---|---|---|---|---|---|
| `pk_canteen` | round blanket-covered canteen 0.24 across × 0.09: `linen` cover, `leather` strap looped twice, `tin` neck and cork; lies on its side. Instanced, runtime | 220 | `m_prop` | base centre | pickups glint by VFX: leave a clean brass / tin highlight area |
| `prop_wagon_tipped` | freight wagon bed 3.6 × 1.5 × 0.9 tipped on its side (2.1 m as it lies), one 1.2 m wheel with 12 fat spokes in the air, one half buried, tongue broken, a drift inside. Embedded; **full-height cover**: fill the layout solid | 1 200 | `m_prop` | base centre | |
| `prop_trough_pump` | dry plank trough 2.4 × 0.6 × 0.5 with a hand-pump post 1.6 m (iron, handle up), the brushed mark on the trough end, sand to the brim. Embedded | 450 | `m_prop` | base centre | the kneeler sets its cup on the rim: keep a flat 0.12 m rim |
| `prop_cup_tin` | dented tin cup 0.09 × 0.08 with a wire handle. Instanced, runtime (the kneeler's hand prop; and **the Dowser's cup** at stop two with a dark dried ring inside it in vertex colour) | 60 | `m_prop` | base centre | |
| `card_dowser` | the Dowser billboard: a 0.9 × 2.0 m alpha-tested quad using `tx_mask` region `card_dowser`: a pale long-coated figure (`#D9D2BF`) with a hat and a forked rod held low, three-quarter **away**, clerkly and upright: no face, no robe, no hood, nothing dark, nothing magical | 2 | `m_mask` | feet | node `glint` (empty at the rod tip). You own the `card_dowser` region drawing in `tx_mask.py` |
| `prop_camp_ash` | a ring of seven fist stones 0.7 across round a bed of grey ash with three charred stick ends, swept clean round it | 600 (2 × 300) | `m_prop`, `m_emis` | centre at ground | `ash_cold` (the town's ash, Tally firebox); `ash_embers` (**stop three, the Dowser's only fire**: orange emissive cells between the sticks, one white-hot). Neat: he tidies |
| `prop_coffee_pot` | blue-grey enamelled tin pot 0.16 × 0.22, spout, wire handle, chipped rim, lid off and set beside it, inside black. Embedded (stop one) | 160 | `m_prop` | base centre | |
| `rd_note` | ruled ledger paper 0.13 × 0.2, folded once, ruled in graphite (`m_mask`). Embedded | 120 (4 variants) | `m_prop`, `m_mask` | centre | `note_lip`, `note_hearth` (square to the hearthstone edge), `note_cradle` (tucked into a niche lip: one edge bent), `note_stone`. The weights (cases) are `art-weapons` assets placed by the zone script |
| `rd_plate` | Pellam cast plate 0.6 × 0.34, 16:9, four rivets, 6 mm proud, raised border; mark at left, wordmark, raised bars for body lines. Embedded | 750 (3 × 250) | `m_prop`, `m_mask` | back centre | `plate_line` (`picto_line` + `LINE CHARGE. FOR SIGHTING.`); **`plate_proving`** (load-bearing: **a banded cartridge in 8 mm relief, 0.25 m tall** + `PROVING CHARGE. BANDED.` + `DO NOT KEEP.`); `plate_service` (`TAMPING UNIT.`) |
| `prop_tally_table` | long trestle table 11.0 × 0.8 × 1.4 (X 1.4, Z 11: the layout's `ty_table` footprint) of four plank leaves on five trestles, top at 0.76–0.8 m; **eleven pairs of pale patches** where hands rest. One mesh. (The dragged fifth leaf against the north wall is built by `art-env-interior` as zone geometry in the same plank style: boards 0.2 m, `board` / `board_bleached`, 8 mm bevel.) Embedded, casts into `lm_tally` | 900 | `m_prop` | centre at floor | hand patches must line up with the seat markers (`prop_tally_seated.params.seats` + the two riser seats) |
| `prop_chair` | plain ladder-back chair, rush seat, 0.45 × 0.95 × 0.45. Embedded ×11 (the zone script jitters each copy) | 150 | `m_prop` | base centre | seat height 0.45 so `art-enemies`' seated figure sits on it |
| `prop_head_chair` | **not one of theirs**: a folding camp chair of pale canvas and turned wood 0.5 × 0.85 × 0.5. Clean. Embedded | 180 | `m_prop` | base centre | the middle blade lands on its seat (0.8 m up at the marker) |
| `prop_coat_hung` | a work coat on a peg, 0.5 × 1.1 × 0.15, `workcloth` family colours. Instanced dressing with wind (height above the pivot = sway weight; pivot at the fixed end) | 270 (3 × 90) | `m_prop` | peg (top) | `coat_long`, `coat_short`, `coat_shawl` |
| `ia_proving_mark` | brass disc 0.5 across let flush into the floor, a raised rim and the plumb glyph (a dot under a short stroke) in relief. Embedded ×6 in the bore sector, bake class `LM` (its glow is the zone's `mark_glows`) | 60 | `m_prop` | centre at floor | dark brass |
| `prop_rim_stone` | flat slab 0.9 × 0.12 × 0.5, top swept clean, **seven shallow seats in a row** (each fits a 12 mm case head; 0.11 m apart). Embedded | 80 | `m_prop` | base centre | seat 7 is at the layout's `ia_stone_round` when the slab stands at `rim_stone` (1.6, 18, 102.4) |

### P1 (7)

| id | What it is | Tris | Pivot | Notes |
|---|---|---|---|---|
| `prop_water_cart` | two-wheeled cart 3.2 × 2.1 × 1.6 carrying a 1.2 × 1.8 staved barrel on its side, shafts on the ground, bung out. Embedded; yard cover | 900 | base centre | `m_prop` |
| `prop_lantern` | square tin lantern 0.16 × 0.34 × 0.16, four horn panes (opaque, warm), a wire bail, a flame cell inside (emissive quad cross). Instanced dressing, breakable | 360 (2 × 180) | bail top | variants `lantern_lit`, `lantern_dark` |
| `prop_kettle` | squat tin kettle 0.2 × 0.18 with a bail (stop three). Embedded | 180 | base centre | steam is VFX |
| `prop_flat_stone` | flat river stone 0.5 × 0.08 × 0.35 (stop one: the pot stands on it). Embedded | 60 | base centre | |
| `rd_ledger` | bound ledger 0.3 × 0.05 × 0.42, cloth spine, open at the last written page, a pencil in the gutter. Embedded | 120 | base centre | |
| `prop_hat_hung` | broad-brimmed felt hat 0.38 across × 0.14. Instanced dressing | 50 | peg | |
| `prop_boots_pair` | a pair of work boots side by side 0.3 × 0.28 × 0.25. Instanced dressing | 90 | base centre | |

### P2 (7)

| id | What it is | Tris | Pivot | Notes |
|---|---|---|---|---|
| `prop_bottle` | three bottle shapes 0.08 × 0.28, opaque `lens`-dark glass with one painted vertical highlight. Instanced breakables | 180 (3 × 60) | base centre | variants `bottle_a/b/c` |
| `prop_crate` | plank crate 0.7 m cube from parts (core + planks + frame boards), lid askew. Instanced; box collider tagged `pierce` | 300 | base centre | |
| `prop_barrel` | staved barrel 0.6 × 0.9, three hoops, sunken lid | 330 | base centre | |
| `prop_sack` | slumped grain sack 0.7 × 0.3 × 0.4 | 120 | base centre | not burlap-faced; just a sack |
| `prop_strain_cloth` | a square of well-linen 0.8 × 0.8 hung over a line or folded; wind by height below the pivot | 60 | top edge | |
| `rd_rain_tally` | a child's wood-framed slate 0.22 × 0.3, chalk strokes in fives (`tally` on `m_mask`), a cord loop, a nub of chalk. Embedded (loft) | 60 (2 dc) | base centre | the model shows strokes only, no words |
| `prop_bench` | plank bench 2.2 × 0.45 × 0.3. Embedded | 90 | base centre | |

## 6. Tests and evidence

`tests/art_props/mech/*.test.mjs`, `tests/art_props/dress/*.test.mjs` (`node --test tests/art_props/`):

- [ ] `check.test.mjs` (each folder): `check-glb` on the owner's ids; `asset-status --require=0 --owner <owner>` exits 0.
- [ ] `fit.test.mjs` (mech): for each row of ART_BIBLE 7.1's openings table the asset's bounding box at rest matches the layout marker's `size` within 0.05 m (`prop_stock_gate`, `prop_yard_gate`, `ia_yard_door`, `prop_door_frontier`, `ia_shutter`, `ia_hatch`, `ia_baffle`, `prop_door_pellam`, `ia_cold_bay_shutter`, `ia_bore_door`, both cages against `nav.portals[].cageInterior`); **placed by `data.placement` rules** (marker + offset, rotY + π) each `nodePos` node lands on its partner marker within 0.05 m: `latch` on `ia_latch_s/m/n`, `socket_knot` on `knot_yard_latch` / `knot_hatch_latch` / `knot_cold_bay`, `port_n` on `ia_ask_port_n`, `cord` on `ia_cloth_cord`, `rope` on `sec_loft_bell_rope`, `control` on `ia_proving_lift`, `hook_n` + (0, −0.81, 0) on `ia_jug_n`, `loop_rim` on `pz_sighting_loop`.
- [ ] `hit.test.mjs` (mech): for every asset with a `hitPoint` or hit node, drawn triangles of the target lie inside the marker's `hitRadius` sphere and fill at least 60 % of its silhouette from the front (the visible target and the hit sphere coincide).
- [ ] `clips.test.mjs` (mech): every clip through `sandbox/viewer.html?asset=<id>&clip=<name>&shot=1` at t = 0, 0.5, 1: no console error; end pose differs from start; `ia_hatch` `open` at 15 % leaves a 0.30 ± 0.02 m gap; `gate_open` leaves the full opening clear.
- [ ] `variants.test.mjs` (dress): every variant node present and non-empty; instanced assets are one mesh, one material per variant; `card_dowser` is exactly 2 triangles.
- [ ] `viewer.test.mjs`: every asset loads through the real asset store with triangles and draw calls within its manifest entry.

`shots/art-props/` (open every one): `<id>_sheet.png` for all 57; `<id>__<clip>.png` strips for all 24 clips; `<id>_game.png` (viewer) for every P0; group contact sheets `seam_objects.png`, `daylight_set.png` (shutter + latch, cloth, day-cell, hatch at 0 / 15 / 100 %), `proving_set.png` (step, loop, three knots **rendered from the layout's eye point (−82.2, −10.2, −15.0): the three knots must nest inside the ring**), `asking_set.png` (bore door at 6 m with all lamps lit, cradle, station plate), `stops.png` (pot + stone, chair + cup, embers + kettle), `rim_stone.png`; `bore_door_720p70.png` (the numerals at 6 m, 1280 × 720 × 0.7: must be legible: GDD test 13).

## 7. Definition of done (measured)

1. Your build (the Split box: `--only props_mech`, or dress's id list) succeeds from clean.
2. Every asset at or under its triangle and draw-call budget (tables above); list the actual numbers.
3. `asset-status`: 0 placeholders at P0 for both owners (36 assets, 20 clips at P0); state exactly how far P1 and P2 got.
4. Download share: all 57 GLBs ≤ 0.8 MB total after optimise.
5. ART_BIBLE section 12 items 9–19 (incl. 18b) and 22 marked PASS / FAIL per asset group with the file looked at. Silhouette check: each P0 asset over 0.3 m rendered black on white from two angles is not a plain box, cylinder or sphere.
6. Shared-texture revisions append-only; `tests/pipeline/textures.test.mjs` still passes.

## 8. Non-goals

Cartridges and round pickups (`art-weapons`); creatures, seated figures, stakes, canisters;
zone geometry (walls, the latch cowl, wall diagrams, door frames, the yard drum door, pegs);
placing anything in the world; VFX (shards, sand pour, steam, glints, halos, sun blades);
behaviour; colliders (the game builds boxes from marker sizes); sounds; LODs.

## 9. Dependencies

- `foundation-pipeline` placeholders with your final names already exist and are loaded by the game; replacing one must change nothing but its look. If a pivot, node position or size in the manifest looks wrong to you, **do not deviate**: write `docs/requests/<your piece>.md`.
- `art-env-exterior` and `art-env-interior` embed your `placedBy: zone` assets from `blender/export/props/`: keep raw exports building at all times (a broken script blocks two zones).
- `art-weapons` owns the cartridge your cradle, locker slot and stone seats must fit: case 12 mm × 33 mm, overall 41 mm; the kept round's band is 9 mm wide round the waist.
- `code-world` plays your clips and drives `gate_bar`, `sweep_arm`, lamp sets and variant swaps; `code-render` lights you (`m_prop`: zone ambient + key) and draws halos on lamps. Judge final look in `sandbox/viewer.html`; until `code-render` lands it shows vertex colour × palette (and `tx_mask` cut-outs, `tx_palette_emis`) only, unlit.
- **Test helpers in the viewer** (FOUNDATION_REPORT 4): `__dbg.ext.viewer.pose(names?)` → position, quaternion and scale of nodes and bones in asset space (as `nodePos`), clip pose and overrides applied: use it for `fit.test.mjs` and `clips.test.mjs`; `__dbg.ext.viewer.setBone(name, { rot: [xDeg, yDeg, zDeg], scale })` drives a code-driven bone (`gate_bar`, `sweep_arm`) on top of the clip's pose; `__dbg.ext.viewer.setClip(name, t01)` holds a clip at a fraction (`ia_hatch` `open` at 0.15); `__dbg.ext.viewer.project(node)` → screen fractions. The URL form is `&clip=<name>&t=<0..1>&shot=1`.
