// The kept round, world side (code-world 4.7; GDD 6.6, acceptance test 8): the marks lit and F live from the first tick
// of phase 3a, nar_not_for_firing never in 3a, the kept ladder 15 / 30 / 45 / 75 s, the boxes that keep 3b completable
// with no lead, and what the shot commits.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mark, marker, open, server } from './lib.mjs';

let srv;
before(async () => { srv = await server(); });
after(async () => { await srv.close(); });

const keptMark = async (game) => (await game.state()).systems.player.keptMark;
const kept = (stage) => ({ call: ['emit', 'weapon/kept', { stage, mark: '' }] });

test('F is live on a mark from the first tick of phase 3a; nar_not_for_firing before 3a once, never in it', async () => {
  const game = await open(srv, { checkpoint: 'cp_boss_p2' });
  try {
    await game.dbg('god', true);
    const m1 = marker('ia_proving_mark_1');
    await game.run([{ call: ['teleport', m1.pos[0], m1.pos[1], m1.pos[2], 0, 0] }, { steps: 2 }]);
    assert.equal(await keptMark(game), '', 'no context before phase 3a');
    let seq = await mark(game);
    await game.run([kept('denied'), { steps: 2 }, kept('denied'), { steps: 400 }]);
    let lines = (await game.events(seq, 'story/line')).map((e) => e.payload.key);
    assert.equal(lines.filter((k) => k === 'nar_not_for_firing').length, 1, 'once, before 3a');
    // phase 3a: the marks are lit and the context is set on the very tick
    seq = await mark(game);
    const phase = await game.page.evaluate(() => { const dbg = window.__dbg; dbg.setBossPhase('p3a'); dbg.step(1, false); return dbg.state().systems.player.keptMark; });
    assert.equal(phase, 'ia_proving_mark_1', 'F context on the first tick of 3a');
    const calls = (await game.state()).systems.render.calls;
    assert.ok(calls.includes('lamps.setMask:mark_glows:63'), 'the six marks are lit');
    // a first-ever press in 3a off a mark: no line, the nearest halo flares
    const g2 = await open(srv, { checkpoint: 'cp_boss_p3' });
    try {
      const s2 = await g2.run([kept('denied'), { steps: 300 }]);
      assert.ok(!(await g2.events(0, 'story/line')).some((e) => e.payload.key === 'nar_not_for_firing'), 'never in 3a, even a first-ever press');
      assert.ok(s2.systems.render.calls.some((c) => c.startsWith('lamps.setBoost:mark_glows')), 'the halo flares');
    } finally { await g2.close(); }
    // stepping off the mark drops the context
    await game.run([{ call: ['teleport', m1.pos[0], m1.pos[1], m1.pos[2] + 3, 0, 0] }, { steps: 2 }]);
    assert.equal(await keptMark(game), '');
    lines = (await game.events(seq, 'story/line')).map((e) => e.payload.key);
    assert.ok(!lines.includes('nar_not_for_firing'));
  } finally { await game.close(); }
});

test('the kept ladder from boss/charge_required: T1 15 s, T2 30 s, T3 45 s (outline + the prompt shown), T4 75 s', async () => {
  const game = await open(srv, { checkpoint: 'cp_boss_p3' });
  try {
    await game.dbg('god', true);
    await game.run([{ steps: 600 }]);                       // what the restore said is over
    const seq = await mark(game);
    await game.run([{ call: ['emit', 'boss/charge_required', {}] }, { steps: 80 * 60 }]);
    const start = (await game.events(seq, 'boss/charge_required'))[0].tick;
    const hints = (await game.events(seq, 'puzzle/hint')).filter((e) => e.payload.puzzle === 'kept');
    assert.deepEqual(hints.map((e) => e.payload.tier), [1, 2, 3, 4]);
    assert.deepEqual(hints.map((e) => Math.round((e.tick - start) / 60)), [15, 30, 45, 75]);
    const ev = await game.events(seq);
    assert.ok(ev.some((e) => e.name === 'ui/hint' && e.payload.key === 'ui_prompt_kept' && e.payload.show));
    const lines = ev.filter((e) => e.name === 'story/line').map((e) => e.payload.key);
    assert.ok(lines.includes('nar_office') && lines.includes('hint_kept_2'), lines.join(' '));
    assert.ok((await game.state()).systems.render.calls.some((c) => c.startsWith('setOutline:ia_proving_mark')));
  } finally { await game.close(); }
});

test('from cp_boss_p3 with no lead and two line rounds: the boxes give eighteen every 10 s; the proof commits cp_boss_proven and says BORE PROVEN, then HEAD DRY and nar_kept after 4 s', async () => {
  const game = await open(srv, { checkpoint: 'cp_boss_p3' });
  try {
    await game.dbg('god', true);
    await game.run([{ call: ['setAmmo', 0, 0, 2] }, { steps: 1 }]);
    const box = marker('ia_ammo_box_bore_e');
    const use = [{ call: ['teleport', box.pos[0] - 1.4, box.pos[1], box.pos[2], -90, 0] }, { steps: 1 }, { aimAt: [box.pos[0], box.pos[1] + 0.45, box.pos[2]] }, { tap: 'interact', steps: 2 }];
    let s = await game.run(use);
    assert.equal(s.player.reserve, 18, 'the boss-room box gives eighteen');   // polish round 4 (12 left phase 2 opening with a run to the box)   // polish round 3 (integration, R2): six every 20 s starved the fight
    s = await game.run([{ steps: 60 }, ...use]);
    assert.equal(s.player.reserve, 18, 'not again inside its 10 s');
    s = await game.run([{ steps: 10 * 60 }, ...use]);
    assert.equal(s.player.reserve, 36, 'again after 10 s');
    // the mark, the press, the shot
    const m = marker('ia_proving_mark_3');
    await game.run([{ call: ['teleport', m.pos[0], m.pos[1], m.pos[2], 0, 0] }, { steps: 2 }]);
    assert.equal(await keptMark(game), 'ia_proving_mark_3', 'the proof is reachable: the context is hers on any mark');
    const seq = await mark(game);
    await game.run([kept('loading'), { steps: 200 }, kept('fired'), { steps: 2 }]);
    const fired = (await game.events(seq, 'weapon/kept')).find((e) => e.payload.stage === 'fired').tick;
    await game.run([{ steps: 1500 }]);
    const ev = await game.events(seq);
    assert.ok(ev.some((e) => e.name === 'checkpoint/saved' && e.payload.id === 'cp_boss_proven'));
    s = await game.state();
    assert.equal(s.world.objective, 'obj_boss_dry');
    const lines = ev.filter((e) => e.name === 'story/line');
    const keys = lines.map((e) => e.payload.key);
    // polish round 4: the station answers the shot (it trailed it by 10 to 15 s); the narrator after the silence
    assert.ok(keys.indexOf('nar_seal') < keys.indexOf('stn_proven') && keys.indexOf('stn_proven') < keys.indexOf('stn_dry') && keys.indexOf('stn_dry') < keys.indexOf('nar_kept'), keys.join(' '));
    // (nar_seal, 5.5 s, is still on screen when she fires 3.3 s after the press: the station is the next line)
    assert.ok(lines.find((e) => e.payload.key === 'stn_proven').tick - fired <= 3 * 60, 'BORE PROVEN is the next line after the shot');
    assert.ok(lines.find((e) => e.payload.key === 'nar_kept').tick - fired >= 240, 'after four seconds of silence');
    assert.ok(ev.some((e) => e.name === 'audio/cue' && e.payload.cue === 'water_below'));
    assert.ok(s.systems.render.calls.includes('lamps.setMask:mark_lamps:127'), 'the cradle\'s seventh disc lights');
  } finally { await game.close(); }
});
