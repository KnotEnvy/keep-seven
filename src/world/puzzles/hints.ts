// src/world/puzzles/hints.ts: the hint-tier clock shared by the four puzzles and the kept-round ladder (GDD 13).
// It counts only time inside the puzzle volume without progress, pauses in combat (the caller passes `counting`),
// and resets on each correct step. Normal: 60 / 120 / 210 / 300 s; Fast: 30 / 60 / 120 / 180. Off suppresses T1 to T3;
// T4 (the puzzle relaxes) always applies. Pure: no context, unit-tested in tests/world/hints.spec.ts.
import { FIXED_DT } from '../../core/contracts.ts';
import type { GameEvents, HintMode, HintTier, LayoutMarker, PuzzleId, PuzzleView } from '../../core/contracts.ts';
import { inVolume } from '../internals.ts';
import type { State } from '../internals.ts';

export const HINT_NORMAL: readonly number[] = [60, 120, 210, 300];
export const HINT_FAST: readonly number[] = [30, 60, 120, 180];
/** the kept round's ladder is the fast one of GDD 6.6, counted from boss/charge_required (code-world 4.7) */
export const HINT_KEPT: readonly number[] = [15, 30, 45, 75];
/**
 * The wordless cue of tier 1 (polish round 3: one 1.5 s glint at 57 s was the whole of tier 1, and nobody saw it). From
 * the tier that sets it until the next correct step, the thing to act on glints for CUE_SECONDS every CUE_EVERY
 * seconds while she stands in the puzzle's volume out of combat: a slow pulse that needs no mesh to outline.
 */
export const CUE_EVERY = 3, CUE_SECONDS = 1.5;
const CUE_POINTS = 2;

export class HintClock {
  /** seconds counted since the last correct step */
  seconds = 0;
  /** the highest tier reached since the last reset (0 = none); T4 stays reached through a reset (the puzzle stays relaxed) */
  tier: 0 | HintTier = 0;
  relaxed = false;
  /** `fixed` = thresholds that do not follow the option (the kept ladder) */
  constructor(private readonly fixed: readonly number[] | null = null) {}

  thresholds(mode: HintMode): readonly number[] { return this.fixed ?? (mode === 'fast' ? HINT_FAST : HINT_NORMAL); }

  /**
   * Advance by dt seconds while `counting`. Returns the tier that was reached on this call (0 = none). With hints
   * off the clock still runs: T1 to T3 are passed over in silence and only T4 is returned.
   */
  tick(dt: number, counting: boolean, mode: HintMode): 0 | HintTier {
    if (!counting) return 0;
    this.seconds += dt;
    const t = this.thresholds(mode);
    let reached: 0 | HintTier = 0;
    // (a sixtieth summed six thousand times is not exact: a microsecond of slack keeps the tiers on their tick)
    while (this.tier < 4 && this.seconds + 1e-6 >= (t[this.tier] as number)) {
      this.tier = (this.tier + 1) as HintTier;
      if (this.tier === 4) this.relaxed = true;
      if (mode !== 'off' || this.tier === 4) reached = this.tier;
    }
    return reached;
  }
  /** seconds past the T4 threshold (0 before it): the "and at 360 s" follow-ups */
  pastRelax(mode: HintMode): number {
    const t4 = this.thresholds(mode)[3] as number;
    return this.seconds > t4 ? this.seconds - t4 : 0;
  }
  /** a correct step: the clock starts again; a relaxation that has happened stays */
  progress(): void { this.seconds = 0; this.tier = 0; }
  reset(): void { this.seconds = 0; this.tier = 0; this.relaxed = false; }
}

// ---- what the four puzzle files share beside the clock --------------------------------------------------------

/** The view, the volume, `puzzle/entered` and the hint clock of one puzzle. */
export class PuzzleCore {
  readonly view: PuzzleView;
  readonly clock = new HintClock();
  /** the trigger marker with `params.puzzle` = this puzzle and `role: 'volume'` */
  readonly volume: LayoutMarker | undefined;
  inside = false;
  /** seconds of play since she first entered (puzzle/solved reports it) */
  seconds = 0;
  /** the pulsing cue: up to CUE_POINTS points (x, y, z each), glinting in turn */
  private readonly cue = new Float64Array(CUE_POINTS * 3);
  private cueCount = 0;
  private cueNext = 0;
  private cueT = 0;
  /** glints given since the cue was set (tests, debug) */
  cuePulses = 0;
  private readonly enteredPayload: GameEvents['puzzle/entered'];
  private readonly solvedPayload: GameEvents['puzzle/solved'];
  private readonly wrongPayload: GameEvents['puzzle/wrong'];

  constructor(readonly s: State, readonly id: PuzzleId, of: number) {
    this.view = { id, solved: false, step: 0, of, hintTier: 0, secondsIdle: 0, data: {} };
    this.volume = s.ctx.data.markersOfType('trigger').find((m) => m.params.puzzle === id && m.params.role === 'volume');
    this.enteredFlag = 'entered:' + id;
    this.enteredPayload = { puzzle: id };
    this.solvedPayload = { puzzle: id, seconds: 0 };
    this.wrongPayload = { puzzle: id, detail: '' };
  }
  private readonly enteredFlag: string;
  get entered(): boolean { return this.s.flags.has(this.enteredFlag); }
  /**
   * Once per tick while the puzzle is unsolved: is she in the volume, `puzzle/entered` the first time, the hint clock
   * (it does not count in combat, nor while `counting` is false). Returns the tier reached on this tick.
   */
  tick(counting = true): 0 | 1 | 2 | 3 | 4 {
    const { s } = this;
    const p = s.ctx.player.position;
    this.inside = this.volume !== undefined && inVolume(this.volume, p.x, p.y, p.z);
    if (this.inside && !this.entered) {
      s.flags.add(this.enteredFlag);
      s.ctx.events.emit('puzzle/entered', this.enteredPayload);
    }
    if (this.entered) this.seconds += FIXED_DT;
    const tier = this.clock.tick(FIXED_DT, counting && this.inside && !s.director.live, s.ctx.options.value.hints);
    this.view.hintTier = this.clock.tier;
    this.view.secondsIdle = this.clock.seconds;
    if (tier !== 0) s.hint(this.id, tier);
    if (this.cueCount > 0 && counting && this.inside && !s.director.live && s.hintsOn()) {
      this.cueT += FIXED_DT;
      if (this.cueT >= CUE_EVERY) {
        this.cueT = 0;
        const i = this.cueNext * 3;
        this.cueNext = (this.cueNext + 1) % this.cueCount;
        this.cuePulses++;
        s.glint(this.cue[i] as number, this.cue[i + 1] as number, this.cue[i + 2] as number, CUE_SECONDS);
      }
    }
    return tier;
  }
  /** start (or move) the pulsing cue at a point: the first glint comes at once; `also` adds a second point to the first */
  cueAt(x: number, y: number, z: number, also = false): void {
    const n = also && this.cueCount > 0 ? Math.min(this.cueCount, CUE_POINTS - 1) : 0;
    this.cue[n * 3] = x; this.cue[n * 3 + 1] = y; this.cue[n * 3 + 2] = z;
    this.cueCount = n + 1;
    if (!also) { this.cueNext = 0; this.cueT = CUE_EVERY; this.cuePulses = 0; }
  }
  cueOff(): void { this.cueCount = 0; this.cueNext = 0; this.cueT = 0; }
  /** a correct step */
  progress(step: number, detail: string): void {
    this.view.step = step;
    this.cueOff();
    this.clock.progress();
    this.view.hintTier = 0; this.view.secondsIdle = 0;
    this.s.story.cancelHint();
    this.s.progress(this.view, detail);
  }
  wrong(detail: string): void {
    this.wrongPayload.detail = detail;
    this.s.ctx.events.emit('puzzle/wrong', this.wrongPayload);
  }
  solved(): void {
    this.view.solved = true;
    this.cueOff();
    this.s.story.cancelHint();
    this.solvedPayload.seconds = this.seconds;
    this.s.ctx.events.emit('puzzle/solved', this.solvedPayload);
  }
  hintKey(name: string): string {
    const hints = this.volume?.params.hints as Record<string, string> | undefined;
    return hints && typeof hints[name] === 'string' ? (hints[name] as string) : '';
  }
  reset(): void {
    this.view.solved = false; this.view.step = 0; this.view.hintTier = 0; this.view.secondsIdle = 0;
    this.clock.reset();
    this.cueOff(); this.cuePulses = 0;
    this.inside = false; this.seconds = 0;
  }
}
