// Pass i5 (render-tech), the REAL game at 960 x 540. Frames: shots/i5-team-render-tech/test/.
//   1  visual-b  "creatures have only a faint contact shadow in shade": the blob multiplies the ground, and in a building's
//                shade that was a few grey levels. Outdoors, where the fixed world stands between the blob and the sun
//                (RenderSystem.shadeAt: one sight line per drawn frame, one blob at a time), the blob is deeper and has a
//                tight contact core, more so on High; in the sun and indoors it is drawn exactly as before; the change
//                is eased, never a pop, and costs no quad and no draw call.
// One browser at a time; each leg a few hundred ticks.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { ROOT, startServer } from '../harness.mjs';
import { openBot } from '../e2e/lib/bot.mjs';

const SHOTS = path.join(ROOT, 'shots/i5-team-render-tech/test');
const W = 960, H = 540;
fs.mkdirSync(SHOTS, { recursive: true });
const LAYOUT = JSON.parse(fs.readFileSync(path.join(ROOT, 'design/layout.json'), 'utf8'));
// Front Street at cp_street_clear: the north row's shade lies over the middle of the street, the sun on its south edge
const SHADE = [-40, 0.02, 0], SUN = [-40, 0.02, 6];
const tally = LAYOUT.zones.find((z) => z.id === 'tally_house').bounds;
const INDOORS = [(tally.min[0] + tally.max[0]) / 2, tally.min[1] + 0.02, (tally.min[2] + tally.max[2]) / 2];
let server = null, bot = null, page = null;
async function close() { if (bot) { try { await bot.game.browser.close(); } catch { /* closed */ } bot = null; } }
async function open(tier, checkpoint) {
  await close();
  if (!server) server = await startServer({});
  bot = await openBot(server, { piece: 'i5-team-render-tech', tier, checkpoint, viewport: { width: W, height: H }, allowErrors: true });
  page = bot.page;
  await page.evaluate(async () => { const d = window.__dbg; d.god(true); d.aiEnabled(false); await d.ext.core.stepAsync(20, true); });
}
after(async () => { await close(); if (server) await server.close(); });
const read = (url) => PNG.sync.read(Buffer.from(url.split(',')[1], 'base64'));
/** mean luminance (0..255) of the 20 x 16 pixels at the middle of the frame: where the camera is aimed */
function centre(png) {
  let s = 0, n = 0;
  for (let y = H / 2 - 8; y < H / 2 + 8; y++) for (let x = W / 2 - 10; x < W / 2 + 10; x++) { const i = (y * png.width + x) * 4; s += 0.2126 * png.data[i] + 0.7152 * png.data[i + 1] + 0.0722 * png.data[i + 2]; n++; }
  return s / n;
}
/** a bare blob (no creature over it) at a point, seen from 3 m with the probe on or off: the frame with it and without */
async function blobAt(at, on, name) {
  const r = await page.evaluate(async ({ at, on }) => {
    const d = window.__dbg, v = d.ext.core.ctx().render.vfx;
    d.ext.render.blobs(on);
    const h = v.blobShadow(); h.setPosition(at[0], at[1], at[2]);
    for (let i = 0; i < 2; i++) { d.teleport(at[0] + 3, 0, at[2]); d.aimAt(at[0], at[1], at[2]); await d.ext.core.stepAsync(i ? 1 : 3, true); }
    const withBlob = d.capture(), state = d.ext.render.blobs().list.find((b) => b.x === at[0] && b.z === at[2]), quads = d.ext.render.vfx().quads, calls = d.perf().drawCalls;
    h.release(); await d.ext.core.stepAsync(1, true);
    return { withBlob, bare: d.capture(), state, quads, calls };
  }, { at, on });
  if (name) fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(r.withBlob.split(',')[1], 'base64'));
  const ground = centre(read(r.bare)), under = centre(read(r.withBlob));
  return { state: r.state, quads: r.quads, calls: r.calls, ground, under, dark: ground - under };
}

for (const tier of ['low', 'high']) {
  test(`1 (${tier}): a blob in a building's shade is a contact shadow; in the sun and indoors it is the blob it was`, async () => {
    await open(tier, 'cp_street_clear');
    const high = tier === 'high';
    if (high) {
      const sh = await page.evaluate(() => window.__dbg.ext.render.shadow());
      assert.ok(sh.live && sh.statics > 0, `High: the town casts into the sun's map (${JSON.stringify(sh)})`);
    }
    // in shade
    const was = await blobAt(SHADE, false, `blob_${tier}_shade_before`), now = await blobAt(SHADE, true, `blob_${tier}_shade_after`);
    console.log(`${tier}, in shade: ground ${now.ground.toFixed(1)}, under the blob ${was.under.toFixed(1)} -> ${now.under.toFixed(1)} (darkening ${was.dark.toFixed(1)} -> ${now.dark.toFixed(1)} levels); state ${JSON.stringify(now.state)}`);
    assert.equal(was.state.shade, 0, 'probe off: the blob as it was');
    assert.equal(now.state.shade, 1, 'the probe finds the shade');
    assert.ok(now.state.alpha >= 0.8 && now.state.core >= 0.4, 'deeper, with a contact core');
    assert.ok(now.dark >= 28, `the ground under the feet is ${now.dark.toFixed(1)} levels darker than the ground beside (>= 28)`);
    assert.ok(now.dark >= was.dark * 1.5, `at least half as dark again as before (${was.dark.toFixed(1)} -> ${now.dark.toFixed(1)})`);
    assert.equal(now.quads, was.quads, 'no quad more');
    // in the sun: nothing changes
    const sunWas = await blobAt(SUN, false, `blob_${tier}_sun_before`), sunNow = await blobAt(SUN, true, `blob_${tier}_sun_after`);
    console.log(`${tier}, in the sun: ground ${sunNow.ground.toFixed(1)}, under the blob ${sunWas.under.toFixed(1)} -> ${sunNow.under.toFixed(1)}; state ${JSON.stringify(sunNow.state)}`);
    assert.equal(sunNow.state.shade, 0); assert.equal(sunNow.state.alpha, 0.55); assert.equal(sunNow.state.core, 0);
    assert.ok(Math.abs(sunNow.under - sunWas.under) < 2, `the blob in the sun is unchanged (${sunWas.under.toFixed(1)} / ${sunNow.under.toFixed(1)})`);
    // walking from the sun into the shade: eased, one probe per frame, and back; indoors never
    const walk = await page.evaluate(async ({ SUN, SHADE, INDOORS }) => {
      const d = window.__dbg, v = d.ext.core.ctx().render.vfx;
      d.ext.render.blobs(true);
      const h = v.blobShadow(), inside = v.blobShadow();
      h.setPosition(SUN[0], SUN[1], SUN[2]); inside.setPosition(INDOORS[0], INDOORS[1], INDOORS[2]);
      d.teleport(SHADE[0] + 3, 0, SHADE[2]); d.aimAt(SHADE[0], SHADE[1], SHADE[2]);
      await d.ext.core.stepAsync(20, true);
      const mine = () => d.ext.render.blobs().list.find((b) => b.x === h.__x && b.z === h.__z);
      const seq = [];
      h.__x = SUN[0]; h.__z = SUN[2]; seq.push(mine().shade);
      h.setPosition(SHADE[0], SHADE[1], SHADE[2]); h.__x = SHADE[0]; h.__z = SHADE[2];
      for (let i = 0; i < 90; i++) { await d.ext.core.stepAsync(1, true); seq.push(mine().shade); }
      const indoors = d.ext.render.blobs().list.find((b) => b.x === INDOORS[0] && b.z === INDOORS[2]);
      h.release(); inside.release();
      return { seq, indoors };
    }, { SUN, SHADE, INDOORS });
    const first = walk.seq.findIndex((s) => s > 0), step = Math.max(...walk.seq.slice(1).map((s, i) => s - walk.seq[i]));
    console.log(`${tier}, sun -> shade: first change after ${first} frames, largest step ${step.toFixed(3)}, after 90 frames ${walk.seq[90].toFixed(3)}; indoors ${JSON.stringify(walk.indoors)}`);
    assert.equal(walk.seq[0], 0);
    assert.ok(first >= 1 && first <= 17, `probed within a turn of the 16 slots (${first})`);
    assert.ok(step < 0.2, `eased, no pop (largest step ${step.toFixed(3)})`);
    for (let i = 1; i < walk.seq.length; i++) assert.ok(walk.seq[i] >= walk.seq[i - 1] - 1e-9, 'monotone');
    assert.ok(walk.seq[90] > 0.95, `settled (${walk.seq[90]})`);
    assert.ok(walk.indoors && walk.indoors.shade === 0 && walk.indoors.core === 0, 'indoors the blob is never deepened');
  });
}

test('1 (high): a Bider in the street\'s shade stands on the deeper blob, inside the draw-call budget', async () => {
  // (the browser of the High leg is still open)
  const out = await page.evaluate(async ([x, y, z]) => {
    const d = window.__dbg;
    d.ext.render.blobs(true);
    d.spawnEnemy('bider', x, 0, z, Math.PI / 2); await d.ext.core.stepAsync(30, true);
    for (let i = 0; i < 2; i++) { d.teleport(x + 3, 0, z); d.aimAt(x, 0.3, z); await d.ext.core.stepAsync(i ? 1 : 3, true); }
    return { url: d.capture(), list: d.ext.render.blobs().list, perf: d.perf() };
  }, SHADE);
  fs.writeFileSync(path.join(SHOTS, 'bider_high_shade.png'), Buffer.from(out.url.split(',')[1], 'base64'));
  const b = out.list.find((q) => Math.hypot(q.x - SHADE[0], q.z - SHADE[2]) < 1.5);
  console.log(`High, a Bider in the street's shade: ${JSON.stringify(b)}; ${out.perf.drawCalls} draw calls, ${out.perf.triangles} triangles`);
  assert.ok(b && b.shade > 0.95 && b.alpha > 0.8 && b.core > 0.4, 'the Bider\'s own blob is the contact shadow, and High\'s is deeper than Low\'s (0.8 / 0.4)');
  assert.ok(out.perf.drawCalls <= 220, `${out.perf.drawCalls} draw calls`);
});
