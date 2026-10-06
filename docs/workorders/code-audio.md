# Work order: `code-audio`

Phase 3 (production, round 1). Module: **`src/audio/`**: a procedural WebAudio engine: every
sound in the game is synthesized at runtime. There are **no audio files** and no ffmpeg. You
are a fresh agent: this file plus the documents it names are everything you need.

Read first: `CLAUDE.md`, `docs/PLAN.md`, `docs/workorders/README.md`; `docs/GDD.md` **17 (all:
your specification)**, 6.8 (shot timeline and audio feedback), 6.3, 6.4, 7 (the "Audio" line
of each enemy), 8.2 (the seventh, phase 3b), 13 (each puzzle's sounds), 15 (volumes);
`docs/ARCHITECTURE.md` 3.5 (the "one owner for each cross-cutting job" table: cues, music
state, captions), **3.6 "Captions for sounds" (the table of 23 keys, each with its emitter:
you)**, 5 (contracts: `AudioApi`, `AudioCue`, the events), 12, 13;
`docs/research/tech-web.md` 9 "WebAudio procedural SFX" (a verified graph with limiter and
generated reverb, and `OfflineAudioContext` testing) and `docs/research/game-feel.md` 2.5
(the layered revolver report). Then `src/core/contracts.ts`, `src/core/stubs/nullAudio.ts`.

**The foundation as built (binding; where it and this order disagree about the harness, the
hook or the engine, it is what the code does):** `docs/FOUNDATION_REPORT.md` sections 2 (test
commands and their cost), 3 (debug hook, harness, deaths inside a script), 5 (sandbox, the
stubs beside you), 6 and 9 (known gaps); `docs/requests/foundation-core.md` section 4;
`tests/core/example.mjs`; README section 4 ("Read first", 4.1 "Standing on the foundation").

## 1. Mission

"The loudest thing in the world is the gun, and the quiet after it feels like judgment."
Pillar 1 is half sound: a six-layer report scheduled on the tick of the click, a tail that is
each room answering, mechanics that turn brighter on the last two rounds, a dry click that
starts the fear. And the story is told in pitch: **everything that answers a bullet shares one
bell voice in D Dorian**; the seven jugs leave the scale unresolved on its seventh degree in
minute one; the machines hum slightly flat under every underground second; and the kept
round is **the only sound in the game exactly in tune**, with no echo, after which the hum
stops and there are four seconds of true silence. "Silence after a shot is a bug"; silence
after the seventh is the design. You also raise the caption for every key sound, so the game
is playable deaf.

## 2. Owned files (exclusive)

```
src/audio/**                 index.ts (exports exactly createAudioSystem) + your files, e.g. graph.ts, voices/*.ts,
                             gun.ts, bell.ts, enemies.ts, boss.ts, ambience.ts, music.ts, station.ts, reverb.ts,
                             captions.ts, cues.ts, tuning.ts
sandbox/audio.html  sandbox/audio.ts
tests/audio/**
shots/code-audio/**          spectrograms / waveforms rendered to PNG, meter screenshots
docs/requests/code-audio.md
```

Import rule: only `src/audio/`, `src/core/`. No three.js needed (listener position comes
from `ctx.player`). Never edit `src/core/`, `design/*.json`, other modules.

## 3. Contracts

- **Implement** `AudioSystem` = `GameSystem` + `AudioApi`: `unlock()` (called by the UI inside the first user gesture; safe to call repeatedly; `AudioContext.resume()` before a gesture never resolves: do not await it at boot), `unlocked`, `voices` (sounding voices), `recent(n)` (names of the last `n` sounds started with their sim tick: tests assert "no bullet produces nothing"), `debugState()`.
- **There is no `cue` method.** Sounds come from **events**: the domain events below, and `audio/cue { cue, x, y, z, positional, gain, pitch }` for sounds with no domain event of their own. Nobody calls you.
- **You alone emit `music/state`** `{ state: 'silent' | 'calm' | 'combat' | 'boss' | 'ending', intensity: 0 | 1 | 2 | 3 }`, derived from `encounter/*`, `boss/phase`, `game/state` and `ctx.enemies.threat`.
- **You emit `story/say { key }` for each `cap_*` key** when you start its sound (table 4.8). World's sequencer applies the 2 s / 4 s guard and the option; UI displays.
- **Read**: `ctx.player.eye / forward` (listener, in `lateUpdate`), `ctx.world.zone` (reverb, ambience), `ctx.enemies.threat`, `ctx.options.value` (`volumeMaster` 0.8, `volumeEffects` 1.0, `volumeMusic` 0.7 defaults; live), `ctx.clock`, `ctx.rng.fork('audio')` (pitch jitter must be seeded).
- `AudioContext({ latencyHint: 'interactive' })`, created at boot (suspended), resumed in `unlock()`. **The crack is scheduled at `currentTime`** on the tick of the click.
- In test mode (`?test=1`) there may be no running context: every handler must still run (bookkeeping, `recent()`, captions, `music/state`), and `ctx.debug.register('audio', { render(name, params) … })` must render any sound through an **`OfflineAudioContext`** and return `{ peak, rms, duration, centroidHz, fundamentalHz }` for assertions.

## 4. Deliverables

### 4.1 Graph and mix
- [ ] Buses: gun → effects → ambience → music → station, into a master with a **limiter** (dynamics compressor as a brick wall) so nothing clips; per-bus gains from the three volume options. **Mix priority: player gun, enemy telegraphs, hit confirms, station voice, everything else.**
- [ ] **Ducking**: music and ambience duck **5 dB for 200 ms on every shot**; ambience ducks during the hush.
- [ ] **Voice pool with a hard cap** (32 voices; steal the quietest / oldest non-priority voice); pooled nodes where WebAudio allows, short-lived nodes created only at sound start (never per frame); `voices` and `ctx.perf.scratch.audioVoices` kept current.
- [ ] Positional sounds: a cheap stereo pan + distance gain from the listener (`positional` cues and enemy sounds); no HRTF.
- [ ] **Per-zone reverb** as feedback-delay networks or generated impulse responses (noise bursts shaped by code, built once at load), cross-faded on `zone/entered`: outdoors (`the_lip`, `plenty_street`, `far_rim`) **1.3 s with a slap at 320 ms**; `tally_house` **0.5 s dense**; `the_gallery` **0.9 s flutter**; `lift_hall` **2.2 s**; `the_bore` **2.8 s**.
- [ ] Time scale: during slow motion (`time/scale`) pitch nothing down; sounds keep real-time pitch (the hush is carried by ducking, not by a tape-slow effect).

### 4.2 The gun (GDD 6.8, 17)
- [ ] **Report, six layers**: a 3 ms **crack** (noise, high-passed 2 kHz); **body** (band-passed noise 600–2500 Hz, 120 ms); **boom** (a sine 150 → 50 Hz over 160 ms); **mechanics** (hammer at 0 ms; cock and ratchet at 120–300 ms: two clicks matching the view-model's frames 4–9); **tail** (the zone's reverb); **duck**. Pitch ±4 % per shot (seeded). **The last two rounds of a cylinder have brighter mechanics and a drier tail** (`weapon/fired.chambersLeft` ≤ 1).
- [ ] **Dry fire** (`weapon/dry_fire`): one dead click (`kept_not_in_bore`: the same, softer).
- [ ] **Reload** (`weapon/reload`): gate click (`open`); **six distinct seat-clicks rising slightly in pitch** (`round`, pitch by `chambered`); gate close (`close`, `fast_close`).
- [ ] **Line round**: `weapon/line` load / unload clicks; on `weapon/fired` with `line_round`: the report **plus a sine at D5, 8 cents sharp, 1.2 s** ("slightly too pure").
- [ ] **Kept round**: `weapon/kept` `denied` → a soft dead click; `loading` → the band breaking (a small ceramic snap) and a slow seat; the soft tick when the aim becomes legal arrives from the player as `audio/cue` `listen_tick`; `fired` → **the report cut after 120 ms, then pure D4 and D5 sines for 3.5 s, no noise, no echo (bypass the reverb)**; then nothing for 4 s (see 4.6).
- [ ] **Hit confirms** from `combat/hit` by outcome: `hit` a tick; `weak` a glass *tink*; `kill` a low thud; `freed` the bell voice falling, then a breath; `deflected` a flat clank with a skipping bell; `broke` / `parried` by entity kind (4.3); `impact` a surface thud by `surface` (sand soft, wood knock, adobe dull, metal ping, ceramic chip, stone crack, cloth pat). Line rounds: one confirm per `combat/hit` (they arrive 40 ms apart).
- [ ] Player: footsteps by surface from `player/footstep` (sprint louder), `player/jumped`, `player/landed` (by speed), `player/damaged` (a low thud, heavier by amount), `player/died`.

### 4.3 The bell voice and D Dorian (GDD 17 "One tonal family")
- [ ] **One bell voice**: two detuned sines plus an inharmonic partial at ×2.76, fast attack, exponential decay, a noise click on the front. Scale **D Dorian (D E F G A B C), root D3 = 146.83 Hz**; a `degree(n, octave)` helper in `tuning.ts`.
- [ ] **Jugs** (`shootable/hit` kind `jug`, `scaleDegree` 1–7): degrees 1–7 ascending, clay: 0.25 s decay, low-passed; **the seventh degree is left unresolved**.
- [ ] **Insulator latches, the yard bell, the loft bell** (kinds `latch`, `bell`): 1.2 s decay. **Range plates** (kind `range_plate`): degrees 1, 3, 5. **Ports** (kind `ask_port`): a short bell by port number.
- [ ] **Knots** (`knot/burst`): the bell voice with a falling pitch (minus a fourth over 0.4 s) and a wet noise pop; `knot/regrown`: a descending tone.
- [ ] **Transit lens** (`enemy/died` kind transit): degree 5, two octaves up, 1.8 s: the prettiest sound in the game.
- [ ] **Windlass chambers** (`boss/mouth` `dark`): degrees 1–6 by mouth number; in phase 3b the six hits sound the first six degrees ascending in the order hit.
- [ ] Breakables (`breakable/broken`): glass, clay or tin by asset.

### 4.4 Enemies and the boss (from events; positional)
- [ ] **Bider**: a dry rattle ("wind in a sack") on `enemy/telegraph` (lunge) and the circling bark on `enemy/state` → `circle_strafe`; cloth-and-boot run (a soft loop per running Bider, max 3 voiced); a breath on `enemy/freed`; a soft fold on `enemy/felled`.
- [ ] **Transit**: a three-beat ceramic clack (gait loop while walking; on `enemy/spawned`); **a rising sine sweep 400 → 1600 Hz over 0.9 s** on `enemy/telegraph` (aim), cut on `enemy/state` → `flinch`; stake whirr on `projectile/spawned` (stake); stick / burst on `projectile/landed|burst`.
- [ ] **Tamper**: a two-beat stamp (walk); a rising hiss (`enemy/telegraph` slam); **a falling howl, a saw sweep 300 → 80 Hz** (`enemy/telegraph` charge); a sub slam with debris noise (`enemy/attack` slam); plate clank with a skipping bell (`combat/hit` `deflected` on a tamper); the pounding every 2.6 s during `vig_tamper` until it dies or the encounter starts.
- [ ] **Windlass**: ratchet (noise clicks through a comb filter) on `boss/indexing` (as long as `seconds`), on `boss/hush` on (the swing clear) and the run-down on `boss/defeated`; mouth iris (a short filtered sweep) on `boss/mouth` `open` / `shut`; the glow tone rising over `boss/discharge.glowSeconds`; canister thump and fizz (`projectile/spawned` canister, `projectile/burst`); the lance two-tone (`boss/discharge` lance); the haul (a long rising whine with lamp ticks, `boss/haul`); the refill gurgle (pitched noise rising, `boss/mouth` `relit`); **the dry click: the player's own dry-fire sound an octave down, enormous** (`boss/discharge` `dry`); guard slide / shatter (`boss/guard`).
- [ ] **Station voice**: every `story/line` with speaker `station` is **preceded by a three-note chime in the flat tuning** and carried by a tone pattern: **one blip per word, pitch by word length; never speech, no formants**; length fits the line's `seconds`.
- [ ] **`AudioCue` coverage**: every one of the 39 cues has a sound: `door_creak`, `gate_bang`, `gate_notch`, `shutter_bang` (a bang with a rattle), `hatch_iris`, `baffle_grind`, `grate_clang`, `lift_run`, `lever_throw`, `chairs_scrape`, `locker_chime`, `locker_open`, `dispense`, `ui_move`, `ui_select`, `ui_back`, `checkpoint` (a single soft wire note; also on `checkpoint/saved`), `station_chime`, `listen_tick` (a soft rising tick), `ask_wrong` (a flat tone), `ask_right`, `step_chime`, `cell_wake` (a rising chime), `hum_stop`, `water_below`, `ratchet`, `mouth_iris`, `glow_tone`, `haul_whine`, `refill_gurgle`, `dry_click_big`, `run_down`, `guard_slide`, `guard_shatter`, `fire_kindle`, `wire_resolve`, `sweep_creak`, `sand_pour`, `pump_clatter`. Honour `gain` and `pitch`.
- [ ] Pickups (`pickup/collected`): paper rustle and brass (`pk_rounds_6`), tin clink (`pk_rounds_12`), canteen slosh.

### 4.5 Ambience per zone (cross-faded on `zone/entered`; GDD 17 table)

| Zone | Bed | Events (seeded, sparse) |
|---|---|---|
| `the_lip` | band-passed noise wind with slow gusts; low-passed and close under the overhang (first seconds) | pebble ticks; the sweep creaking; a far pylon wire singing (a thin sine cluster) |
| `plenty_street` | wind; the wind-pump's creak and **a seven-beat clatter with one beat missing**; loose tin | a shutter tapping; cloth; the yard bell answering stray shots |
| `tally_house` | near silence; the lantern's flutter; wood ticking | eleven slow breaths, out of phase, just audible; dust hiss |
| `the_gallery` | **the station hum**; relay ticks; a drip that is not water (a pitched click) | the flickering strip's buzz; coats moving on the stair |
| `lift_hall` | the hum, wider | long tail on everything |
| `the_bore` | the hum, louder, with a slow "breath" (a filtered noise swell every 5 s) | after the seventh: silence, then water far below, then a clean hum, in tune |
| `far_rim` | cold wind, lower and steadier; no machine | a far wire; the fire's small crackle after `ending/fire` |

- [ ] **The station hum runs under every underground second: D2 and A2, both 20 cents flat, with slow beating.** The machines sing slightly flat.

### 4.6 The seventh (the sequence; drive it from `weapon/kept` and `boss/*`)
- [ ] `weapon/kept` `loading` → `boss/hush on`: ambience ducks, the ratchet swing.
- [ ] `weapon/kept` `fired`: the cut report and the pure D4 + D5 (3.5 s, no echo): it resolves the seventh degree left hanging at the jug gate.
- [ ] `boss/proven`: **the hum stops** (`cap_hum_stops`); **four seconds of true silence**: every bus but the kept tone's own tail at zero, no ambience events, no music; then on `audio/cue` `water_below`: water far below (`cap_water_below`); from then on the bore's hum is **clean and in tune** (D2 and A2 exact).
- [ ] Phase 3b: the enormous dry clicks; the run-down at the kill.

### 4.7 Music: a generative drone-and-wire system in D Dorian (no score)
- [ ] **Calm**: the zone's drone (two or three filtered oscillators, part of the ambience bed) and **the wire**: a plucked-string voice (Karplus-Strong) playing single notes or two-note figures at long random intervals (**8–20 s**, seeded), chosen from the scale; the nearest thing to a theme is **D, A, C (1, 5, 7), the seventh always left hanging**.
- [ ] **Combat layer**: a low skin drum (a sine thump with a noise slap) at **96 bpm** with three intensity states (sparse, steady, driving) set by `ctx.enemies.threat` (suggested: 1–2 sparse, 3–5 steady, 6+ driving), plus a bowed fifth swell. It **enters over 1 s** on `encounter/started` and **cuts to nothing on `encounter/cleared`**: the quiet after the gun is the reward.
- [ ] **Boss**: the drum locks to the Windlass's **1.1 s discharge cadence** (`boss/discharge`), so its ratchet is the percussion.
- [ ] **Ending**: on `audio/cue` `wire_resolve` (with `nar_last`) the wire plays D, A, C and **for the first and only time resolves to D** (`cap_wire_resolves`). No victory sting anywhere.
- [ ] `music/state` emitted on every change: `silent` (title menus may be `calm`; paused: everything suspended), `calm`, `combat` (intensity 1–3), `boss`, `ending`.
- [ ] `game/state` → `paused`: suspend the context or mute all buses; `dead`: a low-pass sweep down over 0.6 s; resume cleanly.

### 4.8 Captions: you raise every one of the 23 keys (`story/say { key }` when the sound starts)

| Key | On |
|---|---|
| `cap_bider_rattle` | `enemy/telegraph` (bider, lunge); the circling bark |
| `cap_bider_sits` | `enemy/freed` |
| `cap_transit_clack` | `enemy/spawned` (transit); the gait loop of a Transit outside the view cone |
| `cap_transit_tone` | `enemy/telegraph` (transit, aim) |
| `cap_stake` | `projectile/spawned` (stake) aimed at the player |
| `cap_tamper_hiss` | `enemy/telegraph` (tamper, slam) |
| `cap_tamper_howl` | `enemy/telegraph` (tamper, charge) |
| `cap_tamper_pound` | `vignette/state` (`vig_tamper`, started) |
| `cap_chairs` | `audio/cue` `chairs_scrape` |
| `cap_station_chime` | the chime before the first station line in each zone only |
| `cap_listening` | `asking/listen` with `lit` = 1 |
| `cap_ratchet` | `boss/indexing`; `boss/hush` on; `boss/defeated` |
| `cap_canister` | `projectile/spawned` (canister) |
| `cap_lance` | `boss/discharge` (lance) |
| `cap_refill` | `boss/mouth` (relit) |
| `cap_dry_click` | `boss/discharge` (dry), the first three of phase 3b |
| `cap_hum_stops` | `boss/proven` |
| `cap_water_below` | `audio/cue` `water_below` |
| `cap_gate` | `audio/cue` `gate_bang` |
| `cap_shutter` | `audio/cue` `shutter_bang` |
| `cap_locker_chime` | `audio/cue` `locker_chime` |
| `cap_fire_kindles` | `ending/fire` |
| `cap_wire_resolves` | `audio/cue` `wire_resolve` |

## 5. Sandbox (`sandbox/audio.html`)

A sound board: one button per gameplay event that makes a sound (with its payload variants) and per `AudioCue`; a zone reverb selector; the hum on / off and flat / in tune; music state and intensity; **the kept-round sequence** as one button; a six-shot cylinder with a reload; the jug scale 1–7; a scope and a peak meter; a caption log. `ext.audio.render()` available for offline assertions. A real click on the page unlocks the context.

## 6. Tests (`tests/audio/`; offline rendering through `ext.audio.render`, plus event-level tests with no context)

- [ ] **Coverage**: every `AudioCue` value renders non-silent (peak > 0.01) and under the limiter (peak ≤ 1.0); every event in 4.2–4.4 starts at least one voice (`recent()`), in particular **every `weapon/fired` and every `combat/hit` outcome and surface** ("no bullet produces nothing").
- [ ] **Captions**: every `cap_*` key of `design/story.json` is in your table and the sound board raises each one; none is raised without its sound.
- [ ] **Gun**: the report's first sample is at offset 0 (scheduled at `currentTime` on the event's tick); crack energy above 2 kHz in the first 3 ms; boom fundamental sweeps 150 → 50 Hz; pitch jitter within ±4 % and reproducible for a seed; the last two rounds differ (spectral centroid of the mechanics higher, tail RMS lower); six reload seat-clicks with strictly rising pitch; full report peak below clipping after the limiter with music and ambience running.
- [ ] **Tuning**: jug degrees 1–7 within ±5 cents of D Dorian from D3; the hum's partials at D2 and A2 **−20 ± 3 cents**; the line round's sine at D5 **+8 ± 2 cents**; **the kept round: D4 and D5 within ±1 cent, duration 3.5 ± 0.1 s, no noise floor above −60 dB after 120 ms, and no reverb send**.
- [ ] **The seventh**: after `boss/proven` the master output RMS is below −70 dB for 4.0 ± 0.1 s (minus the kept tone's remaining tail); the hum afterwards is in tune (±3 cents).
- [ ] **Music**: `music/state` goes `combat` within 1 s of `encounter/started` and `calm` / `silent` on the tick of `encounter/cleared`; intensity follows threat; boss drum hits land within 20 ms of `boss/discharge`; the wire's intervals are 8–20 s; the resolve to D happens only on `wire_resolve`.
- [ ] **Ducking**: −5 ± 1 dB on the music bus for 200 ± 30 ms per shot.
- [ ] **Reverb**: measured tail (−60 dB) per zone within ±20 % of 1.3 / 0.5 / 0.9 / 2.2 / 2.8 s.
- [ ] **Voices and cost**: 60 s of the worst fight script never exceeds 32 voices; your `fixedUpdate + update + lateUpdate` ≤ **0.3 ms** median; no per-frame node creation (count `AudioNode` constructions through a wrapper: zero outside sound starts); allocation ≤ 6 KB per tick, measured with `measureAlloc` of `tests/harness.mjs` (3000 ticks of warm-up).
- [ ] **Determinism**: with no running context the event-level behaviour (`recent()`, captions, `music/state`) is identical across two runs; audio never changes `__dbg.hash()`.
- [ ] **Unlock**: before `unlock()` nothing throws and nothing is scheduled in the past when it is finally called.

## 7. Definition of done (measured)

1. `npx tsc --noEmit` clean in your files (`npx tsc --noEmit 2>&1 | grep -E 'src/audio|sandbox/audio|tests/audio'` prints nothing); `npx vitest run tests/audio` and `node --test tests/audio/` pass. **Wired in: `KEEP7_REAL=audio node --test tests/core/` passes** (determinism and alloc are the ones audio can move: audio never changes `__dbg.hash()`): boot, flow, walk, seam, determinism, alloc, budget and playthrough then run on the index page with your system in its slot and core stubs in the other five (about 2.5 minutes, up to 3.5 on a busy machine: run it in your final pass, not while iterating). Plain `node --test tests/core/` keeps core stubs in all six slots and **never loads `src/audio/`**: it proves nothing about your system. `KEEP7_REAL` has only ever run against modules that wrap the stubs: a failure your system causes by design (a stub-specific value in an assertion) is a request to core in `docs/requests/code-audio.md` naming the test and both values, listed in your report, not something to work around (README 4.1).
2. `shots/code-audio/` (rendered by a small script from offline buffers; open each): spectrograms of the report in each of the five reverbs, the last-round report, the reload, the jug scale, a knot burst, the Transit tell, the Tamper howl, the station chime + a line, the kept round and the four seconds after it, the hum flat versus in tune; a screenshot of the sound board.
3. Report: measured tunings and tail lengths; voice peak; what could not be judged without ears (everything about how it *feels*: say so plainly and list the three sounds you are least sure of).

## 8. Non-goals

Audio files, samples, speech, any voice-over; a composed score or a victory sting; HRTF /
3D panning beyond stereo; deciding when things happen (you react to events); displaying
captions (UI) or guarding their rate (world); `music/state` consumers; gamepad rumble.

## 9. Dependencies and stubs

- You depend only on events and a few `ctx` reads, so the sandbox board and `__dbg.emit` are a complete stand-in for the game. Payload shapes are in `GameEvents`; the emitters' orders (`code-player`, `code-enemies`, `code-world`, `code-ui`) list when each fires.
- **Your tests load only your system**: `openGame(server, { piece: 'code-audio' })` on the index page defaults to `stubs: othersThan('audio')` (five core stubs beside you); leave the default. Deaths, restarts and warps inside a script: `game.step / until / run` survive them; in your own `page.evaluate` use `await __dbg.ext.core.stepAsync(n)` (a bare `__dbg.step` stops at the tick that queued the restore). Allocation: `measureAlloc` of `tests/harness.mjs` (3000 ticks of warm-up), ceiling 6 KB per tick. **`ctx.clock.tick` keeps counting while paused or loading**: timers that must stop with the game count ticks in your own `fixedUpdate` or use `clock.simTime` / `clock.unscaledTime` (README 4.1).
- Headless Chromium runs with `--mute-audio` and autoplay allowed: a context there is not proof of the unlock path; test the suspended-context path explicitly. Real listening is the player's and the critic's: your evidence is offline measurements.
- The view-model's `fire` clip puts the hammer cock and cylinder turn on frames 4–9 (133–300 ms at 30 fps): your two mechanical clicks land there.
