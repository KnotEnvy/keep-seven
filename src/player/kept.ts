// The kept round's aim test (GDD 6.6 rule 4; ARCHITECTURE 3.6): does the aim ray enter the bore target volume, a
// vertical cylinder on the bore axis? Analytic: no collision query, so the kerb, the guard and the Windlass take no part.
import type { KeptContext } from '../core/contracts.ts';

/**
 * Distance along the unit ray (o, d) at which it enters the cylinder of `ctx` (axis boreX / boreZ, radius boreRadius,
 * from boreBottomY up to boreTopY), through the top disc or the side; 0 when the origin is inside; -1 when it never enters.
 */
export function rayEntersBore(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, ctx: Readonly<KeptContext>): number {
  let t0 = 0, t1 = Infinity;
  // the slab boreBottomY <= y <= boreTopY
  if (dy > 1e-9 || dy < -1e-9) {
    const a = (ctx.boreTopY - oy) / dy, b = (ctx.boreBottomY - oy) / dy;
    const lo = a < b ? a : b, hi = a < b ? b : a;
    if (lo > t0) t0 = lo;
    if (hi < t1) t1 = hi;
  } else if (oy > ctx.boreTopY || oy < ctx.boreBottomY) return -1;
  // the infinite cylinder
  const px = ox - ctx.boreX, pz = oz - ctx.boreZ;
  const r2 = ctx.boreRadius * ctx.boreRadius;
  const a = dx * dx + dz * dz;
  if (a < 1e-12) {
    if (px * px + pz * pz > r2) return -1;
  } else {
    const b = px * dx + pz * dz;
    const disc = b * b - a * (px * px + pz * pz - r2);
    if (disc < 0) return -1;
    const root = Math.sqrt(disc);
    const lo = (-b - root) / a, hi = (-b + root) / a;
    if (lo > t0) t0 = lo;
    if (hi < t1) t1 = hi;
  }
  return t0 <= t1 ? t0 : -1;
}

/** Copy a context field by field (the world's object is its own scratch: never keep the reference). */
export function copyKeptContext(from: Readonly<KeptContext>, to: KeptContext): void {
  to.mark = from.mark; to.markX = from.markX; to.markY = from.markY; to.markZ = from.markZ;
  to.leaveRadius = from.leaveRadius; to.boreX = from.boreX; to.boreZ = from.boreZ;
  to.boreTopY = from.boreTopY; to.boreBottomY = from.boreBottomY; to.boreRadius = from.boreRadius;
}
export function emptyKeptContext(): KeptContext {
  return { mark: '', markX: 0, markY: 0, markZ: 0, leaveRadius: 2.5, boreX: 0, boreZ: 0, boreTopY: 0, boreBottomY: 0, boreRadius: 3 };
}
