// boss_windlass and proj_canister through the real loader (sandbox/viewer.html): every clip, the lamp sets, the bones code
// drives. Writes shots/art-boss-windlass/windlass_game_*.png (piece art-boss-windlass; order art-boss 5).
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, openGame } from '../harness.mjs';
import { M } from './windlass_lib.mjs';

const PIECE = 'art-boss-windlass';
let server;
before(async () => { server = await startServer({ pieces: [] }); });
after(async () => { await server?.close(); });

test('viewer: boss_windlass is final, resolves every node, plays every clip at the manifest\'s length; lamp sets cycle', async () => {
  const game = await openGame(server, { page: 'sandbox/viewer', piece: PIECE, start: false, query: { asset: 'boss_windlass' } });
  try {
    await game.step(2, true);
    const panel = await game.page.evaluate(() => document.getElementById('panel').textContent);
    assert.ok(panel.includes('[final]') && !panel.includes('MISSING'), panel);
    assert.ok(panel.includes('m_prop:tx_palette'), panel);
    const problems = await game.page.evaluate(() => window.__dbg.ext.viewer.check ? window.__dbg.ext.viewer.check('boss_windlass') : []);
    assert.deepEqual(problems ?? [], []);
    const seen = new Set();
    for (let i = 0; i < 6; i++) {
      await game.page.evaluate(() => { for (let k = 0; k < 31; k++) window.__dbg.step(1, true); });
      const line = await game.page.evaluate(() => document.body.innerText.split('\n').find((l) => l.startsWith('lamps ')) ?? '');
      const m = /boss_lamps (\d+)\/14\s+gauge (\d+)\/26/.exec(line);
      assert.ok(m, `the lamp line: '${line}'`);
      seen.add(m[1] + '/' + m[2]);
    }
    assert.ok(seen.size >= 4, `the lamp sets cycle (${[...seen].join(' ')})`);
    for (const a of M.assets.boss_windlass.animations) {
      const r = await game.page.evaluate(([name]) => window.__dbg.ext.viewer.setClip(name, 0.5), [a.name]);
      assert.ok(Math.abs(r.seconds - a.seconds) <= 1 / 30 + 1e-6, `${a.name}: authored ${r.seconds} s, manifest ${a.seconds} s`);
      await game.step(1, true);
    }
  } finally { await game.close(); }
});

test('viewer: the bones code drives turn the right way; sockets ride the right bones', async () => {
  const game = await openGame(server, { page: 'sandbox/viewer', piece: PIECE, start: false, query: { asset: 'boss_windlass', shot: 1, yaw: 0, pitch: 4 } });
  try {
    const r = await game.page.evaluate(() => {
      const v = window.__dbg.ext.viewer, names = ['knot_1_hit', 'knot_2_hit', 'muzzle_top', 'pawl_r_hit', 'thread_anchor_1', 'canister_muzzle'];
      const rest = v.pose(names);
      v.setBone('drum_spin', { rot: [0, 0, 60] });
      const spun = v.pose(names);
      v.setBone('drum_spin', null); v.setBone('arm_yaw', { rot: [0, 60, 0] });
      const yawed = v.pose(names);
      v.setBone('arm_yaw', null); v.setBone('knot_1', { scale: [1, 1, 0.5] });
      const squashed = v.pose(['knot_1_hit', 'knot_1']);
      v.setBone('knot_1', null);
      v.setClip('mouth_open', 1);
      const open = v.pose(['knot_1_hit', 'thread_anchor_1', 'mouth_1']);
      v.setClip('', 0);
      return { rest, spun, yawed, squashed, open };
    });
    const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    // drum_spin +60 degrees about its local Z (counter-clockwise seen from the front): mouth 2 comes to the top (where knot 1 was); the muzzle and the pawl stay
    assert.ok(d(r.spun.knot_2_hit.pos, r.rest.knot_1_hit.pos) < 0.01, `knot_2_hit after the spin: ${r.spun.knot_2_hit.pos}`);
    assert.ok(d(r.spun.muzzle_top.pos, r.rest.muzzle_top.pos) < 1e-6 && d(r.spun.pawl_r_hit.pos, r.rest.pawl_r_hit.pos) < 1e-6, 'muzzle_top and pawl_r_hit do not spin');
    // arm_yaw +60 degrees about Y: everything swings round the bore axis
    const m = r.rest.muzzle_top.pos, y = r.yawed.muzzle_top.pos, c = Math.cos(Math.PI / 3), s = Math.sin(Math.PI / 3);
    assert.ok(d(y, [m[0] * c + m[2] * s, m[1], -m[0] * s + m[2] * c]) < 0.01, `muzzle_top after the yaw: ${y}`);
    assert.ok(d(r.squashed.knot_1_hit.pos, r.rest.knot_1_hit.pos) < 1e-6, 'squashing knot_1 leaves knot_1_hit where it was');
    assert.ok(d(r.open.knot_1_hit.pos, r.rest.knot_1_hit.pos) < 1e-6 && d(r.open.thread_anchor_1.pos, r.rest.thread_anchor_1.pos) < 1e-6, 'opening the lid moves neither knot_1_hit nor thread_anchor_1');
    await game.shot('windlass_game_front');
  } finally { await game.close(); }
});

for (const [name, query] of [
  ['windlass_game_L5', { asset: 'boss_windlass', shot: 1, yaw: 25, pitch: 8, mood: 'L5' }],
  ['windlass_game_back', { asset: 'boss_windlass', shot: 1, yaw: 160, pitch: 10, dist: 14 }],
  ['windlass_game_open', { asset: 'boss_windlass', shot: 1, yaw: 10, pitch: -2, dist: 9, clip: 'mouth_open', t: 1 }],
  ['windlass_game_sag', { asset: 'boss_windlass', shot: 1, yaw: 80, pitch: 5, clip: 'sag_death', t: 1 }],
  ['canister_game', { asset: 'proj_canister', shot: 1, yaw: 30, pitch: 15 }],
]) {
  test(`viewer shot ${name}: draws without a console error`, async () => {
    const game = await openGame(server, { page: 'sandbox/viewer', piece: PIECE, start: false, query });
    try { await game.shot(name); } finally { await game.close(); }
  });
}
