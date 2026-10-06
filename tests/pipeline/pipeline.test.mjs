// The optimise round trip through the REAL loader (ARCHITECTURE 7.1, 11.4). node --test tests/pipeline/
//   (a) COLOR_0 0.02 / 0.5 / 1.0 survives optimise + the loader within 1/4096
//   (b) fixture room: UV1 present, wall vertices on the neutral texel, the wall shows vertex light and the floor its lightmap
//   (c) every manifest node of three sample assets resolvable through AssetInstance.node(), nodePos within 0.03 m
//   (d) no shipped file contains EXT_mesh_gpu_instancing or an embedded image
//   (e) a clip authored at 0.30 s plays for exactly the manifest's seconds through AssetInstance.action()
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, openGame } from '../harness.mjs';
import { ROOT, OVERLAY, PH_OVERLAY, PH_OVERLAY_REL, buildFixtures, buildPlaceholderCopies } from './common.mjs';
import { loadManifest, glbJson } from '../../tools/pipeline-lib.mjs';

const M = loadManifest(OVERLAY);
let server;
test.before(async () => { buildFixtures(); server = await startServer(); });
test.after(async () => { await server?.close(); });
const open = (query) => openGame(server, { page: 'tests/pipeline/fixture_view', piece: 'foundation-pipeline', start: false, query });

test('(a) 12-bit COLOR_0 survives optimise and the real loader within 1/4096', async () => {
  const g = await open({ asset: 'fixture_probe', overlay: 1 });
  try {
    const v = await g.page.evaluate(() => window.__fx.vertices('fixture_probe_mesh'));
    assert.ok(v, 'probe mesh found');
    const want = [0.02, 0.5, 1.0]; const seen = [0, 0, 0]; let worst = 0;
    for (const p of v.vertices) {
      const k = Math.round((p.uv[0] - 0.125) * 4);
      if (k < 0 || k > 2 || Math.abs(p.uv[0] - (k / 4 + 0.125)) > 0.01) continue;      // the lid part
      seen[k]++;
      for (const c of p.c) worst = Math.max(worst, Math.abs(c - want[k]));
    }
    assert.deepEqual(seen.map((n) => n > 0), [true, true, true], 'all three probe quads found');
    console.log(`    COLOR_0 arrives as ${v.colorType} (normalised ${v.colorNormalized}); worst error ${worst.toExponential(2)} (limit ${(1 / 4096).toExponential(2)})`);
    assert.ok(worst <= 1 / 4096, `colour error ${worst} exceeds 1/4096: take COLOR_0 out of the quantise pattern`);
  } finally { await g.close(); }
});

test('(b) fixture room: lightmapped floor and vertex-lit wall in one mesh', async () => {
  const g = await open({ asset: 'fixture_room', overlay: 1, yaw: 60, pitch: 32, dist: 6.2, tx: 0, ty: 0.9, tz: 0 });
  try {
    const meshes = await g.page.evaluate(() => window.__fx.meshes());
    const room = meshes.find((m) => m.name === 'chunk_fx_room__m_pellam');
    assert.ok(room, 'chunk mesh present: ' + meshes.map((m) => m.name).join(', '));
    assert.ok(room.attributes.includes('uv1'), 'UV1 present after the loader');
    assert.equal(room.userData.bake, 'LM'); assert.equal(room.userData.lightmap, 'lm_fixture_room');
    assert.ok(room.lightMap, 'the fallback material bound the lightmap');
    const v = await g.page.evaluate(() => window.__fx.vertices('chunk_fx_room__m_pellam'));
    const nt = M.textures.lm_fixture_room.neutralTexel.uv;
    let walls = 0, wallsOn = 0, floor = 0, floorOn = 0;
    for (const p of v.vertices) {
      const on = Math.abs(p.uv1[0] - nt[0]) < 2e-4 && Math.abs(p.uv1[1] - nt[1]) < 2e-4;
      if (p.p[1] > 0.6) { walls++; if (on) wallsOn++; } else if (Math.abs(p.p[1]) < 1e-4 && Math.abs(p.p[0]) <= 3 && Math.abs(p.p[2]) <= 2 && !on) floor++;
      if (Math.abs(p.p[1]) < 1e-4 && on) floorOn++;
    }
    assert.ok(walls > 500 && wallsOn === walls, `every wall / ceiling vertex sits on the neutral texel (${wallsOn}/${walls})`);
    assert.ok(floor >= 16, `floor vertices carry lightmap UVs (${floor})`);
    const file = await g.shot('fixture_room_game');
    // the sun patch on the floor (lightmap) and the lit east wall (vertex light) are both brighter than their surroundings
    const px = await g.page.evaluate(() => {
      const f = window.__fx; const at = (p) => f.pixel(...f.project(p));
      return { sunPatch: at([-1.9, 0, 0.55]), floorShade: at([0.5, 0, -1.5]), wallLit: at([2.99, 0.7, 0.9]), wallShade: at([-0.5, 1.8, -1.99]) };
    });
    const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    console.log(`    ${path.relative(ROOT, file)}  floor sun patch ${px.sunPatch} vs shade ${px.floorShade}; wall lit ${px.wallLit} vs shade ${px.wallShade}`);
    assert.ok(lum(px.floorShade) > 3, 'the floor shows its lightmap (not black)');
    assert.ok(lum(px.wallShade) > 3, 'the wall shows its vertex light (not black)');
    assert.ok(Math.abs(lum(px.sunPatch) - lum(px.floorShade)) > 6 || Math.abs(lum(px.wallLit) - lum(px.wallShade)) > 6, 'baked light varies across the room');
  } finally { await g.close(); }
});

test('(c) manifest nodes resolve through AssetInstance.node(); nodePos within 0.03 m', async () => {
  for (const [id, overlay] of [['fixture_probe', 1], ['ia_bore_door', 0], ['weapon_revolver', 0], ['prop_stock_gate', 0], ['env_plenty_street', 0]]) {
    const g = await open({ asset: id, overlay });
    try {
      const a = M.assets[id];
      const names = [...new Set([...(a.nodes ?? []), ...(a.bones ?? [])])];
      const got = await g.page.evaluate((list) => list.map((n) => { try { return { n, ...window.__fx.node(n) }; } catch (e) { return { n, error: String(e.message) }; } }), names);
      for (const r of got) {
        assert.ok(!r.error, `${id}: node('${r.n}') failed: ${r.error}`);
        if ((a.bones ?? []).includes(r.n)) assert.ok(r.isBone, `${id}: '${r.n}' is listed in bones and must resolve to the bone`);
        const want = a.nodePos?.[r.n];
        if (want) {
          const d = Math.hypot(r.pos[0] - want[0], r.pos[1] - want[1], r.pos[2] - want[2]);
          assert.ok(d <= 0.03, `${id}: '${r.n}' is ${d.toFixed(4)} m from its nodePos`);
        }
      }
      console.log(`    ${id}: ${got.length} names resolved, ${Object.keys(a.nodePos ?? {}).length} positions within 0.03 m`);
    } finally { await g.close(); }
  }
});

test('(d) no shipped file contains EXT_mesh_gpu_instancing or an embedded image', () => {
  let n = 0;
  for (const [id, a] of Object.entries(M.assets)) {
    if (!fs.existsSync(a._pub)) continue;
    const js = glbJson(a._pub); n++;
    assert.ok(!(js.extensionsUsed ?? []).includes('EXT_mesh_gpu_instancing'), `${id} uses EXT_mesh_gpu_instancing`);
    assert.equal((js.images ?? []).length, 0, `${id} embeds an image`);
    assert.equal((js.textures ?? []).length, 0, `${id} has a texture`);
    assert.ok((js.extensionsUsed ?? []).includes('EXT_meshopt_compression'), `${id} is meshopt-compressed`);
  }
  assert.ok(n >= 84, `checked ${n} shipped files`);
});

test('(e) a clip authored at 0.30 s plays for exactly the manifest seconds', async () => {
  const g = await open({ asset: 'fixture_probe', overlay: 1 });
  try {
    const r = await g.page.evaluate(() => window.__fx.clip('flip'));
    console.log(`    authored ${r.authored.toFixed(4)} s, manifest ${r.manifest} s, timeScale ${r.timeScale.toFixed(4)}, finished at ${r.finishedAt?.toFixed(4)} s`);
    assert.ok(Math.abs(r.authored - 0.30) < 1e-3, `authored length ${r.authored}`);
    assert.equal(r.manifest, 0.32);
    assert.ok(r.finishedAt !== null && Math.abs(r.finishedAt - 0.32) <= 1 / 240 + 1e-6, `the clip finished at ${r.finishedAt} s, expected 0.32`);
  } finally { await g.close(); }
});

test('(f) the crate + panel fixture through the real loader: names, materials, budget (evidence shot)', async () => {
  const g = await open({ asset: 'fixture_crate_panel', overlay: 1, yaw: 18, pitch: 12, dist: 5.6, ty: 1.1 });
  try {
    const meshes = await g.page.evaluate(() => window.__fx.meshes());
    const mats = meshes.map((m) => m.material).sort();
    assert.deepEqual([...new Set(mats)], ['m_frontier', 'm_mask', 'm_pellam', 'm_prop'], 'the four material NAMES survive dedup');
    assert.ok(meshes.every((m) => m.attributes.includes('color')), 'every mesh has COLOR_0');
    const k = await g.page.evaluate(() => [window.__fx.node('knot_live'), window.__fx.node('socket_knot')]);
    assert.ok(k[0].isMesh && !k[1].isMesh);
    const file = await g.shot('fixture_crate_panel_game');
    console.log(`    ${path.relative(ROOT, file)}  meshes: ${meshes.map((m) => `${m.name}(${m.material})`).join(', ')}`);
  } finally { await g.close(); }
});

test('(g) sandbox/viewer.html shows a fixture through the overlay manifest (?overlay=)', async () => {
  const g = await openGame(server, { page: 'sandbox/viewer', piece: 'foundation-pipeline', start: false,
    query: { asset: 'fixture_crate_panel', overlay: 'tests/pipeline/fixtures/manifest.json', yaw: 25, pitch: 12 } });
  try {
    await g.step(2, true);
    const panel = await g.page.evaluate(() => document.getElementById('panel').textContent);
    const def = M.assets.fixture_crate_panel;
    assert.ok(panel.includes('fixture_crate_panel') && panel.includes('[final]'), panel);
    assert.ok(panel.includes(`budget ${def.triBudget}`) && !panel.includes('MISSING') && !panel.includes('OVER'), panel);
    const labels = await g.page.evaluate(() => Array.from(document.querySelectorAll('.label3d')).map((e) => e.textContent));
    assert.deepEqual(labels.slice().sort(), def.nodes.slice().sort(), 'every manifest node of the fixture has a label');
    const report = await g.page.evaluate(() => window.__dbg.ext.assets.report());
    assert.ok(report.assetsFromFiles >= 1, 'the fixture came from its file, not from synthesis');
    await g.shot('fixture_crate_panel_viewer');
  } finally { await g.close(); }
});

test('(h) dressing empties reach the runtime: object name inst_<nnn> / brk_<nnn>, userData.asset / node, world position', async () => {
  // what code-world's generic dressing path and code-render's instanced sets read (ARCHITECTURE 7.5), through the real loader
  const G = loadManifest();
  /** every empty of the file is an object of the instance with the file's extras and position. -> the names */
  const checkZone = async (label, env, zid, z, js, query) => {
    const g = await open(query);
    try {
      const got = await g.page.evaluate(() => window.__fx.dressing());
      const want = js.nodes.filter((n) => /^(inst|brk)_\d{3}$/.test(n.name));
      assert.equal(got.length, want.length, `${label}: every dressing empty of the file is an object of the instance`);
      for (const d of got) {
        const n = want.find((w) => w.name === d.name);
        assert.ok(n, `${d.name} is a node of the file`);
        assert.equal(d.isMesh, false, `${d.name} is an empty`);
        assert.equal(d.userData.asset, n.extras.asset, `${d.name}: userData.asset`);
        assert.ok(z.dressing.assets.includes(d.userData.asset), `${d.name}: ${d.userData.asset} is in the allowance of ${zid}`);
        assert.equal(d.userData.node, n.extras.node, `${d.name}: userData.node`);
        const t = n.translation ?? [0, 0, 0];
        assert.ok(Math.hypot(d.pos[0] - t[0], d.pos[1] - t[1], d.pos[2] - t[2]) < 1e-3, `${d.name}: world position ${d.pos} = the file's ${t} (zone roots sit at the origin)`);
      }
      console.log(`    ${label}: ${got.map((d) => `${d.name} ${d.userData.asset}${d.userData.node ? '/' + d.userData.node : ''}`).join(', ') || '(none)'}`);
      return got.map((d) => d.name);
    } finally { await g.close(); }
  };
  let total = 0, breakables = 0;
  for (const [zid, z] of Object.entries(G.zones)) {
    const js = glbJson(G.assets[z.env]._pub);
    const placeholder = js.nodes.find((n) => n.name === z.env)?.extras?.placeholder === true;
    const names = await checkZone(z.env + (placeholder ? ' [placeholder]' : ' [final]'), z.env, zid, z, js, { asset: z.env, overlay: 0 });
    if (!(z.dressing?.assets ?? []).length) { assert.equal(names.length, 0, `${z.env}: no allowance, no empties`); continue; }
    // a placeholder zone carries two or three inst_ and one brk_; a FINAL zone carries what its artist placed
    // (inst_ wherever there is an allowance; brk_ only where the artist wanted something to break)
    assert.ok(names.some((n) => n.startsWith('inst_')), `${z.env}: inst_ empties present (${names.join(', ')})`);
    if (placeholder) assert.ok(names.some((n) => n.startsWith('brk_')), `${z.env}: a placeholder zone carries a brk_ empty`);
    total += names.length; breakables += names.filter((n) => n.startsWith('brk_')).length;
  }
  assert.ok(total >= 18, `${total} dressing empties over the six dressed zones`);
  // the brk_ path itself, whatever the artists shipped: a placeholder copy of the Tally House through the same loader
  buildPlaceholderCopies();
  const P = loadManifest(PH_OVERLAY);
  const zid = 'tally_house', env = G.zones[zid].env;
  const names = await checkZone(env + ' [placeholder copy]', env, zid, G.zones[zid], glbJson(P.assets[env]._pub), { asset: env, overlay: PH_OVERLAY_REL });
  assert.ok(names.some((n) => n.startsWith('inst_')) && names.some((n) => n.startsWith('brk_')), `the placeholder copy carries inst_ and brk_ (${names.join(', ')})`);
  console.log(`    ${total} empties in the shipped zones (${breakables} brk_)`);
});
