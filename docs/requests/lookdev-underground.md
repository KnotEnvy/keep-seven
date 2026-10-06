# Requests of the look-dev director, underground and boss room (polish round 3)

Evidence: `shots/r3-lookdev-underground/` (`before/`, `after/`, `cmp_boss.png`), log `scratch/r3-lookdev-underground/NOTES.md`.

| # | To | Request | Why |
|---|---|---|---|
| 1 | closer (documents) | Mirror the new grade numbers into ART_BIBLE 11.1 and 3.3 to 3.6: L2 exposure 2.5, lift (0.012, 0.007, 0.009), contrast 1.16, fog `#1C1318`; L3 exposure 1.75, tint (0.96, 1, 1.04), lift (0.004, 0.008, 0.016), saturation 0.88, contrast 1.15, fog `#0A1424` to `#14343E`; L4 exposure 1.9, tint (1, 1, 1), lift (0.004, 0.007, 0.014), saturation 0.80, contrast 1.16, fog `#0A1322` to `#122A36`; L5 exposure 2.2, lift (0.006, 0.005, 0.014), contrast 1.18, fog `#15122C`, rim x 1.0; L5a exposure 1.3, tint (1.03, 1, 0.97), lift (0.010, 0.006, 0.007), saturation 0.78, contrast 1.18; L5c ambient `#4A4A78`, key `#9A8ED0`, exposure 1.7, tint (1, 0.98, 1.04), lift (0.008, 0.005, 0.016), contrast 1.16, fog `#181230`; L5p exposure 1.8, tint (0.96, 1.02, 1.02), lift (0.004, 0.010, 0.014), saturation 0.90, contrast 1.15, fog `#0C262C`. | `src/render/moods.ts` and `tests/render/moods.spec.ts` carry them; the bible's table still has the old ones. |
| 2 | closer (documents) | ART_BIBLE 3.6: the antechamber's fill is a cool grey (0.70, 0.82, 1.0) x 0.085, embers reach 6.5 m and read 1.3 on the floor at 1.5 m, their bounce 0.24 on the door wall; the chamber has a wall scallop under each bay lamp (0.6 at 2.4 m, reach 7.5 m). ART_BIBLE 9.3: the standing line is born as a column (2.4 s flare), the ring is an aqua-white front 1 m wide at 58 %, the kept round's pulse is aqua-white x 1.0 over 14 m for 0.16 s. | `blender/env_interior/env_the_bore.py`, `src/render/vfx/vfx.ts`, `tests/render/feedback.test.mjs`. |
| 3 | code-render | On High the Windlass's pip gauge blooms into one white bar (`after/sheet_high_play_bossb.png`): the pips are gameplay information. Hold the gauge's emissive out of the x 2.0 HDR term, or cap bloom on it. | Not changed by me: it is the shared emissive path of all three directors. |
| 4 | code-render / art-props-mech | The lift cages (`ia_lift_cage`, `ia_proving_lift_cage`) are still the darkest thing in both rides; in the proving-lift ride the view-model is salmon (L6's rig inside the shaft: `after/sheet_low_play_plift.png`, last frame). | Cage props and L6 are outside this scope. |
| 5 | art-props / code-world | The embers prop in the antechamber is a 20 px dot for the amount of light the bake now gives it (`after/low_ante_n.png`): a larger ember bed or a halo card would match. | Prop and its halo are not mine. |

## Closer, polish round 3 (2026-10-05): decisions on the rows above

| Row | Decision |
|---|---|
| 1, 2 documents | Mirrored: ART_BIBLE round-3 amendments (the grade table replaces 11.1's; 3.3 to 3.6; 9.3) |
| 3 the pip gauge blooms into one bar on High | Open (code-render): the HUD's 26 pips carry the reading meanwhile |
| 4 the cages; the salmon view-model in the proving lift | Open |
| 5 the ember prop | Open |
