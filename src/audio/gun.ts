// The revolver, its hit confirms and the player's own body (work order 4.2; GDD 6.8, 17).
// "The loudest thing in the world is the gun, and the quiet after it feels like judgment."
import type { SurfaceType } from '../core/contracts.ts';
import { BUS_FX, BUS_GUN, BUS_KEPT } from './graph.ts';
import type { Graph } from './graph.ts';
import { PRIO_CONFIRM, PRIO_GUN, PRIO_OTHER, baked, makeParams, snd } from './sound.ts';
import type { SoundDef, SoundParams, SoundTable } from './sound.ts';
import { bell, click, noise, noiseHold, tone, toneHold } from './synth.ts';
import { D4, D5, FOURTH_DOWN, LINE_SHARP, degree } from './tuning.ts';

/** layer mask of gun_report's `c` (0 = everything): tests solo a layer */
export const LAYER_CRACK = 1, LAYER_BODY = 2, LAYER_BOOM = 4, LAYER_MECHANICS = 8, LAYER_WEIGHT = 16;
/** the report of the kept round is cut here; what is left is one pure tone */
export const KEPT_CUT = 0.12;
export const KEPT_SECONDS = 3.5;
export const LINE_TONE_SECONDS = 1.2;
/** the cock and the cylinder's ratchet: view-model frames 4-9 (133-300 ms) */
export const COCK_AT = 0.142, RATCHET_AT = 0.262;
/** the loud layers together sit about 3 dB into the soft clip: it reads as weight, and it never clips */
const REPORT_LEVEL = 0.56;
/** the crack owns the first 3 ms: louder than everything under it */
const CRACK_LEVEL = 1.2;
/** the body (600-2500 Hz) is what a laptop speaker plays of the report: 8 dB over the first cut (1.25) */
const BODY_LEVEL = 4.4;
/** the saturated boom sits 3 dB under its first, clean level */
const BOOM_LEVEL = 0.7;
/** the chest: noise round 250 Hz. It fills 150-600 Hz, which the boom (below) and the body (above) leave empty */
const CHEST_LEVEL = 0.9;
/**
 * Hit confirms. They are heard AFTER the report, not under it: the engine starts them CONFIRM_DELAY after the click
 * (150 ms: past the crack, the body and the report's first 150 ms, after which its level is 10 dB down; just behind
 * the cock at 142 ms; the kill's thud after the boom has let go), the engine steps the report's tail back 5 dB under
 * the short ones (Graph.duckTail), and they are this much louder than an ordinary effect, so a hit and a miss do not
 * sound the same. At 85 ms (until polish round 3) the tick and the parry sat 8 to 11 dB under the report.
 */
export const CONFIRM_DELAY = 0.15, KILL_DELAY = 0.19;
const CONFIRM = 3.4, CONFIRM_LOW = 2.4;
/** the tick is 2.5 dB and the parry's sour note 4 dB over the other confirms: the two that were furthest under the report */
const TICK = CONFIRM * 1.334, PARRY = CONFIRM * 1.585;
/** how long the tick's knock takes to fall 80 dB */
const TICK_SECONDS = 0.13;
/** footsteps: walk and sprint (5 dB apart). A walk step peaks near the reload's seat-click. */
export const STEP_WALK = 2.0, STEP_SPRINT = 3.6;

/**
 * The six-layer report. a = chambers left after the shot (<= 1: brighter mechanics; the engine also halves the send),
 * c = layer mask. The crack starts at full level on the first sample: no ramp, no look-ahead.
 */
function report(g: Graph, out: AudioNode, t: number, p: Readonly<SoundParams>): void {
  const v = p.pitch, last = p.a <= 1, m = p.c === 0 ? 31 : p.c, k = REPORT_LEVEL;
  if (m & LAYER_CRACK) {
    const src = g.source(g.noise, true), hp = g.filter('highpass', 2000 * v, 0.7), amp = g.gain(0);
    amp.gain.setValueAtTime(CRACK_LEVEL, t); amp.gain.setValueAtTime(CRACK_LEVEL, t + 0.0022); amp.gain.linearRampToValueAtTime(0, t + 0.003);
    src.connect(hp); hp.connect(amp); amp.connect(out);
    src.start(t, g.noiseOffset()); src.stop(t + 0.004);
  }
  if (m & LAYER_BODY) {
    // noise held between 600 and 2500 Hz by two high-passes and two low-passes (24 dB an octave each side). It is the
    // part of the report a laptop speaker plays, so it is loud and it holds: full for 25 ms, -20 dB by 95 ms, gone at 120
    const src = g.source(g.noise, true), amp = g.gain(0);
    const h1 = g.filter('highpass', 600 * v, 0.7), h2 = g.filter('highpass', 600 * v, 0.7), l1 = g.filter('lowpass', 2500 * v, 0.7), l2 = g.filter('lowpass', 2500 * v, 0.7);
    amp.gain.setValueAtTime(0.0001, t); amp.gain.exponentialRampToValueAtTime(BODY_LEVEL * k, t + 0.003);
    amp.gain.exponentialRampToValueAtTime(0.7 * BODY_LEVEL * k, t + 0.04);
    amp.gain.exponentialRampToValueAtTime(0.1 * BODY_LEVEL * k, t + 0.095);
    amp.gain.exponentialRampToValueAtTime(0.01 * BODY_LEVEL * k, t + 0.114); amp.gain.linearRampToValueAtTime(0, t + 0.12);
    src.connect(h1); h1.connect(h2); h2.connect(l1); l1.connect(l2); l2.connect(amp); amp.connect(out);
    src.start(t, g.noiseOffset()); src.stop(t + 0.13);
  }
  if (m & LAYER_BOOM) {
    // the heavy: a sine falling 150 -> 50 Hz over 160 ms, driven into a saturator while it is loud (its 3rd and 5th
    // harmonics, 450 Hz down to 150 Hz, are the weight a small speaker can play) and cleaner as it lets go
    const osc = g.osc('sine', 150 * v), drive = g.gain(0), sh = g.saturator(), amp = g.gain(BOOM_LEVEL * k);
    osc.frequency.setValueAtTime(150 * v, t); osc.frequency.exponentialRampToValueAtTime(50 * v, t + 0.16);
    drive.gain.setValueAtTime(1, t); drive.gain.linearRampToValueAtTime(0.55, t + 0.08); drive.gain.linearRampToValueAtTime(0, t + 0.19);
    osc.connect(drive); drive.connect(sh); sh.connect(amp); amp.connect(out);
    osc.start(t); osc.stop(t + 0.2);
  }
  if (m & LAYER_WEIGHT) {
    // powder snap behind the crack; the chest (a band of noise round 250 Hz); a thump under the boom, saturated too
    noise(g, out, t + 0.002, 0.05, 'highpass', 3400 * v, 1700 * v, 0.6, 0.45 * k, 0.0005);
    noiseHold(g, out, t + 0.001, 0.15, 'bandpass', 330 * v, 210 * v, 0.8, CHEST_LEVEL * k, 0.003, 0.11);
    const sh = g.saturator(), amp = g.gain(0.42 * k);
    sh.connect(amp); amp.connect(out);
    tone(g, sh, t, 0.24, 'triangle', 92 * v, 38 * v, 0.9, 0.004);
    noise(g, out, t + 0.004, 0.2, 'lowpass', 420 * v, 90, 0.6, 0.12 * k, 0.004);
  }
  if (m & LAYER_MECHANICS) {
    const b = last ? 1.6 : 1, c = last ? 1.35 : 1;
    click(g, out, t, 3000 * b, 3, 0.16 * c, 0.01);                  // hammer fall
    click(g, out, t + COCK_AT, 1500 * b, 4, 0.2 * c, 0.016);        // hammer cock
    click(g, out, t + RATCHET_AT, 2200 * b, 5, 0.16 * c, 0.012);    // the cylinder turns one notch ...
    click(g, out, t + RATCHET_AT + 0.024, 2700 * b, 5, 0.1 * c, 0.01); // ... and its pawl drops
  }
}

/** The kept round's report: crack and boom, cut dead at 120 ms. No mechanics, no tail, no room. */
function keptReport(g: Graph, out: AudioNode, t: number, p: Readonly<SoundParams>): void {
  const cut = g.gain(1);
  cut.gain.setValueAtTime(1, t); cut.gain.setValueAtTime(1, t + KEPT_CUT - 0.012); cut.gain.linearRampToValueAtTime(0, t + KEPT_CUT);
  cut.connect(out);
  const q = SCRATCH; copyParams(q, p); q.a = 6; q.c = LAYER_CRACK | LAYER_BODY | LAYER_BOOM;
  report(g, cut, t, q);
}
const SCRATCH: SoundParams = makeParams();
function copyParams(to: SoundParams, from: Readonly<SoundParams>): void { to.gain = from.gain; to.pitch = from.pitch; to.a = from.a; to.b = from.b; to.c = from.c; to.seconds = from.seconds; }

/**
 * Levels of the kept tone's two sines. It sounds alone in four seconds of silence, so it needs no level to be heard; on a
 * small speaker (nothing under 200 Hz) it stays 6 dB under the report, which is the loudest thing in the world.
 */
const KEPT_D4 = 0.286, KEPT_D5 = 0.159;
/** THE tone: D4 and D5, pure sines, exactly in tune, 3.5 s. The only sound in the game that is. */
function keptTone(g: Graph, out: AudioNode, t: number): void {
  for (let k = 0; k < 2; k++) {
    const osc = g.osc('sine', k === 0 ? D4 : D5), amp = g.gain(0), level = k === 0 ? KEPT_D4 : KEPT_D5;
    amp.gain.setValueAtTime(0, t); amp.gain.linearRampToValueAtTime(level, t + 0.04);
    amp.gain.setValueAtTime(level, t + 2.4); amp.gain.linearRampToValueAtTime(0, t + KEPT_SECONDS);
    osc.connect(amp); amp.connect(out);
    osc.start(t); osc.stop(t + KEPT_SECONDS + 0.02);
  }
}

/** seat-click `n` of a reload (1..6): each a semitone above the last, so the count is audible */
export function seatHz(n: number): number { return 1480 * Math.pow(2, (Math.max(1, Math.min(6, n)) - 1) / 12); }

const SURFACES: readonly SurfaceType[] = ['sand', 'wood', 'adobe', 'metal', 'ceramic', 'stone', 'cloth', 'none'];

function impact(surface: SurfaceType, g: Graph, out: AudioNode, t: number, v: number, k: number): void {
  switch (surface) {
    case 'sand': noise(g, out, t, 0.14, 'lowpass', 950 * v, 200, 0.6, 0.42 * k, 0.004); break;
    case 'wood': tone(g, out, t, 0.075, 'triangle', 290 * v, 170 * v, 0.5 * k, 0.001); noise(g, out, t, 0.03, 'bandpass', 1150 * v, 900, 2, 0.3 * k, 0.001); break;
    case 'adobe': noise(g, out, t, 0.1, 'lowpass', 520 * v, 170, 0.7, 0.3 * k, 0.002); tone(g, out, t, 0.07, 'sine', 140 * v, 85, 0.35 * k, 0.002); break;
    case 'metal': tone(g, out, t, 0.24, 'sine', 2100 * v, 2080 * v, 0.2 * k, 0.001); tone(g, out, t, 0.16, 'sine', 3370 * v, 3350 * v, 0.12 * k, 0.001); noise(g, out, t, 0.012, 'highpass', 4000, 4000, 0.7, 0.3 * k, 0.0005); break;
    case 'ceramic': noise(g, out, t, 0.03, 'highpass', 3000 * v, 2500, 0.7, 0.36 * k, 0.0005); tone(g, out, t, 0.06, 'sine', 1720 * v, 1650 * v, 0.2 * k, 0.001); break;
    case 'stone': noise(g, out, t, 0.065, 'bandpass', 2600 * v, 900, 1, 0.38 * k, 0.0008); noise(g, out, t, 0.02, 'highpass', 5000, 5000, 0.7, 0.2 * k, 0.0005); break;
    case 'cloth': noise(g, out, t, 0.07, 'lowpass', 700 * v, 280, 0.6, 0.34 * k, 0.006); break;
    default: noise(g, out, t, 0.09, 'lowpass', 600 * v, 200, 0.6, 0.36 * k, 0.003); break;
  }
}

function footstep(surface: SurfaceType, g: Graph, out: AudioNode, t: number, v: number, k: number): void {
  // the heel (under 200 Hz, or the surface's own knock), then the scuff of the sole at 2-4 kHz a few milliseconds
  // later: the wind (520-620 Hz) and the hum (73 / 110 Hz) leave that band free, so a step is heard in every zone
  switch (surface) {
    case 'sand': noise(g, out, t, 0.09, 'lowpass', 620 * v, 220, 0.6, 0.3 * k, 0.006); noise(g, out, t + 0.02, 0.09, 'bandpass', 2600 * v, 1800, 0.8, 0.26 * k, 0.008); break;
    case 'wood': tone(g, out, t, 0.06, 'triangle', 170 * v, 110, 0.3 * k, 0.002); noise(g, out, t, 0.03, 'bandpass', 800 * v, 600, 1.5, 0.12 * k, 0.002); noise(g, out, t + 0.012, 0.05, 'bandpass', 2400 * v, 2000, 1.5, 0.22 * k, 0.003); break;
    case 'metal': tone(g, out, t, 0.05, 'sine', 150 * v, 100, 0.25 * k, 0.002); noise(g, out, t, 0.09, 'bandpass', 1500 * v, 1450, 9, 0.12 * k, 0.001); noise(g, out, t + 0.01, 0.04, 'bandpass', 3300 * v, 2900, 3, 0.16 * k, 0.002); break;
    case 'ceramic': noise(g, out, t, 0.03, 'bandpass', 1300 * v, 1000, 2, 0.26 * k, 0.001); tone(g, out, t, 0.04, 'sine', 180 * v, 120, 0.26 * k, 0.002); noise(g, out, t + 0.008, 0.035, 'bandpass', 3600 * v, 3000, 2.5, 0.2 * k, 0.001); break;
    case 'stone': noise(g, out, t, 0.045, 'bandpass', 900 * v, 600, 1, 0.24 * k, 0.002); tone(g, out, t, 0.04, 'sine', 130 * v, 90, 0.2 * k, 0.002); noise(g, out, t + 0.012, 0.06, 'bandpass', 3000 * v, 2200, 1.2, 0.2 * k, 0.003); break;
    case 'cloth': noise(g, out, t, 0.06, 'lowpass', 480 * v, 220, 0.6, 0.28 * k, 0.006); noise(g, out, t + 0.015, 0.07, 'bandpass', 2200 * v, 1700, 0.8, 0.24 * k, 0.01); break;
    default: noise(g, out, t, 0.07, 'lowpass', 420 * v, 160, 0.7, 0.18 * k, 0.004); tone(g, out, t, 0.06, 'sine', 130 * v, 80, 0.22 * k, 0.003); noise(g, out, t + 0.018, 0.07, 'bandpass', 2500 * v, 1800, 1, 0.22 * k, 0.006); break;   // adobe, none
  }
}

/** baked classes of the report: 0 = a full cylinder, 1 = its last two rounds; a layer solo is built live */
function pickReport(p: Readonly<SoundParams>): number { return p.c !== 0 ? -1 : p.a <= 1 ? 1 : 0; }
function pickStep(p: Readonly<SoundParams>): number { return p.a > 0 ? 1 : 0; }
const BAKED_CONFIRMS: readonly string[] = [
  'hit_tick', 'hit_weak', 'hit_kill', 'hit_freed', 'hit_deflect', 'hit_parry', 'hit_pass',
  'break_clay', 'break_glass', 'break_tin', 'break_stake', 'break_knot', 'break_bell',
];

export function gunSounds(): SoundTable {
  const s: SoundTable = {
    gun_report: snd(BUS_GUN, PRIO_GUN, 0.32, 0.5, report),
    gun_report_kept: snd(BUS_GUN, PRIO_GUN, KEPT_CUT, 0, keptReport),
    kept_tone: snd(BUS_KEPT, PRIO_GUN, KEPT_SECONDS, 0, (g, out, t) => keptTone(g, out, t)),
    // under the report of a line round: D5, 8 cents sharp, "slightly too pure"
    line_tone: snd(BUS_GUN, PRIO_GUN, LINE_TONE_SECONDS, 0.12, (g, out, t) => {
      const osc = g.osc('sine', D5 * LINE_SHARP), amp = g.gain(0);
      amp.gain.setValueAtTime(0, t); amp.gain.linearRampToValueAtTime(0.2, t + 0.012);
      amp.gain.setValueAtTime(0.2, t + 0.5); amp.gain.linearRampToValueAtTime(0, t + LINE_TONE_SECONDS);
      osc.connect(amp); amp.connect(out); osc.start(t); osc.stop(t + LINE_TONE_SECONDS + 0.02);
    }),
    // one dead click. a = 1: the kept round refused outside the bore: the same, softer
    dry_fire: snd(BUS_GUN, PRIO_GUN, 0.08, 0.15, (g, out, t, p) => {
      // closer r4 (player request 1, combat critic): the click peaked at -13 dB and was never felt; x 1.8 (+5 dB) on both
      // gains. The kept round's refusal (a = 1) keeps its old level (0.45 / 1.8)
      const k = p.a > 0 ? 0.25 : 1;
      click(g, out, t, 1350 * p.pitch, 4, 0.61 * k, 0.014);
      tone(g, out, t, 0.05, 'triangle', 230 * p.pitch, 150, 0.45 * k, 0.001);
    }),
    reload_open: snd(BUS_GUN, PRIO_GUN, 0.12, 0.12, (g, out, t) => {
      click(g, out, t, 880, 3, 0.26, 0.016);
      noiseHold(g, out, t + 0.02, 0.08, 'bandpass', 2400, 3200, 1.5, 0.05, 0.02, 0.04);
    }),
    // a = rounds chambered after this one (1..6)
    reload_round: snd(BUS_GUN, PRIO_GUN, 0.1, 0.12, (g, out, t, p) => {
      const f = seatHz(p.a);
      tone(g, out, t, 0.07, 'sine', f, f, 0.26, 0.001);                  // brass on steel: the pitch that counts the rounds
      noise(g, out, t, 0.014, 'bandpass', f * 1.5, f * 1.5, 3, 0.2, 0.0005);
      tone(g, out, t + 0.004, 0.05, 'triangle', 310, 220, 0.2, 0.001);   // the round seating
    }),
    reload_close: snd(BUS_GUN, PRIO_GUN, 0.14, 0.14, (g, out, t) => {
      click(g, out, t, 700, 3, 0.3, 0.018); click(g, out, t + 0.03, 1250, 4, 0.2, 0.012);
    }),
    reload_fast_close: snd(BUS_GUN, PRIO_GUN, 0.1, 0.14, (g, out, t) => { click(g, out, t, 1050, 3, 0.34, 0.012); click(g, out, t + 0.016, 1700, 4, 0.18, 0.01); }),
    line_load: snd(BUS_GUN, PRIO_GUN, 0.3, 0.15, (g, out, t) => {
      click(g, out, t, 1200, 4, 0.22, 0.014);
      tone(g, out, t + 0.02, 0.28, 'sine', D5 * 2 * LINE_SHARP, D5 * 2 * LINE_SHARP, 0.07, 0.004);   // the glass round rings as it seats
    }),
    line_unload: snd(BUS_GUN, PRIO_GUN, 0.16, 0.12, (g, out, t) => { click(g, out, t, 950, 3, 0.18, 0.014); tone(g, out, t + 0.01, 0.12, 'sine', D5 * 2 * LINE_SHARP, D5 * 2 * LINE_SHARP, 0.035, 0.004); }),
    kept_denied: snd(BUS_GUN, PRIO_GUN, 0.08, 0.05, (g, out, t) => { click(g, out, t, 600, 2, 0.14, 0.02); }),
    // the band breaking (a small ceramic snap), then a slow seat
    kept_load: snd(BUS_GUN, PRIO_GUN, 0.95, 0.18, (g, out, t) => {
      noise(g, out, t, 0.022, 'highpass', 3600, 3000, 0.8, 0.36, 0.0005);
      tone(g, out, t, 0.09, 'sine', 2350, 2300, 0.14, 0.001);
      noiseHold(g, out, t + 0.35, 0.36, 'bandpass', 1500, 900, 1.2, 0.045, 0.12, 0.1);
      click(g, out, t + 0.72, 760, 3, 0.26, 0.022);
    }),
    kept_seat: snd(BUS_GUN, PRIO_GUN, 0.08, 0.1, (g, out, t) => { click(g, out, t, 820, 3, 0.16, 0.018); }),
    kept_unload: snd(BUS_GUN, PRIO_GUN, 0.2, 0.1, (g, out, t) => { click(g, out, t, 900, 3, 0.16, 0.014); click(g, out, t + 0.09, 640, 3, 0.14, 0.018); }),

    // ---- hit confirms: dry and close, the same wherever the target stands
    // a tick: a short knock at 1.9 kHz with a grain of noise above it. The knock rings 130 ms to nothing (90 ms until
    // polish round 4): its peak is at the limiter already, so what it gains over a room's tail it gains by lasting
    hit_tick: snd(BUS_FX, PRIO_CONFIRM, 0.14, 0, (g, out, t) => { noise(g, out, t, 0.02, 'bandpass', 3400, 3000, 4, 0.25 * TICK, 0.0005); tone(g, out, t, TICK_SECONDS, 'sine', 1900, 1820, 0.38 * TICK, 0.0005); }),
    // a glass tink at 3.1 and 5 kHz, where nothing of the report is left
    hit_weak: snd(BUS_FX, PRIO_CONFIRM, 0.2, 0.05, (g, out, t) => { tone(g, out, t, 0.18, 'sine', 3120, 3100, 0.3 * CONFIRM, 0.0008); tone(g, out, t, 0.11, 'sine', 4990, 4950, 0.16 * CONFIRM, 0.0008); noise(g, out, t, 0.008, 'highpass', 6000, 6000, 0.7, 0.2 * CONFIRM, 0.0005); }),
    // a low thud once the boom has let go, with a knock at 200 Hz for the speakers that cannot play the thud
    hit_kill: snd(BUS_FX, PRIO_CONFIRM, 0.22, 0.05, (g, out, t) => { tone(g, out, t, 0.2, 'sine', 112, 52, 0.7 * CONFIRM_LOW, 0.002); tone(g, out, t, 0.14, 'triangle', 205, 170, 0.45 * CONFIRM_LOW, 0.002); noise(g, out, t, 0.08, 'lowpass', 320, 120, 0.7, 0.2 * CONFIRM_LOW, 0.002); }),
    // the bell voice falling, then a breath
    hit_freed: snd(BUS_FX, PRIO_CONFIRM, 1.15, 0.25, (g, out, t) => {
      bell(g, out, t, degree(5, 4), 0.9, 0.3 * CONFIRM_LOW, FOURTH_DOWN, 0.5);
      noiseHold(g, out, t + 0.38, 0.75, 'bandpass', 760, 420, 1, 0.1 * CONFIRM_LOW, 0.28, 0.4);
    }),
    // a flat clank with a skipping bell
    hit_deflect: snd(BUS_FX, PRIO_CONFIRM, 0.26, 0.2, (g, out, t) => {
      const c = CONFIRM;
      tone(g, out, t, 0.08, 'square', 412, 400, 0.16 * c, 0.0008); tone(g, out, t, 0.07, 'square', 631, 610, 0.1 * c, 0.0008);
      noise(g, out, t, 0.03, 'bandpass', 2900, 2400, 2, 0.3 * c, 0.0005);
      const f = degree(2, 6) * 0.972;
      bell(g, out, t + 0.012, f, 0.12, 0.34 * c); bell(g, out, t + 0.058, f, 0.1, 0.2 * c); bell(g, out, t + 0.094, f, 0.09, 0.12 * c);
    }),
    hit_parry: snd(BUS_FX, PRIO_CONFIRM, 0.24, 0.2, (g, out, t) => { const c = PARRY; /* GDD 8 'a sour note': falling and a tritone apart, not the rising confirm (closer, polish round 2) */ tone(g, out, t, 0.2, 'sine', 1480, 990, 0.22 * c, 0.001); tone(g, out, t, 0.16, 'triangle', 1047, 700, 0.14 * c, 0.001); noise(g, out, t, 0.02, 'highpass', 5000, 5000, 0.7, 0.24 * c, 0.0005); }),
    hit_pass: snd(BUS_FX, PRIO_CONFIRM, 0.1, 0.1, (g, out, t) => { noiseHold(g, out, t, 0.1, 'bandpass', 1900, 1300, 0.7, 0.09, 0.02, 0.07); }),
    break_clay: snd(BUS_FX, PRIO_CONFIRM, 0.14, 0.25, (g, out, t, p) => { noise(g, out, t, 0.1, 'bandpass', 1500 * p.pitch, 520, 0.9, 0.5, 0.0008); tone(g, out, t, 0.06, 'triangle', 380 * p.pitch, 210, 0.25, 0.001); noise(g, out, t + 0.03, 0.12, 'highpass', 2600, 1800, 0.7, 0.1, 0.01); }, 22),
    break_glass: snd(BUS_FX, PRIO_CONFIRM, 0.3, 0.25, (g, out, t, p) => { noise(g, out, t, 0.12, 'highpass', 4200 * p.pitch, 3000, 0.7, 0.4, 0.0005); tone(g, out, t, 0.2, 'sine', 3800 * p.pitch, 3760, 0.12, 0.001); tone(g, out, t + 0.03, 0.22, 'sine', 5300 * p.pitch, 5260, 0.08, 0.001); noise(g, out, t + 0.07, 0.2, 'highpass', 6000, 5000, 0.7, 0.07, 0.02); }, 22),
    break_tin: snd(BUS_FX, PRIO_CONFIRM, 0.3, 0.25, (g, out, t, p) => { noise(g, out, t, 0.16, 'bandpass', 2200 * p.pitch, 2100, 7, 0.4, 0.0005); tone(g, out, t, 0.1, 'square', 540 * p.pitch, 520, 0.1, 0.0008); click(g, out, t + 0.12, 1700, 5, 0.12, 0.02); }, 22),
    break_stake: snd(BUS_FX, PRIO_CONFIRM, 0.16, 0.25, (g, out, t) => { noise(g, out, t, 0.07, 'bandpass', 1900, 700, 1, 0.5, 0.0006); noise(g, out, t + 0.02, 0.12, 'highpass', 5200, 3800, 0.7, 0.16, 0.004); tone(g, out, t, 0.05, 'sine', 950, 600, 0.2, 0.001); }, 24),
    break_knot: snd(BUS_FX, PRIO_CONFIRM, 0.18, 0.2, (g, out, t) => { noise(g, out, t, 0.13, 'lowpass', 950, 190, 2.5, 0.5, 0.002); tone(g, out, t, 0.1, 'sine', 250, 85, 0.4, 0.002); }, 22),
    break_bell: snd(BUS_FX, PRIO_CONFIRM, 0.12, 0.25, (g, out, t) => { noise(g, out, t, 0.025, 'highpass', 3200, 2800, 0.7, 0.3, 0.0005); tone(g, out, t, 0.1, 'sine', 2480, 2460, 0.14, 0.001); }, 24),

    // ---- the player's body
    // the push off the ground and the cloth that follows it up
    jump: snd(BUS_FX, PRIO_OTHER, 0.12, 0.1, (g, out, t) => { noise(g, out, t, 0.08, 'bandpass', 640, 380, 0.8, 0.7, 0.01); noise(g, out, t + 0.01, 0.1, 'bandpass', 2400, 3200, 1, 0.5, 0.02); }),
    // a = landing speed, m/s
    land: snd(BUS_FX, PRIO_OTHER, 0.16, 0.15, (g, out, t, p) => {
      const k = Math.min(1, Math.max(0.25, p.a / 8));
      tone(g, out, t, 0.12, 'sine', 95, 48, 0.55 * k, 0.003); noise(g, out, t, 0.09, 'lowpass', 420, 150, 0.7, 0.36 * k, 0.003);
    }),
    // a = damage taken: a low thud, heavier by amount
    hurt: snd(BUS_FX, PRIO_CONFIRM, 0.34, 0.1, (g, out, t, p) => {
      const k = Math.min(1, 0.45 + p.a / 70);
      tone(g, out, t, 0.2 + 0.14 * k, 'sine', 84, 38, 0.95 * k, 0.003);
      noise(g, out, t, 0.14, 'lowpass', 300, 90, 0.8, 0.5 * k, 0.003);
      noise(g, out, t, 0.05, 'bandpass', 1300, 700, 1, 0.14 * k, 0.002);
    }),
    died: snd(BUS_FX, PRIO_CONFIRM, 1.4, 0.3, (g, out, t) => {
      toneHold(g, out, t, 1.4, 'sine', 196, 41, 0.34, 0.02, 1.0);
      noiseHold(g, out, t, 1.2, 'lowpass', 500, 80, 0.7, 0.2, 0.05, 0.9);
    }),
  };
  for (const surface of SURFACES) {
    s['impact_' + surface] = snd(BUS_FX, PRIO_CONFIRM, 0.2, 0.3, (g, out, t, p) => impact(surface, g, out, t, p.pitch, 1), 24);
    // a = 1 when sprinting: louder (5 dB)
    s['step_' + surface] = snd(BUS_FX, PRIO_OTHER, 0.12, 0.18, (g, out, t, p) => footstep(surface, g, out, t, p.pitch, p.a > 0 ? STEP_SPRINT : STEP_WALK));
    baked(s['impact_' + surface] as SoundDef, [0], 2);
    baked(s['step_' + surface] as SoundDef, [0, 1], 2, pickStep);
  }
  // what every shot sounds, pre-rendered at load (bake.ts): a start is one buffer source, not a graph
  baked(s.gun_report as SoundDef, [4, 1], 3, pickReport);
  for (const name of BAKED_CONFIRMS) baked(s[name] as SoundDef);
  return s;
}
