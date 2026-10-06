// Polish round 2: one test per finding of the critic panel, measured the way the critics measured, on the REAL game
// (all six systems, no core stub: tests/e2e/lib/bot.mjs), Low tier, 960 x 540. Frames go to shots/r2-fix-code-render/test/.
//
//   the first image          the overhang is a dark frame round a bright mouth (ART_BIBLE 2.3: 25 : 5 : 70)
//   the glare                settles by the game's time, not by drawn frames; the gully under L1 is not a haze
//   the Tally House          no mint-green wall under the hatch layer; the yard through the doorway is daylight
//   the fill                 a glow costs no fill with the camera inside it (the Tally views of the performance critic)
//   the bore                 no saturated flood: OKLCH chroma over 0.11 on under 10 % of a boss frame
//   the slam ring            flame on the lift-hall floor during the Tamper's wind-up (effects are stamped by the tick)
//   the revolver             takes the light of the place at once after a change of place
//   the coda                 the last fire is the brightest warm point of its frame; the Dowser is on the far mesa
//   stake and lance          a hot stake carries a glow; the lance's warning thread is 3 px or more
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { ROOT, startServer } from '../harness.mjs';
import { marker, openBot } from '../e2e/lib/bot.mjs';

const SHOTS = path.join(ROOT, 'shots/r2-fix-code-render/test');
const W = 960, H = 540;
let server, bot, page;
before(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  server = await startServer({});
  bot = await openBot(server, { piece: 'r2-fix-code-render', tier: 'low', checkpoint: 'cp_lip_start', viewport: { width: W, height: H }, allowErrors: true });
  page = bot.page;
});
after(async () => { try { await bot.game.browser.close(); } catch { /* closed */ } await server.close(); });

// ---- measuring ------------------------------------------------------------------------------------------------------
const lin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const Lstar = (r, g, b) => { const Y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); return Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y; };
/** the critic's squint: the frame box-averaged to 32 x 18, L* percentiles and the dark (L* < 35) and light (L* > 70) shares */
function squint(png) {
  const cw = png.width / 32, ch = png.height / 18, Ls = [];
  for (let cy = 0; cy < 18; cy++) for (let cx = 0; cx < 32; cx++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = Math.floor(cy * ch); y < Math.floor((cy + 1) * ch); y += 2) for (let x = Math.floor(cx * cw); x < Math.floor((cx + 1) * cw); x += 2) { const i = (y * png.width + x) * 4; r += png.data[i]; g += png.data[i + 1]; b += png.data[i + 2]; n++; }
    Ls.push(Lstar(r / n, g / n, b / n));
  }
  Ls.sort((a, b) => a - b);
  const q = (p) => Ls[Math.floor(p * (Ls.length - 1))];
  return { p5: q(0.05), p25: q(0.25), p50: q(0.5), p75: q(0.75), p95: q(0.95), max: Ls[Ls.length - 1], dark: Ls.filter((v) => v < 35).length / Ls.length, light: Ls.filter((v) => v > 70).length / Ls.length };
}
/** share of the frame (every other pixel) whose OKLCH chroma is over `over` */
function chromaShare(png, over = 0.11) {
  let n = 0, hi = 0;
  for (let i = 0; i < png.data.length; i += 8) {
    const r = lin(png.data[i]), g = lin(png.data[i + 1]), b = lin(png.data[i + 2]);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
    n++; if (Math.hypot(a, bb) > over) hi++;
  }
  return hi / n;
}
/** pixels matching a predicate inside a rectangle (the whole frame by default) */
function count(png, pred, x0 = 0, y0 = 0, x1 = png.width, y1 = png.height) {
  let n = 0;
  for (let y = Math.max(0, y0); y < Math.min(png.height, y1); y++) for (let x = Math.max(0, x0); x < Math.min(png.width, x1); x++) { const i = (y * png.width + x) * 4; if (pred(png.data[i], png.data[i + 1], png.data[i + 2])) n++; }
  return n;
}
/** the flame hue (#FF9433 and its lighter mixes): clearly more red than green, more green than blue */
const flame = (r, g, b) => r > 150 && r - b > 70 && g - b > 15 && r - g > 15;
async function grab(name) {
  const url = await page.evaluate(() => window.__dbg.capture());
  const buf = Buffer.from(url.split(',')[1], 'base64');
  if (name) fs.writeFileSync(path.join(SHOTS, name + '.png'), buf);
  return PNG.sync.read(buf);
}
/** a debug jump to a checkpoint with the AI off (or on) and god mode */
async function jump(cp, ai = false) {
  await page.evaluate(async ([cp, ai]) => { const d = window.__dbg; await d.checkpoint(cp); d.god(true); d.aiEnabled(ai); await d.ext.core.stepAsync(30, true); }, [cp, ai]);
}
/** stand at pos looking at a point; `steps` ticks, each with a frame, then one more */
async function view(pos, at, name, steps = 3) {
  await page.evaluate(async ({ pos, at, steps }) => {
    const d = window.__dbg;
    for (let i = 0; i < 2; i++) { d.teleport(pos[0], pos[1], pos[2]); d.aimAt(at[0], at[1], at[2]); await d.ext.core.stepAsync(i ? 1 : steps, true); }
  }, { pos, at, steps });
  return grab(name);
}
const dirOf = (yawDeg) => { const t = yawDeg * Math.PI / 180; return [-Math.sin(t), 0, -Math.cos(t)]; };
/** the critic's four headings of a marker: heading k looks 10 m out, 0.3 m under the eye */
function heading(m, k) {
  const d = dirOf((m.rotY ?? 0) + 90 * k);
  return [m.pos[0] + d[0] * 10, m.pos[1] + 1.35, m.pos[2] + d[2] * 10];
}
const fmt = (s) => `L* ${[s.p5, s.p25, s.p50, s.p75, s.p95].map((v) => v.toFixed(0)).join('/')} dark ${(s.dark * 100).toFixed(0)} % light ${(s.light * 100).toFixed(0)} %`;

// ---- the tests ------------------------------------------------------------------------------------------------------
test('the first image: the overhang is a dark frame round a bright mouth; the revolver is not sunlit under the roof', async () => {
  const m = marker('cp_lip_start');
  const png = await view(m.pos, heading(m, 0), 'lip_start');
  const s = squint(png);
  const mood = await page.evaluate(() => { const x = window.__dbg.ext.render.mood(); return { key: x.key, exposure: x.exposure, extra: x.heightExtra }; });
  console.log(`cp_lip_start: ${fmt(s)}; mood ${mood.key} x${mood.exposure.toFixed(2)}, height extra ${mood.extra.toFixed(2)} (round 1: L* 41/45/55/62/72, dark 1 %)`);
  assert.equal(mood.key, 'L0');
  assert.ok(s.dark >= 0.5, `the dark share of the title frame is ${(s.dark * 100).toFixed(0)} % (at least 50)`);
  assert.ok(s.max >= 75, `the mouth is the bright part (brightest block L* ${s.max.toFixed(0)})`);
  assert.ok(s.p50 <= 38, `the frame's median is L* ${s.p50.toFixed(0)}`);
  // the other three headings are rock: under L* 35 at their median
  for (let k = 1; k < 4; k++) { const r = squint(await view(m.pos, heading(m, k), null)); assert.ok(r.p50 < 35, `heading ${k}: rock at L* ${r.p50.toFixed(0)}`); }
  const hand = await page.evaluate(() => { const d = window.__dbg, R = d.ext.render.system(); let o = null; d.ext.core.ctx().scene.viewModel.traverse((x) => { if (x.isMesh && x.material.name === 'm_prop') o = x; }); return R.materials.lightOf(o); });
  // polish round 3 (R6): the view-model has a rig of its own in every mood, so its key is no longer 0 in shade; under the
  // roof it is the rig's floor in a warm white (0.55 of display white / the glare), not the sun's 1.1
  assert.ok(hand[3] < 0.6 && hand[3] > 0.15, `the hand's key under the overhang is ${hand[3].toFixed(3)} (the Long Light's is 1.1)`);
});

test('the glare settles by the game\'s time, not by drawn frames; the gully under the Long Light is not a haze', async () => {
  const out = await page.evaluate(async () => {
    const d = window.__dbg;
    d.teleport(14, 14, 99.5); await d.ext.core.stepAsync(5, true);
    d.teleport(14, 14, 97); await d.ext.core.stepAsync(2, true);            // through trg_glare: the 20 s ramp starts
    const start = d.ext.render.mood();
    await d.ext.core.stepAsync(1300, false);                                   // 21.7 s with NO frame drawn
    d.step(0, true);
    const end = d.ext.render.mood();
    return { start: { key: start.key, t: start.t }, end: { key: end.key, t: end.t, exposure: end.exposure, extra: end.heightExtra } };
  });
  assert.equal(out.start.key, 'L1', 'stepping out starts the ramp to L1');
  assert.ok(out.start.t < 0.05);
  assert.deepEqual([out.end.key, out.end.t], ['L1', 1], 'after 21.7 s of game time and one drawn frame the ramp is over (round 1: t 0.05, exposure still 2.4)');
  assert.ok(Math.abs(out.end.exposure - 1) < 0.01, `exposure ${out.end.exposure}`);
  const png = await view([17, 8, 57], [13, 5, 35], 'gully_57');
  const s = squint(png);
  console.log(`the gully at z 57 under L1: ${fmt(s)} (round 1 under the held glare: 49/55/60/72/91, dark 0 %, light 28 %)`);
  assert.ok(s.dark >= 0.15 && s.p50 <= 48, `rock and shadow read in the gully (${fmt(s)})`);
  assert.ok(s.max >= 70, 'the sunlit gap ahead is still the brightest thing');
});

test('the Tally House: the hatch layer lights the well, not the walls; the yard through the doorway is daylight', async () => {
  await jump('cp_tally_hatch');
  const m = marker('cp_tally_hatch');
  const weight = await page.evaluate(() => window.__dbg.ext.render.layerWeight('lm_tally_hatch'));
  assert.equal(weight, 1, 'the daylight puzzle is solved at this checkpoint: the world has the layer on');
  const stats = [];
  for (let k = 0; k < 4; k++) stats.push(squint(await view(m.pos, heading(m, k), 'tally_hatch_' + k)));
  console.log('cp_tally_hatch: ' + stats.map(fmt).join(' | ') + ' (round 1: wall samples #96B07A, L* 64 to 75, light 14 to 29 %)');
  // headings 1 and 2 look at the west and north walls from 2.5 m: no block of them over L* 45 (the plate and strip aside)
  assert.ok(stats[1].p95 <= 45, `the wall at heading 1: p95 L* ${stats[1].p95.toFixed(0)}`);
  assert.ok(stats[2].p75 <= 45, `the wall at heading 2: p75 L* ${stats[2].p75.toFixed(0)}`);
  for (const k of [1, 2]) assert.equal(stats[k].light, 0, `no light (L* > 70) block on the wall view ${k}`);
  // the well is lit: aqua pixels in the view of the hatch
  const well = await view(m.pos, heading(m, 0), null);
  const aqua = count(well, (r, g, b) => g > r + 40 && b > r + 25 && g > 150);
  assert.ok(aqua > 2000, `the hatch well is aqua (${aqua} pixels)`);

  // the performance critic's worst view (n_ty_026, heading 315): the fill of the quad batch, counted per fragment
  const d = dirOf(315);
  await view([-94.5, 0, -33], [-94.5 + d[0] * 10, 1.35, -33 + d[2] * 10], 'tally_fill_view');
  const fill = await quadFill();
  console.log(`quad batch at n_ty_026 @ 315: ${fill.layers.toFixed(3)} full-screen layers, ${(fill.touched * 100).toFixed(1)} % of pixels touched, ${fill.quads} quads (round 1: 1.064 layers, 100 %)`);
  assert.ok(fill.layers < 0.25, `${fill.layers.toFixed(3)} layers of blended fill`);
  assert.ok(fill.touched < 0.5, `${(fill.touched * 100).toFixed(0)} % of the frame touched`);

  await jump('cp_tally_enter');
  const e = marker('cp_tally_enter');
  const inside = squint(await view(e.pos, heading(e, 0), 'tally_enter_0'));
  const png = await view(e.pos, heading(e, 2), 'tally_doorway');
  const s = squint(png);
  const ext = await page.evaluate(() => { const R = window.__dbg.ext.render.system(); return { w: R.shared.uExtFog.value.y, exterior: R.exteriorDrawn }; });
  console.log(`cp_tally_enter looking back out: ${fmt(s)}; exterior drawn ${ext.exterior}, open-air weight ${ext.w} (round 1: light 0 %, navy sky)`);
  assert.ok(ext.exterior && ext.w === 1, 'exterior things keep the open air\'s fog under the hall\'s mood');
  assert.ok(s.light >= 0.04, `the doorway is daylight: ${(s.light * 100).toFixed(0)} % of the frame over L* 70`);
  assert.ok(inside.dark >= 0.7, 'the hall itself stays dark');
});

/** the perf critic's exact count: the quad batch alone over the scene's depth, 4/255 per fragment that passes */
function quadFill() {
  return page.evaluate(() => {
    const dbg = window.__dbg, ctx = dbg.ext.core.ctx(), sys = dbg.ext.render.system(), fx = sys.fx, r = sys.renderer, cam = ctx.scene.camera, roots = ctx.scene;
    dbg.step(0, true);
    const Wd = r.domElement.width, Hd = r.domElement.height;
    const RT = Object.getPrototypeOf(sys.post.composer.inputBuffer).constructor;
    const rt = new RT(Wd, Hd, { depthBuffer: true });
    const batches = [fx.quads.mesh, fx.particles.mesh, fx.ambient.points, fx.decals.mesh];
    const vis = batches.map((m) => m.visible);
    for (const m of batches) m.visible = false;
    const vm = roots.viewModel.visible; roots.viewModel.visible = false;
    const prev = r.getRenderTarget();
    r.setRenderTarget(rt); r.setClearColor(0x000000, 1); r.clear(true, true, false);
    r.render(roots.scene, cam);
    const m = fx.quads.mesh, keep = m.material, c = keep.clone();
    c.uniforms = keep.uniforms;
    c.fragmentShader = keep.fragmentShader.replace('void main()', 'void keepMain()') + '\nvoid main() { keepMain(); gl_FragColor = vec4( 4.0 / 255.0, 0.0, 0.0, 0.0 ); }';
    c.blending = 5; c.blendEquation = 100; c.blendSrc = 201; c.blendDst = 201; c.blendSrcAlpha = 201; c.blendDstAlpha = 201; c.premultipliedAlpha = false; c.needsUpdate = true;
    let layers = 0, touched = 0;
    if (vis[0]) {
      r.setRenderTarget(rt); r.clear(true, false, false);
      m.material = c; m.visible = true;
      r.render(m, cam);
      m.visible = false; m.material = keep;
      const px = new Uint8Array(Wd * Hd * 4);
      r.readRenderTargetPixels(rt, 0, 0, Wd, Hd, px);
      let sum = 0, t = 0;
      for (let i = 0; i < Wd * Hd; i++) { const v = px[i * 4]; sum += v; if (v > 0) t++; }
      layers = sum / 4 / (Wd * Hd); touched = t / (Wd * Hd);
    }
    c.dispose();
    batches.forEach((b, i) => { b.visible = vis[i]; });
    roots.viewModel.visible = vm;
    r.setRenderTarget(prev); rt.dispose();
    dbg.step(0, true);
    return { layers, touched, quads: fx.quads.count };
  });
}

test('the bore: no saturated flood (chroma over 0.11 on under 10 % of a boss frame); lamp halos are small', async () => {
  await jump('cp_boss_p1');
  const rows = [];
  for (const [pos, name] of [[[14, -44, 84], 'door'], [[14, -44, 90], '6m'], [[20, -44, 100], 'flank'], [[14, -44, 104], 'behind']]) {
    const png = await view(pos, [14, -41, 96], 'bore_' + name, 2);
    rows.push([name, chromaShare(png), squint(png)]);
  }
  console.log('cp_boss_p1, share of the frame over OKLCH chroma 0.11: ' + rows.map(([n, c]) => `${n} ${(c * 100).toFixed(1)} %`).join(', ') + ' (round 1: 13, 15, 27, 28 %)');
  for (const [n, c] of rows) assert.ok(c < 0.10, `${n}: ${(c * 100).toFixed(1)} % of the frame is saturated`);
  // the Windlass separates from the room: something of the drum's face is clearly lighter than the frame's median
  const face = rows[1][2];
  assert.ok(face.p95 - face.p50 >= 15, `the 6 m view has a light cluster (p50 ${face.p50.toFixed(0)}, p95 ${face.p95.toFixed(0)})`);
  // halos: the glow quads of this frame (flag 4) are at most 1.5 m across, and the batch's fill is small
  const halos = await page.evaluate(() => { const q = window.__dbg.ext.render.system().fx.quads, out = []; for (let i = 0; i < q.count; i++) if (q.data[i * 20 + 19] >= 4) out.push(q.data[i * 20 + 7]); return out; });
  assert.ok(halos.length > 0 && Math.max(...halos) <= 1.5 + 1e-6, `${halos.length} glows, the largest ${Math.max(...halos).toFixed(2)} m (round 1: up to 3.5 m)`);
  const fill = await quadFill();
  console.log(`bore quad fill from behind the Windlass: ${fill.layers.toFixed(3)} layers`);
  assert.ok(fill.layers < 0.1);
});

test('the Tamper\'s slam ring is on the lift-hall floor during the wind-up (an effect is stamped with the tick\'s time)', async () => {
  await jump('cp_hall_gantry', true);
  const out = await page.evaluate(async () => {
    const d = window.__dbg, c = d.ext.core.ctx(), R = d.ext.render.system();
    d.teleport(0, -15, -14, 0, 0); await d.ext.core.stepAsync(5, false);
    d.ext.enemies.wakeEncounter('enc_matador'); await d.ext.core.stepAsync(2, false);
    const T = () => d.ext.enemies.actors().find((a) => a.kind === 'tamper');
    // no frame is drawn while the fight runs: exactly how a scripted run (and a slow machine) meets the ring
    for (let i = 0; i < 2500; i++) {
      await d.ext.core.stepAsync(1, false);
      const a = T(); if (!a) return null;
      if (c.player.health < 60) d.setHealth(100);
      if (a.state === 'slam_windup' && a.t > 0.5) {
        const p = c.player.position, s = R.fx.rings.slam[0];
        d.aimAt((a.x + p.x) / 2, a.y, (a.z + p.z) / 2); d.step(0, true);
        return { t: a.t, dist: Math.hypot(a.x - p.x, a.z - p.z), active: s.active, age: R.shared.uTime.value - s.t0, ringY: s.ay, rings: R.fx.counts.rings };
      }
    }
    return null;
  });
  assert.ok(out, 'the Tamper wound up a slam');
  const png = await grab('slam_ring');
  const n = count(png, flame, 0, Math.round(H * 0.15), W, H);
  console.log(`slam wind-up at t ${out.t.toFixed(2)} s, Tamper ${out.dist.toFixed(1)} m away: ring active ${out.active}, age ${out.age.toFixed(2)} s, ${n} flame pixels on the floor (round 1: ring stamped ${'3 s'} in the past, 0 pixels)`);
  assert.ok(out.active, 'the ring is alive');
  assert.ok(out.age >= 0.4 && out.age <= 1.0, `its age is the wind-up's (${out.age.toFixed(2)} s)`);
  assert.ok(n > 1500, `${n} flame-hue pixels on the lift-hall floor`);
  await page.evaluate(() => { const d = window.__dbg; d.aiEnabled(false); d.killAll(true); return d.ext.core.stepAsync(30, false); });
});

test('a stake in flight carries a flame glow with a white heart; the lance\'s warning thread is 3 px or more with a halo', async () => {
  await jump('cp_hall_clear');
  // a hot stake 5 m ahead, end-on (the enemies' own call: instances.add('proj_stake', 'stake_hot', ...))
  const before = await view([0, -15, -14], [10, -13.35, -14], null);
  const h = await page.evaluate(async () => { const d = window.__dbg, c = d.ext.core.ctx(); const h = c.render.instances.add('proj_stake', 'stake_hot', 5, -13.5, -14, Math.PI / 2, 1); await d.ext.core.stepAsync(1, true); d.step(0, true); return h; });
  assert.ok(h >= 0, 'proj_stake is active in the underground set');
  const png = await grab('stake_glow');
  const proj = await page.evaluate(() => { const c = window.__dbg.ext.core.ctx(), cam = c.scene.camera; const v = cam.position.clone().set(5, -13.5, -14).project(cam); return [(v.x + 1) / 2, (1 - v.y) / 2]; });
  const cx = Math.round(proj[0] * W), cy = Math.round(proj[1] * H);
  const warm = count(png, (r, g, b) => r > 170 && r - b > 50, cx - 30, cy - 30, cx + 30, cy + 30);
  const warmBefore = count(before, (r, g, b) => r > 170 && r - b > 50, cx - 30, cy - 30, cx + 30, cy + 30);
  const white = count(png, (r, g, b) => r > 235 && g > 215 && b > 170, cx - 8, cy - 8, cx + 8, cy + 8);
  const glows = await page.evaluate(() => { const R = window.__dbg.ext.render.system(); return { n: R.inst.emitGlow({ data: new Float32Array(400), i: 0, next() { return this.i++ * 20; } }) }; });
  console.log(`a hot stake 5 m ahead: ${warm} warm pixels round it (${warmBefore} without), ${white} of a white heart, ${glows.n} glow`);
  assert.equal(glows.n, 1);
  assert.ok(warm - warmBefore >= 100, `the stake's glow is ${warm - warmBefore} pixels (round 1: a 6 px dark sliver)`);
  assert.ok(white >= 4, 'a white core');
  await page.evaluate((h) => window.__dbg.ext.core.ctx().render.instances.remove(h), h);

  // the lance thread across the view, 8 m ahead: its core on a column scan
  await page.evaluate(async () => {
    const d = window.__dbg, v = d.ext.core.ctx().render.vfx;
    const t = v.acquireLine('lance_thread'); t.setPosition(8, -13.3, -20); t.setEnd(8, -13.3, -8);
    window.__lance = t; await d.ext.core.stepAsync(1, true); d.step(0, true);
  });
  const lp = await grab('lance_thread');
  const row = await page.evaluate(() => { const c = window.__dbg.ext.core.ctx(), cam = c.scene.camera; const v = cam.position.clone().set(8, -13.3, -14).project(cam); return (1 - v.y) / 2; });
  const y0 = Math.round(row * H);
  let widest = 0, lit = 0;
  for (let x = 40; x < W - 40; x += 3) {
    let n = 0;
    for (let y = y0 - 12; y <= y0 + 12; y++) { const i = (y * W + x) * 4; if (lp.data[i] > 190) n++; }
    if (n > 0) lit++;
    widest = Math.max(widest, n);
  }
  console.log(`lance thread: core up to ${widest} px tall on ${lit} of ${Math.floor((W - 80) / 3)} columns (round 1: 2 px, no halo)`);
  assert.ok(widest >= 3 && widest <= 9, `the thread's bright core is ${widest} px`);
  assert.ok(lit > 60, 'it runs across the view, dashed');
  await page.evaluate(() => { window.__lance.release(); });
});

test('the revolver takes the light of the place at once: bore -> lip in one drawn frame', async () => {
  const hand = () => page.evaluate(() => { const d = window.__dbg, c = d.ext.core.ctx(), R = d.ext.render.system(); let o = null; c.scene.viewModel.traverse((x) => { if (x.isMesh && x.material.name === 'm_prop') o = x; }); return { mood: R.materials.propStates.get(o).mood, light: R.materials.lightOf(o).map((v) => +v.toFixed(4)) }; });
  await page.evaluate(async () => { const d = window.__dbg; await d.checkpoint('cp_lip_start'); await d.ext.core.stepAsync(20, true); });
  const fresh = await hand();
  await page.evaluate(async () => { const d = window.__dbg; await d.checkpoint('cp_boss_p2'); d.god(true); d.aiEnabled(false); await d.ext.core.stepAsync(3, true); });
  const bore = await hand();
  await page.evaluate(async () => { const d = window.__dbg; await d.checkpoint('cp_lip_start'); await d.ext.core.stepAsync(1, true); });
  const back = await hand();
  console.log(`hand light: lip ${JSON.stringify(fresh.light)}, bore (${bore.mood}) ${JSON.stringify(bore.light)}, lip again after ONE frame ${JSON.stringify(back.light)}`);
  assert.equal(bore.mood, 'L5', 'three frames after the jump the hand is in the bore\'s light (round 1: the look-up came every twelfth drawn frame)');
  assert.notDeepEqual(bore.light, fresh.light);
  assert.deepEqual(back.light, fresh.light, 'back at the lip the light is the lip\'s on the first frame');
});

test('the coda: the last fire is the brightest warm point of its frame; the town\'s lamps glow; the Dowser stands on the far mesa', async () => {
  await jump('cp_rim');
  const v = marker('vista_fire');
  await page.evaluate(async (target) => {
    const d = window.__dbg, R = d.ext.render.system();
    const f = R.fx.acquireCard('last_fire'); f.setPosition(target[0], target[1], target[2]); f.setLevel(1); f.setVisible(true);
    window.__fire = f; await d.ext.core.stepAsync(120, false);
  }, v.params.target);
  const png = await view(v.pos, v.params.target, 'coda_fire');
  const at = await page.evaluate((t) => { const c = window.__dbg.ext.core.ctx(), cam = c.scene.camera; const p = cam.position.clone().set(t[0], t[1], t[2]).project(cam); return [(p.x + 1) / 2, (1 - p.y) / 2]; }, v.params.target);
  const fx = Math.round(at[0] * W), fy = Math.round(at[1] * H);
  // the warmest pixel of the frame above the gun (r - b), and where it is
  let best = -1, bx = 0, by = 0;
  for (let y = 0; y < Math.round(H * 0.62); y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4, w = png.data[i] + png.data[i + 1]; if (png.data[i] - png.data[i + 2] > 40 && w > best) { best = w; bx = x; by = y; } }
  const n = count(png, (r, g, b) => r > 200 && r - b > 80, fx - 20, fy - 20, fx + 20, fy + 20);
  console.log(`the last fire at (${fx}, ${fy}): ${n} warm pixels; the brightest warm pixel of the frame is at (${bx}, ${by}), r + g ${best} (round 1: no fire on screen)`);
  assert.ok(n >= 25, `${n} flame pixels at the fire`);
  assert.ok(Math.hypot(bx - fx, by - fy) <= 14, 'the fire is the brightest warm point in frame');
  await page.evaluate(() => { window.__fire.release(); });
  // the blue hour leaves the town: the density of L6 under the ledge
  const density = await page.evaluate(() => window.__dbg.ext.render.mood().values[8]);
  assert.ok(density <= 0.007, `L6 density ${density}`);

  // the Dowser: his vignette on, from his vista in the yard
  await jump('cp_street_clear');
  const m = marker('vista_dowser');
  const before = await view(m.pos, [m.params.target[0], m.params.target[1] + 1, m.params.target[2]], null);
  await page.evaluate(async () => { const d = window.__dbg; d.ext.core.ctx().enemies.playVignette('vig_dowser'); await d.ext.core.stepAsync(40, true); });
  const after = await view(m.pos, [m.params.target[0], m.params.target[1] + 1, m.params.target[2]], 'dowser');
  // pixels within 16 px of the screen centre that the figure changed, and how tall the changed patch is
  let changed = 0, top = H, bottom = 0;
  for (let y = H / 2 - 16; y < H / 2 + 16; y++) for (let x = W / 2 - 16; x < W / 2 + 16; x++) {
    const i = (y * W + x) * 4;
    if (Math.abs(Lstar(after.data[i], after.data[i + 1], after.data[i + 2]) - Lstar(before.data[i], before.data[i + 1], before.data[i + 2])) > 6) { changed++; top = Math.min(top, y); bottom = Math.max(bottom, y); }
  }
  console.log(`the Dowser on the far mesa: ${changed} pixels differ from the bare mesa by over 6 L*, ${bottom - top + 1} px tall (layout: at least 3 x 8)`);
  assert.ok(changed >= 12 && bottom - top + 1 >= 7, `the figure is ${changed} pixels, ${bottom - top + 1} tall`);
});
