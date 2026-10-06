// art-weapons 5: check-glb on the six assets and the two textures; nothing of this piece is a placeholder; the facts the
// order states about the revolver file (31 bones, 2 meshes, 15 clips of the manifest's lengths, no keys on code-driven bones).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { IDS, M, REV, FPS, node } from './lib.mjs';
import { glbJson } from '../../tools/pipeline-lib.mjs';

test('check-glb passes on the six assets and the two textures', () => {
  const r = node('tools/check-glb.mjs', [...IDS, 'tx_gun', 'tx_matcap_steel']);
  console.log(r.out.trim());
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /all pass/);
});

test('asset-status --require=0 --owner weapons exits 0: no placeholder asset, clip or texture', () => {
  const r = node('tools/asset-status.mjs', ['--require=0', '--owner', 'weapons']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /0 placeholder assets of 6; 0 placeholder clips of 15 \(0 fallback copies\); 0 placeholder textures of 2/);
});

test('weapon_revolver.glb: 31 joints, gun_mesh + arms_mesh, 15 clips within one frame, no channel on a code-driven bone, no image', () => {
  const js = glbJson(REV._pub);
  const names = js.nodes.map((n) => n.name);
  assert.equal(js.skins.length, 1);
  const joints = js.skins[0].joints.map((i) => names[i]);
  assert.deepEqual([...joints].sort(), [...REV.bones].sort());
  assert.equal(joints.length, 31);
  const meshNodes = js.nodes.filter((n) => n.mesh !== undefined).map((n) => n.name).sort();
  assert.deepEqual(meshNodes, ['arms_mesh', 'gun_mesh']);
  assert.equal(js.meshes.reduce((s, m) => s + m.primitives.length, 0), 2, 'two primitives = two draw calls');
  assert.ok(!js.images || js.images.length === 0, 'the GLB contains no image');
  for (const e of ['muzzle', 'eject', 'cam_look']) { const n = js.nodes.find((x) => x.name === e); assert.ok(n && n.mesh === undefined, `${e} is an empty`); }
  const parentOf = {}; js.nodes.forEach((n) => (n.children ?? []).forEach((c) => { parentOf[names[c]] = n.name; }));
  assert.equal(parentOf.muzzle, 'gun'); assert.equal(parentOf.eject, 'gun'); assert.equal(parentOf.cam_look, 'root');
  for (let i = 1; i <= 6; i++) assert.equal(parentOf[`round_${i}`], 'cylinder');
  assert.deepEqual(js.animations.map((a) => a.name), REV.animations.map((a) => a.name));
  const code = new Set(REV.codeDriven), rows = [];
  for (const a of js.animations) {
    const want = REV.animations.find((x) => x.name === a.name).seconds;
    let end = 0;
    for (const ch of a.channels) {
      const target = names[ch.target.node];
      assert.ok(!code.has(target), `${a.name} keys the code-driven bone ${target}`);
      end = Math.max(end, js.accessors[a.samplers[ch.sampler].input].max[0]);
    }
    assert.ok(Math.abs(end - want) <= 1 / FPS + 1e-6, `${a.name}: ${end} s authored, ${want} s in the manifest`);
    assert.ok(Math.abs(end * FPS - Math.round(end * FPS)) < 1e-3, `${a.name}: authored length ${end * FPS} frames is not a whole number of frames`);
    for (const b of ['round_hand_lead', 'round_hand_line', 'round_hand_kept']) assert.ok(a.channels.some((ch) => names[ch.target.node] === b && ch.target.path === 'scale'), `${a.name} has no scale track on ${b}`);
    rows.push(`${a.name} ${Math.round(end * FPS)}f/${want}s`);
  }
  console.log('authored frames / manifest seconds: ' + rows.join(', '));
  const bytes = fs.statSync(REV._pub).size;
  const ammo = IDS.slice(1).reduce((s, id) => s + fs.statSync(M.assets[id]._pub).size, 0);
  const tex = fs.statSync(M.textures.tx_gun._pub).size + fs.statSync(M.textures.tx_matcap_steel._pub).size;
  console.log(`download: weapon_revolver.glb ${(bytes / 1000).toFixed(1)} kB (<= 350), five ammunition GLBs ${(ammo / 1000).toFixed(1)} kB (<= 40), tx_gun + tx_matcap_steel ${(tex / 1000).toFixed(1)} kB (<= 250)`);
  assert.ok(bytes <= 350000); assert.ok(ammo <= 40000); assert.ok(tex <= 250000);
});
