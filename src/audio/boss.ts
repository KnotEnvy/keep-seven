// The Windlass (GDD 8, 17): a five-metre cylinder. Its ratchet is the percussion; its dry click is the player's own.
import { BUS_FX } from './graph.ts';
import { PRIO_CONFIRM, PRIO_OTHER, PRIO_TELEGRAPH, snd } from './sound.ts';
import type { SoundTable } from './sound.ts';
import { click, comb, noise, noiseHold, ticks, tone, toneHold } from './synth.ts';
import { FLAT, degree } from './tuning.ts';

/** clicks per second of the index run */
const RATCHET_RATE = 9;
const BOSS_RANGE = 60;

export function bossSounds(): SoundTable {
  return {
    // noise clicks through a comb filter, as long as the index run (seconds; 0 = one short pull)
    ratchet: snd(BUS_FX, PRIO_TELEGRAPH, 0.3, 0.45, (g, out, t, p) => {
      const d = p.seconds > 0 ? Math.min(8, p.seconds) : 0.7;
      const ring = comb(g, out, 196, 0.78);
      ticks(g, ring, t, Math.max(2, Math.round(d * RATCHET_RATE)), d, 1, 'bandpass', 1300, 1.5, 0.5, 0.02);
    }, BOSS_RANGE, 0.7),
    // a short filtered sweep: a = 1 when the mouth shuts
    mouth_iris: snd(BUS_FX, PRIO_OTHER, 0.3, 0.4, (g, out, t, p) => {
      const shut = p.a > 0;
      noiseHold(g, out, t, 0.22, 'bandpass', shut ? 2400 : 600, shut ? 600 : 2400, 5, 0.34, 0.03, 0.06);
      click(g, out, t + 0.2, shut ? 520 : 880, 3, 0.24, 0.02);
    }, BOSS_RANGE),
    // the chamber heating: rises over the glow (seconds; 0.9 s by default), in the machine's flat tuning
    glow_tone: snd(BUS_FX, PRIO_TELEGRAPH, 0.03, 0.4, (g, out, t, p) => {
      const d = p.seconds > 0 ? p.seconds : 0.9, f0 = degree(1, 3) * FLAT, f1 = degree(5, 4) * FLAT;
      const osc = g.osc('sawtooth', f0), sine = g.osc('sine', f0 * 2), lp = g.filter('lowpass', 500, 3), amp = g.gain(0);
      osc.frequency.setValueAtTime(f0, t); osc.frequency.exponentialRampToValueAtTime(f1, t + d);
      sine.frequency.setValueAtTime(f0 * 2, t); sine.frequency.exponentialRampToValueAtTime(f1 * 2, t + d);
      lp.frequency.setValueAtTime(500, t); lp.frequency.exponentialRampToValueAtTime(3200, t + d);
      amp.gain.setValueAtTime(0, t); amp.gain.linearRampToValueAtTime(0.1, t + 0.05); amp.gain.linearRampToValueAtTime(0.34, t + d - 0.02); amp.gain.linearRampToValueAtTime(0, t + d);
      osc.connect(lp); sine.connect(lp); lp.connect(amp); amp.connect(out);
      osc.start(t); sine.start(t); osc.stop(t + d + 0.01); sine.stop(t + d + 0.01);
    }, BOSS_RANGE, 0.9),
    canister_thump: snd(BUS_FX, PRIO_TELEGRAPH, 0.22, 0.4, (g, out, t) => { tone(g, out, t, 0.18, 'sine', 135, 55, 0.9, 0.002); noise(g, out, t, 0.1, 'lowpass', 700, 200, 0.8, 0.5, 0.002); }, BOSS_RANGE),
    canister_fizz: snd(BUS_FX, PRIO_CONFIRM, 0.6, 0.4, (g, out, t) => {
      noise(g, out, t, 0.08, 'lowpass', 1400, 300, 1, 0.6, 0.001);
      ticks(g, out, t + 0.03, 16, 0.5, 1.5, 'highpass', 3000, 0.8, 0.3, 0.02, 0.8);
    }, 30),
    // the lance's two-tone tell: A, then D above, both flat
    lance_tone: snd(BUS_FX, PRIO_TELEGRAPH, 0.7, 0.4, (g, out, t) => {
      toneHold(g, out, t, 0.24, 'triangle', degree(5, 4) * FLAT, degree(5, 4) * FLAT, 0.36, 0.01, 0.03);
      toneHold(g, out, t + 0.25, 0.44, 'triangle', degree(8, 4) * FLAT, degree(8, 4) * FLAT, 0.4, 0.01, 0.12);
    }, BOSS_RANGE),
    // the haul: a long rising whine with the lamps' ticks (six, one per relit lamp)
    haul_whine: snd(BUS_FX, PRIO_OTHER, 0.1, 0.45, (g, out, t, p) => {
      const d = p.seconds > 0 ? Math.min(8, p.seconds) : 3.5;
      toneHold(g, out, t, d, 'sawtooth', degree(1, 2) * FLAT * 1.5, degree(1, 3) * FLAT * 1.5, 0.07, 0.4, 0.3);
      toneHold(g, out, t, d, 'sine', degree(1, 3) * FLAT * 1.5, degree(1, 4) * FLAT * 1.5, 0.14, 0.4, 0.3);
      ticks(g, out, t + d / 12, 6, d, 1, 'bandpass', 2600, 6, 0.26, 0.02);
    }, BOSS_RANGE, 3.5),
    // a chamber relighting from the bore: pitched noise rising
    refill_gurgle: snd(BUS_FX, PRIO_OTHER, 0.7, 0.45, (g, out, t) => {
      noiseHold(g, out, t, 0.65, 'bandpass', 190, 950, 9, 0.6, 0.08, 0.2);
      ticks(g, out, t, 7, 0.6, 0.8, 'bandpass', 520, 5, 0.3, 0.04);
    }, BOSS_RANGE),
    // the dry click: the player's own dry fire, an octave down, enormous
    dry_click_big: snd(BUS_FX, PRIO_TELEGRAPH, 0.2, 0.9, (g, out, t) => {
      click(g, out, t, 675, 4, 1.0, 0.028);
      tone(g, out, t, 0.1, 'triangle', 115, 75, 0.8, 0.001);
      noise(g, out, t, 0.09, 'lowpass', 400, 120, 0.8, 0.4, 0.001);
    }, 90),
    // run-down: exactly like a spent cylinder: click, click, slower, click, stop
    run_down: snd(BUS_FX, PRIO_CONFIRM, 2.6, 0.5, (g, out, t) => {
      const ring = comb(g, out, 196, 0.8);
      ticks(g, ring, t, 6, 2.3, 1.9, 'bandpass', 1300, 1.5, 0.55, 0.024, 0.5);
      toneHold(g, out, t, 2.5, 'sine', 92, 34, 0.24, 0.05, 1.6);
    }, 90),
    guard_slide: snd(BUS_FX, PRIO_OTHER, 1.0, 0.4, (g, out, t) => { noiseHold(g, out, t, 0.9, 'bandpass', 700, 1100, 3, 0.26, 0.1, 0.1); click(g, out, t + 0.9, 420, 2, 0.5, 0.03); }, BOSS_RANGE),
    guard_shatter: snd(BUS_FX, PRIO_CONFIRM, 0.8, 0.5, (g, out, t) => {
      noise(g, out, t, 0.5, 'highpass', 3600, 1800, 0.7, 0.55, 0.0006);
      tone(g, out, t, 0.14, 'sine', 120, 55, 0.6, 0.002);
      ticks(g, out, t + 0.05, 12, 0.6, 1.4, 'bandpass', 4200, 6, 0.3, 0.03, 0.7);
    }, BOSS_RANGE),
  };
}
