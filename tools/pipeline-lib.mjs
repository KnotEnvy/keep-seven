// Shared helpers of the asset tools (build-assets, optimize-assets, check-glb, asset-status, preview-asset).
// Paths, the manifest (with the optional fixture overlay), id selection, placeholder flags, hashing.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const rel = (p) => path.relative(ROOT, p);
export const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

/** Manifest owner -> work ORDER (docs/workorders/<order>.md). Three orders are built by two pieces each: see `pieceOf`. */
export const PIECES = {
  env_exterior: 'art-env-exterior', env_interior: 'art-env-interior', props_mech: 'art-props', props_dress: 'art-props',
  weapons: 'art-weapons', enemies: 'art-enemies', boss: 'art-boss', render: 'code-render', fixtures: 'foundation-pipeline',
};
/** Every piece (builder) that owns assets or textures: the names of the shots/<piece>/ folders (work-order README 1.1). */
export const PIECE_NAMES = ['art-env-exterior', 'art-env-interior', 'art-props-mech', 'art-props-dress', 'art-weapons',
  'art-enemies-bider', 'art-enemies-transit', 'art-boss-windlass', 'art-boss-tamper', 'code-render', 'foundation-pipeline'];
/**
 * The PIECE that answers for an asset or texture id, i.e. whose shots/<piece>/ folder its evidence belongs in
 * (docs/workorders/README.md 1.1: three orders are split between two builders, by file):
 *   props_mech -> art-props-mech; props_dress -> art-props-dress, except the three shared textures the manifest lists
 *   under props_dress (tx_mask, tx_palette, tx_palette_emis), whose scripts are art-props-mech's;
 *   enemies -> art-enemies-bider for enemy_bider and the bider_* statics, art-enemies-transit for the rest;
 *   boss -> art-boss-tamper for enemy_tamper and tamper_cold_static, art-boss-windlass for the rest.
 * Fixtures and unknown owners: foundation-pipeline.
 */
export function pieceOf(M, id) {
  const e = M.assets[id] ?? M.textures[id];
  if (!e) return null;
  switch (e.owner) {
    case 'props_mech': return 'art-props-mech';
    case 'props_dress': return M.textures[id] && !M.assets[id] ? 'art-props-mech' : 'art-props-dress';
    case 'enemies': return /(^|_)bider(_|$)/.test(id) ? 'art-enemies-bider' : 'art-enemies-transit';
    case 'boss': return /(^|_)tamper(_|$)/.test(id) ? 'art-boss-tamper' : 'art-boss-windlass';
    default: return PIECES[e.owner] ?? 'foundation-pipeline';
  }
}
export const GAME_MATERIALS = ['m_frontier', 'm_pellam', 'm_sand', 'm_flat', 'm_mask', 'm_emis', 'm_prop', 'm_gun'];
export const FPS = 30;

/** Pull `--manifest <file>` (or KS_MANIFEST_OVERLAY) out of argv. Returns the overlay path or null. */
export function overlayArg(argv) {
  const i = argv.indexOf('--manifest');
  if (i >= 0) { const p = path.resolve(argv[i + 1]); argv.splice(i, 2); return p; }
  return process.env.KS_MANIFEST_OVERLAY ? path.resolve(process.env.KS_MANIFEST_OVERLAY) : null;
}

/**
 * design/assets.json, plus the entries of an overlay manifest (the pipeline fixtures). Every asset and texture entry
 * gains `_raw` (absolute raw export path), `_pub` (absolute shipped path) and `_id`.
 */
export function loadManifest(overlay = null) {
  const M = readJson(path.join(ROOT, 'design/assets.json'));
  const base = { rawExportDir: M.meta.rawExportDir, publicDir: M.meta.publicDir };
  const tag = (kind, id, e, dirs) => {
    e._id = id; e._kind = kind;
    if (kind === 'asset') { e._raw = path.join(ROOT, dirs.rawExportDir, e.category, id + '.glb'); }
    else { e._raw = path.join(ROOT, dirs.rawExportDir, e.kind === 'lightmap' || e.kind === 'lightlayer' ? 'lm' : 'tex', id + '.png'); }
    e._pub = path.join(ROOT, dirs.publicDir, e.path);
  };
  for (const [id, e] of Object.entries(M.assets)) tag('asset', id, e, base);
  for (const [id, e] of Object.entries(M.textures)) tag('texture', id, e, base);
  M._overlay = overlay;
  if (overlay) {
    const O = readJson(overlay);
    const dirs = { rawExportDir: O.meta?.rawExportDir ?? base.rawExportDir, publicDir: O.meta?.publicDir ?? base.publicDir };
    for (const [id, e] of Object.entries(O.assets ?? {})) { e._fixture = true; tag('asset', id, e, dirs); M.assets[id] = e; }
    for (const [id, e] of Object.entries(O.textures ?? {})) { e._fixture = true; tag('texture', id, e, dirs); M.textures[id] = e; }
    for (const [id, z] of Object.entries(O.zones ?? {})) M.zones[id] = z;
  }
  return M;
}
export const loadLayout = () => readJson(path.join(ROOT, 'design/layout.json'));

/**
 * Resolve ids / piece names / owners / order names to { assets: [ids], textures: [ids] }. Unknown names throw.
 * A PIECE name (art-boss-tamper, art-props-mech ...: `pieceOf`) selects exactly that builder's ids, textures included,
 * which is the safe way to build "everything of mine". A manifest OWNER (boss, props_dress) or a split ORDER name
 * (art-boss, art-props, art-enemies) selects both builders' halves: for the integrator.
 */
export function select(M, names) {
  const assets = new Set(), textures = new Set();
  const orderOwners = (order) => Object.entries(PIECES).filter(([, p]) => p === order).map(([o]) => o);
  for (const n of names) {
    if (M.assets[n]) { assets.add(n); continue; }
    if (M.textures[n]) { textures.add(n); continue; }
    if (PIECE_NAMES.includes(n) && !M.meta.owners.includes(n)) {
      for (const id of Object.keys(M.assets)) if (pieceOf(M, id) === n && (n !== 'foundation-pipeline' || M.assets[id]._fixture)) assets.add(id);
      for (const id of Object.keys(M.textures)) if (pieceOf(M, id) === n && (n !== 'foundation-pipeline' || M.textures[id]._fixture)) textures.add(id);
      continue;
    }
    let owners = [];
    if (M.meta.owners.includes(n) || n === 'fixtures') owners = [n];
    else if (orderOwners(n).length) owners = orderOwners(n);
    else throw new Error(`"${n}" is not an asset id, a texture id, a piece (${PIECE_NAMES.join(', ')}), a manifest owner (${M.meta.owners.join(', ')}) or a split order (art-props, art-enemies, art-boss)`);
    for (const [id, a] of Object.entries(M.assets)) if (owners.includes(a.owner)) assets.add(id);
    for (const [id, t] of Object.entries(M.textures)) if (owners.includes(t.owner)) textures.add(id);
  }
  return { assets: [...assets], textures: [...textures] };
}
export const allIds = (M, fixtures = false) => ({
  assets: Object.keys(M.assets).filter((id) => fixtures || !M.assets[id]._fixture),
  textures: Object.keys(M.textures).filter((id) => fixtures || !M.textures[id]._fixture),
});

// ---------------------------------------------------------------- placeholder flags
/** JSON chunk of a GLB (no decoding of buffers). */
export function glbJson(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const head = Buffer.alloc(20); fs.readSync(fd, head, 0, 20, 0);
    if (head.toString('latin1', 0, 4) !== 'glTF') throw new Error(`${rel(file)} is not a GLB`);
    const n = head.readUInt32LE(12);
    const body = Buffer.alloc(n); fs.readSync(fd, body, 0, n, 20);
    return JSON.parse(body.toString('utf8'));
  } finally { fs.closeSync(fd); }
}
/** true / false from the root node's `placeholder` extra; null when the file does not exist. */
export function glbIsPlaceholder(file, id) {
  if (!fs.existsSync(file)) return null;
  const js = glbJson(file);
  const root = (js.nodes ?? []).find((n) => n.name === id);
  return !!root?.extras?.placeholder;
}
/** PNG tEXt chunks as an object. */
export function pngText(file) {
  const d = fs.readFileSync(file); const out = {};
  let p = 8;
  while (p < d.length) {
    const n = d.readUInt32BE(p), tag = d.toString('latin1', p + 4, p + 8);
    if (tag === 'tEXt') { const body = d.subarray(p + 8, p + 8 + n); const z = body.indexOf(0); out[body.toString('latin1', 0, z)] = body.toString('latin1', z + 1); }
    if (tag === 'IDAT' || tag === 'IEND') break;
    p += 12 + n;
  }
  return out;
}
export function pngIsPlaceholder(file) { return fs.existsSync(file) ? pngText(file).placeholder === '1' : null; }
/** A shipped WebP is a placeholder when its EXIF ImageDescription says so (optimize-assets writes it). */
export function webpIsPlaceholder(file) {
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file).includes(Buffer.from('ks-placeholder'));
}

// ---------------------------------------------------------------- hashing (staleness)
export function hashFiles(files) {
  const h = crypto.createHash('sha1');
  for (const f of [...files].sort()) { h.update(rel(f)); h.update(fs.existsSync(f) ? fs.readFileSync(f) : 'missing'); }
  return h.digest('hex');
}
export const TEXTURE_TABLES = ['palette', 'tx_frontier_trim', 'tx_pellam_trim', 'mask_regions'];
const canon = (v) => (Array.isArray(v) ? `[${v.map(canon).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',')}}` : JSON.stringify(v));
/**
 * Hash of the texture-table ENTRIES an asset read: `used` = { table: [entry names] | ['*'] } from its <raw>.deps.json
 * (lib.manifest.tables_used). Whitespace, key order and entries it never read do not count, so an appended palette
 * cell or mask region makes nothing stale. `used` null (no record yet) = every table, whole.
 */
export function tableEntriesHash(libDir, used) {
  const out = [];
  for (const name of used ? Object.keys(used).sort() : TEXTURE_TABLES) {
    const f = path.join(libDir, name + '.json');
    if (!fs.existsSync(f)) { out.push(name + ':missing'); continue; }
    let t; try { t = readJson(f); } catch { out.push(name + ':' + crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex')); continue; }
    const entries = used?.[name] ?? ['*'];
    if (entries.includes('*')) { out.push(name + ':' + canon(t)); continue; }
    const bag = t.cells ?? t.regions ?? {};
    const head = Object.fromEntries(Object.entries(t).filter(([k]) => k !== 'cells' && k !== 'regions'));
    out.push(name + ':' + canon(head) + entries.map((e) => e + '=' + canon(bag[e] ?? null)).join(';'));
  }
  return crypto.createHash('sha1').update(out.join('|')).digest('hex');
}
export function listFiles(dir, filter = () => true) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '__pycache__') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p, filter));
    else if (filter(p)) out.push(p);
  }
  return out;
}
export function writeFileAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp${process.pid}`;
  fs.writeFileSync(tmp, data); fs.renameSync(tmp, file);
}

// ---------------------------------------------------------------- glTF-transform IO
let _io = null;
export async function gltfIO() {
  if (_io) return _io;
  const { NodeIO } = await import('@gltf-transform/core');
  const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
  const { MeshoptEncoder, MeshoptDecoder } = await import('meshoptimizer');
  await MeshoptEncoder.ready; await MeshoptDecoder.ready;
  _io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
  _io._encoder = MeshoptEncoder;
  return _io;
}

// ---------------------------------------------------------------- small maths
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export function mat4FromTRS(t, r, s) {
  const [x, y, z, w] = r, x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
  return [(1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0, (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0, t[0], t[1], t[2], 1];
}
export function mat4Mul(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return o;
}
export const mat4Point = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
/** World matrix of a glTF-transform Node in its rest pose. */
export function worldMatrix(node) {
  let m = mat4FromTRS(node.getTranslation(), node.getRotation(), node.getScale());
  for (let p = node.getParentNode(); p; p = p.getParentNode()) m = mat4Mul(mat4FromTRS(p.getTranslation(), p.getRotation(), p.getScale()), m);
  return m;
}
export const fmtBytes = (n) => (n >= 1048576 ? (n / 1048576).toFixed(2) + ' MB' : (n / 1024).toFixed(1) + ' kB');
