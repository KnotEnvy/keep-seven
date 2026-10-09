// i5.test.mjs (pass i5, look team "exterior-look"): what the two visual reviewers named, held.
//   the stub      the broken wall beside the sighting is BRICKWORK: at each end of every yard stub the courses stand
//                 toothed out of the break at several depths (it was one stack of plain quads in one plane)
//   the foot      the mesa's foot under the rim is benched rimrock: level treads with lit lips (it was a smooth grid)
//   the last image  (the REAL game, the ending's own view) the lower 30 % is the land's dark, not a pale mound
//   the overhang  (the REAL game, High) the dust in the shafts is not a rash of hard white dots
// Frames: shots/i5-team-exterior-look/test/.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { ROOT, startServer } from '../harness.mjs';
import { openBot } from '../e2e/lib/bot.mjs';
import { loadAsset, solid } from './geo.mjs';

const SHOTS = path.join(ROOT, 'shots/i5-team-exterior-look/test');
const W = 1280, H = 720;

test('the yard stubs end in brickwork: toothed courses at several depths at both ends of each', async () => {
  const A = await loadAsset('env_plenty_street');
  for (const id of ['yd_cover_stub_1', 'yd_cover_stub_2', 'yd_cover_stub_3']) {
    const s = solid(id);
    const ax = s.size[0] >= s.size[2] ? 0 : 2, cross = ax === 0 ? 2 : 0, L = Math.max(s.size[0], s.size[2]);
    for (const sgn of [-1, 1]) {
      const end = s.pos[ax] + sgn * L / 2;
      const planes = new Set(); let faces = 0, tops = 0;
      for (let t = 0; t < A.tris.length; t += 9) {
        const P = [0, 1, 2].map((k) => [A.tris[t + 3 * k], A.tris[t + 3 * k + 1], A.tris[t + 3 * k + 2]]);
        if (!P.every((p) => Math.abs(p[cross] - s.pos[cross]) < 0.32 && p[1] < 2.5 && p[1] > -0.05 && sgn * (p[ax] - end) > -0.75 && sgn * (p[ax] - end) < 0.3)) continue;
        const u = [P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]], v = [P[2][0] - P[0][0], P[2][1] - P[0][1], P[2][2] - P[0][2]];
        const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; const l = Math.hypot(...n) || 1;
        if (sgn * n[ax] / l > 0.9) { faces++; planes.add(Math.round(P[0][ax] * 50)); }                 // an end of a brick (2 cm bins)
        if (n[1] / l > 0.9 && P[0][1] > 0.1) tops++;                                               // a brick's top
      }
      assert.ok(faces >= 16, `${id} end ${sgn}: ${faces} triangles look out of the break (a course to a brick or two)`);
      assert.ok(planes.size >= 6, `${id} end ${sgn}: the brick ends stand at ${planes.size} depths (toothed and raked, not one plane)`);
      assert.ok(tops >= 10, `${id} end ${sgn}: ${tops} triangles of brick tops`);
    }
  }
});

test('the foot under the rim is benched: level treads at the beds\' heights, not a grid of slopes', async () => {
  const A = await loadAsset('env_backdrop_dusk');
  const levels = new Map(); let sloped = 0;
  for (let t = 0; t < A.tris.length; t += 9) {
    const P = [0, 1, 2].map((k) => [A.tris[t + 3 * k], A.tris[t + 3 * k + 1], A.tris[t + 3 * k + 2]]);
    if (!P.every((p) => p[0] > -12 && p[0] < 30 && p[2] > 42 && p[2] < 99.95 && p[1] > 0 && p[1] < 12.6)) continue;
    const ys = P.map((p) => p[1]);
    if (Math.max(...ys) - Math.min(...ys) < 0.002) levels.set(ys[0].toFixed(2), (levels.get(ys[0].toFixed(2)) ?? 0) + 1);
    else if (Math.max(...ys) - Math.min(...ys) < 0.6) sloped++;
  }
  const beds = [...levels.entries()].filter(([, n]) => n >= 12);
  assert.ok(beds.length >= 9, `${beds.length} beds with a dozen level triangles or more under the ledge (${[...levels.keys()].slice(0, 14).join(' ')})`);
  assert.ok(sloped < 40, `${sloped} gently sloped triangles there (the old foot was all of them)`);
});

let server, bot, page;
before(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  server = await startServer({});
  bot = await openBot(server, { piece: 'i5-team-exterior-look', tier: 'low', checkpoint: 'cp_rim', viewport: { width: W, height: H }, allowErrors: true });
  page = bot.page;
});
after(async () => { try { await bot.game.browser.close(); } catch { /* closed */ } await server.close(); });

async function grab(name) {
  const url = await page.evaluate(() => window.__dbg.capture());
  const buf = Buffer.from(url.split(',')[1], 'base64');
  if (name) fs.writeFileSync(path.join(SHOTS, name + '.png'), buf);
  return PNG.sync.read(buf);
}
const dir = (p, yawDeg, pitDeg = 0) => { const y = yawDeg * Math.PI / 180, pt = pitDeg * Math.PI / 180; return [p[0] - 100 * Math.sin(y), p[1] + 1.65 + 100 * Math.tan(pt), p[2] - 100 * Math.cos(y)]; };
const hideGun = () => page.evaluate(() => { const d = window.__dbg; for (const c of d.ext.core.ctx().scene.viewModel.children) c.visible = false; d.step(0, true); });
const jump = (cp) => page.evaluate(async (cp) => { const d = window.__dbg; await d.checkpoint(cp); d.god(true); d.aiEnabled(false); await d.ext.core.stepAsync(40, true); }, cp);
const place = async (pos, at, steps = 20) => { await page.evaluate(async ({ pos, at, steps }) => { const d = window.__dbg; for (let i = 0; i < 2; i++) { d.teleport(pos[0], pos[1], pos[2]); d.aimAt(at[0], at[1], at[2]); await d.ext.core.stepAsync(i ? 1 : steps, true); } }, { pos, at, steps }); };
const tier = async (t) => { await page.evaluate(async (t) => { const d = window.__dbg; d.setTier(t); await d.ext.core.stepAsync(90, true); }, t); };
const luma = (p, x, y) => { const i = (y * W + x) * 4; return 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2]; };

test('the last image: under the ending\'s own view the lower 30 % is the land\'s dark with lit edges in it, on both tiers', async () => {
  await jump('cp_rim');
  // where the game's eased view rests after she takes the round (scratch/i5-team-exterior-look/end.mjs: position, yaw -4.05, pitch 1.25)
  const pos = [2.956, 18, 102.971];
  for (const t of ['low', 'high']) {
    await tier(t);
    await place(pos, dir(pos, -4.05, 1.25)); await hideGun();
    const p = await grab(`last_${t}`);
    let n = 0, bright = 0, sum = 0, edge = 0;
    for (let y = Math.floor(H * 0.7); y < H - 2; y++) for (let x = 0; x < W - 2; x++) {
      const l = luma(p, x, y); sum += l; n++;
      if (l > 60) bright++;
      if (Math.abs(luma(p, x + 1, y) - l) + Math.abs(luma(p, x, y + 1) - l) > 24) edge++;
    }
    console.log(`last image, ${t}: lower 30 % mean ${(sum / n).toFixed(1)} of 255, ${(100 * bright / n).toFixed(1)} % over 60, ${(100 * edge / n).toFixed(2)} % hard edges`);
    assert.ok(100 * bright / n < 14, `${t}: ${(100 * bright / n).toFixed(1)} % of the lower 30 % is lighter than 60 of 255 (the pale mound was 35 %)`);
    assert.ok(sum / n < 42, `${t}: the lower 30 % averages ${(sum / n).toFixed(1)} of 255 (the land is the frame's dark third; it was 50)`);
    assert.ok(100 * edge / n > 0.25, `${t}: ${(100 * edge / n).toFixed(2)} % of it are hard edges (lips and risers of the rimrock: it is not one flat tone)`);
  }
});

test('the overhang on High: the dust in the shafts is soft and sparse (no rash of hard white dots against the rock)', async () => {
  await tier('high');
  await jump('cp_lip_start');
  for (const [name, yaw, pit] of [['rule', 0, 4], ['rule_l', 25, 8]]) {
    const pos = [14, 14, 100];
    await place(pos, dir(pos, yaw, pit), 30); await hideGun();
    let worst = 0;
    for (let k = 0; k < 3; k++) {
      await page.evaluate(() => window.__dbg.ext.core.stepAsync(7, true));
      const p = await grab(`motes_${name}_${k}`);
      let c = 0;
      for (let y = 62; y < 498; y++) for (let x = 2; x < 638; x++) {
        const l = luma(p, x, y);
        if (l - Math.max(luma(p, x - 2, y), luma(p, x + 2, y), luma(p, x, y - 2), luma(p, x, y + 2)) > 28) c++;
      }
      worst = Math.max(worst, c);
    }
    console.log(`overhang motes, ${name}: at most ${worst} pixels that stand 28 of 255 over their neighbours two pixels off`);
    assert.ok(worst < 60, `${name}: ${worst} hard bright pixels in the left half of the frame (the cluster of white dots was 200 to 340)`);
  }
  await tier('low');
});
