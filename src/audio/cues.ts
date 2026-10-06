// The world's sounds: one for each of the 39 `AudioCue` values (the table's type makes a missing one a compile
// error), the pickups, the sparse events of the ambience beds and the two voices of the music.
import type { AudioCue } from '../core/contracts.ts';
import { BUS_AMB, BUS_COMBAT, BUS_FX, BUS_MUSIC, BUS_UI } from './graph.ts';
import type { Graph } from './graph.ts';
import { bossSounds } from './boss.ts';
import { seatHz } from './gun.ts';
import { PRIO_CONFIRM, PRIO_OTHER, PRIO_STATION, snd } from './sound.ts';
import type { SoundDef, SoundTable } from './sound.ts';
import { stationSounds } from './station.ts';
import { bell, click, noise, noiseHold, pluck, ticks, tone, toneHold, wobble } from './synth.ts';
import { A2, D2, FLAT, WIRE_OFF, degree } from './tuning.ts';

/** the wire resolving: D, A, C ... and for the first and only time, D */
export const RESOLVE_DEGREES: readonly number[] = [1, 5, 7, 8];
export const RESOLVE_AT: readonly number[] = [0, 1.0, 2.0, 3.5];
/** a seven-beat clatter with one beat missing (the fifth) */
export const PUMP_BEATS = 7, PUMP_MISSING = 4, PUMP_STEP = 0.16;

function wireNote(g: Graph, out: AudioNode, t: number, deg: number, octave: number, gain: number, seconds: number): void {
  pluck(g, out, t, degree(deg, octave) * WIRE_OFF, seconds, gain);
}

export function cueSounds(): Record<AudioCue, SoundDef> {
  const boss = bossSounds(), station = stationSounds();
  return {
    door_creak: snd(BUS_FX, PRIO_OTHER, 0.8, 0.3, (g, out, t, p) => { wobble(g, out, t, 0.75, 'sawtooth', 34 * p.pitch, 58 * p.pitch, 6.5, 0.3, 'bandpass', 880, 7, 1.4, 0.08, 0.2); }, 20),
    gate_bang: snd(BUS_FX, PRIO_CONFIRM, 0.6, 0.5, (g, out, t) => {
      tone(g, out, t, 0.28, 'triangle', 124, 56, 1.0, 0.002);
      noise(g, out, t, 0.2, 'bandpass', 950, 300, 1, 0.7, 0.001);
      ticks(g, out, t + 0.08, 5, 0.4, 1.5, 'bandpass', 700, 3, 0.3, 0.03, 0.7);
    }, 45),
    gate_notch: snd(BUS_FX, PRIO_OTHER, 0.2, 0.35, (g, out, t) => { click(g, out, t, 900, 4, 0.4, 0.016); tone(g, out, t + 0.03, 0.12, 'triangle', 240, 150, 0.4, 0.002); }, 30),
    // a bang with a rattle
    shutter_bang: snd(BUS_FX, PRIO_CONFIRM, 0.75, 0.4, (g, out, t) => {
      tone(g, out, t, 0.16, 'triangle', 185, 88, 0.9, 0.002);
      noise(g, out, t, 0.12, 'bandpass', 1300, 500, 1, 0.6, 0.001);
      ticks(g, out, t + 0.07, 11, 0.55, 1.7, 'bandpass', 1100, 4, 0.34, 0.022, 0.8);
    }, 30),
    hatch_iris: snd(BUS_FX, PRIO_OTHER, 1.1, 0.4, (g, out, t) => {
      noiseHold(g, out, t, 1.0, 'bandpass', 380, 1800, 4, 0.34, 0.1, 0.15);
      ticks(g, out, t, 8, 0.95, 1, 'bandpass', 2400, 6, 0.2, 0.014);
      toneHold(g, out, t, 1.0, 'sine', D2 * 2 * FLAT, D2 * 2 * FLAT, 0.12, 0.2, 0.3);
    }, 26),
    baffle_grind: snd(BUS_FX, PRIO_OTHER, 3.0, 0.45, (g, out, t) => {
      noiseHold(g, out, t, 3.0, 'bandpass', 210, 260, 3, 0.5, 0.25, 0.35);
      wobble(g, out, t, 3.0, 'sawtooth', 39, 44, 11, 0.35, 'lowpass', 420, 2, 0.3, 0.3, 0.4);
      click(g, out, t + 2.95, 320, 2, 0.5, 0.04);
    }, 45),
    grate_clang: snd(BUS_FX, PRIO_OTHER, 0.6, 0.45, (g, out, t) => {
      tone(g, out, t, 0.5, 'square', 311, 309, 0.14, 0.0008); tone(g, out, t, 0.4, 'square', 487, 484, 0.1, 0.0008); tone(g, out, t, 0.3, 'square', 731, 727, 0.07, 0.0008);
      noise(g, out, t, 0.03, 'bandpass', 2300, 1800, 2, 0.4, 0.0005);
    }, 30),
    lift_run: snd(BUS_FX, PRIO_OTHER, 3.0, 0.4, (g, out, t) => {
      wobble(g, out, t, 3.0, 'sawtooth', 52, 66, 7.3, 0.25, 'lowpass', 500, 2, 0.34, 0.4, 0.5);
      ticks(g, out, t + 0.2, 14, 2.6, 1, 'bandpass', 1500, 5, 0.16, 0.016);
      noiseHold(g, out, t, 3.0, 'bandpass', 300, 380, 1.5, 0.14, 0.4, 0.5);
    }, 30),
    lever_throw: snd(BUS_FX, PRIO_OTHER, 0.3, 0.3, (g, out, t) => { click(g, out, t, 520, 3, 0.4, 0.02); tone(g, out, t + 0.02, 0.1, 'triangle', 150, 100, 0.34, 0.002); click(g, out, t + 0.14, 930, 4, 0.36, 0.016); }, 20),
    // 0.8 s before the risers move: chairs on a board floor
    chairs_scrape: snd(BUS_FX, PRIO_CONFIRM, 0.9, 0.4, (g, out, t) => {
      wobble(g, out, t, 0.42, 'sawtooth', 66, 81, 23, 0.4, 'bandpass', 520, 5, 0.5, 0.03, 0.12);
      wobble(g, out, t + 0.22, 0.5, 'sawtooth', 58, 74, 19, 0.4, 'bandpass', 640, 5, 0.42, 0.04, 0.16);
      noiseHold(g, out, t + 0.05, 0.75, 'bandpass', 420, 700, 4, 0.2, 0.08, 0.2);
      tone(g, out, t + 0.7, 0.07, 'triangle', 210, 140, 0.3, 0.002);
    }, 26),
    // a line locker stocked: two notes, the station's tuning
    locker_chime: snd(BUS_FX, PRIO_STATION, 0.9, 0.35, (g, out, t) => { bell(g, out, t, degree(5, 4) * FLAT, 0.6, 0.3); bell(g, out, t + 0.16, degree(8, 4) * FLAT, 0.75, 0.3); }, 26),
    locker_open: snd(BUS_FX, PRIO_OTHER, 0.4, 0.3, (g, out, t) => { click(g, out, t, 1100, 4, 0.34, 0.014); noiseHold(g, out, t + 0.03, 0.3, 'bandpass', 900, 1400, 2.5, 0.12, 0.05, 0.1); click(g, out, t + 0.33, 620, 3, 0.26, 0.02); }, 16),
    dispense: snd(BUS_FX, PRIO_OTHER, 0.45, 0.25, (g, out, t) => {
      for (let k = 0; k < 3; k++) tone(g, out, t + k * 0.075, 0.06, 'sine', seatHz(2 + k * 2), seatHz(2 + k * 2), 0.2, 0.001);
      tone(g, out, t + 0.26, 0.1, 'triangle', 260, 170, 0.3, 0.002); noise(g, out, t + 0.26, 0.04, 'bandpass', 1400, 1000, 2, 0.2, 0.001);
    }, 16),
    ui_move: snd(BUS_UI, PRIO_OTHER, 0.05, 0, (g, out, t, p) => { tone(g, out, t, 0.035, 'sine', 1180 * p.pitch, 1100 * p.pitch, 0.3, 0.002); }),
    ui_select: snd(BUS_UI, PRIO_OTHER, 0.2, 0, (g, out, t, p) => { tone(g, out, t, 0.06, 'triangle', degree(5, 4) * p.pitch, degree(5, 4) * p.pitch, 0.34, 0.002); tone(g, out, t + 0.05, 0.14, 'triangle', degree(8, 4) * p.pitch, degree(8, 4) * p.pitch, 0.3, 0.002); }),
    ui_back: snd(BUS_UI, PRIO_OTHER, 0.16, 0, (g, out, t, p) => { tone(g, out, t, 0.14, 'triangle', degree(5, 4) * p.pitch, degree(2, 4) * p.pitch, 0.3, 0.002); }),
    // a single soft wire note
    checkpoint: snd(BUS_MUSIC, PRIO_OTHER, 2.2, 0.35, (g, out, t) => { wireNote(g, out, t, 5, 3, 0.6, 2.2); }),
    station_chime: station['station_chime'] as SoundDef,
    // a soft rising tick: the aim has become legal
    listen_tick: snd(BUS_FX, PRIO_CONFIRM, 0.08, 0.1, (g, out, t) => { tone(g, out, t, 0.06, 'sine', 900, 1400, 0.3, 0.003); }),
    // a flat tone
    ask_wrong: snd(BUS_FX, PRIO_STATION, 0.5, 0.3, (g, out, t) => { toneHold(g, out, t, 0.45, 'square', degree(2, 3) * FLAT * 0.945, degree(2, 3) * FLAT * 0.945, 0.12, 0.01, 0.08); toneHold(g, out, t, 0.45, 'triangle', degree(2, 2) * FLAT * 0.945, degree(2, 2) * FLAT * 0.945, 0.22, 0.01, 0.08); }, 26),
    ask_right: snd(BUS_FX, PRIO_STATION, 0.9, 0.35, (g, out, t) => { bell(g, out, t, degree(1, 4) * FLAT, 0.5, 0.3); bell(g, out, t + 0.14, degree(5, 4) * FLAT, 0.75, 0.3); }, 26),
    step_chime: snd(BUS_FX, PRIO_CONFIRM, 0.7, 0.3, (g, out, t) => { bell(g, out, t, degree(5, 5) * FLAT, 0.65, 0.2); }),
    // the day cell waking: a rising chime
    cell_wake: snd(BUS_FX, PRIO_STATION, 1.3, 0.4, (g, out, t) => {
      for (let k = 0; k < 4; k++) bell(g, out, t + k * 0.13, degree(k === 0 ? 1 : k === 1 ? 3 : k === 2 ? 5 : 8, 4) * FLAT, 0.5 + k * 0.15, 0.26);
    }, 30),
    hum_stop: snd(BUS_FX, PRIO_STATION, 0.6, 0.3, (g, out, t) => { click(g, out, t, 420, 2, 0.4, 0.03); tone(g, out, t, 0.5, 'sine', A2 * FLAT, 30, 0.3, 0.004); }),
    // far below, for the first time: water
    water_below: snd(BUS_AMB, PRIO_STATION, 4.0, 0.9, (g, out, t) => {
      noiseHold(g, out, t, 4.0, 'bandpass', 1500, 1100, 1.6, 0.16, 1.2, 1.5);
      const src = g.source(g.noise, true), bp = g.filter('bandpass', 700, 5), lfo = g.osc('sine', 3.1), dev = g.gain(260), amp = g.gain(0);
      lfo.connect(dev); dev.connect(bp.frequency);
      amp.gain.setValueAtTime(0, t); amp.gain.linearRampToValueAtTime(0.3, t + 1.4); amp.gain.setValueAtTime(0.3, t + 2.6); amp.gain.linearRampToValueAtTime(0, t + 4);
      src.connect(bp); bp.connect(amp); amp.connect(out);
      src.start(t, g.noiseOffset()); lfo.start(t); src.stop(t + 4.01); lfo.stop(t + 4.01);
      for (let k = 0; k < 6; k++) tone(g, out, t + 0.6 + k * 0.47 + (k % 2) * 0.11, 0.07, 'sine', 900 + k * 130, 1500 + k * 90, 0.07, 0.004);
    }),
    ratchet: boss['ratchet'] as SoundDef,
    mouth_iris: boss['mouth_iris'] as SoundDef,
    glow_tone: boss['glow_tone'] as SoundDef,
    haul_whine: boss['haul_whine'] as SoundDef,
    refill_gurgle: boss['refill_gurgle'] as SoundDef,
    dry_click_big: boss['dry_click_big'] as SoundDef,
    run_down: boss['run_down'] as SoundDef,
    guard_slide: boss['guard_slide'] as SoundDef,
    guard_shatter: boss['guard_shatter'] as SoundDef,
    // very small: a fire on a plain a long way off
    fire_kindle: snd(BUS_FX, PRIO_CONFIRM, 1.6, 0.3, (g, out, t) => {
      noiseHold(g, out, t, 1.5, 'lowpass', 300, 700, 0.7, 0.12, 0.5, 0.6);
      ticks(g, out, t + 0.1, 10, 1.3, 0.8, 'highpass', 2600, 0.8, 0.2, 0.012);
    }),
    // D, A, C ... D. The only time the seventh is answered.
    wire_resolve: snd(BUS_MUSIC, PRIO_STATION, 8.0, 0.45, (g, out, t) => {
      for (let k = 0; k < 4; k++) wireNote(g, out, t + (RESOLVE_AT[k] as number), RESOLVE_DEGREES[k] as number, 3, k === 3 ? 0.9 : 0.75, k === 3 ? 3.2 : 2.6);
      // the octave below, under the last note only: home
      wireNote(g, out, t + (RESOLVE_AT[3] as number), 1, 2, 0.55, 3.2);
    }),
    sweep_creak: snd(BUS_FX, PRIO_OTHER, 1.2, 0.3, (g, out, t, p) => { wobble(g, out, t, 1.15, 'sawtooth', 27 * p.pitch, 41 * p.pitch, 4.2, 0.35, 'bandpass', 620, 6, 1.4, 0.15, 0.35); }, 26),
    sand_pour: snd(BUS_FX, PRIO_OTHER, 1.6, 0.2, (g, out, t) => { noiseHold(g, out, t, 1.6, 'highpass', 2600, 3400, 0.7, 0.12, 0.2, 0.7); noiseHold(g, out, t, 1.6, 'bandpass', 900, 700, 0.8, 0.06, 0.2, 0.7); }, 20),
    // the wind-pump: a creak, then seven beats with the fifth missing
    pump_clatter: snd(BUS_FX, PRIO_OTHER, 1.6, 0.3, (g, out, t, p) => {
      wobble(g, out, t, 0.4, 'sawtooth', 31 * p.pitch, 44 * p.pitch, 5, 0.3, 'bandpass', 700, 6, 0.3, 0.08, 0.15);
      for (let k = 0; k < PUMP_BEATS; k++) {
        if (k === PUMP_MISSING) continue;
        const at = t + 0.42 + k * PUMP_STEP;
        noise(g, out, at, 0.03, 'bandpass', 820, 700, 3, 0.4, 0.0008);
        tone(g, out, at, 0.05, 'triangle', 205, 150, 0.2, 0.001);
      }
    }, 30),
  };
}

export function worldSounds(): SoundTable {
  return {
    // ---- pickups
    pickup_packet: snd(BUS_FX, PRIO_OTHER, 0.3, 0.1, (g, out, t) => { ticks(g, out, t, 4, 0.12, 1, 'highpass', 3200, 0.8, 0.2, 0.02); tone(g, out, t + 0.14, 0.07, 'sine', seatHz(3), seatHz(3), 0.24, 0.001); tone(g, out, t + 0.2, 0.07, 'sine', seatHz(5), seatHz(5), 0.2, 0.001); }),
    pickup_tin: snd(BUS_FX, PRIO_OTHER, 0.3, 0.1, (g, out, t) => { noise(g, out, t, 0.12, 'bandpass', 2400, 2350, 9, 0.5, 0.0005); noise(g, out, t + 0.09, 0.14, 'bandpass', 2950, 2900, 9, 0.4, 0.0005); }),
    pickup_canteen: snd(BUS_FX, PRIO_OTHER, 0.5, 0.1, (g, out, t) => {
      const src = g.source(g.noise, true), bp = g.filter('bandpass', 600, 3), lfo = g.osc('sine', 4.5), dev = g.gain(260), amp = g.gain(0);
      lfo.connect(dev); dev.connect(bp.frequency);
      amp.gain.setValueAtTime(0, t); amp.gain.linearRampToValueAtTime(1.6, t + 0.06); amp.gain.linearRampToValueAtTime(0, t + 0.45);
      src.connect(bp); bp.connect(amp); amp.connect(out); src.start(t, g.noiseOffset()); lfo.start(t); src.stop(t + 0.46); lfo.stop(t + 0.46);
    }),

    // the listening lamps ticking as the ring starts to fill
    listen_lamps: snd(BUS_FX, PRIO_CONFIRM, 0.5, 0.2, (g, out, t) => { for (let k = 0; k < 3; k++) tone(g, out, t + k * 0.16, 0.06, 'sine', 900 + k * 90, 1400 + k * 90, 0.26, 0.003); }),

    // ---- sparse events of the ambience beds (seeded, far and small)
    amb_pebble: snd(BUS_AMB, PRIO_OTHER, 0.2, 0.5, (g, out, t, p) => { click(g, out, t, 2600 * p.pitch, 4, 0.14, 0.01); click(g, out, t + 0.07, 3100 * p.pitch, 4, 0.07, 0.008); click(g, out, t + 0.12, 3500 * p.pitch, 4, 0.035, 0.008); }),
    // a far pylon wire singing: a thin sine cluster
    amb_wire: snd(BUS_AMB, PRIO_OTHER, 3.2, 0.6, (g, out, t, p) => {
      const f = degree(7, 5) * p.pitch;
      toneHold(g, out, t, 3.2, 'sine', f, f * 1.004, 0.03, 1.2, 1.6); toneHold(g, out, t, 3.0, 'sine', f * 1.006, f * 1.002, 0.024, 1.4, 1.4); toneHold(g, out, t + 0.3, 2.6, 'sine', f * 1.498, f * 1.5, 0.014, 1.0, 1.4);
    }),
    amb_tin: snd(BUS_AMB, PRIO_OTHER, 0.4, 0.4, (g, out, t, p) => { noise(g, out, t, 0.1, 'bandpass', 1900 * p.pitch, 1850, 8, 0.2, 0.001); noise(g, out, t + 0.16, 0.12, 'bandpass', 1750 * p.pitch, 1700, 8, 0.12, 0.001); }),
    amb_shutter: snd(BUS_AMB, PRIO_OTHER, 0.3, 0.4, (g, out, t, p) => { tone(g, out, t, 0.05, 'triangle', 240 * p.pitch, 170, 0.16, 0.002); tone(g, out, t + 0.19, 0.05, 'triangle', 225 * p.pitch, 160, 0.1, 0.002); }),
    amb_cloth: snd(BUS_AMB, PRIO_OTHER, 0.5, 0.3, (g, out, t) => { noiseHold(g, out, t, 0.45, 'lowpass', 700, 380, 0.7, 0.08, 0.1, 0.25); noise(g, out, t + 0.2, 0.08, 'lowpass', 500, 250, 0.7, 0.1, 0.01); }),
    amb_wood: snd(BUS_AMB, PRIO_OTHER, 0.1, 0.4, (g, out, t, p) => { click(g, out, t, 520 * p.pitch, 3, 0.12, 0.016); }),
    amb_relay: snd(BUS_AMB, PRIO_OTHER, 0.15, 0.4, (g, out, t, p) => { click(g, out, t, 3200 * p.pitch, 5, 0.1, 0.008); click(g, out, t + 0.06, 2700 * p.pitch, 5, 0.07, 0.008); }),
    // a drip that is not water: a pitched click
    amb_drip: snd(BUS_AMB, PRIO_OTHER, 0.1, 0.6, (g, out, t, p) => { tone(g, out, t, 0.05, 'sine', degree(5, 5) * FLAT * p.pitch, degree(3, 5) * FLAT * p.pitch, 0.12, 0.001); }),
    // the flickering strip
    amb_buzz: snd(BUS_AMB, PRIO_OTHER, 0.7, 0.3, (g, out, t) => {
      const osc = g.osc('sawtooth', 98 * FLAT), bp = g.filter('bandpass', 1900, 1.2), amp = g.gain(0);
      amp.gain.setValueAtTime(0, t);
      for (let k = 0; k < 5; k++) { const at = t + k * 0.13 + (k % 2) * 0.03; amp.gain.setValueAtTime(0.07, at); amp.gain.setValueAtTime(0, at + 0.05 + (k % 3) * 0.02); }
      osc.connect(bp); bp.connect(amp); amp.connect(out); osc.start(t); osc.stop(t + 0.72);
    }),
    amb_coats: snd(BUS_AMB, PRIO_OTHER, 0.6, 0.4, (g, out, t) => { noiseHold(g, out, t, 0.6, 'bandpass', 900, 600, 0.8, 0.06, 0.2, 0.3); }),
    amb_dust: snd(BUS_AMB, PRIO_OTHER, 1.3, 0.2, (g, out, t) => { noiseHold(g, out, t, 1.3, 'highpass', 6000, 7000, 0.7, 0.025, 0.5, 0.6); }),
    amb_crackle: snd(BUS_AMB, PRIO_OTHER, 0.6, 0.2, (g, out, t) => { ticks(g, out, t, 5, 0.5, 1.3, 'highpass', 2800, 0.8, 0.09, 0.012); }),

    // ---- the two voices of the music
    // the wire (Karplus-Strong): a = degree, b = octave
    wire: snd(BUS_MUSIC, PRIO_OTHER, 2.8, 0.45, (g, out, t, p) => { wireNote(g, out, t, p.a < 1 ? 1 : p.a, p.b > 0 ? p.b : 3, 0.8, 2.8); }),
    wire_answer: snd(BUS_MUSIC, PRIO_OTHER, 2.8, 0.45, (g, out, t, p) => { wireNote(g, out, t, p.a < 1 ? 1 : p.a, p.b > 0 ? p.b : 3, 0.68, 2.8); }),
    // a low skin drum: a sine thump with a noise slap. a = accent 0..1
    drum: snd(BUS_COMBAT, PRIO_OTHER, 0.3, 0.3, (g, out, t, p) => {
      const k = 0.55 + 0.45 * p.a;
      tone(g, out, t, 0.26, 'sine', 96, 47, 0.9 * k, 0.002);
      noise(g, out, t, 0.035, 'bandpass', 1500, 800, 1, 0.3 * k, 0.0008);
      noise(g, out, t, 0.09, 'lowpass', 300, 120, 0.8, 0.3 * k, 0.002);
    }),
    // a bowed fifth swelling under the drum
    bow_fifth: snd(BUS_COMBAT, PRIO_OTHER, 5.0, 0.4, (g, out, t) => {
      const lp = g.filter('lowpass', 520, 1); lp.connect(out);
      toneHold(g, lp, t, 5.0, 'sawtooth', D2 * WIRE_OFF, D2 * WIRE_OFF, 0.16, 1.6, 2.4);
      toneHold(g, lp, t, 5.0, 'sawtooth', A2 * WIRE_OFF * 1.002, A2 * WIRE_OFF * 1.002, 0.12, 1.9, 2.4);
    }),
  };
}
