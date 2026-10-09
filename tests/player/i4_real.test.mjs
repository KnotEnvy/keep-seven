// Pass i4, the two findings of the combat review, measured in the REAL game (all six systems, Low, the street):
//  (1) "camera shake on damage is too small to see": an 18 HP lunge moved the view by 0.18 degrees (two pixels at
//      720p). A hit now knocks the view away from its source by 1 to 2 degrees and back in a quarter of a second (the
//      flinch, src/player/camera.ts), and the trauma it adds is 0.55 to 0.9 (was 0.3 to 0.6).
//  (2) "a line round aimed at the chest misses the third in a file": three Biders at 8, 11 and 14 m, the aim on the
//      first one's body, freed two and struck the sand at 12.3 m. It now frees all three (src/player/shots.ts `hold`).
// Frames for the eye: shots/code-player/i4_*.png.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, startServer } from '../harness.mjs';
import { openBot } from '../e2e/lib/bot.mjs';

let srv, bot;
before(async () => {
  srv = await startServer({});
  bot = await openBot(srv, { piece: 'code-player', tier: 'low', checkpoint: 'cp_street_clear', viewport: { width: 1280, height: 720 }, allowErrors: true });
});
after(async () => { try { await bot.game.browser.close(); } catch { /* closed */ } await srv.close(); });
const save = (name, url) => { const dir = path.join(ROOT, 'shots/code-player'); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, name + '.png'), Buffer.from(url.replace(/^data:image\/png;base64,/, ''), 'base64')); };

/** One blow of `amount` from `side` of her view; per tick: how far the camera is off the aim, where a far point straight ahead is drawn, the trauma. */
function blow(amount, side, options = {}) {
  return bot.page.evaluate(async ([amount, side, options]) => {
    const d = window.__dbg, core = d.ext.core, ctx = core.ctx(), cam = ctx.scene.camera;
    for (const [k, v] of Object.entries({ reduceMotion: false, screenShake: 1, ...options })) ctx.options.set(k, v);
    d.aiEnabled(false); d.god(false); d.setHealth(100); d.setAim(-90, 0);
    await core.stepAsync(150, false);                       // any trauma and flinch of the last blow are over
    await core.stepAsync(1, true);
    const p = d.player(), aim = [p.yawDeg, p.pitchDeg];
    // facing +X: ahead +X, her right +Z. A point 50 m ahead on the aim, and where the camera draws it (pixels of a 720p frame)
    const far = [p.x + 50, p.y + 1.65, p.z];
    const drawn = () => {
      cam.updateMatrixWorld(true);
      const v = cam.matrixWorld.clone().invert().elements, x = far[0], y = far[1], z = far[2];
      const cx = v[0] * x + v[4] * y + v[8] * z + v[12], cy = v[1] * x + v[5] * y + v[9] * z + v[13], cz = v[2] * x + v[6] * y + v[10] * z + v[14];
      const t = Math.tan((cam.fov * Math.PI) / 360);
      return [(cx / -cz / t) * 360, (cy / -cz / t) * 360];  // right and up of the centre, in pixels at 720p
    };
    const fwd = () => { const e = cam.matrixWorld.elements; return [-e[8], -e[9], -e[10]]; };
    const f0 = fwd(), before = d.capture();
    const o = side === 'front' ? [p.x + 2, p.z] : side === 'right' ? [p.x, p.z + 2] : side === 'left' ? [p.x, p.z - 2] : [p.x - 2, p.z];
    const seq = d.events(0).at(-1)?.seq ?? 0;
    const applied = ctx.player.applyDamage({ amount, kind: 'lunge', source: 'bider', sourceId: 'bider#test', ammo: null, shotId: 0, ox: o[0], oy: 1, oz: o[1], dx: 0, dy: 0, dz: -1 });
    const traumaAsked = d.state().systems.render.trauma;
    const rows = []; let peakFrame = null;
    for (let i = 1; i <= 18; i++) {
      await core.stepAsync(1, true);
      const f = fwd(), px = drawn(), s = d.state().systems.player;
      rows.push({ i, off: (Math.acos(Math.max(-1, Math.min(1, f[0] * f0[0] + f[1] * f0[1] + f[2] * f0[2]))) * 180) / Math.PI, px, hurt: [s.hurtPitchDeg, s.hurtYawDeg, s.hurtRollDeg] });
      if (i === 3) peakFrame = d.capture();
    }
    const q = d.player();
    return { applied, traumaAsked, rows, aim, aimAfter: [q.yawDeg, q.pitchDeg], damaged: d.events(seq, 'player/damaged').length, before, peakFrame };
  }, [amount, side, options]);
}

test('being hit moves the view: 1.3 degrees (17 px at 720p) away from an 18 HP lunge, 2 degrees from a 38 HP slam, back on the aim in 0.25 s; the aim itself never moves', async () => {
  // an 18 HP lunge from the front: the view tips up
  let r = await blow(18, 'front');
  save('i4_hurt_front_pre', r.before); save('i4_hurt_front_peak', r.peakFrame);
  assert.deepEqual([r.applied, r.damaged], [18, 1]);
  assert.ok(r.traumaAsked >= 0.64 && r.traumaAsked <= 0.66, `trauma 0.55 .. 0.9 by damage (18 HP: 0.65): ${r.traumaAsked}`);
  let peak = r.rows.reduce((m, x) => (x.off > m.off ? x : m));
  assert.equal(peak.i, 3, 'the whole knock 0.05 s after the blow');
  assert.ok(Math.abs(peak.off - 1.2857) < 0.01, `1 + 8 / 28 degrees for 18 HP: ${peak.off}`);
  assert.ok(r.rows[0].off > 0.6, `seen on the very next frame: ${r.rows[0].off}`);
  assert.ok(peak.px[1] < -12 && Math.abs(peak.px[0]) < 0.5, `the world ahead is drawn 13 px or more lower (the view went up): ${peak.px}`);
  assert.ok(peak.hurt[0] > 1.28 && peak.hurt[1] === 0, `the snapshot reports it: ${peak.hurt}`);
  for (const row of r.rows.filter((x) => x.i >= 15)) assert.ok(row.off < 1e-4, `back on the aim by tick 15: ${row.off} at ${row.i}`);
  assert.deepEqual(r.aimAfter, r.aim, 'the stored aim (where a round goes) did not move');
  // from the right: turned to the left (the world ahead is drawn to the right of the centre) and leaned
  r = await blow(10, 'right');
  peak = r.rows.reduce((m, x) => (x.off > m.off ? x : m));
  assert.ok(Math.abs(peak.off - 1) < 0.01 && peak.px[0] > 9, `1 degree for 10 HP, to the left: ${peak.off} ${peak.px}`);
  assert.ok(peak.hurt[1] > 0.99 && peak.hurt[2] > 0.49, `yaw left and a lean: ${peak.hurt}`);
  // a 38 HP slam from the left: 2 degrees to the right
  r = await blow(38, 'left');
  save('i4_hurt_slam_pre', r.before); save('i4_hurt_slam_peak', r.peakFrame);
  peak = r.rows.reduce((m, x) => (x.off > m.off ? x : m));
  assert.ok(Math.abs(peak.off - 2) < 0.01 && peak.px[0] < -19, `2 degrees for 38 HP, to the right: ${peak.off} ${peak.px}`);
  assert.ok(r.traumaAsked >= 0.89 && r.traumaAsked <= 0.91, `${r.traumaAsked}`);
  // from behind: the view nods down
  r = await blow(18, 'behind');
  peak = r.rows.reduce((m, x) => (x.off > m.off ? x : m));
  assert.ok(peak.px[1] > 12, `down: ${peak.px}`);
  // comfort: half at 50 % screen shake; nothing at all under reduce motion
  r = await blow(18, 'front', { screenShake: 0.5 });
  assert.ok(Math.abs(r.rows.reduce((m, x) => Math.max(m, x.off), 0) - 0.6429) < 0.01);
  r = await blow(18, 'front', { reduceMotion: true });
  assert.equal(r.rows.reduce((m, x) => Math.max(m, x.off), 0), 0, 'no flinch under reduce motion');
  assert.equal(r.traumaAsked, 0, 'and no trauma');
  await bot.page.evaluate(() => { const o = window.__dbg.ext.core.ctx().options; o.set('reduceMotion', false); o.set('screenShake', 1); });
});

test('one round, one line: three Biders in a file at 8, 11 and 14 m, the aim on the first one\'s body, are all freed by one line round', async () => {
  for (const dists of [[8, 11, 14], [5, 8, 11]]) {
    const r = await bot.page.evaluate(async (dd) => {
      const d = window.__dbg, core = d.ext.core;
      d.aiEnabled(false); d.god(true); d.setAim(-90, 0); d.setAmmo(6, 24, 2);
      await core.stepAsync(40, false);
      d.tap('line'); await core.stepAsync(45, false);
      const p = d.player(), ids = [];
      for (const x of dd) ids.push(d.spawnEnemy('bider', p.x + x, 0, p.z, 90));
      await core.stepAsync(3, false);
      dd.forEach((x, k) => d.ext.enemies.place(ids[k], p.x + x, 0, p.z, 90));
      await core.stepAsync(2, false);
      d.aimAtEntity(ids[0], 'body'); await core.stepAsync(1, false); d.aimAtEntity(ids[0], 'body');
      const seq = d.events(0).at(-1)?.seq ?? 0, pitch = d.player().pitchDeg, cyl = d.player().cylinder[0];
      d.tap('fire'); await core.stepAsync(1, false);
      const holding = d.state().systems.player.lineHolding;
      await core.stepAsync(9, true);
      const frame = d.capture();
      await core.stepAsync(40, false);
      const ev = d.events(seq);
      return {
        ids, pitch, cyl, holding, frame, fired: ev.find((e) => e.name === 'weapon/fired').payload,
        hits: ev.filter((e) => e.name === 'combat/hit').map((e) => [e.payload.entityId, e.payload.outcome, e.payload.y]),
        resolved: ev.find((e) => e.name === 'combat/line_resolved').payload,
      };
    }, dists);
    save('i4_line_' + dists.join('_'), r.frame);
    assert.equal(r.cyl, 'line');
    assert.ok(r.pitch < -7, `the aim slopes down at a body 0.6 m up: ${r.pitch}`);
    assert.equal(r.holding, true);
    assert.deepEqual(r.hits.slice(0, 3).map((h) => [h[0], h[1]]), r.ids.map((id) => [id, 'freed']), 'the three of the file, near to far');
    assert.deepEqual([r.resolved.bodies, r.resolved.freed], [3, 3], `it was 2 of 3 at 8 / 11 / 14 m and 1 of 3 at 5 / 8 / 11 m: ${JSON.stringify(r.resolved)}`);
    for (const h of r.hits.slice(0, 3)) assert.ok(Math.abs(h[2] - r.hits[0][2]) < 1e-6 && h[2] > 0.5 && h[2] < 0.8, `each at the first one's chest height: ${h[2]}`);
    assert.ok(Math.abs(r.fired.endY - r.hits[0][2]) < 1e-6, 'weapon/fired ends at the first body; the level run is drawn from there');
    await bot.game.step(150);
  }
});
