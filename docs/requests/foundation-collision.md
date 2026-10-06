# Requests and notes: collision engine (`src/core/collision.ts`)

From the builder of the collision slice of `foundation-core`. Nothing here blocks anyone: the
engine implements the whole `CollisionWorld` contract as written. These are the places where I
departed from, or had to interpret, `docs/ARCHITECTURE.md` 6, plus what other owners need to know.
Evidence: `tests/core/collision.spec.ts` (59 tests), `shots/foundation-collision/bench.txt`.

## 0. Status: RESOLVED (integrator passes)

| Section | Status | Where it lives now |
|---|---|---|
| 1 (two departures from the "Implementation constraints") | RESOLVED: accepted, the bullet rewritten | ARCHITECTURE 6, last bullet; 18 |
| 2 (where the zero comes from) | RESOLVED | ARCHITECTURE 18 "callers and allocation"; `code-player` and `code-enemies` read this section first |
| 3 (twelve interpretations) | RESOLVED: accepted as written | ARCHITECTURE 18 |
| 4 (for `code-player` and `code-enemies`) | RESOLVED, **with a correction**: "the bare capsule rolls over 0.2 m and is stopped by 0.3 m" is not what the engine does. Measured in round 2: the ledge lift is one radius (a ledge 0.30 m up → lifted 0.305 m; 0.34 m → 0.475 m, in the air; 0.36 m → a wall), so a jump reaches apex + 0.35 m; wedges are exact from 5 degrees. The step-up recipe below still holds | ARCHITECTURE 6 "Three engine properties a controller must handle"; `code-player` 4.1; the note added to section 4 below and to interpretation 6 |
| 5 (`collider_terrain` winding) | RESOLVED | `tools/check-glb.mjs` (mutation test 20); ARCHITECTURE 6 and 18 |

## 1. For the integrator: two departures from "Implementation constraints" (ARCHITECTURE 6)

The work order asks for **0 bytes per query**; the constraints name `bvh.shapecast(...)` and "one
pooled `ExtendedTriangle`". They cannot both hold, so the zero-byte requirement won:

| Constraint | What the engine does | Why (measured) |
|---|---|---|
| queries through `shapecast({ intersectsBounds, intersectsRange })` | walks the `MeshBVH`'s packed node buffers (`bvh._roots`) itself with an explicit `Int32Array` stack | `MeshBVH.shapecast` builds a spread object, three typed-array views and closures per call: about 0.26 KB per query (`tech-web.md` 4, and the library source). `setStatic` verifies the node layout by walking it once and throws a clear error if a future three-mesh-bvh changes it. |
| one pooled `ExtendedTriangle`, `closestPointToSegment` | own segment / triangle closest-point routines (Ericson 5.1.5, 5.1.9) on typed-array scratch | `closestPointToSegment` allocates about 24 B per call |
| per-triangle data "through the vertex index" | done once, right after the build: positions, flags, surface and solid index are copied into arrays in BVH triangle order (`index[t * 3] / 3` gives the source triangle) | one indirection less in every inner loop |

Still as specified: one `Float32Array` of positions, one `Uint32Array` index, `MeshBVH` built
without `indirect` (strategy `CENTER`, leaf size 6: the full layout, 4 916 triangles, is rebuilt by `setStatic` in about 1.3 ms), boxes and
volumes as flat typed arrays tested linearly (64 and 256).

**Request:** amend the "Implementation constraints" bullet to say so, or accept it as is.

## 2. For every caller: where the zero really comes from

V8 passes arguments as tagged values. Inside the engine no function takes or returns a double
(everything travels through typed-array scratch), and each public method is a thin wrapper that
only stores its arguments. A call is therefore allocation-free **when V8 inlines that wrapper into
its caller**, which it does for hot call sites in reasonably small functions. Where it does not
(one very large function making many different queries), the *caller* boxes each non-integer
`number` argument: 16 bytes apiece. Measured: seven different queries in one 20-line loop cost
58 to 93 KB per 7 000 calls (8 to 13 bytes per call on average); the same seven in seven small
loops cost 0. This is a property of the contract's positional signatures, not something the engine
can fix. Practical rules:

- keep a hot query call in a small function (a `move()` or `fire()` step, not a 300-line update);
- test a `groundHeight` result with `Number.isNaN(g)`;
- do not write `cond ? NaN : value` or accumulate a double in a captured `let` in a hot path
  (both box); use a typed-array cell or a field.

The first few thousand calls after load run in the interpreter and the mid tier and do allocate
(every JS function does); the 0 is the steady state the game reaches within its first seconds.

## 3. Interpretations (please object now if any is wrong)

1. **`overlapSphere` returns one entry per entity** (its highest-priority touching volume, then the
   nearest), not one per volume, so a blast does not hit a three-volume Tamper three times. The
   contract says "Volumes ... touching a sphere"; the work order says "one hit per entity".
2. **`raycastAll` reports where the ray *enters* each static solid** (one hit per solid entered,
   by pairing that solid's crossings in and out), not every triangle crossed: a round through a
   plank is one `PIERCE` hit, not two. A tube (`innerRadius`) is entered twice and gives two hits.
   A muzzle inside a solid gets the way out as a hit. Triangles with no solid index report every
   crossing. Up to 64 crossings are considered before the 16-hit cap.
3. **`raycast` (nearest)** considers only volumes in front of the nearest solid, then applies
   "highest priority per entity", then takes the nearest entity. A weak point behind a wall never
   makes an enemy hittable through it. Ties: volume, then box, then static, in both ray queries.
4. **Rays are double-sided and inclusive**: a ray along a shared edge or through a corner hits
   (barycentric tolerance 1e-7); a ray starting exactly on a surface hits it at distance 0; a
   ray starting inside a volume or box hits at distance 0 with the normal facing the shooter.
5. **`grounded`** is true when a walkable contact on a walkable *face* lies within 5 mm
   (`GROUND_SKIN`) of the resolved capsule, so standing still stays grounded without gravity
   pushing in. `hitCeiling` is a push with `normal.y < -walkableCos`; `hitWall` every other
   non-walkable push; `wallFlags` / `wallN*` belong to the deepest of them.
6. **The face of a too-steep slope pushes sideways**, like a wall (a body pressed into it does not
   climb); lips and edges still push along their contact normal, which is what rolls the capsule
   over ledges up to about 0.2 m (measured later: up to one radius, 0.35 m; section 0). Contacts are resolved deepest first, and a push that would
   enter another touching surface slides along it instead (corners, wedges, a wall met while
   sliding along another).
7. **Back faces**: a contact with a face the axis is behind is ignored (a thin wall's far face must
   not pull the body through); a capsule that starts with its axis inside a solid, within a radius
   of a face, is pushed out through that face. Deeper than that it stays where it is, and
   `capsuleFree` reports it (ray-parity test), so a spawn or teleport can be checked.
   This needs **closed solids wound counter-clockwise seen from outside**. `greybox.ts` does that;
   `setStatic` also flips any closed solid that arrives inside-out (`flippedSolids`, 0 today).
8. **`capsuleFree`** treats resting contact as free (0.1 mm tolerance) and counts `BODY_ONLY`.
   **`groundHeight`** sees `BODY_ONLY` and boxes, returns the first surface of any slope (not only
   walkable ones) and `NaN` beyond `maxDrop`.
9. **`setSolidEnabled` is remembered across `setStatic`** (by id), including ids not in the current set.
10. **Handles** are positive integers (never 0 or -1); a stale handle is ignored; a volume is not
    hit until its first `setSphere` / `setCapsule` / `setVolumeBox`. A 65th box or 257th volume throws.
11. **`stats.rays` / `stats.capsules`** only count up; whoever displays them zeroes them each tick.
12. **`triSurface`** bytes index `SURFACE_TYPES` of `core/math.ts` (re-exported here); an unknown
    byte reads as `none`. A `triSolid` value `>= solidIds.length` (`NO_SOLID`) means "no solid".

## 4. For `code-player` and `code-enemies`

- **A capsule on a slope rides above it.** The lower sphere touches the slope beside the axis, so
  the feet are `r (1 / cos(slope) - 1)` above the surface under them: 4 cm at 27 degrees, 8.75 cm
  on the steepest ramp in the layout (36.9 degrees). Use `groundHeight` for foot IK, blob shadows
  and footstep decals, not `CapsuleResolve.y`.
- **Correction (round 2; ARCHITECTURE 6):** the engine's own ledge lift is **one radius, not 0.2 m**. `resolveCapsule` carries a capsule pressed into a ledge onto any walkable top below the centre of its lower sphere (0.35 m above the feet) and can leave it up to 0.14 m above that top; a controller's own lift adds to it, and a jump reaches apex + 0.35 m. Check the height really gained after every move and refuse a landing above the jump's apex. A `groundHeight` ray started inside a solid reports its underside; after a snap, resolve the capsule and keep the engine's answer. Wedges are exact from 5 degrees.
- **Step-up.** (Written before the measurement above: read "rolls over 0.2 m and is stopped by 0.3 m" as "is lifted onto anything up to 0.35 m when pressed into it".) The bare capsule rolls over 0.2 m and is stopped by 0.3 m. A lift-move-drop that
  works with this engine (spec, `walk()` helper): when `hitWall` while grounded, test
  `capsuleFree` 0.35 m up at the current place and 0.13 m ahead, bisect the height down with
  `capsuleFree`, `resolveCapsule` there, and accept when it is `grounded`. The 0.13 m matters: the
  lower sphere must get far enough over the lip for the lip to be walkable ground.
- **Sub-stepping is the caller's job** (`speed * dt / subSteps < radius`). Verified: a 5 cm wall and
  an 8 cm door leaf hold at 60 m/s with three sub-steps, from both sides, and 120 bodies fuzzed for
  ten seconds each in a cluttered thin-walled room never left it or ended overlapping anything.
- **Known limit.** Depenetration cannot answer a true squeeze. One was found by fuzzing: a slot
  narrower than the body between a wall and the rising edge of a steep ramp, under a ceiling, entered
  at 60 m/s: the body rides up the edge and is pushed through the 5 cm ceiling. At 12 m/s the same
  room holds. The layout has no such slot (the validator keeps 0.45 m clear of nav links), and no
  body in the game moves at 60 m/s horizontally; a swept test would be the fix if one ever does.

## 5. For `foundation-pipeline` / `art-env-exterior` (`collider_terrain`)

A sculpted terrain mesh is an open sheet, so its winding cannot be checked or repaired at load:
**its triangles must face up** (counter-clockwise seen from above; glTF front faces). A sheet wound
downward would let bodies fall through. `tools/check-glb.mjs` should assert `normal.y > 0` for
every `collider_terrain` triangle.

## Code integrator, polish round 2 (2026-10-04): what was decided on the code-side rows

| Row | Decision |
|---|---|
| 5, `collider_terrain` | one more consequence found and fixed: `buildSolidColliders` gave the terrain sheet a solid id of its own, and `capsuleFree`'s inside test read one crossing of that open sheet as "inside a solid" above the whole lip. The sheet's triangles now carry `NO_SOLID` (`src/core/greybox.ts`); `tests/core/walk.test.mjs` random walks pass from all 17 checkpoints |

