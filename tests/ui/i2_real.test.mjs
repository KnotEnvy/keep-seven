// Pass i2 (UI), in the REAL game (all six systems, final assets). One browser at a time, each leg short and in a fresh
// browser from a checkpoint (the memory rule):
//   1. the opening: the first objective is on screen in play from the first second for five, and the first note is one card
//   2. the rim: the line that names the last choice stands for as long as she is at the stone, goes when she walks away
//   3. the antechamber: close to the asking's dial the subtitle stands on the bottom margin, thinned, clear of numeral 5
//   4. a first load with the asset files held back: the loading line follows the bytes in and never goes back
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, startServer } from '../harness.mjs';
import { launchBrowser } from '../../tools/browser.mjs';
import { STORY, openBot } from '../e2e/lib/bot.mjs';

const OUT = path.join(ROOT, 'shots', 'i2-team-ui');
fs.mkdirSync(OUT, { recursive: true });
const VP = { width: 1280, height: 720 };
const OBJ = STORY.objectives;
/** what is drawn of the objective right now, and the HUD's own account of it */
const objective = (page) => page.evaluate(() => { const o = document.querySelector('.k7 .obj'), c = getComputedStyle(o), s = window.__dbg.state(); return { on: o.classList.contains('on') && c.visibility !== 'hidden' && c.display !== 'none', text: o.querySelector('.obj-line').textContent, hud: s.systems.ui.hud.objective, tick: s.tick, world: window.__dbg.objectives().current }; });
const step = (page, n, render = false) => page.evaluate(([k, r]) => window.__dbg.ext.core.stepAsync(k, r), [n, render]);

test('real game, the opening: the first objective is drawn in play for five seconds; the first note is one card', async () => {
  const server = await startServer({});
  const bot = await openBot(server, { piece: 'i2-team-ui', tier: 'low', viewport: VP });
  try {
    await bot.startFromTitle();
    const t0 = (await objective(bot.page)).tick;
    let first = -1, last = -1, text = '';
    for (let i = 0; i < 40; i++) {
      await step(bot.page, 10);
      const o = await objective(bot.page);
      if (o.on && o.hud !== '') { if (first < 0) { first = o.tick - t0; text = o.text; } last = o.tick - t0; }
    }
    assert.equal(text, OBJ.obj_lip_camp, 'the first objective, in story.json\'s words');
    assert.ok(first >= 0 && first <= 60, `on screen within the first second of play (${(first / 60).toFixed(2)} s)`);
    assert.ok(last - first >= 270 && last - first <= 320, `for five seconds (${((last - first) / 60).toFixed(2)} s)`);
    // the note at the camp: one card, the whole of it
    const opened = await bot.eval(async (b) => b.helpers.use('rd_note_lip'));
    assert.equal(opened, true);
    await step(bot.page, 6, true);
    const sheet = await bot.page.evaluate(() => { const s = document.querySelector('.k7 .reader.on .sheet'), r = s.getBoundingClientRect(); return { reader: window.__dbg.state().systems.ui.reader, body: s.querySelector('.sheet-body').textContent, inside: r.top > 0 && r.bottom < innerHeight, objective: getComputedStyle(document.querySelector('.k7 .obj')).visibility }; });
    assert.deepEqual(sheet.reader, { key: 'rd_note_lip', card: 0, cards: 1 }, 'one card');
    assert.equal(sheet.body, STORY.readables.rd_note_lip.body);
    assert.deepEqual([sheet.inside, sheet.objective], [true, 'hidden']);
    console.log(`real opening: objective first drawn ${(first / 60).toFixed(2)} s after Begin, up ${((last - first) / 60).toFixed(2)} s; rd_note_lip is ${sheet.reader.cards} card`);
  } finally { await bot.close().catch(() => {}); await server.close(); }
});

test('real game, the rim: the choice stands on screen while she is at the stone, and goes when she walks away or takes the round', async () => {
  const server = await startServer({});
  const bot = await openBot(server, { piece: 'i2-team-ui', tier: 'low', viewport: VP, checkpoint: 'cp_rim' });
  try {
    const walked = await bot.eval(async (b) => { await b.walkToMarker('trg_rim_arrive', { stopRadius: 0.5, maxTicks: 600 }); const st = b.marker('trg_stone'); const r = await b.walkTo(st.pos[0] + 0.5, st.pos[2], { stopRadius: 0.4, maxTicks: 900 }); b.lookAtMarker('ia_stone_round'); await b.step(3); return r.reason; });
    assert.equal(walked, 'arrived');
    // the movement card is up as she arrives: the line comes when it has gone, and then stands
    let on = 0, n = 0;
    for (let i = 0; i < 60; i++) { await step(bot.page, 20); const o = await objective(bot.page); if (i >= 12) { n++; if (o.on && o.hud === OBJ.obj_rim_choice) on++; } assert.equal(o.world, 'obj_rim_choice'); }
    assert.equal(on, n, `from 4 s to 20 s at the stone the choice is on screen at every look (${on} of ${n}; five seconds would have been ${Math.round(n / 3)})`);
    await step(bot.page, 0, true); await bot.page.waitForTimeout(500);
    await bot.page.screenshot({ path: path.join(OUT, 'real_stone_choice.png') });
    // she walks away: five seconds later it is gone; she comes back: it is there again
    await bot.eval(async (b) => { await b.walkToMarker('trg_rim_arrive', { stopRadius: 0.5, maxTicks: 900 }); });
    await step(bot.page, 330);
    assert.equal((await objective(bot.page)).on, false, 'away from the stone it fades like any objective');
    await bot.eval(async (b) => { const st = b.marker('trg_stone'); await b.walkTo(st.pos[0] + 0.5, st.pos[2], { stopRadius: 0.4, maxTicks: 900 }); b.lookAtMarker('ia_stone_round'); await b.step(3); });
    await step(bot.page, 30);
    assert.equal((await objective(bot.page)).hud, OBJ.obj_rim_choice, 'back at the stone it stands again');
    console.log(`real rim: the choice was on screen ${on} of ${n} looks over 16 s at the stone; gone 5.5 s after leaving; back on return`);
  } finally { await bot.close().catch(() => {}); await server.close(); }
});

test('real game, the antechamber: close to the dial the subtitle box stands on the bottom margin with a thin backing; outside the volume it is where it always is', async () => {
  const server = await startServer({});
  const bot = await openBot(server, { piece: 'i2-team-ui', tier: 'low', viewport: VP, checkpoint: 'cp_bore_ante' });
  try {
    const say = () => bot.page.evaluate(() => { const d = window.__dbg, l = d.ext.core.ctx().data.line('nar_cradle'); d.emit('story/line', { key: 'nar_cradle', speaker: 'narrator', text: l.text, seconds: 6 }); });
    const box = () => bot.page.evaluate(() => { const s = document.querySelector('.k7 .sub'), r = s.getBoundingClientRect(), c = getComputedStyle(s); const cam = window.__dbg.ext.core.ctx().scene.camera ?? null; return { top: r.top, bottom: r.bottom, alpha: Number((/rgba?\(([^)]+)\)/.exec(c.backgroundColor)[1].split(',')[3] ?? '1')), dial: window.__dbg.state().systems.ui.hud.dial, h: innerHeight }; });
    await bot.eval(async (b) => { await b.walkTo(14, 78, { stopRadius: 0.25, maxTicks: 600 }); b.lookAt(14, -42.5, 80); await b.step(30); });
    await say(); await step(bot.page, 4, true);
    const near = await box();
    assert.equal(near.dial, true, 'inside the asking\'s volume');
    assert.ok(near.bottom > near.h * 0.975 && near.bottom <= near.h, `the box stands on the bottom margin (${near.top.toFixed(0)} .. ${near.bottom.toFixed(0)} of ${near.h})`);
    assert.ok(near.top > 0.89 * near.h, `its top is under 89 % of the height: numeral 5 (to 85 % at two metres) is clear (it lay from 83 % to 92 %)`);
    assert.ok(near.alpha > 0.2 && near.alpha < 0.35, `the backing is thin (${near.alpha}): the port reads through it`);
    await bot.page.waitForTimeout(400);
    await bot.page.screenshot({ path: path.join(OUT, 'real_dial_2m.png') });
    await bot.eval(async (b) => { await b.walkTo(14, 70, { stopRadius: 0.4, maxTicks: 900 }); await b.step(5); });
    await say(); await step(bot.page, 4, true);
    const far = await box();
    assert.equal(far.dial, false);
    assert.ok(Math.abs(far.bottom - far.h * 0.92) < 2 && Math.abs(far.alpha - 0.6) < 0.01, `outside the volume the box is at 8 % with its own backing (${far.bottom}, ${far.alpha})`);
    console.log(`real dial: subtitle box ${near.top.toFixed(0)}..${near.bottom.toFixed(0)} px at 2 m (backing ${near.alpha}); ${far.top.toFixed(0)}..${far.bottom.toFixed(0)} px outside the volume (backing ${far.alpha})`);
  } finally { await bot.close().catch(() => {}); await server.close(); }
});

test('real game, a first load with the files held back: the pre-boot page has the line and the larger mark, and the loading line follows the bytes in', async () => {
  const server = await startServer({});
  const browser = await launchBrowser();
  try {
    const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    // warm the dev server's transforms, so the wait that is measured is the asset files'
    await page.goto(server.url, { timeout: 120000 });
    await page.waitForSelector('.k7 .scr.title.on', { timeout: 120000 });
    const RATE = 1.5e6;
    let queue = Promise.resolve(), wire = 0, total = 0;
    await page.route(/\/assets\/.*\.(glb|webp|png)(\?.*)?$/, async (route) => {
      const res = await route.fetch(); const body = await res.body(); total += body.length;
      queue = queue.then(() => new Promise((r) => setTimeout(r, (body.length / RATE) * 1000))).then(() => { wire += body.length; return route.fulfill({ response: res, body }); });
    });
    // the script itself is held for a moment, so the pre-boot page can be looked at
    let held = false;
    await page.route(/\/src\/main\.ts/, async (route) => { if (!held) { held = true; await new Promise((r) => setTimeout(r, 1200)); } await route.continue(); });
    const t0 = Date.now();
    page.reload({ timeout: 120000 }).catch(() => {});
    await page.waitForSelector('#preload .says', { timeout: 30000 });
    const pre = await page.evaluate(() => { const p = document.getElementById('preload'), svg = p.querySelector('svg').getBoundingClientRect(), says = p.querySelector('.says'), c = getComputedStyle(says); return { says: says.textContent, style: c.fontStyle, under: says.getBoundingClientRect().top >= svg.bottom, mark: [svg.width, svg.height] }; });
    assert.ok(STORY.ui.ui_loading_line === pre.says || STORY.readables.rd_backstory.body.includes(pre.says), `the pre-boot line is story.json's (${pre.says})`);
    assert.deepEqual([pre.style, pre.under], ['italic', true]);
    assert.ok(Math.abs(pre.mark[1] - 52) < 0.5, `the pre-boot mark is 52 px tall at 720p (${pre.mark})`);
    await page.screenshot({ path: path.join(OUT, 'real_preload.png') });
    const rows = [];
    let done = false, shot = false;
    while (Date.now() - t0 < 100000 && !done) {
      await page.waitForTimeout(200);
      const before = wire;
      const s = await page.evaluate(() => { const bar = document.querySelector('.k7 .load-line i'), line = document.querySelector('.k7 .load-line'), scr = document.querySelector('.k7 .scr.on'); return { scr: scr ? scr.className : '', bar: bar ? new DOMMatrix(getComputedStyle(bar).transform).a : -1, target: bar ? (/scaleX\(([\d.]+)\)/.exec(bar.style.transform)?.[1] ?? '') : '', tail: !!line && line.classList.contains('tail'), says: scr?.querySelector('.load-says')?.textContent ?? '' }; }).catch(() => null);
      if (!s) continue;
      if (/title/.test(s.scr)) { done = true; break; }
      if (!/loading/.test(s.scr)) continue;
      rows.push({ t: (Date.now() - t0) / 1000, bar: s.bar, target: s.target === '' ? -1 : Number(s.target), tail: s.tail, share: total > 0 ? before / 6791954 : 0, says: s.says });
      if (!shot && s.bar > 0.3) { shot = true; await page.screenshot({ path: path.join(OUT, 'real_loading_mid.png') }); }
    }
    assert.ok(done, 'the title came');
    assert.ok(rows.length >= 8, `${rows.length} looks at the loading screen`);
    assert.equal(rows[0].says, pre.says, 'the loading screen says what the pre-boot page said');
    let back = 0, still = 0, run = 0;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].bar < rows[i - 1].bar - 0.002) back++;
      if (Math.abs(rows[i].bar - rows[i - 1].bar) < 0.0005) { run += rows[i].t - rows[i - 1].t; still = Math.max(still, run); } else run = 0;
    }
    assert.equal(back, 0, 'the line never goes back');
    // the line is the bytes': at every look it is where the bytes handed over so far put it (0.8 of the line for the
    // files, at most 0.12 more for the decodes), give or take the 0.35 s ease
    const off = rows.filter((r) => !r.tail && r.target >= 0).map((r) => r.target - 0.8 * Math.min(1, r.share));
    assert.ok(off.length >= 5 && Math.min(...off) > -0.12 && Math.max(...off) < 0.25, `the line is within the decodes' share of the bytes in (${Math.min(...off).toFixed(3)} .. ${Math.max(...off).toFixed(3)})`);
    const mid = rows.filter((r) => r.share > 0.3 && r.share < 0.7);
    assert.ok(mid.length > 0 && mid.every((r) => r.bar > 0.15 && r.bar < 0.75), 'with a third to two thirds of the bytes in, the line is in its middle (it was at a quarter after two thirds of the wait)');
    assert.equal(rows[rows.length - 1].tail || rows[rows.length - 1].bar > 0.85, true, 'at the end the files are in and the line eases on');
    assert.ok(rows[rows.length - 1].bar < 1, 'and it is not full before the title is there');
    // the size the line divides by is the size that came (a stale figure only bends the line: text.spec.ts holds it within 30 %)
    console.log(`real cold load at ${RATE / 1e6} MB/s: ${total} bytes of assets (BOOT_FILE_BYTES 6791954), loading screen ${rows[0].t.toFixed(1)} .. ${rows[rows.length - 1].t.toFixed(1)} s, ${rows.length} looks, never back, longest stand-still ${still.toFixed(2)} s, line ${rows.map((r) => r.bar.toFixed(2)).filter((_, i) => i % 3 === 0).join(' ')}`);
    await ctx.close();
  } finally { await browser.close(); await server.close(); }
});
