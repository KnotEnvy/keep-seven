# Requests and notes from `code-player` (phase 3, round 1)

Owner of `src/player/`, `sandbox/player.*`, `tests/player/`. Nothing outside those files was edited.

## 1. To core (`tests/core/`, `src/core/stubs/basicRender.ts`): what `KEEP7_REAL=player` trips over

Measured again on 2026-10-04 with the FINAL `weapon_revolver.glb` in place: `KEEP7_REAL=player node --test tests/core/`
gives 68 tests: 57 pass, 6 fail, 5 skipped (1168 s at a load average of 100 to 150; log
`scratch/code-player/keep7_real_2.log`). Three failures come with the real player, three do not (section 2).

**Run again after the fix round of 2026-10-04** (`scratch/code-player/keep7_real_3.log`, 265 s): 68 tests, 58 pass,
5 fail, 5 skipped. The same five as the critic's run, unchanged by the fixes: the two rows below that come with the
real player (`alloc.test.mjs` 13118 B per tick + frame, `walk.test.mjs` followPath 24.6154 for 24.1824), and three
that fail with core stubs in every slot (section 2: random walks "inside a solid" at tick 0, `restart_checkpoint`
y 14.0041, viewer `ia_bore_door`). **The gate `KEEP7_REAL=player` stays red until core changes the three assertions
of this table**; nothing in `src/player/` can turn them green without breaking the GDD (friction, a six-shot gun).

| Test | Assertion | Stub value | Real value | Why |
|---|---|---|---|---|
| `alloc.test.mjs` "600 ticks of walking and shooting beside six enemies…" | `perTickPlusFrame <= 6144` | 2714 B | **13120 B** per tick + rendered frame (448 B per tick with shots, 250 to 466 walking: the ticks are fine) | **Not player code: three re-resolves a program twice a frame in `basicRender`.** The final gun's `arms_mesh` uses the shared material `m_prop`; the six stub enemies in the world pass use the same material object. `basicRender.render` draws the world as `roots.scene` (fog on) and the view-model as `r.render(roots.viewModel, viewCamera)`: a Group, so `fog` is null in that pass. `setProgram` sees `materialProperties.fog !== fog` on each pass and calls `getProgram` → `getParameters` + `getProgramCacheKey` (6.4 + 1.6 + 1.0 KB per frame in the heap profile, `scratch/code-player/alloc_game.mjs`). Proof: the same script with `scene.fog = null` measures **2864 B**. The dummy player's box never shared a material with the world. Player cannot fix it inside its files (cloning the instance's materials would cut a real renderer's shared uniforms). **Request to core**: in `basicRender` draw the view-model pass with the same fog state as the world (e.g. keep the group under a second `THREE.Scene` whose `fog` is the world's, or give the stub's fallback materials `fog: false` in both passes). **Request to `code-render`**: the same rule for the real second pass: fog, lights, tone mapping and output colour space must be equal in both passes for any material the view-model shares with the world, or the view-model gets its own material instances; otherwise every frame pays two program look-ups (CPU as well as garbage). |
| the same test, line 66 (masked today by the row above) | `s.stats.roundsFired >= 90` | one round per `tap('fire')`, every 20 ticks, forever | about 30 rounds: cadence 0.48 s, six per cylinder, 24 in reserve, then dry clicks | GDD 6.2, 6.3, 6.5. Suggested: `roundsFired >= 20`, or `setAmmo(6, 36, 0)` every 120 ticks inside `fightTicks`, and the ring check `recorded >= 10` |
| `walk.test.mjs` "followPath stops with gate, portal and no_path…" (line 103) | after a walk ends, 30 more ticks leave `x, z` unchanged | the dummy sets velocity from input each tick: it stops dead (24.1824) | she glides to a stop: 0.433 m (24.1824 → 24.6154) | GDD 5 / game-feel 1.2: ground friction 8 and stop speed 2.0 m/s, "stopped within 0.45 m" (GDD 21 test 1). Suggested: assert that nothing is HELD (velocity 0 after 30 ticks, or the distance under 0.45 m) |

## 2. For the integrator: `tests/core` failures in that run that are not the player's

Checked on 2026-10-04 against core stubs in all six slots (plain `node --test tests/core/walk.test.mjs`, and a
teammate's plain run of `flow`, `sandbox`, `stubs` the same morning): these fail the same way with no `src/<piece>/` loaded.

- `walk.test.mjs` random walks: `capsuleFree` is false at the very marker of `cp_lip_start` (16, 14, 107.5), before
  anything moves (the dummy player too): the final `env_the_lip.glb` collider sits through the layout's terrain at the spawn.
- `flow.test.mjs` "ui/action: restart_checkpoint…": she stands 4 mm above `player_start` (14.0041 for 14): the ground at
  the start is no longer flat (a capsule on a slope rides above it, foundation-collision 4).
- `sandbox.test.mjs` "viewer ?asset=…": `ia_bore_door [final]` (an art piece's asset).
- `stubs.test.mjs` "real time: the dev page runs its own loop…": the page is opened with `?stubs=all` (the dummy player
  whatever `KEEP7_REAL` says) and timed out on a 90 s wall-clock `waitForFunction` in a 1168 s run; it passed in the
  plain run (371 s for that one test). Machine load, not a system.

## 3. Departures from the GDD / the order (each one decided, not left open)

- **D1 (GDD 5, "Air acceleration … horizontal speed capped at take-off speed").** The cap is
  `max(take-off speed, 2.5 m/s)` (`defs.ts AIR_MIN_CAP`). With the literal rule a jump from rest (or pressed against
  the ledge one wants to mount: the wall has taken the speed) cannot be steered at all, and no ledge can be mounted
  from a standstill. 2.5 m/s is half a run: it never gains speed over running and cannot bunny-hop. GDD owner: please
  ratify or overrule (one constant).
- **Bob amplitude.** "0.028 m vertical / 0.014 m lateral" is implemented as the full excursion: the eye dips up to
  0.028 m at each footfall and comes back to the eye line mid-stride; laterally ±0.014 m over two footfalls. Scaled by
  `headBob`. (Reading it as ±0.028 would be twice as strong.)
- **Sprint and fire.** Firing cancels the sprint for the 0.48 s cycle; a held sprint key resumes after it (toggle mode:
  the toggle is cleared). GDD: "firing cancels sprint".
- **Reload seat moment.** A round is moved from the reserve into the cylinder 10 ticks into each 0.30 s
  `reload_round` (art-weapons: "pushed home on frame 5"); the full reload is still 2.45 s.
- **Fire pressed during `reload_open`** with rounds in the cylinder goes straight to the 0.20 s fast close (nothing is
  in hand yet), so the worst case stays 0.50 s. With an EMPTY cylinder one round is seated first: worst case
  0.35 + 0.30 + 0.20 s.
- **Unloading a line round** (`Q` again) returns it to the carry and puts the lead round it displaced back under the
  hammer (from the reserve), so `Q`, `Q` changes nothing (GDD 6.4 rule 2; fixed 2026-10-04, it used to leave the round
  in the reserve and an empty chamber, so toggling `Q` drained the cylinder). A line round seated in an EMPTY chamber
  unloads to an empty chamber (no free reload); the cylinder is then compacted (loaded chambers first), as after
  `unload_kept` and `fire_kept`.
- **Loading the kept round** thumbs out the round under the hammer (lead to the reserve, line to the carry), exactly as
  the line round does. **No round is ever discarded** (fixed 2026-10-04): a displaced lead round that finds the reserve
  at its cap of 36 is kept in hand (`Weapon.spare`, `__dbg.ext.player.extra().spare`; not shown by `WeaponView.reserve`,
  which never exceeds 36) and goes back under the hammer when the line round is unloaded, or into the reserve at the
  next seat of a reload. `extra().discarded` stays in the readout and is always 0.
- **`F` pressed during a reload** ends the reload (round in hand, fast close) and then loads the kept round; during any
  other phase it is queued until the gun is ready (and dropped if the context is gone by then).
- **`draw` (0.5 s, phase `drawing`)** plays when control is given back after it was taken (`setControl(false)` then
  `true`: rides, the start of a run). A click at ANY moment of the draw is kept and fires on the first ready tick
  (fixed 2026-10-04: the trigger used to be dead for its first 0.35 s); only a fire edge on the very tick control came
  back is ignored (the click on the canvas that started or resumed play is not a pull). `applySave` leaves the gun `ready` (order 4.8).
  A test script that fires right after `start()` gets its shot on the tick the draw ends, not on the tick of the tap.
- **Hold to fire on an empty cylinder** (GDD 15 `fireMode: 'hold'`, GDD 6.3): the held trigger gives ONE dry click and
  the reload starts on it; held on, it does not interrupt that reload (only a fresh press does) and fires again when
  the gun is ready. With nothing to reload: one dry click per hold.
- **The fire buffer covers `load_kept`** (GDD 6.2 "same"): a click in the last 0.15 s of the load is a pull on the first
  ready tick: down the bore with a legal aim, the `kept_not_in_bore` dead trigger otherwise. Earlier clicks are ignored
  (GDD 6.6).
- **`sprinting` is measured** (fixed 2026-10-04): `PlayerApi.sprinting`, the +4 degree FOV, the `sprint` clip and the
  footstep's `sprint` flag are true only with the sprint input, forward, and a horizontal speed above 5.2 m/s (a run
  tops out at 5.0). Pressed against a wall or steering a standing jump she is not sprinting; from rest it turns true
  4 to 6 ticks after the keys; a sprint jump keeps it in the air (air cap = take-off speed). Enemies reading
  `player.sprinting` for the accuracy assist get the real thing.
- **Look outside `playing`**: `update()` always drains `input.consumeLook` but turns the view only while
  `ctx.state.current === 'playing'` (and alive, and not `lockLook`): the camera does not move behind a readable or the
  pause menu, and the counts of a pause are not saved up.
- **FOV punch**: the full +1.2 degrees is drawn on the click's tick and decays linearly to 0 by the tick at 83 ms
  (1.2, 0.95, 0.7, 0.45, 0.2, 0).
- **Ramps at the walkable limit**: within a rounding of 45 degrees `resolveCapsule` carries a capsule over a ramp's
  crest (0.15 to 0.2 m past it) without calling it `grounded`. The controller's snap-down accepts the engine's
  position there when the ground under her centre is a walkable slope and nothing pushed her sideways, so walking
  down 37 and 45 degree ramps at a run or a sprint never leaves the ground (no engine change needed).
- **A kill volume** (`DamageKind 'kill_volume'`) kills from any health through the grace window and the immunity:
  GDD 5 "lethal drops are kill volumes". Every other hit goes through difficulty, the absorb and the grace.
- **`lineRounds`**: `WeaponView.lineRounds` and `weapon/ammo` count the carry; `PlayerSave.lineRounds` counts the carry
  plus a line round under the hammer (a restore gives a full cylinder of lead, so the chambered one would otherwise
  be lost). The carry cap of 2 counts both.
- **`player.eye`** is the camera's position: the interpolated eye plus the step smoothing, the bob and the landing dip.
  The ray of a shot starts at the sim eye (feet + 1.65 m) of the click's tick, as `__dbg.probe()` does.
- **A dev assert** for a hit above 38: `console.error` when the source is an enemy (a bug in that attacker),
  `console.warn` when the source is `world` (a test's or the world's own call).

## 4. The final view-model (`weapon_revolver.glb` of 2026-10-02 19:04): what was re-checked, and what `art-weapons` should know

Read from the file at `start()`; `__dbg.ext.player.viewModel()` reports it (`proceduralKick`, `turn`, `boneStep`, `tracks`).

- **Kick**: the final `fire` clip moves `gun` by 20.1 degrees, so the clip carries the kick and the procedural one is off
  (`defs.ts VIEW_KICK_IN_FINAL_CLIPS`; never both). Looked at in `shots/code-player/fire_t00 … t29.png`.
- **The cylinder and the case heads** (fixed on 2026-10-04; the placeholder had hidden two faults). The final `fire`
  clip STARTS one notch back (60 degrees) and turns onto the rest pose on frames 4 to 9; `reload_round` turns a notch
  after the seat and snaps back in its last frame; `load_line`, `unload_line`, `load_kept`, `unload_kept` turn to the
  gate and back. The turn is clockwise seen from behind: after `round_1`, `round_6` comes under the hammer (the player
  had assumed `round_2`, and had assumed the clip ends a notch on). Now: ring order from the direction of the turn in
  `fire`; a bone shows the logical chamber of its slot; the fired chamber empties under the hammer on the click's tick
  and nothing changes while the cylinder turns (`tests/player/shots.test.mjs`, "the case heads of the final gun").
  In a reload the rounds are seen to go in at one place and index round; a reload to a full cylinder ends with no
  correction, an interrupted one is put right (by up to a few notches, one frame) under the close clip.
  Known simplification: that place is the first empty chamber after the loaded ones, not the gate's own position.
- **Coverage**: the final gun and hand cover 4.1 % of a 16:9 frame at idle (the placeholder box: 14 %), nothing left of
  centre (`minX` 0.57). `tests/player/shots.test.mjs` holds it to ART_BIBLE 12 item 26 (at most 18 %).
- **Tracks**: 236 of the file's 238 tracks are live (the placeholder: 2 of 93), so the mixer evaluates about 16 per tick
  in a clip: moving and firing allocates 1.3 KB per tick (three's `Interpolant.evaluate`), 0.2 KB walking or standing.
  Tracks on `round_1…6` and `kept_loop` are always dropped (code drives them).
- `kept_loop` is hidden 0.9 s into `load_kept` and shown 0.8 s into `take_round`; it is in frame during the reload
  (`shots/code-player/reload_series_3_round3.png`).
- After `fire_kept` the logic compacts the cylinder when the clip ends (no cock afterwards): with fewer than five lead
  rounds beside it the case heads shift by a notch on that tick. Not corrected.

- **Seen beside the real renderer** (2026-10-04, `scratch/code-player/integ_render.mjs`: index page, real `src/player`
  and `src/render`, four core stubs; `shots/code-player/real_*.png`): the flash sits on the muzzle on the click's
  tick, the clip's kick reads at ticks 1 to 6, the reload fills the frame. **At idle the gun and hand are small and
  low** (lower right, the barrel's tip at about 57 % of the frame's width, the grip half off-screen): for "the gun is
  the star" `art-weapons` should bring the idle pose up and in (the player does not move the art's pose; it only adds
  kick, bob, sway and dip on the instance root).

## 5. Notes for render / integration (no action needed from the player)

- A skinned view-model makes three re-upload the skeleton's bone texture every frame (`uploadTexture → initTexture →
  getTextureCacheKey`, an array and a `join`): about 0.5 to 1 KB per frame of three's own allocation, in any skinned
  asset. Measured inside the 3.5 KB per tick + frame of `tests/player/state.test.mjs`.
- `AnimationMixer` activation walks every property binding; the player keeps all fifteen view-model actions active and
  switches them by `enabled` and weight (measured: 14 KB per clip change before).

## Code integrator, polish round 2 (2026-10-04): what was decided on the rows above

`KEEP7_REAL=all node --test tests/core/`: 68 pass, 0 fail (`scratch/integrate-code/core_real_3.log`).

| Row | Decision |
|---|---|
| 1, `alloc.test.mjs` a tick plus a frame (13 120 B) | **FIXED** at the source, not in the test: with the real renderer in its slot the figure was 7 366 B; three allocation sites were removed (`src/core/assets.ts` `quietSkeleton`: a skinned thing that did not move asks for no bone-texture upload; `src/render/system.ts` `quietSort`: the render list is sorted in place; `src/render/materials.ts` `fadeProp` returns once arrived). Now 4 411 to 4 448 B under `KEEP7_REAL=all` (limit 6 144) |
| 1, `alloc.test.mjs` `roundsFired >= 90` | **APPLIED** (`tests/core/alloc.test.mjs`): `setAmmo(6, 24, 0)` inside `fightTicks`, so both the stub and the six-shot gun fire every cycle; the assertion itself is unchanged |
| 1, `walk.test.mjs` line 103 (she coasts 0.43 m) | **APPLIED**: the test lets her come to rest (30 ticks) and then asserts that 30 more ticks move nothing: "nothing is held" is what it meant |
| 2, the three all-stub failures (random walks, `restart_checkpoint` y 14.0041, viewer `ia_bore_door`) | **FIXED**: `capsuleFree` above a sculpted terrain (`src/core/greybox.ts`: the terrain sheet is no solid: `NO_SOLID`), the lip's plane (art integrator), `sandbox.test.mjs` accepts a final file's material line |
| 3, D1: air cap `max(take-off speed, 2.5 m/s)` | **RATIFIED** as built (one constant, `defs.ts AIR_MIN_CAP`); the other departures of section 3 stand as decided there |
| 4, the idle view-model is small and low (4.1 % of the frame) | **ACCEPTED as built**: in all 158 tour frames of `shots/integrate-code/` (Low and High) the gun and hand are in frame, lower right, barrel tip at about 57 % of the width. No placement change in this round; listed as a known gap for the visuals critic |
| 5, the bone texture of a skinned view-model re-uploaded every frame | the view-model moves every frame, so its upload stays; static skinned props no longer upload (`quietSkeleton`) |

## Polish round 3 fixer (2026-10-05): the gun's placement under lead ruling R6

Two critics (visual, combat) measured the same thing: at idle the whole view-model covered 6.1 to 7.9 % of the frame
by frame difference and the revolver itself about a third of that. Reproduced in the real game (Low, 1280 x 720,
`scratch/r3-fix-code-player/tune.mjs`, render's alpha mask with one mesh hidden at a time): **all 8.10 %, hands alone
4.76 %, gun with the hands hidden 5.18 %, gun that no hand covers 3.34 %.**

### What changed (player's files only)

| File | Change |
|---|---|
| `src/player/defs.ts` | new `VIEW_PLACE = { x: -0.04, y: +0.02, z: +0.12, pitchDeg: -6, yawDeg: -5, rollDeg: -12 }` (metres added to the authored pose in camera space, a turn about the grip bone) and `VIEW_PLACE_BLEND = 0.15` s |
| `src/player/viewModel.ts` | `late()` adds the placement to the instance root under the kick, sway, bob and dip, **also with reduced motion**; `isHandling()`: in `reload_open`, `reload_round`, `load_line`, `unload_line`, `load_kept`, `unload_kept`, `take_round` the placement eases out (smoothstep, 0.15 s) so the clip is drawn exactly as authored, and is back by the end of the close clip or the last 0.15 s of a lone clip |
| `src/player/system.ts` | debug `__dbg.ext.player.viewPlace()` reads the placement (`[x, y, z, qx, qy, qz, qw, weight]`); with six numbers it tries another one |
| `tests/player/place.test.mjs` | new, four tests in the REAL game (render's 52 degree pass) |

### Measured after (Low, 1280 x 720; the alpha mask is the same in every zone)

| | before | after |
|---|---|---|
| gun that no hand covers (all - hands) | 3.34 % | **8.95 %** (ante-room 8.99 %) |
| gun with the hands hidden | 5.18 % | 11.52 % |
| hands alone | 4.76 % | 2.82 % |
| all | 8.10 % | 11.78 % (bound: 18 %) |
| leftmost pixel | 54.9 % of the width | 57.6 % |
| critics' frame difference, eight zones | 6.1 to 7.9 % | 9.7 to 11.8 % (the low ones are the dark zones: the gun's light is render's issue) |
| during a shot (peak / leftmost) | | 14.6 % / 57.1 % |
| during the reload | as authored | as authored (placement weight 0) |

Logs `scratch/r3-fix-code-player/zones_low.log`, `anim_low.log`; frames `shots/r3-fix-code-player/low_idle_*.png`,
`low_fire_t*.png`, `low_reload_t*.png`, tuning trials `tune_*.png`.

### For the closer: documents to mirror

- `docs/ART_BIBLE.md` section on the view-model (line ~1270, "the gun and hand cover about 8 % at idle"): now the gun
  alone shows 9 % and gun and hand together 11.8 %; the 18 % bound and "never crosses the centre line" still hold and
  are tested.
- `docs/GDD.md` 6.9 / `docs/ARCHITECTURE.md` 7.2: the player adds a rest placement (`VIEW_PLACE`) to its instance; the
  52 degree view-model camera is unchanged. Handling clips are shown in the authored pose.
- `docs/INTEGRATION_REPORT.md` A.8 / the R6 line: the 8.12 % of round 2 counted hand and forearm.

### For other owners

- **art-weapons**: the idle, fire, dry-fire, fire_kept, draw and sprint clips are seen 12 cm nearer, 4 cm left, 2 cm up
  and turned (-6 pitch, -5 yaw, -12 roll about the `gun` bone's rest position); the reload and the four load / unload
  clips and `take_round` are seen exactly as authored. If the idle pose in the file moves, re-run
  `node --test tests/player/place.test.mjs` (it holds the gun at 8.3 % or more) and re-tune `VIEW_PLACE` with
  `node scratch/r3-fix-code-player/tune.mjs '[["name",x,y,z,pitch,yaw,roll]]'`. Wished for, not needed: an idle pose
  authored at this placement, so the constant can go back to zero.
- **art-weapons**: with the gun this near, the `fire` clip's 20 degree rise takes the muzzle from 56 % to 19 % of the
  frame's height (frame `low_fire_t06.png`) while the flash stays where the muzzle was on the click. It reads as a
  heavy kick; if it is judged too much, the rise in the clip is the number to lower (about 14 degrees).
- **code-render**: nothing asked. `viewModelCoverage` and `viewModelProject` were used as they are.
- **code-world** (seen, not mine): `[flow] TypeError: this.heard is not iterable` at `Story.restored`
  (`src/world/story.ts:426`) on every debug checkpoint jump while this fixer ran (2026-10-04 23:50).
- **code-ui / closer** (known gap): `ART_BIBLE` says the view-model is never over the cylinder-ring HUD. At 1280 x 720 the
  ring (bottom right) lies over the gun's grip at idle (`shots/r3-fix-code-player/tune_final.png`); before, it lay over
  the forearm. The dots stay readable on the grip. A gun of 8 % in the lower right cannot clear that corner: either the
  bible's sentence goes or the ring moves (yours to rule).

## Closer, polish round 3 (2026-10-05): decisions on the rows above

| Row | Decision |
|---|---|
| the ring over the gun; ART_BIBLE "never over the cylinder ring HUD" | **Ruled: the sentence is withdrawn** (ART_BIBLE 8.3, GDD 23.6): an 8 % gun in the lower right cannot clear that corner |
| documents (placement) | Mirrored with the gun look-dev's later values (`VIEW_PLACE`, `VIEW_PLACE_HANDLING`, 40 degrees): ART_BIBLE 8.3, GDD 23.6, ARCHITECTURE 7.2 |
| `this.heard is not iterable` at `Story.restored` | Not seen again: `tests/world` (84) and the e2e death-at-every-checkpoint test pass |
