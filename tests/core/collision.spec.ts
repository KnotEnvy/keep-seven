// Unit spec of src/core/collision.ts: every query, every flag, the adversarial cases, and the
// micro-benchmark of the work order (definition of done 3) against the full design/layout.json.
/// <reference types="node" />
import fs from 'node:fs';
import path from 'node:path';
import v8 from 'node:v8';
import vm from 'node:vm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import layoutJson from '../../design/layout.json';
import { ColFlag, LAYER_SHOT, LAYER_SOLID, Layer, MAX_LINE_HITS, PLAYER_HEIGHT, PLAYER_RADIUS } from '../../src/core/contracts.ts';
import type { CollisionWorld, EntityRef, HitPart, HitReceiver, LayoutData, LayoutSolid, ResidentSet, SurfaceType, ZoneId } from '../../src/core/contracts.ts';
import { CollisionWorldImpl, GROUND_SKIN, MAX_BOXES, MAX_OVERLAPS, MAX_VOLUMES, NO_SOLID, SURFACE_TYPES, createCollisionWorld, surfaceIndex } from '../../src/core/collision.ts';
import { buildSolidColliders, solidFlags, solidTriangles } from '../../src/core/greybox.ts';

const layout = layoutJson as unknown as LayoutData;
const R = PLAYER_RADIUS, H = PLAYER_HEIGHT;
const COS45 = Math.cos((45 * Math.PI) / 180);
const DEG = Math.PI / 180;

// ------------------------------------------------------------------------------------------------
// helpers
// ------------------------------------------------------------------------------------------------

let nextId = 0;
function solid(p: Partial<LayoutSolid> & { pos: [number, number, number]; size: [number, number, number] }): LayoutSolid {
  return { id: `s${nextId++}`, zone: 'the_lip', shape: 'box', role: 'wall', surface: 'stone', rotY: 0, ...p };
}
const FLOOR = (): LayoutSolid => solid({ id: 'floor', pos: [0, -0.5, 0], size: [200, 1, 200], role: 'floor', surface: 'sand' });

/** A static set from layout-style solids, through the real greybox triangle builder. */
function scene(solids: LayoutSolid[], into: CollisionWorldImpl = new CollisionWorldImpl()): CollisionWorldImpl {
  const flat: number[] = [], surf: number[] = [], flags: number[] = [], sol: number[] = [], ids: string[] = [];
  for (const s of solids) {
    const n = solidTriangles(s, flat);
    const si = ids.length; ids.push(s.id);
    for (let i = 0; i < n; i++) { surf.push(surfaceIndex(s.surface)); flags.push(solidFlags(s)); sol.push(si); }
  }
  into.setStatic(Float32Array.from(flat), Uint8Array.from(surf), Uint8Array.from(flags), Uint16Array.from(sol), ids);
  return into;
}

interface Body { x: number; y: number; z: number; vy: number; grounded: boolean; hitWall: boolean; hitCeiling: boolean; wallFlags: number }
const body = (x: number, y: number, z: number): Body => ({ x, y, z, vy: 0, grounded: false, hitWall: false, hitCeiling: false, wallFlags: 0 });
const STEP_UP = 0.35, STEP_REACH = 0.13, GRAVITY = 24;

/**
 * The controller the architecture describes: gravity, sub-steps, depenetration; with `stepUp`, the
 * lift-move-drop of GDD 5 built on resolveCapsule + capsuleFree.
 */
function walk(w: CollisionWorld, b: Body, vx: number, vz: number, ticks: number, opt: { sub?: number; stepUp?: boolean; cos?: number; gravity?: boolean } = {}): Body {
  const sub = opt.sub ?? 3, cos = opt.cos ?? COS45, dt = 1 / 60 / sub;
  const r = w.createResolve(), r2 = w.createResolve();
  const speed = Math.hypot(vx, vz);
  b.hitWall = false; b.hitCeiling = false; b.wallFlags = 0;             // sticky over this call
  for (let i = 0; i < ticks * sub; i++) {
    if (opt.gravity !== false) b.vy -= GRAVITY * dt;
    const tx = b.x + vx * dt, tz = b.z + vz * dt;
    w.resolveCapsule(tx, b.y + b.vy * dt, tz, R, H, cos, r);
    let use = r;
    if (opt.stepUp && r.hitWall && b.grounded && speed > 0) {
      // lift, move (far enough that the lower sphere can rest on the lip), drop
      const px = tx + (vx / speed) * STEP_REACH, pz = tz + (vz / speed) * STEP_REACH, top = b.y + STEP_UP;
      if (w.capsuleFree(b.x, top, b.z, R, H) && w.capsuleFree(px, top, pz, R, H)) {
        let lo = b.y, hi = top;
        for (let k = 0; k < 12; k++) { const mid = (lo + hi) / 2; if (w.capsuleFree(px, mid, pz, R, H)) hi = mid; else lo = mid; }
        w.resolveCapsule(px, hi, pz, R, H, cos, r2);
        if (r2.grounded && !r2.hitWall && r2.y > b.y + 0.02) use = r2;
      }
    }
    b.x = use.x; b.y = use.y; b.z = use.z;
    b.hitWall ||= use.hitWall; b.hitCeiling ||= use.hitCeiling; if (use.hitWall) b.wallFlags = use.wallFlags;
    b.grounded = use.grounded && b.vy <= 0;
    if (b.grounded) b.vy = 0; else if (use.hitCeiling && b.vy > 0) b.vy = 0;
  }
  return b;
}

const ent = (id: string, kind: EntityRef['kind'] = 'bider'): EntityRef => ({ id, kind });
function sphere(w: CollisionWorld, e: EntityRef, x: number, y: number, z: number, r: number, o: { part?: HitPart; priority?: number; layer?: number; receiver?: HitReceiver | null; surface?: SurfaceType; flags?: number } = {}): number {
  const h = w.addVolume({ shape: 'sphere', layer: o.layer ?? Layer.ENEMY, flags: o.flags ?? 0, surface: o.surface ?? 'cloth', entity: e, part: o.part ?? 'body', priority: o.priority ?? 0, receiver: o.receiver ?? null });
  w.setSphere(h, x, y, z, r);
  return h;
}

/** Brute-force nearest ray hit over raw triangles (the reference the BVH walk is checked against). */
function bruteRay(pos: Float32Array, flags: Uint8Array, skip: number, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number): number {
  let best = Infinity;
  for (let t = 0; t < flags.length; t++) {
    if ((flags[t]! & skip) !== 0) continue;
    const o = t * 9, ax = pos[o]!, ay = pos[o + 1]!, az = pos[o + 2]!;
    const e1x = pos[o + 3]! - ax, e1y = pos[o + 4]! - ay, e1z = pos[o + 5]! - az, e2x = pos[o + 6]! - ax, e2y = pos[o + 7]! - ay, e2z = pos[o + 8]! - az;
    const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det, tx = ox - ax, ty = oy - ay, tz = oz - az;
    const u = (tx * px + ty * py + tz * pz) * inv; if (u < -1e-7 || u > 1 + 1e-7) continue;
    const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * inv; if (v < -1e-7 || u + v > 1 + 1e-7) continue;
    const d = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (d >= 0 && d <= maxT && d < best) best = d;
  }
  return best;
}

/** mulberry32 */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc') as () => void;
/** Bytes the JS heap grew while `fn` ran (process.memoryUsage is exact to the byte between collections). */
function heapGrowth(fn: () => void): number {
  gc();
  const h0 = process.memoryUsage().heapUsed;
  fn();
  return process.memoryUsage().heapUsed - h0;
}
/** Smallest growth over `reps` runs minus the cost of measuring itself: > 0 means `fn` allocates on every run. */
function allocatedBytes(fn: () => void, reps = 9): number {
  let base = Infinity, min = Infinity;
  for (let i = 0; i < reps; i++) base = Math.min(base, heapGrowth(() => undefined));
  for (let i = 0; i < reps; i++) min = Math.min(min, heapGrowth(fn));
  return Math.max(0, min - base);
}

/**
 * Runs `fn` until V8 has finished optimising what it calls (the interpreter and the mid-tier compiler
 * box every double; the game reaches the top tier within its first seconds), i.e. until a run allocates
 * nothing. Gives up after `max` rounds, leaving the assertion on the measured bytes to fail. Returns the rounds run.
 */
function warmUntilQuiet(fn: () => void, max = 1500): number {
  let rounds = 0;
  while (rounds < max) {
    for (let i = 0; i < 50; i++) fn();
    rounds += 50;
    if (allocatedBytes(fn, 3) === 0 && allocatedBytes(fn, 3) === 0) break;
  }
  return rounds;
}

// ------------------------------------------------------------------------------------------------
// static content
// ------------------------------------------------------------------------------------------------

describe('static content', () => {
  it('builds, reports triangles, and clears', () => {
    const w = scene([FLOOR()]);
    expect(w.stats.triangles).toBe(12);
    expect(w.flippedSolids).toBe(0);
    const hit = w.createHit();
    expect(w.raycast(0, 5, 0, 0, -1, 0, 10, Layer.WORLD, hit)).toBe(true);
    w.clearStatic();
    expect(w.stats.triangles).toBe(0);
    expect(w.raycast(0, 5, 0, 0, -1, 0, 10, Layer.WORLD, hit)).toBe(false);
    expect(w.groundHeight(0, 5, 0, 10)).toBeNaN();
    const res = w.createResolve();
    w.resolveCapsule(1, 2, 3, R, H, COS45, res);
    expect([res.x, res.y, res.z, res.grounded, res.hitWall, res.hitCeiling]).toEqual([1, 2, 3, false, false, false]);
    expect(w.capsuleFree(0, 0, 0, R, H)).toBe(true);
    expect(w.lineOfSight(0, 0, 0, 5, 5, 5, 0)).toBe(true);
  });

  it('accepts an empty set and rejects mismatched arrays', () => {
    const w = new CollisionWorldImpl();
    w.setStatic(new Float32Array(0), new Uint8Array(0), new Uint8Array(0), new Uint16Array(0), []);
    expect(w.stats.triangles).toBe(0);
    expect(() => w.setStatic(new Float32Array(18), new Uint8Array(1), new Uint8Array(2), new Uint16Array(2), [])).toThrow(/per-triangle/);
    expect(() => w.setStatic(new Float32Array(10), new Uint8Array(1), new Uint8Array(1), new Uint16Array(1), [])).toThrow();
  });

  it('copies its input, so the builder may reuse its buffers', () => {
    const c = buildSolidColliders({ ...layout, solids: [FLOOR()] }, ['the_lip'], 'surface');
    const w = new CollisionWorldImpl();
    w.setStatic(c.positions, c.triSurface, c.triFlags, c.triSolid, c.solidIds);
    c.positions.fill(1000); c.triSurface.fill(3); c.triFlags.fill(255);
    const hit = w.createHit();
    expect(w.raycast(0, 5, 0, 0, -1, 0, 10, Layer.WORLD, hit)).toBe(true);
    expect(hit.surface).toBe('sand');
    expect(hit.flags).toBe(0);
  });

  it('surface bytes follow SURFACE_TYPES; an unknown byte reads as none; a triangle without a solid has no id', () => {
    const w = new CollisionWorldImpl();
    const tri = (y: number, x0: number): number[] => [x0, y, -1, x0, y, 1, x0 + 2, y, 0];
    const pos: number[] = [], surf: number[] = [];
    SURFACE_TYPES.forEach((_s, i) => { pos.push(...tri(0, i * 10)); surf.push(i); });
    pos.push(...tri(0, 100)); surf.push(200);
    const n = surf.length;
    w.setStatic(Float32Array.from(pos), Uint8Array.from(surf), new Uint8Array(n), new Uint16Array(n).fill(NO_SOLID), []);
    const hit = w.createHit();
    SURFACE_TYPES.forEach((s, i) => {
      expect(w.raycast(i * 10 + 0.5, 1, 0, 0, -1, 0, 5, Layer.WORLD, hit)).toBe(true);
      expect(hit.surface).toBe(s);
      expect(hit.solidId).toBe('');
      expect(hit.entity).toBeNull();
      expect(hit.layer).toBe(Layer.WORLD);
    });
    expect(w.raycast(100.5, 1, 0, 0, -1, 0, 5, Layer.WORLD, hit)).toBe(true);
    expect(hit.surface).toBe('none');
  });

  it('a closed solid wound inside-out is flipped at load; an open sheet is left alone', () => {
    const s = solid({ id: 'wall', pos: [0, 1.5, -3], size: [6, 3, 1] });
    const flat: number[] = [];
    const n = solidTriangles(s, flat);
    for (let t = 0; t < n; t++) for (let k = 0; k < 3; k++) { const o = t * 9; const v = flat[o + 3 + k]!; flat[o + 3 + k] = flat[o + 6 + k]!; flat[o + 6 + k] = v; }
    const floorFlat: number[] = [];
    const fn = solidTriangles(FLOOR(), floorFlat);
    const w = new CollisionWorldImpl();
    const sol = new Uint16Array(n + fn); sol.fill(1, n);
    w.setStatic(Float32Array.from([...flat, ...floorFlat]), new Uint8Array(n + fn), new Uint8Array(n + fn), sol, ['wall', 'floor']);
    expect(w.flippedSolids).toBe(1);
    const b = walk(w, body(0, 0, 0), 0, -6, 60);
    expect(b.z).toBeCloseTo(-2.5 + R, 4);
    expect(b.hitWall).toBe(true);
    // open two-triangle sheet, wound upward, as a solid: not flipped, still ground
    const w2 = new CollisionWorldImpl();
    w2.setStatic(Float32Array.from([-5, 0, -5, -5, 0, 5, 5, 0, 5, -5, 0, -5, 5, 0, 5, 5, 0, -5]), new Uint8Array(2), new Uint8Array(2), new Uint16Array(2), ['sheet']);
    expect(w2.flippedSolids).toBe(0);
    const res = w2.createResolve();
    w2.resolveCapsule(0, -0.1, 0, R, H, COS45, res);
    expect(res.grounded).toBe(true);
    expect(res.y).toBeCloseTo(0, 6);
  });
});

// ------------------------------------------------------------------------------------------------
// resolveCapsule
// ------------------------------------------------------------------------------------------------

describe('resolveCapsule', () => {
  it('rests on a floor: grounded, unmoved, with the surface and the normal', () => {
    const w = scene([FLOOR()]);
    const res = w.createResolve();
    w.resolveCapsule(3, 0, 4, R, H, COS45, res);
    expect(res).toMatchObject({ x: 3, y: 0, z: 4, grounded: true, groundSurface: 'sand', hitWall: false, hitCeiling: false, wallFlags: 0 });
    expect([res.groundNx, res.groundNy, res.groundNz]).toEqual([0, 1, 0]);
    expect(w.stats.capsules).toBe(1);
  });

  it('ground skin: a hover inside the skin is grounded, above it is not', () => {
    const w = scene([FLOOR()]);
    const res = w.createResolve();
    w.resolveCapsule(0, GROUND_SKIN * 0.6, 0, R, H, COS45, res);
    expect(res.grounded).toBe(true);
    expect(res.y).toBe(GROUND_SKIN * 0.6);
    w.resolveCapsule(0, GROUND_SKIN * 2, 0, R, H, COS45, res);
    expect(res.grounded).toBe(false);
    expect(res.groundSurface).toBe('none');
  });

  it('a sunk capsule is pushed straight up, never sideways', () => {
    const w = scene([FLOOR()]);
    const res = w.createResolve();
    for (const sink of [0.001, 0.1, 0.3]) {
      w.resolveCapsule(1.25, -sink, -7.5, R, H, COS45, res);
      expect(res.x).toBe(1.25); expect(res.z).toBe(-7.5);
      expect(res.y).toBeCloseTo(0, 9);
      expect(res.grounded).toBe(true);
    }
  });

  it('walking into a wall stops at wall minus radius and reports the wall, its normal and its flags', () => {
    const w = scene([FLOOR(), solid({ pos: [0, 1.5, -5.5], size: [10, 3, 1], stunsCharge: true, surface: 'metal' })]);
    const b = walk(w, body(0, 0, 0), 0, -6, 90);
    expect(b.z).toBeCloseTo(-5 + R, 5);
    expect(b.grounded).toBe(true);
    expect(b.hitWall).toBe(true);
    expect(b.wallFlags).toBe(ColFlag.STUNS_CHARGE);
    const res = w.createResolve();
    w.resolveCapsule(0, 0, -5 + R - 0.1, R, H, COS45, res);
    expect(res.hitWall).toBe(true);
    expect(res.wallNx).toBeCloseTo(0, 9); expect(res.wallNy).toBeCloseTo(0, 9); expect(res.wallNz).toBeCloseTo(1, 9);
    expect(res.z).toBeCloseTo(-5 + R, 9);
  });

  it('wallFlags are those of the wall that pushed hardest', () => {
    const w = scene([
      FLOOR(),
      solid({ pos: [0, 1.5, -5.5], size: [20, 3, 1], stunsCharge: true }),
      solid({ pos: [5.5, 1.5, 0], size: [1, 3, 20], blocksBossFire: true }),
    ]);
    const res = w.createResolve();
    w.resolveCapsule(5 - R + 0.05, 0, -5 + R - 0.2, R, H, COS45, res);   // 0.2 into the north wall, 0.05 into the east wall
    expect(res.hitWall).toBe(true);
    expect(res.wallFlags).toBe(ColFlag.STUNS_CHARGE);
    w.resolveCapsule(5 - R + 0.2, 0, -5 + R - 0.05, R, H, COS45, res);
    expect(res.wallFlags).toBe(ColFlag.BLOCKS_BOSS_FIRE);
    expect(res.x).toBeCloseTo(5 - R, 6); expect(res.z).toBeCloseTo(-5 + R, 6);
  });

  it('inside corner: pushed diagonally it ends a radius from both walls and stays there', () => {
    const w = scene([FLOOR(), solid({ pos: [0, 1.5, -5.5], size: [20, 3, 1] }), solid({ pos: [5.5, 1.5, 0], size: [1, 3, 20] })]);
    const b = walk(w, body(0, 0, 0), 5, -5, 180);
    expect(b.x).toBeCloseTo(5 - R, 4); expect(b.z).toBeCloseTo(-5 + R, 4);
    expect(b.grounded).toBe(true);
    expect(w.capsuleFree(b.x, b.y, b.z, R, H)).toBe(true);
  });

  it('acute inside corner (30 degrees between walls): no tunnelling, no jitter out of bounds', () => {
    const w = scene([FLOOR(), solid({ pos: [0, 1.5, -5.5], size: [40, 3, 1] }), solid({ pos: [0, 1.5, 0], size: [40, 3, 1], rotY: 30 })]);
    // the wedge between the z = -5 face and the rotated wall narrows toward +x
    const b = body(-6, 0, -3.2);
    for (let i = 0; i < 240; i++) {
      walk(w, b, 6, -1, 1);
      expect(b.z).toBeGreaterThan(-5 + R - 1e-3);
      expect(Number.isFinite(b.x) && Number.isFinite(b.z)).toBe(true);
      expect(b.y).toBeLessThan(0.05);
    }
    expect(w.raycast(b.x, 1, b.z, 0, 0, -1, 50, Layer.WORLD, w.createHit())).toBe(true);
  });

  it('outside corner: slides round a box corner without snagging or entering', () => {
    const w = scene([FLOOR(), solid({ id: 'crate', pos: [0, 1, 0], size: [2, 2, 2] })]);
    const b = body(-1 - R - 0.5, 0, 3);
    let last = b.z;
    for (let i = 0; i < 150; i++) {
      walk(w, b, 0.5, -4, 1);                           // pressed gently into the crate's west face while passing it
      expect(b.z).toBeLessThan(last);                   // never snags
      last = b.z;
      const dx = Math.max(Math.abs(b.x) - 1, 0), dz = Math.max(Math.abs(b.z) - 1, 0);
      expect(Math.hypot(dx, dz)).toBeGreaterThan(R - 1e-3);
    }
    expect(b.z).toBeLessThan(-3);
  });

  it('ramps: stands without drift, climbs a walkable slope, slides off one over the limit', () => {
    for (const deg of [20, 30, 36.87, 44]) {
      const run = 10, rise = Math.tan(deg * DEG) * run;
      const w = scene([FLOOR(), solid({ shape: 'ramp', rise: '-z', pos: [0, rise / 2, -5], size: [6, rise, run], role: 'stairs' })]);
      const still = walk(w, body(0, rise / 2, -5), 0, 0, 120);
      expect(still.x).toBe(0); expect(still.z).toBe(-5);                   // "walkable normals push straight up"
      const lift = R * (1 / Math.cos(deg * DEG) - 1);                     // a sphere on a slope rides this far above the surface under its axis
      expect(still.y).toBeCloseTo(rise / 2 + lift, 3);
      expect(still.grounded).toBe(true);
      const res = w.createResolve();
      w.resolveCapsule(0, rise / 2 - 0.05, -5, R, H, COS45, res);
      expect(res.groundNy).toBeCloseTo(Math.cos(deg * DEG), 5);
      expect(res.groundNz).toBeCloseTo(Math.sin(deg * DEG), 5);
      expect(res.hitWall).toBe(false);
      const up = walk(w, body(0, 0, 2), 0, -4, 150);
      expect(up.z).toBeCloseTo(2 - 10, 3);
      expect(up.y).toBeCloseTo(rise * 0.8 + lift, 2);
      expect(up.grounded).toBe(true);
    }
    for (const deg of [46, 60]) {
      const run = 4, rise = Math.tan(deg * DEG) * run;
      const w = scene([FLOOR(), solid({ shape: 'ramp', rise: '-z', pos: [0, rise / 2, -2], size: [6, rise, run] })]);
      const res = w.createResolve();
      w.resolveCapsule(0, rise / 2 - 0.05, -2, R, H, COS45, res);
      expect(res.grounded).toBe(false);
      expect(res.hitWall).toBe(true);
      const slid = walk(w, body(0, rise / 2, -2), 0, 0, 240);            // gravity alone takes it back down
      expect(slid.y).toBeLessThan(0.05);
      expect(slid.z).toBeGreaterThan(0 - 1e-3);
      const tried = walk(w, body(0, 0, 2), 0, -4, 240);                  // and walking at it gets nowhere
      expect(tried.y).toBeLessThan(0.6);
      // nowhere on its face is it ground, the triangle seam included
      for (let i = 0; i < 400; i++) {
        const x = -2.9 + (i % 20) * 0.29, z = -1 - Math.floor(i / 20) * 0.14, y = (-z) * Math.tan(deg * DEG);
        w.resolveCapsule(x, y + 0.1, z, R, H, COS45, res);
        expect(res.grounded, `${deg} deg at ${x}, ${z}`).toBe(false);
      }
    }
  });

  it('a ramp exactly at the slope limit: repeatable, finite, bounded; a hair either side decides it', () => {
    const w = scene([FLOOR(), solid({ shape: 'ramp', rise: '-z', pos: [0, 2, -2], size: [6, 4, 4] })]);   // 45 degrees
    const res = w.createResolve(), again = w.createResolve(), seen = new Set<boolean>();
    for (let i = 0; i < 50; i++) {
      const z = -0.5 - i * 0.06;
      w.resolveCapsule(0, -z - 0.03, z, R, H, COS45, res);
      w.resolveCapsule(0, -z - 0.03, z, R, H, COS45, again);
      expect(again).toEqual(res);
      if (z < -1.2) { expect(res.grounded).toBe(!res.hitWall); seen.add(res.grounded); }   // clear of the floor: the ramp alone decides
      expect(res.grounded || res.hitWall).toBe(true);
      expect(Number.isFinite(res.x + res.y + res.z)).toBe(true);
      expect(Math.hypot(res.x, res.y + z + 0.03, res.z - z)).toBeLessThan(0.26);     // the push is the penetration, as a wall or as ground
      expect(w.capsuleFree(res.x, res.y, res.z, R, H)).toBe(true);
    }
    expect(seen.size).toBe(1);                                             // one answer for the whole face
    for (const [limit, walkable] of [[45.5, true], [44.5, false]] as const) {
      w.resolveCapsule(0, 1.47, -1.5, R, H, Math.cos(limit * DEG), res);
      expect(res.grounded).toBe(walkable);
      expect(res.hitWall).toBe(!walkable);
      if (walkable) { expect(res.x).toBe(0); expect(res.z).toBe(-1.5); }
    }
  });

  it('ledges: 0.2 m rolls over by itself, 0.3 m and 0.5 m block the bare capsule', () => {
    for (const [h, climbs] of [[0.1, true], [0.2, true], [0.3, false], [0.5, false]] as const) {
      const w = scene([FLOOR(), solid({ pos: [0, h / 2, -6], size: [6, h, 8], role: 'platform' })]);
      const b = walk(w, body(0, 0, 0), 0, -4, 120);
      if (climbs) { expect(b.z).toBeLessThan(-4); expect(b.y).toBeCloseTo(h, 3); expect(b.grounded).toBe(true); } else { expect(b.z).toBeGreaterThan(-2 + R - 0.02); expect(b.y).toBeLessThan(h); }
    }
  });

  it('step-up by lift-move-drop: 0.35 m climbs, 0.5 m does not, and a 0.3 m flight of stairs is walked', () => {
    const w = scene([FLOOR(), solid({ pos: [0, 0.175, -6], size: [6, 0.35, 8], role: 'platform' })]);
    const b = walk(w, body(0, 0, 0), 0, -4, 120, { stepUp: true });
    expect(b.z).toBeLessThan(-4); expect(b.y).toBeCloseTo(0.35, 3); expect(b.grounded).toBe(true);
    const w2 = scene([FLOOR(), solid({ pos: [0, 0.25, -6], size: [6, 0.5, 8], role: 'platform' })]);
    const b2 = walk(w2, body(0, 0, 0), 0, -4, 120, { stepUp: true });
    expect(b2.z).toBeGreaterThan(-2 + R - 0.02); expect(b2.y).toBeCloseTo(0, 3);
    // twelve risers of 0.3 m, treads of 0.4 m
    const stairs = [FLOOR()];
    for (let i = 0; i < 12; i++) stairs.push(solid({ pos: [0, (i + 1) * 0.15, -2 - i * 0.4 - 5], size: [3, (i + 1) * 0.3, 10], role: 'stairs', surface: 'wood' }));
    const w3 = scene(stairs);
    const b3 = walk(w3, body(0, 0, 0), 0, -3, 240, { stepUp: true });
    expect(b3.y).toBeCloseTo(3.6, 3);
    expect(b3.z).toBeLessThan(-7);
    const blocked = walk(w3, body(0, 0, 0), 0, -3, 300);
    expect(blocked.y).toBeLessThan(0.3);
  });

  it('stairs as the layout builds them (a ramp solid) are walked up and down without leaving the ground', () => {
    const w = scene([FLOOR(), solid({ shape: 'ramp', rise: '-z', pos: [0, 1.5, -4], size: [2, 3, 4], role: 'stairs', skirt: 0.5 }), solid({ pos: [0, 1.5, -9], size: [6, 3, 6], role: 'platform' })]);
    const b = body(0, 0, 0);
    let air = 0;
    for (let i = 0; i < 150; i++) { walk(w, b, 0, -4, 1); if (!b.grounded) air++; }
    expect(b.y).toBeCloseTo(3, 3); expect(b.z).toBeLessThan(-8);
    expect(air).toBeLessThanOrEqual(2);
    for (let i = 0; i < 200; i++) walk(w, b, 0, 3, 1);
    expect(b.y).toBeCloseTo(0, 3);
  });

  it('thin walls at high speed: 5 cm of wall holds at 60 m/s with three sub-steps, from either side', () => {
    const w = scene([FLOOR(), solid({ pos: [0, 1.5, -10], size: [30, 3, 0.05] })]);
    const north = walk(w, body(0, 0, 0), 0, -60, 60, { sub: 3 });
    expect(north.z).toBeCloseTo(-10 + 0.025 + R, 4);
    const south = walk(w, body(0, 0, -20), 0, 60, 60, { sub: 3 });
    expect(south.z).toBeCloseTo(-10 - 0.025 - R, 4);
    // 20 m/s in one sub-step (0.333 m a step, the contract's limit) and at an angle
    const one = walk(w, body(-8, 0, 0), 9, -18, 120, { sub: 1 });
    expect(one.z).toBeCloseTo(-10 + 0.025 + R, 4);
    // every start offset inside one step length
    for (let i = 0; i < 40; i++) {
      const b = walk(w, body(0, 0, -5 - i * 0.0083), 0, -60, 30, { sub: 3 });
      expect(b.z).toBeGreaterThan(-10 + R);
    }
  });

  it('a thin box collider (a door) holds at high speed too', () => {
    const w = scene([FLOOR()]);
    w.addBox(0, 1.1, -10, 0.6, 1.1, 0.04, 0, 'wood', 0, ent('door_a', 'door'));
    const b = walk(w, body(0, 0, 0), 0, -60, 60, { sub: 3 });
    expect(b.z).toBeCloseTo(-10 + 0.04 + R, 4);
    const side = walk(w, body(0.3, 0, -20), 0, 60, 60, { sub: 3 });
    expect(side.z).toBeCloseTo(-10 - 0.04 - R, 4);
  });

  it('a capsule that starts slightly inside geometry is pushed back out the way it came', () => {
    const w = scene([FLOOR(), solid({ pos: [0, 1.5, -5.5], size: [10, 3, 1] })]);
    const res = w.createResolve();
    // axis 0.1 m and 0.3 m behind the wall's south face (z = -5)
    for (const inside of [0.1, 0.3]) {
      w.resolveCapsule(0, 0, -5 - inside, R, H, COS45, res);
      expect(res.z).toBeCloseTo(-5 + R, 6);
      expect(res.x).toBeCloseTo(0, 9);
      expect(res.hitWall).toBe(true);
      expect(res.wallNz).toBeCloseTo(1, 6);
    }
    // sphere overlap only (the usual case)
    w.resolveCapsule(0, 0, -5 + 0.05, R, H, COS45, res);
    expect(res.z).toBeCloseTo(-5 + R, 6);
    // feet under the floor: partly (axis above), wholly (lower sphere centre below), and far enough that the axis crosses
    for (const sink of [0.2, 0.45, 0.6, 0.9]) {
      w.resolveCapsule(3, -sink, 3, R, H, COS45, res);
      expect(res.y).toBeCloseTo(0, 6);
      expect(res.x).toBe(3); expect(res.z).toBe(3);
      expect(res.grounded).toBe(true);
    }
    // standing in the corner of wall and floor, inside both
    w.resolveCapsule(0, -0.2, -5 - 0.05, R, H, COS45, res);
    expect(res.y).toBeCloseTo(0, 6); expect(res.z).toBeCloseTo(-5 + R, 6);
    expect(w.capsuleFree(res.x, res.y, res.z, R, H)).toBe(true);
  });

  it('inside a box collider: leaves through the nearest face', () => {
    const w = scene([FLOOR()]);
    w.addBox(0, 1, 0, 1, 1, 2, 0, 'wood', ColFlag.LOW, null);
    const res = w.createResolve();
    w.resolveCapsule(0.8, 0, 0.3, R, H, COS45, res);
    expect(res.x).toBeCloseTo(1 + R, 6); expect(res.z).toBeCloseTo(0.3, 6);
    expect(res.hitWall).toBe(true); expect(res.wallFlags).toBe(ColFlag.LOW);
    w.resolveCapsule(0.2, 1.95 - R, 0.1, R, H, COS45, res);     // lower sphere centre just under the lid: up is nearest
    expect(res.y).toBeCloseTo(2, 6);
    expect(res.grounded).toBe(true);
  });

  it('ceilings: a jump under a low ceiling reports hitCeiling and never passes it', () => {
    const w = scene([FLOOR(), solid({ pos: [0, 2.5, 0], size: [8, 0.5, 8], role: 'ceiling' })]);   // underside at 2.25
    const b = body(0, 0, 0);
    walk(w, b, 0, 0, 2);
    b.vy = 7.5; b.grounded = false;
    let bumped = false, top = 0;
    for (let i = 0; i < 60; i++) { walk(w, b, 0, 0, 1); bumped ||= b.hitCeiling; top = Math.max(top, b.y); }
    expect(bumped).toBe(true);
    expect(top).toBeLessThanOrEqual(2.25 - H + 1e-6);
    expect(top).toBeGreaterThan(2.25 - H - 0.05);
    expect(b.y).toBeCloseTo(0, 4); expect(b.grounded).toBe(true);
    const res = w.createResolve();
    w.resolveCapsule(0, 0.6, 0, R, H, COS45, res);
    expect(res.hitCeiling).toBe(true); expect(res.hitWall).toBe(false); expect(res.grounded).toBe(false);
    expect(res.y).toBeCloseTo(0.45, 6);
  });

  it('BODY_ONLY triangles block the capsule; a switched-off solid does not; state survives a rebuild', () => {
    const solids = [FLOOR(), solid({ id: 'guard', pos: [0, 1.5, -5.5], size: [10, 3, 1], playerOnly: true, invisible: true }), solid({ id: 'ladder', pos: [0, 1.5, 5.5], size: [10, 3, 1], dynamic: true })];
    const w = scene(solids);
    expect(walk(w, body(0, 0, 0), 0, -6, 90).z).toBeCloseTo(-5 + R, 5);
    expect(walk(w, body(0, 0, 0), 0, 6, 90).z).toBeCloseTo(5 - R, 5);
    w.setSolidEnabled('ladder', false);
    expect(walk(w, body(0, 0, 0), 0, 6, 90).z).toBeCloseTo(9, 3);
    expect(w.capsuleFree(0, 0, 5.5, R, H)).toBe(true);
    scene(solids, w);                                                    // world rebuilds the set (buildSet / stageZone)
    expect(walk(w, body(0, 0, 0), 0, 6, 90).z).toBeCloseTo(9, 3);
    w.setSolidEnabled('ladder', true);
    expect(walk(w, body(0, 0, 0), 0, 6, 90).z).toBeCloseTo(5 - R, 5);
    expect(w.capsuleFree(0, 0, 5.5, R, H)).toBe(false);
    w.setSolidEnabled('no_such_solid', false);                           // remembered, harmless
  });

  it('boxes: a rotated box blocks along its faces, can be stood on, moved, disabled and removed', () => {
    const w = scene([FLOOR()]);
    const h = w.addBox(0, 0.5, -5, 3, 0.5, 0.5, 45 * DEG, 'wood', ColFlag.PIERCE, ent('crate_1', 'breakable'));
    expect(w.stats.boxes).toBe(1);
    const res = w.createResolve();
    const b = walk(w, body(0, 0, 0), 0, -3, 200);
    // pushed against a 45 degree face it slides along it; it never enters the box
    const lx = b.x * Math.cos(45 * DEG) - (b.z + 5) * Math.sin(45 * DEG), lz = b.x * Math.sin(45 * DEG) + (b.z + 5) * Math.cos(45 * DEG);
    expect(Math.hypot(Math.max(Math.abs(lx) - 3, 0), Math.max(Math.abs(lz) - 0.5, 0))).toBeGreaterThan(R - 1e-4);
    expect(b.wallFlags).toBe(ColFlag.PIERCE);
    w.resolveCapsule(0, 0.95, -5, R, H, COS45, res);
    expect(res.y).toBeCloseTo(1, 6); expect(res.grounded).toBe(true); expect(res.groundSurface).toBe('wood');
    expect(w.groundHeight(0, 3, -5, 5)).toBeCloseTo(1, 9);
    w.setBoxTransform(h, 20, 0.5, -5, 0);
    expect(w.groundHeight(0, 3, -5, 5)).toBeCloseTo(0, 6);
    expect(w.groundHeight(22.9, 3, -5, 5)).toBeCloseTo(1, 9);
    w.setBoxEnabled(h, false);
    expect(w.groundHeight(22.9, 3, -5, 5)).toBeCloseTo(0, 6);
    expect(w.capsuleFree(20, 0, -5, R, H)).toBe(true);
    w.setBoxEnabled(h, true);
    expect(w.capsuleFree(20, 0, -5, R, H)).toBe(false);
    w.removeBox(h);
    expect(w.stats.boxes).toBe(0);
    expect(w.capsuleFree(20, 0, -5, R, H)).toBe(true);
    w.setBoxEnabled(h, true); w.setBoxTransform(h, 0, 0, 0, 0); w.removeBox(h);   // stale handle: ignored
    expect(w.stats.boxes).toBe(0);
    const h2 = w.addBox(0, 0, 0, 1, 1, 1, 0, 'wood', 0, null);
    expect(h2).not.toBe(h);
    w.setBoxEnabled(h, false);                                                    // the old handle must not reach the new box
    expect(w.capsuleFree(0, 0, 0, R, H)).toBe(false);
  });

  it('holds 64 boxes and refuses the 65th', () => {
    const w = new CollisionWorldImpl();
    for (let i = 0; i < MAX_BOXES; i++) w.addBox(i * 3, 0, 0, 1, 1, 1, 0, 'wood', 0, null);
    expect(w.stats.boxes).toBe(64);
    expect(() => w.addBox(0, 0, 0, 1, 1, 1, 0, 'wood', 0, null)).toThrow(/64/);
    expect(w.capsuleFree(63 * 3, 0, 0, R, H)).toBe(false);
  });

  it('fuzz: bodies thrown about a thin-walled, cluttered room for ten seconds each never leave it', () => {
    const T = 0.05, HALF = 6, TOP = 4;
    const room = (steepRampX: number): CollisionWorldImpl => {
      const w = scene([
        FLOOR(),
        solid({ pos: [0, 2, -HALF - T / 2], size: [14, 4, T] }), solid({ pos: [0, 2, HALF + T / 2], size: [14, 4, T] }),
        solid({ pos: [-HALF - T / 2, 2, 0], size: [T, 4, 14] }), solid({ pos: [HALF + T / 2, 2, 0], size: [T, 4, 14] }),
        solid({ pos: [0, TOP + T / 2, 0], size: [14, T, 14], role: 'ceiling' }),
        solid({ pos: [-2, 2, -2], size: [0.6, 4, 0.6] }),                                 // pillar
        solid({ pos: [2.5, 0.1, 2.5], size: [3, 0.2, 3], role: 'platform' }),             // a ledge to roll over
        solid({ pos: [3, 1, -4.5], size: [0.05, 2, 3], rotY: 25 }),                       // a thin slanted screen: an acute wedge with the north wall
        solid({ shape: 'ramp', rise: '+x', pos: [-4, 0.75, 3], size: [3, 1.5, 2.5], skirt: 0.2 }),
        solid({ shape: 'ramp', rise: '-z', pos: [steepRampX, 1.5, -1], size: [2, 3, 2] }), // too steep to walk (56 degrees)
        solid({ shape: 'cylinder', pos: [-3.5, 1, -4], size: [1.6, 2, 1.6] }),
      ]);
      w.addBox(0.5, 0.6, 3.5, 0.9, 0.6, 0.4, 0.6, 'wood', 0, null);
      w.addBox(-1, 1.1, 5.2, 0.6, 1.1, 0.03, 1.2, 'wood', 0, null);                        // an open door leaf near the wall
      return w;
    };
    // Pass 1: 60 m/s bursts with three sub-steps (0.333 m a step, the contract's limit). The claim is the
    // nothing passes a wall, the floor or the ceiling, and nothing is left overlapping them.
    // Pass 2: the speeds things really move at (a 12 m/s charge), with the steep ramp pulled to 0.5 m
    // from the wall: a slot narrower than the body, rising under the ceiling. (At 60 m/s that slot is a
    // squeeze that depenetration alone cannot answer: a body rides up the ramp's edge into the ceiling.)
    for (const [bodies, fast, slack, rampX] of [[60, 60, 0.002, 4], [60, 12, 0.002, 4.5]] as const) {
      const w = room(rampX), rnd = rng(42 + fast);
      let worst = 0, overlapping = 0;
      for (let n = 0; n < bodies; n++) {
        const b = walk(w, body((rnd() - 0.5) * 3, 0, (rnd() - 0.5) * 3 + 0.5), 0, 0, 5);
        let vx = 0, vz = 0;
        for (let tick = 0; tick < 600; tick++) {
          if (tick % 12 === 0) {
            const a = rnd() * Math.PI * 2, sp = rnd() < 0.4 ? fast : rnd() * fast * 0.4;
            vx = Math.cos(a) * sp; vz = Math.sin(a) * sp;
            if (b.grounded && rnd() < 0.4) { b.vy = 7.5; b.grounded = false; }
          }
          walk(w, b, vx, vz, 1, { sub: 3 });
          const over = Math.max(Math.abs(b.x) - (HALF - R), Math.abs(b.z) - (HALF - R), -b.y, b.y + H - TOP);
          worst = Math.max(worst, over);
          if (!w.capsuleFree(b.x, b.y, b.z, R - 0.002, H - 0.004)) overlapping++;           // 2 mm inside anything in the room
          if (!(over <= slack)) throw new Error(`at ${fast} m/s body ${n} is ${(over * 1000).toFixed(1)} mm into the shell at tick ${tick}: ${b.x.toFixed(4)}, ${b.y.toFixed(4)}, ${b.z.toFixed(4)} moving ${vx.toFixed(1)}, ${vz.toFixed(1)}`);
        }
      }
      console.log(`[collision fuzz] ${bodies} bodies x 600 ticks at up to ${fast} m/s: deepest overlap with the room's shell ${(worst * 1000).toFixed(2)} mm; ticks ending more than 2 mm inside any solid or box: ${overlapping}`);
      expect(overlapping).toBeLessThanOrEqual(bodies * 600 * 0.0005);
    }
  });

  it('a sphere-shaped capsule (height = 2 r) and a capsule in a tight shaft resolve without NaN', () => {
    const w = scene([FLOOR(), solid({ pos: [0.8, 1.5, 0], size: [1, 3, 6] }), solid({ pos: [-0.8, 1.5, 0], size: [1, 3, 6] })]);   // a 0.6 m slot for a 0.7 m body
    const res = w.createResolve();
    w.resolveCapsule(0, 0, 0, R, H, COS45, res);
    expect(Number.isFinite(res.x + res.y + res.z)).toBe(true);
    expect(Math.abs(res.x)).toBeLessThan(0.2);
    w.resolveCapsule(5, -0.1, 5, 0.3, 0.6, COS45, res);
    expect(res.y).toBeCloseTo(0, 6); expect(res.grounded).toBe(true);
    w.resolveCapsule(5, -0.1, 5, 0.3, 0.2, COS45, res);                 // height below the diameter: treated as a sphere
    expect(res.y).toBeCloseTo(0, 6);
  });
});

// ------------------------------------------------------------------------------------------------
// groundHeight, capsuleFree
// ------------------------------------------------------------------------------------------------

describe('resolveCapsule: what a controller has to know (round 2)', () => {
  // THE LEDGE LIFT. A capsule pressed against a ledge whose top is below the centre of its lower sphere (one radius,
  // 0.35 m, above its feet) is carried ONTO the top by the walkable push; above that the ledge is a wall. So a
  // controller that lifts the capsule by its own step height reaches step + radius, and a jump reaches apex + radius:
  // with an apex of 1.0 m a 1.3 m cover box is mounted unless the controller checks the height it gained.
  it('a ledge up to one radius above the feet is climbed by the engine itself; above that it is a wall', () => {
    const w = scene([FLOOR(), solid({ pos: [5, 0.5, 0], size: [4, 1, 4], role: 'platform' })]);     // top at y = 1, its -x face at x = 3
    const r = w.createResolve();
    // feet h below the top, the rim pushed `pen` into the face; returns the height gained
    const into = (h: number, pen: number, cos = COS45): number => { w.resolveCapsule(3 - R + pen, 1 - h, 0, R, H, cos, r); return r.y - (1 - h); };
    // pressed hard (0.34 m) against a ledge 0.30 m up: not pushed back, carried up onto it
    let gained = into(0.30, 0.34);
    expect(r.x).toBeCloseTo(3 - 0.01, 3); expect(r.hitWall).toBe(false);
    expect(gained).toBeGreaterThan(0.30); expect(gained).toBeLessThan(0.31);
    // 0.32 m up: carried past the top (0.336 m) and left in the air above it
    gained = into(0.32, 0.34);
    expect(r.x).toBeCloseTo(3 - 0.01, 3); expect(r.grounded).toBe(false);
    expect(gained).toBeGreaterThan(0.32); expect(gained).toBeLessThan(0.35);
    // above one radius: a wall, however hard it is pressed
    for (const h of [0.36, 0.5, 0.8, 1.0]) {
      for (const pen of [0.05, 0.2, 0.3, 0.34]) {
        expect(into(h, pen)).toBeCloseTo(0, 4); expect(r.x).toBeCloseTo(3 - R, 4); expect(r.hitWall).toBe(true);
      }
    }
    // a light press on a ledge near the limit is a wall too (the lower sphere meets the face, not the lip)
    expect(into(0.30, 0.05)).toBeLessThan(0.02); expect(r.hitWall).toBe(true);
    // Just under the limit the answer is knife-edged (h 0.34 pressed 0.34 m: carried 0.475 m up with one walkable
    // limit, pushed back as a wall with another a thousandth away), so what is pinned is the BOUND: over the whole
    // range the engine never lifts a capsule more than radius + 0.13 m, and it does lift it more than 0.3 m.
    let most = 0;
    for (const cos of [COS45, COS45 - 1e-3]) {
      for (let h = 0.02; h < R; h += 0.02) {
        for (let pen = 0.02; pen < R; pen += 0.02) {
          gained = into(h, pen, cos);
          expect(gained).toBeGreaterThan(-1e-6); expect(gained).toBeLessThanOrEqual(R + 0.13);
          expect(Math.max(0, gained - h)).toBeLessThanOrEqual(0.14);          // the overshoot past the top
          if (gained > most) most = gained;
        }
      }
    }
    expect(most).toBeGreaterThan(0.30);
    expect(into(0.34, 0.34, COS45 - 1e-3)).toBeCloseTo(0.475, 2);              // the measured worst case (the stub player's walkable limit)
  });

  // NARROW WEDGES. Two walls meeting at less than 10 degrees used to squeeze the capsule 2-3 cm into them (the push out
  // of one went straight into the other). The layout has one: ty_table_end (rotY 8) against ty_wall_n.
  it('a V of 6, 8, 12 and 20 degrees: walked and sprinted into, the capsule stops where geometry says and is never inside a wall', () => {
    for (const deg of [6, 8, 12, 20]) {
      const a = (deg / 2) * DEG, L = 14, T = 0.3;
      const walls = [1, -1].map((sgn) => solid({ pos: [sgn * Math.sin(a) * L / 2, 2, -20 + Math.cos(a) * L / 2], size: [T, 4, L], rotY: sgn * deg / 2 }));
      const w = scene([FLOOR(), ...walls]);
      const stop = -20 + (R + T / 2) / Math.sin(a);              // where a capsule of radius R touches both inner faces
      for (const speed of [5, 7, 12]) {
        const b = walk(w, body(0, 0, -20 + L * Math.cos(a) - 1.0 > stop + 1 ? stop + 1.5 : stop + 0.6), 0, 0, 5);
        let inside = 0, deepest = Infinity;
        for (let tick = 0; tick < 360; tick++) {
          // straight in, then pressed into one wall and the other
          const side = tick < 120 ? 0 : tick < 240 ? 0.6 : -0.6;
          walk(w, b, side * speed, -speed, 1);
          if (!w.capsuleFree(b.x, b.y + 0.02, b.z, R - 0.02, H - 0.04)) inside++;
          if (b.z < deepest) deepest = b.z;
          expect(Number.isFinite(b.x) && Number.isFinite(b.z)).toBe(true);
        }
        expect(inside, `${deg} degrees at ${speed} m/s: ticks with the capsule more than 2 cm inside a wall`).toBe(0);
        expect(deepest, `${deg} degrees at ${speed} m/s: deepest z against the geometric stop ${stop.toFixed(3)}`).toBeGreaterThan(stop - 0.03);
        expect(b.grounded).toBe(true);
        // and she can back out
        walk(w, b, 0, 5, 60);
        expect(b.z).toBeGreaterThan(stop + 3);
      }
    }
  });
});

describe('groundHeight and capsuleFree', () => {
  it('groundHeight: floor, limit, boxes, BODY_ONLY, the filled hit', () => {
    const w = scene([FLOOR(), solid({ id: 'deck', pos: [10, 1.9, 0], size: [4, 0.2, 4], role: 'platform', surface: 'wood' }), solid({ id: 'lid', pos: [-10, 0.95, 0], size: [4, 0.1, 4], playerOnly: true })]);
    const hit = w.createHit();
    expect(w.groundHeight(0, 1, 0, 5)).toBeCloseTo(0, 9);
    expect(w.groundHeight(0, 6, 0, 5)).toBeNaN();
    expect(w.groundHeight(0, 5, 0, 5)).toBeCloseTo(0, 9);
    expect(w.groundHeight(0, 0, 0, 1)).toBeCloseTo(0, 9);                 // starting exactly on the ground
    expect(w.groundHeight(10, 3, 0, 5, hit)).toBeCloseTo(2, 6);
    expect(hit).toMatchObject({ hit: true, surface: 'wood', solidId: 'deck', layer: Layer.WORLD, entity: null, nx: 0, ny: 1, nz: 0 });
    expect(hit.distance).toBeCloseTo(1, 6); expect(hit.y).toBeCloseTo(2, 6);
    expect(w.groundHeight(10, 1.5, 0, 5)).toBeCloseTo(0, 9);              // from under the deck
    expect(w.groundHeight(-10, 3, 0, 5, hit)).toBeCloseTo(1, 6);          // BODY_ONLY is ground for bodies
    expect(hit.flags & ColFlag.BODY_ONLY).toBe(ColFlag.BODY_ONLY);
    expect(w.groundHeight(500, 3, 0, 5, hit)).toBeNaN();
    expect(hit.hit).toBe(false);
    expect(w.stats.rays).toBe(8);
  });

  it('groundHeight follows the ramp convention of tools/layout_geom.mjs for all four rise directions and a rotation', () => {
    for (const rise of ['+x', '-x', '+z', '-z'] as const) for (const rotY of [0, 37, 90, 200]) {
      const s = solid({ shape: 'ramp', rise, pos: [3, 2, -4], size: [6, 2, 8], rotY, skirt: 0.5 });
      const w = scene([s]);
      const rnd = rng(7);
      for (let i = 0; i < 40; i++) {
        const lx = (rnd() - 0.5) * 5.8, lz = (rnd() - 0.5) * 7.8;
        const r = rotY * DEG, c = Math.cos(r), sn = Math.sin(r);
        const x = 3 + lx * c + lz * sn, z = -4 - lx * sn + lz * c;       // toWorld of layout_geom
        const t = rise === '+x' ? (lx + 3) / 6 : rise === '-x' ? (3 - lx) / 6 : rise === '+z' ? (lz + 4) / 8 : (4 - lz) / 8;
        expect(w.groundHeight(x, 10, z, 20)).toBeCloseTo(1 + t * 2, 4);  // topAt of layout_geom
      }
      // solid beneath, down to pos.y - size.y/2 - skirt
      const hit = w.createHit();
      expect(w.raycast(3, -5, -4, 0, 1, 0, 20, Layer.WORLD, hit)).toBe(true);
      expect(hit.y).toBeCloseTo(0.5, 5);
    }
  });

  it('cylinders: a drum is a round top; an annulus has a hole and a rim', () => {
    const w = scene([solid({ id: 'drum', shape: 'cylinder', pos: [0, 3, 0], size: [8, 6, 8] }), solid({ id: 'kerb', shape: 'cylinder', pos: [40, 0.25, 0], size: [12, 0.5, 12], innerRadius: 4 })]);
    expect(w.groundHeight(0, 10, 0, 20)).toBeCloseTo(6, 6);
    expect(w.groundHeight(3.9, 10, 0, 20)).toBeCloseTo(6, 6);
    expect(w.groundHeight(4.2, 10, 0, 20)).toBeNaN();
    expect(w.groundHeight(40, 10, 0, 20)).toBeNaN();                      // the hole
    expect(w.groundHeight(45, 10, 0, 20)).toBeCloseTo(0.5, 6);
    expect(w.groundHeight(40, 10, 5.5, 20)).toBeCloseTo(0.5, 6);
    const b = walk(w, body(10, 0, 0), -6, 0, 120, { gravity: false });
    expect(b.x).toBeGreaterThan(4 + R - 0.04); expect(b.x).toBeLessThan(4 + R + 1e-3);   // chord error under 3 cm
  });

  it('capsuleFree: free in the open and when resting, blocked by walls, boxes and BODY_ONLY', () => {
    const w = scene([FLOOR(), solid({ pos: [0, 1.5, -5.5], size: [10, 3, 1] }), solid({ id: 'guard', pos: [20, 1.5, 0], size: [1, 3, 1], playerOnly: true })]);
    expect(w.capsuleFree(0, 0, 0, R, H)).toBe(true);                      // resting contact is free
    expect(w.capsuleFree(0, -0.01, 0, R, H)).toBe(false);
    expect(w.capsuleFree(0, 0, -5 + R, R, H)).toBe(true);
    expect(w.capsuleFree(0, 0, -5 + R - 0.01, R, H)).toBe(false);
    expect(w.capsuleFree(0, 0, -5.5, R, H)).toBe(false);                  // axis right through the wall
    expect(w.capsuleFree(0, 3.01, -5.5, R, H)).toBe(true);                // standing on top of it
    expect(w.capsuleFree(20, 0, 0.7, R, H)).toBe(false);
    expect(w.capsuleFree(0, 50, 0, R, H)).toBe(true);
    const h = w.addBox(8, 1, 8, 1, 1, 1, 30 * DEG, 'wood', 0, null);
    expect(w.capsuleFree(8, 0, 8, R, H)).toBe(false);
    expect(w.capsuleFree(8, 2.001, 8, R, H)).toBe(true);
    expect(w.capsuleFree(8, 0, 10.5, R, H)).toBe(true);
    w.setBoxEnabled(h, false);
    expect(w.capsuleFree(8, 0, 8, R, H)).toBe(true);
  });
});

// ------------------------------------------------------------------------------------------------
// raycast
// ------------------------------------------------------------------------------------------------

describe('raycast', () => {
  it('nearest static hit: distance, point, normal toward the shooter, surface, flags, solid id', () => {
    const w = scene([FLOOR(), solid({ id: 'wall_a', pos: [0, 1.5, -5.5], size: [10, 3, 1], surface: 'adobe', pierce: true, low: true }), solid({ id: 'wall_b', pos: [0, 1.5, -9], size: [10, 3, 1] })]);
    const hit = w.createHit();
    expect(w.raycast(1, 1.65, 0, 0, 0, -1, 100, LAYER_SHOT, hit)).toBe(true);
    expect(hit).toMatchObject({ hit: true, surface: 'adobe', flags: ColFlag.PIERCE | ColFlag.LOW, layer: Layer.WORLD, entity: null, receiver: null, solidId: 'wall_a', part: 'whole' });
    expect(hit.distance).toBeCloseTo(5, 6);
    expect([hit.x, hit.y, hit.z]).toEqual([1, 1.65, expect.closeTo(-5, 6)]);
    expect([hit.nx, hit.ny, hit.nz]).toEqual([0, 0, 1]);
    // from the other side the normal turns round
    expect(w.raycast(1, 1.65, -7, 0, 0, 1, 100, LAYER_SHOT, hit)).toBe(true);
    expect(hit.solidId).toBe('wall_a'); expect(hit.nz).toBe(-1); expect(hit.distance).toBeCloseTo(1, 6);
    // oblique, onto the floor
    const d = Math.SQRT1_2;
    expect(w.raycast(3, 1, 3, 0, -d, d, 100, LAYER_SHOT, hit)).toBe(true);
    expect(hit.solidId).toBe('floor'); expect(hit.distance).toBeCloseTo(Math.SQRT2, 6); expect(hit.ny).toBe(1);
  });

  it('respects maxDistance and the layer mask; a miss is reported cleanly', () => {
    const w = scene([FLOOR(), solid({ pos: [0, 1.5, -5.5], size: [10, 3, 1] })]);
    const hit = w.createHit();
    expect(w.raycast(0, 1, 0, 0, 0, -1, 4.99, LAYER_SHOT, hit)).toBe(false);
    expect(hit).toMatchObject({ hit: false, entity: null, receiver: null, surface: 'none', solidId: '', flags: 0, layer: 0 });
    expect(hit.distance).toBe(4.99); expect(hit.z).toBeCloseTo(-4.99, 9);
    expect(w.raycast(0, 1, 0, 0, 0, -1, 5.01, LAYER_SHOT, hit)).toBe(true);
    expect(w.raycast(0, 1, 0, 0, 0, -1, 100, Layer.DYNAMIC | Layer.ENEMY, hit)).toBe(false);
    expect(w.raycast(0, 1, 0, 0, 1, 0, 1000, LAYER_SHOT, hit)).toBe(false);
  });

  it('BODY_ONLY triangles and switched-off solids are invisible to rays', () => {
    const w = scene([FLOOR(), solid({ id: 'guard', pos: [0, 1.5, -3], size: [10, 3, 0.2], playerOnly: true }), solid({ id: 'ladder', pos: [0, 1.5, -5], size: [10, 3, 0.2], dynamic: true }), solid({ id: 'back', pos: [0, 1.5, -8], size: [10, 3, 0.2] })]);
    const hit = w.createHit();
    w.raycast(0, 1, 0, 0, 0, -1, 100, LAYER_SHOT, hit);
    expect(hit.solidId).toBe('ladder');
    w.setSolidEnabled('ladder', false);
    w.raycast(0, 1, 0, 0, 0, -1, 100, LAYER_SHOT, hit);
    expect(hit.solidId).toBe('back');
    expect(w.lineOfSight(0, 1, 0, 0, 1, -7, 0)).toBe(true);
    w.setSolidEnabled('ladder', true);
    expect(w.lineOfSight(0, 1, 0, 0, 1, -7, 0)).toBe(false);
  });

  it('boxes are hit on Layer.DYNAMIC with their entity, surface, flags and face normal', () => {
    const w = scene([FLOOR()]);
    const door = ent('door_tally', 'door');
    const h = w.addBox(0, 1.1, -4, 0.6, 1.1, 0.05, 90 * DEG, 'wood', ColFlag.GRILLE, door);   // turned: its thin axis now lies along x
    const hit = w.createHit();
    expect(w.raycast(-3, 1, -4, 1, 0, 0, 50, LAYER_SHOT, hit)).toBe(true);
    expect(hit).toMatchObject({ layer: Layer.DYNAMIC, surface: 'wood', flags: ColFlag.GRILLE, solidId: '', part: 'whole', receiver: null });
    expect(hit.entity).toBe(door);
    expect(hit.distance).toBeCloseTo(3 - 0.05, 6);
    expect(hit.nx).toBeCloseTo(-1, 9); expect(hit.ny).toBe(0); expect(hit.nz).toBeCloseTo(0, 9);
    expect(w.raycast(0, 5, -4.3, 0, -1, 0, 50, LAYER_SHOT, hit)).toBe(true);    // top face
    expect(hit.y).toBeCloseTo(2.2, 9); expect(hit.ny).toBe(1);
    expect(w.raycast(-3, 1, -4, 1, 0, 0, 50, Layer.WORLD | Layer.ENEMY, hit)).toBe(false);
    expect(w.raycast(-3, 1, -3, 1, 0, 0, 50, LAYER_SHOT, hit)).toBe(false);     // passes beside it
    expect(w.raycast(0, 1, -4, 1, 0, 0, 50, LAYER_SHOT, hit)).toBe(true);       // from inside: distance 0, normal back at the shooter
    expect(hit.distance).toBe(0); expect(hit.nx).toBe(-1);
    w.setBoxEnabled(h, false);
    expect(w.raycast(-3, 1, -4, 1, 0, 0, 50, LAYER_SHOT, hit)).toBe(false);
    const bodyOnly = w.addBox(0, 1, 4, 1, 1, 1, 0, 'none', ColFlag.BODY_ONLY, null);
    expect(w.raycast(0, 1, 0, 0, 0, 1, 50, LAYER_SHOT, hit)).toBe(false);       // BODY_ONLY box: rays pass
    expect(w.lineOfSight(0, 1, 0, 0, 1, 8, 0)).toBe(true);
    expect(w.capsuleFree(0, 0, 4, R, H)).toBe(false);
    w.removeBox(bodyOnly);
  });

  it('volumes: entity, part, receiver, surface and layer come back; shapes are exact', () => {
    const w = scene([FLOOR()]);
    const receiver: HitReceiver = { onHit: () => undefined };
    const e = ent('bider#1');
    sphere(w, e, 0, 1, -10, 0.5, { receiver, surface: 'cloth', flags: ColFlag.PIERCE });
    const hit = w.createHit();
    expect(w.raycast(0, 1, 0, 0, 0, -1, 100, LAYER_SHOT, hit)).toBe(true);
    expect(hit).toMatchObject({ layer: Layer.ENEMY, surface: 'cloth', part: 'body', flags: ColFlag.PIERCE, solidId: '' });
    expect(hit.entity).toBe(e); expect(hit.receiver).toBe(receiver);
    expect(hit.distance).toBeCloseTo(9.5, 9); expect(hit.nz).toBeCloseTo(1, 9);
    expect(w.raycast(0.3, 1, 0, 0, 0, -1, 100, LAYER_SHOT, hit)).toBe(true);
    expect(hit.distance).toBeCloseTo(10 - 0.4, 9); expect(hit.nx).toBeCloseTo(0.6, 9); expect(hit.nz).toBeCloseTo(0.8, 9);
    expect(w.raycast(0.51, 1, 0, 0, 0, -1, 100, LAYER_SHOT, hit)).toBe(false);
    expect(w.raycast(0, 1, 0, 0, 0, 1, 100, LAYER_SHOT, hit)).toBe(false);      // behind the shooter
    expect(w.raycast(0, 1, 0, 0, 0, -1, 100, LAYER_SOLID, hit)).toBe(false);    // not on the mask
    expect(w.raycast(0, 1.2, -10.1, 0, 0, -1, 100, LAYER_SHOT, hit)).toBe(true); // origin inside the volume
    expect(hit.distance).toBe(0); expect(hit.nz).toBe(1);

    // capsule: side, cap, along the axis, and a miss past the cap
    const c = w.addVolume({ shape: 'capsule', layer: Layer.ENEMY, flags: 0, surface: 'metal', entity: ent('tamper#1', 'tamper'), part: 'body', priority: 0, receiver: null });
    w.setCapsule(c, 20, 0.5, -10, 20, 1.5, -10, 0.4);
    expect(w.raycast(20, 1, 0, 0, 0, -1, 100, LAYER_SHOT, hit)).toBe(true);
    expect(hit.distance).toBeCloseTo(9.6, 9); expect(hit.nz).toBeCloseTo(1, 9); expect(hit.surface).toBe('metal');
    expect(w.raycast(20, 1.7, 0, 0, 0, -1, 100, LAYER_SHOT, hit)).toBe(true);   // upper cap
    expect(hit.distance).toBeCloseTo(10 - Math.sqrt(0.16 - 0.04), 9); expect(hit.ny).toBeCloseTo(0.5, 9);
    expect(w.raycast(20, 1.91, 0, 0, 0, -1, 100, LAYER_SHOT, hit)).toBe(false);
    expect(w.raycast(20.1, 9, -10, 0, -1, 0, 100, LAYER_SHOT, hit)).toBe(true); // down the axis
    expect(hit.y).toBeCloseTo(1.5 + Math.sqrt(0.16 - 0.01), 9);
    expect(w.raycast(20, 0.1, 0, 0, 0, -1, 100, LAYER_SHOT, hit)).toBe(true);   // lower cap, just above the floor
    expect(hit.entity!.id).toBe('tamper#1');

    // box volume
    const b = w.addVolume({ shape: 'box', layer: Layer.SHOOTABLE, flags: 0, surface: 'ceramic', entity: ent('ia_jug_3', 'jug'), part: 'whole', priority: 0, receiver: null });
    w.setVolumeBox(b, 40, 1, -10, 0.5, 0.25, 0.1, 90 * DEG);
    expect(w.raycast(40, 1, 0, 0, 0, -1, 100, LAYER_SHOT, hit)).toBe(true);
    expect(hit.distance).toBeCloseTo(9.5, 9); expect(hit.layer).toBe(Layer.SHOOTABLE); expect(hit.entity!.kind).toBe('jug');
    expect(w.raycast(40.11, 1, 0, 0, 0, -1, 100, LAYER_SHOT, hit)).toBe(false);
    expect(w.stats.volumes).toBe(3);
  });

  it('one hit per entity: the highest-priority volume the ray crosses wins, even behind the body', () => {
    const w = scene([FLOOR()]);
    const e = ent('tamper#2', 'tamper');
    sphere(w, e, 0, 1, -10, 0.6, { part: 'body', priority: 0 });
    sphere(w, e, 0, 1, -10.5, 0.2, { part: 'vent_back', priority: 10 });
    sphere(w, e, 0, 1.9, -10, 0.2, { part: 'crown', priority: 10 });
    const hit = w.createHit();
    w.raycast(0, 1, 0, 0, 0, -1, 100, LAYER_SHOT, hit);
    expect(hit.part).toBe('vent_back'); expect(hit.distance).toBeCloseTo(10.3, 9); expect(hit.entity).toBe(e);
    w.raycast(0.4, 1, 0, 0, 0, -1, 100, LAYER_SHOT, hit);                 // misses the vent: body
    expect(hit.part).toBe('body');
    w.raycast(0, 1.9, 0, 0, 0, -1, 100, LAYER_SHOT, hit);
    expect(hit.part).toBe('crown');
    // equal priority: the nearer one
    const f = ent('windlass', 'windlass');
    sphere(w, f, 30, 1, -10, 0.3, { part: 'lens', priority: 10 });
    sphere(w, f, 30, 1, -12, 0.3, { part: 'mouth', priority: 10 });
    w.raycast(30, 1, 0, 0, 0, -1, 100, LAYER_SHOT, hit);
    expect(hit.part).toBe('lens');
  });

  it('the nearest entity wins; a wall hides what is behind it; a flush volume beats the wall it sits on', () => {
    const w = scene([FLOOR(), solid({ id: 'wall', pos: [0, 1.5, -20.5], size: [10, 3, 1] })]);
    const near = ent('bider#1'), far = ent('bider#2'), hidden = ent('bider#3'), plate = ent('ia_plate', 'range_plate');
    sphere(w, far, 0, 1, -15, 0.5);
    sphere(w, near, 0, 1, -8, 0.5);
    sphere(w, hidden, 0, 1, -25, 0.5);
    const hit = w.createHit();
    w.raycast(0, 1, 0, 0, 0, -1, 100, LAYER_SHOT, hit);
    expect(hit.entity).toBe(near);
    w.raycast(0, 1, -30, 0, 0, 1, 100, LAYER_SHOT, hit);
    expect(hit.entity).toBe(hidden);
    w.raycast(0, 1, -9, 0, 0, -1, 100, LAYER_SHOT, hit);
    expect(hit.entity).toBe(far);
    w.raycast(0, 1, -16, 0, 0, -1, 100, LAYER_SHOT, hit);
    expect(hit.solidId).toBe('wall'); expect(hit.entity).toBeNull();
    // a body whose weak point is behind a wall: the body in front is the hit
    const boss = ent('tamper#9', 'tamper');
    sphere(w, boss, 3, 1, -19.6, 0.3, { part: 'body' });
    sphere(w, boss, 3, 1, -22, 0.3, { part: 'vent_back', priority: 10 });
    w.raycast(3, 1, 0, 0, 0, -1, 100, LAYER_SHOT, hit);
    expect(hit.entity).toBe(boss); expect(hit.part).toBe('body');
    // a volume whose entry point is exactly on the wall face
    const pb = w.addVolume({ shape: 'box', layer: Layer.SHOOTABLE, flags: 0, surface: 'metal', entity: plate, part: 'whole', priority: 0, receiver: null });
    w.setVolumeBox(pb, -3, 1, -20.5, 0.3, 0.3, 0.5, 0);
    w.raycast(-3, 1, 0, 0, 0, -1, 100, LAYER_SHOT, hit);
    expect(hit.entity).toBe(plate);
  });

  it('volume lifecycle: unplaced, disabled, moved, removed, stale handles, capacity', () => {
    const w = new CollisionWorldImpl();
    const e = ent('bider#1');
    const hit = w.createHit();
    const h = w.addVolume({ shape: 'sphere', layer: Layer.ENEMY, flags: 0, surface: 'cloth', entity: e, part: 'body', priority: 0, receiver: null });
    expect(w.raycast(0, 0, 5, 0, 0, -1, 100, LAYER_SHOT, hit)).toBe(false);     // never placed: not at the origin by accident
    w.setSphere(h, 0, 0, 0, 0.5);
    expect(w.raycast(0, 0, 5, 0, 0, -1, 100, LAYER_SHOT, hit)).toBe(true);
    w.setVolumeEnabled(h, false);
    expect(w.raycast(0, 0, 5, 0, 0, -1, 100, LAYER_SHOT, hit)).toBe(false);
    w.setVolumeEnabled(h, true);
    w.setSphere(h, 3, 0, 0, 0.5);
    expect(w.raycast(0, 0, 5, 0, 0, -1, 100, LAYER_SHOT, hit)).toBe(false);
    expect(w.raycast(3, 0, 5, 0, 0, -1, 100, LAYER_SHOT, hit)).toBe(true);
    w.removeVolume(h);
    expect(w.stats.volumes).toBe(0);
    expect(w.raycast(3, 0, 5, 0, 0, -1, 100, LAYER_SHOT, hit)).toBe(false);
    const h2 = sphere(w, ent('bider#2'), 3, 0, 0, 0.5);
    expect(h2).not.toBe(h);
    w.setVolumeEnabled(h, false); w.setSphere(h, 99, 99, 99, 1); w.removeVolume(h);   // stale: must not touch the new one
    expect(w.raycast(3, 0, 5, 0, 0, -1, 100, LAYER_SHOT, hit)).toBe(true);
    expect(hit.entity!.id).toBe('bider#2');
    for (let i = 1; i < MAX_VOLUMES; i++) sphere(w, ent(`e${i}`), i * 2, 50, 0, 0.5);
    expect(w.stats.volumes).toBe(256);
    expect(() => sphere(w, ent('one_too_many'), 0, 0, 0, 1)).toThrow(/256/);
    expect(w.raycast(255 * 2, 60, 0, 0, -1, 0, 100, LAYER_SHOT, hit)).toBe(true);
    expect(hit.entity!.id).toBe('e255');
  });

  it('grazing rays: along a shared diagonal, through edges and corners, never slip between triangles', () => {
    const w = scene([solid({ id: 'crate', pos: [0, 1, 0], size: [2, 2, 2] })]);
    const hit = w.createHit();
    // every face of a box is two triangles: walk rays exactly along and across each face's diagonal
    for (let i = 0; i <= 200; i++) {
      const a = -1 + i * 0.01;
      expect(w.raycast(a, 5, a, 0, -1, 0, 10, Layer.WORLD, hit)).toBe(true);     // top, diagonal 0-2
      expect(hit.y).toBeCloseTo(2, 9);
      expect(w.raycast(a, 5, -a, 0, -1, 0, 10, Layer.WORLD, hit)).toBe(true);    // top, the other diagonal
      expect(w.raycast(a, 1 + a, 5, 0, 0, -1, 10, Layer.WORLD, hit)).toBe(true); // south face
      expect(hit.z).toBeCloseTo(1, 9);
      expect(w.raycast(a, 1 - a, 5, 0, 0, -1, 10, Layer.WORLD, hit)).toBe(true);
      expect(w.raycast(-5, 1 + a, a, 1, 0, 0, 10, Layer.WORLD, hit)).toBe(true); // west face
      expect(w.raycast(-5, 1 - a, a, 1, 0, 0, 10, Layer.WORLD, hit)).toBe(true);
    }
    // exactly through a vertical edge, a horizontal edge and a corner, square-on and diagonally
    const d = Math.SQRT1_2, d3 = 1 / Math.sqrt(3);
    expect(w.raycast(1, 1, 5, 0, 0, -1, 10, Layer.WORLD, hit)).toBe(true);        // down the east face's plane, onto the edge
    expect(hit.distance).toBeCloseTo(4, 9);
    expect(w.raycast(3, 1, 3, -d, 0, -d, 10, Layer.WORLD, hit)).toBe(true);       // at the vertical edge x = z = 1
    expect(hit.distance).toBeCloseTo(2 * Math.SQRT2, 9);
    expect(w.raycast(0, 4, 3, 0, -d, -d, 10, Layer.WORLD, hit)).toBe(true);       // at the top-south edge
    expect(hit.distance).toBeCloseTo(2 * Math.SQRT2, 9);
    expect(w.raycast(3, 4, 3, -d3, -d3, -d3, 10, Layer.WORLD, hit)).toBe(true);   // at the corner (1, 2, 1)
    expect(hit.distance).toBeCloseTo(2 * Math.sqrt(3), 6);
    // a hair outside: a miss
    expect(w.raycast(1.001, 1, 5, 0, 0, -1, 10, Layer.WORLD, hit)).toBe(false);
    expect(w.raycast(3, 2.001, 3, -d, 0, -d, 10, Layer.WORLD, hit)).toBe(false);     // over the top, along the diagonal
    expect(w.raycast(3.01, 1, 1, -1, 0, -1.0001 / 2, 10, Layer.WORLD, hit) && hit.distance < 1).toBe(false);
    // in the plane of the top face: finite, and whatever it reports is on the box
    const grazed = w.raycast(-5, 2, 0.3, 1, 0, 0, 20, Layer.WORLD, hit);
    expect(Number.isFinite(hit.distance + hit.x + hit.y + hit.z + hit.nx + hit.ny + hit.nz)).toBe(true);
    if (grazed) expect(hit.distance).toBeCloseTo(4, 6);
    expect(w.raycast(-5, 2.0001, 0.3, 1, 0, 0, 20, Layer.WORLD, hit)).toBe(false);
    expect(w.raycast(-5, 1.9999, 0.3, 1, 0, 0, 20, Layer.WORLD, hit)).toBe(true);
  });

  it('a wall of abutting solids has no cracks: 4 000 rays at the seams all stop on it', () => {
    const solids = [FLOOR()];
    for (let i = 0; i < 12; i++) solids.push(solid({ pos: [i * 1.5 - 8.25, 1.5, -6], size: [1.5, 3, 0.4], rotY: 0 }));
    const w = scene(solids);
    const hit = w.createHit(), rnd = rng(11);
    for (let i = 0; i < 4000; i++) {
      const seam = Math.floor(rnd() * 11) * 1.5 - 7.5;
      const tx = i % 2 === 0 ? seam : seam + (rnd() - 0.5) * 1e-5, ty = rnd() * 2.9 + 0.05;
      const ox = (rnd() - 0.5) * 6, oy = 1.6, oz = 3;
      const len = Math.hypot(tx - ox, ty - oy, -5.8 - oz);
      expect(w.raycast(ox, oy, oz, (tx - ox) / len, (ty - oy) / len, (-5.8 - oz) / len, 100, Layer.WORLD, hit)).toBe(true);
      expect(hit.z).toBeCloseTo(-5.8, 5);
    }
  });

  it('axis-aligned rays on node boundaries and with zero components behave', () => {
    const w = scene([FLOOR(), solid({ pos: [0, 1.5, -5.5], size: [10, 3, 1] })]);
    const hit = w.createHit();
    expect(w.raycast(0, 0, 0, 0, 0, -1, 100, Layer.WORLD, hit)).toBe(true);       // sliding along the floor plane into the wall
    expect(hit.distance).toBeLessThanOrEqual(5 + 1e-9);
    expect(w.raycast(-5, 1, 0, 0, 0, -1, 100, Layer.WORLD, hit)).toBe(true);      // exactly on the wall's x extent
    expect(w.raycast(0, 3, 10, 0, 0, -1, 100, Layer.WORLD, hit)).toBe(true);      // exactly at its top
    expect(w.raycast(0, 1, 0, 1, 0, 0, 500, Layer.WORLD, hit)).toBe(false);
    expect(w.raycast(0, 1, 0, 0, -1, 0, 100, Layer.WORLD, hit)).toBe(true);
    expect(hit.distance).toBeCloseTo(1, 9);
  });
});

// ------------------------------------------------------------------------------------------------
// raycastAll
// ------------------------------------------------------------------------------------------------

describe('raycastAll', () => {
  it('pierce ordering: every solid entered and every entity, near to far, nothing stops the ray', () => {
    const w = scene([
      FLOOR(),
      solid({ id: 'plank', pos: [0, 1.5, -5], size: [10, 3, 0.1], pierce: true, surface: 'wood' }),
      solid({ id: 'grille', pos: [0, 1.5, -9], size: [10, 3, 0.1], grille: true, surface: 'metal' }),
      solid({ id: 'stone', pos: [0, 1.5, -15], size: [10, 3, 1] }),
      solid({ id: 'beyond', pos: [0, 1.5, -22], size: [10, 3, 1] }),
    ]);
    const a = ent('bider#1'), b = ent('bider#2'), c = ent('transit#1', 'transit');
    sphere(w, b, 0, 1, -12, 0.5);
    sphere(w, a, 0, 1, -7, 0.5);
    sphere(w, c, 0, 1, -18, 0.5);
    const door = ent('gate', 'door');
    w.addBox(0, 1, -3, 2, 1, 0.05, 0, 'metal', 0, door);
    const list = w.createHitList();
    expect(list.hits.length).toBe(MAX_LINE_HITS);
    const n = w.raycastAll(0, 1, 0, 0, 0, -1, 100, LAYER_SHOT, list);
    expect(n).toBe(8); expect(list.count).toBe(8);
    const seen = list.hits.slice(0, n).map((h) => h.entity?.id ?? h.solidId);
    expect(seen).toEqual(['gate', 'plank', 'bider#1', 'grille', 'bider#2', 'stone', 'transit#1', 'beyond']);
    const dist = list.hits.slice(0, n).map((h) => +h.distance.toFixed(4));
    expect(dist).toEqual([2.95, 4.95, 6.5, 8.95, 11.5, 14.5, 17.5, 21.5]);
    expect(list.hits[1]!.flags).toBe(ColFlag.PIERCE); expect(list.hits[3]!.flags).toBe(ColFlag.GRILLE);
    expect(list.hits[0]!.layer).toBe(Layer.DYNAMIC); expect(list.hits[1]!.layer).toBe(Layer.WORLD); expect(list.hits[2]!.layer).toBe(Layer.ENEMY);
    for (let i = 0; i < n; i++) { expect(list.hits[i]!.hit).toBe(true); expect(list.hits[i]!.nz).toBeCloseTo(1, 9); }
    // the mask and the distance still apply
    expect(w.raycastAll(0, 1, 0, 0, 0, -1, 100, Layer.ENEMY, list)).toBe(3);
    expect(list.hits.slice(0, 3).map((h) => h.entity!.id)).toEqual(['bider#1', 'bider#2', 'transit#1']);
    expect(w.raycastAll(0, 1, 0, 0, 0, -1, 10, LAYER_SHOT, list)).toBe(4);
    expect(w.raycastAll(0, 1, 0, 0, 0, 1, 50, LAYER_SHOT, list)).toBe(0);
    expect(list.count).toBe(0);
    // raycast agrees with the head of the list
    const hit = w.createHit();
    w.raycast(0, 1, 0, 0, 0, -1, 100, LAYER_SHOT, hit);
    expect(hit.entity).toBe(door);
  });

  it('one hit per entity (highest priority), and one per solid entered: exits are not hits', () => {
    const w = scene([FLOOR(), solid({ id: 'thick', pos: [0, 1.5, -6], size: [10, 3, 2] })]);
    const e = ent('tamper#1', 'tamper');
    sphere(w, e, 0, 1, -12, 0.6, { part: 'body' });
    sphere(w, e, 0, 1, -12, 0.2, { part: 'vent_chest', priority: 10 });
    sphere(w, e, 0, 1, -12.5, 0.2, { part: 'vent_back', priority: 10 });
    const list = w.createHitList();
    expect(w.raycastAll(0, 1, 0, 0, 0, -1, 100, LAYER_SHOT, list)).toBe(2);
    expect(list.hits[0]!.solidId).toBe('thick'); expect(list.hits[0]!.distance).toBeCloseTo(5, 9);
    expect(list.hits[1]!.entity).toBe(e); expect(list.hits[1]!.part).toBe('vent_chest'); expect(list.hits[1]!.distance).toBeCloseTo(11.8, 9);
    // fired from inside the solid: the way out is reported (the muzzle is in the wall)
    expect(w.raycastAll(0, 1, -6, 0, 0, -1, 100, Layer.WORLD, list)).toBe(1);
    expect(list.hits[0]!.distance).toBeCloseTo(1, 9);
  });

  it('a tube is entered twice: near wall and far wall are both hits', () => {
    const w = scene([solid({ id: 'kerb', shape: 'cylinder', pos: [0, 1, 0], size: [12, 2, 12], innerRadius: 5 }), solid({ id: 'post', shape: 'cylinder', pos: [0, 1, 0], size: [1, 2, 1] })]);
    const list = w.createHitList();
    const d = Math.cos(0.01), s = Math.sin(0.01);                                 // a hair off the axis so no vertex is aimed at
    expect(w.raycastAll(-20, 1, 0.05, d, 0, s, 100, Layer.WORLD, list)).toBe(3);
    expect(list.hits.slice(0, 3).map((h) => h.solidId)).toEqual(['kerb', 'post', 'kerb']);
    expect(list.hits[0]!.x).toBeLessThan(-5.9); expect(list.hits[2]!.x).toBeGreaterThan(4.9); expect(list.hits[2]!.x).toBeLessThan(5.1);
  });

  it('caps at MAX_LINE_HITS keeping the nearest, and honours a shorter list', () => {
    const solids = [];
    for (let i = 0; i < 24; i++) solids.push(solid({ id: `w${i}`, pos: [0, 1.5, -3 - i * 2], size: [6, 3, 0.2], pierce: true }));
    const w = scene(solids);
    for (let i = 0; i < 10; i++) sphere(w, ent(`b${i}`), 0, 1, -4 - i * 2, 0.4);
    const list = w.createHitList();
    expect(w.raycastAll(0, 1, 0, 0, 0, -1, 500, LAYER_SHOT, list)).toBe(16);
    const ids = list.hits.map((h) => h.entity?.id ?? h.solidId);
    expect(ids).toEqual(['w0', 'b0', 'w1', 'b1', 'w2', 'b2', 'w3', 'b3', 'w4', 'b4', 'w5', 'b5', 'w6', 'b6', 'w7', 'b7']);
    for (let i = 1; i < 16; i++) expect(list.hits[i]!.distance).toBeGreaterThan(list.hits[i - 1]!.distance);
    const short = { count: 0, hits: [w.createHit(), w.createHit(), w.createHit()] };
    expect(w.raycastAll(0, 1, 0, 0, 0, -1, 500, LAYER_SHOT, short)).toBe(3);
    expect(short.hits.map((h) => h.entity?.id ?? h.solidId)).toEqual(['w0', 'b0', 'w1']);
    // 40 walls: more crossings than the scratch keeps; the nearest sixteen are still right
    const many = [];
    for (let i = 0; i < 40; i++) many.push(solid({ id: `m${i}`, pos: [0, 1.5, -3 - i], size: [6, 3, 0.2] }));
    const w2 = scene(many);
    expect(w2.raycastAll(0, 1, 0, 0, 0, -1, 500, LAYER_SHOT, list)).toBe(16);
    expect(list.hits.map((h) => h.solidId)).toEqual(Array.from({ length: 16 }, (_v, i) => `m${i}`));
  });

  it('edge-grazing rays keep the in/out pairing: a ray through shared edges reports each solid once', () => {
    const w = scene([solid({ id: 'a', pos: [0, 1, -5], size: [2, 2, 2] }), solid({ id: 'b', pos: [0, 1, -10], size: [2, 2, 2] }), solid({ id: 'c', pos: [0, 1, -15], size: [2, 2, 2] })]);
    const list = w.createHitList();
    // along the face diagonals (entry and exit both land on a triangle seam)
    for (const [ox, oy] of [[0, 1], [0.5, 1.5], [-0.25, 0.75], [1, 1], [0, 2], [1, 2], [-1, 0]] as const) {
      const n = w.raycastAll(ox, oy, 0, 0, 0, -1, 100, Layer.WORLD, list);
      const ids = list.hits.slice(0, n).map((h) => h.solidId);
      expect(ids, `ray at ${ox},${oy}`).toEqual(['a', 'b', 'c']);
      expect(list.hits[0]!.distance).toBeCloseTo(4, 9); expect(list.hits[1]!.distance).toBeCloseTo(9, 9); expect(list.hits[2]!.distance).toBeCloseTo(14, 9);
    }
  });

  it('ties sort volume, then box, then static: the same answer raycast gives', () => {
    const w = scene([solid({ id: 'wall', pos: [0, 1.5, -5.5], size: [10, 3, 1] })]);
    const plate = ent('plate', 'range_plate'), door = ent('door', 'door');
    const v = w.addVolume({ shape: 'box', layer: Layer.SHOOTABLE, flags: 0, surface: 'metal', entity: plate, part: 'whole', priority: 0, receiver: null });
    w.setVolumeBox(v, 0, 1, -5.5, 0.5, 0.5, 0.5, 0);
    w.addBox(0, 1, -5.5, 1, 1, 0.5, 0, 'wood', 0, door);
    const list = w.createHitList(), hit = w.createHit();
    expect(w.raycastAll(0, 1, 0, 0, 0, -1, 100, LAYER_SHOT, list)).toBe(3);
    expect(list.hits.slice(0, 3).map((h) => h.entity?.id ?? h.solidId)).toEqual(['plate', 'door', 'wall']);
    w.raycast(0, 1, 0, 0, 0, -1, 100, LAYER_SHOT, hit);
    expect(hit.entity).toBe(plate);
    w.raycast(0, 1, 0, 0, 0, -1, 100, LAYER_SOLID, hit);
    expect(hit.entity).toBe(door);
  });
});

// ------------------------------------------------------------------------------------------------
// lineOfSight
// ------------------------------------------------------------------------------------------------

describe('lineOfSight', () => {
  it('is counted in stats.rays and, apart, in sightRays (beside the contract; __dbg.ext.core.collisionCounts)', () => {
    const w = scene([FLOOR(), solid({ id: 'wall', pos: [0, 1.5, -5], size: [4, 3, 0.4] })]);
    const hit = w.createHit();
    w.stats.rays = 0; w.sightRays = 0;
    w.raycast(0, 1, 0, 0, 0, -1, 20, LAYER_SHOT, hit);
    w.groundHeight(0, 1, 0, 3);
    expect([w.stats.rays, w.sightRays]).toEqual([2, 0]);
    w.lineOfSight(0, 1, 0, 0, 1, -7, 0);
    w.lineOfSight(0, 1, 0, 3, 1, 0, 0);
    expect([w.stats.rays, w.sightRays]).toEqual([4, 2]);
  });
  it('walls and boxes block; LOW and GRILLE block only when not ignored; BODY_ONLY never blocks; volumes never block', () => {
    const w = scene([
      FLOOR(),
      solid({ id: 'wall', pos: [0, 1.5, -5], size: [4, 3, 0.4] }),
      solid({ id: 'low', pos: [10, 0.6, -5], size: [4, 1.2, 0.4], low: true }),
      solid({ id: 'grille', pos: [20, 1.5, -5], size: [4, 3, 0.1], grille: true }),
      solid({ id: 'skip', pos: [25, 1.5, -5], size: [4, 3, 0.1], skipsShots: true }),
      solid({ id: 'guard', pos: [30, 1.5, -5], size: [4, 3, 0.4], playerOnly: true }),
      solid({ id: 'both', pos: [40, 1.5, -5], size: [4, 3, 0.4], low: true, pierce: true }),
    ]);
    const sight = ColFlag.LOW | ColFlag.GRILLE;
    expect(w.lineOfSight(0, 1.6, 0, 0, 1.6, -10, 0)).toBe(false);
    expect(w.lineOfSight(0, 1.6, 0, 0, 1.6, -10, sight)).toBe(false);
    expect(w.lineOfSight(0, 1.6, -10, 0, 1.6, 0, sight)).toBe(false);          // symmetric
    expect(w.lineOfSight(0, 1.6, 0, 0, 1.6, -4.7, 0)).toBe(true);              // stops short of the wall
    expect(w.lineOfSight(0, 4, 0, 0, 4, -10, 0)).toBe(true);                   // over it
    expect(w.lineOfSight(10, 1, 0, 10, 1, -10, 0)).toBe(false);
    expect(w.lineOfSight(10, 1, 0, 10, 1, -10, ColFlag.LOW)).toBe(true);
    expect(w.lineOfSight(10, 1, 0, 10, 1, -10, ColFlag.GRILLE)).toBe(false);
    expect(w.lineOfSight(20, 1, 0, 20, 1, -10, 0)).toBe(false);
    expect(w.lineOfSight(20, 1, 0, 20, 1, -10, ColFlag.GRILLE)).toBe(true);
    expect(w.lineOfSight(25, 1, 0, 25, 1, -10, sight)).toBe(true);             // skipsShots maps to GRILLE
    expect(w.lineOfSight(30, 1, 0, 30, 1, -10, 0)).toBe(true);
    expect(w.lineOfSight(40, 1, 0, 40, 1, -10, ColFlag.PIERCE)).toBe(true);
    expect(w.lineOfSight(40, 1, 0, 40, 1, -10, ColFlag.STUNS_CHARGE)).toBe(false);
    expect(w.lineOfSight(0, 1.6, 0, 0, -3, 0, 0)).toBe(false);                 // into the floor
    expect(w.lineOfSight(5, 1, 5, 5, 1, 5, 0)).toBe(true);                     // zero length
    sphere(w, ent('bider#1'), 50, 1, -5, 1);
    expect(w.lineOfSight(50, 1, 0, 50, 1, -10, 0)).toBe(true);
    const h = w.addBox(60, 1, -5, 1, 1, 0.1, 0, 'wood', ColFlag.LOW, null);
    expect(w.lineOfSight(60, 1, 0, 60, 1, -10, 0)).toBe(false);
    expect(w.lineOfSight(60, 1, 0, 60, 1, -10, ColFlag.LOW)).toBe(true);
    expect(w.lineOfSight(60, 1, 0, 60, 1, -4, 0)).toBe(true);                  // target in front of the box
    w.setBoxEnabled(h, false);
    expect(w.lineOfSight(60, 1, 0, 60, 1, -10, 0)).toBe(true);
    w.setSolidEnabled('wall', false);
    expect(w.lineOfSight(0, 1.6, 0, 0, 1.6, -10, 0)).toBe(true);
  });
});

// ------------------------------------------------------------------------------------------------
// overlaps, volumeCentre, segmentHitsCapsule
// ------------------------------------------------------------------------------------------------

describe('overlaps and lookups', () => {
  it('overlapSphere: every shape, the layer mask, one entry per entity, capacity 32', () => {
    const w = new CollisionWorldImpl();
    const receiver: HitReceiver = { onHit: () => undefined };
    const a = ent('bider#1'), b = ent('tamper#1', 'tamper'), j = ent('ia_jug_1', 'jug');
    sphere(w, a, 0, 1, 0, 0.5, { receiver });
    const cap = w.addVolume({ shape: 'capsule', layer: Layer.ENEMY, flags: 0, surface: 'metal', entity: b, part: 'body', priority: 0, receiver: null });
    w.setCapsule(cap, 5, 0.5, 0, 5, 2.5, 0, 0.5);
    sphere(w, b, 5, 2.6, 0, 0.2, { part: 'crown', priority: 10 });
    const box = w.addVolume({ shape: 'box', layer: Layer.SHOOTABLE, flags: 0, surface: 'ceramic', entity: j, part: 'whole', priority: 0, receiver: null });
    w.setVolumeBox(box, 10, 1, 0, 1, 0.5, 0.2, 90 * DEG);
    const out = w.createOverlapList();
    expect(out.entities.length).toBe(MAX_OVERLAPS);
    expect(w.overlapSphere(0, 1, 1.4, 1, Layer.ENEMY, out)).toBe(1);
    expect(out.entities[0]).toBe(a); expect(out.parts[0]).toBe('body'); expect(out.receivers[0]).toBe(receiver);
    expect(w.overlapSphere(0, 1, 1.6, 1, Layer.ENEMY, out)).toBe(0);
    expect(out.count).toBe(0);
    expect(w.overlapSphere(6.4, 1.5, 0, 1, Layer.ENEMY, out)).toBe(1);          // the capsule's side
    expect(out.parts[0]).toBe('body');
    expect(w.overlapSphere(6.6, 1.5, 0, 1, Layer.ENEMY, out)).toBe(0);
    expect(w.overlapSphere(5, 3.9, 0, 1, Layer.ENEMY, out)).toBe(1);            // the capsule's cap; the crown is 0.1 further
    expect(w.overlapSphere(5, 2.5, 0, 1, Layer.ENEMY, out)).toBe(1);            // both volumes of the tamper: ONE entry, the crown
    expect(out.entities[0]).toBe(b); expect(out.parts[0]).toBe('crown');
    expect(w.overlapSphere(10.6, 1, 0, 0.5, Layer.SHOOTABLE, out)).toBe(1);     // box turned 90 degrees: its long axis lies along z
    expect(w.overlapSphere(10.8, 1, 0, 0.5, Layer.SHOOTABLE, out)).toBe(0);
    expect(w.overlapSphere(10, 1, 1.4, 0.5, Layer.SHOOTABLE, out)).toBe(1);
    expect(w.overlapSphere(10, 1, 0, 0.01, Layer.SHOOTABLE, out)).toBe(1);      // centre inside the box
    expect(w.overlapSphere(10, 1, 0, 5, Layer.ENEMY, out)).toBe(1);             // the jug is not on the mask
    expect(w.overlapSphere(5, 1, 0, 50, Layer.ENEMY | Layer.SHOOTABLE, out)).toBe(3);
    expect(out.entities.slice(0, 3)).toEqual([a, b, j]);
    w.setVolumeEnabled(cap, false);
    expect(w.overlapSphere(6.4, 1.5, 0, 1, Layer.ENEMY, out)).toBe(0);
    for (let i = 0; i < 40; i++) sphere(w, ent(`crowd${i}`), 100 + (i % 7) * 0.1, 0, 0, 0.5);
    expect(w.overlapSphere(100, 0, 0, 5, Layer.ENEMY, out)).toBe(32);
    expect(out.count).toBe(32);
    const small = { count: 0, entities: [null, null] as (EntityRef | null)[], parts: ['whole', 'whole'] as HitPart[], receivers: [null, null] as (HitReceiver | null)[] };
    expect(w.overlapSphere(100, 0, 0, 5, Layer.ENEMY, small)).toBe(2);
  });

  it('volumeCentre: by part, by highest priority, only enabled volumes, every shape', () => {
    const w = new CollisionWorldImpl();
    const e = ent('tamper#1', 'tamper');
    const bodyH = w.addVolume({ shape: 'capsule', layer: Layer.ENEMY, flags: 0, surface: 'metal', entity: e, part: 'body', priority: 0, receiver: null });
    w.setCapsule(bodyH, 1, 0, 2, 1, 2, 2, 0.5);
    const crown = sphere(w, e, 1, 2.4, 2, 0.2, { part: 'crown', priority: 10 });
    const out = { x: 0, y: 0, z: 0 };
    expect(w.volumeCentre('tamper#1', null, out)).toBe(true);
    expect(out).toEqual({ x: 1, y: 2.4, z: 2 });
    expect(w.volumeCentre('tamper#1', 'body', out)).toBe(true);
    expect(out).toEqual({ x: 1, y: 1, z: 2 });
    expect(w.volumeCentre('tamper#1', 'lens', out)).toBe(false);
    expect(w.volumeCentre('nobody', null, out)).toBe(false);
    w.setVolumeEnabled(crown, false);
    expect(w.volumeCentre('tamper#1', null, out)).toBe(true);
    expect(out.y).toBe(1);
    expect(w.volumeCentre('tamper#1', 'crown', out)).toBe(false);
    const bx = w.addVolume({ shape: 'box', layer: Layer.INTERACT, flags: 0, surface: 'none', entity: ent('ia_lever', 'interactable'), part: 'whole', priority: 0, receiver: null });
    w.setVolumeBox(bx, 7, 8, 9, 1, 1, 1, 1);
    expect(w.volumeCentre('ia_lever', null, out)).toBe(true);
    expect(out).toEqual({ x: 7, y: 8, z: 9 });
    w.removeVolume(bodyH); w.removeVolume(crown);
    expect(w.volumeCentre('tamper#1', null, out)).toBe(false);
    // INTERACT volumes are ray targets on their own layer, never on the shot mask
    const hit = w.createHit();
    expect(w.raycast(7, 8, 20, 0, 0, -1, 50, LAYER_SHOT, hit)).toBe(false);
    expect(w.raycast(7, 8, 20, 0, 0, -1, 50, Layer.INTERACT, hit)).toBe(true);
    expect(hit.entity!.kind).toBe('interactable');
  });

  it('segmentHitsCapsule: side, caps, endpoints, a miss, a zero-length segment', () => {
    const w = createCollisionWorld();
    // player capsule at the origin: axis from y 0.35 to 1.45
    expect(w.segmentHitsCapsule(-5, 1, 0, 5, 1, 0, 0, 0, 0, 0, R, H)).toBe(true);
    expect(w.segmentHitsCapsule(-5, 1, 0.34, 5, 1, 0.34, 0, 0, 0, 0, R, H)).toBe(true);
    expect(w.segmentHitsCapsule(-5, 1, 0.36, 5, 1, 0.36, 0, 0, 0, 0, R, H)).toBe(false);
    expect(w.segmentHitsCapsule(-5, 1, 0.6, 5, 1, 0.6, 0.3, 0, 0, 0, R, H)).toBe(true);     // a stake of radius 0.3
    expect(w.segmentHitsCapsule(-5, 1, 0.7, 5, 1, 0.7, 0.3, 0, 0, 0, R, H)).toBe(false);
    expect(w.segmentHitsCapsule(-5, 1.79, 0, 5, 1.79, 0, 0, 0, 0, 0, R, H)).toBe(true);     // through the top cap
    expect(w.segmentHitsCapsule(-5, 1.81, 0, 5, 1.81, 0, 0, 0, 0, 0, R, H)).toBe(false);
    expect(w.segmentHitsCapsule(-5, 1.7, 0.25, 5, 1.7, 0.25, 0, 0, 0, 0, R, H)).toBe(false); // past the cap's shoulder
    expect(w.segmentHitsCapsule(-5, 1, 0, -0.4, 1, 0, 0, 0, 0, 0, R, H)).toBe(false);       // stops short
    expect(w.segmentHitsCapsule(-5, 1, 0, -0.3, 1, 0, 0, 0, 0, 0, R, H)).toBe(true);
    expect(w.segmentHitsCapsule(0.1, 1, 0.1, 0.1, 1, 0.1, 0, 0, 0, 0, R, H)).toBe(true);    // a point inside
    expect(w.segmentHitsCapsule(0, 5, 0, 0, -5, 0, 0, 0, 0, 0, R, H)).toBe(true);           // along the axis
    expect(w.segmentHitsCapsule(10, 3, 10, 11, 3, 10, 0.2, 10.5, 2, 10.3, R, H)).toBe(true); // capsule elsewhere, feet at y 2
    expect(w.segmentHitsCapsule(10, 0, 10, 11, 0, 10, 0.2, 10.5, 2, 10.3, R, H)).toBe(false);
  });

  it('stats count queries and content', () => {
    const w = scene([FLOOR()]);
    const hit = w.createHit(), list = w.createHitList(), res = w.createResolve();
    w.raycast(0, 1, 0, 0, -1, 0, 5, LAYER_SHOT, hit); w.raycastAll(0, 1, 0, 0, -1, 0, 5, LAYER_SHOT, list); w.lineOfSight(0, 1, 0, 1, 1, 0, 0); w.groundHeight(0, 1, 0, 5);
    w.resolveCapsule(0, 0, 0, R, H, COS45, res); w.capsuleFree(0, 0, 0, R, H);
    expect(w.stats).toEqual({ rays: 4, capsules: 2, triangles: 12, boxes: 0, volumes: 0 });
    w.stats.rays = 0; w.stats.capsules = 0;                                    // the perf monitor resets them each tick
    w.raycast(0, 1, 0, 0, -1, 0, 5, LAYER_SHOT, hit);
    expect(w.stats.rays).toBe(1);
  });
});

// ------------------------------------------------------------------------------------------------
// the real layout
// ------------------------------------------------------------------------------------------------

const ALL_ZONES = layout.zones.map((z) => z.id);

describe('design/layout.json', () => {
  it('the static set of every resident set builds with correct winding, and every nav node is standable', () => {
    const report: string[] = [];
    for (const set of ['surface', 'underground', 'coda'] as ResidentSet[]) {
      const zones: ZoneId[] = layout.zones.filter((z) => z.set === set).map((z) => z.id);
      const c = buildSolidColliders(layout, zones, set);
      const w = new CollisionWorldImpl();
      w.setStatic(c.positions, c.triSurface, c.triFlags, c.triSolid, c.solidIds);
      expect(w.flippedSolids).toBe(0);
      expect(w.stats.triangles).toBe(c.triangles);
      for (const s of layout.solids) if (s.dynamic) w.setSolidEnabled(s.id, false);
      let nodes = 0, bad = 0;
      for (const node of layout.nav.nodes) {
        if (!zones.includes(node.zone) && !(node.sets ?? []).includes(set)) continue;
        nodes++;
        const [x, y, z] = node.pos;
        const g = w.groundHeight(x, y + 0.5, z, 1.5);
        // Let it settle for a third of a second under gravity. A node may stand within a radius of a low
        // kerb (the validator ignores obstacles under 0.4 m), and on a ramp a sphere rides r (1/cos - 1)
        // above the surface under its axis: both stay within these bounds.
        const b = walk(w, body(x, g, z), 0, 0, 20);
        const ok = Math.abs(g - y) <= 0.3 && b.grounded && Math.hypot(b.x - x, b.z - z) < 0.12 && b.y - g > -0.02 && b.y - g < 0.1 && w.capsuleFree(b.x, b.y, b.z, R, H);
        if (!ok) { bad++; report.push(`${set} ${node.id} ground ${g.toFixed(3)} node ${y} at ${b.x.toFixed(3)} ${b.y.toFixed(3)} ${b.z.toFixed(3)} grounded ${b.grounded}`); }
      }
      expect(nodes).toBeGreaterThanOrEqual(20);
      expect(bad, report.join('\n')).toBe(0);
    }
  });

  it('BVH walk equals brute force: 3 000 rays over the full layout', () => {
    const c = buildSolidColliders(layout, ALL_ZONES, 'surface');
    const w = new CollisionWorldImpl();
    w.setStatic(c.positions, c.triSurface, c.triFlags, c.triSolid, c.solidIds);
    // the constraints of ARCHITECTURE 6 that are visible from outside, and the cost of a rebuild
    expect(w.positions).toBeInstanceOf(Float32Array); expect(w.positions.length).toBe(c.triangles * 9);
    expect(w.index).toBeInstanceOf(Uint32Array); expect(w.index.length).toBe(c.triangles * 3);
    expect(w.bvh!.indirect).toBe(false);
    let build = Infinity;
    for (let i = 0; i < 9; i++) { const t0 = performance.now(); w.setStatic(c.positions, c.triSurface, c.triFlags, c.triSolid, c.solidIds); build = Math.min(build, performance.now() - t0); }
    console.log(`[collision build] setStatic of the full layout (${c.triangles} triangles, ${c.solidIds.length} solids): ${build.toFixed(2)} ms`);
    expect(build).toBeLessThan(25);
    const hit = w.createHit(), rnd = rng(3), nodes = layout.nav.nodes;
    let hits = 0;
    for (let i = 0; i < 3000; i++) {
      const p = nodes[Math.floor(rnd() * nodes.length)]!.pos;
      const yaw = rnd() * Math.PI * 2, pitch = (rnd() - 0.5) * 1.6, cp = Math.cos(pitch);
      const dx = Math.cos(yaw) * cp, dy = Math.sin(pitch), dz = Math.sin(yaw) * cp;
      const max = 5 + rnd() * 150;
      const got = w.raycast(p[0], p[1] + 1.65, p[2], dx, dy, dz, max, Layer.WORLD, hit);
      const want = bruteRay(c.positions, c.triFlags, ColFlag.BODY_ONLY, p[0], p[1] + 1.65, p[2], dx, dy, dz, max);
      expect(got).toBe(want !== Infinity);
      if (got) { hits++; expect(hit.distance).toBeCloseTo(want, 7); expect(w.lineOfSight(p[0], p[1] + 1.65, p[2], hit.x + dx * 0.01, hit.y + dy * 0.01, hit.z + dz * 0.01, 0)).toBe(false); }
      else expect(w.lineOfSight(p[0], p[1] + 1.65, p[2], p[0] + dx * max, p[1] + 1.65 + dy * max, p[2] + dz * max, 0)).toBe(true);
    }
    expect(hits).toBeGreaterThan(2000);
  });

  it('resolveCapsule on the full layout: random shoves near every nav node end free of geometry', () => {
    const c = buildSolidColliders(layout, ALL_ZONES, 'surface');
    const w = new CollisionWorldImpl();
    w.setStatic(c.positions, c.triSurface, c.triFlags, c.triSolid, c.solidIds);
    for (const s of layout.solids) if (s.dynamic) w.setSolidEnabled(s.id, false);
    const res = w.createResolve(), rnd = rng(5);
    let stuck = 0, total = 0;
    for (const node of layout.nav.nodes) {
      for (let k = 0; k < 4; k++) {
        // one sub-step of movement (under a radius) from a resolved position, plus gravity
        w.resolveCapsule(node.pos[0], node.pos[1], node.pos[2], R, H, COS45, res);
        const a = rnd() * Math.PI * 2, step = rnd() * 0.33;
        let x = res.x + Math.cos(a) * step, y = res.y - 0.007, z = res.z + Math.sin(a) * step;
        for (let i = 0; i < 3; i++) { w.resolveCapsule(x, y, z, R, H, COS45, res); x = res.x; y = res.y; z = res.z; }
        total++;
        expect(Number.isFinite(x + y + z)).toBe(true);
        expect(Math.hypot(x - node.pos[0], z - node.pos[2])).toBeLessThan(0.33 + R + 0.2);
        if (!w.capsuleFree(x, y, z, R, H)) stuck++;
      }
    }
    expect(stuck / total).toBeLessThan(0.002);
  });
});

// ------------------------------------------------------------------------------------------------
// micro-benchmark and allocation (definition of done 3)
// ------------------------------------------------------------------------------------------------

describe('micro-benchmark on the full layout', () => {
  const N = 1000;
  const w = new CollisionWorldImpl();
  const cap = new Float64Array(N * 3), ray = new Float64Array(N * 6);
  const hit = w.createHit(), res = w.createResolve(), list = w.createHitList(), overlaps = w.createOverlapList();
  const centre = { x: 0.5, y: 0.5, z: 0.5 };
  const sink = new Float64Array(1);     // a typed cell: a captured `let` holding a double would allocate on every write

  beforeAll(() => {
    const c = buildSolidColliders(layout, ALL_ZONES, 'surface');
    expect(c.solidIds.length).toBe(layout.solids.length);
    w.setStatic(c.positions, c.triSurface, c.triFlags, c.triSolid, c.solidIds);
    for (const s of layout.solids) if (s.dynamic) w.setSolidEnabled(s.id, false);
    const rnd = rng(1), nodes = layout.nav.nodes;
    for (let i = 0; i < N; i++) {
      const p = nodes[Math.floor(rnd() * nodes.length)]!.pos;
      // a player sub-step from a standable point: up to 0.3 m of travel and 7 mm of gravity ...
      const a = rnd() * Math.PI * 2, d = rnd() * 0.3;
      cap[i * 3] = p[0] + Math.cos(a) * d; cap[i * 3 + 1] = p[1] - 0.007; cap[i * 3 + 2] = p[2] + Math.sin(a) * d;
      // ... and every second one walked 0.2 m into the nearest wall in a random direction
      if (i % 2 === 1 && w.raycast(p[0], p[1] + 0.9, p[2], Math.cos(a), 0, Math.sin(a), 40, Layer.WORLD, hit)) {
        const back = hit.distance - (R - 0.2);
        const g = w.groundHeight(p[0] + Math.cos(a) * back, p[1] + 0.9, p[2] + Math.sin(a) * back, 3);
        if (!Number.isNaN(g)) { cap[i * 3] = p[0] + Math.cos(a) * back; cap[i * 3 + 1] = g - 0.007; cap[i * 3 + 2] = p[2] + Math.sin(a) * back; }
      }
      const q = nodes[Math.floor(rnd() * nodes.length)]!.pos;
      const yaw = rnd() * Math.PI * 2, pitch = (rnd() - 0.5) * 0.9, cp = Math.cos(pitch);
      ray[i * 6] = q[0]; ray[i * 6 + 1] = q[1] + 1.65; ray[i * 6 + 2] = q[2];
      ray[i * 6 + 3] = Math.cos(yaw) * cp; ray[i * 6 + 4] = Math.sin(pitch); ray[i * 6 + 5] = Math.sin(yaw) * cp;
    }
  });

  const runCapsules = (): void => { for (let i = 0; i < N; i++) { w.resolveCapsule(cap[i * 3]!, cap[i * 3 + 1]!, cap[i * 3 + 2]!, R, H, COS45, res); sink[0]! += res.y; } };
  const runRays = (): void => { for (let i = 0; i < N; i++) { if (w.raycast(ray[i * 6]!, ray[i * 6 + 1]!, ray[i * 6 + 2]!, ray[i * 6 + 3]!, ray[i * 6 + 4]!, ray[i * 6 + 5]!, 120, LAYER_SHOT, hit)) sink[0]! += hit.distance; } };
  // One small loop per query. A call is allocation-free only where V8 inlines the thin public wrapper
  // into its caller (otherwise the caller boxes each non-integer double argument, 16 bytes apiece);
  // `runOthers` below, one large loop over all seven, is the counter-example and is reported, not asserted.
  const others: Record<string, () => void> = {
    raycastAll: () => { for (let i = 0; i < N; i++) { const o = i * 6; sink[0]! += w.raycastAll(ray[o]!, ray[o + 1]!, ray[o + 2]!, ray[o + 3]!, ray[o + 4]!, ray[o + 5]!, 120, LAYER_SHOT, list); } },
    lineOfSight: () => { for (let i = 0; i < N; i++) { const o = i * 6; if (w.lineOfSight(ray[o]!, ray[o + 1]!, ray[o + 2]!, ray[o]! + ray[o + 3]! * 30, ray[o + 1]! + ray[o + 4]! * 30, ray[o + 2]! + ray[o + 5]! * 30, ColFlag.LOW | ColFlag.GRILLE)) sink[0]!++; } },
    groundHeight: () => { for (let i = 0; i < N; i++) { const o = i * 6; const g = w.groundHeight(ray[o]!, ray[o + 1]!, ray[o + 2]!, 4, hit); if (!Number.isNaN(g)) sink[0]! += g; } },
    capsuleFree: () => { for (let i = 0; i < N; i++) { if (w.capsuleFree(cap[i * 3]!, cap[i * 3 + 1]!, cap[i * 3 + 2]!, R, H)) sink[0]!++; } },
    overlapSphere: () => { for (let i = 0; i < N; i++) { const o = i * 6; sink[0]! += w.overlapSphere(ray[o]!, ray[o + 1]!, ray[o + 2]!, 6, Layer.ENEMY | Layer.SHOOTABLE, overlaps); } },
    volumeCentre: () => { for (let i = 0; i < N; i++) { if (w.volumeCentre('bench#7', null, centre)) sink[0]! += centre.y; } },
    segmentHitsCapsule: () => { for (let i = 0; i < N; i++) { const o = i * 6; if (w.segmentHitsCapsule(ray[o]!, ray[o + 1]!, ray[o + 2]!, ray[o]! + ray[o + 3]!, ray[o + 1]! + ray[o + 4]!, ray[o + 2]! + ray[o + 5]!, 0.3, ray[o]! + 0.5, ray[o + 1]! - 1.65, ray[o + 2]!, R, H)) sink[0]!++; } },
  };
  const runOthers = (): void => {
    for (let i = 0; i < N; i++) {
      const o = i * 6, ox = ray[o]!, oy = ray[o + 1]!, oz = ray[o + 2]!, dx = ray[o + 3]!, dy = ray[o + 4]!, dz = ray[o + 5]!;
      sink[0]! += w.raycastAll(ox, oy, oz, dx, dy, dz, 120, LAYER_SHOT, list);
      if (w.lineOfSight(ox, oy, oz, ox + dx * 30, oy + dy * 30, oz + dz * 30, ColFlag.LOW | ColFlag.GRILLE)) sink[0]!++;
      const g = w.groundHeight(ox, oy, oz, 4, hit); if (!Number.isNaN(g)) sink[0]! += g;
      if (w.capsuleFree(cap[i * 3]!, cap[i * 3 + 1]!, cap[i * 3 + 2]!, R, H)) sink[0]!++;
      sink[0]! += w.overlapSphere(ox, oy, oz, 6, Layer.ENEMY | Layer.SHOOTABLE, overlaps);
      if (w.volumeCentre('bench#7', null, centre)) sink[0]! += centre.y;
      if (w.segmentHitsCapsule(ox, oy, oz, ox + dx, oy + dy, oz + dz, 0.3, ox + 0.5, oy - 1.65, oz, R, H)) sink[0]!++;
    }
  };
  const lines: string[] = [];
  const say = (line: string): void => { lines.push(line); console.log(`[collision bench] ${line}`); };
  afterAll(() => {
    // evidence for the report: the numbers of the last run (shots/ is git-ignored)
    const dir = path.resolve(import.meta.dirname, '../../shots/foundation-collision');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'bench.txt'), lines.join('\n') + '\n');
  });
  const time = (fn: () => void, rounds: number): number => {
    let best = Infinity;
    for (let r = 0; r < rounds; r++) { const t0 = performance.now(); fn(); best = Math.min(best, performance.now() - t0); }
    return best / N;
  };
  const median = (fn: () => void, rounds: number): number => {
    const v: number[] = [];
    for (let r = 0; r < rounds; r++) { const t0 = performance.now(); fn(); v.push((performance.now() - t0) / N); }
    v.sort((a, b) => a - b);
    return v[v.length >> 1]!;
  };

  it('1 000 resolveCapsule + 1 000 raycast: 0 bytes allocated, under 0.02 ms each', { timeout: 120000 }, () => {
    const rounds = warmUntilQuiet(() => { runCapsules(); runRays(); });
    const capMs = median(runCapsules, 21), rayMs = median(runRays, 21);
    const capBest = time(runCapsules, 21), rayBest = time(runRays, 21);
    const bytes = allocatedBytes(() => { runCapsules(); runRays(); }, 15);
    let grounded = 0, walls = 0, hits = 0;
    for (let i = 0; i < N; i++) {
      w.resolveCapsule(cap[i * 3]!, cap[i * 3 + 1]!, cap[i * 3 + 2]!, R, H, COS45, res);
      if (res.grounded) grounded++; if (res.hitWall) walls++;
      if (w.raycast(ray[i * 6]!, ray[i * 6 + 1]!, ray[i * 6 + 2]!, ray[i * 6 + 3]!, ray[i * 6 + 4]!, ray[i * 6 + 5]!, 120, LAYER_SHOT, hit)) hits++;
    }
    say(`static set: ${w.stats.triangles} triangles from ${layout.solids.length} solids`);
    say(`resolveCapsule: median ${(capMs * 1000).toFixed(2)} us, best ${(capBest * 1000).toFixed(2)} us per call (${grounded} grounded, ${walls} wall contacts of ${N})`);
    say(`raycast:        median ${(rayMs * 1000).toFixed(2)} us, best ${(rayBest * 1000).toFixed(2)} us per call (${hits} hits of ${N})`);
    say(`allocated by 1000 resolveCapsule + 1000 raycast: ${bytes} bytes (steady state, reached after ${rounds} warm-up rounds)`);
    expect(grounded).toBeGreaterThan(900);
    expect(hits).toBeGreaterThan(600);
    expect(bytes).toBe(0);
    expect(capMs).toBeLessThan(0.02);
    expect(rayMs).toBeLessThan(0.02);
    expect(sink[0]).not.toBeNaN();
  });

  it('every other query is allocation-free too, with 48 volumes and 16 boxes in play', { timeout: 120000 }, () => {
    const rnd = rng(9), nodes = layout.nav.nodes;
    for (let i = 0; i < 16; i++) {
      const p = nodes[Math.floor(rnd() * nodes.length)]!.pos;
      const e = ent(`bench#${i}`);
      sphere(w, e, p[0], p[1] + 1.5, p[2], 0.25, { part: 'crown', priority: 10 });
      const c = w.addVolume({ shape: 'capsule', layer: Layer.ENEMY, flags: 0, surface: 'cloth', entity: e, part: 'body', priority: 0, receiver: null });
      w.setCapsule(c, p[0], p[1] + 0.4, p[2], p[0], p[1] + 1.3, p[2], 0.4);
      const b = w.addVolume({ shape: 'box', layer: Layer.SHOOTABLE, flags: 0, surface: 'ceramic', entity: ent(`jug#${i}`, 'jug'), part: 'whole', priority: 0, receiver: null });
      w.setVolumeBox(b, p[0] + 1, p[1] + 1, p[2], 0.2, 0.3, 0.2, rnd() * 3);
      w.addBox(p[0], p[1] + 1.1, p[2] + 2, 0.6, 1.1, 0.05, rnd() * 3, 'wood', 0, ent(`door#${i}`, 'door'));
    }
    const rounds = warmUntilQuiet(() => { runCapsules(); runRays(); });
    const bytes = allocatedBytes(() => { runCapsules(); runRays(); }, 15);
    const capMs = median(runCapsules, 15), rayMs = median(runRays, 15);
    say(`with 48 volumes + 16 boxes: resolveCapsule ${(capMs * 1000).toFixed(2)} us, raycast ${(rayMs * 1000).toFixed(2)} us per call; ${bytes} bytes allocated by 1000 + 1000 (after ${rounds} warm-up rounds)`);
    expect(bytes).toBe(0);
    for (const name of Object.keys(others)) {
      const fn = others[name]!;
      const r = warmUntilQuiet(fn);
      const b = allocatedBytes(fn, 15), ms = median(fn, 15);
      say(`${name}: ${(ms * 1000).toFixed(2)} us per call, ${b} bytes allocated by 1000 calls (after ${r} warm-up rounds)`);
      expect(b, name).toBe(0);
      expect(ms, name).toBeLessThan(0.02);
    }
    for (let i = 0; i < 300; i++) runOthers();
    say(`for the record, all seven in ONE large caller (wrappers not all inlined there, so the caller boxes arguments): ${allocatedBytes(runOthers, 9)} bytes per 7 000 calls, ${(median(runOthers, 9) * 1000).toFixed(2)} us per round of seven`);
    let entityHits = 0, listed = 0;
    for (let i = 0; i < N; i++) {
      const o = i * 6;
      if (w.raycast(ray[o]!, ray[o + 1]!, ray[o + 2]!, ray[o + 3]!, ray[o + 4]!, ray[o + 5]!, 120, LAYER_SHOT, hit) && hit.entity) entityHits++;
      listed += w.raycastAll(ray[o]!, ray[o + 1]!, ray[o + 2]!, ray[o + 3]!, ray[o + 4]!, ray[o + 5]!, 120, LAYER_SHOT, list);
    }
    say(`${entityHits} of 1000 rays end on an entity; raycastAll lists ${listed} hits for the same rays`);
    expect(listed).toBeGreaterThan(N);
    expect(capMs).toBeLessThan(0.02);
    expect(rayMs).toBeLessThan(0.02);
  });
});
