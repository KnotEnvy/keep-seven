# Requests from `code-render`

Piece: `src/render/`, `tools/gen_fx_atlas.mjs`, `sandbox/render.*`, `tests/render/`. Nothing below is worked
around by an edit outside those files.

## 1. To core: `tests/core/boot.test.mjs` asserts the stub's texture figure

- Test: `boots and plays with NO asset files …` (`tests/core/boot.test.mjs:123`), under `KEEP7_REAL=render`.
- The assertion: `perf.textureBytes === 30343168` ("memory is accounted by the manifest, placeholder or not").
- With the real render system: `30359552`. The difference is exactly `16384`: one bone texture, for the one
  `bider` the test spawns two lines earlier.
- Why the real value is right: `PerfStats.textureBytes` is "every resident texture … **plus skeleton bone
  textures**" (`src/core/contracts.ts`), and `code-render` 4.1 says the same ("manifest `gpuBytes` of active
  textures + bone textures"). `basicRender` counts the manifest only.
- Asked for: assert `perf.textureBytes - enemiesAlive * 16384 === 30343168`, or take the sample before the enemy
  is spawned, or accept `>= 30343168 && <= 30343168 + 65536`.
- Until then this test fails under `KEEP7_REAL=render` by design. It is the only failure of that run that the
  render system causes (see section 3).

## 2. To core: a screenshot straight after `perfRun(120)` can time out on a loaded machine

- Test: `a scripted run reaches every checkpoint in order and ends at the rim` (`tests/core/playthrough.test.mjs:63`),
  under `KEEP7_REAL=render`.
- What happens: `perfRun(120)` draws 120 frames at 960 x 540; under SwiftShader every one is queued rasteriser
  work, and the `page.screenshot` that follows waits for the queue. With the real Low chain (a HalfFloat scene
  buffer, the world shader, one full-screen pass) a frame costs several times the stub's. With the load average
  at 30 to 50 the test passes (also 64.9 s on 2 October). With it between 85 and 145 (fifteen builders baking)
  the screenshot ran into Playwright's 30 s default, twice out of two tries.
- This is a wall-clock assertion in disguise, not a contract failure: no draw-call, triangle or memory figure of
  that test is over.
- Asked for (any one): `perfRun(120, …)` into a small buffer the way `alloc.test.mjs` already does for its
  warm-up frames; or `page.screenshot({ timeout: 120000 })` in `Game.shot`; or `game.shotSeries` (in-page
  `capture()`, which does not wait for the compositor) in place of `game.shot` there.
- `tests/render` had the same problem in its own files and now draws long runs into a 96 x 54 buffer
  (`framesSmall` in `tests/render/util.mjs`).

## 3. For the integrator: failures of `KEEP7_REAL=render node --test tests/core/` that are not render's

Checked by running the same files with core stubs in all six slots (`node --test tests/core/flow.test.mjs
tests/core/walk.test.mjs`): they fail there too, with the same values.

| Test | Value | Cause |
|---|---|---|
| `flow.test.mjs:104` restart_checkpoint | player y `14.0041`, expected `14` | the final `env_the_lip` collider: the start marker stands 4 mm above the layout's plane |
| `walk.test.mjs:161` random walks | `cp_lip_start` / `cp_lip_gate` seeds "inside a solid" at ticks 0 to 2 | the same terrain collider |
| `sandbox.test.mjs:211` viewer `?asset=` | `ia_bore_door [final]`, the test expects the placeholder flag | final art landed; the viewer page never loads `src/render` |
| `stubs.test.mjs:315` real time: the dev page runs its own loop | `page.waitForFunction: Timeout 90000ms` (tick 159 after 177 s) | the page is `?stubs=all` (no `src/render`); a real-time loop starved by the machine's load. Failed in two of three runs, passed in the one between |

The three runs of `KEEP7_REAL=render node --test tests/core/` (68 tests, 5 skipped):

| Run | Load average | Pass / fail | Failures beyond the table above and section 1 |
|---|---|---|---|
| 2 October (before the cut-off) | not recorded | 57 / 6 | `alloc.test.mjs`: 6311 B per tick + frame (fixed: 4006 to 4144 B now) |
| 4 October, first | 110 to 145 | 57 / 6 | `determinism.test.mjs:55` "screenshots differ" (517058 pixels) and `playthrough.test.mjs:63` screenshot timeout (section 2) |
| 4 October, second | 30 to 50 | 58 / 5 | none |

The determinism failure of the first run did not repeat: the file alone passed straight after (4 / 4), the full
run after it passed, and `tests/render`'s own two-load PNG comparison passed in both of its full runs that day. During
that first run other builders' asset builds were rewriting `public/assets/` (every `env_*.glb` and `lm_*.webp`
carries a time between 08:52 and 09:07), so the two page loads may not have read the same files. It is listed
because it was seen, not because a cause in `src/render` was found.

## 4. Order against source: one cut recorded, nothing to rule

No discrepancy between `docs/workorders/code-render.md` and the source documents was found that needed a ruling.

**Cut, recorded against GDD 20.1 row 9** ("High-tier extras: heat shimmer, sand sparkle, sun shadow map, cloud-shadow
scroll -> Low look on High"): the High tier's **heat shimmer** and **sand sparkle** are not built. `QualityFeatures.heatShimmer`
and `sandSparkle` are set by `core/quality.ts` and read by nothing in `src/render/`; High shows Low's sand and Low's
horizon. The other two extras of that row are built (the sun shadow map on High, the cloud-shadow scroll on every tier).
Nothing is asked of core: the two flags can stay in the contract for a later round. If they are built later: sparkle is a
thresholded `tx_noise` term under a define of `m_sand` (the tier switch already releases and recompiles every program),
shimmer a UV offset on the horizon band in the merged pass.

`QualityFeatures.particleScale` is read as a switch, not a multiplier: at 1 the High column of ART_BIBLE 9.2 is used, below
1 the Low column (the two columns are not a constant ratio: 6 / 10, 5 / 7, 4 / 5, 5 / 5, so the table wins over the factor).

## 5. For the integrator: a round can land behind what is drawn

`combat/hit` carries the collision world's point. Where the final art stands in front of its layout collider, the impact
(dust, chips, the hit dot, the decal) is drawn behind the art and is hidden by the depth test. Seen at `cp_street_clear`,
yaw 300: the collider wall is at z = -7 (hit at 14.0 m, point (-57.88, 1.65, -7.0)), the drawn store front with its awning
stands in front of it, and only two chips that flew out are visible (`shots/code-render/impact_after/look300.png`,
`imp_street_300_impact_14m.png`). Render cannot repair this (drawing impacts without a depth test would show hits through
walls). Asked of `art-env-exterior` / the layout owner at integration: colliders of shootable fronts within about 5 cm
of the drawn surface.

## Art integrator, polish round 2 (2026-10-04): what was decided on the rows above

| Row | Decision |
|---|---|
| 3: `flow.test.mjs` 14.0041 and the random walks at `cp_lip_start` / `cp_lip_gate` | **FIXED** in the lip's terrain (the collider is the layout's plane at the markers) |
| 5: a round can land behind what is drawn (store front with awning in front of its collider) | **PARTLY**: the wagon, cart and rim stone solids now follow what is drawn. The false fronts keep their layout planes (porches and awnings stand up to 1.5 m in front by design, and moving 14 building solids moves the nav graph): impacts on a front under a porch still land on the wall plane behind the posts. Open for a later round if a critic sees it |

## Code integrator, polish round 2 (2026-10-04): what was decided on the rows above

| Row | Decision |
|---|---|
| 1, `boot.test.mjs` asserts the stub's texture figure | **APPLIED**: with the real renderer the test subtracts `enemiesAlive x 16384` (the bone textures the contract comment names) |
| 2, a screenshot after `perfRun(120)` can time out | **APPLIED** in `tests/harness.mjs`: `Game.shot` waits up to 120 s |
| 3, failures that are not render's | **FIXED** (see `code-player.md`) |
| 4, heat shimmer and sand sparkle cut | accepted (GDD 20.1 row 9); known gap |
| 5, a round can land behind what is drawn | stands as the art integrator left it (false fronts keep their planes) |
| from the art integrator: dynamic `m_prop` things orange in the antechamber | **FIXED** in `src/render/moods.ts` `L5a`: ember key 0.6 -> 0.16, ambient to the room's violet-slate (`shots/integrate-code/low_45_puzzle_the_asking.png`) |
| from the art integrator: the revolver pale teal on High out of doors | **FIXED** in `src/render/materials.ts`: the fresnel rim is rim^5 x 0.10 (was rim^3 x 0.35) |
| from the art integrator: the well sweep's arm pale blue-white; the Pellam yard door and the wash near-white | **NOT CHANGED**: seen in `low_04` / `low_08` (the sweep reads as a pale beam, the yard door as pale blue enamel). Enamel in full sun is the art bible's brightest surface; left for the visuals critic |

## Polish round 2, render fixer (2026-10-04): requests and notes to other owners

Nothing below was worked around by an edit outside `src/render/`, `tests/render/`, `sandbox/render.*`.

| # | To | What |
|---|---|---|
| 6 | critics, every owner who scripts the game | **Three things in round 1's renderer advanced by DRAWN FRAMES, not by the game's time**, so every scripted run that steps ticks without drawing (`stepAsync(n, false)`, the bot between beats, `?test=1` in general) saw a different picture from a player's: (a) effects were stamped with the time of the last drawn frame (a ring, a line or a burst asked for N ticks after the last frame was born N ticks old: the Tamper's slam ring was "never visible", it had expired before the next frame); (b) mood ramps, exposure ramps and light layers advanced at most 0.25 s per drawn frame (the 20 s glare was still at x2.4 a minute later: the visuals critic's "after the glare has settled" frames were taken under the full glare); (c) a dynamic object's zone light was looked up every twelfth drawn frame (the revolver kept the light of the place before: the Long Light in the bore, the bore's violet at the lip). All three now follow `clock.simTime` / `clock.unscaledTime` and the object's position. A frame taken after any number of undrawn ticks is now the frame a player would see at that time. |
| 7 | combat critic, `code-enemies` | The slam ring was not buried: the lift hall's drawn floor is at y = -15.000 at every point sampled (ray against `chunk_lh_hall__m_pellam`), the ring at -14.96. Cause: row 6 (a). The Tamper's **blob shadow** is drawn (y -14.955) but is 1.1 m across under a 1.6 m machine: its two feet cover it. `FxHandle.setLevel(k)` on a blob scales it (1.1 m x k): the Tamper wants about 2. Yours to call. |
| 8 | `art-env-exterior` | `socket_last_fire` (40, -10, -420) is, from `vista_fire` on the ledge, **behind a dusk mesa of `env_backdrop_dusk`** and half under the plain's own surface. Render now draws the fire at a depth of 60 m (the ledge and the stone still hide it, the backdrop does not), so it shows ON the mesa's foot, just right of the Rule. If the fire should stand on open plain, move the socket or the mesa. |
| 9 | `art-env-exterior`, the integrator | `tests/render/budget.test.mjs` held the six-enemy mock fight to `zones.far_rim.triangles` (27 024, a number with no enemy in it). It measured 27 833 this afternoon: the rim's drawn triangles in the real game went from 15 482 (INTEGRATION_REPORT B.2) to 16 934 between the integration and this pass (the env files were being rebuilt at 18:20 to 18:32); 112 of the 809 are this round's halos (48 window glows, 8 stake glows). `far_rim` has no encounter in the layout, so the mock there is now held to the tier's caps and the zone's draw calls, and the six zones that have an encounter keep the zone's computed triangle bound. The real rim is 16 934 of 120 000. |
| 10 | producer / art director | **Numbers of ART_BIBLE 3 and 11.1 that this round changed in `src/render/moods.ts`** (the critics' findings against the same bible's 2.3 value plans and checklist): `L0` exposure x2.4 -> x1.3, fog x1.6 toward `#E6E2D0` -> the Long Light's own, lift 0.03 -> L1's, saturation 0.75 -> 0.9, contrast 0.96 -> 1.10, vignette 0.25 -> 0.45, no height fog under the roof; the gully's height extra 1.5 -> 1.0; `L5` dynamic key violet x0.5 from below -> aqua x0.35 from above (ambient `#403A66` x 0.42); `L6` density 0.012 -> 0.0065, height extra 0.8 -> 0.25. `lm_tally_hatch`: tint aqua mixed half with `#E6E2D0`, a weight of 1 is worth 0.4, reach 4.2 m round `light_tally_hatch`. `lm_bore_glow`: a weight of 1 is worth 0.65, walls and floor take 35 % of that, the pit and undersides all of it, tint a quarter toward `#C8BCF0`. The ring at the seventh: radius 40 t^1.5 instead of 40 t (same 1.6 s). If the bible is to stay the source, these are the rows to update. |
| 11 | `code-world` | Looking out of the Tally House, exterior things now keep the Long Light's fog and sky whenever an exterior zone is among the drawn zones under an interior mood (`setVisible` decides that, as before). Nothing to change; if a future cell shows an exterior zone through a wall it should not, the sky there is now daylight instead of the room's fog colour. |
| 12 | `core` (optional, from the cross-cutting fixer's row 1) | The three `INVALID_OPERATION: delete` warnings on `webglcontextrestored` were not taken up in this pass. |

## Closer, polish round 2 (2026-10-04): what was decided on rows 6 to 12

| Row | Decision |
|---|---|
| 6 | noted (Part D of the integration report tells critics) |
| 7, the Tamper's blob | **APPLIED** in `src/enemies/pool.ts` (`setLevel(2)`) |
| 8, the far fire in front of the mesa | **RULED, stands**: render's 60 m depth for the fire is kept; the socket and the mesa do not move this round |
| 9, the mock fight at `far_rim` | **ACCEPTED**: the rim has no encounter, so the tier's caps are the right bound there; the six fight zones keep their computed bound |
| 10, numbers against ART_BIBLE 3 / 11.1 | **APPLIED to the document**: "Amendments, polish round 2" at the end of ART_BIBLE |
| 11 | noted |
| 12, the three delete warnings on context restore | not done, optional |
| from art-env-exterior 12 to 14, art-env-interior 2 and 3 | 13 and interior 2 applied (see those files); exterior 12, 14 and interior 3 are open for round 3 |

## Polish round 3, render fixer (2026-10-05): changes for the closer to mirror, and requests to other owners

Nothing below was worked around by an edit outside `src/render/`, `tests/render/`, `sandbox/render.*`. Evidence:
`shots/r3-fix-code-render/`, log `scratch/r3-fix-code-render/NOTES.md`.

### 13. Numbers this round changed against the documents (lead rulings R5, R6, R7 outrank them)

| Where | Was | Is | Why |
|---|---|---|---|
| ART_BIBLE 3 / 11.1, mood `L6` (`src/render/moods.ts`) | fog `#4D5578` / `#B8866F`, density 0.0065, height extra 0.25; sky zenith `#1B2440`, mid `#5D6690`, glow `#D9967A`, mid band at 6 degrees; exposure x1.8, contrast 1.04, lift 0.015 / 0.018 / 0.040, saturation 0.90 | fog `#2C3454` / `#B0705A`, density 0.0032, height extra 0.15; zenith `#0E1630`, mid `#3C4674`, glow `#FFB888`, mid band at 15 degrees; exposure x1.12, contrast 1.22, lift 0.005 / 0.007 / 0.018, saturation 0.95 | R5, R7: the last image sat in L* 25 to 51 with a hard horizon stripe. Now a dark land under a lit sky (fire view L* p5 14, p95 67) |
| ART_BIBLE 3.6, mood `L5` | ambient `#403A66` x 0.42, exposure x1.5, tint 1.02 / 0.96 / 1.06, lift 0.025 / 0.010 / 0.045, vignette 0.55, fog `#2A1B4A` | ambient `#41507A` x 0.55, a cool fill `#9AD2D8` x 0.7 on upright faces and silhouettes of dynamic things (new mood field `M_RIM`; `L5c` x 0.4, `L5p` `#BFEEE6` x 0.5), exposure x1.85, tint 1.0 / 0.98 / 1.04, lift 0.018 / 0.014 / 0.040, vignette 0.50, fog `#241D42` | the Windlass's flank and back were a black mass on violet |
| `lm_bore_glow` on plain walls and floors | the layer's violet at a share of 0.35 | the violet held 70 % of the way to `#58C8C0`, share 0.6; the pit and the undersides keep the pure layer | the same finding: "keep violet on the bore glow and knots only" |
| The view-model's light (ART_BIBLE 8, GDD 6: "lit by the zone") | the zone's ambient and key, like any prop | its own rig in every mood (`M_VM_AMB`, `M_VM_KEY`, `M_VM_RIM`): the mood's hues at DISPLAY levels (ambient never under 0.11, key never under 0.55, rim 0.60, all divided by the mood's exposure), ambient hue held half-way to grey; key and rim are lobes fixed in VIEW space (key up-left, rim straight up); the gun reflects the room and carries a streak of the key; the hands take 0.75 of the rig | R6. The gun is seen from behind: its faces are side-on to the eye, so no world key met them |
| Lamp halos (ART_BIBLE 9, Low's bloom substitute) | 1.5 x the lamp, at most 1.5 m, a soft dot | 0.8 x the lamp, at most 0.75 m, a tight falloff with a hot heart, gone between 16 and 38 m | "soft blurred discs floating in front of their fixtures" |
| The kept round's flash | the powder flash's atlas cell tinted aqua (its flame streak showed) | the cell's brightness only, tinted aqua-white (also the line round's) | the one aqua-white flash of the game |
| High tier bloom (ARCHITECTURE 8.2: threshold 1.0, intensity 0.6) | threshold 1.0 of scene light before the exposure | threshold 1.15 of DISPLAY white (divided by the frame's exposure each frame), intensity 0.9, radius 0.8; emissive things (m_emis, the emissive cells of m_prop, the Rule) drawn x2.0 on High | High measured within one grey level of Low: nothing but the flash ever reached the threshold |
| High tier sun shadow | opacity 0.42; `castShadow` switched off indoors | opacity 0.55; the sun always casts on High, the shadow PASS stops indoors (`shadowMap.autoUpdate`) | switching `castShadow` re-linked every program at a doorway |
| The last fire (`last_fire` card) | a 13 px flame, a 40 px halo | a 46 px animated flame, a 120 px halo, a warm pool on the ground, four puffs of smoke that cross the horizon's glow | R5 |
| Far windows of the town card | haze capped at 30 % | the same, and x1.6 emissive; their far halo at least 16 px (13) | "legible only as dots" |
| The Transit's sighting thread (ART_BIBLE 9.4: 2 px, dashed) | core 2 px, total 4, dashes of 0.3 m | solid, core 3 px growing to 5 over the 0.9 s of the aim, total 12 with a halo, and a glow on the lens (16 to 34 px) | the combat critic: "a faint dotted line a pixel or two wide" |

### 14. A defect found on the way: every line that pointed at the eye was a wedge

`src/render/vfx/quads.ts`: a beam's cross coordinate was interpolated perspective-correct over its two triangles. A beam
that ends beside the camera has ends 300 : 1 apart in w, so it drew as a wedge that thinned to a dotted hair
(`shots/r3-fix-code-render/transit/after_sheet.png`, before the fix). This is what made the Transit's tell "almost
invisible" and it also thinned the lance's warning thread and a line round fired at her. Fixed (screen-linear across the
beam, `vLin`): `transit/t2_sheet.png`.

### 15. Programs linked in play: how it is closed, and what the closer must keep

- `src/render/prewarm.ts` is GENERATED: `node tests/render/gen_prewarm.mjs` plays the real game from the title to the end
  card and writes every material x mesh-shape pair the render system handed out (35 today). `RenderSystem.warmUp` compiles
  a three-vertex probe of each behind the loading screen, so the programs of the gallery, the underground and the coda
  exist before their sets do. **After any asset rebuild that adds or removes a material, a vertex-colour layer, a UV1 or
  a skin on a mesh, run the generator again**; `tests/render/prewarm.test.mjs` fails (and names the pairs) until then.
- `renderer.debug.checkShaderErrors` is `ctx.flags.dev` (false on the public page).
- To `code-world` (optional): `warmSlices` / `precompile` in `src/world/build.ts` now find every program already linked;
  they can stay (they cost a cache look-up per object).

### 16. Requests

| # | To | What |
|---|---|---|
| 16.1 | `art-env-interior` | The chamber's plain walls are dark in `lm_bore` itself (median of a flank frame L* 23 to 25 after this round's exposure and wall-tint changes; 88 to 92 % of such a frame is still under L* 35). Render cannot lift a wall the bake leaves dark without flattening the room: if the critic still calls the fight frames murk, the teal floor strips' bounce in `lm_bore` is the lever. |
| 16.2 | `art-weapons`, `code-player` | The view-model's rig assumes the gun is seen from behind and to the right (key lobe up-left, rim lobe straight up, in view space). A pose that turns the gun broadside (a reload flourish) is still lit, but the big flat side takes the key at full: if a clip looks over-lit, tell render which clip. |
| 16.3 | closer | High has no shadow of the view-model or of the player (she has no body mesh): the critic's "a real sun shadow from the view-model" is not built. Enemies and dynamic props do cast on the street's sand on High. |
| 16.4 | closer | ARCHITECTURE 8.1 lists the per-object uniform block of `m_prop` / `m_gun` as three vec4: it is five (`uObj[5]`: + rim rgb and the view-model flag, + the view-model's rim direction). `SharedUniforms` gained `uHdr` in the free slot `uK[12].w`. No contract (section 5) change. |

### 17. Added by the resumed fixer (same round; the first session was cut off before its tests ran)

| Where | Was | Is | Why |
|---|---|---|---|
| mood `L6`, the view-model's rig (`vmK`) | 1 | 1.75 | the blue hour's contrast (1.22) crushed the rig's shadow side: 18.2 % of the view-model under L* 12 on the rim; now 1.9 %, mean L* 32.9 on 19.4 |
| mood `L0` (under the overhang), the view-model's key (`vmShade`) | the Long Light's sun at 0.79 | the rig's floor in a warm white (0.55 of display white / the glare) | the first image: the revolver is lit and readable under the roof (R6) but not sunlit (round 2's finding stands); `tests/render/polish.test.mjs` asserts 0.15 to 0.6 |
| the lantern's and the embers' halo (`practical` layout lights) | 0.9 m | 0.7 m | the same "soft discs" finding; no halo in the batch is over 0.75 m on any tier (the cap is now applied after the tier's halo scale: Low drew 0.90 m) |
| `tests/render/display.test.mjs`, High only | palette within 1 / 255 | within 2.5 / 255 | High's bloom now reaches the sky's lights: their glow adds up to 2 levels on a dark card beside them (gun_blue 30, 35, 49 for 28, 34, 48). Low and min keep 1 / 255 |
| `tests/render/runtime.test.mjs` | back on Low: at most +3 programs | at most +5 | the three depth programs of High's shadow pass and its overlay are built by High's warm-up (they linked in play) and three keeps them cached: 36 -> 40, then constant over further switches. The skinned probe's bone texture is freed with the shadow map (textures equal again) |

Gate of finding 6 as run: `scratch/r3-fix-code-render/latelinks.mjs` (the critic's hook): Low title to the end card **0 links in
play**; High title to `cp_boss_p1` 0, and `cp_boss_p1` to the end card 0 (two sessions, see 18).

### 18. For whoever drives long runs (not a game defect; `tests/e2e/lib` is not render's)

During ONE long `bot.play` leg the tab's renderer process grows by about 1 MiB per drawn frame on Low and on High alike
(4.7 GiB after 44 s of wall time on Low, 5.3 GiB after 84 s on High; JS heap 91 MB; released when the leg returns). A High
run from the title to the end card in one browser dies with signal 5 or under the OOM killer (`dmesg`: chrome-headless
at 10 and 19 GiB). Split long runs into legs of a few thousand ticks or into two sessions. This is what closed the browser
of the first two sessions of this fixer at `cp_boss_p1`.

### 19. Not done / open after this round (render)

- The last image, fire view: L* p5 13.1, p95 66.5 (target p95 over 70; the town view has 10.8 / 71.5).
- The chamber from the flank and from behind: 90 to 93 % of the frame is still under L* 35 (median 24 to 25, was 19.5; mean chroma 0.059, was 0.079). The walls are dark in `lm_bore` (request 16.1).
- The view-model is brighter than what it covers by 10 to 13 L* in the Tally House, the gallery and on the rim (the visual critic asked for "within 5"; the combat critic for "at or above").
- High: no shadow of the view-model (16.3); views with no emissive and no caster in them are the same as Low (gallery 0.27, street without an enemy 0.70 of 255).

## Closer, polish round 3 (2026-10-05): decisions on the rows above

| Row | Decision |
|---|---|
| 13, 17 numbers | Mirrored: ART_BIBLE round-3 amendments (with the three look-dev passes' later values, which supersede some of 13) |
| 15 `prewarm.ts` after a rebuild | Checked after the final asset build: `tests/render/prewarm.test.mjs` is in the gate (Part F) |
| 16.1 the chamber's walls in `lm_bore` | Taken in part by the underground look-dev pass (wall scallops under the bay lamps); the flank is still 83 to 87 % under L* 35: open |
| 16.3 no shadow of the view-model on High | Open; named in Part F |
| 16.4 ARCHITECTURE 8.1 | Mirrored (a paragraph before 8.2) |
| 18 long runs | The closing tour plays in legs, one per checkpoint (`scratch/r3-closer/tour.mjs`) |
