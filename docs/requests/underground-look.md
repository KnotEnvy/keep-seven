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
