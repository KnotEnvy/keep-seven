// Previous / current sim transform pairs, blended by the frame's alpha in update() (ARCHITECTURE 3.3).
import type { Vec3 } from './contracts.ts';

/** A position that moves in fixedUpdate and is drawn interpolated. */
export class Interp3 {
  px = 0; py = 0; pz = 0;
  x = 0; y = 0; z = 0;
  /** Call once per tick with the new sim value: current becomes previous. */
  set(x: number, y: number, z: number): void {
    this.px = this.x; this.py = this.y; this.pz = this.z;
    this.x = x; this.y = y; this.z = z;
  }
  /** Teleports and spawns: no blend across the jump. */
  snap(x: number, y: number, z: number): void {
    this.px = this.x = x; this.py = this.y = y; this.pz = this.z = z;
  }
  get(alpha: number, out: Vec3): Vec3 {
    out.x = this.px + (this.x - this.px) * alpha;
    out.y = this.py + (this.y - this.py) * alpha;
    out.z = this.pz + (this.z - this.pz) * alpha;
    return out;
  }
}

/** A scalar (a door's travel, a lift's height). */
export class Interp1 {
  p = 0; v = 0;
  set(v: number): void { this.p = this.v; this.v = v; }
  snap(v: number): void { this.p = this.v = v; }
  get(alpha: number): number { return this.p + (this.v - this.p) * alpha; }
}

/** An angle in radians, blended along the short arc. */
export class InterpAngle {
  p = 0; v = 0;
  set(v: number): void { this.p = this.v; this.v = v; }
  snap(v: number): void { this.p = this.v = v; }
  get(alpha: number): number {
    let d = (this.v - this.p) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2;
    return this.p + d * alpha;
  }
}
