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
