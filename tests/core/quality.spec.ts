import { describe, expect, it } from 'vitest';
import type { GameEvents, RenderTier, RunFlags } from '../../src/core/contracts.ts';
import { createGameData } from '../../src/core/data.ts';
import { EventBusImpl } from '../../src/core/events.ts';
import { MemoryStorage, OptionsStoreImpl } from '../../src/core/options.ts';
import { PerfMonitorImpl } from '../../src/core/perf.ts';
import { OPEN_FRAMES, OPEN_SETTLE, QualityManagerImpl, TIER_KEY, classifyRenderer, featuresOf, tierFromBenchmark } from '../../src/core/quality.ts';
import { parseRunFlags, parseUrlExtras } from '../../src/core/context.ts';

const data = createGameData({ strict: true });

function make(search: string, stored: Record<string, string> = {}, dpr = 1): { q: QualityManagerImpl; changes: GameEvents['quality/changed'][]; storage: MemoryStorage; options: OptionsStoreImpl } {
  const flags: RunFlags = parseRunFlags(search, false);
  const events = new EventBusImpl();
  const storage = new MemoryStorage();
  for (const [k, v] of Object.entries(stored)) storage.setItem(k, v);
  const options = new OptionsStoreImpl(storage, events);
  const changes: GameEvents['quality/changed'][] = [];
  events.on('quality/changed', (e) => changes.push({ ...e }));
  const q = new QualityManagerImpl({ flags, manifest: data.manifest, options, events, storage, devicePixelRatio: () => dpr });
  events.on('options/changed', (e) => q.onOptionChanged(e.key));
  return { q, changes, storage, options };
}
const feed = (q: QualityManagerImpl, ms: number, frames: number): void => { for (let i = 0; i < frames; i++) q.onFrameTime(ms); };
/**
 * Release pass p0: every session opens with OPEN_SETTLE + OPEN_FRAMES frames at the minimum ratio (drawn under the
 * canvas's fade from black) and then returns to the full ratio. The two events of that look, checked and taken off.
 */
function afterOpening<T>(changes: readonly T[], ratioOf: (c: T) => number, min = 0.5, max = 1): T[] {
  if (changes.length < 2) throw new Error(`the opening look made ${changes.length} changes, not 2`);
  expect([ratioOf(changes[0] as T), ratioOf(changes[1] as T)]).toEqual([min, max]);
  return changes.slice(2);
}

describe('URL parameters (11.1)', () => {
  it('parse into RunFlags and the extras', () => {
    expect(parseRunFlags('', false)).toEqual({ test: false, dev: false, seed: 1, tierOverride: null, startCheckpoint: null, sandbox: null });
    expect(parseRunFlags('?test=1&tier=min&seed=42&cp=cp_rim', false)).toEqual({ test: true, dev: false, seed: 42, tierOverride: 'min', startCheckpoint: 'cp_rim', sandbox: null });
    expect(parseRunFlags('?debug=1&tier=ultra&seed=x', false).dev).toBe(true);
    expect(parseRunFlags('?tier=ultra&seed=x', true, 'player')).toEqual({ test: false, dev: true, seed: 1, tierOverride: null, startCheckpoint: null, sandbox: 'player' });
    // ?cp= and ?autostart=1 are development facilities: a public page (no dev server, no ?test=1, no ?debug=1) ignores them
    expect(parseRunFlags('?cp=cp_boss_p2', false).startCheckpoint).toBeNull();
    expect(parseRunFlags('?cp=cp_boss_p2&debug=1', false).startCheckpoint).toBe('cp_boss_p2');
    expect(parseRunFlags('?cp=cp_boss_p2', true).startCheckpoint).toBe('cp_boss_p2');
    expect(parseUrlExtras('?autostart=1', false).autostart).toBe(false);
    const x = parseUrlExtras('?autostart=1&perf=1&persist=1&scene=vfx');
    expect([x.autostart, x.perf, x.persist, x.scene]).toEqual([true, true, true, 'vfx']);
  });
});

describe('QualityManager: which tier (8.5 steps 1 to 3, 7)', () => {
  it('test mode: no detection, no adaptation, ?tier= or low, ratio 1', () => {
    const { q, changes } = make('?test=1');
    expect([q.tier, q.pixelRatio]).toEqual(['low', 1]);
    q.detect('ANGLE (NVIDIA, GeForce RTX 4070)');
    q.applyBenchmark(0.1);
    q.setViewport(3840, 2160);
    feed(q, 60, 2000);
    expect([q.tier, q.pixelRatio]).toEqual(['low', 1]);
    expect(changes).toEqual([]);
    expect(make('?test=1&tier=high').q.tier).toBe('high');
    expect(make('?test=1&tier=min').q.tier).toBe('min');
  });
  it('the URL wins, then the option, then a stored demotion', () => {
    expect(make('?tier=high', { [TIER_KEY]: 'min' }).q.tier).toBe('high');
    expect(make('', { 'keepseven.options.v1': JSON.stringify({ graphics: 'high' }), [TIER_KEY]: 'min' }).q.tier).toBe('high');
    expect(make('', { [TIER_KEY]: 'min' }).q.tier).toBe('min');
    expect(make('').q.tier).toBe('low');
  });
  it('the renderer string: software, integrated and unknown are Low; discrete and Apple M are High', () => {
    expect(classifyRenderer('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)')).toMatchObject({ tier: 'low', software: true });
    expect(classifyRenderer('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)').tier).toBe('low');
    expect(classifyRenderer('ANGLE (Intel, Intel(R) Iris(R) Xe Graphics)').tier).toBe('low');
    expect(classifyRenderer('').tier).toBe('low');
    expect(classifyRenderer('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11)').tier).toBe('high');
    expect(classifyRenderer('ANGLE (AMD, Radeon RX 6600 XT)').tier).toBe('high');
    expect(classifyRenderer('Apple M2').tier).toBe('high');
    const { q, changes } = make('');
    q.detect('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11)');
    expect(q.tier).toBe('high');
    expect(changes.at(-1)).toMatchObject({ tier: 'high', reason: 'detect' });
  });
  it('the benchmark moves the guess one step: under 0.6 ms High, over 4 ms min, else Low', () => {
    expect(tierFromBenchmark('low', 0.3)).toBe('high');
    expect(tierFromBenchmark('low', 2)).toBe('low');
    expect(tierFromBenchmark('low', 5)).toBe('min');
    expect(tierFromBenchmark('high', 5)).toBe('low');             // one step only
    expect(tierFromBenchmark('high', 2)).toBe('low');
    const { q } = make('');
    q.detect('ANGLE (Intel, Intel(R) UHD Graphics 620)');
    q.applyBenchmark(6);
    expect(q.tier).toBe('min');
    const soft = make('');
    soft.q.detect('SwiftShader');
    soft.q.applyBenchmark(9);
    expect(soft.q.tier).toBe('low');                               // software stays Low: its timings mean nothing
  });
  it('features come from assets.json tiers and the 8.2 matrix', () => {
    const t = data.manifest.tiers;
    expect(featuresOf('min', t.min)).toMatchObject({ composer: false, bloom: false, antialias: 'context_msaa', haloScale: 1, bladeCards: 2, heatShimmer: false, maxPixelRatio: 1, minPixelRatio: 0.5, maxBufferHeight: 648, additiveOverdrawCap: 1 });
    expect(featuresOf('low', t.low)).toMatchObject({ composer: true, bloom: false, antialias: 'none', sunShadowMap: false, maxBufferHeight: 768, maxBufferPixels: 1366 * 768 });
    expect(featuresOf('high', t.high)).toMatchObject({ composer: true, bloom: true, antialias: 'fxaa', sunShadowMap: true, haloScale: 0.5, bladeCards: 3, heatShimmer: true, sandSparkle: true, enamelFresnel: true, maxPixelRatio: 1.5, minPixelRatio: 0.7, additiveOverdrawCap: 1.5 });
  });
});

describe('QualityManager: adaptive pixel ratio and demotion (8.5 steps 4 to 6)', () => {
  it('clamps the ratio so the drawing buffer stays inside the tier\'s caps', () => {
    const { q } = make('?tier=low');
    q.setViewport(1280, 720);
    expect(q.pixelRatio).toBe(1);
    q.setViewport(1920, 1080);
    expect(q.pixelRatio).toBeCloseTo(768 / 1080, 6);               // Low: at most 1366 x 768
    q.setViewport(3440, 1440);
    expect(3440 * 1440 * q.pixelRatio * q.pixelRatio).toBeLessThanOrEqual(1366 * 768 + 1);   // an ultrawide is limited by pixel count
    const high = make('?tier=high', {}, 2);
    high.q.setViewport(1280, 720);
    expect(high.q.pixelRatio).toBeCloseTo(1.5, 6);                 // min(devicePixelRatio, 1.5)
    high.q.setViewport(2560, 1440);
    expect(high.q.pixelRatio).toBeCloseTo(0.75, 6);                // 1920 x 1080 at most
  });
  it('options.resolutionScale scales the upper bound', () => {
    const { q, options } = make('?tier=low');
    q.setViewport(1280, 720);
    options.set('resolutionScale', 0.7);
    expect(q.pixelRatio).toBeCloseTo(0.7, 6);
  });
  it('the allowance grows again: 960x540 -> 1920x1080 -> 960x540 ends at ratio 1 with no frame-time samples', () => {
    const { q, changes } = make('?tier=low');
    q.setViewport(960, 540);
    expect(q.pixelRatio).toBe(1);
    q.setViewport(1920, 1080);                                     // fullscreen: capped at 1366 x 768
    expect(q.pixelRatio).toBeCloseTo(768 / 1080, 6);
    q.setViewport(960, 540);                                       // fullscreen left
    expect(q.pixelRatio).toBe(1);
    expect(changes.map((c) => c.reason)).toEqual(['adaptive', 'adaptive']);
    expect(changes.at(-1)).toMatchObject({ tier: 'low', pixelRatio: 1 });
    // and it can still be probed upward afterwards: the ceiling followed
    feed(q, 16.7, 600);
    expect(q.pixelRatio).toBe(1);
  });
  it('resolutionScale 1 -> 0.5 -> 1 ends at ratio 1 with no frame-time samples', () => {
    const { q, options } = make('?tier=low');
    q.setViewport(960, 540);
    options.set('resolutionScale', 0.5);
    expect(q.pixelRatio).toBeCloseTo(0.5, 6);
    options.set('resolutionScale', 1);
    expect(q.pixelRatio).toBe(1);
    const high = make('?tier=high', {}, 2);
    high.q.setViewport(1280, 720);
    high.options.set('resolutionScale', 0.5);
    expect(high.q.pixelRatio).toBeCloseTo(0.75, 6);
    high.options.set('resolutionScale', 1);
    expect(high.q.pixelRatio).toBeCloseTo(1.5, 6);
  });
  it('a ratio the controller lowered under load is not raised by a resize; it probes up to the new allowance later', () => {
    const { q } = make('?tier=low');
    q.setViewport(1920, 1080);
    feed(q, 16.7, 100);
    feed(q, 30, 200);                                              // load: the controller backs off and holds a ceiling
    const lowered = q.pixelRatio;
    expect(lowered).toBeLessThan(768 / 1080 - 0.05);
    q.setViewport(960, 540);
    expect(q.pixelRatio).toBeCloseTo(lowered, 6);                  // the back-off survives the resize
    q.setViewport(1920, 1080);
    expect(q.pixelRatio).toBeCloseTo(lowered, 6);
    q.setViewport(960, 540);
    feed(q, 16.7, 40000);                                          // the load is gone: up to the NEW allowance, not the old cap
    expect(q.pixelRatio).toBe(1);
  });
  it('drops proportionally in 0.1 steps when over by 15 %, cools down 30 frames, and probes up after 180 good frames', () => {
    const { q, changes } = make('?tier=low');
    q.setViewport(1280, 720);
    feed(q, 16.7, 60);                                             // the warm-up cooldown
    expect(q.pixelRatio).toBe(1);
    let frames = 0;
    while (q.pixelRatio === 1 && frames++ < 200) q.onFrameTime(33.3);
    expect(frames).toBeLessThan(30);                               // the EMA crosses 16.7 x 1.15 within a few frames
    const dropped = q.pixelRatio;
    expect(dropped).toBeLessThan(1);
    expect(dropped).toBeGreaterThanOrEqual(0.5);
    expect(Math.abs(dropped * 10 - Math.round(dropped * 10))).toBeLessThan(1e-6);   // on the 0.1 grid
    expect(changes.at(-1)).toMatchObject({ tier: 'low', reason: 'adaptive' });
    const n = changes.length;
    feed(q, 33.3, 29);
    expect(changes.length).toBe(n);                                // inside the 30-frame cooldown nothing moves
    feed(q, 33.3, 60);
    expect(q.pixelRatio).toBeLessThan(dropped);                    // still over: it drops again
    const low = q.pixelRatio;
    feed(q, 16.0, 150);
    expect(q.pixelRatio).toBe(low);                                // not before 180 good frames
    feed(q, 16.0, 8000);
    expect(q.pixelRatio).toBeGreaterThan(low);                     // it probes back up, a step at a time, once the back-off ends
  });
  it('at the minimum and still over for 15 s: High -> Low -> min; min has nowhere to go, and that is stored', () => {
    const { q, changes, storage } = make('?tier=high');
    q.setViewport(1280, 720);
    feed(q, 100, 3000);
    expect(q.tier).toBe('min');
    expect(changes.filter((c) => c.reason === 'demote').map((c) => c.tier)).toEqual(['low', 'min']);
    expect(storage.getItem(TIER_KEY)).toBe('min');
    expect(q.pixelRatio).toBeCloseTo(0.5, 6);
    feed(q, 100, 1000);
    expect(q.tier).toBe('min');
    expect(q.starved).toBe(true);
    // choosing a tier explicitly clears the stored demotion
    q.setTier('low', 'user');
    expect(storage.getItem(TIER_KEY)).toBeNull();
    expect(q.tier).toBe('low');
    expect(q.starved).toBe(false);
  });
  it('a hitch (a frame over 250 ms) is ignored', () => {
    const { q } = make('?tier=low');
    q.setViewport(1280, 720);
    feed(q, 16.7, 100);
    feed(q, 900, 50);
    expect(q.pixelRatio).toBe(1);
  });
});

describe('QualityManager: the display\'s own frame interval is the target (8.5 step 4)', () => {
  /** frames whose length depends on the ratio in use: a fill-limited GPU on a display that presents every `vsync` ms */
  const feedLoad = (q: QualityManagerImpl, frames: number, vsync: number, msAtRatio1: number): void => {
    for (let i = 0; i < frames; i++) {
      const cost = msAtRatio1 * q.pixelRatio * q.pixelRatio;
      q.onFrameTime(Math.max(1, Math.ceil(cost / vsync - 1e-9)) * vsync);
    }
  };
  for (const [name, ms] of [['50 Hz', 20.0], ['48 Hz', 20.83], ['a 30 fps cap', 33.33]] as const) {
    it(`a steady ${ms} ms (${name}) on an idle GPU: Low stays Low at full resolution and nothing is stored`, () => {
      const { q, changes, storage } = make('');
      q.detect('ANGLE (Intel, Intel(R) UHD Graphics 620)');
      q.setViewport(1280, 720);
      feed(q, ms, 60 * 90);                                        // a minute and a half
      expect([q.tier, q.pixelRatio, q.starved]).toEqual(['low', 1, false]);
      expect(storage.getItem(TIER_KEY)).toBeNull();
      expect(changes.filter((c) => c.reason === 'demote')).toEqual([]);
      expect(q.targetMs).toBeCloseTo(ms, 1);
      // and it still adapts against that interval: twice the display interval is over budget
      feed(q, ms * 2, 200);
      expect(q.pixelRatio).toBeLessThan(1);
    });
  }
  it('High at 50 Hz stays High', () => {
    const { q, storage } = make('?tier=high', {}, 2);
    q.setViewport(1280, 720);
    feed(q, 20, 60 * 60);
    expect([q.tier, q.pixelRatio]).toEqual(['high', 1.5]);
    expect(storage.getItem(TIER_KEY)).toBeNull();
  });
  it('one 50 ms frame every 10 s at 60 Hz costs nothing; neither do two in a row', () => {
    const { q, changes } = make('?tier=low');
    q.setViewport(1280, 720);
    for (let s = 0; s < 12; s++) { feed(q, 16.67, 599); q.onFrameTime(50); }
    for (let s = 0; s < 6; s++) { feed(q, 16.67, 598); q.onFrameTime(50); q.onFrameTime(48); }
    expect(q.pixelRatio).toBe(1);
    expect(afterOpening(changes, (c) => c.pixelRatio)).toEqual([]);
  });
  it('a 60 Hz display under load at the title is not mistaken for a 30 Hz display', () => {
    const { q } = make('?tier=low');
    q.setViewport(1280, 720);
    // 24 ms of GPU work at ratio 1 misses every other vsync (a steady 33.3 ms); at ratio 0.8 it fits in one
    feedLoad(q, 2400, 16.67, 24);
    expect(q.targetMs).toBeCloseTo(16.7, 1);
    expect(q.pixelRatio).toBeLessThan(1);
    expect(q.pixelRatio).toBeGreaterThanOrEqual(0.5);
    expect(q.tier).toBe('low');
  });
  it('a calibration spoiled by a janky first second recovers: 50 Hz seen later is adopted, not punished', () => {
    const { q, storage } = make('?tier=low');
    q.setViewport(1280, 720);
    for (let i = 0; i < 60; i++) q.onFrameTime(i % 2 ? 41 : 23);      // no cadence at all
    expect(q.targetMs).toBeCloseTo(16.7, 1);
    feed(q, 20, 60 * 60);
    expect(q.targetMs).toBeCloseTo(20, 1);
    expect([q.tier, q.pixelRatio, q.starved]).toEqual(['low', 1, false]);
    expect(storage.getItem(TIER_KEY)).toBeNull();
  });
  it('a frame cap that arrives in mid-session (60 Hz seen, then a steady 33.3 ms) ends at full quality and is never stored', () => {
    const { q, storage } = make('');
    q.detect('ANGLE (Intel, Intel(R) UHD Graphics 620)');
    q.setViewport(1280, 720);
    feed(q, 16.67, 600);
    feed(q, 33.33, 60 * 120);
    expect([q.tier, q.pixelRatio, q.starved]).toEqual(['low', 1, false]);
    expect(q.targetMs).toBeCloseTo(33.3, 1);
    expect(storage.getItem(TIER_KEY)).toBeNull();
    // the cap goes away: the faster cadence is taken up again
    feed(q, 16.67, 600);
    expect(q.targetMs).toBeCloseTo(16.7, 1);
  });
  it('real starvation is still demoted and stored: an irregular 40 to 60 ms at every ratio', () => {
    const { q, storage } = make('');
    q.detect('ANGLE (Intel, Intel(R) UHD Graphics 620)');
    q.setViewport(1280, 720);
    for (let i = 0; i < 3000; i++) q.onFrameTime(40 + ((i * 7) % 21));
    expect(q.tier).toBe('min');
    expect(storage.getItem(TIER_KEY)).toBe('min');
    expect(q.starved).toBe(true);
  });
  it('a successful probe upward resets the back-off: hitch storms minutes apart do not ratchet the ceiling', () => {
    const { q } = make('?tier=low');
    q.setViewport(1280, 720);
    feed(q, 16.67, 60);
    for (let round = 0; round < 6; round++) {
      feed(q, 50, 12);                                             // a storm: a real overload for a fifth of a second
      feed(q, 16.67, 60 * 75);                                     // then 75 s of good frames
      expect(q.pixelRatio, `round ${round}`).toBe(1);
    }
  });
});

/** Frames for `seconds` of session time; the frame time is a function of the tier and ratio the manager chose. */
function drive(q: QualityManagerImpl, seconds: number, msOf: (tier: RenderTier, ratio: number, i: number) => number): void {
  let t = 0, i = 0;
  while (t < seconds) { const ms = msOf(q.tier, q.pixelRatio, i++); q.onFrameTime(ms); t += ms / 1000; }
}
const STALL = (_t: RenderTier, _r: number, i: number): number => 40 + ((i * 7) % 21);       // irregular: load, not a display
const FINE = (): number => 16.67;

describe('QualityManager: a demotion is not for ever (polish round 2)', () => {
  function auto(stored: Record<string, string> = {}): ReturnType<typeof make> {
    const m = make('', stored);
    m.q.detect('ANGLE (Intel, Intel(R) UHD Graphics 620)');
    m.q.setViewport(1280, 720);
    return m;
  }
  it('one 8 s stall of the machine: the ratio gives way and comes back; no demotion, nothing stored', () => {
    const { q, changes, storage } = auto();
    drive(q, 20, FINE);
    drive(q, 8, STALL);
    expect(q.tier).toBe('low');
    expect(q.pixelRatio).toBeLessThan(1);
    drive(q, 240, FINE);
    expect([q.tier, q.pixelRatio, q.starved]).toEqual(['low', 1, false]);
    expect(changes.filter((c) => c.reason === 'demote')).toEqual([]);
    expect(storage.getItem(TIER_KEY)).toBeNull();
  });
  it('a 25 s stall demotes to min without storing it; a minute of good frames later Low is back, and stays', () => {
    const { q, changes, storage } = auto();
    drive(q, 20, FINE);
    drive(q, 25, STALL);
    expect(q.tier).toBe('min');
    expect(storage.getItem(TIER_KEY)).toBeNull();
    drive(q, 400, FINE);
    expect([q.tier, q.pixelRatio]).toEqual(['low', 1]);
    expect(changes.filter((c) => c.tier === 'low' && c.reason === 'detect').length).toBe(1);
    expect(storage.getItem(TIER_KEY)).toBeNull();
  });
  it('a stall long enough to starve min is stored, and the stored demotion is cleared once Low has held again', () => {
    const { q, storage } = auto();
    drive(q, 20, FINE);
    drive(q, 90, STALL);
    expect([q.tier, q.starved]).toEqual(['min', true]);
    expect(storage.getItem(TIER_KEY)).toBe('min');
    drive(q, 600, FINE);
    expect([q.tier, q.pixelRatio, q.starved]).toEqual(['low', 1, false]);
    expect(storage.getItem(TIER_KEY)).toBeNull();
  });
  it('a machine that really needs min: three tries a session (60, 120, 240 s apart), stored after the first that fails', () => {
    const { q, changes, storage } = auto();
    const needsMin = (tier: RenderTier, _r: number, i: number): number => (tier === 'min' ? 16.67 : STALL(tier, 0, i));
    drive(q, 45, needsMin);
    expect(q.tier).toBe('min');
    expect(storage.getItem(TIER_KEY)).toBeNull();                  // the first demotion is not stored
    drive(q, 120, needsMin);                                       // 60 s on budget, Low tried, Low starves again
    expect(storage.getItem(TIER_KEY)).toBe('min');
    drive(q, 3600, needsMin);
    expect(q.tier).toBe('min');
    expect(changes.filter((c) => c.tier === 'low' && c.reason === 'detect').length).toBe(3);
    expect(changes.filter((c) => c.reason === 'demote').length).toBe(4);
    expect(storage.getItem(TIER_KEY)).toBe('min');
  });
  it('a stored demotion at boot is a hint: Low is tried once this session, and the store is cleared when it holds', () => {
    const { q, storage } = auto({ [TIER_KEY]: 'min' });
    expect(q.tier).toBe('min');
    drive(q, 50, FINE);
    expect(q.tier).toBe('min');
    drive(q, 30, FINE);
    expect(q.tier).toBe('low');
    expect(storage.getItem(TIER_KEY)).toBe('min');                 // not before the trial is over
    drive(q, 150, FINE);
    expect([q.tier, storage.getItem(TIER_KEY)]).toEqual(['low', null]);
    // and where min is needed: one try, then min for the session
    const b = auto({ [TIER_KEY]: 'min' });
    const needsMin = (tier: RenderTier, _r: number, i: number): number => (tier === 'min' ? 16.67 : STALL(tier, 0, i));
    drive(b.q, 3600, needsMin);
    expect(b.q.tier).toBe('min');
    expect(b.changes.filter((c) => c.tier === 'low' && c.reason === 'detect').length).toBe(1);
    expect(b.storage.getItem(TIER_KEY)).toBe('min');
  });
  it('min chosen by the URL or the user is never climbed out of', () => {
    const { q } = make('?tier=min');
    q.setViewport(1280, 720);
    drive(q, 600, FINE);
    expect(q.tier).toBe('min');
  });
  it('a frame that just misses vsync costs at most two steps a decision, not 0.9 -> 0.6', () => {
    const { q, changes } = make('?tier=low');
    q.setViewport(1280, 720);
    feed(q, 16.67, 120);
    const before = changes.length;
    feed(q, 33.33, 20);
    const first = changes[before] as GameEvents['quality/changed'];
    expect(first.pixelRatio).toBeGreaterThanOrEqual(0.8 - 1e-9);
    expect(first.pixelRatio).toBeLessThan(1);
  });
  it('no dead band: a steady 18 ms (8 % over, no vsync quantisation) gives one step after two seconds', () => {
    const { q } = make('?tier=low');
    q.setViewport(1280, 720);
    feed(q, 16.67, 120);
    feed(q, 18, 100);
    expect(q.pixelRatio).toBe(1);
    feed(q, 18, 80);
    expect(q.pixelRatio).toBeCloseTo(0.9, 6);
    // 17.2 ms (3 % over) is on budget
    const b = make('?tier=low');
    b.q.setViewport(1280, 720);
    feed(b.q, 17.2, 2000);
    expect(b.q.pixelRatio).toBe(1);
  });
});

describe('QualityManager: the penalty does not outlast the cause (polish round 3)', () => {
  // the performance critic's display model (scratch/r3-performance/quality_sim*.ts): a 60 Hz vsync display, the frame is
  // cpu + gpu x tier cost x ratio^2 (+ a spike), rounded up to whole refresh intervals
  const COST: Record<string, number> = { min: 0.75, low: 1, high: 1.6 };
  function model(o: { gpu: number; seconds: number; spike?: (t: number) => number; held?: (t: number) => boolean }): { q: QualityManagerImpl; changes: { t: number; tier: string; ratio: number }[]; storage: MemoryStorage; lastMs: number } {
    const m = make('');
    m.q.detect('ANGLE (Intel, Intel(R) HD Graphics 620 Direct3D11 vs_5_0 ps_5_0)');
    m.q.setViewport(1280, 720);
    const iv = 1000 / 60, changes: { t: number; tier: string; ratio: number }[] = [];
    let t = 0, seen = m.changes.length, lastMs = 0;
    while (t < o.seconds) {
      const work = 3 + o.gpu * (COST[m.q.tier] as number) * m.q.pixelRatio * m.q.pixelRatio + (o.spike ? o.spike(t) : 0);
      const ms = Math.max(1, Math.ceil(work / iv - 1e-9)) * iv;
      if (o.held && o.held(t)) m.q.hold(2);
      m.q.onFrameTime(ms);
      t += ms / 1000; lastMs = ms;
      for (; seen < m.changes.length; seen++) { const c = m.changes[seen] as GameEvents['quality/changed']; changes.push({ t, tier: c.tier, ratio: c.pixelRatio }); }
    }
    return { q: m.q, changes, storage: m.storage, lastMs };
  }
  const backAt = (changes: { t: number; ratio: number }[]): number => { const last = changes[changes.length - 1]; return last && last.ratio > 1 - 1e-6 ? last.t : Infinity; };
  it('J: a 2 s stall of +20 ms a frame: back at ratio 1 within 20 s of its end (it was two minutes)', () => {
    const r = model({ gpu: 8, seconds: 120, spike: (t) => (t > 60 && t < 62 ? 20 : 0) });
    expect(Math.min(...r.changes.map((c) => c.ratio))).toBeLessThan(0.8);
    expect(backAt(r.changes)).toBeLessThan(62 + 20);
    expect([r.q.tier, r.q.pixelRatio]).toEqual(['low', 1]);
    expect(r.storage.getItem(TIER_KEY)).toBeNull();
  });
  it('S: a 1 s stall: back at ratio 1 within 20 s (it was a minute)', () => {
    const r = model({ gpu: 8, seconds: 120, spike: (t) => (t > 60 && t < 61 ? 20 : 0) });
    expect(backAt(r.changes)).toBeLessThan(61 + 20);
    expect(r.q.pixelRatio).toBe(1);
  });
  it('T: three 120 ms frames in a row (program links at a set swap): one step at most, back within 20 s (it was 30 s at 0.9)', () => {
    const r = model({ gpu: 8, seconds: 120, spike: (t) => (t > 60 && t < 60.3 ? 110 : 0) });
    const later = afterOpening(r.changes, (c) => c.ratio);
    expect(Math.min(1, ...later.map((c) => c.ratio))).toBeGreaterThanOrEqual(0.9 - 1e-9);
    expect(later.length === 0 || backAt(later) < 60.3 + 20).toBe(true);
    expect(r.q.pixelRatio).toBe(1);
  });
  it('a failed probe upward still earns the long back-off: real load is not probed every five seconds', () => {
    // 3 + 17 ms: 1.0 misses vsync, 0.8 holds. After the descent the probes to 0.9 fail, each further apart than the last.
    const r = model({ gpu: 17, seconds: 300 });
    const probes = r.changes.filter((c) => Math.abs(c.ratio - 0.9) < 1e-6).map((c) => c.t);      // each try of 0.9, where 0.8 holds
    expect(probes.length).toBeGreaterThanOrEqual(3);
    expect(probes.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < probes.length; i++) expect((probes[i] as number) - (probes[i - 1] as number)).toBeGreaterThan(25);
    expect(r.q.pixelRatio).toBeCloseTo(0.8, 6);
  });
  it('P: too weak for Low at its minimum ratio (a steady 33.3 ms): min is tried before 30 fps is taken for the display, and holds 60', () => {
    const r = model({ gpu: 60, seconds: 300 });
    expect(r.q.tier).toBe('min');
    expect(r.q.targetMs).toBeCloseTo(16.7, 1);
    expect(r.lastMs).toBeCloseTo(1000 / 60, 3);
    expect(r.q.starved).toBe(false);
  });
  it('a 30 Hz cap that arrives in mid-session is still the display: the look at the tier below is undone', () => {
    const m = make('');
    m.q.detect('ANGLE (Intel, Intel(R) HD Graphics 620)');
    m.q.setViewport(1280, 720);
    feed(m.q, 16.67, 300);
    feed(m.q, 33.33, 4000);
    expect([m.q.tier, m.q.pixelRatio]).toEqual(['low', 1]);
    expect(m.q.targetMs).toBeCloseTo(33.3, 1);
    expect(m.storage.getItem(TIER_KEY)).toBeNull();
  });
  it('held frames (not playing; a set or a staged zone just built) never reach the controller', () => {
    // a ten-second loading screen at +40 ms a frame in the middle of play: nothing changes
    const r = model({ gpu: 8, seconds: 120, spike: (t) => (t > 60 && t < 70 ? 40 : 0), held: (t) => t > 59.9 && t < 70.1 });
    expect(afterOpening(r.changes, (c) => c.ratio)).toEqual([]);
    expect(r.q.pixelRatio).toBe(1);
  });
});

describe('QualityManager: the opening look (release pass p0)', () => {
  const OPEN = OPEN_SETTLE + OPEN_FRAMES;
  /** a vsync display of `hz`, the frame cpu + gpu x ratio^2 rounded up to whole refresh intervals; -> every change with its time */
  function open(o: { hz: number; cpu: number; gpu: number; seconds: number }): { q: QualityManagerImpl; changes: { t: number; ratio: number; frame: number }[] } {
    const m = make('');
    m.q.detect('ANGLE (Intel, Intel(R) HD Graphics 620 Direct3D11 vs_5_0 ps_5_0)');
    m.q.setViewport(1280, 720);
    const iv = 1000 / o.hz, changes: { t: number; ratio: number; frame: number }[] = [];
    let t = 0, seen = m.changes.length, frame = 0;
    while (t < o.seconds) {
      const work = o.cpu + o.gpu * m.q.pixelRatio * m.q.pixelRatio;
      const ms = Math.max(1, Math.ceil(work / iv - 1e-9)) * iv;
      m.q.onFrameTime(ms);
      t += ms / 1000; frame++;
      for (; seen < m.changes.length; seen++) changes.push({ t, ratio: (m.changes[seen] as GameEvents['quality/changed']).pixelRatio, frame });
    }
    return { q: m.q, changes };
  }
  it('nothing moves before the first frame; the first frames are at the minimum ratio, then the full ratio is back', () => {
    const m = make('');
    m.q.setViewport(1280, 720);
    expect(m.q.pixelRatio).toBe(1);
    expect(m.changes).toEqual([]);
    m.q.onFrameTime(16.67);
    expect(m.q.pixelRatio).toBe(0.5);
    m.q.setViewport(1920, 1080);                                // a resize inside the look does not end it
    expect(m.q.pixelRatio).toBeLessThanOrEqual(0.5);
    m.q.setViewport(1280, 720);
    feed(m.q, 16.67, OPEN - 1);
    expect(m.q.pixelRatio).toBe(0.5);
    m.q.onFrameTime(16.67);
    expect(m.q.pixelRatio).toBe(1);
  });
  it('test mode has no opening look', () => {
    const m = make('?test=1');
    feed(m.q, 16.67, 200);
    expect(m.changes).toEqual([]);
  });
  for (const [name, hz, cpu, gpu] of [['a 30 Hz cap on an idle GPU', 30, 2, 5], ['CPU-bound at 22 ms on a 60 Hz display', 60, 22, 2], ['a 50 Hz display', 50, 2, 5]] as const) {
    it(`${name}: the picture is at full resolution from frame ${OPEN + 1} on and never leaves it (it went to half for 50 frames two seconds in)`, () => {
      const r = open({ hz, cpu, gpu, seconds: 120 });
      expect(afterOpening(r.changes, (c) => c.ratio)).toEqual([]);
      expect((r.changes[1] as { frame: number }).frame).toBe(OPEN + 1);
      expect(r.q.pixelRatio).toBe(1);
      expect(r.q.targetMs).toBeGreaterThan(19);                 // the display's own interval is the budget
    });
  }
  it('fill-bound (3 + 17 ms: 1.0 misses vsync, 0.8 holds): down from the top to 0.8 within 3 s, never below it (it went to 0.5 and climbed for 15 s)', () => {
    const r = open({ hz: 60, cpu: 3, gpu: 17, seconds: 12 });
    const later = afterOpening(r.changes, (c) => c.ratio);
    expect(later.length).toBeGreaterThan(0);
    expect(Math.min(...later.map((c) => c.ratio))).toBeGreaterThanOrEqual(0.8 - 1e-9);
    expect((later[0] as { t: number }).t).toBeLessThan(3);
    expect(r.q.targetMs).toBeCloseTo(16.7, 1);
    expect(r.q.pixelRatio).toBeCloseTo(0.8, 6);
  });
  it('a janky opening (no cadence at the minimum ratio) falls back to the look after the first second', () => {
    const m = make('?tier=low');
    m.q.setViewport(1280, 720);
    for (let i = 0; i <= OPEN; i++) m.q.onFrameTime(i % 2 ? 41 : 23);
    expect(m.q.pixelRatio).toBe(1);
    feed(m.q, 33.33, 60);                                       // steady and slow at the full ratio: looked at once at the minimum
    expect(m.q.pixelRatio).toBe(0.5);
    feed(m.q, 33.33, 50);
    expect(m.q.pixelRatio).toBe(1);
    expect(m.q.targetMs).toBeCloseTo(33.3, 1);
  });
});

describe('PerfMonitor', () => {
  it('publishes the frame, keeps per-field maxima and a 120-frame history', () => {
    const p = new PerfMonitorImpl();
    p.scratch.drawCalls = 40; p.scratch.triangles = 9000; p.scratch.simMs = 0.5; p.scratch.updateMs = 0.25; p.scratch.renderMs = 1; p.scratch.cell = 'cell_street'; p.scratch.tier = 'high';
    p.systemAcc[2] = 0.4;
    p.endFrame();
    expect(p.last).toMatchObject({ drawCalls: 40, triangles: 9000, frameMs: 1.75, cell: 'cell_street', tier: 'high' satisfies RenderTier });
    expect(p.systemMs[2]).toBeCloseTo(0.4, 6);
    expect(p.systemAcc[2]).toBe(0);
    p.scratch.drawCalls = 10; p.scratch.simMs = 0.1;
    p.endFrame();
    expect(p.last.drawCalls).toBe(10);
    expect(p.peak.drawCalls).toBe(40);
    expect(p.peak.frameMs).toBe(1.75);
    expect(p.frames).toBe(2);
    p.resetPeak();
    expect(p.peak.drawCalls).toBe(0);
    expect(Array.from(p.history.slice(0, 2))[0]).toBeCloseTo(1.75, 5);
  });
});
