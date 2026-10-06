// Tuning (work order section 6): the story is told in pitch. Jugs in D Dorian, the hum 20 cents flat, the line round
// 8 cents sharp, and the kept round the only sound exactly in tune, with no noise and no room.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { audioServer, cents, degree, ev, openBoard, render, renderScript } from './lib.mjs';

let server, game;
before(async () => { server = await audioServer(); game = await openBoard(server); });
after(async () => { await game.close(); await server.close(); });

test('the bell voice: jugs 1-7 within 5 cents of D Dorian from D3, clay 0.25 s; latches 1.2 s; the lens two octaves up, 1.8 s', async () => {
  const off = [];
  for (let d = 1; d <= 7; d++) {
    const r = await render(game, 'jug', { a: d }, [['partial', 0, 0.25, degree(d, 4) * 0.9, degree(d, 4) * 1.1], ['lastAbove', 0, 1, -50], ['band', 0, 0.25, 4000, 24000]]);
    const c = cents(r.probes[0], degree(d, 4));
    assert.ok(Math.abs(c) <= 5, `jug ${d}: ${r.probes[0].toFixed(2)} Hz is ${c.toFixed(2)} cents from degree ${d}`);
    assert.ok(Math.abs(r.stats.duration - 0.25) <= 0.03, `jug ${d} decays in 0.25 s: ${r.stats.duration}`);
    assert.ok(r.probes[2] < 0.01, `clay is low-passed: ${r.probes[2]} of its energy above 4 kHz`);
    off.push(c);
  }
  // the octave is D4..C5: degree 1 is two times D3
  assert.ok(Math.abs(cents((await render(game, 'jug', { a: 1 })).stats.fundamentalHz, 146.83 * 2)) <= 5);
  const latch = await render(game, 'bell_long', { a: 3 }, [['partial', 0, 1, 300, 400], ['partial', 0, 0.3, 900, 1050]]);
  assert.ok(Math.abs(cents(latch.probes[0], degree(3, 4))) <= 5);
  assert.ok(Math.abs(latch.probes[1] / degree(3, 4) - 2.76) < 0.03, `the inharmonic partial at x2.76: x${(latch.probes[1] / degree(3, 4)).toFixed(3)}`);
  assert.ok(Math.abs(latch.stats.duration - 1.2) <= 0.06, `latch 1.2 s (to -60 dB under its strike, within 5 %): ${latch.stats.duration}`);
  // whatever the note: the beat of the two sines never puts a null on the end of the ring
  const rings = [];
  for (let d = 1; d <= 7; d++) rings.push((await render(game, 'bell_long', { a: d })).stats.duration);
  for (const d of rings) assert.ok(Math.abs(d - 1.2) <= 0.06, `latch degrees 1-7 ring ${rings.map((v) => v.toFixed(2)).join(', ')} s`);
  for (const d of [1, 3, 5]) {
    const plate = await render(game, 'plate', { a: d }, [['partial', 0, 0.5, degree(d, 5) * 0.9, degree(d, 5) * 1.1]]);
    assert.ok(Math.abs(cents(plate.probes[0], degree(d, 5))) <= 5, `range plate ${d}`);
  }
  const lens = await render(game, 'lens_bell', {}, [['partial', 0, 1.5, 800, 950]]);
  assert.ok(Math.abs(cents(lens.probes[0], degree(5, 3) * 4)) <= 5, `the lens: degree 5, two octaves up: ${lens.probes[0]}`);
  assert.ok(Math.abs(lens.stats.duration - 1.8) <= 0.09, `lens 1.8 s (within 5 %): ${lens.stats.duration}`);
  const knot = await render(game, 'knot_burst', {}, [['partial', 0, 0.06, 380, 480], ['partial', 0.42, 0.6, 280, 380]]);
  assert.ok(Math.abs(cents(knot.probes[1], knot.probes[0]) + 500) < 40, `the knot falls a fourth: ${cents(knot.probes[1], knot.probes[0]).toFixed(0)} cents`);
  for (let m = 1; m <= 6; m++) {
    const ch = await render(game, 'chamber', { a: m }, [['partial', 0, 0.8, degree(m, 3) * 0.9, degree(m, 3) * 1.1]]);
    assert.ok(Math.abs(cents(ch.probes[0], degree(m, 3))) <= 5, `chamber ${m}`);
  }
  console.log(`tuning: jugs 1-7 off by ${off.map((c) => c.toFixed(2)).join(', ')} cents; latch ${latch.stats.duration.toFixed(2)} s (degrees 1-7: ${rings.map((v) => v.toFixed(2)).join(', ')}); lens ${lens.probes[0].toFixed(1)} Hz, ${lens.stats.duration.toFixed(2)} s; knot falls ${(-cents(knot.probes[1], knot.probes[0])).toFixed(0)} cents`);
});

test('the station hum: D2 and A2, both 20 +- 3 cents flat, beating slowly; under every underground zone and no other', async () => {
  const D2 = 146.83 / 2, A2 = degree(5, 2);
  const levels = {};
  for (const zone of ['the_lip', 'plenty_street', 'tally_house', 'the_gallery', 'lift_hall', 'the_bore', 'far_rim']) {
    const r = await renderScript(game, [], 16, { zone, tap: 'ambience' }, [['partial', 4, 16, 68, 78], ['partial', 4, 16, 104, 115], ['band', 4, 16, 70, 76], ['rmsDb', 4, 16], ['band', 4, 16, 58, 64], ['band', 4, 16, 82, 88]]);
    const underground = zone === 'the_gallery' || zone === 'lift_hall' || zone === 'the_bore';
    levels[zone] = +(r.probes[3] + 10 * Math.log10(Math.max(1e-12, r.probes[2]))).toFixed(1);     // level of the D2 band, dB
    // a tone stands out of the bands either side of it; air and wind do not
    const standsOut = r.probes[2] / Math.max(1e-12, (r.probes[4] + r.probes[5]) / 2);
    if (underground) {
      const d = cents(r.probes[0], D2), a = cents(r.probes[1], A2);
      assert.ok(Math.abs(d + 20) <= 3, `${zone}: D2 is ${d.toFixed(2)} cents`);
      assert.ok(Math.abs(a + 20) <= 3, `${zone}: A2 is ${a.toFixed(2)} cents`);
      assert.ok(standsOut > 30, `${zone}: the hum stands ${standsOut.toFixed(0)} times above its neighbours`);
      levels[zone + '_cents'] = [+d.toFixed(2), +a.toFixed(2)];
    } else assert.ok(standsOut < 4, `${zone} has no machine: the D2 band is ${standsOut.toFixed(1)} times its neighbours`);
  }
  assert.ok(levels.the_bore > levels.lift_hall && levels.lift_hall > levels.the_gallery, 'louder as she goes down');
  // slow beating: the level of the D2 pair alone rises and falls over seconds
  await renderScript(game, [], 16, { zone: 'the_gallery', tap: 'ambience' });
  const env = await game.page.evaluate(() => window.__dbg.ext.audio.envelopeDb(0.5).slice(8));
  assert.ok(Math.max(...env) - Math.min(...env) > 1, `the hum beats: ${env.join(' ')}`);
  console.log(`tuning: hum D2 / A2 cents: gallery ${levels.the_gallery_cents}, hall ${levels.lift_hall_cents}, bore ${levels.the_bore_cents}; D2 band level ${levels.the_gallery} / ${levels.lift_hall} / ${levels.the_bore} dB; on the lip ${levels.the_lip} dB (wind, no tone)`);
});

test('the kept round: D4 and D5 within 1 cent, 3.5 s, no noise above -60 dB after 120 ms, no reverb send, the report cut', async () => {
  const D4 = 146.83 * 2, D5 = 146.83 * 4;
  const tone = await render(game, 'kept_tone', { total: 4 }, [['partial', 0.2, 3.2, 250, 340], ['partial', 0.2, 3.2, 540, 640], ['lastAbove', 0, 4, -100]]);
  assert.ok(Math.abs(cents(tone.probes[0], D4)) <= 1, `D4: ${cents(tone.probes[0], D4)} cents`);
  assert.ok(Math.abs(cents(tone.probes[1], D5)) <= 1, `D5: ${cents(tone.probes[1], D5)} cents`);
  assert.ok(Math.abs(tone.stats.duration - 3.5) <= 0.1, `3.5 s: ${tone.stats.duration}`);
  assert.ok(tone.probes[2] <= 3.52, `and then nothing: last sample at ${tone.probes[2]}`);
  // the whole shot in the bore, the longest room in the game, with everything else running
  const script = [ev(0, 'boss/phase', { phase: 'p3a', from: 'p2' }), ev(2, 'weapon/kept', { stage: 'fired', mark: 'm' })];
  const shot = await renderScript(game, script, 7, { zone: 'the_bore', quiet: true }, [
    ['band', 2.14, 5.3, D4 - 12, D4 + 12], ['band', 2.14, 5.3, D5 - 12, D5 + 12], ['peak', 2, 2.12], ['partial', 2.2, 5.2, 250, 340], ['partial', 2.2, 5.2, 540, 640], ['lastAbove', 2, 7, -100],
  ]);
  const noise = 1 - shot.probes[0] - shot.probes[1];
  const noiseDb = 10 * Math.log10(Math.max(1e-12, noise));
  assert.ok(noiseDb < -60, `everything that is not D4 or D5 after 120 ms: ${noiseDb.toFixed(1)} dB`);
  assert.ok(shot.probes[2] > 0.4, `the report is there for its 120 ms: peak ${shot.probes[2]}`);
  assert.ok(Math.abs(cents(shot.probes[3], D4)) <= 1 && Math.abs(cents(shot.probes[4], D5)) <= 1, 'in tune through the whole graph');
  assert.ok(shot.probes[5] <= 2 + 3.52, `nothing rings on: last sample at ${shot.probes[5] - 2} s after the shot`);
  assert.deepEqual(shot.result.recent.map((s) => s.name), ['gun_report_kept', 'kept_tone']);
  const room = await renderScript(game, script, 7, { zone: 'the_bore', quiet: true, tap: 'reverb' });
  assert.equal(room.result.peak, 0, 'no echo: nothing of the kept shot reaches the reverb');
  // against it: a lead round in the same room does ring
  const lead = await renderScript(game, [{ t: 2, ev: 'weapon/fired', p: { shotId: 1, ammo: 'lead_round', chambersLeft: 5, ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: -1, mx: 0, my: 0, mz: 0, endX: 0, endY: 0, endZ: -1 } }], 7, { zone: 'the_bore', quiet: true, tap: 'reverb' });
  assert.ok(lead.result.peak > 0.01, 'a lead round has a tail');
  console.log(`tuning: kept round D4 ${cents(shot.probes[3], D4).toFixed(3)} cents, D5 ${cents(shot.probes[4], D5).toFixed(3)} cents, ${tone.stats.duration.toFixed(3)} s, noise floor after 120 ms ${noiseDb.toFixed(1)} dB, reverb send peak ${room.result.peak} (a lead round: ${lead.result.peak.toFixed(3)})`);
});

test('the station voice: a three-note chime in the flat tuning, then one blip per word pitched by its length; it fits the line', async () => {
  const chime = await render(game, 'station_chime', {}, [['partial', 0, 0.12, 250, 340], ['partial', 0.13, 0.25, 400, 480], ['partial', 0.27, 0.6, 650, 750]]);
  const want = [degree(1, 4), degree(5, 4), degree(10, 4)];
  for (let k = 0; k < 3; k++) assert.ok(Math.abs(cents(chime.probes[k], want[k]) + 20) <= 4, `chime note ${k + 1}: ${cents(chime.probes[k], want[k]).toFixed(1)} cents`);
  const text = 'DAYLIGHT. HEADWORKS WAKING.';
  const line = await render(game, 'station_line', { text, seconds: 3 });
  assert.ok(line.stats.duration <= 3.0 && line.stats.duration > 1.0, `fits its 3 s: ${line.stats.duration}`);
  const env = await game.page.evaluate(() => window.__dbg.ext.audio.envelopeDb(0.02));
  // after the chime (0.55 s): bursts separated by silence, one per word
  let blips = 0, on = false;
  for (let i = Math.round(0.56 / 0.02); i < env.length; i++) { const loud = env[i] > -45; if (loud && !on) blips++; on = loud; }
  assert.equal(blips, 3, `three words, three blips: ${blips}`);
  const long = await render(game, 'station_line', { text: 'LIFT STATION 4. SURFACE POWER: WIND. THANK YOU FOR YOUR PATIENCE.', seconds: 5.5 });
  assert.ok(long.stats.duration <= 5.5 && long.stats.duration > 3, `fits its 5.5 s: ${long.stats.duration}`);
  console.log(`tuning: chime ${chime.probes.map((f, k) => cents(f, want[k]).toFixed(1)).join(', ')} cents; "${text}" ${blips} blips in ${line.stats.duration.toFixed(2)} s`);
});
