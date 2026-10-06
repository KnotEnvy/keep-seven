"""KEEP SEVEN Blender pipeline library (Blender 4.5 LTS, headless).

Every art script imports it the same way (see blender/template_asset.py):

    import sys, os
    sys.dont_write_bytecode = True
    _d = os.path.dirname(os.path.abspath(__file__))
    while not os.path.isfile(os.path.join(_d, "lib", "__init__.py")): _d = os.path.dirname(_d)
    sys.path.insert(0, _d)
    from lib import scene, mesh, uv, material, vcol, bake, rig, anim, export, budget, manifest, layout, zone, knot, brand, texdraw

Modules (each function is documented in its docstring):

    scene     argv, reset_scene, must, selection, Timer, save_blend, run (the try/except -> exit 1 wrapper)
    mesh      bmesh -> object, boxes / cylinders, finish (bevel + weighted normals), join, delete_faces, tessellate
    uv        UV0 mapping onto the shared textures (trim rows, palette cells, mask regions) and the lightmap unwrap
    material  game_material(name): the eight named materials, with a Blender preview that resembles the game
    vcol      COLOR_0: tint, AO bake, compose_vertex_color (ART_BIBLE 4.5), streaks, emissive channels, vertex light
    bake      Cycles set-up, lightmaps, light layers, the neutral texel, calibration, raw PNG writer
    rig       armatures, rigid skinning, empties on bones
    anim      actions, key_pose, NLA tracks = clips, manifest clip lengths
    export    export_asset(asset_id, out): manifest self-check + the verified glTF call
    budget    budget_report / assert_budget
    manifest  design/assets.json access, palette / trim / mask UV lookups
    layout    design/layout.json access, game <-> Blender space, solid_mesh, the path's ground
    zone      chunk assignment and merge, embedded props, sector copies, dressing empties, lamp sets, collider_terrain
    knot      the shared knot (ART_BIBLE 6)
    brand     the Pellam mark, stencil numerals, the maker's plate, the livery band
    texdraw   numpy drawing kit for the shared textures (SDF shapes, tileable noise, rasteriser, PNG in/out)

Space: author in Blender (+Z up, an asset's FRONT is -Y). A game point (x, y, z) is Blender (x, -z, y);
`layout.to_blender` / `layout.to_game` convert. The exporter (export_yup) turns it back into game space.
The library has no import-time side effects and never writes outside the paths it is given, blender/export/ and
blender/lib/*.json (the texture tables, written only by blender/tex/*.py).
"""
