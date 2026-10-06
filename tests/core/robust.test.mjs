// Nothing may strand her (polish round 2: playthrough blocker, robustness majors). The net under the world, a flow job
// that throws, a save this build cannot apply, a set that will not load, the title after a quit, a lost pointer lock on
// the death card, a lost WebGL context, and what a set leaves on the GPU when it is released.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { openGame, startServer } from '../harness.mjs';
import { LAYOUT, PIECES, STUBS } from './route.mjs';

const PIECE = 'foundation-core';
let server;
before(async () => { server = await startServer({ pieces: PIECES }); });
after(async () => { await server.close(); });
const marker = (id) => LAYOUT.markers.find((m) => m.id === id);
const flow = (game) => game.page.evaluate(() => window.__dbg.ext.core.flow());
const FLOW_ERRORS = /\[flow\]/;

test('the net under the world: out of bounds below the lowest floor, she is back on her checkpoint, alive and playing', async () => {
  const game = await openGame(server, { piece: PIECE, stubs: STUBS, checkpoint: 'cp_street_clear' });
  try {
    const cp = marker('cp_street_clear');
    await game.step(30);
    const before = (await game.events(0, 'player/died')).length;
    // where the north alley used to end: past the world's east edge, in free fall
    await game.dbg('teleport', 6, -40, -14.5, 0, 0);
    await game.step(1);
    assert.equal((await flow(game)).fallsCaught, 0, 'y -40 is above the bore: not yet');
    await game.dbg('teleport', 6, -80, -14.5, 0, 0);
    const s = await game.run([{ steps: 30 }]);
    assert.equal(s.game, 'playing');
    assert.equal((await flow(game)).fallsCaught, 1);
    assert.ok(Math.hypot(s.player.x - cp.pos[0], s.player.z - cp.pos[2]) < 0.5 && Math.abs(s.player.y - cp.pos[1]) < 0.5, `at the checkpoint: ${[s.player.x, s.player.y, s.player.z]}`);
    assert.ok(s.player.alive && s.player.health > 0);
    assert.equal((await game.events(0, 'player/died')).length, before, 'no death: she is put back');
    assert.ok((await game.events(0, 'player/respawned')).some((e) => e.payload.checkpoint === 'cp_street_clear'));
    await game.step(120);
    assert.equal((await flow(game)).fallsCaught, 1, 'once');
  } finally { await game.close(); }
});

test('the north alley of Front Street is closed at its east end (layout solid st_alley_cap_n)', async () => {
  const cap = LAYOUT.solids.find((s) => s.id === 'st_alley_cap_n');
  assert.ok(cap, 'the solid exists');
  const game = await openGame(server, { piece: PIECE, stubs: STUBS, checkpoint: 'cp_street_clear' });
  try {
    // from inside the alley, walk east at the wall for ten seconds: the critic's exit was at (0.1, 0, -14.66)
    await game.dbg('teleport', -6, 0, -13.5, 0, 0);
    await game.step(5);
    let worst = -Infinity, low = Infinity;
    for (const z of [-14.6, -13.5, -12.4]) {
      await game.dbg('teleport', -6, 0, z, 0, 0);
      const r = await game.walkTo(6, z, { maxSteps: 600 });
      const s = await game.state();
      worst = Math.max(worst, s.player.x); low = Math.min(low, s.player.y);
      assert.ok(s.player.x < -0.3 && s.player.x > -0.7, `z ${z}: stopped at the drawn wall (its face is at x 0.03), at x ${s.player.x.toFixed(2)} (${JSON.stringify(r)})`);
    }
    assert.ok(low > -0.05, 'never below the street');
    assert.equal((await flow(game)).fallsCaught, 0);
  } finally { await game.close(); }
});

test('a flow job that throws in loading goes back to the title with one plain line; the next Begin works', async () => {
  const game = await openGame(server, { piece: PIECE, stubs: STUBS, start: false, ignoreConsole: FLOW_ERRORS, allowErrors: true });
  try {
    const out = await game.page.evaluate(async () => {
      const dbg = window.__dbg, ctx = dbg.ext.core.ctx();
      const real = ctx.world.beginRun.bind(ctx.world);
      let fail = 1;
      ctx.world.beginRun = (save) => (fail-- > 0 ? Promise.reject(new Error("texture 'lm_gallery': file assets/lm/lm_gallery.webp failed to load")) : real(save));
      dbg.emit('ui/action', { action: 'play' });
      await dbg.ext.core.idle();
      const failed = { game: dbg.state().game, flow: dbg.ext.core.flow(), notice: document.getElementById('flow-notice')?.textContent ?? '', shown: document.getElementById('flow-notice')?.style.display !== 'none' };
      dbg.emit('ui/action', { action: 'play' });
      await dbg.ext.core.idle();
      dbg.step(1, false);
      return { failed, game: dbg.state().game, noticeShown: document.getElementById('flow-notice')?.style.display !== 'none', states: dbg.events(0, 'game/state').map((e) => e.payload.from + '>' + e.payload.to + ':' + e.payload.reason) };
    });
    assert.equal(out.failed.game, 'title', 'not stranded on LOADING');
    assert.match(out.failed.flow.lastFailure.message, /failed to load/);
    assert.ok(out.failed.shown && out.failed.notice.length > 10, 'one plain line says why');
    assert.ok(out.states.includes('loading>title:load_failed'));
    assert.equal(out.game, 'playing', 'the second Begin starts the run');
    assert.equal(out.noticeShown, false, 'the line goes with the title');
  } finally { await game.close(); }
});

test('a save this build cannot apply: "Go on" drops it and returns to the title; a save of the wrong shape is never offered', async () => {
  const query = { persist: 1 };
  const game = await openGame(server, { piece: PIECE, stubs: STUBS, query, checkpoint: 'cp_yard_clear', ignoreConsole: FLOW_ERRORS, allowErrors: true });
  try {
    await game.step(5);
    const good = await game.page.evaluate(() => localStorage.getItem('keepseven.save.v1'));
    assert.ok(good && JSON.parse(good).checkpoint === 'cp_yard_clear');
    const url = server.url + '?test=1&persist=1&seed=1' + (STUBS ? '&stubs=' + STUBS.join(',') : '');
    const reload = async (save) => {
      await game.page.evaluate((text) => localStorage.setItem('keepseven.save.v1', text), save);
      await game.page.goto(url);
      await game.page.waitForFunction(() => window.__dbg && window.__dbg.ready);
      return game.page.evaluate(() => ({ game: window.__dbg.state().game, offered: window.__dbg.ext.core.ctx().save.hasStoredSave() }));
    };
    // the shapes the critic's corrupt saves had: none of them is offered as "Go on"
    const base = JSON.parse(good);
    const bad = {
      unknownCheckpoint: { ...base, checkpoint: 'cp_does_not_exist' },
      emptyParts: { ...base, player: {}, world: {}, enemies: {} },
      partsAreStrings: { ...base, player: 'x', world: 'y', enemies: 'z' },
      worldEmpty: { ...base, world: {} },
    };
    for (const [name, save] of Object.entries(bad)) {
      const r = await reload(JSON.stringify(save));
      assert.deepEqual(r, { game: 'title', offered: false }, name);
    }
    // a save that passes the shape check and still cannot be applied (a system throws): dropped, title, no LOADING
    const r = await reload(good);
    assert.deepEqual(r, { game: 'title', offered: true });
    const out = await game.page.evaluate(async () => {
      const dbg = window.__dbg, ctx = dbg.ext.core.ctx();
      ctx.world.applySave = () => { throw new TypeError("Cannot read properties of undefined (reading 'includes')"); };
      dbg.emit('ui/action', { action: 'continue' });
      await dbg.ext.core.idle();
      return { game: dbg.state().game, offered: ctx.save.hasStoredSave(), stored: localStorage.getItem('keepseven.save.v1'), flow: dbg.ext.core.flow(), notice: document.getElementById('flow-notice')?.textContent ?? '' };
    });
    assert.equal(out.game, 'title');
    assert.equal(out.offered, false);
    assert.equal(out.stored, null, 'the unusable save is gone: a reload does not offer it again');
    assert.match(out.flow.lastFailure.message, /includes/);
    assert.ok(out.notice.length > 10);
    await game.page.evaluate(() => localStorage.clear());
  } finally { await game.close(); }
});

test('quit to title: the overhang shot again, the surface set resident, the save kept, nothing saved from the title', async () => {
  const query = { persist: 1 };
  const game = await openGame(server, { piece: PIECE, stubs: STUBS, query, checkpoint: 'cp_hall_gantry' });
  try {
    await game.step(10);
    const saved = (await game.events(0, 'checkpoint/saved')).length;
    await game.dbg('pause', true);
    const s = await game.run([{ call: ['emit', 'ui/action', { action: 'quit_to_title' }] }, { steps: 120 }]);
    assert.equal(s.game, 'title');
    assert.equal(s.world.set, 'surface');
    assert.deepEqual([s.player.x, s.player.y, s.player.z], marker('player_start').pos);
    assert.equal((await game.events(0, 'checkpoint/saved')).length, saved, 'no checkpoint is committed on the title');
    const stored = await game.page.evaluate(() => JSON.parse(localStorage.getItem('keepseven.save.v1')).checkpoint);
    assert.equal(stored, 'cp_hall_gantry', '"Go on" still has the run she quit');
    const back = await game.page.evaluate(async () => {
      const dbg = window.__dbg;
      dbg.emit('ui/action', { action: 'continue' });
      await dbg.ext.core.idle();
      dbg.step(1, false);
      return dbg.state();
    });
    assert.equal(back.game, 'playing');
    assert.equal(back.world.checkpoint, 'cp_hall_gantry');
    assert.equal(back.world.set, 'underground');
    await game.page.evaluate(() => localStorage.clear());
  } finally { await game.close(); }
});

test('real time: a pointer lock lost on the death card pauses the respawn; a lost WebGL context pauses the fight', async () => {
  // no ?test=1: the real loop, the real lock handling (the dev page still has the hook)
  const game = await openGame(server, { piece: PIECE, stubs: STUBS, query: { test: 0 }, start: false, allowErrors: true });
  try {
    const poll = (cond, ms = 20000) => game.page.waitForFunction(cond, null, { timeout: ms, polling: 50 });
    await game.page.evaluate(() => { window.__dbg.emit('ui/action', { action: 'play' }); });
    await poll(() => ['playing', 'paused'].includes(window.__dbg.state().game));
    // headless Chromium may refuse the lock: that pause is the one loop.ts already made
    await game.page.evaluate(() => { const d = window.__dbg; if (d.state().game === 'paused') d.emit('ui/action', { action: 'resume' }); });
    await poll(() => window.__dbg.state().game === 'playing');
    // the real player absorbs the first fatal hit at 1 HP and has a grace time: hit until she is down
    for (let i = 0; i < 40 && (await game.page.evaluate(() => window.__dbg.state().game)) !== 'dead'; i++) {
      await game.page.evaluate(() => { window.__dbg.ext.core.damage(1000); });
      await new Promise((r) => setTimeout(r, 250));
    }
    await poll(() => window.__dbg.state().game === 'dead' || window.__dbg.events(0, 'player/died').length > 0);
    await game.page.evaluate(() => { window.__dbg.emit('input/pointer_lock', { locked: false }); });
    // the respawn (1.8 s later, same set: dead -> playing) must end paused, never 'playing' with a dead mouse
    await poll(() => window.__dbg.events(0, 'player/respawned').length > 0);
    await poll(() => window.__dbg.state().game === 'paused');
    const states = await game.page.evaluate(() => window.__dbg.events(0, 'game/state').map((e) => e.payload.from + '>' + e.payload.to + ':' + e.payload.reason));
    assert.ok(states.includes('playing>paused:focus_lost'), states.join(' '));
    assert.equal(await game.page.evaluate(() => window.__dbg.ext.core.ctx().state.pauseReason), 'focus_lost');

    // the WebGL context goes while she is playing
    await game.page.evaluate(() => { window.__dbg.emit('ui/action', { action: 'resume' }); });
    await poll(() => window.__dbg.state().game === 'playing');
    const lost = await game.page.evaluate(() => {
      const canvas = document.getElementById('game');
      const e = new Event('webglcontextlost', { cancelable: true });
      canvas.dispatchEvent(e);
      return { prevented: e.defaultPrevented, game: window.__dbg.state().game, flow: window.__dbg.ext.core.flow() };
    });
    assert.deepEqual([lost.prevented, lost.game, lost.flow.contextLost], [true, 'paused', true]);
    const restored = await game.page.evaluate(() => {
      document.getElementById('game').dispatchEvent(new Event('webglcontextrestored'));
      return window.__dbg.ext.core.flow().contextLost;
    });
    assert.equal(restored, false);
  } finally { await game.close(); }
});

test('real time: play without the pointer lock (a note closed after the lock went behind it) pauses itself within a second; no shot is fired', async () => {
  // polish round 3 (robustness major): nothing checked that the lock is held while 'playing'. A lock lost while paused on
  // a readable was ignored, the note closed into live play with a free cursor, and a click fired instead of re-locking.
  const game = await openGame(server, { piece: PIECE, stubs: STUBS, query: { test: 0 }, start: false, allowErrors: true });
  try {
    const poll = (cond, ms = 20000) => game.page.waitForFunction(cond, null, { timeout: ms, polling: 50 });
    await game.page.evaluate(() => { window.__dbg.emit('ui/action', { action: 'play' }); });
    await poll(() => ['playing', 'paused'].includes(window.__dbg.state().game));
    // a real click takes the pointer (the stub UI asks for nothing by itself); headless Chromium grants it
    await game.page.evaluate(() => {
      const ctx = window.__dbg.ext.core.ctx();
      document.addEventListener('mousedown', () => ctx.input.requestPointerLock(), { once: true });
    });
    await game.page.mouse.click(480, 270);
    await game.page.waitForFunction(() => window.__dbg.ext.core.ctx().input.pointerLocked, null, { timeout: 5000, polling: 50 }).catch(() => {});
    const locked = await game.page.evaluate(() => window.__dbg.ext.core.ctx().input.pointerLocked);
    // (that click was made in live play before the lock: the real player may answer it with a shot once her draw is done.
    // Not the path under test: let it pass before counting.)
    await game.page.waitForTimeout(1500);
    await game.page.evaluate(() => { const d = window.__dbg; if (d.state().game === 'paused') d.emit('ui/action', { action: 'resume' }); });
    await poll(() => window.__dbg.state().game === 'playing');
    // a pause (a note, a menu); the lock goes behind it (alt-tab, the browser's own Esc); the note closes
    const r = await game.page.evaluate(async () => {
      const d = window.__dbg, ctx = d.ext.core.ctx();
      const fired0 = d.events(0, 'weapon/fired').length;
      // the stub UI closes a 'readable' pause at once, so beside it any pause will do (the watchdog does not ask which).
      // With the real UI the pause IS a readable: since polish round 4 the lock lost behind a note pauses on the FIRST
      // tick of play (loop.ts 'input/pointer_lock'), not after the watchdog's 45 ticks of live play with a free cursor.
      const note = !d.ext.core.stubs().includes('ui');
      ctx.state.request('paused', 'pause', note ? 'readable' : 'menu');
      if (document.pointerLockElement) document.exitPointerLock();
      await new Promise((res) => setTimeout(res, 300));
      const inNote = { game: d.state().game, locked: ctx.input.pointerLocked };
      ctx.state.request('playing', 'resume');
      const t0 = performance.now();
      const closed = { game: d.state().game, locked: ctx.input.pointerLocked };
      const tick0 = Math.round(ctx.clock.unscaledTime * 60);
      while (d.state().game === 'playing' && performance.now() - t0 < 4000) await new Promise((res) => setTimeout(res, 20));
      return { inNote, closed, after: d.state().game, reason: ctx.state.pauseReason, ms: performance.now() - t0, fired: d.events(0, 'weapon/fired').length - fired0, asked: ctx.input.lockAsked, note, played: Math.round(ctx.clock.unscaledTime * 60) - tick0 };
    });
    assert.equal(r.asked, true, 'the lock was asked for');
    assert.deepEqual([r.inNote.game, r.inNote.locked], ['paused', false], 'the note stays open without the lock');
    assert.deepEqual([r.after, r.reason], ['paused', 'focus_lost'], JSON.stringify(r));
    assert.ok(r.ms < 2500, `paused after ${r.ms.toFixed(0)} ms (45 ticks of grace; lock granted at the start: ${locked})`);
    assert.equal(r.fired, 0);
    if (r.note) assert.ok(r.played <= 1, `a note closed without the lock: ${r.played} ticks of play before the pause (none may run with a free cursor)`);
  } finally { await game.close(); }
});

test('a released set leaves no bone texture behind: the GPU texture count is flat over set swaps and restarts', async () => {
  const game = await openGame(server, { piece: PIECE, stubs: STUBS, checkpoint: 'cp_yard_clear' });
  try {
    const count = async () => game.page.evaluate(() => { window.__dbg.step(2, true); return window.__dbg.ext.core.ctx().render.renderer.info.memory.textures; });
    const cycle = async () => {
      for (const cp of ['cp_hall_gantry', 'cp_rim', 'cp_yard_clear']) {
        await game.page.evaluate(async (id) => { await window.__dbg.checkpoint(id); await window.__dbg.ext.core.stepAsync(20, true); }, cp);
      }
      await game.dbg('pause', true);
      await game.run([{ call: ['emit', 'ui/action', { action: 'quit_to_title' }] }, { steps: 5 }, { call: ['emit', 'ui/action', { action: 'play' }] }, { steps: 5 }]);
      await game.page.evaluate(async () => { await window.__dbg.checkpoint('cp_yard_clear'); await window.__dbg.ext.core.stepAsync(20, true); });
      return count();
    };
    const a = await cycle(), b = await cycle(), c = await cycle(), d = await cycle();
    assert.ok(d <= b, `textures after cycles 1 to 4: ${[a, b, c, d]} (a leak grows with every cycle)`);
    console.log(`   textures after four swap-and-restart cycles: ${[a, b, c, d].join(', ')}`);
  } finally { await game.close(); }
});
