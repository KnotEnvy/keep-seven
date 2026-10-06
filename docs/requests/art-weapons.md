# Requests and notes: art-weapons (weapon_revolver, the ammunition family, tx_gun, tx_matcap_steel)

Nothing below blocks the build. Sections 1 and 2 are what `code-player` and `code-render` must know about the files as
built; sections 3 to 5 are requests.

## 1. To `code-player`: what the fifteen clips assume (names and durations are the manifest's)

- **The rest pose is `idle` at t = 0**: hammer at full cock, gate shut, cylinder at 0, the left hand under the frame.
  Every clip but `sprint`, `dry_fire`, `fire_kept`, `reload_open` and `reload_round` ends on that pose (measured: 0.000 mm,
  <= 0.011 degrees on every bone), and every clip but `reload_round` / `reload_close` / `reload_fast_close` starts on it
  (apart from the mechanism in `fire` / `fire_kept`, below). `reload_open` -> `reload_round` x n -> `reload_close` |
  `reload_fast_close` chain exactly (first pose = last pose, tested).
- **Cylinder and chambers.** `fire` starts with the `cylinder` bone at -60 degrees and turns it to 0 between frames 4 and
  9 (half cock on frames 6-7, full cock on 9); `reload_round` turns it +60 between frames 5 and 7 and snaps back to 0 on
  its last frame; `load_line`, `unload_line`, `load_kept`, `unload_kept` turn it +60 (the chamber under the hammer comes
  to the gate) and back. By six-fold symmetry none of the jumps is visible, but the picture "which chamber is where"
  shifts by one per shot and per seated round: at rest `round_1` is under the hammer and `round_2` at the loading gate,
  numbered clockwise seen from behind. Scale `round_n` with that in mind (after a shot the fired case is the one that
  has just left the hammer: `round_6`'s place in the picture, and so on round the ring).
- **`dry_fire` and `fire_kept` end with the hammer DOWN** (the order: "the hammer stays down"). Going back to `idle`
  from them pops the hammer to full cock in one frame unless the next clip is cross-faded (0.05 s is enough) or is
  `reload_open` (which thumbs it to half cock on its first three frames anyway).
- **`round_hand_*` are keyed (scale 0 / 1) on every frame of every clip**; never drive them. In `load_kept` and
  `take_round` the bones `round_hand_lead` and `round_hand_line` carry **the two halves of the kept round's band** (no
  bone could be added: each half is skinned 0.75 m behind that bone's cartridge, so whichever of the two is shown, the
  other is behind the camera; the build checks every frame of every clip for a hidden piece inside the frustum:
  `HIDDEN CHECK 0 problems` in `blender/export/.logs/weapon_revolver.log`). Nothing for code to do, but do not blend
  `load_kept` or `take_round` with a reload clip: the lead round and a band half would swap places mid-blend.
- **`kept_loop` (code-driven: scale 0 hides the round in the cuff loop; the leather strap stays).**
  - `load_kept`: hide `kept_loop` **at 0.9 s** (authored frame 27). On that frame the clip shows `round_hand_kept`
    exactly where the loop held the round, then slides it out into the fingers (frames 27-30); it is held still in the
    light on frames 30-36 and seated at the gate on frame 45 (the clip hides it on frame 47).
  - `take_round`: show `kept_loop` **at 0.83 s** (authored frame 25): the clip hides `round_hand_kept` on that frame,
    under the right thumb that presses it home. (Before it the loop must be empty: scale 0.)
  - `unload_kept`: show `kept_loop` again when the clip ends (the round goes down out of frame with the left hand).
  - The mesh in the loop always wears its band (one mesh, no variant): after `unload_kept` the band is whole again on
    the cuff although the story says it is broken. See request 4.
- **Sockets** (asset space = camera space, idle): `muzzle` (0.075, -0.070, -0.560), its own -Z along the bore, on `gun`;
  `eject` (0.13, -0.085, -0.305) on `gun`; `cam_look` (0, 0, -12) on `root`. The bore passes 0.00 mm from `cam_look`.
- **Animation channels were slimmed** (`weapon_revolver.py` `slim_clips`): a clip has a track only for what it moves
  (8 channels in `idle`, 26 in `load_kept`), relying on three.js restoring an unanimated property to the bind pose when
  no running action drives it. If the player's mixer keeps a finished action clamped (`clampWhenFinished`) while it
  starts the next, bones the next clip does not animate keep the clamped pose until the old action is stopped: stop
  the previous action (or cross-fade to weight 0) rather than leaving it paused at its end.

## 2. To `code-render`: `m_gun` and the two textures

- `tx_gun` alpha is the gloss mask (blue 0.75, worn edges 0.9, walnut 0.35, brass 0.6; cavities: bore 0.0, chamber
  mouths and slots 0.25-0.45). `tx_matcap_steel` is looked up by the view-space normal (`uv = n.xy * 0.49 + 0.5`),
  multiplied by gloss and the zone key colour, and ADDED. The matcap body is nearly black on purpose: all the light is in
  one tight warm highlight (upper left, at 0.78 of the radius) and a thin cool rim (lower right). The look was judged
  with exactly that formula as a Cycles emission material (`blender/weapons/fp_preview.py` `gun_material`).
- `gun_mesh` COLOR_0 is AO x a height ramp only (white tint; the albedo is all in `tx_gun`); `arms_mesh` COLOR_0 is a
  multiplier over `tx_palette` cells (`m_prop`, as every prop).
- The line round's shoulder ring and the violet hairline of `prop_cartridge_kept/round_violet` use `tx_palette_emis`
  cells (`aqua`, `violet`) on UV0, as `m_prop` does for every emissive palette cell.

## 3. To the producer / `docs/ART_BIBLE.md` 8.3: the view-model is 4 % of the frame, not "a quarter of the screen"

The placement the art bible and the order fix (muzzle at (0.075, -0.070, -0.56), grip centre at (0.135, -0.165, -0.30),
bore on the crosshair at 12 m, a 0.345 m gun, 52 degrees) puts the grip centre **below the bottom edge of a 16:9 frame**
(it projects to -6 % up): what is in frame at idle is the barrel, the cylinder, the top strap, the cocked hammer and the
top of the hand. Measured through the viewer: **coverage 4.1 % at 16:9** (5.5 % at 4:3, 3.2 % at 21:9); the placeholder's
14 % came from its 0.3 x 0.3 x 0.6 m box. The file meets every number of the order (muzzle 57.7 % / 37.2 %, <= 18 %,
nothing left of centre), but the gun reads smaller than the mission text asks. If a larger presence is wanted, it is a
placement change, not an art change: e.g. the whole view-model 0.10 m nearer the eye and 0.03 m higher roughly doubles
its coverage; `code-render` / `code-player` can do that on the view-model group without touching the file (the clips
are relative to the rest pose). The muzzle test of `tests/art_weapons/framing.test.mjs` would then need the new numbers.

## 4. To `foundation-pipeline` / the manifest owner: one more code-driven bone would fix two compromises

`design/assets.json` fixes 31 bones. Two things had to be worked round:
- the band halves ride `round_hand_lead` / `round_hand_line` (section 1): two bones `band_a`, `band_b` would be cleaner;
- the round in the cuff loop cannot lose its band: a variant bone `kept_loop_bare` (the same round without the band,
  shown by code after `load_kept` / `unload_kept`) would let the HUD's `band_broken` state be true on the cuff too.
Neither is needed for the demo's path (the kept round is fired, never unloaded, in the scripted ending).

## 5. To `foundation-pipeline`: notes on the tools as found

- `tools/preview-asset.mjs <id> --clip <name>` renders orbit views in Workbench (the gun shows white: no `tx_gun`), which
  says nothing about a first-person clip. The evidence strips of this piece are made by
  `blender/weapons/render_strips.sh` (`fp_preview.py`: the 52-degree camera at the origin, the `m_gun` formula, the
  code-driven loop shown and hidden on the frames above) and are written under the same names
  `shots/art-weapons/weapon_revolver__<clip>.png`: **do not run `preview-asset weapon_revolver --clip all` afterwards**,
  it overwrites them.
- Blender's glTF importer turns seconds into frames with the scene's frame rate, 24 after `read_factory_settings`: a
  preview script that steps an imported clip by frame number must set `scene.render.fps = 30` BEFORE importing
  (`fp_preview.py` does; found by a strip whose "frame 27" showed frame 34).
- `__dbg.ext.viewer.pose(name).scale` is the WORLD scale and reads (1, 1, 1) for a bone whose local scale is 0 (a
  zero matrix does not decompose); `pose(name).local.scale` is right. The tests of this piece use `local.scale`.
- `manifest.clip_frames` rounds 0.15 s x 30 = 4.5 to 4 frames (Python rounds half to even): `dry_fire` is authored 4
  frames (0.133 s) and time-scaled to 0.15 s by the runtime. Within the order's "one frame".

## 6. Fix round (after the first critic): what changed for other owners

- **Nothing in the contract moved**: 31 bones, node and clip names, durations, sockets and the frames on which code hides /
  shows `kept_loop` (0.9 s in `load_kept`, 0.83 s in `take_round`, the end of `unload_kept`) are as in section 1.
- `arms_mesh` is now right side out on the left arm (it shipped inside-out; `tests/art_weapons/geometry.test.mjs` holds it).
  Both materials stay single-sided: do not switch the view-model to `DoubleSide` to hide a hole.
- `load_line`, `unload_line` and `unload_kept` roll the gun only part of the way to the loading pose (0.8 / 0.6 / 0.6) and
  ease in and out; `fire` keeps the thumb down through the kick and shifts the hand 7 mm up the grip while it cocks.
- **To `foundation-pipeline` (tools/optimize-assets.mjs, `resample()`)**: gltf-transform's resample pass does not keep a
  slow, smooth curve that is keyed on every frame: each frame is within tolerance of the line through its neighbours, so
  it removes them one after another and the error accumulates. Measured on `idle`: a 0.4-degree roll came out as a
  constant (2 keys), a 3 mm sine as 4 keys with its peak 7 frames late and 2.6 mm tall. Any asset with a slow breath or
  sway (idle clips of the creatures, lamp sway) is exposed. Worked round here by thinning `idle` to every ninth key in
  the raw export (`weapon_revolver.py` `slim_clips(thin=...)`), which resample then keeps; a fix in the tool would be
  `resample({ tolerance: 1e-5 })` or skipping clips marked as loops.
- **Still open, not mine to decide**: request 3 (the view-model covers 4.3 % of a 16:9 frame; the placement numbers of
  ART_BIBLE 8.3 put the grip below the frame edge) and request 4 (a bare `kept_loop` variant bone, band bones).
  `dry_fire` and `fire_kept` still end hammer-down by the order's text: cross-fade 0.05 s back to `idle`.
- The `ejector` bone is not animated by any clip (she tips the muzzle up and the round drops into her palm through the
  gate); it is there for code or a later clip.
- `prop_cartridge_lead` / `prop_cartridge_kept` raw exports changed shape slightly (round noses; the kept band is now a
  0.5 mm sleeve, radius 6.5 mm, hairline 6.75 mm): zones that embed them rebuild on the next zone build.

## Art integrator, polish round 2 (2026-10-04): what was decided on the rows above

| Row | Decision |
|---|---|
| 3: the view-model covers 4 % of the frame | for the code integrator (`code-render` / `code-player` place the view-model group); no art change. In the game frames of `shots/integrate-art/game_low/` the gun and hand read at about a tenth of the frame |
| 4: extra bones | **DECLINED** this round (the manifest's 31 bones stand) |

## Code integrator, polish round 2 (2026-10-04): what was decided on the code-side rows

| Row | Decision |
|---|---|
| 1, what the fifteen clips assume | stands as `code-player` re-checked it (its section 4) |
| 2, `m_gun` and the two textures | **CHANGED** in `src/render/materials.ts`: the High tier's fresnel rim is narrow now (rim^5 x 0.10); it washed the whole revolver pale teal out of doors |
| 3, the view-model covers 4 % of the frame | **ACCEPTED as built** this round (see `code-player.md` row 4); known gap for the visuals critic |


## 7. Polish round 2 fix (2026-10-04): the view-model was re-placed and the loading clips re-framed IN THE FILE

Two majors from the visual and combat critics (weak presence; reload_round "broken"). What changed, for other owners:

- **Idle placement departs from ART_BIBLE 8.3 / work order 4.1** (request 3 above, now done in the asset because the
  critics filed it against the art). Was: muzzle (0.075, -0.070, -0.56), bore on the crosshair at 12 m, cant 30, 58 % /
  37 %, coverage 4 %. Now: **muzzle (0.052, -0.034, -0.52), bore 12 degrees inboard and 4 degrees up of the view axis,
  cant 12; muzzle at 55.8 % across / 43.3 % up, coverage 7.9 % at 16:9** (8.8 % at 4:3), nothing left of the centre
  line. `cam_look` is still (0, 0, -12) on `root`, but **the bore no longer passes through it**: hits are resolved from
  the eye, the `muzzle` socket is where the flash and the tracer start (its -Z is the bore, which now points 12 degrees
  left of the aim). `eject` moved with the gun. ART_BIBLE 8.3 and the order's 4.1 "Frame" paragraph should be updated
  by their owner; `tests/art_weapons/framing.test.mjs` holds the new numbers.
- **Loading clips** (`reload_open / _round / _close / _fast_close`, `load_line`, `unload_line`, `unload_kept`): the gun
  goes to the upper right (rolled 62, muzzle up 32), the left hand rises from BELOW inside the right half. Measured on
  every frame, viewer and game: coverage <= 14.9 % (was 34 %), left edge >= 0.549 of the width. `load_kept` and
  `take_round`: 19.5 %, left edge 0.546. Bone names, clip names, durations, the seat frame (5), the cylinder turns and
  the `kept_loop` hand-off frames (27 in `load_kept`, 25 in `take_round`) are unchanged.
- **The cartridge with the pale band on the cuff is the kept round in its loop** (work order: in frame in every reload),
  not the lead round being loaded; the lead round (plain brass and grey lead, no band) is the one between thumb and
  forefinger at the gate. The loop moved round the cuff (LOOP_ANGLE 235) so it faces the eye with the forearm upright.
- **Gloves** are no longer the palette's `glove` tan: they use the `tin` cell shaded to #5A5048 / #6E6459 (OKLCH chroma
  0.02). ART_BIBLE 8.2 says "pale tan"; the visual critic's ruling (chroma <= 0.05) was followed.
- The left thumb is shorter and stouter (the "stretched finger"); the left hand rests palm-up under the frame, right of centre.
- `shots/art-weapons/game_*.png` (round 1) are stale; the game frames of this pass are in `shots/r2-fix-art-weapons/`.

## Closer, polish round 2 (2026-10-04): what was decided on section 7

| Row | Decision |
|---|---|
| the idle placement against ART_BIBLE 8.3 / order 4.1 | **ACCEPTED and the documents edited**: 8.3 now holds the built placement (bore 12 degrees inboard; hits are from the eye); the order's "Frame" paragraph points to it. `src/player/system.ts` starts the flash at the `muzzle` socket's position only, so nothing follows the socket's axis |
| gloves against 8.2 | **ACCEPTED**, 8.2 edited (greyed leather, chroma <= 0.05) |
| `load_kept` / `take_round` at 19.5 % | **ACCEPTED** for those two clips (written into 8.3); every other clip keeps 18 % |
| the kept loop out of frame in most reload frames; the HUD ring over the sleeve | open, listed in the integration report |


## 8. Polish round 3 fix (2026-10-05): the loading clips were re-staged again, the left hand has a new pinch (ruling R6)

Two majors (visual, combat): the reload and the kept-round load hid the gun behind the left hand and sleeve; the round
was never seen going in. Cause: the round was pinched ACROSS the fingers, so the hand had to sit beside the gate, between
the eye and the cylinder. What changed in the file, for the closer and the other owners:

- **New left-hand pinch** (`revolver_rig.py` `LEFT_CURLS`, `LEFT_THUMB`, `ROUND_HEAD_H`, `ROUND_AXIS_H`): the round lies
  ALONG the two straight fingertips, nose beyond them. `round_hand_lead / _line / _kept` moved with it (same bone names).
- **Reload pose** (`revolver_anim.py` `PORT_ROLL` 125, `SEAT_BACK` 28 mm; `reload_open / _round / _close / _fast_close`,
  `load_line`, `unload_line`, `unload_kept`): the gate side of the cylinder faces the eye, muzzle up and away, the left
  hand comes from below along the bore and never passes between the eye and the cylinder. Clip names, durations, the
  seat frame (5), the 60 degree click and the chain poses are unchanged. Measured (viewer, every frame, 16:9): coverage
  <= 14.9 %, left edge >= 0.509; `reload_round` 14.0 % / 0.536. In the game (Low and High, real reload input): max 15.6 %,
  left edge 0.524.
- **`load_kept` / `take_round`**: the left forearm stands upright beside the gun (no crossing), cuff loop to the eye; the
  thumb breaks the band; the round is drawn and HELD nose-up on frames 30 to 37 (87 px long at 720p in the viewer, drift
  9.8 mm), then seated at the gate. The `kept_loop` hand-off frames (27 and 25) are unchanged. **Departures to mirror
  into ART_BIBLE 8.3:** `load_kept` reaches 17.7 % coverage and **its left edge is 0.489 of the width** (11 thousandths
  past the centre line; input is locked during the clip); the framing test allows these two clips 20 % and 0.44. In the
  game the falling band pieces fly further left for a few ticks (left edge 0.346 at tick 105 of about 215).
- **Hands** (`hands.py`): finger roots start inside the palm (no notches between the knuckles), the left little finger
  is a 6-gon; arms 2 788 of 2 800 triangles, the whole asset 5 929 of 6 000. No more loops fit in the budget: if the
  hands must be rounder still, the arms' triangle budget (work order 4.1) has to rise.
- **Not in the asset** (requests):
  1. *code-player / GDD 6.9*: the critic asked for a readable reload of about 1.2 s with distinct beats. The durations
     (`reload_open` 0.35 s, `reload_round` 0.30 s, `reload_close` 0.30 s) are gameplay numbers; the clips keep them. A
     one-round top-up is 0.95 s on screen, three rounds 1.55 s. Lengthening them is a tuning decision.
  2. *code-player*: `load_kept` plays slowed by the game (about 215 ticks for the 1.8 s clip in the boss room), so the
     band-break pose is on screen about 1.5 s. The clip moves on every frame, but slowly; if the hold feels long, the
     slow-motion factor is the lever.
- `tests/art_weapons/clips.test.mjs` and `framing.test.mjs` changed: the "kept loop in every reload frame" test became
  "in frame while it is the subject"; new test: the round enters inside the frame in `reload_round`, and the held kept
  round is >= 40 px and still on frames 30 to 37. 24 pass.
- Evidence: `shots/r3-fix-art-weapons/` (`sheet_low_cp_street_clear_reload_all.png`, `crop_reload_high_gallery.png`,
  `sheet_low_cp_boss_p2_kept_all.png`, `crop_kept_beats.png`); the fifteen strips in `shots/art-weapons/` were re-rendered.
- The revolver is not embedded in any zone; no zone rebuild is needed for it.

## Closer, polish round 3 (2026-10-05): decisions on the rows above

| Row | Decision |
|---|---|
| 8 departures (`load_kept` / `take_round` 20 % and 0.44) | Mirrored into ART_BIBLE 8.3 (in place) |
| 8 request 1 (longer reload clips), 2 (the slow-motion factor on `load_kept`) | **Ruled: not this round.** The clip durations are GDD 6.9 gameplay numbers and the playthrough is pinned to them; open for round 4 with the eject beat |
| arms budget 2 800 | Open: a lead decision (rounder hands need the budget raised) |

## Cross-cutting fixer, polish round 4 (2026-10-05)

| Row | Decision |
|---|---|
| 8 request 1 (longer reload clips, the eject beat), 2 (the slow-motion factor on `load_kept`) | **Ruled: allowed in round 4.** The clip durations may change if `node --test tests/e2e/` stays green and deterministic and GDD 6.9 carries the new numbers (`docs/requests/polish-r4-fixer.md`, art-weapons row 1) |

