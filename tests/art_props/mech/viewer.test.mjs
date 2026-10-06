// art-props-mech: every asset loads through the real asset store (sandbox/viewer.html): every manifest node and bone
// resolves, every clip is there at the manifest's length, triangles within the budget, every material resolved.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, openGame } from '../../harness.mjs';
import { MECH, PIECE } from './glb.mjs';

let server;
before(async () => { server = await startServer(); });
after(async () => { await server?.close(); });

test('every props_mech asset passes the viewer\'s check through the real loader', async () => {
  const game = await openGame(server, { page: 'sandbox/viewer', piece: PIECE, start: false });
  try {
    const problems = await game.page.evaluate(async (ids) => {
      const out = [], api = window.__dbg.ext.viewer;
      for (const id of ids) { const p = await api.check(id); if (p.length) out.push(id + ': ' + p.join(', ')); }
      return out;
    }, MECH);
    assert.deepEqual(problems, []);
    assert.deepEqual(game.consoleErrors, []);
  } finally { await game.close(); }
});
