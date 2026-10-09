// Pass i4 (critic "combat", two minors): being hit is heard on a small speaker and says what struck her; a hit, a weak
// point and a round off the Tamper's plate are heard over the report's tail in the open as they are in the bore.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { audioServer, bandpass, cue, db, ev, grab, openBoard, render, renderScript, rms, rmsDb } from './lib.mjs';

let server, game;
before(async () => { server = await audioServer(); game = await openBoard(server); });
after(async () => { await game.close(); await server.close(); });

// ---- a laptop speaker: nothing much under 200 Hz (two 12 dB/oct Butterworth high-passes), as tests/audio/mix.test.mjs
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
function max50(x, sr) {
  const n = Math.round(0.05 * sr);
  let s = 0, best = 0;
  for (let i = 0; i < x.length; i++) { s += x[i] * x[i]; if (i >= n) s -= x[i - n] * x[i - n]; if (i >= n - 1 && s > best) best = s; }
  return 10 * Math.log10(best / n + 1e-24);
}
const loudest = (x, sr, from) => { let best = 0, at = from; for (let t = from; t < from + 1; t += 0.02) { const v = rms(x, sr, t, t + 0.06); if (v > best) { best = v; at = t; } } return { at, level: db(best) }; };
const minus = (a, b) => { const n = Math.min(a.x.length, b.x.length), d = new Float32Array(n); for (let i = 0; i < n; i++) d[i] = a.x[i] - b.x[i]; return d; };
const peakOf = (x) => { let m = 0; for (let i = 0; i < x.length; i++) { const v = Math.abs(x[i]); if (v > m) m = v; } return m; };
const PLAIN = 0, STAKE = 1, LUNGE = 2, SLAM = 3, BLAST = 4;
const KIND_NAMES = ['plain', 'stake', 'lunge', 'slam', 'blast'];
/** the thud round 65 Hz in the cue's first 200 ms: measured -20.2 to -24.9 dB */
const THUD_FLOOR = -28;
const damaged = (t, amount, kind, source, fromX = 3, fromZ = -6) => ev(t, 'player/damaged', { amount, health: 50, kind, source, fromX, fromY: 1.2, fromZ, graceUsed: false });

// ---- issue: "The hurt cue is a quiet 70 Hz thump" ------------------------------------------------------------------
// Before (scratch/i4-team-audio/before.log, the reviewer's render on the real game): at 18 HP peak -11 dB, RMS -30.1 dB,
// centroid 70 Hz, loudest 50 ms through a laptop speaker -35.8 dB; at 38 HP -8 / -26.8 / 70 Hz / -32.9 dB.
test('the hurt cue is heard on a small speaker: a mid band at every amount and kind, 4 dB more level, and the gun still 6 dB over it', async () => {
  await render(game, 'gun_report', { a: 4 });
  const g = await grab(game);
  const gun = max50(laptop(g.x, g.sr), g.sr), rows = [];
  for (const [a, rmsBefore, laptopBefore] of [[18, -30.1, -35.8], [38, -26.8, -32.9]]) for (const b of [PLAIN, STAKE, LUNGE, SLAM, BLAST]) {
    const r = await render(game, 'hurt', { a, b }, [['band', 0, 0.2, 600, 2000], ['band', 0, 0.2, 20, 150]]);
    const x = await grab(game);
    const small = max50(laptop(x.x, x.sr), x.sr), level = db(r.stats.rms), label = `hurt ${a} HP ${KIND_NAMES[b]}`;
    rows.push(`${a}/${KIND_NAMES[b]} rms ${level.toFixed(1)} laptop ${small.toFixed(1)} centroid ${Math.round(r.stats.centroidHz)} Hz`);
    assert.ok(level >= rmsBefore + 4, `${label}: RMS ${level.toFixed(1)} dB (it was ${rmsBefore})`);
    assert.ok(small >= laptopBefore + 12, `${label}: loudest 50 ms on a laptop speaker ${small.toFixed(1)} dB (it was ${laptopBefore})`);
    assert.ok(small <= gun - 6, `${label}: ${small.toFixed(1)} dB on a laptop speaker, the report ${gun.toFixed(1)} dB: the gun is still the loudest thing`);
    assert.ok(r.stats.centroidHz >= 400, `${label}: centroid ${Math.round(r.stats.centroidHz)} Hz (it was 70 Hz)`);
    // the cloth-and-breath band carries a real share of it (slam's second blow and the blast's hiss take some of theirs)
    assert.ok(r.probes[0] >= (b === SLAM || b === BLAST ? 0.08 : 0.2), `${label}: ${(r.probes[0] * 100).toFixed(0)} % of its energy at 600-2000 Hz`);
    // ... and the thud is still there for the speakers that can play it
    const thud = rmsDb(bandpass(x.x, x.sr, 65, 1), x.sr, 0, 0.2);
    rows.push(`thud ${thud.toFixed(1)}`);
    assert.ok(thud >= THUD_FLOOR, `${label}: the thud round 65 Hz is ${thud.toFixed(1)} dB`);
    assert.ok(r.stats.peak < 0.8 && r.stats.duration < 0.45, `${label}: peak ${r.stats.peak.toFixed(3)}, ${r.stats.duration.toFixed(3)} s`);
  }
  // heavier by amount, as before
  const light = await render(game, 'hurt', { a: 18, b: PLAIN }), heavy = await render(game, 'hurt', { a: 38, b: PLAIN });
  assert.ok(db(heavy.stats.rms) >= db(light.stats.rms) + 1.2, `38 HP ${db(heavy.stats.rms).toFixed(1)} dB, 18 HP ${db(light.stats.rms).toFixed(1)} dB`);
  console.log(`i4: hurt (report on a laptop speaker ${gun.toFixed(1)} dB): ${rows.join('; ')}`);
});

// each kind's own band and moment (Hz, Q, from, to): the rod ringing, the tears, the second blow, the hiss burning out
const SIGNATURE = { [STAKE]: [2460, 12, 0.08, 0.2], [LUNGE]: [5000, 1.2, 0, 0.15], [SLAM]: [110, 1, 0.15, 0.3], [BLAST]: [7000, 1, 0.15, 0.32] };
test('a stake, a lunge, a slam and a canister do not sound alike: each has its own top layer, 5 dB over the plain cue and 3 dB over every other kind', async () => {
  const rows = [];
  for (const a of [18, 38]) {
    const takes = [];
    for (const b of [PLAIN, STAKE, LUNGE, SLAM, BLAST]) { await render(game, 'hurt', { a, b }); takes.push(await grab(game)); }
    for (const own of [STAKE, LUNGE, SLAM, BLAST]) {
      const [f, q, t0, t1] = SIGNATURE[own];
      const levels = takes.map((x) => rmsDb(bandpass(x.x, x.sr, f, q), x.sr, t0, t1));
      rows.push(`${a} HP ${KIND_NAMES[own]} @${f} Hz ${levels.map((v) => v.toFixed(1)).join(' / ')}`);
      assert.ok(levels[own] >= levels[PLAIN] + 5, `${a} HP: ${KIND_NAMES[own]} has ${levels[own].toFixed(1)} dB at ${f} Hz, the plain cue ${levels[PLAIN].toFixed(1)} dB`);
      for (const other of [STAKE, LUNGE, SLAM, BLAST]) if (other !== own) assert.ok(levels[own] >= levels[other] + 3, `${a} HP: ${KIND_NAMES[own]} ${levels[own].toFixed(1)} dB at ${f} Hz, ${KIND_NAMES[other]} ${levels[other].toFixed(1)} dB`);
    }
  }
  console.log(`i4: hurt by kind, its own band (plain / stake / lunge / slam / blast, dB): ${rows.join('; ')}`);
});

// Before: through a laptop speaker the cue stood +0.2 dB (lunge, 18 HP) to +3.1 dB (slam, 38 HP) over the street's bed.
test('in the street and the bore, with ambience and music, being hit stands 10 dB over the bed on a laptop speaker; the music steps back under it; it leans to the side it came from', async () => {
  const T = 0.6, rows = [];
  for (const zone of ['plenty_street', 'the_bore']) {
    const o = { zone, quiet: false };
    await renderScript(game, [], 2, o);
    const bed = await grab(game);
    const bedSmall = laptop(bed.x, bed.sr);
    for (const [amount, kind, source] of [[18, 'lunge', 'bider'], [22, 'stake', 'transit'], [38, 'slam', 'tamper'], [38, 'canister', 'windlass']]) {
      const r = await renderScript(game, [damaged(T, amount, kind, source)], 2, o);
      const both = await grab(game);
      assert.deepEqual(r.result.recent.map((s) => s.name).filter((n) => n === 'hurt'), ['hurt']);
      const cue = minus(both, bed), full = loudest(cue, both.sr, T), small = loudest(laptop(cue, both.sr), both.sr, T);
      const over = full.level - rmsDb(bed.x, bed.sr, full.at, full.at + 0.06), overSmall = small.level - rmsDb(bedSmall, bed.sr, small.at, small.at + 0.06);
      rows.push(`${zone} ${kind} ${amount}: +${over.toFixed(1)} dB, laptop +${overSmall.toFixed(1)} dB, peak ${db(peakOf(both.x)).toFixed(1)} dB`);
      assert.ok(overSmall >= 10, `${zone}: ${kind} ${amount} HP is ${overSmall.toFixed(1)} dB over the bed on a laptop speaker (it was 0.2 to 3.9)`);
      assert.ok(over >= 8, `${zone}: ${kind} ${amount} HP is ${over.toFixed(1)} dB over the bed`);
      assert.ok(peakOf(both.x) < 0.8, `${zone}: ${kind} peaks at ${peakOf(both.x).toFixed(3)}`);
    }
  }
  // the bed gives way as it does under a shot (5 dB for 200 ms) and is whole again after: a wire note on the music bus,
  // the street's wind on the ambience bus (the same render with and without the blow: only the step differs)
  for (const [tap, script] of [['music', [cue(T - 0.3, 'checkpoint')]], ['ambience', []]]) {
    const o = { zone: 'plenty_street', quiet: false, tap };
    await renderScript(game, script, 2, o);
    const bedOnly = await grab(game);
    await renderScript(game, [...script, damaged(T, 22, 'stake', 'transit')], 2, o);
    const ducked = await grab(game);
    const at = (x, a, b) => rmsDb(x.x, x.sr, T + a, T + b);
    assert.ok(at(bedOnly, 0.02, 0.18) > -70, `the ${tap} bus sounds at the moment of the blow (${at(bedOnly, 0.02, 0.18).toFixed(1)} dB)`);
    const step = at(ducked, 0.02, 0.18) - at(bedOnly, 0.02, 0.18);
    assert.ok(step <= -4 && step >= -6, `the ${tap} bus under a hurt, 20-180 ms: ${step.toFixed(1)} dB`);
    assert.ok(Math.abs(at(ducked, 0.4, 1.2) - at(bedOnly, 0.4, 1.2)) < 0.5, `the ${tap} bus is whole again from 400 ms: ${(at(ducked, 0.4, 1.2) - at(bedOnly, 0.4, 1.2)).toFixed(2)} dB`);
    assert.ok(Math.abs(at(ducked, -0.3, -0.01) - at(bedOnly, -0.3, -0.01)) < 0.1, `the ${tap} bus is untouched before the blow`);
    rows.push(`${tap} under it ${step.toFixed(1)} dB`);
  }
  // from her right, then from her left (the script's listener looks down -Z)
  const right = await renderScript(game, [damaged(T, 22, 'stake', 'transit', 8, 0)], 1.4, { zone: 'the_lip', quiet: true }, [['balance', T, T + 0.2]]);
  const left = await renderScript(game, [damaged(T, 22, 'stake', 'transit', -8, 0)], 1.4, { zone: 'the_lip', quiet: true }, [['balance', T, T + 0.2]]);
  const ahead = await renderScript(game, [damaged(T, 22, 'stake', 'transit', 0, -8)], 1.4, { zone: 'the_lip', quiet: true }, [['balance', T, T + 0.2]]);
  assert.ok(right.probes[0] >= 3 && right.probes[0] <= 12, `from the right: right over left ${right.probes[0].toFixed(1)} dB`);
  assert.ok(left.probes[0] <= -3 && left.probes[0] >= -12, `from the left: right over left ${left.probes[0].toFixed(1)} dB`);
  assert.ok(Math.abs(ahead.probes[0]) < 1, `from ahead: right over left ${ahead.probes[0].toFixed(1)} dB`);
  rows.push(`right over left: from the right ${right.probes[0].toFixed(1)}, the left ${left.probes[0].toFixed(1)}, ahead ${ahead.probes[0].toFixed(1)} dB`);
  console.log(`i4: hurt in the mix: ${rows.join('; ')}`);
});

// ---- issue: "Ordinary hit confirm is marginal outdoors" ------------------------------------------------------------
// The reviewer's measure (scratch/reg-combat/audio.mjs), its payloads, ambience and music running: the loudest 60 ms of
// (shot + confirm) - (shot) against the shot alone in that window. Before (scratch/i4-team-audio/before.log):
//   street hit +2.5, weak +2.0, Tamper's plate +1.8, parry +3.3; the Lip +2.7 / +1.7 / +1.6; the gallery +1.0 / -0.1 / 0.0;
//   the Tally House +4.8 / +3.7 / +3.4. After: the street +9.5 / +7.5 / +8.5, the gallery +9.2 / +7.2 / +7.3.
test('in the open, the Tally House and the gallery, with ambience and music, a hit, a weak point, a parry, a kill and a round off the Tamper\'s plate stand 5 dB over the report\'s tail', async () => {
  const T = 0.2, rows = [];
  const step = (outcome, entityKind) => ({ t: T, ev: 'combat/hit', p: { x: 0, y: 1.2, z: -10, outcome, entityKind, part: 'body', surface: 'cloth', ammo: 'lead_round' } });
  const shotEv = { t: T, ev: 'weapon/fired', p: { ammo: 'lead_round', chambersLeft: 4, shotId: 1 } };
  for (const zone of ['the_lip', 'plenty_street', 'tally_house', 'the_gallery', 'far_rim']) {
    const o = { zone, quiet: false };
    await renderScript(game, [shotEv], 1.6, o);
    const shot = await grab(game);
    const first = rmsDb(shot.x, shot.sr, T, T + 0.06), shotPeak = peakOf(shot.x);
    const overs = {};
    for (const [outcome, kind] of [['hit', 'bider'], ['weak', 'bider'], ['parried', 'bider'], ['kill', 'bider'], ['deflected', 'tamper'], ['deflected', 'windlass'], ['freed', 'bider']]) {
      const r = await renderScript(game, [shotEv, step(outcome, kind)], 1.6, o);
      const both = await grab(game);
      const diff = minus(both, shot), added = loudest(diff, both.sr, T);
      const over = added.level - rmsDb(shot.x, shot.sr, added.at, added.at + 0.06);
      overs[outcome + '/' + kind] = over;
      rows.push(`${zone} ${outcome}/${kind} +${over.toFixed(1)}`);
      assert.equal(r.result.recent.length, 2, `${outcome}: the report and its confirm`);
      assert.ok(over >= 5, `${zone}: ${outcome}/${kind} is ${over.toFixed(1)} dB against the bed at ${Math.round((added.at - T) * 1000)} ms (the street's hit was +2.5, its weak point +2.0, the Tamper's plate +1.8)`);
      // the gun is still the star: the confirm is under the report's first 60 ms, waits for it, and adds no peak
      assert.ok(added.at - T >= 0.179, `${zone}: ${outcome} is loudest ${Math.round((added.at - T) * 1000)} ms after the click`);
      assert.ok(added.level <= first - 3, `${zone}: ${outcome}/${kind} at ${added.level.toFixed(1)} dB is under the report's first 60 ms (${first.toFixed(1)} dB)`);
      assert.ok(peakOf(both.x) <= shotPeak + 0.005, `${zone}: ${outcome} adds no peak (${peakOf(both.x).toFixed(3)} against ${shotPeak.toFixed(3)})`);
    }
    // a kill is never a smaller answer than a hit
    assert.ok(overs['kill/bider'] >= overs['hit/bider'] - 1.5, `${zone}: the kill +${overs['kill/bider'].toFixed(1)} dB, the hit +${overs['hit/bider'].toFixed(1)} dB`);
  }
  console.log(`i4: confirm over the bed with ambience and music, the reviewer's measure: ${rows.join('; ')}`);
});

// The Tamper lives in the hall: its plate stood +4.1 dB over the bed there and +2.2 dB in the bore, on a clank whose
// energy (centroid 328 Hz) sat where the report's tail does. It rings at 960 Hz now.
test('a round off the Tamper\'s plate: the clank has a ring over the report\'s tail and is no longer the flat deflect', async () => {
  const clank = await render(game, 'tamper_clank', {}, [['band', 0, 0.3, 700, 1300], ['centroid', 0, 0.3]]);
  const flat = await render(game, 'hit_deflect', {}, [['centroid', 0, 0.3]]);
  assert.ok(clank.probes[0] >= 0.1, `tamper_clank: ${(clank.probes[0] * 100).toFixed(0)} % of its energy at 700-1300 Hz`);
  assert.ok(clank.probes[1] >= 420 && clank.probes[1] <= 900, `tamper_clank: centroid ${Math.round(clank.probes[1])} Hz (it was 328 Hz)`);
  assert.ok(flat.probes[0] >= clank.probes[1] * 1.5, `the Windlass's guard (${Math.round(flat.probes[0])} Hz) is still the higher of the two (${Math.round(clank.probes[1])} Hz)`);
  const T = 0.2, rows = [];
  const step = { t: T, ev: 'combat/hit', p: { x: 0, y: 1.2, z: -10, outcome: 'deflected', entityKind: 'tamper', part: 'body', surface: 'cloth', ammo: 'lead_round' } };
  const shotEv = { t: T, ev: 'weapon/fired', p: { ammo: 'lead_round', chambersLeft: 4, shotId: 1 } };
  for (const [zone, floor] of [['lift_hall', 5], ['the_bore', 2.5]]) {
    const o = { zone, quiet: false };
    await renderScript(game, [shotEv], 1.6, o); const shot = await grab(game);
    await renderScript(game, [shotEv, step], 1.6, o); const both = await grab(game);
    const added = loudest(minus(both, shot), both.sr, T);
    const over = added.level - rmsDb(shot.x, shot.sr, added.at, added.at + 0.06);
    // in its own ring, over the shot alone
    const ring = (x) => rmsDb(bandpass(x.x, x.sr, 960, 6), x.sr, T + 0.2, T + 0.3);
    rows.push(`${zone} +${over.toFixed(1)} dB (960 Hz +${(ring(both) - ring(shot)).toFixed(1)} dB)`);
    assert.ok(over >= floor, `${zone}: the Tamper's plate is ${over.toFixed(1)} dB against the bed (wanted ${floor}; it was ${zone === 'lift_hall' ? 4.1 : 2.2})`);
    assert.ok(ring(both) - ring(shot) >= 6, `${zone}: the ring at 960 Hz is ${(ring(both) - ring(shot)).toFixed(1)} dB over the shot alone`);
  }
  console.log(`i4: the Tamper's plate over the bed: ${rows.join('; ')}; centroid ${Math.round(clank.probes[1])} Hz`);
});
