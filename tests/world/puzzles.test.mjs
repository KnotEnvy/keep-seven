// The four puzzles (code-world 4.4; GDD 13; acceptance tests 6 and 7), with the stub enemies and the dummy player's ray.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUT, hintClock, mark, marker, open, server, shoot, shootScript, status } from './lib.mjs';

let srv;
before(async () => { srv = await server(); });
after(async () => { await srv.close(); });

const JUGS = ['ia_jug_1', 'ia_jug_2', 'ia_jug_3', 'ia_jug_4', 'ia_jug_5', 'ia_jug_6'];
const centre = (game, id) => game.page.evaluate((e) => { const v = { x: 0, y: 0, z: 0 }; return window.__dbg.ext.core.ctx().collision.volumeCentre(e, null, v) ? v : null; }, id);

async function atJugs(game) {
  const stand = marker('trg_pz_jugs').params.standSpot;
  await game.run([{ call: ['teleport', stand[0], stand[1], stand[2], 90, 0] }, { steps: 2 }]);
}

test('seven_jugs: six shots leave the gate at 1.2 m and impassable; the seventh opens it to 2.6 m and commits cp_lip_gate', async () => {
  const game = await open(srv);
  try {
    await game.dbg('god', true);
    await atJugs(game);
    await game.shot('jugs_before');
    const seq = await mark(game);
    const rest = await centre(game, 'ia_jug_1');
    for (const id of JUGS) await game.run([...shootScript(id), { steps: 30 }]);
    await game.run([{ steps: 120 }]);
    let s = await game.state();
    assert.equal(s.puzzles.seven_jugs.step, 6);
    assert.equal(s.world.doors.door_jug_gate, 'closed', 'six are not enough');
    // the jug spheres rode the bar up 1.2 m (each follows its hook)
    const risen = await game.page.evaluate(() => { const c = window.__dbg.ext.core.ctx(); return c.world.puzzle('seven_jugs').step; });
    assert.equal(risen, 6);
    await game.shot('jugs_six');
    // impassable: she walks into the 1.2 m gap and stays on the forecourt side
    const gate = marker('door_jug_gate');
    const w = await game.walkTo(gate.pos[0] - 4, gate.pos[2], { maxTicks: 300 });
    assert.equal(w.reason, 'stuck');
    assert.ok(w.x > gate.pos[0] + 0.4, `the gate held at 1.2 m (x ${w.x})`);
    const hits = (await game.events(seq, 'shootable/hit')).map((e) => e.payload.scaleDegree);
    assert.deepEqual(hits, [1, 2, 3, 4, 5, 6], 'scale degrees 1 to 6 in the order shot');
    await atJugs(game);
    await game.run([...shootScript('ia_jug_7'), { steps: 120 }]);
    s = await game.state();
    await game.shot('jugs_solved');
    await game.run([{ steps: 1500 }]);                    // the queue plays its lines one at a time
    assert.equal(s.puzzles.seven_jugs.solved, true);
    assert.equal(s.world.doors.door_jug_gate, 'open');
    assert.equal(s.world.checkpoint, 'cp_lip_gate');
    assert.equal(s.world.objective, 'obj_street');
    const lines = (await game.events(seq, 'story/line')).map((e) => e.payload.key);
    assert.ok(lines.includes('nar_jugs_sand') && lines.includes('nar_jugs_open'), lines.join(' '));
    assert.equal((await game.events(seq, 'shootable/hit')).at(-1).payload.scaleDegree, 7);
    const saved = (await game.events(seq, 'checkpoint/saved')).map((e) => e.payload.id);
    assert.deepEqual(saved, ['cp_lip_gate']);
    void rest;
  } finally { await game.close(); }
});

test('seven_jugs: the hit spheres follow the hooks as the bar rises; any order works', async () => {
  const game = await open(srv);
  try {
    await atJugs(game);
    const before = await centre(game, 'ia_jug_6');
    // the seventh first, then the six from the right
    await game.run([...shootScript('ia_jug_7'), { steps: 60 }]);
    const one = await centre(game, 'ia_jug_6');
    assert.ok(Math.abs(one.y - before.y - 0.2) < 1e-3, `one jug: the bar rose 0.2 m (${one.y - before.y})`);
    for (const id of JUGS.slice().reverse().slice(0, 5)) await game.run([...shootScript(id), { steps: 40 }]);
    await game.run([{ steps: 90 }]);
    const six = await centre(game, 'ia_jug_1');
    assert.ok(Math.abs(six.y - marker('ia_jug_1').pos[1] - 1.2) < 1e-3, `six jugs: 1.2 m (${six.y})`);
    await game.run([...shootScript('ia_jug_1'), { steps: 120 }]);
    const s = await game.state();
    assert.equal(s.puzzles.seven_jugs.solved, true);
    assert.equal(s.world.doors.door_jug_gate, 'open');
  } finally { await game.close(); }
});

test('seven_jugs: T4 doubles the seventh hit radius; at 360 s the rope gives and the puzzle solves itself', async () => {
  const game = await open(srv);
  try {
    await game.dbg('god', true);
    await game.run([{ steps: 900 }]);                     // the opening lines are over: a hint line is dropped when busy
    await atJugs(game);
    await hintClock(game, 299.9);
    let seq = await mark(game);
    await game.run([{ steps: 30 }]);
    await game.run([{ steps: 330 }]);                     // T3's line is over (a hint line is dropped while another plays)
    const tiers = (await game.events(seq, 'puzzle/hint')).filter((e) => e.payload.puzzle === 'seven_jugs').map((e) => e.payload.tier);
    assert.ok(tiers.includes(4), `T4 reached (${tiers})`);
    // a round 0.35 m beside the seventh's centre: outside 0.24, inside 0.48
    const c = await centre(game, 'ia_jug_7');
    const radius = await game.page.evaluate(() => { const c = window.__dbg.ext.core.ctx(); const h = c.collision.createOverlapList(); const m = { x: 0, y: 0, z: 0 }; c.collision.volumeCentre('ia_jug_7', null, m); return [0.2, 0.3, 0.45, 0.55].map((r) => c.collision.overlapSphere(m.x + r, m.y, m.z, 0.01, 8, h) > 0); });
    assert.deepEqual(radius, [true, true, true, false], 'the seventh hit sphere is 0.48 m now');
    void c;
    seq = await mark(game);
    await hintClock(game, 55);
    await game.run([{ steps: 240 }]);
    const s = await game.state();
    assert.equal(s.puzzles.seven_jugs.solved, true, 'it solved itself');
    assert.equal(s.world.doors.door_jug_gate, 'open');
    const lines = (await game.events(seq, 'story/line')).map((e) => e.payload.key);
    assert.ok(lines.includes('hint_jugs_4'), lines.join(' '));
  } finally { await game.close(); }
});

// ---- daylight -------------------------------------------------------------------------------------------
async function inHall(game) {
  await game.dbg('checkpoint', 'cp_tally_enter');
  const stand = marker('trg_pz_daylight').params.standSpot;
  await game.run([{ call: ['teleport', stand[0], stand[1], stand[2], 90, 0] }, { steps: 2 }]);
}
const LATCH = { s: 'ia_latch_s', m: 'ia_latch_m', n: 'ia_latch_n', cord: 'ia_cloth_cord' };

test('daylight: latch N then the cord power the hatch; every order of the four shots ends powered', async () => {
  const game = await open(srv);
  try {
    await game.dbg('god', true);
    await inHall(game);
    await game.shot('daylight_before');
    let seq = await mark(game);
    await game.run([...shootScript(LATCH.n), { steps: 40 }]);
    await game.shot('daylight_mid_north_open');
    let s = await game.state();
    assert.equal(s.puzzles.daylight.solved, false);
    await game.run([...shootScript(LATCH.cord), { steps: 60 }]);
    s = await game.run([{ steps: 1200 }]);
    assert.ok(s.world.flags.includes('hatch_powered') && s.world.flags.includes('cell_lit'));
    assert.equal(s.puzzles.daylight.solved, true);
    assert.ok(s.world.builtZones.includes('the_gallery'), 'the gallery is staged beside the surface set');
    const names = (await game.events(seq)).map((e) => e.name);
    assert.ok(names.includes('world/hatch_powered') && names.includes('world/staged'));
    const lines = (await game.events(seq, 'story/line')).map((e) => e.payload.key);
    assert.ok(lines.includes('stn_tally_wake_1') && lines.includes('nar_tally_cloth'), lines.join(' '));
    await game.shot('daylight_solved');
    // every order of the four shots: never an unsolvable state
    const orders = [];
    const keys = ['s', 'm', 'n', 'cord'];
    const perm = (a, out = []) => { if (!a.length) { orders.push(out); return; } for (let i = 0; i < a.length; i++) perm(a.filter((_, k) => k !== i), out.concat(a[i])); };
    perm(keys);
    assert.equal(orders.length, 24);
    for (const order of orders) {
      await inHall(game);
      for (const k of order) await game.run([...shootScript(LATCH[k]), { steps: 20 }]);
      s = await game.run([{ steps: 40 }]);
      assert.ok(s.world.flags.includes('hatch_powered'), `order ${order.join(',')}`);
    }
  } finally { await game.close(); }
});

test('daylight: a blade\'s narration waits for the look, or 4 s', async () => {
  const game = await open(srv);
  try {
    await game.dbg('god', true);
    await inHall(game);
    // drop the south latch, then look away (north): the line comes 4 s after the drop
    await game.run(shootScript(LATCH.s, 1));
    let seq = await mark(game);
    await game.run([{ aim: [0, 0], steps: 200 }]);
    assert.ok(!(await game.events(seq, 'story/line')).some((e) => e.payload.key === 'nar_tally_wall'), 'not before 4 s');
    await game.run([{ steps: 60 }]);
    assert.ok((await game.events(seq, 'story/line')).some((e) => e.payload.key === 'nar_tally_wall'), 'at 4 s');
    // the middle blade: looked at at once
    await game.run(shootScript(LATCH.m, 1));
    seq = await mark(game);
    const chair = marker('shutter_m').params.blade.hits[0].pos;
    await game.run([{ aimAt: chair, steps: 3 }]);
    const chairLine = (await game.events(seq)).filter((e) => e.name === 'story/line' || e.name === 'story/say');
    // the narrator may still be on the wall's line: the chair's lines are queued at the look, within 3 ticks
    const st = (await game.state()).systems.world.story;
    assert.ok([st.current, ...st.waiting].includes('nar_tally_chair') || chairLine.some((e) => e.payload.key === 'nar_tally_chair'), JSON.stringify(st));
  } finally { await game.close(); }
});

test('daylight: T4 solves it (the north latch gives, the cord frays 10 s later)', async () => {
  const game = await open(srv);
  try {
    await game.dbg('god', true);
    await inHall(game);
    await hintClock(game, 300);
    await game.run([{ steps: 30 }]);
    let s = await game.state();
    assert.equal(s.world.flags.includes('hatch_powered'), false, 'not before the cord has frayed');
    await game.run([{ steps: 620 }]);
    s = await game.state();
    assert.equal(s.puzzles.daylight.solved, true);
  } finally { await game.close(); }
});

// ---- proving_line (GDD 21 test 6) ---------------------------------------------------------------------------
const STEP = LAYOUT.solids.find((x) => x.id === 'gl_mark_step');
const TOP = STEP.pos[1] + STEP.size[1] / 2;
async function fromSpot(game, x, z, fov) {
  await game.dbg('checkpoint', 'cp_gallery_bay');
  await game.run([{ call: ['setOption', 'fov', fov] }, { call: ['setAmmo', 6, 18, 2] }, { call: ['teleport', x, TOP + 0.01, z, -90, 0] }, { steps: 3 }]);
  // aim into the assist sphere where she can see it: from the two corners nearest the gallery the end of the pipe bank
  // hides knot_a's own centre (docs/requests/code-world.md), and a player aims past it through the loop
  const knot = marker('knot_a').pos;
  for (const [ox, oy, oz] of [[0, 0, 0], [0, 0, 0.3], [0, 0.2, 0.45], [0, -0.2, 0.45]]) {
    await game.run([{ aimAt: [knot[0] + ox, knot[1] + oy, knot[2] + oz] }, { steps: 1 }]);
    if ((await game.dbg('probe')).entityId === 'knot_a') break;
  }
  const before = (await game.state()).puzzles.proving_line.solved;
  await shoot(game, 'line_round');
  const s = await game.run([{ steps: 12 }]);
  return { before, solved: s.puzzles.proving_line.solved, onStep: (await game.events(0, 'world/on_step')).at(-1)?.payload.on };
}

test('proving_line: solved from each corner and the centre of the step at FOV 50, 62 and 80; not from 0.3 m off it', async () => {
  const game = await open(srv);
  try {
    await game.dbg('god', true);
    const hx = STEP.size[0] / 2 - 0.05, hz = STEP.size[2] / 2 - 0.05;
    const spots = [[0, 0], [-hx, -hz], [-hx, hz], [hx, -hz], [hx, hz]];
    for (const fov of [50, 62, 80]) {
      for (const [dx, dz] of spots) {
        const r = await fromSpot(game, STEP.pos[0] + dx, STEP.pos[2] + dz, fov);
        assert.equal(r.before, false);
        assert.equal(r.onStep, true, `on the step at ${dx},${dz}`);
        assert.equal(r.solved, true, `solved from (${dx}, ${dz}) at FOV ${fov}`);
      }
    }
    const s = await game.state();
    assert.equal(s.world.doors.ia_baffle === 'opening' || s.world.doors.ia_baffle === 'open', true);
    // 0.3 m off the step, on either side of it: the knots do not line up for her and there is no snap. (Straight behind
    // it, on the line itself, the three still line up inside their 0.2 m: that is the line, not the assist; see the report.)
    const off = 0.3 + STEP.size[2] / 2;
    for (const [dx, dz] of [[0, off], [0, -off], [0.6, off], [-0.6, -off]]) {
      const r = await fromSpot(game, STEP.pos[0] + dx, STEP.pos[2] + dz, 62);
      assert.equal(r.solved, false, `not solved from (${dx}, ${dz}) off the step`);
    }
  } finally { await game.close(); }
});

test('proving_line: a lead burst regrows in 3.0 s; the bay locker dispenses whenever she holds none', async () => {
  const game = await open(srv);
  try {
    await game.dbg('god', true);
    await game.dbg('checkpoint', 'cp_gallery_bay');
    await game.run([{ call: ['teleport', STEP.pos[0] + 2, TOP - 0.15, STEP.pos[2], -90, 0] }, { steps: 2 }]);
    const seq = await mark(game);
    await game.run(shootScript('knot_b', 1));
    const burst = (await game.events(seq, 'knot/burst')).find((e) => e.payload.id === 'knot_b');
    assert.ok(burst && burst.payload.regrows);
    await game.run([{ steps: 175 }]);
    assert.equal((await game.events(seq, 'knot/regrown')).length, 0);
    await game.run([{ steps: 10 }]);
    const regrown = (await game.events(seq, 'knot/regrown')).find((e) => e.payload.id === 'knot_b');
    assert.ok(regrown, 'regrown');
    assert.ok(Math.abs(regrown.tick - burst.tick - 180) <= 1, `in 3.0 s (${(regrown.tick - burst.tick) / 60} s)`);
    // the locker: she holds none -> it offers; she takes it -> none offered; she spends it -> it offers again
    await game.run([{ call: ['setAmmo', 6, 18, 0] }, { steps: 3 }]);
    assert.ok((await status(game)).interact.lockers.includes('ia_line_locker_bay'));
    const locker = marker('ia_line_locker_bay');
    await game.run([{ call: ['teleport', locker.pos[0], locker.pos[1], locker.pos[2] - 1.2, 0, 0] }, { steps: 1 }, { aimAt: [locker.pos[0], locker.pos[1] + 0.6, locker.pos[2]] }, { tap: 'interact', steps: 3 }]);
    let s = await game.state();
    assert.equal(s.player.lineRounds, 1);
    assert.ok(!(await status(game)).interact.lockers.includes('ia_line_locker_bay'), 'she holds one: the bay locker does not offer');
    await game.run([{ call: ['setAmmo', 6, 18, 0] }, { steps: 2 }]);
    assert.ok((await status(game)).interact.lockers.includes('ia_line_locker_bay'), 'she holds none again: it offers again');
    const chimes = (await game.events(seq, 'audio/cue')).filter((e) => e.payload.cue === 'locker_chime').length;
    assert.ok(chimes >= 1, `it chimed when it offered again (${chimes})`);
    s = await game.state();
    assert.equal(s.puzzles.proving_line.solved, false);
  } finally { await game.close(); }
});

// ---- the_asking (GDD 21 test 7) ---------------------------------------------------------------------------
async function atDoor(game, lineRounds = 0) {
  await game.dbg('checkpoint', 'cp_bore_ante');
  const stand = marker('trg_pz_asking').params.standSpot;
  await game.run([{ call: ['setAmmo', 6, 18, lineRounds] }, { call: ['teleport', stand[0], stand[1], stand[2], 180, 4] }, { steps: 2 }]);
}
async function toQuestion3(game) {
  await game.run([...shootScript('ia_ask_port_4'), { steps: 10 }]);
  await game.run([...shootScript('ia_ask_port_6'), { steps: 1 }]);
  const q3 = (await game.events(0, 'asking/question')).filter((e) => e.payload.question === 3).at(-1);
  assert.ok(q3, 'question 3 was put');
  return q3;
}
const doorOpenTick = async (game) => (await game.events(0, 'door/state')).find((e) => e.payload.id === 'door_bore' && e.payload.state === 'opening')?.tick;

test('the_asking: dark ring on questions 1 and 2; held fire opens the door 12 s after question 3; the cradle lines first', async () => {
  for (const lineRounds of [0, 2]) {
    const game = await open(srv);
    try {
      await game.dbg('god', true);
      await atDoor(game, lineRounds);
      await game.shot('asking_before');
      const seq = await mark(game);
      const q = (await game.events(0, 'asking/question')).map((e) => e.payload.question);
      assert.deepEqual(q.slice(-1), [1], 'question 1 is put when she comes in');
      // a wrong port: the station says so, the ring stays dark
      await game.run([...shootScript('ia_ask_port_3'), { steps: 60 }]);
      assert.ok((await game.events(seq, 'story/line')).some((e) => e.payload.key === 'stn_ask_wrong'));
      const q3 = await toQuestion3(game);
      assert.equal((await game.events(seq, 'asking/listen')).filter((e) => e.payload.lit > 0 && e.tick < q3.tick).length, 0, 'the ring is dark through questions 1 and 2');
      await game.run([{ aim: [180, 4], steps: 300 }]);
      await game.shot('asking_mid_ring');
      await game.run([{ steps: 500 }]);
      const opened = await doorOpenTick(game);
      assert.ok(opened, 'the door opened');
      assert.ok(Math.abs(opened - q3.tick - 720) <= 2, `12 s after the question (${(opened - q3.tick) / 60} s)`);
      const lines = (await game.events(0, 'story/line')).filter((e) => e.tick <= opened).map((e) => e.payload.key);
      assert.ok(lines.includes('nar_cradle') && lines.includes('nar_cradle_2'), `the cradle lines played before the door opened (${lines.join(' ')})`);
      const lit = (await game.events(seq, 'asking/listen')).map((e) => e.payload.lit);
      assert.deepEqual(lit.slice(-12), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
      if (lineRounds === 0) { await game.run([{ aim: [180, 4], steps: 150 }]); await game.shot('asking_solved'); }
    } finally { await game.close(); }
  }
});

test('the_asking: a shot at 8 s empties the ring and the door opens 9 s after it; outside the volume the ring holds', async () => {
  const game = await open(srv);
  try {
    await game.dbg('god', true);
    await atDoor(game);
    const q3 = await toQuestion3(game);
    await game.run([{ aim: [90, 0], steps: 479 }]);
    const shotSeq = await mark(game);
    await game.run([{ tap: 'fire', steps: 1 }]);
    const shotTick = (await game.events(shotSeq, 'weapon/fired'))[0].tick;
    assert.ok(Math.abs(shotTick - q3.tick - 480) <= 2);
    assert.ok((await game.events(shotSeq, 'asking/listen')).some((e) => e.payload.lit === 0), 'the ring emptied');
    await game.run([{ steps: 560 }]);
    const opened = await doorOpenTick(game);
    assert.ok(Math.abs(opened - shotTick - 540) <= 2, `9 s after the shot (${(opened - shotTick) / 60} s)`);
    // outside the volume the ring does not advance
    const g2 = await open(srv);
    try {
      await atDoor(g2);
      await toQuestion3(g2);
      const seq = await mark(g2);
      await g2.run([{ call: ['teleport', 14, -44, 70.5, 0, 0] }, { steps: 900 }]);
      assert.equal((await g2.events(seq, 'asking/listen')).filter((e) => e.payload.lit > 0).length, 0);
      assert.equal((await g2.state()).world.doors.door_bore, 'closed');
    } finally { await g2.close(); }
  } finally { await game.close(); }
});
