# Requests from code team "world", polish round 4 (2026-10-05)

What the world team changed against the fourth critic panel, the numbers and behaviours that now differ from the
documents (for the closer to mirror into `docs/GDD.md`, `docs/LEVEL.md` and `design/layout.json` texts), and what it
needs from other owners. Log and evidence: `scratch/r4-team-world/NOTES.md`; images: `shots/r4-team-world/`; tests:
`tests/world/polish_r4.test.mjs` (8 new), `tests/world/director.spec.ts`. Everything here is in `src/world/` only.

## 1. Behaviour and numbers that changed (lead rulings R1, R3, R5): mirror into the documents

| # | Where it is written now | What the game does now | Why |
|---|---|---|---|
| 1 | GDD 10 `enc_file` row, GDD 23.7 / 2064, LEVEL.md encounter row, `layout.encounters[enc_file].waves[B].when` ("2 s after wave A is first hit ... or 4 s after the sixth ... or 25 s after the turn") | **Wave B is an ambush at the far door.** Once the file is down to one, the three are let go (spawned behind the shut `door_gallery_far`, `nar_file_more`, a bang on the door, `cap_bider_rattle`) when she comes within **12 m** of that door (`FILE_NEAR`), or **25 s** after the file was down to one if she never walks down the gallery. They gather abreast behind the door and it **bursts open 2 s later** (`FILE_BURST`). With the file still standing no wave B comes on any clock. `src/world/director.ts` `WAVE_RULES['enc_file/B']` { left 1, near 12, nearTimeout 25, burst 2 }; the layout's `afterWaveDownSeconds 4` / `orAtSeconds 25` are no longer read for this wave | R3: both critics measured the file at 0 HP in every run; the three crossed 40 to 60 m of corridor in her sights. Measured after (Normal, three seeds): a careless player who walks on 18 / 0 / 36 HP, one who stands when the line is said 0 / 0 / 18, the plain proxy 0 / 0 / 0, 24 s, no deaths (`scratch/r4-team-world/proxy/f_*.log`); frame `shots/r4-team-world/file_ambush.png` |
| 2 | GDD 8.2 phase 3a ("at phase start + 12 s, or at the first relight: `stn_boss_charge_required`, then `nar_one_left`") | The world says `stn_boss_charge_required` then `nar_one_left` **1.5 s** into phase 3a (`kept.ts` `ASK_AFTER`), unless the band is already broken. The Windlass's own ask at 12 s still happens (it starts the HUD pulse and the hint ladder, and repeats the station line). Both lines are dropped unheard once she has pressed `F` | story critic (major): "the station only asks for the charge 12 s into phase 3a" |
| 3 | GDD 6.6 rule 3 and 8.2 "Hints" ("a player who presses `F` before T1 hears `nar_office` then, queued behind `nar_seal`") | On the press `nar_seal` goes on screen **at once**, over whatever line is there (it waited 5 s behind `nar_one_left`); `nar_office` is no longer queued on the press: it follows `nar_kept` after the proof (or comes from the ladder's first tier if she waits) | story critic (major) |
| 4 | GDD 8.2 "The seventh" steps 5 and 6 ("four seconds of true silence ... `nar_kept`. 6. `stn_proven`"), "Phase 3b: `stn_dry`" | On the shot: the lines still waiting about the fight are dropped (never a load-bearing one), and **`stn_proven` is said at once** (next, if a narrator line is on screen). When phase 3b begins (4 s): **`stn_dry`**, then `nar_kept`, then `nar_office` if unheard, next in line and in that order. The world says `stn_dry` itself (the Windlass's `story/say` for it is ignored), so it is never lost to a full queue. `cap_water_below` comes when both the 4 s and "BORE PROVEN." are over. Measured, human-paced, real game: station asks at 1.5 s (12.0); `F` at 17.5 s, `nar_seal` 17.5 s (22.5); shot at 23.5 s, "BORE PROVEN." 23.5 s (38.9); "HEAD DRY." said (never before) | story critic (major): `scratch/r4-team-world/climax.log` against `scratch/r4-story-ux/climax.log` |
| 5 | GDD 9.8 / LEVEL.md 7 (the stone's four lines, the rim's three) | **Take branch:** of the stone's lines not yet started only `nar_stone_1` is kept (`nar_stone_2..4` described a round she had pocketed 25 s earlier). **`nar_rim_2`, `nar_rim_3`** wait, once `trg_stone` has fired, until the town (`vista_plenty.target`) is within 35 degrees of her view; a branch drops them | story critic (minor) |
| 6 | GDD 9.8 / round-3 ruling "until the note has been read once `E` reads it" | Of the round and the note beside it she is offered **the one she is looking at** (the smaller angle to her view); only a look that falls between them (within 2 degrees) offers the unread note. Aimed at the round the prompt reads TAKE (`shots/r4-team-world/stone_round.png`), at the note READ (`stone_note.png`) | playthrough critic (minor): the final choice stood behind the wrong verb |
| 7 | GDD 9.3 / `trg_dowser.doorOpensWhen` ("or 12 s after this volume is first entered, whichever is first") | The door's 12 s clock does **not** open the tally door while `nar_dowser_seen` is on screen (it waits for the line's end); and if she goes in through an open door under either sighting line, the line is cut on the zone change. Real game, the bot: line 95.7 to 100.7 s, door 100.7 s, inside at 101.9 s (`scratch/r4-team-world/timeline.log`) | playthrough critic (minor) |
| 8 | GDD 4 / 12 (readables), `rd_plate_proving.lines` | A readable's `thenLine` and `lines` are said **next in line** as it closes (they were queued at the back). Real game: plate closed 141.2 s, `nar_plate_1..3` at 141.2 / 146.5 / 151.3 s (they were 28 to 38 s later, after the file) | story critic (minor) |
| 9 | GDD 5 "Respawn", 8.2 | **At the start of each Windlass phase (p1, p2, p3a) on a first arrival she has at least 67 health** (two full segments; `director.ts` `BOSS_HEALTH_FLOOR`): a canteen's worth at a time before the phase's checkpoint is saved. A restore still gives the player's own 60 | playthrough critic (minor): "a hurt player walks into the Windlass at 34"; whole run: walked in at 34, `cp_boss_p1` saved at 67 (`proxy/g_plainFull1.log`) |
| 10 | GDD 6.5, 8.2 | **As phase 1 breaks, a `pk_rounds_12` falls at her feet when she holds fewer than 12 in reserve** (`BOSS_BREAK_RESERVE`). Whole run: 3 + 6 at the break, `cp_boss_p2` saved at 3 + 18 | playthrough critic (minor): "phase 2 opens with a run to the ammo box" (the fixer's 18-round boxes left 0 to 6 in reserve at the break in 6 of 8 of its own runs) |
| 11 | GDD 16 end card | `KNOTS BURST` (the fixer's fix stands; tested here): a pip counts once, a change of phase, a death and a restore into a later phase count nothing. Whole plain run: 47 knots for 153 rounds fired, 113 that told | story and robustness critics (major) |

## 2. Requests to other owners

| # | To | What | Why |
|---|---|---|---|
| 1 | closer / tests (`tests/e2e/lib/page-play.js:807`) | The die-at-every-checkpoint check calls a restore under **67** HP a problem; the player's documented floor is **60** (`RESPAWN_MIN_HEALTH`, GDD 5). Any timeline in which the bot reaches a checkpoint under 60 fails it (it did at `cp_boss_p3` after this round's changes moved the timeline: two lunges from adds in phase 2, saved 34, restored 60). Please make the bound 60 | The world now tops her up to 67 at the Windlass's checkpoints (row 9), which is why the suite is green again; the surface and underground checkpoints still depend on the bot not being hurt |
| 2 | code-enemies (`src/enemies/defs.ts` `BOSS.chargeRequiredAt`, `boss/attacks.ts` `tickUnproven`) | Move the Windlass's own first ask from 12 s to about 2 s (then the world's early ask in `kept.ts` can go), so the HUD pulse and the hint ladder start with the line. Not needed for the fix: today the pulse starts at 12 s while the station asked at 1.5 s | story critic |
| 3 | code-enemies | `stn_dry` is now the world's line (`story.take`): `enterDry`'s `S.say('stn_dry')` is ignored, harmlessly. It can be removed | row 4 |
| 4 | design / closer (`design/story.json` `meta.rules.ending_branch.leave`) | **Declined here, yours to rule:** the fixer listed "`nar_take_1` said on the leave branch" as the world's. It is the design data: `ending_branch.leave` is `[nar_take_1, nar_leave, nar_fire, nar_last]`, and the line ("He had not taken hers. She had given it.") is about her own kept round, true on both branches; the story critic read the leave branch and passed it. The key's name is what misleads. If it should not be said, drop it from `ending_branch.leave`; the world reads that list | fixer follow-up 3 |
| 5 | level design (`design/layout.json`) | Texts to bring in line with rows 1 and 7: `encounters[enc_file].waves[B].when`, `sp_file_7..9.note`, `trg_dowser.doorOpensWhen`. Optional: a field for the ambush (`near`, `burstSeconds`) so `WAVE_RULES` need not hold it | rows 1, 7 |
| 6 | look teams | The far door of the gallery now bursts with three Biders abreast 6 to 8 m in front of her (`shots/r4-team-world/file_ambush.png`): the Biders step through while the leaf is still sliding (1 s), which reads well in the frame; say if the leaf should be quicker | row 1 |

## 3. Not changed, and why

- **Front Street** (R3): the fixer's composition stands and was re-measured on this tree (`proxy/g_surf.out`): plain 18 / 36 / 18
  HP, careless 54 / 88 / 36 HP, 0 deaths in the street. In one whole run from the title the plain proxy still crossed
  it unhurt (seed 101).
- **The file for a player who stops and aims when the narrator names the three**: still free. Three Biders cannot touch a
  player who hits once every 0.6 s (each falls to one round, and a knot bursting within 4 m staggers the rest for 0.5 s:
  `src/enemies` rules, not the world's). The ambush costs the player who walks on.

## Closer, polish round 4 (2026-10-05): decisions

| Row | What | Decision |
|---|---|---|
| 1 | behaviour and numbers | mirrored: GDD 5, 6.6, 8.2, 9.8, 10 in place and 23.8; LEVEL.md 8 and 11; layout texts through `tools/gen_layout.mjs` (`enc_file` wave B `when` + `notRead`, `sp_file_7..9` notes, `trg_dowser.doorOpensWhen`) |
| 2.1 | the restore bound 67 -> 60 | **Applied** (`tests/e2e/lib/page-play.js`): 60 is `RESPAWN_MIN_HEALTH`, the documented floor |
| 2.2 | `BOSS.chargeRequiredAt` 12 -> about 2 s | **Open for round 5** (enemies): it also sets the adds clock of phase 3a (`boss/index.ts:756`), so it is a tuning change, not a text one |
| 2.3 | `S.say('stn_dry')` in `enterDry` | left (harmless; the world takes the line) |
| 2.4 | `nar_take_1` on the leave branch | **Ruled: stays.** The line is about her own kept round and is true on both branches; the story critic passed the leave branch |
| 2.5 | layout texts | done (row 1). No new field for the ambush: `WAVE_RULES` holds it |
| 2.6 | the far door's leaf speed | stands |

## Fixer, polish round 5 (2026-10-06): decisions

| Row | What | Decision |
|---|---|---|
| 2.2 (round 4) | `BOSS.chargeRequiredAt` 12 -> about 2 s | **Ruled: stays 12 s.** No round-5 critic raised it; it also sets phase 3a's adds clock. Closed |
| the file (R3 / R10) | composition and wave rules | **Applied** in the layout and `WAVE_RULES`: `docs/requests/polish-r5-fixer.md` code-world 1 |
| `hint_kept_1` | a line of its own for the kept round's first hint tier | **Data applied** (`design/story.json`, the bore's `lines.hint1`); the wiring in `kept.ts` is the world's |


# Code team "world", polish round 5 (2026-10-06)

What the world team changed against the fifth critic panel, for the closer to mirror into `docs/GDD.md` and
`docs/LEVEL.md` (the design data is final: nothing here asks for a data edit). Log: `scratch/r5-team-world/NOTES.md`;
real-game timelines: `scratch/r5-team-world/proxy/*.log`; frames: `shots/r5-team-world/`; tests:
`tests/world/polish_r5.test.mjs` (7 new), pins updated in `ending.test.mjs`, `kept.test.mjs`, `polish_r2.test.mjs`,
`polish_r4.test.mjs`. Everything is in `src/world/` (`kept.ts`, `ending.ts`, `director.ts`, `interact.ts`).

## R5.1 Behaviour and numbers that changed (lead rulings R5, R12 outrank the documents): mirror

| # | Where it is written now | What the game does now | Measured (real game) |
|---|---|---|---|
| 1 | GDD 6.6 ("four seconds of true silence before the narrator speaks"), 8.2 "The seventh" steps 5 and 6, round-4 row 4 (`stn_proven`, then at phase 3b `stn_dry`, `nar_kept`, `nar_office`) | **On the shot's tick "BORE PROVEN." is on screen, over whatever is there** (the 5.5 s band line is cut), **`nar_kept` is the next line, straight after it**, then `stn_dry` (phase 3b has begun by then) and `nar_office`. The narrator now speaks about 3.3 s after the shot, inside the four seconds before phase 3b. `kept.ts` `fired` / `dry` | `proxy/s7.log`: shot 4.1 s, `stn_proven` 4.1 (+0.0; was +3.0), `nar_kept` 7.4 (+3.3; was +9.0), `stn_dry` 12.6, `nar_office` 15.4 (+11.3; was +14.3). Frames `s7_01_boss_the_seventh.png`, `s7_02_boss_p3b.png` |
| 2 | GDD 8.2 "Hints" (kept ladder tier 1 = `nar_office`) | **Tier 1 says `hint_kept_1`** (the bore marker's `lines.hint1`); `nar_office` is said only after the proof. Tier 2 replaces a tier-1 line still on screen; after a second death in the phase the cut tier-1 line is not said again in front of tier 2 | `tests/world/polish_r5.test.mjs`, `kept.test.mjs` |
| 3 | GDD 9.8, LEVEL.md 7, `trg_stone.endAfterSeconds` 25 and its note, `exit_rim.endsWhen` ("trg_stone + 25 s") | **Walking away is her answer after 40 quiet seconds** (`ending.ts` `LEAVE_MIN`; the marker's 25 is read but 40 is the floor): more than 4 m from the stone, after its last line, and **the clock stands still while any line is on screen**; coming back starts it again. The north edge and the 150 s fail-safe are unchanged | `proxy/e7_away.log`: stepped 6 m back at 63.5 s, the rim's two lines 65.5 to 75.8 s, leave at 114.0 s (it was 89.0 s) |
| 4 | GDD 9.8 take branch, round-4 row 5 ("of the stone's lines only `nar_stone_1` is kept") | **Take:** `nar_take_1` is on screen on the take's tick, over whatever is there; `nar_take_2` follows; **none of the stone's four lines is said after the take**; the lamps' two lines, if not yet said, follow the take's (her view is eased up to the plain and the town for them); the fire kindles after them | `proxy/e7_brisk2.log` (High): take 3.5 s, `nar_take_1` 3.5 (was 19.1), `nar_take_2` 7.7, lamps 12.0 / 16.2, fire 20.8, card 34.8. Frames `e7_brisk_fire.png`, `e7_brisk_card.png` |
| 5 | GDD 9.2 / LEVEL.md (the yard latch: `nar_first_knot` on the burst) | **The latch knot's line is said when she first looks at it** (within 26 m, 14 degrees, no fight live; `interact.ts` `KNOT_SEEN`), next in line. Said on the burst (she shot first) it must start within 1.5 s of it or is dropped (`director.ts` `KNOT_LINE_LATE`) | `proxy/knot3.log`: line 29.6 s, burst 32.9 s (it was said 3 s after the burst) |
| 6 | (new) | A trigger that waits for a fight's clear and describes the quiet after it (`trg_marks`, `trg_hall_diagram`; never a load-bearing line) drops its lines if **another fight is live** when their turn comes | same log: `nar_marks` is not said in the yard fight |
| 7 | GDD 9.5 / LEVEL.md (the watcher: `trg_watcher` lines) | A vignette trigger's lines are next in line; **`nar_watcher_1` is dropped once she is 10 m from the niche, `nar_watcher_2` once she is 13 m on or if the first was never shown** (`director.ts` `VIGNETTE_NEAR`, `VIGNETTE_GONE`) | `proxy/watch.log`: the bot is at the bay locker 3.7 s after the vignette: neither line (both were said there) |

## R5.2 The file (R3, R10)

Done by the cross-cutting fixer in the layout and `WAVE_RULES` before this pass (`docs/requests/polish-r5-fixer.md` row 1);
not redone. Re-measured on this tree, careless proxy with a line round, Normal, three presets
(`scratch/r5-team-world/proxy/f_c1..3.log`): **72 / 54 / 0 HP lost, 33.2 / 33.6 / 29.6 s** from trigger to clear, no
deaths: the fixer's numbers. Against the critics' target (careless 36 to 70, plain 0 to 36, 35 to 50 s): two of three
careless runs are in or just over the band and one is unhurt; the fight is 30 to 34 s. The plain proxy was not rerun
here (the fixer: 0 / 0 / 0).

## R5.3 Known gaps

- A player as brisk as the bot (the latch shot 3.3 s after first seeing it) no longer hears `nar_marks` ("Every door
  wore the well mark"): the latch line is on screen and the yard fight has begun before its turn. A walker hears both.
- The watcher's lines are heard by a player who is within 10 m of the niche when the stair's first line ends; one who
  runs straight down to the locker hears neither.
- "HEAD DRY." is on screen about 4.5 s after phase 3b begins (behind `nar_kept`); the objective changes on the phase.
- Stepping back from the stone still ends the stage in the end (40 quiet seconds, no warning line: none exists in the
  final text).
- No person has played any of this; the world tests drive the real world beside core stubs, the timelines above are
  the e2e bot and the story critic's rim script on the real game.

## Closer, polish round 5 (2026-10-06): decisions

| Row | Decision |
|---|---|
| R5.1 rows 1 to 7 | **Mirrored**: GDD 6.6 rule 3, 8.2 hints, 9.8 in place and 23.10; LEVEL 7 in place and section 12. The layout notes on `trg_stone` / `exit_rim` still say 25 s (frozen data): the documents say so |
| R5.2 the file | **Stands** as the fixer left it; re-measured at the close (INTEGRATION_REPORT J.3) |
| `tests/core` not rerun after the two late edits | rerun at the close on the final tree (J.1) |
| R5.3 known gaps | carried to J.6 |
