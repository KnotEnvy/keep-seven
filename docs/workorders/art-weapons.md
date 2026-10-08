# Work order: `art-weapons`

Phase 3 (production, round 1). Manifest owner name: **`weapons`**. You are a fresh agent:
this file plus the documents it names are everything you need.

Read first: `CLAUDE.md`, `docs/PLAN.md`, `docs/workorders/README.md` (**section 4, "Read first": `docs/FOUNDATION_REPORT.md` sections 2 to 4, 6, 8c and 9, and `blender/lib/README.md`**: the build driver, the viewer's first-person mode and the checks as they are now); `docs/ART_BIBLE.md`
sections 1, 2.1 (the gun and the Reeve), 4, 5.1, 5.2, 7.5, **8 (all of it: this is your
design)**, 12 D; `docs/GDD.md` 6 (6.1–6.9: the weapon's rules and the clip table) and 12.4;
`docs/ARCHITECTURE.md` 1.1, 7.2, 7.3, 8.1 (`m_gun`); `docs/research/game-feel.md` 2 (revolver
gunfeel); then `blender/template_asset.py`, `blender/lib/` docstrings (`rig.py`, `anim.py`,
`bake.py`), and `docs/research/blender-pipeline.md` sections 4, 6, 7 and "Traps".

## 1. Mission

**Pillar 1: the gun is the star.** A heavy blued six-gun fills a quarter of the screen for
twenty minutes; it is the darkest, sharpest, most neutral object in every frame, and when it
fires it is the only light in the room. The player's whole relationship with the game runs
through fifteen clips you animate: the kick, the thumbed hammer and the cylinder turning one
notch, six rounds pressed home one at a time, and once, slowly, a thumb breaking the band on
the round she swore never to fire. That last clip (`load_kept`) is the emotional climax of
the demo and the kept round has been **visible in a loop on her left cuff in every reload**
before it. You also own the ammunition family, so the rounds in the world are the rounds in
the gun. Nothing here is ornamental; everything is exact.

## 2. Owned files (exclusive)

```
blender/weapons/**           weapon_revolver.py  pk_rounds_6.py  pk_rounds_12.py  prop_cartridge_lead.py
                             prop_cartridge_line.py  prop_cartridge_kept.py  + your helper modules
blender/tex/tx_gun.py  blender/tex/tx_matcap_steel.py     (placeholders exist: you make them final)
tests/art_weapons/**
shots/art-weapons/**
docs/requests/art-weapons.md
public/assets/weapons/weapon_revolver.glb
public/assets/props/{pk_rounds_6,pk_rounds_12,prop_cartridge_lead,prop_cartridge_line,prop_cartridge_kept}.glb
public/assets/tex/{tx_gun,tx_matcap_steel}.webp          written only by `node tools/build-assets.mjs --only weapons`
```

Never edit `blender/lib/`, `design/*.json`, `tools/`, `src/`, or other owners' files.

## 3. Rules (short form; ARCHITECTURE 7.2 is the full text)

- **Sockets** (the manifest has no `nodePos` / `nodeParent` for the revolver; these are the placeholder's, held by `tests/pipeline/placeholders.test.mjs`): `muzzle` (0.075, −0.070, −0.56) and `eject` (0.13, −0.085, −0.305) ride the `gun` bone; `cam_look` (0, 0, −12) rides `root`.
- **The pipeline as built** (FOUNDATION_REPORT 4, `blender/lib/README.md`): nothing ships until the build passes (`FAILED <id>` leaves the previous files); the Blender log is `blender/export/.logs/<id>.log`, and bake warnings (`WARNING <object>: N faces … baked dark from end to end`) are **only** there or under `--verbose`: read it. **Draw calls are counted one per mesh per material** (two meshes sharing a material are two; variant nodes count once). `node tools/build-assets.mjs --reset <id>` puts the placeholder back once your script is gone.
- **Judging colour**: the viewer and every `<id>_game.png` show linear values up to 0.8 exactly as authored, and the game's renderer uses the same curve (README ruling 15), so a palette colour in a viewer frame is the colour in the file. The viewer is unlit: `&mood=L1` (any `MoodId`) and `&ground=sand` add a flat mood tint (fog and sky colour, one ambient + key), `&shot=1` hides the panel, the bar and the UI log, `&dist= &yaw= &pitch=` place the camera. A `&shot=1` frame without `&dist=` is fitted (the asset's bounding box fills 90 % of the frame); pass `&dist=` for a close-up of a detail.
- **Reading and posing bones in a viewer test** (`sandbox/viewer.html?asset=<id>`, any asset page): `__dbg.ext.viewer.pose(names?)` → `{ <name>: { pos, quat, scale, local: { pos, quat, scale }, isBone } }` for the given nodes or bones (default: every manifest node and bone), in **asset space** (game metres, +Y up, as the manifest's `nodePos`), with the clip pose and every override applied; `__dbg.ext.viewer.setBone(name, { rot: [xDeg, yDeg, zDeg], scale })` turns or scales a **code-driven** bone on top of the clip's pose (after the mixer, until changed; `null` clears it) and returns its pose; `__dbg.ext.viewer.setClip(name, t01)` holds a clip at a fraction of its length without reloading (`''` = the rest pose); the URL form is `&clip=<name>&t=<0..1>&shot=1`. `__dbg.ext.viewer.project('<node>')` → `{ across, up, inFront }`. (The raw three.js objects are under `__dbg.ext.core.ctx().scene.dynamic.getObjectByName('viewer_holder')`, or `scene.viewModel…` in first person, if you need more.)
- One script per asset; `node tools/build-assets.mjs --only weapons` builds, optimises and checks everything. Deterministic.
- **Names are the contract**: every bone, node and clip below exists exactly; clips are NLA tracks, 30 fps, from frame 0, authored length the nearest whole frame to the listed seconds (the runtime time-scales to the exact value), loops with identical first and last frames. **Never key a `codeDriven` bone** (`round_1…round_6`, `kept_loop`): code scales them to 0 or 1.
- Gameplay positions (`muzzle`, `eject`, `cam_look`) are **empties**, never mesh nodes.
- Materials are names: `m_gun` on `gun_mesh`, `m_prop` on `arms_mesh` and on every cartridge and pickup. **GLBs contain no images**; `tx_gun` and `tx_matcap_steel` are separate files.
- `COLOR_0` = tint × AO × gradients on every mesh (AO + height ramp; no dust skirt: the gun is clean).
- Procedural layers are code and **must not be baked into clips**: bob, sway lag against look input, landing dip, recoil kick of the camera. The clips carry only what the hands and the mechanism do (the `fire` clip does carry the view-model kick: 0.08 m back, 20° rise).
- Homage, not copy: no engraving, no inlay, no logo, no sandalwood, no motif on the grip. The only mark is the 9 mm stamp under the loading gate.
- All six assets but `prop_cartridge_lead` are **P0**; all fifteen clips are P0. Order of work if time runs short: gun mesh + `idle`, `fire`, `dry_fire`, the four reload clips, `draw`, `sprint` → `load_kept`, `fire_kept`, `unload_kept` → `load_line`, `unload_line`, `take_round` → cartridges and pickups → texture polish. Never ship a missing clip: a rough clip under the right name beats a placeholder.

## 4. Deliverables

### 4.1 `weapon_revolver` — 18 000 tris, up to 3 draw calls, one armature (it was 6 000 tris: gun ≤ 3 200, hands and arms ≤ 2 800, 2 draw calls)

**Ruling R14 (release pass p0, 2026-10-06): the view-model has 18 000 triangles (it was 6 000), up to 3 draw calls (`m_gun`, `m_hands`, and `m_prop` where the palette still serves), and its own texture set: `tx_gun` 1024 x 512 RGBA8 and `tx_matcap_steel` as before, plus `tx_gun_detail` (1024 x 512 R8: height in `tx_gun`'s layout), `tx_hands` (512 x 512 RGBA8: albedo, A = gloss) and `tx_hands_detail` (512 x 512 R8: height). The split between gun and hands inside the 18 000 is the gun team's (a guide: gun 10 000, hands and forearms 8 000). The 31 bones, the nodes and the 15 clips are unchanged. The numbers in `design/assets.json` hold.**

**Frame (superseded in polish round 2: ART_BIBLE 8.3 as amended holds the built placement: muzzle (0.052, −0.034, −0.52), 55.8 % / 43.3 %, bore 12° inboard; `tests/art_weapons/framing.test.mjs` holds the numbers).** Authored **in camera space**, in the `idle` pose: camera at the origin looking down −Z (game space), +Y up. Idle placement: **muzzle at (0.075, −0.070, −0.56); grip centre at (0.135, −0.165, −0.30)**; the bore converges on the crosshair at 12 m (`cam_look` empty at the aim point, (0, 0, −12)). Rendered with a fixed **52° vertical FOV**, near plane 0.02 m: on a 16:9 frame the muzzle sits at 58 % across and 37 % up; gun and hand cover **no more than 18 % of the frame, never cross the vertical centre line**, and stay clear of the lower-right HUD ring.

**Meshes.** `gun_mesh` (`m_gun`, rigid-skinned: one weight per vertex) and `arms_mesh` (`m_prop`, smooth-skinned).

**Bones (31, exactly):** `root`, `gun` (whole weapon; recoil), `cylinder` (axis = barrel axis; 60° per shot), `hammer`, `trigger`, `gate` (loading-gate hinge), `ejector`, `round_1`…`round_6` (children of `cylinder`: the six case heads / rounds in the chambers), `arm_r`, `hand_r`, `thumb_r_1`, `thumb_r_2`, `index_r_1`, `index_r_2`, `grip_r` (three fingers as one), `arm_l`, `hand_l`, `thumb_l_1`, `thumb_l_2`, `index_l_1`, `index_l_2`, `fingers_l`, `round_hand_lead`, `round_hand_line`, `round_hand_kept` (cartridges in the left hand: scaled to 0 by the clips unless the clip shows them), `kept_loop` (the kept round in its leather loop on the back of the left cuff, band outward).
**Empties:** `muzzle` (child of `gun`, at the crown, −Z along the bore), `eject` (at the gate), `cam_look`.

**The Assize six (ART_BIBLE 8.1).** A heavy single-action, gate-loaded six-gun, 0.345 m long, 0.145 m tall; it should look cleaned every day for eleven years.

- [ ] Barrel 0.19 m: **octagonal for the rear 0.11 m, turned round for the front 0.08 m**, 19 mm across the flats (one flat always catches the key); blade front sight 7 mm high modelled 2.5 mm thick; rear sight a plain notch in the top strap; crown recessed, bore 11.4 mm modelled 14 mm deep and dark. The front 30 mm gone grey (`gun_worn` `#6B7078`).
- [ ] Ejector housing: a full-length tube under the barrel on the right with a crescent-headed rod.
- [ ] Cylinder 42 mm across, 41 mm long, **six flutes**, six bolt notches, a visible gap to the barrel; case heads (brass rim, darker primer) visible from behind in each loaded chamber (`round_n`). Flute ridges worn grey.
- [ ] Frame: solid top strap, broad recoil shield, **loading gate on the right hinged at its lower edge**; under the gate, visible only while it is open, **the mark, 9 mm tall, stamped** (six open discs at 30° + 60°n, a plumb stroke, a solid seventh: `brand.pellam_mark` proportions, drawn in `tx_gun`). Three screws on the left, slots not aligned.
- [ ] Hammer: tall spur with three raised bars, worn bright on top; fixed firing pin. Plain round steel guard, narrow curved trigger.
- [ ] Grip: one-piece **dark walnut** (`#3A2318`, worn heel `#5A3824`), plough-handle, 115 mm, one hairline crack at the butt pinned with **a brass pin (the only brass on the gun)**.
- [ ] Finish `gun_blue` `#1C2230`: satin, reads black in shade. Edge wear only where a hand or holster goes. No rust, no decorative scratches, no grime.
- [ ] Bevels 0.4–0.8 mm, one segment (1.5 mm on the frame's outer contour), then weighted normals: the bevel is where the specular lives. Circle segments 24–32 on the cylinder and muzzle, 12 on screws.
- [ ] Triangle spend: cylinder 700, barrel and sight 450, frame 900, hammer / trigger / gate / ejector 550, grip 350, six case heads 150, hand rounds 100.

**Hands and arms (ART_BIBLE 8.2).**
- [ ] Unlined work gloves in pale tan leather (`glove` `#8A6A48`; palm and trigger finger worn to `#A58460`), a seam along each finger, a short gauntlet; slim, strong hands. Three finger units on the right (thumb, index, the other three as one), four on the left.
- [ ] 20 mm of bare wrist (`skin` `#9A6B4F`) with the cord of the glove's tie. Dark oilcloth coat cuff (`cuff` `#3A3432`), leather-bound edge, one horn button; the sleeve ends 0.25 m up the forearm at the frame edge: nothing beyond it is modelled.
- [ ] **The left cuff carries the kept round's leather loop** (`kept_loop`): brass case, the enamel band with a livery hairline, band outward, **in frame during every reload clip**.
- [ ] Colour blocking in frame: dark gun, mid glove, dark cuff (the glove is the lightest part).

**Clips (15; durations are GDD 6.9; content is ART_BIBLE 7.5 and 8.4).** Every clip starts fast and ends slow, overshoots a few degrees and settles in two frames. Nothing twirls.

| Clip | Loop | Seconds | What happens (acceptance) |
|---|---|---|---|
| `idle` | yes | 3.0 | breath: the gun rises and falls 3 mm, rolls 0.4°; thumb rests beside the hammer |
| `sprint` | yes | 0.68 | muzzle up and inboard 35°, gun pumps 4 cm with each stride, left hand swings into the lower-left corner |
| `draw` | no | 0.5 | up from below the frame, muzzle arrives last, a small settle. Ends on the idle pose |
| `fire` | no | 0.48 | 0–0.12 kick: 0.08 m back, 20° muzzle rise, **hammer falls on frame 0**; 0.12–0.30 the thumb sweeps the hammer back and the **cylinder turns exactly 60°** with two visible clicks (half cock, full cock) **on frames 4–9**; settles by 0.48 **exactly on the idle pose** (so shots chain without a pop) |
| `dry_fire` | no | 0.15 | hammer falls, a 2 mm nod, nothing else |
| `reload_open` | no | 0.35 | the gun rolls 40° left and tips muzzle-up 25°; the right thumb flicks the gate open; the left hand comes up with a round |
| `reload_round` | no | 0.30 | the left hand seats one round at the gate (`round_hand_lead` visible, **pushed home on frame 5**), the cylinder clicks round 60°, the hand dips for the next. First and last poses match so it chains six times |
| `reload_close` | no | 0.30 | gate snapped shut with the thumb, the gun rolls back to idle |
| `reload_fast_close` | no | 0.20 | the same in 0.2 s, straight to the firing pose |
| `load_line` | no | 0.55 | gate open, the round under the hammer is thumbed out into the palm, `round_hand_line` (aqua shoulder ring visible) seated, gate shut |
| `unload_line` | no | 0.35 | the reverse, quicker |
| `load_kept` | no | 1.8 | **the centrepiece, slow because she has never done it**: the left wrist turns up into frame (0–0.4); the thumb breaks the band on the round in the cuff loop: **the enamel band cracks and falls away in two pieces** (0.4–0.9; the two band halves are small rigid pieces weighted to `fingers_l` / `hand_l` that drop out of frame; `kept_loop` itself is hidden by code at the right moment, so stage the hand-off at 0.9 s); she draws it (`round_hand_kept` visible) and holds it one beat in the light (0.9–1.2); gate open, seats it under the hammer, gate shut (1.2–1.8) |
| `unload_kept` | no | 0.3 | gate, the round goes back to the loop (band broken) |
| `fire_kept` | no | 1.2 | the muzzle is pointing down into the bore: a longer, heavier kick (0.11 m back, 26° rise), **no cock afterward: the hammer stays down**; a slow return over 0.6 s |
| `take_round` | no | 1.0 | the left hand reaches forward and down, closes on a round (`round_hand_kept`), brings it to the empty cuff loop and seats it |

Rules for the round bones in clips: `round_hand_*` are keyed to scale 0 on every frame of every clip that does not show them (and in `idle`). `round_1…6` and `kept_loop` have **no keys anywhere**.

### 4.2 `tx_gun` (1024 × 512 RGBA, sRGB, mips) and `tx_matcap_steel` (256² RGBA)
- [ ] `tx_gun`: the revolver's unique unwrap at **≥ 2 000 px/m** on the parts nearest the camera (barrel flats, frame right side, cylinder, hammer). RGB albedo: `gun_blue`, edge wear to `gun_worn` from a pointiness / edge mask (only where a hand or holster goes), walnut grain drawn **along** the grip, case brass rims with darker primers, the stamped mark under the gate. **Alpha = gloss mask: blue 0.75, worn edges 0.9, walnut 0.35, brass 0.6.** Baked or drawn by script (`bake.bake_socket_as_emit` or numpy); no noise, no grunge.
- [ ] `tx_matcap_steel`: a blued-steel sphere: dark body, **one soft warm highlight upper left, one thin cool rim lower right**.
- [ ] `gun_mesh` UV0 is that unwrap (unwrap **after** bevelling); `arms_mesh` UV0 points at `tx_palette` cells.

### 4.3 The ammunition family (all `m_prop`, bake `AO`, 1 draw call, instanced: one mesh, one material per variant node)

| id | P | What it is | Tris | Pivot | Variant nodes |
|---|---|---|---|---|---|
| `pk_rounds_6` | 0 | a brown paper packet tied with cord, one corner torn showing two brass case heads; modelled 1.6× life: 0.14 × 0.06 × 0.09 | 120 | base centre | — |
| `pk_rounds_12` | 0 | a flat cartridge tin, `tin` with rust at the corners, lid half slid back on twelve case heads in two rows; 0.18 × 0.07 × 0.12; no label. It is the Dowser's: square and neat | 180 | base centre | — |
| `prop_cartridge_line` | 0 | brass case 12 × 33 mm with a turned `enamel` nose (41 mm overall) and an **aqua emissive ring at the shoulder** | 48 | case head centre | — |
| `prop_cartridge_kept` | 0 | the same case with **the band**: an `enamel` sleeve 9 mm wide round the waist with a `livery` hairline | 144 (3 × 48) | case head centre | `round_sealed` (band whole, grey lead nose); `round_spent` (the empty case, mouth up, band intact: six stand on the rim stone); `round_violet` (**unfired; the band's hairline in faint violet emissive**: the stone's seventh) |
| `prop_cartridge_lead` | 1 | one .45 round, life size: brass case 12 × 33 mm, grey lead nose, 41 mm overall | 80 (2 × 40) | case head centre | `round_live`, `round_spent` (empty case: the weight on the first note) |

The rounds in the gun (`round_n`, `round_hand_*`, `kept_loop`) must be the same shapes and proportions as these assets: build them from one function.

## 5. Tests and evidence

`tests/art_weapons/*.test.mjs` (`node --test tests/art_weapons/`):

- [ ] `check.test.mjs`: `check-glb` on your six ids (31 bones, node list, 15 clips with lengths within one frame, loops closed, no keys on `round_1…6` / `kept_loop`, ≤ 6 000 tris, 2 draw calls); `asset-status --require=0 --owner weapons` exits 0.
- [ ] `framing.test.mjs`: renders the idle pose through `sandbox/viewer.html?asset=weapon_revolver&shot=1` with the 52° view-model camera at 16:9, 4:3 and 21:9 (**how, as built**: the viewer is **first person** by default for an asset whose manifest `pivot` is the camera; `&view=viewmodel` forces it for any asset, `&view=orbit` turns it off. The instance goes into `ctx.scene.viewModel`, which is **camera space** (camera at the origin, looking down −Z, +Y up: as you author the gun), and is drawn by the 52° view-model pass over the test room, the world camera level at eye height. `await __dbg.ext.viewer.project('muzzle')` → `{ across, up, inFront }` (screen fractions: across from the left, **up from the bottom**); `__dbg.ext.viewer.coverage()` → `{ coverage, minX, maxX, minY, maxY }` (the share of the frame the view-model covers, drawn alone, and the box of its pixels: `minX >= 0.5` is "nothing left of centre"). Open it at 960 × 540, 720 × 540 and 1260 × 540 for 16:9, 4:3 and 21:9: `openGame(server, { page: 'sandbox/viewer', piece: 'art-weapons', start: false, viewport, query })`. The placeholder measures 57.7 % across, 37.2 % up, coverage 14.0 % at 16:9. The stub's 52° camera simply takes the canvas aspect: the "anchored to the right" rule for 4:3 and 21:9 is `code-render`'s, so at those aspects assert coverage and the centre line, and report the muzzle fractions without asserting them) and asserts from the pixels: coverage ≤ 18 % of the frame; no gun or hand pixel left of the vertical centre line; the `muzzle` empty projects to 58 % ± 2 % across and 37 % ± 2 % up at 16:9; `muzzle` → `cam_look` passes within 0.01 m of the bore axis.
- [ ] `clips.test.mjs` (bones are read with `__dbg.ext.viewer.pose(names)` after `__dbg.ext.viewer.setClip(name, t01)`: asset space, which for the revolver is camera space; section 3): for each clip samples t = 0 and t = 1: `fire`, `draw`, `reload_close`, `reload_fast_close`, `unload_line`, `unload_kept` end within 1 mm / 0.5° of the idle pose on every bone; `reload_round` first pose = last pose; in `fire` the `cylinder` bone turns 60° ± 0.5° between frames 4 and 9 and `hammer` is at its fallen angle on frame 0; in `fire_kept` the hammer stays down; `kept_loop`'s bone is inside the camera frustum at some frame of `reload_open`, `reload_round` and `load_kept`.
- [ ] `textures.test.mjs`: `tx_gun` size and alpha present; gloss values sampled at four named UV points within ±0.05 of 0.75 / 0.9 / 0.35 / 0.6; mean luminance of the blue below every palette colour except `lens`.
- [ ] `family.test.mjs`: cartridge overall length 41 ± 1 mm and case diameter 12 ± 0.5 mm in every variant and in the gun's hand rounds; the kept band 9 ± 1 mm.

`shots/art-weapons/` (open every one): `weapon_revolver_sheet.png` (turntable), `gun_closeups.png` (right side with the gate open showing the stamp; left side screws; muzzle crown; cylinder from behind with case heads), `viewmodel_idle_16x9.png`, `_4x3.png`, `_21x9.png` (through the viewer with the HUD-ring area marked), one strip per clip `weapon_revolver__<clip>.png` (5 frames; **`fire` at frames 0, 2, 4, 6, 9, 14**; **`load_kept` at 0, 0.4, 0.65, 0.9, 1.2, 1.5, 1.8 s**), `tx_gun.png`, `tx_gun_gloss.png`, `tx_matcap_steel.png`, `ammo_family.png` (all cartridges, variants and both pickups at one scale beside the gun's cylinder), `viewmodel_in_L1.png` and `viewmodel_in_L4.png` (the viewer under a daylight and an underground mood: `&mood=L1&ground=sand&shot=1` and `&mood=L4&shot=1`. The mood look is the stub's flat tint: the mood's fog and sky colour and one ambient + key tint on unbaked materials and the ground, no key direction, no specular, no grade). `tools/preview-asset.mjs tx_gun --textures` writes into `shots/foundation-pipeline/` unless you pass **`--piece art-weapons`**.

## 6. Definition of done (measured)

1. `node tools/build-assets.mjs --only weapons` succeeds from clean.
2. `weapon_revolver` ≤ 18 000 tris (ruling R14; it was 6 000), at most 3 draw calls (it was exactly 2 meshes / 2 draw calls), 31 bones; cartridges and pickups within their budgets. Actual numbers reported.
3. All 15 clips final (no placeholder, no fallback copy). Authored frame counts listed against the manifest seconds.
4. Download share: `weapon_revolver.glb` ≤ 350 KB, the five ammunition GLBs ≤ 40 KB together, `tx_gun.webp` + `tx_matcap_steel.webp` ≤ 250 KB.
5. ART_BIBLE section 12 items 7, 25, 26 marked PASS / FAIL with the file looked at: octagon-to-round barrel, six flutes, gate with the stamp beneath, walnut grip with one brass pin, grey muzzle, no ornament; **the kept round visible in its cuff loop during every reload**; hammer and cylinder motion on frames 4–9; coverage ≤ 18 %.
6. The gun is the darkest object in the viewer frame under both test moods (measured in the two mood frames above: the viewer's tint is enough for a rough "darkest object", and its colour response is exact up to 0.8 linear, README ruling 15), with one sharp highlight (**the viewer has no specular: judge and show the highlight in the Cycles sheet**, and state what you measured in each).

## 7. Non-goals

Muzzle flash, smoke, tracers, the line-round line (`code-render`); camera kick, bob, sway,
FOV punch, the weapon state machine and timing (`code-player`); sounds; a third-person model;
any second weapon; aim-down-sights poses; fan-the-hammer (cut: GDD 6); world lighting.

## 8. Dependencies

- `code-player` drives your clips and bones against the placeholder already in the game: it relies on bone and clip **names and durations only**. It scales `round_1…6` (loaded chambers), `kept_loop` and reads `muzzle`. Do not rename, do not add bones.
- `code-render` implements `m_gun` (zone ambient + key, `tx_gun`, matcap specular × gloss; fresnel on High). Until it lands the viewer shows albedo × vertex colour without specular: judge the specular design in a Cycles preview with your matcap applied as an emission-mix material, and say so in the report.
- `art-props` builds what must fit your cartridge: the cradle recess, the locker slot, the rim stone's seats (case head 12 mm).
- `art-env-exterior` / `art-env-interior` embed `prop_cartridge_lead` / `round_spent` and `prop_cartridge_kept` / `round_spent` from your raw exports in `blender/export/props/`: keep those scripts building.
