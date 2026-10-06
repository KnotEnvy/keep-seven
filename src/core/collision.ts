// src/core/collision.ts: the one CollisionWorld (ARCHITECTURE 6). Zero allocation per query.
//
// Static geometry: one Float32 position array + one Uint32 index, a three-mesh-bvh MeshBVH built
// without `indirect`. Queries walk the BVH's packed node buffers with an explicit stack and read
// triangle data from flat typed arrays kept in BVH triangle order (derived once, through the vertex
// index, after the build). The library's own `shapecast` allocates a spread object, three typed-array
// views and closures per call (docs/research/tech-web.md 4: about 0.26 KB per query) and
// `ExtendedTriangle.closestPointToSegment` about 24 B, so neither is used on the query path: the
// zero-byte requirement of the work order outranks them (see docs/requests/foundation-collision.md).
// Dynamic boxes (<= 64) and hit volumes (<= 256) are flat typed arrays tested linearly.
//
// All hot state lives in typed-array scratch or in locals: no closures, no objects, no boxed doubles.
import { BufferAttribute, BufferGeometry } from 'three';
import { CENTER, MeshBVH } from 'three-mesh-bvh';
import { ColFlag, Layer, MAX_LINE_HITS } from './contracts.ts';
import { SURFACE_TYPES, surfaceIndex } from './math.ts';
import type {
  CapsuleResolve, ColliderHandle, CollisionWorld, EntityId, EntityRef, HitList, HitPart, HitReceiver,
  HitResult, HitVolumeDesc, OverlapList, SurfaceType, Vec3, VolumeHandle,
} from './contracts.ts';

/** `triSurface` bytes handed to `setStatic` index SURFACE_TYPES (core/math.ts: the order of the SurfaceType union). */
export { SURFACE_TYPES, surfaceIndex };
/** `triSolid` value of a static triangle that belongs to no layout solid (any value >= solidIds.length works). */
export const NO_SOLID = 0xffff;
export const MAX_BOXES = 64;
export const MAX_VOLUMES = 256;
export const MAX_OVERLAPS = 32;
/** A walkable surface within this distance below the capsule counts as ground even when nothing had to be pushed. */
export const GROUND_SKIN = 0.005;

// imported bindings copied to module constants: the hot paths then read plain locals whatever the bundler does
const SURFACES: readonly SurfaceType[] = SURFACE_TYPES;
const SURFACE_NONE = SURFACES.length - 1;
const F_BODY_ONLY: number = ColFlag.BODY_ONLY, L_WORLD: number = Layer.WORLD, L_DYNAMIC: number = Layer.DYNAMIC, HIT_CAP: number = MAX_LINE_HITS;

const UINT32_PER_NODE = 8;       // three-mesh-bvh packed node: 6 float32 bounds + 2 uint32
const LEAF_FLAG = 0xffff;
const STACK_SIZE = 256;
const MAX_CROSSINGS = 64;        // static triangle crossings kept by raycastAll before solids are paired up
const MAX_GATHERS = 3;           // broadphase passes of one resolveCapsule
const MAX_PUSHES = 8;            // contacts resolved per broadphase pass, deepest first
const MAX_CANDIDATES = 96;       // triangles kept by one broadphase pass
const WEDGE_MIN = 0.0076;        // sin^2 of the smallest wedge angle (5 degrees) resolved by sliding along the first wall
const GATHER_SLOP = 0.1;         // the broadphase box is this much larger than the capsule; moving further re-gathers
const PEN_EPS = 1e-6;            // penetrations below this are contact, not a push
const FREE_EPS = 1e-4;           // capsuleFree tolerance: resting contact is free
const BARY_EPS = 1e-7;           // barycentric tolerance: a ray along a shared edge never slips between two triangles
const BOUNDS_PAD = 1e-4;         // node bounds are padded for rays so the tolerance above cannot be culled
const SAME_T = 1e-5;             // two crossings of one solid closer than this with one facing are one crossing
const SHAPE_SPHERE = 0, SHAPE_CAPSULE = 1, SHAPE_BOX = 2;
const MODE_NEAREST = 0, MODE_ANY = 1, MODE_ALL = 2;
const KIND_VOLUME = 0, KIND_BOX = 1, KIND_STATIC = 2;

// ---- scratch (module level, typed: writes never allocate) --------------------------------------
// V8 passes arguments and return values as tagged values: a double handed to a function that is not
// inlined, or returned from one, is boxed (16 bytes of garbage). So no internal function below takes
// or returns a double: inputs and outputs travel through these arrays, and the public methods are
// thin wrappers (small enough to be inlined into a hot caller) that only store their arguments here.
/** the ray of the current query: 0..2 origin, 3..5 unit direction, 6 distance limit */
const RAY = new Float64Array(8);
/** 0..2 closest point on the triangle, 3 y on the capsule axis; 4..7 candidate of the same, 12 its squared distance;
 *  13 squared distance of closestSegTri; 8 ray distance, 9..11 ray normal; 14 double result of a query */
const F = new Float64Array(16);
/** the triangle under test: A (0..2), B (3..5), C (6..8) */
const T = new Float64Array(9);
/** the capsule axis under test: 0 x, 1 y of the lower sphere centre, 2 y of the upper one, 3 z */
const S = new Float64Array(4);
/** capsule query: 0..2 feet; 4..6 ground normal; 7 wall depth; 8..10 wall normal; 11 walkableCos; 12 radius; 13 height */
const C = new Float64Array(16);
/** 1 grounded, 2 hitWall, 3 hitCeiling, 4 ground surface, 5 wall flags, 6 a sideways push has happened */
const J = new Int32Array(8);
const J_GROUNDED = 1, J_WALL = 2, J_CEIL = 3, J_GSURF = 4, J_WFLAGS = 5, J_PRIOR = 6;
/** direction of the last sideways push of the capsule being resolved (valid while J[J_PRIOR] is 1) */
const W = new Float64Array(4);
/** normals of the contacts found by one capsuleStep (3 floats each) */
const MAX_CONTACTS = 24;
const K = new Float64Array(MAX_CONTACTS * 3);

/** Closest point on triangle T to the lower (top = 0) or upper (top = 1) end of axis S (Ericson 5.1.5). Writes F[4..6], F[12]. */
function closestPtTri(top: number): void {
  const px = S[0]!, py = top === 0 ? S[1]! : S[2]!, pz = S[3]!;
  const ax = T[0]!, ay = T[1]!, az = T[2]!, bx = T[3]!, by = T[4]!, bz = T[5]!, cx = T[6]!, cy = T[7]!, cz = T[8]!;
  const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  let qx: number, qy: number, qz: number;
  if (d1 <= 0 && d2 <= 0) { qx = ax; qy = ay; qz = az; } else {
    const bpx = px - bx, bpy = py - by, bpz = pz - bz;
    const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
    if (d3 >= 0 && d4 <= d3) { qx = bx; qy = by; qz = bz; } else {
      const vc = d1 * d4 - d3 * d2;
      if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); qx = ax + v * abx; qy = ay + v * aby; qz = az + v * abz; } else {
        const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
        const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
        if (d6 >= 0 && d5 <= d6) { qx = cx; qy = cy; qz = cz; } else {
          const vb = d5 * d2 - d1 * d6;
          if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); qx = ax + w * acx; qy = ay + w * acy; qz = az + w * acz; } else {
            const va = d3 * d6 - d5 * d4;
            if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
              const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
              qx = bx + w * (cx - bx); qy = by + w * (cy - by); qz = bz + w * (cz - bz);
            } else {
              const sum = va + vb + vc;
              if (sum > -1e-30 && sum < 1e-30) { qx = ax; qy = ay; qz = az; } else {
                const inv = 1 / sum, v = vb * inv, w = vc * inv;
                qx = ax + abx * v + acx * w; qy = ay + aby * v + acy * w; qz = az + abz * v + acz * w;
              }
            }
          }
        }
      }
    }
  }
  F[4] = qx; F[5] = qy; F[6] = qz;
  const ex = px - qx, ey = py - qy, ez = pz - qz;
  F[12] = ex * ex + ey * ey + ez * ez;
}

/**
 * Closest points between edge `e` of triangle T (0 = A-B, 1 = B-C, 2 = C-A) and the vertical axis S
 * (Ericson 5.1.9). Writes the point on the edge to F[4..6], the y on the axis to F[7], the squared distance to F[12].
 */
function closestEdgeAxis(e: number): void {
  const i = e * 3, j = e === 2 ? 0 : i + 3;
  const ax = T[i]!, ay = T[i + 1]!, az = T[i + 2]!;
  const d1x = T[j]! - ax, d1y = T[j + 1]! - ay, d1z = T[j + 2]! - az;
  const vx = S[0]!, y0 = S[1]!, L = S[2]! - y0, vz = S[3]!;
  const rx = ax - vx, ry = ay - y0, rz = az - vz;
  const a = d1x * d1x + d1y * d1y + d1z * d1z, ee = L * L, f = L * ry;
  let s = 0, t = 0;
  if (a <= 1e-18) {
    if (ee > 1e-18) { t = f / ee; t = t < 0 ? 0 : t > 1 ? 1 : t; }
  } else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (ee <= 1e-18) { s = -c / a; s = s < 0 ? 0 : s > 1 ? 1 : s; } else {
      const b = d1y * L, denom = a * ee - b * b;
      if (denom > 1e-18) { s = (b * f - c * ee) / denom; s = s < 0 ? 0 : s > 1 ? 1 : s; }
      t = (b * s + f) / ee;
      if (t < 0) { t = 0; s = -c / a; s = s < 0 ? 0 : s > 1 ? 1 : s; } else if (t > 1) { t = 1; s = (b - c) / a; s = s < 0 ? 0 : s > 1 ? 1 : s; }
    }
  }
  const qx = ax + d1x * s, qy = ay + d1y * s, qz = az + d1z * s, sy = y0 + L * t;
  F[4] = qx; F[5] = qy; F[6] = qz; F[7] = sy;
  const ex = qx - vx, ey = qy - sy, ez = qz - vz;
  F[12] = ex * ex + ey * ey + ez * ez;
}

/**
 * Closest points between the vertical axis S and triangle T. Writes the triangle point to F[0..2],
 * the y on the axis to F[3] and the squared distance to F[13] (exactly 0 when the axis passes through the triangle).
 */
function closestSegTri(): void {
  const sx = S[0]!, y0 = S[1]!, y1 = S[2]!, sz = S[3]!;
  const ax = T[0]!, az = T[2]!, bx = T[3]!, bz = T[5]!, cx = T[6]!, cz = T[8]!;
  // the vertical line through the triangle's footprint
  const w0 = (cx - bx) * (sz - bz) - (cz - bz) * (sx - bx);
  const w1 = (ax - cx) * (sz - cz) - (az - cz) * (sx - cx);
  const w2 = (bx - ax) * (sz - az) - (bz - az) * (sx - ax);
  if ((w0 >= 0 && w1 >= 0 && w2 >= 0) || (w0 <= 0 && w1 <= 0 && w2 <= 0)) {
    const sum = w0 + w1 + w2;
    if (sum > 1e-12 || sum < -1e-12) {
      const yt = (w0 * T[1]! + w1 * T[4]! + w2 * T[7]!) / sum;
      if (yt >= y0 && yt <= y1) { F[0] = sx; F[1] = yt; F[2] = sz; F[3] = yt; F[13] = 0; return; }
    }
  }
  closestPtTri(0);
  let best = F[12]!;
  F[0] = F[4]!; F[1] = F[5]!; F[2] = F[6]!; F[3] = y0;
  if (y1 > y0) {
    closestPtTri(1);
    if (F[12]! < best) { best = F[12]!; F[0] = F[4]!; F[1] = F[5]!; F[2] = F[6]!; F[3] = y1; }
    for (let e = 0; e < 3; e++) {
      closestEdgeAxis(e);
      if (F[12]! < best) { best = F[12]!; F[0] = F[4]!; F[1] = F[5]!; F[2] = F[6]!; F[3] = F[7]!; }
    }
  }
  F[13] = best;
}

/** Ray RAY against the Y-rotated box at p[o..o+7] (centre, half extents, cos, sin). True on a hit within RAY[6]: distance in F[8] (0 when the origin is inside), normal in F[9..11]. */
function rayObb(p: Float64Array, o: number): boolean {
  const dx = RAY[3]!, dy = RAY[4]!, dz = RAY[5]!;
  const hx = p[o + 3]!, hy = p[o + 4]!, hz = p[o + 5]!, c = p[o + 6]!, s = p[o + 7]!;
  const rx = RAY[0]! - p[o]!, rz = RAY[2]! - p[o + 2]!;
  const lox = rx * c - rz * s, loy = RAY[1]! - p[o + 1]!, loz = rx * s + rz * c;
  const ldx = dx * c - dz * s, ldz = dx * s + dz * c;
  let tmin = -Infinity, tmax = Infinity, axis = -1, sign = 0;
  if (ldx > -1e-12 && ldx < 1e-12) { if (lox > hx || lox < -hx) return false; } else {
    const inv = 1 / ldx; let t1 = (-hx - lox) * inv, t2 = (hx - lox) * inv, sg = -1;
    if (t1 > t2) { const k = t1; t1 = t2; t2 = k; sg = 1; }
    if (t1 > tmin) { tmin = t1; axis = 0; sign = sg; }
    if (t2 < tmax) tmax = t2;
  }
  if (dy > -1e-12 && dy < 1e-12) { if (loy > hy || loy < -hy) return false; } else {
    const inv = 1 / dy; let t1 = (-hy - loy) * inv, t2 = (hy - loy) * inv, sg = -1;
    if (t1 > t2) { const k = t1; t1 = t2; t2 = k; sg = 1; }
    if (t1 > tmin) { tmin = t1; axis = 1; sign = sg; }
    if (t2 < tmax) tmax = t2;
  }
  if (ldz > -1e-12 && ldz < 1e-12) { if (loz > hz || loz < -hz) return false; } else {
    const inv = 1 / ldz; let t1 = (-hz - loz) * inv, t2 = (hz - loz) * inv, sg = -1;
    if (t1 > t2) { const k = t1; t1 = t2; t2 = k; sg = 1; }
    if (t1 > tmin) { tmin = t1; axis = 2; sign = sg; }
    if (t2 < tmax) tmax = t2;
  }
  if (tmin > tmax || tmax < 0) return false;
  if (tmin <= 0 || axis < 0) { F[8] = 0; F[9] = -dx; F[10] = -dy; F[11] = -dz; return true; }
  if (tmin > RAY[6]!) return false;
  F[8] = tmin;
  if (axis === 0) { F[9] = sign * c; F[10] = 0; F[11] = -sign * s; } else if (axis === 1) { F[9] = 0; F[10] = sign; F[11] = 0; } else { F[9] = sign * s; F[10] = 0; F[11] = sign * c; }
  return true;
}

/** Ray RAY against the sphere with centre p[c..c+2] and radius p[r]. True on a hit within RAY[6]: F[8] (0 inside), F[9..11]. */
function raySphere(p: Float64Array, c: number, r: number): boolean {
  const dx = RAY[3]!, dy = RAY[4]!, dz = RAY[5]!, rad = p[r]!;
  const mx = RAY[0]! - p[c]!, my = RAY[1]! - p[c + 1]!, mz = RAY[2]! - p[c + 2]!;
  const cc = mx * mx + my * my + mz * mz - rad * rad;
  if (cc <= 0) { F[8] = 0; F[9] = -dx; F[10] = -dy; F[11] = -dz; return true; }
  const b = mx * dx + my * dy + mz * dz;
  if (b > 0) return false;
  const disc = b * b - cc;
  if (disc < 0) return false;
  const t = -b - Math.sqrt(disc);
  if (t < 0 || t > RAY[6]!) return false;
  const inv = rad > 1e-12 ? 1 / rad : 0;
  F[8] = t; F[9] = (mx + dx * t) * inv; F[10] = (my + dy * t) * inv; F[11] = (mz + dz * t) * inv;
  return true;
}

/** Ray RAY against the capsule p[o..o+6] (A, B, radius). True on a hit within RAY[6]: F[8] (0 inside), F[9..11]. */
function rayCapsule(p: Float64Array, o: number): boolean {
  const ox = RAY[0]!, oy = RAY[1]!, oz = RAY[2]!, dx = RAY[3]!, dy = RAY[4]!, dz = RAY[5]!;
  const ax = p[o]!, ay = p[o + 1]!, az = p[o + 2]!, r = p[o + 6]!;
  const bax = p[o + 3]! - ax, bay = p[o + 4]! - ay, baz = p[o + 5]! - az;
  const baba = bax * bax + bay * bay + baz * baz;
  if (baba < 1e-12) return raySphere(p, o, o + 6);
  const oax = ox - ax, oay = oy - ay, oaz = oz - az;
  const bard = bax * dx + bay * dy + baz * dz, baoa = bax * oax + bay * oay + baz * oaz;
  const rdoa = dx * oax + dy * oay + dz * oaz, oaoa = oax * oax + oay * oay + oaz * oaz;
  // origin inside?
  let u0 = baoa / baba; u0 = u0 < 0 ? 0 : u0 > 1 ? 1 : u0;
  const ix = oax - bax * u0, iy = oay - bay * u0, iz = oaz - baz * u0;
  if (ix * ix + iy * iy + iz * iz <= r * r) { F[8] = 0; F[9] = -dx; F[10] = -dy; F[11] = -dz; return true; }
  const a = baba - bard * bard;
  if (a <= 1e-12 * baba) {
    // parallel to the axis: the nearer end cap
    if (!raySphere(p, o, o + 6)) return raySphere(p, o + 3, o + 6);
    const t = F[8]!, n0 = F[9]!, n1 = F[10]!, n2 = F[11]!;
    if (raySphere(p, o + 3, o + 6) && F[8]! < t) return true;
    F[8] = t; F[9] = n0; F[10] = n1; F[11] = n2;
    return true;
  }
  const b = baba * rdoa - baoa * bard, c = baba * oaoa - baoa * baoa - r * r * baba;
  const h = b * b - a * c;
  if (h < 0) return false;
  let t = (-b - Math.sqrt(h)) / a;
  const y = baoa + t * bard;
  if (!(y > 0 && y < baba)) {
    const ex = y <= 0 ? oax : oax - bax, ey = y <= 0 ? oay : oay - bay, ez = y <= 0 ? oaz : oaz - baz;
    const b2 = dx * ex + dy * ey + dz * ez, c2 = ex * ex + ey * ey + ez * ez - r * r, h2 = b2 * b2 - c2;
    if (h2 < 0) return false;
    t = -b2 - Math.sqrt(h2);
  }
  if (t < 0 || t > RAY[6]!) return false;
  const hx = oax + dx * t, hy = oay + dy * t, hz = oaz + dz * t;
  let u = (hx * bax + hy * bay + hz * baz) / baba; u = u < 0 ? 0 : u > 1 ? 1 : u;
  const nx = hx - bax * u, ny = hy - bay * u, nz = hz - baz * u;
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz), inv = len > 1e-12 ? 1 / len : 0;
  F[8] = t; F[9] = nx * inv; F[10] = ny * inv; F[11] = nz * inv;
  return true;
}

function resetHit(h: HitResult): void {
  h.hit = false; h.distance = 0; h.x = 0; h.y = 0; h.z = 0; h.nx = 0; h.ny = 0; h.nz = 0;
  h.surface = 'none'; h.flags = 0; h.layer = 0; h.entity = null; h.part = 'whole'; h.receiver = null; h.solidId = '';
}

interface PackedBvh { _roots: ArrayBuffer[] }

export class CollisionWorldImpl implements CollisionWorld {
  readonly stats = { rays: 0, capsules: 0, triangles: 0, boxes: 0, volumes: 0 };
  /** Beside the contract: the lineOfSight calls among `stats.rays`. The loop resets it with them; read it through __dbg.ext.core.collisionCounts(). */
  sightRays = 0;

  // ---- static set (BVH triangle order) ----
  private triCount = 0;
  private tpos = new Float32Array(0);          // 9 floats per triangle, BVH order
  private tFlags = new Uint8Array(0);
  private tSurf = new Uint8Array(0);
  private tSolid = new Uint16Array(0);         // index into solidOn; solidCount = "no solid"
  private solidIds: string[] = [];
  private solidCount = 0;
  private solidOn = new Uint8Array(1).fill(1);
  private readonly solidIndex = new Map<string, number>();
  /** ids switched off with setSolidEnabled; kept across setStatic so a rebuilt set keeps its state */
  private readonly solidOff = new Set<string>();
  private rootF32: Float32Array[] = [];
  private rootU32: Uint32Array[] = [];
  private rootU16: Uint16Array[] = [];
  private readonly stack = new Int32Array(STACK_SIZE);
  private readonly candTri = new Int32Array(MAX_CANDIDATES);
  /** the source arrays of ARCHITECTURE 6 (kept for debugging and tools) */
  positions = new Float32Array(0);
  index = new Uint32Array(0);
  bvh: MeshBVH | null = null;
  /** solids of the last setStatic whose triangles arrived wound inside-out and were flipped (0 for a correct builder) */
  flippedSolids = 0;

  // ---- raycastAll scratch ----
  private readonly crossT = new Float64Array(MAX_CROSSINGS);
  private readonly crossTri = new Int32Array(MAX_CROSSINGS);
  private readonly crossFace = new Int8Array(MAX_CROSSINGS);
  private solidInside = new Uint8Array(1);
  private solidSeen = new Uint8Array(1);
  private solidLastT = new Float64Array(1);
  private solidLastFace = new Int8Array(1);
  private readonly hitT = new Float64Array(HIT_CAP);
  private readonly hitKind = new Uint8Array(HIT_CAP);
  private readonly hitRef = new Int32Array(HIT_CAP);
  private hitCount = 0;

  // ---- dynamic boxes ----
  private readonly boxP = new Float64Array(MAX_BOXES * 8);   // cx cy cz hx hy hz cos sin
  private readonly boxUsed = new Uint8Array(MAX_BOXES);
  private readonly boxOn = new Uint8Array(MAX_BOXES);
  private readonly boxGen = new Uint32Array(MAX_BOXES);
  private readonly boxFlags = new Int32Array(MAX_BOXES);
  private readonly boxSurf = new Uint8Array(MAX_BOXES);
  private readonly boxEntity: (EntityRef | null)[] = new Array<EntityRef | null>(MAX_BOXES).fill(null);
  private boxHigh = 0;

  // ---- hit volumes ----
  private readonly volP = new Float64Array(MAX_VOLUMES * 8);
  private readonly volUsed = new Uint8Array(MAX_VOLUMES);
  private readonly volOn = new Uint8Array(MAX_VOLUMES);
  private readonly volPlaced = new Uint8Array(MAX_VOLUMES);
  private readonly volShape = new Uint8Array(MAX_VOLUMES);
  private readonly volGen = new Uint32Array(MAX_VOLUMES);
  private readonly volLayer = new Int32Array(MAX_VOLUMES);
  private readonly volFlags = new Int32Array(MAX_VOLUMES);
  private readonly volSurf = new Uint8Array(MAX_VOLUMES);
  private readonly volPriority = new Float64Array(MAX_VOLUMES);
  private readonly volEnt = new Int16Array(MAX_VOLUMES);
  private readonly volEntity: (EntityRef | null)[] = new Array<EntityRef | null>(MAX_VOLUMES).fill(null);
  private readonly volPart: HitPart[] = new Array<HitPart>(MAX_VOLUMES).fill('whole');
  private readonly volReceiver: (HitReceiver | null)[] = new Array<HitReceiver | null>(MAX_VOLUMES).fill(null);
  private volHigh = 0;
  // entities that own volumes (one slot per distinct EntityRef.id)
  private readonly entSlot = new Map<string, number>();
  private readonly entRefs = new Int16Array(MAX_VOLUMES);
  private readonly entId: string[] = new Array<string>(MAX_VOLUMES).fill('');
  private readonly entStamp = new Int32Array(MAX_VOLUMES);
  private readonly entBestVol = new Int16Array(MAX_VOLUMES);
  private readonly entBestT = new Float64Array(MAX_VOLUMES);
  private readonly entBestPri = new Float64Array(MAX_VOLUMES);
  private readonly touched = new Int16Array(MAX_VOLUMES);
  private stamp = 0;

  // =================================================================================
  // content
  // =================================================================================

  setStatic(positions: Float32Array, triSurface: Uint8Array, triFlags: Uint8Array, triSolid: Uint16Array, solidIds: readonly string[]): void {
    const n = Math.floor(positions.length / 9);
    if (positions.length !== n * 9 || triSurface.length < n || triFlags.length < n || triSolid.length < n) {
      throw new Error(`collision.setStatic: ${positions.length} floats need ${n} entries in every per-triangle array (got ${triSurface.length}, ${triFlags.length}, ${triSolid.length})`);
    }
    this.clearStatic();
    const ns = solidIds.length;
    this.solidIds = solidIds.slice();
    this.solidCount = ns;
    this.solidOn = new Uint8Array(ns + 1).fill(1);
    this.solidInside = new Uint8Array(ns + 1);
    this.solidSeen = new Uint8Array(ns + 1);
    this.solidLastT = new Float64Array(ns + 1);
    this.solidLastFace = new Int8Array(ns + 1);
    for (let i = 0; i < ns; i++) {
      const id = this.solidIds[i]!;
      this.solidIndex.set(id, i);
      if (this.solidOff.has(id)) this.solidOn[i] = 0;
    }
    if (n === 0) return;

    const pos = new Float32Array(positions);            // own copy: the builder may reuse its buffer
    const idx = new Uint32Array(n * 3);
    for (let i = 0; i < idx.length; i++) idx[i] = i;
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(pos, 3));
    geometry.setIndex(new BufferAttribute(idx, 1));
    // The BVH reorders `idx` in place (it is not `indirect`), so per-triangle data is looked up through the vertex index.
    const bvh = new MeshBVH(geometry, { strategy: CENTER, targetLeafSize: 6, maxDepth: 40, indirect: false, setBoundingBox: false, verbose: false });
    const roots = (bvh as unknown as PackedBvh)._roots;
    if (!Array.isArray(roots) || roots.length === 0) throw new Error('collision.setStatic: three-mesh-bvh has no packed roots (unsupported version)');

    const tpos = new Float32Array(n * 9), tFlags = new Uint8Array(n), tSurf = new Uint8Array(n), tSolid = new Uint16Array(n);
    for (let t = 0; t < n; t++) {
      const ia = idx[t * 3]!, ib = idx[t * 3 + 1]!, ic = idx[t * 3 + 2]!, src = Math.floor(ia / 3);
      tpos[t * 9] = pos[ia * 3]!; tpos[t * 9 + 1] = pos[ia * 3 + 1]!; tpos[t * 9 + 2] = pos[ia * 3 + 2]!;
      tpos[t * 9 + 3] = pos[ib * 3]!; tpos[t * 9 + 4] = pos[ib * 3 + 1]!; tpos[t * 9 + 5] = pos[ib * 3 + 2]!;
      tpos[t * 9 + 6] = pos[ic * 3]!; tpos[t * 9 + 7] = pos[ic * 3 + 1]!; tpos[t * 9 + 8] = pos[ic * 3 + 2]!;
      tFlags[t] = triFlags[src]!;
      const s = triSurface[src]!;
      tSurf[t] = s < SURFACES.length ? s : SURFACE_NONE;
      const so = triSolid[src]!;
      tSolid[t] = so < ns ? so : ns;
    }
    // Winding guard: "in front of a face" must mean "outside the solid". A CLOSED solid (its area
    // vectors sum to zero) wound inside-out has a negative signed volume about its own centroid; its
    // triangles are flipped. Open sheets (sculpted terrain) cannot be checked and are trusted.
    const vol = new Float64Array(ns + 1), cen = new Float64Array((ns + 1) * 3), cnt = new Float64Array(ns + 1);
    const areaVec = new Float64Array((ns + 1) * 3), areaSum = new Float64Array(ns + 1);
    for (let t = 0; t < n; t++) {
      const s = tSolid[t]!, o = t * 9;
      cen[s * 3] = cen[s * 3]! + tpos[o]! + tpos[o + 3]! + tpos[o + 6]!;
      cen[s * 3 + 1] = cen[s * 3 + 1]! + tpos[o + 1]! + tpos[o + 4]! + tpos[o + 7]!;
      cen[s * 3 + 2] = cen[s * 3 + 2]! + tpos[o + 2]! + tpos[o + 5]! + tpos[o + 8]!;
      cnt[s] = cnt[s]! + 3;
    }
    for (let t = 0; t < n; t++) {
      const s = tSolid[t]!, o = t * 9, k = 1 / cnt[s]!;
      const gx = cen[s * 3]! * k, gy = cen[s * 3 + 1]! * k, gz = cen[s * 3 + 2]! * k;
      const ax = tpos[o]! - gx, ay = tpos[o + 1]! - gy, az = tpos[o + 2]! - gz;
      const bx = tpos[o + 3]! - gx, by = tpos[o + 4]! - gy, bz = tpos[o + 5]! - gz;
      const cx = tpos[o + 6]! - gx, cy = tpos[o + 7]! - gy, cz = tpos[o + 8]! - gz;
      vol[s] = vol[s]! + ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
      const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay), ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az), nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      areaVec[s * 3] = areaVec[s * 3]! + nx; areaVec[s * 3 + 1] = areaVec[s * 3 + 1]! + ny; areaVec[s * 3 + 2] = areaVec[s * 3 + 2]! + nz;
      areaSum[s] = areaSum[s]! + Math.sqrt(nx * nx + ny * ny + nz * nz);
    }
    let flipped = 0;
    for (let s = 0; s < ns; s++) {
      const open = Math.hypot(areaVec[s * 3]!, areaVec[s * 3 + 1]!, areaVec[s * 3 + 2]!) > 1e-3 * areaSum[s]!;
      if (open || vol[s]! >= 0) vol[s] = 0; else flipped++;
    }
    if (flipped > 0) {
      for (let t = 0; t < n; t++) {
        const s = tSolid[t]!;
        if (s >= ns || vol[s]! >= 0) continue;
        const o = t * 9;
        for (let k = 0; k < 3; k++) { const v = tpos[o + 3 + k]!; tpos[o + 3 + k] = tpos[o + 6 + k]!; tpos[o + 6 + k] = v; }
      }
    }
    this.flippedSolids = flipped;
    const f32: Float32Array[] = [], u32: Uint32Array[] = [], u16: Uint16Array[] = [];
    let leafTris = 0;
    for (const root of roots) {
      const a = new Float32Array(root), b = new Uint32Array(root), c = new Uint16Array(root);
      f32.push(a); u32.push(b); u16.push(c);
      // walk once: proves the packed layout is the one this file reads
      const stack = this.stack; let sp = 0; stack[sp++] = 0;
      while (sp > 0) {
        const node = stack[--sp]!;
        if (node < 0 || node + UINT32_PER_NODE > b.length) throw new Error('collision.setStatic: unexpected three-mesh-bvh node layout');
        if (c[node * 2 + 15] === LEAF_FLAG) leafTris += c[node * 2 + 14]!;
        else {
          if (sp + 2 > STACK_SIZE) throw new Error('collision.setStatic: BVH deeper than the traversal stack');
          stack[sp++] = node + b[node + 6]! * UINT32_PER_NODE; stack[sp++] = node + UINT32_PER_NODE;
        }
      }
    }
    if (leafTris !== n) throw new Error(`collision.setStatic: BVH leaves hold ${leafTris} triangles, expected ${n} (unsupported three-mesh-bvh layout)`);

    this.positions = pos; this.index = idx; this.bvh = bvh;
    this.tpos = tpos; this.tFlags = tFlags; this.tSurf = tSurf; this.tSolid = tSolid;
    this.rootF32 = f32; this.rootU32 = u32; this.rootU16 = u16;
    this.triCount = n;
    this.stats.triangles = n;
  }

  clearStatic(): void {
    this.triCount = 0; this.stats.triangles = 0;
    this.tpos = new Float32Array(0); this.tFlags = new Uint8Array(0); this.tSurf = new Uint8Array(0); this.tSolid = new Uint16Array(0);
    this.positions = new Float32Array(0); this.index = new Uint32Array(0); this.bvh = null;
    this.rootF32 = []; this.rootU32 = []; this.rootU16 = [];
    this.solidIds = []; this.solidCount = 0; this.solidIndex.clear();
    this.solidOn = new Uint8Array(1).fill(1);
  }

  setSolidEnabled(solidId: string, enabled: boolean): void {
    if (enabled) this.solidOff.delete(solidId); else this.solidOff.add(solidId);
    const i = this.solidIndex.get(solidId);
    if (i !== undefined) this.solidOn[i] = enabled ? 1 : 0;
  }

  addBox(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, rotYRad: number, surface: SurfaceType, flags: number, entity: EntityRef | null): ColliderHandle {
    let slot = -1;
    for (let i = 0; i < MAX_BOXES; i++) if (this.boxUsed[i] === 0) { slot = i; break; }
    if (slot < 0) throw new Error(`collision.addBox: more than ${MAX_BOXES} boxes`);
    const o = slot * 8, p = this.boxP;
    p[o] = cx; p[o + 1] = cy; p[o + 2] = cz; p[o + 3] = Math.abs(hx); p[o + 4] = Math.abs(hy); p[o + 5] = Math.abs(hz);
    p[o + 6] = Math.cos(rotYRad); p[o + 7] = Math.sin(rotYRad);
    this.boxUsed[slot] = 1; this.boxOn[slot] = 1;
    this.boxFlags[slot] = flags; this.boxSurf[slot] = surfaceIndex(surface); this.boxEntity[slot] = entity;
    const gen = (this.boxGen[slot]! + 1) & 0xfffff || 1;
    this.boxGen[slot] = gen;
    if (slot >= this.boxHigh) this.boxHigh = slot + 1;
    this.stats.boxes++;
    return gen * 256 + slot;
  }

  private boxSlot(h: ColliderHandle): number {
    const slot = h & 0xff;
    return slot < MAX_BOXES && this.boxUsed[slot] === 1 && this.boxGen[slot] === (h - slot) / 256 ? slot : -1;
  }

  setBoxTransform(h: ColliderHandle, cx: number, cy: number, cz: number, rotYRad: number): void {
    const slot = this.boxSlot(h);
    if (slot < 0) return;
    const o = slot * 8, p = this.boxP;
    p[o] = cx; p[o + 1] = cy; p[o + 2] = cz; p[o + 6] = Math.cos(rotYRad); p[o + 7] = Math.sin(rotYRad);
  }

  setBoxEnabled(h: ColliderHandle, enabled: boolean): void {
    const slot = this.boxSlot(h);
    if (slot >= 0) this.boxOn[slot] = enabled ? 1 : 0;
  }

  removeBox(h: ColliderHandle): void {
    const slot = this.boxSlot(h);
    if (slot < 0) return;
    this.boxUsed[slot] = 0; this.boxOn[slot] = 0; this.boxEntity[slot] = null;
    while (this.boxHigh > 0 && this.boxUsed[this.boxHigh - 1] === 0) this.boxHigh--;
    this.stats.boxes--;
  }

  // =================================================================================
  // hit volumes
  // =================================================================================

  addVolume(desc: HitVolumeDesc): VolumeHandle {
    let slot = -1;
    for (let i = 0; i < MAX_VOLUMES; i++) if (this.volUsed[i] === 0) { slot = i; break; }
    if (slot < 0) throw new Error(`collision.addVolume: more than ${MAX_VOLUMES} volumes`);
    const id = desc.entity.id;
    let ent = this.entSlot.get(id);
    if (ent === undefined) {
      ent = -1;
      for (let i = 0; i < MAX_VOLUMES; i++) if (this.entRefs[i] === 0) { ent = i; break; }
      this.entSlot.set(id, ent); this.entId[ent] = id;
    }
    this.entRefs[ent] = this.entRefs[ent]! + 1;
    this.volUsed[slot] = 1; this.volOn[slot] = 1; this.volPlaced[slot] = 0;
    this.volShape[slot] = desc.shape === 'sphere' ? SHAPE_SPHERE : desc.shape === 'capsule' ? SHAPE_CAPSULE : SHAPE_BOX;
    this.volLayer[slot] = desc.layer; this.volFlags[slot] = desc.flags; this.volSurf[slot] = surfaceIndex(desc.surface);
    this.volPriority[slot] = desc.priority; this.volEnt[slot] = ent;
    this.volEntity[slot] = desc.entity; this.volPart[slot] = desc.part; this.volReceiver[slot] = desc.receiver;
    const gen = (this.volGen[slot]! + 1) & 0xfffff || 1;
    this.volGen[slot] = gen;
    if (slot >= this.volHigh) this.volHigh = slot + 1;
    this.stats.volumes++;
    return gen * 256 + slot;
  }

  private volSlot(h: VolumeHandle): number {
    const slot = h & 0xff;
    return this.volUsed[slot] === 1 && this.volGen[slot] === (h - slot) / 256 ? slot : -1;
  }

  setSphere(h: VolumeHandle, x: number, y: number, z: number, radius: number): void {
    const slot = this.volSlot(h);
    if (slot < 0) return;
    const o = slot * 8, p = this.volP;
    p[o] = x; p[o + 1] = y; p[o + 2] = z; p[o + 3] = radius;
    this.volShape[slot] = SHAPE_SPHERE; this.volPlaced[slot] = 1;
  }

  setCapsule(h: VolumeHandle, ax: number, ay: number, az: number, bx: number, by: number, bz: number, radius: number): void {
    const slot = this.volSlot(h);
    if (slot < 0) return;
    const o = slot * 8, p = this.volP;
    p[o] = ax; p[o + 1] = ay; p[o + 2] = az; p[o + 3] = bx; p[o + 4] = by; p[o + 5] = bz; p[o + 6] = radius;
    this.volShape[slot] = SHAPE_CAPSULE; this.volPlaced[slot] = 1;
  }

  setVolumeBox(h: VolumeHandle, cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, rotYRad: number): void {
    const slot = this.volSlot(h);
    if (slot < 0) return;
    const o = slot * 8, p = this.volP;
    p[o] = cx; p[o + 1] = cy; p[o + 2] = cz; p[o + 3] = Math.abs(hx); p[o + 4] = Math.abs(hy); p[o + 5] = Math.abs(hz);
    p[o + 6] = Math.cos(rotYRad); p[o + 7] = Math.sin(rotYRad);
    this.volShape[slot] = SHAPE_BOX; this.volPlaced[slot] = 1;
  }

  setVolumeEnabled(h: VolumeHandle, enabled: boolean): void {
    const slot = this.volSlot(h);
    if (slot >= 0) this.volOn[slot] = enabled ? 1 : 0;
  }

  removeVolume(h: VolumeHandle): void {
    const slot = this.volSlot(h);
    if (slot < 0) return;
    const ent = this.volEnt[slot]!;
    this.entRefs[ent] = this.entRefs[ent]! - 1;
    if (this.entRefs[ent] === 0) { this.entSlot.delete(this.entId[ent]!); this.entId[ent] = ''; }
    this.volUsed[slot] = 0; this.volOn[slot] = 0; this.volPlaced[slot] = 0;
    this.volEntity[slot] = null; this.volReceiver[slot] = null;
    while (this.volHigh > 0 && this.volUsed[this.volHigh - 1] === 0) this.volHigh--;
    this.stats.volumes--;
  }

  // =================================================================================
  // movement
  // =================================================================================

  resolveCapsule(x: number, y: number, z: number, radius: number, height: number, walkableCos: number, out: CapsuleResolve): void {
    C[0] = x; C[1] = y; C[2] = z; C[11] = walkableCos; C[12] = radius; C[13] = height;
    this.resolveImpl(out);
  }

  private resolveImpl(out: CapsuleResolve): void {
    this.stats.capsules++;
    C[4] = 0; C[5] = 1; C[6] = 0; C[7] = 0; C[8] = 0; C[9] = 0; C[10] = 0;
    J[J_GROUNDED] = 0; J[J_WALL] = 0; J[J_CEIL] = 0; J[J_GSURF] = SURFACE_NONE; J[J_WFLAGS] = 0; J[J_PRIOR] = 0;
    let settled = false, count = 0;
    for (let gather = 0; gather < MAX_GATHERS && !settled; gather++) {
      const gx = C[0]!, gy = C[1]!, gz = C[2]!;
      count = this.triCount > 0 ? this.gatherCapsule() : 0;
      for (let iter = 0; iter < MAX_PUSHES; iter++) {
        if (!this.capsuleStep(count, 1)) { settled = true; break; }
        const mx = C[0]! - gx, my = C[1]! - gy, mz = C[2]! - gz;
        if (mx > GATHER_SLOP || mx < -GATHER_SLOP || my > GATHER_SLOP || my < -GATHER_SLOP || mz > GATHER_SLOP || mz < -GATHER_SLOP) break;   // left the gathered region
      }
    }
    if (!settled) this.capsuleStep(count, 0);                           // out of budget: still report the ground under the final position
    out.x = C[0]!; out.y = C[1]!; out.z = C[2]!;
    out.grounded = J[J_GROUNDED] === 1;
    out.groundNx = C[4]!; out.groundNy = C[5]!; out.groundNz = C[6]!;
    out.groundSurface = SURFACES[J[J_GSURF]!]!;
    out.hitWall = J[J_WALL] === 1;
    out.wallNx = C[8]!; out.wallNy = C[9]!; out.wallNz = C[10]!;
    out.wallFlags = J[J_WFLAGS]!;
    out.hitCeiling = J[J_CEIL] === 1;
  }

  /** Static triangles whose bounds touch the bounds of the capsule in C grown by the ground skin and GATHER_SLOP. Fills candTri; returns the count. */
  private gatherCapsule(): number {
    const tpos = this.tpos, tSolid = this.tSolid, solidOn = this.solidOn, stack = this.stack, cand = this.candTri;
    const x = C[0]!, y = C[1]!, z = C[2]!, r = C[12]!, h = C[13]! > 2 * r ? C[13]! : 2 * r;
    const m = GROUND_SKIN + GATHER_SLOP;
    const qminx = x - r - m, qmaxx = x + r + m, qminy = y - m, qmaxy = y + h + m, qminz = z - r - m, qmaxz = z + r + m;
    let n = 0;
    for (let ri = 0; ri < this.rootF32.length; ri++) {
      const f32 = this.rootF32[ri]!, u32 = this.rootU32[ri]!, u16 = this.rootU16[ri]!;
      let sp = 0; stack[sp++] = 0;
      while (sp > 0) {
        const node = stack[--sp]!;
        if (f32[node]! > qmaxx || f32[node + 3]! < qminx || f32[node + 1]! > qmaxy || f32[node + 4]! < qminy || f32[node + 2]! > qmaxz || f32[node + 5]! < qminz) continue;
        if (u16[node * 2 + 15] !== LEAF_FLAG) { stack[sp++] = node + u32[node + 6]! * UINT32_PER_NODE; stack[sp++] = node + UINT32_PER_NODE; continue; }
        const first = u32[node + 6]!, end = first + u16[node * 2 + 14]!;
        for (let t = first; t < end; t++) {
          if (solidOn[tSolid[t]!] === 0) continue;
          const o = t * 9;
          const ax = tpos[o]!, ay = tpos[o + 1]!, az = tpos[o + 2]!, bx = tpos[o + 3]!, by = tpos[o + 4]!, bz = tpos[o + 5]!, cx = tpos[o + 6]!, cy = tpos[o + 7]!, cz = tpos[o + 8]!;
          if ((ax < bx ? (ax < cx ? ax : cx) : (bx < cx ? bx : cx)) > qmaxx || (ax > bx ? (ax > cx ? ax : cx) : (bx > cx ? bx : cx)) < qminx
            || (ay < by ? (ay < cy ? ay : cy) : (by < cy ? by : cy)) > qmaxy || (ay > by ? (ay > cy ? ay : cy) : (by > cy ? by : cy)) < qminy
            || (az < bz ? (az < cz ? az : cz) : (bz < cz ? bz : cz)) > qmaxz || (az > bz ? (az > cz ? az : cz) : (bz > cz ? bz : cz)) < qminz) continue;
          if (n < MAX_CANDIDATES) cand[n++] = t;
        }
      }
    }
    return n;
  }

  /**
   * Evaluates every gathered triangle and every enabled box against the capsule in C, records the
   * ground under it (nearest walkable contact inside the skin), and, when `apply` is 1, pushes the
   * capsule out of the DEEPEST contact only. Deepest-first is what keeps the interior edges of a
   * triangulated wall or floor from pushing sideways: once the face itself has pushed, its
   * neighbour's edge no longer penetrates. Returns true when it pushed.
   */
  private capsuleStep(count: number, apply: number): boolean {
    const tpos = this.tpos, tFlags = this.tFlags, tSurf = this.tSurf, cand = this.candTri;
    const cos = C[11]!, r = C[12]!, seg = C[13]! - 2 * r > 0 ? C[13]! - 2 * r : 0;
    const sx = C[0]!, sz = C[2]!, y0 = C[1]! + r, y1 = y0 + seg;
    const rs = r + GROUND_SKIN, rs2 = rs * rs, rPen = r - PEN_EPS;
    S[0] = sx; S[1] = y0; S[2] = y1; S[3] = sz;
    let depthBest = PEN_EPS, bnx = 0, bny = 0, bnz = 0, bFlags = 0, found = false, bFace = false;
    let backDist = Infinity, kx = 0, ky = 0, kz = 0, kFlags = 0;
    let gDist = Infinity, gnx = 0, gny = 1, gnz = 0, gSurf = SURFACE_NONE, nk = 0;
    for (let i = 0; i < count; i++) {
      const t = cand[i]!, o = t * 9;
      const ax = tpos[o]!, ay = tpos[o + 1]!, az = tpos[o + 2]!, bx = tpos[o + 3]!, by = tpos[o + 4]!, bz = tpos[o + 5]!, cx = tpos[o + 6]!, cy = tpos[o + 7]!, cz = tpos[o + 8]!;
      T[0] = ax; T[1] = ay; T[2] = az; T[3] = bx; T[4] = by; T[5] = bz; T[6] = cx; T[7] = cy; T[8] = cz;
      closestSegTri();
      const d2 = F[13]!;
      if (d2 >= rs2) continue;
      // face normal (winding)
      const e1x = bx - ax, e1y = by - ay, e1z = bz - az, e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
      let fx = e1y * e2z - e1z * e2y, fy = e1z * e2x - e1x * e2z, fz = e1x * e2y - e1y * e2x;
      const fl = Math.sqrt(fx * fx + fy * fy + fz * fz);
      if (fl < 1e-12) continue;                          // degenerate triangle
      fx /= fl; fy /= fl; fz /= fl;
      let nx: number, ny: number, nz: number, depth: number, dist: number, face = true;
      if (d2 > 1e-14) {
        dist = Math.sqrt(d2);
        const inv = 1 / dist;
        nx = (sx - F[0]!) * inv; ny = (F[3]! - F[1]!) * inv; nz = (sz - F[2]!) * inv;
        const facing = nx * fx + ny * fy + nz * fz;
        if (facing * dist < -1e-7) {
          // The axis is BEHIND this face. Outside a closed solid that never needs an answer (a face
          // the capsule is in front of holds the same closest point), so the contact is dropped:
          // this is what keeps a thin wall's far face from pulling the capsule through. The one
          // exception is a capsule that starts inside the solid: it shows up as a square-on back
          // contact, used only when no front contact is left to push.
          if (facing < -0.99 && dist < rPen && dist < backDist) { backDist = dist; kx = fx; ky = fy; kz = fz; kFlags = tFlags[t]!; }
          continue;
        }
        // square-on to the face: use the face normal itself, so a surface is classified the same way on every call
        if (facing > 0.999999) { nx = fx; ny = fy; nz = fz; } else face = false;
        depth = r - dist;
      } else {
        // The axis passes through the triangle: leave by the side that needs the smaller push.
        const s0 = fx * (sx - ax) + fy * (y0 - ay) + fz * (sz - az), s1 = s0 + fy * seg;
        const lo = s0 < s1 ? s0 : s1, hi = s0 < s1 ? s1 : s0;
        if (-lo <= hi) { nx = fx; ny = fy; nz = fz; depth = r - lo; } else { nx = -fx; ny = -fy; nz = -fz; depth = r + hi; }
        dist = 0;
      }
      // Ground needs a walkable FACE as well as a walkable contact: the edge of a too-steep triangle
      // (the diagonal inside a steep ramp) can point more upward than the ramp does. A real lip is
      // still ground through the walkable face that shares the edge.
      if (ny > cos && (fy > cos || dist === 0) && dist < gDist) { gDist = dist; gnx = nx; gny = ny; gnz = nz; gSurf = tSurf[t]!; }
      if (nk < MAX_CONTACTS) { const q = nk * 3; K[q] = nx; K[q + 1] = ny; K[q + 2] = nz; nk++; }
      if (depth > depthBest) { depthBest = depth; bnx = nx; bny = ny; bnz = nz; bFlags = tFlags[t]!; found = true; bFace = face; }
    }
    const p = this.boxP;
    for (let b = 0; b < this.boxHigh; b++) {
      if (this.boxOn[b] === 0) continue;
      const o = b * 8, hx = p[o + 3]!, hy = p[o + 4]!, hz = p[o + 5]!, c = p[o + 6]!, s = p[o + 7]!;
      const wx = sx - p[o]!, wz = sz - p[o + 2]!;
      const lx = wx * c - wz * s, lz = wx * s + wz * c;
      const ex = lx > hx ? lx - hx : lx < -hx ? lx + hx : 0, ez = lz > hz ? lz - hz : lz < -hz ? lz + hz : 0;
      if (ex > rs || ex < -rs || ez > rs || ez < -rs) continue;
      const b0 = y0 - p[o + 1]!, b1 = b0 + seg;          // the axis, relative to the box centre
      const ey = b0 > hy ? b0 - hy : b1 < -hy ? b1 + hy : 0;
      const d2 = ex * ex + ey * ey + ez * ez;
      if (d2 >= rs2) continue;
      let lnx: number, ny: number, lnz: number, depth: number, dist: number;
      if (d2 > 1e-14) {
        dist = Math.sqrt(d2);
        const inv = 1 / dist;
        lnx = ex * inv; ny = ey * inv; lnz = ez * inv;
        depth = r - dist;
      } else {
        // the axis is inside the box: leave through the nearest face
        let m = hx - lx; lnx = 1; ny = 0; lnz = 0;
        if (lx + hx < m) { m = lx + hx; lnx = -1; }
        if (hz - lz < m) { m = hz - lz; lnx = 0; lnz = 1; }
        if (lz + hz < m) { m = lz + hz; lnx = 0; lnz = -1; }
        if (hy - b0 < m) { m = hy - b0; lnx = 0; lnz = 0; ny = 1; }
        if (b1 + hy < m) { m = b1 + hy; lnx = 0; lnz = 0; ny = -1; }
        depth = m + r; dist = 0;
      }
      const nx = lnx * c + lnz * s, nz = -lnx * s + lnz * c;
      if (ny > cos && dist < gDist) { gDist = dist; gnx = nx; gny = ny; gnz = nz; gSurf = this.boxSurf[b]!; }
      if (nk < MAX_CONTACTS) { const q = nk * 3; K[q] = nx; K[q + 1] = ny; K[q + 2] = nz; nk++; }
      if (depth > depthBest) { depthBest = depth; bnx = nx; bny = ny; bnz = nz; bFlags = this.boxFlags[b]!; found = true; bFace = false; }
    }
    J[J_GROUNDED] = gDist < Infinity ? 1 : 0;
    C[4] = gnx; C[5] = gny; C[6] = gnz; J[J_GSURF] = gSurf;
    if (apply === 0) return false;
    if (!found) {
      if (backDist === Infinity) return false;
      // nothing in front is left to push and the axis is still behind a face: the capsule began inside the solid
      depthBest = r + backDist; bnx = kx; bny = ky; bnz = kz; bFlags = kFlags; bFace = true;
    }
    if (bny > cos) C[1] = C[1]! + depthBest / bny;      // walkable: straight up, so nothing slides on a ramp
    else {
      // unit direction and length of the push
      let ux = bnx, uy = bny, uz = bnz, len = depthBest;
      if (bFace && bny > 0) {
        // The face of a slope too steep to walk: leave it sideways, like a wall. Pushing along its
        // normal would lift the capsule, and a body pressed into the slope would climb it.
        const h = Math.sqrt(bnx * bnx + bnz * bnz);
        ux = bnx / h; uy = 0; uz = bnz / h; len = depthBest / h;
      }
      // Surfaces that face each other (a corner, a wedge, a wall met while sliding along another):
      // leaving one straight along its normal would push into the other, and in an acute wedge the
      // two would bat the capsule through one of them. So the push slides along the surface it would
      // enter most squarely: every other contact of this step, and the last surface pushed out of.
      // Same clearance gained from the one, none lost on the other.
      let px = 0, py = 0, pz = 0, dot = -1e-3;
      for (let i = 0; i < nk; i++) {
        const q = i * 3, d = ux * K[q]! + uy * K[q + 1]! + uz * K[q + 2]!;
        if (d < dot) { dot = d; px = K[q]!; py = K[q + 1]!; pz = K[q + 2]!; }
      }
      if (J[J_PRIOR] === 1) {
        const d = ux * W[0]! + uy * W[1]! + uz * W[2]!;
        if (d < dot) { dot = d; px = W[0]!; py = W[1]!; pz = W[2]!; }
      }
      const k = 1 - dot * dot;
      if (dot < -1e-3 && k > WEDGE_MIN) {
        const scale = len / k;
        C[0] = sx + (ux - dot * px) * scale; C[1] = C[1]! + (uy - dot * py) * scale; C[2] = sz + (uz - dot * pz) * scale;
      } else { C[0] = sx + ux * len; C[1] = C[1]! + uy * len; C[2] = sz + uz * len; }
      W[0] = ux; W[1] = uy; W[2] = uz; J[J_PRIOR] = 1;
      if (bny < -cos) J[J_CEIL] = 1;
      else {
        if (J[J_WALL] === 0 || depthBest > C[7]!) { C[7] = depthBest; C[8] = bnx; C[9] = bny; C[10] = bnz; J[J_WFLAGS] = bFlags; }
        J[J_WALL] = 1;
      }
    }
    return true;
  }

  groundHeight(x: number, y: number, z: number, maxDrop: number, outHit?: HitResult): number {
    RAY[0] = x; RAY[1] = y; RAY[2] = z; RAY[3] = 0; RAY[4] = -1; RAY[5] = 0; RAY[6] = maxDrop;
    this.groundImpl(outHit);
    return F[14]!;
  }

  /** Result in F[14] (NaN when nothing is within reach). */
  private groundImpl(outHit: HitResult | undefined): void {
    this.stats.rays++;
    const maxDrop = RAY[6]!;
    let kind = -1, ref = -1;
    if (this.triCount > 0) {
      const tri = this.rayStatic(0, MODE_NEAREST);
      if (tri >= 0) { RAY[6] = F[8]!; kind = KIND_STATIC; ref = tri; }
    }
    const p = this.boxP;
    for (let b = 0; b < this.boxHigh; b++) {
      if (this.boxOn[b] === 0) continue;
      if (rayObb(p, b * 8)) { RAY[6] = F[8]!; kind = KIND_BOX; ref = b; }
    }
    const best = RAY[6]!;
    if (kind < 0) F[14] = NaN; else F[14] = RAY[1]! - best;     // two stores, not `c ? NaN : v`: that phi would be a boxed number
    if (outHit !== undefined) {
      if (kind === KIND_STATIC) { F[8] = best; this.fillStatic(outHit, ref); } else if (kind === KIND_BOX) this.fillBox(outHit, ref);
      else { RAY[6] = maxDrop; this.fillMiss(outHit); }
    }
  }

  capsuleFree(x: number, y: number, z: number, radius: number, height: number): boolean {
    C[0] = x; C[1] = y; C[2] = z; C[12] = radius; C[13] = height;
    return this.freeImpl();
  }

  private freeImpl(): boolean {
    this.stats.capsules++;
    const x = C[0]!, y = C[1]!, z = C[2]!, radius = C[12]!, height = C[13]!;
    const r = radius - FREE_EPS > 0 ? radius - FREE_EPS : 0, r2 = r * r;
    const seg = height - 2 * radius > 0 ? height - 2 * radius : 0;
    const y0 = y + radius, y1 = y0 + seg;
    S[0] = x; S[1] = y0; S[2] = y1; S[3] = z;
    const qminx = x - r, qmaxx = x + r, qminy = y0 - r, qmaxy = y1 + r, qminz = z - r, qmaxz = z + r;
    const tpos = this.tpos, tSolid = this.tSolid, solidOn = this.solidOn, stack = this.stack;
    for (let ri = 0; ri < this.rootF32.length; ri++) {
      const f32 = this.rootF32[ri]!, u32 = this.rootU32[ri]!, u16 = this.rootU16[ri]!;
      let sp = 0; stack[sp++] = 0;
      while (sp > 0) {
        const node = stack[--sp]!;
        if (f32[node]! > qmaxx || f32[node + 3]! < qminx || f32[node + 1]! > qmaxy || f32[node + 4]! < qminy || f32[node + 2]! > qmaxz || f32[node + 5]! < qminz) continue;
        if (u16[node * 2 + 15] !== LEAF_FLAG) { stack[sp++] = node + u32[node + 6]! * UINT32_PER_NODE; stack[sp++] = node + UINT32_PER_NODE; continue; }
        const first = u32[node + 6]!, end = first + u16[node * 2 + 14]!;
        for (let t = first; t < end; t++) {
          if (solidOn[tSolid[t]!] === 0) continue;
          const o = t * 9;
          const ax = tpos[o]!, ay = tpos[o + 1]!, az = tpos[o + 2]!, bx = tpos[o + 3]!, by = tpos[o + 4]!, bz = tpos[o + 5]!, cx = tpos[o + 6]!, cy = tpos[o + 7]!, cz = tpos[o + 8]!;
          if ((ax < bx ? (ax < cx ? ax : cx) : (bx < cx ? bx : cx)) > qmaxx || (ax > bx ? (ax > cx ? ax : cx) : (bx > cx ? bx : cx)) < qminx
            || (ay < by ? (ay < cy ? ay : cy) : (by < cy ? by : cy)) > qmaxy || (ay > by ? (ay > cy ? ay : cy) : (by > cy ? by : cy)) < qminy
            || (az < bz ? (az < cz ? az : cz) : (bz < cz ? bz : cz)) > qmaxz || (az > bz ? (az > cz ? az : cz) : (bz > cz ? bz : cz)) < qminz) continue;
          T[0] = ax; T[1] = ay; T[2] = az; T[3] = bx; T[4] = by; T[5] = bz; T[6] = cx; T[7] = cy; T[8] = cz;
          closestSegTri();
          if (F[13]! < r2) return false;
        }
      }
    }
    const p = this.boxP;
    for (let b = 0; b < this.boxHigh; b++) {
      if (this.boxOn[b] === 0) continue;
      const o = b * 8, hx = p[o + 3]!, hy = p[o + 4]!, hz = p[o + 5]!, c = p[o + 6]!, s = p[o + 7]!;
      const wx = x - p[o]!, wz = z - p[o + 2]!;
      const lx = wx * c - wz * s, lz = wx * s + wz * c;
      const ex = lx > hx ? lx - hx : lx < -hx ? lx + hx : 0, ez = lz > hz ? lz - hz : lz < -hz ? lz + hz : 0;
      const b0 = y0 - p[o + 1]!, b1 = b0 + seg;
      const ey = b0 > hy ? b0 - hy : b1 < -hy ? b1 + hy : 0;
      if (ex * ex + ey * ey + ez * ez < r2) return false;
    }
    if (this.triCount === 0) return true;
    // Wholly inside thick geometry no surface is within reach: a ray straight down from the middle of
    // the capsule leaves a closed solid an odd number of times exactly when it starts inside it.
    RAY[0] = x; RAY[1] = y0 + seg * 0.5; RAY[2] = z; RAY[3] = 0; RAY[4] = -1; RAY[5] = 0; RAY[6] = 1e5;
    const n = this.rayStatic(0, MODE_ALL);
    const crossT = this.crossT, crossTri = this.crossTri, crossFace = this.crossFace;
    const inside = this.solidInside, seen = this.solidSeen, lastT = this.solidLastT, lastFace = this.solidLastFace, none = this.solidCount;
    for (let i = 0; i < n; i++) { const so = tSolid[crossTri[i]!]!; inside[so] = 0; seen[so] = 0; }
    let odd = 0;
    for (let i = 0; i < n; i++) {
      const so = tSolid[crossTri[i]!]!, t = crossT[i]!, face = crossFace[i]!;
      if (so === none) continue;
      if (seen[so] === 1 && t - lastT[so]! < SAME_T && face === lastFace[so]) continue;
      seen[so] = 1; lastT[so] = t; lastFace[so] = face;
      if (inside[so] === 0) { inside[so] = 1; odd++; } else { inside[so] = 0; odd--; }
    }
    return odd === 0;
  }

  // =================================================================================
  // rays
  // =================================================================================

  /**
   * Ray RAY against the static triangles (double-sided), up to RAY[6]. Triangles whose flags intersect
   * `skipFlags` and triangles of switched-off solids are ignored.
   *  MODE_NEAREST: returns the triangle (distance in F[8]) or -1.
   *  MODE_ANY:     returns 0 as soon as anything is hit, else -1.
   *  MODE_ALL:     keeps the MAX_CROSSINGS nearest crossings, sorted, in crossT / crossTri / crossFace; returns their count.
   */
  private rayStatic(skipFlags: number, mode: number): number {
    const tpos = this.tpos, tFlags = this.tFlags, tSolid = this.tSolid, solidOn = this.solidOn, stack = this.stack;
    const crossT = this.crossT, crossTri = this.crossTri, crossFace = this.crossFace;
    const ox = RAY[0]!, oy = RAY[1]!, oz = RAY[2]!, dx = RAY[3]!, dy = RAY[4]!, dz = RAY[5]!;
    const ix = 1 / dx, iy = 1 / dy, iz = 1 / dz;
    let best = RAY[6]!, bestTri = -1, count = 0;
    for (let ri = 0; ri < this.rootF32.length; ri++) {
      const f32 = this.rootF32[ri]!, u32 = this.rootU32[ri]!, u16 = this.rootU16[ri]!;
      let sp = 0; stack[sp++] = 0;
      while (sp > 0) {
        const node = stack[--sp]!;
        // slab test; a NaN (0 * Infinity: origin on the slab plane, no travel on that axis) fails both comparisons and is ignored
        let tmin = 0, tmax = best, tn: number, tf: number;
        if (ix >= 0) { tn = (f32[node]! - BOUNDS_PAD - ox) * ix; tf = (f32[node + 3]! + BOUNDS_PAD - ox) * ix; } else { tn = (f32[node + 3]! + BOUNDS_PAD - ox) * ix; tf = (f32[node]! - BOUNDS_PAD - ox) * ix; }
        if (tn > tmin) tmin = tn; if (tf < tmax) tmax = tf;
        if (iy >= 0) { tn = (f32[node + 1]! - BOUNDS_PAD - oy) * iy; tf = (f32[node + 4]! + BOUNDS_PAD - oy) * iy; } else { tn = (f32[node + 4]! + BOUNDS_PAD - oy) * iy; tf = (f32[node + 1]! - BOUNDS_PAD - oy) * iy; }
        if (tn > tmin) tmin = tn; if (tf < tmax) tmax = tf;
        if (iz >= 0) { tn = (f32[node + 2]! - BOUNDS_PAD - oz) * iz; tf = (f32[node + 5]! + BOUNDS_PAD - oz) * iz; } else { tn = (f32[node + 5]! + BOUNDS_PAD - oz) * iz; tf = (f32[node + 2]! - BOUNDS_PAD - oz) * iz; }
        if (tn > tmin) tmin = tn; if (tf < tmax) tmax = tf;
        if (tmin > tmax) continue;
        if (u16[node * 2 + 15] !== LEAF_FLAG) {
          // near child first: the split axis is stored with the node
          const left = node + UINT32_PER_NODE, right = node + u32[node + 6]! * UINT32_PER_NODE, axis = u32[node + 7]!;
          if ((axis === 0 ? dx : axis === 1 ? dy : dz) >= 0) { stack[sp++] = right; stack[sp++] = left; } else { stack[sp++] = left; stack[sp++] = right; }
          continue;
        }
        const first = u32[node + 6]!, end = first + u16[node * 2 + 14]!;
        for (let t = first; t < end; t++) {
          if ((tFlags[t]! & skipFlags) !== 0 || solidOn[tSolid[t]!] === 0) continue;
          const o = t * 9, ax = tpos[o]!, ay = tpos[o + 1]!, az = tpos[o + 2]!;
          const e1x = tpos[o + 3]! - ax, e1y = tpos[o + 4]! - ay, e1z = tpos[o + 5]! - az;
          const e2x = tpos[o + 6]! - ax, e2y = tpos[o + 7]! - ay, e2z = tpos[o + 8]! - az;
          const pvx = dy * e2z - dz * e2y, pvy = dz * e2x - dx * e2z, pvz = dx * e2y - dy * e2x;
          const det = e1x * pvx + e1y * pvy + e1z * pvz;
          if (det > -1e-12 && det < 1e-12) continue;      // parallel to the triangle
          const inv = 1 / det, tvx = ox - ax, tvy = oy - ay, tvz = oz - az;
          const u = (tvx * pvx + tvy * pvy + tvz * pvz) * inv;
          if (u < -BARY_EPS || u > 1 + BARY_EPS) continue;
          const qvx = tvy * e1z - tvz * e1y, qvy = tvz * e1x - tvx * e1z, qvz = tvx * e1y - tvy * e1x;
          const v = (dx * qvx + dy * qvy + dz * qvz) * inv;
          if (v < -BARY_EPS || u + v > 1 + BARY_EPS) continue;
          const dist = (e2x * qvx + e2y * qvy + e2z * qvz) * inv;
          if (!(dist >= 0) || dist > best) continue;
          if (mode === MODE_ANY) return 0;
          if (mode === MODE_NEAREST) {
            if (dist < best || bestTri < 0) { best = dist; bestTri = t; }
          } else {
            // sorted insert, nearest MAX_CROSSINGS kept
            if (count === MAX_CROSSINGS) { if (dist >= crossT[count - 1]!) continue; count--; }
            let i = count;
            while (i > 0 && crossT[i - 1]! > dist) { crossT[i] = crossT[i - 1]!; crossTri[i] = crossTri[i - 1]!; crossFace[i] = crossFace[i - 1]!; i--; }
            crossT[i] = dist; crossTri[i] = t; crossFace[i] = det > 0 ? 1 : -1;
            count++;
            if (count === MAX_CROSSINGS) best = crossT[count - 1]!;
          }
        }
      }
    }
    if (mode === MODE_ALL) return count;
    if (bestTri >= 0) F[8] = best;
    return bestTri;
  }

  /** Ray RAY against one volume, up to RAY[6]. True on a hit: distance in F[8], normal in F[9..11]. */
  private rayVolume(v: number): boolean {
    const shape = this.volShape[v]!;
    if (shape === SHAPE_SPHERE) return raySphere(this.volP, v * 8, v * 8 + 3);
    if (shape === SHAPE_CAPSULE) return rayCapsule(this.volP, v * 8);
    return rayObb(this.volP, v * 8);
  }

  private nextStamp(): number {
    if (this.stamp >= 0x3fffffff) { this.entStamp.fill(0); this.stamp = 0; }
    return ++this.stamp;
  }

  /**
   * Every volume on `mask` the ray RAY enters within RAY[6], reduced to one per entity: the highest priority,
   * then the nearest. Results in entBestVol / entBestT, entity slots in `touched`; returns their count.
   */
  private gatherVolumes(mask: number): number {
    const stamp = this.nextStamp();
    let n = 0;
    for (let v = 0; v < this.volHigh; v++) {
      if (this.volOn[v] === 0 || this.volPlaced[v] === 0 || (this.volLayer[v]! & mask) === 0) continue;
      if (!this.rayVolume(v)) continue;
      const t = F[8]!, e = this.volEnt[v]!, pri = this.volPriority[v]!;
      if (this.entStamp[e] !== stamp) {
        this.entStamp[e] = stamp; this.touched[n++] = e;
        this.entBestVol[e] = v; this.entBestT[e] = t; this.entBestPri[e] = pri;
      } else if (pri > this.entBestPri[e]! || (pri === this.entBestPri[e]! && t < this.entBestT[e]!)) {
        this.entBestVol[e] = v; this.entBestT[e] = t; this.entBestPri[e] = pri;
      }
    }
    return n;
  }

  /** A miss at the end of ray RAY. */
  private fillMiss(out: HitResult): void {
    const maxT = RAY[6]!;
    out.hit = false; out.distance = maxT;
    out.x = RAY[0]! + RAY[3]! * maxT; out.y = RAY[1]! + RAY[4]! * maxT; out.z = RAY[2]! + RAY[5]! * maxT;
    out.nx = 0; out.ny = 0; out.nz = 0;
    out.surface = 'none'; out.flags = 0; out.layer = 0; out.entity = null; out.part = 'whole'; out.receiver = null; out.solidId = '';
  }

  /** Static hit of ray RAY on triangle `tri` at distance F[8]. */
  private fillStatic(out: HitResult, tri: number): void {
    const tpos = this.tpos, o = tri * 9, ax = tpos[o]!, ay = tpos[o + 1]!, az = tpos[o + 2]!, t = F[8]!;
    const dx = RAY[3]!, dy = RAY[4]!, dz = RAY[5]!;
    const e1x = tpos[o + 3]! - ax, e1y = tpos[o + 4]! - ay, e1z = tpos[o + 5]! - az;
    const e2x = tpos[o + 6]! - ax, e2y = tpos[o + 7]! - ay, e2z = tpos[o + 8]! - az;
    let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz), inv = len > 1e-20 ? 1 / len : 0;
    nx *= inv; ny *= inv; nz *= inv;
    if (nx * dx + ny * dy + nz * dz > 0) { nx = -nx; ny = -ny; nz = -nz; }   // face the shooter
    out.hit = true; out.distance = t;
    out.x = RAY[0]! + dx * t; out.y = RAY[1]! + dy * t; out.z = RAY[2]! + dz * t;
    out.nx = nx + 0; out.ny = ny + 0; out.nz = nz + 0;      // + 0: never -0
    out.surface = SURFACES[this.tSurf[tri]!]!; out.flags = this.tFlags[tri]!; out.layer = L_WORLD;
    out.entity = null; out.part = 'whole'; out.receiver = null;
    const s = this.tSolid[tri]!;
    out.solidId = s < this.solidCount ? this.solidIds[s]! : '';
  }

  /** Box hit of ray RAY: recomputed from the box, so the normal needs no storage. */
  private fillBox(out: HitResult, b: number): void {
    const limit = RAY[6]!;
    RAY[6] = Infinity;
    const t = rayObb(this.boxP, b * 8) ? F[8]! : 0;
    RAY[6] = limit;
    out.hit = true; out.distance = t;
    out.x = RAY[0]! + RAY[3]! * t; out.y = RAY[1]! + RAY[4]! * t; out.z = RAY[2]! + RAY[5]! * t;
    out.nx = F[9]! + 0; out.ny = F[10]! + 0; out.nz = F[11]! + 0;
    out.surface = SURFACES[this.boxSurf[b]!]!; out.flags = this.boxFlags[b]!; out.layer = L_DYNAMIC;
    out.entity = this.boxEntity[b]!; out.part = 'whole'; out.receiver = null; out.solidId = '';
  }

  private fillVolume(out: HitResult, v: number): void {
    const limit = RAY[6]!;
    RAY[6] = Infinity;
    const t = this.rayVolume(v) ? F[8]! : 0;
    RAY[6] = limit;
    out.hit = true; out.distance = t;
    out.x = RAY[0]! + RAY[3]! * t; out.y = RAY[1]! + RAY[4]! * t; out.z = RAY[2]! + RAY[5]! * t;
    out.nx = F[9]! + 0; out.ny = F[10]! + 0; out.nz = F[11]! + 0;
    out.surface = SURFACES[this.volSurf[v]!]!; out.flags = this.volFlags[v]!; out.layer = this.volLayer[v]!;
    out.entity = this.volEntity[v]!; out.part = this.volPart[v]!; out.receiver = this.volReceiver[v]!; out.solidId = '';
  }

  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDistance: number, layerMask: number, out: HitResult): boolean {
    RAY[0] = ox; RAY[1] = oy; RAY[2] = oz; RAY[3] = dx; RAY[4] = dy; RAY[5] = dz; RAY[6] = maxDistance;
    return this.raycastImpl(layerMask, out);
  }

  private raycastImpl(layerMask: number, out: HitResult): boolean {
    this.stats.rays++;
    let kind = -1, ref = -1;
    if ((layerMask & L_WORLD) !== 0 && this.triCount > 0) {
      const tri = this.rayStatic(F_BODY_ONLY, MODE_NEAREST);
      if (tri >= 0) { RAY[6] = F[8]!; kind = KIND_STATIC; ref = tri; }
    }
    if ((layerMask & L_DYNAMIC) !== 0) {
      const p = this.boxP;
      for (let b = 0; b < this.boxHigh; b++) {
        if (this.boxOn[b] === 0 || (this.boxFlags[b]! & F_BODY_ONLY) !== 0) continue;
        if (rayObb(p, b * 8)) { RAY[6] = F[8]!; kind = KIND_BOX; ref = b; }   // <= the limit: a box flush with a wall wins the tie
      }
    }
    if ((layerMask & ~(L_WORLD | L_DYNAMIC)) !== 0 && this.volHigh > 0) {
      // only volumes in front of the nearest solid count; among an entity's volumes the highest priority wins
      const n = this.gatherVolumes(layerMask);
      let vt = Infinity, vv = -1;
      for (let i = 0; i < n; i++) {
        const e = this.touched[i]!;
        if (this.entBestT[e]! < vt) { vt = this.entBestT[e]!; vv = this.entBestVol[e]!; }
      }
      if (vv >= 0) { kind = KIND_VOLUME; ref = vv; }
    }
    if (kind === KIND_STATIC) { F[8] = RAY[6]!; this.fillStatic(out, ref); } else if (kind === KIND_BOX) this.fillBox(out, ref);
    else if (kind === KIND_VOLUME) this.fillVolume(out, ref);
    else this.fillMiss(out);
    return kind >= 0;
  }

  /** Sorted insert of a hit at distance F[8] into the raycastAll scratch (ties keep insertion order); the nearest `cap` are kept. */
  private insertHit(kind: number, ref: number, cap: number): void {
    const hitT = this.hitT, hitKind = this.hitKind, hitRef = this.hitRef, t = F[8]!;
    let n = this.hitCount;
    if (n === cap) { if (cap === 0 || t >= hitT[n - 1]!) return; n--; }
    let i = n;
    while (i > 0 && hitT[i - 1]! > t) { hitT[i] = hitT[i - 1]!; hitKind[i] = hitKind[i - 1]!; hitRef[i] = hitRef[i - 1]!; i--; }
    hitT[i] = t; hitKind[i] = kind; hitRef[i] = ref;
    this.hitCount = n + 1;
  }

  raycastAll(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDistance: number, layerMask: number, out: HitList): number {
    RAY[0] = ox; RAY[1] = oy; RAY[2] = oz; RAY[3] = dx; RAY[4] = dy; RAY[5] = dz; RAY[6] = maxDistance;
    return this.raycastAllImpl(layerMask, out);
  }

  private raycastAllImpl(layerMask: number, out: HitList): number {
    this.stats.rays++;
    const cap = out.hits.length < HIT_CAP ? out.hits.length : HIT_CAP;
    this.hitCount = 0;
    // insertion order decides ties: volume, then box, then static (the same order raycast uses)
    if ((layerMask & ~(L_WORLD | L_DYNAMIC)) !== 0 && this.volHigh > 0) {
      const n = this.gatherVolumes(layerMask);
      for (let i = 0; i < n; i++) { const e = this.touched[i]!; F[8] = this.entBestT[e]!; this.insertHit(KIND_VOLUME, this.entBestVol[e]!, cap); }
    }
    if ((layerMask & L_DYNAMIC) !== 0) {
      const p = this.boxP;
      for (let b = 0; b < this.boxHigh; b++) {
        if (this.boxOn[b] === 0 || (this.boxFlags[b]! & F_BODY_ONLY) !== 0) continue;
        if (rayObb(p, b * 8)) this.insertHit(KIND_BOX, b, cap);
      }
    }
    if ((layerMask & L_WORLD) !== 0 && this.triCount > 0) {
      // A closed solid is crossed twice (in and out). Report where the ray ENTERS each solid: pair the
      // crossings of one solid up by parity, after merging crossings that are the same point (a ray
      // through a shared edge meets both triangles).
      const n = this.rayStatic(F_BODY_ONLY, MODE_ALL);
      const crossT = this.crossT, crossTri = this.crossTri, crossFace = this.crossFace, tSolid = this.tSolid;
      const inside = this.solidInside, seen = this.solidSeen, lastT = this.solidLastT, lastFace = this.solidLastFace, none = this.solidCount;
      for (let i = 0; i < n; i++) { const s = tSolid[crossTri[i]!]!; inside[s] = 0; seen[s] = 0; }
      for (let i = 0; i < n; i++) {
        const tri = crossTri[i]!, s = tSolid[tri]!, t = crossT[i]!, face = crossFace[i]!;
        if (seen[s] === 1 && t - lastT[s]! < SAME_T && face === lastFace[s]) continue;
        seen[s] = 1; lastT[s] = t; lastFace[s] = face;
        F[8] = t;
        if (s === none) { this.insertHit(KIND_STATIC, tri, cap); continue; }
        if (inside[s] === 0) { inside[s] = 1; this.insertHit(KIND_STATIC, tri, cap); } else inside[s] = 0;
      }
    }
    const count = this.hitCount;
    for (let i = 0; i < count; i++) {
      const h = out.hits[i]!, kind = this.hitKind[i]!, ref = this.hitRef[i]!;
      if (kind === KIND_STATIC) { F[8] = this.hitT[i]!; this.fillStatic(h, ref); } else if (kind === KIND_BOX) this.fillBox(h, ref);
      else this.fillVolume(h, ref);
    }
    out.count = count;
    return count;
  }

  lineOfSight(ax: number, ay: number, az: number, bx: number, by: number, bz: number, ignoreFlags: number): boolean {
    RAY[0] = ax; RAY[1] = ay; RAY[2] = az; RAY[3] = bx - ax; RAY[4] = by - ay; RAY[5] = bz - az;
    return this.sightImpl(ignoreFlags);
  }

  private sightImpl(ignoreFlags: number): boolean {
    this.stats.rays++; this.sightRays++;
    const dx = RAY[3]!, dy = RAY[4]!, dz = RAY[5]!;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-9) return true;
    RAY[3] = dx / len; RAY[4] = dy / len; RAY[5] = dz / len; RAY[6] = len;
    const skip = ignoreFlags | F_BODY_ONLY;
    if (this.triCount > 0 && this.rayStatic(skip, MODE_ANY) >= 0) return false;
    const p = this.boxP;
    for (let b = 0; b < this.boxHigh; b++) {
      if (this.boxOn[b] === 0 || (this.boxFlags[b]! & skip) !== 0) continue;
      if (rayObb(p, b * 8)) return false;
    }
    return true;
  }

  volumeCentre(entity: EntityId, part: HitPart | null, out: Vec3): boolean {
    let best = -1, bestPri = -Infinity;
    for (let v = 0; v < this.volHigh; v++) {
      if (this.volOn[v] === 0 || this.volPlaced[v] === 0 || this.volEntity[v]!.id !== entity) continue;
      if (part !== null && this.volPart[v] !== part) continue;
      if (best < 0 || this.volPriority[v]! > bestPri) { best = v; bestPri = this.volPriority[v]!; }
    }
    if (best < 0) return false;
    const p = this.volP, o = best * 8;
    if (this.volShape[best] === SHAPE_CAPSULE) { out.x = (p[o]! + p[o + 3]!) * 0.5; out.y = (p[o + 1]! + p[o + 4]!) * 0.5; out.z = (p[o + 2]! + p[o + 5]!) * 0.5; } else { out.x = p[o]!; out.y = p[o + 1]!; out.z = p[o + 2]!; }
    return true;
  }

  // =================================================================================
  // overlaps
  // =================================================================================

  /** One entry per entity: its highest-priority touching volume (then the nearest), in volume-slot order. */
  overlapSphere(x: number, y: number, z: number, radius: number, layerMask: number, out: OverlapList): number {
    RAY[0] = x; RAY[1] = y; RAY[2] = z; RAY[6] = radius;
    return this.overlapImpl(layerMask, out);
  }

  private overlapImpl(layerMask: number, out: OverlapList): number {
    const stamp = this.nextStamp(), p = this.volP;
    const x = RAY[0]!, y = RAY[1]!, z = RAY[2]!, radius = RAY[6]!;
    let n = 0;
    for (let v = 0; v < this.volHigh; v++) {
      if (this.volOn[v] === 0 || this.volPlaced[v] === 0 || (this.volLayer[v]! & layerMask) === 0) continue;
      const o = v * 8, shape = this.volShape[v]!;
      let gap: number;                                   // distance from the sphere centre to the volume's surface (<= 0 inside)
      if (shape === SHAPE_SPHERE) {
        const ex = x - p[o]!, ey = y - p[o + 1]!, ez = z - p[o + 2]!;
        gap = Math.sqrt(ex * ex + ey * ey + ez * ez) - p[o + 3]!;
      } else if (shape === SHAPE_CAPSULE) {
        const ax = p[o]!, ay = p[o + 1]!, az = p[o + 2]!, abx = p[o + 3]! - ax, aby = p[o + 4]! - ay, abz = p[o + 5]! - az;
        const len2 = abx * abx + aby * aby + abz * abz;
        let u = len2 > 1e-18 ? ((x - ax) * abx + (y - ay) * aby + (z - az) * abz) / len2 : 0;
        u = u < 0 ? 0 : u > 1 ? 1 : u;
        const ex = x - ax - abx * u, ey = y - ay - aby * u, ez = z - az - abz * u;
        gap = Math.sqrt(ex * ex + ey * ey + ez * ez) - p[o + 6]!;
      } else {
        const hx = p[o + 3]!, hy = p[o + 4]!, hz = p[o + 5]!, c = p[o + 6]!, s = p[o + 7]!;
        const wx = x - p[o]!, wz = z - p[o + 2]!, lx = wx * c - wz * s, ly = y - p[o + 1]!, lz = wx * s + wz * c;
        const ex = lx > hx ? lx - hx : lx < -hx ? lx + hx : 0, ey = ly > hy ? ly - hy : ly < -hy ? ly + hy : 0, ez = lz > hz ? lz - hz : lz < -hz ? lz + hz : 0;
        gap = Math.sqrt(ex * ex + ey * ey + ez * ez);
      }
      if (gap > radius) continue;
      const e = this.volEnt[v]!, pri = this.volPriority[v]!;
      if (this.entStamp[e] !== stamp) {
        this.entStamp[e] = stamp; this.touched[n++] = e;
        this.entBestVol[e] = v; this.entBestT[e] = gap; this.entBestPri[e] = pri;
      } else if (pri > this.entBestPri[e]! || (pri === this.entBestPri[e]! && gap < this.entBestT[e]!)) {
        this.entBestVol[e] = v; this.entBestT[e] = gap; this.entBestPri[e] = pri;
      }
    }
    const cap = out.entities.length < MAX_OVERLAPS ? out.entities.length : MAX_OVERLAPS;
    if (n > cap) n = cap;
    for (let i = 0; i < n; i++) {
      const v = this.entBestVol[this.touched[i]!]!;
      out.entities[i] = this.volEntity[v]!; out.parts[i] = this.volPart[v]!; out.receivers[i] = this.volReceiver[v]!;
    }
    out.count = n;
    return n;
  }

  segmentHitsCapsule(ax: number, ay: number, az: number, bx: number, by: number, bz: number, radius: number, capX: number, capY: number, capZ: number, capRadius: number, capHeight: number): boolean {
    T[0] = ax; T[1] = ay; T[2] = az; T[3] = bx; T[4] = by; T[5] = bz;
    const y0 = capY + capRadius, seg = capHeight - 2 * capRadius, reach = radius + capRadius;
    S[0] = capX; S[1] = y0; S[2] = seg > 0 ? y0 + seg : y0; S[3] = capZ;
    closestEdgeAxis(0);
    return F[12]! <= reach * reach;
  }

  // =================================================================================
  // scratch factories
  // =================================================================================

  createHit(): HitResult {
    // numeric fields start as doubles so later stores never change the object's shape
    const h: HitResult = {
      hit: false, distance: 0.5, x: 0.5, y: 0.5, z: 0.5, nx: 0.5, ny: 0.5, nz: 0.5,
      surface: 'none', flags: 0, layer: 0, entity: null, part: 'whole', receiver: null, solidId: '',
    };
    resetHit(h);
    return h;
  }

  createHitList(): HitList {
    const hits: HitResult[] = [];
    for (let i = 0; i < HIT_CAP; i++) hits.push(this.createHit());
    return { count: 0, hits };
  }

  createResolve(): CapsuleResolve {
    const r: CapsuleResolve = {
      x: 0.5, y: 0.5, z: 0.5, grounded: false, groundNx: 0.5, groundNy: 0.5, groundNz: 0.5, groundSurface: 'none',
      hitWall: false, wallNx: 0.5, wallNy: 0.5, wallNz: 0.5, wallFlags: 0, hitCeiling: false,
    };
    r.x = 0; r.y = 0; r.z = 0; r.groundNx = 0; r.groundNy = 1; r.groundNz = 0; r.wallNx = 0; r.wallNy = 0; r.wallNz = 0;
    return r;
  }

  createOverlapList(): OverlapList {
    return {
      count: 0,
      entities: new Array<EntityRef | null>(MAX_OVERLAPS).fill(null),
      parts: new Array<HitPart>(MAX_OVERLAPS).fill('whole'),
      receivers: new Array<HitReceiver | null>(MAX_OVERLAPS).fill(null),
    };
  }
}

export function createCollisionWorld(): CollisionWorld {
  return new CollisionWorldImpl();
}
