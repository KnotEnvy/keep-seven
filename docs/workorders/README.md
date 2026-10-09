# Work orders: KEEP SEVEN, stage one

One self-contained order per build piece. A builder reads `CLAUDE.md`, `docs/PLAN.md`, this
file, **`docs/FOUNDATION_REPORT.md`** (the sections named in section 4, "Read first") and
**its own order**, then the document sections that order names. Orders quote the
numbers a builder needs; the source documents stay the authority, in this rank:
`CLAUDE.md` → `docs/GDD.md` → `docs/ARCHITECTURE.md` and `design/*.json` →
`docs/ART_BIBLE.md` (which yields to the two before it on names, nodes and budgets) →
these orders. If an order contradicts a source, the source wins and the order has a bug:
report it in `docs/requests/<your-piece>.md`.

## 1. The orders

| Phase | Order | Owner name in the manifest | Owns (exclusive) |
|---|---|---|---|
| 2 foundation | [`foundation-core.md`](foundation-core.md) | — | `src/core/`, `src/main.ts`, `index.html`, configs, `tests/harness.mjs`, `tests/core/`, `sandbox/viewer.*`, initial stubs and sandbox scaffolds |
| 2 foundation | [`foundation-pipeline.md`](foundation-pipeline.md) | — | `blender/lib/`, `blender/placeholders.py`, `blender/tools/`, initial `blender/tex/*.py`, asset `tools/*.mjs`, `tests/pipeline/`, every placeholder file |
| 3 art | [`art-env-exterior.md`](art-env-exterior.md) | `env_exterior` | `blender/env_exterior/`, `tests/art_env_exterior/`; 6 assets, `lm_surface`, `lm_rim` |
| 3 art | [`art-env-interior.md`](art-env-interior.md) | `env_interior` | `blender/env_interior/`, `tests/art_env_interior/`; 5 assets, 6 lightmaps / layers |
| 3 art | [`art-props.md`](art-props.md), piece **`art-props-mech`** | `props_mech` | `blender/props/mech/`, `tests/art_props/mech/`, `blender/tex/tx_mask.py`, `tx_palette.py`, `tx_palette_emis.py`; 28 assets, 24 clips |
| 3 art | [`art-props.md`](art-props.md), piece **`art-props-dress`** | `props_dress` | `blender/props/dress/`, `tests/art_props/dress/`; 29 assets, no clips |
| 3 art | [`art-weapons.md`](art-weapons.md) | `weapons` | `blender/weapons/`, `tests/art_weapons/`; the revolver (15 clips), 5 ammunition assets, `tx_gun`, `tx_matcap_steel` |
| 3 art | [`art-enemies.md`](art-enemies.md), piece **`art-enemies-bider`** | `enemies` (by file) | `blender/enemies/enemy_bider.py`, `bider*.py`, `tests/art_enemies/bider*`; the Bider (18 clips) and the three static Bider meshes |
| 3 art | [`art-enemies.md`](art-enemies.md), piece **`art-enemies-transit`** | `enemies` (by file) | `blender/enemies/enemy_transit.py`, `transit*.py` and one file per remaining asset (`proj_stake.py`), `tests/art_enemies/transit*` and per-asset tests; the Transit (10 clips), the stake |
| 3 art | [`art-boss.md`](art-boss.md), piece **`art-boss-windlass`** | `boss` (by file) | `blender/boss/boss_windlass.py`, `windlass*.py` and one file per remaining asset (`proj_canister.py`), `tests/art_boss/windlass*` and per-asset tests; the Windlass (9 clips), the canister |
| 3 art | [`art-boss.md`](art-boss.md), piece **`art-boss-tamper`** | `boss` (by file) | `blender/boss/enemy_tamper.py`, `tamper*.py`, `tests/art_boss/tamper*`; `enemy_tamper` (12 clips), `tamper_cold_static` |
| 3 code | [`code-player.md`](code-player.md) | — | `src/player/`, `sandbox/player.*`, `tests/player/` |
| 3 code | [`code-enemies.md`](code-enemies.md) | — | `src/enemies/`, `sandbox/enemies.*`, `tests/enemies/` |
| 3 code | [`code-render.md`](code-render.md) | `render` (textures) | `src/render/`, `tools/gen_fx_atlas.mjs`, `sandbox/render.*`, `tests/render/`; `tx_fx`, `tx_noise` |
| 3 code | [`code-world.md`](code-world.md) | — | `src/world/`, `sandbox/world.*`, `tests/world/` |
| 3 code | [`code-ui.md`](code-ui.md) | — | `src/ui/`, `sandbox/ui.*`, `tests/ui/` |
| 3 code | [`code-audio.md`](code-audio.md) | — | `src/audio/`, `sandbox/audio.*`, `tests/audio/` |

Every piece also owns `shots/<piece name>/` (evidence; git-ignored) and
`docs/requests/<piece name>.md` (its change requests to other owners). The piece name is the
order name, except for the six split pieces below, whose folders carry the split name.
**Nobody edits `design/*.json`, `package.json`, `src/core/` or `blender/lib/` in phase 3**
(one exception, section 3: the tables the texture scripts generate into `blender/lib/`).

### 1.1 The production split of three art orders (15 builders, 12 orders)

Three art orders are each built by **two builders at once**. The order file is shared and
read by both; ownership is **by file, never by folder**, so no two builders edit one file.
Each affected order has a "Split" box at its top that repeats its row.

| Order | Piece (builder) | Assets | Blender sources | Tests | Evidence and requests |
|---|---|---|---|---|---|
| `art-props.md` | **`art-props-mech`** (manifest owner `props_mech`) | the 28 `props_mech` assets (order section 4) | `blender/props/mech/**` and the texture scripts `blender/tex/tx_mask.py`, `tx_palette.py`, `tx_palette_emis.py` (with the tables they generate: `blender/lib/palette.json`, `mask_regions.json`) | `tests/art_props/mech/**` | `shots/art-props-mech/`, `docs/requests/art-props-mech.md` |
| `art-props.md` | **`art-props-dress`** (manifest owner `props_dress`) | the 29 `props_dress` assets (order section 5) | `blender/props/dress/**`. **Does not edit the three texture scripts**: a palette cell or mask region it needs is a request to `art-props-mech` in `docs/requests/art-props-dress.md` (cell or region name, colour or drawing, which asset) | `tests/art_props/dress/**` | `shots/art-props-dress/`, `docs/requests/art-props-dress.md` |
| `art-enemies.md` | **`art-enemies-bider`** | `enemy_bider`, `bider_seated_static`, `bider_table_static`, `bider_felled_static` | the manifest sources `blender/enemies/enemy_bider.py`, `bider_seated_static.py`, `bider_table_static.py`, `bider_felled_static.py`, plus any helper named `blender/enemies/bider*.py` | `tests/art_enemies/bider*` | `shots/art-enemies-bider/`, `docs/requests/art-enemies-bider.md` |
| `art-enemies.md` | **`art-enemies-transit`** | `enemy_transit` and every other asset in the order (`proj_stake`) | the manifest sources `blender/enemies/enemy_transit.py` and, one file per remaining asset, `proj_stake.py`, plus any helper named `blender/enemies/transit*.py` | `tests/art_enemies/transit*` and one test file per remaining asset (`stake*`) | `shots/art-enemies-transit/`, `docs/requests/art-enemies-transit.md` |
| `art-boss.md` | **`art-boss-windlass`** | `boss_windlass` and every asset in the order that is not the Tamper (`proj_canister`) | the manifest sources `blender/boss/boss_windlass.py` and, one file per remaining asset, `proj_canister.py`, plus any helper named `blender/boss/windlass*.py` | `tests/art_boss/windlass*` and one test file per remaining asset (`canister*`) | `shots/art-boss-windlass/`, `docs/requests/art-boss-windlass.md` |
| `art-boss.md` | **`art-boss-tamper`** | `enemy_tamper`, `tamper_cold_static` | the manifest sources `blender/boss/enemy_tamper.py` and `tamper_cold_static.py`, plus any helper named `blender/boss/tamper*.py` | `tests/art_boss/tamper*` | `shots/art-boss-tamper/`, `docs/requests/art-boss-tamper.md` |

Rules of the split:

- **A shared helper module does not exist.** Two builders of one order share no `.py` file:
  what both need (a material tag list, a livery helper) comes from `blender/lib/`, or each
  keeps its own copy under its own file prefix (`bider_common.py`, `transit_common.py`,
  `windlass_parts.py`, `tamper_parts.py`). The asset scripts are at the manifest's `source`
  paths (`design/assets.json`), which the build driver reads: `enemy_bider.py`,
  `enemy_transit.py`, `boss_windlass.py` and `enemy_tamper.py` keep those names (they do not
  start with the helper prefix; the table above says whose each is).
- **The test directory's `index.js`** (`tests/art_props/index.js`, `tests/art_enemies/index.js`,
  `tests/art_boss/index.js`) is a byte-for-byte copy of `tests/core/index.js`: whichever
  builder gets there first copies it, the other leaves it alone. `tests/art_props/mech/` and
  `tests/art_props/dress/` each also get their own copy.
- **Build only your own ids**: `node tools/build-assets.mjs --only <id>[,<id>…]`, not
  `--only enemies` / `--only boss` / `--only art-props` (an owner or piece build would
  rebuild, and can fail on, the other builder's half-written script). `art-props-mech` may
  use `--only props_mech`. **`art-props-dress` builds by asset id, not `--only props_dress`**:
  the manifest gives the three shared textures `tx_mask`, `tx_palette` and `tx_palette_emis`
  the owner name `props_dress` (`textures.*.owner`), so an owner build would also run the
  texture scripts that belong to `art-props-mech`. `art-props-mech` builds those three by
  id (`--only tx_palette,tx_palette_emis,tx_mask`). The manifest is not changed for the
  split; `node tools/asset-status.mjs --owner props_dress` therefore lists the three
  textures, and `art-props-mech` answers for them.
- **Status**: `node tools/asset-status.mjs --owner <manifest owner>` lists both halves of a
  shared owner; a builder answers for its own rows, and its definition of done counts only
  those.
- A definition-of-done line that names `tests/art_enemies/`, `tests/art_boss/`,
  `shots/art-enemies/`, `shots/art-boss/` or `shots/art-props/` means, for a split piece,
  its own test files and its own `shots/<piece name>/`.
- `preview-asset.mjs` chooses the evidence folder from the manifest owner, which is the
  *order's* name: pass **`--piece <piece name>`** (`--piece art-boss-tamper`) on every
  preview so the images land in your folder.

## 2. Dependency picture

```
                       design/layout.json   design/assets.json   design/story.json          (final input; read by everything)
                                 │                  │                  │
  PHASE 2      ┌─────────────────┴──────────────────┴──────────────────┴────────────────┐
  sequential   │ 1. foundation-core      contracts · loop · collision · asset store ·    │
               │                         data · quality · debug hook · stubs · harness   │
               │                         boots a RUNTIME greybox with no asset files     │
               └───────────────┬──────────────────────────────────────────────────────────┘
               ┌───────────────┴──────────────────────────────────────────────────────────┐
               │ 2. foundation-pipeline  blender/lib · build / optimise / check tools ·   │
               │                         84 placeholder GLBs + 18 textures (6 final) ·    │
               │                         greybox zone GLBs · preview sheets               │
               └───────────────┬──────────────────────────────────────────────────────────┘
                               │  integrate → fresh-context critic → fix → FREEZE src/core, blender/lib, tests/harness.mjs
  PHASE 3      ┌───────────────┴────────── 12 orders, 15 builders in parallel (section 1.1) ──────────────────────────┐
  round 1      │                                                                                                       │
               │  ART (Blender → blender/export → public/assets)            CODE (src/<module> behind GameContext)     │
               │                                                                                                       │
               │  art-weapons ──cartridges──┐                               code-player ◄── placeholders: revolver     │
               │  art-props ───embedded─────┼──► art-env-exterior           code-enemies ◄─ placeholders: creatures    │
               │  art-boss ──cold Tamper────┼──► art-env-interior           code-world ◄─── placeholders: everything   │
               │  art-enemies (seat / table heights from art-props)         code-render ◄── placeholders + 6 textures  │
               │                                                            code-ui, code-audio ◄── events only        │
               │                                                                                                       │
               │  art → code:  NAMES ONLY (nodes, bones, clips, durations, pivots) already final in the placeholders   │
               │  code → code: contracts.ts + the event bus; each piece runs beside CORE STUBS in its own sandbox      │
               └───────────────┬───────────────────────────────────────────────────────────────────────────────────────┘
                               │  each piece: build → fresh-context critic → fix
  PHASE 4      integrate (rebuild zones against final props; wire real systems in src/main.ts)
  rounds 2–5   → critic panel (playthrough, visuals, performance, story / puzzles, bugs) → triaged parallel fixes → repeat
```

What "depends on" means in round 1:

| Piece | Needs from others | How it works without them |
|---|---|---|
| every code piece | the other five systems | core stubs (`src/core/stubs/`) fill their slots; sandbox buttons and `__dbg.emit` stand in for their events |
| every code piece | final art | placeholder GLBs carry final node, bone, lamp-set and clip names, pivots, `nodePos` and durations; code never reads a clip's length |
| `art-env-exterior`, `art-env-interior` | embedded props from `art-props`, cartridges from `art-weapons`, the cold Tamper from `art-boss` | the zone scripts import whatever is in `blender/export/` (placeholder or final); the build driver rebuilds a zone when an embedded export changes; the integrator rebuilds all zones at the end of the round |
| `art-enemies` | seat, table, trough and grate sizes from `art-props` | the numbers are in both orders (seat 0.45 m, table top 0.76–0.8 m, trough rim 0.5 m, grate 1.2 × 1.2 m) |
| `art-props` | the cartridge size from `art-weapons` | in both orders: case 12 × 33 mm, overall 41 mm, band 9 mm |
| all art | real materials, sky, fog from `code-render` | `sandbox/viewer.html` uses the core fallback material: vertex colour × baked light, and for a **final** file the shared texture of each material on UV0 (placeholders get none). It is unlit (no key light, matcap or lamp state); `&mood=L1` (any `MoodId`) and `&ground=sand` add the stub's flat *mood look* (fog and sky colour, one ambient + key tint: enough for "reads at 30 m against the haze" and a rough "darkest object in the frame", not for a highlight). **Colour is exact**: section 6 ruling 15. Cycles previews carry the lit look until integration (FOUNDATION_REPORT 4) |
| the two halves of a split order | each other's sizes | the numbers are in the shared order; nothing is imported from the other half's files |

There is **no ordering inside phase 3**: all fifteen builders start together. Inside a piece the
order is: P0 before P1 before P2 for art (`node tools/asset-status.mjs`), and for code the
order of the deliverables list (contract surface first, so the composition root compiles).

## 3. No two pieces edit the same file

- Source folders are disjoint (table above). `public/assets/**` is written only by
  `node tools/build-assets.mjs --only <owner>`, and each owner builds only its own ids
  (`assets.json` `assets.*.owner`). Two owners share a category folder
  (`public/assets/props/`: `art-props` and `art-weapons`; `public/assets/enemies/`:
  `art-enemies` and `art-boss`): **by file, never by folder**.
- **Texture scripts** in `blender/tex/` are written first by `foundation-pipeline`, then
  owned file by file as `assets.json` `textures.*.owner` says: `tx_frontier_trim.py`,
  `tx_sand.py` → `art-env-exterior`; `tx_pellam_trim.py` → `art-env-interior`; `tx_mask.py`,
  `tx_palette.py`, `tx_palette_emis.py` → **`art-props-mech`** (section 1.1; every other
  piece, `art-props-dress` included, asks for a cell or a region by request); `tx_gun.py`,
  `tx_matcap_steel.py` → `art-weapons`; `tx_fx`, `tx_noise` come from
  `tools/gen_fx_atlas.mjs` → `code-render`.
  Shared textures are **append-only** after phase 2: a region, row or palette cell never
  moves. Lightmaps belong to the zone that bakes them.
- **The tables in `blender/lib/` that the texture scripts generate** (`palette.json`,
  `tx_*_trim.json`, `mask_regions.json`) are written by those scripts and owned with them:
  the one exception to "nobody edits `blender/lib`". Never edit them by hand. An append
  rebuilds nothing else: the build driver hashes the entries an asset read, not the file
  (`blender/lib/README.md`).
- Two builders of a split order own disjoint **files** of one folder (section 1.1).
- `src/<module>/index.ts` and `sandbox/<piece>.*` are created as stubs by `foundation-core`
  and belong to the piece from phase 3 on.
- `sandbox/core.html` is core's page; the scaffold checks of `tests/core/sandbox.test.mjs`
  run there. A piece's own `sandbox/<piece>.html` is held by core to one thing: it boots
  under `?test=1` to a ready hook and draws a frame. **Scenes are the piece's to choose.** A
  test can build its own room on any sandbox page with
  `await __dbg.ext.sandbox.room(solids, spawn, yawDeg)`; a sandbox loads a non-set asset (a
  pipeline fixture) with `await sb.loadOverlay('tests/pipeline/fixtures/manifest.json')`
  then `await sb.activate([id])` (run `node --test tests/pipeline/` once first: the fixture
  files are generated).
- Needing a change in someone else's file is a request (`docs/requests/<piece>.md`) and a
  local workaround, never an edit.

## 4. Where things go, and what the foundation really is

**Read first (every builder, before the test section of your order):**
`docs/FOUNDATION_REPORT.md`: it is what the code does, measured. Where an order and that
report disagree about the harness, the hook, the viewer or `tests/core`, the report wins and
the order has a bug.

| Who | Sections of `docs/FOUNDATION_REPORT.md` | Also |
|---|---|---|
| every builder | **2** (the test commands and how long they take), **3** (the debug hook, `tests/harness.mjs`, the 20-line example, deaths inside a script), **9** (known gaps: what the stubs are not) | `tests/core/example.mjs` (run it: `node tests/core/example.mjs`) |
| every artist | **4** (build and preview one asset; the viewer's first-person mode, moods, colour, what the fallback material shows), **6** (bake timings and sample counts), **8c** (what the pipeline checks since round 2) | **`blender/lib/README.md`** (the library map, the trap list, the commands) and `blender/template_asset.py` |
| every coder | **5** (the sandbox, dressing empties, view-model space, the three collision properties, wedges, stub doors), **6** (what a step, a round trip and a query cost), **8d** | `docs/requests/foundation-core.md` section 4 (how to stand on core) |
| `code-player`, `code-enemies` | 5, "Three properties of the collision engine every controller must handle" | `docs/requests/foundation-collision.md` sections 2 to 4; `docs/ARCHITECTURE.md` 6 and 18 |

| Thing | Place |
|---|---|
| Unit tests (vitest, no DOM at import) | `tests/<dir>/*.spec.ts` → `npx vitest run tests/<dir>` (yours) or `npm run test:unit` (the whole tree: the integrator's gate) |
| Browser / pipeline tests (node test runner + `tests/harness.mjs`) | `tests/<dir>/*.test.mjs` → `node --test tests/<dir>/`. **Each test directory needs an `index.js`: copy `tests/core/index.js` unchanged into the directory you run** (Node 24 resolves a directory argument like a module; the file finds `tests/run-dir.mjs` from any depth): `tests/player/`, `tests/art_props/` (it then runs `mech/` and `dress/` below it), and `tests/art_props/mech/` as well to run that folder alone. One file: `node --test tests/<dir>/x.test.mjs`. The glob form `node --test "tests/<dir>/*.test.mjs"` also works (one process per file) |
| Test dirs | `core`, `pipeline`, `player`, `enemies`, `render`, `world`, `ui`, `audio`, `art_env_exterior`, `art_env_interior`, `art_props/mech`, `art_props/dress`, `art_weapons`, `art_enemies`, `art_boss` (`art_enemies` and `art_boss` are each shared by two builders, by file prefix: section 1.1) |
| Sandbox | code: `sandbox/<module>.html`; art: `sandbox/viewer.html?asset=<id>` / `?zone=<id>` |
| Evidence | `shots/<piece name>/` at 960 × 540 unless the test is about resolution. **Open every image you cite.** |
| Throwaway experiments | `scratch/<your-name>/` |

### 4.1 Standing on the foundation (the harness and engine as they are)

- **Your own gate while iterating**: `npx vitest run tests/<dir>`, `node --test tests/<dir>/`
  (or one file), and `npx tsc --noEmit 2>&1 | grep -E 'src/<piece>|sandbox/<piece>|tests/<dir>'`
  (no output = clean in your files). The whole-tree `npm run test:unit`, `npx tsc --noEmit`
  and `npm run test:e2e` are the integrator's gate. **Never run `node --test tests/` to
  iterate**: the browser suites are slow on a shared machine (measured: `node --test tests/core/`
  95 to 100 s quiet, 140 to 190 s while other builds and suites run beside it;
  `node --test tests/` 100 to 160 s and more; `node --test tests/pipeline/` 27 to 30 s). No
  test may assert on wall-clock time.
- **A code builder's tests load only its own system.** `openGame(server, { piece: 'code-<slot>' })`
  on the index page defaults to `stubs: othersThan('<slot>')`: your system beside five core
  stubs, so your tests never load the five modules other builders are editing. `stubs` may
  also be `'all'`, a list, or `null` for none (the integrator). The URL form is
  `?stubs=all` / `?stubs=world,enemies`. A sandbox page does the same by construction.
- **`node --test tests/core/` is core's suite, not your "wired in" check.** It keeps core
  stubs in all six slots (`?stubs=all`) and, since core's round-3 fix, **serves and bundles
  no file under `src/<piece>/` at all** (core's stand-ins take their place, in the dev
  server and in the production builds of `stubs.test.mjs`), so it does not move with six
  modules in progress: it passes whether your system works, exists or compiles, and another
  builder's half-written module cannot fail it. The first line of the run says so:
  `tests/core: systems loaded from src/<piece>/: NONE; core stubs in: player, enemies, …`,
  followed by `NOT loaded although no longer the initial stub: <slot>` once your
  `src/<slot>/index.ts` is no longer core's initial stub. Read that line.
- **`startServer({ pieces })`** (`tests/harness.mjs`): which of the six `src/<slot>/` modules
  the server serves or bundles from their own sources: `'all'` (the default) or a list
  (`['player']`, `[]` for none); every other slot gets core's stand-in. On the dev index
  page the `stubs` default already keeps the other modules from being requested; **pass
  `pieces: ['<your slot>']` whenever your test makes a production build
  (`startServer({ mode: 'build', pieces: ['ui'] })`) or opens a page that imports every
  piece**, so another builder's half-written file cannot break your bundle. A build is a
  real production build (`NODE_ENV` is pinned per mode): no debug hook without `?debug=1`.
- **The real "wired in" check: `KEEP7_REAL=<your slot> node --test tests/core/`**
  (`player`, `enemies`, `world`, `render`, `audio`, `ui`; a comma list also works). Boot,
  flow, walk, seam, determinism, alloc, budget and playthrough then run on the index page
  with `src/<slot>/` in its slot and core stubs in the other five; `stubs.test.mjs` and
  `sandbox.test.mjs` keep the stubs. It takes about 2.5 minutes (142 s measured; up to
  3.5 minutes on a busy machine): **a definition-of-done step, run once per final pass**.
  `KEEP7_REAL=all` is the integrator's run. **Not proven:** this has only ever run against
  modules that wrap the stubs, so nobody knows which assertions of those eight files are
  stub-specific. A failure your system causes *by design* (the stub's value is asserted,
  yours is right by your order) is a request to core in `docs/requests/<piece>.md` naming
  the test and both values, and is listed in your report; it is not something to work
  around, and not a reason to edit `tests/core/`. A failure your system causes by breaking
  a contract (the walk gets stuck, the hash differs between two loads, allocation over
  6 KB per tick) is yours.
- **The debug hook runs no tick while a flow job is pending** (a respawn,
  `restart_checkpoint`, a warp, the start of a run: promise chains that cannot settle inside
  a synchronous call). `__dbg.step`, `stepUntil`, `perfRun`, `walkTo` and `followPath` stop
  there and return what they did (`ext.core.ran()` = ticks run; walks return `dead` or
  `state`; one `console.warn` the first time). **`__dbg.ext.core.stepAsync(n, render)` and
  `untilAsync(condition, maxSteps)`** let the job settle and run the rest. `game.step`,
  `game.until` and `game.run` of the harness already use them; in your own `page.evaluate`
  use `await __dbg.ext.core.stepAsync(n)` whenever a death or a restart can happen. A
  world's `restoreCheckpoint` / `beginRun` must never wait on the simulation.
- **`__dbg.ext.core` is core's, on every page, and stable** (it holds what the frozen
  `DebugHook` interface has no method for): `stepAsync`, `untilAsync`, `busy()`, `ran()`,
  `idle()`, `recordEvents(on)`, `capsuleFree(x, y, z, radius, height)`,
  `collisionCounts(reset)`, `stubs()`, `setSeventh(state)`, `tokens()`,
  `damage(amount, kind?, source?, ox?, oy?, oz?)`, `timeScale()`, `playerExtra()`, `ctx()`.
  Everything else under `ext.world`, `ext.player`, `ext.render`, `ext.enemies` today
  belongs to a **stub** and disappears when the real system takes the slot: a test that
  must survive integration uses the contract surface (`solvePuzzle`, `clearEncounter`,
  `checkpoint`, `tests/core/route.mjs`).
- **`__dbg.tap()` is pressed and counted off by the loop's own per-tick hooks**, so it
  works the same under `step()` and under the real-time loop (`setRealtime(true)`, a dev
  page, a build with `?debug=1`).
- **`ctx.clock.tick` advances while the game is paused or loading** (`simTime` and
  `unscaledTime` do not). A cooldown, a telegraph or a hint timer stamped from `clock.tick`
  runs out while a readable is open (readables use the `paused` state). Count ticks in your
  own `fixedUpdate`, or use `clock.unscaledTime` (ignores slow motion) or `clock.simTime`
  (scaled). `clock.tick` is for seeds and for stamps that need no arithmetic.
- **Allocation is measured one way**: `measureAlloc(game, body, { warm, batches, perBatch, ring, arg })`
  of `tests/harness.mjs` (3000 ticks of warm-up, the median of ten 60-tick batches between
  `gc()` calls, the event ring off). Ceiling: 6 KB per tick, and 6 KB per tick plus a
  rendered frame (core + stubs measure 0.4 and 2.8 KB). A figure taken after 300 ticks is
  JIT warm-up, not your path.
- **Collision** (`code-player`, `code-enemies`, anything that moves a capsule): the engine's
  own ledge lift is **one radius (0.35 m), not 0.2 m**, a `groundHeight` ray started inside a
  solid reports its underside, and the ground under a capsule's centre says nothing about
  its rim (ARCHITECTURE 6; FOUNDATION_REPORT 5).
- **The view-model group is in camera space** (ARCHITECTURE 7.2; the contract comment on
  `SceneRoots.viewModel`): render poses the group, player transforms only its own instance.
- **The stubs are not the game** (FOUNDATION_REPORT 9): the stub world switches doors
  instantly, has no puzzles, pickups, hints or focus ray, starts rides by proximity
  (3.2 m from the lever) and commits by proximity (1.6 m) only the checkpoints that are
  places (the start, "entering …", the stair foot, the rim); encounter and puzzle
  checkpoints commit through `clearEncounter` / `solvePuzzle`, and the four boss
  checkpoints (markers 0.5 m apart) on `boss/phase` (`p1`, `p2`, `p3a`) and `boss/proven`,
  which the stub's `setBossPhase` emits.
  It draws every shut door and the hatch as a greybox box (`stub_doors_mesh` under
  `scene.dynamic`). The stub renderer has one look on every tier; the stub enemies are
  capsules that fall to one shot; the stub boss reports 26 pips and can be forced with
  `__dbg.ext.enemies.setBoss({ … })`.
- **The hook refuses bad arguments and does not hide a NaN**: `walkTo`, `teleport`,
  `aimAt`, `setAim`, `look` and `spawnEnemy` throw `__dbg.<method>: <name> is NaN (a finite
  number is needed)`; `setTier`, `solvePuzzle`, `clearEncounter`, `spawnEnemy` (kind) and
  `setBossPhase` throw `__dbg.<method>: unknown id '<x>' (<the valid ids>)`. `state()` still
  writes a non-finite number as 0 (JSON has no NaN) but records the first one in
  `__dbg.error` with its path (`state(): player.x is NaN`), and the harness fails a test on
  `__dbg.error`: if you see that message, your system put a NaN into its `debugState()`.

Every order ends with a **definition of done** made of commands and numbers. A piece is
done when those pass, `npx tsc --noEmit` is clean in its files, and its report lists what is
not done. For a **code** piece the commands are: its own unit and browser tests, and
`KEEP7_REAL=<slot> node --test tests/core/` (above). For an **art** piece: its own tests,
`node tools/check-glb.mjs` on its files, `node tools/asset-status.mjs`, and the images it
opened. "A known gap listed in your report is worth more than a hidden one."

## 5. Budget shares (so twelve pieces add up to the caps in `CLAUDE.md`)

| Budget | Cap | Shares |
|---|---|---|
| Draw calls, Low | ≤ 100 typical, ≤ 150 worst | computed per visibility cell in `assets.json` (`visibility.cells[].budget`); art holds its per-asset `drawCalls`; the heaviest cell is `cell_gallery` at 84 / 92 (release pass p0) |
| Triangles in view, Low | ≤ 120 000 | per-asset `triBudget`; **pass i4: the heaviest cells are `cell_street` and `cell_yard` at 119 840, the view-model has 14 000 (11 745 built) and the 4 000 it gave back went outdoors, to the rim and to the creatures: INTEGRATION_REPORT Part Q.** Before: the heaviest cells are `cell_street` and `cell_yard` at 119 930 (release pass p0, after ruling R14 gave the view-model 18 000 of it and took 12 000 from chunk plans, the day backdrop and the effects allowance): **there is no slack: an asset over budget fails the build** |
| Textures + render targets | ≤ 64 MiB Low, ≤ 128 MiB High | per stage in `assets.json` `stages`: surface 51.3, seam 55.3, underground 44.0, coda 32.0 MiB on Low; High at 1920 x 1080: 117.0, 121.0, 109.8, 97.8 (release pass p0, the closer's corrected render-target ledger: Low 20 bytes a pixel, High 39.33; 2.3 MiB of each is the view-model's own texture set, ruling R14) |
| JS per frame | ≤ 4 ms | player 0.4 · enemies 1.0 · world 0.5 · render 1.5 (JS submission side) · audio 0.3 · ui 0.2 · core 0.1 (median, worst fight) |
| Allocation | ≤ 6 KB per tick | zero per-frame allocation in every piece; the 6 KB is the libraries' floor |
| Download (MiB: ruling 21) | ≤ 20 MB | env exterior GLBs 2.4 + lightmaps 3.1 (ruling 24) · env interior GLBs 2.5 + lightmaps 3.0 · props 0.8 · weapons 0.65 · enemies 0.8 · boss 0.6 · shared textures 1.5 · script + style 1.75 · design data 0.35 (MiB; release pass p0: it was "JS + CSS 1.5" with the design data inside the script, and the script alone was 1.83 MiB. The three design files are now separate `.json` files and the script is 1.55 MiB. The shares sum to 17.45 of 20) |

## 6. Producer rulings (where the source documents were silent or disagreed)

These are stated in the orders they touch; the list is here so critics and the integrator
see them in one place. **All of them are now written into the source documents** (the
integrator pass that closed pre-production: `docs/requests/workorders.md`, ARCHITECTURE 17,
GDD 23.4), so each is a pointer to where the rule lives, not a workaround.

1. **Core runs the run flow** (`src/core/flow.ts`): boot, `ui/action` handling, the death
   sequence and the restore trio (`enemies.applySave`, `world.applySave`, `player.applySave`,
   in that order, after `world.restoreCheckpoint()` has made the resident set right). UI only
   emits `ui/action`; world only provides `beginRun / restoreCheckpoint / warpToCheckpoint`.
2. **`foundation-core` boots without asset files**: the asset store synthesises placeholders
   from the manifest when a file is missing (dev / test only), so core does not wait for the
   pipeline. `pipeline.test.mjs` lives in `tests/pipeline/` (ARCHITECTURE 11.4).
3. **Multi-part animated props are rigid-skinned** so they stay at their manifest draw-call
   counts. The manifest says so: 18 props have `skinned: true` and `bones` = `root` + one bone
   per moving part; a name in both `nodes` and `bones` is the bone (ARCHITECTURE 7.2). The
   asset store still decides how to clone by what the file contains.
4. **`ui/hint` is emitted by world** (it knows when an action is first needed); UI displays.
5. **Who says which line**: enemies emit `story/say` for what the Windlass does on its own
   clock; world says everything tied to the player's act and to world state (lists in
   `code-enemies.md` 4.8 and `code-world.md` 4.8).
6. **The `proving_line` snap** is implemented in world's `knot_a` receiver (an enlarged
   volume while the player is on the step), not in the player's shot code; the drawn line may
   differ from the true line by up to 3°.
7. **Breath weight of the static Biders is UV1.x** (mesh extra `breath: 1`), not vertex
   colour G, because `COLOR_0` is the tint on `m_prop` (ARCHITECTURE 7.2, ART_BIBLE 7.6).
8. **Tamper vent lids are opened by code** in every state but `stagger`, `charge_stun` and
   `die` (the manifest's rule), +80° about the bone's local hinge axis.
9. **The legal-aim tick** of the kept round is an `audio/cue` (`listen_tick`) from the player.
10. **Pickups**: world emits `pickup/spawned` for layout pickups too (when their zone is
    built), so render can glint them; walk-over radius 0.9 m.
11. **The proving-lift ride** lasts at least 12 s (layout `ia_proving_lift.params.ride.seconds`)
    and until the coda set is built. Rides disable movement and the weapon (`setControl`), not look.
12. **The dragged fifth table leaf** in the Tally House is zone geometry
    (`art-env-interior`), since `prop_tally_table` is one mesh (manifest
    `bindings.solidProp.tally_table_end` is `null`).
13. **`trg_bore_kill`**: world may call `player.applyDamage` with source `world`.
14. **The Dowser shot**: enemies detect it and emit `shootable/hit` kind `dowser`; world
    narrates, render draws the dust.
15. **Tone map: a shoulder-only curve, no toe** (ruled after foundation critic round 3; it
    replaces "Neutral" wherever an older text has it). The real renderer **copies
    the `TONE_MAP_GLSL` of `basicRender`** (knee 0.8; the stub takes it from
    `src/core/tonemap.ts`, which exports `TONE_MAP_GLSL`, `TONE_MAP_KNEE`,
    `installToneMap(THREE.ShaderChunk)` and a JS `toneMap()` for tests, so `src/render` can
    import the very same string): after exposure, a colour
    whose brightest channel is at or below 0.8 linear is displayed untouched; above it the
    brightest channel rolls off toward 1.0 (`0.8 + 0.2 · t / (t + 0.2)`, `t = max − 0.8`,
    slope 1 at the knee) and the other two channels are scaled with it, so hue is kept. It
    is not three's `NeutralToneMapping`, whose toe subtracts up to 0.04 linear from dark
    colours (steel 54,82,90 would display as 23,67,77; gun_blue 28,34,48 as 3,16,37).
    **Artists judge colour in `sandbox/viewer.html`** (and every `<id>_game.png`), which
    shows exactly that curve: a dark palette colour in a viewer frame is the colour in the
    file (tested within 1 / 255 for steel, steel_dark, gun_blue, cable, walnut). The game
    then differs from the viewer only by what `code-render` adds after the curve's input
    (lighting, fog) and after its output (the grade, which is what keeps every pixel at or
    above `#0B0D12`). Written into `code-render` 4.1 and 4.3 and ARCHITECTURE 8.1 / 8.2.
16. **Three art orders are split between two builders each** (section 1.1): ownership by
    file, evidence and requests under the split piece's name, `tx_mask.py`, `tx_palette.py`
    and `tx_palette_emis.py` with `art-props-mech`.
17. **`KEEP7_REAL=<slot> node --test tests/core/` is the "wired in" check** of every code
    order; plain `node --test tests/core/` never loads a piece (section 4.1).
18. **The view-model group is in camera space**; render poses the group, player transforms
    only its own instance (ARCHITECTURE 7.2, the `SceneRoots.viewModel` comment,
    `code-player` 4.7, `code-render` 4.4).
19. **A new run resets the player in core**: `flow.ts` applies the save captured at the end
    of boot before `world.beginRun(null)` (ARCHITECTURE 3.5, `code-player` 4.8).
20. **The jump keeps the GDD's 1.0 m apex; the controller refuses a landing higher than the
    apex** above the take-off ground, because the engine's ledge lift adds one radius
    (0.35 m) to whatever a body reaches (ARCHITECTURE 6, `code-player` 4.1). The 1.3 m
    cover solids stay cover; a 1.2 m box is not mountable, a 0.9 m box is.

21. **Budget units (art integration, polish round 2): every size budget is binary.** "MB" in a download or texture
    budget means MiB (1 048 576 bytes), which is what `check-glb`, the build line and `__dbg.perf()` print. The
    20 MB download cap of `CLAUDE.md` is held as 20 MiB of `public/assets` + the bundle; an owner's share (section 5)
    is met when the figure `check-glb` prints is at or under it (`env_exterior` 1.99 MiB of 2.0, `props_mech` 0.49 MiB
    of 0.5: both inside).
22. **Collision follows the drawn prop where a shot could stop on air** (art integration, round 2): the tipped wagon is
    two solids (`st_cover_wagon`: the wheel end, full height; `st_wagon_bed`: 1.6 m), the water cart is its barrel
    (`yd_cover_cart`) plus low shafts (`yd_cart_shafts`), the rim stone's solid is the rock shelf it lies on. A solid
    with `propPivot` names where the embedded prop's pivot stands.
23. **The three proving knots face west** (down the sight line to the brass mark; `rotY` 90 on `knot_a/b/c`), as the
    gallery's seats were built. The round on the rim stone, the notes and the ledger stand on the surfaces as built
    (`ia_stone_round` y 18.356, `rd_note_lip` on the flat stone, `rd_ledger` y 0.795).

24. **The exterior's download share is 2.4 MiB of GLBs + 3.1 MiB of lightmaps** (closer, polish round 2; it was 2.0 +
    3.5). The six GLBs measure 2.33 MiB after the round's broken walls and yard dressing, the two lightmaps 1.37 MiB: the
    piece's 5.5 MiB is unchanged and the stage is at about 11.2 of 20 MiB. Nothing is cut.
25. **The pawl knots stand at (∓1.6, 6.0, 3.95), r 0.30** (closer, polish round 2; ART_BIBLE 7.7 and the art-boss order
    are edited). At z 2.6 the seated guard hid them from every place she can stand in a haul. The placeholder in
    `blender/placeholders.py` and its test keep z 2.6: it is only built by `--reset boss_windlass`.
26. **GDD numbers that critics asked to move and that stay this round**: the Windlass's stake damage (25), phase-1 haul
    (3.5 s) and the parry's cost; the bore boxes (6 rounds / 20 s); the Matador's wave clock (40 / 65 s) and clear rule;
    the rim's forced end (150 s, now counted from her first step out of the cage). The round's answer to the Windlass
    "wall" is teaching, not numbers: the line `hint_boss_haul` from the second death, a sour note and the deflected
    glyph for a parry, pawl cores that light only when a pawl can be burst. If the next playthrough critic still finds
    a wall with those in, the levers are one line each in `src/enemies/defs.ts` `BOSS` and `design/layout.json`.

27. **Polish round 3 moved the numbers ruling 26 kept** (lead rulings R1 to R3: the player's experience outranks a
    number in a document; the GDD is edited with each). The Windlass: phase-1 haul 3.5 -> 5.0 s, phase-2 haul 4.0 -> 6.5 s
    with 4.5 s guaranteed after the pawls (3.0), mercy and the teaching line from the first death in a phase (the
    second), the bore boxes 12 rounds / 10 s (6 / 20); pips (10 / 10 / 6), stake 25, canister 38, lance 30 and the parry
    stand. The rule "it opens only to haul" is in `stn_parley_4` and `nar_parley_kept`. The Tamper: 1 200 HP (600),
    a charge every 4 s (6); the Matador's grate Biders at 15 s and 35 s (40 / 65). Front Street: 8 Biders (7), four from
    the two alleys at once, max alive 5 (3). The yard: T2 and T3 at 14 s (40), grate Biders +2 s (+6), alley Biders
    +10 s (+16); the tin that stood outside the yard gate is by the water cart. Measured with the critics' plain-skill
    proxy: `docs/INTEGRATION_REPORT.md` Part E.
28. **Closer, polish round 3: what the round's piece fixers and look-dev directors changed after ruling 27.** The
    Windlass: phase-1 haul 5.0 -> **3.0 s** with 0.8 s of rest after each notch (pattern 11.4 s), every lit knot in an
    open mouth counts, the arm follows her in the haul, burst pawls stay burst, the inspection gives two free hits, the
    teaching line at the first haul of every try. The Tamper's chest vent opens for the last 0.6 s of the slam wind-up.
    The view-model pass is 40 degrees with `VIEW_PLACE` / `VIEW_PLACE_HANDLING` (ART_BIBLE 8.3); the "never over the
    cylinder ring" sentence is withdrawn. The Dowser is a near-black 9 x 29 px figure on the skyline, held until looked
    at. `prop_rim_stone` has a 240-triangle budget and carries its six cases at 2.6 x; `ia_stone_round` is bound at
    scale 2.6; `rd_note` uses `m_prop` only. The complete list: GDD 23.6 and the ART_BIBLE's round-3 amendments; the
    work orders' own rows for these assets and numbers are superseded by them.

## 7. For critics

Judge a piece by its order's "definition of done" and by evidence you open yourself:
the tests it names, `node tools/check-glb.mjs`, `node tools/asset-status.mjs --require=0`,
`__dbg.perf()` numbers, and the images in `shots/<piece name>/` (the split pieces of
section 1.1 have a folder each). A code piece is "wired in" only under
`KEEP7_REAL=<slot> node --test tests/core/` (section 4.1): the plain command proves
nothing about it. **Colour**: the viewer and every `<id>_game.png` show linear values up to
0.8 exactly as authored (no toe); only above 0.8 does a shoulder roll off, and the game's
renderer uses the same curve (ruling 15), so a dark palette colour in a viewer frame is the
colour in the file. `node --test tests/core/` prints which systems it loaded from
`src/<piece>/` as its first line: without `KEEP7_REAL` that is `NONE`. Art is judged against
`docs/ART_BIBLE.md` section 12; gameplay against `docs/GDD.md` section 21; budgets against
`CLAUDE.md` and `design/assets.json`. Real-GPU frame rate cannot be measured on this
machine: the budgets are the proxy and the player confirms.
