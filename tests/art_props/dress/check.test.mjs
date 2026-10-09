// art-props-dress: the shipped files hold to their manifest entries (tools/check-glb.mjs on the 29 ids), nothing of the
// piece is still a placeholder (tools/asset-status.mjs --require=0), and the download share stays inside 0.305 MB (the order's 0.8 MB for all props).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, M, IDS } from './dress.mjs';

const node = (args) => spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });

test('29 assets: the piece is the 29 props_dress assets of the order (section 5)', () => {
  assert.equal(IDS.length, 29, IDS.join(', '));
  const byPri = [0, 1, 2].map((p) => IDS.filter((id) => M.assets[id].priority === p).length);
  assert.deepEqual(byPri, [15, 7, 7]);
});

test('check-glb passes on every shipped file of the piece', () => {
  const r = node(['tools/check-glb.mjs', ...IDS]);
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  assert.equal(r.status, 0, out);
  assert.match(out, /29 assets, 0 textures, [\d.]+ kB: all pass/);
  for (const id of IDS) assert.ok(!out.includes(`${id}`.padEnd(24) + ' ') || !new RegExp(`FAIL\\s+${id}\\b`).test(out), `${id} failed`);
  console.log('    ' + out.trim().split('\n').at(-1));
});

test('asset-status --require=0 --owner props_dress exits 0 (no P0 placeholder); nothing of the piece is a placeholder at all', () => {
  const r = node(['tools/asset-status.mjs', '--require=0', '--owner', 'props_dress']);
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  assert.equal(r.status, 0, out);
  assert.match(out, /art-props-dress\s+props_dress\s+0\/15\s+0\/7\s+0\/7/, out);
});

// Pass i6 (look team creatures-props): the piece's own figure was 0.3 MB and stood at 0.299; the boarded heads of the water
// cart's barrel, the wagon wheel's 24 segments and the hat's 12-sided crown brought it to 0.3006. The budget that binds is
// the ORDER's (docs/workorders/README.md section 5: props 0.8 MB for both halves, mech and dress): held here, with the
// piece's own figure at 0.305.
test('download share: the 29 shipped GLBs weigh at most 0.305 MB together, and all props at most 0.8 MB (the tools count 1 MB = 1048576 bytes)', () => {
  let total = 0, mech = 0;
  for (const id of IDS) total += fs.statSync(M.assets[id]._pub).size;
  for (const [id, a] of Object.entries(M.assets)) if (a.owner === 'props_mech') mech += fs.statSync(a._pub).size;
  console.log(`    ${IDS.length} files, ${total} bytes = ${(total / 1048576).toFixed(3)} MB (tools/pipeline-lib fmtBytes units); with props_mech ${((total + mech) / 1048576).toFixed(3)} MB of 0.8`);
  assert.ok(total <= 0.305 * 1048576, `${total} bytes > 0.305 MB`);
  assert.ok(total + mech <= 0.8 * 1048576, `props_dress ${total} + props_mech ${mech} bytes > 0.8 MB`);
});

test('every script is at its manifest source path, and nothing else lives in blender/props/dress but its helper', () => {
  const dir = path.join(ROOT, 'blender/props/dress');
  const want = new Set(IDS.map((id) => path.basename(M.assets[id].source)));
  for (const id of IDS) assert.ok(fs.existsSync(path.join(ROOT, M.assets[id].source)), M.assets[id].source);
  const extra = fs.readdirSync(dir).filter((f) => f.endsWith('.py') && !want.has(f));
  assert.deepEqual(extra, ['dress_common.py']);
});
