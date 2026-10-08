// Pass i3, the legs that need the real game beside the real world (the real Windlass's stakes, the real player's kept
// key and view-model, the HUD's prompt): opened through the e2e driver, one browser per test, each well under a minute
// of game time, nothing drawn. The stub-world halves of the same issues are in i3.test.mjs.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../harness.mjs';
import { LAYOUT, openBot } from '../e2e/lib/bot.mjs';

let srv;
before(async () => { srv = await startServer({}); });
after(async () => { await srv.close(); });

const marker = (id) => LAYOUT.markers.find((m) => m.id === id);
const open = (checkpoint) => openBot(srv, { piece: 'code-world', tier: 'low', allowErrors: true, checkpoint });
/** events of the run so far: [{ t (tick), n (name), p (payload) }] */
const events = (bot, re) => bot.page.evaluate((src) => window.__dbg.events(0).filter((e) => new RegExp(src).test(e.name)).map((e) => ({ t: e.tick, n: e.name, p: e.payload })), re.source);
const step = (bot, n) => bot.page.evaluate((k) => window.__dbg.ext.core.stepAsync(k, false), n);

test('the peg stair, real game: the watcher is named a breath after the line that was on screen when she looked at it, on the stair, ahead of "The low pegs were bare"', async () => {
  const bot = await open('cp_tally_hatch');
  try {
    const out = await bot.eval(async (b, dbg) => {
      const r = await b.go('trg_watcher', { stopRadius: 1.0, maxTicks: 60 * 12 });
      const v = b.volumeOf('prop_watcher');
      if (v) b.lookAt(v.x, v.y, v.z); else b.lookAtMarker('prop_watcher');
      const looked = dbg.state().tick;
      await b.step(60 * 10);
      const p = dbg.player();
      return { reason: typeof r === 'string' ? r : r.reason, looked, y: p.y };
    });
    const said = (await events(bot, /^story\/line$/)).map((e) => ({ k: e.p.key, t: e.t, ticks: Math.round(e.p.seconds * 60) }));
    const at = (k) => said.find((l) => l.k === k);
    assert.ok(at('nar_pegs_1') && at('nar_watcher_1'), `the peg line and the watcher's (${said.map((l) => l.k).join(' ')}; walk ${out.reason})`);
    const wait = (at('nar_watcher_1').t - out.looked) / 60;
    assert.ok(wait <= 5, `named ${wait.toFixed(1)} s after the look (it was 8.7 s: scratch/i3-story-a/H_gal.log)`);
    assert.ok(at('nar_watcher_1').t - (at('nar_pegs_1').t + at('nar_pegs_1').ticks) <= 20, 'a breath after "Coats on pegs"');
    assert.ok(!at('nar_pegs_2') || at('nar_pegs_2').t > at('nar_watcher_1').t, 'ahead of the second peg line');
    assert.ok(out.y > -9, `she is still at the niche when it is said (y ${out.y.toFixed(1)})`);
  } finally { await bot.close(); }
});

test('R2, real Windlass on Normal with no input: the first stake that lands says what standing still costs; the first retry is told what the ribs are for; neither is shown twice in a try', async () => {
  const bot = await open('cp_boss_p1');
  try {
    await bot.page.evaluate(async () => {
      const dbg = window.__dbg, core = dbg.ext.core;
      // two tries: she stands where the checkpoint puts her
      for (let i = 0; i < 60 * 4 && dbg.events(0, 'player/died').length < 2; i++) await core.stepAsync(15, false);
      await core.stepAsync(60, false);
    });
    const ev = await events(bot, /^(story\/line|player\/(died|damaged)|game\/state)$/);
    const died = ev.filter((e) => e.n === 'player/died');
    assert.ok(died.length >= 2, `she is killed twice standing still (${died.length})`);
    const hit = ev.find((e) => e.n === 'player/damaged' && e.p.source === 'windlass');
    const move = ev.filter((e) => e.n === 'story/line' && e.p.key === 'hint_boss_move');
    assert.ok(move.length >= 1 && move[0].t < died[0].t, `"Standing still was the one thing it could hit" before the first death (${move.length ? ((move[0].t - died[0].t) / 60).toFixed(1) : 'never'} s; it came after the second)`);
    assert.ok(move[0].t - hit.t <= 30, `within half a second of the first hit (${((move[0].t - hit.t) / 60).toFixed(2)} s)`);
    const back = ev.find((e) => e.n === 'game/state' && e.p.to === 'playing' && e.t > died[0].t);
    const haul = ev.filter((e) => e.n === 'story/line' && e.p.key === 'hint_boss_haul');
    assert.ok(haul.length >= 1 && haul[0].t - back.t <= 90 && haul[0].t < died[1].t, `"The ribs stopped what it threw" within 1.5 s of the first retry (${haul.length ? ((haul[0].t - back.t) / 60).toFixed(2) : 'never'} s)`);
    assert.equal(haul.filter((e) => e.t < died[1].t).length, 1, 'once in that try (the Windlass\'s own saying at its first haul is not shown again)');
    assert.equal(move.filter((e) => e.t < died[0].t).length, 1, 'the first line once in the first try');
  } finally { await bot.close(); }
});

test('phase 3a, real player: the kept key pressed off the mark is answered on its tick; nothing is chambered', async () => {
  const bot = await open('cp_boss_p3');
  try {
    const out = await bot.page.evaluate(async () => {
      const dbg = window.__dbg, core = dbg.ext.core;
      dbg.god(true);
      await core.stepAsync(60 * 3, false);
      const before = dbg.events(0).at(-1)?.seq ?? 0;
      const tick = dbg.state().tick;
      dbg.tap('kept');
      await core.stepAsync(20, false);
      return { tick, lines: dbg.events(before, 'story/line').map((e) => ({ k: e.payload.key, t: e.tick })), kept: dbg.events(before, 'weapon/kept').map((e) => e.payload.stage), seventh: dbg.player().seventh ?? dbg.state().player.seventh };
    });
    assert.deepEqual(out.kept, ['denied'], 'the press is refused off the mark');
    assert.equal(out.lines[0]?.k, 'hint_kept_2', `and answered: "The brass mark at the kerb. The seventh round. Down the bore." (${JSON.stringify(out.lines)})`);
    assert.ok(out.lines[0].t - out.tick <= 3, 'on its tick');
    assert.notEqual(out.seventh, 'chambered');
  } finally { await bot.close(); }
});

test('the reach, real HUD: at 2.5 m from the bay locker the prompt is up and E takes the round', async () => {
  const L = marker('ia_line_locker_bay');
  const bot = await open('cp_gallery_bay');
  try {
    const out = await bot.eval(async (b, dbg, L) => {
      await b.go('ia_line_locker_bay', { stopRadius: 2.6, maxTicks: 60 * 20 });
      await b.walkTo(L.pos[0], L.pos[2] - 2.6, { stopRadius: 0.3, maxTicks: 300 });
      const v = b.volumeOf('ia_line_locker_bay');
      b.lookAt(v.x, v.y, v.z);
      await b.step(30);
      const p = dbg.player();
      const d = Math.hypot(p.x - v.x, p.z - v.z);
      const focus = dbg.ext.world.status().interact.focus;
      await dbg.ext.core.stepAsync(2, true);
      await new Promise((r) => setTimeout(r, 400));
      const n = document.querySelector('.k7 .prompt:not(.hint)');
      const prompt = n ? n.className + '|' + n.innerText.replace(/\s+/g, ' ') : '';
      dbg.tap('interact');
      await b.step(10);
      return { d, focus, prompt, line: dbg.player().lineRounds };
    }, L);
    assert.ok(out.d > 2.2 && out.d <= 3.0, `between the old use range and the prompt range (${out.d.toFixed(2)} m)`);
    assert.equal(out.focus, 'ia_line_locker_bay');
    assert.ok(/\bon\b/.test(out.prompt) && /TAKE/i.test(out.prompt), `the prompt is up (${out.prompt})`);
    assert.equal(out.line, 1, 'and E takes the round (it did nothing here)');
  } finally { await bot.close(); }
});

test('the last image, real view-model: the revolver is let down as the last fire catches and stays down to the card; the take is answered on its tick and the Rule\'s line is told before the fire', async () => {
  const ROUND = marker('ia_stone_round');
  const bot = await open('cp_rim');
  try {
    const out = await bot.eval(async (b, dbg, ROUND) => {
      const core = dbg.ext.core, low = () => dbg.ext.player.lowered();
      await b.go('trg_lamps', { stopRadius: 1.5, maxTicks: 60 * 15 });
      await b.walkTo(2.6, 103.4, { stopRadius: 0.4, maxTicks: 600 });
      // at the round itself (the note beside it is the other thing on the stone)
      dbg.aimAt(ROUND.pos[0] + 0.15, ROUND.pos[1] + 0.02, ROUND.pos[2] - 0.04);
      await core.stepAsync(4, false);
      const res = { before: low(), focus: dbg.ext.world.status().interact.focus };
      dbg.tap('interact');
      await core.stepAsync(6, false);
      res.atTake = low();
      for (let i = 0; i < 60 * 3 && dbg.events(0, 'ending/fire').length === 0; i++) await core.stepAsync(20, false);
      res.fired = dbg.events(0, 'ending/fire').length;
      res.atFire = low();
      await core.stepAsync(90, false);
      res.afterFire = low();
      for (let i = 0; i < 60 * 2 && dbg.events(0, 'ending/card').length === 0; i++) await core.stepAsync(20, false);
      res.atCard = low(); res.card = dbg.events(0, 'ending/card').length;
      return res;
    }, ROUND);
    assert.equal(out.focus, 'ia_stone_round', 'the round is offered');
    assert.equal(out.before, false); assert.equal(out.atTake, false, 'the gun is up while the choice is hers and through the take\'s lines');
    assert.equal(out.fired, 1, 'the last fire catches');
    assert.equal(out.atFire, true, 'the gun goes down as it catches');
    assert.equal(out.afterFire, true); assert.equal(out.card, 1); assert.equal(out.atCard, true, 'and is down to the card');
    const ev = await events(bot, /^(story\/line|ending\/(stone|fire))$/);
    const took = ev.find((e) => e.n === 'ending/stone'), fire = ev.find((e) => e.n === 'ending/fire');
    const k = ev.filter((e) => e.n === 'story/line' && e.t >= took.t).map((e) => e.p.key);
    assert.ok(ev.find((e) => e.p.key === 'nar_take_1').t - took.t <= 1, `the take is answered on its tick (${k.join(' ')})`);
    const rule = ev.find((e) => e.p.key === 'nar_rim_3');
    assert.ok(rule && rule.t < fire.t, `"Further than from the gully" is told, before the fire (${k.join(' ')})`);
    assert.deepEqual(k.slice(-2), ['nar_fire', 'nar_last']);
  } finally { await bot.close(); }
});

test('the gantry, real chamber: walking along it says nothing of the Windlass; a look at it through the grille does', async () => {
  const T = marker('trg_windlass_seen'), V = marker('vista_windlass');
  const bot = await open('cp_hall_clear');
  try {
    const out = await bot.page.evaluate(async ({ T, V }) => {
      const dbg = window.__dbg, core = dbg.ext.core, ctx = core.ctx();
      dbg.god(true);
      await core.stepAsync(60 * 20, false);                       // the hall's own lines run out
      const before = dbg.events(0).at(-1)?.seq ?? 0;
      ctx.player.teleport(T.pos[0], T.pos[1], T.pos[2], -90, 0);  // on the gantry, facing along it (east)
      await core.stepAsync(60 * 3, false);
      const along = dbg.events(before, 'story/line').map((e) => e.payload.key);
      dbg.aimAt(V.params.target[0], V.params.target[1], V.params.target[2]);
      const looked = dbg.state().tick;
      await core.stepAsync(60, false);
      const line = dbg.events(before, 'story/line').find((e) => e.payload.key === 'nar_windlass_seen');
      return { along, looked, at: line ? line.tick : -1, cue: dbg.events(before, 'audio/cue').some((e) => e.payload.cue === 'ratchet') };
    }, { T, V });
    assert.ok(!out.along.includes('nar_windlass_seen'), `looking along the gantry: not said (${out.along.join(' ')})`);
    assert.ok(out.cue, 'a ratchet turns on the bore side');
    assert.ok(out.at >= 0 && out.at - out.looked <= 40, `said ${((out.at - out.looked) / 60).toFixed(2)} s after she turns to it (a clear line through the real grille)`);
  } finally { await bot.close(); }
});
