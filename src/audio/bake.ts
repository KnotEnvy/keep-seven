// Pre-rendered one-shots. The sounds every shot makes (the report, the impacts, the confirms) and the footsteps are
// built from their own recipes once, at load, through an OfflineAudioContext, into AudioBuffers; a start then costs one
// buffer source and the voice's own gain instead of the dozens of nodes the recipe builds (the report alone: 45). The
// pitch of a start goes through the playback rate. Until the buffers exist (and for a recipe the bake does not cover,
// such as a layer solo) the recipe is built live, so nothing ever waits on the bake.
import { Graph } from './graph.ts';
import { makeParams, resetParams } from './sound.ts';
import type { SoundDef, SoundTable } from './sound.ts';

/** name -> buffers, class-major: buffers[cls * copies + copy] */
export type Baked = Map<string, AudioBuffer[]>;

/** silence between two takes in the bake render, seconds (no recipe rings into the next) */
const GAP = 0.05;
/** recorded past each sound's counted length: its last decay */
const MARGIN = 0.05;

interface Job { name: string; def: SoundDef; a: number; at: number; len: number }

function jobs(sounds: SoundTable, sr: number): { list: Job[]; total: number } {
  const list: Job[] = [];
  let at = 0;
  for (const name of Object.keys(sounds).sort()) {
    const def = sounds[name] as SoundDef, bk = def.bake;
    if (!bk) continue;
    const len = Math.ceil((def.dur + MARGIN) * sr) / sr;
    for (const a of bk.a) {
      for (let c = 0; c < bk.copies; c++) {
        list.push({ name, def, a, at, len });
        at += len + GAP;
      }
    }
  }
  return { list, total: at };
}

/** Renders every baked sound of a table at a sample rate. */
export async function bakeSounds(sounds: SoundTable, sr: number): Promise<Baked> {
  const { list, total } = jobs(sounds, sr);
  const out: Baked = new Map();
  if (list.length === 0) return out;
  const ac = new OfflineAudioContext(1, Math.ceil(total * sr) + 1, sr);
  const g = new Graph(ac, true);
  const p = makeParams();
  for (const j of list) {
    resetParams(p);
    p.a = j.a;
    const bus = g.gain(1);
    bus.connect(ac.destination);
    j.def.build(g, bus, j.at, p);
  }
  const rendered = (await ac.startRendering()).getChannelData(0);
  for (const j of list) {
    const n = Math.round(j.len * sr), from = Math.round(j.at * sr);
    const buf = new AudioBuffer({ length: n, numberOfChannels: 1, sampleRate: sr });
    buf.copyToChannel(rendered.subarray(from, from + n), 0);
    let takes = out.get(j.name);
    if (!takes) { takes = []; out.set(j.name, takes); }
    takes.push(buf);
  }
  return out;
}

const CACHE = new Map<number, Promise<Baked>>();
/** bakeSounds, once per sample rate for the page: the live graph and the offline renders of the tests share it. */
export function bakeFor(sounds: SoundTable, sr: number): Promise<Baked> {
  let b = CACHE.get(sr);
  if (!b) { b = bakeSounds(sounds, sr); CACHE.set(sr, b); }
  return b;
}
