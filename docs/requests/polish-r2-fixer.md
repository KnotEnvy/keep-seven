# Requests from the cross-cutting fixer, polish round 2 (2026-10-04)

What the core / layout / story fixes of this pass leave for piece owners. Each row is a request, not an edit:
nothing under `src/<piece>/`, `tests/<piece>/` or `blender/<piece>/` was touched.

## art-env-exterior

1. **Nothing to rebuild; one thing to look at.** The north alley of Front Street (between `st_wall_n` and the assay
   office) already has a drawn wall at its east end (`chunk_st_east`, face at x 0.03, measured by ray against
   `env_plenty_street.glb`), but the layout had no solid behind it: she walked through it and off the world. The new
   solid `st_alley_cap_n` (x -0.1..0, y 0..4, z -15..-12) is that wall's collider: a 0.1 m slab against the drawn face,
   because a zone's solids must stay inside its bounds (x <= 0). Impacts land up to 0.13 m in front of the drawn
   surface. Past the wall (x >= 0, z -16..-9) there is no ground and no back face: only seen from out of bounds.
   Frame: `shots/fixer-r2/alley_east_end.png`.

## code-world

1. **`tests/world/misc.test.mjs` line 25** asserts `nar_ask` plays after `rd_note_hearth` closes. `nar_ask` moved to
   the critical path: it is now the third of `shutter_m.params.lines`
   (`nar_tally_chair`, `nar_tally_chair_2`, `nar_ask`, `nar_tally_hearth`) and `rd_note_hearth` has no `thenLine`.
   Change the assertion to the shutter (drop the middle latch, expect the four keys in order).
2. **`{n}` in `nar_lamps_count` as words** (`src/world/story.ts:239`): the line read "9, by her count." / "37, by her
   count." Spell the count out, capitalised, 0 to 48 ("Nine, by her count.", "Thirty-seven, by her count.").
3. **`swapTo` / `enterSeam` order** (`src/world/build.ts`): `swapTo` removes the old zones and releases the old set
   before `assets.activate(set)` resolves. Core now retries a failed request three times, forgets a failed load, and
   returns to the title with a line when a flow job (respawn, restart, "Go on") rejects in `loading`; the title shot is
   rebuilt from cache. What is still world's: (a) await `activate` before removing zones and releasing, so a failure
   leaves the old place whole; (b) `enterSeam()` is fire-and-forget during play: if the gallery's files fail after
   the retries, the hatch opens on nothing and nothing asks again until a death. Call it again (on the next hatch
   use, or on a timer) or keep the hatch shut until `stageZone` has run; (c) the lift rides swap sets during
   'playing': a rejection there has no state to fall back to.
4. **The title after a quit**: core now goes `paused -> loading -> title` (both with reason `quit`), and in between
   calls `world.buildSet('surface')`, releases the other sets and teleports her to `player_start` (`flow.ts`
   `titleShot`). The world's run state is untouched (`running` stays true, doors and
   flags are the quit run's): harmless as far as tested (no line, no objective, no save is emitted on the title),
   but a `game/state` -> `title` handler that stops the run (`running = false`, story cleared) would be cleaner.
5. **Out of bounds**: core's net is 20 m under the lowest zone floor (y -65), so a fall from the street lasts about
   3.5 s before she is put back. A per-set kill volume in world (lowest floor of the resident set - 5 m) would be
   quicker, and other gaps in the blockout's perimeter were not searched for.

## code-enemies

1. **Allocation in `updateVolumes`** (`src/enemies/boss/index.ts:457`, and `enemies` generally): 316 to 394 B per
   tick (the performance critic's heap profile). Write into preallocated volume objects.

## code-player

1. **The view-model's `AnimationMixer` is stepped in `fixedUpdate`**: 507 to 515 B per tick in the interpolants'
   result buffers. Step it once per drawn frame (`update`), or reuse the buffers.

2. **`tests/player/wired.test.mjs` line 74** asserts that after `quit_to_title` she is within 0.6 m of where she
   stood. The title is now the overhang shot again (robustness minor: the menu lay over the Windlass): core stands her
   on `player_start` with control off. Assert `player_start`'s position instead; "no walking on the title" is still
   true (and `tests/core/flow.test.mjs` checks it).

Once both are in, lower the limit in `tests/core/alloc.test.mjs` from 6 144 B to what is measured (core will do it in
the next integration pass; it was not lowered now because the figure has not moved).

## code-render

1. **A lost WebGL context**: core pauses the game on `webglcontextlost` (prevented, so the browser restores it), draws
   nothing while it is lost, and calls `render.warmUp()` on `webglcontextrestored`. three logged three
   `INVALID_OPERATION: delete: object does not belong to this context` on restore (the composer's targets): dispose /
   recreate the render targets in a `webglcontextrestored` path of your own if you want the log clean.
2. **Bone textures** are now disposed by the asset store when a set is released (`skeleton.dispose()` on every skinned
   instance ever cloned from the released assets). `perf.textures` is flat over set swaps (20 in the test); if render
   counts bone textures itself for `textureBytes`, a disposed skeleton recreates its texture on the next draw.

## code-ui

1. **Two core lines are drawn by core, not by a UI screen**: `#flow-notice` (a line over the title after a load that
   failed or a save that could not be read: `story.json` `system.load_failed`, `system.save_unreadable`) and
   `#boot-failure` (`system.boot_failed` + the error + `system.boot_retry`). They live in `story.system`, not
   `story.ui`, so `tests/ui/text.spec.ts` ("every ui_* key is used by src/ui") is not affected. If the UI wants to own
   them, take the two state reasons `load_failed` and `save_unreadable` of `game/state` (to: 'title') and say so.
2. `loading -> title` is now a legal transition (ARCHITECTURE 3.4). The title menu re-reads `hasStoredSave()` when it
   opens, which is what makes "Go on" disappear after an unreadable save: keep that.
3. Boot now yields between its stages and draws one frame behind the loading screen; the menu appears after the
   upload stall, not before it. Nothing for the UI to do unless Begin should show a "preparing" state.

## Closer, polish round 2 (2026-10-04): where these rows stand

| Row | State |
|---|---|
| art-env-exterior 1 | nothing asked |
| code-world 1, 2, 4 | done by the world's fixer (`tests/world` green in the closing gate) |
| code-world 3 (`swapTo` / `enterSeam` order), 5 (per-set kill volume) | see `code-world.md` section 8 and the closer's table there; 3 is not re-verified here |
| code-enemies 1 | done (`code-enemies.md` R2.5) |
| code-player 1 (the mixer per drawn frame), 2 (`wired.test.mjs`) | see the closing gate in INTEGRATION_REPORT Part D |
| code-render 1 | not done (optional); 2 noted |
| code-ui 1 to 3 | nothing asked |
| the limit in `tests/core/alloc.test.mjs` | not lowered: the whole game measures about 5.1 to 5.4 kB per tick + frame against 6 144 |
