# Game feel and level design research — the six-gun demo

Scope: concrete, numeric starting values for one polished 15–25 minute FPS stage built
around a heavy six-shot revolver. Written for the GDD author, the player/gunplay coder,
the enemy-AI coder, the level blockout owner, the audio and UI owners, and the critics.

How to read the numbers. Every value carries one of three tags:

- **[S]** sourced — taken from a shipped game, a talk or a standard (see Sources).
- **[D]** derived — computed from the recommended values; the script is
  `scratch/game-feel/move_sim.py` (60 Hz integration, run it to re-derive after tuning).
- **[R]** recommendation — designer judgement informed by the sources. These are
  *starting* values. Nobody has played this game yet; expect to move most of them 10–30 %.

Names used here (Rusher, Marksman, Brute, Boss) are role labels only. The GDD owns the
real names. Nothing in this document uses names, terms or lines from the books.

---

## 0. The ten rules (if you read nothing else)

1. **No bullet may produce nothing.** With 6 rounds and a ~2.5 s reload, every shot must
   kill, stagger, interrupt, trigger or at minimum spark-and-clank. Silence after a shot is a bug.
2. **Lethal gun, short lives.** Shots-to-kill never changes with difficulty. No non-boss
   enemy needs more than one cylinder (6) when shot well.
3. **Feedback lands in the same frame as the click**: ray, flash, sound, kick, marker.
4. **Enemy shots are slow and visible; player shots are instant.** Fairness comes from
   telegraphs (>= 0.45 s melee, >= 0.7 s ranged, >= 0.9 s heavy), not from low damage.
5. **At most 2 enemies attack at once** (token system). Everyone else moves, barks, flanks, fakes.
6. **The fight rhythm is the cylinder**: ~2.4 s to empty, ~2.45 s to refill. Enemy attack
   and vulnerability windows are built around those two numbers, the boss most of all.
7. **One new thing per encounter**, shown safely first, then tested, then combined.
8. **Loud / quiet alternation**: no combat stretch over ~2.5 min, no quiet stretch
   without something new for more than ~90 s, at least 30–45 s of calm after a peak.
9. **A stall is the worst outcome**: ammo floor, health floor, escalating hints, checkpoints
   <= 90 s of lost play, retry in <= 3 s.
10. **Motion is opt-out, comfort is opt-in-by-default**: rotational shake only, small
    bob, FOV slider, reduce-motion and reduce-flash toggles, subtitles on.

---

## 1. First-person movement

### 1.1 Reference points

| Game | Value | Note |
|---|---|---|
| Quake | max speed 320 u/s, accelerate 10, friction 4, stopspeed 100, gravity 800, jump velocity 270 (apex ~45 u), step 18 u [S] | 56 u tall player: ~5.7 body-heights/s. Fast, slightly slidey. |
| Quake view | bob 0.02, bob cycle 0.6 s, roll angle 2.0 deg at roll speed 200, damage kick 0.5 s / 0.6 deg [S, from memory] | The classic "alive but not nauseating" camera. |
| Half-Life 2 | walk 150, run 190, sprint 320 u/s; jump adds 21 u; step-up 18 u [S]; walkable slope floor-normal >= 0.7, ~45 deg [S, from memory] | 72 u tall player: run ~2.6, sprint ~4.4 body-heights/s. |
| Source defaults | accelerate 10, friction 4, stopspeed 100, mouse 0.022 deg/count x sensitivity 3 = 0.066 deg/count [S, from memory] | 17.3 cm per 360 at 800 DPI [D]. |

Normalised by body height to our 1.8 m player, HL2's run is ~4.75 m/s and its sprint ~8 m/s;
Quake's run is ~10 m/s. A heavy gunslinger belongs at the HL2 end, not the Quake end.

### 1.2 Recommended model

Use the Quake ground model (friction with a stop-speed floor, then acceleration capped to
the wish speed). It is ~15 lines, frame-rate independent when run on a fixed tick, and its
behaviour is the reference every FPS player's hands already know.

| Parameter | Value | Tag | Why |
|---|---|---|---|
| Run speed (default) | 5.0 m/s | R | Deliberate, not sluggish. 2.8 body-heights/s. |
| Sprint | 6.75 m/s (x1.35), forward only | R | Kills dead air on backtracking. Firing cancels sprint instantly. |
| Backward / strafe | x0.9 / x1.0 | R | Do not punish strafing; this is a dodge-the-projectile game. |
| Ground accelerate | 12 (Quake-style; ~60 m/s^2 at 5 m/s) | R | 90 % of top speed in 0.12 s over 0.35 m [D]. |
| Ground friction | 8, stop speed 2.0 m/s | R | Full stop in 0.23 s over 0.43 m [D]. Quake's 4 gives 0.53 s / 0.98 m: reads as ice at this speed. |
| Air acceleration | 12 m/s^2 toward wish direction, no air friction, horizontal speed never exceeds take-off speed | R | Enough to correct a jump (~1 m sideways), not enough to bunny-hop. |
| Gravity | 24 m/s^2 | R | 2.4x real. Real gravity always reads as floaty in first person. |
| Jump apex | 1.0 m (v0 = 6.93 m/s) | R/D | Air time 0.58 s; clears 2.9 m at run, 3.9 m at sprint [D]. |
| Coyote time | 0.10 s | R (range 0.06–0.15 [S]) | Invisible forgiveness at ledges. |
| Jump buffer | 0.10 s | R (range 0.10–0.15 [S]) | Press slightly before landing still jumps. |
| Step-up | 0.35 m automatic | R (HL2: 18 u [S]) | Eye Y smoothed, see 1.4. |
| Walkable slope | <= 45 deg (ground normal Y >= 0.7) | S | Steeper: slide, no jump. |
| Fall damage | none | R | Lethal drops are kill volumes + checkpoint. One fewer way to feel cheated. |
| Crouch | none | R | Not needed by any planned mechanic; saves a collision state and an animation set. |

Level-design consequences (for `design/layout.json`):

- Required jumps: gap <= 2.0 m, height <= 0.6 m (about 70 % of capability). "Impossible"
  gaps: >= 5 m or visibly fenced. Never author a gap between 3 m and 4.5 m: it reads as maybe.
- Stairs: collide as a ramp (rise <= 0.18 m, run >= 0.28 m, ~33 deg), render as steps.
  Stepped collision makes the camera stutter and catches the capsule.
- Corridors >= 1.8 m wide for the player; combat lanes >= 3 m (two capsules plus dodge room).
- Kerbs, rubble and door sills <= 0.30 m so the step-up always clears them. Anything the
  player should not climb is >= 1.2 m or sloped > 45 deg. Nothing in between.

### 1.3 Input and latency

- Mouse look is applied **every rendered frame, unsmoothed, unaccelerated**, independent of
  the fixed simulation tick. Smoothing the look is the single most common cause of "floaty".
- Request raw input: `requestPointerLock({ unadjustedMovement: true })`, fall back to plain
  pointer lock when the promise rejects (Chromium supports it; others may not).
- Default sensitivity 0.07 deg per count [R] (16 cm/360 at 800 DPI, 8 cm at 1600 DPI [D]).
  three.js `PointerLockControls` uses 0.002 rad/count = 0.115 deg/count = 10 cm/360 at
  800 DPI [D], which is too fast for a precision revolver. Slider x0.2 to x4, live preview.
- Response budget: under ~100 ms from input to visible/audible result feels instantaneous;
  beyond that it feels sluggish (Swink, *Game Feel*, after the Model Human Processor: ~100 ms
  perceive + ~70 ms decide + ~70 ms act = ~240 ms correction cycle) [S, from memory]. Target:
  fire result drawn in the frame after the click; sound scheduled immediately
  (`AudioContext({ latencyHint: 'interactive' })`).
- Fixed 60 Hz simulation with render interpolation. On a slow machine at 35–45 fps the
  world stays smooth and the mouse stays 1:1. Uneven frame pacing damages feel more than
  low resolution does, so adaptive resolution should chase steady frame time first.
- Pre-warm everything that appears in the first fight (muzzle flash, impact particles,
  enemy materials, decals) during loading. A shader-compile hitch on the first shot is the
  worst possible first impression of "the gun is the star".

### 1.4 Camera

| Item | Value | Tag |
|---|---|---|
| FOV default | 62 deg vertical = 94 deg horizontal at 16:9 [D] | R |
| FOV range | 50–80 deg vertical (79–112 deg horizontal at 16:9 [D]); show the 16:9 horizontal figure in the UI | R |
| Viewmodel FOV | fixed ~50–55 deg vertical, independent of world FOV | R (Source renders viewmodels at their own FOV [S]) |
| Sprint FOV kick | +4 deg over 0.2 s, back over 0.3 s | R |
| Head bob (camera) | vertical 0.028 m, lateral 0.014 m at run; one cycle per footfall | R |
| Bob frequency | distance-driven: a footfall every 1.9 m at run (2.6 Hz), 2.3 m at sprint (2.9 Hz) [D] | R |
| Weapon bob | 2–3x the camera amplitude, figure-of-eight, plus 30–50 ms sway lag behind look | R |
| Strafe roll | 1.0 deg at full strafe speed (Quake: 2.0 [S]) | R |
| Step-up smoothing | eye Y eases to target with rate 18/s (~90 % in 0.13 s); never smooth X/Z | R |
| Landing dip | eye dips 0.012 m per m/s of impact speed, clamp 0.12 m; spring back in 0.22 s; weapon dips 2x | R |
| Hard landing (fall > 3 m) | + trauma 0.2, low thud, 0.15 s of x0.6 move speed | R |

Notes: three.js `PerspectiveCamera.fov` is vertical, so wider monitors get more horizontal
view automatically (Hor+). "FOV 90" in classic 4:3 shooters is 73.7 deg vertical, i.e. 106 deg
horizontal on 16:9 [D] — much wider than a modern "90". Put motion on the **weapon**, not
the world: weapon bob and sway sell movement without moving the horizon, which is what
causes sickness. All camera motion scales with the bob and shake sliders (section 7).

---

## 2. Revolver gunfeel

### 2.1 Reference weapons

| Weapon | Cadence | Capacity / reload | Damage model | Tag |
|---|---|---|---|---|
| Overwatch Peacekeeper | 0.5 s per shot | 6 / 1.5 s full | 70 body, x2 head, hitscan with falloff | S (cadence/reload from memory) |
| Overwatch Fan the Hammer | 6 rounds in 0.67 s | — | 50 per shot, wide spread, heavy falloff | S |
| Hunt: Showdown Conversion/Pax | cycle 1.4 s (21 rpm); fanning 300 rpm | 6 / slow per-round reload | 104–110, projectile 300 m/s | S |
| Half-Life 2 .357 | ~0.75 s | 6 / long full reload | 40 (the game's hardest-hitting bullet), pinpoint | S (cadence from memory) |
| Destiny hand cannons | 120–140 rpm (0.43–0.5 s) | — | accuracy drops briefly after each shot, then recovers | S (rpm from memory) |

Two lessons. First, the well-loved *arcade* revolvers sit at 0.43–0.5 s per shot; Hunt's
1.4 s only works because its enemies also die in one or two hits and its pace is stealthy.
Second, every one of them is pinpoint accurate on a rested first shot. A revolver that
misses when the crosshair is on target is the fastest way to break pillar 1.

### 2.2 Core recommendation

| Item | Value | Tag |
|---|---|---|
| Ballistics | hitscan, range 200 m, no damage falloff inside the stage | R |
| Tracer | cosmetic only: thin streak, 1–2 frames, or travelling at ~300 m/s | R |
| Cadence | 0.48 s between shots (125 rpm); semi-auto, one shot per click | R |
| Fire input buffer | a click in the last 0.15 s of the cycle fires on the first legal frame | R |
| Cylinder | 6. Six shots span 2.40 s first-to-last [D] | — |
| Damage | 100 body; x2 head and exposed weak point; x0.25 on armour plate | R |
| Spread | 0 deg on a rested shot, standing or moving. Bloom +1.5 deg per shot, decays fully in 0.35 s, so normal cadence is always pinpoint; only fanning accumulates it | R |
| Hit test | inflate head hit volumes ~1.4x the visual head (radius ~0.17 m). Favour the shooter | R |
| Aim-down-sights | **none** | R |
| Alt-fire | **fan the hammer** (hold): 0.17 s interval (6 rounds in 0.85 s [D]), 5 deg cone, no head multiplier, 1.6x kick | R |
| Reload | per round, interruptible: open 0.35 s + 0.30 s per round + close 0.30 s = **2.45 s** for six [D] | R |
| Reload interrupt | fire pressed: finish the round in hand, fast-close 0.20 s, fire. Worst case 0.50 s | R |
| Reload while sprinting | allowed. Run-and-reload is the core retreat move | R |
| Empty cylinder | trigger pull gives a dry click, reload starts on that click. Manual reload any time | R |
| Sustained rate | 1.13 shots/s including reloads; burst 2.08 shots/s [D] | — |

Why no ADS: the fantasy is a gunslinger who shoots from the hip with frightening
accuracy. ADS would add a FOV change, a sensitivity curve, a movement penalty and a
second weapon pose, and would pull play toward stand-and-peek, which fights the
dodge-driven combat that slow enemy projectiles create. Quake, Half-Life and DOOM (2016)
all ship without it. A small, crisp crosshair (dot plus four ticks, dark outline) does the job.

Why fan as alt-fire: it gives the single weapon two verbs with a real trade. Precise fire
is ammo-efficient and safe at range; the fan empties the cylinder in under a second
for a panic stagger at close range and then costs a full 2.45 s reload. It needs one extra
animation clip and one extra sound; if the animation budget is tight it is the first cut,
and nothing else in this document depends on it.

Why per-round reload: it is the authentic single-action loading-gate motion, it makes a
partial cylinder a decision ("fire now with three, or keep loading?"), and it is naturally
interruptible. A full swing-out reload is all-or-nothing and creates dead time.

### 2.3 Anatomy of one shot (timeline)

| t (ms) | Event |
|---|---|
| 0 | Click. Same tick: ray resolved, round removed, muzzle flash on, sound starts, camera kick starts, viewmodel kick starts, hit marker + impact effect + enemy flinch if hit |
| 0–50 | Muzzle flash visible (2–3 frames), random 1 of 4 sprites/rotations. Light pulse peaks |
| 50–60 | Camera pitch kick peaks at +2.5 deg (+/-0.4 deg yaw). Viewmodel: 0.08 m back, ~20 deg muzzle rise |
| 60–80 | Flash light fully decayed. On a kill: target frozen in pose until ~70 ms, then death animation |
| 120–300 | Hammer cock and cylinder rotation: animation plus two mechanical clicks. This is the "weight" |
| 300–330 | Camera back exactly on the original aim point (critically damped). Buffer window opens |
| 480 | Ready |
| 0–700 | Powder smoke puff drifts and fades (3–5 soft particles) |
| 0–1500 | Report tail rings out (outdoor) |

The kick **returns to the exact aim point** before the next shot is available. There is no
recoil pattern to learn. Recoil here is spectacle, not an accuracy tax; in a single-player
game with a 0.48 s cadence a persistent climb would only add frustration.

### 2.4 Feedback values

| Channel | Value | Tag |
|---|---|---|
| Fire shake | rotational only; trauma +0.25; shake = trauma^2; max 1.2 deg pitch/yaw, 1.5 deg roll; ~20 Hz noise; trauma decays 1.8/s | R (model: Eiserloh [S]) |
| Shake caps | total trauma clamped to 1.0; never translate the camera; multiplied by the user's shake slider | S (rotational-only in 3D) |
| FOV punch on fire | +1.2 deg for 80 ms | R |
| Hit marker | 90 ms; four ticks | R |
| Weak-point marker | 120 ms; different shape (not only colour) plus a higher-pitched "tink" | R |
| Kill marker | 160 ms; ticks expand outward; low thud layered under the report tail | R |
| Hit-stop, ordinary hit | none globally. Target-local pose freeze 40–60 ms | R |
| Hit-stop, kill | target-local freeze 60–80 ms, then a directional death | R (general range 50–120 ms [S]) |
| Slow-motion | only on the last kill of an encounter and boss phase breaks: time scale 0.3 for 0.25–0.4 s real time, audio low-passed. Camera look stays real-time | R |
| Damage taken | trauma +0.3 to +0.6 by damage; directional red arc on the HUD, 0.6 s; never a full-screen flash | R |
| Muzzle light | one unshadowed light or a faked pulse, radius 6–8 m, 60–80 ms | R |

Global time freezes are a melee-game tool. In a mouse-aimed shooter a frozen frame reads as
a dropped frame, so freeze the *target*, not the world, and reserve world slow-motion for
the punctuation marks. Never scale mouse look by the time scale.

Impacts and persistence:

- Surface-specific impact sets: sand/dust (puff, 0.6–0.9 s), wood (splinters), metal
  (6–12 sparks, 150–300 ms, ricochet whine on about one hit in three), stone (chips),
  enemy (material-appropriate burst, direction = bullet direction).
- Decal pool of 48, oldest recycled, each lives >= 20 s. Corpses stay for the whole
  encounter at least. Permanence is one of the cheapest sources of "I did that" (Vlambeer).
- A killed Rusher is thrown back 1.0–1.5 m along the shot direction, so a kill at point-blank
  range also clears space.
- Armour hit: grey spark, flat clank, no hit marker (or a distinct "deflected" glyph), small
  0.2 m pushback. The player must learn "wrong spot" from one shot.

Enemy reactions (the shot as a verb):

| Target state | Effect of one hit |
|---|---|
| Rusher, any | dies |
| Marksman aiming | aim is broken, telegraph restarts (the revolver is a parry) |
| Marksman, body | flinch 0.25 s; second body hit kills |
| Brute, armour | spark, 0.2 m pushback, no interrupt |
| Brute, weak point during wind-up | stagger 1.5 s, attack cancelled |
| Boss, weak point | flinch, visible chunk of bar, audio sting |

### 2.5 Audio layering (WebAudio synthesis, no samples)

Build the report from layers, each with its own envelope, and vary pitch +/-4 % per shot:

1. **Crack** — 2–5 ms broadband noise burst, high-passed ~2 kHz. This is the transient that
   makes it feel instant; schedule it at `currentTime` with no ramp.
2. **Body** — band-passed noise 600–2500 Hz, 80–150 ms exponential decay.
3. **Boom** — sine or triangle sweeping ~150 Hz to ~50 Hz over 120–180 ms. This is the "heavy".
4. **Mechanics** — hammer fall click at 0 ms; cock and cylinder ratchet at 120–300 ms. Quiet
   but present: mechanical detail is what separates a revolver from "a gun".
5. **Tail** — feedback-delay or convolver reverb: 1.0–1.5 s outdoors with a discrete slap-back
   echo at 250–400 ms for canyon/desert space; 0.4–0.6 s dense early reflections indoors.
   The tail tells the player where they are; switch it per zone.
6. **Duck** — drop music and ambience 4–6 dB for 200 ms on each shot so the gun owns the mix.

Also: the last two rounds get a subtle timbre change (brighter mechanics, slightly
drier tail) so players feel "nearly empty" without reading the HUD; dry fire is a single
dead click; each reload round is a distinct seat-click so the count is audible.
Mix priority: player gun > enemy telegraphs > hit confirms > everything else.

### 2.6 Ammo, health and the economy

- Shots-to-kill (the only balance unit that matters): Rusher 1 (100 HP); Marksman 2 body
  / 1 head (200 HP); Brute 6 unarmoured body hits or 3 weak-point hits (600 HP; 24 if
  every shot lands on plate, which is the lesson); boss ~25–30 weak-point hits. [R]
- Player kill throughput is ~0.7 hits/s sustained at 60 % accuracy [D]. An encounter worth
  16 "bullets of enemy health" is therefore ~25 s of pure shooting and ~60–75 s of real
  fight once moving and dodging are included. Budget encounters in bullets, not hit points.
- Ammo: start 6 + 24. Reserve cap 36. Pickups of 6 (common) and 12 (cache). Total supply
  across the stage ~2x what a perfect run needs on Normal, ~40 % as fixed placements,
  the rest as drops. [R]
- **Ammo floor (mandatory):** if cylinder + reserve <= 6, the next kill or breakable drops 6.
  Every shoot-to-solve puzzle has a self-refilling ammo box within 10 m. A demo with one gun
  must be impossible to soft-lock by running dry.
- Health 100. Largest single hit <= 40. Three segments of ~33; the current segment
  regenerates after 4 s without damage; pickups restore a full segment. This keeps tension
  inside a fight and prevents the 5-HP death spiral between fights. [R]
- Quiet helpers used by well-regarded shooters, all cheap to add [S]: the last ~20 % of the
  health bar absorbs more than it shows (DOOM, Assassin's Creed); an enemy's first shot at a
  fresh target always misses (BioShock); a fatal hit from above 25 HP leaves 1 HP plus 0.75 s
  of grace; enemies are less accurate against a moving player (DOOM 2016).

---

## 3. Enemies: three archetypes and a boss

### 3.1 Roles

Each archetype must ask the player a different question, and the answers must conflict
when two types are combined (DOOM's "combat chess": the fun is deciding whom to shoot first).

| | Rusher | Marksman | Brute |
|---|---|---|---|
| Question it asks | "Can you keep moving and count your rounds?" | "Can you aim under pressure and use cover?" | "Can you find the weak point and hold your nerve?" |
| Role | pressure, flushes player out of cover | zoning, punishes standing in the open | anchor, area denial, set-piece |
| Silhouette | low, hunched, forward lean; ~1.4 m | tall, thin, long vertical weapon line; ~1.9 m | wide and tall; ~2.4 m x 1.6 m |
| Speed | 5.8 m/s (faster than run, slower than sprint) | 3.5 m/s, relocates | 2.5 m/s walk; 9 m/s charge |
| Shots to kill | 1 | 2 body / 1 head | 6 body / 3 weak point |
| Attack | lunge, 1.8 m reach, 18 dmg | visible projectile 18 m/s, 22 dmg | slam radius 3.5 m, 38 dmg; or straight-line charge 35 dmg |
| Telegraph | 0.5 s crouch + shriek | 0.9 s raise + glint + rising tone | 1.0 s slam wind-up; 0.8 s charge paw + roar |
| Recovery (punish window) | 0.6 s after a missed lunge | 1.2 s between shots, relocates after 2 | 1.5 s after slam; 2.0 s stunned if a charge hits a wall, weak point exposed |
| Preferred range | 0–2 m | 12–25 m | 0–6 m |
| Max alive at once | 4–5 | 2 | 1 (2 only in the finale) |
| Threat points | 1 | 2 | 4 |

All values [R]. Design notes:

- **Speeds are chosen against the player's.** The Rusher out-runs a back-pedalling player
  (5.8 vs 4.5) but not a sprinting one (6.75), so retreat is a decision, not a default.
- **Projectile speed 18 m/s** gives 0.83 s of flight at 15 m and 0.56 s at 10 m [D]. A
  side-step needs ~0.5 m, which takes ~0.2 s from rest [D], leaving 0.35–0.6 s of reaction
  time: fair for anyone who is looking. Inside 8 m the Marksman should prefer to back off.
- **Silhouettes** must be told apart at 30 m and at ~64 px tall from outline alone: three
  different height-to-width ratios and three different postures. Test this in a flat
  unlit render before detailing anything.
- **One reserved colour for "shoot here"** (weak points and puzzle targets share it) and one
  for "this will hurt you" (telegraph glints, slam decals). Neither may appear anywhere
  else in the art. Back both with shape or motion so they survive colour-blindness.
- **Lifespan is intelligence.** Bungie's Halo playtests: identical AI was rated "very
  intelligent" by 8 % of testers when enemies died quickly and by 43 % when they were
  tougher; "not intelligent" fell from 20 % to 0 %, and "about right" difficulty rose from
  52 % to 92 % [S]. Our gun is lethal by design, so buy lifespan with *time before the
  shot* instead of hit points: approach distance, cover, armour that must be worked around,
  and entrances that show the enemy doing something before it is a threat.

### 3.2 Telegraph rules

- Simple visual reaction is ~0.2–0.25 s; see-decide-move is ~0.4–0.6 s. So: melee wind-ups
  >= 0.45 s, ranged >= 0.7 s, area attacks >= 0.9 s, boss signature attacks 1.0–1.5 s. [R]
- Every telegraph is **both** a pose that reads in silhouette and a unique sound. The sound
  matters more: it works when the enemy is off-screen.
- Enemies outside the player's view cone attack at half frequency and never start an
  attack from behind within 6 m without their audio cue having played.
- The pose before a shot is also the headshot window: Marksmen hold their head still for
  the last 0.4 s of the aim. Heads never jitter.
- Telegraph durations scale with difficulty (+20 % Easy, -10 % Hard). Health does not.

### 3.3 How many, and where

- **Attack tokens** [S: DOOM 2016; Half-Life 1 allowed two attackers]. One global pool:
  **2 concurrent attacks on Normal** (Easy 1, Hard 3). Within it, at most 2 melee, 1 ranged
  and 1 heavy at a time. A token is held from the start of the wind-up to the end of the
  attack, then that enemy cools down 0.6 s before asking again. Enemies without a token
  reposition, circle, bark or feint. The boss sits outside the pool; while it is mid-attack
  its adds share a single token. An enemy that is better placed (closer, in view) may take
  a token from one that has held it for > 1.5 s without attacking, as DOOM's do.
- **Alive budget** in threat points: first fight 3, mid-stage 5–6, finale 8. Hard cap of 8
  bodies alive. The limit is the revolver's throughput, not the renderer: 8 single-mesh
  skinned enemies are ~8–16 of the 100 draw calls.
- **Encounter size**: 4–14 enemies total in 2–3 waves, 45–120 s. Next wave triggers when
  the alive budget drops to ~30 %, or after 12 s of no contact, whichever is first.
- **Arena**: 18–28 m across; at least two loops so the player can always circle; no dead
  ends; full-height cover (>= 2 m tall, 1.2–2 m wide) every 5–8 m since there is no crouch;
  lanes >= 3 m; sightlines 15–30 m for Marksman play; one elevated or recessed "problem"
  position per arena. Brutes need openings >= 2.0 m wide and >= 2.8 m tall.
- **Spawning**: from visible, diegetic entry points (doors, breaches, climbing up from
  below) with a 0.8–1.5 s emergence during which the enemy is shootable; >= 12 m from the
  player; never in plain view from nothing; never behind the player within 8 m.
- **Exits**: the way forward is visible but shut before the fight and opens with an
  unmistakable audio-visual cue when the last enemy dies. The last kill gets the slow-motion beat.

### 3.4 Cheap behaviours that read as smart

Ordered by value for cost. All have precedent in Halo, F.E.A.R., Half-Life or DOOM [S].

1. **Announce intent.** A bark before every decision (charge, reload, flank, flee). F.E.A.R.'s
   squads looked coordinated largely because individuals *said* what they were doing. With
   synthesised audio, give each archetype 4–6 distinct non-verbal calls and caption them.
2. **Authored firing points.** Mark positions in `layout.json`; score by line of sight,
   distance band, not occupied, not recently used. Halo did exactly this ("a discrete answer
   to a continuous problem"). DOOM 2016's refinement: prefer spots *near* cover but *visible*
   to the player, so enemies are targets, not hiders.
3. **Tokens** (above). The enemies that are not attacking are what make a fight look tactical.
4. **Last known position.** Enemies act on where they last saw the player, look there, and
   advance on it. Players who break line of sight and reappear elsewhere feel clever, and
   the AI looks like it was searching.
5. **Visible reactions**: flinch on hit, recoil when a neighbour dies, a 0.3 s "startle"
   on first sight. Halo's goals were "intelligible, interactive, unpredictable" in that order.
6. **Morale break.** When the Brute dies, surviving Rushers hesitate or flee for 2 s. One
   rule, enormous payoff (Halo's Grunts).
7. **Deliberate misses**: first shot always misses; accuracy drops against a moving target.
8. **Desynchronise**: 0.1–0.4 s random reaction delay per enemy, staggered arrivals, no two
   attacks starting within 0.3 s of each other.
9. **Juke at range only.** Marksmen side-step when the crosshair rests on them for > 0.6 s
   at > 10 m, at most once per 3 s. Makes them feel aware without making them unhittable.

Cost control: stagger line-of-sight rays (<= 4 per frame across all enemies), think at
10 Hz with per-enemy phase offsets, animate and steer at 60 Hz, pool everything.

---

## 4. Encounter and stage pacing (15–25 minutes)

### 4.1 Principles with numbers

- Left 4 Dead's director: build up, hold the peak 3–5 s, let the fight fade, then **relax
  for 30–45 s** before building again; it changes *frequency* of pressure, not amplitude.
  "Constant combat is fatiguing; long inactivity is boring." [S]
- Halo's loop is "30 seconds of fun" repeated in a new context each time; design owned the
  3-minute scope, code the 30-second scope [S]. Plan the stage as ~3-minute beats.
- Valve built Half-Life 2 by play-testing 15 minutes of rough gameplay at a time and
  re-prioritising weekly until it "was no longer painful to watch" [S]. For this project
  the step-hook playthrough and fresh-context critics stand in for that loop.
- Demo data: median demo play time is commonly reported near 14 minutes; the hook must land
  inside 10; 20–40 minutes of content is the usual advice; a demo is free, so players quit
  at the first frustration — err toward easy [S, secondary sources].
- Time to first shot <= 2.5 min; first kill <= 4.5 min; something new at least every 90 s
  (vista, enemy, mechanic, story object, pickup). [R]

### 4.2 Recommended beat sheet

Intensity 0–10. Times are for a median first-time player; the GDD maps beats to real places.

| # | Minutes | Beat | Int. | New thing | Notes |
|---|---|---|---|---|---|
| 1 | 0:00–1:30 | Arrival, vista | 1 | move, look; destination landmark visible | No text wall. Control in <= 10 s. |
| 2 | 1:30–2:30 | The gun | 2 | fire, reload | A gate that only a bullet opens. |
| 3 | 2:30–5:00 | Fight 1 | 4 | Rusher | 1, then 2, then 3. Budget 3. |
| 4 | 5:00–7:30 | Quiet: place and story, Puzzle 1 | 2 | shoot-to-solve + observation | First secret nearby. Checkpoint. |
| 5 | 7:30–10:00 | Fight 2 | 6 | Marksman | Alone at range first, then with Rushers. |
| 6 | 10:00–12:30 | Descent / interior, Puzzle 2 | 3 | Old-World machinery logic or timing | Mood turn. One solitary scare. |
| 7 | 12:30–15:00 | Fight 3 | 7 | Brute | Seen safely first; alone; then with Rushers. |
| 8 | 15:00–16:30 | Calm before | 2 | story peak, full resupply | Boss foreshadowed by sound. Checkpoint. |
| 9 | 16:30–18:00 | Gauntlet | 8 | all three combined | Budget 8, two waves. Cut first if over scope. |
| 10 | 18:00–22:00 | Boss | 9–10 | section 6 | Checkpoint per phase. |
| 11 | 22:00–23:30 | Ending | 1 | the pursuit continues | Silence, image, card, stats. |

```
 10 |                                                    ###
  9 |                                                #######
  8 |                                         ##############
  7 |                               ######    ##############
  6 |                   ######      ######    ##############
  5 |                   ######      ######    ##############
  4 |      ######       ######      ######    ##############
  3 |      ######       ##################    ##############
  2 |    ###################################################
  1 |###########################################################
    +------------------------------------------------------------ min
     0    2    4    6    8    10   12   14   16   18   20   22   24
beat  1   2   3     4     5      6     7    8   9      10    11
```

Each peak is higher than the last and each valley returns to 2–3, never to a flat 0. Three
fights introduce one archetype each; the fourth combines them; the boss examines
everything. The valley before the boss (beat 8) is deliberate: Stout's "build-up" beat.

### 4.3 Teaching without pop-ups

- **Show it happening to something else first** (Half-Life 2's barnacle eating a bird; the
  saw blade already buried in a zombie) [S]. Each archetype's first appearance is a safe
  vignette: seen through bars, across a gap, or busy with something else.
- **Gate on the skill.** The only way past beat 2 is to shoot a mechanism. A player who is
  through that gate provably knows fire and aim. Use the same trick for reload (the gate
  needs 7 shots) and for weak points (a lock with the reserved colour).
- **Isolate, then combine**: introduce in safety, test alone, twist, combine. One new
  thing per encounter.
- **Prompts are a fallback, not a script.** Allow at most five small key hints (move, fire,
  reload, sprint, interact). Each appears only if the player has not done the action within
  ~4 s of first needing it, and never again after the first success.
- **Lead with light, motion and sound.** The way forward is the brightest, most contrasting
  or only moving thing in frame. A tall landmark visible from the first minute fixes the
  goal. In a baked-lighting game this is free: it is a decision in the bake, not a system.

### 4.4 Checkpoints, rewards, ending

- Checkpoint before and after every fight and puzzle; a death never costs more than ~90 s.
  Death to control in <= 3 s. Never replay a cutscene or vignette on retry.
- A checkpoint never saves a losing state: restore to >= 60 health and >= 18 reserve rounds.
- Rewards a demo can afford: 2–3 secrets found by attention (each gives a story fragment
  and ammo); an end card with time, accuracy, head-shot share and secrets found. The real
  reward for a fight is the quiet after it: a view, a story beat, a refill.
- The ending is a designed beat, not a cut-off: kill sequence, 3–5 s of near silence, one
  strong final image that reframes the pursuit, a short card, stats, "play again". Demos
  with an arc (intro, escalation, climax) are reported to convert far better than demos that
  simply stop [S, weak source — treat as direction, not a number].

---

## 5. Puzzles inside a shooter

What works, in order of fit with pillar 4:

| Type | Example shape | Why it fits |
|---|---|---|
| Shoot-to-solve | targets as switches; counterweights; chains; the reserved-colour lock | Uses the one verb the player has mastered |
| Cylinder-as-constraint | six targets, a window shorter than a reload; or "seven things, six rounds" | Makes the gun's defining limit the puzzle |
| Observation | an order or pattern shown in the environment, entered with bullets | Rewards the attention the art team paid for |
| Environmental logic | route power through dying machinery: rotate, align, open, in <= 3 steps | Delivers the "world that moved on" fantasy |
| Timing | shoot a moving part at the right moment; a pendulum; a rotating shutter | Aim skill under no threat: a palate cleanser |

Rules [R]:

- Median solve time 60–180 s. Three steps at most. If a critic's automated or blind
  playthrough exceeds 4 min, the puzzle is broken, not the player.
- **One-room rule**: every element and the result are visible from one standing spot, or
  at most two adjacent spaces with a clear line of sight between them.
- State is always legible: progress lamps (1 of 3, 2 of 3), sound per correct step, and a
  visible, audible reset. Wrong inputs do *something* harmless and informative.
- No combat during a puzzle. "Solve, then ambush" is a good hinge from quiet to loud.
- No pixel hunts, no red herrings in the reserved colour, no missable pieces, no reset that
  costs more than 5 s of walking.
- Puzzles never consume the player's ability to fight: refilling ammo box nearby.

Hint escalation. The timer counts only time spent inside the puzzle zone without progress,
pauses in combat, and resets on every correct step:

| Tier | When | What |
|---|---|---|
| 0 | always | Composition: light, framing, sound source, a cable or pipe that visibly connects cause and effect |
| 1 | 60 s | Diegetic nudge: the next target glints, hums or sparks; no words |
| 2 | 120 s | One line from the narrator/protagonist naming the *goal*, not the method (subtitle) |
| 3 | 210 s | A line naming the next *action*, plus an outline pulse on the object |

God of War Ragnarok was widely criticised for companions solving puzzles before players had
looked around, and patched in an option to slow hints [S]; so no words before ~2 min, and
offer "Puzzle hints: Off / Normal / Fast" (Fast = 30 / 60 / 120 s).

---

## 6. Boss

Structure: Mike Stout's eight beats [S] — build-up, reveal, business as usual, escalation,
midpoint, "it's on", kill sequence, victory sequence. A boss is "a test and a story".

| Item | Value | Tag |
|---|---|---|
| Length | 3–5 min for a winning attempt; median 2–3 attempts on Normal | R |
| Phases | 3, each 60–90 s, each ~8–10 weak-point hits | R |
| Attacks | 2 in phase 1; +1 in phase 2; +1 and faster in phase 3. Four total, four distinct tells | R |
| Telegraphs | signature attacks 1.0–1.5 s; quick attacks 0.6–0.8 s; audio and pose for every one | R |
| Vulnerability window | 3.0–4.0 s after each attack pattern | R |
| Pattern length | 4–6 s (time to dodge and reload a full cylinder: 2.45 s) | R |
| Phase gate | damage does not carry over a boundary; 2–4 s invulnerable transition with spectacle; checkpoint | R |
| Adds | 2–3 Rushers between patterns from phase 2; each drops ammo or health | R |
| Arena | 24–30 m across, round or oval, 4–6 full-height pillars, two ammo points, no dead ends | R |
| Max single hit | <= 40 of 100; no instant kills; no unavoidable damage | R |
| Mercy | after 2 deaths in the same phase: boss damage x0.85, one extra ammo drop, silently | R |

The key idea: **the boss fight is the cylinder made visible.** A vulnerability window of
3–4 s is one cylinder (2.4 s) plus reaction time. A pattern of 4–6 s is a reload plus a
dodge. So the loop is: read the tell, dodge while reloading, empty six into the weak point,
repeat — with each phase changing how the weak point is exposed (phase 1: it opens after an
attack; phase 2: the player must shoot something in the arena to open it, reusing the
puzzle language; phase 3: it is open but moving, and adds interfere).

Fairness and clarity:

- Show a boss health bar with phase pips. Immune hits get the armour feedback (grey spark,
  clank, no marker); weak-point hits get the biggest feedback in the game. "Am I hurting
  it?" must never be a question.
- Any attack launched from off-screen has an audio cue with clear direction.
- Every death should be explainable in one sentence by the player ("I got greedy and did
  not reload"). If the critics cannot say why they died, the tell is too weak.
- Retry starts at the phase, in <= 3 s, intro skipped.
- Kill sequence: the final hit triggers 0.2x time for ~0.6 s, a unique death of >= 3 s,
  then quiet. The victory sequence is the ending beat of section 4.4.

---

## 7. Options and accessibility

Minimum set, drawn from the Game Accessibility Guidelines' basic tier [S] (remappable
controls, sensitivity, readable text, FOV, subtitles, difficulty choice, avoid flicker) and
the motion-sickness triggers they and Xbox's guidelines name (FOV, shake, bob, weapon sway).

| Option | Range | Default |
|---|---|---|
| Mouse sensitivity | x0.2–x4 of 0.07 deg/count, applied live | x1 |
| Invert Y | on/off | off |
| Field of view | 50–80 deg vertical, shown as 16:9 horizontal (79–112) | 62 (94 horizontal) |
| Head bob | 0–150 % | 100 % |
| Screen shake | 0–100 % | 100 % |
| Reduce motion | master toggle: bob 0, shake 0, no FOV kicks, no slow-motion, no strafe roll | off |
| Reduce flashes | muzzle light halved, no additive screen effects, hit flashes become outlines | off |
| Subtitles | on/off; size S/M/L/XL; background opacity 0–100 %; captions for key sounds | on, M, 60 % |
| Difficulty | Easy / Normal / Hard, changeable mid-game | Normal |
| Sprint | hold / toggle | hold |
| Fire | click per shot / hold to repeat at cadence | click |
| Key bindings | rebindable; at least WASD/arrows and the main actions | — |
| Crosshair | size, colour, outline on/off | small, white, outlined |
| Puzzle hints | Off / Normal / Fast | Normal |
| Graphics | Auto / Low / High; resolution scale | Auto |
| Volume | master, effects, music | 80 / 100 / 70 |

Specifics:

- **Subtitles**: default ~2.6 % of screen height (28 px at 1080p), L 3.3 %, XL 4.2 %;
  at most 2 lines of ~40 characters; hold each line >= 1.5 s plus ~60 ms per character; speaker label when
  it is not the protagonist. Xbox's guideline minimum for PC text is 18 px at 1080p and
  26 px on console [S, from memory]; subtitles should be well above the minimum because
  they are read under time pressure.
- **Flashing**: WCAG 2.3.1 — no more than three flashes in any one second unless the
  flashing area is under 25 % of a 10-degree visual field (about 341 x 256 px on a
  1024 x 768 view) [S]. Normal fire is 2.1 flashes/s and passes. **Fanning is ~6 flashes/s**,
  so the muzzle flash sprite and its light must stay small on screen and must never be a
  full-screen effect; "Reduce flashes" halves it again. Avoid saturated red flashes entirely.
- **Difficulty changes** damage taken (x0.6 / x1.0 / x1.4), token pools, telegraph length
  and drop rates. It never changes shots-to-kill: the gun feels the same on every setting.
- Pause works everywhere, including vignettes. Settings are reachable from pause and
  apply without a restart. Sensitivity and FOV are on the first settings page.
- Colour is never the only carrier: weak points pulse, telegraphs have shape and sound.

---

## 8. How demos feel bad, and the fix

| Symptom | Usual cause | Fix (with the number) |
|---|---|---|
| Floaty movement | real gravity, low acceleration, smoothed look | gravity 24, 90 % speed in 0.12 s, stop in 0.43 m, zero look smoothing |
| Ice-skating | Quake friction at walking speeds | friction 8, stop speed 2.0 |
| Weak gun | thin sound, no reaction on target, late feedback | six audio layers, flinch on every hit, everything at t = 0 |
| Bullet sponges | difficulty by hit points | shots-to-kill fixed; difficulty by tokens and telegraphs; non-boss <= 6 shots |
| "Did I hit it?" | no marker, armour indistinct from flesh | 90 ms marker, distinct deflect feedback, reserved weak-point colour |
| Unfair damage | hitscan enemies, off-screen attacks, no tells | visible 18 m/s projectiles, half-rate off-screen attacks, audio on every tell |
| Chaos soup | everyone attacks at once | 2 concurrent attack tokens, >= 0.3 s between attack starts |
| Dumb AI | enemies die before acting, silent decisions | lifespan through approach and cover, barks, last-known-position |
| Unclear objective | no landmark, even lighting | landmark from minute 0, brightest thing is the way, one objective line in pause |
| Dead air | long walks, backtracking, slow doors | new stimulus every 90 s, sprint, loops that open shortcuts, backtrack <= 20 s |
| Puzzle stall | hidden element, no feedback, no hints | one-room rule, progress lamps, hints at 60/120/210 s |
| Soft lock | out of ammo, saved at 3 HP | ammo floor at <= 6, checkpoint floors 60 HP / 18 rounds |
| Tutorial fatigue | pop-ups and text walls | skill gates, safe vignettes, <= 5 lazy prompts |
| Retry rage | long reload, replayed cutscene, distant checkpoint | <= 3 s to control, <= 90 s lost, phase checkpoints |
| Difficulty spike | boss tests untaught skills | boss uses only verbs taught in beats 2–9; silent mercy after 2 deaths |
| Nausea | narrow FOV, camera bob, translational shake | 94 deg default, weapon carries the bob, rotational shake only, sliders |
| First-shot hitch | shaders compile on first use | pre-warm all combat effects and enemy materials during load |
| Mushy aim | OS acceleration, tick-bound look | raw pointer input, per-frame look, 0.07 deg/count default |
| Limp ending | demo just stops | designed kill sequence, silence, final image, stats card |

---

## 9. Feel spec — recommended starting values

Single table for implementers. Units: metres, seconds, degrees. All are starting points.

### Movement and camera

| Key | Value |
|---|---|
| run speed / sprint speed | 5.0 / 6.75 m/s |
| backward / strafe multiplier | 0.9 / 1.0 |
| ground accelerate / friction / stop speed | 12 / 8 / 2.0 m/s |
| air acceleration | 12 m/s^2, no air friction, speed capped at take-off speed |
| gravity / jump velocity / apex | 24 m/s^2 / 6.93 m/s / 1.0 m |
| coyote time / jump buffer | 0.10 s / 0.10 s |
| step-up / max slope | 0.35 m / 45 deg |
| eye height / capsule | 1.65 m / r 0.35, h 1.8 (from CLAUDE.md) |
| FOV (vertical) default / range | 62 / 50–80 deg |
| viewmodel FOV | 52 deg vertical, fixed |
| sprint FOV kick | +4 deg in 0.2 s |
| head bob vertical / lateral | 0.028 / 0.014 m |
| footfall distance run / sprint | 1.9 / 2.3 m |
| strafe roll | 1.0 deg |
| step smoothing rate | 18 /s |
| landing dip | 0.012 m per m/s, max 0.12 m, 0.22 s recovery |
| mouse sensitivity | 0.07 deg/count, slider x0.2–x4, no smoothing |
| simulation tick | 60 Hz fixed, interpolated render, per-frame look |

### Revolver

| Key | Value |
|---|---|
| type | hitscan, 200 m, no falloff |
| cadence | 0.48 s |
| fire input buffer | 0.15 s |
| cylinder | 6 |
| damage body / head and weak point / armour | 100 / x2 / x0.25 |
| enemy health | Rusher 100, Marksman 200, Brute 600 |
| spread rested / bloom per shot / bloom decay | 0 / 1.5 deg / 0.35 s |
| fan interval / cone / kick | 0.17 s / 5 deg / x1.6 |
| reload open / per round / close / fast-close | 0.35 / 0.30 / 0.30 / 0.20 s (2.45 s full) |
| camera kick | +2.5 deg pitch, +/-0.4 deg yaw, peak at 55 ms, recovered by 320 ms |
| viewmodel kick | 0.08 m back, 20 deg rise, recover 0.3 s |
| FOV punch | +1.2 deg for 80 ms |
| fire trauma / decay / max angles | 0.25 / 1.8 per s / 1.2 pitch-yaw, 1.5 roll |
| muzzle flash sprite / light | 33–50 ms / 60–80 ms, radius 6–8 m |
| hit marker / weak point / kill | 90 / 120 / 160 ms |
| target freeze hit / kill | 50 / 70 ms |
| encounter-end slow-motion | x0.3 for 0.3 s real time |
| decal pool / lifetime | 48 / >= 20 s |
| music duck on fire | -5 dB for 200 ms |
| start ammo / reserve cap / pickup sizes | 6 + 24 / 36 / 6 and 12 |
| ammo floor | cylinder + reserve <= 6 forces a drop of 6 |

### Player survivability

| Key | Value |
|---|---|
| health / segments / regen delay | 100 / 3 / 4 s (current segment only) |
| max single hit | 40 |
| last-hit grace | fatal hit from > 25 HP leaves 1 HP + 0.75 s immunity |
| checkpoint floors | 60 HP, 18 reserve rounds |
| death to control | <= 3 s |
| difficulty damage taken | x0.6 / x1.0 / x1.4 |

### Enemies

| Key | Rusher | Marksman | Brute |
|---|---|---|---|
| shots to kill | 1 | 2 (1 head) | 6 (3 weak point) |
| move speed | 5.8 | 3.5 | 2.5 (charge 9) |
| damage | 18 | 22 | 38 slam / 35 charge |
| telegraph | 0.5 s | 0.9 s | 1.0 s / 0.8 s |
| recovery | 0.6 s | 1.2 s | 1.5 s / 2.0 s stunned |
| range band | 0–2 m | 12–25 m | 0–6 m |
| projectile | — | 18 m/s, r 0.15 m | — |
| threat points | 1 | 2 | 4 |

| Key | Value |
|---|---|
| concurrent attack tokens (global) | Easy 1, Normal 2, Hard 3; sub-caps 2 melee / 1 ranged / 1 heavy |
| token cooldown / min gap between attack starts | 0.6 s / 0.3 s |
| alive budget (threat points) | 3 first fight, 5–6 mid, 8 finale; hard cap 8 bodies |
| spawn distance / emergence time | >= 12 m / 0.8–1.5 s |
| AI think rate / LOS rays per frame | 10 Hz staggered / <= 4 |
| off-screen attack rate | x0.5 |
| arena size / cover spacing / lane width | 18–28 m / 5–8 m / >= 3 m |

### Stage, puzzles, boss

| Key | Value |
|---|---|
| total length | 18–24 min median, 11 beats |
| time to first shot / first kill | <= 2.5 / <= 4.5 min |
| fight length / max continuous combat | 45–120 s / 2.5 min |
| relax after a peak | >= 30–45 s |
| new stimulus interval | <= 90 s |
| max lost progress on death | 90 s |
| puzzle median / hard limit | 60–180 s / 4 min |
| hint tiers | 60 / 120 / 210 s of no progress |
| boss phases / length / hits per phase | 3 / 3–5 min / 8–10 weak-point hits |
| boss pattern / vulnerability window | 4–6 s / 3–4 s |
| boss telegraphs | 1.0–1.5 s signature, 0.6–0.8 s quick |

### Checks a critic can run through the deterministic step hook

- Hold forward from rest: >= 4.5 m/s within 0.13 s; release: stopped within 0.45 m.
- Jump: apex 1.0 m +/- 0.03; air time 0.58 s +/- 0.02; jump accepted 0.10 s after leaving a ledge.
- Fire: round removed, flash visible, sound scheduled and hit resolved in the same tick as
  the input; next shot refused before 0.48 s and accepted at 0.48 s; aim returns to within
  0.05 deg of the pre-shot direction by 0.33 s.
- Reload from empty completes in 2.45 s +/- 0.05; fire during reload produces a shot within 0.50 s.
- Never more than 2 enemies in an attack state (wind-up through strike) in the same tick
  on Normal, and no two attack wind-ups starting within 0.3 s of each other.
- With cylinder + reserve forced to 0 next to a shoot puzzle, ammo is obtainable within 10 m.
- Idle in each puzzle zone: hint tiers fire at 60 / 120 / 210 s and not during combat.

---

## 10. Open decisions for the GDD

1. Fan-the-hammer in or out (one clip + one sound; recommended in, first cut if squeezed).
2. Finite ammo with floor (recommended) versus infinite reserve with reload as the only cost.
3. Segmented regenerating health (recommended) versus pickups only.
4. Beat 9 (gauntlet) is the designated scope valve: cut it before weakening the boss.
5. Whether jump is required anywhere. Recommended: available, never required beyond 0.6 m / 2.0 m.
6. Boss health bar visible (recommended) versus fully diegetic damage states.

---

## Sources

Talks and primary material:

- Butcher and Griesemer, "The Illusion of Intelligence: The Integration of AI and Level
  Design in Halo", GDC 2002 (playtest percentages, firing points, 30 s / 3 min scope) —
  https://www.jmeiners.com/shamans/papers/ai/the_illusion_of_intelligence.pdf
- Griesemer interview on "30 seconds of fun" —
  https://www.engadget.com/2011-07-14-half-minute-halo-an-interview-with-jaime-griesemer.html
- Booth, "The AI Systems of Left 4 Dead" (build up / sustain peak 3–5 s / relax 30–45 s) —
  https://cdn.fastly.steamstatic.com/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf
- Booth, "Replayable Cooperative Game Design: Left 4 Dead", GDC 2009 (dramatic anticipation,
  audio announcing threats) —
  https://cdn.fastly.steamstatic.com/apps/valve/2009/GDC2009_ReplayableCooperativeGameDesign_Left4Dead.pdf
- Speyrer and Jacobson, "Valve's Design Process for Creating Half-Life 2", GDC 2006 —
  https://cdn.fastly.steamstatic.com/apps/valve/2006/GDC2006_HL2DesignProcess.pdf
- "Cyber Demons: The AI of DOOM (2016)" (attack tokens, exposed firing positions, accuracy
  versus player speed, falter and stagger) —
  https://www.gamedeveloper.com/design/cyber-demons-the-ai-of-doom-2016-
- Loudy and Campbell, "Embracing Push Forward Combat in DOOM", GDC 2018 —
  https://gdcvault.com/play/1024940/Embracing-Push-Forward-Combat-in
- Orkin, "Three States and a Plan: The AI of F.E.A.R.", GDC 2006 —
  https://gdcvault.com/play/1013282/Three-States-and-a-Plan
- Eiserloh, "Math for Game Programmers: Juicing Your Cameras With Math", GDC 2016 (trauma
  model; rotational shake only in 3D) —
  https://www.gamedeveloper.com/programming/video-sprucing-up-cameras-with-math
- Nijman (Vlambeer), "The Art of Screenshake", 2013 (permanence, hit pause, kick, impact).
- Stout, "Boss Battle Design and Structure" —
  https://www.gamedeveloper.com/design/boss-battle-design-and-structure
- Helsby, "The Art of First Person Animation for Destiny", GDC 2015 —
  https://gdcvault.com/play/1022297/The-Art-of-First-Person
- Swink, *Game Feel* (2008): response-time thresholds. Cited from memory.

Reference values:

- Valve Developer Wiki, player dimensions and speeds for Half-Life 2 —
  https://developer.valvesoftware.com/wiki/Dimensions_(Half-Life_2_and_Counter-Strike:_Source)
- Quake physics and view variables (sv_maxspeed, sv_accelerate, sv_friction, sv_stopspeed) —
  https://quake.speeddemosarchive.com/quake/qdq/articles/ZigZag/sv_maxspeed.htm
- Hunt: Showdown weapon statistics — https://huntshowdown.wiki.gg/wiki/Weapons/Conversion
- Overwatch Cassidy statistics — https://overwatch.fandom.com/wiki/Cassidy
- Half-Life 2 .357 — https://combineoverwiki.net/wiki/Magnum
- Coyote time and jump buffering ranges —
  https://bugnet.io/blog/coyote-time-and-input-buffering-explained
- Hidden assists (BioShock first shot, DOOM last health, Half-Life two attackers) —
  https://www.gamerevolution.com/originals/347027-firewatch-bioshock-devs-share-hidden-mechanics-never-noticed-games
- Half-Life 2 "invisible tutorial" analysis — https://wnhub.io/news/other/item-11774
- God of War Ragnarok hint timing — 
  https://stevivor.com/news/god-of-war-ragnarok-will-ease-off-on-puzzle-hints-if-you-want-it-to
- Demo length data and advice — https://www.steampageanalyzer.com/blog/how-long-should-a-steam-demo-be
  and https://gmtk.substack.com/p/how-to-make-a-great-steam-next-fest

Accessibility:

- Game Accessibility Guidelines, basic tier — https://gameaccessibilityguidelines.com/basic/
- WCAG 2.2, Understanding 2.3.1 Three Flashes or Below Threshold —
  https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html
- Motion sickness triggers in games — https://madelinemiller.dev/blog/motion-sickness-accessibility/

Caveats on evidence: values tagged "from memory" were not re-verified online in this pass
(Quake gravity, jump velocity, step and view variables; Source default cvars and slope
limit; Overwatch cadence and reload; HL2 .357 cadence; Destiny rates of fire; Xbox text
sizes; Swink's thresholds; the Vlambeer and Eiserloh talks were confirmed only through
summaries, not watched). The Valve wiki and two game wikis refused automated fetches, so
their figures come from search-result excerpts. The body-height conversions of Quake and
Half-Life 2 speeds are this document's own normalisation, not an official scale. The
demo-length and conversion claims come from marketing blogs. Verified first-hand from the
original slides: the Halo playtest percentages and the Left 4 Dead pacing timings. All [R]
values are untested in this game and are meant to be tuned against playthroughs.
