// The seventh (work order 4.6 and section 6): the hum stops, four seconds of true silence, then water far below and
// a hum that is in tune. Rendered through the whole engine in the bore with everything running.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { audioServer, cents, cue, degree, ev, fired, openBoard, renderScript } from './lib.mjs';

let server, game;
before(async () => { server = await audioServer(); game = await openBoard(server); });
after(async () => { await game.close(); await server.close(); });

const T = 10;                       // the shot
const SEQUENCE = [
  ev(0, 'boss/phase', { phase: 'p3a', from: 'p2' }),
  ev(T - 2, 'weapon/kept', { stage: 'loading', mark: 'pz_mark_1' }), ev(T - 2, 'boss/hush', { on: true }), ev(T - 2, 'boss/phase', { phase: 'hush', from: 'p3a' }),
  ev(T - 1, 'weapon/kept', { stage: 'chambered', mark: 'pz_mark_1' }),
  cue(T - 0.5, 'listen_tick', 0.5),
  ev(T, 'weapon/kept', { stage: 'fired', mark: 'pz_mark_1' }), ev(T, 'boss/hush', { on: false }), ev(T, 'boss/proven', { x: 14, y: -44, z: 96 }), ev(T, 'boss/phase', { phase: 'proven', from: 'hush' }),
  // every Bider alive sits: sounds asked for inside the silence are not heard
  ev(T + 0.5, 'enemy/freed', { x: 3, y: 0, z: -4, id: 'bider#1', encounter: 'enc_windlass', cause: 'kept', counted: true }),
  ev(T + 0.5, 'combat/hit', { x: 3, y: 0, z: -4, shotId: 9, order: 0, ammo: 'kept_round', outcome: 'freed', entityId: 'bider#1', entityKind: 'bider', part: 'body', surface: 'cloth', nx: 0, ny: 1, nz: 0, damage: 0, ricochetX: 0, ricochetY: 0, ricochetZ: 0 }),
  cue(T + 9, 'water_below'),
  ev(T + 12, 'boss/phase', { phase: 'p3b', from: 'proven' }),
];

test('after boss/proven the world is below -70 dB for 4.0 +- 0.1 s; before it the hum is flat, afterwards in tune', async () => {
  const D2 = 146.83 / 2, A2 = degree(5, 2);
  // everything but the kept tone's own bus
  const world = await renderScript(game, SEQUENCE, T + 26, { zone: 'the_bore', tap: 'nokept' }, [
    ['rmsDb', 3, T - 2], ['partial', 2, T - 2, 68, 78], ['partial', 2, T - 2, 104, 115],
    ['lastAbove', T, T + 1, -70], ['rmsDb', T + 0.14, T + 3.95], ['peakDb', T + 0.14, T + 3.95], ['firstAbove', T + 0.14, T + 9, -70],
    ['rmsDb', T + 4.3, T + 8.8], ['band', T + 4.3, T + 8.8, 68, 78],
    ['partial', T + 15, T + 26, 68, 78], ['partial', T + 15, T + 26, 104, 115], ['rmsDb', T + 15, T + 26], ['rmsDb', T - 1.8, T - 0.1],
  ]);
  const [before, d2Flat, a2Flat, cutEnds, silenceRms, silencePeak, back, airRms, airHum, d2After, a2After, afterRms, hushRms] = world.probes;
  assert.ok(Math.abs(cents(d2Flat, D2) + 20) <= 3 && Math.abs(cents(a2Flat, A2) + 20) <= 3, `before: the machine sings flat (${cents(d2Flat, D2).toFixed(1)}, ${cents(a2Flat, A2).toFixed(1)})`);
  assert.ok(hushRms < before - 6, `the hush: ambience ducks (${before.toFixed(1)} -> ${hushRms.toFixed(1)} dB)`);
  assert.ok(cutEnds - T <= 0.125, `the report is cut at 120 ms: ${cutEnds - T}`);
  assert.ok(silenceRms < -70 && silencePeak < -70, `true silence: RMS ${silenceRms} dB, peak ${silencePeak} dB`);
  assert.ok(Math.abs(back - T - 4) <= 0.1, `the silence lasts 4.0 +- 0.1 s: ${back - T}`);
  assert.ok(airRms > -70 && airRms < before - 6, `then air, and only air: ${airRms.toFixed(1)} dB (the bore before: ${before.toFixed(1)} dB)`);
  assert.ok(airHum < 0.05, `no hum between the silence and the water: ${airHum}`);
  assert.ok(Math.abs(cents(d2After, D2)) <= 3 && Math.abs(cents(a2After, A2)) <= 3, `afterwards the hum is in tune (${cents(d2After, D2).toFixed(2)}, ${cents(a2After, A2).toFixed(2)} cents)`);
  assert.ok(afterRms > airRms + 3, 'water and the clean hum have come up');
  assert.deepEqual(world.result.says.map((s) => s.key), ['cap_ratchet', 'cap_hum_stops', 'cap_bider_sits', 'cap_water_below']);
  assert.equal(world.result.says[1].tick, T * 60);
  const music = world.result.music.map((m) => `${m.state}:${m.intensity}@${m.tick}`);
  assert.deepEqual(music, ['boss:3@0', `silent:0@${(T - 2) * 60}`], 'the music stops at the hush and does not come back in the dry phase');

  // the whole output: what is left inside the silence is the kept tone alone, and after it, nothing
  const full = await renderScript(game, SEQUENCE, T + 6, { zone: 'the_bore' }, [
    ['band', T + 0.2, T + 3.3, 146.83 * 2 - 12, 146.83 * 2 + 12], ['band', T + 0.2, T + 3.3, 146.83 * 4 - 12, 146.83 * 4 + 12], ['peakDb', T + 3.52, T + 3.95], ['rmsDb', T + 0.2, T + 3.3],
  ]);
  const other = 10 * Math.log10(Math.max(1e-12, 1 - full.probes[0] - full.probes[1]));
  assert.ok(other < -60, `inside the silence only D4 and D5 sound: everything else ${other.toFixed(1)} dB under them`);
  assert.ok(full.probes[2] < -100, `between the end of the tone and the end of the silence: ${full.probes[2]} dB`);
  console.log(`seventh: hum before ${cents(d2Flat, D2).toFixed(2)} / ${cents(a2Flat, A2).toFixed(2)} cents; report cut at ${((cutEnds - T) * 1000).toFixed(0)} ms; silence RMS ${silenceRms} dB for ${(back - T).toFixed(3)} s; then air ${airRms.toFixed(1)} dB; hum after the water ${cents(d2After, D2).toFixed(2)} / ${cents(a2After, A2).toFixed(2)} cents; kept tone ${full.probes[3].toFixed(1)} dB with everything else ${other.toFixed(1)} dB under it`);
});

test('her own gun still speaks inside the silence, dry: no room answers', async () => {
  const script = [...SEQUENCE, fired(T + 2, 4)];
  const gun = await renderScript(game, script, T + 6, { zone: 'the_bore', tap: 'nokept' }, [['peak', T + 2, T + 2.3], ['peakDb', T + 2.5, T + 3.9]]);
  assert.ok(gun.probes[0] > 0.5, `the report is heard: ${gun.probes[0]}`);
  assert.ok(gun.probes[1] < -70, `and nothing answers it: ${gun.probes[1]} dB`);
});

test('phase 3b: the enormous dry clicks, the six chambers ascending, the run-down at the kill', async () => {
  const script = [ev(0, 'boss/phase', { phase: 'p3b', from: 'proven' })];
  for (let k = 0; k < 4; k++) script.push(ev(1 + k * 1.1, 'boss/discharge', { kind: 'dry', mouth: 1, glowSeconds: 0, parryable: false }));
  for (let k = 0; k < 6; k++) script.push(ev(6 + k, 'boss/mouth', { mouth: 6 - k, state: 'dark' }));
  script.push(ev(12.5, 'boss/defeated', { cleanSix: true }), ev(12.5, 'boss/phase', { phase: 'dead', from: 'p3b' }));
  const probes = [['peak', 1, 1.3], ['peak', 0.2, 0.9]];
  for (let k = 0; k < 6; k++) probes.push(['partial', 6 + k + 0.01, 6 + k + 0.25, degree(k + 1, 3) * 0.94, degree(k + 1, 3) * 1.06]);
  const r = await renderScript(game, script, 16, { zone: 'the_bore' }, probes);
  assert.ok(r.probes[0] > 0.3 && r.probes[0] > r.probes[1] * 2.5, `the dry click is enormous: ${r.probes[0]} over ${r.probes[1]}`);
  // Heard in the bore: the room's dense response weighs the two halves of the beating pair differently, so a
  // spectral estimate of the note moves by up to 25 cents either way (measured, and 14 cents outdoors; dry it is
  // within 0.2 cents: tuning.test.mjs). The degree is unmistakable: its neighbours are 100 cents or more away.
  for (let k = 0; k < 6; k++) assert.ok(Math.abs(cents(r.probes[2 + k], degree(k + 1, 3))) <= 35, `hit ${k + 1} sounds degree ${k + 1} whatever mouth it was: ${r.probes[2 + k]}`);
  assert.equal(r.result.says.filter((s) => s.key === 'cap_dry_click').length, 3);
  assert.equal(r.result.says.at(-1).key, 'cap_ratchet');
  assert.ok(r.result.recent.some((s) => s.name === 'run_down' && s.tick === 750));
  assert.equal(r.result.music.at(-1).state, 'calm');
  console.log(`seventh: dry click peak ${r.probes[0].toFixed(3)}; six chambers ${r.probes.slice(2).map((f) => f.toFixed(1)).join(', ')} Hz`);
});
