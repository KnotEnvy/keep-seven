// Shared Playwright launcher for automated playtests and screenshots.
// Headless Chromium here has no GPU: WebGL2 runs on SwiftShader (software), so
// wall-clock FPS is NOT representative. Drive the game with its deterministic
// step hook and judge performance by draw calls / triangles / CPU frame time.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

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

function patient(page) {
  page.setDefaultTimeout(PAGE_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(PAGE_TIMEOUT_MS);
  return page;
}

export async function launchBrowser(options = {}) {
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
