// Pass i6, the picture (visual reviewer b, minor): the REAL game at 720p. Six ticks after she leaves the strip before the
// tally door for the yard gate there was a man over the pump tank's rim (shots/i6-visual-b/close_low/yd_door.png: he was
// stepping down over a third of a second). Now nothing of his card is in the frame's draw list on the first frame drawn
// from the gate, the east yard or the pump. One browser, one short leg. The rule's logic is in i6.test.mjs.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { AUDIO_DEVICE_ERROR, openGame, startServer } from '../harness.mjs';
import { marker } from './lib.mjs';

let srv;
before(async () => { srv = await startServer({}); });
after(async () => { await srv.close(); });

const T = marker('vista_dowser').params.target;
/** the meshes of his card that the renderer would draw (visible all the way up to the scene), and where the card stands */
const card = (game) => game.page.evaluate(() => {
  const o = window.__dbg.ext.core.ctx().scene.dynamic.getObjectByName('world_sighting');
  let n = 0;
  if (o) o.traverse((c) => { if (!c.isMesh) return; let v = true; for (let a = c; a; a = a.parent) v = v && a.visible; if (v) n++; });
  return { n, y: o ? o.position.y : null, up: window.__dbg.ext.world.status().director.sightUp };
});

test('R18, real game at 720p: on the first frames after she leaves the strip for the gate, the east yard or the pump, nothing of the pursued man is drawn (he stood over the tank\'s rim while he stepped down)', async () => {
  const game = await openGame(srv, { piece: 'i6-team-world', stubs: null, checkpoint: 'cp_yard_clear', viewport: { width: 1280, height: 720 }, ignoreConsole: AUDIO_DEVICE_ERROR });
  try {
    await game.dbg('god', true);
    for (const [name, x, z] of [['gate', -76.8, 0.2], ['east', -80, -4], ['pump', -90, -6.5]]) {
      await game.page.evaluate(async (T) => { const d = window.__dbg; d.teleport(-88, 0, -10.5); d.aimAt(T[0], T[1], T[2]); await d.ext.core.stepAsync(40, true); }, T);
      const stood = await card(game);
      if (name === 'gate') await game.shot('test_strip');
      assert.ok(stood.up === 1 && stood.n >= 1 && Math.abs(stood.y - T[1]) < 0.01, `from the strip he stands (${JSON.stringify(stood)})`);
      for (const ticks of [1, 5]) {
        await game.page.evaluate(async ({ x, z, T, first, ticks }) => { const d = window.__dbg; if (first) d.teleport(x, 0, z); d.aimAt(T[0], T[1], T[2]); await d.ext.core.stepAsync(ticks, true); }, { x, z, T, first: ticks === 1, ticks });
        const c = await card(game);
        const at = ticks === 1 ? 1 : 6;
        await game.shot(`test_${name}_tick${at}`);
        console.log(`${name} (${x}, ${z}), tick ${at}: up ${c.up}, ${c.n} meshes of his card drawn, card at y ${c.y}`);
        assert.equal(c.up, 0, `${name}, tick ${at}`);
        assert.ok(c.n === 0 && c.y < -1000, `${name}, tick ${at}: ${c.n} visible meshes of his card are in the scene (the rod's glint is under the world with it)`);
      }
    }
  } finally { await game.close(); }
});
