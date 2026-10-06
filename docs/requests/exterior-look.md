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
