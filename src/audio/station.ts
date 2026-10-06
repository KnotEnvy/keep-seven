// The station's voice (GDD 17): a three-note chime in the flat tuning, then one blip per word, pitched by the word's
// length. Never speech, no formants.
import { BUS_STATION } from './graph.ts';
import type { Graph } from './graph.ts';
import { PRIO_STATION, snd } from './sound.ts';
import type { SoundParams, SoundTable } from './sound.ts';
import { bell } from './synth.ts';
import { FLAT, degree } from './tuning.ts';

/** the chime: D, A, F above: the machine's own little phrase, 20 cents under the scale */
export const CHIME_DEGREES: readonly number[] = [1, 5, 10];
export const CHIME_STEP = 0.13;
/** the chime takes this much of a line before the first blip */
export const CHIME_SECONDS = 0.55;
const MAX_WORDS = 48;
const WORD_LEN = new Uint8Array(MAX_WORDS);

function chime(g: Graph, out: AudioNode, t: number, gain: number): void {
  for (let k = 0; k < 3; k++) bell(g, out, t + k * CHIME_STEP, degree(CHIME_DEGREES[k] as number, 4) * FLAT, 0.5, gain, 1, 0, 0, 0.001);
}

/** Word lengths of a line into WORD_LEN (letters and digits count; nothing is allocated). Returns the word count. */
export function wordLengths(text: string): number {
  if (typeof text !== 'string') return 0;       // a line with no text is a chime and nothing else
  let n = 0, len = 0;
  for (let i = 0; i <= text.length; i++) {
    const c = i < text.length ? text.charCodeAt(i) : 32;
    const letter = (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c > 191;
    if (letter) len++;
    else if (len > 0) { if (n < MAX_WORDS) WORD_LEN[n++] = len > 255 ? 255 : len; len = 0; }
  }
  return n;
}
export function wordLength(i: number): number { return WORD_LEN[i] as number; }
/** the pitch of a word: its length walks the scale (1 letter = D4 ... 7 letters = C5, 8 = D5 ...), flat */
export function blipHz(length: number): number { return degree(1 + ((length - 1) % 9), 4) * FLAT; }

/** One oscillator and one gain for the whole line: a step in pitch and a small envelope per word. */
function line(g: Graph, out: AudioNode, t: number, p: Readonly<SoundParams>): void {
  chime(g, out, t, 0.3);
  const words = wordLengths(p.text);
  if (words === 0) return;
  const total = Math.max(0.4, (p.seconds > 0 ? p.seconds : 2) - CHIME_SECONDS - 0.2);
  const slot = Math.min(0.34, total / words), on = Math.min(0.2, slot * 0.62);
  const osc = g.osc('triangle', blipHz(1)), lp = g.filter('lowpass', 2600, 0.7), amp = g.gain(0);
  amp.gain.setValueAtTime(0, t);
  for (let i = 0; i < words; i++) {
    const at = t + CHIME_SECONDS + i * slot;
    osc.frequency.setValueAtTime(blipHz(WORD_LEN[i] as number), at);
    amp.gain.setValueAtTime(0, at); amp.gain.linearRampToValueAtTime(0.26, at + 0.008);
    amp.gain.setValueAtTime(0.26, at + on * 0.6); amp.gain.linearRampToValueAtTime(0, at + on);
  }
  osc.connect(lp); lp.connect(amp); amp.connect(out);
  osc.start(t + CHIME_SECONDS); osc.stop(t + CHIME_SECONDS + words * slot + 0.05);
}

export function stationSounds(): SoundTable {
  return {
    station_chime: snd(BUS_STATION, PRIO_STATION, 0.8, 0.3, (g, out, t) => chime(g, out, t, 0.34)),
    // text = the line, seconds = how long it is on screen
    station_line: snd(BUS_STATION, PRIO_STATION, 0.2, 0.25, line, 16, 2),
  };
}
