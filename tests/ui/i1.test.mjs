// Pass i1 (UI): the release reviewers' issues, one test each. Run beside the core stubs (sandbox/ui.html and the index
// page); the two that need the real game are in i1_real.test.mjs.
//   - a lazy key hint stands 8 s, comes back once, and is drawn in the lower third above the subtitle; the walk hint
//     waits for the narrator
//   - low health has a standing cue (the bars breathe, the frame's edge is inked in), still under reduce flashes
//   - the readable sheet says which key turns it and which closes it; a salutation shares its card
//   - a first Begin shows the four story cards once, over the first frame of the run (E turns, Enter begins)
//   - the loading screen is the title arriving: the name and the mark in the title's place, a line that never goes back;
//     index.html's pre-boot page draws the same before any script runs
//   - the options page: no text under 12 px, a darker ground; the HUD mark comes down in a window under 600 px tall
//   - the end card shows a feat only when it was done
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../harness.mjs';
import { launchBrowser } from '../../tools/browser.mjs';
import { STORY, emit, frame, openIndex, openSandbox, press, serve } from './util.mjs';

const OUT = path.join(ROOT, 'shots', 'i1-team-ui');
fs.mkdirSync(OUT, { recursive: true });
const SEEN_KEY = 'keepseven.ui.story_seen.v1';
let server;
before(async () => { server = await serve(); });
after(async () => { await server.close(); });

const vt = (game) => game.page.evaluate(() => window.__dbg.state().ui);
const ui = (game) => game.page.evaluate(() => window.__dbg.state().systems.ui);
const idle = (game) => game.page.evaluate(() => window.__dbg.ext.core.idle());
/** n ticks without drawing, then one drawn frame */
const run = (game, ticks) => game.page.evaluate(async (t) => { await window.__dbg.ext.core.stepAsync(t, false); await window.__dbg.ext.core.stepAsync(0, true); }, ticks);
const finish = (game) => game.page.evaluate(() => { for (const a of document.getAnimations()) { try { a.finish(); } catch { /* an endless one */ } } });
const NARRATOR = Object.keys(STORY.lines).find((k) => STORY.lines[k].speaker === 'narrator');

test('a lazy hint stands 8 s, comes back once 40 s later and then never; a stand cut short is not counted; the walk hint waits for the narrator', async () => {
  const game = await openSandbox(server);
  try {
    const WALK = 'W A S D to walk', RUN = 'Hold Shift to run';
    const hint = async () => (await vt(game)).hint;
    await press(game, 'state/play');
    await run(game, 2);
    // ---- the narrator is speaking: the walk hint is asked for and not drawn (it stood 15 s over the opening lines)
    const line = STORY.lines[NARRATOR];
    await emit(game, 'story/line', { key: NARRATOR, speaker: 'narrator', text: line.text, seconds: 30 });
    await emit(game, 'ui/hint', { key: 'ui_hint_move', show: true });
    assert.equal(await hint(), '', 'not over the narrator');
    await run(game, 180);
    assert.equal(await hint(), '', 'still not, three seconds on');
    // the run hint is not the narrator's to hold: it is drawn beside a line
    await emit(game, 'ui/hint', { key: 'ui_hint_move', show: false });
    await emit(game, 'ui/hint', { key: 'ui_hint_sprint', show: true });
    assert.equal(await hint(), RUN);
    await emit(game, 'ui/hint', { key: 'ui_hint_sprint', show: false });
    await emit(game, 'ui/hint', { key: 'ui_hint_move', show: true });
    assert.equal(await hint(), '');
    // ---- the line ends: the hint comes up, and stands 8 s of game time
    await emit(game, 'story/line_end', { key: NARRATOR });
    assert.equal(await hint(), '', 'not in the breath after a line either (the opening\'s two lines are half a second apart)');
    await run(game, 88);
    assert.equal(await hint(), '');
    await run(game, 2);
    assert.equal(await hint(), WALK, 'drawn once the narrator has been quiet 1.5 s');
    await run(game, 8 * 60 - 3);
    assert.equal(await hint(), WALK, 'still up at 7.95 s');
    await run(game, 6);
    assert.equal(await hint(), '', 'gone at 8.05 s although world still asks for it');
    assert.deepEqual((await ui(game)).hud.hintStands, [1, 0, 0]);
    // a line that starts and ends meanwhile does not bring it back
    await emit(game, 'story/line', { key: NARRATOR, speaker: 'narrator', text: line.text, seconds: 4 });
    await emit(game, 'story/line_end', { key: NARRATOR });
    assert.equal(await hint(), '');
    // ---- one return, 40 s later, for another 8 s; then never again in this run
    await run(game, 40 * 60 - 20);
    assert.equal(await hint(), '', 'not yet at 39.8 s');
    await run(game, 20);
    assert.equal(await hint(), WALK, 'back once after 40 s');
    await run(game, 8 * 60 + 3);
    assert.equal(await hint(), '');
    await run(game, 120 * 60);
    assert.equal(await hint(), '', 'and not a third time, two minutes on');
    assert.deepEqual((await ui(game)).hud.hintStands, [2, 0, 0]);
    // world lowering it and raising it again does not start it over
    await emit(game, 'ui/hint', { key: 'ui_hint_move', show: false });
    await emit(game, 'ui/hint', { key: 'ui_hint_move', show: true });
    assert.equal(await hint(), '');
    // ---- a stand world cut short is not a stand: the run hint 3 s, taken back, asked for again: its whole 8 s
    await emit(game, 'ui/hint', { key: 'ui_hint_sprint', show: true });
    await run(game, 180);
    await emit(game, 'ui/hint', { key: 'ui_hint_sprint', show: false });
    await emit(game, 'ui/hint', { key: 'ui_hint_sprint', show: true });
    await run(game, 7 * 60);
    assert.equal(await hint(), RUN, '7 s into the second asking');
    await run(game, 70);
    assert.equal(await hint(), '');
    assert.deepEqual((await ui(game)).hud.hintStands, [2, 1, 0]);
    // ---- the fight's own hints are not timed (world times the reload hint itself)
    await emit(game, 'ui/hint', { key: 'ui_hint_fire', show: true });
    await run(game, 30 * 60);
    assert.equal(await hint(), 'Left click to fire');
    await emit(game, 'ui/hint', { key: 'ui_hint_fire', show: false });
    // ---- a new run: the reminders may be given again
    await emit(game, 'game/new_run', { difficulty: 'normal' });
    await emit(game, 'ui/hint', { key: 'ui_hint_move', show: true });
    assert.equal(await hint(), WALK, 'at once: nothing has been said for minutes');
    assert.deepEqual((await ui(game)).hud.hintStands, [0, 0, 0]);
  } finally { await game.close(); }
});

test('a hint is drawn in the lower third, above the caption and the subtitle at every size, never under the crosshair', async () => {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 960, height: 720 }, { width: 800, height: 450 }, { width: 2520, height: 1080 }]) {
    const game = await openSandbox(server, { viewport });
    try {
      const at = `${viewport.width}x${viewport.height}`;
      const look = () => game.page.evaluate(() => {
        const r = (s) => document.querySelector('.k7 ' + s).getBoundingClientRect();
        const hint = r('.prompt.hint'), sub = r('.sub'), capt = r('.capt'), prompt = r('.prompt:not(.hint)');
        const node = document.querySelector('.k7 .prompt.hint');
        return { top: hint.top / innerHeight, bottom: hint.bottom / innerHeight, hintBottom: hint.bottom, subTop: sub.height > 0 ? sub.top : innerHeight, captTop: capt.top, promptBottom: prompt.bottom, on: node.classList.contains('on'), opacity: getComputedStyle(node).opacity, centre: Math.abs(hint.left + hint.width / 2 - innerWidth / 2) };
      });
      await press(game, 'state/play');
      await press(game, 'hint/sprint');
      await frame(game, 1); await finish(game);
      let h = await look();
      assert.ok(h.on && h.opacity === '1', `${at}: drawn`);
      assert.ok(h.top >= 2 / 3 && h.bottom <= 0.95, `${at}: nothing said: the hint is in the lower third (${h.top.toFixed(3)} to ${h.bottom.toFixed(3)}; it was at 0.64)`);
      assert.ok(h.top - 0.5 >= 0.2, `${at}: a fifth of the height below the crosshair`);
      assert.ok(h.centre < 2, `${at}: centred`);
      // the longest station line at the largest size, a caption over it, and a prompt under the crosshair
      for (const name of ['subtitle/station long', 'subtitle/size XL', 'caption/caption', 'prompt/read']) await press(game, name);
      await frame(game, 1); await finish(game);
      h = await look();
      assert.ok(h.hintBottom <= h.captTop + 0.5 && h.hintBottom <= h.subTop, `${at}: above the caption and the subtitle (${h.hintBottom.toFixed(1)} over ${h.captTop.toFixed(1)})`);
      assert.ok(h.top >= 0.6, `${at}: and still low in the frame (${h.top.toFixed(3)})`);
      assert.ok(h.promptBottom <= h.hintBottom - 20, `${at}: the prompt keeps its own row above it`);
      if (viewport.width === 1280) { await game.page.screenshot({ path: path.join(OUT, 'hint_lower_third_1280x720.png') }); }
    } finally { await game.close(); }
  }
});

test('low health: under 35 the bars breathe a pale outline and the frame\'s edge is inked in; no pulse under reduce flashes; a hit still flashes', async () => {
  const game = await openSandbox(server, { viewport: { width: 1280, height: 720 } });
  try {
    const look = () => game.page.evaluate(() => {
      const hud = document.querySelector('.k7 .hud'), segs = [...hud.querySelectorAll('.seg')], edge = getComputedStyle(hud, '::after');
      return { low: hud.classList.contains('low'), anim: segs.map((s) => getComputedStyle(s).animationName), shadow: getComputedStyle(segs[0]).boxShadow, edge: edge.opacity, edgeShadow: edge.boxShadow, edgeBg: edge.backgroundImage, pointer: edge.pointerEvents };
    });
    await press(game, 'state/play');
    await frame(game, 2); await finish(game);
    let s = await look();
    assert.deepEqual([s.low, s.anim, s.edge], [false, ['none', 'none', 'none'], '0'], 'full health: nothing');
    await press(game, 'health/hp 50');
    await frame(game, 2); await finish(game);
    assert.equal((await look()).low, false, '50: two segments, no cue');
    await press(game, 'health/hp 30');
    await frame(game, 2); await finish(game);
    s = await look();
    assert.deepEqual([s.low, s.anim, s.edge], [true, ['k7-low', 'k7-low', 'k7-low'], '1'], 'at 30 the three bars breathe and the edge is inked in');
    assert.match(s.edgeShadow, /rgba\(20, 17, 15, 0\.66\).*inset/, 'the edge is an inset ink shadow');
    assert.deepEqual([s.edgeBg, s.pointer], ['none', 'none'], 'no colour ramp, and it takes no click');
    // the pulse swings the outline between ink and pale bone (never the screen, never red)
    const swing = await game.page.evaluate(() => {
      const seg = document.querySelector('.k7 .hud .seg'), a = seg.getAnimations().find((x) => x.animationName === 'k7-low');
      a.pause(); a.currentTime = 650;
      const mid = getComputedStyle(seg).boxShadow;
      a.currentTime = 0;
      const rest = getComputedStyle(seg).boxShadow;
      a.play();
      return { mid, rest, period: a.effect.getTiming().duration };
    });
    assert.match(swing.mid, /rgb\(243, 230, 207\)/, 'pale at the top of the breath');
    assert.ok(!/rgb\(243, 230, 207\)/.test(swing.rest), 'ink at rest');
    assert.equal(swing.period, 1300);
    await game.page.waitForTimeout(650);
    await game.page.screenshot({ path: path.join(OUT, 'low_health_1280x720.png') });
    // a hit while low: the segment's flash is not lost under the breath
    await press(game, 'damage arc/0');
    await frame(game, 1);
    const flash = await game.page.evaluate(() => [...document.querySelectorAll('.k7 .hud .seg')].map((x) => getComputedStyle(x).animationName));
    assert.ok(flash.some((n) => /^k7-seg-/.test(n)), `the hit flash runs (${flash})`);
    await run(game, 40);
    // reduce flashes: a steady pale outline, no animation
    await press(game, 'variant/reduce flashes');
    await frame(game, 2);
    s = await look();
    assert.deepEqual([s.low, s.anim], [true, ['none', 'none', 'none']], 'reduce flashes: nothing pulses');
    assert.match(s.shadow, /rgb\(243, 230, 207\)/, 'the outline holds, pale');
    await press(game, 'variant/reduce flashes');
    await press(game, 'variant/reduce motion');
    await frame(game, 2);
    assert.deepEqual((await look()).anim, ['none', 'none', 'none'], 'reduce motion: the same');
    await press(game, 'variant/reduce motion');
    // down to the last, and back up
    await press(game, 'health/hp 8');
    await frame(game, 2);
    assert.equal((await look()).low, true);
    await press(game, 'health/hp 80');
    await frame(game, 2); await finish(game);
    s = await look();
    assert.deepEqual([s.low, s.edge], [false, '0'], 'healed: the cue is gone');
  } finally { await game.close(); }
});

test('the readable sheet names its keys in key caps (the bound interact key, Esc), and the first note is two cards, each paragraph a text of story.json', async () => {
  const game = await openIndex(server, { viewport: { width: 1280, height: 720 } });
  try {
    const open = (key) => game.page.evaluate((k) => { const dbg = window.__dbg; dbg.emit('readable/opened', { key: k }); dbg.ext.core.ctx().state.request('paused', 'readable', 'readable'); dbg.step(0, true); }, key);
    const sheet = () => game.page.evaluate(() => {
      const s = document.querySelector('.k7 .reader.on .sheet');
      if (!s) return null;
      const body = s.querySelector('.sheet-body'), items = [...s.querySelectorAll('.mi')].filter((m) => getComputedStyle(m).display !== 'none');
      return {
        nodes: [...body.childNodes].map((n) => n.nodeValue), text: body.textContent, dots: [...s.querySelectorAll('.dots i')].filter((d) => getComputedStyle(d).display !== 'none').length,
        items: items.map((m) => [m.querySelector('.key').textContent, m.querySelector('.mi-label').textContent]),
        caps: items.map((m) => { const k = m.querySelector('.key'), c = getComputedStyle(k), r = k.getBoundingClientRect(), l = m.querySelector('.mi-label').getBoundingClientRect(); return { border: parseFloat(c.borderTopWidth), colour: c.color, before: r.right <= l.left + 0.5, size: parseFloat(c.fontSize) }; }),
        inside: s.getBoundingClientRect().bottom < innerHeight && s.getBoundingClientRect().top > 0,
      };
    });
    const note = STORY.readables.rd_note_lip.body.split('\n\n');
    assert.equal(note.length, 3, 'story.json writes the note in three paragraphs');
    await open('rd_note_lip');
    let s = await sheet();
    // pass i2: the whole note is one card (36 words on a sheet with room for them), each paragraph its own text
    assert.deepEqual(s.nodes, [note[0], '\n\n', note[1], '\n\n', note[2]], 'the note on one card, each paragraph its own text');
    assert.equal(s.dots, 0, 'one card: no dots (it was three presses for four sentences, then two)');
    // pass i3: on the only card Close names the key that opened the note and closes it (it said Esc; in play, Right click)
    assert.deepEqual(s.items, [['E', STORY.ui.ui_read_close]]);
    for (const c of s.caps) assert.ok(c.border >= 1 && c.colour === 'rgb(20, 17, 15)' && c.before && c.size >= 11, `a key cap in ink, before its word (${JSON.stringify(c)})`);
    assert.equal(s.inside, true);
    await game.page.screenshot({ path: path.join(OUT, 'note_keys_1280x720.png') });
    await game.page.keyboard.press('KeyE');
    assert.equal(await sheet(), null, 'the interact key closes a one-card note');
    assert.equal((await game.state()).game, 'playing');
    // the cap is the key bound NOW
    await game.page.evaluate(() => { const o = window.__dbg.ext.core.ctx().options; o.set('bindings', { ...o.value.bindings, interact: ['KeyT'] }); });
    await open('rd_backstory');
    s = await sheet();
    assert.deepEqual(s.items.map((i) => i[0]), ['T', 'Esc']);
    await game.page.keyboard.press('KeyT');
    assert.deepEqual((await ui(game)).reader, { key: 'rd_backstory', card: 1, cards: 2 }, 'and that key turns the card');
    await game.page.keyboard.press('Escape');
    assert.equal((await game.state()).game, 'playing', 'Esc closes, as its cap says');
  } finally { await game.close(); }
});

test('a first Begin shows the four story cards once, over the first frame of the run: the interact key turns them and hands her the game, Enter does it at once', async () => {
  const game = await openIndex(server, { start: false, viewport: { width: 1280, height: 720 } });
  try {
    const actions = async () => (await game.events(0, 'ui/action')).map((e) => e.payload.action);
    const seen = () => game.page.evaluate((k) => localStorage.getItem(k), SEEN_KEY);
    const sheet = () => game.page.evaluate(() => {
      const s = document.querySelector('.k7 .reader.on .sheet');
      if (!s) return null;
      const items = [...s.querySelectorAll('.mi')].filter((m) => getComputedStyle(m).display !== 'none');
      return { title: s.querySelector('.sheet-title').textContent, body: s.querySelector('.sheet-body').textContent, items: items.map((m) => m.querySelector('.key').textContent + ' ' + m.querySelector('.mi-label').textContent + (m.classList.contains('sel') ? '*' : '')) };
    });
    const where = async () => { const st = await game.state(); return [st.game, st.systems.ui.screen, st.systems.ui.intro]; };
    const begin = async () => { await game.page.click('.k7 .scr.on [data-item="play"]'); await idle(game); };
    const toTitle = async () => {
      await game.page.evaluate(() => { const d = window.__dbg, c = d.ext.core.ctx(); if (c.state.current === 'playing') d.pause(true); c.save.clear(); d.emit('ui/action', { action: 'quit_to_title' }); });
      await idle(game);
      assert.equal((await game.state()).game, 'title');
    };
    const story = STORY.readables.rd_backstory, cards = story.body.split('\n\n');
    assert.equal(cards.length, 4);
    // ---- a browser that has not seen them (under ?test=1 the cards are asked for with '0': a scripted run is not stopped)
    await game.page.evaluate((k) => localStorage.setItem(k, '0'), SEEN_KEY);
    await begin();
    assert.deepEqual(await actions(), ['play'], 'Begin begins: the click takes the pointer and the stage loads, as ever');
    assert.deepEqual(await where(), ['paused', 'readable', true], 'and before the run\'s first tick the story is laid over its first frame, the game held');
    const states = (await game.events(0, 'game/state')).slice(-3).map((e) => e.payload.to + ':' + e.payload.reason);
    assert.deepEqual(states, ['loading:play', 'playing:run_started', 'paused:readable'], 'the run started for everybody first, then the hold');
    const sim0 = (await game.state()).simTime;
    assert.deepEqual(await game.page.evaluate(() => ['.hud', '.txt'].map((sel) => getComputedStyle(document.querySelector('.k7 ' + sel)).display)), ['none', 'none'], 'no gauges and no checkpoint numeral under it');
    let s = await sheet();
    assert.deepEqual([s.title, s.body, s.items], [story.title, cards[0], ['E ' + STORY.ui.ui_read_next + '*', 'Enter ' + STORY.ui.ui_menu_play]], 'the first card; its second item is Begin, on Enter');
    assert.equal(await seen(), '1', 'marked as shown');
    await frame(game, 30);
    assert.equal((await game.state()).simTime, sim0, 'nothing of the stage runs behind the cards: the narrator has not begun');
    assert.equal((await vt(game)).subtitle, '');
    await game.page.screenshot({ path: path.join(OUT, 'first_begin_story_1280x720.png') });
    // E turns the cards; on the last one only Begin is left, and E hands her the game
    for (let i = 1; i < 4; i++) { await game.page.keyboard.press('KeyE'); assert.equal((await sheet()).body, cards[i], `card ${i + 1}`); }
    // (pass i3: on the last card Begin names E, the key that turned the cards; Enter begins from any card as before)
    assert.deepEqual((await sheet()).items, ['E ' + STORY.ui.ui_menu_play + '*']);
    assert.equal((await game.state()).game, 'paused');
    await game.page.keyboard.press('KeyE');
    assert.deepEqual(await where(), ['playing', '', false], 'the end of the cards: play');
    assert.equal(await game.page.evaluate(() => getComputedStyle(document.querySelector('.k7 .hud')).display), 'block', 'and the gauges are back');
    const last = (await game.events(0, 'game/state')).at(-1).payload;
    assert.deepEqual([last.to, last.reason], ['playing', 'readable_closed'], 'handed back as any note is');
    // ---- once: the next Begin in this browser is not stopped
    await toTitle();
    await begin();
    await frame(game, 5);
    assert.deepEqual(await where(), ['playing', '', false]);
    // ---- Enter on any card hands her the game at once (one key skips them)
    await toTitle();
    await game.page.evaluate((k) => localStorage.setItem(k, '0'), SEEN_KEY);
    await begin();
    assert.deepEqual(await where(), ['paused', 'readable', true]);
    await game.page.keyboard.press('Enter');
    assert.deepEqual([await where(), await seen()], [['playing', '', false], '1']);
    // ---- Esc closes them too
    await toTitle();
    await game.page.evaluate((k) => localStorage.setItem(k, '0'), SEEN_KEY);
    await begin();
    assert.equal((await where())[2], true);
    await game.page.keyboard.press('Escape');
    assert.equal((await where())[0], 'playing', 'Esc closes them too');
    // ---- reading "The story so far" from the title counts as having seen them; there Esc is the close key
    await toTitle();
    await game.page.evaluate((k) => localStorage.setItem(k, '0'), SEEN_KEY);
    await game.page.click('.k7 .scr.on [data-item="story"]');
    s = await sheet();
    assert.deepEqual(s.items, ['E ' + STORY.ui.ui_read_next + '*', 'Esc ' + STORY.ui.ui_read_close]);
    // (closed with its button: under ?test=1 no tick runs on the title, and an Esc pressed here would still be waiting
    // as the pause key on the first tick of the run below)
    await game.page.click('.k7 .reader.on [data-item="close"]');
    assert.deepEqual([(await ui(game)).screen, await seen()], ['title', '1']);
    // ---- and the Begin after that is not stopped
    await begin();
    await frame(game, 5);
    assert.deepEqual(await where(), ['playing', '', false]);
    // ---- and without the key a scripted run is never stopped (every other test and the e2e driver click Begin)
    await toTitle();
    await game.page.evaluate((k) => localStorage.removeItem(k), SEEN_KEY);
    await begin();
    await frame(game, 5);
    assert.deepEqual(await where(), ['playing', '', false]);
  } finally { await game.close(); }
});

test('the loading screen is the title arriving: the name and the mark in the title\'s place, and a line that fills by set and never goes back', async () => {
  const game = await openIndex(server, { start: false, viewport: { width: 1280, height: 720 } });
  try {
    const rects = (scr) => game.page.evaluate((sel) => {
      const r = (n) => { const b = n.getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map((v) => Math.round(v * 10) / 10); };
      const s = document.querySelector('.k7 ' + sel), name = s.querySelector('.title-name'), cs = getComputedStyle(name);
      return { name: r(name), mark: r(s.querySelector('.pm')), text: name.textContent, font: cs.fontFamily.split(',')[0], size: cs.fontSize, tracking: cs.letterSpacing, colour: cs.color };
    }, scr);
    const title = await rects('.title.on');
    await game.page.evaluate(() => window.__dbg.ext.core.ctx().state.request('loading', 'test'));
    assert.equal((await ui(game)).screen, 'loading');
    const loading = await rects('.loading.on');
    assert.deepEqual(loading, title, 'the same name and mark, in the same place, in the same type');
    assert.equal(loading.text, STORY.ui.ui_title);
    const bar = () => game.page.evaluate(() => {
      const line = document.querySelector('.k7 .loading .load-line'), i = line.querySelector('i'), m = /scaleX\(([\d.]+)\)/.exec(i.style.transform), glint = getComputedStyle(line, '::after'), foot = document.querySelector('.k7 .load-foot').getBoundingClientRect(), l = line.getBoundingClientRect();
      const texts = []; const tw = document.createTreeWalker(document.querySelector('.k7 .loading'), NodeFilter.SHOW_TEXT); for (let n = tw.nextNode(); n; n = tw.nextNode()) if (n.nodeValue.trim() !== '') texts.push(n.nodeValue);
      return { at: m ? Number(m[1]) : 0, known: line.classList.contains('known'), glint: glint.animationName, glintShown: glint.display !== 'none', width: l.width, height: l.height, low: foot.top / innerHeight, left: foot.left / innerWidth, texts, bg: getComputedStyle(document.querySelector('.k7 .loading')).backgroundColor };
    });
    let b = await bar();
    assert.deepEqual([b.at, b.known, b.glint, b.glintShown], [0, false, 'k7-load', true], 'nothing reported yet: the line at rest, the glint crossing it');
    // pass i2: and one line in the narrator's voice under the mark (two sentences of rd_backstory until story.json has ui_loading_line)
    assert.equal(b.texts.length, 3);
    assert.deepEqual([b.texts[0], b.texts[2]], [STORY.ui.ui_title, STORY.ui.ui_loading], 'the name and one word, both story.json\'s');
    assert.ok(STORY.ui.ui_loading_line === b.texts[1] || STORY.readables.rd_backstory.body.includes(b.texts[1]), `the line is story.json's (${b.texts[1]})`);
    assert.ok(b.width >= 180 && b.height >= 2, `a line that can be seen (${b.width} x ${b.height} px; it was a 1 px hair of 173)`);
    assert.ok(b.low > 0.75 && b.left < 0.12, 'where the menu will be');
    assert.equal(b.bg, 'rgb(20, 17, 15)');
    // the boot's two sets, each from nought, as core reports them: one line, never back
    const seq = [[2, 4, 'always', 0.07], [4, 4, 'always', 0.14], [0, 8, 'surface', 0.14], [4, 8, 'surface', 0.57], [1, 8, 'surface', 0.57], [8, 8, 'surface', 1], [0, 3, 'underground', 1], [3, 3, 'coda', 1]];
    let last = 0;
    for (const [loaded, total, label, want] of seq) {
      await game.page.evaluate(([l, t, lab]) => window.__dbg.emit('load/progress', { loaded: l, total: t, label: lab }), [loaded, total, label]);
      b = await bar();
      assert.ok(Math.abs(b.at - want) < 0.002, `${label} ${loaded}/${total}: the line stands at ${want} (${b.at})`);
      assert.ok(b.at >= last, 'never backwards');
      last = b.at;
      if (loaded === 4 && label === 'surface') { await game.page.waitForTimeout(450); await game.page.screenshot({ path: path.join(OUT, 'loading_1280x720.png') }); }
    }
    assert.equal(b.known, true);
    // reduce motion: no glint
    await game.page.evaluate(() => window.__dbg.ext.core.ctx().options.set('reduceMotion', true));
    assert.equal((await bar()).glintShown, false);
  } finally { await game.close(); }
});

test('index.html: before any script runs the page shows the name and the mark where the title has them; the game takes over without a move', async () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.equal(/<div class="name">([^<]*)<\/div>/.exec(html)?.[1], STORY.ui.ui_title, 'the pre-boot name is story.json\'s');
  assert.ok(!/id="preboot"/.test(html), 'the bare hairline is gone');
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    // hold the script back: this is the wait on a cold cache
    let release = null;
    const held = new Promise((resolve) => { release = resolve; });
    await page.route(/\/src\/main\.ts/, async (route) => { await held; await route.continue(); });
    await page.goto(server.url + '?test=1&tier=low&seed=1&stubs=player,enemies,world,render,audio', { waitUntil: 'commit' });
    await page.waitForSelector('#preload .name');
    const measure = (sel) => page.evaluate((s) => {
      const r = (n) => { const b = n.getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map((v) => Math.round(v * 10) / 10); };
      const [nameSel, markSel, lineSel] = s;
      const name = document.querySelector(nameSel), cs = getComputedStyle(name), line = lineSel ? document.querySelector(lineSel) : null;
      return { name: r(name), mark: r(document.querySelector(markSel)), line: line ? r(line) : null, text: name.textContent, font: cs.fontFamily.split(',')[0], colour: cs.color };
    }, sel);
    const pre = await measure(['#preload .name', '#preload svg', '#preload .line']);
    const preLook = await page.evaluate(() => ({ title: document.title, bg: getComputedStyle(document.getElementById('preload')).backgroundColor, glint: getComputedStyle(document.querySelector('#preload .line'), '::after').animationName, ui: document.getElementById('ui').children.length, fill: getComputedStyle(document.querySelector('#preload svg circle')).fill }));
    assert.deepEqual(preLook, { title: STORY.ui.ui_title, bg: 'rgb(20, 17, 15)', glint: 'preload', ui: 0, fill: 'rgb(201, 161, 74)' }, 'the tab has its name, the page is ink, the line is alive, and the game has drawn nothing yet');
    await page.screenshot({ path: path.join(OUT, 'preboot_1280x720.png') });
    release();
    await page.waitForFunction(() => window.__dbg && (window.__dbg.ready === true || window.__dbg.error));
    assert.equal(await page.evaluate(() => window.__dbg.error ?? null), null);
    await page.waitForFunction(() => document.getElementById('preload') === null);
    const title = await measure(['.k7 .title.on .title-name', '.k7 .title.on .pm', null]);
    await page.evaluate(() => window.__dbg.ext.core.ctx().state.request('loading', 'test'));
    const loading = await measure(['.k7 .loading.on .title-name', '.k7 .loading.on .pm', '.k7 .loading.on .load-line']);
    const near = (a, b, what) => { for (let i = 0; i < 4; i++) assert.ok(Math.abs(a[i] - b[i]) <= 0.6, `${what}: ${a} against ${b}`); };
    near(pre.name, loading.name, 'the name, pre-boot and loading');
    near(pre.name, title.name, 'the name, pre-boot and title');
    near(pre.mark, loading.mark, 'the mark, pre-boot and loading');
    near(pre.mark, title.mark, 'the mark, pre-boot and title');
    near(pre.line, loading.line, 'the line, pre-boot and loading');
    assert.deepEqual([pre.text, pre.font, pre.colour], [title.text, title.font, title.colour], 'the same words, type and colour');
  } finally { await browser.close(); }
});

test('the options page: no text under 12 px at any window size, a ground of ink at 86 %, and everything inside the window', async () => {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 960, height: 720 }, { width: 800, height: 450 }]) {
    const game = await openSandbox(server, { viewport });
    try {
      const at = `${viewport.width}x${viewport.height}`;
      await press(game, 'screen/options (pause)');
      await frame(game, 0);
      const scan = () => game.page.evaluate(() => {
        const opt = document.querySelector('.k7 .options.on'), small = [], out = [];
        for (const n of opt.querySelectorAll('*')) {
          if (n.offsetParent === null || getComputedStyle(n).visibility === 'hidden') continue;
          const own = [...n.childNodes].some((c) => c.nodeType === 3 && c.nodeValue.trim() !== '');
          if (!own) continue;
          const size = parseFloat(getComputedStyle(n).fontSize), r = n.getBoundingClientRect();
          if (size < 12 - 0.01) small.push(`${size.toFixed(1)}px ${n.textContent.trim().slice(0, 20)}`);
          if (r.left < -0.5 || r.top < -0.5 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5) out.push(n.textContent.trim().slice(0, 20));
        }
        const slots = [...opt.querySelectorAll('.pane.on .slot')].map((s) => s.getBoundingClientRect());
        const overlap = slots.some((a, i) => slots.some((b, j) => j > i && a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5));
        return { small, out, overlap, bg: getComputedStyle(opt).backgroundColor, slots: slots.length };
      });
      let s = await scan();
      assert.deepEqual([s.small, s.out, s.overlap], [[], [], false], `${at}: the key bindings (the caps were 10.2 px and the heading 9.6 px)`);
      assert.equal(s.slots, 24, 'twelve actions, two slots each');
      assert.equal(s.bg, 'rgba(20, 17, 15, 0.86)', 'the scene and the revolver behind it are dimmed to 14 %');
      if (viewport.width !== 960) await game.page.screenshot({ path: path.join(OUT, `options_${at}.png`) });
      for (const tab of ['comfort', 'text', 'sound', 'picture']) {
        await game.page.evaluate((t) => document.querySelector(`.k7 .options [data-tab="${t}"]`).click(), tab);
        s = await scan();
        assert.deepEqual([s.small, s.out], [[], []], `${at}: ${tab}`);
      }
    } finally { await game.close(); }
  }
});

test('the HUD mark keeps its 720p size down to 600 px of height and comes down with the window under that', async () => {
  const game = await openSandbox(server, { viewport: { width: 1280, height: 720 } });
  try {
    await press(game, 'state/play');
    const share = {};
    for (const [w, h, scale] of [[1280, 720, 1.08], [1067, 600, 1.08], [800, 450, 0.81], [640, 360, 0.72], [480, 270, 0.72]]) {
      await game.page.setViewportSize({ width: w, height: h });
      await game.page.waitForFunction(([ww, hh]) => innerWidth === ww && innerHeight === hh, [w, h]);
      await game.page.evaluate(() => new Promise((resolve) => { requestAnimationFrame(() => requestAnimationFrame(resolve)); }));
      await frame(game, 1);
      const m = await game.page.evaluate(() => {
        const mark = document.querySelector('.k7 .hud .mark'), r = mark.getBoundingClientRect(), num = mark.querySelector('.rs').getBoundingClientRect(), health = document.querySelector('.k7 .health').getBoundingClientRect();
        return { w: r.width, h: r.height, num: num.height, mki: Number(getComputedStyle(document.querySelector('.k7')).getPropertyValue('--mki')), inside: r.left >= 0 && r.bottom <= innerHeight, overHealth: r.bottom <= health.top + 2 };
      });
      assert.ok(Math.abs(m.w - 88 * scale) < 0.2 && Math.abs(m.h - 139 * scale) < 0.3, `${w} x ${h}: ${m.w.toFixed(1)} x ${m.h.toFixed(1)} px is 88 x 139 at ${scale}`);
      assert.ok(Math.abs(m.mki - (scale < 1 ? 1 / scale : 1)) < 0.001, `${w} x ${h}: the kick and the shiver are still screen pixels (--mki ${m.mki})`);
      assert.ok(m.inside && m.overHealth, `${w} x ${h}: in the corner, over the bars`);
      share[h] = m.h / h;
      if (h === 450) await game.page.screenshot({ path: path.join(OUT, 'hud_800x450.png') });
    }
    assert.ok(share[450] <= 0.251, `at 800 x 450 the mark is a quarter of the height (${share[450].toFixed(3)}; it was a third: 150 px of 450)`);
    assert.ok(Math.abs(share[720] - 0.2085) < 0.002, 'and at 720p it is what it was');
  } finally { await game.close(); }
});

test('the end card shows "Six chambers, six shots" only when it was done, in brass, and the rows still light one after the other', async () => {
  const game = await openIndex(server, { viewport: { width: 1280, height: 720 } });
  try {
    const end = (cleanSix) => game.page.evaluate(async (six) => {
      const dbg = window.__dbg, ctx = dbg.ext.core.ctx();
      if (ctx.state.current !== 'ending') ctx.state.request('ending', 'stage_end');
      dbg.emit('ending/card', { stats: { playSeconds: 600, roundsFired: 60, roundsHit: 50, knotsBurst: 3, linesOfThree: 1, cleanSix: six, secrets: [], freed: 4, felled: 9, deaths: 1, tookStoneRound: false } });
      await dbg.ext.core.stepAsync(2, true);
      const rows = [...document.querySelectorAll('.k7 .end .lrow')].filter((r) => getComputedStyle(r).display !== 'none');
      const six6 = document.querySelector('.k7 .end [data-row="clean_six"]');
      return { ids: rows.map((r) => r.getAttribute('data-row')), delays: rows.map((r) => parseFloat(getComputedStyle(r).animationDelay)), text: document.querySelector('.k7 .end').textContent, colour: getComputedStyle(six6.querySelector('.lab')).color, row: [six6.querySelector('.lab').textContent, six6.querySelector('.v').textContent] };
    }, cleanSix);
    let e = await end(false);
    assert.deepEqual(e.ids, ['time', 'deaths', 'rounds', 'accuracy', 'knots', 'lines', 'secrets', 'lamps', 'carries'], 'not done: no row');
    assert.ok(!/\bNo\b/.test(e.text) && !('ui_end_no' in STORY.ui), 'and no bare "No" anywhere on the card (the string is out of story.json)');
    for (let i = 0; i < e.delays.length; i++) assert.ok(Math.abs(e.delays[i] - (0.9 + i * 0.38)) < 1e-6, `row ${i} lights at ${0.9 + i * 0.38} s (${e.delays[i]})`);
    e = await end(true);
    assert.deepEqual(e.ids, ['time', 'deaths', 'rounds', 'accuracy', 'knots', 'lines', 'clean_six', 'secrets', 'lamps', 'carries']);
    assert.deepEqual([e.row, e.colour], [[STORY.ui.ui_end_clean_six, STORY.ui.ui_end_yes], 'rgb(201, 161, 74)'], 'done: the feat, in brass');
    for (let i = 0; i < e.delays.length; i++) assert.ok(Math.abs(e.delays[i] - (0.9 + i * 0.38)) < 1e-6, `row ${i} (${e.delays[i]})`);
    await game.page.evaluate(() => { for (const a of document.getAnimations()) { try { a.finish(); } catch { /* endless */ } } });
    await game.page.screenshot({ path: path.join(OUT, 'end_feat_1280x720.png') });
  } finally { await game.close(); }
});
