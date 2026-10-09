// Camera motion (GDD 5, 6.2; game-feel 1.4, 2.3): the recoil kick that returns exactly to the aim point, FOV punch and
// sprint FOV, head bob in phase with the footfalls, strafe roll, the landing dip and the smoothing of steps.
// Everything is an additive offset computed on the sim tick (deterministic) and blended by alpha for the frame; none of
// it ever moves the stored aim. No three.js here: the system writes the result onto the camera.
import type { AmmoDef } from '../core/contracts.ts';
import { Interp1 } from '../core/interp.ts';
import {
  BOB_FADE_RATE, BOB_LATERAL, BOB_VERTICAL, FLINCH_DEG_MAX, FLINCH_DEG_MIN, FLINCH_PEAK, FLINCH_ROLL, FLINCH_SECONDS, LAND_DIP_MAX, LAND_DIP_PER_MPS, LAND_DIP_SECONDS, RUN_SPEED, SPRINT_FOV_DEG,
  SPRINT_FOV_IN, SPRINT_FOV_OUT, STEP_SMOOTH_RATE, STRAFE_ROLL_DEG, TIME_EPS,
} from './defs.ts';

const DEG = Math.PI / 180;
const ROLL_RATE = 12;
/** the dip goes down in the first part of its time and springs back in the rest */
const DIP_ATTACK = 0.05;

/** 0 -> 1 at `peak` (fast attack), then back to exactly 0 at `end` (ease-out, no overshoot). */
export function kickCurve(t: number, peak: number, end: number): number {
  if (t <= 0 || t >= end - TIME_EPS) return 0;
  if (t < peak) { const u = 1 - t / peak; return 1 - u * u; }
  const u = 1 - (t - peak) / (end - peak);
  return u * u * u;
}

/** What the camera needs from the body on a tick. */
export interface BodyMotion {
  grounded: boolean; sprinting: boolean;
  /** horizontal speed and its component along the view's right vector, m/s */
  speed: number; strafeSpeed: number;
  stridePhase: number; strideCount: number;
  landed: boolean; landSpeed: number;
  stepShift: number;
}

export class CameraRig {
  // ---- sim values of this tick and the last, blended for the frame
  readonly offsetY = new Interp1();
  readonly offsetSide = new Interp1();
  readonly roll = new Interp1();
  readonly kickPitch = new Interp1();
  readonly kickYaw = new Interp1();
  readonly fov = new Interp1();
  /** 0..1 of the view-model kick, the bob and the dip the view-model follows */
  readonly viewKick = new Interp1();
  readonly bobY = new Interp1();
  readonly dip = new Interp1();

  /** the flinch of a hit taken: radians added to the camera's pitch, yaw and roll (never to the aim) */
  readonly hurtPitch = new Interp1();
  readonly hurtYaw = new Interp1();
  readonly hurtRoll = new Interp1();
  private hurtT = -1;
  private hurtP = 0;
  private hurtY = 0;
  private hurtR = 0;
  /** what was left of the last flinch when the next blow landed: let go over the new one's attack, so nothing snaps */
  private carryP = 0;
  private carryY = 0;
  private carryR = 0;

  private kickT = -1;
  private kickPitchDeg = 0;
  private kickYawDeg = 0;
  private kickPeak = 0.055;
  private kickEnd = 0.32;
  private viewT = -1;
  private viewEnd = 0.3;
  /** metres back and degrees of muzzle rise of the view-model kick in flight (lead 0.08 / 20, kept 0.11 / 26) */
  viewBack = 0.08;
  viewRiseDeg = 20;
  private punchT = -1;
  private punchDeg = 0;
  private punchEnd = 0.08;
  private sprintFov = 0;
  private bobAmp = 0;
  private rollNow = 0;
  private dipT = -1;
  private dipDepth = 0;
  private stepOffset = 0;

  /** A shot left the barrel on this tick. `yawSign` is the seeded -1..1 of the sideways kick. */
  fire(ammo: Readonly<AmmoDef>, yawSign: number, reduceMotion: boolean): void {
    this.kickT = 0;
    this.kickPitchDeg = ammo.cameraKickPitchDeg; this.kickYawDeg = ammo.cameraKickYawDeg * yawSign;
    this.kickPeak = ammo.cameraKickPeak; this.kickEnd = ammo.cameraKickRecover;
    this.viewT = 0; this.viewEnd = ammo.viewKickSeconds; this.viewBack = ammo.viewKickBack; this.viewRiseDeg = ammo.viewKickRiseDeg;
    if (!reduceMotion && ammo.fovPunchDeg > 0) { this.punchT = 0; this.punchDeg = ammo.fovPunchDeg; this.punchEnd = ammo.fovPunchSeconds; }
  }

  /**
   * A hit landed on this tick. `strength` 0..1 (FLINCH_DEG_MIN to FLINCH_DEG_MAX); `right` and `front` are the unit
   * direction TO the source in her view (right +1, ahead +1; 0, 0: no direction, taken as from the front); `scale` is
   * options.screenShake. The view goes away from the source: up for a blow from ahead, down from behind, turned and
   * leaned to the other side for one from a side.
   */
  hurt(strength: number, right: number, front: number, scale: number, reduceMotion: boolean): void {
    if (reduceMotion || scale <= 0) return;
    const s = strength < 0 ? 0 : strength > 1 ? 1 : strength;
    const deg = (FLINCH_DEG_MIN + (FLINCH_DEG_MAX - FLINCH_DEG_MIN) * s) * (scale > 1 ? 1 : scale);
    if (right === 0 && front === 0) front = 1;
    this.carryP = this.hurtPitch.v; this.carryY = this.hurtYaw.v; this.carryR = this.hurtRoll.v;
    this.hurtT = 0;
    this.hurtP = deg * front * DEG; this.hurtY = deg * right * DEG; this.hurtR = deg * right * FLINCH_ROLL * DEG;
  }

  /** One sim tick. Of the options it reads headBob (0 .. 1.5) and reduceMotion, live. */
  tick(dt: number, body: Readonly<BodyMotion>, options: { readonly headBob: number; readonly reduceMotion: boolean }): void {
    if (dt <= 0) return;
    const headBob = options.headBob, reduceMotion = options.reduceMotion;
    // ---- recoil: additive, back on the aim point by the ammunition's recover time
    let kp = 0, ky = 0;
    if (this.kickT >= 0) {
      this.kickT += dt;
      const k = kickCurve(this.kickT, this.kickPeak, this.kickEnd);
      kp = this.kickPitchDeg * k * DEG; ky = this.kickYawDeg * k * DEG;
      if (this.kickT >= this.kickEnd - TIME_EPS) this.kickT = -1;
    }
    this.kickPitch.set(kp); this.kickYaw.set(ky);
    let vk = 0;
    if (this.viewT >= 0) {
      this.viewT += dt;
      vk = kickCurve(this.viewT, 0.04, this.viewEnd);
      if (this.viewT >= this.viewEnd - TIME_EPS) this.viewT = -1;
    }
    this.viewKick.set(vk);
    // ---- the flinch: the same curve as the kick; under reduceMotion it is not started and one in flight is dropped
    let hp = 0, hy = 0, hr = 0;
    if (this.hurtT >= 0) {
      this.hurtT += dt;
      if (reduceMotion || this.hurtT >= FLINCH_SECONDS - TIME_EPS) this.hurtT = -1;
      else {
        const k = kickCurve(this.hurtT, FLINCH_PEAK, FLINCH_SECONDS);
        const c = this.hurtT < FLINCH_PEAK ? 1 - this.hurtT / FLINCH_PEAK : 0;
        hp = this.hurtP * k + this.carryP * c; hy = this.hurtY * k + this.carryY * c; hr = this.hurtR * k + this.carryR * c;
      }
    }
    this.hurtPitch.set(hp); this.hurtYaw.set(hy); this.hurtRoll.set(hr);

    // ---- field of view: the punch per shot and the sprint widening
    let punch = 0;
    if (this.punchT >= 0) {
      // the full punch is drawn on the click's tick; it decays from the next one and is gone at punchEnd
      if (this.punchT >= this.punchEnd - TIME_EPS) this.punchT = -1;
      else { punch = this.punchDeg * (1 - this.punchT / this.punchEnd); this.punchT += dt; }
    }
    const target = body.sprinting && !reduceMotion ? SPRINT_FOV_DEG : 0;
    if (this.sprintFov < target) this.sprintFov = Math.min(target, this.sprintFov + (SPRINT_FOV_DEG / SPRINT_FOV_IN) * dt);
    else if (this.sprintFov > target) this.sprintFov = Math.max(target, this.sprintFov - (SPRINT_FOV_DEG / SPRINT_FOV_OUT) * dt);
    this.fov.set(reduceMotion ? 0 : this.sprintFov + punch);

    // ---- bob: one vertical cycle per footfall (lowest on the footfall), one lateral cycle per two
    const scale = reduceMotion ? 0 : headBob;
    const want = body.grounded && body.speed > 0.3 ? Math.min(1, body.speed / RUN_SPEED) : 0;
    this.bobAmp += (want - this.bobAmp) * Math.min(1, BOB_FADE_RATE * dt);
    const phase = body.stridePhase * Math.PI * 2;
    const bobY = -BOB_VERTICAL * (0.5 + 0.5 * Math.cos(phase)) * this.bobAmp * scale;
    const side = BOB_LATERAL * Math.sin((body.strideCount + body.stridePhase) * Math.PI) * this.bobAmp * scale;

    // ---- landing dip
    if (body.landed) {
      this.dipT = 0;
      this.dipDepth = Math.min(LAND_DIP_MAX, LAND_DIP_PER_MPS * body.landSpeed);
    }
    let dip = 0;
    if (this.dipT >= 0) {
      this.dipT += dt;
      if (this.dipT >= LAND_DIP_SECONDS - TIME_EPS) this.dipT = -1;
      else if (this.dipT < DIP_ATTACK) dip = this.dipT / DIP_ATTACK;
      else { const u = 1 - (this.dipT - DIP_ATTACK) / (LAND_DIP_SECONDS - DIP_ATTACK); dip = u * u; }
      dip *= -this.dipDepth * scale;
    }

    // ---- a climbed step moves the body at once; the eye follows at 18 / s (never in X or Z)
    this.stepOffset -= body.stepShift;
    this.stepOffset *= Math.exp(-STEP_SMOOTH_RATE * dt);
    if (this.stepOffset < 1e-4 && this.stepOffset > -1e-4) this.stepOffset = 0;

    this.offsetY.set(this.stepOffset + bobY + dip);
    this.offsetSide.set(side);
    this.bobY.set(bobY); this.dip.set(dip);

    // ---- strafe roll: 1 degree at full strafe speed, toward the strafe
    const rollWant = reduceMotion ? 0 : -(body.strafeSpeed / RUN_SPEED) * STRAFE_ROLL_DEG * DEG * scaleRoll(headBob);
    this.rollNow += (rollWant - this.rollNow) * Math.min(1, ROLL_RATE * dt);
    if (this.rollNow < 1e-6 && this.rollNow > -1e-6) this.rollNow = 0;
    this.roll.set(this.rollNow);
  }

  /** A teleport or a restore: no blend across the jump, no motion carried over. */
  reset(): void {
    this.kickT = -1; this.viewT = -1; this.punchT = -1; this.dipT = -1; this.hurtT = -1;
    this.hurtPitch.snap(0); this.hurtYaw.snap(0); this.hurtRoll.snap(0);
    this.sprintFov = 0; this.bobAmp = 0; this.rollNow = 0; this.stepOffset = 0; this.dipDepth = 0;
    this.offsetY.snap(0); this.offsetSide.snap(0); this.roll.snap(0); this.kickPitch.snap(0); this.kickYaw.snap(0);
    this.fov.snap(0); this.viewKick.snap(0); this.bobY.snap(0); this.dip.snap(0);
  }
  /** degrees, of this tick (debug snapshot) */
  get kickPitchDegNow(): number { return this.kickPitch.v / DEG; }
  get kickYawDegNow(): number { return this.kickYaw.v / DEG; }
  get hurtPitchDegNow(): number { return this.hurtPitch.v / DEG; }
  get hurtYawDegNow(): number { return this.hurtYaw.v / DEG; }
  get hurtRollDegNow(): number { return this.hurtRoll.v / DEG; }
}

/** the roll is a camera motion like the bob: it follows the same slider, but never above 1 */
function scaleRoll(headBob: number): number { return headBob > 1 ? 1 : headBob; }
