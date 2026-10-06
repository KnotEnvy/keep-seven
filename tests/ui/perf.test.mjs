// Pillar 5 for the UI (docs/workorders/code-ui.md 4.4, 6): DOM writes only on change, no per-frame allocation, 0.2 ms of
// JS; then the sweeps over every sandbox state: no red, no text that is not story.json's; the production build.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { measureAlloc, openGame, startServer } from '../harness.mjs';
import { PIECE, STORY, frame, openIndex, openSandbox, press, serve } from './util.mjs';

let server;
before(async () => { server = await serve(); });
after(async () => { await server.close(); });

/** page-side: watch every mutation under the UI root; returns a function that stops and reports */
const WATCH = `(() => {
  const root = document.querySelector('.k7');
  const seen = [];
  const where = (n) => { const e = n.nodeType === 1 ? n : n.parentElement; if (!e) return '?'; if (e.closest('.mark:not(.big)')) return e.closest('.rs') ? 'reserve' : 'ring'; if (e.closest('.mk')) return 'marker'; return (e.getAttribute('class') || e.tagName).toString(); };
  const mo = new MutationObserver((list) => { for (const m of list) seen.push(where(m.target)); });
  mo.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
  window.__watch = () => { for (const m of mo.takeRecords()) seen.push(where(m.target)); mo.disconnect(); return seen; };
})()`;

test('writes only on change: 600 idle frames mutate nothing; one shot touches only the ring, the reserve and the marker', async () => {
  const game = await openSandbox(server);
  try {
    await press(game, 'state/full cylinder');
    await frame(game, 120);                                         // the checkpoint notice of the run's start runs out
    await game.page.evaluate(WATCH);
    const idle = await game.page.evaluate(() => { for (let i = 0; i < 600; i++) window.__dbg.step(1, true); return window.__watch(); });
    assert.deepEqual(idle, [], '600 ticks, each with a frame: 0 mutations');
    // with the pulse running, a boss bar up and a subtitle on: still nothing per frame
    await game.page.evaluate(() => { const d = window.__dbg; d.ext.core.setSeventh('pulse'); d.setBossPhase('p3a'); d.setHealth(55); d.emit('story/line', { key: 'k', speaker: 'narrator', text: 'A line that stays up.', seconds: 60 }); d.step(1, true); });
    await game.page.evaluate(WATCH);
    const busy = await game.page.evaluate(() => { for (let i = 0; i < 600; i++) window.__dbg.step(1, true); return window.__watch(); });
    assert.deepEqual(busy, [], 'a busy HUD at rest: 0 mutations in 600 frames');
    // one shot that hits: ring (the chamber, the turn, the kick), marker; then a reload round: ring and reserve
    await game.page.evaluate(WATCH);
    const shot = await game.page.evaluate(() => {
      const d = window.__dbg;
      d.ext.uisb.fire();
      d.emit('combat/hit', { x: 0, y: 0, z: 0, shotId: 1, order: 0, ammo: 'lead_round', outcome: 'hit', entityId: 'bider#1', entityKind: 'bider', part: 'body', surface: 'cloth', nx: 0, ny: 1, nz: 0, damage: 50, ricochetX: 0, ricochetY: 0, ricochetZ: 0 });
      for (let i = 0; i < 60; i++) d.step(1, true);
      d.ext.uisb.reloadRound();
      for (let i = 0; i < 60; i++) d.step(1, true);
      return window.__watch();
    });
    const count = {};
    for (const w of shot) count[w] = (count[w] ?? 0) + 1;
    assert.deepEqual(Object.keys(count).sort(), ['marker', 'reserve', 'ring'], JSON.stringify(count));
    assert.ok(shot.length <= 12, `${shot.length} mutations for a shot, its marker and a reload round`);
    console.log(`mutations: idle 0 / 600 frames; busy HUD at rest 0 / 600 frames; a shot + marker + one reload round: ${JSON.stringify(count)}`);
  } finally { await game.close(); }
});

test('the UI costs at most 0.2 ms of JS per frame (median), in a worst fight as well as at rest', async () => {
  const game = await openIndex(server, { checkpoint: 'cp_boss_p1' });
  try {
    await game.dbg('god', true);
    const ms = await game.page.evaluate(() => {
      const dbg = window.__dbg, ctx = dbg.ext.core.ctx(), UI = 5;
      const hit = { x: 0, y: 0, z: 0, shotId: 1, order: 0, ammo: 'lead_round', outcome: 'hit', entityId: 'bider#1', entityKind: 'bider', part: 'body', surface: 'cloth', nx: 0, ny: 1, nz: 0, damage: 50, ricochetX: 0, ricochetY: 0, ricochetZ: 0 };
      const dmg = { amount: 5, health: 60, kind: 'stake', source: 'windlass', fromX: 3, fromY: 1, fromZ: 9, graceUsed: false };
      const run = (frames, fight) => {
        const out = [];
        for (let i = 0; i < frames; i++) {
          if (fight) {
            if (i % 29 === 0) dbg.tap('fire');
            if (i % 31 === 0) dbg.emit('combat/hit', hit);
            if (i % 37 === 0) dbg.emit('player/damaged', dmg);
            if (i % 41 === 0) dbg.ext.enemies.setBoss({ pips: 26 - (i / 41) % 20 });
            if (i % 180 === 0) dbg.emit('story/line', { key: 'stn', speaker: 'station', text: 'INDEXING. STAND CLEAR OF THE HEAD.', seconds: 2 });
            if (i % 180 === 120) dbg.emit('story/line_end', { key: 'stn' });
            if (i % 97 === 0) dbg.emit('story/caption', { key: 'cap', text: '[a great ratchet turns]', seconds: 2 });
          }
          dbg.step(1, true);
          out.push(ctx.perf.systemMs[UI]);
        }
        out.sort((a, b) => a - b);
        return { median: out[out.length >> 1], p95: out[Math.floor(out.length * 0.95)], max: out[out.length - 1] };
      };
      run(300, true);                                               // warm-up
      const rest = run(600, false), fight = run(900, true);
      // the frame timer's resolution is 0.1 ms here: time the UI's own tick + frame over 20 000 calls for a real figure
      const ui = ctx.ui;
      const t0 = performance.now();
      for (let i = 0; i < 20000; i++) { ui.fixedUpdate(1 / 60); ui.update(1 / 60, 1); }
      return { rest, fight, order: ctx.perf.systemMs.length, each: (performance.now() - t0) / 20000 };
    });
    assert.equal(ms.order, 6);
    assert.ok(ms.rest.median <= 0.2, `at rest: median ${ms.rest.median} ms`);
    assert.ok(ms.fight.median <= 0.2, `in a fight: median ${ms.fight.median} ms`);
    assert.ok(ms.each <= 0.02, `one UI tick + frame costs ${ms.each} ms`);
    console.log(`ui tick + frame, timed over 20 000 calls: ${(ms.each * 1000).toFixed(2)} microseconds`);
    console.log(`ui JS per frame (fixedUpdate + update, ms): at rest median ${ms.rest.median.toFixed(4)} p95 ${ms.rest.p95.toFixed(4)}; fight median ${ms.fight.median.toFixed(4)} p95 ${ms.fight.p95.toFixed(4)} max ${ms.fight.max.toFixed(4)} (budget 0.2)`);
  } finally { await game.close(); }
});

test('allocation: the UI\'s tick and frame allocate nothing; the wired game stays under 6 KB per tick with the HUD busy', async () => {
  const game = await openIndex(server, { checkpoint: 'cp_boss_p1' });
  try {
    await game.dbg('god', true);
    await game.page.evaluate(() => { const d = window.__dbg; d.setBossPhase('p2'); d.ext.core.setSeventh('pulse'); d.setHealth(60); d.emit('story/line', { key: 'k', speaker: 'narrator', text: 'A line that stays up.', seconds: 600 }); d.step(1, true); });
    // 1. the UI system alone: one fixedUpdate and one update per "tick"
    const alone = await measureAlloc(game, (dbg, n) => { const ui = dbg.ext.core.ctx().ui; for (let i = 0; i < n; i++) { ui.fixedUpdate(1 / 60); ui.update(1 / 60, 1); } });
    assert.ok(alone.perTick <= 64, `the UI's own tick + frame: ${alone.perTick} B (samples ${alone.samples.map((s) => Math.round(s)).join(', ')})`);
    // 2. the same with its events arriving: a shot every 30 ticks, a marker, a damage arc, boss pips
    const events = await measureAlloc(game, (dbg, n, a) => {
      const ui = dbg.ext.core.ctx().ui;
      for (let i = 0; i < n; i++) {
        if (i % 30 === 0) { dbg.emit('weapon/fired', a.fired); dbg.emit('combat/hit', a.hit); }
        if (i % 30 === 15) dbg.emit('player/damaged', a.dmg);
        ui.fixedUpdate(1 / 60); ui.update(1 / 60, 1);
      }
    }, { arg: {
      fired: { shotId: 1, ammo: 'lead_round', chambersLeft: 5, ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: -1, mx: 0, my: 0, mz: 0, endX: 0, endY: 0, endZ: -9 },
      hit: { x: 0, y: 0, z: 0, shotId: 1, order: 0, ammo: 'lead_round', outcome: 'kill', entityId: 'bider#1', entityKind: 'bider', part: 'body', surface: 'cloth', nx: 0, ny: 1, nz: 0, damage: 50, ricochetX: 0, ricochetY: 0, ricochetZ: 0 },
      dmg: { amount: 5, health: 60, kind: 'stake', source: 'windlass', fromX: 3, fromY: 1, fromZ: 9, graceUsed: false },
    } });
    assert.ok(events.perTick <= 256, `with a shot, a marker and an arc every half second: ${events.perTick} B per tick`);
    // 3. wired in: the whole game's tick with the real UI in its slot (core's ceiling: 6 KB per tick)
    const wired = await measureAlloc(game, (dbg, n) => { for (let i = 0; i < n; i += 30) { dbg.tap('fire'); dbg.step(Math.min(30, n - i), false); } });
    assert.ok(wired.perTick <= 6144, `a wired tick: ${wired.perTick} B`);
    console.log(`alloc (B per tick, median of 10 x 60 after 3000 warm-up): UI tick + frame ${Math.round(alone.perTick)}; with events ${Math.round(events.perTick)}; whole game tick, real UI, shooting ${Math.round(wired.perTick)} (ceiling 6144)`);
  } finally { await game.close(); }
});

// ---- sweeps over every sandbox state ------------------------------------------------------------------
/** page-side: every colour the UI shows, as [r, g, b, a, where] */
const COLOURS = `(() => {
  const out = [];
  const props = ['color', 'backgroundColor', 'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'outlineColor', 'fill', 'stroke', 'boxShadow', 'textShadow', 'textDecorationColor'];
  const scan = (el, pseudo) => {
    const cs = getComputedStyle(el, pseudo);
    if (!pseudo && (cs.display === 'none')) return false;
    if (pseudo && (cs.content === 'none' || cs.display === 'none')) return true;
    for (const p of props) {
      const v = cs[p];
      if (!v || v === 'none') continue;
      for (const m of v.matchAll(/rgba?\\(([^)]+)\\)/g)) {
        const n = m[1].split(/[ ,/]+/).map(Number);
        if ((n[3] ?? 1) > 0) out.push([n[0], n[1], n[2], n[3] ?? 1, (el.getAttribute('class') || el.tagName) + (pseudo || '') + '.' + p]);
      }
    }
    return true;
  };
  const walk = (el) => { if (!scan(el, null)) return; scan(el, '::before'); scan(el, '::after'); for (const c of el.children) walk(c); };
  walk(document.querySelector('.k7'));
  return out;
})()`;
/** hue in degrees and HSL saturation of an sRGB colour */
function hsl([r, g, b]) {
  const R = r / 255, G = g / 255, B = b / 255, max = Math.max(R, G, B), min = Math.min(R, G, B), d = max - min, l = (max + min) / 2;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  h = (h * 60 + 360) % 360;
  return { h, s, l };
}
/** page-side: every text the UI shows right now */
const TEXTS = `(() => {
  const out = [];
  const tw = document.createTreeWalker(document.querySelector('.k7'), NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    const t = n.nodeValue.trim();
    if (t === '') continue;
    let e = n.parentElement, shown = true;
    for (let p = e; p && !p.classList.contains('k7'); p = p.parentElement) { const cs = getComputedStyle(p); if (cs.display === 'none' || cs.visibility === 'hidden') { shown = false; break; } }
    if (shown) out.push([t, e.getAttribute('class') || e.tagName]);
  }
  return out;
})()`;

test('every sandbox state: no red anywhere, and every word on screen is story.json\'s', async () => {
  const game = await openSandbox(server);
  try {
    const names = await game.page.evaluate(() => window.__dbg.ext.uisb.list());
    assert.ok(names.length > 100, `${names.length} sandbox buttons`);
    // what story.json allows on screen: its strings, split at placeholders and at line breaks
    const corpus = new Set();
    const addText = (text) => { for (const piece of String(text).split(/\{[a-z_]+\}|\n+/)) { const t = piece.replace(/\s+/g, ' ').trim(); if (t) corpus.add(t); } };
    for (const v of Object.values(STORY.ui)) addText(v);
    for (const l of Object.values(STORY.lines)) addText(l.text);
    for (const r of Object.values(STORY.readables)) { addText(r.title); addText(r.body); for (const card of r.body.split('\n\n')) corpus.add(card.replace(/\s+/g, ' ').trim()); }
    for (const o of Object.values(STORY.objectives)) addText(o);
    for (const l of Object.values(STORY.lines)) { const m = /^([IVX]+)\. (.+)$/.exec(l.text); if (m) { corpus.add(m[1]); corpus.add(m[2]); } }
    const keyNames = /^(?:[A-Z0-9]|Mouse \d|Shift|Space|Esc|Enter|[←-↓]|—)$/;                 // derived from the bound codes
    const numeric = /^[\d\s:./×°%·IVX-]+$/;                                                 // counts, clocks, percentages, roman numerals
    const sizes = /^(?:S|M|L|XL)$/;                                                                         // Options.subtitleSize values
    const counted = new RegExp(`^\\d+ ${STORY.ui.ui_end_of ?? '/'} \\d+$`);                              // the end card's "71 of 96": the word is story.json's ui_end_of (polish round 3)
    const explained = (t) => {
      const flat = t.replace(/\s+/g, ' ').trim();
      if (corpus.has(flat) || keyNames.test(flat) || numeric.test(flat) || sizes.test(flat) || counted.test(flat)) return true;
      // polish round 5: the title's question is story.json's own "Begin" with a question mark (no new string could be added)
      if (flat === STORY.ui.ui_menu_play + '?') return true;
      // a wrapped subtitle, or a card of a readable, is a line of story.json with its line breaks moved
      for (const c of corpus) if (c.replace(/\s+/g, ' ') === flat) return true;
      return false;
    };
    let colours = 0, texts = 0, states = 0;
    const reds = [], strangers = [];
    const sweep = async (name) => {
      states++;
      for (const c of await game.page.evaluate(COLOURS)) {
        colours++;
        const { h, s } = hsl(c);
        if (s > 0.4 && (h <= 20 || h >= 340)) reds.push(`${name}: rgb(${c.slice(0, 3)}) hue ${h.toFixed(0)} sat ${s.toFixed(2)} on ${c[4]}`);
      }
      for (const [t, where] of await game.page.evaluate(TEXTS)) { texts++; if (!explained(t)) strangers.push(`${name}: "${t}" in ${where}`); }
    };
    for (const name of names) {
      if (name === 'state/timeline' || name.startsWith('variant/bg')) continue;
      await press(game, name);
      await game.page.evaluate(() => window.__dbg.ext.core.stepAsync(2, true));
      await sweep(name);
      if (name === 'screen/options (title)' || name === 'screen/options (pause)') {
        for (const tab of ['comfort', 'text', 'sound', 'picture']) { await game.page.evaluate((t) => document.querySelector(`.k7 .options [data-tab="${t}"]`).click(), tab); await sweep(name + ' ' + tab); }
        await game.page.evaluate(() => { document.querySelector('.k7 .options [data-action="reload"] [data-slot="0"]').click(); });
        await sweep(name + ' capturing');
        await game.page.keyboard.press('Escape');
      }
      if (name.startsWith('readable/')) { for (let i = 0; i < 3; i++) { await game.page.keyboard.press('KeyE'); await sweep(name + ' card'); } }
      if (name === 'screen/death') await game.page.evaluate(() => window.__dbg.ext.core.stepAsync(130, true));
    }
    assert.deepEqual(reds.slice(0, 5), [], `${reds.length} red colours`);
    assert.deepEqual(strangers.slice(0, 8), [], `${strangers.length} texts that are not from story.json`);
    console.log(`sweep: ${states} states, ${colours} computed colours (none within 20 degrees of red above 40 % saturation), ${texts} texts (all from story.json, key names or numbers)`);
  } finally { await game.close(); }
});

test('layouts hold at 1280 x 720, 1920 x 1080, 4:3 and 21:9: nothing leaves the frame, the corners keep their places', async () => {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }, { width: 960, height: 720 }, { width: 2520, height: 1080 }]) {
    const game = await openSandbox(server, { viewport });
    try {
      const inside = (label) => game.page.evaluate((lab) => {
        const bad = [];
        for (const e of document.querySelectorAll('.k7 .hud *, .k7 .txt *, .k7 .scr.on *')) {
          const cs = getComputedStyle(e);
          if (cs.display === 'none' || cs.visibility === 'hidden' || e.closest('svg') !== null && e.tagName !== 'svg') continue;
          let hidden = false;
          for (let p = e.parentElement; p && !p.classList.contains('k7'); p = p.parentElement) { const ps = getComputedStyle(p); if (ps.display === 'none' || ps.visibility === 'hidden') hidden = true; }
          if (hidden) continue;
          const r = e.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) bad.push(`${lab}: ${e.getAttribute('class') || e.tagName} ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.right)},${Math.round(r.bottom)}`);
        }
        return bad;
      }, label);
      const bad = [];
      for (const name of ['state/full cylinder', 'subtitle/station long', 'subtitle/size XL', 'caption/caption', 'prompt/kept', 'hint/line', 'boss/p1', 'checkpoint/saved', 'card/iii']) await press(game, name);
      await frame(game, 1);
      bad.push(...await inside('hud'));
      const corners = await game.page.evaluate(() => {
        const r = (s) => document.querySelector('.k7 ' + s).getBoundingClientRect();
        const mark = r('.hud .mark'), health = r('.health'), boss = r('.boss-name'), sub = r('.sub'), cp = r('.cp'), prompt = r('.prompt:not(.hint)'), hint = r('.prompt.hint'), talk = r('.capt');
        const overlap = (a, b) => !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
        return {
          mark: mark.left >= 0 && mark.right < innerWidth * 0.2 && mark.bottom > innerHeight * 0.85, health: health.left < innerWidth * 0.1 && health.bottom > innerHeight * 0.9, boss: Math.abs(boss.left + boss.width / 2 - innerWidth / 2) < 2 && boss.top < innerHeight * 0.1,
          sub: Math.abs(sub.left + sub.width / 2 - innerWidth / 2) < 2 && sub.bottom > innerHeight * 0.8, cp: cp.left < innerWidth * 0.1 && cp.top < innerHeight * 0.1,
          clear: [['sub/mark', sub, mark], ['mark/health', mark, health], ['mark/checkpoint', mark, cp], ['sub/health', sub, health], ['prompt/sub', prompt, sub], ['hint/sub', hint, sub], ['prompt/hint', prompt, hint], ['caption/hint', talk, hint], ['boss/checkpoint', boss, cp], ['prompt/crosshair', prompt, r('.xh .mk')]].filter(([, a, b]) => overlap(a, b)).map(([n]) => n).join(' '),
        };
      });
      assert.deepEqual(corners, { mark: true, health: true, boss: true, sub: true, cp: true, clear: '' }, `${viewport.width}x${viewport.height}`);
      for (const name of ['screen/pause', 'screen/options (pause)', 'readable/ledger', 'readable/plate_proving', 'screen/end (48 lamps, his)', 'screen/title (save)', 'screen/title (Begin over a save)', 'screen/options (title)', 'screen/story']) {
        await press(game, name);
        await frame(game, 0);
        bad.push(...await inside(name));
      }
      assert.deepEqual(bad.slice(0, 6), [], `${viewport.width}x${viewport.height}: ${bad.length} elements outside the frame`);
    } finally { await game.close(); }
  }
});

test('the production build carries the UI and its stylesheet: the title screen, styled, with no debug hook unless asked', async () => {
  const build = await startServer({ mode: 'build', pieces: ['ui'] });
  try {
    const game = await openGame(build, { piece: PIECE, start: false, stubs: null, query: { debug: 1 }, viewport: { width: 1280, height: 720 } });
    try {
      const t = await game.page.evaluate(() => {
        const name = document.querySelector('.k7 .title.on .title-name'), cs = getComputedStyle(name);
        return { text: name.textContent, family: cs.fontFamily.split(',')[0], colour: cs.color, screen: window.__dbg.state().ui.screen, stub: document.getElementById('null-ui-screen') !== null, sheets: document.styleSheets.length, items: [...document.querySelectorAll('.k7 .title .mi')].filter((m) => getComputedStyle(m).display !== 'none').length };
      });
      assert.deepEqual([t.text, t.colour, t.screen, t.stub], [STORY.ui.ui_title, 'rgb(233, 226, 208)', 'title', false]);
      assert.match(t.family, /Iowan Old Style/);
      assert.ok(t.items >= 4);
    } finally { await game.close(); }
    const dir = path.join(build.outDir, 'js');
    const files = fs.readdirSync(dir).map((f) => [f, fs.statSync(path.join(dir, f)).size]);
    const css = files.filter(([f]) => f.endsWith('.css'));
    assert.equal(css.length, 1, 'one stylesheet: the UI\'s');
    assert.ok(css[0][1] < 40000, `ui.css ships at ${css[0][1]} B`);
    console.log('production build with the real UI: ' + files.map(([f, n]) => `${f.replace(/-[\w-]{8}\./, '.')} ${n} B`).join(', '));
  } finally { await build.close(); }
});
