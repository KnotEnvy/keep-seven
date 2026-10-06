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
