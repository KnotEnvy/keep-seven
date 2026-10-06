# Work order: `foundation-core`

Phase 2 (foundation), built **first**, before `foundation-pipeline` and before any production
piece. You are a fresh agent: this file plus the documents it names are everything you need.

Read first, in this order: `CLAUDE.md`, `docs/PLAN.md`, `docs/workorders/README.md`, then
`docs/ARCHITECTURE.md` **in full** (it is your specification: sections 1–6, 8.5, 8.6, 9, 10,
11, 12, 13 are yours to implement), then `docs/research/tech-web.md` (verified code patterns
for r186: loop, input, BVH queries, Vite setup, tests; its "Traps" list is mandatory reading).
Skim `docs/GDD.md` 5, 12, 15, 18 and `docs/LEVEL.md` 0 for the data you index.

## 1. Mission

Everything the twelve production pieces stand on. After you finish: the game compiles, boots
to a title, starts a run in a **greybox of the real layout**, and a bot can walk the whole
552 m critical path by input through both lift rides and the peg-stair seam, on three render
tiers, deterministically, with measured budgets. Every other module exists as an inert stub
with its final interface, so twelve builders can work in parallel without touching each other
or you. Pillar served directly: **5 (60 fps on integrated graphics)**: the loop, the
zero-allocation collision engine, the quality manager, the perf monitor and the budget tests
are how that pillar is enforced rather than hoped for. `src/core/` is **frozen** when this
phase closes; get the contracts right.

## 2. Owned files (exclusive)

```
package.json                 one edit only: "type": "module" + the scripts of ARCHITECTURE 2. No dependency changes.
index.html  vite.config.mts  tsconfig.json  vitest.config.mts (if needed)
src/main.ts
src/core/**                  the file list of ARCHITECTURE 1 exactly:
  contracts.ts (generated: node tools/extract_contracts.mjs)  context.ts  events.ts  loop.ts  clock.ts  rng.ts
  state.ts  input.ts  options.ts  save.ts  perf.ts  data.ts  assets.ts  collision.ts  greybox.ts  quality.ts
  debugHook.ts  perfOverlay.ts  math.ts  pool.ts  interp.ts  sandbox.ts  flow.ts (boot / run / death flow; see 4.4)
  stubs/basicRender.ts  nullAudio.ts  nullUi.ts  dummyPlayer.ts  nullEnemies.ts  nullWorld.ts
src/{player,enemies,render,world,ui,audio}/index.ts   INITIAL stub only (see 4.9); ownership passes to the piece in phase 3
sandbox/viewer.html  sandbox/viewer.ts                 the shared asset and zone viewer (yours for good)
sandbox/{player,enemies,render,world,ui,audio}.html + .ts   INITIAL scaffold only; ownership passes to the piece
sandbox/sandbox.css                                    shared look of sandbox pages (yours)
tests/harness.mjs            frozen after this phase
tests/core/**
docs/requests/foundation-core.md   your change requests to other owners
shots/foundation-core/       evidence
```

Do **not** edit: `design/*.json`, `docs/*.md` (except your request file), `tools/gen_*.mjs`,
`tools/validate_*.mjs`, `tools/layout_geom.mjs`, `tools/blender.sh`, `tools/browser.mjs`,
`blender/**`, `public/**`. `tools/` scripts for assets belong to `foundation-pipeline`.

## 3. Inputs

| Input | Use |
|---|---|
| ARCHITECTURE 5 (the contracts block) | `src/core/contracts.ts`, verbatim, by `node tools/extract_contracts.mjs`; `--check` runs in a test |
| ARCHITECTURE 3.1–3.6 | composition root, lifecycle, loop, state machine, who-calls-whom, the seam rules |
| ARCHITECTURE 6 | collision engine and its implementation constraints |
| ARCHITECTURE 8.5, 8.6 | quality manager, perf monitor, overlay |
| ARCHITECTURE 9, 9.1, 9.2 | `data.ts`: `bindings`, `placement`, `nodeRest`, `zoneAt`, `cellAt`, `navPath` |
| ARCHITECTURE 10 | save, input mapping, options |
| ARCHITECTURE 11, 12 | debug hook, harness, the required tests, sandboxes |
| `design/layout.json` (v2: 7 zones, 306 solids, 263 markers, 472 nav nodes, 1031 links, 2 portals, 6 encounters) | bundled JSON; `tools/layout_geom.mjs` holds the solid conventions (box / ramp with `rise` + `skirt` / cylinder with `innerRadius`): import or port it, do not re-derive |
| `design/assets.json` (84 assets, 18 textures, 12 cells, 4 stages, 3 tiers) | asset store, quality tiers, budgets, visibility cells |
| `design/story.json` (152 lines, 10 readables, 17 objectives, ui strings) | `data.line/ui`; the debug overlay |
| `docs/research/tech-web.md` 1, 2, 4, 8, 9, 10, 11 | verified r186 code: renderer flags, GLB + meshopt loading, BVH direct-array queries, adaptive resolution, loop, input, Vite/TS config, the test hook |
| `tools/browser.mjs` | `launchBrowser()`; the only way a browser is started |

## 4. Deliverables (checklist; every box is judged)

### 4.1 Project setup
- [ ] `package.json`: `"type": "module"` and scripts `dev`, `typecheck`, `build`, `test:unit`, `test:e2e`, `validate`, `assets` exactly as ARCHITECTURE 2.
- [ ] `vite.config.mts`: `base: './'`, `publicDir: 'public'`, `server: { host: '127.0.0.1', port: 0, strictPort: true }`, `optimizeDeps: { noDiscovery: true, include: [] }`, `build: { target: 'es2022', assetsDir: 'js', assetsInlineLimit: 0 }`, single input `index.html`.
- [ ] `tsconfig.json`: the strict flag list of ARCHITECTURE 13, `include ["src","sandbox","tests"]`. `npx tsc --noEmit` clean over the whole tree.
- [ ] `index.html`: one `<canvas id="game">`, one `<div id="ui">` overlay root, no inline text (strings come from `story.json`), a minimal CSS reset. Parses the URL parameters of ARCHITECTURE 11.1 into `RunFlags`.
- [ ] three addons imported only as `three/examples/jsm/<path>.js`.

### 4.2 Core services (each is the implementation of its interface in `contracts.ts`)
- [ ] `events.ts` `EventBus`: synchronous, subscription order, a throwing handler is caught, reported with `console.error` once per handler and does not stop the others; `emit` allocates nothing; dev/test mode records every event into the debug ring (4096, clones).
- [ ] `clock.ts` `GameClock`: `tick`, `simTime`, `unscaledTime`, `timeScale`, `frame`, `alpha`; `slowMotion(scale, realSeconds, reason)`: lowest active request wins, durations in unscaled seconds, no-op with `options.reduceMotion`, emits `time/scale`.
- [ ] `rng.ts` mulberry32 with `fork(label)` (same label, same stream for a seed), `state`.
- [ ] `loop.ts`: the frame and tick pseudocode of ARCHITECTURE 3.3 exactly (`FIXED_DT` 1/60, `MAX_STEPS_PER_FRAME` 5, backlog dropped, order player → enemies → world → render → audio → ui for all three phases, `handlePause`). Not started when `flags.test`.
- [ ] `state.ts` `GameStateMachine`: the table of ARCHITECTURE 3.4; `request()` returns false for anything else; every transition emits `game/state`; `simRunning` true in `title`, `playing`, `dead`, `ending`.
- [ ] `input.ts` `Input`: ARCHITECTURE 10.2 exactly (codes, latching `pressed`/`released` per tick, `consumeLook`, raw pointer-lock request then fallback, release-all on blur / visibility / lock loss, deltas above 400 counts dropped, `preventDefault` rules, `Mouse2` context menu suppressed, `captureNextCode`, `inject*` through the same path, `setGameplayEnabled`). Emits `input/pointer_lock`.
- [ ] `options.ts` `OptionsStore`: defaults of GDD 15 (sensitivity 1, invertY off, fov 62, headBob 1, screenShake 1, reduceMotion off, reduceFlashes off, subtitles on, size M, background 0.6, captions on, difficulty normal, sprint hold, fire click, bindings of ARCHITECTURE 10.2, crosshair size 1 / `#ffffff` / outline on, hints normal, graphics auto, resolutionScale 1, volumes 0.8 / 1.0 / 0.7); `localStorage['keepseven.options.v1']`, merged, clamped, unknown keys dropped; `options/changed` per key.
- [ ] `save.ts` `SaveStore`: one slot `localStorage['keepseven.save.v1']`, version check, in-memory in test mode unless `?persist=1`.
- [ ] `data.ts` `GameData`: JSON imports cast to the contract types; O(1) id maps; `zoneAt` (highest `priority` among zones **of the given set**), `cellAt` (first cell of the zone whose box holds the feet, else the zone's box-less cell), `bindings(marker)` in the one lookup order of ARCHITECTURE 9.1, `placement` (`pos = marker.pos + R·offset·scale`, `rotYRad = rad(rotY) + π`, `space: 'world'` → identity), `nodeRest`, `navPath` (A* over `nav.links`, optional `openOnly` against `world.doorState`), `encounter`, `line`, `ui`. Throws on unknown ids in test/dev mode.
- [ ] `assets.ts` `AssetStore`: manifest-driven `prefetch / activate(set, only?) / release / isActive / get / instantiate / texture / clipSeconds / setMaterialResolver`. GLTFLoader + `MeshoptDecoder`; textures as WebP with `flipY = false`; R8 upload (`RedFormat`) for `format: 'r8'` with the RGBA fallback measured and reported (ARCHITECTURE 8.4, 15); lightmaps without mips, `channel = 1`; one texture upload per frame while `playing`; instance pools; `SkeletonUtils.clone` for any asset whose file contains a `SkinnedMesh` (**decide by the file**: the manifest's `skinned` flag agrees for final art (18 multi-part props are rigid-skinned, `skinned: true`, bones `root` + their moving parts), but a synthesised or early placeholder may differ); a name listed in both `nodes` and `bones` is the bone; `node(name)` must find a manifest name whether it is an empty, a bone or a mesh node; `AssetInstance.node()` accepts only manifest `nodes` / `bones` and throws otherwise; `action()` presets `timeScale` so a clip lasts exactly the manifest's `seconds`; tracks targeting `codeDriven` bones are stripped at load; `isPlaceholder` from the root extra `placeholder: true`. Fallback material resolver: unlit vertex colour. **Missing-file fallback (so you do not depend on the pipeline):** when a manifest file returns 404 in dev/test mode the store synthesises the placeholder itself from the manifest entry (`placeholder.shape/size/anchor`, every `nodes` name as an empty at its `nodePos`, lamp-set nodes as `lampCount` quads with the index in UV1.x, every clip as an empty clip of the manifest's length, flat colour by category) and, for zone assets with `placeholder.source = "layout-solids"`, the greybox of that zone from `greybox.ts` split into the chunk meshes `<chunk id>__<material>` of the manifest's chunk plan plus its `drawnNodes`. `isPlaceholder` is true for these. In a production build a missing file is a thrown load error.
- [ ] `greybox.ts`: `buildSolidColliders(layout, zones, residentSet)` → positions, per-triangle surface / flags / solid index (every `LayoutSolid` flag mapped to its `ColFlag`: `pierce`, `grille`/`skipsShots` → `GRILLE`, `low`, `stunsCharge`, `blocksBossFire`, `invisible`, `playerOnly` → `BODY_ONLY`); a solid is live when its zone is in `zones` or its `sets` contains `residentSet`. `buildSolidMeshes(...)` for the greybox look (coloured by surface, lit by a fixed key so slopes read). Under 5 ms for the full layout.
- [ ] `collision.ts` `CollisionWorld`: every method of the interface, **zero allocation per query**, implemented as ARCHITECTURE 6 "Implementation constraints" (one Float32 + one Uint32 array, `MeshBVH` without `indirect`, `shapecast` with callbacks created once, per-triangle data through the vertex index, one pooled `ExtendedTriangle`; flat typed arrays for ≤ 64 boxes and ≤ 256 volumes). Behaviour that must hold: walkable normals push straight up; `resolveCapsule` reports `wallFlags`; one hit per entity (highest `priority` volume); `raycastAll` sorted near to far, ≤ `MAX_LINE_HITS` 16, never decides stopping; `BODY_ONLY` triangles invisible to rays and `lineOfSight`; `setSolidEnabled`; `volumeCentre`; `segmentHitsCapsule`; `stats`.
- [ ] `quality.ts` `QualityManager`: ARCHITECTURE 8.5 steps 1–7 (URL → option → stored demotion `keepseven.tier.v1`; renderer-string guess; `render.benchmark()` thresholds 0.6 ms / 4 ms; adaptive pixel ratio with EMA against 16.7 ms, 15 % over → `ratio × sqrt(target/ema)` in 0.1 steps, doubling back-off, 180 good frames → probe up, 30-frame cooldown; demotion after 5 s at the minimum; test mode: no detection, no adaptation, `low`, ratio 1). `features` per tier from `assets.json` `tiers` and ARCHITECTURE 8.2. Emits `quality/changed`.
- [ ] `perf.ts` `PerfMonitor` + `perfOverlay.ts` (F3 or `?perf=1`): every `PerfStats` field, per-system ms, the current cell and its computed bound from `assets.json`, tier caps, a 120-frame bar, red when over.
- [ ] `math.ts`, `pool.ts` (fixed-capacity pools with swap-remove), `interp.ts` (previous/current transform pairs with `snap()`).

### 4.3 Composition root and context
- [ ] `context.ts createContext({ canvas, uiRoot, flags })`: builds every service and puts the six inert stubs in the system slots. `SceneRoots`: `scene`, the one `camera`, groups `world`, `dynamic`, `fx`, `viewModel`.
- [ ] `src/main.ts` exactly as ARCHITECTURE 3.1 (factories in any order, `orderSystems`, `init` awaited in `SYSTEM_ORDER`, `boot`, `startLoop`, `installDebugHook`).

### 4.4 Flow (`flow.ts`): boot, run, death, checkpoint (producer ruling: core runs these sequences)
- [ ] **Boot:** state `boot` → emit `load/progress` → `assets.prefetch/activate('always')` and `('surface')` → `await world.buildSet('surface')` → tier detection (`render.benchmark()` when not in test mode) → `start()` on every system → `render.warmUp()` → state `title`. With `?cp=` or `?autostart=1` continue straight into a run.
- [ ] **`ui/action`** is the one request path from the UI: `play` → `save.clear()`, emit `game/new_run`, `loading`, `await world.beginRun(null)`, `playing`; `continue` → `loading`, `await world.beginRun(save.readStored())`, then the restore trio below, `playing`; `resume` → `playing`; `restart_checkpoint` → `loading`, restore, `playing`; `quit_to_title` → `title` (`enemies.clearAll()`, `world.beginRun` is not called until the next play); `again` → as `play`.
- [ ] **Checkpoint:** on `checkpoint/reached` call `captureSave()` on player, enemies, world; build `SaveData { version: 1, checkpoint, tick, … }`; `save.commit`; emit `checkpoint/saved { id, movement, section }` (`movement` = 1-based index of the checkpoint's zone in `layout.zones`; `section` = 1-based ordinal of the checkpoint among that zone's checkpoint markers).
- [ ] **Death:** on `player/died` → state `dead`; 0.6 s + 1.2 s later (unscaled ticks): `await world.restoreCheckpoint()` (through `loading` when the resident set must change, in place otherwise), then **the restore trio in this order: `enemies.applySave`, `world.applySave`, `player.applySave`**, emit `player/respawned`, state `playing`. Control is back within 3.0 s of the fatal tick when the set does not change (test it).
- [ ] The debug hook's `start()` and `checkpoint(id)` use the same paths (`checkpoint` = `await world.warpToCheckpoint(id)` then the trio).

### 4.5 Debug hook (`debugHook.ts`): the whole `DebugHook` interface, version 2
- [ ] Every method, implemented against the contracts only (delegation table of ARCHITECTURE 11.2): time (`step`, `stepUntil`, `setRealtime`, `seed`), flow, input (`setKeys`, `setActions`, `tap`, `look`, `setAim`, `aimAt`, `aimAtEntity`, `aimAtMarker`), **walking by input** (`walkTo`, `followPath`, `navPath` with the stop reasons `arrived / stuck / max_ticks / gate / portal / dead / state / no_path`; next node taken within 0.4 m, or 0.8 m when the node after is in line of sight; `stuck` after 45 ticks without 0.05 m; `followPath('critical')`), cheats, queries (`state`, `perf`, `perfPeak`, `perfRun`, `events`, `hash` = FNV-1a of `state()` without perf fields, `probe`, `capture`), `ext`, `ready`, `error` (first uncaught error or `console.error`).
- [ ] `state()` rounded to 1e-4, JSON-safe, stable key order.

### 4.6 Stubs (`src/core/stubs/`): final interfaces, minimal behaviour
Each implements its full `*System` interface and `debugState()`. They are what sandboxes run beside the one real system, so they must be useful, not empty.

- [ ] `basicRender`: creates the `WebGLRenderer` (WebGL2, flags of ARCHITECTURE 2), draws `scene` unlit with vertex colours and plain fog, then `scene.viewModel` in a second pass with a 52° projection and cleared depth; `material()` returns shared unlit vertex-colour materials by name (alpha-test for `m_mask`, emissive-looking for `m_emis`); `setVisible / unitVisible / zoneVisible` really toggle chunk meshes; `instances.*` really instance (one `InstancedMesh` per asset+node); `lamps.*` store masks; `vfx.*`, `setMood`, `setExposure`, `setLightLayer`, `setWrongFade`, `setEmissive`, `setOutline`, `setSky`, `addTrauma` are recorded no-ops (each call appended to a ring exposed in `debugState().calls` so other pieces' tests can assert "the flash was asked for"); `capture`, `collectStats`, `warmUp`, `benchmark` work.
- [ ] `nullAudio`: `unlock`, `unlocked`, `voices` 0, `recent()` returns the names of events it would voice (it subscribes to `weapon/fired`, `combat/hit`, `audio/cue` and logs `name@tick`), so "no bullet produces nothing" can be asserted before real audio exists.
- [ ] `nullUi`: a text panel (sandbox only) printing `story/line`, `story/card`, `story/caption`, `interact/focus`, `objective/changed`, `checkpoint/saved`, `ui/hint`; `visibleText()` reflects it; closes readables at once (`state.request('playing','readable_closed')`).
- [ ] `dummyPlayer`: a walk controller good enough for the walk tests (5.0 m/s, gravity 24, capsule 0.35 × 1.8, 3 sub-steps, step-up 0.35 m by lift-move-drop, slope limit 45°), a fly mode toggle for sandboxes, `teleport`, `setControl`, `setGodMode`, `applyDamage` (health only), a click-to-shoot ray that calls `HitReceiver.onHit` with 100 damage and emits `weapon/fired` + `combat/hit`, `debug` surface, `captureSave/applySave` with the floors of ARCHITECTURE 10.1.
- [ ] `nullEnemies`: `spawn` creates a capsule (placeholder asset) with a body hit volume that dies to one hit and emits `enemy/spawned`, `enemy/felled|died`; `startBoss` flips `boss.phase`; `debug.killAll`, `setBossPhase` work at that level; no AI.
- [ ] `nullWorld`: **the first real consumer of the seam rules** (ARCHITECTURE 11.4): `buildSet`, `stageZone`, `builtZones`, `zone`, `cell`, the visibility-cell evaluation → `render.setVisible`, doors as boxes with `doorState` and a debug force-open, the two rides as `nav.portals` teleports on `interact` at their `via` marker, `trg_hatch_close` / `trg_set_swap`, checkpoints by marker proximity (`checkpoint/reached`), `beginRun / restoreCheckpoint / warpToCheckpoint`, `debug` surface. No puzzles, no story, no encounters.

### 4.7 Sandbox scaffold and viewer
- [ ] `sandbox.ts createSandbox({ piece, systems, scene })`: context + loop + stubs for the slots not supplied, debug hook, `?test=1`, `?scene=`, a button bar helper, the perf overlay.
- [ ] `sandbox/<piece>.html/.ts` for the six code pieces: a page that boots with **all** stubs and one placeholder scene, so each builder starts from a running page.
- [ ] `sandbox/viewer.html`: `?asset=<id>` (the asset through the real asset store on a neutral ground under a chosen mood, manifest nodes drawn as labelled axes, lamp sets cycling, clip buttons with manifest versus authored seconds, triangles and draw calls against the budget, the placeholder flag) and `?zone=<id>` (the zone GLB with its lightmap textures applied by the fallback material, a walk camera on the real colliders, visibility cells toggle). Query `&shot=1&clip=<name>&t=<0..1>` renders one deterministic frame for art tests.

### 4.8 Harness and tests
- [ ] `tests/harness.mjs`: `startServer`, `openGame`, `withGame`, the `Game` object (`dbg`, `run`, `walkTo`, `followPath`, `step`, `until`, `state`, `perf`, `events`, `shot`, `shotSeries`, `pixel`, `close`), `assertBudget`, `comparePng`, exactly as ARCHITECTURE 11.3. OS-assigned port; one server per test file; `close()` throws on `__dbg.error` or any `console.error`.
- [ ] `tests/core/` (all run on the runtime greybox with placeholder assets and the stubs):
  `boot.test.mjs` (title and control on `min`, low, high) · `determinism.test.mjs` (two loads, one script, equal `hash()` and equal PNG; equal hash across tiers) · `imports.spec.ts` (the import rule of ARCHITECTURE 1) · `contracts.spec.ts` (`extract_contracts --check`) · `alloc.test.mjs` (600 ticks, ≤ 6 KB per tick with `--js-flags=--expose-gc --enable-precise-memory-info`) · **`walk.test.mjs`** (critical path by input, god mode, doors forced at each `gate`, both rides by `tap('interact')`: ends `arrived`, never `stuck`, `world.zone` never null, grounded or fallen < 0.5 m at every tick, distance within 5 % of 552.4 m) · **`seam.test.mjs`** (ARCHITECTURE 3.6 rule 8) · **`budget.test.mjs`** (`perfRun` at every visibility cell centre over eight headings with every conditional rule on; `assertBudget`) · `playthrough.test.mjs` (the skeleton of ARCHITECTURE 11.4) · `collision.spec.ts` (unit: every query, every flag, `raycastAll` order, one hit per entity) · `data.spec.ts` (bindings lookup order, placement for every row of the ARCHITECTURE 9.2 table, `zoneAt` on the seam) · `input.spec.ts`, `clock.spec.ts`, `state.spec.ts`, `options.spec.ts`, `save.spec.ts` · `validate.test.mjs` (`npm run validate` passes).

### 4.9 Module factory stubs
- [ ] `src/<module>/index.ts` for player, enemies, render, world, ui, audio: each exports exactly its `create…System` factory and returns the matching core stub. From phase 3 the file belongs to that piece, which replaces its body.

## 5. Definition of done (measured)

1. `npx tsc --noEmit`: 0 errors. `npm run test:unit` and `node --test tests/core/`: all pass. `npm run build` succeeds; JS bundle (gzip) reported.
2. `walk.test.mjs`, `seam.test.mjs`, `budget.test.mjs`, `determinism.test.mjs`, `alloc.test.mjs` pass and their numbers are in your report: walked distance, worst `textureBytes + renderTargetBytes` on the seam (must be ≤ 64 MiB on Low), per-cell draw calls and triangles, bytes allocated per tick, `simMs + updateMs` median over the walk (target ≤ 1.0 ms for core + stubs).
3. Collision micro-benchmark in `collision.spec.ts`: 1 000 `resolveCapsule` + 1 000 `raycast` against the full-layout static set allocate 0 bytes and average under 0.02 ms each (report the numbers).
4. `shots/foundation-core/`: `title_low.png`, `greybox_<zone>.png` for all seven zones (960 × 540, Low), `seam_flight1.png`, `overlay.png` (perf overlay on), `viewer_asset.png`, `viewer_zone.png`, `sandbox_<piece>.png` × 6. Open each one before citing it.
5. A one-page report: what is done, every gap, every place you had to interpret the architecture, the R8 upload verdict, anything you could not verify without a GPU.

## 6. Non-goals

No gameplay rules, no real rendering look (materials, sky, fog, post are `code-render`'s), no
sounds, no HUD, no puzzles, no AI, no Blender work, no asset tools (`tools/build-assets.mjs`
and friends are `foundation-pipeline`'s), no new dependencies, no gamepad.

## 7. Dependencies and how to work without them

- **No GLB or texture files exist when you start.** The asset store's missing-file fallback
  (4.2) makes you independent of the pipeline. When `foundation-pipeline` lands real
  placeholder files the same tests must still pass; that re-run is in its definition of done.
- Design JSON is final input. If you find an error in it, write
  `docs/requests/foundation-core.md` and work around it locally; do not edit it.
- The six stubs are your proof that the contracts are implementable. If a contract cannot be
  implemented as written, say exactly where in your report: the contracts block is changed
  only through `docs/ARCHITECTURE.md` + `tools/extract_contracts.mjs` by the integrator.
