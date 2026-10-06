# Requests from the cross-cutting fixer, polish round 5 (2026-10-06)

What the pass changed under the pieces, and what each piece owner must follow up. Evidence and numbers:
`docs/INTEGRATION_REPORT.md` Part I; log: `scratch/r5-fixer/NOTES.md`; proxy runs: `scratch/r5-fixer/proxy/`; frames:
`shots/r5-fixer/`. **This is the last round of changes.** The design data is final as of this pass: nobody after it can
edit `design/*.json`, so what a team needs from the data is listed here as already done or as not available.

## code-world

| # | What | Why |
|---|---|---|
| 1 | **The file (your major, R3 / R10) is done in the data and the wave table; nothing is left for you there.** `tools/gen_layout.mjs`: `sp_file_10`, `sp_file_11` on flight 3 of the peg stair (wave `R`), `sp_file_12` a fourth behind the far door; `enc_file` waves `A`, `R`, `B`, composition 12. `src/world/director.ts`: `WAVE_RULES` `enc_file/R` { afterDownOf A, left 1, near `FILE_NEAR_REAR` 16 m of `door_gallery_far` (new rule field `nearOf`), nearTimeout 25 } and `enc_file/B` { afterSpawnOf R, delay `FILE_REAR` 4 s, burst `FILE_BURST` 1 s (was 2) }; two new rule fields (`afterDownOf`, `nearOf`), one read each in `planWaves` and where the gates are built. Tests: `tests/world/director.spec.ts` (two `enc_file` tests rewritten), `tests/world/polish_r4.test.mjs` (the ambush test rewritten) | careless proxy 72 / 54 / 0 HP (0 / 0 / 18 before), plain 0 / 0 / 0; Part I |
| 2 | `src/world/director.ts` `onTamperHit`: the fourth round in a row that the Tamper's plate turns says `hint_tamper_vent` once an attempt (Easy and Normal, hints on); `Enc.plateRun`, `Enc.plateHinted`, `TAMPER_PLATE_HINT` 4. `onBossPhase`: `bossBreak()` also at the break into phase 3a. Test: `tests/world/polish_r5.test.mjs` | the combat critic's minor (integration's) |
| 3 | **Yours to wire: the kept round's first hint tier.** The data exists: `hint_kept_1` ("Lead would not finish it. She had carried the other round eleven years.") in `design/story.json`, named `hint1` in the `lines` of the bore target marker (the `keptRoundTarget` puzzle element `kept.ts` already reads, next to `office` and `hint2`). `src/world/kept.ts` line 261 still says `this.lineOffice` at tier 1: read `named('hint1', ...)` there and keep `nar_office` for after the proof. If you prefer a wordless tier 1, leave the key unused: nothing tests for it | the playthrough critic: the pay-off line is spent early |
| 4 | `trg_enc_street` now lists `nar_kneeler` before `nar_plenty`: the kneeler line is on screen on the trigger's tick, 3 s before the kneeler stands (`scratch/r5-fixer/street_lines.log`). Your item (a) of "lines arrive after the thing they describe" is done; (b) the stone's lines on a quick take, (c) the watcher's and (d) the first knot's moot rules are code and still yours | story-ux |
| 5 | Not changed, data only I could have changed: `trg_stone.endAfterSeconds` stays 25 (your tests pin it; `ending.ts` reads it with `paramNumber(..., 25)`). If the story critic's "stepping back from the stone makes the choice for her" is on your list, the fix has to be in `ending.ts` (count only once she has left the ledge's north-west part, or once the rim's lines are over): the number cannot move after this pass | R5 |
| 6 | The e2e bot's file section ends on the clear and tidies in the next section (`tests/e2e/lib/page-play.js`): a packet beyond the far door walked her through `cp_hall_gantry` before `play()` had seen `cp_file_clear` | the death-at-every-checkpoint test |

## code-enemies

| # | What |
|---|---|
| 1 | No number of `src/enemies/defs.ts` was changed in this pass. The file's rear pair use the stair's own nav nodes (`n_gl` at (−86, −21, −10) and (−86, −17, −12)) and run the gallery at the Bider's 5.8 m/s: 60 m in about 10 s (`scratch/r5-fixer/proxy/t5_file_c1.log`) |
| 2 | **The stage's cap of six alive holds the fourth door Bider back** while the two rear ones, three at the door and the dormant Tamper are up (`allowed()` counts the Tamper in its vignette): it comes through as the first of them falls. That reads well (a straggler) and is left; if you would rather the dormant Tamper did not count against the file, that is yours |
| 3 | Yours, not touched: the Tamper's slam wind-up (+0.15 s on Normal was the playthrough critic's suggestion: the Tamper is the stage's peak, a 0.5 s-reaction proxy died twice to it) and the respawn into Windlass phase 2 (hold the first attack about 4 s; full health on Easy and Normal). Measured after this pass: Tamper plain 38 / 38 / 56 HP, careless 0 / 91 / 38, no deaths; Windlass 0 deaths in six legs |
| 4 | `BOSS.chargeRequiredAt` (world's row 2.2 of round 4): **ruled, stays 12 s.** No round-5 critic raised it and it also sets phase 3a's adds clock |

## code-ui

| # | What |
|---|---|
| 1 | `design/story.json` `ui_end_clean_six` now reads **"Six dry mouths, one cylinder"** (it was "A clean six at the last", which nothing in play explained). Five characters longer than the old label: look at the end card once at 4:3 |
| 2 | No new `ui_*` key was added (`tests/ui/text.spec.ts` fails on a key `src/ui` does not use). If the title's BEGIN-over-GO-ON fix needs words, none are available: make GO ON the highlighted item when a save exists, or ask with the existing `ui_menu_play` / `ui_menu_continue` |
| 3 | New lines the subtitle box will show: `nar_file_behind` (67 characters), `hint_tamper_vent` (66), `hint_kept_1` (71, once the world wires it). `nar_file_more` says "Four more" |

## code-render

| # | What |
|---|---|
| 1 | `tests/render/prewarm.test.mjs` "high: no program links in play from the title to the gallery" is killed by the memory watchdog (the browser reached 4 569 MiB, limit 3 584 MiB resident): `scratch/r5-fixer/gate/t_render.log`. The other 51 render tests pass. Not caused by this pass (the robustness critic saw it on the unchanged tree). Split the High leg or draw fewer frames |
| 2 | `cell_gallery`'s computed bound is now 119 000 triangles of 120 000 (two more static bodies and no more live ones: the alive cap is still six). Measured budgets are unchanged in kind; `KEEP7_REAL=all node --test tests/core/budget.test.mjs` passes |

## the look teams

| # | What |
|---|---|
| 1 | All 102 asset items were rebuilt against the final design data in this pass (487 s; `scratch/r5-fixer/build_assets.log`); `npm run check:assets` passes. A design file will not change again, so a rebuild after this is only your own sources |
| 2 | The gallery now stages a fight at both ends: two crowns come down the 60 m walkway from the bay while the far door bursts (`shots/r5-fixer/file_rear_pair.png`, `file_door_2.png`). The rear pair are two violet points at 35 m; the walkway's light is what makes them readable |
| 3 | The rows left open for round 5 by the round-4 closer are still yours: the flash below-left of the barrel (gun), the HUD backing over the hand (ui / gun), `ia_lift_cage` (props / underground), the gun in the blue hour (gun), the pocket beside `lh_ramp_cabinet` (level + interior art: **not moved in this pass**, a solid there moves the prop, the bake and the charge-stun bait, and could not be verified in the last round) |

## everyone

- `design/layout.json`: 268 markers. `design/assets.json` cell bounds recomputed (ARCHITECTURE 7.5 follows):
  `cell_gallery` 119 000, `cell_hall` 109 375, `cell_gallery_stair` 48 410, `cell_tally` 99 297, `cell_tally_seam`
  67 565 triangles (the stair's two spawn markers stand in a chunk the Tally cells can show; nobody is alive there
  while she is in the Tally House).
- The scripted playthrough: 29 775 ticks, 8.0 min, 85 rounds, 34 freed, 0 deaths, hash `d9519973`, the same on a second
  load. It changes with any change to the fights: the hash is pinned nowhere.
- A stale or malformed save is refused when read (`src/core/save.ts`) and never reaches `applySave`; what still cannot
  be applied is dropped with one `console.warn` line.

## Closer, polish round 5 (2026-10-06): decisions

All rows were taken by their owners (world 3: `hint_kept_1` wired; world 5: `LEAVE_MIN` 40; enemies 3: slam 1.15 s and the 4 s retry; ui 1, 2; render 1: `prewarm` paced) or stand as ruled (enemies 4). The pocket beside `lh_ramp_cabinet` and `ia_lift_cage` are known gaps of the handed-over game.
