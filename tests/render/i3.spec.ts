// Pass i3 (render-tech): the air light's two new shapes as arithmetic (post.ts AirLights), and the mood tables that feed them.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { AIR_CONE_ONLY, AIR_CONE_REACH, AIR_FAR, AIR_GLOW_ANGLE, AIR_GLOW_FAR, AIR_MAX, AIR_NEAR, AirLights } from '../../src/render/post.ts';
import { AIR, AIR_CONE, AIR_GLOW, GLANCE, MOODS, M_SKY } from '../../src/render/moods.ts';
import type { MoodKey } from '../../src/render/moods.ts';

function camera(): THREE.PerspectiveCamera {
  const c = new THREE.PerspectiveCamera(60, 16 / 9, 0.05, 2000);
  c.position.set(0, 0, 0); c.lookAt(0, 0, -1); c.updateMatrixWorld(); c.updateProjectionMatrix();
  return c;
}
function offer(a: AirLights, x: number, y: number, z: number, cone = 0, level = 1, reach = 3.5): void {
  a.x = x; a.y = y; a.z = z; a.cone = cone; a.level = level; a.reach = reach; a.r = a.g = a.b = 1; a.offer();
}

describe('the air light, pass i3', () => {
  it('without a far glow a lamp is gone at AIR_FAR and fades from AIR_NEAR, as before the pass', () => {
    const a = new AirLights();
    a.begin(camera());
    offer(a, 0, 0, -10); offer(a, 0, 0, -(AIR_NEAR + AIR_FAR) / 2); offer(a, 0, 0, -(AIR_FAR + 1)); offer(a, 0, 0, -200);
    a.tally();
    expect(a.count).toBe(2);
    expect(a.far).toBe(0);
    expect(a.world[3]).toBe(3.5);
    expect(a.col[0]).toBeCloseTo(1, 6);
    expect(a.col[4]).toBeCloseTo(0.5, 6);          // half way through the fade
    expect(a.col[3]).toBe(0); expect(a.col[7]).toBe(0);
  });
  it('with one, a far lamp keeps its place: marked by a negative reach, as wide and as bright on screen as a near one', () => {
    const a = new AirLights();
    a.farK = 1;
    a.begin(camera());
    offer(a, 0, 0, -10); offer(a, 0, 0, -90); offer(a, 0, 0, -300); offer(a, 0, 0, -(AIR_GLOW_FAR + 5));
    a.tally();
    expect(a.count).toBe(3);
    expect(a.far).toBe(2);
    expect(a.world[3]).toBe(3.5);
    expect(a.world[7]).toBeCloseTo(-90 * AIR_GLOW_ANGLE, 4);         // beyond AIR_FAR the reach is the angle's
    expect(a.world[11]).toBeCloseTo(-300 * AIR_GLOW_ANGLE, 4);       // 300 m: the reach grows with the distance
    expect(a.col[4]).toBeCloseTo(90 / AIR_FAR, 4);                   // ... and so does the level
    expect(a.col[8]).toBeCloseTo(300 / AIR_FAR, 4);
  });
  it('a lamp whose cone alone may be in the frame is kept, and never takes the place of one whose glow is in it', () => {
    const cam = camera();
    const a = new AirLights();
    a.coneOn = true;
    a.begin(cam);
    // 12 m ahead, 7 m over the top of the frame by its 3.5 m reach, inside it by the cone's
    const y = 12 * Math.tan(30 * Math.PI / 180) + 3.5 * 1.16 + 1.5;
    expect(y - 12 * Math.tan(30 * Math.PI / 180)).toBeLessThan(AIR_CONE_REACH);
    offer(a, 0, y, -12, 1);
    expect(a.count).toBe(1);
    expect(a.col[3]).toBe(1);
    const b = new AirLights();
    b.begin(cam);
    offer(b, 0, y, -12, 1);
    expect(b.count).toBe(0);                       // the mood has no cone: culled as before
    // a full set of weak lamps in the frame: the cone-only lamp at full level does not displace one
    for (let i = 0; i < AIR_MAX; i++) offer(a, (i - 6) * 0.5, 0, -10, 0, 0.2);
    a.tally();
    expect(a.count).toBe(AIR_MAX);
    expect(a.cones).toBe(0);
    expect(AIR_CONE_ONLY).toBeLessThan(0.2);
  });
  it('the mood tables: a cone and a far glow only where there is an air light, a glance only under a sky without a sun disc', () => {
    for (const k of Object.keys(AIR_CONE) as MoodKey[]) { expect(AIR[k], k).toBeGreaterThan(0); expect(AIR_CONE[k]).toBeGreaterThanOrEqual(0); expect(AIR_CONE[k]).toBeLessThanOrEqual(12); }
    for (const k of Object.keys(AIR_GLOW) as MoodKey[]) { expect(AIR[k], k).toBeGreaterThan(0); expect(AIR_GLOW[k]).toBeLessThan(40); expect(MOODS[k][M_SKY], `${k}: in a room the set is the near lamps'`).toBe(1); }
    for (const k of Object.keys(GLANCE) as MoodKey[]) { expect(MOODS[k][M_SKY], k).toBe(1); expect(GLANCE[k]![1]).toBeGreaterThanOrEqual(1); }
    // the Long Light keeps its sparkle and its relief: none of the three new terms by day
    for (const k of ['L0', 'L1'] as MoodKey[]) { expect(AIR_CONE[k]).toBeUndefined(); expect(AIR_GLOW[k]).toBeUndefined(); expect(GLANCE[k]).toBeUndefined(); }
  });
});
