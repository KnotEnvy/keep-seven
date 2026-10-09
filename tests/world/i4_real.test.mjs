// Pass i4, the legs that need the real game beside the real world (the real player's walk and line round, the HUD, a
// stored save and the title's "Go on", the real Windlass's talk): opened through the e2e driver, ONE browser per test,
// each leg well under two minutes of game time, nothing drawn. The stub-world halves are in i4.test.mjs.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../harness.mjs';
import { launchBrowser } from '../../tools/browser.mjs';
import { LAYOUT, STORY, openBot } from '../e2e/lib/bot.mjs';

let srv;
before(async () => { srv = await startServer({}); });
after(async () => { await srv.close(); });

const marker = (id) => LAYOUT.markers.find((m) => m.id === id);
const open = (checkpoint, extra = {}) => openBot(srv, { piece: 'code-world', tier: 'low', allowErrors: true, checkpoint, ...extra });
/** events of the run so far: [{ t (tick), n (name), p (payload) }] */
const events = (bot, re) => bot.page.evaluate((src) => window.__dbg.events(0).filter((e) => new RegExp(src).test(e.name)).map((e) => ({ t: e.tick, n: e.name, p: e.payload })), re.source);
const step = (bot, n) => bot.page.evaluate((k) => window.__dbg.ext.core.stepAsync(k, false), n);
const status = (bot) => bot.page.evaluate(() => window.__dbg.ext.world.status());

test('the jug gate, real game: walked down the gully without a look north, a player who shoots nothing is told "The jugs were the weight on the bar" and "The seventh hung high" (the regression review\'s major: no worded hint in 400 s)', async () => {
  const bot = await open('cp_lip_start');
  try {
    await bot.eval(async (b) => { b.skipReadables = true; await b.helpers.advance(); });
    await bot.eval(async (b, dbg) => { dbg.aimAtEntity('ia_jug_3'); await b.step(2); });
    await step(bot, 20 * 60);                                       // whatever was being said on the way down is over
    const st = await status(bot);
    assert.deepEqual(st.story.waiting, ['nar_rule'], `the Rule's line waits for a look she never gave (${JSON.stringify(st.story)})`);
    const t0 = (await bot.state()).tick;
    await bot.page.evaluate(() => window.__dbg.ext.world.hintClock(100));
    await step(bot, 6 * 60);
    await bot.page.evaluate(() => window.__dbg.ext.world.hintClock(85));
    await step(bot, 6 * 60);
    const ev = (await events(bot, /^(story\/line|puzzle\/hint)$/)).filter((e) => e.t >= t0);
    const said = ev.filter((e) => e.n === 'story/line').map((e) => e.p.key);
    assert.ok(ev.some((e) => e.n === 'puzzle/hint' && e.p.tier === 2) && ev.some((e) => e.n === 'puzzle/hint' && e.p.tier === 3), 'tiers 2 and 3 were reached');
    assert.deepEqual(said, ['hint_jugs_2_few', 'hint_jugs_3'], `both worded hints are on screen (${said.join(' ')})`);
    assert.ok((await status(bot)).story.waiting.includes('nar_rule'), 'and the Rule\'s line still waits for its look');
  } finally { await bot.close(); }
});

test('the fire and run hints, real game from the title: "Hold SHIFT to run" within the first quarter of the gully (it came 16.9 s in, past the middle); "LEFT CLICK to fire" at the gate is down after eight seconds', async () => {
  const bot = await open(null);
  try {
    await bot.startFromTitle();
    const t0 = (await bot.state()).tick;
    // out of the overhang and down the gully at a walk, by input, without a stop at the note
    const where = await bot.eval(async (b, dbg) => {
      b.skipReadables = true;
      const z = [];
      const ctx = dbg.ext.core.ctx();
      ctx.events.on('ui/hint', (e) => { if (e.key === 'ui_hint_sprint' && e.show) z.push(dbg.player().z); });
      await b.go('cp_lip_gate', { maxTicks: 60 * 40, stopRadius: 1.5 });
      return { z, at: dbg.player().z };
    });
    const hints = (await events(bot, /^ui\/hint$/)).filter((e) => e.p.key === 'ui_hint_sprint');
    const shown = hints.find((e) => e.p.show);
    assert.ok(shown, 'the run hint is shown on the walk');
    const G = marker('trg_glare');
    assert.ok(where.z.length >= 1 && where.z[0] >= 70, `shown at z ${where.z[0]?.toFixed(1)} of ${G.pos[2] + 2} .. 4: in the first quarter of the gully (it was z 62 and less)`);
    const cards = await events(bot, /^story\/card$/);
    const title = cards.find((c) => c.p.key === 'card_title');
    assert.ok(title && shown.t >= title.t + Math.round(title.p.seconds * 60) && shown.t <= title.t + Math.round(title.p.seconds * 60) + 45, `as the title card goes (${((shown.t - title.t) / 60).toFixed(2)} s after it came up)`);
    const down = hints.find((e) => !e.p.show && e.t > shown.t);
    assert.ok(down && (down.t - shown.t) / 60 <= 8.1, 'eight seconds at most');
    // at the gate, hands off the trigger
    await step(bot, 14 * 60);
    const fire = (await events(bot, /^ui\/hint$/)).filter((e) => e.p.key === 'ui_hint_fire');
    assert.deepEqual(fire.map((e) => e.p.show), [true, false], `the fire hint came and went (${JSON.stringify(fire.map((e) => [e.p.show, ((e.t - t0) / 60).toFixed(1)]))})`);
    assert.ok(Math.abs((fire[1].t - fire[0].t) / 60 - 8) <= 0.1, 'after eight seconds');
  } finally { await bot.close(); }
});

test('the proving line, real game: the bot\'s one line round through the three knots is on the end card as a line of three (it read 0)', async () => {
  const bot = await open('cp_gallery_bay');
  try {
    assert.equal((await status(bot)).stats.linesOfThree, 0);
    const run = await bot.play({ until: 'cp_gallery_baffle', shots: 'zzz' });
    assert.equal(run.checkpoint, 'cp_gallery_baffle', JSON.stringify(run.report.notes));
    const ev = await events(bot, /^(puzzle\/solved|combat\/line_resolved)$/);
    assert.ok(ev.some((e) => e.n === 'puzzle/solved' && e.p.puzzle === 'proving_line'));
    const lines = ev.filter((e) => e.n === 'combat/line_resolved');
    assert.equal((await status(bot)).stats.linesOfThree, 1, `one line of three (the player's own count of that shot: ${JSON.stringify(lines.map((e) => [e.p.bodies, e.p.knots]))})`);
  } finally { await bot.close(); }
});

test('phase 3a, real Windlass, a player who does not break the band: the kept round\'s two worded hints are said under its talk, and no refill line twice in twenty seconds', async () => {
  const bot = await open('cp_boss_p3');
  try {
    await bot.page.evaluate(() => window.__dbg.god(true));
    const t0 = (await bot.state()).tick;
    // she keeps shooting lead at it for 48 s (as the reviewer's hints_kept run did), moving nowhere
    await bot.page.evaluate(async () => {
      const dbg = window.__dbg, core = dbg.ext.core;
      for (let i = 0; i < 48; i++) {
        if (i % 3 === 0) { dbg.aimAtEntity('boss_windlass') || dbg.setAim(dbg.player().yawDeg, 20); dbg.tap('fire'); }
        await core.stepAsync(60, false);
      }
    });
    const said = (await events(bot, /^story\/line$/)).filter((e) => e.t >= t0).map((e) => ({ k: e.p.key, s: (e.t - t0) / 60 }));
    const at = (k) => said.filter((l) => l.k === k).map((l) => l.s);
    assert.ok(at('hint_kept_1').length === 1 && at('hint_kept_2').length === 1, `both hint lines once each (${said.map((l) => l.k + '@' + l.s.toFixed(0)).join(' ')})`);
    assert.ok(at('hint_kept_2')[0] > at('hint_kept_1')[0], 'in their order');
    for (const k of ['stn_boss_refilled', 'stn_boss_head_dry_refilling']) {
      const t = at(k);
      for (let i = 1; i < t.length; i++) assert.ok(t[i] - t[i - 1] >= 19.9, `${k} at ${t.map((x) => x.toFixed(1)).join(', ')} s: twenty seconds apart`);
    }
  } finally { await bot.close(); }
});

test('"Go on" from the title, real game with a stored save: the movement\'s card is shown again and the work at hand named (she stood in Front Street with no card and no line); a death after it shows no card', async () => {
  const browser = await launchBrowser({});
  const context = await browser.newContext({ viewport: { width: 480, height: 270 } });
  const page = await context.newPage();
  const ready = () => page.waitForFunction(() => !!(window.__dbg && (window.__dbg.ready || window.__dbg.error)), null, { polling: 100 });
  const settle = () => page.evaluate(async () => {
    const d = window.__dbg, core = d.ext.core;
    for (let i = 0; i < 400 && d.state().game !== 'playing'; i++) { await Promise.race([core.idle(), new Promise((r) => setTimeout(r, 50))]); await new Promise((r) => setTimeout(r, 10)); }
    return d.state().game;
  });
  try {
    await page.goto(srv.url + '?test=1&persist=1&tier=low&seed=1');
    await ready();
    await page.evaluate(() => localStorage.clear());
    await page.click('.scr.on [data-item="play"]');
    assert.equal(await settle(), 'playing');
    // a real save past the gate posts: the town's card and its name line are spent before it
    const T = marker('trg_enc_street');
    await page.evaluate(async (t) => {
      const d = window.__dbg, core = d.ext.core;
      d.god(true);
      d.solvePuzzle('seven_jugs');
      await core.stepAsync(30, false);
      d.teleport(t.pos[0], t.pos[1], t.pos[2], 90, 0);
      await core.stepAsync(12 * 60, false);
      d.clearEncounter('enc_street');
      await core.stepAsync(8 * 60, false);
    }, T);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('keepseven.save.v1')));
    assert.equal(stored && stored.checkpoint, 'cp_street_clear', 'a stored save in Front Street');
    assert.ok(stored.world.onceFlags.includes('card_ii') && stored.world.onceFlags.includes('nar_plenty'), 'with the card and the town\'s name line spent');
    await page.reload();
    await ready();
    await page.click('.scr.on [data-item="continue"]');
    assert.equal(await settle(), 'playing', 'Go on');
    const got = await page.evaluate(async () => {
      const d = window.__dbg, core = d.ext.core;
      const t0 = d.state().tick;
      await core.stepAsync(5 * 60, false);
      const ev = d.events(0).filter((e) => e.tick >= t0 - 5);
      return {
        cards: ev.filter((e) => e.name === 'story/card').map((e) => [e.payload.key, (e.tick - t0) / 60]),
        objective: d.state().world.objective, flags: d.ext.world.status().story,
      };
    });
    assert.deepEqual(got.cards.map((c) => c[0]), ['card_ii'], `"${STORY.lines.card_ii.text}" is shown again (${JSON.stringify(got)})`);
    assert.ok(got.cards[0][1] <= 0.5, 'in the first half second');
    assert.ok(got.objective !== '', 'the work at hand is set');
    // a death and its restore: no card again
    const after = await page.evaluate(async () => {
      const d = window.__dbg, core = d.ext.core;
      d.god(false);
      const t0 = d.state().tick;
      core.damage(1000);
      await core.stepAsync(10 * 60, false);
      return { cards: d.events(0).filter((e) => e.tick > t0 && e.name === 'story/card').map((e) => e.payload.key), game: d.state().game };
    });
    assert.equal(after.game, 'playing', 'she is back');
    assert.deepEqual(after.cards, [], 'a death comes back without the card');
  } finally { await browser.close(); }
});
