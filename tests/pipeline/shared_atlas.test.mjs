// ONE lightmap shared by TWO zone GLBs and baked by a THIRD script, all three over one helper module, through the build
// driver: the shape of lm_surface (env_the_lip + env_plenty_street + bake_surface.py over surface_common.py; the recipe is
// in blender/env_exterior/README.md). Until this test the recipe was only written down.
//   * the three scripts arrive at one UV1 atlas without talking to each other (the helper unwraps the same list once);
//   * each zone exports only its own objects, vertex-lit with BOTH zones in the scene;
//   * editing the helper makes all three stale; rebuilding one zone alone leaves the lightmap STALE and the run says so.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { ROOT, node } from './common.mjs';
import { gltfIO } from '../../tools/pipeline-lib.mjs';

const REL = `tests/pipeline/fixtures/export/_atlas_${process.pid}`;
const DIR = path.join(ROOT, REL);
const OVERLAY = path.join(DIR, 'manifest.json');
const build = (only, ...extra) => node(['tools/build-assets.mjs', '--manifest', OVERLAY, '--only', only, ...extra]);
const ALL = 'sa_room_a,sa_room_b,lm_sa';
const params = (wallH) => fs.writeFileSync(path.join(DIR, 'src/sa_params.py'), `WALL_H = ${wallH}\n`);
const HEADER = `
import sys, os
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _d)
while not os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py")):
    if os.path.dirname(_d) == _d: raise SystemExit("blender/lib not found")
    _d = os.path.dirname(_d)
sys.path.insert(0, os.path.join(_d, "blender"))
`;

test.before(() => {
  fs.mkdirSync(path.join(DIR, 'src'), { recursive: true });
  params(2.4);
  // the helper: every lightmapped mesh of BOTH zones and their casters, the light, and ONE unwrap of the name-sorted list
  fs.writeFileSync(path.join(DIR, 'src/sa_common.py'), `
import sa_params
from lib import scene, mesh, uv, material, vcol, bake, layout

LM = "lm_sa"

def quad(name, pts, tint, region):
    bm = mesh.new_bmesh(); bm.faces.new([bm.verts.new(p) for p in pts])
    ob = mesh.new_mesh_object(name, bm)
    material.assign(ob, "m_pellam"); uv.map_to_trim(ob, None, "tx_pellam_trim", region); vcol.tint(ob, tint)
    return ob

def build():
    """-> ({'a': [objects of zone a], 'b': [...]}, every object sorted by name). Same input, same atlas, in every script."""
    scene.reset_scene()
    H = sa_params.WALL_H; zones = {}
    for tag, x0 in (("a", -4.0), ("b", 0.5)):
        floor = quad(tag + "_floor", [(x0, -2, 0), (x0 + 3.5, -2, 0), (x0 + 3.5, 2, 0), (x0, 2, 0)], "concrete", "floor")
        wall = quad(tag + "_wall", [(x0, 2, 0), (x0 + 3.5, 2, 0), (x0 + 3.5, 2, H), (x0, 2, H)], "enamel", "panel")
        mesh.tessellate_max_edge(wall, 0.7)
        zones[tag] = [floor, wall]
    everything = sorted(zones["a"] + zones["b"], key=lambda o: o.name)
    for o in everything: vcol.compose_vertex_color(o, mode='tint', jitter=0.0)
    bake.use_cycles('CPU', samples=16); bake.add_sun(layout.sun(), strength=3.0); bake.set_world((0.19, 0.24, 0.69), 1.0)
    uv.unwrap_lightmap(everything, LM, faces={o.name: (None if o.name.endswith("_floor") else []) for o in everything})
    return zones, everything
`);
  for (const tag of ['a', 'b']) {
    fs.writeFileSync(path.join(DIR, `src/sa_room_${tag}.py`), `${HEADER}
import bpy
import sa_common
from lib import scene, vcol, zone, export

def main():
    args = scene.asset_args("sa_room_${tag}.py")
    zones, everything = sa_common.build()
    vcol.bake_vertex_light([o for o in everything if o.name.endswith("_wall")], samples=32)   # both zones cast and bounce
    mine = zones["${tag}"]
    for o in everything:
        if o not in mine: bpy.data.objects.remove(o, do_unlink=True)                            # export only this zone's objects
    zone.assign_chunks(mine, "sa_room_${tag}")
    zone.merge_chunks("sa_room_${tag}")
    export.export_asset("sa_room_${tag}", args.out)

scene.run(main)
`);
  }
  fs.writeFileSync(path.join(DIR, 'src/sa_bake.py'), `${HEADER}
import sa_common
from lib import scene, bake

def main():
    zones, everything = sa_common.build()
    img, dt = bake.bake_lightmap([o for o in everything if o.name.endswith("_floor")], sa_common.LM, samples=16)
    bake.save_lightmap(img, sa_common.LM)                                                   # --out is ignored: this writes the staged path

scene.run(main)
`);
  const room = (tag, x0, x1) => ({ path: `assets/fixtures/sa_room_${tag}.glb`, source: `${REL}/src/sa_room_${tag}.py`, owner: 'fixtures', category: 'fixtures', priority: 0,
    triBudget: 300, drawCalls: 1, materials: ['m_pellam'], bake: 'LM+VL', skinned: false, nodes: [], animations: [], collision: 'none', instanced: false,
    lightmapped: true, lightmaps: ['lm_sa'], zone: `sa_zone_${tag}`, sets: [], placedBy: 'origin', pivot: 'world origin',
    placeholder: { shape: 'box', size: [3.5, 2.4, 4], anchor: 'world' },
    chunks: [{ id: `chunk_sa_${tag}`, tris: 300, materials: ['m_pellam'], drawCalls: 1, box: { min: [x0, -0.5, -2.5], max: [x1, 4.5, 2.5] } }] });
  const zoneEntry = (tag) => ({ set: 'surface', env: `sa_room_${tag}`, chunks: [`chunk_sa_${tag}`], cells: [], dressing: { tris: 0, drawCalls: 0, assets: [] }, triangles: 300, drawCalls: { typical: 1, worst: 2 } });
  fs.writeFileSync(OVERLAY, JSON.stringify({
    meta: { rawExportDir: `${REL}/raw`, publicDir: `${REL}/public` },
    assets: { sa_room_a: room('a', -4.4, -0.3), sa_room_b: room('b', 0.3, 4.4) },
    textures: { lm_sa: { path: 'assets/lm/lm_sa.webp', source: `${REL}/src/sa_bake.py`, owner: 'fixtures', kind: 'lightmap', size: [128, 128], format: 'rgba8', colorSpace: 'srgb',
      mips: false, wrap: 'clamp', sets: [], gpuBytes: 65536, lightmapScale: 2, uv: 1, neutralTexel: { px: [0, 0, 4, 4], uv: [0.015625, 0.015625], value: 1 } } },
    zones: { sa_zone_a: zoneEntry('a'), sa_zone_b: zoneEntry('b') },
  }));
});
test.after(() => { if (!process.env.KS_KEEP) fs.rmSync(DIR, { recursive: true, force: true }); });

/** UV1 of a zone's chunk mesh in the raw GLB: the lightmapped corners (off the neutral texel) and the vertex-lit ones. */
async function uv1(tag) {
  const io = await gltfIO();
  const doc = await io.read(path.join(DIR, `raw/fixtures/sa_room_${tag}.glb`));
  const node_ = doc.getRoot().listNodes().find((n) => n.getName() === `chunk_sa_${tag}__m_pellam`);
  assert.ok(node_, `sa_room_${tag}: the chunk mesh is there`);
  assert.equal(node_.getExtras().bake, 'LM'); assert.equal(node_.getExtras().lightmap, 'lm_sa');
  const acc = node_.getMesh().listPrimitives()[0].getAttribute('TEXCOORD_1');
  const lit = [], neutral = [];
  for (let i = 0; i < acc.getCount(); i++) {
    const [u, v] = acc.getElement(i, []);
    (Math.abs(u - 0.015625) < 1e-4 && Math.abs(v - 0.015625) < 1e-4 ? neutral : lit).push([u, v]);
  }
  const box = { u0: Math.min(...lit.map((p) => p[0])), u1: Math.max(...lit.map((p) => p[0])), v0: Math.min(...lit.map((p) => p[1])), v1: Math.max(...lit.map((p) => p[1])) };
  return { lit, neutral, box };
}

test('shared atlas: two zone scripts and one bake script over one helper module give one consistent lightmap', async () => {
  const r = build(ALL);
  assert.equal(r.code, 0, r.out);
  for (const id of ['sa_room_a', 'sa_room_b', 'lm_sa']) assert.match(r.out, new RegExp(`^built\\s+${id} `, 'm'), `${id} built:\n${r.out}`);
  assert.doesNotMatch(r.out, /STALE|WARNING|warning/);
  const a = await uv1('a'), b = await uv1('b');
  for (const [tag, z] of [['a', a], ['b', b]]) {
    assert.equal(z.lit.length, 4, `zone ${tag}: the floor's four corners are in the atlas`);
    assert.ok(z.neutral.length >= 8, `zone ${tag}: the wall sits on the neutral texel (${z.neutral.length} corners)`);
    assert.ok(z.box.u1 - z.box.u0 > 0.2 && z.box.v1 - z.box.v0 > 0.2, `zone ${tag}: its island has a real size`);
    assert.ok(z.box.u0 >= 0 && z.box.u1 <= 1 && z.box.v0 >= 0 && z.box.v1 <= 1);
  }
  const apart = a.box.u1 <= b.box.u0 + 1e-4 || b.box.u1 <= a.box.u0 + 1e-4 || a.box.v1 <= b.box.v0 + 1e-4 || b.box.v1 <= a.box.v0 + 1e-4;
  assert.ok(apart, `the two zones' islands do not overlap: they were unwrapped as ONE atlas (a ${JSON.stringify(a.box)}, b ${JSON.stringify(b.box)})`);
  // the third script baked light under BOTH islands (glTF v runs down, like the PNG)
  const { data, info } = await sharp(path.join(DIR, 'raw/lm/lm_sa.png')).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  for (const [tag, z] of [['a', a], ['b', b]]) {
    const x = Math.floor(((z.box.u0 + z.box.u1) / 2) * info.width), y = Math.floor(((z.box.v0 + z.box.v1) / 2) * info.height);
    const px = [0, 1, 2].map((c) => data[(y * info.width + x) * 3 + c]);
    assert.ok(Math.max(...px) > 40, `the lightmap is lit in the middle of zone ${tag}'s island (${px} at ${x},${y})`);
  }
  // the helper is an input of all three
  for (const f of ['raw/fixtures/sa_room_a.glb', 'raw/fixtures/sa_room_b.glb', 'raw/lm/lm_sa.png']) {
    const deps = JSON.parse(fs.readFileSync(path.join(DIR, f + '.deps.json'), 'utf8'));
    assert.deepEqual(deps.modules, [`${REL}/src/sa_common.py`, `${REL}/src/sa_params.py`], `${f} records the helper modules`);
  }
  const again = build(ALL);
  assert.equal(again.code, 0, again.out); assert.match(again.out, /3 items: 3 skipped/);
});

test('shared atlas: after the helper changes, a zone rebuilt alone leaves the lightmap STALE and the run says so', () => {
  params(3.0);                                                             // a change in the shared module: every atlas user is stale
  const one = build('sa_room_a');
  assert.equal(one.code, 1, one.out);
  assert.match(one.out, /^built\s+sa_room_a /m);
  assert.match(one.out, /^STALE\s+lm_sa: sa_room_a was rebuilt and its mesh 'chunk_sa_a__m_pellam' points at this lightmap/m);
  assert.match(one.out, /--only sa_room_a,lm_sa/, 'the line names the command that builds them together');
  const allowed = build('sa_room_a', '--force', '--allow-stale-lightmap');
  assert.equal(allowed.code, 0, allowed.out); assert.match(allowed.out, /^STALE\s+lm_sa: .*\n.*allowed: --allow-stale-lightmap/m);
  const all = build(ALL);
  assert.equal(all.code, 0, all.out);
  assert.match(all.out, /^skipped\s+sa_room_a/m); assert.match(all.out, /^built\s+sa_room_b /m); assert.match(all.out, /^built\s+lm_sa /m);
  assert.doesNotMatch(all.out, /STALE/);
  const fresh = build('sa_room_a', '--force');
  assert.equal(fresh.code, 0, fresh.out); assert.doesNotMatch(fresh.out, /STALE/, 'with a fresh lightmap a zone may be rebuilt alone');
});
