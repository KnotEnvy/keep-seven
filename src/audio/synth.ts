// Synthesis primitives. Every sound in the game is a handful of these. They create short-lived nodes at a sound's
// start (never per frame) and schedule everything on the context's clock.
import type { Graph } from './graph.ts';

const FLOOR = 0.0001;      // exponential ramps cannot reach 0

/**
 * Filtered noise is quieter the narrower its band (white noise over 24 kHz, RMS 0.58): this factor makes `gain` mean
 * roughly the peak level of what comes out, whatever the filter, so recipes can be balanced by reading them.
 */
function bandGain(type: BiquadFilterType, f0: number, f1: number, q: number): number {
  const f = Math.sqrt(f0 * f1);
  const band = type === 'bandpass' ? f / Math.max(0.3, q) : type === 'lowpass' ? f : 24000;
  const k = 0.58 * Math.sqrt(24000 / Math.max(120, band));
  return k < 1 ? 1 : k > 8 ? 8 : k;
}

/** Noise through a filter that sweeps f0 -> f1, with a fast attack and an exponential decay over `dur`. */
export function noise(g: Graph, out: AudioNode, t: number, dur: number, type: BiquadFilterType, f0: number, f1: number, q: number, gain: number, attack = 0.002): void {
  const src = g.source(g.noise, true), flt = g.filter(type, g.hz(f0), q), amp = g.gain(0);
  gain *= bandGain(type, f0, f1, q);
  if (f1 !== f0) { flt.frequency.setValueAtTime(g.hz(f0), t); flt.frequency.exponentialRampToValueAtTime(g.hz(f1), t + dur); }
  if (attack <= 0) amp.gain.setValueAtTime(gain, t);
  else { amp.gain.setValueAtTime(FLOOR, t); amp.gain.exponentialRampToValueAtTime(gain, t + attack); }
  amp.gain.exponentialRampToValueAtTime(FLOOR, t + dur);
  src.connect(flt); flt.connect(amp); amp.connect(out);
  src.start(t, g.noiseOffset()); src.stop(t + dur + 0.01);
}

/** Noise through a filter with a linear attack, a hold and a linear release: textures (scrapes, hisses, pours). */
export function noiseHold(g: Graph, out: AudioNode, t: number, dur: number, type: BiquadFilterType, f0: number, f1: number, q: number, gain: number, attack: number, release: number): void {
  const src = g.source(g.noise, true), flt = g.filter(type, g.hz(f0), q), amp = g.gain(0);
  gain *= bandGain(type, f0, f1, q);
  if (f1 !== f0) { flt.frequency.setValueAtTime(g.hz(f0), t); flt.frequency.exponentialRampToValueAtTime(g.hz(f1), t + dur); }
  amp.gain.setValueAtTime(0, t); amp.gain.linearRampToValueAtTime(gain, t + attack);
  amp.gain.setValueAtTime(gain, t + Math.max(attack, dur - release)); amp.gain.linearRampToValueAtTime(0, t + dur);
  src.connect(flt); flt.connect(amp); amp.connect(out);
  src.start(t, g.noiseOffset()); src.stop(t + dur + 0.01);
}

/** An oscillator whose pitch goes f0 -> f1 exponentially, with a fast attack and an exponential decay. */
export function tone(g: Graph, out: AudioNode, t: number, dur: number, type: OscillatorType, f0: number, f1: number, gain: number, attack = 0.002): void {
  const osc = g.osc(type, g.hz(f0)), amp = g.gain(0);
  if (f1 !== f0) { osc.frequency.setValueAtTime(g.hz(f0), t); osc.frequency.exponentialRampToValueAtTime(g.hz(f1), t + dur); }
  if (attack <= 0) amp.gain.setValueAtTime(gain, t);
  else { amp.gain.setValueAtTime(FLOOR, t); amp.gain.exponentialRampToValueAtTime(gain, t + attack); }
  amp.gain.exponentialRampToValueAtTime(FLOOR, t + dur);
  osc.connect(amp); amp.connect(out);
  osc.start(t); osc.stop(t + dur + 0.01);
}

/** An oscillator with a linear attack, a hold and a linear release; pitch f0 -> f1 over the whole length. */
export function toneHold(g: Graph, out: AudioNode, t: number, dur: number, type: OscillatorType, f0: number, f1: number, gain: number, attack: number, release: number): OscillatorNode {
  const osc = g.osc(type, g.hz(f0)), amp = g.gain(0);
  if (f1 !== f0) { osc.frequency.setValueAtTime(g.hz(f0), t); osc.frequency.exponentialRampToValueAtTime(g.hz(f1), t + dur); }
  amp.gain.setValueAtTime(0, t); amp.gain.linearRampToValueAtTime(gain, t + attack);
  amp.gain.setValueAtTime(gain, t + Math.max(attack, dur - release)); amp.gain.linearRampToValueAtTime(0, t + dur);
  osc.connect(amp); amp.connect(out);
  osc.start(t); osc.stop(t + dur + 0.01);
  return osc;
}

/** A mechanical click: a few milliseconds of noise through a resonant band, plus a tiny pitched knock. */
export function click(g: Graph, out: AudioNode, t: number, hz: number, q: number, gain: number, dur = 0.014): void {
  noise(g, out, t, dur, 'bandpass', hz, hz * 0.8, q, gain, 0.0005);
  tone(g, out, t, dur * 1.6, 'triangle', hz * 0.42, hz * 0.3, gain * 0.5, 0.0005);
}

/**
 * THE bell voice (GDD 17): two detuned sines plus an inharmonic partial at x2.76, fast attack, exponential decay, a
 * noise click on the front. `bend` < 1 lets the pitch fall to hz * bend over `bendSeconds`; `lowpass` > 0 dulls it (clay).
 */
export function bell(g: Graph, out: AudioNode, t: number, hz: number, decay: number, gain: number, bend = 1, bendSeconds = 0, lowpass = 0, detune = 0.0018): void {
  let dest: AudioNode = out;
  if (lowpass > 0) { const lp = g.filter('lowpass', g.hz(lowpass), 0.7); lp.connect(out); dest = lp; }
  const amp = g.gain(0);
  // `decay` is the time to -60 dB (0.25 s for clay, 1.2 s for a latch, 1.8 s for the lens)
  amp.gain.setValueAtTime(FLOOR, t); amp.gain.exponentialRampToValueAtTime(gain, t + 0.003);
  amp.gain.exponentialRampToValueAtTime(gain * 0.001, t + decay); amp.gain.linearRampToValueAtTime(0, t + decay + 0.01);
  amp.connect(dest);
  for (let k = 0; k < 3; k++) {
    const f = k === 0 ? hz * (1 - detune) : k === 1 ? hz * (1 + detune) : hz * 2.76;
    const osc = g.osc('sine', g.hz(f));
    if (bend !== 1) { osc.frequency.setValueAtTime(g.hz(f), t); osc.frequency.exponentialRampToValueAtTime(g.hz(f * bend), t + bendSeconds); }
    if (k < 2) osc.connect(amp);
    else {
      // the inharmonic partial dies first: the strike is metal, the ring is a note
      const pa = g.gain(0);
      pa.gain.setValueAtTime(0.42, t); pa.gain.exponentialRampToValueAtTime(FLOOR, t + decay * 0.45);
      osc.connect(pa); pa.connect(amp);
    }
    osc.start(t); osc.stop(t + decay + 0.03);
  }
  noise(g, dest, t, 0.012, 'bandpass', Math.min(6000, hz * 5), Math.min(6000, hz * 5), 1.2, gain * 0.5, 0.0005);
}

/** The wire: a plucked string. */
export function pluck(g: Graph, out: AudioNode, t: number, hz: number, seconds: number, gain: number): void {
  const src = g.source(g.pluck(hz), false), amp = g.gain(gain);
  src.playbackRate.value = g.pluckRate(hz);
  amp.gain.setValueAtTime(gain, t); amp.gain.setValueAtTime(gain, t + seconds * 0.6); amp.gain.linearRampToValueAtTime(0, t + seconds);
  src.connect(amp); amp.connect(out);
  src.start(t); src.stop(t + seconds + 0.01);
}

/** A feedback comb: what the Windlass's ratchet clicks ring through. Returns the node to feed. */
export function comb(g: Graph, out: AudioNode, hz: number, feedback: number): AudioNode {
  const input = g.gain(1), d = g.delay(0.05, 1 / hz), fb = g.gain(feedback);
  input.connect(out); input.connect(d); d.connect(fb); fb.connect(d); d.connect(out);
  return input;
}

/**
 * `n` noise ticks from ONE source (a rattle, a ratchet, debris): tick i at t + dur * (i / n) ^ curve, so curve < 1
 * speeds up and curve > 1 runs down ("click, click, slower, click, stop"). Each tick falls from `gain * (1 - fade * i / n)`.
 */
export function ticks(g: Graph, out: AudioNode, t: number, n: number, dur: number, curve: number, type: BiquadFilterType, hz: number, q: number, gain: number, len: number, fade = 0): void {
  const src = g.source(g.noise, true), flt = g.filter(type, g.hz(hz), q), amp = g.gain(0);
  gain *= bandGain(type, hz, hz, q);
  amp.gain.setValueAtTime(0, t);
  for (let i = 0; i < n; i++) {
    const at = t + dur * Math.pow(i / n, curve);
    amp.gain.setValueAtTime(gain * (1 - fade * i / n), at);
    amp.gain.exponentialRampToValueAtTime(FLOOR, at + len);
  }
  src.connect(flt); flt.connect(amp); amp.connect(out);
  src.start(t, g.noiseOffset()); src.stop(t + dur + len + 0.02);
}

/** An oscillator through a filter whose level is wobbled by a second oscillator: whirrs, creaks, buzzes. */
export function wobble(g: Graph, out: AudioNode, t: number, dur: number, type: OscillatorType, f0: number, f1: number, lfoHz: number, depth: number, filterType: BiquadFilterType, filterHz: number, q: number, gain: number, attack: number, release: number): void {
  const osc = g.osc(type, g.hz(f0)), lfo = g.osc('sine', lfoHz), lfoAmp = g.gain(gain * depth), flt = g.filter(filterType, g.hz(filterHz), q), amp = g.gain(0), env = g.gain(0);
  if (f1 !== f0) { osc.frequency.setValueAtTime(g.hz(f0), t); osc.frequency.exponentialRampToValueAtTime(g.hz(f1), t + dur); }
  amp.gain.value = gain * (1 - depth);
  lfo.connect(lfoAmp); lfoAmp.connect(amp.gain);
  env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(1, t + attack);
  env.gain.setValueAtTime(1, t + Math.max(attack, dur - release)); env.gain.linearRampToValueAtTime(0, t + dur);
  osc.connect(flt); flt.connect(amp); amp.connect(env); env.connect(out);
  osc.start(t); lfo.start(t); osc.stop(t + dur + 0.01); lfo.stop(t + dur + 0.01);
}
