// Usage: node inspect-glb.mjs file.glb [--json]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { statSync } from 'node:fs';

const file = process.argv[2];
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(file);
const root = doc.getRoot();
const out = { file, bytes: statSync(file).size, extensionsUsed: root.listExtensionsUsed().map(e => e.extensionName) };

out.nodes = root.listNodes().map(n => ({
  name: n.getName(),
  parent: n.getParentNode()?.getName() ?? null,
  mesh: n.getMesh()?.getName() ?? null,
  skin: n.getSkin()?.getName() ?? null,
  t: n.getTranslation().map(v => +v.toFixed(4)),
  r: n.getRotation().map(v => +v.toFixed(4)),
  s: n.getScale().map(v => +v.toFixed(4)),
  extras: Object.keys(n.getExtras()).length ? n.getExtras() : undefined,
}));

let totalTris = 0;
out.meshes = root.listMeshes().map(m => {
  const prims = m.listPrimitives().map(p => {
    const idx = p.getIndices();
    const pos = p.getAttribute('POSITION');
    const tris = (idx ? idx.getCount() : pos.getCount()) / 3;
    const attrs = {};
    for (const s of p.listSemantics()) {
      const a = p.getAttribute(s);
      attrs[s] = `${a.getType()}/${a.getComponentType() === 5126 ? 'f32' : a.getComponentType() === 5123 ? 'u16' : a.getComponentType() === 5121 ? 'u8' : a.getComponentType()}${a.getNormalized() ? 'n' : ''}`;
    }
    return { material: p.getMaterial()?.getName() ?? null, verts: pos.getCount(), tris, attrs, targets: p.listTargets().length || undefined };
  });
  const users = m.listParents().filter(p => p.propertyType === 'Node').length;
  const tris = prims.reduce((a, p) => a + p.tris, 0);
  totalTris += tris * users;
  return { name: m.getName(), users, tris, prims, extras: Object.keys(m.getExtras()).length ? m.getExtras() : undefined };
});
out.totalTrisInstanced = totalTris;

out.materials = root.listMaterials().map(m => ({
  name: m.getName(),
  baseColor: m.getBaseColorFactor().map(v => +v.toFixed(3)),
  metallic: +m.getMetallicFactor().toFixed(3), roughness: +m.getRoughnessFactor().toFixed(3),
  emissive: m.getEmissiveFactor().map(v => +v.toFixed(3)),
  alphaMode: m.getAlphaMode(), doubleSided: m.getDoubleSided(),
  tex: {
    baseColor: m.getBaseColorTexture()?.getName() ?? null, baseColorUV: m.getBaseColorTextureInfo()?.getTexCoord(),
    mr: m.getMetallicRoughnessTexture()?.getName() ?? null,
    normal: m.getNormalTexture()?.getName() ?? null,
    occlusion: m.getOcclusionTexture()?.getName() ?? null, occlusionUV: m.getOcclusionTextureInfo()?.getTexCoord(),
    emissive: m.getEmissiveTexture()?.getName() ?? null, emissiveUV: m.getEmissiveTextureInfo()?.getTexCoord(),
  },
  extensions: m.listExtensions().map(e => e.extensionName),
  extras: Object.keys(m.getExtras()).length ? m.getExtras() : undefined,
}));

let texBytesGPU = 0;
out.textures = root.listTextures().map(t => {
  const size = t.getSize() ?? [0, 0];
  const gpu = Math.round(size[0] * size[1] * 4 * 4 / 3);   // RGBA8 + mips
  texBytesGPU += gpu;
  return { name: t.getName(), mime: t.getMimeType(), size, fileBytes: t.getImage()?.byteLength ?? 0, gpuBytesRGBA8Mips: gpu };
});
out.gpuTextureMB = +(texBytesGPU / 1048576).toFixed(2);

out.animations = root.listAnimations().map(a => {
  let dur = 0, start = Infinity, keys = 0;
  const targets = new Set();
  for (const ch of a.listChannels()) {
    const s = ch.getSampler(); const inp = s.getInput(); const n = inp.getCount();
    keys = Math.max(keys, n);
    start = Math.min(start, inp.getScalar(0)); dur = Math.max(dur, inp.getScalar(n - 1));
    targets.add(`${ch.getTargetNode()?.getName()}.${ch.getTargetPath()}`);
  }
  return { name: a.getName(), start: +start.toFixed(4), end: +dur.toFixed(4), channels: a.listChannels().length, maxKeys: keys,
           interp: [...new Set(a.listSamplers().map(s => s.getInterpolation()))], targets: [...targets] };
});
out.skins = root.listSkins().map(s => ({ name: s.getName(), joints: s.listJoints().map(j => j.getName()) }));

if (process.argv.includes('--json')) console.log(JSON.stringify(out, null, 1));
else {
  console.log(`${file}  ${(out.bytes / 1024).toFixed(1)} kB  ext=[${out.extensionsUsed}]`);
  console.log(`nodes=${out.nodes.length} meshes=${out.meshes.length} tris(instanced)=${out.totalTrisInstanced} materials=${out.materials.length} textures=${out.textures.length} gpuTexMB=${out.gpuTextureMB}`);
  for (const n of out.nodes) console.log(`  node ${n.name} parent=${n.parent} mesh=${n.mesh} skin=${n.skin} t=${n.t} r=${n.r} s=${n.s}${n.extras ? ' extras=' + JSON.stringify(n.extras) : ''}`);
  for (const m of out.meshes) { console.log(`  mesh ${m.name} users=${m.users} tris=${m.tris}${m.extras ? ' extras=' + JSON.stringify(m.extras) : ''}`); for (const p of m.prims) console.log(`    prim mat=${p.material} verts=${p.verts} tris=${p.tris} ${JSON.stringify(p.attrs)}${p.targets ? ' targets=' + p.targets : ''}`); }
  for (const m of out.materials) console.log(`  mat ${m.name} base=${m.baseColor} M=${m.metallic} R=${m.roughness} E=${m.emissive} alpha=${m.alphaMode} ds=${m.doubleSided} tex=${JSON.stringify(m.tex)} ext=[${m.extensions}]${m.extras ? ' extras=' + JSON.stringify(m.extras) : ''}`);
  for (const t of out.textures) console.log(`  tex ${t.name} ${t.mime} ${t.size} file=${t.fileBytes}B gpu=${(t.gpuBytesRGBA8Mips / 1048576).toFixed(2)}MB`);
  for (const a of out.animations) console.log(`  anim "${a.name}" ${a.start}..${a.end}s ch=${a.channels} keys<=${a.maxKeys} interp=${a.interp} targets=${a.targets.join(',')}`);
  for (const s of out.skins) console.log(`  skin ${s.name} joints=${s.joints}`);
}
