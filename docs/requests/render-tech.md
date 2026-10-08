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

## Fixer, release pass p0 (2026-10-07): decisions

| Row | Decision |
|---|---|
| 3 (pace inside the shared bot's `step()`) | **Done, one level lower**: the debug hook paces scripted drawing itself (`src/core/debugHook.ts` `pace`: every 8 drawn frames the next `stepAsync` / `untilAsync` waits on a one-pixel read of the drawing buffer and gives the event loop one turn; `__dbg.ext.core.paced(every?)` reports and sets it). Every script that draws is paced, the bot included; no tick moves (`tests/e2e/release_p0.test.mjs`: the same hash drawn and not drawn). The wrapper in `tests/render/prewarm.test.mjs` is now redundant and harmless: yours to drop |
| new: `m_hands` (ruling R14) | **Asked of render-tech / the gun team**: `src/render/materials.ts` `material()` sends an unknown name to the world shader. `m_hands` (the view-model's hands) must go to `dynamic()` like `m_gun`, with `tx_hands` as its albedo and `tx_hands_detail` / `tx_gun_detail` as one-channel height maps. Until then no GLB uses the name, so nothing is drawn wrong |

# Release pass p0 (2026-10-07): render-tech

Log: `scratch/p0-team-render-tech/NOTES.md`. Evidence: `shots/p0-team-render-tech/sheet_tracer.png` (top row before, bottom
row after; frames 0, 1, 2 of one shot), and in `scratch/p0-team-render-tech/`: `tracer.log`, `tierswitch_after.log`,
`tierswitch_after_neighbours.log`, `realloop.log`, `rt_before.log`, `allocprof_before.log`, `allocprof_a1.log`,
`alloc_after.log`, `t_render.log`. Tests: `tests/render/release_p0.test.mjs` (5), `tests/render/quiet.spec.ts` (3),
`tests/render/runtime.test.mjs` (the tier-switch assertions rewritten).

## 1. What changed (behaviour, not look)

| Issue | Change | Measured |
|---|---|---|
| The tracer starts below the muzzle on the first frame of a shot | `vfx.ts` `lineFromMuzzle` / `rideLines`, called from `system.ts` `render()` between the quad fill and the draw: while a tracer lives, its start in the quad batch is the view-model's `muzzle` node AS DRAWN, moved across the view so the world camera puts it on the pixel the 40 degree view-model pass does | drawn muzzle to the streak's line at 960 x 540: 76.5 / 161.6 / 193.8 px on frames 0 / 1 / 2 before, 0.4 / 0.2 / 0.2 px after; on frame 0 the streak begins 0.4 px from the muzzle |
| Every tier switch relinks about 39 programs (both entries) | `system.ts`: nothing is released on a switch (`releasePrograms` is gone); a tier is compiled once per active set (`warmGen` / `warmedAt`). `post.ts`: one chain per kind of tier, kept; leaving a tier frees its render targets and keeps its passes. `warmNeighbours`: the tier the quality manager can step to by itself (the one below; Low from `min`) is compiled ahead with nothing drawn: at the boot where the driver compiles in parallel, else behind the first pause or death | `cp_boss_p1`: first visit of `min` 38 links, of High 40; **every return 0 links, 0.1 to 0.4 ms of JS** (it was 38 to 46 links and 55 to 67 ms each time); programs 38 -> 76 -> 116 and steady; GL textures back to Low's 37 every time, `min` holds no target at all. Compiled ahead: Low -> `min` 38 links issued in 8.9 ms of JS, the step itself and 240 ticks of fight after it 0 links (High -> Low: 1 link ahead, 0 after; `min` -> Low: 38 ahead, 0 after). Real loop, `graphics: auto`: owed at boot, compiled at the first pause, 0 links at the manager's step down and back |
| High's render-target accounting under-reports | `post.ts` `allocatedBytes` counts the targets three has really allocated (the chain's own list, + the shadow map while it exists); `renderTargetBytes` (the perf counter) reports that or the manifest's ledger for the tier, whichever is larger. `__dbg.ext.render.targets()` gives both | counted = GL hook + canvas **to the byte** on all three tiers. High now reports what is allocated: 42.56 MiB at 1280 x 720 (it claimed 39.05), 85.8 at 1920 x 1080 (it claimed 77.9). Low allocates 17.58 MiB at 1280 x 720 and still reports the ledger's 24.61 (see 2: `tests/core/seam.test.mjs` holds the counter to the manifest within 0.15 MiB) |
| The tier benchmark is uncalibrated | `src/render/benchmark.ts` `benchmarkVerdict`: a result between 4 and 8 ms a pass is reported to the manager as 4 ms (not over its `min` threshold) | `tierFromBenchmark('low', verdict(5.5))` is Low (it was `min`); over 8 ms still `min`; High unchanged. No real GPU was measured: see 3 |
| About 5 kB allocated per tick plus drawn frame | `src/render/quiet.ts` `quietFrustum`: `Frustum.setFromProjectionMatrix` without the 24 boxed numbers a call | the file fight 5 295 -> 4 650 B by the heap profile; by the harness: yard 5 236 -> 4 577, the file 4 890 -> 4 399, Windlass phase 2 5 535 -> 5 118, the Tamper 5 019 -> 5 355 (that leg's enemy count differs from run to run). **Not zero: see 3** |

Also: `materials.ts` sends `m_hands` to the dynamic shader with `tx_hands` as its albedo (the fixer's row; no asset uses the
name yet, so nothing is drawn differently).

## 2. For the closer: mirror into the documents

| Document | Now says | Should say |
|---|---|---|
| `docs/ARCHITECTURE.md` 8.4 and `design/assets.json` `tiers.low.targets` (through `tools/gen_assets.mjs`) | Low: "two RGBA16F scene buffers", 16 bytes a pixel; 28 in all; `renderTargetBytes` 29 374 464 | Low allocates ONE scene buffer (the merged pass draws to the canvas): 8 (canvas) + 8 + 4 (depth) = **20 bytes a pixel, 20 981 760 B** at its largest buffer. The budget ledger over-states Low by 8.0 MiB at 1366 x 768: the gun team's "0.7 MiB left" is really 8.7 MiB |
| the same, `tiers.high.targets` | 35.33 bytes a pixel; 81 648 896 B | + "second scene buffer's depth, 4": **39.33 bytes a pixel, 89 943 296 B** at 1920 x 1080 (+ 7.9 MiB; the stage totals stay under 128: 35.3 + 85.8 = 121.1 MiB at the Tally House) |
| (both rows above) | | once `tools/gen_assets.mjs` carries the two corrected rows, the perf counter reports the allocation on Low too with no code change (it reports the larger of the two), and `tests/core/seam.test.mjs` then expects 55.3 MiB |
| `docs/ARCHITECTURE.md` 8.2 / 8.5 (tier switches) | a run-time switch releases the left tier's programs and warms the new tier | a tier is compiled once per active set and kept; the post chains are kept without their targets; the manager's own next tier is compiled ahead (`warmNeighbours`); a switch back links nothing |
| `docs/GDD.md` 6.8 shot timeline, and the round-5 "known gap" on the tracer | the tracer begins where the muzzle of the shot's tick is seen | the tracer's start rides the drawn muzzle for the frames it lives (the smoke puff still begins at the shot's own point) |
| `docs/ARCHITECTURE.md` 8.5 step 3 and `docs/GDD.md` (quality detection) | over 4 ms a pass -> `min` | over **8 ms** a pass -> `min` until a real integrated GPU has been measured (see request 3.1) |

## 3. Requests and known gaps

1. **`src/core/quality.ts` (frozen for this pass): move the `min` threshold of `tierFromBenchmark` from 4 to 8 ms**, with
   `tests/core/quality.spec.ts`. `benchmarkVerdict` in `src/render/benchmark.ts` is the local stand-in and is then one line
   to delete. Nobody has run the benchmark on real hardware: the F3 overlay's reader can now see the measured median in
   `__dbg.state().systems.render.benchmarkMs` (and `__dbg.ext.render.benchmark()` on a dev page). Asked of the player-side
   tester: one 2017-era integrated GPU, the number, and whether Low holds 60 there.
2. **Allocation is 4.4 to 5.4 kB a tick plus frame, not zero.** What is left is boxed numbers inside three (the
   view-model's `AnimationMixer` 534 B a tick, uniform uploads 680, `projectObject` 330, the cache-key string of every
   bone texture upload 450, `setClear` 230) and in `src/core` (loop and perf counters 340). Each needs a patched three
   (the stack is pinned) or core edits. Heap stays flat (the reviewer's soak) and no tick is over 4 ms.
3. **An automatic tier change is still applied on the frame the manager decides it** (the reviewer also asked for "at the
   next checkpoint, death or pause"): with nothing left to link it costs 0.1 to 0.4 ms, so it was not moved (it would be a
   `src/core/quality.ts` change).
4. **The FIRST visit of High from the options menu still compiles High's programs** (40 links behind the pause menu):
   High is never reached automatically from a tier that has not been High before, so it is not compiled ahead.
5. On SwiftShader a program's first DRAW costs about 5 ms whatever was linked before (the first `min` frame after a
   compile-ahead: 219 ms there). Real drivers do that work at link time; it could not be measured on this machine.
6. Gun team: a new `m_hands` mesh is a new material x shape pair: run `node tests/render/gen_prewarm.mjs` once the GLB
   uses it, or `tests/render/prewarm.test.mjs` will report its program linking in play.
7. The pace wrapper in `tests/render/prewarm.test.mjs` is gone (the fixer's `debugHook` pacing does the work; the test reads `__dbg.ext.core.paced()`).
8. **World team (the fixer's row "the revolver's tone on the title is lighter after Quit to title"): it is the MOOD, not
   the view-model rig.** `scratch/p0-team-render-tech/title_mood_before.log`: on a fresh boot the title is mood `L0`
   (exposure 1.30, the gun's key 0.53); after "Quit to title" from `cp_rim` the title is half-way through a cross-fade to
   `L1` (exposure 1.15, key 1.06) and ends there. `flow.titleShot` sets the start zone's `moodIntro` and then teleports
   her; the teleport's `zone/entered` makes the director answer `moodOf('the_lip')` from the flags of the run she just
   left (the glare flag is still set), so it asks render for `L1`. Render does what it is told. Asked of the world team:
   `director.moodOf` (or its `zone/entered` handler) gives the intro mood while the game is on the title, or the run's
   glare flag is dropped when the title shot is staged. "Begin" / "Go on" put it right again (measured: `L0` 30 ticks in).
9. **Memory at each tier's largest buffer** (`tests/render/budget.test.mjs`). Reported: Low 59.3 / 63.3 (seam) / 52.0 /
   40.0 MiB of 64 (the ledger's figures; **allocated: 51.3 / 55.3 / 44.0 / 32.0**); High 117.0 / **121.0** (seam) / 109.8 /
   97.8 MiB of 128 (allocated; the manifest's stage table says 109.1 / 113.1 / 101.9 / 89.9); `min` 56.9 / 60.9 / 49.6 / 37.6.
   High's headroom at 1920 x 1080 is 7 MiB, not the 15 the ledger shows; Low's is 8.7 MiB, not 0.7.
10. **For the fixer (`src/core` / `vite.config.mts`, not render): a production build with stand-in slots does not boot.**
   `KEEP7_REAL=all node --test tests/core/` on this tree: 71 pass, 5 fail. Four are counts the p0 data edits moved
   (`boot.test.mjs` 21 textures against 18, twice; `budget.test.mjs` "draw calls 76"; and, until the counter was put
   back on the ledger, the seam's 63.3 MiB: that one passes again). The fifth is `stubs.test.mjs` "startServer pieces":
   `startServer({ mode: 'build', pieces: ['player'] })` builds (one script + the three data files, all served 200) but
   the page never sets `window.__dbg`, with no console error and no failed request (`scratch/p0-team-render-tech/pieces.mjs`,
   `pieces2.mjs`): nothing of `src/render` is in that bundle. The build with all six pieces boots. `npm run test:unit`:
   450 pass, 4 fail (`tests/audio/logic.spec.ts` caption table, `tests/core/data.spec.ts` texture count,
   `tests/enemies/logic.spec.ts` difficulty table, `tests/ui/text.spec.ts` stylesheet scan): none in `tests/render`.

## Closer, release pass p0 (2026-10-07): decisions on this file's p0 rows

Evidence: `docs/INTEGRATION_REPORT.md` Part K, `scratch/p0-closer/NOTES.md`, `scratch/p0-closer/gate/`.

| Row | Decision |
|---|---|
| Table 2, the render-target ledger | **Applied**: `tools/gen_assets.mjs` Low 20 bytes a pixel (one scene buffer), High 39.33 (a depth for each scene buffer); `design/assets.json` regenerated, every asset rebuilt; ARCHITECTURE 8.4 and 3.6, the work orders' budget row. `tests/render/release_p0.test.mjs` now asserts allocated = ledger within 1 % (it asserted the old mismatch) |
| Table 2, tier switches, the tracer, the benchmark | **Applied**: ARCHITECTURE 8.4's p0 note and 8.5 step 3, GDD 23.12 |
| 3.1 move the `min` threshold to 8 ms in `src/core/quality.ts` | **Ruled, not applied**: `benchmarkVerdict` already has that effect and no real GPU has been measured; the documents say "in effect 8 ms" |
| 3.2 to 3.5 allocation, the automatic switch, High's first visit, first draws on SwiftShader | Known gaps; measured again in Part K (4.7 to 5.8 kB a tick + frame) |
| 3.8 the title's mood | **Applied** in `src/world/director.ts` (see `world.md`) |
| 3.10 the stub build | **Fixed** (see `ui.md`) |

# Pass i1 (2026-10-07): render-tech

Issue: "High is nearly indistinguishable from Low in most zones (R9)". Log: `scratch/i1-team-render-tech/NOTES.md`.
Evidence (opened): `shots/i1-team-render-tech/a7_pair_in.png`, `a7_pair_in2.png`, `a7_pair_out.png` (Low | High, static,
1280 x 720), `sh_sheet1.png`, `sh_sheet2.png` (High, the shadow map on | off, with enemies), `test_sheet.png`, `test_air.png`,
`rel_crop.png` (relief on | off), `out_crop_sparkle.png` (sparkle on | off), `shimmer_crop.png`, `ante_crop.png`.
Tests: `tests/render/i1_high.test.mjs` (5). Scripts: `scratch/i1-team-render-tech/lh.mjs` + `diff.mjs` (the reviewer's measure).

## 1. What High gained (mechanisms; every strength is a look-team number, section 3)

None of these adds a pass, a render target, a texture or a program that links in play. Low and `min` draw none of them:
Low's frames at the thirteen places below are **byte-identical** to the frames before this pass.

| # | Mechanism | Where | Files |
|---|---|---|---|
| 1 | **Air light**: lamps glow in the air between themselves and the eye. One more term of High's merged pass, from the depth it already keeps: for up to 12 lamps the light scattered along each pixel's ray, in closed form, cut by whatever stands in front of the lamp. The lamps are the lit emissive lamps of the zone she stands in (every emissive mesh is now known when its zone is built, not at its first draw) and the layout's fires and glows (the bore's well, the embers, the hatch) | every mood with an entry in `AIR` (all interiors, the rim) | `post.ts` `AirLightEffect`, `AirLights`; `materials.ts` `registerEmitters`, `emitAir`; `system.ts` `gatherAir` |
| 2 | **The one shadow map works in every zone.** It was the sun's, outdoors, onto sand only. A mood now names where the map looks (`SHADOWS`): the sun outdoors; in a room a light overhead, 26 m square (2.5 cm a texel). Receivers are the chunk meshes of every zone, walls included (a twin drawn with the shadow material; a face turned from the light takes none). In a room only creatures, projectiles and loose instanced things cast; doors, gates, the cradle and the lifts do not (their shade is in the bake). The blob shadow is not drawn where the map covers | every mood with an entry in `SHADOWS` (all but the blue hour) | `system.ts` `updateSun`, `shadowOverlay`, `setCasters`, `shadowCovers`; `materials.ts` `keepCast` |
| 3 | **Relief**: a surface's detail texture, read as a height, turns its baked sunlight toward and away from the sun (the reviewer's "High-only detail-normal on sand and concrete"). Two more taps of the texture the surface already reads | under a sun (`RELIEF`: L0, L1), on sunlit lightmapped surfaces | `materials.ts` `WORLD_LIGHT` relief block; `shared.ts` `uRelief` (`uK[10].w`) |
| 4 | **Sand sparkle** (ART_BIBLE 3.2, "thresholded, High only": `QualityFeatures.sandSparkle` had no reader): grains of sunlit sand flash as she walks, more in the sun's glitter path | sunlit sand out to 16 m | `materials.ts` `WORLD_LIGHT` SAND block; `shared.ts` `uSparkle` (`uK[14].w`) |
| 5 | **Heat shimmer** (ART_BIBLE 3.2 and 10, "post UV offset, High only": `QualityFeatures.heatShimmer` had no reader): the far skyline boils inside 7 degrees of the horizon; near things and the figure on the mesa (12 degrees up) are untouched; off with Reduce Motion | outdoors by day | `post.ts` `HeatShimmerEffect` |

Also fixed on the way (a regression this pass would otherwise have caused, and a latent one outdoors): the first frame after
the sun starts casting linked every caster's depth program a second time (three keys it by the light counts of the last
main draw); the shadow pass now waits one drawn frame after a tier switch. `tests/render/release_p0.test.mjs` "a tier is
compiled once" holds again: 0 links on every return to High.

## 2. Measured

The reviewer's measure (mean absolute difference of 255 between Low and High, 320 x 180, static frames with nobody in
them), before this pass and after, at this pass's default strengths:

| Place | before | after | | Place | before | after |
|---|---|---|---|---|---|---|
| lip gate | 2.3 | 2.5 | | gallery bay | 5.7 | 8.4 |
| street | 2.9 | 2.8 | | hall gantry | 3.0 | 3.7 |
| yard | 1.5 | 1.6 | | antechamber | 0.9 | 2.9 |
| Dowser vista | 1.7 | 1.8 | | Tamper vista | 1.5 | 1.9 |
| Tally House, entering | 1.8 | 2.7 | | Windlass vista | 0.6 | 2.0 |
| Tally House, hatch | 1.3 | 4.3 | | boss room | 4.7 | 7.3 |
| | | | | far rim | 2.7 | 4.1 |

**Not reached: the reviewer's "at least 5" outdoors by day, in the Tally House and in three underground views.** In a
static frame with nobody in it, mechanisms 2, 4 and 5 hardly count in this measure (a shadow needs a caster, a glint is a
pixel, the shimmer is a pixel's worth of motion); they show in play: `sh_sheet1.png`, `sh_sheet2.png`. Toggled in one
frame (`tests/render/i1_high.test.mjs`): air light 24 000 px lifted in the hall; a Bider's own shadow in the Tally House
(165 px differ from the blob); relief 0.95 of 255 over the street's sunlit sand (30 000 px lifted, 42 000 lowered);
sparkle about 1 000 glints; shimmer about 560 px in 46 rows, none outside the band.

Cost on High at the thirteen places (1280 x 720): 28 to 86 draw calls (cap 220; it was 28 to 78), 26 600 to 141 200
triangles (cap 400 000; it was 26 600 to 98 100: the twins draw the zone's receiving chunks a second time), memory
unchanged (54.6 to 77.8 MiB: no new target). A fight in the hall and in the boss room on High: 0 programs linked in 240
drawn ticks, 57 and 56 draw calls, 78 500 and 102 900 triangles.
Allocation per tick plus drawn frame in the hall with the Tamper alive (`scratch/i1-team-render-tech/alloc.mjs`): Low
5 081 B, High 1 780 B (median of ten batches; ceiling 6 kB). Gate: `node --test tests/render/` 68 pass; `KEEP7_REAL=all node
--test tests/core/` 76 pass; `npx tsc --noEmit` 0 errors.

## 3. For the look teams (who work in `src/render/` after this pass): the numbers are yours

| Knob | File | Now | Note |
|---|---|---|---|
| `AIR` (per mood) | `moods.ts` | L2 0.8, L3 1.0, L4 1.2, L5 1.2, L5a 1.4, L5c 1.8, L5p 1.2, L6 0.8 | a mood without an entry has none |
| `AIR_K`, `AIR_START`, `AIR_CLOSE_FROM / TO`, `AIR_NEAR / FAR` | `post.ts` | 0.06; 1.5 m; 1.2 / 3.5 m; 20 / 36 m | the last three stop a lamp at arm's length from veiling the whole frame: at 0.085 with no start the Tally House by the hatch went grey-teal (`a1_pair1.png`) |
| `AIR_SIZE`, `AIR_REACH_MIN / MAX` | `materials.ts` | 0.30 m; 1.5 / 3.5 m | a lamp's level and reach follow its size |
| `AIR_LAYOUT` (level, reach of the layout's `practical`, `bore_glow`, `hatch_glow`) | `system.ts` | 0.7 / 2.5, 1.6 / 7, 0.6 / 2.5 | the violet well is `bore_glow` |
| `SHADOWS` (per mood: direction, darkness `k`, square, depth) | `moods.ts` | sun: k 0.55, 26 m half; room: dir (0.16, 1, 0.10), k 0.42, 13 m half, 7 m up, 8 m down | |
| `SHADOW_RECEIVERS` | `moods.ts` | `m_sand`, `m_frontier`, `m_pellam` | |
| `RELIEF` (per mood), `RELIEF_DEPTH`, `RELIEF_MIN / MAX` | `moods.ts`, `materials.ts` | L0 / L1 2.4; 6; 0.6 / 1.5 | interiors have none: an interior mood's `sunDir` is the fog's lean, not a light |
| `SPARKLE_K`; `SPARK_GRAIN`, `SPARK_FAR`, `SPARK_SHARE`, `SPARK_PATH`, `SPARK_LIT_FROM / TO` | `system.ts`; `materials.ts` | 3.0; 2 cm, 16 m, 0.6 %, x5, 0.40 / 0.62 | `SPARK_LIT_*` is also the relief's "sunlit" test |
| `SHIMMER_PX`, `SHIMMER_BAND`, `SHIMMER_NEAR / FAR` | `post.ts` | 1.2 px, 7 degrees, 60 / 160 m | |

Switches for a script: `__dbg.ext.render.air(on?)`, `shadow(on?)`, `relief(on?)`, `sparkle(on?)`, `shimmer(on?)`; each
returns its state (`air()`: the lamps of the frame; `shadow()`: live, direction, twins drawn, blobs).

To judge, not decided here:
- In a room the shadow falls from a light overhead whatever the room's real lamps: right for the hall, the gallery, the
  bore; in the Tally House (lit from its lamp and the shutters) it reads as a soft shadow under each figure.
- The sun's map outdoors is cast by every dynamic prop, as before: the long thin shadows across the street
  (`sh_sheet2.png`, second row) are posts and gates at a 14 degree sun. Walls take them now too.
- A lamp's air glow on the wall it is mounted on is a round bloom about a metre wide (`a7_pair_in.png`, the gallery's
  amber lamp).
- The antechamber's High frame is a little darker by the keypad than Low's: that is the contact shade and was there
  before this pass (`ante_crop.png`).

## 4. Declined, with the reason

- **Sun shadows from the static world (the tank, the derrick, embedded props) on High.** The bake already holds them;
  letting the static chunks cast into the map would darken every baked shadow a second time, and telling the two apart
  needs the lightmap in the receiver's shader and a bake without the sun's shadow: a re-bake of two lightmaps and a look
  decision, not a mechanism. What the map can do without it is done (2).
- **Stopping the shadow pass and the twins when nothing casts.** Loose instanced things cast almost everywhere, so the
  test would rarely be true; High pays one layer of PCF over the receiving chunks.

## 5. For the closer: mirror into the documents

| Document | Now says | Should say |
|---|---|---|
| `docs/ARCHITECTURE.md` 8.2 (High's merged pass) | contact shade, sun shafts, bloom, grade | + heat shimmer (a UV offset before everything) and the air light (after the shafts, before the bloom); still 12 full-screen draws |
| `docs/ARCHITECTURE.md` 8.1 (the shared block) | `uK[10].w` and `uK[14].w` unused | `uK[10].w` = `uRelief`, `uK[14].w` = `uSparkle` |
| `docs/ARCHITECTURE.md` 8.4 / `CLAUDE.md` budget row "Shadow maps: 1 (sun), tight frustum" | the sun's, outdoors | still ONE map, 1024 x 1024; in a room it looks down from overhead (`moods.ts SHADOWS`); the manifest's `sunShadowMap` switch and its 8 MiB are unchanged |
| `docs/GDD.md` section 19 row 9 ("High-tier extras: heat shimmer, sand sparkle, sun shadow map, cloud-shadow scroll") | listed, two of them never built | all four exist; + air light, relief, the shadow map indoors |
| `docs/ART_BIBLE.md` 3.2, 10 (heat shimmer "on the horizon band") | no numbers | 7 degrees either side of the horizon, 1.2 px, beyond 60 m |
| `docs/KNOWN_ISSUES.md` "High equals Low outdoors with the sun behind her" | | still true of a static frame with nobody in it (2.5 / 2.8 / 1.6 of 255); in play High has shadows on walls, relief and sparkle there |

No contract, design file or budget changed. `QualityFeatures.sandSparkle` also switches the relief (no flag of its own:
`src/core` is frozen); if core wants one, `reliefSun: boolean` beside it.

## 6. Requests to other owners

None blocking. Seen while working and not mine: `npx tsc --noEmit` reported errors in `src/ui/system.ts` (three) and
`src/world/director.ts` (one) at moments during this pass (those teams' files in progress).

## Closer, pass i1 (2026-10-07): decisions on this file's i1 rows

| Row | Decision |
|---|---|
| Section 5, documents | **Mirrored**: ARCHITECTURE 8.4 (the "Pass i1" bullet: the merged pass, the shadow map, `uK[10].w` / `uK[14].w`), GDD 19 row 9 and 23.14, ART_BIBLE "Amendments, pass i1"; `docs/KNOWN_ISSUES.md` keeps "High is nearly Low outdoors with the sun behind her" |
| Section 4, sun shadows from the static world on High | **Declined as argued** (the bake holds them; a second darkening needs a re-bake without the sun's shadow) |
| `QualityFeatures.sandSparkle` also switches the relief | **Accepted**; no new flag |
| Edits by the look teams in `src/render/` (post.ts, moods.ts, system.ts, feedback.ts, materials.ts, sky.ts, vfx/*) | **Checked for a lost or half-applied edit**: `npx tsc --noEmit` is clean and `node --test tests/render/` is green on the final tree (INTEGRATION_REPORT Part M) |


# Pass i2 (2026-10-07): render-tech

Two issues from the visual reviewers: the major "High is still hard to tell from Low in the street, yard, rim and lift
hall" (ruling R9) and the minor "crossing the Tally House door shows the room through a flat brown haze for about
0.4 s". Files: `src/render/system.ts`, `moods.ts`, `materials.ts`, `shared.ts`; `tests/render/i2.test.mjs` (5 tests).
Evidence: `shots/i2-team-render-tech/` (`base/` before, `t5/` after, each with `pair_*.jpg` Low beside High;
`door_before/`, `door_after/`; `statics/`, `sweep/`, `lip/`; `test/`), `scratch/i2-team-render-tech/` (`NOTES.md`,
the scripts, `sweep_a.log`, `sweep_b.log`, `gate/`). **Low is untouched: its frames at the eleven stops are byte for
byte the frames taken before this pass** (`cmp` of `base/low_*.png` against `t5/low_*.png`).

## 1. The doorway (minor; Low and High)

A mood cross-fade blended everything over the second the world asks for at a door. For that second the hall was drawn
through the street's pale fog at a density on its way to the room's, under an exposure on its way to x5: the upper-left
of the frame measured 73 / 76 / 82 / 88 / 94 / **95** / 91 / 81 / 67 / 51 / 46 over 60 ticks, 49 settled
(`shots/i2-team-render-tech/door_before/sheet_in_low.jpg`). Going out, the whole frame was white (240 against 173).

Now (`system.ts DOOR_FADE`, `AIR_FIELDS`, `retarget`, `updateAtmosphere`): a fade of at most 2.5 s between a mood
with a sky and one without puts the new place's AIR in place on the frame of the crossing (fog colours, mixes and
density, the height term, the sky bands, the lean, `M_RULE`, `M_SKY`, and the grade's lift, which is the colour of
the darks), held at the display level it has when the fade is over (the stored colours are divided by an exposure that
is still on its way: `airGain`). Exposure, tint, saturation, contrast, vignette, the dynamic light and the view-model's
rig ease as before: the eye adapts, the air does not. After: 38 / 38 / 39 / 39 / 40 / 41 / 42 / 44 / 45 / 46 / 47, 49
settled (`door_after/sheet_in_low.jpg`); going out the sky strip is 167 on the crossing and 171 settled. A fade between
two rooms and a ride's long fade blend as they did (tested).

## 2. What High gained (mechanisms; every strength is a look-team number)

| Term | Where | What it does | Numbers (`moods.ts`) |
|---|---|---|---|
| The bake's shade, deepened and cooled | every receiver twin inside the sun's map | the twin reads the chunk's own lightmap: where the bake has shade it is drawn `shade x k` darker toward `tint`, whatever the map holds; a map shadow shows there at `inShade` of itself | `SHADOW_SUN`: `lit [0.40, 0.62]`, `shade 0.45`, `inShade 0.5`, `tint [0.020, 0.028, 0.060]`; under the overhang (`SHADOW_ROOF`) `shade 0` |
| The town's fixed world casts | chunks of `SHADOW_STATIC_ZONES` (`plenty_street`), materials `SHADOW_CASTERS` (`m_frontier`, `m_pellam`) | fence rails, awning posts, carts and eaves lie across the street as shadows at 5 cm a texel (a lightmap blurs them to a grey); creatures keep their blob while it is on | `statics: true` on `SHADOW_SUN`, `false` on `SHADOW_ROOF` |
| The map's edge | every receiver | a shadow fades between 72 and 96 % of the map's half side instead of ending on the side of a square that follows her | `SHADOW_EDGE` |
| Relief without a sun | lightmapped faces with a detail texture | the detail texture, read as a height, follows the sky's light in the shade and the lamps' in a room (`materials.ts RELIEF_SKY_DIR`); sand ripples in a building's shade, plaster and planks on shaded walls, the hall's wall panels | `RELIEF_SKY` per mood (L1 2.4, L4 2.0, L6 2.0 ...); `uK[9].w` = `uReliefSky` |
| The afterglow's shafts | the rim (L6) | the sun-shaft term runs toward the afterglow in the glow band's colour, with a veil of its own | `SHAFT_DUSK` 0.6, `SHAFT_DUSK_VEIL` 0.12 |

No pass, no render target, no texture set and **no program** was added: the receivers are one program (a chunk
without a lightmap reads a white texel), the fixed casters are drawn with the plain depth program the moving casters
already have (`staticDepth`), and the rest are uniforms of terms that existed. Debug switches for a test or a look team:
`__dbg.ext.render.statics(true | false | null)`, `shadowGate()`, `dusk(on)`, `relief(on)` (now both reliefs).

## 3. Measured

Mean absolute difference per channel between Low and High, 320 x 180, the reviewer's stops and measure
(`scratch/i2-team-render-tech/pairs.mjs`, `diff.mjs`):

| Stop | before | after |
|---|---|---|
| `cp_street_clear` | 2.9 | **4.7** |
| `cp_yard_clear` | 2.9 | **5.9** |
| `cp_lip_gate` | 4.0 | **6.3** |
| `vista_dowser` | 3.5 | **5.3** |
| `cp_rim` | 2.7 | **3.3** |
| `vista_rim_rule` | 3.8 | **5.1** |
| `vista_fire` | 3.8 | **5.3** |
| `vista_plenty` | 5.1 | **6.7** |
| `cp_hall_gantry` | 4.0 | 4.1 |
| `vista_tamper` | 2.1 | 2.1 |
| `cp_hall_clear` | 12.0 | 12.1 |

Cost on High, no enemies: the street checkpoint 79 -> 85 draw calls and 115 071 -> 159 181 triangles; over 204 views of
the town (51 nav nodes, four headings; `sweep_a.log`, `sweep_b.log`) the worst is **106 draw calls and 208 267
triangles** (caps 220 / 400 000). Texture and target memory is unchanged (73.9 MiB at the street). Low: unchanged.
Programs after every tier has been seen: 122, as before (`tests/render/runtime.test.mjs`).

## 4. Declined or not done, with the reason

- **The lift hall, "floor reflections" and "volumetric cones from the ceiling lamps".** `vista_tamper` is still 2.1 of
  255 from Low. The hall's floor sheen (`SHEEN`) and its air light exist and carry `cp_hall_clear` (12.1); from the
  gantry no lamp and no floor pool is in the frame. A cone needs a direction per lamp, which the emissive lamps do
  not carry (`materials.ts LampInfo` has a place, a size and a hue); a mirrored floor needs a second scene draw or a
  screen-space march, and neither was affordable to get right in this pass. What the hall gained is the relief of
  its panels and plate under the lamps (0.48 of 255, visible at full size:
  `shots/i2-team-render-tech/t2/pair_vista_tamper.jpg`). Open, for the underground look team: `RELIEF_SKY.L4`, `AIR.L4`.
- **Fixed casters in the gully.** Tried and taken out: the gully's bake is not the sun's alone (the overhang's patch is
  two spots through the notch, the walls carry a fill), so the map shaded faces the bake shows lit and put out the
  first image's sun patch (`shots/i2-team-render-tech/lip/pair_first.jpg`, `pair_back.jpg`). `SHADOW_STATIC_ZONES` is
  the town only.
- **"A soft fire light pool on the dune", "emissive bloom on the town lamps".** The far fire and the town are the
  effects pool's cards and the bloom's mood numbers (exterior look). Seen and not mine: on High the bloom lifts the
  pylon and the windmill toward the sky's level on the rim (it did before this pass: `base/pair_vista_fire.jpg`).
- **A hidden chunk casts nothing.** Every outdoor cell shows every town chunk within the map's reach (the yard is
  hidden only from the lip gate, 80 m off), so nothing pops today; a tighter cell list would need the casters drawn
  for the shadow pass alone.
- Nothing ran on a real GPU: the shadow pass now holds up to 53 000 more triangles in the town.

## 5. For the look teams (who work in `src/render/` after this pass)

`moods.ts`: `SHADOW_SUN` / `SHADOW_ROOF` (`k`, `shade`, `inShade`, `tint`, `statics`, `lit`), `SHADOW_STATIC_ZONES`,
`SHADOW_CASTERS`, `SHADOW_EDGE`, `RELIEF_SKY`, `SHAFT_DUSK`, `SHAFT_DUSK_VEIL`. `materials.ts`: `RELIEF_SKY_DIR`.
`system.ts`: `DOOR_FADE`. `tests/render/i2.test.mjs` holds the behaviour, not the numbers, except: the shade under
the overhang is not deepened (`SHADOW_ROOF.shade` 0), only town chunks are fixed casters, and a room's gate is
`[-1, 0, 0, 1]`.

## 6. For the closer: mirror into the documents

| Document | Now says | Should say |
|---|---|---|
| `docs/ARCHITECTURE.md` 8.1 (the shared block) | `uK[9].w` unused (`uWrong.w`) | `uK[9].w` = `uReliefSky` |
| `docs/ARCHITECTURE.md` 8.4, the shadow map | dynamic things cast; "sun shadows from the static world: declined" (closer, pass i1) | the town's chunks cast into the sun's map on High (`SHADOW_STATIC_ZONES`); the receivers read the chunk's lightmap, so the bake's shade is not darkened twice by the map but by `shade`; still ONE 1024 map, no new program |
| `docs/ARCHITECTURE.md` 8.3 (moods) | a mood change cross-fades every field | at a walked doorway between the open air and a room the air's fields and the lift snap, held at display level; the rest eases (`DOOR_FADE`) |
| `docs/INTEGRATION_REPORT.md` A.5 / M.0 (driving the game) | | on High the town's shadow pass draws the casting chunks again: the per-cell triangle peak outdoors rises by about 50 000 |
| `docs/KNOWN_ISSUES.md` "High is nearly Low outdoors with the sun behind her" | | street 4.7, yard 5.9, lip gate 6.3 of 255; the lift hall from the gantry is still 2.1 |

No contract, design file or budget changed.

## 7. Requests to other owners

None blocking.

## Closer, pass i2 (2026-10-07): decisions on this file's i2 rows

| Row | Decision |
|---|---|
| Section 6, ARCHITECTURE 8.1 / 8.3 / 8.4 | **Mirrored** in the "Pass i2" bullet of ARCHITECTURE 8.4 (it reverses pass i1's "sun shadows from the static world: declined" for the town); GDD 23.15 row "19 row 9" |
| Section 6, INTEGRATION_REPORT and KNOWN_ISSUES | **Done**: Part N (per-cell numbers measured again on High) and the rewritten `docs/KNOWN_ISSUES.md` |
| Section 4, not done (the lift hall from the gantry, lamp cones, a mirrored floor, the fire's pool on the dune) | **Open**: `docs/KNOWN_ISSUES.md` |


# Pass i3 (2026-10-07): render-tech

One issue, the visual reviewer's minor "High and Low are still nearly the same on the rim and from the lift-hall gantry"
(ruling R9). Files: `src/render/post.ts`, `materials.ts`, `moods.ts`, `shared.ts`, `system.ts`;
`tests/render/i3.spec.ts` (4), `tests/render/i3.test.mjs` (3). Evidence: `shots/i3-team-render-tech/` (`base/` before,
`t6/` after, each with `pair_*.jpg` Low beside High; `ab1/` to `ab4/` = High with the new terms off beside on, one tick;
`test/`), `scratch/i3-team-render-tech/` (`NOTES.md`, the scripts, `pairs_final.log`, `gate/`). **Low is untouched: its
frames at the eleven stops are byte for byte the frames taken before this pass** (`cmp` of `base/low_*.png` against the
final capture), and on Low the three switches move no pixel (tested).

## 1. What High gained (mechanisms; every strength is a look-team number)

| Term | Where | What it does | Numbers |
|---|---|---|---|
| The cone | every room mood with an air light (`moods.ts AIR_CONE`: L3 4, L4 5, L5 4, L5a 3, L5c 4, L5p 4) | a lamp whose lit face looks DOWN (a pendant's disc, a ceiling strip: `materials.ts LampInfo.face`, the sum of its triangles' area vectors over their area, read once from the geometry) throws a shaft of light through the dust under it: the same closed-form in-scatter as the air light, over the part of each pixel's ray inside a cone under the lamp. Cut by pillars, creatures and the floor (the ray ends on them). A bulb, a wall sign and a fire have none | `post.ts AIR_CONE_ANGLE` 34 degrees, `AIR_CONE_REACH` 9 m, `AIR_CONE_SOFT` 1.3, `AIR_CONE_ONLY` 0.1; `materials.ts AIR_CONE_FACE_FROM / _TO` |
| The far glow | the blue hour (`AIR_GLOW`: L6 18) | a lamp beyond `AIR_FAR` (36 m) was dropped from the air light: on the rim the set was **0 of 5 lamps offered**. Under a mood with a far glow it stays, with a reach that grows with its distance and a wide soft core: a pool of warm air round each lit window of the town, cut by whatever stands in front of the lamp | `post.ts AIR_GLOW_ANGLE` 0.07, `AIR_GLOW_FAR` 420 m, `AIR_GLOW_CORE` 0.09 |
| The glance | the blue hour (`GLANCE`: L6 and L6c `[1.6, 3]` = strength as a display level, the lobe's exponent) | the afterglow glances off ground seen at a grazing angle, toward an eye that faces it, in the glow band's colour; it rides the relief's normal, so the ripples of the sand carry it and the foreground dune has a lit side | `SharedUniforms.uGlance` = `uK[20]` (the block is 21 slots); `materials.ts GLANCE_UP_FROM / _TO` |
| The snap | every mood | after a warp (a checkpoint, a restore, a ride's teleport: the camera more than 8 m from where it was) the tier's eased terms (air light and its shapes, afterglow shafts, both reliefs, sheen, glance) stand at the mood's value on the first frame. They eased over 0.6 to 0.8 s: the reviewer's frames, 43 ticks after a checkpoint, held 59 % of the air light | `system.ts snapHigh` |

No pass, no render target, no texture and **no program** was added (the cone and the far glow are the air light's own
loop over its own twelve lamps; the glance is a branch of the relief block behind one vec4 of the shared block). Debug
switches: `__dbg.ext.render.airShapes(cone?, glow?)`, `glance(on?)` (each snaps, so a frame drawn twice at one tick
with a switch between is an on / off pair).

## 2. Measured

Mean absolute difference per channel between Low and High, 320 x 180, the reviewer's measure, 161 ticks after arrival
(`scratch/i3-team-render-tech/pairs.mjs`, `diff.mjs`, `pairs_final.log`):

| Stop | before | after |
|---|---|---|
| `cp_rim` | 3.3 | **4.7** |
| `vista_rim_rule` | 5.2 | **7.8** |
| `vista_plenty` | 6.8 | **8.8** |
| `vista_fire` (the last image) | 5.5 | 5.6 |
| `cp_hall_gantry` | 4.0 | **5.8** |
| `vista_tamper` | 2.1 | **3.3** |
| `cp_hall_clear` | 11.9 | **13.7** |
| `cp_lip_gate`, `cp_street_clear`, `cp_yard_clear`, `vista_dowser` (the Long Light: none of the three terms) | 6.3, 5.0, 6.1, 5.6 | 6.3, 5.0, 6.1, 5.6 |

Cost on High: draw calls and triangles at all eleven stops are the same numbers as before (55 / 79 961 at the gantry,
26 / 26 120 at `cp_rim`); texture and target memory unchanged (66.6 and 54.6 MiB); 12 full-screen draws as before; no
program linked in 120 drawn ticks. Per pixel of the merged pass the cone adds one quadratic and two arctangents for each
lamp that has one (at most twelve). Nothing ran on a real GPU.

## 3. Declined or not done, with the reason

- **"A soft horizon haze layer" on the rim.** Not added: polish rounds 2 and 3 took the haze OUT of the last image so
  that the town, the lamps and the fire read (`moods.ts` L6), and this pass's other visual reviewer says High's haze
  already flattens the street. A haze behind the High switch would undo that on the better tier.
- **"A fire-lit edge on the foreground dune."** The fire is a far card, not a light near the dune. What the dune gained
  is the afterglow's glance (the light that is there). `vista_fire` itself moved 0.1: its foreground dune falls away
  from the eye and is not seen at a grazing angle. The last image's composition is the exterior look team's.
- **"A light pool under each town window."** The pools on the ground are already in the town card's drawing; the far
  glow adds the air round the window. At 40 it is a round blob over the pane (look-dev r3 took exactly that out of Low's
  halos); 18 keeps the pane's shape. Stronger is a look-team call.
- **A far glow in the rooms** (the pendants at the far end of the hall). Tried and taken out: the air light has twelve
  places and the hall offers 69 lamps; a far lamp that loses its place to a near one goes out at a stroke, and with far
  lamps ranked as near ones lamps in the frame lost their glow (1 053 of 57 600 pixels darker at the gantry).
- **"Floor reflections under the pendant lamps", "contact shading at the pillar feet".** The floor's sheen (`SHEEN`)
  and the contact shade (`AO_*`) exist and are unchanged. A mirrored lamp on the floor needs the surface's gloss, which
  the post pass does not know (it would shine on cloth and sand alike); not attempted.
- **The cone has its apex at the lamp's centre**: under a long strip it is a cone from the strip's middle, not a slab of
  light under its length (`shots/i3-team-render-tech/ab2/ab_cp_hall_clear.jpg`). A lamp's size has no slot in the set.
- In the antechamber (`cp_bore_ante`) the twelve places are all taken by lamps in the frame: the ceiling lamps' cones
  seldom show there (0.13 of 255).

## 4. For the look teams (who work in `src/render/` after this pass)

`moods.ts`: `AIR_CONE`, `AIR_GLOW`, `GLANCE`. `post.ts`: `AIR_CONE_ANGLE`, `AIR_CONE_REACH`, `AIR_CONE_SOFT`,
`AIR_GLOW_ANGLE`, `AIR_GLOW_CORE`. `tests/render/i3.spec.ts` holds: a cone and a far glow only under a mood with an air
light, a far glow only under a sky and under 40, no new term under L0 / L1. `tests/render/i3.test.mjs` holds the
behaviour (cones show from the gantry and lift under 70 % of the frame, light only adds, the glance lifts the sand and
not the sky, Low is untouched), not the strengths.

## 5. For the closer: mirror into the documents

| Document | Now says | Should say |
|---|---|---|
| `docs/ARCHITECTURE.md` 8.1 (the shared block) | 20 vec4 slots | 21: `uK[20]` = `uGlance` (rgb the light, w the lobe's exponent; 0 on Low and min) |
| `docs/ARCHITECTURE.md` 8.4, the air light | a lamp glows round itself, gone at 36 m | + a cone under a lamp that looks down (`AIR_CONE`), + a far glow under a mood that names one (`AIR_GLOW`, the blue hour); still the same twelve lamps, the same pass, no program |
| `docs/ARCHITECTURE.md` 8.3 (moods) | High's terms ease with the mood | ... and stand at the mood's value on the first frame after a warp |
| `docs/KNOWN_ISSUES.md` "the lift hall from the gantry is still 2.1" | | gantry 5.8, the Tamper's vista 3.3, `cp_rim` 4.7 of 255; the last image (`vista_fire`) is 5.6 as before |

No contract, design file or budget changed.

## 6. Requests to other owners / seen and not mine

- `tests/ui/text.spec.ts(301,81)`: `npx tsc --noEmit` reported TS6133 ('m' is declared but never read) while the ui
  team was at work in this pass. Not mine; noted.

## Closer, pass i3 (2026-10-07): decisions

| Row | Decision |
|---|---|
| 5 documents | Mirrored: ARCHITECTURE "Pass i3" (8.1, 8.3, 8.4), ART_BIBLE "Amendments, pass i3 (closer)", `docs/KNOWN_ISSUES.md` |
| Shared files | Checked first: every constant the teams name is in place; `tests/render/` on the final tree is in INTEGRATION_REPORT Part P |
