# KEEP SEVEN — Level blockout walkthrough

Stage one, *First Tally: Plenty*. This is the reading guide to `design/layout.json`
(version 2: revised after the pre-production critic round; what changed is in section 10).

- **Source of truth:** `design/layout.json`. It is the *output* of `tools/gen_layout.mjs`.
  Change the generator, never the JSON, then run:
  `node tools/gen_layout.mjs && node tools/validate_layout.mjs && node tools/render_layout_map.mjs`
- **Map:** `docs/level-map.png` / `.svg` (`--crops` also writes zoomed panels to `shots/level-design/`).
- **Shared geometry code:** `tools/layout_geom.mjs` (ground lookup, body sweep, ramp heights).
  Greybox and collision generators should import it rather than re-derive the conventions.

All coordinates are game space: metres, +Y up, **north = −Z, east = +X**. `rotY` is degrees,
three.js sense: 0 faces north (−Z), 90 faces west (−X), 180 south, −90 east.

## 0. How to read the file

| Thing | Convention |
|---|---|
| `box` | `pos` = centre, `size` = full extents, rotated about Y by `rotY` |
| `ramp` | box footprint; top rises from `pos.y − size.y/2` at the low edge to `pos.y + size.y/2` at the high edge along `rise` (`+x`/`-x`/`+z`/`-z` points **uphill**); solid below, down a further `skirt` |
| `cylinder` | `pos` = centre, `size` = `[d, h, d]`; `innerRadius` makes a tube or annulus (bore floor, kerb) |
| `heightfield` | reserved, unused. The gully is wedge ramps; the art pass sculpts terrain over them |
| Solid flags | `pierce` (line round passes), `dynamic` + `enabledBy` (collider off until that marker fires), `grille` / `skipsShots`, `invisible` (collision only, not drawn), `playerOnly` (collides with bodies only: shots, sight and aim tests pass), `low` (cover under 2 m), `seam` + `sets` (below), `dress` (a free-text dressing hint, not an asset binding) |
| Seam | a solid or nav node carrying `sets: ["surface","underground"]` (a marker carries it in `params`) is resident in **both** sets instead of only its zone's. Used once: peg-stair flight 1, landing 1 and the shaft walls round them (section 4). Colliders, greybox and bake must build them in both sets |
| Marker `pos` | centre of the bottom face for volumes, doors and floor-standing things; the anchor point for wall-mounted and hanging things |
| Marker `size` | volumes `[x,y,z]`; doors `[width, height, thickness]` (local X = width; `pos` is at the centre of the thickness); the hatch `[x, thickness, z]` |
| Instances of generic ids | `ia_ammo_box_*` carry `params.interactable = "ia_ammo_box"`; `pk_*_<where>` carry `params.pickup` |
| Story | any `nar_/stn_/rv_/hint_/cap_/card_/obj_/ui_/rd_` string in `params` is a key of `design/story.json` (validated). A `nar_/stn_/rv_` line is **played from exactly one place** (`lines`, `line`, `thenLine`, `parley`, or an encounter wave / `onClear`); `pointerLine` and `alsoPlaysWhen` name a second, conditional use of a once-only line. Each `obj_*` is set by exactly one marker or encounter (`params.objective`), following the table in GDD 12.2 |
| Zones | `set` = `surface` / `underground` / `coda`. Sets are never resident together, so `the_lip` and `far_rim` bounds overlap in world space on purpose (the rim is the roof of the overhang). `priority` (interior 10, exterior 0): `zoneAt(x,y,z,set)` returns the highest-priority zone of that set containing the point, so `tally_house` wins the 2 m strip it shares with `plenty_street`. `tally_house` bounds reach down to y −5.5, so the seam is `tally_house` while surface is resident and `the_gallery` after the swap |
| Nav | nodes sit on the floor. `links` are straight walks verified clear for a 0.45 m body (1.0 m in `lift_hall`, for the Tamper). `nav.gates` = links that cross a door. `nav.portals` = the two lift rides, each with an `id` (`ride_lift_hall`, `ride_proving_lift`), its two cage markers and the rigid `transform {from, to, yawDeg}` of the teleport: p′ = to + R(yaw)·(p − from), yaw′ = yaw + yawDeg. `nav.criticalPath` = the red line on the map, 552 m |
| Node tags | `firing_point` (authored Transit points), `problem_position`, `bay_inner` / `bay_mid` / `rib_shelter` (bore), `seam` (the three stair nodes that live in both sets), `knot_stand` (where `knot_hatch_latch` is shot from) |
| Trigger kinds | `lane` (GDD 19.2), `kill`, `bay` (boss arm index sector) |

Counts: 7 zones, 306 solids, 263 markers, 472 nav nodes, 1031 links, 6 encounters.
Footprint 143 × 159 m (GDD cap 300 × 300).

**What "preserve" means below.** Collision is generated from the solids. The art pass may
move a wall face by ±0.25 m, lean it, break its outline and dress it freely, but must not
(a) move a door, (b) close or narrow a walkway under 3 m, (c) move, shrink or lower a
`cover` solid, (d) put anything taller than 0.35 m on a nav link, or (e) block a listed
sightline. If the art needs more than that, change the generator and re-validate.

---

## 1. `the_lip` — mood L1, opening on L0 (surface)

**Look.** A black rock overhang; a white-hot doorway; a sandstone gully snaking downhill
to a low adobe wall and a dead pylon. Peach haze, long mauve shadows coming up the gully
at the player (sun ahead-left).

**Play.** Move, look, read one note, walk 95 m downhill, then `seven_jugs`: six shots, a
forced reload, look up, the seventh.

| What | Where |
|---|---|
| Overhang interior | x 8..20, z 101..110, floor y 14, ceiling y 17 (12 × 9 × 3) |
| `player_start` / `cp_lip_start` | (16, 14, 107.5), facing north |
| Stop one (`prop_camp_one`: **no ash, no fire**) | a swept patch of floor, a flat stone and his coffee pot at (11.5, 14, 104.5); `rd_note_lip` under a spent case (12.2, 14.05, 104.9); `pk_rounds_12_camp1` (10.8, 14, 105.4) |
| `trg_glare` (title, `card_i`, exposure ramp L0→L1 over 20 s) | z 95..99, just outside the mouth |
| Jump ledge with `pk_rounds_6_ledge` | x 21..25, z 94..99, top y 14.5 (0.5 m step: the one optional jump) |
| Gully | four wedge slopes, z 93→9, y 14→0, 14–20 m wide, six rock spurs alternating sides so each reach hides the next |
| Forecourt (puzzle floor) | x 0..22, z −7..9, y 0 |
| Jug gate `door_jug_gate` [G1] | wall x 0..2; opening z −2..2, 2.8 m clear at full height |
| `ia_jug_1..6` | on the gate bar at x 2.25, y 1.55, z −1.75..1.75 (rest positions: the hit spheres ride the bar up 0.2 m per jug) |
| `ia_jug_7` | (2.8, 7.0, 4.4) on the pylon stub arm: above and left of the gate |
| Pylon (landmark) | footprint x 3..5, z 5.5..7.5, 16 m tall |
| Stand spot | (11, 0, 0): 9 m from the jugs |
| `ia_ammo_box_lip` | (8, 0, −6.9) on the north wall, 6 m from the gate |
| `cp_lip_gate` | (5, 0, 0) |

**Sightlines to preserve.**
- *The doorway shot:* from `player_start` north through the overhang mouth, down the first
  reach. The Rule stands due north (`vista_rule`). **Nothing taller than 3 m may stand north
  of z = −7 between x 0 and 26** (the forecourt's north wall is a 3 m town wall for this reason).
- The pylon top is visible from the last two reaches (it is 16 m tall at the mouth's
  south-west corner): the landmark that pulls the player down.
- From the stand spot: all six jugs, the gate, and the seventh jug with its sand thread, in
  one frame without turning more than 35°.

**Free to embellish.** Everything about the rock (strata, overhangs above 3 m, scree under
0.3 m), the spurs' shapes (keep their reach into the gully ±0.5 m), boulders' looks, the
sweep rigging. The slopes are 8–11°; the art may break them into terraces as long as no
step exceeds 0.35 m.

---

## 2. `plenty_street` — mood L1 (surface): Front Street and the pump yard

**Look.** A straight frontier street walked into the light, nine leaning adobe facades,
every door with a struck-through well mark, a celadon ceramic rib breaking the dirt. Beyond
a gatehouse, a walled yard under a 14 m wind-pump on an 8 m ceramic drum.

### 2a. Front Street — `enc_street` (8 Biders; polish round 3: four from the two alleys at once, a file of two from the saddlery)

| What | Where |
|---|---|
| Street proper | x −73..0, z −7..7 (14 m wide) |
| Facades | north z −12..−7, south z 7..12; nine blocks, cross-alleys 3 m wide at x −14.5, −45.5, −61.5 (north) and −21.5, −39.5, −57.5 (south) |
| Alleys (the two loops) | north z −15..−12, south z 12..15 |
| `trg_enc_street` | x −4.5..−1.5 (the gate posts); `card_ii` |
| Kneeler `sp_street_kneeler` (wave A) | (−44.5, 0, −1.9) at the dry trough, 43 m down the centre line |
| Wave B | `sp_street_alley_n` (−45.5, 0, −13.5), `sp_street_alley_s` (−39.5, 0, 13.5) |
| Wave C | `sp_street_saddlery_1..3` in the saddlery doorway x −67.2..−65.2, z 7..11.5; `lane_street` z ±1.5 |
| Wave D | `sp_street_gate` (−77, 0, 0), bursts `door_yard_gate` (x −73.5, z −2..2) |
| Cover, east to west | wagon bed (−10, 3.6); adobe stub A (−19, −3.8); ceramic rib (−28, 4.4); adobe stub B (−37, −3.8); pump post (−46.6, −3.3) and low trough (−44.5, −3.1) |
| Cover rhythm | full-height cover every 9 m, alternating sides; the exposed stretch is x −73..−48, the last 25 m before the yard gate (GDD 9.3 now states both figures) |
| Pickups | `pk_rounds_6_wagon` (−10.6, 0, 5.2); `pk_rounds_6_alley` (−30, 0, 13.5); `pk_canteen_trough` (−42.6, 0, −3.1) |
| Secret `sec_loft_bell` | feed store x −30..−16; loft floor y 3; `sec_loft_bell_rope` (−23.2, 5.05, −8.0) seen through the loft door (x −24..−22.4); the fallen ladder is ramp `st_loft_ladder` (x −28.2..−24.2 along the facade) up to the porch block; inside `pk_rounds_12_loft`, `rd_rain_tally` |
| Gate court | x −79..−74, z −5..5; `pk_rounds_12_yard_gate` now inside the yard by the water cart (−84.6, 0, −1.9; polish round 3); `cp_street_clear` (−70, 0, 0) |
| `ia_yard_door` [G2] + `knot_yard_latch` | door x −80..−79, z −1.3..1.3; knot (−78.92, 1.3, 0.95) on its east face; bursting it sets `obj_yard` |

**Preserve.** The centre lane |z| < 1.5 clear for its whole length (the file, and the
kneeler sightline from the gate: `vista_kneeler`). Cover footprints and heights (all ≥ 2.2 m
except the trough). The cross-alleys and both alleys at 3 m. The loft door opening and the
line from the street centre (−23, 1.65, 0) to the bell rope.

**Embellish.** Facade heights, lean (2–4°), porches that overhang above 2.4 m, signage,
door marks (`prop_door_mark_1..9`; number 9, on the feed store, is the miscounted variant).

### 2b. The pump yard — `enc_yard` (3 Transits, 4 Biders)

| What | Where |
|---|---|
| Yard | x −110..−80, z −14..14 (30 × 28), walls 3 m |
| Wind-pump drum (cover, landmark) | centre (−101, −3), radius 4, 6 m high, with the timber tower (`yd_pump_tower`, r 2, to 14 m) on it; drum door faces east: `sp_yard_t1`, `sp_yard_t2` at (−96.2, 0, −2.4 / −3.6). T1's bell vignette (`vig_yard_bell`) plays `stn_yard_wake` then `nar_transit` |
| `ia_yard_bell` | (−94, 2.2, 2.5) on a post |
| Tank catwalk (problem position) | deck x −88..−83, z 5..10, y 3.5; tank r 1.5 at its centre; boarded on the north side; ramp x −95..−88, z 8.2..9.8 |
| Tank shed | x −110..−106, z 10..14; `sp_yard_t3` (−105.2, 0, 12) |
| Cover | drum; cart (−86, −3.5); stubs at (−92, −9), (−97, 6.2), (−105, 6); tank boards; the ramp wedge |
| Loops | round the drum (5 m to the west wall, 7 m to the north); round the tank (3.5–4 m either side) |
| Firing points (nav tags) | `fp_yard_catwalk` (−87.5, 3.5, 5.6); `fp_yard_far_wall` (−107.5, 0, −11.5); `fp_yard_drum_w`, `fp_yard_stub_n`, `fp_yard_south`, `fp_yard_ne`, `fp_yard_sw` |
| Bider entrances | drum-base grate `sp_yard_grate_1/2` (−102/−100, 0, 2.2); `door_alley` (x −80..−79, z −13.8..−12.2) with `sp_yard_alley_1/2` behind it. After the fight the alley door stays open: a loop back to the north alley |
| `pk_canteen_cart` | (−86.6, 0, −1.9) |
| `door_tally` | north wall, x −89.8..−88.2, 2.4 m tall. **Held shut by the sighting** (below) |
| `cp_yard_clear` | (−88, 0, −10.5), facing **west**: a restart looks at the Dowser |

**The sighting (GDD 9.3).** The Dowser stands **due west**: `vista_dowser` target
(−332.5, 53.6, −10.5), azimuth 270°, elevation 12°, 250 m. That is 45° of azimuth clear of
the sun (315°, 14° up), on the shadowed east face of the far mesa: pale on dark, not in the
glare. `env_backdrop_day` places the card and the mesa at this bearing.

- `trg_dowser` is no longer the whole yard. It is the strip in front of the tally door,
  x −95..−82, z −13.6..−7.8, which every approach to `door_tally` crosses. The validator
  ray-tests eye height at a 0.5 m grid over it: the card is seen from 258 of 263 standable
  points (the five that fail are in the 0.7 m shadow of wall stub 1) and from every nav node
  in it, and from `cp_yard_clear`. The line passes 0.6 m north of the drum and tower, over
  the 3 m west wall, and never near the hall.
- The beat starts when the player is inside the volume **and** the card is in the view cone;
  the 12 s clock starts then. Nothing is narrated before that.
- `door_tally` stays shut and dark until `nar_dowser_gone` has played, or 12 s after the
  volume is first entered, whichever is first. From the moment `enc_yard` is clear a glint
  flashes off his rod every 1.5 s: with the door shut it is the only new thing in the yard.
  If the player has not come near after 20 s the door breadcrumb light comes on anyway (the
  door still waits for the rule above).
- Known limit: a player who walks straight at the door looking north has him 90° to the
  left, off screen, and meets a shut door for up to 12 s. The glint, the shut door and the
  west-facing checkpoint are what turn her; if she never turns, the door opens and the beat
  is missed without being narrated.

**Preserve.** The catwalk height and its sight over the whole yard; the 20 m open line from
the yard door to the drum door (the duel); **nothing taller than 3 m west of x −95 between
z −14 and z −7.5** (the Dowser line), and stub 1 no taller than 2.3 m.

---

## 3. `tally_house` — mood L2 (surface, interior)

**Look.** A civic water-share hall, adobe, flat viga roof at 5 m, shut four days. A long
table with eleven hooded figures. One lantern. Three hairlines of sun.

Interior x −96..−82 (14 m), z −37..−15 (22 m). Entered at the south door.

| What | Where |
|---|---|
| Table | x −89.7..−88.3, z −29.6..−18.6; lanes 5.4 m either side, joined at both ends |
| Seated (`prop_tally_seated`, 9 instanced) + risers | west row x −90.15, east row x −87.85; risers are the two south-most chairs: `sp_tally_riser_w` (−90.15, 0, −19.6), `sp_tally_riser_e` (−87.85, 0, −20.5) |
| `rd_ledger` | (−89, 0.82, −29.2), the table's north head |
| Hatch `ia_hatch` [G3] | floor opening x −93..−89, z −34..−32 (4 × 2, two leaves, so the stair has headroom). The stair runs east under the floor. States: shut (walkable lid) → **ajar** on the knot (0.3 m gap, still impassable, aqua comes up) → **open** when `enc_tally` is clear → shut again by `trg_hatch_close` |
| `knot_hatch_latch` in its cowl | knot (−92.6, 0.9, −34.35), facing **north**, on a latch block inside a ceramic cowl (`ty_latch_cowl_*`: back wall on the hatch's north edge, two cheeks, a hood; 1.4 × 0.5 m, 1.5 m high) at the hatch's north-west corner. Shot from the strip between the hatch and the north wall (`knot_stand` node at (−91.9, 0, −35.5)) |
| Pictogram plate `prop_daycell_plate` | west wall (−95.95, 1.5, −32.8), where the day-cell cable comes down (zone geometry of `env_tally_house`) |
| Dragged table end | against the north wall at (−84.6, −35.6) |
| Hearth, stop two (`prop_camp_two`: a chair and a cup, **not a fire**) | chimney breast x −83.2..−82, z −20..−16.6, its firebox holding the town's own ash, four days cold (dressing); hearthstone 0.3 m with his cup `prop_cup_two` (−83.8, 0.3, −18.2), `rd_note_hearth`, `pk_rounds_12_camp2`, `pk_canteen_hearth`; the head chair at (−85.5, 0, −20) |
| Tally wall | the **south wall east of the door**, x −88..−82, wrapping onto the east wall |
| `ia_ammo_box_tally` | (−90.6, 0, −15.1), west of the door |
| Lantern | (−89, 0.95, −18.9), south end of the table |
| Barred front doors (dressing) | east wall, z −28 |

### `daylight` geometry (true sun vector, back-projected)

Light travels (0.686, −0.242, 0.686): per metre east it drops 0.353 m and drifts 1 m south.
Windows are 1.2 × 0.9 m, centred y 4.5, in the west wall (x −96); each latch is a white
insulator at y 3.5 directly beneath.

| Shutter | Window centre | Blade lands |
|---|---|---|
| `shutter_n` / `ia_latch_n` | (−96, 4.5, −36.3) | the share cloth at (−94.2, 3.87, −34.5); with the cloth down, the **day-cell** at (−92.5, 3.27, −32.8), hung from the tie-beam above the hatch |
| `shutter_m` / `ia_latch_m` | (−96, 4.5, −30.5) | over the heads of the seated (it grazes one hood at x −87.85), onto the head chair (−85.5, 0.8, −20), then the hearthstone and firebox (−84.1, 0.3, −18.6). Lines: `nar_tally_chair`, `nar_tally_chair_2`, `nar_tally_hearth` |
| `shutter_s` / `ia_latch_s` | (−96, 4.5, −24) | the tally wall at (−87, 1.33, −15): a 1.2 × 0.9 m patch on the south wall, 0.6 m east of the door jamb |

`ia_cloth_cord` is at (−94.2, 4.72, −34.5). Stand spot (−86, 0, −23.5) sees all three
latches, the cloth, the day-cell and the top of the latch cowl. **House-rule exception:** the
knot itself is deliberately not visible from there (next paragraph); the lit cowl and the
aqua strips that run to it from the day-cell are.

### `enc_tally` staging (GDD 10, acceptance test 4)

- **The 12 m rule is kept by the cowl.** The knot can be hit only from north of the hatch.
  The validator ray-tests the knot (seven points on its sphere, from standing and jump-apex
  eye heights) from a 0.4 m grid over the whole hall floor, the shut hatch lid and every
  nav node: it can be hit from 123 of 1455 points, all in the north strip, and the nearest
  riser from any of them is **14.3 m** away. From the lanes, the south end and the stand
  spot it cannot be hit at all.
- **Nobody goes below with the fight live.** `enc_tally` locks `door_tally` and
  `ia_hatch`. The knot only releases the hatch to ajar; it opens fully (within 1.5 s) when
  the second riser is down. `trg_hatch_close` and `trg_set_swap` both require
  `enc_tally clear`. `nar_nine` is played by the encounter's `onClear` only.

**Why the targets are where they are (request 1, accepted in GDD 23.1).** With the sun at
14° and 45° off the wall, a blade from a window in a 5 m wall reaches the floor 12.8 m in
and 12.8 m south of its window: it cannot reach the east wall above floor level, and cannot
reach the north end at all. The blockout keeps the true sun (as the art bible requires) and
puts the three targets where blades can land; GDD 9.4 and 13.2 are now written to these
positions. Consequence for play: the two story blades land **behind the player**, in the
south-east corner beside the door they came in by, so the hall is walked twice (a loop).

**Preserve.** Window positions and sizes exactly (the blades are computed from them); the
day-cell and cloth positions; the hatch opening; both lanes at 5 m; the two risers' chairs
at the south end; no furniture over 1.3 m in the blade paths; **the cowl's back wall, cheeks
and hood** (opening it up to the south or the sides breaks test 4), and 2.4 m of clear floor
between the cowl and the north wall.

**Embellish.** Rafters (above 4.95 m at the windows' blade paths), benches against walls,
the share cloth's marks, chalk, anything on the north and west walls below 3 m.

---

## 4. `the_gallery` — mood L3 (underground)

**Look.** A narrow stair of coat pegs dropping 12 m; a cold ceramic proving bay; a 62 m
gallery of pipe banks with aqua strips receding to a point.

| What | Where |
|---|---|
| Peg stair | 2 m wide. Flight 1 east: x −93→−87 (y 0→−4), z −34..−32. Landing 1 (−86, −4, −33): `trg_hatch_close` (the hatch shuts overhead once her feet are on the landing, y −4). Flight 2 south: z −32→−26 (y −4→−8), with `trg_set_swap` on it at z −30.5..−28.5 (surface unloads, underground loads). Landing 2 z −26..−24 with the watcher niche x −85..−83.6 (`prop_watcher`, `vig_watcher`). Flight 3 south: z −24→−18 (y −8→−12). 33.7° ramps |
| Proving bay | x −91..−81, z −18..−10, floor y −12, ceiling −7 |
| `cp_gallery_bay` | (−86, −12, −16.8) |
| `rd_plate_proving` (load-bearing) | north wall (−83.3, −10.4, −17.95), beside the mark, on the critical path |
| Range | plates `ia_range_plate_1..3` edge-on at x −86.5, −88, −89.5 on the south wall line z −10.95 (`pierce`); stand at (−84.4, −12, −10.95) facing west; `rd_plate_line` at (−85, −10.4, −10.05) |
| `ia_line_locker_bay` | south wall (−83.6, −12, −10.25): 4.9 m from the mark |
| `ia_ammo_box_bay` / `pk_canteen_bay` | (−89.5, −12, −17.9) / (−90.2, −12, −16.2) |
| Brass mark step | x −83..−81.4, z −15.8..−14.2, 0.15 m high; eye at (−82.2, −10.2, −15.0) |
| Sighting loop | ring centre (−80.2, −9.98, −14.81): 2.02 m above the bay floor |
| `knot_a` / `knot_b` / `knot_c` | (−74.2, −9.33, −14.24) / (−67.2, −8.56, −13.57) / (−60.2, −7.8, −12.9): 8, 15 and 22 m from the mark on one straight line through the eye |
| Gallery | x −81..−19, z −17.5..−10.5 (7 m), 5 m high; walkway z −15.5..−12.5 between 3 m pipe banks |
| `ia_baffle` [G4] | x −59 (22 m from the bay), opening 3 × 3 m; `cp_gallery_baffle` (−80, −12, −14) |
| The File, wave A | `sp_file_1..6` at x −21.5..−29.5 step 1.6, z −14, facing east; `lane_gallery` x −59..−19 |
| The File, wave R (polish round 5) | `sp_file_10`, `sp_file_11` on flight 3 of the peg stair at (−86, −10.53, −20.2) and (−86, −9.6, −21.6), behind the bay's north wall (not seen from the bay or the gallery). Released with the file down to one when she is within 16 m of `door_gallery_far` (or 25 s on); they run through the bay and the length of the gallery after her |
| The File, wave B | `sp_file_7..9` and `sp_file_12` (polish round 5) wait on the lift-hall gantry behind the far door at (−17.0, −12, −15), (−15.4, −12, −14), (−13.8, −12, −13), (−13.8, −12, −14.7) (zone `lift_hall`, `entersThrough: door_gallery_far`). Lane-following off; lateral offsets −1 / 0 / +1 / −0.4 m, 1.2 m depth stagger. Released 4 s after wave R; the door bursts 1 s later |
| `door_gallery_far` | x −19..−18, opening 3 × 3 m. Opens for wave B and stays open; shut again by `trg_enc_matador`. `cp_file_clear` (−23, −12, −14) when all twelve are down |

Because the line rises from eye height, "low / mid / high" are 2.7 / 3.4 / 4.2 m above the
floor: knot A sits on a pipe elbow arching out of the north bank, B on a cross-pipe valve,
C on the ceiling conduit right of the door.

### The seam (the one place two resident sets meet)

Flight 1, landing 1 and the shaft walls round them (`gl_flight_1`, `gl_landing_1`,
`gl_shaft_wall_n`, `_w_end`, `_s1`, `_e1`, `_w`, `gl_shaft_ceiling`), the three stair nav
nodes on them, `trg_hatch_close` and `light_stair_1` carry `seam: true` and
`sets: ["surface","underground"]`. They are zone `the_gallery` geometry but must be built,
collided and lit in **both** sets: the player walks them while surface is resident, and can
walk back up them to the shut hatch after the swap.

Order of events: `enc_tally` clear → hatch opens → flight 1 → landing 1: `trg_hatch_close`
(hatch shuts; if she is somehow still in the opening it waits) → first turn → flight 2:
`trg_set_swap`. The validator ray-tests from every standable point of `trg_set_swap` to nine
points of the hatch opening: none is visible (81 of 81 rays blocked), so the surface set is
never seen unloading even if the hatch were open. `zoneAt` on the seam: `tally_house` while
surface is resident (its bounds reach y −5.5), `the_gallery` afterwards.

**Preserve.** The mark, loop and three knot positions to the centimetre (acceptance test 6);
nothing may intrude into the walkway volume between y −12 and y −7 along that line; the
walkway at 3 m with no cover east of the baffle; the low row of pegs bare.

**Embellish.** Pipes and conduit anywhere outside the walkway volume; peg dressing; the
niche.

---

## 5. `lift_hall` — mood L4 (underground)

**Look.** A 12 m high machine hall, ten ceramic ribs in two rows, aqua lamps receding east
into fog toward a 9 m ceramic ring.

| What | Where |
|---|---|
| Hall | x −18..20, z −28..0, floor y −15, ceiling −3; with the cage bay (x 21..27, z −17..−11) it is 45 m long |
| Gantry | x −18..−13, z −19..−9, deck y −12; `cp_hall_gantry` (−16.5, −12, −14); `pk_rounds_12_gantry`, `pk_canteen_gantry` at (−14, −12, −18 / −16.8) |
| Ramp | x −18..−15, z −9→−3, down to y −15 (26.6°); `trg_enc_matador` at its foot (it also shuts `door_gallery_far`); `ia_line_locker_hall` (−17.75, −15, −1.6) |
| Ramp-foot cabinet `lh_ramp_cabinet` | x −14.6..−13.4, z −5.4..−4.2, 2.4 m: full-height cover 2.8 m from the ramp foot, in the dead corner between ramp and gantry plinth; it stuns a charge like a rib. The farthest hall-floor node from full-height cover is now 7.1 m (was 9.5) |
| Ribs (1.6 × 2.4 m, full height) | x −9, −3, 3, 9, 15 at z −18 and z −10: a 5.6 m nave and two 8–9 m aisles; two loops round the rows |
| Tamper `sp_hall_tamper` | (−6, −15, −25.3) facing the bulkhead on the north wall at x −6; 16 m from the gantry door, 3 m below (`vista_tamper`) |
| Vignette grate | `sp_hall_vig_bider` (−4.4, −15, −23.8), inside the slam ring |
| Add grates | `sp_hall_grate_1/2` (12, −24.5 / −3.5) wave B at t = 40 s; `_3/4` (18, −22 / −6) wave C at t = 65 s. Clock only; a wave whose time comes with the Tamper dead is cancelled |
| Ring + cage | cage interior **6 × 6 × 3.5 m** (x 21..27, z −17..−11, y −15..−11.5), gate on the west: `door_lift_cage` [G5], 6 × 3.5 m; `ia_lift_lever` (26.8, −13.8, −14) on the wall opposite the gate; `lift_depart_hall` (24, −15, −14); ride `ride_lift_hall` → `lift_arrival_bore` |
| Wall diagram | `prop_hall_diagram` on the east wall at z −21.5, 4 m tall; `trg_hall_diagram` |
| After-fight cache | `pk_rounds_12_cage`, `pk_canteen_cage` at (18.8, −15, −9.6 / −8.4) |
| Secret `sec_cold_bay` | bay x 2..10, z 1..7; shutter `door_cold_bay` x 4.5..7.5 (`pierce`); `knot_cold_bay` (3, −13.4, 1.12) seen through a 0.4 m slot in the south wall in line with rib s3 (x 3); inside `ia_line_locker_secret`, `pk_rounds_12_cold_bay`, `rd_plate_service`, the clean Tamper |

**Preserve.** Rib positions and footprints (charge-stun and slam line-of-sight depend on
them); 4.4 m gaps between ribs; the floor free of anything over 0.35 m except the ramp-foot
cabinet (the Tamper needs 1 m clearance everywhere it can walk); the gantry-to-bulkhead sightline, which passes north
of rib n1.

**Known limit.** The slot makes the cold-bay knot visible from behind rib s3 and also from
two narrow slivers of the nave either side of that rib; "only from behind the third rib"
needs a shroud in the art pass if it matters.

---

## 6. `the_bore` — mood L5 (underground)

**Look.** A round chamber 30 m across and 14 m high, six ribs, a 6 m violet bore behind a
kerb, the Windlass hanging over it. Seen first from a grille catwalk 8 m up.

Chamber centre (bore axis) **(14, −44, 96)**. Bearings are compass bearings from that
centre (0 = north, clockwise).

| What | Where |
|---|---|
| Arrival cage bay | the **same cage as the lift hall's, turned 180°**: interior x −1..5, z 80..86, y −36..−32.5 (6 × 6 × 3.5), gate on the **east**; `lift_arrival_bore` (2, −36, 83). Outside the gate a bulkhead (x 5..5.4) with a 2 × 2.6 m hatchway onto the catwalk |
| Catwalk | x 5..23 (18 m), z 82..84, deck y −36, grilled; crosses the chamber's north side 13 m from the axis; `trg_windlass_seen` at its middle |
| Stair | flight 1 north x 26..28, z 82→76 (−36→−40); landing; flight 2 west x 26→20, z 74..76 (−40→−44) |
| Antechamber | x 9..19, z 66..80, floor −44, 5 m high; entered from the east at z 74..76; `cp_bore_ante` (17.5, −44, 75) |
| Cold camp three | embers (11.5, −44, 70); `pk_rounds_12_camp3`, `pk_canteen_ante_1/2`, `ia_ammo_box_ante` (9.25, −44, 76) |
| `ia_cradle` / `rd_note_cradle` (load-bearing) | south wall, x 10.9, y −42.5 / −43.1: **right** of the door as faced (west). Plays `nar_cradle`, `nar_cradle_2`; both also play when `stn_ask_3` is put if not yet heard |
| Station plate "4", wall diagram | south wall x 16.3 and x 17.7: left of the door as faced (east) |
| `door_bore` [G6] | disc 3 × 3 m, 0.25 m thick, centre (14, −44, 80.125): its antechamber face is at z 80.0, flush with the wall. Ports `ia_ask_port_1..8` on a 1.0 m ring about (14, −42.5, 79.98), 2 cm proud of that face, numbered clockwise from the top |
| `the_asking` volume `trg_pz_asking` | x 9..19, z 72..80: the antechamber within 8 m of the door. The listening ring (`pz_listening_lamps`: dark on questions 1 and 2, 0.75 s a lamp on question 3) fills only in here |
| Chamber | radius 15; floor is an annulus round the bore (r 3) |
| Kerb | r 3..3.6. `bo_kerb` is 0.6 m all round; six merlons `bo_kerb_hi_1..6` raise it to 1.2 m over 25° of arc at the rib bearings (30°, 90°, …). In front of each proving mark that leaves a **35° (2 m) notch at 0.6 m**. `bo_kerb_guard` (invisible, `playerOnly`) keeps the whole ring uncrossable to 1.2 m |
| Kept-round target `bore_opening` | marker at (14, **−42.8**, 96): the top disc of the target volume, a cylinder r 3.0 on the axis from y −42.8 (kerb top) down to y −50. The kept round fires when the aim ray enters it; kerb, guard and Windlass are ignored by that test |
| Bays / proving marks | bay *k* at bearing 60·(k−1): `ia_proving_mark_1..6` at r 4.9. Bay 1 is the door bay |
| Ribs | bearings 30, 90, 150, 210, 270, 330; r 7.5..10.5, 1.6 m thick, full height |
| Kerb grates | `sp_bore_grate_1..3` at bearings 90, 210, 330, r 4.5 (see section 8 for the add rule) |
| Cartridge points | `ia_ammo_box_bore_e` / `_w` on the wall at bearings 90 / 270, each directly behind a rib |
| `ia_line_locker_bore` | bearing 168 on the wall, beside the lift gate |
| `door_proving_lift` [G7] | bearing 180: (14, −44, 111.5), opening 3 × 3 m in a 1 m wall; **proving cage** interior 4 × 4 × 3.5 m (x 12..16, z 112..116); `lift_depart_bore` (14, −44, 114); `ia_proving_lift`; ride `ride_proving_lift` |
| Boss | `sp_windlass` at the axis; drum centre 2 m out and 4 m up; arm indexes at the six bay bearings |
| Boss checkpoints | `cp_boss_p1..p3`, `cp_boss_proven` at (14, −44, 83.5..85), just inside the door |

**Layout choice (accepted, GDD 23.1).** The door, the lift gate and the six proving marks
are on bay centres (0° + 60°k) and the ribs between them (30° + 60°k). The two cartridge
points therefore sit behind ribs: the obvious reload spots.

**The kept shot (GDD 6.6 rule 4, acceptance test 8).** From the centre of a proving mark
(r 4.9, eye 1.65 m) the validator checks two things at all six marks. (1) *The test is
generous:* every aim from 5° to 60° below the horizon within ±25° of the bearing to the axis
enters the target volume; a level aim at the far wall does not. (2) *The picture matches:*
through the real kerb (notch 0.6 m, guard ignored because it is invisible) the open bore is
actually seen from **3.5° to 29° below the horizon**, a 25.5° window (it was 9.5° with a
1.2 m kerb). Steeper than 29° the crosshair is on the notch's kerb face but the round still
fires, because the test ignores the kerb.

**The two rides are rigid teleports between identical cages** (validated on a 0.3 m lattice:
5082 of 5082 points agree for the hall lift, 2640 of 2640 for the proving lift).

| Ride | From (cage floor centre) | To | Yaw | Cage interior |
|---|---|---|---|---|
| `ride_lift_hall` | `lift_depart_hall` (24, −15, −14), gate west | `lift_arrival_bore` (2, −36, 83), gate east | 180° | 6 × 3.5 × 6 m (w × h × d) |
| `ride_proving_lift` | `lift_depart_bore` (14, −44, 114), gate north | `lift_arrival_rim` (14, 18, 114), gate north | 0° | 4 × 3.5 × 4 m |

The hall lift's arrival cage is the departure cage turned half a turn about its own centre,
so the player's offset and facing carry over exactly (position rotated 180° about the cage
centre, yaw + 180°) and the gate she entered by on the west opens on the east. Nothing
outside the cage is visible during the ride. The arrival gate is the cage instance's own
`gate` node; there is no door marker for it. **The proving lift is a different, smaller
cage** (a lift for people; the hall's is for loads): it needs its own asset.

**Preserve.** Six-fold symmetry of everything inside r 15 except the catwalk, door and lift
gate (the bake is one 60° sector; the arrival cage bay breaks the wall at 300°–330° above
catwalk height only); rib footprints; the kerb radius, its 0.6 m notches centred on the marks
and its 1.2 m merlons; open floor
between r 3.6 and r 7.5 (the inner ring walk) and between r 10.5 and r 15 (the outer ring
walk); the view from the catwalk centre to the drum.

**Embellish.** The roof, cables, the wall panelling, the antechamber's dust.

---

## 7. `far_rim` — mood L6 (coda)

**Look.** Blue hour on the roof of the overhang. A black rock frame, a ledge, a flat stone.

| What | Where |
|---|---|
| Ledge | x −1..29, z 101..111, y 18 (30 × 10 open, 20 deep with the rock frame) |
| Cage in the rock frame | interior x 12..16, z 112..116, 3.5 m high, behind a 1 m rock frame (z 111..112) with a 3 × 3 m opening: the same room as the bore end, 62 m straight above it. `lift_arrival_rim` / `cp_rim` (14, 18, 114), facing north |
| The stone | `rim_stone` at (1.6, 18, 102.4); `ia_stone_round` (1.6, 18.4, 102.4); `rd_note_stone`; `light_rim_stone_glint` (a brass `star4` glint every 2.5 s: the only brass on the ledge); 17 m from the cage, to the left of the view it opens on |
| `trg_stone` | x 0..5, z 101..105: `nar_stone_1..4`. **The only thing that arms the ending** |
| `trg_lamps` | x 0..10, z 101.5..107.5, the north-west part of the ledge: `nar_lamps`, `nar_lamps_count`, so the town view and the stone share a frame |
| `vista_plenty` | from (6, 18, 104) north-west and down to the town card |
| `vista_rim_rule` / `vista_fire` | due north |
| `exit_rim` | north edge strip x 8..28, z 100.4..102, `requires: trg_stone`. Before the stone has been found it is only a view |

**How the stage ends (GDD 9.8).** (a) taking `ia_stone_round` (take branch); (b) 40 quiet seconds more than 4 m from the stone after its last line, the
clock standing still while a line is on screen (leave branch; polish round 5, `ending.ts` `LEAVE_MIN`: the marker's
`endAfterSeconds` 25 is only a floor under it); (c) walking into `exit_rim` once `trg_stone` has fired and
its lines have played (leave branch). Walking straight out of the cage to the north edge
does **nothing**. Fail-safes on `cp_rim`: at 60 s without `trg_stone` the glint doubles in
size and rate and `nar_stone_1` plays as a pointer; at 150 s the ending proceeds down the
leave branch from wherever she stands. `nar_fire` and `nar_last` are played by the ending
(`exit_rim.lines`) only.

**Preserve.** Open sky north and north-west from the whole ledge; the two boulders only as
foreground (max 1.6 m); the cage frame's black silhouette.

---

## 8. Encounters at a glance

| Id | Trigger marker | Spawns | Locks |
|---|---|---|---|
| `enc_street` | `trg_enc_street` | A kneeler; B four out of the two alley mouths nearest the gate (north x −14.5, south x −21.5; polish round 4); C two in file from the saddlery, 2 s after B; D one through the yard gate | — |
| `enc_yard` | `knot_yard_latch` | T1; then T2 + T3; +2 s two from the grate; +10 s two from the alley door; a cartridge point inside the yard door (`ia_ammo_box_yard`, polish round 4) | `door_tally` (then held by `trg_dowser`) |
| `enc_tally` | `knot_hatch_latch` (hatch ajar) | the two south-end seated, at least 14.3 m from wherever the knot can be shot | `door_tally`, `ia_hatch` |
| `enc_file` | `ia_baffle` | A: six queued at the far door. R (polish round 5: with the file down to one, when she is within 16 m of `door_gallery_far`, or 25 s after the file was down to one): two down the peg stair behind her, `nar_file_behind`. B (4 s after R): a bang, `nar_file_more`, and 1 s later the door bursts on four, not in file | `door_gallery_far` (opened by wave B) |
| `enc_matador` | `trg_enc_matador`, or damage to the Tamper in its vignette | Tamper; B two grates at 40 s; C two grates at 65 s; cancelled if the Tamper is dead | `door_gallery_far`, `door_lift_cage` |
| `enc_windlass` | `trg_enc_windlass` | boss; adds from three kerb grates (repeating) | `door_bore`, `door_proving_lift` |

**Clear rules.** `enc_file`: all twelve down. `enc_matador`: the Tamper dead and every Bider
already spawned down. `enc_windlass.onClear` commits no checkpoint (`cp_boss_proven` commits
when the kept round is fired).

**Spawn distance.** One-shot waves are at least 12 m from their trigger (validated). For
`enc_tally` the trigger is a knot, so the rule is checked against every place the knot can
be hit from (section 3). **Repeating adds** are checked against the player, not the
trigger: a wave with `repeating: true` carries `pick` and `minPlayerDistance`. In the bore
the adds use the grate **farthest** from the player and never one within 7 m (hold and
retry each second otherwise). The 12 m rule cannot hold at the kerb foot of a 30 m room:
the farthest grate is 8.9 m away at worst from any floor node and over 10 m from the outer
ring, so emergence there is the full 1.5 s and shootable.

## 9. What the validator guarantees (`node tools/validate_layout.mjs`)

Schema; unique ids; every solid, marker and nav node inside its zone; same-set zones do not
overlap; every referenced id and story key exists; every GDD id from sections 10, 13, 14
and 18 has a marker; encounter compositions match the GDD; fixed pickup placements per
zone; an `ia_ammo_box` within 10 m of each puzzle's stand spot; nav nodes on a floor, not
in a solid, with body room; every nav link walkable (floor continuous, no step over
0.45 m, no solid in the way); the graph connected from `player_start` to the exit with no
stranded nodes; the critical path made of real links; door openings ≥ 1.2 × 2.2 m and
actually clear in the solids; floors under start, checkpoints, pickups and spawns; spawns
≥ 12 m from their trigger; ramps ≤ 45°; footprint ≤ 300 × 300 m.

Added in version 2 (16 checks in all, 0 warnings):

- **sightlines**: every `vista_*` marker sees its target (ray-tested against the solids of
  its resident set; grilles, invisible and player-only solids do not block); the Dowser is
  at least 25° of azimuth from the sun and seen from at least 92 % of `trg_dowser` and from
  `cp_yard_clear`; the hatch opening is not visible from `trg_set_swap`.
- **story wiring**: no `nar_/stn_/rv_` line is played from two places (unless listed in
  `once_only`); every `obj_*` key of story.json is set exactly once; the revision 2 keys
  (`nar_tally_chair_2`, `nar_cradle_2`, `nar_file_more`) are wired.
- **staging rules**: `exit_rim` requires `trg_stone` and does not overlap it; the rim
  fail-safes exist; `enc_tally` locks the hatch, which goes ajar then open; GDD test 4 (the
  knot and the risers); the seam solids are in both sets; `enc_matador` runs on the clock;
  repeating adds keep their player distance; the two cages of each ride are the same room
  and the cage door is no taller than the cage.
- **kept round**: GDD test 8's aim window from all six marks, and at least 20° of real
  visibility into the bore through the kerb.
- zone overlaps need different priorities; a spawn may stand in a neighbour zone only with
  `entersThrough` a door its wave opens.

Mutation tests confirm it fails when it should: the original sixteen
(`scratch/level-design/negative_tests.mjs`) and twenty-one for the new rules
(`scratch/level-reviser/negative_tests_r2.mjs`), all caught.

It does **not** check cover quality or pacing; those were judged on the map.

## 10. Revision 2: what changed and why

| Critic finding | Change |
|---|---|
| The ending could be skipped by walking to the north edge | `exit_rim` requires `trg_stone`; 60 s and 150 s fail-safes on `cp_rim`; brass glint on the stone |
| Risers could stand up 3–4 m from the player | `knot_hatch_latch` moved into a north-facing cowl at the hatch's north-west corner: hittable only from 14.3 m or more from both risers. Risers and the nine static seated are unchanged |
| The Dowser stood 4° under the sun and was hidden from most of the yard | card moved due west (azimuth 270°, elevation 12°); `trg_dowser` shrunk to the LoS-verified door approach; `door_tally` held until the beat is over; `cp_yard_clear` moved and faces him; `nar_transit` moved to the bell vignette |
| Lift cages did not match | hall cage 6 × 6 × 3.5 m at both ends (arrival bay rebuilt, turned 180°); proving cage 4 × 4 × 3.5 m at both ends (rim frame rebuilt); `door_lift_cage` 6 × 3.5 m; transforms in `nav.portals` |
| The kept shot was hidden by the kerb | `bore_opening` raised to kerb top and given the target volume; kerb notched to 0.6 m in front of each mark with a player-only guard |
| The hatch could be walked down with `enc_tally` live | hatch ajar on the knot, open on clear, locked by the encounter; swap triggers require the clear |
| Cross-set seam on the peg stair | `seam` / `sets` on flight 1, landing 1 and their walls; `trg_hatch_close` on landing 1; `trg_set_swap` moved to flight 2; `tally_house` bounds down to y −5.5; zone `priority` |
| Story duplicates and orphans | one place per line; objectives per GDD 12.2 (`obj_yard` on the yard knot, `obj_street` on `cp_lip_gate`, `obj_tally_hatch` on the day-cell, `obj_gallery` / `obj_hall` / `obj_ante` / `obj_rim` on their checkpoints, `obj_file` on `cp_gallery_baffle`); no checkpoint on `enc_windlass.onClear` |
| Lift-hall cover warning at the ramp foot | `lh_ramp_cabinet` |
| Smaller items | cradle text corrected (right of the door); `door_bore` face at z 80.0; add-spawn rule (section 8); street figures match GDD 9.3; stops one and two are no longer fires |
| Design revision 2 (GDD 23.2) | `enc_file` wave B (`sp_file_7..9`), `enc_matador` clock waves, `nar_tally_chair_2`, `nar_cradle_2`, listening ring 0.75 s, `trg_pz_asking` 8 m, vignette ids, ride ids |

## 11. Polish round 4 (closer, 2026-10-05)

- **Section 7, the last view.** The view eased to the fire stands 0.15 of the angle off it toward the town (0.35
  before): the fire 5.3 degrees right of centre, clear of the end card's panel. The town card is drawn 12.5 m east of
  `vista_plenty.target`; one leaning dead line pylon stands as a card 42 m out at game (-0.9, 61). At the stone she is
  offered what she looks at (TAKE at the round, READ at the note). On the take branch only `nar_stone_1` of the
  stone's unstarted lines is kept; `nar_rim_2` / `nar_rim_3` wait until the town is within 35 degrees of her view.
- **Section 2, the sighting.** The 12 s clock does not open `door_tally` while `nar_dowser_seen` is on screen.
- **Section 4 / 8, `enc_file` wave B** is the ambush above (`sp_file_7..9` are spawned behind the shut door).
- **Section 5.** The Tamper and the Biders take the ramp to the gantry (no perch). Known pocket: between
  `lh_ramp_cabinet`, the ramp's side and the gantry plinth, about (-14.7, -15, -5.7) (open for round 5).
- **Section 6.** On a first arrival at each Windlass phase she has at least 67 health; as phase 1 breaks a
  `pk_rounds_12` falls at her feet under 12 in reserve. The world's ask comes 1.5 s into phase 3a.

## 12. Polish round 5 (closer, 2026-10-06)

The layout is final (268 markers); what follows is behaviour in `src/world` that the markers' notes do not show.

- **Section 7, leaving the stone.** 40 quiet seconds away (more than 4 m, after the stone's last line, no line on
  screen), not 25: the notes on `trg_stone` and `exit_rim` still say 25 and cannot change. The north edge and the
  150 s fail-safe are unchanged. **The take** is answered on its tick (`nar_take_1`, then `nar_take_2`); none of the
  stone's four lines is said after a take; the lamps' lines, if unsaid, follow the take's with her view eased up to
  the plain and the town; the fire kindles after them.
- **Section 2, the yard latch.** `nar_first_knot` is said when she first looks at `knot_yard_latch` (within 26 m and
  14 degrees, no fight live); if she shoots first it must start within 1.5 s of the burst or is dropped. `nar_marks`
  (and `trg_hall_diagram`'s line) is dropped if another fight is live when its turn comes.
- **Section 4, the watcher.** `nar_watcher_1` is dropped once she is 10 m from the niche, `nar_watcher_2` once she is
  13 m on or if the first was never shown.
- **Section 6, the Windlass.** A retry of phase 1, 2 or 3a holds the first attack 4 s; full health on Easy and
  Normal. The kept round's first hint is `hint_kept_1`; `nar_office` is said only after the proof.
- **Section 7, the rim's look.** The mesa runs on east and west of the ledge as wings of the rim's own cliff (cards
  in `env_backdrop_dusk`, outside the zone's chunk box x -2 .. 30); the rock room round the proving lift is lit by
  the afterglow through its opening (sub-mood `L6c` beyond z 111.8). No collider, footprint or marker changed.
- **Section 5, the lift hall's ring** stands at level 1.0 (1.5) with panel joints round it. The pocket beside
  `lh_ramp_cabinet` is unchanged (known gap).
