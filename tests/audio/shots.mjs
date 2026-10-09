// Evidence for shots/code-audio (work order section 7.2): spectrograms rendered from offline buffers by the real
// engine, each with its waveform, axes and the numbers that matter. Run: node tests/audio/shots.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../harness.mjs';
import { audioServer, cue, ev, fired, hit, openBoard } from './lib.mjs';

// AUDIO_SHOT_DIR (a folder under shots/) and AUDIO_SHOT_ONLY (comma-separated names) narrow a run to a few pictures elsewhere
const OUT = path.join(ROOT, 'shots', process.env.AUDIO_SHOT_DIR || 'code-audio');
const ONLY = process.env.AUDIO_SHOT_ONLY ? process.env.AUDIO_SHOT_ONLY.split(',') : null;
fs.mkdirSync(OUT, { recursive: true });
const keptSeq = (T) => [
  ev(0, 'boss/phase', { phase: 'p3a', from: 'p2' }),
  ev(T - 2, 'weapon/kept', { stage: 'loading', mark: 'm' }), ev(T - 2, 'boss/hush', { on: true }),
  ev(T, 'weapon/kept', { stage: 'fired', mark: 'm' }), ev(T, 'boss/hush', { on: false }), ev(T, 'boss/proven', { x: 0, y: 0, z: 0 }), ev(T, 'boss/phase', { phase: 'proven', from: 'hush' }),
  cue(T + 7, 'water_below'),
];
const station = 'LIFT STATION 4. SURFACE POWER: WIND. THANK YOU FOR YOUR PATIENCE.';
const SHOTS = [
  ...['the_lip', 'tally_house', 'the_gallery', 'lift_hall', 'the_bore'].map((zone) => ({ name: 'report_' + zone, title: `the report (chambers left 4) in ${zone}`, script: [fired(0.3, 4)], seconds: 3.6, opts: { zone, quiet: true }, fHi: 16000 })),
  { name: 'report_last_round', title: 'the last round of a cylinder (chambers left 0): brighter mechanics, drier tail; the_lip', script: [fired(0.3, 0)], seconds: 3.6, opts: { zone: 'the_lip', quiet: true } },
  { name: 'report_close', title: 'one report, first 400 ms, dry: crack, body, boom 150 -> 50 Hz, hammer, cock (142 ms), ratchet (262 ms)', script: [fired(0.05, 4)], seconds: 0.45, opts: { zone: 'the_lip', quiet: true, tap: 'gun' }, fLo: 30 },
  { name: 'reload', title: 'reload from empty: gate, six seat-clicks rising a semitone each, gate close (2.45 s)', script: [ev(0.2, 'weapon/reload', { stage: 'open', chambered: 0, reserve: 20 }), ...[1, 2, 3, 4, 5, 6].map((c) => ev(0.55 + (c - 1) * 0.3, 'weapon/reload', { stage: 'round', chambered: c, reserve: 20 - c })), ev(2.35, 'weapon/reload', { stage: 'close', chambered: 6, reserve: 14 })], seconds: 3, opts: { zone: 'tally_house', quiet: true } },
  { name: 'jug_scale', title: 'the seven jugs, D Dorian from D4: D E F G A B C ... and the seventh left hanging', script: [1, 2, 3, 4, 5, 6, 7].map((d) => ev(0.2 + (d - 1) * 0.5, 'shootable/hit', { x: 0, y: 1, z: -10, id: 'ia_jug_' + d, kind: 'jug', scaleDegree: d, ammo: 'lead_round' })), seconds: 4.2, opts: { zone: 'the_lip', quiet: true }, fLo: 60, fHi: 8000 },
  { name: 'knot_burst', title: 'a knot: the bell voice falling a fourth over 0.4 s, and a wet pop', script: [ev(0.2, 'knot/burst', { x: 0, y: 1, z: -6, id: 'knot_a', onMechanism: true, regrows: true })], seconds: 1.6, opts: { zone: 'the_gallery', quiet: true }, fLo: 60, fHi: 8000 },
  { name: 'transit_tell', title: 'the Transit\'s tell: a sine 400 -> 1600 Hz over 0.9 s, then the stake (whirr)', script: [ev(0.2, 'enemy/telegraph', { x: 6, y: 0, z: -18, id: 'transit#1', kind: 'transit', attack: 'aim', seconds: 0.9 }), ev(1.1, 'projectile/spawned', { x: 6, y: 1.5, z: -18, id: 's', kind: 'stake', source: 'transit' })], seconds: 2.2, opts: { zone: 'plenty_street', quiet: true }, fLo: 60, fHi: 8000 },
  { name: 'tamper_howl', title: 'the Tamper\'s charge tell: a saw falling 300 -> 80 Hz over 0.8 s; then its slam tell (hiss) and slam', script: [ev(0.2, 'enemy/telegraph', { x: -4, y: 0, z: -14, id: 'tamper#1', kind: 'tamper', attack: 'charge', seconds: 0.8 }), ev(1.6, 'enemy/telegraph', { x: -2, y: 0, z: -4, id: 'tamper#1', kind: 'tamper', attack: 'slam', seconds: 1.0 }), ev(2.6, 'enemy/attack', { x: -2, y: 0, z: -4, id: 'tamper#1', kind: 'tamper', attack: 'slam' })], seconds: 3.8, opts: { zone: 'lift_hall', quiet: true }, fLo: 30, fHi: 16000 },
  { name: 'station_line', title: `the station: a chime in the flat tuning, then one blip per word: "${station}"`, script: [ev(0.2, 'story/line', { key: 'stn_yard_wake', speaker: 'station', text: station, seconds: 5.5 })], seconds: 6, opts: { zone: 'plenty_street', quiet: true }, fLo: 100, fHi: 8000 },
  { name: 'kept_round', title: 'the seventh, the whole output in the bore: the hush, the report cut at 120 ms, D4 + D5 pure for 3.5 s, then true silence to 4 s, air, water', script: keptSeq(3), seconds: 14, opts: { zone: 'the_bore' }, fLo: 40, fHi: 8000 },
  { name: 'kept_round_world', title: 'the same, without the kept tone\'s own bus: everything else stops dead for 4.0 s after boss/proven (t = 3 s)', script: keptSeq(3), seconds: 14, opts: { zone: 'the_bore', tap: 'nokept' }, fLo: 40, fHi: 8000 },
  { name: 'confirms_after_report', title: 'four shots in the hall: a miss, a hit (tick at +190 ms), a weak point (tink), a kill (thud at +190 ms)', script: [fired(0.2, 5), fired(1.0, 4), hit(1.0, 'hit', 'none', 'bider'), fired(1.8, 3), hit(1.8, 'weak', 'none', 'transit'), fired(2.6, 2), hit(2.6, 'kill', 'none', 'bider')], seconds: 3.6, opts: { zone: 'lift_hall', quiet: true }, fLo: 40, fHi: 12000 },
  { name: 'parry_bore', title: 'a shot parried in the bore, first 600 ms: report, cock, the sour note at 190 ms (1480 -> 990 Hz) over a room 10 dB back', script: [fired(0.02, 4), hit(0.02, 'parried', 'none', 'windlass')], seconds: 0.62, opts: { zone: 'the_bore', quiet: true }, fLo: 30, fHi: 12000 },
  { name: 'miss_bore', title: 'the same shot in the bore with no confirm (a miss): the tail is not touched', script: [fired(0.02, 4)], seconds: 0.62, opts: { zone: 'the_bore', quiet: true }, fLo: 30, fHi: 12000 },
  { name: 'confirm_close', title: 'one shot and its kill-confirm tick, first 450 ms, dry: report, cock, tick and thud at 190 ms (1.9 kHz over 100 Hz)', script: [fired(0.02, 4), hit(0.02, 'hit', 'none', 'bider'), hit(0.02, 'kill', 'none', 'bider')], seconds: 0.47, opts: { zone: 'the_lip', quiet: true }, fLo: 30, fHi: 12000 },
  { name: 'steps_street', title: 'plenty_street, bed running: four walk steps on sand, four sprint steps, a jump and a landing', script: [...[0, 1, 2, 3].map((k) => ev(1 + k * 0.5, 'player/footstep', { x: 0, y: 0, z: 0, surface: 'sand', sprint: false })), ...[0, 1, 2, 3].map((k) => ev(3.2 + k * 0.33, 'player/footstep', { x: 0, y: 0, z: 0, surface: 'sand', sprint: true })), ev(4.8, 'player/jumped', { x: 0, y: 0, z: 0 }), ev(5.4, 'player/landed', { x: 0, y: 0, z: 0, speed: 6, surface: 'sand' })], seconds: 6.2, opts: { zone: 'plenty_street', seed: 3 }, fLo: 40, fHi: 12000 },
  { name: 'steps_bore', title: 'the_bore, hum and breath running: four walk steps on metal, four sprint steps, a jump and a landing', script: [...[0, 1, 2, 3].map((k) => ev(1 + k * 0.5, 'player/footstep', { x: 0, y: 0, z: 0, surface: 'metal', sprint: false })), ...[0, 1, 2, 3].map((k) => ev(3.2 + k * 0.33, 'player/footstep', { x: 0, y: 0, z: 0, surface: 'metal', sprint: true })), ev(4.8, 'player/jumped', { x: 0, y: 0, z: 0 }), ev(5.4, 'player/landed', { x: 0, y: 0, z: 0, speed: 6, surface: 'metal' })], seconds: 6.2, opts: { zone: 'the_bore', seed: 3 }, fLo: 40, fHi: 12000 },
  { name: 'respawn_cut', title: 'the bore: a haul, a station line and a howl at 1 s; death at 2.2 s (low-pass); respawn at 3.6 s: the old life is let go', script: [ev(1, 'boss/haul', { on: true, seconds: 8 }), ev(1, 'story/line', { key: 's', speaker: 'station', text: 'THANK YOU FOR YOUR PATIENCE. THE LINE IS HELD. PLEASE REMAIN WHERE YOU ARE.', seconds: 8 }), ev(1, 'enemy/telegraph', { x: 0, y: 0, z: -6, id: 'tamper#1', kind: 'tamper', attack: 'charge', seconds: 3 }), ev(2.2, 'player/died', { kind: 'slam', source: 'tamper' }), ev(2.2, 'game/state', { from: 'playing', to: 'dead', reason: '' }), ev(3.6, 'game/state', { from: 'dead', to: 'playing', reason: '' }), ev(3.6, 'player/respawned', { checkpoint: 'cp_bore' })], seconds: 6.5, opts: { zone: 'the_bore', seed: 5 }, fLo: 40, fHi: 8000 },
  // pass i4: being hit says what struck her; the confirms in the open
  { name: 'hurt_kinds', title: 'being hit, 22 HP, dry: a fall (plain) / a stake (rod rings at 2.5 kHz) / a lunge (two tears) / a slam (second blow) / a canister (hiss)', script: [['kill_volume', 'world'], ['stake', 'transit'], ['lunge', 'bider'], ['slam', 'tamper'], ['canister', 'windlass']].map(([kind, source], k) => ev(0.2 + k * 0.6, 'player/damaged', { amount: 22, health: 50, kind, source, fromX: 0, fromY: 1.2, fromZ: -6, graceUsed: false })), seconds: 3.2, opts: { zone: 'the_lip', quiet: true }, fLo: 30, fHi: 16000 },
  { name: 'confirm_street', title: 'four shots in the street, wind and music on: a miss, a hit (tick at +190 ms), a weak point (tink), the Tamper\'s plate (ring at 960 Hz)', script: [fired(0.2, 5), fired(1.0, 4), hit(1.0, 'hit', 'none', 'bider'), fired(1.8, 3), hit(1.8, 'weak', 'none', 'transit'), fired(2.6, 2), hit(2.6, 'deflected', 'none', 'tamper')], seconds: 3.6, opts: { zone: 'plenty_street' }, fLo: 40, fHi: 12000 },
  { name: 'hum_flat', title: 'the station hum in the gallery: D2 and A2, 20 cents flat, beating (ambience bus)', script: [], seconds: 10, opts: { zone: 'the_gallery', tap: 'ambience' }, fLo: 40, fHi: 1000, spectrum: [60, 125] },
  { name: 'hum_tuned', title: 'the hum after the water: D2 and A2 exactly in tune, no beating (ambience bus, the bore)', script: [ev(0, 'boss/phase', { phase: 'p3b', from: 'idle' })], seconds: 10, opts: { zone: 'the_bore', tap: 'ambience' }, fLo: 40, fHi: 1000, spectrum: [60, 125] },
];

const server = await audioServer();
const game = await openBoard(server, { viewport: { width: 1000, height: 600 } });
try {
  for (const s of SHOTS) {
    if (ONLY && !ONLY.includes(s.name)) continue;
    const url = await game.page.evaluate(async (shot) => {
      const a = window.__dbg.ext.audio;
      const r = await a.renderScript(shot.script, shot.seconds, shot.opts);
      const W = 960, H = 540, L = 56, R = 12, top = 34, waveH = 70, specTop = top + waveH + 8, specH = 360;
      const fLo = shot.fLo ?? 40, fHi = shot.fHi ?? 16000, w = W - L - R;
      const spec = Uint8Array.from(atob(a.spectrogram(w, specH, fLo, fHi, -90)), (c) => c.charCodeAt(0));
      const pcmInfo = a.pcm(), bytes = Uint8Array.from(atob(pcmInfo.data), (c) => c.charCodeAt(0)), x = new Float32Array(bytes.buffer);
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const g = cv.getContext('2d');
      g.fillStyle = '#0b0d12'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#e9e2d0'; g.font = '13px monospace'; g.fillText(shot.title.slice(0, 128), 8, 20);
      // waveform (peak per column)
      g.strokeStyle = '#7cf2e2'; g.beginPath();
      for (let c = 0; c < w; c++) {
        const a0 = Math.floor(c * x.length / w), a1 = Math.floor((c + 1) * x.length / w);
        let mn = 0, mx = 0; for (let i = a0; i < a1; i++) { if (x[i] < mn) mn = x[i]; if (x[i] > mx) mx = x[i]; }
        g.moveTo(L + c + 0.5, top + waveH / 2 - mx * waveH / 2); g.lineTo(L + c + 0.5, top + waveH / 2 - mn * waveH / 2 + 0.5);
      }
      g.stroke();
      g.fillStyle = '#5a4d40'; g.fillRect(L, top + waveH / 2, w, 1);
      // spectrogram: magma-ish ramp
      const img = g.createImageData(w, specH);
      for (let i = 0; i < spec.length; i++) {
        const v = spec[i] / 255, r = Math.min(255, 255 * Math.min(1, v * 1.6)), gg = Math.min(255, 255 * Math.max(0, v * 1.8 - 0.75)), b = Math.min(255, 255 * (v < 0.45 ? v * 1.6 : Math.max(0, 1.6 - v * 1.6)));
        img.data[i * 4] = r; img.data[i * 4 + 1] = gg; img.data[i * 4 + 2] = Math.max(b, 16); img.data[i * 4 + 3] = 255;
      }
      g.putImageData(img, L, specTop);
      // axes
      g.fillStyle = '#c9a56b'; g.font = '11px monospace';
      for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
        if (f < fLo || f > fHi) continue;
        const y = specTop + specH - specH * Math.log(f / fLo) / Math.log(fHi / fLo);
        g.fillRect(L - 4, y, 4, 1); g.fillText(f >= 1000 ? f / 1000 + 'k' : String(f), 8, y + 4);
      }
      const step = shot.seconds <= 1 ? 0.05 : shot.seconds <= 4 ? 0.25 : 1;
      for (let t = 0; t <= shot.seconds + 1e-9; t += step) { const xx = L + w * t / shot.seconds; g.fillRect(xx, specTop + specH, 1, 4); g.fillText((step < 0.1 ? (t * 1000).toFixed(0) + 'ms' : t.toFixed(2).replace(/0$/, '')), xx - 10, specTop + specH + 16); }
      g.fillText('Hz', 8, specTop - 2); g.fillText('s', W - 10, specTop + specH + 16);
      let note = `peak ${r.peak.toFixed(3)}  RMS ${(20 * Math.log10(r.rms + 1e-12)).toFixed(1)} dBFS  voices ${r.voicePeak}  sounds: ${[...new Set(r.recent.map((q) => q.name))].join(' ')}`;
      if (shot.spectrum) {
        const [d2, a2] = a.probe([['partial', 2, shot.seconds, 68, 78], ['partial', 2, shot.seconds, 104, 115]]);
        note = `D2 ${d2.toFixed(3)} Hz (${(1200 * Math.log2(d2 / 73.415)).toFixed(2)} cents)  A2 ${a2.toFixed(3)} Hz (${(1200 * Math.log2(a2 / 109.997)).toFixed(2)} cents)   ` + note;
      }
      g.fillStyle = '#e9e2d0'; g.fillText(note.slice(0, 150), 8, H - 8);
      return cv.toDataURL('image/png');
    }, s);
    const file = path.join(OUT, s.name + '.png');
    fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
    console.log('wrote', path.relative(ROOT, file));
  }
  if (ONLY) { await game.close(); await server.close(); process.exit(0); }
  await game.page.click('#status');
  await game.page.evaluate(() => { document.querySelector('[data-b="kept:sequence"]').click(); });
  for (let k = 0; k < 40; k++) { await game.step(10, true); await new Promise((r) => setTimeout(r, 30)); }
  await game.page.setViewportSize({ width: 1400, height: 1000 });
  console.log('wrote', path.relative(ROOT, await game.shot('sound_board')));
  await game.close();
} catch (err) { console.error(err); try { await game.browser.close(); } catch { /* closed */ } process.exitCode = 1; } finally { await server.close(); }
