# Requests and findings from `code-audio`

Where the order and the foundation as built disagreed, and what audio needs from other owners. Nothing here blocks
the piece; each row says what audio does locally. Evidence: `tests/audio/`, `shots/code-audio/`.

## 1. Deviations from the order (the reason, and what was built instead)

| # | Order says | What the platform does | What audio does |
|---|---|---|---|
| 1 | 4.1 "into a master with a **limiter** (dynamics compressor as a brick wall)"; 6 "the report's first sample is at offset 0" | Chromium's `DynamicsCompressorNode` looks 6 ms ahead: its first output sample is 288 samples late at 48 kHz (measured, `scratch/code-audio/exp1.mjs`). It also fades in over its first ~120 ms of context time (a steady tone starts at 0.2 of its level; `exp3.mjs`). And it is not a brick wall: a fast transient overshoots it | The gun bus goes **round** the compressor straight to the final stage; every other bus goes through it. The final stage is a memoryless soft clip (`WaveShaper`, linear to 0.8, then `0.8 + 0.2 t / (t + 0.2)`: the same shoulder as the tone map) that can never exceed 0.99, so nothing clips and nothing waits. The crack leaves on sample 0 of its tick (tested). Offline renders run 0.25 s of pre-roll so the compressor's start-up is not measured |
| 2 | 4.1 "pooled nodes where WebAudio allows" | `connect()` / `disconnect()` cannot be scheduled on the audio clock. A pooled strip (panner + send) re-pointed at another bus also moves the tail of the voice that used it before, and in an `OfflineAudioContext`, where everything is scheduled before rendering, every voice that ever used the strip ends on its last bus (found by test: the gun went silent in a scripted fight) | Persistent nodes for everything persistent (buses, ducks, gates, the five rooms, every ambience bed and drone). A voice creates its own gain, and a panner and a send only when it needs them, **at its start**, never per frame (tested: zero nodes built on the 2616 ticks without a start in 60 s of the worst fight) |
| 3 | 4.6 / 6 "four seconds of true silence: every bus but the kept tone's own tail at zero" | — | Every bus of the world is at zero for 4.0 s from `boss/proven`, the reverb returns included. **The player's own gun is the one exception**: a lead round fired inside the silence is heard, dry (no room answers it). GDD 6.8 "silence after a shot is a bug" and pillar 1; the Windlass is frozen and cannot be the target, so this only matters to a player who fires into the dark. **Design: say if the gun must be silent too** (a one-line change: the gun pause gate in `Graph.setSilence`) |
| 4 | GDD 17 Key SFX "Kept round: ... pure D4 and D5, 3.5 s; then nothing for 4 s" | GDD 8.2 step 5 and ARCHITECTURE 3.6 put the 4 s of silence at `boss/proven` (with the shot) | Followed 8.2 and the order: the 4 s start at `boss/proven` and the 3.5 s tone sounds inside them; after the tone, 0.5 s of absolute nothing (tested: below -100 dB). If design meant "the tone, then 4 s", the silence must be 7.5 s and world's `nar_kept` moves with it |
| 5 | 4.4 `cap_stake`: "`projectile/spawned` (stake) **aimed at the player**" | The payload has no target or direction (`{ id, kind, source }` and a position) | Raised for every stake, the yard-bell vignette's included. **Request to core (contract) / enemies**: a `atPlayer: boolean` on `projectile/spawned` would let audio skip the vignette's stake |
| 6 | 4.4 / 4.8 "the gait loop of a Transit outside the view cone" (`cap_transit_clack`) | `enemy/state` carries no position, and ARCHITECTURE 3.5 lets audio read only `player.eye/forward`, `world.zone`, `enemies.threat` | Enemy positions are tracked from the last event that carried one (`enemy/spawned`, `enemy/telegraph`, `enemy/attack`). A Transit that walks far between two of those is heard (and judged in or out of view) where it was last reported. **Request to core**: `x, y, z` on `enemy/state`, or audio allowed `enemies.list()` |
| 7 | 4.4 "the glow tone rising over `boss/discharge.glowSeconds`" | The contract does not say whether `boss/discharge` comes at the start of the glow or at the shot | Audio treats it as the **start** of the glow (it carries `glowSeconds` and `parryable`, which only make sense ahead of the shot): the tone rises over `glowSeconds` from the event and the boss drum lands on the event. If enemies emit it at the shot, the glow tone will follow the shot: tell audio |
| 8 | 4.5 the_lip "the sweep creaking", plenty_street "the wind-pump's creak and a seven-beat clatter with one beat missing" | `sweep_creak` and `pump_clatter` are also `AudioCue`s world may emit | Ambience plays both as sparse seeded events of their zones (quietly, gain 0.3). If world also emits them on its own schedule both will sound: world should emit them only for its own moments (the gate notch's sweep, a clatter the player causes), or audio drops its ambient copies: say which |
| 9 | 4.1 "short-lived nodes created only at sound start" | A report built from its recipe is 45 nodes; a shot with its impact cost about 60 node constructions on the tick of the click | The sounds every shot makes (report, impacts, confirms, footsteps) are **pre-rendered once at load** through an `OfflineAudioContext` from the very same recipes (`src/audio/bake.ts`); a start is then one buffer source + the voice's gain (+ a room send): 3 nodes. Pitch jitter goes through the playback rate. Until the bake lands (and for a layer solo) the recipe plays, so nothing waits. Still no audio files: the buffers are synthesized in the page (tested: takes and recipes within 1.5 dB, sample 0 on the tick) |
| 10 | 4.1 per-zone reverb (one send level per sound) | Sends leave a voice before its bus fader. With the effects bus at 0.36 the room answered an effect 9 dB hotter than the gun: measured outdoors, the 320 ms slap of a jug at 10 m was **1.5 dB louder than the jug** (4.5 dB at 25 m), and `volumeEffects = 0` left every tail audible | A send now carries its bus level (trim x volume option), so an echo is never louder than what it echoes and the volume options reach the tails (jug slap -7.3 dB, bell -7.8 dB, impact -9.8 dB; effects volume 0: -127 dB). Everything but the gun then gets a **per-room lift** on its way into the same convolver (`IR_WORLD` = 1 / 1.3 / 1.6 / 2 / 2 for outdoors / tally / gallery / hall / bore): underground "long tail on everything" (GDD 17). These five numbers were chosen from measurements, not by ear |
| 11 | game-feel 2.5: saturate the boom | `WaveShaperNode.oversample = '2x'` delays the signal 66 samples in Chromium and rings before it (measured: the boom's first sample at 66, zero crossings at 2.5 kHz before the onset) | No oversampling on the saturators (a 150 Hz sine through tanh has nothing to alias at 24 kHz); the boom starts on sample 1 |
| 12 | 4.2 hit confirms from `combat/hit`; README "the crack is scheduled on the tick of the click" | A confirm that starts on the tick of the report is under it: measured, adding one raised its own band by 0.0 to 0.2 dB (a hit and a miss sounded the same) | A confirm is **logged** on the tick of its `combat/hit` (`recent()`: "no bullet produces nothing") and **sounds 85 ms later** (`hit`, `weak`, `freed`, `parried`, `deflected`), the kill's thud **190 ms later** (after the boom has let go), 8 to 11 dB louder than before. Measured lift of the confirm's band over the shot alone: 5 to 15 dB outdoors and in the hall, 3 to 11 dB in the bore (`tests/audio/gun.test.mjs`). Line-round hits 40 ms apart keep their spacing. The report itself is untouched: sample 0 on the tick |
| 13 | 3 "`unlock()` (called by the UI inside the first user gesture)" | The stand-in UI never calls it, so the integrated game stayed silent after a real click | Audio also unlocks itself on the first **trusted** `pointerdown` / `keydown` (capture phase, on `window`; the listeners are removed once the context runs; `unlock()` stays idempotent, so the UI's call is still welcome). A synthetic `dispatchEvent` is ignored. **For core / other teams**: a Playwright `page.mouse` / `page.keyboard` action on a page with `src/audio` in its slot now starts the context, so the machine's audio-device line of 1b can appear in such a test |
| 14 | 4.7 "`music/state` emitted on every change" | `ctx.enemies.threat` can cross an intensity boundary on every tick | A fight's intensity goes **up at once** and comes **down only after 0.75 s** of a lower threat; an intensity-only change is never a second `music/state` on a tick that has already sent one (it goes out on the next tick, or with the next frame when the simulation stands still). State changes (`combat` -> `calm` on the tick of `encounter/cleared`, `silent` on pause) are still sent on their tick, so two different *states* can share a tick when their two events do |
| 15 | (robustness; no document) | WebAudio throws on a non-finite `AudioParam` value, and only while the context runs | `Engine.play()` replaces every non-finite or missing start parameter by its neutral value (own level and length, no place, pitch 1) and warns once per sound name with `console.warn`. **Emitters should still not send NaN**: a sound without a place is played at the listener |
| 16 | (4.2) | A haul's whine, a station line, a howl or the kept tone went on sounding through a death and into the next life | On `player/respawned`, `game/new_run` and `game/state` -> `loading` / `title` every sounding voice that is not on the UI bus is let go over about 150 ms (a sound started on that very tick is the new life's and stays) |

## 1b. For core / the integrator (the machine, not a contract)

- **`The AudioContext encountered an error from the audio device or the WebAudio renderer`**: Chromium's own
  `console.error` when its audio sink is starved (seen once, with the load average over 85, in a test that runs a
  live context for 87 s). The harness fails a test on any `console.error`. `tests/audio/lib.mjs` `closeLive(game)`
  forgives exactly that line for the one test that must run a live context for long; **any integration test that
  unlocks audio on a busy machine can meet the same line**. Request to core: an `ignoreConsole: RegExp` option on
  `openGame` (or forgive this line in `Game.close`).
- `tests/core/stubs.test.mjs` "real time: the dev page runs its own loop ..." (`?stubs=all`: it never loads `src/audio/`)
  did not finish under `KEEP7_REAL=audio node --test tests/core/` on the shared machine in two runs (the critic's:
  failed after 328 s on `waitForFunction`; this pass: the directory run was killed at 25 minutes inside it, with
  the load average at 85-115). Run file by file, everything else completes: see the report.

- **Round 3, `KEEP7_REAL=audio node --test tests/core/`** (one command, 243 s; `scratch/code-audio/r3/keep7_real.log`): 68 tests,
  60 pass, 5 skipped, **3 fail, the same three that fail with core stubs in all six slots** (the critic's
  `scratch/critic-code-audio/r3/core_plain_*.txt`): flow "ui/action: restart_checkpoint ...", sandbox "viewer ?asset= ..."
  (`ia_bore_door`), walk "random walks from every checkpoint ...". None loads or depends on `src/audio/`; alloc (492 B per
  tick), determinism, budget, playthrough, seam and boot pass with audio in its slot. **Request to core / the integrator**:
  fix or re-baseline those three, so step 7.1 of the order can be ticked as written.
- Still open from section 1: rows 5 (`atPlayer` on `projectile/spawned`), 6 (a position on `enemy/state`), 7 (when
  `boss/discharge` fires relative to the glow), 8 (who plays `sweep_creak` / `pump_clatter`), 3 and 4 (design).

## 2. Interpretations (no change needed unless an owner disagrees)

- `music/state`: `title` is `calm` (the wire plays over the title), `boot` / `loading` / `paused` / `dead` are `silent`,
  `ending` from `game/state` or from `audio/cue wire_resolve`. Boss phases `p1` / `p2` / `p3a` are `boss` with intensity
  1 / 2 / 3; from the hush to the kill (`hush`, `proven`, `p3b`) the music is `silent` (the dry clicks are the
  percussion); after `boss/defeated`, `calm`. An encounter stays `combat` until `encounter/cleared` (or `reset`), even
  when the threat is 0 for a moment between waves.
- Intensity from `ctx.enemies.threat`: 1-2 sparse, 3-5 steady, 6+ driving; 0 counts as sparse.
- Chambers (`boss/mouth dark`): degree = mouth number (1-6) in the machine's flat tuning before the proof; in phase
  3b degrees 1-6 ascending in the order hit, in tune.
- The station chime is in the flat tuning (D4, A4, F5, all -20 cents); the wire, drone and bells are a few cents off
  or beating, so the kept round (D4 + D5 exact, no room, no noise) is the only sound exactly in tune.
- `checkpoint` (cue) and `checkpoint/saved` within 0.5 s are one note. Windlass cues that double their events
  (`ratchet`, `mouth_iris`, `glow_tone`, `haul_whine`, `refill_gurgle`, `dry_click_big`, `run_down`, `guard_*`)
  within 3 ticks are one sound; six mouths opening on one tick are one iris.
- Pause mutes the game buses (gun, effects, ambience, music, station, the rooms) and keeps the UI bus live, so the
  menu's `ui_*` cues sound; the context is suspended only when the tab is hidden.

## 3. For core (tests/core under `KEEP7_REAL=audio`)

See the report of this piece for the run's outcome. Audio's `debugState()` holds logical state only (voices, starts,
music state, zone, hum, proof, the recent ring): nothing that depends on the context, so `__dbg.hash()` is the same
with the context locked or running (tested in `tests/audio/wired.test.mjs`: three loads, one hash).

## Code integrator, polish round 2 (2026-10-04): what was decided on the rows above

| Row | Decision |
|---|---|
| 1.5, `atPlayer` on `projectile/spawned` | **NOT APPLIED** (a contract change); `cap_stake` is raised for the vignette's stake too |
| 1.6, a position on `enemy/state` | **NOT APPLIED**; audio's last-event position stands |
| 1.7, when `boss/discharge` fires | **RULED and FIXED**: it fires with the shot (code-enemies 4.6). `src/audio/engine.ts` started the glow tone again on it, so a 0.9 s rising tone followed every shot; now the cue `glow_tone` (the glow's start) plays it and the event plays it only when no cue announced the glow |
| 1.8, who plays `sweep_creak` / `pump_clatter` | stands (ambience plays them; the world's cue on a jug is the event) |
| 1b, Chromium's audio-device `console.error` | **APPLIED**: `openGame({ ignoreConsole })` and the exported `AUDIO_DEVICE_ERROR` in `tests/harness.mjs`; `tests/e2e` passes it |
| 1b, the three all-stub failures | **FIXED** (see `code-player.md`) |
| 3 / 4, the silence and the kept tone | stand as built |

## Polish round 3 (fixer, code-audio): hit confirms against the report

Critic "combat": the tick, the weak-point tink and the parry's sour note sat 6 to 11 dB under the report at the moment
they sounded (85 ms after the click), worst in the bore. Reproduced with `scratch/r3-fix-code-audio/measure.mjs` (the
critic's measure on the sound board): hit -9.6 (street) / -11.4 (bore), parried -8.3 / -10.6, weak -5.8 / -8.5.

Changed, all inside `src/audio/` (no contract, event or story change; `debugState()` and the run hash do not see it):

| What | Was | Is | Where |
|---|---|---|---|
| `CONFIRM_DELAY` (hit, weak, parried, deflected, freed) | 85 ms | **150 ms** (past the report's first 150 ms; `KILL_DELAY` stays 190 ms) | `src/audio/gun.ts` |
| `hit_tick` | level 3.4, 70 ms | **+2.5 dB**, 90 ms | `src/audio/gun.ts` |
| `hit_parry` | level 3.4 | **+4 dB** | `src/audio/gun.ts` |
| the report's tail under a short confirm | untouched | gun bus and room return **-5 dB for 120 ms** from the confirm's start, eased both ways (`Graph.duckTail`, `TAIL_DUCK_GAIN`, `TAIL_DUCK_SECONDS`); not under a kill, a freed Bider, a miss or an impact | `src/audio/graph.ts`, `src/audio/engine.ts` |

After (the critic's measure, confirm against the shot alone at its moment): hit +0.2..+0.9 street, -1.7..-2.2 hall,
-2.8..-3.1 bore; parried +1.8..+2.7 / -0.7..0.0 / -1.6..-1.7; weak +1.4..+1.6 / -1.3..-1.7 / -2.3. Against the mix
that is really under the confirm (the tail 5 dB back) every one is level or over: -0.1 to +4.8 dB.

**For the closer (documents):** anywhere a document states "confirm 85 ms after the click" it is now 150 ms, and the
mix description gains one line: "what is left of the report steps back 5 dB for 120 ms under a hit, weak-point, parry
or deflect confirm". The GDD's "the gun is the loudest thing in the world" still holds (the first 140 ms of the report
are untouched: measured 0.0 dB).

Not done here: nobody has listened to it. The numbers are from offline renders of the real graph.

## Closer, polish round 3 (2026-10-05): decisions on the rows above

| Row | Decision |
|---|---|
| hit confirms 150 ms, the 5 dB step under a confirm | Mirrored: GDD 23.6 (6.8, 17). The playthrough hash is re-baselined in INTEGRATION_REPORT Part F. Nobody has listened: still open |
