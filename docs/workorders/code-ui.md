# Work order: `code-ui`

Phase 3 (production, round 1). Module: **`src/ui/`** (TypeScript + CSS, DOM only). You are a
fresh agent: this file plus the documents it names are everything you need.

Read first: `CLAUDE.md`, `docs/PLAN.md`, `docs/workorders/README.md`; `docs/GDD.md` **12 (all:
onboarding, HUD, menus, 12.4 "the seventh as a system"), 15 (options table), 6.6, 6.8
(markers), 8.3 (boss HUD), 4.4 (ending), 17 "Captions"**; `docs/ART_BIBLE.md` **10 (all: your
visual specification), 5.6 (the mark's construction)**; `docs/ARCHITECTURE.md` 3.4 (state
machine), 3.5 (the readable and interact rows), 5 (contracts: section 5 `Options`, `RunStats`;
section 6 events; `UiApi`, `UiScreen`), 10.2, 10.3, 12, 13; `design/story.json` (`ui`, `lines`,
`readables`, `objectives`, `meta`). Then `src/core/contracts.ts`, `src/core/stubs/nullUi.ts`.

**The foundation as built (binding; where it and this order disagree about the harness, the
hook or the engine, it is what the code does):** `docs/FOUNDATION_REPORT.md` sections 2 (test
commands and their cost), 3 (debug hook, harness, deaths inside a script), 5 (sandbox, the
stubs beside you), 6 and 9 (known gaps); `docs/requests/foundation-core.md` section 4;
`tests/core/example.mjs`; README section 4 ("Read first", 4.1 "Standing on the foundation"). Two rules of it
shape your screens: **the click or key that drives a menu is never a gameplay press** (core
drops every unconsumed edge on entering `playing` and on `setGameplayEnabled(true)`: you need
no code for it), and **the run flow is core's** (you only emit `ui/action`).

## 1. Mission

The screen stays almost empty: a crosshair, three thin health bars, and in the lower right
**the game's one idea drawn as a glyph**: six brass discs in a ring that turns one notch per
shot, and a seventh cartridge, sealed, apart, joined to the ring by a hairline. It is the
Pellam maker's mark, it is the boss seen face-on, and it has to sit there untouched for
twenty minutes so that breaking its band means something. **The seventh is load-bearing: no
pass may remove, hide or restyle it into the ring** (`story.json` `meta.load_bearing`).
Around it you build everything the player reads: subtitles in two voices, captions for every
key sound, prompts, lazy key hints, title cards, readables, menus with full options and
rebinding, the death and end cards. Pillar 1 (the ring makes the count readable by shape),
pillar 3 (text is the narrator), pillar 5 (**DOM writes only on change**; zero layout work
per frame). Drawn in the gun's language: brass, bone and ink, thin strokes, no panels, no
gradients, **no red anywhere**.

## 2. Owned files (exclusive)

```
src/ui/**                    index.ts (exports exactly createUiSystem) + your .ts and .css files (import CSS from TS)
sandbox/ui.html  sandbox/ui.ts
tests/ui/**
shots/code-ui/**
docs/requests/code-ui.md
```

Import rule: only `src/ui/`, `src/core/`. **No three.js, no canvas drawing of the HUD, no
web fonts, no images fetched** (glyphs are inline SVG or CSS). Never edit `index.html`,
`src/core/`, `design/story.json` (a missing string is a request), other modules.

## 3. Contracts

- **Implement** `UiSystem` = `GameSystem` + `UiApi`: `modalOpen`, `screen: UiScreen | ''`, `visibleText(): { subtitle, speaker, caption, prompt, hint, card, checkpoint }`, `debugState()`. Factory `createUiSystem(ctx, root)`: build all DOM under `root` (the `#ui` element) in `init()`.
- **Listen** (you are event-driven; nobody calls you): `game/state`, `load/progress`, `story/line`, `story/line_end`, `story/card`, `story/caption`, `objective/changed`, `checkpoint/saved`, `interact/focus`, `readable/opened`, `ui/hint`, `combat/hit`, `combat/line_resolved`, `player/damaged|healed|health_segment|died|respawned`, `weapon/fired|ammo|reload|line|kept|seventh|dry_fire`, `boss/phase|pips|proven|defeated`, `ending/card`, `options/changed`, `quality/changed`, `input/pointer_lock`.
- **Read each frame** (cheap, no events for continuous values): `ctx.player.health / weapon`, `ctx.world.objective / lamps / stats / checkpoint`, `ctx.enemies.boss`, `ctx.options.value`, `ctx.state.current / pauseReason`, `ctx.save.hasStoredSave()`.
- **Emit**: `ui/screen { screen, open }`, **`ui/action { action }`** (`play`, `continue`, `resume`, `restart_checkpoint`, `quit_to_title`, `again`: core's flow does the work; you do not call `world` or `assets`), `audio/cue` (`ui_move`, `ui_select`, `ui_back`).
- **Direct calls you may make**: `ctx.options.set / reset`; `ctx.state.request('playing', 'readable_closed')` when the readable viewer closes, and `state.request('paused', 'menu', 'menu')` is **not** yours (the loop's `handlePause` does it): you react to `game/state`; `ctx.input.requestPointerLock()`, `exitPointerLock()`, `setGameplayEnabled()`, `captureNextCode()`; **`ctx.audio.unlock()` and `input.requestPointerLock()` inside the same click** as Begin / Go on / Resume / click-to-resume.
- **You hold no state that must survive a reload**: everything comes from `ctx` and events. No literal player-facing strings: `ctx.data.ui(key)`, `line(key)`, `story.readables[key]`, `story.objectives[key]`; placeholders `{n}`, `{movement}` (roman numeral), `{forward}` `{left}` `{back}` `{right}` `{fire}` `{reload}` `{sprint}` `{interact}` `{line}` `{kept}` replaced with the **currently bound** key names.

## 4. Deliverables

### 4.1 Tokens and type (ART_BIBLE 10.1, 10.2)
- [ ] CSS custom properties: `ui_bone` `#E9E2D0` (all text, crosshair, health), `ui_ink` `#14110F` (outlines, subtitle backing, scrim), `ui_brass` `#C9A14A` (chambered rounds, selected item, rules), `ui_brass_dim` `#6E5A2E` (empty chamber rings, disabled), `ui_aqua` `#7CF2E2` (line round dot and pips, station label, proving prompt), `ui_violet` `#B24BFF` (**only** the seventh in state `violet`), `ui_pale` `#F3E6CF` (damage arc, markers), `ui_flame` `#FF9433` (**boss pips only**). No red.
- [ ] System stacks only: serif `"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", "URW Palladio L", Georgia, serif` (narrator italic, readable bodies, title); sans `"Avenir Next", "Segoe UI", "Helvetica Neue", "DejaVu Sans", Arial, sans-serif` (station lines and labels: uppercase, weight 600, letter-spacing 0.18em; menus weight 500, 0.08em; numerals tabular).
- [ ] Sizes scale with the viewport height (the numbers below are at 1080p); layouts hold at 1280 × 720, 1920 × 1080, 4:3 and 21:9.

### 4.2 HUD (GDD 12.2; look ART_BIBLE 10.3)
- [ ] **Crosshair** (centre): a 2 px dot and four 5 px ticks with a 1 px ink outline; size (0.5–2), colour and outline from options. **Plumb glyph** (a dot under a short vertical stroke) while the kept round is chambered; its stroke lengthens while `weapon.keptAimLegal`.
- [ ] **Cylinder ring** (bottom right): six brass discs (10 px) on a 64 px ring, 1 px ink outline; empty chamber = a 1.5 px `ui_brass_dim` ring; a notch tick at the top marks the chamber under the hammer; a chambered line round is an aqua disc; the kept round a white dot with an aqua ring. **The ring turns one notch (60°) per shot over 0.18 s** and jumps 2 px and settles (the ring kick); fills dot by dot on `weapon/reload { stage: 'round' }`. Reserve count beneath as a small tabular numeral (`ui_hud_reserve`). No backing plate.
- [ ] **The seventh**: a cartridge drawn side-on, upright, 9 × 22 px, bone outline, its band a filled bar, **20 px from the ring, lower right of it, joined to the ring's centre by a 1 px hairline: together they are the six-and-one mark**. Present from the first frame of the HUD. States from `weapon.seventh`: `sealed` (band whole) · `pulse` (the outline breathes 1 → 1.6 px every 2 s) · `band_broken` (the band in two offset halves) · `chambered` (the slot empty; the round is in the ring) · `spent` (outline only, 50 % opacity, no band, for the rest of the game) · `violet` (band in `ui_violet`). **`weapon/kept { denied }`: the seventh shivers for 0.3 s.** It can never be selected, hidden or merged into the ring.
- [ ] **Line rounds**: 0–2 aqua pips under the ring.
- [ ] **Health** (bottom left): three thin bars 46 × 5 px, 4 px apart, bone (segments 34 / 33 / 33); a lost segment is outline only; the regenerating segment shows a 1 px fill line; a segment flashes its outline on damage. Never a full-screen flash.
- [ ] **Damage arc**: round the crosshair, pointing at the source (`player/damaged` `fromX/Y/Z` against the current view), 0.6 s, `ui_pale`.
- [ ] **Markers** at the crosshair from `combat/hit` (shape, not colour): `hit` four ticks 90 ms · `weak` ticks + a ring 120 ms · `kill` the ticks expand 160 ms · `freed` **the ring alone, closing to a dot** 160 ms · `deflected` a short chevron. Line rounds show one marker per `combat/hit` (40 ms apart).
- [ ] **Boss bar** (top centre) while `enemies.boss.phase` is `parley`…`p3b`: `ui_boss_name` in station capitals above **26 pips (4 × 10 px, 2 px gaps) in groups of 10 / 10 / 6**; lit pips `ui_flame`; in phase 3b they are bone; pips relight in 3a as `boss/pips` says.
- [ ] **Subtitles** (bottom centre): narrator: serif italic, bone, no speaker label; station: tracked capitals with an aqua label (`ui_speaker_station`); the Reeve: serif roman with her label (`ui_speaker_reeve`). **At most 2 lines of 42 characters** (wrap by words; `story.meta.rules.subtitle_max_chars` 84); soft ink backing at `options.subtitleBackground` (default 60 %), 12 px padding, no border; sizes S / M / L / XL with **M = 2.6 % of screen height**; hidden when `options.subtitles` is off. Show on `story/line`, remove on `story/line_end`.
- [ ] **Captions** (above the subtitles): 80 % size, square brackets, 70 % opacity, from `story/caption`, 2 s; hidden when `options.captions` is off.
- [ ] **Prompt** (lower centre) from `interact/focus`: one line of capitals with the key in a 1 px bone-outlined square; fade in 0.2 s; `ui_prompt_read`, `ui_prompt_take`, `ui_prompt_use`, `ui_prompt_kept` (aqua).
- [ ] **Hints** from `ui/hint { key, show }`: same style, one at a time: `ui_hint_move`, `ui_hint_fire`, `ui_hint_reload`, `ui_hint_sprint`, `ui_hint_interact`, `ui_hint_line`, and `ui_prompt_kept` shown persistently at hint tier 3. You do not decide when: world does.
- [ ] **Checkpoint** (top left, 2 s) on `checkpoint/saved`: `ui_checkpoint` with `{movement}` as a roman numeral and `{n}` the section.
- [ ] **Title cards** (centre) on `story/card`: the roman numeral in the serif face at 9 % of screen height, a 1 px brass rule 120 px wide, the title in tracked capitals at 2.4 %; fade in 0.6 s, hold, fade out 0.8 s; no backing; no input lock. (`card_*` text is "numeral and title": split on the separator the string uses; `card_title` and `card_end` are single lines.)
- [ ] No minimap, no objective marker, no compass. HUD hidden on the title screen, during rides' dark and on the end card; visible in `playing`, `dead` (fading), `paused` (under the scrim).

### 4.3 Screens (`UiScreen`; emit `ui/screen` on open and close; `modalOpen` true while a menu, readable or card owns the keyboard; `input.setGameplayEnabled(false)` while modal)
- [ ] **`loading`**: `ui_loading` and a 1 px brass progress line from `load/progress`; shown in `boot` and `loading`.
- [ ] **`title`** over the live doorway shot (state `title`): `ui_title` in the serif face, bone, tracked 0.3em, in the dark upper left; the mark as a 28 px brass glyph and `ui_subtitle` in small capitals beneath; a left-aligned column in the dark lower left: `ui_menu_play`, `ui_menu_continue` (only when `save.hasStoredSave()`), `ui_menu_story`, `ui_menu_options`, `ui_menu_credits`; the selected item brass with a 12 px hairline before it. No logo box, no buttons. Keyboard (arrows / W S, Enter, Escape) and mouse.
- [ ] **`story`**: `rd_backstory` (title + body) in the readable style. **`credits`**: `ui_credits_body`.
- [ ] **`options`** (from title and pause; five tabs `ui_opt_tab_controls`, `_comfort`, `_text`, `_sound`, `_picture`; **sensitivity and FOV on the first page**; every change applies at once through `ctx.options.set`, no restart): the whole GDD 15 table: sensitivity ×0.2–×4; invert look; FOV 50–80 vertical **shown as 16:9 horizontal (79–112)**; head bob 0–150 %; screen shake 0–100 %; reduce motion; reduce flashes; subtitles on / off, size S / M / L / XL, backing 0–100 %; captions; difficulty Easy / Normal / Hard with `ui_opt_diff_*_desc`; sprint hold / toggle; fire click / hold; **key bindings** (every `Action` with its `ui_action_*` label, up to two codes each, rebinding through `input.captureNextCode` with `ui_opt_bind_press`, Escape cancels, a code already used elsewhere is swapped, Ctrl never bindable); crosshair size, colour, outline; puzzle hints Off / Normal / Fast; graphics Auto / Low / High (**while the hidden `min` tier runs, show Low as selected**) and resolution scale 50–100 %; volumes master / effects / music; `ui_opt_reset`; `ui_opt_back`. Sliders: a 1 px bone line with a 9 px brass disc; toggles: a ring (off) or a filled disc (on).
- [ ] **`pause`** (state `paused`, reason `menu` or `focus_lost`): a 70 % ink scrim over the frozen frame; `ui_pause_title`; `ui_pause_resume`, `ui_pause_options`, `ui_pause_restart_cp`, `ui_pause_quit`; **the current objective** (`ui_pause_objective` + `story.objectives[world.objective]`); **the cylinder widget enlarged ×3 with the seventh labelled by state**: `ui_seventh_sealed`, `ui_seventh_broken`, `ui_seventh_spent`, `ui_seventh_violet`. Pause works everywhere, including vignettes and the parley.
- [ ] **`click_to_resume`**: when pointer lock is lost without the menu (`ui_click_to_start`); the click re-locks.
- [ ] **`readable`** (on `readable/opened { key }`; the sim is paused by world): a bone card (`#E9E2D0` at 96 %) with ink serif text, about 60 characters wide, rotated 1°; **cast plates** (`rd_plate_*`) use an enamel card (`#CFD6CC`) with ink capitals; title, then the body **in cards: a blank line in the body starts a new card**; `ui_read_next`, `ui_read_close`; `E`, Enter, Space advance; Escape closes; on close call `ctx.state.request('playing', 'readable_closed')` and emit nothing else.
- [ ] **`death`** (state `dead`): fade to ink over 0.6 s, `ui_death` in serif italic for 1.2 s; fade back on `player/respawned`.
- [ ] **`end`** (on `ending/card { stats }`): black; `card_end` in tracked capitals; then the stats as a two-column ledger (label left in capitals, value right in serif), **one row lighting at a time**: `ui_end_time`, `ui_end_rounds`, `ui_end_accuracy` (roundsHit / roundsFired), `ui_end_knots`, `ui_end_lines`, `ui_end_clean_six` (`ui_end_yes` / `ui_end_no`), `ui_end_secrets` (n of 2), **`ui_end_lamps` set apart with one small flame-coloured window glyph per lamp (up to 48, in rows of 12)**, `ui_end_carries` (`ui_end_carries_six`, or `ui_end_carries_his` when `tookStoneRound`). **Never a count of the felled.** Then `ui_end_again`, `ui_end_menu`.
- [ ] Menu actions emit `ui/action` and, in the same click handler, call `ctx.audio.unlock()` and `ctx.input.requestPointerLock()` where the action leads to play.

### 4.4 Rules
- [ ] **DOM writes only on change**: `update()` compares cached values (health, chambers, reserve, pips, aim-legal, prompt) and touches the DOM only when one differs; animations are CSS transitions / keyframes started by a class change; no `innerHTML` in `update`; no per-frame allocation; no layout reads in `update`.
- [ ] `options.reduceMotion`: no ring kick, no shiver animation beyond an opacity blink, cards cut instead of fade. `options.reduceFlashes`: marker flashes become outlines.
- [ ] Text legible over the brightest (the glare) and darkest (the Tally House) frames: 1 px ink outline on every glyph and text.
- [ ] The courtesy ("Water to you" / "And shade") and the oath never appear in any UI string you compose.

## 5. Sandbox (`sandbox/ui.html`): no 3D

A scripted event timeline plus buttons that drive **every HUD state** (the ring turning through six shots and a reload; a line round; each of the six seventh states and the shiver; all five markers; the damage arc from eight directions; boss pips 26 → 0 with a relight; subtitles of each speaker at each size; captions; each prompt and hint; checkpoint; each card) and **every screen** (title with and without a save, story, options with live rebinding, pause, click-to-resume, each readable incl. the three-card ledger and a plate, death, loading, the end card with 9 and with 48 lamps and both "carries" values), at 1280 × 720 and 1920 × 1080, over a bright and a dark backdrop image-free gradient, with reduced-motion variants.

**The stub boss** (`nullEnemies`) reports 26 pips in all and a count and guard per phase; `__dbg.ext.enemies.setBoss({ pips, guard, mouthsOpen, ... })` forces any state and emits `boss/pips` / `boss/guard`: drive the boss HUD with it. `__dbg.ext.core.setSeventh(state)` sets the seventh on the stub player, `__dbg.ext.core.damage(amount, kind, source, ox, oy, oz)` applies damage through `applyDamage` (the damage arc needs the origin; `setHealth` emits no arc), `__dbg.ext.core.playerExtra()` returns `{ control, controlReason, keptAimLegal, shotsFired }`. `ext.enemies.*` exists on the stub only; `ext.core.*` is core's and stays.

**As built in core, to design the options and pause screens against** (core's round-3 fixes; FOUNDATION_REPORT is the reference): the pixel ratio follows the allowance up again when the window shrinks back or `resolutionScale` is raised, so the resolution slider is live in both directions (`quality/changed` fires). **A refused pointer-lock request** (Chrome refuses a re-lock for about 1.25 s after `Esc`) makes core emit `input/pointer_lock { locked: false }`, and the loop then requests `paused` with reason `focus_lost`: after a resume click that the browser refused, your click-to-resume plate must simply come back on that `game/state`, with no timer of your own; the click that finally takes the lock is never a shot (core drops the edges). **A boot failure** (no WebGL2, a missing file): check `docs/FOUNDATION_REPORT.md` for what core writes into `#ui`; `story.json` has no `ui_boot_failed` / `ui_no_webgl` key yet, so a styled plate for it is a request to the story owner, not a literal string in your code.

## 6. Tests (`tests/ui/`)

- [ ] **The seventh** (`seventh.test.mjs`): visible on the first HUD frame; separate from the ring (its box does not intersect the ring's and is joined by the hairline element); each state renders distinctly (pixel-diff between states > 0); `denied` adds the shiver class for 0.3 s; state `spent` persists; the pause screen labels it with the right `ui_seventh_*` string.
- [ ] **Ring**: after `weapon/fired` the ring's rotation target advances 60° and settles within 0.18 s; chamber dots match `weapon.cylinder` after 100 seeded sequences of fire / reload / line events; reserve numeral matches.
- [ ] **Markers**: each `HitOutcome` → the right shape and lifetime (90 / 120 / 160 / 160 ms); shapes differ pairwise.
- [ ] **Subtitles**: every line of `design/story.json` fits in 2 lines of 42 characters at every size at 1280 × 720 (no overflow, no clipping: measure the element); narrator has no label and is italic; station has the aqua label; hidden when the option is off; captions obey the option.
- [ ] **Strings**: a static scan finds no player-facing literal in `src/ui/**`; every `ui_*` key in `story.json` is referenced (or listed as intentionally unused); placeholders are replaced with the bound keys after a rebind.
- [ ] **Options**: every `keyof Options` is reachable in the menu and changes `ctx.options.value` live; FOV shows 79–112 for 50–80; rebinding swaps duplicates and refuses Ctrl; reset restores GDD 15 defaults; graphics shows Low while `quality.tier` is `min`.
- [ ] **Flow**: Begin emits `ui/action play` and calls `audio.unlock` + `requestPointerLock` in the same task; pause opens on `game/state` → `paused` (menu) and not for reason `readable`; the readable viewer pages cards on blank lines and its close requests `playing` with reason `readable_closed`; death and end screens appear on their events; "menu" on the end card emits `quit_to_title`.
- [ ] **End card**: the lamp glyph count equals `stats`-derived `world.lamps`; no element contains the felled count.
- [ ] **No red**: no computed colour in the UI has hue within 20° of red with saturation above 40 % (scan computed styles in every sandbox state).
- [ ] **Writes only on change**: a `MutationObserver` over 600 idle ticks of `update()` records 0 mutations; with one shot fired, only the ring, reserve and marker nodes mutate. `updateMs` for UI ≤ **0.2 ms** median.
- [ ] `visibleText()` reflects what is on screen for each field.

## 7. Definition of done (measured)

1. `npx tsc --noEmit` clean in your files (`npx tsc --noEmit 2>&1 | grep -E 'src/ui|sandbox/ui|tests/ui'` prints nothing); `npx vitest run tests/ui` and `node --test tests/ui/` pass. **Wired in: `KEEP7_REAL=ui node --test tests/core/` passes** (boot and flow are the ones your UI moves: `tests/core/flow.test.mjs` drives the run through `ui/action` and reads the stub's text plate, so expect stub-specific assertions there and report them): boot, flow, walk, seam, determinism, alloc, budget and playthrough then run on the index page with your system in its slot and core stubs in the other five (about 2.5 minutes, up to 3.5 on a busy machine: run it in your final pass, not while iterating). Plain `node --test tests/core/` keeps core stubs in all six slots and **never loads `src/ui/`**: it proves nothing about your system. `KEEP7_REAL` has only ever run against modules that wrap the stubs: a failure your system causes by design (a stub-specific value in an assertion) is a request to core in `docs/requests/code-ui.md` naming the test and both values, listed in your report, not something to work around (README 4.1).
2. `shots/code-ui/` (page screenshots with `dom: true`, opened by you): every HUD state and every screen at 1280 × 720 and 1920 × 1080; `hud_over_glare.png` and `hud_over_dark.png`; `seventh_states.png` (all six side by side, enlarged); `mark_compare.png` (your ring-and-seventh glyph beside the Pellam mark construction of ART_BIBLE 5.6: six at 30° + 60°n, a plumb stroke, a solid seventh).
3. Report: bundle size of your CSS + JS; mutation counts; every string key you needed that does not exist (requests filed); anything not verified on a real display.

## 8. Non-goals

Deciding when hints, prompts, lines or cards appear (world); voicing lines or raising
captions (audio, world); the state machine and run flow (core); 3D rendering, the view-model,
the diegetic boss gauge (render / art); gamepad UI; localisation beyond the `story.json`
keys; a map, objective markers, a compass, a kill counter.

## 9. Dependencies and stubs

- Everything arrives as events and `ctx` reads, so the sandbox timeline is a complete stand-in for the game. Core stubs give `ctx.player.weapon`, `ctx.world.objective`, `ctx.enemies.boss` plausible values; your sandbox sets them through `__dbg` and emits events with `__dbg.emit`.
- `code-world` emits `ui/hint`, `interact/focus`, `story/*`, `objective/changed`, `ending/card`; `code-player` emits `weapon/*`, `combat/hit`, `player/*`; `code-enemies` emits `boss/*`; core emits `game/state`, `checkpoint/saved`, `load/progress` and handles your `ui/action`.
- **Your tests load only your system**: `openGame(server, { piece: 'code-ui' })` on the index page defaults to `stubs: othersThan('ui')` (five core stubs beside you); leave the default. Deaths, restarts and warps inside a script: `game.step / until / run` survive them; in your own `page.evaluate` use `await __dbg.ext.core.stepAsync(n)` (a bare `__dbg.step` stops at the tick that queued the restore). Allocation: `measureAlloc` of `tests/harness.mjs` (3000 ticks of warm-up), ceiling 6 KB per tick. **`ctx.clock.tick` keeps counting while paused or loading**: timers that must stop with the game count ticks in your own `fixedUpdate` or use `clock.simTime` / `clock.unscaledTime` (README 4.1).
- The `#ui` root and the canvas come from foundation's `index.html`; if you need a second root (for example a full-screen scrim layer), create it under `#ui`.
