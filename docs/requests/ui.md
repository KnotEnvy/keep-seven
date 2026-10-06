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
