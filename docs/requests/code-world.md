# Requests and notes from `code-world` (phase 3, round 1)

Owner of `src/world/**`, `sandbox/world.*`, `tests/world/**`, `shots/code-world/`. Nothing outside those files was
edited. Scratch experiments named below are in `scratch/code-world/`.

## 1. To core (`tests/core/`, `src/core/stubs/`): what `KEEP7_REAL=world node --test tests/core/` fails on

Measured on 2026-10-04 on a very busy machine (load average 125 to 155): 68 tests, 56 pass, 7 fail, 5 skipped,
1172 s. Three of the seven are caused by the real world; four fail (or time out) with core stubs in every slot too.

### 1.1 Caused by the real world, by design (stub-specific assertions)

| Test (`tests/core/`) | Assertion | Stub value | Real value | Why the real one is right |
|---|---|---|---|---|
| `flow.test.mjs:111` "a new run gives a fresh player" | `play after quit: the starting reserve` | 18 | 24 expected, 18 got | The test takes `fresh` from the state after `?cp=cp_street_clear`. The real `warpToCheckpoint` synthesises a save with **6 + 24 lead** (order 4.9; GDD 6: "start 6 + 24"), so `fresh.reserve` is 24; the new run then gets the dummy player's own start (18). The stub world's warp does not touch the player, so both are 18 there. Ask: take `fresh` from a new run rather than from a warp, or give `dummyPlayer` the GDD's 24. |
| `flow.test.mjs:163` "continue resumes the stored save" | `stored.player.health === 35` after `setHealth 35` + `checkpoint('cp_hall_clear')` | 35 | 100 | `dbg.checkpoint` is `warpToCheckpoint`, whose synthesised save has **full health** (order 4.9). The stub's warp commits the live player. Ask: commit the 35 HP save with `emit('checkpoint/reached', …)` (or `clearEncounter('enc_matador')`, which commits `cp_hall_clear` through play) instead of a warp. |
| `alloc.test.mjs:29` | `a tick plus a rendered frame` ≤ 6144 B | 2.8 KB | **19.8 KB** | Not allocated by the world (the world's own tick measures 431 B fighting, 210 B walking in the same test; `tests/world` 499 / 210 B). See 1.2. |

### 1.2 The stub renderer allocates per frame as soon as real props are in the scene

The stub world draws no props; the real world instantiates every bound asset. `basicRender` (and the asset store's
material table) give one `MeshBasicMaterial` per material name (`m_prop`, `m_mask`, …) to **skinned, instanced and
plain meshes alike**. three then finds, on every draw whose mesh kind differs from the previous draw of that
material, that the cached program does not match (`materialProperties.skinning / instancing / …`) and runs
`getProgram → getParameters → getProgramCacheKey` again: a parameters object and a joined key string per switch,
every frame.

Evidence (`scratch/code-world/heapprof.mjs`, Chrome's sampling heap profiler over 600 frames at `cp_street_clear`):
20.1 KB per frame, of which 9.5 KB in `getParameters`, 4.0 KB in `getProgramCacheKey`, 1.6 KB in
`getTextureCacheKey`, 1.6 KB in the render-list sort. `scratch/code-world/alloc6.mjs` gives every (material, mesh
kind) pair its own clone of the material in the page and measures again: **19.7 KB → 5.5 KB per tick plus frame**
(14 materials become 18; the two shared ones were used by `instanced + skinned + plain` and `plain + skinned`).

Ask (core for the stub, `code-render` for the real renderer): one material instance per (material, skinned /
instanced / plain) variant. The world cannot fix this: it does not own materials and draws nothing itself.

### 1.3 Not caused by the world (they fail with core stubs in all six slots: `node --test tests/core/flow.test.mjs tests/core/sandbox.test.mjs tests/core/stubs.test.mjs`, same day)

| Test | What happens | Cause |
|---|---|---|
| `flow.test.mjs:69` "ui/action: restart_checkpoint … play again" | the player stands at `[16, 14.0041, 107.5]`, the test wants `player_start`'s `[16, 14, 107.5]` | `env_the_lip` is final art now: its `collider_terrain` sheet is 4.1 mm above the greybox terrain at the start marker. Same value with the stub world (`scratch/code-world/start_y.mjs stub`). The assertion needs a tolerance, or the sheet / marker an adjustment. |
| `sandbox.test.mjs:190` "viewer ?asset=" | the panel text of `ia_bore_door` (now `[final]`) | the viewer / final art, not a world file |
| `stubs.test.mjs:277` "real time: the dev page runs its own loop" | `page.waitForFunction` 90 s timeout | runs with `?stubs=all` (the real world is not loaded on that page); it passed in the stub-only run: machine load |
| `sandbox.test.mjs` viewer `?shot=1`, `?zone=`, `stubs.test.mjs` view-model (stub-only run) | timeouts at load average 150 | machine load |

## 2. To level design / the manifest (`design/*.json`): data the world had to supply in code

Each of these is a single constant or a small table in `src/world/`, with a comment naming this file. None is a
position or a player-facing string.

1. **`env_lift_shaft` has no binding.** The ride draws "only the cage and `env_lift_shaft`", but no marker or
   portal names the shaft asset. `rides.ts` holds the asset id (`SHAFT`) and places it at the cage marker, scaled
   to the cage's interior width. Ask: `nav.portals[].shaft: "env_lift_shaft"` (or a binding on the cage marker).
2. **The round a line locker offers has no binding.** Order 4.3: "a `prop_cartridge_line` shown at `round_slot`".
   `interact.ts` holds the asset id (`LOCKER_ROUND`). Ask: a second binding on `interact.ia_line_locker`
   (`asset: prop_cartridge_line`, `at: round_slot`).
3. **Wave conditions that exist only as `when` text.** `layout.encounters[].waves[]` carries `delay`, `atSeconds`,
   `afterWaveDownSeconds`, `orAtSeconds`, `cancelledIf` for `enc_file` and `enc_matador`, but for `enc_street` and
   `enc_yard` the rule is prose ("A down, or 8 s after A is hit or reaches 15 m", "B down to 1, or 12 s", "T1 dead,
   or 40 s", "B + 16 s and at most 3 alive"). `director.ts` keeps them in `WAVE_RULES` (six rows, GDD 10's numbers).
   Ask: machine-readable fields (`downTo`, `orAtSeconds`, `orAfterHitSeconds`, `afterWave`, `aliveAtMost`).
4. **`enc_street` wave B, "or reaches 15 m".** How far the kneeler has walked is the enemies module's to know and
   there is no event for it. The world stands it in with **14 s after the kneeler rises** (its walk speed over
   15 m), beside "A down" and "8 s after A is first hit", which are exact. Ask (`code-enemies`): an event when a
   member of wave A is within 15 m of the player, or accept the clock.
5. **The route for `warpToCheckpoint`.** What is solved, cleared, open and flagged at each checkpoint is not in the
   layout (the checkpoint markers carry only `when` text). `checkpoints.ts` keeps three tables (`PROGRESS`,
   `DOOR_OPEN`, `FLAG_FROM`) keyed by checkpoint, door and flag ids, and `director.ts` two more (`PREREQUISITE`: the
   puzzle in front of an encounter; `BOSS_CHECKPOINT`: boss phase → checkpoint). These are the only id tables in the
   module; they are checked by `tests/world/checkpoints.test.mjs` (every checkpoint by warp: set, doors, puzzles,
   objective). Ask: `checkpoint.params.after: { puzzles, encounters, doorsOpen, flags }` in the layout, and the
   tables go.
6. **The stone's glint sprite.** `light_rim_stone_glint.params.sprite` is `star4`; `CardKind` in
   `src/core/contracts.ts` has no `star4`. The world acquires `aim_star` (the contract's four-point star). Ask
   (core / render): a `star4` card kind, or confirm `aim_star`.
7. **Dressing inside a lift cage.** A ride puts her in the arrival cage exactly where she stood in the departure
   cage, so nothing solid may stand in either. `build.ts` gives no box collider to a `collision: "box"` dressing
   empty whose pivot is inside a cage's interior (`nav.portals[].cageInterior`). Ask (`art-env-interior`): keep
   `inst_` / `brk_` empties out of the cages.

## 3. Order versus source: where the order has a bug and the source was followed

1. **`proving_line` assist: the order's "within 0.6 m of `knot_a` *and* within 3° of the authored true line"**
   (4.4) contradicts **GDD 13.3 "Standing anywhere on the step works"** and the order's own test ("solved from each
   corner … of the step"). From a corner of `gl_mark_step` a ray aimed at `knot_a` is **5.7°** off the authored
   line. The GDD wins: on the step the assist is the 0.6 m test alone; T4 widens it to any line round within 10° of
   the true line. Off the step (0.3 m) nothing is assisted (tested at FOV 50, 62, 80).
2. **`knot_a` is hidden from two corners of the step.** From the two corners of `gl_mark_step` nearest the gallery
   the end of the south pipe bank (`gl_pipes_s_w`) stands between her eye and `knot_a`'s centre, so a line round
   aimed at the knot through the sighting loop stops on the pipe before it reaches the enlarged volume. So that
   "anywhere on the step" holds, `proving_line.ts` also judges the assist from the shot itself (`weapon/fired`: a
   line round fired from the step whose ray passes within 0.6 m of `knot_a`), whether or not the round reached the
   volume. Ask (level design): pull `gl_pipes_s_w` back 0.4 m, or accept the code path. The test aims past the
   pipe end the way a player would.
3. **`hint_yard_knot`**: order 4.3 says "hint `hint_yard_knot` at 60 s"; GDD 14 says "T2 at 60 s". Same number;
   implemented from the marker's `params.hint` (`T2`, `atSeconds`): the line after 60 s within 12 m of the knot out of
   combat, repeating every 60 s (a `hint_*` key), suppressed with hints off.

## 4. What the layout left open, and what was assumed

- **Place checkpoints** are recognised by their `params.when` text (`start`, `entering …`, `foot of the stair`,
  `the lift opens …`): committed on the once-trigger whose volume holds the marker, else within 1.6 m; never while
  an encounter is live. Every other checkpoint is an event (puzzle solved, encounter cleared, boss phase).
- **The hatch-close condition** is read from `trg_hatch_close.params.when` ("y −3.5") with −3.5 as the default; the
  door also waits until her capsule is clear of the leaf's box.
- **Ride lines** (`stn_lift_1..3`) are spread evenly over the ride; the teleport of a ride that swaps no set is at
  its midpoint; a ride that swaps sets does so 1.5 s in (0.5 s after the gate has shut) and ends at
  `params.ride.seconds` or when the build resolves, whichever is later.
- **A door that joins two zones** belongs to the first built zone of `params.connects`.
- **Visibility of runtime props**: each stands in the chunk whose box holds it (the `low` part before a skyline
  chunk) and is drawn while that unit is; a prop in no chunk is drawn while any chunk of its zone is.
- **The wall diagrams** (`diagram_lamps`, `ante_diagram_lamps`) are lit six of seven (GDD 9.6: "six in a ring, one
  hung apart").
- **The first objective** fires on first control wherever she stands (`trg_open`: "fires on first control").
- **Dressing breakables**: the hit volume is a sphere from the asset's `placeholder.size` (0.12 to 0.6 m); caps of
  48 breakables and 24 dressing box colliders at a time (a zone past the cap gets no volume or box: raise the two
  constants in `build.ts` if final dressing needs more).

## 5. For the integrator

- `KEEP7_REAL=world`: walk, seam, determinism, budget, playthrough, boot, death and checkpoint tests pass; the three
  failures of 1.1 are stub-specific assertions; 1.3 is not the world's.
- The dark of a ride is `render.setVisible([])` plus the world hiding its own prop groups; under the stub renderer
  the clear colour stays the mood's sky colour, so a "dark ride" frame shows the cage against a flat tan
  (`shots/code-world/ride_lift_hall_mid_ride.png`). The real renderer must clear to black (or fog to black) when the
  unit list is empty.
- The listening ring, port lamps, mark glows, town windows and outlines are `render.lamps.*` / `setOutline` calls:
  under the stub renderer they are recorded, not all drawn (`asking_before.png` and `asking_mid_ring.png` are the
  same picture). The tests assert on the calls and on `lamp/set` / `asking/listen` events.

## 6. Fixer pass (after the round-1 critic): new requests and what changed

### 6.1 To level design (`design/layout.json`, `design/assets.json`)

8. **`door_jug_gate`: the marker is not where the gate is drawn.** The marker stands at x 1.0 (size 4 x 2.8 x 1, so its
   box is x 0.5 to 1.5) while the binding hangs `prop_stock_gate` at offset `[0, 0, -1.1]`: the hurdle is drawn at
   x 2.1 and the jugs at x 2.25 (`ia_jug_1..6`). With the collider on the marker she walked 0.6 m through the planks.
   `doors.ts` now builds a door's box on the plane of its bound instance whenever the binding's offset along the
   door's thickness is larger than the marker's half depth (only this door today), as thick as the asset's
   `placeholder.size[2]` (0.35 m): box x 1.925 to 2.275, she stops at x 2.625 (`tests/world/softlock.test.mjs`).
   Ask: move the marker to x 2.1 and drop the offset, or confirm the offset is the truth. The box cannot be made
   deeper toward the lip without burying the jugs' hit spheres (centre x 2.25, r 0.22) inside it, so her capsule
   still overlaps the hanging jugs by a few centimetres when she presses against the gate (the eye stays 0.15 m off a
   jug's surface): a 0.3 m deeper recess for the jugs, or a player-only collision flag, would cure that.
9. **The kept round's lines have no home in the layout.** `kept.ts` now reads them from `bore_opening.params.lines`
   (`notInBore`, `denied`, `seal`, `office`, `kept`, `proven`, `hint2`) and falls back to the story keys
   (`nar_down_the_bore`, `nar_not_for_firing`, `nar_seal`, `nar_office`, `nar_kept`, `stn_proven`, `hint_kept_2`)
   because the marker carries only `lead` and `line` today. Ask: add the seven names; the fallbacks then go.
10. **A door's opening cue.** `doors.ts` reads `params.cue` of the door marker first; no marker has one, so the table
    `OPEN_CUE` (`door_yard_gate: gate_bang`, `ia_hatch: hatch_iris`, `ia_baffle: baffle_grind`) still supplies them.
    Ask: `params.cue` on those three markers.
11. **Ids that remain in `src/world/` (all tables, none a position or a player-facing string):** `PROGRESS`,
    `DOOR_OPEN`, `FLAG_FROM` and the lines of `synth()` that name `enc_tally`, `cp_gallery_baffle`, `cp_boss_p1`,
    `cp_boss_proven` (`checkpoints.ts`: request 5 above removes them all); `WAVE_RULES` (request 3); `PREREQUISITE`,
    `BOSS_CHECKPOINT`, `BOSS_VALUES` (`director.ts`: request 5); the cue name `chairs_scrape` (the spawn marker has
    `cue: cap_chairs`, a caption key, not an `AudioCue`: ask for `audioCue`); `PUZZLE_CHECKPOINT` (`internals.ts`);
    `SHAFT`, `LOCKER_ROUND` (requests 1, 2); `ia_ammo_box` / `ia_line_locker*` as the *kinds* of interactable
    (`interact.ts`); the proven mood `L5p` (`director.moodOf`: ask for `zones[].moodProven`). Removed in this pass:
    `enc_file`, `trg_file_lines`, `enc_street`, `the_bore`, `enc_windlass` in `director.ts` and the story keys,
    `enc_windlass`, `cp_boss_proven`, `ia_proving_mark_1` in `kept.ts` (found from the data now).

### 6.2 To core (`src/core/contracts.ts`) and `code-ui`

12. **`interact/focus` cannot say "in range".** GDD 5: the prompt shows from 3.0 m, `E` works from 2.2 m. Between the
    two the prompt is up and `E` is dead, and the UI cannot dim it. Ask: `interact/focus { …, inRange: boolean }`
    (emitted again when it changes). Done locally, inside the GDD's numbers: for a thing below knee height (a note on
    a stone) the 2.2 m is measured along the ground, not from the eye 1.65 m above it, so `rd_note_lip` reads from
    2 m (`softlock.test.mjs`); a lever at 2.9 m still shows its prompt with `E` dead, as the GDD has it.

### 6.3 To `code-enemies`

13. **A dormant member hit while the world leaves its encounter idle.** The world starts an idle encounter from
    `enemy/damaged` / a death only when (a) the member's zone is drawn, (b) the puzzle in front of the encounter is
    solved (GDD 13: no combat until solved) and (c) for an encounter that locks doors, she stands inside its zone.
    Otherwise `world.encounter(id).state` is still `idle` after the event. Ask: a dormant actor of an encounter that is
    still `idle` on the tick after its `enemy/damaged` absorbs the hit (no health loss, no wake). With the stub's
    one-shot capsules such a member dies; the encounter then starts later with that member already counted down (never
    a soft-lock: `softlock.test.mjs`).
14. **`enc_street` wave B "or reaches 15 m"** (request 4) still stands.

### 6.4 To `code-render`: integration checks (frames re-shot with the real renderer)

`scratch/code-world/fx_real_render.mjs` and `fx_real_render2.mjs` run the real world beside the real renderer
(`startServer({ pieces: ['world', 'render'] })`, stubs in the other four slots), 2026-10-04:

| Frame (`shots/code-world/`) | World calls | What the real renderer shows | Check |
|---|---|---|---|
| `real_render_ride_lift_hall_mid.png` | `setVisible([])`, the cage and `env_lift_shaft` only, six lamp bars scrolled | the cage against a dark blue-green field, no level behind it | passes as "dark"; the six scrolling lamp bars are not told apart from the cage's own bars in a still: look at it in motion |
| `real_render_asking_ring_mid.png` | `lamps.setCount(listen_lamps, 6)`, `setBoost(cradle_lamp)` | six of twelve ring lamps lit clockwise from the top, the cradle's lamp bright, the diagram six of seven | passes |
| `real_render_daylight_north_open.png` | `acquireCard('sun_blade')` from `ia_shutter_n` to the share cloth, `acquireCard('sun_patch')` | the shutter is open; **no blade or patch is visible** | open: either the card kinds draw nothing yet or the blade is too faint in mood L2: render's to answer |
| not re-shot | `setOutline` (hint T3), `acquireCard('sand_thread')`, `acquireCard('aim_star')` (the stone glint), `lamps.setCount(town_windows, n)` | | to check at integration |

Under the stub renderer these remain recorded calls only (`shots/code-world/ride_lift_hall_mid_ride.png` is the cage
on flat tan; `asking_mid_ring.png` shows no lit lamps): the tests assert on the calls and events.

### 6.5 What the fixer changed in behaviour (for the integrator and other pieces)

- **One encounter at a time.** A knot with `startsEncounter` (`knot_yard_latch`, `knot_hatch_latch`) holds while any
  encounter is live: the round rings on it (`shootable/hit` kind `knot`, outcome `impact`) and it stays whole. And a
  save never holds a fight's start without the fight: for an encounter that is not cleared, `captureSave` drops
  `burst:<its knot>`, shuts the door that knot lets go and takes back the objective the knot set.
- **Locks are never shut in her face.** A `locksDoors` door that stands open when its encounter starts is shut and
  locked from the director's tick once she is inside the encounter's zone and 1.5 m clear of the door; until then it
  stays open (`door/state` with `locked: true` therefore comes a tick or more after `encounter/started`).
- **`encounter/last_enemy`** is also emitted on the tick of the kill that clears an encounter when it was never "one
  left with no wave to come" before (the Tamper killed with waves still on the clock), followed by the slow-motion
  beat and `encounter/cleared` on the same tick.
- **Once per run means through a death.** Lines and cards that have started are remembered for the run and are not
  said again after a restore; vignettes seen stay seen. `WorldSave.onceFlags` now also carries `q:<nn>:<key>` entries:
  the lines and cards that were still waiting when the save was taken, said again after a restore unless heard since.
  `__dbg.checkpoint(id)` (a warp) starts a fresh timeline: nothing heard, nothing seen.
- **A hint line that finds the queue busy is held** (one slot, the latest) and said when the queue is idle, unless the
  puzzle has moved on. Other hint rules are unchanged (never queued behind a line).

### 6.6 `KEEP7_REAL=world node --test tests/core/` after the fixer pass: NOT green (57 pass, 6 fail, 5 skipped of 68; 264 s)

Stated plainly: the wired-in gate fails 6. Three are attributable to the world slot, three are not. None changed in
this pass, because every one needs a file the world does not own (`scratch/code-world/fix_real.txt`).

| Failing test | Value | Whose | What it needs |
|---|---|---|---|
| `alloc.test.mjs` "a tick plus a rendered frame" | 19 822 B against 6 144 (the world's own tick: 490 B fighting, 210 B walking) | the **stub renderer** (`basicRender`) once real props are in the scene: section 1.2 | core: one material instance per (material, skinned / instanced / plain). **With the real renderer in the render slot the same measurement is 5 405 B** (`scratch/code-world/fx_alloc_real_render.mjs`: real world + real render, the method of `alloc.test.mjs`; samples 5 211 to 6 426 B, median under the ceiling with 0.7 KB to spare), so the pair that ships is inside the budget and the failure is the stub's |
| `flow.test.mjs` "a new run gives a fresh player" | reserve 18 !== 24 | world by design (order 4.9: a warp gives 6 + 24) | core: take `fresh` from a new run, not from a warp (section 1.1) |
| `flow.test.mjs` "continue resumes the stored save" | health 100 !== 35 | world by design (order 4.9: a warp gives full health) | core: commit the 35 HP save through an event, not a warp (section 1.1) |
| `flow.test.mjs` "restart_checkpoint ... play again" | y 14.0041 vs 14 | final art of `env_the_lip` (its `collider_terrain`); fails with stubs in all six slots | a tolerance in the test, or the sheet / marker |
| `walk.test.mjs` "random walks from every checkpoint" | "inside a solid" at `cp_lip_start` and `cp_lip_gate` on tick 0 | the same final terrain sheet under the test's own `capsuleFree` probe; fails identically with stubs in all six slots (`node --test tests/core/walk.test.mjs`, the critic's run) | core / `art-env-exterior` |
| `sandbox.test.mjs` "viewer ?asset=" | the panel text of `ia_bore_door` (`[final]`) | the viewer and final art | core |

## Art integrator, polish round 2 (2026-10-04): what was decided on the rows above

| Row | Decision |
|---|---|
| 2.6: `star4` is no `CardKind` | **APPLIED**: `light_rim_stone_glint.params.sprite` is `aim_star` |
| 6.1.8: `door_jug_gate` marker against the drawn gate | **CONFIRMED: the binding's offset is the truth** (marker and offset unchanged; `doors.ts` builds the box on the instance's plane) |
| 6.1.9: the kept round's line keys | **APPLIED**: `bore_opening.params.lines` carries `notInBore`, `denied`, `seal`, `office`, `kept`, `proven`, `hint2` (the story keys that were the fallbacks) |
| 6.1.10: opening cues | **APPLIED**: `params.cue` on `door_yard_gate` (`gate_bang`), `ia_hatch` (`hatch_iris`), `ia_baffle` (`baffle_grind`) |
| 3.2: `gl_pipes_s_w` hides `knot_a` from two corners of the step | **the code path is accepted**; the pipes stay |
| 2.1, 2.2, 2.3, 2.5, 6.1.11 (shaft and locker bindings, wave rules, checkpoint tables) | left for the code integrator: tables in `src/world/` |
| the start marker 4 mm above the plane (`flow.test.mjs`, random walks) | **FIXED** in the lip's terrain (`docs/requests/art-env-exterior.md`) |

## Code integrator, polish round 2 (2026-10-04): what was decided on the rows above

| Row | Decision |
|---|---|
| 1.1, `flow.test.mjs` "a new run gives a fresh player" (18 against 24) | passes with all six real systems (the real player's own start is 6 + 24); no change needed |
| 1.1, `flow.test.mjs` "continue resumes the stored save" (100 against 35) | **APPLIED**: the test commits the 35 HP save through play (`clearEncounter('enc_matador')`, then `checkpoint/saved`) instead of a warp |
| 1.2, the stub renderer allocates per frame with real props | **NOT CHANGED** in the stub; with the real renderer 4.4 KB per tick + frame (see `code-player.md`) |
| 2.1, 2.2, 2.3, 2.5, 6.1.11: tables that should be layout data | **RULED: they stay in `src/world/`** this round. A layout change makes every asset stale (a 6.5 minute rebuild) and none of the tables is a position or a player-facing string; `tests/world/checkpoints.test.mjs` holds them to the layout. Left for a round with a level owner |
| 2.4 / 6.3.14, `enc_street` wave B "or reaches 15 m" | **RULED: the clock stands** (14 s after the kneeler rises) |
| 2.7, dressing inside a lift cage | stands (no box collider for dressing inside a cage) |
| 6.2.12, `interact/focus { inRange }` | **NOT APPLIED** (a contract change); between 2.2 and 3.0 m the prompt is up and `E` is dead, as the GDD has it |
| 6.3.13, a dormant member hit while its encounter is idle | stands as built (never a soft-lock) |
| 6.4, `sun_blade` / `sun_patch` with the real renderer | **CHECKED**: the blade is drawn (`shots/integrate-code/low_14_daylight_ia_latch_s.png`, `low_20_fight_enc_tally.png`); the sand thread at the seventh jug is drawn (`low_04`); the stone's glint is drawn (`low_74`) |
| from the art integrator: `plug_door_tally` | **APPLIED** (`build.ts`, ARCHITECTURE 3.5 and 7.5): the plug is drawn whenever its unit is hidden, door shut or open |
| found by the playthrough: the save of `cp_lip_start` held no objective | **FIXED** (`checkpoints.ts` `beginRun`): the start trigger fires before the first save is taken |

## 8. Polish round 2, the world's fixer (2026-10-04): requests, and what changed for other pieces

Everything here was changed inside `src/world/` and `tests/world/`; the rows below are what the world could not
do in its own files, or what another piece should know. Evidence: `shots/r2-fix-code-world/`,
`scratch/r2-fix-code-world/` (`real_run.json`, `prof_low_*.json`, `realloop_after_3.json`).

### 8.1 To level design / story (`design/*.json`, frozen for this fixer)

| # | Request | What the world does meanwhile |
|---|---|---|
| 1 | **`story.json` `meta.rules.never_stale`**: the keys a late line is never dropped for | `story.ts` `NEVER_STALE` holds them as a pattern list: `nar_seven`, `nar_plate_1..3`, `nar_cradle`, `nar_cradle_2`, `nar_seal`, `nar_office`, `nar_kept`, `nar_one_left`, `nar_first_fell`, `nar_first_seat`, `nar_ask`, `nar_lamps`, `nar_lamps_count`, `nar_stone_1..4`, `nar_take_1..2`, `nar_leave`, `nar_fire`, `nar_last`, `nar_not_for_firing`, `nar_down_the_bore`, every `rv_*`, `stn_proven`. The file's list wins when it exists |
| 2 | **A marker field for `nar_first_fell` / `nar_first_seat`** (GDD 4.2, Fight 1): nothing in the layout names them | `director.ts` says them by key on the first counted `enemy/felled` / `enemy/freed` of a run |
| 3 | **A goal line for `seven_jugs` T2 with fewer than six down** ("the weight on the bar"): `hint_jugs_2` states that six are down | with fewer than six, T2 is a second wordless nudge (a jug on the bar glints, the sweep creaks); `hint_jugs_2` is said at T2 only when six are down |
| 4 | **`cp_rim.params.failSafes[1].afterSeconds`** (150): the playthrough critic asked for about 300 | **not changed**: 150 s is GDD 9.8's number and layout data. What changed is where the clock starts: at her first step out of the lift cage, not at the lift's arrival, and a stage forced to end with the stone never found skips `nar_take_1` / `nar_leave` (the lines about the round she never saw) |
| 5 | **A lamp or plate over the hatch latch that faces the Daylight stand spot** (the knot is hidden from it by design: `knot_hatch_latch.params.note`) | the nudge is said once, then every 30 s a glint 0.55 m above the knot (over the cowl's hood) and an outline pulse on the knot's own mesh |
| 6 | **One `ia_ammo_box` behind a rib in the lift hall** (the combat critic: reserve 0 on the Tamper with human aim) | one `pk_rounds_6` falls from the Tamper on the first round that meets it with cylinder + reserve at or under 6, once per attempt (`director.ts` `onTamperHit`); it is not a tap |

### 8.2 To `code-render`

1. **`render.warmUp()` is one synchronous block** (24 to 96 ms measured on this machine at the stair swap, most of
   it the hidden frame). The world no longer calls it during play: the spread build compiles the new set's programs
   itself, an object a tick (`renderer.compile` under a render target, as your frames run; under none on `min`), and
   leaves buffer uploads to first draw. Measured: the same programs as your warm-up on Low (35), four of nine on High
   with none linked afterwards by a tour of the set (the other five are template-only variants `warmUp` makes:
   `scratch/r2-fix-code-world/links.mjs`). **If `warmUp` could be sliced when the state is `playing`** (or expose
   `warmUpObject(object)`), the world would call that instead of reaching for `render.renderer`.
2. **`setOutline(object)` draws nothing for an object without meshes.** Hint tier 3 of the four puzzles and of the kept
   ladder passes `build.anchor(marker)` (an empty at the marker) for targets that are instanced or zone geometry (the
   jugs, the latches, the brass step, the proving marks): no outline is drawn for those with the real renderer. The two
   knots now pass their own instance root. A box or ring drawn at an anchor's `userData` size would restore the rest.

### 8.3 To core (`src/core/`, frozen)

1. **A per-set fall net** (the cross-cutting fixer's row 5): declined in the world. The world can only kill her
   (`applyDamage`, a counted death and the death card) and the net's point is to put her back without one; `flow.ts`
   holds that path (`fellOut`). `killY` per resident set (lowest floor of the built zones minus 5 m) would be the place.
2. **`flow.ts` warps while the state is `playing`** (boot with `?cp=`: `await this.play()` then `await this.warp()`),
   and runs no tick until the warp resolves. A world build that waits on ticks deadlocks there (found on the real-time
   page: boot at `cp_tally_hatch` never finished). The world never spreads a build the flow asked for
   (`enterSeam(inPlay)`, `swapTo` are one-step); the note is here so nobody makes `restoreCheckpoint` tick-driven.

### 8.4 What changed in behaviour (for the integrator, the critics and the other pieces)

- **Story queue** (`story.ts`): a waiting line goes stale and is dropped unheard when it has waited more than 20 s
  beyond the lines said with it, or 4 s once she has left the zone it is about; never the load-bearing set (8.1 row 1).
  A dropped narrator line counts as told (its flag is saved) and as finished. Lines tied to an event are said next in
  line (`sayFront`, in the order of the events): wave and clear lines, the knots' lines, the vignette's two lines, the
  sighting's, `nar_file` / `nar_file_lined`, the ending's. `story.debug()` reports `stale` and `lastDropped`.
- **`nar_transit`** was never said on the Transit's turn: the watch was read before the Transit had an id, and the
  line lay about until the next fight's first wave (the Tally's riser said it, in the Tally House). Fixed.
- **Ending** (`ending.ts`): each step waits for its last line to have been heard (a 90 s fail-safe each); when the
  branch begins every waiting line but the stone's is dropped; `nar_fire` starts within 0.3 s of `ending/fire`; the
  card comes 4 s after `nar_last` has ended; nothing is said after the card.
- **Kept ladder** (`kept.ts`): the clock survives a death in phase 3a; the second death in the phase says
  `hint_kept_2` on the respawn; the `F` prompt and the outline come back after a restore; a debug warp starts over.
- **Key hints** (`interact.ts`): `did_reload` is set by the reload action only; `ui_hint_reload` shows on the second
  dry click for 6 s (three times at most); `ui_hint_interact` is hidden while an interact prompt is on screen.
- **Rides** (`rides.ts`): as the gate shuts she is turned once to the gate (54 ticks, smooth; it stops the moment she
  moves the view); the arrival's mood fades in over the rest of the dark (up to 8 s).
- **Builds during play** (`build.ts`): in real time the staging and both swaps are cut into slices, one a world tick
  (drop the old set, activate, instance the zones, the colliders, the build, then programs an object a tick); under
  the step hook (`?test=1`) and behind a loading screen they still finish in one tick (ARCHITECTURE 18), so hashes and
  scripted walks are unchanged. `__dbg.ext.world.spread(true)` forces the real-time path in a test;
  `buildBusy()` / `buildJob()` report it. The new set's files are asked for before anything is dropped; a request
  that fails during play is asked again every 3 s (the hatch stays shut meanwhile: `build.seamPending`).
- **The title** (`index.ts`): `game/state` to `title` stops the run (`running` false, the queue cleared).
- **Boss room**: with no lead at all, the cartridge points that can give glint every 2.5 s and their lamps are raised.

## Closer, polish round 2 (2026-10-04): what was decided on section 8

| Row | Decision |
|---|---|
| 8.1.1 `meta.rules.never_stale` | **RULED, stays in code** this round (`story.ts` `NEVER_STALE`); listed with the world's other id tables as a known gap |
| 8.1.2 a marker field for `nar_first_fell` / `nar_first_seat` | **RULED, stays in code** |
| 8.1.3 a T2 goal line for the jugs below six | **APPLIED in polish round 3 (story)**: `hint_jugs_2_few` ("The jugs were the weight on the bar. Clay breaks.", 4 s) is in `design/story.json`; saying it at T2 with fewer than six down is code-world's (`docs/requests/polish-r3-fixer.md`) |
| 8.1.4 the rim's forced end at 300 s | **RULED, no change** (README ruling 26): 150 s from her first step out of the cage |
| 8.1.5 a lamp over the hatch latch | **NOT DONE**, open for level design / art-env-interior |
| 8.1.6 an ammo box in the lift hall | **RULED, no change**: the Tamper's one mercy packet stands |
| 8.2.1 a sliced `warmUp` / `warmUpObject` | **NOT DONE**, open for code-render; the world keeps compiling through `ctx.render.renderer` |
| 8.2.2 `setOutline` on a mesh-less anchor | **NOT DONE**, open for code-render: hint tier 3 outlines on the jugs, latches, the brass step and the proving marks draw nothing (known gap) |
| 8.3.1 a per-set `killY` | **NOT DONE**: core's net at y -65 stands (a fall lasts about 3.5 s) |
| 8.3.2 | noted: `restoreCheckpoint` stays tick-free |

## 9. Polish round 3, the world's fixer (2026-10-05): requests, and what changed for other pieces

Evidence: `shots/r3-fix-code-world/` (every frame named here was opened), `scratch/r3-fix-code-world/` (`NOTES.md`,
`end7_*.log`, `realloopT_*.log`). Tests: `tests/world/ending.test.mjs`, `polish_r3.test.mjs`, `sighting.test.mjs`,
`seam.test.mjs`, `misc.test.mjs`, `director.test.mjs`.

### 9.1 R4, the sighting: what is still not the world's (to `code-render`, `code-enemies`, story)

The figure now stands on the skyline (art-env-exterior), the card is near-black (art-props-dress), and the world keeps
it 28 to 29 px tall at 720p (`sighting.test.mjs`: 9 x 29 px; it was 4 x 12). The size is a **workaround**: the two
floors that decide it are 8 px (`src/enemies/vignettes.ts` `present()`) and 9 px (`src/render/materials.ts`
`FARCARD_MIN_PX`), so `Director.presentSighting()` (`src/world/director.ts`, `SIGHT_MIN_PX` 32 px of card) finds the
enemies' card in `scene.dynamic`, stands it in a group of its own (`world_sighting`) and scales that group by what is
missing. It reads the card's scale and the material's `FARCARD_H` / `FARCARD_PX`, so the factor falls to 1 when the
owners raise their floors, and `sighting.test.mjs` fails above 40 px if the two ever multiply.

| # | To | Ask |
|---|---|---|
| 1 | `code-render` | **The far card's haze cap 0.30 -> 0.05 or less** (`materials.ts`, the `FARCARD` branch of the fog). A near-black card under 30 % of the Long Light's fog displays at RGB (140, 110, 92), L* about 48, against a sky of luma 192: a clear mid-brown figure, not the near-black silhouette (L* under 15) the visual critic asked for. This is the one thing R4 still lacks |
| 2 | `code-render` | `FARCARD_MIN_PX` 9 -> 32 (the card; the figure fills nine tenths of it), then the world's group goes to scale 1 by itself |
| 3 | `code-enemies` | `vignettes.ts` `present()`: the 8 px floor -> 32 px, or drop the floor and leave it to the shader. Its 5 degree shot test is about `cardPos` and still holds (the figure is 2.4 degrees tall) |
| 4 | story / closer | `nar_dowser_seen` still says "a pale man" over a dark figure: "On the far rim, a man with a forked rod, dark against the sky. Watching." (`docs/requests/art-env-exterior.md` 18). GDD 9.3 / 16, ART_BIBLE 6.5 and `vista_dowser.params` (`subject`, `minPixels` [3, 8] -> [9, 28]) say pale and 8 px |
| 5 | level design | `trg_dowser.params.goesWhen` / `doorOpensWhen`: the world now holds him until she has looked AT him (inside 15 degrees) for 1 s; the 12 s clock opens the door but no longer takes him off the mesa. The text in the layout describes the old rule |

### 9.2 To story / integration (`design/story.json`, frozen)

| # | Ask |
|---|---|
| 1 | **A `system.waiting` line** ("Waiting on the connection."): when a set's files have not come during play the world shows a caption after 3 s (a failed request) or 10 s (a slow one), again every 5 s, until the set is built. With no such key it shows `system.load_failed` ("The way on would not load. Check the connection, then go on."), whose second half is about the title screen |
| 2 | The end card's row label `KNOTS BURST` now counts crown knots freed and the Windlass's pips and pawls as well as mechanism knots: no text change needed |
| 3 | `lampsFormula` (layout `vista_plenty`) and GDD 4.4: the count skips 19 (ten freed gives 20), the homage blocklist's number |

### 9.3 To level design (`design/layout.json`, frozen): numbers the rulings changed in code

| Marker | The layout says | The world does (R5) |
|---|---|---|
| `trg_stone.params.endAfterSeconds` 25 | 25 s from the trigger | 25 s **away from the stone** (more than 4 m) **after `nar_stone_4` has been heard**; coming back starts it again. The north strip still leaves at once, once the stone's lines are over |
| `exit_rim` `failSafe` 150 s | from her first step out of the cage | unchanged, but it waits while she is within 8 m of a stone she has not found |
| `vista_fire` | the fire kindles after the branch's lines | it kindles **in her view**: the view is eased to it over 1.5 s (35 % toward the town, so the lit windows are in frame); with reduce-motion it waits up to 20 s for her to look. The wind and the card come only after it has been in view 2 s |
| `rd_note_stone` / `ia_stone_round` | one focus | the round's focus sphere is 0.12 m, the note's 0.2 m; until the note has been opened once `E` at the stone reads the note. Neither is offered once a branch has begun |

### 9.4 What changed in behaviour (for the integrator, the critics and the other pieces)

- **Ending** (`ending.ts`): as 9.3. The rim's triggers for the lamps and the stone say their lines next in line
  (`sayFront`), ahead of the arrival's scenery lines; when a branch begins the flush spares the lamps' two lines and
  says them if they were never said. `nar_rim_2` / `nar_rim_3` may come late (`story.ts` `LATE_OK`) instead of being
  lost to the 20 s rule while she stands at the stone; a player who takes the round at once still loses them.
- **Story queue** (`story.ts`): `unless(key, over)`: a wave, vignette or knot line of an encounter that is cleared when
  its turn comes is dropped; a hint tier's line that did not finish before a death is said again on the respawn;
  `stn_proven` and `nar_kept` go next in line on their events.
- **Hints**: tier 1 pulses the puzzle's lamp / glints the target every 3 s (jugs, daylight, proving line); jugs T2 below
  six down says `hint_jugs_2_few`; proving line T4 lights the brass step and the locker. The reload hint replaces any
  other key hint after the second dry click.
- **End card**: `knotsBurst` counts freed crown knots, boss pips and pawls; `lampCount` skips 19.
- **Ammo floor**: a Transit kill satisfies it (`decideDrop` `floorOnly`).
- **Builds during play** (`build.ts`): one job slice per RENDERED frame (30 ticks without a frame lets it go on; off
  under the step hook); the gallery's solids are built with the surface's, so staging at the hatch rebuilds no static
  collider set; the first collider build of a page is done three times behind the loading screen to warm the BVH builder.
- **`WAVE_RULES`** follow ruling 27 (the cross-cutting fixer's numbers); `tests/world/director.test.mjs` updated.
- New on `__dbg.ext.world`: nothing a test outside `tests/world` uses.

## Closer, polish round 3 (2026-10-05): decisions on the rows above

| Row | Decision |
|---|---|
| 9.1 rows 1 to 3 | Haze: 2 % since the exterior look-dev pass. The two floors stay; the world's wrapper holds the size (ruled in art-env-exterior.md) |
| 9.1 row 4, 5 | **Applied**: `nar_dowser_seen`, `vista_dowser` (`subject`, `minPixels`), `trg_dowser.goesWhen`; GDD 9.3, ART_BIBLE 6.5 |
| 9.2 row 1 `system.waiting` | **Applied** ("Waiting on the connection.") |
| 9.2 row 3, 9.3 | **Applied** to the layout's texts (`lampsFormula`, `trg_stone` note) and GDD 9.8 / 23.6 |
| hint tier 3 outlines on mesh-less anchors | Open (code-render 8.2.2) |
