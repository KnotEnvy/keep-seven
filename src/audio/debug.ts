// `__dbg.ext.audio` (test and dev only): any sound, or a whole scripted stretch of the game's audio, rendered through
// an OfflineAudioContext by the same engine and graph that play live, and measured. Test code: it allocates freely.
import type { EventName, GameContext, ZoneId } from '../core/contracts.ts';
import { createRng } from '../core/rng.ts';
import { ZONES } from './ambience.ts';
import {
  bandShare, centroidOf, envelope, firstAbove, fundamentalOf, lastAbove, partialNear, peakOf, rmsOf, schroeder30, spectrogram, statsOf, tail60, toDb, zeroCrossHz,
} from './analysis.ts';
import type { SoundStats } from './analysis.ts';
import { bakeFor } from './bake.ts';
import { CAPTIONS } from './captions.ts';
import { cueSounds } from './cues.ts';
import { Engine, buildSounds } from './engine.ts';
import { Graph } from './graph.ts';
import type { Tap } from './graph.ts';
import type { MusicStateName } from './music.ts';
import { IR_NAMES, IR_SECONDS, zoneIr } from './reverb.ts';
import type { SoundParams, SoundTable } from './sound.ts';

export const RENDER_RATE = 48000;
/**
 * Chromium's compressor fades in over its first ~120 ms of context time (measured: a steady tone starts at 0.2 of its
 * level). A live context is long past that; an offline render is not, so every render runs this long before its
 * time 0 and the lead-in is cut off the result.
 */
const PREROLL = 0.25;

export interface AudioDebugHost {
  readonly engine: Engine;
  readonly context: AudioContext | null;
  readonly graph: Graph | null;
  readonly unlocked: boolean;
  unlock(): void;
}
/** params of ext.audio.render(): the numeric fields of SoundParams, plus where it is heard */
export interface RenderParams extends Partial<SoundParams> {
  /** the room that answers; left out = dry */
  zone?: ZoneId;
  /** total seconds rendered; left out = the sound's length plus its tail */
  total?: number;
  tap?: Tap;
  /** master, effects, music (the game's defaults when left out) */
  volumes?: [number, number, number];
  /** false: build every sound from its recipe, as before the bake lands (default: the pre-rendered takes, as live) */
  baked?: boolean;
}
export interface ScriptStep {
  /** seconds from the start */
  t: number;
  /** an event of the game, with its payload ... */
  ev?: EventName;
  p?: Record<string, unknown>;
  /** ... or the threat `ctx.enemies.threat` reports from now on */
  threat?: number;
  /** ... or the listener: eye x, y, z and forward x, y, z */
  listener?: [number, number, number, number, number, number];
}
export interface ScriptOptions {
  zone?: ZoneId;
  tap?: Tap;
  seed?: number;
  /** game state the script starts in ('playing' when left out) */
  state?: string;
  volumes?: [number, number, number];
  /** no ambience and no music: only what the events start */
  quiet?: boolean;
  /** false: build every sound from its recipe (default: the pre-rendered takes, as live) */
  baked?: boolean;
}
export interface ScriptResult extends SoundStats {
  says: { key: string; tick: number }[];
  music: { state: string; intensity: number; tick: number }[];
  recent: { name: string; tick: number }[];
  voicePeak: number; dropped: number; starts: number; nodes: number;
}

interface Rendered { pcm: Float32Array; left: Float32Array; right: Float32Array; sr: number }
let last: Rendered | null = null;
let table: SoundTable | null = null;

function mono(buffer: AudioBuffer, skipSeconds = PREROLL): Rendered {
  const skip = Math.round(skipSeconds * buffer.sampleRate);
  const left = buffer.getChannelData(0).subarray(skip), right = (buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : buffer.getChannelData(0)).subarray(skip);
  const pcm = new Float32Array(left.length);
  for (let i = 0; i < pcm.length; i++) pcm[i] = ((left[i] as number) + (right[i] as number)) * 0.5;
  return { pcm, left, right, sr: buffer.sampleRate };
}
function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function need(): Rendered {
  if (!last) throw new Error('ext.audio: nothing has been rendered yet');
  return last;
}

function offlineEngine(seconds: number, tap: Tap, seed: number, volumes: [number, number, number] | undefined, quiet: boolean):
  { engine: Engine; graph: Graph; ac: OfflineAudioContext; world: { tick: number; zone: ZoneId | ''; threat: number }; says: { key: string; tick: number }[]; music: { state: string; intensity: number; tick: number }[] } {
  const ac = new OfflineAudioContext(2, Math.max(1, Math.ceil((seconds + PREROLL) * RENDER_RATE)), RENDER_RATE);
  const graph = new Graph(ac, true, tap);
  graph.virtualNow = PREROLL;
  const world = { tick: 0, zone: '' as ZoneId | '', threat: 0 };
  const says: { key: string; tick: number }[] = [], music: { state: string; intensity: number; tick: number }[] = [];
  const engine = new Engine({
    tick: () => world.tick, zone: () => world.zone, threat: () => world.threat,
    say: (key: string) => { says.push({ key, tick: world.tick }); },
    music: (state: MusicStateName, intensity: number) => { music.push({ state, intensity, tick: world.tick }); },
    rng: createRng(seed).fork('audio'),
  });
  engine.quiet = quiet;
  engine.attach(graph);
  const v = volumes ?? [0.8, 1, 0.7];
  graph.setVolumes(v[0], v[1], v[2]);
  // setTargetAtTime from the constructor values would take 60 ms to settle: a render starts already mixed
  graph.master.gain.setValueAtTime(v[0], 0);
  return { engine, graph, ac, world, says, music };
}

/** One sound, alone, through the real graph. */
export async function renderSound(name: string, params: RenderParams = {}): Promise<SoundStats> {
  table ??= buildSounds();
  const def = table[name];
  if (!def) throw new Error(`ext.audio.render: no sound named '${name}' (${Object.keys(table).join(', ')})`);
  const timed = def.timed > 0 ? (params.seconds && params.seconds > 0 ? params.seconds : def.timed) : 0;
  const tail = params.zone ? (IR_SECONDS[zoneIr(params.zone)] as number) + 0.4 : 0.25;
  const total = params.total ?? def.dur + timed + (params.delay ?? 0) + tail;
  const o = offlineEngine(total, params.tap ?? 'master', 1, params.volumes, true);
  if (params.baked !== false) o.graph.baked = await bakeFor(table, RENDER_RATE);
  o.graph.setReverb(params.zone ? zoneIr(params.zone) : -1, 0, 0);
  o.graph.combat.gain.setValueAtTime(1, 0);          // the drum and the bow are heard alone here
  const p = o.engine.params();
  for (const k of Object.keys(params) as (keyof RenderParams)[]) {
    if (k === 'zone' || k === 'total' || k === 'tap' || k === 'volumes' || k === 'baked') continue;
    (p as unknown as Record<string, unknown>)[k] = params[k];
  }
  o.engine.play(name, p);
  last = mono(await o.ac.startRendering());
  return statsOf(last.pcm, last.sr);
}

/** A stretch of the game's audio: events on a timeline through the whole engine (handlers, music, ambience, mix). */
export async function renderScript(script: readonly ScriptStep[], seconds: number, options: ScriptOptions = {}): Promise<ScriptResult> {
  const o = offlineEngine(seconds, options.tap ?? 'master', options.seed ?? 1, options.volumes, options.quiet === true);
  const { engine, graph, world } = o;
  if (options.baked !== false) graph.baked = await bakeFor(engine.sounds, RENDER_RATE);
  world.zone = options.zone ?? 'the_lip';
  graph.setReverb(zoneIr(world.zone), 0, 0);
  engine.music.game = (options.state ?? 'playing') as typeof engine.music.game;
  engine.setListener(0, 1.65, 0, 0, 0, -1);
  const steps = script.slice().sort((a, b) => a.t - b.t);
  let next = 0;
  const ticks = Math.ceil(seconds * 60);
  for (let tick = 0; tick < ticks; tick++) {
    world.tick = tick;
    graph.virtualNow = PREROLL + tick / 60;
    while (next < steps.length && (steps[next] as ScriptStep).t <= tick / 60 + 1e-9) {
      const s = steps[next++] as ScriptStep;
      if (s.threat !== undefined) world.threat = s.threat;
      if (s.listener) engine.setListener(...s.listener);
      if (s.ev) {
        if (s.ev === 'zone/entered' && s.p) world.zone = s.p['zone'] as ZoneId;
        const handler = engine.handlers.get(s.ev) as ((payload: unknown) => void) | undefined;
        if (handler) handler(s.p ?? {});
      }
    }
    engine.fixedUpdate();
  }
  last = mono(await o.ac.startRendering());
  return { ...statsOf(last.pcm, last.sr), says: o.says, music: o.music, recent: engine.recent(128), voicePeak: engine.voicePeak, dropped: engine.dropped, starts: engine.starts, nodes: graph.nodes };
}

/** An impulse through one room alone: its measured time to -60 dB. */
export async function renderRoom(zone: ZoneId): Promise<{ zone: ZoneId; kind: string; target: number; tail60: number; t30: number; slapAt: number }> {
  const kind = zoneIr(zone), target = IR_SECONDS[kind] as number;
  const ac = new OfflineAudioContext(2, Math.ceil((target + 1) * RENDER_RATE), RENDER_RATE);
  const graph = new Graph(ac, true, 'reverb');
  graph.setReverb(kind, 0, 0);
  const buf = ac.createBuffer(1, 2, RENDER_RATE);
  buf.getChannelData(0)[0] = 1;
  const src = ac.createBufferSource();
  src.buffer = buf; src.connect(graph.reverbIn); src.start(0);
  last = mono(await ac.startRendering(), 0);
  // the slap: the loudest 5 ms window between 0.2 and 0.5 s
  const env = envelope(last.pcm, last.sr, 0.005);
  let slap = 0, best = 0;
  for (let i = 40; i < 100 && i < env.length; i++) if ((env[i] as number) > best) { best = env[i] as number; slap = i * 0.005; }
  return { zone, kind: IR_NAMES[kind] as string, target, tail60: tail60(last.left, last.sr), t30: schroeder30(last.left, last.sr), slapAt: slap };
}

type ProbeOp = [op: string, ...args: number[]];
/** Measurements on the last rendered buffer (mono mix), several in one round trip. */
export function probe(ops: readonly ProbeOp[]): number[] {
  const r = need(), x = r.pcm, sr = r.sr;
  return ops.map(([op, a = 0, b = -1, c = 0, d = 0]) => {
    switch (op) {
      case 'peak': return peakOf(x, sr, a, b);
      case 'rms': return rmsOf(x, sr, a, b);
      case 'rmsDb': return toDb(rmsOf(x, sr, a, b));
      case 'peakDb': return toDb(peakOf(x, sr, a, b));
      case 'centroid': return centroidOf(x, sr, a, b, c || 20, d || 20000);
      case 'fundamental': return fundamentalOf(x, sr, a, b, c || 30, d || 5000);
      case 'partial': return partialNear(x, sr, a, b, c, d);
      case 'band': return bandShare(x, sr, a, b, c, d);
      case 'zeroCross': return zeroCrossHz(x, sr, a, b);
      case 'lastAbove': return lastAbove(x, sr, c, a, b);
      case 'firstAbove': return firstAbove(x, sr, c, a, b);
      case 'sample': return x[Math.round(a)] ?? 0;
      case 'length': return x.length;
      // right over left in a span, dB (> 0: the sound leans right)
      case 'balance': return toDb(rmsOf(r.right, sr, a, b)) - toDb(rmsOf(r.left, sr, a, b));
      default: throw new Error(`ext.audio.probe: unknown op '${op}'`);
    }
  });
}

export function registerAudioDebug(ctx: GameContext, host: AudioDebugHost): void {
  if (!ctx.flags.test && !ctx.flags.dev) return;
  const api = {
    /** render(name, params) -> { peak, rms, duration, centroidHz, fundamentalHz, firstSample, sampleRate, seconds } */
    render: (name: string, params?: RenderParams) => renderSound(name, params),
    renderScript: (script: readonly ScriptStep[], seconds: number, options?: ScriptOptions) => renderScript(script, seconds, options),
    renderRoom: (zone: ZoneId) => renderRoom(zone),
    probe: (ops: readonly ProbeOp[]) => probe(ops),
    /** RMS per window of the last render, in dB */
    envelopeDb: (windowSeconds: number) => Array.from(envelope(need().pcm, need().sr, windowSeconds), (v) => Math.round(toDb(v) * 10) / 10),
    /** the last render as base64 Float32 (mono mix) */
    pcm: () => { const r = need(); return { sampleRate: r.sr, length: r.pcm.length, data: base64(new Uint8Array(r.pcm.buffer)) }; },
    spectrogram: (width: number, height: number, fLo?: number, fHi?: number, floorDb?: number) => { const r = need(); return base64(spectrogram(r.pcm, r.sr, width, height, fLo, fHi, floorDb)); },
    sounds: () => Object.keys(host.engine.sounds),
    cues: () => Object.keys(cueSounds()),
    captions: () => CAPTIONS,
    zones: () => ZONES.slice(),
    unlock: () => { host.unlock(); return host.context ? host.context.state : 'none'; },
    /** the live context (not part of debugState: `__dbg.hash()` never depends on it) */
    status: () => ({
      context: host.context ? host.context.state : 'none', sampleRate: host.context ? host.context.sampleRate : 0,
      currentTime: host.context ? host.context.currentTime : 0, baseLatency: host.context ? host.context.baseLatency : 0,
      unlocked: host.unlocked, active: host.graph ? host.graph.active : false, baked: host.graph ? host.graph.baked !== null : false,
      nodes: host.graph ? host.graph.nodes : 0, starts: host.engine.starts, voices: host.engine.voices, voicePeak: host.engine.voicePeak, dropped: host.engine.dropped,
    }),
    engine: () => host.engine,
    graph: () => host.graph,
  };
  ctx.debug.register('audio', api as unknown as Record<string, (...args: never[]) => unknown>);
}
