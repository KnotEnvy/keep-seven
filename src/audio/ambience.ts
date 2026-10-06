// Ambience (GDD 17 "Ambience per zone"): the world must have air in it. Beds are persistent nodes built once and
// cross-faded by zone; their slow movement (gusts, beating, the bore's breath) is done by oscillators in the graph,
// so nothing runs per frame. Sparse events are scheduled from the tick with a seeded stream.
import type { Rng, ZoneId } from '../core/contracts.ts';
import { BUS_AMB, BUS_MUSIC } from './graph.ts';
import type { Graph } from './graph.ts';
import { A2, D2, D3, FLAT, WIRE_OFF } from './tuning.ts';

export const HUM_FLAT = 0, HUM_OFF = 1, HUM_TUNED = 2;
export const HUM_NAMES: readonly string[] = ['flat', 'off', 'tuned'];
/** the two halves of each beating pair sit this far either side of the note, in Hz: slow beating, centre on pitch */
const BEAT_D = 0.14, BEAT_A = 0.1;
export const ZONES: readonly ZoneId[] = ['the_lip', 'plenty_street', 'tally_house', 'the_gallery', 'lift_hall', 'the_bore', 'far_rim'];

interface ZoneBed {
  wind: number; windHz: number; gust: number;
  hum: number; wide: number; air: number; breath: number; lantern: number; breaths: number; drone: number;
}
// outdoors the wind carries the air and the drone sits under it (wind +3 dB, drone -6 dB after the critic's bed
// measurement: the drone was 4 dB over the wind on the lip)
const BEDS: Record<ZoneId, ZoneBed> = {
  the_lip: { wind: 0.71, windHz: 620, gust: 1, hum: 0, wide: 0, air: 0, breath: 0, lantern: 0, breaths: 0, drone: 0.25 },
  plenty_street: { wind: 0.6, windHz: 520, gust: 1, hum: 0, wide: 0, air: 0, breath: 0, lantern: 0, breaths: 0, drone: 0.25 },
  // near silence: the wind is on the other side of an adobe wall
  tally_house: { wind: 0.05, windHz: 240, gust: 0.6, hum: 0, wide: 0, air: 0.2, breath: 0, lantern: 0.5, breaths: 1, drone: 0.2 },
  the_gallery: { wind: 0, windHz: 300, gust: 0, hum: 0.4, wide: 0, air: 0.3, breath: 0, lantern: 0, breaths: 0, drone: 0 },
  lift_hall: { wind: 0, windHz: 300, gust: 0, hum: 0.5, wide: 1, air: 0.4, breath: 0, lantern: 0, breaths: 0, drone: 0 },
  the_bore: { wind: 0, windHz: 300, gust: 0, hum: 0.62, wide: 0.5, air: 0.4, breath: 1, lantern: 0, breaths: 0, drone: 0 },
  // cold wind, lower and steadier; no machine
  far_rim: { wind: 0.85, windHz: 330, gust: 0.35, hum: 0, wide: 0, air: 0, breath: 0, lantern: 0, breaths: 0, drone: 0.22 },
};

export interface AmbEvent { zone: ZoneId; sound: string; min: number; max: number; gain: number; jitter: number; flag: number }
/** flag 1: only before the proof (the bore's machine noises); flag 2: only after `ending/fire` */
export const AMB_EVENTS: readonly AmbEvent[] = [
  { zone: 'the_lip', sound: 'amb_pebble', min: 5, max: 14, gain: 1, jitter: 0.2, flag: 0 },
  { zone: 'the_lip', sound: 'sweep_creak', min: 14, max: 30, gain: 0.3, jitter: 0.1, flag: 0 },
  { zone: 'the_lip', sound: 'amb_wire', min: 18, max: 40, gain: 1, jitter: 0.02, flag: 0 },
  { zone: 'plenty_street', sound: 'pump_clatter', min: 7, max: 11, gain: 0.32, jitter: 0.04, flag: 0 },
  { zone: 'plenty_street', sound: 'amb_tin', min: 6, max: 15, gain: 1, jitter: 0.1, flag: 0 },
  { zone: 'plenty_street', sound: 'amb_shutter', min: 8, max: 20, gain: 1, jitter: 0.1, flag: 0 },
  { zone: 'plenty_street', sound: 'amb_cloth', min: 9, max: 22, gain: 1, jitter: 0, flag: 0 },
  { zone: 'tally_house', sound: 'amb_wood', min: 4, max: 11, gain: 1, jitter: 0.25, flag: 0 },
  { zone: 'tally_house', sound: 'amb_dust', min: 12, max: 25, gain: 1, jitter: 0, flag: 0 },
  { zone: 'the_gallery', sound: 'amb_relay', min: 3, max: 8, gain: 1, jitter: 0.1, flag: 0 },
  { zone: 'the_gallery', sound: 'amb_drip', min: 5, max: 9, gain: 1, jitter: 0.02, flag: 0 },
  { zone: 'the_gallery', sound: 'amb_buzz', min: 9, max: 20, gain: 1, jitter: 0, flag: 0 },
  { zone: 'the_gallery', sound: 'amb_coats', min: 14, max: 30, gain: 1, jitter: 0, flag: 0 },
  { zone: 'lift_hall', sound: 'amb_relay', min: 5, max: 12, gain: 1, jitter: 0.1, flag: 0 },
  { zone: 'lift_hall', sound: 'amb_drip', min: 7, max: 15, gain: 1, jitter: 0.02, flag: 0 },
  { zone: 'the_bore', sound: 'amb_relay', min: 6, max: 14, gain: 1, jitter: 0.1, flag: 1 },
  { zone: 'far_rim', sound: 'amb_wire', min: 14, max: 30, gain: 1, jitter: 0.02, flag: 0 },
  { zone: 'far_rim', sound: 'amb_crackle', min: 0.7, max: 1.8, gain: 1, jitter: 0, flag: 2 },
];

/**
 * Eleven slow breaths, out of phase, as one 30 s loop at 11 kHz: low-passed noise under the sum of eleven
 * breathing envelopes whose periods all divide the loop, so it never clicks at the seam.
 */
let breaths: { data: Float32Array; rate: number } | null = null;
export function makeBreaths(): { data: Float32Array; rate: number } {
  if (breaths) return breaths;
  const rate = 11025, seconds = 30, n = rate * seconds;
  const data = new Float32Array(n);
  let s = 0x0b1d3e5, lp = 0;
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    lp += 0.32 * ((s / 2147483648 - 1) - lp);
    const t = i / rate;
    let env = 0;
    for (let b = 0; b < 11; b++) {
      const cycles = 5 + (b % 3), v = Math.sin(2 * Math.PI * (cycles * t / seconds + b * 0.277));
      if (v > 0) env += v * v * (0.6 + 0.04 * b);
    }
    data[i] = lp * env * 0.12;
  }
  breaths = { data, rate };
  return breaths;
}

export class Ambience {
  zone: ZoneId | '' = '';
  hum = HUM_FLAT;
  water = false;
  fire = false;
  private g: Graph | null = null;
  // bed levels (AudioParams, driven with timed automation only)
  private wind: GainNode | null = null;
  private windBand: BiquadFilterNode | null = null;
  private windLp: BiquadFilterNode | null = null;
  private gustDepth: GainNode | null = null;
  private humGain: GainNode | null = null;
  private wideGain: GainNode | null = null;
  private airGain: GainNode | null = null;
  private breathGain: GainNode | null = null;
  private lanternGain: GainNode | null = null;
  private breathsGain: GainNode | null = null;
  private waterGain: GainNode | null = null;
  private droneGain: GainNode | null = null;
  private readonly humOsc: OscillatorNode[] = [];
  private readonly humBase: number[] = [];
  private readonly humBeat: number[] = [];
  /** own-tick time of each event's next start */
  private readonly next = new Int32Array(AMB_EVENTS.length);

  /** Builds the beds on a graph. Everything starts silent; setZone() brings a zone's mix up. */
  attach(g: Graph): void {
    this.g = g;
    const out = g.busIn[BUS_AMB] as GainNode;
    const src = g.source(g.noise, true);
    src.start(0);

    // wind: band-passed noise whose level two slow oscillators push around (gusts), and a thin whistle above it
    this.windBand = g.filter('bandpass', 600, 0.8);
    this.windLp = g.filter('lowpass', 9000, 0.5);
    const gust = g.gain(0.62);
    this.gustDepth = g.gain(1);
    const l1 = g.osc('sine', 0.093), l2 = g.osc('sine', 0.037), d1 = g.gain(0.22), d2 = g.gain(0.16);
    l1.connect(d1); l2.connect(d2); d1.connect(this.gustDepth); d2.connect(this.gustDepth); this.gustDepth.connect(gust.gain);
    l1.start(0); l2.start(0);
    this.wind = g.gain(0);
    src.connect(this.windBand); this.windBand.connect(this.windLp); this.windLp.connect(gust); gust.connect(this.wind); this.wind.connect(out);
    const whistle = g.filter('bandpass', 2300, 7), whistleGain = g.gain(0), wd = g.gain(0.05), l3 = g.osc('sine', 0.061);
    l3.connect(wd); wd.connect(whistleGain.gain); l3.start(0);
    src.connect(whistle); whistle.connect(whistleGain); whistleGain.connect(this.windLp);

    // the station hum: D2 and A2 as beating pairs of sines, a filtered saw under each so small speakers carry it
    this.humGain = g.gain(0);
    this.wideGain = g.gain(0);
    const left = g.panner(-0.4), right = g.panner(0.4), farL = g.panner(-0.9), farR = g.panner(0.9);
    left.connect(this.humGain); right.connect(this.humGain); farL.connect(this.wideGain); farR.connect(this.wideGain);
    this.wideGain.connect(this.humGain); this.humGain.connect(out);
    const body = g.filter('lowpass', 340, 0.7), bodyGain = g.gain(0.16);
    body.connect(bodyGain); bodyGain.connect(this.humGain);
    const add = (type: OscillatorType, base: number, beat: number, level: number, to: AudioNode): void => {
      const o = g.osc(type, base * FLAT + beat), a = g.gain(level);
      o.connect(a); a.connect(to); o.start(0);
      this.humOsc.push(o); this.humBase.push(base); this.humBeat.push(beat);
    };
    add('sine', D2, -BEAT_D, 0.2, left); add('sine', D2, BEAT_D, 0.2, right);
    add('sine', A2, BEAT_A, 0.13, left); add('sine', A2, -BEAT_A, 0.13, right);
    add('sawtooth', D2, 0, 0.5, body); add('sawtooth', A2, 0, 0.3, body);
    add('sine', D3, -0.31, 0.07, farL); add('sine', D3, 0.31, 0.07, farR);       // the hall: wider

    // air: the room tone of every interior
    const airLp = g.filter('lowpass', 420, 0.5);
    this.airGain = g.gain(0);
    src.connect(airLp); airLp.connect(this.airGain); this.airGain.connect(out);

    // the bore's slow breath: a filtered noise swell every 5 s (a 0.1 Hz sine through a gain reads as |sin|)
    const breathBand = g.filter('bandpass', 280, 1.3), breathMod = g.gain(0), bl = g.osc('sine', 0.1);
    this.breathGain = g.gain(0);
    bl.connect(breathMod.gain); bl.start(0);
    src.connect(breathBand); breathBand.connect(breathMod); breathMod.connect(this.breathGain); this.breathGain.connect(out);

    // the lantern's flutter
    const lanLp = g.filter('lowpass', 230, 0.7), lanMod = g.gain(0.5), f1 = g.osc('sine', 9.1), f2 = g.osc('sine', 13.7), fa = g.gain(0.3), fb = g.gain(0.2);
    this.lanternGain = g.gain(0);
    f1.connect(fa); f2.connect(fb); fa.connect(lanMod.gain); fb.connect(lanMod.gain); f1.start(0); f2.start(0);
    src.connect(lanLp); lanLp.connect(lanMod); lanMod.connect(this.lanternGain); this.lanternGain.connect(out);

    // eleven breaths
    const br = makeBreaths();
    const buf = g.ac.createBuffer(1, br.data.length, br.rate);
    buf.getChannelData(0).set(br.data);
    const loop = g.source(buf, true);
    this.breathsGain = g.gain(0);
    loop.connect(this.breathsGain); this.breathsGain.connect(out); loop.start(0);

    // water far below (after the proof)
    const waterBand = g.filter('bandpass', 1300, 1.4), wl = g.osc('sine', 2.3), wdev = g.gain(320), waterLp = g.filter('lowpass', 2600, 0.5);
    this.waterGain = g.gain(0);
    wl.connect(wdev); wdev.connect(waterBand.frequency); wl.start(0);
    src.connect(waterBand); waterBand.connect(waterLp); waterLp.connect(this.waterGain); this.waterGain.connect(out);

    // the calm drone (music bus): D and A, never quite on pitch, breathing through a slow filter
    const droneLp = g.filter('lowpass', 250, 0.8), dl = g.osc('sine', 0.05), ddev = g.gain(70);
    this.droneGain = g.gain(0);
    dl.connect(ddev); ddev.connect(droneLp.frequency); dl.start(0);
    const dn = (hz: number, level: number): void => { const o = g.osc('sawtooth', hz), a = g.gain(level); o.connect(a); a.connect(droneLp); o.start(0); };
    dn(D2 * WIRE_OFF * 0.9985, 0.2); dn(D2 * WIRE_OFF * 1.0015, 0.2); dn(A2 * WIRE_OFF, 0.14); dn(D3 * WIRE_OFF * 1.001, 0.07);
    droneLp.connect(this.droneGain); this.droneGain.connect(g.busIn[BUS_MUSIC] as GainNode);
  }

  private bed(): ZoneBed | null { return this.zone === '' ? null : BEDS[this.zone]; }

  /** Push every bed toward the mix of the current zone and state (time constant = fade / 3). */
  apply(t: number, fade: number): void {
    const g = this.g, b = this.bed();
    if (!g || !b) return;
    const tc = Math.max(0.01, fade / 3);
    const proven = this.hum !== HUM_FLAT;
    (this.wind as GainNode).gain.setTargetAtTime(b.wind, t, tc);
    (this.windBand as BiquadFilterNode).frequency.setTargetAtTime(b.windHz, t, tc);
    (this.gustDepth as GainNode).gain.setTargetAtTime(b.gust, t, tc);
    (this.humGain as GainNode).gain.setTargetAtTime(this.hum === HUM_OFF ? 0 : b.hum, t, this.hum === HUM_OFF ? 0.012 : tc);
    (this.wideGain as GainNode).gain.setTargetAtTime(b.wide, t, tc);
    (this.airGain as GainNode).gain.setTargetAtTime(b.air, t, tc);
    // the violet breath dies with the proof
    (this.breathGain as GainNode).gain.setTargetAtTime(proven ? 0 : b.breath, t, tc);
    (this.lanternGain as GainNode).gain.setTargetAtTime(b.lantern, t, tc);
    (this.breathsGain as GainNode).gain.setTargetAtTime(b.breaths, t, tc);
    (this.waterGain as GainNode).gain.setTargetAtTime(this.water && this.zone === 'the_bore' ? 0.35 : 0, t, tc);
    (this.droneGain as GainNode).gain.setTargetAtTime(b.drone, t, tc);
  }

  setZone(zone: ZoneId | '', now: number, rng: Rng, ownTick: number): void {
    if (zone === this.zone) return;
    this.zone = zone;
    for (let i = 0; i < AMB_EVENTS.length; i++) {
      const e = AMB_EVENTS[i] as AmbEvent;
      if (e.zone === zone) this.next[i] = ownTick + Math.round(rng.range(e.min * 0.4, e.max) * 60);
    }
    this.apply(now, 1.5);
  }

  /** flat (the machine as it is), off (the proof), tuned (the machine as it was meant to be: D2 and A2 exact, no beating) */
  setHum(mode: number, now: number, fade: number): void {
    this.hum = mode;
    if (this.g && mode !== HUM_OFF) {
      for (let i = 0; i < this.humOsc.length; i++) {
        const f = mode === HUM_TUNED ? this.humBase[i] as number : (this.humBase[i] as number) * FLAT + (this.humBeat[i] as number);
        (this.humOsc[i] as OscillatorNode).frequency.setValueAtTime(f, now);
      }
    }
    this.apply(now, fade);
  }
  setWater(on: boolean, now: number): void { this.water = on; this.apply(now, 3); }

  /** The first seconds of a run: under the overhang the wind is low-passed and close, then she walks out into it. */
  overhang(now: number): void {
    const f = this.windLp;
    if (!f) return;
    f.frequency.cancelScheduledValues(now);
    f.frequency.setValueAtTime(340, now); f.frequency.setValueAtTime(340, now + 2.5); f.frequency.exponentialRampToValueAtTime(9000, now + 9);
  }

  /** Which event (index into AMB_EVENTS) is due at this own-tick, or -1. Re-arms the one it returns. */
  due(ownTick: number, rng: Rng): number {
    for (let i = 0; i < AMB_EVENTS.length; i++) {
      const e = AMB_EVENTS[i] as AmbEvent;
      if (e.zone !== this.zone || ownTick < (this.next[i] as number)) continue;
      this.next[i] = ownTick + Math.round(rng.range(e.min, e.max) * 60);
      if (e.flag === 1 && this.hum !== HUM_FLAT) continue;
      if (e.flag === 2 && !this.fire) continue;
      return i;
    }
    return -1;
  }
}
