// The gun (work order section 6, "Gun"): measured on offline renders through the real graph.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { audioServer, bandpass, cue, db, ev, fired, grab, hit, openBoard, render, renderScript, rms, rmsDb } from './lib.mjs';

let server, game;
before(async () => { server = await audioServer(); game = await openBoard(server); });
after(async () => { await game.close(); await server.close(); });

test('the report starts on the first sample of its tick, and its crack is above 2 kHz', async () => {
  const solo = await render(game, 'gun_report', { a: 5 }, [['sample', 0], ['band', 0, 0.003, 2000, 24000], ['peak', 0, 0.003]]);
  assert.equal(solo.stats.firstSample, 0, 'no look-ahead, no ramp: sample 0 is the crack');
  assert.ok(Math.abs(solo.probes[0]) > 0.01, `sample 0 = ${solo.probes[0]}`);
  assert.ok(solo.probes[1] > 0.5, `share of the first 3 ms above 2 kHz: ${solo.probes[1]}`);
  assert.ok(solo.probes[2] > 0.3, `peak of the first 3 ms: ${solo.probes[2]}`);
  const crack = await render(game, 'gun_report', { a: 5, c: 1 }, [['band', 0, 0.003, 2000, 24000], ['lastAbove', 0, 0.1, -60]]);
  assert.ok(crack.probes[0] > 0.85, `the crack layer alone above 2 kHz: ${crack.probes[0]}`);
  assert.ok(crack.probes[1] <= 0.0045, `the crack lasts 3 ms: ${crack.probes[1]}`);
  // through the whole engine, with ambience running: an event at t = 1 s puts a sample at exactly 1 s
  const scripted = await renderScript(game, [fired(1)], 2, { zone: 'the_lip', tap: 'gun' }, [['sample', 47999], ['sample', 48000], ['firstAbove', 0, 2, -60]]);
  assert.equal(scripted.probes[0], 0, 'silent until the tick of the click');
  assert.ok(Math.abs(scripted.probes[1]) > 0.01, 'and loud on it');
  assert.ok(Math.abs(scripted.probes[2] - 1) < 1e-4);
  console.log(`gun: first sample ${solo.stats.firstSample}, sample 0 = ${solo.probes[0].toFixed(3)}, ${(solo.probes[1] * 100).toFixed(0)} % of the first 3 ms above 2 kHz (crack alone ${(crack.probes[0] * 100).toFixed(0)} %), report peak ${solo.stats.peak.toFixed(3)}`);
});

test('the boom sweeps 150 -> 50 Hz over 160 ms; the body is 600-2500 Hz and gone by 120 ms; pitch follows the jitter', async () => {
  const boom = await render(game, 'gun_report', { a: 5, c: 4 }, [['zeroCross', 0, 0.02], ['zeroCross', 0.05, 0.1], ['zeroCross', 0.12, 0.185], ['lastAbove', 0, 0.4, -60]]);
  const [start, mid, end, stop] = boom.probes;
  assert.ok(start > 125 && start <= 152, `boom starts near 150 Hz: ${start}`);
  assert.ok(mid < start && mid > end, `falling: ${start} ${mid} ${end}`);
  assert.ok(end >= 48 && end < 64, `boom ends near 50 Hz: ${end}`);
  assert.ok(stop > 0.15 && stop < 0.2, `boom lasts ${stop}`);
  const body = await render(game, 'gun_report', { a: 5, c: 2 }, [['band', 0, 0.12, 500, 3000], ['lastAbove', 0, 0.4, -50]]);
  assert.ok(body.probes[0] > 0.8, `body energy in 500-3000 Hz: ${body.probes[0]}`);
  assert.ok(body.probes[1] > 0.08 && body.probes[1] < 0.13, `body ends by 120 ms: ${body.probes[1]}`);
  // the seeded jitter moves the whole report: the boom's spectral centre follows the pitch
  const centre = async (pitch) => (await render(game, 'gun_report', { a: 5, c: 4, pitch }, [['centroid', 0, 0.19, 20, 400]])).probes[0];
  const c0 = await centre(1), up = await centre(1.04), down = await centre(0.96);
  assert.ok(Math.abs(up / c0 - 1.04) < 0.012 && Math.abs(down / c0 - 0.96) < 0.012, `+-4 %: ${down} ${c0} ${up}`);
  console.log(`gun: boom ${start.toFixed(0)} -> ${mid.toFixed(0)} -> ${end.toFixed(0)} Hz, ends at ${(stop * 1000).toFixed(0)} ms; body ${(body.probes[0] * 100).toFixed(0)} % in band, ends at ${(body.probes[1] * 1000).toFixed(0)} ms`);
});

test('mechanics: hammer at 0 ms, cock and ratchet inside 120-300 ms; the last two rounds are brighter and drier', async () => {
  const windows = [['peak', 0, 0.03], ['peak', 0.05, 0.12], ['peak', 0.133, 0.2], ['peak', 0.25, 0.3], ['peak', 0.32, 0.5], ['centroid', 0, 0.4]];
  const normal = await render(game, 'gun_report', { a: 4, c: 8 }, windows);
  const [hammer, gap, cock, ratchet, afterwards, centroid] = normal.probes;
  assert.ok(hammer > 0.02 && cock > 0.02 && ratchet > 0.02, `three clicks: ${hammer} ${cock} ${ratchet}`);
  assert.ok(gap < hammer * 0.1 && afterwards < 0.005, `nothing between or after: ${gap} ${afterwards}`);
  const centroids = [];
  for (let left = 5; left >= 0; left--) centroids.push((await render(game, 'gun_report', { a: left, c: 8 }, [['centroid', 0, 0.4]])).probes[0]);
  for (const c of centroids.slice(0, 4)) assert.ok(Math.abs(c - centroid) < 1, 'the first four rounds sound the same');
  for (const c of centroids.slice(4)) assert.ok(c > centroid * 1.3, `the last two are brighter: ${c} vs ${centroid}`);
  // the tail: the same shot in the same room, chambersLeft 4 and 1
  const tail = async (left) => (await renderScript(game, [fired(0.5, left)], 3, { zone: 'the_lip', quiet: true, seed: 3 }, [['rmsDb', 0.9, 1.9]])).probes[0];
  const wet = await tail(4), dry = await tail(1), dry0 = await tail(0);
  assert.ok(dry < wet - 4 && dry0 < wet - 4, `tail RMS ${wet} dB, last rounds ${dry} and ${dry0} dB`);
  console.log(`gun: mechanics centroid ${centroid.toFixed(0)} Hz, last two rounds ${centroids[4].toFixed(0)} Hz; tail ${wet.toFixed(1)} dB, last two rounds ${dry.toFixed(1)} dB`);
});

test('dry fire is one dead click, softer for the kept round; six seat-clicks rise strictly in pitch', async () => {
  const dry = await render(game, 'dry_fire', { a: 0 });
  const soft = await render(game, 'dry_fire', { a: 1 });
  assert.ok(dry.stats.duration < 0.1 && dry.stats.peak > 0.05, `one short click: ${dry.stats.duration} s, peak ${dry.stats.peak}`);
  assert.ok(soft.stats.peak < dry.stats.peak * 0.6, `softer: ${soft.stats.peak} vs ${dry.stats.peak}`);
  const seats = [];
  for (let n = 1; n <= 6; n++) seats.push((await render(game, 'reload_round', { a: n }, [['partial', 0, 0.1, 1000, 3000]])).probes[0]);
  for (let n = 1; n < 6; n++) assert.ok(seats[n] > seats[n - 1] * 1.04, `seat ${n + 1} is higher than seat ${n}: ${seats.map((f) => f.toFixed(0)).join(' ')}`);
  console.log(`gun: seat-clicks ${seats.map((f) => f.toFixed(0)).join(', ')} Hz; dry fire peak ${dry.stats.peak.toFixed(3)}, kept ${soft.stats.peak.toFixed(3)}`);
});

test('the full report stays under clipping after the limiter with music, ambience and a fight running', async () => {
  const script = [ev(0, 'encounter/started', { id: 'enc_matador' }), { t: 0, threat: 8 }];
  for (let k = 0; k < 14; k++) { script.push(fired(3 + k * 0.48, 5 - (k % 6))); script.push(hit(3 + k * 0.48, k % 2 ? 'kill' : 'impact', 'metal')); }
  for (let k = 0; k < 4; k++) script.push(ev(3.2 + k * 1.7, 'enemy/attack', { x: 0, y: 0, z: -3, id: 'tamper#1', kind: 'tamper', attack: 'slam' }), cue(3.5 + k * 1.7, 'gate_bang'), cue(4 + k * 1.7, 'dry_click_big'));
  for (const volumes of [[0.8, 1, 0.7], [1, 1, 1]]) {
    const r = await renderScript(game, script, 11, { zone: 'lift_hall', volumes }, [['peak', 0, 3], ['peak', 3, 11], ['rmsDb', 3, 10]]);
    assert.ok(r.result.peak < 1.0, `peak ${r.result.peak} at volumes ${volumes}`);
    assert.ok(r.result.peak <= volumes[0] * 0.99 + 1e-6, `the soft clip holds the master at ${volumes[0]}: ${r.result.peak}`);
    if (volumes[2] < 1) assert.ok(r.probes[1] > r.probes[0] * 1.5, `the gun is the loudest thing in the mix: ${r.probes[1]} vs ${r.probes[0]}`);
    assert.ok(r.result.voicePeak <= 32);
    console.log(`gun: fight in the hall at volumes ${volumes.join('/')}: peak ${r.result.peak.toFixed(3)}, before the shots ${r.probes[0].toFixed(3)}, RMS ${r.probes[2].toFixed(1)} dB, voices ${r.result.voicePeak}`);
  }
});

test('the line round: the report plus a sine at D5, 8 cents sharp, 1.2 s', async () => {
  const r = await renderScript(game, [fired(0.5, 5, 'line_round')], 2.5, { zone: 'the_gallery', quiet: true }, [['partial', 0.8, 1.5, 500, 700], ['lastAbove', 0.5, 2.5, -45]]);
  const off = 1200 * Math.log2(r.probes[0] / (146.83 * 4));
  assert.ok(Math.abs(off - 8) <= 2, `D5 + 8 cents: ${off}`);
  assert.deepEqual(r.result.recent.map((s) => s.name), ['gun_report', 'line_tone']);
  const tone = await render(game, 'line_tone');
  assert.ok(Math.abs(tone.stats.duration - 1.2) < 0.05, `1.2 s: ${tone.stats.duration}`);
  console.log(`gun: line round tone D5 ${off >= 0 ? '+' : ''}${off.toFixed(2)} cents, ${tone.stats.duration.toFixed(2)} s`);
});

// ---- fix round 3: a hit and a miss do not sound the same -------------------------------------------------------------
// The confirms used to start on the tick of the report, 20 dB under it in bands it filled: adding one raised its own
// band by 0.0 to 0.2 dB. Now each sounds a moment after the click (CONFIRM_DELAY 150 ms since polish round 3, 85 ms before; the kill's thud at 190 ms, once
// the boom has let go) and loud enough to be heard over the room that is still answering the shot.
const tickTime = (t) => Math.ceil(t * 60 - 1e-6) / 60;
// outcome, entity, the confirm's own band (Hz, Q), its window after the hit (s)
const CONFIRMS = [
  ['hit', 'bider', 1860, 5, 0.15, 0.17],          // the tick: a knock at 1.9 kHz
  ['weak', 'transit', 3110, 6, 0.15, 0.19],       // the glass tink
  ['kill', 'bider', 188, 4, 0.19, 0.25],            // the thud's knock (what a small speaker plays of it)
  ['kill', 'bider', 80, 1.2, 0.19, 0.29],           // the thud itself
  ['deflected', 'windlass', 1282, 5, 0.16, 0.265],   // the skipping bell of the flat clank
  ['deflected', 'tamper', 320, 4, 0.16, 0.315],     // the plate's bell
];
test('hit confirms are heard after the report: shot + confirm is at least 3 dB over the shot alone in the confirm\'s band, outdoors and in the hall', async () => {
  const T = 0.5, rows = [];
  for (const zone of ['the_lip', 'lift_hall', 'the_bore']) {
    const o = { zone, quiet: true, seed: 7 };
    await renderScript(game, [fired(T, 4)], 1.6, o);
    const shot = await grab(game);
    for (const [outcome, kind, band, q, w0, w1] of CONFIRMS) {
      const both = await renderScript(game, [fired(T, 4), hit(T, outcome, 'none', kind)], 1.6, o);
      const g = await grab(game);
      const at = (r) => rmsDb(bandpass(r.x, r.sr, band, q), r.sr, T + w0, T + w1);
      const lift = at(g) - at(shot);
      rows.push(`${zone} ${outcome}/${kind} @${band} Hz +${lift.toFixed(1)}`);
      // logged on the tick of the hit ("no bullet produces nothing"), sounding after the report
      assert.equal(both.result.recent.length, 2, `${outcome}: the report and its confirm`);
      assert.equal(both.result.recent[1].tick, both.result.recent[0].tick, `${outcome}: both are logged on the tick of the click`);
      // the bore's 2.8 s room is the hardest place to be heard in: reported, and held to 2.5 dB there
      assert.ok(lift >= (zone === 'the_bore' ? 2.5 : 3), `${zone}: ${outcome} on a ${kind} lifts ${band} Hz by ${lift.toFixed(2)} dB over the shot alone`);
    }
  }
  // the report still owns the tick: nothing of a confirm sounds in the first 140 ms after the click
  await renderScript(game, [hit(T, 'hit', 'none', 'bider'), hit(T, 'kill', 'none', 'bider'), hit(T, 'weak', 'none', 'transit')], 1.2, { zone: 'the_lip', quiet: true, tap: 'nokept' }, []);
  const alone = await grab(game);
  assert.ok(rmsDb(alone.x, alone.sr, T, T + 0.14) < -90, `confirms wait for the report: ${rmsDb(alone.x, alone.sr, T, T + 0.14)} dB in the first 140 ms`);
  console.log(`gun: confirm over the shot alone, in its band: ${rows.join('; ')}`);
});

test('line-round hits 40 ms apart: each of the three confirms is heard on its own', async () => {
  const T = 0.5, times = [T, T + 0.04, T + 0.08].map(tickTime);
  for (const zone of ['the_lip', 'lift_hall']) {
    const o = { zone, quiet: true, seed: 7 };
    await renderScript(game, [fired(T, 4, 'line_round')], 1.6, o);
    const shot = await grab(game);
    const r = await renderScript(game, [fired(T, 4, 'line_round'), ...times.map((t) => hit(t, 'hit', 'none', 'bider'))], 1.6, o);
    const g = await grab(game);
    assert.equal(r.result.recent.filter((s) => s.name === 'hit_tick').length, 3, 'one confirm per combat/hit');
    const lifts = times.map((t) => { const at = (x) => rmsDb(bandpass(x.x, x.sr, 1860, 5), x.sr, t + 0.15, t + 0.17); return at(g) - at(shot); });
    for (const l of lifts) assert.ok(l >= 3, `${zone}: line-round ticks lift 1860 Hz by ${lifts.map((v) => v.toFixed(1)).join(', ')} dB`);
    console.log(`gun: line round in ${zone}, three ticks at ${times.map((t) => ((t - T) * 1000).toFixed(0)).join(' / ')} ms: +${lifts.map((v) => v.toFixed(1)).join(', +')} dB`);
  }
});

// ---- polish round 3 (critic "combat"): the confirms sat 7 to 11 dB under the report ------------------------------------
// Whole-band levels this time, not the confirm's own band: at 85 ms the tick was 9.1 to 11.4 dB, the parry 7.5 to 10.6 dB
// and the weak-point tink 5.9 to 8.6 dB under what the report was doing at that moment, worst in the bore, where the
// parry is the fight's lesson. They now start at 150 ms (the report is 10 dB down by then), the tick is 2.5 dB and the
// parry 4 dB louder, and the report's tail (gun bus and room return) steps back 5 dB for 120 ms under them.
const loudest = (x, sr, from) => { let best = 0, at = from; for (let t = from; t < from + 1; t += 0.02) { const v = rms(x, sr, t, t + 0.06); if (v > best) { best = v; at = t; } } return { at, level: db(best) }; };
const minus = (a, b) => { const n = Math.min(a.x.length, b.x.length), d = new Float32Array(n); for (let i = 0; i < n; i++) d[i] = a.x[i] - b.x[i]; return d; };
test('the tick, the tink and the parry stand level with the report at their moment, in the street, the hall and the bore', async () => {
  const T = 0.2, rows = [];
  for (const zone of ['plenty_street', 'lift_hall', 'the_bore']) for (const quiet of [true, false]) {
    const o = { zone, quiet, seed: 7 };
    await renderScript(game, [fired(T, 4)], 1.6, o);
    const shot = await grab(game);
    for (const [outcome, kind] of [['hit', 'bider'], ['weak', 'transit'], ['parried', 'windlass'], ['deflected', 'windlass'], ['deflected', 'tamper']]) {
      const step = hit(T, outcome, 'none', kind);
      await renderScript(game, [fired(T, 4), step], 1.6, o);
      const both = await grab(game);
      await renderScript(game, [step], 1.6, o);
      const alone = await grab(game);
      // (a) the critic's measure: what the confirm adds, in its loudest 60 ms, against the shot ALONE in that window (the
      //     5 dB the tail gives way is not counted in the confirm's favour here, so this is the harsher of the two)
      const added = loudest(minus(both, shot), both.sr, T);
      const overShot = added.level - rmsDb(shot.x, shot.sr, added.at, added.at + 0.06);
      // (b) what is heard: the confirm against the rest of the mix as it is under it
      const own = loudest(alone.x, alone.sr, T);
      const overRest = own.level - rmsDb(minus(both, alone), both.sr, own.at, own.at + 0.06);
      rows.push(`${zone}${quiet ? '' : '+bed'} ${outcome}/${kind} ${overShot.toFixed(1)} / ${overRest.toFixed(1)}`);
      assert.ok(added.at - T >= 0.139, `${zone}: ${outcome} is loudest ${Math.round((added.at - T) * 1000)} ms after the click, past the report's first 150 ms`);
      // polish round 4 (critic "combat"): in the bore these were -1.4 to -3.1 dB (a) and -0.7 to +1.6 dB (b), in the hall
      // -2.2 to +0.6 and 0.0 to +4.6. No confirm is under the report's tail any more, in any room, with or without the bed
      assert.ok(overShot >= 0, `${zone}${quiet ? '' : '+bed'}: ${outcome}/${kind} is ${overShot.toFixed(1)} dB against the shot alone at its moment (it was -1.4 to -3.1 dB in the bore)`);
      assert.ok(overRest >= 2, `${zone}${quiet ? '' : '+bed'}: ${outcome}/${kind} is ${overRest.toFixed(1)} dB against the rest of the mix under it`);
    }
  }
  console.log(`gun: confirm against the shot alone / against the mix under it, dB: ${rows.join('; ')}`);
});

// What the room gives way under a confirm: 5 dB for 120 ms in the open; 10 dB for 200 ms in the bore, whose room answers the
// report 7 dB louder at that moment (reverb.ts IR_TAIL_DUCK_DB). The step starts 8 ms before the confirm (142 ms).
test('the report\'s tail steps back under a confirm (5 dB in the street, deeper and longer in the bore) and is whole again after; a miss and a kill leave it alone', async () => {
  const T = 0.2;
  for (const [zone, lo, hi, late] of [['plenty_street', -6, -3, -1], ['the_bore', -11, -7, -6]]) {
    const o = { zone, quiet: true, seed: 7 };
    await renderScript(game, [fired(T, 4)], 1.6, o);
    const shot = await grab(game);
    const rest = async (outcome, kind) => {
      const step = hit(T, outcome, 'none', kind);
      await renderScript(game, [fired(T, 4), step], 1.6, o); const both = await grab(game);
      await renderScript(game, [step], 1.6, o); const alone = await grab(game);
      const r = minus(both, alone);
      return (a, b) => db(rms(r, both.sr, T + a, T + b)) - rmsDb(shot.x, shot.sr, T + a, T + b);
    };
    const parry = await rest('parried', 'windlass');
    assert.ok(Math.abs(parry(0, 0.14)) < 0.5, `${zone}: the report's first 140 ms are untouched: ${parry(0, 0.14).toFixed(2)} dB`);
    assert.ok(parry(0.17, 0.26) <= hi && parry(0.17, 0.26) >= lo, `${zone}: the tail under the parry, 170-260 ms: ${parry(0.17, 0.26).toFixed(1)} dB`);
    // the bore holds its step to 342 ms (the clank is 165 ms long); the street has let go by then
    assert.ok(late < -3 ? parry(0.27, 0.33) <= late : parry(0.33, 0.4) >= late, `${zone}: the tail at 270-330 ms ${parry(0.27, 0.33).toFixed(1)} dB, at 330-400 ms ${parry(0.33, 0.4).toFixed(1)} dB`);
    assert.ok(Math.abs(parry(0.55, 0.9)) < 1, `${zone}: the tail is whole again from 550 ms: ${parry(0.55, 0.9).toFixed(2)} dB`);
    const kill = await rest('kill', 'bider');
    assert.ok(Math.abs(kill(0.17, 0.26)) < 1.5, `${zone}: a kill's thud does not move the tail: ${kill(0.17, 0.26).toFixed(2)} dB`);
    await renderScript(game, [fired(T, 4), hit(T, 'impact', 'stone', 'world')], 1.6, { ...o, tap: 'reverb' }); const miss = await grab(game);
    await renderScript(game, [fired(T, 4)], 1.6, { ...o, tap: 'reverb' }); const none = await grab(game);
    await renderScript(game, [fired(T, 4), hit(T, 'parried', 'none', 'windlass')], 1.6, { ...o, tap: 'reverb' }); const room = await grab(game);
    const roomStep = rmsDb(room.x, room.sr, T + 0.17, T + 0.26) - rmsDb(none.x, none.sr, T + 0.17, T + 0.26);
    assert.ok(rmsDb(miss.x, miss.sr, T + 0.17, T + 0.26) >= rmsDb(none.x, none.sr, T + 0.17, T + 0.26) - 0.5, `${zone}: a miss leaves the room alone`);
    console.log(`gun: tail under a parry in ${zone}: ${parry(0, 0.14).toFixed(1)} dB at 0-140 ms, ${parry(0.17, 0.26).toFixed(1)} dB at 170-260 ms, ${parry(0.27, 0.33).toFixed(1)} dB at 270-330 ms, ${parry(0.55, 0.9).toFixed(1)} dB at 550-900 ms; the room's return alone ${roomStep.toFixed(1)} dB; under a kill ${kill(0.17, 0.26).toFixed(1)} dB`);
  }
});

// ---- polish round 4 (critic "combat"): in the bore the confirms sat 1 to 2.7 dB under the report's tail ----------------
// The critic's own script (scratch/r4-combat/audio.mjs), on its payloads: the hit at the click (t = 0.2 s), ambience and
// music running, the loudest 60 ms of (shot + confirm) - (shot) against the shot alone in that window. Measured before:
// the_bore hit -2.7, weak -2.3, deflected -1.2, parried -2.4 dB. The kill and the freed bell were over it and stay there.
test('in the bore, with ambience and music, every confirm is over the report\'s tail by the critic\'s measure; the street is no worse than it was', async () => {
  const T = 0.2, rows = [];
  const step = (outcome, entityKind) => ({ t: T, ev: 'combat/hit', p: { x: 0, y: 1.2, z: -10, outcome, entityKind, part: 'body', surface: 'cloth', ammo: 'lead_round' } });
  const shotEv = { t: T, ev: 'weapon/fired', p: { ammo: 'lead_round', chambersLeft: 4, shotId: 1 } };
  // outcome, entity, floor in the bore, floor in the street (dB over the bed; the street's are what round 3 measured, less 0.5)
  const CASES = [['hit', 'bider', 0.3, 0.4], ['weak', 'bider', 0.3, 1.3], ['deflected', 'windlass', 0.5, 2], ['deflected', 'tamper', 0.5, 0.4], ['parried', 'bider', 0.3, 1.9], ['kill', 'bider', 0.5, 7], ['freed', 'bider', 2.5, 9]];
  for (const zone of ['the_bore', 'plenty_street']) {
    const o = { zone, quiet: false };
    await renderScript(game, [shotEv], 1.6, o);
    const shot = await grab(game);
    for (const [outcome, kind, bore, street] of CASES) {
      await renderScript(game, [shotEv, step(outcome, kind)], 1.6, o);
      const both = await grab(game);
      const added = loudest(minus(both, shot), both.sr, T);
      const over = added.level - rmsDb(shot.x, shot.sr, added.at, added.at + 0.06);
      rows.push(`${zone} ${outcome}/${kind} ${over >= 0 ? '+' : ''}${over.toFixed(1)}`);
      assert.ok(over >= (zone === 'the_bore' ? bore : street), `${zone}: ${outcome}/${kind} is ${over.toFixed(1)} dB against the bed at ${Math.round((added.at - T) * 1000)} ms`);
    }
  }
  console.log(`gun: confirm over the bed, the critic's measure, with ambience and music: ${rows.join('; ')}`);
});
