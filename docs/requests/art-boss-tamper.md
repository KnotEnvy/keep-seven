# Requests and notes: art-boss-tamper (enemy_tamper, tamper_cold_static)

## 1. To `foundation-pipeline` (blender/lib/export.py, frozen): animation channels

`EXPORT_SETTINGS` keeps `export_optimize_animation_keep_anim_armature` at Blender's default (True): every clip then
carries a translation, rotation and scale track for every bone (36 channels per clip for the Tamper, 94 kB of JSON in
the shipped file, and a rest-pose track on both vent bones in all twelve clips, which is not what the manifest's vent
rule asks for). **Worked around locally**: `blender/boss/enemy_tamper.py` sets
`export.EXPORT_SETTINGS["export_optimize_animation_keep_anim_armature"] = False` before `export_asset`, and keys only
the channels that move. Result: 262 kB -> 171 kB, and no vent track outside `stagger`, `charge_stun`, `die`.
Request: make that the library default (or an `export_asset(..., keep_unkeyed=False)` argument). The other skinned
assets (`enemy_bider` ships at 379 kB) would gain the same way.
**Trap that comes with that switch (found in round 1's fix pass):** with it off, the exporter also drops any bone
channel whose sampled value is constant over the clip, **even when that constant is not the rest pose** (a pelvis held
pitched for a whole loop). The node then plays at rest and every child is wrong. `tamper_clips.keep_constant` nudges
the middle key of such a channel by 0.3 mm / 0.03 degrees so the track survives; a library version of the switch
should do the same or compare against rest instead of against the first key.

## 2. To `code-enemies`: what the file really contains

- **Vent convention (as built, tested through the real loader):** rest = shut; **+80 degrees about the bone's own local
  X axis = fully open**, for both `vent_chest` and `vent_back` (`setBone(name, { rot: [80, 0, 0] })`).
- `stagger`, `charge_stun` and `die` key the vent bones; the other nine clips have **no track at all** on them.
  - `charge_stun` itself flaps `vent_back` open and ends holding it at +80 degrees. **Set** the bone there (overwrite),
    do not add another 80 on top of the clip.
  - `stagger` only rattles the lids (up to 13 degrees, back to 0 by frame 19): made to be played under code's +80.
  - `die` bursts both lids to about 50 degrees in the first 0.1 s and lets them fall shut by 0.9 s: stop driving the
    lids when `die` starts.
- **Socket positions differ from the placeholder's** (work order section 3 asked for this to be stated). Asset space:
  `vent_chest_knot` (0, 1.503, 0.760) [placeholder (0, 1.70, 0.45)], `vent_back_knot` (0, 1.802, -0.310)
  [(0, 1.60, -0.45)], `ram_head` (-0.740, 0.358, 0.789) at rest [(-0.80, 0.45, 0.35)], `foot_spark`
  (-0.390, 0.020, 0.300) [(-0.38, 0.02, 0.22)]. Parents are unchanged (`barrel`, `barrel`, `arm_r_ram`, `leg_r_foot`).
  The chest knot is lower than the placeholder's because the hatch stands plumb on a barrel pitched 15 degrees.
- `slam` lands `ram_head` at (-0.74, 0.03, 1.60): 1.6 m ahead **and 0.74 m to the creature's right** (the arm's plane).
  The slam ring should be centred there, not on the centre line.
- `pound_bulkhead` reaches (-0.74, 1.51, 2.70) on frame 36 of 78 (1.20 s into the 2.6 s loop) and never passes 2.70 m.
- **Walk: play it at `speed = metres per second / 1.667` (1.5 at the GDD's 2.5 m/s).** One `walk` cycle (1.2 s at
  speed 1) carries the planted foot back **2.00 m** at one constant speed (stance = half the cycle, linear; held by
  `tests/art_boss/tamper.test.mjs`, measured 2.005 m). The clip's own ground speed is therefore 1.667 m/s. In
  `src/enemies/tamper.ts` every `S.pool.play(e, 'walk', fade)` should become
  `S.pool.play(e, 'walk', fade, TAMPER.walkSpeed / 1.667)` (the pool's fourth argument is the rate): the feet then do
  not slide at any walk speed. Played at speed 1 while moving 2.5 m/s, a third of the distance is slide (it was 60 %).
  2.0 m is all the legs give: 0.645 m hip to ankle at full extension, the pelvis yawing 10 degrees into each step.
- `charge` (9 m/s on a 0.5 s loop, 0.8 m per cycle) slides by design: a low fast stamp with the ram dragging on its
  trailing edge. Leave it at speed 1.
- **`charge` used to ship without its pelvis pitch** (Blender's exporter drops a bone channel that is constant over a
  clip even when it is not the rest pose; the 5 degree pitch vanished and both feet stood 5 degrees heel-down, 3.5 cm
  through the floor). Fixed in `blender/boss/tamper_clips.py` (`keep_constant`); see section 1 for the library.
- Width while charging and in `stagger`: the arm swings 8 degrees outward (12 to 13 for a few frames at the start of
  `charge_windup` and `charge_stun`, so the head clears the right foot), the tamping head reaches about x = -1.40 m.
- The floor is solid in every clip: no sole below 0, no corner of the tamping head below -0.012 m, except
  `charge_stun`, where the head dents the floor by 0.06 m ("ram buried"; it was 0.15 m). `ram_head` (the face
  centre) therefore rides 0.23 to 0.25 m above the floor in `charge` (the head is tilted, dragging on its rear edge):
  put the drag sparks at the floor under `ram_head`, not at the node.

## 3. To `art-env-interior`: `tamper_cold_static`

Raw export `blender/export/enemies/tamper_cold_static.glb`: one mesh `tamper_cold_mesh`, 3 584 triangles, pivot base
centre, front +Z, 1.69 wide x 2.42 high x 1.73 deep. Upright barrel, ram parked plumb, lids shut, livery band, number
`4-142`. Stamped `AO` (the zone lights it).

## 4. To the integrator / `code-render`

- One material means no `m_mask` decals: the maker's plate carries the mark as geometry and plain bars for the wordmark
  and number; the asset number on the back is stencil geometry (`4-141`; the cold unit is `4-142`).
- Emissive faces: the band is on palette cell `violet_band`, knot lobes on `violet`, cores on `violet_core`, the glow
  behind the slats on `violet`. Their COLOR_0 is unshaded (1.0 on the band and glow; the knot keeps the library's
  facet shading).
- The stain streaks are 3 mm proud decal strips on the `enamel` cell. On a renderer with a coarse depth buffer they
  could z-fight beyond about 40 m; not seen in the viewer.

## 5. To the integrator: a GDD conflict (walk speed against the body)

GDD 7.3 moves the Tamper at 2.5 m/s in `advance`; the art bible and the order give it 0.9 m legs and "a heavy, tireless
two-beat stamp" on a 1.2 s cycle. Those three cannot all hold: 0.9 m telescoping legs reach 2.0 m per cycle at most,
which is 1.67 m/s at the clip's own pace. As built there are two ways out, both without new art:

1. **Keep 2.5 m/s, play `walk` at speed 1.5** (section 2). No slide; the cycle becomes 0.8 s, a brisk stamp (2.5 beats
   a second) with a full 1.0 m stride. This is what the request to `code-enemies` asks for and what I recommend.
2. **Drop the walk to 1.67 m/s** and play at speed 1: the slow stamp the documents describe, no slide, but the Matador
   fight gets a slower bull (kiting distances and `enc_matador`'s timings in GDD 12 would need a look).

`code-audio`: the stamp's two beats per cycle land at 0 % and 50 % of the clip (left foot, then right); at speed 1.5
that is one footfall every 0.4 s.

## 6. Notes from the round-1 fix pass (for the next critic)

- Idle width is 1.692 m (order: 1.6 +- 0.1). Left as it is: the casing mouth already stands 15 mm off the saddle on the
  barrel's flat, so the arm cannot come inboard, and the 0.55 m head is the order's number.
- The open lids: the back lid is a 0.12 m slab (reads as a bar in the 48 px side silhouette); the chest lid is a
  wedge, 0.12 m at the hinge and a plate at its free edge, because a full slab hung into the sight line from eye height
  (1.65 m) down to the chest knot at 2 m (`tamper.test.mjs` holds that line).
- Emissive cells are proven in `shots/art-boss-tamper/tamper_emissive.png` (Cycles, unlit: `tx_palette` x COLOR_0 +
  `tx_palette_emis`, colour row and greyscale row; `tamper_evidence.py --emis`). The sandbox viewer does not draw the
  emissive texture on `m_prop` (also not with the real render module served), so no viewer frame can show it.

## Art integrator, polish round 2 (2026-10-04): what was decided on the rows above

| Row | Decision |
|---|---|
| 1: `keep_anim_armature` as the library default | **NOT DONE** (`blender/lib` stays frozen; the Tamper and the revolver slim their own clips; total download is 8.95 MiB of 20) |
| 5: walk speed against the body | for the code integrator: option 1 (keep 2.5 m/s, play `walk` at `speed / 1.667`) is the art-side recommendation; no art change |

## Code integrator, polish round 2 (2026-10-04): what was decided on the code-side rows

| Row | Decision |
|---|---|
| 2, what the file contains (vent lids, bones, clips) | `code-enemies` already reads it so (README ruling 8); the Tamper was fought in the playthrough (a line round through the chest, two lead rounds into the open vents): `shots/integrate-code/low_35_matador_line.png` |
| 5, walk speed against the body | **APPLIED, option 1**: 2.5 m/s stands and `walk` is played at 2.5 / 1.667 (`src/enemies/defs.ts` `TAMPER_WALK_RATE`, every `play(e, 'walk', ...)` of `tamper.ts`) |
| 4, to the integrator / `code-render` | no render change in this round; the emissive cells are drawn by the real renderer (the knot in the hall vignette frame, `high_33_story_tamper_vignette.png`) |

