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
