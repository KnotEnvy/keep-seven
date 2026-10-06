// art-enemies-bider: every asset and every clip through sandbox/viewer.html (&shot=1) with no console error.
import test from 'node:test';
import assert from 'node:assert/strict';
import { IDS, openViewer, setClip, startServer, manifest, isPlaceholder } from './bider_lib.mjs';

test('bider: the four assets and the 18 clips play in the viewer without a console error', async () => {
  const server = await startServer();
  try {
    const clips = manifest().assets.enemy_bider.animations.map((c) => c.name);
    for (const id of IDS) {
      const game = await openViewer(server, id, id === 'enemy_bider' ? { clip: 'run', t: 0.5 } : {});
      try {
        assert.equal(await isPlaceholder(game, id), false, `${id} is the final file`);
        if (id === 'enemy_bider') for (const c of clips) for (const t of [0, 0.5, 1]) { const r = await setClip(game, c, t); assert.equal(r.clip, c); await game.step(1, true); }
        else await game.step(2, true);
      } finally { await game.close(); }                     // close() fails the test on any console error
    }
  } finally { await server.close(); }
});
