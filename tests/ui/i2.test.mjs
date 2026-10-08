// Pass i2 (UI): the release reviewers' issues, one test each, beside the core stubs (sandbox/ui.html and the index
// page). The ones that need the real game (the stone's standing choice, the dial, a cold load) are in i2_real.test.mjs;
// the text rules (one card a note, the loading line, the load shares) are in text.spec.ts.
//   - the work at hand is drawn in play for five seconds each time it changes, under the checkpoint numeral; it waits
//     for a movement card, is not drawn under a sheet, and a respawn takes it away
//   - the line dot is named for six seconds when the first line round is taken, and while its hint is drawn
//   - the title's mark is twice its size, and in a frame narrower than 3:2 the column stands under the lit camp
//   - "break the band" on ink with an aqua key cap is in hud.test.mjs; the reader's cards in screens.test.mjs
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../harness.mjs';
import { STORY, emit, openIndex, openSandbox, press, serve } from './util.mjs';

const OUT = path.join(ROOT, 'shots', 'i2-team-ui');
fs.mkdirSync(OUT, { recursive: true });
let server;
before(async () => { server = await serve(); });
after(async () => { await server.close(); });

const hud = (game) => game.page.evaluate(() => window.__dbg.state().systems.ui.hud);
/** n ticks without drawing, then one drawn frame */
const run = (game, ticks) => game.page.evaluate(async (t) => { await window.__dbg.ext.core.stepAsync(t, false); await window.__dbg.ext.core.stepAsync(0, true); }, ticks);
const finish = (game) => game.page.evaluate(() => { for (const a of document.getAnimations()) { try { a.finish(); } catch { /* an endless one */ } } });
const OBJ = STORY.objectives;

test('the work at hand is drawn in play: five seconds under the checkpoint numeral each time it changes; it waits for a card; not under a sheet; a respawn takes it away', async () => {
  const game = await openSandbox(server);
  try {
    await press(game, 'state/play');
    const box = () => game.page.evaluate(() => {
      const o = document.querySelector('.k7 .obj'), c = getComputedStyle(o), r = o.getBoundingClientRect(), cp = document.querySelector('.k7 .cp').getBoundingClientRect(), line = o.querySelector('.obj-line'), lc = getComputedStyle(line), lab = o.querySelector('.obj-label');
      const boss = document.querySelector('.k7 .boss-name').getBoundingClientRect(), xh = document.querySelector('.k7 .xh').getBoundingClientRect();
      return { on: o.classList.contains('on'), shown: c.visibility !== 'hidden' && c.display !== 'none', label: lab.textContent, labelColour: getComputedStyle(lab).color, text: line.textContent, family: lc.fontFamily, size: parseFloat(lc.fontSize), colour: lc.color, left: Math.round(r.left - cp.left), under: r.top >= cp.bottom - 1, right: r.right, bottom: r.bottom, w: innerWidth, h: innerHeight, bossLeft: boss.left, xhTop: xh.top };
    });
    let b = await box();
    assert.deepEqual([b.on, (await hud(game)).objective], [false, ''], 'nothing until an objective changes');
    await emit(game, 'checkpoint/saved', { id: 'cp_lip_gate', movement: 1, section: 2 });
    await emit(game, 'objective/changed', { key: 'obj_lip_gate', text: OBJ.obj_lip_gate }, 2);
    b = await box();
    assert.deepEqual([b.on, b.shown, b.label, b.text, (await hud(game)).objective], [true, true, STORY.ui.ui_pause_objective, OBJ.obj_lip_gate, OBJ.obj_lip_gate], 'drawn at once, under the pause screen\'s own label');
    assert.deepEqual([b.labelColour, b.colour], ['rgb(201, 161, 74)', 'rgb(233, 226, 208)'], 'a brass label, the line in bone');
    assert.match(b.family, /Iowan Old Style/);
    assert.ok(b.size >= 14, `the line is at least 14 px (${b.size})`);
    assert.ok(b.left === 0 && b.under, 'under the checkpoint numeral, on its left edge');
    assert.ok(b.right < b.w * 0.46 && b.bottom < b.h * 0.25 && b.right < b.w / 2 - 130, `top left: clear of the crosshair, the card and the boss pips (${b.right}, ${b.bottom})`);
    await finish(game);
    await game.page.screenshot({ path: path.join(OUT, 'objective_1280x720.png') });
    // five seconds of simulated time, then gone
    await run(game, 296);
    assert.equal((await hud(game)).objective, OBJ.obj_lip_gate, 'still up at 4.97 s');
    await run(game, 3);
    assert.deepEqual([(await hud(game)).objective, (await box()).on], ['', false], 'gone at 5 s');
    // a paused game does not use its time up (fixed ticks)
    await emit(game, 'objective/changed', { key: 'obj_street', text: OBJ.obj_street }, 60);
    await game.page.evaluate(() => window.__dbg.pause(true));
    await run(game, 600);
    await game.page.evaluate(() => window.__dbg.pause(false));
    await run(game, 1);
    assert.equal((await hud(game)).objective, OBJ.obj_street, 'the pause did not count');
    // a new objective replaces the one that is up and has its own five seconds
    await emit(game, 'objective/changed', { key: 'obj_yard', text: OBJ.obj_yard }, 1);
    assert.deepEqual([(await box()).text, (await hud(game)).objectiveLeft > 4.9], [OBJ.obj_yard, true]);
    await run(game, 300);
    // ---- it waits for a movement card (both arrive on entering a zone), then has its whole time
    await press(game, 'card/ii');
    await emit(game, 'objective/changed', { key: 'obj_tally', text: OBJ.obj_tally }, 30);
    let h = await hud(game);
    assert.deepEqual([h.objective, h.objectivePending, (await box()).on], ['', true, false], 'a card is up: the objective waits');
    await run(game, 240);
    h = await hud(game);
    assert.equal(h.objective, OBJ.obj_tally, 'the card has gone: the objective is drawn');
    assert.ok(h.objectiveLeft > 3.5, `with its time ahead of it (${h.objectiveLeft} s left)`);
    // ---- a fight does not hold it back (the objectives that change in a fight name that fight)
    await emit(game, 'encounter/started', { id: 'enc_yard' }, 1);
    await emit(game, 'objective/changed', { key: 'obj_boss_unproven', text: OBJ.obj_boss_unproven }, 2);
    h = await hud(game);
    assert.deepEqual([h.fight, h.objective], [true, OBJ.obj_boss_unproven]);
    await emit(game, 'encounter/cleared', { id: 'enc_yard' }, 1);
    // ---- not under a sheet; back when it closes (its ticks did not run)
    await press(game, 'readable/note_lip');
    b = await box();
    assert.deepEqual([b.on, b.shown], [true, false], 'a note is up: the objective is not drawn under it');
    await game.page.keyboard.press('Escape');
    await run(game, 1);
    assert.equal((await box()).shown, true);
    // ---- the pause screen still has it, and a respawn takes the HUD's away
    await emit(game, 'player/respawned', { checkpoint: 'cp_lip_gate' }, 1);
    assert.deepEqual([(await hud(game)).objective, (await box()).on], ['', false], 'a respawn clears it (world says the restored objective again)');
    // an empty objective draws nothing
    await emit(game, 'objective/changed', { key: '', text: '' }, 1);
    assert.equal((await box()).on, false);
    // reduce motion: no fade
    await game.page.evaluate(() => window.__dbg.ext.core.ctx().options.set('reduceMotion', true));
    assert.equal(await game.page.evaluate(() => getComputedStyle(document.querySelector('.k7 .obj')).transitionDuration), '0s');
  } finally { await game.close(); }
});

test('the objective fits a small window and a 4:3 frame, and every objective of story.json fits its box', async () => {
  for (const [w, h] of [[960, 720], [800, 450], [1680, 720]]) {
    const game = await openSandbox(server, { viewport: { width: w, height: h } });
    try {
      await press(game, 'state/play');
      for (const [key, text] of Object.entries(OBJ)) {
        await emit(game, 'objective/changed', { key, text }, 1);
        const r = await game.page.evaluate(() => { const o = document.querySelector('.k7 .obj'), b = o.getBoundingClientRect(), line = o.querySelector('.obj-line'); const xh = document.querySelector('.k7 .xh .x').getBoundingClientRect(); return { right: b.right, bottom: b.bottom, lines: Math.round(line.getBoundingClientRect().height / parseFloat(getComputedStyle(line).lineHeight)), xhTop: xh.top, xhLeft: xh.left }; });
        assert.ok(r.right <= w * 0.5 && r.lines <= 3, `${key} at ${w} x ${h}: in the left half, three lines at most (${r.right} px, ${r.lines} lines)`);
        assert.ok(r.bottom < r.xhTop - 40 || r.right < r.xhLeft - 40, `${key} at ${w} x ${h}: clear of the crosshair`);
      }
      if (w === 800) { await game.page.screenshot({ path: path.join(OUT, 'objective_800x450.png') }); }
    } finally { await game.close(); }
  }
});

test('the line dot is named when the first line round is taken (six seconds) and while its hint is drawn; a restored count is not named', async () => {
  const game = await openSandbox(server);
  try {
    await press(game, 'state/play');
    await run(game, 120);
    const label = () => game.page.evaluate(() => { const l = document.querySelector('.k7 .hud .mark .ll'), c = getComputedStyle(l), r = l.getBoundingClientRect(), pip = document.querySelector('.k7 .hud .mark .lp').getBoundingClientRect(), rs = document.querySelector('.k7 .hud .mark .rs').getBoundingClientRect(), sv = document.querySelector('.k7 .hud .mark [data-part="seventh"]').getBoundingClientRect(), health = document.querySelector('.k7 .health').getBoundingClientRect(); return { on: l.getAttribute('class') === 'll on', text: l.textContent, fill: c.fill, size: r.height, underDots: r.top >= pip.bottom - 1 && r.top >= rs.bottom - 3, clear: r.right < sv.left && r.bottom < health.top, left: r.left }; });
    assert.deepEqual([(await label()).on, (await hud(game)).lineLabel], [false, false]);
    await press(game, 'ring/first line round (the dot is named)');
    await run(game, 2);
    await finish(game);
    let l = await label();
    assert.deepEqual([l.on, l.text, l.fill, (await hud(game)).lineLabel], [true, STORY.ui.ui_hud_line_rounds, 'rgb(124, 242, 226)', true], 'the dot is named, in its own aqua, in story.json\'s word');
    assert.ok(l.size >= 8 && l.underDots && l.clear && l.left >= 0, `under the dots, clear of the seventh and the bars (${JSON.stringify(l)})`);
    await game.page.screenshot({ path: path.join(OUT, 'line_label_1280x720.png'), clip: { x: 0, y: 500, width: 260, height: 220 } });
    await run(game, 350);
    assert.equal((await hud(game)).lineLabel, true, 'still named at 5.9 s');
    await run(game, 12);
    assert.deepEqual([(await hud(game)).lineLabel, (await label()).on], [false, false], 'the name fades after six seconds; the dot stays');
    assert.equal(await game.page.evaluate(() => document.querySelector('.k7 .hud .mark .lp').getAttribute('class')), 'lp on');
    // the hint that teaches the key names the dot for as long as it is drawn
    await emit(game, 'ui/hint', { key: 'ui_hint_line', show: true }, 2);
    assert.equal((await hud(game)).lineLabel, true, 'named while the seat-a-line-round hint is drawn');
    await run(game, 600);
    assert.equal((await hud(game)).lineLabel, true);
    await emit(game, 'ui/hint', { key: 'ui_hint_line', show: false }, 2);
    assert.equal((await hud(game)).lineLabel, false);
    // a count that comes back with a checkpoint is not a first line round
    await game.page.evaluate(() => { const d = window.__dbg, c = d.ext.core.ctx(); c.player.debug.setAmmo?.(undefined, undefined, 0); });
    await press(game, 'ring/empty');
    await game.page.evaluate(() => window.__dbg.ext.uisb.run('ring/first line round (the dot is named)').catch(() => {}));
    await emit(game, 'player/respawned', { checkpoint: 'cp_gallery_bay' }, 3);
    assert.equal((await hud(game)).lineLabel, false, 'a respawn takes the name away and a restored count does not bring it back');
    // no line round, no name (the hint may be up before the first locker)
    const none = await game.page.evaluate(async () => { const d = window.__dbg; await d.ext.uisb.run('ring/empty'); return d.ext.core.ctx().player.weapon.lineRounds; });
    if (none === 0) { await emit(game, 'ui/hint', { key: 'ui_hint_line', show: true }, 2); assert.equal((await hud(game)).lineLabel, false, 'no dot, no name'); }
  } finally { await game.close(); }
});

test('the title: the mark at twice its size on the loading screen and the title; narrower than 3:2 the column stands low, under the lit camp', async () => {
  const at = async (w, h) => {
    const game = await openIndex(server, { start: false, viewport: { width: w, height: h } });
    try {
      const look = () => game.page.evaluate(() => {
        const s = document.querySelector('.k7 .scr.on'), pm = s.querySelector('.pm').getBoundingClientRect(), foot = (s.querySelector(':scope > .menu') ?? s.querySelector('.load-foot')).getBoundingClientRect(), name = s.querySelector('.title-name').getBoundingClientRect(), sub = s.querySelector('.title-sub, .load-says');
        return { pm: [pm.width, pm.height], gap: (innerHeight - foot.bottom) / innerHeight, top: foot.top / innerHeight, underName: pm.top >= name.bottom, sub: sub.getBoundingClientRect().top >= pm.bottom, says: sub.textContent, saysStyle: getComputedStyle(sub).fontStyle };
      });
      const title = await look();
      await game.page.screenshot({ path: path.join(OUT, `title_stub_${w}x${h}.png`) });
      await game.page.evaluate(() => window.__dbg.ext.core.ctx().state.request('loading', 'test'));
      const loading = await look();
      return { title, loading };
    } finally { await game.close(); }
  };
  const wide = await at(1280, 720), narrow = await at(960, 720);
  for (const [name, v] of [['16:9', wide], ['4:3', narrow]]) {
    assert.ok(Math.abs(v.title.pm[1] - 52) < 0.5 && Math.abs(v.title.pm[0] - 33.8) < 0.5, `${name}: the mark is 34 x 52 px at 720p (it was 17 x 26): ${v.title.pm}`);
    assert.deepEqual(v.loading.pm, v.title.pm, 'the loading screen\'s mark is the title\'s');
    assert.ok(v.title.underName && v.title.sub && v.loading.sub, 'name, mark, then the line under it');
    assert.deepEqual([v.loading.saysStyle, v.title.says], ['italic', STORY.ui.ui_subtitle]);
    assert.ok(STORY.ui.ui_loading_line === v.loading.says || STORY.readables.rd_backstory.body.includes(v.loading.says), 'the loading line is story.json\'s');
  }
  assert.ok(Math.abs(wide.title.gap - 0.13) < 0.005 && Math.abs(wide.loading.gap - 0.13) < 0.005, `16:9: the column and the loading line 13 % up (${wide.title.gap})`);
  assert.ok(Math.abs(narrow.title.gap - 0.055) < 0.005 && Math.abs(narrow.loading.gap - 0.055) < 0.005, `4:3: both 5.5 % up (${narrow.title.gap})`);
  // the real title shot at 4:3 has the lit camp from 73 % to 85 % of the height at the column's left (shots/i2-team-ui/title_4x3.png):
  // the column's first item starts under 81 % and its widest item is under the camp's lower edge
  assert.ok(narrow.title.top > 0.8, `4:3: the column starts at ${(narrow.title.top * 100).toFixed(1)} % of the height (it started at 74 %, on the camp)`);
  // index.html's pre-boot page follows: the same mark, the same line, the same rule for a narrow frame
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(html, /#preload svg \{[^}]*height: max\(calc\(var\(--u\) \* 56\), 52px\); width: max\(calc\(var\(--u\) \* 36\.4\), 33\.8px\)/);
  assert.match(html, /@media \(max-aspect-ratio: 3\/2\) \{ #preload \.line \{ bottom: 5\.5%; \} \}/);
  const css = fs.readFileSync(path.join(ROOT, 'src/ui/ui.css'), 'utf8');
  assert.match(css, /\.k7 \.pm \{ height: max\(calc\(var\(--u\) \* 56\), 52px\); width: max\(calc\(var\(--u\) \* 36\.4\), 33\.8px\)/);
});
