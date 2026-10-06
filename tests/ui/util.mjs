// Shared by the browser tests of tests/ui: one dev server that serves only src/ui from its own sources, page openers,
// and the page-side helpers every file needs. (docs/workorders/code-ui.md section 6.)
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { ROOT, openGame, startServer } from '../harness.mjs';

export const PIECE = 'code-ui';
export const STORY = JSON.parse(fs.readFileSync(path.join(ROOT, 'design/story.json'), 'utf8'));
export const SHOTS = path.join(ROOT, 'shots', PIECE);
fs.mkdirSync(SHOTS, { recursive: true });

export const serve = () => startServer({ pieces: ['ui'] });
/** the index page: the real UI beside five core stubs; `start: false` stays on the title */
export const openIndex = (server, options = {}) => openGame(server, { piece: PIECE, viewport: { width: 1280, height: 720 }, ...options });
/** sandbox/ui.html: a run in play over a gradient, with the `__dbg.ext.uisb` buttons */
export const openSandbox = (server, options = {}) => openGame(server, { page: 'sandbox/ui', piece: PIECE, start: false, viewport: { width: 1280, height: 720 }, ...options });

/** press a sandbox button by 'group/label' */
export const press = (game, name) => game.page.evaluate((n) => window.__dbg.ext.uisb.run(n), name);
/** the UI system's debugState() */
export const uiState = (game) => game.page.evaluate(() => window.__dbg.state().systems.ui);
/** emit, then draw one frame (update runs once per rendered frame) */
export const emit = (game, name, payload, ticks = 0) => game.page.evaluate(([n, p, t]) => { window.__dbg.emit(n, p); window.__dbg.step(t, true); }, [name, payload, ticks]);
export const frame = (game, ticks = 0) => game.page.evaluate((t) => window.__dbg.ext.core.stepAsync(t, true), ticks);

/** hold every CSS animation of the page at `ms` into its run (finished ones at their end), so a screenshot is repeatable */
export const freeze = (game, ms = 1000) => game.page.evaluate((t) => {
  for (const a of document.getAnimations()) { a.pause(); try { a.currentTime = t; } catch { /* a finished transition */ } }
}, ms);

/** a PNG of one element's box (padded), written to shots/code-ui/<name>.png */
export async function clip(game, selector, name, pad = 4) {
  const box = await game.page.evaluate(([sel, p]) => {
    const r = document.querySelector(sel).getBoundingClientRect();
    return { x: Math.max(0, Math.floor(r.left - p)), y: Math.max(0, Math.floor(r.top - p)), width: Math.ceil(r.width + 2 * p), height: Math.ceil(r.height + 2 * p) };
  }, [selector, pad]);
  const file = path.join(SHOTS, name + '.png');
  await game.page.screenshot({ path: file, clip: box });
  return file;
}
/** differing pixels between two PNG files of the same size */
export function diff(a, b) {
  const pa = PNG.sync.read(fs.readFileSync(a)), pb = PNG.sync.read(fs.readFileSync(b));
  if (pa.width !== pb.width || pa.height !== pb.height) return pa.width * pa.height;
  return pixelmatch(pa.data, pb.data, null, pa.width, pa.height, { threshold: 0.02 });
}
