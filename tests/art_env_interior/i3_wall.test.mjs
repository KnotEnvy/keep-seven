// Look pass i3 (visual reviewer, major: "a black soft rectangle on the boss-room wall beside the locker"). The lining
// behind the bolted access panels baked black (the panels stood in the sector's bake), and on facet 165 the panel is
// taken away for the line locker's seat, which bared the patch. The panels are out of the sector's lightmap passes
// (blender/env_interior/env_the_bore.py `panels`). This samples the wall where the panel would be, on facet 165, in the
// zone's own baked light (sandbox/viewer: vertex colour x lightmap x texture), against the same wall 0.95 m to either
// side at the same height: the patch must not be darker than 0.7 of its neighbours (it was under 0.3).
import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { startServer, openGame } from '../harness.mjs';

const PIECE = 'art-env-interior';
const AX = [14, -44, 96], R = 15, FACET = 165, Y = -41.8;
const rad = (d) => d * Math.PI / 180;
const at = (dt) => [AX[0] + (R - 0.02) * Math.sin(rad(FACET)) + Math.cos(rad(FACET)) * dt, Y, AX[2] - (R - 0.02) * Math.cos(rad(FACET)) + Math.sin(rad(FACET)) * dt];

test('the bore: the lining where facet 165 lost its access panel is lit like the wall beside it', async () => {
  const server = await startServer();
  try {
    const game = await openGame(server, { page: 'sandbox/viewer', piece: PIECE, start: false, query: { zone: 'the_bore', shot: 1 } });
    try {
      const pts = [at(0), at(-0.95), at(0.95)];
      await game.dbg('teleport', 17.2, -44, 105, 0, 0);
      await game.dbg('aimAt', pts[0][0], pts[0][1], pts[0][2], 0);
      await game.step(1, true);
      await game.dbg('aimAt', pts[0][0], pts[0][1], pts[0][2], 0);
      const file = await game.shot('viewer_the_bore_i3_wall165');
      const px = await game.page.evaluate((pts) => {
        const cam = window.__dbg.ext.core.ctx().scene.camera; cam.updateMatrixWorld();
        return pts.map((p) => { const v = cam.position.clone().set(p[0], p[1], p[2]).project(cam); return [(v.x + 1) / 2, (1 - v.y) / 2, v.z]; });
      }, pts);
      const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const mean = ([u, v]) => {
        const cx = Math.round(u * info.width), cy = Math.round(v * info.height), h = 10; let s = 0, n = 0;
        for (let y = cy - h; y <= cy + h; y++) for (let x = cx - h; x <= cx + h; x++) {
          if (x < 0 || y < 0 || x >= info.width || y >= info.height) continue;
          const i = (y * info.width + x) * 3; s += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]; n++;
        }
        return n ? s / n : 0;
      };
      for (const p of px) assert.ok(p[0] > 0.05 && p[0] < 0.95 && p[1] > 0.05 && p[1] < 0.95 && p[2] < 1, `a sample point is off the frame (${p.map((v) => v.toFixed(2))})`);
      const [c, l, r] = px.map(mean);
      console.log(`    wall at facet 165, 2.2 m up: patch ${c.toFixed(1)}, 0.95 m to either side ${l.toFixed(1)} / ${r.toFixed(1)} (luma of 255); ${file.split('/shots/')[1]}`);
      assert.ok(Math.min(l, r) > 12, `the wall beside the patch is lit (${l.toFixed(1)}, ${r.toFixed(1)})`);
      assert.ok(c > 0.7 * Math.min(l, r), `the patch (${c.toFixed(1)}) is darker than 0.7 of the wall beside it (${l.toFixed(1)}, ${r.toFixed(1)})`);
    } finally { await game.close(); }
  } finally { await server.close(); }
});
