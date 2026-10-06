// The playthrough driver (Node side). It opens the REAL game (all six systems, no core stub), injects the page-side bot
// (page-bot.js: senses and hands; page-play.js: the stage, one function per checkpoint) and exposes it to a test or a
// critic's script. See docs/INTEGRATION_REPORT.md, "Driving the real game".
//
//   import { startServer } from '../../harness.mjs';
//   import { openBot } from './lib/bot.mjs';
//   const server = await startServer({});
//   const bot = await openBot(server, { piece: 'my-critic', tier: 'low' });     // the title screen
//   await bot.startFromTitle();                                                   // clicks "play" in the title menu
//   const run = await bot.play({ until: 'cp_gallery_bay' });                      // plays by input up to a checkpoint
//   await bot.game.shot('gallery');                                               // shots/my-critic/gallery.png
//   await bot.close(); await server.close();
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUDIO_DEVICE_ERROR, ROOT, openGame } from '../../harness.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const LAYOUT = JSON.parse(fs.readFileSync(path.join(ROOT, 'design/layout.json'), 'utf8'));
export const STORY = JSON.parse(fs.readFileSync(path.join(ROOT, 'design/story.json'), 'utf8'));
export const CHECKPOINTS = LAYOUT.markers.filter((m) => m.type === 'checkpoint').map((m) => m.id);
export const marker = (id) => LAYOUT.markers.find((m) => m.id === id);

export class Bot {
  constructor(game) {
    /** the harness Game: game.page, game.dbg(), game.state(), game.shot(name), game.events() ... */
    this.game = game;
    this.page = game.page;
    this.frames = [];
  }
  /** run `fn(bot, dbg, arg)` inside the page (it is serialised: no closures); await its result */
  eval(fn, arg) { return this.page.evaluate(`(${fn.toString()})(window.__bot, window.__dbg, ${JSON.stringify(arg ?? null)})`); }
  /** call a method of window.__bot by name */
  call(name, ...args) { return this.page.evaluate(([n, a]) => window.__bot[n](...a), [name, args]); }
  /** The title menu's "play" item, clicked in the DOM as a player clicks it; resolves when she has control. */
  async startFromTitle() {
    const state = await this.page.evaluate(() => window.__dbg.state().game);
    if (state !== 'title') throw new Error(`startFromTitle: the game is in '${state}', not on the title`);
    await this.page.click('[data-item="play"]');
    await this.page.evaluate(async () => {
      const core = window.__dbg.ext.core;
      for (let i = 0; i < 400 && window.__dbg.state().game !== 'playing'; i++) { await core.idle(); await new Promise((r) => setTimeout(r, 10)); }
      await core.idle();
    });
    const after = await this.page.evaluate(() => window.__dbg.state().game);
    if (after !== 'playing') throw new Error(`startFromTitle: after the click the game is in '${after}'`);
  }
  /** A debug jump to a checkpoint (a critic's shortcut; the playthrough test never uses it). */
  async jump(checkpoint) { await this.game.dbg('checkpoint', checkpoint); await this.game.step(2); }
  /**
   * Play by input from where the run stands. options: { until: checkpoint id | 'ending', dieAtEveryCheckpoint,
   * godAfterDeaths, god: [checkpoint ids], skipReadables, frameEvery, shots: 'all' | [beat names] | RegExp source,
   * settleMs: real milliseconds to wait before each frame (the HUD's CSS fades run on the wall clock) }.
   * With `shots`, a page screenshot is written to shots/<piece>/<prefix><nn>_<beat>.png at each named beat.
   * -> { state, checkpoint, tick, report, beats, journal, frames }: `journal` is the run's landmark events (checkpoints,
   * puzzles, encounters, rides, boss phases, cards, objectives, deaths) in order, each { name, tick, payload }
   */
  async play(options = {}) {
    const { shots, shotPrefix = '', settleMs = 0, ...rest } = options;
    this.settleMs = settleMs;
    if (shots) {
      const want = shots === 'all' ? () => true : Array.isArray(shots) ? (n) => shots.includes(n) : (n) => new RegExp(shots).test(n);
      let n = this.frames.length;
      if (!this.exposed) {
        this.exposed = true;
        await this.page.exposeFunction('__botBeat', async (name) => {
          if (!this.want || !this.want(name)) return;
          // the HUD's fades and prompts are CSS transitions on the wall clock; stepped ticks do not move them. With
          // `settleMs` the page is given that long (and one more drawn frame) before the frame is taken.
          if (this.settleMs > 0) { await this.page.waitForTimeout(this.settleMs); await this.page.evaluate(() => { window.__dbg.step(0, true); }); }
          const file = `${this.prefix}${String(++this.count).padStart(2, '0')}_${name.replace(/[^a-z0-9_]+/gi, '_')}`;
          this.frames.push(await this.game.shot(file));
        });
      }
      this.want = want; this.prefix = shotPrefix; this.count = n;
      await this.page.evaluate(() => { window.__bot.onBeat = async (name) => { window.__dbg.step(0, true); await window.__botBeat(name); }; });
    } else await this.page.evaluate(() => { window.__bot.onBeat = null; });
    const out = await this.page.evaluate(async (opts) => {
      const bot = window.__bot;
      if (opts.skipReadables !== undefined) bot.skipReadables = opts.skipReadables;
      if (opts.frameEvery !== undefined) bot.frameEvery = opts.frameEvery;
      if (opts.leaveTheRound !== undefined) bot.leaveTheRound = opts.leaveTheRound;
      const r = await bot.play(opts);
      bot.seqNow();
      return { state: r.state, checkpoint: r.checkpoint, tick: r.tick, report: bot.report, beats: bot.beats, journal: bot.journal };
    }, rest);
    return { ...out, frames: this.frames.slice() };
  }
  state() { return this.game.state(); }
  hash() { return this.game.dbg('hash'); }
  report() { return this.page.evaluate(() => window.__bot.report); }
  close() { return this.game.close(); }
}

/**
 * Opens the real game on its title screen (or, with `checkpoint`, already in a run at that checkpoint: a debug jump)
 * and loads the bot into the page. options are openGame's (piece is required; tier, seed, viewport, query), plus
 * `checkpoint`. No slot holds a core stub.
 */
export async function openBot(server, options = {}) {
  const { checkpoint = null, ...rest } = options;
  const game = await openGame(server, { stubs: null, start: checkpoint !== null, checkpoint, ignoreConsole: AUDIO_DEVICE_ERROR, ...rest });
  await game.page.addScriptTag({ path: path.join(HERE, 'page-bot.js') });
  await game.page.addScriptTag({ path: path.join(HERE, 'page-play.js') });
  const stubs = await game.page.evaluate(() => window.__dbg.ext.core.stubs());
  if (stubs.length) { await game.close(); throw new Error(`openBot: core stubs in ${stubs.join(', ')}: this is not the real game`); }
  return new Bot(game);
}
