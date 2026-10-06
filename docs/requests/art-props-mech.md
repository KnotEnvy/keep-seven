# Requests and notes from `art-props-mech`

Everything below is worked around locally; nothing in another owner's file was edited.

## To `level-design` / the layout owner (design/layout.json)

1. **`knot_a`, `knot_b`, `knot_c` face north (rotY 0), so from the brass mark they are seen edge-on.** The layout's
   eye point (−82.2, −10.2, −15.0) looks east along the gallery; `knot_mech` faces its asset +Z, which `rotY 0 + π`
   turns to world −Z. Evidence: `shots/art-props-mech/proving_set.png` (left tile, rendered from the eye point: the
   three knots nest inside the ring, but as collar edges with a few lobes showing). Asked: `rotY: -90` on the three
   markers (they would then face west, toward the step). The hit spheres are unaffected.
2. **`prop_sighting_loop`'s front (+Z) faces away from the step** (`pz_sighting_loop` rotY −90). Worked around: the
   ticks are on the asset's back face and the `loop_rim` hairline is on both faces. No change needed unless the
   marker is turned, in which case the ticks move with it to the far side.
3. **`st_loft_ladder` is a 4 × 3 m ramp (5.0 m long at 37°); the order's ladder is 3.2 m.** A 3.2 m ladder at 37°
   from the porch top ends 1.1 m above the street. `sec_loft_bell`'s ladder is therefore 5.0 m (the layout wins on
   positions); it is stowed lashed up the facade above the porch and swings down 74° onto the ramp.

## To `code-world` (behaviour that the files assume)

4. **`prop_well_sweep.sweep_arm`** is a vertical bone (identity rest frame = game axes) at the fork, game
   (3.6, 3.0, 3.6). The arm runs from the fork to the layout's `sweepTo` (1, 4.2, 0). Raise it by turning the bone
   **+4° per jug about the game axis (0.8107, 0, −0.5855)** (also stored as the bone's custom property `hingeAxis`;
   verified: it is in the shipped file as extras `{"hingeAxis": [0.8107, 0, -0.5855]}` on the `sweep_arm` joint node). The post stands at game (3.6, 0, 3.6) on
   the forecourt beside the gate: please check against the lip's terrain once `art-env-exterior` lands.
5. **`prop_stock_gate.gate_bar`** is a vertical bone (identity rest frame): raising it is `position.y += 0.2` per jug
   in its parent's space (the parent `root` bone is identity too). `hook_1…6` ride it (tested:
   `tests/art_props/mech/clips.test.mjs`).
6. **`ia_shutter.drop_open` keys the `root` bone**: the freed pull-rod rides `root` and falls to the hall floor
   (4.05 m below the hinge). `shutter_leaf` and `latch` are siblings of `root` (not its children), so the leaf and the
   (vanished) insulator do not fall with it. Nothing else rides `root`.
7. **`ia_bore_door`'s `port_1…8` empties and both lamp sets (`port_lamps`, `listen_lamps`) are children of the
   `door_disc` bone**, so they roll away with the disc during `open`. Before `open` they rest exactly at their
   nodePos (tested).
8. **Cage gates fold upward, hung from the header.** `gate_open` scales the `gate` bone's height to 7 % and lifts it by
   `gate height x (1 - scale)` on every frame, so the hanger rail stays on the header line through the whole clip
   (tested at 21 points of both clips); over the last quarter the bundle draws up into its park above the opening (hall
   cage 3.50–3.75 m, proving cage 3.00–3.21 m: tested). The gate collider should be removed at the end of `gate_open`.
9. **`ia_hatch.open` is linear** (15 % = 0.300 m gap, tested); `close` eases and knocks.

## To `code-render`

10. **`knot_mech` is one mesh node `knot_live`** (lobes and hex collar together: the manifest gives it one draw call
    and the placeholder was one node). Squashing `knot_live` to half height squashes the collar plate as well. If
    that reads wrong, the manifest needs a second draw call (a separate collar mesh) or `knot_live` must be a bone.
11. Lamps that are "off until triggered" carry `COLOR_0.G = 1.0` (flicker group 1): `prop_day_cell.cell_face`,
    `prop_proving_step.mark_glow`, `prop_sighting_loop.loop_rim`, `prop_station_plate.plate_lamp`, `ia_bore_door`
    `port_lamps` and `listen_lamps`. The others (ammo box, locker, hatch latch, baffle, cages, cradle) are steady (G 0);
    `ia_cradle.mark_lamps` index 6 must be masked off by code until the proof.

## To the manifest owner (design/assets.json), for a later revision

12. **`prop_station_plate` has no `m_mask`**, so `PELLAM DEEPWORKS` and `LIFT STATION 4` cannot be written on it;
    they are cast raised bars (as every unread plate line is). Adding `m_mask` (and one draw call) would let the
    plate carry the `wordmark` and `station` regions of `tx_mask`.
13. **`prop_grate` pivot.** The order says "hinge edge centre", but the placeholder (anchor `centre`) and the
    `climb_out` binding (offset [0, 0.03, 0]) centre the grate on the spawn marker. The final file keeps the grate
    centred on its pivot (so it covers the spawn hole) and puts the hinge (`lid` bone) on its back edge.
14. `ia_ammo_box` and `ia_line_locker` carry decals outside the manifest's placeholder box (the town's brushed mark
    above the dispenser, at 1.1–1.6 m; the cup on its nail; the locker's cut cable): collision is `none`, so this is
    harmless, but the bounds are larger than the placeholder's.

## Tests whose criteria were adjusted (tests/art_props/mech)

- `clips.test.mjs`: "end pose differs from start" does not hold for clips that return to rest by design
  (`ia_ammo_box.dispense`, `ia_yard_bell.ring`, `ia_range_plate.ring`): there the quarter pose must differ and the
  end must equal the start.
- `hit.test.mjs`: a 5 cm cord or rope cannot fill 60 % of a 12 cm hit sphere. Cords and ropes must be centred
  (within 35 % of the radius) and fill at least 10 % (measured: share-cloth cord 24 %, loft rope 25 %); every other
  target must fill 60 % (measured 64–100 %).
- `fit.test.mjs`: `prop_stock_gate` is checked against its own spec (hurdle 3.9 m in a 4.0 m opening, bar underside
  2.35 m, bar 4.6 m) rather than "bbox = marker size", because a drop-bar gate is not supposed to fill the opening to
  its full height.

## Requests received from `art-props-dress`

- Row 1, redraw `card_dowser` (three-quarter away): **done**. The drawing supplied in
  `scratch/art-props-dress/dowser_card.py` replaces the body of `card_dowser` in `blender/tex/tx_mask.py`; same region,
  same rectangle, no other region or cell touched (`blender/lib/mask_regions.json`: only `card_dowser.glint_px` changed,
  to [122.0, 159.144]). `node tools/build-assets.mjs --only tx_mask` built; `node --test tests/pipeline/textures.test.mjs`
  8/8 pass. Evidence: `shots/art-props-mech/mask_regions.png`. `art-props-dress` must rebuild `card_dowser` by id.
- No palette cell or other mask region was requested.

## Resumed pass (after the outage)

- `ia_cradle` gained a cast niche lip (a 0.28 x 0.026 m sill standing 25 mm proud under the recess); the thumbprint now
  sits on its front face. The unit is therefore 0.225 m deep at the lip (0.2 m elsewhere); `check-glb` passes (394 / 400).
- Bake warnings left in `blender/export/.logs/` for `ia_lift_cage` / `ia_proving_lift_cage` (floor and roof plates) are
  handled after the bake by `mc.lift` in `mech_cage.py`; the small ones on `ia_ammo_box`, `prop_day_cell`, `ia_bore_door`
  and `prop_well_sweep` (1-6 % of the surface, faces against a neighbouring part) are left as they are.
- Download share: the 28 files total 505 984 bytes (0.48 MiB; 6 kB over a decimal 0.5 MB).

## Fix pass after the critic (6.5 / 10)

What changed is in the piece report; what other owners need to know:

- **To `code-world` / `code-render`: `prop_share_cloth` is no longer rigid-skinned.** The cloth is a 4 x 3 grid of 0.4 m
  cells; the batten row follows `cloth_1`, every other grid vertex is blended between `cloth_1/2/3` (up to three
  weights). Bones, nodes, clip name and length are unchanged. The family marks now fill their cells (the drawn mark
  is about 0.25 m, it was 0.14 m) and sit on the cloth's own vertices. `fall` scales `cloth_1` to 0.72 in X and ends
  with the batten hem 4.31 m below the cord top, the lowest vertex 4 mm above the hall floor (4.72 m down). The mesh
  travels 4.4 m from its rest bounds: it must not be frustum-culled by its rest box (`src/core/assets.ts` already
  sets `frustumCulled = false` on skinned meshes).
- **To `code-world`: `ia_shutter.drop_open` shows the insulator on frame 0 and hides it on frame 1** (33 ms later), so
  the rest pose and the clip's first frame agree. The order's text says "vanishes on frame 0".
- **To `level-design` (request 1, STILL OPEN, a failing puzzle read):** `shots/art-props-mech/proving_set.png` was
  re-rendered from the eye point after this pass: the three knots still nest in the ring as collars seen edge-on.
  The cure is `rotY: -90` on `knot_a`, `knot_b`, `knot_c` in `design/layout.json`; nothing in this piece's files can
  turn them (`knot_mech` is one asset for six placements, built by `blender/lib/knot.py`).
- **To the manifest owner:** `ia_cradle` is at 400 / 400 with six-sided discs in the mark; +100 triangles would buy
  eight-sided discs and a rounder stele head. `ia_proving_lift_cage` is at 696 / 700: its roof panel has no loops and
  keeps a flat vertex value (the hall cage's floor and roof and the proving cage's floor now carry real loops).
- **Download share:** the 28 files total 513 600 bytes (0.490 MiB; 13.6 kB over a decimal 0.5 MB). The growth is the
  well sweep (368 -> 593 triangles, +6.8 kB) and the hall cage's floor loops. Asked: accept 0.49 MiB, or say so and
  the bore door's UV1 / skin data is the next thing to trim.
- **Bake warnings that remain** (`blender/export/.logs`): `ia_ammo_box` 1 face (the flap, baked shut against the chute
  mouth: lifted after the bake, which is the right cure for a face that opens), `ia_bore_door` 2 faces (the track and
  guide under the frame: lifted; 31 triangles to spare, not enough for loops along 3 m), `ia_yard_bell` 1 face (a
  knee brace, both ends let into timber; 12 triangles to spare), `prop_well_sweep` 2 faces (0.04 m2, inside the
  lashing), `ia_lift_cage` 12 % and `ia_proving_lift_cage` 24 % (roof panels and beams under the roof). `prop_day_cell`
  is clean (a loop on the arm).

### ART_BIBLE section 12, items 9–19, 18b, 22 (files in `shots/art-props-mech/`, all opened in this pass unless dated)

| Item | Mechanisms and doors (bore door, baffle, hatch, cages, lever, Pellam / Frontier / yard doors, gates, shutters) | Puzzle elements (jug, knot, share cloth, day cell, step, loop, range plate, bells) | Story and wall units (cradle, station plate, ammo box, locker, well sweep) |
|---|---|---|---|
| 9 no primitive read | **PARTLY**: `silhouettes.png`. PASS: stock gate, yard door (broken corner), cages, lever, bore door. FAIL as bare rectangles: `prop_door_pellam`, `ia_hatch`, `ia_baffle` (they must fill their openings within 0.05 m: item 18b; no break was added) | PASS: `silhouettes.png`, `prop_day_cell_cycles.png`, `ia_yard_bell_cycles.png` | PASS: `ia_cradle_cycles.png` (stele, shoulder, lip), `prop_station_plate_cycles.png` (broken corner, cable), `prop_well_sweep_cycles.png` |
| 10 Frontier jitter, lean | PASS: `seam_objects.png` (stock gate, propped board); `prop_door_frontier_cycles.png` (10-02) | PASS: `ia_yard_bell_cycles.png` (tapered leaning post, uneven braces) | PASS: `sweep_close.png` (3 degree lean, uneven prongs) |
| 11 vertex-colour set | PASS with the bake warnings listed above: `ia_lift_cage_game.png`, `ia_proving_lift_cage_game.png` | PASS: `prop_share_cloth_game.png` (open value + fold shading; its AO was noise) | PASS: `ia_cradle_game_close.png` (clean by design: no skirt, lit niche, one print) |
| 12 nothing under two pixels | PASS: `bore_door_720p70.png` (numerals at 6 m) | PASS: cords 0.05 m, loop hairline, `proving_set.png` | PASS at 1 m: `ia_cradle_game_close.png` (cheeks 6 mm: read at 1 m, not at 3 m) |
| 13 the seam shows | PASS: `seam_objects.png` | PASS: `daylight_set.png` | PASS: `prop_well_sweep_cycles.png` |
| 14 decay in silhouette | PASS: yard door corner, yard gate (10-02) | PASS | PASS: plate corner and cable, sweep's broken root |
| 15 scale reads | PASS: `asking_set.png` | n/a | PASS: `asking_set.png` |
| 16 the mark exact | n/a | n/a | PASS (lib `brand.pellam_mark`; six-sided discs): `ia_cradle_cycles.png`, `asking_set.png` |
| 17 struck-through town marks | n/a | n/a | PASS: `ia_ammo_box_cycles.png` (10-02), `seam_objects.png` |
| 18 the Pellam trio | PASS (band + cast plate, checked in the scripts: `brand.maker_plate`): baffle, both cages. PARTLY: `prop_door_pellam`, `ia_lift_lever` carry the livery band but no cast plate; `ia_hatch`, `ia_bore_door` carry neither (no `m_mask` in their manifest rows; not added in this pass) | n/a | FAIL on text: `prop_station_plate` has bars, no wordmark (request 12); `ia_cradle` is clean by the order |
| 18b fits its opening | PASS: `fit.test.mjs` (80 / 80 run) | PASS (`loop_rim`, `cord`, hooks) | n/a |
| 19 no stray text | PASS | PASS (family marks are glyphs) | PASS |
| 22 weak points | n/a | **FAIL from the proving mark**: `proving_set.png` (knots edge-on: request 1). PASS face-on: `knot_mech_cycles.png` (10-02), `seam_objects.png` | n/a |

## Art integrator, polish round 2 (2026-10-04): what was decided on the rows above

| Row | Decision |
|---|---|
| 1 (STILL OPEN, failing puzzle read): `knot_a/b/c` edge-on from the mark | **APPLIED** as `rotY: 90` (`FACE.w`: with the placement rule yaw = rotY + 180 degrees, 90 is the value that turns the asset's +Z to world -X, toward the mark; -90 would face east). The gallery's three seats already faced that way. Evidence: `shots/integrate-art/game_low/x_proving_mark.png` (the knot face-on inside the ring), `x_knot_a.png` |
| 2: `prop_sighting_loop` front faces away | **NO CHANGE**: the workaround (ticks on the back face, hairline on both) stands |
| 3: `st_loft_ladder` 5.0 m | **ACCEPTED**: the layout wins on positions |
| 12: `m_mask` on `prop_station_plate`; +100 triangles for `ia_cradle` | **DECLINED for this round**: a draw call and triangles in `cell_bore` / `cell_gallery` for text nobody must read; revisit only if a critic asks |
| 13: `prop_grate` pivot at its centre | **ACCEPTED** as built (the binding centres it on the spawn hole) |
| 14: decals outside the placeholder box | **ACCEPTED** (collision `none`) |
| Download share 0.490 MiB of 0.5 | **INSIDE**: budgets are MiB (README ruling 21) |

## Code integrator, polish round 2 (2026-10-04): what was decided on the code-side rows

| Row | Decision |
|---|---|
| 4 to 9, what the files assume of `code-world` | **CHECKED in play**: the sweep and the gate bar rise per jug (`low_03` to `low_05`), the shutters drop and their blades land (`low_14` to `low_17`), the hatch stands ajar then opens (`low_20` to `low_22`), the bore door rolls away with its lamps (`low_49`), both cage gates open (`low_38`, `low_67`) |
| 10 / 11, `knot_live`, lamps off until triggered | stand as built |
| `prop_share_cloth` is no longer rigid-skinned | no code change needed: it falls in the playthrough (`low_17_daylight_ia_cloth_cord.png`); `src/core/assets.ts` now skips the bone upload of a skinned prop that did not move, and the cloth moves, so it uploads while it falls |
| `ia_shutter.drop_open` hides the insulator on frame 1 | stands |

