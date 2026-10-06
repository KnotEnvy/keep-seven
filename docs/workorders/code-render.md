# Work order: `code-render`

Phase 3 (production, round 1). Module: **`src/render/`** plus `tools/gen_fx_atlas.mjs`
(`tx_fx`, `tx_noise`). You are a fresh agent: this file plus the documents it names are
everything you need.

Read first: `CLAUDE.md`, `docs/PLAN.md`, `docs/workorders/README.md`; `docs/ARCHITECTURE.md`
**8 (all: your specification)**, 3.2–3.6, 5 (contracts: section 7 `QualityFeatures`,
`PerfStats`, `SceneRoots`; section 8 `RenderApi`, `VfxApi`, `InstanceApi`, `LampApi`), 7.2,
7.4, 7.5, 13, 15 (the "Render owner" row: your open risks); `docs/ART_BIBLE.md` **2, 3 (every
mood table), 4.4, 8.3, 9 (all VFX), 11 (grade and tiers)**, 12 A / E / F; `docs/GDD.md` 6.8
(shot feedback), 8.3 (pools and caps), 15 (reduce flashes / motion), 16 (colour and shape
law); `docs/research/tech-web.md` **1, 2, 3, 5, 6, 7, 8** and its "Traps" (verified r186 and
postprocessing 6.39 code: lift it; read the APIs in `node_modules/`, not from memory). Then
`src/core/contracts.ts`, `src/core/stubs/basicRender.ts` (what you replace), `src/core/assets.ts`,
`src/core/quality.ts`.

**The foundation as built (binding; where it and this order disagree about the harness, the
hook or the engine, it is what the code does):** `docs/FOUNDATION_REPORT.md` sections 2 (test
commands and their cost), 3 (debug hook, harness, deaths inside a script), 5 (sandbox, the
stubs beside you), 6 and 9 (known gaps); `docs/requests/foundation-core.md` section 4;
`tests/core/example.mjs`; README section 4 ("Read first", 4.1 "Standing on the foundation"). Three rules of it are yours to
keep: draw only chunk meshes, `drawnNodes` and plugs of a zone GLB (4.7); the view-model group
is in camera space (4.4); the tone map is the stub's shoulder curve, not Neutral (4.1, 4.3).

## 1. Mission

The demo is judged on two things: how it looks and how it runs on a slow machine. You own
both at once. **The look is baked light, fog, sky and grade, not runtime lighting**: an
unlit world shader that multiplies vertex colour, a greyscale detail texture and a baked
lightmap; a sky with a leaning violet hairline on the horizon; fog whose colour is always
the horizon's; one merged post pass. **Low is the product** (60 fps on a 2017 integrated GPU
at 720p: ≤ 100 draw calls typical, ≤ 150 worst, ≤ 120k triangles, ≤ 64 MB of textures and
render targets, no dynamic shadows, one full-screen pass); High adds bloom, FXAA and one
shadow map; a hidden `min` tier with no composer exists so a weak machine has somewhere to
go. And you draw every piece of feedback that makes the gun the star (pillar 1): the flash
that is the only light in the room, the tracer, an impact for every surface ("silence after
a shot is a bug"), and the ring that races across every surface when the seventh is fired.

## 2. Owned files (exclusive)

```
src/render/**                index.ts (exports exactly createRenderSystem) + your files, e.g. renderer.ts, materials/*.ts,
                             worldShader.ts, moods.ts, sky.ts, fog.ts, post/*.ts, tiers.ts, vfx/*.ts, decals.ts, lines.ts,
                             cards.ts, instances.ts, lamps.ts, blobs.ts, visibility.ts, viewModelPass.ts, stats.ts, feedback.ts
tools/gen_fx_atlas.mjs       draws tx_fx (1024 x 512 RGBA) and tx_noise (128 x 128 R8) with sharp
sandbox/render.html  sandbox/render.ts
tests/render/**
shots/code-render/**
docs/requests/code-render.md
public/assets/tex/{tx_fx,tx_noise}.webp   through `node tools/build-assets.mjs --only render`
```

Import rule: only `src/render/`, `src/core/`, `three`, `three/examples/jsm/*.js`,
`postprocessing`. Never edit `src/core/` (the quality **manager** is core's: you implement
what its `features` ask for), `design/*.json`, other modules.

## 3. Contracts

- **Implement** `RenderSystem` = `GameSystem` + `RenderApi`: `renderer`, `vfx`, `instances`, `lamps`, `material()`, `render()`, `resize()`, `setVisible / unitVisible / zoneVisible`, `setMood`, `setExposure`, `setLightLayer`, `setWrongFade`, `setEmissive`, `addTrauma`, `setOutline`, `setSky`, `warmUp`, `benchmark`, `capture`, `collectStats`, `debugState`.
- In `init()` install `ctx.assets.setMaterialResolver(render.material)` **before any asset is activated**.
- **Listen** (one-shot feedback is event-driven: nobody calls you for these): `weapon/fired`, `combat/hit`, `combat/line_resolved`, `enemy/freed|felled|died|telegraph|attack`, `knot/burst`, `knot/regrown`, `shootable/hit`, `breakable/broken`, `projectile/landed|burst`, `pickup/spawned|collected`, `boss/guard|proven`, `quality/changed`, `options/changed` (fov is the player's; you take `reduceFlashes`, `reduceMotion`, `screenShake`, `resolutionScale`), `load/set`, `game/state`.
- **Read** (never call into other systems): `ctx.player.eye / forward`, `ctx.world.zone / cell`, `ctx.clock.simTime / tick / alpha`, `ctx.quality.tier / features / pixelRatio`, `ctx.data` (zones, moods, sun, markers), `ctx.assets.texture / get`.
- **Others call you directly** only where a handle or a return value is needed: player (`vfx.muzzleFlash`, `addTrauma`), enemies (`vfx.acquireLine / acquireCard / ring / blobShadow`, `instances.*`, `lamps.*`, `setEmissive`, `zoneVisible`), world (`setVisible`, `setMood`, `setExposure`, `setLightLayer`, `setWrongFade`, `setSky`, `setOutline`, `instances.*`, `lamps.*`, `vfx.acquire*`, `warmUp`), core (`render`, `resize`, `benchmark`, `capture`, `collectStats`, `warmUp`).
- **World decides what is visible; you never do.** `setVisible(units)` toggles chunk meshes (`<chunk id>__<material>` under the zone group), the drawn nodes of zones with a visible chunk, chunkless world-space assets (`rim_town_card`, `env_backdrop_day`, `env_backdrop_dusk`) and plug nodes. **Every other mesh of a zone GLB is never drawn** (`collider_terrain` in `env_the_lip`: drawn, it z-fights the whole gully); `basicRender` hides them, and you must do the same (ARCHITECTURE 18).

## 4. Deliverables

### 4.1 Renderer and tiers (ARCHITECTURE 8.2; numbers are `design/assets.json` `tiers`)
- [ ] `WebGLRenderer` (WebGL2), context `{ antialias: tier === 'min', depth: true, stencil: false, powerPreference: 'high-performance' }`; `renderer.info.autoReset = false`; sRGB output; no three.js light objects added or removed after warm-up.

| | `min` (hidden) | Low | High |
|---|---|---|---|
| Post chain | **none**: no `EffectComposer`; the **shoulder tone map** (below) + grade inlined into every material through `CustomToneMapping` (`toneMapped = true`); vignette as one alpha-blended quad; no grain | `postprocessing`, HalfFloat buffers, **one merged pass**: the shoulder tone map + grade + vignette + grain | Low's pass with bloom merged in (half-res luminance, 5 levels, additive, threshold 1.0, intensity 0.6), then FXAA as a second pass |
| Anti-aliasing | context MSAA when booted on `min`; none after a runtime demotion | none | FXAA |
| Full-screen draws | 0 (+ the vignette quad) | 1 | 12 |
| Halo sprites on emissives | 100 % | 100 % | 50 % |
| Dynamic shadows | instanced blob quads | blob quads | one 1024² sun shadow map, dynamic casters only, exterior zones only, `ShadowMaterial` overlay on the ground chunks; blobs indoors |
| Heat shimmer, sand sparkle, enamel fresnel | off | off | on |
| Sun-blade cards per opening / motes | 2 / ≤ 40 | 2 / ≤ 40 | 3 / full |
| Particle counts | Low column of ART_BIBLE 9.2 | Low | High |
| Additive overdraw cap | 1.0 screen | 1.0 | 1.5 |
| Max / min pixel ratio | 1.0 / 0.5 | 1.0 / 0.5 | min(dpr, 1.5) / 0.7 |
| Largest drawing buffer | 1152 × 648 | 1366 × 768 | 1920 × 1080 |
| Budget: draw calls typical / worst | 100 / 150 | 100 / 150 | 220 |
| Budget: triangles | 120k | 120k | 400k (shadow pass included) |
| Budget: textures + render targets | 64 MB | 64 MB | 128 MB |

- [ ] Tier switches at runtime on `quality/changed` (Low ↔ High ↔ `min` without a page reload; a demotion to `min` cannot add context MSAA: accepted). `resize()` honours `ctx.quality.pixelRatio` and the buffer caps.
- [ ] `benchmark()`: 8 additive full-screen passes into a 1280 × 720 target, synced by a 1-pixel `readPixels`, median of 5 → ms per pass.
- [ ] `warmUp()`: `compileAsync`, `initTexture` for the active set, one hidden frame with every zone of the active set visible and every flash / pulse / lamp configuration exercised, so no program compiles during play.
- [ ] `collectStats(out)`: draw calls, triangles, points, lines, programs, geometries, textures, `textureBytes` (manifest `gpuBytes` of active textures + bone textures), `renderTargetBytes` (from the buffers actually allocated: per-pixel figures of ARCHITECTURE 8.4), particles, decals, instances.
- [ ] `capture()` returns a PNG data URL of the frame just drawn (deterministic in test mode: shader time = `clock.simTime`, grain seed = `clock.tick`; nothing reads a wall clock).

### 4.2 The material factory (`material(blenderName, mesh, def)`: ARCHITECTURE 8.1). One shared program per variant; every patched material sets `customProgramCacheKey`; all uniforms are shared objects.

| Name | Runtime |
|---|---|
| `m_frontier`, `m_pellam`, `m_sand` | `MeshBasicMaterial` patched by `onBeforeCompile` into the **world shader**: `vcol × detail(UV0).r × 2 × light`, where light = `lightmap(UV1) × lightmapScale (2)` + light layers when the mesh has a lightmap (mesh extra `lightmap`, `lightLayer`), else `VERTEX_LIGHT_SCALE` (2); then cloud shadow (exterior moods), the two radial pulse terms (`uPulse[2]`: position, radius, colour), fog. Variants by `defines` `LM`, `LAYER`, `CLOUD`. A lightmapped mesh may contain vertex-lit vertices (their UV1 sits on the neutral white texel): **no per-vertex branch**. Lightmaps: sRGB, no mips, `flipY = false`, UV channel 1; not three's `lightMap` slot |
| `m_flat` | world shader with `tx_palette` instead of a detail texture (backdrops, the town card) |
| `m_mask` | world shader, `tx_mask.r` alpha test 0.5, polygon offset for decals; the only alpha-tested material |
| `m_emis` | unlit: `tx_palette_emis` × `COLOR_0.r` × lamp state × flicker(`COLOR_0.g`: 0 steady, 0.5 flicker, 1 off until triggered) × `wrong_fade`(`COLOR_0.b`); fogged; lamp index from UV1.x; each lit lamp gets a `soft_dot` halo 2.5× its size from the halo pool |
| `m_prop` | one shared program for every dynamic or instanced object: `tx_palette` × `COLOR_0` × (zone ambient + unshadowed key N·L + the pooled flash point term) + `tx_palette_emis` × emissive scale × knot pulse (0.7 → 1.0 at 1.5 Hz); fog; skinning and instancing variants. Single objects: zone ambient and key are per-object uniforms from the object's position (`data.zoneAt`), cross-faded 0.3 s. `wrong_fade` turns `violet` emissive to husk grey `#8A8A92` and `violet_band` to aqua. Wind sway for meshes with extra `wind: 1` (weight = height from the pivot). Breath for meshes with extra `breath: 1` (2 mm chest scale, 0.25 Hz, weight in UV1.x) |
| `m_gun` | `m_prop` lighting + `tx_gun` albedo + `tx_matcap_steel` specular × gloss (alpha of `tx_gun`) × zone key colour (+ a fresnel rim toward the zone's sky colour on High). View-model only |

- [ ] `setEmissive(object, scale)`: per-object emissive multiplier (a dead Transit's lens, a freed Bider's knot).
- [ ] Light layers: `setLightLayer(texture, weight, seconds)`: `lm_tally_hatch` tinted aqua, weight 0 → 1; `lm_bore_glow` tinted violet → aqua by `wrong_fade`, **bottom-up by world height** behind the ring.
- [ ] `setWrongFade(0..1)`: one uniform shared by world, emissive and prop shaders.
- [ ] Greyscale textures upload as R8 (`RedFormat`). **Measure and report whether the R8 WebP path works**; the fallback is in ARCHITECTURE 8.4.

- [ ] **Tone map (producer ruling, README section 6 ruling 15): a shoulder-only curve, no toe. Copy `TONE_MAP_GLSL` of `basicRender` (knee 0.8) on all three tiers: it lives in **`src/core/tonemap.ts`** (`TONE_MAP_GLSL`, `TONE_MAP_KNEE`, `installToneMap(THREE.ShaderChunk)`, and `toneMap(r, g, b, out)`, the same curve in JS for tests), which `src/render` may import, so use the same string rather than a retyped copy; do not use three's `NeutralToneMapping` or postprocessing's Neutral mode.** After exposure, with `m = max(r, g, b)`: `m ≤ 0.8` → the colour unchanged; else `t = m − 0.8` and the colour × `(0.8 + 0.2 · t / (t + 0.2)) / m` (slope 1 at the knee, the brightest channel approaches 1.0 and never reaches it, hue kept). On `min`: `installToneMap(THREE.ShaderChunk)` once before any material compiles, then `renderer.toneMapping = THREE.CustomToneMapping` (exactly what `basicRender` does; add your grade after the curve inside the same hook). On Low and High: paste `TONE_MAP_GLSL` into the merged pass (rename the function; define `toneMappingExposure` or multiply by your exposure first) and call it on the linear colour before the grade. Reason: Neutral's toe subtracts up to 0.04 linear from every dark colour (steel 54,82,90 would display as 23,67,77; steel_dark 30,47,54 as 3,35,44; gun_blue 28,34,48 as 3,16,37; walnut 58,35,24 as 51,22,2), and the artists judge colour in `sandbox/viewer.html`, **which shows exactly this curve**. Test: a flat unlit card of each of steel, steel_dark, gun_blue, cable and walnut at exposure 1 with the grade set to identity displays within 1 / 255 of its sRGB value on `min`, Low and High.

### 4.3 Moods, sky, fog, grade (`setMood(mood, seconds)` cross-fades all of it; default cross-fade 1.5 s)

| Mood | Fog colour, density /m | Sky / notes | Dyn ambient | Dyn key | Exposure, tint, lift, saturation, contrast, vignette |
|---|---|---|---|---|---|
| `L0` glare | toward `#E6E2D0`, ×1.6 of L1 | as L1 | as L1 | as L1 | ×2.4 → ×1.0 over 20 s; (1.04, 1.02, 0.98); (0.03, 0.03, 0.03); 0.75 → 1.0; 0.96; 0.25 |
| `L1` Long Light | `#EDBB86` toward the sun, `#C9A592` away (one dot product); 0.0058 (20 % at 40 m, 50 % at 120 m, 87 % at 350 m); height fog falloff 0.35, extra 1.5 in the gully, 0.6 on the street, 0 in the yard | zenith `#2C5A6E`, mid `#8FB0A0` at 25°, horizon `#F3C58E`, below `#C9A592`; sun disc `#FFE9B8` radius 1.6°, halo to 14°, at azimuth 315°, elevation 14°; cloud-shadow scroll (`tx_noise`, world space, 0.6 m/s toward the south-east, ×0.82–1.0) | `#7A86D8` × 0.55 | `#FFD09A` × 1.1 from `S = (−0.686, 0.242, −0.686)` | ×1.0; (1.06, 1.00, 0.92); (0.015, 0.020, 0.040); 1.00; 1.06; 0.35 |
| `L2` Tally | `#2E222B`, 0.020, no height term | none visible | `#4A3A44` × 0.35 | off (inside a blade volume: `#FFD09A` × 1.2 from `S`) | ×2.0; (1.05, 0.98, 0.90); (0.030, 0.020, 0.025); 0.92; 1.08; 0.55 |
| `L3` Gallery | `#0F1C33` → `#17414B` at 40 m, 0.023 | none | `#1E3A5C` × 0.45 | `#7CF2E2` × 0.5 from (0, 1, 0) | ×1.6; (0.94, 1.00, 1.04); (0.010, 0.020, 0.040); 0.95; 1.08; 0.50 |
| `L4` Hall | `#0E1A2E` → `#143540`, 0.026 | none | `#1E3A5C` × 0.40 | `#7CF2E2` × 0.45 from above | ×1.6; same tint and lift; 0.95; 1.10; 0.50 |
| `L5` Bore, unproven | `#2A1B4A`, 0.018; height term from the kerb top (antechamber sub-volume: `#1A1420`, 0.015) | none | `#4A3A7A` × 0.45 (catwalk `#5A3A8A` × 0.40; antechamber `#3A2A30` × 0.35) | `#B24BFF` × 0.5 from below (antechamber: flame × 0.6 from the embers) | ×1.5; (1.02, 0.96, 1.06); (0.025, 0.010, 0.045); 1.00; 1.08; 0.55 |
| `L5p` Bore, proven | `#12343C`, 0.012 | none | `#2A6A70` × 0.50 | `#7CF2E2` × 0.6 from below | ×1.5; (0.94, 1.02, 1.02); (0.010, 0.025, 0.035); 0.95; 1.06; 0.45 |
| `L6` Blue hour | `#4D5578`, 0.012, height extra 0.8 | zenith `#1B2440`, mid `#5D6690`, ember band `#D9967A` 6° tall, strongest at 315°, cold `#4D5578` in the east; no sun | `#4A5A96` × 0.50 | `#FF9E6B` × 0.35 from (−0.70, 0.10, −0.70) | ×1.8; (0.98, 0.98, 1.06); (0.015, 0.018, 0.040); 0.90; 1.04; 0.50 |

- [ ] **Sky**: one triangle drawn last, dithered. **The Rule**: a hairline at azimuth 0° (north) from the horizon past the zenith, leaning east by `ruleLeanDeg` (`setSky`: 1° in the opening, 2° on the rim), core `#F0DCFF` **constant 2 px**, halo `#B24BFF` 10 px at 25 % (14 px at 35 % on the rim); not exposure-scaled, no bloom dependence. **The plumb thread**: aqua, constant 2 px, dead vertical, rising from `rim_town_card`'s `socket_thread`, drawn when `threadVisible`.
- [ ] **Fog** = `1 − exp(−density × distance)` + the height term (`tech-web.md` 7); **fog colour always equals the horizon colour**; shared uniforms across every material.
- [ ] `setExposure(multiplier, seconds)` on top of the mood (the 20 s glare ramp, the Tally entry).
- [ ] Grain 0.035 on Low and High (it is also the dither that hides banding), seeded by `clock.tick`. Tone map: **the shoulder-only curve of 4.1 (no toe)**, applied after exposure and before the grade. No pixel under `#0B0D12` except UI: with no toe nothing but **the grade's lift** guarantees it, so test it (a black card under every mood reads at or above `#0B0D12`).
- [ ] Per-zone dynamic ambient and key for `m_prop` come from this table by the object's zone (and the sub-volumes of `the_bore`); instanced sets take theirs at `instances.add()`.

### 4.4 View-model pass
- [ ] **Children of `scene.viewModel` are in camera space** (camera at the origin, looking down −Z, +Y up: as `art-weapons` authors the gun). **Render** gives the group the world camera's pose before its second pass (it copies `camera.matrixWorld` onto the group, `matrixAutoUpdate = false`) and draws it with its own 52° camera at that pose; a world-space position of a node under it (the `muzzle`) is therefore right after `render()` or after `group.updateMatrixWorld()`. **Player never transforms the group itself**, only what it added (kick, bob, sway on the instance root). `basicRender` does exactly this (`tests/core/sandbox.test.mjs`, "view-model: …": `weapon_revolver` added as `code-player` 4.7 says draws 2 more calls and its muzzle stays at the same screen place after turning and walking: 57.7 % across, 37.2 % up at 16:9 for the placeholder); keep that test green under `KEEP7_REAL=render` or request its stub-specific part.
- [ ] `ctx.scene.viewModel` drawn after the world in a second pass with its own **52° vertical projection**, near 0.02 m, depth cleared (or a compressed depth range) so it never clips walls; it receives zone ambient + key and the muzzle pulse; anchored to the right at 4:3 and 21:9. `frustumCulled = false` only here, on the sky and on shader-displaced meshes.
- [ ] `addTrauma(amount)`: trauma 0..1, decays 1.8 per second; rotational shake only, max 1.2° pitch / yaw and 1.5° roll, × `options.screenShake`; applied to the camera at render time without touching the player's aim; zero with `reduceMotion`.

### 4.5 VFX (`VfxApi`): pooled instanced quads and points; nothing allocates per frame; Low / High counts from ART_BIBLE 9.2; additive overdraw capped at 1.0 screen on Low (1.5 High), alpha-blended smoke at 0.5 screen
- [ ] `burst(id, …)` for **every `VfxId`**: `impact_sand` (6 / 10 dust, crater puff, 0.5 s), `impact_wood` (4 splinters + dust), `impact_adobe` (5 dust + 2 chips), `impact_metal` (6 sparks, gravity, 0.25 s), `impact_ceramic` (5 shards + 2 sparks), `impact_stone` (4 dust + 2 chips), `impact_cloth` (5 ground-coloured dust + 3 linen threads; **no red, ever**), `powder_smoke` (4 / 6 puffs up-right, 0.7 s, `#B9A79C` at 25 %), `knot_burst` (14 violet motes out 0.6 m fading to grey in 0.5 s, a white 60 ms dot, a wet ring), `bider_freed` (6 motes rising 1.5 s), `bider_felled` (6 dust), `transit_death` (6 shards + flash dot), `vent_open` (halo + 4 motes), `stake_stick` (4 sparks), `stake_burst`, `slam_dust` (12 dust ring + 8 chips), `charge_sparks`, `plate_spark` (grey sparks), `canister_burst` (16 sparks, dust ring, flash dot), `guard_shatter` (20 shards + dust), `jug_burst` (8 clay shards, a 1.2 s sand pour, a growing cone, dust), `insulator_break` (6 white shards + dot), `bottle_break`, `pickup_glint` (`star4`, 60 ms), `lamp_answer`, `dust_short`, `embers` (6 rising flame points, 2 s), `steam` (3 wisps, 2 s), `lance_sparks`.
- [ ] `decal(surface, …)`: pool of **48**, each ≥ 20 s, alpha-tested, one per surface type from the atlas (`dec_wood`, `dec_adobe`, `dec_metal`, `dec_ceramic`, `dec_stone`); sand takes none.
- [ ] `line(kind, a, b)` one-shot and `acquireLine(kind)` persistent: **constant pixel width**: `tracer` (flame-white, 3 m long streak, 2 px, 2 frames), `ricochet` (6 m, reflected), `line_round` (aqua, 3 px with a soft halo, holds 1.2 s, fades 0.3 s), `sighting_thread` (flame, 2 px, dashes 0.3 m), `lance_thread` (flame, dashed), `relight_thread` (violet, 2 px, a bright head climbing over 1.0 s; pool 6), `standing_line` (aqua with a white core, 4 px, permanent), `aqua_thread`. Pools sized to GDD 8.3.
- [ ] `ring(kind, x, y, z, radius, fillSeconds, holdSeconds)`: a flame ring on the floor with **eight tick marks**, drawn by shader on one quad, filling over `fillSeconds`; pool of 2 for `canister`, 1 for `slam`.
- [ ] `acquireCard(kind)`: `sun_blade` (two crossed additive cards, `#FFD9A8` at 22 % peak, fading edge-on and within 0.3–2.5 m of the camera; `setPosition` / `setEnd` give the path), `sun_patch` (additive quad ≤ 2.5 × 1.5 m), `lance` (4 × 0.25 m additive, white core), `mouth_glow` (flame disc growing with `setLevel`, six radial ticks), `aim_star` (`star4`, growing over the tell), `halo`, `last_fire` (flame sprite never under 4 px, flicker 5–8 Hz, kindling over 1.5 s), `dowser_glint`, `sand_thread`. Returns `null` when the pool is empty.
- [ ] `muzzleFlash(kind, x, y, z)`: one `flash_*` quad at the muzzle (0.35 m, one of four, 33–50 ms, additive) **plus the world light pulse (flame, radius 7 m, 70 ms; 35 % outdoors by day) and the pooled point term on dynamic objects**. `kept`: aqua-white, 0.5 m, 80 ms. `options.reduceFlashes`: sprite 60 % size, pulse halved.
- [ ] `pulse(x, y, z, radius, seconds, r, g, b)`: the radial term (two slots shared by the muzzle and the ring).
- [ ] `provingRing(x, y, z)` (ART_BIBLE 9.3): a pale ring (white, 1.5 m falloff, 60 % peak) racing outward **0 → 40 m in 1.6 s** across every surface, `wrong_fade` 0 → 1 behind it, `lm_bore_glow` turning violet → aqua bottom-up, fog and mood to `L5p`, the permanent `standing_line` on the bore axis, then **four seconds in which no particle spawns**; afterwards a slow aqua ripple (scrolling `tx_noise`) on `bore_glow`. With `reduceFlashes`: no ring, a 1.6 s tint.
- [ ] `blobShadow()`: one instanced quad pool (≥ 12); a no-op handle outdoors on High (the shadow map replaces it).
- [ ] Ambient emitters you run yourself from the layout while their zone is drawn: interior dust motes (300 / 600 points wrapped round the camera, visible only inside blade volumes: 1 draw call), exterior blowing sand (200 / 400 streaks along the wind: 1 draw call), `embers` at `prop_camp_three` and `steam` beside it.

### 4.6 Event-driven feedback (`feedback.ts`): the complete map
- [ ] `weapon/fired`: `powder_smoke` at the muzzle; `lead_round` → `tracer` from the muzzle toward the end point; `line_round` → `line_round` from muzzle to end point; `kept_round` → nothing more (the flash came by the direct call).
- [ ] `combat/hit`: `impact` → `impact_<surface>` + decal; `deflected` → `plate_spark` + `ricochet` line along the ricochet direction; `hit` / `weak` / `kill` / `freed` on a Bider → `impact_cloth`; on machines → `impact_ceramic`; `broke` / `parried` → by entity kind (below); a small aqua `soft_dot` at each body a line round passes.
- [ ] `enemy/freed` → `knot_burst` + `bider_freed`; `enemy/felled` → `bider_felled`; `enemy/died` (transit) → `transit_death`; `enemy/telegraph` (tamper, slam) → `vent_open`; `enemy/attack` (tamper slam) → `slam_dust`; (tamper charge) → `charge_sparks`.
- [ ] `knot/burst` → `knot_burst`; `shootable/hit`: `jug` → `jug_burst`, `latch` / `bell` → `insulator_break`, `dowser` → `dust_short`, others → the surface impact; `breakable/broken` → `bottle_break` (or `jug_burst` for clay, `insulator_break` for ceramic).
- [ ] `projectile/landed` (stake) → `stake_stick`; `projectile/burst` → `stake_burst` / `canister_burst`.
- [ ] `pickup/spawned` / `pickup/collected`: keep a small table of live pickups and give each a `pickup_glint` every 2.5 s.
- [ ] `boss/guard` (`shattered`) → `guard_shatter` at `sp_windlass` + the drum offset; `boss/proven` → `provingRing`.

### 4.7 Instancing, lamps, outline, visibility
- [ ] `instances.add(asset, node, x, y, z, rotYRad, scale)`: one `InstancedMesh` per (asset, node), one draw call; returns −1 when the asset is not active; **the instance colour is premultiplied by the ambient and key of the zone containing the instance at `add()` time**; `setTransform`, `setMatrix`, `setTint`, `setVisible`, `remove` (swap-remove, handles stay valid). Capacity grows only at load.
- [ ] `lamps.setMask(lampSet, mask)` (≤ 32 lamps), `setCount(lampSet, n)` (any size: 48 town windows, 26 gauge segments, 12 listening lamps), `setBoost(lampSet, boost)` (the 150 ms "answer" blink, hint pulses).
- [ ] `setOutline(object | null)`: a 2 px aqua-white screen-space outline pulsing at 1 Hz (hint tier 3). GDD 20.1 row 3: cuttable; if cut, the method is a documented no-op.
- [ ] `setVisible`, `unitVisible`, `zoneVisible` as section 3.

### 4.8 `tools/gen_fx_atlas.mjs`
- [ ] `tx_fx` 1024 × 512 RGBA, premultiplied alpha, the layout of ART_BIBLE 9.1: row A four 256 px cells `flash_a…d` (a six-pointed star with unequal arms, white-hot core to flame edge, four rotations with different arm lengths); rows B–C sixteen 128 px cells: `smoke_a`, `smoke_b`, `dust_a`, `dust_b`, `spark`, `soft_dot`, `star4`, `shard`, `splinter`, `sand_pour`, `mote_cluster`, `dec_wood`, `dec_adobe`, `dec_metal`, `dec_ceramic`, `dec_stone`. `tx_noise` 128² R8, tiling soft cloud noise. Deterministic. Written to `blender/export/tex/` and shipped by `node tools/build-assets.mjs --only render`. **`tx_noise` must be a one-channel PNG**: `sharp(buf, { raw: { width, height, channels: 1 } }).png()` writes three channels and the driver answers `FAILED tx_noise: optimise: … has 3 channels; format r8 wants a greyscale PNG`; add **`.toColourspace('b-w')`** before `.png()`. `node tools/preview-asset.mjs tx_fx --textures --piece code-render` (without `--piece` the sheet lands in `shots/foundation-pipeline/`).

## 5. Sandbox (`sandbox/render.html`; tier switch `min` / Low / High and the perf overlay always on)

- [ ] `zone:<id>` for each of the seven zones: lightmaps, fog, sky, mood, the neighbours its cells show.
- [ ] `materials`: every `m_*` on test meshes under each mood, with a lightmapped + vertex-lit mesh, a light layer slider and a `wrong_fade` slider. The lightmapped mesh and the lightmap-path test load the pipeline fixture room with `await sb.loadOverlay('tests/pipeline/fixtures/manifest.json')` then `await sb.activate(['fixture_room'])` (`src/core/sandbox.ts`); your resolver is the one in effect. Run `node --test tests/pipeline/` once first (or `node tools/build-assets.mjs --manifest tests/pipeline/fixtures/manifest.json --only fixtures`, 3 s): the fixture files are generated and git-ignored.
- [ ] `vfx`: every `VfxId`, line, ring, card and flash on a labelled grid, looping.
- [ ] `budget`: the worst-case fight mock: 6 skinned enemies, 18 stuck stakes, 8 in flight, 48 decals, 2 rings, every pool full, firing every 0.48 s.
- [ ] `seventh`: the ring, `wrong_fade`, the standing line, with and without Reduce Flashes.
- [ ] `cells`: walk the real layout with the visibility cells live and each cell's computed bound beside the measured numbers. The stub world beside you draws every shut door (and the hatch) as a greybox box the size of its collider: one instanced mesh `stub_doors_mesh` under `scene.dynamic`, pale steel for the hatch, dark wood for doors, visible while the collider is enabled; a greybox frame shows whether a door is shut (one call and 12 triangles per shut door in your numbers). The stub world ignores the zones' dressing empties, so cell numbers beside it contain no dressing.

## 6. Tests (`tests/render/`)

- [ ] **Budgets** (`budget.test.mjs`): `perfRun` in the `budget` scene on every zone: draw calls and triangles within `assertBudget` for `min`, Low and High; `textureBytes + renderTargetBytes` ≤ 64 MiB on `min` and Low and ≤ 128 MiB on High **for every stage** (`surface`, `seam`, `underground`, `coda`); full-screen draws 0 / 1 / 12.
- [ ] **No hitch**: after `warmUp`, `renderer.info.programs` does not grow over a scripted run that fires, changes mood, shows every effect and crosses a zone boundary.
- [ ] **Display targets** (pixel samples through `Game.pixel` on flat test cards under mood L1 with placeholder or final art): lit sand within ΔE 10 of `#F4A272`, shadow on sand `#5C4E59`; fog at 40 m ≈ 20 % and at 120 m ≈ 50 % toward the horizon colour (± 3 %); fog colour equals the sky's horizon pixel (ΔE ≤ 4).
- [ ] **Lightmap path**: the pipeline fixture room: the floor shows its lightmap, the vertex-lit wall its vertex light at the same brightness scale (a white lightmap texel and a 0.5 vertex colour give the same output within 1/255).
- [ ] **The Rule and thin lines**: the Rule, the sighting thread and the line-round line are 2 / 2 / 3 px wide (± 1) at 640 × 360 and at 1920 × 1080; the last-fire card never under 4 px.
- [ ] **Feedback completeness**: for each `SurfaceType` a `combat/hit` produces a burst (and a decal except on sand); for each `HitOutcome` something is drawn; the `feedback.ts` map covers every `VfxId` at least once (static check).
- [ ] **Pools**: 200 decals requested → 48 alive; 20 `acquireLine('relight_thread')` → 6 handles then `null`; no growth of `geometries` / `textures` over 3 600 ticks of the `budget` scene.
- [ ] **Tiers**: screenshots of one view on `min`, Low and High: Low versus High differ in under 8 % of pixels beyond a threshold of 0.1 (they must be hard to tell apart); `min` has no composer (`renderTargetBytes` matches its formula).
- [ ] **Reduce Flashes**: no additive full-screen change; the ring replaced by a tint; flash sprite 60 %.
- [ ] **Determinism**: two runs, one script: identical PNGs on Low; identical `hash()` across tiers.
- [ ] **Allocation**: ≤ 6 KB per tick **plus a rendered frame** in the `budget` scene, measured with `measureAlloc(game, (dbg, n) => { for (let i = 0; i < n; i++) dbg.step(1, true); })` of `tests/harness.mjs` (3000 ticks of warm-up; core + stubs measure 2.8 KB).
- [ ] Violet coverage helper `ext.render.violetShare()` (pixels within ΔE 25 of `#B24BFF`) for critics; asserted < 2 % in each exterior zone scene.

## 7. Definition of done (measured)

1. `npx tsc --noEmit` clean in your files (`npx tsc --noEmit 2>&1 | grep -E 'src/render|sandbox/render|tests/render'` prints nothing); `npx vitest run tests/render` and `node --test tests/render/` pass. **Wired in: `KEEP7_REAL=render node --test tests/core/` passes** (budget, seam, determinism, alloc and walk are the ones your renderer moves): boot, flow, walk, seam, determinism, alloc, budget and playthrough then run on the index page with your system in its slot and core stubs in the other five (about 2.5 minutes, up to 3.5 on a busy machine: run it in your final pass, not while iterating). Plain `node --test tests/core/` keeps core stubs in all six slots and **never loads `src/render/`**: it proves nothing about your system. `KEEP7_REAL` has only ever run against modules that wrap the stubs: a failure your system causes by design (a stub-specific value in an assertion) is a request to core in `docs/requests/code-render.md` naming the test and both values, listed in your report, not something to work around (README 4.1).
2. Reported numbers: draw calls / triangles / MiB per cell and tier from `tests/core/budget.test.mjs` re-run with your renderer; JS `updateMs` share for render ≤ **1.5 ms** median in the `budget` scene (`renderMs` under SwiftShader is relative: report it but do not judge it); program count after warm-up; the R8 verdict; FXAA-after-grain verdict (if it smears the grain, move the grain into the FXAA pass and say so).
3. `shots/code-render/` (960 × 540, opened by you): each zone scene on Low; the doorway shot with the Rule; `materials_L1.png` … `materials_L6.png`; `vfx_grid.png`; `seventh_0..5.png` (the ring at 0, 0.4, 0.8, 1.2, 1.6 s and after); `tiers_min.png` / `_low.png` / `_high.png` of one view; `budget_worst.png` with the overlay; `viewmodel_pass.png`; `tx_fx.png`.
4. A report: what the real GPU cost might be and which lever you would pull first (the cloud-shadow tap, the light-layer tap, then `min`); every gap; what must be re-judged when final art and lightmaps replace placeholders.

## 8. Non-goals

Deciding visibility (world); authoring geometry, lightmaps or the shared trim / palette /
mask textures (art, pipeline); HUD and menus (UI, DOM); the tier **decision** and adaptive
resolution controller (`core/quality.ts`); SSAO, SMAA, MSAA on Low or High, normal maps,
real-time relight, dynamic shadowed point lights, WebGPU, KTX2, `BatchedMesh`, LOD chains.

## 9. Dependencies and stubs

- **Art is placeholder when you start**: greybox zones with a flat lightmap and the neutral texel, placeholder props and creatures with final names and lamp sets. Everything must look intentional on placeholders (flat colour, correct fog and grade) and need no code change when final art lands. The six final shared textures (`tx_palette`, `tx_palette_emis`, both trims, `tx_sand`, `tx_mask`) already exist.
- **Your tests load only your system**: `openGame(server, { piece: 'code-render' })` on the index page defaults to `stubs: othersThan('render')` (five core stubs beside you); leave the default. Deaths, restarts and warps inside a script: `game.step / until / run` survive them; in your own `page.evaluate` use `await __dbg.ext.core.stepAsync(n)` (a bare `__dbg.step` stops at the tick that queued the restore). Allocation: `measureAlloc` of `tests/harness.mjs` (3000 ticks of warm-up), ceiling 6 KB per tick. **`ctx.clock.tick` keeps counting while paused or loading**: timers that must stop with the game count ticks in your own `fixedUpdate` or use `clock.simTime` / `clock.unscaledTime` (README 4.1).
- **Other systems are core stubs in your sandbox**: drive effects with sandbox buttons and `__dbg.emit`. The real callers arrive at integration; your API is the contract.
- **`core/quality.ts`** tells you the tier and pixel ratio; `core/assets.ts` loads and hands meshes to your resolver. A bug there is a request, not an edit.
- ART_BIBLE 11.2 says "MSAA ×4" on High and names per-lamp nodes: **ARCHITECTURE 7.6 and 8.2 win** (FXAA; lamp sets).
