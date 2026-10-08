// src/world/director.ts: triggers, the Dowser sighting, vignette starts, and the encounter director (GDD 10): waves,
// locks, the clear rule, drops and the ammo floor. The machine-readable wave fields of layout.encounters win over the
// `when` text; what the layout carries only in words is the small WAVE_RULES table below, with its GDD line.
// WaveScheduler and decideDrop are pure (tests/world/director.spec.ts).
import type {
  BossPhase, CheckpointId, DamageInfo, Difficulty, EncounterData, EncounterId, EncounterState, EncounterView, EntityId, GameEvents,
  LayoutMarker, MarkerId, MoodId, PickupKind, PuzzleId, SaveData, SpawnRequest, StoryKey, VignetteId, WorldSave, ZoneId, FxHandle,
} from '../core/contracts.ts';
import * as THREE from 'three';
import { DEG2RAD } from '../core/math.ts';
import { ColFlag, PLAYER_EYE } from '../core/contracts.ts';
import type { AudioCue } from '../core/contracts.ts';
import { HINT_ECHO, URGENT_READ } from './story.ts';
import { ENCOUNTERS, PUZZLES, inVolume, lampNode, namedLine, paramList, paramNumber, paramString } from './internals.ts';
import type { DirectorApi, State } from './internals.ts';

// =====================================================================================================
// Pure: the wave scheduler
// =====================================================================================================

export type WaveMode = 'start' | 'clock' | 'afterSpawn' | 'afterDown';
export interface WavePlan {
  id: string;
  size: number;
  mode: WaveMode;
  /** afterSpawn / afterDown: the wave this one is timed from */
  ref: number;
  /** afterDown: the reference wave is down to this many alive */
  left: number;
  /** seconds after the event (the start; the reference wave's release; the reference wave going down to `left`) */
  delay: number;
  /** afterDown: also released this long after the reference wave was released (-1: never) */
  timeout: number;
  /** afterDown: also released this long after a member of the reference wave was first hit (-1: never) */
  hitTimeout: number;
  /** clock: seconds on the encounter clock */
  clockAt: number;
  /** cancelled as soon as that wave has been released and is all down (-1: never) */
  cancelIfDown: number;
  /** released only while no more than this many are alive (-1: no gate) */
  aliveAtMost: number;
  /**
   * afterDown, polish round 4: the wave is an ambush. Once the reference wave is down to `left` it is released only
   * when the director opens its gate (`WaveScheduler.gateOpen`: she has come within reach of its door), or
   * `gateTimeout` seconds after that if she never does (-1: the gate alone). `timeout` and `hitTimeout` do not apply.
   */
  gated: boolean;
  gateTimeout: number;
}

export class WaveScheduler {
  clock = 0;
  readonly released: boolean[] = [];
  readonly cancelled: boolean[] = [];
  readonly releasedAt: number[] = [];
  /** members of a released wave still up (spawned or yet to spawn) */
  readonly alive: number[] = [];
  /** members that went down before their wave was released (a dormant member shot from afar) */
  readonly lost: number[] = [];
  private readonly downAt: number[] = [];
  private readonly hitAt: number[] = [];
  /** the gate of a `gated` wave: the director sets it each tick (true: she is where the ambush is sprung) */
  readonly gateOpen: boolean[] = [];

  constructor(readonly plans: readonly WavePlan[]) {
    for (let i = 0; i < plans.length; i++) { this.released.push(false); this.cancelled.push(false); this.releasedAt.push(0); this.alive.push(0); this.lost.push(0); this.downAt.push(-1); this.hitAt.push(-1); this.gateOpen.push(false); }
  }
  reset(): void {
    this.clock = 0;
    for (let i = 0; i < this.plans.length; i++) { this.released[i] = false; this.cancelled[i] = false; this.releasedAt[i] = 0; this.alive[i] = 0; this.lost[i] = 0; this.downAt[i] = -1; this.hitAt[i] = -1; this.gateOpen[i] = false; }
  }
  get totalAlive(): number {
    let n = 0;
    for (let i = 0; i < this.alive.length; i++) n += this.alive[i] as number;
    return n;
  }
  /** waves still to come: neither released nor cancelled */
  get pending(): number {
    let n = 0;
    for (let i = 0; i < this.plans.length; i++) if (!this.released[i] && !this.cancelled[i]) n++;
    return n;
  }
  /** clear = every enemy the encounter has spawned is down and no wave is still to come (GDD 10) */
  get clear(): boolean { return this.pending === 0 && this.totalAlive === 0; }
  memberDown(wave: number): void {
    if (this.released[wave]) { if ((this.alive[wave] as number) > 0) this.alive[wave] = (this.alive[wave] as number) - 1; } else this.lost[wave] = (this.lost[wave] as number) + 1;
    this.cancelDependents();
  }
  /**
   * A wave whose `cancelIfDown` wave has been released and is all down is cancelled on the spot, not on the next
   * update: the kill that ends the fight must see "no wave still to come" on its own tick (the last-enemy beat).
   */
  private cancelDependents(): void {
    for (let w = 0; w < this.plans.length; w++) {
      if (this.released[w] || this.cancelled[w]) continue;
      const c = (this.plans[w] as WavePlan).cancelIfDown;
      if (c >= 0 && this.released[c] && this.alive[c] === 0) this.cancelled[w] = true;
    }
  }
  memberHit(wave: number): void { if ((this.hitAt[wave] as number) < 0) this.hitAt[wave] = this.clock; }
  private release(w: number): void {
    this.released[w] = true;
    this.releasedAt[w] = this.clock;
    this.alive[w] = Math.max(0, (this.plans[w] as WavePlan).size - (this.lost[w] as number));
  }
  /** Advance the clock and return the index of a wave released now, or -1. Call again with dt 0 until it returns -1. */
  update(dt: number): number {
    this.clock += dt;
    for (let w = 0; w < this.plans.length; w++) {
      if (this.released[w] || this.cancelled[w]) continue;
      const p = this.plans[w] as WavePlan;
      if (p.cancelIfDown >= 0 && this.released[p.cancelIfDown] && this.alive[p.cancelIfDown] === 0) { this.cancelled[w] = true; continue; }
      // (sixtieths summed are not exact: a microsecond of slack keeps a wave on the tick its second falls on)
      const now = this.clock + 1e-6;
      let due = false;
      if (p.mode === 'start') due = now >= p.delay;
      else if (p.mode === 'clock') due = now >= p.clockAt;
      else if (!this.released[p.ref]) continue;
      else if (p.mode === 'afterSpawn') due = now >= (this.releasedAt[p.ref] as number) + p.delay;
      else {
        if ((this.downAt[w] as number) < 0 && (this.alive[p.ref] as number) <= p.left) this.downAt[w] = this.clock;
        const refAt = this.releasedAt[p.ref] as number, hit = this.hitAt[p.ref] as number, down = this.downAt[w] as number;
        if (p.gated) due = down >= 0 && ((this.gateOpen[w] === true && now >= down + p.delay) || (p.gateTimeout >= 0 && now >= down + p.gateTimeout));
        else due = (down >= 0 && now >= down + p.delay) || (p.timeout >= 0 && now >= refAt + p.timeout) || (p.hitTimeout >= 0 && hit >= 0 && now >= hit + p.hitTimeout);
      }
      if (!due) continue;
      if (p.aliveAtMost >= 0 && this.totalAlive > p.aliveAtMost) continue;
      this.release(w);
      return w;
    }
    return -1;
  }
}

/**
 * GDD 10 rows whose rule the layout carries only in its `when` text. `left`: the previous wave is down to this many;
 * `timeout`: seconds after the previous wave was released; `hitTimeout`: seconds after it was first hit.
 * enc_street B is "A down, or 8 s after A is hit or reaches 15 m": the kneeler's distance is the enemies module's to
 * know, so its walk to 15 m is stood in for by 14 s from its rise (docs/requests/code-world.md).
 */
/** the file's wave B: metres from `door_gallery_far` at which the door bursts (measured: scratch/r4-team-world/NOTES.md) */
export const FILE_NEAR = 12;
/** the ambush's tell at the door: a bang on it from the far side and the Biders' own caption (no marker names them) */
const AMBUSH_CUE = 'shutter_bang', AMBUSH_CAPTION = 'cap_bider_rattle';
/** seconds between the three being let go behind the far door (and `nar_file_more`) and the door bursting open */
export const FILE_BURST = 1;
/** polish round 5: metres from `door_gallery_far` at which the rear pair start down the peg stair behind her */
export const FILE_NEAR_REAR = 16;
/** polish round 5: seconds between the rear pair starting (60 m behind her) and the bang on the far door */
export const FILE_REAR = 4;
/**
 * Release pass p0 (the combat critic: the yard killed proxies more often than the Windlass did, stakes 83 to 214, and
 * several ended it dry). The cause was a fourth Transit the layout does not have (`start()`, the vignette's actor).
 * With three, as designed, a packet of six also lies `ENTRY_PACKET_IN` metres inside the door the latch knot lets go,
 * on her way in, from the fight's first wave on (on every attempt): the tin by the cart and the box on the wall are
 * both off that line. Holding the third Transit back while two stood was tried and measured worse (the late one
 * overlapped the alley's Biders: scratch/p0-team-world/NOTES.md), so the waves are as the layout says.
 */
export const ENTRY_PACKET_IN = 1.9;
/** polish round 5: a latch knot's line said on the burst starts within this many seconds of it, or is dropped */
export const KNOT_LINE_LATE = 1.5;
/** polish round 5: a vignette trigger's first line is about the place while she is within this many metres of it; its later lines within VIGNETTE_GONE */
export const VIGNETTE_NEAR = 10, VIGNETTE_GONE = 13;
interface WaveRule {
  left?: number; timeout?: number; hitTimeout?: number; afterSpawnOf?: string; afterDownOf?: string; aliveAtMost?: number; near?: number; nearOf?: string;
  nearTimeout?: number; delay?: number; burst?: number;
  /** p0: a packet of six on the way in when the fight starts (ENTRY_PACKET_IN) */
  entryPacket?: boolean;
}
const WAVE_RULES: Readonly<Record<string, WaveRule>> = {
  // polish round 3 (R3): B and C come sooner, so two groups are on the street at once (it cost a plain player nothing)
  'enc_street/B': { left: 0, hitTimeout: 3, timeout: 8 },
  // polish round 4 (R3): C two seconds after B (it was six), so the file of two is on the street with the alleys
  'enc_street/C': { left: 2, timeout: 2 },
  'enc_street/D': { left: 0 },
  'enc_yard/A': { entryPacket: true },
  'enc_yard/B': { left: 0, timeout: 14 },                 // polish round 3: was 40 s
  'enc_yard/B2': { afterSpawnOf: 'B' },
  'enc_yard/B3': { afterSpawnOf: 'B', aliveAtMost: 3 },
  // Polish round 4 (R3, both the combat and the playthrough critic: "the file costs nothing: the three of wave B never
  // arrive across 40 m"). The three who do not queue are an ambush: once the file is down to one, the far door bursts
  // open when she has walked to within FILE_NEAR metres of it, and they are on her together. If she never comes down
  // the gallery they come to her after `nearTimeout` (no dead end). The fixer's "2 s after the first hit" still had
  // them cross the whole corridor in her sights (plain 0 / 0 / 0 HP, careless 0 / 36 / 0).
  // Polish round 5 (R3 / R10; both critics again: one line round and three shots, nothing lost by anyone). Composition,
  // not numbers: the walkway gets a threat at BOTH ends. With the file down to one, when she has come within
  // `FILE_NEAR_REAR` metres of the far door (or 25 s on), two who did not queue start down flight 3 of the peg stair
  // behind her and run the length of the gallery after her (wave R, `nar_file_behind`); `FILE_REAR` seconds later the
  // bang on the far door, and `FILE_BURST` after that it bursts on the three (wave B). The two ends reach her within
  // about two seconds of each other; whichever way she has turned, something is at her back.
  'enc_file/R': { afterDownOf: 'A', left: 1, delay: 0, near: FILE_NEAR_REAR, nearOf: 'door_gallery_far', nearTimeout: 25 },
  // Release pass p0 (the playthrough critic: "still free for a player who looks both ways", plain 0 / 0 / 0). Five
  // timings were played by three plain and three careless proxies (scratch/p0-team-world/NOTES.md, f1 to f5: the door
  // gated on the pair closing on her, the pair's gate at 10, 13 and 16 m, the door before and after the pair). None
  // touched the plain proxy more than once in three (18 HP), and every one of them cost the careless proxy 72 to 88
  // or a death, where this timing costs it 54 / 54 / 0. R3's player is the careless one: the timing stands.
  'enc_file/B': { afterSpawnOf: 'R', delay: FILE_REAR, burst: FILE_BURST },
};
const ENEMY_KINDS = ['bider', 'transit', 'tamper', 'windlass'] as const;

/** The plans of an encounter's waves (repeating waves, the boss's own adds, are not planned: the boss spawns them). */
export function planWaves(enc: EncounterData, enemyOf: (spawn: MarkerId) => string): WavePlan[] {
  const plans: WavePlan[] = [];
  const waves = enc.waves.filter((w) => !w.repeating);
  for (let i = 0; i < waves.length; i++) {
    const w = waves[i] as (typeof waves)[number];
    const prev = i > 0 ? (waves[i - 1] as (typeof waves)[number]) : null;
    const p: WavePlan = {
      id: w.id, size: w.spawns.length, mode: i === 0 ? 'start' : 'afterDown', ref: i - 1,
      // "a wave triggers when the previous wave is down to one alive" (a lone enemy: when it is down)
      left: prev && prev.spawns.length > 1 ? 1 : 0, delay: w.delay, timeout: -1, hitTimeout: -1, clockAt: -1, cancelIfDown: -1, aliveAtMost: -1,
      gated: false, gateTimeout: -1,
    };
    if (w.atSeconds !== undefined) {
      p.mode = 'clock'; p.clockAt = w.atSeconds; p.delay = 0;
      if (w.cancelledIf !== undefined) {
        // "the Tamper is dead at t = 40 s": the wave that holds the enemy the text names
        const text = w.cancelledIf.toLowerCase();
        for (let k = 0; k < waves.length; k++) {
          if ((waves[k] as (typeof waves)[number]).spawns.some((sp) => ENEMY_KINDS.some((kind) => text.includes(kind) && enemyOf(sp) === kind))) p.cancelIfDown = k;
        }
      }
    } else if (w.afterWaveDownSeconds !== undefined) {
      p.mode = 'afterDown'; p.left = 0; p.delay = w.afterWaveDownSeconds; p.timeout = w.orAtSeconds ?? -1;
    }
    const rule = WAVE_RULES[enc.id + '/' + w.id];
    if (rule) {
      if (rule.left !== undefined) p.left = rule.left;
      if (rule.timeout !== undefined) p.timeout = rule.timeout;
      if (rule.hitTimeout !== undefined) p.hitTimeout = rule.hitTimeout;
      if (rule.aliveAtMost !== undefined) p.aliveAtMost = rule.aliveAtMost;
      if (rule.afterSpawnOf !== undefined) { p.mode = 'afterSpawn'; p.ref = waves.findIndex((x) => x.id === rule.afterSpawnOf); }
      if (rule.afterDownOf !== undefined) { p.mode = 'afterDown'; p.ref = waves.findIndex((x) => x.id === rule.afterDownOf); }
      if (rule.delay !== undefined) p.delay = rule.delay;
      if (rule.near !== undefined) { p.mode = 'afterDown'; p.gated = true; p.gateTimeout = rule.nearTimeout ?? -1; p.timeout = -1; p.hitTimeout = -1; }
    }
    plans.push(p);
  }
  return plans;
}

/** GDD 6.5: Biders drop pk_rounds_6 at 25 % (Easy 40 %, Hard 15 %) */
export const DROP_CHANCE: Readonly<Record<Difficulty, number>> = { easy: 0.4, normal: 0.25, hard: 0.15 };
/** the ammo floor: cylinder + reserve at or under this, and the next Bider or breakable drops a packet */
export const AMMO_FLOOR = 6;
/** polish round 4 (R1): seconds between two packets of the Tamper's ammo floor (it was one per attempt) */
export const TAMPER_MERCY_EVERY = 10;
/** polish round 5: this many rounds in a row off the Tamper's plate, and `hint_tamper_vent` is said (Easy and Normal) */
export const TAMPER_PLATE_HINT = 4;
const TAMPER_HINT_KEY = 'hint_tamper_vent';
/** where the packet of a wholly dry player lies: one step out from the hall's line locker */
const TAMPER_MERCY_AT = 'ia_line_locker_hall';
/**
 * What a Bider freed or felled drops (GDD 6.5). The ammo floor is mandatory and comes first; a boss add always drops
 * (a canteen under 34 HP, else a packet); anything else at the difficulty's chance. '' = nothing.
 */
export function decideDrop(o: { bider: boolean; counted: boolean; bossAdd: boolean; ammo: number; health: number; roll: number; chance: number; floorOnly?: boolean }): PickupKind | '' {
  // a Transit put down (polish round 3): nothing by chance, but the ammo floor holds for it as for a Bider: a plain
  // player ran dry in the yard, where the first three to fall are Transits
  if (o.floorOnly) return o.ammo <= AMMO_FLOOR ? 'pk_rounds_6' : '';
  if (!o.bider || !o.counted) return '';
  if (o.ammo <= AMMO_FLOOR) return 'pk_rounds_6';
  if (o.bossAdd) return o.health < 34 ? 'pk_canteen' : 'pk_rounds_6';
  return o.roll < o.chance ? 'pk_rounds_6' : '';
}

// =====================================================================================================
// The director
// =====================================================================================================

const NONE = 0, DORMANT = 1, DUE = 2, ALIVE = 3, DOWN = 4;
interface Member { marker: LayoutMarker; wave: number; id: EntityId; state: number; kind: SpawnRequest['kind']; counted: boolean; order: number }
interface Enc {
  id: EncounterId;
  data: EncounterData;
  state: EncounterState;
  boss: boolean;
  sched: WaveScheduler;
  waves: EncounterData['waves'];
  members: Member[];
  view: EncounterView;
  freed: number; felled: number;
  lastAnnounced: boolean;
  slowDone: boolean;
  vignette: VignetteId | '';
  /** the Tamper's mercy packet has been given in this attempt (the ammo floor, below) */
  mercy: boolean;
  /** seconds until the Tamper's ammo floor may give again (polish round 4: it repeats, `TAMPER_MERCY_EVERY`) */
  mercyWait: number;
  /** this encounter holds a Tamper (the floor below is its own) */
  tamper: boolean;
  /** polish round 5: rounds turned by the Tamper's plate in a row (a vent or line hit starts the count again), and the hint said for it in this attempt */
  plateRun: number;
  plateHinted: boolean;
  /** a door to open once the build has nothing pending (the hatch waits for the staged gallery) */
  openWhenBuilt: MarkerId;
  openLeft: number;
  /**
   * doors of `locksDoors` that stood open with her on the far side when the fight began: each is shut and locked once
   * she is inside the encounter's zone and clear of it, never in her face
   */
  lockLater: MarkerId[];
  /** the gated waves (an ambush sprung by her coming near): the wave, where its door stands, the distance squared */
  gates: { wave: number; x: number; z: number; near2: number }[];
  /** a door that bursts open `burstIn` seconds from now (-1: none): the ambush wave has gathered behind it */
  burstDoor: MarkerId;
  burstIn: number;
}
interface Trig {
  marker: LayoutMarker; flag: string; inside: boolean; requires: EncounterId | ''; once: boolean; kill: boolean; generic: boolean; subject: LayoutMarker | null; figure: boolean; sx: number; sy: number; sz: number; range2: number;
  /** seconds the subject has been in her view without a break (LOOK_DWELL) */
  lookT: number;
  /** a drawing's fallback: the cage she leaves the zone by (centre x, z and half extent; 0 = none: the volume itself) */
  cx: number; cz: number; chalf: number;
  /** a figure's trigger has been walked through without a look at the figure (she went by) */
  crossed: boolean;
  /** pass i3: the look gate of its lines (LOOK_GATES), seconds since it was crossed without the look, a second volume (ALSO_AT) */
  gate: LookGate | null; crossT: number; also: LayoutMarker | null;
}
/** a prop that names its own line (NEAR_LINE) */
interface NearLine { marker: LayoutMarker; key: StoryKey; t: number; readable: string }

/** what debug.clearEncounter has to have happened first: the puzzle that stands in front of the encounter */
const PREREQUISITE: Readonly<Partial<Record<EncounterId, PuzzleId>>> = { enc_tally: 'daylight', enc_file: 'proving_line', enc_windlass: 'the_asking' };
/** the boss's own events commit its four checkpoints (their markers stand 0.5 m apart: never by proximity) */
const BOSS_CHECKPOINT: Readonly<Partial<Record<BossPhase, CheckpointId>>> = { p1: 'cp_boss_p1', p2: 'cp_boss_p2', p3a: 'cp_boss_p3', proven: 'cp_boss_proven', p3b: 'cp_boss_proven' };
/**
 * The sighting (lead ruling R4, polish round 3: "held until the player has actually looked at it"). He is in view
 * inside SIGHT_COS (the beat and its line start there: nothing is narrated off screen); she has LOOKED AT him only
 * while he is within LOOK_COS of the middle of her view. He goes when she looks away for 2 s after having looked at
 * him for 1 s, or 12 s into the beat once she has looked at him for that second. Until then he stands: the door's own
 * clock (12 s after she came into the strip) opens the door but no longer takes him off the mesa unseen.
 */
const SIGHT_COS = Math.cos(30 * DEG2RAD);
const LOOK_COS = Math.cos(15 * DEG2RAD);
const SIGHT_LOOKED = 1, SIGHT_AWAY = 2;
/**
 * Pass i1 (story reviewer: a brisk player never heard "When she looked again there was only rim"): once the tally door
 * has opened by its clock, turning from him to the door is looking away: half a second of it is enough. And the line,
 * once it is on screen, is not cut when she walks in (it was cut mid-sentence at the threshold); only a line that has
 * not started is dropped there.
 */
const SIGHT_AWAY_OPEN = 0.5;
/**
 * Pass i1 (story reviewer: "One sat in the niche, apart from the rest. It turned its hood to watch her." was said as
 * she crossed a 2 m trigger abreast of the niche, with no figure in the frame). A vignette trigger with a figure of
 * its own (`prop_<name>` for `trg_<name>`) starts when she LOOKS at the figure: within WATCH_RANGE metres, inside
 * WATCH_COS of the middle of her view, with a clear line to it. Its first line is then on screen at once (over a room
 * line that has had URGENT_READ of its time). Crossing the trigger without having looked still starts it, with a glint
 * at the figure to draw the eye, and the line waits up to WATCH_HOLD seconds for her to turn to it.
 */
export const WATCH_RANGE = 9, WATCH_UP = 0.95;
/**
 * Pass i2 (both story reviewers: at the trigger, facing down the stair, the niche is off the edge of the frame, and the
 * lines started 1.5 s later whether she had turned or not). The lines are said ONLY when she has looked at the figure:
 * it has been inside WATCH_COS of the middle of her view, in range and with a clear line, for `LOOK_DWELL` seconds
 * (before the trigger, on it or after it, for as long as she is in range). Crossing the trigger without a look plays
 * the figure's own motion (its hood turns) and says nothing; the glint in the mouth of the niche goes on drawing the
 * eye while she is near. A player who never looks is told nothing about a thing she never saw.
 */
export const LOOK_DWELL = 0.4;
/**
 * Pass i2 (story reviewer a: "His cup on their hearthstone..." was said on the way to the hatch, a room's length from
 * the hearth and after his note there had been read). A prop that names its line (`params.line` begins with the key:
 * `prop_cup_two`) is described when she first stands within `NEAR_LINE` metres of it and is turned to it (inside
 * NEAR_COS, for LOOK_DWELL), out of a fight, or when she opens a readable that lies within `NEAR_READ` metres of it,
 * whichever is first. The encounter's `onClear.lines` still names the line: that slot is the fallback of a player who
 * never went near (the once-only rule refuses it there when it has been said).
 */
export const NEAR_LINE = 3, NEAR_READ = 1.5, NEAR_UP = 0.5;
const NEAR_COS = Math.cos(35 * DEG2RAD);
/**
 * Pass i2 (story reviewer b: 36.7 s of listening between the bore door and the first phase, the first 7.4 s of it a
 * line about the cradle). The Windlass's first parley line opens its scene (`StoryApi.opening`: what is only waiting
 * and is not story is let go, and it is said at once), and the two roll-call lines are held `PARLEY_ROLL_HOLD` seconds
 * each instead of 4.5 and 4 (src/enemies/defs.ts BOSS.parley carries the same clock: the inspection opens 21.5 s after
 * the seal, it was 23 on paper and 31.7 as played).
 */
export const PARLEY_ROLL_HOLD = 4.5;
/**
 * Pass i3 (story reviewer b: still 29.9 s of standing from the seal to phase 1, the longest passive stretch of the stage,
 * straight before its hardest fight). In this pass the enemies team made the asking's clock follow each line AS HELD
 * (src/enemies/boss/parley.ts `parleyPlan`, `shown`: a stage lasts exactly the `seconds` that `story/line` reports), so
 * the holds below ARE the asking's length. The text is frozen (design/story.json) and the merged roll-call line would
 * be 89 characters (the subtitle rule is 84), so the six lines stay and are held shorter: the station's first
 * `PARLEY_FIRST_HOLD` (5.5 written; ten words), the narrator's and the Reeve's `PARLEY_SPOKEN_HOLD` each (4.5 written;
 * nine words each), the two roll-call lines `PARLEY_ROLL_HOLD` each (3.5 in pass i2; the six mouth lamps come on in
 * turn under them, a second apart). The last line, which states the rule of the fight, keeps its five seconds.
 * 4 + 4 + 4 + 3 + 3 and five breaths: the six stand open 19.25 s after the first line appears (it was 22.75) and phase 1
 * begins at 24.25 s (27.75). The 4 s the six stand open and the second after are the Windlass's.
 */
/**
 * Closing of pass i3: the text change was made. The two roll-call lines are ONE line (`stn_parley_2`, 67 characters,
 * `stn_parley_3` is gone) held `PARLEY_ROLL_HOLD` = 4.5 s, the six mouth lamps coming on across it; the first line is held
 * 3.5 s. design/story.json carries the same seconds, so the holds below only repeat the data. 3.5 + 4 + 4 + 4.5 and four
 * breaths: the six stand open 17.0 s after the first line appears and phase 1 begins at 22.0 s.
 */
export const PARLEY_FIRST_HOLD = 3.5, PARLEY_SPOKEN_HOLD = 4;
/**
 * The niche is recessed: the figure can be seen only from about 1.5 m before she is abreast of it, 50 degrees off the
 * line of the stair. So the eye is drawn before that: while she is within WATCH_RANGE and the moment has not begun, a
 * small glint (the star card; a 0.4 m violet halo at half strength could not be seen on the stair) stands in the mouth of the niche (WATCH_MOUTH metres out from the figure toward the stair) every
 * WATCH_GLINT_EVERY seconds, as the rod's glint points at the man on the mesa.
 */
export const WATCH_MOUTH = 0.8, WATCH_GLINT_EVERY = 1.5, WATCH_GLINT_SECONDS = 0.5, WATCH_GLINT_LEVEL = 0.45;
const WATCH_COS = Math.cos(28 * DEG2RAD);
/**
 * Pass i1 (story reviewer; the fixer's note in docs/requests/world.md): "The lift head, drawn on the wall" is said on
 * the floor before the ring, where she walks east with the diagram 43 degrees and more to her left (the edge of the
 * frame, then out of it). The same rule as the watcher's, without the glint: once the Tamper is down, looking at the
 * diagram from anywhere in the hall within VIEW_RANGE metres starts its lines, with the drawing in the middle of her
 * view; the floor before the ring still says them to a player who never looked (they are never stale).
 */
export const VIEW_RANGE = 26, VIEW_OFF = 0.5;
/**
 * Pass i2 (story reviewer b: the three lines began the moment the Tamper fell, because she stood on the trigger's
 * floor, and played over the cage's lever). The floor says nothing by itself now: the lines start when the drawing has
 * been in her view (inside DRAW_COS, in range, a clear line) for LOOK_DWELL seconds, from anywhere in the hall. Only a
 * player who walks up to the cage (CAGE_NEAR) without ever having had it in view is told there (the lines are
 * load-bearing: the only place play says what the seventh round is), and the ride carries them as before.
 */
const DRAW_COS = Math.cos(30 * DEG2RAD);
/** she is on her way out when she is within this many metres of the cage (its gate is the hall's only way on) */
export const CAGE_NEAR = 3.5;
/**
 * R4: the figure is at least this tall on screen, in pixels of a 720-line frame, from wherever she stands. The card is
 * the enemies' (its vignette puts it on the mesa) and its smallest drawn size is theirs and the renderer's (8 and 9 px:
 * docs/requests/code-world.md 9.1). Until those numbers follow the ruling the world stands the card in a group of its
 * own and scales that group by what is missing; the factor is 1 once the card comes out tall enough by itself.
 */
// pass i2 (visual reviewer: "about 30 px tall and under the crosshair ... scale the far figure to about 50-60 px at 720p"):
// 62 px of card, a figure of about 56: the hat, the coat and the forked rod read as a man, not a mark on the skyline
const SIGHT_MIN_PX = 62;                               // of the card: the drawn figure fills about nine tenths of it (56 px; it was 32 / 28)
const SIGHT_SINK = 0.05;                              // of the card's height: how far its foot line stands under the rim's top (exterior look, pass i3)
const BREADCRUMB_AFTER = 20;
/**
 * the health each phase of the Windlass begins with at least: two full segments (src/player/defs.ts SEGMENT_TOPS; the
 * respawn's own floor, RESPAWN_MIN_HEALTH 60, lies inside the second)
 */
export const BOSS_HEALTH_FLOOR = 67;
/** under this many rounds in reserve as phase 1 breaks, a tin of twelve falls at her feet */
export const BOSS_BREAK_RESERVE = 12;
const LETHAL = 100000;
/**
 * A door a trigger shuts behind her starts to close when she is this far past its plane: it shuts at her back, not on
 * her heels (the bore door's trigger begins 2.4 m inside it, on the nav link the door gates).
 */
const SEAL_CLEAR = 2.75;
/** a door whose lock was put off (she was outside when the fight began) shuts once she is this far inside it */
const LOCK_INSIDE = 1.5;
/**
 * GDD 4.2 (Fight 1): the two lines that teach "a round through the crown knot frees, a round through the body fells".
 * Each once per run, on the event itself. No marker names them: these are the keys of story.json
 * (meta.rules.once_only; docs/requests/code-world.md asks level design for a field).
 */
const LINE_FIRST_FELLED = 'nar_first_fell', LINE_FIRST_FREED = 'nar_first_seat';

// =====================================================================================================
// Pass i3: lines said while their subject is on screen (both story reviewers). The design data is frozen for the world
// in this pass, so what these rules need beside the layout is carried here; docs/requests/world.md asks for the fields.
// =====================================================================================================
/** a sight line for a look test passes a grille and low cover (the gantry's cage, a kerb) */
const SIGHT_THROUGH = ColFlag.LOW | ColFlag.GRILLE;
/**
 * A trigger whose lines are about one thing she may or may not be facing as she crosses it ("It hung over the bore like
 * her own cylinder" was said on the gantry while she looked along it, the Windlass 90 degrees to her right; "Embers,
 * still orange" as she faced the bore door with the camp behind her). The lines are said when the thing has been inside
 * `cos` of the middle of her view, within `range` metres, on the trigger's level (`level` metres of height) and with a
 * clear line (through a grille) for LOOK_DWELL seconds: before, on or after the trigger. They are then PRESENT lines:
 * next, ahead of what waits. Crossing the trigger without that look says nothing yet; `cue` / `caption` draw the ear to
 * the thing, and the lines are never lost: they are said anyway once she is `leave` metres from the trigger or off its
 * level (the far end of the gantry), or `after` seconds on with the thing at least in frame (`frameCos`), or `last`
 * seconds on whatever she faces. 0 = that fallback is not used.
 */
interface LookGate {
  /** the marker the lines are about: a vista's `target`, else the marker's own position raised by `up`; or the point `at` */
  subject: MarkerId; up: number; cos: number; frameCos: number; range: number; level: number;
  leave: number; after: number; last: number; cue: AudioCue | ''; caption: StoryKey;
  at?: readonly [number, number, number];
  /** crossing the trigger says its lines at once, as an ungated trigger does (the look only brings them forward) */
  cross?: boolean;
}
export const LOOK_GATES: Readonly<Record<MarkerId, LookGate>> = {
  trg_windlass_seen: { subject: 'vista_windlass', up: 0, cos: Math.cos(30 * DEG2RAD), frameCos: Math.cos(50 * DEG2RAD), range: 30, level: 1.5, leave: 8.5, after: 0, last: 0, cue: 'ratchet', caption: 'cap_ratchet' },
  trg_ante_enter: { subject: 'prop_camp_three', up: 0.3, cos: Math.cos(35 * DEG2RAD), frameCos: Math.cos(50 * DEG2RAD), range: 8, level: 2, leave: 0, after: 6, last: 20, cue: '', caption: '' },
  // "Coats on pegs, all the way down": from the Tally House floor, the moment she looks down the open hatch at the first
  // flight's coats (the point `at`, a clear line through the hatch); else on the stair itself (ALSO_AT). A second and
  // more gained on the two lines' ten seconds: the second begins on the stair for a player who never breaks step
  trg_peg_stair: { subject: 'trg_peg_stair', up: 0, at: [-90.5, -1.2, -33], cos: Math.cos(30 * DEG2RAD), frameCos: Math.cos(50 * DEG2RAD), range: 7, level: 9, leave: 0, after: 0, last: 0, cue: '', caption: '', cross: true },
};
/**
 * A second volume for a trigger (the union fires it). `trg_peg_stair` stands on flight 2, a second and a half before
 * the watcher's niche, and its two lines take ten seconds: "The low pegs were bare" was said in the proving bay. The
 * coats begin at the hatch, so the lines begin there: flight 1, from its second step down.
 */
export const ALSO_AT: Readonly<Record<MarkerId, { pos: [number, number, number]; size: [number, number, number] }>> = {
  trg_peg_stair: { pos: [-90.25, -4.5, -33], size: [6.5, 4.1, 2] },
};
/**
 * A line of the peg stair that is about the stair: dropped unheard when its turn comes with her off the foot of it
 * (her feet below `y`, the bay's floor, and more than two strides into the bay: south of `z`). The watcher's lines go
 * ahead of it while she looks at the watcher.
 */
export const STAIR_LINES: Readonly<Record<StoryKey, { y: number; z: number }>> = { nar_pegs_2: { y: -11.7, z: -15.5 } };
/**
 * The kneeler (story reviewer a: "Somebody knelt at the trough, scooping" was said at the gate posts, 43 m off, where
 * the kneeler is fifteen pixels of haze, and it stood up three seconds later: nobody saw it kneel). The gate still
 * shows the movement card and names the town; the fight and the kneeler's line begin when she is within `look` metres
 * of it with it inside `cos` of the middle of her view and no line on screen (its own starts at once), or within
 * `anyway` metres whatever she faces and whatever is being said. Until then it kneels and scoops. A round into it from further off starts the fight as before (and the line is not said of a
 * figure that is no longer kneeling).
 */
export const HELD_START: Readonly<Record<MarkerId, { line: StoryKey; look: number; cos: number; anyway: number; up: number }>> = {
  trg_enc_street: { line: 'nar_kneeler', look: 24, cos: Math.cos(20 * DEG2RAD), anyway: 20, up: 0.6 },
};
/**
 * "The Rule stood on the far edge of everything. It leaned." (story reviewer b: said to a brisk player facing the jug
 * gate's wall). The line waits for the Rule: inside RULE_COS of the middle of her view with open sky that way for
 * RULE_SIGHT metres. It is dropped if she leaves the gully without that look.
 */
const RULE_LINE = 'nar_rule', RULE_VISTA = 'vista_rule';
export const RULE_COS = Math.cos(38 * DEG2RAD), RULE_SIGHT = 120;      // (38: in frame at 4:3 too, not only dead ahead; the gully bends 30 degrees)
/**
 * Ruling R2 (story reviewer b: a player who stands and shoots in phase 1 is dead in 13 s, and the lines that say what
 * hit her came only after the second death). The Windlass's defence is taught when it is first needed: the first stake
 * or canister that lands on her in a run says `TEACH_MOVE` at once, and the first retry of the fight says `TEACH_HAUL`
 * `TEACH_AFTER` seconds after she has control (and `TEACH_MOVE` behind it if no hit had said it). The Windlass's own
 * sayings (the first haul of a try, the second death in a phase: src/enemies/defs.ts) stay as the repeat; its haul
 * line is not said twice within HINT_ECHO seconds.
 */
export const TEACH_MOVE = 'hint_boss_move', TEACH_HAUL = 'hint_boss_haul', TEACH_AFTER = 0.5;

class Director implements DirectorApi {
  private readonly encs: Enc[] = [];
  private readonly byId = new Map<EncounterId, Enc>();
  private readonly triggers: Trig[] = [];
  private readonly request: SpawnRequest = { kind: 'bider', spawn: '', encounter: '', wave: '', dormantClip: '', entrance: '', lane: '', order: 0, counted: true };
  private readonly damage: DamageInfo = { amount: LETHAL, kind: 'kill_volume', source: 'world', sourceId: 'world', ammo: null, shotId: 0, ox: 0, oy: 0, oz: 0, dx: 0, dy: -1, dz: 0 };
  private readonly startedPayload: GameEvents['encounter/started'] = { id: 'enc_street' };
  private readonly wavePayload: GameEvents['encounter/wave'] = { id: 'enc_street', wave: '' };
  private readonly lastPayload: GameEvents['encounter/last_enemy'] = { id: 'enc_street', enemy: '' };
  private readonly clearedPayload: GameEvents['encounter/cleared'] = { id: 'enc_street', seconds: 0 };
  private readonly resetPayload: GameEvents['encounter/reset'] = { id: 'enc_street' };
  private readonly vignettePayload: GameEvents['vignette/state'] = { id: 'vig_dowser', stage: 'ended' };
  // ---- the intro mood of a zone (the_lip's glare)
  private glareZone: ZoneId | '' = '';
  private glareTrigger: MarkerId = '';
  private glareFlag = '';
  private exposureFlag = '';
  private glareTo: MoodId = 'L1';
  private glareLeft = 0;
  // ---- the exposure a trigger opens (the Tally House)
  private exposureZone: ZoneId | '' = '';
  private exposureTrigger: MarkerId = '';
  private exposureMult = 1;
  private exposureSeconds = 1.5;
  // ---- the sighting (trg_dowser)
  private readonly sightTrigger: LayoutMarker | undefined;
  private readonly sightAfter: EncounterId | '' = '';
  private readonly sightTarget: [number, number, number] = [0, 0, 0];
  private readonly sightDoor: MarkerId = '';
  private readonly sightLight: MarkerId = '';
  private sight = 0;                                  // 0 not yet, 1 he stands there, 2 the beat runs, 3 gone (the line is playing), 4 over
  private sightClear = 0; private sightEntered = false; private sightEnter = 0; private sightBeat = 0; private sightLooked = 0; private sightAway = 0;
  private sightCrumb = false;
  /** the tally door has been let go (the sighting's line, or its 12 s clock): he may still be standing there */
  private sightDoorOpen = false;
  /** R4 (SIGHT_MIN_PX): the group the far card stands in, the card's root, its authored height and the shader's floor */
  private sightWrap: THREE.Group | null = null;
  private sightCard: THREE.Object3D | null = null;
  private sightCardH = 1.9; private sightCardFloor = 0;
  // ---- vignettes whose clock is run here
  private vigId: VignetteId | '' = '';
  private vigLeft = 0;
  private vigSkipEnc: EncounterId | '' = '';
  private turnWatch: EntityId = '';
  private turnLine = '';
  /** the encounter whose first member's turn the line waits for (the line never leaves that fight) */
  private turnEnc: EncounterId | '' = '';

  constructor(private readonly s: State) {
    const { data, events } = s.ctx;
    const enemyOf = (id: MarkerId): string => paramString(data.layout.markers.find((m) => m.id === id) as LayoutMarker, 'enemy');
    for (const id of ENCOUNTERS) {
      const d = data.encounter(id);
      const boss = Object.keys(d.composition).includes('windlass');
      const waves = boss ? [] : d.waves.filter((w) => !w.repeating);
      const members: Member[] = [];
      waves.forEach((w, wi) => w.spawns.forEach((sp, k) => {
        const m = data.layout.markers.find((x) => x.id === sp) as LayoutMarker;
        members.push({ marker: m, wave: wi, id: '', state: NONE, kind: paramString(m, 'enemy') as SpawnRequest['kind'], counted: m.params.counted !== false, order: paramNumber(m, 'order', k + 1) });
      }));
      const first = waves[0] ? data.layout.markers.find((x) => x.id === (waves[0] as (typeof waves)[number]).spawns[0]) : undefined;
      const trigger = data.layout.markers.find((x) => x.id === d.trigger);
      const vig = (first?.params.vignette as { id?: VignetteId } | undefined)?.id ?? (trigger?.params.vignette as { id?: VignetteId } | undefined)?.id ?? '';
      const enc: Enc = {
        id, data: d, state: 'idle', boss, sched: new WaveScheduler(boss ? [] : planWaves(d, enemyOf)), waves, members,
        view: { id, state: 'idle', wave: '', alive: 0, spawned: 0, seconds: 0 }, freed: 0, felled: 0, lastAnnounced: false, slowDone: false,
        vignette: vig, mercy: false, mercyWait: 0, tamper: members.some((m) => m.kind === 'tamper'), plateRun: 0, plateHinted: false, openWhenBuilt: '', openLeft: 0, lockLater: [],
        gates: [], burstDoor: '', burstIn: -1,
      };
      enc.sched.plans.forEach((p, wi) => {
        if (!p.gated) return;
        const wave = waves[wi] as (typeof waves)[number];
        const rule = WAVE_RULES[id + '/' + wave.id];
        const first = data.layout.markers.find((x) => x.id === wave.spawns[0]);
        const at = data.layout.markers.find((x) => x.id === (rule?.nearOf ?? wave.opensDoor ?? '')) ?? first;
        if (at && rule && rule.near !== undefined) enc.gates.push({ wave: wi, x: at.pos[0], z: at.pos[2], near2: rule.near * rule.near });
      });
      this.encs.push(enc);
      this.byId.set(id, enc);
    }
    for (const m of data.markersOfType('trigger')) {
      const kind = paramString(m, 'kind');
      if (kind === 'lane' || kind === 'bay') continue;          // the enemies module reads these
      const req = /^(enc_[a-z_]+) clear$/.exec(paramString(m, 'requires'));
      const ramp = m.params.exposureRamp as { from?: MoodId; to?: MoodId; seconds?: number } | undefined;
      if (ramp && ramp.to) { this.glareZone = m.zone; this.glareTrigger = m.id; this.glareFlag = 'trg:' + m.id; this.glareTo = ramp.to; }
      const exposure = /^([+-]?\d+(?:\.\d+)?) stop over (\d+(?:\.\d+)?) s$/.exec(paramString(m, 'exposure'));
      if (exposure) { this.exposureZone = m.zone; this.exposureTrigger = m.id; this.exposureFlag = 'trg:' + m.id; this.exposureMult = Math.pow(2, Number(exposure[1])); this.exposureSeconds = Number(exposure[2]); }
      const sighting = typeof m.params.holdsDoor === 'string';
      if (sighting) {
        this.sightTrigger = m;
        this.sightAfter = req ? (req[1] as EncounterId) : '';
        this.sightDoor = paramString(m, 'holdsDoor');
        const vista = data.layout.markers.find((x) => x.id === m.params.vista);
        const target = vista?.params.target as [number, number, number] | undefined;
        if (target) { this.sightTarget[0] = target[0]; this.sightTarget[1] = target[1]; this.sightTarget[2] = target[2]; }
        const light = data.markersOfType('light').find((x) => x.params.kind === 'breadcrumb' && paramString(x, 'litWhen').includes(this.sightDoor));
        this.sightLight = light ? light.id : '';
      }
      this.triggers.push({
        marker: m, flag: 'trg:' + m.id, inside: false, requires: req ? (req[1] as EncounterId) : '', once: m.params.once === true, kill: kind === 'kill',
        // a puzzle's volume belongs to its puzzle (its objective is all the director reads); the sighting and the two
        // seam triggers (a conditional `when`, a set swap) have code of their own
        generic: !sighting && m.params.residentSet === undefined && m.params.when === undefined,
        // (pass i1) what the trigger's lines are about, when it stands in the layout as `prop_<name>` for `trg_<name>`:
        // looked at, it starts the trigger (the watcher in its niche, WATCH_RANGE; the diagram on the hall's wall, VIEW_RANGE)
        subject: null, figure: false, sx: 0, sy: 0, sz: 0, range2: 0, lookT: 0, cx: 0, cz: 0, chalf: 0, crossed: false,
        gate: null, crossT: 0, also: null,
      });
    }
    // (pass i3) look gates, second volumes, the lines of the stair
    for (const t of this.triggers) {
      const m = t.marker;
      const also = ALSO_AT[m.id];
      if (also) t.also = { ...m, pos: also.pos, size: also.size, rotY: 0 };
      const g = LOOK_GATES[m.id];
      const sub = g ? data.layout.markers.find((x) => x.id === g.subject) : undefined;
      if (!g || !sub || !t.generic) continue;
      const target = sub.params.target as [number, number, number] | undefined;
      t.gate = g;
      t.sx = target ? target[0] : sub.pos[0]; t.sy = (target ? target[1] : sub.pos[1]) + g.up; t.sz = target ? target[2] : sub.pos[2];
      if (g.at) { t.sx = g.at[0]; t.sy = g.at[1]; t.sz = g.at[2]; }
      if (g.cross) continue;                                // (an ungated trigger's lines are not tied to a fight)
      // what a gated trigger says is behind her once the fight of its zone has begun
      const fight = this.encs.find((e) => e.data.zone === m.zone);
      if (fight) for (const key of paramList(m, 'lines')) s.story.unless(key, () => fight.state !== 'idle');
    }
    for (const key of Object.keys(STAIR_LINES)) {
      const foot = STAIR_LINES[key] as (typeof STAIR_LINES)[string];
      s.story.unless(key, () => { const p = s.ctx.player.position; return p.y < foot.y && p.z > foot.z; });
    }
    for (const id of Object.keys(HELD_START)) {
      const h = HELD_START[id] as (typeof HELD_START)[string];
      const enc = this.encs.find((e) => e.data.trigger === id);
      // the line is about a figure that kneels: not said once it has gone down, or the fight is over
      if (enc) s.story.unless(h.line, () => enc.state === 'cleared' || (enc.members[0] as Member | undefined)?.state === DOWN);
    }
    this.ruleVista = data.layout.markers.find((x) => x.id === RULE_VISTA);
    if (this.ruleVista && data.story.lines[RULE_LINE] !== undefined) {
      const zone = this.ruleVista.zone;
      s.story.waitWhile(RULE_LINE, () => !this.ruleSeen());
      s.story.unless(RULE_LINE, () => s.zone !== zone && !s.zoneHeld);
    }
    events.on('player/damaged', (e) => {
      // R2: the first stake or canister that lands says what it could hit
      const boss = this.bossEnc;
      if (!boss || boss.state !== 'active' || !s.running || e.source !== 'windlass' || (e.kind !== 'stake' && e.kind !== 'canister')) return;
      const phase = s.ctx.enemies.boss.phase;
      if ((phase !== 'p1' && phase !== 'p2') || s.story.heard(TEACH_MOVE) || data.story.lines[TEACH_MOVE] === undefined) return;
      s.story.sayNow(TEACH_MOVE);
    });
    for (const t of this.triggers) {
      const m = t.marker;
      if (!t.generic || m.params.encounter !== undefined) continue;
      const sub = data.layout.markers.find((x) => x.type === 'prop' && x.id === 'prop_' + m.id.replace(/^trg_/, ''));
      if (!sub) continue;
      t.subject = sub;
      t.figure = m.params.vignette !== undefined;
      if (t.figure) { t.sx = sub.pos[0]; t.sy = sub.pos[1] + WATCH_UP; t.sz = sub.pos[2]; t.range2 = WATCH_RANGE * WATCH_RANGE; continue; }
      // a thing on a wall: its middle, a little off the wall toward the trigger's floor (the sight line ends in the room)
      const ox = m.pos[0] - sub.pos[0], oz = m.pos[2] - sub.pos[2], ol = Math.sqrt(ox * ox + oz * oz) || 1;
      t.sx = sub.pos[0] + (ox / ol) * VIEW_OFF; t.sy = sub.pos[1] + paramNumber(sub, 'height', 2) / 2; t.sz = sub.pos[2] + (oz / ol) * VIEW_OFF;
      t.range2 = VIEW_RANGE * VIEW_RANGE;
      for (const portal of data.layout.nav.portals) {
        const cage = data.layout.markers.find((x) => x.id === portal.cages[0]);
        if (cage && cage.zone === m.zone) { t.cx = cage.pos[0]; t.cz = cage.pos[2]; t.chalf = Math.max(portal.cageInterior[0], portal.cageInterior[2]) / 2; }
      }
    }
    // (pass i2, NEAR_LINE) props that name their own line, and the readable that lies at each
    for (const m of data.layout.markers) {
      if (m.type !== 'prop') continue;
      const named = /^(nar_[a-z0-9_]+)\b/.exec(paramString(m, 'line'));
      const key = named ? (named[1] as string) : '';
      if (key === '' || data.story.lines[key] === undefined) continue;
      const rd = data.markersOfType('readable').find((x) => x.zone === m.zone && Math.hypot(x.pos[0] - m.pos[0], x.pos[2] - m.pos[2]) <= NEAR_READ);
      this.nearLines.push({ marker: m, key, t: 0, readable: rd ? paramString(rd, 'readable') : '' });
    }
    events.on('readable/opened', (e) => {
      for (const l of this.nearLines) if (l.readable !== '' && l.readable === e.key && s.running) s.story.sayFront(l.key);
    });
    // (pass i2, PARLEY_ROLL_HOLD) the Windlass's asking: its first line opens the scene, its roll-call is brisk
    for (const m of data.markersOfType('trigger')) {
      const parley = paramList(m, 'parley');
      if (parley.length === 0) continue;
      s.story.opening(parley[0] as string);
      // the roll-call: the station's lines between its first (the presenting) and its last (the inspection)
      // (pass i3: the first line and the two spoken ones are held shorter too; the last keeps its written time)
      s.story.hold(parley[0] as string, PARLEY_FIRST_HOLD);
      for (let k = 1; k < parley.length - 1; k++) s.story.hold(parley[k] as string, (parley[k] as string).startsWith('stn_') ? PARLEY_ROLL_HOLD : PARLEY_SPOKEN_HOLD);
    }
    // Lines that announce a fight or one of its waves are about something that is over once the fight is cleared: a
    // brisk player heard "Two of them stood" three seconds after both had sat down again (polish round 3). Each is
    // dropped unheard if the encounter is cleared when its turn comes: the wave's lines, the vignette's line and the
    // line said as the first member turns, and the lines of the knot that starts the fight.
    for (const enc of this.encs) {
      const over = (): boolean => enc.state === 'cleared';
      for (const w of enc.waves) for (const key of w.lines ?? []) s.story.unless(key, over);
      for (const m of enc.members) {
        const vig = m.marker.params.vignette as { line?: string; thenLine?: string } | undefined;
        if (vig && vig.line) s.story.unless(vig.line, over);
        if (vig && vig.thenLine) s.story.unless(vig.thenLine, over);
      }
      const knot = data.layout.markers.find((x) => x.id === enc.data.trigger || (x.params.kind === 'knot' && x.params.startsEncounter === enc.id));
      if (knot && knot.params.kind === 'knot') {
        // Polish round 5 (story critic: "Something violet had knotted on the latch" was said 3 s after the latch had
        // burst and the door stood open). A latch knot (one that opens a door) is described when she first looks at
        // it (interact.ts); said on the burst it must start within KNOT_LINE_LATE seconds of it or not at all.
        const latch = paramString(knot, 'opens') !== '';
        const gone = (): boolean => enc.state === 'cleared' || (latch && this.knotAge(knot.id) > KNOT_LINE_LATE);
        for (const key of paramList(knot, 'lines')) s.story.unless(key, gone);
      }
    }
    events.on('knot/burst', (e) => { if (!this.knotAt.has(e.id)) this.knotAt.set(e.id, this.tickNo); });
    // A trigger that waits for a fight to be cleared describes the quiet after it ("Every door wore the well mark"):
    // its lines are dropped if another fight is live when their turn comes (round 5: with the latch knot's line said
    // on sight, the street's line would have waited through the yard and been said at the end of that fight).
    for (const t of this.triggers) {
      if (t.requires === '' || !t.generic) continue;
      const mine = t.requires;
      const fighting = (): boolean => { for (let i = 0; i < this.encs.length; i++) { const e = this.encs[i] as Enc; if (e.id !== mine && (e.state === 'active' || e.state === 'vignette')) return true; } return false; };
      for (const key of paramList(t.marker, 'lines')) if (!s.story.keeps(key)) s.story.unless(key, fighting);
    }
    // Polish round 5 (story critic: the watcher's two lines were said while she stood at the bay's locker, 15 m and a
    // flight of stairs on). A trigger that plays a vignette of its own (no fight) speaks about what she is looking at:
    // its first line is dropped once she is VIGNETTE_NEAR metres from the place, the lines after it once she is
    // VIGNETTE_GONE metres on or if the first was never shown.
    for (const m of data.markersOfType('trigger')) {
      if (m.params.vignette === undefined || m.params.encounter !== undefined) continue;
      const lines = paramList(m, 'lines');
      const first = lines[0] ?? '';
      const beyond = (r: number): boolean => { const p = s.ctx.player.position, dx = p.x - m.pos[0], dz = p.z - m.pos[2]; return dx * dx + dz * dz > r * r; };
      for (let i = 0; i < lines.length; i++) {
        if (i === 0) s.story.unless(first, () => beyond(VIGNETTE_NEAR));
        else s.story.unless(lines[i] as string, () => beyond(VIGNETTE_GONE) || !this.shown.has(first));
      }
      if (first !== '') this.watched.add(first);
    }
    events.on('story/line', (e) => { if (this.watched.has(e.key)) this.shown.add(e.key); });
    this.linesMarker = data.markersOfType('trigger').find((m) => namedLine(m, 'lines', 'lined') !== '');
    this.linesEnc = this.linesMarker ? this.encs.find((e) => e.data.zone === this.linesMarker?.zone && !e.boss) : undefined;
    this.bossEnc = this.encs.find((e) => e.boss);
    events.on('enemy/felled', (e) => this.onDown(e.id, e.encounter, 'felled', e.counted, e.x, e.y, e.z));
    events.on('enemy/freed', (e) => this.onDown(e.id, e.encounter, 'freed', e.counted, e.x, e.y, e.z));
    events.on('enemy/died', (e) => this.onDown(e.id, e.encounter, 'died', true, e.x, e.y, e.z));
    events.on('enemy/damaged', (e) => this.onDamaged(e.id));
    events.on('enemy/state', (e) => this.onEnemyState(e.id));
    events.on('boss/phase', (e) => this.onBossPhase(e.phase));
    events.on('boss/proven', () => this.onBossPhase('proven'));
    events.on('boss/defeated', (e) => this.onBossDefeated(e.cleanSix));
    events.on('player/died', () => this.onPlayerDied());
    // "Knots burst" on the end card is every knot she put a round through: the mechanism knots (State.knotBurst), the
    // crown knot of each Bider freed (onDown), and the Windlass's own: its pawls and each pip of its three phases
    // (polish round 3: the card read 0 beside fifteen freed)
    events.on('boss/pawl', (e) => { if (e.burst && s.running) s.stats.knotsBurst++; });
    events.on('boss/pips', (e) => {
      // `remaining` counts down the Windlass's 26 over the whole fight and `total` is always 26 (boss/index.ts
      // emitPips). Polish round 4: this listener took every phase to "begin whole" at `total`, so each change of phase
      // (parley, p1, p2, p3a, hush, proven, p3b, dead) counted 26 minus what was left again: the end card read 186
      // knots for 78 rounds. Only a fall of `remaining` counts; the first event of a run or a restore (pipLeft 0) and a
      // phase begun again after a death (remaining goes up) count nothing.
      if (s.running && this.pipLeft > 0 && e.remaining < this.pipLeft) s.stats.knotsBurst += this.pipLeft - e.remaining;
      this.pipLeft = e.remaining;
    });
    events.on('combat/hit', (e) => { if (e.entityKind === 'tamper') this.onTamperHit(e.entityId, e.outcome, e.x, e.y, e.z); });
    events.on('shootable/hit', (e) => { if (e.kind === 'dowser' && (this.sight === 1 || this.sight === 2)) s.story.sayFront(namedLine(this.sightTrigger, 'lines', 'shot')); });
    events.on('combat/line_resolved', (e) => {
      // one line round that frees three or more of the File: they sit down in order
      const file = this.linesEnc;
      if (file && file.state === 'active' && e.freed >= 3) s.story.sayFront(namedLine(this.fileLines(), 'lines', 'lined'));
    });
    events.on('zone/entered', (e) => {
      if (this.exposureZone === '' || !s.flags.has(this.exposureFlag)) return;
      if (e.zone === this.exposureZone) s.ctx.render.setExposure(this.exposureMult, this.exposureSeconds);
      else if (e.from === this.exposureZone) s.ctx.render.setExposure(1, this.exposureSeconds);
    });
  }

  /** the trigger that holds the named lines of a fight in its zone ({ seen, lined }: the File), and that fight */
  private linesMarker: LayoutMarker | undefined;
  private linesEnc: Enc | undefined;
  private bossEnc: Enc | undefined;
  private fileLines(): LayoutMarker | undefined { return this.linesMarker; }
  private pipLeft = 0;

  // ---- queries --------------------------------------------------------------------------------------
  get live(): boolean {
    for (let i = 0; i < this.encs.length; i++) { const st = (this.encs[i] as Enc).state; if (st === 'active' || st === 'vignette') return true; }
    return false;
  }
  cleared(id: EncounterId): boolean { return this.byId.get(id)?.state === 'cleared'; }
  encounter(id: EncounterId): Readonly<EncounterView> {
    const e = this.byId.get(id) as Enc;
    const v = e.view;
    v.state = e.state;
    let alive = 0, spawned = 0;
    for (let i = 0; i < e.members.length; i++) { const st = (e.members[i] as Member).state; if (st === ALIVE) alive++; if (st === ALIVE || st === DOWN) spawned++; }
    v.alive = e.boss ? this.s.ctx.enemies.aliveCount(id) : alive;
    v.spawned = spawned;
    v.seconds = e.sched.clock;
    return v;
  }
  triggerFired(id: MarkerId): boolean { return this.s.flags.has('trg:' + id); }       // not a per-tick path
  moodOf(zone: ZoneId): MoodId {
    const z = this.s.ctx.data.zone(zone);
    if (this.bossEnc && zone === this.bossEnc.data.zone && this.s.flags.has('proven')) return 'L5p';
    if (z.moodIntro === undefined) return z.mood;
    // release pass p0 (closer): on the title she stands at the start again; the last run's glare flag is not the title's
    // business (after "Quit to title" the backdrop cross-faded to L1: another exposure, a brighter gun)
    if (this.s.ctx.state.current === 'title') return z.moodIntro;
    if (zone === this.glareZone && this.s.flags.has(this.glareFlag) && this.glareLeft <= 0) return this.glareTo;
    return z.moodIntro;
  }
  pendingFreed(): number {
    let n = 0;
    for (const e of this.encs) if (e.state !== 'cleared') n += e.freed;
    return n;
  }
  pendingFelled(): number {
    let n = 0;
    for (const e of this.encs) if (e.state !== 'cleared') n += e.felled;
    return n;
  }
  commitTallies(id: EncounterId): void {
    const e = this.byId.get(id);
    if (e) { e.freed = 0; e.felled = 0; }
  }

  // ---- triggers -------------------------------------------------------------------------------------
  private requirementMet(t: Trig): boolean { return t.requires === '' || this.cleared(t.requires); }
  /** ticks of play counted here (the age of a burst knot) */
  private tickNo = 0;
  private readonly knotAt = new Map<MarkerId, number>();
  /** seconds since the knot `id` burst in this timeline (long ago when a restore gave it back burst); -1 when it has not */
  private knotAge(id: MarkerId): number { const at = this.knotAt.get(id); return at === undefined ? (this.s.flags.has('burst:' + id) ? 1e9 : -1) : (this.tickNo - at) / 60; }
  /** first lines of the vignette triggers, and which of them have been on screen (their second lines stand on them) */
  private readonly watched = new Set<StoryKey>();
  private readonly shown = new Set<StoryKey>();
  private readonly nearLines: NearLine[] = [];
  // ---- pass i3
  private ruleVista: LayoutMarker | undefined;
  /** the trigger whose encounter waits for her to come near its first figure (HELD_START) */
  private heldTrig: Trig | null = null;
  /** seconds until the first retry's teaching line (TEACH_AFTER); -1: none owed */
  private teachIn = -1;
  /** the Rule is in the middle of her view with open sky that way */
  private ruleSeen(): boolean {
    const { s } = this;
    const v = this.ruleVista;
    const target = v?.params.target as [number, number, number] | undefined;
    if (!target) return true;
    if (s.lookCos(target[0], target[1], target[2]) < RULE_COS) return false;
    const p = s.ctx.player.position, ey = p.y + PLAYER_EYE;
    const dx = target[0] - p.x, dy = target[1] - ey, dz = target[2] - p.z, k = RULE_SIGHT / (Math.sqrt(dx * dx + dy * dy + dz * dz) || 1);
    return s.ctx.collision.lineOfSight(p.x, ey, p.z, p.x + dx * k, ey + dy * k, p.z + dz * k, SIGHT_THROUGH);
  }
  /** HELD_START: the fight and its figure's line begin when she has come near the figure */
  private tickHeld(): void {
    const { s } = this;
    const t = this.heldTrig;
    if (!t) return;
    const h = HELD_START[t.marker.id], enc = this.byId.get(paramString(t.marker, 'encounter') as EncounterId);
    const k = enc?.members[0]?.marker;
    if (!h || !enc || !k || enc.state !== 'idle') { this.heldTrig = null; return; }
    const p = s.ctx.player.position, dx = k.pos[0] - p.x, dz = k.pos[2] - p.z, d2 = dx * dx + dz * dz;
    if (d2 > h.look * h.look) return;
    // (between the two distances: turned to it, and with no line on screen, so its own line starts as it is seen)
    if (d2 > h.anyway * h.anyway && (s.story.current !== '' || s.lookCos(k.pos[0], k.pos[1] + h.up, k.pos[2]) < h.cos)) return;
    this.heldTrig = null;
    s.story.sayPresent(h.line);
    this.start(enc.id);
  }
  /** seconds to the next glint in the mouth of the niche (WATCH_GLINT_EVERY) */
  private watchGlint = 0;
  private watchLevel = 0;
  private watchCard: FxHandle | null = null;
  private endWatchGlint(): void {
    this.watchGlint = 0; this.watchLevel = 0;
    if (this.watchCard) { this.watchCard.release(); this.watchCard = null; }
  }
  tickTriggers(dt: number): void {
    const { s } = this;
    this.tickNo++;
    const p = s.ctx.player.position;
    for (let i = 0; i < this.triggers.length; i++) {
      const t = this.triggers[i] as Trig;
      const m = t.marker;
      if (t.once && s.flags.has(t.flag)) continue;
      if (!s.build.markerLive(m)) { t.inside = false; continue; }
      if (t.kill) {
        const r = (m.size ? m.size[0] : 0) / 2, dx = p.x - m.pos[0], dz = p.z - m.pos[2];
        if (m.size && dx * dx + dz * dz <= r * r && p.y >= m.pos[1] - 0.5 && p.y <= m.pos[1] + m.size[1] && s.ctx.player.alive) {
          this.damage.ox = p.x; this.damage.oy = p.y; this.damage.oz = p.z;
          s.ctx.player.applyDamage(this.damage);
        }
        continue;
      }
      const inside = inVolume(m, p.x, p.y, p.z) || (t.also !== null && inVolume(t.also, p.x, p.y, p.z));
      // (pass i3, LOOK_GATES) lines about one thing: said on a look at it; crossed without one, they wait for it
      const g = t.gate;
      if (g) {
        if (s.flags.has(t.flag) || !this.requirementMet(t)) { t.inside = inside; t.lookT = 0; continue; }
        const ey = p.y + PLAYER_EYE, gx = t.sx - p.x, gy = t.sy - ey, gz = t.sz - p.z;
        const level = Math.abs(p.y - m.pos[1]) <= g.level;
        const cos = level && !this.live && gx * gx + gy * gy + gz * gz <= g.range * g.range ? s.lookCos(t.sx, t.sy, t.sz) : -1;
        const clear = cos >= g.frameCos && s.ctx.collision.lineOfSight(p.x, ey, p.z, t.sx, t.sy, t.sz, SIGHT_THROUGH);
        t.lookT = clear && cos >= g.cos ? t.lookT + dt : 0;
        if (t.lookT >= LOOK_DWELL) { t.lookT = 0; t.inside = inside; this.fire(t, true); continue; }
        if (inside && g.cross) { t.inside = inside; this.fire(t); continue; }
        if (inside && !t.crossed) {
          t.crossed = true; t.crossT = 0;
          if (g.cue !== '') { s.cue(g.cue, t.sx, t.sy, t.sz); if (g.caption !== '') s.story.say(g.caption); }
        }
        if (t.crossed) {
          t.crossT += dt;
          const hx = p.x - m.pos[0], hz = p.z - m.pos[2];
          const left = g.leave > 0 && (hx * hx + hz * hz > g.leave * g.leave || !level);
          if (left || (g.last > 0 && t.crossT >= g.last) || (g.after > 0 && t.crossT >= g.after && clear)) this.fire(t);
        }
        t.inside = inside;
        continue;
      }
      // (pass i1, WATCH_RANGE; pass i2, LOOK_DWELL) a trigger whose lines are about a thing speaks when she has looked at it
      const sub = t.subject;
      if (sub) {
        if (s.flags.has(t.flag) || !this.requirementMet(t)) { t.inside = inside; t.lookT = 0; continue; }
        const sx = t.sx, sy = t.sy, sz = t.sz, ey = p.y + PLAYER_EYE;
        const dx = sx - p.x, dy = sy - ey, dz = sz - p.z;
        const near = dx * dx + dy * dy + dz * dz <= t.range2;
        const seen = near && !this.live && s.lookCos(sx, sy, sz) >= (t.figure ? WATCH_COS : DRAW_COS) && s.ctx.collision.lineOfSight(p.x, ey, p.z, sx, sy, sz, 0);
        t.lookT = seen ? t.lookT + dt : 0;
        if (t.lookT >= LOOK_DWELL) {
          t.inside = inside; t.lookT = 0;
          this.fire(t, true);
          continue;
        }
        if (!t.figure) {
          // a drawing on a wall needs no glint; unseen, it is told in the cage she leaves by (or, with no cage, on its floor)
          const away = t.chalf > 0 ? Math.abs(p.x - t.cx) <= t.chalf + CAGE_NEAR && Math.abs(p.z - t.cz) <= t.chalf + CAGE_NEAR : inside;
          t.inside = inside;
          if (away) this.fire(t);
          continue;
        }
        // the eye is drawn to the mouth of the niche before the figure can be seen
        if (near && !this.live) {
          if (!this.watchCard) {
            const mx = m.pos[0] - sub.pos[0], mz = m.pos[2] - sub.pos[2], ml = Math.sqrt(mx * mx + mz * mz) || 1;
            this.watchCard = s.ctx.render.vfx.acquireCard('aim_star');
            if (this.watchCard) { this.watchCard.setPosition(sx + (mx / ml) * WATCH_MOUTH, sy, sz + (mz / ml) * WATCH_MOUTH); this.watchCard.setLevel(0); this.watchCard.setVisible(true); }
            this.watchGlint = 0; this.watchLevel = 0;
          }
          this.watchGlint += dt;
          if (this.watchGlint >= WATCH_GLINT_EVERY) this.watchGlint = 0;
          const level = this.watchGlint < WATCH_GLINT_SECONDS ? WATCH_GLINT_LEVEL : 0;
          if (level !== this.watchLevel) { this.watchLevel = level; if (this.watchCard) { this.watchCard.setLevel(level); this.watchCard.setVisible(level > 0); } }
        } else this.endWatchGlint();
        // crossing the trigger without a look: the figure's own motion plays (its hood turns), nothing is said
        if (inside && !t.inside) { this.startVignette(m); t.crossed = true; }
        t.inside = inside;
        // she went by and is out of its reach: the moment is over, unsaid (no star is left blinking in a niche behind her)
        if (t.crossed && !near) { s.flags.add(t.flag); t.crossed = false; }
        continue;
      }
      // on the way in, or (standing in it) the moment what it requires has happened
      const fire = inside && (!t.inside || !s.flags.has(t.flag)) && this.requirementMet(t);
      t.inside = inside && this.requirementMet(t);
      if (fire && t.generic) this.fire(t);
    }
    if (this.glareLeft > 0) this.glareLeft -= dt;
    this.tickNearLines(dt);
    this.tickHeld();
  }
  /** NEAR_LINE: a prop that names its line is described when she stands at it and is turned to it */
  private tickNearLines(dt: number): void {
    const { s } = this;
    const p = s.ctx.player.position;
    for (let i = 0; i < this.nearLines.length; i++) {
      const l = this.nearLines[i] as NearLine;
      const m = l.marker;
      if (s.story.heard(l.key) || s.story.holds(l.key) || !s.build.markerLive(m)) { l.t = 0; continue; }
      const dx = m.pos[0] - p.x, dz = m.pos[2] - p.z;
      const at = !this.live && dx * dx + dz * dz <= NEAR_LINE * NEAR_LINE && Math.abs(p.y - m.pos[1]) < 2 && s.lookCos(m.pos[0], m.pos[1] + NEAR_UP, m.pos[2]) >= NEAR_COS;
      l.t = at ? l.t + dt : 0;
      if (l.t >= LOOK_DWELL) { l.t = 0; s.story.sayFront(l.key); }
    }
  }
  /** a vignette trigger's lines: the first is about this second (over a room line once it has been read), the rest follow it */
  private speak(m: LayoutMarker): void {
    const { s } = this;
    const lines = paramList(m, 'lines');
    // (pass i3: PRESENT lines. Said politely, the first waited behind the line on screen AND its continuation: the
    // watcher was looked at 5.2 s in and named 13.9 s in, in the proving bay, behind "The low pegs were bare")
    for (let i = 0; i < lines.length; i++) s.story.sayPresent(lines[i] as string, true, m.zone);
  }
  /** `looked`: she is looking at the trigger's figure (a vignette of its own) */
  private fire(t: Trig, looked = false): void {
    const { s } = this;
    const m = t.marker;
    s.flags.add(t.flag);
    for (const key of paramList(m, 'cards')) s.story.say(key);
    // about the trigger's own place (on the peg stair the trigger's zone is not yet the resident set's: there, where she is)
    const about = s.ctx.data.zone(m.zone).set === s.residentSet ? m.zone : s.zone;
    // (the rim's lamps and stone: next in line, in their order; R5: the stone's lines are not left behind six others)
    // (a vignette of its own, the watcher in the niche: tied to the moment she passes it, round 5)
    const hold = HELD_START[m.id];
    if (m.params.vignette !== undefined && m.params.encounter === undefined) {
      // (pass i1) the figure's first line is about this second (pass i2: said only on a look, LOOK_DWELL; a vignette
      // trigger with no figure of its own in the layout speaks as she crosses it)
      this.endWatchGlint(); this.speak(m);
    } else if (t.gate && looked) this.speak(m);             // (pass i3: a gated trigger's lines, on the look itself)
    else if (s.ending.front(m) || looked) s.story.sayFrontAll(paramList(m, 'lines'));        // (looked: what she is looking at is told next)
    else for (const key of paramList(m, 'lines')) { if (!hold || key !== hold.line) s.story.say(key, about, m.zone); }
    const objective = paramString(m, 'objective');
    if (objective !== '' && m.params.encounter === undefined) s.story.setObjective(objective);
    const closes = paramString(m, 'closes');
    if (closes !== '') s.doors.close(closes, false, SEAL_CLEAR);
    const encounter = paramString(m, 'encounter') as EncounterId | '';
    // (pass i3, HELD_START: the fight waits for her to come near its first figure; a second attempt does not wait)
    if (encounter !== '' && hold && this.byId.get(encounter)?.state === 'idle' && !s.story.heard(hold.line)) this.heldTrig = t;
    else if (encounter !== '') this.start(encounter);
    this.startVignette(m);
    if (m.id === this.glareTrigger) {
      // release pass p0 (closer; the UI team's request): the run hint is due on the long walk down the gully, before the
      // first fight, not in its second wave (the UI holds it back during a fight, so it came up after the street was clear)
      s.needSprint = true;
      const ramp = m.params.exposureRamp as { seconds?: number };
      this.glareLeft = ramp.seconds ?? 20;
      s.ctx.render.setMood(this.glareTo, this.glareLeft);
    }
    if (m.id === this.exposureTrigger) s.ctx.render.setExposure(this.exposureMult, this.exposureSeconds);
  }
  /** the vignette a trigger plays (once per run) */
  private startVignette(m: LayoutMarker): void {
    const { s } = this;
    const vig = m.params.vignette as { id?: VignetteId; seconds?: number } | undefined;
    if (!vig || !vig.id || s.vignettesSeen.has(vig.id)) return;
    s.vignettesSeen.add(vig.id);
    s.ctx.enemies.playVignette(vig.id);
    if (vig.seconds !== undefined) {
      // a vignette whose clock runs here: it ends by itself, or is skipped by walking on into the fight
      this.vigId = vig.id; this.vigLeft = vig.seconds;
      const next = this.encs.find((e) => e.data.zone === m.zone && e.state === 'idle');
      this.vigSkipEnc = next ? next.id : '';
    }
  }
  fireStart(): void {
    const first = Object.keys(this.s.ctx.data.story.objectives)[0];
    for (const t of this.triggers) if (t.generic && t.once && t.marker.params.objective === first && !this.s.flags.has(t.flag)) this.fire(t);
  }
  private endVignette(stage: 'ended' | 'skipped'): void {
    if (this.vigId === '') return;
    this.vignettePayload.id = this.vigId; this.vignettePayload.stage = stage;
    this.vigId = ''; this.vigLeft = 0;
    this.s.ctx.events.emit('vignette/state', this.vignettePayload);
  }

  // ---- what is built --------------------------------------------------------------------------------
  attach(_zone: ZoneId): void { /* members are spawned from tick(): the enemies module may not be ready inside a build */ }
  detach(zone: ZoneId): void {
    for (const t of this.triggers) if (t.subject && t.subject.zone === zone) { this.endWatchGlint(); t.lookT = 0; }
    // the enemies module drops what stood in a zone that is gone; forget the ids
    for (const e of this.encs) {
      if (e.state !== 'idle') continue;
      for (const m of e.members) if (m.marker.zone === zone && m.state === DORMANT) { m.state = NONE; m.id = ''; }
    }
  }

  // ---- the machine ----------------------------------------------------------------------------------
  start(id: EncounterId): void {
    const { s } = this;
    const e = this.byId.get(id);
    if (!e || e.state !== 'idle') return;
    const first = e.sched.plans[0];
    const replay = e.vignette !== '' && s.vignettesSeen.has(e.vignette);
    e.sched.reset();
    for (const m of e.members) if (m.state === DOWN) e.sched.memberDown(m.wave);
    e.state = e.boss || !first || first.delay <= 0 || replay ? 'active' : 'vignette';
    e.lastAnnounced = false; e.slowDone = false; e.view.wave = ''; e.mercy = false; e.mercyWait = 0; e.burstDoor = ''; e.burstIn = -1; e.plateRun = 0; e.plateHinted = false;
    // a vignette never replays: on a second attempt the first wave does not wait for it
    if (replay && first) e.sched.clock = first.delay;
    const trigger = s.ctx.data.layout.markers.find((m) => m.id === e.data.trigger);
    // a door the trigger seals shuts for good: asked to close before it is locked, so the lock does not open it again
    const seals = trigger ? paramString(trigger, 'seals') : '';
    if (seals !== '') s.doors.close(seals, false, SEAL_CLEAR);
    e.lockLater.length = 0;
    for (const door of e.data.locksDoors) {
      // never shut in her face: a door that stands open is shut and locked from tick(), once she is inside the
      // fight's zone and well clear of the leaf (at once when she already is)
      const st = s.doors.state(door);
      if ((st === 'open' || st === 'opening') && door !== seals) e.lockLater.push(door);
      else s.doors.lock(door, true);
    }
    this.startedPayload.id = id;
    s.ctx.events.emit('encounter/started', this.startedPayload);
    if (this.vigSkipEnc === id) this.endVignette('skipped');
    if (e.vignette !== '' && !replay) {
      s.vignettesSeen.add(e.vignette);
      s.ctx.enemies.playVignette(e.vignette);
      // Release pass p0 (the combat critic's "sharpest spike of the stage"; found with the proxies' watch log: FOUR
      // Transits in a yard whose layout has three). A vignette that makes its own actor (the yard's first Transit,
      // which is not dormant in the world before the fight) stood it on the first member's spawn; four seconds later,
      // with the vignette over, the wave's release asked the enemies for that member and was given a second one (they
      // hand the vignette's actor over only while its vignette still runs). The member is taken now, while it does.
      const lead = e.members[0];
      if (lead && lead.state === NONE && lead.marker.params.dormant === undefined && lead.marker.params.vignette !== undefined) this.spawnMember(e, lead, false);
      const firstSpawn = e.members[0]?.marker;
      const vig = firstSpawn?.params.vignette as { line?: string; thenLine?: string } | undefined;
      if (vig && vig.line) s.story.sayFront(vig.line);                      // tied to the moment: next in line
      this.turnLine = vig && vig.thenLine ? vig.thenLine : '';
      this.turnEnc = this.turnLine !== '' ? e.id : '';
      this.turnWatch = '';
    }
    if (e.boss) {
      if (trigger) s.story.setObjective(paramString(trigger, 'objective'));
      const save = s.ctx.save.current;
      const saved = save ? save.enemies.bossPhase : 'idle';
      const resume = saved !== 'idle' && saved !== 'dead' && save !== null && BOSS_VALUES.includes(save.checkpoint);
      s.ctx.enemies.startBoss(resume ? saved : 'parley', s.flags.has('parley_heard') || (save !== null && save.enemies.parleyHeard));
      return;
    }
    // the chairs scrape before anybody moves (the spawn marker's cueLead)
    const lead = e.members[0];
    if (lead && lead.marker.params.cueLead !== undefined) s.cueAt('chairs_scrape', lead.marker);
    this.stationLamp(e, true);
  }

  private spawnMember(e: Enc, m: Member, dormant: boolean): boolean {
    const { s } = this;
    const r = this.request;
    const wave = e.waves[m.wave] as EncounterData['waves'][number];
    r.kind = m.kind; r.spawn = m.marker.id; r.encounter = e.id; r.wave = wave.id;
    r.dormantClip = dormant ? paramString(m.marker, 'dormant') : '';
    r.entrance = paramString(m.marker, 'entrance');
    r.lane = wave.lane ?? '';
    r.order = m.order; r.counted = m.counted;
    const id = s.ctx.enemies.spawn(r);
    if (id === '') return false;
    m.id = id;
    m.state = dormant ? DORMANT : ALIVE;
    return true;
  }
  private aliveNow(e: Enc): number {
    let n = 0;
    for (let i = 0; i < e.members.length; i++) if ((e.members[i] as Member).state === ALIVE) n++;
    return n;
  }
  private releaseWave(e: Enc, w: number): void {
    const { s } = this;
    const wave = e.waves[w] as EncounterData['waves'][number];
    e.view.wave = wave.id;
    if (e.state === 'vignette') e.state = 'active';
    this.wavePayload.id = e.id; this.wavePayload.wave = wave.id;
    s.ctx.events.emit('encounter/wave', this.wavePayload);
    // (an ambush: the three are let out of their places and gather behind the door, the line names them, and the door
    // bursts `burst` seconds later: a player who reads the line has that long to stop and aim; one who walks on is met)
    const burst = WAVE_RULES[e.id + '/' + wave.id]?.burst;
    if (wave.opensDoor && burst !== undefined) {
      e.burstDoor = wave.opensDoor; e.burstIn = burst;
      // the tell does not wait for the narrator's turn: something hits the door from the other side, and the rattle
      const dm = this.doorMarker(wave.opensDoor);
      if (dm) s.cueAt(AMBUSH_CUE, dm);
      s.story.say(AMBUSH_CAPTION);
    }
    else if (wave.opensDoor) s.doors.open(wave.opensDoor, false, true);
    for (let i = 0; i < e.members.length; i++) {
      const m = e.members[i] as Member;
      if (m.wave !== w) continue;
      const bursts = paramString(m.marker, 'burstsDoor');
      if (bursts !== '') s.doors.open(bursts, false, true);
      if (m.state === DORMANT) { s.ctx.enemies.wake(m.id); m.state = ALIVE; } else if (m.state === NONE) m.state = DUE;
    }
    if (WAVE_RULES[e.id + '/' + wave.id]?.entryPacket) this.entryPacket(e);
    // a wave's lines are about what is happening now: next in line, not behind a room's description
    // (p0: urgent. Next in line was up to 8 s late behind the proving plate's lines: "Two more on the stair behind her"
    // was read with the pair already on her, and "Four more" as the last of them sat down)
    if (wave.lines) for (let i = 0; i < wave.lines.length; i++) s.story.sayUrgent(wave.lines[i] as string);
    if (e === this.linesEnc && w === 0) s.story.sayUrgent(namedLine(this.fileLines(), 'lines', 'seen'));
    if (e === this.encs[0] && w === 1) s.needSprint = true;                  // the first fight's second wave: sprint is first needed
  }
  /**
   * p0: a packet of six on her way in (ENTRY_PACKET_IN metres inside the door the fight's knot lets go, toward the
   * fight's first spawn). Dropped pickups do not outlive a restore, so each attempt finds it again.
   */
  private entryPacket(e: Enc): void {
    const { s } = this;
    const knot = this.doorMarker(e.data.trigger);
    const door = knot ? this.doorMarker(paramString(knot, 'opens')) : undefined;
    const first = e.members[0]?.marker;
    if (!door || !first) return;
    const dx = first.pos[0] - door.pos[0], dz = first.pos[2] - door.pos[2], l = Math.sqrt(dx * dx + dz * dz) || 1;
    const x = door.pos[0] + (dx / l) * ENTRY_PACKET_IN, z = door.pos[2] + (dz / l) * ENTRY_PACKET_IN;
    const ground = s.ctx.collision.groundHeight(x, door.pos[1] + 0.5, z, 6);
    s.interact.spawnPickup('pk_rounds_6', x, Number.isNaN(ground) ? door.pos[1] : ground, z);
  }
  /**
   * The bell vignette's second line waits for the turn (the first state change of the fight's first member) and is
   * dropped if it dies first. The member has no id until it is spawned, which is after its wave is released: the watch
   * is set here, from tick(), once it stands. (Polish round 2: the watch used to be read at the release, when the id
   * was still empty, so the line lay about until the NEXT fight's first wave, and the Tally's riser said it.)
   */
  private watchTurn(e: Enc): void {
    if (this.turnEnc !== e.id || this.turnLine === '' || this.turnWatch !== '' || !e.sched.released[0]) return;
    const m = e.members[0];
    if (!m || m.state === DOWN) this.dropTurn();
    else if (m.state === ALIVE && m.id !== '') this.turnWatch = m.id;
  }
  private dropTurn(): void { this.turnWatch = ''; this.turnLine = ''; this.turnEnc = ''; }

  private memberOf(e: Enc, id: EntityId): Member | null {
    for (let i = 0; i < e.members.length; i++) if ((e.members[i] as Member).id === id) return e.members[i] as Member;
    return null;
  }
  private find(id: EntityId, encounter: EncounterId | ''): Enc | null {
    if (encounter !== '') { const e = this.byId.get(encounter); if (e && (e.boss || this.memberOf(e, id))) return e; }
    for (let i = 0; i < this.encs.length; i++) if (this.memberOf(this.encs[i] as Enc, id)) return this.encs[i] as Enc;
    return null;
  }
  private onDamaged(id: EntityId): void {
    const e = this.find(id, '');
    if (!e || e.boss) return;
    const m = this.memberOf(e, id) as Member;
    // a dormant or vignette member damaged before the trigger starts the encounter on that tick (one she can see:
    // a figure in a zone that is not drawn was not shot by her)
    if (e.state === 'idle' && this.s.running && this.mayStartByDamage(e, m)) this.startByDamage(e);
    if (e.state !== 'idle') e.sched.memberHit(m.wave);
  }
  /**
   * May a hit on a dormant member start its encounter? Only one she can see (a figure in a zone that is not drawn was
   * not shot by her), only once the puzzle that stands in front of the encounter is solved (GDD 13: no combat until
   * solved), and, when the encounter locks doors, only from inside its zone: a fight that shuts a door starts with her
   * on the fight's side of it. Otherwise the member stays where it sits and the encounter waits for its trigger.
   */
  private mayStartByDamage(e: Enc, m: Member): boolean {
    const { s } = this;
    if (!s.ctx.render.zoneVisible(m.marker.zone)) return false;
    const puzzle = PREREQUISITE[e.id];
    if (puzzle && !s.puzzles[puzzle].view.solved) return false;
    if (e.data.locksDoors.length > 0 && s.zone !== e.data.zone) return false;
    return true;
  }
  /** the encounter starts from a hit on a member: what she would have shot to start it (a knot) lets go as if shot */
  private startByDamage(e: Enc): void {
    const { s } = this;
    const force = s.forcers.get(e.data.trigger);
    if (force) force(true);
    this.start(e.id);
  }
  private onEnemyState(id: EntityId): void {
    if (this.turnWatch === '' || id !== this.turnWatch) return;
    this.turnWatch = '';
    // (pass i1: about this second: over the station's line once that line has been read, not behind all of it)
    if (this.turnLine !== '') this.s.story.sayUrgent(this.turnLine, URGENT_READ);
    this.dropTurn();
  }
  private onDown(id: EntityId, encounter: EncounterId | '', how: 'felled' | 'freed' | 'died', counted: boolean, x: number, y: number, z: number): void {
    const { s } = this;
    if (!s.running) return;
    const e = this.find(id, encounter);
    const m = e && !e.boss ? this.memberOf(e, id) : null;
    if (id === this.turnWatch) this.dropTurn();
    const bider = how !== 'died';
    // the first of each, on the event: what her two kinds of shot do (once per run by the nar_* rule)
    // (hers only: `counted` is false for a Bider the Tamper breaks in its vignette)
    if (bider && counted) s.story.sayFront(how === 'freed' ? LINE_FIRST_FREED : LINE_FIRST_FELLED);
    if (bider && counted) {
      if (how === 'freed') { s.stats.freed++; s.stats.knotsBurst++; if (e) e.freed++; } else { s.stats.felled++; if (e) e.felled++; }
    }
    // ---- drops (GDD 6.5): the ammo floor first, boss adds always, the rest by chance
    const w = s.ctx.player.weapon;
    const roll = bider ? s.rng.next() : 1;
    // (the floor alone for a Transit that was a member of a fight: not the Tamper, which has its own packet, nor the boss)
    const floorOnly = !bider && m !== null && m.kind === 'transit';
    const drop = decideDrop({ bider, counted, bossAdd: e !== null && e.boss, ammo: w.chambered + w.reserve, health: s.ctx.player.health, roll, chance: DROP_CHANCE[s.ctx.options.value.difficulty], floorOnly });
    if (drop !== '') {
      const ground = floorOnly ? s.ctx.collision.groundHeight(x, y + 0.5, z, 6) : NaN;
      s.interact.spawnPickup(drop, x, Number.isNaN(ground) ? y : ground, z);
    }
    if (!e || !m) return;
    if (m.state === DOWN) return;
    const was = m.state;
    m.state = DOWN;
    if (e.state === 'idle') {
      // shot dormant, before the trigger: start() counts it (under the rule of mayStartByDamage)
      if (this.mayStartByDamage(e, m)) this.startByDamage(e);
      return;
    }
    if (e.state === 'cleared') return;
    if (was === DUE || was === ALIVE || was === DORMANT) e.sched.memberDown(m.wave);
    this.afterDown(e, id);
  }
  /** after a member went down: the last-enemy beat and the clear */
  private afterDown(e: Enc, _id: EntityId): void {
    const { s } = this;
    if (e.sched.pending === 0 && e.sched.totalAlive === 0) {
      // the last enemy of the encounter: one slow-motion beat (x0.3 for 0.3 s)
      // (when it was never "one left" before, a lone Tamper with waves still on the clock, the kill itself says so)
      if (!e.lastAnnounced) { e.lastAnnounced = true; this.lastPayload.id = e.id; this.lastPayload.enemy = _id; s.ctx.events.emit('encounter/last_enemy', this.lastPayload); }
      if (!e.slowDone) { e.slowDone = true; s.ctx.clock.slowMotion(0.3, 0.3, 'last_enemy'); }
      this.clear(e, false);
      return;
    }
    this.announceLast(e);
  }
  /** one left and no wave to come: `encounter/last_enemy` (the exit opens with a cue on it) */
  private announceLast(e: Enc): void {
    if (e.lastAnnounced || e.sched.pending !== 0 || e.sched.totalAlive !== 1) return;
    e.lastAnnounced = true;
    let last: EntityId = '';
    for (let i = 0; i < e.members.length; i++) { const m = e.members[i] as Member; if (m.state === ALIVE || m.state === DUE) last = m.id; }
    this.lastPayload.id = e.id; this.lastPayload.enemy = last;
    this.s.ctx.events.emit('encounter/last_enemy', this.lastPayload);
  }

  /** the doors a clear opens: the encounter's own `onClear.opens` and every door whose `opens` / `opensOn` text names it */
  private opensOnClear(e: Enc, instant: boolean): void {
    const { s } = this;
    const stem = e.boss ? 'boss dead' : e.id + ' clear';
    for (const id of s.doors.ids()) {
      const m = s.ctx.data.layout.markers.find((x) => x.id === id) as LayoutMarker;
      const text = paramString(m, 'opens') || paramString(m, 'opensOn');
      if (id !== e.data.onClear.opens && !text.startsWith(stem)) continue;
      if ((s.build.busy || s.build.seamPending) && !instant) { e.openWhenBuilt = id; continue; }       // the hatch waits for the staged gallery
      s.doors.open(id, instant);
      const lamp = e.boss ? lampNode(s, id, 'gate_lamp') : null;
      if (lamp) s.ctx.render.lamps.setMask(lamp, 1);
    }
  }
  private clear(e: Enc, debug: boolean): void {
    const { s } = this;
    if (e.state === 'cleared') return;
    e.state = 'cleared';
    if (this.turnEnc === e.id) this.dropTurn();
    if (this.vigSkipEnc === e.id) this.endVignette('skipped');
    for (const door of e.data.locksDoors) s.doors.lock(door, false);
    e.lockLater.length = 0;
    e.freed = 0; e.felled = 0;                                   // committed: they are in the stats for good
    this.clearedPayload.id = e.id; this.clearedPayload.seconds = e.sched.clock;
    s.ctx.events.emit('encounter/cleared', this.clearedPayload);
    const on = e.data.onClear;
    if (e.boss) s.setFlag('boss_dead', true);
    if (!debug && on.lines) s.story.sayFrontAll(on.lines);
    if (on.objective) s.story.setObjective(on.objective);
    this.opensOnClear(e, debug);
    if (on.checkpoint) s.checkpoints.reach(on.checkpoint, true);
    // p0: the Windlass has no checkpoint of its own death (the next is the rim, at the top of the lift): the one she
    // holds is saved again, so a reload on the way to the lift or in it finds the Windlass dead and the gate open
    else if (e.boss && !debug) s.checkpoints.again('dead');
    if (this.sightAfter === e.id) {
      if (debug) this.endSighting(true);
      else if (!s.flags.has('dowser_done')) this.beginSighting();
    }
    s.visDirty = true;
  }

  debugClear(id: EncounterId): void {
    const { s } = this;
    const e = this.byId.get(id);
    if (!e || e.state === 'cleared') return;
    // what stands in front of it has happened: the puzzle, and the thing she shoots to start it
    const puzzle = PREREQUISITE[id];
    if (puzzle) s.puzzles[puzzle].solve();
    const force = s.forcers.get(e.data.trigger);
    if (force) force();
    s.ctx.enemies.clearEncounter(id);
    for (const m of e.members) { m.state = NONE; m.id = ''; }
    for (const w of e.waves) if (w.opensDoor) s.doors.open(w.opensDoor, true, true);
    for (const m of e.members) { const bursts = paramString(m.marker, 'burstsDoor'); if (bursts !== '') s.doors.open(bursts, true, true); }
    if (e.vignette !== '') s.vignettesSeen.add(e.vignette);
    // members removed this way are not counted: what the fight had tallied so far is dropped
    s.stats.freed -= e.freed; s.stats.knotsBurst -= e.freed; s.stats.felled -= e.felled;
    this.clear(e, true);
  }

  // ---- the boss -------------------------------------------------------------------------------------
  private onBossPhase(phase: BossPhase): void {
    const { s } = this;
    const e = this.bossEnc;
    if (!e || !s.running || !s.build.isBuilt(e.data.zone)) return;
    if (phase === 'p1') s.setFlag('parley_heard', true);
    const cp = BOSS_CHECKPOINT[phase];
    if (!cp) return;
    // (in play only: a restore sets the phase too, and gives her the respawn's own floors)
    const fresh = s.checkpoints.index(cp) > s.checkpoints.index(s.checkpoint) && s.ctx.state.current === 'playing' && s.ctx.player.alive;
    if (fresh && (phase === 'p1' || phase === 'p2' || phase === 'p3a')) this.bossFloor();
    // (polish round 5, the combat critic: several runs reached phase 3 with an empty reserve: the tin also at that break)
    if (fresh && (phase === 'p2' || phase === 'p3a')) this.bossBreak();
    // what the adds of the phase behind her freed and felled is hers now
    e.freed = 0; e.felled = 0;
    s.checkpoints.reach(cp, true);
  }
  /**
   * Polish round 4 (the playthrough critic): a hurt player walked into the Windlass at 34 health, one canister from
   * dead, while every respawn there gives 60: the first attempt was the weakest one, and a player who came through a
   * phase badly hurt did better to die than to go on. As the parley ends, and at each break of a phase, she drinks:
   * a canteen's worth at a time (to the top of a segment: 34, 67) until she has two full segments, before the phase's
   * checkpoint is saved. Nothing happens at 67 or more.
   */
  private bossFloor(): void {
    const pl = this.s.ctx.player;
    for (let i = 0; i < 2 && pl.health < BOSS_HEALTH_FLOOR; i++) if (!pl.givePickup('pk_canteen')) break;
  }
  /**
   * The same critic: phase 1 ends with an empty reserve and phase 2 opens with a run to a cartridge point. As the
   * pawl breaks a tin shakes loose at her feet when she holds less than a tin in reserve (a respawn there gives 18).
   */
  private bossBreak(): void {
    const { s } = this;
    const pl = s.ctx.player, p = pl.position;
    if (pl.weapon.reserve >= BOSS_BREAK_RESERVE) return;
    const ground = s.ctx.collision.groundHeight(p.x, p.y + 0.5, p.z, 6);
    s.interact.spawnPickup('pk_rounds_12', p.x, Number.isNaN(ground) ? p.y : ground, p.z);
  }
  private onBossDefeated(cleanSix: boolean): void {
    const { s } = this;
    const e = this.bossEnc;
    if (!e || !s.running || e.state === 'cleared') return;
    s.stats.cleanSix = cleanSix;
    this.clear(e, false);
  }
  private onPlayerDied(): void {
    const { s } = this;
    if (!s.running) return;
    s.stats.deaths++;
    const e = this.bossEnc;
    if (!e || e.state !== 'active') return;
    // two deaths in the same boss phase bring the mercy tin (GDD 14); a restore must not forget them
    const phase = s.ctx.enemies.boss.phase;
    if (s.bossDeathPhase === phase) s.bossDeaths++; else { s.bossDeathPhase = phase; s.bossDeaths = 1; }
  }

  // ---- the sighting ---------------------------------------------------------------------------------
  private beginSighting(): void {
    const { s } = this;
    this.sight = 1;
    this.sightClear = 0; this.sightEntered = false; this.sightEnter = 0; this.sightBeat = 0; this.sightLooked = 0; this.sightAway = 0; this.sightCrumb = false;
    this.sightDoorOpen = false;
    const vig = this.sightTrigger?.params.vignette as { id?: VignetteId } | undefined;
    if (vig && vig.id) s.ctx.enemies.playVignette(vig.id);
  }
  private crumb(): void {
    if (this.sightCrumb || this.sightLight === '') return;
    this.sightCrumb = true;
    this.s.lamp(this.sightLight, 1, 1);
  }
  private endSighting(silent: boolean): void {
    const { s } = this;
    const vig = this.sightTrigger?.params.vignette as { id?: VignetteId } | undefined;
    if (this.sight === 1 || this.sight === 2) {
      // he was still standing there: he goes without a word
      if (vig && vig.id) { this.vignettePayload.id = vig.id; this.vignettePayload.stage = 'ended'; s.ctx.events.emit('vignette/state', this.vignettePayload); }
    }
    this.sight = 4;
    if (vig && vig.id) s.vignettesSeen.add(vig.id);
    this.openSightDoor(silent);
  }
  /** the way on: the tally door and its breadcrumb (saved as `dowser_done`: a restore past it finds the door open) */
  private openSightDoor(silent: boolean): void {
    const { s } = this;
    if (this.sightDoorOpen) return;
    this.sightDoorOpen = true;
    s.setFlag('dowser_done', true);
    if (this.sightDoor !== '') s.doors.open(this.sightDoor, silent);
    this.crumb();
  }
  /**
   * Per rendered frame (R4): keeps the far figure SIGHT_MIN_PX tall. The card is found where the vignette put it (a
   * child of scene.dynamic at the vista's target whose material is the renderer's far card), stood in `sightWrap` at
   * that point and scaled about his feet. Nothing here allocates once the group exists.
   */
  presentSighting(): void {
    const { s } = this;
    const wrap = this.sightWrap;
    if (this.sight < 1 || this.sight > 3) {
      if (wrap && wrap.parent && wrap.children.length === 0) { wrap.removeFromParent(); this.sightCard = null; }
      return;
    }
    const dynamic = s.ctx.scene.dynamic;
    let card = this.sightCard;
    if (card && (!wrap || card.parent !== wrap)) card = this.sightCard = null;
    if (!card) {
      const t = this.sightTarget;
      const kids = dynamic.children;
      for (let i = 0; i < kids.length; i++) {
        const o = kids[i] as THREE.Object3D;
        if (o === wrap || Math.abs(o.position.x - t[0]) > 0.05 || Math.abs(o.position.y - t[1]) > 0.05 || Math.abs(o.position.z - t[2]) > 0.05) continue;
        this.sightCardH = 0; this.sightCardFloor = 0;
        if (!this.readFarCard(o)) continue;
        const g = this.sightWrap ?? (this.sightWrap = new THREE.Group());
        g.name = 'world_sighting';
        g.position.copy(o.position); g.scale.setScalar(1);
        // exterior look, pass i3 (the visual reviewer: "his feet end several pixels above the mesa's top edge, so he hovers
        // against the cloud"): the card's drawing ends 2.7 % of its height above its foot line, and a boot heel is turned
        // up; scaled 4 to 7 times about that line the gap was a pixel or two of sky under both boots. The card stands
        // SIGHT_SINK of its height into the rock (set every frame below): the boots overlap the skyline by a pixel
        o.position.set(0, 0, 0);
        g.add(o);
        if (g.parent !== dynamic) dynamic.add(g);
        card = this.sightCard = o;
        if (!(this.sightCardH > 0)) this.sightCardH = 1.9;
        break;
      }
      if (!card) return;
    }
    const g = this.sightWrap as THREE.Group;
    const cam = s.ctx.scene.camera;
    const dx = cam.position.x - g.position.x, dy = cam.position.y - g.position.y, dz = cam.position.z - g.position.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    // pixels of a 720-line frame per metre at his distance; the shader's floor is in pixels of the drawing buffer
    const perMetre = 720 / (2 * dist * Math.tan(cam.fov * DEG2RAD / 2));
    const bufferH = s.ctx.render.renderer.domElement.height || 720;
    const drawn = card.scale.y * Math.max(this.sightCardH * perMetre, this.sightCardFloor * 720 / bufferH);
    const k = Math.max(1, SIGHT_MIN_PX / Math.max(drawn, 1e-3));
    // (pass i3) ... and SIGHT_SINK of his drawn height under the foot line, in the wrap's own metres (the card's scale and the
    // shader's floor enlarge the drawing about the card's origin, not the card's place in the wrap)
    card.position.y = -SIGHT_SINK * drawn / perMetre;
    if (Math.abs(g.scale.x - k) > 1e-3) g.scale.setScalar(k);
  }
  /** a far card of the renderer under `o`: its authored height and the shader's smallest size go to the fields */
  private readFarCard(o: THREE.Object3D): boolean {
    const mat = (o as THREE.Mesh).material as (THREE.Material & { defines?: Record<string, unknown> }) | THREE.Material[] | undefined;
    const d = mat && !Array.isArray(mat) ? mat.defines : undefined;
    if (d && d.FARCARD !== undefined) { this.sightCardH = Number(d.FARCARD_H) || 0; this.sightCardFloor = Number(d.FARCARD_PX) || 0; return true; }
    for (let i = 0; i < o.children.length; i++) if (this.readFarCard(o.children[i] as THREE.Object3D)) return true;
    return false;
  }
  private tickSighting(dt: number): void {
    const { s } = this;
    const m = this.sightTrigger;
    if (!m || this.sight === 0 || this.sight === 4) return;
    const p = s.ctx.player.position;
    this.sightClear += dt;
    const inside = inVolume(m, p.x, p.y, p.z);
    if (inside && !this.sightEntered) { this.sightEntered = true; this.sightEnter = 0; }
    if (this.sightEntered) this.sightEnter += dt;
    const cos = s.lookCos(this.sightTarget[0], this.sightTarget[1], this.sightTarget[2]);
    const seen = cos >= SIGHT_COS, looked = cos >= LOOK_COS;
    if (this.sight === 1 && inside && seen) {
      // the beat starts only when he is in the view cone: nothing is narrated off screen
      this.sight = 2;
      this.sightBeat = 0; this.sightLooked = 0; this.sightAway = 0;
      s.story.sayFront(namedLine(m, 'lines', 'seen'));
    } else if (this.sight === 2) {
      this.sightBeat += dt;
      if (looked) { this.sightLooked += dt; this.sightAway = 0; } else if (this.sightLooked >= SIGHT_LOOKED) this.sightAway += dt;
      const awayFor = this.sightDoorOpen ? SIGHT_AWAY_OPEN : SIGHT_AWAY;
      // R4: he is held until she has looked AT him for a second; only then may the clock or her turning away take him
      if (this.sightLooked >= SIGHT_LOOKED && (this.sightBeat >= paramNumber(m, 'clockSeconds', 12) || this.sightAway >= awayFor)) {
        this.sight = 3;
        const vig = m.params.vignette as { id?: VignetteId } | undefined;
        if (vig && vig.id) { this.vignettePayload.id = vig.id; this.vignettePayload.stage = 'ended'; s.ctx.events.emit('vignette/state', this.vignettePayload); }
        s.story.sayFront(namedLine(m, 'lines', 'gone'));
      }
    }
    // the tally door: when "gone" has played, or 12 s after the volume was first entered, whichever is first
    const gone = namedLine(m, 'lines', 'gone'), seenLine = namedLine(m, 'lines', 'seen');
    if (this.sight === 3 && s.story.finished(gone)) { this.endSighting(false); return; }
    // the door's own clock opens the way on; he stays on the mesa until he has been looked at, or she has gone in.
    // Polish round 4: never while the line that names him is still being said (the door opened under it, and a brisk
    // player read "On the far rim, a man..." inside the Tally House, under its card)
    if (this.sightEntered && this.sightEnter >= paramNumber(m, 'clockSeconds', 12) && !(this.sight === 2 && !s.story.finished(seenLine))) this.openSightDoor(false);
    if (this.sightDoorOpen && s.zone !== m.zone && !s.zoneHeld) {
      // she has gone in: what was being said about the rim is behind her
      // (pass i1: "gone", once it is on screen, is heard to its end)
      s.story.drop(seenLine); if (s.story.current !== gone) s.story.drop(gone);
      this.endSighting(true);
      return;
    }
    if (!this.sightEntered && this.sightClear >= BREADCRUMB_AFTER) this.crumb();
  }

  // ---- per tick -------------------------------------------------------------------------------------
  tick(dt: number): void {
    const { s } = this;
    for (let i = 0; i < this.encs.length; i++) {
      const e = this.encs[i] as Enc;
      if (e.openWhenBuilt !== '' && !s.build.busy && !s.build.seamPending) { s.doors.open(e.openWhenBuilt); e.openWhenBuilt = ''; }
      if (e.boss || e.state === 'cleared') continue;
      if (e.state === 'idle') {
        if (!s.build.isBuilt(e.data.zone) || s.ctx.data.zone(e.data.zone).set !== s.residentSet) continue;
        // dormant members stand in the world from the build on: the kneeler, the two risers, the File, the Tamper
        for (let k = 0; k < e.members.length; k++) {
          const m = e.members[k] as Member;
          if (m.state === NONE && m.marker.params.dormant !== undefined && s.build.isBuilt(m.marker.zone)) this.spawnMember(e, m, true);
        }
        // an encounter whose trigger is a door starts when the door starts to open (the File behind the baffle)
        if (s.doors.state(e.data.trigger) !== 'closed' && s.doors.ids().includes(e.data.trigger)) this.start(e.id);
        continue;
      }
      if (e.lockLater.length > 0 && s.zone === e.data.zone) this.lockDeferred(e);
      for (let g = 0; g < e.gates.length; g++) {
        const gate = e.gates[g] as Enc['gates'][number];
        const p = s.ctx.player.position, dx = p.x - gate.x, dz = p.z - gate.z;
        e.sched.gateOpen[gate.wave] = dx * dx + dz * dz <= gate.near2;
      }
      if (e.burstIn >= 0) {
        e.burstIn -= dt;
        if (e.burstIn < 0) { s.doors.open(e.burstDoor, false, true); e.burstDoor = ''; }
      }
      let w = e.sched.update(dt);
      while (w >= 0) { this.releaseWave(e, w); w = e.sched.update(0); }
      // spawn what is due, never past the alive cap; a refused spawn is tried again next tick
      let alive = this.aliveNow(e);
      for (let k = 0; k < e.members.length && alive < e.data.maxAlive; k++) {
        const m = e.members[k] as Member;
        if (m.state === DUE && this.spawnMember(e, m, false)) alive++;
      }
      if (e.tamper) this.tamperFloor(e, dt);
      this.watchTurn(e);
      // a wave cancelled this tick can be what was holding the encounter open
      if (e.sched.clear) this.clear(e, false); else this.announceLast(e);
    }
    if (this.vigId !== '') { this.vigLeft -= dt; if (this.vigLeft <= 0) this.endVignette('ended'); }
    if (this.teachIn >= 0) {
      this.teachIn -= dt;
      const boss = this.bossEnc, phase = s.ctx.enemies.boss.phase;
      if (this.teachIn < 0 && boss && boss.state === 'active' && (phase === 'p1' || phase === 'p2') && s.ctx.data.story.lines[TEACH_HAUL] !== undefined) {
        // the first retry: what the ribs are for, at once; then (if no hit had said it) what standing still costs
        if (s.story.current === '') s.story.sayNow(TEACH_HAUL); else s.story.sayFront(TEACH_HAUL);
        s.story.mute(TEACH_HAUL, HINT_ECHO);
        if (!s.story.heard(TEACH_MOVE) && s.ctx.data.story.lines[TEACH_MOVE] !== undefined) s.story.sayFront(TEACH_MOVE);
      }
    }
    this.tickSighting(dt);
  }

  /** she has come in: the doors whose lock was put off shut behind her (once she is well clear of each) */
  private lockDeferred(e: Enc): void {
    const { s } = this;
    const p = s.ctx.player.position;
    for (let i = e.lockLater.length - 1; i >= 0; i--) {
      const id = e.lockLater[i] as MarkerId;
      const m = this.doorMarker(id);
      if (m) { const dx = p.x - m.pos[0], dz = p.z - m.pos[2]; if (dx * dx + dz * dz < LOCK_INSIDE * LOCK_INSIDE) continue; }
      e.lockLater[i] = e.lockLater[e.lockLater.length - 1] as MarkerId;
      e.lockLater.length--;
      s.doors.lock(id, true);
    }
  }
  private readonly doorMarkers = new Map<MarkerId, LayoutMarker>();
  private doorMarker(id: MarkerId): LayoutMarker | undefined {
    let m = this.doorMarkers.get(id);
    if (!m) { m = this.s.ctx.data.layout.markers.find((x) => x.id === id); if (m) this.doorMarkers.set(id, m); }
    return m;
  }

  /**
   * The ammo floor in a fight that has nobody to free (polish round 2: a player with human aim ran dry on the Tamper,
   * and the lift hall has no dispenser while its doors are locked). GDD 6.5's floor names Biders and breakables; a
   * Tamper alone gives neither. So: a round that meets the Tamper (plate, body or vent) with cylinder + reserve at or
   * under the floor shakes one packet out of it.
   * Polish round 4 (R1; the playthrough critic's major): it was once per attempt, and a plain player who mostly hit
   * plate ran dry and was eaten by the wave Biders with nothing to shoot back (five deaths in a row, 0 + 0 each time).
   * It now repeats, `TAMPER_MERCY_EVERY` seconds apart; and a player who is wholly dry (no round to shake it with) is
   * given one by the hall's locker wall, with the locker's chime (`tamperFloor`). GDD 6.5, 7.3.
   */
  private onTamperHit(id: EntityId, outcome: string, x: number, y: number, z: number): void {
    const { s } = this;
    if (!s.running || (outcome !== 'deflected' && outcome !== 'hit' && outcome !== 'weak')) return;
    const e = this.find(id, '');
    if (!e || e.boss || e.state !== 'active') return;
    // Polish round 5 (the combat critic: 29 rounds off the plate over three attempts, two deaths to the slam): the
    // fourth round in a row that the plate turns says where the lead belongs, once an attempt. Not on Hard; not with
    // hints off.
    if (outcome !== 'deflected') e.plateRun = 0;
    else if (++e.plateRun === TAMPER_PLATE_HINT && !e.plateHinted && s.hintsOn() && s.ctx.options.value.difficulty !== 'hard') { e.plateHinted = true; s.story.say(TAMPER_HINT_KEY); }
    if (e.mercyWait > 0) return;
    const w = s.ctx.player.weapon;
    if (w.chambered + w.reserve > AMMO_FLOOR) return;
    e.mercy = true; e.mercyWait = TAMPER_MERCY_EVERY;
    const ground = s.ctx.collision.groundHeight(x, y, z, 6);
    s.interact.spawnPickup('pk_rounds_6', x, Number.isNaN(ground) ? y : ground, z);
  }
  /** per tick of a Tamper's fight: the wait between two packets runs down; wholly dry, the locker wall gives one */
  private tamperFloor(e: Enc, dt: number): void {
    if (e.mercyWait > 0) { e.mercyWait -= dt; return; }
    const { s } = this;
    const w = s.ctx.player.weapon;
    if (w.chambered + w.reserve > 0 || !s.ctx.player.alive) return;
    let tamperUp = false;
    for (let k = 0; k < e.members.length; k++) { const m = e.members[k] as Member; if (m.kind === 'tamper' && m.state === ALIVE) tamperUp = true; }
    if (!tamperUp) return;
    const at = this.doorMarker(TAMPER_MERCY_AT);
    const p = s.ctx.player.position;
    // one step out from the locker wall into the room (the locker faces the hall); with no such marker, at her feet
    const x = at ? at.pos[0] + 1.2 : p.x, y = at ? at.pos[1] : p.y, z = at ? at.pos[2] : p.z;
    e.mercy = true; e.mercyWait = TAMPER_MERCY_EVERY;
    const ground = s.ctx.collision.groundHeight(x, y + 0.5, z, 6);
    s.interact.spawnPickup('pk_rounds_6', x, Number.isNaN(ground) ? y : ground, z);
    s.story.say('cap_locker_chime');
  }

  onBreakable(x: number, y: number, z: number): void {
    const w = this.s.ctx.player.weapon;
    if (w.chambered + w.reserve <= AMMO_FLOOR) this.s.interact.spawnPickup('pk_rounds_6', x, y, z);
  }

  // ---- run, save ------------------------------------------------------------------------------------
  reset(): void {
    this.knotAt.clear();
    for (const e of this.encs) {
      e.state = 'idle'; e.freed = 0; e.felled = 0; e.lastAnnounced = false; e.slowDone = false; e.mercy = false; e.mercyWait = 0; e.plateRun = 0; e.plateHinted = false; e.view.wave = ''; e.openWhenBuilt = ''; e.lockLater.length = 0; e.burstDoor = ''; e.burstIn = -1;
      e.sched.reset();
      for (const m of e.members) { m.state = NONE; m.id = ''; }
    }
    for (const t of this.triggers) { t.inside = false; t.lookT = 0; t.crossed = false; t.crossT = 0; }
    this.heldTrig = null; this.teachIn = -1;
    for (const l of this.nearLines) l.t = 0;
    this.sight = 0; this.sightDoorOpen = false; this.glareLeft = 0; this.vigId = ''; this.vigLeft = 0; this.turnWatch = ''; this.turnLine = ''; this.turnEnc = '';
    this.pipLeft = 0;
    this.s.needSprint = false; this.endWatchGlint();
  }
  capture(save: WorldSave): void {
    for (const e of this.encs) {
      if (e.state === 'cleared') { save.encountersCleared.push(e.id); continue; }
      if (e.boss) continue;
      // A save never holds the start of a fight without the fight: for an encounter that is not cleared, the knot that
      // starts it is whole again and the door that knot let go is shut, so a restore can always start it again.
      const t = this.s.ctx.data.layout.markers.find((m) => m.id === e.data.trigger);
      if (!t || t.params.kind !== 'knot') continue;
      const flag = save.onceFlags.indexOf('burst:' + t.id);
      if (flag >= 0) save.onceFlags.splice(flag, 1);
      const door = paramString(t, 'opens') || paramString(t, 'releases');
      if (door !== '' && save.doors[door] !== undefined) save.doors[door] = 'closed';
      for (const id of PUZZLES) { const d = save.puzzles[id]?.data; if (d && d.knot === true && this.s.forcers.has(t.id) && PREREQUISITE[e.id] === id) d.knot = false; }
      const objective = paramString(t, 'objective');
      if (objective !== '') {
        const o = save.onceFlags.indexOf('obj:' + objective);
        if (o >= 0) save.onceFlags.splice(o, 1);
        if (save.objective === objective) save.objective = this.objectiveBefore(objective, save);
      }
    }
  }
  /** the objective that stood before `key` was set: the latest earlier one the save still holds */
  private objectiveBefore(key: StoryKey, save: WorldSave): StoryKey {
    const all = Object.keys(this.s.ctx.data.story.objectives);
    for (let i = all.indexOf(key) - 1; i >= 0; i--) if (save.onceFlags.includes('obj:' + all[i])) return all[i] as StoryKey;
    return all[0] ?? '';
  }
  apply(save: Readonly<WorldSave>, full: SaveData | null): void {
    const { s } = this;
    // the encounter in progress resets: its members are gone (enemies.applySave ran first) and its tallies with them
    for (const e of this.encs) {
      const live = e.state === 'active' || e.state === 'vignette';
      if (live) {
        s.ctx.enemies.clearEncounter(e.id);
        this.resetPayload.id = e.id;
        s.ctx.events.emit('encounter/reset', this.resetPayload);
      }
    }
    this.reset();
    for (const id of save.encountersCleared) { const e = this.byId.get(id); if (e) e.state = 'cleared'; }
    s.needSprint = s.flags.has('did_sprint');
    // the sighting follows the yard: over if the save says so, else he stands there again
    if (this.sightAfter !== '' && this.cleared(this.sightAfter)) { if (s.flags.has('dowser_done')) this.sight = 4; else this.beginSighting(); }
    if (s.flags.has(this.exposureFlag) && s.zone === this.exposureZone) s.ctx.render.setExposure(this.exposureMult, 0);
    else s.ctx.render.setExposure(1, 0);
    // a restore at a boss checkpoint: the fight is on again from the saved phase, wherever its trigger stands
    const boss = this.bossEnc;
    if (boss && full && boss.state === 'idle' && BOSS_VALUES.includes(full.checkpoint)) this.start(boss.id);
    // (pass i3, R2) the first retry of the Windlass is told what its ribs are for, straight after the respawn
    if (boss && boss.state === 'active' && s.bossDeaths >= 1 && !s.story.heard(TEACH_HAUL)) this.teachIn = TEACH_AFTER;
    for (const e of this.encs) this.stationLamp(e, e.state === 'cleared');
    // p0: a save taken with the Windlass dead (checkpoints.again) restores in the bore: the lift gate's lamp is lit again
    if (boss && boss.state === 'cleared' && s.build.isBuilt(boss.data.zone)) {
      for (const id of s.doors.ids()) {
        const m = this.doorMarker(id);
        if (!m || !(paramString(m, 'opens') || paramString(m, 'opensOn')).startsWith('boss dead')) continue;
        const lamp = lampNode(s, id, 'gate_lamp');
        if (lamp) s.ctx.render.lamps.setMask(lamp, 1);
      }
    }
  }
  /** the yard's station wakes with its fight (stn_yard_wake: "surface power: wind"): the drum's lamp */
  private stationLamp(e: Enc, on: boolean): void {
    const vig = e.members[0]?.marker.params.vignette as { line?: string } | undefined;
    if (!vig || !vig.line || this.s.ctx.data.story.lines[vig.line]?.speaker !== 'station') return;
    const lamp = this.s.build.zoneNode(e.data.zone, 'drum_lamp');
    if (lamp) this.s.ctx.render.lamps.setMask(lamp, on ? 1 : 0);
  }
  debug(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const e of this.encs) {
      const v = this.encounter(e.id);
      out[e.id] = { state: v.state, wave: v.wave, alive: v.alive, spawned: v.spawned, pendingWaves: e.sched.pending, freed: e.freed, felled: e.felled };
    }
    out.sight = this.sight;
    out.watch = { glint: this.watchCard !== null, level: this.watchLevel, held: false };
    out.sightLooked = Math.round(this.sightLooked * 100) / 100;
    return out;
  }
}
const BOSS_VALUES: readonly CheckpointId[] = ['cp_boss_p1', 'cp_boss_p2', 'cp_boss_p3', 'cp_boss_proven'];

export function createDirector(s: State): DirectorApi { return new Director(s); }
