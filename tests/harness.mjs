// Shared test harness (ARCHITECTURE 11.3). Drives window.__dbg from Node through Playwright.
// Rules: never hardcode a port; one server per test file; batch steps inside one evaluate; screenshots at 960 x 540
// unless the test is about resolution; look at every screenshot you cite.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build, createServer, preview } from 'vite';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { grantPointerLock, launchBrowser } from '../tools/browser.mjs';

// (pass i4) for scripts that drive a page WITHOUT the debug hook through "Begin": see tools/browser.mjs
export { grantPointerLock };

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = path.join(ROOT, 'vite.config.mts');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, 'design/assets.json'), 'utf8'));
const MB = 1024 * 1024;
// precise heap numbers and gc() for the allocation test; harmless everywhere else
const JS_FLAGS = ['--js-flags=--expose-gc', '--enable-precise-memory-info'];

/**
 * Chromium's own console.error when its audio sink is starved on a busy machine (docs/requests/code-audio.md 1b): a test
 * that runs a live AudioContext for long may pass it as `openGame({ ignoreConsole: AUDIO_DEVICE_ERROR })`.
 */
export const AUDIO_DEVICE_ERROR = /The AudioContext encountered an error from the audio device or the WebAudio renderer/;

/** the six system slots, for `stubs` and `pieces` */
export const SYSTEMS = ['player', 'enemies', 'world', 'render', 'audio', 'ui'];

/** `pieces` of startServer as a list of slots, or null for 'all' (nothing replaced). */
function pieceList(pieces) {
  if (pieces === undefined || pieces === null || pieces === 'all') return null;
  const list = (Array.isArray(pieces) ? pieces : String(pieces).split(',')).map((p) => String(p).trim()).filter(Boolean);
  if (list.includes('all')) return null;
  for (const p of list) assert.ok(SYSTEMS.includes(p), `startServer: pieces: '${p}' is not a system (${SYSTEMS.join(', ')}, or 'all')`);
  return list;
}
/**
 * A Vite plugin: every import of src/<slot>/index.ts whose slot is NOT in `real` resolves to core's stand-in
 * (src/core/stubs/slots/<slot>.ts, the same factory over the core stub), in the dev server and in a build.
 */
function stubPieces(real) {
  const swap = new Map(SYSTEMS.filter((s) => !real.includes(s)).map((s) => [path.join(ROOT, 'src', s, 'index.ts'), path.join(ROOT, 'src/core/stubs/slots', s + '.ts')]));
  const replaced = new Set();
  return {
    name: 'keep7-stub-pieces', enforce: 'pre', replaced,
    resolveId(source, importer) {
      const clean = source.split('?')[0];
      let target = null;
      if (clean.startsWith('.') && importer) target = path.resolve(path.dirname(importer.split('?')[0]), clean);
      else if (clean.startsWith('/src/')) target = path.join(ROOT, clean);
      else if (path.isAbsolute(clean)) target = clean;
      const to = target ? swap.get(target) : undefined;
      if (!to) return null;
      replaced.add(path.basename(to, '.ts'));
      return to;
    },
  };
}

// Vite reads process.env.NODE_ENV while it resolves its configuration, and a dev server leaves 'development' behind:
// a build made later in the same process was then a development-flavoured bundle (import.meta.env.DEV true: the debug
// hook without ?debug=1, a missing asset synthesised instead of failing). So each mode pins the variable for its own
// configuration and puts the old value back, one at a time.
/** dev servers of this process by `pieces` (see startServer) */
const devServers = new Map();
let envQueue = Promise.resolve();
function withNodeEnv(value, fn) {
  const run = envQueue.then(async () => {
    const had = Object.prototype.hasOwnProperty.call(process.env, 'NODE_ENV'), before = process.env.NODE_ENV;
    process.env.NODE_ENV = value;
    try { return await fn(); } finally { if (had) process.env.NODE_ENV = before; else delete process.env.NODE_ENV; }
  });
  envQueue = run.catch(() => {});
  return run;
}

/**
 * Vite dev server (or, with mode 'build', a PRODUCTION build + preview) on an OS-assigned port. -> { url, mode, pieces, replaced(), close() }
 *
 * `pieces`: which of the six `src/<slot>/` modules are served or bundled from their own sources: 'all' (the default:
 * nothing is replaced) or a list / comma string of slots (`['player']`, `[]` for none). Every other slot's
 * `src/<slot>/index.ts` is replaced by core's stand-in over the core stub, so a module another builder has half written
 * cannot break your page or your production bundle. (On the dev index page `openGame`'s `stubs` already keeps the other
 * modules from being requested; `pieces` is what makes a BUILD, and a sandbox page of another slot, independent too.)
 */
export async function startServer({ mode = 'dev', pieces, hook = true } = {}) {
  const real = pieceList(pieces);
  const plugin = real ? stubPieces(real) : null;
  const plugins = plugin ? [plugin] : [];
  /** the slots whose src/<slot>/index.ts was replaced by core's stand-in at least once so far */
  const replaced = () => (plugin ? [...plugin.replaced] : []);
  if (mode === 'dev') {
    // One dev server per process for each `pieces` value, shared by every caller and closed when the last one closes
    // it: `node --test tests/<dir>/` imports all the test files of a directory into one process, and ten Vite servers
    // side by side made the first page of the run take half a minute (each transforms three's modules for itself).
    const key = real ? real.slice().sort().join(',') : 'all';
    let shared = devServers.get(key);
    if (!shared) {
      shared = { users: 0, replaced, ready: null };
      shared.ready = (async () => {
        const server = await withNodeEnv('development', () => createServer({
          configFile: CONFIG, mode: 'development', logLevel: 'warn', clearScreen: false, plugins,
          server: { host: '127.0.0.1', port: 0, strictPort: true, hmr: false, watch: null },
        }));
        await server.listen();
        return server;
      })();
      devServers.set(key, shared);
    }
    shared.users++;
    const mine = shared;
    let server;
    try { server = await mine.ready; } catch (err) { if (devServers.get(key) === mine) devServers.delete(key); throw err; }
    const { port } = server.httpServer.address();
    let closed = false;
    const close = async () => {
      if (closed) return;
      closed = true;
      if (--mine.users > 0) return;
      if (devServers.get(key) === mine) devServers.delete(key);
      await server.close();
    };
    return { url: `http://127.0.0.1:${port}/`, mode, pieces: real ?? 'all', replaced: mine.replaced, close };
  }
  // a production build of its own: test runs share this tree, and a shared dist/ (emptied by every build) would be
  // pulled from under another run's preview server
  const cache = path.join(ROOT, '.cache');
  fs.mkdirSync(cache, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cache, 'dist-'));
  const remove = () => fs.rmSync(outDir, { recursive: true, force: true });
  try {
    // (pass i4) a release build has no debug hook (vite.config.mts __KEEP7_HOOK__). The tests that step a production build
    // ask for it with `?test=1` / `?debug=1`, so a build made here HAS the hook unless `hook: false` asks for the bundle
    // exactly as the Pages workflow makes it.
    // (the variable is set INSIDE the queued job: two test files of one process ask for their builds at the same time,
    // and one with `hook: false` took the variable away from under the other's build)
    await withNodeEnv('production', async () => {
      const hadHook = Object.prototype.hasOwnProperty.call(process.env, 'KEEP7_HOOK'), hookBefore = process.env.KEEP7_HOOK;
      if (hook) process.env.KEEP7_HOOK = '1'; else delete process.env.KEEP7_HOOK;
      try {
        return await build({ configFile: CONFIG, mode: 'production', logLevel: 'error', plugins, build: { outDir, emptyOutDir: true } });
      } finally { if (hadHook) process.env.KEEP7_HOOK = hookBefore; else delete process.env.KEEP7_HOOK; }
    });
    const server = await preview({ configFile: CONFIG, logLevel: 'error', build: { outDir }, preview: { host: '127.0.0.1', port: 0, strictPort: true } });
    const { port } = server.httpServer.address();
    return {
      url: `http://127.0.0.1:${port}/`, mode, outDir, pieces: real ?? 'all', replaced,
      close: () => new Promise((resolve) => server.httpServer.close(() => { remove(); resolve(); })),
    };
  } catch (err) {
    remove();
    throw err;
  }
}

// ---- page-side script runner -------------------------------------------------------------------------------
// Serialised into the page. A script is a list of steps; a step is
//   { keys?, actions?, tap?, look?, aim?, aimAt?, aimAtEntity?, steps }
//   | { walkTo: [x, z], sprint? } | { followPath: to, sprint?, maxTicks? }
//   | { until: DebugCondition, maxSteps } | { call: [method, ...args] }
// Ticks never run while a flow job (a respawn, a restart, a warp) is pending: `steps` and `until` go through
// __dbg.ext.core.stepAsync / untilAsync, which let the job settle and then run the rest, so the tick a restore lands on
// does not depend on how a script is cut into steps. A walk that meets a job stops with reason 'dead' or 'state'.
// After every step the runner waits for the flow to be idle and yields one macrotask.
async function pageRun(script) {
  const dbg = window.__dbg;
  const core = dbg.ext.core;
  const yieldTask = () => new Promise((resolve) => { const c = new MessageChannel(); c.port1.onmessage = () => resolve(); c.port2.postMessage(0); });
  const results = [];
  for (const s of script) {
    let r;
    if (s.call) {
      const [method, ...args] = s.call;
      r = await dbg[method](...args);
    } else if (s.walkTo) {
      r = dbg.walkTo(s.walkTo[0], s.walkTo[1], { sprint: s.sprint, maxTicks: s.maxTicks, stopRadius: s.stopRadius });
    } else if (s.followPath !== undefined) {
      r = dbg.followPath(s.followPath, { sprint: s.sprint, maxTicks: s.maxTicks, stopRadius: s.stopRadius });
    } else if (s.until) {
      r = await core.untilAsync(s.until, s.maxSteps ?? 600);
    } else {
      if (s.keys) dbg.setKeys(s.keys);
      if (s.actions) dbg.setActions(s.actions);
      if (s.tap) { if (Array.isArray(s.tap)) dbg.tap(s.tap[0], s.tap[1]); else dbg.tap(s.tap); }
      if (s.look) dbg.look(s.look[0], s.look[1]);
      if (s.aim) dbg.setAim(s.aim[0], s.aim[1]);
      if (s.aimAt) dbg.aimAt(s.aimAt[0], s.aimAt[1], s.aimAt[2], s.aimAt[3]);
      if (s.aimAtEntity) { if (Array.isArray(s.aimAtEntity)) dbg.aimAtEntity(...s.aimAtEntity); else dbg.aimAtEntity(s.aimAtEntity); }
      r = await core.stepAsync(s.steps ?? 0, false);
    }
    results.push(r);
    await core.idle();
    await yieldTask();
  }
  return results;
}

class Game {
  constructor(page, browser, piece, allowErrors, ignoreConsole = null) {
    /** the Playwright page */
    this.page = page;
    this.browser = browser;
    this.piece = piece;
    this.allowErrors = allowErrors;
    this.consoleErrors = [];
    this.closed = false;
    /** console.error lines matching this are not failures (openGame `ignoreConsole`) */
    this.ignoreConsole = ignoreConsole;
    page.on('console', (msg) => { if (msg.type() === 'error' && !(this.ignoreConsole && this.ignoreConsole.test(msg.text()))) this.consoleErrors.push(msg.text()); });
    page.on('pageerror', (err) => { this.consoleErrors.push(String(err && err.stack ? err.stack : err)); });
  }
  /** await page.evaluate(([m, a]) => window.__dbg[m](...a), [method, args]) */
  dbg(method, ...args) {
    return this.page.evaluate(([m, a]) => window.__dbg[m](...a), [method, args]);
  }
  /** One evaluate for a whole script; returns the final DebugState. */
  async run(script) {
    const out = await this.page.evaluate(async ({ fn, script: steps }) => {
      // eslint-disable-next-line no-new-func
      const runner = new Function('return (' + fn + ')')();
      await runner(steps);
      return window.__dbg.state();
    }, { fn: pageRun.toString(), script });
    return out;
  }
  /** As run(), but returns each step's own result (walk results, until results) and the final state. */
  async runDetailed(script) {
    return this.page.evaluate(async ({ fn, script: steps }) => {
      // eslint-disable-next-line no-new-func
      const runner = new Function('return (' + fn + ')')();
      const results = await runner(steps);
      return { results, state: window.__dbg.state() };
    }, { fn: pageRun.toString(), script });
  }
  walkTo(x, z, options = {}) { return this.dbg('walkTo', x, z, options); }
  followPath(to, options = {}) { return this.dbg('followPath', to, options); }
  /** n ticks, across a respawn or any other flow job (see pageRun); `__dbg.step` itself stops at one. */
  step(n = 1, render = false) { return this.page.evaluate(([a, b]) => window.__dbg.ext.core.stepAsync(a, b), [n, render]); }
  /** stepUntil across flow jobs: { tick, simTime, state, met, steps } */
  until(condition, maxSteps = 600) { return this.page.evaluate(([c, m]) => window.__dbg.ext.core.untilAsync(c, m), [condition, maxSteps]); }
  state() { return this.dbg('state'); }
  perf() { return this.dbg('perf'); }
  events(sinceSeq = 0, name) { return this.dbg('events', sinceSeq, name); }

  shotDir() {
    const dir = path.join(ROOT, 'shots', this.piece);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
  /** step(0, true) then page.screenshot -> shots/<piece>/<name>.png; returns the path */
  async shot(name) {
    await this.dbg('step', 0, true);
    const file = path.join(this.shotDir(), name + '.png');
    // under SwiftShader a screenshot waits for the rasteriser's queue: on a loaded machine 30 s (Playwright's default) is not enough
    await this.page.screenshot({ path: file, timeout: 120000 });
    return file;
  }
  /**
   * steps: [{ name, script? }]. Runs each script (as run()) and captures a frame, all inside ONE evaluate through
   * __dbg.capture() (canvas only: no HUD), then writes the PNGs to shots/<piece>/. With dom: true it takes
   * page.screenshot per step instead (HUD included, one round trip each). Returns the paths.
   */
  async shotSeries(steps, { dom = false } = {}) {
    const dir = this.shotDir();
    const paths = [];
    if (dom) {
      for (const s of steps) {
        if (s.script) await this.run(s.script);
        paths.push(await this.shot(s.name));
      }
      return paths;
    }
    const urls = await this.page.evaluate(async ({ fn, steps: list }) => {
      // eslint-disable-next-line no-new-func
      const runner = new Function('return (' + fn + ')')();
      const out = [];
      for (const s of list) {
        if (s.script) await runner(s.script);
        out.push(window.__dbg.capture());
      }
      return out;
    }, { fn: pageRun.toString(), steps });
    for (let i = 0; i < steps.length; i++) {
      const file = path.join(dir, steps[i].name + '.png');
      fs.writeFileSync(file, Buffer.from(urls[i].replace(/^data:image\/png;base64,/, ''), 'base64'));
      paths.push(file);
    }
    return paths;
  }
  /** [r, g, b] of the last frame (for display-target checks) */
  async pixel(x, y) {
    const url = await this.page.evaluate(() => window.__dbg.capture());
    const png = PNG.sync.read(Buffer.from(url.replace(/^data:image\/png;base64,/, ''), 'base64'));
    const i = (Math.floor(y) * png.width + Math.floor(x)) * 4;
    return [png.data[i], png.data[i + 1], png.data[i + 2]];
  }
  /** Closes the browser; throws if __dbg.error or any console.error occurred (unless allowErrors). */
  async close() {
    if (this.closed) return;
    this.closed = true;
    let hookError = null;
    try { hookError = await this.page.evaluate(() => (window.__dbg ? window.__dbg.error : 'window.__dbg is missing')); } catch { /* the page is gone */ }
    await this.browser.close();
    if (this.allowErrors) return;
    if (hookError) throw new Error('__dbg.error: ' + hookError);
    if (this.consoleErrors.length) throw new Error('console.error: ' + this.consoleErrors.slice(0, 5).join('\n'));
  }
}

/**
 * Launches Chromium through tools/browser.mjs, loads ?test=1, waits for __dbg.ready, calls __dbg.start({ checkpoint })
 * when start is true. -> Game
 *
 * `stubs` (index page only): which slots keep their CORE STUB instead of src/<piece>/index.ts: 'all', a list
 * (['world', 'enemies'] or 'world,enemies'), or null for none (every slot is the piece's own system: the integrator's
 * run). LEFT OUT, the safe choice is made from `piece`: 'code-<slot>' (code-player, code-enemies, code-world,
 * code-render, code-audio, code-ui) gets `othersThan('<slot>')`, its own system beside five core stubs, so a builder's
 * test never loads the five modules other builders are editing; any other piece gets none, as before.
 */
export async function openGame(server, {
  page = 'index',               // 'index' | 'sandbox/<piece>' | 'sandbox/viewer'
  piece,                        // required: names the shots/<piece>/ folder
  tier = 'low', seed = 1, checkpoint = null, start = (page === 'index'), stubs,
  query = {}, viewport = { width: 960, height: 540 }, allowErrors = false,
  ignoreConsole = null,         // a RegExp: console.error lines that are the machine's, not the game's (AUDIO_DEVICE_ERROR)
} = {}) {
  assert.ok(piece, 'openGame: `piece` is required (it names the shots/<piece>/ folder)');
  if (stubs === undefined) stubs = page === 'index' ? defaultStubs(piece) : null;
  const browser = await launchBrowser({ args: JS_FLAGS });
  const tab = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  const game = new Game(tab, browser, piece, allowErrors, ignoreConsole);
  const params = new URLSearchParams({ test: '1', tier, seed: String(seed), ...Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)])) });
  const stubList = Array.isArray(stubs) ? stubs.join(',') : stubs;
  if (stubList) {
    assert.equal(page, 'index', 'openGame: `stubs` is for the index page; a sandbox page already runs beside the core stubs');
    params.set('stubs', stubList);
  }
  const file = page === 'index' ? '' : page + '.html';
  // a page whose script cannot load never sets __dbg: fail on the failed request instead of waiting out the timeout
  let broken = null;
  const onBroken = (what) => { if (!broken) broken = what; };
  tab.on('response', (res) => {
    const type = res.request().resourceType();
    if (res.status() >= 400 && (type === 'script' || type === 'document')) onBroken(`${res.status()} for ${res.url()}`);
  });
  tab.on('requestfailed', (req) => { if (req.resourceType() === 'script' || req.resourceType() === 'document') onBroken(`${req.failure()?.errorText ?? 'failed'} for ${req.url()}`); });
  tab.on('pageerror', (err) => onBroken(String(err && err.message ? err.message : err)));
  try {
    await tab.goto(server.url + file + '?' + params.toString(), { timeout: 120000 });   // the ready wait below is 120 s too (tools/browser.mjs PAGE_TIMEOUT_MS covers every other action)
    const deadline = Date.now() + 120000;
    let brokenAt = 0;
    for (;;) {
      const done = await tab.evaluate(() => Boolean(window.__dbg && (window.__dbg.ready === true || window.__dbg.error)));
      if (done) break;
      // a module that failed to load or threw at import: give the page two seconds to report through __dbg.error itself
      if (broken && brokenAt === 0) brokenAt = Date.now();
      if (broken && Date.now() - brokenAt > 2000) throw new Error('the page did not boot: ' + broken);
      if (Date.now() > deadline) throw new Error('the page did not set window.__dbg.ready within 120 s');
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    const failed = await tab.evaluate(() => (window.__dbg.ready ? null : window.__dbg.error));
    if (failed) throw new Error('the page failed to boot: ' + failed);
    if (start) await tab.evaluate((cp) => window.__dbg.start(cp ? { checkpoint: cp } : {}), checkpoint);
  } catch (err) {
    const log = game.consoleErrors.slice(0, 5).join('\n');
    await browser.close();
    game.closed = true;
    throw new Error(`${err && err.message ? err.message : err}${log ? '\nconsole: ' + log : ''}`);
  }
  return game;
}

/** What `openGame` uses when `stubs` is left out: the other five slots for a 'code-<slot>' piece, none otherwise. */
export function defaultStubs(piece) {
  const slot = /^code-(.+)$/.exec(String(piece))?.[1];
  return slot && SYSTEMS.includes(slot) ? SYSTEMS.filter((s) => s !== slot) : null;
}

/** Every slot but the named ones: `openGame(server, { piece: 'code-player', stubs: othersThan('player') })`. */
export function othersThan(...real) {
  for (const r of real) assert.ok(SYSTEMS.includes(r), `othersThan: '${r}' is not a system`);
  return SYSTEMS.filter((s) => !real.includes(s));
}

/** startServer + openGame + fn(game) + close; always cleans up. */
export async function withGame(options, fn) {
  const server = await startServer({ mode: options.mode ?? 'dev' });
  let game = null;
  try {
    game = await openGame(server, options);
    const result = await fn(game);
    await game.close();
    return result;
  } catch (err) {
    if (game && !game.closed) { try { await game.browser.close(); } catch { /* already closed */ } game.closed = true; }
    throw err;
  } finally {
    await server.close();
  }
}

/**
 * Bytes allocated per tick by a code path, measured the one way every piece uses (ARCHITECTURE 8.6: at most 6 KB per
 * tick): warm the path up, then `batches` times: gc(), read usedJSHeapSize, run the body for `perBatch` ticks, read
 * again. The median batch is the figure. (Chromium is launched by this harness with --expose-gc and precise memory.)
 *
 * `body(dbg, ticks, arg)` runs INSIDE THE PAGE (it is serialised: no closures) and must run exactly `ticks` ticks of
 * the path, e.g. `(dbg, n) => dbg.step(n, false)` or, with a frame per tick, `(dbg, n) => { for (let i = 0; i < n; i++) dbg.step(1, true); }`.
 * Use the synchronous dbg.step here: a death inside a measured batch is not a steady state.
 *
 * Options: `warm` ticks of the body before measuring (default 3000: below that the figure is JIT and inline-cache
 * warm-up, not the path: a tick plus a frame reads 6.8 KB after 300 and 1.8 KB after 3000), `batches` (10), `perBatch`
 * (60: small enough that no scavenge falls inside a batch), `ring` (false: the debug event ring is switched off for
 * the measured span, because it clones every payload and a production build has no ring), `arg` (passed to the body).
 * -> { perTick, samples, warm, batches, perBatch }
 */
export async function measureAlloc(game, body, { warm = 3000, batches = 10, perBatch = 60, ring = false, arg = null } = {}) {
  const samples = await game.page.evaluate(({ fn, warm: warmTicks, batches: count, perBatch: n, ring: ringOn, arg: a }) => {
    const dbg = window.__dbg;
    if (typeof gc !== 'function') throw new Error('measureAlloc: gc() is not exposed (open the page through tests/harness.mjs)');
    // eslint-disable-next-line no-new-func
    const run = new Function('return (' + fn + ')')();
    dbg.ext.core.recordEvents(ringOn);
    try {
      for (let left = warmTicks; left > 0; left -= n) run(dbg, Math.min(n, left), a);
      const out = [];
      for (let b = 0; b < count; b++) {
        gc();
        const h0 = performance.memory.usedJSHeapSize;      // a snapshot object: re-read the property each time
        run(dbg, n, a);
        out.push((performance.memory.usedJSHeapSize - h0) / n);
      }
      return out;
    } finally { dbg.ext.core.recordEvents(true); }
  }, { fn: body.toString(), warm, batches, perBatch, ring, arg });
  const sorted = samples.slice().sort((x, y) => x - y);
  return { perTick: sorted[sorted.length >> 1], samples, warm, batches, perBatch };
}

/**
 * Measured draw calls and triangles against design/assets.json: zones[zone].drawCalls.typical (or .worst) and
 * zones[zone].triangles (everything the visibility cells allow while the player is in that zone), and against
 * tiers[tier]'s caps; perf.textureBytes + perf.renderTargetBytes against tiers[tier].textureBudgetMB.
 */
export function assertBudget(perf, { zone, tier = 'low', worst = false } = {}) {
  const t = MANIFEST.tiers[tier];
  assert.ok(t, `assertBudget: unknown tier '${tier}'`);
  const z = zone ? MANIFEST.zones[zone] : null;
  if (zone) assert.ok(z, `assertBudget: unknown zone '${zone}'`);
  const where = `${zone ?? 'no zone'}, ${tier}${perf.cell ? ', cell ' + perf.cell : ''}`;
  const tierCalls = worst ? t.drawCalls.worst : t.drawCalls.typical;
  assert.ok(perf.drawCalls <= tierCalls, `draw calls ${perf.drawCalls} > tier cap ${tierCalls} (${where})`);
  assert.ok(perf.triangles <= t.triangles, `triangles ${perf.triangles} > tier cap ${t.triangles} (${where})`);
  if (z) {
    const zoneCalls = worst ? z.drawCalls.worst : z.drawCalls.typical;
    assert.ok(perf.drawCalls <= zoneCalls, `draw calls ${perf.drawCalls} > the zone's computed ${worst ? 'worst' : 'typical'} ${zoneCalls} (${where})`);
    assert.ok(perf.triangles <= z.triangles, `triangles ${perf.triangles} > the zone's computed ${z.triangles} (${where})`);
  }
  const mb = (perf.textureBytes + perf.renderTargetBytes) / MB;
  assert.ok(mb <= t.textureBudgetMB, `textures + render targets ${mb.toFixed(1)} MiB > ${t.textureBudgetMB} (${where})`);
}

/** pixelmatch -> differing pixel count */
export function comparePng(pathA, pathB, { threshold = 0.05 } = {}) {
  const a = PNG.sync.read(fs.readFileSync(pathA)), b = PNG.sync.read(fs.readFileSync(pathB));
  assert.equal(a.width, b.width, 'comparePng: widths differ');
  assert.equal(a.height, b.height, 'comparePng: heights differ');
  return pixelmatch(a.data, b.data, null, a.width, a.height, { threshold });
}
