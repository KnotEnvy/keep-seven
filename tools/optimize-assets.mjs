// node tools/optimize-assets.mjs [ids | owners | pieces ...] [--all] [--manifest overlay.json]
//
// RAW export (blender/export) -> shipped file (public/assets). Exactly the chain of ARCHITECTURE 7.1:
//   GLB:  dedup -> weld -> resample -> prune({ keepLeaves, keepAttributes, keepExtras }) -> remove every embedded image
//         -> reorder -> quantize (normals 10 bit, UVs 14 bit, colours 12 bit; POSITION stays float32) -> EXT_meshopt_compression
//         NEVER join(), NEVER instance(): both discard node names and extras.
//   PNG:  sharp -> WebP. Palettes lossless; colour lossy (q 90); lightmaps, layers and R8 data near-lossless.
// A placeholder never overwrites a shipped file that is not a placeholder.
// Exit code 1 when any id fails. Importable: optimizeAsset(M, id), optimizeTexture(M, id).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PropertyType } from '@gltf-transform/core';
import { EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, weld, resample, prune, reorder, quantize } from '@gltf-transform/functions';
import sharp from 'sharp';
import { ROOT, rel, loadManifest, overlayArg, select, allIds, gltfIO, glbIsPlaceholder, pngIsPlaceholder, webpIsPlaceholder, writeFileAtomic, fmtBytes } from './pipeline-lib.mjs';

/** Colour precision: 12 bits survive the real loader within 1/4096 (tests/pipeline/pipeline.test.mjs). */
export const QUANTIZE = { pattern: /^(NORMAL|TANGENT|TEXCOORD|COLOR|JOINTS|WEIGHTS)(_\d+)?$/, quantizeNormal: 10, quantizeTexcoord: 14, quantizeColor: 12 };

export async function optimizeGlb(input, output) {
  const io = await gltfIO();
  const doc = await io.read(input);
  doc.setLogger({ debug() {}, info() {}, warn() {}, error(m) { console.error(m); } });
  await doc.transform(
    // keepUniqueNames: our materials are NAMES (m_frontier and m_pellam have identical glTF content)
    dedup({ keepUniqueNames: true, propertyTypes: [PropertyType.ACCESSOR, PropertyType.MESH, PropertyType.TEXTURE, PropertyType.MATERIAL] }),
    weld(),
    resample(),
    prune({ keepLeaves: true, keepAttributes: true, keepExtras: true }),
  );
  const root = doc.getRoot();
  for (const t of root.listTextures()) t.dispose();                   // GLBs ship no textures
  for (const ext of root.listExtensionsUsed()) {
    if (ext.extensionName === 'EXT_mesh_gpu_instancing') throw new Error('the raw export contains EXT_mesh_gpu_instancing (in-file instancing is not allowed)');
  }
  await doc.transform(
    reorder({ encoder: io._encoder, target: 'size' }),
    quantize(QUANTIZE),
  );
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  const bytes = await io.writeBinary(doc);
  writeFileAtomic(output, bytes);
  return bytes.byteLength;
}

/**
 * Optimise the raw export of `id` into its shipped path. `raw` / `out` override the two paths (the build driver
 * optimises a staged raw file into a temporary file and renames it only after check-glb passed).
 */
export async function optimizeAsset(M, id, { raw, out } = {}) {
  const a = M.assets[id];
  raw ??= a._raw;
  if (!fs.existsSync(raw)) throw new Error(`no raw export at ${rel(raw)}`);
  const rawPh = glbIsPlaceholder(raw, id), pubPh = glbIsPlaceholder(a._pub, id);
  if (rawPh && pubPh === false) return { id, skipped: 'a final file is shipped; the placeholder does not replace it', bytes: fs.statSync(a._pub).size };
  const bytes = await optimizeGlb(raw, out ?? a._pub);
  return { id, bytes, placeholder: rawPh };
}

export async function optimizeTexture(M, id, { raw, out } = {}) {
  const t = M.textures[id];
  raw ??= t._raw;
  if (!fs.existsSync(raw)) throw new Error(`no raw texture at ${rel(raw)}`);
  const rawPh = pngIsPlaceholder(raw), pubPh = webpIsPlaceholder(t._pub);
  if (rawPh && pubPh === false) return { id, skipped: 'a final texture is shipped; the placeholder does not replace it', bytes: fs.statSync(t._pub).size };
  const meta = await sharp(raw).metadata();
  if (meta.width !== t.size[0] || meta.height !== t.size[1]) throw new Error(`${rel(raw)} is ${meta.width} x ${meta.height}; the manifest says ${t.size[0]} x ${t.size[1]}`);
  const grey = t.format === 'r8';
  if (grey && meta.channels > 2) {
    throw new Error(`${rel(raw)} has ${meta.channels} channels; format r8 wants a greyscale PNG `
      + "(with sharp: add .toColourspace('b-w') before .png(); sharp writes a 1-channel raw buffer as a 3-channel PNG otherwise)");
  }
  let img = sharp(raw);
  if (grey) img = img.toColourspace('b-w');
  let opts;
  if (t.kind === 'palette' || t.kind === 'emissive') opts = { lossless: true, effort: 6 };
  else if (t.kind === 'lightmap' || t.kind === 'lightlayer') opts = { nearLossless: true, quality: 90, effort: 6 };
  else if (t.kind === 'mask') opts = { nearLossless: true, quality: 80, effort: 6 };
  else if (grey) opts = { nearLossless: true, quality: 80, effort: 6 };                              // R8 detail: within 2/255
  else opts = { quality: 90, alphaQuality: 100, effort: 6, smartSubsample: true };                      // colour: lossy
  // a placeholder is marked in EXIF so asset-status and the next build can tell
  img = img.withExif(rawPh ? { IFD0: { ImageDescription: 'ks-placeholder' } } : { IFD0: { ImageDescription: 'ks-final' } });
  const buf = await img.webp(opts).toBuffer();
  writeFileAtomic(out ?? t._pub, buf);
  return { id, bytes: buf.byteLength, placeholder: rawPh };
}

async function main() {
  const argv = process.argv.slice(2);
  const M = loadManifest(overlayArg(argv));
  const all = argv.includes('--all');
  const names = argv.filter((x) => !x.startsWith('--'));
  const sel = all || names.length === 0 ? allIds(M, !!M._overlay) : select(M, names);
  let failed = 0;
  for (const [kind, ids, fn] of [['texture', sel.textures, optimizeTexture], ['asset', sel.assets, optimizeAsset]]) {
    for (const id of ids) {
      try {
        const r = await fn(M, id);
        console.log(`${r.skipped ? 'kept     ' : 'optimised'} ${id.padEnd(24)} ${fmtBytes(r.bytes).padStart(10)}${r.placeholder ? '  placeholder' : ''}${r.skipped ? '  (' + r.skipped + ')' : ''}`);
      } catch (e) { failed++; console.log(`FAILED    ${id}: ${e.message}`); }
    }
  }
  if (failed) { console.log(`${failed} failed`); process.exit(1); }
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
