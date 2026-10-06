# Requests and notes from art-enemies-bider

## 1. To code-enemies: `turn_about` contract (please confirm)

`turn_about` (1.5 s) is authored with the root's yaw baked out: the clip assumes that **code turns the root +180°
about +Y (to the figure's left, three.js `rotation.y += π`) LINEARLY over the clip's 1.5 s**. The hood leads, the
shoulders follow, the feet step round last; the clip's first frame is `queue_stand`'s pose and its last frame is the
stoop (`idle_stoop` frame 0) facing the root's forward, so it cross-fades cleanly into `run`.
If code instead snaps the yaw at the end, the body will twist and untwist in place and then pop: tell us and the clip is
re-authored (the solver has a `root_yaw` channel; switching to "the clip turns, code snaps" is a one-line change).

## 2. To code-enemies / code-world: where the vignette clips expect their props

| clip | prop placement relative to the Bider's root (game space, the Bider faces +Z) |
|---|---|
| `sit_table`, `rise_from_seat`, `bider_table_static` | root = floor under the chair centre; seat 0.45 m; hands (wrists) at y 0.795 m, z ≈ +0.52 m: the table's near edge should be at z ≈ +0.36 m (top 0.76–0.80 m). `rise_from_seat` ends in the stoop at the root, i.e. the body steps back over the chair's footprint (chairs are zone geometry; nothing moves them) |
| `scoop_kneel`, `kneel_to_stand` | trough rim (0.5 m) near edge at z ≈ +0.36…0.40 m in front of the root; frame 12 of `kneel_to_stand`: `hand_socket_r` at (−0.125, 0.509, 0.515), up axis vertical: detach the cup there |
| `climb_out` | the edge line is 0.15 m BEHIND the root (z = −0.15); the pit (1.2 m deep) is behind it; the figure starts below ground and ends standing in the stoop at the root. Put the spawn so the root is on solid floor just in front of the opening |
| `die_back` | ends lying curled on its left side along −Z (feet near the root, the body reaching 1.3 m behind it: z −1.32 … +0.40, 0.83 m wide, 0.51 m high), hood turned to the ground; `bider_felled_static` is that pose at the same root |

## 3. To code-render: the knot and the pinpricks are emissive cells of `m_prop`

Knot lobes use `violet` / `violet_core`, the slit pinpricks `violet_band` (dark albedo); the statics that are "off" use
plain `husk` / `cable`. The viewer's fallback material shows only `tx_palette`, so our tests add `tx_palette_emis` in the
page (`tests/art_enemies/bider_lib.mjs` `glow()`) to judge the weak point. A viewer option for this (`&emis=1`) would
help every art piece (the transit half asked too).

## 4. Order / source discrepancy (for the critic and the integrator)

The knot: GDD 7.1 says "a clustered growth 0.16 m in radius with a dark collar"; the order says `build_knot(0.16)`
(lobes 0.16, collar 0.21) — on a hood 0.34 m wide that collar covers the whole face (tried: dark blotches over the slits,
shots of the first pass). Built as `build_knot(0.123)`: **the collar's outer radius is 0.16 m** (the GDD's reading),
wrapped by arc length over the crown, forward of the seam. The hit sphere (0.22 m on `crown`) is unchanged.
`bider_table_static` carries a smaller live knot (0.075) as "knot live but small".

`lunge_windup`: "sinks 0.25 m" and "crown within ±0.02 m" cannot both hold with a 0.515 m spine chain; the hips sink
0.19 m (0.862 → 0.675) under a head that drops 0.03 m (crown ±0.012 m measured).

## 5. Fix pass (after the first critic): what changed, and what is asked of others

**Producer ruling asked (critic recommends accepting both; neither was changed in the fix pass):**
- the knot is `build_knot(0.123)` (collar outer radius 0.16 m), not lobes at 0.16 m: a larger knot covers the slits (section 4);
- `lunge_windup` sinks 0.19 m, not 0.25 m (the ±0.02 m crown rule wins: section 4);
- heights: 1.42 m to the hood's crown / 1.48 m to the knot top at the stoop, 1.64 m in `queue_stand` (order: 1.4 / 1.7 m).
  The figure is modelled 1.70 m upright (design pose); nothing in the game stands it fully upright.
Please record the accepted numbers in the order / manifest notes (we do not own either file).

**To code-enemies: tint spread.** In a file of six the four tints of `tests/art_enemies/bider_evidence.mjs`
(`[1,1,1] [0.86,0.80,0.74] [1.08,1.02,0.92] [0.78,0.80,0.84]`) are hard to tell apart at 5 m. A wider spread reads
better and stays inside the palette: value 0.70 … 1.15 and a little hue (`[0.72,0.70,0.70] [1.15,1.05,0.90] [0.90,0.95,1.0] [1,1,1]`).
`COLOR_0` has headroom for it: the coat is authored at about 0.6 of its cell.

**To code-enemies / code-world: the chair and `rise_from_seat`.** `sit_table` and `bider_table_static` now sit ON
`prop_chair` (coat tails folded forward along the seat under the thighs; `bider_poses.test.mjs` checks the static against
the chair's raw export). `rise_from_seat` still ends in the stoop at the root, which is the middle of the chair: when the
clip starts, slide the root 0.45 m forward-left of the chair over the clip (or hide/tip the chair), or the standing body
overlaps the chair. Not fixable in a clip whose root motion is baked out.

**Ground clamp.** `bider_clips.pose()` now passes every pose through `grounded()`: boots never go below the floor
(was −0.10 m in `sit_down`, −0.088 in `kneel_to_stand`, −0.077 in `die_back`). `climb_out` is exempt (it starts in a pit).
Cloth (the skirt hem of the seated pose) still dips up to 3 cm into the ground in the SKINNED clips; the statics lay
those vertices on the floor.

**Lower legs.** The dust skirt now takes the shin and boot 30 % toward ground colour (was 42 %), so the legs stay a
shade darker than L1 sand and the figure no longer seems to float.

## Art integrator, polish round 2 (2026-10-04): what was decided on the rows above

| Row | Decision |
|---|---|
| 5: knot `build_knot(0.123)` (collar radius 0.16 m), `lunge_windup` sinks 0.19 m, heights 1.42 / 1.64 m | **ACCEPTED** as built (recorded here; the manifest has no field for them) |
| chair overlap in `rise_from_seat`, tint spread, `turn_about` | code-side (`code-enemies` / `code-world`) |

## Code integrator, polish round 2 (2026-10-04): what was decided on the code-side rows

| Row | Decision |
|---|---|
| 1, `turn_about`: the root turns linearly over the clip | **APPLIED** in `src/enemies/bider.ts` (it snapped 180 degrees at the clip's end) |
| 2, where the vignette clips expect their props | stands as built (`code-world` places by the markers); the kneeler at the trough and the risers at the table were played through, not measured against the table edge |
| 3, emissive cells in the viewer (`&emis=1`) | **NOT APPLIED** (the viewer's fallback material is unchanged this round); the real renderer draws them (the crown knots in `low_12_enter_tally_house.png`) |
| tint spread | **APPLIED** (`BIDER.tints` is the wider spread asked for), and the real renderer now honours `userData.tint` (`src/render/materials.ts`) |
| the chair and `rise_from_seat` | **NOT APPLIED**: the riser stands up through the chair's footprint. Known gap |
| 4, heights 1.42 / 1.64 m, `build_knot(0.123)` | accepted as built (art integrator) |

