// The encounter director with the core stub enemies killed on a script (code-world 4.6, GDD 10): wave timings, the
// alive cap, the clear rule, the clock-only waves of the Matador, the dormant member that starts its fight, the ammo
// floor and the last-enemy slow motion.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mark, marker, open, server, shootScript } from './lib.mjs';

let srv;
before(async () => { srv = await server(); });
after(async () => { await srv.close(); });

const alive = (s, enc) => s.enemies.filter((e) => e.encounter === enc && e.alive);
const waveTicks = async (game, enc, since) => Object.fromEntries((await game.events(since, 'encounter/wave')).filter((e) => e.payload.id === enc).map((e) => [e.payload.wave, e.tick]));
/** step `n` ticks one at a time and keep the most enemies of `enc` ever alive at once */
async function stepWatching(game, enc, n) {
  return game.page.evaluate(({ enc: id, n: count }) => {
    const dbg = window.__dbg;
    let most = 0;
    for (let i = 0; i < count; i++) { dbg.step(1, false); most = Math.max(most, dbg.enemies().filter((e) => e.encounter === id && e.alive).length); }
    return most;
  }, { enc, n });
}
/** shoot every enemy of an encounter that is up, from `from` or from a spot near each that sees it */
async function killAllOf(game, enc, from) {
  for (let guard = 0; guard < 16; guard++) {
    const s = await game.state();
    const list = alive(s, enc);
    if (!list.length) return;
    const e = list[0];
    const spots = from ? [from] : [[e.x + 4, e.y, e.z], [e.x - 4, e.y, e.z], [e.x, e.y, e.z * 0.4], [e.x + 3, e.y, e.z * 0.5], [e.x - 3, e.y, e.z * 0.5]];
    const ids = list.map((x) => x.id);
    for (const spot of spots) {
      await game.run([{ call: ['teleport', spot[0], spot[1], spot[2], 0, 0] }, { steps: 1 }, { aimAtEntity: [e.id] }, { steps: 1 }]);
      if (ids.includes((await game.dbg('probe')).entityId)) break;         // it, or one standing in front of it in file
    }
    await game.run([{ tap: 'fire', steps: 2 }]);
  }
}

// (numbers of ruling 27, polish round 3: Front Street is eight, B is four from the two alleys at once, the cap is five)
test('enc_street: A rises after its scoop (3 s), B (four) when A is down, C when B is down to one, D two seconds after C; cap 5; one slow-motion beat', async () => {
  const game = await open(srv, { checkpoint: 'cp_lip_gate' });
  try {
    await game.dbg('god', true);
    const seq = await mark(game);
    // pass i3: at the gate posts the kneeler is 41 m off; the fight (and its line) waits until she has come near it
    await game.run([{ call: ['teleport', -3, 0, 0, 90, 0] }, { steps: 6 * 60 }]);     // (the town's line is over)
    assert.equal((await game.events(seq, 'encounter/started')).length, 0, 'not at the gate posts');
    await game.run([{ call: ['teleport', -21.5, 0, -1.9, 90, 0] }, { steps: 2 }]);
    const started = (await game.events(seq, 'encounter/started')).find((e) => e.payload.id === 'enc_street');
    assert.ok(started, 'within 24 m of the kneeler and turned to it: trg_enc_street\'s fight starts');
    await game.run([{ steps: 240 }]);
    let w = await waveTicks(game, 'enc_street', seq);
    assert.ok(Math.abs(w.A - started.tick - 180) <= 1, `A after 3 s (${(w.A - started.tick) / 60})`);
    // A down: B at once
    let s = await game.state();
    const a = alive(s, 'enc_street')[0];
    await game.run([...shootScript(a.id), { steps: 2 }]);
    w = await waveTicks(game, 'enc_street', seq);
    assert.ok(w.B, 'B came when A was down');
    s = await game.run([{ steps: 2 }]);
    assert.equal(alive(s, 'enc_street').length, 4, 'four from the two alleys at once');
    // C comes when B is down to two, or 2 s after B, whichever is first (polish round 4; it was one, or 6 s); never more than five up
    const most = await stepWatching(game, 'enc_street', 2 * 60 + 30);
    assert.ok(most <= 5, `the cap: ${most} alive at most`);
    assert.equal(most, 5, 'B standing, the file of two arrives: five up, the sixth waits for the cap');
    w = await waveTicks(game, 'enc_street', seq);
    assert.ok(w.C && Math.abs(w.C - w.B - 120) <= 1, `C two seconds after B (${(w.C - w.B) / 60})`);
    // everything down, in turn; D two seconds after C
    for (let round = 0; round < 6; round++) { await killAllOf(game, 'enc_street', null); await game.run([{ steps: 150 }]); }
    w = await waveTicks(game, 'enc_street', seq);
    assert.ok(w.D, 'D came');
    const yardGate = (await game.events(seq, 'door/state')).find((e) => e.payload.id === 'door_yard_gate' && e.payload.state !== 'closed');
    assert.ok(yardGate && Math.abs(yardGate.tick - w.D) <= 1, 'D bursts the yard gate');
    s = await game.state();
    assert.equal(s.encounters.enc_street.state, 'cleared');
    assert.equal(s.world.checkpoint, 'cp_street_clear');
    assert.equal(s.world.objective, 'obj_yard_door');
    const slow = (await game.events(seq, 'time/scale')).filter((e) => e.payload.reason === 'last_enemy');
    assert.equal(slow.length, 1, 'the last enemy gets one slow-motion beat');
    assert.ok((await game.events(seq, 'encounter/last_enemy')).length === 1);
  } finally { await game.close(); }
});

test('enc_yard: B at 14 s with T1 standing, or on its death; B2 2 s after B; B3 10 s after B and only with at most three up', async () => {
  for (const killT1 of [false, true]) {
    const game = await open(srv, { checkpoint: 'cp_street_clear' });
    try {
      await game.dbg('god', true);
      const knot = marker('knot_yard_latch');
      await game.run([{ call: ['teleport', knot.pos[0] + 3, 0, knot.pos[2], 90, 0] }, { steps: 1 }]);
      const seq = await mark(game);
      await game.run([...shootScript('knot_yard_latch', 1), { steps: 300 }]);
      const started = (await game.events(seq, 'encounter/started')).find((e) => e.payload.id === 'enc_yard');
      assert.ok(started, 'the knot started the yard');
      let w = await waveTicks(game, 'enc_yard', seq);
      assert.ok(Math.abs(w.A - started.tick - 240) <= 1, 'A after the 4 s bell vignette');
      if (killT1) {
        const t1 = alive(await game.state(), 'enc_yard')[0];
        await game.run([{ call: ['teleport', t1.x + 3, 0, t1.z, 90, 0] }, { steps: 1 }, ...shootScript(t1.id), { steps: 2 }]);
        w = await waveTicks(game, 'enc_yard', seq);
        assert.ok(w.B && w.B - started.tick < 14 * 60, 'B on T1\'s death');
      } else {
        await game.run([{ steps: 14 * 60 }]);
        w = await waveTicks(game, 'enc_yard', seq);
        assert.ok(Math.abs(w.B - w.A - 840) <= 1, `B 14 s after A (${(w.B - w.A) / 60})`);
      }
      await game.run([{ steps: 30 * 60 }]);
      w = await waveTicks(game, 'enc_yard', seq);
      assert.ok(Math.abs(w.B2 - w.B - 120) <= 1, `B2 two seconds after B (${(w.B2 - w.B) / 60})`);
      const s = await game.state();
      const up = alive(s, 'enc_yard').length;
      if (up > 3) assert.equal(w.B3, undefined, `B3 waits while ${up} are up`);
      else assert.ok(w.B3 >= w.B + 600, 'B3 ten seconds after B');
      assert.ok(up <= 4, 'the cap of four');
    } finally { await game.close(); }
  }
});

test('enc_file: the six turn 3 s after the baffle; the cap of six; wave B (the ambush) is in polish_r4.test.mjs', async () => {
  const game = await open(srv, { checkpoint: 'cp_gallery_baffle' });
  try {
    await game.dbg('god', true);
    const seq0 = await mark(game);
    await game.run([{ steps: 200 }]);
    const started = (await game.events(seq0, 'encounter/started')).find((e) => e.payload.id === 'enc_file') ?? (await game.events(0, 'encounter/started')).find((e) => e.payload.id === 'enc_file');
    assert.ok(started, 'the open baffle started the File');
    let w = await waveTicks(game, 'enc_file', 0);
    assert.ok(Math.abs(w.A - started.tick - 180) <= 1, 'the six turn when the baffle has ground open (3 s)');
    // polish round 4: with the file standing, wave B does not come on a clock (it was 25 s after the turn)
    const most = await stepWatching(game, 'enc_file', 26 * 60);
    w = await waveTicks(game, 'enc_file', 0);
    assert.equal(w.B, undefined, 'no wave B while the file is up');
    assert.ok(most <= 6, `the cap of six (${most})`);
    assert.equal((await game.state()).world.doors.door_gallery_far, 'closed');
  } finally { await game.close(); }
});

test('enc_matador: the Tamper dead before 15 s -> no Bider and clear on its death; dead at 25 s -> no wave C; damage in the vignette starts it', async () => {
  const trigger = marker('trg_enc_matador');
  const tamperOf = (s) => s.enemies.find((e) => e.kind === 'tamper' && e.alive);
  for (const killAt of [8, 25]) {
    const game = await open(srv, { checkpoint: 'cp_hall_gantry' });
    try {
      await game.dbg('god', true);
      const seq = await mark(game);
      await game.run([{ call: ['teleport', trigger.pos[0], trigger.pos[1], trigger.pos[2], 180, 0] }, { steps: 1 }]);
      const started = (await game.events(seq, 'encounter/started')).find((e) => e.payload.id === 'enc_matador');
      assert.ok(started);
      await game.run([{ steps: killAt * 60 }]);
      const t = tamperOf(await game.state());
      await game.run([{ call: ['teleport', t.x + 4, t.y, t.z, 90, 0] }, { steps: 1 }, ...shootScript(t.id), { steps: 2 }]);
      if (killAt < 15) {
        // the hall's climax kill is the last enemy: one slow-motion beat on its tick, though two waves were still on the clock
        const died = (await game.events(seq, 'enemy/died')).find((e) => e.payload.id === t.id);
        const slow = (await game.events(seq, 'time/scale')).filter((e) => e.payload.reason === 'last_enemy');
        assert.equal(slow.length, 1, 'the Tamper\'s death gets the slow-motion beat');
        assert.ok(died && slow[0].tick === died.tick, 'on the tick of the kill');
        assert.equal((await game.events(seq, 'encounter/last_enemy')).length, 1);
        const cleared = (await game.events(seq, 'encounter/cleared')).find((e) => e.payload.id === 'enc_matador');
        assert.ok(cleared && cleared.tick === died.tick, 'and the clear');
        const s = await game.run([{ steps: 70 * 60 }]);
        assert.equal(s.encounters.enc_matador.state, 'cleared', 'clear on the Tamper\'s death');
        assert.equal((await game.events(seq, 'enemy/spawned')).filter((e) => e.payload.encounter === 'enc_matador' && e.payload.kind === 'bider').length, 0, 'no Bider ever');
        assert.equal(s.world.checkpoint, 'cp_hall_clear');
        assert.equal(s.world.doors.door_lift_cage === 'opening' || s.world.doors.door_lift_cage === 'open', true);
      } else {
        await game.run([{ steps: 30 * 60 }]);
        const w = await waveTicks(game, 'enc_matador', seq);
        assert.ok(Math.abs(w.B - started.tick - 900) <= 1, `B at 15 s on the clock (${(w.B - started.tick) / 60})`);
        assert.equal(w.C, undefined, 'C never spawns');
        let s = await game.state();
        assert.equal(s.encounters.enc_matador.state, 'active', 'the two of B hold it open');
        await killAllOf(game, 'enc_matador', null);
        s = await game.run([{ steps: 2 }]);
        assert.equal(s.encounters.enc_matador.state, 'cleared');
        assert.equal((await game.events(seq, 'time/scale')).filter((e) => e.payload.reason === 'last_enemy').length, 1, 'one beat, on the last Bider');
        assert.equal((await game.events(seq, 'encounter/last_enemy')).length, 1);
      }
    } finally { await game.close(); }
  }
  // the vignette: the Tamper shot from the gantry before the trigger starts the fight on that tick
  const game = await open(srv, { checkpoint: 'cp_hall_gantry' });
  try {
    await game.run([{ steps: 2 }]);
    const t = tamperOf(await game.state());
    const seq = await mark(game);
    await game.run([...shootScript(t.id, 1)]);
    const ev = await game.events(seq);
    const hit = ev.find((e) => e.name === 'enemy/died' || e.name === 'enemy/damaged');
    const started = ev.find((e) => e.name === 'encounter/started' && e.payload.id === 'enc_matador');
    assert.ok(hit && started && started.tick === hit.tick, 'started on the tick of the hit');
  } finally { await game.close(); }
});

test('the ammo floor: at cylinder + reserve six or under, the next Bider felled and the next breakable broken drop a packet', async () => {
  const game = await open(srv, { checkpoint: 'cp_lip_gate' });
  try {
    await game.dbg('god', true);
    await game.run([{ call: ['teleport', -3, 0, 0, 90, 0] }, { steps: 200 }, { call: ['setAmmo', 2, 3, 0] }]);
    const seq = await mark(game);
    const a = alive(await game.state(), 'enc_street')[0];
    await game.run([...shootScript(a.id), { steps: 2 }]);
    const drop = (await game.events(seq, 'pickup/spawned')).find((e) => e.payload.dropped);
    assert.ok(drop && drop.payload.kind === 'pk_rounds_6', 'a packet where the Bider fell');
    assert.ok(Math.hypot(drop.payload.x - a.x, drop.payload.z - a.z) < 0.01);
    // a breakable (a dressing empty brk_ of the zone GLB)
    const brk = await game.page.evaluate(() => { const c = window.__dbg.ext.core.ctx(); const z = c.scene.world.getObjectByName('plenty_street'); const o = z.children.find((x) => /^brk_/.test(x.name)); const v = o.getWorldPosition(new o.position.constructor()); return { name: o.name, x: v.x, y: v.y, z: v.z }; });
    const seq2 = await mark(game);
    await game.run([{ call: ['teleport', brk.x + 2.5, 0, brk.z, 90, 0] }, { steps: 1 }, { aimAtEntity: ['plenty_street:' + brk.name] }, { tap: 'fire', steps: 2 }]);
    const ev = await game.events(seq2);
    assert.ok(ev.some((e) => e.name === 'breakable/broken'), 'it broke');
    assert.ok(ev.some((e) => e.name === 'pickup/spawned' && e.payload.dropped), 'and dropped a packet');
  } finally { await game.close(); }
});
