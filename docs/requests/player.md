# Requests and changes from code team "player", polish round 4 (2026-10-05)

Owner of `src/player/`, `sandbox/player.*`, `tests/player/`. One critic issue this round (combat critic, minor): "Dry fire
has no beat of its own, and the muzzle flash hides the target for three frames". Evidence: `scratch/r4-team-player/`
(`before.log`, `after.log`, `NOTES.md`), frames in `shots/r4-team-player/`.

## 1. Numbers that changed (closer: mirror into the documents)

| Document | Was | Is now |
|---|---|---|
| `docs/GDD.md` 6.3, row "Empty cylinder" | a trigger pull gives one dry click and starts the reload on that click | a trigger pull gives one dry click with **a beat of its own: the hammer stays down for 7 ticks (0.117 s, `DRY_BEAT`, clip `dry_fire`, weapon phase still `ready`)**, then the reload opens by itself. `R` inside the beat opens it at once; `Q` and the kept key act at once and cancel it; a second pull inside the beat is not a second click and is not lost (it interrupts the opening reload: one round is seated, then the shot) |
| `docs/GDD.md` 6.3, row "Full reload from empty" | 2.45 s | 2.45 s from `R`; **2.57 s from a dry click** (0.117 + 2.45) |
| `docs/GDD.md` 6.3 "Interrupt", worst case from an EMPTY cylinder | 21 + 18 + 12 ticks after the click | 7 ticks more when the reload was started by a dry click |
| `docs/GDD.md` 6.8, tick table row "0-50 ms: muzzle flash sprite" | sprite at the view-model muzzle | sprite asked for **1.6 x farther from the eye than the muzzle, on the eye-to-muzzle line** (`FLASH_PUSH`): the same place on the screen, 0.625 the size (37 % smaller across, 61 % less area). The light pulse is centred there too (0.28 m farther: no visible change at a 7 m radius). `weapon/fired` (`mx, my, mz`) and the tracer keep the true muzzle |
| `docs/GDD.md` 6.9 | `dry_fire` 0.15 s | unchanged as a clip. When there are rounds to seat the clip is cut at 0.117 s by `reload_open`; with nothing to reload it plays out as before |

Events: `weapon/dry_fire` and `weapon/reload { stage: 'open' }` are no longer on the same tick after a pull on an empty
cylinder with a reserve: the second follows 7 ticks later. Nothing in `src/` relied on the pair (checked: `src/audio/engine.ts`,
`src/world/kept.ts`, `src/world/interact.ts`, `src/ui`). The e2e bot reloads with `R` and never dry-fires.

## 2. Requests to other owners

| # | To | Request | Why |
|---|---|---|---|
| 1 | **code-audio** (`src/audio/gun.ts`, `dry_fire`) | Raise the dry click to a peak of about **-8 dB** (critic's measure: peak -13 dB, rms -37.9 dB; `scratch/r4-combat/audio.log`). The click and tone gains are 0.34 and 0.25: x 1.8 (0.61 / 0.45) gives +5 dB. Keep the `a = 1` (kept round refused) take softer as it is | combat critic: "a quiet click, so the empty-gun moment is never felt". The level is the audio system's; the player only emits `weapon/dry_fire`. With the beat the click now stands alone: `reload_open` plays 7 ticks later instead of on top of it |
| 2 | **look team, gun** (`art-weapons` / look-dev; `VIEW_PLACE` in `src/player/defs.ts` is yours to re-tune) | The critic's third sentence: "at melee range the gun also hides the right-most Bider" (`shots/r4-combat/sheet_four.png` frames 299, 359, 479). Not changed by the player team: the gun's size and place are fixed by R6 (the revolver alone 8.3 % or more, gun and hand 8 to 14 %; `tests/player/place.test.mjs`) and a gun of that size in the lower right covers whatever stands there at arm's length. If it is judged too much, the number is `VIEW_PLACE.x` / `.y` (2 cm lower costs about 1 % of the frame) | visual judgement; R6 |
| 3 | **look team, gun** | The flash is drawn where the muzzle was on the click's tick; the `fire` clip lifts the barrel 20 degrees on the same frame, so the star sits below and left of the barrel's end (`shots/r4-team-player/cmp_flash_8m.png`). With the smaller flash this reads more clearly. If it should sit on the muzzle, the rise in the first two frames of `fire` is the number (or render could parent the sprite to the `muzzle` node) | seen while fixing; purely visual |

## 3. Tests added or changed

- `tests/player/weapon.spec.ts`: the empty-cylinder spec now pins the beat (dry click alone on tick 0, `ready` + `dry_fire` for ticks 1 to 6, `weapon/reload` on tick 7); new: a second pull inside the beat; `R` / `Q` inside the beat; input off and a restore inside the beat. Hold-to-fire timings moved by 7 ticks.
- `tests/player/fire.test.mjs` (input path, sandbox), `tests/player/state.test.mjs` (reload across a pause: 154 ticks), `tests/player/shots.test.mjs` (frame series offset).
- new `tests/player/flash.test.mjs` (real game, real view-model pass, 1280 x 720): the flash is on the eye-to-muzzle line at 1.6 x, projects at the muzzle's screen place, its white core is under 1.2 % of the frame (was 2.1 %) and off the crosshair.

## Closer, polish round 4 (2026-10-05): decisions

| Row | What | Decision |
|---|---|---|
| 2.1 | dry click to about -8 dB (audio) | **Applied by the closer** in `src/audio/gun.ts`: click 0.34 -> 0.61, tone 0.25 -> 0.45 (+5 dB); the kept round's refusal keeps its old level (k 0.45 -> 0.25). `tests/audio/` green |
| 2.2 | the gun hides the right-most Bider at melee range | **Ruled: stands.** R6 sets the size; the gun team's new `VIEW_PLACE` moved the muzzle to 101 px right / 69 px below the crosshair (it was 52 / 50), which uncovers more of the centre |
| 2.3 | the flash sits below-left of the lifted barrel | **Open for round 5** (gun look): purely visual; seen in `shots/round-4/hero_03.png` |
| 1 | numbers | mirrored: GDD 6.3, 6.8, 6.9 in place and 23.8 |
