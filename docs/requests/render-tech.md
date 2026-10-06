# Requests and notices from render-tech (polish round 4)

Owner: code team "render-tech" (`src/render/`, `tests/render/`). Log: `scratch/r4-team-render-tech/NOTES.md`.
Evidence: `shots/r4-team-render-tech/`.

## 1. For the closer: mirror into the documents

The critic's minor "the muzzle pulse turns nearby dynamic things into flat orange cut-outs" changed how the radial
pulse is applied. No number of a document was contradicted, but two sentences are now incomplete:

| Document | Now says | Should say |
|---|---|---|
| `docs/GDD.md` 6.x, the shot timeline row "0-50" (line 436) | "Muzzle light pulse in the world shader: radius 7 m, 70 ms, flame colour" | add: "shaded by N.L per pixel (floor 0.12), paler toward its centre, and what it adds to any surface is held under 0.6 of display white whatever the mood's exposure" |
| `docs/GDD.md` section 21 list, item 5 "World shader terms: muzzle pulse (radial, position and radius uniforms)" (line 1789) | position and radius uniforms | add: "and a cap uniform (0.6 / exposure); the pulse is skipped entirely on frames where both slots are at rest" |
| `docs/ARCHITECTURE.md` 8.1, if it lists the shared block's fields | (13.w unused) | `uK[13].w` = `uPulseCap` |

Nothing changed in the pulse's radius (7 m; kept round 14 m), life (70 ms; 160 ms), colour or strength as issued by
`vfx.ts`, in the ring at the seventh, in Reduce Flashes (the pulse is still halved), or in the `VfxApi` contract.

## 2. For the look teams (who work in `src/render/` after this pass)

- The three numbers are yours: `PULSE_CAP = 0.6`, `PULSE_WRAP = 0.12`, `PULSE_CORE = 0.7` in `src/render/shared.ts`
  (one line, above `PULSE_GLSL`). `tests/render/pulse.test.mjs` holds the behaviour (a face turned away takes under
  half of a face turned to the pulse; nothing added over the cap; the centre is paler than the edge; the frame after the
  pulse is the frame before it) and reads `PULSE_CAP` from the module, so retuning does not break it unless the cap
  leaves 0.3 to 0.9.
- It applies to **every** material that takes the pulse, static world surfaces included (the "orange slabs" of
  `D_vm_bore.png` are the static jambs of the antechamber door, `chunk_bo_ante` / `m_pellam`, brought into the frame
  by the shot's FOV punch; the Biders' cloth is a skinned world material that had no normal at all). A world material
  has no normal attribute: the pulse uses the face's own normal from screen derivatives, so a smooth-shaded lightmapped
  curve is faceted under the pulse for the frames of a shot.
- A side effect to judge: the flash sprite reads smaller than in round 3's frames, because the over-lit things behind it
  no longer merge with it into one white shape (`shots/r4-team-render-tech/crop_bore_before_after.png`). The sprite
  itself (`vfx.ts` `flashSize`, the atlas cells) was not touched.
- The Windlass's pale plates go to a smooth warm off-white at 5 m (`after_low_bossface.png`): the cap is 0.6 added to a
  plate that is already 0.5. If that is too much, lower `PULSE_CAP` or the lead pulse's `3.0` in `vfx.ts muzzleFlash`.

## 3. Requests to other owners

None.

## Closer, polish round 4 (2026-10-05): decisions

| Row | What | Decision |
|---|---|---|
| 1 | pulse sentences, `uK[13].w` | mirrored: GDD 6.8 row and section 19 item 5 in place; ARCHITECTURE 8.1 |

# Polish round 5 (2026-10-06): render-tech

Log: `scratch/r5-team-render-tech/NOTES.md`. Evidence: `shots/r5-team-render-tech/sheet_flash_wall.png` (top row before,
bottom row after; frames 0, 1, 2 of one shot), `scratch/r5-team-render-tech/t_render.log`, `t_core.log`, `t_player.log`.

## 1. For the closer: mirror into the documents

| Document | Now says | Should say |
|---|---|---|
| `docs/GDD.md` 6.8, shot timeline row "0-50" (the flash) | the flash sprite is at the muzzle | add: "render places the sprite each drawn frame on the line from the eye through the view-model's `muzzle` node as drawn, at the distance the player asked for (`FLASH_PUSH`): it rides the kick. The powder smoke and the tracer begin where the muzzle of the shot's tick is seen through the world camera (the view-model pass has its own 40 degree projection)" |
| `docs/ARCHITECTURE.md` (VfxApi `muzzleFlash`, `weapon/fired`) | `muzzleFlash(kind, x, y, z)`: flash sprite at the view-model muzzle | unchanged contract. Note: x, y, z now give the sprite's DISTANCE from the eye and the centre of the world light pulse; the sprite's direction comes from the drawn muzzle node when a view-model is attached (no node: x, y, z as given). `weapon/fired` mx, my, mz is unchanged (the true muzzle) |

No number of a document was contradicted. No contract, design file or budget changed.

## 2. For the look teams (gun first)

- **The round-4 row "flash below-left of the barrel" is closed by this pass** (`src/render/vfx/vfx.ts` `rideMuzzle`,
  called from `system.ts` `render()` after `poseViewModel()`). Measured at 960 x 540 in the real game: sprite to drawn
  muzzle 0.3 to 0.6 px on all three frames of a shot (it was 81 / 169 / 203 px). Size, colour, life, shape and the
  pulse were not touched. `__dbg.ext.render.muzzle()` gives the drawn muzzle, the sprite and the smoke start as frame fractions.
- To judge: the barrel rises 55, 119 and 143 px (of 540) on the three frames the flash lives, and the flash now goes
  up with it. If the flash should not travel that far, shorten the flash's life (`vfx.ts` `flashLife`) or soften the
  first ticks of the kick (player `rig.fire` / the `fire` clip): do not un-parent it.
- **Left as is, yours if you want it:** the smoke puff and the tracer begin where the muzzle was on the shot's tick
  (the pose before the kick), which is correct for the frame of the shot but about 70 px below the risen barrel on
  the first drawn frame (see the bottom-left tile of the sheet: the tracer's line points at a place under the barrel
  tip). Re-anchoring a two-tick streak to the drawn muzzle needs per-frame state in the line pool; not done in the last round.
- `tests/player/flash.test.mjs` (player team not active this round): the last assertion was "right of and BELOW the
  crosshair"; it now reads "right of the crosshair, at the muzzle as drawn" (core 0.71 % of the frame, 0.62 % of the
  body box at the crosshair: both limits of round 4 still hold).

## 3. For anyone driving the bot with drawn frames on High

A long `bot.play({ frameEvery })` leg never returns to the event loop, and the browser keeps what each drawn frame
left behind: 4.4 GiB on title -> gallery on High. `gl.finish()` alone does not help (3.8 GiB, killed). What does:
wrap `__dbg.ext.core.stepAsync` so that every 8 drawn frames it awaits `setTimeout(0)` (the `pace` function at the top
of `tests/render/prewarm.test.mjs`): peak 1.4 GiB, same end tick. Request to the owner of `tests/e2e/lib/page-bot.js`:
do this inside the bot's own `step()`.

## 4. Requests to other owners

None blocking.

## Closer, polish round 5 (2026-10-06): decisions

| Row | Decision |
|---|---|
| 1 (two sentences) | **Mirrored**: GDD 6.8 row 0-50 in place; ARCHITECTURE 8.2 "Polish round 5" (4) (outside section 5, so the contract text is untouched) |
| 2 (the changed assertion of `tests/player/flash.test.mjs`) | **Accepted**: "below the crosshair" was a consequence of the old bug; both round-4 limits still hold |
| 2 (smoke and tracer do not ride the kick) | **Left**: known gap |
| 3 (pace inside `tests/e2e/lib/page-bot.js` `step()`) | **Not applied** to the shared bot in the last round (it would touch every e2e test); the closer's own High legs are short and use the pace wrapper. ARCHITECTURE 8.2 (5) records the rule |
