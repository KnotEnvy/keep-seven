// art-enemies-transit: proj_stake against its manifest entry and the order (4.4).
import test from 'node:test';
import assert from 'node:assert/strict';
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { tool, fs, path, ROOT } from './transit_lib.mjs';

const FILE = path.join(ROOT, 'public/assets/enemies/proj_stake.glb');

test('stake: check-glb passes on proj_stake', () => {
  const r = tool('check-glb.mjs', ['proj_stake']);
  assert.equal(r.status, 0, r.out);
});

test('stake: two variants of 24 triangles, tip at the origin pointing +Z, 0.6 m long and 0.04 m across', async () => {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.read(FILE);
  const palette = JSON.parse(fs.readFileSync(path.join(ROOT, 'blender/lib/palette.json'), 'utf8'));
  const cellAt = (u, v) => { const n = palette.size / palette.cell; const col = Math.floor(u * n), row = Math.floor(v * n); return Object.keys(palette.cells).find((k) => palette.cells[k].col === col && palette.cells[k].row === row); };
  for (const name of ['stake_hot', 'stake_cool']) {
    const node = doc.getRoot().listNodes().find((n) => n.getName() === name);
    assert.ok(node && node.getMesh(), name);
    assert.deepEqual(node.getTranslation().map((x) => Math.abs(x) < 1e-6), [true, true, true], `${name} sits on the origin`);
    const p = node.getMesh().listPrimitives()[0];
    assert.equal(p.getIndices().getCount() / 3, 24);
    const pos = p.getAttribute('POSITION'), uv = p.getAttribute('TEXCOORD_0');
    const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9], v = [0, 0, 0], t = [0, 0];
    const cells = new Set();
    for (let i = 0; i < pos.getCount(); i++) {
      pos.getElement(i, v); for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], v[k]); hi[k] = Math.max(hi[k], v[k]); }
      uv.getElement(i, t); cells.add(cellAt(t[0], t[1]));
    }
    const s = node.getScale();
    assert.ok(Math.abs(hi[2] * s[2]) < 1e-3, `${name}: the tip is at z = 0 (max z ${hi[2] * s[2]})`);
    assert.ok(Math.abs(lo[2] * s[2] + 0.6) < 2e-3, `${name}: the butt is at z = -0.6 (${lo[2] * s[2]})`);
    assert.ok(Math.abs((hi[0] - lo[0]) * s[0] - 0.04) < 2e-3 && Math.abs((hi[1] - lo[1]) * s[1] - 0.04) < 2e-3, `${name}: 0.04 m across`);
    if (name === 'stake_hot') assert.deepEqual([...cells].sort(), ['flame', 'flame_core', 'steel']);
    else assert.deepEqual([...cells].sort(), ['stake_cool', 'steel']);
  }
});
