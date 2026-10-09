// Pass i4 (UI): the carry-over issues of the last reviews, one test each, beside the core stubs (sandbox/ui.html and
// the index page). The ones that need the real game (the gantry's card, a hit in the rooms, the death line over the
// Windlass, the dial and the title at 4:3) are in i4_real.test.mjs.
//   1. being hit is unmistakable (ruling R20): a heavy arc as wide as the hit was hard, and the side of the frame it
//      came from inked in under a pale bar; counted in fixed ticks; soft under reduce flashes; gone at a respawn
//   2. a movement card stands aside (one row, top left) while a staged scene plays or an enemy is awake
//   3. the line dot is named for as long as a line round is held, and the pause screen says what it is and its key
//   4. every row of the talk column and the death line stand on an ink ground; the boss name is never under 10 px; the
//      work at hand's words fade before their ground
//   5. a visitor without a mouse is told so on the title and on the click-to-resume plate; a browser that keeps
//      refusing the pointer is named on the plate from its second showing
//   6. in a frame narrower than 3:2 the left column stands at 3.5 % (the title, the loading screen, the pre-boot page),
//      and at the asking's dial the work at hand is a narrow column
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { ROOT } from '../harness.mjs';
import { STORY, emit, openIndex, openSandbox, press, serve } from './util.mjs';

const OUT = path.join(ROOT, 'shots', 'i4-team-ui');
fs.mkdirSync(OUT, { recursive: true });
let server;
before(async () => { server = await serve(); });
after(async () => { await server.close(); });

const hud = (game) => game.page.evaluate(() => window.__dbg.state().systems.ui.hud);
/** n ticks without drawing, then one drawn frame: no wall-clock wait anywhere in this file */
const run = (game, ticks) => game.page.evaluate(async (t) => { await window.__dbg.ext.core.stepAsync(t, false); await window.__dbg.ext.core.stepAsync(0, true); }, ticks);
/** mean of R, G and B over a clip of the page */
async function luma(game, clip) {
  const p = PNG.sync.read(await game.page.screenshot({ clip }));
  let s = 0;
  for (let i = 0; i < p.data.length; i += 4) s += p.data[i] + p.data[i + 1] + p.data[i + 2];
  return s / ((p.data.length / 4) * 3);
}
const hurt = (game) => game.page.evaluate(() => {
  const edges = {};
  for (const e of document.querySelectorAll('.k7 .hurt i')) { const c = getComputedStyle(e); edges[e.className.split(' ')[0]] = c.display === 'none' ? 0 : Number(c.opacity); }
  const arcs = [...document.querySelectorAll('.k7 .xh path.arc:not(.ink)')].filter((a) => a.getAttribute('class') === 'arc on').map((a) => { const r = a.getBoundingClientRect(), c = getComputedStyle(a); return { o: Number(c.opacity), size: Math.round(Math.max(r.width, r.height)), stroke: parseFloat(c.strokeWidth), cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2) }; });
  return { edges, arcs, sides: Object.keys(edges).filter((k) => edges[k] > 0).join('') };
});

test('being hit is unmistakable: a heavy arc as wide as the hit was hard and the side it came from under a soft flare, on the fixed tick', async () => {
  const game = await openSandbox(server);
  try {
    await press(game, 'state/play');
    await press(game, 'variant/bg glare');
    await run(game, 5);
    let h = await hurt(game);
    assert.deepEqual([h.sides, h.arcs.length], ['', 0], 'nothing before a hit');
    const strip = { x: 1280 - 70, y: 200, width: 50, height: 320 };
    const before = await luma(game, strip);
    // 30 from the right: the right side alone, whole, and the widest arc right of the crosshair
    await press(game, 'hit/heavy 90');
    await run(game, 0);
    h = await hurt(game);
    assert.deepEqual(h.edges, { t: 0, r: 1, b: 0, l: 0 }, 'a hit from the right inks in the right side, whole');
    assert.equal(h.arcs.length, 1);
    const heavy = h.arcs[0];
    assert.ok(heavy.o === 1 && heavy.stroke >= 6.5 && heavy.size >= 70, `the arc is heavy and wide (${JSON.stringify(heavy)}; it was 26 px across with a stroke of 3)`);
    assert.ok(heavy.cx > 640 + 30 && Math.abs(heavy.cy - 360) < 6, 'right of the crosshair');
    const inked = await luma(game, strip);
    assert.ok(inked < before * 0.8, `the right side of the frame is darker (${before.toFixed(0)} -> ${inked.toFixed(0)})`);
    // pass i5: the pale bar that stood on that side is gone (it read as a progress bar): nothing in the flare has a fill
    const bar = await game.page.evaluate(() => { const e = document.querySelector('.k7 .hurt .r'), c = getComputedStyle(e, '::after'), o = getComputedStyle(e); return { after: c.content, fill: o.backgroundColor, right: e.getBoundingClientRect().left }; });
    assert.deepEqual([bar.after, bar.fill, bar.right >= 1280], ['none', 'rgba(0, 0, 0, 0)', true], `no bar: the flare is the shadow of a shape outside the frame (${JSON.stringify(bar)})`);
    await game.page.screenshot({ path: path.join(OUT, 'hit_heavy_right_1280x720.png') });
    // counted in fixed ticks, with no frame drawn and no time passed on the wall clock
    await run(game, 20);
    h = await hurt(game);
    assert.deepEqual([h.edges.r, h.arcs[0].o], [1, 1], 'whole at a third of a second');
    await run(game, 16);
    h = await hurt(game);
    assert.ok(h.edges.r > 0.4 && h.edges.r < 0.7 && h.arcs[0].o === 1, `the side is going at 0.6 s, the arc still whole (${h.edges.r})`);
    await run(game, 12);
    h = await hurt(game);
    assert.ok(h.arcs.length === 1 && h.arcs[0].o <= 0.6 && h.arcs[0].o > 0 && h.edges.r <= 0.2, `the arc fades over its last 0.4 s (${JSON.stringify(h.arcs)})`);
    await run(game, 13);
    h = await hurt(game);
    assert.deepEqual([h.sides, h.arcs.length], ['', 0], 'gone a second after the hit');
    assert.ok(Math.abs(await luma(game, strip) - before) < 1, 'and the frame is as it was');
    // a light hit from ahead: the top alone, weaker, a narrower arc
    await press(game, 'damage arc/0');
    await run(game, 0);
    h = await hurt(game);
    assert.deepEqual([h.sides, h.edges.t], ['t', 0.6], 'a light hit from ahead: the top, at its least strength');
    assert.ok(h.arcs[0].size < heavy.size - 15 && h.arcs[0].size >= 45 && h.arcs[0].cy < 360 - 30, `a narrower arc above the crosshair (${h.arcs[0].size} px against ${heavy.size})`);
    await run(game, 70);
    // a quarter lights the two sides it lies between; no direction lights all four
    await press(game, 'damage arc/45'); await run(game, 0);
    assert.equal((await hurt(game)).sides, 'tr', 'ahead and to the right');
    await run(game, 70);
    await press(game, 'hit/medium 135'); await run(game, 0);
    h = await hurt(game);
    assert.equal(h.sides, 'rb', 'behind and to the right');
    assert.ok(h.edges.r > 0.6 && h.edges.r < 1, `18 points is between the two (${h.edges.r})`);
    await run(game, 70);
    await press(game, 'hit/no direction (a fall)'); await run(game, 0);
    assert.equal((await hurt(game)).sides, 'trbl', 'a hit with no direction: all four');
    await run(game, 70);
    // two hits from two sides stand together
    await press(game, 'hit/heavy 90'); await run(game, 6);
    await press(game, 'hit/heavy 270'); await run(game, 0);
    h = await hurt(game);
    assert.deepEqual([h.sides, h.arcs.length], ['rl', 2], 'two hits, two sides, two arcs');
    await game.page.screenshot({ path: path.join(OUT, 'hit_two_sides_1280x720.png') });
    // a respawn takes everything away
    await emit(game, 'player/respawned', { checkpoint: 'cp_gallery_bay' }, 1);
    h = await hurt(game);
    assert.deepEqual([h.sides, h.arcs.length], ['', 0], 'nothing of the last life after a respawn');
    // reduce flashes: the side comes up softly and never whole; the arc is unchanged
    await press(game, 'variant/reduce flashes');
    await press(game, 'hit/heavy 180'); await run(game, 0);
    h = await hurt(game);
    assert.ok(h.edges.b > 0 && h.edges.b <= 0.2 && h.arcs[0].o === 1, `reduce flashes: the side starts low (${h.edges.b})`);
    await run(game, 13);
    assert.equal((await hurt(game)).edges.b, 0.6, 'and holds at 60 %');
    // pass i5: ink under one warm red-violet and its rim (the only red in the UI), every one of them blurred
    const colours = await game.page.evaluate(() => [...document.querySelectorAll('.k7 .hurt i')].map((e) => getComputedStyle(e).boxShadow));
    for (const c of colours) {
      assert.deepEqual(c.match(/rgba?\([^)]+\)/g), ['rgba(236, 104, 118, 0.9)', 'rgba(172, 38, 84, 0.84)', 'rgba(20, 17, 15, 0.86)'], c);
      for (const m of c.matchAll(/\) 0px 0px ([\d.]+)px/g)) assert.ok(Number(m[1]) >= 25, `every layer is feathered (${m[1]} px of blur at 720p)`);
    }
  } finally { await game.close(); }
});

test('a movement card stands aside while a staged scene plays or an enemy is awake: one row top left, nothing in the middle of the frame', async () => {
  const game = await openSandbox(server);
  try {
    await press(game, 'state/play');
    await run(game, 150);                                  // the sandbox's own checkpoint numeral has had its two seconds
    const card = () => game.page.evaluate(() => {
      const c = document.querySelector('.k7 .card'), cs = getComputedStyle(c), cp = document.querySelector('.k7 .cp'), r = cp.getBoundingClientRect();
      return { aside: c.classList.contains('aside'), centre: cs.visibility !== 'hidden' && Number(cs.opacity) > 0, row: cp.classList.contains('on'), numeral: cp.querySelector('.cp-n').textContent, name: cp.querySelector('.cp-t').textContent, nameColour: getComputedStyle(cp.querySelector('.cp-t')).color, right: r.right, bottom: r.bottom, text: window.__dbg.ext.core.ctx().ui.visibleText().card };
    });
    // no scene: the card as it always was
    await press(game, 'card/v');
    await run(game, 30);
    let c = await card();
    assert.deepEqual([c.aside, c.centre, c.row, c.name, c.text], [false, true, false, '', STORY.lines.card_v.text], 'with nothing on stage the card stands in the upper third');
    // the Tamper's entrance starts under it: the card gives up the middle at once and is a row in the corner
    await press(game, 'card/a vignette starts (the card stands aside)');
    await run(game, 0);
    c = await card();
    assert.deepEqual([c.aside, c.centre, c.row, c.numeral, c.name, c.text], [true, false, true, 'V', 'The Weight', STORY.lines.card_v.text], 'aside: its numeral and its name in the checkpoint row');
    assert.equal(c.nameColour, 'rgb(201, 161, 74)', 'the name in brass');
    assert.ok(c.right < 1280 * 0.35 && c.bottom < 720 * 0.1, `top left, far from the middle (${c.right.toFixed(0)}, ${c.bottom.toFixed(0)})`);
    // the work at hand does not wait for a card that is aside
    await emit(game, 'objective/changed', { key: 'obj_hall', text: STORY.objectives.obj_hall ?? Object.values(STORY.objectives)[0] }, 1);
    assert.notEqual((await hud(game)).objective, '', 'the objective is drawn beside it');
    await game.page.screenshot({ path: path.join(OUT, 'card_aside_1280x720.png') });
    // for the card's own time, then the row is gone
    await run(game, Math.round(STORY.lines.card_v.seconds * 60));
    c = await card();
    assert.deepEqual([c.aside, c.row, c.name, c.text], [false, false, '', ''], 'the row goes when the card\'s time is up');
    // "Go on" at the gantry: the scene starts, the checkpoint is saved and the card arrives in the same tick
    await press(game, 'card/the vignette ends');
    await press(game, 'card/a vignette starts (the card stands aside)');
    await emit(game, 'checkpoint/saved', { id: 'cp_hall_gantry', movement: 5, section: 1 });
    await press(game, 'card/v');
    await run(game, 30);
    c = await card();
    assert.deepEqual([c.aside, c.centre, c.row, c.name], [true, false, true, 'The Weight'], 'a card that arrives during a scene is never in the middle');
    assert.match(c.numeral, /^V\s·\s1$/, `beside the checkpoint numeral (${c.numeral})`);
    // the numeral's two seconds end before the card's: the row keeps the card's own numeral
    await run(game, 100);
    c = await card();
    assert.deepEqual([c.row, c.numeral, c.name], [true, 'V', 'The Weight']);
    await run(game, 100);
    assert.equal((await card()).row, false);
    // the scene is over: the next card is in the middle again
    await press(game, 'card/the vignette ends');
    await press(game, 'card/vi');
    await run(game, 30);
    c = await card();
    assert.deepEqual([c.aside, c.centre], [false, true], 'after the scene a card stands in the middle again');
    // an enemy wakes under it (no telegraph yet, no encounter): aside on the next tick
    await game.page.evaluate(() => { const ctx = window.__dbg.ext.core.ctx(), p = ctx.player.position; ctx.enemies.debug.spawnAt('tamper', p.x, p.y, p.z - 12, 0); });
    const threat = await game.page.evaluate(() => window.__dbg.ext.core.ctx().enemies.threat);
    assert.ok(threat > 0, 'the stub reports a threat');
    await run(game, 1);
    c = await card();
    assert.deepEqual([c.aside, c.centre, c.name], [true, false, STORY.lines.card_vi.text.replace(/^[IVX]+\.\s*/, '')], 'an awake enemy: aside');
    // a respawn clears the row with everything else
    await emit(game, 'player/respawned', { checkpoint: 'cp_hall_gantry' }, 1);
    c = await card();
    assert.deepEqual([c.aside, c.row, c.text], [false, false, '']);
  } finally { await game.close(); }
});

test('the line dot is named for as long as a line round is held, and the pause screen says what it is and which key seats it', async () => {
  const game = await openSandbox(server);
  try {
    await press(game, 'state/play');
    await run(game, 120);
    const label = () => game.page.evaluate(() => { const l = document.querySelector('.k7 .hud .mark .ll'), r = l.getBoundingClientRect(), sv = document.querySelector('.k7 .hud .mark [data-part="seventh"]').getBoundingClientRect(), health = document.querySelector('.k7 .health').getBoundingClientRect(); return { on: l.getAttribute('class') === 'll on', text: l.textContent, clear: r.right < sv.left && r.bottom < health.top }; });
    assert.deepEqual([(await label()).on, (await hud(game)).lineLabel], [false, false], 'no line round, no name');
    await press(game, 'ring/line pips 2');
    await run(game, 2);
    let l = await label();
    assert.deepEqual([l.on, l.text, l.clear, (await hud(game)).lineLabel], [true, STORY.ui.ui_hud_line_rounds, true, true], 'named, clear of the seventh and the bars');
    // it was six seconds: a minute later, and after a respawn with the count restored, the dot is still named
    await run(game, 3600);
    assert.deepEqual([(await label()).on, (await hud(game)).lineLabel], [true, true], 'still named a minute later (it was six seconds)');
    await emit(game, 'player/respawned', { checkpoint: 'cp_boss_p1' }, 3);
    assert.equal((await hud(game)).lineLabel, true, 'and after a respawn with a line round still held');
    // the pause screen: the dot, its name, and one sentence with the key that seats it
    await press(game, 'screen/pause');
    await run(game, 0);
    const legend = await game.page.evaluate(() => { const s = document.querySelector('.k7 .pause .line-says'), c = getComputedStyle(s), r = s.getBoundingClientRect(), key = s.querySelector('.key'), mark = document.querySelector('.k7 .pause .line-legend').getBoundingClientRect(); return { shown: c.display !== 'none', text: s.textContent, key: key ? key.textContent : '', under: r.top >= mark.bottom - 1, inside: r.right <= window.innerWidth && r.bottom <= window.innerHeight, size: parseFloat(c.fontSize) }; });
    const bound = await game.page.evaluate(() => window.__dbg.ext.core.ctx().options.value.bindings.line[0]);
    const keyName = bound.replace(/^Key|^Digit/, '');
    assert.deepEqual([legend.shown, legend.text, legend.key], [true, STORY.ui.ui_legend_line.replace('{line}', keyName), keyName], 'the legend\'s sentence, with the key bound right now in a cap');
    assert.ok(legend.under && legend.inside && legend.size >= 13, `under the dot's name, inside the frame (${JSON.stringify(legend)})`);
    await game.page.screenshot({ path: path.join(OUT, 'pause_line_legend_1280x720.png') });
    // none held: neither the name nor the sentence
    await press(game, 'state/play');
    await press(game, 'state/full cylinder');
    await run(game, 2);
    assert.deepEqual([(await label()).on, (await hud(game)).lineLabel], [false, false], 'the name goes with the last line round');
    await press(game, 'screen/pause');
    await run(game, 0);
    assert.equal(await game.page.evaluate(() => getComputedStyle(document.querySelector('.k7 .pause .line-says')).display), 'none');
  } finally { await game.close(); }
});

test('the rows of the talk column and the death line stand on an ink ground; the boss name is never under 10 px; the work at hand\'s words go before their ground', async () => {
  const game = await openSandbox(server, { viewport: { width: 800, height: 450 } });
  try {
    await press(game, 'state/play');
    await run(game, 5);
    const ground = (sel) => game.page.evaluate((s) => { const e = document.querySelector(s), c = getComputedStyle(e), r = e.getBoundingClientRect(); return { bg: c.backgroundColor, pad: parseFloat(c.paddingLeft), w: r.width, cx: r.left + r.width / 2, text: e.textContent }; }, sel);
    await press(game, 'prompt/read');
    await run(game, 1);
    let g = await ground('.k7 .talk > .prompt.row');
    assert.match(g.bg, /^rgba\(20, 17, 15, 0\.62\)$/, `"E Read" on the ink ground of the kept-round prompt (${g.bg})`);
    assert.ok(g.pad >= 4 && g.w < 800 * 0.4 && Math.abs(g.cx - 400) < 2, `a plate round the words, centred (${JSON.stringify(g)})`);
    await press(game, 'prompt/take');
    await run(game, 1);
    assert.match((await ground('.k7 .talk > .prompt.row')).bg, /0\.62\)$/);
    await press(game, 'hint/reload');
    await run(game, 1);
    g = await ground('.k7 .talk > .prompt.hint');
    assert.match(g.bg, /^rgba\(20, 17, 15, 0\.62\)$/, 'a key hint too');
    await game.page.screenshot({ path: path.join(OUT, 'prompt_ground_800x450.png') });
    // the boss name in a small window
    await press(game, 'boss/p1');
    await run(game, 1);
    const name = await game.page.evaluate(() => { const e = document.querySelector('.k7 .boss-name'); return { size: parseFloat(getComputedStyle(e).fontSize), shown: getComputedStyle(e.parentElement).display !== 'none' }; });
    assert.deepEqual([name.shown, name.size >= 10], [true, true], `the boss name is ${name.size} px at 800 x 450 (it was 6.25)`);
    // the work at hand: when it goes, the words' fade ends before the box's begins
    await emit(game, 'objective/changed', { key: 'obj_lip_gate', text: STORY.objectives.obj_lip_gate }, 2);
    await game.page.evaluate(() => { for (const a of document.getAnimations()) { try { a.finish(); } catch { /* endless */ } } });
    await run(game, 300);
    const fades = await game.page.evaluate(() => {
      const box = document.querySelector('.k7 .obj'), line = box.querySelector('.obj-line');
      const of = (el) => { const a = el.getAnimations().find((x) => x.transitionProperty === 'opacity'); if (!a) return null; const t = a.effect.getTiming(); return { delay: t.delay, duration: t.duration }; };
      return { on: box.classList.contains('on'), box: of(box), line: of(line), ground: getComputedStyle(box, '::before').backgroundColor };
    });
    assert.equal(fades.on, false, 'the objective\'s five seconds are over');
    assert.ok(fades.box && fades.line, `both fades are running (${JSON.stringify(fades)})`);
    assert.ok(fades.line.delay + fades.line.duration <= fades.box.delay + 1, `the words are gone (${fades.line.duration} ms) before the box starts to go (after ${fades.box.delay} ms)`);
    assert.match(fades.ground, /^rgba\(20, 17, 15, 0\.5\)$/);
    // the death line: the subtitle's ground, never thinner than 45 %
    await press(game, 'screen/death');
    await run(game, 0);
    g = await ground('.k7 .death .death-text');
    assert.deepEqual([g.bg, g.text, g.pad >= 4], ['rgba(20, 17, 15, 0.6)', STORY.ui.ui_death, true], 'the death line on the subtitle\'s ground');
    await press(game, 'subtitle/backing 0');
    assert.equal((await ground('.k7 .death .death-text')).bg, 'rgba(20, 17, 15, 0.45)', 'never thinner than 45 %');
    await press(game, 'subtitle/backing 100');
    assert.equal((await ground('.k7 .death .death-text')).bg, 'rgb(20, 17, 15)', 'and whole when the subtitles\' is');
  } finally { await game.close(); }
});

test('a visitor without a mouse is told so on the title and on the click-to-resume plate; a browser that keeps refusing the pointer is named from the plate\'s second showing', async () => {
  const game = await openIndex(server, { viewport: { width: 390, height: 844 } });
  try {
    const page = game.page;
    const plate = () => page.evaluate(() => { const el = document.querySelector('.k7 .ctr'), n = el.querySelector('.ctr-note'), r = n.getBoundingClientRect(); return { screen: window.__dbg.state().ui.screen, text: el.querySelector('.ctr-text').textContent, note: getComputedStyle(n).display === 'none' ? '' : n.textContent, inside: r.left >= 0 && r.right <= window.innerWidth, all: el.textContent }; });
    const pause = (reason) => page.evaluate((r) => { window.__dbg.ext.core.ctx().state.request('paused', r, r); window.__dbg.step(0, true); }, reason);
    const resume = () => page.evaluate(() => { window.__dbg.emit('ui/action', { action: 'resume' }); window.__dbg.step(1, true); });
    // ---- a refusing browser: the request is recorded and never granted
    await page.evaluate(() => { const ctx = window.__dbg.ext.core.ctx(); ctx.input.requestPointerLock = () => {}; });
    await pause('focus_lost');
    let p = await plate();
    assert.deepEqual([p.screen, p.text, p.note, p.all], ['click_to_resume', STORY.ui.ui_click_to_start, '', STORY.ui.ui_click_to_start], 'the first time, the plate alone');
    await page.evaluate(() => document.querySelector('.k7 .ctr.on').click());
    await pause('focus_lost');
    p = await plate();
    assert.deepEqual([p.screen, p.note, p.inside], ['click_to_resume', STORY.ui.ui_lock_refused, true], 'it came back after a click: the plate says the browser will not give the mouse');
    await page.screenshot({ path: path.join(OUT, 'plate_refused_390x844.png') });
    await page.evaluate(() => document.querySelector('.k7 .ctr.on').click());
    await pause('focus_lost');
    assert.equal((await plate()).note, STORY.ui.ui_lock_refused, 'and goes on saying so');
    // a lock that arrives clears the count: the next plate is the plain one
    await resume();
    await page.evaluate(() => window.__dbg.emit('input/pointer_lock', { locked: true }));
    await pause('focus_lost');
    assert.equal((await plate()).screen, 'pause', 'after a lock, the pause menu');
    await resume();
    await pause('focus_lost');
    p = await plate();
    assert.deepEqual([p.screen, p.note], ['click_to_resume', ''], 'the count began again');
    // ---- a phone: the plate says what it needs at once, and so does the title
    await page.evaluate(() => document.documentElement.setAttribute('data-input', 'touch'));
    await resume();
    await pause('focus_lost');
    p = await plate();
    assert.deepEqual([p.screen, p.note, p.inside], ['click_to_resume', STORY.ui.ui_needs_input, true], 'a visitor without a mouse: the plate says so at its first showing');
    await page.screenshot({ path: path.join(OUT, 'plate_phone_390x844.png') });
    await page.evaluate(() => window.__dbg.emit('ui/action', { action: 'quit_to_title' }));
    await page.evaluate(() => window.__dbg.ext.core.idle());
    await page.evaluate(() => { window.__dbg.step(0, true); });
    const title = () => page.evaluate(() => { const t = document.querySelector('.k7 .title'), n = t.querySelector('.title-need'), c = getComputedStyle(n), r = n.getBoundingClientRect(), first = t.querySelector('.menu .mi:not(.off)').getBoundingClientRect(), head = t.querySelector('.title-sub').getBoundingClientRect(); return { screen: window.__dbg.state().ui.screen, need: t.classList.contains('need'), shown: c.display !== 'none', text: n.textContent, bg: c.backgroundColor, size: parseFloat(c.fontSize), box: [r.left, r.top, r.right, r.bottom].map(Math.round), aboveMenu: r.bottom <= first.top + 1, underHead: r.top >= head.bottom, inside: r.left >= 0 && r.right <= window.innerWidth }; });
    let t = await title();
    assert.deepEqual([t.screen, t.need, t.shown, t.text], ['title', true, true, STORY.ui.ui_needs_input], 'the title says it, in story.json\'s words');
    assert.ok(t.aboveMenu && t.underHead && t.inside && t.size >= 15, `above the column, under the name, inside a 390 px screen (${JSON.stringify(t)})`);
    assert.match(t.bg, /^rgba\(20, 17, 15, 0\.72\)$/, 'on an ink ground');
    const settle = () => page.evaluate(() => { for (const a of document.getAnimations()) { try { a.finish(); } catch { /* endless */ } } window.__dbg.step(0, true); });
    await settle();
    await page.screenshot({ path: path.join(OUT, 'title_phone_390x844.png') });
    await page.setViewportSize({ width: 844, height: 390 });
    t = await title();
    assert.ok(t.shown && t.aboveMenu && t.underHead && t.inside, `and in landscape (${JSON.stringify(t)})`);
    await settle();
    await page.screenshot({ path: path.join(OUT, 'title_phone_844x390.png') });
    // ---- a desktop: nothing
    await page.evaluate(() => document.documentElement.removeAttribute('data-input'));
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.click('[data-item="options"]');
    await page.keyboard.press('Escape');
    t = await title();
    assert.deepEqual([t.screen, t.need, t.shown], ['title', false, false], 'a visitor with a mouse is told nothing');
  } finally { await game.close(); }
});

test('in a frame narrower than 3:2 the left column stands at 3.5 % of the width, and at the dial the work at hand is a narrow column', async () => {
  const game = await openIndex(server, { start: false, viewport: { width: 960, height: 720 } });
  try {
    const page = game.page;
    const lefts = () => page.evaluate(() => { const q = (s) => { const e = document.querySelector(s); return e ? parseFloat(getComputedStyle(e).left) : null; }; const item = document.querySelector('.k7 .title [data-item="story"]').getBoundingClientRect(); return { head: q('.k7 .title .title-head'), menu: q('.k7 .title > .menu'), ask: getComputedStyle(document.querySelector('.k7 .title-ask')).left, foot: q('.k7 .load-foot'), loadHead: q('.k7 .loading .title-head'), storyRight: item.right, halo: getComputedStyle(document.querySelector('.k7 .title [data-item="story"]')).textShadow.split('rgb').length - 1 }; });
    let l = await lefts();
    const at = 960 * 0.035;
    for (const k of ['head', 'menu']) assert.ok(Math.abs(l[k] - at) < 0.6, `4:3: ${k} at 3.5 % (${l[k]})`);
    // (the question and the loading screen are not drawn now: their rule is read as written)
    assert.deepEqual([l.ask, l.foot, l.loadHead], ['3.5%', 3.5, 3.5], '4:3: the question, the loading line and the loading screen\'s name follow');
    assert.ok(l.storyRight < 215, `"The story so far" ends at ${l.storyRight.toFixed(0)} px (it was 240, on the lit sand)`);
    assert.ok(l.halo >= 10, 'the items carry an ink halo beyond the outline');
    await page.setViewportSize({ width: 1280, height: 720 });
    l = await lefts();
    for (const k of ['head', 'menu']) assert.ok(Math.abs(l[k] - 1280 * 0.07) < 0.6, `16:9: ${k} at 7 % as before (${l[k]})`);
    assert.deepEqual([l.ask, l.foot, l.loadHead], ['7%', 7, 7], '16:9: all at 7 % as before');
    // the pre-boot page draws the same column before any script runs
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    assert.match(html, /@media \(max-aspect-ratio: 3\/2\) \{ #preload \.head \{ left: 3\.5%; \} #preload \.line \{ left: calc\(3\.5% \+ var\(--u\) \* 24\); bottom: 5\.5%; \} \}/, 'index.html has the same rule');
    // the dial's narrow column (the class is the HUD's while she stands in the asking's volume: i4_real.test.mjs)
    const width = () => page.evaluate(() => { const t = document.querySelector('.k7 .txt'); t.classList.add('dial'); const w = parseFloat(getComputedStyle(t.querySelector('.obj')).maxWidth); const g = getComputedStyle(t.querySelector('.obj'), '::before').backgroundColor; t.classList.remove('dial'); return { dial: w, ground: g, plain: parseFloat(getComputedStyle(t.querySelector('.obj')).maxWidth) }; });
    let w = await width();
    assert.deepEqual([w.dial, w.plain], [w.plain, w.plain], '16:9: the box is as wide at the dial as anywhere');
    await page.setViewportSize({ width: 960, height: 720 });
    w = await width();
    assert.ok(w.dial <= 201 && w.plain > 300, `4:3: ${w.dial} px at the dial (${w.plain} elsewhere)`);
    assert.match(w.ground, /0\.3\)$/, 'on a thin ground');
  } finally { await game.close(); }
});
