// Pass i4 (UI), in the REAL game (all six systems, final assets). One browser at a time, each leg short and in a fresh
// browser from a checkpoint (the memory rule); no assertion waits on the wall clock:
//   1. a run taken up at the lift hall's gantry: the movement card stands aside for the Tamper's entrance; a hit from
//      behind inks in the bottom of the frame under a pale bar; after a death there the card is not shown again
//   2. the bore: the death line stands on a plate over the lit face of the Windlass, and the line dot is named there
//   3. 4:3: the title's column is clear of the lit sand; at the asking's dial the work at hand ends short of the stencil
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { ROOT, startServer } from '../harness.mjs';
import { STORY, openBot } from '../e2e/lib/bot.mjs';

const OUT = path.join(ROOT, 'shots', 'i4-team-ui');
fs.mkdirSync(OUT, { recursive: true });
const VP = { width: 1280, height: 720 };
const step = (page, n, render = false) => page.evaluate(([k, r]) => window.__dbg.ext.core.stepAsync(k, r), [n, render]);
const shot = async (page, name, clip) => { await step(page, 0, true); return page.screenshot({ path: path.join(OUT, name + '.png'), ...(clip ? { clip } : {}) }); };
function luma(buffer) {
  const p = PNG.sync.read(buffer);
  let s = 0;
  for (let i = 0; i < p.data.length; i += 4) s += p.data[i] + p.data[i + 1] + p.data[i + 2];
  return s / ((p.data.length / 4) * 3);
}
/** she dies (the grace rule spares her once: the hit is repeated) and is put back on her checkpoint */
const die = (page) => page.evaluate(async () => {
  const d = window.__dbg, core = d.ext.core;
  for (let i = 0; i < 600 && d.state().game !== 'dead'; i++) { if (i % 45 === 0) core.damage(1000, 'bullet', 'world'); await core.stepAsync(1, false); }
  const dead = d.state().game === 'dead';
  for (let i = 0; i < 400 && d.state().game !== 'playing'; i++) { await core.stepAsync(2, false); await core.idle(); }
  return dead && d.state().game === 'playing';
});

test('real game, a run taken up at the gantry: the card stands aside for the Tamper\'s entrance; a hit is seen on the side it came from; no card after a death', async () => {
  const server = await startServer({});
  const bot = await openBot(server, { piece: 'i4-team-ui', tier: 'low', viewport: VP, checkpoint: 'cp_hall_gantry' });
  try {
    const page = bot.page;
    const card = () => page.evaluate(() => { const c = document.querySelector('.k7 .card'), cs = getComputedStyle(c), cp = document.querySelector('.k7 .cp'); const ui = window.__dbg.state().systems.ui; return { text: ui.card, aside: c.classList.contains('aside'), centre: cs.visibility !== 'hidden' && Number(cs.opacity) > 0, row: cp.classList.contains('on'), numeral: cp.querySelector('.cp-n').textContent, name: cp.querySelector('.cp-t').textContent, objective: ui.hud.objective, tick: window.__dbg.state().tick }; });
    // every look for the first two seconds: the card's words are up, and never in the middle of the frame
    let centred = 0, seen = 0, first = null, named = 0, withObjective = 0;
    for (let i = 0; i < 24; i++) {
      await step(page, 5);
      const c = await card();
      if (c.text === '') continue;
      seen++;
      if (!first) first = c;
      if (c.centre || !c.aside) centred++;
      if (c.row && c.name === 'The Weight' && /^V\b/.test(c.numeral)) named++;
      if (c.objective !== '') withObjective++;
      if (seen === 8) { await step(page, 0, true); await page.waitForTimeout(400); await shot(page, 'real_gantry_card_aside'); }   // (the wait is for the picture: the row's 0.2 s fade is the stylesheet's)
    }
    assert.ok(seen >= 12, `the world shows "${STORY.lines.card_v.text}" again when the run is taken up here (${seen} looks)`);
    assert.equal(centred, 0, `it is never in the middle of the frame while the Tamper makes its entrance (${centred} of ${seen} looks; it stood there at every one of them)`);
    const scene = await page.evaluate(() => ({ vignette: window.__dbg.events(0, 'vignette/state').map((e) => e.payload.stage).join(','), tamper: window.__dbg.enemies().filter((e) => e.alive && e.kind === 'tamper').length }));
    assert.ok(/started/.test(scene.vignette) && scene.tamper === 1, `because the Tamper's scene is playing (${JSON.stringify(scene)})`);
    assert.equal(named, seen, `its numeral and its name are in the checkpoint row, top left, at every look (${named} of ${seen})`);
    assert.ok(withObjective >= seen - 1, `and the work at hand is drawn under it, not held back (${withObjective} of ${seen})`);
    await step(page, 150);
    assert.deepEqual([(await card()).text, (await card()).row], ['', false], 'gone when its time is up');

    // ---- a hit from behind (18, a Bider's lunge): the bottom of the frame
    const strip = { x: 340, y: 720 - 110, width: 600, height: 60 };
    const plain = luma(await shot(page, 'real_gantry_before_hit', strip));
    // where pass i4's bar stood: 7 px high, 13 px in from the bottom edge at 720p
    const barClip = { x: 400, y: 720 - 13 - 6, width: 480, height: 5 };
    const floor = luma(await page.screenshot({ clip: barClip }));
    await page.evaluate(() => { const p = window.__dbg.player(), c = window.__dbg.ext.core, f = c.ctx().player.forward; c.damage(18, 'lunge', 'bider', p.x - f.x * 5, p.y, p.z - f.z * 5); });
    await step(page, 2, true);
    const hit = await page.evaluate(() => { const e = {}; for (const i of document.querySelectorAll('.k7 .hurt i')) { const cs = getComputedStyle(i); e[i.className.split(' ')[0]] = cs.display === 'none' ? 0 : Number(cs.opacity); } const arc = [...document.querySelectorAll('.k7 .xh path.arc:not(.ink)')].filter((a) => a.getAttribute('class') === 'arc on').map((a) => { const r = a.getBoundingClientRect(); return { w: Math.round(r.width), top: Math.round(r.top) }; }); return { e, arc, deg: window.__dbg.state().systems.ui.hud.arcDeg }; });
    assert.deepEqual([hit.e.b > 0.6, hit.e.t, hit.e.l, hit.e.r, hit.deg], [true, 0, 0, 0, 180], `the bottom side alone (${JSON.stringify(hit)})`);
    assert.ok(hit.arc.length === 1 && hit.arc[0].w >= 60 && hit.arc[0].top > 360 + 30, `a wide arc under the crosshair (${JSON.stringify(hit.arc)}; it was 26 px)`);
    await shot(page, 'real_gantry_hit_behind_02');
    const inked = luma(await page.screenshot({ clip: strip }));
    assert.ok(inked < plain * 0.85, `the bottom of the frame is darker at the hit (${plain.toFixed(0)} -> ${inked.toFixed(0)})`);
    // pass i5: where the pale bar of pass i4 stood there is none (it read as a progress bar); tests/ui/i5_real.test.mjs has the flare
    const bar = luma(await page.screenshot({ clip: barClip }));
    assert.ok(bar < 150 && bar < floor + 60, `no pale bar on it (${floor.toFixed(0)} -> ${bar.toFixed(0)})`);
    // 30 ticks later, with no wall-clock wait: still there (the reviewer's stepped frames at +2, +6, +15 and +30 showed nothing)
    await step(page, 28, true);
    const later = await page.evaluate(() => ({ b: Number(getComputedStyle(document.querySelector('.k7 .hurt .b')).opacity), arc: document.querySelectorAll('.k7 .xh path.arc.on:not(.ink)').length }));
    assert.ok(later.b >= 0.5 && later.arc === 1, `half a second after the hit it is still on screen (${JSON.stringify(later)})`);
    await shot(page, 'real_gantry_hit_behind_30');

    // ---- a death here: the card she has been shown is not shown again
    assert.equal(await die(page), true, 'she died and was put back');
    let again = 0;
    for (let i = 0; i < 20; i++) { await step(page, 6); if ((await card()).text !== '') again++; }
    assert.equal(again, 0, 'no card after the respawn');
    console.log(`real gantry: card aside from tick ${first.tick} for ${seen} looks, never centred; hit from behind: bottom strip ${plain.toFixed(0)} -> ${inked.toFixed(0)}, bar ${bar.toFixed(0)}`);
  } finally { await bot.close().catch(() => {}); await server.close(); }
});

test('real game, the bore: the death line stands on an ink plate over the lit face of the Windlass, and the line dot is named there', async () => {
  const server = await startServer({});
  const bot = await openBot(server, { piece: 'i4-team-ui', tier: 'low', viewport: VP, checkpoint: 'cp_boss_p1' });
  try {
    const page = bot.page;
    await step(page, 60, true);
    const dot = await page.evaluate(() => ({ lines: window.__dbg.ext.core.ctx().player.weapon.lineRounds, label: document.querySelector('.k7 .hud .mark .ll').getAttribute('class'), text: document.querySelector('.k7 .hud .mark .ll').textContent, hud: window.__dbg.state().systems.ui.hud.lineLabel }));
    if (dot.lines > 0) assert.deepEqual([dot.label, dot.text, dot.hud], ['ll on', STORY.ui.ui_hud_line_rounds, true], 'a line round is held in the boss room: the dot is named (it was a bare dot)');
    else assert.equal(dot.hud, false);
    assert.equal(await die(page), true, 'she died and was put back');
    await page.evaluate(() => { window.__dbg.setGod?.(true); });
    await step(page, 2, true);
    const line = await page.evaluate(() => { const d = document.querySelector('.k7 .death'), t = d.querySelector('.death-text'), c = getComputedStyle(t), r = t.getBoundingClientRect(); return { out: d.classList.contains('out'), text: t.textContent, bg: c.backgroundColor, box: { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) } }; });
    assert.deepEqual([line.out, line.text, line.bg], [true, STORY.ui.ui_death, 'rgba(20, 17, 15, 0.6)'], 'held over the respawned game, on the subtitle\'s ground');
    // the plate against the same pixels without it: the lit face behind the words is taken down
    await page.addStyleTag({ content: '.k7 .death, .k7 .death-text { animation: none !important; } .k7 .death.out { background: transparent !important; } .k7 .death-text { opacity: 1 !important; }' });
    const withPlate = luma(await page.screenshot({ clip: line.box }));
    await page.screenshot({ path: path.join(OUT, 'real_death_line_bore.png') });
    const style = await page.addStyleTag({ content: '.k7 .death-text { background: transparent !important; }' });
    const bare = luma(await page.screenshot({ clip: line.box }));
    await style.evaluate((n) => n.remove());
    assert.ok(withPlate < bare * 0.8, `the ground behind "She went down" is darker with the plate (${bare.toFixed(0)} -> ${withPlate.toFixed(0)})`);
    assert.ok(line.box.y + line.box.height < VP.height / 2 - 20, 'and the line is above the crosshair, never on it');
    console.log(`real death line: plate ${JSON.stringify(line.box)}, ground ${bare.toFixed(0)} -> ${withPlate.toFixed(0)}; line rounds held ${dot.lines}, label "${dot.label}"`);
  } finally { await bot.close().catch(() => {}); await server.close(); }
});

test('real game at 4:3: the title\'s column is clear of the lit sand, and at the asking\'s dial the work at hand ends short of the stencilled answer', async () => {
  const server = await startServer({});
  try {
    const vp = { width: 960, height: 720 };
    let bot = await openBot(server, { piece: 'i4-team-ui', tier: 'low', viewport: vp });
    try {
      const page = bot.page;
      // the title's words come up over 0.7 s on the wall clock: ended here, so every look is of the finished title
      await page.evaluate(() => { for (const a of document.getAnimations()) { try { a.finish(); } catch { /* endless */ } } window.__dbg.step(0, true); });
      const t = await page.evaluate(() => { const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; }; return { story: r('.k7 .title [data-item="story"]'), menu: r('.k7 .title > .menu'), head: r('.k7 .title .title-head') }; });
      assert.ok(Math.abs(t.menu.l - 960 * 0.035) < 1 && Math.abs(t.head.l - 960 * 0.035) < 1, `the column and the name at 3.5 % (${t.menu.l}, ${t.head.l})`);
      assert.ok(t.story.r < 215, `"The story so far" ends at ${t.story.r.toFixed(0)} px (it was 240)`);
      // the strip right of the longest item is the dark of the frame, not the lit patch
      const clip = { x: Math.round(t.story.r + 2), y: Math.round(t.story.t - 2), width: 24, height: Math.round(t.story.b - t.story.t + 4) };
      await page.screenshot({ path: path.join(OUT, 'real_title_960x720.png') });
      const beside = luma(await page.screenshot({ clip }));
      const under = await page.addStyleTag({ content: '.k7 .title > .menu::before { display: none !important; }' });
      const bare = luma(await page.screenshot({ clip }));
      await under.evaluate((n) => n.remove());
      const lit = luma(await page.screenshot({ clip: { x: 300, y: 560, width: 60, height: 30 } }));
      assert.ok(beside < 80 && beside < bare * 0.7, `the ground beside the item is dark: ${beside.toFixed(0)} of 255 (${bare.toFixed(0)} without the column's ground; the lit sand is ${lit.toFixed(0)})`);
      // a visitor without a mouse: the same title says what it needs (index.html sets the attribute before the game is fetched)
      await page.evaluate(() => document.documentElement.setAttribute('data-input', 'touch'));
      await page.click('[data-item="options"]');
      await page.keyboard.press('Escape');
      const need = await page.evaluate(() => { const n = document.querySelector('.k7 .title .title-need'), r = n.getBoundingClientRect(), first = document.querySelector('.k7 .title > .menu .mi:not(.off)').getBoundingClientRect(); return { shown: getComputedStyle(n).display !== 'none', text: n.textContent, above: r.bottom <= first.top + 1, inside: r.left >= 0 && r.right <= window.innerWidth && r.top >= 0 }; });
      assert.deepEqual(need, { shown: true, text: STORY.ui.ui_needs_input, above: true, inside: true });
      await page.screenshot({ path: path.join(OUT, 'real_title_needs_input_960x720.png') });
      console.log(`real title 4:3: column at ${t.menu.l.toFixed(1)} px, longest item ends ${t.story.r.toFixed(0)}, beside it ${beside.toFixed(0)} (bare ${bare.toFixed(0)}, lit sand ${lit.toFixed(0)})`);
    } finally { await bot.close().catch(() => {}); }

    bot = await openBot(server, { piece: 'i4-team-ui', tier: 'low', viewport: vp, checkpoint: 'cp_bore_ante' });
    try {
      const page = bot.page;
      await step(page, 30);
      // where the asking begins (the reviewer's frame): the stencil over the dial starts at about x = 280
      await bot.eval(async (b) => { await b.walkTo(14, 75.2, { stopRadius: 0.25, maxTicks: 600 }); b.lookAt(13.6, -41.9, 80); await b.step(60); });
      await step(page, 0, true);
      const o = await page.evaluate(() => { const box = document.querySelector('.k7 .obj'), r = box.getBoundingClientRect(), g = getComputedStyle(box, '::before'); const ui = window.__dbg.state().systems.ui.hud; return { on: box.classList.contains('on'), dial: ui.dial, right: r.right, bottom: r.bottom, line: box.querySelector('.obj-line').textContent, ask: box.querySelector('.ask-say').textContent, ground: g.backgroundColor, inset: parseFloat(g.right) }; });
      assert.deepEqual([o.on, o.dial, o.line, o.ask], [true, true, STORY.objectives.obj_ante, STORY.lines.stn_ask_1.text], 'the work at hand and the live question are up at the door');
      assert.ok(o.right - o.inset <= 245, `the box and its ground end at ${(o.right - o.inset).toFixed(0)} px, short of the stencil at 280 (the words ran to 300 under a wide ground)`);
      assert.ok(o.bottom < 720 * 0.22, `and it is still a top-left corner (${o.bottom.toFixed(0)})`);
      assert.match(o.ground, /0\.3\)$/);
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUT, 'real_dial_960x720.png') });
      console.log(`real dial 4:3: the work at hand ends at ${o.right.toFixed(0)} px (ground to ${(o.right - o.inset).toFixed(0)}), bottom ${o.bottom.toFixed(0)}`);
    } finally { await bot.close().catch(() => {}); }
  } finally { await server.close(); }
});
