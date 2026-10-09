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

## Look team "exterior-look", polish round 5 (the rim: the maroon box, the black cage, the notch)

- **The mesa east and west of the ledge is drawn by the BACKDROP** (`env_backdrop_dusk.py`: `wing`, `under_ledge`): the
  zone's chunk may not leave its box (x -2 .. 30, `tools/check-glb.mjs`), an unlit card may. A wing is
  `env_far_rim.cliff_column(x)` continued along a plan spline (`WING_W`, `WING_E`: the old wall's line to its two noses),
  seven of its rows (`WING_ROWS`) plus two below the ledge, and its light is PAINTED per quad (`W_LIT`, `W_MID`, `W_SHADE`,
  `W_CAP`: the lit cliff's own display colours at blue hour; dark at the top of a quad that ends under a lip). Change
  `cliff_column` and the wings follow (the driver rebuilds the backdrop: it imports `env_far_rim`). The first column
  stands 0.25 m behind the real cliff's end, so the joint is a step in the rock.
- **`behind_rim`**: the landforms of the four rings and the hogbacks that stand wholly within 60 degrees of south of the
  rim are not drawn (they paid for the wings: 1 965 of 2 000). `tests/art_env_exterior/rim.test.mjs` holds that no ray
  from the ledge that leaves the rim rock under a ring's height meets that sector. Do not shorten a wing or lower its
  skyline without running it.
- **The cage's room is seen** (`env_far_rim.py`, Part `rim_room`): the proving lift's panels are single-sided, so from
  inside the cage the player looks at this room. It is lit by three bake-only area lights in `setup_light`
  (`KS_RIM_CAGE` watts, default 28; 0 switches them off): `fill_cage` stands in the plane of the cliff's face and looks
  in (a light in front of the face leaves a red halo round the opening on the cliff), `fill_cage_back` looks from the
  back wall at the wall the opening is cut in, `fill_brow` lies on the ledge under the brow and looks up.
- The dynamic things in that room (the cage) take the mood `L6c` (`src/render/moods.ts` `rimCage`).

## Look team "exterior-look", release pass p0 (the rim's lift shaft)

- **The round-5 note above is wrong about the cage**: `ia_proving_lift_cage` has lattice panels (`m_mask`) that ARE seen
  from inside. The round-5 room's walls stood at x 12 / 16 and z 116, exactly the cage's envelope, so they covered the
  lattice: the "flat maroon box" of the final review was this zone drawn in front of the cage. **No zone face may stand
  inside the cage's envelope (x 12 .. 16, z 112 .. 116, below 3.5 m) or within 0.25 m outside it.**
- `env_far_rim.py` now builds the head of a SHAFT round the cage: `build_shaft` (Part `rim_room`: the mesa's beds in
  relief on three walls from `SHAFT_BEDS`, 0.4 to 0.9 m clear of the cage, dipping as one plane; a slot `SHAFT_PIT`
  deep round the cage's floor; the shaft goes on to `SHAFT_TOP` over the ledge and is capped dark) and `build_shoring`
  (Part `rim_shore`: six posts, caps, three cross timbers, a second set up the shaft, braces, lagging boards behind the
  posts, the hoist's sheave, rope and bail). She sees it THROUGH the lattice: about a third of each wall, so it is a lit
  thing with dark timber in front of it. Its light is one bake-only point light in the middle of the cage (`fill_shaft`,
  `KS_RIM_SHAFT` watts, default 85; 0 switches it off). `SHAFT_DARK` is the rock's albedo toward `rock_dark`.
- The opening's surround is darker than in round 5 so the opening carries the frame: `FACE_DARK` 0.88 (the face the
  opening is cut in, seen from the cage), `JAMB_DARK` (0.62, 0.86), `fill_cage` leans east at 0.6 of `KS_RIM_CAGE` (the
  afterglow is north-west: the west jamb is in its own shade), the floor under the cage is x 0.42. The jambs have real
  beds now (`JAMB`: 0.16 to 0.22 m back, outward only: the 3 m opening is never narrowed).
- 11 374 of 14 000 triangles. The driver takes `env_backdrop_dusk` as stale after any edit here (it imports this file).

## Look team "exterior-look", pass i1 (the gully's dressing, the painted ground, the last image)

- **`lip_dress.py`** (new; `lip_parts.build` calls it after the boulders): everything mid-scale in the gully and the
  forecourt. **Nothing in it has a collider.** The rules that keep a body from meeting it: within about 1.5 m of a wall's
  foot anything may stand (scree, slabs on edge, scrub, the trees' trunks, the cross-arm, the cart); on the open floor
  nothing is over 0.33 m (the bedrock `plate`s lie WITH the slope, the one `drift` is 0.3 m); and `guard(part, f0, v0)`
  takes back whatever was just added if any of it stands 0.3 to 1.85 m over the nav link's own floor within 0.55 m of a
  link (`tests/art_env_exterior/openings.test.mjs` is the judge: it measures from the layout's floor, which lies up to
  0.15 m under the drawn sand). Call `guard` after every new maker. `nav_dist` is to ALL links of the zone, not the
  critical path.
- **Triangles are the limit, chunk by chunk** (`DRESS lip: ...` in the build log; `node scratch/i1-team-exterior-look/chunks.mjs`):
  `chunk_lip_gate` has 130 left, `chunk_lip_upper` 270, `chunk_lip_rock` 280, `chunk_lip_mid` 630. A tree is forced whole
  into the chunk it stands in (`Part(chunk=...)`): left to the chunk rule its crown went to `chunk_lip_rock`. Keep trees
  3.2 m from the chunk planes (z 30, 54) and bushes 1.3 m: a twig cut by a plane is a sliver `check-glb` calls thin.
  Changing one threshold in the wall loop moves every later random number: check all four chunk counts again.
- **`lip_parts.column_rows` has four more lightmapped rows** (two eye-level beds). `N3` is the row at 3 m, `UNDER_ROWS` and
  `LIP_ROWS` say which rows are under a lip and which are lips; the wall charts' second coordinate is the length along
  the profile. A column within 0.6 m of a chunk plane keeps its rows on its own side of it.
- **`ground_paint.py`** (new; `bake_surface.py` calls `apply(S, img)` between the bake and `save_lightmap`): multiplies the
  baked light of the ground charts by ruts, boot prints, the dry wash, the trodden line, wind streaks and the walls'
  feet. A chart is painted only if its name starts with one of `LIP_CHARTS` / `YARD_CHARTS` AND it is planar from above
  (the affine fit from UV1 to game (x, z) must hold to 5 cm: the sand wedges and the drum fail it and are left alone).
  The lines it follows are functions of the layout (`lip_dress.path_points`, `wash_points`, `street_parts.rut_centre`) and
  of `S.extra["lip"]["cart_site"]`: move the cart and its ruts follow. Street charts (`st_g_street`, the alleys) are not
  painted. To add a mark: a function of numpy (X, Z) that returns a multiplier, multiplied in `paint_lip` / `paint_yard`.
- **`drift()` takes `ground_col`**: the toe of a drift must take the ground sheet's own colour there (and stand 6 mm over
  it, not under it), or it reads as a plate with a dark rim lying on the sand.
- **The yard**: only two wall feet are more than 1.5 m from every nav link (the north-west corner and the south-west
  corner by the shed); the bush and the tree stand there. The tree's trunk is half in the west wall's face.
- **The last image**: `env_backdrop_dusk.foot_col` `ROSE` is `#A2605E` at 0.72 (the fins' north-west flanks hold the
  afterglow); a `ridge`'s FACE is seen from 18 m up at 8 degrees and fills far more of the frame than its back slope,
  so the light goes on the back slope (0.30) and the face stays dark (crest 0.045): lit faces read as pale slabs.
  `env_far_rim`: no loose slab lies on the lip between x 0.5 and 6 (the ending's view from the stone).

## Pass i2 (look team "exterior-look"): what a later builder needs to know

- **`wall_paint.py`** (new; `bake_surface.py` calls `wall_paint.apply(S, img)` after `ground_paint.apply`): the weather of
  every lightmapped surface that is not ground, painted into `lm_surface` after the bake (no triangle, texture or draw
  call). `texel_map()` rasterises every charted triangle into the atlas (2 s), so each texel knows its game position,
  its face's normal and its chart, whatever the chart's shape; a chart's paint runs 3.5 texels past its edge (the
  bake's margin is 4). What a chart is, is decided by its NAME (`ADOBE`, `TIMBER`, `ROCK`, `CERAMIC` regular
  expressions at the top of the painters): **a new wall chart is not painted until its name matches one of them**
  (an adobe building's `st_<name>_f / _s` must be added to `ADOBE`'s list, a boarded one to `TIMBER`'s). The paints are
  functions of the world position, so two charts of one wall plane agree at their seam. Multipliers are RGB (a stain may
  be warm or cool) and clipped to 0.4 .. 1.7. Brick courses (0.19 x 0.42 m) are drawn only on charts with 12 texels a
  metre or more (`dense`); the patch edges are 0.10 m soft because a texel is 6 cm.
  `paint_shelf` is stop one's shelf (ART_BIBLE: no hearth, no ash; it stays a swept rock).
- **Iterating on a paint without baking**: `scratch/i2-team-exterior-look/dev/run.sh` (bakes once with `KS_EXT_FAST`
  into a `.npy`, then repaints and writes `public/assets/lm/lm_surface.webp` in 18 s). It overwrites the shipped
  lightmap: finish with `node tools/build-assets.mjs --only env_exterior`.
- **`tx_frontier_trim.py`**: the `strata` row's beds are +-0.13 of the sheet (the art bible's whole range), with varnish
  streaks under every bedding plane and two pale seams; the `adobe` row's sweep and broad tone are half as strong again.
  Regions did not move. Every rock face and adobe wall in the game takes it (interiors too: the Tally House's walls).
- **The sky draws the clouds** (`src/render/sky.ts`, `CLOUD_DAY` / `CLOUD_DUSK`): `env_backdrop_day` no longer builds its
  five cloud cards (`KS_EXT_CARD_CLOUDS=1` brings them back for a look); it is 1 539 of 2 000 triangles.
- **The forecourt has ONE strip no nav link crosses**: x 20.9 .. 21.3 along the east rock's foot (the fence stands there),
  and the south-west corner x 2.5 .. 8, z 6 .. 9. Everywhere else `guard()` takes a post back. `chunk_lip_gate` has about
  45 triangles left.
- **The ceramic main in the third reach** (`lip_main`): its crown is 0.12 m over the LOWER of the drawn sand and the nav
  floor (`kit.path_ground`); 0.21 m over the drawn sand failed `openings.test.mjs` where the nav floor lies a hand under it.
- **`b_ruin`**: the front walls run to 0.66 m from the door's middle (into the frame's posts). At 0.78 daylight showed
  between the wall and the leaning post.
- **`rim_town_card`'s pylon** stands at game (-7.7, 61): west of every line from the ledge (x -2 .. 30) to the fire, so it
  never crosses the fire; from the stone it stands in front of the town's east end, left of the Rule.
- **`tests/art_env_exterior/tiers.test.mjs`** (new, the real game): Low against High at five exterior stops (floors 5.5
  to 7 of 255; measured 7.4 to 11.6) and the Rule's lean on screen (5.9 degrees from the gully, 8.6 from the rim).

## Pass i3 (look team "exterior-look"): what a later builder needs to know

- **Stop one is a blanket, not a rock shelf** (`lip_built.build_blanket`; the fixer's ruling, GDD 23.16): folded once, 1.5 x
  0.92 m, two layers with a dark line between them on the three open sides, pale and rust end stripes as per-face
  colours on grid lines that follow them, its east end still rolled (`lip_bedroll`, vertex-lit). One lightmapped chart
  `lip_blanket` at density 2.5, planar from above; `ground_paint.paint_lip` reads `S.extra["lip"]["blanket"]` and lays
  its contact shadow on the sand. `wall_paint.paint_shelf` is no longer called by anything. No fire, no ash, no stones.
- **`lip_dress.build_i3`** (called at the end of `lip_dress.build`, with its OWN random stream: nothing of passes i1 / i2
  moves when it changes). Each part is forced into its chunk (`lip_i3_upper / _mid / _gate`, `_blocks`, `lip_i3_bones`).
  Makers: `carcass` (a mule's bones, never over 0.3 m), `sawbuck`, `talus` (stones retinted to the wall's lower beds:
  pale cap-rock stones in shade read as lit shards), `fallen_block`, `line_pole`, the hanging line across the second
  reach (its strand's insulators end 2.3 m over the floor), the fallen shade roof in the forecourt (all under 0.3 m: the
  court is nav floor and the jug puzzle's line of fire), bedrock plates in the last reach. **Triangles now: `chunk_lip_upper`
  8 471 of 8 500 (nothing left), `chunk_lip_mid` 4 733 of 6 000, `chunk_lip_gate` 6 197 of 6 500.**
- **`lip_dress.SHAFTS` + `surface_common.add_fills`**: three more shafts of the low sun across the gully's floor (the
  walls stand 12 to 16 m over a floor the 14 degree sun never reaches). Each is a bake-only SPOT 3.7 m over the floor
  (`SHAFT_RISE`), 17 000 W (`KS_EXT_SHAFTS`; 0 switches them off), whose shape is its own shader (`notch_gobo`: an ellipse
  in the light's frame with a noise-ragged edge; no blocker mesh, which would shade the sky's light under it). At 52 000 W
  with a plain cone they were three white discs. **`src/render/system.ts` `GULLY_SHAFT_TO / _FROM` repeat the same
  numbers** (the High tier draws each shaft in the air): move a shaft in both places.
- **`wall_paint.GAIN`**: every weather term at 1.3 to 1.5 times its strength about 1 (clip 0.34 .. 1.8); `paint_rock` has a
  damp base band a pace high over the gully's floor and a silt line over it (`_floor_y`: the critical path's height by z).
  `yd_drum`'s chart is at density 1.8 (29 texels a metre): the rivet rows are drawn.
- **`plug_door_tally` is a recess** (the card, a soffit and two reveals, 8 triangles): past the shut leaves the eye went by
  the single card to the sky. The street's four drawn nodes count against the zone's sum: 48 039 of 48 200.
- **`env_backdrop_day`**: the knob the Dowser stands on is 8.4 m wide (the figure is drawn 9 m wide);
  `src/world/director.ts` `SIGHT_SINK` stands his card 5 % of its height into the rock.
- **A FAST build is taken as current by the driver**: finish with
  `node tools/build-assets.mjs --only env_the_lip,env_plenty_street,lm_surface,env_backdrop_day --force` (141 s).

## What pass i4 changed (ten carried-over issues of the visual reviewers; lead rulings R16, R18, R19)

- **Loose sand casts nothing in the lightmap bake** (`bake_surface.py`): a drift, a sand wedge at a wall's foot and the
  swept ring at the trough (now its own part, `st_swept_drift`) lie ON a ground sheet. They shut the sun and the sky out
  of the texels under them, and the lightmap's filter drew those as a dark rim round every patch ("outlined patches that
  read as decals"). Objects whose name matches `_sd`, `dune`, `drift` or `rib_sand` get `visible_shadow = False` and
  `visible_diffuse = False` for the bake (the log prints `LOOSE SAND: n objects`). `fr.sand_wedge` gives its toe the
  colour of the ground under it (`ext_frontier._ground_colour`).
- **`ground_paint.py`**: `paint_street` (nothing was painted on Front Street: the packed middle, both ruts as dark lines
  with a pale shoulder, his prints, banked sand along both rows, damp patches), `breakup` (crusted pans and blown sheets:
  the floor is no longer one value from wall to wall) and `stones` (pebbles as the light sees them: a dark body, a long
  shadow away from the sun, a lit edge) on the Lip, the street and the yard. Low and High alike: it is in the lightmap.
- **`wall_paint.py`**: rock gets THICK beds (a pace to a man's height, each its own tone), ledges between them (the
  undercut's shade below the joint, the lit lip above it) and long leaning fractures; adobe a darker stained base and
  broader tones; the drum a tide line with its wet skirt, dirt run from every rivet row and dented plates. `GAIN` is
  1.75 / 1.5 / 1.7 / 1.4 (adobe, rock, ceramic, timber).
- **Broken wall ends** (`ext_frontier.ruin_wall(ragged=True)`, `_wall_from_profile(courses=True)`): a break follows the
  bond: teeth of one course, some two, treads tipped outward, one brick left proud; the end face is laid in courses, each
  its own tone, every other one a finger proud or set back. All five cover stubs; the ends and drops are unchanged, so the
  body is still the layout's cover (`tests/art_env_exterior/openings.test.mjs` holds 90 %). The well-house's north wall
  ends in a ragged break.
- **The gate pylon** (`lip_built.build_pylon`): a bolted steel collar at the mast's foot, cover strips over four joints,
  a service hatch (frame, door, livery strip, louvre, hinges, dog handle, bolts, a rust weep), a conduit with saddles, the
  foot's holding-down bolts, and two drifts banked against the foot (`lip_pylon_drift`). Inside the layout's 2 m box.
- **The land under the rim** (`env_backdrop_dusk.py`): a second family of ribs between the fins, benches across the
  slope, a 2.1 x 3.1 m grid under the last image's view, and a crest term: where the ground stands over its neighbours it
  holds the afterglow as a thin apricot edge, the hollows go to black, the gully's floor is a paler thread toward the
  fire. 2 369 of 3 200 triangles.
- Triangles as built: `env_the_lip` 27 777 / 31 000 (gate chunk 6 843 / 7 300), `env_plenty_street` 48 799 / 49 700.
- The rimrock the pursued man stands on is NOT in a backdrop: it is `src/world/sightRock.ts` (it has to be unfogged and
  scaled with his card). `env_backdrop_day.py` is unchanged.

## What pass i5 changed (the stub beside the sighting, the last image's foreground; rulings R7, R18, R19)

- **A cover stub's breaks are brickwork** (`ext_frontier.break_wall`, called by `street_parts.stub_wall(ragged=True)`:
  the three yard stubs and the street's two). The body is a plaster skin (two lightmapped faces whose top under each
  rake is a ragged diagonal). The core stands a finger inside it: at each end a rake of single bricks (one or two courses
  to a tooth; where `lanes` is set, two wythes that broke at different places, with the inner face between them), under
  the rake the wall's end in 0.19 m courses that stand toothed out of the break (2 to 16 cm proud, one gone, one
  hanging), and a brick or two lying on the top. **Every brick face is lightmapped**: `ext_frontier.Isles` lays many
  small planar faces as islands of ONE chart (`<solid id>_k`, 2.5 to 3 times the atlas density), and the loose bricks at
  the foot (`rubble_bricks`, chart `<solid id>_q`) and the fan of melted adobe (`rubble_fan`, charts `<id>_fan0/1`, in
  the loose-sand part so it casts nothing) are lightmapped too. Nothing of a stub is vertex-lit any more: on High a
  vertex-lit face in the yard's shade takes the sun map's shadow whole and goes dark blue.
  `yd_cover_stub_1` (the one in the sighting's frame) has both wythes at both ends and the densest charts.
- **`wall_paint.py`**: a new kind `brick` (charts `*_cover_stub_?_k`): `_bond` lays bed joints every course, the perpend
  between the wythes (it changes side every course), stretchers 0.42 m long breaking joint, each brick its own tone, an
  arris, chipped corners; `stub_break` continues the same bond onto a stub's plastered sides near its breaks (the render
  ends at an edge with a shadow line). The bond is a function of the stub's own frame (its layout solid), so it runs
  round the corners.
- **The atlas** is 15.56 texels a metre (it was 16.0): the stubs' charts took 3 % of it.
- **`ground_paint.sheets`**: the wind's low transverse sheets on the gully's floor, the street and the yard (a pale
  crest line beside a dark slip face every 4 to 5 m, coming and going); `breakup` and the walls' feet are stronger.
- **The land under the rim** (`env_backdrop_dusk.build_foot`): the foot is BENCHED RIMROCK built from the height field
  `foot_h`: for each of `FOOT_LEVELS` the bed's contour is solved in every column of `FOOT_X`; a bed is a level tread
  ending in a lip (`LIPC`, brightest where it faces the north-west, broken along its length), its riser is built only
  where an eye on the ledge can see it, the wash is a strip of sand a hand over each tread it crosses and runs on over
  the plain toward the fire as a faint line, sixteen loose blocks. Flat tones with hard edges, no gradient wider than a
  lip. The apron reaches the plain 60 m out (78). 2 857 of 3 200 triangles. The plain's inner disc has a hole 2 m round
  `CENTRE`: an octagon shuts it. `build_foot` prints the bench under the dead pylon; `rim_town_card.py` `y0_` is that
  height (2.0).
- Tried and withdrawn: a second run of longer bedrock shelves in the gully (`lip_dress`): a 3 m plate is one flat
  vertex-lit facet and read as a pale board on the sand (`shots/i5-team-exterior-look/w_shelves/`).
- Triangles as built: `env_the_lip` 27 777 / 31 000, `env_plenty_street` 48 945 / 49 700 (yard chunk 13 164 / 13 400),
  `env_backdrop_dusk` 2 857 / 3 200, `rim_town_card` 349 / 1 200. `collider_terrain` is byte-identical.
- Rebuild: `node tools/build-assets.mjs --only lm_surface,env_plenty_street,env_the_lip --force` (one run: the atlas is
  shared), `--only env_backdrop_dusk,rim_town_card --force`.

## What pass i6 changed (the gate pylon, the stubs, the floors, the last image's foreground; rulings R7, R16, R18, R19)

- **The gate pylon is a built mast** (`lip_built.build_pylon`, the pass-i6 block before the tilt): a proud steel band over
  the seam of every module to 6 m, three broad dark bands and three lost cladding panels (the dark core, a rusted lip, a
  cross-member behind, a weep under each) in the white upper half, the line's cable bundle down face 2 in five clamps to
  where it was cut at 3.3 m (its end sprung away), rust weeps under the bands on the faces the path passes. `face_at(i)`
  and `plate(i, ...)` lay a quad on any of the mast's eight faces. `chunk_lip_gate` 6 891 / 7 300, `env_the_lip`
  28 289 / 31 000.
- **A stub's rake is not a staircase** (`ext_frontier.break_wall.stair`): one tooth in three is short, one in four long,
  and one or two bricks are gone from each rake (that tread drops to the one below, the next stands two or three
  courses over it; a riser of no height is not built). The ends, drops and the body between the rakes are unchanged
  (`openings.test.mjs` holds).
- **The painted bond is half the size of the built teeth** (`wall_paint.BOND_H` 0.095, `BOND_L` 0.26; `_bond`): a mud brick
  with its joint, two courses to a tooth, each course's perpends shifted a little. `BRICK_H / BRICK_L` (0.19 / 0.42) are
  still what `paint_adobe` shows under a wall's fallen render. The stubs' charts are denser to carry it:
  `street_parts.stub_wall` `dens` 2.8, `kdens` 3.6 (2.0 / 2.5); `yd_cover_stub_1` 3.2 / 4.2 (2.5 / 3.0). **The atlas is
  14.58 texels a metre** (15.56): the stubs take about 7 % of it.
- **The yard's own walls** (`paint_adobe(yard=True)`, charts `yd_wall*`): the render has come away in more and larger
  patches (threshold 0.60, it is 0.665 elsewhere) and the foot is a darker damp course to the knee (0.58 over
  0.30 .. 0.66 m plus the ragged term).
- **`ground_paint.drifts`**: the floor's LARGE shapes on the Lip, the street and the yard: fields a dozen paces across,
  long pale tongues of blown sand down the wind, darker scoured lanes between them (amount 0.14 to 0.15, halved on the
  packed middle). `door_scuff` (a trodden fan at a sill and prints out to the street's middle) at six fronts of the
  street (`STREET_DOORS`: eyeballed sills at z -6.9 / +6.9, not read from the buildings) and at the Tally House's door;
  the trough's spill is a ragged dark patch (0.24 over 3.3 m, it was a round blot of 0.13).
- **The land under the rim** (`env_backdrop_dusk.py`): a lip is a soft rim light ACROSS a bed's top (`LIP_W`: 0.85 m plus
  up to 0.75, feathered to the tread's tone; `LIP_PEAK` 0.58 of pass i5's; a lip is dim, not absent, where it was
  "dead"), not a drawn line. On the plain: three more low swells (two east of the gully's line, one west of the apron),
  a dry wash that leaves the track under the apron's toe and wanders east (pale where its bed is swept, coming and
  going), scrub in twos and threes along it and off the track (`tuft`), and the track to the fire is plainer
  (`THREAD` x 0.42 at 0.80). `TRACK_X(z)` repeats `build_foot`'s `xw`. 3 069 of 3 200 triangles.
- The rimrock the pursued man stands on is still `src/world/sightRock.ts`: it is a mesa's rim thirteen of his heights
  long now, with level beds (`STRATA`), not a knob.
- Rebuild: `node tools/build-assets.mjs --only lm_surface,env_plenty_street,env_the_lip --force` (141 s),
  `--only env_backdrop_dusk --force`.

