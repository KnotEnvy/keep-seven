# blender/props/dress (art-props-dress: the 29 `props_dress` assets)

One Python script per asset: `<asset id>.py` (the manifest's `source`, design/assets.json), plus one helper module,
`dress_common.py`, that every script imports (the build driver records it in each `<raw>.deps.json`, so editing it
rebuilds all 29). Build **by id**, never by owner (the owner `props_dress` also names the three shared textures, which
belong to `art-props-mech`):

    node tools/build-assets.mjs --only art-props-dress                  # the 29 assets and no texture
    node tools/build-assets.mjs --only prop_chair,prop_tally_table      # some of them
    node tests/art_props/dress/tools/pv.mjs <id> [--v <variant>] --sheet --cycles --game [--dist 2 --yaw 30 --pitch 15]
    node --test tests/art_props/dress/

`pv.mjs` exists because `tools/preview-asset.mjs` draws every variant node on top of the others: it previews ONE
variant (`--v`) and writes `shots/art-props-dress/<id>[-<variant>]_sheet|_cycles|_game.png`.

## How the scripts paint (dress_common)

- `paint(part, cell, colour)`: UV0 on a `tx_palette` cell, and the colour the part really has. COLOR_0 only darkens
  the cell, so a part whose dust skirt, bleach or worn edge rises above its base colour is put on a pale cell (`linen`,
  `chalk`, `sand_pale`, `enamel`) and carries its colour in COLOR_0. `compose` prints `NOTE ... clamped` when a cell
  is too dark for what is painted on it.
- `bake_ao(parts)`: Cycles AO (256 samples) into the parts BEFORE they are joined, with a temporary ground; parts
  marked `ao=False` (sticks whose only vertices are buried in other parts: stretchers, spokes, legs of the trestles)
  cast but take none (that is what the library's "baked dark from end to end" warning is about). Other variants
  standing on the same spot are hidden while a variant bakes.
- `compose(ob, ...)`: tint x AO x height ramp x dust skirt x bleach x per-part jitter x painters (stains, wear,
  patches), divided by the cell colour; corners of a smooth vertex get one colour (`weld`: a third of the vertices in
  the shipped file: the piece's download share is 0.3 MB).
- **A painted band needs a sharp edge.** Because of `weld`, a colour painted per face on a SMOOTH surface smears into
  its neighbours (the barrels lost their hoops that way). Give the band a real step (`staved`: every hoop is 13-16 mm
  proud with 4-5 mm risers), or mark its edges sharp with `sharpen(ob, pred)` after `smooth` (the barrel's stave seams,
  the shawl's border stripe). `tests/art_props/dress/hoops.test.mjs` holds the barrels and the shawl to it.
- `export_asset` snaps every vertex to a 1/4096 m grid (0.24 mm) before export: float32 positions on a power-of-two
  grid pack about 12 % smaller under meshopt (the piece went from 0.292 MB to 0.264 MB with more geometry in it).
- Geometry: `lathe`, `tube`, `beam` (segmented boards with broken ends), `box`, `prism`, `sheet` (cloth, paper,
  drifts), `rock`, `wheel`, `staved` (stepped hoops, a head hoop at each chime), `sharpen`.
- The scripts in this folder are the sources. `scratch/art-props-dress/mk.py` and `src/*.body.py` (the first builder's
  generator) are retired and stale.

## What other pieces rely on (tested in tests/art_props/dress/)

Chair seat 0.45 m; table top 0.76-0.80 m over its exact 1.4 x 11 m footprint, its hand patches under the layout's
eleven seats; trough rim 0.5 m; the rim stone's seat 7 on its pivot column (seat n at x = -0.11 (7 - n)); the Dowser
card's `glint` on the drawn rod tip. Sizes and placement notes for the zone builders: `docs/requests/art-props-dress.md`.

## Review record (work order 7.5; ART_BIBLE section 12 items 9-19, 18b, 22)

Judged on the files of the fix pass (4 Oct), every image named here opened. `S` = `shots/art-props-dress/`.
"N-A" = the item is about something this piece does not contain. Items 13 and 15 are zone-level (not judged here).

| Group (assets) | 9 no primitive read | 10 jitter / exact | 11 vertex-colour set | 12 thin | 14 decay in silhouette | 16 mark | 17 strike | 18 trio | 18b fits | 19 text | 22 | Looked at |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Street cover: `prop_wagon_tipped`, `prop_trough_pump`, `prop_water_cart` | PASS (cart: the barrel is an 8-sided drum with four stepped hoops; PASS at yard distance, weak up close) | PASS | PASS (AO, ramp, dust skirt, bleach, streaks) | PASS (check-glb thin rule; pump handle 5 cm, spokes 5-6 cm) | PASS (tipped, snapped tongue, drift, pitched cart, bung out) | N-A | PASS (trough: town mark with the 22 degree graphite line) | N-A | N-A | PASS (none) | N-A | `S/prop_wagon_tipped_cycles.png`, `S/prop_trough_pump_cycles.png`, `S/prop_water_cart_game.png`, `_sheet.png`, `S/silhouettes_p0.png`, `S/silhouettes.png` |
| Tally House: `prop_tally_table`, `prop_chair`, `prop_head_chair`, `prop_bench`, `rd_ledger`, `rd_rain_tally` | PASS | PASS (leaves at four heights, legs splayed; the head chair is clean and square on purpose) | PASS (indoors: no dust skirt) | PASS (head chair legs 3 cm; slate cord drawn fat) | PASS (sag between trestles) | N-A | N-A | N-A | N-A | PASS (slate: strokes only) | N-A | `S/prop_tally_table_cycles.png`, `S/prop_chair_cycles.png`, `S/prop_head_chair_cycles.png`, `S/silhouettes_p0.png`; bench, ledger, slate: sheets of the builder's run only (not re-opened in the fix pass) |
| The Dowser's stops: `prop_coffee_pot`, `prop_flat_stone`, `prop_cup_tin`, `prop_camp_ash`, `prop_kettle`, `prop_rim_stone`, `card_dowser`, `rd_note` | PASS; WEAK for `prop_cup_tin` (57 triangles: a 7-sided cup, the dent is a bent lip only) and `prop_coffee_pot` (8-sided body) | PASS | PASS | PASS (cup wire 7 mm: good to 3.6 m by the 2 mm / m rule; pot handle 9 mm) | PASS (chipped rim, lid off, bite out of the slab) | N-A | N-A | N-A | N-A | PASS (notes: ruled lines and strokes from `tx_mask`, no words) | N-A | `S/prop_coffee_pot_sheet.png`, `S/prop_cup_tin_cycles.png`, `_game.png`, `S/prop_camp_ash_cycles.png`, `S/prop_rim_stone_cycles.png`, `S/card_dowser_game.png`, `S/rd_note_game.png`; kettle, flat stone: not re-opened |
| Pellam: `rd_plate` (3), `ia_proving_mark` | PASS (plate: border, rivets, relief cartridge; mark: an 18-sided disc, dished rim, glyph in relief) | PASS (exact, no jitter) | PASS (AO + grime against the rim; no dust skirt indoors) | PASS | N-A (Pellam does not decay in silhouette) | PASS (plate: six open discs, plumb stroke, solid seventh, from `mark_cast`) | N-A | PASS for what a plate is (it IS the cast plate; livery band and number belong to the machine it is on) | N-A (no opening) | PASS (the wordmark and the four `plate_lines` strings only; other lines are raised bars) | N-A | `S/rd_plate_cycles.png`, `S/ia_proving_mark_cycles.png`, `S/silhouettes_p0.png` |
| Instanced dressing: `pk_canteen`, `prop_coat_hung` (3), `prop_hat_hung`, `prop_boots_pair`, `prop_lantern`, `prop_bottle`, `prop_crate`, `prop_barrel`, `prop_sack`, `prop_strain_cloth` | PASS for barrel (was FAIL), canteen, coats, shawl, strain cloth; WEAK for `prop_hat_hung` (49 triangles: a 7-sided brim) and `prop_boots_pair` (reads as boots, soles are a colour line only) | PASS | PASS (barrel: hoops, staves, rust weep, dust skirt) | PASS (lantern bail and cup wire drawn fat) | PASS (sprung stave, slumped boot, torn cloth corner) | N-A | N-A | N-A | N-A | PASS (none) | N-A | `S/prop_barrel_game.png`, `_cycles.png`, `S/pk_canteen_cycles.png`, `S/prop_coat_hung_cycles.png`, `S/prop_coat_hung-coat_shawl_cycles.png`, `_game.png`, `S/prop_hat_hung_sheet.png`, `S/prop_boots_pair_sheet.png`, `_game.png`, `S/prop_strain_cloth_sheet.png`, `S/silhouettes.png`; lantern, bottle, crate, sack: not re-opened |

Not judged anywhere yet: any of this under a zone's baked light (the zones embed older raw exports until their owners
rebuild).

### Look-and-improve passes on record

- Builder, pass 1 -> 2 (docs/requests/art-props-dress.md section 5): `prop_coat_hung` (sleeves flat to the flanks),
  `pk_canteen` (smooth strap ribbon), `prop_coffee_pot` (curved ear handle), `prop_rim_stone` (the bite and its flake).
- Fix pass (after the critic), what each look changed:
  - `prop_barrel` (P2), 3 looks: stepped hoops (14 mm) at both chimes and the middle + two belly rings -> stave seams
    marked sharp so each stave is a flat board of its own colour, hoops left round -> risers painted iron, staves
    greyed unevenly, less rust weep.
  - `prop_water_cart` (P1), 2 looks: four stepped hoops (16 mm; head hoops at the chimes), grey staves -> bung hole
    dropped onto the smaller belly; 24 triangles recovered from the saddles and the hub's inner caps (893 / 900).
  - `prop_cup_tin` (P0), 3 looks: seven sides, a dent between two lip vertices, a five-point wire loop, interior
    ring (pale tin lip -> near-black band at the floor corner -> dry brown floor) -> dent shallower (it read as a
    folded flap), handle smaller and thinner -> checked from above in the viewer.
  - `pk_canteen` (P0), pass 3: second strap turn across the face, slack end shortened, neck 8-sided, cork 6-sided.
  - `prop_coat_hung` `coat_shawl` (P0), pass 3: wider square fall, a hard-edged border stripe in the town's paint on
    both layers, pale fringe teeth (88 of its 90 triangles).
  - `ia_proving_mark` (P0), pass 2: 18 sides instead of 10 (the outer 6 mm wall, which the floor hides, paid for it).
  - `prop_coffee_pot` (P0), pass 3: the lid knob is a turned five-sided button.
  - `prop_boots_pair` (P1), 3 looks: lofted foot with a toe cap, round shaft, dark sole line -> the slumped shaft
    looked like an arrowhead: slump halved, shading smoothed -> heel tucked in.
  - `prop_hat_hung` (P1), 2 looks: one skin (no doubled brim edge, no dark patch), curled brim, pinched and creased
    crown, dark band at the foot of the crown -> curl eased.
  - `prop_strain_cloth` (P2), 1 look: folded over the line with a back flap, five folds 3-4 cm deep, torn corner.
- No second-pass record exists for the other nine P0 assets (`prop_wagon_tipped`, `prop_trough_pump`, `card_dowser`,
  `prop_camp_ash`, `rd_note`, `rd_plate`, `prop_tally_table`, `prop_chair`, `prop_head_chair`): the fix pass re-opened
  their Cycles or viewer frames after the rebuild and changed nothing in them.

## Polish round 3 (fixer `art-props`, 2026-10-04)

- `prop_rim_stone`: the six kept cases are **part of the stone** now, 2.6 x life size (105 mm tall), brass, mouth up, in
  seats 1-6; seat 7 is the one empty dark cup on the pivot. They swallow the zone's life-size `prop_cartridge_kept`
  cases, which stand in the same seats. Two builds chosen by the manifest's `triBudget`: under 230 the cases are
  three-sided with a bright cap and the slab has one course (75 triangles, what ships at budget 80); from 230 they are
  six-sided with a bore and the slab keeps its two courses and its flake (230 triangles). Request for 240 is in
  `docs/requests/art-props.md`.
- `rd_note`: the ink is handwriting drawn as `m_prop` geometry (twelve short slanted pencil strokes per note; no ruled
  lines, no `m_mask`). `note_stone` is offset from its pivot so that its far leaf lies under seat 1 of the rim stone
  (the offset is computed from `ia_stone_round`, `rd_note_stone` and the `rim_stone` solid in `design/layout.json`).
- `card_dowser`: COLOR_0 is a near-black coat (`#15121A`), not `dowser_pale` (lead ruling R4).
- Evidence: `shots/r3-fix-art-props/` (`after_*` are the real game at 1280 x 720, Low).
