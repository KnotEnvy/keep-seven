// Polish round 4, lead ruling R9 ("High must look visibly richer than Low wherever a player would compare them"): what the
// High tier adds, on the REAL game at 960 x 540. Frames: shots/r4-team-underground-look/test/.
//
//   the mood's bloom        the threshold is a display level named by the mood (0.25 at the blue hour, 1.15 in the Tally House)
//   the contact shade       High keeps the scene's depth and shades the gallery; the view-model takes none of it; Low has none
//   High against Low        the gallery and the last image differ by more than they did (0.3 to 0.6 of 255 before)
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { ROOT, startServer } from '../harness.mjs';
import { openBot } from '../e2e/lib/bot.mjs';

const SHOTS = path.join(ROOT, 'shots/r4-team-underground-look/test');
const W = 960, H = 540;
let server, bot, page;
before(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  server = await startServer({});
  bot = await openBot(server, { piece: 'r4-team-underground-look', tier: 'low', checkpoint: 'cp_lip_start', viewport: { width: W, height: H }, allowErrors: true });
  page = bot.page;
});
after(async () => { try { await bot.game.browser.close(); } catch { /* closed */ } await server.close(); });

async function grab(name) {
  const url = await page.evaluate(() => window.__dbg.capture());
  const buf = Buffer.from(url.split(',')[1], 'base64');
  if (name) fs.writeFileSync(path.join(SHOTS, name + '.png'), buf);
  return PNG.sync.read(buf);
}
const jump = (cp) => page.evaluate(async (cp) => { const d = window.__dbg; await d.checkpoint(cp); d.god(true); d.aiEnabled(false); await d.ext.core.stepAsync(40, true); }, cp);
const place = (pos, at, steps = 20) => page.evaluate(async ({ pos, at, steps }) => { const d = window.__dbg; for (let i = 0; i < 2; i++) { d.teleport(pos[0], pos[1], pos[2]); d.aimAt(at[0], at[1], at[2]); await d.ext.core.stepAsync(i ? 1 : steps, true); } }, { pos, at, steps });
const tier = (t) => page.evaluate(async (t) => { const d = window.__dbg; d.setTier(t); await d.ext.core.stepAsync(20, true); }, t);
const post = () => page.evaluate(() => { const R = window.__dbg.ext.render.system(), p = R.post; return { tier: window.__dbg.ext.core.ctx().quality.tier, keepsDepth: p.keepsDepth, ao: p.aoK.value.w, threshold: p.bloom ? p.bloom.luminanceMaterial.threshold : -1, exposure: R.exposure, draws: p.fullScreenDraws }; });
function diff(a, b) {
  let sum = 0, big = 0;
  for (let i = 0; i < a.data.length; i += 4) { const v = (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2])) / 3; sum += v; if (v > 24) big++; }
  const n = a.data.length / 4;
  return { mean: sum / n, big: big / n };
}

test('the gallery: High keeps the depth and shades it; the view-model is drawn as on Low; Low has no shade', async () => {
  await jump('cp_gallery_baffle');
  await place([-70, -12, -14], [-40, -10.6, -14]);
  const low = await grab('gallery_low');
  const pl = await post();
  assert.equal(pl.keepsDepth, false, 'Low clears the depth for the view-model as before');
  assert.equal(pl.draws, 1, 'Low is one full-screen pass');
  await tier('high');
  const ph = await post();
  assert.equal(ph.tier, 'high');
  assert.equal(ph.keepsDepth, true, 'High keeps the scene depth');
  assert.equal(ph.draws, 12, 'the shade adds no full-screen pass');
  const on = await grab('gallery_high');
  await page.evaluate(() => { window.__dbg.ext.render.system().post.aoK.value.w = 0; });
  const off = await grab('gallery_high_no_shade');
  await page.evaluate(() => { window.__dbg.ext.render.system().post.aoK.value.w = 1; });
  // the view-model's pixels: where the frame changes when the view-model is hidden
  await page.evaluate(() => { const d = window.__dbg; for (const c of d.ext.core.ctx().scene.viewModel.children) c.visible = false; });
  const bare = await grab(null);
  await page.evaluate(() => { const d = window.__dbg; for (const c of d.ext.core.ctx().scene.viewModel.children) c.visible = true; });
  let vm = 0, vmChanged = 0, world = 0, worldDark = 0;
  for (let i = 0; i < on.data.length; i += 4) {
    const d3 = (k) => Math.abs(on.data[i + k] - off.data[i + k]);
    const isVm = Math.abs(on.data[i] - bare.data[i]) + Math.abs(on.data[i + 1] - bare.data[i + 1]) + Math.abs(on.data[i + 2] - bare.data[i + 2]) > 40;
    if (isVm) { vm++; if (d3(0) + d3(1) + d3(2) > 30) vmChanged++; } else { world++; if (off.data[i] + off.data[i + 1] + off.data[i + 2] - on.data[i] - on.data[i + 1] - on.data[i + 2] > 12) worldDark++; }
  }
  const shade = diff(on, off), tiers = diff(low, on);
  console.log(`the gallery: the shade alone moves the frame by ${shade.mean.toFixed(2)} of 255 and darkens ${(100 * worldDark / world).toFixed(1)} % of the world's pixels; ${vm} view-model pixels, ${vmChanged} of them changed by it; Low against High ${tiers.mean.toFixed(2)} (round 4 critic: 0.3 to 0.5)`);
  assert.ok(vm > 10000, `the view-model is on screen and in front (${vm} px)`);
  assert.ok(vmChanged / vm < 0.03, `the view-model takes no shade (${vmChanged} of ${vm} px changed)`);
  assert.ok(worldDark / world > 0.02, `the shade darkens the creases of the gallery (${(100 * worldDark / world).toFixed(1)} % of the world's pixels)`);
  assert.ok(shade.mean > 0.8 && shade.mean < 6, `the shade is seen and is not a flood (${shade.mean.toFixed(2)})`);
  assert.ok(tiers.mean > 1.5, `Low against High in the gallery: ${tiers.mean.toFixed(2)} of 255 (over 1.5)`);
  await tier('low');
});

test('the last image: the blue hour names its own bloom, and High is not Low there', async () => {
  await jump('cp_rim');
  await place([10, 18, 102], [40, -10, -420]);
  const low = await grab('fire_low');
  await tier('high');
  const p = await post();
  const high = await grab('fire_high');
  const d = diff(low, high);
  console.log(`the last image, Low against High: ${d.mean.toFixed(2)} of 255, ${(100 * d.big).toFixed(1)} % of pixels over 24 (round 4 critic: 0.3); bloom threshold ${(p.threshold * p.exposure).toFixed(3)} of display white`);
  assert.ok(Math.abs(p.threshold * p.exposure - 0.25) < 0.01, `the blue hour's threshold is its own (${(p.threshold * p.exposure).toFixed(3)})`);
  assert.ok(d.mean > 2, `mean absolute difference ${d.mean.toFixed(2)} (over 2)`);
  // the land stays dark: the glow is the sky's, not a veil over the frame's lower half
  let land = 0, n = 0;
  for (let y = Math.floor(H * 0.75); y < H; y += 2) for (let x = 0; x < Math.floor(W * 0.45); x += 2) { const i = (y * W + x) * 4; land += (high.data[i] + high.data[i + 1] + high.data[i + 2]) / 3 - (low.data[i] + low.data[i + 1] + low.data[i + 2]) / 3; n++; }
  assert.ok(land / n < 6, `the ledge is not lifted by the glow (${(land / n).toFixed(1)} levels)`);
  await tier('low');
});
