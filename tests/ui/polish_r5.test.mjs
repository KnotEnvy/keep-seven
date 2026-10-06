// Polish round 5 (UI): one test per critic issue. The real UI beside the core stubs (index page) or in its sandbox.
//   1. the title with a save: Go on is the chosen item, and Begin asks before it throws the run away
//   2. a movement card is shown once a run and gives way to a fight
//   3. the six-and-one mark stands lower left (clear of the revolver and its hands), with a larger seventh and numeral
//   4. the pause screen holds in a very small window
//   5. the end card's rows stay one line each at 4:3 with the longer label
//   6. the death line does not stand on a screen that opens while it is still held
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../harness.mjs';
import { STORY, emit, frame, openIndex, openSandbox, press, serve } from './util.mjs';

const R5 = path.join(ROOT, 'shots', 'r5-team-ui');
fs.mkdirSync(R5, { recursive: true });
const r5shot = async (game, name) => { await game.page.evaluate(() => window.__dbg.step(0, true)); await game.page.screenshot({ path: path.join(R5, name + '.png'), timeout: 120000 }); };

let server;
before(async () => { server = await serve(); });
after(async () => { await server.close(); });

const items = (game) => game.page.evaluate(() => [...document.querySelectorAll('.k7 .scr.on .mi')].filter((m) => getComputedStyle(m).display !== 'none' && m.offsetParent !== null).map((m) => m.textContent + (m.classList.contains('sel') ? '*' : '')));
const idle = (game) => game.page.evaluate(() => window.__dbg.ext.core.idle());
const actions = (game) => game.page.evaluate(() => window.__dbg.events(0, 'ui/action').map((e) => e.payload.action));
const ui = (game) => game.page.evaluate(() => window.__dbg.state().systems.ui);
const stored = (game) => game.page.evaluate(() => window.__dbg.ext.core.ctx().save.readStored()?.checkpoint ?? null);
const toTitleWithSave = async (game, checkpoint) => {
  await game.page.evaluate((cp) => window.__dbg.start({ checkpoint: cp }), checkpoint);
  await game.page.evaluate(() => { window.__dbg.pause(true); window.__dbg.emit('ui/action', { action: 'quit_to_title' }); });
  await idle(game);
};

test('title with a save: Go on is chosen and names its count; Begin asks first, and Enter twice never throws the run away', async () => {
  const game = await openIndex(server, { start: false, viewport: { width: 1280, height: 720 } });
  try {
    const U = STORY.ui;
    // no save: Begin is the chosen item and starts at once (nothing to ask about)
    assert.deepEqual(await items(game), [U.ui_menu_play + '*', U.ui_menu_story, U.ui_menu_options, U.ui_menu_credits]);
    await toTitleWithSave(game, 'cp_boss_p1');
    assert.equal(await stored(game), 'cp_boss_p1');
    assert.deepEqual(await items(game), [U.ui_menu_play, U.ui_menu_continue + 'VI · 2*', U.ui_menu_story, U.ui_menu_options, U.ui_menu_credits], 'Go on is under the hand, and says where from');
    const before0 = (await actions(game)).length;
    // the habitual press: up to Begin, Enter
    await game.page.keyboard.press('ArrowUp');
    assert.equal((await items(game))[0], U.ui_menu_play + '*');
    await game.page.keyboard.press('Enter');
    assert.equal((await ui(game)).asking, true, 'Begin over a save asks');
    assert.deepEqual(await items(game), [U.ui_menu_continue + 'VI · 2*', U.ui_menu_play, U.ui_opt_back], 'the question: go on (chosen), begin, back');
    assert.equal(await game.page.evaluate(() => document.querySelector('.k7 .title .ask-head').textContent), U.ui_menu_play + '?');
    assert.deepEqual([(await actions(game)).length, await stored(game), (await game.state()).game], [before0, 'cp_boss_p1', 'title'], 'nothing was started and the save is whole');
    await r5shot(game, 'title_begin_asks');
    // the question does not lie over the title's own column, and it is inside the frame
    const geo = await game.page.evaluate(() => {
      const ask = document.querySelector('.k7 .title-ask').getBoundingClientRect(), menu = document.querySelector('.k7 .title > .menu');
      return { menuShown: getComputedStyle(menu).display !== 'none', inside: ask.left >= 0 && ask.top >= 0 && ask.right <= innerWidth && ask.bottom <= innerHeight, lowerLeft: ask.left < innerWidth * 0.2 && ask.top > innerHeight * 0.5 };
    });
    assert.deepEqual(geo, { menuShown: false, inside: true, lowerLeft: true });
    // Escape: back on the title, on Begin, still nothing started
    await game.page.keyboard.press('Escape');
    assert.equal((await ui(game)).asking, false);
    assert.equal((await items(game))[0], U.ui_menu_play + '*');
    // Enter, Enter: the second press lands on Go on, never on Begin
    await game.page.keyboard.press('Enter');
    await game.page.keyboard.press('Enter');
    await idle(game);
    let s = await game.state();
    assert.deepEqual([s.game, s.world.checkpoint, (await actions(game)).at(-1), await stored(game)], ['playing', 'cp_boss_p1', 'continue', 'cp_boss_p1'], 'two presses of Enter go on with the run');
    // the mouse: Begin, Back; Begin, Begin
    await game.page.evaluate(() => { window.__dbg.pause(true); window.__dbg.emit('ui/action', { action: 'quit_to_title' }); });
    await idle(game);
    assert.equal((await ui(game)).asking, false, 'a title that opens again is not still asking');
    await game.page.click('.k7 .scr.on [data-item="play"]');
    assert.equal((await ui(game)).asking, true);
    await game.page.click('.k7 .scr.on [data-item="ask_back"]');
    assert.deepEqual([(await ui(game)).asking, (await game.state()).game, await stored(game)], [false, 'title', 'cp_boss_p1']);
    await game.page.click('.k7 .scr.on [data-item="play"]');
    await game.page.click('.k7 .scr.on [data-item="ask_play"]');
    await idle(game);
    s = await game.state();
    assert.deepEqual([s.game, s.world.checkpoint, (await actions(game)).at(-1)], ['playing', 'cp_lip_start', 'play'], 'the question\'s own Begin starts a new run');
    assert.equal((await ui(game)).asking, false);
  } finally { await game.close(); }
});

test('a movement card is shown once a run, gives way to a fight after a second, and is brief when it arrives in one', async () => {
  const game = await openIndex(server, { viewport: { width: 1280, height: 720 } });
  try {
    const card = (key) => emit(game, 'story/card', { key, text: STORY.lines[key].text, seconds: STORY.lines[key].seconds });
    const threat = () => emit(game, 'enemy/telegraph', { x: 0, y: 0, z: -6, id: 'tamper#1', kind: 'tamper', attack: 'charge', seconds: 0.9 });
    const look = () => game.page.evaluate(() => { const c = document.querySelector('.k7 .card'); return { text: window.__dbg.state().ui.card, on: c.classList.contains('on'), quick: c.classList.contains('quick') }; });
    // (the run's own cards may be up when it starts: let them go)
    await frame(game, 400);
    assert.equal((await look()).text, '');
    // ---- undisturbed: 3.5 s, the last 0.8 s fading (as before)
    await card('card_iii');
    await frame(game, 160);
    assert.deepEqual(await look(), { text: STORY.lines.card_iii.text, on: true, quick: false }, 'whole at 2.67 s');
    await frame(game, 4);
    assert.deepEqual(await look(), { text: STORY.lines.card_iii.text, on: false, quick: false }, 'fading from 2.7 s');
    await frame(game, 48);
    assert.equal((await look()).text, '', 'gone at 3.5 s');
    // ---- a fight starts under it at 0.5 s: it has one second on screen in all, then 0.3 s of fade
    await card('card_v');
    await frame(game, 30);
    await threat();
    await frame(game, 28);
    assert.deepEqual(await look(), { text: STORY.lines.card_v.text, on: true, quick: true }, 'still whole at 0.97 s');
    await frame(game, 3);
    assert.deepEqual(await look(), { text: STORY.lines.card_v.text, on: false, quick: true }, 'fading from 1.0 s');
    await frame(game, 18);
    assert.equal((await look()).text, '', 'gone 1.3 s after it came (it was 3.5 s, over the Tamper\'s first charge)');
    assert.equal(await game.page.evaluate(() => getComputedStyle(document.querySelector('.k7 .card')).transitionDuration), '0.3s');
    // ---- once a run: the restore of a checkpoint (a death, "back to the last count") does not show it again
    await emit(game, 'player/respawned', { checkpoint: 'cp_hall_gantry' });
    await card('card_v');
    await frame(game, 2);
    assert.deepEqual(await look(), { text: '', on: false, quick: true }, 'not shown a second time');
    // ---- it arrives while a fight is on (2 s after a telegraph): brief from the start
    await threat();
    await frame(game, 120);
    await card('card_vi');
    await frame(game, 58);
    assert.deepEqual(await look(), { text: STORY.lines.card_vi.text, on: true, quick: true });
    await frame(game, 3);
    assert.equal((await look()).on, false, 'fading after one second');
    await frame(game, 18);
    assert.equal((await look()).text, '');
    // ---- her own shot, a hit on her and a boss phase count as the fight too
    for (const [key, how] of [['card_i', () => emit(game, 'weapon/fired', { ammo: 'lead', shotId: 1, x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: -1 })], ['card_ii', () => emit(game, 'player/damaged', { amount: 5, health: 80, fromX: 0, fromY: 0, fromZ: -5, source: 'bider', kind: 'melee' })], ['card_iv', () => emit(game, 'encounter/started', { id: 'enc_file' })]]) {
      await frame(game, 400);                       // past the threat window
      await card(key);
      await frame(game, 70);
      assert.equal((await look()).on, true, key + ': whole with no fight');
      await how();
      await frame(game, 1);
      assert.deepEqual(await look(), { text: STORY.lines[key].text, on: false, quick: true }, key + ': past its second, it goes at once');
      await frame(game, 18);
      assert.equal((await look()).text, '', key);
    }
    // ---- a new run shows every card again
    await frame(game, 400);
    await emit(game, 'game/new_run', { difficulty: 'normal' });
    await card('card_v');
    await frame(game, 2);
    assert.deepEqual(await look(), { text: STORY.lines.card_v.text, on: true, quick: false }, 'a new run: the card is shown again, at its full length');
  } finally { await game.close(); }
});

test('the mark stands lower left over the health bars at every shape of frame: clear of the bars, the subtitle and the right half; the seventh and the numeral are larger', async () => {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1024, height: 768 }, { width: 1920, height: 1080 }, { width: 2520, height: 1080 }]) {
    const game = await openSandbox(server, { viewport });
    try {
      for (const name of ['state/full cylinder', 'subtitle/station long', 'subtitle/size XL', 'caption/caption', 'ring/line pips 2']) await press(game, name);
      await frame(game, 1);
      const g = await game.page.evaluate(() => {
        const r = (s) => { const b = document.querySelector('.k7 ' + s).getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
        const mark = r('.hud .mark'), health = r('.health'), ring = r('.hud .mark [data-part="ring"]'), sv = r('.hud .mark [data-part="seventh"]'), rs = r('.hud .mark .rs'), sub = r('.sub'), capt = r('.capt');
        const pips = [...document.querySelectorAll('.k7 .hud .mark .lp.on')].map((p) => p.getBoundingClientRect().right);
        const numeral = document.querySelector('.k7 .hud .mark .rs');
        return { mark, health, ring, sv, rs, sub, capt, pips, W: innerWidth, H: innerHeight, font: parseFloat(getComputedStyle(numeral).fontSize) * mark.w / 88, text: numeral.textContent };
      });
      const at = `${viewport.width}x${viewport.height}`;
      const overlap = (a, b) => !(a.r <= b.l || a.l >= b.r || a.b <= b.t || a.t >= b.b);
      assert.ok(g.mark.l >= 0 && g.mark.r < g.W * 0.2 && g.mark.b <= g.H && g.mark.t > g.H * 0.6, `${at}: lower left (${JSON.stringify(g.mark)})`);
      assert.ok(Math.abs(g.ring.l - g.health.l) <= 3.5, `${at}: the ring's left edge on the bars' left edge (${g.ring.l.toFixed(1)} / ${g.health.l.toFixed(1)})`);
      assert.ok(g.sv.b < g.health.t - 6, `${at}: the seventh ends ${(g.health.t - g.sv.b).toFixed(1)} px above the health bars`);
      assert.equal(overlap(g.mark, g.sub) || overlap(g.mark, g.capt), false, `${at}: clear of the longest subtitle at XL and of the caption`);
      // the revolver's corner: nothing of the gauges is in the right half below the middle any more
      const right = await game.page.evaluate(() => [...document.querySelectorAll('.k7 .hud > *')].filter((n) => { if (n.classList.contains('xh')) return false; const b = n.getBoundingClientRect(); return b.width > 0 && b.right > innerWidth * 0.5 && b.bottom > innerHeight * 0.5 && getComputedStyle(n).display !== 'none'; }).map((n) => n.getAttribute('class')));
      assert.deepEqual(right, [], `${at}: no gauge in the lower right`);
      // sizes (story-ux): 15 x 36 px and 13 px at 720p before
      assert.ok(g.sv.w >= 19 && g.sv.h >= 47, `${at}: the seventh ${g.sv.w.toFixed(1)} x ${g.sv.h.toFixed(1)} px`);
      assert.ok(g.font >= 16, `${at}: the numeral ${g.font.toFixed(1)} px`);
      // the numeral neither meets the line pips beside it nor the seventh, nor the ring above it
      assert.ok(g.pips.length === 2 && Math.max(...g.pips) < g.rs.l && g.rs.r < g.sv.l && g.rs.t >= g.ring.b - 3, `${at}: numeral '${g.text}' ${JSON.stringify(g.rs)} between the pips (${g.pips.map((p) => p.toFixed(1))}) and the seventh (${g.sv.l.toFixed(1)}), under the ring (${g.ring.b.toFixed(1)})`);
      if (viewport.width === 1280) {
        await press(game, 'variant/bg glare'); await r5shot(game, 'mark_lower_left_glare');
        await press(game, 'variant/bg dark'); await r5shot(game, 'mark_lower_left_dark');
      }
    } finally { await game.close(); }
  }
});

test('pause in a very small window (480 x 270, 640 x 360, 700 x 500): no item under the work at hand, nothing outside the frame; unchanged at 720p', async () => {
  for (const viewport of [{ width: 480, height: 270 }, { width: 640, height: 360 }, { width: 700, height: 500 }, { width: 1280, height: 720 }]) {
    const game = await openIndex(server, { viewport, checkpoint: 'cp_lip_start' });
    try {
      await frame(game, 2);
      // the longest objective of the stage, so the side column is as tall as it gets
      await game.page.evaluate(() => {
        const dbg = window.__dbg, ctx = dbg.ext.core.ctx();
        dbg.pause(true); dbg.step(0, true);
        const longest = Object.values(ctx.data.story.objectives).sort((a, b) => b.length - a.length)[0];
        document.querySelector('.k7 .pause .obj-text').textContent = longest;
      });
      const g = await game.page.evaluate(() => {
        const side = document.querySelector('.k7 .pause-side').getBoundingClientRect();
        const rects = [...document.querySelectorAll('.k7 .pause-col .h, .k7 .pause-col .mi')].map((n) => { const range = document.createRange(); range.selectNodeContents(n); const b = range.getBoundingClientRect(); return { text: n.textContent, r: b.right, l: b.left, t: b.top, b: b.bottom }; });
        const out = [];
        for (const n of document.querySelectorAll('.k7 .scr.on *')) {
          if (n.closest('svg') !== null && n.tagName !== 'svg') continue;
          const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
          const b = n.getBoundingClientRect(); if (b.width === 0 || b.height === 0) continue;
          if (b.left < -1 || b.top < -1 || b.right > innerWidth + 1 || b.bottom > innerHeight + 1) out.push(`${n.getAttribute('class') || n.tagName} ${Math.round(b.left)},${Math.round(b.top)} ${Math.round(b.right)},${Math.round(b.bottom)}`);
        }
        const hudMark = getComputedStyle(document.querySelector('.k7 .hud .mark')).visibility;
        const big = document.querySelector('.k7 .pause .mark.big').getBoundingClientRect();
        return { sideLeft: side.left, rects, out, hudMark, big: { w: big.width, h: big.height }, itemsOverlap: rects.some((a, i) => rects.some((b, j) => j > i && a.b > b.t + 1 && a.t < b.b - 1)), size: parseFloat(getComputedStyle(document.querySelector('.k7 .pause-col .mi')).fontSize) };
      });
      const at = `${viewport.width}x${viewport.height}`;
      for (const r of g.rects) assert.ok(r.r <= g.sideLeft - 4, `${at}: '${r.text}' ends at ${r.r.toFixed(0)}, the work at hand starts at ${g.sideLeft.toFixed(0)}`);
      assert.equal(g.itemsOverlap, false, `${at}: a wrapped item does not run into the next`);
      assert.deepEqual(g.out, [], `${at}: nothing outside the frame`);
      assert.equal(g.hudMark, 'hidden', `${at}: the HUD's own mark is not drawn under the pause column`);
      assert.ok(g.size >= 13 && g.big.h >= 110, `${at}: still legible (items ${g.size} px, the enlarged mark ${g.big.h.toFixed(0)} px tall)`);
      if (viewport.width === 1280) assert.ok(g.rects.slice(1).every((r) => r.b - r.t < g.size * 1.6), 'at 720p no item wraps');
      await r5shot(game, `pause_${at}`);
    } finally { await game.close(); }
  }
});

test('end card at 4:3 and 16:9: every row is one line, label left of its value ("Six dry mouths, one cylinder" is the longest label)', async () => {
  for (const viewport of [{ width: 1024, height: 768 }, { width: 960, height: 720 }, { width: 1280, height: 720 }, { width: 800, height: 600 }]) {
    const game = await openSandbox(server, { viewport });
    try {
      await press(game, 'variant/reduce motion');                 // the rows are all lit at once
      await press(game, 'screen/end (9 lamps)');
      await frame(game, 0);
      const rows = await game.page.evaluate(() => [...document.querySelectorAll('.k7 .end .lrow')].map((row) => {
        const lab = row.querySelector('.lab'), v = row.querySelector('.v'), a = lab.getBoundingClientRect(), b = v.getBoundingClientRect();
        return { id: row.getAttribute('data-row'), label: lab.textContent, value: v.textContent, lines: Math.round(a.height / parseFloat(getComputedStyle(lab).lineHeight || '0') || 0), labH: a.height, font: parseFloat(getComputedStyle(lab).fontSize), gap: b.left - a.right, sameLine: Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) < a.height };
      }));
      const at = `${viewport.width}x${viewport.height}`;
      const six = rows.find((r) => r.id === 'clean_six');
      assert.equal(six.label, STORY.ui.ui_end_clean_six);
      assert.ok([STORY.ui.ui_end_yes, STORY.ui.ui_end_no].includes(six.value));
      for (const r of rows) {
        assert.ok(r.labH < r.font * 1.9, `${at}: '${r.label}' is one line (${r.labH.toFixed(1)} px tall at ${r.font} px)`);
        assert.ok(r.gap >= 6 && r.sameLine, `${at}: '${r.label}' ends ${r.gap.toFixed(1)} px left of '${r.value}'`);
      }
      const panel = await game.page.evaluate(() => { const p = document.querySelector('.k7 .end-panel').getBoundingClientRect(); return { l: p.left / innerWidth, r: p.right <= innerWidth, b: p.bottom <= innerHeight, t: p.top >= 0 }; });
      assert.ok(panel.l >= 0.6 && panel.r && panel.b && panel.t, `${at}: the panel is still in the right third and inside the frame (${panel.l.toFixed(3)})`);
      if (viewport.width === 1024) await r5shot(game, 'end_card_4x3_six_dry_mouths');
    } finally { await game.close(); }
  }
});

test('the death line is not left standing on a screen that opens while it is held (a quick pause or quit after the respawn)', async () => {
  const game = await openIndex(server, { viewport: { width: 1280, height: 720 }, checkpoint: 'cp_street_clear' });
  try {
    await frame(game, 5);
    await game.page.evaluate(async () => {
      const d = window.__dbg, core = d.ext.core;
      core.damage(1000, 'bullet', 'world');
      for (let i = 0; i < 400 && d.state().game !== 'dead'; i++) await core.stepAsync(1, false);
      for (let i = 0; i < 400 && d.state().game !== 'playing'; i++) { await core.stepAsync(2, false); await core.idle(); }
    });
    const line = () => game.page.evaluate(() => { const n = document.querySelector('.k7 .death'); return { out: n.classList.contains('out'), shown: getComputedStyle(n).display !== 'none', screen: window.__dbg.state().ui.screen }; });
    assert.deepEqual(await line(), { out: true, shown: true, screen: '' }, 'after the respawn the line is held over the game');
    await game.page.evaluate(() => { window.__dbg.pause(true); window.__dbg.step(0, true); });
    assert.deepEqual(await line(), { out: false, shown: false, screen: 'pause' }, 'the pause screen takes it away');
    await game.page.evaluate(() => window.__dbg.emit('ui/action', { action: 'quit_to_title' }));
    await idle(game);
    assert.deepEqual(await line(), { out: false, shown: false, screen: 'title' }, 'and it is not on the title');
  } finally { await game.close(); }
});
