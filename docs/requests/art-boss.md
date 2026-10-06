# Requests from the `art-boss` fixer, polish round 2 (2026-10-04)

Nothing outside `blender/boss/`, `tests/art_boss/` and this piece's evidence folders was edited. Each row below is a
request to another owner; the asset works without any of them.

## 1. The pawl knots moved forward: `pawl_l_hit` / `pawl_r_hit` are at (-/+1.6, 6.0, **3.95**), not z 2.6

Why: at z 2.6 (0.5 m behind the face) the seated guard (r 2.23 m, z 3.30 to 3.43) stands between the pawls and every
place she can be in the haul. From the door bay the sight line to a pawl's centre crosses the guard's plane 2.03 m from
the hub: inside the plate. What showed was 1 to 4 px of core (`shots/r2-fix-art-boss/before_high_p2_haul_guard.png`).
The x and y of the GDD (3.2 m apart, 6 m up, r 0.3) are kept; only the depth changed. Each knot now stands 0.85 m in
front of the face on a dog plate hung from an outrigger under the crosshead's end (outside the guard's width), clear
of the guard on every frame of `guard_slide_on`, `guard_drop`, `guard_raise` and `guard_shatter` (least gap 0.051 m,
`tests/art_boss/windlass_clearance.test.mjs`). Measured in the game at 960 x 540 from the door bay: 41 x 40 px each
(`final_high_p2_haul_guard.png`, `final_low_p2_haul_guard.png`).

| Owner | Request |
|---|---|
| documents (`docs/ARCHITECTURE.md` 7.6 Windlass row, `docs/ART_BIBLE.md` 7.7 and the 1164 table row, `docs/workorders/art-boss.md` 4.1 and 5) | the pawl position reads `(-/+1.6, 6.0, 2.6)`, radius 0.25: make it `(-/+1.6, 6.0, 3.95)`, radius 0.30 |
| foundation-pipeline (`blender/placeholders.py` lines 102 and 104, `tests/pipeline/placeholders.test.mjs` line 117) | the placeholder's `pawl_l` / `pawl_r` bones and `*_hit` sockets are at z 2.6. Only matters after `--reset boss_windlass`; the shipped asset is the real one |
| code-enemies (`src/enemies/boss/index.ts` lines 271 and 460) | the fallback used when the socket is missing is `(6, 2.6)`: make it `(6, 3.95)`. With the real asset the sockets are read, the hit spheres follow them, and `tests/enemies/boss_p2p3.test.mjs` passes unchanged (9 of 9) |
| code-enemies / code-render | the pawls are now the brightest thing on the arm in **every** phase (violet lobes, white cores 12 and 13 lit whenever a pawl is not burst), but they are targets only in a phase-2 haul with the guard set; in phase 1 a shot at them is deflected. Suggested: light lamps 12 and 13 only while they can be hit (`phase === 'p2' && guard set && hauling`), and hold the lobes' pulse low otherwise, so the cue appears with the rule |

## 2. Not asked of anyone, for the record

- The face of the drum spins, so it has no height ramp: its gradients are radial (lids dished, flutes and hub grimed).
- Triangles 7 991 of 8 000; the Windlass and the canister together 340 124 B of 350 000.

## Closer, polish round 2 (2026-10-04): what was decided on the rows above

| Row | Decision |
|---|---|
| documents: pawl position | **APPLIED**: ART_BIBLE 7.7 table and amendments table, `docs/workorders/art-boss.md` 4.1 / 5, README ruling 25 read (∓1.6, 6.0, 3.95), r 0.30. ARCHITECTURE carries no number for it |
| foundation-pipeline: the placeholder | **RULED, no change**: `blender/placeholders.py` and its test keep z 2.6 (ruling 25): the placeholder is built only by `--reset boss_windlass`, and editing the script would mark every placeholder stale |
| code-enemies: the fallback constants | **APPLIED**: `src/enemies/boss/index.ts` `PAWL_ALONG` and the `nodeAt` fallback are 3.95 |
| code-enemies / code-render: the cue with the rule | **APPLIED** (the lamp half): `syncLamps` lights lamps 12 / 13 only while `phase === 'p2' && hauling && guard === 'set'` and the pawl is not burst. The lobes' emissive pulse is not gated (render's shader term): open |
