// The reaction table (GDD 6.7), one test per row that belongs to src/enemies, for lead and for line rounds:
// outcome, damage, the state after, the events. Rounds are fired through the receivers exactly as the player's shot
// code does (ARCHITECTURE 3.6): one raycast for lead, raycastAll walked near to far for a line round.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inPage, openScene, useServer } from './lib.mjs';

useServer();

test('Bider: body, crown, a line round, and the seated figure that takes no round', async () => {
  const game = await openScene('street');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      dbg.aiEnabled(false);
      dbg.teleport(-6, 0, 0, 90, 0);
      const out = {};
      const row = (xs) => xs.map((x) => dbg.spawnEnemy('bider', x, 0, 0, -90));
      // ---- lead, body: felled, thrown back; the Bider within 1.2 m behind the thrown body stumbles, the far one does not
      let [a, b, c] = row([-16, -17.4, -19.6]);
      await core.stepAsync(2);
      let seq = H.seq();
      out.body = e.shootAt(a, 'body');
      out.bodyAfter = [e.actor(a).state, e.actor(a).alive, e.actor(b).state, e.actor(c).state];
      out.bodyEvents = H.names(seq, /^enemy\//);
      out.felled = H.events(seq, /enemy\/felled/)[0].payload;
      const x0 = e.actor(a).x;
      await core.stepAsync(60);
      out.thrown = x0 - e.actor(a).x;
      // ---- lead, crown: freed; Biders within 4 m stumble 0.5 s
      seq = H.seq();
      out.crown = e.shootAt(b, 'crown');
      out.crownAfter = [e.actor(b).state, e.actor(b).alive, e.actor(c).state];
      out.freed = H.events(seq, /enemy\/freed/)[0].payload;
      out.emissive = H.calls().filter((n) => n.startsWith('setEmissive:')).at(-1);
      // ---- seated: no hit volume; the round passes and strikes the world behind
      out.seatedCentre = e.volumeCentre(b);
      const p = e.actor(b);
      out.seated = e.leadRound(-6, 1.0, 0, p.x + 6, 0, 0);
      out.seatedId = b; out.behindId = c;
      // ---- after 3 s both are instanced static bodies and the actors are gone
      await core.stepAsync(190);
      out.statics = e.statics().map((s) => s.asset).sort();
      out.left = e.actors().map((x) => x.id);
      out.removed = H.names(0, /enemy\/removed/).length;
      dbg.killAll();
      await core.stepAsync(200);
      // ---- a line round through three in a row: all three freed, in order, and the round goes on
      [a, b, c] = row([-16, -18, -20]);
      await core.stepAsync(2);
      seq = H.seq();
      out.line = e.lineRound(-6, 1.0, 0, -1, 0, 0);
      out.lineFreed = H.events(seq, /enemy\/freed/).map((x) => [x.payload.id, x.payload.cause]);
      out.lineIds = [a, b, c];
      // ---- a line round on the crown frees as well
      const d = dbg.spawnEnemy('bider', -14, 0, 3, -90);
      await core.stepAsync(2);
      out.lineCrown = e.shootAt(d, 'crown', 'line_round');
      return out;
    });
    assert.deepEqual([r.body.outcome, r.body.damage, r.body.healthLeft, r.body.stops, r.body.part], ['kill', 100, 0, true, 'body']);
    assert.deepEqual(r.bodyAfter, ['felled', false, 'stumble', 'approach'], 'felled; the one 1.4 m behind stumbles, the one 3.6 m behind does not');
    assert.deepEqual(r.bodyEvents.filter((n) => n !== 'enemy/state'), ['enemy/damaged', 'enemy/felled']);
    assert.equal(r.felled.counted, false);
    assert.ok(Math.abs(r.thrown - 1.2) < 0.05, `thrown back 1.2 m along the shot (${r.thrown})`);
    assert.deepEqual([r.crown.outcome, r.crown.part, r.crown.stops, r.crown.healthLeft], ['freed', 'crown', true, 0]);
    assert.deepEqual(r.crownAfter, ['freed', false, 'stumble'], 'freed; a Bider within 4 m stumbles');
    assert.equal(r.freed.cause, 'crown');
    assert.match(r.emissive, /^setEmissive:.*:0$/, 'the freed Bider\'s knot goes dark');
    assert.equal(r.seatedCentre, null, 'a seated Bider has no hit volume');
    assert.deepEqual([r.seated.id, r.seated.outcome], [r.behindId, 'kill'], 'the round passes the seated Bider and strikes what is behind it (the third Bider)');
    assert.deepEqual(r.statics, ['bider_felled_static', 'bider_felled_static', 'bider_seated_static']);
    assert.equal(r.left.length, 0, 'after 3 s the felled and the freed are static bodies, not actors');
    assert.equal(r.removed, 3);
    assert.deepEqual(r.line.slice(0, 3).map((h) => [h.id, h.outcome, h.stopsLine]), r.lineIds.map((id) => [id, 'freed', false]));
    assert.deepEqual(r.lineFreed, r.lineIds.map((id) => [id, 'line']));
    assert.equal(r.line.length, 3, 'nothing but the three within its 60 m: the round went on through each');
    assert.deepEqual([r.lineCrown[0].outcome, r.lineCrown[0].part], ['freed', 'crown']);
  } finally { await game.close(); }
});

test('Transit: legs or drum flinch and break the aim, two kill; the lens kills; a line round kills', async () => {
  const game = await openScene('yard');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      const out = {};
      dbg.teleport(-83, 0, 0, 90, 0);
      // a round from 3 m in front of a Transit, on her side of it (nothing of the yard in between)
      const near = (id) => { const t = e.actor(id), p = dbg.player(); const l = Math.hypot(p.x - t.x, p.z - t.z); return [t.x + (p.x - t.x) / l * 3, t.y + 1.3, t.z + (p.z - t.z) / l * 3]; };
      // ---- a body hit during the aim: flinch 0.25 s, the aim is cancelled and restarts from plant
      const a = dbg.spawnEnemy('transit', -93, 0, 1, -90);
      out.aimAfter = await H.until(() => e.actor(a).state === 'aim', 900);
      await core.stepAsync(20);
      let seq = H.seq();
      out.body = e.shootAt(a, 'body', 'lead_round', near(a), [0, -0.5, 0]);
      out.afterBody = [e.actor(a).state, e.actor(a).hp, e.actor(a).token];
      out.flinchTicks = await H.until(() => e.actor(a).state !== 'flinch', 60);
      out.afterFlinch = e.actor(a).state;
      out.bodyEvents = H.names(seq, /^enemy\/(damaged|died)/);
      // ---- the second body hit kills
      seq = H.seq();
      out.body2 = e.shootAt(a, 'body', 'lead_round', near(a), [0, -0.5, 0]);
      out.afterBody2 = [e.actor(a).state, e.actor(a).alive];
      out.died = H.events(seq, /enemy\/died/).map((x) => x.payload.kind);
      out.emissive = H.calls().filter((n) => n.startsWith('setEmissive:')).at(-1);
      await core.stepAsync(240);
      out.stays = e.actor(a) !== null && e.actor(a).state === 'die_fold';
      // ---- the lens: one lead round
      dbg.aiEnabled(false);
      const b = dbg.spawnEnemy('transit', -90, 0, 3, -90);
      await core.stepAsync(2);
      out.lens = e.shootAt(b, 'lens', 'lead_round', near(b));
      out.afterLens = e.actor(b).state;
      // ---- a line round anywhere
      const c = dbg.spawnEnemy('transit', -90, 0, -1, -90);
      await core.stepAsync(2);
      out.line = e.shootAt(c, 'body', 'line_round', near(c), [0, -0.5, 0]);
      out.afterLine = e.actor(c).state;
      out.third = dbg.spawnEnemy('transit', -92, 0, 8, -90);
      return out;
    });
    assert.ok(r.aimAfter >= 0, 'it reached its aim');
    assert.deepEqual([r.body.outcome, r.body.damage, r.body.healthLeft, r.body.part], ['hit', 100, 100, 'body']);
    assert.deepEqual(r.afterBody, ['flinch', 100, ''], 'flinch; the aim is cancelled (the ranged token is given back)');
    assert.ok(Math.abs(r.flinchTicks - 15) <= 1, `flinch lasts 0.25 s (${r.flinchTicks} ticks)`);
    assert.equal(r.afterFlinch, 'plant', 'the tell restarts from plant');
    assert.deepEqual(r.bodyEvents, ['enemy/damaged']);
    assert.deepEqual([r.body2.outcome, r.body2.healthLeft], ['kill', 0]);
    assert.deepEqual(r.afterBody2, ['die_fold', false]);
    assert.deepEqual(r.died, ['transit']);
    assert.match(r.emissive, /:0$/);
    assert.equal(r.stays, true, 'a dead Transit stays in the world');
    assert.deepEqual([r.lens.outcome, r.lens.part, r.lens.damage], ['kill', 'lens', 200]);
    assert.equal(r.afterLens, 'die_fold');
    assert.deepEqual([r.line[0].outcome, r.line[0].stopsLine, r.line[0].damage], ['kill', false, 200]);
    assert.equal(r.afterLine, 'die_fold');
    assert.notEqual(r.third, '', 'dead Transits do not count against the cap of two');
  } finally { await game.close(); }
});

test('a stake in flight bursts under a lead round and under a line round, which goes on', async () => {
  const game = await openScene('street');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      const out = {};
      dbg.aiEnabled(false);
      dbg.teleport(-6, 0, 0, 90, 0);
      // a slow stake crossing 8 m in front of her
      e.fireStake(-14, 1.65, -3, 0, 0, 1, 1.0, false);
      await core.stepAsync(3);
      let seq = H.seq();
      out.lead = e.leadRound(-6, 1.65, 0, -8, 0, -3 + 0.05);
      out.leadBurst = H.events(seq, /projectile\/burst/).map((x) => [x.payload.kind, x.payload.reason]);
      out.flyingAfter = e.stats().flying;
      e.fireStake(-14, 1.65, -3, 0, 0, 1, 1.0, false);
      await core.stepAsync(3);
      seq = H.seq();
      out.line = e.lineRound(-6, 1.65, 0, -8, 0, -3 + 0.05);
      out.lineBurst = H.events(seq, /projectile\/burst/).map((x) => [x.payload.kind, x.payload.reason]);
      return out;
    });
    assert.deepEqual([r.lead.kind, r.lead.outcome, r.lead.stops], ['stake', 'broke', true]);
    assert.deepEqual(r.leadBurst, [['stake', 'shot']]);
    assert.equal(r.flyingAfter, 0);
    assert.deepEqual([r.line[0].kind, r.line[0].outcome, r.line[0].stopsLine], ['stake', 'broke', false]);
    assert.ok(r.line.length >= 2 && r.line.at(-1).kind === 'world', 'the line round goes on past the burst stake');
    assert.deepEqual(r.lineBurst, [['stake', 'shot']]);
  } finally { await game.close(); }
});
