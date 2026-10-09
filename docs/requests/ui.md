# Requests and document changes from the UI team, polish round 4 (2026-10-05)

Three critic issues (all minor) were fixed inside `src/ui/` (`ui.css`, `mark.ts`, `system.ts`) with tests in `tests/ui/`.
Evidence: `scratch/r4-team-ui/NOTES.md`, `scratch/r4-team-ui/{before,after}_*.log`, `shots/r4-team-ui/`.
Nothing here blocks anyone. Section 1 is for the closer (mirror into the documents); section 2 is one optional request
to core; section 3 is for the look teams.

## 1. Numbers and behaviour that changed (lead rulings R5, R6 outrank the documents) — closer, please mirror

| # | Document | Was | Is now | Why |
|---|---|---|---|---|
| 1 | ART_BIBLE 10.4 (end card; amended in round 3 to "ink at 80 % over the dusk") | one scrim, ink at 80 % over the whole frame; the ledger centred (on the coda fire) | scrim ink at **35 %**; the ledger on its own ink panel (**80 %**, soft edge, no border) in the **right third**: panel left edge at 0.60 of the width or more at 4:3, 16:9, 21:9; ledger width `min(600 u, 31 vw)` (was `min(600 u, 86 vw)`); panel `padding-right` 4 % | R5: the fire (frame centre: the coda camera looks straight at it) and the lit windows (left of it) are seen with the card up. Centre 120 x 120 px mean luminance 24 -> 84 (the bare canvas is 120) |
| 2 | ART_BIBLE 10 ("no panels, no gradients") | — | two exceptions: the end card's ink panel (row 1) and the HUD mark's soft ink backing (row 3) | lead's fix text for both issues |
| 3 | ART_BIBLE 10.3 / GDD 12.2 (the six-and-one mark) and ART_BIBLE palette row `ui_brass_dim` ("empty chamber rings, disabled") | spent chamber = `#6E5A2E` ring; nothing behind the mark | spent chamber = **bone `#E9E2D0` at 60 %** ring (same 1.5 unit stroke over the ink under-ring); under the HUD mark two radial ink discs, **alpha 0.5 out to 60 % of the radius, then fading to 0**: one r 54 units at (0, 6) under the ring, notch and numeral, one 19 x 29 under the seventh. The pause screen's enlarged mark has no backing. `ui_brass_dim` stays for disabled items, tab rules and unlit pips; it is no longer the empty chamber's colour | R6 / critic: dark-brass rings on the gun's dark steel vanished at 720p. The mark's box (95 x 138 px at 720p), position and every other glyph are unchanged |
| 4 | GDD 6 table, row "Death" (line 266: "0.6 s fade to dark, `ui_death` for 1.2 s, control returned within 3.0 s") | line fades in 0.6 -> 0.9 s after the death, cut at the respawn (whole for 0.9 s) | the line comes up **with** the ink (whole at 0.6 s), full bone, 18 px or more, 9 vh above centre (never on the crosshair); at the respawn (still 108 ticks = 1.8 s, core's) the ink fades off the game in 0.5 s as before and the **line stays, outlined, 1.4 s more, then fades in 0.4 s**. Whole for **2.6 s**. Control is still returned 1.8 s after the fatal tick. Reduced motion: no fades, the line is cut 1.4 s after the respawn | critic: a slow reader could not finish it; the 2.5 s the critic asked for is met without touching core |

## 2. Optional request to core (not needed for the fix above)

| # | What | Why |
|---|---|---|
| 1 | `src/core/flow.ts` `DEATH_TICKS` (108) could become skippable: any gameplay key after the first 0.6 s respawns at once | the critic's alternative ("or let any key skip it"). With section 1 row 4 the line no longer depends on the length of the dead state, so a skip would cost the reader nothing. Not done here: core is frozen for this team, and it would move the playthrough's tick count only if the bot pressed a key while dead |

## 3. For the look teams (visual judgement left to you)

- The end card's panel now covers the right 36 % of the frame from 23 % to 77 % of its height, which is where the
  revolver's barrel and frame are in the coda (`shots/r4-team-ui/after_16x9_end_card.png`, `after_4x3_end_card.png`,
  `after_21x9_end_card.png`). The fire, the smoke, both beams, the town and its windows are clear of it. If the coda's
  framing moves the fire off the frame's centre, the panel side is one line of `ui.css` (`.k7 .end`: `justify-content`
  and `padding-right`).
- The scrim value (35 %) and the panel's alpha (80 %) are two numbers in `ui.css` (`.k7 .end`, `.k7 .end-panel`);
  `tests/ui/screens.test.mjs` pins them.
- The mark's backing strength is `BACKING_ALPHA` / `BACKING_CORE` in `src/ui/mark.ts` (pinned in `tests/ui/hud.test.mjs`).
  Frames over the gun: `shots/r4-team-ui/after_16x9_mark_crop.png` (tally house), `after_16x9_mark_full_street.png`.

## Closer, polish round 4 (2026-10-05): decisions

| Row | What | Decision |
|---|---|---|
| 1 | numbers | mirrored: ART_BIBLE 10, 10.2, 10.3, 10.4 in place; GDD section 5 death row in place, 12.2 in 23.8 |
| 2.1 | a skippable death state (core) | **Declined**: the line no longer depends on it; `DEATH_TICKS` stays |
| 3 | the panel over the gun in the coda, the mark over the gun hand | looked at in `shots/round-4/hero_12.png` and the end card frame; stands. The mark's backing over the hand is **open for round 5** (gun request 3) |

---

# Requests and document changes from the UI team, polish round 5 (2026-10-06)

Five critic issues (one major, four minor) fixed inside `src/ui/` (`system.ts`, `hud.ts`, `mark.ts`, `ui.css`), `sandbox/ui.ts`
and `tests/ui/` (new `polish_r5.test.mjs`, six tests; pins moved in `seventh`, `screens`, `perf`). No file of another owner
was edited. Evidence: `scratch/r5-team-ui/NOTES.md`, `scratch/r5-team-ui/repro_{before,after}.json`, `shots/r5-team-ui/`.

## 1. Numbers and behaviour that changed (lead rulings R6, R12, R13 outrank the documents) — closer, please mirror

| # | Document | Was | Is now | Why |
|---|---|---|---|---|
| 1 | ART_BIBLE 10.3 / GDD 12.2 (where the six-and-one mark stands) | lower RIGHT: `right 46 u`, on the revolver's grip and hand | lower **LEFT**, over the health bars: the ring's left edge on the bars' left edge (`left 46 u − 15.6 mark units`), the box's bottom `66 u` up (the seventh ends 13 px above the bars at 720p). At 1280 x 720 the box is x 14–109, y 526–676. Nothing of the gauges is in the lower right any more | critic (visual): the mark was printed across the grip and hand; the gun, and in the reload both hands, fill the lower right (`shots/r5-visual/reload6_low/r_t080.png`). After: `shots/r5-team-ui/real_cp_lip_gate.png`, `real_reload_mid.png`, `real_cp_boss_p1.png` |
| 2 | ART_BIBLE 10.3 / GDD 12.2 (the seventh's size; `mark.ts SEVENTH_SCALE`) | 1.5 x the 9 x 22 glyph: 13.5 x 33 units, 15 x 36 px at 720p | **2 x: 18 x 44 units, 19.4 x 47.5 px at 720p** (`SEVENTH_BOX.x` 25, `MARK_DROP` 23, the mark's box 88 x **139** units = 95 x 150 px at 720p; backing ellipse 23 x 36) | critic (story-ux): the one mark the game is named for was the smallest thing on screen |
| 3 | ART_BIBLE 10.3 (the reserve numeral) | 12 units (13 px at 720p), baseline 50 | **15 units (16.2 px at 720p)**, baseline 51 | the same issue |
| 4 | GDD 12.1 / ART_BIBLE 10.1 (title menu) | Begin is always the chosen item; with a save one press of Begin clears it | with a stored save **Go on is the chosen item and names its count** ("GO ON  VI · 2", the checkpoint as `ui_checkpoint` prints it); **Begin over a save asks first**: a column "Begin?" / Go on <count> (chosen) / Begin / Back. Only that column's Begin emits `play`; Escape and Back return to the title. Words: `ui_menu_play` + "?", `ui_menu_continue`, `ui_opt_back` (no new key existed) | critic (robustness), MAJOR: one habitual Enter wiped a run at the Windlass |
| 5 | GDD 12.2 (movement cards) | every `story/card` is shown for its full 3.5 s | a card is shown **once a run** (not again after a restore), and **gives way to a fight**: on `enemy/telegraph`, `enemy/attack`, `encounter/started`, `encounter/wave`, `boss/phase`, `player/damaged` or her own shot, a card that is up has **1.0 s on screen in all, then fades in 0.3 s**; a card that arrives within 6 s after such an event is that brief from the start (`hud.ts CARD_MIN_SECONDS`, `CARD_FADE_QUICK`, `CARD_THREAT_SECONDS`) | critic (combat): "V THE WEIGHT" stood over the Tamper's first charge. Real game from `cp_hall_gantry`: the card was up to tick 210, now gone by tick 96 (the wind-up is at 114) |
| 6 | ART_BIBLE 10 (pause, options) | the HUD's mark and bars are drawn under the pause scrim and the options page | under the pause the HUD's own mark is not drawn (the screen shows it enlarged); under a full page (options, story, credits) no gauge is drawn | the mark is now in the pause column's corner; the bars stood under "Restore defaults" |
| 7 | ART_BIBLE 10 (pause in a small window) | fixed columns | the pause column is capped at 47 % and a long item wraps; under 700 px wide or 420 px tall the side column starts at 8 %, is 42 % wide, and its mark is `min(100vh / 320, 42vw / 92)` per unit | critic (robustness): at 480 x 270 the checkpoint item ran under the objective |
| 8 | ART_BIBLE 10.4 (end card) | — | under 900 px wide the ledger labels are tracked 0.03 em and do not wrap (the new label "Six dry mouths, one cylinder" took two lines at 800 x 600); a checkpoint numeral is not drawn behind the end card | the fixer's row 1 for this team |

## 2. For the look teams (visual judgement left to you)

- Row "HUD backing over the hand" (round-4 closer, gun request 3) is closed by the move: the mark no longer stands on the
  view-model. Its soft ink backing is kept (`BACKING_ALPHA` 0.5) because it now stands on the world: glare sand at worst
  (`shots/r5-team-ui/mark_lower_left_glare.png`, `real_cp_lip_gate.png`).
- The movement card's place (27 % from the top) is unchanged.

## 3. Seen, not ours

- After "Quit to title" from inside a run the title's live shot is the last frame of the run (the revolver, a violet
  thread in `shots/r5-team-ui/after_title_with_save.png`), not the doorway shot of a fresh boot. Core / render.

## Closer, polish round 5 (2026-10-06): decisions

| Row | Decision |
|---|---|
| 1.1 to 1.8 | **Mirrored**: GDD 12.2 (mark lower left, seventh 2 x, numeral, cards), 12.3 (title), 23.10; ART_BIBLE 10.3 in place and the round-5 amendments ("10 Screens") |
| 3 (the title after "Quit to title" shows the run's last frame) | **Not changed** (core / render; a re-boot of the title scene could not be verified safely in the last round). Known gap |
| the question has no explanatory sentence | **Stands**: no key exists and the story text is frozen |

## Fixer, release pass p0 (2026-10-07): decisions

| Row | Decision |
|---|---|
| 3 (the title after "Quit to title" shows the run's last frame) | **Not reproduced as written**: quit from `cp_boss_p3` and from `cp_rim`, the title is the doorway shot of a fresh boot (`shots/p0-fixer/title_fresh.png`, `title_after_quit_cp_boss_p3.png`, `title_after_quit_cp_rim.png`, all opened): same camera, same mood (`L1`), the same violet thread (it is the Rule in the distance, part of the title's own view). The one difference is the revolver's tone: lighter and greyer after a quit than on a fresh boot. That is the view-model's rig not being reset with the mood: **for the gun team / render-tech** (`flow.ts` `titleShot` already calls `setMood(..., 0)`) |
| the question has no explanatory sentence | **Keys added** (`design/story.json`): `ui_ask_begin` "Begin again?" and `ui_ask_begin_note` "The count kept so far will be lost." Yours to draw in the title's question box (`src/ui/system.ts` `askBox`) |
| end card: deaths | **Key added**: `ui_end_deaths` "Times she went down" for a quiet row; the count has to come from the run's statistics (world) |
| `ui_end_clean_six` | now "Six dry chambers, one cylinder" (one character longer than before: look at the end card once at 4:3 and 400 px wide) |
| the canvas fades in | **New, core**: when the loop first runs the canvas fades from black over 0.7 s (`src/core/loop.ts` `CANVAS_FADE_MS`, never in test mode). The title's DOM is not faded by it: if the title text should come up with the picture, that is a CSS matter of yours |

## UI team, release pass p0 (2026-10-07)

Evidence: `shots/p0-team-ui/`, `scratch/p0-team-ui/` (`NOTES.md`, `repro*.json`, `hint_leg.json`). Tests: `tests/ui/release_p0.test.mjs` (6), `tests/ui/release_p0_real.test.mjs` (1, the real game).

### 1. Numbers and behaviour that changed (lead rulings R1, R5, R7, R12 outrank the documents) — closer, please mirror

| # | Document | Was | Is now | Why |
|---|---|---|---|---|
| 1 | GDD 12.2 / ART_BIBLE 10.3 (where the movement card stands) | 27 % from the top, its numeral on the crosshair's band (y 194 to 305 at 720p) | **12 % from the top: the upper third** (y 86 to 197 at 720p; at least 14 % of the height between it and the crosshair at every shape of frame) | story-ux: "VII / SEVEN" on the windmill and the brightest sky of the last vista; combat: "V THE WEIGHT" on the Tamper |
| 2 | ART_BIBLE 10 ("no shadows beyond a 1 px ink outline") | the card is bone type with the 1 px outline only | the card alone also has **an ink halo round its letters** (two blurred ink text-shadows) **and a soft ink ground** (an ink ellipse at 34 %, blurred; no gradient: `tests/ui/text.spec.ts` still holds). `shots/p0-team-ui/card_on_peach.png`, `card_on_glare.png` | story-ux: a pale outline on the peach sky. Look teams may tune the strength (`ui.css .card`, `.card::before`) |
| 3 | GDD 12.2 (the card's fades) | CSS transitions on the wall clock: 0.6 s in, 0.8 s out, 0.3 s when cut | the same lengths **counted in fixed ticks** (`hud.ts CARD_FADE_IN`, `CARD_FADE_OUT`, `CARD_FADE_QUICK`, 20 opacity steps): a pause freezes the fade, and a frame drawn at tick n shows the card of tick n. `systems.ui.hud.cardOpacity` reports it | combat: the reviewer's frame at tick 114 from `cp_hall_gantry` showed a card whose time was over at tick 96; it was still fading because the game had been stepped faster than the wall clock (a hitch does the same to a player) |
| 4 | GDD 12.1 (lazy key hints) | every `ui/hint` world raises is drawn while it is raised | **`ui_hint_move`, `ui_hint_sprint` and `ui_hint_interact` are not drawn while a fight is on** (an encounter started and not cleared or reset, or the Windlass in p1, p2, p3a, p3b); they come up when it is over if still raised. Fire, reload, line and "break the band" are never held back (`hud.ts HINTS_HELD_IN_A_FIGHT`). `visibleText().hint` is what is drawn | story-ux: "Hold SHIFT to run" 17 s under the crosshair in the first fight. Real game now: raised at 46.3 s, drawn 56.4 s (street clear) to 63.2 s |
| 5 | GDD 12.4 / ART_BIBLE 10.4 (end card rows) | Time, Rounds fired, Rounds that told, Knots, Lines, Six dry chambers, Things found, Lamps, The Reeve carries; "never a count of her deaths" | **"Times she went down" (`ui_end_deaths`, `stats.deaths`) is the second row, under Time**; ten rows; the menu's fade starts at row 10.6 (`END_MENU_ROW`; it answers 5.18 s after the card opens, was 4.80 s) | playthrough: Time is the surviving timeline's, 8:36 on a run played for 10:50 |
| 6 | ART_BIBLE 10.4 (end card panel) | ink at 80 % | **ink at 88 %**; never taller than the window (`max-height: 100 %`); the ledger is at least `min(264 px, 84 vw)` wide (under 900 px its side padding is 12 px, so the panel is where it was) | visual: whatever stood behind the ledger ghosted through it |
| 7 | ART_BIBLE 10.4 (end card in a very small window) | fixed floors: at 480 x 270 the title and both choices were outside the window; at 400 x 800 a row ran off the right | under 420 px tall or 560 px wide: 12 px title and values, 9.5 px labels, lamps 24 to a row. Nothing outside the window and both choices under the pointer at 360 x 240, 480 x 270, 400 x 800, 640 x 360 and ten larger sizes, with 48 lamps and the longest values | robustness |
| 8 | GDD 12.4 (the last image) / code-player | the revolver is held under the end card | **while the end card is up the view-model is let down out of the frame** (0.75 m in 0.9 s, counted in ticks; a cut under reduce motion) and is back in the hand when the card closes. `src/player/viewModel.ts setLowered`, `src/player/system.ts` (listens to `ui/screen` end). **Edited by the UI team: the player team was not active in p0** | visual, R5 / R7: a ghost of the gun behind the statistics. `shots/p0-team-ui/after_end_1280x720.png` (the true ending) |
| 9 | GDD 12.3 (Begin over a save) | heading "Begin?" | heading `ui_ask_begin` ("Begin again?") and under it `ui_ask_begin_note` ("The count kept so far will be lost.") | the fixer's keys |
| 10 | GDD 12.3 / R15 (the title after a load) | the title's words stand at once, on black, while the picture fades in | the title's words come up in 0.7 s with the picture (only after a load; not when a sheet or the options close; not under reduce motion). The menu answers from the first frame | the fixer's note on `CANVAS_FADE_MS` |

### 2. Requests

| # | To | Request |
|---|---|---|
| 1 | **world** | Raise `ui_hint_sprint` where it can be read: on the walk down the gully before the gate (`needSprint` is set in the first fight's second wave, `director.ts`). The UI now holds it back while `enc_street` is live, so today it is drawn only for the 6.8 s between the street's clear and world's own lowering of it. |
| 2 | **render-tech / exterior-look** | The last fire is small beside the derrick (about 20 x 45 px at 720p: `shots/p0-team-ui/after_end_1280x720.png`); the reviewer asks for its glow sprite about 1.5 x. Not UI code (`last_fire` card in `src/render`). |
| 3 | **gun team / player** | `ViewModel.setLowered()` is new (row 8). If the end of the coda gets a holster clip of its own, call it from the same place and drop the offset. |

### 3. Not reproduced

- "In the pause menu at 480 x 270 the Options item cannot be clicked": the item is inside the window and under the pointer at its centre at 480 x 270, 400 x 800, 360 x 240 and 640 x 360, and a real click opens the options (`tests/ui/release_p0.test.mjs`, `shots/p0-team-ui/pause_480x270.png`). The reviewer's script clicked `[data-item="options"]`, which is the TITLE menu's item first in the document (hidden during play), so the click waited for a hidden element; `.scr.on [data-item="options"]` is the one on screen.

### 4. More requests (found while running the gate)

| # | To | Request |
|---|---|---|
| 4 | **core / fixer** | **A production build with core's stand-ins in some slots never boots** (`startServer({ mode: 'build', pieces: ['ui'] })`, also `['player']`): the page gets its script and the three data files (all 200) and then nothing happens: no title, no `__dbg`, no console line (`scratch/p0-team-ui/prod_dbg.mjs`). The build with every piece real boots (`prod_dbg_all.mjs`). It began with the design data as top-level-awaited files (`vite.config.mts designData`, `src/core/dataFile.ts`). `tests/core/stubs.test.mjs` "startServer pieces" fails on it; `tests/ui/perf.test.mjs` "the production build carries the UI" now builds `pieces: 'all'` instead. |
| 5 | **core / fixer** | `KEEP7_REAL=all node --test tests/core/` has three more failures that are not the UI's: `boot.test.mjs` twice (21 textures synthesised, the tests expect 18: the three new view-model textures) and `budget.test.mjs` "assertBudget fails a frame that is over" (no throw for 76 draw calls). Log: `scratch/p0-team-ui/gate_core_real.log`. |

## Closer, release pass p0 (2026-10-07): decisions on this file's p0 rows

Evidence: `docs/INTEGRATION_REPORT.md` Part K, `scratch/p0-closer/NOTES.md`, `scratch/p0-closer/gate/`.

| Row | Decision |
|---|---|
| Section 1 rows 1 to 10 | **Applied**: GDD 23.12 (12.1 to 12.4), ART_BIBLE "Amendments, release pass p0" (10) |
| 2.1 the run hint | **Applied** (`src/world/director.ts`, at the glare trigger) |
| 2.2 the last fire's glow | **Applied** (`src/render/vfx/vfx.ts`: halo 11 -> 16.5 sizes, at least 180 px; pool 26 -> 39). Seen in `shots/p0/hero_12.png` |
| 2.3 `setLowered` | Accepted: the UI's edit of `src/player` stands; `tests/player` 41 pass |
| 4.4 a production build with stand-in slots never boots | **Fixed**: an import cycle `context.ts` <-> `stubs/basicRender.ts` deadlocked the bundler's async module wrappers once the design data was awaited at the top. `coreOf` now lives in a leaf module (`src/core/coreOf.ts`). `tests/ui/perf.test.mjs` builds `pieces: ['ui']` again; `tests/core/stubs.test.mjs` passes |
| 4.5 the `tests/core` counts | **Fixed** (see `enemies.md`) |

## Fixer, pass i1 (2026-10-07): decisions and what changed under this team

No row of this file was open. One issue of the release reviewers was assigned to integration and touches this team's files.

| Row | Decision |
|---|---|
| New: the end card's lamps row | **Applied, in this team's files**: `src/ui/system.ts` (the row reads "lit of could" from the new `ctx.world.lampsOf`; `.lamp.dark` for a window that stayed dark; `.lamps-note` with `ui_end_lamps_freed` / `ui_end_lamps_kept`), `src/ui/ui.css` (three rules, and the note's size in the small-window block). `tests/ui/screens.test.mjs` is untouched and passes; `tests/e2e/i1.test.mjs` asserts the new row. The team owns the look: change it freely, keep "no element holds a count of the felled" |
| New: `ui_end_clean_six` | now "Six chambers, six shots" (the reviewers: "Six dry chambers, one cylinder" was not understood). Shorter than the old label: no layout change |
| Text for the reviewers' other UI items | no new key was added: `tests/ui/text.spec.ts` fails on a `ui_*` key no code names. The loading screen's name is `ui_title`; a key glyph on the readable sheet can be composed from `{interact}` and `ui_read_next` / `ui_read_close`. A team that needs a new string asks in this file with the exact text |
| The page's head | `index.html` now carries the title, a description and share tags (core's file). `document.title` is still set from `ui_title` at boot |

## UI team, pass i1 (2026-10-07): what changed, what the documents must mirror, what is asked of others

Evidence: `tests/ui/i1.test.mjs` (10 tests), `tests/ui/i1_real.test.mjs` (the real game), the updated older tests,
`scratch/i1-team-ui/NOTES.md`, `scratch/i1-team-ui/repro_before*.log` / `repro_after_12.log`, `shots/i1-team-ui/`.

### 1. Numbers and behaviour changed under rulings R12 / R15 (closer: mirror into GDD 12 and ART_BIBLE 10)

| # | Document | Was | Is now | Why |
|---|---|---|---|---|
| 1 | GDD 12.1 (lazy key hints: how long) | a hint world raises is drawn until world lowers it (the run hint stood 56 s, the walk hint from 4.5 s until she walked) | **`ui_hint_move`, `ui_hint_sprint`, `ui_hint_interact` are drawn 8 s** (`hud.ts HINT_STAND_SECONDS`, counted in drawn fixed ticks), **once more 40 s later if still asked for** (`HINT_RETURN_SECONDS`), **then never again in that run** (`HINT_SHOWS` = 2; a new run starts the count again; a stand world cut short is not counted). Fire, reload, line and "break the band" are untouched (world times the reload hint) | story-a: "no timeout" |
| 2 | GDD 12.1 (the walk hint and the narrator) | drawn over the opening lines | **`ui_hint_move` is not drawn while a line is on screen, nor until the narrator has been quiet 1.5 s** (`HINTS_HELD_UNDER_A_LINE`, `HINT_QUIET_SECONDS`). Real game, standing still: first drawn at 11.5 s (was 4.5 s), gone at 19.5 s | story-a, story-b |
| 3 | GDD 12.2 / ART_BIBLE 10.3 (where a hint stands) | its own row at 64 % of the height, 110 px under the crosshair | **the top of the talk column: directly above the caption and the subtitle at every subtitle size, at 88 % of the height when nothing is said** (y 632 to 652 at 720p). The focus prompt keeps its row at 57.5 % | story-a: across the revolver's barrel |
| 4 | GDD 12.2 (low health) | no cue beyond the three bars | **under 35 health the three bars breathe a pale outline (1.3 s) and the frame's edge is inked in** (an inset ink shadow at 66 %, no colour ramp, no red) for as long as it lasts; reduce flashes or reduce motion: the outline holds still (`hud.ts LOW_HEALTH`, `ui.css .hud.low`) | story-b |
| 5 | GDD 12.3 (readable sheet) | NEXT and CLOSE without a key | **a key cap before each: the bound interact key before Next; before Close `Esc` when the cursor is free and `Right click` when the pointer is locked** (the browser takes Esc under pointer lock: the mouse is let go and the game pauses behind the closing note). **The right mouse button closes a note read in play** and keeps the pointer (unless it is bound to fire or to interact; then the cap is Esc again) | story-b |
| 6 | story.json `meta.rules.readable_cards` / GDD 12.3 | a blank line starts a card | the same, and **a one-line paragraph of 40 characters or fewer shares the card after it (the last one: the card before it)**: `rd_note_lip` and `rd_note_hearth` are 2 cards, were 3; no other readable changes (`text.ts splitCards`, `SHORT_CARD_CHARS`) | story-b |
| 7 | GDD 12.3 (Begin) | Begin starts the run; the back-story is a title item | **a first Begin in a browser (no save, `localStorage keepseven.ui.story_seen.v1` not '1') starts the run as before and lays the four cards of `rd_backstory` over the run's first frame before its first tick** (state `paused` / `readable`, no HUD under it): the interact key or the fire button turns a card and hands her the game after the last, Enter (item "Begin", `ui_menu_play`) or the right button at once. Shown once; reading "The story so far" from the title counts. **Under `?test=1` only when the key holds '0'** (a scripted run is never stopped) | story-b |
| 8 | GDD 12.4 / ART_BIBLE 10.4 (end card rows) | ten rows, "Six chambers, six shots: Yes / No" | **the row is there only when the feat was done** (label in brass, value `ui_end_yes`); nine rows otherwise; rows still light 0.38 s apart (`--i` counts the shown rows) | story-a |
| 9 | GDD 12.3 / R15 (loading screen) | the word LOADING over a 1 px hair of 173 px, centred | **the title arriving: the name and the six-and-one mark in the title's own place and type; the word and a 2 px line of at least 180 px where the menu will be.** The line's fill is the share of files in (`always` 0 to 14 %, `surface` 14 to 100 %), never backwards; a pale glint crosses it every 1.5 s (a transform, so it moves while the script decodes; none under reduce motion). On the title only the sub-line and the menu fade in (the name and the mark were already there) | story-a, story-b |
| 10 | R15 (before the script) | `#preboot`: a brass hairline on ink | **`index.html #preload`: the same name, mark and line, positioned with the same lengths as `ui.css .title-head` / `.load-foot`** (measured equal within 0.6 px: pre-boot, loading, title), taken away by an inline observer the moment the game puts anything into `#ui` | story-b |
| 11 | ART_BIBLE 10 (options) | scrim ink at 70 %; binding caps 10.2 px, heading 9.6 px, description 11.4 px at 720p | **ink at 86 %; no text of the options page under 12 px** at 1280 x 720, 960 x 720, 800 x 450; a binding slot is at least 8.4 em wide (LEFT CLICK no longer pushes its neighbour) | story-b, visual-b |
| 12 | GDD 12.2 (the HUD mark's floor) | 1.08 px a unit at every size under 1166 px of height (150 px of a 450 px window) | **1.08 down to 600 px of height, then with the height, to 0.72 at the least** (`mark.ts markScale`, `ui.css --mk`): 71 x 113 px at 800 x 450 (a quarter of the height) | story-b |
| 13 | GDD 12.4 (the title after an ending) | the view-model stayed let down: no revolver on that title | **the revolver is back the moment the end card closes** (`src/player/viewModel.ts setLowered(false)` is a cut; going down is still 0.9 s in ticks). **Edited by the UI team: the player team was not active in i1** | story-a |

### 2. Requests

| # | To | Request |
|---|---|---|
| 1 | **fixer (story.json)** | Take `ui_end_no` ("No") out of `design/story.json`: nothing shows it any more (row 8). `tests/ui/text.spec.ts` lists it as intentionally unused until then. |
| 2 | **core** | `load/progress` in **bytes received over a known total**. Today it is files done of files asked for, per set, each set from nought, and a file counts only when it is decoded; the manifest carries no file sizes, so the UI cannot do better than row 9. Wanted: `tools/gen_assets.mjs` (or the build) writes each file's byte size into the manifest, `AssetStore.prefetch` reads the response as a stream and reports `loaded` / `total` in bytes over all sets of the boot with one label. The UI then needs one line changed (`system.ts LOAD_SHARE`). |
| 3 | **core** | `src/main.ts` still removes `#preboot`, which no longer exists (harmless). The pre-boot page is now `#preload` and removes itself when `#ui` gets its first child; if the boot can fail before anything is put into `#ui`, call `document.getElementById('preload')?.remove()` there. `index.html` was edited by the UI team (the issue named it; core was not active). |
| 4 | **closer** | Scripts that click Begin on a page without `?test=1` and then expect play (`scratch/*/release_check.mjs`) now meet the story cards first: press Enter once the pointer is locked (as `tests/e2e/production.test.mjs` does now; that file was edited by the UI team, two places). The first-seconds picture of a fresh browser is the story sheet. |
| 5 | **world** | Nothing needed for the hints: world may keep raising them as it does. If world also times them, the shorter time wins. "Go on VII . 1" after a finished run works with the save world now keeps (seen on the real ending: `shots/i1-team-ui/after_title_after_end.png`). |
| 6 | **look teams** | Yours to tune: the low-health edge (`ui.css .hud::after`, ink at 66 %), the loading line and glint, the key caps on paper. With fewer than twelve lamps the end card's lamp grid stops short of the row's right edge (nine lamps fill nine of twelve columns: 24 px short at 720p; it did before this pass). |

## Closer, pass i1 (2026-10-07): decisions on this file's i1 rows

| Row | Decision |
|---|---|
| Section 1 rows 1 to 13 | **Mirrored**: GDD 12.1 (in place) and 23.14, ART_BIBLE "Amendments, pass i1" (10) |
| Request 1, `ui_end_no` | **Applied**: taken out of `design/story.json`; `tests/ui/text.spec.ts` lists nothing as intentionally unused; `tests/ui/i1.test.mjs` and `polish_r5.test.mjs` no longer name the key. Every asset was rebuilt (the build hashes the design files) |
| Request 2, a loading line in bytes | **Not done** (a manifest and core change: file sizes in `design/assets.json`, a streamed fetch in `AssetStore`). The line fills by files in and never runs backwards. Listed in `docs/KNOWN_ISSUES.md` |
| Request 3, `#preboot` in `src/main.ts` | **Applied**: the dead line is gone, and a boot that fails takes `#preload` away before the failure notice |
| Request 4, scripts that click Begin | **Applied** in this pass's release check (`scratch/i1-closer/release_check.mjs`): it passes the story cards with Enter and reports the bytes to the story sheet and to control |
| Request 6, look of the low-health edge and the lamp grid | **Left as built** |
| World's ask: "Go on" on the end card | **Applied by the closer**: item "The rim again" (`ui_end_rim`), between "Walk it again" and "Title", shown when a save is stored |
| The edit of `src/player/viewModel.ts` (`setLowered(false)` is a cut) | **Accepted** |

## UI team, pass i2 (2026-10-07): what changed, what the documents must mirror, what is asked of others

Evidence: `tests/ui/i2.test.mjs` (4 tests, core stubs), `tests/ui/i2_real.test.mjs` (4 tests, the real game, one browser
at a time), `tests/ui/text.spec.ts` (4 new cases), the updated older tests (`hud.test.mjs`, `screens.test.mjs`,
`i1.test.mjs`, `perf.test.mjs`), `scratch/i2-team-ui/NOTES.md` and its scripts (`real.mjs <leg>`, `cold.mjs`, `title.mjs`),
`shots/i2-team-ui/`.

### 1. Numbers and behaviour changed under rulings R5 / R12 / R15 (closer: mirror into GDD 12 and ART_BIBLE 10)

| # | Document | Was | Is now | Why |
|---|---|---|---|---|
| 1 | GDD 12.2 (the objective) | drawn only on the pause screen, under "The work at hand" | **also in play: each `objective/changed` (a trigger, a cleared fight, a restored checkpoint, "Go on") is drawn top left under the checkpoint numeral for 5 s of simulated time** (`hud.ts OBJECTIVE_SECONDS`), under the pause screen's own brass label (`ui_pause_objective`), the line in the serif at 22 px of 1080 (14 px floor), on a soft ink ground; fades 0.3 s in, 0.6 s out. **It waits for a movement card to be gone** and is not drawn under a sheet, a menu or the end card; a respawn clears it (world announces the restored one). Real game: on screen 0.17 s after Begin, 4.7 to 5 s up | story-a (major): eighteen objective lines were never seen by a player who did not pause |
| 2 | GDD 12.2 / 9.8 (the last choice, R5) | `obj_rim_choice` only on the pause screen | **`obj_rim_choice` stands for as long as she is inside `trg_stone`** (`hud.ts OBJECTIVE_STANDS`), fades 5 s after she leaves it, comes back when she returns, and goes 1 s after the round is taken or the ending begins. Real game: on screen at 48 of 48 looks over 16 s at the stone | story-a: the line that names the choice was not on screen at the stone |
| 3 | GDD 12.2 (objective and fights) | (the reviewer suggested holding it back during a fight) | **not held back by a fight**: the objectives that change in a fight name that fight (`obj_yard`, `obj_boss`, `obj_boss_unproven`, `obj_boss_dry`) and would never be read if held to its end; the line stands top left, outside the fight's part of the frame, clear of the boss pips at 4:3, 16:9, 21:9 and 800 x 450 | a deliberate deviation from the suggested fix; say so if the lead wants it held |
| 4 | GDD 12.2 / ART_BIBLE 10.3 (line rounds) | a cyan dot left of the reserve numeral, named only on the pause screen | **the word `ui_hud_line_rounds` ("LINE", aqua, 9.5 mark units) stands under the dots for 6 s when the count goes from none to some** (`LINE_LABEL_SECONDS`), **and for as long as `ui_hint_line` is drawn**; a count restored with a checkpoint is not named | story-a |
| 5 | GDD 12.2 (subtitle at the asking) | the talk column at 8 % from the bottom everywhere | **inside `trg_pz_asking` while `the_asking` is unsolved the column stands 1.4 % from the bottom and the subtitle's backing is 45 % of the option's value** (0.27 at the default 0.6): at 2 m the box is 645 to 710 px of 720 (it was 598 to 662, on numeral 5), the port reads through it | story-b |
| 6 | story.json `meta.rules.readable_cards` / GDD 12.3 | a blank line starts a card (plus pass i1's short-line rule): `rd_note_lip` 2 cards, `rd_ledger` 3 | **a readable found in the world is packed by what the sheet holds: paragraphs share a card up to 12 lines of 58 characters** (`text.ts packCards`); **every note and plate of story.json is now ONE card** (the longest, the ledger, is 9 lines). A paragraph is never split. "The story so far" and the credits keep their authored cards (4 and 1) | story-b |
| 7 | ART_BIBLE 10.3 (the proving prompt) | `ui_prompt_kept` in aqua capitals, no backing | **bone capitals on the subtitle's ink backing (62 %), the key in a cap filled with the proving aqua (ink letter)**, as the prompt and as the tier 3 hint | story-b: lost on the bore's pale aqua floor |
| 8 | ART_BIBLE 5.6 / 10 (the mark on the title) | 18 x 28 px of 1080, 17 x 26 px floor | **36 x 56 px of 1080, 34 x 52 px floor**, on the title, the loading screen and `index.html #preload` | story-b: too small to read as six and one |
| 9 | R15 (loading screen and pre-boot page) | name, mark, the word, a line | **plus one italic serif line under the mark, in the narrator's voice**: `ui_loading_line` when story.json has it, until then the last two sentences of the second card of `rd_backstory` ("The court is gone. The Rule leans."); `index.html` carries the same words (`text.spec.ts` holds them equal). Never the courtesy | story-a |
| 10 | R15 (the loading line's fill) | files decoded of files asked for, per set (0.14 / 0.86) | **bytes of asset files in (the page's Resource Timing entries) over `BOOT_FILE_BYTES` = 6 791 954 for 80 % of the line, the sets' decode count for 12 %, then a 7 s ease to 98.5 % through the build and warm-up** (`src/ui/loadMeter.ts`, `ui.css .load-line.tail`). With no byte seen it is pass i1's count. Real game, files held to 1.5 MB/s: never back, longest stand-still 0.61 s (one 1.6 MB file in flight) | story-a, story-b |
| 11 | GDD 12.3 (title layout) | the column 13 % from the bottom at every aspect | **in a frame narrower than 3:2 the column, the Begin question and the loading line stand 5.5 % from the bottom** (ui.css, `index.html`): at 960 x 720 the column is y 594 to 680, under the lit camp (it was 534 to 626, "The story so far" across the pot) | story-b |

### 2. Requests

| # | To | Request |
|---|---|---|
| 1 | **fixer (story.json)** | A key `ui_loading_line` for the loading screen's one line, if the story owner wants words written for it; the UI uses it the moment it exists (`text.ts loadingLine`), and `index.html`'s `<div class="says">` must then say the same (`tests/ui/text.spec.ts` fails until it does). |
| 2 | **core / fixer (manifest)** | File sizes in the asset manifest (or `load/progress` in bytes), so `BOOT_FILE_BYTES` need not be a figure in `src/ui/loadMeter.ts`. `tests/ui/text.spec.ts` holds the figure within 30 % of `public/assets`; a team that changes the `always` or `surface` files by more than that updates the one number (the test prints it). A streamed fetch would also remove the stand-still while one large file is in flight. |
| 3 | **core / world / render-tech** | **Seen, not ours: "Quit to title" from an underground checkpoint leaves a title with no terrain** (sky, the Rule and the revolver only): `shots/i2-team-ui/quit_under_b.png`, `scratch/i2-team-ui/quit.mjs` (Begin, `__dbg.checkpoint('cp_gallery_bay')`, pause, Quit; `world.set` says `surface`, built zones the three surface ones, the player still at the gallery's position). Reached here through the debug jump; a player who chooses "Go on IV · 1" and then quits may meet the same. |
| 4 | **core (index.html)** | `index.html #preload` was edited by the UI team again (the issues named it; core is not active in this pass): the mark at twice its size, the `.says` line, the 3:2 rule for the line. |
| 5 | **look teams** | Yours to tune: the objective's ink ground (`ui.css .obj::before`), the aqua key cap, the loading line's type. |

### 3. Declined

| Item | Why |
|---|---|
| An option row "Objective: brief / off" | `Options` is core's contract (frozen for this team); the line is five seconds, top left, and not drawn under any sheet. If wanted: a boolean `objectiveInPlay` in `Options`, read in `hud.ts onObjective`. |

## Closer, pass i2 (2026-10-07): decisions on this file's i2 rows

| Row | Decision |
|---|---|
| Section 1 rows 1 to 11 | **Mirrored**: GDD 23.15 (12.2, 12.3), ART_BIBLE "Amendments, pass i2" (10) |
| Section 1 row 3, the objective is not held back by a fight | **Accepted** as built (the lines that change in a fight name that fight) |
| Request 1, `ui_loading_line` | **Not added**: the line shown is the back-story's own two sentences and reads well; a key can be added later with `index.html` in the same change |
| Request 2, file sizes in the manifest / a streamed fetch | **Open** (a core and manifest change): `docs/KNOWN_ISSUES.md`. `BOOT_FILE_BYTES` was checked against the final assets by `tests/ui/text.spec.ts` |
| Request 3, "Quit to title" from underground shows no ground | **Found and fixed.** She IS on the start mark (16, 14, 107.5 is `player_start`); the world's zone and visibility only followed on the title's first tick, so a script that stepped no tick (or one drawn frame in a browser) showed sky and the Rule alone. `src/world/index.ts`: the `game/state` -> `title` handler now calls `placed(0)`. `scratch/i2-closer/quit.mjs`, `shots/i2-closer/quit_under_a.png` |
| Request 4, `index.html #preload` | **Accepted** (the built page is checked by `tests/e2e/production.test.mjs` and the release check) |
| Declined: an option row for the objective | **Left declined** |

## Fixer, pass i3 (2026-10-07): decisions on the rows left open

| Row | Decision |
|---|---|
| Request 2, pass i2 (file sizes in the manifest, or a streamed fetch, for the loading bar) | **Declined.** `BOOT_FILE_BYTES` is held within 30 % of the shipped files by `tests/ui/text.spec.ts` and was 1.6 % low at the last build; a streamed fetch is a core change that buys a smoother bar and risks the cold load (R15). Update the constant when the closer's build changes the total by more than a few per cent |
| Request 1, pass i2 (`ui_loading_line`) | **Not added** (as the closer ruled). If this pass dresses the loading screen with the title frame (story-b), the file is `public/share.jpg` (1200 x 630, 72 816 B, already shipped and fetched by nothing else): address it relative to the page (`./share.jpg`), never by an absolute path |
| The page's share tags | `index.html` is unchanged; the Pages build now also writes `og:url`, `og:image:secure_url`, `twitter:image` and a canonical link (`tools/share_head.mjs`, `tests/core/pageHead.spec.ts`). **Keep the line `<meta property="og:image" content="./share.jpg">` exactly as written**: the build replaces it and fails if it is gone |
| `obj_yard` | the text is now "The yard is not empty." (`design/story.json`); nothing in `src/ui` or `tests/ui` holds the old words |

## UI team, pass i3 (2026-10-07)

Six reviewer issues (story-a, story-b), all resolved in `src/ui/`, `index.html #preload` and `tests/ui/`. Evidence:
`shots/i3-team-ui/`, `tests/ui/i3_real.test.mjs` (six tests in the real game), log `scratch/i3-team-ui/NOTES.md`.

### 1. Changed numbers and behaviour (for the closer to mirror into GDD 12.2 / 12.3 and ART_BIBLE 10)

| # | Where | Was | Is | Why |
|---|---|---|---|---|
| 1 | GDD 12.2 (interact prompt) | a line at 57.5 % of the height, 54 px under the crosshair (y 414 to 438 at 720p) | **the top row of the talk column, above the key hint and the subtitle** (y 546 to 571 with a subtitle up, 600 to 624 without; 186 px and more under the crosshair). It takes no room when it is not drawn, so the hint under it never moves (`hud.ts`, `ui.css .prompt.row`) | story-a: it lay on the proving plate's pictogram and the stone's cases and touched the muzzle |
| 2 | GDD 12.3 (title, frames narrower than 3:2) | the column 5.5 % from the bottom, bare | **the column and the Begin question stand on a soft ink ground** (ink at 56 %, blurred 18 u: the objective's own device). At 1024 x 768 the sand beside "The story so far" goes from 194 to 131 of 255. 16:9 has none | story-a |
| 3 | R15 (pre-boot page and loading screen) | name, mark, line and a 220 px line on flat ink | **the title frame behind them, out of focus and dim**: `public/share.jpg` (already shipped, asked for once, by its relative address `./share.jpg`), `blur(1.3vh) brightness(0.42) saturate(0.9)`, in a box a third taller than the frame at the top so the picture's own printed name is never seen. Shown when it has arrived whole (0.9 s fade on the pre-boot page; the loading screen takes it over with no second fade). **The line is as wide as the name** (106 to 634 px at 720p; the name ends at 646). **When the load ends in the title the picture fades off the live shot in 0.7 s** (`.loading.out`; not under `?test=1`, not with reduce motion) and is then removed. Frame mean 17.3 (flat ink) -> 47.7 | story-b |
| 4 | GDD 12.2 (low health, under 35 %) | an ink inset edge and a breathing outline on three 30 px bars | **plus a pale hairline just inside the frame with a heavier pale bracket in each corner, breathing with the bars, drawn over the ink edge; and the three bars at 1.8 times their size** (97 -> 175 px at 720p, still under the seventh). Boss room: bracket pixels 58 -> 227, hairline 45 -> 123; Tally House: 24 -> 227, 24 -> 116. No red, no flash; reduce flashes / motion: steady | story-b: nothing showed in the dark rooms |
| 5 | GDD 12.2 (work at hand) / 13.4 (the asking) | "The bore door asks three questions." for five seconds; the question itself a 2.5 s subtitle | **the live question under the work at hand, in the station's face and aqua, with its count ("IDENTIFY STATION.  1 OF 3"), standing for as long as she is inside `trg_pz_asking` and the puzzle is unsolved** (five seconds more when she leaves; back when she comes back; it follows `asking/question`; gone when solved). **The pause screen's work at hand carries the same line.** Words: the volume's `lines.q1..q3` and `ui_end_of` | story-b |
| 6 | GDD 12.3 (readable sheet) | Close names Esc (or the right button with the pointer locked) on every card | **on the last card, or the only one, Close (or the story cards' Begin) names the key that turned the cards: "E  Close"**. Esc, the right button and Enter do what they did | story-b |
| 7 | GDD 12.3 (credits) | one sentence | story.json's sentence, then "Made with three.js and Blender.", then three lines: **Version** `1.0.0 · <day>` (the day is the page's `document.lastModified`: on Pages, the day it was published), **Source** and **Report a problem** as links to the repository and its `/issues` (a page on `<owner>.github.io/<repo>/` links to that repository, so a fork links to the fork; anywhere else `https://github.com/KnotEnvy/keep-seven`). Links open a new tab | story-b |
| 8 | ART_BIBLE 10 ("no image in the UI") | none | **one**: the share picture behind the pre-boot page and the loading screen (`tests/ui/text.spec.ts` holds it to exactly one `new Image(` in `system.ts`; the stylesheet still has no `url(`) | row 3 |

### 2. Requests

| # | To | Request |
|---|---|---|
| 1 | **closer / fixer (story.json)** | Four keys for the credits, used the moment they exist (`src/ui/text.ts CREDITS_FALLBACK` holds the fallbacks; `tests/ui/text.spec.ts` and `tests/ui/perf.test.mjs` allow exactly these four literals until then): `ui_credits_made` ("Made with three.js and Blender."), `ui_credits_version` ("Version"), `ui_credits_source` ("Source"), `ui_credits_report` ("Report a problem"). When they land, delete the fallbacks |
| 2 | **closer** | `src/ui/text.ts VERSION` is `package.json`'s version by hand (`text.spec.ts` fails when they differ): change both together at a release. `REPOSITORY` is `https://github.com/KnotEnvy/keep-seven` (the `origin` remote): change it if the repository is renamed or a custom domain is used |
| 3 | **closer** | When `public/share.jpg` is remade (`tools/make_share_image.mjs`), keep the printed name in the picture's top fifth: the backdrop hides the top 23 % of it. Re-run `tests/ui/i3_real.test.mjs` (the last test) and look at `shots/i3-team-ui/real_loading.png` |
| 4 | **core (index.html)** | `index.html #preload` was edited by the UI team again (the issue named it; core is not active): a `.bg` element and its style, the line's width, four lines in the inline script that set the picture. The line `<meta property="og:image" content="./share.jpg">` is untouched (`tests/core/pageHead.spec.ts` passes) |
| 5 | **e2e / closer** | Seen, not ours: `tests/e2e/playthrough.test.mjs` passes (4 of 4, the same hash on a second load) but ended at **31 860 ticks, hash `9c2c90f2`** when run at 19:05 with the enemies, world and render-tech teams' edits of this pass in the tree (the fixer's figure was 31 582, `e06c074a`). The UI added no key to its debug state and calls nothing of the simulation; the change was not isolated to a team (no stash allowed) |
| 6 | **look teams** | Yours to tune: the backdrop's dimness and blur (`ui.css .load-bg`, `index.html #preload .bg`: keep the two equal), the low-health brackets' size and weight (`.lowf`), the title column's ground at 4:3 |

### 3. Declined

| Item | Why |
|---|---|
| "Optionally desaturate the frame slightly below 35 HP" (story-b) | The picture is render's canvas (a post-processing uniform, or a CSS filter over a WebGL canvas, which costs a full-screen pass on the Low tier). The brackets, the hairline and the larger bars are seen in both dark rooms without it |
| "Enlarge the mark to match the title screen" (story-b) | Already equal: the loading screen, the pre-boot page and the title draw the same 52 px mark at 720p (pass i2); the reviewer's 36 px was its width |
| A sandbox button for the door's question | The sandbox's world stub has no bore zone or asking puzzle; the real game covers it (`i3_real.test.mjs`, test 4) |

## Closer, pass i3 (2026-10-07): decisions

| Row | Decision |
|---|---|
| 1 rows 1 to 8 | Mirrored: GDD 23.17, ART_BIBLE "Amendments, pass i3 (closer)" |
| 2.1 the four credits keys | **Applied** in `design/story.json` (`ui_credits_made`, `_version`, `_source`, `_report`). `CREDITS_FALLBACK` is left in `src/ui/text.ts` (now unused at run time; `tests/ui/text.spec.ts` pins its key list): delete both together in a later pass |
| 2.2 `VERSION` / `REPOSITORY` | Checked: `1.0.0` = `package.json`; the repository is the `origin` remote |
| 2.3 `public/share.jpg` | Remade from this pass's title frame; `tests/ui/i3_real.test.mjs` re-run in the gate |
| 2.4, 2.5 | Noted; the playthrough's figures are the closer's (INTEGRATION_REPORT Part P) |

## Fixer, pass i4 (2026-10-08): what is ready for this team, and what is ruled


| Item | State |
|---|---|
| A visitor without a mouse (ruling R20) | **Done before the game**: `index.html` shows "KEEP SEVEN needs a mouse and a keyboard. Open it on a computer." with "Load it anyway" and asks for no model or texture until that button is pressed (`src/main.ts` waits on `window.__keep7Gate`); `tests/e2e/i4.test.mjs`. It leaves **`html[data-input="touch"]`** set. **Yours:** the same line on the title for that visitor: `ui_needs_input` is in `story.json` |
| A refused pointer lock | `ui_lock_refused` is in `story.json` ("The browser will not give the game the mouse. Open the page in its own tab."). Counting refusals needs nothing new from core: `ctx.input.pointerLocked` and your own click count on the click-to-resume plate |
| The pause legend's line for a held line round | `ui_legend_line` ("A line round, held. {line} seats it under the hammer.") |
| The three keys | are listed in `tests/ui/text.spec.ts` `INTENTIONALLY_UNUSED` so the tree is green before you start: **take each out as you use it** |
| The loading screen | core now draws "Waiting on the connection." (`#flow-waiting`, bottom left under the bar, `z-index` 900) after 8 s without a byte in the states `boot` and `loading`. If you would rather host it in `loadMeter`, hide `#flow-waiting` in `ui.css` and read `story.system.waiting`; say so here |
| The end card's Time | is now the whole run (core carries time and deaths across a restore): no change needed in the card |
| Being hit (ruling R20) | yours (the arc, the edge darkening); the camera's part is the player team's and the sound the audio team's |

## UI team, pass i4 (2026-10-08)

Eleven carry-over issues (`scratch/lead/carryover-issues.json`, team `ui`). Working log: `scratch/i4-team-ui/NOTES.md`;
images (opened): `shots/i4-team-ui/` (`before_*` = the tree as the fixer left it, `after_*` / `real_*` / the rest = now);
tests: `tests/ui/i4.test.mjs` (six, beside the stubs) and `tests/ui/i4_real.test.mjs` (three, the real game).

### 1. What changed, for the closer to mirror into the documents (rulings R1, R20)

| # | Was (document) | Is now (code) | Why |
|---|---|---|---|
| 1 | GDD 6.x "Damage feedback" (line 274) and 12.2 "Damage arc" (line 1325): "directional arc on the HUD for 0.6 s" | **1.0 s** (`hud.ts ARC_SECONDS`, whole 0.6 s, fading 0.4 s), radius 78 units (was 46), stroke 7 (was 3), **58 / 74 / 92 degrees wide by damage** (8 .. 30 points); **and the side of the frame the hit came from is inked in under a pale bar for 0.9 s** (`EDGE_SECONDS`; `ui.css .hurt`). A hit from a quarter lights two sides, one with no direction all four. Still pale on ink, no red, never the whole screen. Everything is counted in fixed ticks (it was a keyframe on the wall clock). Reduce flashes: the side rises over 0.2 s to 60 % | ruling R20; combat reviewer (major) |
| 2 | GDD 23.x (pass i2): "the dot is named for six seconds when the first line round is taken, and while its hint is drawn" | **named for as long as a line round is held** (`LINE_LABEL_ALWAYS`); the pause screen adds one sentence with the key (`ui_legend_line`) | story reviewer b |
| 3 | GDD 12.x / polish round 5: "a movement card never stands over a fight" (cut to 1 s + 0.3 s at a threat) | that rule stands; **added: a card STANDS ASIDE** (one row in the checkpoint numeral's place, "V · 1  THE WEIGHT", the name in brass; nothing in the middle of the frame; the work at hand does not wait for it) **while a vignette plays (`vignette/state`), an enemy is awake (`enemies.threat > 0`), an encounter is live or the Windlass is fighting** (`hud.ts CARD_ASIDE`). `visibleText().card` still reports the card's words while it is aside | combat reviewer: the card over the Tamper's entrance after "Go on" |
| 4 | ART_BIBLE 10: "no panels" for prompts | every row of the talk column (the interact prompt, a key hint) stands on the ink ground of the kept-round prompt (ink at 62 %); the death line stands on the subtitle's ground (the option's opacity, never under 45 %) | story reviewers a and b |
| 5 | ART_BIBLE 10 / pass i2: the left column at 7 % of the width | **in a frame narrower than 3:2 the column (name, menu, question, loading line) stands at 3.5 %**, the items carry an ink halo and the column's ground is ink at 74 % reaching 48 units right | story reviewer b |
| 6 | GDD 12.2: boss name 15 units | never under 10 px | story reviewer b |
| 7 | pass i2: the work at hand fades as one box in 0.6 s | the words go first (0.3 s) on the ground at full strength (ink at 50 %, was 42 %), then the ground (0.2 s) | story reviewer b |
| 8 | (new) | at the asking's dial, in a frame narrower than 3:2, the work at hand is a column of at most 300 units / 23 vw on a thin ground: it ends at 237 px of 960, short of the stencilled "LIFT STATION 4" at 280 | story reviewer b |
| 9 | (new, ruling R20) | the title shows `ui_needs_input` above its column when the visitor has no fine pointer or no pointer lock (`system.ts needsInput()`: `html[data-input="touch"]`, or the same two questions index.html asks); the click-to-resume plate shows it too; the plate shows `ui_lock_refused` from its second showing with no lock in between (`PLATE_REFUSED`) | robustness reviewer (major, minor) |

### 2. For other teams

| To | What |
|---|---|
| **core (index.html)** | Edited by the UI team (core is not active in this pass): one rule in the page's style, `@media (max-aspect-ratio: 3/2) { #preload .head { left: 3.5%; } #preload .line { left: calc(3.5% + var(--u) * 24); bottom: 5.5%; } }`, so the pre-boot page and the loading screen still coincide at 4:3. `tests/ui/i2.test.mjs` and `i4.test.mjs` pin it. `#pre-note` (the fixer's notice) is untouched and still at 7 % |
| **player** | The second half of "at 4:3 the muzzle crowds port 4" is the view-model's: apply the dial tuck from the asking's volume (`trg_pz_asking`), not only at close range. In `shots/i4-team-ui/after_dial_4x3_walked.png` (taken while your edits were in the tree) the gun is already lowered at the volume's edge; the UI's own flag for that volume is `hud.debug().dial` |
| **player / audio** | Being hit (ruling R20): the UI's part is done (the arc, the side of the frame). The camera's kick and the hurt sound are yours. `player/damaged` with `fromX/fromZ` equal to her own position is drawn as a hit with no direction (all four sides) |
| **enemies / world** | The card's stand-aside reads `enemies.threat` and `vignette/state`. A vignette that is `started` and never `ended` / `skipped` keeps every later card aside until the next restore (`hud.reset`) |
| **closer** | (1) `debug().lineLabel` is now true whenever a line round is held: the playthrough's hash moves with it. (2) `tests/ui/i2_real.test.mjs` "the loading line follows the bytes in" failed once in this pass's first full run of the suite (the line 0.2 behind the bytes while other teams' suites ran beside it) and is not touched by this pass: see the note under 3 |
| **look teams** | Yours to tune: the pale bar's weight and length (`ui.css .hurt`: `--w`, the 27 % / 21 % insets), the ink band's depth (the `box-shadow` of `.hurt i`), the 4:3 title ground (`.title > .menu::before`: 74 %) |

### 3. Declined, and why

| Item | Why |
|---|---|
| "hold the death line 0.5 s before the world fades back in" (story reviewer a) | Core hands control back 1.8 s after the death and the ink fades off the game in 0.5 s; holding the ink longer would cover half a second of a fight that is already running (the Tamper is advancing, the Windlass is firing). The plate does what the hold was for: the line is read over the picture from the first frame, for 1.4 s |
| "do not offer Begin" to a visitor without a mouse | The fixer's pre-boot notice already stands in front of the download with "Load it anyway"; a tablet with a keyboard and mouse attached, or a browser that misreports its pointer, can still play. The title says the line above the column and leaves the choice |
| Counting refused lock requests in `core/input` | Not needed (and core is frozen): the plate's own count of showings with no lock in between is the same fact |

## Closer, pass i4 (2026-10-08): decisions

| Row | Decision |
|---|---|
| 1 rows 1 to 9 | Mirrored: GDD 5 and 12.2 in place, GDD 23.19, ART_BIBLE "Amendments, pass i4 (closer)" |
| 2 core: the `index.html` rule | Kept; `tests/core/pageHead.spec.ts` and the release check pass with it |
| 3 the three declined items | **Upheld** |
| The load-meter test under load | Run alone in the closer's gate (one suite at a time): see INTEGRATION_REPORT Part R |

# Pass i5 (UI team)

One issue (visual reviewer b, minor): being hit was drawn as hard cream bars that read like progress bars.

## What changed (`src/ui/ui.css` `.hurt`, `--hurt`, `--hurt-hot`; `src/ui/hud.ts` comment only)

The pale bar on the side of the frame a hit came from is gone. That side is now a **soft flare**: three blurred outer
shadows of one ellipse lying wholly outside the frame (a hot rim `rgb(236 104 118 / 0.9)`, the warm red-violet
`rgb(172 38 84 / 0.84)`, and ink at 86 % under them). Nothing in it has an edge or a fill; it is deepest at the middle
of the side and tapers toward the corners; it never reaches the middle of the frame. The arc by the crosshair, the
timing (whole 0.35 s, fading 0.55 s, `EDGE_SECONDS` 0.9), the strength by damage, the two-sides and four-sides rules
and the reduce-flashes behaviour (rising over 0.2 s to 60 %) are unchanged.

## For the closer: documents to mirror (ruling R20 and the reviewer outrank the numbers)

| # | Document | Was | Is |
|---|---|---|---|
| 1 | ART_BIBLE 10 (`ui_pale` row, line 1431: "No red anywhere in the UI"), line 1657, line 2296 (row "10 being hit"); `ui.css` header | no red anywhere in the UI; the frame's side inked under a pale bar | **one exception**: the flare of a hit, warm red-violet `#AC2654` with a rim `#EC6876` over ink, blurred, on the side(s) the hit came from. Everything else in the UI is still brass, bone and ink; the seventh's violet `#B24BFF` is still only the seventh's |
| 2 | GDD 6.x "Damage feedback" (line 274) and 12.2 "Damage arc" | "... the side of the frame the hit came from inked in under a pale bar for 0.9 s" | "... the side of the frame the hit came from flares warm red-violet over an ink bruise, soft-edged, for 0.9 s (whole 0.35 s, fading 0.55 s)"; the arc stays "pale, not red" |

## Evidence

- The reviewer's own place and hit (street, 30 from the front-left), real game, Low and High:
  `shots/i5-team-ui/real_{low,high}_street_before.png`, `..._hit_t01 / t04 / t10 / t25 / t40 / t60.png`.
  Low: top of the frame `147,177,159 -> 144,63,84`, left `74,60,66 -> 131,47,71`; the hardest step of luma from one
  line to the next going inward is 1.6 (top) and 2.5 (left) of 255 (the bar stepped by more than 150).
- Dark room (the gantry, 18 from behind): `shots/i4-team-ui/real_gantry_hit_behind_02.png` (rewritten by the test).
- Sandbox, glare and dark: `shots/i5-team-ui/flare_glare_heavy_right.png`, `flare_dark_heavy_right.png`,
  `flare_mid_no_direction.png`; the hardest step the flare draws anywhere in its third of the frame is <= 14 of 255.
- Tests: `tests/ui/i5.test.mjs`, `tests/ui/i5_real.test.mjs` (`KEEP7_I5_TIER=high` runs it on High); amended
  `tests/ui/i4.test.mjs`, `i4_real.test.mjs` (no bar) and `perf.test.mjs` (the sweep's "no red" exempts exactly the
  flare's two colours on `.hurt`'s shadows).

## Known gaps

- On a dark frame the flare lights the side (the red-violet shows) and on a bright one it bruises it (the ink shows):
  by design, but the look teams may want to tune `--hurt` / `--hurt-hot`; they are two custom properties in `ui.css`.
- A light hit (8 points) is drawn at 60 % strength: visible, deliberately modest.

## Closer, pass i5 (2026-10-08): decisions

| Row | Decision |
|---|---|
| Documents rows 1 and 2 | **Mirrored**: ART_BIBLE 10 (`ui_pale` row and line 35 in place; "Amendments, pass i5 (closer)"), GDD section 5 and 12.2 in place, 23.20 |
| GPU paint cost of three blurred shadows | Not measurable here (no GPU): in `docs/KNOWN_ISSUES.md` |
