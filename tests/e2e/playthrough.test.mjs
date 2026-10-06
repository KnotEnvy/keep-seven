// THE PLAYTHROUGH (integration, polish round 2): the real game (all six systems, no core stub, final assets) played
// from the title screen to the end card BY INPUT on Normal: walk, look, shoot, reload, interact. The bot (tests/e2e/lib/)
// solves the four puzzles by their real solutions, fights the six encounters, rides both lifts and finishes the
// Windlass with the kept round. It never teleports, never forces a puzzle or an encounter, never sets ammunition or
// health; god mode would be written to report.god (and fails the first test: today the bot needs none).
//
//   node --test tests/e2e/                      (about a minute)
//   KEEP7_E2E_SHOTS=1 node --test tests/e2e/    also writes a frame at every beat to shots/integrate-code/play_*.png
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, startServer } from '../harness.mjs';
import { CHECKPOINTS, LAYOUT, STORY, openBot } from './lib/bot.mjs';

const PIECE = 'integrate-code';
let server;
before(async () => { server = await startServer({}); });
after(async () => { await server.close(); });

const names = (journal, name) => journal.filter((e) => e.name === name);
let reference = null;

async function fullRun(options = {}) {
  const bot = await openBot(server, { piece: PIECE, tier: 'low' });
  try {
    const title = await bot.state();
    assert.equal(title.game, 'title', 'the page opens on the title screen');
    assert.equal(title.ui.screen, 'title');
    assert.deepEqual(await bot.page.evaluate(() => window.__dbg.ext.core.stubs()), [], 'no slot holds a core stub');
    const assets = await bot.page.evaluate(() => window.__dbg.ext.assets.report());
    assert.equal(assets.assetsSynthesised + assets.texturesSynthesised, 0, 'every asset comes from its file');
    await bot.startFromTitle();
    assert.equal(await bot.page.evaluate(() => window.__dbg.ext.core.ctx().options.value.difficulty), 'normal');
    const run = await bot.play(options);
    const state = await bot.state();
    const hash = await bot.hash();
    return { run, state, hash };
  } finally { await bot.close(); }                             // throws on any console.error or __dbg.error of the run
}

test('the bot plays the stage from the title to the end card by input: four puzzles, six encounters, two rides, the kept round', async () => {
  const { run, state, hash } = await fullRun({ shots: process.env.KEEP7_E2E_SHOTS ? 'all' : undefined, shotPrefix: 'play_' });
  const { report, journal } = run;
  const where = `stopped at ${run.checkpoint} in '${run.state}', tick ${run.tick}\n${report.notes.join('\n')}`;
  assert.equal(run.state, 'ending', where);
  assert.equal(state.ui.screen, 'end', 'the end card is on screen');
  // ---- nothing was skipped and nothing was cheated
  assert.deepEqual(report.god, [], 'no god mode');
  assert.deepEqual(report.stuck, [], 'never stuck');
  assert.equal(state.stats.deaths, 0, `she did not die\n${report.notes.join('\n')}`);
  assert.equal(names(journal, 'player/spawned').length, 1, 'placed once, at the start: no teleport, no warp');
  assert.equal(names(journal, 'game/new_run').length, 1);
  assert.deepEqual(names(journal, 'checkpoint/saved').map((e) => e.payload.id), CHECKPOINTS, 'every checkpoint, once, in order');
  // ---- the four puzzles, each by its own steps
  assert.deepEqual(names(journal, 'puzzle/solved').map((e) => e.payload.puzzle), ['seven_jugs', 'daylight', 'proving_line', 'the_asking']);
  const steps = (id) => names(journal, 'puzzle/progress').filter((e) => e.payload.puzzle === id).length;
  assert.equal(steps('seven_jugs'), 7, 'seven jugs, seven rounds');
  assert.ok(steps('daylight') >= 2, 'the north latch and the cord (and the two story shutters)');
  assert.ok(steps('the_asking') >= 2, 'two ports answered; the third by holding fire');
  assert.equal(names(journal, 'puzzle/hint').filter((e) => e.payload.tier >= 4).length, 0, 'no puzzle relaxed itself (hint tier 4)');
  // one line round from the brass step: the three knots burst as one line (the world's assist bursts b and c: GDD 13.3)
  const knots = names(journal, 'puzzle/progress').filter((e) => e.payload.puzzle === 'proving_line');
  assert.deepEqual(knots.map((e) => e.payload.detail), ['knot_a', 'knot_b', 'knot_c']);
  assert.ok(knots[2].tick - knots[0].tick <= 30, 'within half a second of each other');
  const lineShots = names(journal, 'combat/line_resolved');
  assert.ok(lineShots.length >= 2 && lineShots.length <= 4, `line rounds fired: ${lineShots.length} (the proving line, the file, the Tamper)`);
  assert.ok(lineShots.some((e) => e.payload.freed >= 3), 'a line round down the file freed three or more');
  // ---- the six encounters, fought
  const cleared = names(journal, 'encounter/cleared').map((e) => e.payload.id);
  assert.deepEqual(cleared, ['enc_street', 'enc_yard', 'enc_tally', 'enc_file', 'enc_matador', 'enc_windlass']);
  const expected = LAYOUT.encounters.reduce((n, e) => n + (e.composition.bider ?? 0), 0);
  assert.ok(state.stats.freed + state.stats.felled >= 22, `Biders freed ${state.stats.freed} + felled ${state.stats.felled} (the layout's encounters hold ${expected})`);
  // ---- both rides, the boss by its phases, the kept round
  assert.deepEqual(names(journal, 'ride/state').filter((e) => e.payload.stage === 'ended').map((e) => e.payload.id), ['ride_lift_hall', 'ride_proving_lift']);
  const phases = names(journal, 'boss/phase').map((e) => e.payload.phase);
  for (const p of ['parley', 'p1', 'p2', 'p3a', 'hush', 'proven', 'p3b', 'dead']) assert.ok(phases.includes(p), `boss phase ${p} (${phases.join(' ')})`);
  assert.ok(names(journal, 'boss/parley').some((e) => e.payload.stage === 'kept'), 'she heard the parley out');
  assert.deepEqual(names(journal, 'weapon/kept').map((e) => e.payload.stage).filter((s) => s !== 'denied'), ['loading', 'chambered', 'fired'], 'the kept round: loaded on a mark, fired down the bore');
  assert.equal(names(journal, 'boss/defeated').length, 1);
  // ---- the story on the way, and the ending
  const cards = names(journal, 'story/card').map((e) => e.payload.key);
  for (const c of ['card_title', 'card_i', 'card_ii', 'card_iii', 'card_iv', 'card_v', 'card_vi', 'card_vii', 'card_end']) assert.ok(cards.includes(c), `${c} (${cards.join(' ')})`);
  assert.deepEqual(names(journal, 'objective/changed').map((e) => e.payload.key), Object.keys(STORY.objectives), 'every objective, once, in order');
  assert.deepEqual(names(journal, 'readable/opened').map((e) => e.payload.key), ['rd_note_lip', 'rd_ledger', 'rd_plate_proving', 'rd_note_cradle', 'rd_note_stone'], 'the notes she read on the way');
  const card = names(journal, 'ending/card')[0];
  assert.ok(card, 'ending/card');
  assert.equal(card.payload.stats.tookStoneRound, true);
  assert.equal(names(journal, 'ending/lamps')[0].payload.count, Math.min(48, 9 + state.stats.freed), 'the lamps of Plenty: nine and the freed');
  assert.ok(state.stats.roundsHit / state.stats.roundsFired > 0.9);
  // polish round 4: the card read 186 knots for 78 rounds (the Windlass's pips were counted again at every phase change).
  // A lead round bursts one knot; a line round can free a whole file; the world's assist bursts two knots of the proving line.
  assert.ok(state.stats.knotsBurst >= state.stats.freed + 26 && state.stats.knotsBurst <= state.stats.roundsFired + 12, `knots burst ${state.stats.knotsBurst} for ${state.stats.roundsFired} rounds, ${state.stats.freed} freed`);
  // GDD 4.2: a skilled run is about 15 minutes; the bot neither reads slowly nor looks about
  const minutes = state.stats.playSeconds / 60;
  assert.ok(minutes > 5 && minutes < 25, `play time ${minutes.toFixed(1)} min`);
  reference = { hash, tick: run.tick, stats: state.stats };
  const out = {
    hash, ticks: run.tick, playSeconds: state.stats.playSeconds, stats: state.stats, sections: report.sections, shots: report.shots,
    beats: run.beats, notes: report.notes, god: report.god, stuck: report.stuck,
  };
  fs.mkdirSync(path.join(ROOT, 'shots', PIECE), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'shots', PIECE, 'playthrough.json'), JSON.stringify(out, null, 1));
  console.log(`playthrough: title to end card in ${run.tick} ticks (${minutes.toFixed(1)} min of play), ${state.stats.roundsFired} rounds, ${state.stats.freed} freed, ${state.stats.deaths} deaths, hash ${hash}`);
  for (const s of report.sections) console.log(`  ${s.from.padEnd(18)} -> ${s.to.padEnd(18)} ${String(s.seconds).padStart(6)} s  ${s.ammo}  ${s.health} HP${s.deaths ? '  deaths ' + s.deaths : ''}`);
});

test('deterministic: the same script on a second page load ends on the same tick with the same hash', async () => {
  assert.ok(reference, 'the first run finished');
  const { run, state, hash } = await fullRun();
  assert.equal(run.state, 'ending');
  assert.equal(run.tick, reference.tick);
  assert.deepEqual(state.stats, reference.stats);
  assert.equal(hash, reference.hash);
});

test('the other ending: she reads the stone, leaves the round on it and walks on to the north edge', async () => {
  // polish round 4 (playthrough): since R5 the leave branch needs her away from the stone; the bot stood at it for ever
  const bot = await openBot(server, { piece: PIECE, tier: 'low', checkpoint: 'cp_rim' });
  try {
    const run = await bot.play({ leaveTheRound: true });
    const state = await bot.state();
    assert.equal(run.state, 'ending', `stopped at ${run.checkpoint} in '${run.state}'\n${run.report.notes.join('\n')}`);
    assert.equal(state.ui.screen, 'end');
    assert.equal(state.stats.tookStoneRound, false);
    const stone = names(run.journal, 'ending/stone');
    assert.deepEqual(stone.map((e) => e.payload.taken), [false]);
  } finally { await bot.close(); }
});

test('a death at every checkpoint: the restore gives back what the checkpoint held, and the run still reaches the end card', async () => {
  const { run, state } = await fullRun({ dieAtEveryCheckpoint: true });
  const { report } = run;
  assert.equal(run.state, 'ending', `stopped at ${run.checkpoint} in '${run.state}'\n${report.notes.join('\n')}`);
  assert.deepEqual(report.restores.map((r) => r.checkpoint), CHECKPOINTS, 'killed once at every checkpoint');
  for (const r of report.restores) {
    assert.ok(r.ok, `${r.checkpoint}: ${r.problems.join('; ')}`);
    assert.ok(r.respawnTicks > 0 && r.respawnTicks <= 180, `${r.checkpoint}: death to control in ${r.respawnTicks} ticks (GDD: within 3 s)`);
  }
  assert.equal(state.stats.deaths, CHECKPOINTS.length, 'no death but the seventeen asked for');
  assert.deepEqual(report.god, [], 'no god mode');
  assert.deepEqual(report.stuck, [], 'never stuck');
  assert.equal(state.stats.tookStoneRound, true);
  fs.writeFileSync(path.join(ROOT, 'shots', PIECE, 'restores.json'), JSON.stringify(report.restores, null, 1));
  console.log(`restores: ${report.restores.length} of ${CHECKPOINTS.length} checkpoints, each back in control ${Math.max(...report.restores.map((r) => r.respawnTicks))} ticks after the death at most`);
});
