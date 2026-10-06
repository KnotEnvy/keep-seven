// Polish round 5 (combat critic, major): "the muzzle flash is drawn away from the muzzle and stays put while the barrel
// recoils". The flash was asked for at a world point of the shot's tick and stayed there: 81, 169 and 203 px from the
// drawn muzzle on the three frames of a shot at 960 x 540. The smoke and the tracer began at the event's muzzle, a point
// of the view-model pass's 40 degree projection drawn by the world camera: 36 px from the barrel at 16:9, 181 px at 21:9.
//   the flash             on every drawn frame of its life the sprite is at the view-model's muzzle AS DRAWN (Low and High)
//   smoke and tracer      begin where the muzzle of the shot's pose is seen, at 16:9 and at 21:9
//   without a view-model  the flash stays where it was asked for (the fallback)
// Measured in the real game (all six systems), from a checkpoint; a few dozen ticks in each browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../harness.mjs';
import { openBot } from '../e2e/lib/bot.mjs';
import { frame, openSandbox } from './util.mjs';

const W = 960, H = 540;
/** centroid of the pixels the shot made much brighter and near white (the flash's core), in pixels */
function core(A, B) {
  let n = 0, sx = 0, sy = 0;
  for (let y = 0; y < B.height; y++) for (let x = 0; x < B.width; x++) {
    const i = (y * B.width + x) * 4;
    const d = (B.data[i] + B.data[i + 1] + B.data[i + 2] - A.data[i] - A.data[i + 1] - A.data[i + 2]) / 3;
    if (d > 60 && B.data[i] > 235 && B.data[i + 1] > 215) { n++; sx += x; sy += y; }
  }
  return { n, x: n ? sx / n : 0, y: n ? sy / n : 0 };
}
const settle = (bot, yaw, pitch) => bot.page.evaluate(async ([y, p]) => {
  const d = window.__dbg; d.god(true); d.aiEnabled(false); d.setAim(y, p); await d.ext.core.stepAsync(60, false); d.step(0, true);
}, [yaw, pitch]);

for (const tier of ['low', 'high']) {
  test(`${tier}: the flash is at the muzzle as drawn on every frame of its life, and rides the kick`, async () => {
    const server = await startServer({});
    try {
      const bot = await openBot(server, { piece: 'r5-team-render-tech', tier, checkpoint: 'cp_street_clear', viewport: { width: W, height: H }, allowErrors: true });
      try {
        await settle(bot, 90, 35);                                   // the open sky: the flash alone
        const pre = await frame(bot.game);
        const idle = await bot.page.evaluate(() => window.__dbg.ext.render.muzzle());
        assert.ok(idle.node, 'the view-model has a muzzle node');
        await bot.page.evaluate(() => { window.__dbg.tap('fire'); });
        const rows = [];
        let seen = 0;
        for (let k = 0; k < 4; k++) {
          await bot.page.evaluate(() => { window.__dbg.step(1, true); });
          const m = await bot.page.evaluate(() => window.__dbg.ext.render.muzzle());
          if (!m.flashVisible) { rows.push(`frame ${k}: no flash`); continue; }
          seen++;
          const c = core(pre, await frame(bot.game));
          const mx = m.muzzle.x * W, my = (1 - m.muzzle.y) * H;
          const mesh = Math.hypot(m.flash.x * W - mx, (1 - m.flash.y) * H - my), hot = Math.hypot(c.x - mx, c.y - my);
          const rise = (m.muzzle.y - idle.muzzle.y) * H;
          rows.push(`frame ${k}: muzzle (${mx.toFixed(0)}, ${my.toFixed(0)}), ${rise.toFixed(0)} px above its idle place; sprite ${mesh.toFixed(1)} px from it, core (${c.n} px) ${hot.toFixed(1)} px`);
          assert.ok(mesh < 0.01 * H, `frame ${k}: the sprite is ${mesh.toFixed(1)} px from the drawn muzzle (it was 81 to 203)`);
          assert.ok(c.n > 500, `frame ${k}: the flash is seen (${c.n} px)`);
          assert.ok(hot < 0.04 * H, `frame ${k}: the flash's core is ${hot.toFixed(1)} px from the drawn muzzle`);
          if (k === 0) assert.ok(rise > 0.03 * H, `the barrel has risen by the first frame (${rise.toFixed(0)} px): the sprite follows it`);
        }
        console.log(`${tier}: ${rows.join('; ')}`);
        assert.ok(seen >= 2, `the flash lived ${seen} drawn frames`);
        const after = await bot.page.evaluate(() => window.__dbg.ext.render.muzzle());
        assert.ok(after.rides >= seen, `the sprite was placed on each drawn frame (${after.rides})`);
      } finally { await bot.game.browser.close().catch(() => {}); }
    } finally { await server.close(); }
  });
}

test('the smoke and the tracer begin where the muzzle of the shot is seen, at 16:9 and at 21:9', async () => {
  const server = await startServer({});
  try {
    for (const [w, h] of [[W, H], [1260, 540]]) {
      const bot = await openBot(server, { piece: 'r5-team-render-tech', tier: 'low', checkpoint: 'cp_street_clear', viewport: { width: w, height: h }, allowErrors: true });
      try {
        for (const [yaw, pitch] of [[90, 0], [200, -40]]) {
          await settle(bot, yaw, pitch);
          const o = await bot.page.evaluate(() => {
            const d = window.__dbg, r = d.ext.render;
            const pre = r.muzzle();
            const lines = r.vfx().lines, bursts = r.vfx().bursts;
            d.tap('fire'); d.step(1, false);                         // no frame: the camera object still holds the pose `pre` was drawn with
            const now = r.muzzle();
            const e = d.events(0).filter((x) => x.name === 'weapon/fired').at(-1).payload;
            const cam = d.ext.core.ctx().scene.camera;
            const ev = new cam.position.constructor(e.mx, e.my, e.mz).project(cam);
            const depth = (now.smokeWorld[0] - e.ox) * e.dx + (now.smokeWorld[1] - e.oy) * e.dy + (now.smokeWorld[2] - e.oz) * e.dz;
            const depth0 = (e.mx - e.ox) * e.dx + (e.my - e.oy) * e.dy + (e.mz - e.oz) * e.dz;
            return { pre: pre.muzzle, smoke: now.smoke, event: { x: (ev.x + 1) / 2, y: (ev.y + 1) / 2 }, depth, depth0, lines: r.vfx().lines - lines, bursts: r.vfx().bursts - bursts };
          });
          const off = Math.hypot((o.pre.x - o.smoke.x) * w, (o.pre.y - o.smoke.y) * h), was = Math.hypot((o.pre.x - o.event.x) * w, (o.pre.y - o.event.y) * h);
          console.log(`${w} x ${h}, aim ${yaw} / ${pitch}: smoke and tracer start ${off.toFixed(2)} px from the muzzle (the event's own point: ${was.toFixed(1)} px)`);
          assert.ok(o.bursts >= 1 && o.lines >= 1, `the shot gave smoke and a tracer (${o.bursts} bursts, ${o.lines} lines)`);
          assert.ok(off < 1.5, `${off.toFixed(2)} px from the muzzle`);
          assert.ok(Math.abs(o.depth - o.depth0) < 1e-6, 'at the muzzle\'s own depth along the aim');
          await bot.page.evaluate(async () => { await window.__dbg.ext.core.stepAsync(60, false); });
        }
      } finally { await bot.game.browser.close().catch(() => {}); }
    }
  } finally { await server.close(); }
});

test('without a view-model the flash stays where it was asked for', async () => {
  const server = await startServer({ pieces: ['render'] });
  try {
    const game = await openSandbox(server, { scene: 'room' });
    try {
      const o = await game.page.evaluate(() => {
        const d = window.__dbg, ctx = d.ext.core.ctx(), r = d.ext.render;
        d.step(2, true);
        const had = ctx.scene.viewModel.children.slice();
        for (const c of had) ctx.scene.viewModel.remove(c);
        const e = ctx.player.eye, f = ctx.player.forward;
        const at = [e.x + f.x * 0.9 + 0.1, e.y + f.y * 0.9 - 0.05, e.z + f.z * 0.9];
        const rides = r.muzzle().rides;
        ctx.render.vfx.muzzleFlash('lead', at[0], at[1], at[2]);
        d.step(0, true);
        const m = r.muzzle(), p = r.system().fx.flashMesh.position;
        for (const c of had) ctx.scene.viewModel.add(c);
        return { node: m.node, visible: m.flashVisible, rides: m.rides - rides, moved: Math.hypot(p.x - at[0], p.y - at[1], p.z - at[2]) };
      });
      assert.equal(o.node, false);
      assert.ok(o.visible, 'the flash is drawn');
      assert.equal(o.rides, 0);
      assert.ok(o.moved < 1e-6, `it moved ${o.moved} m`);
    } finally { await game.close(); }
  } finally { await server.close(); }
});
