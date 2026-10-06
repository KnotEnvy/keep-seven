// check.test.mjs: every exterior asset passes tools/check-glb.mjs, and none of env_exterior's P0 assets is a placeholder.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ROOT } from '../harness.mjs';
import { OWN } from './geo.mjs';

const node = (args) => spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });

test('check-glb passes on the six exterior assets and their two lightmaps', () => {
  const r = node([path.join(ROOT, 'tools/check-glb.mjs'), ...OWN, 'lm_surface', 'lm_rim']);
  console.log(r.stdout.trim().split('\n').map((l) => '    ' + l).join('\n'));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  for (const id of OWN) assert.match(r.stdout, new RegExp(`^ok\\s+${id}\\s`, 'm'), `${id} passes`);
  assert.doesNotMatch(r.stdout, /placeholder/, 'no exterior asset is a placeholder');
});

test('asset-status: no P0 asset of env_exterior is a placeholder', () => {
  const r = node([path.join(ROOT, 'tools/asset-status.mjs'), '--require=0', '--owner', 'env_exterior']);
  console.log(r.stdout.trim().split('\n').slice(-6).map((l) => '    ' + l).join('\n'));
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('every chunk stays within its share of the triangle budget (the chunk plan is law)', async () => {
  const { M, loadAsset } = await import('./geo.mjs');
  for (const id of ['env_the_lip', 'env_plenty_street', 'env_far_rim']) {
    const a = await loadAsset(id);
    const per = {};
    a.mesh.forEach((m) => { const c = m.split('__')[0]; per[c] = (per[c] ?? 0) + 1; });
    for (const c of M.assets[id].chunks) {
      console.log(`    ${id} ${c.id.padEnd(16)} ${String(per[c.id] ?? 0).padStart(6)} / ${c.tris}`);
      assert.ok((per[c.id] ?? 0) <= c.tris, `${c.id}: ${per[c.id]} triangles > its share ${c.tris}`);
    }
  }
});
