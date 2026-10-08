# Requests from the enemies code team, polish round 4 (2026-10-05)

What this pass changed in `src/enemies/`, the numbers the closer must mirror into the documents (lead rulings R1 and R3
outrank the GDD's figures), and what is asked of other owners. Log and evidence: `scratch/r4-team-enemies/NOTES.md`,
`scratch/r4-team-enemies/*.log`, `shots/r4-team-enemies/`. Tests: `tests/enemies/polish_r4.test.mjs` (three new),
`tamper.test.mjs` and `logic.spec.ts` (pins moved).

## 1. What changed, and why

| # | Issue | Cause found | Change |
|---|---|---|---|
| 1 | Major (two critics): the hall gantry is a perch nothing reaches | The ramp was already in the nav graph. A player on the gantry west of x = -17.5 is nearest to `n_gl_031`, the gallery's last node, which lies behind `door_gallery_far`: `enc_matador` shuts that door, A* found no route, and with no route every body walked straight at her into the plinth. Standing anywhere else on the gantry, a Bider or the Tamper that could see her above it also walked straight at her | `nav.ts`: `Nav.path(a, b, out, near)`; with `near` a goal that cannot be reached ends the route at the reachable node nearest to it, and `nextWaypoint` asks for that. `bider.ts`: straight at her only within `BIDER.directLevel` 1.2 m of her height, else the graph. `tamper.ts`: the same with `TAMPER.directLevel` 0.6 m. The Tamper climbs the ramp and charges or slams on the gantry |
| 2 | Minor: the Tamper costs nothing with a line round | Three faults behind the proxies' free wins, found by tracing them: (a) the two knots lie on one axis, so a lead round into the chest plate crossed the BACK knot's sphere: a Tamper stunned on a rib took 200 from in front; (b) any touch of a rib stunned a charge, a 0.13 m graze of a corner included: against a player at the ramp foot it stunned itself on five charges running, 17 m away; (c) a charge stopped by the cabinet left it wedged between cabinet, ramp side and plinth, walking into the cabinet 4.8 m from her for 26 s | (a) `TAMPER.ventSide` 0.3: an open vent takes lead only from its own side (not in the bulkhead vignette, where the round into the vent from the gantry is GDD 7.3's way to start the fight). (b) `TAMPER.grazeDepth` 0.25 m: a charge is stunned once walls have pushed it that far off its line; a shallower graze is slid past. The acceptance bait (a rib 0.3 to 0.5 m inside the lane) still stuns 20 of 20. (c) `TAMPER.unwedge` 3 s: held 0.5 s in `advance`, it walks the graph round. Also `TAMPER.lineStagger` 3.0 -> 1.8 s (the critic's number: at 900 HP a line round and three vent shots in one stagger were the whole Tamper) |
| 3 | Fairness, found while measuring 2 | Once it reliably arrived, a cornered plain proxy took three slams 2.9 s apart (114 of 100) and died six times the same way | `TAMPER.slamAfterHit` 1.5 s: after a slam that landed, no new attack starts until 1.5 s after its recover (a slam every 4.4 s on a player who stays put, not every 2.9 s). A slam that missed or was cancelled is followed as before |
| 4 | Minor: the second Transit stays blind in the yard doorway | `crowded()` makes a seeking Transit give way to one that already sees her, and it gave way for the rest of the fight | `transit.ts`: after `TRANSIT.passAfter` 6 s blind behind such a Transit it seeks on past it (`Actor.pass`), stepping round bodies, and plants where it sees her at least `passApart` 2.0 m from every other Transit; a pass that finds no place holds `passRetry` 12 s |

Not changed, and why: **the charge wind-up 48 -> 40 ticks** (the critic's other lever for 2). The aim of that issue is met
without taking 0.13 s off a telegraph: see the table below. **The locker packet at 6 rounds or fewer**: the fixer's
repeating floor in `src/world/director.ts` already gives it.

## 2. Measured (real game, Normal)

| What | Before | After |
|---|---|---|
| 90 s (critics) / 40 s (here) on the gantry at (-17.6, -12, -13.5) | 0 damage; Tamper `advance` under the plinth, no route (`perch_before.log`) | charge up the ramp hits at 17.6 s (35), slam 38 at 22 s, Bider lunge at 24 s, dead by 28 s (`perch_final.log`; frame `shots/r4-team-enemies/perch_after_19s.png`, opened: the Tamper beside her on the gantry) |
| Sandbox, door shut: Tamper alone / far corner (-13.8, -18.2) / two grate Biders | never / (not measured) / never | hurt at tick 996 / 1040 / 439 |
| Yard door, player at (-78.5, 4.3) on the street side, 70 s | transit#4 `plant` at (-80.5, -0.1), `sees=false` from tick 1200 on (critic's `tseek.log`) | transit#4 at (-77.4, 2.0), `sees=true` and firing from tick 1800; 2 m from transit#3 (`tseek_after.log`; frame `tseek_door_view.png`, opened) |
| Tamper, plain proxy, a line round (react 0.45 s, err 0.12) | fixer: 53 HP, 32 s of encounter | 38 HP, 24 s, 0 deaths (`e5_matP.log`) |
| Tamper, plain, no line round | fixer: 38 HP | 105 HP, 27 s, 0 deaths (`e5_matNL.log`) |
| Tamper, careless standing | fixer: 36 HP | 0 HP, 25 s (`e5_matC.log`): its cadence put a round in the chest vent on both slams |
| Five more proxy variants (`e5_var1..5.log`) | | 0, 38, 91, 0 HP with 0 deaths; one (no line round, 0.5 s, err 0.16) died three times the same deterministic way (it walked itself into the corner beside the cabinet and traded with the Tamper), then won with 33 HP lost |
| Street and yard, plain, one run (`e5_surfP.log`) | fixer: street 18 / 36 / 18 HP; yard 66 / 18 / 22 HP | street 18 HP in 40 s; yard 86 HP in 65 s; 0 deaths |
| Scripted playthrough | 28 837 ticks, 78 rounds, 29 freed, hash `6d90fc21` | 29 338 ticks, 82 rounds, 31 freed, 0 deaths, hash `bb778c4a`, the same on a second load |

Honest reading. The gantry and the doorway are fixed. The Tamper now costs health in 5 of 8 proxy configurations
(0 to 105 HP) where the first re-measure of this pass (line stagger alone) cost 0 in all line-round runs; it is still a
coin's edge for a proxy that fires on a fixed cadence (the 0.6 s vent window against a 0.77 s cadence), and the
encounter is short: 24 to 27 s from trigger to its death. Each configuration is one deterministic run: seeds do not
change these proxies. Not re-measured: Easy, Hard, whole runs from the title, the file, the Windlass (none of its
logic was touched).

## 3. For the closer: numbers to mirror into the documents

| Document | What |
|---|---|
| GDD 6.5 table, 6.7 table, 7.3 state table | `line_stagger` 1.8 s (was 3.0); "plays the stagger clip at half speed" becomes 1.5 / 1.8 of its speed. "So do one line round and two vent shots" (6.7) was already untrue at 900 HP: a line round and three vent shots kill |
| GDD 7.3 Armour / vents | an open vent takes lead only from its own side: the horizontal cosine between the round and the body's facing under 0.3 for the chest, over -0.3 for the back (`TAMPER.ventSide`); the bulkhead vignette is exempt |
| GDD 7.3 `charge` / `charge_stun` | stunned when a wall, a rib or the cabinet has pushed it 0.25 m off its line (`TAMPER.grazeDepth`); a shallower graze is slid past. "Any touch of a rib" is gone |
| GDD 7.3 `advance` | off her level (0.6 m) it walks the nav graph (the ramp); held 0.5 s, it walks the graph for 3 s (`TAMPER.unwedge`) |
| GDD 7.3 `slam` | after a slam that landed, no attack starts until 1.5 s after the recover (`TAMPER.slamAfterHit`) |
| GDD 7.1 | a Bider runs straight at her only within 1.2 m of her height (`BIDER.directLevel`), else the nav graph; a goal with no route is approached as far as the graph goes |
| GDD 7.2 | a Transit blind for 6 s behind one that sees her passes it and plants 2.0 m clear (`TRANSIT.passAfter`, `passApart`, `passRetry` 12 s) |
| INTEGRATION_REPORT G.3 / G.4 | the Tamper rows and the playthrough baseline above; "the gantry is still a perch" is closed |
| ARCHITECTURE (enemies) | `Nav.path(a, b, out, near = false)`; `Actor.pass` |

## 4. Asked of others

| # | Of | What |
|---|---|---|
| 1 | e2e owner (`tests/e2e/lib/page-play.js`) | Comment only: line 302 says "three seconds with both vents open": it is 1.8 s. The bot's `ventsOnly` aims at `vent_back` during `charge_stun` wherever she stands: from in front that is now plate (25, a clank). The playthrough is green and deterministic with it; a bot that steps behind it would spend fewer rounds |
| 2 | code-world / level | The dead corner between `lh_ramp_cabinet`, the ramp's side and the plinth (about (-14.7, -15, -5.7)) traps a player as well as it trapped the Tamper: one proxy walked into it and was slammed there three tries running. Worth a look by a person; the cabinet 0.6 m further from the ramp would close the pocket |
| 3 | code-world | The yard cost one plain proxy 86 HP (four stakes) in the single run made here, against 66 / 18 / 22 in the fixer's three. One run; the second Transit now joins a fight at the door after 6 s instead of never. If the next panel finds the yard too hard again, the lever is `TRANSIT.passAfter` |
| 4 | creatures look team | On the gantry the Tamper stands 1.0 to 1.6 m from her and fills the right half of the frame (`shots/r4-team-enemies/perch_after_19s.png`): the model is seen closer than it has been before |

## 5. Known gaps

- No person has played the Tamper since these changes; the proxies' variance is small and their mistakes repeat.
- The Tamper has no answer to a player it has no graph route to at all (there is no such place in this level now: the
  gantry was the only one).
- A Transit that passes another walks round it by steering only; in a doorway 1.2 m wide the two bodies overlap for a
  few ticks while it passes.

## Closer, polish round 4 (2026-10-05): decisions

| Row | What | Decision |
|---|---|---|
| 3 | numbers | mirrored: GDD 6.5 / 6.7 / 7.3 `line_stagger` in place; 7.1, 7.2, 7.3 in GDD 23.8; ARCHITECTURE 8.1 note (`Nav.path`, `Actor.pass`); INTEGRATION_REPORT Part H |
| 4.1 | the bot's comment and `ventsOnly` | comment fixed (`tests/e2e/lib/page-play.js`); the bot's aim is left as it is (green, deterministic, 4 rounds dearer) |
| 4.2 | the pocket beside `lh_ramp_cabinet` | **Open for round 5** (level + interior art + nav: moving a solid moves the prop, the bake and the charge-stun bait). Listed in the report's known gaps |
| 4.3 | the yard after the passing Transit | measured at the close: Part H.3 |
| 4.4 | the Tamper seen at 1 m on the gantry | not judged by a look team this round (no creatures team reported); the Tamper at 3 to 5 m is `shots/round-4/hero_08.png` |

---

# Polish round 5 (2026-10-06): the enemies team

Three minors from the fresh critics, all closed in `src/enemies/`. Log: `scratch/r5-team-enemies/NOTES.md`; legs:
`scratch/r5-team-enemies/a_*.log` (after), `b_mat_3.log` (before). Tests: `tests/enemies/polish_r5.test.mjs` (3).

## 1. What changed

| # | Issue | Change | Proof (Normal, real game, plain-skill proxies) |
|---|---|---|---|
| 1 | The Tamper, not the Windlass, was the peak | `TAMPER.slamWindupBy` { easy 1.15, normal 1.15, hard 1.0 } s before `telegraphScale` (it was 1.0 on all three). The chest vent's window is unchanged (the last 0.6 s; Easy the last 1.0 s); the clip is played slower by the ratio. The Windlass was left alone | 0.5 s-reaction proxy: 2 deaths (slam 178 + charge 70) before, 0 deaths and 17 HP left after; 0.45 s: 34 HP left (22 before); default: 49 HP; careless: 34 HP. 28 to 32 s, 17 to 21 rounds, 4 to 5 + 5 to 9 rounds left, never dry |
| 2 | A respawn into Windlass phase 2 killed a player who paused | A restore into `p1`, `p2` or `p3a` holds the first attack `BOSS.retryLead` 4.0 s (it was 1.5; adds wait with it), and on `player/respawned` she is given full health on Easy and Normal (`BOSS.retryFullHealth`; canteens through `PlayerApi.givePickup`, the way the world's phase floor is given). Hard: 4 s, no health | The standing proxy comes back on 100 (67 before) and is first hurt after 4 s; if it never moves at all it still dies, at 13 to 15.5 s (9.4 to 10.3 before). Moving proxy: phase 1 51 s, phase 2 62 s, 0 deaths |
| 3 | HAULING. announced after the Windlass is dead | Phase 3b says its two `stn_boss_hauling` and `nar_hauling` only when the line box has stood free 0.5 s (`BOSS.dryLineQuiet`; the module hears `story/line` / `story/line_end`), so none is ever queued; the kill overtakes any not yet said | `a_climax.log`: dead 25.6 s, `stn_service` 25.6, `stn_thanks` 30.4, next line `nar_lift_up` 42.7 (before: HAULING 9.5 s after the death) |

Scripted playthrough after these: 30 378 ticks, 8.2 min, 86 rounds, 36 freed, 0 deaths, hash `7b6c1fb9`, same on a second
load; 17 of 17 restores (measured while other teams were still editing: the closer's number is the one to print).

## 2. For the closer: numbers to mirror into the documents

| Document | What |
|---|---|
| GDD 7.3 `slam` (state table and attack table), GDD 15 | slam telegraph 1.15 s on Normal, 1.38 s on Easy (1.15 x 1.2), 0.9 s on Hard (1.0 x 0.9, as before). Vent open for the last 0.6 s (Easy 1.0 s) |
| GDD 8.3 (respawn in the Windlass) | a retry of phase 1, 2 or 3a: 4 s before the first attack; full health on Easy and Normal. "The fight resumes within 3 s" now means control, not the first attack |
| GDD 8.2 phase 3b | the two HAULING lines and `nar_hauling` are said only into a free line box; a player who kills it within about 10 s of HEAD DRY hears none of them |
| GDD 4.2 / 6.7 measured curve | Tamper 28 to 32 s, 56 to 83 damage to plain proxies, 0 deaths in four legs; Windlass P1 51 s, P2 62 s from a checkpoint start (4 s of it the lead-in) |

## 3. Asked of others

| # | Of | What |
|---|---|---|
| 1 | code-world (`src/world/director.ts`, next to the other `story.unless` rules) | Belt and braces, one line: `s.story.unless('stn_boss_hauling', () => bossDead)` and the same for `stn_boss_indexing`. Not needed for the case the critic saw (the enemies no longer queue the line), but a HAULING said in the last second of phase 3a's haul could in principle still wait behind the proof's lines |

## 4. Known gaps

- A player who stands still for the whole of phase 2's first pattern after a respawn still dies (13 s). Nothing short of
  switching the pattern off saves her; one step in those 13 s does.
- On Easy the slam's vent still opens for the last 1.0 s of a 1.38 s wind-up, not "the whole wind-up" the round-4 note
  says (it was 1.0 of 1.2 before this round too).
- No person has played the Tamper with the longer tell; four proxy legs, whose mistakes repeat.

## Closer, polish round 5 (2026-10-06): decisions

| Row | Decision |
|---|---|
| 2 (numbers to mirror) | **Mirrored**: GDD 7.3 `slam_windup` and section 15 (1.15 / 1.38 / 0.9 s), 8.3 (retry 4 s, full health on Easy and Normal), 8.2 phase 3b (HAULING only into a free line box), 23.10; LEVEL 12 |
| 3.1 (moot rule for `stn_boss_hauling` / `stn_boss_indexing`) | **Not applied**: a guard for a case nobody has seen; the story queue is not touched unverified in the last hour. Listed as a known gap |
| 4 (standing still in phase 2 after a respawn) | **Stands** as a known gap (INTEGRATION_REPORT J.6) |
| the slower `slam_windup` clip as a picture | not judged by a look team; listed |

## Fixer, release pass p0 (2026-10-07): decisions

| Row | Decision |
|---|---|
| "Hard plays almost like Normal" (the combat critic) | **Applied by the fixer in your tables** (listed so you know): `src/enemies/defs.ts` new `TAMPER.slamRecoverBy` `{ easy 1.5, normal 1.5, hard 1.275 }` and `BOSS_BY.*.glowScale` (`hard 0.85`); read in `tamper.ts` (two places that read `TAMPER.slamRecover`) and `boss/attacks.ts` (`fireSlot` and the pattern's slot clock). Normal and Easy are tick-identical (`tests/e2e/release_p0.test.mjs`; `tests/enemies` 65 pass). `SLAM_CYCLE` (the unseen-attack delay) still uses 1.5 on every difficulty. Not replayed by a proxy on Hard: yours to judge |
| hint after a death at the Tamper | **Key added**: `hint_tamper_ring` "The ring on the floor was where the arm came down. She stepped out of it." |
| the phase-2 hint never says to move | **Key added**: `hint_boss_move` "Standing still was the one thing it could hit. The ribs were cover." for the second death in phase 2 |

## Code team enemies, release pass p0 (2026-10-07): the five open issues of the final reviewers

Evidence: `scratch/p0-team-enemies/` (`NOTES.md`, every log named below), `shots/p0-team-enemies/parley_02_boss_inspection.png`.
Tests: `tests/enemies/release_p0.test.mjs` (6 new), `tests/enemies/logic.spec.ts` (1 new, 1 updated for the fixer's
tables); `node --test tests/enemies/` 71 pass, `npx vitest run tests/enemies` 22 pass, `npx tsc --noEmit` clean.

### 1. What changed

| # | Issue | Cause found | Change | Proof (real game, Normal unless said) |
|---|---|---|---|---|
| 1 | The file is free for a player who shoots straight | (a) the rear pair run 57 m and reached her 1.9 s after the door's four, so the two ends were shot in turn; (b) a `circle` Bider trailed a player who walked on at 4.5 m, outside the 3.8 m it attacks from, for as long as she walked (206 ticks through a whole reload in the critic's leg) | `BIDER.hurryWaves` `{ 'enc_file/R' }` (or a spawn marker with `hurry: true`): x `hurrySpeed` 1.3 while more than `hurryBeyond` 18 m off AND outside her view cone, else 5.8 m/s. `circle` -> `approach` when a melee token is free and she is beyond 3.8 m | `a_file*.log`: plain proxy 18 / 18 / 0 HP (was 0 / 0 / 0), careless 54 / 72 / 36 (was 72 / 72 / 72), 0 deaths, 28 to 33 s; Hard plain 25. The rear pair's first wind-up 0.25 s after the fourth of the door goes down (was 0.7 s, with the second of the pair never attacking) |
| 2, 3 | The Tamper is the dearest fight / swings between harmless and nearly lethal | the pause after a slam that hurt her (`slamAfterHit`) was applied where the `slam` state ended; a round into the open chest vent in those 0.3 s (the right answer) staggered it and skipped the pause: the next ring was down 1.8 s after the hit (three slams, 108 of 100, in both critics' runs). And the only teaching was dying | the pause is a time on the body (`Actor.quietUntil`), set on the tick the slam hurts her; no stagger shortens it. From the second slam in a row that hurt her the pause is `TAMPER.slamAfterRun` 4.5 s on Normal and Easy (Hard 1.5): the next ring is laid as the hint ends. `hint_tamper_ring` is said on the second slam of a fight, and 1 s after the respawn that follows a death to a slam. `slamRadius` stays 3.5 | `c_mat*.log`: plain 76 / 76 / 0 (was 105 / 76 / 18 from the checkpoint, 108 / 107 / 184 + a death continuous), careless 0 / 38 / 76 (was 0 / 56 / 38, and 147 + a death in the closer's run): never more than two slams. The critic's mid-skill proxy that never moves (`matMid_3`): 5 deaths in a row before, 0 after (`b_matMid_3.log`). Hard plain: 0 / 105, 0 deaths |
| 4 | Windlass phase 2 kills a standing player every 11 s under a hint that never says to move | (a) **polish round 5's 4 s retry lead never ran after a real death**: the game applies the save and THEN resets the encounter and begins the boss again, and that second beginning was a first arrival's (1.5 s): first discharge 2.32 s after the respawn (`stand_p2.log`); (b) `hint_boss_haul` was said at every try's first haul, cut off by the death and replayed by the line box at the respawn: four readings by the third try | `Boss.retryOf` / `applyRetry`: the retry survives the encounter reset. From the second death in one cylinder phase (`BOSS.moveDeaths`): lead-in `retryLeadLate` 6.5 s, `hint_boss_move` said 0.5 s after the respawn (the first attack waits until it has been on screen 4 s, 11 s at most). The teaching line is said once per phase of a run, not on every try | `stand_p2_after.log` (she never moves or fires): respawn 1: first discharge after 4.82 s (2.32 before); respawn 2: `hint_boss_move` on screen after 0.52 s, first discharge after 7.32 s, death 16.2 s after the respawn (11.2 before). Moving proxies (`c_boss*.log`): plain 0 deaths in 3, P1 50 s, P2 46 to 74 s; careless 1 death in 3 (P2, then cleared in 62 s); Hard plain 0 deaths in 2 |
| 5 | The parley text runs 9 s behind the boss | the stages ran on a clock while their lines waited behind `nar_cradle_2` and `stn_ask_done` | the asking follows its lines as SHOWN (`story/line`): each line is asked for when the one before has been on screen its written time, the six mouths open on the tick `stn_parley_4` appears, the close and `nar_parley_kept` 4 s and phase 1 5 s after it; after a kept asking the first tell waits `parleyKeptLead` 4.5 s. A line never shown holds its stage `parleyLineWait` 14 s at most; with nothing showing lines (the sandboxes) the written clock runs unchanged | `parley_after.log` (the critic's leg): door 29.0 s; `stn_parley_4` 60.7 = inspection 60.7; shut 64.7; phase 1 65.7; `nar_parley_kept` 66.0; first stake 71.1. Before: six open at 52.0 under the roll-call, phase 1 at 57.0, the teaching line at 60.7, the narrator at 66.0. The frame: `shots/p0-team-enemies/parley_02_boss_inspection.png` |

The test bot's whole run after these (`scratch/p0-team-enemies/whole.mjs`, twice, a browser each): 31 114 ticks, 8.64 min,
88 rounds, 0 deaths, no god mode, hash `272ab932` both times (other teams were still editing: the closer's number is the
one to print).

### 2. For the closer: numbers to mirror into the documents

| Document | What |
|---|---|
| GDD 7.1 state table, `circle` | leaves to `approach` when a token is free and she is more than 3.8 m off (it no longer trails a walking player) |
| GDD 7.1 / 10 `enc_file` | the rear pair (wave R) run 7.5 m/s (5.8 x 1.3) while more than 18 m from her and outside her view cone, 5.8 m/s otherwise. Measured: plain 18 / 18 / 0, careless 54 / 72 / 36, Hard plain 25 |
| GDD 7.3 `slam`, GDD 15 | after a slam that hurt her no attack starts for 1.5 s past its recover, whatever interrupts it; 4.5 s from the second in a row on Normal and Easy. `hint_tamper_ring` on the second slam of a fight and 1 s after a respawn that follows a slam death. Measured: plain 76 / 76 / 0, careless 0 / 38 / 76, 42 to 50 s |
| GDD 8.1 | the asking is paced by its lines as shown; the inspection opens when `stn_parley_4` appears; phase 1 five seconds later; its first tell 4.5 s after that. Walking straight in from the cradle it is about 37 s from the door to phase 1 (28 s when the line box is free) |
| GDD 8.3 | a retry holds its first attack 4 s (now also after a death, not only after "Go on"); 6.5 s and `hint_boss_move` from the second death in one cylinder phase; `hint_boss_haul` once per phase of a run |
| INTEGRATION_REPORT "Legs started from cp_boss_p1/p2/p3 have a 4 s lead-in" | true for a death as well now |

### 3. Asked of others

| # | Of | What |
|---|---|---|
| 1 | code-world (`src/world/checkpoints.ts`, in progress in this pass) | `cp_boss_proven` is saved twice (at the proof and again when the Windlass dies): `tests/e2e/playthrough.test.mjs` "every checkpoint, once, in order" fails on it. Not caused by `src/enemies` (`scratch/p0-team-enemies/proven.mjs` output in `NOTES.md`): either the second save is meant and the test's list changes, or it is not |
| 2 | code-world (`src/world/director.ts`) | nothing needed for the file now. If the rear pair is ever re-timed there (`FILE_REAR`), remove `'enc_file/R'` from `BIDER.hurryWaves` in the same change, or the pair arrive first |
| 3 | level design (`design/layout.json`, frozen for this pass) | a spawn marker may carry `hurry: true`; `sp_file_10` / `sp_file_11` could then say it themselves and the table in `defs.ts` go |
| 4 | whoever owns `tests/core` | with `KEEP7_REAL=all` five tests fail on this tree, none in `src/enemies` (`scratch/p0-team-enemies/core_real.log`): `boot.test.mjs` x2 (21 textures against an expected 18: the three new view-model textures), `budget.test.mjs` "assertBudget fails a frame that is over", `seam.test.mjs` (55.28 MiB measured, the manifest says 63.3), `stubs.test.mjs` "startServer pieces" (the page with every slot stubbed is not ready in 120 s; repeated alone, same) |

### 4. Known gaps

- A player who never moves still dies in phase 2 (16 s after the respawn instead of 11) and to the Tamper's third slam;
  what changed is that she has been told, in time to act on it.
- The hurry rule is seen if she turns to look at the rear pair mid-run: they drop from 7.5 to 5.8 m/s at 18 m or more. Not
  judged as a picture (the look teams work after this pass).
- No person has played these fights; the proxies see everything round them at once. The careless proxy died once in
  phase 2 (seed 1), where it had not in the final review; the other five boss legs match or better their earlier damage.
- Easy was not run by a proxy in this pass.

## Closer, release pass p0 (2026-10-07): decisions on this file's p0 rows

Evidence: `docs/INTEGRATION_REPORT.md` Part K, `scratch/p0-closer/NOTES.md`, `scratch/p0-closer/gate/`.

| Row | Decision |
|---|---|
| Section 2, numbers to mirror | **Applied**: GDD 23.12 (7.1, 7.3, 8.1, 8.3, the file), INTEGRATION_REPORT Part K |
| 3.1 `cp_boss_proven` saved twice | **Closed, no change needed**: the world's second save is silent (no `checkpoint/saved`); `tests/e2e/playthrough.test.mjs` passes on the final tree (31 114 ticks, hash `53fa8759`) |
| 3.2 `FILE_REAR` and `hurryWaves` | Noted; nothing re-timed in this pass |
| 3.3 `hurry: true` on the spawn markers | **Ruled, not applied**: the layout was frozen for this pass; the table in `defs.ts` stays |
| 3.4 `tests/core` under `KEEP7_REAL=all` | **Fixed**: 76 pass, 0 fail. Texture counts 18 -> 21 and bytes, the budget bounds 77 / 83 / 119 931, the view-model's three meshes; the stub build's boot (an import cycle, `src/core/coreOf.ts`) |
| Section 4, known gaps | Carried into `docs/KNOWN_ISSUES.md` |

## Closer, pass i1 (2026-10-07): one edit in this team's file

The team was not active in pass i1. **`src/enemies/bider.ts`, two places** (ruling R11; INTEGRATION_REPORT M.1 row 1):
at the end of the rise the Bider's last-known place is her position now (it was the position she had when the Bider was
put in its seat, for the Tally House's risers a point in the street behind the door the fight shuts), and in
`approachVelocity` a Bider that has reached the end of its route to a last-known place without seeing her takes her
position as the next one. Test: `tests/e2e/i1.test.mjs` "a riser that cannot see her as it stands ... still comes for
her". `tests/enemies/` 71 pass. The playthrough's hash changed (`a800634c` to `f0d0f8ff`), its length did not.


## Pass i3, team enemies (2026-10-07): "Thirty seconds of standing through the parley"

Evidence: `scratch/i3-team-enemies/` (`NOTES.md`, `leg_ante.mjs` / `.log`, `lamps_skip.mjs` / `lamps_skip_low.log`,
`playthrough.log`), `shots/i3-team-enemies/lamps_low_*.png` (opened), `tests/enemies/i3.test.mjs`.

### 1. What was found, and what changed in `src/enemies`

Reproduced by input from `cp_bore_ante` (`leg_ante.log`): the seal, `stn_parley_1` on screen 2.08 s later (behind
`nar_cradle_2`), the inspection at 24.92 s, phase 1 at **29.92 s**. All of it is text: 5.5 + 4.5 + 4.5 + 3.5 + 3.5 s of
lines held one at a time with 0.25 s between two, then the 4 s inspection and 1 s. **The length of a line on screen is
not this module's**: `src/enemies` can only ask for a key (`story/say`); the hold is `design/story.json` `seconds` or
`src/world/director.ts` `story.hold()`, and the line box is serial. So the first hearing cannot be made shorter from
this folder (rows 2.1 and 2.2 below are what makes it shorter). What this pass did:

| | Change | Proof |
|---|---|---|
| a | **The asking's clock is read from the story data and from the lines as shown** (`boss/parley.ts` `parleyPlan`, `shown`). A stage lasts exactly as long as its line is held: the `seconds` that `story/line` reports (the world's hold), or `story.json` `seconds` where nothing shows lines. A key the data does not carry is not asked for. The table `BOSS.parley` is now only today's text written out (and the 4 s window, the 1 s after). **A text or hold change needs no code change here.** | `tests/enemies/i3.test.mjs` test 1: today's holds 22.75 s to the inspection and 27.75 s to phase 1 with a free line box; every hold shortened by the box alone (3 / 4 / 4 / 3 / 3) 18.25 and 23.25 s; **the reviewer's text (one roll-call line of 4.5 s, a 3.5 s first line, `stn_parley_3` gone) 18.0 and 23.0 s**. `tests/enemies/logic.spec.ts` "pass i3". With today's data nothing moved: the real leg is tick for tick the reviewer's (3 525 ticks, phase 1 at 29.92 s) and `tests/world/i2_real.test.mjs` passes unchanged |
| b | **The roll-call is shown** (the reviewer: "while the six chambers light in turn"). The six mouth lamps are dark from the seal and come on one by one as their chambers are named, at the middles of equal parts of each roll-call line as held (0.58, 1.75, 2.92 s into a 3.5 s line of three), each with a small tick (`listen_tick`, gain 0.7, pitch 0.75: `BOSS.rollTickGain` / `rollTickPitch`). All six are lit when the six open. With one merged line the six come on across it | test 1 (order, the ticks, all six before the inspection, the merged case); the real game `leg_ante.log` (ticks at 17.97, 19.13, 20.30, 21.73, 22.90, 24.07 s); `shots/i3-team-enemies/lamps_low_0_seal.png` (dark), `_1_two.png`, `_2_five.png`, `_3_inspection.png` |
| c | **A second hearing can be cut short.** Once an asking has been heard out or refused in this page, or a fight past it was restored (`Boss.askedBefore`; a new run does not forget it), a shot before the inspection is **not a refusal**: the lines between are passed over, `stn_parley_4` is asked for at once and the six open when it comes on screen (behind the line that is up, 5.5 s at most). The gift of two is still hers; a second impatient shot changes nothing; left alone the asking runs whole. A first hearing is unchanged (a shot refuses) | test 2; the real game (`lamps_skip_low.log`): a jump back to `cp_bore_ante` in the same page, one real shot 2.03 s after the seal: inspection at **5.75 s**, phase 1 at **10.75 s** (27.82 s unskipped in the same run), no `stn_parley_refused` |

Not changed, and why: the 4 s the six stand open (the gift needs it), the 1 s after, and `parleyKeptLead` 4.5 s (release
pass p0: the first chamber must not glow under `nar_parley_kept`). Moving phase 1 to the tick the six shut would move a
label and the checkpoint by 1 s and nothing a player does or sees.

### 2. Asked of others (the first hearing's 20 s is here)

| # | Of | What | Effect (free line box; add up to one line's wait at the seal) |
|---|---|---|---|
| 1 | closer / story (`design/story.json`, `design/layout.json`: frozen for this team) | Merge `stn_parley_2` and `stn_parley_3` into one roll-call line of about 4.5 s under the key `stn_parley_2` (wording is the story owner's; it must still name stake, stake, canister twice), and remove `stn_parley_3` from `story.json` and from `trg_enc_windlass` `params.parley`. Give `stn_parley_1` 3.5 s (or cut it to its formula) | seal to inspection **22.75 -> 18.0 s**, to phase 1 **27.75 -> 23.0 s**. Each further second taken off `nar_parley` / `rv_ask` (4.5 s each, nine words each) is a second off both. `src/enemies` needs no change |
| 2 | code-world (`src/world/director.ts`, active in this pass) | Without touching text: `s.story.hold('stn_parley_1', 3.5)` beside `PARLEY_ROLL_HOLD` | 2 s off at once; the Windlass follows the hold as shown |
| 3 | code-world | At the seal `stn_parley_1` waits out `nar_cradle_2` (2.08 s for the test player who walks straight in from the cradle). `opening` could cut a narrator line that has had most of its time, or the cradle's second line could be gated so it is not begun in the last steps before the door | up to 2 s |
| 4 | whoever applies row 1 | Tests that pin today's six lines and their times, to be edited with the data: `tests/enemies/boss_p1.test.mjs` ("the asking": the line list and `[0, 5.5, 10, 14.5, 18, 21.5, 25.5]`), `tests/enemies/release_p0.test.mjs` (`LINES`, `want`, 1 290 / 1 590 ticks), `tests/enemies/i3.test.mjs` (the "today" block; its "merged" block is then the real one), `tests/enemies/logic.spec.ts` (`PARLEY_LINES`, "pass i3"), `tests/world/i2_real.test.mjs` (21.5 / 26.5 s and the two 3.5 s roll-call lines), and the written table `BOSS.parley` in `src/enemies/defs.ts` (a fallback only; `parleyPlan` skips a key the data lacks) | |
| 5 | core (a persisted profile, not a save) | "An asking has been heard" is remembered per page, not across a reload: `EnemiesSave` is a contract and `src/enemies` writes no storage of its own. A boolean in the stored options/profile would let the skip of 1c work on a second play after a reload | |
| 6 | underground look / boss art | The six mouth lamps are a few pixels each at 720p (`lamps_low_1_two.png`): the roll-call reads if looked for. Larger or brighter lamp cards would make it read at a glance. No logic depends on it | |

### 3. For the closer: numbers to mirror into the documents

| Document | What |
|---|---|
| GDD 8.1 | the asking's stages last as long as their lines are held (data-driven); the six mouth lamps are dark from the seal and come on in turn under the roll-call; on a second hearing in one page a shot before `stn_parley_4` skips to the inspection instead of refusing (first hearing unchanged) |
| GDD 8.1 / 23 timing table | unchanged until row 2.1 or 2.2 is applied: 22.75 s to the inspection and 27.75 s to phase 1 with a free line box, 24.9 and 29.9 s for the test player |
| `docs/KNOWN_ISSUES.md` | the first hearing is still about 28 to 30 s unless rows 2.1 / 2.2 are applied; the skip is per page |

### 4. Known gaps

- **The first hearing is not shorter today.** With rows 2.1 and 2.2 it is 23 s to phase 1 and 18 s to the first thing to
  do; 20 s to phase 1 needs about 3 s more off the text, which is a story decision.
- Nothing on screen says that a shot skips a second hearing; it is the gesture an impatient player makes.
- The skip waits for the line that is up (5.5 s at most): cutting it needs the world's `sayNow`, which a `story/say`
  from another system does not reach.
- The whole playthrough ran green and deterministic on the shared tree (`playthrough.log`: 31 119 ticks, hash
  `18ba953c`, the same on a second load) while other teams were editing; the closer's number is the one to print. This
  team's own leg from `cp_bore_ante` is tick for tick what it was (3 525).

## Closer, pass i3 (2026-10-07): decisions

| Row | Decision |
|---|---|
| 2.1 merge the roll-call, 3.5 s first line | **Applied.** `design/story.json`: `stn_parley_2` = "ONE, TWO: STAKE. THREE: CANISTER. FOUR, FIVE: STAKE. SIX: CANISTER." (67 characters, 4.5 s), `stn_parley_3` removed, `stn_parley_1` 3.5 s, `nar_parley` and `rv_ask` 4 s; `trg_enc_windlass.params.parley` is five keys. With a free line box: 17.0 s to the open mouths, 22.0 s to phase 1 |
| 2.2 the world's hold | **Applied with 2.1**: `PARLEY_FIRST_HOLD` 3.5, `PARLEY_ROLL_HOLD` 4.5 (the data carries the same seconds) |
| 2.3 the wait behind `nar_cradle_2` | **Not done**: a narrator's line is never cut (GDD 12.1) |
| 2.4 the tests and `BOSS.parley` | **Edited with the data** by the closer: `tests/enemies/logic.spec.ts`, `boss_p1.test.mjs`, `release_p0.test.mjs`, `i3.test.mjs`, `tests/world/i2_real.test.mjs`; `BOSS.parley` = { 0, 3.5, 7.5, 11.5, line4 16, windowEnd 20, phase1 21 } and `PARLEY_LINES` is five rows |
| 2.5 a persisted "an asking has been heard" | **Declined for this release** (a core contract change); the skip is per page: `docs/KNOWN_ISSUES.md` |
| 2.6 larger lamp cards | **Not done** (the boss asset; no team owned it in this pass): `docs/KNOWN_ISSUES.md` |
| 3 documents | Mirrored: GDD 8.1 (in place) and 23.17 |
