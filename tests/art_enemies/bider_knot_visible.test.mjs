// art-enemies-bider: the crown knot is a steady, visible target (work order 5; ART_BIBLE 12 item 21). For every 3rd frame
// of run, lunge_windup and circle_strafe a camera 10 m in front at eye height (1.65 m) sees `crown` unoccluded by the
// Bider's own mesh (the first hit lies inside the knot itself, within its collar radius of the crown), and the crown's
// height stays within +-0.06 m over run and +-0.02 m over lunge_windup.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openViewer, setClip, startServer, frames } from './bider_lib.mjs';

test('bider: crown visible from the front in every 3rd frame of run, lunge_windup, circle_strafe; crown height steady', async () => {
  const server = await startServer();
  const g = await openViewer(server, 'enemy_bider');
  try {
    for (const [clip, tol] of [['run', 0.06], ['lunge_windup', 0.02], ['circle_strafe', null]]) {
      const n = frames(clip); const ys = []; const lines = [];
      for (let f = 0; f <= n; f += 3) {
        await setClip(g, clip, f / n);
        const r = await g.page.evaluate(() => {
          const ctx = window.__dbg.ext.core.ctx();
          const holder = ctx.scene.dynamic.getObjectByName('viewer_holder'); holder.updateMatrixWorld(true);
          let root = null; holder.traverse((o) => { if (!root && o.userData && o.userData.asset) root = o; });
          const crown = root.getObjectByName('crown');
          const V = crown.position.constructor;
          const c = crown.getWorldPosition(new V()); const local = root.worldToLocal(c.clone());
          const eye = root.localToWorld(new V(0, 1.65, 10));
          const dir = c.clone().sub(eye); const dist = dir.length(); dir.normalize();
          let mesh = null; root.traverse((o) => { if (o.isSkinnedMesh) mesh = o; });
          mesh.skeleton.update(); mesh.computeBoundingSphere(); mesh.computeBoundingBox && mesh.computeBoundingBox();
          // ray against the skinned triangles, where they are drawn
          const pos = mesh.geometry.getAttribute('position'), idx = mesh.geometry.index;
          const a = new V(), b = new V(), cc = new V(); let best = Infinity;
          const e1 = new V(), e2 = new V(), p = new V(), q = new V(), t0 = new V();
          for (let i = 0; i < idx.count; i += 3) {
            mesh.getVertexPosition(idx.getX(i), a).applyMatrix4(mesh.matrixWorld);
            mesh.getVertexPosition(idx.getX(i + 1), b).applyMatrix4(mesh.matrixWorld);
            mesh.getVertexPosition(idx.getX(i + 2), cc).applyMatrix4(mesh.matrixWorld);
            e1.subVectors(b, a); e2.subVectors(cc, a); p.crossVectors(dir, e2); const det = e1.dot(p);
            if (Math.abs(det) < 1e-12) continue;
            const id = 1 / det; t0.subVectors(eye, a); const u = t0.dot(p) * id; if (u < 0 || u > 1) continue;
            q.crossVectors(t0, e1); const v = dir.dot(q) * id; if (v < 0 || u + v > 1) continue;
            const t = e2.dot(q) * id; if (t > 0 && t < best) best = t;
          }
          return { y: local.y, z: local.z, dist, hit: best };
        });
        ys.push(r.y);
        lines.push(`f${f} y ${r.y.toFixed(3)} first hit ${(r.dist - r.hit).toFixed(3)} m before the crown`);
        assert.ok(r.hit >= r.dist - 0.21, `${clip} f${f}: the crown is hidden ${(r.dist - r.hit).toFixed(3)} m behind the first surface`);
      }
      const mid = (Math.max(...ys) + Math.min(...ys)) / 2, half = (Math.max(...ys) - Math.min(...ys)) / 2;
      console.log(`  ${clip}: crown y ${mid.toFixed(3)} +- ${half.toFixed(3)} m\n    ` + lines.join('\n    '));
      if (tol !== null) assert.ok(half <= tol, `${clip}: crown height varies +-${half.toFixed(3)} m`);
    }
  } finally { await g.close(); await server.close(); }
});
