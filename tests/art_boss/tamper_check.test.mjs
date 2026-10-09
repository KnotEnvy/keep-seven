// art-boss-tamper: check-glb on its own two ids, the manifest's vent rule, budgets, the download share, status.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, loadManifest, glbIsPlaceholder } from '../../tools/pipeline-lib.mjs';
import { loadRig, PUB } from './tamper_lib.mjs';

const M = loadManifest();
const IDS = ['enemy_tamper', 'tamper_cold_static'];
const VENT_CLIPS = ['charge_stun', 'die', 'stagger'];

test('tamper: check-glb passes on enemy_tamper and tamper_cold_static, neither is a placeholder', () => {
  const r = spawnSync('node', [path.join(ROOT, 'tools/check-glb.mjs'), ...IDS], { cwd: ROOT, encoding: 'utf8' });
  console.log(r.stdout.trim());
  assert.equal(r.status, 0, r.stdout + r.stderr);
  for (const id of IDS) assert.equal(glbIsPlaceholder(PUB(id), id), false, `${id} is still a placeholder`);
});

test('tamper: one draw call, 12 bones, 12 clips with the manifest names, four empties on their bones', async () => {
  const a = M.assets.enemy_tamper, rig = await loadRig(PUB('enemy_tamper'));
  assert.equal(rig.nodes.filter((n) => n.getMesh()).length, 1);
  assert.equal(rig.meshNode.getMesh().listPrimitives().length, 1);
  assert.equal(rig.prim.getMaterial().getName(), 'm_prop');
  assert.deepEqual(rig.joints.map((j) => j.getName()).sort(), a.bones.slice().sort());
  assert.deepEqual([...rig.clips.keys()].sort(), a.animations.map((c) => c.name).sort());
  const tris = rig.idx.getCount() / 3;
  assert.ok(tris <= a.triBudget, `${tris} triangles`);
  for (const [node, bone] of [['vent_chest_knot', 'barrel'], ['vent_back_knot', 'barrel'], ['ram_head', 'arm_r_ram'], ['foot_spark', 'leg_r_foot']]) {
    const n = rig.byName.get(node);
    assert.ok(n && !n.getMesh(), `${node} is an empty`);
    assert.equal(rig.parent.get(n).getName(), bone, `${node} rides ${bone}`);
  }
  console.log(`enemy_tamper: ${tris} triangles, ${rig.pos.getCount()} vertices, ${rig.joints.length} joints, ${rig.clips.size} clips`);
});

test('tamper: the vent bones are keyed only in stagger, charge_stun and die; no clip moves the root in X / Z', async () => {
  const rig = await loadRig(PUB('enemy_tamper'));
  const keyed = [];
  for (const [name, anim] of rig.clips) {
    for (const ch of anim.listChannels()) {
      const t = ch.getTargetNode().getName();
      if (t.startsWith('vent_')) keyed.push(name);
      assert.notEqual(t, 'root', `${name} keys the root`);
      assert.ok(!t.endsWith('_rig') && t !== 'enemy_tamper', `${name} keys ${t}`);
    }
  }
  assert.deepEqual([...new Set(keyed)].sort(), VENT_CLIPS);
  console.log(`vent tracks only in: ${[...new Set(keyed)].sort().join(', ')}`);
});

test('tamper: the cold unit is one static mesh without skin, clips or emissive cells; the fighting one has the violet band and both knots', async () => {
  const pal = JSON.parse(fs.readFileSync(path.join(ROOT, 'blender/lib/palette.json'), 'utf8'));
  const n = pal.size / pal.cell;
  const cellAt = (u, v) => Object.entries(pal.cells).find(([, c]) => c.col === Math.min(n - 1, Math.floor(u * n)) && c.row === Math.min(n - 1, Math.floor(v * n)))?.[0];
  const count = (rig) => { const h = {}; const e = []; for (let i = 0; i < rig.idx.getCount(); i += 3) { const [u, v] = rig.uv.getElement(rig.idx.getScalar(i), e); const c = cellAt(u, v); h[c] = (h[c] ?? 0) + 1; } return h; };
  const cold = await loadRig(PUB('tamper_cold_static'));
  assert.equal(cold.joints.length, 0); assert.equal(cold.clips.size, 0);
  assert.equal(cold.nodes.filter((x) => x.getMesh()).length, 1);
  const hc = count(cold);
  for (const c of Object.keys(hc)) assert.ok(!pal.cells[c]?.emis, `the cold unit has faces on the emissive cell ${c}`);
  assert.ok(hc.livery > 0, 'the cold unit wears the livery band');
  const hot = count(await loadRig(PUB('enemy_tamper')));
  assert.ok(hot.violet_band >= 40, 'the band is on the violet_band cell');
  assert.ok(hot.violet >= 200 && hot.violet_core >= 40, 'two knots: lobes on violet, cores on violet_core');
  assert.ok(!hot.livery, 'the fighting unit has no livery paint');
  console.log(`cells: fighting violet_band ${hot.violet_band}, violet ${hot.violet}, violet_core ${hot.violet_core}; cold livery ${hc.livery}, ${cold.idx.getCount() / 3} triangles`);
});

// pass i4 (ruling R14 gave the Tamper 1 000 more triangles for the surface it shows at slam range): the share is 0.27 MB
// (it was 0.25; the fighting unit is 197 kB with its seam, rivets and grime, it was 180; the whole download is 12 of 20 MB)
test('tamper: the two files are within the 0.27 MB download share', () => {
  const sizes = IDS.map((id) => fs.statSync(PUB(id)).size);
  console.log(`download: ${IDS.map((id, i) => `${id} ${(sizes[i] / 1000).toFixed(1)} kB`).join(', ')}; total ${((sizes[0] + sizes[1]) / 1000).toFixed(1)} kB of 270`);
  assert.ok(sizes[0] + sizes[1] <= 270000);
});

test('tamper: asset-status lists no placeholder of this piece', () => {
  const r = spawnSync('node', [path.join(ROOT, 'tools/asset-status.mjs'), '--owner', 'boss'], { cwd: ROOT, encoding: 'utf8' });
  const row = r.stdout.split('\n').find((l) => l.startsWith('art-boss-tamper'));
  assert.ok(row, r.stdout);
  console.log(row.trim());
  assert.ok(!/enemy_tamper|tamper_cold_static/.test(r.stdout.split('\n').filter((l) => !l.startsWith('art-boss')).join('\n')), 'a tamper id is still listed as open');
});
