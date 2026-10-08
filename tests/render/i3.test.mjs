// Pass i3 (render-tech), the REAL game at 960 x 540. Frames: shots/i3-team-render-tech/test/.
//
// Lead ruling R9, the visual reviewer's minor "High and Low are still nearly the same on the rim and from the lift-hall
// gantry" (3.3 and 3.7 of 255 apart; 1.9 in the Tamper's vista). What High gained, each behind the tier's switch:
//   the cone      a lamp whose face looks down throws a shaft of light through the dust (post.ts AIR_CONE_ANGLE; moods.ts AIR_CONE)
//   the far glow  a lamp beyond AIR_FAR keeps its glow, cut by what stands in front of it (AIR_GLOW): the town's windows
//                 from the rim (the blue hour only: in a room the set's twelve places are the near lamps')
//   the glance    the afterglow glances off the sand toward her (SharedUniforms.uGlance; moods.ts GLANCE)
//   the snap      after a warp the tier's eased terms stand at the mood's value on the first frame (the reviewer's frames,
//                 43 ticks after a checkpoint, held 59 % of the air light)
// and what they may not cost: nothing on Low (not a pixel), no program, no pass, no draw call.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { ROOT, startServer } from '../harness.mjs';
import { openBot } from '../e2e/lib/bot.mjs';

const SHOTS = path.join(ROOT, 'shots/i3-team-render-tech/test');
const LAYOUT = JSON.parse(fs.readFileSync(path.join(ROOT, 'design/layout.json'), 'utf8'));
const W = 960, H = 540;
fs.mkdirSync(SHOTS, { recursive: true });
let server = null, bot = null, page = null;
/** one browser at a time: the one that is open is closed before another tier's is opened */
async function open(tier, checkpoint) {
  if (bot) { try { await bot.game.browser.close(); } catch { /* closed */ } bot = null; }
  if (!server) server = await startServer({});
  bot = await openBot(server, { piece: 'i3-team-render-tech', tier, checkpoint, viewport: { width: W, height: H }, allowErrors: true });
  page = bot.page;
  await page.evaluate(() => {
    const d = window.__dbg, gl = d.ext.render.system().renderer.getContext();
    d.ext.render.override({ grain: 0 });
    d.god(true); d.aiEnabled(false);
    window.__links = 0;
    const link = gl.linkProgram.bind(gl);
    gl.linkProgram = (p) => { window.__links++; return link(p); };
  });
}
after(async () => { if (bot) { try { await bot.game.browser.close(); } catch { /* closed */ } } if (server) await server.close(); });

async function grab(name) {
  const url = await page.evaluate(() => window.__dbg.capture());
  const buf = Buffer.from(url.split(',')[1], 'base64');
  if (name) fs.writeFileSync(path.join(SHOTS, name + '.png'), buf);
  return PNG.sync.read(buf);
}
const jump = (cp, steps = 40) => page.evaluate(async ([cp, steps]) => { const d = window.__dbg; await d.checkpoint(cp); d.god(true); d.aiEnabled(false); await d.ext.core.stepAsync(steps, true); }, [cp, steps]);
const place = (pos, at, steps = 90) => page.evaluate(async ({ pos, at, steps }) => { const d = window.__dbg; for (let i = 0; i < 2; i++) { d.teleport(pos[0], pos[1], pos[2]); d.aimAt(at[0], at[1], at[2]); await d.ext.core.stepAsync(i ? 1 : steps, true); } }, { pos, at, steps });
const call = (what, ...args) => page.evaluate(([what, args]) => window.__dbg.ext.render[what](...args), [what, args]);
const marker = (id) => LAYOUT.markers.find((m) => m.id === id);
const eyeTarget = (m) => { const t = (m.rotY ?? 0) * Math.PI / 180; return m.params?.target ?? [m.pos[0] - Math.sin(t) * 10, m.pos[1] + 1.35, m.pos[2] - Math.cos(t) * 10]; };
const luma = (img, i) => 0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2];
function meanDiff(a, b) {
  let sum = 0;
  for (let i = 0; i < a.data.length; i += 4) sum += (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2])) / 3;
  return sum / (a.data.length / 4);
}
/** share of the pixels of `a` darker / lighter than `b` by more than `by` grey levels, inside a box of the frame (fractions) */
function shifted(a, b, by, x0 = 0, y0 = 0, x1 = 1, y1 = 1) {
  let darker = 0, lighter = 0, n = 0;
  for (let y = Math.floor(y0 * H); y < Math.floor(y1 * H); y++) for (let x = Math.floor(x0 * W); x < Math.floor(x1 * W); x++) {
    const i = (y * W + x) * 4, d = luma(a, i) - luma(b, i);
    n++;
    if (d < -by) darker++; else if (d > by) lighter++;
  }
  return { darker: darker / n, lighter: lighter / n };
}
const same = (a, b) => Buffer.compare(a.data, b.data) === 0;

test('High, the lift hall: a cone of light under each pendant; light only adds; no program, pass or draw call', async () => {
  await open('high', 'cp_hall_gantry');
  await jump('cp_hall_gantry', 60);
  const g = marker('cp_hall_gantry');
  await place(g.pos, eyeTarget(g), 60);
  const programs = await call('programs'), fs0 = await call('fullScreenDraws');
  const s = await call('airShapes');
  assert.ok(s.cone > 0, `the hall's mood names a cone (${JSON.stringify(s)})`);
  assert.equal(s.glow, 0, 'no far glow in a room');
  assert.ok(s.cones >= 3, `the pendants look down and carry a cone (${s.cones} of ${s.count} lamps)`);
  assert.equal(s.far, 0, 'and no far lamp in the set');
  const perfOn = await page.evaluate(() => { const q = window.__dbg.perf(); return { dc: q.drawCalls, tris: q.triangles }; });
  const on = await grab('hall_gantry_on');
  await call('airShapes', false, false);
  const noCone = await grab('hall_gantry_off');
  const perfOff = await page.evaluate(() => { const q = window.__dbg.perf(); return { dc: q.drawCalls, tris: q.triangles }; });
  const sOff = await call('airShapes');
  assert.equal(sOff.cone, 0); assert.equal(sOff.glow, 0);
  await call('airShapes', true, true);
  const again = await grab(null);
  assert.ok(same(on, again), 'a frame drawn twice at one tick is the same frame (the switches snap)');
  const dCone = meanDiff(on, noCone), cone = shifted(on, noCone, 2);
  console.log(`the hall from the gantry: cones ${dCone.toFixed(2)} of 255 (${(100 * cone.lighter).toFixed(1)} % of the frame lifted); ${s.cones} cones of ${s.count} lamps`);
  assert.ok(dCone > 0.4, `the cones show (${dCone.toFixed(2)} of 255)`);
  assert.ok(cone.lighter > 0.02 && cone.lighter < 0.7, `shafts, not a veil over the whole frame (${(100 * cone.lighter).toFixed(1)} %)`);
  // (a handful of edge pixels move under the FXAA pass when their neighbours brighten: under 0.2 % is "none")
  assert.ok(cone.darker < 0.002, `light in the air only adds (${cone.darker})`);
  assert.deepEqual(perfOn, perfOff, 'no draw call and no triangle for them');
  assert.equal(await call('fullScreenDraws'), fs0, 'no pass for them');
  // the Tamper's vista (the reviewer's 1.9): cones from the pendants over the frame
  const t = marker('vista_tamper');
  await place(t.pos, t.params.target, 60);
  const tOn = await grab('hall_tamper_on');
  await call('airShapes', false, false);
  const tOff = await grab('hall_tamper_off');
  await call('airShapes', true, true);
  const td = meanDiff(tOn, tOff);
  console.log(`the Tamper's vista: ${td.toFixed(2)} of 255 between on and off`);
  assert.ok(td > 0.3, `the vista gains light in its air (${td.toFixed(2)})`);
  assert.ok(shifted(tOn, tOff, 2).darker < 0.002);
  // play on: nothing links
  const l0 = await page.evaluate(() => window.__links);
  await page.evaluate(async () => { const d = window.__dbg; await d.ext.core.stepAsync(120, true); });
  assert.equal(await page.evaluate(() => window.__links) - l0, 0, 'no program linked in 120 drawn ticks');
  assert.equal(await call('programs'), programs, 'the program count stands');
});

test('High, the rim: the afterglow glances off the sand, the town\'s lamps are in the air light; whole on the first frames after a warp', async () => {
  // (the browser of the test above is still open: one at a time)
  await page.evaluate(async () => { const d = window.__dbg; await d.checkpoint('cp_rim'); d.god(true); d.aiEnabled(false); await d.ext.core.stepAsync(3, true); });
  const first = { air: await call('air'), glance: await call('glance'), dusk: await call('dusk'), shapes: await call('airShapes'), relief: await call('relief') };
  console.log(`three ticks after the warp to the rim: air ${first.air.level}, glance ${first.glance.k}, dusk ${first.dusk.level}, far glow ${first.shapes.glow}, relief ${first.relief.sky}`);
  assert.ok(first.air.level > 0.75, `the air light is whole at once (${first.air.level}; it eased over 0.8 s)`);
  assert.ok(first.glance.k > 1.5, `the glance is whole at once (${first.glance.k})`);
  assert.ok(first.dusk.level > 0.55, `the afterglow's shafts are whole at once (${first.dusk.level})`);
  assert.ok(first.relief.sky > 1.9, `the relief is whole at once (${first.relief.sky})`);
  const r = marker('cp_rim');
  await place(r.pos, eyeTarget(r), 60);
  const g = await call('glance');
  assert.equal(g.u[3], 3, 'the lobe\'s exponent is in the block');
  assert.ok(g.u[0] > g.u[2], 'in the glow band\'s ember, not the sky\'s blue');
  const on = await grab('rim_glance_on');
  await call('glance', false);
  const off = await grab('rim_glance_off');
  await call('glance', true);
  const low = shifted(on, off, 3, 0, 0.6, 0.5, 1), sky = shifted(on, off, 1, 0.25, 0.3, 0.7, 0.42), all = shifted(on, off, 2);
  console.log(`the glance at cp_rim: ${meanDiff(on, off).toFixed(2)} of 255; ${(100 * low.lighter).toFixed(1)} % of the sand in the lower left lifted by more than 3, the sky ${(100 * sky.lighter).toFixed(2)} %`);
  assert.ok(low.lighter > 0.25, `the sand toward her carries the afterglow (${(100 * low.lighter).toFixed(1)} %)`);
  assert.equal(sky.lighter + sky.darker, 0, 'the sky is not ground: it takes none');
  assert.ok(all.darker < 0.002, `a glance only adds (${all.darker})`);
  // the town from the ledge
  const p = marker('vista_plenty');
  await place(p.pos, p.params.target, 60);
  const s = await call('airShapes');
  assert.ok(s.far >= 3 && s.far === s.count, `the town's lamps, all beyond AIR_FAR, are in the air light (${JSON.stringify(s)}; it was 0 of 5)`);
  assert.equal(s.cones, 0, 'no cone in the blue hour');
  const tOn = await grab('rim_town_on');
  await call('airShapes', true, false);
  const tOff = await grab('rim_town_off');
  await call('airShapes', true, true);
  const town = shifted(tOn, tOff, 2);
  console.log(`the far glow at vista_plenty: ${meanDiff(tOn, tOff).toFixed(2)} of 255, ${(100 * town.lighter).toFixed(2)} % of the frame lifted`);
  assert.ok(town.lighter > 0.001 && town.lighter < 0.1, `a glow round the windows, not a wash (${(100 * town.lighter).toFixed(2)} %)`);
  assert.ok(town.darker < 0.002);
  const perf = await page.evaluate(() => { const q = window.__dbg.perf(); return { dc: q.drawCalls, tris: q.triangles }; });
  assert.ok(perf.dc <= 220 && perf.tris <= 400000);
});

test('Low: none of it, and not a pixel of the frame moves with the switches', async () => {
  await open('low', 'cp_hall_gantry');
  for (const [cp, id] of [['cp_hall_gantry', 'cp_hall_gantry'], ['cp_rim', 'cp_rim']]) {
    await jump(cp, 60);
    const m = marker(id);
    await place(m.pos, eyeTarget(m), 30);
    const s = await call('airShapes'), g = await call('glance'), a = await call('air');
    assert.equal(s.cone, 0); assert.equal(s.glow, 0); assert.equal(s.count, 0); assert.equal(a.level, 0);
    assert.deepEqual(g.u, [0, 0, 0, 0], 'the block\'s glance is zero on Low');
    const on = await grab(`low_${id}`);
    await call('airShapes', false, false); await call('glance', false);
    const off = await grab(null);
    await call('airShapes', true, true); await call('glance', true);
    assert.ok(same(on, off), `${id}: the frame is the same with the switches off`);
    assert.equal(await call('fullScreenDraws'), 1, 'one merged pass');
  }
});
