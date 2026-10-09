// Pass i5 (UI), in the REAL game (all six systems, final assets). One browser, one short leg from a checkpoint; no
// assertion waits on the wall clock.
//   1. visual reviewer b (minor): 30 damage from the front-left on the street (the reviewer's own place and hit:
//      shots/i5-visual-b/hit_sheet.png) drew cream bars on the top and left of the frame "that read like progress
//      bars". Now: a soft red-violet flare on those two sides, no bar, the arc kept, gone inside a second.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { ROOT, startServer } from '../harness.mjs';
import { openBot } from '../e2e/lib/bot.mjs';

const OUT = path.join(ROOT, 'shots', 'i5-team-ui');
fs.mkdirSync(OUT, { recursive: true });
const VP = { width: 1280, height: 720 };
const TIER = process.env.KEEP7_I5_TIER || 'low';
const step = (page, n, render = false) => page.evaluate(([k, r]) => window.__dbg.ext.core.stepAsync(k, r), [n, render]);
const grab = async (page, name) => PNG.sync.read(await page.screenshot({ path: path.join(OUT, name + '.png') }));
/** mean [R, G, B] of a box */
function mean(p, x0, y0, x1, y1) {
  const s = [0, 0, 0];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * p.width + x) * 4; s[0] += p.data[i]; s[1] += p.data[i + 1]; s[2] += p.data[i + 2]; }
  const n = (x1 - x0) * (y1 - y0);
  return s.map((v) => v / n);
}
const luma = (c) => (c[0] + c[1] + c[2]) / 3;
/** the hardest step of the mean luma from one line to the next, going inward from a side (lines of a box averaged along the side) */
function hardestLine(p, side) {
  let worst = 0, last = -1;
  for (let k = 1; k < 90; k++) {
    const v = luma(side === 't' ? mean(p, 420, k, 860, k + 1) : mean(p, k, 300, k + 1, 520));   // (the left box is below the objective's words and above the mark)
    if (last >= 0 && Math.abs(v - last) > worst) worst = Math.abs(v - last);
    last = v;
  }
  return worst;
}

test(`real game (${TIER}), the street: 30 from the front-left is a soft red-violet flare on the top and the left of the frame, with no bar; the arc is kept`, async () => {
  const server = await startServer({});
  const bot = await openBot(server, { piece: 'i5-team-ui', tier: TIER, viewport: VP, checkpoint: 'cp_street_clear' });
  try {
    const page = bot.page;
    await page.evaluate(async () => {
      const d = window.__dbg;
      d.god(true); d.aiEnabled(false); d.killAll(true);
      await d.ext.core.stepAsync(120, false);
      for (let i = 0; i < 2; i++) { d.teleport(-30, 0, 0); d.aimAt(-60, 1.5, 0); await d.ext.core.stepAsync(20, true); }
      d.god(false);
    });
    await step(page, 0, true);
    const plain = await grab(page, `real_${TIER}_street_before`);
    await page.evaluate(() => window.__dbg.ext.core.damage(30, 'melee', 'enemy', -33, 1.2, 2));
    const frames = {};
    const up = () => page.evaluate(() => { const e = {}; for (const i of document.querySelectorAll('.k7 .hurt i')) { const c = getComputedStyle(i); if (c.display !== 'none') e[i.className.split(' ')[0]] = Number(c.opacity); } return e; });
    let sides = null, arcs = [];
    const arcsUp = () => page.evaluate(() => [...document.querySelectorAll('.k7 .xh path.arc.on:not(.ink)')].map((a) => { const r = a.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; }));
    let at = 0;
    for (const t of [1, 4, 10, 25, 40, 60]) { await step(page, t - at, true); at = t; frames[t] = await grab(page, `real_${TIER}_street_hit_t${String(t).padStart(2, '0')}`); if (t === 4) { sides = await up(); arcs = await arcsUp(); } }
    assert.deepEqual(sides, { t: 1, l: 1 }, 'the top and the left, whole');
    const hit = frames[4];
    // the two sides: darker, and redder (red over green) than the same frame before the hit
    for (const [side, box] of [['top', [420, 2, 860, 26]], ['left', [2, 300, 26, 520]]]) {
      const a = mean(plain, ...box), b = mean(hit, ...box);
      // (the bright sky is bruised darker; the dark wall on the left is lit by the flare instead: that is how it shows on both)
      if (luma(a) > 120) assert.ok(luma(b) < luma(a) * 0.8, `${side}: the side is bruised (${luma(a).toFixed(0)} -> ${luma(b).toFixed(0)})`);
      assert.ok(b[0] - b[1] > a[0] - a[1] + 25 && b[0] > b[2] && b[2] > b[1], `${side}: warm red-violet (${a.map((v) => v.toFixed(0))} -> ${b.map((v) => v.toFixed(0))})`);
    }
    // no bar: pass i4's stood 13 px in, pale (over 200) between ink lines (a step of 150 and more from one line to the next)
    const steps = { t: hardestLine(hit, 't'), l: hardestLine(hit, 'l'), tWas: hardestLine(plain, 't'), lWas: hardestLine(plain, 'l') };
    assert.ok(steps.t <= steps.tWas + 10 && steps.l <= steps.lWas + 10, `no line is drawn on either side (hardest step inward, of 255: ${JSON.stringify(steps)})`);
    const bar = luma(mean(hit, 420, 14, 860, 19));
    assert.ok(bar < luma(mean(plain, 420, 14, 860, 19)), `where the bar stood the frame is darker, not paler (${bar.toFixed(0)})`);
    // the other two sides are left alone, and the arc stands up and to the left of the crosshair
    const r0 = luma(mean(plain, 1254, 250, 1278, 470)), r1 = luma(mean(hit, 1254, 250, 1278, 470));
    assert.ok(Math.abs(r1 - r0) < 12, `the right side is as it was (${r0.toFixed(0)} -> ${r1.toFixed(0)})`);
    assert.ok(arcs.length === 1 && arcs[0][0] < 640 && arcs[0][1] < 360, `the arc is kept (${JSON.stringify(arcs)})`);
    // fading over about half a second: weaker at 40 ticks than at 4, nothing at 60
    const top = (p) => { const c = mean(p, 420, 2, 860, 26); return c[0] - c[1]; };
    assert.ok(top(frames[40]) < top(hit) - 10, `going at 0.67 s (${top(hit).toFixed(0)} -> ${top(frames[40]).toFixed(0)})`);
    const edges = await page.evaluate(() => [...document.querySelectorAll('.k7 .hurt i')].filter((i) => getComputedStyle(i).display !== 'none').length);
    assert.equal(edges, 0, 'gone a second after the hit');
    console.log(`real ${TIER} street: top ${mean(plain, 420, 2, 860, 26).map((v) => v.toFixed(0))} -> ${mean(hit, 420, 2, 860, 26).map((v) => v.toFixed(0))}; left ${mean(plain, 2, 300, 26, 520).map((v) => v.toFixed(0))} -> ${mean(hit, 2, 300, 26, 520).map((v) => v.toFixed(0))}; hardest step ${JSON.stringify(steps)}`);
  } finally { await bot.close().catch(() => {}); await server.close(); }
});
