// Release pass p0 (UI): one test per issue the final reviewers left open. The real UI beside the core stubs.
//   1. the movement card: upper third, clear of the crosshair's band; its fade is counted in ticks, not on the wall clock
//   2. the walking-about hints (move, run, read) are not drawn while a fight is on; the fight's own hints are
//   3. the end card names her deaths, under the time
//   4. the end card and the pause column hold in a very small window (480 x 270, 400 x 800, 360 x 240)
//   5. Begin over a save: the question in its own words, and what it costs
//   6. the end card opens: `ui/screen` end, which lets the view-model down (src/player listens)
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../harness.mjs';
import { STORY, emit, frame, openIndex, serve } from './util.mjs';

const OUT = path.join(ROOT, 'shots', 'p0-team-ui');
fs.mkdirSync(OUT, { recursive: true });
const shot = async (game, name) => { await game.page.evaluate(() => window.__dbg.step(0, true)); await game.page.screenshot({ path: path.join(OUT, name + '.png'), timeout: 120000 }); };

let server;
before(async () => { server = await serve(); });
after(async () => { await server.close(); });

const vt = (game) => game.page.evaluate(() => window.__dbg.state().ui);
const idle = (game) => game.page.evaluate(() => window.__dbg.ext.core.idle());
const STATS = { playSeconds: 516, roundsFired: 140, roundsHit: 121, knotsBurst: 23, linesOfThree: 2, cleanSix: false, secrets: [], freed: 12, felled: 30, deaths: 2, tookStoneRound: true };
const openEnd = (game, stats = STATS) => game.page.evaluate(async (st) => {
  const dbg = window.__dbg, ctx = dbg.ext.core.ctx();
  ctx.state.request('ending', 'stage_end');
  dbg.emit('ending/card', { stats: st });
  await dbg.ext.core.stepAsync(2, true);
  for (const a of document.getAnimations()) { try { a.finish(); } catch { /* an endless one */ } }
}, stats);
/** every leaf of the screen that is up: is it inside the window, and can each menu item be hit at its centre */
const fit = (game) => game.page.evaluate(() => {
  const scr = document.querySelector('.k7 .scr.on');
  const vis = (n) => n.offsetParent !== null && getComputedStyle(n).visibility !== 'hidden';
  const leaves = [...scr.querySelectorAll('*')].filter((n) => vis(n) && n.children.length === 0 && n.textContent.trim() !== '');
  const off = leaves.filter((n) => { const r = n.getBoundingClientRect(); return r.left < -0.5 || r.top < -0.5 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5; }).map((n) => n.textContent.trim().slice(0, 24));
  const items = [...scr.querySelectorAll('.mi')].filter(vis).map((m) => { const r = m.getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return [m.getAttribute('data-item'), e === m || m.contains(e)]; });
  return { off, items };
});

test('the movement card stands in the upper third, clear of the crosshair; its fade is counted in ticks and stops with the game', async () => {
  const game = await openIndex(server, { viewport: { width: 1280, height: 720 } });
  try {
    const look = () => game.page.evaluate(() => {
      const c = document.querySelector('.k7 .card'), r = c.getBoundingClientRect(), s = getComputedStyle(c), ui = window.__dbg.state().systems.ui;
      return { text: window.__dbg.state().ui.card, opacity: parseFloat(s.opacity), top: r.top / innerHeight, bottom: r.bottom / innerHeight, transition: s.transitionDuration, shadow: s.textShadow, logical: ui.hud.cardOpacity };
    });
    await frame(game, 400);
    for (const [w, h] of [[1280, 720], [1024, 768], [2560, 1080], [640, 360]]) {
      await game.page.setViewportSize({ width: w, height: h });
      await emit(game, 'game/new_run', { difficulty: 'normal' });
      await emit(game, 'story/card', { key: 'card_vii', text: STORY.lines.card_vii.text, seconds: 3.5 });
      await frame(game, 60);
      const c = await look();
      assert.equal(c.text, STORY.lines.card_vii.text);
      assert.ok(c.top >= 0.1 && c.bottom <= 0.36, `${w} x ${h}: the card is in the upper third (${c.top.toFixed(3)} to ${c.bottom.toFixed(3)}; it was 0.27 to 0.43, on the crosshair's band)`);
      assert.ok(0.5 - c.bottom >= 0.14, `${w} x ${h}: at least 14 % of the height between the card and the crosshair`);
      await frame(game, 400);
    }
    await game.page.setViewportSize({ width: 1280, height: 720 });
    // legible on a bright ground: an ink halo round the letters besides the 1 px outline, and a soft ink ground behind
    await emit(game, 'game/new_run', { difficulty: 'normal' });
    await emit(game, 'story/card', { key: 'card_vii', text: STORY.lines.card_vii.text, seconds: 3.5 });
    let c = await look();
    assert.match(c.shadow, /rgba\(20, 17, 15, 0\.[79]\) 0px 0px [\d.]+px/, 'a blurred ink halo');
    const ground = await game.page.evaluate(() => { const c = getComputedStyle(document.querySelector('.k7 .card'), '::before'); return [c.backgroundColor, c.filter, c.backgroundImage]; });
    assert.equal(ground[0], 'rgba(20, 17, 15, 0.34)', 'a soft ink ground behind it');
    assert.match(ground[1], /^blur\([\d.]+px\)$/, 'with a blurred edge');
    assert.equal(ground[2], 'none', 'and no gradient (ART_BIBLE 10)');
    assert.equal(c.transition, '0s', 'no transition on the wall clock');
    // ---- the fade is the tick clock's: whatever the wall clock did meanwhile, a frame drawn at tick n shows the card of tick n
    assert.ok(c.opacity > 0 && c.opacity <= 0.05 + 1e-6);
    await frame(game, 18); c = await look();
    assert.deepEqual([c.opacity, c.logical], [0.5, 0.5], '0.3 s: half way up');
    await frame(game, 18); assert.equal((await look()).opacity, 1, '0.6 s: whole');
    // a pause freezes it where it is (a CSS transition went on fading under the pause menu)
    await frame(game, 126 + 24);                     // 3.1 s: half way through the 0.8 s fade out
    assert.equal((await look()).opacity, 0.5);
    await game.page.evaluate(() => window.__dbg.pause(true));
    await game.page.waitForTimeout(900);
    assert.equal((await look()).opacity, 0.5, 'paused for 0.9 s of wall clock: still half');
    await game.page.evaluate(() => window.__dbg.pause(false));
    await frame(game, 24);
    c = await look();
    assert.deepEqual([c.opacity, c.text], [0, ''], 'gone at 3.5 s of game time');
    // ---- stepped far faster than the wall clock (a capture, a hitch): the Tamper case. A card up for 1.1 s, a telegraph:
    // 0.3 s of game time later nothing of it is drawn, however little wall time that took
    await emit(game, 'game/new_run', { difficulty: 'normal' });
    await emit(game, 'story/card', { key: 'card_v', text: STORY.lines.card_v.text, seconds: 3.5 });
    const t0 = Date.now();
    await game.page.evaluate(() => { const d = window.__dbg; d.step(66, false); d.emit('enemy/telegraph', { x: 0, y: 0, z: -6, id: 'tamper#1', kind: 'tamper', attack: 'charge', seconds: 0.9 }); d.step(9, false); d.step(0, true); });
    c = await look();
    assert.ok(c.opacity > 0.4 && c.opacity < 0.6, `half gone 0.15 s after the telegraph (${c.opacity})`);
    await game.page.evaluate(() => { window.__dbg.step(9, false); window.__dbg.step(0, true); });
    c = await look();
    assert.deepEqual([c.opacity, c.text], [0, ''], `gone 0.3 s of game time after the telegraph (${Date.now() - t0} ms of wall clock)`);
    // reduce motion: whole, then gone (past the threat window, so the card has its full length)
    await frame(game, 400);
    await game.page.evaluate(() => window.__dbg.setOption('reduceMotion', true));
    await emit(game, 'game/new_run', { difficulty: 'normal' });
    await emit(game, 'story/card', { key: 'card_v', text: STORY.lines.card_v.text, seconds: 3.5 });
    assert.equal((await look()).opacity, 1);
    await frame(game, 161); assert.equal((await look()).opacity, 1);
    await frame(game, 2); assert.equal((await look()).opacity, 0);
  } finally { await game.close(); }
});

test('the walking-about hints wait for a fight to be over; the fight\'s own hints do not', async () => {
  const game = await openIndex(server, { viewport: { width: 1280, height: 720 } });
  try {
    const U = STORY.ui;
    const hint = (key, show) => emit(game, 'ui/hint', { key, show }, 1);
    const drawn = () => game.page.evaluate(() => ({ text: window.__dbg.state().ui.hint, on: document.querySelector('.k7 .prompt.hint').classList.contains('on'), fight: window.__dbg.state().systems.ui.hud.fight }));
    await frame(game, 5);
    // no fight: the run hint is drawn as before
    await hint('ui_hint_sprint', true);
    let d = await drawn();
    assert.deepEqual([d.on, d.fight, /run/i.test(d.text)], [true, false, true], d.text);
    // the first fight starts (world raised the hint in its second wave: 17 s under the crosshair, on the Biders)
    await emit(game, 'encounter/started', { id: 'enc_street' }, 1);
    assert.deepEqual(await drawn(), { text: '', on: false, fight: true }, 'not drawn while the encounter is live');
    await hint('ui_hint_sprint', false); await hint('ui_hint_sprint', true);
    await emit(game, 'encounter/wave', { id: 'enc_street', wave: 'w2' }, 1);
    assert.deepEqual(await drawn(), { text: '', on: false, fight: true }, 'nor when it is raised inside the fight');
    for (const key of ['ui_hint_move', 'ui_hint_interact']) { await hint(key, true); assert.equal((await drawn()).on, false, key); }
    // the fight's own hints are drawn in it
    for (const key of ['ui_hint_reload', 'ui_hint_fire', 'ui_hint_line']) { await hint(key, true); d = await drawn(); assert.deepEqual([d.on, d.text !== ''], [true, true], key); }
    // the fight is over: the walking hint that is still asked for comes up
    await hint('ui_hint_sprint', true);
    assert.equal((await drawn()).on, false);
    await emit(game, 'encounter/cleared', { id: 'enc_street', seconds: 40 }, 1);
    d = await drawn();
    assert.deepEqual([d.on, d.fight, /run/i.test(d.text)], [true, false, true], 'drawn once the street is clear');
    await shot(game, 'hint_after_fight');
    // two encounters live: both must end; a reset (her death) ends one as well
    await emit(game, 'encounter/started', { id: 'enc_yard' }, 0); await emit(game, 'encounter/started', { id: 'enc_file' }, 1);
    await emit(game, 'encounter/cleared', { id: 'enc_yard', seconds: 9 }, 1);
    assert.equal((await drawn()).on, false);
    await emit(game, 'encounter/reset', { id: 'enc_file' }, 1);
    assert.equal((await drawn()).on, true);
    // a restore forgets the fight (the encounter is reset with it)
    await emit(game, 'encounter/started', { id: 'enc_yard' }, 1);
    await emit(game, 'player/respawned', { checkpoint: 'cp_street_clear' }, 1);
    await hint('ui_hint_sprint', true);
    assert.deepEqual(await drawn(), { text: (await drawn()).text, on: true, fight: false });
    // what is reported does not depend on drawn frames: the same after undrawn ticks
    await emit(game, 'encounter/started', { id: 'enc_street' }, 0);
    await game.page.evaluate(() => window.__dbg.step(1, false));
    assert.equal((await vt(game)).hint, '', 'held back on the tick, not on the drawn frame');
    assert.ok(U.ui_hint_sprint);
  } finally { await game.close(); }
});

test('the end card names her deaths under the time, and the menu still answers only once it is shown', async () => {
  const game = await openIndex(server, { viewport: { width: 1280, height: 720 } });
  try {
    await openEnd(game);
    // (pass i1: a feat that was not done has no row; this run's "Six chambers, six shots" is not shown)
    const rows = await game.page.evaluate(() => [...document.querySelectorAll('.k7 .end .lrow')].filter((r) => getComputedStyle(r).display !== 'none').map((r) => [r.getAttribute('data-row'), r.querySelector('.lab').textContent, r.querySelector('.v').textContent, parseFloat(getComputedStyle(r).animationDelay)]));
    assert.deepEqual(rows.slice(0, 3).map((r) => r.slice(0, 3)), [['time', STORY.ui.ui_end_time, '8:36'], ['deaths', STORY.ui.ui_end_deaths, '2'], ['rounds', STORY.ui.ui_end_rounds, '140']]);
    assert.equal(rows.length, 9);
    assert.ok(!rows.some((r) => r[0] === 'clean_six'), 'no row for a feat that was not done');
    for (let i = 1; i < rows.length; i++) assert.ok(Math.abs(rows[i][3] - rows[i - 1][3] - 0.38) < 1e-6, 'one row every 0.38 s');
    const menuDelay = await game.page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.k7 .end .menu')).animationDelay));
    assert.ok(menuDelay > rows[8][3] + 0.3, `the choice comes after the last row (${menuDelay} s after ${rows[8][3]} s)`);
    const u = (await game.state()).systems.ui;
    assert.ok(u.endLocked && Math.abs(u.endLockLeft + 2 / 60 - (menuDelay + 0.25)) < 0.03, `and answers when it is half shown (${u.endLockLeft})`);
    await shot(game, 'end_deaths_1280x720');
    // none: the row says 0 (it is not hidden: the ledger keeps its shape)
    await game.page.evaluate(() => window.__dbg.emit('ending/card', { stats: { playSeconds: 497, roundsFired: 96, roundsHit: 71, knotsBurst: 23, linesOfThree: 2, cleanSix: true, secrets: [], freed: 0, felled: 0, deaths: 0, tookStoneRound: false } }));
    assert.equal(await game.page.evaluate(() => document.querySelector('.k7 .end [data-row="deaths"] .v').textContent), '0');
  } finally { await game.close(); }
});

test('the end card and the pause column hold in a very small window', async () => {
  const game = await openIndex(server, { viewport: { width: 1280, height: 720 }, checkpoint: 'cp_boss_p1' });
  try {
    // ---- pause: every item inside the frame and under the pointer at its centre; Options opens by a real click
    for (const [w, h] of [[480, 270], [400, 800], [360, 240], [640, 360]]) {
      await game.page.setViewportSize({ width: w, height: h });
      await game.page.evaluate(() => { window.__dbg.pause(true); window.__dbg.step(0, true); });
      const f = await fit(game);
      assert.deepEqual(f.off, [], `pause ${w} x ${h}: nothing outside the window`);
      assert.deepEqual(f.items, [['resume', true], ['options', true], ['restart', true], ['quit', true]], `pause ${w} x ${h}: every item can be clicked`);
      if (w === 480) {
        await shot(game, 'pause_480x270');
        await game.page.click('.k7 .scr.on [data-item="options"]', { timeout: 20000 });
        assert.equal((await game.state()).systems.ui.screen, 'options');
        await game.page.keyboard.press('Escape');
        assert.equal((await game.state()).systems.ui.screen, 'pause');
      }
      await game.page.evaluate(() => window.__dbg.pause(false));
    }
    // ---- the end card, with the longest values and all 48 lamps
    await game.page.setViewportSize({ width: 1280, height: 720 });
    await game.page.evaluate(() => { for (let i = 0; i < 60; i++) window.__dbg.emit('enemy/freed', { x: 0, y: 0, z: 0, id: 'bider#' + i, encounter: '', cause: 'crown', counted: true }); });
    await openEnd(game, { ...STATS, playSeconds: 5999, roundsFired: 999, roundsHit: 999, deaths: 99, secrets: ['sec_loft_bell', 'sec_b'] });
    for (const [w, h] of [[480, 270], [400, 800], [360, 240], [640, 360], [800, 600], [800, 450], [960, 720], [1024, 768], [1024, 560], [1280, 600], [1280, 720], [1366, 650], [1920, 1080], [2560, 1080]]) {
      await game.page.setViewportSize({ width: w, height: h });
      await game.page.evaluate(() => window.__dbg.step(0, true));
      const f = await fit(game);
      const g = await game.page.evaluate(() => {
        const panel = document.querySelector('.k7 .end-panel'), p = panel.getBoundingClientRect();
        const oneLine = [...panel.querySelectorAll('.lrow:not(.lamps)')].every((r) => { const a = r.querySelector('.lab').getBoundingClientRect(), b = r.querySelector('.v').getBoundingClientRect(); return a.right <= b.left && Math.abs(a.bottom - b.bottom) <= a.height && a.height < parseFloat(getComputedStyle(r.querySelector('.lab')).fontSize) * 1.9; });
        return { panel: [p.left, p.top, p.right, p.bottom].map(Math.round), scrolls: panel.scrollHeight > panel.clientHeight + 1, oneLine, lamps: [...panel.querySelectorAll('.lamp.on')].length };
      });
      assert.deepEqual(f.off, [], `end ${w} x ${h}: nothing outside the window (panel ${g.panel})`);
      assert.deepEqual(f.items, [['again', true], ['rim', true], ['menu', true]], `end ${w} x ${h}: the three choices can be clicked (pass i1: "The rim again" is the third)`);
      assert.deepEqual([g.scrolls, g.oneLine, g.lamps], [false, true, 48], `end ${w} x ${h}: no scrolling needed, one line a row, all the lamps`);
      assert.ok(g.panel[0] >= 0 && g.panel[1] >= 0 && g.panel[2] <= w && g.panel[3] <= h, `end ${w} x ${h}: the panel is inside the window (${g.panel})`);
      if (w <= 480 || w === 800 && h === 600) await shot(game, `end_${w}x${h}`);
    }
  } finally { await game.close(); }
});

test('Begin over a save asks in its own words and says what it costs', async () => {
  const game = await openIndex(server, { start: false, viewport: { width: 1280, height: 720 } });
  try {
    const U = STORY.ui;
    await game.page.evaluate(() => window.__dbg.start({ checkpoint: 'cp_boss_p1' }));
    await game.page.evaluate(() => { window.__dbg.pause(true); window.__dbg.emit('ui/action', { action: 'quit_to_title' }); });
    await idle(game);
    // the title's words come up with the picture after a load (0.7 s), and the menu answers meanwhile
    // (pass i1: the name and the mark were already on the loading screen, in the same place, so they do not fade again)
    const rise = await game.page.evaluate(() => {
      const t = document.querySelector('.k7 .title'), a = (sel) => { const cs = getComputedStyle(t.querySelector(sel)); return cs.animationName + ' ' + cs.animationDuration; };
      return [t.classList.contains('rise'), a('.title-sub'), a(':scope > .menu'), a('.title-name'), a('.pm')];
    });
    assert.deepEqual(rise, [true, 'k7-row 0.7s', 'k7-row 0.7s', 'none 0s', 'none 0s']);
    await game.page.keyboard.press('ArrowUp'); await game.page.keyboard.press('Enter');
    await game.page.evaluate(() => { for (const a of document.getAnimations()) { try { a.finish(); } catch { /* endless */ } } });
    for (const [w, h] of [[1280, 720], [480, 270], [400, 800]]) {
      await game.page.setViewportSize({ width: w, height: h });
      const a = await game.page.evaluate(() => {
        const box = document.querySelector('.k7 .title-ask'), r = box.getBoundingClientRect(), head = document.querySelector('.k7 .title-head').getBoundingClientRect();
        const kids = [...box.querySelectorAll('.ask-head, .ask-note, .mi')].filter((n) => n.offsetParent !== null);
        return { asking: window.__dbg.state().systems.ui.asking, texts: kids.map((n) => n.textContent), inside: kids.every((n) => { const k = n.getBoundingClientRect(); return k.left >= 0 && k.top >= 0 && k.right <= innerWidth && k.bottom <= innerHeight; }), clearOfName: r.top >= head.bottom, order: kids.every((n, i) => i === 0 || n.getBoundingClientRect().top >= kids[i - 1].getBoundingClientRect().bottom - 1) };
      });
      assert.deepEqual(a, { asking: true, texts: [U.ui_ask_begin, U.ui_ask_begin_note, U.ui_menu_continue + 'VI · 2', U.ui_menu_play, U.ui_opt_back], inside: true, clearOfName: true, order: true }, `${w} x ${h}`);
      if (w !== 400) await shot(game, `ask_${w}x${h}`);
    }
    // back from a sheet the title does not fade in again
    await game.page.setViewportSize({ width: 1280, height: 720 });
    await game.page.keyboard.press('Escape');
    await game.page.click('.k7 .title > .menu [data-item="options"]');
    assert.equal((await game.state()).systems.ui.screen, 'options');
    await game.page.keyboard.press('Escape');
    assert.deepEqual(await game.page.evaluate(() => { const t = document.querySelector('.k7 .title'); return [window.__dbg.state().systems.ui.screen, t.classList.contains('rise'), getComputedStyle(t).animationName]; }), ['title', false, 'none']);
  } finally { await game.close(); }
});

test('the end card announces itself on `ui/screen` (the view-model is let down on it) and takes it back when it closes', async () => {
  const game = await openIndex(server, { viewport: { width: 1280, height: 720 } });
  try {
    const seq = await game.page.evaluate(() => window.__dbg.events(0).length ? window.__dbg.events(0).at(-1).seq : 0);
    await openEnd(game);
    const screens = async () => (await game.page.evaluate((s) => window.__dbg.events(s, 'ui/screen').map((e) => `${e.payload.screen}:${e.payload.open}`), seq));
    assert.ok((await screens()).includes('end:true'));
    await game.page.evaluate(() => window.__dbg.step(600, false));
    await game.page.keyboard.press('ArrowRight'); await game.page.keyboard.press('Enter');
    await idle(game);
    assert.ok((await screens()).includes('end:false'), 'closed with the choice');
  } finally { await game.close(); }
});

test('a pointer lock that arrives when a menu is up again is given back; the lock a menu item asked for is kept', async () => {
  const game = await openIndex(server, { start: false, viewport: { width: 1280, height: 720 } });
  try {
    const lock = () => game.page.evaluate(() => ({ locked: document.pointerLockElement !== null, screen: window.__dbg.state().systems.ui.screen, game: window.__dbg.state().game }));
    // the late grant: nothing asked for it from this title (Go on, Esc, Quit, and then the browser grants the first request)
    await game.page.evaluate(() => window.__dbg.ext.core.ctx().input.requestPointerLock());
    await game.page.waitForFunction(() => document.pointerLockElement === null && window.__dbg.events(0, 'input/pointer_lock').some((e) => e.payload.locked), null, { timeout: 20000 });
    assert.deepEqual(await lock(), { locked: false, screen: 'title', game: 'title' }, 'the title has its cursor back');
    // with the lock held the click below would land where the pointer was locked, not on the item
    await game.page.click('.k7 .scr.on [data-item="play"]');
    await idle(game);
    await game.page.waitForFunction(() => document.pointerLockElement !== null, null, { timeout: 20000 });
    assert.deepEqual(await lock(), { locked: true, screen: '', game: 'playing' }, 'Begin asked for the pointer: it is kept');
    // (the pause menu takes the same path: `NEEDS_CURSOR`; headless Chromium grants no second lock without a gesture)
  } finally { await game.close(); }
});
