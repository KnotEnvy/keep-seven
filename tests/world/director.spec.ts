// The wave scheduler and the drops (GDD 10, 6.5), on the real layout's encounters.
import { describe, expect, it } from 'vitest';
import layoutJson from '../../design/layout.json';
import type { EncounterData, EncounterId, LayoutData } from '../../src/core/contracts.ts';
import { AMMO_FLOOR, DROP_CHANCE, FILE_BURST, FILE_NEAR, WaveScheduler, decideDrop, planWaves } from '../../src/world/director.ts';
import { lampCount } from '../../src/world/internals.ts';

const layout = layoutJson as unknown as LayoutData;
const enc = (id: EncounterId): EncounterData => layout.encounters.find((e) => e.id === id) as EncounterData;
const enemyOf = (spawn: string): string => String(layout.markers.find((m) => m.id === spawn)?.params.enemy ?? '');
const DT = 1 / 60;

/**
 * Runs a scheduler for `seconds`. `kills` take members down at times: [seconds, wave index]; `hits` mark a wave hit.
 * Returns when each wave was released (seconds, -1 never), whether each was cancelled, and when the encounter was clear.
 */
function simulate(id: EncounterId, seconds: number, kills: [number, number][] = [], hits: [number, number][] = [], gates: [number, number][] = []): { at: Record<string, number>; cancelled: Record<string, boolean>; clearAt: number } {
  const s = new WaveScheduler(planWaves(enc(id), enemyOf));
  const at: Record<string, number> = {}, cancelled: Record<string, boolean> = {};
  let clearAt = -1;
  const k = kills.slice().sort((a, b) => a[0] - b[0]), h = hits.slice();
  for (let i = 0; i <= Math.round(seconds / DT); i++) {
    const t = i * DT;
    while (k.length && (k[0] as [number, number])[0] <= t + 1e-9) s.memberDown((k.shift() as [number, number])[1]);
    for (const [ht, w] of h) if (Math.abs(ht - t) < DT / 2) s.memberHit(w);
    // `gates`: [seconds, wave]: the director opens that wave's gate from then on (she has come near its door)
    for (const [gt, w] of gates) s.gateOpen[w] = t + 1e-9 >= gt;
    let w = s.update(i === 0 ? 0 : DT);
    while (w >= 0) { at[(s.plans[w] as { id: string }).id] = Math.round(s.clock * 100) / 100; w = s.update(0); }
    if (clearAt < 0 && s.clear) clearAt = Math.round(s.clock * 100) / 100;
  }
  s.plans.forEach((p, i) => { cancelled[p.id] = s.cancelled[i] as boolean; if (at[p.id] === undefined) at[p.id] = -1; });
  return { at, cancelled, clearAt };
}

describe('planWaves reads the layout (its machine-readable fields win over the `when` text)', () => {
  it('enc_street: A after the scoop (3 s); B on A down, 3 s after A is hit, or 8 s; C on B down to two or 2 s; D 2 s after C down (polish round 4 numbers)', () => {
    const p = planWaves(enc('enc_street'), enemyOf);
    expect(p.map((x) => [x.id, x.mode, x.left, x.delay, x.timeout, x.hitTimeout])).toEqual([
      ['A', 'start', 0, 3, -1, -1], ['B', 'afterDown', 0, 0, 8, 3], ['C', 'afterDown', 2, 0, 2, -1], ['D', 'afterDown', 0, 2, -1, -1],
    ]);
  });
  it('enc_matador runs on the clock and cancels a wave whose time comes with the Tamper dead', () => {
    const p = planWaves(enc('enc_matador'), enemyOf);
    expect(p.map((x) => [x.id, x.mode, x.clockAt, x.cancelIfDown])).toEqual([['A', 'start', -1, -1], ['B', 'clock', 15, 0], ['C', 'clock', 35, 0]]);
  });
  it('enc_file wave B is gated (polish round 4): the file down to one, then her coming near the far door, or 25 s', () => {
    const p = planWaves(enc('enc_file'), enemyOf);
    expect(p[1]).toMatchObject({ id: 'B', mode: 'afterDown', ref: 0, left: 1, delay: 0, gated: true, gateTimeout: 25, timeout: -1, hitTimeout: -1 });
    expect(FILE_NEAR).toBe(12);
    expect(FILE_BURST).toBe(2);
    // no other wave of the stage is gated
    for (const e of layout.encounters) for (const w of planWaves(e, enemyOf)) if (!(e.id === 'enc_file' && w.id === 'B')) expect(w.gated).toBe(false);
  });
  it('the boss encounter plans no waves of its own (the boss spawns its adds)', () => {
    expect(planWaves({ ...enc('enc_windlass'), waves: enc('enc_windlass').waves.filter((w) => w.repeating) }, enemyOf)).toEqual([]);
  });
});

describe('WaveScheduler', () => {
  it('enc_street: A at 3 s; A shot down at 10 s -> B (four) at 10 s; C (two) 2 s after B; C down at 26 s -> D at 28 s', () => {
    const r = simulate('enc_street', 60, [[10, 0], [12, 1], [13, 1], [14, 1], [20, 1], [22, 2], [26, 2], [40, 3]]);
    expect(r.at).toEqual({ A: 3, B: 10, C: 12, D: 28 });
    expect(r.clearAt).toBe(40);
  });
  it('enc_street: B 3 s after A is first hit, or 8 s after A rose when it is neither hit nor down', () => {
    // the hit lands inside the tick before the scheduler's own update: one tick early at most
    expect(simulate('enc_street', 30, [], [[5, 0]]).at.B).toBeCloseTo(8, 1);
    expect(simulate('enc_street', 30).at.B).toBe(11);
    expect(simulate('enc_street', 60).at.C).toBe(13);              // B is left standing: C 2 s after B (polish round 4)
  });
  it('enc_yard: B on T1 dead or at 14 s; B2 2 s after B; B3 10 s after B once at most three are up (polish round 3 numbers)', () => {
    // T1 down at 10 s: B at once, B2 at 12 s; four up, so B3 (due at 20 s) waits until one of them is down
    const fast = simulate('enc_yard', 80, [[10, 0], [20, 1]]);
    expect(fast.at).toMatchObject({ A: 4, B: 10, B2: 12, B3: 20 });
    expect(simulate('enc_yard', 80, [[10, 0], [30, 1]]).at.B3).toBe(30);
    const slow = simulate('enc_yard', 80);
    expect(slow.at.B).toBe(18);
    expect(slow.at.B2).toBe(20);
    // T1, T2, T3, two from the grate up: five alive, B3 waits until two have gone down
    expect(slow.at.B3).toBe(-1);
    expect(simulate('enc_yard', 80, [[65, 2], [66, 2]]).at.B3).toBe(66);
  });
  it('enc_file: wave B when the file is down to one AND she has come near the far door; 25 s after that if she never does', () => {
    const six: [number, number][] = [8, 9, 10, 11, 12, 13].map((t) => [t, 0]);
    // the gate opens at 20 s (she has walked down the gallery): B on that tick
    expect(simulate('enc_file', 60, six, [], [[20, 1]]).at.B).toBe(20);
    // she is already near when the fifth falls (12 s): at once
    expect(simulate('enc_file', 60, six, [], [[5, 1]]).at.B).toBe(12);
    // she never comes: 25 s after the file was down to one (the fifth, at 12 s): never a dead end
    expect(simulate('enc_file', 60, six).at.B).toBe(37);
    // near the door with the file still up: nobody is let out behind it; a hit on the file starts no clock any more
    expect(simulate('enc_file', 60, [], [[6, 0]], [[5, 1]]).at.B).toBe(-1);
    // the encounter is clear only when the three are down too
    expect(simulate('enc_file', 60, [...six, [30, 1], [31, 1], [32, 1]], [], [[20, 1]]).clearAt).toBe(32);
    expect(simulate('enc_file', 60, six, [], [[20, 1]]).clearAt).toBe(-1);
  });
  it('enc_matador: the Tamper dead before 15 s -> no Bider ever and clear on its death; dead at 20 s -> wave C never spawns', () => {
    const early = simulate('enc_matador', 90, [[10, 0]]);
    expect(early.at).toEqual({ A: 0, B: -1, C: -1 });
    expect(early.cancelled).toEqual({ A: false, B: true, C: true });
    expect(early.clearAt).toBe(10);
    const mid = simulate('enc_matador', 120, [[20, 0], [30, 1], [31, 1]]);
    expect(mid.at).toEqual({ A: 0, B: 15, C: -1 });
    expect(mid.cancelled.C).toBe(true);
    expect(mid.clearAt).toBe(31);
    const late = simulate('enc_matador', 120);
    expect(late.at).toEqual({ A: 0, B: 15, C: 35 });
  });
  it('a dormant member shot before its wave is released is not waited for', () => {
    // the kneeler shot dormant: A is released with nobody to wait for, and B follows at once
    const r = simulate('enc_street', 10, [[0, 0]]);
    expect(r.at.A).toBe(3);
    expect(r.at.B).toBe(3);
  });
});

describe('drops and the ammo floor (GDD 6.5)', () => {
  const base = { bider: true, counted: true, bossAdd: false, ammo: 30, health: 100, roll: 0.5, chance: DROP_CHANCE.normal };
  it('25 % on Normal, 40 % Easy, 15 % Hard', () => {
    expect(DROP_CHANCE).toEqual({ easy: 0.4, normal: 0.25, hard: 0.15 });
    expect(decideDrop({ ...base, roll: 0.24 })).toBe('pk_rounds_6');
    expect(decideDrop({ ...base, roll: 0.25 })).toBe('');
  });
  it('the ammo floor: at cylinder + reserve 6 or less the next Bider always drops a packet', () => {
    expect(AMMO_FLOOR).toBe(6);
    expect(decideDrop({ ...base, ammo: 6, roll: 0.99 })).toBe('pk_rounds_6');
    expect(decideDrop({ ...base, ammo: 7, roll: 0.99 })).toBe('');
  });
  it('boss adds always drop: a canteen under 34 HP, else a packet; nothing for an uncounted body or a Transit', () => {
    expect(decideDrop({ ...base, bossAdd: true, health: 33, roll: 0.99 })).toBe('pk_canteen');
    expect(decideDrop({ ...base, bossAdd: true, health: 34, roll: 0.99 })).toBe('pk_rounds_6');
    expect(decideDrop({ ...base, counted: false, ammo: 0 })).toBe('');
    expect(decideDrop({ ...base, bider: false, ammo: 0 })).toBe('');
  });
  it('polish round 3: a Transit of a fight satisfies the ammo floor, and only the floor', () => {
    expect(decideDrop({ ...base, bider: false, floorOnly: true, ammo: 6, roll: 0 })).toBe('pk_rounds_6');
    expect(decideDrop({ ...base, bider: false, floorOnly: true, ammo: 7, roll: 0 })).toBe('');
    expect(decideDrop({ ...base, bider: false, floorOnly: true, bossAdd: true, ammo: 30, health: 10, roll: 0 })).toBe('');
  });
  it('polish round 3: the lamps are never nineteen (ten freed light twenty)', () => {
    expect(lampCount(9)).toBe(18);
    expect(lampCount(10)).toBe(20);
    expect(lampCount(11)).toBe(20);
    for (let freed = 0; freed < 60; freed++) expect(lampCount(freed)).not.toBe(19);
  });
  it('lamps = 9 + freed, clamped to 48', () => {
    expect(lampCount(0)).toBe(9);
    expect(lampCount(20)).toBe(29);
    expect(lampCount(39)).toBe(48);
    expect(lampCount(60)).toBe(48);
  });
});

describe('a kill that cancels the waves still on the clock is seen on its own call', () => {
  it('enc_matador: the Tamper down at 10 s leaves no wave to come and nothing alive before the next update', () => {
    const s = new WaveScheduler(planWaves(enc('enc_matador'), enemyOf));
    let w = s.update(0);
    while (w >= 0) w = s.update(0);
    for (let i = 0; i < 10 * 60; i++) s.update(DT);
    expect(s.pending).toBe(2);
    s.memberDown(0);
    // no update in between: the director's afterDown decides the last-enemy beat and the clear from this
    expect(s.pending).toBe(0);
    expect(s.cancelled).toEqual([false, true, true]);
    expect(s.clear).toBe(true);
  });
  it('a member that goes down before its wave is released cancels nothing', () => {
    const s = new WaveScheduler(planWaves(enc('enc_matador'), enemyOf));
    s.memberDown(1);
    expect(s.cancelled).toEqual([false, false, false]);
  });
});
