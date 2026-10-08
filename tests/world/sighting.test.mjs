// Lead ruling R4 (polish round 3): the one sighting of the pursued man is a dark figure at least 24 px tall at 720p
// against clear sky. This is the REAL game (no core stub: the card is the enemies', its shader the renderer's, the mesa
// the exterior's), measured on the frame a player gets. The world's part is Director.presentSighting (SIGHT_MIN_PX):
// docs/requests/code-world.md section 9.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PNG } from 'pngjs';
import { AUDIO_DEVICE_ERROR, openGame, startServer } from '../harness.mjs';
import { marker } from './lib.mjs';

let srv;
before(async () => { srv = await startServer({}); });
after(async () => { await srv.close(); });

/** the pixels clearly darker than the sky or mesa of their row, in the window about the middle of the frame, the crosshair left out */
function figure(file) {
  const png = PNG.sync.read(fs.readFileSync(file));
  const at = (x, y) => { const i = (y * png.width + x) * 4; return [png.data[i], png.data[i + 1], png.data[i + 2]]; };
  const luma = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1, n = 0; const sum = [0, 0, 0]; let skyLuma = 0;
  for (let y = 280; y <= 372; y++) {
    const bg = luma(at(672, y));                             // the sky (or the mesa) of this row, clear of him
    for (let x = 680; x <= 760; x++) {
      if (Math.abs(x - 640) <= 12 && Math.abs(y - 360) <= 12) continue;
      const p = at(x, y);
      if (luma(p) > bg - 40) continue;
      n++; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      sum[0] += p[0]; sum[1] += p[1]; sum[2] += p[2]; skyLuma += bg;
    }
  }
  const mean = sum.map((v) => Math.round(v / Math.max(n, 1)));
  return { n, w: maxX - minX + 1, h: maxY - minY + 1, height: png.height, mean, lumaFigure: luma(mean), lumaSky: skyLuma / Math.max(n, 1) };
}

test('R4: from the yard the pursued man stands at least 24 px tall at 720p, darker than the sky behind him, and is still there 12 s on if she has not looked', async () => {
  const game = await openGame(srv, { piece: 'r3-fix-code-world', stubs: null, checkpoint: 'cp_yard_clear', viewport: { width: 1280, height: 720 }, ignoreConsole: AUDIO_DEVICE_ERROR });
  try {
    const t = marker('vista_dowser').params.target;
    await game.dbg('god', true);
    await game.run([{ steps: 30 }]);
    // look 30 m to the left of him (he stands about 73 px right of the crosshair at 720p): the crosshair is clear of the figure, he is well inside the view
    await game.run([{ aimAt: [t[0], t[1], t[2] + 30], steps: 20 }]);
    const cam = (await game.state()).player;
    const best = figure(await game.shot('sighting_720'));
    assert.equal(best.height, 720);
    console.log(`sighting at 720p from (${cam.x.toFixed(1)}, ${cam.z.toFixed(1)}): figure ${best.w} x ${best.h} px (${best.n} px), mean RGB ${best.mean}, luma ${best.lumaFigure.toFixed(0)} against ${best.lumaSky.toFixed(0)} behind him`);
    assert.ok(best.h >= 24, `the figure is ${best.h} px tall (R4: at least 24)`);
    // pass i2 (exterior look; the visual reviewer asked for 50 to 60 px): SIGHT_MIN_PX is 62, the figure about 56
    assert.ok(best.h >= 46, `the figure is ${best.h} px tall (pass i2: about 56)`);
    assert.ok(best.h <= 70, `the figure is ${best.h} px tall: the world's scale and the owners' floors have multiplied`);
    assert.ok(best.w >= 12 && best.w <= 44, `the figure is ${best.w} px wide`);
    assert.ok(best.lumaFigure < best.lumaSky - 50, `the figure (luma ${best.lumaFigure.toFixed(0)}) is not clearly darker than the sky (${best.lumaSky.toFixed(0)})`);
    // looked away from the start (her back to him) for 14 s: he is not taken off the mesa unseen
    await game.run([{ aimAt: [cam.x + 50, 1.6, cam.z], steps: 14 * 60 }, { aimAt: [t[0], t[1], t[2] + 30], steps: 3 }]);
    const held = figure(await game.shot('sighting_720_after_14s_away'));
    assert.ok(held.h >= 24, `after 14 s with her back to him the figure is ${held.h} px tall: he left unseen`);
  } finally { await game.close(); }
});
