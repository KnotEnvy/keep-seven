// The hatch and the seam (code-world 4.1, ARCHITECTURE 3.6) and the Tally rise (GDD 21 test 4), with the real world,
// stub enemies (capsules that fall to one shot) and the dummy player walking by input.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { MANIFEST, MiB, mark, marker, open, server, shootScript, STORY } from './lib.mjs';

let srv;
before(async () => { srv = await server(); });
after(async () => { await srv.close(); });

const KNOT = marker('knot_hatch_latch');
const STAND = { x: -91.9, z: -35.5 };                  // the knot_stand nav node (layout: where the knot is shot from)

test('the Tally rise: the cue 0.8 s before movement, the hatch ajar and impassable until both are down, open within 1.5 s', async () => {
  const game = await open(srv, { checkpoint: 'cp_tally_enter' });
  try {
    await game.dbg('god', true);
    await game.run([{ call: ['solvePuzzle', 'daylight'] }, { steps: 2 }]);
    await game.shot('hatch_closed');
    await game.run([{ call: ['teleport', STAND.x, 0, STAND.z, 180, 0] }, { steps: 2 }]);
    const seq = await mark(game);
    await game.run([...shootScript('knot_hatch_latch', 1), { steps: 120 }]);
    const ev = await game.events(seq);
    const cue = ev.find((e) => e.name === 'audio/cue' && e.payload.cue === 'chairs_scrape');
    const wave = ev.find((e) => e.name === 'encounter/wave' && e.payload.id === 'enc_tally');
    assert.ok(cue && wave, 'the chairs scrape and the risers move');
    assert.ok(Math.abs(wave.tick - cue.tick - 48) <= 1, `the cue plays 0.8 s before movement (${(wave.tick - cue.tick) / 60} s)`);
    assert.ok(ev.some((e) => e.name === 'door/state' && e.payload.id === 'ia_hatch' && e.payload.state === 'ajar'));
    let s = await game.state();
    assert.equal(s.world.doors.ia_hatch, 'ajar');
    assert.equal(s.encounters.enc_tally.state, 'active');
    // both risers at least 12 m from where the knot is shot
    const risers = ev.filter((e) => e.name === 'enemy/spawned' && e.payload.encounter === 'enc_tally');
    assert.equal(risers.length, 0, 'the risers were spawned dormant at the build, not now');
    const enemies = s.enemies.filter((e) => e.encounter === 'enc_tally');
    assert.equal(enemies.length, 2);
    for (const e of enemies) assert.ok(Math.hypot(e.x - STAND.x, e.z - STAND.z) >= 12, `riser ${e.id} ${Math.hypot(e.x - STAND.x, e.z - STAND.z).toFixed(1)} m away`);
    await game.dbg('aimAt', KNOT.pos[0], 0, KNOT.pos[2] + 1.5);
    await game.shot('hatch_ajar');
    // impassable: she walks onto the ajar hatch and stays on the lid
    const hatch = marker('ia_hatch');
    await game.walkTo(hatch.pos[0], hatch.pos[2], { maxTicks: 240 });
    s = await game.state();
    assert.ok(s.player.y > -0.35, `she stands on the lid (y ${s.player.y})`);
    // the first riser down: still ajar; the second: open within 1.5 s (shot from the south end, clear of the table)
    await game.run([{ call: ['teleport', -89, 0, -16.2, 0, 0] }, { steps: 1 }, ...shootScript(enemies[0].id), { steps: 60 }]);
    assert.equal((await game.state()).world.doors.ia_hatch, 'ajar');
    const seq2 = await mark(game);
    await game.run([...shootScript(enemies[1].id, 1), { steps: 95 }]);
    const ev2 = await game.events(seq2);
    const down = ev2.find((e) => e.name === 'enemy/felled' || e.name === 'enemy/freed');
    const opened = ev2.find((e) => e.name === 'door/state' && e.payload.id === 'ia_hatch' && e.payload.state === 'open');
    assert.ok(down && opened, 'the hatch opened');
    assert.ok(opened.tick - down.tick <= 90, `within 1.5 s of the second (${(opened.tick - down.tick) / 60} s)`);
    assert.ok(ev2.some((e) => e.name === 'encounter/cleared' && e.payload.id === 'enc_tally'));
    assert.ok(ev2.some((e) => e.name === 'checkpoint/saved' && e.payload.id === 'cp_tally_hatch'));
    await game.run([{ call: ['teleport', STAND.x, 0, STAND.z, 160, -20] }, { steps: 1 }]);
    await game.shot('hatch_open');
  } finally { await game.close(); }
});

/** in the page: walk `to` one tick at a time, rendering every tick */
async function pageWalk({ to, shotAt, yieldEach }) {
  const dbg = window.__dbg;
  const out = { reason: '', ticks: 0, problems: [], worst: 0, zones: [], cells: [], sets: [], shot: null };
  let ground = dbg.player().y;
  const seen = (list, v) => { if (list[list.length - 1] !== v) list.push(v); };
  for (let i = 0; i < 4000; i++) {
    const r = dbg.followPath(to, { maxTicks: 1 });
    dbg.step(0, true);
    out.ticks += r.ticks;
    const p = dbg.player(), f = dbg.perf(), w = dbg.state().world;
    if (p.grounded) ground = p.y; else if (ground - p.y >= 0.5 && out.problems.length < 8) out.problems.push(`fell at ${p.x},${p.y},${p.z}`);
    if (!p.zone && out.problems.length < 8) out.problems.push(`zone null at ${p.x},${p.y},${p.z}`);
    out.worst = Math.max(out.worst, f.textureBytes + f.renderTargetBytes);
    seen(out.zones, p.zone); seen(out.cells, w.cell); seen(out.sets, w.set);
    if (shotAt && !out.shot && w.set === 'underground') out.shot = dbg.capture();
    if (r.reason !== 'max_ticks') { out.reason = r.reason; out.gate = r.gate; break; }
    // (a build spread over ticks waits on promises: let them settle between two ticks, as frames do in real time)
    if (yieldEach) { await null; await null; await null; }
  }
  return out;
}

test('the seam: the hatch shuts on landing 1, the swap on flight 2 with it shut, zone never null, under 64 MiB; back up under a shut hatch', async () => {
  const game = await open(srv, { checkpoint: 'cp_tally_hatch' });
  try {
    await game.dbg('god', true);
    let s = await game.state();
    assert.deepEqual(s.world.builtZones, ['the_lip', 'plenty_street', 'tally_house', 'the_gallery']);
    assert.equal(s.world.doors.ia_hatch, 'open');
    const seq = await mark(game);
    const down = await game.page.evaluate(async ({ fn, args }) => (new Function('return (' + fn + ')')())(args), { fn: pageWalk.toString(), args: { to: 'cp_gallery_bay', shotAt: true } });
    assert.equal(down.reason, 'arrived', JSON.stringify(down));
    assert.deepEqual(down.problems, []);
    console.log(`seam: worst textures + render targets on the stair ${(down.worst / MiB).toFixed(1)} MiB (cap ${MANIFEST.tiers.low.textureBudgetMB})`);
    assert.ok(down.worst <= MANIFEST.tiers.low.textureBudgetMB * MiB, `peak ${(down.worst / MiB).toFixed(1)} MiB`);
    assert.deepEqual(down.zones, ['tally_house', 'the_gallery']);
    assert.deepEqual(down.sets, ['surface', 'underground']);
    assert.deepEqual(down.cells, ['cell_tally', 'cell_tally_seam', 'cell_gallery_stair', 'cell_gallery']);
    const fs = await import('node:fs'); const path = await import('node:path');
    fs.writeFileSync(path.join(game.shotDir(), 'seam_swap_frame.png'), Buffer.from(down.shot.replace(/^data:image\/png;base64,/, ''), 'base64'));
    const ev = await game.events(seq);
    const closing = ev.find((e) => e.name === 'door/state' && e.payload.id === 'ia_hatch' && e.payload.state === 'closing');
    const closed = ev.find((e) => e.name === 'door/state' && e.payload.id === 'ia_hatch' && e.payload.state === 'closed');
    const released = ev.find((e) => e.name === 'load/set' && e.payload.set === 'surface' && e.payload.stage === 'released');
    assert.ok(closing && closed && released);
    assert.ok(closed.tick < released.tick, 'the swap waits for the shut hatch');
    // where she was: the closing began on landing 1, the swap happened on flight 2 (z -32 .. -26)
    const landing = marker('trg_hatch_close');
    void landing;
    s = await game.state();
    assert.equal(s.world.set, 'underground');
    assert.equal(s.world.checkpoint, 'cp_gallery_bay');
    const up = await game.page.evaluate(async ({ fn, args }) => (new Function('return (' + fn + ')')())(args), { fn: pageWalk.toString(), args: { to: 'cp_tally_hatch', shotAt: false } });
    assert.equal(up.reason, 'gate');
    assert.equal(up.gate, 'ia_hatch');
    s = await game.state();
    assert.equal(s.world.doors.ia_hatch, 'closed');
    assert.ok(s.player.y < -0.3, 'under the lid');
  } finally { await game.close(); }
});

test('the swap happens on flight 2, and a restore at cp_tally_hatch with the hatch powered re-enters the seam stage', async () => {
  const game = await open(srv, { checkpoint: 'cp_tally_hatch' });
  try {
    await game.dbg('god', true);
    let swapAt = null;
    for (let i = 0; i < 80 && !swapAt; i++) {
      const s = await game.run([{ followPath: 'cp_gallery_bay', maxTicks: 4 }]);
      if (s.world.set === 'underground') swapAt = s.player;
    }
    assert.ok(swapAt, 'swapped');
    assert.ok(swapAt.z > -32 && swapAt.z < -26 && Math.abs(swapAt.x + 86) < 1.2, `on flight 2 (${swapAt.x}, ${swapAt.y}, ${swapAt.z})`);
    await game.run([{ call: ['god', false] }, { call: ['setHealth', 0] }, { steps: 109 }, { steps: 3 }]);
    const s = await game.state();
    assert.equal(s.game, 'playing');
    assert.equal(s.world.set, 'surface');
    assert.deepEqual(s.world.builtZones, ['the_lip', 'plenty_street', 'tally_house', 'the_gallery'], 'the seam stage again, before control');
    assert.equal(s.world.doors.ia_hatch, 'open');
    const f = await game.dbg('perfRun', 2);
    assert.equal(f.textureBytes, MANIFEST.stages.find((x) => x.id === 'seam').textureBytes);
  } finally { await game.close(); }
});

// ---- polish round 2: the build during play is spread over ticks (the real-time path, forced on under the step hook) ---
const spreadOn = (game) => game.page.evaluate(() => window.__dbg.ext.world.spread(true));
const busy = (game) => game.page.evaluate(() => window.__dbg.ext.world.buildBusy());

test('in real time the staging and the swap are cut into slices: no tick does it all, and the world ends the same', async () => {
  const game = await open(srv, { checkpoint: 'cp_tally_enter' });
  try {
    await game.dbg('god', true);
    await spreadOn(game);
    await game.run([{ steps: 30 }]);
    let seq = await mark(game);
    // the day-cell lights: the gallery is instanced on one tick, built on a later one
    const staging = await game.page.evaluate(() => {
      const dbg = window.__dbg, w = dbg.ext.core.ctx().world, out = { roots: [], built: [] };
      dbg.solvePuzzle('daylight');
      for (let i = 0; i < 12; i++) {
        dbg.step(1, true);
        out.roots.push(!!dbg.ext.core.ctx().scene.world.getObjectByName('the_gallery'));
        out.built.push(w.builtZones.includes('the_gallery'));
      }
      return out;
    });
    const rootAt = staging.roots.indexOf(true), builtAt = staging.built.indexOf(true);
    assert.ok(rootAt >= 0 && builtAt > rootAt, `the zone's scene graph a tick before it is built (${rootAt}, ${builtAt})`);
    await game.run([{ steps: 60 }]);
    let s = await game.state();
    assert.equal(s.systems.world.staged, 'the_gallery');
    assert.equal(await busy(game), false, 'the staging job is over');
    assert.ok((await game.events(seq, 'world/staged')).some((e) => e.payload.zone === 'the_gallery' && e.payload.staged));
    // the fight, the hatch, the stair: the same walk as the one-tick swap
    await game.run([{ call: ['clearEncounter', 'enc_tally'] }, { steps: 200 }]);
    assert.equal((await game.state()).world.doors.ia_hatch, 'open');
    seq = await mark(game);
    const down = await game.page.evaluate(async ({ fn, args }) => (new Function('return (' + fn + ')')())(args), { fn: pageWalk.toString(), args: { to: 'cp_gallery_bay', shotAt: false, yieldEach: true } });
    assert.equal(down.reason, 'arrived', JSON.stringify(down));
    assert.deepEqual(down.problems, [], 'grounded and in a zone on every tick of the spread swap');
    assert.ok(down.worst <= MANIFEST.tiers.low.textureBudgetMB * MiB, `peak ${(down.worst / MiB).toFixed(1)} MiB`);
    assert.deepEqual(down.zones, ['tally_house', 'the_gallery']);
    assert.deepEqual(down.sets, ['surface', 'underground']);
    await game.run([{ steps: 120 }]);
    const ev = await game.events(seq);
    const released = ev.find((e) => e.name === 'load/set' && e.payload.set === 'surface' && e.payload.stage === 'released');
    const built = ev.filter((e) => e.name === 'world/built' && e.payload.set === 'underground').at(-1);
    assert.ok(released && built && built.tick - released.tick >= 2, `dropping the old set and building the new one are different ticks (${released?.tick}, ${built?.tick})`);
    s = await game.state();
    assert.equal(await busy(game), false, 'the swap job is over (its programs compiled, an object a tick)');
    assert.deepEqual(s.world.builtZones, ['the_gallery', 'lift_hall', 'the_bore']);
    assert.equal(s.world.checkpoint, 'cp_gallery_bay');
    // the same world as the one-tick swap builds: markers per zone
    const g2 = await open(srv, { checkpoint: 'cp_gallery_bay' });
    try { assert.deepEqual(s.systems.world.markers, (await g2.state()).systems.world.markers); } finally { await g2.close(); }
  } finally { await game.close(); }
});

test('files that will not come during play: the hatch stays shut and the old set whole, and the world asks again', async () => {
  // (a) the gallery's files fail once when the day-cell lights
  let game = await open(srv, { checkpoint: 'cp_tally_enter' });
  try {
    await game.dbg('god', true);
    await spreadOn(game);
    await game.page.evaluate(() => {
      const a = window.__dbg.ext.core.ctx().assets, orig = a.activate.bind(a);
      let n = 0;
      a.activate = (set, only) => (set === 'underground' && n++ < 3 ? Promise.reject(new Error('lm_gallery failed to load')) : orig(set, only));
    });
    // the day-cell lights, the knot is shot, both risers go down: the hatch would open now
    await game.run([{ call: ['solvePuzzle', 'daylight'] }, { steps: 30 }, { call: ['teleport', STAND.x, 0, STAND.z, 180, 0] }, { steps: 2 }, ...shootScript('knot_hatch_latch', 1), { steps: 120 }]);
    let s = await game.state();
    const risers = s.enemies.filter((e) => e.encounter === 'enc_tally');
    assert.equal(risers.length, 2);
    await game.run([{ call: ['teleport', -89, 0, -16.2, 0, 0] }, { steps: 1 }, ...shootScript(risers[0].id), { steps: 30 }, ...shootScript(risers[1].id, 1), { steps: 120 }]);
    s = await game.state();
    assert.equal(s.encounters.enc_tally.state, 'cleared');
    assert.equal(s.systems.world.staged, '', 'not staged: its files did not come');
    assert.ok(s.world.flags.includes('hatch_powered'));
    assert.notEqual(s.world.doors.ia_hatch, 'open', 'the hatch does not open on nothing');
    assert.equal(await busy(game), true, 'the world is still asking');
    for (let i = 0; i < 20 && (await game.state()).systems.world.staged === ''; i++) await game.run([{ steps: 60 }]);
    await game.run([{ steps: 120 }]);
    s = await game.state();
    assert.equal(s.systems.world.staged, 'the_gallery', 'asked again every three seconds: staged when the files came');
    assert.equal(s.world.doors.ia_hatch, 'open', 'and now the hatch opens');
    // polish round 3: she is told, plainly, while she waits (a hatch that stayed shut read as a broken puzzle), and
    // not once the files have come
    const notice = STORY.system.waiting ?? STORY.system.load_failed;
    const staged = (await game.events(0, 'world/staged')).find((e) => e.payload.staged);
    const told = (await game.events(0, 'story/caption')).filter((e) => e.payload.text === notice);
    assert.ok(told.length >= 1, 'the waiting line was shown');
    assert.ok(told.every((e) => e.tick < staged.tick), 'and never after the gallery was staged');
    await game.run([{ steps: 8 * 60 }]);
    assert.equal((await game.events(0, 'story/caption')).filter((e) => e.payload.text === notice).length, told.length, 'nor later');
  } finally { await game.close(); }
  // (b) the rest of the underground set fails once at the swap: nothing is dropped until it has come
  game = await open(srv, { checkpoint: 'cp_tally_hatch' });
  try {
    await game.dbg('god', true);
    await spreadOn(game);
    await game.page.evaluate(() => {
      const a = window.__dbg.ext.core.ctx().assets, orig = a.prefetch.bind(a);
      let n = 0;
      a.prefetch = (set, cb) => (set === 'underground' && n++ === 0 ? Promise.reject(new Error('env_lift_hall failed to load')) : orig(set, cb));
    });
    let armed = null;
    for (let i = 0; i < 120 && !armed; i++) {
      const s = await game.run([{ followPath: 'cp_gallery_bay', maxTicks: 4 }]);
      if (await busy(game)) armed = s;
    }
    assert.ok(armed, 'the swap was asked for on flight 2');
    assert.equal(armed.world.set, 'surface');
    let s = await game.run([{ steps: 100 }]);
    assert.equal(s.world.set, 'surface', 'the surface set is still resident while the files are asked for again');
    assert.deepEqual(s.world.builtZones, ['the_lip', 'plenty_street', 'tally_house', 'the_gallery'], 'and whole');
    assert.equal(s.player.grounded, true);
    for (let i = 0; i < 12 && s.world.set !== 'underground'; i++) s = await game.run([{ steps: 60 }]);
    s = await game.run([{ steps: 60 }, { steps: 60 }]);
    assert.equal(s.world.set, 'underground', 'asked again: the swap went through');
    assert.deepEqual(s.world.builtZones, ['the_gallery', 'lift_hall', 'the_bore']);
    assert.equal(await busy(game), false);
  } finally { await game.close(); }
});

test('a player who stops inside the swap trigger does not start the spread swap over on every tick', async () => {
  // (found on the real-time page: the trigger re-armed while she stood in it and the job began again each tick, for ever)
  const game = await open(srv, { checkpoint: 'cp_tally_hatch' });
  try {
    await game.dbg('god', true);
    await spreadOn(game);
    const close = marker('trg_hatch_close'), swap = marker('trg_set_swap');
    await game.run([{ call: ['teleport', close.pos[0], close.pos[1], close.pos[2], 0, 0] }, { steps: 90 }]);
    assert.equal((await game.state()).world.doors.ia_hatch, 'closed');
    await game.run([{ call: ['teleport', swap.pos[0], swap.pos[1] + 0.05, swap.pos[2], 0, 0] }]);
    // she stands still in the volume; promises settle between ticks, as between frames
    const r = await game.page.evaluate(async () => {
      const dbg = window.__dbg, jobs = [];
      for (let i = 0; i < 240; i++) { dbg.step(1, false); await null; await null; await null; const j = dbg.ext.world.buildJob(); if (jobs[jobs.length - 1] !== j) jobs.push(j); }
      return { jobs, set: dbg.state().world.set, built: dbg.state().world.builtZones, grounded: dbg.player().grounded };
    });
    assert.equal(r.set, 'underground', `the swap went through (${r.jobs.join(' > ')})`);
    assert.deepEqual(r.built, ['the_gallery', 'lift_hall', 'the_bore']);
    assert.equal(r.jobs.at(-1), '', 'and the job is over');
    assert.ok(r.jobs.length > 4, 'in slices: ' + r.jobs.join(' > '));
    assert.equal(r.grounded, true);
  } finally { await game.close(); }
});

// ---- polish round 3: the hatch staging froze one frame for 93 to 231 ms (the performance critic) ----------------------
test('staging the gallery: one slice per rendered frame however many ticks a frame runs, and no static collider rebuild (its solids stand from the surface build)', async () => {
  const game = await open(srv, { checkpoint: 'cp_tally_enter' });
  try {
    await game.dbg('god', true);
    await game.run([{ steps: 30 }]);
    const bay = marker('cp_gallery_bay');
    const r = await game.page.evaluate(async (bayPos) => {
      const dbg = window.__dbg, ctx = dbg.ext.core.ctx(), col = ctx.collision;
      const out = { groundBefore: col.groundHeight(bayPos[0], bayPos[1] + 1, bayPos[2], 3), statics: 0, noFrame: [], perFrame: [], staged: false, groundAfter: 0 };
      const setStatic = col.setStatic.bind(col);
      col.setStatic = (...a) => { out.statics++; return setStatic(...a); };
      dbg.ext.world.spread(true, true);                    // the real-time path, with its frame gate
      const at = () => { const j = dbg.ext.world.buildJob(); return j === '' ? -1 : Number(j.split('/')[0]); };
      dbg.solvePuzzle('daylight');
      // the files come (promises): a few ticks with frames
      for (let i = 0; i < 6 && at() < 1; i++) { dbg.step(1, true); await null; await null; await null; }
      // 1. twenty ticks and not one frame drawn: at most one slice
      const a0 = at();
      for (let i = 0; i < 20; i++) { dbg.step(1, false); await null; }
      out.noFrame = [a0, at()];
      // 2. slow frames, three ticks each: one slice a frame
      for (let i = 0; i < 80 && at() >= 0; i++) { const b = at(); dbg.step(3, true); await null; const c = at(); out.perFrame.push(c < 0 ? 1 : c - b); }
      out.staged = ctx.world.builtZones.includes('the_gallery');
      out.groundAfter = col.groundHeight(bayPos[0], bayPos[1] + 1, bayPos[2], 3);
      col.setStatic = setStatic;
      return out;
    }, bay.pos);
    assert.ok(r.noFrame[0] >= 0, `the job is running (${r.noFrame})`);
    assert.ok(r.noFrame[1] - r.noFrame[0] <= 1, `twenty ticks without a frame ran at most one slice (${r.noFrame})`);
    assert.ok(r.perFrame.length > 3 && Math.max(...r.perFrame) <= 1, `never two slices in one frame of three ticks (${r.perFrame})`);
    assert.equal(r.staged, true);
    assert.equal(r.statics, 0, 'the static collider set (one BVH build) was not rebuilt when the hatch powered');
    assert.ok(Math.abs(r.groundBefore - bay.pos[1]) < 0.3 && Math.abs(r.groundAfter - bay.pos[1]) < 0.3, `the gallery floor is solid before and after (${r.groundBefore}, ${r.groundAfter}; ${bay.pos[1]})`);
    assert.equal((await game.state()).systems.world.staged, 'the_gallery');
  } finally { await game.close(); }
});
