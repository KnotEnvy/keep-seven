# Requests and notes from `code-enemies` (phase 3, round 1)

Every row is a change in a file `code-enemies` does not own, or a place where the work order and a source document
disagree (the source was followed). Local workarounds are in `src/enemies/` and named here.

## 1. To `code-render`

1. **Per-instance tint of a skinned instance.** ART_BIBLE 7 / work order 4.1 ask for four per-instance `workcloth` tints
   on the Bider. `RenderApi` has no call for it (`setTint` exists only for instanced sets). Workaround: every mesh of
   the Bider instance carries `userData.tint = [r, g, b]` (also on the instance root), and while the material is the
   core fallback (`MeshBasicMaterial`) the enemies module swaps in one of four cached clones with the colour
   multiplied (`src/enemies/pool.ts` `vary`). Asked: honour `mesh.userData.tint` in `render.material` (a per-object
   uniform or `onBeforeRender`), or add `RenderApi.setTint(object, r, g, b)` beside `setEmissive`; the module will call
   it instead.
2. **`instances.add(asset, '', ...)`** is used for assets whose manifest lists no node (`bider_seated_static`,
   `bider_felled_static`, `prop_cup_tin`, `proj_canister`): the stub takes the first mesh. Please keep `''` meaning
   "the asset's mesh".
3. **Stake orientation.** Stakes (in flight and stuck) are placed with `instances.setMatrix`: the asset's +Z along the
   flight direction, the pivot (the tip) at the point. `art-enemies-transit` built `proj_stake` with its pivot at the
   tip; if its body lies along +Z instead of -Z behind the tip, the module flips one sign.
4. **Skinned instances are animated without three's `AnimationMixer`.** Bones are written by a lean sampler
   (`src/enemies/pool.ts` `Anim`: linear / step keys, a short crossfade, tracks that only hold a bone at rest left
   out). Nothing is needed from render; noted because `AssetInstance.mixer` is never updated for enemies.

5. **Two instanced sets on one material must both carry instance colours (or neither).** `proj_stake`'s `stake_hot` and
   `stake_cool` share a material. Once the first stuck stake is tinted (`instances.setTint`, the 6 s cooling), the hot
   `InstancedMesh` has an `instanceColor` and the cool one has none: three then re-derives the material's program for
   each of the two meshes every frame (`needsProgramChange` on `instancingColor`), which allocates. Measured beside the
   stub renderer: 11.3 KB per rendered frame from the first Transit shot on, for the rest of the run, even with every
   enemy cleared. Workaround in `src/enemies/projectiles/stakes.ts` (`rebuildInstances`): every stuck-stake handle of
   both sets is tinted white once when the sets are made (1.9 KB per frame afterwards, the page's floor). Asked of the
   real `render.instances`: create the colour attribute with the set, or give tinted sets their own material.
   **Fix round 1: the same thing between assets.** Core's fallback material is one object for every asset, so a
   freed Bider's `bider_seated_static` set (no instance colours) beside the stake sets (with them) cost 9.6 KB per
   rendered frame: `KEEP7_REAL=enemies node --test tests/core/alloc.test.mjs` measured 13 074 B per tick + frame
   once Transits fired promptly enough for a stake to be stuck while a static body stood (profile:
   `scratch/code-enemies/fix/frame_heap.mjs`: `getParameters <- getProgram <- setProgram` 6.4 KB, `getProgramCacheKey`
   2.6 KB). Every instanced set this module makes now carries instance colours (`pool.ts` `addInstance`, the
   canisters, the stakes in flight). **Any other system's untinted instanced set on the fallback material beside a
   stuck stake will show the same cost**: the real fix is in `render.instances` / the asset store, as asked above.

## 1b. To `foundation-core` (asset store / `basicRender`)

1. **The fallback `MeshBasicMaterial` is one object shared by skinned and static meshes.** three keeps one program per
   material and looks it up again whenever the next object drawn with it differs in `skinning`. With one skinned
   enemy on screen beside the static world that is two look-ups per frame: **10 KB per rendered frame** (measured:
   `KEEP7_REAL=enemies node --test tests/core/alloc.test.mjs` reported 18 001 B per tick + frame, limit 6 144; the
   tick alone was 1.2 KB). It never showed with the stub enemies because they are capsules. Workaround in
   `src/enemies/internals.ts` (`ownSkinnedMaterials` / `restoreMaterials`): while a skinned instance of this module
   (archetypes, the Windlass, the watcher) wears a `MeshBasicMaterial`, it draws with a clone that only skinned meshes
   use, and the base is put back before the instance returns to the store's pool. After both workarounds the same
   test measures 3 663 B per tick + frame (2026-10-04; `tests/enemies/budget.test.mjs` holds its own copy of the check). Asked: let `assets.instantiate` give skinned meshes their own fallback
   material (or key the fallback by `isSkinnedMesh`); the player's view-model arms will meet the same thing. The real
   renderer needs the same care (a material is never shared between a skinned and a static mesh).
2. **Three `tests/core` failures under `KEEP7_REAL=enemies` are not caused by this module: they fail identically with
   core stubs in all six slots** (`node --test tests/core/flow.test.mjs tests/core/walk.test.mjs`, 2026-10-04, on the
   tree with the final art in it):
   - `flow.test.mjs` "ui/action: restart_checkpoint ... play again": the player stands at `[16, 14.0041, 107.5]`, the
     test expects the marker's `[16, 14, 107.5]` (the built zone's floor is 4 mm above the layout's).
   - `walk.test.mjs` "random walks from every checkpoint": `inside a solid` at tick 0 from `cp_lip_start` and
     `cp_lip_gate` (18 lines, the same coordinates with and without this module).
   - Under a machine load of 90 to 170 three more tests of `stubs.test.mjs` (all-stub pages) ran into
     `page.goto: Timeout 30000ms` / `waitForFunction: Timeout 90000ms` in one run and passed in the next; which ones
     changes from run to run. Not this module's.
   - `sandbox.test.mjs` "viewer ?asset=": `ia_bore_door` is now a final asset whose printed sheet differs from the
     placeholder text the test expects (seen in the run of 2026-10-02; an art / core matter).

3. **`GameClock` has no way to end a slow-motion request early.** The hush (GDD 8.2) asks for `slowMotion(0.5, 1.8,
   'hush')`; when she unloads the kept round 0.2 s later, or a debug jump resets the fight, the remaining 1.6 s of
   half speed play out (measured by the critic: `timeScale` 0.5 after `setBossPhase('idle')`). `clearSlowMotion()`
   exists on core's clock but not on the contract, and it drops every request. Asked: `GameClock.cancelSlowMotion(reason)`
   (drops the requests of one reason). The module's side is done: it never restarts the run (section 4.17).
4. **Double arguments are boxed at calls into `collision`** (12 B each when the call is not inlined). Measured with
   the sampling heap profiler (`scratch/code-enemies/heap.mjs`, 3000 ticks, six Biders fighting in the street):
   `closestPtTri <- closestSegTri <- capsuleStep <- resolveImpl` 90 B per tick under this module's `moveBody` (and
   45 B under the dummy player's `move`); in the bore `setVolumeBox` (`Math.abs` inside it) 70 B per tick until this
   module stopped rewriting two boxes that had not moved. Inside core: reported, not worked around.

## 2. To the level owner (`design/layout.json`) and the GDD

1. **Charge stun on walls.** GDD 7.3: "if the charge meets a rib **or wall**: stunned". The order says
   `wallFlags & ColFlag.STUNS_CHARGE (a rib, the cabinet, a wall)`, but in the layout only the ten ribs and
   `lh_ramp_cabinet` carry `stunsCharge`; the hall's walls do not. The module follows the GDD: a charge stuns on any
   solid flagged `STUNS_CHARGE` and on any wall met head-on (normal against the charge, dot < -0.5). Either flag the
   `lh_wall_*` solids or confirm the code rule.

## 3. To `art-boss-windlass` / `art-boss-tamper` (facts the code relies on; re-check when the art changes)

1. Every Windlass clip as built keys **every** bone, the code-driven ones included (`arm_yaw`, `drum_spin`, `knot_n`,
   `pawl_l/r`; art-boss section 3: "never key a codeDriven bone"). The module overrides them after sampling, so it
   works, but it also means `idle_sway` and a guard clip cannot be layered: one body clip plays at a time (the guard
   one-shots hold their last frame while the guard is set, released or shattered).
2. Mouth numbering: the final file has mouth 2 at +X (clockwise seen from the front); the placeholder had it at -X.
   The module reads the side from `knot_2_hit` in the template (`spinSign`), and retargets `mouth_open` from `mouth_1`
   to each lid as a turn relative to the lid's own rest frame (the six lids have different rest rotations).
3. Vent lids of the Tamper: +80 degrees about the bone's local X axis, applied absolutely over rest in every state but
   `stagger`, `charge_stun` and `die` (README ruling 8); `line_stagger` holds both open over the `stagger` clip.
   Defined in `src/enemies/defs.ts` (`TAMPER.ventOpenDeg`, `ventAxis`).
4. Lamp indices used: `boss_lamps` bits 0-5 mouth lamps, 6-11 knot cores, 12-13 pawl cores; `gauge` count = pips.

## 4. Order and GDD: interpretations taken (the GDD was followed where they differ)

1. **Lunge reach.** "0.35 s, 2.2 m forward, reach 1.8 m": the body travels up to 2.2 m along the direction fixed at
   the start of the wind-up, and the strike is a 0.25 m swept sphere reaching 1.8 m in front of the body, once. The
   direction is fixed at the wind-up's start (the crouch points where it will go), so a side-step of about 0.7 m in
   the 0.5 s tell avoids it. **Fix round 1 (GDD 7.1 numbers against GDD 7's "fair and legible"):** wind-up at 2.4 m
   plus 2.2 m of travel put the body 0.1 to 0.2 m from a player who stands her ground: inside the camera, invisible.
   The body now stops 1.5 m from her axis when she is in its path (`BIDER.standOff`; the full 2.2 m is still
   travelled after a player who backs away, and the strike still reaches her). 1.5 m, not the critic's 0.9 m: the
   lunge clip carries the head 0.5 m ahead of the root at 0.9 m height, which at 0.9 m is under a level view
   (`shots/code-enemies/fix_bider_recover_lookdown.png`: at 0.9 m, seen only by looking 35 degrees down;
   `fix_lunge_end_level.png`, `fix_recover_055_level.png`: at 1.5 m, level gaze). Tuning number: re-check when
   the final `lunge` clip changes.
2. **"Biders within 1.2 m behind stumble"** is measured from where the felled body is thrown (1.2 m along the shot):
   in a file 1.6 m apart the one behind the leader stumbles, the third does not.
3. **"The first shot at a fresh target always misses"** is applied to each Transit and to the Windlass's first stake
   of a fight (an aim point 1.1 m beside her, on the side she is not moving to; the thread shows the true line).
4. **Telegraph scale** (+20 % Easy, -10 % Hard) is applied to the three archetypes' tells. The Windlass's pattern keeps
   the GDD's fixed timings (6.6 s, 7.7 s, the 0.9 / 0.8 s glows), which GDD 8.2 states without a difficulty rule.
   **Open, for the producer:** GDD 7 says "telegraph durations scale with difficulty" without excepting the boss;
   scaling the glows would change phase 1's 6.6 s and phase 2's 7.7 s. Until ruled, the Windlass does not scale.
5. **"enemy/state -> circle_strafe every 1.5 s"**: the state is `circle`; the bark is an `enemy/state` event
   `{ from: 'circle', to: 'circle_strafe' }` every 1.5 s (the state itself does not change), as ARCHITECTURE 3.6's
   caption table expects.
6. **`boss/discharge`** is emitted when the chamber fires (after its glow; `glowSeconds` is the glow that preceded
   it); the glow's start is `boss/mouth { open }` plus `audio/cue` `mouth_iris` and `glow_tone`. A parried stake emits
   `projectile/burst { reason: 'parry' }` and no discharge.
7. **`mouth_close`** is played on a lid that is shutting (fix round 1): its `mouth_1` track is sampled like
   `mouth_open`'s and retargeted to each lid, when it starts at `mouth_open`'s end and ends at its start (the final
   art's does: `__dbg.ext.enemies.boss().lidClose`); otherwise a lid shuts along `mouth_open` reversed.
8. **A line round through the guard** counts 3 hits while knots stand open behind it (a haul, or the parley); with the
   mouths shut it does nothing.
9. **Movement**: the order says `groundHeight` keeps bodies on the floor; every moving body uses
   `collision.resolveCapsule` instead (one call per moving body per tick), which also keeps fan offsets, lunges,
   thrown bodies, sidesteps and the charge out of walls.
10. **Open ground fanning** (test 3): the five approach offsets are assigned least-used-first among the Biders up, a
    Bider walking the nav graph keeps to one side of the link by its offset, and one standing between two others
    steps out of the line for 0.6 s. The test measures approaching Biders beyond 4 m (inside 4 m they circle, lunge
    and recover through her, and three on a 3 m circle with one lunging are collinear by geometry).
11. **`killAll`** (EnemiesDebug) fells / kills the archetypes only; `setBossPhase('dead')` ends the Windlass.
    `clearEncounter('enc_windlass')` removes its adds and projectiles and returns the Windlass to rest (`idle`)
    without events.
12. **Transits** come into a fight knowing where she is: planted, they face her last known position (so the 120 degree
    cone can see her). **Fix round 1: firing points are scored on line of sight** (GDD 7.2: "scored: line of sight,
    band, unoccupied, not used in the last 10 s"). Each firing point carries a "sees her" bit, refreshed one point per
    Transit think through the module's budgeted sight ray (still at most four rays a tick). Score: sight +15 / blind
    -15, in the 12 to 25 m band +20 (outside it a slope), used in the last 10 s -8, the walk there by the nav route
    -0.3 per metre, the point its spawn marker names +8 until it has stood on a point (`TRANSIT.score*`). After
    `emerge`, with a sight of her from where it stands, 8 to 25 m away, it plants and aims there (the marker's point
    is where it goes after its two shots). A point with no route is not asked for again; a blind one is no longer
    struck off for good (blindness depends on where she stands): planted blind for 2.5 s it moves to a point that
    sees her, or after 6 s to the best there is. Walking to a point that has gone blind it chooses again (once a
    second at most). Measured in the yard: first tell 1.5 s (from the door, sight), 3.1 to 4.0 s (a short walk);
    8 to 10 s only when she stands where no point within 30 m of walking sees her (the north-east corner against
    `sp_yard_t3`). The order's "relocates to a firing point 12 to 25 m away" is therefore a score, not a filter: from
    the yard door only one point is both in the band and in sight, and the second one it takes sees her from 26 m.
13. **The half-frequency rule and the cue from behind** (GDD 7). Both are judged at the start of the attack, on the
    horizontal angle (more than 50 degrees off her facing = outside her view; anything within 1.5 m in front of her
    is in view). An attack that starts outside her view costs its owner one more attack cycle before its next token.
    "Never from behind within 6 m without its cue": every attack emits `enemy/telegraph` (the tone and the pose) for
    the whole tell before it can hurt, and an attack that starts outside her view within 6 m (`CAPS.behindCueRange`)
    never takes Hard's -10 %: its tell is at least the written length (`Shared.tellScale`).
14. **Transit sidestep**: "the crosshair rests on it" means her aim ray within 0.45 m of the body's axis between 0.3
    and 1.7 m (legs, drum, lens), not the lens alone; it steps to the side that is free (two `capsuleFree` tests at
    the sidestep, an event).
15. **`vig_yard_bell`** ends when the stake has landed and the Transit has turned to her, 1.35 s after the shot at the
    earliest (4.0 s in all, the marker's `vignette.seconds`); state `bell_turn` in `enemy/state`.
16. **Boss adds**: a grate with a Bider within 1 m of it (one still climbing out) is passed over; the second add of a
    haul rises from the next farthest grate (still never one within 7 m), or waits a quarter second.
17. **The hush's slow motion** is asked for once per hush and never again inside 3 s of unscaled time: a load toggled
    on a mark cannot hold the fight at half speed. The contract has no call to cancel a slow-motion request, so on
    `unloaded` (and on `clearAll` / `setBossPhase('idle')`) a run that has begun plays out its 1.8 s: see 1b.3.

## 5. To `code-world` (how the module behaves at the seams)

1. `playVignette('vig_kneeler' | 'vig_yard_bell' | 'vig_tamper')` stands the actor on its marker if no wave has yet;
   a later `spawn()` on the same marker **adopts** that body (same id; encounter, wave and counted from the request)
   instead of making a second one.
2. `applySave` with a fight phase saved (`p1`, `p2`, `p3a`, `proven`/`p3b`, `dead`) restarts the Windlass at that
   phase by itself after a 1.5 s lead-in, parley skipped. A `startBoss` that follows during the fight is ignored.
   `deathsInBossPhase` counts deaths in the phase across restores (mercy at 2: boss damage x0.85).
3. `boss/phase` is emitted on every change, including `p3a -> hush -> p3a`; the phase-start checkpoints come once each
   (the stub world's `reach` only moves forward).
4. **`applySave` with `bossPhase: 'dead'` is silent** (fix round 1): the Windlass is put back sagged and dark, phase
   `dead`, pips 0, and **no `boss/phase`, `boss/defeated`, `boss/pips`, story line or cue is emitted**. The defeat is
   told once, when it happens. If world needs the fact after a restore it reads `ctx.enemies.boss.phase === 'dead'`
   (or its own flag). `EnemiesDebug.setBossPhase('dead')` still emits `boss/phase` and `boss/defeated`.

## 6. Allocation by source (fix round 1; the critic's "source not isolated")

Chrome's sampling heap profiler over 3000 ticks after 3000 of warm-up (`scratch/code-enemies/heap.mjs`), six Biders
fighting a standing player in the street sandbox. What allocated was **V8 boxing double arguments and return values
(12 B each) at calls it does not inline**: the per-archetype tick functions are past the inlining budget, so every
`moveBody(S, e, dx, dz, ...)`, `turnToward(...)`, `sample(track, time, ...)`, `quaternion.set(x, y, z, w)` paid for
its doubles.

| Source (per tick, six Biders) | before | after |
|---|---|---|
| `tickBider` itself (arguments of `moveBody`, `turnToward`, ...) | 230 B | 0 (not among the sampled sites) |
| `Anim.write` (`quaternion.set` / `position.set`) | 213 B | 0 (`fromArray`) |
| `Anim.apply` (the clip time and blend weight handed to `sample` / `blendQuat`) | 154 B | 0 (a module scratch) |
| `turnToward` (its return value) | 93 B | 0 (`turnBody` writes `e.yaw`) |
| `takeToken` (`S.time` into `Tokens.request`) | 34 B | 31 B |
| `look` / `strike` / `startWindup` (sight rays, the strike segment: events, not ticks) | 40 B | 46 B |
| `pool.animate` + `Anim.advance` | 32 B | 37 B |
| core: `closestPtTri` under this module's `resolveCapsule` calls | 89 B | 90 B (core's: section 1b.4) |
| the page without this module (core loop, stub world, dummy player) | about 300 B | about 300 B |
| **whole page, sampled** | **1279 B** | **599 B** |

`measureAlloc` (3000 ticks of warm-up, `tests/enemies/budget.test.mjs`): street, six Biders 1475 -> 320 B per tick;
bore phase 2 with 3 adds, 8 stakes in flight, 18 stuck and 2 rings 1941 -> 942 B per tick; wired in
(`KEEP7_REAL=enemies node --test tests/core/alloc.test.mjs`) 1194 -> 709 B per tick with shots, 3473 B per tick +
rendered frame (limit 6144). **Not zero**: what is left of this module's is about 115 B per tick in the street
(the rows above) and, in the bore, the Windlass's `pose` (164 B: `setFromAxisAngle`, `slerp`, `setScalar` on fourteen
code-driven bones every tick) and its eight sphere volumes (`setSphere`, about 140 B); the two box volumes are now
written only when the arm turns (145 B saved).

## Art integrator, polish round 2 (2026-10-04): what was decided on the rows above

| Row | Decision |
|---|---|
| 2.1: charge stun on walls | the code rule (any head-on wall stuns) is confirmed; the layout's `stunsCharge` flags stay on the ribs and the cabinet |

## Code integrator, polish round 2 (2026-10-04): what was decided on the rows above

| Row | Decision |
|---|---|
| 1.1, per-instance tint of a skinned instance | **APPLIED** in `src/render/materials.ts` `applyProp`: a mesh's `userData.tint` multiplies its zone light (= its albedo tinted). The module's own swap of fallback materials stays for the stub renderer |
| 1.2, `instances.add(asset, '')` | confirmed: `''` is the asset's mesh in `src/render/instances.ts` (the playthrough's seated and felled Biders, cups and canisters are drawn) |
| 1.3, stake orientation | no change; nothing looked wrong in the tour frames (a stake in flight was not caught in a frame: not verified) |
| 1.5, two instanced sets on one material | no change in render: the module's workaround (every set carries instance colours) stays; the real pair measures 4.4 KB per tick + frame |
| 1b.1, the fallback material shared by skinned and static meshes | **NOT CHANGED** in the stub renderer (the workaround in `internals.ts` stays); the real renderer keys its programs by a `skin` variant |
| 1b.2, the three all-stub failures | **FIXED** (see `code-player.md`) |
| 1b.3, `GameClock.cancelSlowMotion(reason)` | **NOT APPLIED** this round (a contract change): a hush unloaded early plays out its 1.6 s of half speed. Known gap |
| 1b.4, doubles boxed at calls into `collision` | noted; inside the allowance (2.2 KB per tick fighting, 0.7 walking with all six real systems) |
| 4.4, telegraph scale and the Windlass | **RULED**: the Windlass does not scale with difficulty (GDD 8.2's fixed 6.6 s and 7.7 s patterns win over GDD 7's general rule) |
| 4.6, `boss/discharge` is emitted when the chamber fires | **CONFIRMED as the contract's meaning**, and `src/audio/engine.ts` now follows it (see `code-audio.md` row 7): the glow's start is the cue `glow_tone` |
| 5.2 / 5.4, restores of the Windlass | **SEAM FIXED in core**: a checkpoint reached inside a tick is committed when the tick is over (`src/core/flow.ts`, `loop.ts` `ticking`). The save of `cp_boss_proven` used to be taken between the world's and the enemies' listeners of `weapon/kept` and held phase `hush` (saved as `p3a`): a death after the proof gave back an unproven bore and a spent seventh (found by `tests/e2e`, now a test) |
| art side: Tamper and Transit walk rates | **APPLIED**: `TAMPER_WALK_RATE` 2.5 / 1.667 and `TRANSIT_WALK_RATE` 3.5 / 2.8 on every `walk` (`defs.ts`); the GDD's ground speeds stand |
| art side: `turn_about` | **APPLIED** (`bider.ts`): the root turns its 180 degrees linearly over the clip instead of snapping at its end |
| art side: Bider tint spread | **APPLIED** (`defs.ts BIDER.tints`), and the real renderer now draws tints at all (row 1.1) |
| art side: `rise_from_seat` ends inside the chair | **NOT APPLIED**: the two risers of `enc_tally` stand up through their chairs' footprint. Known gap |

## Polish round 2, fixer for code-enemies (2026-10-04): requests to other owners

What this round changed in `src/enemies/` is in the fixer's report; these are the parts of the critics' issues that
are not this module's to change. Evidence: `scratch/r2-fix-code-enemies/` (logs named below).

### R2.1 story (design/story.json): one teaching line for the Windlass, key `hint_boss_haul`

Asked for by the playthrough critic (major: "Windlass phases 1 and 2 are a difficulty wall on Normal"). The module is
already wired: from the second death in phase 1 or phase 2 (`BOSS.mercyDeaths`), `story/say { key: 'hint_boss_haul' }`
goes out at the first haul of each retry, **only if `story.lines.hint_boss_haul` exists** (`boss/attacks.ts beginHaul`,
`defs.ts BOSS.teachKey`). Until the key exists nothing is said. Proposed text (a `hint_*` line, may repeat):
"The ribs stop what it throws. It opens only while it hauls: keep the cylinder for that." No story test changes
are needed: `hint_*` keys are not in the once-only list.

### R2.2 audio and ui: the parry reads as a success

`HitOutcome 'parried'` (a lead round into a glowing stake chamber: no stake, no pip, GDD 8 "a sour note") plays
`hit_parry` in `src/audio/gun.ts:226`, a rising 2300 to 3500 Hz confirm tone, and `src/ui/hud.ts:30` shows no glyph for
it. A first-time player hears a reward for the one shot that cannot hurt the boss. Asked: a falling or detuned note for
`hit_parry`, and the deflected glyph (or its own) for `parried`. The critic's naive proxy (shoot any lit mouth) spends
36 to 72 rounds a try this way and reaches each haul with an empty cylinder (`anyB.log`, `baseA.log`).

### R2.3 level-design / world: the two bore boxes (`ia_ammo_box_bore_e/_w`, `gives` 6, `cooldownSeconds` 20)

The critic asked for 12 rounds and 10 s. These are GDD 8 numbers ("6 rounds, 20 s cooldown") held in
`design/layout.json`: not this module's, and not changed. For the decision: a player who shoots only in the haul never
runs dry (`haulC.log`: phase 1 in 10 rounds, phase 2 in 30); only the parry-spamming player needs the boxes.

### R2.4 GDD owner: decisions this fixer did not take (the GDD's numbers are binding on a fixer)

1. **Windlass, Normal**: stake 25 -> 15, phase 1 haul 3.5 -> 5 s, "a parry does not eat the turn". All three contradict
   GDD 8 / 8.2 as written (the parry rule is spelled out as a cost). Measured after this round's fixes, Normal, from
   `cp_boss_p1` (`node run2.mjs cp_boss_p1 cp_boss_p3 <tag> '<skill json>'` in `scratch/r2-fix-code-enemies/`):

   | Proxy | Phase 1 | Phase 2 |
   |---|---|---|
   | the critic's (circles the chamber without regard to where the head faces, shoots any lit mouth): `anyB` | 3 deaths (66 to 117 s), then god mode | 1 death, then 135 s |
   | the critic's, shooting only in the haul: `haulB` | 86 s, 25 rounds, health 67 (was 2) | 1 death (152 s), then 134 s |
   | stays in front of the head, runs from a lobbed canister and from the lance, shoots any lit mouth: `anyC` | 1 death (100 s), then 39 s, 30 rounds | 1 death (21 s), then 62 s, 48 rounds |
   | the same, shooting only in the haul: `haulC` | 33 s, 10 rounds, health 100 | 59 s, 30 rounds, health 100 |

   The fight as written is inside its 75 s budget for a player who has the two rules (stand where the head faces;
   shoot in the haul) and a wall for one who has neither. That is a teaching gap first (R2.1, R2.2). If the numbers
   are to move as well, they are in `src/enemies/defs.ts` `BOSS` and each is one edit.
2. **The Matador** ("over in 8 to 18 s"): the critic asked for wave B at 10 s whatever the Tamper's state, a clear
   rule that waits for the waves, and more Tamper health. GDD 10 says the opposite in so many words ("Waves run on the
   clock only ... If the Tamper is dead when a wave's time comes, that wave is cancelled ... A fast, clean kill inside
   40 s meets no Biders: that is the reward for nerve, and it still takes three vent shots"), GDD 6.7 fixes "three
   kill", GDD 7 says health never scales, and `design/layout.json` `enc_matador` carries the same clear rule. The
   Tamper as built does what 7.3 says (`tests/enemies/tamper.test.mjs`). Not changed. If the hall is to last longer
   the cheapest lever is `enc_matador.waves[B].atSeconds` (40) and `[C]` (65) in the layout, which is a level-design
   and world change.

### R2.5 for the cross-cutting fixer: the allocation follow-up (docs/requests/polish-r2-fixer.md, code-enemies 1)

Done in `src/enemies/boss/index.ts`. Measured with the performance critic's own profile (CDP sampling heap profile,
real game, Windlass phase 2, tick only, 3000 ticks; `scratch/r2-fix-code-enemies/perf/allocprof.mjs`, results
`prof_zero.json` = as it was, `prof_final.json` = now):

| Function | Before, B per tick | Now |
|---|---|---|
| boss `updateVolumes` + `sphereAt` | 198 (97 + 101; the critic's run: 316 to 394) | 22 |
| boss `pose` | 189 | not in the top twelve |
| all of `src/enemies` | 1209 | 902 |

What it was: (a) `BOSS.knotRadius` / `BOSS.pawlRadius` read as a call argument (a double field read into a tagged
argument is a fresh heap number: 96 B a tick for eight spheres): now module constants; (b) three doubles a sphere
through `collision.setSphere`: a sphere is now written only when its node has moved 25 mm; (c) `pose` handed doubles to
three's `setFromAxisAngle` / `set` / `slerp` for fourteen bones every tick: the rotations are now cached by their
input (heading, spin, lid fraction) and copied. `tests/enemies/budget.test.mjs` (the sandbox): bore phase 2 943 -> about 300 (288 and 316 in two runs)
B per tick. **What is left of this module's** in that profile: `pool.ts updateVolumes` 183 (three doubles a sphere and
seven a capsule into `collision` for each moving body: the same boxing, and a moving body moves every tick),
`tickBider` 180, `tickCanister` 78, `turnBody` 71. A `collision.setSphere` / `setCapsule` that reads from a
`Float64Array` the caller owns would remove the first; that is core's contract.

## Closer, polish round 2 (2026-10-04): what was decided on R2.1 to R2.5

| Row | Decision |
|---|---|
| R2.1 `hint_boss_haul` | **APPLIED**: `design/story.json`: "The ribs stopped what it threw. It opened only to haul: the six were for then." (78 characters: two subtitle lines; the narrator's past tense). `npm run validate` passes |
| R2.2 the parry reads as a success | **APPLIED**: `src/audio/gun.ts` `hit_parry` is a falling pair a tritone apart (1480 -> 990 Hz, 1047 -> 700 Hz) with the same click; `src/ui/hud.ts` shows the `deflected` glyph for `parried` (`tests/ui/hud.test.mjs` asserts it) |
| R2.3 the bore boxes | **RULED, no change** (README ruling 26) |
| R2.4 Windlass numbers, the Matador | **RULED, no change this round** (README ruling 26): teaching first (R2.1, R2.2, the pawl lamps); the levers are named there for round 3 |
| R2.5 a collision setter over a caller's `Float64Array` | **DECLINED**: the contract is frozen; the whole game allocates under the test's limit |
| (render row 7) the Tamper's blob shadow | **APPLIED**: `src/enemies/pool.ts` `setLevel(2)` on the Tamper's blob |

## Fixer, polish round 3 (2026-10-04): what was decided on the rows round 2 left

| Row | Decision |
|---|---|
| R2.3 the bore boxes | **APPLIED** (ruling 27): 12 rounds, 10 s (`design/layout.json` through `tools/gen_layout.mjs`) |
| R2.4 Windlass numbers, the Matador | **APPLIED** (ruling 27): `src/enemies/defs.ts` `BOSS.p1Haul` 5.0, `p2Haul` 6.5, `p2OpenGuaranteed` 4.5, `mercyDeaths` 1; `ENEMIES.tamper.hp` 1 200, `TAMPER.chargeEvery` 4; the Matador's waves at 15 / 35 s. What is left for code-enemies is in `docs/requests/polish-r3-fixer.md` |

## Fixer for code-enemies, polish round 3 (2026-10-05): what changed in `src/enemies`, for the closer to mirror

Evidence: `scratch/r3-fix-code-enemies/NOTES.md` (log), frames in `shots/r3-fix-code-enemies/`. Gate after the changes:
`node --test --test-concurrency=1 tests/enemies/` 59 pass, `tests/enemies/logic.spec.ts` 20 pass,
`KEEP7_REAL=all node --test tests/core/` 76 pass, `node --test tests/e2e/` 6 pass (29 220 ticks, 82 rounds, 28 freed,
0 deaths, hash `1b8e8d99`, the same on a second load), `npx tsc --noEmit` clean.

### R3.1 numbers and rules that differ from the documents (GDD 6.5, 7.1 to 7.3, 8.1 to 8.3; README ruling 27)

| Where (`src/enemies/defs.ts`) | Was | Now | Why (lead ruling) |
|---|---|---|---|
| Windlass: a lit knot in an open mouth (`boss/index.ts` `onHit`) | counted only in the haul; the glowing chamber parried (stake) or clanked (canister), no pip | **takes its hit whenever its mouth stands open**, the chamber about to fire included. A stake chamber struck in its glow still misfires; a canister still lobs. A knot burst in the glow stays dark through the haul (six a cycle at most) | R2 "shoots what glows" |
| the six mouth hit spheres (`boss/index.ts` `syncMouthGate`) | always enabled (a shut lid answered as "mouth") | enabled only while the lid is more than half open and the guard is not set | a shut lid is plate |
| `BOSS.teachDeaths` (new) | teaching line from the second death (`mercyDeaths`) | **0**: `hint_boss_haul` at the first haul of every try of phase 1 and 2, the first included. `mercyDeaths` stays 1 | R2 |
| `BOSS.haulFollows`, `haulFollowStep` (new) | arm fixed during the haul | while it hauls in phase 1 or 2 the arm indexes to her bay, mouths open, **0.5 s a step** | R2 "keeps moving": a circling player met the drum's back for the whole haul |
| `BOSS.pawlsReset` (new) | pawls re-set at the end of every haul | **false**: burst pawls stay burst for phase 2; the guard drops by itself at every later haul | R2: phase 2 was 110 to 290 s |
| `BOSS.parleyGift` (new) | up to six free hits in the inspection | **2**; the lids shut on the second | phase 1 was over before its pattern had been seen |
| `BOSS.p1Haul` | 5.0 (ruling 27; 3.5 before) | **3.0** | with glow hits counting and the head following her, 5.0 gave a 20 s phase |
| `BOSS.p1Rest` (new) | chambers 1.1 s apart (pattern 6.6 s) | **0.8 s** rest, lids shut, after each notch: a chamber every 1.9 s, pattern **11.4 s** (phase 1 only; phase 2 is 7.7 s as before) | R2 length; each tell gets its own beat |
| `TAMPER.slamVentLate` (new) | chest vent open for the whole 1.0 s slam wind-up | open for the **last 0.6 s** only (0.4 asked; at 0.4 and 0.6 the plain proxy fights the same, 0.6 keeps a fair window for a 6-shot revolver) | R3 |
| `TRANSIT.seekHold` 6, `seekApart` 1.8 (new); seek no longer stops 8 m short | a blind Transit cycled seek / relocate / plant (138 m, 2 400 degrees in 90 s) | it walks toward her until it sees her, plants there; one that cannot find her holds still facing where she was for 6 s before it thinks again; of two that seek together the second (higher pool index) holds 1.8 m behind the first | critics (combat, playthrough) |
| `BIDER.separateMin` | 0.75 | **0.95** | shoulders through one another at 0.6 m |
| `BIDER.circleGapCos` (new) | none | a circling Bider does not strafe within **50 degrees** (seen from her) of the one ahead of it on the ring | the same |

Unchanged on purpose: pips 10 / 10 / 6, every damage number, `p2Haul` 6.5, `p2OpenGuaranteed` 4.5, Tamper 1 200 HP,
`chargeEvery` 4.

### R3.2 measured with the critics' plain proxy (Normal, `scratch/r3-fix-code-enemies/sec.sh`)

| Section | Before this fixer (tree as the cross-cutting fixer left it) | Now |
|---|---|---|
| Windlass phase 1 from `cp_boss_p1` | 74 s, 0 deaths (and before that: six deaths, 340 s in god mode) | 30 / 34 / 34 / 40 s, 0 deaths, 0 to 38 HP lost (weak proxy, 0.5 s and 0.14 m: 34 s) |
| phase 1 on a first arrival (asking heard, two free hits) | 21 s (six free hits) to 35 s | 26 / 27 s after the 28 s asking |
| Windlass phase 2 | one death (54 s) then 64 s; 123 s on a first arrival | 58 / 59 s, 0 deaths, 0 to 63 HP lost (earlier batch of four: 57 to 76 s) |
| Matador, with a line round | 54.5 s section, 73 HP | 47.5 s (0 HP lost) and 49.1 s (116 HP lost, down to 1 HP), 0 deaths |
| Matador, no line round | 36.8 s, 56 HP | dies once at 29 s, then clears in 29 s |
| Yard, she waits on the street side of the wall by the door, 90 s | both Transits blind for 93 s, 120 and 138 m walked, 2 286 and 2 444 degrees turned | one at the door firing from 20 s on (sandbox: first sight 14.0 s), the other planted 1.75 m behind it; after that neither moves or turns |
| Four Biders round a standing player | centres 0.60 m apart | sandbox 20 s: never under 0.81 m, under 0.9 m in 8 of 960 ticks, ring gap never under 52 degrees; real game (street): never under 1.25 m |

**Honest gap against R2's "60 to 90 s a phase": phase 1 is 26 to 40 s for the proxy, phase 2 about 60 s.** With every
lit knot counting, ten pips are ten hits, and a proxy that lands 15 of 17 rounds cannot be held to a minute without
dead time (glows that do not count: the wall the critics found) or more than one hit a pip (the HUD pins 10 / 10 / 6).
A person who lands half of what the proxy lands is at about a minute. If the lead wants the proxy's number at 60 s the
levers are `BOSS.p1Rest` (each 0.1 s is about 0.6 s a cycle) and `pipsP1` (with code-ui).

### R3.3 asked of others

| # | Of | What |
|---|---|---|
| 1 | closer | mirror R3.1 into GDD 7.1 (Bider spacing), 7.2 (Transit seek), 7.3 (late chest vent), 8.1 (the gift is two), 8.2 (phase 1 rhythm and haul, glow hits count, the follow, pawls stay burst), 8.3 (teaching line at every first haul); README ruling 27's `p1Haul` 5.0 is superseded |
| 2 | code-world / code-player | the critic asked for health restored to at least 67 at `cp_boss_p2` / `cp_boss_p3` when the phase is **entered alive** (a restore after a death already gives 67). This module has no way to heal her. With the numbers above the proxy now leaves phase 1 at 62 to 100 HP, so it is no longer pressing |
| 3 | design/story.json (frozen for this fixer) | `stn_parley_4` "CHAMBERS OPEN ONLY ON THE HAUL" and `hint_boss_haul` are still true of the haul (all six open, the head turning to her), but a lit chamber about to fire now counts as well. A wording such as "A LIT CHAMBER IS AN OPEN CHAMBER. ALL SIX OPEN ON THE HAUL." would say both |
| 4 | not done: a Bider stagger-then-rise on a body shot (polish-r3-fixer row 6) | a lead round to the body frees a Bider outright (100 of 100), so there is no second state to stagger into; the street's cost was raised through the waves instead |

## Closer, polish round 3 (2026-10-05): decisions on the rows above

| Row | Decision |
|---|---|
| R3.3 row 1 documents | Mirrored: GDD 7.3, 8.1, 8.2, 8.3 in place and 23.6; work-order ruling 28 supersedes ruling 27's `p1Haul` 5.0 |
| R3.3 row 2 health to 67 when phase 2 / 3 is entered alive | Open, low priority: the proxy leaves phase 1 at 100 HP and phase 2 at 34 to 100 (Part F) |
| R3.3 row 3 `stn_parley_4`, `hint_boss_haul` | **Applied**, shortened to fit two subtitle rows of 42: "WILL NOT STAND DOWN. A LIT CHAMBER IS OPEN. ALL SIX OPEN ON THE HAUL." and "The ribs stopped what it threw. Lit meant open. All six opened to haul." |
| R2: phase 1 lasts 26 to 40 s for the proxy | **Not changed at the close.** Measured again on the final tree: 34 to 43 s (Part F). Named as the round's open gap against R2; levers `BOSS.p1Rest`, `pipsP1` |
