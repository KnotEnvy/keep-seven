// art-props-mech: every shipped props_mech file passes check-glb, and no P0 asset or clip is a placeholder.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { node, M, MECH, P0 } from './glb.mjs';

test('check-glb passes on every props_mech asset (triangles, draw calls, names, nodePos, clips, lamp sets, thin parts)', () => {
  const r = node('tools/check-glb.mjs', MECH);
  console.log(r.out.trim());
  assert.equal(r.code, 0, r.out);
});

test('asset-status --require=0 --owner props_mech: no P0 placeholder', () => {
  const r = node('tools/asset-status.mjs', ['--require=0', '--owner', 'props_mech']);
  console.log(r.out.split('\n').slice(0, 3).join('\n'));
  assert.equal(r.code, 0, r.out);
});

test('download share: the props_mech files total at most 0.5 MB', () => {
  let bytes = 0;
  for (const id of MECH) bytes += fs.statSync(M.assets[id]._pub).size;
  console.log(`props_mech: ${MECH.length} files, ${(bytes / 1024).toFixed(1)} kB`);
  assert.ok(bytes <= 0.5 * 1024 * 1024, `${bytes} bytes`);
});

test('the three shared textures still pass check-glb (append-only tables)', () => {
  const r = node('tools/check-glb.mjs', ['tx_mask', 'tx_palette', 'tx_palette_emis']);
  assert.equal(r.code, 0, r.out);
});
