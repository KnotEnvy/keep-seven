# Work order: `code-enemies`

Phase 3 (production, round 1). Module: **`src/enemies/`** (AI, navigation, three archetypes,
the boss, projectiles, hit reactions, the five vignettes). You are a fresh agent: this file
plus the documents it names are everything you need. The piece is large and is cut along
file seams on purpose (ARCHITECTURE 1.2): if you sub-delegate, builder A takes `index.ts`,
`defs.ts`, `nav.ts`, `pool.ts`, `tokens.ts`, `bider.ts`, `transit.ts`,
`projectiles/stakes.ts`, `internals.ts`; builder B takes `vignettes.ts`, `tamper.ts`,
`boss/**`, `debug.ts`. Files talk through `internals.ts`, not by importing each other.

Read first: `CLAUDE.md`, `docs/PLAN.md`, `docs/workorders/README.md`; `docs/GDD.md` **6.7
(the reaction table: implement exactly), 7 (all), 8 (all), 10, 15 (difficulty table), 16, 21
(tests 2, 3, 5, 9)**; `docs/ARCHITECTURE.md` 1.2, 3.2–3.6, 5 (contracts sections 2, 4, 6
`enemy/*` `projectile/*` `boss/*`, 8 `EnemiesApi` / `EnemiesDebug`), 6, 9.1 (`actor`
bindings), 13; `docs/LEVEL.md` 0 (nav conventions), 2, 5, 6, 8;
`docs/research/game-feel.md` 3, 6, 9; then `src/core/contracts.ts`,
`src/core/stubs/nullEnemies.ts`, `src/core/data.ts`, `src/core/collision.ts`.

**The foundation as built (binding; where it and this order disagree about the harness, the
hook or the engine, it is what the code does):** `docs/FOUNDATION_REPORT.md` sections 2 (test
commands and their cost), 3 (debug hook, harness, deaths inside a script), 5 (sandbox, the
stubs beside you), 6 and 9 (known gaps); `docs/requests/foundation-core.md` section 4;
`tests/core/example.mjs`; README section 4 ("Read first", 4.1 "Standing on the foundation"). For anything that
moves a capsule (the Tamper's charge): `docs/requests/foundation-collision.md` sections 2 to 4
and the three engine properties of ARCHITECTURE 6 (the ledge lift is one radius, 0.35 m, not
0.2 m; a `groundHeight` ray started inside a solid reports its underside; resolve the capsule
after a snap).

## 1. Mission

Give the gun things worth one round each. **A shot is a verb** (GDD 1): kill a body, free a
Bider by its crown knot, break a Transit's aim, open a Tamper's vent, answer a machine's
question; "no bullet produces nothing". Every enemy is fair and legible on a slow machine:
each attack has a tone, a pose and a shape; never more than two attackers at once; the first
shot at you always misses. The boss is the game's thesis played as a fight: a six-chamber
cylinder that fires at the player, counted by its lamps, that lead cannot finally kill, and
that stops when she spends the seventh. You implement **the GDD's numbers exactly** (they are
copied below): tuning happens in polish rounds, on evidence. Pillar 5: 6 enemies + effects
inside 1 ms of JS, zero allocation per tick, at most 4 line-of-sight rays per frame.

## 2. Owned files (exclusive)

```
src/enemies/**               the file split of ARCHITECTURE 1.2 (index.ts exports exactly createEnemySystem)
sandbox/enemies.html  sandbox/enemies.ts
tests/enemies/**
shots/code-enemies/**
docs/requests/code-enemies.md
```

Import rule: only `src/enemies/`, `src/core/`, `three`, `three/examples/jsm/*.js`,
`three-mesh-bvh`. Never edit `src/core/`, `design/*.json`, other modules.

## 3. Contracts

- **Implement** `EnemySystem` = `GameSystem` + `EnemiesApi` + `Saveable<EnemiesSave>`: `spawn(SpawnRequest)` (returns `''` when the alive cap or pool is exhausted), `wake`, `wakeEncounter`, `clearEncounter` (no events), `clearAll`, `aliveCount`, `threat`, `list`, `startBoss(fromPhase, parleyHeard)`, `boss: BossView`, `playVignette(id)`, `setAiEnabled`, `debug: EnemiesDebug` (`spawnAt`, `killAll(freed)`, `setBossPhase`, `tokens()`), `captureSave` / `applySave` (`bossPhase`, `parleyHeard`, `deathsInBossPhase`, `statics[]`).
- **Export** from `defs.ts`: `ENEMIES: Record<EnemyKind, EnemyDef>`, `DIFFICULTY: Record<Difficulty, DifficultyDef>`, each number with its GDD section in a comment.
- **Emit**: `enemy/spawned|state|telegraph|attack|damaged|felled|freed|died|removed`, `projectile/spawned|landed|burst`, `boss/parley|phase|pips|indexing|discharge|haul|mouth|guard|pawl|charge_required|head_dry|hush|proven|defeated`, `vignette/state`, `story/say` (the lines listed in 4.8), `audio/cue` where a sound has no event (`ratchet`, `mouth_iris`, `glow_tone`, `haul_whine`, `refill_gurgle`, `dry_click_big`, `run_down`, `guard_slide`, `guard_shatter`).
- **Listen**: `weapon/kept` (`loading` → the hush; `unloaded` → resume; `fired` → the proof), `weapon/fired` (Transits hear shots in their encounter), `world/built` (rebuild the nav graph; create vignette actors of new zones), `world/cell` (hide dormant and vignette actors of zones not drawn), `puzzle/hint` with `puzzle: 'kept'` (T3: adds stop; T4: fan damage 9, haul 6 s), `options/changed` (difficulty), `encounter/reset`, `game/state`.
- **Direct calls you may make** (ARCHITECTURE 3.5): `ctx.collision.*`; `ctx.player.applyDamage`; `ctx.render.vfx.acquireLine / acquireCard / ring / blobShadow`, `ctx.render.instances.*` (stakes, canisters, static bodies), `ctx.render.lamps.*` (boss lamps, gauge), `ctx.render.setEmissive`, `ctx.render.zoneVisible`; `ctx.world.flag()`, `ctx.world.doorState()` (nav gates), `ctx.world.builtZones`; `ctx.data.navPath`, `ctx.data.marker(s)`; `ctx.assets.instantiate`; `ctx.clock.slowMotion` (boss breaks, the hush, the kill sequence); `ctx.rng.fork('enemies')`. Read `ctx.player.position / eye / forward / velocity / alive`.
- **You do not decide** when encounters start, what waves spawn, or drops: `code-world`'s director calls `spawn` and `startBoss` and counts your `enemy/felled|freed|died` events.
- Assets (placeholders with final names are already in the game): `enemy_bider` (nodes `root`, `head`, `crown`, `hand_socket_r`; 18 clips), `bider_seated_static`, `bider_felled_static` (instanced), `enemy_transit` (`head`, `lens`, `stake_muzzle`; 10 clips), `proj_stake` (`stake_hot`, `stake_cool`; instanced; pivot at the tip), `enemy_tamper` (`vent_chest_knot`, `vent_back_knot`, `ram_head`, `foot_spark`; bones `vent_chest`, `vent_back`; 12 clips), `boss_windlass` (section 4.7), `proj_canister`, `prop_cup_tin` (the kneeler's hand prop), `prop_grate` (world instantiates it at `climb_out` spawns; you play nothing on it).

## 4. Deliverables

### 4.1 Shared systems
- [ ] **Caps.** Never more than **6 alive** outside the boss room and **boss + 3** inside; `maxAlive`: transit 2, tamper 1. `spawn` returns `''` beyond the cap.
- [ ] **Attack tokens** (`tokens.ts`): concurrent attackers **2 on Normal (Easy 1, Hard 3)**, sub-caps **2 melee / 1 ranged / 1 heavy**, token cooldown **0.6 s**, at least **0.3 s between attack starts**. An attack holds its token from wind-up through strike.
- [ ] **Thinking**: AI decisions at **10 Hz with per-enemy phase offsets**; steering and animation at 60 Hz; **at most 4 `lineOfSight` rays per frame** across all enemies (`lineOfSight(a, b, ColFlag.GRILLE | ColFlag.LOW)`), budgeted round-robin.
- [ ] **Difficulty** (`DIFFICULTY`): damage taken ×0.6 / 1.0 / 1.4 is the player's; yours: tokens 1 / 2 / 3, telegraph scale **+20 % Easy, −10 % Hard**, crown-knot radius **0.26 / 0.22 / 0.20 m**. **Health never scales.** (Drop chance 40 / 25 / 15 % is exported in `DIFFICULTY` for the director.)
- [ ] **Fairness**: enemies outside the player's view cone attack at **half frequency** and never start an attack from behind within **6 m** without their cue having played; **an enemy's first shot at a fresh target always misses**; ranged accuracy **×0.8 against a player moving faster than 3 m/s**.
- [ ] **Navigation** (`nav.ts`): the graph is the layout nodes of `world.builtZones` plus nodes whose `sets` contains the resident set; rebuilt on `world/built`. A link in `nav.gates` is passable only while `world.doorState(door) === 'open'`. A* with a preallocated open list; steering along the path with separation between enemies (they do not collide with each other or the player); `groundHeight` to stay on the floor. Lane volumes (`lane_street`, `lane_gallery`: triggers with `params.kind = 'lane'`): a Bider inside one follows the nearest Bider ahead and does not overtake.
- [ ] **Hit volumes** (`pool.ts`): `collision.addVolume` on `Layer.ENEMY` at spawn from `EnemyDef.volumes`, moved each tick from the named nodes, disabled on death. Weak points priority 10, bodies 0. Receivers implement `HitReceiver.onHit` and **fill `HitResponse` completely** (`outcome`, `stops`, `stopsLine`, `damageDealt`, `healthLeft`).
- [ ] **Pose freeze**: target-local, 50 ms on a hit, 70 ms on a kill or a freeing (pause that instance's mixer); never global.
- [ ] **Dormant actors**: on `world/cell` set `visible` (and pause the mixer) of every dormant or vignette actor by `render.zoneVisible(zone of its spawn marker)`. Awake enemies are always drawn.
- [ ] Mixers advance in `fixedUpdate` with the scaled `dt`; transforms interpolate in `update` (`core/interp.ts`); a blob shadow per awake enemy (`vfx.blobShadow()`).
- [ ] Bider variety: four per-instance `workcloth` tints and a ±5 % hood scale on `head`, from the forked RNG.

### 4.2 `bider` — HP 100, lunge 18, run 5.8 m/s, threat 1 (GDD 7.1)

Volumes: crown sphere at `crown`, r 0.22 (difficulty), tested first; body capsule (r 0.3, to shoulder height). Aware of the player from the encounter trigger; navigates to the last known position if sight is lost for more than 1 s.

| State | Enter | Does | Leaves to |
|---|---|---|---|
| `dormant` | spawned with a `dormantClip` (`scoop_kneel`, `sit_table`, `queue_stand`) | loops it; **shootable**; a crown shot frees it without a fight; any damage emits `enemy/damaged` (the director starts the encounter) | `rise` on `wake` |
| `rise` | `wake` / entrance | `kneel_to_stand` 1.0 s, `rise_from_seat` 1.2 s, `turn_about` 1.5 s or `climb_out` 1.2 s (entrance `climb_out`; `doorway` = run in); shootable throughout | `approach` |
| `approach` | | run 5.8 m/s at the player. In a lane volume: file, no overtaking, 1.6 m spacing. In open ground: one of five approach offsets (0°, ±12°, ±25°) so groups fan | `windup` at 2.4 m with a melee token; `circle` at 3 m without |
| `circle` | no token | strafe 3.0 m/s on a 3 m radius; `enemy/state` → `circle_strafe` every 1.5 s bark | `windup` when a token frees |
| `windup` | token | 0.5 s crouch (× telegraph scale), head still; emits `enemy/telegraph { attack: 'lunge' }` | `lunge` |
| `lunge` | | 0.35 s, 2.2 m forward, reach 1.8 m, **18 damage once** (`segmentHitsCapsule`), `enemy/attack` | `recover` |
| `recover` | | 0.6 s, slow turn | `approach` |
| `stumble` | a neighbour ahead within 1.2 m is felled (0.4 s), or a knot bursts within 4 m (0.5 s) | | previous |
| `falter` | the Tamper dies, or the hush catches it in `windup` / `lunge` | 2.0 s, backs off 2 m | `approach` |
| `felled` | body damage ≥ 100 | 70 ms freeze, `die_back` 0.9 s, thrown 1.2 m along the shot; **after 3 s replaced by an instanced `bider_felled_static`**; `enemy/felled` | final |
| `freed` | crown knot burst, **any line round wherever it hits**, or the kept round | 70 ms freeze, `render.setEmissive(…, 0)`, `sit_down` 0.9 s, then `sit_breathe`; **after 3 s replaced by an instanced `bider_seated_static`**; no hit volume; `enemy/freed { cause: 'crown' | 'line' | 'kept' }` | final |

Reactions (GDD 6.7): lead body → `kill` outcome, Biders within 1.2 m behind stumble 0.4 s; lead crown → `freed` outcome (weak-point marker), Biders within 4 m stumble 0.5 s; line round anywhere → `freed`; seated table figures have no hit volume. Static bodies persist (`EnemiesSave.statics`) and are restored on `applySave`.

### 4.3 `transit` — HP 200, stake 22, walk 3.5 m/s, threat 2, max alive 2 (GDD 7.2)

Volumes: lens sphere at `lens` r 0.17, ×2 (one lead round kills); body (legs and drum) capsule. Sight 40 m, 120° cone; hears shots anywhere in its encounter.

| State | Does | Timing |
|---|---|---|
| `emerge` | steps out and unfolds; shootable | 1.2 s |
| `relocate` | walks to an authored firing point (nav nodes tagged `firing_point`) **12–25 m from the player**, scored: line of sight, band, unoccupied, not used in the last 10 s; backs off if the player is inside 8 m | 3.5 m/s |
| `plant` | legs down | 0.3 s |
| `aim` | **telegraph 0.9 s** (× scale), needs the ranged token: `enemy/telegraph { attack: 'aim' }`; a dashed sighting thread from `lens` to the target (`vfx.acquireLine('sighting_thread')`) and a star glint (`acquireCard('aim_star')`); **the thread stops tracking for the last 0.25 s; the head is still for the last 0.4 s** | 0.9 s |
| `fire` | one stake: **18 m/s, radius 0.15 m, 22 damage**, aimed at the frozen point; `projectile/spawned` | 0.25 s |
| `cooldown` | | 1.2 s |
| relocation rule | after 2 shots from one point | |
| `sidestep` | if the crosshair rests on it for 0.6 s beyond 10 m; at most once per 3 s; never during `aim`; `sidestep_l/r` | 0.4 s, 1.5 m |
| `flinch` | on a body hit: an `aim` in progress is cancelled and restarts from `plant` | 0.25 s |
| `die_fold` | lens shot, a line round, or a second body hit; `render.setEmissive(…, 0)`; stays in the world | 1.0 s |

### 4.4 Stakes (`projectiles/stakes.ts`)
- [ ] Pool of **8 in flight**; each has a `Layer.PROJECTILE` volume of r 0.30 for the player's ray (a hit bursts it: `projectile/burst { reason: 'shot' }`, outcome `broke`); travels straight, sticks in whatever it hits (`projectile/landed` with the surface, `hitPlayer`), damages the player once by `segmentHitsCapsule`.
- [ ] **Stuck stakes: cap 18, shared by Transits and the Windlass, instanced** (`render.instances.add('proj_stake', 'stake_hot', …)`), cooling to dull orange over 6 s (`setTint`, then swap to `stake_cool`), oldest recycled.

### 4.5 `tamper` — HP 600, slam 38, charge 35, walk 2.5 m/s, charge 9 m/s, threat 4, max alive 1 (GDD 7.3)

Volumes: plate body (×0.25); `vent_chest_knot` and `vent_back_knot` spheres r 0.28 (×2), `gatedBy: 'vent_chest_open' | 'vent_back_open'`, **`gateIgnoredBy: ['line_round']`**. Turn rate 90°/s walking, 20°/s charging. **Vent lids are yours**: after the mixer each tick, set `vent_chest` / `vent_back` to open (+80° about the bone's local hinge axis: `art-boss` reports the axis; keep it in `defs.ts`) whenever the state says open.

| State | Does | Timing |
|---|---|---|
| `vignette` | loops `pound_bulkhead` facing the bulkhead (`sp_hall_tamper.params.bulkheadAt`), chest vent open on each wind-up; ignores the player. **Plate hits: clank, ricochet, 0 damage.** A lead round into the open chest vent, or any line round, does its normal damage **and you emit `enemy/damaged`** (the director starts `enc_matador` on that tick). Otherwise leaves only on `wake` | until woken |
| `advance` | walks toward the player | 2.5 m/s |
| `slam_windup` | starts inside **4.5 m**, heavy token; **chest vent open for the whole wind-up**; `enemy/telegraph { attack: 'slam' }`; `vfx.ring('slam', …, 3.5, 1.0, …)` | 1.0 s |
| `slam` | **38 damage within 3.5 m of the impact point, line of sight required** (ribs block); `enemy/attack` | 0.3 s |
| `slam_recover` | chest vent stays open the first 0.5 s | 1.5 s |
| `charge_windup` | starts at **8–20 m with a clear lane**; `enemy/telegraph { attack: 'charge' }`; direction fixed at the end | 0.8 s |
| `charge` | straight line at 9 m/s (`resolveCapsule`), **35 damage on contact**, up to 22 m | until contact |
| `charge_stun` | the charge meets `wallFlags & ColFlag.STUNS_CHARGE` (a rib, the cabinet, a wall): **back vent open** | 2.0 s |
| `stagger` | a lead hit in an open vent: 200 damage, attack cancelled | 1.5 s |
| `line_stagger` | a line round through either knot: **300 and both vents forced open for the whole state**; plays `stagger` at half speed. A lead vent hit during it does 200 and does not restart or shorten it; a second line round does 300 and restarts it | 3.0 s |
| `flinch_plate` | plate hit: 25 damage (×0.25), 0.2 m pushback, no interrupt, outcome `deflected` with a ricochet | 0.2 s |
| `die` | stops; `setEmissive(…, 0)`; stays; every Bider alive falters 2 s; `enemy/died` | 2.2 s |

Pattern: slam if the player is within 4.5 m, else charge if a lane exists and the last charge was more than 6 s ago, else advance. **A line round does a flat 300 wherever it passes through the body and never more** (through a knot it adds `line_stagger`, not damage): one line round never kills from full health; two do; so do one line round and two vent shots; three lead vent shots do; 24 plate shots do.

### 4.6 Vignettes (`vignettes.ts`): `playVignette(id)`, each emits `vignette/state` `started` / `ended` / `skipped`; none replays (world tracks `vignettesSeen`)

| Id | Anchor | What you run |
|---|---|---|
| `vig_kneeler` | `sp_street_kneeler` | the dormant Bider in `scoop_kneel` with `prop_cup_tin` on `hand_socket_r`; on wake `kneel_to_stand` (on frame 12, 0.4 s in, detach the cup and leave it standing on the trough rim as a plain instance), then `approach` |
| `vig_yard_bell` | `sp_yard_t1` | T1 `emerge`, ignores the player, `plant`, the full `aim` tell on `ia_yard_bell` (`params.vignette.stakes`), `fire` (the stake flies to the bell and sticks in it: the normal projectile events, with `hitPlayer: false`), then turns to the player; about 4 s. Shootable throughout with normal damage: a lens shot kills it; a body hit makes it `flinch`, ends the vignette, `relocate`. It never targets the player before the turn. GDD 20.1 row 6 fallback: T1 emerges and turns |
| `vig_tamper` | `trg_hall_gantry` | the Tamper in `vignette` state pounding; once, a Bider `climb_out` at `sp_hall_vig_bider` inside the slam ring and is felled by the slam (`counted: false`; GDD 20.1 row 5 fallback: the Tamper pounds alone). 8 s; it goes on pounding until the encounter starts |
| `vig_dowser` | `trg_dowser` | the card: `assets.instantiate('card_dowser')` at `env_backdrop_day`'s `socket_dowser` (layout `vista_dowser.params.target`), billboarded about Y, **scaled so it is never under 3 × 8 px at 720p**; `acquireCard('dowser_glint')` on its `glint` node flashing every 1.5 s. World runs the 12 s clock and the look test; you emit `vignette/state` `started` only, and hide the card when world emits `vignette/state { id: 'vig_dowser', stage: 'ended' }`. A shot toward him (you detect it from `weapon/fired` while the card is up and the shot direction is within 5° of the card): emit `shootable/hit { id: 'vista_dowser', kind: 'dowser', x, y, z }` with the position 60 m along the shot (far short of him): world narrates it once and render draws the dust puff from that event |
| `vig_watcher` | `trg_watcher` / `prop_watcher` | created when `the_gallery` is built: one skinned Bider in `sit_breathe` at `prop_watcher`, **no hit volume, counts toward nothing**; from the trigger on, its `head` yaw follows the player clamped to **±60°** (rotate the bone after the mixer). GDD 20.1 row 2 fallback: a `bider_seated_static` instance |

### 4.7 The boss: `windlass` (`boss/index.ts`, `parley.ts`, `arm.ts`, `attacks.ts`, `adds.ts`, `ordnance.ts`; GDD 8)

Asset `boss_windlass` placed at `sp_windlass` (the bore axis (14, −44, 96)). You drive by code: `arm_yaw` (six indexes at bearings 0, 60, …, 300°; bay *k* at 60·(k − 1)), `drum_spin`, `knot_n` / `pawl_*` scale (burst), `boss_lamps` (mask: 0–5 mouth lamps, 6–11 knot cores, 12–13 pawl cores) and `gauge` (count = pips, 26) through `render.lamps`; `mouth_open` / `mouth_close` retargeted to each `mouth_n`. Volumes: six knot spheres at `knot_n_hit` r 0.45 (`gatedBy: 'mouth_open'`), shut lids and drum face = plate (`deflected`), guard = plate with `ColFlag.PIERCE`, two pawl spheres at `pawl_l_hit` / `pawl_r_hit` r 0.3. Player's bay = the `bay_n` trigger sector (bearing from the axis, ±30°).

- [ ] **Health 26 pips: 10 + 10 + 6.** Damage does not carry across a phase boundary. Phase transitions 3 s, invulnerable, `clock.slowMotion(0.3, 0.3, 'boss_break')` on the breaking hit. Emit `boss/phase` and `boss/pips` on every change. `BossView` always current.
- [ ] **Movement**: it can aim only within **±35°** of the arm's heading. Before each pattern it **indexes** to the player's bay: `boss/indexing { fromBay, toBay, seconds }`, `stn_boss_indexing`, **1.5 s per 60° step, the shorter way round**, mouths shut while moving, a 2° overshoot and settle.
- [ ] **Hit rule**: only a knot in an **open** mouth takes a hit; each takes one hit and goes dark until the haul ends (`boss/mouth`). **Parry**: a lead round into a **stake** chamber during its glow → misfire, no stake, outcome `parried`, **no pip**; canister chambers and the fan cannot be parried (clank).
- [ ] **Parley** (skipped when `parleyHeard`): door sealed by world; index to face her; timeline from the seal: `stn_parley_1` 0–5.5 s, `nar_parley` 5.5–10, `rv_ask` 10–14.5, `stn_parley_2` 14.5–19, `stn_parley_3` 19–23, `stn_parley_4` 23–27 **with all six mouths open for 4.0 s from the tick the line appears**, phase 1 at 28 s. Held fire → up to 6 free hits and `nar_parley_kept`. **Any shot before `stn_parley_4`**: clank, `stn_parley_refused`, phase 1 at once. Emit `boss/parley` stages.
- [ ] **Phase 1 (10 hits)**: index; six discharges **1.1 s each (0.9 s glow + 0.2 s index), 6.6 s**, order **stake, stake, canister, stake, stake, canister**: the top mouth opens, glows, fires (`boss/discharge`), the drum indexes one notch, **the lamp beside each mouth goes out as it fires**. Stake: 20 m/s, 25 damage, aimed at the player's position at the end of the glow. Canister: lobbed, 1.2 s flight, lands at the player's position at launch, `vfx.ring('canister', …, 3.5, 1.0, …)` for 1.0 s, then bursts for **38** (blocked by `BLOCKS_BOSS_FIRE` line of sight); max 2 rings alive. Then the **haul 3.5 s**: `stn_boss_hauling`, `boss/haul`, all six mouths open, lamps relight one by one. Ends at 10 hits: `stn_boss_p1_break`.
- [ ] **Phase 2 (10 hits)**: `stn_boss_guard_set`, `guard_slide_on`, `boss/guard { 'set' }` (world opens `ia_line_locker_bore` on it). Tells 0.8 s. Five discharges **stake, canister, lance, stake, canister (7.7 s)**. **Lance**: a dashed thread on the sweep's start edge for **1.2 s** (`acquireLine('lance_thread')`), then a blade sweeping the arm's 70° arc at chest height over **2.5 s (28°/s), 30 damage once**; ribs block it (`acquireCard('lance')`). **Adds**: 2 Biders `climb_out` at each haul start, **cap 3 alive, 6 in the phase**. **Haul 4.0 s**: the guard stays shut unless **both pawls** are shot (`boss/pawl`); then `stn_boss_guard_released`, `guard_drop`, and at least **3.0 s** of open face is guaranteed (the haul extends); pawls reset each cycle (`guard_raise`). **A line round through the guard counts as exactly 3 hits.** Ends at 10 hits: `guard_shatter`, `boss/guard { 'shattered' }`, `stn_boss_p2_break`.
- [ ] **Phase 3a, unproven (no pip can be removed for good)**: the drum spins free at 40°/s, all six mouths open. **The fan**: 1.2 s spin-up with the six lamps flashing in turn at 5 Hz (a steady ramp with `options.reduceFlashes`), then **six stakes in 1.2 s across a 24° spread, 18 damage each, at most two can damage the player per fan**; then a 3.0 s haul; then index. Each mouth takes one hit, goes dark, its pip goes out; **4.0 s later it relights** (`acquireLine('relight_thread')` from the bore to `thread_anchor_n`, `boss/mouth { 'relit' }`, `stn_boss_refilled`). Adds: up to 3 alive, one every 8 s, at most 9; **none after hint T3**. **At phase start + 12 s or the first relight, whichever is first, and only if the kept round has not been loaded**: emit `boss/charge_required`, `stn_boss_charge_required`, then `nar_one_left`. **All six dark at once**: `stn_boss_head_dry_refilling`, `boss/head_dry { seconds: 6 }`, no attacks for 6.0 s. Hint T4: fan damage 9 per stake, haul 6 s. `marksLit` true from the first tick.
- [ ] **The hush** (`weapon/kept` `loading`): every stake and canister in flight bursts harmlessly (`projectile/burst { reason: 'hush' }`); mouths shut; no attack until the shot or until `weapon/kept` `unloaded`; `clock.slowMotion(0.5, 1.8, 'hush')`; Biders in `windup` / `lunge` → `falter`; **over the 1.8 s the arm swings in one ratchet run to the index opposite the occupied mark** (mark bay *k* → bay *k* + 3; `params.armSwingsTo`); `boss/hush { on: true }`. On `unloaded`: `boss/hush { on: false }`, index back to her bay.
- [ ] **The proof** (`weapon/kept` `fired`): `boss/proven { x, y, z }` (the bore axis at the kerb top); every Bider alive → `freed` with cause `kept` (counted); the Windlass frozen for 4 s; phase `proven` then `p3b`.
- [ ] **Phase 3b, dry (6 hits; cannot hurt the player)**: `stn_dry`; drum at 15°/s; every 1.1 s the top mouth opens with `boss/discharge { kind: 'dry' }` (no glow, no projectile); `stn_boss_hauling` twice, 4 s apart, then `nar_hauling`. All six mouths open and cannot relight; each takes one lead round (world / audio sound scale degrees 1–6 from `boss/mouth`). No time limit. `cleanSix` = six hits in one cylinder with no miss.
- [ ] **Kill sequence**: sixth lamp out; `clock.slowMotion(0.2, 0.6, 'kill_sequence')`; the drum runs down in slowing clicks to a stop; `sag_death` 3.0 s; three seconds of nothing; then `boss/defeated { cleanSix }`, phase `dead`.
- [ ] **Adds** (`adds.ts`): the grate **farthest** from the player (`sp_bore_grate_1..3`), never one within **7 m** (hold and retry each second); emergence 1.2–1.5 s and shootable; you call your own spawn with `encounter: 'enc_windlass'`; world's director handles their drops.
- [ ] **Mercy**: `deathsInBossPhase ≥ 2` in the same phase → boss damage ×0.85 (world places the extra tin). Retry starts at the saved phase (`startBoss(fromPhase, true)`), within 3 s, parley skipped.
- [ ] Pools: stakes in flight 8; stuck 18; canister rings 2; lance 1; relight threads 6.

### 4.8 Who says what (producer ruling: both this order and `code-world` state it)
You emit `story/say` for what the machine does on its own clock: `stn_parley_1…4`, `nar_parley`, `rv_ask`, `nar_parley_kept`, `stn_parley_refused`, `stn_boss_indexing`, `stn_boss_hauling`, `stn_boss_p1_break`, `stn_boss_guard_set`, `stn_boss_guard_released`, `stn_boss_p2_break`, `stn_boss_refilled`, `stn_boss_charge_required` + `nar_one_left`, `stn_boss_head_dry_refilling`, `stn_dry`, `nar_hauling`. **World** says everything tied to the player's own act and to world state: `nar_not_for_firing`, `nar_down_the_bore`, `nar_seal`, `nar_office`, `nar_kept`, `stn_proven`, `stn_bore_lead`, `stn_bore_line_short`, the kept hint ladder, `stn_service`, `stn_thanks`, and every vignette narration line (`nar_kneeler`, `stn_yard_wake`, `nar_transit`, `nar_tamper_1`, `nar_dowser_*`, `nar_watcher_*`), which it plays from your `vignette/state` and `enemy/state` events. Keys come from `design/story.json`; no literal text in code.

## 5. Sandbox (`sandbox/enemies.html`)

Real `createEnemySystem` + core stubs. Scenes built from the **real layout zone** (solids + nav through `core/greybox`): `street`, `yard`, `file`, `hall`, `bore`. Buttons: spawn each kind at any spawn marker, wake, kill, free, fire a mock line round down an axis; target = the dummy player or a scripted walker; overlays for state, token holders, nav path, hit volumes, telegraph timers, lanes; the boss with a button per phase, `F`-on-mark and `kept fired` mock buttons, and the pips / gauge readout.

## 6. Tests (`tests/enemies/`)

Vitest specs for pure logic (tokens, pattern selection, pip arithmetic, index direction, add-grate choice); harness tests through the sandbox with `?test=1`, seeded.

- [ ] **Reaction table**: one test per row of GDD 6.7 that is yours (Bider body / crown / seated; Transit legs / lens; stake in flight; Tamper plate / vent open / vent shut / vignette; Windlass open chamber / shut / guard), for lead and for line rounds: outcome, damage, state after, events.
- [ ] **Tokens** (GDD 21 test 1): over a 60 s fight with 6 Biders on Normal, never more than 2 enemies between wind-up and strike in any tick; no two wind-ups start within 0.3 s; sub-caps hold; Easy 1, Hard 3.
- [ ] **Crown knot** (test 2): a scripted shooter aiming at `crown` with ±0.1 m seeded lateral error at 10 m frees ≥ 5 of 7 approaching Biders at each difficulty.
- [ ] **File** (test 3): six Biders in `lane_gallery` hold a line within ±0.4 m laterally for the 40 m run in 20 of 20 seeded runs; one line round from the walkway centre frees all six; three hold file in `lane_street`; in open ground no three are collinear within 0.5 m for more than 1 s; wave-B style spawns with offsets −1 / 0 / +1 and 2.5 m stagger: no straight line from a walkway node passes within 0.3 m of all three for more than 0.5 s.
- [ ] **Transit**: telegraph 0.9 s with the thread frozen for the last 0.25 s; a body hit during `aim` cancels and restarts from `plant`; first stake at a fresh target misses; relocation after 2 shots to a `firing_point` 12–25 m away; a stake is burst by a shot; stuck stakes never exceed 18.
- [ ] **Tamper** (test 5): a charge into a rib yields `charge_stun` in 20 of 20 runs; from 600: one line round through the chest knot from the front leaves 300 in `line_stagger` with both vents open for 3.0 s; a second line round, or two lead rounds into a vent, then kills; **one line round never kills**; a line round through plate away from the knots does 300 and no stagger; in the vignette plate hits do 0 and a vent hit or a line round emits `enemy/damaged`.
- [ ] **Boss**: phase 1 order and timings (6.6 s, haul 3.5 s); the lamp of each mouth goes out as it fires; 10 hits end it; **parry is not dominant** (test 9: parry every stake, never shoot in a haul → 0 pips); parley timeline, the free-cylinder window and the refusal path; phase 2 pawls → guard released ≥ 3.0 s; a line round through the guard = 3 hits; lance blocked by a rib; adds caps; phase 3a relight after 4.0 s, `boss/charge_required` at 12 s or the first relight and never after a kept load; head-dry after a clean six; the hush: projectiles burst, no attack, **the arm at the opposite index within 1.8 s of game time**; proof frees every Bider; 3b does zero damage in 120 s; kill sequence ends with `boss/defeated`; `setBossPhase` puts each phase in its starting state; `applySave` restarts at the saved phase with the parley skipped; mercy at 2 deaths.
- [ ] **No hit over 38**; fan: at most 2 stakes damage per fan.
- [ ] **Budget and determinism**: the `bore` scene in phase 2 with 3 adds, 8 stakes in flight, 18 stuck, 2 rings: your `fixedUpdate + update` ≤ **1.0 ms** median; ≤ 4 `lineOfSight` per frame: `__dbg.ext.core.collisionCounts(true)`, `perfRun(n)`, then `collisionCounts().peak.sight` (`collision.stats.rays` counts every ray kind together, so it cannot answer this); allocation ≤ 6 KB per tick, measured with `measureAlloc` of `tests/harness.mjs` (3000 ticks of warm-up); equal `hash()` across two runs and across tiers.

## 7. Definition of done (measured)

1. `npx tsc --noEmit` clean in your files (`npx tsc --noEmit 2>&1 | grep -E 'src/enemies|sandbox/enemies|tests/enemies'` prints nothing); `npx vitest run tests/enemies` and `node --test tests/enemies/` pass. **Wired in: `KEEP7_REAL=enemies node --test tests/core/` passes**: boot, flow, walk, seam, determinism, alloc, budget and playthrough then run on the index page with your system in its slot and core stubs in the other five (about 2.5 minutes, up to 3.5 on a busy machine: run it in your final pass, not while iterating). Plain `node --test tests/core/` keeps core stubs in all six slots and **never loads `src/enemies/`**: it proves nothing about your system. `KEEP7_REAL` has only ever run against modules that wrap the stubs: a failure your system causes by design (a stub-specific value in an assertion) is a request to core in `docs/requests/code-enemies.md` naming the test and both values, listed in your report, not something to work around (README 4.1).
2. Numbers reported: `systemMs` for enemies in each sandbox scene's worst tick; rays per frame; allocation per tick; the 20-of-20 results; freed counts per difficulty.
3. `shots/code-enemies/` (opened by you): one overlay screenshot per scene; a `shotSeries` of a Bider freeing (0, 4, 20, 54 ticks, 3.2 s), a Transit aim (thread at 0.3, 0.65, 0.9 s), the Tamper slam ring and `line_stagger`, each boss phase, the hush with the arm opposite, the kill sequence.
4. A report listing every GDD number you could not implement as written, every fallback from GDD 20.1 you took, and what must be re-checked when final art lands (vent axis, clip poses, lamp indices).

## 8. Non-goals

Encounter triggers, waves, door locks, drops, the ammo floor, checkpoints, objectives
(world); the player's damage scaling and grace (player); telegraph visuals' look, rings,
threads, bursts, halos, blob shadow rendering (render: you call the pooled API); every sound
(audio hears your events); boss pips on the HUD (UI reads `ctx.enemies.boss`); a fourth
archetype; hitscan enemies; enemies entering over walls; Transits in the boss room; a boss
that leaves the gantry.

## 9. Dependencies and stubs

- **Art** (`art-enemies`, `art-boss`): placeholders with every final bone, node, lamp set and clip are in the game. Your code must run identically on placeholder and final assets; never read a clip's duration for gameplay.
- **World**: in your sandbox the stub world gives you `builtZones`, `doorState`, `flag` and nothing else; your scenes' buttons stand in for the director. The Dowser vignette's end: world emits `vignette/state { id: 'vig_dowser', stage: 'ended' }`; hide the card when you hear it (you emit only `started`).
- **Render**: the `basicRender` stub records `vfx.*`, `lamps.*`, `setEmissive` calls in `debugState().calls`: assert on those. `acquire*` may return `null` (pool empty): handle it.
- **Player**: the dummy player takes `applyDamage` and fires rays that call your receivers.
- **Your tests load only your system**: `openGame(server, { piece: 'code-enemies' })` on the index page defaults to `stubs: othersThan('enemies')` (five core stubs beside you); leave the default. Deaths, restarts and warps inside a script: `game.step / until / run` survive them; in your own `page.evaluate` use `await __dbg.ext.core.stepAsync(n)` (a bare `__dbg.step` stops at the tick that queued the restore). Allocation: `measureAlloc` of `tests/harness.mjs` (3000 ticks of warm-up), ceiling 6 KB per tick. **`ctx.clock.tick` keeps counting while paused or loading**: timers that must stop with the game count ticks in your own `fixedUpdate` or use `clock.simTime` / `clock.unscaledTime` (README 4.1).
- **A new run resets you through `enemies.clearAll()`** (core calls it in `flow.ts` on `play` / `again`, beside the player's reset and before `world.beginRun(null)`): it must leave no enemy, projectile, token, vignette or boss state behind, on the title as well as in play. You need not listen to `game/new_run` for it.
- **`__dbg.ext.core.tokens()`** returns `EnemiesDebug.tokens` (the frozen `DebugHook` has no method for it): use it for the token test. `__dbg.ext.core.damage(…)` applies damage to the player through `applyDamage`.
- **Boss checkpoints beside the stub world**: the stub world commits `cp_boss_p1` / `cp_boss_p2` / `cp_boss_p3` when it hears **your** `boss/phase` (`p1`, `p2`, `p3a`) and `cp_boss_proven` on `boss/proven` (their markers stand 0.5 m apart, so they are not committed by proximity): emit those events exactly once per phase start, or a death beside the stub restores the wrong phase. The hook rejects an enemy kind or boss phase outside the contract unions before it reaches your `EnemiesDebug` (`__dbg.spawnEnemy: unknown id …`), and non-finite coordinates.
- **Nav**: `data.navPath` costs 0.0004 ms / about 0.1 KB for a short hop and 0.025 ms / 1.2 KB for the whole critical path (the returned array): call it on a repath event, never every tick.
- The cup detail in `vig_kneeler`: on frame 12 of `kneel_to_stand` detach `prop_cup_tin` from `hand_socket_r` and leave it standing on the trough rim as a plain instance; it is not a breakable in round 1.
