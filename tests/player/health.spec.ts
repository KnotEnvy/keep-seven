// Health as pure logic (GDD 5, 15): segments and regeneration, difficulty, the last-20 absorb, the last-hit grace,
// canteens, god mode, kill volumes.
import { describe, expect, it } from 'vitest';
import { FIXED_DT } from '../../src/core/contracts.ts';
import type { DamageInfo, DamageKind, Difficulty, EventBus, EventName, GameEvents } from '../../src/core/contracts.ts';
import { Health, segmentOf } from '../../src/player/health.ts';

class Rig {
  log: { name: string; payload: Record<string, unknown> }[] = [];
  traumas: number[] = [];
  level: Difficulty = 'normal';
  readonly events: EventBus = {
    on: () => () => undefined, once: () => () => undefined,
    emit: <K extends EventName>(name: K, payload: GameEvents[K]) => { this.log.push({ name, payload: { ...(payload as Record<string, unknown>) } }); },
  };
  readonly dev = false;
  readonly life = new Health(this);
  difficulty(): Difficulty { return this.level; }
  trauma(a: number): void { this.traumas.push(a); }
  hit(amount: number, kind: DamageKind = 'lunge'): number {
    const d: DamageInfo = { amount, kind, source: 'bider', sourceId: 'bider#1', ammo: null, shotId: 0, ox: 1, oy: 2, oz: 3, dx: 0, dy: 0, dz: -1 };
    return this.life.applyDamage(d);
  }
  run(seconds: number): void { for (let i = 0; i < Math.round(seconds * 60); i++) this.life.tick(FIXED_DT); }
  names(): string[] { return this.log.map((e) => e.name); }
}

describe('segments and regeneration', () => {
  it('34 / 33 / 33: a full segment is the current one', () => {
    expect([1, 34, 34.01, 67, 67.01, 100].map(segmentOf)).toEqual([0, 0, 1, 1, 2, 2]);
  });
  it('the current segment, and only it, regenerates after 4 s without damage at 12 HP/s', () => {
    const r = new Rig();
    expect(r.hit(30)).toBe(30);                             // 70: third segment
    expect(r.hit(15)).toBe(15);                             // 55: second segment
    r.run(3.9);
    expect(r.life.hp).toBe(55);
    expect(r.life.regenerating).toBe(false);
    r.run(0.1 + 0.5);                                       // 4.0 s, then half a second of regeneration
    expect(r.life.regenerating).toBe(true);
    expect(r.life.hp).toBeCloseTo(55 + 6 + 12 * FIXED_DT, 6);
    r.run(2);
    expect(r.life.hp).toBe(67);                             // the top of the second segment, no further
    r.run(10);
    expect(r.life.hp).toBe(67);
    expect(r.names()).toEqual(['player/damaged', 'player/damaged', 'player/health_segment', 'player/health_segment', 'player/healed']);
    expect(r.log[2]?.payload).toEqual({ segment: 1, regenerating: true });
    expect(r.log[3]?.payload).toEqual({ segment: 1, regenerating: false });
    expect(r.log[4]?.payload.amount).toBeCloseTo(12, 6);
    expect(r.log[4]?.payload.health).toBe(67);
  });
  it('damage restarts the 4 s and stops a regeneration in progress', () => {
    const r = new Rig();
    r.hit(20); r.run(4.5);
    expect(r.life.regenerating).toBe(true);
    r.hit(10);
    expect(r.life.regenerating).toBe(false);
    const hp = r.life.hp;
    r.run(3.9);
    expect(r.life.hp).toBe(hp);
  });
});

describe('applyDamage', () => {
  it('difficulty scales what is taken, read live', () => {
    const r = new Rig();
    r.level = 'easy'; expect(r.hit(30)).toBeCloseTo(18, 9);
    r.level = 'hard'; expect(r.hit(30)).toBeCloseTo(42, 9);
    r.level = 'normal'; expect(r.hit(10)).toBe(10);
    expect(r.life.hp).toBeCloseTo(30, 9);
  });
  it('the last 20 HP absorb x0.75', () => {
    const r = new Rig();
    r.life.set(30);
    expect(r.hit(20)).toBeCloseTo(10 + 10 * 0.75, 9);       // 10 above the line, 10 into it at x0.75
    expect(r.life.hp).toBeCloseTo(12.5, 9);
    expect(r.hit(8)).toBeCloseTo(6, 9);
    expect(r.life.hp).toBeCloseTo(6.5, 9);
  });
  it('a fatal hit from above 25 HP leaves 1 HP and 0.75 s of immunity; from 25 or below it kills', () => {
    const r = new Rig();
    r.life.set(26);
    r.level = 'hard';
    expect(r.hit(38)).toBe(25);
    expect(r.life.hp).toBe(1);
    expect(r.life.alive).toBe(true);
    expect(r.log.at(-1)).toMatchObject({ name: 'player/damaged', payload: { graceUsed: true, health: 1, fromX: 1, fromY: 2, fromZ: 3, kind: 'lunge', source: 'bider' } });
    expect(r.hit(38)).toBe(0);                              // immune
    r.run(0.7);
    expect(r.hit(38)).toBe(0);
    r.run(0.05);                                            // 0.75 s
    expect(r.life.immunity).toBe(0);
    expect(r.hit(38)).toBe(1);
    expect(r.life.alive).toBe(false);
    expect(r.log.at(-1)).toEqual({ name: 'player/died', payload: { kind: 'lunge', source: 'bider' } });
    const b = new Rig();
    b.life.set(25); b.level = 'hard';
    b.hit(38);
    expect(b.life.alive).toBe(false);
  });
  it('trauma is +0.3 at 10 HP and +0.6 at 38, linear', () => {
    const r = new Rig();
    r.hit(10); r.hit(24); r.life.set(100); r.hit(38); r.life.set(100); r.hit(4);
    expect(r.traumas[0]).toBeCloseTo(0.3, 9);
    expect(r.traumas[1]).toBeCloseTo(0.45, 9);
    expect(r.traumas[2]).toBeCloseTo(0.6, 9);
    expect(r.traumas[3]).toBeCloseTo(0.3, 9);
  });
  it('god mode takes nothing; the dead take nothing', () => {
    const r = new Rig();
    r.life.god = true;
    expect(r.hit(38)).toBe(0);
    expect(r.life.hp).toBe(100);
    r.life.god = false;
    r.life.set(0);
    expect(r.life.alive).toBe(false);
    expect(r.hit(10)).toBe(0);
  });
  it('a kill volume kills from any health, through the grace and the immunity', () => {
    const r = new Rig();
    expect(r.hit(999, 'kill_volume')).toBe(100);
    expect(r.life.alive).toBe(false);
    expect(r.log.at(-1)?.payload).toEqual({ kind: 'kill_volume', source: 'bider' });
  });
});

describe('canteen, debug, restore', () => {
  it('a canteen fills the current segment, the next one if it is already full, and is refused at 100', () => {
    const r = new Rig();
    r.life.set(50);
    expect(r.life.canteen()).toBe(true);
    expect(r.life.hp).toBe(67);
    expect(r.log.at(-1)).toEqual({ name: 'player/healed', payload: { amount: 17, health: 67 } });
    expect(r.life.canteen()).toBe(true);
    expect(r.life.hp).toBe(100);
    expect(r.life.canteen()).toBe(false);
    r.life.set(20); r.life.canteen();
    expect(r.life.hp).toBe(34);
    r.life.canteen();
    expect(r.life.hp).toBe(67);
  });
  it('restore: alive, the grace window and the regeneration clock reset', () => {
    const r = new Rig();
    r.life.set(26); r.hit(38);
    expect(r.life.immunity).toBeGreaterThan(0);
    r.life.set(0);
    r.life.restore(60);
    expect([r.life.alive, r.life.hp, r.life.immunity, r.life.regenerating]).toEqual([true, 60, 0, false]);
    r.run(3.9);
    expect(r.life.hp).toBe(60);
    r.run(1);
    expect(r.life.hp).toBeGreaterThan(60);
  });
});
