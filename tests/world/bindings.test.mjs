// The build (code-world 4.1): every marker of every zone through data.bindings on the placeholders without a throw (a
// console.error fails the test), the dressing empties, each partOf hit volume on its owner's node, the jugs riding
// their hooks.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUT, MANIFEST, marker, open, server, shootScript, status } from './lib.mjs';

let srv;
before(async () => { srv = await server(); });
after(async () => { await srv.close(); });

const centre = (game, id) => game.page.evaluate((e) => { const v = { x: 0, y: 0, z: 0 }; return window.__dbg.ext.core.ctx().collision.volumeCentre(e, null, v) ? v : null; }, id);

test('every zone of every set builds: markers counted, dressing instantiated, no error', async () => {
  const game = await open(srv);
  try {
    const counts = {};
    for (const cp of ['cp_lip_start', 'cp_tally_hatch', 'cp_gallery_bay', 'cp_rim']) {
      await game.run([{ call: ['checkpoint', cp] }, { steps: 2 }]);
      Object.assign(counts, (await status(game)).markers);
      const s = await game.state();
      for (const z of s.world.builtZones) {
        const own = LAYOUT.markers.filter((m) => m.zone === z).length;
        assert.ok(counts[z] >= own, `${z}: ${counts[z]} markers built, ${own} in the layout`);
      }
    }
    console.log('markers built per zone: ' + JSON.stringify(counts));
    assert.deepEqual(Object.keys(counts).sort(), LAYOUT.zones.map((z) => z.id).sort());
    // dressing: every inst_ / brk_ empty of a zone GLB became an instance; the breakables have a hit volume
    await game.run([{ call: ['checkpoint', 'cp_street_clear'] }, { steps: 2 }]);
    const dressing = await game.page.evaluate(() => {
      const c = window.__dbg.ext.core.ctx();
      const out = [];
      for (const zone of c.scene.world.children) for (const o of zone.children) if (/^(inst|brk)_\d+$/.test(o.name)) out.push(zone.name + ':' + o.name);
      return out;
    });
    assert.ok(dressing.length > 0);
    for (const id of dressing.filter((d) => d.includes(':brk_'))) assert.ok(await centre(game, id), `${id} has a hit volume`);
  } finally { await game.close(); }
});

test('each partOf hit volume sits on its owner\'s node (latches, the cord, the bell rope, the eight ports)', async () => {
  const game = await open(srv);
  try {
    const partOf = LAYOUT.markers.filter((m) => {
      const key = m.params.interactable;
      const b = typeof key === 'string' ? MANIFEST.bindings.interactable[key] : null;
      return b && !Array.isArray(b) && b.mode === 'partOf' && b.node && (m.params.hitRadius !== undefined);
    });
    assert.ok(partOf.length >= 13, `${partOf.length} parts`);
    const bySet = { surface: 'cp_tally_enter', underground: 'cp_bore_ante' };
    for (const [set, cp] of Object.entries(bySet)) {
      await game.run([{ call: ['checkpoint', cp] }, { steps: 2 }]);
      for (const m of partOf.filter((x) => LAYOUT.zones.find((z) => z.id === x.zone).set === set)) {
        const b = MANIFEST.bindings.interactable[m.params.interactable];
        const node = await game.page.evaluate(({ owner, name }) => {
          const c = window.__dbg.ext.core.ctx();
          const root = c.scene.dynamic.getObjectByName(owner);
          if (!root) return null;
          root.updateWorldMatrix(true, true);
          let found = null;
          root.traverse((o) => { if (!found && (o.name === name || o.userData.name === name)) found = o; });
          if (!found) return null;
          const v = found.getWorldPosition(root.position.clone());
          return { x: v.x, y: v.y, z: v.z };
        }, { owner: b.owner, name: b.node });
        const v = await centre(game, m.id);
        assert.ok(node && v, `${m.id}: node ${b.node} of ${b.owner} and its volume`);
        assert.ok(Math.hypot(v.x - node.x, v.y - node.y, v.z - node.z) < 0.01, `${m.id} on ${b.owner}/${b.node}: ${JSON.stringify(v)} vs ${JSON.stringify(node)}`);
        assert.ok(Math.hypot(v.x - m.pos[0], v.y - m.pos[1], v.z - m.pos[2]) <= (b.tolerance ?? 0.06) + 1e-6, `${m.id}: the node is on its marker`);
      }
    }
  } finally { await game.close(); }
});

test('the jug hit spheres follow their hooks as the bar rises', async () => {
  const game = await open(srv);
  try {
    const stand = marker('trg_pz_jugs').params.standSpot;
    await game.run([{ call: ['teleport', stand[0], stand[1], stand[2], 90, 0] }, { steps: 2 }]);
    const hookOf = (i) => game.page.evaluate((n) => { const c = window.__dbg.ext.core.ctx(); const g = c.scene.dynamic.getObjectByName('door_jug_gate'); g.updateWorldMatrix(true, true); const h = g.getObjectByName('hook_' + n); const v = h.getWorldPosition(g.position.clone()); return { x: v.x, y: v.y, z: v.z }; }, i);
    const offsets = [];
    for (let shots = 0; shots <= 3; shots++) {
      if (shots > 0) await game.run([...shootScript('ia_jug_' + shots), { steps: 60 }]);
      const h = await hookOf(6), v = await centre(game, 'ia_jug_6');
      offsets.push([v.x - h.x, v.y - h.y, v.z - h.z]);
    }
    for (const o of offsets) for (let k = 0; k < 3; k++) assert.ok(Math.abs(o[k] - offsets[0][k]) < 1e-3, `the sphere keeps its offset from the hook: ${JSON.stringify(offsets)}`);
    const v = await centre(game, 'ia_jug_6');
    assert.ok(Math.abs(v.y - marker('ia_jug_6').pos[1] - 0.6) < 1e-3, 'three jugs: 0.6 m up');
  } finally { await game.close(); }
});
