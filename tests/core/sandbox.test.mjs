// The sandbox scaffold (core's own page), the six piece pages' boot, the dummy player in a test-built room, the viewer.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, openGame, startServer } from '../harness.mjs';
import { MANIFEST, PIECES } from './route.mjs';

const PIECE = 'foundation-core';
let server;
before(async () => { server = await startServer({ pieces: PIECES }); });
after(async () => { await server.close(); });

// The scaffold itself, on core's own page (sandbox/core.html): the six piece pages are free to replace their scenes.
test('sandbox/core.html: the layout scene, the room scene, the button bar', async () => {
  let game = await openGame(server, { page: 'sandbox/core', piece: PIECE, start: false });
  try {
    let s = await game.state();
    assert.equal(s.game, 'playing');
    assert.equal(s.world.checkpoint, 'cp_lip_start');
    assert.equal(await game.page.evaluate(() => document.querySelectorAll('#bar button').length >= 2), true, 'the button bar lists the scenes');
    await game.run([{ aim: [0, -8], actions: ['forward'], steps: 90 }, { actions: [], steps: 1 }]);
    s = await game.state();
    assert.ok(s.player.z < 103, 'the dummy player walks');
    const file = await game.shot('sandbox_core');
    assert.ok(fs.statSync(file).size > 2000);
  } finally { await game.close(); }
  game = await openGame(server, { page: 'sandbox/core', piece: PIECE, start: false, query: { scene: 'room' } });
  try {
    // the test room: a floor to stand on, a 0.35 m step she climbs and a 0.5 m step she does not
    const s = await game.run([{ steps: 5 }, { walkTo: [5, -9.2], maxTicks: 400 }]);
    assert.equal(s.player.grounded, true);
    assert.ok(Math.abs(s.player.y - 500.35) < 0.02, `on the 0.35 m step (y ${s.player.y})`);
    const r = await game.walkTo(8, -8, { maxTicks: 300 });
    assert.equal(r.reason, 'stuck', 'the 0.5 m step is too high');
    const perf = await game.dbg('perfRun', 2);
    assert.ok(perf.drawCalls >= 1 && perf.drawCalls < 10, `only the room is drawn (${perf.drawCalls} calls)`);
  } finally { await game.close(); }
});

// The six piece pages belong to their pieces from phase 3 (scenes, buttons and systems are theirs). Core holds them to
// one thing only: the page boots under ?test=1 to a ready hook and draws a frame. Each owner keeps their own green.
// A page that is still core's scaffold runs beside core's stand-in for its system unless KEEP7_REAL names the slot. A page
// its owner has rewritten is loaded only when KEEP7_REAL names it (or is `all`): a page somebody is in the middle of
// writing must not fail five other builders' `node --test tests/core/`.
for (const piece of ['player', 'enemies', 'render', 'world', 'ui', 'audio']) {
  const scaffold = fs.readFileSync(path.join(ROOT, 'sandbox', piece + '.ts'), 'utf8').includes('INITIAL SCAFFOLD written by foundation-core');
  const named = PIECES === 'all' || PIECES.includes(piece);
  const skip = scaffold || named ? false : `sandbox/${piece}.ts is its owner's now and KEEP7_REAL does not name '${piece}'`;
  test(`sandbox/${piece}.html boots under ?test=1 and draws a frame (the page's owner keeps this green)`, { skip }, async () => {
    const game = await openGame(server, { page: 'sandbox/' + piece, piece: PIECE, start: false });
    try {
      await game.step(3, true);
      const perf = await game.perf();
      assert.ok(perf.drawCalls >= 1, 'a frame was drawn');
      const file = await game.shot('sandbox_' + piece);
      assert.ok(fs.statSync(file).size > 2000);
    } finally { await game.close(); }
  });
}

// A room a test builds itself (__dbg.ext.sandbox.room): a 33.7 degree stair ramp (the hatch stair's slope) beside a 2 m
// floor slab 0.3 m thick, and a 9.5 degree one beside a solid 1 m platform, so the height of the
// ledge above her feet is whatever the test picks; a 0.15 m slab to walk along; a low ceiling and a 0.5 m step to jump at.
const STEP_ROOM = [
  { shape: 'box', pos: [0, -0.5, 0], size: [40, 1, 40], rotY: 0, surface: 'stone', role: 'floor' },
  { shape: 'ramp', pos: [0, 0.5, -6], size: [2, 1, 6], rotY: 0, surface: 'wood', role: 'stairs', rise: '-z', skirt: 0 },
  { shape: 'box', pos: [3, 0.5, -6], size: [4, 1, 6], rotY: 0, surface: 'stone', role: 'platform' },
  { shape: 'ramp', pos: [-14, 2, -6], size: [2, 4, 6], rotY: 0, surface: 'wood', role: 'stairs', rise: '-z', skirt: 0 },
  { shape: 'box', pos: [-11, 1.85, -6], size: [4, 0.3, 6], rotY: 0, surface: 'wood', role: 'floor' },   // a 0.3 m floor slab, open underneath (the Tally House floor over the hatch stair)
  { shape: 'box', pos: [10, 0.075, -6], size: [4, 0.15, 6], rotY: 0, surface: 'metal', role: 'platform' },
  { shape: 'box', pos: [-8, 2.35, 4], size: [4, 0.3, 4], rotY: 0, surface: 'stone', role: 'platform' },
  { shape: 'box', pos: [-8, 0.25, -6], size: [3, 0.5, 3], rotY: 0, surface: 'metal', role: 'platform' },
];
const openStepRoom = async () => {
  const game = await openGame(server, { page: 'sandbox/core', piece: PIECE, start: false, query: { scene: 'room' } });
  await game.page.evaluate((solids) => window.__dbg.ext.sandbox.room(solids, [0, 0, 6], 0), STEP_ROOM);
  return game;
};

test('dummyPlayer: a ledge is climbed only when it is at most 0.35 m above her feet, also from a ramp', async () => {
  const game = await openStepRoom();
  try {
    const rows = await game.page.evaluate(() => {
      const dbg = window.__dbg, O = 500;
      const out = [];
      // two ramps rising toward -z, each with a platform on its +x side: [ramp centre x, platform top, ramp rise per metre]
      for (const [name, rampX, top, slope] of [['9.5 deg', 0, 1, 1 / 6], ['33.7 deg', -14, 2, 4 / 6]]) {
        for (const ledge of [0.6, 0.5, 0.45, 0.4, 0.38, 0.3, 0.2, 0.1]) {
          for (const yaw of [-90, -70, -110]) {
            // the ramp's surface is `ledge` under the platform top here
            const z = -3 - (top - ledge) / slope;
            dbg.teleport(rampX, O + (top - ledge) + 0.05, z, yaw, 0);
            dbg.step(6, false);
            const y0 = dbg.player().y;
            dbg.setActions(['forward']);
            let maxRise = 0, last = y0;
            for (let i = 0; i < 30; i++) { dbg.step(1, false); const y = dbg.player().y; if (y - last > maxRise) maxRise = y - last; last = y; }   // 2.5 m: onto the platform, not across it
            dbg.setActions([]);
            const p = dbg.player();
            out.push({ ramp: name, ledge, yaw, top, feet: +(y0 - O).toFixed(3), x: +(p.x - rampX).toFixed(3), y: +(p.y - O).toFixed(3), maxRise: +maxRise.toFixed(3), onTop: p.x - rampX > 1.2 && Math.abs(p.y - O - top) < 0.02 });
          }
        }
      }
      return out;
    });
    for (const r of rows) {
      const text = JSON.stringify(r);
      assert.ok(r.maxRise <= 0.39, `no tick lifts her more than the step height (plus the ramp under her): ${text}`);
      // the ledge above her real feet (a capsule rides a few millimetres above a slope). At yaw -70 she also walks up
      // the ramp along the wall until the ledge is low enough, so only the per-tick rise is held there
      // (and at -110 she walks down it, away from a ledge she could climb).
      const above = r.top - r.feet;
      if (above > 0.375 && r.yaw !== -70) assert.equal(r.onTop, false, `a ${above.toFixed(3)} m ledge must stop her: ${text}`);
      if (above < 0.345 && r.yaw === -90) assert.equal(r.onTop, true, `a ${above.toFixed(3)} m ledge is a step: ${text}`);
    }
    console.log('step-up: ledge above the feet -> climbed (yaw -90): ' + rows.filter((r) => r.yaw === -90).map((r) => `${r.ramp} ${(r.top - r.feet).toFixed(3)} ${r.onTop ? 'yes' : 'no'}`).join(', ') + `; largest single-tick rise ${Math.max(...rows.map((r) => r.maxRise))} m`);
  } finally { await game.close(); }
});

test('dummyPlayer: walking along and onto a low slab never leaves the capsule inside it', async () => {
  const game = await openStepRoom();
  try {
    const rows = await game.page.evaluate(() => {
      const dbg = window.__dbg, core = dbg.ext.core, O = 500;
      const out = [];
      // the slab's west edge is x = 8; start beside it and graze it at many angles, both ways along the edge
      for (const along of [0, 180]) {
        for (const inward of [1, 3, 6, 10, 15, 25, 40, 60, 85]) {
          for (const start of [7.4, 7.6, 7.64]) {
            const yaw = along === 0 ? -inward : 180 + inward;
            dbg.teleport(start, O, along === 0 ? -3.5 : -8.5, yaw, 0);
            dbg.step(3, false);
            dbg.setActions(['forward']);
            let inside = 0, worst = '';
            for (let i = 0; i < 70; i++) {
              dbg.step(1, false);
              const p = dbg.player();
              // a slimmer, shorter capsule lifted 8 cm: not free means the real one is centimetres inside a solid
              if (!core.capsuleFree(p.x, p.y + 0.08, p.z, 0.27, 1.6)) { inside++; worst = `(${p.x}, ${(p.y - O).toFixed(3)}, ${p.z})`; }
            }
            dbg.setActions([]);
            if (inside) out.push({ along, inward, start, inside, worst });
          }
        }
      }
      return out;
    });
    assert.deepEqual(rows, [], 'ticks spent inside the slab');
  } finally { await game.close(); }
});

test('dummyPlayer: jump rises about 0.88 m, a ceiling stops the rise, and a jump clears the 0.5 m step', async () => {
  const game = await openStepRoom();
  try {
    const r = await game.page.evaluate(() => {
      const dbg = window.__dbg, O = 500;
      const hop = (x, z, hold, ticks = 90) => {
        dbg.teleport(x, O, z, 0, 0);
        dbg.step(3, false);
        dbg.setActions(hold);
        dbg.tap('jump');
        let top = 0, air = 0, landed = -1;
        for (let i = 0; i < ticks; i++) {
          dbg.step(1, false);
          const p = dbg.player();
          if (p.y - O > top) top = p.y - O;
          if (!p.grounded) air++; else if (air > 0 && landed < 0) landed = i;
        }
        dbg.setActions([]);
        const p = dbg.player();
        return { top: +top.toFixed(3), air, landed, y: +(p.y - O).toFixed(3), z: +p.z.toFixed(3), grounded: p.grounded };
      };
      return {
        open: hop(4, 6, []),                       // nothing overhead
        ceiling: hop(-8, 4, []),                   // the slab's underside is 2.2 m up: 0.4 m of head room
        ontoStep: hop(-8, -3.6, ['forward'], 40),  // the 0.5 m step's near face is z = -4.5, its far edge z = -7.5
        held: (() => { dbg.teleport(4, O, 6, 0, 0); dbg.step(3, false); dbg.setActions(['jump']); let hops = 0, was = true; for (let i = 0; i < 200; i++) { dbg.step(1, false); const g = dbg.player().grounded; if (was && !g) hops++; was = g; } dbg.setActions([]); return hops; })(),
      };
    });
    assert.ok(Math.abs(r.open.top - 0.88) < 0.06 && r.open.grounded && r.open.y === 0, `a free jump: ${JSON.stringify(r.open)}`);
    assert.ok(r.open.air >= 28 && r.open.air <= 36, `about 0.54 s in the air (${r.open.air} ticks)`);
    assert.ok(r.ceiling.top > 0.3 && r.ceiling.top <= 0.41 && r.ceiling.grounded && r.ceiling.y === 0, `the ceiling stops the rise: ${JSON.stringify(r.ceiling)}`);
    assert.ok(r.ceiling.air < r.open.air - 6, 'and she comes straight back down');
    assert.ok(r.ontoStep.grounded && Math.abs(r.ontoStep.y - 0.5) < 0.02 && r.ontoStep.z < -4.5, `lands on the step: ${JSON.stringify(r.ontoStep)}`);
    assert.equal(r.held, 1, 'jump is a press, not a hold');
  } finally { await game.close(); }
});

test('viewer ?asset=: nodes, clips with manifest seconds, budget numbers and the placeholder flag', async () => {
  const id = 'ia_bore_door';
  const game = await openGame(server, { page: 'sandbox/viewer', piece: PIECE, start: false, query: { asset: id } });
  try {
    await game.step(2, true);
    const def = MANIFEST.assets[id];
    const panel = await game.page.evaluate(() => document.getElementById('panel').textContent);
    assert.ok(panel.includes(id) && (panel.includes('[PLACEHOLDER]') || panel.includes('[final]')), panel);
    assert.ok(panel.includes(`budget ${def.triBudget}`) && panel.includes(`draw-call budget ${def.drawCalls}`), panel);
    assert.ok(panel.includes(`manifest ${def.skinned}`), panel);
    assert.ok(!panel.includes('MISSING'), panel);
    const labels = await game.page.evaluate(() => Array.from(document.querySelectorAll('.label3d')).map((e) => e.textContent));
    assert.deepEqual(labels.slice().sort(), def.nodes.slice().sort(), 'every manifest node has a label');
    const buttons = await game.page.evaluate(() => Array.from(document.querySelectorAll('#bar button')).map((e) => e.textContent));
    for (const a of def.animations) assert.ok(buttons.some((b) => b.startsWith(`${a.name} ${a.seconds.toFixed(2)}s`)), `a clip button for ${a.name}`);
    // the asset is framed in the area the panel and the bar leave free: no label sits under the panel
    const layout = await game.page.evaluate(() => {
      const p = document.getElementById('panel').getBoundingClientRect(), b = document.getElementById('bar').getBoundingClientRect();
      return { panelBottom: p.bottom, barTop: b.top, labels: Array.from(document.querySelectorAll('.label3d')).map((e) => ({ name: e.textContent, y: parseFloat(e.style.top) })) };
    });
    for (const l of layout.labels) assert.ok(l.y > layout.panelBottom && l.y < layout.barTop, `label ${l.name} at y ${l.y} is between the panel (${layout.panelBottom}) and the bar (${layout.barTop})`);
    // a placeholder file gets no textures; a final one binds the shared texture of each material
    assert.ok(panel.includes('materials  m_prop') && (panel.includes('[final]') ? panel.includes('m_prop:tx_palette') : panel.includes('(placeholder: no textures)')), panel);
    await game.shot('viewer_asset');
  } finally { await game.close(); }
});

test('viewer: every manifest asset loads, resolves every node and plays every clip at the manifest\'s length', async () => {
  const game = await openGame(server, { page: 'sandbox/viewer', piece: PIECE, start: false });
  try {
    const problems = await game.page.evaluate(async () => {
      // the index page exposes nothing special: this goes through the debug registry the viewer shares with tests
      const out = [];
      const api = window.__dbg.ext.viewer;
      for (const id of api.assetIds()) { const p = await api.check(id); if (p.length) out.push(id + ': ' + p.join(', ')); }
      return out;
    });
    assert.deepEqual(problems, []);
  } finally { await game.close(); }
});

test('viewer ?asset=&shot=1&clip=&t=: one deterministic frame', async () => {
  const shoot = async (name) => {
    const game = await openGame(server, { page: 'sandbox/viewer', piece: PIECE, start: false, query: { asset: 'enemy_bider', shot: 1, clip: 'run', t: 0.5, yaw: 20, pitch: 10 } });
    try {
      assert.equal(await game.page.evaluate(() => document.querySelectorAll('.label3d').length), 0, 'no labels in a shot');
      const [file] = await game.shotSeries([{ name }]);
      return fs.readFileSync(file);
    } finally { await game.close(); }
  };
  const a = await shoot('viewer_shot_a'), b = await shoot('viewer_shot_b');
  assert.ok(a.equals(b), 'two loads give the same bytes');
});

test('viewer ?zone=: the zone on its real colliders with the visibility-cells toggle', async () => {
  const game = await openGame(server, { page: 'sandbox/viewer', piece: PIECE, start: false, query: { zone: 'plenty_street' } });
  try {
    let s = await game.run([{ aim: [70, -5], steps: 3 }]);
    assert.equal(s.game, 'playing');
    assert.equal(s.world.zone, 'plenty_street');
    assert.equal(s.player.grounded, true);
    const withCells = await game.dbg('perfRun', 2);
    await game.page.evaluate(() => Array.from(document.querySelectorAll('#bar button')).find((b) => b.textContent.startsWith('cells')).click());
    const everything = await game.dbg('perfRun', 2);
    assert.ok(everything.visibleZones >= withCells.visibleZones);
    assert.ok(everything.visibleZones === 3, 'cells off: every zone of the resident set is drawn');
    await game.page.evaluate(() => Array.from(document.querySelectorAll('#bar button')).find((b) => b.textContent.startsWith('cells')).click());
    const panel = await game.page.evaluate(() => document.getElementById('panel').textContent);
    assert.ok(panel.includes('plenty_street') && panel.includes('env_plenty_street') && panel.includes('lm_surface'), panel);
    s = await game.run([{ actions: ['forward'], steps: 60 }, { actions: [], steps: 1 }]);
    assert.equal(s.player.grounded, true, 'a walk camera on the real colliders');
    await game.shot('viewer_zone');
  } finally { await game.close(); }
});

// ---- round 2 -----------------------------------------------------------------------------------------------------
// THE VIEW-MODEL RULE (FOUNDATION_REPORT 5): children of ctx.scene.viewModel are in camera space; the render system
// gives the group the world camera's pose before its 52 degree pass; nobody else transforms the group.
test('view-model: a camera-space gun added to scene.viewModel is drawn by the second pass wherever the camera is', async () => {
  const game = await openGame(server, { page: 'sandbox/core', piece: PIECE, start: false, query: { scene: 'room' } });
  try {
    const out = await game.page.evaluate(async () => {
      const dbg = window.__dbg, ctx = dbg.ext.core.ctx();
      const before = dbg.perfRun(1);
      await dbg.ext.sandbox.activate(['weapon_revolver']);
      const inst = ctx.assets.instantiate('weapon_revolver');
      let meshes = 0;
      inst.root.traverse((o) => { if (o.isMesh) meshes++; });
      ctx.scene.viewModel.add(inst.root);                       // exactly as code-player does it: no transform of the group
      const sample = () => {
        const perf = dbg.perfRun(1);
        const m = inst.node('muzzle').getWorldPosition(ctx.scene.camera.position.clone());
        const cam = ctx.scene.camera.position;
        return { calls: perf.drawCalls, tris: perf.triangles, muzzle: dbg.ext.render.viewModelProject(m.x, m.y, m.z), cover: dbg.ext.render.viewModelCoverage(), muzzleFromCamera: Math.hypot(m.x - cam.x, m.y - cam.y, m.z - cam.z) };
      };
      const here = sample();
      // turn and walk: the gun stays where it is on screen
      dbg.setAim(137, -20); dbg.setActions(['forward']); dbg.step(40, false); dbg.setActions([]);
      const there = sample();
      return { before: { calls: before.drawCalls, tris: before.triangles }, meshes, here, there };
    });
    assert.equal(out.here.calls, out.before.calls + out.meshes, `the gun's ${out.meshes} meshes are drawn (${out.before.calls} -> ${out.here.calls} calls)`);
    assert.equal(out.meshes, 2);
    assert.ok(out.here.tris > out.before.tris);
    for (const s of [out.here, out.there]) {
      assert.ok(s.muzzle.inFront && s.muzzle.x > 0.5 && s.muzzle.x < 1 && s.muzzle.y > 0 && s.muzzle.y < 0.5, `the muzzle is on screen, right of centre and below it (${JSON.stringify(s.muzzle)})`);
      assert.ok(s.cover.coverage > 0.01 && s.cover.coverage < 0.5, `coverage ${s.cover.coverage}`);
      assert.ok(s.muzzleFromCamera > 0.3 && s.muzzleFromCamera < 1.0, `the muzzle is ${s.muzzleFromCamera} m from the camera`);
    }
    assert.ok(Math.abs(out.here.muzzle.x - out.there.muzzle.x) < 1e-6 && Math.abs(out.here.muzzle.y - out.there.muzzle.y) < 1e-6, 'the same place on screen after turning and walking');
    assert.ok(Math.abs(out.here.cover.coverage - out.there.cover.coverage) < 1e-3, 'the same coverage (to a few edge pixels)');
    console.log(`view-model: ${out.before.calls} -> ${out.here.calls} calls, muzzle at ${(out.here.muzzle.x * 100).toFixed(1)} % across / ${(out.here.muzzle.y * 100).toFixed(1)} % up, coverage ${(out.here.cover.coverage * 100).toFixed(1)} %`);
  } finally { await game.close(); }
});

test('viewer first person: weapon_revolver is framed by the 52 degree pass at 16:9, 4:3 and 21:9; project() and coverage()', async () => {
  const seen = {};
  for (const [name, viewport] of [['16x9', { width: 960, height: 540 }], ['4x3', { width: 720, height: 540 }], ['21x9', { width: 1260, height: 540 }]]) {
    const game = await openGame(server, { page: 'sandbox/viewer', piece: PIECE, start: false, viewport, query: { asset: 'weapon_revolver', shot: 1 } });
    try {
      const r = await game.page.evaluate(() => {
        const v = window.__dbg.ext.viewer;
        const hidden = ['panel', 'bar', 'ui'].map((id) => getComputedStyle(document.getElementById(id)).display);
        return { firstPerson: v.firstPerson(), muzzle: v.project('muzzle'), look: v.project('cam_look'), cover: v.coverage(), hidden, panel: document.getElementById('panel').textContent };
      });
      seen[name] = r;
      assert.equal(r.firstPerson, true, 'the manifest pivot is the camera');
      assert.deepEqual(r.hidden, ['none', 'none', 'none'], 'a shot frame carries no panel, bar or UI log');
      assert.match(r.panel, /weapon_revolver/, 'the panel text is still there for tests');
      assert.ok(Math.abs(r.look.across - 0.5) < 1e-6 && Math.abs(r.look.up - 0.5) < 1e-6 && r.look.inFront, 'cam_look (0, 0, -12) is the centre of the frame');
      assert.ok(r.muzzle.inFront && r.muzzle.across > 0.5 && r.muzzle.up < 0.5, `muzzle ${JSON.stringify(r.muzzle)}`);
      assert.ok(Math.abs(r.muzzle.up - seen['16x9'].muzzle.up) < 1e-6, 'a vertical FOV: the height on screen does not change with the aspect');
      assert.ok(r.cover.coverage > 0.01 && r.cover.minX >= 0.5 - 1e-9, `nothing left of centre (${JSON.stringify(r.cover)})`);
      const file = await game.shot(`viewer_viewmodel_${name}`);
      assert.ok(fs.statSync(file).size > 1000);
    } finally { await game.close(); }
  }
  assert.ok(seen['4x3'].muzzle.across > seen['16x9'].muzzle.across && seen['16x9'].muzzle.across > seen['21x9'].muzzle.across);
  // the same asset on the orbit camera when asked
  const game = await openGame(server, { page: 'sandbox/viewer', piece: PIECE, start: false, query: { asset: 'weapon_revolver', view: 'orbit' } });
  try {
    assert.equal(await game.page.evaluate(() => window.__dbg.ext.viewer.firstPerson()), false);
    await assert.rejects(game.page.evaluate(() => window.__dbg.ext.viewer.coverage()), /first person/);
  } finally { await game.close(); }
  console.log(`viewer first person: muzzle at ${(seen['16x9'].muzzle.across * 100).toFixed(1)} % across, ${(seen['16x9'].muzzle.up * 100).toFixed(1)} % up at 16:9 (${(seen['4x3'].muzzle.across * 100).toFixed(1)} % at 4:3, ${(seen['21x9'].muzzle.across * 100).toFixed(1)} % at 21:9); coverage ${(seen['16x9'].cover.coverage * 100).toFixed(1)} %`);
});

test('viewer &mood= and &ground=sand change the picture; without them the frame is as before', async () => {
  const frame = async (query) => {
    const game = await openGame(server, { page: 'sandbox/viewer', piece: PIECE, start: false, query: { asset: 'enemy_bider', shot: 1, ...query } });
    try {
      const url = await game.page.evaluate(() => window.__dbg.capture());
      const tint = await game.page.evaluate(() => window.__dbg.ext.render.moodTint());
      return { url, tint };
    } finally { await game.close(); }
  };
  const plain = await frame({}), plain2 = await frame({}), l1 = await frame({ mood: 'L1' }), l4 = await frame({ mood: 'L4' }), sand = await frame({ ground: 'sand' });
  assert.equal(plain.url, plain2.url, 'deterministic');
  assert.deepEqual(plain.tint, [1, 1, 1]);
  assert.notEqual(l1.url, plain.url);
  assert.notEqual(l4.url, l1.url);
  assert.notEqual(sand.url, plain.url);
  assert.ok(l4.tint[0] < l1.tint[0] && l4.tint[2] > l4.tint[0], `L4 is darker and bluer than L1 (${l1.tint.map((v) => v.toFixed(2))} / ${l4.tint.map((v) => v.toFixed(2))})`);
});

test('viewer ?zone= under ?test=1: the frame line shows the counters of the frame just drawn', async () => {
  const game = await openGame(server, { page: 'sandbox/viewer', piece: PIECE, start: false, query: { zone: 'plenty_street' } });
  try {
    const perf = await game.dbg('perfRun', 2);
    const line = await game.page.evaluate(() => document.getElementById('panel').textContent.split('\n').find((l) => l.startsWith('frame')));
    const m = /frame\s+(\d+) calls .* (\d+) tris/.exec(line);
    assert.ok(m, line);
    assert.equal(Number(m[1]), perf.drawCalls, line);
    assert.equal(Number(m[2]), perf.triangles, line);
    assert.ok(perf.drawCalls > 0 && perf.triangles > 0);
  } finally { await game.close(); }
});

test('basicRender shows dark palette colours exactly as authored and only rolls off above 0.8', async () => {
  const game = await openGame(server, { page: 'sandbox/core', piece: PIECE, start: false, query: { scene: 'room' } });
  try {
    // a wall filling the view 2 m in front of her, then its material set to one flat colour
    await game.page.evaluate(() => window.__dbg.ext.sandbox.room([
      { shape: 'box', pos: [0, -0.5, 0], size: [20, 1, 20], rotY: 0, surface: 'stone', role: 'floor' },
      { shape: 'box', pos: [0, 5, -2.5], size: [20, 12, 1], rotY: 0, surface: 'stone', role: 'wall' },
    ], [0, 0, 0], 0));
    const shown = async (set) => {
      await game.page.evaluate((code) => {
        const ctx = window.__dbg.ext.core.ctx();
        ctx.scene.dynamic.getObjectByName('sandbox_room').traverse((o) => {
          if (!o.isMesh) return;
          o.material.vertexColors = false; o.material.needsUpdate = true;
          if (typeof code === 'number') o.material.color.setHex(code); else o.material.color.setRGB(code[0], code[1], code[2]);
        });
      }, set);
      return game.pixel(480, 200);
    };
    // the palette colours the round-2 critic listed (ART_BIBLE): each must come out as its own sRGB value
    const palette = { steel: [54, 82, 90], steel_dark: [30, 47, 54], gun_blue: [28, 34, 48], cable: [27, 31, 36], walnut: [58, 35, 24] };
    for (const [name, rgb] of Object.entries(palette)) {
      const px = await shown((rgb[0] << 16) | (rgb[1] << 8) | rgb[2]);
      for (let i = 0; i < 3; i++) assert.ok(Math.abs(px[i] - rgb[i]) <= 1, `${name}: authored ${rgb}, displayed ${px}`);
    }
    // linear 0.8 is the knee: untouched there, compressed above, never clipped flat, hue kept
    const knee = await shown([0.8, 0.4, 0.2]);
    const srgb = (v) => Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
    assert.deepEqual(knee.map((v, i) => Math.abs(v - srgb([0.8, 0.4, 0.2][i])) <= 1), [true, true, true], `the knee ${knee}`);
    const bright = await shown([1.6, 0.8, 0.4]), brighter = await shown([2.0, 1.0, 0.5]);
    assert.ok(bright[0] > knee[0] && bright[0] < 255, `linear 1.6 is displayed ${bright}`);
    assert.ok(brighter[0] > bright[0] && brighter[0] < 255, `linear 2.0 is displayed ${brighter}, above 1.6 (${bright})`);
    // and it is exactly the game's curve (src/core/tonemap.ts, knee 0.8): the brightest channel m > 0.8 becomes
    // 0.8 + 0.2 t / (t + 0.2) with t = m - 0.8, the others scale with it
    const curve = (rgb) => { const m = Math.max(...rgb); const k = m <= 0.8 ? 1 : (0.8 + 0.2 * (m - 0.8) / (m - 0.8 + 0.2)) / m; return rgb.map((v) => srgb(v * k)); };
    for (const [lin, px] of [[[1.6, 0.8, 0.4], bright], [[2.0, 1.0, 0.5], brighter], [[1.0, 1.0, 1.0], await shown([1, 1, 1])], [[0.9, 0.1, 0.05], await shown([0.9, 0.1, 0.05])]]) {
      const want = curve(lin);
      for (let i = 0; i < 3; i++) assert.ok(Math.abs(px[i] - want[i]) <= 1, `linear ${lin}: TONE_MAP_GLSL gives ${want}, displayed ${px}`);
    }
    console.log(`tone: steel_dark shown ${await shown(0x1e2f36)}, linear (1.6, 0.8, 0.4) shown ${bright}, (2.0, 1.0, 0.5) shown ${brighter}`);
  } finally { await game.close(); }
});

test('viewer: ext.viewer.pose / setBone / setClip read and pose bones for art tests', async () => {
  const def = MANIFEST.assets.enemy_tamper;
  const game = await openGame(server, { page: 'sandbox/viewer', piece: PIECE, start: false, query: { asset: 'enemy_tamper', shot: 1 } });
  try {
    const out = await game.page.evaluate(async () => {
      const dbg = window.__dbg, v = dbg.ext.viewer;
      const angle = (a, b) => { const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]); return 2 * Math.acos(Math.min(1, d)) * 180 / Math.PI; };
      const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      const all = v.pose();
      const rest = v.pose(['vent_chest']).vent_chest;
      const turned = v.setBone('vent_chest', { rot: [80, 0, 0] });
      dbg.step(3, true);                                           // frames do not add the turn again
      const later = v.pose(['vent_chest']).vent_chest;
      // a clip under the override: the turn sits on top of the clip's pose
      const clip = v.setClip('slam_windup', 1);
      const onClip = v.pose(['vent_chest']).vent_chest;
      const clipOnly = v.setBone('vent_chest', null);
      v.setBone('vent_chest', { scale: 0 });
      const hidden = v.pose(['vent_chest']).vent_chest.local.scale;
      v.setBone('vent_chest', {});
      const shown = v.pose(['vent_chest']).vent_chest.local.scale;
      // t = 1 against t = 0 of a clip, and back to the rest pose
      v.setClip('slam_windup', 0);
      const t0 = v.pose();
      v.setClip('slam_windup', 1);
      const t1 = v.pose();
      v.setClip('', 0);
      const back = v.pose(['vent_chest']).vent_chest;
      let unknown = '';
      try { v.pose(['no_such_bone']); } catch (e) { unknown = String(e.message); }
      let bad = '';
      try { v.setBone('vent_chest', { rot: [NaN, 0, 0] }); } catch (e) { bad = String(e.message); }
      return {
        names: Object.keys(all), isBone: rest.isBone, restPos: rest.pos,
        turnedLocal: angle(rest.local.quat, turned.local.quat), turnedWorld: angle(rest.quat, turned.quat), moved: dist(rest.pos, turned.pos),
        laterLocal: angle(rest.local.quat, later.local.quat),
        clip, onClip: angle(onClip.local.quat, clipOnly.local.quat), hidden, shown,
        clipMoves: Object.keys(t0).filter((n) => dist(t0[n].pos, t1[n].pos) > 1e-4 || angle(t0[n].quat, t1[n].quat) > 0.01).length,
        backLocal: angle(rest.local.quat, back.local.quat), unknown, bad,
      };
    });
    assert.deepEqual(out.names.slice().sort(), [...new Set([...def.nodes, ...(def.bones ?? [])])].sort(), 'pose() lists every manifest node and bone');
    assert.equal(out.isBone, true);
    assert.equal(out.restPos.length, 3);
    assert.ok(Math.abs(out.turnedLocal - 80) < 0.01 && Math.abs(out.turnedWorld - 80) < 0.01, `+80 degrees about the bone's own X: ${out.turnedLocal} local, ${out.turnedWorld} in asset space`);
    assert.ok(out.moved < 1e-6, 'a bone turns about its own origin');
    assert.ok(Math.abs(out.laterLocal - 80) < 0.01, `still 80 degrees after three frames (${out.laterLocal})`);
    assert.equal(out.clip.clip, 'slam_windup');
    assert.ok(Math.abs(out.clip.time - out.clip.seconds) < 1e-9 && out.clip.seconds > 0);
    assert.ok(Math.abs(out.onClip - 80) < 0.01, `80 degrees on top of the clip's pose (${out.onClip})`);
    assert.deepEqual(out.hidden, [0, 0, 0]);
    assert.deepEqual(out.shown, [1, 1, 1]);
    assert.ok(out.backLocal < 0.01, `setClip('') and a cleared override give the rest pose back (${out.backLocal})`);
    assert.match(out.unknown, /has no node or bone 'no_such_bone'/);
    assert.match(out.bad, /setBone: rot is \[xDeg, yDeg, zDeg\]/);
    console.log(`viewer pose: enemy_tamper ${out.names.length} nodes and bones; slam_windup moves ${out.clipMoves} of them between t = 0 and t = 1`);
  } finally { await game.close(); }
  // on the live page (labels, clip buttons, the mixer running): the override is applied after the mixer on every frame
  const live = await openGame(server, { page: 'sandbox/viewer', piece: PIECE, start: false, query: { asset: 'enemy_tamper' } });
  try {
    const out = await live.page.evaluate(() => {
      const dbg = window.__dbg, v = dbg.ext.viewer;
      const angle = (a, b) => { const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]); return 2 * Math.acos(Math.min(1, d)) * 180 / Math.PI; };
      const button = [...document.querySelectorAll('#bar button')].find((b) => b.textContent.startsWith('slam_windup '));
      button.click();
      v.setBone('vent_chest', { rot: [0, 0, 80] });
      const seen = [];
      for (let i = 0; i < 4; i++) {
        dbg.step(1, true);
        const withTurn = v.pose(['vent_chest']).vent_chest.local.quat;
        const clipPose = v.setBone('vent_chest', null).local.quat;   // the mixer's pose of this very frame
        seen.push(angle(withTurn, clipPose));
        v.setBone('vent_chest', { rot: [0, 0, 80] });
      }
      return seen;
    });
    for (const a of out) assert.ok(Math.abs(a - 80) < 0.01, `80 degrees over the playing clip on every frame (${out})`);
  } finally { await live.close(); }
});

test('viewer &shot=1 without &dist=: the asset\'s bounding box fills 90 % of the frame', async () => {
  const rows = [];
  for (const [asset, query, viewport] of [
    ['ia_ammo_box', {}, { width: 960, height: 540 }], ['enemy_bider', { yaw: 20, pitch: 10 }, { width: 960, height: 540 }],
    ['prop_wagon_tipped', { yaw: -60, pitch: 35 }, { width: 960, height: 540 }], ['boss_windlass', { yaw: 0, pitch: 0 }, { width: 720, height: 540 }],
  ]) {
    const game = await openGame(server, { page: 'sandbox/viewer', piece: PIECE, start: false, viewport, query: { asset, shot: 1, ...query } });
    try {
      await game.step(1, true);
      const f = await game.page.evaluate(() => window.__dbg.ext.viewer.framing());
      rows.push(`${asset} ${f.width.toFixed(2)} x ${f.height.toFixed(2)} at ${f.distance.toFixed(2)} m`);
      assert.ok(Math.abs(f.distance - f.fitted) < 1e-6, 'the shot is taken from the fitted distance');
      assert.ok(Math.max(f.width, f.height) > 0.895 && Math.max(f.width, f.height) < 0.905, `${asset}: the box spans ${f.width.toFixed(3)} of the width and ${f.height.toFixed(3)} of the height`);
      if (asset === 'ia_ammo_box') await game.shot('viewer_shot_fitted');
    } finally { await game.close(); }
  }
  // an explicit &dist= is kept as given
  const game = await openGame(server, { page: 'sandbox/viewer', piece: PIECE, start: false, query: { asset: 'ia_ammo_box', shot: 1, dist: 4 } });
  try {
    await game.step(1, true);
    assert.ok(Math.abs((await game.page.evaluate(() => window.__dbg.ext.viewer.framing())).distance - 4) < 1e-6);
  } finally { await game.close(); }
  console.log(`viewer shot framing: ${rows.join('; ')}`);
});

