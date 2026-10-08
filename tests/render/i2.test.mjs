// Pass i2 (render-tech), the REAL game at 960 x 540. Frames: shots/i2-team-render-tech/test/.
//
//   the doorway      crossing between the open air and a room puts the new place's AIR (fog, sky, height term, the grade's
//                    lift) in place at once, at its settled display level; only the eye adapts (system.ts DOOR_FADE). The
//                    visual reviewer's minor: "the room through a flat brown haze for about 0.4 s, then it pops clear".
//   High outdoors    lead ruling R9, the visual reviewer's major "High is still hard to tell from Low in the street, yard,
//                    rim and lift hall": the bake's shade is deeper and cooler inside the shadow map's reach, the town's
//                    fixed world casts into the map (moods.ts ShadowSpec lit / shade / inShade / tint / statics), the
//                    relief follows the sky's and the lamps' light where there is no sun (RELIEF_SKY), and the blue hour
//                    has the afterglow's shafts (SHAFT_DUSK).
// and what they may not cost: nothing on Low, no program linked in play, draw calls and triangles inside High's caps.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { ROOT, startServer } from '../harness.mjs';
import { openBot } from '../e2e/lib/bot.mjs';

const SHOTS = path.join(ROOT, 'shots/i2-team-render-tech/test');
const LAYOUT = JSON.parse(fs.readFileSync(path.join(ROOT, 'design/layout.json'), 'utf8'));
const W = 960, H = 540;
fs.mkdirSync(SHOTS, { recursive: true });
let server = null, bot = null, page = null;
/** one browser at a time: the one that is open is closed before another tier's is opened */
async function open(tier, checkpoint) {
  if (bot) { try { await bot.game.browser.close(); } catch { /* closed */ } bot = null; }
  if (!server) server = await startServer({});
  bot = await openBot(server, { piece: 'i2-team-render-tech', tier, checkpoint, viewport: { width: W, height: H }, allowErrors: true });
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
const jump = (cp) => page.evaluate(async (cp) => { const d = window.__dbg; await d.checkpoint(cp); d.god(true); d.aiEnabled(false); await d.ext.core.stepAsync(40, true); }, cp);
const place = (pos, at, steps = 90) => page.evaluate(async ({ pos, at, steps }) => { const d = window.__dbg; for (let i = 0; i < 2; i++) { d.teleport(pos[0], pos[1], pos[2]); d.aimAt(at[0], at[1], at[2]); await d.ext.core.stepAsync(i ? 1 : steps, true); } }, { pos, at, steps });
/** a switch of one term, a few ticks for it to take, then the frame */
const set = (what, on, steps = 2) => page.evaluate(async ([what, on, steps]) => { const d = window.__dbg; const r = d.ext.render[what](on); await d.ext.core.stepAsync(steps, true); d.step(0, true); return r; }, [what, on, steps]);
const read = (what) => page.evaluate((what) => window.__dbg.ext.render[what](), what);
const luma = (img, i) => 0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2];
/** mean of the brightest channel inside a box (the reviewer's measure of the haze) */
function meanV(img, x0, y0, x1, y1) {
  let s = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * img.width + x) * 4; s += Math.max(img.data[i], img.data[i + 1], img.data[i + 2]); n++; }
  return s / n;
}
function meanDiff(a, b) {
  let sum = 0;
  for (let i = 0; i < a.data.length; i += 4) sum += (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2])) / 3;
  return sum / (a.data.length / 4);
}
/** share of the pixels of `a` darker / lighter than `b` by more than `by` grey levels (the view-model's corner left out) */
function shifted(a, b, by) {
  let darker = 0, lighter = 0, n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (x > W * 0.52 && y > H * 0.5) continue;
    const i = (y * W + x) * 4, d = luma(a, i) - luma(b, i);
    n++;
    if (d < -by) darker++; else if (d > by) lighter++;
  }
  return { darker: darker / n, lighter: lighter / n };
}
/** walks her through the Tally House door (x -89, the door plane near z -14.5) in 12 cm steps until the mood's key changes */
const cross = (from, to, look) => page.evaluate(async ({ from, to, look }) => {
  const d = window.__dbg;
  d.teleport(-89, 0, from); d.aimAt(-89, 1.4, look); await d.ext.core.stepAsync(150, true);
  const key0 = d.ext.render.mood().key, step = Math.sign(to - from) * 0.12;
  let z = from, crossed = null;
  for (let i = 0; i < 90 && crossed === null; i++) { z += step; d.teleport(-89, 0, z); d.aimAt(-89, 1.4, look); await d.ext.core.stepAsync(1, true); if (d.ext.render.mood().key !== key0) crossed = z; }
  d.step(0, true);
  return { key0, key1: d.ext.render.mood().key, crossed, mood: d.ext.render.mood() };
}, { from, to, look });

test('the doorway (Low): the room is never seen through the street\'s fog, and the yard never through a white-out', async () => {
  await open('low', 'cp_yard_clear');
  const settledFog = await page.evaluate(() => window.__dbg.ext.render.mood().values.slice(0, 9));
  // ---- going in
  const c = await cross(-11, -17.5, -30);
  assert.equal(c.key0, 'L1'); assert.equal(c.key1, 'L2', `the door was crossed (at z ${c.crossed})`);
  assert.equal(c.mood.airSnapped, true, 'a doorway between the open air and a room snaps the air');
  assert.ok(Math.abs(c.mood.values[8] - 0.020) < 1e-6, `the fog's density is the room's on the frame of the crossing (${c.mood.values[8]})`);
  assert.ok(c.mood.exposure < 1.3, `the exposure is still the street's (${c.mood.exposure}): the eye adapts, the air does not`);
  assert.ok(c.mood.airGain > 1.5, `the air is held at its settled display level (gain ${c.mood.airGain})`);
  const inside = [];
  for (let t = 0; t <= 60; t += 6) {
    if (t) await page.evaluate(() => window.__dbg.ext.core.stepAsync(6, true));
    inside.push(meanV(await grab(t === 0 || t === 30 ? `door_in_t${t}` : ''), 0, 0, 450, 225));
  }
  await page.evaluate(() => window.__dbg.ext.core.stepAsync(240, true));
  const settled = meanV(await grab('door_in_settled'), 0, 0, 450, 225);
  const after = await read('mood');
  console.log(`door, going in: upper-left mean ${inside.map((v) => v.toFixed(1)).join(' / ')} over 60 ticks, settled ${settled.toFixed(1)} (before the fix: 73 / 76 / 82 / 88 / 94 / 95 / 91 / 81 / 67 / 51 / 46, settled 49)`);
  assert.equal(after.airSnapped, false, 'the snap ends with the fade');
  assert.equal(after.airGain, 1);
  for (const v of inside) assert.ok(v < settled + 6, `no frame of the fade is hazier than the settled room (${v.toFixed(1)} against ${settled.toFixed(1)})`);
  assert.ok(inside[0] < settled, `the arrival frame is the room before the eye has adapted, darker than settled (${inside[0].toFixed(1)} < ${settled.toFixed(1)})`);
  // ---- going out: the sky and the far fog keep their level while the exposure comes down from the room's
  const o = await cross(-17, -10.5, 0);
  assert.equal(o.key0, 'L2'); assert.equal(o.key1, 'L1');
  assert.equal(o.mood.airSnapped, true);
  for (let i = 0; i < 9; i++) assert.ok(Math.abs(o.mood.values[i] - settledFog[i]) < 1e-6, `fog field ${i} is the Long Light's on the frame of the crossing`);
  const sky0 = meanV(await grab('door_out_t0'), 0, 0, 450, 120);
  await page.evaluate(() => window.__dbg.ext.core.stepAsync(300, true));
  const sky1 = meanV(await grab('door_out_settled'), 0, 0, 450, 120);
  console.log(`door, going out: the sky strip ${sky0.toFixed(1)} on the crossing, ${sky1.toFixed(1)} settled (before the fix: 240 / 173 over the upper-left region)`);
  assert.ok(Math.abs(sky0 - sky1) < 14, `the sky is at its level on the frame of the crossing (${sky0.toFixed(1)} / ${sky1.toFixed(1)})`);
  // ---- a fade between two rooms and a long fade blend as they did
  const other = await page.evaluate(async () => {
    const d = window.__dbg, x = d.ext.render;
    x.setMoodKey('L2', 0); await d.ext.core.stepAsync(2, true);
    x.setMoodKey('L3', 1); await d.ext.core.stepAsync(1, true);
    const rooms = x.mood().airSnapped;
    x.setMoodKey('L5p', 0); await d.ext.core.stepAsync(2, true);
    x.setMoodKey('L6', 8); await d.ext.core.stepAsync(1, true);
    const ride = x.mood().airSnapped, density = x.mood().values[8];
    x.setMoodKey('L1', 0); await d.ext.core.stepAsync(2, true);
    return { rooms, ride, density };
  });
  assert.equal(other.rooms, false, 'room to room: no snap');
  assert.equal(other.ride, false, 'a ride\'s long fade: no snap');
  assert.ok(other.density > 0.0032 + 1e-4, `... and its fog is still on its way (${other.density})`);
  // ---- Low draws none of High's new terms
  const low = await page.evaluate(async () => {
    const d = window.__dbg, x = d.ext.render, out = {};
    for (const cp of ['cp_street_clear', 'cp_hall_gantry', 'cp_rim']) {
      await d.checkpoint(cp); await d.ext.core.stepAsync(30, true);
      out[cp] = { relief: x.relief().k, sky: x.relief().sky, statics: x.shadow().statics, twins: x.shadow().shown, shaftK: x.dusk().shaftK, fs: x.fullScreenDraws() };
    }
    return out;
  });
  for (const [cp, v] of Object.entries(low)) assert.deepEqual(v, { relief: 0, sky: 0, statics: 0, twins: 0, shaftK: 0, fs: 1 }, `Low at ${cp}: no relief, no caster, no twin, no shaft, one full-screen draw`);
});

test('the doorway (High): the same on the tier with the air light and the shadow map', async () => {
  await open('high', 'cp_yard_clear');
  const c = await cross(-11, -17.5, -30);
  assert.equal(c.key1, 'L2');
  const first = meanV(await grab('door_in_high_t0'), 0, 0, 450, 225);
  let worst = first;
  for (let t = 6; t <= 60; t += 6) { await page.evaluate(() => window.__dbg.ext.core.stepAsync(6, true)); worst = Math.max(worst, meanV(await grab(''), 0, 0, 450, 225)); }
  await page.evaluate(() => window.__dbg.ext.core.stepAsync(240, true));
  const settled = meanV(await grab('door_in_high_settled'), 0, 0, 450, 225);
  console.log(`door on High: arrival ${first.toFixed(1)}, the haziest frame of the fade ${worst.toFixed(1)}, settled ${settled.toFixed(1)}`);
  assert.ok(worst < settled + 8, `no frame of the fade is hazier than the settled room (${worst.toFixed(1)} against ${settled.toFixed(1)})`);
});

test('High in the town: the fixed world casts, the shade is deeper and cooler, and it fits High\'s caps with no program linked', async () => {
  await jump('cp_street_clear');
  const node = LAYOUT.nav.nodes.find((n) => n.id === 'n_st_034');
  assert.ok(node, 'nav node n_st_034');
  const a = 3 * Math.PI / 2 + 0.6;
  await place(node.pos, [node.pos[0] + Math.sin(a) * 10, node.pos[1] + 1.2, node.pos[2] + Math.cos(a) * 10], 90);
  const links0 = await page.evaluate(() => window.__links);
  const s = await read('shadow');
  assert.equal(s.live, true); assert.equal(s.half, 26);
  assert.ok(s.statics >= 4, `the town's chunks cast into the sun's map (${s.statics})`);
  assert.ok(s.materials >= 2, `a receiver's material per lightmap (${s.materials})`);
  const gate = await read('shadowGate');
  assert.ok(gate[0] > 0 && gate[1] > gate[0] && gate[2] > 0, `the Long Light's gate reads the bake (${gate.join(', ')})`);
  const on = await grab('town_statics_on');
  const perfOn = await page.evaluate(() => { const q = window.__dbg.perf(); return { dc: q.drawCalls, tris: q.triangles, mib: (q.textureBytes + q.renderTargetBytes) / 1048576 }; });
  // the fixed casters off: the same frame with the map holding only what moves
  await set('statics', false);
  const off = await grab('town_statics_off');
  const perfOff = await page.evaluate(() => { const q = window.__dbg.perf(); return { dc: q.drawCalls, tris: q.triangles }; });
  assert.equal((await read('shadow')).statics, 0);
  const st = shifted(on, off, 8);
  // the whole pass off: the bake as Low draws it (the blobs come back)
  await set('shadow', false);
  const none = await grab('town_shadow_off');
  const sh = shifted(on, none, 8);
  await set('shadow', true); await set('statics', null);
  const links1 = await page.evaluate(() => window.__links);
  console.log(`town, High: fixed casters darken ${(100 * st.darker).toFixed(1)} % of the frame (lighten ${(100 * st.lighter).toFixed(2)} %); the whole pass darkens ${(100 * sh.darker).toFixed(1)} %; ${perfOn.dc} draw calls / ${perfOn.tris} triangles / ${perfOn.mib.toFixed(1)} MiB with them, ${perfOff.dc} / ${perfOff.tris} without; ${links1 - links0} programs linked`);
  assert.ok(st.darker > 0.03, `the fixed world's shadows show (${(100 * st.darker).toFixed(1)} % of the frame darker by more than 8)`);
  assert.ok(st.lighter < 0.01, 'a caster only ever darkens');
  assert.ok(sh.darker > st.darker, 'the deepened shade is more than the casters\' share');
  assert.ok(perfOn.tris > perfOff.tris, 'the casting chunks are drawn a second time');
  assert.ok(perfOn.dc <= 220 && perfOn.tris <= 400000 && perfOn.mib <= 128, `inside High's caps (${perfOn.dc} / ${perfOn.tris} / ${perfOn.mib.toFixed(1)})`);
  assert.equal(links1 - links0, 0, 'switching the casters and the pass links nothing');
  // a creature in the town keeps its blob while the fixed world casts (in a building's shade the map holds the building)
  const blobs = await page.evaluate(async ([x, y, z]) => {
    const d = window.__dbg; d.killAll(true); await d.ext.core.stepAsync(120, false);
    d.spawnEnemy('bider', x + 4, y, z, 0); await d.ext.core.stepAsync(20, true);
    const withCasters = d.ext.render.shadow().blobs, quadsOn = d.ext.render.vfx().quads;
    d.ext.render.statics(false); await d.ext.core.stepAsync(3, true);
    const quadsOff = d.ext.render.vfx().quads;
    d.ext.render.statics(null); d.killAll(true); await d.ext.core.stepAsync(30, true);
    return { withCasters, quadsOn, quadsOff, links: window.__links };
  }, node.pos);
  console.log(`a Bider in the street: ${blobs.quadsOn} quads while the town casts, ${blobs.quadsOff} when only it does (its blob gives way to the map)`);
  assert.ok(blobs.quadsOn > blobs.quadsOff, `the blob is kept while the fixed world casts (${blobs.quadsOn} / ${blobs.quadsOff} quads)`);
  assert.equal(blobs.links - links1, 0, 'a creature walking into the sun\'s map links nothing');
});

test('High: the gully and the overhang keep the bake\'s own shadows (no fixed caster of theirs), and a room has none', async () => {
  await jump('cp_lip_start');
  await page.evaluate(() => window.__dbg.ext.core.stepAsync(30, true));
  const lip = await page.evaluate(() => {
    const d = window.__dbg, x = d.ext.render, own = [];
    d.ext.core.ctx().scene.world.traverse((o) => { if (o.userData.keepStatic === 1) own.push(o.name); });
    return { key: x.mood().key, shadow: x.shadow(), gate: x.shadowGate(), own };
  });
  assert.equal(lip.key, 'L0');
  assert.equal(lip.shadow.statics, 0, 'under the overhang nothing fixed casts: the sun patch is the bake\'s');
  assert.equal(lip.gate[2], 0, 'and the shade under the roof is not deepened (the first image)');
  assert.ok(lip.own.every((n) => n.startsWith('chunk_st_')), `only the town's chunks are fixed casters (${lip.own.join(', ')})`);
  await jump('cp_tally_enter');
  await page.evaluate(() => window.__dbg.ext.core.stepAsync(30, true));
  const room = await page.evaluate(() => ({ shadow: window.__dbg.ext.render.shadow(), gate: window.__dbg.ext.render.shadowGate() }));
  assert.equal(room.shadow.statics, 0, 'a room\'s map hangs under its ceiling: nothing fixed casts into it');
  assert.deepEqual(room.gate, [-1, 0, 0, 1], 'and its receivers are gated as before this pass');
});

test('High: the relief follows the lamps in the hall and the sky in the shade; the blue hour has the afterglow\'s shafts', async () => {
  await jump('cp_hall_gantry');
  const tamper = LAYOUT.markers.find((m) => m.id === 'vista_tamper');
  await place(tamper.pos, tamper.params.target, 90);
  const r = await read('relief');
  assert.equal(r.k, 0, 'no sun in the hall');
  assert.ok(r.sky > 0, 'the hall\'s lamps have a relief');
  const bumpy = await grab('hall_relief_on');
  await set('relief', false, 0);
  const flat = await grab('hall_relief_off');
  await set('relief', true, 0);
  const hd = meanDiff(bumpy, flat);
  console.log(`relief under the hall's lamps: ${hd.toFixed(2)} of 255 between on and off`);
  assert.ok(hd > 0.25, `the hall's plate and walls show their relief (${hd.toFixed(2)})`);
  assert.ok(hd < 6, `a relief, not another light (${hd.toFixed(2)})`);
  // the rim
  await jump('cp_rim');
  const fire = LAYOUT.markers.find((m) => m.id === 'vista_fire');
  await place(fire.pos, fire.params.target, 120);
  const d = await read('dusk');
  assert.ok(d.level > 0.3 && d.shaftK > 0, `the afterglow has shafts (${JSON.stringify(d)})`);
  assert.equal((await read('shadow')).live, false, 'no shadow pass in the blue hour');
  const glow = await grab('rim_dusk_on');
  await set('dusk', false, 1);
  const plain = await grab('rim_dusk_off');
  await set('dusk', true, 1);
  const s = shifted(glow, plain, 3);
  console.log(`afterglow shafts on the rim: ${(100 * s.lighter).toFixed(1)} % of the frame lifted by more than 3, ${(100 * s.darker).toFixed(2)} % lowered`);
  assert.ok(s.lighter > 0.03, `the air toward the afterglow glows (${(100 * s.lighter).toFixed(1)} %)`);
  assert.ok(s.darker < 0.005, 'light in the air only adds');
  const perf = await page.evaluate(() => { const q = window.__dbg.perf(); return { dc: q.drawCalls, tris: q.triangles }; });
  assert.ok(perf.dc <= 220 && perf.tris <= 400000);
});
