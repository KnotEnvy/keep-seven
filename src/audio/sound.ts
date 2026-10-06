// What a sound is: a bus, a priority, a logical length and a builder that creates its nodes at one start time.
import type { Graph } from './graph.ts';

/** Parameters of one start. A fixed-shape scratch object owned by the engine: builders read it and never keep it. */
export interface SoundParams {
  /** linear gain on top of the sound's own level */
  gain: number;
  /** pitch multiplier (the seeded jitter, a cue's `pitch`) */
  pitch: number;
  /** seconds from now to the start (music scheduled a few ticks ahead) */
  delay: number;
  /** a length the event carries (a telegraph, an index run, a station line) */
  seconds: number;
  /** meaning per sound (a scale degree, chambers left, a layer mask ...): see each builder */
  a: number; b: number; c: number;
  x: number; y: number; z: number;
  positional: boolean;
  /** stereo position -1..1 of a sound that is not positional */
  pan: number;
  /** multiplier on the sound's reverb send (the last two rounds of a cylinder are drier) */
  send: number;
  /** the line the station speaks (blips by word) */
  text: string;
  /** tracked-enemy slot the voice belongs to (so a flinch can cut its tone); -1 = none */
  tag: number;
}
export function makeParams(): SoundParams {
  return { gain: 1, pitch: 1, delay: 0, seconds: 0, a: 0, b: 0, c: 0, x: 0, y: 0, z: 0, positional: false, pan: 0, send: 1, text: '', tag: -1 };
}
export function resetParams(p: SoundParams): SoundParams {
  p.gain = 1; p.pitch = 1; p.delay = 0; p.seconds = 0; p.a = 0; p.b = 0; p.c = 0; p.x = 0; p.y = 0; p.z = 0; p.positional = false; p.pan = 0; p.send = 1; p.text = ''; p.tag = -1;
  return p;
}

export type SoundBuilder = (g: Graph, out: AudioNode, t: number, p: Readonly<SoundParams>) => void;

/** mix priority (GDD 17): player gun, enemy telegraphs, hit confirms, station voice, everything else */
export const PRIO_GUN = 4, PRIO_TELEGRAPH = 3, PRIO_CONFIRM = 2, PRIO_STATION = 1, PRIO_OTHER = 0;

export interface SoundDef {
  bus: number;
  prio: number;
  /** seconds the voice is counted as sounding (its dry length); for a timed sound p.seconds is added */
  dur: number;
  /** > 0: the sound's length comes with the event (p.seconds); this is the length when the event brings none */
  timed: number;
  /** reverb send, 0..1 (scaled up with distance for positional sounds) */
  send: number;
  /** distance at which a positional start is at half level, metres */
  range: number;
  build: SoundBuilder;
  /** sim tick of its last start (set by the engine that owns the table) */
  last: number;
  /** pre-rendered at load (bake.ts), or null: built from its recipe at each start */
  bake: BakeDef | null;
  /** the next take of a baked sound (round robin over its copies) */
  turn: number;
}

/** How a sound is pre-rendered: one buffer per class and copy; the pitch of a start is its playback rate. */
export interface BakeDef {
  /** `a` each class is rendered with */
  a: readonly number[];
  /** takes of each class (different windows of the noise, so a run of shots is not one sample) */
  copies: number;
  /** the class these parameters play, or -1: build the recipe live (a layer solo, a parameter the bake does not hold) */
  pick: (p: Readonly<SoundParams>) => number;
}
const ONE_CLASS = (): number => 0;
/** Marks a sound as pre-rendered. Its recipe may read only `a` (one of `a`) and `pitch` (frequencies only). */
export function baked(def: SoundDef, a: readonly number[] = [0], copies = 1, pick: (p: Readonly<SoundParams>) => number = ONE_CLASS): SoundDef {
  def.bake = { a, copies, pick };
  return def;
}
export type SoundTable = Record<string, SoundDef>;

export function snd(bus: number, prio: number, dur: number, send: number, build: SoundBuilder, range = 16, timed = 0): SoundDef {
  return { bus, prio, dur, timed, send, range, build, last: -1000, bake: null, turn: 0 };
}
