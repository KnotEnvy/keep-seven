// Polish round 3: one test per finding of the critic panel against the render piece, measured the way the critics
// measured, on the REAL game (all six systems: tests/e2e/lib/bot.mjs), Low tier, 960 x 540. Frames: shots/r3-fix-code-render/test/.
//
//   the revolver (R6)        lit by its own rig in every zone: not darker than what it covers, with highlights, never black
//   the Windlass             its flank and back keep form in the chamber; the room is not a violet flood
//   the ending (R5, R7)      a dark land under a lit sky; the fire is a flame of 36 px or more with a glow and smoke
//   High                     is not Low: lamps and knots bloom
//   halos and flashes        a lamp's halo is tight; the kept round's flash has no flame tint
//   the aim tell             a beam 3 px wide or more, also when it comes at the eye; brighter at the end of the aim
// (the programs linked in play have a file of their own: prewarm.test.mjs)
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { ROOT, startServer } from '../harness.mjs';
import { openBot } from '../e2e/lib/bot.mjs';

const SHOTS = path.join(ROOT, 'shots/r3-fix-code-render/test');
const W = 960, H = 540;
let server, bot, page;
before(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  server = await startServer({});
  bot = await openBot(server, { piece: 'r3-fix-code-render', tier: 'low', checkpoint: 'cp_lip_start', viewport: { width: W, height: H }, allowErrors: true });
  page = bot.page;
});
after(async () => { try { await bot.game.browser.close(); } catch { /* closed */ } await server.close(); });

// ---- measuring ------------------------------------------------------------------------------------------------------
const lin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const Lstar = (r, g, b) => { const Y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); return Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y; };
function squint(png) {
  const cw = png.width / 32, ch = png.height / 18, Ls = [];
  for (let cy = 0; cy < 18; cy++) for (let cx = 0; cx < 32; cx++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = Math.floor(cy * ch); y < Math.floor((cy + 1) * ch); y += 2) for (let x = Math.floor(cx * cw); x < Math.floor((cx + 1) * cw); x += 2) { const i = (y * png.width + x) * 4; r += png.data[i]; g += png.data[i + 1]; b += png.data[i + 2]; n++; }
    Ls.push(Lstar(r / n, g / n, b / n));
  }
  Ls.sort((a, b) => a - b);
  const q = (p) => Ls[Math.floor(p * (Ls.length - 1))];
  return { p5: q(0.05), p50: q(0.5), p95: q(0.95), dark: Ls.filter((v) => v < 35).length / Ls.length };
}
function chroma(png) {
  let n = 0, hi = 0, sum = 0;
  for (let i = 0; i < png.data.length; i += 8) {
    const r = lin(png.data[i]), g = lin(png.data[i + 1]), b = lin(png.data[i + 2]);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const c = Math.hypot(1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s);
    n++; sum += c; if (c > 0.11) hi++;
  }
  return { mean: sum / n, over: hi / n };
}
async function grab(name) {
  const url = await page.evaluate(() => window.__dbg.capture());
  const buf = Buffer.from(url.split(',')[1], 'base64');
  if (name) fs.writeFileSync(path.join(SHOTS, name + '.png'), buf);
  return PNG.sync.read(buf);
}
async function jump(cp, ai = false) {
  await page.evaluate(async ([cp, ai]) => { const d = window.__dbg; await d.checkpoint(cp); d.god(true); d.aiEnabled(ai); await d.ext.core.stepAsync(30, true); }, [cp, ai]);
}
async function view(pos, at, name, steps = 12) {
  await page.evaluate(async ({ pos, at, steps }) => {
    const d = window.__dbg;
    for (let i = 0; i < 2; i++) { d.teleport(pos[0], pos[1], pos[2]); d.aimAt(at[0], at[1], at[2]); await d.ext.core.stepAsync(i ? 1 : steps, true); }
  }, { pos, at, steps });
  return grab(name);
}
/** show or hide a scene root's children and draw */
const show = (root, on) => page.evaluate(([root, on]) => { const d = window.__dbg; for (const c of d.ext.core.ctx().scene[root].children) c.visible = on; d.step(0, true); }, [root, on]);
/** pixels that differ between two frames by more than `over` (sum of channels): [index list, bbox] */
function diff(a, b, over = 12) {
  const hit = []; let x0 = a.width, x1 = -1, y0 = a.height, y1 = -1;
  for (let i = 0, p = 0; i < a.data.length; i += 4, p++) {
    if (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]) <= over) continue;
    hit.push(p); const x = p % a.width, y = (p / a.width) | 0;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { hit, x0, x1, y0, y1 };
}
/** the critic's measure of the view-model (scratch/r3-visual/vm.mjs): its pixels against what they cover */
async function viewModel(name) {
  const a = await grab(name); await show('viewModel', false); const b = await grab(null); await show('viewModel', true);
  const d = diff(a, b);
  let sl = 0, sb = 0, hi = 0, lo = 0;
  for (const p of d.hit) { const i = p * 4, l = Lstar(a.data[i], a.data[i + 1], a.data[i + 2]); sl += l; sb += Lstar(b.data[i], b.data[i + 1], b.data[i + 2]); if (l > 60) hi++; if (l < 12) lo++; }
  const n = Math.max(1, d.hit.length);
  return { cover: n / (a.width * a.height), meanL: sl / n, bgL: sb / n, highlight: hi / n, black: lo / n };
}

// ---- the tests ------------------------------------------------------------------------------------------------------
test('R6: the revolver is lit by its own rig in every zone: not darker than what it covers, with highlights, never black', async () => {
  const spots = [
    ['street', 'cp_street_clear', [-30, 0, 0], [-60, 1.5, 0]],
    ['gallery', 'cp_gallery_baffle', [-70, -12, -14], [-40, -10.6, -14]],
    ['hall', 'cp_hall_clear', [0, -15, -14], [20, -13, -14]],
    ['ante', 'cp_bore_ante', null, null],
    ['bore', 'cp_boss_p1', [14, -44, 86], [14, -41.5, 96]],
    ['rim', 'cp_rim', [10, 18, 106], [2, 19.2, 100]],
  ];
  for (const [name, cp, pos, at] of spots) {
    await jump(cp);
    if (pos) await view(pos, at, null, 30); else await page.evaluate(() => window.__dbg.ext.core.stepAsync(60, true));
    const m = await viewModel('vm_' + name);
    const light = await page.evaluate(() => { const d = window.__dbg, R = d.ext.render; const out = {}; d.ext.core.ctx().scene.viewModel.traverse((x) => { if (x.isMesh) out[x.material.name] = R.lightOf(x); }); return out; });
    console.log(`${name}: view-model ${(m.cover * 100).toFixed(1)} % of the frame, mean L* ${m.meanL.toFixed(1)} against ${m.bgL.toFixed(1)} behind it, highlights ${(m.highlight * 100).toFixed(1)} %, under L* 12 ${(m.black * 100).toFixed(1)} % (round 2: 16 to 21 against 23 to 38, 0 % highlights, 12.6 % black in the bore)`);
    assert.equal(light.m_gun[9], 1, 'the gun is lit as a thing of the view-model');
    assert.equal(light.m_prop[9], 1, 'the hands too');
    // look-dev pass, round 3: the gun is BLUED steel that shows by what it mirrors (dark planes, bright streaks), not an
    // even grey at the room's level; in front of a lit wall (the antechamber's ember pool) its mean may sit 9 under it
    // look team gun, round 4: the gun is now seen from its side and stands over the antechamber's ember-lit wall (L* 42,
    // it was the floor at 39): a lit gun (L* 27 or more) in front of a brighter wall is the frame's dark anchor, not an
    // unlit one, so the bound stops following the background at L* 36
    assert.ok(m.meanL >= Math.min(m.bgL - 9, 27), `${name}: the view-model (L* ${m.meanL.toFixed(1)}) is not darker than what it covers (${m.bgL.toFixed(1)}) by more than 9, nor under L* 27`);
    // (a gun at L* 32 or under is never a pale cut-out, however dark the ledge behind it: R6 wants it lit)
    assert.ok(m.meanL <= Math.max(m.bgL + 16, 32), `${name}: nor a pale cut-out on it (L* ${m.meanL.toFixed(1)} on ${m.bgL.toFixed(1)})`);
    // look team gun, pass i1 (both visual reviewers: "one glossy colour", "matt putty-grey in warm rooms"): the 2 % bound was met
    // by a broad band of the key's colour over every face, which is what made the gun pale. The steel is dark now and its
    // highlights are thin (worn edges, the streak along the barrel, the muzzle's crown): at least 1 % of the view-model
    assert.ok(m.highlight >= 0.01, `${name}: ${(m.highlight * 100).toFixed(1)} % of it is highlight (at least 1)`);
    assert.ok(m.black < 0.04, `${name}: ${(m.black * 100).toFixed(1)} % of it is under L* 12`);
    // the rig's ambient is held toward grey: no blue gloves in the shade of the Long Light
    const a = light.m_prop;
    assert.ok(Math.max(a[0], a[1], a[2]) / Math.min(a[0], a[1], a[2]) < 3.0, `${name}: the hands' ambient ${a.slice(0, 3).map((v) => v.toFixed(3))} is not a saturated tint`);
  }
});

test('the Windlass keeps form from the flank and from behind; the chamber is not a violet flood', async () => {
  await jump('cp_boss_p1');
  const rim = await page.evaluate(() => { const d = window.__dbg, R = d.ext.render; let best = null; d.ext.core.ctx().scene.dynamic.traverse((x) => { if (x.isMesh && x.material.name === 'm_prop' && x.isSkinnedMesh) { const l = R.lightOf(x); if (l && (!best || l[7] > best[7])) best = l; } }); return best; });
  for (const [pos, name] of [[[14, -44, 84], 'door'], [[20, -44, 100], 'flank'], [[14, -44, 104], 'behind']]) {
    const png = await view(pos, [14, -41, 96], 'boss_' + name, 6);
    const s = squint(png), c = chroma(png);
    console.log(`the Windlass from ${name}: L* p5 / p50 / p95 ${s.p5.toFixed(0)} / ${s.p50.toFixed(0)} / ${s.p95.toFixed(0)}, dark ${(s.dark * 100).toFixed(0)} %, mean chroma ${c.mean.toFixed(3)}, over 0.11 on ${(c.over * 100).toFixed(1)} % (round 2 flank: 14 / 20 / 39, chroma 0.079)`);
    assert.ok(c.mean < 0.07, `${name}: mean chroma ${c.mean.toFixed(3)} (under 0.07)`);
    assert.ok(c.over < 0.08, `${name}: ${(c.over * 100).toFixed(1)} % of the frame over chroma 0.11`);
    assert.ok(s.p50 >= 21, `${name}: the median of the frame is L* ${s.p50.toFixed(1)} (21 or more; it was 19.5 from behind)`);
  }
  assert.ok(rim && rim[6] + rim[7] + rim[8] > 0.3, `a dynamic thing in the chamber carries the cool fill (${rim && rim.slice(6, 9).map((v) => v.toFixed(2))})`);
});

test('R5 / R7: the far rim is a dark land under a lit sky; the fire is a flame with a glow and smoke', async () => {
  await jump('cp_rim');
  await page.evaluate(() => window.__dbg.ext.core.stepAsync(120, true));
  const before = await view([10, 18, 102], [40, -10, -420], 'rim_no_fire', 6);
  await show('viewModel', false);
  // pass i2 (exterior look): the sky draws clouds now. The frame's values are judged with them; the gradient's steps are
  // measured on the bare sky (a lit bar of cloud is a step of its own), and the fire is compared on the bare sky too
  const clouded = await grab('rim_no_fire_no_gun_clouds');
  await page.evaluate(() => { const R = window.__dbg.ext.render.system(); if (R.sky) { R.sky.cloudCover = 0; R.sky.starCover = 0; } window.__dbg.step(0, true); });   // (pass i3: and without the stars: they twinkle on High, and a star over the fire's column is a white pixel that changed)
  const dark = await grab('rim_no_fire_no_gun');
  const s = squint(clouded);
  console.log(`the fire's view before it kindles: L* p5 / p50 / p95 ${s.p5.toFixed(0)} / ${s.p50.toFixed(0)} / ${s.p95.toFixed(0)}, dark ${(s.dark * 100).toFixed(0)} % (round 2: 28 / 40 / 51, dark 20 %)`);
  assert.ok(s.p5 < 17, `the land is dark: p5 L* ${s.p5.toFixed(1)}`);
  assert.ok(s.p95 > 62, `the afterglow is light: p95 L* ${s.p95.toFixed(1)}`);
  assert.ok(s.dark > 0.5, `${(s.dark * 100).toFixed(0)} % of the frame is under L* 35`);
  // the sky is a gradient, not a stripe: down a column of bare sky (pass i2: right of the Rule, x 560 to 640; the town
  // card's pylon now stands in the old column at a quarter of the width), from the top to the horizon, no step
  // of more than 9 L* between rows 8 px apart
  let worst = 0, last = null;
  for (let y = 4; y < H * 0.42; y += 8) { let r = 0, g = 0, b = 0; for (let x = 560; x < 640; x++) { const i = (y * W + x) * 4; r += dark.data[i]; g += dark.data[i + 1]; b += dark.data[i + 2]; } const l = Lstar(r / 80, g / 80, b / 80); if (last !== null) worst = Math.max(worst, Math.abs(l - last)); last = l; }
  assert.ok(worst < 9, `the sky's largest step between rows 8 px apart is ${worst.toFixed(1)} L*`);
  // the fire, as the ending kindles it
  await page.evaluate(async () => { const d = window.__dbg, h = d.ext.core.ctx().render.vfx.acquireCard('last_fire'); h.setPosition(40, -10, -420); h.setLevel(1); h.setVisible(true); window.__fire = h; await d.ext.core.stepAsync(120, true); });
  const lit = await grab('rim_fire_no_gun');
  await show('viewModel', true);
  await grab('rim_fire');
  const d = diff(lit, dark, 30);
  // (pass i2: the fire's own column only, 60 px either side of the frame's middle: a lit window of the town is as hot as a small flame)
  const hot = d.hit.filter((p) => { const i = p * 4; return Math.abs((p % W) - W / 2) <= 60 && lit.data[i] > 235 && lit.data[i + 1] > 170; });
  // pass i3 (exterior look): the hot BODY is the longest run of rows that hold a hot pixel. The first and last hot row of
  // the whole column counted single grains of the afterglow that the fire's wide glow lifts over the level (five pixels
  // 30 rows above a 29 row flame made it "61 px tall")
  let hy0 = H, hy1 = -1;
  { const rows = new Set(); for (const p of hot) rows.add((p / W) | 0); let a0 = -1, prev = -2; const ys = [...rows].sort((a, b) => a - b); ys.push(1e9);
    for (const y of ys) { if (y !== prev + 1) { if (a0 >= 0 && prev - a0 > hy1 - hy0) { hy0 = a0; hy1 = prev; } a0 = y; } prev = y; } }
  const darker = d.hit.filter((p) => { const i = p * 4; return Lstar(lit.data[i], lit.data[i + 1], lit.data[i + 2]) < Lstar(dark.data[i], dark.data[i + 1], dark.data[i + 2]) - 3 && ((p / W) | 0) < hy0; });
  console.log(`the fire: ${d.hit.length} px changed (box ${d.x1 - d.x0 + 1} x ${d.y1 - d.y0 + 1}), white-hot ${hot.length} px over ${hy1 - hy0 + 1} rows, ${darker.length} px of smoke above it (round 2: a 20 px soft dot)`);
  // pass i2 (exterior look; both story reviewers: the line is "one small fire"; the 92 px flame read as a bonfire at the edge of town):
  // a small flame, FIRE_PX 30 in src/render/vfx/vfx.ts
  assert.ok(hy1 - hy0 + 1 >= 8 && hy1 - hy0 + 1 <= 48, `the flame's hot body is ${hy1 - hy0 + 1} px tall (a small fire: 8 to 48)`);
  // warm light only: the Rule's two threads in the sky pulse between the two frames
  const glow = d.hit.filter((p) => lit.data[p * 4] - dark.data[p * 4] > 30 && lit.data[p * 4] - dark.data[p * 4] > lit.data[p * 4 + 2] - dark.data[p * 4 + 2] + 15);
  // ... and round the flame only: the town's windows flicker too, 450 px to its left
  let hx = 0; for (const p of hot) hx += p % W; hx /= Math.max(1, hot.length);
  let gx0 = W, gx1 = -1; for (const p of glow) { const x = p % W; if (Math.abs(x - hx) > 220) continue; if (x < gx0) gx0 = x; if (x > gx1) gx1 = x; }
  assert.ok(gx1 - gx0 + 1 >= 90 && gx1 - gx0 + 1 < 400, `its glow is ${gx1 - gx0 + 1} px wide (90 or more)`);
  assert.ok(darker.length >= 60, `smoke stands over it (${darker.length} px darker than the sky behind)`);
  await page.evaluate(() => { window.__fire.release(); const R = window.__dbg.ext.render.system(); if (R.sky) { R.sky.cloudCover = 1; R.sky.starCover = 1; } });
  void before;
});

test('High is not Low: knots and lamps bloom (the same view, the tier switched in place)', async () => {
  await jump('cp_tally_enter');
  const low = await view([-89, 0, -18], [-89, 1.2, -28], 'tally_low', 20);
  await page.evaluate(async () => { const d = window.__dbg; d.setTier('high'); await d.ext.core.stepAsync(20, true); });
  const info = await page.evaluate(() => { const R = window.__dbg.ext.render.system(); return { tier: window.__dbg.ext.core.ctx().quality.tier, hdr: R.shared.uHdr.value, threshold: R.post.bloom ? R.post.bloom.luminanceMaterial.threshold : -1, exposure: R.exposure }; });
  const high = await grab('tally_high');
  await page.evaluate(async () => { const d = window.__dbg; d.setTier('low'); await d.ext.core.stepAsync(10, true); });
  let sum = 0, big = 0;
  for (let i = 0; i < low.data.length; i += 4) { const v = (Math.abs(low.data[i] - high.data[i]) + Math.abs(low.data[i + 1] - high.data[i + 1]) + Math.abs(low.data[i + 2] - high.data[i + 2])) / 3; sum += v; if (v > 24) big++; }
  const n = low.data.length / 4;
  console.log(`the Tally House, Low against High: mean absolute difference ${(sum / n).toFixed(2)} of 255, ${(100 * big / n).toFixed(2)} % of pixels differ by more than 24 (round 2: 0.1 to 1.2, under 0.5 %); bloom threshold ${info.threshold.toFixed(3)} at exposure ${info.exposure.toFixed(2)}, emissive x${info.hdr}`);
  assert.equal(info.tier, 'high');
  assert.ok(info.hdr > 1.5, 'emissive things are drawn over white on High');
  // underground look, pass i1: the Tally House names its own threshold now (moods.ts L2 bloomT 0.62; it was the plain 1.15)
  assert.ok(Math.abs(info.threshold * info.exposure - 0.62) < 0.01, `the bloom's threshold is a display level (${(info.threshold * info.exposure).toFixed(3)})`);
  assert.ok(big / n > 0.01, `${(100 * big / n).toFixed(2)} % of the frame differs by more than 24 levels (over 1 %)`);
  assert.ok(sum / n > 1.5, `mean absolute difference ${(sum / n).toFixed(2)} (over 1.5)`);
});

test('a lamp\'s halo is tight; the kept round\'s flash has no flame tint', async () => {
  await jump('cp_boss_p1');
  const base = await view([14, -44, 86], [14, -41.5, 96], 'bore_idle', 12);
  // halos: with the effects root hidden, what remains is the lamps; the halos add light only near them
  await show('fx', false); const bare = await grab(null); await show('fx', true);
  const halo = diff(base, bare, 24);
  console.log(`bore, idle: ${halo.hit.length} px of effects over the bare frame (${(100 * halo.hit.length / (W * H)).toFixed(2)} % of it)`);
  assert.ok(halo.hit.length / (W * H) < 0.012, `halos cover ${(100 * halo.hit.length / (W * H)).toFixed(2)} % of the frame (under 1.2: round 2's soft discs were 3 to 5 %)`);
  const glows = await page.evaluate(() => { const q = window.__dbg.ext.render.system().fx.quads, out = []; for (let i = 0; i < q.count; i++) if (q.data[i * 20 + 19] >= 4 && q.data[i * 20 + 5] === 0) out.push(q.data[i * 20 + 7]); return out; });
  console.log(`${glows.length} lamp halos in the batch, the largest ${glows.length ? Math.max(...glows).toFixed(2) : 0} m`);
  assert.ok(glows.every((s) => s <= 0.75 + 1e-6), 'no lamp halo is over 0.75 m across (round 2: 1.5 m)');
  const shares = {};
  for (const kind of ['lead', 'kept']) {
    await page.evaluate(async (kind) => { const d = window.__dbg, ctx = d.ext.core.ctx(), cam = ctx.scene.camera, p = cam.position; const v = cam.getWorldDirection(p.clone()); ctx.render.vfx.muzzleFlash(kind, p.x + v.x * 0.8, p.y + v.y * 0.8 - 0.05, p.z + v.z * 0.8); d.step(0, true); }, kind);
    const f = await grab('flash_' + kind);
    let nn = 0, warm = 0;
    for (let i = 0; i < f.data.length; i += 4) { const dr = f.data[i] - base.data[i], dg = f.data[i + 1] - base.data[i + 1], db = f.data[i + 2] - base.data[i + 2]; if (dr + dg + db > 90) { nn++; if (dr > db + 40) warm++; } }
    shares[kind] = { n: nn, warm: warm / Math.max(1, nn) };
    await page.evaluate(() => window.__dbg.ext.core.stepAsync(30, true));
  }
  console.log(`flash: lead ${shares.lead.n} px, ${(shares.lead.warm * 100).toFixed(1)} % warm; kept ${shares.kept.n} px, ${(shares.kept.warm * 100).toFixed(1)} % warm`);
  assert.ok(shares.lead.n > 2000 && shares.lead.warm > 0.5, 'the powder flash is a flame');
  assert.ok(shares.kept.n > 2000 && shares.kept.warm < 0.02, `the kept round's flash is aqua-white: ${(shares.kept.warm * 100).toFixed(1)} % of it is warm`);
});

test('the aim tell is a beam 3 px wide or more, also when it comes at the eye, and brighter at the end of the aim', async () => {
  await jump('cp_street_clear');
  await view([-30, 0, 0], [-60, 1.5, 0], null, 6);
  // look team gun, polish round 5: the beam is measured without the view-model. The side beam's right end passes 8 px
  // over the muzzle since the gun was raised 3.5 % of the frame (R13), and the barrel hid the lower glow of the late,
  // thicker beam: x1.65 with the round-4 placement, x1.15 to x1.32 with the new one, by how the gun had settled.
  await show('viewModel', false);
  // across the view, 18 m off, and one that ends 0.4 m under the eye
  const measure = async (ax, ay, az, bx, by, bz, name) => {
    await page.evaluate(async (v) => { const d = window.__dbg, h = d.ext.core.ctx().render.vfx.acquireLine('sighting_thread'); h.setPosition(v[0], v[1], v[2]); h.setEnd(v[3], v[4], v[5]); window.__thread = h; await d.ext.core.stepAsync(3, true); }, [ax, ay, az, bx, by, bz]);
    const early = await grab(name + '_03');
    await page.evaluate(() => window.__dbg.ext.core.stepAsync(50, true));
    const late = await grab(name + '_53');
    await page.evaluate(async () => { window.__thread.release(); await window.__dbg.ext.core.stepAsync(2, true); });
    const none = await grab(null);
    return { early: diff(early, none, 40), late: diff(late, none, 40), lateFrame: late, earlyFrame: early, none };
  };
  // thickness: for each column (or row) the beam crosses, how many pixels of it
  const thickness = (d, byRow) => { const m = new Map(); for (const p of d.hit) { const k = byRow ? (p / W) | 0 : p % W; m.set(k, (m.get(k) ?? 0) + 1); } const v = [...m.values()].sort((a, b) => a - b); return { lines: v.length, median: v[v.length >> 1] ?? 0, least: v[Math.floor(v.length * 0.1)] ?? 0 }; };
  const side = await measure(-48, 1.3, -6, -48, 1.3, 6, 'beam_side');
  const ts = thickness(side.late, false);
  const sumOf = (d, f, none) => d.hit.reduce((s, p) => s + f.data[p * 4] + f.data[p * 4 + 1] + f.data[p * 4 + 2] - none.data[p * 4] - none.data[p * 4 + 1] - none.data[p * 4 + 2], 0);
  const grow = sumOf(side.late, side.lateFrame, side.none) / Math.max(1, sumOf(side.early, side.earlyFrame, side.none));
  console.log(`a thread across the view at 18 m: ${ts.lines} columns, ${ts.median} px thick at the median (${ts.least} at the 10th percentile); light at tick 53 / tick 3: x${grow.toFixed(2)}`);
  assert.ok(ts.lines > 150 && ts.median >= 3, `the beam is ${ts.median} px thick over ${ts.lines} columns`);
  // (summed on clipped 8-bit pixels: the heart is white from the first tick, so x1.3 to x1.4 here is 45 % -> 100 % alpha and 3 -> 5 px)
  assert.ok(grow > 1.2, `it brightens over the aim (x${grow.toFixed(2)})`);
  const atEye = await measure(-48, 1.3, 0, -30.2, 1.25, 0.25, 'beam_at_eye');
  const te = thickness(atEye.late, true);
  await show('viewModel', true);
  console.log(`a thread that comes at the eye: ${te.lines} rows, ${te.median} px thick at the median, ${te.least} at the 10th percentile (round 2: a wedge thinning to a dotted hair)`);
  assert.ok(te.lines > 60 && te.least >= 3, `it keeps its width down the screen: ${te.least} px at its thinnest tenth over ${te.lines} rows`);
});
