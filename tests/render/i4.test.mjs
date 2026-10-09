// Pass i4 (render-tech), the REAL game at 960 x 540. Frames: shots/i4-team-render-tech/test/.
//   1  performance  "every adaptive-resolution step resizes the canvas drawing buffer and stalls a frame": on Low and High
//                   a step changes the size of the off-screen targets only; the canvas is allocated once per window size
//                   and tier, and the picture still fills it. (`min` has no off-screen target: its canvas steps.)
//   2  performance  "an automatic tier step-down can link 41 programs in the middle of play where parallel shader compile
//                   is missing": without the extension the boot's warm-up takes the neighbouring tier on (in slices, behind
//                   the loading screen), so a step down in play links nothing
// One browser at a time; each leg a few dozen ticks.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { ROOT, startServer } from '../harness.mjs';
import { openBot } from '../e2e/lib/bot.mjs';

const SHOTS = path.join(ROOT, 'shots/i4-team-render-tech/test');
const W = 960, H = 540;
fs.mkdirSync(SHOTS, { recursive: true });
let server = null, bot = null, page = null;
async function close() { if (bot) { try { await bot.game.browser.close(); } catch { /* closed */ } bot = null; } }
async function open(tier, checkpoint, extra = {}) {
  await close();
  if (!server) server = await startServer({});
  bot = await openBot(server, { piece: 'i4-team-render-tech', tier, checkpoint, viewport: { width: W, height: H }, allowErrors: true, ...extra });
  page = bot.page;
}
after(async () => { await close(); if (server) await server.close(); });
async function grab(name) {
  const url = await page.evaluate(() => window.__dbg.capture());
  const buf = Buffer.from(url.split(',')[1], 'base64');
  if (name) fs.writeFileSync(path.join(SHOTS, name + '.png'), buf);
  return PNG.sync.read(buf);
}
function meanDiff(a, b, x0 = 0, y0 = 0, x1 = 1, y1 = 1) {
  let sum = 0, n = 0;
  for (let y = Math.floor(y0 * a.height); y < Math.floor(y1 * a.height); y++) for (let x = Math.floor(x0 * a.width); x < Math.floor(x1 * a.width); x++) {
    const i = (y * a.width + x) * 4;
    sum += (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2])) / 3; n++;
  }
  return sum / n;
}
/** counts every write to a canvas's width or height (each one reallocates the drawing buffer, same value or not) */
const hookCanvas = () => page.evaluate(() => {
  window.__canvasWrites = 0;
  for (const k of ['width', 'height']) {
    const d = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, k);
    Object.defineProperty(HTMLCanvasElement.prototype, k, { configurable: true, get() { return d.get.call(this); }, set(v) { if (this.id !== '' || this.isConnected) window.__canvasWrites++; d.set.call(this, v); } });
  }
});
/** the quality manager's ratio as its controller sets it (the system follows the public field on the next frame) */
const ratio = (r, frames = 3) => page.evaluate(async ([r, n]) => {
  const d = window.__dbg, q = d.ext.core.ctx().quality;
  q.pixelRatio = r;
  await d.ext.core.stepAsync(n, true);
  return { ...d.ext.render.sizeState(), writes: window.__canvasWrites, perf: (({ width, height, renderTargetBytes }) => ({ width, height, renderTargetBytes }))(d.perf()), allocated: d.ext.render.targets().allocated };
}, [r, frames]);

for (const tier of ['low', 'high']) {
  test(`1 (${tier}): an adaptive step resizes the scene's targets, never the canvas, and the picture fills the canvas`, async () => {
    await open(tier, 'cp_yard_clear');
    await page.evaluate(async () => { const d = window.__dbg; d.god(true); d.aiEnabled(false); d.ext.render.override({ grain: 0 }); await d.ext.core.stepAsync(40, true); });
    await hookCanvas();
    const full = await ratio(1);
    assert.deepEqual(full.canvas, [W, H]); assert.deepEqual(full.scene, [W, H]);
    const a = await grab(`step_${tier}_100`);
    const rows = [];
    let last = full;
    for (const r of [0.9, 0.8, 0.7, 0.5, 0.6, 0.8, 1]) {
      const s = await ratio(r);
      rows.push(`${r}: canvas ${s.canvas.join('x')} scene ${s.scene.join('x')} writes ${s.writes} resizes ${s.canvasResizes} targets ${(s.allocated / 1048576).toFixed(1)} MiB`);
      assert.deepEqual(s.canvas, [W, H], `the canvas keeps its size at ratio ${r}`);
      assert.deepEqual(s.scene, [Math.floor(W * r), Math.floor(H * r)], `the scene's buffer is the ratio's at ${r}`);
      assert.equal(s.writes, 0, `no write to the canvas's width or height at ratio ${r}`);
      assert.equal(s.canvasResizes, full.canvasResizes);
      assert.ok(r >= 1 || s.allocated < full.allocated, 'the targets really are smaller (GPU memory follows the ratio)');
      assert.ok(s.perf.renderTargetBytes >= s.allocated, 'the perf counter never reports under what is allocated');
      last = s;
      if (r === 0.5) {
        const b = await grab(`step_${tier}_050`);
        // the same picture, softer, over the whole canvas: every quarter of the frame is near the full-size frame's
        const q = [[0, 0, 0.5, 0.5], [0.5, 0, 1, 0.5], [0, 0.5, 0.5, 1], [0.5, 0.5, 1, 1]].map((k) => meanDiff(a, b, ...k));
        rows.push(`  half-size picture against full, by quarter: ${q.map((v) => v.toFixed(2)).join(' ')} of 255`);
        for (const v of q) assert.ok(v < 9, `a quarter of the frame is ${v.toFixed(1)} of 255 from the full-size picture: the picture does not fill the canvas`);
      }
    }
    // back at the full ratio: the very frame it was
    const c = await grab(`step_${tier}_100_again`);
    const back = meanDiff(a, c);
    rows.push(`back at 1: ${back.toFixed(3)} of 255 from the first frame`);
    assert.ok(back < 0.5, `back at the full ratio the frame is ${back.toFixed(2)} of 255 from what it was`);
    assert.equal(last.allocated, full.allocated);
    // a real window resize still resizes the canvas, once
    const resized = await page.evaluate(async () => { const d = window.__dbg; d.ext.core.ctx().render.resize(800, 450); await d.ext.core.stepAsync(1, true); const s = d.ext.render.sizeState(); d.ext.core.ctx().render.resize(960, 540); await d.ext.core.stepAsync(1, true); return { s, again: d.ext.render.sizeState() }; });
    assert.deepEqual(resized.s.canvas, [800, 450]);
    assert.equal(resized.again.canvasResizes, full.canvasResizes + 2);
    console.log(`[i4 1 ${tier}]\n  ` + rows.join('\n  '));
  });
}

test('1 (min): the tier without an off-screen target still steps its canvas, and draws', async () => {
  await open('min', 'cp_yard_clear');
  await page.evaluate(async () => { const d = window.__dbg; d.god(true); d.aiEnabled(false); await d.ext.core.stepAsync(20, true); });
  const s = await ratio(0.7);
  assert.deepEqual(s.canvas, [Math.floor(W * 0.7), Math.floor(H * 0.7)]);
  assert.deepEqual(s.scene, s.canvas);
  const back = await ratio(1);
  assert.deepEqual(back.canvas, [W, H]);
});

test('2: without parallel shader compile the boot compiles the tier below, in slices, and a step down links nothing', async () => {
  await close();
  if (!server) server = await startServer({});
  const { launchBrowser } = await import('../../tools/browser.mjs');
  const browser = await launchBrowser({});
  try {
    const tab = await browser.newPage({ viewport: { width: 480, height: 270 }, deviceScaleFactor: 1 });
    // the reviewer's page: the real loop, no test mode, no tier forced. The extension is hidden whatever the machine has
    await tab.addInitScript(() => {
      const P = WebGL2RenderingContext.prototype, get = P.getExtension, link = P.linkProgram, sup = P.getSupportedExtensions;
      window.__links = 0;
      P.getExtension = function (name) { return name === 'KHR_parallel_shader_compile' ? null : get.call(this, name); };
      P.getSupportedExtensions = function () { return (sup.call(this) || []).filter((n) => n !== 'KHR_parallel_shader_compile'); };
      P.linkProgram = function (p) { window.__links++; return link.call(this, p); };
    });
    await tab.goto(server.url, { timeout: 120000 });
    await tab.waitForFunction(() => window.__dbg && (window.__dbg.ready === true || window.__dbg.error), null, { timeout: 120000, polling: 50 });
    const boot = await tab.evaluate(() => { const d = window.__dbg, c = d.ext.core.ctx(); return { error: d.error ?? null, state: c.state.current, tier: c.quality.tier, auto: !c.flags.tierOverride && !c.flags.test, warm: d.ext.render.warmState(), size: d.ext.render.sizeState(), ratio: c.quality.pixelRatio, links: window.__links, ext: d.ext.render.system().renderer.extensions.has('KHR_parallel_shader_compile') }; });
    assert.equal(boot.error, null);
    assert.equal(boot.ext, false, 'the page has no parallel shader compile');
    assert.equal(boot.auto, true, 'the tier is the quality manager\'s to change');
    assert.equal(boot.state, 'title');
    const below = boot.tier === 'high' ? 'low' : boot.tier === 'low' ? 'min' : 'low';
    assert.equal(boot.warm.owed, false, 'nothing is owed when the title comes up');
    assert.equal(boot.warm.at[below], boot.warm.gen, `'${below}' is compiled for the active set`);
    // (issue 1 on the running loop: the quality manager's opening look at the minimum ratio and back cost the canvas nothing)
    // (allocated at the default size, then at the window's: never again, whatever the ratio does)
    assert.ok(boot.size.canvasResizes <= 2, `the canvas was allocated for the window, not for a ratio (${JSON.stringify(boot.size)})`);
    assert.deepEqual(boot.size.canvas, [480, 270]);
    const later = await tab.evaluate(async () => { const seen = new Set(); for (let i = 0; i < 90; i++) { await new Promise((r) => requestAnimationFrame(r)); seen.add(window.__dbg.ext.core.ctx().quality.pixelRatio); } return { size: window.__dbg.ext.render.sizeState(), ratios: [...seen] }; });
    assert.equal(later.size.canvasResizes, boot.size.canvasResizes, `90 frames of the opening look later the canvas is the same allocation (ratios seen: ${later.ratios.join(', ')})`);
    assert.deepEqual(later.size.canvas, [480, 270]);
    console.log(`[i4 2] the running loop: ratios ${[boot.ratio, ...later.ratios].join(', ')} with the canvas at 480 x 270 throughout (${later.size.canvasResizes} allocations: the default size and the window's)`);
    assert.ok(boot.warm.slices >= 6, `the compile was cut into slices (${boot.warm.slices})`);
    // the step down the quality manager makes by itself, on the running loop
    const after = await tab.evaluate(async (below) => {
      const d = window.__dbg, c = d.ext.core.ctx(), before = window.__links;
      c.quality.setTier(below, 'demote');
      for (let i = 0; i < 20; i++) await new Promise((r) => requestAnimationFrame(r));
      return { tier: c.quality.tier, links: window.__links - before, warm: d.ext.render.warmState(), perfTier: d.perf().tier };
    }, below);
    console.log(`[i4 2] boot: tier ${boot.tier}, ${boot.links} links, ${boot.warm.slices} slices (longest ${boot.warm.sliceMs} ms on this machine), warm-ups ${boot.warm.warmUps}; step to ${below}: ${after.links} links`);
    assert.equal(after.tier, below);
    assert.equal(after.links, 0, `the step down linked ${after.links} programs`);
  } finally { await browser.close(); }
});

//   3  visual       "daylight dust motes read as white specks against the sky" (High, the yard toward the far rim): what
//                   the dust adds to the frame is taken as (frame with it) - (frame without it). Before: up to 55 grey
//                   levels over the sky, 253 pixels over 12 in ten frames at 1280 x 720; now under 6 anywhere on the sky,
//                   and the dust is still there against the shade
test('3: the daylight dust adds nothing to speak of over the sky and is still seen against the shade (High)', async () => {
  await open('high', 'cp_yard_clear');
  await page.evaluate(async () => { const d = window.__dbg; d.god(true); d.aiEnabled(false); d.ext.render.override({ grain: 0 }); await d.ext.core.stepAsync(40, true); });
  const shot = async (on) => PNG.sync.read(Buffer.from((await page.evaluate((on) => { const d = window.__dbg, s = d.ext.render.system(); s.lateUpdate(0, 1); const m = s.fx.ambient.points.material; m.visible = on; const u = d.capture(); m.visible = true; return u; }, on)).split(',')[1], 'base64'));
  const luma = (p, i) => 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2];
  let skyMax = 0, skyN = 0, darkOver = 0, darkMax = 0;
  for (let f = 0; f < 6; f++) {
    await page.evaluate(async () => { await window.__dbg.ext.core.stepAsync(25, false); });
    const a = await shot(true), b = await shot(false);
    if (f === 0) fs.writeFileSync(path.join(SHOTS, 'dust_high_yard.png'), PNG.sync.write(a));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, lb = luma(b, i), d = luma(a, i) - lb;
      if (y < H * 0.5 && x > W * 0.3 && x < W * 0.62 && lb > 150) { skyN++; if (d > skyMax) skyMax = d; }
      else if (lb < 110) { if (d > darkMax) darkMax = d; if (d > 12) darkOver++; }
    }
  }
  const state = await page.evaluate(() => { const a = window.__dbg.ext.render.system().fx.ambient; return { drawn: a.drawn, z: a.ground.value.z }; });
  console.log(`[i4 3] sky: ${skyN} pixels, the dust adds at most ${skyMax.toFixed(1)} of 255; against the shade at most ${darkMax.toFixed(1)}, ${darkOver} pixels over 12; ${state.drawn} points`);
  assert.ok(skyN > 50000, 'the frame has the sky in it');
  assert.equal(state.drawn, 400);
  assert.ok(skyMax < 6, `a mote adds ${skyMax.toFixed(1)} of 255 over the sky`);
  assert.ok(darkOver > 150 && darkMax > 30, `the dust is still seen against the shade (${darkOver} pixels, at most ${darkMax.toFixed(1)})`);
});

//   4  visual       "High is close to Low in the yard, the Tally House and the boss room" (R9 / R16): the reviewer's own
//                   measure (frames reduced to 320 x 180: mean absolute difference, share of pixels more than 24 apart)
//                   at his Tally House and chamber stops. Before: Tally House 4.2 / 2.0 %, Windlass vista 3.7 / 4.4 %,
//                   the chamber floor 7.6 / 5.7 %. The floors below are what this pass reached, less a margin; Low draws
//                   none of the terms that make the difference. (Outdoors is not in this test: see the request file.)
const LAYOUT = JSON.parse(fs.readFileSync(path.join(ROOT, 'design/layout.json'), 'utf8'));
const RICH = [
  { id: 'cp_tally_enter', cp: 'cp_tally_enter', mean: 5.5, share: 0.035 },
  { id: 'vista_windlass', cp: 'cp_bore_ante', mean: 4.5, share: 0.06 },
  { id: 'cp_boss_p1', cp: 'cp_boss_p1', mean: 9, share: 0.10 },
];
/** a 960 x 540 frame reduced three times each way (box filter), rgb */
function third(png) {
  const w = png.width / 3, h = png.height / 3, out = new Float32Array(w * h * 3);
  for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
    const i = (y * png.width + x) * 4, o = (Math.floor(y / 3) * w + Math.floor(x / 3)) * 3;
    out[o] += png.data[i] / 9; out[o + 1] += png.data[i + 1] / 9; out[o + 2] += png.data[i + 2] / 9;
  }
  return out;
}
test('4: High is plainly not Low in the Tally House and the Windlass\'s chamber, and Low draws none of it', async () => {
  const shots = {}, state = {};
  for (const tier of ['low', 'high']) {
    await open(tier, 'cp_tally_enter');
    let cur = 'cp_tally_enter';
    for (const s of RICH) {
      const m = LAYOUT.markers.find((x) => x.id === s.id);
      if (s.cp !== cur) { await page.evaluate(async (cp) => { const d = window.__dbg; await d.checkpoint(cp); await d.ext.core.stepAsync(40, true); }, s.cp); cur = s.cp; }
      const yaw = (m.rotY ?? 0) * Math.PI / 180, at = m.params?.target ?? [m.pos[0] - Math.sin(yaw) * 10, m.pos[1] + 1.35, m.pos[2] - Math.cos(yaw) * 10];
      state[s.id + tier] = await page.evaluate(async ({ pos, at }) => {
        const d = window.__dbg; d.god(true); d.aiEnabled(false);
        for (let i = 0; i < 2; i++) { d.teleport(pos[0], pos[1], pos[2]); d.aimAt(at[0], at[1], at[2]); await d.ext.core.stepAsync(i ? 1 : 3, true); }
        const r = d.ext.render, sys = r.system();
        return { air: r.air().level, count: r.air().count, sheen: sys.shared.uSheen.value, links: 0 };
      }, { pos: m.pos, at });
      (shots[s.id] ??= {})[tier] = third(await grab(`rich_${s.id}_${tier}`));
    }
  }
  await close();
  for (const s of RICH) {
    const a = shots[s.id].low, b = shots[s.id].high;
    let sum = 0, big = 0;
    for (let i = 0; i < a.length; i += 3) { const d = (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3; sum += d; if (d > 24) big++; }
    const n = a.length / 3, mean = sum / n, share = big / n, lo = state[s.id + 'low'], hi = state[s.id + 'high'];
    console.log(`[i4 4] ${s.id}: High against Low ${mean.toFixed(1)} of 255, ${(share * 100).toFixed(1)} % of the frame more than 24 apart (air ${hi.air} over ${hi.count} lamps, sheen ${hi.sheen.toFixed(2)})`);
    assert.equal(lo.air, 0, 'Low has no air light'); assert.equal(lo.sheen, 0, 'Low has no sheen');
    assert.ok(mean >= s.mean, `${s.id}: High is ${mean.toFixed(1)} of 255 from Low (at least ${s.mean})`);
    assert.ok(share >= s.share, `${s.id}: ${(share * 100).toFixed(1)} % of the frame differs by more than 24 (at least ${s.share * 100} %)`);
  }
});

//   5  performance  "play still allocates 5 kB per tick and drawn frame": the largest site of the profile was three's
//                   upload path for a bone texture (a cache key string built for every skeleton that moved, every frame:
//                   0.7 kB in the yard, 2.0 kB in the file fight). The bones are written straight to the texture three
//                   made; the frame is the frame three's own upload draws, byte for byte
test('5: a moving skeleton\'s bones reach its texture without three\'s upload path, and the frame is the same', async () => {
  await open('low', 'cp_gallery_bay');
  const out = await page.evaluate(async () => {
    const d = window.__dbg, r = d.ext.render, gl = r.system().renderer.getContext();
    d.god(true); d.aiEnabled(true); d.ext.render.override({ grain: 0 });
    d.followPath('cp_file_clear', { maxTicks: 300 });
    await d.ext.core.stepAsync(300, false);
    for (let i = 0; i < 5; i++) d.step(1, true);
    // three's own upload builds the texture's cache key first: fourteen fields joined into a string; the direct write never does
    let uploads = 0, subs = 0;
    const join = Array.prototype.join, sub = gl.texSubImage2D.bind(gl);
    Array.prototype.join = function (...a) { if (this.length === 14 && a.length === 0) uploads++; return join.apply(this, a); };
    gl.texSubImage2D = (...a) => { subs++; return sub(...a); };
    const row = (frames) => { const w0 = r.bonesWritten(), u0 = uploads, s0 = subs; for (let i = 0; i < frames; i++) { if (i % 20 === 0) { d.setAmmo(6, 24, 0); d.tap('fire'); } d.step(1, true); } return { written: r.bonesWritten() - w0, uploads: uploads - u0, subs: subs - s0 }; };
    const quiet = row(60);
    const a = d.capture();
    // the same tick drawn again with every skeleton marked and three's path taken
    r.bonesWritten(false);
    d.ext.core.ctx().scene.scene.traverse((o) => { if (o.isSkinnedMesh && o.skeleton.boneTexture) o.skeleton.boneTexture.needsUpdate = true; });
    const u1 = uploads;
    const b = d.capture();
    const threes = uploads - u1;
    const own = row(60);
    r.bonesWritten(true);
    Array.prototype.join = join;
    return { quiet, own, same: a === b, threes, enemies: d.enemies().filter((e) => e.alive).length };
  });
  console.log(`[i4 5] 60 frames of the file fight (${out.enemies} alive): ${out.quiet.written} bone textures written directly, ${out.quiet.uploads} uploads through three (${out.own.uploads} with the switch off); the frame drawn both ways is ${out.same ? 'identical' : 'DIFFERENT'} (${out.threes} textures re-uploaded by three for it)`);
  assert.ok(out.quiet.written >= 60, `bone textures written directly: ${out.quiet.written}`);
  assert.equal(out.quiet.uploads, 0, 'no texture went through three\'s upload path in 60 frames of a fight');
  assert.ok(out.own.uploads >= 60, 'with the switch off three uploads them (the test sees what it counts)');
  assert.ok(out.threes >= 1);
  assert.equal(out.same, true, 'the frame is the same whichever way the bones were written');
});
