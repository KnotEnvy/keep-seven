// Debug tool (lifted from docs/research/blender-pipeline-code). Reads raw and meshopt-compressed GLBs.
// node tools/dump-attr.mjs file.glb MeshName SEMANTIC [count]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
const [file, meshName, sem, cnt = '4'] = process.argv.slice(2);
await MeshoptDecoder.ready;
const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder }).read(file);
for (const m of doc.getRoot().listMeshes()) {
  if (meshName !== '*' && m.getName() !== meshName) continue;
  for (const p of m.listPrimitives()) {
    const a = p.getAttribute(sem);
    if (!a) { console.log(m.getName(), sem, 'MISSING', p.listSemantics().join(',')); continue; }
    const rows = [];
    for (let i = 0; i < Math.min(+cnt, a.getCount()); i++) rows.push(a.getElement(i, []).map(v => +v.toFixed(4)).join(' '));
    console.log(m.getName(), sem, a.getType(), a.getComponentType(), 'norm=' + a.getNormalized(), 'count=' + a.getCount(), '|', rows.join(' | '));
  }
}
