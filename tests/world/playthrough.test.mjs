// A scripted run of the whole stage with the real world (code-world 6 "Playthrough", "Story", "Budget and
// determinism"): followPath along every checkpoint, each gate opened through WorldDebug, both rides taken with
// tap('interact'), the stone taken, the end card. Over the run: no nar_* line twice, every objective once and in order,
// every card once, the queue never past four; the world's own milliseconds per tick; playSeconds (GDD 21 test 12's
// estimate); two page loads give one hash.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CHECKPOINTS, CHECKPOINT_ACTS, ENCOUNTERS, GATE_OPENERS, portalsForWalk } from '../core/route.mjs';
import { LAYOUT, STORY, marker, measureAllocSafe, open, server, status, takeRound } from './lib.mjs';

let srv;
before(async () => { srv = await server(); });
after(async () => { await srv.close(); });

const ENCOUNTER_BEFORE = Object.fromEntries(LAYOUT.encounters.filter((e) => e.onClear.checkpoint).map((e) => [e.onClear.checkpoint, e.id]));
ENCOUNTER_BEFORE.cp_rim = 'enc_windlass';

/** in the page: walk to `to` by input in chunks of 30 ticks, opening gates through world.debug and riding the lifts */
async function pageLeg({ to, openers, portals }) {
  const dbg = window.__dbg, ctx = dbg.ext.core.ctx();
  const yieldTask = () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
  const out = { reason: '', ticks: 0, worldMs: [], rides: [] };
  let guard = 0, since = 0;
  while (guard++ < 5000) {
    const r = dbg.followPath(to, { maxTicks: 30 });
    out.ticks += r.ticks; since += r.ticks;
    if (since >= 30) { dbg.step(0, true); out.worldMs.push(ctx.perf.systemMs[2] / since); since = 0; }
    if (r.reason === 'max_ticks') continue;
    if (r.reason === 'state' && dbg.ext.core.busy()) { await dbg.ext.core.idle(); continue; }
    if (r.reason === 'gate') { for (const [m, id] of openers[r.gate] ?? []) dbg[m](id); await yieldTask(); if (dbg.world?.doorState?.(r.gate) === 'closed') break; continue; }
    if (r.reason === 'portal') {
      const p = portals.find((x) => x.from === r.node);
      dbg.walkTo(p.viaPos[0], p.viaPos[2], { stopRadius: 1.6, maxTicks: 600 });
      dbg.aimAtMarker(p.via); dbg.tap('interact');
      let rode = 0;
      for (;;) { const u = dbg.stepUntil({ event: 'ride/state', where: { stage: 'ended' } }, 240); rode += u.steps; if (u.met || rode > 6000) break; await yieldTask(); await dbg.ext.core.idle(); }
      out.ticks += rode; out.rides.push({ id: p.id, ticks: rode });
      continue;
    }
    out.reason = r.reason;
    return out;
  }
  out.reason = 'guard';
  return out;
}
const leg = (game, to) => game.page.evaluate(async ({ fn, args }) => (new Function('return (' + fn + ')')())(args), { fn: pageLeg.toString(), args: { to, openers: GATE_OPENERS, portals: portalsForWalk() } });

/** The run: returns the story events in order, the leg table, the world's ms per tick and the end state. */
async function scriptedRun(game, { shots = false } = {}) {
  const story = [], legs = [], worldMs = [];
  let seq = 0;
  const collect = async () => {
    const ev = await game.events(seq);
    if (ev.length) seq = ev.at(-1).seq;
    for (const e of ev) if (/^(story\/|objective\/|checkpoint\/saved|ending\/)/.test(e.name)) story.push({ name: e.name, tick: e.tick, payload: e.payload });
  };
  await game.dbg('god', true);
  await collect();
  for (const cp of CHECKPOINTS) {
    const encounter = ENCOUNTER_BEFORE[cp];
    if (encounter) {
      const enc = ENCOUNTERS.find((e) => e.id === encounter);
      const r = await leg(game, enc.trigger);
      assert.equal(r.reason, 'arrived', `to ${enc.trigger}`);
      worldMs.push(...r.worldMs);
      await game.dbg('clearEncounter', encounter);
      await game.step(2);
      await collect();
    }
    const r = await leg(game, cp);
    assert.equal(r.reason, 'arrived', `to ${cp}: ${r.reason}`);
    worldMs.push(...r.worldMs);
    const m = marker(cp);
    await game.walkTo(m.pos[0], m.pos[2], { stopRadius: 0.5, maxTicks: 240 });
    for (const [method, arg] of CHECKPOINT_ACTS[cp] ?? []) await game.dbg(method, arg);
    await game.step(4);
    const s = await game.state();
    legs.push({ cp, ticks: r.ticks, seconds: +(r.ticks / 60).toFixed(1), rides: r.rides.map((x) => x.id), playSeconds: +s.stats.playSeconds.toFixed(1) });
    if (shots) { await game.dbg('setAim', m.rotY, 0); await game.shot('cp_' + String(CHECKPOINTS.indexOf(cp) + 1).padStart(2, '0') + '_' + cp); }
    await collect();
  }
  // the rim: the lamps, the stone, the end card
  await game.run([{ steps: 240 }]);
  if (shots) { await game.run([{ call: ['teleport', 6, 18, 104, 35, -3] }, { steps: 2 }]); await game.shot('rim_lamps_lit'); }
  const stone = marker('trg_stone');
  const out = marker('trg_rim_arrive');
  await game.walkTo(out.pos[0], out.pos[2], { stopRadius: 0.4, maxTicks: 600 });         // out through the rock frame
  await game.walkTo(stone.pos[0] + 0.5, stone.pos[2], { stopRadius: 0.4, maxTicks: 900 });
  await game.run([{ steps: 60 }]);
  const round = marker('ia_stone_round');
  await game.run([...takeRound(round)]);
  const end = await game.until({ event: 'ending/card' }, 60 * 60);
  await game.step(10);
  if (shots) await game.shot('ending_card_moment');
  await collect();
  return { story, legs, worldMs, end, state: await game.state() };
}

test('a scripted run of the stage reaches the end card; the story plays by its rules on the way', async () => {
  const game = await open(srv);
  try {
    const run = await scriptedRun(game, { shots: true });
    assert.ok(run.end.met, 'the end card');
    const s = run.state;
    assert.equal(s.game, 'ending');
    const saved = run.story.filter((e) => e.name === 'checkpoint/saved').map((e) => e.payload.id);
    assert.deepEqual(saved, CHECKPOINTS, 'every checkpoint once, in order');
    // no nar_* key twice
    const lines = run.story.filter((e) => e.name === 'story/line').map((e) => e.payload.key);
    const nar = lines.filter((k) => k.startsWith('nar_'));
    assert.deepEqual(nar.filter((k, i) => nar.indexOf(k) !== i), [], 'no narrator line twice');
    // every objective once, in the order of story.json (GDD 12.2)
    const objectives = run.story.filter((e) => e.name === 'objective/changed').map((e) => e.payload.key);
    assert.deepEqual(objectives, Object.keys(STORY.objectives));
    // every card once
    const cards = run.story.filter((e) => e.name === 'story/card').map((e) => e.payload.key);
    assert.deepEqual(cards.filter((k, i) => cards.indexOf(k) !== i), []);
    for (const c of ['card_title', 'card_i', 'card_ii', 'card_iii', 'card_iv', 'card_v', 'card_vi', 'card_vii', 'card_end']) assert.ok(cards.includes(c), c);
    const st = await status(game);
    assert.ok(st.story.peak <= 4, `the queue held at most four (${st.story.peak})`);
    // the ending: lamps = 9 + freed, and the windows lit equal it
    const card = run.story.find((e) => e.name === 'ending/card');
    const lamps = run.story.find((e) => e.name === 'ending/lamps');
    assert.equal(lamps.payload.count, Math.min(48, 9 + card.payload.stats.freed));
    assert.equal(st.ending.lit, lamps.payload.count);
    assert.equal(card.payload.stats.tookStoneRound, true);
    // the world's own milliseconds per tick (fixedUpdate + update), median over the run
    const ms = run.worldMs.slice().sort((a, b) => a - b);
    const median = ms[ms.length >> 1];
    const report = { playSeconds: s.stats.playSeconds, ticks: s.tick, legs: run.legs, worldMsMedian: median, worldMsP95: ms[Math.floor(ms.length * 0.95)], samples: ms.length, objectives, lines: lines.length };
    fs.writeFileSync(path.join(game.shotDir(), 'playthrough.json'), JSON.stringify(report, null, 1));
    console.log(`playthrough: ${CHECKPOINTS.length} checkpoints, playSeconds ${s.stats.playSeconds.toFixed(1)} (${(s.stats.playSeconds / 60).toFixed(1)} min), world ${median.toFixed(4)} ms per tick median (p95 ${report.worldMsP95.toFixed(4)}), ${lines.length} lines`);
    for (const l of run.legs) console.log(`  ${l.cp.padEnd(18)} ${String(l.seconds).padStart(6)} s ${l.rides.join(' ')}`);
    assert.ok(median <= 0.5, `world fixedUpdate + update ${median} ms per tick`);
  } finally { await game.close(); }
});

test('two page loads of the same script give one hash', async () => {
  const hashes = [];
  for (let i = 0; i < 2; i++) {
    const game = await open(srv, { seed: 3 });
    try {
      await game.dbg('god', true);
      await game.run([{ followPath: 'critical', maxTicks: 3000 }, { call: ['solvePuzzle', 'seven_jugs'] }, { followPath: 'critical', maxTicks: 1500 }, { call: ['checkpoint', 'cp_tally_enter'] }, { followPath: 'cp_tally_hatch', maxTicks: 900 }, { steps: 60 }]);
      hashes.push(await game.dbg('hash'));
    } finally { await game.close(); }
  }
  assert.equal(hashes[0], hashes[1]);
});

test('the world allocates nothing per tick of its own: walking and shooting beside six enemies stays under 6 KB per tick', async () => {
  const game = await open(srv, { checkpoint: 'cp_street_clear' });
  try {
    await game.run([{ call: ['god', true] }, ...[0, 1, 2, 3, 4, 5].map((i) => ({ call: ['spawnEnemy', 'bider', -74 - i * 1.5, 0, -3 + i, 90] })), { aim: [90, 0], steps: 30 }]);
    await game.dbg('setActions', ['forward', 'left']);
    const fight = (dbg, n) => { for (let left = n; left > 0; left -= 20) { const k = (window.__k = (window.__k ?? 0) + 1); dbg.tap('fire'); dbg.setAim(90 + (k % 30) * 2.4, -2); dbg.step(Math.min(20, left), false); } };
    const r = await measureAllocSafe(game, fight);
    const walking = await measureAllocSafe(game, (dbg, n) => dbg.step(n, false));
    fs.writeFileSync(path.join(game.shotDir(), 'alloc.json'), JSON.stringify({ fight: r, walking }, null, 1));
    console.log(`alloc with the real world: ${r.perTick.toFixed(0)} B per tick fighting, ${walking.perTick.toFixed(0)} B per tick walking`);
    assert.ok(r.perTick <= 6144 && walking.perTick <= 6144);
  } finally { await game.close(); }
});
