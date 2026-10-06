// The body against the real collision engine, in Node: GDD 21 test 1 and game-feel 9 (movement), and the three engine
// properties of ARCHITECTURE 6 (ledges and jumps). The same controller runs in the game; tests/player/*.test.mjs
// repeat the load-bearing ones through the sandbox page.
import { describe, expect, it } from 'vitest';
import { FIXED_DT, PLAYER_HEIGHT, PLAYER_RADIUS } from '../../src/core/contracts.ts';
import type { LayoutSolid } from '../../src/core/contracts.ts';
import { CollisionWorldImpl, surfaceIndex } from '../../src/core/collision.ts';
import { solidFlags, solidTriangles } from '../../src/core/greybox.ts';
import { Controller } from '../../src/player/controller.ts';
import { JUMP_APEX, RUN_SPEED, SPRINT_SPEED, STEP_UP } from '../../src/player/defs.ts';

type S = Partial<LayoutSolid> & { pos: [number, number, number]; size: [number, number, number] };
let nextId = 0;
function world(solids: S[]): CollisionWorldImpl {
  const col = new CollisionWorldImpl();
  const flat: number[] = [], surf: number[] = [], flags: number[] = [], sol: number[] = [], ids: string[] = [];
  for (const part of solids) {
    const s: LayoutSolid = { id: `s${nextId++}`, zone: 'the_lip', shape: 'box', role: 'wall', surface: 'stone', rotY: 0, ...part };
    const n = solidTriangles(s, flat);
    const si = ids.length; ids.push(s.id);
    for (let i = 0; i < n; i++) { surf.push(surfaceIndex(s.surface)); flags.push(solidFlags(s)); sol.push(si); }
  }
  col.setStatic(Float32Array.from(flat), Uint8Array.from(surf), Uint8Array.from(flags), Uint16Array.from(sol), ids);
  return col;
}
const FLOOR: S = { pos: [0, -0.5, 0], size: [200, 1, 200], role: 'floor', surface: 'sand' };
const hspeed = (c: Controller): number => Math.hypot(c.velocity.x, c.velocity.z);
/** a body standing at (x, 0, z) on the floor, settled */
function body(col: CollisionWorldImpl, x = 0, y = 0, z = 0): Controller {
  const c = new Controller(col);
  c.teleport(x, y, z);
  for (let i = 0; i < 3; i++) c.tick(FIXED_DT, 0, 0, false, false);
  return c;
}
/** walk with yaw 0 (toward -Z) for n ticks; returns the largest rise of the feet in one tick */
function walk(c: Controller, n: number, o: { sprint?: boolean; fwd?: number; strafe?: number; yaw?: number; jumpAt?: number } = {}): number {
  let worst = 0;
  for (let i = 0; i < n; i++) {
    const y = c.position.y;
    c.viewYaw = o.yaw ?? 0; c.tick(FIXED_DT, o.fwd ?? 1, o.strafe ?? 0, o.sprint === true, o.jumpAt === i);
    worst = Math.max(worst, c.position.y - y);
  }
  return worst;
}

describe('ground model (GDD 5)', () => {
  it('reaches 4.5 m/s within 0.13 s, tops out at 5.0 and stops within 0.45 m', () => {
    const c = body(world([FLOOR]));
    walk(c, 8);                                             // 0.133 s
    expect(hspeed(c)).toBeGreaterThanOrEqual(4.5);
    walk(c, 60);
    expect(hspeed(c)).toBeCloseTo(RUN_SPEED, 6);
    const z = c.position.z;
    let ticks = 0;
    while (hspeed(c) > 0 && ticks < 120) { c.tick(FIXED_DT, 0, 0, false, false); ticks++; }
    expect(z - c.position.z).toBeLessThanOrEqual(0.45);
    expect(z - c.position.z).toBeGreaterThan(0.3);
    expect(ticks).toBeLessThan(20);
  });
  it('sprints at 6.75 forward only; backward is x0.9, strafe x1.0', () => {
    const col = world([FLOOR]);
    let c = body(col); walk(c, 90, { sprint: true });
    expect(hspeed(c)).toBeCloseTo(SPRINT_SPEED, 6);
    expect(c.sprinting).toBe(true);
    c = body(col); walk(c, 90, { sprint: true, fwd: -1 });
    expect(hspeed(c)).toBeCloseTo(RUN_SPEED * 0.9, 6);
    expect(c.sprinting).toBe(false);
    c = body(col); walk(c, 90, { sprint: true, fwd: 0, strafe: 1 });
    expect(hspeed(c)).toBeCloseTo(RUN_SPEED, 6);
    expect(c.velocity.x).toBeGreaterThan(4.9);              // strafe +1 is to the right (+X at yaw 0)
    c = body(col); walk(c, 90, { fwd: 1, strafe: 1 });
    expect(hspeed(c)).toBeCloseTo(RUN_SPEED, 6);            // a diagonal is not faster
  });
  it('sprinting is measured: not against a wall, not in a standing jump, not below a run; a sprint jump keeps it', () => {
    const col = world([FLOOR, { pos: [0, 1.5, -3], size: [20, 3, 1], role: 'wall' }]);
    let c = body(col, 0, 0, -2.1);
    for (let i = 0; i < 60; i++) { c.tick(FIXED_DT, 1, 0, true, false); expect(c.sprinting).toBe(false); }
    expect(hspeed(c)).toBeLessThan(0.01);
    c = body(col, 0, 0, 40);
    c.tick(FIXED_DT, 0, 0, false, true);
    while (!c.grounded) { c.tick(FIXED_DT, 1, 0, true, false); if (!c.grounded) expect(c.sprinting).toBe(false); }
    c = body(col, 0, 0, 80);
    const flags: boolean[] = [];
    for (let i = 0; i < 12; i++) { c.tick(FIXED_DT, 1, 0, true, false); flags.push(c.sprinting); }
    expect(flags.indexOf(true)).toBeGreaterThanOrEqual(3);  // from rest: once she is above a run (5.2 m/s)
    expect(flags.indexOf(true)).toBeLessThanOrEqual(7);
    walk(c, 40, { sprint: true });
    c.tick(FIXED_DT, 1, 0, true, true);
    while (!c.grounded) { expect(c.sprinting).toBe(true); c.tick(FIXED_DT, 1, 0, true, false); }
  });
  it('a footfall every 1.9 m at a run and every 2.3 m at a sprint', () => {
    const col = world([FLOOR]);
    for (const [sprint, stride] of [[false, 1.9], [true, 2.3]] as const) {
      const c = body(col);
      walk(c, 60, { sprint });
      let steps = 0; const z0 = c.position.z;
      for (let i = 0; i < 600; i++) { c.tick(FIXED_DT, 1, 0, sprint, false); if (c.footstep) steps++; }
      expect((z0 - c.position.z) / steps).toBeCloseTo(stride, 1);
    }
  });
});

describe('jump (GDD 5)', () => {
  it('apex 1.0 m +- 0.03, air time 0.58 s +- 0.02', () => {
    const c = body(world([FLOOR]));
    let apex = 0, air = 0;
    c.tick(FIXED_DT, 0, 0, false, true);
    expect(c.jumped).toBe(true);
    air++;
    while (!c.grounded && air < 200) { apex = Math.max(apex, c.position.y); c.tick(FIXED_DT, 0, 0, false, false); air++; }
    expect(Math.abs(apex - 1.0)).toBeLessThanOrEqual(0.03);
    expect(Math.abs(air * FIXED_DT - 0.58)).toBeLessThanOrEqual(0.02);
    expect(c.landed).toBe(true);
    expect(c.landSpeed).toBeGreaterThan(6);
  });
  it('is accepted 0.10 s after walking off a ledge, and not at 0.15 s', () => {
    const col = world([FLOOR, { pos: [0, 1, 10], size: [4, 2, 20], role: 'platform' }]);   // a 2 m platform ending at z = 0
    for (const [late, ok] of [[6, true], [9, false]] as const) {
      const c = body(col, 0, 2, 0.6);
      let left = -1;
      for (let i = 0; i < 60 && left < 0; i++) { c.tick(FIXED_DT, 1, 0, false, false); if (!c.grounded) left = i; }
      expect(left).toBeGreaterThanOrEqual(0);
      for (let i = 1; i < late; i++) c.tick(FIXED_DT, 1, 0, false, false);
      c.tick(FIXED_DT, 1, 0, false, true);              // `late` ticks after the tick she left the ground
      expect(c.jumped).toBe(ok);
    }
  });
  it('a press up to 0.10 s before landing still jumps (buffer)', () => {
    const c = body(world([FLOOR]));
    c.tick(FIXED_DT, 0, 0, false, true);
    let pressed = false, second = false;
    for (let i = 0; i < 80; i++) {
      const press = !pressed && c.velocity.y < 0 && c.position.y < 0.45;   // about 5 ticks before the ground
      if (press) pressed = true;
      c.tick(FIXED_DT, 0, 0, false, press);
      if (c.jumped) { second = true; break; }
    }
    expect(pressed && second).toBe(true);
  });
  it('air control never exceeds the take-off speed, and a standing jump can still be steered', () => {
    const col = world([FLOOR]);
    let c = body(col); walk(c, 60);
    c.tick(FIXED_DT, 1, 0, false, true);
    let top = 0;
    while (!c.grounded) { c.tick(FIXED_DT, 1, 0, false, false); top = Math.max(top, hspeed(c)); }
    expect(top).toBeLessThanOrEqual(RUN_SPEED + 1e-6);
    c = body(col);
    c.tick(FIXED_DT, 0, 0, false, true);
    const z = c.position.z; top = 0;
    while (!c.grounded) { c.tick(FIXED_DT, 1, 0, false, false); top = Math.max(top, hspeed(c)); }
    expect(top).toBeLessThanOrEqual(2.5 + 1e-6);
    expect(z - c.position.z).toBeGreaterThan(0.8);
  });
});

describe('steps, ramps, ledges (ARCHITECTURE 6)', () => {
  const step = (h: number): S => ({ pos: [0, h / 2, -34], size: [6, h, 60], role: 'platform' });   // its edge at z = -4
  it.each([[0.2], [0.3], [0.34], [0.35]])('a %f m step is climbed and no tick gains more than 0.35 m', (h) => {
    for (const sprint of [false, true]) {
      const c = body(world([FLOOR, step(h)]));
      const worst = walk(c, 120, { sprint });
      expect(c.position.y).toBeCloseTo(h, 2);
      expect(c.position.z).toBeLessThan(-5);
      expect(c.grounded).toBe(true);
      expect(worst).toBeLessThanOrEqual(STEP_UP + 0.021);
    }
  });
  it.each([[0.36], [0.4], [0.5], [0.69]])('a %f m step is not climbed, at run or sprint speed', (h) => {
    for (const sprint of [false, true]) {
      const c = body(world([FLOOR, step(h)]));
      const worst = walk(c, 240, { sprint });
      expect(c.position.y).toBeLessThan(0.02);
      expect(c.position.z).toBeGreaterThan(-4 + PLAYER_RADIUS - 0.02);
      expect(worst).toBeLessThan(0.02);
    }
  });
  it('a 0.5 m step is cleared with a jump', () => {
    const c = body(world([FLOOR, step(0.5)]), 0, 0, -1.5);
    walk(c, 120, { jumpAt: 12 });
    expect(c.position.y).toBeCloseTo(0.5, 2);
    expect(c.grounded).toBe(true);
  });
  const ramp = (deg: number): S => { const run = 3, rise = run * Math.tan((deg * Math.PI) / 180); return { shape: 'ramp', pos: [0, rise / 2, -4 - run / 2], size: [4, rise, run], rise: '-z', skirt: 0, role: 'stairs' }; };
  it.each([[30], [36.9], [44.5], [45]])('a %f degree ramp is walked up, and down without leaving the ground', (deg) => {
    const rise = 3 * Math.tan((deg * Math.PI) / 180);
    const col = world([FLOOR, ramp(deg), { pos: [0, rise / 2, -37], size: [4, rise, 60], role: 'platform' }]);
    const c = body(col);
    walk(c, 200);
    expect(c.position.y).toBeCloseTo(rise, 1);
    expect(c.grounded).toBe(true);
    // and back down: grounded on every tick (no sliding, no hopping)
    let air = 0, landings = 0;
    for (let i = 0; i < 260; i++) { c.viewYaw = Math.PI; c.tick(FIXED_DT, 1, 0, false, false); if (!c.grounded) air++; if (c.landed) landings++; }
    expect(c.position.y).toBeLessThan(0.05);
    expect([air, landings]).toEqual([0, 0]);                // over the crest too, up to the walkable limit (order 4.1)
    // and at a sprint from the platform
    c.teleport(0, rise, -9);
    air = 0;
    for (let i = 0; i < 200; i++) { c.viewYaw = Math.PI; c.tick(FIXED_DT, 1, 0, true, false); if (!c.grounded) air++; }
    expect(c.position.y).toBeLessThan(0.05);
    expect(air).toBe(0);
  });
  it('she still falls off a real edge: a 1 m drop and the 60 degree face are flights, not snaps', () => {
    const col = world([FLOOR, { pos: [0, 0.5, -37], size: [4, 1, 60], role: 'platform' }]);
    const c = body(col, 0, 1, -9);
    let air = 0, landings = 0;
    for (let i = 0; i < 120; i++) { c.viewYaw = Math.PI; c.tick(FIXED_DT, 1, 0, false, false); if (!c.grounded) air++; if (c.landed) landings++; }
    expect(air).toBeGreaterThan(10);
    expect(landings).toBe(1);
    expect(c.position.y).toBeLessThan(0.01);
    const rise60 = 3 * Math.tan(Math.PI / 3);
    const c2 = body(world([FLOOR, ramp(60), { pos: [0, rise60 / 2, -37], size: [4, rise60, 60], role: 'platform' }]), 0, rise60, -9);
    air = 0;
    for (let i = 0; i < 200; i++) { c2.viewYaw = Math.PI; c2.tick(FIXED_DT, 1, 0, false, false); if (!c2.grounded) air++; }
    expect(air).toBeGreaterThan(10);                        // not walkable: she is not held on it
  });
  it('a 60 degree ramp is a wall', () => {
    const c = body(world([FLOOR, ramp(60)]));
    walk(c, 240, { sprint: true });
    expect(c.position.y).toBeLessThan(0.3);
    expect(c.position.z).toBeGreaterThan(-4.6);
  });
  it('standing on a 30 degree ramp she does not slide', () => {
    const col = world([FLOOR, ramp(30), { pos: [0, 0.866, -37], size: [4, 1.732, 60], role: 'platform' }]);
    const c = body(col);
    walk(c, 50);
    for (let i = 0; i < 30; i++) c.tick(FIXED_DT, 0, 0, false, false);
    const at = { ...c.position };
    for (let i = 0; i < 120; i++) c.tick(FIXED_DT, 0, 0, false, false);
    expect(at.y).toBeGreaterThan(0.2);
    expect(Math.hypot(c.position.x - at.x, c.position.y - at.y, c.position.z - at.z)).toBeLessThan(1e-3);
  });
  const box = (h: number): S => ({ pos: [0, h / 2, -34], size: [4, h, 60], role: 'cover' });
  it.each([[1.1], [1.2], [1.3]])('a %f m box is not mountable by a jump (apex 1.0 m), whenever the jump is pressed', (h) => {
    const col = world([FLOOR, box(h)]);
    for (let jumpAt = 0; jumpAt < 70; jumpAt += 3) {
      for (const sprint of [false, true]) {
        const c = body(col, 0, 0, -1);
        let top = 0;
        for (let i = 0; i < 200; i++) { c.tick(FIXED_DT, 1, 0, sprint, i === jumpAt || (i > jumpAt && i % 40 === 0)); top = Math.max(top, c.position.y); }
        expect(top).toBeLessThanOrEqual(JUMP_APEX + 0.03);
        expect(c.position.z).toBeGreaterThan(-4 + PLAYER_RADIUS - 0.03);
      }
    }
  });
  it.each([[0.6], [0.9]])('a %f m box is mounted by a jump, running at it or from a standstill against it', (h) => {
    const col = world([FLOOR, box(h)]);
    let c = body(col, 0, 0, -1);
    walk(c, 150, { jumpAt: 22 });
    expect(c.position.y).toBeCloseTo(h, 2);
    c = body(col, 0, 0, -3);
    walk(c, 60);                                            // pressed against it, at rest
    expect(c.position.y).toBeLessThan(0.02);
    walk(c, 120, { jumpAt: 0 });
    expect(c.position.y).toBeCloseTo(h, 2);
  });
  it('fuzz: 300 seeded runs of jumps and turns around 1.2 m and 1.3 m cover never mount it, never hang in the air, never end inside it', () => {
    const col = world([FLOOR, { pos: [0, 0.6, -6], size: [3, 1.2, 3], role: 'cover' }, { pos: [6, 0.65, -6], size: [2, 1.3, 2], rotY: 30, role: 'cover' }, { shape: 'cylinder', pos: [-6, 0.65, -6], size: [1.6, 1.3, 1.6], role: 'cover' }]);
    let seed = 12345;
    const rnd = (): number => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let run = 0; run < 300; run++) {
      const target = [0, 6, -6][run % 3] as number;
      const a = rnd() * Math.PI * 2;
      const c = body(col, target + Math.cos(a) * 4, 0, -6 + Math.sin(a) * 4);
      let top = 0, air = 0, worstAir = 0;
      for (let i = 0; i < 400; i++) {
        // mostly toward the cover, with a wobble; strafes and jumps at random
        const yaw = Math.atan2(-(target - c.position.x), -(-6 - c.position.z)) + (rnd() - 0.5) * 1.2;
        c.viewYaw = yaw; c.tick(FIXED_DT, rnd() < 0.9 ? 1 : 0, rnd() < 0.3 ? (rnd() < 0.5 ? -1 : 1) : 0, rnd() < 0.5, rnd() < 0.08);
        top = Math.max(top, c.position.y);
        air = c.grounded ? 0 : air + 1; worstAir = Math.max(worstAir, air);
      }
      expect(top, `run ${run}`).toBeLessThanOrEqual(JUMP_APEX + 0.03);
      expect(worstAir, `run ${run}: ticks in the air in a row`).toBeLessThan(45);
      for (let i = 0; i < 40; i++) c.tick(FIXED_DT, 0, 0, false, false);
      expect(c.grounded && c.position.y < 0.02, `run ${run}: back on the floor`).toBe(true);
      expect(col.capsuleFree(c.position.x, c.position.y + 0.01, c.position.z, PLAYER_RADIUS, PLAYER_HEIGHT), `run ${run}: not inside`).toBe(true);
    }
  });
  it('walking off a stair under a floor slab never lifts her onto the slab (the hatch stair)', () => {
    // a 33.7 degree stair beside a 0.3 m slab whose top is 2 m up, open underneath
    const col = world([FLOOR,
      { shape: 'ramp', pos: [0, 2, -6], size: [2, 4, 6], rise: '-z', skirt: 0, role: 'stairs', surface: 'wood' },
      { pos: [3, 1.85, -6], size: [4, 0.3, 6], role: 'floor', surface: 'wood' }]);
    for (let z = -3.5; z > -8.5; z -= 0.25) {
      const c = body(col, 0, 0, -2);
      while (c.position.z > z && c.position.z > -8.9) c.tick(FIXED_DT, 1, 0, false, false);
      const y0 = c.position.y;
      let worst = 0;
      for (let i = 0; i < 90; i++) { const y = c.position.y; c.viewYaw = -Math.PI / 2; c.tick(FIXED_DT, 1, 0, false, false); worst = Math.max(worst, c.position.y - y); }   // turn right, toward the slab
      expect(worst).toBeLessThanOrEqual(STEP_UP + 0.021);
      if (y0 < 2 - STEP_UP - 0.03) expect(c.position.y).toBeLessThan(2 - 0.2);   // from more than a step below, she is never on the slab
    }
  });
  it('does not tunnel at a forced 60 m/s: a 5 cm wall, a floor, a 8 cm door leaf', () => {
    const col = world([FLOOR, { pos: [0, 1.5, -3], size: [10, 3, 0.05] }, { pos: [3, 1.5, 0], size: [0.08, 3, 10] }]);
    let c = body(col);
    c.velocity.z = -60;
    for (let i = 0; i < 30; i++) { c.tick(FIXED_DT, 0, 0, false, false); c.velocity.z = -60; }
    expect(c.position.z).toBeGreaterThan(-3 + PLAYER_RADIUS - 0.03);
    c = body(col);
    for (let i = 0; i < 30; i++) { c.velocity.x = 60; c.tick(FIXED_DT, 0, 0, false, false); }
    expect(c.position.x).toBeLessThan(3 - PLAYER_RADIUS + 0.03);
    c = new Controller(col); c.teleport(0, 30, 0);
    for (let i = 0; i < 40; i++) { c.velocity.y = -60; c.tick(FIXED_DT, 0, 0, false, false); }
    expect(c.position.y).toBeGreaterThan(-0.01);
    expect(col.capsuleFree(c.position.x, c.position.y, c.position.z, PLAYER_RADIUS, PLAYER_HEIGHT)).toBe(true);
  });
  it('slides along a wall met at an angle and keeps the speed along it', () => {
    const c = body(world([FLOOR, { pos: [0, 1.5, -3], size: [40, 3, 0.5] }]));
    walk(c, 120, { yaw: -Math.PI / 4 });                    // 45 degrees to the right of -Z
    expect(c.position.z).toBeGreaterThan(-2.75 + PLAYER_RADIUS - 0.02);
    expect(c.position.x).toBeGreaterThan(4);
  });
});
