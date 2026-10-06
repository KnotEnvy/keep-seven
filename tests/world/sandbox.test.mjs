// The world sandbox (code-world 5): it boots under ?test=1 on each scene and draws a frame; after a scripted run the
// panel lists the story as it would play (screenshot with the DOM: shots/code-world/sandbox_story_panel.png).
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { marker, open, server, takeRound } from './lib.mjs';

let srv;
before(async () => { srv = await server(); });
after(async () => { await srv.close(); });

test('each scene boots and draws a frame', async () => {
  for (const scene of ['surface', 'seam', 'underground', 'coda']) {
    const game = await open(srv, { page: 'sandbox/world', start: false, query: { scene } });
    try {
      const f = await game.dbg('perfRun', 1);
      assert.ok(f.drawCalls > 0, `${scene}: something drawn`);
      const s = await game.state();
      assert.equal(s.game, 'playing');
      const want = { surface: 'surface', seam: 'surface', underground: 'underground', coda: 'coda' }[scene];
      assert.equal(s.world.set, want);
      if (scene === 'seam') assert.ok(s.world.builtZones.includes('the_gallery'));
    } finally { await game.close(); }
  }
});

test('the story panel after a scripted run', async () => {
  const game = await open(srv, { page: 'sandbox/world', start: false, query: { scene: 'surface' } });
  try {
    await game.run([{ call: ['god', true] }, { steps: 700 }, { call: ['solvePuzzle', 'seven_jugs'] }, { steps: 400 }]);
    await game.run([{ call: ['checkpoint', 'cp_tally_enter'] }, { steps: 700 }, { call: ['clearEncounter', 'enc_tally'] }, { steps: 700 }]);
    await game.run([{ call: ['checkpoint', 'cp_bore_ante'] }, { steps: 200 }, { call: ['solvePuzzle', 'the_asking'] }, { steps: 500 }]);
    await game.run([{ call: ['checkpoint', 'cp_rim'] }, { steps: 120 }]);
    const stone = marker('trg_stone'), round = marker('ia_stone_round');
    await game.run([{ call: ['teleport', stone.pos[0], stone.pos[1], stone.pos[2], 90, 0] }, { steps: 5 }, ...takeRound(round)]);
    await game.until({ event: 'ending/card' }, 80 * 60);
    await game.step(30, true);
    const text = await game.page.evaluate(() => document.getElementById('panel').textContent);
    assert.ok(text.includes('ENDING') && text.includes('NARRATOR'), text);
    await game.page.screenshot({ path: game.shotDir() + '/sandbox_story_panel.png' });
  } finally { await game.close(); }
});
