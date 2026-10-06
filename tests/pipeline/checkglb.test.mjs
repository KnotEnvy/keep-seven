// Mutation tests of tools/check-glb.mjs: every deliberately broken file must be caught, and the unbroken ones pass.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { EXTMeshGPUInstancing } from '@gltf-transform/extensions';
import { OVERLAY, buildFixtures, buildPlaceholderCopies } from './common.mjs';
import { loadManifest, loadLayout, gltfIO } from '../../tools/pipeline-lib.mjs';
import { checkAsset, checkTexture } from '../../tools/check-glb.mjs';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ks_checkglb_'));
let M, L, io;
test.before(async () => { buildFixtures(); M = loadManifest(OVERLAY); L = loadLayout(); io = await gltfIO(); });
test.after(() => fs.rmSync(TMP, { recursive: true, force: true }));

/** Load the shipped file of `id`, break it with fn(doc), write it to a temp file, run check-glb on it. */
async function broken(id, name, fn, manifest = M, from = M) {
  const doc = await io.read(from.assets[id]._pub);
  await fn(doc);
  const file = path.join(TMP, `${id}_${name}.glb`);
  await io.write(file, doc);
  return checkAsset(manifest, L, id, { file });
}
const expectError = (r, re) => assert.ok(r.errors.some((e) => re.test(e)), `expected an error matching ${re}, got:\n  ${r.errors.join('\n  ') || '(none)'}`);
const node = (doc, name) => doc.getRoot().listNodes().find((n) => n.getName() === name);

test('the unbroken fixtures pass', async () => {
  for (const id of ['fixture_stool', 'fixture_probe', 'fixture_crate_panel', 'fixture_room']) {
    const r = await checkAsset(M, L, id);
    assert.deepEqual(r.errors, [], `${id}: ${r.errors.join('; ')}`);
  }
  for (const id of ['lm_fixture_room', 'lm_fixture_room_layer']) assert.deepEqual((await checkTexture(M, id)).errors, []);
});

test('1 over the triangle budget', async () => {
  const m2 = structuredClone(M); Object.assign(m2.assets.fixture_stool, M.assets.fixture_stool, { triBudget: 100 });
  expectError(await broken('fixture_stool', 'budget', () => {}, m2), /triangles > triBudget/);
});
test('2 a missing node', async () => {
  expectError(await broken('fixture_probe', 'node', (d) => node(d, 'socket_a').setName('socket_x')), /node 'socket_a' is missing/);
});
test('3 a missing bone / a bone that is an empty', async () => {
  expectError(await broken('fixture_probe', 'bone', (d) => { for (const s of d.getRoot().listSkins()) s.removeJoint(node(d, 'lid')); }), /'lid' is listed in bones but is not a joint/);
});
test('4 wrong clip length', async () => {
  expectError(await broken('fixture_probe', 'clip', (d) => {
    const an = d.getRoot().listAnimations().find((a) => a.getName() === 'flip');
    for (const s of an.listSamplers()) { const inp = s.getInput().clone(); inp.setArray(inp.getArray().map((t) => t * 2)); s.setInput(inp); }
  }), /clip 'flip' lasts 0\.600 s/);
});
test('5 a loop whose first and last keys differ', async () => {
  expectError(await broken('fixture_probe', 'loop', (d) => {
    const an = d.getRoot().listAnimations().find((a) => a.getName() === 'idle');
    const ch = an.listChannels().find((c) => c.getTargetNode().getName() === 'lid' && c.getTargetPath() === 'rotation');
    const out = ch.getSampler().getOutput().clone(); const arr = Float32Array.from(out.getArray());
    arr.set([0, 0.3826834, 0, 0.9238795], arr.length - 4); out.setArray(arr); ch.getSampler().setOutput(out);
  }), /clip 'idle' is a loop but its first and last keys differ/);
});
test('6 a clip the manifest does not list, and a missing clip', async () => {
  const r = await broken('fixture_probe', 'clipname', (d) => d.getRoot().listAnimations().find((a) => a.getName() === 'flip').setName('flop'));
  expectError(r, /clip 'flip' is missing/); expectError(r, /clip 'flop' is not in the manifest/);
});
test('7 a thin island', async () => {
  const add = (d) => {
    const base = node(d, 'fixture_stool_mesh').getMesh().listPrimitives()[0];
    const buf = d.getRoot().listBuffers()[0];
    const s = 0.005, pts = [];
    for (const z of [0, 1.2]) for (const [x, y] of [[-s, -s], [s, -s], [s, s], [-s, s]]) pts.push(x + 0.5, z, y);
    const idx = [0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
    const acc = (type, arr) => d.createAccessor().setType(type).setArray(arr).setBuffer(buf);
    const n = pts.length / 3;
    const prim = d.createPrimitive().setMaterial(base.getMaterial())
      .setAttribute('POSITION', acc('VEC3', new Float32Array(pts))).setAttribute('NORMAL', acc('VEC3', new Float32Array(n * 3).fill(0.577)))
      .setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(n * 2))).setAttribute('COLOR_0', acc('VEC4', new Float32Array(n * 4).fill(1)))
      .setIndices(acc('SCALAR', new Uint16Array(idx)));
    const nd = d.createNode('rod').setMesh(d.createMesh('rod').addPrimitive(prim));
    node(d, 'fixture_stool').addChild(nd);
    return nd;
  };
  const m2 = structuredClone(M); Object.assign(m2.assets.fixture_stool, M.assets.fixture_stool, { triBudget: 400 });
  expectError(await broken('fixture_stool', 'thin', add, m2), /mesh 'rod': 1 thin part/);
  // thin_ok with a distance the rule allows passes; one it does not allow fails
  const ok = await broken('fixture_stool', 'thin_ok', (d) => add(d).setExtras({ thin_ok: 4 }), m2);
  assert.ok(!ok.errors.some((e) => /thin part/.test(e)), ok.errors.join('; '));
  expectError(await broken('fixture_stool', 'thin_far', (d) => add(d).setExtras({ thin_ok: 30 }), m2), /thin_ok 30 m needs 60 mm/);
});
test('8 a chunk mesh outside its box', async () => {
  expectError(await broken('fixture_room', 'box', (d) => {
    const p = node(d, 'chunk_fx_room__m_pellam').getMesh().listPrimitives()[0];
    const pos = p.getAttribute('POSITION').clone(); const a = Float32Array.from(pos.getArray());
    for (let i = 0; i < 30; i += 3) a[i] += 40; pos.setArray(a); p.setAttribute('POSITION', pos);
  }), /vertices lie outside the chunk's box/);
});
test('9 a mesh that is not in the chunk plan, and a planned mesh missing', async () => {
  const r = await broken('fixture_room', 'plan', (d) => node(d, 'chunk_fx_room__m_pellam').setName('walls'));
  expectError(r, /mesh 'walls' is not in the chunk plan/); expectError(r, /planned mesh 'chunk_fx_room__m_pellam' is missing/);
});
test('10 a gameplay position on a mesh node', async () => {
  expectError(await broken('fixture_probe', 'meshnode', (d) => node(d, 'socket_a').setMesh(node(d, 'probe_lamps').getMesh())), /node 'socket_a' is a gameplay position/);
});
test('11 nodePos off by more than 0.03 m', async () => {
  expectError(await broken('fixture_probe', 'nodepos', (d) => node(d, 'socket_b').setTranslation([-0.2, 0.35, 0])), /node 'socket_b' rests at .* 0\.050 m off/);
});
test('12 an embedded image', async () => {
  expectError(await broken('fixture_stool', 'image', async (d) => {
    const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#808080' } }).png().toBuffer();
    const t = d.createTexture('albedo').setImage(png).setMimeType('image/png');
    d.getRoot().listMaterials()[0].setBaseColorTexture(t);
  }), /embeds 1 image/);
});
test('13 EXT_mesh_gpu_instancing', async () => {
  expectError(await broken('fixture_stool', 'instancing', (d) => {
    const ext = d.createExtension(EXTMeshGPUInstancing);
    const buf = d.getRoot().listBuffers()[0];
    const batch = ext.createInstancedMesh().setAttribute('TRANSLATION', d.createAccessor().setType('VEC3').setArray(new Float32Array([0, 0, 0, 1, 0, 0])).setBuffer(buf));
    node(d, 'fixture_stool_mesh').setExtension('EXT_mesh_gpu_instancing', batch);
  }), /EXT_mesh_gpu_instancing/);
});
test('14 an unweighted vertex', async () => {
  expectError(await broken('fixture_probe', 'weights', (d) => {
    const p = node(d, 'fixture_probe_mesh').getMesh().listPrimitives()[0];
    const w = p.getAttribute('WEIGHTS_0').clone(); const a = w.getArray().slice(); a.fill(0, 0, 8); w.setArray(a); p.setAttribute('WEIGHTS_0', w);
  }), /2 vertices have no bone weight/);
});
test('15 a lightmap without its neutral texel, and one of the wrong size', async () => {
  const t = M.textures.lm_fixture_room;
  const grey = path.join(TMP, 'lm_grey.webp');
  await sharp({ create: { width: 256, height: 256, channels: 3, background: '#808080' } }).webp({ lossless: true }).toFile(grey);
  expectError(await checkTexture(M, 'lm_fixture_room', { file: grey }), /neutral texel .* is not painted white/);
  const small = path.join(TMP, 'lm_small.webp');
  await sharp(t._pub).resize(128, 128).webp({ lossless: true }).toFile(small);
  expectError(await checkTexture(M, 'lm_fixture_room', { file: small }), /128 x 128; the manifest says 256 x 256/);
});
test('16 dressing over the allowance, on an asset the zone does not allow', async () => {
  const many = await broken('fixture_room', 'dressing', (d) => { for (let i = 2; i < 6; i++) node(d, 'fixture_room').addChild(d.createNode(`inst_00${i}`).setExtras({ asset: 'fixture_stool' }).setTranslation([i, 0, 0])); });
  expectError(many, /dressing: \d+ triangles > the zone's allowance 600/);
  expectError(await broken('fixture_room', 'dressing2', (d) => node(d, 'inst_001').setExtras({ asset: 'fixture_probe' })), /fixture_probe is not in the dressing allowance/);
});
test('17 a wrong lamp count', async () => {
  expectError(await broken('fixture_probe', 'lamps', (d) => node(d, 'probe_lamps').setExtras({ lampCount: 5, bake: 'UNLIT' })), /lampCount extra is 5, the manifest says 3/);
});
test('18 a material the manifest does not allow, and a mesh without COLOR_0', async () => {
  expectError(await broken('fixture_stool', 'material', (d) => d.getRoot().listMaterials()[0].setName('m_frontier')), /uses m_frontier; the manifest allows m_prop/);
  expectError(await broken('fixture_stool', 'colour', (d) => node(d, 'fixture_stool_mesh').getMesh().listPrimitives()[0].setAttribute('COLOR_0', null)), /has no COLOR_0/);
});
test('19 vertex-lit vertices off the neutral texel', async () => {
  expectError(await broken('fixture_room', 'neutral', (d) => {
    const p = node(d, 'chunk_fx_room__m_pellam').getMesh().listPrimitives()[0];
    const nt = M.textures.lm_fixture_room.neutralTexel.uv;
    const src = p.getAttribute('TEXCOORD_1'); const n = src.getCount(); const a = new Float32Array(n * 2); const e = [0, 0];
    let moved = 0;
    for (let i = 0; i < n; i++) { src.getElement(i, e); if (moved < 5 && Math.abs(e[0] - nt[0]) < 1e-4 && Math.abs(e[1] - nt[1]) < 1e-4) { e[0] += 0.006; moved++; } a[i * 2] = e[0]; a[i * 2 + 1] = e[1]; }
    p.setAttribute('TEXCOORD_1', d.createAccessor().setType('VEC2').setArray(a).setBuffer(d.getRoot().listBuffers()[0]));
  }), /5 vertices have UV1 inside the neutral block/);
});
test('20 a collider_terrain sheet with triangles facing down (final art only)', async () => {
  // the shipped placeholder is the closed terrain solids (bottoms face down) and passes because it is a placeholder;
  // the same mesh claimed as final art must fail
  // (the shipped lip is final art since the integration: the placeholder is a copy built for this test)
  const P = loadManifest(buildPlaceholderCopies());
  assert.ok(!(await checkAsset(P, L, 'env_the_lip')).errors.some((e) => /face down/.test(e)), 'the placeholder is not held to it');
  expectError(await broken('env_the_lip', 'down', (d) => {
    for (const n of d.getRoot().listNodes()) if (n.getExtras().placeholder) n.setExtras({ ...n.getExtras(), placeholder: false });
    for (const sc of d.getRoot().listScenes()) if (sc.getExtras().placeholder) sc.setExtras({ ...sc.getExtras(), placeholder: false });
  }, P, P), /collider_terrain: \d+ triangle\(s\) face down/);
  // and the sculpted sheet the artists shipped has none
  assert.ok(!(await checkAsset(M, L, 'env_the_lip')).errors.some((e) => /face down/.test(e)), 'the shipped final sheet has no triangle facing down');
});
test('21 two meshes that share one material are two draw calls; variant nodes count once', async () => {
  const twin = (d, names) => {
    const src = node(d, 'fixture_stool_mesh');
    return names.map((name) => { const n = d.createNode(name).setMesh(src.getMesh()).setExtras({ bake: 'AO' }).setTranslation([1, 0, 0]); node(d, 'fixture_stool').addChild(n); return n; });
  };
  const big = (over) => { const m2 = structuredClone(M); Object.assign(m2.assets.fixture_stool, M.assets.fixture_stool, { triBudget: 2000, instanced: false, ...over }); return m2; };
  // one material, two meshes: the budget of 1 is broken although only m_prop is used
  const r = await broken('fixture_stool', 'twomeshes', (d) => twin(d, ['second']), big({}));
  expectError(r, /2 draw calls > drawCalls 1: one per mesh primitive \(.*second/);
  assert.equal(r.drawCalls, 2);
  // two VARIANT nodes beside the body: one shows at a time, so 2 calls, not 3
  const v = await broken('fixture_stool', 'variants', (d) => twin(d, ['var_a', 'var_b']), big({ nodes: ['var_a', 'var_b'], drawCalls: 2 }));
  assert.equal(v.drawCalls, 2); assert.deepEqual(v.errors, []);
  expectError(await broken('fixture_stool', 'variants1', (d) => twin(d, ['var_a', 'var_b']), big({ nodes: ['var_a', 'var_b'], drawCalls: 1 })), /2 draw calls > drawCalls 1.*the largest is var_/);
  // the reference asset really is five meshes
  assert.equal((await checkAsset(M, L, 'fixture_crate_panel')).drawCalls, 5);
});
test('22 a standalone mesh without (or with the wrong) bake extra', async () => {
  expectError(await broken('fixture_stool', 'nobake', (d) => node(d, 'fixture_stool_mesh').setExtras({})), /mesh 'fixture_stool_mesh' needs the extra bake: AO/);
  expectError(await broken('fixture_stool', 'wrongbake', (d) => node(d, 'fixture_stool_mesh').setExtras({ bake: 'VL' })), /needs the extra bake: AO \(the manifest's bake is AO; has "VL"/);
  // a vertex-lit asset must say VL (the runtime shows COLOR_0 x 2 only then); LM needs its lightmap and UV1
  const vl = structuredClone(M); Object.assign(vl.assets.fixture_stool, M.assets.fixture_stool, { bake: 'VL', placedBy: 'code' });
  expectError(await broken('fixture_stool', 'vl', () => {}, vl), /needs the extra bake: VL/);
  assert.deepEqual((await broken('fixture_stool', 'vl_ok', (d) => node(d, 'fixture_stool_mesh').setExtras({ bake: 'VL' }), vl)).errors, []);
  // ... but a VL asset that a ZONE embeds and lights (placedBy: zone: 17 props of the game) carries unlit tint x AO in its
  // own file: it must say AO. Stamped VL the viewer and every <id>_game.png show it at twice its authored brightness
  const vlZone = structuredClone(M); Object.assign(vlZone.assets.fixture_stool, M.assets.fixture_stool, { bake: 'VL', placedBy: 'zone' });
  assert.deepEqual((await broken('fixture_stool', 'vlzone_ok', () => {}, vlZone)).errors, [], 'the stool as built (extra AO) is right for bake VL + placedBy zone');
  expectError(await broken('fixture_stool', 'vlzone', (d) => node(d, 'fixture_stool_mesh').setExtras({ bake: 'VL' }), vlZone), /needs the extra bake: AO \(the manifest's bake is VL; has "VL"/);
  for (const [id, a] of Object.entries(loadManifest().assets)) {
    if (a.chunks || a.bake !== 'VL' || a.placedBy !== 'zone') continue;
    const doc = await io.read(a._pub);
    for (const n of doc.getRoot().listNodes()) if (n.getMesh() && n.getExtras().bake !== 'UNLIT') assert.equal(n.getExtras().bake, 'AO', `${id}: mesh ${n.getName()} of a zone-lit prop is stamped AO`);
  }
  const lm = structuredClone(M); Object.assign(lm.assets.fixture_stool, M.assets.fixture_stool, { bake: 'LM+VL', lightmaps: ['lm_fixture_room'] });
  const r = await broken('fixture_stool', 'lm', (d) => node(d, 'fixture_stool_mesh').setExtras({ bake: 'LM' }), lm);
  expectError(r, /is bake LM: its lightmap extra must be one of lm_fixture_room/); expectError(r, /is bake LM but has no TEXCOORD_1/);
  assert.deepEqual((await broken('fixture_stool', 'lmvl', (d) => node(d, 'fixture_stool_mesh').setExtras({ bake: 'VL' }), lm)).errors, []);
  expectError(await broken('fixture_probe', 'lampbake', (d) => node(d, 'probe_lamps').setExtras({ lampCount: 3 })), /mesh 'probe_lamps' \(m_emis\) needs the extra bake: UNLIT/);
});
test('23 a socket that does not ride the bone the manifest names (nodeParent)', async () => {
  const m2 = structuredClone(M); Object.assign(m2.assets.fixture_probe, M.assets.fixture_probe, { nodeParent: { tip: 'lid', socket_a: 'lid' } });
  const r = await checkAsset(m2, L, 'fixture_probe');
  assert.ok(!r.errors.some((e) => /node 'tip'/.test(e)), `tip rides lid: ${r.errors.join('; ')}`);
  expectError(r, /node 'socket_a' must be a child of 'lid' \(manifest nodeParent\); its parent is 'fixture_probe'/);
});
