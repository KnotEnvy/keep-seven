# Requests from the producer (work-order pass)

Found while writing `docs/workorders/`. **All twelve are resolved at the source** (integrator
pass closing pre-production; record in ARCHITECTURE 17 and GDD 23.4). The work orders no
longer carry workarounds for them: their text has been updated to match.

| # | For | Finding | Status | What was done |
|---|---|---|---|---|
| 1 | manifest (`tools/gen_assets.mjs`) | Multi-part animated props (`ia_ammo_box`, `ia_line_locker`, `prop_stock_gate`, `prop_well_sweep`, `prop_yard_gate`, `ia_yard_bell`, `sec_loft_bell`, `ia_shutter`, `ia_hatch`, `ia_range_plate`, `ia_baffle`, `prop_door_pellam`, `prop_grate`, `ia_cold_bay_shutter`, both lift cages, `ia_lift_lever`, `ia_bore_door`) had `skinned: false` and no `bones`, but their `drawCalls` allow only one mesh per material | **RESOLVED** | `gen_assets.mjs` has a `rigid: [...]` field: those 18 assets are now `skinned: true` with `bones` = `root` + one bone per moving part (the same names stay in `nodes`; a name in both is the bone, as on the gun and the creatures). `design/assets.json` regenerated; draw calls and cell budgets unchanged; validator green. ARCHITECTURE 7.2 / 7.3, ART_BIBLE 7.4, README ruling 3, `art-props` 3, `foundation-core` 4.2 and `foundation-pipeline` (check-glb, placeholders) updated |
| 2 | ART_BIBLE 7.6 | static Biders' breath weight was specified as vertex colour G, which collides with the `COLOR_0` tint on `m_prop` | **RESOLVED** | ART_BIBLE 7.6 now says UV1.x + mesh extra `breath: 1` (and nine table instances, not eleven); `breath` added to the mesh-extras list in ARCHITECTURE 7.2; `art-enemies` no longer calls it a ruling against the art bible |
| 3 | ART_BIBLE 7.3 / layout | the antechamber diagram was "1.5 m tall" in the art bible, 2.4 m in the layout | **RESOLVED** | ART_BIBLE 7.3 `env_the_bore` says 2.4 m (layout `prop_ante_diagram.params.height`) |
| 4 | ART_BIBLE 7.4 | `ia_hatch`'s latch block "off the west end, facing east" | **RESOLVED** | ART_BIBLE 7.4 `ia_hatch`: the latch block and cowl are zone geometry at the north-west corner, knot facing north (layout `ty_latch_block`, `ty_latch_cowl_*`, `knot_hatch_latch`). GDD 9.4 corrected the same way; ARCHITECTURE 15 row closed |
| 5 | manifest | `bindings.solidProp.tally_table_end` embedded `prop_tally_table` a second time | **RESOLVED** | bound to `null` in `gen_assets.mjs` (zone geometry of `env_tally_house`); ART_BIBLE 7.4 `prop_tally_table` says the fifth leaf is zone geometry |
| 6 | ARCHITECTURE 11.4 | `tests/core/pipeline.test.mjs` tests pipeline output but sat in core's folder | **RESOLVED** | ARCHITECTURE 7.1, 11.4 and 15 now say `tests/pipeline/pipeline.test.mjs` |
| 7 | ARCHITECTURE 3.5 | no owner named for `ui/hint`, for the run flow behind `ui/action`, for the restore order's caller, or for the kept round's legal-aim tick; world not listed as a caller of `player.applyDamage` | **RESOLVED** | ARCHITECTURE 3.5: `player.applyDamage` added to world's direct calls; owner rows added for the run flow and the restore order (core, `src/core/flow.ts`, also added to the section 1 tree), `ui/hint` (world), the legal-aim tick (player, `audio/cue` `listen_tick`), kill volumes (world) |
| 8 | ARCHITECTURE 3.6 / GDD 13.3 | the `proving_line` snap needs the shooter to know puzzle state, but there is no contract for it | **RESOLVED** | GDD 13.3 "Assist" names world's `knot_a` receiver as the implementer; ARCHITECTURE 3.5 has the owner row. No contract change |
| 9 | layout | `ia_proving_lift.params.ride` had no `seconds` | **RESOLVED** | `tools/gen_layout.mjs`: `seconds: 12` (a minimum; the ride also waits for `buildSet('coda')`); `design/layout.json` regenerated, validator green; GDD 9.6, README ruling 11 and `code-world` 4.9 read it from the marker |
| 10 | manifest | `sec_loft_bell` `fall` and `ia_cold_bay_shutter` `open` are P2 clips without a `fallback` | **CLOSED, no change** | GDD 20.1 rows 7 and 1 are their fallbacks (the secret is cut whole), as documented in the orders |
| 11 | ARCHITECTURE 1 | `blender/tex/` is foundation's folder but `assets.json` gives each texture a production owner | **RESOLVED** | ARCHITECTURE 1 tree: file-level ownership by `textures.*.owner` from phase 3, append-only |
| 12 | GDD 6.6 / contracts | `SeventhState` has `chambered`; the HUD state list in GDD 12.2 named five states | **RESOLVED** | GDD 12.2 lists six states including `chambered` (slot drawn empty); GDD 12.3 says which existing label each state uses in the pause menu (no new story key) |

## Code integrator, polish round 2 (2026-10-04): what was decided on the code-side rows

| Row | Decision |
|---|---|
| orders | no order was edited; the integration's commands and the e2e driver are in `docs/INTEGRATION_REPORT.md` |

