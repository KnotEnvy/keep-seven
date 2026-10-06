# Requests from `code-ui` (phase 3, round 1)

Owner of `src/ui/`, `sandbox/ui.*`, `tests/ui/`. Nothing below was worked around by editing
another owner's file. Each row says who it is for, what `src/ui` does today, and what would
change if the request is taken.

## 1. Where the order and a source document disagree (the source was followed)

| # | Order (`docs/workorders/code-ui.md`) | Source | What `src/ui` does |
|---|---|---|---|
| 1.1 | 6 "Ring": "after `weapon/fired` the ring's rotation target advances 60° and settles within 0.18 s" | GDD 6.8 shot timeline: "120–300 ms: hammer cock and cylinder turn … the HUD ring turns one notch"; GDD 12.2: "turns one notch (60°) per shot over 0.18 s" | The target advances in the tick of the shot, the ring kick (2 px) plays at once, and the turn itself runs from 0.12 s to 0.30 s after the shot: 0.18 s long, in step with the hammer and the two clicks. `tests/ui/hud.test.mjs` asserts exactly that (still turning at tick 17, at rest at tick 18). If the turn should start at 0 ms, it is one number: `RING_TURN_DELAY` in `src/ui/hud.ts` and the `0.12s` delay of `.turn.ta / .tb` in `ui.css`. |
| 1.2 | 4.2: "a notch tick at the top marks the chamber under the hammer" and "20 px from the ring, lower right of it, joined to the ring's centre by a 1 px hairline" (GDD 12.2 says the same) | ART_BIBLE 5.6: the mark's six discs are at 30° + 60°n "so no disc sits at top or bottom", and the stroke drops plumb | The HUD glyph is the mark with its stroke swung 30° to the lower right: chambers at 0° + 60°n (chamber 0 under the notch at the top), the hairline leaving the centre between the chambers at 120° and 180°, exactly as the mark's stroke leaves between its lower two. The title screen's 28 px glyph is the 5.6 construction itself (upright, discs at 30° + 60°n, six plain discs, the stroke, a solid seventh). `shots/code-ui/mark_compare.png` shows both. **Art bible owner:** one sentence in 10.3 saying the HUD variant has a chamber at the top would close this. |
| 1.3 | 4.3 "`pause` (state `paused`, reason `menu` or `focus_lost`)" and "`click_to_resume`: when pointer lock is lost without the menu"; 5: "after a resume click that the browser refused, your click-to-resume plate must simply come back" | ARCHITECTURE 10.2 (a refused request emits `input/pointer_lock { locked: false }` and pauses with `focus_lost`); nothing says how the two `focus_lost` cases are told apart | One rule: a `focus_lost` pause is the **pause menu** when the pointer lock arrived at least once since `playing` was entered (the player pressed Esc, or the window lost focus), and the **click-to-resume plate** when it never arrived (the request was refused). No timer. Verified in real time with a real mouse (`scratch/code-ui/realtime.mjs`): Begin → lock → Esc-style loss → pause menu → Resume → lock. Chrome's real 1.25 s refusal has not been seen on this machine (headless grants every request). |
| 1.4 | 4.1 token table: "`ui_flame` (**boss pips only**)" | ART_BIBLE 10.4: the end card's lamps are "a small flame-coloured window glyph per lamp" | The lamps use `ui_flame` too (10.4 and the order's own 4.3 ask for it). |
| 1.5 | 3 "Listen": the list names `combat/line_resolved`, `player/healed`, `player/died`, `weapon/ammo`, `weapon/line`, `weapon/seventh`, `weapon/dry_fire`, `boss/proven`, `boss/defeated` | ARCHITECTURE 3.5: "continuous values are read from `ctx`" | Not subscribed: health, the cylinder, the reserve, the line rounds, the seventh and the boss phase are read each frame and compared; death is `game/state`. Subscribing would add nothing to draw. |

## 2. `design/story.json` (story owner)

None of these blocks the UI; each is a place where the UI shows something that is not a
story string, because no key exists. Until they land, `tests/ui/text.spec.ts` lists the asked-for keys of
2.1 to 2.3 in an explicit allow-list (`PENDING`) and checks that each is read through the fallback path
(`uiOr` / `keyStoryKey`), never through `ctx.data.ui`, which throws on a missing key in strict mode.

| # | Missing | What is shown today | Wanted |
|---|---|---|---|
| 2.1 | Names of keys (`{forward}` … `{kept}` are "the bound key names") | Derived from the `KeyboardEvent.code` itself: `KeyW` → `W`, `Digit3` → `3`, arrows → `↑ ↓ ← →`, `ShiftLeft` → `Shift`, `ShiftRight` → `Shift Right`, `Escape` → `Esc`, `Space` → `Space`, `Mouse0` → `Mouse 1`, `BracketLeft` → `Bracket Left`; an unbound action → `—` (`src/ui/text.ts` `keyName`). **Since the fix pass the UI reads these keys the moment they exist** (no UI change needed when they land): `ui_key_mouse_left`, `ui_key_mouse_middle`, `ui_key_mouse_right` (`Mouse0..2`), `ui_key_shift` / `ui_key_shift_right` (likewise `ui_key_alt`, `ui_key_control`, `ui_key_meta`), and for every other code its snake-case name: `ui_key_space`, `ui_key_escape`, `ui_key_enter`, `ui_key_tab`, `ui_key_bracket_left`, `ui_key_numpad_4` … (`keyStoryKey()` in `src/ui/text.ts`; letters, digits and arrows are never looked up). | The keys above, with the words wanted ("Left click", "Space bar", "Esc"). |
| 2.2 | Labels for subtitle sizes | The contract's values `S`, `M`, `L`, `XL` | `ui_opt_size_s`, `ui_opt_size_m`, `ui_opt_size_l`, `ui_opt_size_xl` ("Small" …). The options screen already reads them through `uiOr()` with the letter as the fallback. |
| 2.3 | A word between two counts on the end card | `71 / 96` (rounds that told), `1 / 2` (things found) | `ui_end_of` ("of"): the end card already reads it (`71 of 96`) with `/` as the fallback. |
| 2.4 | `ui_no_webgl`, `ui_boot_failed` (already requested by core, `docs/requests/foundation-core.md` 7) | Core writes its own English line into `#boot-failure` (z-index 1000, above the UI's loading screen); the UI adds nothing | With the keys, the UI can style the plate in the readable's paper. |
| 2.5 | `ui_hud_line_rounds` ("Line") has no place on the HUD in GDD 12.2 (the line rounds are "0–2 aqua pips under the ring") | Used as the legend under the enlarged mark on the pause screen, shown while she carries a line round | Confirm, or say where else it belongs. |

## 3. Other code pieces (contract notes: what the UI assumes about events it only listens to)

| # | For | Assumption | If it does not hold |
|---|---|---|---|
| 3.1 | `code-player` | `weapon.cylinder` is re-indexed in the tick of `weapon/fired`: chamber 0 is the next round under the hammer and the fired chamber is at index 5 (the cylinder turns clockwise seen from behind). The HUD re-reads the cylinder in its `weapon/fired` handler and plays the turn from one notch back. | The dots are always right at rest (they are read every frame); only the 0.3 s of the turn would show the chambers one notch off, or turning the wrong way. |
| 3.1b | `code-player` | **The kept round does not turn the ring** (`src/player/weapon.ts` `fireKept`: "no cock afterward", chamber 0 emptied in place, compacted when the `fire_kept` clip ends). Since the fix pass the HUD follows that rule: on `weapon/fired { ammo: 'kept_round' }` it re-reads the cylinder and kicks the ring but plays no turn and does not advance its notch count; the next change of the chambers after it (the compaction) settles the ring once more (a second 2 px kick), still without a turn. `tests/ui/hud.test.mjs` "the kept shot does not turn the ring". | If the compaction should read as a turn after all (the hand cocking the hammer at the end of the clip), say so: it is one call (`mark.turn()` instead of the second kick in `Hud.update`). |
| 3.2 | `code-player` | `weapon.seventh === 'chambered'` (or `cylinder[0] === 'kept'`) is when the crosshair becomes the plumb glyph; `weapon.keptAimLegal` lengthens its stroke. `weapon/kept { stage: 'denied' }` is the only stage that shivers the seventh. | — |
| 3.3 | `code-player` | `player/damaged.health` is the health after the hit (it picks the segment whose outline flashes); `fromX / fromZ` against `player.position` and `player.forward` gives the arc, quantised to 32 directions. A hit with `from` equal to her own position draws the arc ahead. | — |
| 3.4 | `code-player` | `player/health_segment { segment, regenerating }` switches the thin fill line of that segment on and off; the fill itself is `player.health` (34 / 33 / 33). | Without the event a part-full segment is drawn as a part-full bar. |
| 3.5 | `code-enemies` | `boss/pips.lit` is how many of the 26 pips are lit; the UI draws the **last** `lit` pips lit (the groups go dark from the left as phases break, so phase 3b's six are the right-hand group). After a `boss/pips` event the bar follows events until the next `boss/phase`; before one it shows `enemies.boss.pips`. | If `lit` means something else in 3a (for example only the lit mouths of the last group), say so and the mapping is one line in `Hud.update`. |
| 3.6 | `code-world` | `story/line` is ended by `story/line_end` with the same key (an empty key ends whatever is up). A line whose end never comes is cleared 1.5 s after its `seconds`, counted in sim ticks. `story/caption` text already carries its brackets (story.json has them; the UI adds them only if they are missing). `story/card` text is "numeral. title" for movements and one line for `card_title` / `card_end`. | — |
| 3.7 | `code-world` | `interact/focus { prompt }` is a `ui_prompt_*` key; a focus with an id and a kind but no prompt gets the prompt of its kind. `ui/hint { key, show: false }` hides the hint only when the key is the one shown (or `''`). One hint at a time: a new `show: true` replaces the one that is up. | — |
| 3.8 | `code-world` | `ride/state { started / ended }` is "the ride's dark": the gauges (crosshair, mark, health, boss) hide between the two, subtitles and captions stay. `readable/opened` comes **before** the `paused` request with reason `readable`; a `readable` pause with no readable open shows the pause menu (so the game can never sit paused with nothing on screen). | — |
| 3.9 | `code-world` | The end card's lamp count is `world.lamps` at the moment of `ending/card`; every other figure comes from the event's `stats`. `stats.felled` and `stats.deaths` are never shown. | — |
| 3.10 | `code-audio` | The UI emits `audio/cue` `ui_move` (selection moved, keyboard or a real mouse move), `ui_select` (an item chosen, a card turned, a binding prompt opened) and `ui_back` (Back, Escape). Closing a readable emits nothing (order 4.3). | — |

## 4. Core (`src/core`, frozen)

| # | Subject | Note |
|---|---|---|
| 4.1 | `KEEP7_REAL=ui node --test tests/core/` | See section 5: the result of this piece's final run and any stub-specific assertion it met. |
| 4.2 | Rebinding a mouse button | `Input` hears `mousedown` on the canvas only, and a menu covers the canvas. While a capture is open the UI forwards a mouse button pressed on the menu through `input.injectCode('Mouse<n>', …)` (the contract comment on `injectCode` names the rebinding UI), and swallows the click that follows. No change asked for. |
| 4.3 | `loading` between the title and play | `title → loading → playing` shows the UI's ink loading screen for as long as `world.beginRun` takes (one frame beside the stub world). If the real world takes long enough to see, the cut from the live title shot to ink and back is abrupt; a fade would be the UI's to add, and needs to know that a load is "short". Nothing asked for now. |
| 4.4 | `perf.systemMs` resolution | `performance.now()` is quantised to 0.1 ms in the test browser, so the UI's per-frame figure reads 0.0000 (median). `tests/ui/perf.test.mjs` also times 20 000 direct calls of the UI's tick + frame to get a real figure. |

## 5. `KEEP7_REAL=ui node --test tests/core/`: result (final pass, 2 October, a busy machine)

Final run (after the last UI change): 68 tests, **60 pass, 4 fail, 4 skipped** (the four other pieces'
sandbox pages, as designed), 480 s on a loaded machine. (The run before it: 61 pass, 3 fail; 5.4 appeared
between the two, while `public/assets/env/` was being rebuilt by the art pieces.)
The log is `scratch/code-ui/keep7_real_ui.log`. Boot (min / Low / High, `?cp=`, `?autostart=1`,
the overlay, `?assets=none`), flow (death, checkpoints, `ui/action` from pause, a fresh player,
continue), walk (the critical path), seam, determinism (hash, state and PNG), alloc, budget,
playthrough and `sandbox/ui.html` all pass with the real UI in its slot.

| # | Test | What failed | Caused by the UI? | For |
|---|---|---|---|---|
| 5.1 | `stubs.test.mjs:453` "a production build made after a dev server … **a click starts the run** …" | `page.mouse.click(160, 90)` (the centre of a 320 × 180 page) and then a 90 s wait for the pointer lock. **Stub's behaviour asserted:** `nullUi` starts the run on any `mousedown` anywhere on the page. **The real UI:** the run starts from the title's `Begin` item (`.k7 .title [data-item="play"]`, at 22,91 to 72,106 on that page) or from `Enter`; a click on the empty middle of the title screen does nothing, by the order (4.3: a column of items, "no buttons", no click-anywhere). Everything else that test asserts holds with the real UI: no hook without `?debug=1`, no `#boot-failure`, and after a click **on Begin** the pointer is locked, the title is gone and the HUD is up with no console error (`scratch/code-ui/prod_click.mjs`). | By design (a stub-specific assertion) | **core**: when `ui` is real, click the `Begin` item (or press `Enter`) instead of the page centre. The UI was not changed to make a click anywhere begin the run. |
| 5.2 | `sandbox.test.mjs:190` "viewer ?asset=: … the placeholder flag" | `ia_bore_door [final]`: the test expects a placeholder and `public/assets/props/ia_bore_door.glb` is final art since 18:42. | No: it fails identically with core stubs in all six slots (`node --test --test-name-pattern="viewer \?asset=" tests/core/sandbox.test.mjs`). | core / integrator |
| 5.3 | `walk.test.mjs:117` "random walks from every checkpoint …" | `cp_lip_start` and `cp_lip_gate`: "inside a solid at … tick 0" (18 lines). | No: identical output with core stubs in all six slots (plain `node --test --test-name-pattern="random walks" tests/core/walk.test.mjs`, same coordinates). The lip's files changed under the test during the round. | core / integrator / `art-env-exterior` |
| 5.4 | `flow.test.mjs:69` "ui/action: restart_checkpoint from pause, resume, quit_to_title, play again" | after `play`, the player stands at `[16, 14.0041, 107.5]`, the test wants `player_start` `[16, 14, 107.5]` exactly. | No: identical with core stubs in all six slots (`node --test --test-name-pattern="restart_checkpoint from pause" tests/core/flow.test.mjs`). The lip's ground changed under it (env GLBs rebuilt 18:47 to 18:58). | core / integrator / `art-env-exterior` |

## 6. Re-verification, 4 October (no source change; the machine at load 100 to 165)

`npx tsc --noEmit`: nothing in `src/ui`, `sandbox/ui`, `tests/ui`. `npx vitest run tests/ui`: 16 / 16.
`node --test tests/ui/`: 29 / 29 (332 s). `shots/code-ui/` regenerated by `node tests/ui/shots.mjs` from the current code.

`KEEP7_REAL=ui node --test tests/core/`: 68 tests, **58 pass, 5 fail, 5 skipped**, 1289 s
(`scratch/code-ui/retry_keep7_real_ui.log`). Four of the five are rows 5.1 to 5.4 above, unchanged. The fifth:

| # | Test | What failed | Caused by the UI? |
|---|---|---|---|
| 6.1 | `stubs.test.mjs:277` "real time: the dev page runs its own loop, a click starts the run and the keyboard walks" | `keyboard.down: Target crashed` after 592 s. The page is `?stubs=all`: it never loads `src/ui/`. | No: the browser tab died on a starved machine. Run alone with `KEEP7_REAL=ui` it passes (567 s at load 164). |

Also for `code-audio` / `code-world` (added to section 3): **3.11** a `story/caption` with the same key is not shown again
within 4 s of the last time it was shown (GDD 17 "Captions"; `CAPTION_REPEAT_SECONDS` in `src/ui/hud.ts`, counted in
the HUD's own fixed ticks, so it stops with the simulation). An empty key is always shown.

## 7. Fix pass after the round-2 critic (4 October)

### 7.1 Where the order and a source disagree, or the order was not followed to the letter

| # | Order | What `src/ui` does now, and why |
|---|---|---|
| 7.1a | 4.1 "Sizes scale with the viewport height"; 4.2 the ring 64 px, the seventh 9 x 22 px (at 1080p) | **The six-and-one mark has a legibility floor.** It follows the viewport down to a scale of 0.864 and stops (`MARK_MIN_SCALE` in `src/ui/mark.ts`, `--mk` in `ui.css`): 76 x 100 px, the seventh 7.8 x 19 px, the reserve numeral 10.4 px on a 1280 x 720 frame (before: 59 x 77, 6 x 15, 7.3). `story.json meta.load_bearing` and CLAUDE.md's 720p Low target outrank a uniform scale. The pause screen's mark stays three times the HUD's. The title glyph (28 px) stops at 26 px and has the 1 px ink outline of every other glyph. The reserve numeral is 12 px at 1080p (was 11). |
| 7.1b | 4.2 "`band_broken` (the band in two offset halves)" | The halves are now a whole band's height and more apart (left half 2.5 units above the band's place, right half 3 below, each 3.2 of the 9 wide), so the break is 35 to 40 changed pixels in the 16 x 27 px slot at 720p instead of about 3. Still two offset halves of the same bar. |
| 7.1c | 4.2 "`chambered` (the slot empty; the round is in the ring)" against "It can never be … hidden" | The empty slot is a dashed bone outline at 80 % over a solid ink one at 50 % (was 50 % over 30 %, a ghost on the glare). |
| 7.1d | 4.2 markers "90 ms … 120 ms … 160 ms" | The simulation runs at 60 Hz, so a marker lives a whole number of ticks. It is cleared on the tick **nearest** its lifetime: 5 / 7 / 10 ticks = 83 / 117 / 167 ms (before: the next tick up, 100 / 133 / 167). The CSS keyframes of `kill` and `freed` are 160 ms exactly. |
| 7.1e | 4.2 "jumps 2 px"; the shiver | The kick is 2 screen pixels and the shiver 1.6 at every size up to 1080p (above it they scale with the mark, as every length does). `--mki`, written by the UI on `resize` only. |
| 7.1f | 4.3 readable: "`E`, Enter, Space advance; Escape closes" | Added: **while the pointer is locked, a press of mouse button 0 (or of a mouse button bound to `fire`) turns the card and closes on the last one.** A readable opens with the lock still held (releasing it would cost a re-lock, which Chrome refuses for 1.25 s), so its Next and Close cannot be clicked. The press is stopped in the capture phase on `document`, so core's canvas listener never takes it as a shot; a button already down when the sheet opened does nothing until released. Without the lock, the items take the mouse as before. |
| 7.1g | 4.3 loading | From the title the ink loading screen fades in over 0.25 s (`.loading.soft`); at boot it is ink at once; reduced motion cuts. Its end (loading to play) is still a cut: the UI does not know when the first frame of play is ready, and a fade there would cover live play. |

### 7.2 Still open, not the UI's to close

- **Story owner** (section 2 above, unchanged): `ui_key_*`, `ui_opt_size_s|m|l|xl`, `ui_end_of`, `ui_no_webgl`, `ui_boot_failed`. The UI already reads the first three groups the moment they exist. The end card shows `71 / 96` and `1 / 2` until `ui_end_of` lands. **No styled boot-failure plate**: without the two keys it would need a literal string in `src/ui`, and on a boot failure core writes `#boot-failure` itself.
- **Core / integrator** (section 5 above): `stubs.test.mjs` "a click starts the run" still clicks the page centre, which is `nullUi`'s behaviour; with the real UI it must click `.k7 .title [data-item="play"]` or press Enter. Rows 5.2 to 5.4 (viewer placeholder flag on `ia_bore_door`, random walks from `cp_lip_*`, `restart_checkpoint` y 14.0041) fail identically with stubs in all six slots.
- **Section 1.5 stands**: the nine events of the order's Listen list that carry continuous values are read from `ctx` each frame instead (ARCHITECTURE 3.5). Subscribing would draw nothing new.

### 7.3 Measured in this pass

- Bundle (`scratch/code-ui/bundle_share.mjs`, a production build with `pieces: ['ui']` against one with core's stand-in): **JS 45.9 KB (15.2 KB gzip), CSS 23.0 KB (5.1 KB gzip)**.
- Mutations: 0 in 600 idle frames, 0 in 600 frames of a busy HUD at rest; a shot, its marker and a reload round: ring 6, marker 2, reserve 1.
- Allocation: UI tick + frame 0 B; whole game with the real UI, shooting: 288 B per tick (ceiling 6144).
- `KEEP7_REAL=ui node --test tests/core/` (`scratch/code-ui/fix2_keep7_real_ui.log`, 374 s): 68 tests, **59 pass, 4 fail, 5 skipped**: rows 5.1 to 5.4, unchanged. 5.2 to 5.4 were re-run with core stubs in all six slots in this pass and fail the same way (`scratch/code-ui/fix2_plain_stubs.log`).

## Code integrator, polish round 2 (2026-10-04): what was decided on the rows above

| Row | Decision |
|---|---|
| 2.1 to 2.5, missing story keys (`ui_key_*`, `ui_opt_size_*`, `ui_end_of`, `ui_no_webgl`, `ui_boot_failed`) | **NOT APPLIED**: `design/story.json` is not the code integrator's, and any edit to a design file makes every asset stale. The fallbacks stay (`71 / 96` on the end card). Known gap for the story owner |
| 5.1, `stubs.test.mjs` "a click starts the run" | **APPLIED**: the test clicks `[data-item="play"]` when the real UI's title menu is there, the page centre otherwise |
| 5.2 to 5.4 | **FIXED** (see `code-player.md`) |
| found at integration: `debugState().hud.bossLit` depended on drawn frames | **FIXED** (`hud.ts` `debug()`): the pip figures are the logical ones, so `__dbg.hash()` is the same however many frames a script draws (`walk.test.mjs` under `KEEP7_REAL=all`) |
| 4.3, the cut from the title to play | stands; in the production page the title is up after 18 requests and control comes 53 requests in (`shots/integrate-code/production.json`) |

## 8. Polish round 2, fixer for `code-ui` (2026-10-04)

Four critic minors, all in `src/ui`. Evidence: `shots/r2-fix-code-ui/`, `scratch/r2-fix-code-ui/real.json` (the real
game, nothing stubbed), `tests/ui/` (39 browser tests, 16 vitest).

### 8.1 What changed

| # | Issue | What `src/ui` does now |
|---|---|---|
| 8.1a | "F BREAK THE BAND" twice, and still up after the band is broken | `Hud.applyRows()`: the hint row is never drawn while the prompt row shows the same key; `ui_prompt_kept` in either row comes down on `weapon/kept { loading }` and stays down through `chambered` and `fired` (and whenever `weapon.seventh` is `chambered` or `spent`); it comes back on `unloaded`. `visibleText().prompt / .hint` are what is drawn. World still owns when the hint is raised; nothing is asked of it. |
| 8.1b | The seventh is 8 x 19 px at 720p | Drawn at **1.5 times ART_BIBLE 10.3's 9 x 22**: 13.5 x 33 at 1080p, 11.7 x 28.5 px at 720p (`SEVENTH_SCALE` in `mark.ts`). The ring, the 20 px gap and the hairline are unchanged; the mark's box is 12 units taller and drops by as much, so the ring is where it was. `pulse` swings the outline, rim and band between a dimmed bone and white (luminance 138 to 255) as well as 1 to 1.6 px. `spent` keeps its ink outline whole under the 50 % bone one. **Art bible owner:** 10.3 says 9 x 22; one sentence there would close the difference. |
| 8.1c | Rebinding can leave an action with no key | `rebind`: an action's only key going into an empty slot of another action is a swap (the donor takes the taker's other key), so nothing is ever unbound; the slots that changed elsewhere are drawn dashed (`.slot.moved`) until the next capture. `repairBindings()` gives an action with no key its defaults back (taking them from whoever holds them); the UI runs it in `init()` and on every `options/changed { bindings }`. |
| 8.1d | Pause: the mark's label across the dimmed subtitle | The text layer (subtitle, caption, checkpoint, card) is not drawn under `pause` and `click_to_resume` (`.k7.veil`). The line is not ended: it is up again on resume, and `visibleText().subtitle` still reports it while paused (as it does under the options page). |

### 8.2 Requests

| # | For | Request |
|---|---|---|
| 8.2a | core (`src/core/options.ts` `sanitizeBindings`) | An action whose stored list is empty (or has no bindable code) should fall back to its default codes, minus any held elsewhere. Today `fire: []` and `pause: []` load as they are. The UI heals the bindings itself (8.1c), which covers every page that runs the real UI; a page with `nullUi` in the slot is not covered. |
| 8.2b | art bible owner | 10.3 "9 x 22 px" for the seventh: the HUD draws 13.5 x 33 (8.1b). |

## Closer, polish round 2 (2026-10-04): what was decided on 8.2

| Row | Decision |
|---|---|
| 8.2a `sanitizeBindings` | **APPLIED** in `src/core/options.ts`: an action left with no bindable code takes its default codes back from whoever holds them (the same rule as the UI's `repairBindings`, which stays and is now a no-op after core) |
| 8.2b ART_BIBLE 10.3 | **APPLIED**: 13.5 x 33 px at 1080p |
| (from code-enemies R2.2) a glyph for `parried` | **APPLIED**: the `deflected` glyph |

## Fixer, polish round 3 (2026-10-04)

| Row | Decision |
|---|---|
| 7.2 story keys | **`ui_end_of` APPLIED** ("of": the end card reads `86 of 87`, `1 of 2`; `tests/ui/screens.test.mjs` follows). `ui_key_*` and `ui_opt_size_*` **RULED, not added**: `tests/ui/hud.test.mjs` and `screens.test.mjs` pin the derived names ("Mouse 1 to fire", `S M L XL`), which read well as they are; code-ui may add the keys with its tests if it wants other words. `system.no_webgl` / `system.boot_failed` exist since round 2; `system.boot_connection` is new (core's boot-failure card no longer shows the exception text) |
| story text changed under the UI | `ui_pause_restart_cp` "Back to the last count (checkpoint)"; `ui_hint_interact` "{interact} to read or take" (`tests/ui/hud.test.mjs` line 344 follows) |

## 9. Polish round 3 (2026-10-04, fixer code-ui): small HUD legibility and spacing

Lead rulings R1 / R7 over document numbers. Evidence: `scratch/r3-fix-code-ui/NOTES.md`, `after.log`, `shots/r3-fix-code-ui/`.

### 9.1 What changed in `src/ui` (numbers for the closer to mirror)

| # | Was (document) | Is now |
|---|---|---|
| 9.1a | Health bars 46 x 5 px at 1080p (code-ui work order 6 / ART_BIBLE 10 "three thin bars"); 4 px at 720p | **46 x 7 at 1080p, never under 6 px** (`.k7 .seg` `max(6px, 7u)`), inside the 1 px ink outline they already had. 6.0 px measured at 1280 x 720 and 1024 x 768 in the real game. |
| 9.1b | 7.1a: the mark floor is 0.864 (76 x 111 px, 8.6 px chamber dots, seventh 11.7 x 28.5, numeral 10.4 px at 720p) | **`MARK_MIN_SCALE` 1.08** (`mark.ts`, `--mk` in `ui.css`): 95 x 138 px, 10.8 px dots, seventh 14.6 x 35.6, numeral 13 px at 1280 x 720 (1.25 times). The floor now also holds at 1080p (95 px wide, was 88); from 1167p up the mark follows the viewport as before. The ring kick and shiver are 2 and 1.6 of the mark units (2.16 / 1.73 px at the floor). |
| 9.1c | 7.1a "the pause screen mark stays three times the HUD mark" | The enlarged mark **keeps its size** (3 viewport units a mark unit, floored at 3 x 0.864: 228 x 332 px at 720p). Three times the new floor (285 x 415) does not fit the column with its label at 720p. It is 2.4 times the HUD mark at 720p, 3 times from 1167p up. |
| 9.1d | Pause scrim 70 % ink (GDD 12 / work order "scrim") | **78 %** under the pause screen only (`.k7 .pause.scrim`); options and click-to-resume stay 70 %. |
| 9.1e | Options rows | The label line of every row is one full row height, so a row with a description (Difficulty) is the same distance under the row above as any other (was 19.4 px against 24.7 at 720p); the selection tick stands beside the label, not between label and description. |

### 9.2 Not taken

| # | From | Why |
|---|---|---|
| 9.2a | cross-cutting fixer: "optionally call `ctx.input.requestPointerLock()` in `closeSheet()`" | Not done. `requestPointerLock()` sets `input.lockAsked`, which arms the new 45-tick watchdog: called from a readable closing in a run that never held the lock (every step-driven e2e run) it would pause the deterministic playthrough. Guarded by "the lock was held before", it covers only a lock lost while reading, and after Escape Chromium refuses a new lock for about a second anyway, so the plate would still show. Core now handles the case (focus_lost plate). |

## Closer, polish round 3 (2026-10-05): decisions on the rows above

| Row | Decision |
|---|---|
| 9.1a to 9.1e | Mirrored: ART_BIBLE round-3 amendments (10.3), GDD 23.6 (12.2) |
| lookdev-exterior row 5: the end card over the scene | **Applied by the closer**: `.k7 .end` is ink at 80 % over the still-drawn dusk (it was opaque): the fire, the town's lamps and the two threads stay behind the ledger (`shots/r3-closer/rimA_low_zz_end_card_lit.png`) |
| the ring over the gun | Ruled (see code-player.md): accepted |
