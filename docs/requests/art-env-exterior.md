# Requests from `art-env-exterior`

Things this piece cannot settle inside its own files. Each has the measurement behind it and the local
workaround in place today. Nothing here blocks the build.

## 1. `code-render`: the coda's fog eats the town card (ART_BIBLE 3.7 against 9.4)

`rim_town_card` stands 250 m from the ledge. Mood L6 fog is 0.012 /m: `1 − exp(−0.012 × 250)` = 95 % fog.
Fogged like world geometry, the silhouette of Plenty is 5 % of itself and the 48 windows fade with it
(`shots/art-env-exterior/rim_plenty_cycles.png`: the Cycles preview fogs it exactly so; the town is a
ghost and only the emissive quads survive because the preview adds them after fog).
**Ask:** draw `m_flat` far scenery of the coda (`rim_town_card`, `env_backdrop_dusk`) with its own fog
term (the card colours are already authored as "seen through haze": `#1E2236` / `#272C46` / `#343A5C`),
or cap fog on `m_flat` at about 55 %, and draw `town_windows` (`m_emis`) unfogged.
**Workaround today:** none needed in the files; the card is authored to read unfogged.

## 2. `code-render`: the value ratios of ART_BIBLE 2.3 need the grade, not the bake

Measured on the Cycles previews (real bake light, fog, the game's tone curve, no grade; 32 × 18 box blur,
three k-means clusters of L*; `node tests/art_env_exterior/measure.mjs squint <png>`):

| Shot | L* dark / mid / light | gaps | light : mid : dark | ART_BIBLE 2.3 |
|---|---|---|---|---|
| doorway (`lip_doorway_cycles.png`) | 12.0 / 29.9 / 64.0 | 17.9, 34.1 | 2 : 24 : 73 | 25 : 5 : 70 |
| street hero (`st_x20_cycles.png`) | 25.6 / 41.2 / 68.2 | 15.6, 26.9 | 30 : 44 : 26 | 60 : 30 : 10 |
| street at x −40 (`st_x40_cycles.png`) | 27.8 / 44.0 / 70.7 | 16.3, 26.6 | 36 : 46 : 18 | 60 : 30 : 10 |
| yard from the door (`yard_from_door_cycles.png`) | 37.0 / 52.8 / 70.1 | 15.7, 17.4 | 45 : 27 : 28 | 60 : 30 : 10 |
| closing shot (`rim_arrival_cycles.png`) | 2.7 / 10.2 / 39.7 | 7.5, 29.5 | 31 : 24 : 44 | 10 : 35 : 55 |

(All of `shots/art-env-exterior/squint.jsonl`.)

- **Overhang.** The dark share is right; the light share is 2 % because the mouth (12 × 3 m seen from
  6.5 m back) frames mostly the first reach's walls, which stand in shade. The 25 % "valley through the
  mouth" is the L0 glare ramp's job (+1.3 stops outside, fog toward `#E6E2D0`): please measure the ratio
  with the ramp at its start, on `player_start` looking north.
- **Street.** With the sun at azimuth 315°, elevation 14° (layout) the north row (5 to 7 m tall, 14 m from
  the south row) shades the whole street floor except where the three north alleys let the sun through:
  the floor is "shadow on sand", not "lit sand", by geometry. The lit third is the sky, the upper halves
  of the south fronts and the alley streaks. 60 : 30 : 10 cannot come from the bake with this sun and
  these facade heights. **Ask (GDD / art bible owner):** either accept "about 30 : 45 : 25" for the street
  and keep 60 : 30 : 10 for the gully mouth, the forecourt and the yard (which do have lit ground), or
  let the grade lift shadowed sand (the display target `#5C4E59` is L* 35; the preview measures 39 to 41
  with fog). Nothing in this piece's files can change it without breaking the layout's sun or the
  facade heights of the order.
- **"Lit sand `#F4A272`" is sand that faces the sun squarely, and no ground does.** The bake is calibrated
  as the bible says (sun-facing white 1.300, open shade 0.900: the build log's `CALIBRATED` line). Sand
  albedo `#CDA070` under key + ambient at normal incidence is exactly `#F4A272`; but the sun stands 14°
  up, so FLAT sand receives 0.242 of the key: `#956A5F` by arithmetic, `#976C64` measured (forecourt,
  6 m, `lip_stand_gate_cycles.png`), ΔE 27 to 37 from the target on every flat sunlit patch
  (`shots/art-env-exterior/samples_result.txt`). The other targets hold or nearly hold: shadow on sand
  ΔE 4.1 to 6.5, lit rock 8.9 (viewer, no fog; 14.5 through 18 m of fog), lit board 7.6, board shadow 2.4
  (viewer; 10.5 through fog), rock shadow 10.8 to 10.9, enamel in shade 16.3 (the drum's shaded side
  picks up warm bounce from the yard floor). **Ask (art bible owner / `code-render`):** either restate the
  lit-sand target for flat ground at this sun (about `#9A6E62` before grade), or have the L1 grade carry
  sunlit sand toward `#F4A272`; re-judge at integration, with the real fog and grade.

## 3. Layout / art bible: "camera height and frame shape matched" (checklist 31) is matched in composition only

The opening frame is the overhang's mouth: 12 m wide, 3 m tall, seen from 6.5 m (a letterbox). The
closing frame is the cage opening: 3 × 3 m seen from 3 m (a square). Both are layout facts
(`lip_overhang`, `rim_cage_jamb_*`, `rim_cage_lintel`). What is matched: eye height 1.65 m on a flat
floor, a black frame all round a bright centre, the floor running out to an edge, **one notch in the
upper corner and one fallen slab in the opposite lower corner, mirrored** (overhang: notch upper left,
slab lower right; rim: notch upper right, slab lower left), `shots/art-env-exterior/sil_overhang_mouth.png`
and `sil_rim_frame.png`. If the two frames must have the same aspect, the layout's cage opening has to
change; that is not this piece's to do.

## 4. Layout: two cover boulders stand half a metre from a nav node

`lip_boulder_2` is 0.52 m from `n_lip_026` and `rim_boulder_2` 0.56 m from `n_rim_011`; a body is 0.45 m.
The order lets drawn rock stand up to 0.25 m off a cover solid, but here anything more than 0.07 m proud
of the solid is inside the link's body sweep. **Workaround:** those two boulders are built with no
growth and a 5 cm surface relief (`bedded_block(grow=0.0, bulge=0.05, inset_max=0.12)`); the other four
keep 0.1 to 0.12 m. No change is needed unless the nodes move.

## 5. `foundation-core` (harness): the 30 s navigation limit is shorter than a page load on the shared machine

With the load average over 100 (fifteen builders baking), `openGame` of `sandbox/viewer.html?zone=plenty_street`
failed three times with `page.goto: Timeout 30000ms exceeded` (`tools/preview-asset.mjs --game`, and
`tests/art_env_exterior/views.mjs`). **Workaround:** `tests/art_env_exterior/views.mjs` `openRetry` and
`evidence.mjs` retry a timed-out load (up to four tries); it is a wait, not an assertion on time.
**Ask:** a longer or configurable navigation timeout in `tests/harness.mjs`.

## 6. The order: `chunk_lip_rock` has no triangles to spare

Everything of `m_frontier` more than 3 m above the path belongs to the skyline chunk: the cliffs, the
overhang roof, the pylon mast, **and the top two metres of the 5 m gate wall and the top of the 4 m
boulder**. It stands at 7 943 of 8 000 while `chunk_lip_gate` uses 3 060 of 8 000 and `chunk_lip_mid`
1 289 of 4 000. The gate wall's viga ends had to be squared one-loop timbers (10 triangles each) for that
reason. **Ask (integrator, if round 2 wants more on the gate wall):** move 1 000 triangles of share
from `chunk_lip_gate` to `chunk_lip_rock` in `design/assets.json`; the zone total (27 000) does not change.

## 7. `art-props` (information, no action asked)

`tests/art_env_exterior/openings.test.mjs` reports how much of each cover solid the embedded props fill
(it does not fail on them: the shape is `art-props`'): `st_cover_wagon` 23 %, `yd_cover_cart` 10 %,
`st_trough` 86 %, `st_cover_pump_post` 100 %. The wagon and the cart leave most of their layout cover
solid empty, so a body behind them is hidden by collision that is not drawn.

---

# Fixer round (after the first critic): what changed in the numbers above, and four new asks

Item 2's table is superseded by `shots/art-env-exterior/squint.jsonl` (same command, the rebuilt files):

| Shot | L* dark / mid / light | gaps | light : mid : dark | ART_BIBLE 2.3 |
|---|---|---|---|---|
| doorway, Cycles preview | 19.6 / 34.7 / 48.8 | 15.1, 14.1 | 11 : 41 : 47 | 25 : 5 : 70 |
| doorway, viewer | 11.9 / 24.0 / 38.6 | 12.1, 14.6 | 29 : 17 : 53 | 25 : 5 : 70 |
| street hero (x -20), Cycles preview | 27.7 / 48.3 / 69.4 | **20.6, 21.2** | 32 : 42 : 26 | 60 : 30 : 10 |
| street hero, viewer | 15.9 / 37.4 / 51.9 | 21.5, 14.5 | 52 : 28 : 20 | 60 : 30 : 10 |
| street at x -40, Cycles preview | 28.9 / 46.3 / 70.6 | 17.4, 24.3 | 37 : 46 : 17 | 60 : 30 : 10 |

The street now has sunlit floor (34.3 % of it between x -60 and -20, held by `tests/art_env_exterior/light.test.mjs`:
the north row was lowered: a ruin where the two-storey boarding house stood, a skeleton false front on the dry-goods
store, the undertaker's shed at 3 m; the boarding house moved to the south row, where ART_BIBLE 7.2 has it). The hero
shot passes the 18 L* gaps in the Cycles preview. **Still open, unchanged in kind:** the area ratios, and lit FLAT sand
(`#956A5F` by arithmetic at a 14 degree sun against the `#F4A272` target). The overhang's interior is no longer black
(viewer: back wall `#452B2D`, side wall `#351E1F`, roof `#271113`), which is why its "dark" cluster rose and the gaps
fell under 18: with the rock inside at the art bible's own `#2A1A1E`-`#48272D` and the first reach in shade, three
clusters 18 L* apart need the L0 glare ramp. Please judge the doorway squint with the ramp at its start.

## 8. Integrator: is "six GLBs <= 2.0 MB" decimal or binary?

The six GLBs are **2 084 084 bytes: 1.988 MiB (what `check-glb` and the build line print), 2.084 MB decimal**. The
fixes of this round added about 4 300 triangles (well-house and drum relief, the gully mouth closed as masses, the
ruin, buttresses, seam objects) and I took back about 3 000 elsewhere (loft interior, porch slats, rubble, a welded
collider); the total rose by 25 kB. Under a decimal reading it is 84 kB over. **Ask:** rule the unit. If decimal:
the cheapest 84 kB is `collider_terrain` (2 564 triangles, 44 kB as shipped) decimated to the layout's solids, plus
the feed-store loft interior (about 900 triangles).

## 9. `code-render`: the overhang's fill is a light in the bake scene

ART_BIBLE 3.1 asks for "baked bounce only" with the rock at `#2A1A1E`-`#48272D`; two bounces of the calibrated sun and
sky give 2 % of open shade in that room (the critic measured `#070102`). The bake scene now holds one area light in
the mouth, looking in (`surface_common.add_fills`, 340 W, colour (0.33, 0.48, 1.0)), standing for the glare of the
valley. Nothing for the renderer to do, but the dynamic ambient for the overhang's volume should not be lower than
what the walls now show, or the gun will read darker than the room.

## 10. `foundation-pipeline`: `WARNING ... baked dark from end to end` is printed before a script can repair it

`vcol.bake_vertex_light` prints the buried-face warning inside the bake. `surface_common.heal_buried` then gives those
faces the light of their nearest sampled neighbour (street: 1 783 faces, lip: 827; the log line `VERTEX LIGHT ...
HEALED n`), so the build line's `(40 warnings)` / `(12 warnings)` no longer describe the shipped files. The proof is
the viewer test (sparkle count 0 and 1 on the two shaded fronts, the smithy's sign board `#AB755D`). **Ask:** a way
to run `warn_buried` after the script's own repair, or to mark an object as healed.

## 11. Layout (information): three things this round found

- The fallen slab of the rim's frame cannot LEAN at the lower left of the cage opening: `n_rim_002`-`n_rim_011` and
  `n_rim_002`-`n_rim_010` pass there (0.45 m body sweep, nothing over 0.35 m). It lies flat (0.3 m) in front of the
  opening with the block it broke from standing against the west jamb, outside the links.
- `fp_yard_drum_w` stands 0.7 m from the drum's shell: the plinth and the cover strip of that one panel seam are left
  off there (anything 5 cm proud of the shell is inside the body sweep).
- The well-house is three broken walls (north, west, south), not a 9 x 9 m box: its corners are where
  `n_st_128`-`n_st_134`-`n_st_139` and the firing points pass, and the Dowser line limits everything west of x -95
  and north of z -7.5 to 3 m.

## Art integrator, polish round 2 (2026-10-04): what was decided on the rows above

| Row | Decision |
|---|---|
| 4: boulders half a metre from a nav node | **NO CHANGE**: the flat build of those two boulders stands |
| 6: move 1 000 triangles of share to `chunk_lip_rock` | **NOT DONE**: nothing in this round adds to the gate wall; the chunk is at 7 742 of 8 000 |
| 7: wagon and cart leave their cover solids empty | **APPLIED**: the solids follow the props (README ruling 22; `docs/requests/art-props-dress.md`) |
| 8: decimal or binary megabytes | **RULED: MiB** (README ruling 21). The six GLBs are 1.99 MiB of 2.0: inside |
| 11: layout information | noted; no change |
| from `art-env-interior` 6.1: the yard's sand 0.2 m inside the Tally House | **FIXED**: `street_yard.build_ground` stops at z -15.0 |
| from `code-player` / `code-render` / `code-world` / `code-ui`: the start marker 4 mm inside `collider_terrain` (`capsuleFree` false at `cp_lip_start`, y 14.0041 after a restart) | **FIXED** in `lip_fields.ground`: the sheet is the layout's plane within 3 m of every checkpoint, start and spawn marker of the lip and fades back to its relief by 5 m. Measured on the shipped collider: 14.0000 at (16, 107.5) and three points round it, 0.0000 at `cp_lip_gate` |

Integration defects found in the tour and repaired in this piece's files (each marked `integration` in the source):

- **Sky through cracks at wall feet and at the lip / street ground seam** (bright dashes along the gate wall, wedges at the gate posts): a black underlay 16 cm under the ground of each street chunk and of the gate forecourt (8 triangles in all) (`street_parts.build_ground`, `lip_parts.build_ground`).
- **Daylight through the slit between a shut door / shutter and its frame** (every dressing door and window of the false fronts): a shallow dark box behind each leaf (`ext_frontier.shut_door`, `shutter_window`).
- **The sun shone through the Tally House** onto the yard floor in front of `door_tally` and `door_alley` (the hall is another zone and was not in the surface bake): a caster box of its volume stands in the bake scene (`surface_common.add_casters`; never exported).
- **A black line round the overhang's ceiling** (the roof slab's rim baked pitch black where it meets the wall tops; 319 triangles): `surface_common.heal_black` gives a vertex-lit face whose every corner is pitch black 0.6 x the light of its nearest lit neighbour (lip 658 faces, street 1 001, most of them never seen).

## Code integrator, polish round 2 (2026-10-04): what was decided on the code-side rows

| Row | Decision |
|---|---|
| 1, the coda's fog eats the town card | **APPLIED** in `src/render/materials.ts`: unlit `m_flat` cards of an asset resident in the coda only (`rim_town_card`, `env_backdrop_dusk`) take at most 55 % fog (`FARFOG`). `shots/integrate-code/check_rim_town.png`: the town reads as a silhouette under its windows |
| 2, value ratios need the grade | no change; left for the visuals critic |
| 9, the overhang's fill and the dynamic ambient | no change; in `low_01_start.png` the gun under the overhang is darker than the rock, as the art bible asks of the gun |
| the 4 mm at the start marker | fixed by the art integrator; and `capsuleFree` above a terrain sheet is fixed in core (`greybox.ts`) |


## Polish round 2, fixer for `art-env-exterior` (2026-10-04): requests that follow from the critics' four issues

Evidence for every row: `shots/r2-fix-art-env-exterior/` (`before_*` / `after_*`, real game, 1280 x 720, Low; `after_high_*` on High).

12. **`code-render`: the day backdrop's fog decides how dark the Dowser's cliff can be.** `env_backdrop_day` now puts a
    near-black cliff (`#2B1A20`) 9 m behind `socket_dowser`, 24 to 30 m above his feet (tested: 135 rays from all of
    `trg_dowser`, rock behind him on every one). But L1 fog takes 76 % of anything 245 m off, so that cliff displays at
    L* 72 (`#D6A57E`), against a card at L* 85: a 13 L* step (it was 4 against the sky). No vertex colour can go lower.
    **Ask:** cap the fog on the surface set's far cards as the coda's are capped (`FARFOG`, e.g. 0.5 for
    `env_backdrop_day`), or on the Dowser's rim alone; at 0.5 the cliff would sit near L* 55 and the card would read
    at a glance.
13. **`code-render`: the coda's `FARFOG` cap of 0.55 toward the ember band.** The dusk cards are now authored almost
    black (`#15172A` to `#333A5E`), yet toward the afterglow they display at L* 50 to 55: 0.55 x the ember fog is
    already a mid tone at exposure 1.8. Dark share of the fire vista went 10 % -> 26 %, of the Plenty vista 5 % -> 29 %
    (squint, L* < 35), all of it from the ledge, the parapet rocks and the near plain. To reach the art bible's
    10 : 35 : 55 the far land needs less fog (cap about 0.3) or the cold fog colour below the horizon.
    The light third (L* > 70) is 0 %: it is the sky's ember band and the lit windows, not mine.
14. **`code-render`: unlit town windows draw as black squares.** On `rim_town_card` the `m_emis` quads that are not
    yet lit are darker than the walls they sit on (the walls are fogged, the quads are not). It reads as windows now
    that every quad stands on a wall, but an unlit pane at the wall's fogged colour would be truer.
15. **`code-enemies` / `art-props-dress`: the card itself.** Measured in `after_dowser.png`: about 4 x 13 px at 720p
    (3 x 10 at 540p), which is another fixer's change of this round (it was 2 x 6). The critic asked for 6 x 16 at
    540p, a hold until he has been within 10 degrees of screen centre for 1.5 s, and the glint on for the first
    second of the line: none of that is in this piece's files. The cliff behind him covers a card up to 12 m tall.
16. **Workorders: the exterior's GLB share.** The six GLBs are now 2 442 000 B = 2.33 MiB against a 2.0 MiB share
    (`env_plenty_street` 1.24 -> 1.51 MB: broken walls with raked ends, the yard's dressing, the Tally front's finer
    grid). The two lightmaps are 1.37 MiB of their 3.5 MiB share, so the piece is at 3.70 of 5.5 MiB and the stage's
    total rises by about 0.3 MiB. **Ask:** move 0.4 MiB of share from the lightmaps to the GLBs, or say what to cut
    (the cheapest 150 kB is the rake teeth: `ext_frontier.ruin_wall` / `stepped_wall`, about 3 000 triangles).
17. **Layout (information): the yard's open floor cannot be dressed above 0.35 m.** Nav links cover the whole yard
    except a 0.85 m strip along each wall, so everything standing (pipes, trough, ladder, adobe stack, crates, vigas)
    is in those strips, and the open floor carries only what is under 0.3 m (the ruin's footing course, the cable,
    the pipe run, boards, drifts). The zone's dressing allowance (6 000 triangles) was already spent on the street
    (5 940), so the yard's crates are zone geometry, not `prop_crate` instances.

## Closer, polish round 2 (2026-10-04): what was decided on rows 12 to 17

| Row | Decision |
|---|---|
| 12, a fog cap on the day backdrop | **NOT DONE, open for code-render in round 3**: it needs a second far-fog variant for the surface set (the coda's is keyed on "resident in the coda only") and a look at every surface vista; not taken in the closing pass |
| 13, the coda's cap | **APPLIED**: `src/render/materials.ts` `FARFOG` 0.55 -> 0.40 (the lit windows keep their 0.30). Looked at in `shots/round-2/` (the rim frames) |
| 14, unlit town windows as black squares | **NOT DONE**, open for code-render |
| 15, the Dowser's card, hold and glint | **NOT DONE**, open for code-enemies / code-world / art-props-dress |
| 16, the GLB share | **RULED**: README ruling 24: exterior GLBs 2.4 MiB + lightmaps 3.1 MiB (the piece's 5.5 is unchanged). Nothing is cut |
| 17, the yard's floor | noted; no layout change |


## Polish round 3, fixer for `art-env-exterior` (2026-10-04): requests that follow from lead rulings R4, R5 and R7

Evidence: `shots/r3-fix-art-env-exterior/` (`before_*` / `after_*`, the real game, 1280 x 720, Low). Log: `scratch/r3-fix-art-env-exterior/NOTES.md`.

18. **R4, the Dowser: three numbers that are not in this piece's files.** Done here: `env_backdrop_day` now stands him on
    the mesa's top knob with **open sky behind the whole figure** (tested: 162 rays from all of `trg_dowser`, 0.6 to 14 m
    above his feet, 3 m either side: nothing behind). What is still needed for "dark, at least 24 px at 720p":
    - `art-props-dress`, `blender/props/dress/card_dowser.py`: `vcol.fill_color(card, "dowser_pale")` -> a near-black
      coat (`#15121A`, L* under 8 before haze); keep the rod glint. (ART_BIBLE 6.5 "pale long-coated figure" -> "dark".)
    - `code-render`, `src/render/materials.ts`: `FARCARD_MIN_PX` 9 -> **26**; and the far card's haze cap 0.30 -> 0.12
      (a black card under 30 % of the L1 fog displays near L* 50: mid-grey on a L* 78 sky).
    - `code-enemies`, `src/enemies/vignettes.ts` `present()`: the floor `8 / (cardH * perMetre)` -> `26 / ...` (and 3 -> 9
      wide), or drop the CPU scale and leave it to the shader.
    - Documents (closer): GDD 9.3 and 16, ART_BIBLE 6.5, `design/layout.json` `vista_dowser.params.subject` ("pale against
      its shadowed face" -> "dark against the sky on the mesa's top") and `minPixels` [3, 8] -> [9, 26];
      `design/story.json` `nar_dowser_seen` -> "On the far rim, a man with a forked rod, dark against the sky. Watching."
      (the story critic's wording). Work order 4.6 "the Dowser card must read pale on it" -> "stands on its skyline".
19. **R7, the last image: the coda's far fog is what keeps the frame without darks** (`code-render`). Every far card of
    the coda takes `min(fog, 0.40)` of the L6 fog, and toward the north-west that fog is `fogB #B8866F` at exposure 1.8:
    a card authored BLACK displays at about L* 50, warm brown. Measured in `a2_rim_fire.png`: the mesa's foot under the
    ledge, authored `#0A0A14` to `#232540`, 30 to 80 m from the eye, displays L* 40 to 48. No vertex colour can go lower.
    **Ask:** below the horizon use the cold fog (`fogA #4D5578`) for the coda's cards and cap it at 0.15 inside 150 m
    (ramp to 0.40 by 500 m), so the near land is the dark third of the frame and the ember band stays in the sky.
20. **R5 / R7, the fire** (`code-render` / `code-world`): the backdrop now keeps the fire's bearing clear (no ring within
    9 degrees of it in the two near rings: the fire burns on the open plain, not in front of a mesa's scree). A **ground
    glow and a thin smoke line** cannot be permanent geometry (the fire kindles when the ending starts): they belong to
    the `last_fire` card (a warm ellipse on the plain under it, a 1 px pale line rising and leaning east).
21. **R7, lit windows** (`code-render`): the town's 48 panes now have shapes (sashes 0.9 x 1.7 m, doors 1.2 x 2.1 m, shop
    fronts 1.9 x 1.3 m: 3 to 6 px at 720p from the ledge). The round look is the halo sprite drawn over each lit pane:
    make it smaller than the pane or drop it on the town card (row 14, unlit panes as black squares, still stands).
22. **Numbers and wording this round changed in this piece's files** (closer: mirror into the documents).
    - Work order 4.4 / ART_BIBLE 3.7 targets "lit ledge `#65656D`": the ledge's albedo factor `LEDGE_K` is 0.31 (was 0.46)
      and loose rock on the ledge is `ROCK_DARK` 0.34 of its round-2 albedo: the ledge is the frame's dark foreground (R7).
    - Work order 4.5 "48 window quads (0.9 x 1.1 m)": sashes 0.9 x 1.7 / 0.9 x 1.5 m, doors 1.2 x 2.1 m, shop fronts
      1.9 x 1.3 m; still 48 quads, same lamp-set order. "a 60 x 14 m card ... 250 m off": the town stands 117 to 142 m
      from the ledge (layout `vista_plenty`), and no pale ground lies under it (the playa is in `env_backdrop_dusk`).
    - Work order 4.6 "the far rim ... kept dark ... the Dowser card must read pale on it" -> the mesa's top is the
      skyline at his feet (R4). ART_BIBLE 3.1 "no direct sun; baked bounce only" for the overhang: the bake now holds a
      warm bounce light and one shaft of sun on the floor (R7, the first image).
    - Layout note: `prop_barrel` dressing instance moved from (-109.2, 0, -13.2) to (-109.62, 0, -9.3) (zone dressing,
      not a layout marker): it wedged a jumping capsule in the yard's north-west corner.
23. **`art-props-mech`: the yard door** (`ia_yard_door`): the "flat lavender slab at the end of the street" in the visual
    critic's `B_walk_04.png` is the Pellam access panel's leaf, not the adobe gate wall. It needs the Old-World
    treatment the critic names: panel seams, the teal livery band, grime. Done here: the wall round the gate (base
    course, put-log poles, canales and stains, weather).
24. **`foundation-pipeline` (information): `<id>_game.png` of the two backdrops is one flat colour** (the viewer frames a
    900 m asset from inside its plain). The sheets and the real-game frames are the evidence for them.

### Round 3, state of rows 18 to 23 when this fixer finished (2026-10-05, measured in the real game, 1280 x 720)

| Row | State |
|---|---|
| 18, the Dowser | **PART OPEN.** Skyline: done here. Dark card: landed (`card_dowser.py`). **Size: still about 13 px tall** in `shots/r3-fix-art-env-exterior/r2_dowser_crop4x.png` (R4 asks 24): `FARCARD_MIN_PX` is still 9 in `src/render/materials.ts` and the floor in `src/enemies/vignettes.ts` `present()` still 8 px. The document edits (GDD 9.3, ART_BIBLE 6.5, `vista_dowser` subject / minPixels, `nar_dowser_seen`) are the closer's |
| 19, the coda's far fog | part landed through the L6 grade (code-render): ending frame L* p5 / p95 = 13 / 67 (`end1_04_ending_fire.png`; the critic measured 25 / 51). The town's walls are authored `#10121F` to `#20243C` and still display as beige at 120 m: that is the fog cap, not the card |
| 20, the fire's ground glow and smoke | landed (code-render): both are in `end1_04_ending_fire.png` |
| 21, round halos over the town's panes | still round at 720p (`end1_02_story_lamps.png`); row 14 (unlit panes as dark squares) still stands |
| 22 | for the closer to mirror |
| 23, `ia_yard_door` leaf | not this piece's; the leaf is still a flat pale panel in `r2_gate_near.png` |

## Closer, polish round 3 (2026-10-05): decisions on the rows above

| Row | Decision |
|---|---|
| 18 the Dowser's size (`FARCARD_MIN_PX`, the vignette floor) | **Ruled: the floors stay** (9 px in `materials.ts`, 8 px in `vignettes.ts`); the 28 px figure is held by the world's wrapper (`Director.presentSighting`, `tests/world/sighting.test.mjs`: 9 x 29 px) and the far-card haze was cut to 2 % by the exterior look-dev pass. Three owners' numbers were not moved at the close; the wrapper falls to 1 if they ever are. Seen: `shots/r3-closer/c1_dowser.png` |
| 14, 19, 21 the coda's far fog, the halo, unlit panes | Taken by the exterior look-dev pass (far-card fog 6 % to 160 m, far window glow 24 px at 38 %, the card drawn 1.7 x). Unlit panes as dark squares: open |
| 22 documents | Mirrored: ART_BIBLE (6.5 in place, round-3 amendments), GDD 9.3 / 23.6, `nar_dowser_seen`, `vista_dowser` (`subject`, `minPixels` [9, 28]) |
| 23 `ia_yard_door` leaf | Open for art-props-mech (round 4) |
