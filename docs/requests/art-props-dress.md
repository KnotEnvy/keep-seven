# Requests from `art-props-dress` (props_dress: 29 static props)

Status of the piece: all 29 assets are final files (`node tools/asset-status.mjs --owner props_dress`: 0 placeholders at
P0, P1 and P2). The rows below are what other owners need to know or do. Each row says who it is for.

## 1. To `art-props-mech` (owner of `blender/tex/tx_mask.py`): redraw region `card_dowser` (DONE by art-props-mech: the drawing is in `blender/tex/tx_mask.py` `card_dowser`, tx_mask rebuilt; glint_px now [122.0, 159.144]; rebuild `card_dowser` by id) (VERIFIED by art-props-dress: `card_dowser` rebuilt against the new region, `shots/art-props-dress/card_dowser_game.png`, the glint test of `tests/art_props/dress/variants.test.mjs` passes)

The Dowser card (`card_dowser`, P0) shows the drawing of the `card_dowser` region of `tx_mask`. The foundation's
drawing reads as a figure facing us (a symmetric coat split by a long vent into what look like two trouser legs). ART_BIBLE
6.5 asks for **three-quarter away**, clerkly, upright, a forked rod held low. I have drawn a replacement:

- **Same region, same rectangle** (`card_dowser`: x 896, y 192, 128 x 288 px): nothing moves, no other region changes.
- **Drop-in code**: the function `card_dowser(w, h)` in `scratch/art-props-dress/dowser_card.py` has the signature and
  the return value of the one in `tx_mask.py` (`(image, {"glint_px": [x, y]})`). Replace the body of
  `tx_mask.card_dowser` with it (it uses only `Canvas`, `td.sd_polygon`, `td.sd_box`, `td.sd_segment`, `np`).
- **Reference image**: `shots/art-props-dress/card_dowser_request.png` (left: the current drawing; right: the
  replacement; the small cross is the glint). Run `tools/blender.sh -b --factory-startup -P scratch/art-props-dress/dowser_card.py`
  to regenerate it.
- What changes for others: only the pixels of that region and its `glint_px` (122.0, 159.1 instead of 122.9, 170.7).
  `card_dowser.py` reads `glint_px` from `mask_regions.json`, so the build driver rebuilds the card by itself and its
  `glint` empty follows the rod tip (`tests/art_props/dress/variants.test.mjs` checks the glint lies on a drawn texel).

No palette cell or other mask region is requested: every colour of the 29 assets is an existing `tx_palette` cell
times `COLOR_0` (a paler cell where a dust skirt or a worn edge must rise above the base colour), and the decals use
`strike`, `tally`, `plate_lines`, `mark_cast`, `wordmark`, `picto_line` as they are.

## 2. To `art-env-exterior` (embeds the street, lip and rim props) (FYI; one decision needed from the integrator)

- **`prop_rim_stone` and `ia_stone_round`: the order's two numbers do not fit together, so the slab is offset.** The
  order asks for seven seats 0.11 m apart AND for seat 7 to stand on the layout's `ia_stone_round` when the slab stands
  at `rim_stone` (both at x 1.6, z 102.4). A 0.9 m slab centred on its pivot cannot hold a 0.66 m row that starts at its
  centre. I kept both numbers: **seat n is at asset-local (x, y, z) = (-0.11 * (7 - n), 0.12, 0)** (game axes: +X right,
  +Z front), seat 7 on the pivot column, and the slab's body runs from x = -0.78 to +0.12 (its size is still
  0.9 x 0.12 x 0.5). Place the six spent `prop_cartridge_kept` cases in seats 1-6 at those points (rotated with the slab).
  The collider solid `rim_stone` (1.3 x 0.35 x 0.9) is centred on the pivot, so the slab's -X end runs 0.13 m past it.
  Also: `ia_stone_round` is at y 18.4 while the slab's top is at 18.12 if it stands at y 18.0: either raise the slab on
  the natural rock shelf by 0.28 m or lower the marker (integrator / level design).
- **`rd_note` / `note_lip`** is at (12.2, 14.05, 104.9), 0.7 m east of `prop_camp_one` (11.5, 14, 104.5) where the
  flat stone stands; its params say "under a spent case on the flat stone". The stone is 0.5 x 0.35 m: the note will not
  be on it unless one of the two markers moves (level design).
- **`prop_trough_pump`** is one asset of 2.4 x 1.6 x 0.6 m as the order says: the trough with the hand-pump post at its
  WEST (-X) end, both inside the 2.4 m. The layout's separate full-height cover solid `st_cover_pump_post`
  (1.3 x 2.6 x 1.3 m, 2.1 m west of the trough's centre) is **not** filled by this asset: it needs zone geometry (a
  boarded pump housing or a well-head) or a smaller solid. Placed unrotated at the trough solid, the pump lands at the
  west end, nearest that solid; if the zone applies `rotY + 180` it lands at the east end.
- **`prop_wagon_tipped`** measures 3.76 x 2.25 x 1.75 m over everything (the bed is 3.3 x 1.5 x 0.8; the canted wheel in
  the air rises to 2.25 m and reaches 0.25 m behind the 1.5 m collider on the back (south) side; the snapped tongue and
  the swung tail board stick out 0.1 m at the ends). Its front (asset +Z) is the open bed with the drift in it: face it
  to the street.
- **`prop_water_cart`** measures 3.20 x 2.33 x 1.63 m: the barrel's tail rises to 2.33 m because the cart has pitched
  forward onto its shaft tips (the collider is 2.1 m high).
- Bake class: all of these are `VL` + `placedBy: zone`; their files carry unlit tint x AO x gradients (dust skirt and top
  bleach already in the colour). Long boards carry edge loops every 0.6-0.8 m for your vertex-light bake.

## 3. To `art-env-interior` (embeds the Tally House, gallery and bore props) (FYI)

- **`prop_tally_table`**: top between 0.76 and 0.80 m (the four leaves sit at different heights and sag between
  trestles); footprint exactly 1.4 x 11.0 m. The eleven pairs of hand patches are placed from the layout's
  `prop_tally_seated.params.seats` and the two riser markers, so the chairs you place there line up with them
  (`tests/art_props/dress/variants.test.mjs`). The north end's top is at about 0.79 m.
- **`rd_ledger`** lies **open** (0.6 x 0.42 m, 3 cm thick at the spine), base at its pivot. Its marker is at y 0.82,
  about 3 cm above the table top there (0.79): set it on the table's surface, not at the raw marker height.
- **`prop_chair`**: rush seat rim at 0.45 m (its middle has sunk to 0.43); front legs stand 1 cm proud of the seat.
- **`prop_head_chair`**: canvas seat at 0.45 m; the canvas back band spans 0.60-0.80 m, so the middle blade (at 0.798 m
  over the marker) lands on the back band. It is the one clean, pale, foreign thing in the room.
- **`prop_camp_ash`**: `ash_cold` for the Tally firebox, `ash_embers` for stop three. `ash_embers` has `m_emis` faces
  (the ember cells: G = 0.5, the flicker group; one cell is `flame_core`): they keep their material through
  `zone.embed_prop` and land in the chunk's `m_emis` mesh.
- **`rd_note`**: `note_cradle` is tucked into the niche lip: its back leaf lies flat at the pivot, its front leaf hangs
  9 cm down over the lip (it reaches y -0.09 below the pivot). The other three lie flat within 2 cm of the pivot plane.
- **`ia_proving_mark`**: 0.5 m disc, 6 mm proud at the rim, 2 mm in the field; the plumb glyph reads upright from the
  asset's front (+Z). Dark brass; your `mark_glows` lamp set lights it.
- **`rd_plate`** (`plate_line`, `plate_proving`, `plate_service`): 0.6 x 0.34 m, 6 mm proud, back at the pivot (wall
  plane). Each variant is one mesh with `m_prop` (cast steel) and `m_mask` (the words) faces.

## 4. To `code-world` / `code-render` (FYI)

- **Wind**: `prop_coat_hung` (all three variants) and `prop_strain_cloth` carry the mesh extra `wind: 1`; both hang
  below their pivot (the fixed end), so "height above the pivot" is negative: the sway weight is the distance BELOW it.
- **`prop_lantern`**: `lantern_lit` glows through the palette's emissive cells on `m_prop` (`flame` on the flame cross;
  the horn panes are warm, not emissive). One pane is broken out of each lantern (that is how the flame is seen).
- **`card_dowser`**: two triangles facing +Z, `m_mask`, COLOR_0 `dowser_pale`, bake `UNLIT`; `glint` at the rod tip.
- **`pk_canteen`**: the tin neck and collar (+X side of the canteen) are left clean and bright for the pickup glint.

## 5. Second look-and-improve pass (FYI: nothing for anyone to do; zones re-embed on their next build)

Names, pivots, node names, variant names and sizes are unchanged; only shapes and colours moved.

- **`prop_coat_hung`** (all three variants rebuilt): the sleeves now hang flat against the flanks instead of standing off the
  coat; `coat_shawl` is a three-cornered shawl (long point down the back, one end thrown across the front). Boxes:
  long 0.52 x 1.13 x 0.17 m, still hanging below the peg pivot, `wind: 1` kept.
- **`pk_canteen`**: the strap is a smooth ribbon (over the face, and a curl of slack on the ground reaching 0.16 m to -X / -Z
  of the body: the footprint is 0.32 x 0.30 m, as before). 220 / 220 triangles: no slack left.
- **`prop_coffee_pot`**: the handle is a curved ear (156 / 160).
- **`prop_rim_stone`** (`art-env-exterior`): the back (+Z is front; the bite is on the -Z edge, between seats 5 and 7) has
  lost a bite with the flake lying under it; the seats did not move (seat n at x = -0.11 (7 - n), seat 7 on the pivot).

## 6. Fix pass after the critic (FYI for the zone builders and the integrator; one request)

Names, pivots, node names, variant names are unchanged. All 29 raw exports were rebuilt (vertices now lie on a
1/4096 m grid), so **every zone that embeds a dress prop should be rebuilt against the current `blender/export/props/`**
(the chunks still hold older exports of at least `prop_coffee_pot` and `prop_rim_stone`).

- **`prop_barrel`**, **`prop_water_cart`**: the hoops are back, as real steps (barrel 0.61 m across at the middle hoop;
  the cart's barrel is unchanged in size). `prop_water_cart` 893 / 900 triangles.
- **`ia_proving_mark`** (`art-env-interior`): now an 18-sided disc whose rim stands 6 mm proud at its OUTER edge with no
  outer wall (the triangles went into the round). It is meant to sit in the floor at its pivot height; if a zone floor
  is not flat there, the 6 mm edge would show a gap from below.
- **`pk_canteen`**: footprint now 0.28 x 0.30 m (the slack strap end is shorter).
- **`prop_coat_hung` `coat_shawl`**: 0.86 m long (was 0.80), with a border stripe in `town_paint`.
- **`prop_strain_cloth`**: now folded over its line: 0.6 m hangs on the asset's front side, 0.2 m behind;
  it needs 3 cm of clearance behind the line.
- **Still open for the integrator (unchanged from sections 2-3):** `ia_stone_round` 0.28 m above the slab top;
  `note_lip` 0.7 m off the flat stone; `st_cover_pump_post` not filled by the trough asset; `rd_ledger` marker 3 cm above
  the table.
- **Request to the zone owners / integrator:** after the rebuild, one in-zone frame per stop (pot + stone, head chair +
  cup, embers + kettle, rim stone) so AO and contact can be judged under the baked light. None exists yet.

## Art integrator, polish round 2 (2026-10-04): what was decided on the rows above

| Row | Decision | Where |
|---|---|---|
| 2: `prop_rim_stone` seat 7 against `ia_stone_round`; the slab 0.13 m past its solid; marker 0.28 m above the slab | **APPLIED.** The slab's pivot (seat 7) is placed at `ia_stone_round` (x, z); the marker's y is the seat as built, 18.356 (shelf top 18.24 + slab 0.12 - seat 4 mm); `light_rim_stone_glint` 18.40, `rd_note_stone` 18.362. The solid `rim_stone` is now the drawn rock shelf under the slab (1.95 x 0.35 x 0.9 m, centred 0.33 m along the slab from seat 7: as long as the shelf, as deep and high as before so the nav node beside it stays standable), so nothing drawn is walk-through | `tools/gen_layout.mjs`, `blender/env_exterior/env_far_rim.py`; `shots/integrate-art/game_low/x_rim_stone.png` |
| 2: `rd_note_lip` 0.7 m off the flat stone | **APPLIED.** Marker moved onto the stone, beside the pot: (11.373, 14.085, 104.546) | `tools/gen_layout.mjs`; `shots/integrate-art/game_low/x_camp_one.png` |
| 2: `st_cover_pump_post` not filled by the trough asset | **NO CHANGE NEEDED.** `art-env-exterior` built the boarded well-head on that solid (its openings test: 100 % filled) | `blender/env_exterior/street_parts.py` |
| 2: wagon 3.76 x 2.25 x 1.75 and cart 3.2 x 2.33 x 1.63 against their cover solids | **APPLIED** (README ruling 22). Wagon: `st_cover_wagon` is the wheel end (1.5 x 2.1 x 1.6, full-height cover), new `st_wagon_bed` is the bed (2.2 x 1.6 x 1.6). Cart: `yd_cover_cart` is the barrel (2.2 x 2.0 x 1.62), new `yd_cart_shafts` (1.14 x 0.45 x 0.9, low). Both keep the prop where it stood (`propPivot` on the solid). Layout validator: 16 checks, 0 warnings; one nav link moved (`n_st_062`-`n_st_066` out, `n_st_151`-`n_st_157` in) | `tools/gen_layout.mjs`, `blender/env_exterior/street_yard.py` |
| 3: `rd_ledger` marker 3 cm above the table | **APPLIED.** y 0.795 (top measured 0.794 at the north end) | `shots/integrate-art/game_low/x_ledger.png` |
| 6: one in-zone frame per stop | **DONE**: `shots/integrate-art/game_low/x_camp_one.png`, `x_tally_hearth.png`, `x_camp_three.png`, `x_rim_stone.png` (and the same names under `viewer/`) |
| all zones rebuilt against the current prop exports | **DONE**: clean rebuild of all 102 items |

## Code integrator, polish round 2 (2026-10-04): what was decided on the code-side rows

| Row | Decision |
|---|---|
| 2 / 6, `ia_stone_round` against the slab | settled by the art integrator (y 18.356). In the playthrough the note under the first case is 0.4 m from the round: pressing `E` at the note from the east takes the round instead (the round's focus sphere is in the way). The bot reads it from the south. Known gap (a player who wants the note first must stand beside it) |
| 4, to `code-world` / `code-render` | stands as built |

