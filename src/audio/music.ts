// Music (GDD 17 "Music approach"): no score. A wire that plays a note or two at long random intervals, a skin drum
// that comes in with an encounter and cuts to nothing on the last kill, the Windlass's own cadence as the boss's
// percussion, and one resolution, once, at the end. All decisions are made on the tick with a seeded stream.
import type { BossPhase, GameState, Rng } from '../core/contracts.ts';
import type { SoundParams } from './sound.ts';

export const MUSIC_SILENT = 0, MUSIC_CALM = 1, MUSIC_COMBAT = 2, MUSIC_BOSS = 3, MUSIC_ENDING = 4;
export type MusicStateName = 'silent' | 'calm' | 'combat' | 'boss' | 'ending';
export const MUSIC_NAMES: readonly MusicStateName[] = ['silent', 'calm', 'combat', 'boss', 'ending'];

export const BPM = 96;
/** sixteenth notes: 16 to the bar, 2.5 s a bar */
export const STEP_SECONDS = 60 / BPM / 4;
/** the wire's silence between figures, seconds */
export const WIRE_MIN = 8, WIRE_MAX = 20;
/** how far ahead of its tick a drum hit is handed to the audio clock, seconds */
const LOOKAHEAD = 0.1;
/** the boss drum answers each discharge, and once more half a cadence later */
export const BOSS_CADENCE = 1.1;
/** a fight's intensity goes up at once and comes down only after the threat has stayed lower for this long, seconds */
export const INTENSITY_HOLD = 0.75;

// 16-step bars; value = accent (0 = rest). Sparse, steady, driving.
const PATTERNS: readonly (readonly number[])[] = [
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.6, 0, 0, 0, 0, 0],
  [1, 0, 0, 0, 0.6, 0, 0, 0, 0.9, 0, 0.5, 0, 0.7, 0, 0, 0],
  [1, 0, 0, 0.5, 0.7, 0, 0.5, 0, 0.9, 0, 0.6, 0.5, 0.8, 0, 0.6, 0.4],
];
// the wire's vocabulary: [degree, octave]. Single notes, and two-note figures that never come home.
const SINGLES: readonly (readonly [number, number])[] = [[1, 3], [5, 3], [7, 3], [5, 2], [8, 3], [4, 3], [2, 4], [7, 3]];
const FIGURES: readonly (readonly [number, number, number, number])[] = [
  [1, 3, 5, 3], [5, 3, 7, 3], [1, 3, 7, 3], [5, 3, 4, 3], [2, 3, 5, 3], [4, 3, 7, 3], [8, 3, 7, 3], [5, 2, 7, 3],
];

export interface MusicHost {
  readonly rng: Rng;
  /** fresh scratch parameters */
  params(): SoundParams;
  play(name: string, p: SoundParams): number;
  emitMusic(state: MusicStateName, intensity: 0 | 1 | 2 | 3): void;
  setCombatLayer(on: boolean): void;
  /** `ctx.enemies.threat`, now */
  threat(): number;
  /** `ctx.clock.tick` (it keeps counting while the game is paused) */
  simTick(): number;
}

export function intensityOf(threat: number): 1 | 2 | 3 { return threat >= 6 ? 3 : threat >= 3 ? 2 : 1; }

export class Music {
  state = MUSIC_SILENT;
  intensity: 0 | 1 | 2 | 3 = 0;
  /** degrees of the last wire figure, e.g. '5-7' (tests: the seventh is never answered before the ending) */
  lastFigure = '';
  private lastDegree = 0;
  // inputs
  game: GameState = 'boot';
  encounter = false;
  bossPhase: BossPhase = 'idle';
  ending = false;
  /** the seventh's silence, or the dry phase after it: no music */
  hushed = false;
  // schedulers, in own ticks / seconds of own time
  private wireAt = 0;
  private answerAt = -1;
  private answerDegree = 0;
  private answerOctave = 3;
  private stepAt = 0;
  private step = 0;
  private ghostAt = -1;
  /** own time at which the threat first read lower than the intensity playing; -1 = it does not */
  private lowSince = -1;
  /** sim tick of the last `music/state` */
  private emitTick = -1;
  /** an intensity change was held back because its tick had already emitted: the next tick (or frame) sends it */
  pending = false;
  constructor(private readonly host: MusicHost) {}

  private target(): number {
    switch (this.game) {
      case 'title': return MUSIC_CALM;
      case 'ending': return MUSIC_ENDING;
      case 'playing': break;
      default: return MUSIC_SILENT;          // boot, loading, paused, dead
    }
    if (this.ending) return MUSIC_ENDING;
    if (this.hushed) return MUSIC_SILENT;
    if (this.bossPhase === 'p1' || this.bossPhase === 'p2' || this.bossPhase === 'p3a') return MUSIC_BOSS;
    if (this.bossPhase === 'hush' || this.bossPhase === 'proven' || this.bossPhase === 'p3b') return MUSIC_SILENT;
    return this.encounter ? MUSIC_COMBAT : MUSIC_CALM;
  }
  private level(state: number, now: number): 0 | 1 | 2 | 3 {
    if (state === MUSIC_COMBAT) {
      // up at once; down only after INTENSITY_HOLD of a lower threat: a threat that flickers across a boundary
      // (an enemy dying as another spawns) neither storms `music/state` nor switches the drum pattern every tick
      const raw = intensityOf(this.host.threat());
      if (this.state !== MUSIC_COMBAT || raw >= this.intensity) { this.lowSince = -1; return raw; }
      if (this.lowSince < 0) this.lowSince = now;
      return now - this.lowSince >= INTENSITY_HOLD ? raw : this.intensity;
    }
    if (state === MUSIC_BOSS) return this.bossPhase === 'p1' ? 1 : this.bossPhase === 'p2' ? 2 : 3;
    return 0;
  }

  /** Re-derive the state from the inputs; emits `music/state` on every change. `now` = own time in seconds. */
  derive(now: number): void {
    const next = this.target(), level = this.level(next, now);
    if (next === this.state && level === this.intensity) { this.pending = false; return; }
    // a fight's intensity alone never makes a second event on a tick that has already sent one (combat 1 from
    // `encounter/started`, then combat 3 from the threat the same tick): it goes out on the next
    const tick = this.host.simTick();
    if (next === MUSIC_COMBAT && next === this.state && tick === this.emitTick) { this.pending = true; return; }
    this.pending = false; this.emitTick = tick;
    const was = this.state;
    this.state = next; this.intensity = level;
    if (next !== was) {
      const layer = next === MUSIC_COMBAT || next === MUSIC_BOSS, wasLayer = was === MUSIC_COMBAT || was === MUSIC_BOSS;
      if (layer !== wasLayer) this.host.setCombatLayer(layer);
      if (next === MUSIC_COMBAT) { this.step = 0; this.stepAt = now; }
      if (next === MUSIC_CALM) { this.wireAt = now + this.host.rng.range(WIRE_MIN, WIRE_MAX); this.answerAt = -1; }
      this.ghostAt = -1;
    }
    this.host.emitMusic(MUSIC_NAMES[next] as MusicStateName, level);
  }

  /** One tick. `now` = own time in seconds (it stops with the game). */
  tick(now: number): void {
    this.derive(now);
    const host = this.host;
    if (this.state === MUSIC_CALM) {
      if (this.answerAt >= 0 && now >= this.answerAt) {
        this.answerAt = -1;
        const p = host.params(); p.a = this.answerDegree; p.b = this.answerOctave;
        host.play('wire_answer', p);
      }
      if (now >= this.wireAt) this.figure(now);
    } else if (this.state === MUSIC_COMBAT) {
      const pattern = PATTERNS[this.intensity - 1] ?? PATTERNS[0] as readonly number[];
      while (this.stepAt < now + LOOKAHEAD) {
        const accent = pattern[this.step & 15] as number;
        if (accent > 0) {
          const p = host.params(); p.a = accent; p.delay = Math.max(0, this.stepAt - now);
          host.play('drum', p);
        }
        // a bowed fifth swells in every fourth bar once the fight is more than a skirmish
        if ((this.step & 63) === 48 && this.intensity >= 2) host.play('bow_fifth', host.params());
        this.step++;
        this.stepAt += STEP_SECONDS;
      }
    } else if (this.state === MUSIC_BOSS) {
      if (this.ghostAt >= 0 && now >= this.ghostAt - LOOKAHEAD) {
        const p = host.params(); p.a = 0.35; p.delay = Math.max(0, this.ghostAt - now);
        this.ghostAt = -1;
        host.play('drum', p);
      }
    }
  }

  /** The Windlass discharged: its cadence is the percussion. The hit lands on the event, not on a grid. */
  discharge(now: number): void {
    if (this.state !== MUSIC_BOSS) return;
    const p = this.host.params(); p.a = 1;
    this.host.play('drum', p);
    this.ghostAt = now + BOSS_CADENCE / 2;
  }

  private figure(now: number): void {
    const host = this.host, rng = host.rng;
    this.wireAt = now + rng.range(WIRE_MIN, WIRE_MAX);
    const p = host.params();
    if (rng.chance(0.45)) {
      let pick = SINGLES[rng.int(SINGLES.length)] as readonly [number, number];
      // the seventh is always left hanging: a C is never followed by a D
      if (this.lastDegree === 7 && (pick[0] === 1 || pick[0] === 8)) pick = SINGLES[1] as readonly [number, number];
      p.a = pick[0]; p.b = pick[1];
      this.lastDegree = pick[0];
      this.lastFigure = pick[0] === 8 ? '8' : pick[0] === 7 ? '7' : pick[0] === 5 ? '5' : pick[0] === 4 ? '4' : pick[0] === 2 ? '2' : '1';
    } else {
      let k = rng.int(FIGURES.length);
      let f = FIGURES[k] as readonly [number, number, number, number];
      if (this.lastDegree === 7 && (f[0] === 1 || f[0] === 8)) { k = 1; f = FIGURES[1] as readonly [number, number, number, number]; }
      p.a = f[0]; p.b = f[1];
      this.answerDegree = f[2]; this.answerOctave = f[3];
      this.answerAt = now + rng.range(0.7, 1.1);
      this.lastDegree = f[2];
      this.lastFigure = FIGURE_NAMES[k] as string;
    }
    host.play('wire', p);
  }
}
const FIGURE_NAMES: readonly string[] = FIGURES.map((f) => f[0] + '-' + f[2]);
