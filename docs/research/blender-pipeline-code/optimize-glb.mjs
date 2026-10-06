// node optimize-glb.mjs in.glb out.glb [--instance] [--webp]
// Post-export optimisation: dedup -> (instance) -> prune -> reorder -> quantize -> meshopt. Exporter output stays uncompressed.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, instance, reorder, quantize, meshopt, textureCompress, resample } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { statSync } from 'node:fs';
const [input, output, ...flags] = process.argv.slice(2);
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(input);
// keepAttributes: TEXCOORD_1 (lightmap UVs) and COLOR_0 are NOT referenced by any glTF material texture -> default prune() deletes them.
// keepLeaves: marker empties must survive. keepExtras: don't merge nodes/materials that differ only by extras.
const PRUNE = { keepAttributes: true, keepLeaves: true, keepExtras: true, keepSolidTextures: true };
const steps = [dedup(), prune(PRUNE)];
if (flags.includes('--instance')) steps.push(instance({ min: 5 }));              // EXT_mesh_gpu_instancing for meshes used >= 5 times
if (flags.includes('--resample')) steps.push(resample());
if (flags.includes('--webp')) steps.push(textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 85 }));
const lvl = flags.includes('--cleanup') ? {} : { cleanup: false };                 // quantize's cleanup would prune attributes again
steps.push(meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizeTexcoord: 14, ...lvl }));   // = reorder + quantize + EXT_meshopt_compression
await doc.transform(...steps);
await io.write(output, doc);
console.log(`${input} ${statSync(input).size} B -> ${output} ${statSync(output).size} B  ext=[${doc.getRoot().listExtensionsUsed().map(e => e.extensionName)}]`);
