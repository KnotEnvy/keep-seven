// src/enemies/boss/arm.ts: the gantry arm and the drum (GDD 8, "Movement"). Six indexes, one per bay; 1.5 s per
// 60 degree step, the shorter way round, a 2 degree overshoot and settle. Pure maths plus the Arm state: no three.js.
import { BOSS } from '../defs.ts';

/** Compass bearing (degrees, 0 = north = -Z, clockwise) of a point seen from an axis. */
export function bearingDeg(x: number, z: number, axisX: number, axisZ: number): number {
  const b = Math.atan2(x - axisX, -(z - axisZ)) * 180 / Math.PI;
  return b < 0 ? b + 360 : b;
}

/** The bay (1..6) a bearing lies in: bay k is centred on 60 (k - 1) degrees, +-30. */
export function bayOfBearing(bearing: number): number {
  const b = ((bearing % 360) + 360) % 360;
  return (Math.floor((b + 30) / 60) % 6) + 1;
}

export function bearingOfBay(bay: number): number { return ((bay - 1) % 6) * 60; }

/** Signed 60 degree steps from one index to another, the shorter way round (+ = clockwise); the half turn goes clockwise. */
export function indexSteps(fromBay: number, toBay: number): number {
  let d = (((toBay - fromBay) % 6) + 6) % 6;
  if (d > 3) d -= 6;
  return d;
}

export function indexSeconds(steps: number): number { return Math.abs(steps) * BOSS.indexStep; }

/** The index opposite a bay: bay k -> bay k + 3 (the hush). */
export function oppositeBay(bay: number): number { return ((bay - 1 + 3) % 6) + 1; }

/** Signed offset (degrees, -180..180] of a bearing from the arm's heading. */
export function offArc(bearing: number, heading: number): number {
  let d = (bearing - heading) % 360;
  if (d > 180) d -= 360; else if (d <= -180) d += 360;
  return d;
}

/** A bearing clamped into the arc the Windlass can aim in (+-35 degrees of the heading). */
export function clampToArc(bearing: number, heading: number): number {
  const d = offArc(bearing, heading);
  if (d > BOSS.arcDeg) return heading + BOSS.arcDeg;
  if (d < -BOSS.arcDeg) return heading - BOSS.arcDeg;
  return heading + d;
}

/**
 * Where a canister lands for a player at `bearing`, `dist` metres from the axis (polish round 2). Inside the arc: on
 * her. Outside it: as far toward her as leaves its whole 3.5 m ring inside the arc, so "out of its arc until the next
 * index" (GDD 8, Movement) is true of canisters too. Clamped to the arc's edge itself, the ring reached 32 degrees
 * beyond it at 6.3 m from the axis: a player who had changed bay was still inside it, and one circling the chamber
 * walked into rings that were never thrown at her (scratch/r2-fix-code-enemies/haulA_detail.json: every hit of phase 1).
 */
export function canisterBearing(bearing: number, heading: number, dist: number): number {
  const d = offArc(bearing, heading);
  if (d >= -BOSS.arcDeg && d <= BOSS.arcDeg) return heading + d;
  const half = Math.asin(Math.min(1, BOSS.canisterRing / Math.max(dist, 0.1))) * 180 / Math.PI;
  const lim = Math.max(0, BOSS.arcDeg - half);
  return heading + (d > 0 ? lim : -lim);
}

export class Arm {
  /** the index it last settled on (1..6) */
  bay = 1;
  /** heading in degrees, continuous (may leave 0..360 while it turns) */
  heading = 0;
  moving = false;
  fromBay = 1;
  toBay = 1;
  private from = 0;
  private to = 0;
  private t = 0;
  private seconds = 0;
  /** ratchet steps passed in the current move (the caller plays a click when it grows) */
  clicks = 0;
  /** drum spin, degrees about the heading axis (0 = mouth 1 at the top) */
  spin = 0;
  private spinFrom = 0;
  private spinTo = 0;
  private spinT = 0;
  private spinSeconds = 0;

  reset(bay: number): void {
    this.bay = bay; this.fromBay = bay; this.toBay = bay;
    this.heading = bearingOfBay(bay);
    this.moving = false; this.t = 0; this.seconds = 0; this.clicks = 0;
    this.spin = 0; this.spinSeconds = 0;
  }

  /** Start a ratchet run to an index. `seconds` 0 = 1.5 s per step. Returns the duration. */
  indexTo(toBay: number, seconds = 0): number {
    const steps = indexSteps(this.bay, toBay);
    if (steps === 0) { this.moving = false; this.toBay = this.bay; this.fromBay = this.bay; return 0; }
    this.fromBay = this.bay; this.toBay = toBay;
    this.from = bearingOfBay(this.bay);
    this.heading = this.from;
    this.to = this.from + steps * 60;
    this.seconds = seconds > 0 ? seconds : indexSeconds(steps);
    this.t = 0;
    this.clicks = 0;
    this.moving = true;
    return this.seconds;
  }

  /** Advance the arm. Returns true on the tick it settles on its index. */
  tick(dt: number): boolean {
    if (this.spinSeconds > 0) {
      this.spinT += dt;
      const u = this.spinT >= this.spinSeconds ? 1 : this.spinT / this.spinSeconds;
      this.spin = this.spinFrom + (this.spinTo - this.spinFrom) * u;
      if (u >= 1) this.spinSeconds = 0;
    }
    if (!this.moving) return false;
    this.t += dt;
    const total = this.seconds;
    const settle = Math.min(BOSS.settle, total * 0.25);
    const run = total - settle;
    const sign = this.to >= this.from ? 1 : -1;
    if (this.t >= total) {
      this.heading = bearingOfBay(this.toBay);
      this.bay = this.toBay;
      this.moving = false;
      return true;
    }
    if (this.t < run) {
      // a ratchet: constant speed to the index plus the overshoot
      const u = this.t / run;
      this.heading = this.from + (this.to + sign * BOSS.overshootDeg - this.from) * u;
      const steps = Math.floor(Math.abs(this.heading - this.from) / 60);
      if (steps > this.clicks) this.clicks = steps;
    } else {
      const u = (this.t - run) / settle;
      this.heading = this.to + sign * BOSS.overshootDeg * (1 - u);
    }
    return false;
  }

  /** Turn the drum to an absolute spin over `seconds` (the notch after a discharge). */
  spinTo_(degrees: number, seconds: number): void {
    this.spinFrom = this.spin; this.spinTo = degrees; this.spinT = 0; this.spinSeconds = seconds;
    if (seconds <= 0) this.spin = degrees;
  }
  /** Free spin at a rate (degrees per second). */
  spinBy(rate: number, dt: number): void {
    this.spinSeconds = 0;
    this.spin = (this.spin + rate * dt) % 360;
  }
}
