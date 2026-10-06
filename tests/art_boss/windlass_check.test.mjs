// boss_windlass against its manifest entry and its budgets (piece art-boss-windlass; order art-boss 5, 6).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, M, FILE, loadWindlass } from './windlass_lib.mjs';

const A = M.assets.boss_windlass;
const run = (...args) => spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });

test('check-glb passes boss_windlass', () => {
  const r = run('tools/check-glb.mjs', 'boss_windlass');
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('exactly 3 meshes / 3 draw calls, 26 bones, every empty, lamp counts, 9 clips, triangles within 8 000', async () => {
  const w = await loadWindlass();
  const meshes = w.root.listNodes().filter((n) => n.getMesh());
  assert.deepEqual(meshes.map((n) => n.getName()).sort(), ['body_mesh', 'boss_lamps', 'gauge']);
  for (const n of meshes) assert.equal(n.getMesh().listPrimitives().length, 1, `${n.getName()}: one primitive`);
  assert.equal(meshes.find((n) => n.getName() === 'body_mesh').getMesh().listPrimitives()[0].getMaterial().getName(), 'm_prop');
  assert.deepEqual(w.joints.slice().sort(), A.bones.slice().sort());
  assert.equal(w.joints.length, 26);
  const empties = ['knot_1_hit', 'knot_2_hit', 'knot_3_hit', 'knot_4_hit', 'knot_5_hit', 'knot_6_hit', 'pawl_l_hit', 'pawl_r_hit', 'muzzle_top', 'canister_muzzle',
    'thread_anchor_1', 'thread_anchor_2', 'thread_anchor_3', 'thread_anchor_4', 'thread_anchor_5', 'thread_anchor_6'];
  const parentOf = { muzzle_top: 'arm_yaw', canister_muzzle: 'arm_yaw', pawl_l_hit: 'arm_yaw', pawl_r_hit: 'arm_yaw' };
  for (const e of empties) {
    const n = w.nodes.get(e);
    assert.ok(n && !n.getMesh(), `${e} is an empty`);
    assert.equal(n.getParentNode().getName(), parentOf[e] ?? 'drum_spin', `${e} rides ${parentOf[e] ?? 'drum_spin'}`);
  }
  assert.equal(w.nodes.get('boss_lamps').getExtras().lampCount, 14);
  assert.equal(w.nodes.get('gauge').getExtras().lampCount, 26);
  assert.deepEqual(w.root.listAnimations().map((a) => a.getName()).sort(), A.animations.map((a) => a.name).sort());
  const tris = meshes.reduce((s, n) => s + n.getMesh().listPrimitives()[0].getIndices().getCount() / 3, 0);
  assert.ok(tris <= A.triBudget, `${tris} triangles`);
  console.log(`boss_windlass: ${tris} triangles of ${A.triBudget}, 3 draw calls, ${w.joints.length} bones`);
});

const LEAVES = ['guard_piece_1', 'guard_piece_2', 'guard_piece_3', 'guard_piece_4', 'guard_piece_5'];
test('no clip moves a code-driven bone; each clip moves only the bones the order lists', async () => {
  const w = await loadWindlass();
  const allowed = {
    idle_sway: ['root'], present: ['root', 'cable_a', 'cable_b', 'cable_c'], mouth_open: ['mouth_1'], mouth_close: ['mouth_1'],
    // guard_drop / guard_raise: the plate is a five-leaf fan (the leaves turn about the boss onto leaf 1, then the pack is run up
    // on `guard`): a rigid 4.46 m plate has no way off the face that misses the kerb and the floor (docs/requests/art-boss-windlass.md 2.3)
    guard_slide_on: ['guard'], guard_drop: ['guard', ...LEAVES], guard_raise: ['guard', ...LEAVES],
    guard_shatter: ['guard', ...LEAVES],
    sag_death: ['root', 'cable_a', 'cable_b', 'cable_c'],
  };
  const report = [];
  for (const an of w.root.listAnimations()) {
    const moved = new Set();
    for (const ch of an.listChannels()) {
      const o = ch.getSampler().getOutput(), node = ch.getTargetNode(), p = ch.getTargetPath();
      const rest = p === 'rotation' ? node.getRotation() : p === 'translation' ? node.getTranslation() : node.getScale();
      const same = (v) => (p === 'rotation' ? Math.abs(v[0] * rest[0] + v[1] * rest[1] + v[2] * rest[2] + v[3] * rest[3]) > 1 - 1e-6 : v.every((x, k) => Math.abs(x - rest[k]) < 1e-4));
      for (let i = 0; i < o.getCount(); i++) if (!same(o.getElement(i, []))) { moved.add(node.getName()); break; }
    }
    for (const b of moved) {
      assert.ok(!A.codeDriven.includes(b), `${an.getName()} moves the code-driven bone ${b}`);
      assert.ok(allowed[an.getName()].includes(b), `${an.getName()} moves ${b}`);
    }
    report.push(`${an.getName()}: ${[...moved].join(' ') || '-'}`);
  }
  console.log(report.join('; '));
});

test('download share: the Windlass and the canister together stay under 0.35 MB', () => {
  const a = fs.statSync(FILE).size, b = fs.statSync(path.join(ROOT, 'public/assets/boss/proj_canister.glb')).size;
  console.log(`boss_windlass.glb ${a} B + proj_canister.glb ${b} B = ${a + b} B of 350000`);
  assert.ok(a + b <= 350000, `${a + b} bytes`);
});

test('asset-status: neither of this piece\'s assets is a placeholder', () => {
  const r = run('tools/asset-status.mjs', '--owner', 'boss');
  const row = r.stdout.split('\n').find((l) => l.startsWith('art-boss-windlass'));
  assert.ok(row, r.stdout);
  assert.match(row, /\s0\/2\s+0\/0\s+0\/0\s+0\/9\s/, row);
  for (const id of ['boss_windlass', 'proj_canister']) assert.ok(!new RegExp(`\\b${id}\\b`).test(r.stdout.split('P0:')[1] ?? ''), `${id} is listed as open`);
});
