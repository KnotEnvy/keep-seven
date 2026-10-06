// art-enemies-transit: the shipped enemy_transit.glb against its manifest entry and the order's numbers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { tool, manifest, fs, path, ROOT } from './transit_lib.mjs';

const ID = 'enemy_transit';
const FILE = path.join(ROOT, 'public/assets/enemies', ID + '.glb');
async function read() {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  return io.read(FILE);
}

test('transit: check-glb passes on enemy_transit', () => {
  const r = tool('check-glb.mjs', [ID]);
  assert.equal(r.status, 0, r.out);
});

test('transit: it is final, not a placeholder (asset-status)', () => {
  const r = tool('asset-status.mjs', ['--owner', 'enemies']);
  const line = r.out.split('\n').find((l) => l.includes(ID));
  assert.ok(line === undefined || !/placeholder/i.test(line), `asset-status still lists ${ID} as a placeholder:\n${r.out}`);
});

test('transit: 8 bones, 10 clips, one mesh, one material, within 2 000 triangles, sockets on the head', async () => {
  const doc = await read();
  const root = doc.getRoot();
  const a = manifest().assets[ID];
  const skin = root.listSkins();
  assert.equal(skin.length, 1);
  assert.deepEqual(skin[0].listJoints().map((j) => j.getName()).sort(), [...a.bones].sort());
  assert.deepEqual(root.listAnimations().map((x) => x.getName()).sort(), a.animations.map((c) => c.name).sort());
  const meshes = root.listMeshes();
  assert.equal(meshes.length, 1);
  const prims = meshes[0].listPrimitives();
  assert.equal(prims.length, 1, 'one primitive = one draw call');
  assert.equal(prims[0].getMaterial().getName(), 'm_prop');
  const tris = prims[0].getIndices().getCount() / 3;
  assert.ok(tris <= a.triBudget, `${tris} triangles > ${a.triBudget}`);
  assert.equal(root.listTextures().length, 0);
  for (const n of ['lens', 'stake_muzzle']) {
    const node = root.listNodes().find((x) => x.getName() === n);
    assert.ok(node && !node.getMesh(), `${n} is an empty`);
    assert.equal(node.getParentNode().getName(), 'head', `${n} rides the head bone`);
  }
  // rigid skin: every vertex has exactly one weight
  const w = prims[0].getAttribute('WEIGHTS_0'); const el = [0, 0, 0, 0];
  for (let i = 0; i < w.getCount(); i++) { w.getElement(i, el); const m = Math.max(...el), s = el[0] + el[1] + el[2] + el[3]; assert.ok(m / s > 0.999, `vertex ${i} is not rigid: ${el}`); }
  console.log(`  enemy_transit: ${tris} / ${a.triBudget} triangles, ${skin[0].listJoints().length} bones, ${root.listAnimations().length} clips, ${fs.statSync(FILE).size} bytes`);
});

test('transit: the root bone never translates horizontally, in any clip', async () => {
  const doc = await read();
  for (const an of doc.getRoot().listAnimations()) {
    for (const ch of an.listChannels()) {
      if (ch.getTargetNode().getName() !== 'root' || ch.getTargetPath() !== 'translation') continue;
      const out = ch.getSampler().getOutput(); const v = [0, 0, 0];
      for (let i = 0; i < out.getCount(); i++) { out.getElement(i, v); assert.ok(Math.abs(v[0]) < 1e-4 && Math.abs(v[2]) < 1e-4, `${an.getName()}: root at ${v}`); }
    }
  }
});

test('transit + stake: download share within 0.25 MB', () => {
  const total = ['enemy_transit', 'proj_stake'].reduce((s, id) => s + fs.statSync(path.join(ROOT, 'public/assets/enemies', id + '.glb')).size, 0);
  console.log(`  enemy_transit + proj_stake: ${total} bytes`);
  assert.ok(total <= 250000, `${total} bytes`);
});
