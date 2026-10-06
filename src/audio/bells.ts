// One tonal family (GDD 17): everything that answers a bullet is the same bell voice in D Dorian.
import { BUS_AMB, BUS_FX } from './graph.ts';
import { PRIO_CONFIRM, PRIO_OTHER, snd } from './sound.ts';
import type { SoundTable } from './sound.ts';
import { bell, noise, noiseHold, tone } from './synth.ts';
import { FLAT, FOURTH_DOWN, degree } from './tuning.ts';

export const JUG_DECAY = 0.25, LATCH_DECAY = 1.2, LENS_DECAY = 1.8;
/**
 * The long bells are programmed past their figure: an exponential decay drops out of hearing (measured: under -60 dB
 * at the output, through the 0.36 effects bus) 6 to 12 % before the time it was given. With these the latch is heard
 * for 1.2 s and the lens for 1.8 s.
 */
const LATCH_PROGRAM = LATCH_DECAY * 1.01, LENS_PROGRAM = LENS_DECAY * 1.03;
/** the jugs hang an octave above the root: D4 .. C5 */
export const JUG_OCTAVE = 4;

export function bellSounds(): SoundTable {
  return {
    // a = scale degree 1..7. Clay: 0.25 s, low-passed. The seventh is left unresolved, by design.
    jug: snd(BUS_FX, PRIO_CONFIRM, JUG_DECAY + 0.05, 0.35, (g, out, t, p) => { bell(g, out, t, degree(p.a, JUG_OCTAVE), JUG_DECAY, 0.5, 1, 0, 2100, 0.0008); }, 30),
    // insulator latches, the yard bell, the loft bell: a = degree, b = octave (0 = 4)
    bell_long: snd(BUS_FX, PRIO_CONFIRM, LATCH_PROGRAM, 0.4, (g, out, t, p) => { 
      // detuned by a fixed 0.42 Hz either way, whatever the note: the pair beats at 0.84 Hz, so its second swell peaks
      // at 1.2 s and the ring is heard to its end (a detune in cents put a null of the beat on the last 100 ms of some degrees)
      const hz = degree(p.a < 1 ? 1 : p.a, p.b > 0 ? p.b : 4);
      bell(g, out, t, hz, LATCH_PROGRAM, 0.36, 1, 0, 0, 0.42 / hz);
    }, 34),
    // range plates: degrees 1, 3, 5
    plate: snd(BUS_FX, PRIO_CONFIRM, 0.55, 0.35, (g, out, t, p) => { bell(g, out, t, degree(p.a < 1 ? 1 : p.a, 5), 0.5, 0.3); noise(g, out, t, 0.03, 'bandpass', 2600, 2200, 3, 0.22, 0.0005); }, 34),
    // the asking's ports: a short bell by port number, in the station's flat tuning
    port: snd(BUS_FX, PRIO_CONFIRM, 0.36, 0.35, (g, out, t, p) => { bell(g, out, t, degree(p.a < 1 ? 1 : p.a, 4) * FLAT, 0.32, 0.34); }, 30),
    // a knot: the bell voice falling a fourth over 0.4 s, and a wet pop
    knot_burst: snd(BUS_FX, PRIO_CONFIRM, 0.7, 0.35, (g, out, t) => {
      bell(g, out, t, degree(5, 4), 0.65, 0.34, FOURTH_DOWN, 0.4);
      noise(g, out, t, 0.14, 'lowpass', 1000, 180, 2.5, 0.26, 0.002);
      tone(g, out, t, 0.1, 'sine', 240, 80, 0.3, 0.002);
    }, 30),
    knot_regrow: snd(BUS_FX, PRIO_OTHER, 0.6, 0.3, (g, out, t) => {
      tone(g, out, t, 0.55, 'sine', degree(5, 4), degree(1, 4), 0.3, 0.05);
      noiseHold(g, out, t, 0.5, 'bandpass', 300, 800, 3, 0.1, 0.2, 0.2);
    }, 24),
    // a Transit's lens: degree 5, two octaves up, 1.8 s. The prettiest sound in the game.
    lens_bell: snd(BUS_FX, PRIO_CONFIRM, LENS_PROGRAM, 0.5, (g, out, t) => {
      // the two sines beat at 1.8 Hz: the last swell of the beat ends with the decay (at 1.8 s), not in a null before it
      bell(g, out, t, degree(5, 5), LENS_PROGRAM, 0.3, 1, 0, 0, 0.001);
      tone(g, out, t, 1.3, 'sine', degree(5, 6), degree(5, 6), 0.045, 0.004);
    }, 40),
    // a Windlass chamber going dark: a = degree 1..6, b = 1 while the machine still sings flat
    chamber: snd(BUS_FX, PRIO_CONFIRM, 1.0, 0.45, (g, out, t, p) => {
      bell(g, out, t, degree(p.a < 1 ? 1 : p.a, 3) * (p.b > 0 ? FLAT : 1), 1.0, 0.5);
      noise(g, out, t, 0.05, 'bandpass', 900, 500, 2, 0.24, 0.001);
    }, 45),
    twang: snd(BUS_FX, PRIO_CONFIRM, 0.25, 0.25, (g, out, t) => { tone(g, out, t, 0.22, 'triangle', 190, 118, 0.36, 0.001); noise(g, out, t, 0.03, 'bandpass', 1500, 900, 2, 0.2, 0.0005); }, 24),
    dust_hit: snd(BUS_FX, PRIO_CONFIRM, 0.4, 0.3, (g, out, t) => { noise(g, out, t, 0.3, 'lowpass', 900, 200, 0.6, 0.3, 0.01); tone(g, out, t + 0.03, 0.3, 'sine', degree(7, 5), degree(7, 5), 0.05, 0.003); }, 40),
    // the yard bell answering a stray shot, far off
    yard_bell_far: snd(BUS_AMB, PRIO_OTHER, 1.5, 0.6, (g, out, t) => { bell(g, out, t, degree(1, 4), 1.5, 0.11, 1, 0, 1500); }),
  };
}
