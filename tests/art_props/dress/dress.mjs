// Shared helpers of the art-props-dress tests (not a test file): the piece's asset ids and a reader for the SHIPPED
// files (public/assets, meshopt-compressed) that gives positions, colours and node transforms in asset space.
import path from 'node:path';
import { ROOT, loadManifest, loadLayout, pieceOf, gltfIO, worldMatrix, mat4Point } from '../../../tools/pipeline-lib.mjs';
import { variantNames } from '../../../tools/check-glb.mjs';

export { ROOT, loadLayout, variantNames };
export const M = loadManifest();
/** The 29 assets this piece answers for (manifest owner props_dress, minus the three shared textures). */
export const IDS = Object.keys(M.assets).filter((id) => pieceOf(M, id) === 'art-props-dress').sort();

/** Read a shipped GLB. Returns { doc, nodes: Map(name -> node), meshNodes, variantOf(node) }. */
export async function readAsset(id) {
  const io = await gltfIO();
  const doc = await io.read(M.assets[id]._pub);
  const nodes = new Map(doc.getRoot().listNodes().map((n) => [n.getName(), n]));
  const meshNodes = doc.getRoot().listNodes().filter((n) => n.getMesh());
  const vs = new Set(variantNames(M.assets[id]));
  const variantOf = (n) => { for (let p = n; p; p = p.getParentNode()) if (vs.has(p.getName())) return p.getName(); return null; };
  return { doc, nodes, meshNodes, variantOf };
}

/** Every vertex of a primitive in asset space (the root sits at the origin), with its COLOR_0 (0..1) if present. */
export function vertices(node, prim) {
  const m = worldMatrix(node);
  const pos = prim.getAttribute('POSITION'), col = prim.getAttribute('COLOR_0');
  const out = [];
  const e = [0, 0, 0], c = [0, 0, 0, 0];
  const norm = col && col.getNormalized() && col.getComponentType() !== 5126;
  const max = col ? ({ 5121: 255, 5123: 65535 }[col.getComponentType()] ?? 1) : 1;
  for (let i = 0; i < pos.getCount(); i++) {
    pos.getElement(i, e);
    const p = mat4Point(m, e);
    let rgb = null;
    if (col) { col.getElement(i, c); rgb = norm && c[0] > 1.0001 ? [c[0] / max, c[1] / max, c[2] / max] : [c[0], c[1], c[2]]; }
    out.push({ p, rgb });
  }
  return out;
}

/** Triangle count of a primitive. */
export function tris(prim) { const i = prim.getIndices(); return (i ? i.getCount() : prim.getAttribute('POSITION').getCount()) / 3; }

/** Asset-space bounding box over mesh nodes (optionally only one variant). */
export function bounds(a, variant = null) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const n of a.meshNodes) {
    if (variant !== null && a.variantOf(n) !== variant) continue;
    for (const prim of n.getMesh().listPrimitives()) for (const v of vertices(n, prim)) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], v.p[k]); hi[k] = Math.max(hi[k], v.p[k]); }
  }
  return { lo, hi, size: hi.map((h, k) => h - lo[k]) };
}

export const lum = (rgb) => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
export const rel = (p) => path.relative(ROOT, p);

/** The variant nodes of an asset that really carry meshes (variantNames also lists plain empties such as a glint). */
export function meshVariants(a, id) {
  return variantNames(M.assets[id]).filter((v) => a.meshNodes.some((n) => a.variantOf(n) === v));
}
