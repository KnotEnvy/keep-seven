// Shared Playwright launcher for automated playtests and screenshots.
// Headless Chromium here has no GPU: WebGL2 runs on SwiftShader (software), so
// wall-clock FPS is NOT representative. Drive the game with its deterministic
// step hook and judge performance by draw calls / triangles / CPU frame time.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIB = path.join(ROOT, '.tools/syslibs/usr/lib/x86_64-linux-gnu');

export const GL_ARGS = [
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--autoplay-policy=no-user-gesture-required',
  '--mute-audio',
];

/**
 * Default timeout of every page action (goto, click, waitFor*) on a page of a browser launched here. Playwright's own
 * default is 30 s: on this shared machine, at load 60 to 90, a page.goto or a click on the title menu took longer and a
 * suite failed that was not broken (polish round 3, robustness). A call that names its own timeout keeps it.
 */
export const PAGE_TIMEOUT_MS = 120000;

// ---- a killed script must not leave Chromium behind (pass i4, robustness) ---------------------------------------------
// A suite cut off by a time limit (`timeout 595 node --test tests/render/`) left 62 headless-shell processes: the signal
// reaches the test runner, the runner's child (this process) is orphaned or killed without closing its browsers, and on
// this machine that is how an earlier run ran out of memory. Every script that launches a browser goes through this
// file, so the guard lives here: on SIGTERM / SIGINT / SIGHUP, and when the parent process goes away, every child of
// this process (the browsers and any build worker) is killed and the process exits.
let guarded = false;
function killChildren() {
  try { execFileSync('pkill', ['-KILL', '-P', String(process.pid)], { stdio: 'ignore' }); } catch { /* no children, or no pkill */ }
}
function guardOrphans() {
  if (guarded) return;
  guarded = true;
  const numbers = { SIGHUP: 1, SIGINT: 2, SIGTERM: 15 };
  for (const [signal, n] of Object.entries(numbers)) {
    process.once(signal, () => { killChildren(); process.exit(128 + n); });
  }
  const parent = process.ppid;
  const watch = setInterval(() => { if (process.ppid !== parent) { killChildren(); process.exit(1); } }, 2000);
  watch.unref();
}

/**
 * Headless Chromium answers a REAL pointer lock with a flood of synthetic mouse events (83 000 in 1.5 s of play: the
 * performance reviewer of pass i4): the main thread is 95 % busy, a major GC runs every 1.3 s and the page grows to
 * several GB. Any script that clicks "Begin" on a page WITHOUT the debug hook (the release build) must call this on the
 * page or its context first: the lock is granted by the page itself, with the same events a browser sends, and no mouse
 * event is made up. (`?test=1` pages never take a real lock: nothing to do there.)
 */
export async function grantPointerLock(pageOrContext, { delayMs = 30 } = {}) {
  await pageOrContext.addInitScript((ms) => {
    let held = null;
    const changed = () => document.dispatchEvent(new Event('pointerlockchange'));
    // The grant comes on a LATER TASK, as a browser's does (it asks its own process first). A grant inside the click's
    // own task (a microtask) is something no browser does, and the game is not built for it: the lock was then held
    // before "Begin" had left the title, the UI let it go again as the story sheet opened, and the run ended on the
    // click-to-resume plate (found with this shim's first version: scratch/i4-fixer/lockdbg2.mjs).
    Element.prototype.requestPointerLock = function requestPointerLock() { const el = this; setTimeout(() => { held = el; changed(); }, ms); return Promise.resolve(); };
    Object.defineProperty(Document.prototype, 'pointerLockElement', { configurable: true, get() { return held; } });
    Document.prototype.exitPointerLock = function exitPointerLock() { if (held) { held = null; setTimeout(changed, 0); } };
  }, delayMs);
}

function patient(page) {
  page.setDefaultTimeout(PAGE_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(PAGE_TIMEOUT_MS);
  return page;
}

export async function launchBrowser(options = {}) {
  guardOrphans();
  const browser = await launchRaw(options);
  const newPage = browser.newPage.bind(browser), newContext = browser.newContext.bind(browser);
  browser.newPage = async (o) => patient(await newPage(o));
  browser.newContext = async (o) => {
    const context = await newContext(o);
    context.setDefaultTimeout(PAGE_TIMEOUT_MS);
    context.setDefaultNavigationTimeout(PAGE_TIMEOUT_MS);
    return context;
  };
  return browser;
}

function launchRaw(options) {
  return chromium.launch({
    headless: true,
    ...options,
    args: [...GL_ARGS, ...(options.args ?? [])],
    env: {
      ...process.env,
      LD_LIBRARY_PATH: LIB + ':' + (process.env.LD_LIBRARY_PATH ?? ''),
      ...(options.env ?? {}),
    },
  });
}
