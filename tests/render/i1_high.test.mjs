// Pass i1, lead ruling R9 and the visual reviewer's major "High is nearly indistinguishable from Low in most zones": the
// four things the High tier gained, on the REAL game at 960 x 540. Frames: shots/i1-team-render-tech/test/.
//
//   the air light       lamps glow in the air between themselves and the eye (post.ts AirLightEffect): additive, no new
//                       pass, target or program in play; none on Low
//   the shadow map      runs in every mood that names a shadow (moods.ts SHADOWS): a creature in a room stands on its own
//                       shadow, the blob is not drawn where the map covers, fixed machinery does not cast in a room
//   the sand's sparkle  sunlit sand flashes (materials.ts SAND block); none in shade, none on Low
//   the relief          the detail texture, read as a height, turns the baked sunlight (materials.ts relief block); only
//                       under a sun, none on Low
//   the heat shimmer    only inside the horizon band, only far, off with Reduce Motion (post.ts HeatShimmerEffect)
// and what they may not cost: no program linked in a fight, draw calls and triangles inside High's caps.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { ROOT, startServer } from '../harness.mjs';
import { openBot } from '../e2e/lib/bot.mjs';

const SHOTS = path.join(ROOT, 'shots/i1-team-render-tech/test');
const W = 960, H = 540;
let server, bot, page;
before(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  server = await startServer({});
  bot = await openBot(server, { piece: 'i1-team-render-tech', tier: 'high', checkpoint: 'cp_lip_start', viewport: { width: W, height: H }, allowErrors: true });
  page = bot.page;
  // the grain is seeded by the tick: without it two frames of one tick are equal pixel for pixel
  await page.evaluate(() => {
    const d = window.__dbg, r = d.ext.render.system().renderer, gl = r.getContext();
    d.ext.render.override({ grain: 0 });
    window.__links = 0;
    const link = gl.linkProgram.bind(gl);
    gl.linkProgram = (p) => { window.__links++; return link(p); };
  });
});
after(async () => { try { await bot.game.browser.close(); } catch { /* closed */ } await server.close(); });

async function grab(name) {
  const url = await page.evaluate(() => window.__dbg.capture());
  const buf = Buffer.from(url.split(',')[1], 'base64');
  if (name) fs.writeFileSync(path.join(SHOTS, name + '.png'), buf);
  return PNG.sync.read(buf);
}
const jump = (cp, ai = false) => page.evaluate(async ([cp, ai]) => { const d = window.__dbg; await d.checkpoint(cp); d.god(true); d.aiEnabled(ai); await d.ext.core.stepAsync(40, true); }, [cp, ai]);
const place = (pos, at, steps = 90) => page.evaluate(async ({ pos, at, steps }) => { const d = window.__dbg; for (let i = 0; i < 2; i++) { d.teleport(pos[0], pos[1], pos[2]); d.aimAt(at[0], at[1], at[2]); await d.ext.core.stepAsync(i ? 1 : steps, true); } }, { pos, at, steps });
/** a switch of one of the four terms, then the same tick drawn again */
const set = (what, on) => page.evaluate(([what, on]) => { const d = window.__dbg; const r = d.ext.render[what](on); d.step(0, true); return r; }, [what, on]);
const read = (what) => page.evaluate((what) => window.__dbg.ext.render[what](), what);
const spawn = (kind, at, face) => page.evaluate(async ([kind, at, face]) => {
  const d = window.__dbg; d.killAll(true); await d.ext.core.stepAsync(120, false);
  d.spawnEnemy(kind, at[0], at[1], at[2], Math.atan2(-(face[0] - at[0]), -(face[2] - at[2])) * 180 / Math.PI);
}, [kind, at, face]);
/** a world point on the frame (pixels, y down) */
const project = (p) => page.evaluate((p) => {
  const cam = window.__dbg.ext.core.ctx().scene.camera;
  cam.updateMatrixWorld(true);
  const v = cam.matrixWorldInverse.copy(cam.matrixWorld).invert().elements, e = cam.projectionMatrix.elements;
  const x = v[0] * p[0] + v[4] * p[1] + v[8] * p[2] + v[12], y = v[1] * p[0] + v[5] * p[1] + v[9] * p[2] + v[13], z = v[2] * p[0] + v[6] * p[1] + v[10] * p[2] + v[14];
  return { x: (0.5 + 0.5 * e[0] * x / -z) * 960, y: (0.5 - 0.5 * e[5] * y / -z) * 540, ahead: -z };
}, p);
function meanDiff(a, b) {
  let sum = 0;
  for (let i = 0; i < a.data.length; i += 4) sum += (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2])) / 3;
  return sum / (a.data.length / 4);
}
const luma = (img, i) => 0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2];
/** pixels of `a` that differ from `b` by more than `by` grey levels, inside a box (the whole frame without one); `sign` 1: brighter only, -1: darker only */
function changed(a, b, by, box, sign = 0) {
  const x0 = Math.max(0, Math.floor(box ? box.x0 : 0)), x1 = Math.min(W, Math.ceil(box ? box.x1 : W)), y0 = Math.max(0, Math.floor(box ? box.y0 : 0)), y1 = Math.min(H, Math.ceil(box ? box.y1 : H));
  let n = 0, rows = new Set();
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * W + x) * 4, d = luma(a, i) - luma(b, i);
    if (sign === 0 ? Math.abs(d) > by : d * sign > by) { n++; rows.add(y); }
  }
  return { n, rows };
}

test('the air light: lamps glow in the air on High; additive, cut by nothing it adds, no pass and no program for it', async () => {
  await jump('cp_hall_gantry');
  await place([-16.5, -12, -14], [-6.5, -10.65, -14]);
  const perf0 = await page.evaluate(() => ({ programs: window.__dbg.perf().programs, fs: window.__dbg.ext.render.fullScreenDraws(), targets: window.__dbg.ext.render.targets().allocated }));
  const air = await read('air');
  assert.ok(air.level > 0.95, `the hall's mood names an air light and it has settled (level ${air.level})`);
  assert.ok(air.count >= 4 && air.count <= 12, `the hall's pendants are in the set (${air.count} of ${air.offered} offered)`);
  const on = await grab('air_hall_on');
  const off0 = await set('air', false);
  assert.equal(off0.on, false);
  const off = await grab('air_hall_off');
  const d = meanDiff(on, off), darker = changed(on, off, 2, null, -1).n, brighter = changed(on, off, 4, null, 1).n;
  console.log(`air light, the hall from the gantry: ${air.count} lamps of ${air.offered}; ${d.toFixed(2)} of 255 between on and off; ${brighter} px brighter by more than 4, ${darker} darker by more than 2`);
  assert.ok(d > 0.3, `the air light shows (${d.toFixed(2)} of 255)`);
  assert.ok(brighter > 0.01 * W * H, `over one pixel in a hundred is lifted (${brighter})`);
  assert.ok(darker < 0.001 * W * H, `it only adds light (${darker} px darker)`);
  await page.evaluate(async () => { window.__dbg.ext.render.air(true); await window.__dbg.ext.core.stepAsync(90, true); });
  const perf1 = await page.evaluate(() => ({ programs: window.__dbg.perf().programs, fs: window.__dbg.ext.render.fullScreenDraws(), targets: window.__dbg.ext.render.targets().allocated }));
  assert.equal(perf1.fs, 12, 'High still makes 12 full-screen draws');
  assert.deepEqual(perf1, perf0, 'switching it changes no program, pass or target');
  // the chamber: the bore's glow is one of the lamps (a layout light: reach 7 m)
  await jump('cp_boss_p1');
  await page.evaluate(() => window.__dbg.ext.core.stepAsync(60, true));
  const bore = await read('air');
  const reaches = bore.lamps.filter((_, i) => i % 4 === 3);
  assert.ok(reaches.includes(7), `the bore's glow is in the chamber's set (reaches ${reaches.join(' ')})`);
});

test('the shadow map in a room: a creature stands on its own shadow, the blob is not drawn, fixed machinery casts nothing', async () => {
  await jump('cp_tally_enter');
  const at = [-89, 0, -24], from = [-86, 0, -19];
  await spawn('bider', at, from);
  await place(from, [at[0], 0.7, at[2]], 30);
  const s = await read('shadow');
  assert.equal(s.live, true, 'the pass runs in the Tally House');
  assert.equal(s.half, 13, 'a room\'s map is 26 m square');
  assert.ok(s.dir[1] > 0.9, `it looks down (${s.dir.join(', ')})`);
  assert.ok(s.shown >= 1, `the room's chunks carry their twins (${s.shown} drawn)`);
  const quadsOn = await page.evaluate(() => window.__dbg.ext.render.vfx().quads);
  const on = await grab('shadow_tally_on');
  const feet = await project(at);
  await set('shadow', false);
  const quadsOff = await page.evaluate(() => window.__dbg.ext.render.vfx().quads);
  const off = await grab('shadow_tally_off');
  const box = { x0: feet.x - 120, x1: feet.x + 120, y0: feet.y - 70, y1: feet.y + 60 };
  const c = changed(on, off, 6, box).n;
  console.log(`room shadow, a Bider in the Tally House: ${c} px differ round its feet (${Math.round(feet.x)}, ${Math.round(feet.y)}); quads ${quadsOn} with the map, ${quadsOff} without (the blob)`);
  assert.ok(feet.ahead > 1 && feet.x > 0 && feet.x < W && feet.y > 0 && feet.y < H, 'the feet are in the frame');
  assert.ok(quadsOff > quadsOn, `the blob is drawn only without the map (${quadsOn} / ${quadsOff} quads)`);
  assert.ok(c > 40, `the shadow is not the blob (${c} px differ)`);
  await set('shadow', true);
  // the antechamber: the bore door, the cradle and the plate are fixed machinery; the room's baked pools stay as baked
  await jump('cp_bore_ante');
  await page.evaluate(() => window.__dbg.ext.core.stepAsync(30, true));
  assert.equal((await read('shadow')).live, true);
  const a = await grab('shadow_ante_on');
  await set('shadow', false);
  const b = await grab('shadow_ante_off');
  await set('shadow', true);
  const d = meanDiff(a, b);
  console.log(`room shadow, the antechamber with nobody in it: ${d.toFixed(3)} of 255 between the map on and off`);
  assert.ok(d < 0.25, `doors and cradles cast nothing in a room (${d.toFixed(3)} of 255)`);
});

test('outdoors by day: the map is the sun\'s; sunlit sand sparkles; the horizon shimmers only in its band and not with Reduce Motion', async () => {
  await jump('cp_street_clear');
  await page.evaluate(async () => { window.__dbg.killAll(true); await window.__dbg.ext.core.stepAsync(120, false); });
  await place([-22, 0, 2], [-30, 0.3, -1], 30);
  const s = await read('shadow');
  assert.equal(s.live, true);
  assert.equal(s.half, 26, 'the sun\'s map keeps its 52 m square');
  assert.ok(Math.abs(s.dir[1] - 0.242) < 0.01, `it looks along the sun (${s.dir.join(', ')})`);
  // sparkle
  assert.ok((await read('sparkle')).k > 0, 'the Long Light has a sparkle');
  await set('shimmer', false);
  const on = await grab('sparkle_on');
  await set('sparkle', false);
  const off = await grab('sparkle_off');
  await set('sparkle', true);
  const glints = changed(on, off, 25, null, 1).n, dark = changed(on, off, 3, null, -1).n;
  console.log(`sand sparkle, the street's sunlit sand: ${glints} px brighter by more than 25, ${dark} darker`);
  assert.ok(glints >= 40, `grains flash (${glints} px)`);
  assert.ok(glints < 0.02 * W * H, `a sparkle, not a sheet (${glints} px)`);
  // (the FXAA pass after it softens the pixels beside a glint: a few of them end a little darker)
  assert.ok(dark < glints / 5, `it only adds light (${dark} px darker beside ${glints} glints)`);
  // relief: the same sunlit sand, the ripples of its detail texture
  const rk = await read('relief');
  assert.ok(rk.k > 0, 'the Long Light has a relief');
  await set('sparkle', false);
  const flat0 = await set('relief', false);
  assert.equal(flat0.k, 0);
  const flat = await grab('relief_off');
  await set('relief', true);
  const bumpy = await grab('relief_on');
  await set('sparkle', true);
  const rd = meanDiff(bumpy, flat), up = changed(bumpy, flat, 2, null, 1).n, down = changed(bumpy, flat, 2, null, -1).n;
  console.log(`relief, the street's sunlit sand: ${rd.toFixed(2)} of 255 between on and off; ${up} px lifted, ${down} lowered by more than 2`);
  assert.ok(up > 2000 && down > 2000, `sunward sides lift and lee sides fall (${up} / ${down} px)`);
  assert.ok(rd < 6, `a relief, not another light (${rd.toFixed(2)} of 255)`);
  // shimmer: from the lip gate, west over the town to the far mesas
  await jump('cp_lip_gate');
  await place([5, 0, 0], [-60, 1.65, -8], 10);
  await set('shimmer', true);
  assert.equal((await read('shimmer')).level, 1);
  const horizon = await project([5 - 4000, 1.65, -500]);
  const a = await grab('shimmer_on');
  await set('shimmer', false);
  const b = await grab('shimmer_off');
  await set('shimmer', true);
  const c = changed(a, b, 1.5, null);
  const band = 0.5 * Math.tan(7 * Math.PI / 180) / Math.tan(26 * Math.PI / 180) * H;
  let outside = 0;
  for (const y of c.rows) if (Math.abs(y - horizon.y) > band + 3) outside++;
  console.log(`heat shimmer: ${c.n} px moved in ${c.rows.size} rows round the horizon (row ${horizon.y.toFixed(0)}, band +-${band.toFixed(0)} px); ${outside} rows outside it`);
  assert.ok(c.n > 60, `the far air moves (${c.n} px)`);
  assert.equal(outside, 0, 'nothing off the horizon band is touched');
  await page.evaluate(() => { window.__dbg.ext.core.ctx().options.set('reduceMotion', true); window.__dbg.step(0, true); });
  assert.equal((await read('shimmer')).level, 0, 'still with Reduce Motion');
  await page.evaluate(() => { window.__dbg.ext.core.ctx().options.set('reduceMotion', false); window.__dbg.step(0, true); });
});

test('what it costs: no program links in a fight in the hall or the chamber, and High keeps its caps', async () => {
  const rows = [];
  for (const [cp, kind, at] of [['cp_hall_gantry', 'tamper', [14, -15, -14]], ['cp_boss_p1', null, null]]) {
    await jump(cp, true);
    if (kind) await page.evaluate(([kind, at]) => { window.__dbg.spawnEnemy(kind, at[0], at[1], at[2], 90); }, [kind, at]);
    // the first frames after the jump are the set's own warm-up; the fight is what follows
    await page.evaluate(() => window.__dbg.ext.core.stepAsync(20, true));
    const r = await page.evaluate(async () => {
      const d = window.__dbg, l0 = window.__links;
      let dc = 0, tris = 0;
      for (let i = 0; i < 12; i++) {
        d.tap('fire');
        await d.ext.core.stepAsync(20, true);
        const q = d.perf();
        dc = Math.max(dc, q.drawCalls); tris = Math.max(tris, q.triangles);
      }
      return { links: window.__links - l0, dc, tris, enemies: d.enemies().length, shadow: d.ext.render.shadow().live, air: d.ext.render.air().count };
    });
    rows.push(`${cp}: ${r.links} links in 240 drawn ticks, ${r.dc} draw calls, ${r.tris} triangles, ${r.enemies} alive, ${r.air} lamps in the air`);
    assert.equal(r.links, 0, `${cp}: ${r.links} programs linked in the fight`);
    assert.equal(r.shadow, true);
    assert.ok(r.dc <= 220, `${cp}: ${r.dc} draw calls (High: 220)`);
    assert.ok(r.tris <= 400000, `${cp}: ${r.tris} triangles (High: 400 000)`);
  }
  console.log(rows.join('\n'));
});

test('Low has none of it', async () => {
  await jump('cp_hall_gantry');
  await page.evaluate(async () => { const d = window.__dbg; d.setTier('low'); await d.ext.core.stepAsync(30, true); });
  const r = await page.evaluate(() => { const d = window.__dbg, x = d.ext.render; return { air: x.air(), shadow: x.shadow(), fs: x.fullScreenDraws() }; });
  assert.equal(r.fs, 1, 'Low makes one full-screen draw');
  assert.equal(r.air.level, 0); assert.equal(r.air.count, 0);
  assert.equal(r.shadow.tier, false); assert.equal(r.shadow.live, false); assert.equal(r.shadow.shown, 0, 'no shadow twin is drawn on Low');
  await jump('cp_street_clear');
  await page.evaluate(() => window.__dbg.ext.core.stepAsync(10, true));
  const o = await page.evaluate(() => { const x = window.__dbg.ext.render; return { sparkle: x.sparkle().k, relief: x.relief().k, shimmer: x.shimmer().level, twins: x.shadow().shown }; });
  assert.deepEqual(o, { sparkle: 0, relief: 0, shimmer: 0, twins: 0 }, 'no sparkle, no relief, no shimmer and no twin outdoors on Low');
});
