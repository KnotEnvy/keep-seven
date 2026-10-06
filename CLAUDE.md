# Weird-west gunslinger FPS — vertical-slice demo

A browser-based first-person shooter: one complete, polished stage in the style and
format of Stephen King's *Dark Tower* series (western + decayed far-future + quiet
horror; "the world has moved on"). Every model, rig, animation, texture and scene is
authored in Blender through headless Python scripts. Graphics quality and performance
on slow machines are the two things this demo is judged on.

## Pillars (every decision is checked against these)

1. **The gun is the star.** A heavy six-shot revolver. Slow, loud, lethal. Every shot matters.
2. **A world that has moved on.** Desert, ruin, and dying Old-World machinery underneath. Melancholy, not grimdark.
3. **Story through place.** Environmental storytelling, sparse narration, a pursuit.
4. **Puzzles that use the gun and the player's attention.** No inventory busywork.
5. **60 fps on integrated graphics.** Baked lighting, tight budgets, adaptive quality.

**Homage, not copy.** Evoke the tone, structure and motifs of the series. Do not use
character names, place names, coined terms, or quotations from the books. All names,
lexicon and text are original to this project.

## Stack (installed, pinned — do not add or upgrade dependencies)

- three 0.186 (WebGLRenderer / WebGL2 — not WebGPU), three-mesh-bvh 0.9, postprocessing 6.39
- TypeScript 7, Vite 8, vitest 5, Playwright 1.63
- @gltf-transform/{core,extensions,functions} 4.5, meshoptimizer, sharp, pngjs, pixelmatch
- Blender 4.5.14 LTS (project-local), Python `bpy` only — no external Python packages
- Audio is synthesized with WebAudio at runtime. There are no audio files and no ffmpeg.

Read APIs from `node_modules/` before using them; do not rely on memory for three r186,
postprocessing 6.39 or Blender 4.5 signatures.

## Environment facts (verified on this machine)

- Linux (WSL2, Ubuntu 24.04), 20 cores, 31 GB RAM, **no sudo**, network available.
- Run Blender only through `tools/blender.sh` (sets the library path):
  `tools/blender.sh -b --factory-startup -P blender/<script>.py -- <args>`
  Cycles CPU baking and rendering work headless. Workbench renders in ~0.3 s; EEVEE works but is slow (software GL).
- Launch browsers only through `tools/browser.mjs` (`launchBrowser()`). Headless Chromium
  has **no GPU**: WebGL2 runs on SwiftShader. Wall-clock FPS there is meaningless. Judge
  performance by draw calls, triangles, texture memory and CPU frame time, and drive the
  game through its deterministic step hook rather than waiting on real time.
- Use absolute paths in shell commands. Avoid `cd` (it triggers a harmless fnm warning and resets anyway).
- `tools/setup-env.sh` recreates `.tools/` from scratch.

## Conventions

- Units are metres. Game space is three.js space: **+Y up, −Z forward, right-handed**.
  Blender is +Z up; a game point `(x, y, z)` is Blender `(x, −z, y)`. The glTF exporter
  (`export_yup=True`) does this conversion — author in Blender space, verify in game space.
- Player: eye height 1.65 m, capsule radius 0.35 m, height 1.8 m. Doors ≥ 1.2 m wide, ≥ 2.2 m tall.
- Runtime assets live in `public/assets/<category>/<name>.glb`. Blender sources are the
  Python scripts in `blender/`; generated `.blend` files go to `blender/blend/`.
- Design data is the single source of truth and is read by both Blender scripts and game code:
  `design/layout.json` (level blockout, zones, markers), `design/assets.json` (asset
  manifest: names, node names, animation clip names, budgets), `design/story.json` (all player-facing text).

## Performance budgets (the "Low" tier must hold 60 fps on a 2017-era integrated GPU at 720p)

| | Low | High |
|---|---|---|
| Draw calls per frame | ≤ 100 typical, ≤ 150 worst | ≤ 220 |
| Visible triangles | ≤ 120k | ≤ 400k |
| GPU texture memory | ≤ 64 MB | ≤ 128 MB |
| Shadow maps | none (baked + blob) | 1 (sun), tight frustum |
| Post-processing | one merged pass | + half-res bloom, optional AO |

- Static lighting is baked in Blender (lightmaps and/or vertex colours). No dynamic shadowed point lights.
- JS frame cost ≤ 4 ms on a mid-range CPU. No allocations in per-frame code paths: pool and reuse.
- Total download ≤ 20 MB. Interactive within 5 s on broadband.
- Adaptive resolution scaling holds frame time; quality tier is auto-detected and user-overridable.

## Rules for agents working in parallel in this tree

- **Stay inside the files you own.** Ownership is listed in `docs/ARCHITECTURE.md`. Never
  edit another owner's files, `package.json`, `src/core/`, `blender/lib/` or `design/*.json`
  unless your brief says you own them. If you need a change elsewhere, write the request to
  `docs/requests/<your-piece>.md` and work around it locally.
- **Never hardcode a port.** Start servers on an OS-assigned free port through the shared test harness.
- **Leave the tree runnable.** Before finishing: `npx tsc --noEmit` reports no errors in your
  files, and your tests pass. If another owner's in-progress file is broken, note it and move on.
- **Prove it.** Claims need evidence: a test run, measured numbers, or a screenshot you
  actually opened and looked at. Put screenshots and renders in `shots/<piece>/`.
- Report honestly. A known gap listed in your report is worth more than a hidden one.
