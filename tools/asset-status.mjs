// node tools/asset-status.mjs [--require=<0|1|2>] [--owner <piece|owner|order>] [--manifest overlay.json] [--json]
//
// What is still a placeholder, by PIECE (the builder: pipeline-lib `pieceOf`; --owner art-boss-tamper lists exactly that
// builder's rows, --owner boss both halves of the order) and by priority (ARCHITECTURE 1.1, 7.3): assets (root extra `placeholder`),
// clips (a placeholder asset's clips are all placeholders; a P2 clip of a final asset that equals its `fallback` clip is
// reported as "fallback copy", which is an accepted result) and textures.
// --require=N exits 1 while any asset or clip of priority <= N is a placeholder (critics run --require=0).
import fs from 'node:fs';
import { loadManifest, overlayArg, select, gltfIO, glbIsPlaceholder, webpIsPlaceholder, pieceOf } from './pipeline-lib.mjs';

const argv = process.argv.slice(2);
const M = loadManifest(overlayArg(argv));
const reqArg = argv.find((x) => x.startsWith('--require'));
const require_ = reqArg ? Number(reqArg.includes('=') ? reqArg.split('=')[1] : argv[argv.indexOf(reqArg) + 1]) : null;
const oi = argv.indexOf('--owner');
const ownerSel = oi >= 0 ? select(M, [argv[oi + 1]]) : null;
const asJson = argv.includes('--json');

async function clipEquals(file, a, b) {
  // same channels and the same sampled values: the P2 clip is a copy of its fallback
  const io = await gltfIO();
  const doc = await io.read(file);
  const anims = new Map(doc.getRoot().listAnimations().map((x) => [x.getName(), x]));
  const A = anims.get(a), B = anims.get(b);
  if (!A || !B) return false;
  const sig = (an) => an.listChannels().map((ch) => {
    const out = ch.getSampler().getOutput(), n = out.getCount(), e = [];
    let h = 0;
    for (let i = 0; i < n; i++) { out.getElement(i, e); for (const v of e) h = (h * 31 + Math.round(v * 1e4)) | 0; }
    return `${ch.getTargetNode()?.getName()}.${ch.getTargetPath()}:${n}:${h}`;
  }).sort().join('|');
  return sig(A) === sig(B);
}

const rows = [];
for (const [id, a] of Object.entries(M.assets)) {
  if (a._fixture) continue;
  if (ownerSel && !ownerSel.assets.includes(id)) continue;
  const ph = glbIsPlaceholder(a._pub, id);
  const state = ph === null ? 'missing' : ph ? 'placeholder' : 'final';
  rows.push({ kind: 'asset', id, owner: a.owner, piece: pieceOf(M, id), priority: a.priority, state });
  for (const c of a.animations ?? []) {
    let cs = state === 'final' ? 'final' : state;
    if (state === 'final' && c.fallback && await clipEquals(a._pub, c.name, c.fallback)) cs = 'fallback copy';
    rows.push({ kind: 'clip', id: `${id}/${c.name}`, owner: a.owner, piece: pieceOf(M, id), priority: c.priority ?? a.priority, state: cs });
  }
}
for (const [id, t] of Object.entries(M.textures)) {
  if (t._fixture) continue;
  if (ownerSel && !ownerSel.textures.includes(id)) continue;
  const ph = webpIsPlaceholder(t._pub);
  rows.push({ kind: 'texture', id, owner: t.owner, piece: pieceOf(M, id), priority: null, state: ph === null ? 'missing' : ph ? 'placeholder' : 'final' });
}

const open = (r) => r.state === 'placeholder' || r.state === 'missing';
const summary = {
  assets: rows.filter((r) => r.kind === 'asset').length, placeholderAssets: rows.filter((r) => r.kind === 'asset' && r.state === 'placeholder').length,
  missingAssets: rows.filter((r) => r.kind === 'asset' && r.state === 'missing').length,
  clips: rows.filter((r) => r.kind === 'clip').length, placeholderClips: rows.filter((r) => r.kind === 'clip' && open(r)).length,
  fallbackClips: rows.filter((r) => r.state === 'fallback copy').length,
  textures: rows.filter((r) => r.kind === 'texture').length, placeholderTextures: rows.filter((r) => r.kind === 'texture' && r.state === 'placeholder').length,
  missingTextures: rows.filter((r) => r.kind === 'texture' && r.state === 'missing').length,
};
let blocking = [];
if (require_ !== null) blocking = rows.filter((r) => r.kind !== 'texture' && r.priority !== null && r.priority <= require_ && open(r));

if (asJson) console.log(JSON.stringify({ summary, rows, blocking: blocking.map((r) => r.id) }, null, 1));
else {
  const owners = [...new Set(rows.map((r) => r.piece))];               // one row per piece (builder)
  console.log('piece                manifest owner           P0 open/all   P1 open/all   P2 open/all   clips open/all   textures open/all');
  for (const o of owners) {
    const mine = rows.filter((r) => r.piece === o);
    const cell = (p) => { const x = mine.filter((r) => r.kind === 'asset' && r.priority === p); return `${x.filter(open).length}/${x.length}`.padEnd(14); };
    const clips = mine.filter((r) => r.kind === 'clip'), tex = mine.filter((r) => r.kind === 'texture');
    console.log(`${o.padEnd(20)} ${[...new Set(mine.map((r) => r.owner))].join(',').padEnd(24)} ${cell(0)}${cell(1)}${cell(2)}${`${clips.filter(open).length}/${clips.length}`.padEnd(17)}${tex.filter(open).length}/${tex.length}`);
  }
  for (const p of [0, 1, 2]) {
    const list = rows.filter((r) => r.priority === p && open(r));
    if (!list.length) { console.log(`\nP${p}: nothing open`); continue; }
    console.log(`\nP${p} still placeholder (${list.length}):`);
    for (const o of owners) {
      const l = list.filter((r) => r.piece === o);
      if (!l.length) continue;
      const assets = l.filter((r) => r.kind === 'asset').map((r) => r.id + (r.state === 'missing' ? ' (MISSING)' : ''));
      const clips = l.filter((r) => r.kind === 'clip').map((r) => r.id);
      console.log(`  ${o}: ${assets.join(', ') || '-'}${clips.length ? `\n    clips: ${clips.join(', ')}` : ''}`);
    }
  }
  const fb = rows.filter((r) => r.state === 'fallback copy');
  if (fb.length) console.log(`\nfallback copies (accepted): ${fb.map((r) => r.id).join(', ')}`);
  const tx = rows.filter((r) => r.kind === 'texture' && open(r));
  console.log(`\ntextures still placeholder (${tx.length}): ${tx.map((r) => r.id + (r.state === 'missing' ? ' (MISSING)' : '')).join(', ') || '-'}`);
  console.log(`\n${summary.placeholderAssets} placeholder assets of ${summary.assets}${summary.missingAssets ? ` (${summary.missingAssets} missing)` : ''}; ` +
    `${summary.placeholderClips} placeholder clips of ${summary.clips} (${summary.fallbackClips} fallback copies); ${summary.placeholderTextures} placeholder textures of ${summary.textures}`);
}
if (blocking.length) {
  if (!asJson) console.log(`\n--require=${require_}: ${blocking.length} item(s) of priority <= ${require_} are still placeholders`);
  process.exit(1);
}
