// The skeleton every phase-4 critic extends (ARCHITECTURE 11.4): for each checkpoint in order, followPath to its marker
// with god mode on and enemies.debug.killAll at each encounter, a frame at each checkpoint, a perfRun(120) inside each
// encounter volume, and the wall-clock-free playtime. On the greybox it proves the route; with the real systems it becomes
// GDD 21's scripted run (the kill-all replaced by aimed shots).
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, assertBudget, openGame, startServer } from '../harness.mjs';
import { CHECKPOINTS, CHECKPOINT_ACTS, ENCOUNTERS, LAYOUT, MiB, PIECES, STUBS, walk } from './route.mjs';

const PIECE = 'foundation-core';
let server;
before(async () => { server = await startServer({ pieces: PIECES }); });
after(async () => { await server.close(); });

const marker = (id) => LAYOUT.markers.find((m) => m.id === id);
/** the encounters whose trigger lies between the previous checkpoint and this one on the route (by the layout's onClear) */
const ENCOUNTER_BEFORE = Object.fromEntries(LAYOUT.encounters.filter((e) => e.onClear.checkpoint).map((e) => [e.onClear.checkpoint, e.id]));
ENCOUNTER_BEFORE.cp_rim = 'enc_windlass';              // the boss has no onClear checkpoint: it is cleared before the proving lift

test('a scripted run reaches every checkpoint in order and ends at the rim', async () => {
  const game = await openGame(server, { piece: PIECE, stubs: STUBS, tier: 'low' });
  const legs = [];
  const perf = [];
  try {
    await game.dbg('god', true);
    let seq = 0;
    for (const cp of CHECKPOINTS) {
      const encounter = ENCOUNTER_BEFORE[cp];
      if (encounter) {
        // into the encounter's space: a worst-tick budget sample, then everything alive goes down
        const enc = ENCOUNTERS.find((e) => e.id === encounter);
        const at = marker(enc.trigger);
        const r = await walk(game, enc.trigger, { chunk: 600 });
        assert.ok(['arrived'].includes(r.reason), `to the trigger of ${encounter} (${enc.trigger}): '${r.reason}' at ${r.node} ${r.problems.join('; ')}`);
        const here = (await game.state()).player;
        assert.ok(Math.hypot(here.x - at.pos[0], here.z - at.pos[2]) < 6, `${encounter}: standing by its trigger`);
        await game.dbg('spawnEnemy', 'bider', here.x + 2, here.y, here.z, 0);
        const peak = await game.dbg('perfRun', 120);
        assertBudget(peak, { zone: enc.zone, tier: 'low', worst: true });
        perf.push({ encounter, zone: enc.zone, drawCalls: peak.drawCalls, triangles: peak.triangles, simMs: +peak.simMs.toFixed(3), memoryMiB: +((peak.textureBytes + peak.renderTargetBytes) / MiB).toFixed(1) });
        assert.ok((await game.dbg('killAll')) >= 1, 'enemies.debug.killAll took the stand-in down');
        await game.dbg('clearEncounter', encounter);
      }
      const r = await walk(game, cp, { chunk: 600 });
      assert.equal(r.reason, 'arrived', `to ${cp}: '${r.reason}' at node ${r.node} ${JSON.stringify(r.stuckAt)} ${r.problems.join('; ')}`);
      assert.deepEqual(r.problems, [], `${cp}: grounded and in a zone on the way`);
      const m = marker(cp);
      // the route ends at the marker's nearest nav node: take the last steps onto the mark itself
      const onto = await game.walkTo(m.pos[0], m.pos[2], { stopRadius: 0.5, maxTicks: 240 });
      assert.equal(onto.reason, 'arrived', `${cp}: the last steps onto the marker ended '${onto.reason}'`);
      // a checkpoint that is an event, not a place (a puzzle solved, a boss phase): the thing that commits it in play
      for (const [method, arg] of CHECKPOINT_ACTS[cp] ?? []) await game.dbg(method, arg);
      await game.step(4);                       // the stub commits a place a tick after she stands on it
      const s = await game.state();
      assert.ok(Math.hypot(s.player.x - m.pos[0], s.player.z - m.pos[2]) < 2.5 && Math.abs(s.player.y - m.pos[1]) < 1, `${cp}: standing at the marker (${s.player.x}, ${s.player.y}, ${s.player.z})`);
      assert.ok(CHECKPOINTS.indexOf(s.world.checkpoint) >= CHECKPOINTS.indexOf(cp), `${cp}: the world's checkpoint is ${s.world.checkpoint}`);
      assert.equal(s.world.zone, m.zone);
      const saved = (await game.events(seq, 'checkpoint/saved')).map((e) => e.payload.id);
      seq = (await game.events(seq)).at(-1)?.seq ?? seq;
      await game.dbg('setAim', m.rotY, 0);
      await game.shot('playthrough_' + String(CHECKPOINTS.indexOf(cp) + 1).padStart(2, '0') + '_' + cp);
      legs.push({ cp, zone: s.world.zone, set: s.world.set, ticks: r.ticks, gates: r.gates, rides: r.rides.map((x) => x.id), saved, playSeconds: s.stats.playSeconds });
    }
    const end = await walk(game, 'exit_rim', { chunk: 600 });
    assert.equal(end.reason, 'arrived');
    const s = await game.state();
    assert.equal(s.world.checkpoint, 'cp_rim');
    assert.equal(s.world.set, 'coda');
    assert.equal(s.game, 'playing');
    // every checkpoint was committed exactly once, in order
    const committed = (await game.events(0, 'checkpoint/saved')).map((e) => e.payload.id);
    assert.deepEqual(committed, CHECKPOINTS, 'checkpoint/saved for each, in order');
    assert.deepEqual(legs.flatMap((l) => l.rides), ['ride_lift_hall', 'ride_proving_lift']);
    // the wall-clock-free playtime: sim seconds in 'playing', equal to ticks / 60 on this run (no slow motion)
    assert.ok(s.stats.playSeconds > 120, `playSeconds ${s.stats.playSeconds}`);
    assert.ok(Math.abs(s.stats.playSeconds - s.simTime) < 1, 'playtime is sim time');
    fs.writeFileSync(path.join(ROOT, 'shots', PIECE, 'playthrough.json'), JSON.stringify({ playSeconds: s.stats.playSeconds, ticks: s.tick, legs, perf }, null, 1));
    console.log(`playthrough: ${CHECKPOINTS.length} checkpoints, ${s.tick} ticks, playtime ${s.stats.playSeconds.toFixed(1)} s`);
    for (const p of perf) console.log(`  ${p.encounter.padEnd(13)} ${p.zone.padEnd(14)} ${p.drawCalls} calls, ${p.triangles} tris, ${p.memoryMiB} MiB, worst sim ${p.simMs} ms`);
  } finally { await game.close(); }
});

test('shotSeries captures one frame per zone in a single evaluate', async () => {
  const game = await openGame(server, { piece: PIECE, stubs: STUBS, tier: 'low' });
  try {
    await game.dbg('god', true);
    // the first checkpoint of each zone, turned to look along the route
    const views = {
      the_lip: ['cp_lip_start', [15, 14, 96, 8, -12]], plenty_street: ['cp_street_clear', [-40, 0, 0, 90, -4]], tally_house: ['cp_tally_hatch', [-89, 0, -17.5, 5, -6]],
      the_gallery: ['cp_gallery_baffle', [-78, -12, -14, -90, 0]], lift_hall: ['cp_hall_gantry', [-15, -12, -14, -90, -12]], the_bore: ['cp_boss_p1', [14, -44, 83, 180, 4]],
      far_rim: ['cp_rim', [14, 18, 112, 15, -4]],
    };
    const steps = LAYOUT.zones.map((z) => ({ name: 'greybox_' + z.id, script: [{ call: ['checkpoint', views[z.id][0]] }, { call: ['teleport', ...views[z.id][1]] }, { steps: 2 }] }));
    const files = await game.shotSeries(steps);
    assert.equal(files.length, 7);
    for (const f of files) assert.ok(fs.statSync(f).size > 1500, `${path.basename(f)} is not blank`);
    assert.equal((await game.state()).world.zone, 'far_rim');
  } finally { await game.close(); }
});
