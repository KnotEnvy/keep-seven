# Round-3 critic issues: what the integrator did with the document-related ones

Source: `docs/requests/foundation-r3-issues.json` (26 issues, numbered here from 0 in file
order). The JSON was not edited. Code fixes are the owners' (core and pipeline were fixing
theirs while this pass ran); this file records the **document** side only.

| # | Issue (short) | Document action | Status |
|---|---|---|---|
| 0 | pixel ratio never raised again | core fixed it during this pass (`quality.ts`); ARCHITECTURE 8.5 step 4 and `code-ui` 5 describe the fixed behaviour | RESOLVED (documents follow the code) |
| 1 | `startServer({ mode: 'build' })` kept `NODE_ENV=development` | core fixed it; ARCHITECTURE 11.3 and README 4.1 say a build is a real production build | RESOLVED (documents) |
| 2 | the "wired in" check is vacuous | README 4.1 and ruling 17; line 1 of the definition of done of all six code orders: `KEEP7_REAL=<slot> node --test tests/core/`; ARCHITECTURE 11.3 "Which command proves what". Core also prints the loaded slots as the run's first line (README 4.1 quotes it) | RESOLVED |
| 3 | refused pointer lock | core fixed it; ARCHITECTURE 10.2 and `code-ui` 5 describe it | RESOLVED (documents) |
| 4 | hook accepts bad arguments, `state()` hides NaN | core fixed it; ARCHITECTURE 11.2, README 4.1 | RESOLVED (documents) |
| 5 | stub world commits boss checkpoints by proximity | core fixed it; README 4.1, `code-player` 9, `code-enemies` 9, `code-world` 5 describe the stub as it is now | RESOLVED (documents) |
| 6 | `tap()` under the real-time loop | core fixed it; ARCHITECTURE 11.2, README 4.1 | RESOLVED (documents) |
| 7 | blank page on a boot failure | `code-ui` 5 tells the builder to read FOUNDATION_REPORT for what core writes and not to add literal strings; no `story.json` key was added (not this pass's file) | OPEN with core and the story owner |
| 8 | `GameClock.tick` counts while paused | the two `GameClock` comments in the contracts block (ARCHITECTURE and `contracts.ts`), ARCHITECTURE 3.3, README 4.1, section 9 of every code order, `code-player` test list | RESOLVED |
| 9 | core suite twice as slow as reported | README 4.1 and ARCHITECTURE 11.3 give 95 to 100 s quiet and 140 to 190 s beside other suites, and call `KEEP7_REAL` a final-pass step. FOUNDATION_REPORT's own figures are core's to update | RESOLVED (orders) |
| 10 | `LM` mesh without its vertex bake passes | warning with the symptom and the check ("open the `_game.png` after every bake") in `art-env-exterior` 3 and `art-env-interior` 3 | RESOLVED as a warning; code OPEN with pipeline |
| 11 | 256 spp vertex light is mottled indoors | both env orders: 2048 to 4096 spp for final interior vertex light, with the critic's numbers | RESOLVED as guidance; library default OPEN with pipeline |
| 12 | skipped lightmap exits 0 | both env orders: treat a `skipped lm_*` line as a failed build | RESOLVED as a warning; code OPEN with pipeline |
| 13 | bake warnings only in the log | "the pipeline as built" bullet of every art order | RESOLVED as a warning; code OPEN with pipeline |
| 14 | the reference crate panel shows the AO-at-corners defect | none (a fixture, pipeline's) | OPEN with pipeline |
| 15 | contact sheets frame loosely | none (pipeline's tool) | OPEN with pipeline |
| 16 | `shot=1` frames are small | core fixed it during this pass (a shot is fitted to 90 % of the frame); the art orders say so and keep `&dist=` for close-ups | RESOLVED (documents) |
| 17 | small pipeline documentation gaps | `--piece` is in README 1.1 and the art orders; the tin row and the seam floor are in `art-env-exterior` 3 (the texture's owner from phase 3). The hinge sign convention belongs in `blender/lib/README.md` (pipeline's file) | PARTLY RESOLVED |
| 18 | no order points at FOUNDATION_REPORT; rows 9 to 31 unapplied | all rows applied (`foundation-core.md` section 0); README header and section 4 "Read first" by reader and section number; a "foundation as built" paragraph at the top of every code order and a pointer in every art order's read-first line | RESOLVED |
| 19 | `tests/core` is not independent of the pieces | core fixed it (`startServer({ pieces })`); README 4.1 and ARCHITECTURE 11.3 describe it; the earlier sentence of row 20 ("never loads `src/<piece>/`") is now true | RESOLVED (documents) |
| 20 | the tone-map ruling | **ruled**: shoulder-only, no toe, `TONE_MAP_GLSL` (knee 0.8). README 6 ruling 15, `code-render` 4.1 and 4.3, ARCHITECTURE 8.1 and 8.2, ART_BIBLE 11 and 12, GDD 23.5 | RESOLVED |
| 21 | no documented way to read or pose bones in the viewer | core added `ext.viewer.pose / setBone / setClip` during this pass; they are written into `art-props` 9, `art-weapons` 3 and 5, `art-enemies` 3 and 5, `art-boss` 3 and 5 (with the `viewer_holder` path as the fallback) | RESOLVED |
| 22 | `preview-asset --textures` folder | `--piece` in README 1.1, `art-weapons` 5, both env orders, `code-render` 4.8 | RESOLVED (orders) |
| 23 | `tx_noise` and sharp | `code-render` 4.8 | RESOLVED |
| 24 | small inaccuracies in FOUNDATION_REPORT | the 8c / 8d reference in `foundation-core.md` is corrected; the timing is in README 4.1. The report itself is core's file | PARTLY RESOLVED |
| 25 | the shared `lm_surface` recipe is unbuilt | `art-env-exterior` 3: build the three-script skeleton first; the determinism measurement is quoted | RESOLVED (order) |

## Found in this pass (for the owners)

1. **Manifest owner of the three shared textures.** `design/assets.json` gives `tx_mask`,
   `tx_palette` and `tx_palette_emis` the owner `props_dress`; production gave their scripts
   to `art-props-mech`. The documents say so and tell `art-props-dress` to build by asset
   id (an owner build would run the other builder's scripts). Changing
   `textures.*.owner` to `props_mech` in `tools/gen_assets.mjs` would let both builders use
   owner builds. Architecture owner.
2. **Source file names against the split's globs.** The manifest's `source` paths are
   `blender/enemies/enemy_bider.py`, `enemy_transit.py`, `blender/boss/boss_windlass.py`,
   `enemy_tamper.py`: they do not start with `bider`, `transit`, `windlass`, `tamper`. The
   documents therefore list each piece's files by name (README 1.1) and keep the prefixes
   for helpers and tests.
3. **`tools/pipeline-lib.mjs` `PIECES`** maps owners to the unsplit order names, so
   `preview-asset.mjs` writes to `shots/art-props/`, `shots/art-enemies/`, `shots/art-boss/`
   by default. The orders tell the six builders to pass `--piece <piece name>`.
4. **Download shares of the split pieces** are a split of the order's figure made in this
   pass (props 0.5 + 0.3 MB, enemies 0.55 + 0.25 MB, boss 0.35 + 0.25 MB); the order totals
   are what the README's budget table holds.

## Code integrator, polish round 2 (2026-10-04): what was decided on the code-side rows

| Row | Decision |
|---|---|
| document rows | nothing new; ARCHITECTURE 3.5 and 7.5 were edited for the plug rule (`plug_door_tally` is drawn whenever its unit is hidden) |

