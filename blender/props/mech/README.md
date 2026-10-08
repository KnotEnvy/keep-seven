# blender/props/mech

One Python script per asset of this owner: `<asset id>.py` (the manifest's `source`, design/assets.json).

Start from `blender/template_asset.py` (copy it here, rename, change `ASSET` and `build()`), read the docstrings of
`blender/lib/` (`blender/lib/__init__.py` lists the modules), then:

    node tools/build-assets.mjs --only <asset id | owner | piece>    # build -> optimise -> check; FAILED lines say why
    node tools/preview-asset.mjs <asset id> [--clip all] [--cycles] [--game]
    node tools/asset-status.mjs --owner <owner>                      # what is still a placeholder, by priority

Worked examples: `tests/pipeline/fixtures/fixture_crate_panel.py` (m_frontier / m_pellam prop with trim mapping, knot,
mark, plate), `tests/pipeline/fixtures/fixture_room.py` (a zone: lightmap, vertex light, light layer, embedded prop,
lamp set, chunks), `blender/template_asset.py` (a rigid-skinned m_prop asset with a clip).

## Release pass p0 (look team creatures-props)

- `mech_common.relight(ob, lean, up_fn)`: leans the shading normals of upright faces up (custom split normals; call it
  last, on the joined mesh). A dynamic prop takes its room's mood light, whose key comes straight down in the Pellam
  rooms: an upright enamel face took the ambient alone and stood navy-black against baked walls. Used by
  `ia_line_locker` (0.55; its niche liner points up) and `ia_ammo_box` (0.35).
- `ia_line_locker`: enamel-lined niche painted with its strip's light, the strip on the back wall over the round,
  louvres and a seam on each flank, foot grime. 447 / 500 triangles. Evidence `shots/p0-team-creatures-props/`.


## Pass i1 (look team creatures-props, 2026-10-07): the lift cages

`mech_cage.build_cage(..., tight=)`: `tight=True` (the proving cage) builds the whole frame INSIDE the W x H x D
interior, because the bore's shaft is exactly that interior (the cage was hidden in its walls). Both cages: enamel
wainscot panels with a rivet row each (mask region `rivets`, appended), livery band, handrail on brackets, three rows of
grille tiles, the station board and brass maker's plate on the back wall, a strip lamp in the roof (extra faces of the
ONE `gate_lamp`: a second lamp index would fail check-glb, and a lamp far from the bar would pull the halo between
them), a floor grating strip, the pool of light painted in `light()`. Traps met: a decal's `lift` is along its normal
(a negative one puts it BEHIND its backing: the old blank numeral plate); `relight` helps under a top key (the hall)
and hurts where the key comes from below (the proven bore, moods.ts L5p): the proving cage keeps true normals;
`tests/art_props/mech/fit.test.mjs` holds the m_mask bounding box to the interior within 8 cm and the clear height
under the roof to 3.49 m, so nothing of the tight cage may hang under its roof plate away from the walls.

## Pass i3 (look team creatures-props)

`prop_sighting_loop.py`: pedestal, hazard collar, post, forked cradle; the ring is 14-sided (the budget is 220 and it is
full). The post is joined AFTER the AO bake (`mc.overlay_join`): its only vertices are let into the collar and the hub.
`blender/tex/knot_atlas.py` paints the Biders' crown knot into columns 10-15 of rows 2-5 of `tx_palette` and
`tx_palette_emis`: never append a palette cell past column 9 in those rows.
