// Shared by the audio browser tests: one dev server serving src/audio (core stand-ins in the other five slots), the
// sound board page for offline renders, and the payloads of the events the tests send.
import { openGame, startServer } from '../harness.mjs';

export const PIECE = 'code-audio';
export const D3 = 146.83;
export const cents = (f, ref) => 1200 * Math.log2(f / ref);
/** frequency of scale degree n (1 = D) of D Dorian in an octave (3 = from D3) */
export const degree = (n, octave = 3) => D3 * 2 ** (([0, 2, 3, 5, 7, 9, 10][(n - 1) % 7] + 12 * Math.floor((n - 1) / 7) + 12 * (octave - 3)) / 12);

export const audioServer = () => startServer({ pieces: ['audio'] });
/** the sound board, not started by the harness (its scene starts the run itself) */
export const openBoard = (server, options = {}) => openGame(server, { page: 'sandbox/audio', piece: PIECE, start: false, ...options });
/** the game's index page: src/audio in its slot, core stubs in the other five */
export const openIndex = (server, options = {}) => openGame(server, { piece: PIECE, checkpoint: 'cp_street_clear', ...options });

export const fired = (t, chambersLeft = 5, ammo = 'lead_round') => ({ t, ev: 'weapon/fired', p: { shotId: 1, ammo, chambersLeft, ox: 0, oy: 1.65, oz: 0, dx: 0, dy: 0, dz: -1, mx: 0, my: 1.5, mz: 0, endX: 0, endY: 1, endZ: -40 } });
export const hit = (t, outcome = 'impact', surface = 'adobe', entityKind = 'world') => ({ t, ev: 'combat/hit', p: { x: 0, y: 1, z: -12, shotId: 1, order: 0, ammo: 'lead_round', outcome, entityId: '', entityKind, part: 'body', surface, nx: 0, ny: 1, nz: 0, damage: 0, ricochetX: 0, ricochetY: 0, ricochetZ: 0 } });
export const cue = (t, name, gain = 1, pitch = 1) => ({ t, ev: 'audio/cue', p: { cue: name, x: 0, y: 0, z: 0, positional: false, gain, pitch } });
export const ev = (t, name, p = {}) => ({ t, ev: name, p });

/** ext.audio.render(name, params) and a list of probes on the result, in one round trip -> { stats, probes } */
export function render(game, name, params = {}, probes = []) {
  return game.page.evaluate(async ([n, p, ops]) => {
    const a = window.__dbg.ext.audio;
    const stats = await a.render(n, p);
    return { stats, probes: ops.length ? a.probe(ops) : [] };
  }, [name, params, probes]);
}
/** ext.audio.renderScript(script, seconds, options) and probes -> { result, probes } */
export function renderScript(game, script, seconds, options = {}, probes = []) {
  return game.page.evaluate(async ([s, secs, o, ops]) => {
    const a = window.__dbg.ext.audio;
    const result = await a.renderScript(s, secs, o);
    return { result, probes: ops.length ? a.probe(ops) : [] };
  }, [script, seconds, options, probes]);
}
/** the last render as a Float32Array (mono mix, 48 kHz) */
export async function pcm(game) {
  const r = await game.page.evaluate(() => window.__dbg.ext.audio.pcm());
  const bytes = Buffer.from(r.data, 'base64');
  return { sampleRate: r.sampleRate, data: new Float32Array(bytes.buffer, bytes.byteOffset, r.length) };
}
/** RMS of a span, linear */
export function rms(x, sr, t0, t1) {
  const a = Math.max(0, Math.round(t0 * sr)), b = Math.min(x.length, Math.round(t1 * sr));
  let s = 0;
  for (let i = a; i < b; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, b - a));
}
export const db = (v) => (v <= 1e-12 ? -240 : 20 * Math.log10(v));
/** the last render as { sr, x } with x a copy that can be filtered */
export async function grab(game) { const r = await pcm(game); return { sr: r.sampleRate, x: Float32Array.from(r.data) }; }
/** a band-pass (RBJ biquad, constant 0 dB peak gain) round `f` with quality `q` */
export function bandpass(x, sr, f, q) {
  const w = 2 * Math.PI * f / sr, al = Math.sin(w) / (2 * q), a0 = 1 + al;
  const b0 = al / a0, b2 = -al / a0, a1 = -2 * Math.cos(w) / a0, a2 = (1 - al) / a0;
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = b0 * x[i] + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
  return y;
}
/** RMS of a span, dB */
export const rmsDb = (x, sr, t0, t1) => db(rms(x, sr, t0, t1));
/** RMS of each consecutive window of `w` seconds, dB */
export function windowsDb(x, sr, w = 0.05) {
  const n = Math.round(w * sr), out = [];
  for (let i = 0; i + n <= x.length; i += n) { let s = 0; for (let j = i; j < i + n; j++) s += x[j] * x[j]; out.push(10 * Math.log10(s / n + 1e-24)); }
  return out;
}
export const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(0.5 * (s.length - 1))]; };
export const OCTAVES = [125, 250, 500, 1000, 2000, 4000, 8000];

/**
 * Closes a game whose AudioContext really ran. On a starved shared machine Chromium's own audio sink can fail, and the
 * browser says so on the console ("The AudioContext encountered an error from the audio device or the WebAudio
 * renderer"): that line is the machine's, not the game's, and it alone is forgiven. Everything else still fails.
 */
export async function closeLive(game) {
  const DEVICE = /AudioContext encountered an error from the audio device/;
  let hookError = null;
  try { hookError = await game.page.evaluate(() => (window.__dbg ? window.__dbg.error : 'window.__dbg is missing')); } catch { /* the page is gone */ }
  const errors = game.consoleErrors.filter((e) => !DEVICE.test(e));
  const forgiven = game.consoleErrors.length - errors.length;
  game.allowErrors = true;
  await game.close();
  if (hookError) throw new Error('__dbg.error: ' + hookError);
  if (errors.length) throw new Error('console.error: ' + errors.slice(0, 5).join('\n'));
  if (forgiven) console.log(`(the browser's audio device failed ${forgiven} time(s) on this machine: forgiven)`);
}
