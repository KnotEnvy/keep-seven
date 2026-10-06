// art-props-dress: every asset loads through the REAL asset store (sandbox/viewer.html, __dbg.ext.viewer.check), from
// its file (not synthesised, not a placeholder), its nodes resolve, and its triangles and per-instance draw calls (the
// largest variant counted once) are within its manifest entry. No console error on the way.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, openGame } from '../../harness.mjs';
import { M, IDS, variantNames } from './dress.mjs';

test('the 29 assets through the real loader: checks pass, no placeholder, draw calls within budget', { timeout: 300000 }, async () => {
  const server = await startServer();
  const g = await openGame(server, { page: 'sandbox/viewer', piece: 'art-props-dress', start: false });
  try {
    const rows = [];
    for (const id of IDS) {
      const variants = variantNames(M.assets[id]);
      const r = await g.page.evaluate(async ([id, variants]) => {
        const problems = await window.__dbg.ext.viewer.check(id);
        const ctx = window.__dbg.ext.core.ctx();
        const loaded = ctx.assets.get(id);
        const inst = ctx.assets.instantiate(id);
        const per = {}; let fixed = 0, tris = 0;
        inst.root.traverse((o) => {
          if (!o.isMesh) return;
          let v = null; for (let p = o; p; p = p.parent) if (variants.includes(p.name)) { v = p.name; break; }
          const t = (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
          tris += t;
          if (v) per[v] = (per[v] ?? 0) + 1; else fixed++;
        });
        inst.release();
        return { problems, placeholder: loaded.isPlaceholder, drawCalls: fixed + Math.max(0, ...Object.values(per)), tris };
      }, [id, variants]);
      rows.push(`${id.padEnd(20)} tris ${String(r.tris).padStart(5)}/${M.assets[id].triBudget}  dc ${r.drawCalls}/${M.assets[id].drawCalls}`);
      assert.deepEqual(r.problems, [], `${id}: ${r.problems.join('; ')}`);
      assert.equal(r.placeholder, false, `${id} is still a placeholder in the store`);
      assert.ok(r.tris <= M.assets[id].triBudget, `${id}: ${r.tris} triangles`);
      assert.ok(r.drawCalls <= M.assets[id].drawCalls, `${id}: ${r.drawCalls} draw calls`);
    }
    const report = await g.page.evaluate(() => window.__dbg.ext.assets.report());
    console.log('    ' + rows.join('\n    '));
    console.log(`    store report: ${JSON.stringify(report).slice(0, 200)}`);
  } finally {
    await g.close();
    await server.close();
  }
});
