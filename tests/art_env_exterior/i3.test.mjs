// i3.test.mjs (pass i3, look team "exterior-look"): the exterior in the REAL game at 1280 x 720, one browser.
//   the gully     three baked shafts of sun lie across its floor on both tiers; on High each is also a shaft in the air,
//                 and High differs from Low there (R9)
//   stop one      the camp is a blanket: something dark and striped lies where the flat orange shelf was
//   the sighting  the Dowser's boots meet the rim (no sky under them)
//   the Tally door  no sky shows over or beside the shut leaves from the yard
//   the blue hour stars on the rim, more on High than on Low, none by day
//   the last image  the game's own eased view: the fire stands in the lower third, the sky is two thirds of the frame
// Frames: shots/i3-team-exterior-look/test/.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { ROOT, startServer } from '../harness.mjs';
import { openBot } from '../e2e/lib/bot.mjs';

const SHOTS = path.join(ROOT, 'shots/i3-team-exterior-look/test');
const W = 1280, H = 720;
let server, bot, page;
before(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  server = await startServer({});
  bot = await openBot(server, { piece: 'i3-team-exterior-look', tier: 'low', checkpoint: 'cp_lip_start', viewport: { width: W, height: H }, allowErrors: true });
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
const place = async (pos, at, steps = 20) => { await page.evaluate(async ({ pos, at, steps }) => { const d = window.__dbg; for (let i = 0; i < 2; i++) { d.teleport(pos[0], pos[1], pos[2]); d.aimAt(at[0], at[1], at[2]); await d.ext.core.stepAsync(i ? 1 : steps, true); } }, { pos, at, steps }); await hideGun(); };
const tier = async (t) => { await page.evaluate(async (t) => { const d = window.__dbg; d.setTier(t); await d.ext.core.stepAsync(90, true); }, t); await hideGun(); };
const luma = (p, i) => 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2];
function box(p, x0, y0, x1, y1) { let s = 0, n = 0, r = 0, g = 0, b = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * W + x) * 4; s += luma(p, i); r += p.data[i]; g += p.data[i + 1]; b += p.data[i + 2]; n++; } return { l: s / n, r: r / n, g: g / n, b: b / n }; }
function diff(a, b) { let sum = 0; for (let i = 0; i < a.data.length; i += 4) sum += (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2])) / 3; return sum / (a.data.length / 4); }

// blender/env_exterior/lip_dress.py SHAFTS and src/render/system.ts GULLY_SHAFT_TO: where each shaft lands
const SHAFTS = [[15.7, 13.1, 87.3], [16.4, 9.3, 64.4], [12.7, 4.55, 38.2]];

test('stop one is a blanket: dark striped wool lies in the sun patch where the orange shelf was', async () => {
  await jump('cp_lip_start');
  const m = [15.42, 14, 103.32];                                     // lip_built.build_blanket: its middle
  const p = [m[0] + 0.1, 14, m[2] + 1.9];
  await place(p, [m[0], 14.03, m[2]], 30);
  const f = await grab('blanket');
  // the blanket fills the middle of this frame: cool (blue at or over red) and dark against the lit sand round it
  const mid = box(f, 560, 330, 720, 420), sand = box(f, 500, 560, 700, 650);      // (the sunlit sand of the patch, under the blanket in the frame)
  console.log(`stop one from 1.9 m: the blanket's middle rgb ${mid.r.toFixed(0)},${mid.g.toFixed(0)},${mid.b.toFixed(0)} (luma ${mid.l.toFixed(0)}); the sand beside it ${sand.r.toFixed(0)},${sand.g.toFixed(0)},${sand.b.toFixed(0)} (${sand.l.toFixed(0)})`);
  assert.ok(mid.b > mid.r * 0.8, `the middle of the frame is wool, not orange rock (r ${mid.r.toFixed(0)}, b ${mid.b.toFixed(0)})`);
  assert.ok(mid.l < sand.l * 0.8, `the blanket is darker than the sand (${mid.l.toFixed(0)} against ${sand.l.toFixed(0)})`);
  // its pale end stripes: rows of the middle band hold pixels far lighter than the wool
  let pale = 0; for (let y = 300; y < 460; y++) for (let x = 330; x < 950; x++) { const i = (y * W + x) * 4; if (luma(f, i) > mid.l * 1.9 && f.data[i] > 150) pale++; }
  assert.ok(pale > 400, `the end stripes show (${pale} pale pixels)`);
});

test('the gully: three shafts of sun lie on its floor (both tiers); on High each is drawn in the air, and High is not Low there', async () => {
  await tier('low');
  await jump('cp_lip_start');
  await place([14, 14, 97], [14, 15, 0], 10);                         // out from under the overhang: the glare's trigger
  await page.evaluate(() => window.__dbg.ext.core.stepAsync(1300, false));   // ... and its 20 s ramp
  const out = [];
  for (let k = 0; k < SHAFTS.length; k++) {
    const s = SHAFTS[k];
    // from 4 m down the gully's fall line, looking back and down at the place: the patch against the shade 4.5 m east and west of it
    const p = [s[0], s[1], s[2] - 4.0];
    await place(p, [s[0], s[1], s[2]], 12);
    const f = await grab(`shaft${k}_low`);
    let lit = 0, n = 0; const ls = [];
    for (let y = 200; y < 620; y += 2) for (let x = 200; x < 1080; x += 2) { ls.push(luma(f, (y * W + x) * 4)); n++; }
    ls.sort((a, b) => a - b);
    const shade = ls[Math.floor(n * 0.2)], bright = ls[Math.floor(n * 0.97)];
    for (const v of ls) if (v > shade * 1.6) lit++;
    out.push(`shaft ${k}: shade ${shade.toFixed(0)}, the patch ${bright.toFixed(0)}, ${(100 * lit / n).toFixed(0)} % of the floor in view lit`);
    assert.ok(bright > shade * 1.6, `shaft ${k}: a patch of sun lies on the floor (${bright.toFixed(0)} against a shade of ${shade.toFixed(0)})`);
    assert.ok(lit / n > 0.03 && lit / n < 0.6, `shaft ${k}: it is a patch, not the whole floor (${(100 * lit / n).toFixed(0)} %)`);
  }
  console.log(out.join('; '));
  // the second reach, as she walks into it: Low, then High
  const q = [17, 10.4, 71.5];
  await place(q, dir(q, 0, -6), 20);
  const low = await grab('gully_low');
  const lowShafts = await page.evaluate(() => Array.from(window.__dbg.ext.render.system().fx.gullyShafts).filter((_, i) => i % 7 === 6));
  await tier('high');
  await place(q, dir(q, 0, -6), 30);
  const high = await grab('gully_high');
  const st = await page.evaluate(() => { const R = window.__dbg.ext.render.system(); const q = window.__dbg.perf(); return { g: Array.from(R.fx.gullyShafts).filter((_, i) => i % 7 === 6), dc: q.drawCalls, tris: q.triangles, mib: (q.textureBytes + q.renderTargetBytes) / 1048576 }; });
  const d = diff(low, high);
  console.log(`the second reach, Low against High: ${d.toFixed(1)} of 255; shaft levels Low ${lowShafts.map((v) => v.toFixed(2))}, High ${st.g.map((v) => v.toFixed(2))}; High ${st.dc} draw calls, ${st.tris} triangles, ${st.mib.toFixed(1)} MiB`);
  assert.ok(lowShafts.every((v) => v === 0), 'Low draws no shaft in the air');
  assert.ok(st.g[1] > 0.6, `High draws the second reach's shaft (level ${st.g[1]})`);
  assert.ok(d >= 5.5, `Low against High in the gully: ${d.toFixed(2)} of 255 (at least 5.5)`);
  assert.ok(st.dc <= 220 && st.tris <= 400000 && st.mib <= 128, `High's budget in the gully (${JSON.stringify(st)})`);
  await tier('low');
  const lp = await page.evaluate(() => { const q = window.__dbg.perf(); return { dc: q.drawCalls, tris: q.triangles, mib: (q.textureBytes + q.renderTargetBytes) / 1048576 }; });
  assert.ok(lp.dc <= 100 && lp.tris <= 120000 && lp.mib <= 64, `Low's budget in the gully (${JSON.stringify(lp)})`);
});

test('the sighting: his boots meet the rim; the shut Tally door shows no sky', async () => {
  await tier('low');
  await jump('cp_yard_clear');
  const v = [-88, 0, -10.5], t = [-332.537, 53.628, -10.5];
  await place(v, t, 120);
  const f = await grab('sighting');
  // the figure: near-black pixels round the frame's middle
  let x0 = W, x1 = -1, y1 = -1, y0 = H;
  for (let y = 250; y < 420; y++) for (let x = 560; x < 720; x++) { const i = (y * W + x) * 4; if (f.data[i] < 70 && f.data[i + 1] < 70 && f.data[i + 2] < 90) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y > y1) y1 = y; if (y < y0) y0 = y; } }
  assert.ok(y1 - y0 > 40, `the figure is on screen (${y1 - y0 + 1} px tall)`);
  // the lowest row of the figure holds his boots; the row under them is rock (the colour 10 px further down), not sky (the colour beside his shoulders)
  const cols = []; for (let x = x0; x <= x1; x++) { const i = (y1 * W + x) * 4; if (f.data[i] < 70 && f.data[i + 1] < 70 && f.data[i + 2] < 90) cols.push(x); }
  const bx0 = cols[0], bx1 = cols[cols.length - 1] + 1;
  const under = box(f, bx0, y1 + 1, bx1, y1 + 3), rock = box(f, bx0, y1 + 10, bx1, y1 + 14), sky = box(f, x1 + 14, y0 + 20, x1 + 30, y0 + 40);
  const dRock = Math.abs(under.r - rock.r) + Math.abs(under.g - rock.g) + Math.abs(under.b - rock.b), dSky = Math.abs(under.r - sky.r) + Math.abs(under.g - sky.g) + Math.abs(under.b - sky.b);
  console.log(`the Dowser: ${y1 - y0 + 1} px tall, boots on row ${y1} (x ${bx0}..${bx1 - 1}); under them ${under.r.toFixed(0)},${under.g.toFixed(0)},${under.b.toFixed(0)}: ${dRock.toFixed(0)} from the rock, ${dSky.toFixed(0)} from the sky`);
  assert.ok(dRock < dSky, `rock under his boots, not sky (${dRock.toFixed(0)} from the rock's colour, ${dSky.toFixed(0)} from the sky's)`);
  // the Tally door from the yard, looking up at its head: the wedge of sky over the leaves is gone
  const p = [-87.5, 0, -12.6];
  await place(p, dir(p, 25, 8), 20);
  const g = await grab('tally_door');
  let skyPx = 0;
  for (let y = 60; y < 200; y++) for (let x = 760; x < 960; x++) { const i = (y * W + x) * 4; if (g.data[i + 1] > 150 && luma(g, i) > 150) skyPx++; }
  console.log(`the shut Tally door from 2 m, looking up: ${skyPx} sky-bright pixels in the head of the doorway (it was a wedge of about 1 500)`);
  assert.ok(skyPx < 40, `no sky over the shut leaves (${skyPx} px)`);
});

test('the blue hour has stars, more on High; the last image stands on the lower third', async () => {
  await tier('low');
  await jump('cp_rim');
  const q = [10, 18, 104];
  const count = (f) => { let n = 0; for (let y = 2; y < 330; y++) for (let x = 2; x < W - 2; x++) { const i = (y * W + x) * 4, l = luma(f, i); if (l > 110 && l > luma(f, i - 12) + 45 && l > luma(f, i + 12) + 45 && l > luma(f, i - W * 12) + 45) n++; } return n; };
  await place(q, dir(q, 60, 38), 60);                                 // north-east and up: away from the afterglow and the two lines
  const lo = count(await grab('stars_low'));
  await tier('high');
  await place(q, dir(q, 60, 38), 60);
  const hi = count(await grab('stars_high'));
  await tier('low');
  console.log(`star pixels in the upper sky of the rim: Low ${lo}, High ${hi}`);
  assert.ok(lo >= 3, `Low has stars (${lo} px)`);
  assert.ok(hi > lo * 1.2, `High has more (${hi} against ${lo})`);      // (pixels, not stars: High's are about twice as many, and its bloom softens each)
  assert.ok(hi < 1500, `... and they are points, not snow (${hi} px)`);
  // the last image, as the game frames it: she takes the round, the fire catches, the view is eased
  const r = await bot.eval(async (b, d) => {
    const ctx = d.ext.core.ctx(); const core = d.ext.core;
    const m = (id) => ctx.data.layout.markers.find((x) => x.id === id);
    const ts = m('trg_stone');
    await b.walkTo(14, 110.5, { stopRadius: 0.5, maxTicks: 600 }); await b.walkTo(5, 104.5, { stopRadius: 0.8, maxTicks: 900 });
    await b.walkTo(ts.pos[0] + 0.5, ts.pos[2], { stopRadius: 0.4, maxTicks: 900 });
    b.lookAtMarker('ia_stone_round'); await core.stepAsync(120, false);
    await b.helpers.use('ia_stone_round', { nav: false, reach: 2.0 });
    let n = 0; while (ctx.state.current !== 'ending' && n++ < 2000) await core.stepAsync(10, false);
    await core.stepAsync(2, true);
    return { state: ctx.state.current, pitch: ctx.player.pitch * 180 / Math.PI };
  }, []);
  assert.equal(r.state, 'ending');
  const e = await grab('last_image');
  // the fire: the brightest warm pixel of the middle columns
  let best = 0, fy = -1; for (let y = 200; y < H; y++) for (let x = 540; x < 740; x++) { const i = (y * W + x) * 4, v = e.data[i] + e.data[i + 1] - e.data[i + 2]; if (v > best) { best = v; fy = y; } }
  // the land's edge: going down the frame's right third, the first row whose mean falls well under the row 24 px over it
  let hz = -1; for (let y = 260; y < H - 4 && hz < 0; y++) { const a = box(e, 900, y - 24, 1240, y - 20).l, b2 = box(e, 900, y, 1240, y + 4).l; if (b2 < a * 0.55) hz = y; }
  console.log(`the last image: the view rests ${r.pitch.toFixed(1)} degrees up; the fire on row ${fy} (${(100 * fy / H).toFixed(0)} % down), the land's edge about row ${hz} (${(100 * hz / H).toFixed(0)} %)`);
  assert.ok(fy > H * 0.60 && fy < H * 0.76, `the fire stands in the lower third (row ${fy})`);
  assert.ok(hz > H * 0.56 && hz < H * 0.72, `the land's edge is near the lower third (row ${hz})`);
});
