// perfRun at the centre of every visibility cell, looking along eight headings, with every conditional rule on;
// assertBudget for the cell's zone (ARCHITECTURE 11.4). On the greybox the numbers are far under the bounds; the test is
// the machinery every later piece is measured with.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, assertBudget, openGame, startServer } from '../harness.mjs';
import { GATE_OPENERS, LAYOUT, MANIFEST, MiB, PIECES, STUBS } from './route.mjs';

const PIECE = 'foundation-core';
let server;
before(async () => { server = await startServer({ pieces: PIECES }); });
after(async () => { await server.close(); });

/** where each cell is reached with its conditional rules holding: the checkpoint to warp to */
const CELL_CHECKPOINT = {
  cell_lip_gully: 'cp_lip_start', cell_lip_gate: 'cp_lip_gate', cell_street: 'cp_street_clear', cell_yard_door: 'cp_tally_enter',
  cell_yard: 'cp_yard_clear', cell_tally_seam: 'cp_tally_hatch', cell_tally: 'cp_tally_hatch', cell_gallery_stair: 'cp_gallery_bay',
  cell_gallery: 'cp_file_clear', cell_hall: 'cp_hall_gantry', cell_bore: 'cp_bore_ante', cell_rim: 'cp_rim',
};
const inBox = (b, p) => p[0] >= b.min[0] && p[0] <= b.max[0] && p[1] >= b.min[1] && p[1] <= b.max[1] && p[2] >= b.min[2] && p[2] <= b.max[2];
const cellAt = (zone, p) => MANIFEST.visibility.cells.find((c) => c.zone === zone && (!c.box || inBox(c.box, p)));
/** the nav node of a cell nearest the centre of all of the cell's nodes: "the centre of the cell", on the floor */
function cellCentre(cell) {
  const zone = LAYOUT.zones.find((z) => z.id === cell.zone);
  const nodes = LAYOUT.nav.nodes.filter((n) => (n.zone === cell.zone || (n.sets?.includes(zone.set) && inBox(zone.bounds, n.pos))) && inBox(zone.bounds, n.pos) && cellAt(cell.zone, n.pos)?.id === cell.id);
  assert.ok(nodes.length > 0, `cell ${cell.id} has nav nodes`);
  const c = [0, 1, 2].map((i) => nodes.reduce((s, n) => s + n.pos[i], 0) / nodes.length);
  return nodes.reduce((best, n) => (Math.hypot(n.pos[0] - c[0], n.pos[1] - c[1], n.pos[2] - c[2]) < Math.hypot(best.pos[0] - c[0], best.pos[1] - c[1], best.pos[2] - c[2]) ? n : best));
}

test('every visibility cell is inside its computed bound and the Low caps, over eight headings', async () => {
  const game = await openGame(server, { piece: PIECE, stubs: STUBS, tier: 'low' });
  const rows = [];
  try {
    await game.dbg('god', true);
    await game.dbg('aiEnabled', false);
    for (const cell of MANIFEST.visibility.cells) {
      const cp = CELL_CHECKPOINT[cell.id];
      assert.ok(cp, `a checkpoint is listed for ${cell.id}`);
      const node = cellCentre(cell);
      // every conditional rule on: open the doors and set the flags the rules name (a rule that needs a door CLOSED
      // contradicts its twin that needs it open: the open one is the heavier, and the one the bound is computed for)
      const calls = [];
      for (const rule of cell.showIf ?? []) {
        if (rule.door && rule.state === 'not_closed') calls.push(...(GATE_OPENERS[rule.door] ?? []));
        if (rule.flag === 'hatch_powered' && rule.value !== false) calls.push(['solvePuzzle', 'daylight']);
      }
      const script = [{ call: ['checkpoint', cp] }, ...calls.map((c) => ({ call: c })), { call: ['teleport', node.pos[0], node.pos[1], node.pos[2], 0, 0] }, { steps: 2 }];
      const s = await game.run(script);
      assert.equal(s.world.cell, cell.id, `standing at ${node.id} ${JSON.stringify(node.pos)} is in ${cell.id}`);
      assert.equal(s.world.zone, cell.zone);
      for (const rule of cell.showIf ?? []) {
        if (rule.door && rule.state === 'not_closed') assert.notEqual(s.world.doors[rule.door], 'closed', `${cell.id}: ${rule.door} is open`);
        if (rule.flag && rule.value !== false) assert.ok(s.world.flags.includes(rule.flag), `${cell.id}: flag ${rule.flag}`);
      }
      const peak = await game.page.evaluate(() => {
        const dbg = window.__dbg;
        let worst = null;
        for (let h = 0; h < 8; h++) {
          dbg.setAim(h * 45, 0);
          const p = dbg.perfRun(2);
          if (!worst) worst = p;
          else for (const k of Object.keys(p)) if (typeof p[k] === 'number' && p[k] > worst[k]) worst[k] = p[k];
        }
        return worst;
      });
      assert.equal(peak.cell, cell.id);
      assertBudget(peak, { zone: cell.zone, tier: 'low' });
      assertBudget(peak, { zone: cell.zone, tier: 'low', worst: true });
      assert.ok(peak.drawCalls <= cell.budget.drawCalls.typical, `${cell.id}: ${peak.drawCalls} draw calls > the cell's ${cell.budget.drawCalls.typical}`);
      assert.ok(peak.triangles <= cell.budget.triangles, `${cell.id}: ${peak.triangles} triangles > the cell's ${cell.budget.triangles}`);
      assert.ok(peak.drawCalls > 0 && peak.triangles > 0, `${cell.id}: something was drawn`);
      rows.push({ cell: cell.id, zone: cell.zone, at: node.id, drawCalls: peak.drawCalls, boundCalls: `${cell.budget.drawCalls.typical}/${cell.budget.drawCalls.worst}`, triangles: peak.triangles, boundTriangles: cell.budget.triangles, memoryMiB: +((peak.textureBytes + peak.renderTargetBytes) / MiB).toFixed(1), visibleZones: peak.visibleZones });
    }
    fs.mkdirSync(path.join(ROOT, 'shots', PIECE), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'shots', PIECE, 'budget.json'), JSON.stringify(rows, null, 1));
    console.log('cell                 draw calls (bound typ/worst)   triangles (bound)   tex+rt MiB');
    for (const r of rows) console.log(`${r.cell.padEnd(20)} ${String(r.drawCalls).padStart(3)} (${r.boundCalls})`.padEnd(52) + `${String(r.triangles).padStart(6)} (${r.boundTriangles})`.padEnd(20) + `${r.memoryMiB}`);
  } finally { await game.close(); }
});

test('assertBudget fails a frame that is over, and the tier caps differ', () => {
  const ok = { drawCalls: 60, triangles: 50000, textureBytes: 30 * MiB, renderTargetBytes: 20 * MiB, cell: 'cell_street' };
  assertBudget(ok, { zone: 'plenty_street', tier: 'low' });
  assert.throws(() => assertBudget({ ...ok, drawCalls: 76 }, { zone: 'plenty_street', tier: 'low' }), /draw calls 76/);   // the zone's typical bound + 1 (75 since polish round 4: the yard's cartridge point)
  assertBudget({ ...ok, drawCalls: 76 }, { zone: 'plenty_street', tier: 'low', worst: true });
  assert.throws(() => assertBudget({ ...ok, drawCalls: 82 }, { zone: 'plenty_street', tier: 'low', worst: true }), /draw calls 82/);
  assert.throws(() => assertBudget({ ...ok, triangles: 115782 }, { zone: 'plenty_street', tier: 'low' }), /triangles 115782/);   // the zone's bound + 1 (115 781 since polish round 4)
  assert.throws(() => assertBudget({ ...ok, triangles: 120001 }, { tier: 'low' }), /tier cap 120000/);
  assert.throws(() => assertBudget({ ...ok, renderTargetBytes: 35 * MiB }, { zone: 'plenty_street', tier: 'low' }), /65\.0 MiB > 64/);
  assertBudget({ ...ok, drawCalls: 200, triangles: 300000, renderTargetBytes: 90 * MiB }, { tier: 'high' });
  assert.throws(() => assertBudget(ok, { zone: 'nowhere' }), /unknown zone/);
});
