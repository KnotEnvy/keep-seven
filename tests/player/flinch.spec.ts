// The flinch (pass i4, combat review "camera shake on damage is too small to see"; ruling R20): a hit knocks the view
// away from its source and lets it come back, as the gun's own kick does. Pure logic of the camera rig.
import { describe, expect, it } from 'vitest';
import { FIXED_DT } from '../../src/core/contracts.ts';
import { CameraRig } from '../../src/player/camera.ts';
import type { BodyMotion } from '../../src/player/camera.ts';
import { FLINCH_DEG_MAX, FLINCH_DEG_MIN, FLINCH_PEAK, FLINCH_ROLL, FLINCH_SECONDS, WEAPON } from '../../src/player/defs.ts';

const STILL: BodyMotion = { grounded: true, sprinting: false, speed: 0, strafeSpeed: 0, stridePhase: 0, strideCount: 0, landed: false, landSpeed: 0, stepShift: 0 };
const OPT = { headBob: 1, reduceMotion: false };
/** per tick after the blow: [pitch, yaw, roll] in degrees */
function series(rig: CameraRig, ticks: number, options = OPT): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i < ticks; i++) { rig.tick(FIXED_DT, STILL, options); out.push([rig.hurtPitchDegNow, rig.hurtYawDegNow, rig.hurtRollDegNow]); }
  return out;
}
const peak = (rows: [number, number, number][], k: 0 | 1 | 2): number => rows.reduce((m, r) => (Math.abs(r[k]) > Math.abs(m) ? r[k] : m), 0);

describe('the flinch', () => {
  it('a blow from the front tips the view up by 1 degree (10 HP or less) to 2 degrees (38 HP), there in 0.05 s and exactly gone by 0.25 s', () => {
    expect([FLINCH_DEG_MIN, FLINCH_DEG_MAX, FLINCH_PEAK, FLINCH_SECONDS]).toEqual([1, 2, 0.05, 0.25]);
    for (const [strength, deg] of [[0, 1], [0.5, 1.5], [1, 2]] as const) {
      const rig = new CameraRig();
      rig.hurt(strength, 0, 1, 1, false);
      const rows = series(rig, 20);
      expect(rows[2]?.[0]).toBeCloseTo(deg, 6);            // tick 3 = 0.05 s: the whole knock
      expect(rows[0]?.[0]).toBeGreaterThan(deg * 0.5);     // more than half of it on the first tick after the blow
      expect(peak(rows, 0)).toBeCloseTo(deg, 6);
      for (let i = 3; i < 14; i++) expect(rows[i]?.[0] as number).toBeLessThan(rows[i - 1]?.[0] as number);   // then only back
      for (let i = 14; i < 20; i++) expect(rows[i]).toEqual([0, 0, 0]);                                      // tick 15 = 0.25 s: exactly on the aim
      expect(rows.every((r) => r[1] === 0 && r[2] === 0)).toBe(true);
    }
  });
  it('away from the source: down for one from behind; turned and leaned to the other side for one from a side', () => {
    const behind = new CameraRig(); behind.hurt(0, 0, -1, 1, false);
    expect(peak(series(behind, 15), 0)).toBeCloseTo(-1, 6);
    const right = new CameraRig(); right.hurt(1, 1, 0, 1, false);
    const r = series(right, 15);
    expect(peak(r, 1)).toBeCloseTo(2, 6);                  // positive yaw turns the view LEFT: away from a blow on the right
    expect(peak(r, 2)).toBeCloseTo(2 * FLINCH_ROLL, 6);
    expect(peak(r, 0)).toBe(0);
    const left = new CameraRig(); left.hurt(1, -1, 0, 1, false);
    expect(peak(series(left, 15), 1)).toBeCloseTo(-2, 6);
    // a blow with no direction counts as from the front
    const none = new CameraRig(); none.hurt(0, 0, 0, 1, false);
    expect(peak(series(none, 15), 0)).toBeCloseTo(1, 6);
  });
  it('none under reduceMotion (one in flight is dropped), scaled by the screen-shake option, and it never touches the recoil', () => {
    const off = new CameraRig(); off.hurt(1, 0, 1, 1, true);
    expect(peak(series(off, 15), 0)).toBe(0);
    const dropped = new CameraRig(); dropped.hurt(1, 0, 1, 1, false);
    series(dropped, 2);
    expect(series(dropped, 3, { headBob: 1, reduceMotion: true })).toEqual([[0, 0, 0], [0, 0, 0], [0, 0, 0]]);
    const half = new CameraRig(); half.hurt(1, 0, 1, 0.5, false);
    expect(peak(series(half, 15), 0)).toBeCloseTo(1, 6);
    const zero = new CameraRig(); zero.hurt(1, 0, 1, 0, false);
    expect(peak(series(zero, 15), 0)).toBe(0);
    // a shot inside a flinch: the kick is the kick's own (2.5 degrees), the flinch its own
    const both = new CameraRig(); both.hurt(1, 0, 1, 1, false); both.fire(WEAPON.ammo.lead_round, 0, false);
    let kick = 0, hurt = 0;
    for (let i = 0; i < 20; i++) { both.tick(FIXED_DT, STILL, OPT); kick = Math.max(kick, both.kickPitchDegNow); hurt = Math.max(hurt, both.hurtPitchDegNow); }
    expect(kick).toBeGreaterThan(2.3); expect(kick).toBeLessThanOrEqual(2.5);
    expect(hurt).toBeCloseTo(2, 6);
    expect([both.kickPitchDegNow, both.hurtPitchDegNow]).toEqual([0, 0]);
  });
  it('a second blow inside the first does not snap the view: the rest of the first is let go over the attack of the second', () => {
    const rig = new CameraRig();
    rig.hurt(1, 0, 1, 1, false);
    const a = series(rig, 3);                              // at the peak: 2 degrees up
    rig.hurt(1, 1, 0, 1, false);                           // now from the right
    const b = series(rig, 15);
    const all = [...a, ...b];
    for (let i = 1; i < all.length; i++) {
      const step = Math.hypot((all[i]?.[0] as number) - (all[i - 1]?.[0] as number), (all[i]?.[1] as number) - (all[i - 1]?.[1] as number));
      expect(step).toBeLessThan(1.4);                      // never more in a tick than the attack's own first step (2 degrees x 0.56) and a little
    }
    expect(peak(b, 1)).toBeCloseTo(2, 6);
    expect(b[14]).toEqual([0, 0, 0]);
  });
  it('a teleport or a restore drops it', () => {
    const rig = new CameraRig(); rig.hurt(1, 0, 1, 1, false);
    series(rig, 2); rig.reset();
    expect([rig.hurtPitch.get(0.5), rig.hurtYaw.get(0.5), rig.hurtRoll.get(0.5)]).toEqual([0, 0, 0]);
    expect(series(rig, 3)).toEqual([[0, 0, 0], [0, 0, 0], [0, 0, 0]]);
  });
});
