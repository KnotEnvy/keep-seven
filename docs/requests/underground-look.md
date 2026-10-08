# Requests and decisions: look team "underground-look", polish round 4

Log: `scratch/r4-team-underground-look/NOTES.md`. Frames: `shots/r4-team-underground-look/before/` and `after/`
(1280 x 720, the real game, Low and High; `sheet_<tier>_<set>.png` are the contact sheets).

## 1. What changed, for the closer to mirror into the documents

| # | Where | Before | After | Document to mirror |
|---|---|---|---|---|
| 1 | High tier bloom (`src/render/moods.ts` `M_BLOOM_T / M_BLOOM_K / M_BLOOM_S`, `post.ts`, `system.ts`) | one threshold everywhere: 1.15 of display white, intensity 0.9, knee 0.15 of scene light | a threshold, knee and intensity per mood (display levels): L0 0.42 / 0.35 / 1.0; L1 0.55 / 0.35 / 0.9; L3 and L4 0.55 / 0.40 / 1.0; L6 0.25 / 0.40 / 1.0; L2, L5, L5a, L5c, L5p unchanged (1.15 / pass knee / 0.9). `MOOD_SIZE` 66 -> 69. An identity override (`ext.render.override({identity:true})`) uses the plain 1.15 | ARCHITECTURE 8.2 (post chain per tier), ART_BIBLE 11.1 (mood table: three High-only columns), GDD where it says "bloom on emissives only" |
| 2 | High tier contact shade (`post.ts` `ContactShadeEffect`, constants `AO_RADIUS 0.55 m`, `AO_INTENSITY 10`, `AO_FAR 45 m`, `AO_TAPS 16`, `AO_FLOOR 0.45`) | none ("optional AO" of CLAUDE.md's High column was not built) | one term at the head of the merged pass, from the scene's own depth: no extra pass, no extra target, no second scene draw. 20 depth reads a pixel. Full-screen draws on High stay 12 | ARCHITECTURE 8.2 and 8.4 (targets: the composer's input buffer carries a 24-bit depth TEXTURE instead of a depth renderbuffer on High; same 4 bytes a pixel) |
| 3 | View-model pass on High (`system.ts render()`) | `clearDepth()` then the view-model | on High only: the world's depth is kept and the view-model is drawn with `gl.depthRange(0, VM_DEPTH_RANGE = 0.05)`, then the range is restored. Low and min are unchanged (`clearDepth`) | ARCHITECTURE 8.1 (the view-model's second pass) |
| 4 | `env_the_bore` bake | sector 256 / 192 samples, bore layer 64, adaptive sampling on | adaptive sampling off for the whole bake; sector 1024 / 512; bore layer on the sector 1024; the islands of the ribs (`rib_*`) and the kerb smoothed inside their own outline (gaussian 2.6 texels, about 0.15 m), bake margin regrown. Build 270 to 320 s (it was 211 s) | ART_BIBLE checklist 28 (nothing to change; now met), blender/env_interior notes |
| 5 | `env_the_bore` arrival bay and catwalk | bay lamp target 0.7, reach 8 m; catwalk work lamps 0.45 on the back panel | bay lamp 0.42, reach 5.5 m; the bay's three closed walls and ceiling (`arrival_well`) keep 0.35 of their baked light; catwalk lamps 0.20 | LEVEL / ART_BIBLE 3.6 if they quote the bay's levels |
| 6 | `env_lift_hall` cage well | work lamp 0.65 on the floor, wash 0.62 on the lever's wall (reach 9 m) | 0.42 / 0.30 (reach 5.5 m), and the well's lining (`cage_bay`, `cage_dado`, `cage_band`, vertex-lit) falls to 0.10 of its baked light 2.4 m from the lever | as above |
| 7 | `env_lift_shaft` | wash x0.95, 22 % of it on the far wall, falling over 3.4 m | wash x0.80, 6 % on the far wall, gone 2 m round the shaft from the lamp channel; a plan vertex every metre (654 -> 774 triangles of 800) | none |

## 2. Requests to other owners

| # | To | Request | Why |
|---|---|---|---|
| 1 | props (owner of `ia_lift_cage`) | Halve the lattice's cell count and thicken its bars (or drop the lattice below the handrail to a solid kick panel), and give the cage's floor slab a baked pool under its gate lamp (vertex colour: a pale centre falling to the navy at the walls) | The critic's "wall of bright mesh squares" is two things: what is seen through the lattice (mine, darkened in rows 5 to 7) and the lattice's own frequency, about 26 cells across the frame at 3 m (art bible anti-rule 2). The cage's floor is a dynamic prop under the mood's flat light: nothing in the zone bake can put a pool on it |
| 2 | world | On arrival at the bore, leave the player facing the hatchway (+x, toward `vista_windlass`) when the gate opens, or hold the "Windlass seen" beat until she stands on the catwalk at about (14, -36, 83) looking at (14, -40, 94) | `story_windlass_seen` fires inside the cage while she looks at the bay's corner (shots/r4-visual/tour/low_d_10_story_windlass_seen.png): the frame contains none of the Windlass. The view from the catwalk's middle is the frame the beat is named for (`after/low_bore_vista.png`) |
| 3 | gun look team / render | `tests/render/polish3.test.mjs` "R6: the revolver is lit by its own rig" fails at `ante` (view-model L* 29.0 against 42.5 behind it; the limit is 9 under). The antechamber's frame did not change in this pass (L* p50 22.8 -> 23.0 in `before/` and `after/low_A_cp_bore_ante.png`); the gun's pose and model did, during this round | Not caused by this team; the test was being edited by the gun team while this pass ran |
| 4 | closer | `tests/core/budget.test.mjs` and ARCHITECTURE 8.4: High's render-target bytes are unchanged by the contact shade (a depth texture in place of the depth renderbuffer). If the closer wants a switch for it, `post.aoK.value.w = 0` turns it off at run time and `= 2` shows the shade alone | |

## 3. Known gaps

- The contact shade has no blur: it is turned per pixel by an interleaved gradient and capped at 4.5 % of the frame's
  height, so its edge is a fine stipple of about the grain's size. On a real GPU at 1080p it should be judged by eye once.
- Low is untouched by rows 1 to 3; rows 4 to 7 are baked and show on every tier.
- Frames where High is still within 1.5 of 255 of Low: a plain wall at 1.5 m (0.7), `vista_tamper` (0.8),
  `bore_vista` from the catwalk (1.4), `cp_hall_gantry` (1.4).

## Closer, polish round 4 (2026-10-05): decisions

| Row | What | Decision |
|---|---|---|
| 1 | documents | mirrored: ARCHITECTURE 8.1, 8.2, 8.4; ART_BIBLE round-4 amendments (11.1 columns, underground) |
| 2.1 | `ia_lift_cage` lattice and floor | **Open for round 5** (props) |
| 2.2 | the "Windlass seen" beat facing the bay's corner | **Open for round 5** (world) |
| 2.3 | R6 at `ante` | the gun team's bound (gun row 1.9) is accepted; `tests/render` green at the close |
| 2.4 | budget | High's targets re-measured at the close: Part H.4 |

# Look team "underground-look", polish round 5 (2026-10-06)

Log: `scratch/r5-team-underground-look/NOTES.md`. Frames: `shots/r5-team-underground-look/before/` and `after/`
(1280 x 720, the real game, Low and High; `after/pairs_issues.png` = before left / after right for the three issues,
`after/pairs_lowhigh.png` = Low left / High right, `after/sheet_seventh_high.png` = the seventh shot on High).

## 1. What changed, for the closer to mirror into the documents

| # | Where | Before | After | Document to mirror |
|---|---|---|---|---|
| 1 | High: a dense lamp set (`src/render/materials.ts` `LampInfo.dense`, `DENSE_LAMPS` 8, `MaterialFactory.denseHold`; `system.ts` `DENSE_OVER` 1.08, `DENSE_MIN` 0.92, `DENSE_LUMA` 0.95) | every emissive thing is drawn `EMISSIVE_HDR` (x 2) over white on High: the Windlass's gauge (26 segments 5 cm apart) bloomed into one solid white bar | a lamp set of more than 8 lamps whose nearest neighbour stands within its own size (only `gauge` in the stage: checked in every resident set, `scratch/r5-team-underground-look/dense.mjs`) is drawn at 1.08 x the mood's bloom threshold (never under 0.92 of display white): white pips, a thin glow, dark gaps. Low and min: unchanged (`denseHold` 1) | ARCHITECTURE 8.2 (the High tier's emissive rule), ART_BIBLE 11.1 |
| 2 | High: the station's sheen (`shared.ts` `uSheen` in the block's free slot `uK[15].w`; `materials.ts` `WORLD_LIGHT`; `moods.ts` `SHEEN`: L3 2.2, L4 2.2, L5 2.2, L5c 1.2, L5p 2.2; eased over 0.6 s in `system.ts`) | none | a lightmapped face mirrors a share of its own baked light at a grazing angle ((1 - N.V)^2; floors in full, walls 0.15, ceilings none; none where the face already draws near white). One uniform, no define, no new program, no texture read: 0 on Low and min, where the branch is skipped | ARCHITECTURE 8.1 (world shader), ART_BIBLE 11.1 (a High-only column) |
| 3 | High: bloom by mood (`moods.ts`) | L4 0.55 / 0.40 / 1.0; L5, L5a, L5c, L5p the plain 1.15 / pass knee / 0.9 | L4 **0.68** / 0.40 / 1.0 (the ring's lit surround bloomed into a flat sheet); L5 **0.80 / 0.45 / 0.9**; L5p **0.75 / 0.45 / 1.0**; L5c **0.48 / 0.45 / 1.0**; L5a **0.75 / 0.40 / 0.9** | ART_BIBLE 11.1 (the three High-only columns of round 4) |
| 4 | High: contact shade (`post.ts`) | 16 taps summed | the strongest tap of the sixteen is left out (what one tap finds is the stipple: a stake, a bezel's rim), and a surface in a lamp's own pool loses up to `AO_LIT` 0.7 of the shade between display levels 0.30 and 0.85 (`uAoExposure`). `AO_INTENSITY` stays 10 | ARCHITECTURE 8.2 |
| 5 | High: sun shadow reach (`system.ts` `SHADOW_HALF`) | 18 m (a 36 m square) | 26 m (52 m; 5 cm a texel; same map, same cost) | ARCHITECTURE 8.4 if it quotes the square |
| 6 | `env_the_bore` ribs (`blender/env_interior/env_the_bore.py` `_course_rows`) | each rib side was one UV island 13 m tall, so the 1.2 m panel row was stretched eleven times: its fasteners drew as pairs of dark 0.6 m "claw" streaks beside every seam | the row once per course (0.3 to 1.2 m): fasteners are dots, every course has its joint. The lining's facets (`wall_*`) joined the ribs and the kerb in the lightmap's smoothing (gaussian 2.6 texels inside the island) | none (ART_BIBLE checklist 28 holds) |
| 7 | `env_lift_hall` ring (`env_lift_hall.py`) | `RING_T` 1.5; `ring_front` one island (the panel row stretched over 9 m); `ring_reveal` white enamel; the ring's own bake pass 256 samples | `RING_T` **1.0**; `ring_front` mapped ROUND the ring (15 panels of 1.2 m: a joint each, fasteners, an arris on both edges); `ring_reveal` the stained glaze (`mix(enamel_stain, steel, 0.25)`); 1024 samples. The patch over the gate from `cp_hall_clear` went from sRGB 122,210,191 to 101,176,160 before the reveal's change | LEVEL / ART_BIBLE 3.5 if they quote the ring's level (1.5) |

Budgets after (Low, `KEEP7_REAL=all node --test tests/core/budget.test.mjs`): worst cell 54 draw calls, 85 920 triangles,
46.8 MiB; assets `env_the_bore` 31 679 / 40 000 triangles, 10 / 10 calls, 663 kB; `env_lift_hall` 24 266 / 36 000, 4 / 4,
431 kB; `lm_hall` 403 kB, `lm_bore` 346 kB. High over the 38 static frames: at most 82 draw calls, 72.0 MiB.

Low against High after (mean absolute difference of 255, 320 x 180, same-time captures, the view-model in both):
gallery 2.3 -> 7.1, gallery bay 1.6 -> 6.0, the file's end 2.1 -> 4.3, hall checkpoint 4.1 -> 6.9, gantry 1.45 -> 3.1
(5.8 world-only with the sheen settled: `tests/render/polish5_high.test.mjs`), boss room 4.5 -> 4.9 (the 4.5 was the
gauge's bar), `vista_tamper` 0.8 -> 1.4.

## 2. Requests to other owners

| # | To | Request | Why |
|---|---|---|---|
| 1 | gun look team | `tests/render/moods.spec.ts` "every mood carries a rig for the view-model" fails on the shared tree: L5a `vmK` 1.5 gives a key of 0.825 against the test's 0.7975 | seen at 12:48 while this team ran its tests; not this team's entry |
| 2 | exterior-look / closer | the High-only wishes of the visual critic that lie outdoors (a glow round the rim fire and the lit windows, shafts at the overhang's mouth) were not touched here: L0 and L6 bloom are as round 4 left them, and the exterior team was changing the rim in this round | scope and risk to the first and last image |
| 3 | props (`ia_lift_cage`) | round 4's row 2.1 stands: the lattice's frequency and the cage's flat floor | not touched |

## 3. Known gaps

- From the catwalk (`vista_windlass`, `bore_vista`) High is still within about 1 of 255 of Low: the frame is dark and
  seen from above, so neither the sheen nor the bloom has much to act on.
- The Tally House (L2) has no High-only term but its bloom and three blade cards: 1.5 to 2.4 of 255.
- The sheen is a mirror of a face's OWN baked light, not of the lamps: it reads as satin plate, not as reflections.
- The contact shade was judged at 4 x zoom on a pillar plate and a wall lamp (`wip4/crop_plate.png`); a stuck stake in
  a live fight was not re-captured. Nothing of the High tier has been seen on a real GPU.
- `tests/e2e` was not run by this team (render-only and bake-only changes; no collider, node or clip changed).

## Closer, polish round 5 (2026-10-06): decisions

| Row | Decision |
|---|---|
| 1.1 to 1.7 | **Mirrored**: ARCHITECTURE 8.1 (`uSheen`), 8.2 (dense lamps, contact shade), 8.4 (shadow square); ART_BIBLE round-5 amendments ("Underground", "11.1 High only"); LEVEL 12 (ring 1.0); GDD 23.10 |
| 2.2 (outdoor High wishes) | **Not done by anyone** this round; known gap |
| 2.3 (`ia_lift_cage`) | **Not changed**; known gap |
| e2e and budgets not run by the team | run at the close (INTEGRATION_REPORT J.1, J.4) |

## Fixer, release pass p0 (2026-10-07): decisions

| Row | Decision |
|---|---|
| budgets (ruling R14) | **Changed, read this**: to pay for the view-model the chunk plans were cut toward the built meshes: `chunk_gl_stair` 6 000 -> **4 000** (built 2 836), `chunk_gl_bay` 6 000 -> **4 000** (2 818), `chunk_gl_gallery` 20 000 -> **18 000** (15 500), `chunk_lh_hall` 36 000 -> **30 000** (24 252). Unchanged: `chunk_ty_hall` 17 000 (16 073), `chunk_bo_ante` 8 000 (3 377), `chunk_bo_chamber` 32 000 (27 906): the boss room keeps its whole plan. `cell_gallery` stands at 118 700 of 120 000 |

# Look team "underground-look", release pass p0 (2026-10-07)

Log: `scratch/p0-team-underground-look/NOTES.md`. Frames: `shots/p0-team-underground-look/before/` and `after/`
(1280 x 720, the real game, Low and High; `after/pairs_issue.png` = before left / after right; `ao3/crop_ammo.png` = the
dispenser's shade at 2 x, before left / after right).

## 1. What changed, for the closer to mirror into the documents

| # | Where | Before | After | Document to mirror |
|---|---|---|---|---|
| 1 | `env_the_bore` antechamber, the station plate (`env_the_bore.py` `PLATE_T`) | white enamel, 2.5 m from the fire: over display white, and on High the bloom took the numeral "4" | the stained glaze (`mix(enamel_stain, concrete, 0.30)`); the numeral reads on Low and High | none |
| 2 | `env_the_bore` embers (`EMBER_T`, `EMBER_R`, `EMBER_H`, `EMBER_FAR`) | light 0.25 m over the floor, pool 1.3 at 1.5 m, reach 6.5 m, bounce 0.24 on the door wall: about 3 on the wall behind the fire and 6 at the fire's edge, in a lightmap that stores 2: a clipped mustard wall ("yellow-green glow") | light 0.8 m over the fire, pool **0.8** at 1.5 m, reach **5.5 m**, bounce **0.17**: about 1.9 at the fire's edge, about 1.4 on the wall, nothing clips; the far half of the room is the cool fill | ART_BIBLE 3.6 / round-3 amendment if it quotes 1.3 / 6.5 m / 0.24 |
| 3 | `env_the_bore` antechamber frame (`build_ante`, `AN_BAYS`, `AN_FRAME_T`) | four flat walls and a flat lid | four concrete beams across the lid at z 68.8 / 71.6 / 74.4 / 77.2 on pilasters 0.44 m wide and 0.22 m proud of the west and east walls, steel feet, a corbel over the stair's door; all in the bake (vertex-lit, they shade the lightmapped walls). **No collider, node or marker changed.** `chunk_bo_ante` 3 377 -> **4 737** of 8 000 triangles; the asset 31 679 -> **33 039** of 40 000, 10 / 10 draw calls, 685 kB; `lm_bore` 338 kB | LEVEL / ART_BIBLE 3.6 where the antechamber is described |
| 4 | mood `L5a` (`src/render/moods.ts`) | saturation 0.78 | **0.92** (the unclipped orange drew as tan at 0.78) | ART_BIBLE 11.1 mood table |
| 5 | High: contact shade (`src/render/post.ts`) | a tap's weight unbounded, a hard floor at `AO_FLOOR`; `AO_INTENSITY` 10: a box 0.3 m proud of a wall drew a hard-edged dark blot half a metre wide with a stippled edge | a tap weighs at most `AO_TAP` **0.55** before its falloff, the floor is approached on an exponential shoulder, `AO_INTENSITY` **15**: the shade is a ramp from the contact outward. Same 20 depth reads a pixel, no new uniform, define, pass or target. `tests/render/polish4_high`: the shade alone moves the gallery frame by 0.85 of 255 (1.33 before), 7.9 % of the world's pixels | ARCHITECTURE 8.2 (contact shade constants) |

Measured after (static frames, `after_low.log` / `after_high.log`, 30 frames a tier): Low at most 58 draw calls,
75 273 triangles, 59.9 MiB (the Tally House cell, unchanged); High 69 / 75 286 / 77.8 MiB. Antechamber Low: 34 dc, 51 391 triangles.

## 2. Requests to other owners

| # | To | Request | Why |
|---|---|---|---|
| 1 | gun look team | `tests/render/polish3.test.mjs` "R6" fails at `ante`: 4.1 % of the view-model under L* 12 (limit 4.0). It is 4.3 % with the antechamber's saturation put back to 0.78, so it is not this team's mood change; `weapon_revolver.glb` and the L5a `vmAmb` / `vmKey` entries were being changed while this ran | the view-model's detail and rig are yours |
| 2 | gun look team | in the antechamber the revolver draws lilac-violet against a room that is now plainly orange and slate (`after/high_ante_camp.png`) | R13: "lit by the mood of the room it is in" |
| 3 | creatures-props | `ia_ammo_box` at arm's length is a dark navy block with flat faces (`after/high_ante_ammo.png`); the embers (`prop_camp_ash`) are about 40 px wide at 4 m | R7 |
| 4 | props (`ia_lift_cage`) | rounds 4 and 5, row 2.1 / 2.3 stand: the lattice's frequency and the cage's flat floor | not touched |

## 3. Known gaps

- The contact shade has still not been seen on a real GPU; it was judged on SwiftShader at 1280 x 720 at 2 x zoom.
- Tally House, gallery, lift hall, both rides and the boss room were captured before and after on both tiers and left
  as they were (`after/sheet_<tier>_under.png`, `sheet_<tier>_tally.png`, `sheet_<tier>_bore.png`): nothing in them was
  judged weaker than the antechamber. The round-5 gaps (High close to Low from the catwalk; no High-only term in the
  Tally House but bloom) stand.
- The seventh shot was not re-captured in this pass (no file of it was touched).
- `tests/e2e` was not run by this team (a bake, mood numbers and a post term; no collider, node or clip changed).

## Closer, release pass p0 (2026-10-07): decisions on this file's p0 rows

Evidence: `docs/INTEGRATION_REPORT.md` Part K, `scratch/p0-closer/NOTES.md`, `scratch/p0-closer/gate/`.

| Row | Decision |
|---|---|
| Section 1 rows 1 to 5 | **Applied**: ART_BIBLE "Amendments, release pass p0" (3.6, 11.1), ARCHITECTURE 8.4's p0 note (contact shade), LEVEL 13 |
| 2.1, 2.2 the view-model in the antechamber | R6 passes on the final tree; the gun's hue there is the gun team's new `L5a` rig (ambient `#5e4c3c`, key `#ffa462`) |
| 2.3 `ia_ammo_box`, `prop_camp_ash` | Not applied; known issues |
| Creatures-props' rows: the cabinet and the stair | **Applied by the closer** (the team had finished): `env_lift_hall.py` (the cabinet's band round four sides; seam, louvres and kick strip on three faces), `env_the_bore.py` (a pale nosing on every tread, a third lamp on the lower flight). Both zones and their lightmaps rebuilt (302 s); `tests/art_env_interior` 17 pass. Frames: `shots/p0-team-creatures-props/p0closer/` |

# Look team "underground-look", pass i1 (2026-10-07)

Log: `scratch/i1-team-underground-look/NOTES.md`. Frames: `shots/i1-team-underground-look/before/` and `after/`
(1280 x 720, the real game, Low and High, High settled 75 ticks; `after/pairs_issues.png` = before left / after right,
`after/pairs_lowhigh.png` = Low left / High right, `wip3/sheet_a.png` = the Tally House's walls, `wip4/sheet_niche.png`
= the watcher's niche, `wip5/sheet_low_ricochet.png` = the deflected round, `wip5/low_vista_mid.png` = the catwalk's view).

## 1. What changed, for the closer to mirror into the documents

| # | Where | Before | After | Document to mirror |
|---|---|---|---|---|
| 1 | Deflected round (`src/render/feedback.ts` `RICOCHET_M`, `vfx/vfx.ts` `LINE_STYLE.ricochet`) | the mirrored direction drawn 6 m long (`streak` 6): a round that meets the Windlass's shutter head-on comes back along the view, so a one-pixel line stood from the hit to the top of the frame | a spark 0.7 m long thrown 1.6 m off the plate: the mirror direction leaned toward the surface's normal and to one side (the side is the hit point's hash: deterministic, no allocation). Still two ticks | ART_BIBLE 9 if it describes the ricochet |
| 2 | High: contact shade (`src/render/post.ts`) | a thing 5 mm over a surface shaded it; `AO_INTENSITY` 15; `AO_LIT` 0.7 between 0.30 and 0.85 | `AO_THIN` **0.028 m** (a plate, band or bezel a finger proud of a wall shades nothing: it was a stippled smudge wider than the thing); `AO_INTENSITY` **20** (the creases that are left carry the term: `tests/render/polish4_high` measures the shade alone at 0.84 of 255, 7.4 % of the world's pixels; it was 0.85 / 7.9 %); `AO_LIT` **0.8 between 0.25 and 0.70** (the cages' pale enamel). Frames with these final numbers: `after2/pairs_ao.png` (the `after/` High set was taken at 0.035 / 13 / 0.85) | ARCHITECTURE 8.2 (contact shade constants) |
| 3 | High: air light and bloom by mood (`moods.ts`) | `AIR` L2 0.8, L4 1.2, L5 1.2, L5a 1.4; L2 no bloom of its own (1.15); L5a bloom 0.75 / 0.40 / 0.9 | `AIR` L2 **1.0**, L4 **1.5**, L5 **1.5**, L5a **2.2**; L2 bloom **0.62 / 0.40 / 0.9** (the lamp-lit table, the door, the shutters' patches glow); L5a bloom **0.62 / 0.40 / 1.0** | ART_BIBLE 11.1 (High-only columns) |
| 4 | High: the layout's fires in the air light (`system.ts` `AIR_LAYOUT.practical`) | level 0.7, reach 2.5 m | **1.2, 3.5 m** (the lantern on the long table, the Dowser's embers) | ARCHITECTURE 8.2 if it quotes them |
| 5 | `env_tally_house` walls (`blender/env_interior/env_tally_house.py`) | plaster from the base to the roof; nothing on three walls | an ox-blood **dado** under the chair rail, smoke over 2.6 m; `build_wall_dressing`: a peg rail with four dippers, two tin measures and a folded cloth under the south shutter, the **watch slate** (a board with chalk rows) by the door on the west wall, two shelves with ten bottles on the east wall between the barred doors and the hearth, the carrying yoke west of the street door. No collider, node or marker changed. 16 073 -> **16 903 of 17 000** triangles, 4 / 4 draw calls; dressing 1 680 of 2 000, 3 sets | LEVEL / ART_BIBLE 3.3 where the hall is described |
| 6 | `env_tally_house` chalk (the same file, `CHALK_AMBIENT` 0.5) | **every chalk row outside the lantern's reach and the blades was black**: a decal's vertices lie on their board and their baked occlusion is 0, so they took no ambient. The tally wall read as a blank dark board from the door | the decals take half the room's ambient unoccluded: the households' rows read across the whole wall in the gloom; the blade's patch is still the bright part | LEVEL 3 (the tally wall), GDD where the wall is the room's subject |
| 7 | `env_the_gallery` watcher's niche (`env_the_gallery.py` `niche_lamp`, `niche_wash`, `NICHE_T` 0.55) | unlit: the watcher was a dim figure in a dark hole (the world put a star card there) | a sodium pilot lamp on the back wall and its baked wash: a dark figure on a warm wall, and a warm spill on the stair that says where to look. 21 192 of 26 000 triangles, 10 / 10 | LEVEL (peg stair) |
| 8 | `env_the_bore` catwalk (`env_the_bore.py` `hand_rail_s_w / _e`, `knee_rail_s`) | the south hand rail at 1.0 m ran through the viewing bay and cut the Windlass in two in the first look | between the bay's jambs a knee rail at 0.5 m; the hand rail runs to each jamb. No collider. 33 155 of 40 000, 10 / 10 | LEVEL 13 |

Measured after (static frames, 38 a tier): Low at most 57 draw calls, 76 973 triangles, 52.8 MiB; High 97 / 137 833 /
77.8 MiB. Low against High (mean absolute difference of 255, 320 x 180, the reviewer's measure; reviewer's figure ->
before this team (render-tech's air light in) -> after): antechamber 1.2 -> 4.3 -> **6.0** (six views 5.4 to 8.3), boss
floor 4.6 -> 8.9 -> **11.8**, Windlass vista 0.6 -> 13.3 -> **15.7**, Tally House 1.5 / 1.4 -> 9.6 / 6.5 -> **13.3 / 7.5**,
Tamper vista 1.5 -> 3.2 -> **3.3**.

## 2. Requests to other owners

| # | To | Request | Why |
|---|---|---|---|
| 1 | level design / world | the lift-head diagram behind a pier from the hall's centre line (the world team's third ask) | the pier is a collider and the diagram a layout marker: neither may move in a look pass |
| 2 | world | the star card at the watcher's niche can go: the niche has its own lamp now (`wip4/sheet_niche.png`) | world's note |
| 3 | gun look team | `tests/render/moods.spec.ts` "every mood carries a rig for the view-model" fails on the shared tree (a key of 0.834 against the test's 0.7975): a `vmK` entry, not this team's | seen at 08:14 |
| 5 | render-tech / closer | this team edited one line of `tests/render/polish3.test.mjs` ("High is not Low": the Tally House's bloom threshold is its own 0.62 now, the test pinned the plain 1.15) | consequence of row 1.3 |
| 4 | creatures-props | the lift cages' interiors (lattice frequency, flat floor) are still `ia_lift_cage`'s; this team only cleaned High's shade on them | rounds 4, 5 and p0, same row |

## 3. Known gaps

- The Tamper's vista is still only 3.3 of 255 between the tiers, and two views at arm's length of a boss-room pillar 1.9 to 2.7.
- The Tally House has 97 triangles left; the yoke on the south wall is a plain bar on two pegs.
- No baked window light was added to the Tally House: the shutters are shut until the puzzle opens them (the blades are the puzzle's own cards).
- The contact shade has still not been seen on a real GPU. `tests/e2e` was not run by this team.

## Closer, pass i1 (2026-10-07): decisions on this file's i1 rows

| Row | Decision |
|---|---|
| Section 1 rows 1 to 8 | **Mirrored**: ARCHITECTURE 8.4 (contact shade constants, `AIR_LAYOUT`), ART_BIBLE "Amendments, pass i1" and the ricochet row of section 9, LEVEL 15, GDD 23.14 |
| Request 1, the diagram behind a pier | **Not done** (a collider and a layout marker); the lines start on a look or on the floor before the ring |
| Request 2, the star at the watcher's niche | **Kept** (tested, one pooled card) |
| Request 3, `moods.spec` "every mood carries a rig for the view-model" | **Green on the final tree** |
| Request 5, the edit of `tests/render/polish3.test.mjs` (the Tally House's bloom threshold 0.62) | **Accepted**: the test now pins the room's own number |
| Section 3, gaps | **Open**: `docs/KNOWN_ISSUES.md` |

# Look team "underground-look", pass i2 (2026-10-07)

Three issues from the visual reviewers (the Windlass vista crossed by a rail; the bore kerb blocky and the seventh "mostly
a colour change"; "a black disc on a stem" in the lift hall). Files touched: `blender/env_interior/interior_common.py`,
`env_the_bore.py`, `env_lift_hall.py`, `src/render/vfx/vfx.ts` (the seventh's own effect only). Evidence:
`shots/i2-team-underground-look/` (`before/`, `after/`, `after/pairs_issues.png`, `after/pairs_high.png`,
`before|after/sheet_seventh_low.png`), log `scratch/i2-team-underground-look/NOTES.md`.

## 1. What changed, for the closer to mirror into the documents

| # | What | Where | Document rows |
|---|---|---|---|
| 1 | **The catwalk's viewing bay has no rail.** The knee rail (0.5 m, pass i1) is gone and the kick plate is 80 mm (it was 140): from `vista_windlass` nothing crosses the frame below the head rail. The bay is closed by the layout's blocker and stands between its two jambs. No collider changed | `env_the_bore.py` `build_catwalk` | ART_BIBLE 7.3 / the `env_the_bore` row (catwalk); LEVEL 15 |
| 2 | **The bore kerb is a machined casting.** 2.5-degree segments (they were 6), smooth-shaded; a 50 mm chamfer on both arrises of the notches and the merlons; a dark steel inlay in the top of every notch and merlon and down each merlon end; a steel band (now lightmapped, dark) with a bolt circle; two bolted inspection plates on each merlon's outer face. Nothing stands higher than before (notch 0.6 m, merlons 1.2 m) | `env_the_bore.py` `build_sector`; `interior_common.oriented()` | ART_BIBLE 7.3 (the kerb), 3.6 |
| 3 | **The kerb's seams are the bore's own light.** 132 faces added to the lamp set `bore_glow` (no new node, no new draw call): a 44 mm seam in every inlay, level 0.6 (`KS_SEAM`), `violet_band` with `wrong_fade`: violet while the bore is wrong, aqua behind the seventh's ring, and it turns from the notches up to the merlons as the bore's light does | `env_the_bore.py` `KERB_SEAMS`, `main()` | ART_BIBLE 9.3 step 4 (what turns), 7.3 |
| 4 | **The seventh: the bore answers.** Inside the standing line's 2.4 s flare, four ticked rings of aqua light leave the pit 0.28 s apart and climb the line to the vault (1.5 s each), and twelve threads of light are drawn up the shaft's wall one after another (0.045 s apart, 1.0 s to rise, gone at 1.8 s), each with a bright head. At most 16 additive quads of the existing quad batch, no particle, nothing after 2.35 s (the four seconds of nothing are untouched); Reduce Flashes shows none of it | `src/render/vfx/vfx.ts` `PROVE_*`, `fillProving()` | **ART_BIBLE 9.3: "Budget: 2 additive quads + the shader term" becomes "up to 18 additive quads for 2.4 s + the shader term"; new step between 4 and 5**; GDD 19 row 12 |
| 5 | **The lift-head diagram's seventh is a dead signal lamp** (hall and antechamber): a steel bezel with a bolt circle, a pale reflector with eight spokes, a dark lens (lamp 6 of the set, still dark by the world's mask), hung on a conduit with two saddle clamps and a shackle. The six lit lamps are round twelve-sided lenses in thin bezels (they were squares behind round rings); the mark's discs have 24 / 20 sides (16 / 12) | `interior_common.diagram_dress()`, `env_lift_hall.py` `build_diagram`, `env_the_bore.py` `build_ante` | ART_BIBLE 7.3 (the diagram); GDD 9.6 unchanged ("six in a ring, one hung apart") |

Numbers: `env_the_bore` 38 049 of 40 000 triangles (it was 33 155; `chunk_bo_chamber` 31 444 of 32 000, `chunk_bo_ante`
5 889 of 8 000), 10 of 10 draw calls, 749 kB; `env_lift_hall` 25 450 of 30 000 (24 296), 4 of 4, 444 kB. Frames of the
after set, 1280 x 720, no enemies: Low at most 54 draw calls / 71 412 triangles / 52.8 MiB, High 72 / 119 928 / 77.8.
`lm_bore`, `lm_bore_glow` and `lm_hall` were re-baked at final quality. No node, lamp-set name or count, collider, layout
value or budget changed.

## 2. Requests to other owners

| # | To | Request | Why |
|---|---|---|---|
| 1 | closer | `chunk_bo_chamber` has 556 triangles left of its 32 000: anything more on the kerb or the ribs needs a share from `chunk_bo_ante` (2 111 free) through `tools/gen_assets.mjs` | ruling R14 |
| 2 | closer | `src/ui/loadMeter.ts` `BOOT_FILE_BYTES` does not move (the bore and the hall are not in the boot sets) | the UI team's note |
| 3 | world / level design | the viewing bay is open from 0.08 m to 1.75 m between its jambs and is held by the layout's blocker alone: if that blocker ever moves, the bay needs a rail again | row 1.1 |

## 3. Known gaps

- The band's bolt heads are steel on a dark band in the kerb's own shade: they read at arm's length on High, hardly at all on Low.
- The shaft lining under the kerb still has 7.5-degree segments (the kerb above it 2.5): seen straight down the bore the lining's facets show. A finer lining costs 1 150 triangles the chamber does not have (request 1).
- The seventh's rings use the ticked ground-ring shape (its line goes warm-white at the crest); a shape of its own would be a shader edit in the shared quad batch.
- Not seen on a real GPU; `tests/e2e` not run by this team.

## Closer, pass i2 (2026-10-07): decisions on this file's i2 rows

| Row | Decision |
|---|---|
| Section 1 rows 1 to 5 | **Mirrored**: ART_BIBLE "Amendments, pass i2" (7.3, **9.3: up to 18 additive quads for 2.4 s**), GDD 23.15 (9.6, 9.7, 19 row 12), LEVEL 16 (the bay held by the blocker alone) |
| Request 1 (`chunk_bo_chamber` 556 triangles left) | **Noted**; no move made (nobody left to spend it) |
| Request 2 | nothing to do |
| Request 3 (the bay's blocker) | **Written into LEVEL 16** |
| The zones | `env_the_bore` and `env_lift_hall` were rebuilt once more in the closer's full build, after the last prop |
| Section 3, known gaps | **Open**: `docs/KNOWN_ISSUES.md` |

## Fixer, pass i3 (2026-10-07): decisions on the rows left open, and what the underground has to spend

| Row | Decision |
|---|---|
| Request 1, pass i2 (`chunk_bo_chamber` needs a share of `chunk_bo_ante`) | **Applied** through `tools/gen_assets.mjs`: `chunk_bo_ante` 8 000 -> **6 500** (built 5 889), `chunk_bo_chamber` 32 000 -> **33 500** (built 31 444: **2 056 free**). `cell_bore` 92 808 of 120 000 |
| The gallery and the hall | `chunk_gl_stair` 4 000 -> **3 200** (built 2 868), `chunk_gl_bay` 4 000 -> **3 200** (built 2 818), `chunk_lh_hall` 30 000 -> **28 500** (built 25 380: 3 120 free), `chunk_gl_gallery` 18 000 unchanged (built 15 500). They paid for the hung coats (600, the gallery's dressing 8 500) and the Bider's knot. `cell_gallery` 118 700, `cell_hall` 111 785 |
| Section 3, known gaps | stay open for this pass's team (`docs/KNOWN_ISSUES.md`) |

# Look team "underground-look", pass i3 (2026-10-07)

Five issues from the visual reviewers (High against Low from the gantry and the vistas; the seventh "reads as a lighting
change"; a black soft rectangle on the boss-room wall; the peg stair's streaks, smears and brightness; the kerb blocky
with stepped slots). Files touched: `blender/env_interior/env_the_bore.py`, `env_the_gallery.py`,
`tests/art_env_interior/i3_wall.test.mjs` (new), `src/render/vfx/vfx.ts` (the seventh's own effect), `vfx/quads.ts` (one
opt-in term of the ring shape), `vfx/ambient.ts` (a third mode), `moods.ts` (this team's entries of `SHEEN`, `AIR`,
`AIR_CONE`; new table `AIR_DUST`), `system.ts` (`proven`, `PROVEN_TRAUMA`, the ambient switch). Evidence:
`shots/i3-team-underground-look/` (`before/`, `after/`, `after/pairs_issues.png` = before left / after right,
`after/pairs_lowhigh.png` = Low left / High right, `after/sheet_seventh_high.png`, `sheet_seventh_low.png`,
`wip4/crop_kerb.png`, `wip5/sheet_high.png` = the seventh seen level from the mark), log
`scratch/i3-team-underground-look/NOTES.md`.

## 1. What changed, for the closer to mirror into the documents

| # | What | Where | Document rows |
|---|---|---|---|
| 1 | **The black rectangle is gone.** The lining BEHIND the bolted access panels baked black (the panels, 35 mm proud, stood in the sector's bake); on facet 165 the panel is removed for the line locker's seat, which bared the patch. The panels are out of every lightmap pass of the sector (they stay vertex-lit in their own bake). `tests/art_env_interior/i3_wall.test.mjs` samples that wall against the wall 0.95 m to either side (75.7 against 59.1 / 97.4 of 255) | `env_the_bore.py` `main()` (`panels`, `hide_lm`) | KNOWN_ISSUES (remove if listed) |
| 2 | **The kerb's arrises are rounds.** Both top arrises of the notches and the merlons: a 90 mm round in three smooth-shaded steps (it was a 50 mm chamfer, one pixel at 3 m). The seam of the bore's light is 80 mm (44) in a 220 mm inlay (100), with a 16 mm feather on both sides (faces of `bore_glow` whose outer corners are dark), and the inlay's outer corners take three quarters of the kerb's own colour: no one-pixel black-on-pale step. The hazard diagonals stop inside the rounds. Nothing stands higher; no collider, node, lamp-set name or count changed | `env_the_bore.py` `build_sector` (`arris`, `KERB_FEATHER`), `main()` | ART_BIBLE 7.3 (the kerb) |
| 3 | **The seventh moves through the room** (same budget: 17 of the 18 additive quads, nothing after 2.4 s, no particle, none under Reduce Flashes). The column holds its white peak 0.28 s (`PROVE_HOLD`) and is half as thick again; a shock ring with a wake leaves the kerb's foot across the floor to the walls on the shader's own front, a second 0.16 s behind; the kerb's seams go white for the hold (a crown ring on the notches) before the aqua; a bloom of light on the vault where the column meets the head; three rising rings (four) and eight threads (twelve), each thread half as thick again; the shader's front is 2 m wide while it crosses the kerb (1 m: four frames) and 1 m beyond 6 m; the camera takes one knock (`PROVEN_TRAUMA` 0.55 of the render system's trauma: none under Reduce Motion, the aim is not touched) | `vfx.ts` `PROVE_*`, `standFlare`, `fillProving`, `proveFloor`; `quads.ts` ring branch (`vD.x` = 1: no ticks, a wake `vD.y` of the radius wide; every other ring unchanged); `system.ts` `proven`, `PROVEN_TRAUMA` | **ART_BIBLE 9.3** (the steps of the seventh; the budget line stands), GDD 19 row 12 |
| 4 | **The peg stair is three pools in a dim slot.** A strip puts 0.5 on the low pegs (0.9) and reaches 6 m (9): frames' median L* 19 to 28 on the flights (32 to 38), between the Tally House (15 to 19) and the gallery (23). Rails and pegs are out of the lightmap's render: no saw-edged band under a rail, no smear under a peg | `env_the_gallery.py` `STAIR_T`, `STAIR_R`, `main()` (`thin`) | LEVEL (peg stair), ART_BIBLE 3.4 if it quotes 0.9 |
| 5 | **High underground**: `SHEEN` L4 2.2 -> **3.0**; `AIR` L3 1.0 -> **1.4**, L4 1.5 -> **2.2**; `AIR_CONE` L3 4 -> **6**, L4 5 -> **8**; new **`AIR_DUST`** (L3 0.7, L4 0.8, L5 0.6, L5c 0.7, L5p 0.8): 400 pale additive motes in a 16 x 5 x 16 m box round the eye that hang and glint (`ambient.ts` mode 'air': one draw call on High underground, none on Low or min) | `moods.ts`, `system.ts` (the ambient switch), `vfx/ambient.ts` | ART_BIBLE 11.1 (High-only columns), ARCHITECTURE 8.2 / 8.4 (the ambient cloud has three modes) |

Numbers: `env_the_bore` **39 825 of 40 000** triangles (38 049; `chunk_bo_chamber` **32 692 of 33 500**, `chunk_bo_ante`
5 889 of 6 500), 10 of 10 draw calls, 765 kB; `env_the_gallery` 21 192 of 24 400 (unchanged), 10 of 10, 464 kB.
`lm_bore`, `lm_bore_glow`, `lm_gallery` re-baked at final quality. Frames of the after set (23 a tier, 1280 x 720, no
enemies): Low at most 38 draw calls / 64 473 triangles / 52.8 MiB; High 65 / 114 219 / 77.8 MiB.

Low against High (mean absolute difference of 255, 320 x 180, the reviewer's measure; reviewer -> before this team
with render-tech's cones in -> after): `vista_tamper` 2.1 -> 4.3 -> **6.3**; `cp_hall_gantry` 4.0 -> 7.5 -> **10.5**;
`cp_file_clear` 3.9 -> 6.1 -> **7.0**; `vista_windlass` 3.6 -> 13.8 -> **13.8**; `cp_hall_clear` 11.9 -> 15.2 -> **20.3**;
`cp_gallery_bay` 8.7 -> 12.3 -> **15.9**.

## 2. Requests to other owners

| # | To | Request | Why |
|---|---|---|---|
| 1 | closer | `env_the_bore` has **175 triangles left** of its 40 000 (the lamp sets count in the asset's total); `chunk_bo_chamber` 808 of its share | ruling R14 |
| 2 | closer | `tests/render` and `tests/e2e`: re-run after all teams (this team ran `tests/art_env_interior`, the render specs and `tests/render` once: section 3). The deterministic playthrough is not touched by anything here (bakes, an effect, mood numbers, the render system's trauma) | |
| 3 | render-tech / closer | `quads.ts`: the ring shape reads `vD.x` (plain shock) and `vD.y` (wake width) now; every caller but the seventh leaves them 0 | shared shader, opt-in |
| 4 | gun look team | on the peg stair the room is now dim concrete with three pools; the view-model's L3 rig was tuned against the old flood | row 1.4 |

## 3. Known gaps

- The shock ring leaves the kerb BEHIND a player who stands on the proving mark (she faces the bore): she sees its far
  arc beyond the kerb and its sides, not the whole ring. The column, the crown, the rising rings and the threads are
  what the frame from the mark holds.
- The motes are 2 to 3 pixel points; in a still frame they are a few specks. Not seen on a real GPU, like the rest of High.
- `vista_tamper` is 6.3 of 255: a dark frame seen from above; the shafts over the aisle are what High adds there.
- The stair's concrete course joints are still soft dark lines (the texture's): at the lower level they are quiet.
- `tests/e2e` not run by this team.

## Closer, pass i3 (2026-10-07): decisions

| Row | Decision |
|---|---|
| 1 rows 1 to 5 | Mirrored: ART_BIBLE "Amendments, pass i3 (closer)", GDD 23.17, ARCHITECTURE "Pass i3", LEVEL 18 |
| 2.1 to 2.3 | Noted; `tests/render` and `tests/e2e` re-run on the final tree (INTEGRATION_REPORT Part P) |
| 3 known gaps | In `docs/KNOWN_ISSUES.md` |
