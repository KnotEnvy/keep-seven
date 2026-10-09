// Pass i5 (both visual reviewers, a major each; lead rulings R4 and R18): from the yard gate and the east half of the
// yard the pursued man read as a man standing on the pump tank's roof (his card went up the moment the yard was clear and
// is drawn 62 px tall from anywhere: shots/i5-visual-a/close_high/yd_enter.png, shots/i5-visual-b/sg_sheet.png). He is up
// only where her line to him is clean (src/world/director.ts SIGHT_CLEAN_AT, SIGHT_RISE). The real world beside five core
// stubs; the picture itself is measured in i5_real.test.mjs.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { STORY, mark, marker, open, server, status } from './lib.mjs';

let srv;
before(async () => { srv = await server(); });
after(async () => { await srv.close(); });

const DOWSER = marker('vista_dowser').params.target;
const keys = async (game, since) => (await game.events(since, 'story/line')).map((e) => e.payload.key);
const dir = async (game) => (await status(game)).director;
const ended = async (game, since) => (await game.events(since, 'vignette/state')).filter((e) => e.payload.id === 'vig_dowser' && e.payload.stage === 'ended');
/** she stands at (x, z) with her back to him (east), then turns to him and holds for `look` ticks */
const stand = (x, z, look) => [{ call: ['teleport', x, 0, z, -90, 0] }, { steps: 30 }, ...(look > 0 ? [{ aimAt: DOWSER, steps: look }] : [])];

test('from the yard gate, the east yard, the middle and the pump the pursued man is not on the skyline: nothing is said, however long she looks his way (he stood on the tank roof from the moment the yard was clear)', async () => {
  const game = await open(srv, { checkpoint: 'cp_yard_clear' });
  try {
    const seq = await mark(game);
    // the reviewers' places: the gate [-78, 0], the east yard, the yard's middle, by the pump, the tank's lee
    for (const [x, z] of [[-78, 0], [-80, -4], [-86, -3], [-90, -6.5], [-84, 0], [-92, -2]]) {
      await game.run(stand(x, z, 3 * 60));
      const d = await dir(game);
      assert.equal(d.sightClean, false, `(${x}, ${z}): her line to him is not clean (a roof, a wall or the tank is under or beside him)`);
      assert.equal(d.sightUp, 0, `(${x}, ${z}): he is behind the rim`);
      assert.equal(d.sight, 1, `(${x}, ${z}): the beat has not begun`);
    }
    assert.deepEqual((await keys(game, seq)).filter((k) => k.startsWith('nar_dowser')), [], 'no line about a man she cannot see');
    assert.equal((await ended(game, seq)).length, 0, 'and he has not been taken away: he is still to come');
    assert.equal((await game.state()).world.doors.door_tally, 'closed', 'the tally door still waits for the strip before it');
  } finally { await game.close(); }
});

test('he comes up over the rim in about a third of a second where the skyline is his: on the whole strip before the tally door and in the north yard; the beat begins only when he stands', async () => {
  const game = await open(srv, { checkpoint: 'cp_yard_clear' });
  try {
    // her back to him at the gate, then into the strip at the vista, still turned away
    await game.run(stand(-78, 0, 0));
    assert.equal((await dir(game)).sightUp, 0);
    const seq = await mark(game);
    await game.run([{ call: ['teleport', -88, 0, -10.5, -90, 0] }, { steps: 12 }]);
    const mid = await dir(game);
    assert.ok(mid.sightClean && mid.sightUp > 0.05 && mid.sightUp < 0.95, `a fifth of a second in he is half up (${mid.sightUp}): no pop`);
    await game.run([{ steps: 18 }]);
    assert.equal((await dir(game)).sightUp, 1, 'half a second in he stands');
    assert.equal((await dir(game)).sight, 1, 'unseen (her back is to him): nothing is narrated');
    await game.run([{ aimAt: DOWSER, steps: 3 }]);
    assert.equal((await dir(game)).sight, 2);
    assert.deepEqual((await keys(game, seq)).filter((k) => k.startsWith('nar_dowser')), ['nar_dowser_seen'], 'the line that names him begins when she has him in view');
  } finally { await game.close(); }
  // every place of the strip a player crosses on the way to the door, and the north yard
  const g2 = await open(srv, { checkpoint: 'cp_yard_clear' });
  try {
    await g2.run(stand(-78, 0, 0));
    const T = marker('trg_dowser');
    assert.deepEqual([T.pos[0], T.pos[2], T.size[0], T.size[2]], [-88.5, -10.7, 13, 5.8], 'the strip of the layout this test walks');
    for (const [x, z] of [[-94, -10], [-91, -11], [-88, -12], [-85, -11], [-82.5, -12], [-89, -13], [-88, 5], [-97, 4]]) {
      await g2.run([{ call: ['teleport', x, 0, z, -90, 0] }, { steps: 40 }]);
      const d = await dir(g2);
      assert.ok(d.sightClean && d.sightUp === 1, `(${x}, ${z}): he stands on his rock (${JSON.stringify([d.sightClean, d.sightUp])})`);
      await g2.run([{ call: ['teleport', -78, 0, 0, -90, 0] }, { steps: 30 }]);
      assert.equal((await dir(g2)).sightUp, 0, 'and is behind the rim again from the gate');
    }
    assert.equal((await dir(g2)).sight, 1, 'never looked at: the beat has not begun, he is still to be seen');
  } finally { await g2.close(); }
});

test('looked at for her second, then walked out of the clean strip with her eyes on him: he goes down the far side for good, under the line that says so, and the door opens (he would have slid onto the tank)', async () => {
  assert.equal(STORY.lines.nar_dowser_down.text, 'He turned and went down the far side.');
  const game = await open(srv, { checkpoint: 'cp_yard_clear' });
  try {
    const seq = await mark(game);
    await game.run([{ call: ['teleport', -88, 0, -10.5, 90, 0] }, { steps: 2 }, { aimAt: DOWSER, steps: 3 * 60 }]);
    let d = await dir(game);
    assert.ok(d.sight === 2 && d.sightLooked >= 1 && d.sightUp === 1);
    // east and north, out of the strip, looking at him all the way
    await game.run([{ call: ['teleport', -84, 0, -4, 90, 0] }, { aimAt: DOWSER, steps: 8 }]);
    d = await dir(game);
    assert.ok(d.sight === 3 && d.sightDown >= 0, `he is going down (${JSON.stringify(d.sight)})`);
    assert.equal((await ended(game, seq)).length, 0, 'in view: the card is not switched off');
    await game.run([{ aimAt: DOWSER, steps: 9 * 60 }]);
    const said = (await keys(game, seq)).filter((k) => k.startsWith('nar_dowser'));
    assert.deepEqual(said, ['nar_dowser_seen', 'nar_dowser_down'], 'the line that names him is heard out, then the one that says he went');
    assert.equal((await ended(game, seq)).length, 1, 'gone behind the skyline');
    assert.ok(!(await keys(game, seq)).includes('nar_dowser_gone'), '"When she looked again" is not said of a man she watched go');
    assert.equal((await dir(game)).sight, 4);
    assert.notEqual((await game.state()).world.doors.door_tally, 'closed', 'the way on is open');
  } finally { await game.close(); }
  // not yet looked at for her second: he steps down and is there again when she comes back
  const g2 = await open(srv, { checkpoint: 'cp_yard_clear' });
  try {
    const seq = await mark(g2);
    await g2.run(stand(-88, -10.5, 0));
    assert.equal((await dir(g2)).sightUp, 1);
    await g2.run(stand(-84, -4, 60));
    let d = await dir(g2);
    assert.ok(d.sight === 1 && d.sightUp === 0, 'behind the rim, the beat not begun');
    await g2.run(stand(-88, -10.5, 90));
    d = await dir(g2);
    assert.ok(d.sight === 2 && d.sightUp === 1, 'back in the strip: he stands, and now she sees him');
    assert.equal((await ended(g2, seq)).length, 0);
  } finally { await g2.close(); }
});

test('a shot his way while he is behind the rim says nothing about firing at him', async () => {
  const game = await open(srv, { checkpoint: 'cp_yard_clear' });
  try {
    const seq = await mark(game);
    await game.run(stand(-78, 0, 30));
    await game.run([{ call: ['emit', 'shootable/hit', { id: 'card_dowser', kind: 'dowser', x: DOWSER[0], y: DOWSER[1], z: DOWSER[2], ammo: 'lead_round' }] }, { steps: 30 }]);
    assert.ok(!(await keys(game, seq)).includes('nar_dowser_shot'));
  } finally { await game.close(); }
});
