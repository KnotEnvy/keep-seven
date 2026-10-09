// Pass i5, the picture (both visual reviewers' major; lead rulings R4 and R18): the REAL game at 720p, measured on the
// frame a player gets. From the gate, the east yard and the yard's middle there is no figure over the tank roof (he stood
// on it, 40 to 60 px tall: shots/i5-visual-a/close_high/yd_enter.png, shots/i5-visual-b/sg_sheet.png frames 1 to 3); from
// the strip before the tally door he stands on his rock at full height, and he comes up over the rim, not on in a frame.
// One browser, one short leg. The rule's logic is in i5.test.mjs.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PNG } from 'pngjs';
import { AUDIO_DEVICE_ERROR, openGame, startServer } from '../harness.mjs';
import { marker } from './lib.mjs';

let srv;
before(async () => { srv = await startServer({}); });
after(async () => { await srv.close(); });

const T = marker('vista_dowser').params.target;
/** where his feet are in the frame just drawn, in pixels */
const feet = (game) => game.page.evaluate((t) => {
  const cam = window.__dbg.ext.core.ctx().scene.camera, e = cam.matrixWorldInverse.elements, p = cam.projectionMatrix.elements;
  const x = e[0] * t[0] + e[4] * t[1] + e[8] * t[2] + e[12], y = e[1] * t[0] + e[5] * t[1] + e[9] * t[2] + e[13], z = e[2] * t[0] + e[6] * t[1] + e[10] * t[2] + e[14];
  return { x: (p[0] * x / -z * 0.5 + 0.5) * innerWidth, y: (0.5 - p[5] * y / -z * 0.5) * innerHeight };
}, T);
/** the dark figure over his foot line: rows with pixels clearly darker than the sky of their row, in a 60 x 72 px window */
function figure(file, at) {
  const png = PNG.sync.read(fs.readFileSync(file));
  const luma = (x, y) => { const i = (y * png.width + x) * 4; return 0.2126 * png.data[i] + 0.7152 * png.data[i + 1] + 0.0722 * png.data[i + 2]; };
  const fx = Math.round(at.x), fy = Math.round(at.y);
  let top = 1e9, bottom = -1, n = 0;
  for (let y = fy - 72; y <= fy - 4; y++) {
    const bg = Math.max(luma(fx - 44, y), luma(fx + 44, y));
    for (let x = fx - 30; x <= fx + 30; x++) if (luma(x, y) < bg - 40) { n++; top = Math.min(top, y); bottom = Math.max(bottom, y); }
  }
  return { n, h: n ? bottom - top + 1 : 0, fromFeet: n ? fy - bottom : 0 };
}

test('R18, real game at 720p: no figure over the tank roof from the gate, the east yard or the yard\'s middle; from the strip before the tally door he stands full height on his rock, and he comes up over the rim', async () => {
  const game = await openGame(srv, { piece: 'i5-team-world', stubs: null, checkpoint: 'cp_yard_clear', viewport: { width: 1280, height: 720 }, ignoreConsole: AUDIO_DEVICE_ERROR });
  try {
    await game.dbg('god', true);
    const look = [T[0], T[1], T[2] + 30];                          // he is some 70 px right of the crosshair
    const at = async (x, z, steps, name) => {
      await game.page.evaluate(async ([x, z]) => { window.__dbg.teleport(x, 0, z, -90, 0); await window.__dbg.ext.core.stepAsync(2, false); }, [x, z]);
      await game.run([{ aimAt: look, steps }]);
      const file = await game.shot(name);
      const d = await game.page.evaluate(() => window.__dbg.ext.world.status().director);
      const wrap = await game.page.evaluate(() => { const o = window.__dbg.ext.core.ctx().scene.dynamic.getObjectByName('world_sighting'); return o ? { visible: o.visible, y: o.position.y } : null; });
      // the meshes of his card that the renderer would draw (visible all the way up to the scene)
      const inFrame = await game.page.evaluate(() => {
        const o = window.__dbg.ext.core.ctx().scene.dynamic.getObjectByName('world_sighting');
        let n = 0;
        if (o) o.traverse((c) => { if (!c.isMesh) return; let v = true; for (let a = c; a; a = a.parent) v = v && a.visible; if (v) n++; });
        return n;
      });
      return { fig: figure(file, await feet(game)), d, wrap, inFrame };
    };
    for (const [name, x, z] of [['gate', -78, 0], ['east', -80, -4], ['mid', -86, -3]]) {
      const r = await at(x, z, 60, 'test_' + name);
      console.log(`${name} (${x}, ${z}): up ${r.d.sightUp}, ${r.inFrame} meshes of his card drawn, wrap ${JSON.stringify(r.wrap)}`);
      assert.equal(r.d.sightUp, 0);
      // (the pump tower's lattice stands in that window from these places: the dark pixels there are not counted; what is
      // tested is that nothing of his is in the frame's draw list. The frames are shots/i5-team-world/test_<name>.png)
      assert.ok(r.inFrame === 0, `${name}: ${r.inFrame} visible meshes of his card are in the scene`);
      assert.ok(r.wrap === null || (r.wrap.visible === false && r.wrap.y < -1000), 'his card is not drawn, and the rod\'s glint is under the world with it');
    }
    // into the strip: a fifth of a second in he is part of the way up, his visible part standing ON the rim
    const rise = await at(-88, -10.5, 11, 'test_rise');
    console.log(`rising: ${rise.fig.h} px, up ${rise.d.sightUp}`);
    assert.ok(rise.d.sightUp > 0.2 && rise.d.sightUp < 0.9, `mid-rise (${rise.d.sightUp})`);
    const full = await at(-88, -10.5, 40, 'test_vista');
    console.log(`vista: ${full.fig.h} px tall, ${full.fig.fromFeet} px over the foot line, up ${full.d.sightUp}`);
    assert.ok(full.d.sightUp === 1 && full.wrap && full.wrap.visible && Math.abs(full.wrap.y - T[1]) < 0.01 && full.inFrame >= 1);
    assert.ok(full.fig.h >= 46 && full.fig.h <= 70, `standing: ${full.fig.h} px tall (about 56)`);
    assert.ok(rise.fig.h >= 4 && rise.fig.h <= full.fig.h - 8, `rising: ${rise.fig.h} px of ${full.fig.h} show over the rim`);
    assert.ok(rise.fig.fromFeet <= full.fig.fromFeet + 3, 'what shows of him ends at the rim: he does not hang in the sky');
    for (const [name, x, z] of [['door', -89, -13], ['north', -88, 5]]) {
      const r = await at(x, z, 40, 'test_' + name);
      console.log(`${name}: ${r.fig.h} px tall, up ${r.d.sightUp}`);
      assert.ok(r.d.sightUp === 1 && r.fig.h >= 46, `${name}: he stands (${r.fig.h} px)`);
    }
  } finally { await game.close(); }
});
