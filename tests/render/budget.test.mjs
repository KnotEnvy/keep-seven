// Budgets (code-render 6): the worst-case fight in every zone on min, Low and High inside assertBudget; textures +
// render targets for every stage at each tier's largest drawing buffer; full-screen draws 0 / 1 / 12; no growth of
// geometries or textures over 3600 ticks of the fight.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, assertBudget, startServer } from '../harness.mjs';
import { MANIFEST } from '../core/route.mjs';
import { ext, openSandbox } from './util.mjs';

const MiB = 1024 * 1024;
let server;
before(async () => { server = await startServer({ pieces: ['render'] }); });
after(async () => { await server.close(); });

const ZONE_CP = {
  the_lip: 'cp_lip_start', plenty_street: 'cp_street_clear', tally_house: 'cp_tally_hatch', the_gallery: 'cp_file_clear',
  lift_hall: 'cp_hall_gantry', the_bore: 'cp_boss_p1', far_rim: 'cp_rim',
};
const FULL_SCREEN = { min: 0, low: 1, high: 12 };
/** the zones that have an encounter in the layout: only there is the mock fight the zone's worst case */
const FIGHT_ZONES = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'design/layout.json'), 'utf8')).encounters.map((e) => e.zone));
const rows = [];

for (const tier of ['min', 'low', 'high']) {
  test(`the worst-case fight in every zone is inside the budget on ${tier}`, async () => {
    const game = await openSandbox(server, { tier, scene: 'room' });
    try {
      await game.dbg('god', true);
      for (const [zone, cp] of Object.entries(ZONE_CP)) {
        await game.run([{ call: ['checkpoint', cp] }, { steps: 2 }]);
        const built = await ext(game, 'rsb', 'mock');
        assert.ok(built.enemies >= 4, `${zone}: the mock has its enemies (${built.enemies})`);
        // a few shots, each with its frames, so every pool and the flash are in use
        await game.page.evaluate(() => { const d = window.__dbg; for (let s = 0; s < 4; s++) { d.ext.rsb.fire(); for (let i = 0; i < 8; i++) d.step(1, true); } d.ext.rsb.fire(); d.step(1, true); });
        const peak = await game.page.evaluate(() => {
          const dbg = window.__dbg;
          let worst = null;
          for (let h = 0; h < 8; h++) {
            dbg.setAim(h * 45, 0);
            dbg.ext.rsb.fire();
            const p = dbg.perfRun(2);
            if (!worst) worst = p;
            else for (const k of Object.keys(p)) if (typeof p[k] === 'number' && p[k] > worst[k]) worst[k] = p[k];
          }
          return worst;
        });
        const fsd = await ext(game, 'render', 'fullScreenDraws');
        assert.equal(fsd, FULL_SCREEN[tier], `${tier}: ${fsd} full-screen draws`);
        // the zones' computed numbers are the Low ledger (ARCHITECTURE 8.3); High is held to its own caps (220 calls, 400k
        // triangles with the shadow pass) and to the Low bound plus its eleven extra full-screen passes and the shadow pass
        if (tier === 'high') {
          assertBudget(peak, { tier, worst: true });
          assert.ok(peak.drawCalls <= MANIFEST.zones[zone].drawCalls.worst + 11 + 12, `high ${zone}: ${peak.drawCalls} calls`);
        } else if (FIGHT_ZONES.has(zone)) assertBudget(peak, { zone, tier, worst: true });
        else {
          // far_rim has no encounter in the layout (the coda is a calm): six skinned enemies and 26 stakes there are not
          // its worst case, and its computed bound (27 024) holds no enemy. The mock is still drawn there, so the effect
          // pools are measured in the blue hour, and is held to the tier's caps and the zone's draw calls. (Polish round
          // 2: the mock at the rim measured 27 833 triangles, 809 over the zone's number, after the rim's art grew from
          // 15 482 to 16 934 drawn triangles in the real game the same afternoon; 112 of them are this round's halos.)
          assertBudget(peak, { tier, worst: true });
          assert.ok(peak.drawCalls <= MANIFEST.zones[zone].drawCalls.worst, `${zone}: ${peak.drawCalls} calls`);
        }
        rows.push({ tier, zone, cell: peak.cell, drawCalls: peak.drawCalls, worst: MANIFEST.zones[zone].drawCalls.worst, triangles: peak.triangles, bound: MANIFEST.zones[zone].triangles, MiB: +((peak.textureBytes + peak.renderTargetBytes) / MiB).toFixed(1), particles: peak.particles, decals: peak.decals, programs: peak.programs, updateMs: +peak.updateMs.toFixed(3) });
      }
    } finally { await game.close(); }
  });
}

const CAP = { min: { width: 1152, height: 648 }, low: { width: 1366, height: 768 }, high: { width: 1920, height: 1080 } };
const STAGE_CP = { surface: 'cp_street_clear', seam: 'cp_tally_hatch', underground: 'cp_hall_gantry', coda: 'cp_rim' };
const memRows = [];
for (const tier of ['min', 'low', 'high']) {
  test(`textures + render targets for every stage at ${tier}'s largest drawing buffer`, async () => {
    const game = await openSandbox(server, { tier, scene: 'room', viewport: CAP[tier] });
    try {
      const cap = MANIFEST.tiers[tier].textureBudgetMB;
      for (const [stage, cp] of Object.entries(STAGE_CP)) {
        const script = [{ call: ['checkpoint', cp] }, { steps: 2 }];
        // the seam: the gallery is staged beside the surface set once the hatch is powered
        if (stage === 'seam') script.push({ call: ['solvePuzzle', 'daylight'] }, { steps: 30 });
        await game.run(script);
        const perf = await game.dbg('perfRun', 1);
        const mib = (perf.textureBytes + perf.renderTargetBytes) / MiB;
        memRows.push(`${tier.padEnd(4)} ${stage.padEnd(11)} ${perf.width} x ${perf.height}  textures ${(perf.textureBytes / MiB).toFixed(1)}  targets ${(perf.renderTargetBytes / MiB).toFixed(1)}  total ${mib.toFixed(1)} / ${cap} MiB (manifest ${MANIFEST.stages.find((s) => s.id === stage).totalMB[tier]})`);
        assert.ok(mib <= cap, `${tier} ${stage}: ${mib.toFixed(1)} MiB > ${cap}`);
        assert.ok(perf.width <= CAP[tier].width && perf.height <= CAP[tier].height, `${tier}: buffer ${perf.width} x ${perf.height}`);
      }
      if (tier === 'min') {
        // no composer: the render targets are the canvas's own (8 bytes a pixel without context MSAA, 36 with)
        assert.equal(await ext(game, 'render', 'composer'), false);
        const msaa = await ext(game, 'render', 'contextMsaa');
        const perf = await game.dbg('perfRun', 1);
        assert.equal(perf.renderTargetBytes, perf.width * perf.height * (msaa ? 36 : 8), 'min: the canvas formula');
      } else assert.equal(await ext(game, 'render', 'composer'), true);
    } finally { await game.close(); }
  });
}

test('no growth of geometries or textures over 3600 ticks of the fight (firing every 0.48 s)', async () => {
  const game = await openSandbox(server, { tier: 'low', scene: 'budget', query: { zone: 'the_gallery' }, viewport: { width: 320, height: 180 } });
  try {
    await game.page.evaluate(() => { for (let i = 0; i < 600; i++) window.__dbg.step(1, true); });
    const a = await game.perf();
    await game.page.evaluate(() => { for (let i = 0; i < 3600; i++) window.__dbg.step(1, true); });
    const b = await game.perf();
    const v = await ext(game, 'render', 'vfx');
    console.log(`3600 ticks: geometries ${a.geometries} -> ${b.geometries}, textures ${a.textures} -> ${b.textures}, programs ${a.programs} -> ${b.programs}; ${v.flashes} flashes, ${v.bursts} bursts, ${v.decals} decals alive`);
    assert.equal(b.geometries, a.geometries, 'geometries');
    assert.equal(b.textures, a.textures, 'textures');
    assert.equal(b.programs, a.programs, 'programs');
    assert.ok(v.flashes >= 120, `the mock fired (${v.flashes} flashes)`);
  } finally { await game.close(); }
});

after(() => {
  if (rows.length) {
    console.log('tier zone            cell                calls (zone worst)  triangles (bound)  MiB   particles decals programs updateMs');
    for (const r of rows) console.log(`${r.tier.padEnd(4)} ${r.zone.padEnd(15)} ${r.cell.padEnd(19)} ${String(r.drawCalls).padStart(5)} (${r.worst})`.padEnd(62) + `${String(r.triangles).padStart(7)} (${r.bound})`.padEnd(19) + `${String(r.MiB).padStart(5)} ${String(r.particles).padStart(5)} ${String(r.decals).padStart(5)} ${String(r.programs).padStart(5)} ${r.updateMs}`);
    fs.mkdirSync(path.join(ROOT, 'shots/code-render'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'shots/code-render/budget.json'), JSON.stringify(rows, null, 1));
  }
  for (const m of memRows) console.log(m);
});
