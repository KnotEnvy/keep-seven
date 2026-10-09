// Pass i6 (visual reviewer b, minor): "when the player's line to him stops being clean he goes down, as designed, but
// during the walk-down he is briefly visible above the tank's rim from the yard gate, which looks like a man standing on
// the tank" (shots/i6-visual-b/close_low/yd_door.png, 6 ticks after a teleport from the checkpoint to the gate). The clean
// line was tried every 4th tick and he then stepped down over SIGHT_RISE (21 ticks): up to 25 ticks of him over a roof.
// Now he is gone on the tick the line stops being clean; only the stared-at walk-down takes its 1.5 s.
// The real world beside five core stubs; the picture is measured in i6_real.test.mjs.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mark, marker, open, server, status } from './lib.mjs';

let srv;
before(async () => { srv = await server(); });
after(async () => { await srv.close(); });

const DOWSER = marker('vista_dowser').params.target;
const dir = async (game) => (await status(game)).director;
const ended = async (game, since) => (await game.events(since, 'vignette/state')).filter((e) => e.payload.id === 'vig_dowser' && e.payload.stage === 'ended');

test('teleported or walked out of the clean strip he is gone on that very tick: there is no tick on which anything of him shows while her line to him is not clean', async () => {
  const game = await open(srv, { checkpoint: 'cp_yard_clear' });
  try {
    // the reviewer's frame: from the checkpoint's place in the strip to the gate, never looked at
    for (const [x, z] of [[-76.8, 0.2], [-80, -4], [-86, 0], [-90, -6.5]]) {
      await game.run([{ call: ['teleport', -88, 0, -10.5, -90, 0] }, { steps: 40 }]);
      assert.equal((await dir(game)).sightUp, 1, 'he stands, seen from the strip');
      await game.run([{ call: ['teleport', x, 0, z, -90, 0] }, { steps: 1 }]);
      const d = await dir(game);
      assert.deepEqual([d.sightClean, d.sightUp], [false, 0], `(${x}, ${z}): one tick after she left the strip he is not drawn`);
    }
    assert.equal((await dir(game)).sight, 1, 'never looked at: he is still to be seen');
    // walked, 6 m/s, from the vista to the gate with her eyes on him all the way: read on every tick
    await game.run([{ call: ['teleport', -88, 0, -10.5, 90, 0] }, { steps: 40 }]);
    const from = [-88, -10.5], to = [-76.8, 0.2], len = Math.hypot(to[0] - from[0], to[1] - from[1]), n = Math.ceil(len / 0.1);
    const log = await game.page.evaluate(async ({ from, to, n, T }) => {
      const d = window.__dbg, out = [];
      for (let i = 1; i <= n; i++) {
        const k = i / n;
        d.teleport(from[0] + (to[0] - from[0]) * k, 0, from[1] + (to[1] - from[1]) * k);
        d.aimAt(T[0], T[1], T[2]);
        await d.ext.core.stepAsync(1, false);
        const s = d.ext.world.status().director;
        out.push([s.sightClean, s.sightUp]);
      }
      return out;
    }, { from, to, n, T: DOWSER });
    const upDirty = log.filter(([clean, up]) => !clean && up > 0).length, upTicks = log.filter(([, up]) => up > 0).length;
    const firstDirty = log.findIndex(([clean]) => !clean);
    console.log(`walked ${len.toFixed(1)} m in ${n} ticks: he shows on ${upTicks}, the line is first not clean on tick ${firstDirty + 1}, shows while not clean on ${upDirty}`);
    assert.ok(firstDirty > 0 && upTicks >= firstDirty, 'he stood while she was in the strip, and the walk leaves it');
    assert.equal(upDirty, 0, 'no tick of a man over the tank');
    assert.equal(log.at(-1)[1], 0);
  } finally { await game.close(); }
});

test('he still comes UP over the rim (a third of a second), and stared at for his whole stay he still WALKS down the far side over 1.5 s in the clean strip', async () => {
  const game = await open(srv, { checkpoint: 'cp_yard_clear' });
  try {
    await game.run([{ call: ['teleport', -78, 0, 0, -90, 0] }, { steps: 30 }, { call: ['teleport', -88, 0, -10.5, -90, 0] }, { steps: 12 }]);
    const mid = await dir(game);
    assert.ok(mid.sightUp > 0.05 && mid.sightUp < 0.95, `rising (${mid.sightUp})`);
    const seq = await mark(game);
    await game.run([{ aimAt: DOWSER, steps: 30 }]);
    let d = await dir(game);
    assert.ok(d.sight === 2 && d.sightUp === 1);
    // SIGHT_STAYS (40 s) with her eyes on him, then half of the walk-down
    for (let i = 0; i < 4; i++) await game.run([{ aimAt: DOWSER, steps: 10 * 60 }]);
    await game.run([{ aimAt: DOWSER, steps: 20 }]);
    d = await dir(game);
    assert.ok(d.sight === 3 && d.sightDown > 0.2 && d.sightDown < 1.4, `he is walking down (${JSON.stringify([d.sight, d.sightDown])})`);
    assert.deepEqual([d.sightClean, d.sightUp], [true, 1], 'on a clean skyline: the walk-down is seen, not cut');
    assert.equal((await ended(game, seq)).length, 0, 'his card is still there');
    await game.run([{ aimAt: DOWSER, steps: 90 }]);
    assert.equal((await ended(game, seq)).length, 1, 'and gone behind the skyline 1.5 s after he turned');
  } finally { await game.close(); }
});

test('looked at for her second and then out of the strip: he is not drawn from that tick, and the beat still ends under the line that says he went down', async () => {
  const game = await open(srv, { checkpoint: 'cp_yard_clear' });
  try {
    const seq = await mark(game);
    await game.run([{ call: ['teleport', -88, 0, -10.5, 90, 0] }, { steps: 2 }, { aimAt: DOWSER, steps: 3 * 60 }]);
    await game.run([{ call: ['teleport', -76.8, 0, 0.2, 90, 0] }, { aimAt: DOWSER, steps: 1 }]);
    let d = await dir(game);
    assert.deepEqual([d.sight, d.sightUp], [3, 0], 'going, and not on the tank');
    await game.run([{ aimAt: DOWSER, steps: 9 * 60 }]);
    const said = (await game.events(seq, 'story/line')).map((e) => e.payload.key).filter((k) => k.startsWith('nar_dowser'));
    assert.deepEqual(said, ['nar_dowser_seen', 'nar_dowser_down']);
    d = await dir(game);
    assert.equal(d.sight, 4);
    assert.notEqual((await game.state()).world.doors.door_tally, 'closed');
  } finally { await game.close(); }
});
