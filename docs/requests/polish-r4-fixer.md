# Requests from the cross-cutting fixer, polish round 4 (2026-10-05)

What the pass changed under the pieces, and what each piece owner must follow up. Evidence and numbers:
`docs/INTEGRATION_REPORT.md` Part G; log: `scratch/r4-fixer/NOTES.md`; proxy runs: `scratch/r4-fixer/proxy/`.
No row of `docs/requests/*.md` was open against core, the design data, the story text or a contract when the pass
began (the round-3 closer decided them all; the four rows it left "open for round 4" are art's and render's, below).

## code-enemies

| # | What | Why |
|---|---|---|
| 1 | **The lift hall's gantry is a perch nothing can reach** (not touched here: logic). A player who starts `enc_matador` and steps back up stands 3 m over a Tamper in `advance` and Biders in `approach` for ever; the Tamper never slams or charges, so its vents never open. Give the ramp to the Biders' nav and give the Tamper an answer (a charge into the gantry's supports that staggers her, or a slam ring that reaches it), or ask code-world to shut the ramp foot when the encounter starts. Add the critic's test: 20 s on the gantry must cost health or force her down (`scratch/r4-combat/perch.mjs`) | R3; combat and playthrough critics (major) |
| 2 | Table numbers this pass changed in `src/enemies/defs.ts`: `ENEMIES.tamper.hp` 900 (1 200); new `TAMPER.slamVentLateBy` { easy 1.0, normal 0.6, hard 0.6 } read at `tamper.ts` `slam_windup` (`slamVentLate` is kept as Normal's value); new `TRANSIT.cooldownBy` { 1.5, 1.5, 1.2 } read at `transit.ts` `cooldown`; new `BOSS_BY` (Hard: phase-1 rest x0.5, stake speed x1.15) read at `boss/attacks.ts` (the slot's end) and `boss/index.ts` `fireStake`. Your tests that pinned the old numbers were updated: `tests/enemies/tamper.test.mjs` (900 arithmetic: 875, 850, 550, 700, 675; three line rounds or a line round and three vent shots kill), `transit.test.mjs` (cooldown 90 ticks), `logic.spec.ts` | R1 |
| 3 | Not done, yours if the next panel still asks: the line stagger 3.0 -> 1.8 s and the first charge sooner (critic's minor). With 900 HP the plain proxy's Tamper is 44 to 59 s and costs 0 to 91 HP with a line round, 37 s and 38 HP without | |

## code-world

| # | What | Why |
|---|---|---|
| 1 | `src/world/director.ts`: the Tamper's ammo floor repeats (`TAMPER_MERCY_EVERY` 10 s; `Enc.mercyWait`, `tamperFloor`), and a wholly dry player is given a packet a step out from `ia_line_locker_hall` with `cap_locker_chime`. `WAVE_RULES`: `enc_street/C` { left 2, timeout 2 }, new `enc_file/B` { hitTimeout 2 }. The `boss/pips` listener no longer recounts the Windlass's pips at every phase change (the end card's `KNOTS BURST` read 186 for 78 rounds; `pipPhase` is gone). Tests updated: `tests/world/director.spec.ts`, `director.test.mjs` (C two seconds after B), `kept.test.mjs` and `polish_r2.test.mjs` (boxes give 18; the packet repeats) | R1, R3; story-ux and robustness critics |
| 2 | **The file still costs nothing** in most runs (plain 0 / 0 / 0, careless 0 / 36 / 0 HP): nine Biders down 40 m of open corridor. What is left needs your logic or art: a near entrance for wave B (a floor grate in the walkway is a prop the gallery does not have), or B held behind `door_gallery_far` until she is inside 15 m | R3 |
| 3 | `nar_take_1` ("He had not taken hers. She had given it.") is said on the LEAVE branch too (`scratch/r4-playthrough/probe_leave2.log`); and at the climax `stn_boss_proven` trails the kept round by 10 to 15 s (story-ux critic). Yours | |
| 4 | New marker `ia_ammo_box_yard` (-80.25, 0, 3.2), facing west on the yard face of `yd_wall_e`; the bore's two boxes give 18. `sp_street_alley_n/_n2/_s/_s2` moved to the alley mouths nearest the gate | |

## code-ui

| # | What |
|---|---|
| 1 | `design/story.json` now has `ui_key_mouse_left` / `_middle` / `_right` ("Left click" ...), so `keyName('Mouse0')` reads "Left click" in the hint and the bindings list. `tests/ui/hud.test.mjs:344` and `screens.test.mjs:523` follow |
| 2 | Core: the pointer lock lost behind an open note pauses on the first tick of play (`focus_lost`), not after 45 ticks. If `closeSheet()` asks for the lock as it closes and the grant comes first, nothing pauses |

## art-weapons (the gun's look-dev), art-props-mech, code-render

| # | What |
|---|---|
| 1 | **Ruling on art-weapons row 8 (clip lengths, the eject beat, the kept load's hold):** the reload and `load_kept` clip durations may change in round 4 if `node --test tests/e2e/` stays green and deterministic afterwards (the hash is not pinned anywhere; the determinism test compares two loads) and GDD 6.9 is edited with the new numbers. The frozen 1 to 2 s hold at the start of `load_kept` is the visual and combat critics' finding and is yours |
| 2 | `ia_lift_cage` near-black under the bore mood, the cage mesh's high-frequency grid on both rides (art-env-interior 217; visual critic), `ia_yard_door`'s flat leaf (art-env-exterior 301): unchanged here, still yours |
| 3 | A cartridge point now hangs inside the yard door (`ia_ammo_box_yard`): look at it once in the yard's light (`shots/r4-fixer/yard_box.png`) |

## everyone

- `design/layout.json`: 265 markers. `design/assets.json` cell budgets recomputed (`cell_street` / `cell_yard` 115 781
  triangles, 72 / 79 calls; `cell_lip_gully` 80 666, 55 / 62: wave B now stands in sight of the gully cell).
  All 102 asset items were rebuilt against them.
- New test: `tests/e2e/goon.test.mjs` (reload + "Go on" at every checkpoint keeps the stored save). The scripted
  playthrough also plays the leave-the-round ending and bounds `KNOTS BURST`.
- Gate commands still run one at a time (Part E.1).

## Closer, polish round 4 (2026-10-05): decisions

| Row | What | Decision |
|---|---|---|
| enemies 1 | the gantry perch | closed by the enemies team (the Tamper climbs the ramp) |
| enemies 3 | line stagger 1.8 s | done by the enemies team; first charge sooner: declined by them |
| world 2 | the file | wave B is an ambush at the far door (world team); measured in Part H.3 |
| world 3 | `nar_take_1`, `stn_boss_proven` | the first ruled to stay; the second fixed by the world team (said at once on the shot) |
| art 1 | `load_kept`'s hold | re-staged by the gun team |
| art 2 | `ia_lift_cage`, `ia_yard_door` | open for round 5 |
