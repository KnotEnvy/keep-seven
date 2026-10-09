// Pass i3 (UI), in the REAL game (all six systems, final assets). One browser at a time, each leg short and in a fresh
// browser from a checkpoint (the memory rule):
//   1. the interact prompt is the row above the hint in the lower third: clear of the crosshair, the thing read, the muzzle
//   2. at 4:3 the title's column stands on a soft ink ground; at 16:9 it has none
//   3. low health in the boss room and the Tally House: a pale line and brackets inside the frame, the bars larger
//   4. the bore door's live question stands under the work at hand while she is at the door, and on the pause screen
//   5. the credits name the version, the source and where to report; a one-card note closes on E and says so
//   6. a first load with the files held back: the title frame stands behind the name on the pre-boot page and the
//      loading screen (the share picture, by its relative address), and the title comes through it
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { ROOT, startServer } from '../harness.mjs';
import { launchBrowser } from '../../tools/browser.mjs';
import { STORY, openBot } from '../e2e/lib/bot.mjs';

const OUT = path.join(ROOT, 'shots', 'i3-team-ui');
fs.mkdirSync(OUT, { recursive: true });
const VP = { width: 1280, height: 720 };
const step = (page, n, render = false) => page.evaluate(([k, r]) => window.__dbg.ext.core.stepAsync(k, r), [n, render]);
const rect = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(), c = getComputedStyle(e); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, shown: c.display !== 'none' && c.visibility !== 'hidden' && Number(c.opacity) > 0.01, text: e.textContent }; }, sel);
/** mean of R, G and B over a box of a PNG buffer */
function luma(buffer, x0, y0, x1, y1) {
  const p = PNG.sync.read(buffer);
  let s = 0, n = 0;
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(p.height, y1); y++) for (let x = Math.max(0, Math.floor(x0)); x < Math.min(p.width, x1); x++) { const i = (y * p.width + x) * 4; s += p.data[i] + p.data[i + 1] + p.data[i + 2]; n += 3; }
  return n > 0 ? s / n : 0;
}
const settled = async (page, name, ms = 500) => { await step(page, 0, true); await page.waitForTimeout(ms); return page.screenshot({ path: path.join(OUT, name + '.png') }); };

test('real game: the interact prompt stands above the hint in the lower third, not under the crosshair on the thing she reads', async () => {
  const server = await startServer({});
  const bot = await openBot(server, { piece: 'i3-team-ui', tier: 'low', viewport: VP, checkpoint: 'cp_rim' });
  try {
    await bot.eval(async (b) => { await b.walkToMarker('trg_rim_arrive', { stopRadius: 0.5, maxTicks: 600 }); const st = b.marker('trg_stone'); await b.walkTo(st.pos[0] + 0.5, st.pos[2], { stopRadius: 0.4, maxTicks: 900 }); b.lookAtMarker('ia_stone_round'); await b.step(20); });
    await settled(bot.page, 'real_prompt_stone');
    const vt = await bot.page.evaluate(() => window.__dbg.ext.core.ctx().ui.visibleText());
    assert.match(vt.prompt, /^E\s+(Read|Take)$/, `the prompt at the stone (${vt.prompt})`);
    const p = await rect(bot.page, '.k7 .talk > .prompt.row'), talk = await rect(bot.page, '.k7 .talk'), sub = await rect(bot.page, '.k7 .sub'), hint = await rect(bot.page, '.k7 .prompt.hint');
    assert.ok(p && p.shown && p.text.replace(/\s+/g, ' ') === vt.prompt.replace(/\s+/g, ' '), 'the prompt is a row of the talk column');
    // it was at 57.5 % (y 414 .. 438 at 720p): on the cases, 60 px under the crosshair, the muzzle tip at (700, 430)
    assert.ok(p.t > VP.height * 0.7, `its top is in the lower third (${p.t.toFixed(0)} of ${VP.height}; it was 414)`);
    assert.ok(p.t - VP.height / 2 > 150, `${(p.t - VP.height / 2).toFixed(0)} px under the crosshair (it was 54)`);
    assert.ok(p.b <= hint.t + 1 && p.t >= talk.t - 1, 'above the hint row, inside the column');
    if (sub.shown) assert.ok(p.b <= sub.t, 'and above the subtitle');
    assert.ok(Math.abs((p.l + p.r) / 2 - VP.width / 2) < 2, 'centred');
    // when it goes, the rows under it do not move
    const hintWith = hint.t;
    await bot.eval(async (b) => { b.lookAt(b.marker('trg_stone').pos[0] - 30, 40, b.marker('trg_stone').pos[2]); await b.step(20); });
    await step(bot.page, 2, true);
    const gone = await rect(bot.page, '.k7 .talk > .prompt.row');
    assert.equal(gone.shown && gone.h > 0, false, 'looking away takes it down');
    assert.ok(Math.abs((await rect(bot.page, '.k7 .prompt.hint')).t - hintWith) < 0.5, 'the hint row stands where it stood');
    console.log(`real prompt: "${vt.prompt}" at y ${p.t.toFixed(0)} .. ${p.b.toFixed(0)} of ${VP.height} (${(p.t - 360).toFixed(0)} px under the crosshair; it was 414 .. 438)`);
  } finally { await bot.close().catch(() => {}); await server.close(); }
});

test('real game: at 4:3 the title column stands on a soft ink ground over the lit sand; at 16:9 it has none', async () => {
  const server = await startServer({});
  try {
    const out = {};
    for (const [w, h] of [[1024, 768], [1280, 720]]) {
      const bot = await openBot(server, { piece: 'i3-team-ui', tier: 'low', viewport: { width: w, height: h } });
      try {
        await bot.page.waitForTimeout(1000);
        const ground = await bot.page.evaluate(() => { const m = document.querySelector('.k7 .title > .menu'), c = getComputedStyle(m, '::before'); return { content: c.content, bg: c.backgroundColor, filter: c.filter }; });
        const menu = await rect(bot.page, '.k7 .title > .menu');
        const item = await rect(bot.page, '.k7 .title [data-item="story"]');
        const withGround = await bot.page.screenshot({ path: path.join(OUT, `real_title_${w}x${h}.png`) });
        await bot.page.addStyleTag({ content: '.k7 .title > .menu::before { display: none !important; }' });
        const bare = await bot.page.screenshot();
        // the strip just right of the longest item, where the lit sand begins
        const box = [item.r + 2, item.t - 4, item.r + 34, item.b + 4];
        out[w] = { ground, menu, lit: luma(bare, ...box), shaded: luma(withGround, ...box) };
      } finally { await bot.close().catch(() => {}); }
    }
    const narrow = out[1024], wide = out[1280];
    assert.ok(narrow.ground.content !== 'none' && /rgba\(20, 17, 15, 0\.7\d*\)/.test(narrow.ground.bg) && /blur/.test(narrow.ground.filter), `4:3: an ink ground, blurred (${JSON.stringify(narrow.ground)})`);
    assert.ok(narrow.shaded < narrow.lit * 0.88, `4:3: the sand beside "The story so far" is darker under it (${narrow.lit.toFixed(0)} -> ${narrow.shaded.toFixed(0)})`);
    assert.ok(narrow.menu.b <= 768 * 0.955 && narrow.menu.l > 0, 'the column is where pass i2 put it');
    assert.equal(wide.ground.content, 'none', '16:9: the column stands in the dark, with no ground');
    assert.ok(Math.abs(wide.shaded - wide.lit) < 0.5);
    console.log(`real title: at 1024 x 768 the strip beside the longest item is ${narrow.lit.toFixed(0)} without the ground and ${narrow.shaded.toFixed(0)} with it; 1280 x 720 has no ground`);
  } finally { await server.close(); }
});

test('real game: low health is seen in the dark rooms: a pale line and four brackets inside the frame, and larger bars', async () => {
  const server = await startServer({});
  try {
    const rows = [];
    for (const cp of ['cp_boss_p1', 'cp_tally_enter']) {
      const bot = await openBot(server, { piece: 'i3-team-ui', tier: 'low', viewport: VP, checkpoint: cp });
      try {
        await step(bot.page, 30);
        const full = await settled(bot.page, `real_low_${cp}_full`, 300);
        const before = { frame: await rect(bot.page, '.k7 .lowf'), health: await rect(bot.page, '.k7 .health'), low: await bot.page.evaluate(() => document.querySelector('.k7 .hud').classList.contains('low')) };
        assert.deepEqual([before.low, before.frame.shown], [false, false], `${cp}: nothing at full health`);
        await bot.page.evaluate(() => { window.__dbg.setHealth(12); });
        await step(bot.page, 3, true);
        // the cue breathes on the wall clock: held still for the picture (reduce motion is the same rule, steady)
        await bot.page.addStyleTag({ content: '.k7 .hud.low .lowf { animation: none !important; opacity: 1 !important; } .k7 .hud.low .seg { animation: none !important; }' });
        const low = await settled(bot.page, `real_low_${cp}_12hp`, 900);
        const frame = await rect(bot.page, '.k7 .lowf'), health = await rect(bot.page, '.k7 .health'), mark = await rect(bot.page, '.k7 .hud .mark [data-part="seventh"]');
        const corner = await bot.page.evaluate(() => { const i = document.querySelector('.k7 .lowf .tr'), c = getComputedStyle(i), r = i.getBoundingClientRect(); return { colour: c.borderTopColor, width: parseFloat(c.borderTopWidth), w: r.width, h: r.height }; });
        assert.ok(frame.shown && frame.l > 8 && frame.l < 24 && frame.r > VP.width - 24, `${cp}: the line stands just inside the frame (${frame.l.toFixed(0)} .. ${frame.r.toFixed(0)})`);
        assert.deepEqual([corner.colour, corner.width >= 3, corner.w >= 60], ['rgb(243, 230, 207)', true, true], `${cp}: pale brackets (${JSON.stringify(corner)})`);
        assert.ok(health.w > before.health.w * 1.7 && health.h > before.health.h * 1.7, `${cp}: the bars at nearly twice their size (${before.health.w.toFixed(0)} x ${before.health.h.toFixed(0)} -> ${health.w.toFixed(0)} x ${health.h.toFixed(0)})`);
        assert.ok(health.t > mark.b, `${cp}: and still under the seventh (${health.t.toFixed(1)} / ${mark.b.toFixed(1)})`);
        // the picture: the top-right bracket's two strokes, far from every other gauge, are much paler than the room was
        const tr = await rect(bot.page, '.k7 .lowf .tr');
        assert.ok([tr.t, tr.r, frame.t, frame.l].every((v) => Math.abs(v - Math.round(v)) < 0.01), `${cp}: the line and the brackets' strokes are on whole pixels (${[tr.t, tr.r, frame.t, frame.l]})`);
        const w = Math.round(corner.width), x1 = Math.round(tr.r), y0 = Math.round(tr.t);
        const top = [x1 - 60, y0, x1 - 8, y0 + w], side = [x1 - w, y0 + 8, x1, y0 + 60];
        const was = (luma(full, ...top) + luma(full, ...side)) / 2, is = (luma(low, ...top) + luma(low, ...side)) / 2;
        assert.ok(is > 170 && is - was > 70, `${cp}: the bracket is pale on the dark edge (${was.toFixed(0)} -> ${is.toFixed(0)} of 255)`);
        // and the hairline between the brackets, mid-edge
        const mid = [VP.width / 2 - 40, Math.round(frame.t), VP.width / 2 + 40, Math.round(frame.t) + 1];
        assert.ok(luma(low, ...mid) - luma(full, ...mid) > 12, `${cp}: the hairline shows at the middle of the top edge (${luma(full, ...mid).toFixed(0)} -> ${luma(low, ...mid).toFixed(0)})`);
        rows.push(`${cp}: bracket ${was.toFixed(0)} -> ${is.toFixed(0)}, hairline ${luma(full, ...mid).toFixed(0)} -> ${luma(low, ...mid).toFixed(0)}, bars ${before.health.w.toFixed(0)} -> ${health.w.toFixed(0)} px`);
        // healed: it goes
        await bot.page.evaluate(() => { window.__dbg.setHealth(100); });
        await step(bot.page, 3, true);
        assert.equal(await bot.page.evaluate(() => document.querySelector('.k7 .hud').classList.contains('low')), false);
      } finally { await bot.close().catch(() => {}); }
    }
    console.log(`real low health (mean of R, G, B on the cue's pixels, full health -> 12 HP): ${rows.join('; ')}`);
  } finally { await server.close(); }
});

test('real game, the antechamber: the door\'s live question stands under the work at hand while she is at the door, follows the answers, and is on the pause screen', async () => {
  const server = await startServer({});
  const bot = await openBot(server, { piece: 'i3-team-ui', tier: 'low', viewport: VP, checkpoint: 'cp_bore_ante' });
  try {
    const obj = () => bot.page.evaluate(() => { const o = document.querySelector('.k7 .obj'), a = o.querySelector('.obj-ask'), c = getComputedStyle(o); return { on: o.classList.contains('on') && c.visibility !== 'hidden', line: o.querySelector('.obj-line').textContent, say: a.classList.contains('on') ? a.querySelector('.ask-say').textContent : '', n: a.classList.contains('on') ? a.querySelector('.ask-n').textContent : '', colour: getComputedStyle(a.querySelector('.ask-say')).color }; });
    const L = STORY.lines, of = STORY.ui.ui_end_of;
    assert.equal((await obj()).say, '', 'no question before she is asked');
    await bot.eval(async (b) => { await b.walkTo(14, 78, { stopRadius: 0.25, maxTicks: 600 }); b.lookAt(14, -42.5, 80); await b.step(60); });
    let o = await obj();
    assert.deepEqual([o.on, o.line, o.say, o.n], [true, STORY.objectives.obj_ante, L.stn_ask_1.text, `1 ${of} 3`], 'the first question, in the station\'s words, with its count');
    assert.equal(o.colour, 'rgb(124, 242, 226)', 'in the station\'s aqua');
    // the subtitle is long gone and nothing else says what is asked: it still stands (it was on screen 2.5 s in all)
    let seen = 0;
    for (let i = 0; i < 20; i++) { await step(bot.page, 120); o = await obj(); if (o.on && o.say === L.stn_ask_1.text) seen++; }
    assert.equal(seen, 20, `over 40 s at the door the question is on screen at every look (${seen} of 20)`);
    await settled(bot.page, 'real_ask_q1_40s');
    const box = await rect(bot.page, '.k7 .obj');
    assert.ok(box.r < VP.width * 0.4 && box.b < VP.height * 0.2, `top left, clear of the dial's middle (${box.r.toFixed(0)}, ${box.b.toFixed(0)})`);
    // the pause screen carries it
    await bot.page.evaluate(() => { window.__dbg.ext.core.ctx().state.request('paused', 'menu', 'test'); });
    await bot.page.waitForTimeout(100);
    const paused = await bot.page.evaluate(() => { const s = document.querySelector('.k7 .pause.on .pause-side'); if (!s) return null; const a = s.querySelector('.obj-ask'); return { obj: s.querySelector('.obj-text').textContent, ask: a.classList.contains('on') ? [a.querySelector('.ask-say').textContent, a.querySelector('.ask-n').textContent] : [], above: a.getBoundingClientRect().bottom <= s.querySelector('.mark').getBoundingClientRect().top && a.getBoundingClientRect().top >= s.querySelector('.obj-text').getBoundingClientRect().bottom - 1 }; });
    assert.ok(paused, 'the pause screen is up');
    assert.deepEqual([paused.obj, paused.ask, paused.above], [STORY.objectives.obj_ante, [L.stn_ask_1.text, `1 ${of} 3`], true], 'the pause screen: the work at hand, then the question, then the mark');
    await bot.page.screenshot({ path: path.join(OUT, 'real_ask_pause.png') });
    await bot.page.evaluate(() => { window.__dbg.ext.core.ctx().state.request('playing', 'resume'); });
    await step(bot.page, 5);
    // she leaves: it fades like any objective; she comes back: it is there again
    await bot.eval(async (b) => { await b.walkTo(14, 70, { stopRadius: 0.4, maxTicks: 900 }); await b.step(60 * 6); });
    assert.equal((await obj()).on, false, 'away from the door it is gone after five seconds');
    await bot.eval(async (b) => { await b.walkTo(14, 78, { stopRadius: 0.25, maxTicks: 600 }); await b.step(10); });
    o = await obj();
    assert.deepEqual([o.on, o.say], [true, L.stn_ask_1.text], 'back at the door it stands again');
    // the right port: the second question; then the third
    const port = (n) => bot.eval(async (b, _dbg, id) => { const m = b.marker(id); await b.shootAt(m.pos[0], m.pos[1], m.pos[2]); await b.step(20); }, `ia_ask_port_${n}`);
    await port(4);
    o = await obj();
    assert.deepEqual([o.on, o.say, o.n], [true, L.stn_ask_2.text, `2 ${of} 3`]);
    await port(6);
    o = await obj();
    assert.deepEqual([o.on, o.say, o.n], [true, L.stn_ask_3.text, `3 ${of} 3`]);
    await settled(bot.page, 'real_ask_q3');
    // answered (she holds her fire): the question goes with the puzzle
    await bot.eval(async (b) => { for (let i = 0; i < 40 && !window.__dbg.ext.core.ctx().world.puzzle('the_asking').solved; i++) await b.step(60); await b.step(30); });
    assert.equal(await bot.page.evaluate(() => window.__dbg.ext.core.ctx().world.puzzle('the_asking').solved), true, 'the door opened');
    o = await obj();
    assert.equal(o.say, '', 'no question once the door has its answers');
    console.log(`real asking: "${L.stn_ask_1.text} 1 ${of} 3" on screen at 20 of 20 looks over 40 s (it was a 2.5 s subtitle), on the pause screen, gone 6 s after leaving, back on return; then 2 ${of} 3, 3 ${of} 3, and nothing once solved`);
  } finally { await bot.close().catch(() => {}); await server.close(); }
});

test('real game: the credits name the version, the source and where to report a problem; a one-card note says E closes it, and E does', async () => {
  const server = await startServer({});
  const bot = await openBot(server, { piece: 'i3-team-ui', tier: 'low', viewport: VP });
  try {
    const foot = () => bot.page.evaluate(() => [...document.querySelectorAll('.k7 .reader.on .mi')].filter((m) => getComputedStyle(m).display !== 'none').map((m) => m.querySelector('.key').textContent + ' ' + m.querySelector('.mi-label').textContent));
    await bot.page.click('[data-item="credits"]');
    await bot.page.waitForTimeout(200);
    const c = await bot.page.evaluate(() => { const s = document.querySelector('.k7 .reader.on .sheet'), r = s.getBoundingClientRect(); return { body: s.querySelector('.sheet-body').textContent, lines: [...s.querySelectorAll('.sheet-extra.on .cr-line')].map((l) => [l.querySelector('.cr-lab').textContent, l.querySelector('.cr-val, .cr-link').textContent, Math.max(l.querySelector('.cr-lab').getClientRects().length, l.querySelector('.cr-val, .cr-link').getClientRects().length), l.querySelector('.cr-lab').getBoundingClientRect().height, l.querySelector('.cr-val, .cr-link').getBoundingClientRect().height, l.getBoundingClientRect().height]), links: [...s.querySelectorAll('.sheet-extra.on a')].map((a) => [a.href, a.target, a.rel, getComputedStyle(a).pointerEvents, getComputedStyle(a).cursor]), inside: r.top > 0 && r.bottom < innerHeight && r.left > 0 && r.right < innerWidth }; });
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    assert.ok(c.body.startsWith(STORY.ui.ui_credits_body) && /three\.js/.test(c.body) && /Blender/.test(c.body), c.body);
    assert.equal(c.lines.length, 3);
    assert.match(c.lines[0][1], new RegExp(`^${pkg.version.replace(/\./g, '\\.')} · \\d{4}-\\d\\d-\\d\\d$`), `the version and the day (${c.lines[0][1]})`);
    assert.deepEqual(c.links.map((l) => l[0]), ['https://github.com/KnotEnvy/keep-seven', 'https://github.com/KnotEnvy/keep-seven/issues'], 'off a github.io address the links are the project\'s own');
    assert.ok(c.links.every((l) => l[1] === '_blank' && /noopener/.test(l[2]) && l[3] !== 'none' && l[4] === 'pointer'), 'links that can be clicked, to a new tab');
    assert.ok(c.lines.every((l) => l[3] < 22 && l[4] < 26), `each label and each value on one line (${JSON.stringify(c.lines.map((l) => l.slice(2)))})`);
    assert.equal(c.inside, true);
    assert.deepEqual(await foot(), ['E ' + STORY.ui.ui_read_close], 'one card: E  Close');
    await bot.page.screenshot({ path: path.join(OUT, 'real_credits.png') });
    // a click on a link is the link's: the sheet stays (the new tab is not followed here)
    await bot.page.evaluate(() => { const a = document.querySelector('.k7 .sheet-extra a'); a.addEventListener('click', (e) => e.preventDefault(), { once: true }); a.click(); });
    assert.equal(await bot.page.evaluate(() => window.__dbg.state().systems.ui.screen), 'credits');
    await bot.page.keyboard.press('KeyE');
    assert.equal(await bot.page.evaluate(() => window.__dbg.state().systems.ui.screen), 'title', 'E closes it');
    // the first note of the game
    await bot.startFromTitle();
    assert.equal(await bot.eval(async (b) => b.helpers.use('rd_note_lip')), true);
    await step(bot.page, 6, true);
    assert.deepEqual(await foot(), ['E ' + STORY.ui.ui_read_close], 'the note at the camp: E  Close (it said Right click, or Esc)');
    assert.equal(await bot.page.evaluate(() => document.querySelector('.k7 .sheet-extra').classList.contains('on')), false, 'a note has no credits under it');
    await bot.page.screenshot({ path: path.join(OUT, 'real_note_close.png') });
    await bot.page.keyboard.press('KeyE');
    await step(bot.page, 3);
    assert.deepEqual(await bot.page.evaluate(() => { const s = window.__dbg.state(); return [s.game, s.systems.ui.screen]; }), ['playing', '']);
    console.log(`real credits: "${c.lines.map((l) => l.slice(0, 2).join(' ')).join('" / "')}"; legend "E ${STORY.ui.ui_read_close}" on the credits and on rd_note_lip, and E closed both`);
  } finally { await bot.close().catch(() => {}); await server.close(); }
});

test('real game, a first load with the files held back: the title frame stands behind the name before and during the load, and the title comes through it', async () => {
  const server = await startServer({});
  const browser = await launchBrowser();
  try {
    const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.goto(server.url, { timeout: 120000 });
    await page.waitForSelector('.k7 .scr.title.on', { timeout: 120000 });
    const RATE = 1.5e6;
    let queue = Promise.resolve();
    await page.route(/\/assets\/.*\.(glb|webp|png)(\?.*)?$/, async (route) => {
      const res = await route.fetch(); const body = await res.body();
      queue = queue.then(() => new Promise((r) => setTimeout(r, (body.length / RATE) * 1000))).then(() => route.fulfill({ response: res, body }));
    });
    let held = false;
    await page.route(/\/src\/main\.ts/, async (route) => { if (!held) { held = true; await new Promise((r) => setTimeout(r, 1500)); } await route.continue(); });
    const pictures = [];
    page.on('response', (r) => { if (/share\.jpg/.test(r.url())) pictures.push([new URL(r.url()).pathname, r.status()]); });
    const t0 = Date.now();
    page.reload({ timeout: 120000 }).catch(() => {});
    // ---- the pre-boot page: no script of the game has run
    await page.waitForSelector('#preload .bg.in', { timeout: 30000 });
    await page.waitForTimeout(1000);                                  // its 0.9 s fade
    const pre = await page.evaluate(() => { const p = document.getElementById('preload'), bg = p.querySelector('.bg'), c = getComputedStyle(bg), line = p.querySelector('.line').getBoundingClientRect(), name = p.querySelector('.name').getBoundingClientRect(), r = bg.getBoundingClientRect(); return { image: bg.style.backgroundImage, filter: c.filter, opacity: c.opacity, line: [line.left, line.right, line.top], name: [name.left, name.right], box: [r.top, r.bottom, innerHeight], ui: document.querySelector('#ui').childElementCount }; });
    assert.equal(pre.ui, 0, 'the game has drawn nothing yet');
    assert.equal(pre.image, 'url("./share.jpg")', 'the share picture, by its relative address');
    assert.ok(/blur\(/.test(pre.filter) && /brightness\(0\.4/.test(pre.filter) && pre.opacity === '1', `out of focus and dim (${pre.filter})`);
    // the picture's top fifth (where the share picture prints the name) is above the frame
    assert.ok(-pre.box[0] / (pre.box[1] - pre.box[0]) > 0.2, `the box starts ${(-pre.box[0]).toFixed(0)} px above the frame`);
    assert.ok(Math.abs(pre.line[1] - pre.name[1]) < 24 && pre.line[1] - pre.line[0] > 480, `the line is as wide as the name (${pre.line[0].toFixed(0)} .. ${pre.line[1].toFixed(0)}; the name ends at ${pre.name[1].toFixed(0)}; it was 220 px)`);
    const preShot = await page.screenshot({ path: path.join(OUT, 'real_preload.png') });
    const preMean = luma(preShot, 0, 0, VP.width, VP.height);
    assert.ok(preMean > 34 && preMean < 95, `the pre-boot frame is a dim picture, not flat ink (mean ${preMean.toFixed(1)}; ink is 17.3)`);
    // ---- the loading screen: the same picture, already there (no second fade), the line where it was
    let loadShot = null, load = null, title = false, outSeen = false, looks = 0;
    while (Date.now() - t0 < 100000 && !title) {
      await page.waitForTimeout(150);
      const s = await page.evaluate(() => { const scr = document.querySelector('.k7 .scr.on'), l = document.querySelector('.k7 .loading'), bg = document.querySelector('.k7 .load-bg'), line = document.querySelector('.k7 .load-line'); if (!l || !bg) return null; const c = getComputedStyle(bg), r = line.getBoundingClientRect(); return { scr: scr ? scr.className : '', out: l.classList.contains('out'), cls: bg.className, image: bg.style.backgroundImage, opacity: c.opacity, filter: c.filter, line: [r.left, r.right, r.top], pre: !!document.getElementById('preload') }; }).catch(() => null);
      if (!s) continue;
      if (/loading/.test(s.scr)) { looks++; if (looks === 6) { load = s; loadShot = await page.screenshot({ path: path.join(OUT, 'real_loading.png') }); } }
      if (/title/.test(s.scr)) { title = true; outSeen = s.out; }
    }
    assert.ok(title && load, `the title came (${looks} looks at the loading screen)`);
    assert.deepEqual([load.pre, load.cls, load.opacity], [false, 'load-bg cut in', '1'], 'the loading screen took the picture over whole, with no second fade');
    assert.ok(/share\.jpg/.test(load.image) && load.filter === pre.filter, 'the same picture, as dim and as soft');
    assert.ok(load.line.every((v, i) => Math.abs(v - pre.line[i]) < 1), `the line did not move (${load.line.map((v) => v.toFixed(0))} / ${pre.line.map((v) => v.toFixed(0))})`);
    const loadMean = luma(loadShot, 0, 0, VP.width, VP.height);
    assert.ok(Math.abs(loadMean - preMean) < 6, `and the frame is the one that was there (${preMean.toFixed(1)} / ${loadMean.toFixed(1)})`);
    // the name is read on it: the picture behind the head is dim (the bone of the letters is 226)
    assert.ok(luma(loadShot, 90, 60, 640, 240) < 110);
    // ---- into the title: the picture fades off the live shot, and is then gone
    assert.equal(outSeen, true, 'the backdrop is fading out over the title as it arrives');
    await page.screenshot({ path: path.join(OUT, 'real_load_to_title.png') });
    await page.waitForTimeout(1300);
    const after = await page.evaluate(() => { const l = document.querySelector('.k7 .loading'); return { cls: l.className, display: getComputedStyle(l).display }; });
    assert.deepEqual(after, { cls: 'scr loading', display: 'none' }, 'and it is taken away when it has faded');
    await page.screenshot({ path: path.join(OUT, 'real_title_after_load.png') });
    assert.ok(pictures.length >= 1 && pictures.every((p) => p[0] === '/share.jpg' && (p[1] === 200 || p[1] === 304)), `the picture was asked for beside the page (${JSON.stringify(pictures)})`);
    console.log(`real cold load at ${RATE / 1e6} MB/s: pre-boot frame mean ${preMean.toFixed(1)} (flat ink 17.3), loading ${loadMean.toFixed(1)}, line ${pre.line[0].toFixed(0)} .. ${pre.line[1].toFixed(0)} px (name to ${pre.name[1].toFixed(0)}), ${looks} looks at the loading screen, title at ${((Date.now() - t0) / 1000 - 1.3).toFixed(1)} s, backdrop faded out and removed; share.jpg requests ${JSON.stringify(pictures)}`);
    await ctx.close();
  } finally { await browser.close(); await server.close(); }
});
