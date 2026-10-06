// Small shared maths and encoding helpers. No DOM, no three.js: safe to import anywhere (unit tests included).
import type { SurfaceType } from './contracts.ts';

export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;
export const TAU = Math.PI * 2;

/** Index of a surface in the Uint8 `triSurface` array handed to CollisionWorld.setStatic: the order of the SurfaceType union. */
export const SURFACE_TYPES: readonly SurfaceType[] = ['sand', 'wood', 'adobe', 'metal', 'ceramic', 'stone', 'cloth', 'none'];
export function surfaceIndex(surface: SurfaceType): number {
  const i = SURFACE_TYPES.indexOf(surface);
  return i < 0 ? SURFACE_TYPES.length - 1 : i;
}

export function clamp(v: number, lo: number, hi: number): number { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
export function saturate(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }
/** Wraps an angle in radians to (-PI, PI]. */
export function wrapAngle(a: number): number {
  a = a % TAU;
  if (a > Math.PI) a -= TAU; else if (a <= -Math.PI) a += TAU;
  return a;
}
/** Wraps degrees to (-180, 180]. */
export function wrapDeg(a: number): number {
  a = a % 360;
  if (a > 180) a -= 360; else if (a <= -180) a += 360;
  return a;
}
/** Rounds to 1e-4 (the precision of every debug snapshot). -0 becomes 0. */
export function round4(v: number): number {
  const r = Math.round(v * 1e4) / 1e4;
  return r === 0 ? 0 : r;
}
/** Deep copy with every number rounded to 1e-4. JSON-safe input only. Key order is preserved. */
export function roundDeep<T>(value: T): T {
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return round4(value) as T;
    nonFinite++;                                             // written as 0 (JSON has no NaN); the caller can see that it happened
    return 0 as T;
  }
  if (Array.isArray(value)) return value.map((v: unknown) => roundDeep(v)) as T;
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>)) out[k] = roundDeep((value as Record<string, unknown>)[k]);
    return out as T;
  }
  return value;
}
let nonFinite = 0;
/** How many non-finite numbers roundDeep has replaced by 0 so far (compare before and after a call). */
export function nonFiniteCount(): number { return nonFinite; }
/** The path ('.x', '.cylinder[2]') and text ('NaN', 'Infinity') of the first non-finite number in a value, or null. */
export function firstNonFinite(value: unknown, path = ''): { path: string; text: string } | null {
  if (typeof value === 'number') return Number.isFinite(value) ? null : { path, text: String(value) };
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) { const r = firstNonFinite(value[i], `${path}[${i}]`); if (r) return r; }
    return null;
  }
  if (value !== null && typeof value === 'object') {
    for (const k of Object.keys(value as Record<string, unknown>)) { const r = firstNonFinite((value as Record<string, unknown>)[k], `${path}.${k}`); if (r) return r; }
  }
  return null;
}
/** FNV-1a (32 bit) of a string, as 8 hex digits. */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
/** Yaw (radians, 0 faces -Z, positive turns left) of the horizontal direction (dx, dz). */
export function yawOf(dx: number, dz: number): number { return Math.atan2(-dx, -dz); }
