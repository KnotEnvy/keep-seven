// art-boss-tamper through the real loader (sandbox/viewer.html): every clip plays without a console error, the vent
// convention (+80 degrees about the bone's own X = open), and the evidence frames tamper_vents.png / tamper_cold.png.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import sharp from 'sharp';
import { ROOT, openGame, startServer } from '../harness.mjs';
import { loadManifest } from '../../tools/pipeline-lib.mjs';

const PIECE = 'art-boss-tamper';
const M = loadManifest();
let server;
before(async () => { server = await startServer({ pieces: [] }); });
after(async () => { await server.close(); });
const open = (asset, query = {}) => openGame(server, { page: 'sandbox/viewer', piece: PIECE, start: false, query: { asset, shot: 1, ...query } });

test('tamper viewer: both files load as final art; every clip holds at t = 0, 0.5, 1 with no console error', async () => {
  const game = await open('enemy_tamper');
  try {
    const out = await game.page.evaluate((clips) => {
      const dbg = window.__dbg, v = dbg.ext.viewer, rows = [];
      for (const c of clips) for (const t of [0, 0.5, 1]) {
        const r = v.setClip(c, t); dbg.step(1, true);
        const p = v.pose(['ram_head', 'pelvis']);
        rows.push([c, t, r.seconds, p.ram_head.pos, p.pelvis.pos]);
      }
      v.setClip('', 0);
      return { rows, placeholder: dbg.ext.assets.isPlaceholder ? dbg.ext.assets.isPlaceholder('enemy_tamper') : null };
    }, M.assets.enemy_tamper.animations.map((c) => c.name));
    assert.notEqual(out.placeholder, true, 'the viewer says enemy_tamper is a placeholder');
    for (const [c, t, seconds, ram, pel] of out.rows) {
      assert.ok(Math.abs(seconds - M.assets.enemy_tamper.animations.find((a) => a.name === c).seconds) < 0.04, `${c}: ${seconds} s`);
      assert.ok(ram.every(Number.isFinite) && pel.every(Number.isFinite), `${c} at ${t}`);
      assert.ok(Math.abs(pel[0]) < 0.06 && Math.abs(pel[2]) < 0.2, `${c} at ${t}: the pelvis leaves the origin column (${pel})`);
    }
    const up = out.rows.find(([c, t]) => c === 'slam_windup' && t === 1)[3], down = out.rows.find(([c, t]) => c === 'slam' && t === 1)[3];
    console.log(`viewer: ${out.rows.length} clip poses; ram_head at the top of the wind-up y ${up[1].toFixed(2)}, at the end of the slam (${down.map((x) => x.toFixed(2)).join(', ')})`);
    assert.ok(up[1] > 4.2 && down[1] < 0.1);
  } finally { await game.close(); }
  const cold = await open('tamper_cold_static');
  try { await cold.step(1, true); } finally { await cold.close(); }
});

test('tamper viewer: setBone(vent, { rot: [80, 0, 0] }) swings each lid out and up into an awning', async () => {
  const game = await open('enemy_tamper');
  try {
    const out = await game.page.evaluate(() => {
      const v = window.__dbg.ext.viewer, res = {};
      const yAxis = (q) => { const [x, y, z, w] = q; return [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)]; };   // the bone's own +Y (down the lid) in asset space
      for (const b of ['vent_chest', 'vent_back']) {
        const shut = yAxis(v.pose([b])[b].quat);
        const o = v.setBone(b, { rot: [80, 0, 0] });
        res[b] = { shut, open: yAxis(o.quat) };
        v.setBone(b, null);
      }
      return res;
    });
    const f = (a) => a.map((x) => x.toFixed(2)).join(', ');
    console.log(`lid direction (asset space, +Z = front): vent_chest shut (${f(out.vent_chest.shut)}) open (${f(out.vent_chest.open)}); vent_back shut (${f(out.vent_back.shut)}) open (${f(out.vent_back.open)})`);
    assert.ok(out.vent_chest.shut[1] < -0.9, 'the chest lid hangs down when shut');
    assert.ok(out.vent_chest.open[2] > 0.9 && out.vent_chest.open[1] > -0.3, 'the chest lid points forward when open');
    assert.ok(out.vent_back.shut[1] < -0.9, 'the back lid hangs down when shut');
    assert.ok(out.vent_back.open[2] < -0.9 && out.vent_back.open[1] > -0.3, 'the back lid points backward when open');
  } finally { await game.close(); }
});

test('tamper viewer: evidence frames tamper_vents.png and tamper_cold.png', async () => {
  const dir = path.join(ROOT, 'shots', PIECE);
  const frames = [];
  for (const [name, query, setup] of [
    ['_v_shut', { yaw: 25, pitch: 6, dist: 2.7 }, null],
    ['_v_chest', { yaw: 25, pitch: 6, dist: 2.7 }, { clip: '', t: 0, chest: 80, back: 0 }],
    ['_v_back', { yaw: 155, pitch: 8, dist: 2.7 }, { clip: '', t: 0, chest: 0, back: 80 }],
    ['_v_both', { yaw: 90, pitch: 4, dist: 3.0 }, { clip: 'stagger', t: 0.3, chest: 80, back: 80 }],
  ]) {
    const game = await open('enemy_tamper', query);
    try {
      if (setup) await game.page.evaluate((s) => {
        const v = window.__dbg.ext.viewer;
        if (s.clip) v.setClip(s.clip, s.t);
        if (s.chest) v.setBone('vent_chest', { rot: [s.chest, 0, 0] });
        if (s.back) v.setBone('vent_back', { rot: [s.back, 0, 0] });
      }, setup);
      frames.push(await game.shot(name));
    } finally { await game.close(); }
  }
  const tile = async (f) => sharp(f).resize(640, 360).toBuffer();
  await sharp({ create: { width: 1280, height: 720, channels: 3, background: '#202020' } })
    .composite(await Promise.all(frames.map(async (f, i) => ({ input: await tile(f), left: (i % 2) * 640, top: Math.floor(i / 2) * 360 }))))
    .png().toFile(path.join(dir, 'tamper_vents.png'));
  const pair = [];
  for (const [name, asset] of [['_c_cold', 'tamper_cold_static'], ['_c_hot', 'enemy_tamper']]) {
    const game = await open(asset, { yaw: 30, pitch: 8, dist: 2.7 });
    try { pair.push(await game.shot(name)); } finally { await game.close(); }
  }
  await sharp({ create: { width: 1280, height: 360, channels: 3, background: '#202020' } })
    .composite(await Promise.all(pair.map(async (f, i) => ({ input: await tile(f), left: i * 640, top: 0 }))))
    .png().toFile(path.join(dir, 'tamper_cold.png'));
  const fs = await import('node:fs');
  for (const f of [...frames, ...pair]) fs.unlinkSync(f);
  console.log('wrote shots/art-boss-tamper/tamper_vents.png (shut | chest open / back open | both open over stagger) and tamper_cold.png (cold | stained)');
});
