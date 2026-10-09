// The mix (fix round after the critic): the gun is the loudest thing on a laptop speaker, the pre-rendered takes are
// the recipes, the room answers a shot over the bed, the wind carries the outdoor air, and the pause holds the kept tone.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { OCTAVES, audioServer, bandpass, ev, fired, grab, median, openBoard, pcm, render, renderScript, rmsDb, windowsDb } from './lib.mjs';

let server, game;
before(async () => { server = await audioServer(); game = await openBoard(server); });
after(async () => { await game.close(); await server.close(); });

// ---- a laptop speaker (nothing much under 200 Hz: two 12 dB/oct Butterworth high-passes) and BS.1770 K-weighting
function biquad(x, b0, b1, b2, a1, a2) {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
  return y;
}
function highpass(x, sr, f) {
  const w = 2 * Math.PI * f / sr, c = Math.cos(w), al = Math.sin(w) / (2 * Math.SQRT1_2), a0 = 1 + al;
  return biquad(x, (1 + c) / 2 / a0, -(1 + c) / a0, (1 + c) / 2 / a0, -2 * c / a0, (1 - al) / a0);
}
const laptop = (x, sr) => highpass(highpass(x, sr, 200), sr, 200);
// K-weighting coefficients are for 48 kHz, the render rate
const kweight = (x) => biquad(biquad(x, 1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585), 1.0, -2.0, 1.0, -1.99004745483398, 0.99007225036621);
/** loudest 50 ms, dB RMS */
function max50(x, sr) {
  const n = Math.round(0.05 * sr);
  let s = 0, best = 0;
  for (let i = 0; i < x.length; i++) { s += x[i] * x[i]; if (i >= n) s -= x[i - n] * x[i - n]; if (i >= n - 1 && s > best) best = s; }
  return 10 * Math.log10(best / n + 1e-24);
}

test('the gun is the loudest thing in the world on a laptop speaker too: 6 dB over every other sound through a 200 Hz high-pass', async () => {
  // the loud sounds of the game, each at its own default level, dry
  const others = [['kept_tone', {}], ['transit_tone', {}], ['lens_bell', {}], ['jug', { a: 3 }], ['station_line', { text: 'THANK YOU FOR YOUR PATIENCE.', seconds: 3 }],
    ['tamper_howl', {}], ['tamper_slam', {}], ['wire', { a: 5, b: 3 }], ['gate_bang', {}], ['shutter_bang', {}], ['dry_click_big', {}], ['bider_rattle', {}],
    ['canister_thump', {}], ['drum', { a: 1 }], ['hurt', { a: 30 }], ['hurt', { a: 38, b: 1 }], ['hurt', { a: 38, b: 2 }], ['hurt', { a: 38, b: 3 }], ['hurt', { a: 38, b: 4 }], ['hit_kill', {}], ['dry_fire', {}]];
  const measure = async (name, params) => {
    await render(game, name, params);
    const { sampleRate: sr, data } = await pcm(game);
    const x = Float32Array.from(data);
    return { laptop: max50(laptop(x, sr), sr), k: max50(kweight(x), sr) };
  };
  const gun = await measure('gun_report', { a: 4 });
  const last = await measure('gun_report', { a: 1 });
  const rows = [];
  for (const [name, params] of others) rows.push([name, await measure(name, params)]);
  rows.sort((a, b) => b[1].laptop - a[1].laptop);
  for (const [name, m] of rows) {
    assert.ok(gun.laptop >= m.laptop + 6, `laptop: the report ${gun.laptop.toFixed(1)} dB, ${name} ${m.laptop.toFixed(1)} dB`);
    assert.ok(last.laptop >= m.laptop + 6, `laptop: the last-round report ${last.laptop.toFixed(1)} dB, ${name} ${m.laptop.toFixed(1)} dB`);
    assert.ok(gun.k > m.k, `full range (K-weighted): the report ${gun.k.toFixed(1)} dB, ${name} ${m.k.toFixed(1)} dB`);
  }
  // where its energy is: the 150-600 Hz chest and the 600-2500 Hz body now carry it on a small speaker
  const bands = await render(game, 'gun_report', { a: 4 }, [['band', 0, 0.2, 20, 150], ['band', 0, 0.2, 150, 600], ['band', 0, 0.2, 600, 2500], ['band', 0, 0.2, 2500, 24000], ['centroid', 0, 0.2]]);
  const [low, chest, body, top, centroid] = bands.probes;
  assert.ok(body > 0.1, `600-2500 Hz share ${body}`);
  assert.ok(centroid > 250, `spectral centroid ${centroid} Hz (it was 89 Hz: a decaying sine with a click)`);
  console.log(`mix: report loudest 50 ms through a 200 Hz high-pass ${gun.laptop.toFixed(1)} dB (last rounds ${last.laptop.toFixed(1)}), K-weighted ${gun.k.toFixed(1)} dB; next ${rows.slice(0, 3).map(([n, m]) => `${n} ${m.laptop.toFixed(1)} / ${m.k.toFixed(1)}`).join(', ')}; energy 20-150 / 150-600 / 600-2500 / 2500+ Hz: ${[low, chest, body, top].map((v) => (v * 100).toFixed(1) + ' %').join(' / ')}, centroid ${centroid.toFixed(0)} Hz`);
});

test('the pre-rendered takes are the recipes: same level, same spectrum, sample 0 on the tick', async () => {
  const ops = [['peakDb', 0, 0.4], ['rmsDb', 0, 0.12], ['rmsDb', 0.12, 0.35], ['centroid', 0, 0.2], ['band', 0, 0.003, 2000, 24000], ['sample', 0]];
  for (const [name, params] of [['gun_report', { a: 4 }], ['gun_report', { a: 1 }], ['impact_metal', {}], ['hit_kill', { a: 0.006 }], ['hit_tick', { a: 0.006 }], ['tamper_clank', {}], ['step_wood', { a: 1 }]]) {
    const take = await render(game, name, params, ops);
    const recipe = await render(game, name, { ...params, baked: false }, ops);
    const [tp, tr, tt, tc] = take.probes, [rp, rr, rt, rc] = recipe.probes;
    // the noise is another window of the same noise in a take, so a noisy sound's peak may differ by a few dB; its RMS may not
    const tol = name === 'gun_report' ? 1.5 : 2.5;
    assert.ok(Math.abs(tp - rp) < 3.5 && Math.abs(tr - rr) < tol, `${name} ${JSON.stringify(params)}: peak ${tp.toFixed(1)} / ${rp.toFixed(1)} dB, RMS ${tr.toFixed(1)} / ${rr.toFixed(1)} dB`);
    if (rt > -60) assert.ok(Math.abs(tt - rt) < tol + 0.5, `${name}: late RMS ${tt.toFixed(1)} / ${rt.toFixed(1)} dB`);
    assert.ok(Math.abs(tc / rc - 1) < (name === 'gun_report' ? 0.1 : 0.25), `${name}: centroid ${tc.toFixed(0)} / ${rc.toFixed(0)} Hz`);
    if (name === 'gun_report') {
      assert.equal(take.stats.firstSample, 0, 'the take starts on its first sample: the crack leaves on the tick');
      assert.ok(take.probes[4] > 0.5, `crack above 2 kHz in the first 3 ms: ${take.probes[4]}`);
    }
  }
  // a whole fight scripted: the takes build 3 nodes a shot; the recipes about 50
  const script = [];
  for (let k = 0; k < 12; k++) script.push(fired(0.5 + k * 0.5, 5 - (k % 6)), { t: 0.5 + k * 0.5, ev: 'combat/hit', p: { x: 0, y: 1, z: -12, shotId: k, order: 0, ammo: 'lead_round', outcome: k % 2 ? 'kill' : 'impact', entityId: '', entityKind: 'world', part: 'body', surface: 'adobe', nx: 0, ny: 1, nz: 0, damage: 0, ricochetX: 0, ricochetY: 0, ricochetZ: 0 } });
  const baked = await renderScript(game, script, 7, { zone: 'the_lip', quiet: true }, [['rmsDb', 0.4, 6.5]]);
  const live = await renderScript(game, script, 7, { zone: 'the_lip', quiet: true, baked: false }, [['rmsDb', 0.4, 6.5]]);
  assert.ok(Math.abs(baked.probes[0] - live.probes[0]) < 1.5, `the fight's RMS ${baked.probes[0].toFixed(1)} / ${live.probes[0].toFixed(1)} dB`);
  assert.deepEqual(baked.result.recent.map((r) => r.name), live.result.recent.map((r) => r.name));
  assert.ok(baked.result.nodes < live.result.nodes / 4, `nodes: takes ${baked.result.nodes}, recipes ${live.result.nodes}`);
  console.log(`mix: takes against recipes within 1.5 dB; 12 shots and hits build ${baked.result.nodes} nodes from takes, ${live.result.nodes} from recipes (the graph itself included)`);
});

test('the room answers the shot over the bed outdoors and in the gallery; outdoors the wind, not the drone, carries the air', async () => {
  const rows = {};
  for (const zone of ['the_lip', 'plenty_street', 'the_gallery']) {
    const r = await renderScript(game, [fired(6, 4)], 8, { zone, seed: 4 }, [['rmsDb', 2, 5.9], ['rmsDb', 6.3, 6.6]]);
    const [bed, answer] = r.probes;
    rows[zone] = { bed: +bed.toFixed(1), answer: +answer.toFixed(1) };
    assert.ok(answer > bed + 3, `${zone}: 0.3-0.6 s after the shot ${answer.toFixed(1)} dB over a bed of ${bed.toFixed(1)} dB`);
  }
  for (const zone of ['the_lip', 'plenty_street', 'far_rim']) {
    // 3-7.9 s: the wire's first figure comes 8 s or more after calm begins, so the music bus is the drone alone
    const amb = await renderScript(game, [], 8, { zone, tap: 'ambience', seed: 2 }, [['rmsDb', 3, 7.9]]);
    const mus = await renderScript(game, [], 8, { zone, tap: 'music', seed: 2 }, [['rmsDb', 3, 7.9]]);
    rows[zone] = { ...rows[zone], wind: +amb.probes[0].toFixed(1), drone: +mus.probes[0].toFixed(1) };
    assert.ok(amb.probes[0] > mus.probes[0] + 1.5, `${zone}: wind ${amb.probes[0].toFixed(1)} dB, drone ${mus.probes[0].toFixed(1)} dB`);
  }
  console.log(`mix: ${Object.entries(rows).map(([z, v]) => `${z} ${JSON.stringify(v)}`).join('; ')}`);
});

test('the pause holds the kept tone too: nothing of the game sounds under the pause menu', async () => {
  const kp = await renderScript(game, [ev(0.3, 'weapon/kept', { stage: 'fired', mark: 'm' }), ev(0.3, 'boss/proven', { x: 0, y: 0, z: 0 }),
    ev(1.3, 'game/state', { from: 'playing', to: 'paused', reason: 'menu' }), ev(2.5, 'game/state', { from: 'paused', to: 'playing', reason: 'menu' })], 4, { zone: 'the_bore' },
  [['rmsDb', 0.5, 1.2], ['rmsDb', 1.45, 2.45], ['rmsDb', 2.7, 3.5]]);
  const [before, paused, resumed] = kp.probes;
  assert.ok(before > -30, `the tone sounds: ${before} dB`);
  assert.ok(paused < -80, `paused: ${paused} dB`);
  assert.ok(resumed > -40, `and it comes back: ${resumed} dB`);
  console.log(`mix: kept tone ${before.toFixed(1)} dB, under the pause menu ${paused.toFixed(1)} dB, resumed ${resumed.toFixed(1)} dB`);
});

test('an echo is never louder than what it echoes: outdoors the slap of a jug, a bell and an impact sits under the sound; the effects volume reaches the tails', async () => {
  const jug = (z) => [ev(0.2, 'shootable/hit', { x: 0, y: 1, z, id: 'ia_jug_1', kind: 'jug', scaleDegree: 1, ammo: 'lead_round' })];
  const cases = {
    jug10: jug(-10), jug25: jug(-25),
    bell: [ev(0.2, 'shootable/hit', { x: 0, y: 1, z: -10, id: 'b', kind: 'bell', scaleDegree: 1, ammo: 'lead_round' })],
    impact: [{ t: 0.2, ev: 'combat/hit', p: { x: 0, y: 1, z: -12, shotId: 1, order: 0, ammo: 'lead_round', outcome: 'impact', entityId: '', entityKind: 'world', part: 'body', surface: 'wood', nx: 0, ny: 1, nz: 0, damage: 0, ricochetX: 0, ricochetY: 0, ricochetZ: 0 } }],
  };
  const out = [];
  for (const [name, script] of Object.entries(cases)) {
    // the direct sound (0.2 s) and its slap off the far wall (320 ms later)
    const r = await renderScript(game, script, 1.5, { zone: 'the_lip', quiet: true }, [['peak', 0.2, 0.25], ['peak', 0.5, 0.56]]);
    const d = 20 * Math.log10(r.probes[1] / r.probes[0]);
    assert.ok(d < -3 && d > -16, `${name}: the slap is ${d.toFixed(1)} dB against the sound (under it, and still an answer)`);
    out.push(`${name} ${d.toFixed(1)} dB`);
  }
  // underground the world leans on the room: a slam in the hall still rings half a second later
  const slam = [ev(0.2, 'enemy/attack', { x: -2, y: 0, z: -6, id: 'tamper#1', kind: 'tamper', attack: 'slam' })];
  const hall = await renderScript(game, slam, 2.5, { zone: 'lift_hall', quiet: true }, [['rmsDb', 0.2, 0.5], ['rmsDb', 0.8, 1.3]]);
  assert.ok(hall.probes[1] > -50 && hall.probes[1] < hall.probes[0] - 12, `the hall's tail of a slam: ${hall.probes[1]} dB after ${hall.probes[0]} dB`);
  // volumeEffects 0: no gun, no effect, and no tail of either (the sends carry their bus level)
  const mute = await renderScript(game, [fired(0.2, 4), ...cases.jug10], 2, { zone: 'the_lip', quiet: true, volumes: [0.8, 0, 0.7] }, [['rmsDb', 0.2, 1.6]]);
  assert.ok(mute.probes[0] < -90, `effects volume 0 leaves ${mute.probes[0]} dB`);
  console.log(`mix: slap against the direct sound outdoors: ${out.join(', ')}; a slam in the hall ${hall.probes[0].toFixed(1)} dB, its tail 0.6-1.1 s later ${hall.probes[1].toFixed(1)} dB; effects volume 0: ${mute.probes[0].toFixed(1)} dB`);
});

// ---- fix round 3 ------------------------------------------------------------------------------------------------------
test('her own body is heard: every surface\'s step (and the jump) is 3 dB over the bed of every zone in at least one octave; sprint is louder; the gun stays 20 dB over a walk', async () => {
  const ZONES = ['the_lip', 'plenty_street', 'tally_house', 'the_gallery', 'lift_hall', 'the_bore', 'far_rim'];
  const beds = {};
  for (const zone of ZONES) {
    await renderScript(game, [], 12, { zone, seed: 3 });
    const b = await grab(game), x = b.x.subarray(3 * b.sr);
    beds[zone] = { full: median(windowsDb(x, b.sr)), bands: OCTAVES.map((f) => median(windowsDb(bandpass(x, b.sr, f, 1.4), b.sr))) };
  }
  await renderScript(game, [fired(0.5, 4)], 1.5, { zone: 'plenty_street', quiet: true });
  const shot = await grab(game), gun = Math.max(...windowsDb(shot.x, shot.sr));
  const loud = async (name, a) => {
    await render(game, name, { a, total: 0.6 });
    const st = await grab(game);
    let peak = 0; for (const v of st.x) if (Math.abs(v) > peak) peak = Math.abs(v);
    return { full: Math.max(...windowsDb(st.x, st.sr)), bands: OCTAVES.map((f) => Math.max(...windowsDb(bandpass(st.x, st.sr, f, 1.4), st.sr))), peak: 20 * Math.log10(peak) };
  };
  const rows = [];
  let walkSum = 0, sprintSum = 0, n = 0;
  for (const surface of ['sand', 'wood', 'adobe', 'metal', 'ceramic', 'stone', 'cloth', 'none']) {
    // two takes of each class are baked from different windows of the noise: both are measured, the quieter one counts
    const walks = [await loud('step_' + surface, 0), await loud('step_' + surface, 0)], sprints = [await loud('step_' + surface, 1), await loud('step_' + surface, 1)];
    const walk = walks[0].full <= walks[1].full ? walks[0] : walks[1], sprint = sprints[0].full <= sprints[1].full ? sprints[0] : sprints[1];
    let worst = 99, where = '';
    for (const zone of ZONES) {
      let best = -99;
      walk.bands.forEach((v, i) => { best = Math.max(best, v - beds[zone].bands[i]); });
      if (best < worst) { worst = best; where = zone; }
      assert.ok(best >= 3, `a walk step on ${surface} in ${zone}: its best octave is ${best.toFixed(1)} dB over the bed's median 50 ms`);
    }
    for (const w of walks) assert.ok(gun - w.full >= 20, `the gun (${gun.toFixed(1)} dB) is 20 dB over a walk step on ${surface} (${w.full.toFixed(1)} dB)`);
    for (const sp of sprints) assert.ok(gun - sp.full >= 14, `the gun (${gun.toFixed(1)} dB) is 14 dB over a sprint step on ${surface} (${sp.full.toFixed(1)} dB)`);
    assert.ok(walk.peak > -24 && walk.peak < -8, `a walk step on ${surface} peaks near the reload's seat-click (-12 dBFS): ${walk.peak.toFixed(1)} dBFS`);
    walkSum += (walks[0].full + walks[1].full) / 2; sprintSum += (sprints[0].full + sprints[1].full) / 2; n++;
    rows.push(`${surface} ${walk.full.toFixed(1)} / ${sprint.full.toFixed(1)} dB, peak ${walk.peak.toFixed(1)} dBFS, worst zone ${where} +${worst.toFixed(1)}`);
  }
  const wider = (sprintSum - walkSum) / n;
  assert.ok(wider >= 4 && wider <= 7, `sprint is 5 dB louder than walk (mean over the surfaces): ${wider.toFixed(2)} dB`);
  const jump = await loud('jump', 0);
  for (const zone of ZONES) {
    let best = -99;
    jump.bands.forEach((v, i) => { best = Math.max(best, v - beds[zone].bands[i]); });
    assert.ok(best >= 3, `the jump in ${zone}: ${best.toFixed(1)} dB over the bed in its best octave`);
  }
  console.log(`mix: steps, loudest 50 ms walk / sprint (gun ${gun.toFixed(1)} dB; sprint +${wider.toFixed(1)} dB on average): ${rows.join('; ')}; jump ${jump.full.toFixed(1)} dB`);
});

test('the life that ended is not heard in the next: a haul, a station line and a howl are at bed level within 0.3 s of the respawn', async () => {
  const zone = 'the_bore', D = 3.2, R = 4.6;
  const life = [
    ev(3, 'boss/haul', { on: true, seconds: 8 }),
    ev(3, 'story/line', { key: 'stn_x', speaker: 'station', text: 'THANK YOU FOR YOUR PATIENCE. THE LINE IS HELD. PLEASE REMAIN WHERE YOU ARE.', seconds: 8 }),
    ev(3, 'enemy/telegraph', { x: 0, y: 0, z: -6, id: 'tamper#1', kind: 'tamper', attack: 'charge', seconds: 3 }),
    ev(3, 'boss/indexing', { fromBay: 1, toBay: 4, seconds: 6 }),
  ];
  const death = [ev(D, 'player/died', { kind: 'slam', source: 'tamper' }), ev(D, 'game/state', { from: 'playing', to: 'dead', reason: '' }),
    ev(R, 'game/state', { from: 'dead', to: 'playing', reason: '' }), ev(R, 'player/respawned', { x: 0, y: 0, z: 0, checkpoint: 'cp_bore' })];
  await renderScript(game, death, 8, { zone, tap: 'nokept', seed: 5 });
  const bed = await grab(game);
  const r = await renderScript(game, [...life, ...death], 8, { zone, tap: 'nokept', seed: 5 });
  const g = await grab(game);
  const before = rmsDb(g.x, g.sr, D - 0.2, D) - rmsDb(bed.x, bed.sr, D - 0.2, D);
  const after = rmsDb(g.x, g.sr, R + 0.3, R + 1.5) - rmsDb(bed.x, bed.sr, R + 0.3, R + 1.5);
  const later = rmsDb(g.x, g.sr, R + 1.5, R + 3) - rmsDb(bed.x, bed.sr, R + 1.5, R + 3);
  assert.ok(before > 6, `the old life was loud before the death: +${before.toFixed(1)} dB over the bed`);
  assert.ok(Math.abs(after) <= 2, `0.3 to 1.5 s after the respawn the output is the bed (within 2 dB): ${after.toFixed(2)} dB`);
  assert.ok(Math.abs(later) <= 1.5, `and stays there: ${later.toFixed(2)} dB`);
  assert.ok(r.result.recent.some((s) => s.name === 'haul_whine') && r.result.recent.some((s) => s.name === 'station_line'));
  console.log(`mix: haul + station line + howl + ratchet over the bed: +${before.toFixed(1)} dB before the death, ${after.toFixed(2)} dB 0.3-1.5 s after the respawn, ${later.toFixed(2)} dB after that`);
});

test('a payload with NaN or missing fields costs no sound and throws nothing while the context runs', async () => {
  const bad = Number.NaN;
  const script = [
    ev(0.2, 'combat/hit', { x: bad, y: bad, z: bad, outcome: 'impact', surface: 'stone', entityKind: 'world' }),
    ev(0.4, 'combat/hit', { outcome: 'kill', surface: 'none', entityKind: 'bider' }),
    ev(0.6, 'boss/mouth', { mouth: bad, state: 'dark' }),
    ev(0.8, 'story/line', { key: 'stn_x', speaker: 'station', seconds: bad }),
    ev(1.0, 'enemy/telegraph', { x: bad, y: 0, z: bad, id: 'transit#1', kind: 'transit', attack: 'aim', seconds: bad }),
    ev(1.2, 'shootable/hit', { x: 0, y: 1, z: -8, id: 'j', kind: 'jug', scaleDegree: bad }),
    ev(1.4, 'audio/cue', { cue: 'gate_bang', x: bad, y: bad, z: bad, positional: true, gain: Infinity, pitch: bad }),
    ev(1.6, 'breakable/broken', { x: 0, y: 1, z: -5, id: 'b' }),
    ev(1.8, 'player/landed', { x: 0, y: 0, z: 0, speed: bad }),
    ev(2.0, 'player/damaged', { amount: Infinity, health: 10 }),
    ev(2.2, 'boss/discharge', { kind: 'lance', mouth: 1, glowSeconds: Infinity }),
  ];
  const r = await renderScript(game, script, 4, { zone: 'the_lip', quiet: true });
  const names = r.result.recent.map((s) => s.name);
  for (const name of ['impact_stone', 'hit_kill', 'chamber', 'station_line', 'transit_tone', 'jug', 'gate_bang', 'break_clay', 'land', 'hurt', 'lance_tone']) assert.ok(names.includes(name), `${name} still sounds: ${names.join(' ')}`);
  assert.ok(Number.isFinite(r.result.peak) && r.result.peak > 0.02 && r.result.peak < 1, `the render is finite and audible: peak ${r.result.peak}`);
  assert.equal(await game.page.evaluate(() => window.__dbg.error), null);
  console.log(`mix: ${script.length} events with NaN / missing / infinite fields -> ${names.length} sounds, peak ${r.result.peak.toFixed(3)}, nothing thrown`);
});
