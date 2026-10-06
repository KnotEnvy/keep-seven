// The four interior zones through the real loader (sandbox/viewer.html?zone=), work order art-env-interior 5:
// no console error; every manifest node resolves in the zone's scene; triangles and draw calls within the manifest;
// every lamp set takes a mask for each of its lamps and draws; then the evidence frames (960 x 540) from the order's
// list are written to shots/art-env-interior/viewer_<zone>_<view>.png. The viewer is unlit beyond the baked light
// (vertex colour x lightmap x the shared texture): no fog, sky, grade or light layers until code-render lands; the
// layer frames are Cycles renders (tests/art_env_interior/evidence.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, openGame } from '../harness.mjs';
import { M } from './common.mjs';

const PIECE = 'art-env-interior';
const VIEWS = {
  tally_house: [
    ['enter_north', [-89, 0, -16.4], [-89, 1.4, -30]],
    ['daylight_stand', [-86, 0, -23.5], [-95.9, 3.6, -30.5]],
    ['knot_stand', [-91.9, 0, -35.5], [-92.6, 0.9, -34.35]],
    ['hearth_to_nw', [-84.6, 0, -19.6], [-93, 1.0, -33]],
    ['tally_wall', [-88.7, 0, -19.5], [-86.5, 1.4, -15]],
  ],
  the_gallery: [
    ['landing1_up', [-86, -4, -33], [-91.5, -0.4, -33]],
    ['landing2_pegs', [-86, -8, -25], [-86.95, -7.2, -28.6]],
    ['mark_eye', [-82.2, -11.85, -15], [-60.2, -7.8, -12.9]],
    ['baffle_east', [-57.5, -12, -14], [-20, -10.5, -14]],
    ['bay', [-86, -12, -16.8], [-87, -10.8, -11]],
  ],
  lift_hall: [
    ['vista_tamper', [-17, -12, -14], [-6, -13.6, -25.3]],
    ['floor_east', [-12, -15, -14], [20, -12, -14]],
    ['cold_bay', [6, -15, 1.6], [8, -13.6, 5]],
    ['slot_from_rib', [3, -15, -7.6], [3, -13.4, 1.12]],
    ['diagram', [12, -15, -23.5], [20, -12.5, -21.5]],
  ],
  the_bore: [
    ['vista_windlass', [14, -36, 83], [14, -40, 94]],
    ['ante_door_wall', [14, -44, 72.5], [14, -42.5, 80]],
    ['mark1_bore', [14, -44, 91.1], [14, -45.5, 96]],
    ['mark4_bore', [14, -44, 100.9], [14, -45.5, 96]],
    ['chamber', [24, -44, 92], [5, -38, 101]],
  ],
};

let server;
test.before(async () => { server = await startServer(); });
test.after(async () => { await server?.close(); });

for (const [zone, views] of Object.entries(VIEWS)) {
  test(`viewer ?zone=${zone}: nodes, counts, lamp sets, evidence frames`, async () => {
    const env = M.zones[zone].env, a = M.assets[env];
    const game = await openGame(server, { page: 'sandbox/viewer', piece: PIECE, start: false, query: { zone, shot: 1 } });
    try {
      const info = await game.page.evaluate(async ({ env, nodes, lampSets }) => {
        const ctx = window.__dbg.ext.core.ctx();
        const loaded = ctx.assets.get(env);
        const missing = nodes.filter((n) => !loaded.scene.getObjectByName(n));
        let tris = 0, calls = 0;
        loaded.scene.traverse((o) => {
          if (!o.isMesh) return;
          const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; calls += Array.isArray(o.material) ? o.material.length : 1;
        });
        const lamps = {};
        for (const [name, count] of Object.entries(lampSets)) {
          const objs = []; ctx.scene.world.traverse((o) => { if (o.name === name) objs.push(o); });
          const obj = objs[0] ?? loaded.scene.getObjectByName(name);
          const u1 = obj.geometry?.attributes?.uv1 ?? obj.geometry?.attributes?.uv2;
          const idx = new Set();
          if (u1) for (let i = 0; i < u1.count; i++) idx.add(Math.round(u1.getX(i) * count - 0.5));
          for (let i = 0; i < count; i++) { ctx.render.lamps.setMask(obj, 1 << i); window.__dbg.step(0, true); }
          ctx.render.lamps.setMask(obj, (1 << count) - 1);
          lamps[name] = { count, indices: [...idx].sort((p, q) => p - q), extra: obj.userData?.lampCount };
        }
        return { missing, tris, calls, lamps, placeholder: loaded.isPlaceholder };
      }, { env, nodes: a.nodes, lampSets: a.lampSets ?? {} });
      assert.equal(info.placeholder, false, `${env} is still a placeholder`);
      assert.deepEqual(info.missing, [], `nodes that do not resolve: ${info.missing.join(', ')}`);
      assert.ok(info.tris <= a.triBudget, `${info.tris} triangles > ${a.triBudget}`);
      assert.ok(info.calls <= a.drawCalls, `${info.calls} draw calls > ${a.drawCalls}`);
      for (const [n, l] of Object.entries(info.lamps)) {
        assert.equal(l.extra, l.count, `${n}: lampCount extra ${l.extra}, manifest ${l.count}`);
        assert.deepEqual(l.indices, [...Array(l.count).keys()], `${n}: lamp indices in UV1 ${l.indices.join(',')}`);
      }
      console.log(`    ${env}: ${info.tris} triangles, ${info.calls} draw calls, nodes ${a.nodes.join(', ')}; lamp sets ${Object.entries(info.lamps).map(([n, l]) => `${n} x${l.count}`).join(', ') || '-'}`);
      for (const [name, feet, target] of views) {
        await game.dbg('teleport', feet[0], feet[1], feet[2], 0, 0);
        await game.dbg('aimAt', target[0], target[1], target[2], 0);
        await game.step(1, true);
        await game.dbg('aimAt', target[0], target[1], target[2], 0);
        const file = await game.shot(`viewer_${zone}_${name}`);
        console.log(`    ${file.split('/shots/')[1]}`);
      }
    } finally { await game.close(); }
  });
}
