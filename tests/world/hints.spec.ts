// The hint clock (GDD 13): only time inside without progress counts; Normal 60/120/210/300, Fast 30/60/120/180; Off
// suppresses T1 to T3 and T4 always applies; the kept ladder 15/30/45/75.
import { describe, expect, it } from 'vitest';
import type { HintMode } from '../../src/core/contracts.ts';
import { HINT_FAST, HINT_KEPT, HINT_NORMAL, HintClock } from '../../src/world/puzzles/hints.ts';

/** seconds at which each tier is reached, ticking at 60 Hz */
function tiers(mode: HintMode, clock = new HintClock(), seconds = 400, counting = (_t: number) => true): Record<number, number> {
  const at: Record<number, number> = {};
  for (let i = 1; i <= seconds * 60; i++) { const t = i / 60; const tier = clock.tick(1 / 60, counting(t), mode); if (tier) at[tier] = Math.round(t * 100) / 100; }
  return at;
}

describe('HintClock', () => {
  it('Normal reaches T1..T4 at 60 / 120 / 210 / 300 s; Fast at 30 / 60 / 120 / 180', () => {
    expect(HINT_NORMAL).toEqual([60, 120, 210, 300]);
    expect(HINT_FAST).toEqual([30, 60, 120, 180]);
    expect(tiers('normal')).toEqual({ 1: 60, 2: 120, 3: 210, 4: 300 });
    expect(tiers('fast')).toEqual({ 1: 30, 2: 60, 3: 120, 4: 180 });
  });
  it('Off suppresses T1 to T3; T4 still applies', () => {
    expect(tiers('off')).toEqual({ 4: 300 });
    const c = new HintClock();
    tiers('off', c);
    expect(c.relaxed).toBe(true);
  });
  it('counts only while counting (inside, out of combat), and resets on each correct step; a relaxation stays', () => {
    // counting only on every other 10 s: twice as long to reach each tier
    expect(tiers('normal', new HintClock(), 700, (t) => Math.floor(t / 10) % 2 === 0)[1]).toBeCloseTo(119.99 + 0.01, 1);
    const c = new HintClock();
    for (let i = 0; i < 59 * 60; i++) c.tick(1 / 60, true, 'normal');
    c.progress();
    expect(c.seconds).toBe(0);
    expect(c.tier).toBe(0);
    for (let i = 0; i < 301 * 60; i++) c.tick(1 / 60, true, 'normal');
    expect(c.relaxed).toBe(true);
    c.progress();
    expect(c.relaxed).toBe(true);
    expect(c.pastRelax('normal')).toBe(0);
  });
  it('pastRelax counts the seconds after T4 (the "at 360 s" follow-ups)', () => {
    const c = new HintClock();
    for (let i = 0; i < 360 * 60; i++) c.tick(1 / 60, true, 'normal');
    expect(c.pastRelax('normal')).toBeCloseTo(60, 3);
  });
  it('the kept ladder ignores the option: 15 / 30 / 45 / 75 s', () => {
    expect(HINT_KEPT).toEqual([15, 30, 45, 75]);
    expect(tiers('normal', new HintClock(HINT_KEPT), 100)).toEqual({ 1: 15, 2: 30, 3: 45, 4: 75 });
    expect(tiers('fast', new HintClock(HINT_KEPT), 100)).toEqual({ 1: 15, 2: 30, 3: 45, 4: 75 });
  });
});
