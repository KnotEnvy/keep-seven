// Pass i5 (UI), beside the core stubs (sandbox/ui.html). One issue:
//   1. visual reviewer b (minor): being hit was drawn as "flat, hard-edged cream rectangles that look like UI meters or
//      a loading bar". The side of the frame a hit came from is now a soft flare of warm red-violet over an ink bruise:
//      no edge anywhere in it, deepest at the middle of the side, fading over about half a second; the arc is kept.
// The same in the real game (the reviewer's place on the street) is in i5_real.test.mjs.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { ROOT } from '../harness.mjs';
import { openSandbox, press, serve } from './util.mjs';

const OUT = path.join(ROOT, 'shots', 'i5-team-ui');
fs.mkdirSync(OUT, { recursive: true });
let server;
before(async () => { server = await serve(); });
after(async () => { await server.close(); });

const run = (game, ticks) => game.page.evaluate(async (t) => { await window.__dbg.ext.core.stepAsync(t, false); await window.__dbg.ext.core.stepAsync(0, true); }, ticks);
const grab = async (game, name) => PNG.sync.read(await game.page.screenshot(name ? { path: path.join(OUT, name + '.png') } : {}));
const px = (p, x, y) => { const i = (y * p.width + x) * 4; return [p.data[i], p.data[i + 1], p.data[i + 2]]; };
/** the largest change of any channel between neighbouring pixels of (hit - plain), over a box: an edge drawn by the hit */
function hardest(plain, hit, x0, y0, x1, y1) {
  let worst = 0, at = '';
  const d = (x, y, c) => hit.data[(y * hit.width + x) * 4 + c] - plain.data[(y * plain.width + x) * 4 + c];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) for (let c = 0; c < 3; c++) {
    const v = d(x, y, c), a = Math.abs(v - d(x + 1, y, c)), b = Math.abs(v - d(x, y + 1, c));
    if (a > worst) { worst = a; at = `${x},${y}`; }
    if (b > worst) { worst = b; at = `${x},${y}`; }
  }
  return { worst, at };
}
const edges = (game) => game.page.evaluate(() => { const e = {}; for (const i of document.querySelectorAll('.k7 .hurt i')) { const c = getComputedStyle(i); e[i.className.split(' ')[0]] = c.display === 'none' ? 0 : Number(c.opacity); } return e; });

test('being hit: the side it came from is a soft red-violet flare with no edge in it (no bar), deepest mid-side, gone in under a second; the arc is kept', async () => {
  const game = await openSandbox(server);
  try {
    await press(game, 'state/play');
    for (const bg of ['glare', 'dark']) {
      await press(game, 'variant/bg ' + bg);
      await run(game, 5);
      const plain = await grab(game);
      await press(game, 'hit/heavy 90');
      await run(game, 1);
      const hit = await grab(game, `flare_${bg}_heavy_right`);
      // nothing in the right third of the frame is an edge: pass i4's bar stepped by 150 and more of 255 from one pixel to the next
      const h = hardest(plain, hit, 860, 4, 1278, 716);
      assert.ok(h.worst <= 14, `${bg}: the flare has no edge (the hardest step it draws is ${h.worst} of 255 at ${h.at})`);
      // it is there, and it is warm red-violet at the frame's edge: red over blue over green
      const was = px(plain, 1274, 360), is = px(hit, 1274, 360);
      const change = Math.abs(is[0] - was[0]) + Math.abs(is[1] - was[1]) + Math.abs(is[2] - was[2]);
      assert.ok(change > 120, `${bg}: unmistakable at the edge (${was} -> ${is})`);
      assert.ok(is[0] > is[2] + 25 && is[2] > is[1] + 15 && is[0] > 140, `${bg}: warm red-violet (${is})`);
      // feathered inward: less a tenth of the frame in, nothing at the middle of the frame
      const mid = (x, y) => { const a = px(plain, x, y), b = px(hit, x, y); return Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]) + Math.abs(b[2] - a[2]); };
      assert.ok(mid(1150, 360) < change * 0.6 && mid(760, 200) <= 3, `${bg}: feathered inward (${change} at the edge, ${mid(1150, 360)} at 130 px in, ${mid(760, 200)} mid-frame)`);
      // a lobe, not a band: deepest at the middle of the side, far less at its ends
      assert.ok(mid(1274, 12) < change * 0.45 && mid(1274, 708) < change * 0.45, `${bg}: tapering toward the corners (${mid(1274, 12)} / ${change} / ${mid(1274, 708)})`);
      // the other three sides are untouched, and the arc stands beside the crosshair
      assert.ok(mid(6, 360) <= 3 && mid(640, 6) <= 3 && mid(640, 714) <= 3, `${bg}: only the side it came from`);
      assert.equal(await game.page.evaluate(() => document.querySelectorAll('.k7 .xh path.arc.on:not(.ink)').length), 1, 'the arc is kept');
      // whole for a third of a second, then down over about half a second, on the fixed tick
      await run(game, 20);
      assert.equal((await edges(game)).r, 1, 'whole at 0.35 s');
      await run(game, 15);
      const going = (await edges(game)).r;
      assert.ok(going > 0.4 && going < 0.75, `going at 0.6 s (${going})`);
      await run(game, 20);
      assert.equal((await edges(game)).r, 0, 'gone at 0.95 s');
      const after = await grab(game);
      assert.ok(hardest(plain, after, 860, 4, 1278, 716).worst <= 2, 'and the frame is as it was');
      await run(game, 30);
    }
    // a hit with no direction: all four sides, and still not the whole screen
    await press(game, 'variant/bg mid');
    await run(game, 5);
    const plain = await grab(game);
    await press(game, 'hit/no direction (a fall)');
    await run(game, 1);
    const all = await grab(game, 'flare_mid_no_direction');
    const d = (x, y) => { const a = px(plain, x, y), b = px(all, x, y); return Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]) + Math.abs(b[2] - a[2]); };
    assert.ok(d(6, 360) > 40 && d(1274, 360) > 40 && d(640, 6) > 40 && d(640, 714) > 40, 'all four sides');
    assert.ok(d(500, 250) <= 12 && d(780, 470) <= 12 && d(640, 300) <= 12, `never the whole screen: the middle keeps its picture (of 765: (${d(500, 250)}, ${d(780, 470)})`);
    const style = await game.page.evaluate(() => { const e = document.querySelector('.k7 .hurt'), c = getComputedStyle(e); return [c.pointerEvents, getComputedStyle(e.querySelector('i'), '::after').content, getComputedStyle(e.querySelector('i')).backgroundColor]; });
    assert.deepEqual(style, ['none', 'none', 'rgba(0, 0, 0, 0)'], 'it takes no click, and nothing in it is filled');
  } finally { await game.close(); }
});
