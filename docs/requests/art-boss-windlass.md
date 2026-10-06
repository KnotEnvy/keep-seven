# Requests and notes from `art-boss-windlass` (boss_windlass, proj_canister)

Nothing here blocks the piece; every item is either a deviation from a number in the order (with the reason), or a
convention the code that drives the Windlass must know. Evidence: `shots/art-boss-windlass/`.

## 1. To `code-enemies` (drives arm_yaw, drum_spin, knots, pawls, lids, lamps)

| Thing | As built |
|---|---|
| Bone frames | every bone except the six lids is a vertical bone whose glTF rest frame **is the game frame** (x right as seen from the front, y up, z out of the face), as on the placeholder |
| `arm_yaw` | turn about local Y, pivot (0, 12.5, 0) on the bore axis |
| `drum_spin` | turn about local Z, pivot at the hub (0, 4.0, 2.0). **A positive angle (counter-clockwise seen from the front) brings mouth 2 to the top**; mouths are numbered clockwise seen from the front, mouth 1 at the top at 0 |
| `knot_n`, `pawl_l/r` | head on the collar plate, 0.17 / 0.11 m behind the hit point. Squash: scale local Z (0.5 = lobes pressed onto the plate). `knot_n_hit` and `pawl_*_hit` do not move when the knot is squashed or the lid opens |
| `mouth_n` (lid) | rest frame = the game frame turned about Z by the mouth's place on the ring (local Y = outward along the mouth's radius, local Z = the face normal), head on the hinge pin. Every lid has the same local rest transform relative to its mouth, so `mouth_open` / `mouth_close` retarget by renaming the `mouth_1` tracks. Open = +0.10 m along local Z (out of the recess), then +110 degrees about local Z. Measured: retargeted to `mouth_4` it swings 110.00 degrees and lifts 0.100 m (`tests/art_boss/windlass_geometry.test.mjs`) |
| Clip tracks | the exporter writes a track for EVERY bone in every clip (the bones a clip does not move hold their rest value). Play each clip on its own bones only: idle_sway `root`; present and sag_death `root`, `cable_a/b/c`; lids `mouth_1` (retargeted); guard_slide_on `guard`; **guard_drop / guard_raise `guard` and `guard_piece_1..5` (fixer pass: the guard is a five-leaf fan, section 2.3)**; guard_shatter `guard_piece_1..5` **and `guard` (it holds the guard at its seated pose)**. Playing whole clips through the mixer, as `src/enemies/boss/index.ts` `playBody` does today, is correct as it stands |
| `present`, `sag_death` | they tilt the **root**, which is the parent of `arm_yaw`, about the root's X axis (toward the root's +Z). They are authored for `arm_yaw` = 0. **At another index, turn the instance's scene node by the index and set `arm_yaw` to 0 for the length of the clip** (the same pose); otherwise the head tips sideways and, at some indexes, its hooks graze the kerb merlons in `sag_death`. `idle_sway` (0.5 degrees) is safe at any index |
| `boss_lamps` (14) | 0-5 the lamps beside mouths 1-6 (aqua core, at r 2.35 m on the mouth's radius, ride `drum_spin`); 6-11 the white cores of knots 1-6 (ride `knot_n`, `wrong_fade` participation B = 1); 12 `pawl_l` core, 13 `pawl_r` core (ride the pawl bones, B = 1) |
| `gauge` (26) | index 0 at the bottom, 25 at the top, groups 10 / 10 / 6 (0.15 m gaps after 9 and 19, 0.05 m otherwise); hangs beside the drum on the arm (x 2.9..3.2, y 2.42..6.47, z 3.19), rides `arm_yaw` |
| Knot glow | the outer lobes are the shared knot's `violet` cell (m_prop emissive, all knots at once); the central lobe under each core lamp is plain `husk`, so a knot whose core lamp is off and whose bone is squashed reads dark |
| `canister_muzzle` | **(0, 5.7, 3.3) on `arm_yaw`**: 0.2 m in front of the top (firing) mouth. GDD 8.2 fires every discharge, canisters included, from the top mouth; the placeholder's guess (0, 4.0, 3.1) is the hub cap. `muzzle_top` (0, 5.7, 3.1) unchanged |
| Pawls and lids | when the drum is indexed the two pawl knots sit inside the two upper flutes. With all six lids open, the open lids of mouths 1 and 6 lie in those flutes too and hide the lower edge of each pawl knot from the floor (cores stay visible). If phase 2's haul opens the mouths before the pawls are burst, consider opening them after |

## 2. Deviations from the order's numbers (sources: art-boss 4.1, ART_BIBLE 7.7)

1. **Guard plate 4.46 m across, not 4.6.** The six lamps beside the mouths stand at r 2.35 (the order allows 2.3 +- 0.05)
   with a 0.22 m bezel; a 4.6 m guard (r 2.3) would cover half of every lamp while it is seated, and phase 2 needs the
   lamps countable. 4.46 m clears them.
2. **The drum's flutes run through its whole depth** (cutter r 0.8 at 2.8 m from the hub, 32 degrees wide at the rim):
   the pawl hit points the order fixes ((+-1.6, 6.0, 2.6): 6 cm outside the 5 m circle, 0.5 m behind the face) would
   otherwise sit behind the face flange. A 0.5 m channel (r 2.25) behind the flange lets the pawls ride clear while the
   drum spins.
3. **`guard_drop` does not go below the drum; the guard is a five-leaf fan that shuts and is run up (fixer pass).**
   The order and ART_BIBLE 7.7 say "falls away below the drum on two links". That is not possible with this drum, kerb
   and plate, whatever the keys: the only way from the face (z 3.36) into the bore (r < 3.0) is the slot between the
   drum's lower lip (y 1.5) and the kerb (y 0.6, merlons to 1.2 from 0.81 m either side of the bay centre). A leaf of
   the plate is 2.1 m wide at its narrowest, so its outer 1.1 m must cross the merlons, which leaves 0.3 m of height:
   it can only cross lying flat (80 degrees or more), and a 2.2 m leaf lying flat at y 1.4 reaches r 4.4 m at chest and
   head height over the walkable floor (the first build did exactly that, with the whole 4.46 m plate out to r 7.3 m,
   and still cut the kerb). `scratch/art-boss-windlass/fanpath.mjs` is the check; the critic's option B (two half-discs
   folded back) sweeps r 6 m. A slot in the kerb (option A) is `art-env-interior`'s file, not this piece's. So:
   - the plate is **five leaves on a centre boss** (the five pre-cut sectors the order already asks for), hung from
     the top beam on **two hoist links** (square bars; top ends weighted to `arm_yaw`, bottom ends to `guard`, so they
     pay out as the plate comes down and are pinned at both ends on every frame of every clip);
   - **`guard_drop` (0.6 s)**: the plate drops 6 cm onto its links and stands 8 cm off the seat, the four free leaves
     swing round the boss and slap shut on leaf 1 (5 degrees past and back), and the hoist runs the pack 2.85 m up to
     a hard stop with a 5 cm overshoot. Released pose: a 72 degree pack, apex at y 6.85, above the top mouth and its
     lamp, in front of the crosshead; all six mouths, six lamps and both pawls in the clear;
   - **`guard_raise` (0.6 s)** (the documents' name: the guard is put back): unlatch, run down, leaves thrown open and
     caught on their cuts, plate knocked home;
   - measured over every frame of drop, raise, shatter and slide_on, at two indexes: no guard vertex in any solid,
     furthest from the bore axis **4.48 m** (limit 4.7), lowest point outside r 3.0 **1.35 m**; no frame is excused
     in `tests/art_boss/windlass_clearance.test.mjs` any more.
   **Needs a ruling from the integrator** (GDD 8 says "the guard drops"; the voice line is "guard released", which
   still fits). If "below the drum" is wanted literally, the kerb has to change, not the keys.
3a. **`guard_shatter` breaks the leaves down above the kerb.** From the seated plate the leaves crack apart and fall
   turning in their own plane; a leaf is 2.2 m long and the kerb is 1.2 m under the plate's lower edge, so each leaf
   scales away about its bone as it nears y 1.35 (the two lower leaves by frame 17 to 19, the top leaf by frame 25)
   and its bone stops there. `code-render`'s `guard_shatter` burst (20 chips + dust at the guard) carries the fall on.
   The two links and their clamps stay hanging (bone `guard`).
4. **The gauge hangs beside the drum, not on the arm above it**: the guard parks above the drum and would hide a gauge
   there; beside the drum it reads from the floor at 20 m (`windlass_gauge_20m.png`).
5. **The drum's back carries the haul barrel**: the three cables leave it behind the post and drop into the bore at
   x -0.28 / 0 / 0.28, z 0.42 (the mark's stroke, seen from the catwalk).

## 3. To the integrator / `art-env-interior`

- The Windlass occupies, at rest and at every index: r <= 4.65 m from the bore axis (the gauge housing's outer corner),
  y from -5.6 (cable ends, inside the bore) to 13.0 (the slew collar passes through the ring girder plane at 12.5).
  Lowest point over the floor outside the kerb: 1.35 m (a shattered leaf, for a frame); at rest 1.5 m.
- Nothing of it enters `bo_kerb`, `bo_kerb_hi_*` or `bo_rib_*` at any index, drum angle 0 / 15 / 30 / 45 degrees,
  guard parked or seated, or through `present`, `sag_death` (at arm_yaw 0, see 1) and `idle_sway`
  (`tests/art_boss/windlass_clearance.test.mjs`), nor through any frame of guard_drop, guard_raise, guard_shatter or guard_slide_on.

## 4. Pass 3 (retry run): what changed in the file

- The drum face's six enamel panels and the six lid tops are now painted by rule, not by the vertex AO bake (the bake put
  long dark wedges across the panels from single lip vertices): clean enamel, an `enamel_stain` ring drawn in to each
  mouth's bezel, grime in the flutes. The rule does not depend on the drum's angle. No name, bone, socket, clip or
  position changed. Evidence: `shots/art-boss-windlass/p3_face_game.png`.
- The crosshead web now sits between its two flanges (y 6.69 to 7.11) so its end caps are no longer baked black.
- Triangles 7 747 -> 7 843 of 8 000 (edge loops on the crosshead and flanges).

## 5. Fixer pass (after the critic's 6.5 / 10): what changed

| Critic issue | What was done |
|---|---|
| major: `guard_shatter` through the kerb and floor | re-keyed (2.3a); all 30 frames x five leaves are in the clearance test |
| major: `guard_drop` / `guard_raise` over the floor at head height, links attached to nothing | the fan (2.3); the two excused frame ranges are gone from the test; new asserts: r < 4.7 m, nothing below 1.25 m outside r 3.0, nothing inside the drum or within 0.17 m of its face |
| minor: guard, arm, back are plain | guard: raised dark rim band, ten fasteners, discharge streaks under them and under the boss, stain drawn in from the rim and deepening to the lower edge (by rule), flat biscuit back, centre boss and nut, two hoist clamps; king post: stain run down 0.5 m from each collar; drum shell and back: lands one step lighter, flute bottoms grimed, chamber heads lighter; hooks under the drum (now purposeless) removed |
| minor: open lids fill the flutes and overlap the pawls | **declined**: the open pose is the `mouth_n` convention `code-enemies` is built on (+0.10 m, +110 degrees about local Z). Section 1's last row stands: open the mouths after the pawls are burst, or accept the overlap |
| minor: `sag_death` slack cable is a rigid rod | the cable bones now carry only the middle three rings (the rings at 3.45, 2.9, -4.4 and -5.6 ride `arm_yaw`), so `cable_c` goes slack as a belly: 0.5 m of it runs out, the belly swings 0.46 m wide, back against `cable_b`, and three more beats, each smaller, and rests 0.23 m out |
| minor: canister faceted, dark seam | 8 sides, 76 triangles, normals of the true surface of revolution set by rule (it shades round); the belly's upper edge and the band's lower edge are scorched warm so the seam is framed in warm colour even with the emissive off. The seam itself is the `flame` cell: its albedo (#2A2623) is `tx_palette`'s, and COLOR_0 can only darken it. **Not confirmed lit**: neither `sandbox/viewer` nor `sandbox/render?scene=room` drew `tx_palette_emis` on `m_prop` for a spawned asset (`shots/art-boss-windlass/fx_render_canister.png`) |
| minor: open items | bake warning gone (the gauge frame's buried back faces are deleted; the slot has a vertex column in the open); 48 px silhouettes done against the Tamper, Bider and Transit (`windlass_silhouettes_48.png`, `blender/boss/windlass_silhouettes.py`): distinct. Guard 4.46 m, gauge beside the drum, `present` / `sag_death` at `arm_yaw` 0: unchanged, still for the integrator to rule (2.1, 2.4, section 1) |

`code-enemies`: if phase 2 breaks while the guard is released, `guard_shatter` still starts from the SEATED plate (the
pack jumps back onto the face for the crack). Playing `guard_raise` at 3x first, or shattering only from `set`, avoids it.

As shipped after the fixer pass: `boss_windlass` 7 895 / 8 000 triangles, 3 draw calls (by bone: arm_yaw 1 950, drum_spin 3 034,
guard 24 + five leaves 567, six lids 792, eight knots 1 120, cables and links 160; lamp sets 248), `proj_canister` 76 / 80;
335 080 + 4 340 B on disk of the 350 000 B share; a forced rebuild is byte-identical; no bake warning in
`blender/export/.logs/boss_windlass.log`. Evidence: `shots/art-boss-windlass/` (`fx_*.png` viewer frames of this pass, the
nine clip strips, `windlass_*.png`, `windlass_silhouettes_48.png`).

## Art integrator, polish round 2 (2026-10-04): what was decided on the rows above

| Row | Decision |
|---|---|
| 2.1 guard 4.46 m; 2.3 the guard is a fan that is run up, not dropped below the drum; 2.4 the gauge beside the drum; `present` / `sag_death` at `arm_yaw` 0 | **ACCEPTED as built** (the kerb is not changed for a literal "below the drum"; "guard released" still fits). `code-enemies` follows section 1 |
| `canister_muzzle` (0, 5.7, 3.3) | accepted; the manifest's placeholder guess is unused now that the file is final |

## Code integrator, polish round 2 (2026-10-04): what was decided on the code-side rows

| Row | Decision |
|---|---|
| 1, what `code-enemies` drives (arm, drum, lids, pawls, lamps) | stands as built; in the playthrough every part answered: the six mouths in the inspection, both pawls and the guard in three hauls of phase 2, the six dry mouths (`shots/integrate-code/low_50` to `low_66`) |
| 1, last row: open lids overlap the pawls | accepted: both pawls are hit from the kerb side 25 degrees off the arm's heading (measured from 5.5 to 7 m out: both pawls and all six mouths in the probe ray's reach) |
| 2.3, the guard is run up, not dropped | accepted with the art integrator; `stn_boss_guard_released` still fits |
| found by the playthrough | a death after the proof restored an unproven bore (the save held the hush): **fixed in core** (see `code-enemies.md`) |

