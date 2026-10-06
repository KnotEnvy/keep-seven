# Work order: `code-player`

Phase 3 (production, round 1). Module: **`src/player/`**. You are a fresh agent: this file
plus the documents it names are everything you need.

Read first: `CLAUDE.md`, `docs/PLAN.md`, `docs/workorders/README.md`; `docs/GDD.md` **5, 6
(all of it: 6.2–6.9 are your specification), 12.4, 15, 21 (tests 1, 8)**; `docs/ARCHITECTURE.md`
1, 3 (3.2 lifecycle, 3.3 loop, 3.5 who calls whom, **3.6 "A lead round", "A line round",
"Damage to the player", "The kept round"**), 5 (contracts: sections 2, 4, 5, 6 `player/*`
`weapon/*` `combat/*`, 8 `PlayerApi`), 6, 10, 11, 13; `docs/research/game-feel.md` 1, 2, 9;
`docs/research/tech-web.md` 9 (loop, zero allocation, pointer lock). Then read
`src/core/contracts.ts`, `src/core/stubs/dummyPlayer.ts` (what you replace), `src/core/sandbox.ts`.

**The foundation as built (binding; where it and this order disagree about the harness, the
hook or the engine, it is what the code does):** `docs/FOUNDATION_REPORT.md` sections 3
(debug hook, harness, deaths inside a script, the new-run reset), 5 (sandbox, view-model
space, the three collision properties) and 9 (known gaps); `docs/requests/foundation-core.md`
section 4; `docs/requests/foundation-collision.md` sections 2 to 4; `tests/core/example.mjs`;
README section 4 ("Read first", "Standing on the foundation").

## 1. Mission

**Pillar 1: the gun is the star.** You write the hands: how the Reeve moves, and above all
how one trigger pull feels. Everything about a shot happens on the tick of the click (ray,
round removed, flash, report, kick, marker, target reaction), the camera returns exactly to
the aim point 320 ms later, and the sixth shot leaves the player 2.45 s from a full cylinder
with something running at her: "reload is where the fear lives". You also own the one
mechanic the whole stage is built toward: the sealed seventh round, which cannot be fired
anywhere but down the bore and can never be lost. Slow, loud, lethal, and exact: every
number below is the GDD's starting value; build it to the number, then tune only what a
test or a critic shows is wrong and record the change.

## 2. Owned files (exclusive)

```
src/player/**                index.ts (exports exactly createPlayerSystem) + your files, e.g. defs.ts, controller.ts,
                             camera.ts, weapon.ts, shots.ts, viewModel.ts, health.ts, debug.ts
sandbox/player.html  sandbox/player.ts
tests/player/**
shots/code-player/**
docs/requests/code-player.md
```

Import rule (enforced by `tests/core/imports.spec.ts`): files under `src/player/` import only
from `src/player/`, `src/core/`, `three`, `three/examples/jsm/*.js`, `three-mesh-bvh`,
`postprocessing`. Never from another module. Never edit `src/core/`, `design/*.json`,
`package.json`, other modules, or `tests/harness.mjs`.

## 3. Contracts you implement and consume

- **Implement** `PlayerSystem` = `GameSystem` + `PlayerApi` + `Saveable<PlayerSave>` (contracts section 8): `position`, `velocity`, `eye` (interpolated), `forward`, `yaw`, `pitch`, `grounded`, `sprinting`, `alive`, `health`, `maxHealth`, `weapon: WeaponView` (`phase`, `cylinder` with chamber 0 under the hammer, `chambered`, `reserve`, `lineRounds`, `seventh`, `shotsFired`, `keptAimLegal`), `applyDamage`, `givePickup`, `giveLead`, `giveLineRounds`, `takeStoneRound`, `setKeptContext`, `teleport`, `setControl`, `setGodMode`, `debug: PlayerDebug` (`setHealth`, `setAmmo`, `setAim`, `setSeventh`), `captureSave`, `applySave`, `debugState`.
- **Export** from `src/player/defs.ts`: `WEAPON: WeaponDef` and the player constants, each with its GDD section in a comment. No other module hardcodes these numbers.
- **Emit**: `player/spawned|damaged|healed|health_segment|died|footstep|jumped|landed|control`, `weapon/fired|dry_fire|reload|line|kept|ammo|seventh`, `combat/hit`, `combat/line_resolved`. Payloads are reused scratch objects.
- **Listen**: `options/changed` (sensitivity, invertY, fov, headBob, screenShake, reduceMotion, reduceFlashes, sprintMode, fireMode, difficulty), `boss/charge_required` (seventh `sealed` → `pulse`), `game/state`.
- **Direct calls you may make** (ARCHITECTURE 3.5): `ctx.collision.*`; `HitReceiver.onHit` on what your rays hit; `ctx.render.vfx.muzzleFlash`, `ctx.render.addTrauma`; `ctx.clock.slowMotion`; `ctx.input.*`; `ctx.assets.instantiate('weapon_revolver')`; `ctx.options.value`; `ctx.rng.fork('player')`. Nothing else: no audio call (audio hears your events), no UI call, no world or enemies call.
- Asset: `weapon_revolver` (bones `gun`, `cylinder`, `hammer`, `round_1…round_6`, `kept_loop`; empties `muzzle`, `eject`, `cam_look`; 15 clips). The placeholder in the game already has these names and durations.

## 4. Deliverables: every behaviour, with its number

### 4.1 Movement (GDD 5; `game-feel.md` 1.2)
- [ ] Capsule radius 0.35, height 1.8, eye 1.65 (constants from contracts). Quake-style ground / air model on the 60 Hz fixed tick: run **5.0 m/s**, sprint **6.75 m/s** (forward only; firing cancels sprint; reload allowed while sprinting; `sprintMode` hold or toggle), backward ×0.9, strafe ×1.0; ground accelerate **12**, friction **8**, stop speed **2.0 m/s**; air acceleration 12 m/s², no air friction, horizontal speed capped at take-off speed.
- [ ] Gravity **24 m/s²**, jump velocity **6.93 m/s** (apex 1.0 m, air time 0.58 s), coyote **0.10 s**, jump buffer **0.10 s**. No crouch, no fall damage.
- [ ] Collision through `ctx.collision.resolveCapsule` with **3 sub-steps** (`speed × dt / subSteps < radius`), walkable limit **45°** (`walkableCos = cos 45°`), **step-up 0.35 m** by lift-move-drop using `resolveCapsule` + `groundHeight`, step smoothing of the eye at 18 /s. No sliding on walkable ramps. Never tunnels at 60 m/s.
- [ ] **Three engine properties your controller must handle** (ARCHITECTURE 6; pinned in `tests/core/collision.spec.ts`, "what a controller has to know"; the stub's answers are at the top of `src/core/stubs/dummyPlayer.ts`). **(a) The engine's own ledge lift is one radius, not 0.2 m.** `resolveCapsule` carries a capsule pressed into a ledge onto any walkable top below the centre of its lower sphere (0.35 m above the feet) and can leave it up to 0.14 m above that top (measured: a ledge 0.30 m up → lifted 0.305 m; 0.34 m up → 0.475 m, in the air; 0.36 m up → a wall). Your own lift adds to it (step 0.35 → up to 0.70 m) and **a jump reaches apex + 0.35 m**: with the 1.0 m apex the layout's four 1.3 m cover solids would be mounted. So check the height really gained after every move, on the ground and in the air; refuse a step that gained more than 0.35 m and a landing higher than the jump's apex above the take-off ground. **(b)** A `groundHeight` ray that starts inside a solid leaves through its underside and reports that: probe for a ledge from above anything climbable and refuse what is too high (the Tally House floor slab over the hatch stair was climbed from 0.49 m below this way). **(c)** The ground under the capsule's centre says nothing about its rim: when snapping down, resolve the capsule at the new height and keep the engine's answer. Wedges: two walls meeting at 5° or more are resolved exactly; below 5° the capsule can be squeezed 2 to 3 cm in (none in the layout). The step-up recipe that works with this engine is in `docs/requests/foundation-collision.md` 4 (test `capsuleFree` 0.35 m up and 0.13 m ahead, bisect down, `resolveCapsule`, accept when `grounded`).
- [ ] `teleport(x, y, z, yawDeg, pitchDeg)` snaps the interpolator; `setControl(enabled, reason, lockLook?)` gates movement and weapon input (look stays unless `lockLook`) and emits `player/control`.
- [ ] Events: `player/footstep` every **1.9 m** of ground travel (run) / **2.3 m** (sprint) with the ground surface from `CapsuleResolve.groundSurface`; `player/jumped`; `player/landed` with speed and surface.

### 4.2 Look and camera
- [ ] Look applied in `update` from `input.consumeLook`, **per rendered frame, unsmoothed, never time-scaled**: **0.07° per count** × sensitivity (0.2–4), invert-Y option, pitch clamped ±89°. You own `ctx.scene.camera`'s transform and FOV (render owns aspect).
- [ ] FOV `options.fov` (default 62°, range 50–80, vertical). Sprint FOV **+4° in 0.2 s**. FOV punch per shot **+1.2° for 80 ms** (none for the kept round).
- [ ] Bob **0.028 m vertical / 0.014 m lateral** scaled by `options.headBob` (0–1.5), in phase with footfalls; strafe roll **1.0°**; landing dip **0.012 m per m/s, max 0.12 m, 0.22 s** recovery.
- [ ] Camera kick per shot (lead and line): **+2.5° pitch, ±0.4° yaw (seeded), peak at 55 ms, back exactly on the aim point by 320 ms**. Kept round: +3.5°, peak 80 ms, recovered by 600 ms. The kick is an additive offset that returns to zero: it never moves the stored aim.
- [ ] Trauma: on fire `ctx.render.addTrauma(0.25)` (kept 0.15); on damage +0.3 to +0.6 by damage (linear over 10–38 HP). Render applies the shake.
- [ ] `options.reduceMotion`: bob 0, no FOV kicks or punch, no strafe roll, no trauma requests.
- [ ] Interpolation: previous / current sim transforms (`core/interp.ts`) blended by `alpha` in `update`; `eye` is the interpolated value.

### 4.3 Health (GDD 5)
- [ ] 100 HP in three segments **34 / 33 / 33**. The current segment regenerates after **4 s** without damage at **12 HP/s** (emits `player/health_segment` when regeneration starts / stops; `player/healed` when a segment completes or a canteen is used).
- [ ] `applyDamage(info)`: × difficulty (`easy` 0.6, `normal` 1.0, `hard` 1.4; read live from options); **the last 20 HP absorb ×0.75**; **last-hit grace: a fatal hit taken from above 25 HP leaves 1 HP and 0.75 s of immunity** (`graceUsed` in the event); god mode; returns the damage applied. Emits `player/damaged` (with the source position for the HUD arc) or `player/died`. Never a hit over 38 before scaling (assert in dev).
- [ ] `givePickup`: `pk_rounds_6` +6 and `pk_rounds_12` +12 reserve (cap **36**; returns false at the cap); `pk_canteen` restores the current segment to full, and the next one too if the current is already full; ignored (false) at 100 HP.
- [ ] `giveLead(amount, floor)`: tops the reserve up to `floor` when `floor > 0` (the refill box: 18), else adds `amount` (boss-room box: 6) up to the cap; returns rounds added. `giveLineRounds(n)`: carry cap **2**; returns rounds accepted.

### 4.4 The weapon state machine (`WeaponPhase`; GDD 6.2–6.6)

`WEAPON`: cylinder 6, `reserveCap` 36, `startReserve` 24 (start 6 + 24), `lineRoundCap` 2, `fireBuffer` 0.15, `bloomPerShotDeg` 1.5, `bloomDecaySeconds` 0.35, `reloadOpen` 0.35, `reloadPerRound` 0.30, `reloadClose` 0.30, `reloadFastClose` 0.20, `loadLine` 0.55, `unloadLine` 0.35, `loadKept` 1.8, `unloadKept` 0.3.

| Ammo | range | damage | weak ×  | plate × | pierces | cadence | camera kick | view kick | FOV punch | trauma |
|---|---|---|---|---|---|---|---|---|---|---|
| `lead_round` | 200 m | 100 | 2 | 0.25 | no | 0.48 s | 2.5° / ±0.4°, peak 55 ms, recover 320 ms | 0.08 m, 20°, 0.3 s | 1.2° / 80 ms | 0.25 |
| `line_round` | 60 m | 300 flat | 1 | 1 | yes | 0.48 s | same | same | same | 0.25 |
| `kept_round` | scripted | — | — | — | — | — | 3.5°, peak 80 ms, recover 600 ms | 0.11 m, 26°, 0.6 s | none | 0.15 |

- [ ] **Fire** (`fire` pressed, or held with `fireMode: 'hold'` repeating at cadence): legal in `ready`; one shot per click; next shot refused before **0.48 s** and accepted at 0.48 s; **a click in the last 0.15 s of the cycle fires on the first legal tick** (fire buffer). Spread 0° rested, standing or moving; bloom +1.5° per shot decaying fully in 0.35 s (so normal cadence is always pinpoint; the bloom offset is seeded). Firing cancels sprint.
- [ ] **Empty cylinder**: a pull gives one `weapon/dry_fire { reason: 'empty' }` and starts the reload on that click (if reserve > 0).
- [ ] **Reload, per round, interruptible**: `R` with fewer than 6 chambered and reserve > 0. `reload_open` 0.35 → `reload_round` 0.30 each (emits `weapon/reload { stage: 'round' }` and moves one round from reserve to cylinder at the seat moment) → `reload_close` 0.30. **Full reload from empty 2.45 s.** Fire pressed during a reload: finish the round in hand, `reload_fast_close` 0.20, fire: **worst case 0.50 s**. Allowed while sprinting. Emits `weapon/reload` for `open`, each `round`, `close` / `fast_close` and `weapon/ammo` whenever counts change.
- [ ] **Line round** (`Q`, GDD 6.4): with ≥ 1 held, in `ready`: `load_line` 0.55 s: seats a line round **under the hammer** (chamber 0 becomes `line`); the displaced lead round, if any, returns to the reserve; emits `weapon/line { stage: 'loaded' }`. `Q` again before firing: `unload_line` 0.35 s, back to the carry (`'unloaded'`). The next shot is the line round.
- [ ] **Kept round** (`F`, GDD 6.6; ARCHITECTURE 3.6): see 4.6.
- [ ] The cylinder model: six `ChamberState`s; firing empties chamber 0 and rotates the ring one notch; reload fills empties in order. `shotsFired` counts every trigger pull that fired.

### 4.5 Shot resolution (all inside your `fixedUpdate`, on the click's tick)
- [ ] **Lead**: `collision.raycast(eye, aim, 200, LAYER_SHOT, hit)`. If `hit.receiver`: fill a scratch `DamageInfo` (`amount` 100, `kind: 'bullet'`, `source: 'player'`, `ammo`, monotonic `shotId`, origin and direction) and call `receiver.onHit(hit, damage, response)`; the receiver applies weak-point and plate multipliers and returns the outcome. No receiver: outcome `impact`, or `deflected` when `hit.flags & ColFlag.GRILLE` (compute the reflected direction for the ricochet fields). Then emit **`weapon/fired`** (muzzle position from the view-model's `muzzle` node, eye origin, direction, end point, `chambersLeft`), then **`combat/hit`** (outcome, entity, part, surface, normal, damage, ricochet direction, `order: 0`). Call `render.vfx.muzzleFlash('lead', mx, my, mz)` and `render.addTrauma`. A miss into the sky still emits `weapon/fired` with the end point at range.
- [ ] **Line round**: `collision.raycastAll(…, 60, LAYER_SHOT, list)` (preallocated list, `MAX_LINE_HITS` 16). Walk near to far; stop at the first entry that is static or dynamic geometry without `ColFlag.PIERCE`, or whose response sets `stopsLine`. Apply entry *i* at tick offset `round(i × 2.4)` (40 ms apart) with `amount` 300 and `ammo: 'line_round'`, emitting one `combat/hit` each with `order = i`; after the last, `combat/line_resolved { bodies, freed, knots, endX/Y/Z }` (count from the responses: `freed` outcomes, entity kinds). Entities destroyed before their turn are skipped safely.
- [ ] "No bullet produces nothing": every pull that fires produces `weapon/fired` and at least one `combat/hit` (outcome `impact` on world, sky misses excepted with a far end point).
- [ ] Zero allocation: scratch `HitResult`, `HitList`, `HitResponse`, `DamageInfo`, event payloads created once.

### 4.6 The kept round (load-bearing; it must be impossible to waste or lose)
- [ ] `seventh: SeventhState` starts `sealed` and is shown from the first frame (the HUD reads it). `boss/charge_required` while `sealed` → `pulse`. Emits `weapon/seventh` on every change.
- [ ] `setKeptContext(ctx | null)` is called by world while the player stands on a lit proving mark. **Copy** the context (do not keep the reference).
- [ ] **`F` with no context**, or after the round is spent: emit `weapon/kept { stage: 'denied', mark: '' }` (HUD shiver, dead click; world decides narration). No state change.
- [ ] **`F` with a context**, weapon `ready`, seventh not `spent`: `weapon/kept { stage: 'loading', mark }`, phase `loading_kept`, clip `load_kept` **1.8 s of sim time** (the hush slows time; do not use wall time). At the end: chamber 0 becomes `kept` (a displaced round returns to reserve or carry), seventh → `chambered`, `weapon/kept { 'chambered' }`. Input other than look is ignored during the load.
- [ ] While chambered, each tick test the aim ray **analytically** against the bore cylinder of the copied context (axis `boreX, boreZ`, radius `boreRadius` 3.0, from `boreTopY` −42.8 down to `boreBottomY` −50): `keptAimLegal` = the ray enters that volume (through the top disc or the side). No collision query: kerb, guard and boss take no part.
- [ ] When `keptAimLegal` turns from false to true emit `audio/cue { cue: 'listen_tick', positional: false, gain: 0.5, pitch: 1 }` once (GDD 6.6 rule 4: the crosshair and a soft tick tell her before the trigger does).
- [ ] **Fire while chambered**: legal aim → `weapon/kept { 'fired' }` then `weapon/fired` with `ammo: 'kept_round'` (end point where the ray meets the cylinder), clip `fire_kept` 1.2 s, kick as the table, `vfx.muzzleFlash('kept', …)`, seventh → `spent`, chamber 0 empty. Illegal aim → `weapon/dry_fire { reason: 'kept_not_in_bore' }`; the hammer does not move; nothing is consumed.
- [ ] **Leaving the mark**: feet farther than `leaveRadius` (2.5 m) from `markX/Y/Z` before firing → `unload_kept` 0.3 s, `weapon/kept { 'unloaded' }`, seventh → `band_broken`. It can be loaded again at any mark, as often as needed (from `band_broken` the load plays the same clip).
- [ ] Reload and `Q` are refused while the kept round is chambered. Death with it chambered: `applySave` restores the saved seventh state.
- [ ] `takeStoneRound()`: clip `take_round` 1.0 s, seventh → `violet`.

### 4.7 View-model
- [ ] `assets.instantiate('weapon_revolver')` added to `ctx.scene.viewModel` in `start()` (render draws that group with its own 52° projection). **Children of `scene.viewModel` are in camera space** (camera at the origin, looking down −Z, +Y up: as `art-weapons` authors the gun). **Render** gives the group the world camera's pose before its second pass (it copies `camera.matrixWorld` onto the group, `matrixAutoUpdate = false`) and draws it with its own 52° camera at that pose; a world-space position of a node under it (the `muzzle`) is therefore right after `render()` or after `group.updateMatrixWorld()`. **Player never transforms the group itself**, only what it added (kick, bob, sway on the instance root). `basicRender` does exactly this (`tests/core/sandbox.test.mjs`, "view-model: ..."), so the muzzle position you put into `weapon/fired` on the click's tick needs `ctx.scene.viewModel.updateMatrixWorld()` first. Clip state machine mapping `WeaponPhase` to clips with cross-fades ≤ 60 ms: `idle`, `sprint`, `draw` (on spawn and after rides), `fire`, `dry_fire`, `reload_open`, `reload_round`, `reload_close`, `reload_fast_close`, `load_line`, `unload_line`, `load_kept`, `unload_kept`, `fire_kept`, `take_round`. **Gameplay timers never read a clip's duration**: they use `WEAPON`.
- [ ] Code-driven bones: `round_1…round_6` scaled 1 for a loaded chamber and 0 for an empty one, matched to the cylinder model (the ring turns 60° per shot in the `fire` clip; keep the logical-to-bone mapping right after each turn); `kept_loop` scale 1 while the seventh is `sealed`, `pulse` or `band_broken` (in its loop) and 0 once `chambered`, `spent`; 1 again in state `violet`.
- [ ] Procedural layers in `lateUpdate`: view-model kick (0.08 m back, 20° rise, 0.3 s; kept 0.11 m, 26°, 0.6 s) if not already in the clip (check the final art: the art bible puts the kick in `fire`; do not double it: a flag in `defs.ts`), bob, **sway lag of 2–3° against look input**, landing dip. All zero under `reduceMotion` except the clip.
- [ ] Mixer advanced in `fixedUpdate` with the scaled `dt`.

### 4.8 Save, debug, state
- [ ] `captureSave(): PlayerSave { health, cylinder, reserve, lineRounds, seventh }`. `applySave`: `max(saved, 60)` HP, `max(saved, 18)` reserve, **a full cylinder of lead**, the saved line rounds, the saved seventh (a `chambered` save restores as `band_broken`); weapon `ready`; velocity zero; immunity cleared. (On a restore, world teleports you to the checkpoint before this is called.)
- [ ] **A new run resets the player in core** (ARCHITECTURE 3.5; `src/core/flow.ts`). At the end of boot (after every `start()`), core keeps your `captureSave()` as the fresh-run state. `play` / `again` (and a death with no save) call `applySave(<a copy of it>)` **before** `world.beginRun(null)`. So: `captureSave()` right after `start()` must be the state a run begins with (100 HP, full cylinder, reserve 24, no line rounds, seventh `sealed`), **the floors must leave that state as it is** (they do: 100 ≥ 60, 24 ≥ 18), and `applySave` may arrive on the title or the ending, while she is dead and before the world has placed her; it must leave her alive with every per-run field reset (grace, regeneration timers, weapon phase, kept context). Nobody listens to `game/new_run` to reset her.
- [ ] `PlayerDebug`: `setHealth`, `setAmmo(chambered, reserve, lineRounds)`, `setAim(yawDeg, pitchDeg)` (yaw 0 faces −Z, positive yaw turns left, positive pitch looks up), `setSeventh`.
- [ ] `debugState()`: position, velocity, yaw / pitch, grounded, weapon phase and timers, bloom, kick offsets, health segment, immunity, keptAimLegal: rounded, stable keys.
- [ ] `ctx.debug.register('player', { … })` for extras only (e.g. `spreadDeg()`, `phaseTimer()`).

## 5. Sandbox (`sandbox/player.html`, scenes by `?scene=` and buttons)

Real `createPlayerSystem` + core stubs. Must show (ARCHITECTURE 12):
- [ ] `course`: flat run, 30° / 45° / 60° ramps, 0.2 / 0.35 / 0.5 m steps, a 2 m gap, a low ceiling.
- [ ] `range`: one dummy `HitReceiver` for each `HitOutcome` (`impact`, `hit`, `weak`, `kill`, `freed`, `deflected`, `broke`, `parried`, `passed`), a row of five `PIERCE` plates with a body behind them, a grille, one patch of each surface type.
- [ ] `kept`: a kept-round mark and a bore disc built from the layout's `bore_opening` numbers, with the legal-aim state shown.
- [ ] An ammo-box stub and a line-locker stub (buttons that call `giveLead` / `giveLineRounds`), a damage button (each `DamageKind`), the real view-model with a button per clip.
- [ ] Live readout: speed, phase, cylinder, reserve, line rounds, seventh, spread, kick, health segments.

## 6. Tests (`tests/player/`; `npm run test:unit` for `*.spec.ts`, `node --test tests/player/` for `*.test.mjs`)

Pure logic as vitest specs (weapon machine, health, cylinder model, kept-ray cylinder test); behaviour through the sandbox page and `tests/harness.mjs` with `?test=1`.

- [ ] **Movement** (GDD 21 test 1; `game-feel.md` 9): hold forward from rest: ≥ 4.5 m/s within 0.13 s; release: stopped within 0.45 m; jump apex 1.0 ± 0.03 m, air time 0.58 ± 0.02 s; jump accepted 0.10 s after leaving a ledge; 0.35 m step climbed, 0.5 m not; 45° ramp walked, 60° not; no tunnelling at a forced 60 m/s; sprint 6.75 m/s forward only and cancelled by fire.
- [ ] **Fire**: round removed, `weapon/fired`, `combat/hit` and the recorded `vfx.muzzleFlash` call all on the tick of the input; next shot refused at 0.47 s and accepted at 0.48 s; a click at 0.40 s fires at 0.48 s (buffer); **aim within 0.05° of the pre-shot direction by 0.33 s**; six shots at cadence all land within 0.01° of the aim.
- [ ] **Reload**: from empty completes in 2.45 ± 0.05 s; fire during a reload produces a shot within 0.50 s; dry click on empty starts the reload; reserve bookkeeping exact over 100 seeded random action sequences (never negative, never over caps, rounds conserved).
- [ ] **Line round**: load 0.55 s displaces the lead round to reserve; unload 0.35 s; through five `PIERCE` plates and a body: six `combat/hit` with `order` 0–5 at tick offsets 0, 2, 5, 7, 10, 12, then `combat/line_resolved`; stops at an untagged wall; ends at 60 m.
- [ ] **Each `HitOutcome`** from the range reaches `combat/hit` unchanged; a grille gives `deflected` with a ricochet direction.
- [ ] **Health**: segment regeneration after 4 s at 12 HP/s, current segment only; grace leaves 1 HP and blocks damage for 0.75 s; last-20 absorb; difficulty scales; canteen rules; god mode.
- [ ] **Kept round** (GDD 21 test 8, player half): `F` without a context → `denied` and no state change; with a context on tick 0 → `loading`, chambered after 1.8 s of sim time; from the centre of each of six mock marks every aim from 5° to 60° below the horizon within ±25° of the bearing to the axis is legal and a level aim at the far wall is not; an illegal pull consumes nothing; leaving by 2.6 m unloads to `band_broken`; reload again works; after `fired` the seventh is `spent` and `F` gives `denied`; there is no input sequence (fuzz 500 seeded sequences) that ends with the seventh neither available nor `spent` after a legal fire.
- [ ] **Save**: `captureSave` round-trips through JSON; floors applied; `chambered` restores as `band_broken`.
- [ ] **Determinism and allocation**: two runs of one 600-tick script give equal `__dbg.hash()`; allocation of moving and firing in the sandbox ≤ 6 KB per tick, measured with `measureAlloc(game, body, …)` of `tests/harness.mjs` (3000 ticks of warm-up, the median of ten 60-tick batches, the event ring off: the one method every piece uses; below 3000 ticks the figure is JIT work, not your path).
- [ ] **Ledges and jumps against the engine** (4.1): in a room built with `__dbg.ext.sandbox.room(...)`: a 0.35 m step is climbed and the height gained is never more than 0.35 m in one move; a 0.5 m step is not climbed, pressed into at run and sprint speed, with and without a jump held off; **a 1.2 m box is not mountable by a jump** (apex 1.0 m); a 0.9 m box is; walking off the hatch stair under a floor slab never lifts her onto the slab.
- [ ] **Timers stop with the game**: a cooldown, the reload and the grace window do not advance while `paused` (a readable is a pause). `ctx.clock.tick` **keeps counting while the game is paused or loading**; count ticks in your own `fixedUpdate` (or use `clock.simTime` / `clock.unscaledTime`, which advance only while the sim runs), never stamp `clock.tick`.
- Deaths inside a test script: `game.step`, `game.until` and `game.run` of the harness go through `__dbg.ext.core.stepAsync / untilAsync` and survive a respawn; a bare `__dbg.step(n)` in your own `page.evaluate` stops at the tick that queued the respawn (one `console.warn`). Use `await __dbg.ext.core.stepAsync(n)` when a death can happen. Damage in a test: `__dbg.ext.core.damage(amount, kind?, source?, ox?, oy?, oz?)` goes through `applyDamage` (grace, the last-20 absorb, the arc); `setHealth` goes round them. `__dbg.ext.core.playerExtra()` → `{ control, controlReason, keptAimLegal, shotsFired }`, `ext.core.setSeventh(state)`.

## 7. Definition of done (measured)

1. `npx tsc --noEmit`: no errors in your files (`npx tsc --noEmit 2>&1 | grep -E 'src/player|sandbox/player|tests/player'` prints nothing). `npx vitest run tests/player` and `node --test tests/player/` pass. **Wired in: `KEEP7_REAL=player node --test tests/core/` passes** (boot, flow, walk, seam, determinism, alloc, budget and playthrough then run on the index page with your system in its slot and core stubs in the other five; about 2.5 minutes, up to 3.5 when other suites share the machine: a final-pass step, not an iteration loop). Plain `node --test tests/core/` keeps core stubs in all six slots and **never loads `src/player/`**: it proves nothing about your system. `KEEP7_REAL` has only ever run against modules that wrap the stubs, so a failure there that your system causes by design (a stub-specific value in an assertion) is a request to core in `docs/requests/code-player.md` with the test name and the two numbers, not something to work around; report it and the rest of the run. Details: README section 4.
2. JS cost: your `fixedUpdate + update + lateUpdate` ≤ **0.4 ms** median and ≤ 1.0 ms worst over the sandbox range script (report `perf.systemMs`).
3. `shots/code-player/` (960 × 540, opened by you): `course.png`, `range.png`, `viewmodel_idle.png`, a `shotSeries` of one shot at ticks 0, 1, 3, 6, 12, 19, 29 (`fire_t00.png` …), `reload_series_*.png`, `kept_legal.png` / `kept_illegal.png`, `readout.png`.
4. Report: every GDD number you changed and why; what the placeholder view-model hides (things to re-check when `art-weapons` lands); known gaps.

## 8. Non-goals

Interaction (`E`), prompts, pickups' placement, puzzles, narration (world); enemy reactions,
aim assists that widen targets (the receivers own their radii), enemy accuracy assists
(enemies); muzzle flash sprite, tracers, impacts, decals, shake application, the view-model
render pass (render); sounds (audio hears your events); HUD (UI reads `ctx.player`);
crouch, lean, ADS, alt-fire, fan-the-hammer, melee, gamepad.

## 9. Dependencies and how to work without them

- **View-model art** (`art-weapons`): the placeholder has every bone, node and clip with final names and durations. Build against it; your code must not care which is loaded.
- **Render**: in your sandbox the core `basicRender` stub records `vfx.muzzleFlash` and `addTrauma` calls in its `debugState().calls`: assert on those. The real second-pass projection is render's.
- **World** sets `KeptContext`, calls `givePickup / giveLead / giveLineRounds / teleport / setControl / takeStoneRound`; your sandbox buttons stand in for it.
- **Enemies** call `applyDamage`; receivers in the real game are theirs and world's: your range receivers define the contract you rely on (a receiver fills `HitResponse` completely).
- **Core flow** calls `applySave` after world has teleported you (order: enemies, world, player), and once more at the start of every new run, before the world has placed you (4.8).
- **Your tests never load the other five modules.** `openGame(server, { piece: 'code-player', … })` on the index page defaults to `stubs: othersThan('player')`: your system beside five core stubs (`?stubs=enemies,world,render,audio,ui`). Leave the default; the sandbox page does the same by construction.
- **The stub world beside you** commits by proximity only the checkpoints that are places; encounter and puzzle checkpoints commit through `clearEncounter` / `solvePuzzle`, the four boss checkpoints on `boss/phase` and `boss/proven` (the stub's `setBossPhase` emits them). `__dbg.checkpoint(id)` warps to any of them; a death then restores that one.
