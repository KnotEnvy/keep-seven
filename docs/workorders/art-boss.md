# Work order: `art-boss`

Phase 3 (production, round 1). Manifest owner name: **`boss`**: the two Pellam machines (the
Windlass and the Tamper), the cold Tamper and the canister. You are a fresh agent: this file
plus the documents it names are everything you need.

> **Split (README section 1.1): this order is built by two builders at once. You are one of them.** Ownership is by file; the two halves share no file and import nothing from each other.
>
> | Piece | You build | You own (files) |
> |---|---|---|
> | **`art-boss-windlass`** | `boss_windlass` (4.1) and every asset in the order that is not the Tamper: `proj_canister` (4.3) | `blender/boss/boss_windlass.py`, `proj_canister.py` (the manifest's `source` paths, one file per asset) and any helper named `blender/boss/windlass*.py`; `tests/art_boss/windlass*` and per-asset tests (`canister*`); `shots/art-boss-windlass/`; `docs/requests/art-boss-windlass.md` |
> | **`art-boss-tamper`** | `enemy_tamper` (4.2) and `tamper_cold_static` (4.4) | `blender/boss/enemy_tamper.py`, `tamper_cold_static.py` and any helper named `blender/boss/tamper*.py`; `tests/art_boss/tamper*`; `shots/art-boss-tamper/`; `docs/requests/art-boss-tamper.md` |
>
> - **Build by id**, never `--only boss` (it would run the other builder's half-written scripts): `node tools/build-assets.mjs --only boss_windlass,proj_canister` / `--only enemy_tamper,tamper_cold_static`.
> - **Previews**: pass `--piece art-boss-windlass` / `--piece art-boss-tamper` to `tools/preview-asset.mjs` (its default folder, `shots/art-boss/`, is nobody's now). Wherever this order says `shots/art-boss/` or `docs/requests/art-boss.md`, read your piece's folder and file.
> - **Tests are named by the prefix** (section 5 lists them unsplit): windlass → `windlass_check`, `windlass_geometry`, `windlass_clearance`, `windlass_viewer`, `canister_check` (`.test.mjs`); tamper → `tamper_check`, `tamper` (the vents, the wind-up height, the size), `tamper_viewer`. Each `*_check` runs `check-glb` on its own ids only. `tests/art_boss/index.js` is an unchanged copy of `tests/core/index.js`: whoever arrives first creates it, nobody edits it.
> - **Evidence** follows the asset: `windlass_*`, the canister → windlass; `tamper_*` → tamper.
> - **Definition of done** (section 6) is per piece: your ids build from clean; your triangle, draw-call and clip lines; your half of the 0.6 MB (Windlass and canister 0.35 MB, the two Tampers 0.25 MB); item 6 of section 6: the vent hinge axis and sign are the tamper builder's to state, the `mouth_n` rest frame and the lamp index map the windlass builder's. `asset-status --owner boss` lists both halves; you answer for your rows.
> - Both halves use `blender/lib/knot.py` and `brand.py` for the shared Pellam parts; neither imports the other's helper.

Read first: `CLAUDE.md`, `docs/PLAN.md`, `docs/workorders/README.md` (**section 4, "Read first":
`docs/FOUNDATION_REPORT.md` sections 2 to 4, 6, 8c and 9, and `blender/lib/README.md`**: the
build driver, the viewer and the checks as they are now); `docs/ART_BIBLE.md`
sections 1, 2, 4.4, 4.5, 5 (5.5, 5.6: Pellam language and the mark), **6 (the knot, 6.3,
6.4)**, 7.6 (Tamper), **7.7 (Windlass)**, 12 D; `docs/GDD.md` **7.3** (Tamper states) and
**8** (the boss: body, arena, movement, hit rule, phases: every bone and clip serves a rule
there), 16; `docs/ARCHITECTURE.md` 1.1, 7.2, 7.3, 7.6 (the Windlass row: **the manifest's
node list wins over the art bible**); then `blender/template_asset.py`, `blender/lib/`
docstrings (`rig.py`, `anim.py`, `knot.py`, `brand.py`), `docs/research/blender-pipeline.md`
sections 6, 7 and "Traps".

## 1. Mission

**The Windlass is the game's one idea made five metres across**: the player's cylinder seen
from the wrong end: a drum with a ring of six shuttered mouths hung over a bore that is the
seventh. It is the maker's mark, the HUD widget and the gun, at architectural scale, and the
first view of it (from a catwalk 8 m up, through a grille) must show "six in a ring, one
apart". Every part of it is a rule the player reads: a lamp beside each mouth that goes out
when it fires (she counts its cylinder), lids that swing aside like a loading gate, a guard
plate, two pawls, a 26-segment gauge. The **Tamper** is "something that was never anyone":
a walking pile-driver whose silhouette doubles in height before it slams and whose vent
lids make "open" readable from the side. Pillars 1 and 4 (the boss is a puzzle about the
cylinder), pillar 5 (8 000 triangles and **3 draw calls** for a boss that fills the frame).

## 2. Owned files (exclusive)

```
blender/boss/**              boss_windlass.py  enemy_tamper.py  tamper_cold_static.py  proj_canister.py  + helper modules
tests/art_boss/**            by file prefix (the Split box)
shots/art-boss-windlass/**  shots/art-boss-tamper/**
docs/requests/art-boss-windlass.md  docs/requests/art-boss-tamper.md
public/assets/boss/{boss_windlass,proj_canister}.glb
public/assets/enemies/{enemy_tamper,tamper_cold_static}.glb     written only by `node tools/build-assets.mjs --only <your ids>`
```

Each builder owns the Windlass half or the Tamper half of that list, as the Split box says.

Never edit `blender/lib/`, `design/*.json`, `tools/`, `src/`, or another owner's files
(`public/assets/enemies/` also holds `art-enemies`' files: touch only your two).

## 3. Rules (short form; ARCHITECTURE 7.2 is the full text)

- One script per asset; `node tools/build-assets.mjs --only <your ids>` (the Split box). Deterministic.
- **The pipeline as built** (FOUNDATION_REPORT 4, `blender/lib/README.md`): nothing ships until the build passes (`FAILED <id>` leaves the previous files); the Blender log is `blender/export/.logs/<id>.log`, and bake warnings (`WARNING <object>: N faces … baked dark from end to end`) are **only** there or under `--verbose`: read it. **Draw calls are counted one per mesh per material** (two meshes sharing a material are two; variant nodes count once). `node tools/build-assets.mjs --reset <id>` puts the placeholder back once your script is gone.
- **Judging colour**: the viewer and every `<id>_game.png` show linear values up to 0.8 exactly as authored, and the game's renderer uses the same curve (README ruling 15), so a palette colour in a viewer frame is the colour in the file. The viewer is unlit: `&mood=L1` (any `MoodId`) and `&ground=sand` add a flat mood tint (fog and sky colour, one ambient + key), `&shot=1` hides the panel, the bar and the UI log, `&dist= &yaw= &pitch=` place the camera. A `&shot=1` frame without `&dist=` is fitted (the asset's bounding box fills 90 % of the frame); pass `&dist=` for a close-up of a detail.
- **Reading and posing bones in a viewer test** (`sandbox/viewer.html?asset=<id>`, any asset page): `__dbg.ext.viewer.pose(names?)` → `{ <name>: { pos, quat, scale, local: { pos, quat, scale }, isBone } }` for the given nodes or bones (default: every manifest node and bone), in **asset space** (game metres, +Y up, as the manifest's `nodePos`), with the clip pose and every override applied; `__dbg.ext.viewer.setBone(name, { rot: [xDeg, yDeg, zDeg], scale })` turns or scales a **code-driven** bone on top of the clip's pose (after the mixer, until changed; `null` clears it) and returns its pose; `__dbg.ext.viewer.setClip(name, t01)` holds a clip at a fraction of its length without reloading (`''` = the rest pose); the URL form is `&clip=<name>&t=<0..1>&shot=1`. `__dbg.ext.viewer.project('<node>')` → `{ across, up, inFront }`. (The raw three.js objects are under `__dbg.ext.core.ctx().scene.dynamic.getObjectByName('viewer_holder')`, or `scene.viewModel…` in first person, if you need more.)
- **Sockets ride the bones the placeholders put them on** (`blender/placeholders.py` `RIGS`, held by `tests/pipeline/placeholders.test.mjs`; the manifest has no `nodePos` / `nodeParent` for these yet): Tamper `vent_chest_knot` (0, 1.70, 0.45) and `vent_back_knot` (0, 1.60, −0.45) on `barrel`, `ram_head` (−0.80, 0.45, 0.35) on `arm_r_ram`, `foot_spark` (−0.38, 0.02, 0.22) on `leg_r_foot`; Windlass `knot_n_hit` on the r = 1.7 ring round the hub (0, 4.0) at z 2.8 and `thread_anchor_n` on the same ring at z 3.1, both on `drum_spin`; `pawl_l_hit` / `pawl_r_hit` (∓1.6, 6.0, 3.95), `muzzle_top` (0, 5.7, 3.1) and `canister_muzzle` (0, 4.0, 3.1: **a guess of the pipeline's, the documents give no number**; put it where your canister mouth is and state the position in your report) on `arm_yaw`. Where section 4 gives a different number, section 4 wins; say so in your requests file.
- Frames: root named by the asset id at the origin, **front +Z**, +Y up (game space). Tamper: origin at the feet. Windlass: origin on the **bore axis at chamber floor level, arm heading +Z at yaw 0**.
- **Rigid skinning**: each asset is one mesh (`m_prop`) with exactly one weight per vertex, on the bones listed; lamp sets are separate `m_emis` meshes whose quads are weighted to (or parented to) the bone they ride; lamp *i* has UV1.x = (i + 0.5)/N; mesh extra `lampCount`. UV0 → `tx_palette` cells; emissive faces → `tx_palette_emis` cells; no images in a GLB. `COLOR_0` = tint × AO × gradients, with `enamel_stain` streaks below seams and fasteners.
- Gameplay positions are **empties** (never mesh nodes), named exactly, parented to the bone stated.
- **Never key a `codeDriven` bone** (Windlass: `arm_yaw`, `drum_spin`, `knot_1…6`, `pawl_l`, `pawl_r`). Clips: NLA tracks named exactly, 30 fps, from frame 0, nearest whole frame to the listed seconds, loops closed, no root translation in X/Z.
- Knots come from `blender/lib/knot.py` (`collar='hex'`): husk-grey lobes, violet only in the emissive cell, white core ≥ 40 % of the diameter, dark bezel. In the bore chamber knots read by **core, collar and pulse, not hue**.
- Pellam language: orthogonal + true circles, radii 0.15 / 0.3 / 0.6 m, 20 mm bevels, no jitter; livery; one cast plate (`brand.maker_plate`); hazard = one broad ochre diagonal; asset numbers `4-nnn` (never 19, 99, or added sevens).
- Thin geometry: cables 0.12 m; gauge segments 0.30 × 0.10 m; nothing under 6 cm that is seen at 30 m.
- No faces, no eyes (the Tamper has a low sensor cowl, no head); nothing from `docs/research/art-tone.md` 1.5 / 1.6.
- Priority: `boss_windlass`, `enemy_tamper`, `proj_canister` are **P0**; `tamper_cold_static` is **P2** (GDD 20.1 row 1). Clips: all P0 first (Windlass 8, Tamper 10), then P1 (`idle_sway`; `flinch_plate`, `pound_bulkhead`).

## 4. Deliverables

### 4.1 `boss_windlass` — 8 000 tris, **3 draw calls** (`body_mesh` + `boss_lamps` + `gauge`), 26 bones

**Bones (exactly):** `root`, `arm_yaw`, `drum_spin`, `mouth_1`…`mouth_6`, `knot_1`…`knot_6`, `guard`, `guard_piece_1`…`guard_piece_5`, `pawl_l`, `pawl_r`, `cable_a`, `cable_b`, `cable_c`.
**Empties (exactly):** `knot_1_hit`…`knot_6_hit` (hit-sphere centres, r 0.45 in game, children of `drum_spin`, one at each mouth's knot: they must not move when a lid opens), `pawl_l_hit`, `pawl_r_hit`, `muzzle_top` (the firing position at the top mouth, child of `arm_yaw`: it does **not** spin), `canister_muzzle` (child of `arm_yaw`), `thread_anchor_1`…`thread_anchor_6` (on the mouths, children of `drum_spin`).
**Meshes (exactly):** `body_mesh` (`m_prop`), `boss_lamps` (`m_emis`, lamp set of 14), `gauge` (`m_emis`, lamp set of 26).

| Bone / part | What it is | Local dimensions and position (metres; y up, z along the arm heading) | Tris |
|---|---|---|---|
| `arm_yaw` | the gantry arm; pivot on the axis; code rotates it about Y to six indexes | a box-section steel arm 0.8 × 1.0 m from the ring girder at y 12.5 down and out to the drum hub at **(0, 4.0, 2.0)**; carries the gauge housing on its outer face; **the fixed firing-position pawl over the top mouth is plain geometry (0.5 m, 80 tris) weighted to this bone, not a node** | 1 300 |
| `drum_spin` | the drum; child of `arm_yaw`; pivot at the hub; spin axis local +Z | **5.0 m across, 2.2 m deep**, face plane at z = 3.1, face vertical; **six cast flutes round the rim and back: fluted like the revolver's cylinder, same count, same proportions**; six mouths at **1.7 m radius, each 0.9 m across**, in `steel_dark` bezels; **mouth 1 at the top at spin 0, numbered clockwise as seen from the front** | 2 600 |
| `mouth_1…6` | swing lids, children of `drum_spin`; pivot on the mouth's rim (outboard side) | ceramic lid 0.96 m across, 0.08 thick; shut = flush with a 20 mm shadow gap; open = swung 110° aside "like a loading gate". **All six bones share one local rest frame** (same local axes relative to their mouth) so the clip authored on `mouth_1` retargets by renaming tracks | 120 each |
| `knot_1…6` | the knot in each mouth; child of `drum_spin`; **code-driven** (code squashes the lobe cluster when hit) | visual radius 0.38 m, hexagonal collar, set 0.3 m behind the face so the lid's shadow frames it; its white core is a lamp in `boss_lamps` | 180 each |
| `guard`, `guard_piece_1…5` | the ceramic guard plate, child of `arm_yaw` (does not spin); five pre-cut sectors that ride `guard` until `guard_shatter` | disc 4.6 m across, 0.12 thick, `enamel` with one broad `hazard` diagonal and a 0.4 m geometry `4`; parked above the drum at rest | 500 |
| `pawl_l`, `pawl_r` | the pawl knots on the arm; **code-driven** | at **(∓1.6, 6.0, 3.95)**: 3.2 m apart, 6 m up; knot radius 0.30 on hex plates with a brass lamp beside each | 200 each |
| `cable_a/b/c` | haul cables from the drum back down into the bore | 0.12 m thick, about 9 m each | 60 each |
| `boss_lamps` | lamp set, **14**: indices **0–5** the lamps beside mouths 1–6 (outboard at 2.3 m radius, brass bezel 0.22 m, aqua-white disc); **6–11** the knot cores 1–6; **12, 13** the cores of `pawl_l`, `pawl_r` | lamp quads ride their bones (0–5 and 6–11 on `drum_spin` / `knot_n`; 12–13 on the pawls) | 14 × 30 |
| `gauge` | lamp set, **26**: the health ladder on the arm housing | 26 aqua-white segments 0.30 × 0.10 m, **indices 0–25 bottom to top, in groups of 10 / 10 / 6 separated by two wider gaps**; rides `arm_yaw` | 110 |

In plan the drum occupies 0.9 to 3.1 m out from the axis along the heading and 2.5 m to either side, and hangs from 1.5 to 6.5 m above the floor: **its face stands over the kerb (r 3.0–3.6 m)** and must not intersect the kerb merlons (1.2 m high) or the ribs (r ≥ 7.5) at any `arm_yaw` or `drum_spin` angle. Colour: drum face `enamel`, flat and clean; rim and back `steel`; arm, pawl and gauge housing `steel`; cables `cable`; lamps aqua-white in `brass` bezels.

**Clips (9).** Motion personality: *procedure*: ratchets, hard stops, a 2° overshoot and settle; nothing drifts or eases gently.

| Clip | Loop | s | P | Keys which bones | What happens |
|---|---|---|---|---|---|
| `idle_sway` | yes | 4.0 | 1 | `root` only | the whole head sways 0.5° on its cables |
| `present` | no | 1.0 | 0 | `root` (+ `cable_*`) | the arm dips the drum 0.3 m toward the door and steadies: an acknowledgement |
| `mouth_open` | no | 0.2 | 0 | `mouth_1` only | the lid swings 110° about its rim pivot |
| `mouth_close` | no | 0.2 | 0 | `mouth_1` only | the reverse, with a 4° bounce |
| `guard_slide_on` | no | 1.2 | 0 | `guard` | the plate descends from its park and seats over the face with a 2 cm settle |
| `guard_drop` | no | 0.6 | 0 | `guard` | falls away below the drum on two links |
| `guard_raise` | no | 0.6 | 0 | `guard` | hauled back up over the face |
| `guard_shatter` | no | 1.0 | 0 | `guard_piece_1…5` | the plate breaks into its five sectors, which fall into the bore |
| `sag_death` | no | 3.0 | 0 | `root`, `cable_a/b/c` | drops 0.4 m, tilts 6°, `cable_c` goes slack, a last half-swing; holds |

### 4.2 `enemy_tamper` — 4 000 tris, 1 draw call, 12 bones, 12 clips

**Bones (exactly):** `root`, `pelvis`, `barrel`, `arm_r_upper`, `arm_r_ram`, `arm_l`, `leg_l_upper`, `leg_l_foot`, `leg_r_upper`, `leg_r_foot`, `vent_chest`, `vent_back`.
**Empties:** `vent_chest_knot`, `vent_back_knot` (hit-sphere centres, r 0.28 in game, children of `barrel`, **inside** the cavities behind the lids), `ram_head` (child of `arm_r_ram`: the slam impact point), `foot_spark` (child of `leg_r_foot`).

**Read at 30 m: wide, tall, lopsided: 2.4 m high, 1.6 m wide: a hunched pale barrel on short thick legs with one enormous right arm past its knee and one small left arm.**
- [ ] Barrel: a vertical ceramic drum 1.3 m across, 1.4 m tall, pitched 15° forward, top domed with a 0.3 m fillet, **no head**: a low sensor cowl 0.3 m wide, no eyes.
- [ ] Legs: two, 0.9 m, a thick thigh housing and a broad square foot 0.5 × 0.6 m each.
- [ ] Right arm: shoulder housing 0.5 m across, a casing 1.3 m long and 0.45 m thick, and the **ram**: a steel piston ending in a flat square tamping head 0.55 × 0.55 × 0.25 m with a `hazard` diagonal. Left arm 0.7 m: a three-fingered clamp, held tucked.
- [ ] **Vents**: chest and back louvred hatches 0.5 m across, **hinged at the top** (`vent_chest`, `vent_back`). Shut: four ceramic slats with a hairline of violet between them. Open: the lid swung **80° up**, a dark cavity with a hex-collar knot (visual radius 0.22 m, white core). The open lid is a visible awning in side silhouette. **Convention for code:** rest pose = shut; a rotation of **+80° about the bone's local X axis** = fully open. State the axis you used in your report.
- [ ] Colour: barrel and arm casing `enamel`, heavily stained; legs, ram shaft, joints `steel` / `steel_dark`; **the livery band round the barrel at chest height (10 cm, raised 5 mm) is violet emissive using the `violet_band` cell** (it turns aqua with `wrong_fade`); one cast plate on the left shoulder; an asset number stencilled on the back (`m_prop` palette faces, no `m_mask`: one material).
- [ ] **Vent keys (manifest rule):** key `vent_chest` and `vent_back` **only in `stagger`, `charge_stun` and `die`**. Everywhere else leave them unkeyed at rest: code opens them (slam wind-up, the first 0.5 s of the recover, each wind-up of the pounding, and both for the whole of `line_stagger`). Every other clip's pose must read correctly and not clip **with either lid fully open**.

**Clips (GDD 7.3).** Personality: *dutiful, heavy, tireless*; it never looks at the player.

| Clip | Loop | s | P | What happens |
|---|---|---|---|---|
| `idle` | yes | 2.4 | 0 | the ram rises 0.2 m and settles, a habit |
| `walk` | yes | 1.2 | 0 | a two-beat stamp, barrel rocking 4° side to side |
| `slam_windup` | no | 1.0 | 0 | the ram goes **fully overhead: the silhouette doubles in height** (the tell) |
| `slam` | no | 0.3 | 0 | straight down; the whole body drops 0.15 m with it; `ram_head` reaches the floor about 1.6 m in front of the feet |
| `slam_recover` | no | 1.5 | 0 | the ram is hauled out and back to the idle pose |
| `charge_windup` | no | 0.8 | 0 | cowl down, one foot scrapes back twice, the ram head dragged to the floor |
| `charge` | yes | 0.5 | 0 | a low fast stamp, ram dragging |
| `charge_stun` | no | 2.0 | 0 | impact, rocks back onto its heels, **`vent_back` flaps open and stays open** (keyed), ram buried |
| `stagger` | no | 1.5 | 0 | a step back, the ram drops, the barrel twists away. Also played at half speed (3.0 s) as `line_stagger` with code holding both lids open: the pose must read with both lids up |
| `flinch_plate` | no | 0.2 | 1 | a 3° rock, no step |
| `die` | no | 2.2 | 0 | stops mid-stroke; the ram sinks slowly under its own weight; lids fall shut (keyed); it does not fall over; holds |
| `pound_bulkhead` | yes | 2.6 | 1 | wind-up, slam on a **vertical** target 2.7 m in front of the feet (the bulkhead at 1.5 m height), recover. Fallback if cut: the game loops `slam_windup` → `slam` → `slam_recover` |

### 4.3 `proj_canister` (P0) — 80 tris, instanced, pivot at the centre
- [ ] A squat ceramic pot 0.35 across × 0.30 with a steel band and a `flame` emissive seam. One mesh, `m_prop`.

### 4.4 `tamper_cold_static` (P2) — 4 000 tris, static, bake `VL`, pivot base centre, embedded by `env_lift_hall`
- [ ] The Tamper's mesh posed upright with the ram parked and both lids shut, **band in `livery` paint (no emissive), no stain, no dust: perfectly clean**: the cleanest object in the game. No armature in the export.

## 5. Tests and evidence

`tests/art_boss/*.test.mjs` (`node --test tests/art_boss/`):

- [ ] `check.test.mjs`: `check-glb` on your four ids: Windlass exactly 3 meshes / 3 draw calls, 26 bones, every listed empty, `lampCount` 14 and 26, 9 clips, **no track on any `codeDriven` bone**; Tamper 1 draw call, 12 bones, 12 clips, vent bones keyed only in `stagger`, `charge_stun`, `die`; budgets; `asset-status --require=0 --owner boss` exits 0.
- [ ] `windlass_geometry.test.mjs`: hub at (0, 4.0, 2.0) ± 0.03; drum diameter 5.0 ± 0.05 and depth 2.2 ± 0.05; `knot_n_hit` at radius 1.7 ± 0.03 from the hub in the drum plane with `knot_1_hit` at the top and the order clockwise seen from +Z; `pawl_l_hit` / `pawl_r_hit` at (∓1.6, 6.0, 3.95) ± 0.03; lamp indices: quads 0–5 at radius 2.3 ± 0.05 beside mouths 1–6, quads 6–11 within 0.1 m of `knot_n_hit`, 12–13 within 0.1 m of the pawl hits; gauge quads sorted by height equal indices 0–25 and show two gaps wider than the rest after indices 9 and 19; the six `mouth_n` bones have equal local rest matrices relative to their mouth frame (retarget test: `mouth_open` applied to `mouth_4` opens that lid 110°).
- [ ] `windlass_clearance.test.mjs`: with `arm_yaw` at each of the six indexes and `drum_spin` at 0°, 15°, 30°, 45°, the body mesh (guard on and parked) does not intersect a cylinder kerb of inner radius 3.0, outer 3.6, height 1.2, nor a rib box at r 7.5..10.5.
- [ ] `tamper.test.mjs` (the vent bone is posed with `__dbg.ext.viewer.setBone('vent_chest', { rot: [80, 0, 0] })`, section 3): at rest the mesh hides both `vent_*_knot` points from the front and back (lids shut); with `vent_chest` at +80° local X the chest knot point is visible from 4 m in front at eye height 1.65 m, and likewise the back; in `slam_windup`'s last frame the bounding-box height is ≥ 1.8× the idle height; `ram_head` y ≤ 0.1 m on `slam`'s last frame; overall idle size 2.4 ± 0.1 high, 1.6 ± 0.1 wide.
- [ ] `viewer.test.mjs`: every asset and clip through `sandbox/viewer.html?asset=…&clip=…&shot=1`, no console error, lamp sets cycle.

`shots/art-boss/` (open every one): `<id>_sheet.png` × 4; clip strips for all 21 clips; **`windlass_from_catwalk.png`** (camera at (0, 8, −13) relative to the axis looking at the drum with the arm at index 1: "six in a ring" must read, placed over a 6 m dark disc for the bore); `windlass_face_states.png` (all shut; all open with knots; guard on; guard dropped; guard shattered mid-clip; sagged); `windlass_back_flutes.png` (the fluted back: the cylinder from the right end); `windlass_gauge_20m.png` (gauge legible from the floor at 20 m, 960 × 540); `windlass_greyscale.png` (open knots read by core and collar without hue); `tamper_silhouettes.png` (idle, wind-up, charge, stunned with the back lid open: black on white, front and side); `tamper_vents.png` (shut, chest open, back open, both open over `stagger`); `tamper_cold.png` beside the stained one.

## 6. Definition of done (measured)

1. `node tools/build-assets.mjs --only <your ids>` succeeds from clean (the Split box).
2. Triangles ≤ 8 000 / 4 000 / 80 (/ 4 000); draw calls 3 / 1 / 1 (/ 1). Actual numbers and the per-part split of the Windlass reported.
3. All P0 clips final (Windlass 8, Tamper 10); P1 / P2 status stated.
4. Download share: four GLBs ≤ 0.6 MB total after optimise.
5. ART_BIBLE section 12 items 9–11, 16, 18, 20, 22–24 marked PASS / FAIL with the file looked at: silhouettes distinct at 48 px (against `art-enemies`' Bider and Transit when present); every weak point has a dark bezel, a white core ≥ 40 % and a hex collar and reads in greyscale; the raised ram and the open lid read with colour removed; the mark's geometry (six in a ring) is exact on the drum face.
6. The report states the vent hinge axis and sign, the `mouth_n` rest-frame convention, and the lamp index map as built.

## 7. Non-goals

Behaviour, phases, hit volumes, indexing, drum spin, lamp logic, the gauge's values
(`code-enemies` drives `arm_yaw`, `drum_spin`, lamps and vents by code); mouth glow, threads,
canister rings, the lance, guard shards, slam rings, sparks (`code-render`); the bore
chamber, kerb, girder (`art-env-interior`); Bider and Transit (`art-enemies`); a boss that
leaves its gantry; a second fighting Tamper; LODs.

## 8. Dependencies

- `code-enemies` is written against the placeholders with your final names: it rotates `arm_yaw` and `drum_spin`, retargets `mouth_open` / `mouth_close` to each `mouth_n`, scales `knot_n` / `pawl_*` when burst, sets `boss_lamps` and `gauge` masks, rotates the Tamper's vent bones after the mixer, and reads the `*_hit`, `muzzle_top`, `canister_muzzle`, `thread_anchor_n`, `ram_head`, `foot_spark`, `vent_*_knot` empties. Do not rename; do not add or remove bones.
- `art-env-interior` embeds `tamper_cold_static` from your raw export in `blender/export/enemies/` and builds the chamber your clearance test mocks; the real kerb and ribs are in `design/layout.json` (`bo_kerb`, `bo_kerb_hi_*`, `bo_rib_*`): read them rather than trusting the numbers above if they differ.
- `code-render` lights you (`m_prop`), runs the knot pulse, lamp sets, halos and `wrong_fade` on the `violet_band` cell.
