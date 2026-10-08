// Pass i2, the Windlass's asking (story reviewer b: 36.7 s of listening between the bore door and the first phase, the
// inspection 31.7 s in). This needs the real Windlass beside the real world (the stub has no parley clock), so it opens
// the whole game through the e2e driver. One browser, about a minute of game time, nothing drawn.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../harness.mjs';
import { LAYOUT, openBot } from '../e2e/lib/bot.mjs';

let srv;
before(async () => { srv = await startServer({}); });
after(async () => { await srv.close(); });

test('the asking, real Windlass: its first line as the line on screen ends and nothing else before it, the roll-call ONE line held 4.5 s (closing of pass i3), the inspection 17 s in, phase 1 at 22 s; she walked in with nothing waiting', async () => {
  const T = LAYOUT.markers.find((m) => m.id === 'trg_enc_windlass'), stand = LAYOUT.markers.find((m) => m.id === 'trg_pz_asking').params.standSpot;
  assert.deepEqual(T.params.parley, ['stn_parley_1', 'nar_parley', 'rv_ask', 'stn_parley_2', 'stn_parley_4']);
  const bot = await openBot(srv, { piece: 'code-world', tier: 'low', allowErrors: true });
  try {
    await bot.startFromTitle();
    await bot.jump('cp_bore_ante');
    const out = await bot.page.evaluate(async ({ stand, T }) => {
      const dbg = window.__dbg, core = dbg.ext.core, ctx = core.ctx();
      dbg.god(true);
      ctx.player.teleport(stand[0], stand[1], stand[2], 180, 0);
      await core.stepAsync(20 * 60, false);                       // the antechamber's own lines run out
      // a room line and a hint are waiting when she steps through (they are behind her now), and the door stands open
      dbg.ext.world.forceDoor('door_bore', 'open');
      dbg.ext.world.say('nar_plenty'); dbg.ext.world.say('nar_marks'); dbg.ext.world.say('nar_rule');
      await core.stepAsync(30, false);
      const mark = dbg.events(0).at(-1)?.seq ?? 0;
      ctx.player.teleport(T.pos[0], T.pos[1], T.pos[2] + 0.5, 180, 0);
      for (let i = 0; i < 40 * 6; i++) { await core.stepAsync(10, false); if (dbg.events(mark, 'boss/phase').some((e) => e.payload.phase === 'p1')) break; }
      await core.stepAsync(60, false);
      const ev = dbg.events(mark).filter((e) => /^(story\/line|boss\/parley|boss\/phase)$/.test(e.name)).map((e) => ({ t: e.tick, n: e.name, k: e.payload.key ?? e.payload.stage ?? e.payload.phase, s: e.payload.seconds ?? 0 }));
      return { ev, story: dbg.ext.world.status().story };
    }, { stand, T });
    const start = out.ev.find((e) => e.n === 'boss/parley' && e.k === 'start');
    assert.ok(start, `the asking began (${JSON.stringify(out.ev).slice(0, 300)})`);
    const at = (name, k) => { const e = out.ev.find((x) => x.n === name && x.k === k); assert.ok(e, `${name} ${k}`); return (e.t - start.t) / 60; };
    const said = out.ev.filter((e) => e.n === 'story/line' && e.t >= start.t).map((e) => e.k);
    // the room line that was on screen is heard out (it is a narrator's); what was only waiting is let go
    const first = at('story/line', 'stn_parley_1');
    assert.ok(first <= 6, `LIFT HEAD PRESENTING within one line of the seal (${first.toFixed(1)} s)`);
    assert.deepEqual(said.filter((k) => !/parley|rv_ask/.test(k)), [], `nothing about the rooms behind her is said in the asking (${said.join(' ')})`);
    const roll = out.ev.filter((e) => e.n === 'story/line' && (e.k === 'stn_parley_2' || e.k === 'stn_parley_3'));
    // pass i3 (story reviewer b: 29.9 s from the seal to phase 1; the Windlass now follows each line as held, so the
    // world's holds are the asking's length; closing of pass i3: the roll-call merged into one line in design/story.json):
    // 3.5 + 4 + 4 + 4.5 s and four breaths to the inspection, 5 s more to phase 1
    assert.deepEqual(roll.map((e) => [e.k, e.s]), [['stn_parley_2', 4.5]], 'the roll-call is one line, held 4.5 s');
    const held = Object.fromEntries(out.ev.filter((e) => e.n === 'story/line').map((e) => [e.k, e.s]));
    assert.deepEqual([held.stn_parley_1, held.nar_parley, held.rv_ask, held.stn_parley_4], [3.5, 4, 4, 5], 'the first line 3.5 s, the two spoken ones 4 s each; the line that states the rule keeps its 5');
    const insp = at('boss/parley', 'inspection') - first, p1 = at('boss/phase', 'p1') - first;
    assert.ok(Math.abs(insp - 17) <= 0.5, `the inspection opens 17 s after the first line (${insp.toFixed(2)} s; it was 19.25 in pass i3, 22.75 in pass i2 and 31.7 before)`);
    assert.ok(Math.abs(p1 - 22) <= 0.5, `phase 1 at 22 s (${p1.toFixed(2)} s; it was 24.25 in pass i3, 27.75 in pass i2 and 36.7 before)`);
    assert.equal(at('story/line', 'stn_parley_4'), at('boss/parley', 'inspection'), 'the six stand open on the tick the line that says so appears');
  } finally { await bot.close(); }
});
