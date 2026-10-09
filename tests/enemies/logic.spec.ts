// Pure logic of src/enemies (work order section 6): tokens, the alive cap, pattern selection, pip arithmetic, index
// direction, the add-grate choice, and the GDD's numbers as defs.ts holds them. No DOM, no browser.
import { describe, expect, it } from 'vitest';
import { BOSS, BOSS_BY, CAPS, DIFFICULTY, ENEMIES, MAX_HIT, TAMPER, TRANSIT, BIDER, STAKES } from '../../src/enemies/defs.ts';
import { Tokens, mayCome } from '../../src/enemies/tokens.ts';
import { Arm, bayOfBearing, bearingDeg, bearingOfBay, canisterBearing, clampToArc, indexSeconds, indexSteps, offArc, oppositeBay } from '../../src/enemies/boss/arm.ts';
import { chooseGrate, p2Wave } from '../../src/enemies/boss/adds.ts';
import { patternOf, patternSeconds, slotSeconds } from '../../src/enemies/boss/attacks.ts';
import { countHits, pipsFor } from '../../src/enemies/boss/index.ts';
import { PARLEY_LINES, parleyPlan } from '../../src/enemies/boss/parley.ts';
import layout from '../../design/layout.json';
import story from '../../design/story.json';

describe('defs: the GDD numbers', () => {
  it('difficulty table (GDD 15)', () => {
    expect(DIFFICULTY.easy).toEqual({ damageTaken: 0.6, attackTokens: 1, telegraphScale: 1.2, biderDropChance: 0.4, crownKnotRadius: 0.26 });
    expect(DIFFICULTY.normal).toEqual({ damageTaken: 1, attackTokens: 2, telegraphScale: 1, biderDropChance: 0.25, crownKnotRadius: 0.22 });
    expect(DIFFICULTY.hard).toEqual({ damageTaken: 1.4, attackTokens: 3, telegraphScale: 0.8, biderDropChance: 0.15, crownKnotRadius: 0.2 });   // pass i4: Hard's tells are 20 % shorter (it was 10)
  });
  it('archetypes (GDD 7.1 to 7.3)', () => {
    expect([ENEMIES.bider.hp, ENEMIES.bider.moveSpeed, ENEMIES.bider.threat, ENEMIES.bider.attacks[0]?.damage]).toEqual([100, 5.8, 1, 18]);
    expect([ENEMIES.transit.hp, ENEMIES.transit.moveSpeed, ENEMIES.transit.threat, ENEMIES.transit.maxAlive, ENEMIES.transit.attacks[0]?.damage]).toEqual([200, 3.5, 2, 2, 22]);
    expect([ENEMIES.tamper.hp, ENEMIES.tamper.moveSpeed, ENEMIES.tamper.threat, ENEMIES.tamper.maxAlive]).toEqual([900, 2.5, 4, 1]);   // polish round 4 (integration, R1): 1200 -> 900 (round 3: 600 -> 1200)
    expect(ENEMIES.tamper.attacks.map((a) => [a.id, a.damage, a.telegraph])).toEqual([['slam', 38, 1.0], ['charge', 35, 0.8]]);
    expect(ENEMIES.bider.volumes.find((v) => v.part === 'crown')).toMatchObject({ radius: 0.22, priority: 10 });
    expect(ENEMIES.transit.volumes.find((v) => v.part === 'lens')).toMatchObject({ radius: 0.17, damageMultiplier: 2, priority: 10 });
    for (const part of ['vent_chest', 'vent_back'] as const) {
      expect(ENEMIES.tamper.volumes.find((v) => v.part === part)).toMatchObject({ radius: 0.28, damageMultiplier: 2, gateIgnoredBy: ['line_round'] });
    }
    expect(ENEMIES.tamper.volumes.find((v) => v.part === 'plate')?.damageMultiplier).toBe(0.25);
    expect([TAMPER.chargeSpeed, TAMPER.chargeDistance, TAMPER.slamRadius, TAMPER.lineStagger, TAMPER.stagger, TAMPER.chargeStun]).toEqual([9, 22, 3.5, 1.8, 1.5, 2.0]);   // polish round 4: line stagger 1.8 (was 3.0)
    expect([TRANSIT.aim, TRANSIT.threadFreeze, TRANSIT.headStill, TRANSIT.stakeSpeed, TRANSIT.cooldown, TRANSIT.shotsPerPoint]).toEqual([0.9, 0.25, 0.4, 18, 1.2, 2]);
    expect([BIDER.windup, BIDER.lunge, BIDER.lungeDistance, BIDER.lungeReach, BIDER.recover, BIDER.windupRange, BIDER.circleRange]).toEqual([0.5, 0.35, 2.2, 1.8, 0.6, 2.4, 3.0]);
    expect([STAKES.inFlight, STAKES.stuck, STAKES.hitRadius, STAKES.coolSeconds]).toEqual([8, 18, 0.3, 6]);
  });
  it('a line round is a third of a Tamper (three kill); four vent shots leave it up, five fell it; a line round and three vent shots fell it; 36 plate shots (polish round 4)', () => {
    const hp = ENEMIES.tamper.hp, line = CAPS.lineRoundDamage, vent = TAMPER.ventDamage, plate = TAMPER.plateDamage;
    expect(hp - 2 * line).toBeGreaterThan(0);
    expect(hp - 3 * line).toBeLessThanOrEqual(0);
    expect(hp - line - 2 * vent).toBeGreaterThan(0);
    expect(hp - line - 3 * vent).toBeLessThanOrEqual(0);
    expect(hp - 4 * vent).toBeGreaterThan(0);
    expect(hp - 5 * vent).toBeLessThanOrEqual(0);
    expect(Math.ceil(hp / plate)).toBe(36);
  });
  it('by difficulty (polish round 4): the chest vent opens for the whole wind-up on Easy only; a Transit rests 0.3 s longer on Easy and Normal; Hard shortens the Windlass rest and speeds its stakes', () => {
    expect(TAMPER.slamVentLateBy).toEqual({ easy: TAMPER.slamWindup, normal: TAMPER.slamVentLate, hard: 0.6 });
    expect(TRANSIT.cooldownBy).toEqual({ easy: 1.5, normal: 1.5, hard: TRANSIT.cooldown });
    // release pass p0 (the cross-cutting fixer): on Hard the glow before a discharge is 15 % shorter and the Tamper stands 1.275 s over a slam
    expect(BOSS_BY).toEqual({ easy: { p1RestScale: 1, stakeSpeedScale: 1, glowScale: 1 }, normal: { p1RestScale: 1, stakeSpeedScale: 1, glowScale: 1 }, hard: { p1RestScale: 0.5, stakeSpeedScale: 1.15, glowScale: 0.85 } });
    expect(TAMPER.slamRecoverBy).toEqual({ easy: TAMPER.slamRecover, normal: TAMPER.slamRecover, hard: 1.275 });
  });
  it('no hit over 38 (GDD 8.3)', () => {
    const all = [...Object.values(ENEMIES).flatMap((e) => e.attacks.map((a) => a.damage)), BOSS.stakeDamage, BOSS.canisterDamage, BOSS.lanceDamage, BOSS.fanDamage];
    expect(Math.max(...all)).toBe(MAX_HIT);
    expect(BOSS.fanDamage * BOSS.fanMaxHits).toBe(36);
  });
  it('every story key the machine says exists in story.json', () => {
    const lines = (story as unknown as { lines: Record<string, unknown> }).lines;
    const keys = [...PARLEY_LINES.map((l) => l[1]), 'nar_parley_kept', 'stn_parley_refused', 'stn_boss_indexing', 'stn_boss_hauling', 'stn_boss_p1_break', 'stn_boss_guard_set',
      'stn_boss_guard_released', 'stn_boss_p2_break', 'stn_boss_refilled', 'stn_boss_charge_required', 'nar_one_left', 'stn_boss_head_dry_refilling', 'stn_dry', 'nar_hauling'];
    for (const k of keys) expect(lines[k], k).toBeDefined();
  });
});

describe('tokens (GDD 7)', () => {
  it('two concurrent on Normal, one on Easy, three on Hard; sub-caps 2 melee, 1 ranged, 1 heavy', () => {
    for (const [cap, want] of [[1, 1], [2, 2], [3, 3]] as const) {
      const t = new Tokens(8);
      t.cap = cap;
      let got = 0, now = 0;
      for (let i = 0; i < 8; i++) { if (t.request('melee', i, now)) got++; now += 0.31; }
      expect(got).toBe(Math.min(want, 2));                 // melee alone never exceeds its sub-cap of two
      // the rest of the pool goes to another kind
      if (t.request('ranged', 7, now)) got++;
      expect(got).toBe(want);
      expect(t.active).toBe(want);
    }
    const t = new Tokens(8);
    t.cap = 3;
    expect(t.request('ranged', 0, 0)).toBe(true);
    expect(t.request('ranged', 1, 1)).toBe(false);
    expect(t.request('heavy', 2, 1)).toBe(true);
    expect(t.request('heavy', 3, 2)).toBe(false);
    expect(t.request('melee', 4, 2)).toBe(true);
    expect(t.request('melee', 5, 3)).toBe(false);            // the pool of three is full
  });
  it('no two attacks start within 0.3 s; a holder cools down 0.6 s after its attack', () => {
    const t = new Tokens(4);
    t.cap = 2;
    expect(t.request('melee', 0, 10)).toBe(true);
    expect(t.request('melee', 1, 10.29)).toBe(false);
    expect(t.request('melee', 1, 10.3)).toBe(true);
    t.release(0, 11);
    expect(t.holds(0)).toBe(false);
    expect(t.request('melee', 0, 11.59)).toBe(false);
    expect(t.available('melee', 0, 11.6)).toBe(true);
    // the half-frequency rule: an extra delay for one slot
    t.delay(0, 13);
    expect(t.request('melee', 0, 12.9)).toBe(false);
    expect(t.request('melee', 0, 13)).toBe(true);
    expect(t.holders('melee')).toEqual([0, 1]);
  });
  it('while the boss is mid-attack its adds share one token', () => {
    const t = new Tokens(4);
    t.cap = 2; t.limit = 1;
    expect(t.request('melee', 0, 0)).toBe(true);
    expect(t.request('melee', 1, 1)).toBe(false);
    t.limit = 0;
    expect(t.request('melee', 1, 1)).toBe(true);
    t.reset();
    expect(t.active).toBe(0);
  });
  it('the alive cap: 6 outside the boss room, boss + 3 inside; transit 2, tamper 1', () => {
    expect(mayCome(5, 5, 6, false, 0)).toBe(true);
    expect(mayCome(6, 4, 6, false, 0)).toBe(false);
    expect(mayCome(3, 2, 2, false, 0)).toBe(false);           // a third Transit
    expect(mayCome(1, 1, 1, false, 0)).toBe(false);           // a second Tamper
    expect(mayCome(2, 2, 6, true, 2)).toBe(true);
    expect(mayCome(3, 3, 6, true, 3)).toBe(false);
  });
});

describe('the Windlass: patterns, pips, the arm, the adds (GDD 8)', () => {
  it('phase 1 is stake stake canister stake stake canister in 11.4 s (a 0.8 s rest after each notch); phase 2 stake canister lance stake canister in 7.7 s', () => {
    expect(patternOf('p1')).toEqual(['stake', 'stake', 'canister', 'stake', 'stake', 'canister']);
    expect(patternOf('p2')).toEqual(['stake', 'canister', 'lance', 'stake', 'canister']);
    expect(slotSeconds('p1', 'stake')).toBeCloseTo(1.9, 9);
    expect(patternSeconds('p1')).toBeCloseTo(11.4, 9);
    expect([BOSS.p1Glow, BOSS.p1Index, BOSS.p1Rest]).toEqual([0.9, 0.2, 0.8]);
    expect(slotSeconds('p2', 'stake')).toBeCloseTo(1.0, 9);
    expect(slotSeconds('p2', 'lance')).toBeCloseTo(3.7, 9);
    expect(patternSeconds('p2')).toBeCloseTo(7.7, 9);
    expect(BOSS.lanceArcDeg / BOSS.lanceSweep).toBeCloseTo(28, 9);
    expect([BOSS.p1Haul, BOSS.p2Haul, BOSS.p3Haul, BOSS.p3HaulT4]).toEqual([3.0, 6.5, 3.0, 6.0]);   // polish round 3 (R2): were 3.5 and 4.0
  });
  it('26 pips are 10 + 10 + 6; damage does not carry across a phase; phase 3a removes nothing for good', () => {
    expect(BOSS.pipsP1 + BOSS.pipsP2 + BOSS.pipsP3).toBe(BOSS.pipsTotal);
    expect(pipsFor('idle', 0, 0)).toBe(26);
    expect(pipsFor('parley', 6, 0)).toBe(20);
    expect(pipsFor('p1', 10, 0)).toBe(16);
    expect(pipsFor('p1', 12, 0)).toBe(16);
    expect(pipsFor('p2', 0, 0)).toBe(16);
    expect(pipsFor('p2', 10, 0)).toBe(6);
    expect(pipsFor('p3a', 0, 0)).toBe(6);
    expect(pipsFor('p3a', 0, 4)).toBe(2);
    expect(pipsFor('hush', 0, 6)).toBe(0);
    expect(pipsFor('p3b', 5, 0)).toBe(1);
    expect(pipsFor('dead', 6, 0)).toBe(0);
    // a line round through the guard is three hits, but the tenth hit ends the phase
    expect(countHits(0, 10, 3)).toBe(3);
    expect(countHits(8, 10, 3)).toBe(2);
    expect(countHits(10, 10, 3)).toBe(0);
  });
  it('the parley timeline (GDD 8.1; pass i4: four lines, the narrator\'s has left the asking): 17 s, the inspection from 12 to 16', () => {
    expect(PARLEY_LINES.map((l) => l[0])).toEqual([0, 3.5, 7.5, 12]);
    expect(PARLEY_LINES.map((l) => l[1])).toEqual(['stn_parley_1', 'rv_ask', 'stn_parley_2', 'stn_parley_4']);
    expect(BOSS.parley.windowEnd - BOSS.parley.line4).toBe(4);
    expect(BOSS.parley.phase1).toBe(17);
  });
  it('pass i3: the asking is as long as its lines are held in the story data; a line the data does not carry is not asked for', () => {
    const keys: string[] = [], holds: number[] = [];
    const lines = story.lines as Record<string, { seconds?: number }>;
    // today's data (closing of pass i3: the roll-call is one line): five lines, and the written clock falls out of their seconds
    expect(parleyPlan(lines, keys, holds)).toBe(PARLEY_LINES.length);
    expect(keys).toEqual(PARLEY_LINES.map((l) => l[1]));
    expect(holds.slice(0, -1)).toEqual([3.5, 4, 4.5]);
    expect(holds.slice(0, -1).reduce((a, b) => a + b, 0)).toBe(BOSS.parley.line4);
    expect('nar_parley' in lines).toBe(false);
    // other text: longer spoken lines. No code changes.
    const merged: Record<string, { seconds?: number }> = { ...lines, stn_parley_1: { seconds: 4.5 }, rv_ask: { seconds: 4.5 } };
    expect(parleyPlan(merged, keys, holds)).toBe(4);
    expect(keys).toEqual(['stn_parley_1', 'rv_ask', 'stn_parley_2', 'stn_parley_4']);
    expect(holds.slice(0, -1)).toEqual([4.5, 4.5, 4.5]);
    expect(holds.slice(0, -1).reduce((a, b) => a + b, 0)).toBe(13.5);
    // a stub's data (no seconds, or no lines at all): the written times, and the inspection is always a stage
    expect(parleyPlan({}, keys, holds)).toBe(1);
    expect(keys).toEqual(['stn_parley_4']);
    parleyPlan({ stn_parley_1: {}, nar_parley: {}, rv_ask: {}, stn_parley_2: {}, stn_parley_3: {}, stn_parley_4: {} }, keys, holds);
    expect(keys).not.toContain('stn_parley_3');
    expect(keys).not.toContain('nar_parley');
    expect(holds).toEqual([3.5, 4, 4.5, 4]);
    expect([BOSS.rollTickGain, BOSS.rollTickPitch]).toEqual([0.7, 0.75]);
  });
  it('bays: bay k is centred on 60 (k - 1) degrees; bearings are compass bearings from the axis', () => {
    const ax = 14, az = 96;
    expect(bearingDeg(14, 80, ax, az)).toBeCloseTo(0, 6);          // the door, north
    expect(bearingDeg(24, 96, ax, az)).toBeCloseTo(90, 6);         // east
    expect(bearingDeg(14, 110, ax, az)).toBeCloseTo(180, 6);
    expect(bearingDeg(4, 96, ax, az)).toBeCloseTo(270, 6);
    expect([0, 29, 31, 89, 91, 180, 209, 260, 329, 331, 359].map(bayOfBearing)).toEqual([1, 1, 2, 2, 3, 4, 4, 5, 6, 1, 1]);
    // every proving mark and bay trigger of the layout lies in its own bay, and the arm swings to the bay the layout names
    const markers = (layout as unknown as { markers: { id: string; pos: number[]; params: Record<string, unknown> }[] }).markers;
    for (let k = 1; k <= 6; k++) {
      const mark = markers.find((m) => m.id === `ia_proving_mark_${k}`)!;
      const bay = markers.find((m) => m.id === `bay_${k}`)!;
      expect(bayOfBearing(bearingDeg(mark.pos[0]!, mark.pos[2]!, ax, az))).toBe(k);
      expect(bayOfBearing(bearingDeg(bay.pos[0]!, bay.pos[2]!, ax, az))).toBe(k);
      expect(oppositeBay(k)).toBe(mark.params.armSwingsTo);
      expect(bearingOfBay(k)).toBe(mark.params.bearingDeg);
    }
  });
  it('indexing: the shorter way round, 1.5 s per 60 degree step', () => {
    expect(indexSteps(1, 1)).toBe(0);
    expect(indexSteps(1, 2)).toBe(1);
    expect(indexSteps(1, 3)).toBe(2);
    expect(indexSteps(1, 4)).toBe(3);
    expect(indexSteps(1, 5)).toBe(-2);
    expect(indexSteps(1, 6)).toBe(-1);
    expect(indexSteps(6, 1)).toBe(1);
    expect(indexSteps(5, 2)).toBe(3);
    expect(indexSteps(2, 6)).toBe(-2);
    expect(indexSeconds(indexSteps(1, 3))).toBe(3);
    expect(indexSeconds(indexSteps(1, 6))).toBe(1.5);
    expect(indexSeconds(indexSteps(2, 5))).toBe(4.5);
  });
  it('the arm: a ratchet run with a 2 degree overshoot that settles on the index', () => {
    const arm = new Arm();
    arm.reset(1);
    expect(arm.indexTo(1)).toBe(0);
    expect(arm.indexTo(3)).toBe(3);
    let peak = 0, ticks = 0, settled = -1;
    for (let i = 0; i < 400 && arm.moving; i++) { if (arm.tick(1 / 60)) settled = i + 1; ticks++; if (arm.heading > peak) peak = arm.heading; }
    expect(Math.abs(ticks - 180)).toBeLessThanOrEqual(1);
    expect(settled).toBe(ticks);
    expect(peak).toBeGreaterThan(121.5);
    expect(peak).toBeLessThanOrEqual(122.0001);
    expect([arm.bay, arm.heading]).toEqual([3, 120]);
    expect(arm.clicks).toBe(2);
    // the other way round, and the hush's single 1.5 s run to the opposite index
    arm.indexTo(1);
    for (let i = 0; i < 400 && arm.moving; i++) arm.tick(1 / 60);
    expect([arm.bay, arm.heading]).toEqual([1, 0]);
    expect(arm.indexTo(oppositeBay(1), BOSS.hushSwing)).toBe(1.5);
    let t = 0;
    while (arm.moving) { arm.tick(1 / 60); t++; }
    expect(t).toBeLessThanOrEqual(91);
    expect(arm.bay).toBe(4);
  });
  it('it can aim only within 35 degrees of the arm heading', () => {
    expect(offArc(350, 10)).toBe(-20);
    expect(clampToArc(20, 0)).toBe(20);
    expect(clampToArc(50, 0)).toBe(35);
    expect(clampToArc(300, 0)).toBe(-35);
    expect(clampToArc(200, 180)).toBe(200);
    expect(clampToArc(90, 180)).toBe(145);
  });
  it('adds climb out of the grate farthest from her, never one within 7 m', () => {
    const grates = (layout as unknown as { markers: { id: string; pos: number[] }[] }).markers.filter((m) => /^sp_bore_grate_/.test(m.id)).map((m) => ({ id: m.id, x: m.pos[0]!, z: m.pos[2]! }));
    expect(grates.length).toBe(3);
    // beside grate 1 (east): one of the two western grates, never grate 1
    const near1 = chooseGrate(19.5, 96, grates);
    expect(grates[near1]!.id).not.toBe('sp_bore_grate_1');
    for (let b = 0; b < 360; b += 5) {
      for (const r of [5, 8, 12, 14]) {
        const px = 14 + Math.sin(b * Math.PI / 180) * r, pz = 96 - Math.cos(b * Math.PI / 180) * r;
        const g = chooseGrate(px, pz, grates);
        const d = grates.map((q) => Math.hypot(q.x - px, q.z - pz));
        if (g < 0) { expect(Math.max(...d)).toBeLessThan(7); continue; }
        expect(d[g]).toBe(Math.max(...d));
        expect(d[g]).toBeGreaterThanOrEqual(7);
      }
    }
    expect(chooseGrate(0, 0, [{ id: 'a', x: 1, z: 1 }, { id: 'b', x: 3, z: 0 }])).toBe(-1);
    // a grate with a body still climbing out of it is passed over: the next farthest, still never one within 7 m
    for (const [px, pz] of [[14, 84], [20, 100], [8, 104]] as const) {
      const first = chooseGrate(px, pz, grates);
      const second = chooseGrate(px, pz, grates, 7, 1 << first);
      expect(second).not.toBe(first);
      if (second >= 0) expect(Math.hypot(grates[second]!.x - px, grates[second]!.z - pz)).toBeGreaterThanOrEqual(7);
    }
    expect(chooseGrate(14, 84, grates, 7, 0b111)).toBe(-1);
    // phase 2: two at each haul start, six in the phase
    expect([0, 2, 4, 5, 6].map(p2Wave)).toEqual([2, 2, 2, 1, 0]);
  });
});

describe('polish round 2', () => {
  it('a canister thrown at a player outside the arc lands with its whole ring inside the arc; inside the arc it lands on her', () => {
    // inside +-35 degrees: where she stands
    expect(canisterBearing(20, 0, 6.3)).toBe(20);
    expect(canisterBearing(325, 0, 6.3)).toBe(-35);
    expect(canisterBearing(215, 180, 9)).toBe(215);
    for (const dist of [5, 6.3, 9, 13]) {
      for (const bearing of [36, 60, 120, 180, 240, 324]) {
        const b = canisterBearing(bearing, 0, dist);
        const half = Math.asin(Math.min(1, BOSS.canisterRing / dist)) * 180 / Math.PI;
        // the ring's far edge is at the arc's edge at most
        expect(Math.abs(b) + half).toBeLessThanOrEqual(Math.max(BOSS.arcDeg, half) + 1e-9);
        // and she is outside the ring: more than 3.5 m from where it lands
        const rad = Math.PI / 180;
        const gap = Math.hypot(Math.sin(bearing * rad) * dist - Math.sin(b * rad) * dist, Math.cos(bearing * rad) * dist - Math.cos(b * rad) * dist);
        if (half < BOSS.arcDeg) expect(gap).toBeGreaterThan(BOSS.canisterRing);
        // on her side of the heading
        expect(Math.sign(b) === 0 || Math.sign(b) === Math.sign(offArc(bearing, 0))).toBe(true);
      }
    }
  });
  it('the numbers this round added', () => {
    expect(BIDER.strikeAfter).toBeGreaterThanOrEqual(0.12);
    expect(BIDER.strikeAfter).toBeLessThan(BIDER.lunge);
    expect(BIDER.separateMin).toBeGreaterThanOrEqual(0.7);
    expect(BOSS.chargeRepeat).toBe(30);                  // pass i4 (story reviewer a: four times in 56 s): it was 20
    expect(TRANSIT.seekAfter).toBeGreaterThanOrEqual(TRANSIT.blindAfter);
    // the Windlass's damage numbers are the GDD's (8.2); the phase-2 haul was lengthened in polish round 3 (R2); the phase-1
    // haul is 3.0 s (5.0 for a while in that round, until glow hits counted and the head followed her in the haul)
    expect([BOSS.p1Haul, BOSS.p2Haul, BOSS.p3Haul, BOSS.stakeDamage, BOSS.canisterDamage, BOSS.lanceDamage, BOSS.fanDamage]).toEqual([3.0, 6.5, 3.0, 25, 38, 30, 18]);
  });
  it('polish round 3 (lead rulings R2, R3): the numbers the fixer of this module added', () => {
    // the Tamper's chest vent opens for the last 0.6 s of the 1.0 s wind-up, not all of it
    expect(TAMPER.slamVentLate).toBe(0.6);
    expect(TAMPER.slamVentLate).toBeLessThan(TAMPER.slamWindup);
    // the Windlass: the inspection gives two of phase 1's ten; the teaching line needs no death; burst pawls stay burst;
    // while it hauls it follows her at the hush's speed (0.5 s a step: 120 degrees a second)
    expect([BOSS.parleyGift, BOSS.teachDeaths, BOSS.pawlsReset, BOSS.haulFollows, BOSS.haulFollowStep]).toEqual([2, 0, false, true, 0.5]);
    expect(BOSS.parleyGift).toBeLessThan(BOSS.pipsP1 - 4);            // at least one whole cycle of phase 1 is left after the gift
    expect(3 * BOSS.haulFollowStep).toBeLessThan(BOSS.p1Haul);        // the farthest bay is reached inside the shortest haul
    expect(BOSS.mercyDeaths).toBe(1);
  });
  it('release pass p0: the numbers this module added for the final reviewers\' open issues', () => {
    // the Tamper: the pause after a slam that hurt her (3 s with the recover), 4.5 s from the second in a row on Normal and Easy; the ring hint
    expect([TAMPER.slamAfterHit, TAMPER.hintAfterSlams, TAMPER.hintKey, TAMPER.hintAfterRespawn]).toEqual([1.5, 2, 'hint_tamper_ring', 1.0]);
    expect(TAMPER.slamAfterRun).toEqual({ easy: 4.5, normal: 4.5, hard: 1.5 });
    // the next ring after the hint's slam is laid as the 6 s line ends: recover + pause against the line's seconds
    expect(TAMPER.slamRecoverBy.normal + TAMPER.slamAfterRun.normal).toBeGreaterThanOrEqual(6);
    // the file's rear pair hurry while far off and unwatched; nobody else does
    expect(BIDER.hurryWaves).toEqual({ 'enc_file/R': true });
    expect([BIDER.hurrySpeed, BIDER.hurryBeyond]).toEqual([1.3, 18]);
    expect(ENEMIES.bider.moveSpeed * BIDER.hurrySpeed).toBeGreaterThan(6.75);        // faster than her sprint only where she is not looking
    // the Windlass: the asking follows its lines; a late retry
    expect([BOSS.parleyLineWait, BOSS.parleyKeptLead]).toEqual([14, 4.5]);
    expect([BOSS.retryLead, BOSS.moveDeaths, BOSS.retryLeadLate, BOSS.moveKey, BOSS.moveHintAt, BOSS.moveHintAgain, BOSS.moveRead, BOSS.retryLeadMax]).toEqual([4.0, 2, 6.5, 'hint_boss_move', 0.5, 3.0, 4.0, 11]);
    expect(BOSS.retryLeadLate).toBeGreaterThan(BOSS.retryLead);
  });
});

describe('pass i4', () => {
  it('the numbers this pass added', () => {
    // the lane a charge needs is the body less the graze a charge slides past
    expect(TAMPER.laneHalf).toBeCloseTo(0.8 - TAMPER.grazeDepth, 6);
    expect(TAMPER.laneShort).toBeLessThan(TAMPER.chargeMin);
    // three steps of help at most: the slowest slam is still under two seconds, the longest stun 3.5 s
    expect(TAMPER.slamWindupBy.normal + TAMPER.helpMax * TAMPER.slamHelp).toBeLessThan(2);
    expect(TAMPER.chargeStun + TAMPER.helpMax * TAMPER.stunHelp).toBe(3.5);
    expect(TAMPER.helpTiming).toEqual({ easy: true, normal: true, hard: false });
    expect(TAMPER.ringFromHelp).toBe(2);
    expect([TAMPER.hintKey, TAMPER.backKey]).toEqual(['hint_tamper_ring', 'hint_tamper_back']);
    // the Windlass: three lines a retry may owe, the guard's line after two hauls, the locker's ring after four
    expect([BOSS.moveKey, BOSS.lobKey, BOSS.teachKey, BOSS.pawlsKey]).toEqual(['hint_boss_move', 'hint_boss_lob', 'hint_boss_haul', 'hint_boss_pawls']);
    expect(BOSS.pawlHintHauls).toBe(2);
    expect(BOSS.lockerHintHauls).toBeGreaterThan(BOSS.pawlHintHauls);
    expect(BOSS.chargeMarkRadius).toBeGreaterThan(0.5);   // the mark's own radius (layout `ia_proving_mark_*`)
  });
});
