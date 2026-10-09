// Pre-release (a final reviewer, major: scratch/reg-story-a/H_seated.log). The nine who keep their seats in the Tally
// House wear the lit knot she has just been taught to shoot, and they were drawn with no hit volume: four rounds into
// a hood met nothing (no mark, no sound, no word), and then the narrator said "She let them keep them".
// (The rows stand inside a wood blocker 1.3 m high: a round at a body rang as wood on its face, one at the knot flew on.)
// Now each seat has a cloth volume of its own round the figure, just proud of the blocker. A round stops there as in any inert thing
// (`combat/hit` `impact` on cloth: the puff and the thud are the surface's own), nothing bursts, nobody is freed or
// felled, it is no hit on the end card, and the first such round is answered by one narrator line, once a run.
// The real world beside five core stubs.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUT, STORY, mark, marker, open, server, shoot, shootScript, status } from './lib.mjs';

let srv;
before(async () => { srv = await server(); });
after(async () => { await srv.close(); });

const SEATED = marker('prop_tally_seated');
const LINE = 'nar_seat_shot';
const lines = async (game, since) => (await game.events(since, 'story/line')).map((e) => e.payload.key);
const hits = async (game, since) => (await game.events(since, 'combat/hit')).map((e) => e.payload);
const count = (s) => ({ hit: s.roundsHit, knots: s.knotsBurst, freed: s.freed, felled: s.felled, three: s.linesOfThree });
/** two metres behind seat `i`, on the side its back is to (the figures face the table at x = -89) */
const behind = (i) => { const p = SEATED.params.seats[i].pos; return ['teleport', p[0] + (p[0] < -89 ? -2 : 2), 0, p[2], 0, 0]; };

test('the data: nine seats, the line is the narrator\'s, spare, and named once-only', () => {
  assert.equal(SEATED.params.seats.length, 9);
  const l = STORY.lines[LINE];
  assert.ok(l && l.speaker === 'narrator', 'story.json has the line');
  assert.ok(l.text.length <= STORY.meta.rules.subtitle_max_chars);
  assert.equal(l.seconds, Math.max(2, Math.round((1.5 + 0.06 * l.text.length) * 2) / 2), 'held by the rule of story.json');
  assert.ok(STORY.meta.rules.once_only.includes(LINE));
  assert.ok(!/\bdead\b|corpse|bod(y|ies)/i.test(l.text), 'the seated are not called dead');
  // no marker plays it: it is said by the shot alone
  assert.ok(!JSON.stringify(LAYOUT).includes(LINE));
});

test('a round into a seated figure stops there with a cloth impact; the line is said once; a second round says nothing; nothing bursts and the counts stand', async () => {
  const game = await open(srv, { checkpoint: 'cp_tally_hatch' });
  try {
    await game.dbg('god', true);
    let s = await game.run([{ call: behind(1) }, { steps: 4 }]);
    assert.equal(s.world.zone, 'tally_house');
    // every seat has its two volumes while the room is built
    for (let i = 0; i < 9; i++) assert.equal(await game.page.evaluate((id) => window.__dbg.aimAtEntity(id), `${SEATED.id}#${i}`), true, `seat ${i} has a volume`);
    const before = (await status(game)).stats, enc = s.encounters.enc_tally.state, alive = s.enemies.filter((e) => e.alive).length;
    const flags = s.world.flags.filter((f) => f.startsWith('burst:')).length;

    // ---- the first round, into the hood
    let seq = await mark(game);
    const p = SEATED.params.seats[1].pos;
    await game.run([{ aimAt: [p[0] + 0.17, 1.2, p[2]] }, { tap: 'fire', steps: 2 }]);     // the hood, from behind the chair
    let h = await hits(game, seq);
    assert.equal(h.length, 1, 'one thing met');
    assert.deepEqual([h[0].entityId, h[0].outcome, h[0].surface, h[0].damage], [`${SEATED.id}#1`, 'impact', 'cloth', 0], 'the round stops in the hood: an impact on cloth (the puff and the thud)');
    assert.ok(Math.abs(h[0].x - p[0]) < 0.48 && Math.abs(h[0].z - p[2]) < 0.43 && h[0].y > 0.95 && h[0].y < 1.41, `at the head of that seat (${h[0].x.toFixed(2)}, ${h[0].y.toFixed(2)}, ${h[0].z.toFixed(2)})`);
    await game.run([{ steps: 30 }]);
    assert.deepEqual((await lines(game, seq)).filter((k) => k === LINE), [LINE], 'the narrator answers the first round');
    assert.ok((await game.state()).world.flags.includes('did_seat_shot'), 'saved with the run');

    // ---- the second round, into the KNOT of another (1.30 to 1.36 m: over the blocker), from across the table: the same impact, no word
    await game.run([{ steps: 6 * 60 }]);
    const seq2 = await mark(game);
    const q = SEATED.params.seats[6].pos;
    await game.run([{ call: ['teleport', -89, 0, q[2] + 3.5, 0, 0] }, { steps: 4 }, { aimAt: [q[0] - 0.2, 1.34, q[2]] }, { tap: 'fire', steps: 2 }]);
    h = await hits(game, seq2);
    assert.deepEqual([h.length, h[0]?.entityId, h[0]?.outcome, h[0]?.surface], [1, `${SEATED.id}#6`, 'impact', 'cloth']);
    // a line round stops there too
    await game.run([{ call: behind(1) }, { steps: 2 }, { aimAtEntity: [`${SEATED.id}#1`], steps: 2 }]);
    const lr = await shoot(game, 'line_round');
    console.log('line round:', JSON.stringify(lr));
    await game.run([{ steps: 8 * 60 }]);
    assert.deepEqual((await lines(game, seq)).filter((k) => k === LINE), [LINE], 'said once, whatever is fired after');
    assert.equal((await lines(game, seq2)).includes(LINE), false);

    // ---- nothing burst, nobody freed or felled, no fight begun, and they are no hits on the card
    const ev = await game.events(seq);
    for (const name of ['knot/burst', 'enemy/freed', 'enemy/felled', 'enemy/died', 'shootable/hit', 'encounter/started', 'secret/found']) assert.equal(ev.filter((e) => e.name === name).length, 0, name);
    s = await game.state();
    const after = (await status(game)).stats;
    assert.equal(after.roundsFired, before.roundsFired + 3, "the three rounds (two lead, one line) count as fired");
    assert.deepEqual(count(after), count(before), 'hits, knots, freed and felled are as they were');
    assert.ok(after.roundsHit <= after.roundsFired);
    assert.equal(s.encounters.enc_tally.state, enc);
    assert.equal(s.enemies.filter((e) => e.alive).length, alive);
    assert.equal(s.world.flags.filter((f) => f.startsWith('burst:')).length, flags);
  } finally { await game.close(); }
});

test('the line is once a run: taken up again from the checkpoint after it was said, a round into a seat says nothing', async () => {
  const game = await open(srv, { checkpoint: 'cp_tally_hatch' });
  try {
    await game.dbg('god', true);
    await game.run([{ call: behind(2) }, { steps: 4 }, ...shootScript(`${SEATED.id}#2`), { steps: 6 * 60 }]);
    assert.ok((await game.state()).world.flags.includes(LINE), 'told');
    // the room is left and built again (the volumes are removed and made again with it)
    const yard = marker('trg_dowser');
    await game.run([{ call: ['teleport', yard.pos[0], yard.pos[1], yard.pos[2], 0, 0] }, { steps: 120 }]);
    const seq = await mark(game);
    await game.run([{ call: behind(2) }, { steps: 30 }, ...shootScript(`${SEATED.id}#2`), { steps: 5 * 60 }]);
    const h = await hits(game, seq);
    assert.deepEqual([h.length, h[0]?.entityId, h[0]?.outcome], [1, `${SEATED.id}#2`, 'impact'], 'still a thing a round stops in');
    assert.equal((await lines(game, seq)).includes(LINE), false);
  } finally { await game.close(); }
});
