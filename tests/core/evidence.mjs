// Foundation evidence (not a test: `node tests/core/evidence.mjs`, or `npm run evidence`). Writes shots/foundation/:
//   title_<tier>.png                      the title screen
//   cp_<nn>_<checkpoint>_<tier>.png       the game at every checkpoint on Low and High (greybox + placeholder assets)
//   overlay.png                           the perf overlay
//   viewer_reference_asset.png            sandbox/viewer showing the pipeline's reference asset (fixture overlay)
//   viewer_template_asset.png, viewer_zone.png
//   sandbox_<piece>.png                   each code piece's sandbox scaffold
//   evidence.json                         per-checkpoint perf numbers and the measured cost of step / capture / screenshot
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, openGame, startServer } from '../harness.mjs';
import { CHECKPOINTS, LAYOUT, MiB, STUBS } from './route.mjs';

const PIECE = 'foundation';
const out = { checkpoints: {}, timing: {} };
const median = (v) => v.slice().sort((a, b) => a - b)[v.length >> 1];
const server = await startServer();
try {
  // ---- title, checkpoints, timings on both tiers
  for (const tier of ['low', 'high']) {
    let t0 = performance.now();
    let game = await openGame(server, { piece: PIECE, stubs: STUBS, tier, start: false });
    out.timing[`bootToTitleMs_${tier}`] = Math.round(performance.now() - t0);
    await game.step(2, true);
    await game.shot('title_' + tier);
    t0 = performance.now();
    await game.dbg('start');
    out.timing[`titleToControlMs_${tier}`] = Math.round(performance.now() - t0);
    await game.dbg('god', true);
    const steps = CHECKPOINTS.map((cp, i) => ({
      name: `cp_${String(i + 1).padStart(2, '0')}_${cp}_${tier}`,
      script: [{ call: ['checkpoint', cp] }, { steps: 2 }],
    }));
    t0 = performance.now();
    await game.shotSeries(steps);
    out.timing[`seventeenCheckpointFramesMs_${tier}`] = Math.round(performance.now() - t0);
    out.checkpoints[tier] = {};
    for (const cp of CHECKPOINTS) {
      await game.run([{ call: ['checkpoint', cp] }, { steps: 2 }]);
      const p = await game.dbg('perfRun', 4);
      const s = await game.state();
      out.checkpoints[tier][cp] = {
        zone: s.world.zone, cell: s.world.cell, set: s.world.set, drawCalls: p.drawCalls, triangles: p.triangles,
        memoryMiB: +((p.textureBytes + p.renderTargetBytes) / MiB).toFixed(1), buffer: `${p.width}x${p.height}`,
      };
    }
    if (tier === 'low') {
      // the cost of driving the game under SwiftShader, measured inside the page (no round trips) and from Node
      await game.run([{ call: ['checkpoint', 'cp_street_clear'] }, { aim: [80, -4], actions: ['forward'], steps: 60 }]);
      const inPage = await game.page.evaluate(() => {
        const d = window.__dbg, time = (fn) => { const t = performance.now(); fn(); return performance.now() - t; };
        const med = (v) => v.slice().sort((a, b) => a - b)[v.length >> 1];
        const sim = [], frame = [], capture = [];
        for (let i = 0; i < 10; i++) sim.push(time(() => d.step(600, false)) / 600);
        for (let i = 0; i < 30; i++) frame.push(time(() => d.step(1, true)));
        for (let i = 0; i < 10; i++) capture.push(time(() => d.capture()));
        return { stepNoRenderMsPerTick: med(sim), stepWithRenderMs: med(frame), captureMs: med(capture) };
      });
      await game.run([{ actions: [], steps: 1 }]);
      const trip = [], shot = [];
      for (let i = 0; i < 10; i++) { const t = performance.now(); await game.step(1); trip.push(performance.now() - t); }
      for (let i = 0; i < 5; i++) { const t = performance.now(); await game.shot('_timing'); shot.push(performance.now() - t); }
      fs.rmSync(path.join(ROOT, 'shots', PIECE, '_timing.png'), { force: true });
      Object.assign(out.timing, inPage, { roundTripStepMs: median(trip), pageScreenshotMs: median(shot) });
    }
    await game.close();
  }

  // ---- the perf overlay
  let game = await openGame(server, { piece: PIECE, stubs: STUBS, query: { perf: 1 }, checkpoint: 'cp_street_clear' });
  await game.run([{ aim: [80, -4], steps: 2 }]);
  await game.page.evaluate(() => { for (let i = 0; i < 12; i++) window.__dbg.step(1, true); });
  await game.shot('overlay');
  await game.close();

  // ---- the viewer: the reference asset (pipeline fixture through the overlay manifest), the template asset, one zone
  const fx = spawnSync(process.execPath, ['tools/build-assets.mjs', '--manifest', 'tests/pipeline/fixtures/manifest.json', '--only', 'fixtures'], { cwd: ROOT, encoding: 'utf8' });
  if (fx.status !== 0) throw new Error('fixture build failed:\n' + fx.stdout + fx.stderr);
  game = await openGame(server, { page: 'sandbox/viewer', piece: PIECE, start: false, query: { asset: 'fixture_crate_panel', overlay: 'tests/pipeline/fixtures/manifest.json', yaw: 25, pitch: 12 } });
  await game.step(2, true);
  out.referencePanel = await game.page.evaluate(() => document.getElementById('panel').textContent);
  await game.shot('viewer_reference_asset');
  await game.close();
  game = await openGame(server, { page: 'sandbox/viewer', piece: PIECE, start: false, query: { asset: 'ia_ammo_box' } });
  await game.step(2, true);
  await game.shot('viewer_template_asset');
  await game.close();
  game = await openGame(server, { page: 'sandbox/viewer', piece: PIECE, start: false, query: { zone: 'plenty_street' } });
  await game.run([{ aim: [70, -5], steps: 3 }]);
  await game.page.evaluate(() => { for (let i = 0; i < 12; i++) window.__dbg.step(1, true); });
  out.zonePanel = await game.page.evaluate(() => document.getElementById('panel').textContent);
  await game.shot('viewer_zone');
  await game.close();

  // ---- each code piece's sandbox scaffold
  for (const piece of ['player', 'enemies', 'render', 'world', 'ui', 'audio']) {
    game = await openGame(server, { page: 'sandbox/' + piece, piece: PIECE, start: false });
    await game.run([{ aim: [0, -8], actions: ['forward'], steps: 90 }, { actions: [], steps: 1 }]);
    await game.shot('sandbox_' + piece);
    await game.close();
  }
  out.checkpointMarkers = Object.fromEntries(CHECKPOINTS.map((cp) => [cp, LAYOUT.markers.find((m) => m.id === cp).zone]));
  fs.writeFileSync(path.join(ROOT, 'shots', PIECE, 'evidence.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out.timing, null, 1));
} finally {
  await server.close();
}
