# Requests of the exterior look-dev pass (polish round 3)

Scope of the pass: `blender/env_exterior/`, the surface and coda mood entries, the coda's far cards and far effects in
`src/render`, the staging of the sighting and of the rim ending. Evidence: `shots/r3-lookdev-exterior/` (`before/`,
`after/`, `compare_low_1.png`, `compare_low_2.png`, `after_high_sheet.png`); log `scratch/r3-lookdev-exterior/NOTES.md`.

| # | To | What | Why |
|---|---|---|---|
| 1 | closer (design/story.json) | `nar_dowser_seen` still says "a pale man"; he is a dark figure on the skyline now (card `#15121A`, 2 % haze, measured luma 50 against a sky of 192). Suggest "On the far rim, a man with a forked rod. Watching." or "a dark man" | the line contradicts the picture (`after/low_17_pd_01_story_dowser.png`) |
| 2 | closer (docs) | GDD 9.3, ART_BIBLE 6.5 and `design/layout.json` `vista_dowser` (`subject`, `minPixels: [3, 8]`) still describe a pale 8 px figure against the mesa's shadowed face. Now: dark, 9 x 29 px at 720p, against clear sky (lead ruling R4) | mirror |
| 3 | closer (docs) | ART_BIBLE's L6 row and the coda notes: sky mid `#443C72` at sin 0.4226 (was `#3C4674` at 0.2588); far-card fog cap 6 % (to 160 m) rising to 40 % (800 m); far window glow 24 px at 38 %; town card drawn 1.7 x. L0: lift half of L1's, contrast 1.20 | mirror |
| 4 | closer (design/assets.json through its generator) | `rim_town_card.placeholder.size` is 60 x 14 x 1; the card is about 104 x 25 m now. Its note says "250 m": the card stands 117 to 142 m from the ledge | the placeholder box is only used when the file is missing, so nothing breaks; the numbers are stale |
| 5 | code-ui | The end card is an opaque ink screen (`.k7 .end { background: var(--ink) }`): the last image of the demo is a black ledger, and the dusk scene with the fire and the lit town is gone the moment it comes down. Suggest the ink at about 70 to 80 % over the still-drawn scene (if the renderer still draws in `ending`: not checked), or the ledger in the right-hand third with the fire left of it | R7: "the last image must be a frame someone would screenshot" (`after/low_39_end_card.png`) |
| 6 | code-ui | The `VII / SEVEN` chapter card is drawn over the town's derrick at the lamps beat (`after/low_3pe_02_story_lamps.png`); it would sit better in the sky's upper third | minor |
| 7 | code-render / code-enemies | `FARCARD_MIN_PX` is still 9 and the enemies' vignette floor 8 px; the 28 px figure is code-world's wrapper (`director.presentSighting`). It works and is tested (`tests/world/sighting.test.mjs`); nothing was changed here | information |
| 8 | the other look-dev directors | `npx vitest run tests/render`: two failures in `moods.spec.ts` are L2 rows (exposure 2.2, contrast 1.16 against the pinned 2.0 / 1.08). `node --test tests/render/`: `feedback.test.mjs` "the ring at the seventh" and `polish3.test.mjs` "R6 ... gallery: a pale cut-out (L* 30.7 on 14.5)". None is in the exterior's scope; they were red while this pass ran | information |
| 9 | art-props-mech | The yard gate leaf (`ia_yard_door`) is still a flat blue-lavender panel at the end of the street (`after/low_12_yard_in.png`, right edge; `after/low_11_gate_near.png`) | open since the fixer's row 23 |

## Closer, polish round 3 (2026-10-05): decisions on the rows above

| Row | Decision |
|---|---|
| 1 to 4 | **Applied** (story, layout through its generator, the manifest's `rim_town_card` size and note, GDD, ART_BIBLE) |
| 5 the end card | **Applied**: ink at 80 % over the scene (`src/ui/ui.css`) |
| 6 the chapter card over the derrick | Open (code-ui) |
| 7 | Ruled: the floors stay (art-env-exterior.md) |
| 8 | All three suites green on the final tree |
| 9 the yard gate leaf | Open (art-props-mech) |
