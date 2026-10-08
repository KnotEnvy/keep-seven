# blender/enemies

One Python script per asset of this owner: `<asset id>.py` (the manifest's `source`, design/assets.json).

Start from `blender/template_asset.py` (copy it here, rename, change `ASSET` and `build()`), read the docstrings of
`blender/lib/` (`blender/lib/__init__.py` lists the modules), then:

    node tools/build-assets.mjs --only <asset id | owner | piece>    # build -> optimise -> check; FAILED lines say why
    node tools/preview-asset.mjs <asset id> [--clip all] [--cycles] [--game]
    node tools/asset-status.mjs --owner <owner>                      # what is still a placeholder, by priority

Worked examples: `tests/pipeline/fixtures/fixture_crate_panel.py` (m_frontier / m_pellam prop with trim mapping, knot,
mark, plate), `tests/pipeline/fixtures/fixture_room.py` (a zone: lightmap, vertex light, light layer, embedded prop,
lamp set, chunks), `blender/template_asset.py` (a rigid-skinned m_prop asset with a clip).


## Pass i1 (look team creatures-props, 2026-10-07): the statics' hood

`bider_build.build_hood_lo` is a sewn bag on a head (`_head_under`: brow, hollows, nose, chin, temples; the cloth falls
straight from the cheekbones to the cord; seam band, back pleat, scalloped cape), in three details (`HOOD_LO`): 2 = the
table static, 1 = the seated one, 0 = the felled one (the last two at 0.6 of the planes: they replace a skinned Bider in
place). `build_static(..., opts=)`: `hood`, `arm_sides`, `thumb`, `legs_least` (`"no_shaft"` under the table), `sash`,
`nod`. `nod` writes the head's weight to UV1.y and the extra `nod_pivot`: `src/render/materials.ts` turns each
instance's head about it (`NOD_PIVOT`; `tests/art_enemies/bider_nod.test.mjs` fails when the two drift: copy the build
log's "nod pivot" line into the shader). None of the three statics is decimated any more: keep it so (a Decimate at
0.67 tore the felled skirt into shards); `under_knot` keeps the hood on the plain dome under the knot's collar.

## Pass i2 (look team creatures-props): painted cloth

`bider_build.Part(name, colour, cloth='hood' | 'cape' | 'coat' | 'sleeve')` points the part's UV0 into a painted region of
`tx_palette` (`blender/tex/cloth_atlas.py`) instead of a flat cell. Every vertex of such a part needs `part.at(verts, angle,
t)`: the angle round the garment (-180 .. 180; +-180 is the seam of the unrolled cloth and takes the side of the face it is
seen in; `None` = the pole of a fan), and t = design-pose z (hood, coat), 0 .. 1 .. 1.3 (cape: cord, hem, turned under) or
0 .. 1 (sleeve); t < 0 on coat and sleeve is the dark inside. COLOR_0 is then divided by the region's base colour, not a
cell's. `tests/art_enemies/bider_cloth.test.mjs` fails on a corner that is neither in a region nor on a cell centre.
`bider_table_static` also writes the extra `lean_pivot` (the hips) and marks itself with UV1.y >= 0.02 for the per-seat
slump of `src/render/materials.ts` (the BREATH block); UV1.x is 1 on its neck and head.

## Pass i3 (look team creatures-props)

The crown knot is `bider_build.build_knot_bound(parts, radius, emissive, detail)`: bound glass (a bead, a grommet of cord,
three lashings, on the skinned Bider the tie and its ends), smooth-shaded, UV0 in the painted regions of
`blender/tex/knot_atlas.py` (cells of columns 10-15, rows 2-5 of `tx_palette` and `tx_palette_emis`). detail 0 = the freed
statics (72 triangles), 1 = the table (240), 2 = the skinned Bider (354). `Part.smooth` sets a part's smoothing angle;
`_CLOTH` has `knot`, `knot_dead`, `kcord`, `kcord_dead`. `build_knot` / `build_knot_lo` (the faceted lobes of `lib.knot`)
are unused. Guards: `tests/art_enemies/bider_cloth.test.mjs`, `bider_silhouette.test.mjs` (core against collar).
