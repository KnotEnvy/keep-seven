// The renderer at run time (code-render 6): tiers (Low and High hard to tell apart, min without a composer, switches
// without a reload), determinism, allocation per tick plus frame, no program compiles after warmUp, violet coverage.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { ROOT, measureAlloc, startServer } from '../harness.mjs';
import { ext, frames, openIndex, openSandbox } from './util.mjs';

let server;
before(async () => { server = await startServer({ pieces: ['render'] }); });
after(async () => { await server.close(); });
const SHOTS = path.join(ROOT, 'shots/code-render');

/** a shot of one effect-rich moment through events only (works beside the stubs and the real systems alike) */
const SHOT_SCRIPT = [
  { call: ['setAim', 62, 3] },
  { steps: 30 },
  { call: ['emit', 'weapon/fired', { shotId: 1, ammo: 'lead_round', chambersLeft: 5, ox: -62, oy: 1.6, oz: -2, dx: -0.88, dy: 0.05, dz: -0.47, mx: -62.4, my: 1.5, mz: -2.2, endX: -70, endY: 1.0, endZ: -6 }] },
  { call: ['emit', 'combat/hit', { x: -70, y: 1, z: -6, shotId: 1, order: 0, ammo: 'lead_round', outcome: 'impact', entityId: '', entityKind: 'world', part: 'whole', surface: 'adobe', nx: 0.9, ny: 0, nz: 0.4, damage: 0, ricochetX: 0, ricochetY: 0, ricochetZ: 0 }] },
  { steps: 4 },
];

test('tiers: one view on min, Low and High; Low and High differ in under 8 % of the pixels; switches at run time', async () => {
  const files = {};
  for (const tier of ['min', 'low', 'high']) {
    const game = await openIndex(server, { tier, checkpoint: 'cp_street_clear' });
    try {
      await game.run(SHOT_SCRIPT);
      [files[tier]] = await game.shotSeries([{ name: `tiers_${tier}` }]);
      assert.equal(await ext(game, 'render', 'composer'), tier !== 'min', `${tier}: composer`);
    } finally { await game.close(); }
  }
  const read = (f) => PNG.sync.read(fs.readFileSync(f));
  const lo = read(files.low), hi = read(files.high), mn = read(files.min);
  const total = lo.width * lo.height;
  const lowHigh = pixelmatch(lo.data, hi.data, null, lo.width, lo.height, { threshold: 0.1 }) / total;
  const lowMin = pixelmatch(lo.data, mn.data, null, lo.width, lo.height, { threshold: 0.1 }) / total;
  console.log(`Low vs High: ${(lowHigh * 100).toFixed(2)} % of pixels beyond 0.1; Low vs min: ${(lowMin * 100).toFixed(2)} %`);
  assert.ok(lowHigh < 0.08, `Low and High differ in ${(lowHigh * 100).toFixed(2)} % of the pixels`);

  // one page, three tiers, no reload
  const game = await openIndex(server, { tier: 'low', checkpoint: 'cp_street_clear' });
  try {
    const seen = [], programs = {};
    await game.step(2, true);
    const first = await game.perf();
    for (const tier of ['high', 'min', 'low', 'high', 'low', 'min', 'low']) {
      await game.dbg('setTier', tier);
      await game.page.evaluate(() => window.__dbg.ext.core.ctx().render.warmUp());
      await game.step(2, true);
      const perf = await game.perf();
      seen.push(`${tier}:${await ext(game, "render", "fullScreenDraws")}fs/${perf.drawCalls}c/${(perf.renderTargetBytes / 1048576).toFixed(1)}MiB/${perf.programs}p/${perf.geometries}g`);
      assert.equal(perf.tier, tier);
      assert.equal(await ext(game, 'render', 'fullScreenDraws'), { min: 0, low: 1, high: 12 }[tier]);
      // the programs of the tier that was left are released: a tier costs the same however many switches came before it
      // (before the fix: low 31 -> high 65 -> min 92 -> low 93 -> high 97)
      if (programs[tier] !== undefined) {
        assert.ok(perf.programs <= programs[tier].programs + 1, `${tier}: ${perf.programs} programs, ${programs[tier].programs} the first time`);
        assert.ok(perf.geometries <= programs[tier].geometries + 1, `${tier}: ${perf.geometries} geometries, ${programs[tier].geometries} the first time`);
      } else programs[tier] = { programs: perf.programs, geometries: perf.geometries };
      if (tier === 'low') {
        // polish round 3: + the three depth programs of High's shadow pass (plain, skinned, instanced) and its overlay, which
        // High's warm-up now always builds (they linked in play) and three keeps cached: 36 -> 40, and no further
        assert.ok(perf.programs <= first.programs + 5, `back on Low: ${perf.programs} programs, ${first.programs} before any switch`);
        assert.equal(perf.textures, first.textures, 'textures');
      }
    }
    console.log(`runtime switches (Low first: ${first.programs} programs): ` + seen.join('  '));
  } finally { await game.close(); }
});

test('determinism: two loads, one script: identical PNGs on Low; the hash is the same on min, Low and High', async () => {
  const pngs = [], hashes = [];
  for (const [tier, run] of [['low', 'a'], ['low', 'b'], ['min', 'c'], ['high', 'd']]) {
    const game = await openIndex(server, { tier, checkpoint: 'cp_street_clear' });
    try {
      await game.run(SHOT_SCRIPT);
      await game.run([{ steps: 3 }]);
      hashes.push(await game.dbg('hash'));
      if (tier === 'low') pngs.push(...await game.shotSeries([{ name: `determinism_${run}` }]));
    } finally { await game.close(); }
  }
  const [a, b] = pngs.map((f) => fs.readFileSync(f));
  assert.ok(a.equals(b), 'the two Low frames are byte-identical');
  assert.equal(new Set(hashes).size, 1, `hashes ${hashes}`);
  for (const f of pngs) fs.rmSync(f);
});

test('allocation: a tick plus a rendered frame of the worst-case fight is under 6 KB', async () => {
  const game = await openSandbox(server, { scene: 'budget', query: { zone: 'the_gallery' } });
  try {
    const body = (dbg, n) => { for (let i = 0; i < n; i++) dbg.step(1, true); };
    // the warm-up frames into a small buffer (the JS being warmed does not depend on the picture's size)
    await game.page.setViewportSize({ width: 96, height: 54 });
    await game.page.evaluate(() => window.__dbg.ext.core.ctx().render.resize(96, 54));
    await measureAlloc(game, body, { warm: 2970, batches: 1, perBatch: 30 });
    await game.page.setViewportSize({ width: 960, height: 540 });
    await game.page.evaluate(() => window.__dbg.ext.core.ctx().render.resize(960, 540));
    const perf = await game.dbg('perfRun', 1);
    assert.equal(perf.width, 960);
    const r = await measureAlloc(game, body, { warm: 0, perBatch: 30 });
    const v = await ext(game, 'render', 'vfx');
    console.log(`tick + frame of the fight: ${Math.round(r.perTick)} B (batches ${r.samples.map(Math.round).join(' ')}); ${v.flashes} shots, ${v.bursts} bursts so far`);
    assert.ok(r.perTick <= 6144, `${Math.round(r.perTick)} B per tick plus frame`);
  } finally { await game.close(); }
});

test('no hitch: after warmUp no program compiles over a run that fires, changes mood, shows every effect and crosses zones', async () => {
  const game = await openIndex(server, { tier: 'low', checkpoint: 'cp_street_clear' });
  try {
    await game.step(2, true);
    // everything the order lists, inside one resident set (the surface): every effect, every mood, a zone boundary
    const run = () => game.page.evaluate(async () => {
      const dbg = window.__dbg, ctx = dbg.ext.core.ctx(), v = ctx.render.vfx, p = ctx.player.eye;
      const frame = (n) => { for (let i = 0; i < n; i++) dbg.step(1, true); };
      for (const id of dbg.ext.render.vfxIds()) v.burst(id, p.x - 3, p.y, p.z - 3, 0, 1, 0);
      for (const kind of ['tracer', 'ricochet', 'line_round', 'sighting_thread', 'lance_thread', 'relight_thread', 'standing_line', 'aqua_thread']) v.line(kind, p.x - 2, p.y, p.z - 4, p.x + 2, p.y, p.z - 4);
      const cards = [];
      for (const kind of ['sun_blade', 'sun_patch', 'lance', 'mouth_glow', 'aim_star', 'halo', 'last_fire', 'dowser_glint', 'sand_thread']) { const h = v.acquireCard(kind); h.setPosition(p.x, p.y, p.z - 4); h.setEnd(p.x + 1, p.y, p.z - 4); cards.push(h); }
      v.ring('canister', p.x, p.y - 1.6, p.z - 5, 3, 1, 1); v.ring('slam', p.x, p.y - 1.6, p.z - 5, 3, 1, 1);
      const b = v.blobShadow(); b.setPosition(p.x, p.y - 1.6, p.z - 3);
      v.muzzleFlash('lead', p.x, p.y, p.z - 0.6); frame(3); v.muzzleFlash('kept', p.x, p.y, p.z - 0.6);
      v.decal('wood', p.x, p.y - 1.6, p.z - 3, 0, 1, 0);
      ctx.render.addTrauma(0.6);
      frame(10);
      for (const mood of ['L0', 'L2', 'L3', 'L4', 'L5', 'L5p', 'L6', 'L1']) { ctx.render.setMood(mood, 0.2); frame(15); }
      ctx.render.setExposure(2, 0.3); frame(20); ctx.render.setExposure(1, 0);
      ctx.render.setLightLayer('lm_tally_hatch', 1, 0.2); frame(15);
      ctx.render.setWrongFade(0.5); frame(2); ctx.render.setWrongFade(0);
      // across a zone boundary: the street, the yard, into the Tally House (the same resident set)
      await dbg.checkpoint('cp_yard_clear'); frame(20);
      await dbg.checkpoint('cp_tally_enter'); frame(20);
      dbg.emit('boss/proven', { x: p.x, y: p.y, z: p.z }); frame(120);
      for (const h of cards) h.release(); b.release();
      return dbg.ext.render.programs();
    });
    const p0 = await ext(game, 'render', 'programs');
    const p1 = await run();
    console.log(`surface: programs after warmUp ${p0}, after the run ${p1}`);
    assert.equal(p1, p0, `programs grew from ${p0} to ${p1} after warmUp`);
    // a set swap is a warmUp of its own (world calls it behind the seam); after it, the same holds underground
    await game.dbg('checkpoint', 'cp_gallery_bay');
    await game.step(2, true);
    const q0 = await ext(game, 'render', 'programs');
    const q1 = await game.page.evaluate(async () => {
      const dbg = window.__dbg, ctx = dbg.ext.core.ctx(), v = ctx.render.vfx, p = ctx.player.eye;
      const frame = (n) => { for (let i = 0; i < n; i++) dbg.step(1, true); };
      for (const id of dbg.ext.render.vfxIds()) v.burst(id, p.x - 3, p.y, p.z - 3, 0, 1, 0);
      v.muzzleFlash('line', p.x, p.y, p.z - 0.6); frame(5);
      await dbg.checkpoint('cp_file_clear'); frame(20);
      await dbg.checkpoint('cp_hall_gantry'); frame(20);
      await dbg.checkpoint('cp_bore_ante'); frame(20);
      return dbg.ext.render.programs();
    });
    console.log(`underground: programs after the swap's warmUp ${q0}, after the run ${q1}`);
    assert.equal(q1, q0, `programs grew from ${q0} to ${q1} underground`);
  } finally { await game.close(); }
});

test('violet stays under 2 % of the frame in every exterior zone (ext.render.violetShare)', async () => {
  const game = await openIndex(server, { tier: 'low', checkpoint: 'cp_lip_start' });
  try {
    const rows = [];
    for (const [cp, yaw, pitch] of [['cp_lip_start', 0, 10], ['cp_lip_gate', 0, 8], ['cp_street_clear', 62, 3], ['cp_yard_clear', 90, 5], ['cp_rim', 0, 12]]) {
      await game.run([{ call: ['checkpoint', cp] }, { call: ['setAim', yaw, pitch] }, { steps: 100 }]);
      const share = await ext(game, 'render', 'violetShare');
      rows.push(`${cp} ${(share * 100).toFixed(2)} %`);
      assert.ok(share < 0.02, `${cp}: violet covers ${(share * 100).toFixed(2)} % of the frame`);
    }
    console.log('violet share: ' + rows.join('  '));
  } finally { await game.close(); }
});
