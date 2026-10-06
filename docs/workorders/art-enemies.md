# Work order: `art-enemies`

Phase 3 (production, round 1). Manifest owner name: **`enemies`** (art). You are a fresh
agent: this file plus the documents it names are everything you need.

> **Split (README section 1.1): this order is built by two builders at once. You are one of them.** Ownership is by file; the two halves share no file and import nothing from each other.
>
> | Piece | You build | You own (files) |
> |---|---|---|
> | **`art-enemies-bider`** | `enemy_bider` (4.1) and the three static Bider meshes `bider_seated_static`, `bider_table_static`, `bider_felled_static` (4.2) | `blender/enemies/enemy_bider.py`, `bider_seated_static.py`, `bider_table_static.py`, `bider_felled_static.py` (the manifest's `source` paths) and any helper named `blender/enemies/bider*.py` (`bider_build.py`); `tests/art_enemies/bider*`; `shots/art-enemies-bider/`; `docs/requests/art-enemies-bider.md` |
> | **`art-enemies-transit`** | `enemy_transit` (4.3) and every other asset in the order: `proj_stake` (4.4) | `blender/enemies/enemy_transit.py`, `proj_stake.py` (one file per asset) and any helper named `blender/enemies/transit*.py`; `tests/art_enemies/transit*` and per-asset tests (`stake*`); `shots/art-enemies-transit/`; `docs/requests/art-enemies-transit.md` |
>
> - **Build by id**, never `--only enemies` (it would run the other builder's half-written scripts): `node tools/build-assets.mjs --only enemy_bider,bider_seated_static,bider_table_static,bider_felled_static` / `--only enemy_transit,proj_stake`.
> - **Previews**: pass `--piece art-enemies-bider` / `--piece art-enemies-transit` to `tools/preview-asset.mjs` (its default folder, `shots/art-enemies/`, is nobody's now). Wherever this order says `shots/art-enemies/` or `docs/requests/art-enemies.md`, read your piece's folder and file.
> - **Tests are named by the prefix** (section 5 lists them unsplit): bider → `bider_check`, `bider_knot_visible`, `bider_poses`, `bider_silhouette`, `bider_viewer` (`.test.mjs`); transit → `transit_check`, `transit_silhouette`, `transit_viewer`, `stake_check`. Each `*_check` runs `check-glb` on its own ids only. Each `*_silhouette` renders **its own** creature and compares it against every other creature whose shipped file is final (a placeholder is skipped), and writes its own greyscale weak-point frame; there is no shared silhouette test. `tests/art_enemies/index.js` is an unchanged copy of `tests/core/index.js`: whoever arrives first creates it, nobody edits it. Run one file while iterating: `node --test tests/art_enemies/bider_poses.test.mjs`.
> - **Evidence** follows the asset: `bider_*`, `file_of_six`, `bider_table_row` → bider; `transit_*`, the stake → transit; each piece makes its own `silhouettes.png` and `weakpoints_grey.png`.
> - **Definition of done** (section 6) is per piece: your ids build from clean; your triangle, bone and clip lines; your half of the 0.8 MB (bider and its statics 0.55 MB, transit and stake 0.25 MB); `asset-status --owner enemies` lists both halves, and you answer for your rows.

Read first: `CLAUDE.md`, `docs/PLAN.md`, `docs/workorders/README.md` (**section 4, "Read first":
`docs/FOUNDATION_REPORT.md` sections 2 to 4, 6, 8c and 9, and `blender/lib/README.md`**: the
build driver, the viewer and the checks as they are now); `docs/ART_BIBLE.md`
sections 1, 2, 4.4, 4.5, 5, **6 (6.1, 6.2 and the knot paragraph are your design)**, 7.6,
12 D; `docs/GDD.md` 7 (intro), **7.1, 7.2** (state machines: every clip serves a state), 16
(colour and shape law), 20 (what is out); `docs/ARCHITECTURE.md` 1.1, 7.2, 7.3;
`docs/research/art-tone.md` 1.5 and 1.6 (the homage blocklist: read it before modelling the
hood); then `blender/template_asset.py`, `blender/lib/` docstrings (`rig.py`, `anim.py`,
`knot.py`), and `docs/research/blender-pipeline.md` sections 6, 7 and "Traps".

## 1. Mission

The two things the player shoots most. The **Bider** is the emotional centre of the stage:
a townsperson of Plenty who hooded themselves as a courtesy and sat down to wait. It must
read as a person (tired, patient, clothed, no face), never as a monster or a scarecrow, so
that shooting the knot on its hood and watching it **sit down and breathe** is the best
thing the gun does (pillar 1) and the story's turn (pillar 3). `sit_down` is, in the art
bible's words, the best clip in the game. The **Transit** is a surveying instrument that
never stopped sighting: fussy, precise, three-legged, with one eye that is its weak point
and its tell. Both must be identifiable from a 48 px black silhouette, readable without
colour, and cost one draw call each (pillar 5: up to six Biders alive, 2 500 triangles each).

## 2. Owned files (exclusive)

```
blender/enemies/**           enemy_bider.py  bider_seated_static.py  bider_felled_static.py  bider_table_static.py
                             enemy_transit.py  proj_stake.py  + your helper modules (a shared bider_build.py is expected)
tests/art_enemies/**         by file prefix (the Split box)
shots/art-enemies-bider/**  shots/art-enemies-transit/**
docs/requests/art-enemies-bider.md  docs/requests/art-enemies-transit.md
public/assets/enemies/{enemy_bider,bider_seated_static,bider_felled_static,bider_table_static,enemy_transit,proj_stake}.glb
                             written only by `node tools/build-assets.mjs --only <your ids>`
```

Each builder owns the Bider half or the Transit half of that list, as the Split box says.

Not yours although it lives in `public/assets/enemies/`: `enemy_tamper`, `tamper_cold_static`
(`art-boss`). Never edit `blender/lib/`, `design/*.json`, `tools/`, `src/`.

## 3. Rules (short form; ARCHITECTURE 7.2 is the full text)

- One script per asset; `node tools/build-assets.mjs --only <your ids>` (the Split box). Deterministic.
- **The pipeline as built** (FOUNDATION_REPORT 4, `blender/lib/README.md`): nothing ships until the build passes (`FAILED <id>` leaves the previous files); the Blender log is `blender/export/.logs/<id>.log`, and bake warnings (`WARNING <object>: N faces … baked dark from end to end`) are **only** there or under `--verbose`: read it. **Draw calls are counted one per mesh per material** (two meshes sharing a material are two; variant nodes count once). `node tools/build-assets.mjs --reset <id>` puts the placeholder back once your script is gone.
- **Judging colour**: the viewer and every `<id>_game.png` show linear values up to 0.8 exactly as authored, and the game's renderer uses the same curve (README ruling 15), so a palette colour in a viewer frame is the colour in the file. The viewer is unlit: `&mood=L1` (any `MoodId`) and `&ground=sand` add a flat mood tint (fog and sky colour, one ambient + key), `&shot=1` hides the panel, the bar and the UI log, `&dist= &yaw= &pitch=` place the camera. A `&shot=1` frame without `&dist=` is fitted (the asset's bounding box fills 90 % of the frame); pass `&dist=` for a close-up of a detail.
- **Reading and posing bones in a viewer test** (`sandbox/viewer.html?asset=<id>`, any asset page): `__dbg.ext.viewer.pose(names?)` → `{ <name>: { pos, quat, scale, local: { pos, quat, scale }, isBone } }` for the given nodes or bones (default: every manifest node and bone), in **asset space** (game metres, +Y up, as the manifest's `nodePos`), with the clip pose and every override applied; `__dbg.ext.viewer.setBone(name, { rot: [xDeg, yDeg, zDeg], scale })` turns or scales a **code-driven** bone on top of the clip's pose (after the mixer, until changed; `null` clears it) and returns its pose; `__dbg.ext.viewer.setClip(name, t01)` holds a clip at a fraction of its length without reloading (`''` = the rest pose); the URL form is `&clip=<name>&t=<0..1>&shot=1`. `__dbg.ext.viewer.project('<node>')` → `{ across, up, inFront }`. (The raw three.js objects are under `__dbg.ext.core.ctx().scene.dynamic.getObjectByName('viewer_holder')`, or `scene.viewModel…` in first person, if you need more.)
- Asset frame: root named by the asset id at the origin; **origin at the feet (base centre), facing +Z** (game space; Blender −Y), +Y up; rest pose = first frame of the idle clip.
- **One skinned mesh, one material (`m_prop`), one draw call** per creature. UV0 points each face at a `tx_palette` cell (`manifest.palette_uv`), emissive faces at a `tx_palette_emis` cell. No images in the GLB. `COLOR_0` = tint × AO × gradients (height ramp 0.75 → 1.10; a dust skirt from the knee down on the Bider).
- **Emissive is a face mapped to an emissive cell, never a vertex colour.** Knot lobes: albedo husk grey `#8A8A92`, violet (`violet`, `violet_core`) in the emissive cell only, so a burst knot is the same lobes with the emissive switched off by the runtime. The 1.5 Hz pulse is a shader term, not animation.
- Bones and nodes exactly as listed; `crown`, `hand_socket_r`, `lens`, `stake_muzzle` are **empties** parented to bones. Every vertex weighted (`rig.auto_weights` raises otherwise; the Transit is rigid: one weight per vertex).
- Clips: NLA tracks named exactly, 30 fps, from frame 0, authored length = nearest whole frame to the listed seconds, loops with identical first and last frames, **root motion baked out** (the `root` bone stays at the origin horizontally: code moves the enemy; vertical motion of the body is on `hips`).
- Thin geometry: ≥ 2 mm per metre of viewing distance. Transit legs are **0.13 m thick**; cord ends, the sighting vane and stake rods are fat enough for 30 m (≥ 6 cm) or carry a justified `thin_ok`.
- **Homage, not copy (hard rules).** No face, ever: no mouth, no stitched features, no eyes beyond two slits. **Not a scarecrow**: no straw, pole, hat, burlap or sack texture, stitched mouth or spread arms. No gore, no blood: Biders fold, machines stop. Nothing from `art-tone.md` 1.5 / 1.6.
- Priority: every asset is P0. Clips: finish all P0 clips of both creatures, then P1 (`sit_breathe`; Transit `idle_scan`, `flinch`), then P2 (`circle_strafe` → fallback `run`; `falter` → `stumble`; `sidestep_l`, `sidestep_r` → `walk`). **A P2 clip may ship as a copy of its fallback under its own name** (GDD 20.1 row 11) and must still exist with the right name and length.

## 4. Deliverables

### 4.1 `enemy_bider` — 2 500 tris, 22 bones, 18 clips

**Bones (exactly):** `root`, `hips`, `spine`, `chest`, `neck`, `head`, `shoulder_l/r`, `upperarm_l/r`, `forearm_l/r`, `hand_l/r`, `thigh_l/r`, `shin_l/r`, `foot_l/r`, `coat_tail_l/r`.
**Empties:** `crown` (child of `head`: the centre of the knot and of its hit sphere, radius 0.22 m in game), `hand_socket_r` (child of `hand_r`: where the kneeler's cup rides).

**Read at 30 m: a low forward-leaning dark wedge with a pale head.**
- [ ] Proportions: 1.7 m upright, **1.4 m at the stoop (the default pose)**, shoulders narrow 0.5 m, arms 0.78 m (a hand's length too long), hood slightly too large 0.34 × 0.38 m. The stoop pushes the crown and its knot toward the player.
- [ ] Three colour blocks only. **Hood: `linen` `#D8CDB4`** (the palest Frontier value). **Body: `workcloth` dark** (`#5E4636` / `#7A5B45`): a long work coat or apron to the knee, sleeves, trousers, converging on ground colour from the knee down. **Boots and hands: `leather` and wrapped `linen` strips**: hands are mitten shapes bound in strain-cloth (no fingers, no skin). Neck: a `cord` tie, three turns, two hanging ends 0.12 m.
- [ ] **The hood**: a sewn well-linen bag with a flat seam over the crown and a hem at the collarbone: soft, clean, made with care. Two short horizontal slits 45 × 8 mm, 70 mm apart, each with a violet pinprick deep inside (an emissive quad set back 15 mm so it disappears off-axis).
- [ ] **The crown knot** (`knot.build_knot(0.16, 'clustered')`): visual radius 0.16 m, forward of the crown seam, a clustered seven-lobed dark collar, a near-white core ≥ 40 % of its diameter; centred on `crown`. It must be **visible from the front in every frame of `run`, `lunge_windup` and `circle_strafe`** (test below).
- [ ] Coat tails on `coat_tail_l/r` (no cloth simulation). Per-instance variation is done by code (four tints, ±5 % hood scale on `head`): keep `head` scaling clean (the hood and knot weighted wholly to `head`).

**Clips (GDD 7.1 durations; ART_BIBLE 7.6 content). Personality: tired, not feral: people who have been sitting four days.**

| Clip | Loop | s | P | What happens |
|---|---|---|---|---|
| `idle_stoop` | yes | 2.0 | 0 | stooped, weight shifting, hands slack, slow breath |
| `run` | yes | 0.62 | 0 | a heavy forward fall caught by each step; arms trail; **head level and still** (the knot is a steady target) |
| `circle_strafe` | yes | 0.8 | 2 (fallback `run`) | side-step, hood always toward the player |
| `lunge_windup` | no | 0.5 | 0 | sinks 0.25 m, arms draw back, **head dead still for the whole 0.5 s** |
| `lunge` | no | 0.35 | 0 | both arms thrown ahead (the 2.2 m of travel is code's) |
| `lunge_recover` | no | 0.6 | 0 | stumbles to a stop, slow turn of the hood |
| `stumble` | no | 0.4 | 0 | one broken step, a hand out |
| `falter` | yes | 1.0 | 2 (fallback `stumble`) | backing, hands half raised, hood turning side to side |
| `die_back` | no | 0.9 | 0 | folds at the waist and is carried back; **ends on its side with the hood turned away**: no face-up pose. Its last frame is the pose of `bider_felled_static` |
| `sit_down` | no | 0.9 | 0 | **the best clip in the game**: two failing steps, the knees give, it sits back on its heels, **the hands come down flat on the ground**, the head lifts a little: relief. Its last frame is the pose of `bider_seated_static` and the first frame of `sit_breathe` |
| `sit_breathe` | yes | 4.0 | 1 | seated on heels, hands flat, slow breath, head slightly raised |
| `sit_table` | yes | 4.0 | 0 | on a chair (seat 0.45 m), **hands flat on a table top at 0.76 m**, breathing; the pose source of `bider_table_static`. The root is at the floor under the chair |
| `rise_from_seat` | no | 1.2 | 0 | from the `sit_table` pose: hands press the table, the chair scrapes back, stands into the stoop |
| `climb_out` | no | 1.2 | 0 | two hands over a 1.2 m edge, a knee, up (out of a floor grate or over the bore kerb; root at the top edge's ground level, the body starts below it) |
| `scoop_kneel` | yes | 2.4 | 0 | kneeling at a trough, scooping sand with a cup in the right hand and pouring it back |
| `kneel_to_stand` | no | 1.0 | 0 | sets the cup on the rim (**the hand is at rim height, 0.5 m, on frame 12**: code detaches the cup there), stands, turns |
| `queue_stand` | yes | 3.0 | 0 | standing in a file, **facing away** (the body is authored facing +Z as always; code turns it), weight on one leg, patient |
| `turn_about` | no | 1.5 | 0 | the hood turns first, then the shoulders, then the feet (ends facing the opposite way from its start, root yaw baked out: code applies the 180°) |

At rest (table, queue, kneeling) they are completely human: that is the unease.

### 4.2 Static derivatives (same build function, posed and decimated; `m_prop`, bake `AO`, instanced: one mesh, one material, no skin)

| id | Pose | Tris | Pivot | Notes |
|---|---|---|---|---|
| `bider_seated_static` | last frame of `sit_down` | 500 | ground contact | knot emissive **off** (grey husk), slits dark; **breath weight in UV1.x** (a second UV layer: 1 on the chest, falling to 0 elsewhere; UV1.y = 0) and mesh extra `breath: 1`, for the runtime's 2 mm, 0.25 Hz vertex-shader breath |
| `bider_felled_static` | last frame of `die_back` | 450 | ground contact | hood turned away; emissive off; about 1.5 × 0.35 × 0.6 m as it lies |
| `bider_table_static` | `sit_table` | 600 | the floor under the chair (seat) | **knot live but small** (emissive on); hands flat; breath weight in UV1.x, extra `breath: 1`. Nine instances with per-instance colour jitter by code. It must sit on `art-props`' `prop_chair` (seat 0.45 m, 0.45 × 0.45) at a table top 0.76–0.8 m high without clipping |

The breath weight is in **UV1.x**, not in vertex colour (ARCHITECTURE 7.2, ART_BIBLE 7.6): `COLOR_0` is the tint on `m_prop`, and UV1 is otherwise unused on `m_prop` assets and survives the optimiser. `code-render`'s breath shader reads it on meshes whose extra `breath` is 1. `bider_felled_static` has no breath (extra absent).

### 4.3 `enemy_transit` — 2 000 tris, 8 bones, 10 clips, rigid-skinned (one weight per vertex)

**Bones (exactly):** `root` (the hub), `head` (the drum), `leg_a_upper`, `leg_a_lower`, `leg_b_upper`, `leg_b_lower`, `leg_c_upper`, `leg_c_lower`.
**Empties:** `lens` (child of `head`: centre of the weak point, hit radius 0.17 m, and the origin of the sighting thread), `stake_muzzle` (child of `head`).

**Read at 30 m: tall, thin, three-legged, one round eye: a surveyor's level left standing in a field.**
- [ ] 1.9 m tall, stance 1.1 m. Three ceramic legs **0.13 m thick**, each of two segments (upper 0.95 m, lower 0.85 m), ending in a steel spike with a round ground-plate (hazard ochre on the feet), meeting at a small hub under the drum.
- [ ] Drum head 0.45 m across, 0.30 m deep, axis horizontal, graduated ring marks cast round its rim, **a folding sighting vane on top (a 0.25 m blade that breaks the round outline)**, a `livery` band (aqua **paint**, not emissive and not violet: only its eye is wrong), one cast plate on its side (`brand.maker_plate`).
- [ ] One lens 0.24 m across, deep in a dark bezel 0.05 m thick: `lens` dark glass (`#0E1418`, opaque) with a **violet core disc 0.10 m (emissive)**. Read at 30 m: a dark circle with a bright centre on a pale drum.
- [ ] A stake magazine under the drum: a short rack of three hot-tipped rods, visible so the projectile has a source.
- [ ] Colour: legs and drum `enamel` (stained lower third: `enamel_stain`); joints, feet and bezel `steel_dark`. Pellam language: exact, 20 mm bevels, no jitter.

| Clip | Loop | s | P | What happens |
|---|---|---|---|---|
| `idle_scan` | yes | 3.0 | 1 | the drum steps left, holds, steps right, holds (small exact steps, never a smooth pan); one leg re-seats |
| `walk` | yes | 0.9 | 0 | **three-beat gait, one leg at a time, the drum perfectly level**: it glides while the legs clack. One fixed clip, no IK |
| `emerge` | no | 1.2 | 0 | unfolds from a 1.1 m folded bundle: legs splay one, two, three, the drum rises |
| `plant` | no | 0.3 | 0 | three feet strike together, the drum settles 2 cm |
| `aim_hold` | yes | 0.6 | 0 | head dipped 12°, perfectly still but for a 1 mm tremor in the vane |
| `fire` | no | 0.25 | 0 | the drum recoils 6 cm, a rod leaves the rack |
| `flinch` | no | 0.25 | 1 | the drum snaps 20° aside, one leg lifts |
| `sidestep_l`, `sidestep_r` | no | 0.4 | 2 (fallback `walk`) | a crab step (the 1.5 m of travel is code's) |
| `die_fold` | no | 1.0 | 0 | a dropped tripod: one leg slides out, the hub drops, the drum tips forward and lands **lens-down**; holds its last pose (the body stays in the world) |

### 4.4 `proj_stake` — 48 tris (2 × 24), instanced, pivot at the **tip**
- [ ] A rod 0.6 m × 0.04 m along **−Z from the tip** (the tip is the origin and points +Z, the direction of flight), steel, the tip third in `flame` emissive with a white core line. Variants: `stake_hot`, `stake_cool` (tip in dull orange `#B5522B`, non-emissive). Fat enough to read: if 0.04 m fails the thin rule at your chosen distance, add `thin_ok: 20` (it is drawn with a 1 m additive trail by VFX while in flight).

## 5. Tests and evidence

`tests/art_enemies/*.test.mjs` (`node --test tests/art_enemies/`):

- [ ] `check.test.mjs`: `check-glb` on your six ids (bones, nodes, 18 + 10 clips with lengths within a frame, loops closed, no root translation in X/Z, ≤ budgets, 1 draw call each); `asset-status --require=0 --owner enemies` exits 0 (P2 clips may be fallback copies).
- [ ] `knot_visible.test.mjs`: for every 3rd frame of `run`, `lunge_windup`, `circle_strafe`, a camera 10 m in front at eye height 1.65 m sees the `crown` point unoccluded by the Bider's own mesh, and the crown's world height stays within ±0.06 m across `run` and ±0.02 m across `lunge_windup`.
- [ ] `poses.test.mjs` (bones are read with `__dbg.ext.viewer.pose` / `setClip`, section 3): last frame of `sit_down` = first frame of `sit_breathe` (every bone within 1 mm / 0.5°); `bider_seated_static`'s bounding box matches that pose within 3 cm, `bider_felled_static` matches `die_back`'s last frame, `bider_table_static` matches `sit_table`; in `sit_table` both `hand_l/r` are at y 0.76–0.82 m; in `kneel_to_stand` `hand_socket_r` is at y 0.50 ± 0.05 m on frame 12; `die_back` ends with the hood's front normal pointing away from +Z or downward (no face-up frame in the last 10 frames).
- [ ] `silhouette.test.mjs`: renders Bider (`idle_stoop`), Transit (`aim_hold`) as black shapes 48 px tall on white from the front and the side (plus `art-boss`' Tamper if its GLB is final, else the placeholder is skipped) and asserts the pairwise pixel IoU after alignment is under 0.6; also writes a **greyscale** frame of each weak point: the knot core / lens core must be ≥ 60 L* brighter than its bezel.
- [ ] `viewer.test.mjs`: every asset and every clip through `sandbox/viewer.html?asset=…&clip=…&shot=1` with no console error.

`shots/art-enemies/` (open every one): `<id>_sheet.png` × 6; one strip per clip (5 frames; **`sit_down` and `die_back` at 8 frames**); `bider_hood_closeup.png` (front, three-quarter, top: slits, seam, tie, knot); `bider_at_30m.png` and `transit_at_30m.png` (in the viewer under the L1 mood on sand-coloured ground: `sandbox/viewer.html?asset=enemy_bider&dist=30&pitch=3&mood=L1&ground=sand&shot=1`; the mood look is a flat tint, enough for "reads at 30 m against the L1 haze": the pale hood / the dark lens must read); `bider_table_row.png` (nine statics on chairs at a table mock at the seat spacing 1.8 m); `silhouettes.png`; `weakpoints_grey.png`; `file_of_six.png` (six instances with tint and scale variation).

## 6. Definition of done (measured)

1. `node tools/build-assets.mjs --only <your ids>` succeeds from clean (the Split box).
2. Triangles ≤ 2 500 / 500 / 450 / 600 / 2 000 / 48; one draw call each; 22 and 8 bones. Numbers reported.
3. All P0 clips final for both creatures (Bider 15 P0, Transit 6 P0); P1 and P2 status stated clip by clip.
4. Download share: six GLBs ≤ 0.8 MB total after optimise (animation dominates: report the split).
5. ART_BIBLE section 12 items 20–24 marked PASS / FAIL with the file looked at: silhouettes distinct at 48 px; pale hood on dark body; knot visible in the three locomotion clips; no face; no scarecrow feature; weak points read in greyscale; `sit_down` ends hands-flat and reads as relief; `die_back` shows no face.
6. A non-builder check of the hood against `art-tone.md` 1.5 / 1.6 is requested in your report (the critic does it): list what you did to stay clear.

## 7. Non-goals

Tamper, Windlass, canister (`art-boss`); AI, hit volumes, movement, the head-turn of the
watcher (`code-enemies` rotates `head` by code); the knot burst, motes, the aim star and the
dashed sighting thread, stake trails (`code-render`); the cup (`art-props`); cloth
simulation; facial anything; LODs; ragdolls.

## 8. Dependencies

- `code-enemies` is written against the placeholders with your final bone, node and clip names: it reads `crown`, `hand_socket_r`, `lens`, `stake_muzzle`, rotates `head` (the watcher, ±60°), scales `head` ±5 %, and plays clips by name with the manifest durations. Do not rename; do not add or remove bones.
- `code-render` lights you (`m_prop`: zone ambient + key), runs the knot pulse and the per-instance emissive scale, and the breath shader on the statics.
- `art-props`: `prop_chair` (seat 0.45 m), `prop_tally_table` (top 0.76–0.8 m), `prop_trough_pump` (rim 0.5 m), `prop_cup_tin`, `prop_grate` (1.2 × 1.2 m opening for `climb_out`). Pose against these numbers; check against their raw exports in `blender/export/props/` when final.
- `art-boss` builds the Tamper and uses the same `knot.py`; the silhouette test compares against it when present.
