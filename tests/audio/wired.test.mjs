// Wired into the game (index page: src/audio in its slot, core stubs in the other five): no bullet produces nothing,
// audio never changes __dbg.hash(), the event-level behaviour is the same on every run, and the unlock path.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser } from '../../tools/browser.mjs';
import { audioServer, closeLive, openIndex } from './lib.mjs';

let server;
before(async () => { server = await audioServer(); });
after(async () => { await server.close(); });

/** a short stretch of real play beside the stubs: enemies, shots by input, an encounter, a zone walk; -> what audio did */
async function play(game, { unlock = false } = {}) {
  await game.run([{ call: ['god', true] }, { call: ['aiEnabled', false] }]);
  if (unlock) {
    await game.page.evaluate(async () => { const a = window.__dbg.ext.audio; a.unlock(); for (let i = 0; i < 100 && !a.status().active; i++) await new Promise((r) => setTimeout(r, 10)); });
  }
  const ids = [];
  for (let i = 0; i < 4; i++) ids.push(await game.dbg('spawnEnemy', i % 2 ? 'transit' : 'bider', -74 - i * 1.5, 0, -3 + i, 90));
  const script = [{ steps: 20 }];
  for (const id of ids) script.push({ aimAtEntity: id, steps: 2 }, { tap: 'fire', steps: 30 });
  script.push({ aim: [90, -30], steps: 2 });
  for (let k = 0; k < 8; k++) script.push({ tap: 'fire', steps: 30 });        // into the ground: the cylinder runs dry on the way
  await game.run(script);
  await game.page.evaluate(() => { window.__dbg.emit('encounter/started', { id: 'enc_street' }); });
  await game.step(200);
  await game.page.evaluate(() => { window.__dbg.emit('encounter/cleared', { id: 'enc_street', seconds: 3 }); });
  await game.walkTo(-62, -2, { maxTicks: 600 });
  await game.step(600);
  return game.page.evaluate(() => {
    const dbg = window.__dbg, ctx = dbg.ext.core.ctx();
    const names = (n) => dbg.events(0, n);
    return {
      hash: dbg.hash(), audio: dbg.state().systems.audio, recent: ctx.audio.recent(128),
      fired: names('weapon/fired').map((e) => e.tick), dry: names('weapon/dry_fire').map((e) => e.tick), hits: names('combat/hit').map((e) => [e.tick, e.payload.outcome, e.payload.surface]),
      says: names('story/say').map((e) => [e.tick, e.payload.key]), music: names('music/state').map((e) => [e.tick, e.payload.state, e.payload.intensity]),
      status: dbg.ext.audio.status(), perfVoices: dbg.perf().audioVoices,
    };
  });
}

test('in the game: every weapon/fired and every combat/hit starts a sound on its tick; the reports carry their impacts', async () => {
  const game = await openIndex(server);
  try {
    const out = await play(game);
    assert.ok(out.fired.length >= 6, `shots: ${out.fired.length}`);
    const at = (tick) => out.recent.filter((r) => r.tick === tick).map((r) => r.name);
    for (const tick of out.fired) assert.ok(at(tick).includes('gun_report'), `the shot of tick ${tick} has a report (${at(tick).join(', ')})`);
    for (const [tick, outcome, surface] of out.hits) assert.ok(at(tick).length >= 2, `the ${outcome} on ${surface} of tick ${tick} has a sound beside the report (${at(tick).join(', ')})`);
    assert.ok(out.hits.some(([, o]) => o === 'kill' || o === 'freed'), 'the stub enemies fell');
    assert.ok(out.hits.some(([, o]) => o === 'impact'));
    for (const tick of out.dry) assert.ok(at(tick).includes('dry_fire'), `dry click at ${tick}`);
    assert.equal(out.status.dropped, 0);
    assert.equal(out.audio.zone, 'plenty_street');
    assert.deepEqual(out.music.map((m) => m[1] + ':' + m[2]).slice(-3), ['calm:0', 'combat:1', 'calm:0']);
    console.log(`wired: ${out.fired.length} shots, ${out.hits.length} hits (${[...new Set(out.hits.map((h) => h[1]))].join(', ')}), ${out.dry.length} dry clicks: each has its sound on its tick; ${out.status.starts} sounds started with the context ${out.status.active ? 'running' : 'locked'}`);
  } finally { await game.close(); }
});

test('determinism: two loads give the same sounds, captions, music states and hash; a running context changes none of them', async () => {
  const runs = [];
  for (const unlock of [false, false, true]) {
    const game = await openIndex(server);
    try { runs.push(await play(game, { unlock })); } finally { await closeLive(game); }
  }
  const [a, b, c] = runs;
  assert.equal(a.status.active, false); assert.equal(c.status.active, true);
  assert.ok(c.status.nodes > a.status.nodes + 200, `the third run really played: ${c.status.nodes} nodes against ${a.status.nodes}`);
  for (const other of [b, c]) {
    assert.equal(other.hash, a.hash, 'hash');
    assert.deepEqual(other.audio, a.audio, 'debugState');
    assert.deepEqual(other.recent, a.recent, 'recent()');
    assert.deepEqual(other.says, a.says); assert.deepEqual(other.music, a.music);
  }
  assert.ok(a.recent.some((r) => r.name.startsWith('amb_') || r.name === 'pump_clatter'), 'the seeded ambience played');
  console.log(`wired: three loads, hash ${a.hash} each (the third with the context running: ${c.status.nodes} nodes against ${a.status.nodes}); ${a.recent.length} sounds, ${a.music.length} music states identical`);
});

test('unlock: with the real autoplay policy nothing is scheduled before the gesture, nothing throws, and nothing lands in the past after it', async () => {
  // tools/browser.mjs allows autoplay; the last switch wins, so this page gets the policy a player's browser has
  const browser = await launchBrowser({ args: ['--autoplay-policy=document-user-activation-required'] });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(server.url + 'sandbox/audio.html?test=1&seed=1');
    await page.waitForFunction(() => window.__dbg && window.__dbg.ready === true && document.querySelectorAll('#board button').length > 100, null, { timeout: 120000 });
    const before = await page.evaluate(async () => {
      const dbg = window.__dbg, a = dbg.ext.audio, s0 = a.status();
      const fire = () => document.querySelector('[data-b="gun:fire"]').click();      // a scripted click is not a gesture
      for (let k = 0; k < 12; k++) { fire(); dbg.emit('audio/cue', { cue: 'gate_bang', x: 0, y: 0, z: 0, positional: false, gain: 1, pitch: 1 }); await dbg.ext.core.stepAsync(30, k % 4 === 0); }
      // (Playwright runs page.evaluate as a user gesture, so unlock() is not called from here: only the real click below)
      await new Promise((r) => setTimeout(r, 300));
      const s1 = a.status();
      return { s0, s1, recent: dbg.ext.core.ctx().audio.recent(64).length, error: dbg.error };
    });
    assert.equal(before.s0.context, 'suspended', 'created at boot, suspended');
    assert.equal(before.s1.context, 'suspended', 'still suspended after twelve shots');
    assert.equal(before.s1.unlocked, false);
    assert.equal(before.s1.currentTime, 0);
    assert.equal(before.s1.nodes, before.s0.nodes, 'no sound was scheduled while it could not play');
    assert.ok(before.s1.starts >= 24 && before.recent >= 24, 'and every handler still did its bookkeeping');
    assert.equal(before.s1.active, false);
    await page.click('#status');                              // the first real gesture
    await page.waitForFunction(() => window.__dbg.ext.audio.status().active, null, { timeout: 30000 });
    const after = await page.evaluate(async () => {
      const dbg = window.__dbg, a = dbg.ext.audio, s2 = a.status();
      dbg.emit('weapon/fired', { shotId: 99, ammo: 'lead_round', chambersLeft: 4, ox: 0, oy: 1.65, oz: 0, dx: 0, dy: 0, dz: -1, mx: 0, my: 1.5, mz: 0, endX: 0, endY: 0, endZ: -40 });
      const s3 = a.status();
      await new Promise((r) => setTimeout(r, 200));
      return { s2, s3, s4: a.status(), error: dbg.error };
    });
    assert.equal(after.s2.context, 'running');
    assert.equal(after.s2.nodes, before.s1.nodes, 'the backlog of the locked minutes is not played at the unlock');
    // (a pre-rendered report is a buffer source, the voice's gain and its room send; before the bake lands, the recipe's 45 nodes)
    assert.ok(after.s3.nodes >= after.s2.nodes + 2, `the next shot is built: ${after.s3.nodes - after.s2.nodes} nodes`);
    assert.ok(after.s2.currentTime < 1, `the context's clock starts at the gesture: ${after.s2.currentTime}`);
    assert.ok(after.s4.currentTime > after.s2.currentTime, 'and runs');
    assert.equal(after.error, null);
    assert.deepEqual(errors, []);
    console.log(`wired: unlock: suspended at boot, ${before.s1.starts} sounds logged and 0 nodes built while locked; after one real click running at ${after.s2.sampleRate} Hz, base latency ${(after.s2.baseLatency * 1000).toFixed(1)} ms, the next shot built ${after.s3.nodes - after.s2.nodes} nodes`);
  } finally { await browser.close(); }
});

// ---- fix round 3 ------------------------------------------------------------------------------------------------------
test('on the game page, beside the stand-in UI (which never calls unlock): the first real click unlocks audio; a NaN payload then throws nothing', async () => {
  const browser = await launchBrowser({ args: ['--autoplay-policy=document-user-activation-required'] });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    const DEVICE = /AudioContext encountered an error from the audio device/;
    page.on('console', (m) => { if (m.type() === 'error' && !DEVICE.test(m.text())) errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(server.url + 'index.html?test=1&seed=1&stubs=world,player,enemies,render,ui');
    await page.waitForFunction(() => window.__dbg && window.__dbg.ready === true, null, { timeout: 120000 });
    const s0 = await page.evaluate(() => window.__dbg.ext.audio.status());
    // (Playwright's own evaluate counts as a user activation and Chromium then resumes a context whose sources were
    // started, so the context may already run here: what keeps the game silent is that nobody has called unlock())
    assert.deepEqual([s0.unlocked, s0.active], [false, false], 'locked at boot: nobody has called unlock()');
    // a synthetic event is not a gesture and is ignored
    await page.evaluate(() => { window.dispatchEvent(new Event('pointerdown')); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' })); });
    assert.equal((await page.evaluate(() => window.__dbg.ext.audio.status())).unlocked, false, 'a scripted event does not unlock');
    await page.mouse.click(480, 270);                         // the first real gesture, anywhere on the page
    await page.waitForFunction(() => window.__dbg.ext.audio.status().active, null, { timeout: 30000 });
    const live = await page.evaluate(async () => {
      const dbg = window.__dbg, a = dbg.ext.audio, s1 = a.status();
      const bad = Number.NaN;
      dbg.emit('combat/hit', { x: bad, y: bad, z: bad, shotId: 1, order: 0, ammo: 'lead_round', outcome: 'impact', entityId: '', entityKind: 'world', part: 'body', surface: 'stone', nx: 0, ny: 1, nz: 0, damage: 0, ricochetX: 0, ricochetY: 0, ricochetZ: 0 });
      dbg.emit('boss/mouth', { mouth: bad, state: 'dark' });
      dbg.emit('story/line', { key: 'stn_x', speaker: 'station', seconds: 3 });
      dbg.emit('audio/cue', { cue: 'gate_bang', x: bad, y: bad, z: bad, positional: true, gain: Infinity, pitch: bad });
      const s2 = a.status();
      await new Promise((r) => setTimeout(r, 150));
      return { s1, s2, error: dbg.error, recent: dbg.ext.core.ctx().audio.recent(4).map((r) => r.name) };
    });
    assert.deepEqual([live.s1.context, live.s1.unlocked, live.s1.active], ['running', true, true]);
    assert.equal(live.error, null, 'nothing threw inside a handler');
    assert.deepEqual(live.recent, ['impact_stone', 'chamber', 'station_line', 'gate_bang']);
    assert.ok(live.s2.nodes > live.s1.nodes, `the four sounds were really built: ${live.s2.nodes - live.s1.nodes} nodes`);
    assert.deepEqual(errors, []);
    console.log(`wired: index page, stub UI: locked at boot, a synthetic event ignored, a real click -> running and active; four NaN payloads built ${live.s2.nodes - live.s1.nodes} nodes, no error`);
  } finally { await browser.close(); }
});
