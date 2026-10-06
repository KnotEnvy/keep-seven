# Requests from the cross-cutting fixer, polish round 3 (2026-10-04)

What the pass changed under the pieces, and what each piece owner must follow up. Evidence and numbers:
`docs/INTEGRATION_REPORT.md` Part E; log: `scratch/r3-fixer/NOTES.md`.

## code-enemies

| # | What | Why |
|---|---|---|
| 1 | **Tests that pin numbers this pass changed are red and are yours**: `tests/enemies/tamper.test.mjs` (4 tests: HP 600 arithmetic; it is 1 200 now: 575 -> 1175, 250 -> 850 -> 900 after one line round, "a second line round or two vent shots kill" is now three more line rounds or five vent shots) and `tests/enemies/file.test.mjs` "lane_street: wave C holds file" (the saddlery file is two: `sp_street_saddlery_3` is gone; wave B is four: `sp_street_alley_n`, `_s`, `_n2`, `_s2`). Already updated by this pass: `tests/enemies/logic.spec.ts`, `boss_p1.test.mjs`, `boss_p2p3.test.mjs` | ruling 27 |
| 2 | **Say `hint_boss_haul` at the first haul of EVERY try of phase 1 and 2, the first included** (drop the `B.deaths >= BOSS.mercyDeaths` gate at `src/enemies/boss/attacks.ts:98`; this pass could only lower `mercyDeaths` to 1, which also brings the x0.85 mercy forward to the first death). If mercy should stay at two deaths, split the number (`teachDeaths: 0`, `mercyDeaths: 2`) | R2: the rule is taught before it is needed. The parley now states it (`stn_parley_4`, `nar_parley_kept`), but a player who refuses the parley hears neither |
| 3 | **A shot into the glowing (discharging) stake mouth should read as the right thing, or count**: it parries (no pip). With the longer hauls the shoot-what-glows proxy wins, but about half its rounds are parries and deflects. Either one pip per parry, or keep the knot unlit until the haul so nothing vulnerable-looking deflects (critics' options) | R2, combat critic |
| 4 | **Pawls**: with `p2Haul` 6.5 s they still re-set at every haul end; consider keeping them burst for the phase (the combat critic's first option) if phase 2 still reads long to the next panel (measured 64 s per clean attempt) | R2 |
| 5 | **The Tamper's vents**: open the chest vent only in the last 0.4 s of the slam wind-up and the back vent only in `charge_stun` (critics). Not done here (logic). With 1 200 HP and Biders at 15 / 35 s the plain proxy takes 40 s and loses about 70 HP; a careless one dies once | R3 |
| 6 | **Bider body shots**: a stagger-then-rise on the first body hit was asked for; not done (logic + clip). The street now costs a careless proxy 18 HP and a plain (kiting) one nothing | R3 |
| 7 | **Transit `seek`** (never finds a player beside the yard door; can walk out of the yard): unchanged, yours | combat critic |
| 8 | New table numbers, for your notes: `ENEMIES.tamper.hp` 1200, `TAMPER.chargeEvery` 4, `BOSS.p1Haul` 5.0, `p2Haul` 6.5, `p2OpenGuaranteed` 4.5, `mercyDeaths` 1 (`src/enemies/defs.ts`) | |

## code-world

| # | What | Why |
|---|---|---|
| 1 | **`tests/world/director.test.mjs`: 3 tests pin the old wave numbers and are red** (street: cap 3 and B of two; yard: B at 40 s, B2 +6 s; Matador: 40 / 50 s). New numbers: `WAVE_RULES` in `src/world/director.ts` (street B `hitTimeout` 3 / `timeout` 8, C `timeout` 6; yard B `timeout` 14) and the layout (street max alive 5, B = four spawns, C = two; yard B2 delay 2, B3 delay 10; Matador B 15 s, C 35 s). Already updated: `tests/world/director.spec.ts`, `kept.test.mjs`, `polish_r2.test.mjs` (boxes 12 / 10 s) | ruling 27 |
| 2 | **Ammo floor**: let a Transit kill satisfy it as well (`decideDrop` returns '' for anything but a Bider). The yard tin now lies inside the yard (`pk_rounds_12_yard_gate` at (-84.6, 0, -1.9)), which ended the dry spell in the proxy runs, but the rule is still Bider-only | playthrough critic |
| 3 | **`hint_jugs_2_few`** exists in `design/story.json`: say it at T2 of `seven_jugs` with fewer than six down (your row 8.1.3) | |
| 4 | `nar_rim_4` is cut (merged into `nar_rim_3`); `trg_rim_arrive.params.lines` has three keys. `tests/world/story.spec.ts` uses the name only as a queue key (still passes) | story critic |
| 5 | The ending's 25 s timer, the lines that trail their events, the hint re-said after a death: yours (the panel's code-world issues); nothing was changed here | R5 |

## code-ui

| # | What |
|---|---|
| 1 | `ui_end_of` exists ("of"); `ui_pause_restart_cp`, `ui_hint_interact` reworded; `tests/ui/hud.test.mjs:344` and `screens.test.mjs:629-640` follow. Run `node --test tests/ui/` after your own changes |
| 2 | Core now pauses a game that is `playing` without the pointer lock for 45 ticks (`focus_lost`, after the lock has been asked for once). `closeSheet()` may still call `ctx.input.requestPointerLock()` when a readable closes without the lock: then the plate never shows on that path |

## code-render

| # | What |
|---|---|
| 1 | Core no longer feeds the adaptive controller while the game is not `playing`, nor for 30 frames after `load/set` and `world/staged`. Late program links in play still count: your `latelinks` gate stands |
| 2 | Allocation (5 kB per tick + frame, 58 % inside three: frustum per render call, bone-texture cache keys, mixers of dormant actors): not cut in this pass; `tests/core/alloc.test.mjs` keeps its 6 144 B limit |

## everyone

- **Gate commands run one at a time** on this machine (INTEGRATION_REPORT E.1). Every page of a browser launched through
  `tools/browser.mjs` now has a 120 s default timeout.
- `design/layout.json`: 264 markers (two new spawns, one removed and re-added as two: `sp_street_alley_n2`, `sp_street_alley_s2`;
  `sp_street_saddlery_3` removed). `design/assets.json` cell budgets recomputed (`cell_street` 115 381 triangles).

## Closer, polish round 3 (2026-10-05): decisions on the rows above

| Row | Decision |
|---|---|
| code-enemies 1 to 8, code-world 1 to 5, code-ui 1 to 2, code-render 1 to 2 | Followed up by the piece fixers (their own files' round-3 sections); what stays open is in INTEGRATION_REPORT Part F.6. The red tests named here are green: `tests/enemies` 59, `tests/world` 84 |
