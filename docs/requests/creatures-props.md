# Requests from the look team "creatures-props"

## Release pass p0 (2026-10-07)

Issue taken: "A few props read as primitive shapes up close" (visual, minor). What was mine is fixed (section 1); two of
the three things the reviewer named are not props and are in files of a look team that is active in this pass
(section 2). Evidence: `shots/p0-team-creatures-props/` (`before/`, `after/`, `pairs_low.png`, `pairs_high.png`),
log `scratch/p0-team-creatures-props/NOTES.md`.

### 1. Done, to mirror into the documents (closer)

| # | What changed | Where | Mirror into |
|---|---|---|---|
| 1 | `prop_coat_hung`: the coats are thin smooth-shaded sheets with two notched lapels, a dark neck and a lapped front; the shawl is two gathered ends hung side by side (slanted hems, border stripe, fringe) with the turn of the cloth over the peg. Folds are painted into COLOR_0 (`FOLD`, `FOLD_SHAWL`) because the stair lights every upright face alike. 268 / 270 triangles, 12.0 kB, same nodes, pivot and wind flag | `blender/props/dress/prop_coat_hung.py` | ART_BIBLE asset table row `prop_coat_hung` (the shawl is no longer "three-cornered ... thrown across the front") |
| 2 | **Hung things sway now.** The shader's wind weight was the height ABOVE the pivot; every mesh that carries the wind flag (the three coats, `prop_strain_cloth`) hangs BELOW it, so nothing ever moved (203 changed pixels between two frames 45 ticks apart on the peg stair before, 7 156 after). Weight = distance from the pivot; the swing is along the thing's own X (3 cm per metre), the billow out along its own +Z (0 to 2.2 cm per metre), never into the wall | `src/render/materials.ts` `DYN_VERT`, the `WIND` block | GDD 6.x "vertex-shader sway from the shaft's draught" is now true; ARCHITECTURE 8.x wind note; ART_BIBLE 9 ("height above pivot" -> "distance from the pivot") |
| 3 | `ia_line_locker`: the niche is an enamel-lined light box (liner lifted and painted with the strip's light; the aqua strip moved from the niche's ceiling, unseen from eye height, to the back wall over the round); three louvre slots and a service seam on each flank with their streaks, foot grime; shading normals of upright faces lean up 29 degrees (`mech_common.relight`, `LEAN` 0.55) so a face takes half of a top key. 447 / 500 triangles, 3 / 3 draw calls; nodes, bones, clips, `round_slot` untouched | `blender/props/mech/ia_line_locker.py`, `mech_common.py` | ART_BIBLE asset table row `ia_line_locker`; `blender/props/mech/README.md` (done) |
| 4 | `ia_ammo_box`: the same lean at 0.35 (19 degrees). In the proving bay it stood navy-black on its pale wall mount; the surface and bore placements are unchanged to the eye | `blender/props/mech/ia_ammo_box.py` | none |

`mech_common.py` changed, so the build driver rebuilt all 29 mech props: only the two above differ from the commit.

### 2. Asked of others

| # | To | What | Why | Evidence |
|---|---|---|---|---|
| 1 | underground-look (`blender/env_interior/env_lift_hall.py`, about line 381, layout solid `lh_ramp_cabinet`) | The "orange locker/crate box" of the issue is the switchgear cabinet at the foot of the gantry ramp: a 1.2 x 1.2 x 2.4 m enamel box whose seam, handles, plate and band are all on ONE face; from the ramp and the gantry the player sees the other three, bare, lit orange by the door lamp. Give the three bare faces what the front has: a panel seam and a louvre block each, the livery band carried round all four sides, a cable trunk up the back to the gantry's underside, a stained foot. Then re-bake `lm_under` | named by the reviewer; zone geometry, not a prop | `shots/p0-team-creatures-props/before/locker_walk_low.png`, `after/locker_walk_high.png` (the slab at the left edge); the reviewer's `shots/r5-final-visual/sheets/low_d_00.png` frames 3 to 5 |
| 2 | underground-look (`blender/env_interior/env_the_bore.py`, the stair from the catwalk level down to the antechamber) | The stair is two dark green planes and a run of treads with one small lamp at its foot. One practical on the mid landing wall (the same caged aqua strip as the peg stair) or a pale nosing on each tread, baked | named by the reviewer | `shots/p0-team-creatures-props/before/bore_stair_top_low.png`, `bore_stair_mid_low.png` (unchanged in `after/`) |
| 3 | world (`src/world/build.ts` `dress()`) + level design | **"One coat hangs dead still"** (GDD 6.x peg stair, ART_BIBLE "the third vocabulary, wrong") is still not on screen: `env_the_gallery.py` writes `wind: 0` on one dressing empty, but `dress()` never reads `o.userData.wind`, and all instances of a variant share one instanced mesh and one material. Now that the others move, the still one would read. Cheapest way: when `o.userData.wind === 0`, place that one coat as loose dressing (`assets.instantiate`, as non-instanced assets are placed) and set `userData.wind = 0` on its mesh before the render system gives it its material (`materials.ts` reads `mesh.userData.wind`); one more draw call on the second flight | story detail that the shader fix makes possible | `scratch/p0-team-creatures-props/windscan.mjs`, `sway.mjs` |
| 4 | underground-look / render-tech (mood table) | Observation, no change asked: in L3 and L4 a dynamic thing's upright faces take the ambient alone (about 1/20 of the key), so pale props stood near black against baked walls. I solved it in the two assets that showed it (leaning normals). L5 has an upright fill (`rim`); if more pale props come to L3 / L4, a small `rim` there is the general cure | | `before/locker_front_low.png`, `before/ammo_bay_front_low.png` |

## Closer, release pass p0 (2026-10-07): decisions on this file's p0 rows

Evidence: `docs/INTEGRATION_REPORT.md` Part K, `scratch/p0-closer/NOTES.md`, `scratch/p0-closer/gate/`.

| Row | Decision |
|---|---|
| Section 1 rows 1 to 4 | **Applied**: ART_BIBLE "Amendments, release pass p0" (asset rows, the wind note), ARCHITECTURE 8.4's p0 note |
| 2.1 the cabinet | **Applied by the closer** in `blender/env_interior/env_lift_hall.py`; no cable trunk and no stained foot (not attempted) |
| 2.2 the bore stair | **Applied by the closer** in `blender/env_interior/env_the_bore.py` (nosings, a third lamp) |
| 2.3 the one still coat | **Not applied**: every coat sways. Known issue |
| 2.4 a rim term in L3 / L4 | Noted; not applied |

## Look team "creatures-props", pass i1 (2026-10-07)

Five issues taken (the visual reviewers of iteration i1): the seated dead of the Tally House (major), both lift cage
interiors, the proving cage "a plain teal box at the bottom and a meshed cage at the top", the cart and wagon wheels,
the hung coats. Evidence: `shots/i1-team-creatures-props/` (`before/`, `after/`, `pairs_tally_low.png`,
`pairs_cages_low.png`, `ride/`, `after_*_sheet.png`, `after_cart_game.png`, `after_wagon_game.png`), log
`scratch/i1-team-creatures-props/NOTES.md`. No node, bone, clip, timing, pivot, collider or budget changed.

### 1. Done, to mirror into the documents (closer)

| # | What changed | Where | Mirror into |
|---|---|---|---|
| 1 | **The static Biders wear a hood, not a ball.** `build_hood_lo` is new: the planes of a head under a sewn bag (brow, the hollows the slits sit in, the push of the nose, the fall under the chin, flat temples; no face is drawn), the cloth hanging STRAIGHT from the cheekbones to the cord with painted gathers (the old profile bellied out), the felled seam as a proud band from ear to ear, one pleat down the back, a wider cape with a scalloped hem. `bider_table_static` (592 / 600): 10-sided hood, 6-sided sleeves, a thumb on each mitten; paid for under the table (a thigh, a shin and a shaftless boot a leg, no sash). `bider_seated_static` (496 / 500) and `bider_felled_static` (448 / 450): the 8-sided hood at 0.6 of the planes (they replace a skinned Bider in place), **no decimation any more** (it tore the felled skirt into shards) | `blender/enemies/bider_build.py`, `bider_table_static.py`, `bider_seated_static.py`, `bider_felled_static.py` | ART_BIBLE 7.6, the three static rows (the statics' hood is no longer "nine sides, no seam"); 6.1 stands (hooded, no face) |
| 2 | **Each of the nine at the table holds its head its own way.** `bider_table_static` carries the head's weight in UV1.y (extra `nod_pivot`, game space); the instanced `m_prop` breath shader turns, bows and tips each instance's head about its neck by angles hashed from its seat (up to 24 degrees aside, 4 back to 15 down, 8 over a shoulder). No triangle, draw call or program is added. UV1.y is 0 on `bider_seated_static` (it was 1 after the exporter's V flip; nothing read it) | `src/render/materials.ts` `DYN_VERT`, the `BREATH` block (`NOD_PIVOT`); `tests/art_enemies/bider_nod.test.mjs` holds the shader's pivot to the asset's | ARCHITECTURE 7.2 / 8.1 (UV1 of a breathing static: x = breath weight, **y = head weight**); ART_BIBLE 7.6 table row ("UV1.y = 0" is no longer true of the table static) |
| 3 | **The Tally House lights its people with its own lamps.** The mood's dynamic ambient was a dim mauve (`#4A3A44` x 0.35) in a room whose baked surfaces are lamp-orange: a linen hood came out cold grey at L* 38. Now `#CB9587` x 0.118 (2.5 times the light; its luminance 0.042 stays under the view-model rig's floor of 0.044, so the gun does not move). The key stays 0 outside a blade (`tests/render/moods.spec.ts`); its DIRECTION is overhead (`[0.16, 1, 0.10]`, it was the Long Light's sun), which only the shape shading of instanced things reads: a seated head has a lit crown and a shaded jaw. Every dynamic thing in the room (the risers, the shutters, the day-cell, pickups) takes the warmer ambient | `src/render/moods.ts`, the `L2` row (ambient, ambientK, keyDir only) | ART_BIBLE 3.2 / 11.1 mood table row L2 (dynamic ambient); ARCHITECTURE 8.3 if it quotes the number |
| 4 | **The proving cage stands inside its shaft.** `build_cage(tight=True)`: the grille walls are 3 cm INSIDE the 4 x 4 interior and the roof 6 mm under 3.5 m. The bore's shaft (`bo_plift_wall_*`, `bo_plift_ceiling`) is exactly that interior: built round it, the cage's posts, mesh, rail and roof were inside the masonry and the player rode in the shaft's bare walls. The `gate` bone, `control` and both clips are where they were | `blender/props/mech/mech_cage.py`, `ia_proving_lift_cage.py` | ART_BIBLE asset rows `ia_proving_lift_cage`, `ia_lift_cage` |
| 5 | **Both cage interiors are dressed.** An enamel wainscot of riveted panels to the livery band at 1.2 m with the mesh above it (three rows of larger tiles: fewer triangles than five rows of small ones), a steel handrail on brackets, a station board on the back wall (the numeral 4 in livery, `LIFT STATION 4` from the mask's `station`, a rivet row) and the maker's plate in brass with dark letters, a strip lamp in the roof behind the gate (faces of the one `gate_lamp`: no new lamp index) with its pool painted on the floor, a grating strip down the middle of the floor. **The "blank plates" were a bug**: the numeral's decal sat 2 cm BEHIND its backing slab (`lift=-0.02` pushes a decal into the wall). The hall cage's upright faces lean (`mech_common.relight`) so the hall's top key reaches its wainscot. 658 / 700 and 826 / 900 triangles, 3 / 3 draw calls | `blender/props/mech/mech_cage.py` | ART_BIBLE the same two rows; `blender/props/mech/README.md` (done) |
| 6 | `tx_mask`: region **`rivets`** appended at (640, 192, 256, 16): sixteen rivet heads in a row (lay it 16 times as long as it is high). Append-only held: no shipped region moved. 35.0 kB | `blender/tex/tx_mask.py`, `blender/lib/mask_regions.json` | ART_BIBLE 4.3 / 5.6 region list |
| 7 | **Round wheels.** `dress_common.wheel`: a rim of 18 (cart) or 20 (wagon) segments in six sawn felloes (each its own part: its own value), an iron tyre on the outer face, spokes that taper from the nave to the rim, a turned nave with an iron nose (the wagon's air wheel: eight sides). It was a 10- / 12-sided rim and a six-sided block. The cart pays with its rails' and the barrel's spare loops (900 / 900); the wagon had the room (1 200 / 1 200) | `blender/props/dress/dress_common.py`, `prop_water_cart.py`, `prop_wagon_tipped.py` | ART_BIBLE rows `prop_water_cart`, `prop_wagon_tipped` |
| 8 | `prop_coat_hung`: the folds were 3.6 to 4.4 cm deep at 5 to 6 cm apart, sharper than the 80 degrees the smoothing keeps soft, so every fold was a hard facet. 2 cm folds, all smooth; calmer hems (the shawl's 5.7 cm fringe teeth are an uneven edge). 268 / 270 | `blender/props/dress/prop_coat_hung.py` | none |

### 2. Asked of others

| # | To | What | Why | Evidence |
|---|---|---|---|---|
| 1 | **closer / exterior-look** (zone build) | **Rebuild `env_plenty_street`**: it embeds `prop_water_cart` and `prop_wagon_tipped` (`blender/env_exterior/street_yard.py` lines 993 and 995). Until then the game shows the old decagon wheels: my proof of the new ones is the asset viewer's frame, not the street | the zone file holds its own copy of an embedded prop | `shots/i1-team-creatures-props/after_cart_game.png`, `after_wagon_game.png`, `before/sheet_wheels_low.png` |
| 2 | exterior-look (`blender/env_exterior/street_yard.py`, the drum of `yd_drum`; active in this pass, so not my edit) | The second half of the reviewer's issue "the yard tank wall is a blank plane": beside the cart the celadon drum fills the frame as one undetailed surface. At player height (0.3 to 2.2 m): the panel seams of its 1.2 m module, a rivet row along each seam (the mask's new region `rivets`, row 6 above), and a stain band under the livery line. Then the zone's bake | named by the reviewer; zone geometry, not a prop | `shots/i1-team-creatures-props/before/yd_tank_low.png`; the reviewer's `shots/i1-visual-b/sheet_close_low_yd_00.png` (`yd_ammo`, `yd_cart`) |
| 3 | cross-cutting fixer (ruling R14: budgets are re-allocated through `tools/gen_assets.mjs`) | Three budgets that now bound the look: (a) `prop_coat_hung` 270 for THREE variants (about 90 a coat: a body sheet of 48, two sleeves, a collar): the reviewer asks for "a few hundred triangles"; 600 would give each a real collar stand, cuffs and a hem with thickness. (b) `bider_table_static` 600 x 9 instances: 900 would give the coat's back and the lap what the hood took (the legs are three boxes now, under the table). (c) `prop_water_cart` 900: the barrel is eight-sided; 1 100 would make it twelve | the assets are at 268 / 270, 592 / 600, 900 / 900 | `shots/i1-team-creatures-props/wip7/sheet_pairs.png`, `after_table_sheet.png`, `after_cart_game.png` |
| 4 | level design (`design/layout.json` `prop_tally_seated.params.seats`) | A yaw of a few degrees a seat (they are all exactly -90 or 90): the heads differ now, the shoulders are still nine parallel pairs | the last "row of identical" cue | `shots/i1-team-creatures-props/after/ta_row_low.png` |
| 5 | render-tech / closer (observation, no change asked) | An instanced thing is lit once, at `add()`, by its mood's flat ambient + half key (`src/render/instances.ts`): it does not follow the room when the room's baked light changes (the Tally House's shutters, the hatch's aqua layer). The warmer L2 ambient (row 3) is the room's lamp light; "hoods at 6 m read `#4A7F86`" under the hatch glow (ART_BIBLE 3.2) is still not on screen | known limit | `shots/i1-team-creatures-props/after/tl_seated_low.png` |
| 6 | closer | `tests/render/moods.spec.ts` line 89 holds `MOODS.L2[M_KEY]` at 0 and line 75 the L2 rim at 0: both kept. If a later pass wants a real top key on the Tally House's creatures, those two assertions are the gate | | |

### 3. Not done

- The skinned `enemy_bider` keeps its hood (17 sides, the bare profile): not named by a reviewer, and its silhouette and knot tests are tuned to it. A freed Bider's static body differs from it by up to 1.3 cm at the nose and 2 cm at the jaw when it takes its place.
- The coats are smoother, not richer: see request 3 (a).
- A cage has no load notice: `design/story.json` holds no such line and in-world writing is limited to its strings (`blender/tex/tx_mask.py`); the board says `LIFT STATION 4`.

## Closer, pass i1 (2026-10-07): decisions on this file's i1 rows

| Row | Decision |
|---|---|
| Section 1 rows 1 to 8 | **Mirrored**: ART_BIBLE "Amendments, pass i1" (7.6, the cages, the wheels, `tx_mask`, mood L2), ARCHITECTURE 8.4 (UV1.y of a breathing static) |
| Request 1, rebuild `env_plenty_street` | **Done**: every asset was rebuilt, the zones after their props; the round wheels are in the street |
| Request 2, the yard drum's seams, rivets and stain band | **Not done** (zone geometry, a look job; the drum has its cover strips, plinth and coping). `docs/KNOWN_ISSUES.md` |
| Request 3, three budgets (R14) | **Not applied**: no team is left in this pass to spend them; for the next pass's fixer |
| Request 4, a yaw of a few degrees a seat | **Applied** (`tools/gen_layout.mjs`: -8 to +8 degrees; LEVEL 15) |
| Request 5 / 6, observations | **Noted**; instanced things still take a room's light once |

## Look team "creatures-props", pass i2 (2026-10-07)

Four issues taken (the visual reviewers of iteration i2): the nine seated dead of the Tally House ("smooth untextured
eggs with a flat paper collar", "ball-headed dolls": major), the hung things nearest the camera on the peg stair
("faceted black ribbons and loops"), Biders and the watcher at arm's length. Evidence: `shots/i2-team-creatures-props/`
(`before/`, `after/`, `pairs_tally_low.png`, `pairs_tally_high.png`, `pairs_stair_low.png`, `pairs_stair_high.png`,
`pairs_bider_low.png`, `pair_watcher_low.png`, `viewer_sheet.png`), log `scratch/i2-team-creatures-props/NOTES.md`.
No node, bone, clip, timing, pivot, collider or budget changed. **The budget moves the issues assumed
(`bider_table_static` +900, `prop_coat_hung` +600) were not in `design/assets.json`**: everything below is inside the
old budgets (600 / 600, 268 / 270).

### 1. Done, to mirror into the documents (closer)

| # | What changed | Where | Mirror into |
|---|---|---|---|
| 1 | **The townspeople's cloth is painted.** `tx_palette`'s rows 6 to 15 (y 96..255, a grey nobody sampled) hold four cloths: `hood` 256 x 80 at (0, 96) (the sewn bag unrolled: a ring of pleats where the cord ties it, long creases, the felled seam ear to ear with its stitches, where a face under cloth holds light and shade, two knife-cut slits, a breath stain, bruise-coloured threads running down from under the knot, a cape with a stitched and turned hem), `coat` 160 x 80 at (0, 176) (skirt folds, yoke / side / back seams, the lapped front, three horn toggles, the sagging sash and its knot, a patch pocket, a mend, dust up the skirt, a frayed hem), `sleeve` 48 x 80 at (160, 176) (creases crowding at the elbow, a turned cuff), `weave` 48 x 80 at (208, 176) (plain coarse cloth). A cloth part points UV0 into its region; its colour stays in COLOR_0, divided by the region's base colour (`cloth_atlas.BASE`). No new texture, no texture memory (the same 256 x 256), no draw call, no shader term; the file is 48.3 kB (was 1 kB). `tx_palette_emis` is black there. APPEND-ONLY like the cells | `blender/tex/cloth_atlas.py` (new), `blender/tex/tx_palette.py`; guard `tests/art_enemies/bider_cloth.test.mjs` | ART_BIBLE 2.1 / 4.2 (the palette is no longer "cells only": rows 6 to 15 are the cloth atlas, with the four rectangles), 4.4 (`m_prop`: UV0 = a cell centre OR a cloth region); ARCHITECTURE 7.2; `design/assets.json` note of `tx_palette` (through `tools/gen_assets.mjs`) |
| 2 | **Every Bider wears it**: hood, cape, coat and sleeves of `enemy_bider` (2 364 / 2 500), `bider_seated_static` (496 / 500), `bider_felled_static` (448 / 450) and `bider_table_static` (600 / 600) are mapped (`Part(cloth=...)`, `Part.at`). The skinned Bider's mittens have a thumb (the reviewer's "mitten split"). The per-vertex fold paint of the hoods is lighter (the cloth carries the folds: both together drew a freed Bider's hood near black) | `blender/enemies/bider_build.py` | ART_BIBLE 6.1 / 7.6 |
| 3 | **The nine at the table are sacks on heads, not eggs.** `bider_table_static`: two CORNERS of the bag at the ends of the crown seam (the silhouette of a sack), a rounder cape with a hem turned under (thickness from a chair's height) and smooth shading across its folds; the seam's 16 triangles of geometry are gone (it is painted) | `bider_build.py` `build_hood_lo` | ART_BIBLE 7.6, row `bider_table_static` |
| 4 | **Each of the nine slumps its own way.** The instanced breath shader leans each one's TRUNK about its hips (`LEAN_PIVOT` (0, 0.5, -0.05), the asset's extra `lean_pivot` is the hip joint at (0, 0.566, -0.05)) by angles hashed from its seat: up to 7.5 degrees to a side, 3 back to 10 forward, 8.5 of twist, weight UV1.x (which is 1 on the neck and head of this asset, 0 on forearms and hands: they stay where they lie on the table). The head's own range is wider (5 back to 24 down, 10 over a shoulder). The mesh is marked by UV1.y >= 0.02 on every vertex (0.02 .. 1 = the head's weight); every other breathing static keeps 0 | `src/render/materials.ts` `DYN_VERT`, the `BREATH` block; `bider_build.build_static`; `tests/art_enemies/bider_nod.test.mjs` (body threshold 0.03) | ARCHITECTURE 8.4 (UV1 of `bider_table_static`: x = breath AND slump weight, y = 0.02 + 0.98 x head weight) |
| 5 | `prop_hat_hung`: **the "loops" on the stair were hats seen from below** (the skin began at the crown's foot: an open seven-sided ring under back-face culling). The underside is a closed disc, the brim has eight sides, the dark of the crown is painted. 48 / 50 | `blender/props/dress/prop_hat_hung.py` | ART_BIBLE row `prop_hat_hung` |
| 6 | `prop_coat_hung`: the two coats (body, sleeves, lapped front) lie on the Biders' own `coat` cloth, true to scale (sash, toggles, pocket, skirt folds where a worn coat has them); the shawl on `weave`; baked AO 0.9 -> 0.6 (the flank beside a sleeve was near black from the flight below). 268 / 270 | `blender/props/dress/prop_coat_hung.py` | ART_BIBLE row `prop_coat_hung` |
| 7 | **The watcher is lit by its niche's lamp.** It is a skinned Bider drawn with the gallery's teal station light in front of an orange-lit wall: a cut-out. Its meshes carry the renderer's tint hook (`userData.tint`, the Biders' cloth tints) set to `WATCHER_LAMP` [5.5, 0.85, 0.45], found by measuring a pixel of its mitten: (81, 149, 130) before, (178, 144, 100) after: brown coat, pale wraps, warm hood. No light is added, nothing else is tinted | `src/enemies/vignettes.ts` (**the enemies code team is not active in this pass: edited by this look team**) | GDD / LEVEL note on `prop_watcher`; ARCHITECTURE's tint seam (docs/requests/code-enemies.md 1.1) |

### 2. Asked of others

| # | To | What | Why |
|---|---|---|---|
| 1 | cross-cutting fixer (R14, `tools/gen_assets.mjs`) | The two budget moves the reviewers' issues counted on: `bider_table_static` 600 -> 900 (the legs under the table are three boxes; the lap and the coat's back are eight-sided), `prop_coat_hung` 270 -> 600 for three variants (a collar stand, cuffs, a hem with thickness, a modelled back so the coat nearest the camera has a far side) | the look is now carried by the cloth; the remaining weakness of both is silhouette at under a metre |
| 2 | closer | `src/ui/loadMeter.ts` `BOOT_FILE_BYTES`: `tx_palette.webp` grew by 47 kB (well inside the 30 % the unit test allows; nothing to do unless the figure is refreshed anyway) | |
| 3 | closer / exterior-look, underground-look | **No zone rebuild is needed for this pass's assets** unless a zone embeds a Bider static, a hung coat or a hat (none does: they are instanced or actors). Zones that use `m_flat` / `m_prop` cells are untouched: no cell moved | |
| 4 | render-tech (observation) | An instanced thing still takes one flat light at `add()`; the hats and the dark coat on the peg stair are near black against the lit wall because L3's ambient is 1/20 of its key and their faces are upright. A small `rim` in L3 (as L5 has) would lift every hung thing | `shots/i2-team-creatures-props/after/st_2_back_low.png` |

### 3. Not done

- The nine are still 600 triangles each: at under a metre the cape and the hood are ten-sided, the hands are bound mittens, the legs under the table are boxes. Reads as tied sack hoods at 1 to 3 m (the reviewers' distances); a walk-up to 0.5 m shows the polygon count.
- The live Bider's hood has no sack corners (its knot covers the crown to 62 degrees; they would sit under the collar's rim), and its silhouette tests are tuned to the bare profile: the cloth matches the statics, the outline is the old one.
- The hung coats have no modelled back or thickness (request 1): from the flight below the nearest one is still a thin dark sheet, now with cloth on it.
- The hats are closed, not rich: 48 triangles, a dark disc with a crown from below.
- A breath stain and two slits are close to "a face": kept faint on purpose (ART_BIBLE 6.1 says no face is drawn); a lead who reads it as a face can zero it in `cloth_atlas._hood` (one line, `# breath`).

## Closer, pass i2 (2026-10-07): decisions on this file's i2 rows

| Row | Decision |
|---|---|
| Section 1 rows 1 to 7 | **Mirrored**: ART_BIBLE "Amendments, pass i2" (2.1 / 4.2 / 4.4 the cloth atlas, 6.1 / 7.6, the hat and coat rows, the watcher), ARCHITECTURE 8.4 "Pass i2" (UV1 of `bider_table_static`, the tint seam, 7.2), the `tx_palette` note in `design/assets.json` (through `tools/gen_assets.mjs`) |
| The edit in `src/enemies/vignettes.ts` | **Accepted** (render only; `tests/enemies/` and the playthrough pass) |
| Request 1 (R14: `bider_table_static` 900, `prop_coat_hung` 600) | **Not done**: no team was left to spend them; open for a later pass |
| Request 4 (a small rim light for L3) | **Open**: `docs/KNOWN_ISSUES.md` |
| The breath stain and slits on the hood | **Kept** (faint; ART_BIBLE now says so). Listed for the lead |

## Fixer, pass i3 (2026-10-07): decisions on the rows left open, and what the creatures and props have to spend

| Row | Decision |
|---|---|
| Request 1, pass i2 (R14: `prop_coat_hung` 600) | **Applied** through `tools/gen_assets.mjs`: 270 -> **600** for the three variants (`check-glb` counts 200 an instance). The gallery's dressing allowance is **8 500** (was 6 000): 28 coats + 24 hats + 15 pairs of boots = 8 150. Paid for by `chunk_gl_stair` and `chunk_gl_bay` (4 000 -> 3 200 each) and `chunk_lh_hall` (30 000 -> 28 500) |
| Request 1, pass i2 (R14: `bider_table_static` 900) | **Applied**: 600 -> **900** (nine instances; `cell_tally` 107 820 of 120 000) |
| The crown knot (both visual reviewers of pass i3: "a flat-shaded faceted lump") | `enemy_bider` 2 500 -> **2 600** (built 2 364: **236 triangles for the knot**). `bider_seated_static` (500, built 496) and `bider_felled_static` (450, built 448) are unchanged: every one of them is counted twelve to eighteen times in a cell that has 212 triangles left; give their knots smooth normals and the same colours instead |
| `prop_water_cart` 900 -> 1 100 (pass i1 request 3c) | **Declined**: it is merged into `chunk_st_yard`, which now has 76 triangles of slack, and no reviewer of pass i3 names it |
| Request 4, a small rim light for L3 | stays with render-tech |
| The breath stain and slits on the hood | **Kept** as ruled by the closer of pass i2 |
| The text | `rd_note_hearth` now says "They are not suffering now.": the townsfolk are alive and biding. Nothing drawn should read as a corpse |

## Look team "creatures-props", pass i3 (2026-10-07)

Three issues taken (the visual reviewers of iteration i3): the crown knot ("a flat-shaded violet and white gem": major),
the hung coats ("flat paper ribbons": major), the black hoop on a stem in the proving bay (minor). Evidence:
`shots/i3-team-creatures-props/` (`before/`, `after/` on Low and High, `pairs_knot_low.png`, `pairs_knot_high.png`,
`pairs_hoop_low.png`, `after/sheet_knot.png`, `after/sheet_coats.png`, `after/sheet_hoop.png`, working sets `w1/` to
`w7/`), the atlas enlarged in `scratch/i3-team-creatures-props/knot_atlas_x8.png`, log
`scratch/i3-team-creatures-props/NOTES.md`. No node, bone, clip, timing, pivot, collider or budget changed; the `crown`
point of every Bider is where it was.

### 1. Done, to mirror into the documents (closer)

| # | What changed | Where | Mirror into |
|---|---|---|---|
| 1 | **The crown knot is bound glass, not a cluster of facets.** A clouded glass bead with a light in it (a near-white heart 41 % of the knot across, violet round it, deep violet at the rim), lashed down by three hand-tied cords (no two alike) and seated in a grommet of two turns of twisted cord; on the skinned Bider the cord's own tie and its two ends lie over the left temple. Every surface is smooth-shaded. Same footprint (the grommet is the old collar, 1.3 x the radius), same height (0.86 x), same `crown` point, same hit sphere. Three detail levels: `enemy_bider` 354 triangles of knot (**2 527 / 2 600**), `bider_table_static` 240 (**778 / 900**; the lashings are geometry), `bider_seated_static` and `bider_felled_static` 72 (**492 / 500, 444 / 450**; the lashings are painted, no light in the glass) | `blender/enemies/bider_build.py` `build_knot_bound` (the old `build_knot` / `build_knot_lo` are left in the file, unused); `bider_table_static.py` (`budget=900`, `"knot": 1`) | ART_BIBLE 6 (the knot of the townspeople: bound glass; the faceted lobes of `blender/lib/knot.py` remain the knot of MACHINES and latches), 6.1, 7.6; GDD wherever the Bider's knot is described as lobes |
| 2 | **The knot is painted, in cells of the palette that had no name.** Columns 10 to 15 of rows 2 to 5 of `tx_palette` AND `tx_palette_emis` (x 160..255, y 32..95) hold `knot` 64 x 64 at (160, 32) (the knot from above: grey cracked glass and tarred cord in the albedo sheet, the light in the glass in the emissive sheet, black on the cords, a breath of violet where cord faces glass), `knot_dead` 32 x 32 at (224, 32) (the same, no light), `cord` 32 x 16 at (224, 64) and `cord_dead` 32 x 16 at (224, 80). No new texture, no texture memory, no draw call, no shader term. `tx_palette` 55 kB (was 48), `tx_palette_emis` 3.4 kB (was 1). APPEND-ONLY like the cells: never name a cell past column 9 in rows 2 to 5 | `blender/tex/knot_atlas.py` (new), `blender/tex/tx_palette.py` (`draw` calls it for both sheets) | ART_BIBLE 2.1 / 4.2 / 4.4 (an `m_prop` UV0 is a cell centre, a point in a cloth region OR a point in a knot region; `tx_palette_emis` is no longer "black except eight cells"); ARCHITECTURE 7.2; the notes of `tx_palette` and `tx_palette_emis` in `design/assets.json` (through `tools/gen_assets.mjs`) |
| 3 | `wrong_fade` on a dynamic thing's emissive: "turns aqua" is columns 6 and 7 only (it was "column 6 and beyond"); the knot's glass in columns 10 to 13 goes out like every other knot | `src/render/materials.ts` `DYN_FRAG` (one line, `band`) | ARCHITECTURE 8.4 |
| 4 | **The hung coats have a far side.** `coat_long`, `coat_short`: a closed, welded body (front, a flatter back 3.5 cm behind the front's edges, both flanks, the hem's dark inside, the top), the ROLL of the collar round the back of the neck and down both lapels, six-sided sleeves, the hem's corners cut round, lapels and roll on cloth. `coat_shawl`: both ends are closed slabs 1.6 cm thick. 184 / 184 / 180 triangles (**548 / 600**; 200 a variant is what the gallery's allowance counts) | `blender/props/dress/prop_coat_hung.py` (`slab`, `_as_coat_back`, `_as_weave`) | ART_BIBLE row `prop_coat_hung` |
| 5 | **What hangs in the first flight of the peg stair is lit by the stair.** That flight lies in the Tally House's zone while the surface is resident (layout `seam`): an instanced thing added there took the lamp-orange of the room above when she walked down and the gallery's teal after a restore (the reviewers' frames show red-brown coats on mint walls). An instanced thing of mood L2 below y -0.3 now takes L3 | `src/render/instances.ts` `add`, `INST_STAIR_Y` | ARCHITECTURE 8.4 (beside `VM_STAIR_Y`) |
| 6 | **The sighting loop is an instrument stand**: a ceramic pedestal with a hazard collar, a steel post let into it, a forked cradle whose two arms take the ring by its lower flanks. The ring (14 sides, was 16), its eight ticks, `loop_rim` and the sight line are where they were. **220 / 220** | `blender/props/mech/prop_sighting_loop.py` | ART_BIBLE row `prop_sighting_loop` |
| 7 | **Mood L3 fills the upright faces of dynamic things** (`rim: 0x7cf2e2, rimK: 0.5`, half the chamber's level). The stair and the gallery lit a dynamic thing from straight above only: the loop and its post, a Bider's flank, a door leaf had the ambient alone, L* 15 beside walls at L* 55 ("a plain black ring on a thin black pole"). Instanced things and the view-model do not read it | `src/render/moods.ts` L3 (one line); `tests/render/moods.spec.ts` (L3 left the list of moods whose rim is 0 and is held above 0.15 and under L5's) | ART_BIBLE 3.4 (L3: a teal fill on upright faces of dynamic things); this closes request 4 of pass i2 |

### 2. Tests changed (none weakens what is measured)

| File | Change | Why |
|---|---|---|
| `tests/pipeline/textures.test.mjs` (pipeline; not an active team) | "exactly eight emissive cells are lit" skips the knot block and asserts the knot's glass IS lit there | the emissive sheet holds the knot's light now (row 2) |
| `tests/art_enemies/bider_cloth.test.mjs` | the flat-cell check skips the knot block; a corner may lie in a knot region; new test: the four regions are painted, the dead ones are black in the emissive sheet, the heart is near white in violet, every lit texel passes the shader's `wrong_fade` test | rows 1 and 2 |
| `tests/art_enemies/bider_silhouette.test.mjs` | the knot's core is the brightest 2 % of the disc (was 5 %), still 60 L* over the collar (62.0 measured), and the brightest 5 % must be 45 L* over it (53.7) | the heart is seen between lashings and is 41 % of the knot across, where the old central lobe was a flat white facet of 48 %; a heart large enough for the old measure drew the reviewers' "pure white" dome again (tried: `after` set of the first attempt) |
| `tests/render/moods.spec.ts` | row 7 | |

### 3. Asked of others

| # | To | What |
|---|---|---|
| 1 | closer | **No zone rebuild is needed for these assets**: the coats are instanced by the gallery's dressing empties, the sighting loop is placed by the layout, the Biders are actors or instanced. `tx_palette` and `tx_palette_emis` changed: refresh `src/ui/loadMeter.ts` `BOOT_FILE_BYTES` if it is refreshed anyway (+9 kB) |
| 2 | closer | `design/assets.json` notes of `tx_palette` / `tx_palette_emis` (row 2), through `tools/gen_assets.mjs` |
| 3 | closer / lead | The knots of the MACHINES and latches (`blender/lib/knot.py`, hex collar: the yard and hatch latches, `knot_a/b/c`, the pawls, the Windlass's mouths) are still faceted lobes on flat emissive cells. No reviewer of this pass names them, they are seen at 10 m and more, and `blender/lib` is not this team's; if a later pass wants them to match, the same atlas serves (a `knot` region mapped on a smooth dome in a hex plate) |
| 4 | render-tech (observation) | On High the room shadow of an instanced coat is a soft dark halo on the wall round it (`after/co_f3_below_high.png`); it was there before, the coat is thicker now |

### 4. Not done

- The coats are still 184 triangles: a body with a collar, sleeves, a back and a hem, hung stiff. At arm's length the lapels are flat quads under the roll and the body's outline is nearly a rectangle. They read as coats from every side (`after/sheet_coats.png`); they are not draped cloth.
- Under the gallery's own exposure the coats are dark olive (brown cloth under teal light): correct for the room, and the painted toggles and sash are faint there.
- The freed statics' knot (`knot_dead`) was looked at in the viewer and the Workbench sheet only (`bider_seated_static_sheet.png`), not in a fight.
- The sighting loop's hazard collar is a 5 cm band: a small accent, not a painted face. Its ring is 14-sided: at 2 m the facets show on the silhouette.

## Closer, pass i3 (2026-10-07): decisions

| Row | Decision |
|---|---|
| 1 rows 1 to 7 | Mirrored: ART_BIBLE "Amendments, pass i3 (closer)", ARCHITECTURE "Pass i3", GDD 23.17 |
| 3.2 the notes of `tx_palette` / `tx_palette_emis` | **Applied** through `tools/gen_assets.mjs` |
| 3.3 the machines' knots | **Left**: no reviewer names them; `docs/KNOWN_ISSUES.md` |
| 2 test edits (`tests/pipeline/textures.test.mjs`, `tests/render/moods.spec.ts`) | **Accepted**: each follows a deliberate change and still measures it |
