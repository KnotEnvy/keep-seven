# blender/env_exterior

One Python script per asset of this owner: `<asset id>.py` (the manifest's `source`, design/assets.json).

Start from `blender/template_asset.py` (copy it here, rename, change `ASSET` and `build()`), read the docstrings of
`blender/lib/` (`blender/lib/__init__.py` lists the modules), then:

    node tools/build-assets.mjs --only <asset id | owner | piece>    # build -> optimise -> check; FAILED lines say why
    node tools/preview-asset.mjs <asset id> [--clip all] [--cycles] [--game] [--zone]   # into shots/art-env-exterior/
    node tools/asset-status.mjs --owner <owner>                      # what is still a placeholder, by priority

## `lm_surface`: one 2048² lightmap for two zone GLBs

`lm_surface` is shared by `env_the_lip` and `env_plenty_street` and produced by a third script,
`blender/env_exterior/bake_surface.py` (the manifest's `source` of the texture; a "late" item: the driver runs it
**after** the zones). The fixture room bakes its own lightmap as a by-product; here the three scripts must arrive at
ONE UV1 atlas and consistent light without talking to each other. Do it with a shared helper module:

1. `blender/env_exterior/surface_common.py` builds, deterministically (same seed, same order), every lightmapped mesh of
   BOTH zones plus the casters, embeds the zone-lit props, sets up the sun and sky (`bake.add_sun(layout.sun())`,
   `bake.set_world`, `bake.calibrate`) and calls `uv.unwrap_lightmap(all_objs, 'lm_surface', faces=...)` ONCE on the
   same list in the same (sorted-by-name) order. Same input, same atlas: every script that imports it gets identical UV1.
2. `env_the_lip.py` and `env_plenty_street.py` each `import surface_common`, call it, run
   `vcol.bake_vertex_light` on the vertex-lit objects (with BOTH zones' geometry in the scene, so shadows and bounce
   agree across the boundary), then `zone.assign_chunks` / `zone.merge_chunks` / `export.export_asset` **only their own
   objects** (delete or simply do not assign the other zone's). They do not bake or save the lightmap.
3. `bake_surface.py` imports the same module, calls `bake.bake_lightmap(lightmapped, 'lm_surface', samples=64)` and
   `bake.save_lightmap(img, 'lm_surface')` (ignore `--out`: `save_lightmap` writes the staged path the driver ships,
   which is the same file). About 44 s at 2048² here; iterate at 512² (`bake_lightmap(..., img=bake.new_image(...))` or a
   smaller size in an overlay manifest) and bake full size last.
4. The driver tracks the helper for all three: `export_asset` records it in each zone's `<raw glb>.deps.json`, and
   `bake.save_lightmap` records it in `blender/export/lm/lm_surface.png.deps.json` (with the props the bake scene
   embedded). Editing `surface_common.py` therefore rebuilds both zones and re-bakes `lm_surface`
   (`node tools/build-assets.mjs --only env_exterior`); a helper that is read as data or `exec`'d is not seen (`--force`).
   Build all three together: a zone shipped with new UV1 and an old `lm_surface` shows scrambled light. The driver
   watches for it: when a zone that points at `lm_surface` is rebuilt and `lm_surface` is stale but was not part of the
   run (`--only env_the_lip` after an edit to the helper), the run prints `STALE lm_surface: ...` with the command that
   builds them in one run and exits 1 (`--allow-stale-lightmap` while iterating on geometry).
5. `lm_rim` belongs to `env_far_rim.py` alone and is baked as that script's by-product, like the fixture room.

**This recipe is built and tested in small**: `tests/pipeline/shared_atlas.test.mjs` writes exactly these three
scripts over one helper module (two one-chunk "zones", one 128² lightmap), builds them through the driver and holds
the result to: both GLBs lightmapped into disjoint islands of ONE atlas, light under both islands, the helper recorded
as an input of all three, and the `STALE` line when one zone is rebuilt alone. Copy its four files as your skeleton.
The assumption underneath was measured on the real layout (round-3 critic, `scratch/critic-readiness-r3/bl/shared_atlas.py`):
all 107 visible solids of `the_lip` and `plenty_street`, `uv.unwrap_lightmap` once on the name-sorted list, in three
separate Blender processes: identical UV1 hashes in every run, 0.10–0.12 s per unwrap. **Build that three-script
skeleton from the layout solids on day one, before modelling anything** (minutes): a driver or atlas problem then
shows at once, not after a week of art. Not yet done by anyone: a 2048² bake of about 50 000 triangles under the real sun.

Each zone script must vertex-light its vertex-lit faces before `zone.merge_chunks` (`vcol.bake_vertex_light`, with
both zones' geometry in the scene): `merge_chunks` raises, naming the objects, for a face on the neutral texel that was
never lit. Under a sun and a sky alone `samples=256` to `1024` is already clean (0.3 % error at 256, measured); the
default 2048 is for interiors with lamp meshes.

A `faces` argument is `None`, polygon indices or `callable(polygon)` in object space (`lambda p: p.normal.z > 0.9`),
not the three-argument `mesh.delete_faces` predicate. The fixture room that `code-render` loads through
`sb.loadOverlay` exists only after `node --test tests/pipeline/` (or `node tools/build-assets.mjs --manifest
tests/pipeline/fixtures/manifest.json --only fixtures`) has run once: its folders are generated and git-ignored.

Worked examples: `tests/pipeline/fixtures/fixture_crate_panel.py` (m_frontier / m_pellam prop with trim mapping, knot,
mark, plate), `tests/pipeline/fixtures/fixture_room.py` (a zone: lightmap, vertex light, light layer, embedded prop,
lamp set, chunks), `blender/template_asset.py` (a rigid-skinned m_prop asset with a clip).

## What is in this folder (art-env-exterior, as built)

| File | What it is |
|---|---|
| `env_the_lip.py`, `env_plenty_street.py`, `bake_surface.py` | the three manifest scripts over ONE scene: `surface_common.build()` |
| `surface_common.py` | builds both zones, embeds the zone-lit props, sets the L1 light (calibrated), packs the `lm_surface` atlas; `finish_zone` = vertex light → chunks → export |
| `ext_kit.py` | the modelling kit, in GAME space: `Part` (polygons with material, UV0, tint, lightmap chart), `realize` (chunk cutting and sorting), `pack_charts` (the atlas by arithmetic: same UV1 in every process), boxes, prisms, tessellation |
| `ext_rock.py` | sandstone: `rock_colour` (beds by absolute height), `rock_box`, `bedded_block` (cover boulders as tilted slabs of bedrock, held within 0.25 m of the layout solid), `rock_chunk` (talus), `drift_mound` (sand on the windward side) |
| `ext_frontier.py` | board, adobe and tin: `Frame`, `adobe_wall`, `stepped_wall`, `boards`, `beam`, `tin_sheets`, doors, shutters, door marks, sand wedges |
| `ext_cards.py` | unlit far scenery (`m_flat`): mesa rings, pylon cards, clouds, the plain |
| `lip_fields.py`, `lip_parts.py`, `lip_built.py` | the Lip: the corridor field from the layout solids, ground / walls / overhang / boulders / collider, and what people built (gate wall, piers, pylon, camp) |
| `street_parts.py`, `street_yard.py` | Front Street (ground, nine facades, cover, walls) and the pump yard (drum, derrick, rotor and tail nodes, tank, Tally House exterior, dressing) |
| `env_far_rim.py` | the coda: ledge, the stratified cliff (`cliff_column`), the brow over the cage opening (`brow_lip`: the frame the cage looks through), boulders, the pylon stump, its own L6 bake and `lm_rim` |
| `rim_town_card.py`, `env_backdrop_day.py`, `env_backdrop_dusk.py` | the cards |
| `render_views.py` | NOT a build step: eye-level Cycles previews of the bake scene (`--scene surface | rim`), and black-on-white silhouettes (`--silhouette <metres>`) |

Iterating: `KS_EXT_FAST=1` lowers every sample count (looking, not shipping); `KS_EXT_SKELETON=1` builds both zones from
the layout solids only (the day-one driver check). Evidence: `node tests/art_env_exterior/evidence.mjs
[sheets] [cycles] [silhouettes] [lightmaps] [viewer]`; numbers: `node tests/art_env_exterior/measure.mjs squint <png>…` /
`sample <json>`. A full build (`node tools/build-assets.mjs --only env_exterior`) is four to five minutes on the shared
machine, almost all of it the 2048² `lm_surface` bake on the GPU (170 to 250 s).

## What the fixer round changed (and why the code is shaped as it is)

- **The street is LOW on its north side on purpose.** The sun stands 14 degrees up in the north-west: a point on the street
  floor at z is lit only if the north row's outline, `z + 7` metres to its west, is lower than `0.353 x (z + 7)`. So the
  north row is: the assay shed (2.75 m), the feed store (the loft: 6.3 m, the layout's), **the ruin of the old livery**
  (`b_ruin`: broken adobe, 1 to 3 m, its roof posts against the sky), the dry-goods store whose false front is a
  **skeleton** (`building(skeleton=True)`: studs and rails, the sun comes through in bars) and the undertaker's shed (3 m).
  The two-storey boarding house stands in the SOUTH row (ART_BIBLE 7.2), where it faces the sun.
  `tests/art_env_exterior/light.test.mjs` holds the sunlit share of the floor (x -60..-20) to 30 % or more.
- **Every boarded front has a near-black backing a hand behind its boards** (`building`: "the backing"), and the base
  course has a ledge: boards have their own widths, so their ends never share a vertex, and without a skin behind them
  each crack shows the sky as a row of sparkles.
- **Vertex-lit faces whose every corner is buried are healed** (`surface_common.heal_buried`, after the bake): they take
  the light of the nearest corner of the same object that was sampled in the open. The library still prints its
  `WARNING ... baked dark from end to end` lines (it prints them inside the bake); the `VERTEX LIGHT ... HEALED n` line
  says how many were repaired. A part flagged `o["kfit"]` (numeral, plate, cup) takes one light and is hidden from the
  lightmap bake (`bake_surface.py`).
- **The overhang has a fill light** (`surface_common.add_fills`): an area LIGHT in the mouth looking in (all three
  scripts see it; it is not exported). Strength: `KS_EXT_FILL` watts (default 340), set by probe so the rock inside
  lands in `#2A1A1E`-`#48272D` in the viewer.
- **The gully's mouth is closed as masses** (`lip_parts.build_closure`, `mass_top`): benches on top, the face of every
  step, forced into `chunk_lip_gate` (the street's cell draws it, and it has triangles to spare; `chunk_lip_rock` has
  none). Where the curtain's top jumps between two columns the taller one gets its own side face.
- **The drum** is a shell (lightmapped to 3 m) plus `yd_drum_relief` (cover strips on the 1.2 m module, plinth, coping,
  the missing panel, the portal, track and leaf, the closed throat). Every new face is wound with `facing(pts, target)`.

## What polish round 2 changed (critics' issues: the Dowser, the horizons, the rim, the yard and alleys)

- **Far country** (`ext_cards.mesas` / `mesa_cards`): a ring is a list of landforms (mesa, butte, hogback), each an
  outline of (bearing, top, scree head): scree at 29-37 degrees under a battered cliff (72-82 degrees), tops that sag,
  a lower bench, a notch. No outline edge is steeper than 81 degrees (`tests/art_env_exterior/sightlines.test.mjs`
  counts them: 0 of 574 / 558). The old one-height-per-card rings (`mesa_step`, `ring`) are no longer used.
- **The Dowser's rim** (`env_backdrop_day.build`): a mesa in two lifts, 250 m due west of the yard. He stands on a
  promontory of the lower bench; the upper cliff is 9 m behind him and 24-30 m above his feet. `dowser_clear` computes
  the bearings at which the 200 m ring would stand in the line from any corner of `trg_dowser` (the old fixed gap was
  12 degrees off).
- **The rim** (`env_far_rim.py`): the ledge is `m_sand` (ripples) with its colours held to `LEDGE_K` = 0.46 of the old
  albedo (the game shows L6 at exposure 1.8: the pale caprock read as a white sheet); `rim_parapet`: blocks of caprock
  standing on the lip inside the layout's `rim_edge_n` wall. `env_backdrop_dusk`: the same mesas, a ring of hogbacks
  on the valley floor (none on the town's bearing), the mesa the rim is cut into going on east and west.
  `rim_town_card`: the town at its own scale on a pale flat, roofs as paler sheared bands, 0.9 x 1.1 m windows.
- **Broken walls** (`ext_frontier.ruin_wall`, `stepped_wall`, `_wall_from_profile`): a wall's top is a profile; ends
  and changes of level are rakes of brick-course teeth, tops slump, plaster is off near the breaks. `stepped_wall_r1`
  is round 1's version (unused).
- **Side walls and the Tally front are lightmapped to their tops** (`street_parts.building`, `street_yard.build_tally`):
  as vertex-lit upper panels their lower corners baked as buried and took one flat darker light (a ruled seam along
  every alley and 3 m up the Tally House).
- **Yard** (`street_yard.build_dress`, `build_walls`, `build_tally`): weathering in vertex colour (`fr.weather`,
  `fr.wall_weather`), piers on the east wall and beside `door_tally` (0.3 m proud: inside the 0.35 m a body keeps),
  a second canale, a chipped parapet, pipes / trough / cable / ladder / adobe stack / vigas / crates along the walls,
  the ruin's footing course, boards and drifts on the open floor (all under 0.3 m).

## What polish round 3 changed (lead rulings R4, R5, R7; the critics' seven issues)

- **The Dowser stands on the skyline** (`env_backdrop_day.build`): his mesa is ONE lift, its top never above his feet, and he
  stands on its highest knob: open sky behind the whole figure from every corner of `trg_dowser`
  (`tests/art_env_exterior/sightlines.test.mjs`: 162 rays, 0.6 to 14 m above his feet). Round 2's "pale on a dark upper
  cliff" is gone: at 245 m the L1 fog lifts any rock to L* 72. The card's colour and size are not this piece's.
- **The last image** is composed in three assets. `env_backdrop_dusk`: the playa (`lens`: long pale streaks on the plain
  behind and beside the town), three ridges in stepped values between the ledge and the town (`ridge`: each under the
  line from an eye on the ledge to the town's foot; the town is 117 to 142 m off, not 250), the mesa's foot under the
  ledge as shaded land (`foot_h`: talus, fins, the gully; it was one flat sheet), and nothing of the two near rings
  within 9 degrees of the fire's bearing (`fire_clear`). `rim_town_card`: no ground disc; gables, stacks; panes with
  shapes (sash / door / shop front). `env_far_rim`: `LEDGE_K` 0.46 -> 0.31 and `ROCK_DARK` 0.34 on every loose rock: the
  ledge is the dark foreground of the frame (it was the palest thing in it).
- **The first image** (`surface_common.add_fills`): beside the cool fill, a warm BOUNCE (area light 4 m outside the mouth,
  `KS_EXT_BOUNCE`, 120 W) and a SUN PATCH (two spots through the notch, `KS_EXT_PATCH`, 40 000 W) raking across the sand
  between the start and the mouth. Lights only: nothing exported. A bounce light standing IN the mouth draws a line
  across the floor at its own plane.
- **Walls** (`ext_frontier.plinth`): a stained base course on every yard wall, the Tally front and both faces of the gate
  wall; the Tally front has a bench and a board with blank scraps; the east wall's parapet is broken twice and carries a
  harness rail; the gate wall has put-log poles, two canales with their stains, and weather in its vertex colour.
- **The yard's barrel** stands against the west wall at (-109.62, -9.3). In the north-west corner (0.5 m from both walls)
  its box collider held a jumping capsule off the ground. A dressing instance with `collision: box` must touch a wall or
  stand a body's width (0.8 m) from it, and never sit in a corner.

## Look-dev pass, polish round 3 (first image, sighting, last image)

- `rim_town_card.py`: the card is a picture, not a survey: everything on it is drawn `K = 1.7` times its size about the
  card's centre foot (fronts 45 to 60 px tall at 720p from the ledge, a lit sash 6 x 11 px, the derrick breaks the
  horizon). The Tally House's windows are no longer a 4 x 2 grid; the lighting order is still outward from the Tally
  House but shuffled within a wide band, so the nine lamps of a run that freed nobody are scattered over the street.
  176 of 600 triangles. The manifest's placeholder box (60 x 14 x 1) is now smaller than the card (about 104 x 25 m).
- `env_backdrop_dusk.py`: the mesa's foot under the ledge is coloured per vertex from the slope of `foot_h` on a finer,
  non-uniform grid (it was per face on a 7 m grid: a fan of flat facets filling the lower half of the fire view), and
  darker; the playa lenses have 8 segments. 1 987 of 2 000 triangles: there is no headroom left in this asset.
- The renderer's side of the same pass (`src/render`): the coda's far-fog cap grows with distance (6 % to 160 m, 40 %
  from 800 m), so cards authored dark stay dark near and go pale far; the Dowser card's haze cap is 2 %; the town's
  far window glow is a soft 24 px bloom at 38 %; L6's sky mid stop is `#443C72` at 25 degrees; L0 has half the lift
  and contrast 1.20.

## Look team "exterior-look", polish round 4 (the last image, the yard's walls, the Dowser's rod)

- **The last image is framed by the game, not by the bot.** `src/world/ending.ts` eases her view to the fire and stands
  it 0.15 of the angle off toward the town (5 degrees: the fire at x 695 of 1280, clear of the end card's panel).
  `rim_town_card.py` draws the town `SH` = 12.5 m east of `vista_plenty.target` so it stays whole in the left half.
  Judge the frame with `scratch/r4-team-exterior-look/end.mjs` (she takes the round, nothing aims for her).
- `rim_town_card.py`: `house(kind="side")` is a pitched roof seen from its long side; `porch=True` an awning band on
  posts; `apron()` the dark street before a row; a ground-floor pane of the near row or the Tally House has a POOL: a
  second face of the same lamp lying on the apron (`lamp_set` takes a list of polygons per lamp), its corners' COLOR_0.r
  rewritten after `lamp_set` (0.42 at the wall, 0 at the far end). An unlit pool is the lamp shader's dark, which is the
  apron's. The renderer's halo of a lamp is its bounding box's centre and its mean intensity: a pool dims and lowers it
  a little. The card must hold exactly 48 lamps: `extra` lists the spare places (never stack two panes).
  **The pylon** is on this card (m_flat, drawn in a plane across the view from the stone): a thin lattice may break the
  horizon anywhere; a rock tall enough to do so would hide the fire or the town from some place on the ledge.
- `env_backdrop_dusk.py` has 13 triangles left: its foot is recoloured (`foot_col`: `ROSE` on a fin's north-west flank).
- `env_far_rim.py`: `sheen(part, start)` lifts and warms the up-facing faces of loose rock after `darken`; `ledge_colour`
  lights the last 0.75 m of the lip.
- `street_yard.py`: the Tally House front never sees the sun (it faces south, the sun is north-west): it is broken by
  value and hue (dado, teal, marks) and by what hangs on it. **Nothing added there has a collider**: below 2.3 m stay
  within 0.3 m of the wall; keep everything out of the lines from `trg_dowser`'s volume (z -13.6 and south) to the man
  on the rim (a ray from x -82 climbs 0.21 m a metre going west). Cloth is two faces 16 mm apart, on a 3 x 3 grid.
- **`KS_EXT_FAST=1` builds are taken as current by the driver.** After iterating with it, rebuild at full quality with
  `node tools/build-assets.mjs --only env_plenty_street --force` (and `--only env_exterior` first if the lightmap's
  inputs changed): otherwise the shipped zone keeps 64-sample vertex light.
