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
