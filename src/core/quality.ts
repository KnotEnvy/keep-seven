// Tier detection and the adaptive resolution controller (ARCHITECTURE 8.2, 8.5).
// The controller holds the game to the display's own frame interval, not to a fixed 16.7 ms: a 50 Hz panel or a 30 fps
// battery-saver cap presents an idle GPU's frames 20 or 33.3 ms apart, and reading that as load would walk the game down
// to the smallest picture and store the demotion (docs/requests/foundation-core.md, section 1 row 9).
import type {
  AssetManifest, EventBus, GameEvents, OptionsStore, QualityFeatures, QualityManager, RenderTier, RunFlags, TierDef,
} from './contracts.ts';
import type { KeyValueStorage } from './options.ts';

export const TIER_KEY = 'keepseven.tier.v1';
/** The 60 Hz budget: the target is never tighter than this, whatever the display can do. */
const BASE_MS = 16.7;
/** Display intervals slower than 60 Hz that are taken for a display's (or a frame cap's) own cadence: 50, 48, 30 Hz. */
const SLOW_CADENCES: readonly number[] = [1000 / 50, 1000 / 48, 1000 / 30];
/** frames in the cadence window, and in the first measurement after the loop starts (the title screen) */
const WINDOW = 60;
const VERIFY_SETTLE = 10;
const VERIFY_FRAMES = 40;
/**
 * Release pass p0: the opening look. The session's first frames (the title's backdrop coming up out of black: the loop
 * fades the canvas in over them) are drawn at the tier's MINIMUM ratio and their cadence is taken; the first second at
 * the full ratio is then compared with it. The same slow cadence at both ratios is the display's own (a 50 / 30 Hz
 * panel, a battery cap) or the CPU's, and it is adopted with the picture untouched; a faster cadence at the minimum is
 * load, and the controller steps down from the full ratio (at most two steps a decision) instead of from the bottom up.
 * Before, a steady slow first second sent the picture to half resolution for 50 frames two seconds in (1.6 s at 30 Hz),
 * and a fill-bound machine then spent 15 s climbing back from 0.5 to the 0.8 it could hold.
 */
export const OPEN_SETTLE = 3;
export const OPEN_FRAMES = 14;
const enum Mode { Fresh, Open, Measure, Verify, Run }
const STEP = 0.1;
/** At the minimum ratio and over budget this long before a tier is given up (was 5 s: one stall of the machine did it). */
export const STARVE_SECONDS = 15;
/** 'min' at its full ratio and on budget this long: the tier above is tried again (doubles after each failed try). */
export const PROMOTE_SECONDS = 60;
/** tries per session to climb back out of 'min'; a 'min' that came from storage gets one */
const PROMOTE_TRIES = 3;
/** frames a promotion must hold before it counts (two minutes at 60 Hz) */
const TRIAL_FRAMES = 7200;
/** 'min' on budget this long with no way back up: the demotion is worth remembering for the next session */
const STORE_SECONDS = 180;
/** frames a small overshoot (6 to 15 % over the target) must last before the ratio gives one step */
const MILD_FRAMES = 120;
/**
 * Polish round 3: frames the ceiling is held after an ordinary step down. The long, doubling back-off is for a probe
 * upward that FAILED (the load is still there); a descent caused by one stall of the machine used to lock the ratio
 * for 1 800, 3 600, 7 200 frames (three steps down in one descent: two minutes at 0.6 after a 2 s stall).
 */
const DESCENT_HOLD = 300;
/** frames a slower tier is looked at before a steady slow cadence is taken for the display's own (starve) */
const TIER_LOOK_FRAMES = 90;
const ORDER: readonly RenderTier[] = ['min', 'low', 'high'];
type Reason = GameEvents['quality/changed']['reason'];

/** Step 2 of 8.5: software, known integrated and unknown -> Low; known discrete or Apple M -> High. */
export function classifyRenderer(renderer: string): { tier: 'low' | 'high'; software: boolean; why: string } {
  const r = renderer.toLowerCase();
  if (/swiftshader|llvmpipe|softpipe|software|microsoft basic render/.test(r)) return { tier: 'low', software: true, why: 'software rasteriser' };
  if (/(rtx|gtx)\s?\d{3,4}|geforce (rtx|gtx)|radeon rx\s?\d{3,4}|radeon pro|quadro|arc\(tm\) a\d{3}|arc a\d{3}/.test(r)) return { tier: 'high', software: false, why: 'discrete GPU' };
  if (/apple m\d|apple gpu/.test(r)) return { tier: 'high', software: false, why: 'Apple silicon' };
  if (/iris|uhd graphics|hd graphics|radeon\(tm\) (graphics|vega)|radeon graphics|mali|adreno|powervr|videocore|intel/.test(r)) return { tier: 'low', software: false, why: 'integrated GPU' };
  return { tier: 'low', software: false, why: 'unknown renderer' };
}

/** Step 3: the benchmark may move the guess one step. Under 0.6 ms -> high; over 4 ms -> min; else low. */
export function tierFromBenchmark(guess: RenderTier, msPerPass: number): RenderTier {
  const want: RenderTier = msPerPass < 0.6 ? 'high' : msPerPass > 4 ? 'min' : 'low';
  const gi = ORDER.indexOf(guess), wi = ORDER.indexOf(want);
  return ORDER[gi + Math.max(-1, Math.min(1, wi - gi))] as RenderTier;
}

export function featuresOf(tier: RenderTier, def: TierDef): QualityFeatures {
  const high = tier === 'high';
  return {
    composer: def.composer, bloom: def.bloom, antialias: def.antialias, sunShadowMap: def.sunShadowMap,
    haloScale: high ? 0.5 : 1, heatShimmer: high, sandSparkle: high, enamelFresnel: high,
    bladeCards: high ? 3 : 2, particleScale: high ? 1 : 0.6,
    maxPixelRatio: def.maxPixelRatio, minPixelRatio: def.minPixelRatio,
    maxBufferHeight: def.maxBufferHeight, maxBufferPixels: def.maxBufferPixels,
    additiveOverdrawCap: high ? 1.5 : 1,
  };
}

export interface QualityDeps {
  flags: RunFlags;
  manifest: AssetManifest;
  options: OptionsStore;
  events: EventBus;
  storage: KeyValueStorage;
  devicePixelRatio: () => number;
}

export class QualityManagerImpl implements QualityManager {
  tier: RenderTier = 'low';
  features: QualityFeatures;
  pixelRatio = 1;
  /** true when 'min' was the tier at boot (the context may then have MSAA) */
  readonly bootTier: RenderTier;
  /** set when 'min' at its minimum ratio is still over budget: nowhere left to go (the overlay says so) */
  starved = false;
  private cssWidth = 960;
  private cssHeight = 540;
  private rendererString = '';
  private guess: RenderTier = 'low';
  // adaptive controller state (tech-web 8)
  private ema = 0;
  private cooldown = 0;
  private goodStreak = 0;
  private prevRatio = 0;
  private probing = false;
  private ceiling = 1;
  private ceilingFrames = 0;
  /** maxRatio() as it was when the ratio was last set against it: 'the ratio sits at its allowance' is measured against this */
  private allowance = 1;
  private backoff = 1800;
  private starvedSeconds = 0;
  // ---- the display's own frame interval (8.5 step 4): what "on budget" means on this screen
  private target = BASE_MS;
  private mode: Mode = Mode.Fresh;
  /** the cadence the opening look saw at the minimum ratio (0: none, or no opening look) */
  private openCadence = 0;
  private modeFrames = 0;
  private readonly win = new Float32Array(WINDOW);
  private readonly sorted = new Float32Array(WINDOW);
  private winCount = 0;
  private winAt = 0;
  private readonly recent = new Float32Array(5);
  private readonly five = new Float32Array(5);
  private recentAt = 0;
  private recentCount = 0;
  /** the fastest steady cadence seen this session: a slower one is then load or a cap, not what the display can do */
  private fastestSeen = Infinity;
  private fastRun = 0;
  private verifyRatio = 1;
  private verifyCadence = 0;
  /** the tier a demotion started from in this session, while it is not yet known whether demoting helped */
  private demotedFrom: RenderTier | null = null;
  private storePending = false;
  // ---- the way back up from 'min' (polish round 2: one 8 s stall used to cost the composer for good)
  /** the tier to try again from 'min'; null when 'min' was chosen (URL, user) or nothing was demoted */
  private promoteTo: RenderTier | null = null;
  private promoteWait = PROMOTE_SECONDS;
  private promoteTries = 0;
  private promoteGood = 0;
  private minGood = 0;
  /** frames left of a promotion's trial: a demotion inside it means 'min' really is this machine's tier */
  private trial = 0;
  private mildFrames = 0;
  /** frames still to be skipped (loop: not playing, or a set / zone has just been built): load-time stutter is not load */
  private held = 0;
  /** a slower tier is being looked at before a steady slow cadence is adopted as the display's (frames left; 0: no) */
  private tierLook = 0;
  private tierLookCadence = 0;
  private tierLookFrom: RenderTier = 'low';
  private tierLooked = false;
  private readonly payload: GameEvents['quality/changed'] = { tier: 'low', pixelRatio: 1, reason: 'detect' };

  constructor(private readonly deps: QualityDeps) {
    this.tier = this.initialTier();
    this.bootTier = this.tier;
    this.features = featuresOf(this.tier, this.def(this.tier));
    this.pixelRatio = this.maxRatio();
    this.ceiling = this.pixelRatio;
    this.allowance = this.pixelRatio;
    // a stored demotion is a hint, not a verdict: this session tries the tier above once (the stall that caused it may
    // have been a virus scan three weeks ago)
    if (this.tier === 'min' && this.auto() && this.storedDemotion()) { this.promoteTo = 'low'; this.promoteTries = PROMOTE_TRIES - 1; }
  }
  /** true when the tier is the manager's to choose: no URL override, not test mode, the option on 'auto' */
  private auto(): boolean {
    return !this.deps.flags.tierOverride && !this.deps.flags.test && this.deps.options.value.graphics === 'auto';
  }

  private def(tier: RenderTier): TierDef { return this.deps.manifest.tiers[tier]; }
  private storedDemotion(): boolean {
    try { return this.deps.storage.getItem(TIER_KEY) === 'min'; } catch { return false; }
  }
  /** Step 1 (and 7): URL, then the option, then a stored demotion; test mode is the URL tier or 'low'. */
  private initialTier(): RenderTier {
    const { flags, options } = this.deps;
    if (flags.tierOverride) return flags.tierOverride;
    if (flags.test) return 'low';
    const g = options.value.graphics;
    if (g === 'low' || g === 'high') return g;
    if (this.storedDemotion()) return 'min';
    return 'low';                                   // until detect() has a renderer string
  }
  private get fixed(): boolean { return this.deps.flags.test; }

  /** The largest ratio the tier, the option and the drawing-buffer caps allow for the current viewport. */
  private maxRatio(): number {
    if (this.fixed) return 1;
    const f = this.features;
    let r = Math.min(f.maxPixelRatio, Math.max(1, this.deps.devicePixelRatio()));
    if (this.tier !== 'high') r = Math.min(r, 1);
    r *= this.deps.options.value.resolutionScale;
    const h = Math.max(1, this.cssHeight), w = Math.max(1, this.cssWidth);
    r = Math.min(r, f.maxBufferHeight / h, Math.sqrt(f.maxBufferPixels / (w * h)));
    return Math.min(r, f.maxPixelRatio);
  }
  private minRatio(): number { return Math.min(this.features.minPixelRatio, this.maxRatio()); }

  private apply(tier: RenderTier, reason: Reason): void {
    const tierChanged = tier !== this.tier;
    this.tier = tier;
    this.features = featuresOf(tier, this.def(tier));
    const max = this.maxRatio();
    const ratio = tierChanged || this.pixelRatio > max ? max : Math.max(this.pixelRatio, this.minRatio());
    this.ceiling = max; this.allowance = max; this.ceilingFrames = 0; this.cooldown = 30; this.ema = 0; this.goodStreak = 0; this.probing = false;
    this.starvedSeconds = 0; this.starved = false; this.fastRun = 0;
    if (this.mode === Mode.Verify) { this.mode = Mode.Run; this.target = this.verifyCadence; }   // the look at the minimum ratio was cut short
    if (this.mode === Mode.Open) { this.mode = Mode.Measure; this.modeFrames = 0; this.openCadence = 0; }   // so was the opening look
    if (reason !== 'demote') { this.demotedFrom = null; this.storePending = false; this.promoteTo = null; this.trial = 0; }
    this.promoteGood = 0; this.minGood = 0; this.mildFrames = 0;
    this.pixelRatio = ratio;
    this.payload.tier = tier; this.payload.pixelRatio = ratio; this.payload.reason = reason;
    this.deps.events.emit('quality/changed', this.payload);
  }

  /** Step 2: called once the renderer exists (not in test mode). */
  detect(rendererString: string): void {
    this.rendererString = rendererString;
    this.guess = classifyRenderer(rendererString).tier;
    if (this.fixed || this.deps.flags.tierOverride) return;
    const g = this.deps.options.value.graphics;
    if (g !== 'auto' || this.storedDemotion()) return;
    if (this.guess !== this.tier) this.apply(this.guess, 'detect');
  }
  /** Step 3: the fill-rate benchmark behind the loading screen. */
  applyBenchmark(msPerPass: number): void {
    if (this.fixed || this.deps.flags.tierOverride) return;
    if (this.deps.options.value.graphics !== 'auto' || this.storedDemotion()) return;
    if (classifyRenderer(this.rendererString).software) return;
    const t = tierFromBenchmark(this.guess, msPerPass);
    if (t !== this.tier) this.apply(t, 'detect');
  }

  setTier(tier: RenderTier | 'auto', reason: Reason): void {
    if (tier === 'auto') {
      const stored = this.storedDemotion();
      this.apply(stored ? 'min' : this.guess, reason);
      if (stored) { this.promoteTo = 'low'; this.promoteTries = PROMOTE_TRIES - 1; this.promoteWait = PROMOTE_SECONDS; }
      return;
    }
    if (reason === 'user' && tier !== 'min') {
      try { this.deps.storage.removeItem(TIER_KEY); } catch { /* ignore */ }      // an explicit choice clears the demotion
    }
    this.apply(tier, reason);
  }
  /** The options menu changed `graphics` or `resolutionScale`. */
  onOptionChanged(key: string): void {
    if (this.fixed) return;
    if (key === 'graphics') {
      const g = this.deps.options.value.graphics;
      this.setTier(g === 'auto' ? 'auto' : g, 'user');
    } else if (key === 'resolutionScale') this.setViewport(this.cssWidth, this.cssHeight);
  }
  /** CSS size of the canvas: the pixel ratio is clamped so the drawing buffer stays inside the tier's caps. */
  setViewport(cssWidth: number, cssHeight: number): void {
    this.cssWidth = cssWidth; this.cssHeight = cssHeight;
    if (this.fixed) return;
    const max = this.maxRatio();
    let want = Math.min(Math.max(this.pixelRatio, this.minRatio()), max);
    if (this.ceilingFrames === 0) {
      // the controller is not holding the ratio down: the allowance may grow again (fullscreen left, the window shrunk,
      // the resolution slider raised). A ratio that sat at the old allowance follows the new one; a ratio the controller
      // had lowered stays, and probes upward against the new allowance.
      if (this.mode !== Mode.Verify && this.mode !== Mode.Open && this.pixelRatio >= this.allowance - 1e-3) want = max;
      this.ceiling = max;
    } else this.ceiling = Math.min(this.ceiling, max);       // a real back-off survives a resize
    this.allowance = max;
    if (Math.abs(want - this.pixelRatio) > 1e-6) {
      this.pixelRatio = want;
      this.payload.tier = this.tier; this.payload.pixelRatio = want; this.payload.reason = 'adaptive';
      this.deps.events.emit('quality/changed', this.payload);
    }
  }

  /** The frame interval the controller holds the game to: 16.7 ms, or the display's own when that is slower. */
  get targetMs(): number { return this.target; }

  private store(): void {
    this.storePending = false;
    try { this.deps.storage.setItem(TIER_KEY, 'min'); } catch { /* ignore */ }
  }
  /**
   * The cadence of the last `n` frames: BASE_MS when they are steady at 60 Hz or faster, one of SLOW_CADENCES when they
   * are steady on it (three in four within 6 % of the median, the median within 4 % of the cadence), else 0. A GPU that
   * cannot keep up gives 0 (irregular frames) or, under vsync, a steady multiple of the display's interval; the callers
   * tell that second case from a slow display by whether the cadence answers to a lower load.
   */
  private cadence(n: number): number {
    const count = Math.min(n, this.winCount);
    if (count < Math.min(n, 30)) return 0;
    const win = this.win, sorted = this.sorted;
    for (let i = 0; i < count; i++) sorted[i] = win[(this.winAt - 1 - i + WINDOW * 2) % WINDOW] as number;
    const part = sorted.subarray(0, count);
    part.sort();
    const median = part[count >> 1] as number;
    let near = 0;
    for (let i = 0; i < count; i++) if (Math.abs((part[i] as number) - median) <= median * 0.06) near++;
    if (near * 4 < count * 3) return 0;
    if (median <= BASE_MS * 1.06) return BASE_MS;
    for (let i = 0; i < SLOW_CADENCES.length; i++) {
      const c = SLOW_CADENCES[i] as number;
      if (Math.abs(median - c) <= c * 0.04) return c;
    }
    return 0;
  }
  private medianOfLast(n: number): number {
    const count = Math.min(n, this.winCount);
    if (count === 0) return 0;
    for (let i = 0; i < count; i++) this.sorted[i] = this.win[(this.winAt - 1 - i + WINDOW * 2) % WINDOW] as number;
    const part = this.sorted.subarray(0, count);
    part.sort();
    return part[count >> 1] as number;
  }
  private resetController(): void {
    this.ema = 0; this.cooldown = 30; this.goodStreak = 0; this.probing = false;
    this.ceiling = this.maxRatio(); this.ceilingFrames = 0; this.backoff = 1800;
    this.starvedSeconds = 0; this.starved = false; this.fastRun = 0;
  }
  /** The display (or a frame cap) presents every `cadence` ms: that is the budget from here on. */
  private adoptTarget(cadence: number): void {
    const slower = cadence > this.target;
    this.target = Math.max(BASE_MS, cadence);
    this.fastestSeen = slower ? this.target : Math.min(this.fastestSeen, this.target);
    this.resetController();
    if (slower) this.setRatio(this.maxRatio());                // the drops were made against a budget the display cannot meet
  }
  /** The first second of frames (the title screen): which cadence does this display present at? */
  /** The opening look is over: keep what the minimum ratio showed and draw the first second at the full ratio. */
  private finishOpen(): void {
    this.openCadence = this.cadence(OPEN_FRAMES);
    this.mode = Mode.Measure; this.modeFrames = 0;
    this.setRatio(this.maxRatio());
  }
  private finishMeasure(): void {
    const c = this.cadence(WINDOW);
    const low = this.openCadence;
    this.openCadence = 0;
    this.mode = Mode.Run; this.cooldown = 0;
    // no cadence at the full ratio: keep 16.7 ms. A slow display is recognised later; a steady slow cadence at the
    // minimum ratio alone proves nothing (a GPU too weak for this tier shows the same, and the tier below is its cure)
    if (c === 0) return;
    if (c === BASE_MS) { this.fastestSeen = BASE_MS; return; }
    if (low > 0) {
      // the opening look already saw the minimum ratio: no second look, no half-resolution frames in the first image
      if (low < c * 0.9) {
        // faster down there: load. Hold the faster cadence and let the controller step down from where it stands.
        this.target = low; this.fastestSeen = low;
        this.resetController(); this.cooldown = 0;
        return;
      }
      this.adoptTarget(c);                                     // the same at both: the display (or a cap, or the CPU)
      return;
    }
    // slower than 60 Hz and steady: a 50 / 48 / 30 Hz display, or a 60 Hz one missing every other vsync under load.
    // A display's cadence does not answer to resolution; load does. Look once at the minimum ratio.
    if (this.pixelRatio > this.minRatio() + 1e-3) {
      this.verifyRatio = this.pixelRatio; this.verifyCadence = c;
      this.mode = Mode.Verify; this.modeFrames = 0;
      this.setRatio(this.minRatio());
      return;
    }
    this.adoptTarget(c);
  }
  private finishVerify(): void {
    this.mode = Mode.Run;
    const m = this.medianOfLast(VERIFY_FRAMES);
    if (m < this.verifyCadence * 0.9) {
      // faster at the lower ratio: it was load. Stay low and let the controller probe upward against the real cadence.
      const c = this.cadence(VERIFY_FRAMES);
      this.target = c > 0 ? c : BASE_MS;
      if (c > 0) this.fastestSeen = c;
      this.resetController();
      return;
    }
    this.target = this.verifyCadence; this.fastestSeen = this.verifyCadence;
    this.resetController();
    this.setRatio(Math.max(this.minRatio(), Math.min(this.maxRatio(), this.verifyRatio)));
  }

  /** Step 4 and 5. Real requestAnimationFrame deltas only; never called in test mode. */
  onFrameTime(frameMs: number): void {
    if (this.fixed) return;
    if (frameMs > 250) return;                               // a tab switch or a hitch
    this.win[this.winAt] = frameMs; this.winAt = (this.winAt + 1) % WINDOW;
    if (this.winCount < WINDOW) this.winCount++;
    if (this.mode === Mode.Fresh) {
      // the first frame of the session: its interval is the time since the loop started, not a frame
      const min = this.minRatio();
      if (this.pixelRatio > min + 1e-3) { this.mode = Mode.Open; this.modeFrames = 0; this.winCount = 0; this.winAt = 0; this.setRatio(min); return; }
      this.mode = Mode.Measure; this.modeFrames = 0;
    }
    if (this.mode === Mode.Open) { if (++this.modeFrames >= OPEN_SETTLE + OPEN_FRAMES) this.finishOpen(); return; }
    if (this.mode === Mode.Measure) { if (++this.modeFrames >= WINDOW) this.finishMeasure(); return; }
    if (this.mode === Mode.Verify) { if (++this.modeFrames >= VERIFY_SETTLE + VERIFY_FRAMES) this.finishVerify(); return; }
    if (this.held > 0) { this.held--; return; }
    if (this.tierLook > 0) { if (--this.tierLook === 0) this.finishTierLook(); return; }
    const target = this.target;
    // the display turned out faster than the target (a cap was lifted, another monitor): take the faster cadence up
    if (target > BASE_MS + 0.5) {
      if (frameMs < target * 0.9) {
        if (++this.fastRun >= WINDOW) {
          const c = this.cadence(WINDOW);
          this.adoptTarget(c > 0 && c < target ? c : BASE_MS);
          return;
        }
      } else this.fastRun = 0;
    }
    // one or two long frames (a set swap, a shader compile, a collection) are not load: the median of five drops
    // them, and no sample counts for more than two intervals
    const recent = this.recent, five = this.five;
    recent[this.recentAt] = frameMs; this.recentAt = (this.recentAt + 1) % 5;
    if (this.recentCount < 5) this.recentCount++;
    let sample = frameMs;
    if (this.recentCount === 5) {
      five.set(recent);
      five.sort();
      sample = five[2] as number;
    }
    if (sample > target * 2) sample = target * 2;
    const max = this.maxRatio(), min = this.minRatio();
    this.ema = this.ema === 0 ? sample : this.ema + (sample - this.ema) * 0.1;
    if (this.ceilingFrames > 0 && --this.ceilingFrames === 0) this.ceiling = max;
    if (this.cooldown > 0) { this.cooldown--; return; }
    if (this.trial > 0 && --this.trial === 0) this.promotionHeld();
    const hard = this.ema > target * 1.15, under = this.ema < target * 1.04;
    // The band between "under" and "over" used to be dead: a steady 18 ms on a display without vsync quantisation sat
    // at 55 fps for ever at ratio 1. Over by 6 % for two seconds gives one step.
    let over = hard;
    if (!hard && this.ema > target * 1.06) { if (++this.mildFrames >= MILD_FRAMES) over = true; } else this.mildFrames = 0;
    if (over) {
      this.goodStreak = 0; this.mildFrames = 0; this.promoteGood = 0;
      if (this.pixelRatio > min + 1e-3) {
        this.ceiling = Math.max(min, this.pixelRatio - STEP);
        // only a probe upward that failed earns the long, doubling back-off; an ordinary descent is held five seconds
        if (this.probing) { this.ceilingFrames = this.backoff; this.backoff = Math.min(this.backoff * 2, 18000); }
        else this.ceilingFrames = Math.max(this.ceilingFrames, DESCENT_HOLD);
        let next: number;
        if (this.probing) next = this.prevRatio;             // a probe upward failed: back to the ratio that held
        else if (!hard) next = Math.ceil((this.pixelRatio - STEP) / STEP - 1e-6) * STEP;
        else {
          next = Math.floor((this.pixelRatio * Math.sqrt(target / this.ema)) / STEP + 1e-6) * STEP;
          // Under vsync a frame that misses by 2 ms reads as 33.3 ms, and sqrt(16.7 / 33.3) took 0.9 to 0.6 in one
          // decision where 0.8 held: at most two steps at a time; the next look is 30 frames away.
          next = Math.max(next, Math.ceil((this.pixelRatio - 2 * STEP) / STEP - 1e-6) * STEP);
        }
        next = Math.max(min, Math.min(this.ceiling, next));
        this.probing = false; this.cooldown = 30; this.ema = target;
        this.setRatio(next);
        return;
      }
      if (!hard) return;                                     // a small overshoot at the minimum ratio is not starvation
      this.starvedSeconds += frameMs / 1000;
      if (this.starvedSeconds >= STARVE_SECONDS) this.starve();
    } else if (under) {
      this.starvedSeconds = 0; this.starved = false;
      if (this.tier === 'min' && this.climb(frameMs, max)) return;
      if (this.goodStreak === 120) {
        if (this.probing) this.backoff = 1800;               // the probe held: the next failure starts the back-off over
        this.probing = false;
        if (target < this.fastestSeen) this.fastestSeen = target;
      }
      if (++this.goodStreak >= 180) {
        if (this.pixelRatio < Math.min(max, this.ceiling) - 1e-3) {
          this.prevRatio = this.pixelRatio; this.probing = true;
          this.cooldown = 30; this.goodStreak = 0;
          // snap onto the limit: 0.6 + 4 x 0.1 is 0.9999999999999999, and a 960-wide buffer at that ratio is 959 wide
          const limit = Math.min(max, this.ceiling), next = this.pixelRatio + STEP;
          this.setRatio(next > limit - 1e-3 ? limit : next);
        }
      }
    } else this.goodStreak = 0;
  }
  /**
   * 'min', on budget. Sixty seconds of that at min's full ratio and the tier above is tried again (then 120, 240 s: three
   * tries a session). A 'min' that holds for three minutes with no way up is stored for the next session. True when the
   * tier changed.
   */
  private climb(frameMs: number, max: number): boolean {
    const seconds = frameMs / 1000;
    const to = this.promoteTo;
    if (to !== null && this.promoteTries < PROMOTE_TRIES && this.pixelRatio >= max - 1e-3) {
      this.promoteGood += seconds;
      if (this.promoteGood >= this.promoteWait) {
        const wait = this.promoteWait * 2, tries = this.promoteTries + 1;
        this.apply(to, 'detect');
        this.promoteTo = to; this.promoteWait = wait; this.promoteTries = tries; this.trial = TRIAL_FRAMES;
        return true;
      }
      return false;
    }
    this.minGood += seconds;
    if (this.storePending && this.minGood >= STORE_SECONDS) this.store();
    return false;
  }
  /** A promotion out of 'min' held for its whole trial: the demotion was a passing thing. Forget it, stored or not. */
  private promotionHeld(): void {
    this.promoteTo = null; this.promoteTries = 0; this.promoteWait = PROMOTE_SECONDS;
    try { this.deps.storage.removeItem(TIER_KEY); } catch { /* ignore */ }
  }
  private setRatio(ratio: number): void {
    if (Math.abs(ratio - this.pixelRatio) < 1e-6) return;
    this.pixelRatio = ratio;
    this.payload.tier = this.tier; this.payload.pixelRatio = ratio; this.payload.reason = 'adaptive';
    this.deps.events.emit('quality/changed', this.payload);
  }
  /**
   * Frames to leave out of the controller (not of the first-second calibration): the loop calls it while the game is not
   * 'playing' and when a set or a staged zone has just been built, so a loading screen's stutter is never read as load.
   */
  hold(frames: number): void { if (frames > this.held) this.held = frames; }
  /** The look at the tier below is over: faster there means the slow cadence was load, not the display. */
  private finishTierLook(): void {
    const m = this.medianOfLast(Math.min(WINDOW, TIER_LOOK_FRAMES - 30));
    if (m < this.tierLookCadence * 0.9) {
      // it was load: stay on the lower tier, against the cadence it shows (a demotion like any other: not stored yet)
      const c = this.cadence(Math.min(WINDOW, TIER_LOOK_FRAMES - 30));
      this.target = c > 0 ? c : BASE_MS;
      if (c > 0) this.fastestSeen = Math.min(this.fastestSeen, c);
      this.resetController();
      if (this.tier === 'min') { this.promoteTo = 'low'; this.promoteWait = PROMOTE_SECONDS; this.promoteTries = 0; this.storePending = true; }
      return;
    }
    // the same cadence on the tier below: the display (or a frame cap). Back to the tier it had, on that cadence.
    this.apply(this.tierLookFrom, 'detect');
    this.adoptTarget(this.tierLookCadence);
  }
  /** Step 5: at the minimum ratio and still over budget for STARVE_SECONDS. */
  private starve(): void {
    this.starvedSeconds = 0;
    const c = this.cadence(WINDOW);
    // steady on a common refresh interval although the ratio went all the way down: resolution is not what limits it
    const steadySlow = c > this.target + 0.5;
    if (steadySlow && this.fastestSeen > c - 0.5) {
      // nothing faster was ever seen: the display, or a GPU too weak for this tier even at its minimum ratio (a steady
      // 33.3 ms under vsync looks the same). Look once at the tier below: a display's cadence does not answer to it.
      const j = ORDER.indexOf(this.tier);
      if (j > 0 && !this.tierLooked && this.auto()) {
        this.tierLooked = true; this.tierLookFrom = this.tier; this.tierLookCadence = c;
        const from = this.demotedFrom ?? this.tier;
        this.apply(ORDER[j - 1] as RenderTier, 'demote');
        this.demotedFrom = from;
        this.setRatio(this.minRatio());                        // the tier below at ITS minimum: the cheapest this machine can be asked for
        this.tierLook = TIER_LOOK_FRAMES;
        return;
      }
      this.adoptTarget(c); return;
    }
    const i = ORDER.indexOf(this.tier);
    if (i <= 0) {
      if (steadySlow) {
        // every ratio of every tier gave the same cadence: a frame cap arrived in mid-session. Undo what was tried.
        const back = this.demotedFrom;
        this.adoptTarget(c);
        if (back) this.apply(back, 'detect');
        return;
      }
      if (this.storePending) this.store();
      this.starved = true;                                   // 'min' at its minimum ratio has nowhere to go
      return;
    }
    const next = ORDER[i - 1] as RenderTier;
    const from = this.demotedFrom ?? this.tier;
    // A demotion to 'min' is NOT stored when it happens (it was: one stall of the machine cost the composer, the grain
    // and 720p in every later session). It is stored when the way back up was tried and failed, when 'min' has held for
    // three minutes with no way up, or when 'min' itself starves.
    const failedTrial = this.trial > 0;
    const to = this.promoteTo, wait = this.promoteWait, tries = this.promoteTries;
    this.backoff = 1800;
    this.apply(next, 'demote');
    this.demotedFrom = from;
    if (next === 'min') {
      this.trial = 0;
      this.promoteTo = 'low'; this.promoteWait = failedTrial ? wait : PROMOTE_SECONDS; this.promoteTries = failedTrial ? tries : 0;
      if (failedTrial && !steadySlow) this.store(); else this.storePending = true;
    } else { this.promoteTo = to; this.promoteWait = wait; this.promoteTries = tries; if (failedTrial) this.trial = TRIAL_FRAMES; }
  }
}
