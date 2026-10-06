# Requests and notes from `art-env-interior`

Written by the builder of `env_tally_house`, `env_the_gallery`, `env_lift_hall`, `env_the_bore`, `env_lift_shaft`.
Nothing here blocks the piece: every item has a local workaround that is already in the shipped files.

## 1. To the integrator

1. **Rebuild the four zones when the embedded props are final**:
   `node tools/build-assets.mjs --only art-env-interior` (final quality; `KS_Q=draft` in the environment bakes at
   16 spp / 192 vertex samples for iteration only: never ship a draft). The zones embed whatever raw export is in
   `blender/export/` at build time: `prop_tally_table`, 11 × `prop_chair`, `prop_head_chair`, 3 × `prop_bench`,
   `prop_camp_ash` (`ash_cold`, `ash_embers`), `prop_kettle`, `rd_note` (`note_hearth`, `note_cradle`), `rd_ledger`,
   `rd_plate` (`plate_proving`, `plate_line`, `plate_service`), 6 × `ia_proving_mark`, `tamper_cold_static`.
   Each script reserves the manifest budget of its embedded props (`TRIS own … + reserve …` in the log) and fails if
   its own geometry leaves no room for them, so a final prop at its budget cannot push a zone over.
2. **A final build is slow on a busy machine**: the vertex light is 2048 samples per vertex with up to 40 lamps and
   Cycles' light tree off (the library's ruling). Measured times are in the piece's report; plan about 10 to 25
   minutes per zone when other bakes are running, 3 to 6 minutes on a quiet machine.
3. `tests/art_env_interior/evidence.mjs` renders the Cycles evidence frames (`node tests/art_env_interior/evidence.mjs`,
   about 3 minutes); `viewer.test.mjs` writes the viewer frames. Both write into `shots/art-env-interior/`.

## 2. To `code-render`

1. **Light layers are lightmap-only.** `lm_tally_hatch` and `lm_bore_glow` hold light for the lightmapped faces
   (floor, walls to 3.2 m and the west and north walls to the roof, table top and benches in the Tally House; the
   whole sector, the catwalk girders and the stair in the bore). In the Tally House the roof deck and the vigas over
   the hatch are vertex-lit and stay dark when the hatch layer comes on. Vertex-lit faces sit on the layer's black neutral texel and receive nothing from a layer:
   small fittings (plates, pegs, rails, the shaft's steel course rings, the kerb's foot and band) therefore stay at
   their fill light when the layer is on. That is intended (dark steel against the lit lining); it is not a bug in
   the shader.
2. **Calibration of the layers** (stored value = light ÷ 2, greyscale; runtime = `tint × weight × layer × 2`):
   - `lm_tally_hatch`: a white surface 6 m south of the hatch frame at 1.2 m receives 0.495; `linen` × aqua
     `#7CF2E2` × that reads `#4A8D73`. The order's `#4A7F86` is bluer than `linen` × aqua can be at any weight
     (the product's blue is the palette's, not the bake's): the red channel matches, the room's blue fog and the
     dynamic ambient do the rest. Raise the weight, not the bake, if hoods read too dark with Reduce Flashes on.
   - `lm_bore_glow`: rib inner faces 0.80, ceiling 0.40, catwalk girder undersides 0.60 (the art bible's × 0.8 /
     × 0.4 / × 0.6). The shaft lining is scaled so that only its brightest twentieth clips at 2.0. Tint `#8A3CCC` unproven, `#7CF2E2` × 0.9 proven, bottom-up by world height; the chamber floor
     is y −44, the ceiling −30, the shaft lining goes down to −50.9.
3. **Fog does the last third of the value structure.** Measured without fog the gallery and the hall are lighter
   than ART_BIBLE 2.3 asks (the far wall is plainly visible); with the mood's fog (`--fog` preview frames
   `cycles_*_fog.png`) the far half goes to the fog colour. If the far wall of the gallery or the hall does not
   dissolve in the game, the density is the lever, not the bake.
4. **Tally House exposure**: the bake is the mood's (ambient 0.25 at the floor, lantern 1.5 at 1.3 m). Its frames
   are within 30 L* from end to end until the mood's +1.0 stop on entry is applied (`cycles_tally_house_*_exp1.png`).
5. **Lamp sets**: `strip_hatch` (1, G = 1 off until triggered), `strip_flicker` (1 lamp = both flicker strips,
   G = 0.5, not in the bake: the two modules under them carry a bake of their own with the strip dark),
   `violet_hairline` (1, B = 1, `thin_ok`: 2 cm × 3 m by the order), `diagram_lamps` / `ante_diagram_lamps`
   (7: 0–5 dim R = 0.55, 6 full, `aqua_core`), `bore_glow` (1, `violet_band`, B = 1, R falls from 1 at the disc to
   0.35 at the top of the column), `bay_lamps` (6, steady), `mark_glows` (6, G = 1). Steady lamps that are not a
   lamp set (the gallery's 15 steady strips, the stair strips, the hall pendants, the ring strip, the cold bay
   lamp, the bore stair lamps) are faces of each chunk's `m_emis` mesh.

## 3. To `code-world`

1. **`env_lift_shaft`**: pivot = cage floor centre, footprint 6.4 × 6.4 m, y 0..12. The lamp bars are six nodes with
   their origins at `(0, 1 + 2 i, 3.2)` on the **+z wall**, each a 1.2 × 0.1 m quad 35 mm proud of the wall in a
   1.4 m dark channel that runs the whole height: scroll them in y only and wrap inside 0..12. The shell has no
   horizontal feature at all (everything runs vertically and unbroken), so nothing on it shows that it stands
   still. Its baked wash is brightest at 1.6 m above the pivot and gone 6 m above it.
2. **Peg dressing** (`env_the_gallery`): 67 `inst_` empties (28 coats, 24 hats, 15 pairs of boots; allowance 5 draw
   calls: three coat nodes + hat + boots must each be one instanced draw). Exactly one coat has `wind: 0`
   (`coat_long`, on flight 2). Nothing hangs on or under the low rail.
3. **Nav link `n_lh_003` – `n_lh_005`** runs in a straight line from the gantry deck (−14.5, −12, −11) to the middle of
   the ramp (−16.5, −13.5, −6): between z −11 and −9 its interpolated height is up to 0.56 m below the deck and the
   ramp's head. The drawn ramp is the layout's solid; the link is fine in plan. (For `level-design`: a node at the
   ramp's head would make the link follow the floor.)

## 4. To `art-props` / `art-boss`

1. The cradle (`ia_cradle`), the station plates, the baffle, the bore door disc, grate lids, the proving step, the
   line lockers and the ammunition boxes have **seats modelled in the zones at the layout markers** (a steel
   surround, a mount, a plinth, a recess 40 mm deep for grates). If a prop does not sit cleanly on its seat, the
   marker is the authority and the seat follows it: tell this piece which.
2. `tamper_cold_static` stands at `sec_cold_bay` under one clean aqua lamp and is vertex-lit in place by the zone.

## 5. Order notes (not bugs that block)

1. The order's 4.2 asks that nothing intrude into the walkway volume y −12..−7, and also places `knot_c` on "a
   ceiling conduit box" and the baffle wall across the gallery: the box, its 8 cm ceiling conduit and the baffle
   wall over its opening are the only geometry in that volume (`puzzle_geometry.test.mjs` (b) lists them).
2. The kerb's notch top is exactly 0.6 m: the 29° sight line from a mark passes its inner edge with millimetres to spare
   (it clears only because of the 20 mm bevel), so no
   coping or rail may ever be added on top of the notch (the kerb's trim is on its outer face only).

## 6. Fix pass 1 (after critic round 1): requests and notes

1. **To `art-env-exterior` (visible bug, worked round here):** `env_plenty_street` `chunk_st_yard__m_sand` reaches
   **0.2 m inside the Tally House** along its whole south wall: 16 triangles between z −15.2 and −15.03 (the room's
   wall face is z −15.0), 0.01 to 0.14 m above the plank floor, sunlit by `lm_surface`. Seen from inside it was a
   bright strip at the foot of the tally wall (the critic's "light leak"; found with
   `node scratch/art-env-interior/intrude.mjs -95.97 -0.5 -36.97 -82.03 5.5 -15.03`). Please stop the yard's ground at
   the wall's outer face (z ≥ −14.0; the layout's wall solid is z −15..−14) or at least at z −15.0. The same scan
   shows 16 `m_frontier` triangles of the roof at exactly y 5.00 between z −16.7 and −15.0: the Tally House's deck is at
   y 5.0 too; they face up and are culled from inside, but should stay outside the room's footprint.
   **Workaround in `env_tally_house`:** the south wall's foot is battered (the adobe swells 0.26 m out at the floor,
   0.16 m high, sloping back to the wall at 0.34 m), which covers the sand. The batter can stay when the ground is fixed.
2. **To `level-design` / `code-world`:** the bore catwalk's south side has a **viewing bay** now: x 12.28..15.72, no
   grille from the deck to 1.75 m (a kick plate and the hand rail only), so that `vista_windlass` is the clear view the
   order asks for (open share measured in the piece's report). The layout's blocker `bo_catwalk_grille_s` (seeThrough,
   skipsShots) still spans it: the player cannot fall or shoot through, but a shot fired through the opening will clank
   on nothing visible. If shooting the Windlass from the catwalk must stay impossible, that is fine as built (the
   clank needs a spark at the rail's height); if not, split the blocker at x 12.28 and 15.72 and keep only a 1.1 m
   rail-high blocker in between.
3. **To `code-render`:** the ambient of the four zones was re-calibrated (`interior_common.ambient`): the hue of the
   mood's hex, with its brightest channel at 0.11 in the gallery, 0.066 in the hall, 0.11 in the Tally House, 0.10 in
   the bore chamber and on the catwalk, 0.08 in the antechamber (the first build had 0.30 / 0.22 / 0.25 / 0.20 / 0.20). The rooms are now dark with pools; the dyn ambient of the moods
   (`#1E3A5C × 0.45` and so on) is about four times the baked ambient, so a dynamic object in open shade will read
   lighter than the wall behind it: that is wanted for enemies (they must read), but check the view-model.
4. **To `art-props-mech`:** `tx_pellam_trim` revision 2 (this piece owns the script): the concrete row's tie holes
   are round in metres now (they were round in pixels: 5 × 18 cm ellipses with a 0.55 m drip on any wall). Rows, table
   and flat cell are unchanged; any `m_pellam` asset that uses the `concrete` row shows rounder holes without a rebuild.
5. The arrival bay of the bore has an aqua lamp bar over its hatchway (a face of `chunk_bo_chamber__m_emis`, steady) and
   the proving bay of the gallery has two ordinary ceiling strips (faces of `chunk_gl_bay__m_emis`, steady): neither is
   a layout light marker; both are baked. The Tally House has a second, invisible baked source 2.6 m over the lantern
   (the pool on the floor: the flame itself is shadowed by the table for 4 m around).

## Art integrator, polish round 2 (2026-10-04): what was decided on the rows above

| Row | Decision |
|---|---|
| 1.1: rebuild the four zones when the props are final | **DONE**: clean rebuild, final quality (no `KS_Q`): Tally House 141 s, gallery 219 s, hall 252 s, bore 242 s on a quiet machine |
| 3.3: nav link `n_lh_003`-`n_lh_005` under the deck | **NO CHANGE** (fine in plan; the walk test passes it) |
| 6.1: yard sand inside the Tally House, roof triangles at y 5.0 | sand **FIXED** in `art-env-exterior`'s file; the 16 roof triangles face up, are culled from inside and stay. The batter stays |
| 6.2: `bo_catwalk_grille_s` across the viewing bay | **NO CHANGE**: GDD 11 (`the_bore`, row 10: "the grille is a collider that skips shots") keeps the catwalk a place she cannot shoot from; the blocker stays whole. For `code-render`: a shot that stops on the bay's invisible blocker needs its spark at the rail |
| 4.1: seats at the markers | checked in the tour: cradle, station plates, baffle, bore door, grates, proving step, lockers and boxes sit on their seats (`shots/integrate-art/game_low/x_cradle.png`, `x_proving_mark.png`, `cp_boss_p1.png`) |

## Code integrator, polish round 2 (2026-10-04): what was decided on the code-side rows

| Row | Decision |
|---|---|
| 2.1 to 2.5, light layers, calibration, fog, exposure, lamp sets | no render change beyond the antechamber's dynamic light (`L5a`: the ember key on dynamic things 0.6 -> 0.16); the four interiors were looked at on Low and High (`shots/integrate-code/sheets/`) |
| 3.1, `env_lift_shaft` | stands (`rides.ts` holds the asset id): both rides were ridden in the playthrough (`low_39`, `low_68`) |
| 3.3, nav link `n_lh_003` to `n_lh_005` | walked by input in the playthrough and in `tests/core/walk.test.mjs`: never stuck |
| 6.2, the catwalk's viewing bay | stands with the art integrator's ruling (the blocker stays whole) |
| 6.3, the re-calibrated ambient | no change asked of render; left for the visuals critic |
| seen in the tour | the cowl round `knot_hatch_latch` is drawn as a plain salmon block (`low_20_fight_enc_tally.png`): art, listed in the report |


## Fixer, polish round 2 (2026-10-04): requests left by the two visual majors

Evidence: `shots/r2-fix-art-env-interior/` (`before_low_*`, `after_low_*`, `after_high_*`; sheets `after_high_sheet_*.png`).
What changed in this piece's own files is in the scripts' comments (`polish round 2`).

1. **To `art-props-mech` (`ia_lift_cage`) and `code-render`: the cage's floor in the bore's arrival bay.** The
   "stair-stepped shadow" at the catwalk arrival was the cage's floor slab (top at the marker's y) z-fighting the bay's
   floor, which was coplanar with it; the cage's roof underside (+3.5 m) was coplanar with the bay's ceiling in both
   bays. The zones now keep clear of the cage (floor 0.11 m under, ceiling 0.2 m over, under the cage's footprint), so
   what she stands on at arrival is the cage's own floor: a dynamic-lit `m_prop` surface that draws near-black violet
   (`after_high_bore_arrive_cage_e.png`) inside walls baked aqua at 0.7. If the cage's interior should carry "a dim
   baked aqua wash" (ART_BIBLE 3.5, lift ride), that is the prop's vertex light or the L5c dynamic ambient, not the zone.
   Do not move the cage's slabs back onto y 0 / 3.5 of a zone face: any zone face under the 6.3 m footprint must stay
   off those two planes.
2. **To `code-render`: the L5a grade is still the violet one.** `moods.ts` L5a uses the chamber's `tint (1.02, 0.96,
   1.06)` and `lift (0.025, 0.010, 0.045)`. The antechamber's bake no longer holds blue (fill hue (1.0, 0.95, 0.25) x
   0.085, ember bounce `#FFB36B`), and the room now reads ember-brown (`#513a42` walls, was `#2f2047`), but a floor in
   open shade still draws `#3e2a3f` (R = B): that blue is the lift and the fog, not the lightmap. A warm lift
   (about (0.030, 0.018, 0.020)) and tint (1.04, 0.99, 0.95) for L5a would finish ART_BIBLE 2.4 ("the antechamber is
   not violet").
3. **To `code-render` / the owner of `tx_mask`: the catwalk's grille at grazing angles.** `m_mask` is alpha-tested
   with no coverage-preserving mips, so the deck seen through the arrival hatchway at 5 m and more breaks into rows of
   dashes (`after_high_bore_arrive_hatch.png`, centre). The coplanar double cards that z-fought on top of that are gone
   (one card per tile now: `m_mask` is double-sided); what remains is minification. Alpha-to-coverage on High, or
   scaling alpha by mip level in the mask's mip chain, would settle it.
4. **To the closer:** `env_lift_hall` and `env_the_bore` were rebuilt at final quality with their lightmaps (`lm_hall`,
   `lm_bore`, `lm_bore_glow`); they are zones themselves, nothing embeds them. `KS_*` environment variables in the two
   scripts are tuning overrides only: the defaults are the shipped values.

## Closer, polish round 2 (2026-10-04): what was decided on the fixer's rows

| Row | Decision |
|---|---|
| 1, the cage's floor at the bore arrival | **NOT DONE**: open for art-props-mech / code-render (the cage's dynamic light under L5c). The rule "no zone face on the cage's y 0 / 3.5 planes" stands; the proving-lift bays were not checked for it |
| 2, the L5a grade | **APPLIED**: `src/render/moods.ts` L5a tint (1.04, 0.99, 0.95), lift (0.030, 0.018, 0.020); ART_BIBLE amendments table |
| 3, `m_mask` minification | **NOT DONE**: open for code-render (alpha-to-coverage on High or alpha scaled per mip in `tx_mask`) |
| 4 | the incremental build of the closing pass found every zone and lightmap up to date (`node tools/build-assets.mjs`: 102 skipped on its second run); `npm run check:assets` passes |


## Fixer, polish round 3 (2026-10-05): the two visual issues (bore arrival / lift rides; teal wash)

Evidence: `shots/r3-fix-art-env-interior/` (`before_low_*`, `fin_low_*`, `fin_high_*`, sheets `fin_low_sheet_*.png`, the
ride by input `ride_low_0{1,2,3}_*.png`); numbers in `scratch/r3-fix-art-env-interior/NOTES.md`. L* p50 / p95 at 1280x720 Low,
before -> after: bore arrival through the gate 17/22 -> 39/62; arrival at the hatch 16/20 -> 22/44; catwalk 17/23 -> 26/71;
Windlass vista 21/38 -> 23/48; proving-lift lever 17/24 -> 41/62; hall cage lever 15/24 -> 22/65; frame means: lift hall
`#2b5a61` -> `#425b64`, gallery `#234957` -> `#314a5a`.

1. **To the closer (documents): what changed against ART_BIBLE 3.5 / L3-L5 under lead rulings R6/R7.**
   - Lift hall: the streak under each pendant is a near-neutral white (`CORE_C` linear (1.0, 0.88, 0.84)), the pendant's
     wide pool is half aqua `#7CF2E2`, half that white; two sodium practicals `#FF9A3C` (over the pounded bulkhead / the
     Tamper's arch, and over `ia_line_locker_hall`). Gallery: sodium practicals over the bay's line locker and ammo, lamps
     at the valve gauges, the same half-saturated pools. "Aqua lamps" in the bible should read "aqua-white lamps, sodium
     at the arch and the lockers".
   - The bore: the catwalk tube is open at eye level on its south side for the whole run (lit back panels north), seven
     aqua-white work lamps under the tube roof, the arrival bay and the proving-lift room are lined pale over a darker
     dado with the livery band and have their own wash lamps. The lift shaft's shell carries a wash.
   - Both cage wells (hall x 21..27, bore arrival x -1..5) now stand **0.035 m outside** the cage's 6 m interior on their
     three closed sides. `ia_lift_cage` has its lattice and a 0.3 m kick plate on local +-3.000..3.030; walls flush at
     3.000 hid the lattice and z-fought the kick plate in black wedges (`r1_low_cage_lever.png`). Rule for any later
     edit: no zone face inside 3.035 m of the cage's centre on a closed side.
2. **To `art-props-mech` / `code-render`: the cage itself is still the dark share of every ride frame.** Inside the bore
   cage the lining now reads L* 45-55 between the bars, but the lattice, floor and roof of `ia_lift_cage` are dynamic-lit
   `m_prop` and draw near-black violet under L5c (`fin_low_sheet_bcage.png`, `ride_low_03_enter_the_bore.png`: frame p50
   18-20 with p95 55-60; the critic's target was p50 about 25). A dim baked or ambient aqua term on the cage (round 2,
   row 1, still open) closes the rest; the zone cannot light a prop.
3. **To `art-env-exterior` and `art-props-mech`: the proving-lift cage at the rim** (critic: `A_cp_rim.png` frames 2-4) is
   zone `far_rim` plus `ia_proving_lift_cage`: neither is this piece's file. The same treatment applies (a caged work
   lamp in the roof, a pale lining behind the lattice). Not done here.
4. **To the closer:** `env_lift_hall`, `env_the_bore`, `env_the_gallery`, `env_lift_shaft` (and their lightmaps `lm_hall`,
   `lm_bore`, `lm_bore_glow`, `lm_gallery`) were rebuilt at final quality; they are zones themselves, nothing embeds
   them. `node tools/check-glb.mjs env_interior` passes (hall 24266/36000 dc 4/4, bore 31679/40000 dc 10/10, gallery
   21160/32000 dc 10/10, shaft 654/800 dc 7/7). `KS_*` environment variables are tuning overrides only.

## Closer, polish round 3 (2026-10-05): decisions on the rows above

| Row | Decision |
|---|---|
| 1 documents | Mirrored: ART_BIBLE round-3 amendments (3.4 / 3.5 row) |
| 2 `ia_lift_cage` draws near-black under the bore mood | Open (art-props-mech / code-render, round 4) |
| 3 the proving-lift cage at the rim | Open |
| wall positions of the two cage wells | Confirmed by the gate: `tests/pipeline`, `tests/core` and the e2e playthrough pass on the rebuilt zones |
