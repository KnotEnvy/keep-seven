// Music, ducking and reverb (work order section 6).
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { audioServer, db, ev, fired, openBoard, openIndex, pcm, renderScript, rms } from './lib.mjs';

let server, game;
before(async () => { server = await audioServer(); game = await openBoard(server); });
after(async () => { await game.close(); await server.close(); });

test('ducking: the music bus drops 5 +- 1 dB for 200 +- 30 ms on a shot, and so does the ambience', async () => {
  for (const tap of ['music', 'ambience']) {
    // the same six seconds twice, with and without a shot at 4 s: their ratio is the duck, whatever the bed is doing
    const zone = tap === 'music' ? 'the_lip' : 'the_gallery';
    await renderScript(game, [], 6, { zone, tap, seed: 2 });
    const flat = await pcm(game);
    await renderScript(game, [fired(4)], 6, { zone, tap, seed: 2 });
    const shot = await pcm(game);
    const sr = shot.sampleRate, w = 0.02;
    const gain = (t) => db(rms(shot.data, sr, t, t + w) / rms(flat.data, sr, t, t + w));
    assert.ok(Math.abs(gain(3.9)) < 0.2, `no duck before the shot: ${gain(3.9)} dB`);
    const depth = gain(4.08);
    assert.ok(Math.abs(depth + 5) <= 1, `${tap}: ducked ${depth.toFixed(2)} dB`);
    // how long it stays more than half-way down
    let from = -1, to = -1;
    for (let t = 3.95; t < 4.5; t += 0.002) { const d = gain(t - w / 2); if (d < -2.5) { if (from < 0) from = t; to = t; } }
    const held = to - from;
    assert.ok(Math.abs(held - 0.2) <= 0.03, `${tap}: ducked for ${(held * 1000).toFixed(0)} ms`);
    assert.ok(Math.abs(gain(4.4)) < 0.3, `back afterwards: ${gain(4.4)} dB`);
    console.log(`music: ${tap} bus ducks ${depth.toFixed(2)} dB for ${(held * 1000).toFixed(0)} ms per shot`);
  }
});

test('the combat layer enters over 1 s, runs at 96 bpm, and cuts to nothing on encounter/cleared', async () => {
  const script = [{ t: 1.9, threat: 7 }, ev(2, 'encounter/started', { id: 'enc_file' }), ev(12, 'encounter/cleared', { id: 'enc_file', seconds: 10 })];
  // the bore has no drone and the wire is silent in combat: the music bus carries the combat layer alone
  const r = await renderScript(game, script, 16, { zone: 'the_bore', tap: 'music' }, [['peak', 2, 2.3], ['peak', 4.5, 7], ['rmsDb', 0.5, 1.9], ['peakDb', 12.03, 15.9], ['peak', 11, 12]]);
  assert.ok(r.probes[0] < r.probes[1] * 0.5 && r.probes[0] > 0, `enters over a second: first hit ${r.probes[0]}, later ${r.probes[1]}`);
  assert.ok(r.probes[2] < -100, 'nothing before the encounter');
  assert.ok(r.probes[4] > 0.05 && r.probes[3] < -70, `cuts to nothing: ${r.probes[4]} then ${r.probes[3]} dB`);
  const drums = r.result.recent.filter((s) => s.name === 'drum').map((s) => s.tick);
  // driving pattern: ten hits a bar of 2.5 s (150 ticks)
  const perBar = drums.filter((t) => t >= 120 + 150 && t < 120 + 300).length;
  assert.equal(perBar, 10, `ten hits in a driving bar: ${perBar}`);
  assert.deepEqual(r.result.music.map((m) => `${m.state}:${m.intensity}@${m.tick}`), ['calm:0@0', 'combat:3@120', 'calm:0@720']);
  // 96 bpm: the downbeats of consecutive bars are 2.5 s apart in the audio
  await renderScript(game, [{ t: 0.9, threat: 1 }, ev(1, 'encounter/started', { id: 'enc_file' })], 9, { zone: 'the_bore', tap: 'music' });
  const x = await pcm(game);
  const onsets = [];
  for (let t = 0.9; t < 8.9; t += 0.001) { if (rms(x.data, x.sampleRate, t, t + 0.004) > 0.02 && rms(x.data, x.sampleRate, t - 0.05, t - 0.002) < 0.004) { onsets.push(t); t += 0.3; } }
  const down = onsets.filter((_, i) => i % 2 === 0);
  assert.ok(down.length >= 3, `sparse: two hits a bar: ${onsets.map((t) => t.toFixed(3)).join(' ')}`);
  for (let i = 1; i < down.length; i++) assert.ok(Math.abs(down[i] - down[i - 1] - 2.5) < 0.004, `a bar is 2.5 s at 96 bpm: ${down[i] - down[i - 1]}`);
  console.log(`music: combat layer first hit ${r.probes[0].toFixed(3)} -> ${r.probes[1].toFixed(3)}; after cleared ${r.probes[3]} dB; driving bar ${perBar} hits; sparse downbeats ${down.map((t) => t.toFixed(3)).join(', ')} s`);
});

test('the boss: a drum hit lands within 20 ms of every boss/discharge (1.1 s cadence)', async () => {
  const times = [2, 3.1, 4.2, 5.3, 6.4, 7.5];
  const script = [ev(0, 'boss/phase', { phase: 'p1', from: 'parley' }), ...times.map((t) => ev(t, 'boss/discharge', { kind: 'stake', mouth: 1, glowSeconds: 0.9, parryable: true }))];
  for (const tap of ['music', 'master']) {
    await renderScript(game, script, 9, { zone: 'the_bore', tap, quiet: false });
    const x = await pcm(game);
    if (tap === 'master') continue;                       // rendered for the shot of it; onsets are measured on the bus
    const late = [];
    for (const t of times) {
      let onset = -1;
      for (let u = t - 0.05; u < t + 0.2; u += 0.0005) if (Math.abs(x.data[Math.round(u * x.sampleRate)]) > 0.02) { onset = u; break; }
      assert.ok(onset >= 0, `a drum at ${t}`);
      late.push(onset - t);
      // the limiter after the bus looks 6 ms ahead: the hit must still be inside 20 ms at the output
      assert.ok(onset - t >= -0.001 && onset - t + 0.006 <= 0.02, `drum ${(onset - t) * 1000} ms after the discharge at ${t}`);
    }
    console.log(`music: boss drum ${late.map((v) => (v * 1000).toFixed(1)).join(', ')} ms after each discharge (+6 ms through the limiter)`);
  }
});

test('in the game: music/state within a second of encounter/started (it is the same tick), calm on the tick of cleared, intensity by threat', async () => {
  const index = await openIndex(server);
  try {
    const out = await index.page.evaluate(async () => {
      const dbg = window.__dbg, core = dbg.ext.core;
      const tick = () => dbg.state().tick;
      const last = () => dbg.events(0, 'music/state').at(-1);
      const log = [];
      await core.stepAsync(30);
      log.push(['calm', last().payload, 0]);
      dbg.god(true); dbg.aiEnabled(false);
      dbg.emit('encounter/started', { id: 'enc_street' });
      log.push(['started', last().payload, last().tick - tick()]);
      const p = dbg.player();
      dbg.spawnEnemy('bider', p.x + 12, p.y, p.z, 0); await core.stepAsync(2);
      log.push(['threat1', last().payload, dbg.ext.core.ctx().enemies.threat]);
      dbg.spawnEnemy('transit', p.x + 14, p.y, p.z + 2, 0); dbg.spawnEnemy('bider', p.x + 12, p.y, p.z - 3, 0); await core.stepAsync(2);
      log.push(['threat4', last().payload, dbg.ext.core.ctx().enemies.threat]);
      dbg.spawnEnemy('tamper', p.x + 16, p.y, p.z + 4, 0); await core.stepAsync(2);
      log.push(['threat9', last().payload, dbg.ext.core.ctx().enemies.threat]);
      dbg.pause(true);
      log.push(['paused', last().payload, 0]);
      dbg.pause(false);
      log.push(['resumed', last().payload, 0]);
      dbg.killAll(false); await core.stepAsync(2);
      log.push(['held', last().payload, dbg.ext.core.ctx().enemies.threat]);
      await core.stepAsync(58);
      log.push(['killed', last().payload, dbg.ext.core.ctx().enemies.threat]);
      dbg.emit('encounter/cleared', { id: 'enc_street', seconds: 12 });
      log.push(['cleared', last().payload, last().tick - tick()]);
      return { log, emitters: dbg.events(0, 'music/state').length };
    });
    const by = Object.fromEntries(out.log.map(([k, p, extra]) => [k, { ...p, extra }]));
    assert.deepEqual([by.calm.state, by.calm.intensity], ['calm', 0]);
    assert.deepEqual([by.started.state, by.started.extra], ['combat', 0], 'combat on the tick of encounter/started');
    assert.deepEqual([by.threat1.intensity, by.threat4.intensity, by.threat9.intensity], [1, 2, 3], `intensity follows threat ${by.threat1.extra}, ${by.threat4.extra}, ${by.threat9.extra}`);
    assert.equal(by.paused.state, 'silent');
    assert.deepEqual([by.resumed.state, by.resumed.intensity], ['combat', 3]);
    assert.deepEqual([by.held.state, by.held.intensity], ['combat', 3], 'the intensity comes down only after the threat has stayed lower for 0.75 s');
    assert.deepEqual([by.killed.state, by.killed.intensity], ['combat', 1], 'the fight is not over until the encounter says so');

    assert.deepEqual([by.cleared.state, by.cleared.intensity, by.cleared.extra], ['calm', 0, 0], 'calm on the tick of encounter/cleared');
    console.log(`music: in the game ${out.log.map(([k, p]) => `${k} ${p.state}:${p.intensity}`).join(', ')}`);
  } finally { await index.close(); }
});

test('reverb: the measured tail (-60 dB) of each zone is within 20 % of 1.3 / 0.5 / 0.9 / 2.2 / 2.8 s; outdoors slaps at 320 ms', async () => {
  const rooms = await game.page.evaluate(async () => { const a = window.__dbg.ext.audio, out = []; for (const z of a.zones()) out.push(await a.renderRoom(z)); return out; });
  const want = { the_lip: 1.3, plenty_street: 1.3, far_rim: 1.3, tally_house: 0.5, the_gallery: 0.9, lift_hall: 2.2, the_bore: 2.8 };
  for (const r of rooms) {
    assert.equal(r.target, want[r.zone]);
    assert.ok(Math.abs(r.tail60 / r.target - 1) <= 0.2, `${r.zone}: tail ${r.tail60} s, wanted ${r.target} s`);
    if (r.target === 1.3) assert.ok(Math.abs(r.slapAt - 0.32) <= 0.015, `${r.zone}: slap at ${r.slapAt}`);
  }
  // and the gun really is answered differently in each: the level of its tail between 0.4 and 1.4 s
  const tails = {};
  for (const zone of ['the_lip', 'tally_house', 'the_gallery', 'lift_hall', 'the_bore']) {
    const r = await renderScript(game, [fired(0.5)], 4, { zone, quiet: true }, [['rmsDb', 0.9, 1.9], ['rmsDb', 0.82, 0.86], ['rmsDb', 0.76, 0.8]]);
    tails[zone] = r.probes.map((v) => +v.toFixed(1));
  }
  assert.ok(tails.the_bore[0] > tails.lift_hall[0] && tails.lift_hall[0] > tails.the_lip[0] && tails.the_lip[0] > tails.the_gallery[0] && tails.the_gallery[0] > tails.tally_house[0], JSON.stringify(tails));
  assert.ok(tails.the_lip[1] > tails.the_lip[2] + 3, `the slap stands out of the tail at 320 ms: ${tails.the_lip[1]} over ${tails.the_lip[2]} dB`);
  console.log(`reverb: tails ${rooms.filter((r, i) => rooms.findIndex((q) => q.kind === r.kind) === i).map((r) => `${r.kind} ${r.tail60.toFixed(2)} s (wanted ${r.target}, Schroeder T30 ${r.t30.toFixed(2)})`).join(', ')}; slap at ${(rooms[0].slapAt * 1000).toFixed(0)} ms; gun tail 0.4-1.4 s: ${Object.entries(tails).map(([z, v]) => `${z} ${v[0]} dB`).join(', ')}`);
});

test('game/state: paused mutes every game bus (the menu still clicks) and resumes cleanly; dead sinks through a low-pass over 0.6 s', async () => {
  const state = (t, from, to) => ev(t, 'game/state', { from, to, reason: 'test' });
  const ui = (t) => ({ t, ev: 'audio/cue', p: { cue: 'ui_select', x: 0, y: 0, z: 0, positional: false, gain: 1, pitch: 1 } });
  const paused = await renderScript(game, [state(3, 'playing', 'paused'), ui(4), fired(4.5), state(5, 'paused', 'playing')], 7, { zone: 'plenty_street' },
    [['rmsDb', 1.5, 2.9], ['rmsDb', 3.15, 3.95], ['peak', 4.0, 4.3], ['peakDb', 4.5, 4.95], ['rmsDb', 5.5, 6.9]]);
  const [play, mute, menu, shot, back] = paused.probes;
  assert.ok(mute < -80, `paused: the world is silent (${mute} dB)`);
  assert.ok(menu > 0.01, `but the menu sounds: ${menu}`);
  assert.ok(shot < -80, `a sound started while paused is not heard: ${shot} dB`);
  assert.ok(Math.abs(back - play) < 4, `resumed: ${play.toFixed(1)} -> ${back.toFixed(1)} dB`);
  assert.deepEqual(paused.result.music.map((m) => m.state), ['calm', 'silent', 'calm']);
  const dead = await renderScript(game, [state(3, 'playing', 'dead'), state(6, 'dead', 'loading'), state(6.2, 'loading', 'playing')], 8, { zone: 'plenty_street' },
    [['centroid', 1.5, 2.9], ['centroid', 3.7, 5.8], ['centroid', 6.7, 7.9], ['rmsDb', 1.5, 2.9], ['rmsDb', 3.7, 5.8]]);
  const [bright, sunk, again, before, under] = dead.probes;
  assert.ok(sunk < bright * 0.5, `dead: centroid ${bright.toFixed(0)} -> ${sunk.toFixed(0)} Hz, ${before.toFixed(1)} -> ${under.toFixed(1)} dB`);
  // the same seconds of the same seed with nobody dying: the scene after the respawn is the scene it would have been
  const alive = await renderScript(game, [], 8, { zone: 'plenty_street' }, [['centroid', 6.7, 7.9], ['centroid', 3.7, 5.8]]);
  assert.ok(Math.abs(again / alive.probes[0] - 1) < 0.1, `back after the respawn: ${again.toFixed(0)} Hz, ${alive.probes[0].toFixed(0)} Hz without the death`);
  assert.ok(sunk < alive.probes[1] * 0.5, `while dead: ${sunk.toFixed(0)} Hz against ${alive.probes[1].toFixed(0)} Hz alive`);
  console.log(`music: paused ${play.toFixed(1)} -> ${mute} dB with the menu at ${menu.toFixed(3)}, resumed ${back.toFixed(1)} dB; dead: centroid ${bright.toFixed(0)} -> ${sunk.toFixed(0)} -> ${again.toFixed(0)} Hz (level ${before.toFixed(1)} -> ${under.toFixed(1)} dB: the drone is below the cut)`);
});
