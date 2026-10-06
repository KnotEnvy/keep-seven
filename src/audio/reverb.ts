// Generated impulse responses, one per kind of space (GDD 17: the tail tells the player where she is). Noise bursts
// shaped by code, built once at load; no files. Pure: no WebAudio here, so the shapes are unit-testable.
import type { ZoneId } from '../core/contracts.ts';

export const IR_OUTDOORS = 0, IR_TALLY = 1, IR_GALLERY = 2, IR_HALL = 3, IR_BORE = 4;
export const IR_COUNT = 5;
/** seconds to -60 dB: outdoors 1.3 (slap at 320 ms), tally 0.5 dense, gallery 0.9 flutter, hall 2.2, bore 2.8 */
export const IR_SECONDS: readonly number[] = [1.3, 0.5, 0.9, 2.2, 2.8];
/**
 * How loud each space answers (the send level into its convolver). Outdoors (+3 dB) and the gallery (+4 dB) were
 * raised after a critic measured their answer under the bed: the slap and the flutter must read over the wind and the hum.
 */
export const IR_WET: readonly number[] = [0.64, 0.4, 0.71, 0.5, 0.55];
/**
 * How much more the room answers the world than the gun (a lift on the sends of every bus but the gun's). In the open a
 * sound's slap must stay under the sound itself (1: a jug at 10 m has its echo 7 dB under it); underground the things
 * that happen are far off in a hard room and live mostly in its tail ("long tail on everything", GDD 17).
 */
export const IR_WORLD: readonly number[] = [1, 1.3, 1.6, 2, 2];
/**
 * Under a short hit confirm (tick, tink, sour note, clank) the room's return steps back this many dB for this long
 * (Graph.duckTail). 5 dB for 120 ms is enough where the room is thin; the hall answers the report 4 dB and the bore
 * 7 dB louder than the street does at 140-200 ms, which left the confirms 1 to 3 dB UNDER the report's tail in the
 * very room where telling a weak point from a deflect is the fight (critic "combat", polish round 4). The dry gun bus
 * always steps back TAIL_DUCK_DB only: its last 50 ms of boom are the same in every room.
 */
export const IR_TAIL_DUCK_DB: readonly number[] = [5, 5, 5, 8, 10];
export const IR_TAIL_DUCK_SECONDS: readonly number[] = [0.12, 0.12, 0.12, 0.16, 0.2];
/** ... and the confirm itself is this much louder there (a gain on the voice; +2.5 dB in the hall, +3.5 dB in the bore) */
export const IR_CONFIRM_LIFT: readonly number[] = [1, 1, 1, 1.33, 1.5];
export const IR_NAMES: readonly string[] = ['outdoors', 'tally', 'gallery', 'hall', 'bore'];
/** the outdoor slap-back, seconds */
export const SLAP_SECONDS = 0.32;

export function zoneIr(zone: ZoneId | ''): number {
  switch (zone) {
    case 'tally_house': return IR_TALLY;
    case 'the_gallery': return IR_GALLERY;
    case 'lift_hall': return IR_HALL;
    case 'the_bore': return IR_BORE;
    default: return IR_OUTDOORS;       // the_lip, plenty_street, far_rim
  }
}

interface IrShape { pre: number; fc0: number; fc1: number; early: number }
const SHAPES: readonly IrShape[] = [
  { pre: 0.012, fc0: 5200, fc1: 900, early: 0 },      // outdoors: thin, sparse, one hard slap off the far wall
  { pre: 0.002, fc0: 3800, fc1: 1100, early: 1.2 },   // tally: wood and bodies, dense and short
  { pre: 0.004, fc0: 6500, fc1: 1500, early: 0.3 },   // gallery: flutter between two bare walls
  { pre: 0.02, fc0: 5000, fc1: 700, early: 0.2 },     // hall: big, bright metal
  { pre: 0.035, fc0: 2600, fc1: 320, early: 0 },      // bore: long and dark, a throat
];

/** Stereo impulse response for a kind of space at a sample rate; deterministic for a seed. Each channel has unit energy. */
export function makeIr(kind: number, sr: number, seed = 7): [Float32Array, Float32Array] {
  const T = IR_SECONDS[kind] as number, shape = SHAPES[kind] as IrShape;
  const n = Math.ceil(T * 1.08 * sr);
  const out: [Float32Array, Float32Array] = [new Float32Array(n), new Float32Array(n)];
  for (let ch = 0; ch < 2; ch++) {
    let s = (seed * 0x9e3779b1 + ch * 0x85ebca6b + kind * 0xc2b2ae35) >>> 0;
    const rand = (): number => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    const h = out[ch] as Float32Array;
    const pre = Math.round((shape.pre + ch * 0.0007) * sr);
    let y = 0, energy = 0;
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / sr, u = Math.min(1, t / T);
      const fc = shape.fc0 * Math.pow(shape.fc1 / shape.fc0, u);
      const a = 1 - Math.exp(-2 * Math.PI * fc / sr);
      let x = rand() * 2 - 1;
      // open air: few reflections early, a haze later (each survivor louder, so the power is the envelope's)
      if (kind === IR_OUTDOORS) { const density = 0.12 + 0.6 * u; x = rand() > density ? 0 : x / Math.sqrt(density); }
      y += a * (x - y);
      // a one-pole low-pass of white noise has power a / (2 - a): undo it so the envelope alone sets the decay
      let v = y / Math.sqrt(a / (2 - a)) * Math.exp(-6.908 * t / T);
      if (shape.early > 0) v *= 1 + shape.early * Math.exp(-t / 0.018);
      if (kind === IR_GALLERY) { const ph = (t % 0.023) / 0.023; v *= 0.3 + 1.9 * Math.exp(-ph * 9); }
      if (kind === IR_BORE) v *= 1 + 0.25 * Math.sin(2 * Math.PI * 1.7 * t + ch);
      h[i] = v;
      energy += v * v;
    }
    if (kind === IR_OUTDOORS) {
      // the slap: the far wall of the gully or the street answering, once, then faintly again
      const dry = Math.sqrt(energy);
      for (let k = 1; k <= 2; k++) {
        const at = Math.round((SLAP_SECONDS * k + ch * 0.0013) * sr), len = Math.round(0.007 * sr);
        const amp = dry * (k === 1 ? 0.16 : 0.04);
        let z = 0;
        for (let i = 0; i < len && at + i < n; i++) {
          z += 0.45 * ((rand() * 2 - 1) - z);
          h[at + i] = (h[at + i] as number) + z * amp * (1 - i / len) * 3;
        }
      }
    }
    energy = 0;
    for (let i = 0; i < n; i++) energy += (h[i] as number) * (h[i] as number);
    const k = 1 / Math.sqrt(energy);
    for (let i = 0; i < n; i++) h[i] = (h[i] as number) * k;
  }
  return out;
}

const CACHE = new Map<number, [Float32Array, Float32Array]>();
/** makeIr, built once per (kind, sample rate): every graph of a page shares the arrays. */
export function irFor(kind: number, sr: number): [Float32Array, Float32Array] {
  const key = kind * 1000000 + sr;
  let ir = CACHE.get(key);
  if (!ir) { ir = makeIr(kind, sr); CACHE.set(key, ir); }
  return ir;
}
