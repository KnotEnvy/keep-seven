# Requests of the look team "exterior-look" (polish round 4)

Scope of the pass: `blender/env_exterior/`, the Dowser card (`blender/props/dress/card_dowser.py` and its drawing, the
`card_dowser` region of `blender/tex/tx_mask.py`), the surface and coda mood entries and the coda's far effects in
`src/render`, the visual staging of the sighting and of the rim ending in `src/world/ending.ts`. Evidence:
`shots/r4-team-exterior-look/` (`before/`, `after/`, `after43/`, work sets `w1` to `w4`, `a1`); log and capture scripts:
`scratch/r4-team-exterior-look/NOTES.md` (`cap.mjs`, `rimcap.mjs`, `yardcap.mjs`, `end.mjs` = the TRUE last image: she
takes the round and the game eases her view by itself, `vmrim.mjs`).

## 1. What changed (for the documents)

| What | Before | Now |
|---|---|---|
| `src/world/ending.ts` `TURN_TOWARD_TOWN` (how far the eased last view stands off the fire toward the town) | 0.35: the fire 12 degrees right of centre, x 770 of 1280, under the end card's panel (from x 783) | **0.15**: 5.3 degrees right, x 695 at 16:9, 570 of 1024 at 4:3 (panel from 614), clear of the panel (R5) |
| `rim_town_card` | the town centred on `vista_plenty.target`; 176 triangles; 34 real panes and 14 stacked on the Tally face | drawn **12.5 m further east** on its card (it stays whole in the left half of the last frame); 349 of 600 triangles; pitched roofs seen side-on, gable verges, porches, a dark apron under the near row and the Tally House, **16 window pools** (a second face of the same lamp: lit with its window), two smoke ribbons, 48 distinct panes, and **one leaning dead line pylon** as a card 42 m out from the ledge at game (-0.9, 3.2 to 25, 61) |
| `env_backdrop_dusk` (colour only, 1 987 of 2 000 triangles as before) | the mesa's foot one dark violet tone | the afterglow rakes it: the fins' north-west flanks a dull rose `#6A4450`, their lee sides to the land's black |
| `env_far_rim` (8 116 of 14 000 as before) | loose rock and the lip one dark tone | the up-facing faces of the edge blocks, parapet and boulders hold a warm sheen; the last 0.75 m of the ledge's lip is swept bare and lit (the rim-lit edge) |
| far lamp panes (`src/render/materials.ts`, the `FARFOG` branch of the emissive shader) | lit or not, a pane took up to 30 % of the ember haze: an unlit pane was a dull rose square on a dark wall | the cap follows the lamp: 6 % unlit (as its wall), 30 % lit |
| `env_plenty_street` (47 104 of 54 000 triangles, 16 of 16 draw calls; was 45 298) | the Tally House front and the yard's east wall plain adobe with a door, a board, piers | Tally front: a lime dado with the town's teal line, teal round the door, a tin door hood (0.36 m), a peg rail with dried peppers, a shovel and a coil, the roof ladder, the brushed well mark with a chalked tally and two family marks, a washing line with six cloths to the east wall (lowest hem 2.3 m). East wall: a tin pentice on brackets over the alley door, five put-log poles on the sunlit south run. **No collider, footprint or nav change**: everything under 2.3 m stays within 0.3 m of its wall, the hood stays out of `trg_dowser`'s volume |
| the Dowser card (`tx_mask` region `card_dowser`, same rectangle; `card_dowser` 0.9 x 2.0 m, two triangles as before) | the rod a thin line held low against the coat: invisible at 30 px | he stands in the left of the rectangle and holds the rod out at his right arm's length, upright, a Y clear of his body and hat; the `glint` node is the outer tine's tip. Measured in the real game: figure 14 x 29 px, luma 50 on 191 (`tests/world/sighting.test.mjs`) |
| `src/render/moods.ts` L6 `vmK` | 1.35 | I set 1.0, then the gun look team set **1.25** with its own measurements (under 1.15 more than 4 % of the new gun falls under L* 12: `tests/render/polish3.test.mjs` R6). Left as theirs |

## 2. Requests

| # | To | What | Why |
|---|---|---|---|
| 1 | closer (docs) | Mirror section 1 into `docs/GDD.md` 9.8 (the eased view: 0.15 of the angle to the town, the fire 5 degrees right of centre), `docs/ART_BIBLE.md` (the coda: the pylon in the foreground, the pools, the raked foot; 6.5: the Dowser holds the rod out at arm's length, upright) and `docs/LEVEL.md` 7 | the documents still describe 0.35 and a rod "held low" |
| 2 | closer (`design/assets.json` through its generator) | `rim_town_card`: the card's bounds now reach from the town (about 104 x 25 m, 12.5 m east of `vista_plenty.target`) to the pylon at (-0.9, 61): the placeholder box and the note ("a 60 x 14 m card") are out of date; `card_dowser` notes that say "forked rod held low" | the manifest is not this team's to edit; `check-glb` does not test a card's bounds, so nothing fails |
| 3 | gun look team | The gun in the last image is still the lightest large shape under the horizon: mean L* 28.7 over a ledge of 13.1 at `vmK` 1.25 (it was 32.1 over 10.8). The critic asked for the ground's value with only the highlight bright; the mood factor cannot give that without breaking R6's "under 4 % black" (your own measurement). If it is to go further it is the gun's mirror term in the blue hour, not the rig's level | the visual critic's third point on the last image is only half met |
| 4 | UI team | At 4:3 the end panel starts 60 % across; the fire is 55.6 % across (44 px clear at 1024 x 768) and the Tally House's row is cut by the left edge of the frame (`shots/r4-team-exterior-look/after43/low_end_take_card.png`). A panel 4 % narrower at 4:3 would let the view stand further toward the town | 16:9 and 21:9 are clear and whole |
| 5 | whoever owns `tests/e2e` | The bot looks at `vista_fire` itself before the ending starts, so its `ending:fire` frame is not the frame a player gets (the game only eases a view that is not already on the fire). `scratch/r4-team-exterior-look/end.mjs` takes the true one | critics judged the last image on the bot's frame |
| 6 | art-props-mech (owner of `tx_mask.py`) | I redrew only the body of `card_dowser(w, h)` (same rectangle, same table key, `glint_px` moved to the outer tine's tip) and rebuilt `tx_mask` then `card_dowser`. No other region was touched | a shared file |

## Closer, polish round 4 (2026-10-05): decisions

| Row | What | Decision |
|---|---|---|
| 1 | documents | mirrored: GDD 9.8 in place and 23.8, ART_BIBLE 6.5 in place and the round-4 coda notes, LEVEL.md 11 |
| 2 | `rim_town_card` note | done through `tools/gen_assets.mjs` (the `size` field stays the town alone; no `card_dowser` note said "held low") |
| 3 | the gun in the blue hour | open for round 5 (gun look) |
| 4 | a narrower panel at 4:3 | **Declined**: the fire is clear at 4:3; the cut row of houses is a framing cost of the panel |
| 5 | the bot's last frame | the hero frame of the ending is taken with `scratch/r4-team-exterior-look/end.mjs` (the true eased view) |

# Look team "exterior-look", polish round 5 (2026-10-06)

One issue (visual critic, major): the rim "has a blank maroon box against the sky and a pitch-black lift cage with a
notched opening". Evidence: `shots/r5-team-exterior-look/before/` and `after/` (the real game, 1280 x 720, Low and High;
`scratch/r5-team-exterior-look/rimcap.mjs <set> <tier>` takes all 24 frames in one browser; `end.mjs` the arrival and
the last image). Log: `scratch/r5-team-exterior-look/NOTES.md`.

## 1. What changed (for the documents)

| What | Before | After |
|---|---|---|
| The mesa east and west of the ledge (`env_backdrop_dusk.py`: `wing`, `under_ledge`) | five plain quads in two colours, 0.3 m from the ledge's ends: a maroon box in every view east or west | **wings of the rim's own cliff**: `env_far_rim.cliff_column` continued along the old wall's line (same noise: the beds, buttresses and broken skyline run on), 26 m west to the nose at (-24, 106.4) and 33 m east to the nose at (57, 102.4), painted light (unlit `m_flat`: a bed's face `#44232A`, a recess `#2A1820`, under a lip `#14121F`, the rim rock `#4C2C2E`), down to the scree; the rock under the ledge's two ends. The zone's chunk may not leave its box (x -2 .. 30), this card may |
| The far country of the dusk backdrop | four rings and the hogbacks all the way round | every landform that stands wholly within **60 degrees of south** of the rim is not drawn (it stands behind the mesa from anywhere on the ledge: `tests/art_env_exterior/rim.test.mjs`, 43 200 rays, the southernmost open one 67 degrees from south). 1 965 of 2 000 triangles (was 1 987) |
| The rock room round the proving lift (`env_far_rim.py` `build_frame`: Part `rim_room`) | `rock_dark` x 0.9, vertex-lit in a closed box: L* 7, ink. **The cage's panels are single-sided: from inside it she looks through them at this room** | the mesa's stone (`ROOM_DARK` 0.40), lit by the afterglow through the opening: three bake-only area lights (`fill_cage` in the face's plane looking in, `fill_cage_back` what the back wall gives back, `fill_brow` under the brow; `KS_RIM_CAGE`, 28 W). Walls L* 9 to 14 with their beds, the reveal L* 18 to 24, the brow's underside rock, not a band of ink |
| The opening's top (`OPEN_TOP`, `brow_lip`) | a notch 0.56 m deep with one plumb side, cut 62 % back into the brow | a bite a hand deep with shoulders a pace long; the lintel only a little out of true |
| `src/render/moods.ts` | | new sub-volume key **`L6c`** (`rimCage`): L6 in everything but the dynamic ambient, key, key direction and fill; `moodAt('far_rim', 'L6', y, z)` returns it beyond `RIM_CAGE_MIN_Z` 111.8 (only the cage stands there): the cage's posts, rail, floor and call station take an ember key from the north (2.4), a dusk-violet ambient (0.5) and fill (1.2). The frame, fog, sky and view-model rig are L6's |
| The pylon stump on the ledge (`env_far_rim.py`) | pale enamel, L* 65: the lightest thing on the ledge | x 0.32 |
| `env_far_rim` | 8 116 of 14 000 triangles | 8 316 (the room's walls are tessellated for vertex light); `lm_rim` re-baked |

Measured in the real game on the rim (20 static views, 1280 x 720): Low 8 to 15 draw calls, 16.2k to 17.4k triangles,
34.3 MiB; High 19 to 26, the same triangles, 48.7 MiB (before: Low 8 to 15, 16.1k to 17.2k, 34.3 MiB).

## 2. Requests

| # | To | What | Why |
|---|---|---|---|
| 1 | closer (docs) | Mirror section 1 into `docs/ART_BIBLE.md` (3.7 / the coda: the cage's room is lit rock, the frame's notch is a bite; the mesa's wings) and `docs/ARCHITECTURE.md` (the mood keys: `L6c` beside `L5a` / `L5c`; `moodAt` for `far_rim`) | documents |
| 2 | render-tech (seen, edited by me, one token each) | `src/render/system.ts` `setMoodKey`: `&& key !== 'L6c'` beside the two bore sub-volumes (the type needs it); `tests/render/moods.spec.ts`: `'L6c'` in the key list, three lines that hold `moodAt('far_rim', ...)` and "L6c differs from L6 only in the dynamic light" | a new mood key |
| 3 | gun look team (seen, not mine) | `tests/render/moods.spec.ts` "every mood carries a rig for the view-model" fails on the shared tree at the time of writing: L5a `vmK` 1.5 shows the key at 0.825, the test's cap is 0.7975 (`VM_KEY` x 1.45) | their in-progress number or their test |
| 4 | underground look / art-props-mech | `ia_proving_lift_cage` (and `ia_lift_cage`) are drawn FrontSide and have no inner faces: from inside a cage she sees its posts, rail, floor and call station but looks straight through its wall and roof panels at whatever stands round it. On the rim that is now a lit rock room; in the bore and the lift hall it is the shaft | found while lighting the rim's cage |
| 5 | closer (`design/assets.json` notes, optional) | `env_backdrop_dusk` now also carries the rim mesa's wings (its note says "mesa cards, pylon line") | a note |

## Closer, polish round 5 (2026-10-06): decisions

| Row | Decision |
|---|---|
| 2.1 | **Mirrored**: ART_BIBLE round-5 amendments ("The coda"), ARCHITECTURE 8.2 (3) (`L6c`, `moodAt`), LEVEL 12, GDD 23.10 |
| 2.2 (one-token edits in `system.ts`, `moods.spec.ts`) | **Accepted** |
| 2.4 (cages single-sided) | **Not changed**: a shared prop used in three zones, embedded in bakes; known gap |
| 2.5 (`design/assets.json` note of `env_backdrop_dusk`) | **Not applied**: the design data is frozen and a change to it rebuilds all 102 assets for a note |

## Fixer, release pass p0 (2026-10-07): decisions

| Row | Decision |
|---|---|
| 2.5 (`design/assets.json` note of `env_backdrop_dusk`) | **Applied** through `tools/gen_assets.mjs` (the manifest was being regenerated for ruling R14 anyway; all 102 items were rebuilt once at the end of this pass) |
| budgets (ruling R14) | **Changed, read this**: to pay for the view-model the chunk plans were cut toward the built meshes: `chunk_lip_gate` 8 000 -> **5 000** (built 4 014), `chunk_st_east` 16 000 -> **14 000** (12 963), `chunk_st_yard` 14 000 -> **13 000** (11 831), `chunk_st_works` 8 000 -> **7 000** (6 317), `env_backdrop_day` 2 500 -> **2 000** (1 589). Unchanged: `chunk_lip_rock` 8 000 (7 742), `chunk_lip_upper` 7 000 (3 291), `chunk_lip_mid` 4 000 (1 289), `chunk_st_west` 16 000 (15 423), `chunk_rim_ledge` 14 000 (8 316), `env_backdrop_dusk` 2 000. The first image (the lip) and the last (the rim) keep their whole plan: 6 400 and 5 700 triangles are free there. `cell_street` / `cell_yard` stand at 119 930 of 120 000: a chunk may be filled to its plan, not past it |

# Look team "exterior-look", release pass p0 (2026-10-07)

Two issues of the final review (`scratch/lead/known-issues-full.json`, team `exterior-look`): High is Low in the gully, at
the lip gate and in the yard (R9); the rim's lift cage is a flat maroon box. Evidence: `shots/p0-team-exterior-look/before/`
and `after/` (the real game, 1280 x 720, 32 views on Low and on High; `pair_*.png` = Low left, High right), work frames
`w1` .. `w15`, `iso/` (one view with the shafts and the bloom switched off in turn). Tools:
`scratch/p0-team-exterior-look/cap.mjs <set> <tier> [regex]`, `diff.mjs <set>`, `iso.mjs`. Log: `NOTES.md` there.

## 1. What changed (for the documents)

| What | Before | After |
|---|---|---|
| **High, outdoors by day: sun shafts** (`src/render/post.ts` `SunShaftEffect`, constants `SHAFT_*`; `system.ts` sets `post.shaftK` / `shaftCol` from the mood) | High added the shadows of dynamic things and a bloom the Long Light rarely reaches: 0.4 to 1.5 of 255 from Low in the yard and the street | One more term in High's merged pass, from the depth the contact shade already reads (**no new pass, no new target**: 12 full-screen draws as before): from each pixel 16 steps toward the sun's place on screen (at most 0.62 screen heights), counting sky; added in the mood's sun colour x `SHAFT_K` 0.2, falling off with the on-screen distance from the sun (`SHAFT_FALL` 2.6). The sky and whatever stands beyond 80 m take a fifth of it (`SHAFT_SKY`, `SHAFT_NEAR` 18 m / `SHAFT_FAR` 80 m): the far pylons, the mesas and **the Dowser on the skyline keep their dark**. Off with the sun more than about 83 degrees from the view, indoors, and in the blue hour (no sun disc). The view-model takes none |
| **High's contact shade under a sky** (`post.ts` `AO_SKY`) | 0.35 of the room's (set before `AO_LIT` existed, for the stipple on sunlit rock) | **0.75**: `AO_LIT` already takes it off lit faces; wall feet, the gate's timbers and what stands in the yard's shade are grounded. No stipple seen in the gully (`after/high_lip_gully_c.png`) |
| **The overhang's sun shaft, both tiers** (`src/render/system.ts` `LIP_BEAM_*`, `updateLipBeams`) | the bake's sun patch lay on the sand with nothing in the air | two `sun_blade` cards of the effects pool from the notch to the two lobes of the patch while she is under the roof by day (z > 95; they fade over 3 m of the mouth and the slots are released); the pool's motes ride in them (120 on Low, 600 and a third card on High). **This changes the first image and the title shot on both tiers.** While they are lit the ambient points are motes, not blown sand (the pool's rule) |
| **The rim's lift shaft** (`blender/env_exterior/env_far_rim.py`: `build_shaft`, `build_shoring`, `fill_shaft`) | a 4 x 4.7 x 3.5 m box of four flat quads AT the cage's envelope: it covered the cage's own lattice panels | the head of a shaft 0.4 to 0.9 m clear of the cage: the mesa's beds in relief on three walls, a 0.6 m slot round the cage's floor, the shaft going on 1.9 m over the cage; a frontier timber set in the gap (posts, caps, cross timbers, braces, lagging), the hoist's sheave, rope and bail. **The cage's lattice is seen from inside now** and the lit rock and dark timber through it. One more bake-only light (`fill_shaft`, 85 W, `KS_RIM_SHAFT`) |
| The opening seen from the cage | jambs and the face round the opening lit maroon (`JAMB_DARK` 0.5 / 0.68, face `ROOM_DARK` + 0.15), jamb relief 0 to 9 cm | `JAMB_DARK` 0.62 / 0.86, `FACE_DARK` 0.88, `fill_cage` leans east at 0.6 of its watts, the jambs' beds step back 16 to 22 cm (outward only): the opening carries the frame |
| `env_far_rim` | 8 316 of 14 000 triangles | **11 374** of 14 000, 3 draw calls as before; `lm_rim` re-baked |

Measured (real game, 1280 x 720, encounters off): rim, in the cage: Low 11 to 16 draw calls, 23.8k to 24.2k triangles,
36.6 MiB (before: 10 to 15, 16.9k to 17.3k, 36.6); High at the lip start 68 dc / 69.9k (before 67 / 66.8k: the blades' cards
are in the one quad batch; the triangles are the motes and cards). Low against High, mean absolute difference of 255 with
the view-model's box left out (`diff.mjs`): `yard` (the Dowser's vista) 0.7 -> 2.0, `yard_in` 1.2 -> 3.8, `yard_mid_nw`
(the sun in view) 1.5 -> 6.6, `street_w` 1.5 -> 4.1, `lip_start` 2.6 -> 3.8, `lip_mouth` 4.5 -> 5.6, `gate_from` 1.4 -> 2.3.
**Unchanged, honestly:** `gate` 2.4, `yard_s` 0.5, `yard_w_back` 0.5, `yard_derrick` 0.5, the gully under the settled Long
Light looking down it 1.8 to 1.9: with the sun behind her or behind rock and nothing dynamic in view, High is Low plus FXAA.

## 2. Requests

| # | To | What | Why |
|---|---|---|---|
| 1 | closer (docs) | Mirror section 1 into `docs/ART_BIBLE.md` (the first image: the shaft of sun under the overhang; the coda: the lift's shaft and timber set, the cage's lattice seen from inside), `docs/ARCHITECTURE.md` 8.2 / 8.4 (High's merged pass: contact shade, **sun shafts**, bloom, grade; `AO_SKY` 0.75) and GDD 6.8 (what High adds) | documents |
| 2 | closer (assets) | `node tools/build-assets.mjs --only env_exterior` at 02:10 also rebuilt `tx_frontier_trim`, `tx_sand`, `lm_surface`, `env_the_lip` and `env_plenty_street` (the driver found them stale: not my sources, so an embedded prop or a shared input had changed). They embed whatever props stood in `blender/export/` then: rebuild the zones once more after the prop teams finish | embedded props |
| 3 | creatures-props / props-mech | (a) `ia_proving_lift_cage`'s lattice and roof are lit from their OUTER side only: from inside they are near black under `L6c` (the rock behind them is what reads). (b) Its call station's salmon face is the lightest thing in the cage and blooms into a blank on High under the blue hour's threshold (`after/pair_3.png`); it does not follow the mood's key (I tried `RIM_CAGE_KEY` 2.4 -> 1.5: no change, reverted). (c) The grey plate on its back panel (1 x 1.3 m, upper left) reads as a blank card | found while rebuilding the shaft |
| 4 | render-tech (seen, edited by me in shared files) | `src/render/post.ts`: `SunShaftEffect`, `SHAFT_*`, three fields on `PostChain` (`shaftK`, `shaftSun`, `shaftCol`, private `shaftProj`), one more effect in `chainOf()`'s High pass, six lines in `finish()` inside the `keepsDepth` block, `leaveChain()` zeroes the strength, `AO_SKY`. `src/render/system.ts`: `LIP_BEAM_*`, `lipBeams`, `updateLipBeams()` called before `q.begin()`, three lines after the `aoK` line in `updateAtmosphere`. Nothing was reordered | shared files |
| 5 | gun team (seen, not mine) | `tests/render/polish3.test.mjs` "R6: the revolver is lit by its own rig in every zone" failed in my two runs on the antechamber (4.2 % of the view-model under L* 12; the cap is 4) while the view-model was being rebuilt | their in-progress asset |
| 6 | reviewers / bot authors | A frame of the gully taken by a debug teleport from `cp_lip_start` is in mood **L0** (the overhang's glare, bloom threshold 0.42) for ever: `trg_glare` at (14, 14, 97) was never crossed. Cross it and step 1 500 ticks first (`cap.mjs` does). The "washed-out pylon on High" in such frames is not what a player sees after the 20 s ramp |

## Closer, release pass p0 (2026-10-07): decisions on this file's p0 rows

Evidence: `docs/INTEGRATION_REPORT.md` Part K, `scratch/p0-closer/NOTES.md`, `scratch/p0-closer/gate/`.

| Row | Decision |
|---|---|
| Section 1 | **Applied**: ART_BIBLE "Amendments, release pass p0", ARCHITECTURE 8.4's p0 note, GDD 23.12, LEVEL 13 (the cage envelope rule). The "single-sided panels" statement of round 5 is corrected in ART_BIBLE |
| 2.2 rebuild the zones once more | **Done**: a full rebuild of all 105 items after the manifest change (487.7 s), zones last |
| 2.3 the cage (`ia_proving_lift_cage`) | **Not applied** (prop work): the lattice and roof near black from inside, the call station blooming on High, the grey plate. Known issues |
| The UI's row: the last fire | **Applied** (see `ui.md`) |
| Not done: High = Low with the sun behind her; the gate frame; the sun's glare blob | Known issues |

# Look team "exterior-look", pass i1 (2026-10-07)

Five issues from the i1 reviewers: the Rule read as plumb from the gully (story-b, minor), the gully / lip gate / yard were
sparse (visual-a, major), the last fire was a pale pill (visual-a, minor), High was nearly Low in the yard and at the gate
(visual-b, major), the last image was half dark with a small fire and a blurred rock (visual-b, minor). Log:
`scratch/i1-team-exterior-look/NOTES.md`. Evidence, the real game at 1280 x 720 (opened): `shots/i1-team-exterior-look/before/`
and `after/` (32 static views a tier, `sheet_{low,high}_0..5.png`, `pair_high_low.png`, `low_end_take_nogun.png`,
`high_end_take_card.png`, `look_low_cart.png`), work frames `w1` .. `w10`. Scripts: `cap.mjs`, `end.mjs`, `look.mjs`, `diff.mjs`,
`pair.mjs`, `chunks.mjs`, `collider.mjs` in the scratch folder.

## 1. What changed (for the documents)

| # | What | Where | Numbers |
|---|---|---|---|
| 1 | **The Rule leans 2.5 degrees in the opening and 5 on the rim** (it was 1 and 2: 2 px off plumb over 360 px beside a vertical pylon while the narrator said "It leaned") | `src/world/ending.ts` `LEAN_OPENING`, `LEAN_RIM`; `src/render/sky.ts` (the default, and the rim's wider halo now starts at 3.5 degrees) | measured 4.9 degrees in the last image; `nar_rim_3` ("Further than from the gully") stays true |
| 2 | **The gully's walls have two more beds at eye level**: between the first ledge and 3 m each wall was one plane with the bedding drawn on it; now two soft beds retreat under hard lips a hand to a span proud, lightmapped (the chart's second coordinate is the length along the profile, so a ledge's top has texels). The overhang's walls take the same rows | `blender/env_exterior/lip_parts.py` `column_rows`, `N3`, `UNDER_ROWS`, `LIP_ROWS`, `build_curtain` | about 1 000 triangles over the three low chunks |
| 3 | **Mid-scale dressing of the gully and the forecourt**, none of it with a collider: scree fans and slabs on edge at the walls' feet, dead scrub, four dead trees standing out of the walls' feet, bedrock plates and loose stones along a dry wash on the open floor (nothing there over 0.33 m), a line pylon's ceramic cross-arm with its insulators and cable against the east wall of the second reach, the wreck of a cart (two wheels, axle, boards) against the west wall of the third | new `blender/env_exterior/lip_dress.py`, called from `lip_parts.build` | 111 stones, 8 slabs, 13 bushes, 10 plates, 4 trees: 5 032 triangles. `env_the_lip` 22 684 of 24 000; chunks (the plan in brackets): gate 4 868 (5 000), mid 3 366 (4 000), upper 6 728 (7 000), rock 7 722 (8 000); `node scratch/i1-team-exterior-look/chunks.mjs` prints them. `collider_terrain` is byte-identical (2 564 triangles, same hash) |
| 4 | **What wheels, feet and wind left on the sand is painted into `lm_surface` after the bake** (no triangle, texture or draw call): in the Lip a dry wash with pebbles and silt rims, the cart's two ruts from the wreck down through the gate to the street's modelled ruts, ONE line of boot prints from the mouth of the overhang to the gate, the trodden middle, wind streaks, a dark foot and a pale drift line along every wall; in the yard the packed middle against loose sand along the walls, the ruts in through the yard door to the water cart, the trodden line to the Tally House, boot prints across the yard to the ladder at the west wall's gap, damp under the tank and at the trough | new `blender/env_exterior/ground_paint.py`, called from `bake_surface.py` | 920 270 texels of the Lip and 302 454 of the yard in 35 charts; the atlas is still 16 texels a metre (62 % used, about 230 charts) |
| 5 | **The yard**: four low drifts across the open floor (their toes take the ground's own colour), scrub in the two wall feet that are clear of every nav link, a dead cottonwood in the south-west corner with its trunk in the west wall's face, a cart wheel against the south wall, the bricks that came out of the west wall's gap | `blender/env_exterior/street_yard.py` `build_dress` | `chunk_st_yard` 12 617 of 13 000; `env_plenty_street` 47 890 of 50 000 |
| 6 | **The last fire is a flame**: three tongues that lick at their own rates, deep orange at the edges, a pale-yellow heart low in the middle one (it was one near-white capsule at alpha 2.6); never under 92 px tall (46); six puffs of smoke lit warm from below; two flat pools of light on the plain; a dimmer halo; five sparks | `src/render/vfx/quads.ts` `SHAPE_FIRE`; `src/render/vfx/vfx.ts` `FIRE_PX`, `fillCards` | 18 quads of the one batch while it burns (it was 7) |
| 7 | **The last image**: the fins of the mesa's foot hold the afterglow on their north-west flanks (`ROSE` `#A2605E` at 0.72), the three ridges are lit along their back slopes (0.30 of the ember colour) and dark on their faces, and the slab of caprock that lay at x 3.9 on the lip, in the bottom of the ending's view, lies at x 10.4 | `blender/env_exterior/env_backdrop_dusk.py` (`foot_col`, `ridge`), `env_far_rim.py` (`rim_edge_blocks`) | `env_backdrop_dusk` 1 965 of 2 000, `env_far_rim` 11 374 of 14 000 (unchanged counts) |
| 8 | **High outdoors** (R9): (a) the **sun's veil**: glow in the dusty air between her and the middle distance on the sun's side of the frame, 5 to 28 m in, gone by 130 m (the mesa, the pylons and the figure on the skyline keep their dark), half strength between the gully's walls, none under the overhang; (b) **dust in the light**: half of High's 400 ambient points are round gold motes from knee height to 3.5 m that drift and glint; (c) the Long Light's relief 2.4 -> 3.6. No new pass, target, texture or draw call | `src/render/post.ts` `VEIL_*`, `PostChain.shaftVeil`, `SunShaftEffect`; `src/render/vfx/ambient.ts`; `src/render/system.ts` (`openAir`, six lines where `shaftK` is set, one where the sand cloud is set); `src/render/moods.ts` `RELIEF` | Low against High, mean absolute difference of 255 (`diff.mjs after`, the view-model's box left out): `gate` 3.0 -> 4.5, `gate_from` 2.3 -> 3.3, `yard` (the Dowser's vista) 2.1 -> 3.7, `yard_in` 4.2 -> 6.9, `yard_mid_nw` 6.7 -> 8.4, `street_w` 4.2 -> 7.1, `lip_gully_a / b / c` 1.9 to 2.1 -> 4.0 to 4.5 |

Measured on the final tree (static views, encounters off): Low 11 to 50 draw calls, at most 88 214 triangles, 48.9 MiB on
the surface and 29.6 on the rim; High at most 93 draw calls, 164 234 triangles, 73.9 MiB.

## 2. Not done, honestly

- **With the sun behind her High is still Low**: `yard_s` 0.7, `yard_w_back` 0.5, `yard_derrick` 0.8, `gate_e` 1.4, `gate_n` 1.8.
  Every shadow outdoors is in the bake on both tiers; the veil and the shafts need the sun's side of the sky.
  The yard's checkpoint view is 3.7, not the reviewer's 5.
- **The forecourt (the lip gate's court) is still the plainest exterior**: `chunk_lip_gate` is at 4 868 of its 5 000 triangles (the
  mouth's closed rock masses, the gate wall and the pylon took 4 014 of them before this pass). It got the eye-level beds on its rock, three bedrock
  plates, two bushes, the ruts and the boot prints; its north wall and the sand in front of it are as they were. A
  re-allocation by the fixer (R14: about 1 500 triangles from `chunk_lip_upper`'s or `chunk_lip_mid`'s plan to
  `chunk_lip_gate`) would let it take scree, a tree and a fence line.
- The cart's wreck stands in the deep shade of the third reach's west wall and reads dim from the path (`after/look_low_cart.png`).
- The dead trees and the bushes have no collider (their trunks stand in the hand's breadth of wall a body cannot enter,
  their crowns are over head height, and `tests/art_env_exterior/openings.test.mjs` holds every drawn triangle off the
  nav links); a player who presses into a wall's foot can put the camera against a trunk.
- Not run by me: the whole-stage playthrough (`tests/e2e/playthrough.test.mjs`). The collider is byte-identical and no
  gameplay file changed, so its hash should hold; the closer's gate will say.

## 3. Requests

| # | To | What | Why |
|---|---|---|---|
| 1 | closer (docs) | Mirror section 1: **GDD** section 2's lexicon row "the Rule ... leans about one degree" -> "two and a half degrees from the gully, five from the rim"; **ART_BIBLE** 3 ("leaning 1 degree toward the east", "2 degree lean" x2, "The Rule at 2 degrees") -> 2.5 and 5; ART_BIBLE 7.2 `lip_gully_walls` (two eye-level beds, scree, slabs, scrub, the dry wash, the cart, the cross-arm), the yard's dressing, the last fire (flame, pools, sparks; 92 px), High's sun veil and dust in the light (ART_BIBLE 3.2 / 10, ARCHITECTURE 8.2: still one merged pass); **LEVEL**: "no drawn thing over 0.33 m on the open floor of the gully; nothing with a collider was added" | R1: the number changes in the code and the documents together |
| 2 | closer (assets) | `env_the_lip`, `env_plenty_street`, `lm_surface`, `env_far_rim` (+ `lm_rim`) and `env_backdrop_dusk` were rebuilt at full quality by `node tools/build-assets.mjs --only env_exterior`; they embed the props and shared textures as they stood at 08:40. Rebuild the zones last if a prop or a design file changes after this. `public/share.jpg` is the title frame: the gully's mouth now has a dead tree in it and the Rule leans further, so re-run `node tools/make_share_image.mjs <title frame>` | the driver's rebuild rule |
| 3 | fixer (R14) | Row 2 of section 2: 1 500 triangles more for `chunk_lip_gate` | the forecourt |
| 4 | world team (seen, edited by me) | `src/world/ending.ts`: the two lean constants and their comment, nothing else | the staging of the Rule |
| 5 | render-tech (seen, edited by me in shared files) | `post.ts`: `VEIL_*`, one uniform on `SunShaftEffect`, `PostChain.shaftVeil`; `system.ts`: `openAir` (read from the mood's saturation: 0.9 under the overhang, 1 under the Long Light; if L0's saturation is ever changed, give the two moods a field of their own), the veil where `shaftK` is set, `gv.z` on the sand cloud; `vfx/ambient.ts`: the dust branch of the sand mode; `vfx/quads.ts` `SHAPE_FIRE`; `vfx/vfx.ts` the last fire's block; `moods.ts` `RELIEF.L1`; `sky.ts` the lean's default and threshold | shared files |
| 6 | reviewers / bot authors | `tests/render/polish.test.mjs` and `polish3.test.mjs` hold the fire to "the brightest warm pixel within 14 px of its point" and "a glow 90 to 400 px wide": the flame's heart is seated on the fire's point and the wide pool is 15 flame-widths for that reason; widen those two numbers before making the pools larger | the tests are render-tech's |

## Closer, pass i1 (2026-10-07): decisions on this file's i1 rows

| Row | Decision |
|---|---|
| Request 1, documents | **Mirrored**: GDD section 2 (in place) and 23.14, ART_BIBLE 3 (four places, in place) and "Amendments, pass i1", LEVEL 15 |
| Request 2, assets | **Done**: every asset was rebuilt after this pass's last design change, the zones with the final props (the cart's and the wagon's round wheels are in the street now); `public/share.jpg` made again |
| Request 3, 1 500 triangles more for `chunk_lip_gate` (R14) | **Not applied**: no team is left in this pass to spend them. For the next pass's fixer; the forecourt is listed in `docs/KNOWN_ISSUES.md` |
| Request 4 / 5, edits in `src/world/ending.ts` and the shared render files | **Accepted** |
| Request 6, the fire's two test bounds | **Kept as they are** (the suite is green with the flame as built) |

# Look team "exterior-look", pass i2 (2026-10-07)

Eleven issues from the i2 reviewers (seven after merging duplicates). Log: `scratch/i2-team-exterior-look/NOTES.md`.
Evidence, the real game at 1280 x 720 (opened): `shots/i2-team-exterior-look/before/` and `after/` (32 static views a
tier, `sheet_{low,high}_0..5.png`, `pair_a.png`, `pair_b.png` = Low left, High right), `afterc/` (19 walk-up frames),
`after/low_end_take_*.png` / `high_end_take_*.png` (the TRUE last image and the end card), `sky2/`, work frames `w1` ..
`w5`, `c1` .. `c3`, `test/` (the new test's frames). Scripts: `cap.mjs`, `close.mjs`, `sky.mjs`, `end.mjs`, `diff.mjs`,
`pair.mjs`, `chunks.mjs`, `dev/run.sh` in the scratch folder.

## 1. What changed (for the documents)

| # | What | Where | Numbers |
|---|---|---|---|
| 1 | **The Rule leans 6 degrees in the opening and 9 on the rim** (2.5 and 5: the story reviewers measured 1.8 to 2.4 on screen in the gully) | `src/world/ending.ts` `LEAN_OPENING`, `LEAN_RIM`; `src/render/sky.ts` (the default; the rim's wider halo now starts at 7.5) | on screen 5.9 from the gully, 8.6 from the rim (`tests/art_env_exterior/tiers.test.mjs`) |
| 2 | **The last fire is small and far**: a flame of about 18 px (card 30; it was 92), steady (it breathes by a tenth, it does not gutter), a tight bloom of 52 px and a wide dim one of 130, a long thin pool of light lying on the flat, a hairline of smoke eight flames tall, no sparks | `src/render/vfx/vfx.ts` `FIRE_PX` and the last fire's block | `tests/render/polish3.test.mjs`: the hot body 8 to 48 rows, measured 40 at 960 x 540 (it asked for 30 or more) |
| 3 | **The last image**: the eased view rests 7 degrees ABOVE the fire and dead on its bearing (it was on the fire and 0.15 of the way to the town): the land's edge is at 62 % of the frame's height (54 %), the fire is on the frame's middle line just left of the muzzle, clear of the panel at every shape. The dead pylon of the town card stands 6.8 m further west, at game (-7.7, 61): left of the Rule, in front of the town's east end, and in line with the fire from no place on the ledge | `src/world/ending.ts` `TURN_TOWARD_TOWN` 0, new `TURN_LIFT_DEG` 7; `blender/env_exterior/rim_town_card.py` | the town's westmost block is cut by the frame's left edge at 16:9 (it was whole) |
| 4 | **The sighted man is about 56 px tall** at 720p (28) | `src/world/director.ts` `SIGHT_MIN_PX` 62 (32); `tests/world/sighting.test.mjs` bounds 46 to 70 px tall, 12 to 44 wide, and a taller search window | |
| 5 | **Clouds are the sky's**: long soft bars on a deck overhead, cut from the shared noise (two taps on sky pixels, no new texture, pass or draw call), thin edges lit by the sun or the afterglow, by day and in the blue hour. The five faceted cloud cards are no longer built | `src/render/sky.ts` (`CLOUD_DAY` 0.50, `CLOUD_DUSK` 0.54); `blender/env_exterior/env_backdrop_day.py` | `env_backdrop_day` 1 539 of 2 000 triangles (1 589) |
| 6 | **Walls, rock and the drum are weathered in the lightmap** (after the bake; no triangle, texture or draw call): adobe has broad plaster tones, an eroded foot and fallen patches where the lighter adobe brick shows in courses under the plaster's shadowed lip, hairline cracks, rain streaks under the top, a damp foot and the pale line of blown sand; the gully's lower walls have broad warm and cool fields, thin beds, varnish streaks and joints; the yard's drum has plate laps with rivet rows, each plate its own enamel, a rust skirt to a knee's height, weeps under the laps and one green-white mineral streak under the tap; boards have damp feet and rain from the eave; stop one's shelf is leached and dusty with sand over its rim and two joints (still swept: no hearth, no ash, as GDD section 2 and ART_BIBLE 3.6 rule; the reviewer's stone ring, ash and bedroll were NOT added) | new `blender/env_exterior/wall_paint.py`, called from `bake_surface.py`; `lip_built.py` `build_camp` (the shelf's top runs to the floor's sand colour at its rim) | 492 000 texels of adobe, 482 000 of rock, 152 000 of timber, 21 000 of the drum; `lm_surface` 1.56 MB (1.52) |
| 7 | **The frontier detail sheet**: the `strata` row's beds are plainly darker and lighter (+-0.13 of the sheet, it was +-0.05), with varnish streaks under every bedding plane and two pale seams; the `adobe` row's trowel sweep and broad tone are half as strong again | `blender/tex/tx_frontier_trim.py` (regions unchanged) | every rock face and adobe wall, indoors too |
| 8 | **The forecourt and the third reach**: what is left of a stock fence along the east rock's foot (six posts out of true, one rail up, one hanging, one on the sand; the court's only strip no nav link crosses), and a length of Old-World ceramic main the floods uncovered, crossing the third reach from wall to wall with its livery collar, its crown 0.12 m over the floor. No collider | `blender/env_exterior/lip_dress.py` | fence 84 triangles, main 128; `env_the_lip` 22 896 of 24 000; `collider_terrain` unchanged |
| 9 | **The ruin's door**: the front walls run into the door frame's posts (daylight showed between wall and post) | `blender/env_exterior/street_parts.py` `b_ruin` (`GAPW` 0.66, it was 0.78) | `env_plenty_street` 48 033 of 50 000 |
| 10 | **A test holds High against Low outdoors and the Rule's lean** | new `tests/art_env_exterior/tiers.test.mjs` | Low against High, view-model hidden, 90 ticks after the switch: forecourt 8.4, street 11.6, yard door 10.7, the yard's vista 7.4, the last view 7.5 of 255 (floors 6, 7, 7, 5.5, 5.5) |

High outdoors needed no new term from this team in this pass: with render-tech's town shadows and outdoor shade the
static views measure 3.9 to 10.4 (`diff.mjs after`, 15 ticks after arriving) and 7.4 to 11.6 once the air light has
eased in (row 10).

## 2. Not done, honestly

- **`nar_rule` is still said wherever she is** when its turn comes (story-a: "say it only while the Rule is inside the view
  cone in the gully"). That is the story queue's logic (the world team's, as it did for the watcher); the lean itself is
  now plain in every gully frame.
- **The crosshair still crosses the sighted man** when she looks straight at him (the look is not steered in the
  sighting: the glint draws it). Hiding it is the HUD's.
- **The rock above 3 m is still a few large facets** (vertex-lit, tessellated to 7 m): it has the stronger strata sheet
  now, not new geometry (`chunk_lip_rock` has 278 triangles left). The lightmap's fields, beds and joints stop at 3 m.
- **The forecourt's sand is still wide**: the fence is at its east edge because every other square metre of the court is
  under a nav link; `chunk_lip_gate` is at about 4 955 of 5 000.
- **Stop one's shelf keeps a thin dark outline** (its chamfer faces turn from the sun): a pale slab now, not an orange disc.
- **The town's westmost block is cut by the left edge of the last image** at 16:9 and more at 4:3 (the fire is centred).
- **A fire-lit rim on the near dune's crest** (visual-a) was not added.
- Brick courses are 0.19 m (three texels): from under a metre a patch's edge shows the lightmap's 6 cm steps.
- Not run by me: the whole-stage playthrough and the e2e suite. `collider_terrain` is unchanged and no gameplay rule
  changed, but the eased last view (yaw and pitch) and the figure's scale are part of what a hash may hold.

## 3. Requests

| # | To | What | Why |
|---|---|---|---|
| 1 | closer (docs) | Mirror section 1: **GDD** section 2 (the Rule: "six degrees from the gully, nine from the rim"), 9.3 (the figure about 56 px), 9.8 (the eased view: on the fire's bearing, 7 degrees above it; the fire a small steady light); **ART_BIBLE** 3 (the lean, four places; clouds are drawn by the sky, soft, lit from below), 6.5 (56 px), the coda (the small fire, the pylon west of the Rule), 7.2 (weathering in the lightmap; the fence; the main), 11 (`strata` and `adobe` rows); **LEVEL** (the main: crown 0.12 m, no collider; the fence strip) | R1 |
| 2 | closer (assets) | `tx_frontier_trim`, `lm_surface`, `env_the_lip`, `env_plenty_street`, `env_backdrop_day`, `rim_town_card` were rebuilt at full quality by `node tools/build-assets.mjs --only env_exterior` / `--only rim_town_card`. The zones embed the props as they stood at 14:30: rebuild the zones last if a prop changes after this. `public/share.jpg` is the title frame: the Rule leans further and there are clouds, so run `node tools/make_share_image.mjs <title frame>` again. `src/ui/loadMeter.ts` `BOOT_FILE_BYTES` moves by about +0.1 MB | the driver's rebuild rule |
| 3 | world team (seen, edited by me) | `src/world/ending.ts`: `LEAN_OPENING`, `LEAN_RIM`, `TURN_TOWARD_TOWN`, new `TURN_LIFT_DEG` (one term in `startTurn`); `src/world/director.ts`: `SIGHT_MIN_PX`; `tests/world/sighting.test.mjs`: the figure's bounds and search window. And the request of section 2: say `nar_rule` only with the Rule in view | staging |
| 4 | render-tech (seen, edited by me in shared files) | `src/render/vfx/vfx.ts`: `FIRE_PX` and the last fire's block (flicker, lean, smoke, pools, halos, sparks); `tests/render/polish3.test.mjs`: the flame's hot rows 8 to 48, counted in the fire's own column; the sky's gradient sampled at x 560 to 640 (the pylon stands in the old column) and with the clouds switched off (`Sky.cloudCover`, a new field); `tests/render/lines.test.mjs`: the clouds off for the Rule's width. `src/render/sky.ts` is this team's: the cloud block reads `uNoise` and `uCloud.xy` (the shared block's drift) | shared files |
| 5 | UI team | The crosshair over the sighted man (section 2). At 4:3 the end panel now stands further from the fire (it is at 50 % of the width) | |
| 6 | fixer (R14) | Still wanted: about 1 500 triangles more for `chunk_lip_gate` and a nav-free patch in the forecourt's middle (a layout matter) if the court is to take a scree fan or a wreck | the forecourt |
| 7 | closer (budget note) | The exterior's six GLBs measure 2.86 MiB against ruling 24's 2.4 MiB share (they did before this pass: 2.85); with the two lightmaps (1.68 MiB of 3.1) the piece is 4.54 of its 5.5 MiB | a ledger line |

## Closer, pass i2 (2026-10-07): decisions on this file's i2 rows

| Row | Decision |
|---|---|
| Request 1 (documents) | **Mirrored**: GDD section 2 (in place) and 23.15 (2, 9.3, 9.8), ART_BIBLE section 3 (in place) and "Amendments, pass i2" (3, 6.5, 7.2, 11, the coda), LEVEL 16 |
| Request 2 (assets) | **Done**: every asset rebuilt after the last design change, the zones last (`scratch/i2-closer/build_assets.log`); `public/share.jpg` made again |
| Request 3 (edits in the world's files; `nar_rule` only with the Rule in view) | Edits **accepted** (`tests/world/` passes). The `nar_rule` condition is **open**: `docs/KNOWN_ISSUES.md` |
| Request 4 (edits in shared render files and tests) | **Accepted**: the flame's size bound follows the reviewers' reversal; the other two edits move a sample column and switch the clouds off for a measurement, they do not loosen it |
| Request 5 (the crosshair over the sighted man) | **Open** |
| Request 6 (R14: `chunk_lip_gate`, a nav-free patch) | **Not done** (no team left to spend it): LEVEL 16, `docs/KNOWN_ISSUES.md` |
| Request 7 (ledger) | **Noted** in Part N: the exterior's GLBs are 2.86 MiB of a 2.4 MiB share, the piece 4.54 of its 5.5 MiB; the total download is inside its cap |
| The first camp's "ring of stones, ash and a bedroll" | **Not done, by the documents**: GDD section 2 and ART_BIBLE 3.6 say stop one has no fire and no ash. Listed for the lead |

## Fixer, pass i3 (2026-10-07): decisions on the rows left open, and what the exterior has to spend

| Row | Decision |
|---|---|
| Request 6, pass i2 (R14: 1 500 triangles more for `chunk_lip_gate`) | **Applied** through `tools/gen_assets.mjs`: `chunk_lip_gate` 5 000 -> **6 500** (built 4 952). Also `chunk_lip_upper` 7 000 -> **8 500** (built 6 728) and `chunk_lip_mid` 4 000 -> **6 000** (built 3 494): both reviewers call the walk down the gully the plainest stretch of the stage. `chunk_lip_rock` stays 8 000 (built 7 722): it is drawn from the street and the yard, which stand at 119 788 of 120 000 |
| Paid for by | `chunk_st_east` 14 000 -> **13 400** (built 13 085), `chunk_st_west` 16 000 -> **15 700** (15 437), `chunk_st_yard` 13 000 -> **12 700** (12 624), `chunk_st_works` 7 000 -> **6 400** (6 317), `env_backdrop_day` 2 000 -> **1 700** (1 539). **The street has almost nothing left to add: 315, 263, 76, 83 and 161 triangles (and the zone script counts the four drawn nodes against the sum: 48 033 built of 48 200).** What High needs outdoors (R9) is light, air and shadow, not more of the Low mesh |
| The last image | `chunk_rim_ledge` 14 000 -> **16 000** (built 11 374), `rim_town_card` 600 -> **1 200** (built 349): `cell_rim` stands at 41 324 of 120 000 |
| Request 6, a nav-free patch in the forecourt's middle | **Declined.** The forecourt is the jug puzzle's floor and the test player's path; a hole in the nav graph there changes the deterministic playthrough for a piece of dressing. Things up to 0.33 m (a scree fan, bones, a half-buried wheel) may lie anywhere on the floor; anything taller goes on the strip at the east rock's foot or at the wall feet, as now |
| The first camp's "ring of stones, ash and a bedroll" (listed for the lead in pass i2) | **Ruled** (GDD 23.16, ART_BIBLE "Amendments, pass i3"): **a blanket, folded or rolled, with real folds and a soft contact shadow, replaces the flat orange patch**. No fire, no ash and no ring of stones: the one fire is at stop three |
| Request 5, the crosshair over the sighted man | stays with the UI and world teams (no core or design-data change is needed for it) |
| Request 3, `nar_rule` only with the Rule in view | stays with the world team (both story reviewers ask for it again in pass i3) |
| Cell headroom after this pass (plan) | `cell_lip_gully` 91 356, `cell_lip_gate` **119 507**, `cell_street` / `cell_yard` **119 788**, `cell_rim` 41 324. A chunk may be filled to its plan, not past it; `check-glb` holds each mesh to its chunk |

# Look team "exterior-look", pass i3 (2026-10-07)

Nine issues of the two visual reviewers (two of them the same major twice). Scope: `blender/env_exterior/`,
`tests/art_env_exterior/`, the Dowser card's placement, the surface and coda moods and exterior effects in `src/render`,
what High adds outdoors, the staging of the sighting and of the rim ending in `src/world`. Evidence:
`shots/i3-team-exterior-look/` (`before/`, `after/`, work sets `w1` to `w6`, `w2c` / `w3c` close-ups, `a1`, `map_the_lip.png`);
log and tools: `scratch/i3-team-exterior-look/NOTES.md` (`cap.mjs`, `view.mjs` = ad-hoc frames, `end.mjs` = the TRUE last
image, `dows.mjs` = the sighting projected, `diff.mjs`, `pair.mjs`, `chunks.mjs`, `map.mjs`).

## 1. What changed (for the documents)

| What | Before | Now |
|---|---|---|
| **Stop one** (`lip_built.build_blanket`; the fixer's ruling, GDD 23.16) | a swept rock shelf flush with the sand: "a hard-edged flat orange disc in the centre of the first image" | **his blanket**: dark wool folded once (1.5 x 0.92 m, two layers, a dark line between them), pale and rust end stripes, one end still rolled; the pot's stone stands on the sand beside it; a soft contact shadow painted round it (`ground_paint`). 260 triangles, one lightmapped chart. No fire, no ash, no stones |
| **The gully and the forecourt** (`lip_dress.build_i3`; R14's triangles) | scree, eight slabs, four trees, a cart, a main: "a wall left, a wall right and empty floor" | a beat every 10 to 15 m: **a mule's bones and its pack saddle** in the first reach (z 87), **the Old World's line still hanging from rim to rim** over the second (z 72; one strand parted, its insulators 2.3 m over the floor), talus and eight fallen blocks under both walls, a rockfall run out over the third reach's floor, **two of the Frontier's line poles** and a third down in the last reach, bedrock through the sand beside the ruts, and in the forecourt **a shade roof that fell where it stood** (all of it under 0.3 m). Nothing has a collider; `collider_terrain` is unchanged (2 564 triangles) |
| **Three shafts of the low sun across the gully's floor** (`lip_dress.SHAFTS`, `surface_common.add_fills`, bake only) | every reach one even shade (the walls are 12 to 16 m, the sun 14 degrees) | a long ragged patch of sun raking across the path in each of the first three reaches: on the bones, on the open floor, on the uncovered main. In the lightmap and the vertex light: both tiers |
| ... and on **High** each is a shaft in the air (`src/render/system.ts` `GULLY_SHAFT_*`, `vfx.ts` `gullyShafts`) | - | blade cards from 13.5 m up each shaft's line into the sand, seen from 44 to 62 m, gone while she stands in one. Not pooled cards: the wind's sand stays. No draw call (the quad batch) |
| Weather of the lightmapped walls (`wall_paint.GAIN`) | adobe "broad single-tone planes", rock "big flat faces", the tank "near-blank with faint panel lines" | every term at 1.3 to 1.5 times its strength; the rock has a damp base band a pace high and a silt line over it; `yd_drum`'s chart at 29 texels a metre (rivet rows and plate laps are drawn) |
| `plug_door_tally` | one black card a metre behind the wall: sky showed over and beside the shut leaves | a recess (card, soffit, two reveals; 8 triangles) |
| The Dowser (`env_backdrop_day`, `src/world/director.ts` `SIGHT_SINK`) | boots a pixel or two over the mesa's edge; the knob 3 m wide under a figure drawn 9 m wide | the knob is 8.4 m wide and the card stands **5 % of its drawn height into the rock** (set every drawn frame in `presentSighting`): the boots overlap the skyline by a pixel |
| The sand's sparkle on High (`src/render/materials.ts`, the SAND block) | a grain flashed wherever the baked light was bright enough, in that light's hue: "cold white-blue specks across shadowed sand" in the title frame | only where the baked light is the sun's (its red over its blue), in a warm white |
| The sun's veil on High (`src/render/post.ts`) | `VEIL_K` 0.85, one level added to everything 5 to 130 m off: "High's haze lowers contrast" | `VEIL_K` **0.70**, and a dark thing takes `VEIL_DARK` 0.30 of it (`VEIL_LIT` 0.06 .. 0.40 of scene light): the lit side warms, shade keeps its depth |
| High's sun shadow (`src/render/moods.ts` `SHADOW_SUN`) | `k` 0.55, `shade` 0.45 | `k` **0.60** (a cast shadow is darker), `shade` **0.40** (the bake's own shade is deepened less: at 0.50 the yard's walls lost their brick and plaster to one dark violet on High) |
| **The last image** (`src/world/ending.ts` `TURN_LIFT_DEG`) | 7 degrees over the fire: the land's edge at 55 % of the frame's height, a dark dune under it | **12**: the land's edge at 63 %, the fire at 68 %, the town's lamps under it, the mesa's foot the last tenth |
| The last fire (`src/render/vfx/vfx.ts`) | `FIRE_PX` 30, glows 130 / 52 px, six thin dark puffs: "a thin dashed dark streak" | `FIRE_PX` **38**, glows **150 / 60** px (the flame's hot body measures 29 rows at 540 lines), the smoke one soft column that opens and leans (each puff twice as tall, wider, half the strength) |
| **Stars** (`src/render/sky.ts`; `Sky.stars`, `Sky.starCover` a test's switch) | none | the first stars of the blue hour where the sky has gone dark: one cell in thirteen on High (they twinkle a little), the brighter two in five of those on Low; nothing by day. No texture, sky pixels only |
| The rim on High (`moods.ts`) | `GLANCE` L6 / L6c 1.6, L6 `bloomK` 1.0 | **2.1**, **1.15** |

Budgets (measured, `shots/i3-team-exterior-look/after/`, static views): Low surface at most **50 draw calls, 89 784
triangles, 48.9 MiB**; rim 15 / 26 149 / 29.6. Chunks: `chunk_lip_upper` 8 471 of 8 500, `chunk_lip_mid` 4 733 of 6 000,
`chunk_lip_gate` 6 197 of 6 500; `env_plenty_street` 48 039 of 48 200. `lm_surface` is still one 2048 square.

## 2. Not done, honestly

- **The upper wall faces are as they were** ("a few very large flat faces", "hard straight silhouettes several metres
  long"): they are `chunk_lip_rock`, which has 278 triangles left and is drawn from the street's cell (119 788 of
  120 000). The eye-level beds, the base band, the talus and the fallen blocks break the wall where she walks; the
  skyline is unchanged.
- **The shafts are painted light**: no notch of the modelled rim lets a 14 degree sun reach that floor. On High each
  shaft fades in about 5 m over the floor instead of coming over the rim.
- **The forecourt has nothing tall in its middle** (the fixer declined a nav-free patch): the fallen roof is flat.
- **The line poles are thin grey timber on red rock**: present, not striking.
- **Low against High** (`tests/art_env_exterior/tiers.test.mjs` and `i3.test.mjs`, 1280 x 720, the view-model hidden):
  forecourt 8.0, street 10.6, yard door 9.3, yard vista 6.8, the gully's second reach 6.7, the rim's last view 7.3 of 255.
  The mean is about what it was (the veil that carried most of it is a fifth weaker): what changed is what the
  difference is made of (shafts in the gully's air, deeper shade, a veil that leaves the darks alone, stars and a lit
  ledge on the rim). From inside the cage the side walls (1.3 to 1.5) and the view back at the cage (1.6) are still
  Low's frame, and the yard looking at the derrick is 2.1.
- A stencilled number on the tank was not added (the drum already carries a numeral and a maker's plate).
- Not run by me: the whole-stage playthrough and the e2e suite. The eased last view's pitch and the figure's place are
  part of what a hash may hold.

## 3. Requests

| # | To | What | Why |
|---|---|---|---|
| 1 | closer (docs) | Mirror section 1: **GDD** 2 / 23.16 (stop one: the folded blanket with a rolled end), 9.3 (the figure stands into the rim), 9.8 (the eased view 12 degrees over the fire; the fire 38 px; stars); **ART_BIBLE** 3 (stars in the blue hour; the gully's three sun shafts; High's veil and shade numbers), 3.6 / "Amendments, pass i3" (stop one as built), 7.2 (the gully's new dressing; `wall_paint.GAIN`); **LEVEL** (the mule, the hanging line, the poles, the fallen roof: none with a collider; chunk counts); **KNOWN_ISSUES** (section 2 above) | R1 |
| 2 | closer (assets) | `env_the_lip`, `env_plenty_street`, `lm_surface` and `env_backdrop_day` were rebuilt at full quality (`node tools/build-assets.mjs --only env_the_lip,env_plenty_street,lm_surface,env_backdrop_day --force`, 141 s). The zones embed the props as they stood at 20:15: rebuild the zones last if a prop changes after this. **`public/share.jpg` is the title frame**: the camp, the gun and the gully through the mouth all changed, so run `node tools/make_share_image.mjs <title frame>` again (and the UI team's loading backdrop follows it) | the driver's rebuild rule |
| 3 | world team (seen, edited by me) | `src/world/director.ts`: `SIGHT_SINK` and one line in `presentSighting`; `src/world/ending.ts`: `TURN_LIFT_DEG` 7 -> 12 | staging |
| 4 | render-tech (seen, edited by me in shared files) | `materials.ts` (two lines of the SAND block), `post.ts` (`VEIL_K`, `VEIL_DARK`, `VEIL_LIT`, one line of the shaft shader), `moods.ts` (`SHADOW_SUN`, `GLANCE`, L6 `bloomK`), `system.ts` (`GULLY_SHAFT_*`, `updateGullyShafts`, `sky.stars`), `vfx/vfx.ts` (`gullyShafts`, the last fire's block). **`tests/render/polish3.test.mjs`**: the flame's hot body is the longest run of hot rows (single grains of the afterglow 30 rows over a 29 row flame had made it "61 px tall"), and the stars are switched off beside the clouds for that comparison | shared files |
| 5 | gun team | `tests/render/polish3.test.mjs` R6 failed during my run with "bore: 4.1 % of it is under L* 12" (the view-model was being rebuilt): not an exterior matter | a note |
| 6 | fixer (R14), if another pass comes | `chunk_lip_rock` is the one place the gully's walls can still gain form (ledges, a broken skyline): it needs about 1 500 triangles that the street's cell does not have | section 2 |

Tests of this pass (all on the final tree, one after another): `node --test tests/art_env_exterior/` **29 pass** (the 25
of pass i2 and the 4 of the new `i3.test.mjs`: stop one is a blanket; three shafts on the gully's floor on both tiers and
in the air on High; the Dowser's boots on the rim and no sky over the shut Tally door; stars, and the last image on the
lower third); `node --test tests/world/` **146 pass**; `node --test tests/render/` 74 of 76 on the first run (the fire's
rows: mine, fixed and re-run; R6 "bore: 4.1 % under L* 12": the gun's); `npx vitest run tests/render tests/world` 88 pass;
`npx tsc --noEmit` 0 errors; `node tools/check-glb.mjs` 84 assets, 21 textures, 11.17 MB: all pass; `npm run validate` pass.

## Closer, pass i3 (2026-10-07): decisions

| Row | Decision |
|---|---|
| 3.1 documents | Mirrored: GDD 23.17, ART_BIBLE "Amendments, pass i3 (closer)", LEVEL 18, ARCHITECTURE "Pass i3", `docs/KNOWN_ISSUES.md` |
| Rebuild | every asset rebuilt at full quality after the last design-data change (the zones last) |
| `public/share.jpg` | remade from this pass's title frame |
| `tests/render/polish3.test.mjs` (hot body = longest run of hot rows; stars off for the sky comparison) | **Accepted**: the measure follows the thing measured |
| Section 2, not done | In `docs/KNOWN_ISSUES.md` |

## Fixer, pass i4 (2026-10-08): what is ready for this team, and what is ruled


| Item | State |
|---|---|
| Triangles (ruling R14) | **Applied** through `tools/gen_assets.mjs`; nothing built with them. Free now: `chunk_lip_rock` 1 478, `chunk_lip_upper` 1 029, `chunk_lip_mid` 267, `chunk_lip_gate` 1 103, `chunk_st_east` 715, `chunk_st_west` 563, `chunk_st_yard` 776, `chunk_st_works` 183, `env_backdrop_day` 561, `chunk_rim_ledge` 7 626, `rim_town_card` 851, `env_backdrop_dusk` 1 235. `env_plenty_street` is held to the sum of its chunk plans WITH its four drawn nodes (about 570 triangles): the zone as a whole has about 1 670 free |
| The street's instanced dressing | **Not raised**: the street and yard cells stand at 119 840 of 120 000. Stones and scrub go into the chunks (the triangles above) or into the bake; a High-only scatter is render-tech's to draw and does not count against Low |
| Textures | **Unchanged.** Low 55.3 of 64 MiB at the seam stage, High 121.0 of 128. Ask the closer with a number if the ground needs `tx_sand` at 1024 (1.0 MiB) |
| The pursued man (rulings R4, R18) | his place is the layout's (`DOWSER` in `tools/gen_layout.mjs`: bearing 270, elevation 12 degrees, 250 m; the validator's `sightlines` check holds it clear). **Not moved**: give him ground at his depth with the backdrop's 561 triangles. If he must come down, write the elevation you need here: the closer changes it and rebuilds |
| The last image | `nar_fire` and `socket_last_fire` are unchanged; the ending's camera is the world team's (`src/world/ending.ts`): agree the fire's place with it before moving the socket |
| A full rebuild was made after the design data changed | every item is current: `node tools/build-assets.mjs --only env_exterior` rebuilds only what you change |

## Team exterior-look, pass i4 (2026-10-08): what changed, what the closer mirrors, what is asked of others

Working log `scratch/i4-team-exterior-look/NOTES.md`; images `shots/i4-team-exterior-look/` (`before/`, `after/`, work sets).

### 1. Changes (for GDD / ART_BIBLE / ARCHITECTURE)

| # | What | Where | Numbers |
|---|---|---|---|
| 1 | The pursued man stands on a rimrock at his own scale (R4, R18) | `src/world/sightRock.ts` (new), `src/world/director.ts` `presentSightRock` | one unfogged mesh, 1 draw call, about 220 triangles, built with the director (the boot's warm-up compiles it), shown while `plenty_street` is built; measured in his drawn heights and scaled `0.9 x SIGHT_MIN_PX` of a 720-line frame per height about his feet; it stands `SIGHT_ROCK_FRONT` 9 m nearer than his card |
| 2 | High out of doors: ground dust and the sun's glow (R16) | `src/render/post.ts` `SunShaftEffect` (`DUST_*`, `GLOW_*`), `src/render/system.ts` (`post.dustK`, `glowK`, `dustGround`, `dustTime`, `dustCol`), debug `ext.render.dust(on?)` | `DUST_K` 0.036, `DUST_H` 0.9 m, `DUST_FAR` 150 m, `DUST_SUN` 0.7, `DUST_HIDE` 0.6, `DUST_MAX` 0.5, `DUST_DARK` 0.7, `DUST_GULLY` 0.3, `DUST_WIND` 0.5; `GLOW_K` 1.0, `GLOW_FALL` 11, `GLOW_NEAR` 0.3. Same pass, same depth, no new sample, no target. Under the Long Light only (not under the overhang, not at dusk); still under Reduce Motion |
| 3 | High's sun shadow | `src/render/moods.ts` `SHADOW_SUN` | k 0.60 -> 0.64, shade 0.40 -> 0.36, inShade 0.5 -> 0.45, tint (0.018, 0.030, 0.075) |
| 4 | The last fire | `src/render/vfx/vfx.ts` | `FIRE_PX` 38 -> 50; tight glow 60 -> 104 px at 0.50 (0.80); wide glow 150 -> 230 px at 0.19 (0.26); pools 0.36 / 0.75 (0.30 / 0.62); smoke 0.46 (0.36) |
| 5 | The glance off the rim's sand no longer follows each triangle (chevrons) | `src/render/materials.ts` (render-tech's block; that team is not active in this pass) | the glance's ground normal is level but for 15 % of the face's tilt |
| 6 | Art: see `blender/env_exterior/README.md` "What pass i4 changed" | `blender/env_exterior/` | `env_the_lip` 27 777 / 31 000, `env_plenty_street` 48 799 / 49 700, `env_backdrop_dusk` 2 369 / 3 200 |

Measured (1280 x 720, the real game, `scratch/i4-team-exterior-look/diff_after.log`; mean absolute difference of 255 and
share of pixels more than 24 apart, Low against High): gate 6.2 / 0.5 % -> 8.7 / 2.3 %, gate court toward the gate
4.7 / 0.1 -> 13.1 / 11.1, street west 8.9 / 5.2 -> 14.0 / 15.4, yard at the checkpoint 5.1 / 0.2 -> 11.0 / 3.7, yard
door 7.8 / 4.6 -> 14.9 / 20.7, gully mouth 7.0 / 2.5 -> 20.0 / 36.5. **Away from the sun it is still small**: yard
south 5.8 / 0.6 -> 6.2 / 1.5, yard east 6.7 / 0.5 -> 6.3 / 0.6. The overhang and the rim are unchanged (6.1 / 5.4, 7.9 / 5.2).
Budgets in the after sets: Low at most 51 draw calls, 91 669 triangles, 48.9 MiB; High 98, 205 466, 73.9 MiB.

### 2. Tests edited

`tests/art_env_exterior/i3.test.mjs` (the row under his boots is the rimrock; the last frame is level: the fire and the
land's edge stand just under the middle), `tests/world/sighting.test.mjs` (the figure's window ends over his foot line:
the rimrock's shaded beds are as dark as his coat), `tests/render/polish3.test.mjs` (the fire's glow may be 500 px wide of
960, it was 400; its hot body keeps the 48 px cap).

### 3. Asked of others

| To | What |
|---|---|
| creatures-props | **The wagon's wheel** (`prop_wagon_tipped`, visual-b: "a smooth dark shape with no grain or iron tyre"): the prop is yours (`blender/props/dress/`); the fixer raised its budget to 1 500. After any change to it or to `prop_water_cart`, `node tools/build-assets.mjs --only env_exterior` (both are embedded in `env_plenty_street` and shade `lm_surface`) |
| render-tech | (a) a vertex-lit face of a chunk takes the High shadow map whole (its lightmap texel is the neutral one, so `inShade` never applies): the break face of `yd_cover_stub_1`, in the foreground of the sighting, reads flat violet on High. A gate by the face's own vertex light would mend it. (b) High away from the sun is still within 6 of 255 of Low: a High-only scatter of stones and scrub is the cheapest thing left |
| closer | mirror section 1 into ARCHITECTURE 8.4 (High tables) and ART_BIBLE (daylight dust, the last fire's size); `share.jpg` and the hero frames show the old yard and last image; re-run the playthrough (the director adds one mesh; no gameplay value changed) |

## Closer, pass i4 (2026-10-08): decisions

| Row | Decision |
|---|---|
| 1 rows 1 to 6 | Mirrored: ART_BIBLE amendments, ARCHITECTURE "Pass i4 (closer)" 8.4, GDD 23.19 (9.3, 9.8), LEVEL 19 |
| 3 the wagon's wheel | **Not built** (no team took it); known issue |
| 3 render-tech (a) a vertex-lit face under the High shadow map, (b) a High-only scatter | **Not built**; known issue |
| Creatures-props' ask: delete `rim_shelf`'s two boxes | **Left**: they draw nothing a player sees and the rim has 6 600 triangles of plan free |
| The posterised banding in late captures | Looked for by the closer in the final hero frames: see INTEGRATION_REPORT Part R |

## Team exterior-look, pass i5 (2026-10-08): what changed, what the closer mirrors, what is asked of others

Working log `scratch/i5-team-exterior-look/NOTES.md`; images `shots/i5-team-exterior-look/` (`before/`, `after/`, work sets
`f1`..`f3`, `s1`..`s3`, `s1b`..`s1d` = High with the sun map and the dust switched off in turn, `d1`, `w_shelves`, `test/`).
Tools there: `view.mjs`, `end.mjs` (the TRUE last image), `floors.mjs`, `lip.mjs`, `iso.mjs`, `lmprobe.mjs` (what the High
shadow gate reads at a world point), `metric.mjs`, `chunks.mjs`, `collider.mjs`.

### 1. Changes (for GDD / ART_BIBLE / ARCHITECTURE / LEVEL)

| # | What | Where | Numbers |
|---|---|---|---|
| 1 | **The broken wall beside the sighting is brickwork** (both reviewers, major: "untextured, flat-shaded boxes on a plain blue base"). All five ragged cover stubs: a plaster skin over a brick core that stands toothed out of each break, a rake of single bricks (two wythes on `yd_cover_stub_1`), loose bricks on a fan of melted adobe at the foot; every face lightmapped, the bond painted into the lightmap | `blender/env_exterior/ext_frontier.py` (`Isles`, `break_wall`, `rubble_fan`, `rubble_bricks`), `street_parts.stub_wall`, `street_yard.build`, `wall_paint.py` (`brick` kind) | `env_plenty_street` 48 945 / 49 700 (yard chunk 13 164 / 13 400, east 13 261, west 15 601); `lm_surface` 2.02 MB (1.77), 15.56 texels a metre (16.0). Cover extents, colliders and nav unchanged (`openings.test.mjs` passes) |
| 2 | **High: a WALL in baked shade that looks at the sun is no longer shaded twice** (the stub's "flat blue" on High: `shade` 0.36 + `inShade` 0.45 = 52 % of the way to the shadow's dark blue on every sun-facing face in a building's shade; a face turned from the sun took 23 %). `inShade` is the ground's now: a wall takes 0.27 of it (30 % in all), and up-facing ground always counts as facing the light (a drift's lee slope in a building's shade took no shadow and lay there as a paler patch) | `src/render/system.ts` `SHADOW_WALL_IN_SHADE` 0.27 and two lines of `keepShadowGate` (the face's own normal: `fn.y` 0.35 .. 0.75 for the share, 0.80 .. 0.93 for the ground). `moods.ts` `SHADOW_SUN` is unchanged (0.12 for everything was tried: the street's cast shadows went from 19 % of the frame to 0.3 %, `tests/render/i2.test.mjs`) | `tests/render/i2.test.mjs`: fixed casters darken 18.2 % of the town frame (19.4), the whole pass 29.0 % (29.5). Low against High (`tiers.test.mjs`, final tree): gate 10.3, street 13.4, yard door 15.2, yard vista 12.6, last view 7.3 (pass i4: 10.7, 14.7, 16.6, 13.3, 7.3: the walls in shade are a little nearer Low's, by design) |
| 3 | **High: no dark ring round a patch of loose sand** ("an outlined circle patch on the sand" in the sighting's frame). The shadow twins were pulled toward the eye by a slope-scaled polygon offset: at a grazing angle the ground sheet's twin came through a drift lying a finger over it and its toe was shaded twice | `src/render/system.ts` `makeShadowMaterial`: `polygonOffsetFactor` -1 -> **0**, `polygonOffsetUnits` -1 -> **-4** | `shots/i5-team-exterior-look/s1b/iso_sheet.png` (rings with the map on, none with it off), `s1d/iso_all.png` (map on, no rings) |
| 4 | **The last image's foreground is benched rimrock** (both reviewers, major: "a smooth low-detail pink mound with a pale lavender streak"). The mesa's foot under the ledge: level beds with lit lips, risers where they turn into the wash, the wash a stepped floor of sand that runs on over the plain toward the fire; the apron reaches the plain 60 m out (78) | `blender/env_exterior/env_backdrop_dusk.py` (`build_foot`, `foot_h`), `rim_town_card.py` (the dead pylon stands on its bench: `y0_` 3.2 -> 2.0) | `env_backdrop_dusk` 2 857 / 3 200; in the ending's own view the lower 30 % averages 29 to 31 of 255 with 2.5 to 3.2 % of it over 60 (it was 50 and 35 %); the rock fills the bottom 20 % of the frame (it was 28 %) |
| 5 | **The overhang's dust is dust** ("a tight cluster of hard white dots against the gully wall"): out of doors a mote of the sun blades is 2.2 times the size, soft-edged, the sand's warm hue at 0.28 of the level, in a shaft 0.95 m in radius, gone by 8 m | `src/render/vfx/ambient.ts` (`OUT_SIZE`, `OUT_ALPHA`, `OUT_SPREAD`, `OUT_FAR`; `uGround.w`), `src/render/system.ts` (one line: `ambient.ground.value.w` is 1 in `the_lip`) | hard bright pixels in the left half of the reviewer's frame: 201 and 341 -> 1 and 6. **Both tiers** (Low draws 120 of these motes): the first image's motes are softer. The Tally House's blades are unchanged (`w` 0) |
| 6 | **The floors** (minor): wind-laid sheets painted into the lightmap, stronger pans and wall feet | `blender/env_exterior/ground_paint.py` (`sheets`, `breakup`, `paint_lip`, `paint_street`, `paint_yard`) | no triangle; see section 2 |

### 2. Not done, honestly

- **The gully's and the street's floors got value structure, not things.** No rock shelf, brush or half-buried board was
  added: a second run of longer bedrock shelves was built and withdrawn (a 3 m plate is one flat vertex-lit facet: a
  pale board on the sand, `shots/i5-team-exterior-look/w_shelves/`). The painted sheets are subtle in the gully's shade.
- **The last fire is the size it was** (`FIRE_PX` 50). Reviewer visual-a asked for 1.5 times; `tests/render/polish3.test.mjs`
  holds its hot body under 48 rows of 540 (58 failed it in pass i4) and pass i2's reviewers asked for a small far fire.
  With the foreground dark the fire and the lamps carry the frame; a larger flame is a lead's call.
- **The lit windows** ("six or seven are visible while the card says nine") were not touched: the town's west end is cut
  by the frame's left edge at 16:9, as in pass i2.
- Close up (under a metre) a brick's joints are soft: the stub's charts have 40 to 47 texels a metre.
- A vertex-lit thing in a building's shade still takes High's sun shadow whole (the bushes, the boards on the sand, the
  street's older rubble): only the stubs were moved into the lightmap.
- The polygon offset of the shadow twins was looked at on SwiftShader only (the street, the yard, the gully: shadows
  drawn, no stripes). On a real GPU a constant offset of 4 units is the usual decal setting; if a twin ever z-fights
  its own mesh there, raise the units, not the factor.
- Not run by me: the whole-stage playthrough and the e2e suite. No collider, nav, trigger or gameplay value changed
  (`collider_terrain` is byte-identical); the director's sighting is computed from collision, not from drawn geometry.

### 3. Asked of others

| To | What |
|---|---|
| closer (docs) | Mirror section 1: **ART_BIBLE** (7.2: a cover stub's break is brickwork, plaster over a toothed core, all lightmapped; the coda: the foot under the rim is benched rimrock with lit lips and a stepped wash; High: a wall in baked shade takes 0.27 of `inShade`, the ground all of it; the overhang's motes out of doors), **ARCHITECTURE** 8.4 (the shadow twins' constant polygon offset, `SHADOW_WALL_IN_SHADE`, the ground rule of the face gate; `uGround.w`), **LEVEL** (the stubs' drawn bricks reach up to 0.18 m past the cover solid's end, no collider; the apron under the rim), **KNOWN_ISSUES** (section 2; R.7's "the dune in the foreground is a smooth unlit shape" is gone) |
| closer (assets) | Rebuilt at full quality by me: `lm_surface`, `env_plenty_street`, `env_the_lip` (one run, the atlas is shared: `--only lm_surface,env_plenty_street,env_the_lip --force`), `env_backdrop_dusk`, `rim_town_card`. The zones embed the props as they stood when I built (11:50): **rebuild the zones last if a prop team's asset changed after that.** `src/ui/loadMeter.ts` `BOOT_FILE_BYTES` moves by about +0.27 MB (`lm_surface`, the street). The hero frames `hero_05` (the sighting) and `hero_12` (the last image) and `public/share.jpg`'s source frame show the old stub and the old foreground |
| render-tech (seen, edited by me in shared files; that team is not active in the look pass) | `src/render/system.ts`: the shadow twin's polygon offset (one line and its comment in `makeShadowMaterial`), `SHADOW_WALL_IN_SHADE` and four lines of the twin's `keepShadowGate`, one line where the ambient points are set (`ground.value.w`); `src/render/vfx/ambient.ts`: the `OUT_*` constants and four places in the motes branch of the two shaders. Nothing reordered |
| world team | nothing changed in `src/world`. `tests/world/i5.test.mjs` re-run after the stub's rebuild (it reads collision; see the report) |
| reviewers | the true last image is `scratch/i5-team-exterior-look/end.mjs <set> <tier> take|leave` (the game eases the view itself); `shots/i5-team-exterior-look/after/high_end_take_nogun.png`, `high_end_take_card.png`, `high_end_leave_gun.png` |

Tests on the final tree (one after another): `node --test tests/render/` **86 of 86**; `node --test tests/art_env_exterior/`
**33 of 33** (the 29 and the 4 of the new `i5.test.mjs`: the yard stubs end in toothed brickwork at six depths or more; the
foot is benched; the last image's lower 30 % is dark with hard edges on both tiers; the overhang's motes are not a rash
of white dots); `tests/world/i5.test.mjs`, `i5_real.test.mjs`, `sighting.test.mjs` **6 of 6**; `npx vitest run tests/render
tests/world` 98 pass; `npx tsc --noEmit` clean; `node tools/check-glb.mjs` 84 assets, 21 textures, 11.68 MB: all pass;
`npm run validate` pass. Not run by me: `tests/e2e`, the whole of `tests/world` and `tests/ui` (its loading-bytes figure moves).

## Closer, pass i5 (2026-10-08): decisions

| Row | Decision |
|---|---|
| Section 3, closer (docs) | **Mirrored**: ART_BIBLE "Amendments, pass i5 (closer)", ARCHITECTURE "Pass i5 (closer)" 8.4, LEVEL 20, GDD 23.20; `docs/KNOWN_ISSUES.md` rewritten |
| Section 3, closer (assets) | **Done**: full rebuild with `--force` (zones embed the final props and re-bake); `BOOT_FILE_BYTES` refreshed; `hero_05`, `hero_12` and `public/share.jpg` retaken (Part S) |
| The last fire at 1.5 times; things rather than paint on the floors | **Declined, upheld**: the test's cap and pass i2's "small far fire" stand; the street cells have no triangles left for lightmapped shelves. Both in `docs/KNOWN_ISSUES.md` |
| The lit windows cut by the frame at 16:9; vertex-lit things under High's sun shadow; the polygon offset on a real GPU | **Not built / not verifiable here**: in `docs/KNOWN_ISSUES.md` |

## Team exterior-look, pass i6 (2026-10-08): what changed, what the closer mirrors, what is asked of others

Working log `scratch/i6-team-exterior-look/NOTES.md`; images `shots/i6-team-exterior-look/` (`before/`, `after/`, work sets
`c1`..`c3` the last image's land, `m1`, `m2`, `k1`..`k3` the rim on High, `g1`, `g2` the Lip on High, `p0`..`p2` the pylon,
`s0`, `s1` the stubs and floors, `e1` the sighting, `t1` the dust and the dusk's shafts switched off in turn). Tools there:
`cap.mjs`, `view.mjs`, `end.mjs` (the TRUE last image), `sight.mjs`, `diff.mjs`, `toggle.mjs`, `chunks.mjs`.

### 1. Changes (for GDD / ART_BIBLE / ARCHITECTURE / LEVEL)

| # | What | Where | Numbers |
|---|---|---|---|
| 1 | **High on the rim: mist on the plain** (R16, a major: "almost pixel-identical to Low"). The Long Light's ground-dust term with its own shape in the blue hour: it lies on the plain under the ledge, 3 m deep, pools round the town, the pylon line and the near swells, thins to a fifth between 180 and 320 m (the last fire's horizon stays clear, R5) | `src/render/moods.ts` `DUSK_MIST` / `MistSpec`; `src/render/post.ts` `uShAir` / `PostChain.dustAir` (the layer's height, reach and far fade are a uniform; by day `DUST_H`, `DUST_FAR`, 160, 230: the same picture); `src/render/system.ts` (the dust block) | `k` 0.0062, `h` 3.0, `ground` -0.6, `far` 520, `fade` 180 .. 320, `col` 0.35 / 0.29 / 0.47 (display). Same pass, same depth, no sample, no target |
| 2 | **High on the rim: dust on the evening wind, lamp light in the air, the afterglow along the sand** | `moods.ts` `AIR_DUST` L6 / L6c 0.7 (none), `AIR` L6 1.8 (0.8), `AIR_CONE` L6 6 (none), `AIR_GLOW` L6 22 (18), `GLANCE` L6 / L6c 3.2 (2.1); `src/render/vfx/ambient.ts` `DUSK_DRIFT` 0.22 m/s, `DUSK_SIZE` 1.5, `DUSK_COL` (the 'air' motes take them while `uGround.z` is 1); `system.ts` sets `ground.z` in the 'air' branch | 400 points, the one ambient draw call. Tried and withdrawn: `SHAFT_DUSK` 1.0 (the mesa behind the fire was lifted), `AIR_GLOW` 26 (the panes lost their shape), mist `k` 0.0075 and a far fade of 650 .. 1 000 m (the last image lost its dark third; a third of the flame) |
| 3 | **High under the overhang and in the gully** (R16) | `post.ts` `DUST_ROOF` 0.8 (new: the ground-dust layer is drawn from under the roof: nothing on the near rock, a warm band along the gully's foot beyond the mouth), `DUST_GULLY` 0.55 (0.3); `src/render/vfx/vfx.ts` the gully's three shafts 2.2 m wide at 0.21 (1.7 at 0.15) | see section 2 |
| 4 | **The pursued man stands on a mesa's rim** (R18: "a giant on a nearby boulder") | `src/world/sightRock.ts`: `TOP` is a level caprock thirteen of his heights long (it was a knob 0.9 heights across with steps half his height), cliffs at both ends out of the gap's sight, low steps and one notch; the face under the cap in level beds (`STRATA`, `STRATA_TONE`); `HAZE_K` 0.13 (0.07) | about 600 triangles (250), one draw call. He stands on the rim's one proud slab, a twelfth of his height over the caprock beside it (rock level with his feet beside him was counted as part of him by `tests/world/sighting.test.mjs` when the view is turned off him). Nothing in `director.ts` changed: his size, the rule of the clean line and the rock's place are the world team's |
| 5 | Art: see `blender/env_exterior/README.md` "What pass i6 changed" (the pylon, the stubs' rake and bond, the yard's walls, the floors' drifts and door scuffs, the last image's lips, swells, wash and scrub) | `blender/env_exterior/` | `env_the_lip` 28 289 / 31 000 (gate chunk 6 891 / 7 300), `env_plenty_street` 49 017 / 49 700 (yard chunk 13 144 / 13 400), `env_backdrop_dusk` 3 069 / 3 200, `lm_surface` 1.97 MB at 14.58 texels a metre (15.56) |

### 2. Measured (1280 x 720, the real game; mean absolute difference of 255 and share of pixels more than 24 apart, Low against High, `diff.mjs`)

| Frame | Before | After |
|---|---|---|
| under the overhang, the start (`lip_start`) | 6.0 / 5.3 % | 13.9 / 18.9 % |
| the mouth, a pace out (`lip_mouth`, `lip_out`) | 8.4 / 5.8, 8.4 / 7.0 | 13.8 / 17.5, 14.9 / 19.1 |
| the gully's reaches (`lip_gully_a`, `_b`, `_c`) | 8.1 / 3.6, 8.4 / 2.3, 10.1 / 5.3 | 10.3 / 5.7, 11.2 / 4.1, 13.5 / 11.6 |
| the rim, the cage looking out (`cage_n`), the gate (`door_out`) | 6.4 / 5.4, 12.4 / 12.3 | 8.5 / 10.0, 16.8 / 27.1 |
| the last view (`last`), the TRUE last image (`end.mjs`, no gun) | 7.9 / 5.1, 6.6 / 5.5 | 13.1 / 12.2, 11.5 / 10.7 |

`tests/art_env_exterior/tiers.test.mjs` (view-model hidden): gate 10.2, street 13.2, yard door 14.8, yard vista 12.6, **rim last
11.4 (7.3)**. Budgets in the after sets: Low at most 55 draw calls, 96 thousand triangles, 48.9 MiB (the rim 15 / 28 580 /
29.6); High 98 / 206 thousand / 73.9 (the rim 27 / 28 580 / 54.6).

### 3. Not done, honestly

- **Inside the cage, facing its own walls, High is Low** (1.3 to 4.0 of 255). The cage is a dark enamel prop under the
  blue hour's dynamic light; what High adds there is the motes and the call lamp's glow. The reviewers' `A_cp_rim` averages
  four headings from inside it.
- **No shadow map in the blue hour** (the reviewer asked for "the sun shadow map under the cage, stone and rocks"). The
  rim's lightmap already holds the afterglow's soft shade under the stone and the rocks; a map from a light 6 degrees up
  would lay a second, hard one over it. Not built, not tried.
- **Down the gully the share of plainly different pixels is still under a tenth in two of three reaches** (5.7 %, 4.1 %):
  the mean is over 10 of 255 and the far reaches are plainly hazier, but the near rock walls are the bake's on both
  tiers (the shadow map's fixed casters are off in the Lip: its bake is not the sun's alone).
- **No "sun shadow edge from the overhang's lip on the sand"**: the roof's shade is the bake's.
- **High's last fire is softer than Low's** (it was before this pass: the halo and the bloom): the mist is thinned to a
  fifth on its horizon, but the flame on High is still a soft small light where Low's is a crisp one
  (`shots/i6-team-exterior-look/after/fire_crops.png`: before above, after below; Low left, High right).
- The stubs' joints are soft under a metre (the painted course is 6 texels); the rake is irregular but still made of
  whole 0.19 m teeth (halving the built course would need about 900 triangles the yard chunk does not have).
- The yard's walls got paint, not relief: they already had a buttress every 6 m; `chunk_st_yard` has 256 triangles free.
- `STREET_DOORS` are eyeballed sills, not read from the buildings: a scuff may sit a pace off a door.
- The sighting's rimrock is plain from the yard's west side where no man shows (a long level bar over the wall).
- Not run by me: `tests/e2e` (the playthrough's hash should not move: nothing hashed changed), `tests/ui`.

### 4. Asked of others

| To | What |
|---|---|
| closer (docs) | Mirror section 1: **ART_BIBLE** (the blue hour on High: mist on the plain, dust on the wind, `GLANCE` 3.2; the overhang's and the gully's air; the pylon; the stub's bond 0.26 x 0.095 m; the last image's lips are a soft band, the plain's swells, wash and scrub; the sighting's mesa rim), **ARCHITECTURE** 8.4 (`DUSK_MIST`, `PostChain.dustAir` / `uShAir`, `DUST_ROOF`, `DUST_GULLY` 0.55, the 'air' motes' dusk branch and `uGround.z`, `AIR` / `AIR_CONE` / `AIR_GLOW` / `AIR_DUST` L6 rows), **LEVEL** (the sighting row: a mesa rim, not a knob; `sightRock` about 600 triangles), **KNOWN_ISSUES** (section 3; "the gate pylon" and "things rather than paint on the floors" rows) |
| closer (assets) | Built at full quality by me: `lm_surface`, `env_plenty_street`, `env_the_lip` (one run), `env_backdrop_dusk`. **Rebuild the two surface zones and `lm_surface` last if a prop team's asset changed after 17:20** (the zones embed the props and shade the lightmap). `src/ui/loadMeter.ts` `BOOT_FILE_BYTES` moves (`lm_surface` 2.02 -> 1.97 MB, the Lip + 5 kB). Hero frames `hero_01`, `hero_02`, `hero_05`, `hero_12` and `public/share.jpg`'s source show the old picture |
| render-tech (not active; edited by me in shared files) | `post.ts`: the `SHAFT_FRAGMENT` dust block reads `uShAir` where it had `DUST_H`, `DUST_FAR`, 160 and 230; `DustUniforms.air`, `PostChain.dustAir`, `DUST_ROOF`, `DUST_GULLY`. `system.ts`: the dust block (about ten lines) and one line in the ambient 'air' branch. `vfx/ambient.ts`: the 'air' branch's dusk terms. `vfx/vfx.ts`: one line (the gully shafts' width and level). `moods.ts`: `DUSK_MIST`, and my rows of `AIR`, `AIR_CONE`, `AIR_GLOW`, `AIR_DUST`, `GLANCE`. Nothing reordered |
| underground-look | `AIR_DUST`, `AIR` and `AIR_CONE` are your tables: I added only the `L6` / `L6c` entries. `ambient.ts` 'air' is unchanged while `uGround.z` is 0 (the system sets it to 0 in every mood but the blue hour) |
| world | `src/world/sightRock.ts` only (the outline, the beds, the haze); `director.ts` untouched |

Tests on the final tree (one after another): `node --test tests/art_env_exterior/` **38 of 38** (the 33 and the 5 of the new
`i6.test.mjs`: the pylon carries its bands and cables up its height; the lips are bands; High is not Low in the last view and
under the overhang, with the dark kept; level rock runs three heights to either side of the pursued man's feet);
`node --test tests/render/` **86 of 86** (812 s); `tests/world/` `sighting`, `i4`, `i4_real`, `i5`, `i5_real`, `i6`, `i6_real`
**27 of 27** (the sighting test failed twice on the way: 63 and 45 px "wide", the rim beside his feet; the proud slab mended
it: 26 x 55 px); `npx vitest run tests/render tests/world` 98 pass; `npx tsc --noEmit` clean; `node tools/check-glb.mjs` 84
assets, 21 textures, 11.74 MB: all pass; `npm run validate` pass. Not run by me: `tests/e2e`, the whole of `tests/world`, `tests/ui`.

## Closer, pass i6 (2026-10-08): decisions

| Row | Decision |
|---|---|
| Section 4, closer (docs) | **Mirrored**: ART_BIBLE "Amendments, pass i6 (closer)", ARCHITECTURE "Pass i6 (closer)" 8.4, LEVEL 21, GDD 23.21; `docs/KNOWN_ISSUES.md` rewritten |
| Section 4, closer (assets) | **Done**: every asset rebuilt with `--force` in one run (the zones embed the final props); `BOOT_FILE_BYTES` refreshed; hero frames and `public/share.jpg` retaken (Part T) |
| Section 3 (the cage, no dusk shadow map, the gully's near walls, the softer fire on High, the stubs, the scuffs, the plain bar) | **Not built**: in `docs/KNOWN_ISSUES.md`. The last fire on High was looked at in the true last image (Part T) |
