# Look-dev director, the revolver (polish round 3, lead ruling R6): changes made and requests

Evidence: `shots/r3-lookdev-gun/before/` and `after/` (real game, 1280 x 720), numbers in
`scratch/r3-lookdev-gun/before_*.log` / `after_*.log`, running log `scratch/r3-lookdev-gun/NOTES.md`.

## 1. What changed (for the closer: mirror into the documents)

| # | Where | Change | Document to mirror |
|---|---|---|---|
| 1 | `src/render/system.ts` `VIEWMODEL_FOV` | **52 -> 40 degrees.** At 52 the 8 % ruling was met only by pushing the gun 12 cm toward the eye: the cocked hammer and the back of the frame drew larger than the barrel (it read as a grey wrench). At 40 the same share is reached with the authored proportions (long barrel, small hammer). | ART_BIBLE 8.3 ("View-model FOV 52 vertical, fixed"), work order code-render, `tests/art_weapons/lib.mjs` comment (the viewer still frames at 52: its framing tests are about the asset, not the game) |
| 2 | `src/player/defs.ts` `VIEW_PLACE` | `x -0.008, y 0.012, z 0.065, pitch -5, yaw 5, roll -4` (was `-0.04, 0.02, 0.12, -6, -5, -12`). Idle on Low, all 12 spots: revolver alone 9.3 to 9.9 % of the frame, hand 1.0 to 1.4 %, left edge 0.54 of the width (4:3: 9.0 %, 0.554; 21:9: 7.6 %, 0.65). | ART_BIBLE 8.3 idle placement paragraph |
| 3 | `src/player/defs.ts` `VIEW_PLACE_HANDLING` (new) + `src/player/viewModel.ts` `late()` | During handling clips (reload, line round, kept round, take) the placement no longer blends to the authored pose but to a handling placement `x -0.02, y -0.04, z -0.03`: at 40 degrees the authored staging would put the muzzle out of the top of the frame. The whole gun stands in the right half, the gloves leave by the bottom edge. Blend time and conditions unchanged. | GDD / ART_BIBLE 8.3 (one sentence) |
| 4 | `src/render/materials.ts`, `GUN` branch of the dynamic shader only | The gun's flat "share of the ambient on every face" is replaced by a small studio mirrored by the reflected eye ray (one more varying, `vVP`; no texture, no extra pass): dark floor, bright horizon in the key's colour, the ambient as sky, the key as a hot spot; faces turned to the eye mirror less; the reflection is tinted by the albedo (blue steel, brown walnut, brass). The matcap's share is x0.35. Same program count (the `GUN` program is in the prewarm list as before). | ART_BIBLE 8.1 material paragraph |
| 5 | `src/render/moods.ts`, `vmK` only | L3 0.85 -> 0.95, L4 1.25 (new), L5 1.35 (new), L5p 1.3 (new), L6 1.75 -> 1.35. L5a unchanged (1.4). | — |
| 6 | `tests/render/polish3.test.mjs`, the R6 test only | Bounds follow the look: mean L* of the view-model >= background - 9 (was - 6), "pale" only above max(background + 16, 32), under L* 12 below 4 % (was 2.5 %). Reason in the test's comments: the rim's ledge is now L* 13 and the antechamber's wall L* 39 (other directors' work this round); the gun is dark steel with bright streaks, not an even grey at the room's level. | — |
| 7 | `blender/weapons/hands.py` | The coat cuff is no longer a black slab in `load_kept`: `tin` cell shaded down with lengthwise folds. Asset rebuilt (`node tools/build-assets.mjs --only weapon_revolver`, 5929 / 6000 triangles, 254.8 kB). No bone, node, clip or timing changed. | ART_BIBLE 8.2 cuff line (dark slate, not black) |

## 2. Requests to other owners

| # | To | Request |
|---|---|---|
| 1 | code-ui | The cylinder ring HUD (bottom right) lies over the gun's frame and hammer at idle at 16:9 (`shots/r3-lookdev-gun/after/hud_low_street.png`). ART_BIBLE 8.3 says the view-model is never over the ring; a gun of 8 % in the lower right cannot clear that corner. Either move the ring to the bottom centre-right (about 64 % across) or give its discs a 1 px dark outline so they read over lit steel. |
| 2 | code-player | `tests/player/place.test.mjs` test title "the placement leaves for the reload (the clip is shown as it was authored)" still passes (it checks the weight), but the clip is now shown at `VIEW_PLACE_HANDLING`; reword. The debug hook `player.viewPlace` sets the rest placement only; a second hook for the handling placement would help the sandbox sliders. |
| 3 | code-render (owner) | `tests/render/moods.spec.ts` has two failures that are not from this pass: "densities, exposures and grades are the table's" and "interior fog colours are display targets" (L2 is being edited by another director: exposure 2.5, fog `#1c1318`). The R6 rig test in that file passes. |
| 4 | art-weapons (owner), next round | Not done here, see the report: the right thumb at idle is still a smooth tan tube across the frame; fingers still facet; `load_kept` holds the cuff pose for about 70 ticks. |

## Closer, polish round 3 (2026-10-05): decisions on the rows above

| Row | Decision |
|---|---|
| 1 rows 1 to 7 | Mirrored: ART_BIBLE 8.3 in place and the round-3 amendments (8.1, 8.2), GDD 5 / 23.6, ARCHITECTURE 7.2 / 8.1; the comments in `tests/art_weapons/lib.mjs` and `framing.test.mjs` say whose 52 degrees it is |
| 2.1 the ring over the gun | Ruled: accepted, the bible's sentence withdrawn |
| 2.2 the test title | Applied (`tests/player/place.test.mjs`) |
| 2.3 `moods.spec.ts` | Green on the final tree (unit 433 pass) |
| 2.4 hands, hammer, the kept load's hold, the eject beat | Open for art-weapons (round 4) |
