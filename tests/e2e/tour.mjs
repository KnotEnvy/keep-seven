// A tour of the REAL game: the bot plays the stage by input and a page screenshot (canvas + HUD) is taken at every beat
// (the title, each story beat, each puzzle, each encounter mid-fight, the boss phases, the ending).
//   node tests/e2e/tour.mjs [low|high|min ...] [--piece <name>] [--until <checkpoint>] [--range <metres>]
// Frames: shots/<piece>/<tier>_<nn>_<beat>.png and <tier>_tour.json (beats, sections, console errors).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, startServer } from '../harness.mjs';
import { openBot } from './lib/bot.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf('--' + name); return i >= 0 ? args.splice(i, 2)[1] : fallback; };
const piece = opt('piece', 'integrate-code');
const until = opt('until', 'ending');
const range = Number(opt('range', '18'));
const tiers = args.length ? args : ['low', 'high'];

const server = await startServer({});
try {
  for (const tier of tiers) {
    const bot = await openBot(server, { piece, tier, allowErrors: true });
    const warnings = [];
    bot.page.on('console', (m) => { if (m.type() === 'warning' && !m.text().includes('KHR_parallel')) warnings.push(m.text().slice(0, 300)); });
    try {
      await bot.page.evaluate(() => { for (let i = 0; i < 3; i++) window.__dbg.step(0, true); });
      await bot.game.shot(`${tier}_00_title`);
      await bot.startFromTitle();
      // closer fights than the test's: the tour is for looking at
      await bot.page.evaluate((r) => { window.__bot.range = r; }, range);
      const run = await bot.play({ until, shots: 'all', shotPrefix: `${tier}_`, frameEvery: 20, settleMs: 400 });
      const state = await bot.state();
      const perf = await bot.game.dbg('perfPeak');
      // the end card lights its rows with CSS animations, which run on the wall clock, not on stepped ticks: wait them out
      if (run.state === 'ending') { await bot.page.waitForTimeout(7000); run.frames.push(await bot.game.shot(`${tier}_${String(run.frames.length + 1).padStart(2, '0')}_end_card_lit`)); }
      const out = { tier, state: run.state, checkpoint: run.checkpoint, ticks: run.tick, stats: state.stats, sections: run.report.sections, notes: run.report.notes, god: run.report.god, stuck: run.report.stuck,
        consoleErrors: bot.game.consoleErrors, warnings: warnings.slice(0, 40), hookError: await bot.page.evaluate(() => window.__dbg.error), frames: run.frames.map((f) => path.basename(f)), perfPeak: perf };
      fs.writeFileSync(path.join(ROOT, 'shots', piece, `${tier}_tour.json`), JSON.stringify(out, null, 1));
      console.log(`${tier}: ${run.state} at tick ${run.tick}, ${run.frames.length} frames, deaths ${state.stats.deaths}, god ${run.report.god.length}, console errors ${bot.game.consoleErrors.length}, warnings ${warnings.length}`);
      for (const e of bot.game.consoleErrors.slice(0, 8)) console.log('  ERROR ' + e.slice(0, 400));
      for (const n of run.report.notes) console.log('  ' + n);
    } finally { try { await bot.game.browser.close(); } catch { /* closed */ } }
  }
} finally { await server.close(); }
