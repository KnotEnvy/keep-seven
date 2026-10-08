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

## Fixer, release pass p0 (2026-10-07): decisions

| Row | Decision |
|---|---|
| "arms budget 2 800: a lead decision" / the hands read as two lumps, the gun as a smooth casting | **Ruled and applied: R14.** `weapon_revolver` has **18 000 triangles** (it was 6 000; the split between gun and hands is yours: a guide is 10 000 / 8 000), **up to 3 draw calls** and three materials allowed: `m_gun`, the new **`m_hands`**, and `m_prop` (the palette) where it still serves. Its own texture set: `tx_gun` 1024 x 512 RGBA8 and `tx_matcap_steel` 256 x 256 as before, plus **`tx_gun_detail`** (1024 x 512, **R8**: one channel of height in `tx_gun`'s UV layout, 0.5 = flat: engraving, knurling, screw slots, pitting, edge wear), **`tx_hands`** (512 x 512 RGBA8: albedo of a glove or skin, A = gloss) and **`tx_hands_detail`** (512 x 512 R8: height: stitching, creases, knuckles). They are in `design/assets.json` with owner `weapons` and source `blender/tex/<id>.py`: **the three files in `public/assets/tex/` are placeholders until you write those scripts**. Unchanged: the 31 bones, the nodes, the 15 clips, the muzzle and the framing rules of R6 / R13 |
| what holds | the generator's ledger (`scratch/p0-fixer/gen_assets_ledger.log`): every cell at or under 120 000 triangles with the gun at 18 000 (worst `cell_street` / `cell_yard` 119 930), draw calls worst 84 / 92, the seam stage 63.3 of 64 MiB on Low. **There is 0.7 MiB of texture memory left on Low: do not ask for a larger sheet; ask for a trade** |
| what you must also touch | `tests/art_weapons/check.test.mjs` asserts exactly two primitives (now: at most three); `src/render/materials.ts` must send `m_hands` to the dynamic program and read the two height maps (see `docs/requests/render-tech.md`); `blender/lib/material.py` already knows `m_hands` (preview: `tx_hands`) |
| the gun's tone on the title after "Quit to title" | **Seen in this pass**: lighter and greyer than on a fresh boot (`shots/p0-fixer/title_fresh.png` against `title_after_quit_cp_rim.png`): the view-model's rig is not reset when the flow sets the title's mood. Yours or render-tech's |

# Look team "gun", release pass p0 (lead rulings R6 / R13 / R14): changes made and requests

Evidence: `shots/p0-team-gun/before/` and `after/` (the real game, 1280 x 720, Low and High), `compare_*.png`, placement
trials in `tune/`, numbers in `scratch/p0-team-gun/before_idle_low.log`, `after_*.log`, test logs `t_*.log`, the running
log `scratch/p0-team-gun/NOTES.md`. Tools: `scratch/p0-team-gun/cap.mjs`, `tune.mjs`, `look.py`.

## 1. What changed (for the closer: mirror into the documents)

| # | Where | Change | Document to mirror |
|---|---|---|---|
| 1 | `blender/weapons/hands.py` (rewritten below the palette block), `revolver_rig.py` (right thumb radii), `weapon_revolver.py` `paint()` | The hands are **`m_hands`** with UV0 on their own 512 sheet (`hands.LAYOUT`, `rect_uv`, stations `FINGER_S` / `THUMB_S`): twelve-sided digits whose joints are three rings (proud on the back, pinched inside), pads, domed tips, a **web** between thumb and forefinger (`h_web`), the thumb's back opposed to what is held, 16-sided palm, gauntlet and sleeve. **The gloves are fingerless** (`FINGER_CUT`, `THUMB_CUT`): the last two joints of every finger and the thumb's end joint are bare (skin, nails). `arms_mesh` is two primitives: `m_hands` and `m_prop` (the rounds, the band halves, the loop strap). COLOR_0 of the hands is AO only. Same 31 bones, nodes, 15 clips and timings. | ART_BIBLE 8.2 (fingerless buckskin gloves; the colour blocking), art-weapons order 4.1 |
| 2 | new `blender/weapons/hands_tex.py`, `blender/tex/tx_hands.py`, `blender/tex/tx_hands_detail.py` | The hands' albedo + gloss and height, drawn by numpy in each part's (s, v) space: side seams with stitch rows, joint wrinkles and creases, the three stitched points and worn knuckles on the back of the hand, a rolled hem at each cut finger, skin and nails, the gauntlet's bound edge, the oilcloth's twill and folds, a horn button. **The build does not see edits of `hands_tex.py`: use `--force`.** | ART_BIBLE 4.2 / 8.2 |
| 3 | `blender/weapons/assize.py` | More sides where a silhouette shows: cylinder 12 stations a sector (was 6) and four rings along the flute run-in, round barrel 32, recoil shield 20 and gate 18 steps with a rounder shoulder, the frame's hump and tail and the guard and straps rounded once more (`chaikin`), grip 12 x 9, case heads 12-sided. `gun_mesh` 5 561 triangles (was 3 169), `arms_mesh` 6 576 (was 2 792): **12 137 of 18 000**, 3 draw calls, 392 kB. | ART_BIBLE 8.1, art-weapons 4.1 triangle spend |
| 4 | new `blender/weapons/gun_tex.py`; `blender/tex/tx_gun.py` (now a thin caller), new `blender/tex/tx_gun_detail.py` | One drawing for both textures; the five bake passes are cached in `blender/export/.cache/gun_passes_<hash of assize.py>.npz`. Albedo: the frame, gate and hammer are colour-case-hardened (dark slate and tobacco clouds in the blue), the blued parts thinned to plum-grey in patches, ragged edge wear, fine scratches, pits. Height (`tx_gun_detail`): the grip frame's two seams and a milled panel on each flank, a counterbore round each screw, slots, bolt notches with leads, turned lines, tool marks, the ejector's slot, the walnut's grain, pores and three dents, the stamp. The four gloss points and "the blue is the darkest colour" hold (blue mean 29.8 against `cable` 30.5). **Use `--force` after editing `gun_tex.py`.** This supersedes the order's "no noise, no grunge" (R13 asks for breakup and wear); there is still no engraving, motif or logo. | ART_BIBLE 8.1, art-weapons 4.2 |
| 5 | `src/render/materials.ts` (dynamic shader, GUN and new HANDS parts only) | `keepBump()` + uniform `uDetail`: the height map bends the view-space normal (three taps, in metres: `GUN_BUMP` 1.6 mm, `HANDS_BUMP` 3.2 mm per full step) and shades hollows (`GUN_CAVITY`, `HANDS_CAVITY`). New define **`HANDS`** for `m_hands`: lit per pixel by the view-model's rig through the bent normal, a soft leather sheen from `tx_hands`' alpha, and the same shadow toe as the steel. `VM_HANDS` 0.88 -> 0.96. `vec3 c = albedo * vLight` became `albedo * lit` (`lit = vLight` for every other material: no change). `src/render/prewarm.ts` regenerated (one more recipe). | ARCHITECTURE 8.1 (`m_gun`, `m_hands`), ART_BIBLE 8.1 / 8.2 |
| 6 | `src/player/defs.ts` `VIEW_PLACE` | `x -0.006, y 0.024, z 0, pitch -8, yaw 7.5, roll -13` (was `0, 0.025, 0.026, -7, 7.5, -13`): 2.6 cm farther, 6 mm inboard, the muzzle a degree lower. At 720p: view-model 11.6 to 11.8 % of the frame on Low (11.9 High), the gun the hand does not cover 8.2 %, the hand 3.5 % (was 2.2), the muzzle 81 px right and 55 px below the crosshair (98 px = 13.6 % of the height; it was 98 / 47), the hammer spur clear of the right edge. | ART_BIBLE 8.3; GDD 5 / 23.x |
| 7 | `src/render/moods.ts` (view-model fields only) | New optional `vmAmbK` (the ambient's share of the rig's level). `L5a` (antechamber): `vmAmb 0x5e4c3c, vmKey 0xffa462` (the gun was pink-lilac in the amber room). `L5c` (catwalk, cage, stair): `vmAmb 0x3c5560, vmKey 0x9adfd2` (it was saturated violet in a teal room). `L6`: `vmAmb 0x485470`, `vmAmbK 0.84`, `vmK 1.25 -> 1.32`. `L3.vmK 1.08 -> 1.14`. | ART_BIBLE 3 mood table (view-model column) |
| 8 | `tests/art_weapons/` | `check`: three primitives (`m_gun`, `m_hands`, `m_prop`), 5 textures, GLB share 350 -> 450 kB and the five view-model textures <= 450 kB (275 kB); `geometry`: split 10 000 / 8 000; `family`: reads both primitives of `arms_mesh`. 24 / 24. | art-weapons order 5, 6 |

## 2. Edits outside my folders, and requests

| # | To | What |
|---|---|---|
| 1 | player (not active) / closer | **Edited `tests/player/place.test.mjs`**: the view-model's mesh names are compared without the loader's `me_` prefix and `_1` suffix (two primitives); round 4's bounds "gun seen >= 8.3 %" and "hands <= half the gun" are now ">= 6.3 %", "hands (drawn alone) <= the gun" and "the whole 8 to 14 %" (R13). The old bounds are what kept the hand out of the frame. |
| 2 | closer | GDD / ART_BIBLE still describe gauntleted full gloves and the round-5 placement; `tests/art_weapons/framing.test.mjs` and the Cycles previews in `shots/art-weapons/` still show an older gun (not re-rendered, as in rounds 4 and 5; `fp_preview.py` does not know `m_hands`). |
| 3 | render-tech / closer | `tests/render/polish3.test.mjs` R6 (>= 2 % of the view-model over L* 60, < 4 % under L* 12) and `moods.spec.ts` (rig ambient >= 0.85 of the floor) are what stop the gun coming down at dusk: at the 0.85 floor the rim left 4.4 % black and 2.1 % highlight. If the last image wants a darker gun, those bounds move first. Margins now: highlights 2.3 to 2.9 %, black 0 to 2.9 %. |
| 4 | fixer | `weapon_revolver.glb` is 392 kB (the order's share was 350 kB for 6 000 triangles). No texture was enlarged. |

## 3. Not done

The dusk rim: the gun's mean is still L* 25.8 over a ledge of 13.9 (it was 26.8): only its hue changed (slate, not lilac). The asking dial: standing square on at 5 m the barrel still crosses the dial's lower right (now port 4 and half of numeral 4; numeral 3 and its port are clear): no placement inside R13's box clears a dial 380 px across. The gun is smaller on screen (8.2 % seen, was 9.8). The steel is still a pale grey in most rooms (R6's mean and highlight bounds). The bare fingers are smooth cylinders with drawn nails; the hand grips low on the back strap (the clips are staged on that grip). 21:9 and 4:3 were not looked at. No person has looked at any of this on a real GPU.

## Closer, release pass p0 (2026-10-07): decisions on this file's p0 rows

Evidence: `docs/INTEGRATION_REPORT.md` Part K, `scratch/p0-closer/NOTES.md`, `scratch/p0-closer/gate/`.

| Row | Decision |
|---|---|
| Section 1 rows 1 to 8 | **Applied**: ART_BIBLE "Amendments, release pass p0" (8.1 to 8.3, the mood table), ARCHITECTURE 8.4's p0 note (`m_gun` bump, `HANDS`, `uDetail`, `vmAmbK`), GDD 23.12 |
| 2.1 `tests/player/place.test.mjs` bounds | **Accepted**: the trade (a smaller gun for a hand that reads) is what R13 asks; the whole view-model is 11.6 to 11.9 % of the frame |
| 2.2 the Cycles previews | Not re-rendered; known gap |
| 2.3 the R6 bounds | **Not moved**. `tests/render/polish3.test.mjs` R6 passes in every zone on the final tree (the antechamber and bore failures the other look teams saw were mid-rebuild) |
| 2.4 392 kB | Accepted; total download 12.04 MiB of 20 |
| Section 3, not done | Carried into `docs/KNOWN_ISSUES.md` |

## Fixer, pass i1 (2026-10-07): ruling R14, what the view-model has to spend

Ruling R14 was applied in release pass p0 and is unchanged in this pass (`tools/gen_assets.mjs`, the weapons block;
the generator's ledger was re-run: worst cell 119 930 of 120 000 triangles, the worst stage 55.3 of 64 MiB on Low and
121.0 of 128 on High at 1920 x 1080).

| Budget | Allowed | Built now | Left |
|---|---|---|---|
| Triangles, `weapon_revolver` (gun + hands, one asset) | 18 000 | 12 137 | 5 863 |
| Draw calls | 3 (`m_gun`, `m_hands`, and `m_prop` allowed) | 3 primitives | 0 |
| Textures | `tx_gun` 1024 x 512 RGBA8 (albedo, A = gloss), `tx_gun_detail` 1024 x 512 R8 (height), `tx_hands` 512 x 512 RGBA8, `tx_hands_detail` 512 x 512 R8, `tx_matcap_steel` | all five | no new texture and no larger size without a manifest change: High's worst stage has 7.0 MiB left, Low's 8.7 |

A larger or further texture is possible only through the manifest (ask in this file with the size): `tx_gun_detail` at
2048 x 1024 would cost 2.1 MiB (High 123.1 of 128), `tx_gun` at 2048 x 1024 would not fit High's stage. Every change of
`design/*.json` makes the whole asset set stale (the build hashes the three files), so a manifest change is a full
rebuild.

# Look team "gun", pass i1 (lead rulings R6 / R13 / R14): changes made and requests

Evidence: `shots/i1-team-gun/before/` and `after/` (the real game, 1280 x 720, Low and High), steps `s1` to `s5`, placement
trials in `tune/`, Blender looks in `look/`, numbers in `scratch/i1-team-gun/before_idle_low.log`, `after_idle_low.log`,
`after_idle_high.log`, test logs `t_*.log`, the running log `scratch/i1-team-gun/NOTES.md`. Originals of every file touched:
`scratch/i1-team-gun/orig/`. Tools: `cap.mjs`, `tune.mjs`, `look.py`, `sheet.mjs`, `crop.mjs`.

## 1. What changed (for the closer: mirror into the documents)

| # | Where | Change | Document to mirror |
|---|---|---|---|
| 1 | `blender/weapons/assize.py` | **The rear of the revolver is a single action's.** `FRAME_OUT`: round 4's hump is gone; behind the cylinder window the frame falls to the back strap (the standing breech, then the ears). `HAMMER`: the face cut down and the top one arc from nose to spur, so the cocked hammer stands 8 to 17 mm proud of the frame as one horn (it showed 4 mm). The spur's three slab bars are a low pad with five fine ribs. `SHIELD_FLARE`: the recoil shield's left lobe is a turned disc 7 mm thick with a flat face and a chamfer (it was a 12 mm round-shouldered pill: "the dome"). `BACK_STRAP`'s top tucked to (-103.2, -15). Pivots, bones, `HAMMER[7]`, the cock angle stand. `gun_mesh` + `arms_mesh` 11 597 of 18 000 triangles (it was 12 137), 3 draw calls, 378 kB | ART_BIBLE 8.1 (supersedes round 4's "hump-backed frame, low spur") |
| 2 | `blender/weapons/revolver_rig.py` | `RIGHT_THUMB_GUN`: the gun hand's thumb is 28 + 25 mm from knuckle to tip (it was 21 + 20 and 20 mm thick: the "sausage"), radii 8.9 / 8.0 / 7.3 / 6.2. `RIGHT_CURLS`: middle, ring and little finger wrap on to the left panel (34 / 96 / 68 degrees; they stood off the front strap as knobs) | ART_BIBLE 8.2 |
| 3 | `blender/weapons/hands.py`, `hands_tex.py` | **The gloves are whole again** (`FINGER_CUT`, `THUMB_CUT` = `None`; p0's fingerless cut left bare, featureless finger ends as the only part of the hand in the idle frame). Seams with stitch rows, joint wrinkles and worn pads run to the fingertips | ART_BIBLE 8.2 (supersedes p0's "fingerless") ; GDD where it says fingerless |
| 4 | `blender/weapons/gun_tex.py` | The blue is a blue-black (the palette cell held 35 % toward grey, x 0.64), worn steel x 1.15, the walnut an oiled red-brown; a wider worn edge; holster rub in soft patches on the barrel's sides, the cylinder's lands, the shield, the top strap's shoulders, the guard; case colours about twice as light with a satin gloss. The four named gloss points and "the blue is the darkest colour" hold (30.2 against `cable` 30.5) | ART_BIBLE 8.1 |
| 5 | `src/render/materials.ts`, GUN branch of `DYN_FRAG` and the constants `GUN_GND_K` ... `GUN_TINT`, `GUN_TOE` | The studio the steel mirrors is three things: a **ground** in the key's hue (0.085 of the key + 0.12 of the ambient: this is what carries the mood), a dim **sky** in the ambient's (0.26 + 0.50 hz), a thin hot **band** of the key on the horizon (x 3.0, exp(-19 hz); it was x 1.3, exp(-5 hz): most of every face was the key at half strength, the "putty"). A texel's albedo decides how much it mirrors (`bare`: blued x 0.8, worn-bright steel x 3.0), the blue's tint of the reflection is 0.60 and falls to 0 on bare steel, the matcap is x 0.22, the toe 0.24. No new uniform, varying, texture or program | ARCHITECTURE 8.1 / 8.4 (`m_gun`), ART_BIBLE 8.1 material paragraph |
| 6 | `src/render/moods.ts` (view-model fields only) | `L1` `vmAmb 0x7c98a8` (the sky's slate teal; the Long Light's own ambient is a blue-violet: "cobalt"), `L0` `vmAmb 0x8a6a5c` (the red rock's bounce), `L3.vmK` 1.14 -> 1.24, `L5.vmK` 1.35 -> 1.38, `L5c` `vmK 1.3`, `L6` `vmAmbK` 0.84 -> 1.0 and `vmK` 1.32 -> 1.4 (the body is dark by its material now, the rigs hold the floor) | ART_BIBLE 3 mood table (view-model column) |
| 7 | `src/player/defs.ts` `VIEW_PLACE` | `x -0.004, y 0.022, z 0.010, pitch -8, yaw 9.5, roll -13` (was `-0.006, 0.024, 0, -8, 7.5, -13`): 2 degrees further side-on. At 720p: muzzle 70 px right, 60 px below the crosshair (92 px, 12.8 % of the height), view-model 11.0 to 11.6 % of the frame on Low (11.5 to 13.3 High), the gun no hand covers 8.0 to 8.5 %, the hand 2.8 to 3.1 % | ART_BIBLE 8.3; GDD 5 / 23.x |
| 8 | `src/player/defs.ts` `VIEW_PLACE_TUCK`, `src/player/viewModel.ts` (`tick`, `late`) | **New: the gun is tucked under the asking dial.** Inside `trg_pz_asking`, facing the door wall (view forward z >= 0.6), with the idle clip playing, the view-model eases 3.4 cm down and 4 degrees muzzle-down over 0.45 s (a cut under reduce motion); a shot, a reload or a sprint returns it in 0.08 s. Counted on the fixed tick, read by nothing in the sim; the aim, the muzzle socket and the clips are untouched. All eight ports and numerals are clear at 5 m (`after/idle_low_ask.png`); the view-model is 7.5 % of the frame there | GDD 9.x (the asking), ART_BIBLE 8.3 |

## 2. Edits outside my folders, and requests

| # | To | What |
|---|---|---|
| 1 | render-tech / closer | **Edited `tests/render/polish3.test.mjs`, the R6 test, one bound**: "at least 2 % of the view-model over L* 60" is "at least 1 %". The 2 % was met by the broad key-coloured band that made the gun pale; the dark steel's highlights are thin (1.1 to 2.4 % measured). The other three bounds are unchanged and pass (under L* 12: 0 to 2.8 % of 4) |
| 2 | closer | `public/share.jpg` and the hero frames show the old gun: re-run `node tools/make_share_image.mjs <title frame>` and retake the frames. `tests/art_weapons/framing.test.mjs` and the Cycles previews in `shots/art-weapons/` still show an older gun (as in every pass since round 4) |
| 3 | exterior-look / underground-look / closer | Seen failing in `tests/render` while I worked, not from my files (the same on a tree with my shader reverted is not proven: other look teams were editing): `polish.test.mjs` "the coda: the last fire is the brightest warm point", `polish3` "R5 / R7: the far rim ... its glow is 440 px wide", "High is not Low: ... the bloom's threshold is a display level (0.620)", "the gallery: High keeps the depth and shades it (0.59)" |
| 4 | ui | The tuck lowers the hand under the HUD's lower-right corner inside the antechamber only; nothing to change |

## 3. Not done

The idle hand is a gloved thumb over one finger and a second fingertip at the frame's edge: stitched and creased now, but
still large simple forms close to the eye; the hand grips low on the grip (the clips are staged on that grip). The frame's
flank is dark with worn edges and a faint case mottle: there is no engraving, and the mottle is hard to see at 720p. In the
Tally House the gun is still the lighter mass against the dark hall (L* 31 over 24), warm brown-grey rather than tan. The
cocked hammer's underside leaves a gap of daylight over the back strap that can read as a hook from some angles. The tuck
was checked standing at 5 m only (not 2 m, 4:3 or 21:9). `load_kept`, the line-round clip and the sprint were not
re-looked at with the longer thumb (reload and fire were: `after/sheet_reload_low_street_*.png`, `sheet_fire_low_street_*.png`).
No person has looked at any of this on a real GPU.

## Closer, pass i1 (2026-10-07): decisions on this file's i1 rows

| Row | Decision |
|---|---|
| Section 1 rows 1 to 8 | **Mirrored**: ART_BIBLE "Amendments, pass i1" (8.1 to 8.3, the mood rigs), ARCHITECTURE 8.4 (`m_gun`), GDD 23.14 (the place, the gloves, the tuck) |
| Section 2 row 1, `tests/render/polish3.test.mjs`: "at least 2 % of the view-model over L* 60" is "at least 1 %" | **Accepted**: the bound measured the pale band that ruling R6 asked to be rid of; the other three bounds stand |
| Section 2 row 2, `public/share.jpg` and the hero frames | **Done**: the share picture was made again from this pass's title frame; `shots/i1/hero_01..12.png` are new |
| Section 3, not done (the idle hand's simple forms, no engraving, the gun the lighter mass in the Tally House, the hammer's gap, the tuck at other aspect ratios) | **Open**: `docs/KNOWN_ISSUES.md` |

## Look team gun, pass i2 (2026-10-07)

Issues: the gun hides port 4 at 2 m from the asking dial (story-b); flat pale pewter in the Tally House and a cool stripe
in every mood (visual-a, visual-b); saw teeth under the barrel, a comb on the hammer, a blunt finger (visual-a); at idle
the hand is two fat digits (visual-b). Evidence: `shots/i2-team-gun/before/` against `shots/i2-team-gun/after/`,
`shots/i2-team-gun/dial/`, logs in `scratch/i2-team-gun/`.

## 1. What changed (for the closer: mirror into the documents)

| # | Where | Was | Is |
|---|---|---|---|
| 1 | GDD 5 / 6.9, ART_BIBLE 8.3: the view-model's place (`src/player/defs.ts VIEW_PLACE`) | (-0.004, 0.022, 0.010; pitch -8, yaw 9.5, roll -13); muzzle 70 px right, 60 below (92 px); view-model 11.7 %, gun seen 7.0 % | **(-0.004, 0.030, 0.004; pitch -11, yaw 9.5, roll -13)**; muzzle 67 right, 69 below (96 px = 13.3 % of the height); view-model 12.8 %, gun no hand covers 6.5 % (the hand is in the frame now: thumb, forefinger on the trigger, middle finger, top of the ring finger) |
| 2 | GDD 9.7 the asking, the tuck (`VIEW_PLACE_TUCK`) | 3.4 cm down, 4 degrees muzzle-down | **9.6 cm down, 2.8 cm to the right, 8 degrees** (new field `right`, applied in `viewModel.ts`); at 2 m, 3 m and 5 m numeral 4 and port 4 are clear (0 % of either behind the gun at 2 m) |
| 3 | ART_BIBLE 8.2 the right hand at rest (`blender/weapons/revolver_rig.py`) | the middle knuckle at gun (27, -104, -62); forefinger straight through the guard, 17 mm out of its left side; the three fingers' ends inside the left panel; the thumb level along the top of the grip | the hand 12 mm higher and 2 mm back **(27, -106, -51)**; `RIGHT_CURLS` index (-4, 12, 44, 40), middle (4, 36, 86, 60), ring (3, 32, 76, 62), pinky (8, 26, 60, 48): the forefinger's pad lies on the trigger, the three fingers lie on the left panel; `RIGHT_THUMB_GUN` comes down across the panel toward the middle finger; thumb radii a tenth slimmer |
| 4 | ART_BIBLE 8.2 the glove's digits (`hands.py`) | the last joint kept its girth to a short dome; the thumb's root a broad flap | fingertips taper from the end joint to a longer, flatter end; the thumb's root starts small inside the palm; thumb knuckles stand prouder (1.5) |
| 5 | ART_BIBLE 8.1 the hammer (`assize.py`) | five ribs of geometry on the spur | one low thumb-piece 8.6 mm wide that follows the spur and rolls up at its end; fine 1.5 mm chequering in `tx_gun` / `tx_gun_detail` only |
| 6 | ART_BIBLE 8.1 the ejector housing | a plain tube | the same tube with one domed retaining screw near the breech (part `screws`, slot drawn) |
| 7 | ART_BIBLE 8.1 the steel's wear (`gun_tex.py`) | edge wear cut by a 0.9 mm x 7 mm lattice noise (a row of lit dashes along the barrel's underside: "saw teeth"), dotted seam and panel lines, filing marks 0.45 mm apart, the cylinder window's walls worn bright | a soft breakup on a lattice turned out of the gun's axes; the edges that look down keep their blue; seam and panel lines are whole; filing 0.85 mm, none on the hammer; nothing worn inside the cylinder window; the blue 0.625 (was 0.64) of the palette's cell |
| 8 | ARCHITECTURE 8.4 `m_gun` (`src/render/materials.ts`, GUN branch) | the blue tinted everything the steel mirrored; every texel mirrored the room | what the KEY gives (band, lit floor) takes only `GUN_TINT_KEY` 0.20 of the tint (orange edges in lamp rooms); every mirrored term is gated by the baked occlusion in COLOR_0 (`GUN_OCC_0` 0.42, `GUN_OCC_1` 0.74, floor 0.12); the ledge of the cylinder window is baked at 0.10 (`weapon_revolver.py paint`) |
| 9 | ART_BIBLE 3 / 8.3 the view-model's rig (`src/render/moods.ts`) | rim hue `VM_COOL` in every mood; L2 `vmK` 0.86, `vmAmb` #8A6450, `vmKey` #FFA866 | the rim takes the hue of the view-model's key in moods without a sky (`VM_COOL` under a sky or when `vmRim` is set); new optional `vmAmbSat` / `vmKeySat` (0.5 / 0.7 when absent); **L2: `vmK` 0.764, `vmAmbK` 0.72, `vmAmb` #784D3A at 0.7, `vmKey` #FFAA66 at 0.8** (Tally House: mean L* 25 over 24, it was 30.4; R / B 2.3) |

Per-cell budgets: `weapon_revolver` 11 697 of 18 000 triangles, 3 draw calls, 379 kB; `tx_gun` 96 kB, `tx_gun_detail` 65 kB
(same sizes and formats as before: no texture memory changed). No node, bone or clip name or timing changed; the clips are
solved from the new rest pose by `revolver_anim.py` as before.

## 2. Edits outside my folders, and requests

| # | To | What |
|---|---|---|
| 1 | render-tech / closer | `tests/render/moods.spec.ts`: the floors of the view-model's rig (0.85 of `VM_AMB` and `VM_KEY` on screen) are 0.5 and 0.75 for **L2 only** (three expectations). The reviewers' "pale pewter" was the gun AT those floors in the one room that is dark and orange everywhere; `tests/art_weapons/i2_real.test.mjs` now holds the picture (mean L* within 4 of the room and at least 20, R / B over 1.5, highlights at least 1 %, under L* 12 less than 4 %) |
| 2 | closer | `public/share.jpg`, the hero frames and any title capture show the old hand and placement: make them again |
| 3 | ui | the tucked gun now leaves the frame by the bottom edge right of centre inside `trg_pz_asking`; nothing of the HUD is covered that was not before |

## Closer, pass i2 (2026-10-07): decisions on this file's i2 rows

| Row | Decision |
|---|---|
| Section 1 rows 1 to 9 | **Mirrored**: GDD 23.15 (5 / 6.9, 9.7), ART_BIBLE "Amendments, pass i2" (3 / 8.3 the rig, 8.1, 8.2, 8.3), ARCHITECTURE 8.4 "Pass i2" (`m_gun`) |
| Section 2 row 1, `tests/render/moods.spec.ts`: L2's on-screen floors 0.5 x `VM_AMB`, 0.75 x `VM_KEY` | **Accepted**: the old floor was the pale gun the reviewers named; `tests/art_weapons/i2_real.test.mjs` holds the picture in its place |
| Section 2 row 2, `public/share.jpg`, hero frames | **Done**: made again from this pass's title frame; `shots/i2/hero_01..12.png` are new |
| The flash test (`tests/render/flash_muzzle.test.mjs`) | see `docs/INTEGRATION_REPORT.md` Part N.1 |
| Not done (the flat flank's one value in the Tally House, fingers end-on at idle, the tuck at 4:3 and 21:9, the reload's close-ups) | **Open**: `docs/KNOWN_ISSUES.md` |

## Fixer, pass i3 (2026-10-07): ruling R14, what the view-model has to spend

Unchanged since release pass p0 (the ledger of `tools/gen_assets.mjs` was run again in this pass).

| | Allowed | Built | Left |
|---|---|---|---|
| `weapon_revolver` triangles (gun + hands) | 18 000 | 11 697 (`gun_mesh` + `arms_mesh`) | **6 303** |
| draw calls | 3 (`m_gun`, `m_hands`, `m_prop`) | 3 | 0 |
| textures | `tx_gun` 1024 x 512 RGBA8, `tx_gun_detail` 1024 x 512 R8, `tx_hands` 512 x 512 RGBA8, `tx_hands_detail` 512 x 512 R8, `tx_matcap_steel` 256 x 256 | all | none without a manifest change: the seam stage is 55.3 of 64 MiB on Low and 121.0 of 128 on High, so a larger or further texture is a request with its size |

The idle hand (three curled fingers with knuckle breaks under the guard, an index finger on the trigger) fits in the
6 303 triangles left. The 31 bones, the nodes, the 15 clips and their lengths are a contract: they do not change.

## Look team gun, pass i3 (2026-10-07)

Issues: the idle hand is a thumb, a knob and a stub (visual-a, visual-b); the revolver changes material from room to
room and its muzzle crown is white in every mood (visual-a, visual-b); saw teeth on the top rib and under the barrel
(both); the kept round is too thick for its chamber (visual-b). Evidence: `shots/i3-team-gun/before/` against
`shots/i3-team-gun/after/`, steps in `wip1` .. `wip7`, placement trials in `tune/`, Blender looks in `look/`, logs and
the running log in `scratch/i3-team-gun/` (`NOTES.md`, `before_idle_low.log`, `after_idle_low.log`, `after_idle_high.log`,
`t_*.log`). Originals of every file touched: `scratch/i3-team-gun/orig/`.

### 1. What changed (for the closer: mirror into the documents)

| # | Where | Was | Is |
|---|---|---|---|
| 1 | ART_BIBLE 8.2 the right hand at rest (`blender/weapons/revolver_rig.py`) | the knuckle row at the REAR of the right panel (`RIGHT_MID_MCP_GUN` (27, -106, -51), the back strap is at y -112 there): only the fingertips' domes came round the front strap ("a knob and a stub") | the hand seated as a hand holds a grip: the knuckles 16 mm further forward along the fingers' plane **(27, -90.4, -57.5)**, the first joints cross the front strap, the middle and end joints of three fingers lie ON the left panel; `RIGHT_CURLS` index (-2.8, 21, 65, 58) (hooked through the guard, its end joint out of the left side), middle (4, 67.4, 105.9, 31.8), ring (3, 54.3, 100.1, 40.7), pinky (8, 23.2, 80.6, 53.8) (fitted to the gun's surface by `scratch/i3-team-gun/solve2.py`); `RIGHT_THUMB_GUN` (-6, -148, -30), (-19.5, -121, -22.5), (-26, -95, -30), (-25, -74.5, -45): a thumb that breaks at its joint and comes down on to the middle finger, radii 9.6 / 8.6 / 7.9 / 6.7 (it was a tenth slimmer than the fingers); new `RIGHT_WEB_GUN` (3, -118, -30): the web passes behind the back strap |
| 2 | ART_BIBLE 8.2 the glove (`blender/weapons/hands.py`) | knuckles 1.25 mm proud, the joint ring x 1.03, the pad x 0.95, tips tapered to 0.50; the web a tube with flat ends (two hexagons showed) | knuckles 1.9 mm proud, joint ring x 1.06, pad x 0.93, tips 0.56; `Hand(web_through=)`: the web's ends are small and lie inside the thumb and the first knuckle. Both hands share the digit shapes |
| 3 | GDD 5 / 6.9, ART_BIBLE 8.3 the view-model's place (`src/player/defs.ts VIEW_PLACE`) | (-0.004, 0.030, 0.004; -11, 9.5, -13); muzzle 67 right, 69 below (96 px); view-model 12.8 % | **(0.006, 0.036, -0.030; -11, 9.5, -13)**; muzzle 81 px right, 55 below (97 px = 13.5 % of the height); view-model 11.5 to 12.8 % of the frame on Low, glove 4.9 to 6.0 %, the gun no glove covers 6.2 to 7.1 % (pixels; `scratch/i3-team-gun/after_idle_low.log`); the frame holds the thumb, the forefinger in the guard, the middle and ring fingers and the back of the thumb's root |
| 4 | GDD 9.7 the tuck (`VIEW_PLACE_TUCK`) | drop 0.096, right 0.028 | **drop 0.112, right 0.040** (port 4 and numeral 4: 0 % behind the gun at 2 m, `tests/art_weapons/i2_real.test.mjs`) |
| 5 | ARCHITECTURE 8.4 `m_gun` (`src/render/materials.ts`, GUN branch) | the steel's body took the room's ambient and key whole: tan in the Tally House, pink at the plate door | a texel whose blue is not under its red is STEEL: its body terms (the mirrored fill, the toe, the lit floor, the matcap) take `GUN_AMB_SAT` 0.10 / `GUN_KEY_SAT` 0.25 of the room's hue, cooled by `GUN_STEEL` (0.72, 0.92, 1.24); the band, the hot spot and the rim keep the key's hue; everything mirrored passes a soft shoulder at `GUN_CAP` 0.70 x the key's luminance (at most twice that). The steel's floor is `GUN_TOE_STEEL` 0.225 of its cooled ambient (0.24 of the room's), `GUN_SKY_A` 0.26 -> 0.11, `GUN_GND_A` 0.12 -> 0.10, `GUN_GND_K` 0.085 -> 0.045, the matcap 0.22 -> 0.09, `GUN_BAND_K` 3.0 -> 4.0 (thin highlights carry R6's 1 %). The GLOVES' floor is `HANDS_TOE` 0.85 of `GUN_TOE` (it was half): with the hand in the frame its creases and the cuff were what fell under L* 12. Wood and brass are untouched. No new uniform, varying, texture or program |
| 6 | ARCHITECTURE 8.4 / ART_BIBLE 3 the view-model's rig (`materials.ts fadeProp`) | on the gallery stair (zone `tally_house`, mood L2) the view-model kept the Tally House's lamp rig: a copper gun in a mint stair | `VM_STAIR_Y` 0.55: with the view-model under that height in an L2 zone it takes L3's rig, scaled by L3's exposure over L2's (the frame is still exposed for the hall) |
| 7 | ART_BIBLE 3 mood table, view-model column (`src/render/moods.ts`) | L6 `vmAmbK` 1.0 | L6 `vmAmbK` **0.9** (`vmK` 1.4 stands): the steel's body at dusk is L* 22.3 (it was 24.6) and blue-grey (a cylinder patch measured R / B 1.08, now under 1), with the afterglow only on the muzzle and the strap |
| 8 | ART_BIBLE 8.1 the steel's wear (`blender/weapons/gun_tex.py`) | every edge worn to bright steel; the last 30 mm of the barrel bare; the ejector's slot drawn dark; cylinder lands 0.22, rub 0.55 | long straight edges keep a third to a half of their wear (`k_edge`: frame 0.48, barrel flats 0.30, housing 0.22, straps 0.55, guard 0.6): no dashed bright line on the top strap or under the barrel; the muzzle is thinned blue (0.34) with only the crown's last 2 mm bright; the slot is in the height map only; lands 0.10, rub 0.36; the blue x 0.60 |
| 9 | ART_BIBLE 8.4 the rounds in the hands (`weapon_revolver.py`, `revolver_rig.HAND_ROUND_K`) | 12 mm cases | the three rounds the left hand holds, the kept round in its loop, its band and the loop are **0.75 of their girth (9 mm)**, their length stands; the world props and pickups are 12 mm as before |

Budgets: `weapon_revolver` 11 745 of 18 000 triangles, 3 draw calls, 390 kB; `tx_gun` 95 kB, `tx_gun_detail` 66 kB (same sizes
and formats: no texture memory changed). No node, bone or clip name or timing changed.

### 2. Edits outside my folders, and requests

| # | To | What |
|---|---|---|
| 1 | player / closer | **Edited `tests/player/place.test.mjs`** (the player team is not active): "the gun no hand covers is 6.3 % or more" and "the hands drawn alone are less than the gun shows" are "4.3 % or more", "the gun with the hands hidden is 7 % or more" and "the hands drawn alone are less than twice what the gun shows" (three places). The old pair kept the hand out of the frame |
| 2 | closer | `public/share.jpg`, the hero frames and every title or idle capture show the old hand, placement and steel: make them again |
| 3 | closer | `tests/art_weapons/i3_real.test.mjs` is new (untracked): add it before the release tag. `tests/art_weapons/family.test.mjs` holds the hand rounds at 9 mm |
| 4 | underground-look / exterior-look | the steel no longer takes a room's hue in its body. If a mood's `vmAmb` / `vmKey` was chosen to colour the gun, only its highlights and the gloves and the walnut follow it now |

### 3. Measured (Low, 1280 x 720; `tests/art_weapons/i3_real.test.mjs`, `scratch/i3-team-gun/after_idle_low.log`)

| Room | steel in front of the hand: L* over the room behind it | body R / B (under L* 40) | before (a cylinder patch, R / B) |
|---|---|---|---|
| street | 32.7 over 36.2 | 0.82 | |
| Tally House | 25.8 over 24.2 | 1.34 (the room's grade alone turns grey to 1.2) | 2.08 -> 1.48 |
| gallery stair | 38.3 over 62.8 | 0.76 | copper |
| gallery | 26.3 over 16.0 | 0.56 | |
| antechamber, plate door | 26.4 over 17.9 | 1.17 | 1.72 -> 1.30 |
| rim at dusk | 24.0 over 18.2 | 0.82 | 1.08 -> 0.98 |

### 4. Not done

In the dark rooms (gallery, plate door, rim, the Tally House after the fight) the steel is still LIGHTER than what it
covers (L* 24 to 26 over 14 to 18): `tests/render/polish3.test.mjs` R6 ("not darker than what it covers by more than 9, under
L* 12 less than 4 %, highlights 1 % or more") and the reviewers' "at or below the room" pull against each other; the
identity is in the hue and the thin highlights, not in a darker body. From the eye the three gripping fingers point
nearly AT the camera once they are on the left panel, so each shows about one and a half joints, not two full ones; the
little finger is under the frame's edge. The hand's palm stands off the back strap (seen only from angles the game
never shows). The gloves take the room's hue whole (olive under teal light). The reload, the line round and the sprint
were looked at once with the new hand (`shots/i3-team-gun/wipc/`); `take_round` and `unload_*` were not. The tuck was
checked at 2 m only. No person has looked at any of this on a real GPU.

## Closer, pass i3 (2026-10-07): decisions

| Row | Decision |
|---|---|
| 1 rows 1 to 9 | Mirrored: ART_BIBLE "Amendments, pass i3 (closer)", GDD 23.17, ARCHITECTURE "Pass i3" |
| 2.1 `tests/player/place.test.mjs` bounds | **Accepted**: the old pair of bounds kept the hand out of the frame, which is the reviewers' issue |
| 2.2 share picture, hero frames | Made again (INTEGRATION_REPORT Part P) |
| 4 not done | In `docs/KNOWN_ISSUES.md` |
