// The Assize six as pure logic (GDD 6.2 to 6.6): cadence and the fire buffer, the reload, the line round, the kept
// round, the bookkeeping fuzz and the "never lost, never wasted" fuzz. The host is a recorder.
import { describe, expect, it } from 'vitest';
import { FIXED_DT } from '../../src/core/contracts.ts';
import type { ChamberState, EventBus, EventName, GameEvents, KeptContext, PlayerSave } from '../../src/core/contracts.ts';
import { DRY_BEAT, WEAPON } from '../../src/player/defs.ts';
import { Weapon } from '../../src/player/weapon.ts';
import type { WeaponHost, WeaponInput } from '../../src/player/weapon.ts';

interface Logged { tick: number; name: string; payload: Record<string, unknown> }
class Rig implements WeaponHost {
  tick = 0;
  log: Logged[] = [];
  aimLegal = false;
  off = false;
  readonly events: EventBus = {
    on: () => () => undefined, once: () => () => undefined,
    emit: <K extends EventName>(name: K, payload: GameEvents[K]) => { this.log.push({ tick: this.tick, name, payload: { ...(payload as Record<string, unknown>) } }); },
  };
  readonly gun = new Weapon(this);
  readonly input: WeaponInput = { enabled: true, firePressed: false, fireHeld: false, holdToFire: false, reloadPressed: false, linePressed: false, keptPressed: false };
  shoot(ammo: 'lead_round' | 'line_round', shotId: number, chambersLeft: number, bloomDeg: number): void { this.log.push({ tick: this.tick, name: 'SHOT', payload: { ammo, shotId, chambersLeft, bloomDeg } }); }
  shootKept(shotId: number, chambersLeft: number, context: Readonly<KeptContext>): void { this.log.push({ tick: this.tick, name: 'SHOT', payload: { ammo: 'kept_round', shotId, chambersLeft, mark: context.mark } }); }
  aimEntersBore(): boolean { return this.aimLegal; }
  leftMark(): boolean { return this.off; }
  /** one tick with these presses (press edges last one tick) */
  step(press: Partial<Record<'fire' | 'reload' | 'line' | 'kept', boolean>> = {}, held = false): void {
    const i = this.input;
    i.firePressed = press.fire === true; i.reloadPressed = press.reload === true; i.linePressed = press.line === true; i.keptPressed = press.kept === true;
    i.fireHeld = held || press.fire === true;
    this.gun.tick(FIXED_DT, i);
    this.tick++;
  }
  run(n: number): void { for (let k = 0; k < n; k++) this.step(); }
  names(from = 0): string[] { return this.log.filter((e) => e.tick >= from).map((e) => e.name); }
  shots(): Logged[] { return this.log.filter((e) => e.name === 'SHOT'); }
  count(name: string, where?: Record<string, unknown>): number { return this.log.filter((e) => e.name === name && (!where || Object.keys(where).every((k) => e.payload[k] === where[k]))).length; }
}
const MARK: KeptContext = { mark: 'ia_proving_mark_1', markX: 0, markY: 0, markZ: 0, leaveRadius: 2.5, boreX: 5, boreZ: 0, boreTopY: 1.2, boreBottomY: -6, boreRadius: 3 };
/** ticks the hammer stays down on an empty chamber before the reload opens by itself (polish round 4) */
const BEAT = Math.round(DRY_BEAT / FIXED_DT);
const lead = (n: number): ChamberState[] => Array.from({ length: 6 }, (_, i) => (i < n ? 'lead' : 'empty'));

describe('fire (GDD 6.2)', () => {
  it('one shot per click, on the tick of the click; the round is gone and the ring has turned', () => {
    const r = new Rig();
    r.step({ fire: true });
    expect(r.shots()).toHaveLength(1);
    expect(r.shots()[0]).toMatchObject({ tick: 0, payload: { ammo: 'lead_round', shotId: 1, chambersLeft: 5, bloomDeg: 0 } });
    expect(r.gun.cylinder).toEqual(lead(5));
    expect(r.gun.phase).toBe('firing');
    expect(r.gun.shotsFired).toBe(1);
    expect(r.names()).toEqual(['SHOT', 'weapon/ammo']);
  });
  it('the next shot is refused at 0.47 s and accepted at 0.48 s', () => {
    for (const [at, fires] of [[28, false], [29, true]] as const) {
      const r = new Rig();
      r.step({ fire: true });
      r.run(at - 1);
      // a click outside the buffer cannot be told from a buffered one at 28: test the state instead
      expect(r.gun.phase).toBe('firing');
      r.step();                                             // tick `at`
      expect(r.gun.phase === 'ready').toBe(fires);
      if (fires) { r.gun.debugSetAmmo(6, 24, 0); }
    }
    const r = new Rig();
    r.step({ fire: true });
    r.run(28);
    r.step({ fire: true });                                 // tick 29 = 0.483 s: the first legal tick
    expect(r.shots().map((s) => s.tick)).toEqual([0, 29]);
  });
  it('a click in the last 0.15 s of the cycle fires on the first legal tick; an earlier one is dropped', () => {
    for (const [click, fires] of [[24, true], [20, true], [19, false], [10, false]] as const) {
      const r = new Rig();
      r.step({ fire: true });
      r.run(click - 1);
      r.step({ fire: true });                               // the click, at tick `click`
      r.run(40);
      expect(r.shots().map((s) => s.tick), `click at tick ${click}`).toEqual(fires ? [0, 29] : [0]);
    }
  });
  it('hold to repeat fires at the cadence; click mode does not repeat', () => {
    const r = new Rig();
    r.input.holdToFire = true;
    for (let i = 0; i < 100; i++) r.step({ fire: i === 0 }, true);
    expect(r.shots().map((s) => s.tick)).toEqual([0, 29, 58, 87]);
    const c = new Rig();
    for (let i = 0; i < 100; i++) c.step({ fire: i === 0 }, true);
    expect(c.shots()).toHaveLength(1);
  });
  it('hold to fire on an empty cylinder: ONE dry click, the reload opens after its beat and runs to full under the held trigger, then firing resumes', () => {
    const r = new Rig();
    r.input.holdToFire = true;
    for (let i = 0; i < 900; i++) r.step({ fire: i === 0 }, true);
    const shots = r.shots().map((s) => s.tick);
    expect(shots.slice(0, 6)).toEqual([0, 29, 58, 87, 116, 145]);
    const dry = r.log.filter((e) => e.name === 'weapon/dry_fire');
    expect(dry.map((e) => e.tick)).toEqual([174, 174 + BEAT + 147 + 174, 174 + 2 * (BEAT + 147 + 174)].filter((t) => t < 900));   // one per empty cylinder
    expect(dry.every((e) => e.payload.reason === 'empty')).toBe(true);
    // the first reload: opened one beat after the dry click, six rounds seated, closed normally (the held trigger is no interrupt)
    const first = r.log.filter((e) => e.name === 'weapon/reload' && e.tick >= 174 && e.tick < 174 + BEAT + 147);
    expect(first[0]?.tick).toBe(174 + BEAT);
    expect(first.map((e) => e.payload.stage)).toEqual(['open', 'round', 'round', 'round', 'round', 'round', 'round', 'close']);
    expect(shots[6]).toBe(174 + BEAT + 147);                // the beat and 2.45 s after the dry click, on the first ready tick
    expect(shots.length).toBeGreaterThanOrEqual(12);
    expect(r.gun.reserve + r.gun.chambered + shots.length).toBe(30);
  });
  it('hold to fire with nothing left: one dry click per hold, another after a release', () => {
    const r = new Rig();
    r.input.holdToFire = true;
    r.gun.debugSetAmmo(0, 0, 0);
    for (let i = 0; i < 120; i++) r.step({ fire: i === 0 }, true);
    expect(r.count('weapon/dry_fire')).toBe(1);
    r.run(3);                                               // released
    for (let i = 0; i < 60; i++) r.step({ fire: i === 0 }, true);
    expect(r.count('weapon/dry_fire')).toBe(2);
    expect(r.gun.phase).toBe('ready');
  });
  it('a click at any moment of the draw fires on the first ready tick: the trigger is never dead after a spawn or a ride', () => {
    for (const click of [1, 2, 10, 20, 28]) {
      const r = new Rig();
      r.gun.draw();
      expect(r.gun.phase).toBe('drawing');
      for (let i = 0; i < 60; i++) r.step({ fire: i === click });
      expect(r.shots().map((s) => s.tick), `click at tick ${click} of the draw`).toEqual([29]);   // 0.5 s: 30 ticks
    }
    // the edge on the very tick control came back is the click that gave it (play, click to resume): not a pull
    const r = new Rig();
    r.gun.draw();
    for (let i = 0; i < 60; i++) r.step({ fire: i === 0 });
    expect(r.shots()).toHaveLength(0);
  });
  it('six shots at the cadence are all pinpoint: bloom has decayed before each', () => {
    const r = new Rig();
    for (let i = 0; i < 6 * 29; i++) r.step({ fire: i % 29 === 0 });
    expect(r.shots().map((s) => s.payload.bloomDeg)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(r.gun.chambered).toBe(0);
    // right after a shot the bloom is 1.5 degrees and it is gone 0.35 s later
    const b = new Rig();
    b.step({ fire: true });
    expect(b.gun.bloom).toBeCloseTo(WEAPON.bloomPerShotDeg, 6);
    b.run(21);
    expect(b.gun.bloom).toBe(0);
  });
  it('input off: nothing fires and a buffered click is forgotten', () => {
    const r = new Rig();
    r.input.enabled = false;
    r.step({ fire: true }); r.run(5);
    expect(r.shots()).toHaveLength(0);
  });
});

describe('reload (GDD 6.3)', () => {
  it('a pull on an empty cylinder is one dry click with a beat of its own (7 ticks: hammer down, nothing else), then the reload opens by itself; full from empty is 2.45 s after that', () => {
    const r = new Rig();
    r.gun.debugSetAmmo(0, 24, 0); r.log.length = 0;
    r.step({ fire: true });
    expect(BEAT).toBe(7);                                   // the critic asked for 6 to 8 ticks
    expect(r.names()).toEqual(['weapon/dry_fire']);         // the click alone: no reload sound on its tick
    expect(r.log[0]?.payload.reason).toBe('empty');
    for (let k = 1; k < BEAT; k++) {
      expect(r.gun.phase, `tick ${k}`).toBe('ready');
      expect(r.gun.clip, `tick ${k}`).toBe('dry_fire');
      r.step();
    }
    expect(r.names()).toEqual(['weapon/dry_fire']);
    r.step();                                               // tick 7
    expect(r.log.map((e) => [e.tick, e.name])).toEqual([[0, 'weapon/dry_fire'], [BEAT, 'weapon/reload']]);
    expect(r.gun.phase).toBe('reload_open');
    expect(r.gun.clip).toBe('reload_open');
    let ticks = 0;
    while (r.gun.phase !== 'ready' && ticks < 400) { r.step(); ticks++; }
    expect(ticks * FIXED_DT).toBeCloseTo(2.45, 6);
    expect(r.gun.cylinder).toEqual(lead(6));
    expect(r.gun.reserve).toBe(18);
    expect(r.log.filter((e) => e.name === 'weapon/reload').map((e) => e.payload.stage)).toEqual(['open', 'round', 'round', 'round', 'round', 'round', 'round', 'close']);
    // the seat moments: 0.35 + 0.30 k + 10 ticks
    expect(r.log.filter((e) => e.payload.stage === 'round').map((e) => e.tick)).toEqual([0, 1, 2, 3, 4, 5].map((k) => BEAT + 21 + 18 * k + 10));
    expect(r.count('weapon/dry_fire')).toBe(1);
  });
  it('R reloads with fewer than six and a reserve; not with six, not with none', () => {
    const r = new Rig();
    r.step({ reload: true });
    expect(r.gun.phase).toBe('ready');
    r.gun.debugSetAmmo(3, 2, 0);
    r.step({ reload: true });
    expect(r.gun.phase).toBe('reload_open');
    r.run(200);
    expect(r.gun.cylinder).toEqual(lead(5));
    expect(r.gun.reserve).toBe(0);
    r.step({ reload: true });
    expect(r.gun.phase).toBe('ready');
  });
  it('fire during a reload: the round in hand is finished, fast close, a shot within 0.50 s, whenever it is pressed', () => {
    for (let press = 1; press < 140; press++) {
      const r = new Rig();
      r.gun.debugSetAmmo(2, 24, 0); r.log.length = 0;
      r.step({ reload: true });                             // tick 0
      r.run(press - 1);
      if (r.gun.phase === 'ready') break;
      const before = r.gun.chambered;
      r.step({ fire: true });                               // tick `press`
      r.run(40);
      const shot = r.shots()[0];
      expect(shot, `press at ${press}`).toBeDefined();
      expect(((shot?.tick ?? 999) - press) * FIXED_DT, `press at ${press}`).toBeLessThanOrEqual(0.5 + 1e-9);
      expect(r.gun.chambered, `press at ${press}`).toBeGreaterThanOrEqual(before - 1);
    }
    // the worst case is a press on the tick a round starts: 0.30 + 0.20
    const w = new Rig();
    w.gun.debugSetAmmo(2, 24, 0);
    w.step({ reload: true }); w.run(20);
    w.step({ fire: true });                                 // tick 21: the first round starts
    w.run(40);
    expect(w.shots()[0]?.tick).toBe(21 + 30);
    expect(w.log.some((e) => e.name === 'weapon/reload' && e.payload.stage === 'fast_close')).toBe(true);
  });
  it('fire during the reload of an EMPTY cylinder seats one round first, then fires', () => {
    const r = new Rig();
    r.gun.debugSetAmmo(0, 24, 0);
    r.step({ fire: true });                                 // dry click; the reload opens after the beat
    r.run(BEAT + 4);
    r.step({ fire: true });
    r.run(60);
    expect(r.shots()).toHaveLength(1);
    expect(r.shots()[0]?.tick).toBe(BEAT + 21 + 18 + 12);
    expect(r.gun.reserve).toBe(23);
  });
  it('a second pull INSIDE the dry beat is not a second click and is not lost: one round is seated, then it fires', () => {
    const r = new Rig();
    r.gun.debugSetAmmo(0, 24, 0); r.log.length = 0;
    r.step({ fire: true });
    r.run(3);
    r.step({ fire: true });                                 // tick 4: the hammer is still down
    r.run(70);
    expect(r.count('weapon/dry_fire')).toBe(1);
    expect(r.log.find((e) => e.name === 'weapon/reload')?.tick).toBe(BEAT);   // the beat is not restarted
    expect(r.shots().map((s) => s.tick)).toEqual([BEAT + 21 + 18 + 12]);
    expect(r.gun.reserve).toBe(23);
  });
  it('R, the line key and a pickup inside the dry beat: R opens the reload at once, Q loads the line round and no reload follows', () => {
    const r = new Rig();
    r.gun.debugSetAmmo(0, 24, 0); r.log.length = 0;
    r.step({ fire: true }); r.run(2);
    r.step({ reload: true });                               // tick 3
    expect(r.gun.phase).toBe('reload_open');
    expect(r.log.filter((e) => e.name === 'weapon/reload').map((e) => e.tick)).toEqual([3]);
    r.run(200);
    expect(r.count('weapon/reload', { stage: 'open' })).toBe(1);
    expect(r.gun.cylinder).toEqual(lead(6));
    const q = new Rig();
    q.gun.debugSetAmmo(0, 24, 1); q.log.length = 0;
    q.step({ fire: true }); q.run(2);
    q.step({ line: true });
    expect(q.gun.phase).toBe('loading_line');
    q.run(60);
    expect(q.gun.phase).toBe('ready');
    expect(q.gun.cylinder[0]).toBe('line');
    expect(q.count('weapon/reload')).toBe(0);               // the beat's reload died with the beat
  });
  it('the dry beat with input off (a ride begins on the click): the reload still opens; a restore inside the beat cancels it', () => {
    const r = new Rig();
    r.gun.debugSetAmmo(0, 24, 0); r.log.length = 0;
    r.step({ fire: true });
    r.input.enabled = false;
    r.run(BEAT);
    expect(r.gun.phase).toBe('reload_open');
    const s = new Rig();
    s.gun.debugSetAmmo(0, 24, 0);
    s.step({ fire: true }); s.run(2);
    s.gun.restore({ health: 100, cylinder: lead(6), reserve: 24, lineRounds: 0, seventh: 'sealed' });
    s.log.length = 0;
    s.run(30);
    expect(s.count('weapon/reload')).toBe(0);
    expect(s.gun.phase).toBe('ready');
    expect(s.gun.clip).toBe('idle');
  });
  it('R pressed while the last shot cycles is remembered', () => {
    const r = new Rig();
    r.step({ fire: true }); r.run(5);
    r.step({ reload: true });
    r.run(23);
    expect(r.gun.phase).toBe('reload_open');
  });
  it('with nothing to reload a pull is a dry click each time, and the gun stays ready', () => {
    const r = new Rig();
    r.gun.debugSetAmmo(0, 0, 0); r.log.length = 0;
    r.step({ fire: true }); r.run(3); r.step({ fire: true });
    expect(r.count('weapon/dry_fire')).toBe(2);
    expect(r.gun.phase).toBe('ready');
    expect(r.gun.clip).toBe('dry_fire');
    r.run(12);
    expect(r.gun.clip).toBe('idle');
  });
});

describe('line round (GDD 6.4)', () => {
  it('Q seats it under the hammer in 0.55 s, the displaced lead goes to the reserve; Q again unloads in 0.35 s', () => {
    const r = new Rig();
    expect(r.gun.giveLineRounds(5)).toBe(2);
    r.step({ line: true });
    expect(r.gun.phase).toBe('loading_line');
    r.run(32);
    expect(r.gun.phase).toBe('loading_line');
    r.step();                                               // tick 33 = 0.55 s
    expect(r.gun.phase).toBe('ready');
    expect(r.gun.cylinder).toEqual(['line', 'lead', 'lead', 'lead', 'lead', 'lead']);
    expect(r.gun.reserve).toBe(25);
    expect(r.gun.lineRounds).toBe(1);
    expect(r.log.find((e) => e.name === 'weapon/line')?.payload).toEqual({ stage: 'loaded', held: 1 });
    const t0 = r.tick;
    r.step({ line: true });
    r.run(20);
    expect(r.gun.phase).toBe('unloading_line');
    r.step();                                               // 21 ticks = 0.35 s
    expect(r.gun.phase).toBe('ready');
    expect(r.tick - t0).toBe(22);
    expect(r.gun.cylinder).toEqual(lead(6));                // the displaced lead round is back under the hammer:
    expect(r.gun.reserve).toBe(24);                         // Q, Q changes nothing (GDD 6.4 rule 2)
    expect(r.gun.lineRounds).toBe(2);
    expect(r.log.filter((e) => e.name === 'weapon/line').at(-1)?.payload).toEqual({ stage: 'unloaded', held: 2 });
  });
  it('the next shot is the line round; the carry cap counts the one under the hammer', () => {
    const r = new Rig();
    r.gun.giveLineRounds(2);
    r.step({ line: true }); r.run(33);
    expect(r.gun.giveLineRounds(1)).toBe(0);
    r.step({ fire: true });
    expect(r.shots()[0]?.payload.ammo).toBe('line_round');
    expect(r.gun.giveLineRounds(2)).toBe(1);
    r.run(29); r.step({ fire: true });
    expect(r.shots()[1]?.payload.ammo).toBe('lead_round');
  });
  it('toggling Q never drains the cylinder: Q on every tick for 300 ticks leaves six rounds and the reserve as it was', () => {
    const r = new Rig();
    r.gun.giveLineRounds(1);
    for (let i = 0; i < 300; i++) r.step({ line: true });
    while (r.gun.phase !== 'ready') r.step();
    if (r.gun.cylinder[0] === 'line') { r.step({ line: true }); r.run(22); }
    expect(r.gun.cylinder).toEqual(lead(6));
    expect(r.gun.reserve).toBe(24);
    expect(r.gun.lineRounds).toBe(1);
  });
  it('unloading a line round that was seated in an EMPTY chamber seats no lead round (no free reload)', () => {
    const r = new Rig();
    r.gun.debugSetAmmo(0, 10, 1);
    r.step({ line: true }); r.run(33);
    expect(r.gun.cylinder[0]).toBe('line');
    r.step({ line: true }); r.run(22);
    expect(r.gun.cylinder).toEqual(lead(0));
    expect(r.gun.reserve).toBe(10);
  });
  it('with the reserve at its cap of 36 a displaced lead round is kept in hand, never discarded (Q and F)', () => {
    const r = new Rig();
    r.gun.debugSetAmmo(6, 36, 1);
    r.step({ line: true }); r.run(33);
    expect(r.gun.cylinder).toEqual(['line', 'lead', 'lead', 'lead', 'lead', 'lead']);
    expect([r.gun.reserve, r.gun.spare, r.gun.discarded]).toEqual([36, 1, 0]);
    r.step({ line: true }); r.run(22);                      // unload: the round in hand goes back under the hammer
    expect(r.gun.cylinder).toEqual(lead(6));
    expect([r.gun.reserve, r.gun.spare, r.gun.lineRounds]).toEqual([36, 0, 1]);
    // the kept round: the lead it displaces is in hand, and enters the reserve when the reload makes room
    r.gun.setKeptContext(MARK);
    r.step({ kept: true }); r.run(108);
    expect(r.gun.seventh).toBe('chambered');
    expect([r.gun.reserve, r.gun.spare, r.gun.discarded]).toEqual([36, 1, 0]);
    r.aimLegal = true; r.step(); r.step({ fire: true }); r.run(75);
    expect(r.gun.seventh).toBe('spent');
    expect(r.gun.cylinder).toEqual(lead(5));
    r.step({ reload: true }); r.run(60);
    expect(r.gun.cylinder).toEqual(lead(6));
    expect([r.gun.reserve, r.gun.spare]).toEqual([36, 0]);  // 35 after the seat, and the round in hand made it 36
  });
  it('Q with none held does nothing', () => {
    const r = new Rig();
    r.step({ line: true });
    expect(r.gun.phase).toBe('ready');
  });
});

describe('gifts and caps', () => {
  it('pickups add 6 and 12 up to 36 and are refused at the cap; the refill box tops up to its floor; the boss box adds', () => {
    const r = new Rig();
    expect(r.gun.givePickup('pk_rounds_6')).toBe(true);
    expect(r.gun.reserve).toBe(30);
    expect(r.gun.givePickup('pk_rounds_12')).toBe(true);
    expect(r.gun.reserve).toBe(36);
    expect(r.gun.givePickup('pk_rounds_6')).toBe(false);
    r.gun.debugSetAmmo(6, 5, 0);
    expect(r.gun.giveLead(0, 18)).toBe(13);
    expect(r.gun.giveLead(0, 18)).toBe(0);
    expect(r.gun.giveLead(6, 0)).toBe(6);
    r.gun.debugSetAmmo(6, 33, 0);
    expect(r.gun.giveLead(6, 0)).toBe(3);
    expect(r.gun.giveLead(0, 18)).toBe(0);                  // a floor never takes rounds away
    expect(r.gun.reserve).toBe(36);
  });
});

describe('kept round (GDD 6.6)', () => {
  const chambered = (): Rig => { const r = new Rig(); r.gun.setKeptContext(MARK); r.step({ kept: true }); r.run(108); return r; };
  it('F with no context is denied and changes nothing', () => {
    const r = new Rig();
    const before = JSON.stringify(r.gun.capture(100));
    r.step({ kept: true });
    expect(r.log).toEqual([{ tick: 0, name: 'weapon/kept', payload: { stage: 'denied', mark: '' } }]);
    expect(JSON.stringify(r.gun.capture(100))).toBe(before);
    expect(r.gun.phase).toBe('ready');
  });
  it('F with a context: loading on that tick, chambered after 1.8 s of sim time; the displaced round goes home', () => {
    const r = new Rig();
    const ctx = { ...MARK };
    r.gun.setKeptContext(ctx);
    ctx.mark = 'changed_later';                             // the context is copied, not kept
    r.step({ kept: true });
    expect(r.log[0]).toEqual({ tick: 0, name: 'weapon/kept', payload: { stage: 'loading', mark: 'ia_proving_mark_1' } });
    expect(r.gun.phase).toBe('loading_kept');
    expect(r.gun.seventh).toBe('sealed');
    r.run(107);
    expect(r.gun.phase).toBe('loading_kept');
    r.step();                                               // tick 108 = 1.8 s
    expect(r.gun.phase).toBe('ready');
    expect(r.gun.seventh).toBe('chambered');
    expect(r.gun.cylinder).toEqual(['kept', 'lead', 'lead', 'lead', 'lead', 'lead']);
    expect(r.gun.reserve).toBe(25);
    expect(r.names(108)).toEqual(['weapon/seventh', 'weapon/kept', 'weapon/ammo']);
    expect(r.log.filter((e) => e.name === 'weapon/kept').at(-1)?.payload).toEqual({ stage: 'chambered', mark: 'ia_proving_mark_1' });
  });
  it('the load takes 1.8 s of SIM time: at half time scale it is 216 ticks', () => {
    const r = new Rig();
    r.gun.setKeptContext(MARK);
    r.step({ kept: true });
    let ticks = 0;
    while (r.gun.phase === 'loading_kept') { r.gun.tick(FIXED_DT * 0.5, r.input); ticks++; }
    expect(ticks).toBe(216);
  });
  it('input other than look is ignored during the load', () => {
    const r = new Rig();
    r.gun.setKeptContext(MARK);
    r.step({ kept: true });
    for (let i = 0; i < 100; i++) r.step({ fire: i % 3 === 0, reload: i % 5 === 0, line: i % 7 === 0, kept: i % 11 === 0 });
    r.run(7);
    expect(r.gun.phase).toBe('loading_kept');
    r.step();
    expect(r.gun.seventh).toBe('chambered');
    expect(r.shots()).toHaveLength(0);
  });
  it('the fire buffer holds for the load: a click in its last 0.15 s is a pull on the first ready tick; an earlier one is ignored', () => {
    for (const [click, legal, expectShot, expectDry] of [[100, true, true, 0], [107, true, true, 0], [98, true, false, 0], [50, true, false, 0], [102, false, false, 1]] as const) {
      const r = new Rig();
      r.gun.setKeptContext(MARK);
      r.aimLegal = legal;
      r.step({ kept: true });                               // tick 0; the load ends on tick 108
      for (let i = 1; i <= 130; i++) r.step({ fire: i === click });
      const shot = r.shots();
      expect(shot.map((s) => s.tick), `click at tick ${click}, legal ${legal}`).toEqual(expectShot ? [108] : []);
      expect(r.count('weapon/dry_fire', { reason: 'kept_not_in_bore' }), `click at tick ${click}`).toBe(expectDry);
      expect(r.gun.seventh).toBe(expectShot ? 'spent' : 'chambered');   // an illegal buffered pull consumes nothing
      // on that one tick: chambered, the legal-aim tick, then the shot
      if (expectShot) expect(r.names(108)).toEqual(['weapon/seventh', 'weapon/kept', 'weapon/ammo', 'audio/cue', 'weapon/kept', 'SHOT', 'weapon/seventh', 'weapon/ammo']);
    }
  });
  it('the legal-aim tick sounds once each time the aim turns legal', () => {
    const r = chambered();
    r.log.length = 0;
    r.run(3);
    expect(r.gun.keptAimLegal).toBe(false);
    r.aimLegal = true; r.run(5);
    expect(r.gun.keptAimLegal).toBe(true);
    r.aimLegal = false; r.run(2); r.aimLegal = true; r.run(2);
    const cues = r.log.filter((e) => e.name === 'audio/cue');
    expect(cues).toHaveLength(2);
    expect(cues[0]?.payload).toMatchObject({ cue: 'listen_tick', positional: false, gain: 0.5, pitch: 1 });
  });
  it('a pull with an illegal aim is a dead trigger: nothing is consumed', () => {
    const r = chambered();
    r.log.length = 0;
    const before = JSON.stringify(r.gun.capture(100));
    r.step({ fire: true });
    expect(r.log).toEqual([{ tick: r.tick - 1, name: 'weapon/dry_fire', payload: { reason: 'kept_not_in_bore' } }]);
    expect(JSON.stringify(r.gun.capture(100))).toBe(before);
    expect(r.gun.phase).toBe('ready');
    expect(r.gun.shotsFired).toBe(0);
  });
  it('a pull with a legal aim fires it: kept fired, then the shot, the seventh spent, F denied afterwards', () => {
    const r = chambered();
    r.aimLegal = true; r.run(1);
    r.log.length = 0;
    r.step({ fire: true });
    expect(r.names()).toEqual(['weapon/kept', 'SHOT', 'weapon/seventh', 'weapon/ammo']);
    expect(r.log[0]?.payload).toEqual({ stage: 'fired', mark: 'ia_proving_mark_1' });
    expect(r.log[1]?.payload).toMatchObject({ ammo: 'kept_round', mark: 'ia_proving_mark_1' });
    expect(r.gun.seventh).toBe('spent');
    expect(r.gun.phase).toBe('firing_kept');
    expect(r.gun.cylinder[0]).toBe('empty');
    r.run(72);
    expect(r.gun.phase).toBe('ready');
    expect(r.gun.cylinder).toEqual(lead(5));
    r.log.length = 0;
    r.step({ kept: true });
    expect(r.log.map((e) => e.payload)).toEqual([{ stage: 'denied', mark: '' }]);
    expect(r.gun.seventh).toBe('spent');
  });
  it('leaving the mark unloads it with the band broken; it loads again as often as needed', () => {
    const r = chambered();
    for (let round = 0; round < 3; round++) {
      r.off = true; r.step();
      expect(r.gun.phase).toBe('unloading_kept');
      r.run(18);
      expect(r.gun.phase).toBe('ready');
      expect(r.gun.seventh).toBe('band_broken');
      expect(r.gun.cylinder.includes('kept')).toBe(false);
      expect(r.log.filter((e) => e.name === 'weapon/kept').at(-1)?.payload).toEqual({ stage: 'unloaded', mark: 'ia_proving_mark_1' });
      r.off = false;
      r.step({ kept: true });
      expect(r.gun.phase).toBe('loading_kept');
      r.run(108);
      expect(r.gun.seventh).toBe('chambered');
    }
  });
  it('reload and Q are refused while it is chambered', () => {
    const r = chambered();
    r.gun.giveLineRounds(1);
    r.step({ reload: true }); r.step({ line: true });
    expect(r.gun.phase).toBe('ready');
    expect(r.gun.cylinder[0]).toBe('kept');
  });
  it('F during a reload ends the reload and then loads', () => {
    const r = new Rig();
    r.gun.debugSetAmmo(2, 24, 0);
    r.gun.setKeptContext(MARK);
    r.step({ reload: true }); r.run(25);
    r.step({ kept: true });
    r.run(40);
    expect(r.gun.phase).toBe('loading_kept');
  });
  it('boss/charge_required makes a sealed round pulse, and only a sealed one', () => {
    const r = new Rig();
    r.gun.chargeRequired();
    expect(r.gun.seventh).toBe('pulse');
    expect(r.log).toEqual([{ tick: 0, name: 'weapon/seventh', payload: { state: 'pulse' } }]);
    r.gun.debugSetSeventh('band_broken');
    r.gun.chargeRequired();
    expect(r.gun.seventh).toBe('band_broken');
  });
  it('the stone: take_round for 1.0 s and the seventh is violet', () => {
    const r = chambered();
    r.aimLegal = true; r.run(1); r.step({ fire: true }); r.run(80);
    r.gun.takeStoneRound();
    expect(r.gun.seventh).toBe('violet');
    expect(r.gun.phase).toBe('taking_round');
    r.run(60);
    expect(r.gun.phase).toBe('ready');
  });
});

describe('save (GDD 5, ARCHITECTURE 10.1)', () => {
  it('round-trips through JSON; the floors; a chambered save comes back band-broken', () => {
    const r = new Rig();
    r.gun.giveLineRounds(2);
    r.step({ line: true }); r.run(33);
    r.step({ fire: true }); r.run(29);
    r.gun.debugSetAmmo(2, 3, 2);
    r.gun.setKeptContext(MARK); r.step({ kept: true }); r.run(108);
    const save = JSON.parse(JSON.stringify(r.gun.capture(41))) as PlayerSave;
    expect(save).toEqual({ health: 41, cylinder: ['kept', 'lead', 'empty', 'empty', 'empty', 'empty'], reserve: 4, lineRounds: 2, seventh: 'chambered' });
    const b = new Rig();
    b.gun.restore(save);
    expect(b.gun.cylinder).toEqual(lead(6));
    expect(b.gun.reserve).toBe(18);
    expect(b.gun.lineRounds).toBe(2);
    expect(b.gun.seventh).toBe('band_broken');
    expect(b.gun.phase).toBe('ready');
    // a fresh gun's save is the state a run begins with, and the floors leave it alone
    const fresh = new Rig().gun.capture(100);
    expect(fresh).toEqual({ health: 100, cylinder: lead(6), reserve: 24, lineRounds: 0, seventh: 'sealed' });
    const c = new Rig();
    c.gun.debugSetAmmo(1, 0, 1); c.gun.debugSetSeventh('violet'); c.step({ reload: true });
    c.gun.restore(JSON.parse(JSON.stringify(fresh)) as PlayerSave);
    expect(c.gun.capture(100)).toEqual(fresh);
    // a line round under the hammer is counted in the save
    const l = new Rig();
    l.gun.giveLineRounds(1); l.step({ line: true }); l.run(33);
    expect(l.gun.capture(100).lineRounds).toBe(1);
  });
});

describe('bookkeeping', () => {
  /** mulberry32 */
  const prng = (seed: number) => (): number => { seed = (seed + 0x6d2b79f5) | 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  it('100 seeded random action sequences: counts never negative, never over a cap, every round accounted for', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const rnd = prng(seed);
      const r = new Rig();
      let givenLead = 6 + 24, givenLine = 0;
      for (let i = 0; i < 1500; i++) {
        const a = rnd();
        if (a < 0.01) givenLead += r.gun.giveLead(6, 0);
        else if (a < 0.02) givenLead += r.gun.giveLead(0, 18);
        else if (a < 0.03) { const b = r.gun.reserve; if (r.gun.givePickup(rnd() < 0.5 ? 'pk_rounds_6' : 'pk_rounds_12')) givenLead += r.gun.reserve - b; }
        else if (a < 0.04) givenLine += r.gun.giveLineRounds(1 + Math.floor(rnd() * 2));
        r.step({ fire: rnd() < 0.12, reload: rnd() < 0.05, line: rnd() < 0.04 }, rnd() < 0.3);
        const g = r.gun, c = g.cylinder;
        const leadIn = c.filter((x) => x === 'lead').length, lineIn = c.filter((x) => x === 'line').length;
        const firedLead = r.shots().filter((s) => s.payload.ammo === 'lead_round').length, firedLine = r.shots().filter((s) => s.payload.ammo === 'line_round').length;
        expect(g.reserve).toBeGreaterThanOrEqual(0);
        expect(g.reserve).toBeLessThanOrEqual(WEAPON.reserveCap);
        expect(g.lineRounds).toBeGreaterThanOrEqual(0);
        expect(g.lineRounds + lineIn).toBeLessThanOrEqual(WEAPON.lineRoundCap);
        expect(lineIn).toBeLessThanOrEqual(1);
        expect(g.discarded).toBe(0);
        expect(leadIn + g.reserve + g.spare + firedLead, `seed ${seed} tick ${i}: lead`).toBe(givenLead);
        if (g.spare > 0) expect(g.reserve, 'rounds are in hand only while the reserve is full').toBe(WEAPON.reserveCap);
        expect(lineIn + g.lineRounds + firedLine, `seed ${seed} tick ${i}: line`).toBe(givenLine);
        if (g.chambered > 0 && g.phase === 'ready') expect(c[0], `seed ${seed} tick ${i}: never an empty chamber under the hammer`).not.toBe('empty');
        expect(g.shotsFired).toBe(r.shots().length);
      }
    }
  });
  it('500 seeded sequences around the kept round: it is always on her, under the hammer, or spent by a legal fire', () => {
    let fired = 0;
    for (let seed = 1; seed <= 500; seed++) {
      const rnd = prng(seed * 7919);
      const r = new Rig();
      r.gun.giveLineRounds(2);
      let legalFire = false;
      for (let i = 0; i < 900; i++) {
        const a = rnd();
        if (a < 0.03) r.gun.setKeptContext(rnd() < 0.7 ? MARK : null);
        if (a > 0.97) r.off = !r.off;
        if (a > 0.5 && a < 0.53) r.aimLegal = !r.aimLegal;
        if (a > 0.6 && a < 0.602) r.gun.restore(JSON.parse(JSON.stringify(r.gun.capture(50))) as PlayerSave);   // a death and restore
        if (a > 0.7 && a < 0.702) r.gun.chargeRequired();
        r.input.enabled = rnd() > 0.05;
        const n = r.log.length;
        r.step({ fire: rnd() < 0.1, reload: rnd() < 0.05, line: rnd() < 0.05, kept: rnd() < 0.06 }, rnd() < 0.2);
        for (let k = n; k < r.log.length; k++) {
          const e = r.log[k] as Logged;
          if (e.name === 'SHOT' && e.payload.ammo === 'kept_round') {
            expect(r.aimLegal, `seed ${seed}: fired only with a legal aim`).toBe(true);
            legalFire = true; fired++;
          }
        }
        const g = r.gun, has = g.cylinder.includes('kept');
        expect(g.cylinder.indexOf('kept') <= 0, `seed ${seed}: only ever under the hammer`).toBe(true);
        expect(has, `seed ${seed} tick ${i}: chambered <=> a kept round in the cylinder (${g.seventh})`).toBe(g.seventh === 'chambered');
        if (g.seventh === 'spent') expect(legalFire, `seed ${seed} tick ${i}: spent only by a legal fire`).toBe(true);
        else expect(['sealed', 'pulse', 'band_broken', 'chambered'], `seed ${seed} tick ${i}`).toContain(g.seventh);
        if (legalFire) expect(g.seventh).toBe('spent');
      }
    }
    expect(fired).toBeGreaterThan(20);
  });
});
