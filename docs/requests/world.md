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

## Fixer, release pass p0 (2026-10-07): decisions

| Row | Decision |
|---|---|
| R5.1 (the layout notes on `trg_stone` / `exit_rim` still say 25 s) | **Applied** through `tools/gen_layout.mjs`: `trg_stone.endAfterSeconds` is 40 and the notes say so (`ending.ts` already took `max(LEAVE_MIN, the marker's)`, so nothing changes in play) |
| the choice at the stone is not named | **Applied in data**: `trg_stone` now carries `objective: 'obj_rim_choice'` ("The seventh on the stone is his. Take it, or go on without it."); the director's generic trigger code sets it when she reaches the stone. Check it reads right at the moment the stone's lines begin |
| no warning before the leave branch | **Key added**: `nar_stone_wait` "The round would keep on its stone. She would not pass this way again." Yours to say about ten seconds before the leave branch begins, and to make moot once she takes the round (it is deliberately not in `never_stale`) |
| a brisk player loses `stn_tally_wake_2` and `nar_line_first` | **Applied in data**: `story.json` `meta.rules.never_stale` now exists. **It replaces `NEVER_STALE` in `src/world/story.ts`** (your code: `named ? named.has(key) : neverStale(key)`), so it repeats the 28 keys those patterns matched and adds the two. A line you want never dropped from now on goes in that list (ask the fixer), not in the patterns |
| nothing points at the secrets | **Key added**: caption `cap_loft_bell` "[a small bell, once, in the wind]" |
| tuning tables | this pass edited no table of `src/world` |

## Code team world, release pass p0 (2026-10-07): the nine open issues

Evidence: `scratch/p0-team-world/` (`NOTES.md`, `proxy/`, `perf/`, `rim_*.log`), `shots/p0-team-world/`,
`tests/world/release_p0.test.mjs` (8), `tests/world/release_p0_real.test.mjs` (1, real enemies), `tests/world/story.spec.ts`.

### P0.1 Behaviour and numbers that changed (for the closer to mirror)

| # | Where it is written now | What the game does now | Measured (real game) |
|---|---|---|---|
| 1 | GDD 10 / LEVEL (the yard: three Transits) | **The yard has three Transits again; it had four.** The bell vignette's own Transit stands on `sp_yard_t1`; the enemies hand it to the wave only while the vignette still runs, and wave A is released as it ends, so the wave was given a second one. `director.ts` `start()` now takes the first member at the start (a non-dormant first spawn that carries a vignette). Nothing else in the yard's waves changed | continuous `cp_lip_gate` to `cp_tally_enter` (`proxy/s0_*` before, `s3_*` after): yard HP lost plain 86 -> 0 / 22 / 0 / 0, careless 88 -> 22, 3 deaths + dry -> 92 and none; of ten proxies one death (careless, arriving on 67); end ammo 3+0..5+8 -> 4+11..5+21 |
| 2 | GDD 6.5 (pickups) | **A packet of six lies 1.9 m inside the yard door** on the line into the yard, from wave A on, on every attempt (`ENTRY_PACKET_IN`, `WAVE_RULES['enc_yard/A'].entryPacket`). It is a dropped pickup made by the director because the layout is frozen: see P0.3 row 1 | `tests/world/release_p0.test.mjs` |
| 3 | GDD 6.6 (line queue) | **Urgent lines** (`story.ts` `StoryQueue.urgent`, `URGENT_SPARE` 1 s, `URGENT_HOLD` 3 s): a wave's lines, the file's "Six, in a queue" and `nar_line_first` are on screen at once over a line that may be cut (not one in `never_stale`, not one in its last second; another urgent line only after it has had 3 s), else they are the very next line. A line cut counts as said. A station line in `never_stale` waits in the backlog when four are waiting instead of being dropped; the day-cell's two wake lines are next in line | plain proxy, the file (`proxy/f_p1_a.log`): `nar_file` +3.4 s after its wave (was +8.6), `nar_file_behind` +2.1 (was +7.8), `nar_file_more` +2.8 before `URGENT_HOLD`, about +1.1 with it (was +8.6); `nar_line_first` 2.1 s after the proving shot, behind the plate's line (was never said) |
| 4 | GDD 9.8 / LEVEL 7 (the leave branch) | **Walking away is warned of.** `nar_stone_wait` is said 10 s before the 40 s clock runs out (`ending.ts` `WARN_BEFORE`); the clock stands while it is on screen and the leave cannot begin before it has been heard. **The north edge** says the same line the first time she steps onto it and takes her at her word only if she is on it when the line ends (or steps onto it again). Back at the stone before the line has started, it is taken back and said the next time. `obj_rim_choice` is set by `trg_stone` (the fixer's data; confirmed in play, 1.0 s after reaching the stone) | `rim_away.log`: stepped back 32.7 s, warning 72.7 s, leave 88.2 s (it was silent). `rim_edge.log`: warning on the step, nothing decided 12 s after stepping back, leave on the second step. `rim_take.log`: the take cuts the warning |
| 5 | GDD 18 (checkpoints) | **The Windlass's death saves `cp_boss_proven` again** as the world stands (`checkpoints.ts` `again()`): a reload or "Back to the last count" on the way to the lift or in it finds the Windlass dead, the gate open and its lamp lit, the tallies kept. Written straight to the save store with the player's part as saved at the proof: no second `checkpoint/saved`, no HUD mark, no note at the kill | `rob/mid.mjs cp_boss_proven 'ride:...:dark' reload` and `restart`: after: boss `dead`, 0 enemies, `obj_proving_lift`; the bot reaches the end card with 6 rounds fired in all (it was 12) |
| 6 | GDD 18 / 4.4 (after the end) | **The end card lets the save go** (`ending.ts`, `save.clear()` as the card comes up): the title after a finished run offers "Begin" first and no "Go on" | `rim_title.log`: title items `play:Begin*`, `story`, `options`, `credits`; the same after a reload |
| 7 | GDD 11 (secrets) | **Both secrets are pointed at.** The loft bell rings by itself the first time she is within 22 m with no fight on, at most three times a run, 30 s apart (`interact.ts` `BELL_NEAR`, `BELL_AGAIN`, `BELL_RINGS`; the `step_chime` cue at the bell, caption `cap_loft_bell`). A faint knot-violet halo lies at the foot of `door_cold_bay` on the hall's side until the secret is found (`SEAM_LEVEL` 0.55) | `secrets_look.mjs`: cue ticks 33 / 1835 / 3637; seam on, off when the knot is burst. Frames `secret_loft_bell_caption.png`, `secret_cold_bay_seam_6m.png` |

### P0.2 Declined, with the numbers

**"The file is still free for a player who looks both ways."** Five timings were played by three plain and three careless
proxies each (`proxy/file6.sh`, logs `f1` to `f5`): the door gated on the rear pair closing on her, the pair's gate at
10, 13 and 16 m, the door before and after the pair, a breath after the pair is down. File HP lost, plain | careless:
`f1` 0 / 0 / 0 | 72 / death / 0; `f2` 0 / 18 / 0 | 72 / death / 36; `f3` 0 / 18 / 0 | 72 / death / 36;
`f4` 0 / 18 / 0 | 72 / death / 54; `f5` 0 / 0 / 0 | 72 / 88 / 54. The timing of round 5 (kept): 0 / 0 / 0 | 54 / 88 / 36.
No variant touched the plain proxy more than once in three (one lunge), and every one that did cost the careless one a
death. R3's subject is the careless player, so the composition stands; what changed in the file is that its three
warnings now arrive with the waves (row 3). A plain player who back-pedals down a 60 m corridor from six one-shot
Biders will not be touched by timing alone; it would take a spawn nearer than the stair (layout).

**"A player who takes the stone round at once never hears the four stone lines."** Kept as round 5 ruled it (R12): said
after the take they described a round already in her pocket. The other two lines of that issue are fixed (row 3).

**Holding the yard's third Transit back while two stand** (the critic's second suggestion) was built and measured worse
(the late one overlapped the alley's Biders: two and four deaths for two careless proxies) and taken out; the enemies
already never stand more than two Transits at once.

### P0.3 Requests

| # | To | What | Why |
|---|---|---|---|
| 1 | level design (layout, frozen in this pass) | make the yard's entry packet a marker (`pk_rounds_6` at about (-81.4, 0, -0.3), `availableAfter`-free) and drop `WAVE_RULES['enc_yard/A'].entryPacket` | a pickup the director makes is not in `design/layout.json`, the single source of truth |
| 2 | **render-tech** (`src/render/materials.ts`, `emitHalos`) | forget an emissive mesh that is no longer under the scene: the rule `s.mesh.parent === null` is never true for a mesh inside a released instance (its parent is its own instance's node). Walk to the root and compare with the scene, or drop on age alone | **the cause of the "0.8 MB per swap cycle"**: `emitters` (at most 256) kept every lamp mesh ever drawn and, through `.parent`, its whole instance. 35 more per cycle; **at the eighth swap the list is 256 of 256 stale and no new lamp is taken in** (Low's halos stop for everything built afterwards: a third run in one page). `perf/cycles_emitters_before.log`, `perf/retain.mjs`. The world now takes its own released instances apart (`build.ts` `retire` / `sever`), which leaves 2 per cycle: the Windlass's `boss_lamps` and `gauge` (the enemies' instance). With the rule fixed the world's workaround can go |
| 3 | enemies | `spawnActor` hands a vignette's actor to its wave only while `vignette !== ''`; the world now asks before the vignette ends (row 1), but the rule is a trap for any future vignette that makes its own actor | the fourth Transit |
| 4 | audio | a bell cue of its own for the loft bell (`step_chime` at pitch 0.75 stands in; `AudioCue` is a frozen contract) and `cap_loft_bell` in `captions.ts` so the caption follows the sound | the world says the caption itself today |
| 5 | ui | if "Go on" after a finished run is wanted back (to walk the rim again for the other ending), it needs a title item of its own; the save is cleared at the end card now | the robustness critic asked for "Begin" first |

## Closer, release pass p0 (2026-10-07): decisions on this file's p0 rows

Evidence: `docs/INTEGRATION_REPORT.md` Part K, `scratch/p0-closer/NOTES.md`, `scratch/p0-closer/gate/`.

| Row | Decision |
|---|---|
| P0.1 rows 1 to 7 | **Applied**: GDD 23.12, LEVEL 13 |
| P0.2 declined items | **Accepted as ruled** (the file's timing; the stone lines); listed in `docs/KNOWN_ISSUES.md` |
| P0.3 row 1, the entry packet as a layout marker | **Ruled, not applied**: layout frozen; recorded in LEVEL 13 as the first thing to do when it opens |
| P0.3 row 2, `emitHalos` never prunes | **Applied by the closer** in `src/render/materials.ts`: an emitter is forgotten when its ROOT is not a scene. `tests/render` 63 pass. The world's own `sever()` stays (harmless) |
| P0.3 row 3, a vignette's own actor | Noted for the enemies' owner; not changed |
| P0.3 row 4, a bell cue of its own | **Not applied** (`AudioCue` is a frozen contract); `step_chime` at pitch 0.75 stands in. Known issue |
| P0.3 row 5, walking the rim again after the end | **Ruled, not applied**: the end card clears the save; the other ending needs a new run |
| Render-tech's row: the title's mood after "Quit to title" | **Applied by the closer** in `src/world/director.ts` `moodOf`: the intro mood while the game is on the title. Measured: `L0`, exposure 1.30 on a fresh boot and after a quit from `cp_rim` (`scratch/p0-closer/title_mood.mjs`) |
| The UI's row: raise the run hint on the gully walk | **Applied by the closer**: `needSprint` is also set at the glare trigger |

## Fixer, pass i1 (2026-10-07): decisions and what changed under this team

No row of this file was open (every p0 row carries the closer's decision). Two of them are re-ruled because both story
reviewers of the release raised them again, and four changes were made in this team's data or files.

| Row | Decision |
|---|---|
| P0.3 row 5, walking the rim again after the end | **Re-ruled: wanted** (both story reviewers: the other ending costs a full replay). No contract or core change is needed: the end card's `ctx.save.clear()` is this team's own line (`src/world/ending.ts`), `SaveStore` already keeps and offers a `cp_rim` save, and the title's "Go on" reads it. Keeping the `cp_rim` save (stone untaken, ending not begun) at the end card, instead of clearing it, is the whole change; "Begin" then asks first, as over any save. World and UI decide the wording with the keys that exist (`ui_menu_continue`, `ui_checkpoint`). **Not applied by the fixer** (behaviour of two teams' files) |
| P0.2, the stone's four lines on a fast take | **Text provided**: `nar_stone_short` "Six spent cases in a row, and a seventh, unfired. The band was the wrong colour." (6.5 s) is in `design/story.json` for a take made before `nar_stone_1` has started. Not wired; not in `never_stale` |
| New: the lamps | `nar_lamps_hers` added to `trg_lamps.lines` and to `never_stale`. **Edits in this team's files** (the issue was assigned to integration): `src/world/index.ts` `get lampsOf()` (the new contract member), `src/world/ending.ts` `LAMPS_HERS` and one `story.unless` (the line is dropped when nobody was freed), `src/world/story.ts` the fallback pattern `lamps(_count|_hers)?`. `tests/e2e/i1.test.mjs` |
| New: the Tally House's lines | data only (`design/layout.json`): `shutter_m.lines` is the chair's two; `nar_tally_hearth` is `enc_tally.onClear.lines[1]`; `nar_ask` is `trg_peg_stair.lines[2]`. **Edit in this team's test**: `tests/world/misc.test.mjs` asserts the new lists. If the team re-times the room itself, these lists are the starting point; do not also re-order them in code |
| New: the diagram | data only: `trg_hall_diagram` is the floor before the ring; `nar_mark_1..3` are in `never_stale`. The line about the diagram may start with the diagram at the edge of the frame (she walks east, it is on the east wall north of the gate): a `waitWhile` on its view is the team's call |
| New: the ride's lines | `stn_lift_1..3` are in `never_stale` (data). With the diagram's lines now said on the way to the cage, the first station line was dropped stale on the ride (`tests/world/rides.test.mjs` caught it); all six are now said in order (`scratch/i1-fixer/ride.mjs`) |
| New: the interact hint | **Edit in this team's file**, a consequence of moving the camp: `src/world/interact.ts` `tickHints`: the hint's `needed` is taken back (and the hint hidden) when she is no longer within 3 m of the first note and has not used the key. Before, one pass within 3 m raised it for good (`tests/world/misc.test.mjs` "the lazy key hints" caught it: `ui_hint_interact` came up at the jug gate) |
| New: stop one | data only: the camp, the note and the tin moved 3.3 m into the shaft of sun (`prop_camp_one` (14.4, 14, 102.9)); `tests/world/softlock.test.mjs` reads the note's place from the layout and passes |

## Code team world, pass i1 (2026-10-07): the ten issues of the story and visual reviewers

Evidence: `scratch/i1-team-world/` (`NOTES.md`, `before_onb.log` / `after_onb.log`, `rim_goon.log`, `H_tally.log`,
`L_street.log`, `watcher.log`, `hall.log`, `vista.log`, the suites' logs), `shots/i1-team-world/` (opened:
`open_glint_low.png`, `goon_1_take_short_line.png`, `goon_3_title_after_end.png`, `watcher_4_look_later.png`,
`watcher_glint_strip.png`, `hall_2_look_at_diagram.png`, `vista_windlass_mid.png`, `vista_windlass_at_rail.png`),
`tests/world/i1.test.mjs` (10), `tests/world/story.spec.ts` (+4), the rewritten reload-hint test in
`tests/world/polish_r2.test.mjs`.

### I1.1 Behaviour and numbers that changed (for the closer to mirror in GDD / LEVEL)

| # | Where it is written now | What the game does now | Measured (real game unless said) |
|---|---|---|---|
| 1 | GDD 12.1 (key hints): "reload: on the second dry click" | **"R to reload" is shown when the key would help and nothing is doing it for her**: two rounds or fewer under the hammer, lead in reserve, the gun at rest for 1.5 s (`interact.ts` `RELOAD_LOW` 2, `RELOAD_LOW_SECONDS` 1.5). Down on the tick a reload opens or the cylinder holds more; stands 6 s at most; not again for 20 s (`RELOAD_HINT_AGAIN`); three times a run; never once she has pressed the key. **A dry click raises nothing** (it starts a reload by itself) | `before_onb.log`: shown 40.2 to 46.2 s over a reload that closed at 42.5. `after_onb.log`: six shots, three dry clicks, two automatic reloads: never shown |
| 2 | GDD 12.1: "sprint: when first needed" | **"Hold SHIFT to run" waits for three quiet seconds** (no line, no title card, no fight, she outside every puzzle volume: `SPRINT_QUIET` 3), **stands 8 s** (`SPRINT_HINT_SECONDS`), comes back once after 40 more quiet seconds (`SPRINT_AGAIN`, `SPRINT_HINT_SHOWS` 2), and is taken down as she walks into a puzzle. `StoryApi.cardUp` is new (world-internal) | before: shown 31.8 s on the tick of "I. The Lip" with a line up, still up at 58.7. after: 42.5 to 50.5 s (the gully's last line ended 39.6) |
| 3 | GDD 6.6 (line queue), new rule | **An urgent line may let the line on screen be read first** (`story.ts` `URGENT_READ` 0.65: the line on screen is cut once it has had 65 % of its own time, never unread). Used by: the day-cell's first wake line (it waited for the whole room line and the gap, up to 6 s), a vignette's first line (the watcher), a latch knot's line on sight, the Transit's "took one on her". "Two of them stood" (the hatch latch) is plainly urgent | `H_tally.log`: `stn_tally_wake_1` 3.1 s after the cell wakes with "He had not turned them on her" on screen; `nar_two_rise` said (story-b's run: never) |
| 4 | GDD 6.6, new rule | **A trigger on the seam between two sets is about both zones** (`StoryQueue.say(key, scope, alt)`): the peg stair's lines were asked for in `tally_house` and went stale 4 s after the zone became `the_gallery` | `H_tally.log`: `nar_pegs_1`, `nar_pegs_2`, `nar_ask` all said (before: both peg lines dropped, `stale 5`) |
| 5 | LEVEL (the peg stair: `trg_watcher`) | **The watcher's lines start on a look.** The niche is recessed: the figure can be seen from 1.5 m before she is abreast of it (measured, `probe_watcher.mjs`). Within 9 m a small star glints in the mouth of the niche for 0.5 s every 1.5 s (`director.ts` `WATCH_*`); looking at the figure (28 degree cone, clear line) starts the vignette and its line at once; crossing the trigger without a look starts the vignette, keeps the star lit, and holds the lines 1.5 s for her to turn | `watcher_4_look_later.png`: the line with the figure in the middle of the frame |
| 6 | LEVEL (the lift hall: `trg_hall_diagram`) | **The diagram's lines start on a look too**: once the Tamper is down, looking at the drawing from anywhere within 26 m with a clear line (`VIEW_RANGE`; a pier of the ring hides it from the hall's centre line) says them next; the floor before the ring still says them to a player who never looked. Convention: `prop_<name>` is what `trg_<name>` is about | `hall_2_look_at_diagram.png` |
| 7 | GDD 9.3 (the sighting) | **Turning to the opened tally door is looking away**: once the door has opened by its clock, half a second off him is enough for "When she looked again there was only rim" (`SIGHT_AWAY_OPEN` 0.5; it stays 2 s before the door opens). The line, once on screen, is no longer cut when she walks in | `tests/world/i1.test.mjs` |
| 8 | GDD 11 / LEVEL (the yard latch) | **The latch knot is described from 16 m** (`interact.ts` `KNOT_SEEN`; it was 26): the street's quiet line (from 22 m) is on screen first and the knot's follows it | `L_street.log` at the bot's pace: `nar_marks` 30.9 s, knot shot 33.6, `nar_first_knot` 34.5, 0 stale (before: `nar_marks` never said) |
| 9 | LEVEL 7 / GDD 9.8 (the rim's lines) | **The rim's two scenery lines are never dropped.** At the ledge's edge (`trg_lamps`) they are told ahead of the lamps (order as written: `nar_rim_1..3`, the lamps, the stone); bent over the stone they still wait; **a branch tells them** ahead of the lamps, with her view eased to the plain. **A take before the stone's first line is answered with `nar_stone_short`** on its tick, a take between the first and the last with `nar_stone_4`, then the take's two (`ending.ts` `STONE_SHORT`) | `rim_goon.log`: take 3.5 s after the cage: short +0.0, take_1 +6.7, take_2 +10.9, rim_2 +15.2, rim_3 +20.0, lamps +25.8, count +30.0, fire +34.8, last +39.6, card +48.6 (it was 31 s with four lines fewer) |
| 10 | GDD 18 / 4.4 (after the end) | **The end card keeps the rim's save** (the fixer's ruling). The title after a finished run offers "Go on VII · 1" (chosen) and "Begin" asks first. Going on is the rim told again: the stone untouched, every rim line said again (`checkpoints.ts` forgets the finished telling's lines when a save is applied after an end card), the tallies as they stood when the lift opened. "Walk it again" still begins a new run and lets the save go | `rim_goon.log`: title items `BEGIN`, `GO ON VII · 1*`; second telling: leave branch, card "THE REEVE CARRIES 6", save still `cp_rim`. `goon_3_title_after_end.png` |
| 11 | LEVEL (stop one) | **The spent case over the first note glints** like the cases on the last stone (the star card, 0.35 s every 2.5 s) from the line that names it until the note is read or she is 14 m on (`interact.ts` `CASE_GLINT_*`) | `open_glint_low.png` |

The deterministic playthrough by input still passes: 32 122 ticks (the ending is about 17 s longer: the lines above),
89 rounds, 35 freed, 0 deaths, the same hash on a second load.

### I1.2 Declined or not mine, with the reason

- **The gantry rail across the first look at the Windlass** is geometry of `env_the_bore` (Blender, frozen for this team) and
  the vista is a layout marker (frozen). Reproduced: from the catwalk's middle the mid rail of the south grille (about 1.1 m
  above the deck) crosses the Windlass (`vista_windlass_mid.png`); from 0.35 m off the grille the view is clean and is a
  frame worth keeping (`vista_windlass_at_rail.png`). Row 1 below asks the underground look team for it.
- **The Transit's introduction at the bot's pace**: `nar_transit` is said when the Transit turns to her and is dropped when
  it is down first (round 2's rule: the line names the turn). The bot ends the yard in 15 s; nothing to fix without
  saying the line about a Transit that is already scrap. It is urgent now (row 3), so a living Transit's turn is told sooner.
- **Station lines "interrupting" narration at once** was not done as asked: a cut line counts as said, and the same
  reviewer counts the room's lines lost. Row 3 is the rule instead (the room line is read first; the wait is two thirds of
  a line at most).
- **"Go on" beside "Walk it again" on the end card** is the UI's menu; the save is there for it (`ui/action` `continue`
  from the `ending` state has not been tried by this team).

### I1.3 Requests

| # | To | What | Why |
|---|---|---|---|
| 1 | underground-look (`blender/env_interior/env_the_bore.py`) | lower the mid rail of the catwalk's south grille (`bo_catwalk_grille_s`, deck y -36) to 0.75 m or less between x 11 and x 17, or leave a 3 m gap in it centred on x 14 | the first look at the Windlass (`trg_windlass_seen`, `vista_windlass`) is taken from the deck's middle, where the rail at 1.1 m crosses the boss; `shots/i1-team-world/vista_windlass_mid.png` against `..._at_rail.png` |
| 2 | underground-look | the watcher's niche is dark and its figure dim (`watcher_4_look_later.png`); a faint lamp or a lit edge inside the niche would let the star go | the star is a pointer, not a light |
| 3 | ui | an end-card item "Go on" (`ui_menu_continue` with the count) beside "Walk it again"; the save of `cp_rim` is kept at the card | story-a's fourth item; the title already offers it |
| 4 | level design (layout, frozen) | `trg_marks` 4 m further east, or `knot_yard_latch.seenFrom` as a number; `trg_watcher.subject` and `trg_hall_diagram.subject` as fields instead of the `prop_<name>` convention; `exit_rim.armedWhen` and the stone's notes still say 25 s | the code carries these as constants or conventions |
| 5 | closer | mirror I1.1 into GDD 12.1, 6.6, 9.3, 9.8, 18 and LEVEL; `docs/KNOWN_ISSUES.md` lists "the other ending needs a full replay" and "the stone lines on a fast take": both are closed | documents |

## Closer, pass i1 (2026-10-07): decisions on this file's i1 rows

| Row | Decision |
|---|---|
| I1.1 rows 1 to 11 | **Mirrored**: GDD 12.1 (in place) and 23.14, LEVEL 15 |
| I1.3 row 1, the rail across the first look at the Windlass | **Done by underground-look** (a knee rail at 0.5 m in the viewing bay); checked in this pass's hero frame of the Windlass |
| I1.3 row 2, the watcher's niche | **Done by underground-look** (a pilot lamp and its baked wash). The star in the niche's mouth is **kept**: it is tested (`tests/world/i1.test.mjs`), costs one pooled card, and still draws the eye before the figure is in view |
| I1.3 row 3, "Go on" on the end card | **Applied by the closer** (the UI team was done): the end card has a third item, **"The rim again"** (`ui_end_rim`, new in `design/story.json`), shown when a save is stored; it sends `ui/action` `continue` from the `ending` state. `src/ui/system.ts`; tested in `tests/world/i1.test.mjs` (the flow from the ending state) and `tests/ui/i1.test.mjs` (the item) |
| I1.3 row 4, layout fields | **Partly**: left as constants and conventions (LEVEL 15 lists them). The layout changed in this pass only for the nine seats' yaw |
| I1.3 row 5, documents | **Done**; `docs/KNOWN_ISSUES.md` rewritten |
| I1.2, the Transit's introduction at a bot's pace; station lines cutting in at 65 % | **Accepted as built** |

## Code team world, pass i2 (2026-10-07): the ten issues of the two story reviewers

Evidence: `scratch/i2-team-world/` (`NOTES.md`; the real game's legs after the fixes: `end2_16x9.log`, `parley.log`,
`G_gal.log`, `A_ante.log`, `T_tally.log`, `H_hall.log`, `H2_ride.log`; the gate's logs `gate_*.log`), `shots/i2-team-world/`
(opened: `E_a_16x9_06_story_round_taken.png`, `E_a_16x9_07_ending_fire.png`, `G_no_look_4s.png`, `G_looked.png`,
`H_diagram.png`, `T_hearth.png`). The before-numbers are the reviewers' own logs on the same tree
(`scratch/i2-story-a/`, `scratch/i2-story-b/`). Tests: `tests/world/i2.test.mjs` (7), `tests/world/i2_real.test.mjs`
(the real Windlass), `tests/world/story.spec.ts` ("pass i2": 9); the tests of earlier passes that held the old
behaviour were rewritten in place (`i1.test.mjs`, `polish_r2`, `polish_r5`, `release_p0`, `ending.test.mjs`,
`tests/enemies/logic.spec.ts`, `boss_p1.test.mjs`, `release_p0.test.mjs`).

### I2.1 Behaviour and numbers that changed (for the closer to mirror in GDD / LEVEL)

| # | Where it is written | Now | Measured in the real game |
|---|---|---|---|
| 1 | GDD 9.8 (the take), 23.14; LEVEL 15; this file I1.1 ("the rim's scenery lines are told in the branch", "the take is answered on its tick") | **Once a branch is decided the order is fixed: the lamps' lines that have not been told (`nar_lamps`, `nar_lamps_count`, `nar_lamps_hers`), in their order and unbroken; then the branch's own lines (take: `nar_stone_short` or `nar_stone_4`, `nar_take_1`, `nar_take_2`; leave: `ending_branch.leave`); then the fire's two. The rim's scenery lines (`nar_rim_2`, `nar_rim_3`) that are unsaid when a branch begins are DROPPED** (pass i1 kept them). A take is answered on its tick only when no lamps line is on screen or still to be told | `end2_16x9.log`: take 61.3 s; `nar_lamps` 58.9, `nar_lamps_count` 63.2, `nar_stone_short` 68.0, `nar_take_1` 74.7, `nar_take_2` 79.0, fire 83.0, `nar_last` 88.0 (it was take lines 68.2 / 72.5, then `nar_rim_3` 76.8 and `nar_lamps_count` 82.5). Leave: `nar_take_1` 44.0, `nar_leave` 48.3, fire 51.8, no `nar_rim_3` |
| 2 | GDD 13.4 (the asking), `trg_pz_asking.reaskSeconds` 20 | **An unanswered question is asked again after 50 QUIET seconds** (`REASK_MIN`: counted only while nothing is on screen or waiting and she is not turned to the cradle within its look range), queued like any line. **The asking's own hint ladder: T1 30 s, T2 45 s, T3 210, T4 300 on Normal; 15 / 25 / 120 / 180 on Fast** (the shared ladder is 60 / 120 / 210 / 300) | `A_ante.log`: `stn_ask_1` at 0.0 and 82.3 s (it was seven times in 120 s); `nar_cradle` 15.7, `nar_cradle_2` 21.4; `hint_ask_2` at 45.0 s (it was 120) |
| 3 | GDD 12.1 (the sequencer), this file I1.1 ("URGENT_READ: over a room line at two thirds") | **A polite urgent line (the day-cell's wake, a knot looked at, the bell's second line, the watcher) never takes a narrator's or the Reeve's line down**: it is the very next line. It still cuts a station line or a hint that has had two thirds of its time. **A line and its continuation are not parted** (`PAIR_KEEP` 1: the key with the same stem and another number, `nar_pegs_1`/`_2`, `nar_tally_chair`/`_2`, `nar_cradle`/`_2`, `stn_tally_wake_1`/`_2`): what is put next in line (front, now, a polite urgent line) goes behind the continuation. A wave's line (plain urgent) and her own act (over) still come at once | `T_tally.log` (five seconds a shutter): wall 15.8, chair 22.1, chair 2 28.4, wake 34.1 / 37.4, cloth 43.1; nothing cut, 0 stale (it was: chair cut at 3.9 of 6 s, chair 2 nine seconds later, cloth never). `parley.log`: `nar_cradle` 19.4, `nar_cradle_2` 25.1 (`stn_ask_done` stood between them) |
| 4 | `story.json` `meta.rules.never_stale` | `nar_tally_cloth` is never stale (carried in `src/world/story.ts` `KEEP_ALSO`: the design data is frozen for this team) | as row 3 |
| 5 | GDD 9.5 (the peg stair), LEVEL 15 ("the watcher: on a look, or 1.5 s after the trigger") | **The watcher's two lines are said only when she has looked at the figure** (inside 28 degrees of the middle of her view, within 9 m, a clear line, for 0.4 s: `LOOK_DWELL`), before, on or after the trigger. Crossing the trigger without a look plays the figure's own motion and says nothing; when she has gone by and is out of range the moment is over. The glint in the niche's mouth stays while she is near and has not looked | `G_gal.log`: four seconds on the trigger facing down the stair, no line; the look at 7.2 s; `nar_pegs_1` 1.9, `nar_pegs_2` 6.6, `nar_watcher_1` 11.9, `nar_watcher_2` 18.1, `nar_ask` 21.9 (it was pegs 1, watcher 1, watcher 2, pegs 2) |
| 6 | GDD 9.4 (the Tally House), `enc_tally.onClear.lines`, `prop_cup_two.params.line` | **`nar_tally_hearth` is said at the hearth**: turned to the cup from within 3 m for 0.4 s out of a fight (`NEAR_LINE`), or on opening `rd_note_hearth`, whichever is first. The fight's end still names it: the fallback of a player who never went near | `T_tally.log`: at the hearth 49.0 s, the line 49.5 (`T_hearth.png`); it was said on the way to the hatch, 28 s after the note had been read |
| 7 | GDD 8.1 (the asking), `src/enemies/defs.ts` `BOSS.parley` | **The roll-call lines `stn_parley_2` and `stn_parley_3` are held 3.5 s each** (story.json says 4.5 and 4; `PARLEY_ROLL_HOLD`). The clock: line 1 at 0, narrator 5.5, the Reeve 10, roll-call 14.5 and 18, **the inspection 21.5 to 25.5, phase 1 at 26.5 s** (it was 23 to 27 and 28). `stn_parley_1` opens the scene: lines that were only waiting and that the story does not stand on are dropped, and it is said as soon as no narrator's line is on screen | `parley.log` (the bot walks in under `nar_cradle_2`): seal 28.8, `stn_parley_1` 30.9, inspection 53.7 (24.9 s after the seal; it was 31.7), phase 1 at 58.7 (29.9 s; it was 36.7). With nothing on screen at the seal (`tests/world/i2_real.test.mjs`): 21.5 and 26.5 |
| 8 | GDD 9.6 (the lift hall), LEVEL 15 ("`trg_hall_diagram` is the whole floor before the ring") | **The drawing's three lines start when the drawing has been in her view** (inside 30 degrees, within 26 m, a clear line, 0.4 s) once the Tamper is down. **The floor says nothing by itself.** A player who comes within 3.5 m of the cage (`CAGE_NEAR`) without ever having had it in view is told there. **A ride is held up to 8 s** (`LINES_GRACE_TICKS`) while one of its own lines still waits its turn | `H_hall.log`: eight seconds on the floor with her back to it, nothing; the look at 8.1 s, `nar_mark_1` at 8.4 (`H_diagram.png`). `H2_ride.log` (the bot never looks): the six lines at 0.3 / 6.1 / 10.9 / 16.6 / 21.4 / 27.2 s, none dropped |
| 9 | this file, I1.1 ("the playthrough") | The playthrough by input: **31 582 ticks, 8.5 min, 89 rounds, 35 freed, 0 deaths, hash `e06c074a`**, the same on a second load; 17 of 17 checkpoints restore | `gate_e2e_play_final.log` |

### I2.2 Declined or left, with the reason

| # | Issue | Why |
|---|---|---|
| 1 | "`nar_take_1` is said in the leave branch" (story-b) | **Declined, as in p0 and i1** (GDD "Rulings at the close": the line stays). It is `design/story.json` `meta.rules.ending_branch.leave`, frozen for this team, and the line ("He had not taken hers. She had given it.") is about her own kept round: it is what makes "Six, then." mean something. Only its key says "take". If the lead rules otherwise, drop the key from `ending_branch.leave`: the world reads that list and `tests/world/i2.test.mjs` compares against it |
| 2 | "merge the two chamber-inventory lines into one" (story-b) | The merged text is 89 characters (the subtitle rule is 84) and the text is frozen for this team. The two lines are held 3.5 s each instead (I2.1 row 7): the same seconds saved |
| 3 | the cradle's second line in front of the parley (story-b: 7.4 s) | **Left, shorter.** It is load-bearing and it is the continuation of a line on screen; it is heard out (2.1 s of it in `parley.log`), and `stn_ask_done` no longer stands between the cradle's lines or in front of the parley. It only happens to a player who never looked at the cradle and walks in within five seconds of the door |
| 4 | the station's wake line at five seconds a shutter | **A cost of row 3, said plainly:** "DAYLIGHT. HEADWORKS WAKING." comes 12 s after the cell lights at that pace (it was 4 s), because it waits for both chair lines. The cell's own cue, its caption and the hatch's lamps are on the tick. The other order the reviewer offered (the station first, then both chair lines) would have needed the chair line, on screen for a tenth of a second, to be taken down and shown again |

### I2.3 Requests

| # | To | What | Why |
|---|---|---|---|
| 1 | level design / closer (`design/story.json`) | add `nar_tally_cloth` to `meta.rules.never_stale`; then `KEEP_ALSO` in `src/world/story.ts` can go | I2.1 row 4 |
| 2 | level design / closer (`design/story.json`) | `stn_parley_2.seconds` and `stn_parley_3.seconds` = 3.5; then `PARLEY_ROLL_HOLD` and `StoryApi.hold` can go | I2.1 row 7 |
| 3 | level design / closer (`design/layout.json`) | `trg_pz_asking.reaskSeconds` 50 and a note that they are quiet seconds; `hints` thresholds for the asking as numbers (30 / 45 / 210 / 300); `trg_watcher`: "said on a look only"; `trg_hall_diagram.note`: "said on a look; at the cage otherwise"; `prop_cup_two.params.line`: the text still says "spoken when enc_tally clears" | the code carries these as constants |
| 4 | closer | mirror I2.1 into GDD 8.1, 9.4, 9.5, 9.6, 9.8, 12.1, 13.4 and LEVEL 15; `docs/INTEGRATION_REPORT.md` M.6 lists "at the bot's pace the watcher's line is said in the proving bay": closed (the bot never looks: it is not said) | documents |
| 5 | ui | the hold of a line is the event's `seconds` (`story/line`), which for the two roll-call lines is no longer story.json's: nothing to do if the HUD reads the event | I2.1 row 7 |
| 6 | enemies (not active in this pass; edited by this team under the pass's rule) | `src/enemies/defs.ts` `BOSS.parley` (four numbers) and the three tests that hold them (`tests/enemies/logic.spec.ts`, `boss_p1.test.mjs`, `release_p0.test.mjs`) | I2.1 row 7 |

## Closer, pass i2 (2026-10-07): decisions on this file's i2 rows

| Row | Decision |
|---|---|
| I2.1 rows 1 to 8 | **Mirrored**: GDD 23.15 (8.1, 9.4, 9.5, 9.6, 9.8, 12.1, 13.4), LEVEL 16, ARCHITECTURE 8.4 "Pass i2" (the story queue) |
| I2.1 row 9 (the playthrough) | **Re-run on the final tree**: the figures are in `docs/INTEGRATION_REPORT.md` Part N |
| I2.2 row 1, `nar_take_1` in the leave branch | **Stays**, as ruled in p0 and i1. The closer does not overrule a standing ruling; it is listed for the lead in Part N and `docs/KNOWN_ISSUES.md` (one key in `design/story.json` `meta.rules.ending_branch.leave` decides it) |
| I2.2 rows 2 to 4 | **Accepted as left**; the wait before the Windlass and the late station line in the Tally House are in `docs/KNOWN_ISSUES.md` |
| I2.3 row 1, `nar_tally_cloth` never stale | **Done** in `design/story.json`. `KEEP_ALSO` in `src/world/story.ts` is left in place (harmless; the same key) |
| I2.3 row 2, `stn_parley_2` / `_3` seconds 3.5 | **Done** in `design/story.json`. `PARLEY_ROLL_HOLD` / `StoryApi.hold` are left in place (the same value) |
| I2.3 row 3, layout notes and `reaskSeconds` | **Done** through `tools/gen_layout.mjs`: `trg_pz_asking.reaskSeconds` 50 with a note (quiet seconds; the hint ladder's numbers), notes on `trg_watcher`, `trg_hall_diagram`, `prop_cup_two`. The hint thresholds are in the note, not fields |
| I2.3 row 4, documents; M.6's watcher item | **Done**; closed |
| I2.3 rows 5, 6 | **Seen**: the tests of `tests/enemies/` pass with `BOSS.parley` as edited |

## Fixer, pass i3 (2026-10-07): decisions on the rows left open

| Row | Decision |
|---|---|
| I2.2 row 1, `nar_take_1` in the leave branch | **Stays** (ruled in p0, i1 and i2; neither story reviewer of pass i3 names it) |
| `rd_note_hearth`, `obj_yard` | text changed in `design/story.json` ("They are not suffering now."; "The yard is not empty."). No key, marker or trigger changed; `design/layout.json` is byte-identical to pass i2 |
| `nar_rim_3` in `meta.rules.never_stale` (story-a, pass i3) | **Not added by the fixer**: the rim's scenery lines are deliberately dropped once the round is taken and wait while she is bent over the stone (`tests/world/i1.test.mjs`, `ending.test.mjs`, `polish_r4.test.mjs`); a list entry would fight that logic. The reviewer's better form (say it when she looks at the Rule after reading the stone's note) is the world team's to build; if it needs the key in the list, ask the closer |
| Layout fields a pass i3 change needs (the run hint's place, the kneeler's trigger, a look gate on the gantry line) | carry them as constants in `src/world` with a row in this file; the closer mirrors them through `tools/gen_layout.mjs` (a layout change makes every asset stale: one rebuild, at the end) |

## Team world, pass i3 (2026-10-07): the two story reviewers' twelve issues

Evidence: `scratch/i3-team-world/` (`NOTES.md`; real-game legs `A_gal.log`, `A2_gal_walk.log`, `B2_street.log`,
`C_gantry.log`, `E_rim_take.log`, `F_boss.log`, `G_kept.log`, `H_lock.log`, `I_open.log`, `J_brisk_tally.log`,
`K_parley.log`), `shots/i3-team-world/` (opened: `A_watch`, `B2_k0`, `B2_k2`, `C_gantry_look`, `C_ante_embers`, `E_t24`,
`E_t28`, `E_t38`, `F_hit`, `I_g4`), `tests/world/i3.test.mjs` (12, the real world beside core stubs),
`tests/world/i3_real.test.mjs` (6, the real game), `tests/world/story.spec.ts` ("pass i3": 5). Tests of earlier passes
that held the old behaviour were rewritten in place (`director`, `ending`, `i1`, `i2`, `i2_real`, `polish_r2`,
`polish_r4`, `polish_r5`).

### I3.1 Behaviour and numbers that changed (for the closer to mirror in GDD / LEVEL / ARCHITECTURE)

| # | Where it is written | Now | Measured in the real game |
|---|---|---|---|
| 1 | ARCHITECTURE 8.4 (the story queue), GDD 12.1 | **A PRESENT line** (`StoryQueue.present`, `StoryApi.sayPresent`): about what she is looking at this second. It is the very next line, ahead of everything that only waits and (by default) ahead of the continuation of the line on screen; it takes a station line or a hint that has had two thirds of its time off the screen; it never cuts a narrator's line; the time it takes is added to the allowance of what it overtakes (nothing goes stale because of it). Its owner gives it an `unless` rule so it is dropped when its subject is behind her. Used by: the watcher's two lines, the Windlass line on the gantry, the embers, the kneeler, the shutters' landing lines, the rim's Rule line. `UNKEPT` (`nar_tally_cloth`): a key of `never_stale` that is bound to a place after all | `A_gal.log`: look at the watcher 3.1 s, `nar_watcher_1` 5.3 s, 0.3 s after "Coats on pegs" ended (it was 13.9 s, in the proving bay), `nar_watcher_2` 11.5 |
| 2 | GDD 9.5, LEVEL 15 (`trg_peg_stair`) | **The peg lines begin at the hatch**: on a look down the open hatch at the first flight's coats (inside 30 degrees, within 7 m, a clear line, 0.4 s), else on flight 1 from its second step (`ALSO_AT`: a second volume, centre of its bottom face (-90.25, -4.5, -33), size 6.5 x 4.1 x 2); the layout's volume on flight 2 still fires it. **`nar_pegs_2` is dropped when its turn comes with her on the bay's floor more than 2.5 m past the foot of the stair** (`STAIR_LINES`: y < -11.7 and z > -15.5). The watcher's lines go ahead of it | `A2_gal_walk.log` (never breaks step): `nar_pegs_1` 0.5 s on flight 1 (it began on flight 2), foot of the stair 4.7 s, `nar_pegs_2` 5.3 s (it began 2 s after the bay's checkpoint) |
| 3 | GDD 9.4, `story.json` `never_stale` | **`nar_tally_cloth` is asked for the moment the north shutter opens** (no 4 s wait for a look), is the next line behind the continuation of the line on screen, and **is dropped once the cord is shot**; it is no longer kept for ever. The other shutters' lines are PRESENT lines when she is looking at their landing | `J_brisk_tally.log` (five seconds a shutter): shutter 22.8, cord 28.3, the line not said (it was said at 62.6 s, after the fight). `tests/world/i3.test.mjs`: north shutter first, the line is third (behind `nar_tally_2`) |
| 4 | GDD 9.3 / 10 (Fight 1), LEVEL (`trg_enc_street`, `vista_kneeler`) | **The gate posts show card II and say `nar_plenty`; the fight and `nar_kneeler` begin when she is within 24 m of the kneeler with it inside 20 degrees of the middle of her view and no line on screen, or within 20 m whatever she faces** (`HELD_START`). Until then it kneels and scoops. A round into it from further off starts the fight as before, without the line. A second attempt starts at the gate as before. Wave A's 3 s and everything behind it are unchanged | `B2_street.log`: card and `nar_plenty` 1.5 s, the line and `encounter/started` 6.0 s at x -23.9 (20.6 m off; it was 43 m, a 15 px speck); `B2_k0.png`, `B2_k2.png` |
| 5 | GDD 9.7, LEVEL (`trg_windlass_seen`, `trg_ante_enter`) | **Look gates** (`LOOK_GATES`): `nar_windlass_seen` when `vista_windlass`'s target has been inside 30 degrees for 0.4 s with a clear line through the grille, on the gantry's level and within 30 m; crossing the trigger without that look plays `ratchet` at the Windlass with `cap_ratchet`, and the line is said anyway 8.5 m from the trigger or off the gantry's level (never lost). `nar_embers_1/2` when `prop_camp_three` (+0.3 m) has been inside 35 degrees within 8 m for 0.4 s; else 6 s after the trigger once the camp is inside 50 degrees, and at 20 s whatever she faces. Both are dropped once the Windlass's fight has begun | `C_gantry.log`: on the trigger 34.5 s looking along the gantry, nothing; aimed at the Windlass, the line 36.5 s (`C_gantry_look.png`). In at the antechamber 49.3 s facing the door, nothing; turned to the camp 52.4, the line 52.7 (`C_ante_embers.png`) |
| 6 | GDD 9.1 (`trg_glare`) | **`nar_rule` waits for the Rule**: inside 38 degrees of the middle of her view with 120 m of open sky that way; never stale while it waits (`KEEP_ALSO`); dropped when she leaves the_lip without the look | `I_open.log`: 21.1 s, walking down the gully, the Rule dead centre (`I_g4.png`) |
| 7 | GDD 9.8, 23.15 row 1 (the order of a branch), LEVEL 16 | **A take is answered on its tick again**: `nar_take_1` over whatever is on screen (the one exception: `nar_rim_3` itself is heard out, the take's line is the very next), `nar_take_2`; then the lamps' lines that have not been told, unbroken; then the thread and the Rule (`nar_rim_2` if untold, `nar_rim_3`); then the fire. `nar_stone_short` and `nar_stone_4` are no longer said after a take. The leave branch: lamps, its own lines, `nar_rim_2` / `nar_rim_3` if untold, the fire. **`nar_rim_3` is never lost and is tied to the Rule**: it waits while the Rule (`vista_rim_rule`) and the town's thread are not both inside 35 degrees, or while `nar_rim_2` still waits; once `nar_rim_2` has been heard, 0.4 s with both in view makes it the next line (the look his note on the stone asks for). No narrator line is ever said twice | `E_rim_take.log`: take 3.6 s, `nar_take_1` 3.6 (it was 13 s late), `nar_take_2` 7.8, lamps 12.1 / 16.4, `nar_rim_2` 21.1, `nar_rim_3` 25.9 with thread and Rule in frame (`E_t24.png`), fire 31.4, last 36.4, card 45.4 |
| 8 | GDD 9.8 (the last image), ART_BIBLE 8.3 | **The revolver is let down as the last fire catches** (`ending/fire`; `src/player/system.ts`, 0.9 s, the end card's own let-down) and stays down to the card. A shot or a reload after it brings it back up (she has the gun until the wind) | `E_t28.png` (going down as the fire catches), `E_t38.png` (the last image: town, thread, Rule, fire, no gun); `__dbg.ext.player.lowered()` false before the fire, true from it to the card (`tests/world/i3_real.test.mjs`) |
| 9 | **GDD 5** ("use range 2.2 m, the prompt from 3.0 m") | **One reach: 3.0 m for the prompt and for the key** (`USE_RANGE` = `PROMPT_RANGE`; ruling R1). A thing that is offered can be used | `H_lock.log`: the bay locker at 2.49 m, prompt "E TAKE" on, `E` takes the round (it did nothing) |
| 10 | GDD 12.1 (the run hint) | **`ui_hint_sprint` no longer waits for the narrator to fall silent once she has walked 15 m since it was first owed** (`SPRINT_WALKED`): it is shown beside a line (its own row), still never under a movement card, in a fight or in a puzzle volume. **A showing shorter than 2 s is not one of its two** and comes back at the next open moment | `I_open.log`: shown 18.4 to 26.4 s, z 62 to 25 of the gully, beside two lines (it was 31.3 to 31.9 s, at the gate) |
| 11 | GDD 6.6, 14 (the kept ladder) | **`F` off the mark in phase 3a says `hint_kept_2` at once** and outlines the nearest mark; not again within 12 s (`DENIED_AGAIN`). **The key's prompt comes with the ladder's second tier** (30 s after the Windlass first asks; it was the third, 45 s) | `G_kept.log`: the press 3.0 s, the line on its tick (it was nothing); the prompt 42.0 s (59.3) |
| 12 | GDD 8.2, 14 (ruling R2), `src/enemies/defs.ts` (`teachDeaths`, `moveDeaths`: unchanged) | **The first stake or canister that lands on her in phase 1 or 2 says `hint_boss_move` at once (once a run); the first retry of the fight says `hint_boss_haul` 0.5 s after she has control** (and `hint_boss_move` behind it if no hit had). The Windlass's own sayings stay as the repeat (second death in a phase; first haul of a try), except that `hint_boss_haul` is not shown again within 40 s of the world's (`StoryApi.mute`, `HINT_ECHO`) | `F_boss.log` (Normal, no input): `hint_boss_move` 7.3 s (it was 39.5 s, after two deaths), death 13.0, retry 14.8, `hint_boss_haul` 15.3 (33.2), second death 31.4, the Windlass's `hint_boss_move` 33.7 (`F_hit.png`) |
| 13 | GDD 8.1 (the asking), I2.1 row 7 | **The asking's lines are held 4 / 4 / 4 / 3 / 3 / 5 s** (`PARLEY_FIRST_HOLD`, `PARLEY_SPOKEN_HOLD`, `PARLEY_ROLL_HOLD`; story.json says 5.5 / 4.5 / 4.5 / 3.5 / 3.5 / 5). The Windlass follows each line as held (the enemies team's pass i3 change), so with a free line box **the six open 19.25 s after the first line and phase 1 begins at 24.25 s** (22.75 and 27.75) | `K_parley.log` (the reviewer's driver): seal 28.8, inspection 50.2 (21.4 s; it was 24.9), phase 1 at 55.2 (**26.4 s; it was 29.9**). `tests/world/i2_real.test.mjs` |
| 14 | this file, I2.1 row 9 | The playthrough by input on the shared tree while four teams were editing: 31 395 ticks, 89 rounds, 35 freed, 0 deaths, hash `aa5c3e62`, the same on a second load, 17 of 17 checkpoints restore; the closer's number is the one to print | `scratch/i3-team-world/e2e_playthrough.log` |

### I3.2 Not done, or done in part, with the reason

| # | Issue | State |
|---|---|---|
| 1 | "About thirty seconds of standing through the parley": about 20 s asked for | **In part: 29.9 -> 26.4 s** as the reviewer played it (24.25 s from the first line with a free line box). What is left is not the world's: (a) the merged roll-call line is a text change (`design/story.json`, frozen; 89 characters against the 84 of the subtitle rule: it needs new wording), worth 3 s more; (b) the 4 s the six stand open and the second after it are the Windlass's (`src/enemies`, active team; kept by them for the free cylinder); (c) the first line waits out a narrator's line that is on screen at the seal (2.1 s in that run). The enemies team added, in this pass, the six mouth lamps coming on in turn under the roll-call and a skip of a second hearing (`docs/requests/enemies.md`, "Pass i3") |
| 2 | "Lower the view-model when `nar_fire` STARTS" | Done on `ending/fire`, the tick the fire catches and the line is asked for (the line starts within 0.3 s of it). Lowering earlier would need a new event or a `PlayerApi` method (contracts are frozen) |
| 3 | "move `trg_peg_stair` to the top of the stair", "move `prop_camp_three`", "move the trough": layout moves | Not moved (`design/layout.json` is frozen and a change rebuilds 105 assets): carried as constants in `src/world/director.ts`; rows I3.3.2 to 5 ask for the fields |
| 4 | A player who never breaks step from the hatch and walks on more than 2.5 m into the bay inside 5.3 s still does not hear `nar_pegs_2` | Said plainly: the two lines take 9.75 s and the stair takes 4.7 s at a walk. The line is said to anyone who slows for a second anywhere on the stair or stops at the foot; it is never said about the stair from the bay |
| 5 | With reduce-motion the view is not eased, so `nar_rim_3` in a branch may be said with the Rule out of frame | Left: reduce-motion is hers; the line is never lost |

### I3.3 Requests

| # | To | What | Why |
|---|---|---|---|
| 1 | closer (`design/story.json`) | `meta.rules.never_stale`: remove `nar_tally_cloth`, add `nar_rule` and `nar_rim_3` (then `UNKEPT` / `KEEP_ALSO` in `src/world/story.ts` can go; `LATE_OK` already keeps `nar_rim_3`). `meta.rules.ending_branch`: `take` = take 1, take 2, [lamps], [rim 2, rim 3], fire, last; `leave` likewise. `seconds`: `stn_parley_1` 4, `nar_parley` 4, `rv_ask` 4, `stn_parley_2` / `_3` 3 (then `StoryApi.hold` and the three `PARLEY_*_HOLD` can go). `nar_stone_short` is no longer said by anything | I3.1 rows 3, 6, 7, 13 |
| 2 | closer (`design/layout.json`, through `tools/gen_layout.mjs`) | `trg_peg_stair`: a second volume on flight 1 (pos [-90.25, -4.5, -33], size [6.5, 4.1, 2]) or the volume moved there; `lookAt` [-90.5, -1.2, -33] | I3.1 row 2 |
| 3 | closer (layout) | `trg_enc_street.params`: `heldStart: { line: "nar_kneeler", look: 24, cosDeg: 20, anyway: 20 }`, `lines` = [`nar_plenty`]; the note there ("the kneeler line first") is out of date | I3.1 row 4 |
| 4 | closer (layout) | `trg_windlass_seen.params.lookGate` (subject `vista_windlass`, 30 degrees, range 30, leave 8.5, cue `ratchet`, caption `cap_ratchet`) and `trg_ante_enter.params.lookGate` (subject `prop_camp_three`, 35 degrees, range 8, after 6, last 20). `trg_windlass_seen.params.bossLooksAtPlayer` is read by nothing | I3.1 row 5 |
| 5 | closer (documents) | GDD 5: "one reach, 3.0 m, for the prompt and the key" (it says 2.2 / 3.0). GDD 23 / LEVEL: rows I3.1 1 to 13. `docs/KNOWN_ISSUES.md`: the asking is 24 to 26 s (it says 28 to 30); "the watcher's line in the proving bay" and "the cloth's line after the fight" are closed | R1 |
| 6 | enemies | `BOSS.parley` in `src/enemies/defs.ts` is now only a fallback table; with row 1's `seconds` it would read `{ line1: 0, narrator: 4.25, ask: 8.5, line2: 12.75, line3: 16, line4: 19.25, windowEnd: 23.25, phase1: 24.25 }`. If the 4 s window or the 1 s after it can go down, the asking goes down with them | I3.2 row 1 |
| 7 | player (not active in this pass; edited by this team under the pass's rule) | `src/player/system.ts`: listeners on `ending/fire` (let the gun down), `weapon/fired` / `weapon/reload` (bring it back if she uses it), `game/state` to `loading` / `title` (give it back), and `__dbg.ext.player.lowered()`; `src/player/viewModel.ts`: `raise()`, `isLowered`. `tests/player/` passes (41) | I3.1 row 8 |
| 8 | ui | The prompt may now be up at 2.2 to 3.0 m with the key live: nothing to change. `ui_hint_sprint` can be shown while a subtitle is up (it has its own row: `I_g4.png`) | I3.1 rows 9, 10 |

## Closer, pass i3 (2026-10-07): decisions

| Row | Decision |
|---|---|
| I3.1 rows 1 to 13 | Mirrored: GDD 5 and 8.1 in place, GDD 23.17, LEVEL 18, ARCHITECTURE "Pass i3" |
| I3.2 row 1 (the asking's length) | **Closed by the text merge** (`docs/requests/enemies.md`, "Closer, pass i3"): 17.0 s to the open mouths, 22.0 s to phase 1 from the first line |
| I3.3 row 1, `never_stale` and `ending_branch` | **Declined**: `tests/world/i3.test.mjs` pins `nar_tally_cloth` in the list and `i1` / `i2` pin the branch lists; `UNKEPT`, `KEEP_ALSO` and `LATE_OK` carry the behaviour with no difference a player can see. The parley `seconds` ARE applied (3.5 / 4 / 4 / 4.5); the director's holds repeat the data |
| I3.3 rows 2 to 4, layout fields | **Declined as fields, applied as notes**: the constants stay in `src/world/director.ts` (one source); `trg_peg_stair`, `trg_enc_street`, `trg_windlass_seen` and `trg_ante_enter` carry a `note` in `design/layout.json` that states the behaviour and names the constant |
| I3.3 row 5 documents | Done; `docs/KNOWN_ISSUES.md` rewritten |
| I3.3 rows 6 to 8 | Noted; `BOSS.parley` rewritten for the merged text; `tests/player/` passes |

## Fixer, pass i4 (2026-10-08): what is ready for this team, and what is ruled


| Item | State |
|---|---|
| The end card's Time (two reviewers) | **Done in core** (`src/core/flow.ts` `carryStats`): the save takes the run's `playSeconds` and `deaths` from the live count before every restore of the run she is in, and stores it. `checkpoints.ts` needs no change; `tests/e2e/i4.test.mjs` |
| The asking | **four lines** (`nar_parley` is gone from the data and from `trg_enc_windlass.params.parley`), the roll-call six words: 12.75 s to the open mouths, 17.75 s to phase 1 from the first line. `PARLEY_FIRST_HOLD` / `PARLEY_ROLL_HOLD` / `PARLEY_SPOKEN_HOLD` still repeat the data and were not touched. **Ruled (GDD 23.18): the asking's first line may cut a narrator's line about the room behind her once that line has had 60 % of its hold.** That removes the last 2 s; it is yours |
| The leave ending (ruling R20) | `ending_branch.leave` is `nar_leave`, **`nar_leave_2`**, `nar_fire`, `nar_last`; `nar_take_1` is said only by a take. `ending.ts` reads the list; `tests/world/i1.test.mjs` and `i2.test.mjs` read it too. The rulings of p0, i1 and i3 that kept `nar_take_1` there are withdrawn |
| New lines for you | `nar_dowser_down` ("He turned and went down the far side.") for the pursued man's fail-safe exit |
| The yard | a packet at the foot of the bell post (`pk_rounds_6_yard_bell`). **The Transits were not staggered**: `director.ts` records at `ENTRY_PACKET_IN` that holding the third back was played in pass p0 and measured worse. If you want it anyway, `WAVE_RULES` can do it once the layout splits wave B: ask the closer |
| Underground files | core asks for the next resident set when she enters the last zone before it (the Tally House, the bore); your prefetch at the seam then finds them loaded |
| Ruled for the queue (GDD 23.18) | paired lines are one unit; a hint is never lost behind a line that only waits on a look; the Dowser is never taken away inside her view. All three are yours to build |
| Not possible in core alone | showing the title before the whole surface set is in (the performance reviewer): `buildSet('surface')` builds the three surface zones as one. If you can build the lip first and the street and Tally House behind the title, say what core must offer |

## World, pass i4 (2026-10-08): the eighteen issues, what changed, and what others must follow

The team's log is `scratch/i4-team-world/NOTES.md`; images are in `shots/i4-team-world/` (each one cited here was
opened). Tests: `tests/world/i4.test.mjs` (12, the real world beside core stubs), `tests/world/i4_real.test.mjs` (5, the
real game), ten new unit tests in `tests/world/story.spec.ts`, and edited expectations in `i1`, `i2`, `i3`, `i3_real`,
`misc`, `polish_r3`, `release_p0`, `seam` (each follows a deliberate change of the thing measured; none was loosened).

### I4.1 What changed (ruling R1: the closer mirrors these into GDD, LEVEL and ARCHITECTURE)

| # | Issue | Change (file) | Number or rule for the documents |
|---|---|---|---|
| 1 | The "dead plumb" thread leaned 7 degrees in the locked last frame; in the leave branch two scenery lines stood between the choice and the fire | `ending.ts`: the eased view comes to rest `END_PITCH_DEG` = 1.25 degrees above level (it was 8.8: the fire's bearing + 12 of lift), also when the fire was already in her view; the leave branch says the thread's and the Rule's lines BEFORE `nar_leave`, with her view eased to the plain under them | GDD 9.8: the last frame is level; the land's edge is at about 55 % of the frame's height (it was 63 %). Leave order: lamps, `nar_rim_2`, `nar_rim_3`, `nar_leave`, `nar_leave_2`, the fire. Measured on High at 1280 x 720: thread 0.95 to 0.98 degrees off vertical (7.2 before), the Rule 9.1 |
| 2 | The pursued man was taken away under a stare | `director.ts` `SIGHT_OFF` 66, `SIGHT_STAYS` 40, `SIGHT_DOWN` 1.5: he goes only when he has been out of her FRAME (66 degrees off the middle of her view) for 2 s (0.5 s once the door is open) after a second of being looked at; the beat's 12 s clock no longer takes him (it still opens the door); stared at for 40 s he goes down behind the skyline over 1.5 s under `nar_dowser_down` (his quad is cropped from the boots up at its foot line: sunk, it slid over the mesa's face); walked away from with him still in frame, the card stays until it is out of it | GDD 9.3 and `trg_dowser.params.goesWhen` / `clockSeconds` notes (layout, frozen for us) |
| 3 | Place-bound lines said in the next place | `story.ts`: a PRESENT line takes a narrator's line down once that has had `PRESENT_READ` = 60 % of its hold (never one the story stands on, never another present line, never its own first half); a line that waits for its subject does not go stale waiting and is dropped when its subject is gone for good. `director.ts` `PLACE_LINES`: `nar_tally_hearth` is said only with the cup within 8 m and inside 60 degrees of the middle of her view, and dropped when she leaves the Tally House | GDD 12.1 / 23.18. Real game: the watcher is named 0.42 s after the look (2.3 s before) |
| 4 | The run hint half way down the gully | `interact.ts` `SPRINT_WALKED` 15 -> 3 m; only the game's title card holds it back (`TITLE_CARD`), a movement card does not | GDD 12.1: shown 5.9 s after "Begin" at z 79 of 97 .. 4 (it was 16.9 s, z 62); `shots/i4-team-world/sprint_hint_under_card.png` |
| 5 | The embers named to a wall | `director.ts` `LOOK_GATES.trg_ante_enter`: `last` 20 -> 0, `until: 'door_bore'` (once the bore door is no longer shut the lines are not said at all) | LEVEL: `trg_ante_enter` note |
| 6 | The asking | `story.ts` `StoryQueue.open`: the asking's first line takes ANY narrator's line down once it has had 60 % of its hold, unless that line's continuation is still to come | GDD 8.1 / 23.18: "until then up to 2 s are added" can go. `PARLEY_*_HOLD` still only repeat the data |
| 7 | "Lines of three or more: 0" after the proving line | `puzzles/proving_line.ts`, `index.ts`: the puzzle counts its own solving line round (once a shot, `State.lineCounted`) | GDD 12.3 |
| 8 | Half of a pair without its first half | `story.ts` `Story.orphan`: when a narrator's line is dropped unheard, its continuation (`_2` after the bare key or `_1`, `_3` after `_2`) is dropped with it, waiting or asked for later; never a line of `never_stale` or the rim's | GDD 12.1 / 23.18 |
| 9 | "Go on" was silent | `checkpoints.ts`: a run taken up from the title shows the card of the movement the checkpoint lies in, if it had been shown before the save (`StoryApi.recard`); a death does not | GDD 12.2. The reviewer's 15 silent seconds at `cp_lip_gate` were also the bot standing 0.3 m short of `trg_enc_street`'s volume: a player who walks on gets "II. Plenty" 1.5 s later as before |
| 10 | **Major**: the jug gate's worded hints lost while `nar_rule` waits | `story.ts` `hintFree`: for a hint the queue is free when nothing is on screen and everything in line only waits on its subject | GDD 13 / 23.18 |
| 11 | The kept round's hint never said under the Windlass's talk | `story.ts` `REPEAT_REST`: `stn_boss_refilled` and `stn_boss_head_dry_refilling` are not said again within 20 s, whoever asks; `kept.ts` says its two ladder lines with `sayHint` (next in line, over a station line that has been read) | GDD 6.6, 8.2 |
| 12 | "LEFT CLICK to fire" never left | `interact.ts` `FIRE_HINT_SECONDS` 8, `FIRE_AGAIN` 40, `FIRE_HINT_SHOWS` 2; down when the gate's puzzle is solved or she leaves its volume | GDD 12.1 ("the walk, run and interact hints" becomes "the walk, run, interact and fire hints") |
| 13 | The Tally House rising costs nothing | `director.ts` `WAVE_RULES['enc_tally/A'].stagger` = `TALLY_STAGGER` 2.5 s: the riser nearer her at once, the other 2.5 s on with its own chair scrape | GDD 10. **Only half done**: see I4.2 |
| 14 | The plate's lines through the file fight | `director.ts` `READ_SETS`: a readable's lines do not begin inside a fight; begun before it they are heard out and the fight's announcing lines stand behind them (`StoryApi.sayBehind`) | GDD 12.1 |
| 16 | Nothing points at the secrets | The two pointers existed (pass p0) and were too faint. `interact.ts`: `BELL_NEAR` 22 -> 12 m with a 1.5 s glint on the bell at each ring; the cold bay's seam breathes and its knot glints through the slot every 4 s within 14 m, out of a fight | GDD 11 |
| 18 | A BVH build inside a frame on the peg stair | `build.ts`: the solids of the whole set below stand from the surface build on (everything underground lies under y = -2, the surface above y = -1), so the swap on the stair builds no BVH; the drop of the surface and the activation of the set below are two slices | ARCHITECTURE 6 / 3.6: "the static set of the surface holds the underground's solids too; a restore or a warp straight underground builds that set alone" |

Issue 15 (the end card's Time) is core's, done by the fixer. Issue 17: see I4.2.

### I4.2 Not done, with the numbers

| Issue | What was tried | Result |
|---|---|---|
| 13 the Tally House costs a careless player health | The reviewers' proxies from `cp_tally_enter` (`scratch/i4-team-world/tb_*.log`, `ts_*.log`): before, careless 18 / 0, plain 0, the fight 6.2 s; with the stagger, 0 / 0 / 0, 7.4 to 8.0 s | The rising is two beats now, not one, and still free. A third riser would break "Nine kept their seats" and the lamp count. **What would cost her is the enemies' number: a faster first lunge for a Bider that has just risen from a seat** (asked in I4.3) |
| 17 the yard and the file kill an average player | Mid proxy (reaction 0.5 s, aim error 0.17 m + 0.02 a metre, no back-pedal), seeds 1 to 3, `cp_street_clear` to `cp_yard_clear`: as it stands 2 deaths / 0 / 0, stakes 152 / 22 / 44 (`yb_m*.log`). The reviewer's fix, the third Transit 4 s behind the second: 0 / 3 deaths / 0, stakes 106 / 383 / 44 (`ys4_m*.log`): **worse**, as pass p0 measured. A canteen from the first enemy put down under 34 health changed no run of the yard or the file (`yc_m*`, `fc_m*` = `fn_m*`) | Both withdrawn; the waves are as the layout says. The yard has three sources of lead now (the entry packet, the tin, the fixer's packet at the bell post). The other half of the issue, a Windlass that kills nobody, is the enemies' |
| 18 the real-loop frame times | The proof is a test (`tests/world/seam.test.mjs`: no `collision.setStatic` between the day-cell and the foot of the stair). The frames were not measured again in the real loop | A worker-built or serialised BVH is core's (I4.3) |

### I4.3 Requests

| # | To | Request |
|---|---|---|
| 1 | closer (documents, layout notes) | Mirror I4.1 into GDD 6.6, 8.1, 9.3, 9.8, 10, 11, 12.1 to 12.3, 13 and 23.18, LEVEL and ARCHITECTURE. `trg_dowser.params.goesWhen`, `clockSeconds` and `vista_dowser.params.visibleSeconds` describe the old rule; `trg_ante_enter.params.note` says "at 20 s whatever she faces"; `prop_cup_two.params.line` says the fight's end is the fallback (it now waits for the cup to be in view). `docs/KNOWN_ISSUES.md`: the secrets' pointers; the Tally House |
| 2 | enemies | (a) R3, the Tally House: a Bider woken from `sit_table` should make its first lunge sooner or faster; the world now stands them 2.5 s apart. (b) The Windlass's `stn_boss_refilled` and `stn_boss_head_dry_refilling` are held to once in 20 s each by the world's queue whatever you ask (`REPEAT_REST`): you may stop repeating them. (c) Issue 17's other half is yours: the Windlass killed no proxy in 14 legs |
| 3 | audio | The cold bay's knot has no sound of its own: a faint hum at `knot_cold_bay` while `sec_cold_bay` is not found would complete the pointer (cue and caption key are yours and the closer's). The loft bell is rung with `step_chime` at pitch 0.75, gain 0.8, now from 12 m |
| 4 | exterior-look | (a) The last frame is LEVEL now (`END_PITCH_DEG` 1.25, `src/world/ending.ts`): the land's edge is at about 55 % of the frame's height and the dune below it fills the lower 40 % (`shots/i4-team-world/end_leave_09_nar_last.png`). That foreground is yours to light; the pitch cannot go above about 1.9 degrees without the thread leaning again (at 80 degrees of field of view: 1.3). (b) The pursued man's quad is cropped at its own foot line when he goes down (`SIGHT_SINK` 5 % of his height under it): whatever he is made to stand on should meet that line (`shots/i4-team-world/dowser_39s.png`: his boots are still a few pixels over the mesa's top) |
| 5 | ui | `ui_hint_sprint` can now be up under a movement card ("I. The Lip") and beside a subtitle (`shots/i4-team-world/sprint_hint_under_card.png`); `ui_hint_fire` is lowered by the world after 8 s. Nothing to change unless you want the fire hint in `LAZY_HINTS` too |
| 6 | core | (a) A BVH built off the main thread or shipped with the assets: the world no longer builds one on the stair, but the lift's dark still builds the coda's, and every restore builds one behind the loading screen. (b) The title before the whole surface set (the fixer's question): the world can build the lip alone and stage the street and the Tally House behind the title as it stages the gallery (`build.ts` `enterSeam`, slices). It needs from core: the surface set's files asked for in two parts (the lip's assets first: `assets.prefetch(set, ids)` as `activate(set, ids)` already is), `flow.ts` showing the title when `world.buildSet` has built the first part, "Begin" waiting (or the gully's gate staying shut) until the rest is built, and a contract for it (`WorldApi.buildSet(set, { first })` or `buildRest()`): `contracts.ts` is frozen. Not attempted in this pass |

## Closer, pass i4 (2026-10-08): decisions

| Row | Decision |
|---|---|
| I4.1 rows 1 to 18 | Mirrored: GDD 23.19, LEVEL 19, ARCHITECTURE "Pass i4 (closer)" |
| I4.3 row 1 layout notes | **Applied** in `tools/gen_layout.mjs` (notes only; `vista_dowser.visibleSeconds` 40): `trg_dowser`, `vista_dowser`, `trg_ante_enter`, `prop_cup_two`; every asset rebuilt after it |
| I4.3 row 2 (a) the Tally House, (c) the Windlass | **Not built**: see `docs/requests/enemies.md` and `docs/KNOWN_ISSUES.md` |
| I4.3 row 3 a hum for the cold bay's knot | **Not built** (a cue and a caption key pinned by `tests/audio/logic.spec.ts`); known issue |
| I4.3 row 6 core: a BVH off the main thread; the title before the whole surface set | **Not built** (a contract change); known issue |
| Enemies' ask 2.1 | Applied by the closer (above file) |

## Pass i5 (world team, 2026-10-08): the pursued man on the tank roof

### I5.1 Done

| # | Issue (both visual reviewers, a major each; R4, R18) | Change | Proof |
|---|---|---|---|
| 1 | From the yard gate and the east half of the yard the pursued man reads as a man standing on the pump tank; further west he slides behind it and comes out beside it in the air | `src/world/director.ts` (`SIGHT_RISE` 0.35 s, `SIGHT_CLEAN_UNDER` 1.0, `SIGHT_CLEAN_SIDE` 0.9, `SIGHT_CLEAN_EVERY` 4 ticks, `sightLineClean`, `sightUp`). His card is drawn only where her line to him is CLEAN: six sight lines against the yard's collision, measured in his drawn heights (his middle; his feet 0.9 heights to either side; the rock one height under his feet in the middle and 0.9 to either side). Where it is clean he comes up over the rim in 0.35 s (the crop of `SIGHT_DOWN` run backwards: no pop, no fade through the sky) and steps down as fast where she leaves it; while he is down the card's group is invisible and stands 4 km under the world, so the rod's glint (a renderer card that follows the card's node) is gone with him. The beat (line, look, door clock's hold) runs only while he stands. Looked at for her second and then walked out of the clean strip: he goes down for good under `nar_dowser_down` and the door opens. `nar_dowser_shot` is not said while he is down. | Where it is clean (real collision, one metre grid, `scratch/i5-team-world/probe2.mjs low after map`): the strip before the tally door, z -10 to -12 for x -99 to -81 (z -8 and -13 west of x -88; `trg_dowser` is x -95 to -82, z -13.6 to -7.8), and the north yard z 2 to 8; never the gate, the east half, the yard's middle or the tank's lee. Frames opened: `shots/i5-team-world/sheet_test_low.jpg` (gate, east, middle: no figure; mid-rise; vista, door, north: on his rock), `sheet_after_high.jpg` (High), `crop_rise_vs_standing.jpg` (24 px of 52 over the rim, 0.18 s in). Tests: `tests/world/i5.test.mjs` (4), `tests/world/i5_real.test.mjs` (720p, real game: 0 meshes of his card drawn from the three reviewers' places; 52 px tall at the vista, the door and the north yard) |

Gate after the change: `npx tsc --noEmit` clean; `node --test tests/world/` 168 of 168 (the one failure of the first run was the 40 s window of `tests/world/i4.test.mjs`, widened by the 0.35 s of the rise); `KEEP7_REAL=all node --test tests/core/` 76 of 76; `node --test tests/e2e/` 29 of 29. The playthrough by input is still 28 647 ticks, 83 rounds, 31 freed, 0 deaths; its hash is now `d1e66cb0` (it was `288d9761`: the director's debug state has two new fields), the same on a second load.

### I5.2 Requests

| # | To | Request |
|---|---|---|
| 1 | closer (documents, layout notes) | Mirror I5.1 into GDD 9.3 / 23.x and LEVEL. `trg_dowser.params.drawsEye` ("a sun-glint off the rod every 1.5 s from the moment enc_yard is clear") and `startsWhen` are stale: the glint and the figure are there from the moment her line to him is clean (the strip before the tally door, the north yard), and the beat starts when she is inside the volume, he stands, and he is within the view cone. INTEGRATION_REPORT's playthrough hash: `d1e66cb0`. |
| 2 | exterior-look | (a) The rimrock (`world_sight_rock`) still stands whenever the street is built; from the gate its cap is behind the tank and nothing of it reads over the roof (`shots/i5-team-world/test_gate.png`). (b) If the wall stump north of the vista line or the tank is moved or rebuilt, the clean strip moves with the collision: `tests/world/i5.test.mjs` test 2 names the eight places that must stay clean. |
| 3 | render-tech, enemies | Nothing needed. `tests/render/polish.test.mjs` (the far card's frame from the vista) and `tests/enemies/vignettes.test.mjs` play the vignette themselves; they were not run by this team. |

## Closer, pass i5 (2026-10-08): decisions

| Row | Decision |
|---|---|
| I5.2 row 1 (documents, layout notes, the hash) | **Applied.** `tools/gen_layout.mjs`: `trg_dowser.params.startsWhen` and `drawsEye` rewritten (notes only; `design/layout.json` regenerated). Mirrored: GDD 23.20, LEVEL 20, ARCHITECTURE "Pass i5 (closer)". The playthrough hash is in INTEGRATION_REPORT Part S |
| I5.2 row 2 (exterior-look) | Noted in LEVEL 20; `tests/world/i5.test.mjs` is run on the final rebuilt tree (Part S gate) |
| The narrower eye-draw from the east yard | **Accepted as built**, not playtested by a person: in `docs/KNOWN_ISSUES.md` |

## Pass i6 (world team, 2026-10-08): the pursued man over the tank while he stepped down

### I6.1 Done

| # | Issue (visual reviewer b, minor; R18) | Change | Proof |
|---|---|---|---|
| 1 | When her line to him stops being clean he goes down, but for the first ticks after she leaves the strip he is still drawn over the pump tank's rim from the yard gate (a man standing on the tank) | `src/world/director.ts` `tickSighting`. The cause: the clean line was tried every 4th tick (`SIGHT_CLEAN_EVERY`) and he then stepped down over `SIGHT_RISE` (0.35 s, 21 ticks), so up to 25 ticks of him were drawn from a place where the skyline is not his. Now the line is tried on EVERY tick while anything of him shows (every 4th only while he is down), and on the tick it is not clean `sightUp` is 0: he is not drawn in the frame that follows. He still comes UP over the rim in 0.35 s, and the seen walk-down (`SIGHT_DOWN`, 1.5 s) remains for the stared-at case alone (`SIGHT_STAYS`, 40 s, on a clean line). Looked at for her second and then out of the strip: the beat still ends under `nar_dowser_down` and the door opens; he is simply not drawn meanwhile. The card that pass i4 left standing "while it is in her frame" after she has gone into the Tally House is under the same rule: it is taken the moment her line to it is not clean (from inside the house the line is through its west wall, never clean) | Before: `sightUp` 0.95 one tick after a teleport from the strip to the gate; `shots/i6-team-world/before_gate_tick1.png` (opened: the figure on the tank's rim under the pump tower). After: `shots/i6-team-world/test_gate_tick1.png` (opened: same frame, no figure), `test_strip.png` (opened: he stands on the mesa from the strip). Real game, 720p: 0 meshes of his card in the draw list and the card 4 km under the world on tick 1 and tick 6 from the gate, the east yard and the pump (`tests/world/i6_real.test.mjs`). Walked at 6 m/s from the vista to the gate with her eyes on him, read every tick: 155 ticks, he shows on 9, the line is first not clean on tick 10, he shows while it is not clean on 0 (`tests/world/i6.test.mjs`, 3 tests; the two that test the hiding, and the real-game one, failed before the change). `tests/world/i4.test.mjs` (the Tally House case) rewritten to the new rule |

### I6.2 Requests

| # | To | Request |
|---|---|---|
| 1 | closer (documents) | LEVEL 20, the sighting row, and GDD 23.20: "he comes up over the rim in 0.35 s and steps down as fast" becomes "he comes up over the rim in 0.35 s; where her line to him stops being clean he is not drawn from that tick (tried every tick while he shows)". The ghost card of pass i4 (GDD 23.x, "his card stands while it is in her frame" after she enters the Tally House) now also needs a clean line, which the house never gives. `trg_dowser.params.drawsEye` in `tools/gen_layout.mjs` needs no change (it only speaks of the rise). |
| 2 | everyone | No request. Nothing outside `src/world/` and `tests/world/` was edited. |

Gate after the change (run one file at a time): `npx tsc --noEmit` clean; `tests/world/` 30 files, 172 of 172 (i4's Tally House case rewritten, see I6.1); `KEEP7_REAL=all node --test tests/core/` 76 of 76; `node --test tests/e2e/playthrough.test.mjs` 4 of 4. The playthrough by input is still 28 647 ticks, 83 rounds, 31 freed, 0 deaths, the same on a second load; its hash is now `1938ee81` (it was `d1e66cb0`: the director's sighting state, `sightUp` / `sightClean`, is in the hashed debug state and is now 0 / false wherever her line to him is not clean). Closer: INTEGRATION_REPORT's hash. The rest of `tests/e2e/` was not rerun by this team.

## Closer, pass i6 (2026-10-08): decisions

| Row | Decision |
|---|---|
| I6.2 row 1 (documents, the hash) | **Mirrored**: GDD 23.20 in place and 23.21, LEVEL 21, ARCHITECTURE "Pass i6 (closer)"; the hash is in INTEGRATION_REPORT Part T |
| Not checked on High | The real-game test and the hero leg of the sighting are run on High in Part T |
