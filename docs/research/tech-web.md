# Web tech brief — three r186 FPS on WebGL2

Verified technical brief for the runtime side of the demo. Everything here was checked against the
**installed** packages (three 0.186.1, three-mesh-bvh 0.9.15, postprocessing 6.39.5, vite 8.3.2,
typescript 7.0.2, vitest 5.0.3, playwright 1.63.0, @gltf-transform 4.5.1, meshoptimizer 1.3.0,
sharp 0.35.5, node 24.21).

**Evidence tags**

| Tag | Meaning |
|---|---|
| **[V]** | Verified by an experiment I ran here (headless Chromium, SwiftShader) — numbers are from that run |
| **[S]** | Verified by reading the installed source in `node_modules/` |
| **[W]** | From a web source, not reproduced here (link given) |
| **[U]** | Unverified estimate / reasoning. Treat as a hypothesis |

**Where the evidence lives.** `scratch/research-web/` (gitignored, throwaway). Every snippet in this
doc is cut (sometimes trimmed) from a file there that type-checks with `tsc --noEmit` and ran green. Re-run any experiment with

```
node scratch/research-web/run.mjs <exp> [--shot name] [--query "a=b"] [--args "--chromium-flag ..."]
# exps: renderer glb bvh drawcalls post atmos quality audio probes shadows flash misc inlinegrade jsonimport instanced alloctest
# (set VITE_CONFIG_NATIVE_IGNORE_WARNING=true to silence the commonjs config warning, see section 10)
node scratch/research-web/game-test.mjs low        # deterministic playtest + timings
node scratch/research-web/unlock-test.mjs         # autoplay + pointer-lock behaviour
node scratch/research-web/alloc-game.mjs          # heap growth per step / frame
node scratch/research-web/prod-test.mjs           # production build served by vite preview
node scratch/research-web/optimize-glb.mjs in.glb out.glb
```

Screenshots I looked at are in `shots/research-web/`. Reusable prototypes (copy, do not import from scratch):
`src/lib/{atmosphere,bvhQueries,capsule,quality,gradeEffect,loop,input,audio,pool,alloc}.ts`.

**Read this first: what SwiftShader numbers mean.** The machine was shared with other agents (load
average 24 on 20 cores during some runs). JS-side timings (BVH, sim step, `renderer.render()` CPU cost,
draw-call counts) are real. Anything that includes rasterisation is software rendering and is only
useful as a *relative* ordering. `gl.finish()` does **not** block in Chromium **[V]** — to time GPU
work you must force a sync with a 1-pixel `readPixels`.

---

## 1. Renderer setup (WebGL2, r186)

```ts
import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,                 // default-framebuffer MSAA is wasted once a composer renders the scene offscreen
  alpha: false,
  depth: true,
  stencil: false,                   // already the r186 default
  powerPreference: 'high-performance',   // hint only: picks the dGPU on dual-GPU laptops
  preserveDrawingBuffer: false,
  failIfMajorPerformanceCaveat: false,   // keep false: we WANT to run (at Low) on software GL / blocklisted GPUs
});
renderer.setPixelRatio(1);                        // we drive this ourselves (section 8); never pass raw devicePixelRatio
renderer.setSize(innerWidth, innerHeight, false); // false = do not write canvas.style; CSS (100vw/100vh) sizes the element
renderer.outputColorSpace = THREE.SRGBColorSpace; // default
renderer.toneMapping = THREE.NoToneMapping;       // the post chain owns tone mapping (section 6)
renderer.info.autoReset = false;                  // one game frame = several renderer.render() calls (section 8)
```

### Colour management — measured **[V]** (`exp/renderer.ts`, centre pixel of a full-screen quad)

| Setup | sRGB byte out | Linear value | Meaning |
|---|---|---|---|
| `MeshBasicMaterial({color: 0x808080})`, no tone mapping | 128 | 0.216 | hex colours are sRGB in, converted to linear working space, re-encoded on output |
| same, `ACESFilmicToneMapping` / `AgXToneMapping` / `NeutralToneMapping` | 141 / 136 / 116 | | tone mapping changes mid-greys noticeably — pick once, early |
| same, ACES but `material.toneMapped = false` | 128 | | opt-out per material (HUD, sky if pre-graded) |
| `color.setRGB(0.5, 0.5, 0.5)` | 188 | 0.5 | `setRGB` without a colour space argument is **linear** |
| `MeshBasicMaterial` white + `lightMap` texel 0.5, `lightMapIntensity = 1` | 111 | 0.159 | **lightmap is multiplied by 1/π** |
| same, `lightMapIntensity = Math.PI` | 188 | 0.5 | texel × albedo, what a baked "diffuse light" pass expects |
| `MeshLambertMaterial` white + same lightMap × π, no lights | 188 | 0.5 | Lambert and Basic agree |
| Lambert white + `AmbientLight(…, 1)` | 153 | 0.318 | **every light is divided by π** (no "legacy lights" switch any more) |
| Lambert white + `DirectionalLight(…, Math.PI)` facing | 255 | 1.0 | intensity π ⇒ "albedo × 1" |
| lightMap 0.5 × π with vertex colour 0.5 | 137 | 0.25 | vertex colour multiplies in (use as AO) |
| render to `HalfFloatType` target with ACES set on renderer | — | 0.2158 | **no tone mapping and no sRGB encode when a render target is bound** |

Rules that follow:

- Working space is linear sRGB, `ColorManagement.enabled === true` by default. Colour textures need
  `texture.colorSpace = SRGBColorSpace` (GLTFLoader sets it for baseColor/emissive); data textures
  (normal, roughness, masks) stay `NoColorSpace`.
- Light intensities: think "intensity = π × desired irradiance multiplier". `lightMapIntensity = π × (your encode scale)`.
- Tone mapping set on the renderer is applied inside each material's fragment shader, and **only when
  drawing to the canvas** **[S]** (`WebGLPrograms.js`: `currentRenderTarget === null`). With a composer the
  scene goes to a render target, so the composer must tone-map and encode.
- three's stock fog is applied *after* tone mapping/encoding in the shader. Through a composer both are
  skipped in the scene pass, so fog mixes in linear HDR — which is what we want.

### Pixel ratio

`setPixelRatio(r)` → `canvas.width = floor(cssWidth × r)` and reallocates the drawing buffer **[V]**
(960×540 @ 0.75 → 720×405; `canvas.style` untouched when `updateStyle=false`). The browser upscales the
canvas to its CSS size for free (bilinear). Ratios below 1 are legal and are how adaptive resolution works.
With a composer, follow with `composer.setSize(w, h, false)` — it reads the renderer's drawing-buffer size and
resizes every internal target **[V]**.

### Antialiasing trade-offs

| Option | Cost | Notes |
|---|---|---|
| `antialias: true` on the context | free-ish MSAA on the **canvas only** | useless with a composer; only relevant for a no-composer path |
| `EffectComposer({ multisampling: 4 })` | MSAA renderbuffer + resolve of a HalfFloat target | SwiftShader: 21 → 53 ms **[V]** (software; real GPUs are far cheaper **[U]**). High tier only |
| `SMAAEffect` (own `EffectPass`) | +3 draw calls, +6 textures, 3 full-screen passes | SwiftShader +9.8 ms **[V]** |
| `FXAAEffect` (own `EffectPass`) | +1 full-screen pass | SwiftShader +6.7 ms **[V]**; must run after tone mapping, so it cannot be merged into the main pass |
| none | 0 | Low tier. Texture mips + lightmaps hide most aliasing; geometry edges will crawl |

### What changed recently that trips people up

- `outputEncoding`/`sRGBEncoding`, `texture.encoding`, `useLegacyLights`, `physicallyCorrectLights` are gone **[S]**. Use `outputColorSpace`, `texture.colorSpace`; lights are always physical (÷π, table above) **[V]**.
- WebGL1 is gone (r163); `new WebGLRenderer` throws on a WebGL1 context **[S]**.
- `THREE.Clock` is deprecated since r183 and warns; use `THREE.Timer` or (better for us) our own fixed-step loop **[S]**.
- `PCFSoftShadowMap` was removed (r182): it silently falls back to `PCFShadowMap` with a warning **[S]**.
- `BufferGeometryUtils.mergeBufferGeometries` → `mergeGeometries`; second UV set is `uv1` (not `uv2`), selected per texture with `texture.channel` **[S][V]**.
- r186 has a built-in HDR output path: `new WebGLRenderer({ outputBufferType: HalfFloatType })` + `renderer.setEffects([...])` **[V]** (HDR 4.0 → ACES → 250, one extra draw). It expects three's own `examples/jsm/postprocessing` passes, not the `postprocessing` package — **do not mix the two**. Leave `outputBufferType` at its default.
- r186: `setViewport()/setScissor()` no longer scale by pixel ratio while a render target is bound **[W]** ([migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide)). Matters only for hand-written render-target code.
- r178: `MultiplyBlending`/`SubtractiveBlending` require `material.premultipliedAlpha = true` **[W]** — relevant for multiply decals.
- `postprocessing` 6.39.5 declares `three >= 0.168 < 0.187` **[S]**. Another reason not to upgrade three.
- `KHR_parallel_shader_compile` is missing under SwiftShader, so `compileAsync` logs a warning there and compiles synchronously **[V]**. Harmless.

---

## 2. Loading GLB

```ts
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

await MeshoptDecoder.ready;                                   // WASM is embedded in the module (71 KB in the bundle)
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);   // ONE shared loader instance
const gltf = await loader.loadAsync('./assets/env/level.glb');
```

Verified on `sample_raw.glb` exported by Blender 4.5.14 and optimised with section 12 **[V]** (`exp/glb.ts`):

| What | Result |
|---|---|
| `EXT_meshopt_compression` + `KHR_mesh_quantization` | load fine; 2.47 MB raw → 450 KB. Load time 46 ms raw vs 29 ms optimised (local, SwiftShader) |
| WebP textures (`EXT_texture_webp`) | decoded via `ImageBitmapLoader`; `texture.image` is an `ImageBitmap`, `userData.mimeType === 'image/webp'`, `flipY === false`, mipmaps on, `RepeatWrapping`, `anisotropy = 1` |
| Node names | **sanitised**: `Crate.000` → `Crate000`, `trigger_door A` → `trigger_door_A`. The original is in `object.userData.name` |
| glTF extras (Blender custom properties, `export_extras=True`) | copied onto `object.userData` (`{kind:'crate', hp:20, loot:'ammo'}`, arrays intact) for nodes; mesh-level extras land on the Mesh too |
| Axis conversion | Blender `(0, −6, 0)` → three `(0, 0, 6)` as CLAUDE.md states |
| `TEXCOORD_1` | becomes `geometry.attributes.uv1` |
| `COLOR_0` | becomes `geometry.attributes.color` (Uint8 ×4 normalised) and the loader sets `material.vertexColors = true` |
| Blender default material | arrives as `MeshStandardMaterial` with **`side: DoubleSide`** (Blender's "Backface Culling" is off by default) |
| Animations | clips by action name (`Idle` 2.5 s, `Walk` 1.0 s at 24 fps); tracks are `<bone>.position/quaternion/scale` — Blender writes position+scale tracks for every bone (2 keys each) |

Replace every loader-made `MeshStandardMaterial`. It is the most expensive built-in material and we never
want PBR on Low. Game materials should come from one factory (section 5).

### KTX2 / Basis: not feasible here

`KTX2Loader` and the Basis *transcoder* ship with three, but there is **no encoder** in `node_modules` or on the
machine (`toktx`, `basisu`, `ktx` absent; `ktx-parse` only reads/writes the container) **[V]**. Adding one is
an external tool, which the stack rules forbid. Consequence: **every texture is uncompressed RGBA8 on the GPU**.

| Texture | GPU bytes (with mips ×1.33) |
|---|---|
| 512² RGBA8 | 1.4 MB |
| 1024² RGBA8 | 5.6 MB |
| 2048² RGBA8 | 22.4 MB |
| 1024² single channel (`RedFormat`) | 1.4 MB |
| 1280×720 HalfFloat RGBA render target (no mips) | 7.4 MB (+3.7 MB depth) |

Plan the 64 MB Low budget in these terms. Memory savers that work: no mipmaps on lightmaps (−25 %);
single-channel textures — `texture.format = THREE.RedFormat` on an ImageBitmap-backed texture uploads as R8
**[V]** (`exp/misc.ts`: sampled `(128, 0, 0)`, no GL error; the shader must read `.r`).

### Animation and skinned clones

```ts
const clips = Object.fromEntries(gltf.animations.map((c) => [c.name, c]));
const enemy = SkeletonUtils.clone(gltf.scene.getObjectByName('Walker')!);   // clones bones; shares geometry + material
scene.add(enemy);
const mixer = new THREE.AnimationMixer(enemy);
const walk = mixer.clipAction(clips['Walk']!); walk.play();
mixer.update(dt);                                             // explicit dt from the fixed step — never a wall clock
// cross-fade:  walk.reset().play(); idle.crossFadeTo(walk, 0.25, false);   -> weights 0.5/0.5 half-way [V]
```

**[V]** six clones: geometry and material shared, six independent skeletons, different poses per mixer.
Each skeleton owns a bone texture (counted in `renderer.info.memory.textures`). `Object3D.clone()` alone
does **not** rebind skeletons — always `SkeletonUtils.clone`.

### Second UV set and lightmaps

- A texture samples UV set *n* when `texture.channel = n`; program generation turns that into `LIGHTMAP_UV uv1` **[S]**.
- GLTFLoader clones a texture and sets `.channel` whenever a glTF texture slot has `texCoord > 0` **[S][V]**.
- glTF has no lightmap slot. Two ways to deliver one, both verified pixel-equivalent (19 of 518 400 pixels over threshold, mean channel delta 0.56 — WebP vs PNG) **[V]**:

  **A. Inside the GLB** — in Blender wire the baked image through a UV Map node (`UVLight`) into *Emission*;
  the exporter writes `emissiveTexture { texCoord: 1 }`. At load:

  ```ts
  function toBakedMaterial(src: THREE.MeshStandardMaterial, lightmapScale: number) {
    const baked = new THREE.MeshBasicMaterial({          // unlit on purpose — see section 3
      name: src.name + '_baked',
      map: src.map, color: src.color,
      lightMap: src.emissiveMap,                         // already cloned with .channel = 1 and sRGB colour space
      lightMapIntensity: Math.PI * lightmapScale,        // ×π because three divides by π; ×scale to undo our 8-bit encode
      vertexColors: src.vertexColors,                    // COLOR_0 multiplies in as AO
      side: THREE.FrontSide,
    });
    src.dispose();
    return baked;
  }
  ```

  **B. Separate file** next to the GLB:

  ```ts
  const lm = await new THREE.TextureLoader().loadAsync('./assets/env/lm_level.webp');
  lm.flipY = false;                        // glTF UV convention; TextureLoader defaults to true
  lm.channel = 1;                          // geometry.attributes.uv1
  lm.colorSpace = THREE.SRGBColorSpace;    // 8-bit lightmap stored sRGB-encoded
  ```

  B keeps lightmaps swappable per tier (512 on Low, 1024 on High) and out of gltf-transform's way. A is one file.
- 8-bit range: the sample bake stores `irradiance × 0.5` (so values up to 2.0 survive) and carries
  `lightmapScale = 2.0` as a custom property → `lightMapIntensity = π × 2`. sRGB encoding gives the dark
  end enough precision. Keep the scale in `design/assets.json`, not hardcoded.

---

## 3. Baked lighting at runtime

**Static world.** One material family: albedo `map` (UV0, tiling) × `lightMap` (UV1, unique) × vertex-colour AO.

| Material for the world | Scene lights reach it? | Result |
|---|---|---|
| **`MeshBasicMaterial + lightMap`** | no (unlit) | baked look preserved; 2 texture taps. **Use this** |
| `MeshLambertMaterial + lightMap`, no lights in the scene | — | identical to Basic **[V]** (188 vs 188) |
| `MeshLambertMaterial + lightMap`, plus the hemisphere + sun that light the characters | **yes — all of them** | **double lighting [V]**: baked shadows wash out, 70 % of pixels changed, mean channel delta 38 (`glb_basic_baked.png` vs `glb_lambert_double_lit.png`) |

three has no per-object light masking (`layers` only filters lights per camera), so a lit world material receives
every light you add for dynamic objects. Keep the world unlit and keep real lights for dynamic objects only.

**Muzzle flash on the walls (pillar 1).** Because the world is unlit, the flash needs its own path. Verified two
ways **[V]** (`exp/flash.ts`, neither recompiles when toggled):

- *Injected distance-only term* on the world material (works on Basic): about one dot product and two multiplies
  per light, driven by shared uniforms. No N·L, so it also brightens faces pointing away — fine for a 50 ms flash.
  **Use this for the world.**

  ```ts
  // needs the world-position varying from the fog chunks in section 7 (vFogWorld), hence the USE_FOG guard
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform vec4 uFlashPos[2];\nuniform vec3 uFlashColor[2];')
    .replace('#include <opaque_fragment>', `
      #ifdef USE_FOG
      for ( int i = 0; i < 2; i ++ ) {
        vec3 fl = uFlashPos[ i ].xyz - vFogWorld;                // xyz = world position, w = radius
        float fa = max( 1.0 - dot( fl, fl ) / ( uFlashPos[ i ].w * uFlashPos[ i ].w ), 0.0 );
        outgoingLight += diffuseColor.rgb * uFlashColor[ i ] * fa * fa;
      }
      #endif
      #include <opaque_fragment>`);
  ```

- *One pooled `PointLight`*, **always in the scene** with `intensity = 0`, pulsed for 2–3 frames. With an unlit
  world it reaches dynamic (Lambert) objects only — which is what we want for enemies and the weapon. Drive both
  from the same "flash" event. (On an all-Lambert test floor it lit the floor with proper N·L, as expected.)

**The light-count trap [V]** (`exp/misc.ts`). Adding a light to a scene for the first time compiled two new
programs and cost a 51 ms frame; changing `intensity` or toggling `visible` afterwards cost nothing because
the program for each light-count combination stays cached. Lights inside an invisible group are not counted
**[S]**, so hiding a zone that owns a light changes the count. Keep a fixed pool of lights parented to the
scene root and warm up every combination you will use.

**Dynamic objects (enemies, weapon, pickups)** need light that matches where they stand. Options, cheapest first:

1. **Per-object ambient uniform + one unshadowed sun** — recommended default. One shared program for all
   instances **[V]** (24 materials → 1 program), each object gets an ambient colour looked up from baked data
   (per-zone value, or nearest of a few probe points exported from Blender), lerped over ~0.3 s as it moves.

   ```ts
   export function makeDynamicMaterial(params: THREE.MeshLambertMaterialParameters) {
     const m = new THREE.MeshLambertMaterial(params) as THREE.MeshLambertMaterial & { ambient: THREE.Color };
     m.ambient = new THREE.Color(0.3, 0.3, 0.3);          // same units as a lightmap texel (irradiance / π)
     const install = (mat: typeof m) => {
       const uniform = { value: mat.ambient };
       mat.onBeforeCompile = (shader) => {
         shader.uniforms.uObjAmbient = uniform;
         shader.fragmentShader = shader.fragmentShader
           .replace('#include <common>', '#include <common>\nuniform vec3 uObjAmbient;')
           .replace('#include <lights_fragment_begin>', '#include <lights_fragment_begin>\nirradiance += uObjAmbient * PI;');
       };
       mat.customProgramCacheKey = () => 'dyn-ambient';    // all instances share ONE program
     };
     install(m);
     const baseClone = m.clone.bind(m);
     m.clone = () => { const c = baseClone() as typeof m; c.ambient = m.ambient.clone(); install(c); return c; };
     return m;
   }
   ```

2. **`HemisphereLight` retuned per zone** (sky/ground colours follow the player's zone). Zero shader work, but
   every dynamic object shares the player's zone lighting. Good enough when sightlines stay inside one zone.
3. **`LightProbeGridWebGL`** (`three/examples/jsm/lighting/`, new, renderer support is built into r186 core) —
   a 3D texture of SH probes baked *at runtime* by rendering cube maps of the scene. **[V]** it works: 243 probes
   (9×3×9) baked in 0.76 s under SwiftShader on the tiny sample and Lambert objects picked up position-dependent
   light. But: bake cost is `probes × 6` scene renders at load, the result was sky-dominated and leaked through
   walls at that density (`shots/research-web/probes_grid.png`), and every lit fragment then pays several 3D-texture
   taps. Optional High-tier experiment only; do not put it on the critical path.
4. `THREE.LightProbe` (single SH9 for the whole scene) — no positional variation; no advantage over option 2.

**Shadows from dynamic objects.** `MeshBasicMaterial` cannot receive shadows.

- Low/Medium: **blob shadows** — one `InstancedMesh` of ground quads with a radial alpha, `depthWrite: false`,
  `polygonOffset` −2/−2. One draw call for all characters **[V]** (`exp/shadows.ts`, `shadows_blob.png`).
- High: one sun shadow map, casters = dynamic objects only, received by a **`ShadowMaterial` overlay that reuses
  the ground geometry** (`opacity 0.45`, `polygonOffset −1/−1`, `depthWrite: false`). **[V]** correct directional
  shadows on an unlit lightmapped floor (`shadows_map.png`). Cost in that test: +5 draw calls (casters into the
  shadow map) and the receiver geometry drawn twice. The baked world must not cast (its shadows are already in the lightmap).

---

## 4. First-person collision — three-mesh-bvh 0.9

### Build one static collider

Do not feed GLB meshes to `mergeGeometries`: meshopt/quantised GLBs give normalised `Int16` and *interleaved*
attributes **[V]**, and `mergeAttributes` demands identical array types. Collision needs positions only:

```ts
import { MeshBVH, SAH } from 'three-mesh-bvh';

export function buildColliderGeometry(root: THREE.Object3D, filter: (m: THREE.Mesh) => boolean): THREE.BufferGeometry {
  root.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !(m as unknown as THREE.SkinnedMesh).isSkinnedMesh && filter(m)) meshes.push(m); });
  let vCount = 0, iCount = 0;
  for (const m of meshes) { const g = m.geometry; vCount += g.attributes.position!.count; iCount += g.index ? g.index.count : g.attributes.position!.count; }
  const pos = new Float32Array(vCount * 3), idx = new Uint32Array(iCount), v = new THREE.Vector3();
  let vo = 0, io = 0;
  for (const m of meshes) {
    const g = m.geometry, p = g.attributes.position!;
    for (let i = 0; i < p.count; i++) {                    // fromBufferAttribute de-normalises + de-interleaves
      v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
      pos[(vo + i) * 3] = v.x; pos[(vo + i) * 3 + 1] = v.y; pos[(vo + i) * 3 + 2] = v.z;
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.getX(i) + vo;
    else for (let i = 0; i < p.count; i++) idx[io + i] = vo + i;
    vo += p.count; io += g.index ? g.index.count : p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
const bvh = new MeshBVH(buildColliderGeometry(level, (m) => m.userData.collide !== false), { strategy: SAH, targetLeafSize: 8 });
```

**[V]** identical bounds from the float and the quantised GLB (within 1 mm). The BVH reorders the geometry's
index buffer in place, so give it its own geometry (as above) rather than a render mesh. Prefer authored
low-poly collision meshes tagged with a custom property over render meshes.

### Cost numbers **[V]** (`exp/bvh.ts`, desktop V8; JS only, so representative)

| Triangles | CENTER build | AVERAGE | SAH build | BVH memory |
|---|---|---|---|---|
| 29 k | 12 ms | 8 ms | 44 ms | 0.9 MB |
| 61 k | 16 ms | 13 ms | 70 ms | 1.9 MB |
| 115 k | 29 ms | 25 ms | 148 ms | 3.6 MB |
| 228 k | 56 ms | 52 ms | 305 ms | 7.3 MB |

| Query, 115 k-triangle level | Time | Garbage per call |
|---|---|---|
| `bvh.raycastFirst(ray, DoubleSide)` | 2.8 µs | 3.1 KB |
| `Raycaster` + `acceleratedRaycast`, `firstHitOnly = true` | 2.9 µs | 3.2 KB |
| `bvh.raycast` (all hits) | 6.9 µs | more |
| **direct-array ray query** (below) | 3.4 µs | 0.26 KB |
| no BVH (`Mesh.raycast` brute force) | 6 300 µs | — |
| capsule step, 3 sub-steps, library `intersectsTriangle` | 12.8 µs | 9.4 KB |
| **capsule step, 3 sub-steps, direct arrays + AABB prefilter** | 5.8 µs | 1.2 KB |
| `MeshBVH.serialize` / `deserialize` (115 k) | 1.3 ms / 0.1 ms | 2.6 MB payload |

A full player step is under 6 µs; a hundred hitscan rays per frame cost about 0.3 ms. Collision is not a budget risk.
SAH's extra 120 ms at load buys nothing measurable for these queries **[U]** — I did not compare query speed per
strategy; CENTER is a safe default if load time matters.

### Why the library's convenience paths allocate, and the fix **[V]**

`MeshBVH.shapecast({ intersectsTriangle })` and `raycastFirst` read triangles through `BufferAttribute.getX()`.
In an isolated benchmark that is allocation-free. In a real app the same function sees Float32, Uint16, Uint32,
Int16 and interleaved arrays during loading, the call site goes megamorphic, and each float it returns is boxed:
**~3 KB of garbage per query** on the same scene. Use the `intersectsRange(offset, count)` callback and read the
collider's own `Float32Array`/`Uint32Array` — that stays monomorphic. What remains (~0.26 KB per query) is inside
the library: three typed-array views, one spread object and one closure per `shapecast` call **[S]**; plus
~24 B per `closestPointToSegment`.

```ts
// Requirements: Float32 positions, Uint32 index, BVH built WITHOUT { indirect: true }.
// Full class with the ray query: scratch/research-web/src/lib/bvhQueries.ts
this.capCb = {
  intersectsBounds: (b) => b.intersectsBox(this.box),
  intersectsRange: (offset, count) => {
    const pos = this.pos, idx = this.idx, tri = this.tri, r = this.radius, seg = this.seg, n = this.capPt;
    for (let t = offset, end = offset + count; t < end; t++) {
      const a = idx[t * 3]! * 3, b = idx[t * 3 + 1]! * 3, c = idx[t * 3 + 2]! * 3;
      const ax = pos[a]!, ay = pos[a + 1]!, az = pos[a + 2]!, bx = pos[b]!, by = pos[b + 1]!, bz = pos[b + 2]!, cx = pos[c]!, cy = pos[c + 1]!, cz = pos[c + 2]!;
      const mn = this.box.min, mx = this.box.max;          // cheap reject: triangle AABB vs capsule AABB
      if (Math.min(ax, bx, cx) > mx.x || Math.max(ax, bx, cx) < mn.x || Math.min(ay, by, cy) > mx.y || Math.max(ay, by, cy) < mn.y || Math.min(az, bz, cz) > mx.z || Math.max(az, bz, cz) < mn.z) continue;
      tri.a.set(ax, ay, az); tri.b.set(bx, by, bz); tri.c.set(cx, cy, cz); tri.needsUpdate = true;   // one pooled ExtendedTriangle
      const dist = tri.closestPointToSegment(seg, this.triPt, n);
      if (dist >= r) continue;
      const depth = r - dist;
      n.sub(this.triPt);
      if (dist < 1e-6) tri.getNormal(n); else n.multiplyScalar(1 / dist);
      if (n.y > this.walkableCos) { const up = depth / n.y; seg.start.y += up; seg.end.y += up; this.groundHit = true; }  // walkable: push straight up
      else { seg.start.addScaledVector(n, depth); seg.end.addScaledVector(n, depth); }
    }
    return false;                                           // false = keep traversing: resolve against every touching triangle
  },
};
```

```ts
// Controller step (feet-origin capsule, radius 0.35, height 1.8). scratch/research-web/src/lib/capsule.ts
step(dt: number, wishX: number, wishZ: number, jump: boolean) {
  const sub = dt / this.subSteps, r = this.radius, p = this.position, v = this.velocity, seg = this.world.seg;
  for (let s = 0; s < this.subSteps; s++) {
    if (this.onGround && jump) { v.y = this.jumpSpeed; this.onGround = false; jump = false; }
    v.y += this.gravity * sub;
    v.x = wishX; v.z = wishZ;
    p.addScaledVector(v, sub);
    seg.start.set(p.x, p.y + r, p.z);
    seg.end.set(p.x, p.y + this.height - r, p.z);
    this.start.copy(seg.start);
    this.world.resolveCapsule(r, this.walkableCos);         // sets the query AABB, then bvh.shapecast(capCb)
    this.delta.subVectors(seg.start, this.start);
    p.add(this.delta);
    this.onGround = this.world.groundHit && v.y <= 0;
    if (this.onGround) v.y = 0;
    else if (this.delta.y < -1e-5 && v.y > 0) v.y = 0;      // bumped head
  }
}
```

Behaviour measured on a purpose-built test level **[V]**:

| Test | Result |
|---|---|
| Walk into a wall at 6 m/s | stops at exactly `wall − radius` (19.400 m), stays grounded |
| 30 m/s, 3 sub-steps | stops correctly |
| 30 m/s, **1 sub-step** | **tunnels through a 0.5 m wall** → keep `speed × dt / subSteps < radius` |
| Ramps 30° / 45° | climbs, zero drift when standing still (thanks to the "push straight up" rule) |
| Ramp 60° (limit 50°) | blocked |
| Step 0.2 m | climbs |
| Steps 0.3 m and 0.5 m | **blocked** — a 0.35 m capsule only rolls over ledges up to ~0.2 m |
| Jump (7.5 m/s, g = −24) | apex 1.15 m, 37 air frames, lands grounded |

Level-design consequence: **stairs need ramp collision** (or risers ≤ 0.2 m). Decide this before modelling.

Hitscan against enemies: do not put skinned meshes in a BVH. Test the ray against a few per-enemy capsules/spheres
in code, then against the world ray for occlusion (compare distances).

---

## 5. Draw-call control

**[V]** `exp/drawcalls.ts` — 1 500 props (48 triangles each, 3 materials), camera inside the field looking one way:

| Strategy | Draw calls | Triangles submitted | JS cost of `renderer.render()` |
|---|---|---|---|
| A. one `Mesh` per prop (`matrixAutoUpdate = false`) | 418 | 20 064 | 0.40–0.54 ms |
| B. merged per material | 3 | 72 000 (never culled) | 0.03 ms |
| **C. merged per material per 40 m chunk** | 24 | 34 944 | 0.04 ms |
| D. `InstancedMesh` per material | 3 | 72 000 (culled only as a whole) | 0.03 ms |
| E. `BatchedMesh` per material, per-object culling, `sortObjects = false` | 3 | 20 064 | 0.14 ms |
| F. `BatchedMesh`, `sortObjects = true` (default) | 3 | 20 064 | 0.18 ms |

The JS column is desktop V8; a 2017 laptop CPU is perhaps 2–3× slower **[U]**, and the browser's GPU process adds
its own per-call cost that this cannot see. That hidden cost is why the ≤ 100 budget exists.

- **Static world: merge per (zone chunk × material).** Best done in Blender (join per zone and material before
  export) so lightmap UVs are unwrapped on the merged mesh. Runtime merging of GLB meshes fights quantised and
  interleaved attributes (section 4).
- **`InstancedMesh`** for repeated props that share a mesh and do not need individual lightmaps. The bounding
  sphere covers all instances and is computed lazily once **[S]**: call `computeBoundingSphere()` after changing
  matrices. Per-instance colour via `setColorAt`.
- **`BatchedMesh` in r186** works **[V]**: `new BatchedMesh(maxInstances, maxVerts, maxIndices, material)`,
  `addGeometry(geo) → id`, `addInstance(id)`, `setMatrixAt`, `setVisibleAt`, `setColorAt`. One material, many
  geometries with the same attribute layout, per-object frustum culling on the CPU, drawn with one
  `WEBGL_multi_draw` call (counted as 1 in `renderer.info`); without the extension it loops individual draws **[S]**.
  Set `sortObjects = false` for opaque batches. It reads per-instance matrices from a data texture in the vertex
  shader. For a hand-built single stage, strategy C is simpler and cheaper; keep BatchedMesh in reserve.
- **Zone/portal visibility: toggle `group.visible`.** An invisible object's whole subtree is skipped before any
  culling work **[S]**. **[V]** 3 zones → 1 visible: 418 → 136 calls, JS 0.54 → 0.20 ms. Zones adjacent to the
  player stay visible; a door or trigger flips the rest. (Mind the light-count trap, section 3.)
- **Static transforms:** `matrixAutoUpdate = false` on everything static: `updateMatrixWorld` for 3 000 objects
  0.18 → 0.04 ms **[V]**.

**Frustum-culling pitfalls**

| Case | What happens | Fix |
|---|---|---|
| Geometry displaced in the vertex shader (dust, wind) | culled against undisplaced bounds — **[V]** points moved 50 m in the shader drew 0 calls | `frustumCulled = false` or a manual `boundingSphere` |
| `SkinnedMesh` | bounding sphere computed **once**, from the pose at first cull test **[S]** | enlarge it at spawn (`mesh.boundingSphere = new Sphere(centre, 1.5)`), or `frustumCulled = false` for the handful of enemies |
| One giant merged mesh | never culled, all vertices shaded every frame | chunk by zone |
| First-person weapon near the camera | may clip the near plane | `frustumCulled = false`; render with a tight near plane or a second pass |
| Clip-space geometry (sky triangle) | bounds are meaningless | `frustumCulled = false` |

**Materials and programs**

- Programs are cached by a key built from material type, defines and every parameter. Many material instances with
  the same shape share one program **[V]** (50 materials → 1 program). Different textures or colours do not split programs.
- **`onBeforeCompile` cache-key trap [V].** The default key is `onBeforeCompile.toString()`. Two materials whose
  callbacks have identical source but different captured values **share the first one's program**: the second
  quad rendered red instead of green. Always set `customProgramCacheKey` when the patch varies, and prefer
  uniforms over text edits.
- `onBeforeCompile` (patch a built-in material) keeps lights, fog, skinning, instancing, lightmaps for free — use it
  for world and character materials. A custom `ShaderMaterial` is right for self-contained effects: sky, dust,
  god rays, blob shadows, muzzle flash sprite. Give ShaderMaterials `fog: false` unless they include the fog chunks.
- **Warm-up [V]** (`exp/misc.ts`): cold first frame 160 ms vs 12 ms steady. `await renderer.compileAsync(scene, camera)`
  plus `renderer.initTexture()` cut the first frame to 87 ms — the rest is buffer upload and lazy driver work that only
  a real draw triggers. So also **render one hidden frame with every zone visible** behind the loading screen.

---

## 6. postprocessing 6.39

```ts
import { EffectComposer, RenderPass, EffectPass, BloomEffect, ToneMappingEffect, ToneMappingMode, BlendFunction, type Effect } from 'postprocessing';

export function buildComposer(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, tier: 'low' | 'medium' | 'high') {
  renderer.toneMapping = THREE.NoToneMapping;          // the composer owns tone mapping + output encoding
  const composer = new EffectComposer(renderer, {
    frameBufferType: THREE.HalfFloatType,              // HDR scene buffer; UnsignedByteType clips highlights before bloom/tone map
    multisampling: tier === 'high' ? 4 : 0,
    depthBuffer: true, stencilBuffer: false,
  });
  composer.addPass(new RenderPass(scene, camera));

  const grade = new GradeEffect();                     // custom, below
  const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
  const effects: Effect[] = [];
  let bloom: BloomEffect | null = null;
  if (tier !== 'low') {
    bloom = new BloomEffect({
      blendFunction: BlendFunction.ADD,                // default SCREEN misbehaves on HDR values above 1.0
      mipmapBlur: true, luminanceThreshold: 1.0, luminanceSmoothing: 0.2,
      intensity: 0.6, radius: 0.75, levels: tier === 'high' ? 6 : 5,   // default is 8 levels
    });
    bloom.luminancePass.resolution.scale = 0.5;        // threshold pass at half res; mip chain then starts at quarter res
    effects.push(bloom);
  }
  effects.push(tone, grade);                           // ORDER: bloom (HDR) → tone map → grade/vignette/grain (display-referred)
  composer.addPass(new EffectPass(camera, ...effects)); // last pass renders to screen and applies the sRGB transfer
  return { composer, grade, bloom, tone };
}
// per frame:  composer.render(dt)   — pass dt explicitly; without it the composer uses its own wall-clock Timer
// on resize / pixel-ratio change:  renderer.setPixelRatio(r); composer.setSize(cssW, cssH, false);
```

How it behaves **[S]**:

- All effects given to one `EffectPass` compile into **one** fragment shader and one full-screen draw. Adding a
  non-convolution effect costs ALU only.
- At most one *convolution* effect (SMAA, FXAA, DoF, …) per `EffectPass` — it throws otherwise. Bloom is not a
  convolution effect in this sense (it only samples its own pre-blurred texture), so bloom + tone map + grade merge.
- `EffectComposer` sets `renderer.autoClear = false` and sizes its buffers from the renderer's drawing buffer.
- A depth texture is allocated only if some effect asks for depth. Ours do not.
- `NormalPass`/SSAO re-render the whole scene with an override material: scene draw calls and triangles **double**.

### Cost per chain **[V]** (`exp/post.ts`, 960×540, 18 scene draw calls, SwiftShader *minimum* of 15 frames)

| Chain | ms (software) | Draw calls | Textures |
|---|---|---|---|
| No composer, ACES inline in materials | 8.5 | 18 | 3 |
| Composer + tone map, `UnsignedByte` buffers | 10.1 | 19 | 4 |
| Composer + tone map, `HalfFloat` | 13.1 | 19 | 4 |
| + grade/vignette/grain **merged** (custom effect) | 12.7 | 19 | 4 |
| tone map and grade as **two** passes | 14.4 | 20 | 5 |
| + bloom, library defaults (full-res luminance, 8 levels) | 21.8 | 35 | 20 |
| + bloom, half-res luminance, 5 levels | 21.0 | 29 | 14 |
| … + MSAA ×4 | 53.4 | 29 | 14 |
| … + FXAA pass | 27.7 | 30 | 15 |
| … + SMAA pass | 30.8 | 32 | 21 |
| … + SSAO (half res) + NormalPass | 27.2 | 49 (triangles ×2) | 21 |

Read as ordering, not milliseconds. Conclusions: merging is free and a second pass is not; bloom is the big step
(mostly its many small passes); MSAA's software cost says nothing about GPUs. **Post passes count against the
draw-call budget**: Low +1, Medium +11, High +13.

### Tiers

| Tier | Chain | Extra calls | Extra targets |
|---|---|---|---|
| Low | RenderPass → EffectPass(tone map, grade) | 1 | 2 scene buffers |
| Medium | RenderPass → EffectPass(bloom ½-res ×5, tone map, grade) | 11 | + 10 small |
| High | MSAA ×4 RenderPass → EffectPass(bloom ×6, tone map, grade), sun shadow map; optional SMAA instead of MSAA | 13+ | + 12 small, + shadow map |

SSAO: leave off. Baked AO already exists in vertex colours and lightmaps, and SSAO doubles scene draw calls.

### Cheap custom effect: grade + vignette + grain **[V]** (`lib/gradeEffect.ts`, shots `post_low.png`, `post_medium.png`)

```ts
import { Uniform, Color, Vector3 } from 'three';
import { Effect, BlendFunction } from 'postprocessing';

const fragment = /* glsl */ `
uniform vec3 uTint; uniform vec3 uLift; uniform float uSaturation; uniform float uContrast;
uniform vec3 uVignette;    // x = inner radius, y = outer radius, z = strength
uniform float uGrain; uniform float uSeed;
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSaturation);
  c = (c - 0.5) * uContrast + 0.5;
  c = c * uTint + uLift * (1.0 - c);
  vec2 d = (uv - 0.5) * vec2(aspect, 1.0);                 // 'aspect', 'resolution', 'time' are provided by EffectMaterial
  c *= 1.0 - smoothstep(uVignette.x, uVignette.y, length(d)) * uVignette.z;
  c += (hash12(uv * resolution + uSeed * 61.7) - 0.5) * uGrain * (1.0 - l * 0.6);
  outputColor = vec4(max(c, 0.0), inputColor.a);
}`;

export class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', fragment, {
      blendFunction: BlendFunction.SRC,                    // replace: no blend maths
      uniforms: new Map<string, Uniform>([
        ['uTint', new Uniform(new Color(1.06, 1.0, 0.92))], ['uLift', new Uniform(new Color(0.015, 0.02, 0.035))],
        ['uSaturation', new Uniform(0.92)], ['uContrast', new Uniform(1.06)],
        ['uVignette', new Uniform(new Vector3(0.45, 1.05, 0.55))], ['uGrain', new Uniform(0.035)], ['uSeed', new Uniform(0)],
      ]),
    });
  }
  setSeed(frame: number) { this.uniforms.get('uSeed')!.value = frame % 1024; }   // sim frame, not wall time → deterministic screenshots
}
```

Grain is seeded from the simulation frame, not the pass's `time` uniform, so two runs produce byte-identical screenshots (section 11).

### Escape hatch: no composer at all **[V]** (`exp/inlinegrade.ts`)

For a machine that still misses 60 fps at the minimum pixel ratio: render straight to the canvas with tone map and
grade inlined into every material via `CustomToneMapping`. Zero full-screen passes, zero render-target memory,
context `antialias: true` becomes usable. No grain or bloom; vignette would be one alpha-blended quad.

```ts
THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace(
  'vec3 CustomToneMapping( vec3 color ) { return color; }',
  `vec3 CustomToneMapping( vec3 color ) {
     color = ACESFilmicToneMapping( color );
     float l = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
     color = mix( vec3( l ), color, 0.92 );
     color = ( color - 0.5 ) * 1.06 + 0.5;
     return max( color * vec3( 1.06, 1.0, 0.92 ), 0.0 );
   }`);                                   // before the first render
renderer.toneMapping = THREE.CustomToneMapping;
```

---

## 7. Fog and sky **[V]** (`lib/atmosphere.ts`, `exp/atmos.ts`, shot `atmos_medium.png`)

The whole scene in that screenshot — ground, 14 pillars, 200 instanced rocks, sky, sun, 8 god-ray cards, 600 dust
motes — is **18 draw calls** (+11 for the Medium post chain), 16 k triangles, zero shader errors.

### Height + distance fog by chunk injection

Replace the four fog chunks once at boot. Any built-in material with fog enabled then compiles the new code.
World position is derived from `mvPosition`, so skinning, instancing and batching all work (verified on an `InstancedMesh`).

```ts
export const fogUniforms = {
  uFogDensity: { value: 0.012 },                              // distance term (1/m)
  uFogHeight: { value: new THREE.Vector3(0.0, 0.12, 0.6) },   // x = base height, y = falloff (1/m), z = extra density at base
  uFogSun: { value: new THREE.Vector4(0, 1, 0, 0.5) },        // xyz = direction TO the sun, w = in-scatter strength
  uFogSunColor: { value: new THREE.Color(1.0, 0.72, 0.42) },
};

export function installFogChunks(): void {                    // call BEFORE the first render
  THREE.ShaderChunk.fog_pars_vertex = `
#ifdef USE_FOG
  varying vec3 vFogWorld;
#endif`;
  THREE.ShaderChunk.fog_vertex = `
#ifdef USE_FOG
  vFogWorld = cameraPosition + mvPosition.xyz * mat3( viewMatrix );
#endif`;
  THREE.ShaderChunk.fog_pars_fragment = `
#ifdef USE_FOG
  uniform vec3 fogColor;
  uniform float uFogDensity; uniform vec3 uFogHeight; uniform vec4 uFogSun; uniform vec3 uFogSunColor;
  varying vec3 vFogWorld;
#endif`;
  THREE.ShaderChunk.fog_fragment = `
#ifdef USE_FOG
  vec3 fogRay = vFogWorld - cameraPosition;
  float fogDist = length( fogRay );
  vec3 fogDir = fogRay / max( fogDist, 1e-4 );
  float fogK = uFogHeight.y * fogDir.y;                       // analytic integral of exp(-falloff * (y - base)) along the ray
  float fogH = uFogHeight.z * exp( - uFogHeight.y * ( cameraPosition.y - uFogHeight.x ) );
  float fogHeightInt = fogH * fogDist * ( abs( fogK ) > 1e-4 ? ( 1.0 - exp( - fogK * fogDist ) ) / ( fogK * fogDist ) : 1.0 );
  float fogFactor = 1.0 - exp( - ( uFogDensity * fogDist + uFogDensity * fogHeightInt ) );
  float fogSunAmt = pow( max( dot( fogDir, uFogSun.xyz ), 0.0 ), 8.0 ) * uFogSun.w;
  gl_FragColor.rgb = mix( gl_FragColor.rgb, mix( fogColor, uFogSunColor, fogSunAmt ), clamp( fogFactor, 0.0, 1.0 ) );
#endif`;
}

/** Attach the shared uniforms. Chain-safe: keeps an existing onBeforeCompile and cache key. */
export function withWorldFog<T extends THREE.Material>(material: T): T {
  const prev = material.onBeforeCompile, prevKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => { prev.call(material, shader, renderer); Object.assign(shader.uniforms, fogUniforms); };
  material.customProgramCacheKey = () => prevKey.call(material) + '|worldfog';
  return material;
}
// scene.fog = new THREE.FogExp2(fogColor, 0.01);   // still required: it is the USE_FOG switch and carries fogColor
```

Custom uniforms declared in a chunk are **not** populated unless the material owns them, hence `withWorldFog`.
A material that skips it gets zeros and no fog. Route every world material through one factory.
Per-zone fog = lerp the shared uniform values when the player changes zone; no recompiles.

### Sky: one triangle, drawn last

```ts
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
const material = new THREE.ShaderMaterial({
  uniforms, depthWrite: false, depthTest: true, depthFunc: THREE.LessEqualDepth, fog: false, toneMapped: false,
  vertexShader: `
    varying vec3 vDir;
    void main() {
      vec4 view = inverse( projectionMatrix ) * vec4( position.xy, 1.0, 1.0 );   // 3 vertices: inverse() is free
      vDir = ( view.xyz / view.w ) * mat3( viewMatrix );
      gl_Position = vec4( position.xy, 1.0, 1.0 );                               // z = w → far plane
    }`,
  fragmentShader: `
    uniform vec3 uZenith, uHorizon, uGround, uSunDir, uSunColor; uniform float uSunSize;
    varying vec3 vDir;
    void main() {
      vec3 d = normalize( vDir ); float up = max( d.y, 0.0 );
      vec3 col = mix( uHorizon, uZenith, pow( up, 0.45 ) );
      col = mix( col, uGround, smoothstep( 0.0, -0.25, d.y ) );
      float s = dot( d, uSunDir );
      col += uSunColor * smoothstep( uSunSize, uSunSize + 0.0003, s );           // disc (HDR → bloom picks it up)
      col += uSunColor * 0.02 * pow( max( s, 0.0 ), 64.0 );                      // glow
      col += uHorizon * 0.35 * pow( max( s, 0.0 ), 6.0 ) * ( 1.0 - up );         // haze toward the sun
      gl_FragColor = vec4( col, 1.0 );
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});
const sky = new THREE.Mesh(geometry, material);
sky.frustumCulled = false; sky.renderOrder = 1000; sky.matrixAutoUpdate = false;  // after opaques: early-z rejects covered pixels
```

Keep `uHorizon` equal to the fog colour so distant geometry dissolves into the sky. `scene.background` stays unset.

### God-ray cards and dust

- **God rays**: all cards merged into **one** indexed geometry and one additive `ShaderMaterial`
  (`transparent, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, fog: false`). The fragment
  shader fades across the width, along the length, and with `smoothstep(0.3, 2.5, viewZ)` so walking through a
  card does not pop. A per-vertex `aIntensity` attribute carries per-card strength. Place cards by hand at
  windows/gaps, aligned with the sun.
- **Dust**: one `THREE.Points`, 300–600 points, animated entirely in the vertex shader and wrapped into a box
  around the camera, so density is constant and the CPU does nothing:

  ```glsl
  vec3 drift = vec3( 0.12, -0.03, 0.07 ) * uTime + 0.25 * sin( position.yzx * 6.2831 + uTime * 0.3 );
  vec3 p = mod( position * uBox + drift - cameraPosition + uBox * 0.5, uBox ) - uBox * 0.5 + cameraPosition;   // 'position' is a 0..1 seed
  vec4 mv = viewMatrix * vec4( p, 1.0 );
  float dist = - mv.z;
  vFade = smoothstep( 0.4, 1.5, dist ) * ( 1.0 - smoothstep( uBox.x * 0.35, uBox.x * 0.5, dist ) );
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp( uSize * uPixelRatio / max( dist, 0.1 ), 1.0, 24.0 );
  ```

  `frustumCulled = false` is mandatory (section 5). Feed `uTime` from sim time and scale `uPixelRatio` with the
  adaptive ratio. Points are clipped when their centre leaves the view; fine for motes ≤ 24 px. For large soft
  sprites (smoke) use instanced quads instead **[U]**.

---

## 8. Adaptive resolution, tier detection, measuring

### Tier detection

1. **Renderer string, instant** (`getGpuInfo`, `classifyRendererString` in `lib/quality.ts`): **[V]** this
   environment reports `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) …), SwiftShader driver)` → *software → Low*.
   The classifier was exercised on twelve representative strings (HD/UHD 620 → Low, Iris Xe / Radeon Graphics →
   Medium, RTX / Apple M → High, llvmpipe → Low, empty → Medium); the strings are examples I wrote, **not captured
   from real machines** **[U]**. Firefox deprecates `WEBGL_debug_renderer_info` and exposes a bucketed string via
   `gl.RENDERER`; privacy settings can hide both **[W]** ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/WEBGL_debug_renderer_info)).
   Always have a fallback.
2. **Fill-rate micro-benchmark behind the loading screen** (`fillRateBenchmark`): 8 additive full-screen passes into a
   1280×720 target, synced with a 1-pixel `readRenderTargetPixels`, median of 5 rounds. **[V]** SwiftShader:
   5.7–13 ms per pass depending on machine load → Low. Thresholds for real GPUs (< 0.6 ms High, < 2 ms Medium) are
   **guesses [U]** — tune on first real hardware.
3. Combine: software → Low; otherwise the benchmark may promote the string guess by at most one step.
4. **User override** in the options menu, persisted in `localStorage`, always wins.
5. **Runtime demotion**: if adaptive resolution sits at its minimum and is still over budget for ~5 s
   (`starvedSeconds`), drop one tier.

### Adaptive resolution

Frame time from `requestAnimationFrame` deltas is the only signal available everywhere. Under v-sync it is quantised
(16.7, 33.3 …), so "on budget" says nothing about headroom. The controller therefore drops fast and proportionally,
creeps up slowly, and remembers what failed. Full class: `lib/quality.ts` (`AdaptiveResolution`).

```ts
update(frameMs: number): boolean {                     // real rAF delta only — never simulated time
  if (frameMs > 250) return false;                     // tab switch / hitch
  this.ema = this.ema === 0 ? frameMs : this.ema + (frameMs - this.ema) * 0.1;
  if (this.ceilingFrames > 0 && --this.ceilingFrames === 0) this.ceiling = this.max;
  if (this.cooldown > 0) { this.cooldown--; return false; }        // starts at 60: ignore shader-compile frames
  const over = this.ema > this.targetMs * 1.15, under = this.ema < this.targetMs * 1.04;
  if (over) {
    this.goodStreak = 0;
    if (this.ratio > this.min + 1e-3) {
      this.ceiling = Math.max(this.min, this.ratio - this.step); this.ceilingFrames = this.backoff; this.backoff = Math.min(this.backoff * 2, 18000);
      if (this.probing) this.ratio = this.prevRatio;               // a probe upward failed: return to the last ratio that held
      else { const want = Math.floor((this.ratio * Math.sqrt(this.targetMs / this.ema)) / this.step + 1e-6) * this.step; this.ratio = Math.max(this.min, Math.min(this.ceiling, want)); }
      this.probing = false; this.cooldown = 30; this.ema = this.targetMs;
      return true;
    }
    this.starvedSeconds += frameMs / 1000;
  } else if (under) {
    this.starvedSeconds = 0;
    if (this.goodStreak === 120) this.probing = false;
    if (++this.goodStreak >= 180 && this.ratio < Math.min(this.max, this.ceiling) - 1e-3) {
      this.prevRatio = this.ratio; this.probing = true;
      this.ratio = Math.min(this.max, this.ceiling, this.ratio + this.step);
      this.cooldown = 30; this.goodStreak = 0;
      return true;
    }
  } else this.goodStreak = 0;
  return false;
}
// if (adaptive.update(rafDeltaMs)) { renderer.setPixelRatio(adaptive.ratio); composer.setSize(cssW, cssH, false); }
```

**[V]** simulated against a cost model `ms = base + k·ratio²` with v-sync quantisation, 3 600 frames (`exp/quality.ts`):

| Scenario | Ratio trace | Changes |
|---|---|---|
| Fast GPU (2 + 3r²) | stays 1.5 | 0 |
| Mid GPU (4 + 10r²) | 1.5 → 1.0 → 1.1 → 1.2 (fails) → **1.1**, holds 16.1 ms | 4 |
| Slow GPU (6 + 30r²) | 1.5 → 0.6 → **0.5**, 13.5 ms | 2 |
| Hopeless (20 + 30r²) | pinned at 0.5, `starvedSeconds` climbs → demote tier | 2 |
| Scene doubles in cost at frame 1000 | 1.5 → 1.3 → 0.9 → … → 1.2 (fails) → **1.1** | 6 |

A ratio change reallocates every render target (SwiftShader 96–150 ms **[V]**; a few ms on a GPU **[U]**). Hence 0.1
steps, 30-frame cooldowns, and a doubling back-off. Cap `max` at `min(devicePixelRatio, 1.5)` on High and 1.0 on Low.
The real controller has only been run against this model, not real frame times.

### Measuring with `renderer.info`

```ts
renderer.info.autoReset = false;          // otherwise each internal renderer.render() of the composer wipes the counters
renderer.info.reset(); const t0 = performance.now();
composer.render(dt);
const { calls, triangles, points } = renderer.info.render;   // whole frame, post passes included
const cpuMs = performance.now() - t0;                        // JS + command submission, not GPU time
const { textures, geometries } = renderer.info.memory;       // COUNTS, not bytes
const programs = renderer.info.programs!.length;
```

- `info.memory.textures` includes render targets and bone textures. There is **no byte figure**; estimate it by
  walking materials (`estimateTextureBytes` in `lib/quality.ts`: width × height × channels × bytes × 4/3 with mips,
  plus the composer targets). **[V]** sample scene: 19.4 MB.
- A `BatchedMesh` multi-draw counts as one call **[S]**. Instanced draws count as one call and
  `instances × triangles`.
- GPU timer queries (`EXT_disjoint_timer_query_webgl2`) exist under SwiftShader but are not universal; do not depend on them.

---

## 9. Loop, allocations, input, audio

### Fixed timestep with interpolation (`lib/loop.ts`)

```ts
export const FIXED_DT = 1 / 60;
const MAX_STEPS_PER_FRAME = 5;                 // spiral-of-death guard

private onFrame(now: number) {
  if (!this.running) return;
  this.raf = requestAnimationFrame(this.tick);                 // 'tick' is bound once in the constructor: no per-frame closure
  let frameDt = (now - this.last) / 1000; this.last = now;
  if (frameDt > 0.25) frameDt = 0.25;                          // hidden tab / debugger
  this.acc += frameDt;
  let steps = 0;
  while (this.acc >= FIXED_DT) { if (steps++ < MAX_STEPS_PER_FRAME) this.stepOnce(); this.acc -= FIXED_DT; }
  this.hooks.render(this.acc / FIXED_DT, frameDt);             // alpha: blend previous → current sim state
}
stepManual(n: number, render = true) { for (let i = 0; i < n; i++) this.stepOnce(); if (render) this.hooks.render(0, FIXED_DT); }
```

- Keep previous and current position for anything the camera can see moving (`Interp3`: `set()` shifts current to
  previous, `snap()` for teleports/spawns, `lerpX(alpha)` at render time).
- **Mouse look is applied per rendered frame, not per sim step** — otherwise 144 Hz displays feel like 60.
- Everything time-based in the sim uses `dt`/`simTime`: mixers, timers, shader `uTime`, grain seed. No
  `performance.now()`, `Date.now()` or `Math.random()` in gameplay — use a seeded PRNG (`Rng`, mulberry32).

### Zero-allocation patterns

Measured heap cost of common constructs **[V]** (`exp/alloctest.ts`): escaping `new Vector3` 72 B, closure 60 B,
object spread 80 B, `[]` + push 104 B, typed-array view 72 B. Even "reuse a scratch vector and add its `x` to a
closure-captured `let`" measured 12 B per iteration — a boxed double for the captured variable **[U]** (my reading of
the number). Keep hot numeric state in object fields or typed arrays, not in captured `let`s.

- Module-level scratch objects (`const _v = new THREE.Vector3()`), never `new` inside `update`/`render`.
- Callbacks created once and stored (see `capCb` above); no arrow functions or `.bind` per frame.
- No `array.map/filter/forEach` or spread in per-frame code; indexed `for` loops over preallocated arrays.
- Out-parameters instead of returned objects (`consumeLook(out)`), `toArray(target, offset)`, `getWorldPosition(target)`.
- Pools with swap-remove for bullets, decals, particles, sounds (`lib/pool.ts`, 11 lines).
- No string building per frame (HUD: write only when the value changed).
- Hidden-class stability: initialise every field in the constructor, never add properties later.

**How to measure it [V]** (`lib/alloc.ts`). Launch with `--enable-precise-memory-info --js-flags=--expose-gc`, then
`gc(); h0 = performance.memory.usedJSHeapSize; run N iterations; delta / N`, median of several repetitions, N small
enough that no scavenge happens. **`performance.memory` returns a snapshot object** — re-read the property each
time; holding a reference to the object gave me a constant and a false "0 bytes".

**Honest baseline.** Our own code can be allocation-free; the libraries are not. In the mini game (capsule
player, 4 skinned enemies, composer) I measured **~2.4 KB per sim step and 1.7–3.8 KB per rendered frame** **[V]**
(`alloc-game.mjs`) — roughly 0.25–0.4 MB/s at 60 Hz, a sub-millisecond scavenge every several seconds **[U]**.
That is the floor to regress against, not zero.

### Pointer lock and input (`lib/input.ts`)

Verified with CDP-synthesised gestures **[V]** (`unlock-test.mjs`):

- `requestPointerLock({ unadjustedMovement: true })` is rejected on this platform, fires a `pointerlockerror`
  event, and the fallback plain request then succeeds (events: error → locked). **Do not treat a single
  `pointerlockerror` as fatal**; try the fallback first. Raw input is Chromium-only anyway **[W]**
  ([web.dev](https://web.dev/articles/disable-mouse-acceleration), [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_Lock_API)).
- The request must come from a user gesture (the same click that unlocks audio).
- Keys held when the window loses focus never get a `keyup`: releasing all keys on `blur` /
  `visibilitychange` / lock loss worked.
- **In headless Chromium, mouse moves produce `movementX === 0` under pointer lock and `Escape` does not release
  the lock.** Automated tests cannot drive look or pause through `page.mouse`/`page.keyboard`; use the debug hook.

Not reproducible here, from sources **[W]**: after the user presses Esc, Chrome refuses a new lock for about
1.25 s ("The user has exited the lock before this request was completed") — show a "click to resume" overlay
instead of auto-relocking ([three.js forum](https://discourse.threejs.org/t/how-to-avoid-pointerlockcontrols-error/33017)).

Other rules baked into the prototype: track keys by `KeyboardEvent.code` (layout independent); ignore `e.repeat`;
`preventDefault` on Space/Tab/arrows only while locked; drop mouse events with |delta| > 400 px (the known Chromium
pointer-lock spike **[U]**); accumulate deltas in the handler and consume once per rendered frame; `contextmenu`
prevented on the canvas; do not bind Ctrl (Ctrl+W closes the tab and cannot be prevented).

### WebAudio procedural SFX (`lib/audio.ts`)

```ts
// voices → bus → DynamicsCompressor (limiter) → master → destination;  bus → reverb send → Convolver (generated impulse) → limiter
noiseBurst(t: number, dur: number, type: BiquadFilterType, f0: number, f1: number, q: number, gain: number, offset = 0) {
  const ctx = this.ctx, src = ctx.createBufferSource(); src.buffer = this.noise;          // ONE shared 1 s white-noise buffer
  const filt = ctx.createBiquadFilter(); filt.type = type; filt.Q.value = q;
  filt.frequency.setValueAtTime(f0, t); filt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.002); // 2 ms attack: no click
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);                                   // exponential ramps cannot target 0
  src.connect(filt); filt.connect(g); g.connect(this.bus);
  src.start(t, offset % 0.9, dur + 0.02);                                                 // one-shot node, GC'd after it ends
}
gunshot(when = this.ctx.currentTime, variation = 0) {            // crack + body + tail + thump + click
  const t = when + 0.001, v = 1 + variation * 0.06;
  this.noiseBurst(t, 0.06, 'highpass', 2500 * v, 900, 0.7, 0.9, variation * 0.13);
  this.noiseBurst(t, 0.28, 'bandpass', 900 * v, 180, 0.8, 1.0, 0.2 + variation * 0.07);
  this.noiseBurst(t + 0.01, 0.6, 'lowpass', 600, 80, 0.5, 0.5, 0.5);
  this.tone(t, 0.18, 'sine', 150 * v, 42, 1.0);                  // oscillator with exponential pitch drop
  this.tone(t, 0.03, 'square', 1800, 600, 0.12);
}
```

**[V]** rendered through `OfflineAudioContext` (`exp/audio.ts`): one shot peaks at 0.74, audible for 0.70 s, no
NaN, no clipping; six shots 50 ms apart peak at 0.80 thanks to the limiter; two renders differ by 6e-8 (noise
comes from a seeded LCG, so sounds are reproducible and assertable in tests). Scheduling a shot (16 nodes) costs
0.19 ms and ~750 B of JS heap.

**Autoplay unlock [V]** (real policy forced with `--autoplay-policy=document-user-activation-required`): a
context created before a gesture is `suspended`; `ctx.resume()` without a gesture **never resolves** — do not
`await` it during boot. After a click it becomes `running`. Create the context at boot, call `resume()`
(un-awaited or inside the handler) in the same click that requests pointer lock. The shared launcher passes
`--autoplay-policy=no-user-gesture-required`, so tests see `running` immediately and will not catch a missing unlock.

Keep filter frequencies below `sampleRate / 2` (Chrome warns and clamps). Suspend the context on
`visibilitychange` hidden. Use `OfflineAudioContext` for unit tests of every sound.

---

## 10. Vite 8 + TypeScript 7 setup **[V]**

`tsconfig.json` (type-check only; Vite transpiles with oxc **[S]**):

```json
{
  "compilerOptions": {
    "target": "es2022",
    "module": "esnext",
    "moduleResolution": "bundler",
    "lib": ["es2023", "dom", "dom.iterable"],
    "types": ["vite/client"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "resolveJsonModule": true,
    "allowImportingTsExtensions": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "test"]
}
```

`vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  root: import.meta.dirname,
  base: './',                                   // relative URLs: the build runs from any sub-path or file server
  publicDir: 'public',
  server: { host: '127.0.0.1', port: 0, strictPort: true },
  // three, three-mesh-bvh and postprocessing are plain ESM: skip dependency pre-bundling entirely.
  optimizeDeps: { noDiscovery: true, include: [] },
  build: { target: 'es2022', outDir: 'dist', assetsInlineLimit: 0, chunkSizeWarningLimit: 1500 },
});
```

Findings:

- **TypeScript 7 is the native compiler.** `tsc --noEmit` on the scratch project (30 files + three's types):
  **0.09–0.13 s**. Run it constantly.
- TS 7 does **not** auto-include `@types/*`: without `"types": ["node"]` a Node script fails with TS2591. List
  `vite/client` for app code, `node` for tool scripts (separate tsconfig).
- The `typescript` package exports only a version stub — **no JS compiler API** **[S]**. Anything that imports the
  TypeScript API (ts-node, typescript-eslint, dts/checker plugins) will not work. Not needed: Vite, Vitest and
  Playwright do their own transpiling.
- `.ts` extensions in imports work in tsc, Vite and Vitest with `allowImportingTsExtensions`. three addon imports
  need the `.js` extension (`three/examples/jsm/loaders/GLTFLoader.js`).
- **JSON**: `import layout from '../design/layout.json'` is typed (literal shapes) and bundled; named imports of
  top-level keys work. Files outside the Vite root resolve fine. With `noUncheckedIndexedAccess`, array members are
  `T | undefined`.
- **Static assets**: files in `public/` are served at `./<path>` in dev and copied verbatim on build
  (`public/assets/x.glb` → `dist/assets/x.glb`); fetch them by URL (`'./assets/env/level.glb'`), do not import them.
  Vite's hashed output also goes to `dist/assets/` by default — works, but consider `build.assetsDir: 'js'` to keep them apart.
- **Production build**: 0.17–0.19 s. JS: three 608 KB (152 KB gzip), postprocessing 190 KB (80), meshopt decoder
  71 KB (21), three-mesh-bvh 51 KB (17) — **about 0.27 MB gzipped** before game code. Verified served by
  `vite preview` and playable through the debug hook (`prod-test.mjs`).
- **`package.json` has `"type": "commonjs"`.** `vite.config.ts` still loads but warns that this stops working in a
  future major; `vite.config.mts` is silent. Node 24 also refuses to run a `.ts` file containing `import` under a
  commonjs package. Recommend `"type": "module"` (owner of `package.json` decides), or `.mts`/`.mjs` for configs and tools.
- **Dependency pre-bundling is a hazard here.** With the optimiser on, an addon discovered after the cache was built
  got served raw next to a pre-bundled `three`: console warned *"Multiple instances of Three.js being imported"*
  **[V]**. Two copies break `instanceof` checks and our `ShaderChunk` patches (only one copy is patched). Parallel
  agents also share one cache directory. `noDiscovery: true, include: []` removes the optimiser: 82 requests instead
  of 26, page load 0.6 s instead of 0.4 s, no cache, no mid-test reloads **[V]**.

### Dev/preview server on an OS-assigned port (for tests)

```js
import { createServer, preview, build } from 'vite';
import { launchBrowser } from '../tools/browser.mjs';

// dev server
const server = await createServer({ configFile, logLevel: 'warn', server: { port: 0, strictPort: true, host: '127.0.0.1', hmr: false, watch: null } });
await server.listen();
const url = `http://127.0.0.1:${server.httpServer.address().port}/`;
// ... tests ...
await server.close();

// production build
await build({ configFile, logLevel: 'error' });
const prod = await preview({ configFile, logLevel: 'error', preview: { host: '127.0.0.1', port: 0, strictPort: true } });
const prodUrl = `http://127.0.0.1:${prod.httpServer.address().port}/`;
await new Promise((r) => prod.httpServer.close(r));
```

Vite 8.3 handles `port: 0` explicitly (asks the OS for an ephemeral port) **[S][V]**; server start takes 35–55 ms.
`hmr: false, watch: null` avoids file watchers and surprise reloads during tests.

Vitest 5 runs pure-logic tests in the `node` environment in 0.14 s (`test/logic.test.ts`: PRNG, pool, interpolation,
classifier, JSON import). Modules that touch `window`/WebGL at import time cannot be unit-tested that way — keep
logic modules free of top-level DOM access.

---

## 11. Deterministic automated testing

### The hook (`exp/game.ts`, driven by `game-test.mjs`)

```ts
export interface DebugHook {
  ready: boolean;                                              // set last, after assets + first frame
  step(n?: number, render?: boolean): { frame: number; time: number };   // n fixed steps of 1/60 s; renders the final state unless false
  setKeys(codes: string[]): void;                              // replaces the held-key set ('KeyW', 'Space', 'Mouse0', …)
  look(dx: number, dy: number): void;                          // mouse delta in pixels, applied on the next step
  teleport(x: number, y: number, z: number, yawDeg?: number, pitchDeg?: number): void;
  state(): Record<string, unknown>;                            // rounded, JSON-safe: player, enemies, RNG state, flags
  stats(): Record<string, number>;                             // calls, triangles, cpuMs, textures, programs, textureBytes
  capture(): string;                                           // render now, return canvas.toDataURL('image/png')
  setRunning(realtime: boolean): void;                         // start/stop the rAF loop
  seed(n: number): void;                                       // reset RNG + world to a known state
}
declare global { interface Window { __dbg?: DebugHook } }
```

Design rules that made it deterministic:

- `?test=1` boots **without starting the rAF loop**; only `step()` advances time. Nothing reads a wall clock.
- Input goes through the same `Input` object the real handlers feed (`injectKey`, `injectLook`), so gameplay code has one path.
- `step(n, true)` snaps interpolation state before drawing so the image shows the *current* sim state.
- `composer.render(FIXED_DT)` with explicit dt; grain seeded from the sim frame; shader time from sim time.
- `state()` rounds to 1e-5 and includes the PRNG state — hash it to compare runs.
- `capture()` renders and reads the canvas in the same task, so `preserveDrawingBuffer` stays `false`.

**[V]** two independent page loads replaying the same 480-step script: `state()` JSON identical, screenshots
**byte-identical** (0 differing pixels), on Low and on Medium; the state hash is the same across tiers (render tier
does not leak into simulation — assert this). `capture()` and `page.screenshot()` agree pixel-for-pixel.

### Timings at 960×540 under SwiftShader **[V]** (median)

| Operation | Time |
|---|---|
| `page.evaluate` round trip | 0.6 ms |
| `step(1)` without render | 0.6 ms (round trip dominates) |
| `step(60)` without render | 1.2 ms |
| `step(600)` without render (10 s of game) | 5.8 ms → **8.5 µs per sim step** |
| `step(1)` with render, Low / Medium | 1.2 / 1.5 ms (JS side; rasterisation is asynchronous) |
| `page.screenshot()` PNG | 67 ms |
| `page.screenshot({ type: 'jpeg', quality: 80 })` | 34 ms |
| `capture()` via `canvas.toDataURL` Low / Medium | 39 / 50 ms |
| Page load to `__dbg.ready` (dev server, sample level) | 230–340 ms |

A full playthrough is cheap: simulate minutes in milliseconds, spend the budget on screenshots (~15 per second).
Batch steps inside one `evaluate`; do not loop `step(1)` from Node.

```js
const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
await page.goto(url + '?test=1&tier=low');
await page.waitForFunction(() => window.__dbg?.ready === true);
await page.evaluate(() => { window.__dbg.setKeys(['KeyW']); window.__dbg.look(400, 0); window.__dbg.step(90, false); });
const state = await page.evaluate(() => window.__dbg.state());
await page.evaluate(() => window.__dbg.step(0, true));
await page.screenshot({ path: 'shots/piece/after_walk.png' });
const stats = await page.evaluate(() => window.__dbg.stats());   // assert calls ≤ 100, triangles ≤ 120 000
```

Limits: byte-identical screenshots hold for this Chromium build on this machine; across machines or browser
versions compare with a tolerance (`pixelmatch`, threshold ~0.05) **[U]**. Pointer lock and Esc cannot be exercised
headless (section 9). Wall-clock FPS means nothing here.

---

## 12. Build-time asset optimisation **[V]** (`optimize-glb.mjs`)

Trimmed from the script that produced the numbers below (the original also has a CLI and a `--positions quant` switch).

```js
import { NodeIO, PropertyType } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, weld, resample, textureCompress, reorder, quantize, inspect } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

export async function optimizeGlb(input, output, { maxTex = 1024, quality = 82, lightmapPattern = /^lm_/ } = {}) {
  await MeshoptEncoder.ready; await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.read(input);

  await doc.transform(
    dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.MESH, PropertyType.TEXTURE, PropertyType.MATERIAL] }),
    weld(),
    resample(),                                                   // drops redundant keyframes
    // keep empties (markers), extras, and vertex attributes the runtime uses without a glTF material slot (uv1, colour)
    prune({ keepLeaves: true, keepAttributes: true, keepExtras: true, keepSolidTextures: true }),
    // colour textures: lossy WebP, capped
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [maxTex, maxTex], quality, effort: 80,
      pattern: new RegExp(`^(?!${lightmapPattern.source.replace(/^\^/, '')})`), slots: /^(?!normalTexture).*$/ }),
    // lightmaps: near-lossless, never resized
    textureCompress({ encoder: sharp, targetFormat: 'webp', nearLossless: true, quality: 90, effort: 80, pattern: lightmapPattern }),
    // normal maps: lossless
    textureCompress({ encoder: sharp, targetFormat: 'webp', lossless: true, resize: [maxTex, maxTex], slots: /^normalTexture$/ }),
  );

  // meshopt() = reorder + quantize + EXT_meshopt_compression. Done by hand so POSITION stays float32.
  await doc.transform(
    reorder({ encoder: MeshoptEncoder, target: 'size' }),
    quantize({ pattern: /^(NORMAL|TANGENT|TEXCOORD|COLOR|JOINTS|WEIGHTS)(_\d+)?$/, quantizeNormal: 10, quantizeTexcoord: 14, quantizeColor: 8 }),
  );
  doc.createExtension(EXTMeshoptCompression).setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });

  await io.write(output, doc);
  return inspect(doc);
}
```

Results on `sample_raw.glb` (Blender export: 3 416-triangle level with 2 UV sets + vertex colours, 1024² albedo PNG,
512² lightmap PNG, 12 instanced crates, 2 empties with extras, 1 skinned mesh with 2 clips):

| Variant | Size | Notes |
|---|---|---|
| Raw Blender export | 2 470 880 B | PNG textures, float attributes |
| dedup + weld + prune + WebP | 779 052 B | |
| **+ meshopt, positions float32** | **450 424 B (18 %)** | node transforms untouched |
| + meshopt, positions quantised (`meshopt()` helper) | 427 584 B (17 %) | 5 % smaller, see trap below |

Pipeline time ≈ 1.1 s per file. Rendered output vs raw: 23 of 518 400 pixels over threshold, mean channel delta 0.58
**[V]** — visually lossless. Names, extras, both UV sets, vertex colours, skin and both clips survive (checked in the browser).

What I learned the hard way **[V]**:

- **`meshopt()` / `quantize()` with POSITION rewrites node transforms.** The de-quantisation scale and offset are
  baked into each mesh node: `Level` came back with `position (0, 1.926, 0)`, `scale 10.25`; crates with `scale 0.4`.
  Any code reading `node.position`/`scale` of a mesh node, or parenting things to it, breaks. Keeping POSITION float
  costs 5 % in size. If you ever enable it, only trust `matrixWorld` and put gameplay anchors on empties.
- **Tiling UVs are not quantised** (`quantize: Skipping TEXCOORD_0; out of [0,1] range` — a warning, harmless). UV1
  in [0,1] becomes normalised `Uint16`; I raised `quantizeTexcoord` to 14 bits for lightmap precision.
- **`prune()` defaults delete what we need**: empties (`keepLeaves`), unused attributes such as a `uv1`/`COLOR_0`
  not referenced by a material slot (`keepAttributes`), nodes whose only content is extras (`keepExtras`).
- **`join()` (even after my careful prune) runs its own cleanup and removed both marker empties**, and merging the
  12 crates collapsed their per-node extras into one. Use `join({ cleanup: false })` or — better — merge in Blender.
- **`instance()` refuses documents that contain animation** ("Instancing is not currently supported for animated
  models") and silently does nothing. Instancing must be done at runtime, or on static-only GLBs.
- After meshopt, three delivers normals as **interleaved, normalised Int16** attributes — fine for rendering, hostile
  to `mergeGeometries`/`applyMatrix4` (section 4).
- KTX2 is out (section 2). `textureCompress` with `sharp` handles resize + WebP in one step; lossy WebP on lightmaps
  bands, hence the separate near-lossless rule keyed on a name prefix (`lm_`).

Suggested shape: `tools/optimize-assets.mjs` walks `blender/export/**/*.glb` → `public/assets/**`, skips files whose
output is newer, prints a size/triangle/texture table from `inspect()`, and **fails** when an asset exceeds its
budget in `design/assets.json`. Separate lightmap files (option B, section 2) go through `sharp` directly.

---

## Decisions I recommend

1. **One material factory** owns every runtime material. Loader-made `MeshStandardMaterial`s are always replaced.
   World: `map × lightMap(uv1) × vertex-colour AO`, `FrontSide`, `lightMapIntensity = π × lightmapScale`, wrapped by `withWorldFog`.
2. **World material = `MeshBasicMaterial + lightMap` (unlit) on every tier**, with the injected flash term for muzzle
   flash. Real lights (hemisphere, sun, one pooled always-present flash `PointLight`) exist only for dynamic objects.
   A lit world material would be double-lit by them.
3. **Dynamic objects**: shared-program Lambert with a per-object ambient uniform fed from baked zone/probe colours, plus
   one unshadowed sun. Blob shadows on Low/Medium; `ShadowMaterial` overlay + one tight sun shadow map on High.
4. **Lightmaps as separate WebP files** (near-lossless, sRGB, `flipY=false`, `channel=1`), size per tier; the scale
   factor lives in `design/assets.json`.
5. **Static geometry merged in Blender per zone × material**; zones toggled with `group.visible`; `matrixAutoUpdate=false`
   on everything static. `InstancedMesh` for repeated decoration. No `BatchedMesh` unless draw calls prove a problem.
6. **Collision**: authored low-poly collider meshes → one Float32/Uint32 geometry → one `MeshBVH`; queries through the
   direct-array `intersectsRange` path; capsule with 3 sub-steps; **stairs get ramp colliders**.
7. **Post chain**: composer on all tiers with HalfFloat buffers; Low = one merged pass (tone map + grade), Medium adds
   half-res 5-level additive bloom, High adds MSAA ×4 and the shadow map. No SSAO. Keep the no-composer
   `CustomToneMapping` path as an emergency "Minimum" setting.
8. **Fog/sky/atmosphere** as in section 7: chunk-injected height fog with shared uniforms, one-triangle sky drawn last,
   merged god-ray cards, shader-animated dust.
9. **Tiering**: renderer-string guess → fill-rate benchmark behind the loading screen → adaptive pixel ratio at runtime
   (max 1.5 High / 1.0 Low, min 0.5) → demote tier when starved → user override persisted.
10. **Warm-up** behind the loading screen: `compileAsync`, `initTexture`, then one hidden frame with all zones visible
    and every light/flash configuration exercised.
11. **Loop**: fixed 60 Hz sim with interpolation, look applied per render frame, seeded PRNG, no wall clock in gameplay.
12. **Tests** drive `window.__dbg` only; assert state hashes and budgets (`calls`, `triangles`, texture bytes) per zone;
    screenshots at 960×540 into `shots/<piece>/`.
13. **Vite**: `optimizeDeps: { noDiscovery: true, include: [] }`, `base: './'`, servers on `port: 0`; ask the
    `package.json` owner for `"type": "module"` (or use `.mts` configs).
14. **Asset pipeline**: the section 12 script with POSITION left float; no `join()`/`instance()`; budgets enforced at build time.
15. **Audio**: one `Sfx` graph with limiter and generated reverb; context created at boot, resumed in the first click
    together with pointer lock; every sound unit-tested through `OfflineAudioContext`.

## Traps

1. `lightMapIntensity = 1` renders π× too dark; every light is ÷π in r186.
2. Tone mapping and sRGB encoding are skipped whenever a render target is bound — with a composer, `renderer.toneMapping` does nothing.
3. `onBeforeCompile` closures with identical source share one program regardless of captured values → set `customProgramCacheKey`.
4. Custom uniforms declared in a patched `ShaderChunk` are zero on any material that did not register them.
5. First use of a new light count compiles new programs (51 ms hitch here); lights under an invisible group do not count.
6. Blender materials export `doubleSided: true` unless Backface Culling is ticked → `DoubleSide` everywhere.
7. GLTFLoader renames nodes (`Crate.000` → `Crate000`, spaces → `_`); look up by `userData.name` or author names without dots/spaces.
8. `Object3D.clone()` on a skinned hierarchy shares the skeleton; use `SkeletonUtils.clone`.
9. `SkinnedMesh` bounding sphere is computed once from the first pose; shader-displaced geometry is culled against undisplaced bounds.
10. Meshopt/quantised GLBs yield normalised-int and interleaved attributes: `mergeGeometries` and `applyMatrix4` on them fail or corrupt.
11. `meshopt()`/`quantize()` on POSITION changes mesh-node position and scale.
12. `prune()` defaults remove empties, unused UV/colour attributes and extras-only nodes; `join()` cleans up behind your back; `instance()` no-ops on animated files.
13. No KTX2: all textures are RGBA8 in GPU memory (1024² = 5.6 MB with mips); the composer's two HalfFloat buffers at 720p cost ~15 MB plus depth.
14. Library BVH helpers (`raycastFirst`, `intersectsTriangle`) allocate ~3 KB per query in a real app; a 1-sub-step capsule tunnels at high speed; a 0.35 m capsule cannot climb a 0.3 m step.
15. `MeshBVH` reorders the index buffer of the geometry you give it.
16. `MeshBasicMaterial` receives neither dynamic lights nor shadows — and a Lambert world receives *every* scene light, including the ones meant for characters (double lighting). There is no per-object light mask.
17. `BloomEffect` defaults: `SCREEN` blend (wrong for HDR), full-res luminance pass, 8 mip levels. Two convolution effects in one `EffectPass` throw. `NormalPass`/SSAO double scene draw calls.
18. `renderer.info` resets on every internal `render()` unless `autoReset = false`; it reports counts, never bytes.
19. `gl.finish()` does not block in Chromium; time GPU work with a 1-pixel `readPixels`.
20. `performance.memory` is a snapshot object — re-read it; needs `--enable-precise-memory-info`.
21. `AudioContext.resume()` before a user gesture never resolves; the test launcher's autoplay flag hides this.
22. `requestPointerLock({unadjustedMovement:true})` can reject and fire `pointerlockerror` before the fallback succeeds; Chrome blocks re-lock for ~1.25 s after Esc **[W]**.
23. Headless Chromium: no mouse deltas under pointer lock, Esc does not unlock — test input through the hook.
24. Vite dependency pre-bundling can serve two copies of three ("Multiple instances of Three.js"); parallel servers share its cache.
25. TS 7: no auto `@types`, no compiler JS API; root `package.json` is `"type": "commonjs"`, so `.ts` configs/tools with `import` warn or fail under Node.
26. `THREE.Clock` warns (deprecated r183); `PCFSoftShadowMap` silently becomes `PCFShadowMap`; r186's `renderer.setEffects()` is for three's own passes, not `postprocessing`.
27. Changing pixel ratio reallocates every render target — throttle it.
28. Do not mix `three/addons/...` and `three/examples/jsm/...` spellings casually: pick one (`three/examples/jsm/*.js`) so tooling and reviews see one import per addon **[U]**.

## Not verified here

- Anything about real-GPU frame time: MSAA, bloom, FXAA/SMAA cost on integrated graphics, the benchmark thresholds, the claim that Low holds 60 fps at 720p on a 2017 iGPU.
- The renderer-string classifier against strings captured from real devices; Firefox and Safari behaviour in general (only Chromium was run).
- Chrome's 1.25 s pointer-lock cooldown and mouse-delta spikes (web sources / experience only).
- `AdaptiveResolution` against real frame-time traces (model simulation only).
- Query-speed differences between BVH split strategies.
- `LightProbeGridWebGL` at production probe counts and its per-fragment cost.
- Cross-machine screenshot determinism.
