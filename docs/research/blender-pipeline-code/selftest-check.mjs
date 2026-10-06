// node selftest-check.mjs <out_dir>  — asserts on the GLBs written by selftest.py, then runs optimize-glb on one.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import assert from 'node:assert/strict';
import path from 'node:path';
const dir = process.argv[2];
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const read = f => io.read(path.join(dir, f));
const sem = p => p.listSemantics().sort().join(',');
const near = (a, b, eps = 1e-4) => a.every((v, i) => Math.abs(v - b[i]) < eps);

{ const r = (await read('selftest_art.glb')).getRoot();
  const p = r.listMeshes()[0].listPrimitives()[0];
  assert.equal(sem(p), 'COLOR_0,NORMAL,POSITION');
  const mk = r.listNodes().find(n => n.getName() === 'MK_spawn');
  assert.ok(near(mk.getTranslation(), [2, 0, 5]), 'marker axis conversion');          // Blender (2,-5,0) -> (2,0,5)
  assert.ok(near(mk.getRotation(), [0, Math.SQRT1_2, 0, Math.SQRT1_2]), 'marker yaw');
  assert.deepEqual(mk.getExtras(), { type: 'spawn' });
  assert.ok(near(r.listNodes().find(n => n.getName() === 'Crate').getTranslation(), [0.4, 0, -0.4]), 'set_origin'); }

{ const r = (await read('selftest_tex.glb')).getRoot();
  const m = r.listMaterials().find(m => m.getName() === 'M_Plank');
  assert.ok(m.getBaseColorTexture() && m.getMetallicRoughnessTexture() && m.getNormalTexture(), 'baked texture set exported');
  assert.equal(m.getDoubleSided(), false);
  const g = r.listMaterials().find(m => m.getName() === 'M_Grate');
  assert.equal(g.getAlphaMode(), 'MASK');
  assert.ok(g.getExtension('KHR_materials_emissive_strength'), 'emissive strength'); }

{ const r = (await read('selftest_lightmap.glb')).getRoot();
  for (const mesh of r.listMeshes()) assert.equal(sem(mesh.listPrimitives()[0]), 'NORMAL,POSITION,TEXCOORD_0,TEXCOORD_1');
  for (const n of r.listNodes().filter(n => n.getMesh())) assert.deepEqual(n.getExtras(), { lightmap: 'selftest_lm', lightmapScale: 4 });
  const m = r.listMaterials()[0];
  assert.ok(m.getOcclusionTexture(), 'occlusion texture'); assert.equal(m.getOcclusionTextureInfo().getTexCoord(), 1); }

{ const r = (await read('selftest_rig.glb')).getRoot();
  const clips = Object.fromEntries(r.listAnimations().map(a => {
    let end = 0; for (const s of a.listSamplers()) end = Math.max(end, s.getInput().getScalar(s.getInput().getCount() - 1));
    return [a.getName(), end]; }));
  assert.deepEqual(Object.keys(clips), ['Idle', 'Wave']);
  assert.ok(Math.abs(clips.Idle - 2) < 1e-4 && Math.abs(clips.Wave - 20 / 30) < 1e-4, JSON.stringify(clips));
  const wave = r.listAnimations().find(a => a.getName() === 'Wave');
  const ch = wave.listChannels().find(c => c.getTargetNode().getName() === 'arm_L' && c.getTargetPath() === 'rotation');
  const out = ch.getSampler().getOutput(), q0 = out.getElement(0, []), q5 = out.getElement(5, []);
  const ang = 2 * Math.acos(Math.min(1, Math.abs(q0[0] * q5[0] + q0[1] * q5[1] + q0[2] * q5[2] + q0[3] * q5[3]))) * 180 / Math.PI;
  assert.ok(Math.abs(ang - 30) < 1, `quaternion short path: frame 5 should be 30deg from rest, got ${ang}`);
  assert.equal(r.listSkins()[0].listJoints().length, 3);
  assert.equal(sem(r.listMeshes().find(m => m.getName() === 'Bot').listPrimitives()[0]), 'JOINTS_0,NORMAL,POSITION,WEIGHTS_0');
  assert.equal(r.listNodes().find(n => n.getName() === 'BotLamp').getParentNode().getName(), 'body'); }

{ const r = (await read('selftest_skin.glb')).getRoot();
  for (const mesh of r.listMeshes()) assert.ok(sem(mesh.listPrimitives()[0]).includes('JOINTS_0'), mesh.getName()); }
console.log('SELFTEST-CHECK OK');
