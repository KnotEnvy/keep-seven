// The core stubs do what sandboxes and the other pieces' tests rely on (work order 4.6), through the contract surface.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser } from '../../tools/browser.mjs';
import { ROOT, openGame, startServer } from '../harness.mjs';
import { LAYOUT, PIECES, STUBS } from './route.mjs';

const PIECE = 'foundation-core';
let server;
before(async () => { server = await startServer({ pieces: PIECES }); });
after(async () => { await server.close(); });

test('nullEnemies + dummyPlayer: spawn, aimAtEntity, probe, one shot fells it; events, audio log and render calls are recorded', async () => {
  const game = await openGame(server, { piece: PIECE, stubs: 'all', checkpoint: 'cp_street_clear' });
  try {
    const cp = LAYOUT.markers.find((m) => m.id === 'cp_street_clear');
    const id = await game.dbg('spawnEnemy', 'bider', cp.pos[0] - 8, cp.pos[1], cp.pos[2], 0);
    assert.equal(id, 'bider#1');
    const tr = await game.dbg('spawnEnemy', 'transit', cp.pos[0] - 8, cp.pos[1], cp.pos[2] + 3, 0);
    let s = await game.state();
    assert.equal(s.enemies.length, 2);
    assert.deepEqual(s.enemies.map((e) => [e.id, e.kind, e.alive]), [[id, 'bider', true], [tr, 'transit', true]]);
    assert.equal(await game.dbg('aimAtEntity', 'nobody#9'), false);
    assert.equal(await game.dbg('aimAtEntity', id, 'crown'), false, 'the stub has only a body volume');
    assert.equal(await game.dbg('aimAtEntity', id, 'body'), true);
    let probe = await game.dbg('probe');
    assert.deepEqual([probe.hit, probe.entityId, probe.entityKind, probe.part], [true, id, 'bider', 'body']);
    assert.ok(Math.abs(probe.distance - (8 - 0.35)) < 0.2, `distance ${probe.distance}`);
    const seq = (await game.events(0)).at(-1).seq;
    s = await game.run([{ tap: 'fire', steps: 1 }, { steps: 1 }]);
    const events = (await game.events(seq)).map((e) => e.name);
    assert.deepEqual(events.filter((n) => ['enemy/felled', 'enemy/removed', 'weapon/fired', 'combat/hit'].includes(n)), ['enemy/felled', 'enemy/removed', 'weapon/fired', 'combat/hit'],
      'the receiver ran inside the shot, before weapon/fired and combat/hit');
    const hit = (await game.events(seq, 'combat/hit'))[0].payload;
    assert.deepEqual([hit.outcome, hit.entityId, hit.entityKind, hit.part, hit.damage, hit.surface], ['kill', id, 'bider', 'body', 100, 'cloth']);
    assert.equal(s.enemies.length, 1);
    assert.equal(s.stats.felled, 1);
    assert.equal(s.stats.roundsFired, 1);
    // the audio stub logs what it would voice: "no bullet produces nothing"
    assert.deepEqual(s.systems.audio.recent.slice(-2).map((x) => x.split('@')[0]), ['weapon/fired:lead_round', 'combat/hit:kill']);
    // a shot at the world: an impact on the surface it hit
    await game.run([{ aim: [0, -30], tap: 'fire', steps: 2 }]);
    const impact = (await game.events(0, 'combat/hit')).at(-1).payload;
    assert.deepEqual([impact.outcome, impact.entityKind, impact.surface], ['impact', 'world', 'sand']);
    // killAll goes through the death path; a transit dies, it is not felled
    const seq2 = (await game.events(0)).at(-1).seq;
    assert.equal(await game.dbg('killAll'), 1);
    assert.deepEqual((await game.events(seq2)).map((e) => e.name), ['enemy/died', 'enemy/removed']);
    await game.dbg('spawnEnemy', 'bider', cp.pos[0] - 6, cp.pos[1], cp.pos[2], 0);
    assert.equal(await game.dbg('killAll', true), 1);
    assert.equal((await game.events(0, 'enemy/freed')).length, 1);
    assert.equal((await game.state()).world.lamps, 10, '9 + freed');
    // the boss phase flips
    await game.dbg('setBossPhase', 'p3a');
    s = await game.state();
    assert.deepEqual([s.boss.phase, s.boss.marksLit], ['p3a', true]);
    // the stub boss shows what a HUD needs: 26 pips in all, a count and a guard per phase, and a setter for any state
    assert.deepEqual([s.boss.pips, s.boss.pipsTotal], [6, 26]);
    await game.dbg('setBossPhase', 'p1');
    s = await game.state();
    assert.deepEqual([s.boss.phase, s.boss.pips, s.boss.pipsTotal, s.boss.guard], ['p1', 26, 26, 'set']);
    await game.page.evaluate(() => window.__dbg.ext.enemies.setBoss({ pips: 17, guard: 'released' }));
    s = await game.state();
    assert.deepEqual([s.boss.pips, s.boss.guard], [17, 'released']);
    assert.deepEqual((await game.events(0, 'boss/pips')).at(-1).payload, { phase: 'p1', remaining: 17, total: 26, lit: 17 });
    assert.equal((await game.events(0, 'boss/guard')).at(-1).payload.state, 'released');
    await game.dbg('setBossPhase', 'p2');
    assert.equal((await game.state()).boss.pips, 16, 'a phase change clears the forced values');
    // collision queries per drawn frame, with the lineOfSight share apart (a budget the enemies piece is held to)
    const counts = await game.page.evaluate(() => {
      const dbg = window.__dbg;
      dbg.ext.core.collisionCounts(true);
      dbg.setActions(['forward']);
      dbg.perfRun(3);
      dbg.setActions([]);
      return dbg.ext.core.collisionCounts();
    });
    assert.ok(counts.peak.capsules >= 3, `three sub-steps of the dummy player per frame (${JSON.stringify(counts)})`);
    assert.equal(counts.peak.sight, 0, 'nothing in the stubs asks for a line of sight');
    assert.ok(counts.peak.rays >= counts.peak.sight && counts.last.capsules <= counts.peak.capsules);
    // recorded render calls: other pieces assert "the flash was asked for" this way
    await game.page.evaluate(() => { window.__dbg.emit('audio/cue', { cue: 'checkpoint', positional: false, gain: 1, pitch: 1, x: 0, y: 0, z: 0 }); });
    s = await game.state();
    assert.ok(s.systems.render.calls.some((c) => c.startsWith('setMood:')), 'setMood was recorded');
    assert.ok(s.systems.audio.recent.at(-1).startsWith('audio/cue:checkpoint@'));
    // damage and god mode
    await game.page.evaluate(() => {
      const dbg = window.__dbg;
      dbg.god(true);
    });
    assert.equal((await game.state()).player.god, true);
  } finally { await game.close(); }
});

test('stepUntil: event, path and state conditions; tap holds for its ticks; look applies on the next tick', async () => {
  const game = await openGame(server, { piece: PIECE, stubs: 'all' });
  try {
    // an event condition: the first matching event logged after the call began
    await game.dbg('god', true);
    let r = await game.until({ event: 'zone/entered', where: { zone: 'plenty_street' } }, 50);
    assert.deepEqual([r.met, r.steps], [false, 50]);
    // a path condition into DebugState
    await game.dbg('setActions', ['forward']);
    r = await game.until({ path: 'player.z', op: '<', value: 104 }, 600);
    assert.equal(r.met, true);
    assert.ok(r.steps > 30 && r.steps < 60, `3.5 m at 5 m/s is about 42 ticks (${r.steps})`);
    await game.dbg('setActions', []);
    // a state condition
    await game.page.evaluate(() => window.__dbg.pause(true));
    r = await game.until({ state: 'paused' }, 5);
    assert.deepEqual([r.met, r.steps, r.state], [true, 1, 'paused']);
    await game.dbg('pause', false);
    // tap: held for exactly its ticks, starting at the next step
    await game.dbg('tap', 'forward', 12);
    const z0 = (await game.state()).player.z;
    let s = await game.run([{ steps: 30 }]);
    assert.ok(Math.abs((z0 - s.player.z) - 12 * 5 / 60) < 0.02, `12 ticks of walking: ${z0 - s.player.z} m`);
    // look: positive x turns right (yaw falls), positive y looks down; applied on the next tick's frame
    const yaw0 = s.player.yawDeg;
    await game.dbg('look', 100, 50);
    assert.equal((await game.state()).player.yawDeg, yaw0, 'not before a tick');
    s = await game.run([{ steps: 1 }]);
    assert.ok(Math.abs(s.player.yawDeg - (yaw0 - 100 * 0.0022 * 180 / Math.PI)) < 0.01);
    assert.ok(Math.abs(s.player.pitchDeg - (-50 * 0.0022 * 180 / Math.PI)) < 0.01);
    // setKeys goes through the bindings; setOption rebinding takes effect at once
    await game.dbg('setOption', 'bindings', { ...(await game.page.evaluate(() => ({ forward: ['KeyI'], back: ['KeyK'], left: ['KeyJ'], right: ['KeyL'], fire: ['Mouse0'], reload: ['KeyR'], line: ['KeyQ'], kept: ['KeyF'], interact: ['KeyE'], sprint: ['ShiftLeft'], jump: ['Space'], pause: ['Escape'] }))) });
    const before = (await game.state()).player;
    s = await game.run([{ aim: [0, 0], keys: ['KeyW'], steps: 20 }, { keys: ['KeyI'], steps: 20 }, { keys: [], steps: 1 }]);
    assert.ok(Math.abs((before.z - s.player.z) - 20 * 5 / 60) < 0.05, 'KeyW is unbound now, KeyI walks');
    // teleportToMarker, aimAtMarker, objectives, puzzles
    assert.equal(await game.dbg('teleportToMarker', 'cp_lip_gate'), true);
    assert.equal(await game.dbg('teleportToMarker', 'no_such_marker'), false);
    assert.equal(await game.dbg('aimAtMarker', 'door_jug_gate'), true);
    s = await game.run([{ steps: 1 }]);
    assert.ok(Math.abs(s.player.yawDeg - 90) < 25, `facing the gate to the west (${s.player.yawDeg})`);
    const o = await game.dbg('objectives');
    assert.ok(o.current.startsWith('obj_') && o.text.length > 0);
    assert.deepEqual(Object.keys(await game.dbg('puzzles')), ['seven_jugs', 'daylight', 'proving_line', 'the_asking']);
    // state() is JSON-safe with numbers rounded to 1e-4
    const text = JSON.stringify(s);
    assert.ok(!/\d\.\d{5,}/.test(text.replace(/"[^"]*"/g, '""')), 'no number has more than four decimals');
  } finally { await game.close(); }
});

test('basicRender: instances draw in one call per (asset, node), units toggle, tiers resize', async () => {
  const game = await openGame(server, { piece: PIECE, stubs: 'all', checkpoint: 'cp_street_clear' });
  try {
    const out = await game.page.evaluate(() => {
      const dbg = window.__dbg;
      dbg.setAim(90, -5);
      const base = dbg.perfRun(1);
      return { base: { drawCalls: base.drawCalls, triangles: base.triangles, visibleZones: base.visibleZones, width: base.width, renderTargetBytes: base.renderTargetBytes } };
    });
    assert.ok(out.base.drawCalls > 5);
    assert.equal(out.base.visibleZones, 2, 'cell_street draws the street and the lip, not the hall');
    // units really toggle: the hall is hidden from the street, the street chunks are shown
    const vis = await game.page.evaluate(() => { const r = window.__dbg.ext.render; return [r.unitVisible('chunk_st_east'), r.unitVisible('chunk_ty_hall'), r.zoneVisible('plenty_street'), r.zoneVisible('tally_house')]; });
    assert.deepEqual(vis, [true, false, true, false]);
    // instancing: 40 jugs are ONE more draw call; removing them gives the call back
    const inst = await game.page.evaluate(() => {
      const dbg = window.__dbg, r = dbg.ext.render, p = dbg.player();
      const before = dbg.perfRun(1);
      const handles = r.addInstances('ia_jug', 'jug_intact', 40, p.x - 14, p.y + 1.2, p.z - 2);
      const during = dbg.perfRun(1);
      r.removeInstances(handles);
      const more = r.addInstances('ia_jug', 'jug_intact', 100, p.x - 14, p.y + 1.2, p.z - 2);      // past the first capacity of 64
      const grown = dbg.perfRun(1);
      r.removeInstances(more);
      const after = dbg.perfRun(1);
      return { handles: handles.length, bad: r.addInstances('ia_bore_door', '', 1, 0, 0, 0), before, during, grown, after };
    });
    assert.equal(inst.handles, 40);
    assert.deepEqual(inst.bad, [-1], 'an asset that is not active gives -1');
    assert.equal(inst.during.drawCalls, inst.before.drawCalls + 1, 'one InstancedMesh per (asset, node): one draw call');
    assert.equal(inst.during.instances, 40);
    assert.ok(inst.during.triangles > inst.before.triangles);
    assert.equal(inst.grown.drawCalls, inst.before.drawCalls + 1);
    assert.equal(inst.grown.instances, 100);
    assert.equal(inst.after.instances, 0);
    assert.equal(inst.after.triangles, inst.before.triangles, 'removed instances draw nothing');
    // a higher tier accounts for its own render targets
    await game.dbg('setTier', 'high');
    const high = await game.dbg('perfRun', 1);
    assert.equal(high.tier, 'high');
    assert.ok(high.renderTargetBytes > out.base.renderTargetBytes);
    const changed = (await game.events(0, 'quality/changed')).at(-1).payload;
    assert.deepEqual([changed.tier, changed.reason], ['high', 'user']);
  } finally { await game.close(); }
});

test('nullWorld draws every shut door as a box; the debug hook refuses unknown ids; ext.core reaches the rest of the contract', async () => {
  const game = await openGame(server, { piece: PIECE, stubs: 'all', checkpoint: 'cp_street_clear' });
  try {
    const doors = () => game.page.evaluate(() => {
      const ctx = window.__dbg.ext.core.ctx();
      const mesh = ctx.scene.dynamic.getObjectByName('stub_doors_mesh');
      const s = window.__dbg.state();
      const live = Object.entries(s.systems.world.doors).filter(([, state]) => state === 'closed').map(([id]) => id);
      return { count: mesh ? mesh.count : -1, visible: mesh ? mesh.visible : false, closed: live, gate: s.world.doors.door_yard_gate };
    });
    let d = await doors();
    assert.equal(d.gate, 'open');
    assert.ok(d.count > 0 && d.count <= d.closed.length, `${d.count} door boxes for ${d.closed.length} closed doors (those of built zones)`);
    const open = d.count;
    await game.run([{ call: ['aimAtMarker', 'door_yard_gate'], steps: 1 }]);
    const urlOpen = await game.dbg('capture');
    await game.page.evaluate(() => window.__dbg.ext.world.setDoor('door_yard_gate', 'closed'));
    d = await doors();
    assert.equal(d.count, open + 1, 'the shut gate is one more box');
    const urlShut = await game.dbg('capture');
    assert.notEqual(urlShut, urlOpen, 'a shut door is visible in the frame');
    await game.page.evaluate(() => window.__dbg.ext.world.setDoor('door_yard_gate', 'open'));
    assert.equal((await doors()).count, open);
    assert.equal(await game.dbg('capture'), urlOpen);

    // bad arguments fail at the hook, by name
    const thrown = await game.page.evaluate(() => {
      const out = {};
      for (const [m, arg] of [['setTier', 'ultra'], ['solvePuzzle', 'nope'], ['clearEncounter', 'enc_nope']]) {
        try { window.__dbg[m](arg); out[m] = 'no throw'; } catch (e) { out[m] = String(e.message); }
      }
      return { out, error: window.__dbg.error, tier: window.__dbg.perf().tier };
    });
    assert.match(thrown.out.setTier, /^__dbg\.setTier: unknown id 'ultra'/);
    assert.match(thrown.out.solvePuzzle, /^__dbg\.solvePuzzle: unknown id 'nope'/);
    assert.match(thrown.out.clearEncounter, /^__dbg\.clearEncounter: unknown id 'enc_nope'/);
    assert.equal(thrown.error, null);

    // ext.core: the contract surface the DebugHook interface has no method for
    const ext = await game.page.evaluate(() => {
      const dbg = window.__dbg, core = dbg.ext.core;
      dbg.setHealth(100);
      const applied = core.damage(30, 'lunge', 'bider');
      const afterDamage = dbg.player().health;
      const damaged = dbg.events(0, 'player/damaged').at(-1)?.payload;
      core.setSeventh('violet');
      const seventh = dbg.player().seventh;
      core.setSeventh('sealed');
      return { applied, afterDamage, damaged, seventh, tokens: core.tokens(), timeScale: core.timeScale(), extra: core.playerExtra(), hasCtx: core.ctx().player === core.ctx().player && typeof core.ctx().collision.raycast === 'function' };
    });
    assert.equal(ext.applied, 30);
    assert.equal(ext.afterDamage, 70);
    assert.equal(ext.damaged.kind, 'lunge');
    assert.equal(ext.damaged.source, 'bider');
    assert.equal(ext.seventh, 'violet');
    assert.deepEqual(Object.keys(ext.tokens).sort(), ['heavy', 'melee', 'ranged']);
    assert.equal(ext.timeScale, 1);
    assert.equal(ext.extra.control, true);
    assert.equal(typeof ext.extra.keptAimLegal, 'boolean');
    assert.equal(typeof ext.extra.shotsFired, 'number');
    assert.equal(ext.hasCtx, true);
  } finally { await game.close(); }
});

test('__dbg.step warns once when a pending flow job cut it short; stepAsync does not', async () => {
  const game = await openGame(server, { piece: PIECE, stubs: 'all', checkpoint: 'cp_street_clear' });
  try {
    const warnings = [];
    game.page.on('console', (msg) => { if (msg.type() === 'warning') warnings.push(msg.text()); });
    // the harness's own stepping across a death: no warning
    await game.run([{ call: ['setHealth', 0] }, { steps: 200 }]);
    assert.equal((await game.state()).game, 'playing');
    assert.deepEqual(warnings.filter((w) => w.startsWith('__dbg.')), []);
    // a raw synchronous step across a death stops at the respawn, and says so once
    const ran = await game.page.evaluate(() => { const d = window.__dbg; d.setHealth(0); d.step(200, false); const a = d.ext.core.ran(); d.step(50, false); return [a, d.ext.core.ran()]; });
    assert.ok(ran[0] < 200 && ran[1] === 0, `ran ${ran}`);
    await game.page.evaluate(() => window.__dbg.ext.core.idle());
    const own = warnings.filter((w) => w.startsWith('__dbg.'));
    assert.equal(own.length, 1, own.join(' | '));
    assert.match(own[0], /^__dbg\.step: ran \d+ of 200 ticks and stopped/);
    assert.match(own[0], /stepAsync/);
  } finally { await game.close(); }
});

// Polish round 4 (robustness, a gate flake): with other browsers on the machine this page drew one frame every 1 to 14 s
// and 90 s of wall clock was not enough for 1.5 m of walking. Every wait of the test is on ticks or state, never on a
// rate; the bound only has to be longer than a starved machine needs (alone the test takes about 10 s).
const REAL_WAIT_MS = 300000;
test('real time: the dev page runs its own loop, a click starts the run and the keyboard walks', async () => {
  const browser = await launchBrowser();
  // a small page: this test is about the loop, the input and the asynchronous loads, and under SwiftShader on a shared
  // machine a 960 x 540 frame can take seconds (a run starved to 128 ticks in 200 s timed out here)
  const page = await browser.newPage({ viewport: { width: 320, height: 180 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  try {
    await page.goto(server.url + '?stubs=all');                             // no ?test=1: the dev server installs the hook, the loop runs
    await page.waitForFunction(() => window.__dbg && window.__dbg.ready, null, { timeout: REAL_WAIT_MS });
    const t0 = await page.evaluate(() => window.__dbg.state().tick);
    await page.waitForFunction((t) => window.__dbg.state().tick > t + 20, t0, { timeout: REAL_WAIT_MS });
    let s = await page.evaluate(() => window.__dbg.state());
    assert.equal(s.game, 'title');
    const perf = await page.evaluate(() => window.__dbg.perf());
    assert.equal(perf.tier, 'low', 'a software renderer is Low');
    assert.ok(perf.rafMs > 0, 'rafMs is the real frame delta outside test mode');
    assert.ok(perf.drawCalls > 0);
    await page.mouse.click(160, 90);                          // the stub UI: a click begins the run and asks for the pointer
    await page.waitForFunction(() => window.__dbg.state().game === 'playing', null, { timeout: REAL_WAIT_MS });
    // the click that began the run is not a shot (pillar 1: six rounds, every one matters) ...
    await page.waitForFunction((t) => window.__dbg.state().tick > t + 10, (await page.evaluate(() => window.__dbg.state())).tick, { timeout: REAL_WAIT_MS });
    const fired = () => page.evaluate(() => window.__dbg.events(0, 'weapon/fired').length);
    assert.equal(await fired(), 0, 'the start click did not fire the gun');
    // ... nor is the click that resumes after the pointer was lost; a click made in play is
    await page.evaluate(() => document.exitPointerLock());
    await page.waitForFunction(() => window.__dbg.state().game === 'paused', null, { timeout: REAL_WAIT_MS });
    await page.mouse.click(160, 90);
    await page.waitForFunction(() => window.__dbg.state().game === 'playing', null, { timeout: REAL_WAIT_MS });
    await page.waitForFunction((t) => window.__dbg.state().tick > t + 10, (await page.evaluate(() => window.__dbg.state())).tick, { timeout: REAL_WAIT_MS });
    assert.equal(await fired(), 0, 'the resume click did not fire the gun');
    await page.mouse.click(160, 90);
    await page.waitForFunction(() => window.__dbg.events(0, 'weapon/fired').length === 1, null, { timeout: REAL_WAIT_MS });
    await page.waitForFunction((t) => window.__dbg.state().tick > t + 10, (await page.evaluate(() => window.__dbg.state())).tick, { timeout: REAL_WAIT_MS });
    assert.equal(await fired(), 1, 'one click in play is one shot');
    const z0 = (await page.evaluate(() => window.__dbg.state())).player.z;
    await page.keyboard.down('KeyW');
    await page.waitForFunction((z) => window.__dbg.state().player.z < z - 1.5, z0, { timeout: REAL_WAIT_MS });
    await page.keyboard.up('KeyW');
    // the asynchronous paths (nothing is pre-decoded outside test mode): the seam stage is fetched and staged on the warp,
    // the set swap on the stair fetches the underground set while she walks on, uploads spread one texture per frame
    await page.evaluate(() => window.__dbg.checkpoint('cp_tally_hatch'));
    s = await page.evaluate(() => window.__dbg.state());
    assert.deepEqual(s.world.builtZones, ['the_lip', 'plenty_street', 'tally_house', 'the_gallery'], 'the seam stage was built before control came back');
    await page.evaluate(() => { window.__dbg.god(true); });
    let walk = { reason: '' };
    for (let i = 0; i < 40 && walk.reason !== 'arrived'; i++) {
      walk = await page.evaluate(() => window.__dbg.followPath('cp_gallery_bay', { maxTicks: 120 }));
      assert.ok(['arrived', 'max_ticks', 'state'].includes(walk.reason), `the walk ended '${walk.reason}'`);
      await page.waitForTimeout(50);
    }
    assert.equal(walk.reason, 'arrived');
    await page.waitForFunction(() => window.__dbg.state().world.builtZones.join() === 'the_gallery,lift_hall,the_bore', null, { timeout: REAL_WAIT_MS });
    s = await page.evaluate(() => window.__dbg.state());
    assert.equal(s.world.set, 'underground');
    assert.equal(s.player.grounded, true);
    const report = await page.evaluate(() => window.__dbg.ext.assets.report());
    assert.ok(report.assetsFromFiles > 37 && report.assetsSynthesised === 0, `the underground set was fetched on demand (${report.assetsFromFiles} loads)`);
    await page.keyboard.press('F3');
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('perf-overlay')).display), 'block', 'F3 shows the overlay');
    s = await page.evaluate(() => window.__dbg.state());
    assert.ok(['playing', 'paused'].includes(s.game));
    assert.equal(await page.evaluate(() => window.__dbg.error), null);
    assert.deepEqual(errors, []);
  } catch (err) {
    // a timeout says nothing by itself: add where the page stood
    let where = '';
    try {
      where = JSON.stringify(await page.evaluate(() => {
        const d = window.__dbg, s = d.state();
        return { game: s.game, tick: s.tick, z: s.player.z, lock: document.pointerLockElement !== null, hidden: document.hidden, focus: document.hasFocus(),
          locks: d.events(0, 'input/pointer_lock').map((e) => `${e.payload.locked}@${e.tick}`), states: d.events(0, 'game/state').map((e) => `${e.payload.to}@${e.tick}`), fired: d.events(0, 'weapon/fired').length, error: d.error };
      }));
    } catch { /* the page is gone */ }
    throw new Error(`${err && err.message ? err.message : err}\npage: ${where}\nconsole errors: ${errors.join(' | ')}`, { cause: err });
  } finally { await browser.close(); }
});

// A slot's module, as the page requested it: src/<slot>/ itself, or core's stand-in for it (startServer `pieces`: a
// slot that is not in KEEP7_REAL is never served from src/<slot>/, so six modules in progress cannot break this file).
const SLOT_MODULE = /^\/src\/(?:core\/stubs\/slots\/)?(player|enemies|world|render|audio|ui)(?:\/|\.ts)/;
test('?stubs= leaves core stubs in the named slots of the index page and never requests those modules', async () => {
  const slots = async (stubs) => {
    const requested = [];
    const game = await openGame(server, { piece: PIECE, stubs, start: false });
    try {
      const names = await game.page.evaluate(() => performance.getEntriesByType('resource').map((e) => new URL(e.name).pathname));
      for (const n of names) { const m = SLOT_MODULE.exec(n); if (m) requested.push({ slot: m[1], path: n }); }
      return { stubs: await game.page.evaluate(() => window.__dbg.ext.core.stubs()), slots: [...new Set(requested.map((r) => r.slot))].sort(), paths: requested.map((r) => r.path) };
    } finally { await game.close(); }
  };
  const all = await slots('all');
  assert.deepEqual(all.stubs, ['player', 'enemies', 'world', 'render', 'audio', 'ui']);
  assert.deepEqual(all.paths, [], 'no slot module was requested');
  const two = await slots(['world', 'enemies']);
  assert.deepEqual(two.stubs, ['enemies', 'world']);
  assert.deepEqual(two.slots, ['audio', 'player', 'render', 'ui'], `the four other slots were requested, world and enemies were not (${two.paths.join(' ')})`);
  const none = await slots(null);
  assert.deepEqual(none.stubs, [], 'no parameter: every slot is filled through its module');
  assert.deepEqual(none.slots, ['audio', 'enemies', 'player', 'render', 'ui', 'world']);
  // which file a slot's module came from: src/<slot>/ only for the slots KEEP7_REAL names (all of them with `all`)
  const real = PIECES === 'all' ? ['audio', 'enemies', 'player', 'render', 'ui', 'world'] : PIECES;
  for (const p of none.paths) {
    const slot = SLOT_MODULE.exec(p)[1];
    assert.equal(p.startsWith(`/src/${slot}/`), real.includes(slot), `${p}: ${real.includes(slot) ? 'the piece\'s own module' : 'core\'s stand-in, not src/' + slot + '/'}`);
  }
  // a slot that does not exist fails the boot at once, with the reason
  const t0 = Date.now();
  await assert.rejects(openGame(server, { piece: PIECE, stubs: 'wrold', start: false }), /'wrold' is not a system/);
  assert.ok(Date.now() - t0 < 20000, 'a failed boot is reported, not waited out');
});

test('startServer pieces: slots that are not named are served and bundled from core\'s stand-ins, never from src/<piece>/', async () => {
  // (the proof with a really broken module is a scratch copy of the tree: docs/FOUNDATION_REPORT.md section 8e)
  const dev = await startServer({ pieces: [] });
  try {
    assert.deepEqual(dev.pieces, []);
    const game = await openGame(dev, { piece: PIECE, stubs: null, start: false });
    try {
      const names = await game.page.evaluate(() => performance.getEntriesByType('resource').map((e) => new URL(e.name).pathname));
      assert.deepEqual(names.filter((n) => /^\/src\/(player|enemies|world|render|audio|ui)\//.test(n)), [], 'nothing under src/<piece>/ was requested');
      assert.equal(names.filter((n) => n.startsWith('/src/core/stubs/slots/')).length, 6);
      await game.dbg('start');
      assert.equal((await game.run([{ steps: 5 }])).game, 'playing');
    } finally { await game.close(); }
    assert.deepEqual(dev.replaced().sort(), ['audio', 'enemies', 'player', 'render', 'ui', 'world']);
  } finally { await dev.close(); }
  const prod = await startServer({ mode: 'build', pieces: ['player'] });
  try {
    // the bundler was handed the stand-in for five slots, so it never opened their src/<piece>/index.ts
    assert.deepEqual(prod.replaced().sort(), ['audio', 'enemies', 'render', 'ui', 'world']);
    const game = await openGame(prod, { piece: PIECE, stubs: null, start: false, query: { debug: 1 } });
    try { assert.deepEqual(await game.page.evaluate(() => window.__dbg.ext.core.stubs()), []); } finally { await game.close(); }
  } finally { await prod.close(); }
  assert.deepEqual((await (async () => { const all = await startServer({ pieces: 'all' }); try { return all.replaced(); } finally { await all.close(); } })()), []);
  await assert.rejects(startServer({ pieces: ['wrold'] }), /'wrold' is not a system/);
});

test('two production builds side by side do not share an output directory; a page whose script is gone fails in seconds', async () => {
  // concurrent runs in one tree used to build into the one dist/ and empty it under each other (a 404, then a 120 s wait)
  const [a, b] = await Promise.all([startServer({ mode: 'build', pieces: PIECES }), startServer({ mode: 'build', pieces: PIECES })]);
  try {
    assert.notEqual(a.outDir, b.outDir);
    assert.ok(a.outDir.includes('.cache') && fs.existsSync(path.join(a.outDir, 'index.html')) && fs.existsSync(path.join(b.outDir, 'index.html')));
    assert.equal(fs.readdirSync(path.join(a.outDir, 'js')).filter((f) => f.endsWith('.js')).length, 1, 'one script file: the six pieces are not split into chunks');
    const game = await openGame(a, { piece: PIECE, stubs: STUBS, start: false, query: { debug: 1 } });
    await game.close();
    // what a build emptied from under a preview server looks like to the page
    fs.rmSync(path.join(b.outDir, 'js'), { recursive: true });
    const t0 = Date.now();
    await assert.rejects(openGame(b, { piece: PIECE, stubs: STUBS, start: false, query: { debug: 1 } }), /did not boot: 404/);
    assert.ok(Date.now() - t0 < 30000, `reported after ${Date.now() - t0} ms`);
  } finally {
    await a.close(); await b.close();
  }
  assert.ok(!fs.existsSync(a.outDir) && !fs.existsSync(b.outDir), 'close() removes the build');
});

test('the production build boots, synthesises nothing and plays', async () => {
  const prod = await startServer({ mode: 'build', pieces: PIECES });
  try {
    const game = await openGame(prod, { piece: PIECE, stubs: STUBS, query: { debug: 1 } });
    try {
      await game.dbg('god', true);
      const s = await game.run([{ followPath: 'critical', maxTicks: 600 }]);
      assert.equal(s.game, 'playing');
      assert.ok(s.player.z < 80);
      const perf = await game.dbg('perfRun', 2);
      assert.ok(perf.drawCalls > 0);
      const report = await game.page.evaluate(() => window.__dbg.ext.assets.report());
      assert.equal(report.assetsSynthesised + report.texturesSynthesised, 0, 'every file of the manifest is in public/assets');
    } finally { await game.close(); }
  } finally { await prod.close(); }
});

test('a production build made after a dev server in the same process is a production build: no hook without ?debug=1, a click starts the run, a missing file is a boot error on the page', async () => {
  // `server` (a dev server) has been running since before(): Vite left NODE_ENV=development behind, and the build that
  // followed used to have import.meta.env.DEV true (the hook installed without ?debug=1, a 404 synthesised away)
  assert.notEqual(process.env.NODE_ENV, 'development', 'startServer puts NODE_ENV back');
  const prod = await startServer({ mode: 'build', pieces: PIECES });
  const browser = await launchBrowser();
  try {
    const open = async (prepare) => {
      const page = await browser.newPage({ viewport: { width: 320, height: 180 }, deviceScaleFactor: 1 });
      const errors = [];
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('pageerror', (e) => errors.push(String(e)));
      if (prepare) await prepare(page);
      await page.goto(prod.url);                                 // the page a player gets: no parameter at all
      return { page, errors };
    };
    // ---- the page a player gets
    const ok = await open();
    await ok.page.waitForFunction(() => document.title !== '' && document.getElementById('ui').textContent.trim() !== '', null, { timeout: 90000 });
    assert.equal(await ok.page.evaluate(() => typeof window.__dbg), 'undefined', 'no debug hook in a production page without ?debug=1');
    assert.equal(await ok.page.evaluate(() => document.getElementById('boot-failure')), null);
    const title = await ok.page.evaluate(() => document.getElementById('ui').textContent);
    // the stub UI's plate starts the run on a click anywhere; the real UI's title is a menu: its first item is "play"
    const playItem = await ok.page.$('[data-item="play"]');
    if (playItem) await playItem.click(); else await ok.page.mouse.click(160, 90);
    await ok.page.waitForFunction(() => document.pointerLockElement === document.getElementById('game'), null, { timeout: 90000 });
    await ok.page.waitForFunction((t) => document.getElementById('ui').textContent !== t, title, { timeout: 90000 });   // the title plate is gone: the run began
    assert.deepEqual(ok.errors, []);
    await ok.page.close();
    // ---- one manifest file answers 404: a production page does not synthesise it; the boot fails, and says so on the page
    const bad = await open((page) => page.route('**/assets/env/env_plenty_street.glb*', (route) => route.fulfill({ status: 404, body: '' })));
    await bad.page.waitForFunction(() => document.getElementById('boot-failure') !== null, null, { timeout: 90000 });
    const shown = await bad.page.evaluate(() => ({ line: document.getElementById('boot-failure').textContent, title: document.title, visible: document.getElementById('boot-failure').getBoundingClientRect().height > 0 }));
    // plain words only (polish round 3): no asset id, no path, no exception text; those are in the console line below
    assert.equal(shown.line, 'KEEP SEVEN could not start. A file it needs would not load. Check the connection. Reload the page to try again.');
    assert.ok(!shown.line.includes('\n') && shown.visible, 'one plain visible line');
    assert.equal(shown.title, 'KEEP SEVEN');
    assert.ok(bad.errors.some((e) => e.startsWith('[boot] Error: asset \'env_plenty_street\'')), bad.errors.join(' | '));
    await bad.page.close();
  } finally { await browser.close(); await prod.close(); }
  // and a dev server started after a build is a dev server (it ran with NODE_ENV=production before)
  const dev = await startServer({ pieces: PIECES });
  try {
    const game = await openGame(dev, { piece: PIECE, stubs: 'all', start: false, query: { assets: 'none' } });
    try {
      const report = await game.page.evaluate(() => window.__dbg.ext.assets.report());
      assert.ok(report.assetsSynthesised > 0, 'dev: ?assets=none synthesises (import.meta.env.DEV is true)');
    } finally { await game.close(); }
  } finally { await dev.close(); }
});

test('without WebGL the page says so in one plain line (dev and production), instead of staying black', async () => {
  const prod = await startServer({ mode: 'build', pieces: PIECES });
  const browser = await launchBrowser({ args: ['--disable-3d-apis'] });
  try {
    for (const [name, url] of [['production', prod.url], ['dev', server.url + '?stubs=all']]) {
      const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
      const errors = [];
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(url);
      await page.waitForFunction(() => document.getElementById('boot-failure') !== null, null, { timeout: 90000 });
      const shown = await page.evaluate(() => ({ line: document.getElementById('boot-failure').textContent, body: document.body.innerText.trim(), error: window.__dbg && window.__dbg.error, ready: window.__dbg && window.__dbg.ready }));
      assert.match(shown.line, /^KEEP SEVEN cannot start: this browser or device does not provide WebGL 2\.$/, `${name}: ${shown.line}`);
      assert.ok(shown.body.includes(shown.line), `${name}: the line is visible text of the page`);
      assert.ok(shown.error && shown.ready === false, `${name}: a harness sees the failure at once`);
      assert.ok(errors.some((e) => e.startsWith('[boot] ')), `${name}: the console has the full error`);
      if (name === 'production') await page.screenshot({ path: path.join(ROOT, 'shots', PIECE, 'boot_no_webgl.png') });
      await page.close();
    }
  } finally { await browser.close(); await prod.close(); }
});

test('__dbg.tap works under the real-time loop too: one tick of fire is one shot, 30 ticks of forward are 2.5 m', async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 320, height: 180 }, deviceScaleFactor: 1 });
  try {
    await page.goto(server.url + '?stubs=all');                  // dev, no ?test=1: the rAF loop runs the ticks, not __dbg.step
    await page.waitForFunction(() => window.__dbg && window.__dbg.ready, null, { timeout: 90000 });
    await page.evaluate(() => window.__dbg.start({ checkpoint: 'cp_street_clear' }));
    await page.evaluate(() => { window.__dbg.god(true); window.__dbg.setAim(90, 0); });
    const tickNow = () => page.evaluate(() => window.__dbg.state().tick);
    const after = async (ticks) => { const t = await tickNow(); await page.waitForFunction((n) => window.__dbg.state().tick > n, t + ticks, { timeout: 90000 }); };
    await after(5);
    assert.equal(await page.evaluate(() => window.__dbg.state().game), 'playing');
    await page.evaluate(() => window.__dbg.tap('fire'));
    await page.waitForFunction(() => window.__dbg.events(0, 'weapon/fired').length === 1, null, { timeout: 90000 });
    await after(20);
    assert.equal(await page.evaluate(() => window.__dbg.events(0, 'weapon/fired').length), 1, 'one tap is one press: one shot');
    const x0 = await page.evaluate(() => window.__dbg.player().x);
    await page.evaluate(() => window.__dbg.tap('forward', 30));
    await after(60);
    const x1 = await page.evaluate(() => window.__dbg.player().x);
    assert.ok(Math.abs((x0 - x1) - 30 * 5 / 60) < 0.1, `30 ticks of walking west at 5 m/s: ${(x0 - x1).toFixed(3)} m`);
    await after(10);
    assert.equal(await page.evaluate(() => window.__dbg.player().x), x1, 'the tap was released');
    assert.equal(await page.evaluate(() => window.__dbg.error), null);
  } finally { await browser.close(); }
});

test('real time: a refused pointer lock brings the pause plate back, and the click that finally takes the pointer is not a shot', async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 320, height: 180 }, deviceScaleFactor: 1 });
  try {
    // every pointer-lock request is refused until the test says otherwise (Chrome refuses for about 1.25 s after Esc)
    await page.addInitScript(() => {
      const real = HTMLCanvasElement.prototype.requestPointerLock;
      window.__refuseLock = true; window.__lockRequests = 0;
      HTMLCanvasElement.prototype.requestPointerLock = function (options) {
        window.__lockRequests++;
        return window.__refuseLock ? Promise.reject(new DOMException('refused', 'NotAllowedError')) : real.call(this, options);
      };
    });
    await page.goto(server.url + '?stubs=all');
    await page.waitForFunction(() => window.__dbg && window.__dbg.ready, null, { timeout: 90000 });
    const st = () => page.evaluate(() => { const s = window.__dbg.state(); return { game: s.game, lock: document.pointerLockElement !== null, fired: window.__dbg.events(0, 'weapon/fired').length, states: window.__dbg.events(0, 'game/state').map((e) => e.payload.to).join('>'), plate: document.getElementById('null-ui-screen').textContent }; });
    // the click on the title: the run starts, the lock is refused while it loads -> paused on the first tick of play
    await page.mouse.click(160, 90);
    await page.waitForFunction(() => window.__dbg.state().game === 'paused', null, { timeout: 90000 });
    let s = await st();
    assert.equal(s.states, 'title>loading>playing>paused', 'a run never plays on without the pointer');
    assert.match(s.plate, /^Paused/);
    assert.equal(s.lock, false);
    // the click on resume, refused again (the critic's case): playing, then paused again, with the plate
    await page.mouse.click(160, 90);
    await page.waitForFunction(() => window.__dbg.events(0, 'game/state').length >= 6, null, { timeout: 90000 });
    s = await st();
    assert.equal(s.states, 'title>loading>playing>paused>playing>paused');
    assert.match(s.plate, /^Paused/);
    assert.equal(s.fired, 0);
    // the lock is granted now: the click resumes, takes the pointer and is not a shot
    await page.evaluate(() => { window.__refuseLock = false; });
    await page.mouse.click(160, 90);
    await page.waitForFunction(() => window.__dbg.state().game === 'playing' && document.pointerLockElement !== null, null, { timeout: 90000 });
    await page.waitForFunction((t) => window.__dbg.state().tick > t + 10, (await page.evaluate(() => window.__dbg.state())).tick, { timeout: 90000 });
    s = await st();
    assert.deepEqual([s.game, s.lock, s.fired], ['playing', true, 0]);
    await page.mouse.click(160, 90);
    await page.waitForFunction(() => window.__dbg.events(0, 'weapon/fired').length === 1, null, { timeout: 90000 });
    assert.equal(await page.evaluate(() => window.__dbg.error), null);
  } finally { await browser.close(); }
});

test('the debug hook refuses NaN and names outside the contract, and state() does not hide a NaN', async () => {
  const game = await openGame(server, { piece: PIECE, stubs: 'all', checkpoint: 'cp_street_clear' });
  try {
    const out = await game.page.evaluate(() => {
      const dbg = window.__dbg, thrown = {};
      const before = dbg.hash();
      for (const [name, call] of Object.entries({
        walkTo: () => dbg.walkTo(NaN, NaN), teleport: () => dbg.teleport(NaN, 0, 0), teleportYaw: () => dbg.teleport(0, 0, 0, Infinity), aimAt: () => dbg.aimAt(0, NaN, 0),
        setAim: () => dbg.setAim(NaN, 0), look: () => dbg.look(1, undefined * 1), spawnPos: () => dbg.spawnEnemy('bider', 0, NaN, 0), spawnKind: () => dbg.spawnEnemy('bogus', 0, 0, 0),
        setBossPhase: () => dbg.setBossPhase('p9'), setHealth: () => dbg.setHealth(NaN),
      })) { try { call(); thrown[name] = 'no throw'; } catch (e) { thrown[name] = String(e.message); } }
      dbg.step(2, false);
      const p = dbg.player();
      return { thrown, same: dbg.hash() !== '' && dbg.enemies().length === 0 && dbg.state().boss.phase === 'idle', before, finite: [p.x, p.y, p.z, p.yawDeg].every((v) => Number.isFinite(v)), error: dbg.error };
    });
    assert.match(out.thrown.walkTo, /^__dbg\.walkTo: x is NaN/);
    assert.match(out.thrown.teleport, /^__dbg\.teleport: x is NaN/);
    assert.match(out.thrown.teleportYaw, /^__dbg\.teleport: yawDeg is Infinity/);
    assert.match(out.thrown.aimAt, /^__dbg\.aimAt: y is NaN/);
    assert.match(out.thrown.setAim, /^__dbg\.setAim: yawDeg is NaN/);
    assert.match(out.thrown.look, /^__dbg\.look: dy is NaN/);
    assert.match(out.thrown.spawnPos, /^__dbg\.spawnEnemy: y is NaN/);
    assert.match(out.thrown.spawnKind, /^__dbg\.spawnEnemy: unknown id 'bogus' \(bider, transit, tamper, windlass\)/);
    assert.match(out.thrown.setBossPhase, /^__dbg\.setBossPhase: unknown id 'p9'/);
    assert.match(out.thrown.setHealth, /^__dbg\.setHealth: hp is NaN/);
    assert.ok(out.same && out.finite, 'nothing was spawned, the boss is idle, the player is where she was');
    assert.equal(out.error, null);
    // a NaN that a system produced (here: put there by hand) is written as 0 in the snapshot AND reported
    const nan = await game.page.evaluate(() => {
      const dbg = window.__dbg, pos = dbg.ext.core.ctx().player.position;
      const keep = pos.x;
      pos.x = NaN;
      const s = dbg.state();
      const error = dbg.error;
      pos.x = keep;
      dbg.error = null;
      const clean = dbg.state();
      return { x: s.player.x, error, after: dbg.error, back: clean.player.x === Math.round(keep * 1e4) / 1e4 };
    });
    assert.equal(nan.x, 0);
    assert.equal(nan.error, 'state(): player.x is NaN');
    assert.ok(nan.after === null && nan.back);
  } finally { await game.close(); }
});

test('nullWorld commits the four boss checkpoints on the boss\'s events, not by standing on their markers', async () => {
  const game = await openGame(server, { piece: PIECE, stubs: 'all', checkpoint: 'cp_bore_ante' });
  try {
    const cp = async () => (await game.state()).world.checkpoint;
    await game.dbg('god', true);
    // the four markers are 0.5 m apart: standing there commits nothing
    for (const id of ['cp_boss_p1', 'cp_boss_p2', 'cp_boss_p3', 'cp_boss_proven']) {
      assert.equal(await game.dbg('teleportToMarker', id), true);
      await game.step(10);
      assert.equal(await cp(), 'cp_bore_ante', `standing on ${id}`);
    }
    await game.dbg('teleportToMarker', 'cp_boss_p1');
    const seq = (await game.events(0)).at(-1).seq;
    await game.dbg('setBossPhase', 'p1');
    await game.step(30);
    assert.equal(await cp(), 'cp_boss_p1', 'boss/phase p1, and it stays p1 while she stands beside the other three markers');
    await game.dbg('setBossPhase', 'p2');
    await game.step(5);
    assert.equal(await cp(), 'cp_boss_p2');
    await game.dbg('setBossPhase', 'p3a');
    await game.step(5);
    let s = await game.state();
    assert.deepEqual([s.world.checkpoint, s.world.objective], ['cp_boss_p3', 'obj_boss_unproven']);
    await game.page.evaluate(() => window.__dbg.emit('boss/proven', { x: 14, y: -44, z: 85 }));
    await game.step(5);
    s = await game.state();
    assert.deepEqual([s.world.checkpoint, s.world.objective], ['cp_boss_proven', 'obj_boss_dry']);
    assert.deepEqual((await game.events(seq, 'checkpoint/saved')).map((e) => e.payload.id), ['cp_boss_p1', 'cp_boss_p2', 'cp_boss_p3', 'cp_boss_proven']);
  } finally { await game.close(); }
  // a death in phase 1 comes back at cp_boss_p1 (it used to come back at cp_boss_proven)
  const again = await openGame(server, { piece: PIECE, stubs: 'all', checkpoint: 'cp_boss_p1' });
  try {
    await again.step(10);
    assert.equal((await again.state()).world.checkpoint, 'cp_boss_p1');
    const s = await again.run([{ call: ['setHealth', 0] }, { steps: 200 }]);
    assert.deepEqual([s.game, s.world.checkpoint, s.player.alive], ['playing', 'cp_boss_p1', true]);
    // a place still commits by proximity; an encounter's and a puzzle's checkpoint do not
  } finally { await again.close(); }
  const place = await openGame(server, { piece: PIECE, stubs: 'all', checkpoint: 'cp_lip_start' });
  try {
    await place.dbg('god', true);
    for (const id of ['cp_lip_gate', 'cp_street_clear', 'cp_yard_clear']) { await place.dbg('teleportToMarker', id); await place.step(5); }
    assert.equal((await place.state()).world.checkpoint, 'cp_lip_start', 'gate, street and yard checkpoints belong to a puzzle and two encounters');
    await place.dbg('teleportToMarker', 'cp_tally_enter');
    await place.step(5);
    assert.equal((await place.state()).world.checkpoint, 'cp_tally_enter', 'entering the hall is a place');
  } finally { await place.close(); }
  const solved = await openGame(server, { piece: PIECE, stubs: 'all', checkpoint: 'cp_lip_start' });
  try {
    await solved.dbg('solvePuzzle', 'seven_jugs');
    assert.equal((await solved.state()).world.checkpoint, 'cp_lip_gate', 'the jug gate opening commits cp_lip_gate');
    await solved.dbg('clearEncounter', 'enc_street');
    assert.equal((await solved.state()).world.checkpoint, 'cp_street_clear');
  } finally { await solved.close(); }
});

