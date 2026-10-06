// viewer.test.mjs: the exterior assets through the REAL asset store in sandbox/viewer.html: no console error, every
// manifest node resolves, triangles and draw calls within the manifest; and the evidence frames (eye-level viewer
// frames of every listed view, shots/art-env-exterior/<view>_viewer.png).
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../harness.mjs';
import { M, OWN } from './geo.mjs';
import { VIEWS, viewerFrames, PIECE, openRetry } from './views.mjs';

test('zones load in the viewer: nodes, triangles and draw calls within the manifest', async () => {
  const server = await startServer();
  try {
    for (const zone of ['the_lip', 'plenty_street', 'far_rim']) {
      const id = M.zones[zone].env;
      const game = await openRetry(server, { page: 'sandbox/viewer', piece: PIECE, query: { zone, shot: 1 }, start: false });
      try {
        await game.step(2, true);
        const info = await game.page.evaluate((assetId) => {
          const ctx = window.__dbg.ext.core.ctx();
          const env = ctx.assets.get(assetId);
          let tris = 0, calls = 0; const names = new Set();
          env.scene.traverse((o) => {
            names.add(o.name);
            if (!o.isMesh || o.name === 'collider_terrain') return;
            calls++;
            const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
          });
          return { tris, calls, names: [...names], placeholder: env.isPlaceholder };
        }, id);
        const a = M.assets[id];
        assert.equal(info.placeholder, false, `${id} is final`);
        for (const n of a.nodes) assert.ok(info.names.includes(n), `${id}: node ${n}`);
        assert.ok(info.tris <= a.triBudget, `${id}: ${info.tris} triangles <= ${a.triBudget}`);
        assert.ok(info.calls <= a.drawCalls, `${id}: ${info.calls} meshes <= ${a.drawCalls} draw calls`);
        console.log(`    ${zone}: ${id} ${info.tris} / ${a.triBudget} triangles, ${info.calls} / ${a.drawCalls} draw calls, ${a.nodes.length} nodes found`);
      } finally { await game.close(); }
    }
  } finally { await server.close(); }
});

test('the unzoned exterior assets pass the viewer check (nodes, triangles, materials resolved)', async () => {
  const server = await startServer();
  try {
    const game = await openRetry(server, { page: 'sandbox/viewer', piece: PIECE, start: false });
    try {
      for (const id of OWN.filter((x) => !M.assets[x].chunks)) {
        const problems = await game.page.evaluate((x) => window.__dbg.ext.viewer.check(x), id);
        assert.deepEqual(problems, [], `${id}: ${problems.join('; ')}`);
        console.log(`    ${id}: no problems`);
      }
    } finally { await game.close(); }
  } finally { await server.close(); }
});

test('evidence: eye-level viewer frames of every listed view', async () => {
  const files = await viewerFrames(VIEWS);
  assert.equal(files.length, VIEWS.length);
  console.log(`    ${files.length} frames in shots/${PIECE}/`);
});
