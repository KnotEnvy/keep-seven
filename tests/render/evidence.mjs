// node tests/render/evidence.mjs [name ...]   Writes the evidence frames of the render piece to shots/code-render/
// (960 x 540). Without names: all of them. Every frame is stepped through the debug hook; nothing waits on real time.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { ROOT, startServer } from '../harness.mjs';
import { ext, frames, framesSmall, openIndex, openSandbox } from './util.mjs';

const SHOTS = path.join(ROOT, 'shots', 'code-render');
const only = process.argv.slice(2);
const want = (name) => only.length === 0 || only.some((o) => name.startsWith(o));
const server = await startServer({ pieces: ['render'] });
const log = (name, perf) => console.log(`${name.padEnd(26)} ${String(perf.drawCalls).padStart(3)} calls ${String(perf.triangles).padStart(6)} tris ${((perf.textureBytes + perf.renderTargetBytes) / 1048576).toFixed(1).padStart(5)} MiB  ${perf.programs} programs  cell ${perf.cell}`);

async function page(name, options, fn) {
  if (!want(name)) return;
  const game = options.index ? await openIndex(server, options) : await openSandbox(server, options);
  try { await fn(game); } finally { await game.close(); }
}

try {
  // each zone scene on Low
  for (const zone of ['the_lip', 'plenty_street', 'tally_house', 'the_gallery', 'lift_hall', 'the_bore', 'far_rim']) {
    await page('zone_' + zone, { scene: 'zone:' + zone }, async (game) => {
      await framesSmall(game, 150);
      await game.shot('zone_' + zone);
      log('zone_' + zone, await game.perf());
    });
  }
  // the doorway shot with the Rule: the opening frame of the game, on the title's side of the first step
  await page('doorway_rule', { index: true, checkpoint: 'cp_lip_start' }, async (game) => {
    await game.dbg('setAim', 0, 4);
    await framesSmall(game, 90);
    await game.shotSeries([{ name: 'doorway_rule' }]);
    log('doorway_rule', await game.perf());
  });
  // every material under each mood
  for (const mood of ['L1', 'L2', 'L3', 'L4', 'L5', 'L6']) {
    await page('materials_' + mood, { scene: 'materials', query: { mood } }, async (game) => {
      await game.dbg('setAim', -18, -2);
      await ext(game, 'render', 'layerWeight', 'lm_fixture_room_layer');
      await game.page.evaluate(() => window.__dbg.ext.core.ctx().render.setLightLayer('lm_fixture_room_layer', 1, 0));
      await framesSmall(game, 20);
      await game.shot('materials_' + mood);
      log('materials_' + mood, await game.perf());
    });
  }
  // every effect, read from 3.5 m, with its name in the canvas: five pages of six bursts at age 0.1 s, then the lines, the
  // cards and the floor effects; vfx_grid.png is the 3 x 3 sheet of the nine frames (vfx_grid_<part>.png are the frames)
  for (const mood of ['L3', 'L1']) {
    await page(mood === 'L3' ? 'vfx_grid' : 'vfx_grid_' + mood, { scene: 'vfx', query: { mood } }, async (game) => {
      const tag = mood === 'L3' ? 'vfx_grid' : 'vfx_grid_' + mood;
      const pages = await ext(game, 'rsb', 'vfxPages');
      const parts = [...Array(pages).keys()].map(String).concat(['lines', 'cards', 'floor']);
      const cells = [];
      for (const part of parts) {
        const [x, y, z, yaw] = await ext(game, 'rsb', 'vfxView', part);
        await game.dbg('teleport', x, y, z, yaw, /^\d/.test(part) ? 26 : part === 'floor' ? -16 : 5);
        await framesSmall(game, 130);
        if (/^\d/.test(part)) { await ext(game, 'rsb', 'vfxRound', Number(part)); await frames(game, 6); }
        else if (part === 'floor') {
          await ext(game, 'rsb', 'vfxOneShots', 1); await frames(game, 40);
          await game.page.evaluate(() => { const d = window.__dbg, o = d.ext.rsb.origin(); const c = d.ext.core.ctx(), e = c.player.eye, f = c.player.forward; c.render.vfx.muzzleFlash('lead', e.x + f.x * 1.5 - 0.45, e.y + f.y * 1.5 + 0.3, e.z + f.z * 1.5); d.step(1, true); });
        } else { await ext(game, 'rsb', 'vfxOneShots', 1); await frames(game, 1); }
        const url = await game.page.evaluate(() => window.__dbg.capture());
        const buf = Buffer.from(url.replace(/^data:image\/png;base64,/, ''), 'base64');
        fs.writeFileSync(path.join(SHOTS, `${tag}_${/^\d/.test(part) ? 'page' + (Number(part) + 1) : part}.png`), buf);
        cells.push(await sharp(buf).resize(640, 360).toBuffer());
      }
      await sharp({ create: { width: 1920, height: 1080, channels: 3, background: '#000' } })
        .composite(cells.slice(0, 9).map((input, i) => ({ input, left: (i % 3) * 640, top: Math.floor(i / 3) * 360 }))).png().toFile(path.join(SHOTS, tag + '.png'));
      log(tag, await game.perf());
    });
  }
  // the ring at the seventh: 0, 0.4, 0.8, 1.2, 1.6 s and after
  await page('seventh', { scene: 'seventh' }, async (game) => {
    await game.dbg('setAim', 180, -8);
    await framesSmall(game, 80);
    const shots = [];
    await game.shotSeries([{ name: 'seventh_before' }]);
    await game.dbg('emit', 'boss/proven', { x: 14, y: -44, z: 96 });
    for (let i = 0; i <= 4; i++) { if (i > 0) await frames(game, 24); else await frames(game, 1); shots.push(...await game.shotSeries([{ name: 'seventh_' + i }])); }
    await framesSmall(game, 120);
    shots.push(...await game.shotSeries([{ name: 'seventh_5' }]));
    log('seventh_5', await game.perf());
  });
  await page('seventh_reduced', { scene: 'seventh' }, async (game) => {
    await game.dbg('setAim', 180, -8);
    await game.dbg('setOption', 'reduceFlashes', true);
    await framesSmall(game, 80);
    await game.dbg('emit', 'boss/proven', { x: 14, y: -44, z: 96 });
    await framesSmall(game, 48);
    await game.shotSeries([{ name: 'seventh_reduced_2' }]);
  });
  // one view on the three tiers
  for (const tier of ['min', 'low', 'high']) {
    await page('tiers_' + tier, { index: true, tier, checkpoint: 'cp_street_clear' }, async (game) => {
      await game.dbg('setAim', 62, 3);
      await framesSmall(game, 90);
      await game.shotSeries([{ name: 'tiers_' + tier }]);
      log('tiers_' + tier, await game.perf());
    });
  }
  // the worst-case fight with the overlay
  await page('budget_worst', { scene: 'budget', query: { zone: 'the_gallery', perf: 1 } }, async (game) => {
    await framesSmall(game, 130);
    await game.shot('budget_worst');
    log('budget_worst', await game.perf());
  });
  // the view-model pass: the revolver in camera space over the world, at three shapes of window
  for (const [name, viewport] of [['viewmodel_pass', { width: 960, height: 540 }], ['viewmodel_pass_4x3', { width: 720, height: 540 }], ['viewmodel_pass_21x9', { width: 1260, height: 540 }]]) {
    await page(name, { scene: 'zone:plenty_street', viewport }, async (game) => {
      await ext(game, 'rsb', 'viewModel', 'weapon_revolver');
      await game.dbg('setAim', 62, 0);
      await framesSmall(game, 60);
      const cover = await ext(game, 'render', 'viewModelCoverage');
      await game.shot(name);
      console.log(`${name}: coverage ${(cover.coverage * 100).toFixed(1)} %, from ${(cover.minX * 100).toFixed(1)} % to ${(cover.maxX * 100).toFixed(1)} % across`);
    });
  }
} finally { await server.close(); }
