// The three enemies (GDD 7, the "Audio" line of each; 17 "Key SFX"). Every tell is a sound before it is a threat.
import { BUS_FX } from './graph.ts';
import { PRIO_CONFIRM, PRIO_OTHER, PRIO_TELEGRAPH, snd } from './sound.ts';
import type { SoundTable } from './sound.ts';
import { bell, click, noise, noiseHold, ticks, tone, toneHold, wobble } from './synth.ts';
import { degree } from './tuning.ts';

/** the Transit's aim tone: a rising sine sweep 400 -> 1600 Hz over the telegraph (0.9 s) */
export const TRANSIT_TONE_LO = 400, TRANSIT_TONE_HI = 1600;
/** the Tamper's charge howl: a saw sweep 300 -> 80 Hz */
export const HOWL_HI = 300, HOWL_LO = 80;

export function creatureSounds(): SoundTable {
  return {
    // ---- Bider: wind in a sack
    bider_rattle: snd(BUS_FX, PRIO_TELEGRAPH, 0.55, 0.3, (g, out, t, p) => {
      ticks(g, out, t, 13, 0.46, 0.72, 'bandpass', 1700 * p.pitch, 2.5, 0.6, 0.024);
      noiseHold(g, out, t, 0.5, 'bandpass', 420 * p.pitch, 760, 1.4, 0.22, 0.3, 0.1);
    }, 22),
    bider_bark: snd(BUS_FX, PRIO_TELEGRAPH, 0.16, 0.3, (g, out, t, p) => {
      noise(g, out, t, 0.13, 'bandpass', 640 * p.pitch, 420, 3, 0.5, 0.004);
      tone(g, out, t, 0.1, 'sawtooth', 176 * p.pitch, 118, 0.12, 0.004);
    }, 22),
    bider_lunge: snd(BUS_FX, PRIO_TELEGRAPH, 0.3, 0.25, (g, out, t) => { noiseHold(g, out, t, 0.3, 'bandpass', 480, 1500, 1, 0.3, 0.12, 0.12); }, 18),
    // cloth and boot: two soft footfalls and the sack moving
    bider_run: snd(BUS_FX, PRIO_OTHER, 0.3, 0.25, (g, out, t, p) => {
      noise(g, out, t, 0.06, 'lowpass', 330 * p.pitch, 140, 0.7, 0.4, 0.004);
      noise(g, out, t + 0.17, 0.06, 'lowpass', 290 * p.pitch, 130, 0.7, 0.34, 0.004);
      noiseHold(g, out, t + 0.04, 0.2, 'bandpass', 2300, 1700, 0.8, 0.045, 0.06, 0.1);
    }, 12),
    bider_breath: snd(BUS_FX, PRIO_CONFIRM, 1.0, 0.3, (g, out, t) => { noiseHold(g, out, t, 1.0, 'bandpass', 820, 420, 1, 0.16, 0.32, 0.55); }, 16),
    bider_fold: snd(BUS_FX, PRIO_OTHER, 0.4, 0.25, (g, out, t) => {
      noise(g, out, t, 0.26, 'lowpass', 420, 140, 0.7, 0.36, 0.01);
      noiseHold(g, out, t + 0.05, 0.3, 'bandpass', 1900, 1200, 0.8, 0.05, 0.08, 0.18);
    }, 16),

    // ---- Transit: fired ceramic on three legs
    transit_clack: snd(BUS_FX, PRIO_OTHER, 0.42, 0.35, (g, out, t, p) => {
      for (let k = 0; k < 3; k++) {
        const at = t + k * 0.13, f = (k === 0 ? 1900 : k === 1 ? 2350 : 1620) * p.pitch;
        noise(g, out, at, 0.014, 'bandpass', f, f, 5, 0.4, 0.0005);
        tone(g, out, at, 0.06, 'sine', f * 0.5, f * 0.49, 0.2, 0.0008);
      }
    }, 26),
    // seconds = the telegraph (0.9 s x difficulty). It ends where the stake leaves.
    transit_tone: snd(BUS_FX, PRIO_TELEGRAPH, 0.02, 0.3, (g, out, t, p) => {
      const d = p.seconds > 0 ? p.seconds : 0.9;
      const osc = g.osc('sine', TRANSIT_TONE_LO), amp = g.gain(0);
      osc.frequency.setValueAtTime(TRANSIT_TONE_LO, t); osc.frequency.exponentialRampToValueAtTime(TRANSIT_TONE_HI, t + d);
      amp.gain.setValueAtTime(0, t); amp.gain.linearRampToValueAtTime(0.21, t + 0.03);
      amp.gain.linearRampToValueAtTime(0.53, t + d - 0.015); amp.gain.linearRampToValueAtTime(0, t + d);
      osc.connect(amp); amp.connect(out); osc.start(t); osc.stop(t + d + 0.01);
    }, 34, 0.9),
    stake_whirr: snd(BUS_FX, PRIO_TELEGRAPH, 0.5, 0.3, (g, out, t) => {
      wobble(g, out, t, 0.5, 'sawtooth', 230, 340, 41, 0.45, 'bandpass', 1300, 2, 0.8, 0.01, 0.3);
      noise(g, out, t, 0.03, 'bandpass', 2400, 1500, 2, 0.3, 0.0005);
    }, 26),
    stake_stick: snd(BUS_FX, PRIO_OTHER, 0.1, 0.3, (g, out, t) => { tone(g, out, t, 0.07, 'triangle', 270, 135, 0.45, 0.001); click(g, out, t, 1900, 4, 0.2, 0.012); }, 20),

    // ---- Tamper: a boiler on two feet
    tamper_stamp: snd(BUS_FX, PRIO_OTHER, 0.45, 0.4, (g, out, t) => {
      for (let k = 0; k < 2; k++) {
        const at = t + k * 0.28;
        tone(g, out, at, 0.14, 'sine', 72, 38, 0.8, 0.003);
        noise(g, out, at, 0.06, 'bandpass', 900, 600, 4, 0.2, 0.001);
      }
    }, 30),
    // seconds = the slam wind-up (1.0 s)
    tamper_hiss: snd(BUS_FX, PRIO_TELEGRAPH, 0.03, 0.3, (g, out, t, p) => {
      const d = p.seconds > 0 ? p.seconds : 1.0;
      const src = g.source(g.noise, true), hp = g.filter('highpass', 1500, 0.8), amp = g.gain(0);
      hp.frequency.setValueAtTime(1500, t); hp.frequency.exponentialRampToValueAtTime(5200, t + d);
      amp.gain.setValueAtTime(0.03, t); amp.gain.exponentialRampToValueAtTime(0.5, t + d - 0.03); amp.gain.linearRampToValueAtTime(0, t + d);
      src.connect(hp); hp.connect(amp); amp.connect(out); src.start(t, g.noiseOffset()); src.stop(t + d + 0.01);
    }, 30, 1.0),
    // seconds = the charge wind-up (0.8 s): a falling howl
    tamper_howl: snd(BUS_FX, PRIO_TELEGRAPH, 0.03, 0.4, (g, out, t, p) => {
      const d = p.seconds > 0 ? p.seconds : 0.8;
      const osc = g.osc('sawtooth', HOWL_HI), lp = g.filter('lowpass', 1500, 2), amp = g.gain(0);
      osc.frequency.setValueAtTime(HOWL_HI, t); osc.frequency.exponentialRampToValueAtTime(HOWL_LO, t + d);
      lp.frequency.setValueAtTime(1800, t); lp.frequency.exponentialRampToValueAtTime(500, t + d);
      amp.gain.setValueAtTime(0, t); amp.gain.linearRampToValueAtTime(0.6, t + 0.05); amp.gain.setValueAtTime(0.6, t + d - 0.08); amp.gain.linearRampToValueAtTime(0, t + d);
      osc.connect(lp); lp.connect(amp); amp.connect(out); osc.start(t); osc.stop(t + d + 0.01);
    }, 38, 0.8),
    tamper_slam: snd(BUS_FX, PRIO_TELEGRAPH, 0.8, 0.5, (g, out, t) => {
      tone(g, out, t, 0.5, 'sine', 62, 27, 1.0, 0.003);
      noise(g, out, t, 0.5, 'lowpass', 1800, 180, 0.7, 0.4, 0.002);
      ticks(g, out, t + 0.06, 9, 0.6, 1.6, 'bandpass', 1500, 2, 0.3, 0.03, 0.8);      // debris
    }, 40),
    // a round off the plate: a clank with a skipping bell
    tamper_clank: snd(BUS_FX, PRIO_CONFIRM, 0.32, 0.35, (g, out, t) => {
      tone(g, out, t, 0.12, 'square', 232, 224, 0.2, 0.0008); tone(g, out, t, 0.1, 'square', 353, 340, 0.12, 0.0008);
      noise(g, out, t, 0.04, 'bandpass', 1900, 1500, 2, 0.36, 0.0005);
      const f = degree(2, 4) * 0.972;
      bell(g, out, t + 0.014, f, 0.16, 0.24); bell(g, out, t + 0.07, f, 0.13, 0.14); bell(g, out, t + 0.112, f, 0.11, 0.08);
    }, 30),
    // behind the bulkhead, every 2.6 s, until it dies or comes out
    tamper_pound: snd(BUS_FX, PRIO_OTHER, 0.6, 0.6, (g, out, t) => {
      const lp = g.filter('lowpass', 260, 0.8); lp.connect(out);
      tone(g, lp, t, 0.34, 'sine', 58, 33, 0.7, 0.004);
      noise(g, lp, t, 0.2, 'lowpass', 500, 120, 0.8, 0.16, 0.003);
      noise(g, out, t + 0.01, 0.5, 'bandpass', 310, 300, 12, 0.1, 0.004);
    }),
    tamper_die: snd(BUS_FX, PRIO_CONFIRM, 1.8, 0.4, (g, out, t) => {
      noiseHold(g, out, t, 1.7, 'highpass', 3200, 500, 0.8, 0.26, 0.05, 1.3);
      toneHold(g, out, t, 1.6, 'sawtooth', 120, 36, 0.14, 0.05, 1.2);
    }, 36),
  };
}
