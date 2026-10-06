// node tools/check-glb.mjs [ids | owners | pieces ... | --all] [--manifest overlay.json] [--quiet]
//
// Fails (exit 1) when a SHIPPED file (public/assets) breaks its manifest entry (ARCHITECTURE 7.2, 7.4, 7.5):
//   structure   one root named by the id at the origin; no embedded image; no EXT_mesh_gpu_instancing
//   budget      triangles <= triBudget; draw calls <= drawCalls: one per mesh primitive (two meshes sharing a material are
//               two calls), variant nodes counted as the largest one; zones: one per planned mesh
//   light       standalone assets: every mesh carries the extra `bake` the manifest's bake asks for (AO | VL | UNLIT | LM +
//               `lightmap`; a prop its ZONE lights, i.e. bake VL + placedBy zone or LM without a lightmap of its own, is AO);
//               a manifest `nodeParent` (socket -> bone) is honoured
//   materials   every primitive uses a material listed for the asset; COLOR_0 present
//   names       every `nodes` / `bones` name exists. A `nodes` name may be an empty, a bone, a variant / lamp-set / drawn
//               mesh node or an animated empty with a child mesh; a name in both `nodes` and `bones` must be a bone; a
//               `skinned: true` asset must contain a skinned mesh
//   positions   a node with a `nodePos` or a hit role is not a mesh node (lamp sets excepted); `nodePos` within 0.03 m
//   clips       every clip present, within one frame of `seconds`, loops with identical first and last keys, no motion
//               on `codeDriven` nodes; no clip that the manifest does not list
//   lamp sets   m_emis mesh, extra lampCount = manifest, lamp indices in UV1.x
//   skin        every vertex of a skinned mesh weighted
//   zones       meshes exactly the chunk plan + drawnNodes (+ collider_terrain); chunk meshes inside their box; a
//               `part: "high"` chunk 3 m above the path's ground; dressing empties within the zone's allowance and none
//               taller than 0.35 m on a nav link; collider_terrain (final art: no triangle facing down) within 0.3 m of nav nodes and no step over 0.35 m on a
//               nav link; UV1 on LM meshes; vertex-lit vertices exactly on the neutral texel
//   thin        every connected island longer than 0.5 m whose two smaller dimensions are under 3 cm fails unless its
//               mesh node carries `thin_ok: <metres>` and 2 mm per metre holds
//   textures    manifest size and channels; lightmaps and layers with the neutral texel painted
// Prints file bytes per asset. Importable: checkAsset(M, L, id, { file }), checkTexture(M, id, { file }).
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { rel, loadManifest, loadLayout, overlayArg, select, allIds, gltfIO, worldMatrix, mat4Point, dist, fmtBytes, GAME_MATERIALS, FPS } from './pipeline-lib.mjs';
import { World, WALKABLE } from './layout_geom.mjs';

const NODE_TOL = 0.03;
const HIT_ROLE = /(_hit$|^socket_|^muzzle|_muzzle$|^thread_anchor_|^eject$|^cam_look$|^glint$|^crown$|^hand_socket)/;
const DRESS = /^(inst|brk)_\d{3}$/;
const COLLIDER = 'collider_terrain';
// The `bake` extras a mesh of standalone asset `a` may carry (the same rule as blender/lib/export.py bake_extras).
// An asset that its ZONE lights holds unlit colours in its own file: an LM asset that lists no lightmap of its own
// (ia_proving_mark) is AO | VL; a VL asset that is `placedBy: zone` (zone.embed_prop + the zone's vertex-light bake) is AO:
// stamped VL the runtime would show its unlit tint x AO at twice the authored brightness.
export function bakeExtras(a) {
  if (/LM/.test(a.bake ?? '') && !(a.lightmaps ?? []).length) return ['AO', 'VL'];
  if (a.bake === 'VL' && a.placedBy === 'zone') return ['AO'];
  return BAKE_EXTRAS[a.bake];
}
const BAKE_EXTRAS = { AO: ['AO'], VL: ['VL'], UNLIT: ['UNLIT'], LM: ['LM'], 'LM+VL': ['LM', 'VL'] };   // manifest bake -> mesh extra
const BOX_TOL = 0.75;   // a wall may poke this far out of its chunk box (the layout's shaft walls do, by 0.5 m)

/**
 * Variant nodes of a standalone asset: the `nodes` names that are realised as plain mesh nodes shown ONE AT A TIME
 * (jug_intact / jug_broken, bottle_a / b / c ...). Everything else named there is a bone, a lamp set, a drawn or
 * code-driven mesh, a skinned `*_mesh`, or an empty. Same rule as blender/lib/export.variant_names.
 */
export function variantNames(a) {
  const not = new Set([...(a.bones ?? []), ...Object.keys(a.lampSets ?? {}), ...(a.drawnNodes ?? []), ...(a.codeDriven ?? [])]);
  return (a.nodes ?? []).filter((n) => !not.has(n) && !n.endsWith('_mesh'));
}

function primTris(p) { const i = p.getIndices(); return (i ? i.getCount() : p.getAttribute('POSITION').getCount()) / 3; }

/** Positions of a primitive in world space as a flat Float64Array. */
function worldPositions(node, prim) {
  const m = worldMatrix(node), a = prim.getAttribute('POSITION'), n = a.getCount(), out = new Float64Array(n * 3), e = [0, 0, 0];
  for (let i = 0; i < n; i++) { a.getElement(i, e); const w = mat4Point(m, e); out[i * 3] = w[0]; out[i * 3 + 1] = w[1]; out[i * 3 + 2] = w[2]; }
  return out;
}
function indicesOf(prim) {
  const idx = prim.getIndices(), n = idx ? idx.getCount() : prim.getAttribute('POSITION').getCount();
  const out = new Uint32Array(n);
  for (let i = 0; i < n; i++) out[i] = idx ? idx.getScalar(i) : i;
  return out;
}

// ---------------------------------------------------------------- the path's ground (same rule as blender/lib/layout.py)
function navSegments(L, zone) {
  const nodes = new Map(L.nav.nodes.map((n) => [n.id, n])), segs = [], used = new Set();
  for (const [a, b] of L.nav.links) {
    const na = nodes.get(a), nb = nodes.get(b);
    if (na.zone === zone && nb.zone === zone) { segs.push([na.pos, nb.pos]); used.add(a); used.add(b); }
  }
  for (const n of L.nav.nodes) if (n.zone === zone && !used.has(n.id)) segs.push([n.pos, n.pos]);
  return segs;
}
function nearestOnPath(segs, x, z) {
  let best = null, bd = Infinity;
  for (const [a, b] of segs) {
    const dx = b[0] - a[0], dz = b[2] - a[2], l2 = dx * dx + dz * dz;
    const t = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[2]) * dz) / l2));
    const qx = a[0] + dx * t, qz = a[2] + dz * t, d = (x - qx) ** 2 + (z - qz) ** 2;
    if (d < bd) { bd = d; best = { y: a[1] + (b[1] - a[1]) * t, d: Math.sqrt(d) }; }
  }
  return best;
}

// ---------------------------------------------------------------- thin geometry
function eigenExtents(pts, count) {
  // principal axes by Jacobi on the covariance; returns the three extents, largest first
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < count; i++) { cx += pts[i * 3]; cy += pts[i * 3 + 1]; cz += pts[i * 3 + 2]; }
  cx /= count; cy /= count; cz /= count;
  const c = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < count; i++) {
    const d = [pts[i * 3] - cx, pts[i * 3 + 1] - cy, pts[i * 3 + 2] - cz];
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) c[a][b] += d[a] * d[b];
  }
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 12; sweep++) {
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (Math.abs(c[p][q]) < 1e-14) continue;
      const th = (c[q][q] - c[p][p]) / (2 * c[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const cs = 1 / Math.sqrt(t * t + 1), sn = t * cs;
      for (let k = 0; k < 3; k++) { const a = c[k][p], b = c[k][q]; c[k][p] = cs * a - sn * b; c[k][q] = sn * a + cs * b; }
      for (let k = 0; k < 3; k++) { const a = c[p][k], b = c[q][k]; c[p][k] = cs * a - sn * b; c[q][k] = sn * a + cs * b; }
      for (let k = 0; k < 3; k++) { const a = v[k][p], b = v[k][q]; v[k][p] = cs * a - sn * b; v[k][q] = sn * a + cs * b; }
    }
  }
  const ext = [];
  for (let a = 0; a < 3; a++) {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < count; i++) {
      const d = (pts[i * 3] - cx) * v[0][a] + (pts[i * 3 + 1] - cy) * v[1][a] + (pts[i * 3 + 2] - cz) * v[2][a];
      if (d < lo) lo = d; if (d > hi) hi = d;
    }
    ext.push(hi - lo);
  }
  return { ext: ext.sort((a, b) => b - a), centre: [cx, cy, cz] };
}
/** Connected islands (by vertex POSITION, 0.1 mm) of a primitive: [{ ext: [l, w, t], centre }] */
export function islands(pos, idx) {
  const n = pos.length / 3, parent = new Int32Array(n);
  const key = new Map(), rep = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(pos[i * 3] * 1e4)},${Math.round(pos[i * 3 + 1] * 1e4)},${Math.round(pos[i * 3 + 2] * 1e4)}`;
    if (!key.has(k)) key.set(k, i);
    rep[i] = key.get(k); parent[i] = i;
  }
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const used = new Uint8Array(n);
  for (let t = 0; t < idx.length; t += 3) {
    const a = find(rep[idx[t]]), b = find(rep[idx[t + 1]]), c = find(rep[idx[t + 2]]);
    parent[b] = a; parent[find(c)] = a; used[rep[idx[t]]] = used[rep[idx[t + 1]]] = used[rep[idx[t + 2]]] = 1;
  }
  const groups = new Map();
  for (let i = 0; i < n; i++) {
    if (rep[i] !== i || !used[i]) continue;
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(i);
  }
  const out = [];
  for (const g of groups.values()) {
    const p = new Float64Array(g.length * 3);
    g.forEach((vi, k) => { p[k * 3] = pos[vi * 3]; p[k * 3 + 1] = pos[vi * 3 + 1]; p[k * 3 + 2] = pos[vi * 3 + 2]; });
    out.push(eigenExtents(p, g.length));
  }
  return out;
}

// ---------------------------------------------------------------- ray down onto triangles
function rayDown(tris, x, z, yFrom) {
  // highest hit at or below yFrom; tris = Float64Array of xyz triples in world space
  let best = null;
  for (let t = 0; t < tris.length; t += 9) {
    const ax = tris[t], az = tris[t + 2], bx = tris[t + 3], bz = tris[t + 5], cx = tris[t + 6], cz = tris[t + 8];
    const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(d) < 1e-12) continue;
    const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d, w = 1 - u - v;
    if (u < -1e-6 || v < -1e-6 || w < -1e-6) continue;
    const y = u * tris[t + 1] + v * tris[t + 4] + w * tris[t + 7];
    if (y <= yFrom + 1e-6 && (best === null || y > best)) best = y;
  }
  return best;
}
function trianglesOf(node, prim) {
  const pos = worldPositions(node, prim), idx = indicesOf(prim), out = new Float64Array(idx.length * 3);
  for (let i = 0; i < idx.length; i++) { out[i * 3] = pos[idx[i] * 3]; out[i * 3 + 1] = pos[idx[i] * 3 + 1]; out[i * 3 + 2] = pos[idx[i] * 3 + 2]; }
  return out;
}

// ---------------------------------------------------------------- one asset
export async function checkAsset(M, L, id, { file } = {}) {
  const a = M.assets[id];
  const errors = [], warnings = [];
  const err = (m) => errors.push(m), warn = (m) => warnings.push(m);
  const f = file ?? a._pub;
  const res = { id, file: f, errors, warnings, bytes: 0, tris: 0, drawCalls: 0, placeholder: false };
  if (!fs.existsSync(f)) { err(`${rel(f)} does not exist`); return res; }
  res.bytes = fs.statSync(f).size;
  const io = await gltfIO();
  let doc;
  try { doc = await io.read(f); } catch (e) { err(`cannot read ${rel(f)}: ${e.message}`); return res; }
  const root = doc.getRoot();
  const nodes = root.listNodes();
  const byName = new Map();
  for (const n of nodes) { if (!byName.has(n.getName())) byName.set(n.getName(), []); byName.get(n.getName()).push(n); }
  for (const [name, list] of byName) if (list.length > 1) err(`node name '${name}' is used ${list.length} times (names are unique)`);
  const joints = new Set(); for (const s of root.listSkins()) for (const j of s.listJoints()) joints.add(j);
  const one = (name) => byName.get(name)?.[0] ?? null;

  // structure
  const used = root.listExtensionsUsed().map((e) => e.extensionName);
  if (used.includes('EXT_mesh_gpu_instancing')) err('the file uses EXT_mesh_gpu_instancing (in-file instancing is not allowed: ARCHITECTURE 7.1)');
  if (root.listTextures().length > 0) err(`the file embeds ${root.listTextures().length} image(s): GLBs ship no textures`);
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  const tops = scene ? scene.listChildren() : [];
  const rootNode = one(id);
  if (tops.length !== 1 || tops[0].getName() !== id) err(`the scene must have exactly one root node named '${id}' (found ${tops.map((n) => n.getName()).join(', ') || 'none'})`);
  if (rootNode) {
    const m = worldMatrix(rootNode), I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    if (m.some((v, i) => Math.abs(v - I[i]) > 1e-5)) err('the root node must be at the origin, unrotated, unscaled');
    res.placeholder = !!rootNode.getExtras().placeholder;
  }

  // meshes
  const meshNodes = nodes.filter((n) => n.getMesh());
  const allowed = new Set(a.materials);
  const primsOf = new Map();                                            // mesh node -> drawn primitives
  for (const n of meshNodes) {
    const isCollider = n.getName() === COLLIDER;
    let count = 0, lit = 0;
    for (const p of n.getMesh().listPrimitives()) {
      if (isCollider) continue;
      count++;
      res.tris += primTris(p);
      const mat = p.getMaterial()?.getName() ?? null;
      if (mat === null) err(`mesh '${n.getName()}' has a primitive without a material`);
      else if (!GAME_MATERIALS.includes(mat)) err(`mesh '${n.getName()}' uses '${mat}', which is not a game material`);
      else if (!allowed.has(mat)) err(`mesh '${n.getName()}' uses ${mat}; the manifest allows ${[...allowed].join(', ')}`);
      if (mat !== 'm_emis') lit++;
      if (!p.getAttribute('COLOR_0')) err(`mesh '${n.getName()}' has no COLOR_0 (vertex colour is the paint: ART_BIBLE 4.5)`);
      if (!p.getAttribute('TEXCOORD_0')) err(`mesh '${n.getName()}' has no TEXCOORD_0`);
    }
    if (!isCollider) primsOf.set(n, { count, lit });
    if (a.instanced && !isCollider && n.getMesh().listPrimitives().length !== 1) err(`instanced asset: mesh '${n.getName()}' must be one primitive (one material)`);
  }
  // Draw calls of ONE instance = one per mesh primitive: nothing is joined at load, so two meshes that share a material
  // are two draw calls. Variant nodes (ARCHITECTURE 7.5) show one at a time: the largest variant counts.
  const variantSet = new Set(a.chunks ? [] : variantNames(a));
  const variantOf = (n) => { for (let p = n; p; p = p.getParentNode()) if (variantSet.has(p.getName())) return p.getName(); return null; };
  let fixed = 0; const perVariant = new Map(), fixedNames = [];
  for (const [n, c] of primsOf) {
    const v = variantOf(n);
    if (v !== null) perVariant.set(v, (perVariant.get(v) ?? 0) + c.count);
    else { fixed += c.count; fixedNames.push(c.count > 1 ? `${n.getName()} x${c.count}` : n.getName()); }
  }
  const worstVariant = [...perVariant.entries()].sort((x, y) => y[1] - x[1])[0] ?? null;
  res.drawCalls = fixed + (worstVariant ? worstVariant[1] : 0);
  if (res.tris > a.triBudget) err(`${res.tris} triangles > triBudget ${a.triBudget}`);
  if (res.drawCalls > a.drawCalls) {
    err(`${res.drawCalls} draw calls > drawCalls ${a.drawCalls}: one per mesh primitive (${fixedNames.join(', ') || 'none'}` +
      (worstVariant ? `; variants show one at a time, the largest is ${worstVariant[0]}` : '') + '). Join static parts into one mesh per material (mesh.join) or rigid-skin moving ones (rig.join_as_rigid_skin)');
  }
  // baked-light extras of a standalone asset (zones: checkZone). The runtime picks x2 vertex light / the lightmap from them.
  if (!a.chunks) {
    const want = bakeExtras(a);
    for (const [n, c] of primsOf) {
      const ex = n.getExtras(), name = n.getName();
      if (c.lit === 0) { if (ex.bake !== 'UNLIT') err(`mesh '${name}' (m_emis) needs the extra bake: UNLIT (has ${JSON.stringify(ex.bake)}; zone.lamp_set and export.export_asset set it)`); continue; }
      if (!want) continue;
      if (!want.includes(ex.bake)) { err(`mesh '${name}' needs the extra bake: ${want.join(' | ')} (the manifest's bake is ${a.bake}; has ${JSON.stringify(ex.bake)}; export.export_asset sets it)`); continue; }
      if (ex.bake === 'LM') {
        if (!(a.lightmaps ?? []).includes(ex.lightmap)) err(`mesh '${name}' is bake LM: its lightmap extra must be one of ${(a.lightmaps ?? []).join(', ') || '(the manifest lists none)'} (has ${JSON.stringify(ex.lightmap)})`);
        if (n.getMesh().listPrimitives().some((p) => !p.getAttribute('TEXCOORD_1'))) err(`mesh '${name}' is bake LM but has no TEXCOORD_1`);
      }
    }
  }
  if (a.instanced && root.listSkins().length) err('instanced asset must not be skinned');

  // names
  const bones = a.bones ?? [], lampSets = a.lampSets ?? {}, nodePos = a.nodePos ?? {};
  for (const b of bones) {
    const n = one(b);
    if (!n) err(`bone '${b}' is missing`);
    else if (!joints.has(n)) err(`'${b}' is listed in bones but is not a joint of a skin${n.getMesh() ? ' (it is a mesh node)' : ''}`);
  }
  for (const name of a.nodes ?? []) {
    if (bones.includes(name)) continue;
    const n = one(name);
    if (!n) { err(`node '${name}' is missing`); continue; }
    const isMesh = !!n.getMesh();
    if (isMesh && !(name in lampSets) && (name in nodePos || HIT_ROLE.test(name))) err(`node '${name}' is a gameplay position: it must be an empty or a bone, not a mesh node`);
  }
  for (const [name, p] of Object.entries(nodePos)) {
    const n = one(name);
    if (!n) continue;
    const m = worldMatrix(n), w = [m[12], m[13], m[14]], d = dist(w, p);
    if (d > NODE_TOL) err(`node '${name}' rests at (${w.map((v) => v.toFixed(3)).join(', ')}); nodePos is (${p.join(', ')}): ${d.toFixed(3)} m off (tolerance ${NODE_TOL})`);
  }
  // a socket rides the bone (or node) the manifest names: code written against a placeholder sees it follow its clip
  for (const [name, parent] of Object.entries(a.nodeParent ?? {})) {
    const n = one(name);
    if (!n) continue;
    const has = n.getParentNode()?.getName() ?? null;
    if (has !== parent) err(`node '${name}' must be a child of '${parent}' (manifest nodeParent); its parent is '${has}' (rig.parent_to_bone)`);
  }
  if (a.skinned) {
    if (!meshNodes.some((n) => n.getSkin())) err('skinned: true but the file contains no skinned mesh');
  }
  for (const n of meshNodes) {
    if (!n.getSkin()) continue;
    for (const p of n.getMesh().listPrimitives()) {
      const w = p.getAttribute('WEIGHTS_0'), j = p.getAttribute('JOINTS_0');
      if (!w || !j) { err(`skinned mesh '${n.getName()}' has no JOINTS_0 / WEIGHTS_0`); continue; }
      let bad = 0; const e = [0, 0, 0, 0];
      for (let i = 0; i < w.getCount(); i++) { w.getElement(i, e); if (e[0] + e[1] + e[2] + e[3] < 0.01) bad++; }
      if (bad) err(`skinned mesh '${n.getName()}': ${bad} vertices have no bone weight`);
    }
  }

  // lamp sets
  for (const [name, count] of Object.entries(lampSets)) {
    const n = one(name);
    if (!n) continue;
    if (!n.getMesh()) { err(`lamp set '${name}' must be a mesh node`); continue; }
    if (n.getExtras().lampCount !== count) err(`lamp set '${name}': lampCount extra is ${n.getExtras().lampCount}, the manifest says ${count}`);
    const seen = new Set();
    for (const p of n.getMesh().listPrimitives()) {
      if (p.getMaterial()?.getName() !== 'm_emis') err(`lamp set '${name}' must use m_emis`);
      const u1 = p.getAttribute('TEXCOORD_1');
      if (!u1) { err(`lamp set '${name}' has no TEXCOORD_1 (lamp index in UV1.x)`); continue; }
      const e = [0, 0];
      for (let i = 0; i < u1.getCount(); i++) {
        u1.getElement(i, e);
        const k = e[0] * count - 0.5;
        if (Math.abs(k - Math.round(k)) > 0.02 || Math.round(k) < 0 || Math.round(k) >= count) { err(`lamp set '${name}': UV1.x ${e[0].toFixed(4)} is not (i + 0.5) / ${count}`); break; }
        seen.add(Math.round(k));
      }
    }
    if (seen.size !== count && n.getMesh().listPrimitives().every((p) => p.getAttribute('TEXCOORD_1'))) err(`lamp set '${name}' holds ${seen.size} lamp indices, the manifest says ${count}`);
  }

  // clips
  const want = new Map((a.animations ?? []).map((c) => [c.name, c]));
  const have = new Map(root.listAnimations().map((an) => [an.getName(), an]));
  for (const name of want.keys()) if (!have.has(name)) err(`clip '${name}' is missing`);
  const driven = new Set(a.codeDriven ?? []);
  for (const [name, an] of have) {
    const c = want.get(name);
    if (!c) { err(`clip '${name}' is not in the manifest (has: ${[...want.keys()].join(', ') || 'none'})`); continue; }
    let end = 0, start = Infinity, loopBad = null, drivenBad = null;
    for (const ch of an.listChannels()) {
      const s = ch.getSampler(), inp = s.getInput(), out = s.getOutput(), n = inp.getCount();
      start = Math.min(start, inp.getScalar(0)); end = Math.max(end, inp.getScalar(n - 1));
      const first = out.getElement(0, []), last = out.getElement(n - 1, []);
      const target = ch.getTargetNode()?.getName(), pathName = ch.getTargetPath();
      const same = (x, y) => (pathName === 'rotation' ? Math.abs(x[0] * y[0] + x[1] * y[1] + x[2] * y[2] + x[3] * y[3]) > 1 - 1e-5 : x.every((v, i) => Math.abs(v - y[i]) < 1e-3));
      if (c.loop && !same(first, last)) loopBad = `${target}.${pathName}`;
      if (driven.has(target)) {
        let moves = false; const e = [];
        for (let i = 1; i < n && !moves; i++) if (!same(first, out.getElement(i, e))) moves = true;
        const node = ch.getTargetNode();
        const rest = pathName === 'rotation' ? node.getRotation() : pathName === 'translation' ? node.getTranslation() : node.getScale();
        if (moves || !same(first, rest)) drivenBad = `${target}.${pathName}`;
      }
    }
    if (an.listChannels().length === 0) { err(`clip '${name}' has no channels`); continue; }
    if (start > 1e-4) err(`clip '${name}' starts at ${start.toFixed(3)} s; clips start at 0`);
    if (Math.abs(end - c.seconds) > 1 / FPS + 1e-3) err(`clip '${name}' lasts ${end.toFixed(3)} s; the manifest says ${c.seconds} s (more than one frame off)`);
    if (loopBad) err(`clip '${name}' is a loop but its first and last keys differ (${loopBad})`);
    if (drivenBad) err(`clip '${name}' animates the code-driven node ${drivenBad}`);
  }
  if (a.instanced && have.size) err('instanced asset must not have clips');

  // thin geometry
  for (const n of meshNodes) {
    if (n.getName() === COLLIDER) continue;
    const ok = n.getExtras().thin_ok;
    for (const p of n.getMesh().listPrimitives()) {
      const isl = islands(worldPositions(n, p), indicesOf(p));
      let bad = 0, first = null;
      for (const it of isl) {
        const [l, w, t] = it.ext;
        if (l > 0.5 && w < 0.03 && t < 0.03) {
          if (typeof ok === 'number' && w >= 0.002 * ok - 1e-6) continue;
          bad++; if (!first) first = it;
        }
      }
      if (bad) err(`mesh '${n.getName()}': ${bad} thin part(s) (e.g. ${first.ext[0].toFixed(2)} m long, ${(first.ext[1] * 1000).toFixed(0)} x ${(first.ext[2] * 1000).toFixed(0)} mm, at ${first.centre.map((v) => v.toFixed(2)).join(', ')})` +
        (typeof ok === 'number' ? `; thin_ok ${ok} m needs ${(2 * ok).toFixed(0)} mm` : '; fatten it, make it an alpha card, or set the extra thin_ok: <farthest viewing distance in metres> (2 mm per metre)'));
    }
  }

  // zones
  if (a.chunks) checkZone(M, L, a, id, { nodes, meshNodes, one, err, warn, placeholder: res.placeholder });
  else {
    for (const n of nodes) if (DRESS.test(n.getName())) err(`dressing empty '${n.getName()}' belongs in a zone GLB`);
  }
  return res;
}

function checkZone(M, L, a, id, { nodes, meshNodes, one, err, placeholder }) {
  const plan = new Map();
  for (const c of a.chunks) for (const m of c.materials) plan.set(`${c.id}__${m}`, c);
  const drawn = new Set(a.drawnNodes ?? []);
  const segs = navSegments(L, a.zone);
  const lightmaps = new Set([...(a.lightmaps ?? [])]), layers = new Set(a.lightLayers ?? []);
  const seen = new Set();
  for (const n of meshNodes) {
    const name = n.getName();
    if (name === COLLIDER) continue;
    const c = plan.get(name);
    if (!c && !drawn.has(name)) { err(`mesh '${name}' is not in the chunk plan (expected <chunk>__<material> of ${a.chunks.map((x) => x.id).join(', ')} or a drawn node)`); continue; }
    const ex = n.getExtras();
    if (!['LM', 'VL', 'AO', 'UNLIT'].includes(ex.bake)) err(`mesh '${name}' needs the extra bake: LM | VL | AO | UNLIT (has ${JSON.stringify(ex.bake)})`);
    if (ex.lightmap !== undefined && !lightmaps.has(ex.lightmap)) err(`mesh '${name}': lightmap '${ex.lightmap}' is not one of ${[...lightmaps].join(', ')}`);
    if (ex.lightLayer !== undefined && !layers.has(ex.lightLayer)) err(`mesh '${name}': lightLayer '${ex.lightLayer}' is not one of ${[...layers].join(', ') || 'none'}`);
    if (c) {
      seen.add(name);
      const mat = name.split('__')[1];
      for (const p of n.getMesh().listPrimitives()) {
        if (p.getMaterial()?.getName() !== mat) err(`mesh '${name}' must use ${mat}, uses ${p.getMaterial()?.getName()}`);
        const pos = worldPositions(n, p);
        let out = 0, low = 0, worst = 0;
        for (let i = 0; i < pos.length; i += 3) {
          for (let k = 0; k < 3; k++) {
            const d = Math.max(c.box.min[k] - pos[i + k], pos[i + k] - c.box.max[k]);
            if (d > BOX_TOL) { out++; worst = Math.max(worst, d); break; }
          }
          if (c.part === 'high' && !c.solids && segs.length) {
            const g = nearestOnPath(segs, pos[i], pos[i + 2]);
            if (pos[i + 1] < g.y + 3 - 0.05) low++;
          }
        }
        if (out) err(`chunk mesh '${name}': ${out} vertices lie outside the chunk's box (up to ${worst.toFixed(2)} m): art may not undo a visibility rule`);
        if (low) err(`skyline chunk mesh '${name}': ${low} vertices are less than 3 m above the path's ground`);
        // lightmap UVs
        if (ex.bake === 'LM') {
          const u1 = p.getAttribute('TEXCOORD_1');
          if (!u1) err(`mesh '${name}' is bake LM but has no TEXCOORD_1`);
          else if (!ex.lightmap) err(`mesh '${name}' is bake LM but has no lightmap extra`);
          else {
            const t = M.textures[ex.lightmap], nt = t?.neutralTexel;
            if (nt) {
              const bx = (nt.px[0] + nt.px[2] + 2) / t.size[0], by = (nt.px[1] + nt.px[3] + 2) / t.size[1];
              let off = 0; const e = [0, 0];
              for (let i = 0; i < u1.getCount(); i++) {
                u1.getElement(i, e);
                if (e[0] < bx && e[1] < by && (Math.abs(e[0] - nt.uv[0]) > 2e-4 || Math.abs(e[1] - nt.uv[1]) > 2e-4)) off++;
              }
              if (off) err(`mesh '${name}': ${off} vertices have UV1 inside the neutral block of ${ex.lightmap} but not on its centre (vertex-lit vertices sit exactly on the neutral texel; lightmapped islands keep out of it)`);
            }
          }
        }
      }
    }
  }
  for (const name of plan.keys()) if (!seen.has(name)) err(`planned mesh '${name}' is missing (the zone ships exactly its chunk plan)`);

  // dressing
  const zone = M.zones[a.zone], allow = zone?.dressing;
  const dress = nodes.filter((n) => DRESS.test(n.getName()));
  if (dress.length) {
    let tris = 0; const sets = new Set();
    for (const n of dress) {
      const ex = n.getExtras(), d = M.assets[ex.asset];
      if (!d) { err(`${n.getName()}: extras.asset '${ex.asset}' is not a manifest asset`); continue; }
      if (!allow || !allow.assets.includes(ex.asset)) err(`${n.getName()}: ${ex.asset} is not in the dressing allowance of zone ${a.zone} (${allow?.assets.join(', ') || 'none'})`);
      if (ex.node !== undefined && !(d.nodes ?? []).includes(ex.node)) err(`${n.getName()}: ${ex.asset} has no node '${ex.node}'`);
      const variants = (d.nodes ?? []).length || 1;
      tris += ex.node ? Math.ceil(d.triBudget / variants) : d.triBudget;
      sets.add(`${ex.asset}/${ex.node ?? ''}`);
      const m = worldMatrix(n), p = [m[12], m[13], m[14]];
      const h = d.placeholder.size[1], r = Math.max(d.placeholder.size[0], d.placeholder.size[2]) / 2;
      if (h > 0.35 && d.placeholder.anchor !== 'top' && segs.length) {
        const g = nearestOnPath(segs, p[0], p[2]);
        if (g.d < 0.45 + r && Math.abs(g.y - p[1]) < 1.0) err(`${n.getName()} (${ex.asset}, ${h} m tall) stands on a nav link (${g.d.toFixed(2)} m from the path): nothing taller than 0.35 m there`);
      }
    }
    if (allow) {
      if (tris > allow.tris) err(`dressing: ${tris} triangles > the zone's allowance ${allow.tris}`);
      if (sets.size > allow.drawCalls) err(`dressing: ${sets.size} instanced sets (draw calls) > the zone's allowance ${allow.drawCalls}`);
    }
  }

  // collider_terrain
  if ((a.nodes ?? []).includes(COLLIDER)) {
    const n = one(COLLIDER);
    if (n && n.getMesh()) {
      const parts = n.getMesh().listPrimitives().map((p) => trianglesOf(n, p));
      const tris = new Float64Array(parts.reduce((s, x) => s + x.length, 0));
      let o = 0; for (const x of parts) { tris.set(x, o); o += x.length; }
      // An open sheet cannot be checked or repaired at load (src/core/collision.ts ignores back faces): a triangle wound
      // downward lets a body fall through. Final art only: the placeholder is the closed terrain solids and is not used.
      if (!placeholder) {
        let down = 0, first = null;
        for (let i = 0; i < tris.length; i += 9) {
          const ux = tris[i + 3] - tris[i], uy = tris[i + 4] - tris[i + 1], uz = tris[i + 5] - tris[i + 2];
          const vx = tris[i + 6] - tris[i], vy = tris[i + 7] - tris[i + 1], vz = tris[i + 8] - tris[i + 2];
          const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, len = Math.hypot(nx, ny, nz);
          if (len > 1e-12 && ny / len < -1e-3) { down++; first ??= `(${tris[i].toFixed(2)}, ${tris[i + 1].toFixed(2)}, ${tris[i + 2].toFixed(2)})`; }
        }
        if (down) err(`collider_terrain: ${down} triangle(s) face down, e.g. at ${first}: it is an open sheet and must be wound counter-clockwise seen from above (normal.y >= 0), or bodies fall through`);
      }
      const world = new World(L.solids.filter((s) => s.zone === a.zone && !s.dynamic));
      const onTerrain = (p) => { const g = world.ground(p[0], p[2], p[1], 0.5, 1.2); return g && g.solid.role === 'terrain'; };
      let off = 0, firstOff = null;
      for (const nd of L.nav.nodes) {
        if (nd.zone !== a.zone || !onTerrain(nd.pos)) continue;
        const y = rayDown(tris, nd.pos[0], nd.pos[2], nd.pos[1] + 1.0);
        if (y === null || Math.abs(y - nd.pos[1]) > 0.3) { off++; firstOff ??= `${nd.id} (collider ${y === null ? 'missing' : y.toFixed(2)}, node ${nd.pos[1]})`; }
      }
      if (off) err(`collider_terrain is more than 0.3 m off the ground of ${off} nav node(s), e.g. ${firstOff}`);
      let steps = 0, firstStep = null;
      for (const [sa, sb] of navSegments(L, a.zone)) {
        const len = Math.hypot(sb[0] - sa[0], sb[2] - sa[2]), k = Math.max(1, Math.ceil(len / 0.2));
        let prev = null;
        for (let i = 0; i <= k; i++) {
          const t = i / k, p = [sa[0] + (sb[0] - sa[0]) * t, sa[1] + (sb[1] - sa[1]) * t, sa[2] + (sb[2] - sa[2]) * t];
          if (!onTerrain(p)) { prev = null; continue; }
          const y = rayDown(tris, p[0], p[2], p[1] + 1.0);
          if (y !== null && prev !== null && Math.abs(y - prev) > 0.35) { steps++; firstStep ??= `near (${p[0].toFixed(1)}, ${p[2].toFixed(1)}): ${Math.abs(y - prev).toFixed(2)} m`; }
          prev = y;
        }
      }
      if (steps) err(`collider_terrain leaves ${steps} step(s) over 0.35 m on nav links, e.g. ${firstStep}`);
    } else if (n) err('collider_terrain must be a mesh node');
  }
}

// ---------------------------------------------------------------- textures
export async function checkTexture(M, id, { file } = {}) {
  const t = M.textures[id];
  const errors = [], f = file ?? t._pub;
  const res = { id, file: f, errors, warnings: [], bytes: 0 };
  if (!fs.existsSync(f)) { errors.push(`${rel(f)} does not exist`); return res; }
  res.bytes = fs.statSync(f).size;
  let meta, raw;
  try {
    meta = await sharp(f).metadata();
    raw = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  } catch (e) { errors.push(`cannot decode ${rel(f)}: ${e.message}`); return res; }
  if (meta.width !== t.size[0] || meta.height !== t.size[1]) errors.push(`${meta.width} x ${meta.height}; the manifest says ${t.size[0]} x ${t.size[1]}`);
  const d = raw.data, w = raw.info.width;
  if (t.format === 'r8') {
    let colour = 0;
    for (let i = 0; i < d.length; i += 4 * 97) if (Math.abs(d[i] - d[i + 1]) > 2 || Math.abs(d[i] - d[i + 2]) > 2) colour++;
    if (colour) errors.push('format r8 but the image is not greyscale');
  }
  const nt = t.neutralTexel;
  if (nt) {
    const [x0, y0, bw, bh] = nt.px, want = nt.value >= 0.5 ? 255 : 0;
    let bad = 0;
    for (let y = y0; y < y0 + bh; y++) for (let x = x0; x < x0 + bw; x++) {
      const i = (y * w + x) * 4;
      for (let k = 0; k < (t.format === 'r8' ? 1 : 3); k++) if (Math.abs(d[i + k] - want) > 3) bad++;
    }
    if (bad) errors.push(`the neutral texel (${bw} x ${bh} block at the top-left) is not painted ${want === 255 ? 'white' : 'black'} (bake.save_lightmap paints it)`);
  }
  return res;
}

async function main() {
  const argv = process.argv.slice(2);
  const M = loadManifest(overlayArg(argv)), L = loadLayout();
  const quiet = argv.includes('--quiet');
  const names = argv.filter((x) => !x.startsWith('--'));
  const sel = argv.includes('--all') || names.length === 0 ? allIds(M, false) : select(M, names);
  let failed = 0, total = 0;
  for (const id of sel.textures) {
    const r = await checkTexture(M, id); total += r.bytes;
    if (r.errors.length) { failed++; console.log(`FAIL ${id}`); for (const e of r.errors) console.log(`       - ${e}`); }
    else if (!quiet) console.log(`ok   ${id.padEnd(24)} ${M.textures[id].size.join('x').padEnd(10)} ${M.textures[id].format.padEnd(6)} ${fmtBytes(r.bytes).padStart(10)}`);
  }
  for (const id of sel.assets) {
    const r = await checkAsset(M, L, id); total += r.bytes;
    const a = M.assets[id];
    const line = `${id.padEnd(24)} tris ${String(r.tris).padStart(6)}/${String(a.triBudget).padEnd(6)} dc ${String(r.drawCalls).padStart(2)}/${String(a.drawCalls).padEnd(2)} ${fmtBytes(r.bytes).padStart(10)}${r.placeholder ? '  placeholder' : ''}`;
    if (r.errors.length) { failed++; console.log(`FAIL ${line}`); for (const e of r.errors) console.log(`       - ${e}`); }
    else if (!quiet) console.log(`ok   ${line}`);
    for (const w of r.warnings) console.log(`       ! ${w}`);
  }
  console.log(`${sel.assets.length} assets, ${sel.textures.length} textures, ${fmtBytes(total)}: ${failed ? failed + ' FAILED' : 'all pass'}`);
  if (failed) process.exit(1);
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
