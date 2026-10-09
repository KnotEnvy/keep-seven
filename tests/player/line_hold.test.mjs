// Pass i4 (combat review): "a line round aimed at the chest misses the third in a file". The eye is at 1.65 m and a
// Bider's body at 0.6 m, so the aim ray slopes into the ground behind the second body. A line round that has gone
// through a body now holds that body's height for the rest of its range WHEN that reaches more of the file and loses
// nothing the aim ray would have met (shots.ts `hold`). The sandbox: the real player beside the core stubs.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { FLOOR, ORIGIN, eventsSince, ext, lastSeq, me, room, sandbox, server } from './common.mjs';

let srv;
before(async () => { srv = await server(); });
after(async () => { await srv.close(); });
const [, OY, OZ] = ORIGIN;
const WALL = { shape: 'box', pos: [0, 2, -30.25], size: [10, 5, 0.5], rotY: 0, surface: 'adobe', role: 'wall' };
const body = (game, id, z, y = 0.6) => ext(game, 'range', 'dummy', id, 'freed', 0, y, z, { kind: 'bider', part: 'body', radius: 0.4 });
/** a line round under the hammer, the aim on `target`, the click; returns what followed */
async function fireAt(game, target) {
  await ext(game, 'range', 'give', 'line', 2);
  await game.run([{ steps: 31 }, { tap: 'line', steps: 34 }, { aimAtEntity: target, steps: 1 }]);
  const seq = await lastSeq(game);
  const s = await game.run([{ aimAtEntity: target, tap: 'fire', steps: 1 }]);
  const holding = (await me(game)).lineHolding, pitch = s.player.pitchDeg;
  await game.step(30);
  const fired = (await eventsSince(game, seq, 'weapon/fired'))[0];
  const hits = (await eventsSince(game, seq, 'combat/hit')).map((h) => ({ ...h.payload, at: h.tick - fired.tick }));
  const resolved = (await eventsSince(game, seq, 'combat/line_resolved'))[0].payload;
  return { fired: fired.payload, hits, resolved, holding, pitch, after: await me(game) };
}

test('a file of three bodies at 8, 11 and 14 m, the aim on the first one\'s body: one line round goes through all three at one height', async () => {
  const game = await sandbox(srv, 'room');
  try {
    await room(game, [FLOOR, WALL], [0, 0, 0], 0);
    for (const [i, z] of [-8, -11, -14].entries()) await body(game, 'file_' + i, z);
    const r = await fireAt(game, 'file_0');
    assert.ok(r.pitch < -7 && r.pitch > -8.5, `the aim slopes down at the first body: ${r.pitch}`);
    assert.equal(r.holding, true, 'the round in flight holds the first body\'s height');
    assert.deepEqual(r.hits.map((h) => [h.order, h.entityId, h.outcome]), [[0, 'file_0', 'freed'], [1, 'file_1', 'freed'], [2, 'file_2', 'freed'], [3, '', 'impact']]);
    assert.deepEqual(r.hits.map((h) => h.at), [0, 2, 5, 7], 'still 40 ms apart: entry i at tick offset round(i x 2.4)');
    assert.deepEqual([r.resolved.bodies, r.resolved.freed], [3, 3], 'one round, one line');
    const y0 = r.hits[0].y;
    assert.ok(y0 - OY > 0.55 && y0 - OY < 0.75, `it met the first body at chest height: ${y0 - OY}`);
    for (const h of r.hits) assert.ok(Math.abs(h.y - y0) < 1e-6, `every later hit at that height: ${h.y - OY}`);
    // the level run's hits are hits of the level ray: the ricochet off the wall comes straight back
    assert.ok(Math.abs(r.hits[3].ricochetY) < 1e-9 && r.hits[3].ricochetZ > 0.999);
    // what is drawn: the aim ray as far as the first body (render, on weapon/fired), the level run from there to the wall
    assert.ok(Math.hypot(r.fired.endX - r.hits[0].x, r.fired.endY - y0, r.fired.endZ - r.hits[0].z) < 1e-9, 'weapon/fired ends where the round met the first body');
    assert.ok(Math.abs(r.fired.dy - Math.sin(r.pitch * Math.PI / 180)) < 1e-4, 'weapon/fired still carries the aim');
    assert.ok(Math.abs(r.resolved.endZ - (OZ - 30)) < 1e-3 && Math.abs(r.resolved.endY - y0) < 1e-6, 'line_resolved ends on the wall, at that height');
    const lines = (await ext(game, 'range', 'renderCalls')).filter((c) => c === 'vfx.line:line_round');
    assert.equal(lines.length, 1, 'the player asked render for the level run (the stub render draws nothing on weapon/fired)');
    assert.deepEqual([r.after.lineHolding, r.after.linePending], [false, 0]);
  } finally { await game.close(); }
});

test('the hold never trades anything away: a knot on the aim ray keeps the round on the aim; so does a file the aim already reaches, and a steep shot', async () => {
  const game = await sandbox(srv, 'room');
  try {
    // (1) behind the first body the AIM ray meets a knot low down (0.4 m up at 9.5 m): the level run would pass over it
    await room(game, [FLOOR, WALL], [0, 0, 0], 0);
    await body(game, 'a_0', -8); await body(game, 'a_1', -14);
    await ext(game, 'range', 'dummy', 'a_knot', 'broke', 0, 0.4, -9.5, { radius: 0.15 });
    let r = await fireAt(game, 'a_0');
    assert.equal(r.holding, false, 'the knot is on the aim and not on the level run: the round flies as aimed');
    assert.deepEqual(r.hits.map((h) => h.entityId), ['a_0', 'a_knot', '']);
    assert.deepEqual([r.resolved.bodies, r.resolved.knots], [1, 1]);
    assert.ok(Math.abs(r.fired.endY - OY) < 1e-6, 'weapon/fired ends in the floor, as before');
    for (const id of ['a_0', 'a_1', 'a_knot']) await ext(game, 'range', 'remove', id);
    // (2) two bodies the aim ray already goes through, nothing more behind: no reason to hold
    await body(game, 'b_0', -8); await body(game, 'b_1', -9.2, 0.45);
    r = await fireAt(game, 'b_0');
    assert.equal(r.holding, false);
    assert.deepEqual(r.hits.map((h) => h.entityId), ['b_0', 'b_1', '']);
    assert.ok(r.hits[1].y < r.hits[0].y - 0.05, 'the second hit is lower: the round kept its slope');
    for (const id of ['b_0', 'b_1']) await ext(game, 'range', 'remove', id);
    // (3) steeper than 30 degrees (the first body 1.5 m away): never turned level
    await body(game, 'c_0', -1.5); await body(game, 'c_1', -4); await body(game, 'c_2', -7);
    r = await fireAt(game, 'c_0');
    assert.ok(r.pitch < -30, `a steep shot: ${r.pitch}`);
    assert.equal(r.holding, false);
    assert.equal(r.resolved.bodies, 1);
    for (const id of ['c_0', 'c_1', 'c_2']) await ext(game, 'range', 'remove', id);
    // (4) the same file from 2.2 m (25 degrees): held, all three
    await body(game, 'd_0', -2.2); await body(game, 'd_1', -4.7); await body(game, 'd_2', -7.2);
    r = await fireAt(game, 'd_0');
    assert.ok(r.pitch > -30 && r.pitch < -20, `${r.pitch}`);
    assert.deepEqual([r.holding, r.resolved.bodies, r.resolved.freed], [true, 3, 3]);
  } finally { await game.close(); }
});
