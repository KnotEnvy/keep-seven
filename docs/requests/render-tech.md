# Requests and notices from render-tech (polish round 4)

Owner: code team "render-tech" (`src/render/`, `tests/render/`). Log: `scratch/r4-team-render-tech/NOTES.md`.
Evidence: `shots/r4-team-render-tech/`.

## 1. For the closer: mirror into the documents

The critic's minor "the muzzle pulse turns nearby dynamic things into flat orange cut-outs" changed how the radial
pulse is applied. No number of a document was contradicted, but two sentences are now incomplete:

| Document | Now says | Should say |
|---|---|---|
| `docs/GDD.md` 6.x, the shot timeline row "0-50" (line 436) | "Muzzle light pulse in the world shader: radius 7 m, 70 ms, flame colour" | add: "shaded by N.L per pixel (floor 0.12), paler toward its centre, and what it adds to any surface is held under 0.6 of display white whatever the mood's exposure" |
| `docs/GDD.md` section 21 list, item 5 "World shader terms: muzzle pulse (radial, position and radius uniforms)" (line 1789) | position and radius uniforms | add: "and a cap uniform (0.6 / exposure); the pulse is skipped entirely on frames where both slots are at rest" |
| `docs/ARCHITECTURE.md` 8.1, if it lists the shared block's fields | (13.w unused) | `uK[13].w` = `uPulseCap` |

Nothing changed in the pulse's radius (7 m; kept round 14 m), life (70 ms; 160 ms), colour or strength as issued by
`vfx.ts`, in the ring at the seventh, in Reduce Flashes (the pulse is still halved), or in the `VfxApi` contract.

## 2. For the look teams (who work in `src/render/` after this pass)

- The three numbers are yours: `PULSE_CAP = 0.6`, `PULSE_WRAP = 0.12`, `PULSE_CORE = 0.7` in `src/render/shared.ts`
  (one line, above `PULSE_GLSL`). `tests/render/pulse.test.mjs` holds the behaviour (a face turned away takes under
  half of a face turned to the pulse; nothing added over the cap; the centre is paler than the edge; the frame after the
  pulse is the frame before it) and reads `PULSE_CAP` from the module, so retuning does not break it unless the cap
  leaves 0.3 to 0.9.
- It applies to **every** material that takes the pulse, static world surfaces included (the "orange slabs" of
  `D_vm_bore.png` are the static jambs of the antechamber door, `chunk_bo_ante` / `m_pellam`, brought into the frame
  by the shot's FOV punch; the Biders' cloth is a skinned world material that had no normal at all). A world material
  has no normal attribute: the pulse uses the face's own normal from screen derivatives, so a smooth-shaded lightmapped
  curve is faceted under the pulse for the frames of a shot.
- A side effect to judge: the flash sprite reads smaller than in round 3's frames, because the over-lit things behind it
  no longer merge with it into one white shape (`shots/r4-team-render-tech/crop_bore_before_after.png`). The sprite
  itself (`vfx.ts` `flashSize`, the atlas cells) was not touched.
- The Windlass's pale plates go to a smooth warm off-white at 5 m (`after_low_bossface.png`): the cap is 0.6 added to a
  plate that is already 0.5. If that is too much, lower `PULSE_CAP` or the lead pulse's `3.0` in `vfx.ts muzzleFlash`.

## 3. Requests to other owners

None.

## Closer, polish round 4 (2026-10-05): decisions

| Row | What | Decision |
|---|---|---|
| 1 | pulse sentences, `uK[13].w` | mirrored: GDD 6.8 row and section 19 item 5 in place; ARCHITECTURE 8.1 |
