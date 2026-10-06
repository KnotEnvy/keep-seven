// art-enemies-bider: check-glb on the four Bider ids, the download share, and the Bider rows of asset-status.
import test from 'node:test';
import assert from 'node:assert/strict';
import { IDS, tool, fs, path, ROOT, manifest } from './bider_lib.mjs';

test('bider: check-glb passes on enemy_bider and the three statics (bones, nodes, 18 clips, loops, budgets, 1 draw call)', () => {
  const r = tool('check-glb.mjs', IDS);
  console.log('  ' + r.out.trim().split('\n').join('\n  '));
  assert.equal(r.status, 0, r.out);
});

test('bider: the four shipped files fit the half-share of the enemies download (0.55 MB)', () => {
  const M = manifest(); let total = 0; const parts = [];
  for (const id of IDS) {
    const b = fs.statSync(path.join(ROOT, 'public', M.assets[id].path)).size; total += b; parts.push(`${id} ${(b / 1024).toFixed(1)} kB`);
  }
  console.log(`  ${parts.join(', ')}; total ${(total / 1024).toFixed(1)} kB`);
  assert.ok(total <= 0.55 * 1024 * 1024, `${total} bytes`);
});

test('bider: asset-status --require=0 --owner enemies exits 0 and the art-enemies-bider row has nothing open', () => {
  const r = tool('asset-status.mjs', ['--owner', 'enemies', '--require=0']);
  const row = r.out.split('\n').find((l) => l.startsWith('art-enemies-bider'));
  console.log('  ' + row);
  assert.ok(row, r.out);
  const [p0, p1, p2, clips] = row.trim().split(/\s+/).slice(2, 6);
  assert.equal(p0.split('/')[0], '0', `P0 open: ${row}`); assert.equal(clips.split('/')[0], '0', `clips open: ${row}`);
  assert.equal(r.status, 0, r.out);
});
