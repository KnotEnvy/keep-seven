// The placeholder set: every manifest asset and texture is shipped, passes check-glb, and is reported by asset-status.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { node } from './common.mjs';
import { loadManifest } from '../../tools/pipeline-lib.mjs';
import { checkTexture } from '../../tools/check-glb.mjs';

const M = loadManifest();

test('check-glb --all passes on the shipped set', () => {
  const r = node(['tools/check-glb.mjs', '--all', '--quiet']);
  assert.equal(r.code, 0, r.out.slice(-3000));
  assert.match(r.out, /84 assets, 21 textures, .*all pass/);
});

test('asset-status accounts for all 84 assets and 21 textures', () => {
  const r = node(['tools/asset-status.mjs', '--json']);
  assert.equal(r.code, 0, r.out.slice(-2000));
  const s = JSON.parse(r.out);
  assert.equal(s.summary.assets, 84); assert.equal(s.summary.missingAssets, 0);
  assert.equal(s.summary.textures, 21); assert.equal(s.summary.missingTextures, 0);
  assert.equal(s.summary.clips, 88);
  const finals = s.rows.filter((x) => x.kind === 'texture' && x.state === 'final').map((x) => x.id).sort();
  for (const id of ['tx_frontier_trim', 'tx_mask', 'tx_palette', 'tx_palette_emis', 'tx_pellam_trim', 'tx_sand']) assert.ok(finals.includes(id), `${id} is final`);
  console.log(`    ${s.summary.placeholderAssets} placeholder assets, ${s.summary.placeholderClips} placeholder clips, ${s.summary.placeholderTextures} placeholder textures`);
  // while this is the placeholder set, --require=0 must refuse
  if (s.summary.placeholderAssets > 0 && s.rows.some((x) => x.kind === 'asset' && x.priority === 0 && x.state === 'placeholder')) {
    assert.equal(node(['tools/asset-status.mjs', '--require=0']).code, 1, '--require=0 exits 1 while a P0 asset is a placeholder');
  }
});

test('all 21 textures exist with the manifest size and format', async () => {
  for (const [id, t] of Object.entries(M.textures)) {
    assert.ok(fs.existsSync(t._pub), `${t.path} exists`);
    const r = await checkTexture(M, id);
    assert.deepEqual(r.errors, [], `${id}: ${r.errors.join('; ')}`);
  }
});

test('a placeholder never replaces a final file', async () => {
  // optimize-assets refuses: fake a final shipped file by clearing the placeholder flag of a copy of the manifest entry
  const { optimizeAsset } = await import('../../tools/optimize-assets.mjs');
  const { gltfIO } = await import('../../tools/pipeline-lib.mjs');
  const os = await import('node:os'); const path = await import('node:path');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ks_ph_'));
  const pub = path.join(tmp, 'prop_crate.glb');
  // the raw export offered is a PLACEHOLDER (a copy built for this test: the shipped crate is final art since the
  // integration); the file in the shipped place is (a) the artists' final crate, (b) the placeholder with its flag cleared
  const { buildPlaceholderCopies } = await import('./common.mjs');
  const P = loadManifest(buildPlaceholderCopies());
  const a = P.assets.prop_crate;
  const io = await gltfIO();
  const rootOf = (doc) => doc.getRoot().listNodes().find((n) => n.getName() === 'prop_crate');
  assert.equal(rootOf(await io.read(a._raw)).getExtras().placeholder, true, 'the raw file offered is a placeholder');
  if (rootOf(await io.read(M.assets.prop_crate._pub)).getExtras().placeholder !== true) {
    fs.copyFileSync(M.assets.prop_crate._pub, pub);
    const shipped = fs.readFileSync(pub);
    const kept = await optimizeAsset({ assets: { prop_crate: { ...a, _pub: pub } } }, 'prop_crate');
    assert.ok(kept.skipped, 'the optimiser kept the shipped final crate');
    assert.ok(shipped.equals(fs.readFileSync(pub)), 'the shipped final crate is untouched');
  }
  const doc = await io.read(a._pub);
  rootOf(doc).setExtras({ asset: 'prop_crate' });
  await io.write(pub, doc);
  const before = fs.readFileSync(pub);
  const m2 = { assets: { prop_crate: { ...a, _pub: pub } } };
  const r = await optimizeAsset(m2, 'prop_crate');
  assert.ok(r.skipped, 'the optimiser kept the final file');
  assert.ok(before.equals(fs.readFileSync(pub)), 'the final file is untouched');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('placeholder sockets of the weapon and the creatures sit where code needs them and ride their bones', async () => {
  // code-player and code-enemies attach muzzles, hit volumes and threads to these empties (HitVolumeDef follows a node
  // and has no offset): none may lie on the asset origin, each rides a bone, and each is on or near the placeholder body
  const { gltfIO, worldMatrix } = await import('../../tools/pipeline-lib.mjs');
  const io = await gltfIO();
  let sockets = 0;
  for (const id of ['weapon_revolver', 'enemy_bider', 'enemy_transit', 'enemy_tamper', 'boss_windlass']) {
    const a = M.assets[id], doc = await io.read(a._pub);
    if (!doc.getRoot().listNodes().find((n) => n.getName() === id).getExtras().placeholder) continue;      // final art: check-glb and the art tests judge it
    const joints = new Set(); for (const sk of doc.getRoot().listSkins()) for (const j of sk.listJoints()) joints.add(j);
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const n of doc.getRoot().listNodes()) if (n.getMesh()) for (const p of n.getMesh().listPrimitives()) {
      const P = p.getAttribute('POSITION'), e = [0, 0, 0];
      for (let i = 0; i < P.getCount(); i++) { P.getElement(i, e); for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], e[k]); hi[k] = Math.max(hi[k], e[k]); } }
    }
    const pos = {};
    for (const name of a.nodes) {
      const n = doc.getRoot().listNodes().find((x) => x.getName() === name);
      assert.ok(n, `${id}: node ${name} exists`);
      const m = worldMatrix(n); pos[name] = [m[12], m[13], m[14]];
      if (joints.has(n) || n.getMesh()) continue;
      sockets++;
      assert.ok(Math.hypot(...pos[name]) > 0.05, `${id}: socket '${name}' lies on the asset origin`);
      assert.ok(joints.has(n.getParentNode()), `${id}: socket '${name}' is a child of '${n.getParentNode()?.getName()}', not of a bone: it would not follow a clip`);
      if (name !== 'cam_look') for (let k = 0; k < 3; k++) assert.ok(pos[name][k] >= lo[k] - 0.75 && pos[name][k] <= hi[k] + 0.75, `${id}: socket '${name}' at (${pos[name].map((v) => v.toFixed(2))}) is far from the placeholder body`);
    }
    if (id === 'weapon_revolver') {
      // camera space: the view-model is in front of (-Z), below and to the right of the camera, muzzle at its -Z end
      const gun = doc.getRoot().listNodes().find((x) => x.getName() === 'gun_mesh'), P = gun.getMesh().listPrimitives()[0].getAttribute('POSITION'), e = [0, 0, 0];
      let zmin = Infinity, zmax = -Infinity, ymax = -Infinity, xmin = Infinity;
      for (let i = 0; i < P.getCount(); i++) { P.getElement(i, e); zmin = Math.min(zmin, e[2]); zmax = Math.max(zmax, e[2]); ymax = Math.max(ymax, e[1]); xmin = Math.min(xmin, e[0]); }
      assert.ok(zmax < -0.1 && ymax < 0 && xmin > 0, `the gun placeholder is in view, not round the camera (z ${zmin.toFixed(2)}..${zmax.toFixed(2)}, top ${ymax.toFixed(2)}, left ${xmin.toFixed(2)})`);
      assert.ok(Math.abs(pos.muzzle[2] - zmin) < 0.02, 'the muzzle is at the -Z end of the gun');
      assert.deepEqual(pos.muzzle.map((v) => +v.toFixed(3)), [0.075, -0.07, -0.56], 'art-weapons 4.1: muzzle at (0.075, -0.070, -0.56)');
      assert.equal(doc.getRoot().listNodes().find((x) => x.getName() === 'muzzle').getParentNode().getName(), 'gun');
    }
    if (id === 'boss_windlass') {
      // art-boss 4.1: hub (0, 4.0, 2.0); knot hits on the r = 1.7 ring, number 1 at the top, clockwise seen from +Z; pawls at (-/+1.6, 6.0, 2.6)
      for (let i = 1; i <= 6; i++) {
        const p = pos[`knot_${i}_hit`], r = Math.hypot(p[0], p[1] - 4.0), ang = (360 + Math.atan2(-p[0], p[1] - 4.0) * 180 / Math.PI) % 360;
        assert.ok(Math.abs(r - 1.7) < 0.03 && Math.abs(((ang - 60 * (i - 1) + 540) % 360) - 180) < 1, `knot_${i}_hit on the ring (r ${r.toFixed(2)}, ${ang.toFixed(0)} deg)`);
        assert.ok(p[2] > hi[2] - 0.5 && p[2] > 2.7, `knot_${i}_hit stands proud of the drum face (z ${p[2].toFixed(2)}, body to ${hi[2].toFixed(2)}): a shot can reach it`);
      }
      assert.ok(Math.hypot(pos.pawl_l_hit[0] + 1.6, pos.pawl_l_hit[1] - 6.0, pos.pawl_l_hit[2] - 2.6) < 0.03 && Math.hypot(pos.pawl_r_hit[0] - 1.6, pos.pawl_r_hit[1] - 6.0, pos.pawl_r_hit[2] - 2.6) < 0.03, 'pawl hits');
      assert.deepEqual(pos.drum_spin.map((v) => +v.toFixed(3)), [0, 4, 2], 'the drum hub');
    }
    if (id === 'enemy_bider') assert.ok(pos.crown[1] > 1.2 && pos.crown[2] > 0.1 && Math.abs(pos.hand_socket_r[1] - 0.5) < 0.06, 'the crown is at the top front of the stoop, the cup hand at rim height');
  }
  console.log(`    ${sockets} sockets checked`);
});

test('no non-zone placeholder leaves a named empty on its origin unless the manifest puts it there', async () => {
  const { gltfIO, worldMatrix } = await import('../../tools/pipeline-lib.mjs');
  const io = await gltfIO(); const at0 = [];
  for (const [id, a] of Object.entries(M.assets)) {
    if (a.chunks || !(a.nodes ?? []).length) continue;
    const doc = await io.read(a._pub);
    if (!doc.getRoot().listNodes().find((n) => n.getName() === id)?.getExtras().placeholder) continue;
    const joints = new Set(); for (const sk of doc.getRoot().listSkins()) for (const j of sk.listJoints()) joints.add(j);
    for (const name of a.nodes) {
      const n = doc.getRoot().listNodes().find((x) => x.getName() === name);
      if (!n || joints.has(n) || n.getMesh() || n.listChildren().length || a.nodePos?.[name]) continue;       // bones, meshes, animated parents, placed nodes
      const m = worldMatrix(n);
      if (Math.hypot(m[12], m[13], m[14]) < 1e-4) at0.push(`${id}/${name}`);
    }
  }
  assert.deepEqual(at0, [], `empties on the origin: ${at0.join(', ')}`);
});
