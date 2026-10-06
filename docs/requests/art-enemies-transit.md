# Requests from art-enemies-transit

## 1. To foundation-core (sandbox/viewer, `createFallbackResolver`): draw the emissive cells of `m_prop`

The fallback material shows `m_prop` as `tx_palette` x `COLOR_0` only. A face mapped to an emissive cell (`violet`,
`violet_core`, `flame`, `flame_core`: ART_BIBLE 4.5, "emissive is a face mapped to an emissive cell") therefore shows its
unlit albedo: the Transit's lens core is husk grey and the hot stake tips are ash black in every `<id>_game.png`, in the
Workbench sheet and in the Cycles sheet (`blender/lib/material.py` builds no emission for `m_prop` either). The order's
"lens core >= 60 L* brighter than its bezel" cannot be shown with the stock viewer (husk on steel_dark is 40 L*).

Asked: in the fallback, add `tx_palette_emis` (same UV0) to `m_prop`'s output; in `blender/tools/preview.py` /
`lib/material.py`, add the emissive cell colour for `m_prop` faces.

Local workaround (no core file touched): `tests/art_enemies/transit_lib.mjs` `glow(game, scale)` clones the viewed
asset's `m_prop` material in the page and adds `texture2D(tx_palette_emis, vMapUv) * scale` before `opaque_fragment`.
All `transit_*.png` evidence and the greyscale weak-point test use it; `enemy_transit_game.png`, `_sheet.png` and
`_cycles.png` (the stock tools) show the glow OFF.

## 2. To code-enemies (and design, GDD 7.2): play `walk` at the ground speed it was authored for

**Asked.** `walk` (0.9 s, loop) holds **two** three-beat cycles (six foot strikes). Each planted foot travels
**0.84 m** back under the body in its stance of 0.30 s, so the clip is authored for a ground speed of
**2.8 m/s** (`WALK_SPEED` in `blender/enemies/enemy_transit.py`; measured on the bones in
`tests/art_enemies/transit_viewer.test.mjs`: 2.80 m/s for all three feet). At the GDD's relocate speed of 3.5 m/s the
feet slide 20 % (0.21 m per step); before this fix it was 0.34 m of stride against 2.1 m of travel.

Either (preferred) scale the walk action's playback with the actual ground speed:
`walkAction.timeScale = speed / 2.8` (so 1.25 at 3.5 m/s; the clip then lasts 0.72 s), or lower the relocate speed to
2.8 m/s. Strikes (for the three-beat clack of GDD 7.2 "Audio"), as fractions of the clip: leg b 0.167 and 0.667,
leg c 0.333 and 0.833, leg a 0.5 and 1.0 (= 0). The walk is crouched: the hub is 0.14 m lower than at rest (the legs
need the reach), so cross-fade into and out of `walk` over at least 0.15 s.

**Still open after the fix round (integrator: please confirm with code-enemies).** If code will not scale playback, say
so and the stride is re-authored for 3.5 m/s.

**Also asked (fix round): cross-fade 2 to 3 frames (0.07 to 0.1 s) into `flinch` and `die_fold`.** `die_fold` now
STARTS ON THE AIM POSE (`aim_hold` frame 0: planted stance, hub 2 cm low, drum dipped 12 degrees; tested within 2 mm),
because the canonical kill is the lens shot while it holds still; killed from `walk`, `idle_scan` or `cooldown` at rest
it needs the short blend. `flinch` starts and ends on the REST pose on purpose: GDD 7.2 restarts from `plant` after a
flinch, and `plant` starts on the rest pose; entering it from `aim_hold` is a 12 degree, 2 cm difference under a
24 degree snap, which a 2-frame blend hides.

`emerge` strikes (for the clacks), as frames of 36: leg b 15, leg c 20, leg a 25; the hub rises on 25 to 31. While a
leg unfolds its foot swings out to 1.35 m from the centre at about 0.9 m height: give the door it steps out of that room,
or start the clip once it is clear of the frame.

## 3. To the art bible / order (a contradiction in the Transit's numbers; no action needed unless the look is refused)

"1.9 m tall", "stance 1.1 m", "a 0.25 m vane on top of a 0.45 m drum", "upper leg 0.95 m, lower 0.85 m" and "a stake
magazine under the drum" cannot all hold: with the hub low enough for the drum, the rack and the vane to end near 1.9 m,
legs of 0.95 + 0.85 m put the knees 0.7 m out from the centre, wider than the feet. Built: drum top 1.80 m; the vane
is a 0.25 m forked blade (0.12 m wide at the top) hinged on the drum's back face and standing **0.14 m clear above the
drum, to 1.94 m** (it breaks the round outline from front and back); feet on a 0.55 m circle (1.1 m across); leg
parts 0.84 m and 0.82 m (hip to knee 0.596, knee to foot 0.712 between pivots). The legs stand at 180 (rear), 60 and
300 degrees, not with one in front as the placeholder had: nothing crosses the eye and the rack can dip.
The folded bundle at the start of `emerge` is **1.11 m** tall (order: 1.1 m).

**House trio (ART_BIBLE 12 item 18).** It carries the cast plate (`brand.maker_plate` geometry, two raised bars for the
wordmark's lines), **the asset number `4-111` cast beneath them as geometry** (fix round: `brand.numeral_mesh`, 36 mm
tall, no stencil bridges because it is cast; paid for with two sides of the eyepiece, one of the plumb bob and rod, and
the third blank bar: 2 000 / 2 000 triangles), the stencilled Pellam mark on the drum's left side, and the `livery`
band. Two deviations remain, exemption asked: (a) the band is on the drum at about 1.63 m, not at 1.2 m (the Transit
has no body at 1.2 m; the critic accepted this); (b) there is **no pictogram** and the wordmark is bars, not letters:
lettering is `m_mask` (a second material and draw call; the manifest allows one, `m_prop`) and there is no triangle left.

## 4. To code-enemies / code-render (facts, no change asked)

- `head` is at the ball joint under the drum (asset space (0, 1.25, 0)), not at the drum's centre as in the placeholder;
  `lens` is at (0, 1.575, 0.17), `stake_muzzle` at (0, 1.305, 0.42), both children of `head`.
- `fire` cannot show "a rod leaves the rack": the manifest gives the Transit 8 bones and none for a rod. The three
  racked rods are static (their hot tips are `flame` / `flame_core` emissive cells); the leaving stake is `proj_stake`
  spawned at `stake_muzzle`. The recoil is 6 cm at the lens in two frames (0.058 m measured).
- The per-instance emissive scale that darkens the lens when it dies also darkens the racked rods' tips.
- `die_fold` ends with the drum come off its seat and lying overturned on its eye and the tips of its rods in front of
  the hub, which is propped on its plumb bob. The body then reaches **1.41 m forward of the origin** (game +Z), 1.38 m
  to its left and 0.73 m to its right, and nothing is below the ground by more than the rest pose's 5 cm foot spikes.
  Keep a corpse's footprint (and anything that culls or collides it) at least that large.

## Art integrator, polish round 2 (2026-10-04): what was decided on the rows above

| Row | Decision |
|---|---|
| 3: the Transit's numbers and the house trio exemptions (band at 1.63 m, no pictogram, bars for the wordmark) | **ACCEPTED** as built |
| 1, 2: emissive cells in the viewer, walk playback rate | code-side (`foundation-core` viewer, `code-enemies`) |

## Code integrator, polish round 2 (2026-10-04): what was decided on the code-side rows

| Row | Decision |
|---|---|
| 2, play `walk` at the ground speed it was authored for | **APPLIED**: `TRANSIT_WALK_RATE` = 3.5 / 2.8 on every `walk` of `transit.ts`; the relocate speed stays 3.5 m/s |
| 2, cross-fade 0.07 to 0.1 s into `flinch` and `die_fold` | stands as built in `transit.ts` (its fades were not re-measured in this pass) |
| 1, emissive cells in the viewer | **NOT APPLIED** (see `art-enemies-bider.md`) |

