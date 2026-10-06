import { describe, expect, it } from 'vitest';
import { FIXED_DT } from '../../src/core/contracts.ts';
import type { GameEvents } from '../../src/core/contracts.ts';
import { GameClockImpl } from '../../src/core/clock.ts';
import { EventBusImpl } from '../../src/core/events.ts';
import { Mulberry32 } from '../../src/core/rng.ts';
import { Pool } from '../../src/core/pool.ts';
import { Interp3, InterpAngle } from '../../src/core/interp.ts';
import { fnv1a, round4, roundDeep, wrapAngle, yawOf } from '../../src/core/math.ts';

function make(reduceMotion = false): { clock: GameClockImpl; scales: GameEvents['time/scale'][] } {
  const events = new EventBusImpl();
  const scales: GameEvents['time/scale'][] = [];
  events.on('time/scale', (e) => scales.push({ ...e }));
  return { clock: new GameClockImpl(events, () => reduceMotion), scales };
}

describe('GameClock', () => {
  it('ticks at the fixed step; sim time only advances while the sim runs', () => {
    const { clock } = make();
    for (let i = 0; i < 60; i++) expect(clock.advance(true)).toBeCloseTo(FIXED_DT, 12);
    expect(clock.tick).toBe(60);
    expect(clock.simTime).toBeCloseTo(1, 9);
    expect(clock.unscaledTime).toBeCloseTo(1, 9);
    for (let i = 0; i < 30; i++) clock.advance(false);
    expect(clock.tick).toBe(90);                      // ticks are never scaled and never reset
    expect(clock.simTime).toBeCloseTo(1, 9);
    expect(clock.unscaledTime).toBeCloseTo(1, 9);
  });

  it('tick also counts while the game is paused or loading; unscaledTime and simTime stop with the game', () => {
    // A cooldown or a telegraph stamped with clock.tick runs out while a readable is open (readables use 'paused').
    // Count your own ticks in fixedUpdate, or use unscaledTime, for anything that must stop with the game.
    const { clock } = make();
    for (let i = 0; i < 60; i++) clock.advance(true);
    const tick = clock.tick, unscaled = clock.unscaledTime, sim = clock.simTime;
    for (let i = 0; i < 30; i++) clock.advance(false);             // half a second of pause
    expect(clock.tick).toBe(tick + 30);
    expect(clock.unscaledTime).toBe(unscaled);
    expect(clock.simTime).toBe(sim);
    expect(Math.abs(clock.unscaledTime - clock.tick * (1 / 60))).toBeGreaterThan(0.49);   // no longer tick * FIXED_DT
  });
  it('slow motion scales dt for its duration in unscaled seconds and emits time/scale', () => {
    const { clock, scales } = make();
    clock.slowMotion(0.3, 0.3, 'last_enemy');
    expect(scales).toEqual([{ scale: 0.3, realSeconds: 0.3, reason: 'last_enemy' }]);
    let slow = 0;
    for (let i = 0; i < 60; i++) { const dt = clock.advance(true); if (dt < FIXED_DT * 0.99) { slow++; expect(dt).toBeCloseTo(FIXED_DT * 0.3, 9); } }
    expect(slow).toBe(18);                            // 0.3 s of real time = 18 ticks
    expect(clock.timeScale).toBe(1);
    expect(clock.simTime).toBeCloseTo((42 + 18 * 0.3) * FIXED_DT, 6);
    expect(clock.unscaledTime).toBeCloseTo(1, 9);
  });

  it('the lowest active request wins', () => {
    const { clock } = make();
    clock.slowMotion(0.5, 1.0, 'hush');
    clock.slowMotion(0.2, 0.1, 'kill_sequence');
    expect(clock.advance(true)).toBeCloseTo(FIXED_DT * 0.2, 9);
    for (let i = 0; i < 6; i++) clock.advance(true);
    expect(clock.advance(true)).toBeCloseTo(FIXED_DT * 0.5, 9);   // the shorter request ended, the longer still holds
    for (let i = 0; i < 60; i++) clock.advance(true);
    expect(clock.advance(true)).toBeCloseTo(FIXED_DT, 9);
  });

  it('does nothing with options.reduceMotion, and does not run down while the sim is stopped', () => {
    const a = make(true);
    a.clock.slowMotion(0.2, 1, 'hush');
    expect(a.scales).toHaveLength(0);
    expect(a.clock.advance(true)).toBeCloseTo(FIXED_DT, 12);
    const b = make();
    b.clock.slowMotion(0.5, 0.1, 'boss_break');
    for (let i = 0; i < 100; i++) b.clock.advance(false);
    expect(b.clock.advance(true)).toBeCloseTo(FIXED_DT * 0.5, 9);
  });

  it('counts frames and keeps alpha', () => {
    const { clock } = make();
    clock.beginFrame(0.25); clock.beginFrame(0.75);
    expect(clock.frame).toBe(2);
    expect(clock.alpha).toBe(0.75);
  });
});

describe('Rng (mulberry32)', () => {
  it('is deterministic for a seed and in [0, 1)', () => {
    const a = new Mulberry32(7), b = new Mulberry32(7), c = new Mulberry32(8);
    const xs = Array.from({ length: 200 }, () => a.next());
    expect(xs).toEqual(Array.from({ length: 200 }, () => b.next()));
    expect(xs).not.toEqual(Array.from({ length: 200 }, () => c.next()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(a.state).toBe(b.state);
  });
  it('fork(label): same label, same stream for a seed, whatever was drawn before', () => {
    const a = new Mulberry32(1), b = new Mulberry32(1);
    for (let i = 0; i < 17; i++) a.next();
    const fa = a.fork('enemies'), fb = b.fork('enemies'), other = b.fork('world');
    const xs = [fa.next(), fa.next(), fa.next()];
    expect(xs).toEqual([fb.next(), fb.next(), fb.next()]);
    expect(xs).not.toEqual([other.next(), other.next(), other.next()]);
  });
  it('range, int, chance and reseed', () => {
    const r = new Mulberry32(3);
    const child = r.fork('x');
    for (let i = 0; i < 100; i++) {
      const v = r.range(2, 5); expect(v).toBeGreaterThanOrEqual(2); expect(v).toBeLessThan(5);
      const n = r.int(6); expect(Number.isInteger(n) && n >= 0 && n < 6).toBe(true);
    }
    expect(r.chance(0)).toBe(false);
    expect(r.chance(1)).toBe(true);
    const first = new Mulberry32(9).fork('x').next();
    r.reseed(9);
    expect(child.next()).toBe(first);                 // forks are reseeded with their parent
  });
});

describe('Pool, Interp, math', () => {
  it('pool: fixed capacity, swap-remove, backwards iteration', () => {
    const pool = new Pool(3, (i) => ({ id: i, alive: false }));
    const a = pool.spawn(), b = pool.spawn(), c = pool.spawn();
    expect(pool.spawn()).toBeNull();
    expect([a?.id, b?.id, c?.id]).toEqual([0, 1, 2]);
    pool.freeAt(0);
    expect(pool.count).toBe(2);
    expect(pool.items.slice(0, 2).map((x) => x.id).sort()).toEqual([1, 2]);
    expect(pool.spawn()?.id).toBe(0);                 // the freed object is reused, nothing is allocated
    expect(pool.free(b as { id: number; alive: boolean })).toBe(true);
    expect(pool.count).toBe(2);
  });
  it('interp: blends previous to current and snaps', () => {
    const p = new Interp3(), out = { x: 0, y: 0, z: 0 };
    p.snap(1, 2, 3); p.set(3, 2, 1);
    expect(p.get(0.5, out)).toEqual({ x: 2, y: 2, z: 2 });
    p.snap(9, 9, 9);
    expect(p.get(0.3, out)).toEqual({ x: 9, y: 9, z: 9 });
    const a = new InterpAngle();
    a.snap(3.1); a.set(-3.1);
    expect(Math.abs(a.get(0.5))).toBeGreaterThan(3.1);            // the short way round, through pi
  });
  it('math helpers', () => {
    expect(round4(1.23456789)).toBe(1.2346);
    expect(Object.is(round4(-0.00001), 0)).toBe(true);
    expect(roundDeep({ a: [1.00004, { b: 2.55555 }], c: 'x' })).toEqual({ a: [1, { b: 2.5556 }], c: 'x' });
    expect(fnv1a('')).toBe('811c9dc5');
    expect(fnv1a('a')).toBe('e40c292c');
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(Math.PI, 9);
    expect(yawOf(0, -1)).toBeCloseTo(0, 9);                       // yaw 0 faces -Z
    expect(yawOf(-1, 0)).toBeCloseTo(Math.PI / 2, 9);             // positive yaw turns left (toward -X)
  });
});

describe('EventBus', () => {
  it('is synchronous, in subscription order; a throwing handler is reported once and does not stop the others', () => {
    const bus = new EventBusImpl();
    const seen: string[] = [];
    const errors: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]): void => { errors.push(String(args[0])); };
    try {
      bus.on('checkpoint/reached', () => seen.push('a'));
      bus.on('checkpoint/reached', () => { throw new Error('boom'); });
      bus.on('checkpoint/reached', () => seen.push('c'));
      bus.emit('checkpoint/reached', { id: 'cp_rim' });
      bus.emit('checkpoint/reached', { id: 'cp_rim' });
    } finally { console.error = original; }
    expect(seen).toEqual(['a', 'c', 'a', 'c']);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('boom');
  });
  it('once, unsubscribe (also during an emit) and the debug ring', () => {
    const bus = new EventBusImpl();
    let tick = 5;
    bus.enableRecording(() => tick);
    let n = 0;
    bus.once('world/hatch_powered', () => { n++; });
    const off = bus.on('world/hatch_powered', () => { n += 10; off(); });
    bus.emit('world/hatch_powered', {});
    bus.emit('world/hatch_powered', {});
    expect(n).toBe(11);
    const payload = { id: 'cp_rim' as const };
    tick = 9;
    bus.emit('checkpoint/reached', payload);
    const log = bus.events();
    expect(log.map((e) => [e.seq, e.tick, e.name])).toEqual([[1, 5, 'world/hatch_powered'], [2, 5, 'world/hatch_powered'], [3, 9, 'checkpoint/reached']]);
    expect(log[2]?.payload).toEqual({ id: 'cp_rim' });
    expect(log[2]?.payload).not.toBe(payload);                    // clones
    expect(bus.events(2)).toHaveLength(1);
    expect(bus.events(0, 'checkpoint/reached')).toHaveLength(1);
    for (let i = 0; i < 5000; i++) bus.emit('world/hatch_powered', {});
    const all = bus.events();
    expect(all).toHaveLength(4096);                               // the ring keeps the last 4096
    expect(all[all.length - 1]?.seq).toBe(5003);
    expect(all[0]?.seq).toBe(5003 - 4095);
  });
});
