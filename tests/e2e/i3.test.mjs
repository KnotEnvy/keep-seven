// PASS i3 (the cross-cutting fixer), on the real game with all six systems:
//   1. the note on the hearthstone does not say the townsfolk are dead: "They are not suffering now." is what the
//      sheet shows (a first reader took "They did not suffer long" for a death, against everything else in the stage).
//   2. the work at hand while the yard fight runs is in the narrator's voice: bursting the yard knot draws "The yard is
//      not empty." top left ("Clear the yard." was the one line that read as a game instruction).
//   3. no work-at-hand line uses a game's order words, and no text of the stage calls the seated townsfolk dead.
//
//   node --test --test-concurrency=1 tests/e2e/i3.test.mjs
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, openGame, startServer } from '../harness.mjs';

const LAYOUT = JSON.parse(fs.readFileSync(path.join(ROOT, 'design/layout.json'), 'utf8'));
const STORY = JSON.parse(fs.readFileSync(path.join(ROOT, 'design/story.json'), 'utf8'));
const marker = (id) => LAYOUT.markers.find((m) => m.id === id);
const PIECE = 'i3-fixer';
const OUT = path.join(ROOT, 'shots', PIECE);
fs.mkdirSync(OUT, { recursive: true });

let server;
before(async () => { server = await startServer({}); });
after(async () => { await server.close(); });

const mark = async (game) => { const all = await game.events(0); return all.length ? all.at(-1).seq : 0; };
const finish = (game) => game.page.evaluate(() => { for (const a of document.getAnimations()) { try { a.finish(); } catch { /* an endless one */ } } });
const draw = (game) => game.page.evaluate(() => window.__dbg.ext.core.stepAsync(0, true));

test('the hearth note says the townsfolk are not suffering now (nobody reads them as dead)', async () => {
  const body = STORY.readables.rd_note_hearth.body;
  assert.ok(body.includes('They are not suffering now.'), 'the sentence as ruled');
  assert.ok(!/did not suffer/i.test(body), 'the old sentence is gone');
  const game = await openGame(server, { piece: PIECE, checkpoint: 'cp_tally_enter', viewport: { width: 1280, height: 720 } });
  try {
    await game.run([{ steps: 900 }]);
    const note = marker('rd_note_hearth');
    const seq = await mark(game);
    await game.run([{ call: ['teleport', note.pos[0] - 0.2, 0, note.pos[2] + 1.4, 0, 0] }, { steps: 1 }, { aimAt: note.pos, steps: 1 }, { tap: 'interact', steps: 2 }, { steps: 30 }]);
    const ev = await game.events(seq);
    assert.ok(ev.some((e) => e.name === 'readable/opened' && e.payload.key === 'rd_note_hearth'), 'the note opened');
    await draw(game); await finish(game);
    const shown = await game.page.evaluate(() => document.querySelector('#ui').innerText);
    assert.ok(shown.includes('They are not suffering now.'), `the sheet shows the sentence (${shown.slice(0, 300)})`);
    assert.ok(shown.includes('so that somebody had'), 'and the rest of the paragraph');
    assert.ok(!/did not suffer/i.test(shown));
    await game.page.screenshot({ path: path.join(OUT, 'i3_note_hearth.png') });
  } finally { await game.close(); }
});

test('bursting the yard knot puts the narrator\'s line top left, not an order', async () => {
  const text = STORY.objectives.obj_yard;
  assert.equal(text, 'The yard is not empty.');
  const game = await openGame(server, { piece: PIECE, checkpoint: 'cp_street_clear', viewport: { width: 1280, height: 720 } });
  try {
    await game.run([{ steps: 120 }]);
    const knot = marker('knot_yard_latch');
    const seq = await mark(game);
    await game.run([{ call: ['teleport', knot.pos[0] + 6, 0, knot.pos[2], 90, 0] }, { steps: 2 }, { aimAt: knot.pos, steps: 4 }, { tap: 'fire', steps: 4 }, { steps: 20 }]);
    const changed = (await game.events(seq, 'objective/changed')).map((e) => e.payload);
    assert.deepEqual(changed.map((p) => [p.key, p.text]), [['obj_yard', text]], 'the knot sets the yard\'s line, with the new words');
    assert.ok((await game.events(seq, 'encounter/started')).some((e) => e.payload.id === 'enc_yard'), 'and starts the yard fight');
    // the line is drawn (it waits for nothing here: no movement card is up)
    let hud = null;
    for (let i = 0; i < 20 && !(hud && hud.objective); i++) { await game.run([{ steps: 15 }]); hud = (await game.state()).systems.ui.hud; }
    assert.equal(hud.objective, text, 'the HUD shows it');
    await draw(game); await finish(game);
    const line = await game.page.evaluate(() => { const o = document.querySelector('.k7 .obj'); return { on: o.classList.contains('on'), text: o.querySelector('.obj-line').textContent }; });
    assert.deepEqual(line, { on: true, text }, 'top left, in the work-at-hand box');
    await game.page.screenshot({ path: path.join(OUT, 'i3_obj_yard.png') });
  } finally { await game.close(); }
});

test('no work-at-hand line gives a game\'s order, and no text calls the seated townsfolk dead', () => {
  const ORDER = /\b(clear|kill|defeat|eliminate|destroy|survive|collect|objective|enemies|enemy)\b/i;
  for (const [key, text] of Object.entries(STORY.objectives)) assert.ok(!ORDER.test(text), `${key}: "${text}" reads as a game instruction`);
  // the townsfolk bide: the one note that spoke of their suffering puts it in the present, and nothing says they died
  const all = [...Object.values(STORY.lines).map((l) => l.text), ...Object.values(STORY.readables).map((r) => r.body)];
  for (const t of all) assert.ok(!/\b(did not suffer|suffered|corpses?|bodies|dead (men|man|folk|ones|people|townsfolk))\b|\bthe dead[.,;]/i.test(t), `"${t.slice(0, 80)}" speaks of the townsfolk as dead`);
});
