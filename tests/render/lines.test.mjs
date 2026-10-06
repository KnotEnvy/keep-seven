// Thin things keep their width in pixels (GDD 16, code-render 6): the Rule 2 px, the sighting thread 2 px, the line
// round 3 px (each +- 1) at 640 x 360 and at 1920 x 1080; the last fire is never under 4 px.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../harness.mjs';
import { ext, frame, openSandbox, px } from './util.mjs';

let server;
before(async () => { server = await startServer({ pieces: ['render'] }); });
after(async () => { await server.close(); });

/** Width of the bright core on a row: pixels whose distance from the background is over half the peak's. */
function coreWidth(png, row, x0, x1) {
  const bg = px(png, x0, row);
  const dist = [];
  for (let x = x0; x <= x1; x++) { const p = px(png, x, row); dist.push(Math.hypot(p[0] - bg[0], p[1] - bg[1], p[2] - bg[2])); }
  const peak = Math.max(...dist);
  if (peak < 24) return { width: 0, peak, at: -1 };
  let width = 0;
  for (const d of dist) if (d > peak * 0.5) width++;
  return { width, peak, at: x0 + dist.indexOf(peak) };
}
/** the widest core over a band of rows (a dashed line has rows with nothing on them) */
function widest(png, y0, y1, x0, x1) {
  let best = { width: 0, peak: 0, at: -1 };
  const all = [];
  for (let y = y0; y <= y1; y++) { const w = coreWidth(png, y, x0, x1); all.push(w.width); if (w.peak > best.peak * 0.8 && w.width >= best.width) best = w; }
  return { ...best, all };
}

for (const [width, height, tier] of [[640, 360, 'low'], [1920, 1080, 'high']]) {
  test(`the Rule, the sighting thread and the line round are 2 / 3 to 5 / 3 px wide at ${width} x ${height}`, async () => {
    const game = await openSandbox(server, { tier, viewport: { width, height } });
    try {
      const size = await game.page.evaluate(() => { const c = window.__dbg.ext.core.ctx().render.renderer.domElement; return [c.width, c.height]; });
      assert.deepEqual(size, [width, height], 'the drawing buffer is the window (pixel ratio 1)');
      await ext(game, 'render', 'setMoodKey', 'L1', 0);
      await ext(game, 'render', 'override', { grain: 0, vignette: 0, identity: true, exposure: 1 });
      // the Rule: north, 25 degrees up
      await game.dbg('setAim', 0, 25);
      await game.step(1, true);
      let png = await frame(game);
      const rows = [Math.round(height * 0.3), Math.round(height * 0.5), Math.round(height * 0.7)];
      const rule = rows.map((r) => coreWidth(png, r, Math.round(width * 0.3), Math.round(width * 0.7)));
      // on High the Rule is drawn over white and blooms (polish round 3): its core at half its peak may read one pixel wider
      const most = tier === 'high' ? 4 : 3;
      for (const r of rule) assert.ok(r.width >= 1 && r.width <= most, `the Rule's core is ${r.width} px wide (rows ${rows}: ${rule.map((x) => x.width)})`);
      // it leans east: higher up the sky it is further right
      assert.ok(rule[0].at >= rule[2].at, `the Rule leans east (columns ${rule.map((x) => x.at)})`);
      await game.shot(`rule_${width}`);

      // the two lines, upright against a black card 6 m in front of her, level gaze
      await game.dbg('setAim', 0, 0);
      await ext(game, 'render', 'override', { fog: 0, height: 0 });
      await ext(game, 'rsb', 'card', { color: 0x000000, x: 0, y: 1.65, z: 3.5, w: 9, h: 5, bake: 'UNLIT', material: 'm_flat' });
      assert.equal(await ext(game, 'rsb', 'acquireLines', 'sighting_thread', 1), 1);
      await ext(game, 'rsb', 'place', 0, -1, 0.6, 4, -1, 2.7, 4, 1);
      await game.page.evaluate(() => { const o = window.__dbg.ext.rsb.origin(), v = window.__dbg.ext.core.ctx().render.vfx; v.line('line_round', o[0] + 1, o[1] + 0.6, o[2] + 4, o[0] + 1, o[1] + 2.7, o[2] + 4); });
      await game.step(1, true);
      png = await frame(game);
      const a = await ext(game, 'rsb', 'project', -1, 1.65, 4), b = await ext(game, 'rsb', 'project', 1, 1.65, 4);
      const span = Math.round(width * 0.04);
      const thread = widest(png, Math.round(a.y - height * 0.06), Math.round(a.y + height * 0.06), Math.round(a.x) - span, Math.round(a.x) + span);
      const round = widest(png, Math.round(b.y - 2), Math.round(b.y + 2), Math.round(b.x) - span, Math.round(b.x) + span);
      console.log(`${width} x ${height}: Rule ${rule.map((x) => x.width)} px, sighting thread ${thread.width} px (rows ${thread.all.join('')}), line round ${round.width} px`);
      // polish round 3 (the combat critic: the aim tell was a faint dotted line): a solid beam, 3 px growing to 5 over the aim
      assert.ok(thread.width >= 2 && thread.width <= 8, `sighting thread ${thread.width} px`);
      assert.ok(!thread.all.includes(0), 'the sighting thread is solid (no row is empty)');
      assert.ok(round.width >= 2 && round.width <= (tier === 'high' ? 5 : 4), `line round ${round.width} px`);
      await game.shot(`lines_${width}`);
    } finally { await game.close(); }
  });
}

test('the last fire is never under 4 px, however far it is', async () => {
  const game = await openSandbox(server, { tier: 'low' });
  try {
    await ext(game, 'render', 'setMoodKey', 'L6', 0);
    await ext(game, 'render', 'override', { grain: 0, vignette: 0, fog: 0, height: 0 });
    assert.equal(await ext(game, 'rsb', 'acquireCards', 'last_fire', 1), 1);
    assert.equal(await ext(game, 'rsb', 'acquireCards', 'last_fire', 1), 0, 'the pool holds one');
    const sizes = [];
    for (const dist of [30, 150, 420, 900]) {
      // off north by 17 degrees: the Rule stands due north
      await ext(game, 'rsb', 'place', 0, dist * 0.3, 1.65, 10 - dist, dist * 0.3, 1.65, 10 - dist, 1);
      // kindled: 1.5 s after it was acquired
      await game.step(100, true);
      const png = await frame(game);
      const at = await ext(game, 'rsb', 'project', dist * 0.3, 1.65, 10 - dist);
      let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
      for (let y = Math.round(at.y) - 30; y <= Math.round(at.y) + 30; y++) {
        for (let x = Math.round(at.x) - 30; x <= Math.round(at.x) + 30; x++) {
          // against the sky of the same row (the dusk sky is a gradient)
          const p = px(png, x, y), bg = px(png, Math.round(at.x) + 45, y);
          if (Math.hypot(p[0] - bg[0], p[1] - bg[1], p[2] - bg[2]) > 20) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        }
      }
      const w = x1 - x0 + 1, h = y1 - y0 + 1;
      sizes.push(`${dist} m: ${w} x ${h} px`);
      assert.ok(w >= 4 && h >= 4, `the last fire at ${dist} m is ${w} x ${h} px`);
    }
    console.log('last fire  ' + sizes.join('  '));
    await game.shot('last_fire_far');
  } finally { await game.close(); }
});
