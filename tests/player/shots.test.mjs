// The evidence frames of the order's definition of done (shots/code-player/, 960 x 540), with the few things about
// them a machine can check: the view-model is on screen and where the order puts it, the kick moves it, the reload
// and the kept round change what is drawn. A person (or a critic) opens the files.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { comparePng } from '../harness.mjs';
import { ORIGIN, ext, sandbox, server } from './common.mjs';

let srv;
before(async () => { srv = await server(); });
after(async () => { await srv.close(); });
const [OX, OY, OZ] = ORIGIN;

test('shots: course, range, the idle view-model, one shot at ticks 0, 1, 3, 6, 12, 19, 29, the reload, the readout', async () => {
  let game = await sandbox(srv, 'course');
  try {
    const [course] = await game.shotSeries([{ name: 'course', script: [{ call: ['teleport', OX + 3, OY, OZ + 12, 8, -4] }, { steps: 2 }] }]);
    assert.ok(fs.statSync(course).size > 4000);
    // climbing: on the 45 degree ramp, on the 0.35 m step, in the air over the 2 m gap
    await game.shotSeries([
      { name: 'course_ramp45', script: [{ call: ['teleport', OX - 8, OY, OZ - 4, 0, 0] }, { actions: ['forward'], steps: 50 }] },
      { name: 'course_step035', script: [{ actions: [], steps: 1 }, { call: ['teleport', OX + 5, OY, OZ - 4.5, 0, -10] }, { actions: ['forward'], steps: 14 }] },
      { name: 'course_gap', script: [{ actions: [], steps: 1 }, { call: ['teleport', OX + 14, OY + 0.6, OZ - 5.5, 0, -8] }, { actions: ['forward', 'sprint'], steps: 16 }, { tap: 'jump', steps: 14 }] },
    ]);
    await game.run([{ actions: [], steps: 60 }]);
    const s = await game.state();
    assert.ok(s.player.z - OZ < -10 && Math.abs(s.player.y - OY - 0.6) < 0.02, `the 2 m gap is cleared by a sprinting jump (z ${(s.player.z - OZ).toFixed(2)}, y ${(s.player.y - OY).toFixed(2)})`);
  } finally { await game.close(); }

  game = await sandbox(srv, 'range');
  try {
    const cov = await ext(game, 'render', 'viewModelCoverage');
    // ART_BIBLE 12 item 26: at most 18 % of the frame, never across the centre line (the stub renderer's pass; lead ruling R6,
    // the gun alone at 8 % or more, is held in the real game by place.test.mjs)
    assert.ok(cov.coverage > 0.02 && cov.coverage <= 0.18 && cov.minX >= 0.5, `the view-model covers ${(cov.coverage * 100).toFixed(1)} % of the frame, nothing left of centre (minX ${cov.minX.toFixed(2)})`);
    const files = await game.shotSeries([
      { name: 'range', script: [{ aim: [0, -2], steps: 1 }] },
      { name: 'viewmodel_idle', script: [{ aim: [20, 0], steps: 1 }] },
      // one shot: the click's tick, then 1, 3, 6, 12, 19 and 29 ticks after it
      { name: 'fire_t00', script: [{ aimAtEntity: 'dummy_kill', tap: 'fire', steps: 1 }] },
      { name: 'fire_t01', script: [{ steps: 1 }] },
      { name: 'fire_t03', script: [{ steps: 2 }] },
      { name: 'fire_t06', script: [{ steps: 3 }] },
      { name: 'fire_t12', script: [{ steps: 6 }] },
      { name: 'fire_t19', script: [{ steps: 7 }] },
      { name: 'fire_t29', script: [{ steps: 10 }] },
    ]);
    const [, idle, t00, t01, t03, t06, t12, t19, t29] = files;
    for (const f of files) assert.ok(fs.statSync(f).size > 4000, f);
    assert.ok(comparePng(idle, t03) > 0.01, 'three ticks after the click the frame has visibly moved (camera and gun kick)');
    assert.ok(comparePng(t00, t03) > 0.005, 'the kick grows after the click');
    assert.ok(comparePng(t03, t12) > 0.005, 'and recovers');
    void t01; void t06; void t19; void t29;             // (the camera's return is measured in fire.test.mjs; the clip carries the gun's own kick)
    // the reload from empty: open, three seat moments, close
    await game.dbg('setAmmo', 0, 24, 0);
    const reload = await game.shotSeries([
      { name: 'reload_series_0_dry_click', script: [{ aim: [0, -2], tap: 'fire', steps: 1 }] },
      { name: 'reload_series_1_open', script: [{ steps: 19 }] },
      { name: 'reload_series_2_round1', script: [{ steps: 19 }] },
      { name: 'reload_series_3_round3', script: [{ steps: 36 }] },
      { name: 'reload_series_4_round6', script: [{ steps: 54 }] },
      { name: 'reload_series_5_close', script: [{ steps: 16 }] },
      { name: 'reload_series_6_ready', script: [{ steps: 12 }] },
    ]);
    for (const f of reload) assert.ok(fs.statSync(f).size > 4000, f);
    const vm = await ext(game, 'player', 'viewModel');
    assert.deepEqual([vm.clip, vm.rounds, vm.keptLoop], ['idle', [1, 1, 1, 1, 1, 1], 1], 'after the reload: six round bones shown, the cuff loop holds the seventh');
    // the readout (the page with its bar)
    await game.run([{ actions: ['forward', 'sprint'], tap: 'fire', steps: 12 }]);
    await ext(game, 'core', 'damage', 30, 'lunge', 'bider');
    const readout = await game.shot('readout');
    assert.ok(fs.statSync(readout).size > 4000);
    const text = await game.page.evaluate(() => document.querySelector('#bar .readout')?.textContent ?? '');
    for (const word of ['speed', 'm/s', 'firing', '[ooooo.]', 'seventh sealed', 'spread', 'kick', 'hp 70 (34/33/3)']) assert.ok(text.includes(word), `the readout shows '${word}': ${text}`);
    await game.run([{ actions: [], steps: 1 }]);
  } finally { await game.close(); }
});

test('shots: the kept round on a mark, legal aim and illegal aim; the round bones follow the cylinder', async () => {
  const game = await sandbox(srv, 'kept');
  try {
    const marks = await ext(game, 'range', 'marks');
    const m = marks[3];
    const yaw = Math.atan2(-(m.boreX - m.markX), -(m.boreZ - m.markZ)) * 180 / Math.PI;
    await game.dbg('teleport', m.markX, m.markY, m.markZ, yaw, -8);
    await ext(game, 'range', 'setKeptContext', m);
    let vm = await ext(game, 'player', 'viewModel');
    assert.equal(vm.keptLoop, 1, 'sealed: the round is in the cuff loop');
    await game.run([{ steps: 2 }, { tap: 'kept', steps: 50 }]);
    assert.equal((await ext(game, 'player', 'viewModel')).keptLoop, 1, 'still in the loop before the thumb draws it (0.9 s)');
    const files = await game.shotSeries([
      { name: 'kept_loading', script: [{ steps: 10 }] },
      { name: 'kept_illegal', script: [{ steps: 60 }, { aim: [yaw, 2], steps: 2 }] },
      { name: 'kept_legal', script: [{ aim: [yaw, -28], steps: 2 }] },
    ]);
    for (const f of files) assert.ok(fs.statSync(f).size > 4000, f);
    vm = await ext(game, 'player', 'viewModel');
    assert.deepEqual([vm.keptLoop, vm.rounds], [0, [1, 1, 1, 1, 1, 1]], 'chambered: the loop is empty, six case heads in the cylinder');
    assert.equal((await ext(game, 'core', 'playerExtra')).keptAimLegal, true);
    // the bore volume is drawn aqua while the aim is legal and violet-grey while it is not
    const colour = () => game.page.evaluate(() => { window.__dbg.step(0, true); return window.__dbg.ext.core.ctx().scene.dynamic.getObjectByName('bore_volume').material.color.getHexString(); });
    assert.equal(await colour(), '7cf2e2');
    await game.run([{ aim: [yaw, 2], steps: 2 }]);
    assert.equal(await colour(), '8a5a9a');
    await game.run([{ aim: [yaw, -28], steps: 2 }, { tap: 'fire', steps: 4 }]);
    await game.shotSeries([{ name: 'kept_fired', script: [{ steps: 1 }] }]);
    vm = await ext(game, 'player', 'viewModel');
    assert.deepEqual([vm.clip, vm.keptLoop, vm.rounds.reduce((a, b) => a + b, 0)], ['fire_kept', 0, 5]);
    // the ring: after each lead shot one bone fewer is shown and the bones never disagree with the count
    await game.run([{ steps: 80 }]);
    for (let left = 4; left >= 0; left--) {
      await game.run([{ tap: 'fire', steps: 29 }]);
      vm = await ext(game, 'player', 'viewModel');
      assert.equal(vm.rounds.reduce((a, b) => a + b, 0), left, `${left} rounds left: ${vm.rounds}`);
    }
  } finally { await game.close(); }
});

test('the case heads of the final gun: the fired chamber empties under the hammer on the click, nothing jumps as the cylinder turns, a reload indexes the rounds in', async () => {
  const game = await sandbox(srv, 'range');
  try {
    const vm0 = await ext(game, 'player', 'viewModel');
    if (vm0.turn !== 'settle') { console.log(`view-model: the fire clip's cylinder turn is '${vm0.turn}' (not the final gun): skipped`); return; }
    assert.equal(vm0.boneStep, -1, 'the final cylinder turns clockwise seen from behind: round_6 follows round_1 under the hammer');
    // every distinct picture of the six bones over a script, in order
    const pictures = (taps, ticks) => game.page.evaluate(async ([t, n]) => {
      const d = window.__dbg, out = [];
      for (let i = 0; i < n; i++) {
        if (t[i]) d.tap(t[i]);
        await d.ext.core.stepAsync(1);
        const r = d.ext.player.viewModel().rounds.join('');
        if (out[out.length - 1] !== r) out.push(r);
      }
      return out;
    }, [taps, ticks]);
    // two shots at the cadence: one picture per shot, from the click's tick to the next click (round_2, then round_3 too)
    assert.deepEqual(await pictures({ 0: 'fire', 29: 'fire' }, 60), ['101111', '100111']);
    // a reload of two: the first goes in beside the four, the cylinder clicks round (the same heads, one notch on), the second fills it
    assert.deepEqual(await pictures({ 0: 'reload' }, 21 + 18 + 18 + 18 + 4), ['100111', '101111', '110111', '111111']);
    // an interrupted reload from empty: three in, then the picture is the logic's again
    await game.dbg('setAmmo', 0, 24, 0);
    const seen = await pictures({ 0: 'reload', 60: 'fire' }, 140);
    for (const pic of seen) assert.ok(pic.split('').filter((c) => c === '1').length <= 3, `never more heads than rounds: ${seen}`);
    const chambered = await game.page.evaluate(() => window.__dbg.ext.core.ctx().player.weapon.chambered);
    assert.equal(seen.at(-1).split('').filter((c) => c === '1').length, chambered, `at the end the heads shown are the rounds loaded (${chambered}): ${seen}`);
    assert.equal(seen.at(-1)[1], '0', 'and the chamber just fired (round_2 at the hammer) is the empty one');
  } finally { await game.close(); }
});
