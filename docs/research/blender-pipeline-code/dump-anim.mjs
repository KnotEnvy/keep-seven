// node dump-anim.mjs file.glb ClipName nodeName path  -> prints first/last + count of keys
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const [file, clip, node, path] = process.argv.slice(2);
const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(file);
for (const a of doc.getRoot().listAnimations()) {
  if (clip !== '*' && a.getName() !== clip) continue;
  for (const ch of a.listChannels()) {
    if (node !== '*' && ch.getTargetNode()?.getName() !== node) continue;
    if (path !== '*' && ch.getTargetPath() !== path) continue;
    const s = ch.getSampler(), inp = s.getInput(), out = s.getOutput(), n = inp.getCount();
    const f = v => v.map(x => +x.toFixed(4)).join(' ');
    console.log(`${a.getName()} ${ch.getTargetNode().getName()}.${ch.getTargetPath()} ${s.getInterpolation()} keys=${n} t0=${inp.getScalar(0).toFixed(4)} tN=${inp.getScalar(n - 1).toFixed(4)} first=[${f(out.getElement(0, []))}] mid=[${f(out.getElement(n >> 1, []))}] last=[${f(out.getElement(n - 1, []))}]`);
  }
}
