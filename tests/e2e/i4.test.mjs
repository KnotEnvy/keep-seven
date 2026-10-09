// PASS i4 (the cross-cutting fixer), on the real game with all six systems and on the build a release would publish:
//   1. the end card's TIME counts the whole run: a death or a restart puts her back on the checkpoint, not the clock,
//      and the stored save keeps the time and the deaths (ruling R12).
//   2. the asking is four lines (the narrator's has left it), the roll-call six words; the yard has a packet at the bell
//      post; the leave ending says only what is true of leaving (ruling R20); the new lines keep the story's own rules.
//   3. a visitor without a mouse is told so before the game's files are asked for, and can load it anyway (R20).
//   4. a script or a style that does not come ends on a plain line with a reload button, not an endless splash.
//   5. a request that stalls during the first load says "Waiting on the connection." under the bar, and goes on when it comes.
//   6. the release build: no debug hook on the page or in the script, `?test=1&cp=` does nothing, every asset is asked
//      for with the build's version.
//   7. a killed script leaves no browser behind (tools/browser.mjs).
//
//   node --test --test-concurrency=1 tests/e2e/i4.test.mjs
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser } from '../../tools/browser.mjs';
import { ROOT, openGame, startServer } from '../harness.mjs';

const LAYOUT = JSON.parse(fs.readFileSync(path.join(ROOT, 'design/layout.json'), 'utf8'));
const STORY = JSON.parse(fs.readFileSync(path.join(ROOT, 'design/story.json'), 'utf8'));
const marker = (id) => LAYOUT.markers.find((m) => m.id === id);
const PIECE = 'i4-fixer';
const OUT = path.join(ROOT, 'shots', PIECE);
fs.mkdirSync(OUT, { recursive: true });

let server, release;
before(async () => {
  server = await startServer({});
  release = await startServer({ mode: 'build', hook: false });            // the bundle exactly as the Pages workflow makes it
});
after(async () => { await release.close(); await server.close(); });
/** ONE browser at a time on this machine: each test of the built page opens its own and closes it */
const withBrowser = async (fn) => { const browser = await launchBrowser(); try { return await fn(browser); } finally { await browser.close(); } };

const TITLE = () => document.title !== '' && (() => { const el = document.querySelector('[data-item="play"]'); return el !== null && el.offsetParent !== null; })();
const stats = (game) => game.page.evaluate(() => { const c = window.__dbg.ext.core.ctx(); const s = c.save.current; return { live: { ...c.world.stats, secrets: undefined }, saved: s ? { playSeconds: s.world.stats.playSeconds, deaths: s.world.stats.deaths } : null, stored: JSON.parse(localStorage.getItem('keepseven.save.v1') ?? 'null')?.world.stats ?? null }; });

test('the run\'s time and deaths are not rolled back with the checkpoint: a death and a restart keep both, and so does the stored save', async () => {
  const game = await openGame(server, { piece: PIECE, checkpoint: 'cp_street_clear', query: { persist: 1 } });
  try {
    await game.run([{ steps: 600 }]);                             // ten seconds of play past the checkpoint
    const a = await stats(game);
    assert.ok(a.live.playSeconds - a.saved.playSeconds > 9.5, `ten seconds were played since the save (${a.live.playSeconds} against ${a.saved.playSeconds})`);
    // a death: back on the checkpoint, with the clock where it was when she fell
    await game.dbg('setHealth', 0);
    await game.until({ state: 'playing' }, 600);
    const b = await stats(game);
    assert.equal(b.live.deaths, a.live.deaths + 1, 'one more death');
    assert.ok(b.live.playSeconds >= a.live.playSeconds, `the time was not rolled back (${b.live.playSeconds} after ${a.live.playSeconds}; it used to return to ${a.saved.playSeconds})`);
    assert.ok(b.saved.playSeconds >= a.live.playSeconds && b.saved.deaths === b.live.deaths, 'the save carries the run\'s time and deaths');
    if (b.stored) assert.ok(b.stored.playSeconds >= a.live.playSeconds && b.stored.deaths === b.live.deaths, 'and so does the stored one: a reload after a death forgets neither');
    // five more seconds, then "Restart from checkpoint": the same
    await game.run([{ steps: 300 }]);
    const c = await stats(game);
    await game.page.evaluate(async () => { const d = window.__dbg, ctx = d.ext.core.ctx(); d.pause(true); ctx.events.emit('ui/action', { action: 'restart_checkpoint' }); await d.ext.core.idle(); });
    await game.until({ state: 'playing' }, 600);
    const e = await stats(game);
    assert.ok(e.live.playSeconds >= c.live.playSeconds && c.live.playSeconds - b.live.playSeconds > 4.5, `a restart keeps the clock too (${e.live.playSeconds} after ${c.live.playSeconds})`);
    assert.equal(e.live.deaths, b.live.deaths, 'a restart is not a death');
    // what she carried is still the checkpoint's: only the two counts of the RUN are kept
    const p = await game.state();
    assert.equal(p.player.health, 100);
  } finally { await game.close(); }
});

test('story and layout data of this pass: four lines of asking, six words of roll-call, a packet at the bell post, a leave ending true of leaving', async () => {
  const T = marker('trg_enc_windlass');
  assert.deepEqual(T.params.parley, ['stn_parley_1', 'rv_ask', 'stn_parley_2', 'stn_parley_4']);
  assert.equal(STORY.lines.nar_parley, undefined, 'the narrator\'s line has left the asking');
  const roll = STORY.lines.stn_parley_2;
  assert.equal(roll.text.split(/\s+/).length, 6, 'one word a chamber');
  assert.deepEqual(roll.text.replace(/\./g, '').split(/\s+/), ['STAKE', 'STAKE', 'CANISTER', 'STAKE', 'STAKE', 'CANISTER'], 'in the order the six fire (GDD 8)');
  // the written length: three lines and three breaths to the open mouths, five seconds more to phase 1
  const held = ['stn_parley_1', 'rv_ask', 'stn_parley_2'].reduce((n, k) => n + STORY.lines[k].seconds, 0);
  assert.ok(held + 3 * 0.25 + 5 <= 18, `door to phase 1 is ${held + 0.75 + 5} s with a free line box (ruling: 17 to 18)`);
  // every line keeps the rule of its hold: 1.5 + 0.06 a character, to the half second (new and changed lines)
  for (const key of ['stn_parley_2', 'nar_dowser_down', 'hint_tamper_back', 'hint_boss_lob', 'hint_boss_pawls', 'nar_leave_2']) {
    const l = STORY.lines[key];
    assert.ok(l, key);
    assert.ok(l.text.length <= STORY.meta.rules.subtitle_max_chars, `${key} fits the subtitle`);
    const want = Math.max(2, Math.round((1.5 + 0.06 * l.text.length) * 2) / 2);
    assert.ok(Math.abs(l.seconds - want) <= 0.5, `${key}: held ${l.seconds} s (the rule gives ${want})`);
  }
  // ruling R20: the leave ending uses no line written for taking the round
  const leave = STORY.meta.rules.ending_branch.leave;
  assert.deepEqual(leave, ['nar_leave', 'nar_leave_2', 'nar_fire', 'nar_last']);
  assert.ok(!leave.some((k) => k.startsWith('nar_take')), leave.join(' '));
  assert.ok(STORY.meta.rules.never_stale.includes('nar_leave_2'));
  // the packet: in the layout, and in the game
  const pk = marker('pk_rounds_6_yard_bell');
  assert.ok(pk && pk.params.pickup === 'pk_rounds_6' && pk.zone === 'plenty_street');
  const game = await openGame(server, { piece: PIECE, checkpoint: 'cp_street_clear' });
  try {
    await game.dbg('god', true);
    await game.dbg('setAmmo', 6, 0, 0);
    const all = await game.events(0); const seq = all.length ? all.at(-1).seq : 0;
    await game.run([{ call: ['teleport', pk.pos[0], pk.pos[1], pk.pos[2] + 1.2, 0, 0] }, { steps: 2 }, { keys: ['KeyW'], steps: 50 }, { keys: [], steps: 5 }]);
    const got = (await game.events(seq, 'pickup/collected')).map((e) => e.payload);
    assert.ok(got.some((p) => p.kind === 'pk_rounds_6' && Math.hypot(p.x - pk.pos[0], p.z - pk.pos[2]) < 0.6), `the packet at the bell post is picked up (${JSON.stringify(got)})`);
    assert.equal((await game.state()).player.reserve, 6);
  } finally { await game.close(); }
});

test('a visitor without a mouse is told so before the game downloads, and may load it anyway (ruling R20)', () => withBrowser(async (browser) => {
  const context = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  try {
    // a phone: no fine pointer of any kind (the emulation's own answer is recorded below; the page is told so explicitly)
    await context.addInitScript(() => {
      const real = window.matchMedia.bind(window);
      window.__realAnyFine = real('(any-pointer: fine)').matches;
      window.matchMedia = (q) => (/any-pointer:\s*fine/.test(q) ? { matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} } : real(q));
    });
    const page = await context.newPage();
    const asked = [];
    page.on('request', (r) => { if (/\/assets\//.test(r.url())) asked.push(r.url()); });
    await page.goto(release.url);
    await page.waitForSelector('#pre-note[data-kind="input"]', { timeout: 60000 });
    const note = await page.evaluate(() => { const n = document.getElementById('pre-note'); const r = n.getBoundingClientRect(); return { text: n.querySelector('p').textContent, button: n.querySelector('button').textContent, inView: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth, input: document.documentElement.getAttribute('data-input'), preload: document.getElementById('preload') !== null, emulated: window.__realAnyFine }; });
    assert.equal(note.text, STORY.system.needs_input);
    assert.equal(note.button, STORY.system.load_anyway);
    assert.ok(note.inView, 'the notice and its button are inside a phone\'s screen');
    assert.equal(note.input, 'touch', 'the page marks itself for the UI (html[data-input="touch"])');
    assert.ok(note.preload, 'on the first screen: the name and the mark are still up');
    console.log(`touch notice: Playwright's phone emulation answers (any-pointer: fine) = ${note.emulated}`);
    await page.waitForTimeout(3000);                              // the script and the design data are in by now; nothing else is asked for
    assert.deepEqual(asked, [], 'no model and no texture is asked for behind the notice');
    await page.screenshot({ path: path.join(OUT, 'i4_touch_notice.png') });
    await page.click('#pre-note button');
    await page.waitForFunction(TITLE, null, { timeout: 180000 });
    assert.ok(asked.length > 20, `after "Load it anyway" the game loads (${asked.length} asset requests)`);
    assert.equal(await page.evaluate(() => document.getElementById('pre-note')), null, 'the notice is gone');
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-input')), 'touch', 'the mark stays for the title');
  } finally { await context.close(); }
  // a desktop gets no notice
  const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
  try {
    await page.goto(release.url);
    await page.waitForFunction(TITLE, null, { timeout: 180000 });
    assert.deepEqual(await page.evaluate(() => [document.getElementById('pre-note'), document.documentElement.getAttribute('data-input')]), [null, null]);
  } finally { await page.close(); }
}));

test('a script or a style that does not come ends on one plain line and a reload button, not an endless splash', () => withBrowser(async (browser) => {
  for (const [what, pattern] of [['script', /\/js\/index-[\w-]+\.js$/], ['style', /\/js\/index-[\w-]+\.css$/]]) {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
    try {
      let asked = 0;
      await page.route(pattern, (route) => { asked++; return route.fulfill({ status: 404, body: 'gone' }); });
      await page.goto(release.url);
      await page.waitForSelector('#pre-note[data-kind="failed"]', { timeout: 60000 });
      assert.ok(asked >= 1, `${what}: the file was asked for`);
      const note = await page.evaluate(() => { const n = document.getElementById('pre-note'); return { text: n.querySelector('p').textContent, button: n.querySelector('button').textContent, over: n.classList.contains('over'), role: n.getAttribute('role') }; });
      assert.deepEqual(note, { text: STORY.system.page_failed, button: STORY.system.page_reload, over: true, role: 'alert' }, what);
      await page.screenshot({ path: path.join(OUT, `i4_fault_${what}.png`) });
      // the button reloads; with the file back the game comes up
      await page.unroute(pattern);
      await page.click('#pre-note button');
      await page.waitForFunction(TITLE, null, { timeout: 180000 });
      assert.equal(await page.evaluate(() => document.getElementById('pre-note')), null, `${what}: no line once it has loaded`);
    } finally { await page.close(); }
  }
  // and a browser without scripts is told so by the page itself
  const html = fs.readFileSync(path.join(release.outDir, 'index.html'), 'utf8');
  assert.ok(html.includes(`<noscript><p>${STORY.system.needs_script}</p></noscript>`), 'the built page has the <noscript> line');
}));

test('a request that stalls during the first load: "Waiting on the connection." under the bar, gone when the file comes', () => withBrowser(async (browser) => {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  try {
    let release_ = null, held = 0;
    const gate = new Promise((resolve) => { release_ = resolve; });
    await page.route(/\/assets\/lm\/lm_surface\.webp/, async (route) => { held++; await gate; await route.continue(); });
    await page.goto(release.url);
    await page.waitForFunction(() => { const el = document.getElementById('flow-waiting'); return el !== null && el.style.display !== 'none'; }, null, { timeout: 120000 });
    const line = await page.evaluate(() => { const el = document.getElementById('flow-waiting'); const r = el.getBoundingClientRect(); return { text: el.textContent, inView: r.top >= 0 && r.bottom <= innerHeight, title: document.querySelector('[data-item="play"]')?.offsetParent != null }; });
    assert.equal(line.text, STORY.system.waiting);
    assert.ok(line.inView && !line.title, 'on the loading screen, inside the frame');
    assert.equal(held, 1);
    await page.screenshot({ path: path.join(OUT, 'i4_boot_waiting.png') });
    release_();
    await page.waitForFunction(TITLE, null, { timeout: 180000 });
    await page.waitForFunction(() => { const el = document.getElementById('flow-waiting'); return el === null || el.style.display === 'none'; }, null, { timeout: 30000 });
  } finally { await page.close(); }
}));

test('the release build has no debug hook on the page or in the script, ignores the hook\'s parameters, and versions every asset request', () => withBrowser(async (browser) => {
  const js = fs.readdirSync(path.join(release.outDir, 'js')).filter((f) => f.endsWith('.js'));
  assert.equal(js.length, 1, 'one script file');
  const script = fs.readFileSync(path.join(release.outDir, 'js', js[0]), 'utf8');
  for (const name of ['followPath', 'stepUntil', 'aimAtEntity', 'perfRun']) assert.equal(script.split(name).length - 1, 0, `the debug hook's "${name}" is not in the release script`);
  const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
  try {
    const assets = [];
    page.on('request', (r) => { if (/\/assets\//.test(r.url())) assets.push(r.url()); });
    // the parameters of a stepped test page: a release build reads none of them (it has a frame loop and reaches the title)
    await page.goto(release.url + '?test=1&debug=1&cp=cp_boss_p2&autostart=1&stubs=all');
    await page.waitForFunction(TITLE, null, { timeout: 180000 });
    assert.equal(await page.evaluate(() => typeof window.__dbg), 'undefined');
    const versions = new Set(assets.map((u) => new URL(u).search));
    assert.equal(versions.size, 1, `one version on every asset request (${[...versions].join(' ')})`);
    assert.match([...versions][0], /^\?v=[0-9a-f]{8}$/);
    assert.ok(assets.length > 20);
  } finally { await page.close(); }
  console.log(`release build: script ${script.length} B`);
}));

test('a script that is killed leaves no browser behind (tools/browser.mjs)', async () => {
  const child = spawn(process.execPath, [path.join(ROOT, 'tests/e2e/lib/orphan-child.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('the child never launched its browser')), 120000);
      child.stdout.on('data', (d) => { if (String(d).includes('ready')) { clearTimeout(timer); resolve(); } });
      child.on('exit', () => { clearTimeout(timer); reject(new Error('the child exited before it was ready')); });
    });
    const kids = execFileSync('pgrep', ['-P', String(child.pid)], { encoding: 'utf8' }).split('\n').filter(Boolean).map(Number);
    assert.ok(kids.length >= 1, 'the child has a browser process');
    const gone = new Promise((resolve) => child.once('exit', (code) => resolve(code)));
    child.kill('SIGTERM');
    const code = await gone;
    assert.equal(code, 143, 'it exits as a terminated process');
    const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
    for (let i = 0; i < 50 && kids.some(alive); i++) await new Promise((r) => setTimeout(r, 100));
    assert.deepEqual(kids.filter(alive), [], 'its browser went with it');
  } finally { try { child.kill('SIGKILL'); } catch { /* gone */ } }
});
