// The node graph: buses, ducking, per-zone reverb, the limiter. The same class runs on the live AudioContext and on an
// OfflineAudioContext (tests, shots), so what is measured is what plays.
//
//   voice gain -> [pan] -> bus input (+ a send into the room) -> [duck] -> bus fader --+
//   gun ............................................................ -> pause --+--------------------------+
//   effects, ambience, music (+ combat layer), station, reverb return -> game sum -> silence -> death   |
//        low-pass -> pause -> compressor (limiter) ------------------------------------------------------+-> soft clip -> master -> out
//   ui -> compressor;   kept (the seventh's tone) -> its own pause -> soft clip: no reverb, no silence gate
//
// Chromium's DynamicsCompressorNode looks 6 ms ahead (measured: its first output sample is 288 samples late at
// 48 kHz). The gun's crack must leave on the tick of the click, so the gun bus goes round the compressor and the
// final stage is a memoryless soft clip that can never exceed 0.99: nothing clips, and nothing waits.
import type { ZoneId } from '../core/contracts.ts';
import type { Baked } from './bake.ts';
import { IR_COUNT, IR_TAIL_DUCK_DB, IR_TAIL_DUCK_SECONDS, IR_WET, IR_WORLD, irFor, zoneIr } from './reverb.ts';

export const BUS_GUN = 0, BUS_FX = 1, BUS_AMB = 2, BUS_MUSIC = 3, BUS_STATION = 4, BUS_UI = 5, BUS_KEPT = 6, BUS_COMBAT = 7;
export const BUS_COUNT = 8;
export const BUS_NAMES: readonly string[] = ['gun', 'effects', 'ambience', 'music', 'station', 'ui', 'kept', 'combat'];
/** static mix: the gun is the loudest thing in the world */
const BUS_TRIM: readonly number[] = [1.0, 0.36, 0.36, 0.5, 0.36, 0.22, 1.0, 1.0];
export const MAX_VOICES = 32;
/** music and ambience duck 5 dB for 200 ms on every shot */
export const DUCK_GAIN = Math.pow(10, -5 / 20);
export const DUCK_SECONDS = 0.2;
/**
 * What is left of the report (the gun bus and the room's return) steps back under a hit confirm: by then the report is
 * 10 dB down and has been heard; the confirm is what the player is waiting for (critic, polish 3). The gun bus gives
 * 5 dB for 120 ms everywhere; the room's return gives what its room needs (reverb.ts IR_TAIL_DUCK_DB / _SECONDS: the
 * same 5 dB and 120 ms in the open, 8 dB for 160 ms in the hall, 10 dB for 200 ms in the bore).
 */
export const TAIL_DUCK_DB = 5;
export const TAIL_DUCK_GAIN = Math.pow(10, -TAIL_DUCK_DB / 20);
export const TAIL_DUCK_SECONDS = 0.12;
export const TAIL_DUCK_LEAD = 0.008;
const CLIP_RANGE = 4;

export type Tap = 'master' | 'music' | 'ambience' | 'reverb' | 'nokept' | 'gun';

function clipCurve(): Float32Array<ArrayBuffer> {
  const n = 8193, curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = ((i / (n - 1)) * 2 - 1) * CLIP_RANGE, a = Math.abs(x);
    const y = a <= 0.8 ? a : 0.8 + 0.2 * (a - 0.8) / (a - 0.8 + 0.2);
    curve[i] = x < 0 ? -y : y;
  }
  return curve;
}

/** slope of the saturator at 0 */
export const DRIVE = 2.6;
let sat: Float32Array<ArrayBuffer> | null = null;
function satCurve(): Float32Array<ArrayBuffer> {
  if (sat) return sat;
  const n = 2049, k = 1 / Math.tanh(DRIVE);
  sat = new Float32Array(n);
  for (let i = 0; i < n; i++) sat[i] = Math.tanh(DRIVE * ((i / (n - 1)) * 2 - 1)) * k;
  return sat;
}

export class Graph {
  readonly sr: number;
  /** AudioNode constructions so far (tests: none outside a sound start) */
  nodes = 0;
  /** offline: the time the next sound is scheduled at; live: unused */
  virtualNow = 0;
  /** live: unlocked and running. Offline: always. One-shot sounds are built only while this is true. */
  active: boolean;
  /** the pre-rendered one-shots (bake.ts), once they exist; null: every sound is built from its recipe */
  baked: Baked | null = null;
  readonly noise: AudioBuffer;
  readonly busIn: GainNode[] = [];
  readonly busFader: GainNode[] = [];
  readonly musicDuck: GainNode;
  readonly ambDuck: GainNode;
  readonly gunDuck: GainNode;
  readonly ambHush: GainNode;
  readonly combat: GainNode;
  readonly gameSum: GainNode;
  readonly silence: GainNode;
  readonly deathLp: BiquadFilterNode;
  readonly pause: GainNode;
  readonly gunPause: GainNode;
  /** the kept tone's own pause gate: it skips everything else of the world, but not the pause menu */
  readonly keptPause: GainNode;
  readonly limiter: DynamicsCompressorNode;
  readonly master: GainNode;
  readonly reverbIn: GainNode;
  readonly reverbOut: GainNode;
  /** the room sends of everything but the gun: lifted per room (IR_WORLD) on their way to the same convolvers */
  readonly worldIn: GainNode;
  private readonly zoneIn: GainNode[] = [];
  private readonly rooms: (ConvolverNode | null)[] = [];
  private readonly plucks = new Map<number, AudioBuffer>();
  private irKind = -1;
  private noisePos = 0;
  private scope: AnalyserNode | null = null;
  private volMaster = 0.8;
  private volEffects = 1;
  private volMusic = 0.7;

  constructor(readonly ac: BaseAudioContext, readonly offline: boolean, tap: Tap = 'master') {
    this.sr = ac.sampleRate;
    this.active = offline;
    // one shared 2 s white-noise buffer from a fixed-seed LCG: every noise sound is a window of it, reproducibly
    this.noise = ac.createBuffer(1, Math.floor(this.sr * 2), this.sr);
    const d = this.noise.getChannelData(0);
    let s = 0x1234abcd;
    for (let i = 0; i < d.length; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; d[i] = s / 2147483648 - 1; }

    const pre = this.gain(1 / CLIP_RANGE);
    const clip = ac.createWaveShaper(); this.nodes++;
    clip.curve = clipCurve();
    this.master = this.gain(this.volMaster);
    pre.connect(clip); clip.connect(this.master);
    this.limiter = ac.createDynamicsCompressor(); this.nodes++;
    this.limiter.threshold.value = -4; this.limiter.knee.value = 2; this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002; this.limiter.release.value = 0.12;
    this.limiter.connect(pre);
    this.gameSum = this.gain(1); this.silence = this.gain(1);
    this.deathLp = this.filter('lowpass', 20000, 0.5);
    this.pause = this.gain(1); this.gunPause = this.gain(1); this.keptPause = this.gain(1);
    this.gameSum.connect(this.silence); this.silence.connect(this.deathLp); this.deathLp.connect(this.pause); this.pause.connect(this.limiter);
    this.gunPause.connect(pre); this.keptPause.connect(pre);
    this.musicDuck = this.gain(1); this.ambDuck = this.gain(1); this.ambHush = this.gain(1); this.combat = this.gain(0);
    this.gunDuck = this.gain(1);
    for (let b = 0; b < BUS_COUNT; b++) {
      const input = this.gain(1), fader = this.gain(this.busLevel(b));
      this.busIn.push(input); this.busFader.push(fader);
      if (b === BUS_MUSIC) { input.connect(this.musicDuck); this.musicDuck.connect(fader); }
      else if (b === BUS_AMB) { input.connect(this.ambDuck); this.ambDuck.connect(this.ambHush); this.ambHush.connect(fader); }
      else if (b === BUS_COMBAT) { input.connect(this.combat); this.combat.connect(fader); }
      else if (b === BUS_GUN) { input.connect(this.gunDuck); this.gunDuck.connect(fader); }
      else input.connect(fader);
    }
    (this.busFader[BUS_GUN] as GainNode).connect(this.gunPause);
    (this.busFader[BUS_FX] as GainNode).connect(this.gameSum);
    (this.busFader[BUS_AMB] as GainNode).connect(this.gameSum);
    (this.busFader[BUS_MUSIC] as GainNode).connect(this.gameSum);
    (this.busFader[BUS_STATION] as GainNode).connect(this.gameSum);
    (this.busFader[BUS_COMBAT] as GainNode).connect(this.busIn[BUS_MUSIC] as GainNode);
    (this.busFader[BUS_UI] as GainNode).connect(this.limiter);
    if (tap !== 'nokept') (this.busFader[BUS_KEPT] as GainNode).connect(this.keptPause);

    // five rooms, each behind its own gate: a convolver whose input is silent costs nothing, and the room she has
    // left goes on ringing while the next one fades in
    this.reverbIn = this.gain(1); this.reverbOut = this.gain(1); this.worldIn = this.gain(1);
    for (let k = 0; k < IR_COUNT; k++) {
      const gate = this.gain(0), lift = this.gain(IR_WORLD[k] as number);
      this.reverbIn.connect(gate);
      this.worldIn.connect(lift); lift.connect(gate);
      this.zoneIn.push(gate);
      this.rooms.push(null);
      // live: all five now, at load (setting a convolver's buffer costs tens of milliseconds: never during play).
      // Offline: only the rooms a render uses.
      if (!offline) this.room(k);
    }
    this.reverbOut.connect(this.gameSum);

    const dest = ac.destination;
    if (tap === 'music') (this.busFader[BUS_MUSIC] as GainNode).connect(dest);
    else if (tap === 'ambience') (this.busFader[BUS_AMB] as GainNode).connect(dest);
    else if (tap === 'reverb') this.reverbOut.connect(dest);
    else if (tap === 'gun') (this.busFader[BUS_GUN] as GainNode).connect(dest);
    else this.master.connect(dest);
  }

  now(): number { return this.offline ? this.virtualNow : this.ac.currentTime; }

  // ---- node factories (every construction is counted) ----------------------------------------------
  gain(value: number): GainNode { this.nodes++; const g = this.ac.createGain(); g.gain.value = value; return g; }
  osc(type: OscillatorType, hz: number): OscillatorNode { this.nodes++; const o = this.ac.createOscillator(); o.type = type; o.frequency.value = hz; return o; }
  filter(type: BiquadFilterType, hz: number, q: number): BiquadFilterNode {
    this.nodes++;
    const f = this.ac.createBiquadFilter(); f.type = type; f.frequency.value = Math.min(hz, this.sr * 0.45); f.Q.value = q;
    return f;
  }
  source(buffer: AudioBuffer, loop: boolean): AudioBufferSourceNode { this.nodes++; const s = this.ac.createBufferSource(); s.buffer = buffer; s.loop = loop; return s; }
  delay(maxSeconds: number, seconds: number): DelayNode { this.nodes++; const d = this.ac.createDelay(maxSeconds); d.delayTime.value = seconds; return d; }
  panner(pan: number): StereoPannerNode { this.nodes++; const p = this.ac.createStereoPanner(); p.pan.value = pan; return p; }
  /**
   * A tanh saturator (input +-1 -> output +-1, slope DRIVE at 0): a low sine driven into it grows the odd harmonics a
   * small speaker can play (the boom's 150 Hz throws 450 Hz), and its level falls out of the curve as it decays.
   */
  saturator(): WaveShaperNode {
    this.nodes++;
    const s = this.ac.createWaveShaper();
    s.curve = satCurve();
    // no oversampling: Chromium's resampler delays the signal 66 samples and rings before it; a 150 Hz sine through
    // tanh has nothing left to alias at 24 kHz
    return s;
  }
  /** Plays a pre-rendered sound (bake.ts) into a voice: one node, the pitch by playback rate. */
  playBuffer(buf: AudioBuffer, out: AudioNode, t: number, rate: number): void {
    const src = this.source(buf, false);
    if (rate !== 1) src.playbackRate.value = rate;
    src.connect(out);
    src.start(t);
  }
  /** a different window of the shared noise for each burst (deterministic for a graph) */
  noiseOffset(): number { this.noisePos = (this.noisePos + 0.1373) % 1.6; return this.noisePos; }
  /** keep a frequency legal for this context */
  hz(f: number): number { return f < 10 ? 10 : f > this.sr * 0.45 ? this.sr * 0.45 : f; }

  // ---- voices ----------------------------------------------------------------------------------------
  /**
   * Routes a voice's own gain node to a bus, through a panner when it has a place in the world and with a send into
   * the room when it has one. The nodes are the voice's own, created here at its start: routing cannot be scheduled
   * on the audio clock, so a pooled strip re-pointed at another bus would also move the tail of the voice before it
   * (and, rendered offline, every voice that ever used it).
   */
  route(node: AudioNode, bus: number, positional: boolean, pan: number, send: number): void {
    let from = node;
    if (positional || pan !== 0) { const p = this.panner(pan); node.connect(p); from = p; }
    from.connect(this.busIn[bus] as GainNode);
    // The send leaves the voice before its bus fader, so it carries the fader's level itself: the room answers a sound
    // at the level it has in the mix (an echo is never louder than what it echoes), and the volume options reach the
    // tails too. (Measured before this: a jug at 10 m on the 0.36 effects bus had its 320 ms slap 1.5 dB OVER itself.)
    if (send > 0) { const s = this.gain(send * this.busLevel(bus === BUS_COMBAT ? BUS_MUSIC : bus)); from.connect(s); s.connect(bus === BUS_GUN ? this.reverbIn : this.worldIn); }
  }

  // ---- mix -------------------------------------------------------------------------------------------
  private busLevel(b: number): number { return (BUS_TRIM[b] as number) * (b === BUS_MUSIC ? this.volMusic : b === BUS_COMBAT ? 1 : this.volEffects); }
  setVolumes(master: number, effects: number, music: number): void {
    this.volMaster = master; this.volEffects = effects; this.volMusic = music;
    const t = this.now();
    this.master.gain.setTargetAtTime(master, t, 0.02);
    for (let b = 0; b < BUS_COUNT; b++) (this.busFader[b] as GainNode).gain.setTargetAtTime(this.busLevel(b), t, 0.02);
  }
  /** music and ambience drop 5 dB for 200 ms: the gun owns the mix */
  duck(t: number): void {
    this.duckOne(this.musicDuck.gain, t); this.duckOne(this.ambDuck.gain, t);
  }
  private duckOne(p: AudioParam, t: number): void {
    p.cancelScheduledValues(t);
    p.setValueAtTime(DUCK_GAIN, t);
    p.setValueAtTime(DUCK_GAIN, t + DUCK_SECONDS - 0.01);
    p.linearRampToValueAtTime(1, t + DUCK_SECONDS + 0.03);
  }
  /** the report's tail and the room step back under a confirm that starts at `t` (smooth both ways: no click) */
  duckTail(t: number): void {
    const k = this.irKind;
    this.duckTailOne(this.gunDuck.gain, t, TAIL_DUCK_GAIN, TAIL_DUCK_SECONDS);
    if (k < 0) this.duckTailOne(this.reverbOut.gain, t, TAIL_DUCK_GAIN, TAIL_DUCK_SECONDS);
    else this.duckTailOne(this.reverbOut.gain, t, Math.pow(10, -(IR_TAIL_DUCK_DB[k] as number) / 20), IR_TAIL_DUCK_SECONDS[k] as number);
  }
  private duckTailOne(p: AudioParam, t: number, gain: number, seconds: number): void {
    // the step starts TAIL_DUCK_LEAD before the confirm: a tick's first millisecond lands on a tail already down
    const t0 = Math.max(this.now(), t - TAIL_DUCK_LEAD);
    p.cancelScheduledValues(t0);
    p.setTargetAtTime(gain, t0, 0.004);
    // a deeper step comes back more slowly: the tail swells in again, it does not jump
    p.setTargetAtTime(1, t + seconds, seconds * 0.25);
  }
  /** the hush before the seventh: the room holds its breath */
  setHush(on: boolean, t: number): void { this.ambHush.gain.setTargetAtTime(on ? 0.18 : 1, t, on ? 0.12 : 0.5); }
  setPaused(on: boolean, t: number): void {
    const v = on ? 0 : 1;
    this.pause.gain.setTargetAtTime(v, t, 0.012); this.gunPause.gain.setTargetAtTime(v, t, 0.012); this.keptPause.gain.setTargetAtTime(v, t, 0.012);
  }
  /** death: everything sinks through a low-pass over 0.6 s; off: back in 0.3 s */
  setDeath(on: boolean, t: number): void {
    const f = this.deathLp.frequency;
    f.cancelScheduledValues(t);
    if (on) { f.setValueAtTime(18000, t); f.exponentialRampToValueAtTime(180, t + 0.6); }
    else { f.setValueAtTime(Math.max(180, Math.min(18000, f.value)), t); f.exponentialRampToValueAtTime(20000, t + 0.3); }
  }
  /** true silence: everything of the world at zero from `t` for `seconds` (the kept tone has its own bus) */
  setSilence(t: number, seconds: number): void {
    const g = this.silence.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(1, t); g.linearRampToValueAtTime(0, t + 0.02);
    g.setValueAtTime(0, t + seconds); g.linearRampToValueAtTime(1, t + seconds + 0.04);
  }
  clearSilence(t: number): void { const g = this.silence.gain; g.cancelScheduledValues(t); g.setValueAtTime(1, t); }
  /** the combat layer enters over a second and cuts to nothing */
  setCombat(on: boolean, t: number): void {
    const g = this.combat.gain;
    g.cancelScheduledValues(t);
    if (on) { g.setValueAtTime(0, t); g.linearRampToValueAtTime(1, t + 1); }
    else { g.setValueAtTime(0, t); }
  }

  private room(k: number): void {
    if (this.rooms[k]) return;
    const conv = this.ac.createConvolver(); this.nodes++;
    conv.normalize = false;
    const ir = irFor(k, this.sr);
    const buf = this.ac.createBuffer(2, ir[0].length, this.sr);
    buf.getChannelData(0).set(ir[0]); buf.getChannelData(1).set(ir[1]);
    conv.buffer = buf;
    (this.zoneIn[k] as GainNode).connect(conv); conv.connect(this.reverbOut);
    this.rooms[k] = conv;
  }

  /** Cross-fades the room that answers (zone/entered). `kind` < 0: no room at all (dry renders). */
  setReverb(kind: number, t: number, fade: number): void {
    if (kind === this.irKind) return;
    this.irKind = kind;
    if (kind >= 0) this.room(kind);
    for (let k = 0; k < IR_COUNT; k++) {
      const g = (this.zoneIn[k] as GainNode).gain, v = k === kind ? IR_WET[k] as number : 0;
      if (fade <= 0) g.setValueAtTime(v, t); else g.setTargetAtTime(v, t, fade / 3);
    }
  }
  setZone(zone: ZoneId | '', t: number, fade: number): void { this.setReverb(zoneIr(zone), t, fade); }

  /**
   * A Karplus-Strong plucked string as a buffer (the wire): a noise burst in a delay line with an averaging loop,
   * computed once per note and cached. The pitch error of the integer delay is returned to the caller as a rate.
   */
  pluck(hz: number): AudioBuffer {
    const n = Math.max(2, Math.round(this.sr / hz - 0.5));
    let buf = this.plucks.get(n);
    if (buf) return buf;
    const len = Math.floor(this.sr * 3.2);
    buf = this.ac.createBuffer(1, len, this.sr);
    const d = buf.getChannelData(0);
    let s = (0x51f15e ^ (n * 2654435761)) >>> 0;
    let lp = 0;
    for (let i = 0; i < n; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; lp += 0.55 * ((s / 2147483648 - 1) - lp); d[i] = lp; }
    const damp = 0.9965;
    for (let i = n; i < len; i++) d[i] = damp * 0.5 * ((d[i - n] as number) + (i > n ? d[i - n - 1] as number : 0));
    // a soft start, so the pick is a touch and not a click
    const a = Math.floor(this.sr * 0.002);
    for (let i = 0; i < a; i++) d[i] = (d[i] as number) * (i / a);
    this.plucks.set(n, buf);
    return buf;
  }
  /** playbackRate that puts pluck(hz) on pitch */
  pluckRate(hz: number): number { const n = Math.max(2, Math.round(this.sr / hz - 0.5)); return hz * (n + 0.5) / this.sr; }

  /** Live only: an analyser on the master (the sandbox scope and peak meter). */
  analyser(): AnalyserNode {
    if (!this.scope) { this.scope = this.ac.createAnalyser(); this.scope.fftSize = 2048; this.master.connect(this.scope); }
    return this.scope;
  }
}
