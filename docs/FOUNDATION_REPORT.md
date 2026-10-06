# Foundation report (phase 2, after integration)

The game boots into a runtime greybox of the real layout, loads the pipeline's 84 placeholder
GLBs and 18 textures through the real asset store, stands on the real collision engine, and
is walked end to end by input in a test. Every number below was measured on this machine
(WSL2, 20 cores, headless Chromium on SwiftShader: **no GPU**) in the integration pass.
What is not done is in section 9. **Updated after critic round 1**: what the core half of that
pass changed is in section 8b; the core numbers in sections 2 and 6 are from its final run.
**Updated after critic round 2** (core half): section 8d; the core test counts, the allocation and
budget figures and the core wall times of section 2 are from its final run.
**Updated after critic round 3** (core half): section 8e; the core test counts and wall times of
section 2 and the bundle size are from its final run. `src/core`, `tests/harness.mjs` and the
sandbox scaffolds freeze after this pass.

**Builders: read sections 3 to 5 of this file, `docs/requests/foundation-core.md` section 4
and `tests/core/example.mjs` before your order's test section.** Since round 3 the work-order
README (section 4) and every order point here, and the document texts core had asked for (request
rows 9 to 31) are applied (`docs/requests/foundation-r3-documents.md`). Where an order and
this file still disagree about the harness, the hook, the viewer or `tests/core`, this file is what
the code does.

Rulings on the three builders' requests are in `docs/ARCHITECTURE.md` section 18.

## 1. Run the game

| What | Command |
|---|---|
| Dev server (prints its URL; the port is OS-assigned) | `npm run dev` then open the printed `http://127.0.0.1:<port>/` |
| Straight into a run | `…/?autostart=1` or `…/?cp=cp_gallery_bay` (any checkpoint id) |
| Perf overlay | `F3`, or `…/?perf=1` |
| Fixed tier | `…/?tier=min` / `low` / `high` |
| Without any asset file | `…/?assets=none` (dev / test: everything synthesised from the manifest) |
| Core stubs in some or all slots | `…/?stubs=all`, `…/?stubs=world,enemies` (dev / test, or a build with `?debug=1`): those slots keep the core stub and that piece's module is not loaded. A piece beside five stubs: `?stubs=` the other five |
| Production bundle | `npm run build` (output in `dist/`; `tests/core/stubs.test.mjs` serves it with `vite preview` and plays it) |
| Placeholder assets from nothing | `npm run assets:placeholders` (add `-- --force` to rebuild all) |
| What a player sees when it cannot start | one plain line on the page (`#boot-failure`, inside `#ui`): without WebGL 2 `KEEP SEVEN cannot start: this browser or device does not provide WebGL 2.`; any other boot failure `KEEP SEVEN could not start. <first line of the error>` (the full error is in the console). The words come from `story.json` `ui_no_webgl` / `ui_boot_failed` once those keys exist (section 9) |

In the browser: the title plate (`KEEP SEVEN / First Tally: Plenty / Click to take up the
gun`) is the UI stub's; a click starts the run and takes the pointer; WASD, mouse, `Space`,
`Shift`, `E` (lift levers), `Esc`. The click that begins or resumes the run is not a shot (core drops
the input edges gathered before `playing`, and again when the pointer lock arrives). If the browser
refuses the pointer lock (Chrome does for about 1.25 s after `Esc`), the game pauses again and the
plate comes back: a run never plays on with a dead mouse (section 5). Doors open through the stub world only when their puzzle or
encounter is forced (`__dbg.solvePuzzle`, `__dbg.clearEncounter`); there are no enemies,
puzzles, HUD or sound yet: those are the phase 3 pieces.

## 2. Run the tests

| Command | What it covers | Result | Wall time |
|---|---|---|---|
| `npx tsc --noEmit` | `src`, `sandbox`, `tests` | 0 errors | 0.4 s |
| `npm run validate` | layout validator, manifest validator (16 checks), `contracts.ts` equals the ARCHITECTURE block | pass | 1.2 s |
| `npm run test:unit` | vitest: 12 files, 198 tests (62 of them the collision spec) | 198 pass | 4.2–5.8 s |
| `node --test tests/core/` (`npm run test:core`) | boot, determinism, alloc, walk, seam, budget, playthrough, flow, stubs, sandbox, validate; **core stubs in all six slots**. Since round 3 it serves and bundles **no file under `src/<piece>/`** (`startServer({ pieces })`: core's stand-ins take their place, in the dev server, in the sandbox pages and in the production builds), so a module somebody has half written cannot fail it; a sandbox page its owner has rewritten is skipped unless `KEEP7_REAL` names it. **Its first line says which systems it loaded**: `tests/core: systems loaded from src/<piece>/: NONE; core stubs in: player, enemies, world, render, audio, ui`, and it names every module that is no longer the initial stub and was not loaded | 68 pass, 0 fail (round 3) | **105 s** in the final run of round 3 (load average 9: other suites and bakes beside it). The same 68 tests took 148 to 152 s before the harness shared one dev server per process (below); the round-3 critic measured 179 to 194 s on the round-2 code |
| `KEEP7_REAL=player node --test tests/core/` (any slot, a comma list, or `all`) | **the "wired in" check of a code piece**: the same files with `src/<piece>/` in the named slots (index page, sandbox page and production bundle) and core stubs in the rest; `stubs.test.mjs` keeps the stubs in the slots of its stub-level tests | 68 pass with `all` and with `player` (round 3) **while the six modules still wrap the stubs**; never run against a real system | 97 to 107 s |
| `node --test tests/pipeline/` (`npm run test:pipeline`) | optimise round trip, placeholders (sockets on bones, none on the origin), greybox agreement (final zones held to floors only), 23 check-glb mutations, the build driver (a failed build ships nothing, helper modules, table entries), every `blender/lib` function called, determinism, textures, viewer overlay; round 2: dressing empties (in the files and through the real loader), `--reset`, a late-bake lightmap's helper module, the bounded script header, vertex-light marks and the buried-vertex warning | 72 pass, 0 fail (round 2); 83 pass, 0 fail in the core fixer's last run of round 3 (the pipeline fixer was still adding tests) | 27–30 s (44 to 49 s on the busy machine of round 3) |
| `npm run test:e2e` (`node --test tests/`) | both of the above in one process | 151 pass, 0 fail in the final run of round 3 (68 core + 83 pipeline; 131 in round 2) | 170 s in that run (a busy machine); before: **100–160 s** depending on what else the machine is doing (round 1, idle: 103 s; a round-2 critic measured 129–142 s; round 2: 114 s quiet, 159 s under load). **While iterating, run your own directory or one file, not `tests/`** |
| `rm -rf public/assets blender/export && node tools/build-assets.mjs --placeholders --force` | full placeholder build from clean | 102 items built | 8.9 s clean (measured in integration); `--force` over the existing set 9.0–10.2 s after the round-1 fixes, 10.7 s after round 2 (zones now place dressing empties); no-op rebuild 0.12 s |
| `npm run check:assets` | `check-glb --all` | 84 assets, 18 textures, 1.42 MB: all pass | 0.5 s |
| `npm run build` | `tsc` + production bundle | `dist/js/index-*.js` 1,172.5 kB, 305.2 kB gzip, one script (the six pieces are imported dynamically and inlined) | 0.6 s |
| `npm run evidence` | regenerates `shots/foundation/` | 47 files written by the command (48 with `example.png` from `node tests/core/example.mjs`); the folder's other files come from the commands of section 4 | 9.5–17 s |

A single file: `node --test tests/core/walk.test.mjs`. A new test directory needs an `index.js`:
**copy `tests/core/index.js` unchanged into the directory you run** (Node 24 resolves
`node --test tests/<dir>/` like a module). Since round 2 that file finds `tests/run-dir.mjs` from
any depth, so the same copy works in `tests/player/`, in `tests/art_props/` (which then runs
`mech/` and `dress/` below it) and in `tests/art_props/mech/` (verified in a scratch tree; before,
the nested copy failed with `ERR_MODULE_NOT_FOUND`). Slowest single tests (round 3, a busy machine): allocation 6 to 11 s by itself and up to 18 s as the first test of the directory, which also pays the process's first cold page (it was 40 to 60 s: see `alloc` below), playthrough 7 s, the real-time test 2 to 7 s, the mood test 4 s.
**Wall time depends on the machine's other work more than on anything else**: every figure in this table doubles when
other suites and bakes run beside it, and the real-time tests (a page with its own rAF loop under SwiftShader) are the
ones that suffer; since round 3 they draw a 320 x 180 page and wait up to 90 s per step.
Four `node --test tests/core/stubs.test.mjs` at once in this tree: 4 of 4 pass (each production
build goes to its own `.cache/dist-*`; before, two of four failed after a 120 s wait).

The five tests the order names, as they ran:

- **walk** (`followPath('critical')` by input, real collision, god mode, gates opened through
  `world.debug`, both rides by `tap('interact')`): 542.1 m of 552.412 m (−1.9 %; it was 549.0 m
  before round 1 in the same 8631 ticks: the measure counts vertical travel, and the old ground
  snap jittered on ramps) in 8631 ticks (144 s of game time, 95 ms of wall time), reason
  `arrived`, never stuck, largest fall 0 m,
  zone never null, nine gates, rides of 1501 and 721 ticks; the walk re-entered every tick and
  the walk in 30-tick calls end on the same tick, position and hash.
- **seam**: 281 ticks down the peg stair, every tick rendered; worst textures + render targets
  46.8 MiB at 960 × 540 and 61.0 MiB at Low's 1366 × 768 cap (limit 64).
- **determinism**: two page loads give identical hash, state and PNG; the hash is equal on
  `min`, Low and High; a death and respawn give one hash whether the 200 ticks are one call, 20
  calls of 10, 200 calls of 1 or a four-step script, and `until({ state: 'playing' })` after a
  death is met within 110 ticks.
- **alloc** (limit 6144 B per tick, and since round 2 the same limit for a tick plus a rendered
  frame), every figure after 3000 ticks of its own path (`measureAlloc`, section 3): 122 B per tick
  walking; 381–394 B per tick with shots and the debug event ring off, 424–432 B with it
  recording; **2.8–2.9 KB for a tick plus a rendered frame** (four runs: 2770, 2913, 2949, 2949 B;
  round 3: 2911 to 2955 B). Since round 3 the 3000 warm-up frames of that last path are drawn into a
  96 x 54 buffer and only the ten measured batches at 960 x 540: the JS being warmed does not depend
  on the picture's size, and under SwiftShader 3600 full frames were 30 to 50 s of rasteriser time
  (most of it paid when the browser closed). The test went from 42 s to 11 s on the same busy machine.
  The round-1 figures (739 B walking, 5.5–6.1 KB per tick plus frame, asserted at 12 KB) were
  taken after 300 ticks and were mostly JIT warm-up.
- **budget** (Low, eight headings per cell, draw calls / triangles, bound in brackets):
  lip_gully 17 / 1132 (50, 64166) · lip_gate 21 / 1766 (64, 107812) · street 15 / 1356 (68, 112381) ·
  yard_door 11 / 1320 (72, 104147) · yard 18 / 1458 (68, 112381) · tally_seam 6 / 696 (47, 51565) ·
  tally 13 / 1128 (71, 77717) · gallery_stair 7 / 678 (41, 46910) · gallery 10 / 778 (83, 117500) ·
  hall 11 / 874 (80, 107875) · bore 8 / 2076 (64, 80808) · rim 5 / 252 (21, 27024).
  (Round 2: one call and 12 triangles per shut door more than before, because the stub world now
  draws doors.)
  These are placeholder boxes: the test proves the measuring works, not that final art fits.

- **random walks** (new): 51 runs of 1500 ticks from all 17 checkpoints with sprint, strafe and
  jumps: the capsule is never inside a solid, the largest grounded rise in one tick is 0.150 m
  in round 2 (0.172 m before the wedge limit moved)
  (170 runs of 3000 ticks in `scratch/fixer-core/randomwalk.mjs`: none inside, 0.30 m).

No assertion was weakened in the integration pass. One was tightened: `boot.test.mjs` now requires
**0 synthesised** assets and textures when `public/assets` is populated (65 assets + 18
textures from files; R8 upload verdict `r8`, sample 128,0,0,255, GL error 0).

In round 1 one thing core asserts was **reduced on purpose**: the six piece-owned sandbox pages
were each held to `cp_lip_start`, a `room` scene with core's exact box room and under 10 draw
calls. Those checks now run on `sandbox/core.html` (core's own page); a piece's page is held
only to booting under `?test=1` and drawing a frame, because its scenes are the piece's to choose.

## 3. The debug hook (`window.__dbg`, version 2)

Installed with `?test=1` (no rAF loop: you step it), in dev, and in a production build with
`?debug=1`. The interface is `DebugHook` in `src/core/contracts.ts`; it is implemented once in
`src/core/debugHook.ts` against the contracts only, so it survives the stubs being replaced.

| Group | Methods |
|---|---|
| Time | `step(n, render)`, `stepUntil(condition, maxSteps)`, `setRealtime(on)`, `seed(n)`. **No tick runs while a flow job is pending** (a respawn, a restart, a warp): these stop there and print one `console.warn` the first time; see below |
| Flow | `start({ checkpoint, difficulty })`, `checkpoint(id)` (both async), `pause(on)`, `setOption`, `setTier` (throws `__dbg.setTier: unknown id '<x>'` for a tier outside the manifest) |
| Input | `setKeys(codes)`, `setActions(actions)`, `tap(action, ticks)`, `look(dx, dy)`, `setAim(yaw, pitch)`, `aimAt(x, y, z, errorM)`, `aimAtEntity(id, part, errorM)`, `aimAtMarker(id)`. **`tap` works under the real-time loop too** (round 3): the press and its count-down are per-tick hooks of the loop (`Loop.preTick / postTick`), so a tap is held for exactly its ticks whether `__dbg.step` or `requestAnimationFrame` runs them (before, a tap on a dev page or after `setRealtime(true)` did nothing, silently) |
| Walking by input | `walkTo(x, z, opts)`, `followPath(to, opts)` (`to`: nav node, marker or `'critical'`), `navPath(from, to)`; reasons `arrived`, `stuck`, `max_ticks`, `gate`, `portal`, `dead`, `state`, `no_path` |
| Cheats | `teleport`, `teleportToMarker`, `god`, `setHealth`, `setAmmo`, `aiEnabled`, `spawnEnemy`, `killAll`, `solvePuzzle`, `clearEncounter` (both throw `__dbg.<method>: unknown id '<x>'` for an id that is not one of the four puzzles / six encounters), `setBossPhase`, `emit(name, payload)`. **Round 3: bad arguments fail at the hook, by name.** `walkTo`, `teleport`, `aimAt`, `setAim`, `look`, `setHealth` and `spawnEnemy` throw `__dbg.<method>: <argument> is NaN (a finite number is needed)` for a non-finite number; `spawnEnemy` and `setBossPhase` throw `__dbg.<method>: unknown id '<x>' (<the valid ones>)` for a kind or phase outside the contract unions |
| Queries | `state()` (rounded to 1e-4, JSON-safe; **a NaN or an Infinity anywhere in it is still written as 0, and since round 3 the first one found is put into `__dbg.error` with its path, `state(): player.x is NaN`, so `game.close()` fails the test**: a system's `debugState()` must hold finite numbers only), `player()`, `enemies()`, `puzzles()`, `objectives()`, `perf()`, `perfPeak()`, `perfReset()`, `perfRun(ticks)`, `events(sinceSeq, name)`, `clearEvents()`, `hash()`, `probe()`, `capture()` |
| Other | `ready`, `error`, `ext.<name>.*` (helpers beside the contract). **`ext.core` is core's, on every page, and stable** (it holds what the frozen `DebugHook` interface has no method for): `ext.core.stepAsync(n, render)`, `untilAsync(condition, maxSteps)`, `busy()`, `ran()`, `idle()`, `recordEvents(on)`, `capsuleFree(x, y, z, radius, height)`, `collisionCounts(reset)` → `{ last, peak }` of `{ rays, sight, capsules }` per drawn frame, `stubs()` (index page); since round 2 `setSeventh(state)` (`PlayerDebug.setSeventh`), `tokens()` (`EnemiesDebug.tokens`), `damage(amount, kind?, source?, ox?, oy?, oz?)` → the damage applied (`player.applyDamage` with a scratch `DamageInfo`: the way to drive grace, the last-20-HP absorb and the damage arc; `setHealth` goes round them), `timeScale()`, `playerExtra()` → `{ control, controlReason, keptAimLegal, shotsFired }` (`control`: the last `player/control` event, `null` before the first), `ctx()` → the `GameContext` for page-side test code (`__dbg.ctx` also works at runtime but is a private field); `ext.assets.report / isPlaceholder`. Sandbox pages: `ext.sandbox.room(solids, spawn, yawDeg)`, `boxRoom()`, `activate(ids)`, `loadOverlay(url)`, `origin()`. On the stubs only: `ext.world.setDoor / setFlag / showAll`, `ext.player.fly / camera`, `ext.render.addInstances / unitVisible / zoneVisible / moodLook(on) / moodTint() / viewModelCoverage() / viewModelProject(x, y, z)`, `ext.enemies.setBoss(fields)`, `ext.viewer.check`; on an asset page of the viewer `ext.viewer.project(node) / coverage() / firstPerson()` (section 4) |

`tests/harness.mjs` wraps it for Node: `startServer({ mode, pieces })` (round 3: `mode: 'build'` is a
real production build whatever ran before in the process: `NODE_ENV` is pinned per mode and put back,
so `import.meta.env.DEV` is false, the hook needs `?debug=1` and a missing file is a boot error; and
`pieces`: `'all'` (the default) or the list of slots served and bundled from `src/<slot>/`, every other
slot's `index.ts` being replaced by core's stand-in `src/core/stubs/slots/<slot>.ts`: **pass
`pieces: ['<your slot>']` when your test makes a build or opens a page that imports every piece**, so
another builder's half-written module cannot break it; the result has `replaced()`), `openGame` (option `stubs`: `'all'`, a list,
`othersThan('player')` or `null` for none; **left out, a `piece` of `'code-<slot>'` gets
`othersThan('<slot>')`**, its own system beside five core stubs, so a builder's index-page test
never loads the five modules other builders are editing; any other piece gets none),
`withGame`, `othersThan`, `defaultStubs`, **`measureAlloc(game, body, { warm, batches, perBatch, ring, arg })`**
(the one way every piece measures bytes per tick: `body(dbg, ticks, arg)` runs in the page and
runs exactly `ticks` ticks; 3000 ticks of warm-up, the median of ten 60-tick batches between
`gc()` calls, the debug event ring off; → `{ perTick, samples }`), and a `Game`
with `dbg`, `run`, `runDetailed`, `walkTo`, `followPath`, `step`, `until`, `state`, `perf`,
`events`, `shot`, `shotSeries`, `pixel`, `close` (which throws on `__dbg.error` or any
`console.error`), plus `assertBudget` and `comparePng`. `tests/core/route.mjs` has the gate
table and the walker that opens gates and takes rides using only the contract surface.

The example (`tests/core/example.mjs`, 20 lines, run with `node tests/core/example.mjs`; it
printed `walk: arrived 95 ticks`, `fired 1 hit kill felled 1`, `frame: 12 calls 848 tris 42 MiB` (round 2; 11 / 800 before the stub drew doors)
and wrote `shots/foundation/example.png`):

```js
// The 20-line example of docs/FOUNDATION_REPORT.md: boot, step, move, shoot, screenshot. Run: node tests/core/example.mjs
import { withGame } from '../harness.mjs';

await withGame({ piece: 'foundation', tier: 'low', checkpoint: 'cp_street_clear', stubs: 'all' }, async (game) => {
  await game.dbg('god', true);                                             // cheats go through the contracts
  const id = await game.dbg('spawnEnemy', 'bider', -70, 0, -2, 90);        // kind, x, y, z, yaw -> EntityId
  await game.step(30);                                                     // 30 fixed ticks (0.5 s), no drawing
  const walked = await game.walkTo(-62, -2, { maxTicks: 600 });            // BY INPUT: turns, holds forward, collides
  console.log('walk:', walked.reason, walked.ticks, 'ticks');
  const s = await game.run([                                               // a whole script in ONE page.evaluate
    { aimAtEntity: id, steps: 2 },                                         // turn the view onto its hit volume
    { tap: 'fire', steps: 12 },                                            // press fire for one tick, run 12
    { keys: ['KeyA'], steps: 20 }, { keys: [], steps: 1 },                 // strafe left by key code, release
  ]);
  const hits = await game.events(0, 'combat/hit');                         // the event ring, filtered by name
  const perf = await game.dbg('perfRun', 4);                               // renders 4 ticks, per-field maxima
  console.log('fired', s.stats.roundsFired, 'hit', hits.at(-1)?.payload.outcome, 'felled', s.stats.felled, 'at', s.player.x, s.player.z, 'zone', s.world.zone);
  console.log('frame:', perf.drawCalls, 'calls', perf.triangles, 'tris', (perf.textureBytes + perf.renderTargetBytes) >> 20, 'MiB');
  console.log('hash', await game.dbg('hash'), '->', await game.shot('example'));   // shots/foundation/example.png
});
```

Rules that matter: batch steps inside one `run()` (a round trip costs about as much as 40
ticks); `followPath` and `walkTo` are synchronous and never render; never hardcode a port.

**Deaths, restarts and warps inside a script.** A restore is a promise chain; it cannot settle
inside a synchronous call. So the hook runs no tick while one is pending: `__dbg.step(200)` with a
death in it returns after the tick that queued the respawn (`ext.core.ran()` says how many ticks
ran), `stepUntil` returns `met: false` with fewer steps than its budget, a walk returns `dead` or
`state`. The first time `step`, `stepUntil` or `perfRun` returns short for this reason it prints
one `console.warn` naming `stepAsync` (a warning does not fail a test; an error does). `game.step`, `game.until` and `game.run` of the harness go through
`ext.core.stepAsync / untilAsync`, which let the job finish and run the remaining ticks, so the
same script gives the same hash however it is cut into calls. In your own `page.evaluate`, use
`await __dbg.ext.core.stepAsync(n)` when a death can happen. A world's `restoreCheckpoint` and
`beginRun` must not wait on the simulation (the hook throws after 30 s without a tick).

**A new run resets the player, in core** (round 2). `flow.ts` keeps `player.captureSave()` from
the end of boot (after every `start()`) and, on `play` / `again` (and on a death with no save),
calls `player.applySave(<a copy>)` **before** `world.beginRun(null)`, so the `cp_lip_start` save
committed in there holds the fresh state. For `src/player`: `captureSave()` right after `start()`
must be the state a run begins with, and `applySave` may arrive on the title or the ending, while
she is dead, before the world has placed her; it must leave her alive with every per-run field
reset. Before this, a run started after `quit_to_title` kept the last run's health and ammunition,
and a player who was dead when the run started stayed dead in `playing` with no respawn pending.

## 4. An artist builds and previews one asset

Verified end to end in this pass with `blender/template_asset.py` copied to
`blender/props/mech/ia_ammo_box.py` (then removed and the placeholder restored). The way back is
`node tools/build-assets.mjs --reset ia_ammo_box` once the script is gone (round 2): it removes the
final raw export, its `.deps.json`, the shipped file and the stamp (and the lightmaps that script
wrote), then regenerates the placeholder; it refuses an id whose script still exists. Plain
`--placeholders` keeps a final file and now names that command in its `kept` line. The template
copied to `scratch/` (or anywhere under the repository) builds; outside the repository it stops
with `blender/lib not found above <file>` instead of looping at the filesystem root.

1. Find the entry in `design/assets.json` (`source`, `nodes`, `bones`, `animations`,
   `triBudget`, `drawCalls`). Write the script at the `source` path, starting from
   `blender/template_asset.py`; the library map and trap list are in `blender/lib/README.md`.
2. Build: `node tools/build-assets.mjs --only ia_ammo_box` (an id, an owner or a piece).
   Measured 0.5 s: `built ia_ammo_box 17.1 kB tris 184/400 dc 3/3`. It runs Blender through
   `tools/blender.sh`, optimises into `public/assets/` and runs `check-glb`; a mismatch with the
   manifest prints `FAILED <id>` with the reasons and exits 1. The Blender log is
   `blender/export/.logs/<id>.log`. **Nothing ships until it passes**: Blender, the optimiser and
   `check-glb` work on temporary files, and the raw export, its lightmaps and the shipped files are
   renamed into place together only on a pass; a FAILED build leaves the previous files as they
   were (`tests/pipeline/driver.test.mjs`). Draw calls are counted **one per mesh per material**
   (two meshes sharing a material are two; variant nodes count once), in Blender and on the
   shipped file. An asset is stale when its script, `blender/lib/*.py`, a design file, a helper
   module it imported, a texture-table entry it read or an embedded prop changed.
3. Preview: `node tools/preview-asset.mjs ia_ammo_box --game --clip dispense` (4.9 s) writes
   `<id>_sheet.png` (8 Workbench views), `<id>__<clip>.png` (five frames) and `<id>_game.png`
   (the real loader) to `shots/<piece>/`; `--cycles` adds a lit sheet, `--zone` the zone views.
   **Open every image.**
   Since round 2 a `&shot=1` frame (every `<id>_game.png`) carries no panel, button bar or UI log.
   **Since round 3 a `&shot=1` frame without `&dist=` is fitted**: the camera stands where the asset's
   bounding box, seen from the given `&yaw=` / `&pitch=`, fills 90 % of the frame in its tighter
   direction, centred (it was `radius × 2.6 + 0.6`, which left a prop a quarter of the frame wide).
   `&dist=` is kept as given, for close-ups. `__dbg.ext.viewer.framing()` → `{ distance, fitted, width, height }`.
4. Live: `npm run dev`, then `…/sandbox/viewer.html?asset=ia_ammo_box` (nodes as labelled axes,
   clip buttons with manifest / authored seconds, triangles and draw calls against the budget,
   `[PLACEHOLDER]` or `[final]`), `…/sandbox/viewer.html?zone=plenty_street` (walk camera on the
   real colliders, cells toggle), `…/sandbox/viewer.html` (index). A non-game asset:
   `&overlay=tests/pipeline/fixtures/manifest.json`.
5. Status: `npm run assets:status` (or `node tools/asset-status.mjs --owner props_mech`);
   `--require=0` exits 1 while a P0 asset is a placeholder.

**First person** (round 2). `…/sandbox/viewer.html?asset=weapon_revolver` is first person by
default (an asset whose manifest `pivot` is the camera; `&view=viewmodel` forces it for any asset,
`&view=orbit` turns it off): the instance goes into `ctx.scene.viewModel` and is drawn by the 52°
view-model pass over the test room, the world camera level at eye height, no orbit.
`__dbg.ext.viewer.project('muzzle')` → `{ across, up, inFront }` (screen fractions: across from the
left, **up from the bottom**); `__dbg.ext.viewer.coverage()` → `{ coverage, minX, maxX, minY, maxY }`
(the share of the frame the view-model covers, drawn alone, and the box of its pixels: `minX ≥ 0.5`
is "nothing left of centre"). For 16:9, 4:3 and 21:9 open it at 960 × 540, 720 × 540 and
1260 × 540 (`openGame({ viewport })`). The **placeholder** revolver measures: muzzle 57.7 % across
and 37.2 % up at 16:9 (the order asks 58 % / 37 %), 60.3 % across at 4:3, 55.9 % at 21:9; coverage
14.0 %, 16.4 %, 10.6 %; `cam_look` at the centre (`tests/core/sandbox.test.mjs`).

**Bones and poses for art tests** (round 3; any `?asset=` page, shot or live):
`__dbg.ext.viewer.pose(names?)` → `{ <name>: { pos, quat, scale, local: { pos, quat, scale }, isBone } }`
for the given nodes or bones (default: every manifest node and bone; any object name of the file is
accepted, an unknown one throws). `pos`, `quat` (x, y, z, w) and `scale` are in **asset space** (relative to
the asset's root: game metres, +Y up, as the manifest's `nodePos`), with the clip pose and every override
applied; `local` is relative to the parent. `setBone(name, { rot: [xDeg, yDeg, zDeg], scale })` → that
bone's pose: for bones that **code** drives (a vent lid at +80°, a part hidden at scale 0). `rot` is an XYZ
Euler turn in the bone's own frame, applied **on top of** the pose the clip gives it (or of its rest pose),
after the mixer, on every frame until changed; `scale` (a number or `[x, y, z]`) replaces the bone's scale;
`null` or `{}` clears it. `setClip(name, t01)` → `{ clip, time, seconds }` holds a clip at a time without
reloading the page (`''` gives the rest pose back). Tested on the placeholder Tamper: `vent_chest` at
+80° is 80.000° from its rest pose and from `slam_windup`'s last frame, stays so over frames and over a
playing clip, and clears to the exact pose (`tests/core/sandbox.test.mjs`).

**Moods and ground** (round 2). `&mood=L1` (any `MoodId`) turns on the stub renderer's *mood look*:
the mood's fog and sky colour and one flat ambient + key tint on unbaked materials and on the
ground, from the table of `code-render` 4.3 (ambient × its strength + half the key × its strength,
× the mood's exposure; no key direction, no specular, no grade, no sky gradient). `&ground=sand`
makes the ground sand-coloured. `…?asset=enemy_bider&dist=30&pitch=3&mood=L1&ground=sand&shot=1`
is the "reads at 30 m" frame. It is a rough look: enough to see a silhouette against the L1 haze
and whether the gun is darker than the ground under L1 and L4, not enough to judge a highlight.
In the game itself (and in every sandbox) the mood look is off and `setMood` changes nothing.

**Colour** (round 2). The stub renderer shows linear values up to 0.8 exactly as authored and
rolls off only above that (the brightest channel toward 1.0, hue kept). Dark palette colours in a
viewer frame are the colours in the file: steel, steel_dark, gun_blue, cable and walnut come out
within 1 / 255 of their sRGB values (`tests/core/sandbox.test.mjs`). Before, three's
`NeutralToneMapping` showed steel (54,82,90) as (23,67,77) and steel_dark (30,47,54) as (3,35,44),
and no dark colour could be judged in an `_game.png`.
**This curve is the game's tone map (producer ruling, round 3): shoulder only, no toe, knee 0.8.** It
lives in `src/core/tonemap.ts`: `TONE_MAP_KNEE`, `TONE_MAP_GLSL` (three's `CustomToneMapping` hook),
`installToneMap(THREE.ShaderChunk)` and `toneMap(r, g, b)` (the same curve in JS, for tests).
`basicRender` installs exactly that string, and `src/render` must apply the same curve before its grade
(import it; do not retype it), so what an artist sees in the viewer is what the game shows before grade.
Tested: the unit spec holds the JS curve to the palette and to the GLSL text, and the browser test holds
the rendered pixel to the curve at four bright values (linear 1.6, 0.8, 0.4 displays 250, 184, 134).

The viewer (and every `<id>_game.png`, and every sandbox until `code-render` lands) uses the core
fallback material. For a **final** file it binds the shared texture of each material on UV0, so
UV mapping is checked through the real loader: `m_frontier` / `m_pellam` / `m_sand` multiply their
detail sheet (red channel × 2) into vertex colour × baked light, `m_prop` multiplies `tx_palette`,
`m_gun` `tx_gun`, `m_mask` is cut by `tx_mask` (alpha test 0.5), `m_emis` shows `tx_palette_emis`.
The panel lists what was bound (`materials  m_prop:tx_palette …`) and prints `MISSING bake extra`
when the manifest says `VL` / `LM` and a drawn mesh has no `bake` extra. It is unlit: no key
light, matcap or lamp state (and moods only as the flat tint above), so the Workbench and Cycles
sheets still carry the look. **Placeholders get no textures** (their UVs are schematic) and show plain vertex colour.
`shots/foundation/ia_ammo_box_game.png` is from the template build before round 1 (the old
near-white look); core did not rebuild it. Before round 1 the fallback sampled no colour texture
at all, and this section said it did. The asset is framed in the area the panel and the button
bar leave free (not in `shot=1` frames).

## 5. A coder opens their sandbox

`npm run dev`, then `…/sandbox/<piece>.html` for `player`, `enemies`, `render`, `world`, `ui`,
`audio` (and `sandbox/core.html`, core's own, all stubs). In the scaffold `?scene=layout` (default)
is the real level at `cp_lip_start` and `?scene=room` is a 40 × 40 m test room with a ramp and
0.2 / 0.35 / 0.5 m steps; **the scenes are yours to replace** (core tests your page only for
booting under `?test=1` and drawing a frame); `?test=1` turns the rAF loop off
and installs the hook; `F3` shows the overlay. Each page is fifteen lines: it passes the
piece's own factory (`src/<piece>/index.ts`, today a re-export of the core stub) to
`createSandbox` (`src/core/sandbox.ts`), which fills the other five slots with core stubs.
From tests: `openGame(server, { page: 'sandbox/player', piece: 'code-player', start: false, query: { scene: 'room' } })`.
The six pages are byte-identical in a screenshot today because every slot is a stub.

From a scene: `sb.room(solids, spawn, yaw)` builds a room of layout-style solids, `sb.boxRoom()`
the standard one; `await sb.loadOverlay('tests/pipeline/fixtures/manifest.json')` then
`await sb.activate(['fixture_room'])` loads an asset that is in no resident set (lightmaps
included) through the real store, with whatever material resolver the render slot installed.
**Run `node --test tests/pipeline/` once first** (or `node tools/build-assets.mjs --manifest
tests/pipeline/fixtures/manifest.json --only fixtures`, 3 s): the fixture room and its lightmaps
live in `tests/pipeline/fixtures/export` and `…/public`, which are generated and git-ignored.

**Dressing empties (round 2).** Every placeholder zone GLB except `env_far_rim` (whose allowance
lists no asset) now carries two or three `inst_<nnn>` empties and one `brk_<nnn>` from its
`zones.<id>.dressing.assets`, on a floor, 0.95 m or more from every nav link, inside the allowance
(the brk reuses an inst's asset and node, so it adds no instanced set): the lip 2 + 1, the street
3 + 1, the Tally House 3 + 1, the gallery 3 + 1, the hall 2 + 1, the bore 2 + 1. An empty reaches
the runtime as an `Object3D` child of the zone instance's root whose **name** is `inst_001` /
`brk_001` (three keeps it; also `userData.name`), with **`userData.asset`** (an asset id),
**`userData.node`** (a variant node, absent when the asset has none) and `userData.wind` (absent
on the placeholders); its world matrix is the pivot of the thing to instantiate (zone roots sit at
the origin; hung assets, `placeholder.anchor: top`, hang at 1.7 m). `tests/pipeline/pipeline.test.mjs`
(h) reads exactly that through `src/core/assets.ts`; `greybox.test.mjs` holds the files to it.
**The core stub world still ignores them**, so the budget numbers in section 2 contain no dressing.
From a test, the same through `__dbg.ext.sandbox.room(...)` / `activate` / `loadOverlay`: a test
need not depend on a scene of the page (`tests/core/sandbox.test.mjs` builds its step room so).

The dummy player now jumps (`Space`: 6.5 m/s, 0.88 m, on a press), and its step-up and ground
snap are tested against the collision engine.

**`clock.tick` also counts while the game is paused or loading** (round 3; pinned in
`tests/core/clock.spec.ts`): half a second of pause advances it by 30. Count your own ticks in
`fixedUpdate`, or use `clock.unscaledTime` / `simTime`, for anything that must stop with the game: a
cooldown or a telegraph stamped with `clock.tick` runs out while a readable is open (readables use the
`paused` state). `unscaledTime` is `tick × FIXED_DT` only until the first pause.

**Checkpoints of the stub world** (round 3). Only checkpoints that are *places* commit by walking onto
them (within 1.6 m): `cp_lip_start`, `cp_tally_enter`, `cp_gallery_bay`, `cp_hall_gantry`, `cp_bore_ante`,
`cp_rim` (layout `when`: start, "entering …", "foot of the stair", "the lift opens on the rim"). The
others are events: an encounter's checkpoint commits in `clearEncounter`, `cp_lip_gate` and
`cp_gallery_baffle` in `solvePuzzle('seven_jugs' / 'proving_line')`, and the four boss checkpoints
(markers 0.5 m apart) on the boss's events: `boss/phase` `p1` → `cp_boss_p1`, `p2` → `cp_boss_p2`, `p3a` →
`cp_boss_p3`, `proven` (or `boss/proven`) → `cp_boss_proven`, each only while the bore is built. Beside the
stub world, a death in boss phase 1 comes back at `cp_boss_p1` (it came back at `cp_boss_proven`).
`tests/core/route.mjs` `CHECKPOINT_ACTS` has the call that commits each.

**Pointer lock** (round 3, `input.ts` and `loop.ts`). A request the browser refuses twice (raw, then
plain) emits `input/pointer_lock { locked: false }`; the loop pauses a game that is `playing`
(`focus_lost`), and one that was still `loading` on its first tick of play, so the resume plate is back.
When the lock arrives, the press edges gathered before it are dropped: the click that takes the pointer
is never a shot, whatever state it was made in.

**The view-model is in camera space** (round 2; the documents did not say, and the stub drew a
camera-space gun at the world origin). Children of `ctx.scene.viewModel` are in camera space:
camera at the origin, looking down −Z, +Y up, as `art-weapons` authors the gun. **Render** copies
the world camera's `matrixWorld` onto the group before its second pass and draws it with its own
52° camera at that pose; **player adds the instance and never transforms the group**, only its own
instance (kick, bob, sway). A node's world position under it (the `muzzle`) is right after
`render()` or after `group.updateMatrixWorld()`. `basicRender` does exactly this, and
`src/render` must do the same (request row 25 has the words for the contract comment and both
orders). Tested: `weapon_revolver` added as `code-player` 4.7 says draws 2 more calls and its
muzzle stays at the same screen place after turning and walking.

**Three properties of the collision engine every controller must handle** (pinned in
`tests/core/collision.spec.ts`, "what a controller has to know"; also at the top of
`src/core/stubs/dummyPlayer.ts`):

1. **The ledge lift is one radius, not "about 0.2 m"** (ARCHITECTURE 6 and `code-player` 4.1 say
   0.2). `resolveCapsule` carries a capsule pressed into a ledge onto any walkable top below the
   centre of its lower sphere (0.35 m above the feet) and can leave it up to 0.14 m above that
   top: a ledge 0.30 m up → lifted 0.305 m; 0.34 m up → 0.475 m, in the air; 0.36 m up → a wall.
   A controller's own lift adds to it (step 0.35 → up to 0.70 m), and **a jump reaches
   apex + 0.35 m**: the stub (apex 0.86 m) mounts a 1.1 m box (a round-2 critic's measurement),
   and with the GDD's 1.0 m apex the layout's four 1.3 m cover solids are mountable. Check the
   height really gained after every move, on the ground and in the air.
2. A `groundHeight` ray that starts inside a solid leaves through its underside and reports that:
   probe for a ledge from above anything climbable and refuse what is too high.
3. The ground under the capsule's centre says nothing about its rim: when snapping down, resolve
   the capsule at the new height and keep the engine's answer.

Wedges: two walls meeting at 5° or more are resolved exactly (unit-tested at 6°, 8°, 12° and 20°,
at 5, 7 and 12 m/s: the capsule stops where it touches both and is never inside either). Below 5°
it can be squeezed 2–3 cm into them. The limit was 10° before round 2, and the layout has an 8°
wedge (`ty_table_end` against `ty_wall_n`).

The stub world draws every shut door and the hatch as a greybox box the size of its collider
(pale steel for the hatch, dark wood for doors), so a greybox frame shows whether a door is shut.

## 6. Measured numbers

**Driving the game under SwiftShader** (`shots/foundation/evidence.json`, Low, 960 × 540, in `cell_street`):

| Operation | Cost |
|---|---|
| `step(600, false)` inside the page | 0.017–0.018 ms per tick |
| `step(1, true)` inside the page | 0.10 ms (the draw is submitted, not finished: SwiftShader rasterises later) |
| `__dbg.capture()` (render + read back + PNG) | 6.7–7.0 ms |
| One `game.step(1)` round trip from Node | 0.67–0.75 ms |
| `game.shot(name)` (`page.screenshot`, DOM included) | 29 ms |
| Seventeen checkpoint warps + frames in one `shotSeries` | 250–263 ms |
| Launch browser, load, boot to the title | 1.05 s first page of a server, 0.55 s after |
| Title to control (`__dbg.start()`, test mode: sets already decoded) | 2 ms |
| Death to control back | 1.82 s of game time (limit 3.0) |
| `data.navPath`: a 4-node hop / the whole critical path (117 nodes) | 0.0004 ms and 94 B / 0.025 ms and 1.2 KB per call (before round 1: 0.005 ms and 1.9 KB / 0.16 ms and 14.7 KB) |

**Collision** (`shots/foundation-collision/bench.txt`, Node 24, full layout: 4916 triangles from 306 solids):

| Query | Median per call | Allocation per 1000 calls (steady state) |
|---|---|---|
| `resolveCapsule` | 1.47 µs (1.67 with 48 volumes + 16 boxes) | 0 B |
| `raycast` | 1.41 µs (2.71) | 0 B |
| `raycastAll` | 3.46 µs | 0 B |
| `lineOfSight` / `groundHeight` / `capsuleFree` / `overlapSphere` | 0.95 / 0.49 / 0.27 / 0.23 µs | 0 B |

The budget was 20 µs per call. `setStatic` of the full layout: about 1.3 ms. The same seven
queries called from one large function cost about 14 B per call (argument boxing in the caller).

**Sim cost of core + stubs**: `simMs + updateMs` median 0.003 ms over the walk (timer
resolution; the target was 1.0 ms); worst tick inside an encounter volume 1.7 ms (first-call
JIT, `enc_street`).

**Bake timings** (round 2; CPU, 20 threads; the fixture room re-sized through an overlay,
`scratch/pipeline-fix-r2/lm1024.json` / `lm2048.json`; a 4 412-triangle prop,
`scratch/pipeline-fix-r2/buried.py`):

| Bake | Samples | Time |
|---|---|---|
| lightmap 1024² | 64 spp + OIDN | 7.5 s (its light layer 9.6 s); shipped WebP 239 kB |
| lightmap 2048² (the size of `lm_surface`) | 64 spp + OIDN | 44 s (layer 41 s); shipped WebP 862 kB; the whole zone build 90 s |
| AO to vertex colour, 4 412 triangles | 64 / 256 spp | 0.035 / 0.042 s (a 2 500-triangle prop is under 0.03 s) |
| vertex light, the same prop | 64 / 256 spp | 0.041 / 0.050 s; the room's 2 348 faces at 256 spp 0.5 s |

Recommended sample counts: 64 spp + OIDN for lightmaps and light layers, 64 spp for vertex AO,
256 spp for the final vertex light (also in `blender/lib/README.md`). These are for one closed
6 × 4 m room: the time follows the atlas size, but an open exterior with a real sun, 50 000
triangles and embedded props has not been baked by anyone yet.

**Pipeline**: full placeholder build 8.9 s; no-op 0.15 s; one script-built asset 0.5 s;
`public/assets` 1,489,668 bytes in 102 files; six final shared textures 248.4 kB as WebP;
12-bit `COLOR_0` worst error 1.30e-4 (limit 2.44e-4); greybox GLB vertices within 4.00 mm of
the runtime colliders in all seven zones, every nav node within 2 cm; a clip authored at
0.300 s finishes at the manifest's 0.32 s.

**Memory by checkpoint** (textures + render targets, MiB, Low / High at 960 × 540): surface
42.8 / 54.4; at `cp_tally_hatch` with the seam stage 46.8 / 58.4; underground 35.5 / 47.2;
coda 23.5 / 35.2. `textureBytes` is the manifest's figure; `renderTargetBytes` is the tier's
per-pixel figure, not buffers the stub really allocates.

## 7. Evidence (`shots/foundation/`, every image opened)

| File | What it shows |
|---|---|
| `title_low.png`, `title_high.png` | the title plate over the gully greybox (byte-identical: the stub renderer has one look) |
| `cp_01 … cp_17_<checkpoint>_low.png` | each checkpoint: orange rock of the lip, tan street and yard with placeholder prop boxes, the dark Tally House with the hatch, the pale gallery / hall / bore with the Windlass ring and three glow marks, the rim |
| `cp_…_high.png` | **byte-identical to the Low frames** (checked with `cmp`, all 17); only the memory figures differ between tiers |
| `overlay.png` | the perf overlay: tier, ratio, the controller's target interval, per-system ms, draw calls, triangles, memory, cell and its bound, heap (regenerated and opened in round 1) |
| `viewer_reference_asset.png` | `fixture_crate_panel` (the pipeline's reference asset) in `sandbox/viewer.html` through `?overlay=`: `[final]`, 2469 / 4200 triangles, framed under the panel, plank and panel detail from the trim sheets, dark decals cut by `tx_mask` (as in the Cycles sheet), `materials  m_frontier:tx_frontier_trim  m_prop:tx_palette  m_pellam:tx_pellam_trim  m_mask:tx_mask`, both nodes labelled (regenerated and opened in round 1) |
| `shots/core-fix-r1/viewer_fixture_stool.png`, `viewer_fixture_crate_panel.png`, `viewer_fixture_room.png`, `viewer_ia_bore_door.png` | round 1, all opened: an `m_prop` asset in its palette brown (not near-white); the crate and panel; the fixture room (dark teal walls; its floor z-fights the viewer's ground plane, so the floor reads as stripes); a placeholder with its labels clear of the panel and `(placeholder: no textures)` |
| `viewer_template_asset.png`, `ia_ammo_box_game.png`, `ia_ammo_box_sheet.png`, `ia_ammo_box__dispense.png` | the ammo box as a placeholder, then built from the template script (viewer, 8-view sheet, clip strip) |
| `viewer_zone.png` | `?zone=plenty_street`: 12 calls / 72–78, 848 tris / 112381 (round 2; regenerated, not re-opened: `shots/core-fix-r2/viewer_zone_street.png` is the same page and was opened) |
| `sandbox_<piece>.png` × 6 | the scaffold page of each code piece (byte-identical to each other: all stubs); regenerated in round 1, not re-opened |
| `example.png` | the frame written by the example script |
| `shots/core-fix-r2/door_hatch_open.png`, `door_hatch_closed.png`, `door_yard_gate_open.png`, `door_yard_gate_closed.png` | round 2, the two hatch frames and the closed gate opened: the hatch well with the peg stair visible, then covered by the pale steel hatch box; the yard gate's opening filled by a dark wood box |
| `shots/core-fix-r2/viewmodel_placeholder_16x9.png`, `_4x3.png`, `_21x9.png`, `viewmodel_placeholder_panel.png` | round 2, the 16:9 frame and the panel frame opened: the placeholder revolver (a box) lower right in first person; with the panel, `view  first person: 52 degree view-model pass`, the `muzzle` label at its tip, the clip buttons |
| `shots/core-fix-r2/viewmodel_placeholder_in_L1.png`, `_in_L4.png` | round 2, both opened: warm haze and sand ground with a dark violet-grey gun under L1; near-black blue with a dark teal gun and a green-teal ground under L4 |
| `shots/core-fix-r2/bider_placeholder_at_30m_L1.png` | round 2, opened: the placeholder Bider as a small dark figure on sand against the L1 haze at 30 m |
| `shots/core-fix-r2/ammo_box_shot.png`, `viewer_zone_street.png` | round 2, both opened: a `shot=1` frame with no panel, bar or UI log over the asset; the zone page under `?test=1` with `frame 12 calls / 72-78  848 tris / 112381` (it read 0 / 0 before) |
| `cp_03_cp_street_clear_low.png`, `cp_06_cp_tally_hatch_low.png` | regenerated and opened in round 2: the same greybox with the new colour response and a shut door visible in the far wall of the street; **the other regenerated frames of this folder were not re-opened** |

Also opened from the pipeline's folder in this pass (it had left them unopened):
`tx_pellam_trim.png`, `tx_sand_tiled.png`, `fixture_crate_panel_sheet.png`,
`greybox_the_gallery_sheet.png`, `fixture_crate_panel_viewer.png`.

## 8. What changed in the integration pass

- `package.json`: scripts `assets:placeholders`, `assets:status`, `check:assets`, `test:core`,
  `test:pipeline`, `evidence`; `validate` also runs `extract_contracts --check`.
- `tests/pipeline/index.js` (so `node --test tests/pipeline/` and `npm run test:e2e` include it);
  `.gitignore`: `tests/pipeline/fixtures/export/` and `…/public/`.
- `sandbox/viewer.ts`: `?overlay=<manifest>`; pipeline test (g) shows a fixture through it.
- `tools/check-glb.mjs`: final-art `collider_terrain` may have no triangle facing down;
  mutation test 20.
- `src/core/stubs/nullUi.ts`: a plain text plate for title, loading, pause and death (words
  from `story.json`). Before this the title screen was the bare greybox with no word on it.
- `src/core/loop.ts`: the heap figure is sampled on the first frame too (the overlay showed
  `heap 0.0 MiB` for its first half second).
- `tests/core/boot.test.mjs`: 0 synthesised when files exist. `tests/core/evidence.mjs`,
  `tests/core/example.mjs`.
- `docs/ARCHITECTURE.md` section 6 (collision constraints as built), 11 (test directories),
  11.1 (`assets=none`, `overlay`), new section 18; `docs/workorders/README.md` section 4.

## 8b. What changed in the round-1 fix pass (core half)

Sixteen findings from the fresh critics; each was reproduced first. The sentences for the
documents core does not own (ARCHITECTURE, the work-order README and three orders) are in
`docs/requests/foundation-core.md` section 5: **those documents were not edited**.

- **Adaptive resolution** (`quality.ts`): the target is the display's own frame interval, not a
  fixed 16.7 ms. The first 60 frames are measured; a steady 50 / 48 / 30 Hz cadence is checked once
  at the minimum ratio (load answers to resolution, a display does not) and adopted; samples are a
  median of five clamped to twice the target; the back-off resets after a probe that held; a
  demotion to `min` on a steady slow cadence is stored only once `min` is seen to help, and a cap
  that arrives in mid-session ends with the tier restored and nothing stored. Ten new unit cases:
  steady 20 / 20.83 / 33.33 ms stay Low at ratio 1 with nothing stored; a 50 ms frame every 10 s
  (and two in a row) costs nothing; a loaded 60 Hz title is not taken for 30 Hz; real starvation
  is still demoted and stored.
- **Respawn and stepping** (`debugHook.ts`, `tests/harness.mjs`): no tick while a flow job is
  pending; `ext.core.stepAsync / untilAsync`; the harness steps through them (section 3).
- **Input** (`input.ts`): entering `playing`, and `setGameplayEnabled(true)`, drop the edges
  gathered before; the real-time test asserts 0 shots after the start click, 0 after the resume
  click, 1 after a click in play.
- **`?stubs=`** (`src/main.ts`, harness `stubs`, `KEEP7_REAL` for the core tests); **one build
  directory per run**, and a boot that fails in seconds when the script cannot load.
- **Fallback material** binds the shared textures for final files (section 4); viewer framing
  and the `MISSING bake extra` line.
- **`dummyPlayer`**: the ledge probe is cast from above (a ray started inside the 0.3 m Tally
  House floor slab came out of its underside, and she was lifted 0.49 m onto the floor from the
  hatch stair); the height really gained by a step is checked; the ground snap goes through
  `resolveCapsule`, so she is never put down inside a ledge she is leaving; a jump.
- **`navPath`**: binary heap, a gate list per adjacency entry, no string keys; 6 to 12 times
  faster, a twelfth of the allocation; 400 pairs checked against a plain Dijkstra.
- **Stubs**: `nullEnemies` reports 26 pips and a count and guard per phase, `ext.enemies.setBoss`;
  `lineOfSight` calls are counted apart (`ext.core.collisionCounts`); `Sandbox.loadOverlay /
  activate`; `sandbox/core.html`; `ext.sandbox.room`.
- **Tests**: 183 unit (was 162), 51 browser tests in `tests/core` (was 43).

## 8c. What changed in the round-2 fix pass (pipeline half)

Nine findings from the round-2 critics, each reproduced first. Evidence: `shots/pipeline-fix-r2/`
(`stool_vlzone_game.png`, `prop_wagon_tipped_game.png`, `fixture_crate_panel_game.png`,
`fixture_room_game.png`: opened) and `shots/foundation-pipeline/fixture_room_game.png` (opened).

- **A prop its zone lights is stamped `AO`** (`export.bake_extras` / `stamp_bake`, `check-glb`
  `bakeExtras`): the 17 manifest assets with `bake: VL` and `placedBy: zone` carry unlit
  tint × AO × gradients in their own file and were shown at twice that in the viewer. The same
  stool built as VL + zone and as AO now ships byte-identical files. Placeholders of those props
  (and of `ia_proving_mark`) no longer halve their colour.
- **A mesh stamped `VL` must have been vertex-lit**: `vcol.bake_vertex_light` marks its objects
  (`vl_baked`; `vcol.mark_vertex_lit` for a script that writes light itself), `zone.merge_chunks`
  carries the mark through the join per face and marks a `VL` chunk mesh only when every object in
  it had it, and `export.check_scene` fails a `VL` mesh without it.
- **Script header**: the search for `blender/lib` ends at the filesystem root with a message and
  accepts both layouts; template, placeholders, fixtures, texture scripts and tools.
- **Buried vertices**: `vcol.bake_ao_vertex` and `bake_vertex_light` print
  `WARNING <object>: N faces … baked dark from end to end although they stand in the open` for
  faces longer than 0.25 m whose corners are all dark while 60 % of 16 rays from the face centre
  are free. It found the trap in two of our own worked examples (the stool's legs in the room, the
  crate's planks under their battens); both now add an edge loop.
- **`--reset <id>`** in `tools/build-assets.mjs` (section 4).
- **Bake timings and sample counts** (section 6, `blender/lib/README.md`).
- **The fixture room is lit by its lamp set** (emission 6 → 60): floor shade 23,58,52 and wall
  74,136,124 in the game shot (were 7,17,17 and 46,59,61).
- **Dressing empties in every dressed placeholder zone** (section 5).
- **`faces` arguments**: the one-argument `callable(polygon)` signature is stated in `uv`, in
  `mesh.delete_faces` and in the README; a three-argument lambda fails with a message that says so.
- **`lm_surface`**: `blender/env_exterior/README.md` describes the shared helper module; and a
  lightmap with a bake script of its own now gets a `.deps.json` from `bake.save_lightmap`, so the
  driver re-bakes it when the helper changes (before, only the two zones went stale).

Not done in this pass: see the two pipeline items added to section 9.

## 8d. What changed in the round-2 fix pass (core half)

Fourteen findings; each was reproduced first (a failing test, the critic's script, or a measured
frame). Core edited only its own files: the sentences for ARCHITECTURE, the work-order README and
the orders are in `docs/requests/foundation-core.md` (rows 9 to 23 of section 5, five of them
updated, and rows 24 to 31 of section 6). **None of them is applied.**

- **A new run resets the player** (`flow.ts`): section 3. Test: damage, spent ammunition and a
  changed seventh round, then quit + play; dead on the title, then play; `again` from the ending:
  each gives 100 HP, a full cylinder, the starting reserve, a save holding the fresh state, and
  she walks. The test fails without the fix (`40 !== 100`).
- **View-model space** (`basicRender.ts`): section 5. **The viewer's first-person mode, moods,
  sand ground, `project` and `coverage`** (`sandbox/viewer.ts`): section 4.
- **Colour** (`basicRender.ts`): no toe; section 4.
- **Harness** (`tests/harness.mjs`): the safe `stubs` default for `code-<slot>` pieces;
  `measureAlloc`. **Allocation test**: 3000 ticks of warm-up per path, a tick plus a frame asserted
  at 6 KB (was 12).
- **Hook** (`debugHook.ts`): the one-time warning when a synchronous step is cut short; clear
  errors for unknown tier, puzzle and encounter ids; `ext.core.setSeventh / tokens / damage /
  timeScale / playerExtra / ctx`.
- **Collision** (`collision.ts`): the wedge limit from 10° to 5° (`WEDGE_MIN`); the ledge lift
  measured and pinned. All 60 earlier collision cases and the random walks pass unchanged.
- **Stub world** (`nullWorld.ts`): shut doors are drawn (one instanced mesh).
- **Viewer**: `shot=1` hides the panel, the bar and the UI log; the zone page's frame line is
  written after the frame is counted.
- **`tests/core/index.js`** works copied to any depth.
- **Tests**: 185 unit (was 183), 59 browser tests in `tests/core` (was 51). No assertion was
  weakened; one was tightened (tick plus frame: 12 KB → 6 KB).

## 8e. What changed in the round-3 fix pass (core half)

Sixteen findings with owner "core"; the document ones (two of them wholly) were applied by the integrator in the same pass
(`docs/requests/foundation-r3-documents.md`). Core edited only its own files. Evidence:
`scratch/core-fix-r3/` (logs) and `shots/foundation-core/boot_no_webgl.png`, `viewer_shot_fitted.png`
(both opened).

- **Adaptive resolution raises the ratio again** (`quality.ts` `setViewport`): when the controller is
  not holding a back-off, the ceiling follows the new allowance, and a ratio that sat at the old
  allowance goes to the new one (960 × 540 → 1920 × 1080 → 960 × 540 ends at 1; `resolutionScale`
  1 → 0.5 → 1 ends at 1; High at device ratio 2 likewise). A ratio the controller lowered under load is
  kept through a resize and probes up to the new allowance. A probe now snaps onto its limit
  (0.6 + 4 × 0.1 was 0.9999999999999999: a 959-pixel buffer). Three unit cases.
- **`startServer` pins `NODE_ENV` per mode** and puts it back (one configuration at a time): section 3.
  Test: after a dev server, the build opened **without `?debug`** has no `window.__dbg`, a click starts
  the run and takes the pointer, a 404 on `env_plenty_street.glb` ends in the boot error and the line
  on the page; a dev server started after that build still synthesises under `?assets=none`. With the
  pin removed the test fails on its first line.
- **`tests/core` is independent of the six pieces** (`startServer({ pieces })`,
  `src/core/stubs/slots/`, `route.mjs` `PIECES`): section 2. Proven in a scratch copy of the tree with
  the critic's three broken lines appended to `src/enemies/index.ts`: `stubs.test.mjs` 15 of 15 and
  `sandbox.test.mjs` 21 of 21 (three failed before), and `KEEP7_REAL=enemies` in the same tree fails
  with `Failed to fetch dynamically imported module … src/enemies/index.ts`, as it should.
- **The run says what it loaded** (first line; section 2). Core did not make the plain command load a
  piece by itself: a run that picked up every module no longer a stub would break for everybody while
  one builder is mid-edit. The plain command says `NONE` and names the modules it did not load.
- **Boot failure on the page** (`debugHook.ts` `reportBootFailure`, `bootFailureText`): section 1.
  Tested with Chromium `--disable-3d-apis`, production and dev.
- **Hook arguments and NaN** (`debugHook.ts`, `math.ts`): section 3. The stub enemies ignore an unknown
  phase and return `''` for an unknown kind when called directly.
- **`tap` under the real-time loop** (`loop.ts`, `debugHook.ts`): section 3; tested on a dev page with
  its own loop (one tap of fire is one shot; 30 ticks of forward are 2.5 m and then she stops).
- **Stub world checkpoints**, **`clock.tick`**, **pointer lock**: section 5. The pointer-lock test makes
  the browser refuse (`requestPointerLock` rejected): title click → `playing` → `paused`; resume click →
  `playing` → `paused`, 0 shots; then granted: `playing`, locked, 0 shots; the next click is 1 shot.
- **Viewer**: `pose / setBone / setClip / framing`, the fitted shot: section 4.
- **Tone map** in `src/core/tonemap.ts`: section 4.
- **One dev server per process** (`tests/harness.mjs`): `startServer()` in dev mode returns a shared
  server for each `pieces` value and closes it with its last user. `node --test tests/<dir>/` imports
  every test file of the directory into one process, and ten Vite servers side by side made the first
  test of the run take 39 s instead of 6 (measured both ways, twice). The whole suite: 148 s → 105 s.
- **Allocation test** 42 s → 6 to 11 s by itself; the real-time tests on a small page with 90 s waits: section 2.
- **Playthrough** commits the event checkpoints the way play does (`CHECKPOINT_ACTS`): the assertions
  (every checkpoint saved exactly once, in order) are unchanged.
- **Tests**: 198 unit (was 185), 68 browser tests in `tests/core` (was 59). No assertion was weakened.

## 9. Known gaps

**Cannot be verified on this machine**
- Anything about a real GPU: frame rate, the benchmark thresholds, the renderer-string
  classifier, the adaptive-resolution controller on real frame times (unit-tested on synthetic
  ones; under headless Chromium it sees a steady 16.7 ms and does nothing). The round-1
  controller has more judgement in it than the one it replaces and none of it has seen a real
  display: the cadence test (three frames in four within 6 % of the median, the median within 4 %
  of 20 / 20.83 / 33.3 ms), the one look at the minimum ratio on the title screen (a visible
  half-resolution second on a 50 Hz or capped display), and the rule that a GPU held at a steady
  vsync multiple at every ratio and tier is treated as a capped display (it ends at full quality
  and 30 fps instead of at `min`). R8 upload on real drivers (measured on SwiftShader only; an RGBA fallback exists and
  is counted at 4×).
- Pointer lock: lock loss → pause → click to resume is exercised headless
  (`document.exitPointerLock()`), and since round 3 a refusal too, but a simulated one (the test makes
  `requestPointerLock` reject; the raw-then-plain order on a browser without promises is unit-tested with
  a fake DOM). Chrome's real 1.25 s cooldown after `Esc` has not been seen. A refusal that arrives while
  the game is on the title (nothing asks for the lock there) or dead is not acted on.

**Stubs that are not the game**
- `basicRender` has one look: Low, High and `min` frames are pixel-identical. No sky, fog
  tuning, lamps, VFX, outlines, post-processing; moods only as the viewer's opt-in flat tint
  (section 4), which nothing checks against the real mood table beyond "L4 is darker and bluer
  than L1"; `m_mask` samples no mask texture;
  `renderTargetBytes` is a table figure. "Recreate the renderer once when the boot lands on
  `min`" (8.5 step 3) is not implemented: it is the render owner's renderer.
- `nullWorld`: doors switch instantly (no travel, no `ajar`) and are drawn as plain boxes, no puzzles, story, encounters,
  pickups, focus ray or hints; rides start by proximity to the lever (3.2 m); place checkpoints commit
  by proximity (1.6 m), the others on their event (section 5). It never calls `enemies.startBoss` by
  itself when she walks into the bore: a test of a boss phase beside the stub world sets the phase
  (`__dbg.setBossPhase`). Its `collider_terrain` path (a sculpted sheet replacing the lip's
  terrain solids) has never run: the path is skipped for placeholders and `env_the_lip` is one.
- `nullUi` is a text plate and an event log; no HUD, menus, options screen or readables.
  `nullAudio` logs cues; `nullEnemies` are capsules that fall to one shot.
- Budget numbers are for boxes. No final art has been measured against a cell bound.

**Untested or soft in the foundation itself**
- `KEEP7_REAL=<slot>` (a piece's system beside five stubs in the core tests) has only ever run
  against modules that wrap the stubs. Which assertions of boot, flow, walk, seam, determinism,
  alloc, budget and playthrough are stub-specific is not known; expect requests in phase 3.
- Core tests the six piece-owned sandbox pages only for booting and drawing a frame.
- The dummy player's jump has no coyote time, buffering or air control, and the snap keeps her
  on a ledge's edge until she is clear of it (a 0.15 m slab is left in a step, not a fall).
- `sightRays` (the `lineOfSight` share of `collision.stats.rays`) is a field of the engine beside
  the contract; the contract's `stats` is unchanged.
- The viewer's `MISSING bake extra` line has no test of its own (no final asset lacks the extra).
- The fallback's textures are drawn only for final files; nothing checks them against a
  reference image (the crate and stool shots were compared by eye with the Cycles sheet).
- "One texture upload per frame while playing" runs in the real-time test but no test asserts
  the spacing.
- A zone rebuild triggered by a changed embedded prop (`deps.json`) is implemented, not tested.
- A manifest node or clip missing from a real file is a `console.error` plus a stand-in, not a
  throw (the harness and `check-glb` both fail on it).
- The viewer's first-person mode has only been seen with the placeholder revolver (a box). The
  `coverage()` figure counts the view-model pass drawn alone, so it cannot say what the HUD ring
  covers; the 4:3 / 21:9 "anchored to the right" rule of `code-render` 4.4 is not implemented in
  the stub (the 52° camera simply takes the canvas aspect).
- The new-run reset relies on `player.captureSave()` after `start()` being a fresh-run state and
  on `applySave` being safe on the title; true for the stub, a requirement on `src/player`
  (request row 24) that nothing can test until it exists.
- The one-time warning of `__dbg.step` is per page; a script that loses ticks twice is told once.
- In round 2 one background run of `node --test tests/core/` reported every test failed within
  milliseconds and then hung until it was killed (the first test failed after 237 ms). It
  coincided with `tests/core/index.js` being rewritten and with vitest runs in the same tree; the
  cause was not found, and the full runs afterwards passed 59 of 59.
- Wedges under 5° still squeeze the capsule 2–3 cm (documented limit; none in the layout).
- `measureAlloc` warms each path for 3000 ticks. A piece that measures a tick **plus a frame** should warm
  it on a small page as `tests/core/alloc.test.mjs` does (`page.setViewportSize` 96 × 54, then back), or
  pay 30 to 50 s of software rasteriser per measurement.
- The real-time tests (`stubs.test.mjs`: four pages that run their own rAF loop) depend on the machine
  being able to draw frames at all. In round 3 one run on a machine at load 28 drew 128 ticks in 200 s
  and timed out at 20 s; they now draw 320 × 180 and wait 90 s, and passed in every later run, but a
  starved machine can still fail them. They are the only tests in `tests/core` that wait on real time.
- The boot-failure line is English text in `src/core/debugHook.ts` until `story.json` has `ui_no_webgl`
  and `ui_boot_failed` (requested: `docs/requests/foundation-core.md` section 7). A failure after boot
  (a render error in the loop, a lost WebGL context) is still only a console line.
- `state()` reports a non-finite number only when somebody calls `state()` / `hash()` / a path
  condition; nothing watches a production page. A system whose `debugState()` legitimately holds
  `Infinity` (none of the stubs does) must send a finite value or `null`.
- The viewer's shot fit uses the bounding box of the rest pose: a clip that reaches far outside it
  (`&clip=&t=`) can touch the frame's edge; pass `&dist=`.
- `KEEP7_REAL` aliasing is by path (`src/<slot>/index.ts` as imported from `src/main.ts` and
  `sandbox/<slot>.ts`): a page that imports a piece's inner file directly (`../src/player/weapon.ts`)
  loads it whatever `pieces` says.
- Collision: zero allocation is a steady-state property (after V8 warm-up) and depends on the
  caller being small enough for V8 to inline the wrapper; no swept queries (a body at 60 m/s in
  a slot narrower than itself under a 5 cm ceiling is pushed through; the same room holds at
  12 m/s); a capsule deeper than one radius inside a solid is not rescued (`capsuleFree`
  reports it); the engine reads `bvh._roots`, an internal of three-mesh-bvh 0.9.15, and throws
  at `setStatic` if that layout changes.
- Pipeline: all 219 public functions of `blender/lib` are now called by a script a test runs
  (`tests/pipeline/lib.test.mjs`; the tracer does not see calls a library module makes to names it
  imported directly), but "called once with a checked result" is not a proof of correctness for
  the rarely used ones (`bake.bake_normal`, `bake.torus_coords`, `rig.auto_weights` on a real
  creature); bake timings (section 6: 1024² 7.5 s, 2048² 44 s, vertex bakes under 0.05 s) were measured on the
  6 × 4 m fixture room and one prop only, never on an exterior zone; texture quality (plank grain
  subtle, `card_dowser` a first pass) has not been seen by a critic. Placeholder sockets and
  skeletons of the revolver, Bider, Transit, Tamper and Windlass now sit where the art orders put
  them and ride their bones, **from a table in `blender/placeholders.py`, not from the manifest**
  (request 8 in `docs/requests/foundation-pipeline.md`: `nodePos` / `nodeParent`; `canister_muzzle`
  is a guess, and the Windlass lamp sets are still two rows of quads on the drum face, not at the
  mouths and the gauge housing); other props' unplaced empties sit on the placeholder's front
  face. Staleness tracking sees imported project modules only (a helper read as data needs
  `--force`). `check-glb` uses approximations (dressing triangles from `triBudget`, a 0.75 m
  chunk-box tolerance) and tells variant nodes from always-drawn meshes by a naming rule (a
  manifest `nodes` name that is a plain mesh and not a lamp set, drawn or code-driven node).
  Trim rows have no gutter (documented: `uv.map_to_trim(inset_px=)`). (The zone page of the viewer
  wrote no frame counters under `?test=1`; fixed in round 2.) `preview-asset --zone --game` burns in `__dbg.perfRun`.
  In the fixers' round, `tests/core` seam / walk failed (a 0.5–0.9 m fall on the peg stair at
  x −91.9, z −33) identically with `?assets=none`, so not from the asset files; the core fixer was
  editing `src/core` at the time. (Core fixer: that was an intermediate version of the dummy
  player's ground snap, which refused to snap on a slope; fixed before the end of the round. The
  final run is 51 of 51 in `tests/core`, 112 of 112 in `npm run test:e2e`.)
- Pipeline, round 2: the buried-vertex warning is a heuristic (it reports faces over 0.25 m whose
  corners average under 0.35 AO, or under 5 % of the bake's bright light, with an open centre; a
  short part, or one whose buried faces total under 0.02 m², is not reported; a warning does not
  fail the build and is only in the log / `--verbose`). The `VL` mark is per object: a script that
  vertex-lights an object with `faces=` restricted to a few faces marks the whole object, and
  `check-glb` does not look at `vl_baked` in a shipped file. Placeholder dressing is one bottle,
  crate or barrel per empty at mechanically chosen spots (nothing checks sight lines or cover), no
  empty carries `wind`, and no code has instantiated them yet. The shared-atlas recipe for
  `lm_surface` is written down, not built: no script has produced two zones and one bake from a
  helper module. `placeholder_*` and `greybox_*` images in `shots/foundation-pipeline/` predate
  round 2 and were not regenerated (the zone-lit props look the same; the empties are invisible).
- Of the pipeline's 52 evidence images, about 20 have been opened by a person or agent (14 by
  its builder, 5 more here); the rest were generated without error and not looked at.

**Open for other owners**
- Level owner: `gl_shaft_wall_w` and neighbours poke 0.5 m out of `chunk_gl_stair`'s box, which
  is why the chunk-box tolerance is 0.75 m instead of 0.25 m. `design/*.json` was not edited.
- World owner: finish a set swap in the same tick when `assets.isActive()` is already true
  (ARCHITECTURE 18), or scripted walks stop with reason `state`.
- Render owner: draw only chunk meshes, `drawnNodes` and plugs of a zone GLB.
- **Integrator: applied in round 3** (`docs/requests/foundation-r3-documents.md`; the paragraph is kept
  for the record of what was open). The document texts of `docs/requests/foundation-core.md`
  rows 9 to 31 (ARCHITECTURE 3.5, 6, 7.2, 8.5, 8.6, 9, 10.2, 11.1 to 11.3, 18 and the
  `SceneRoots.viewModel` comment of the contracts block; work-order README 2, 3, 4 and 7; the
  definition-of-done line of the six code orders; `code-player` 4.1 and 4.7, `code-render` 4.3,
  4.4 and 5, `code-enemies` 179, `code-ui`, `code-world`, `art-weapons` 5 and 6, `art-enemies`
  139) were unapplied through two rounds; the orders now name this report, `KEEP7_REAL`, the
  view-model rule, the ledge numbers and the viewer's first-person mode. Core did not verify every row
  in the orders (they are not core's files).
- Story owner: `ui_no_webgl` and `ui_boot_failed` in `design/story.json` (`docs/requests/foundation-core.md`
  section 7); until then the two lines of section 1 are core's own English.
- Tone map: **ruled** in round 3 (shoulder only, knee 0.8, `src/core/tonemap.ts`). Open for the render
  owner: nothing checks `src/render` against it until that renderer exists; its order asks for the
  palette test on all three tiers.
- No git commits were made.
