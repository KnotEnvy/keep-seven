# Look team "gun", polish round 4 (lead ruling R6): changes made and requests

Evidence: `shots/r4-team-gun/before/` and `after/` (the real game, 1280 x 720, Low and High), zoomed crops and
placement trials in `shots/r4-team-gun/tune/`, numbers in `scratch/r4-team-gun/before_*.log` / `after_*.log`, the
running log `scratch/r4-team-gun/NOTES.md`. Capture tools: `scratch/r4-team-gun/cap.mjs`, `tune.mjs`.

## 1. What changed (for the closer: mirror into the documents)

| # | Where | Change | Document to mirror |
|---|---|---|---|
| 1 | `src/player/defs.ts` `VIEW_PLACE` | `x 0.004, y 0.013, z 0.023, pitch -7, yaw 8.5, roll -14` (was `-0.008, 0.012, 0.065, -5, 5, -4`). The gun is turned 3.5 degrees further, rolled 10 degrees the other way and stands 4 cm farther from the eye: the left side (cylinder flutes, trigger guard, frame screw) shows instead of the top strap and the back. Idle on Low, six zones: gun + hand 9.6 to 10.6 % of the frame (High 10.1 to 12.1), hand 1.4 to 1.9 %, left edge 0.568 of the width, the muzzle 101 px right and 69 px below the crosshair at 720p (123 px from it; it was 52 / 50). `tests/player/place.test.mjs` passes unchanged (gun alone 8.5 %). | ART_BIBLE 8.3 idle placement paragraph; GDD 5 / 23.x round-4 list |
| 2 | `blender/weapons/assize.py` | The rear of the revolver. `FRAME_OUT`: the frame behind the cylinder is a high rounded hump (the ears either side of the hammer slot) instead of a slope falling away; frame chamfer 1.5 -> 2.4 mm (rounded top strap); hammer slot 9.6 -> 6.6 mm wide; `HAMMER`: a slim neck and a low spur (at full cock its crest stands 4 mm and its spur 2 to 3 mm above the steel; it was a 15 mm wedge 20 mm above and 18 mm behind the frame: the upper jaw of the "wrench"); `HAMMER_HW` 4.5 -> 2.9 mm, the chequered spur bars 4.9 mm half-wide (wider than the neck); the back strap's top tucked into the frame. The cock angle (48 degrees), the pivot and every bone stand. | ART_BIBLE 8.1 (the revolver's description: "hump-backed frame, low spur") |
| 3 | `blender/weapons/revolver_rig.py`, `revolver_anim.py`, `hands.py` | The gun hand's thumb breaks at its knuckle and its end joint wraps down round the top of the grip (`RIGHT_THUMB_GUN`); it may straighten up to 26 degrees to reach a far target (`THUMB_UNFOLD`; not toward the cuff). A crease across each thumb joint, slimmer shafts. To pay for the thumb's two extra rings: bare wrist 10 -> 8 sides, cuff button 8 -> 6, tie cord 10 -> 9 segments. | ART_BIBLE 8.2 |
| 4 | `blender/weapons/revolver_clips2.py` `load_kept` (and three keys of `take_round`) | **Re-staged on the ordinary reload's framing**; the clip's name, length (1.8 s, 54 frames) and bones stand. 0-10 the gun turns its gate to the eye, the left hand comes up with the kept round already in its fingers, band whole; 9-16 the round is shown in profile beside the cylinder (about 75 px long at 720p in the game); 15-18 the left thumb cracks the band (frame 17, 0.57 s), the halves fall; 21-26 the cylinder comes round, 27-38 the round is turned over and goes in at the gate in view; 38-47 hand away, cylinder back, gate shut; 47-54 back to the firing pose. Nothing holds still for more than 7 frames. The cuff with its loop stays under the frame until code hides `kept_loop` (0.9 s) and after. `take_round`: the thumb's approach to the cuff starts three frames earlier (the bent thumb folds farther). | GDD 6.9 `load_kept` row; ART_BIBLE 8.4; art-weapons order clip table (the "0 - 0.4 s the forearm comes up, cuff to the eye ... 0.9 hand-off" text is superseded) |
| 5 | `tests/art_weapons/clips.test.mjs` | Three pins follow the new staging: `round_hand_kept` shows on frames 1 to 38 (was from 27); the cuff loop must be OUT of the 16:9 frame in `load_kept` on frames 0 to 27 (was: in it on 9 to 27); the shown round is measured on frames 9 to 16 (>= 40 px, drift < 15 mm; measured 101 px in the viewer's 52 degree view, 9.8 mm) and must go in inside the frame on 30 to 38. | - |
| 6 | Assets rebuilt | `tx_gun` (must be rebuilt with `--force` after any edit of `assize.py`: its unwrap is computed from the geometry) and `weapon_revolver`: 5 961 / 6 000 triangles (gun 3 169 / 3 200, arms 2 792 / 2 800), 2 draw calls, 257 kB. `check-glb`: 84 assets, 18 textures, 9.66 MB, all pass. Not embedded in any zone. | - |

| 7 | `src/render/materials.ts`, `GUN` branch only | The reflected studio's floors: ambient 0.45 -> 0.58, key 0.17 -> 0.20. Seen from its side the gun shows more faces that mirror the floor (4.2 % of the view-model sat under L* 12 in the bore). Mean L* of the view-model rises by 1 to 1.5 in every zone; no new uniform, varying or program. | ART_BIBLE 8.1 material paragraph (numbers only) |
| 8 | `src/render/moods.ts`, `L6.vmK` only | 0.9 -> **1.25**. The exterior look team set 0.9 this round (the gun was the lightest large shape of the last image at 1.35); at 0.9 the side-on gun had 8.1 % of its pixels under L* 12 on the rim (5.0 % at 1.05, 4.1 % at 1.15; `tests/render/polish3.test.mjs` R6 allows 4). At 1.25: mean L* 28.5 over a ledge of 13, 3.7 % under 12. **Exterior look team / closer: if the last image wants the gun darker than this, the R6 bound for the rim must move with it.** | - |
| 9 | `tests/render/polish3.test.mjs`, the R6 test, one bound | "not darker than what it covers by more than 9" stops following the background at L* 36 (`meanL >= min(bgL - 9, 27)`): in the antechamber the gun now stands over the ember-lit wall (L* 42.5) and reads as the frame's dark anchor at L* 30.6 (`shots/r4-team-gun/wip6/idle_low_ante.png`). | - |

## 2. Requests to other owners

| # | To | Request |
|---|---|---|
| 1 | code-player | `KEPT_LOOP_HIDE_AT` (0.9 s) no longer stages anything a player sees: the cuff loop is under the frame for the whole of `load_kept`. It can stay; if the hide is ever moved, nothing in the clip depends on it. A sound for the band giving way would now sit at 0.57 s of the clip (frame 17). |
| 2 | code-audio | If a band-crack cue exists or is added: 0.57 s into `load_kept` (it was staged at 0.53 s). The seat is at 1.27 s (frame 38); `kept_seat` still fires on `chambered` at 1.8 s. |
| 3 | code-ui | The HUD mark's ink backing now lies over the gun hand (thumb and fingers) in the lower-right corner, which is the only place the hand shows at idle. Lowering `BACKING_CORE` a little, or moving the ring 20 px up, would let the glove read. |
| 4 | closer | `tests/art_weapons/framing.test.mjs` and the Cycles previews in `shots/art-weapons/` still show the round-3 gun; the previews were not re-rendered. |

## 3. Not done (see the report)

The gun hand at idle is a thumb and one finger under the HUD mark, not "thumb plus two knuckles"; the frame's left flank is a
broad plain surface; in `load_kept` the left hand works in the lower middle of the frame (its forearm is under the frame, the
hand is not out of the centre third); the round is not seen leaving the cuff; 21:9 was not looked at in the game.

## Closer, polish round 4 (2026-10-05): decisions

| Row | What | Decision |
|---|---|---|
| 1.1-1.4, 1.7 | placement, frame and hammer, thumb, `load_kept`, reflection floors | mirrored: ART_BIBLE round-4 amendments (8.1 to 8.4), GDD 6.9 in place and 23.8 |
| 1.8 | L6 `vmK` 1.25 | stands (R6's black bound outranks the last image's wish for a darker gun) |
| 1.9 | the relaxed bound in `tests/render/polish3.test.mjs` | **accepted**: a bound that follows a bright background without limit asks the gun to glow in front of an ember wall; the floor of 27 keeps it lit |
| 2.3 | the HUD backing over the hand | open for round 5 (UI) |
| 2.4 | Cycles previews in `shots/art-weapons/` | not re-rendered; they show the round-3 gun |

# Look team "gun", polish round 5 (lead rulings R6, R13): changes made and requests

Evidence: `shots/r5-team-gun/before/` and `after/` (the real game, 1280 x 720, Low and High), placement trials in
`shots/r5-team-gun/tune/`, steps `s1` to `s10`, numbers in `scratch/r5-team-gun/before_idle_low.log` and `after_*.log`,
the running log `scratch/r5-team-gun/NOTES.md`. Tools: `scratch/r5-team-gun/cap.mjs`, `tune.mjs`.

## 1. What changed (for the closer: mirror into the documents)

| # | Where | Change | Document to mirror |
|---|---|---|---|
| 1 | `src/render/materials.ts`, `GUN` branch of `DYN_FRAG` and the constants `GUN_HZ_X` ... `GUN_RIM` beside `GUN_GAIN` | The studio the steel mirrors has a value structure instead of a flat floor: the reflected ground is dark and falls away (`0.16 + 0.18 x under` of the ambient, 0.022 of the key; it was a flat 0.58 / 0.20), the horizon is tilted and lowered 0.12 so its line runs across the frame plate at the idle pose, a thin hot band on it (1.30 x the key, exp(-5 hz)), a dimmer sky (0.16 + 0.40 hz). "Never black" is held by a toe (`GUN_TOE` 0.25 of the ambient, added only under 2.5 x its level), not by lifting every face. The cool rim from above is x 0.70 on the steel, the eye-facing darkening 0.45 -> 0.32. No new uniform, varying, texture or program. | ART_BIBLE 8.1 material paragraph |
| 2 | `src/render/materials.ts` `VM_HANDS` | 0.75 -> 0.88 (the gloves sat at L* 22 indoors; the cuff is now in the frame). | ART_BIBLE 8.2 (number only) |
| 3 | `src/render/moods.ts` | `MoodSpec.vmKey`, `vmAmb`: optional hues for the view-model's key and ambient. `L2` (the Tally House): `vmAmb 0x8a6450`, `vmKey 0xffa866`, `vmK` 0.88 -> 0.86 (its key was a warm WHITE because the mood's `keyK` is 0: the gun stood grey-white in the orange room). `L3.vmK` 0.95 -> 1.08, `L5a.vmK` 1.4 -> 1.44 (the darker studio; the R6 test's highlight and mean bounds). | ART_BIBLE 3 mood table (view-model column), 8.1 |
| 4 | `src/player/defs.ts` `VIEW_PLACE` | `x 0, y 0.025, z 0.026, pitch -7, yaw 7.5, roll -13` (was `0.004, 0.013, 0.023, -7, 8.5, -14`): the view-model stands 3.5 % of the frame height higher. The thumb, the forefinger and the walnut grip are in the frame. At 720p: gun + hands 11.6 to 12.1 % of the frame on Low (11.7 to 12.2 High), the hands alone 3.5 % (2.4), the muzzle 98 px right and 47 px below the crosshair (108 px = 15 % of the height), nothing left of 0.566 of the width or above 0.522 of the height. `tests/player/place.test.mjs` passes unchanged. Trials at y 0.030 to 0.046 showed more of the hand but put the barrel under the eye-level line (`shots/r5-team-gun/tune/t1` to `t6`). | ART_BIBLE 8.3 idle placement; GDD 5 / 23.x round-5 list |
| 5 | `src/player/defs.ts` `VIEW_PLACE_HANDLING` | `y -0.04 -> -0.07`: every clip in which the hands work on the gun (reload, line round, kept round) is shown about 9 % of the frame height lower; view-model coverage in the reload 12.8 to 13.4 % of the frame, the crosshair and the left half clear. No clip, timing or bone changed. | ART_BIBLE 8.3 / 8.4 |
| 6 | `blender/weapons/hands.py`, `revolver_rig.py` | Gloves: finger radii x 0.9 (a gap shows between fingers), right thumb radii 12.6 -> 11.3 mm, LEFT thumb 16.5 -> 13.8 mm (it was 33 mm thick: the "mitten"), a crease in `COLOR_0` across each finger joint (`CREASE` 0.66), finger sides darker than their backs (`SIDE_SHADE` 0.36, was 0.26). Same vertices, triangles, bones, weights. | ART_BIBLE 8.2 |
| 7 | Asset rebuilt | `weapon_revolver` only: 5 961 / 6 000 triangles, 2 draw calls, 257.6 kB. `tx_gun` and `tx_matcap_steel` untouched. `check-glb`: 84 assets, 18 textures, 9.69 MB, all pass. Not embedded in any zone. | - |

Measured idle, Low, real game (`after_idle_low.log`; before in brackets): gun mean L* street 35.9 (37.7) with the frame plate at
about (61,62,81) against (90,82,91); Tally House 34.5 (37.0); hall 29.7 (32.5); bore 29.3 (31.6); rim 27.3 (29.6); gun pixels under
L* 12: 0.0 % in all twelve spots (0 to 2.1).

## 2. Requests to other owners

| # | To | Request |
|---|---|---|
| 1 | render-tech / closer | **Edit outside my folder**: `tests/render/polish3.test.mjs`, the aim-tell test, now hides the view-model while it measures the two beams (two lines). The side beam passes 8 px over the raised muzzle; the barrel hid the late beam's lower glow and the gun's idle sway was counted as beam columns (601 columns and x1.15 to x1.32 with the gun, 268 columns and x2.39 without; x1.65 with the round-4 placement). No bound changed. |
| 2 | exterior look team / closer | `tests/render/moods.spec.ts` "has the eight moods ..." fails on the new key `L6c`: the expected list needs it. |
| 3 | closer | `tests/render/moods.spec.ts` holds every mood's view-model rig at 0.85 of the floors or more. That floor is what keeps the gun in the Tally House at L* 34 over a room of 22; if the last look wants it darker, `L2.vmK` and that bound move together. |
| 4 | closer | `tests/art_weapons/framing.test.mjs` and the Cycles previews in `shots/art-weapons/` were not re-rendered (as in round 4). |

## 3. Not done

The glove is still smooth low-polygon leather: at idle it is a thumb, two fingers and a grip, without stitching or nails that
would survive at 720p (the arms are at 2 792 of 2 800 triangles). The frame's left flank is still one plain surface; it now
carries the horizon line instead of an even grey, but no engraving or side-plate seam. The Tally House and High-tier bloom
leave the gun the lightest large shape of those frames (L* 30 to 34). 21:9 and 4:3 were not looked at with the new placement.

## Closer, polish round 5 (2026-10-06): decisions

| Row | Decision |
|---|---|
| 1.1 to 1.7 | **Mirrored**: ART_BIBLE round-5 amendments 8.1, 8.2, 8.3, the rig by mood; ARCHITECTURE 8.1; GDD 23.10. `weapon_revolver` is up to date (`build-assets`: 102 skipped) |
| 2.1 (`tests/render/polish3.test.mjs` hides the view-model while it measures two beams) | **Accepted**: no bound changed; the test measures the beams, not the gun |
| 2.2 / exterior 2.3 (`moods.spec.ts`) | green on the final tree (`L6c` in the list; L5a `vmK` 1.44) |
| 2.3 (the gun in the Tally House) | **Stays** at `vmK` 0.86; the 0.85 floor is not moved |
| 2.4 (framing previews, Cycles previews) | not re-rendered; listed |
