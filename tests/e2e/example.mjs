// The example of docs/INTEGRATION_REPORT.md: drive the REAL game (all six systems, final assets) from a critic's script.
//   node tests/e2e/example.mjs            -> shots/critic-example/*.png
import { startServer } from '../harness.mjs';
import { openBot } from './lib/bot.mjs';

const server = await startServer({});
const bot = await openBot(server, { piece: 'critic-example', tier: 'low' });     // the title screen, nothing stubbed
try {
  await bot.game.shot('title');                                                   // shots/critic-example/title.png (HUD included)
  await bot.startFromTitle();                                                     // clicks "Begin" in the title menu
  const lip = await bot.play({ until: 'cp_lip_gate', shots: ['puzzle:seven_jugs', 'seven_jugs:open'] });   // plays by input; a frame at two beats
  console.log('reached', lip.checkpoint, 'at tick', lip.tick, 'frames', lip.frames.length, 'notes', lip.report.notes);

  await bot.jump('cp_gallery_bay');                                               // a DEBUG jump (never used by the playthrough test)
  const state = await bot.eval(async (b, dbg) => {                                // page-side: the bot's own senses and hands
    await b.helpers.use('ia_line_locker_bay');                                    // walk to the locker, look at it, press E
    const m = b.marker('pz_proving_mark');
    await b.walkTo(m.pos[0], m.pos[2], { stopRadius: 0.25 });                     // onto the brass step, by input
    dbg.tap('line');                                                              // Q: the line round under the hammer
    await b.until(() => b.weapon().cylinder[0] === 'line', 120);
    dbg.aimAtEntity('knot_a');                                                    // look at the first knot through the loop
    await b.step(2);
    dbg.step(0, true);                                                            // draw a frame
    return { puzzle: b.puzzle('proving_line').solved, weapon: dbg.player().cylinder, perf: dbg.perf().drawCalls };
  });
  console.log(state);
  await bot.game.shot('proving_line_aimed');
  const rest = await bot.play({ until: 'cp_file_clear', shots: 'fight:|file:', shotPrefix: 'file_' });   // every beat matching the pattern
  console.log('reached', rest.checkpoint, 'deaths', (await bot.state()).stats.deaths, 'hash', await bot.hash());
} finally { await bot.close(); await server.close(); }
