// The far rim (code-world 4.10; GDD 9.8; acceptance test 10): only the stone arms the ending; the three ends and both
// fail-safes; lamps on the end card = 9 + freed = the windows lit.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mark, marker, open, server, takeRound } from './lib.mjs';

let srv;
before(async () => { srv = await server(); });
after(async () => { await srv.close(); });

const ending = async (game, since) => Object.fromEntries((await game.events(since)).filter((e) => e.name.startsWith('ending/')).map((e) => [e.name, e]));
const STONE = marker('trg_stone'), EXIT = marker('exit_rim'), LAMPS = marker('trg_lamps'), ROUND = marker('ia_stone_round'), FIRE = marker('vista_fire');

test('walking to the north edge first does nothing; the take branch: the round, the fire, the last lines, the end card', async () => {
  const game = await open(srv, { checkpoint: 'cp_rim' });
  try {
    const seq = await mark(game);
    await game.run([{ call: ['teleport', EXIT.pos[0], EXIT.pos[1], EXIT.pos[2] + 0.5, 0, 0] }, { steps: 20 * 60 }]);
    let s = await game.state();
    assert.equal(s.game, 'playing');
    assert.deepEqual(Object.keys(await ending(game, seq)).filter((k) => k !== 'ending/lamps'), [], 'nothing ends at the edge before the stone');
    await game.run([{ call: ['teleport', STONE.pos[0], STONE.pos[1], STONE.pos[2], 90, 0] }, { steps: 5 }, ...takeRound(ROUND)]);
    const end = await game.until({ event: 'ending/card' }, 80 * 60);
    assert.ok(end.met);
    s = await game.state();
    assert.equal(s.game, 'ending');
    const e = await ending(game, seq);
    assert.equal(e['ending/stone'].payload.taken, true);
    assert.equal(s.player.seventh, 'violet');
    assert.ok(e['ending/fire'].tick < e['ending/card'].tick);
    const lines = (await game.events(seq, 'story/line')).map((x) => x.payload.key);
    for (const k of ['nar_take_1', 'nar_take_2', 'nar_fire', 'nar_last']) assert.ok(lines.includes(k), k);
    assert.ok(!lines.includes('nar_leave'));
    const lastLine = (await game.events(seq, 'story/line')).find((x) => x.payload.key === 'nar_last');
    assert.ok((await game.events(seq, 'audio/cue')).some((x) => x.payload.cue === 'wire_resolve' && x.tick === lastLine.tick));
    const toEnding = (await game.events(seq, 'game/state')).find((x) => x.payload.to === 'ending');
    assert.ok(e['ending/card'].tick - toEnding.tick >= 240 - 1, '4 s of wind before the card');
  } finally { await game.close(); }
});

test('the leave branch: 25 s AWAY from the stone after its lines (coming back starts it again); or the north edge once the stone lines are over', async () => {
  let game = await open(srv, { checkpoint: 'cp_rim' });
  try {
    const seq = await mark(game);
    await game.run([{ call: ['teleport', STONE.pos[0], STONE.pos[1], STONE.pos[2], 0, 0] }, { steps: 2 }]);
    await game.until({ event: 'story/line_end', where: { key: 'nar_stone_4' } }, 60 * 60);
    // at the stone: no clock (R5)
    await game.run([{ steps: 40 * 60 }]);
    assert.equal((await ending(game, seq))['ending/stone'], undefined, 'standing at the stone never ends it');
    assert.equal((await game.state()).systems.world.ending.sinceStone, 0);
    // she walks away: 25 s from then
    await game.run([{ call: ['teleport', AWAY[0], AWAY[1], AWAY[2], 0, 0] }, { steps: 20 * 60 }]);
    assert.equal((await ending(game, seq))['ending/stone'], undefined, 'not before 25 s away');
    // and comes back: the clock starts again
    await game.run([{ call: ['teleport', STONE.pos[0], STONE.pos[1], STONE.pos[2], 0, 0] }, { steps: 30 }, { call: ['teleport', AWAY[0], AWAY[1], AWAY[2], 0, 0] }, { steps: 1 }]);
    const left = (await game.state()).tick;
    await game.run([{ steps: 24 * 60 }]);
    assert.equal((await ending(game, seq))['ending/stone'], undefined, 'coming back started the 25 s again');
    await game.run([{ steps: 70 }]);
    const e = await ending(game, seq);
    assert.equal(e['ending/stone'].payload.taken, false);
    assert.ok(Math.abs(e['ending/stone'].tick - left - 1500) <= 70, `25 s after she walked away (${e['ending/stone'].tick - left} ticks)`);
    const end = await game.until({ event: 'ending/card' }, 80 * 60);
    assert.ok(end.met);
    const lines = (await game.events(seq, 'story/line')).map((x) => x.payload.key);
    assert.ok(lines.includes('nar_leave') && !lines.includes('nar_take_2'));
  } finally { await game.close(); }
  game = await open(srv, { checkpoint: 'cp_rim' });
  try {
    // the lamps lines first, outside the stone's volume, so the stone's own lines are over well inside 25 s
    await game.run([{ call: ['teleport', LAMPS.pos[0] + 3, LAMPS.pos[1], LAMPS.pos[2], 0, 0] }, { steps: 11 * 60 }]);
    const seq = await mark(game);
    await game.run([{ call: ['teleport', STONE.pos[0], STONE.pos[1], STONE.pos[2], 0, 0] }, { steps: 2 }]);
    await game.until({ event: 'story/line_end', where: { key: 'nar_stone_4' } }, 30 * 60);
    assert.equal((await ending(game, seq))['ending/stone'], undefined);
    const walk = await game.walkTo(EXIT.pos[0] - 6, EXIT.pos[2] + 0.2, { stopRadius: 0.5, maxTicks: 400 });
    void walk;
    await game.run([{ steps: 5 }]);
    const e = await ending(game, seq);
    assert.ok(e['ending/stone'] && e['ending/stone'].payload.taken === false, 'walking into the edge strip after the stone ends it');
    const stoneT = (await game.events(seq, 'story/line')).find((x) => x.payload.key === 'nar_stone_1').tick;
    assert.ok(e['ending/stone'].tick - stoneT < 25 * 60, 'before the 25 s');
  } finally { await game.close(); }
});

// ---- polish round 3, lead ruling R5 ---------------------------------------------------------------------------------
const ARRIVE = marker('trg_rim_arrive');
const AWAY = [14, 18, 108];                                 // on the ledge, 13 m from the stone, outside the exit strip
const order = (lines, a, b) => lines.indexOf(a) >= 0 && lines.indexOf(b) > lines.indexOf(a);

test('R5: straight to the stone and standing there: the stone\'s lines come ahead of the rim\'s, the choice is never taken, a late E still takes', async () => {
  const game = await open(srv, { checkpoint: 'cp_rim' });
  try {
    const seq = await mark(game);
    // out of the cage through the arrival trigger (three rim lines queue), then straight to the stone
    await game.run([{ call: ['teleport', ARRIVE.pos[0], ARRIVE.pos[1], ARRIVE.pos[2], 0, 0] }, { steps: 30 }]);
    const at = (await game.state()).tick;
    await game.run([{ call: ['teleport', STONE.pos[0], STONE.pos[1], STONE.pos[2], 90, 0] }, { steps: 70 * 60 }]);
    const ev = await game.events(seq, 'story/line');
    const lines = ev.map((x) => x.payload.key);
    assert.equal((await ending(game, seq))['ending/stone'], undefined, '70 s at the stone: nothing chosen for her');
    for (const k of ['nar_lamps', 'nar_lamps_count', 'nar_stone_1', 'nar_stone_2', 'nar_stone_3', 'nar_stone_4']) assert.ok(lines.includes(k), k);
    assert.ok(order(lines, 'nar_lamps_count', 'nar_stone_1'), 'the lamps, then the stone');
    const fourth = ev.find((x) => x.payload.key === 'nar_stone_4');
    assert.ok(fourth.tick - at <= 34 * 60, `the seventh is named within 34 s of reaching the stone (${((fourth.tick - at) / 60).toFixed(1)} s; was 43 s, after the choice had gone)`);
    assert.ok(!lines.includes('nar_rim_2') || lines.indexOf('nar_rim_2') > lines.indexOf('nar_stone_4'), 'no scenery line stands between her and the stone\'s lines');
    // (the round is hers to take, however late)
    await game.run([{ aimAt: ROUND.pos, steps: 2 }]);
    assert.equal((await game.state()).systems.world.interact.focus, 'ia_stone_round');
    await game.run([{ tap: 'interact', steps: 2 }]);
    assert.equal((await ending(game, seq))['ending/stone'].payload.taken, true);
    assert.equal((await game.state()).player.seventh, 'violet');
  } finally { await game.close(); }
});

test('R5: a brisk take keeps the lamps lines (the end card counts lamps); once she has walked on the stone offers nothing', async () => {
  let game = await open(srv, { checkpoint: 'cp_rim' });
  try {
    const seq = await mark(game);
    await game.run([{ call: ['teleport', ARRIVE.pos[0], ARRIVE.pos[1], ARRIVE.pos[2], 0, 0] }, { steps: 30 },
      { call: ['teleport', STONE.pos[0], STONE.pos[1], STONE.pos[2], 90, 0] }, { steps: 5 }, ...takeRound(ROUND)]);
    assert.equal((await ending(game, seq))['ending/stone'].payload.taken, true, 'taken a tenth of a second after reaching the stone');
    const end = await game.until({ event: 'ending/card' }, 120 * 60);
    assert.ok(end.met);
    const lines = (await game.events(seq, 'story/line')).map((x) => x.payload.key);
    for (const k of ['nar_lamps', 'nar_lamps_count', 'nar_stone_1', 'nar_take_1', 'nar_take_2', 'nar_fire', 'nar_last']) assert.ok(lines.includes(k), `${k} was said (${lines.join(' ')})`);
    // polish round 4: what describes a round she has already pocketed is not said ("And a seventh, unfired" came 25 s after)
    for (const k of ['nar_stone_2', 'nar_stone_3', 'nar_stone_4', 'nar_rim_2', 'nar_rim_3']) assert.ok(!lines.includes(k), `${k} is not said after the round is taken (${lines.join(' ')})`);
    assert.ok(order(lines, 'nar_lamps_count', 'nar_take_1') && order(lines, 'nar_take_2', 'nar_fire'), 'lamps, stone, branch, fire');
    const card = (await game.events(seq, 'ending/card')).at(-1);
    assert.ok((await game.events(seq, 'story/line')).every((x) => x.tick + Math.round(x.payload.seconds * 60) <= card.tick + 1), 'every line is over before the card');
  } finally { await game.close(); }
  game = await open(srv, { checkpoint: 'cp_rim' });
  try {
    const seq = await mark(game);
    await game.run([{ call: ['teleport', STONE.pos[0], STONE.pos[1], STONE.pos[2], 90, 0] }, { steps: 2 }]);
    await game.until({ event: 'story/line_end', where: { key: 'nar_stone_4' } }, 60 * 60);
    await game.run([{ call: ['teleport', EXIT.pos[0] - 6, EXIT.pos[1], EXIT.pos[2] + 0.2, 0, 0] }, { steps: 3 }]);
    assert.equal((await ending(game, seq))['ending/stone'].payload.taken, false, 'the edge: she walks on');
    // back at the stone while the narrator says she left it: no prompt, and E does nothing
    await game.run([{ call: ['teleport', STONE.pos[0], STONE.pos[1], STONE.pos[2], 90, 0] }, { steps: 3 }, { aimAt: ROUND.pos, steps: 3 }]);
    assert.notEqual((await game.state()).systems.world.interact.focus, 'ia_stone_round', 'no "Take" prompt once the leave branch runs');
    const focus = (await game.events(seq, 'interact/focus')).at(-1);
    assert.equal(focus ? focus.payload.id : '', '', `nothing at the stone is offered once a branch runs, the note neither (focus '${focus && focus.payload.id}')`);
    await game.run([{ tap: 'interact', steps: 3 }]);
    assert.equal((await game.state()).player.seventh === 'violet', false);
  } finally { await game.close(); }
});

test('R5: the fire kindles in her view: the view is eased to it; with reduce-motion it waits for her to look; the wind only after 2 s seen', async () => {
  const fireCos = (g) => g.page.evaluate(() => {
    return window.__dbg.ext.world.status().ending.fireCos;
  });
  let game = await open(srv, { checkpoint: 'cp_rim' });
  try {
    const seq = await mark(game);
    // she takes the round looking down at the stone, facing west: the fire (north) is far outside her view
    await game.run([{ call: ['teleport', STONE.pos[0], STONE.pos[1], STONE.pos[2], 90, 0] }, { steps: 5 }, ...takeRound(ROUND)]);
    assert.ok(await fireCos(game) < Math.cos(25 * Math.PI / 180), 'looking down at the stone, the fire is out of view');
    const fire = await game.until({ event: 'ending/fire' }, 120 * 60);
    assert.ok(fire.met);
    assert.ok(await fireCos(game) >= Math.cos(25 * Math.PI / 180), `the fire kindles inside her view cone (cos ${await fireCos(game)})`);
    const lines = (await game.events(seq, 'story/line')).map((x) => x.payload.key);
    assert.ok(!lines.includes('nar_fire'), 'the fire is not named before it is in view');
    const end = await game.until({ event: 'ending/card' }, 60 * 60);
    assert.ok(end.met);
    assert.ok((await game.state()).systems.world.ending.fireSeen >= 2, 'in view for 2 s before the wind');
  } finally { await game.close(); }
  game = await open(srv, { checkpoint: 'cp_rim' });
  try {
    await game.dbg('setOption', 'reduceMotion', true);
    const seq = await mark(game);
    await game.run([{ call: ['teleport', STONE.pos[0], STONE.pos[1], STONE.pos[2], 90, 0] }, { steps: 5 }, ...takeRound(ROUND)]);
    await game.until({ event: 'story/line_end', where: { key: 'nar_take_2' } }, 120 * 60);
    await game.run([{ steps: 8 * 60 }]);
    assert.equal((await ending(game, seq))['ending/fire'], undefined, 'reduce-motion: the view is hers, and the fire waits for it');
    assert.equal((await game.state()).systems.world.ending.turning, false);
    const s0 = (await game.state()).tick;
    await game.run([{ aimAt: FIRE.params.target, steps: 3 }]);
    const e = await ending(game, seq);
    assert.ok(e['ending/fire'] && e['ending/fire'].tick >= s0, 'she looks: it catches');
    // she looks away at once: the wind waits (a while) for her to have seen it
    await game.run([{ aimAt: ROUND.pos, steps: 1 }]);
    await game.until({ event: 'story/line_end', where: { key: 'nar_last' } }, 60 * 60);
    await game.run([{ steps: 5 * 60 }]);
    assert.equal((await game.state()).game, 'playing', 'not seen for 2 s yet: no wind');
    await game.run([{ aimAt: FIRE.params.target, steps: 2 * 60 + 10 }]);
    assert.equal((await game.state()).game, 'ending');
  } finally { await game.close(); }
});

test('the end card: the lamps are never nineteen; knots burst counts the crown knots she put a round through', async () => {
  const game = await open(srv, { checkpoint: 'cp_hall_clear' });
  try {
    await game.page.evaluate(() => { for (let i = 0; i < 10; i++) window.__dbg.emit('enemy/freed', { x: 0, y: 0, z: 0, id: 'x#' + i, encounter: '', cause: 'crown', counted: true }); });
    await game.page.evaluate(() => { window.__dbg.emit('boss/pawl', { side: 'l', burst: true }); window.__dbg.emit('boss/pips', { phase: 'p1', remaining: 10, total: 10, lit: 10 }); window.__dbg.emit('boss/pips', { phase: 'p1', remaining: 8, total: 10, lit: 8 }); });
    const s = await game.state();
    assert.equal(s.world.lamps, 20, 'ten freed: twenty lamps, not nineteen');
    const stats = await game.page.evaluate(() => window.__dbg.ext.world.status().stats);
    assert.equal(stats.freed, 10);
    assert.equal(stats.knotsBurst, 13, 'ten crown knots, a pawl, two of the Windlass\'s');
    await game.dbg('checkpoint', 'cp_rim');
  } finally { await game.close(); }
});

test('the fail-safes from cp_rim: at 60 s the glint doubles and the first stone line points; at 150 s she leaves from wherever she is', async () => {
  const game = await open(srv, { checkpoint: 'cp_rim' });
  try {
    const seq = await mark(game);
    const start = (await game.state()).tick;
    await game.run([{ call: ['teleport', 20, 18, 108, 0, 0] }, { steps: 61 * 60 }]);
    const pointer = (await game.events(seq, 'story/line')).find((x) => x.payload.key === 'nar_stone_1');
    assert.ok(pointer && Math.abs(pointer.tick - start - 3600) <= 60, 'the pointer at 60 s');
    assert.equal((await game.state()).systems.world.ending.boosted, true);
    await game.run([{ steps: 89 * 60 + 30 }]);
    const e = await ending(game, seq);
    assert.ok(e['ending/stone'] && e['ending/stone'].payload.taken === false, 'leave at 150 s');
    assert.ok(Math.abs(e['ending/stone'].tick - start - 9000) <= 60);
  } finally { await game.close(); }
});

test('lamps on the end card = 9 + freed = the windows lit on the town card', async () => {
  const game = await open(srv, { checkpoint: 'cp_hall_clear' });
  try {
    // five Biders freed in a fight that was cleared (counted)
    await game.page.evaluate(() => { for (let i = 0; i < 5; i++) window.__dbg.emit('enemy/freed', { x: 0, y: 0, z: 0, id: 'x#' + i, encounter: '', cause: 'crown', counted: true }); });
    await game.dbg('checkpoint', 'cp_rim');
    await game.run([{ steps: 4 * 60 }]);
    const seq0 = 0;
    const lamps = (await game.events(seq0, 'ending/lamps')).at(-1);
    assert.equal(lamps.payload.count, 14);
    const calls = (await game.state()).systems.render.calls;
    assert.ok(calls.includes('lamps.setCount:town_windows:14'), 'fourteen windows lit');
    await game.run([{ call: ['teleport', STONE.pos[0], STONE.pos[1], STONE.pos[2], 90, 0] }, { steps: 5 }, ...takeRound(ROUND)]);
    await game.until({ event: 'ending/card' }, 80 * 60);
    const card = (await game.events(0, 'ending/card')).at(-1);
    assert.equal(card.payload.stats.freed, 5);
    assert.equal(Math.min(48, 9 + card.payload.stats.freed), lamps.payload.count);
  } finally { await game.close(); }
});

test('the stone: the note and the round are two targets; she is offered the one she is looking at, and a look between them reads the unread note', async () => {
  const game = await open(srv, { checkpoint: 'cp_rim' });
  try {
    const NOTE = marker('rd_note_stone');
    const focus = async () => (await game.state()).systems.world.interact.focus;
    const prompt = async (since) => (await game.events(since, 'interact/focus')).at(-1)?.payload.prompt;
    const MID = [0, 1, 2].map((i) => NOTE.pos[i] + (ROUND.pos[i] - NOTE.pos[i]) * 0.45);
    const seq = await mark(game);
    // the story critic's spot (round 3): 1.5 m east of the stone, where aiming at the note gave "E Take"
    await game.run([{ call: ['teleport', 2.93, STONE.pos[1], 102.95, 75, -35] }, { steps: 3 }, { aimAt: NOTE.pos, steps: 2 }]);
    assert.equal(await focus(), 'rd_note_stone', 'aiming at the note: the note');
    assert.equal(await prompt(seq), 'ui_prompt_read');
    // polish round 4: aimed at the round the prompt read READ; the final choice stood behind the wrong verb
    await game.run([{ aimAt: ROUND.pos, steps: 2 }]);
    assert.equal(await focus(), 'ia_stone_round', 'aiming at the round, the note unread: the round');
    assert.equal(await prompt(seq), 'ui_prompt_take');
    await game.run([{ aimAt: MID, steps: 2 }]);
    assert.equal(await focus(), 'rd_note_stone', 'a look that falls between the two, the note unread: the note (the round is for good)');
    await game.run([{ tap: 'interact', steps: 2 }, { steps: 600 }]);
    let ev = await game.events(seq);
    assert.ok(ev.some((e) => e.name === 'readable/opened' && e.payload.key === 'rd_note_stone'), 'E opened the note');
    assert.ok(!ev.some((e) => e.name === 'ending/stone'), 'and did not take the round');
    assert.equal((await game.state()).game, 'playing');
    // from the other side of the stone too (west of it, looking east)
    await game.run([{ call: ['teleport', 0.2, STONE.pos[1], 102.4, -90, -35] }, { steps: 3 }, { aimAt: ROUND.pos, steps: 2 }]);
    assert.equal(await focus(), 'ia_stone_round');
    await game.run([{ aimAt: NOTE.pos, steps: 2 }]);
    assert.equal(await focus(), 'rd_note_stone', 'and the note again when she aims at the paper');
    await game.run([{ aimAt: ROUND.pos, steps: 2 }, { tap: 'interact', steps: 2 }]);
    ev = await game.events(seq);
    assert.equal(ev.find((e) => e.name === 'ending/stone').payload.taken, true);
  } finally { await game.close(); }
});
