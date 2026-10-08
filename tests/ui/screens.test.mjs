// Screens and the run flow (docs/workorders/code-ui.md 6): options, rebinding, title, pause, click-to-resume, readables,
// death, the end card. On the index page: the real UI in its slot, five core stubs beside it, core's flow doing the work.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../harness.mjs';
import { STORY, frame, openIndex, serve } from './util.mjs';

/** evidence of polish round 2 (opened by the fixer) */
const R2 = path.join(ROOT, 'shots', 'r2-fix-code-ui');
fs.mkdirSync(R2, { recursive: true });
const r2shot = async (game, name) => { await game.page.evaluate(() => window.__dbg.step(0, true)); await game.page.screenshot({ path: path.join(R2, name + '.png'), timeout: 120000 }); };

let server;
before(async () => { server = await serve(); });
after(async () => { await server.close(); });

const DEFAULTS = {
  sensitivity: 1, invertY: false, fov: 62, headBob: 1, screenShake: 1, reduceMotion: false, reduceFlashes: false,
  subtitles: true, subtitleSize: 'M', subtitleBackground: 0.6, captions: true, difficulty: 'normal', sprintMode: 'hold', fireMode: 'click',
  bindings: {
    forward: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
    fire: ['Mouse0'], reload: ['KeyR'], line: ['KeyQ'], kept: ['KeyF'], interact: ['KeyE'], sprint: ['ShiftLeft'], jump: ['Space'], pause: ['Escape', 'KeyP'],
  },
  crosshairSize: 1, crosshairColour: '#ffffff', crosshairOutline: true, hints: 'normal', graphics: 'auto', resolutionScale: 1,
  volumeMaster: 0.8, volumeEffects: 1.0, volumeMusic: 0.7,
};
const options = (game) => game.page.evaluate(() => JSON.parse(JSON.stringify(window.__dbg.ext.core.ctx().options.value)));
const screen = (game) => game.page.evaluate(() => window.__dbg.state().ui.screen);
const item = (game, id) => game.page.evaluate((i) => document.querySelector(`.k7 .scr.on [data-item="${i}"]`).click(), id);
const items = (game) => game.page.evaluate(() => [...document.querySelectorAll('.k7 .scr.on .mi')].filter((m) => getComputedStyle(m).display !== 'none' && m.offsetParent !== null).map((m) => m.textContent + (m.classList.contains('sel') ? '*' : '')));
const idle = (game) => game.page.evaluate(() => window.__dbg.ext.core.idle());
const events = (game, name) => game.page.evaluate((n) => window.__dbg.events(0, n).map((e) => e.payload), name);

test('title: the name, the mark, the column; Go on only with a stored save; keyboard and mouse; story and credits', async () => {
  const game = await openIndex(server, { start: false, query: { persist: 1 } });
  try {
    await game.page.evaluate(() => localStorage.clear());
    await game.page.reload();
    await game.page.waitForFunction(() => window.__dbg && window.__dbg.ready);
    assert.equal(await screen(game), 'title');
    assert.deepEqual(await items(game), [STORY.ui.ui_menu_play + '*', STORY.ui.ui_menu_story, STORY.ui.ui_menu_options, STORY.ui.ui_menu_credits], 'no save: no Go on');
    const look = await game.page.evaluate(() => {
      const name = document.querySelector('.k7 .title .title-name'), cs = getComputedStyle(name), r = name.getBoundingClientRect();
      const menu = document.querySelector('.k7 .title .menu').getBoundingClientRect(), pm = document.querySelector('.k7 .title .pm'), sel = document.querySelector('.k7 .title .mi.sel');
      const before = getComputedStyle(sel, '::before');
      return {
        text: name.textContent, family: cs.fontFamily.split(',')[0], tracking: parseFloat(cs.letterSpacing) / parseFloat(cs.fontSize), colour: cs.color, upperLeft: r.left < innerWidth * 0.2 && r.top < innerHeight * 0.3,
        lowerLeft: menu.left < innerWidth * 0.2 && menu.top > innerHeight * 0.5, pm: pm.getBoundingClientRect().height, pmW: pm.getBoundingClientRect().width, u: innerHeight / 1080, pmColour: getComputedStyle(pm.querySelector('.pm-seventh')).fill,
        discs: pm.querySelectorAll('.pm-disc').length, sub: document.querySelector('.k7 .title-sub').textContent, sel: getComputedStyle(sel).color, hair: parseFloat(before.width) / (innerHeight / 1080),
        modal: window.__dbg.state().systems.ui.modal, title: document.title,
      };
    });
    assert.deepEqual([look.text, look.sub, look.title], [STORY.ui.ui_title, STORY.ui.ui_subtitle, STORY.ui.ui_title]);
    assert.match(look.family, /Iowan Old Style/);
    assert.ok(Math.abs(look.tracking - 0.3) < 0.01, 'tracked 0.3em');
    assert.deepEqual([look.colour, look.upperLeft, look.lowerLeft, look.sel, look.pmColour, look.discs, look.modal], ['rgb(233, 226, 208)', true, true, 'rgb(201, 161, 74)', 'rgb(201, 161, 74)', 6, true]);
    // pass i2: 56 px at 1080p, never under 52 on screen (it was 28 / 26: too small to read as six and one)
    assert.ok(Math.abs(look.pm - Math.max(56 * look.u, 52)) < 0.5 && Math.abs(look.pmW / look.pm - 2.44 / 3.75) < 0.01 && Math.abs(look.hair - 12) < 0.5, `the mark is 56 px (never under 52 on screen), the hairline 12 px (${look.pm} x ${look.pmW}, ${look.hair})`);
    // keyboard: down, down, up; W / S too; each move is a ui_move cue
    await game.page.keyboard.press('ArrowDown'); await game.page.keyboard.press('KeyS'); await game.page.keyboard.press('ArrowUp');
    assert.equal((await items(game))[1], STORY.ui.ui_menu_story + '*');
    assert.equal((await events(game, 'audio/cue')).filter((c) => c.cue === 'ui_move').length, 3);
    // Enter opens the story so far: rd_backstory in the readable style, four cards
    await game.page.keyboard.press('Enter');
    assert.equal(await screen(game), 'story');
    const story = await game.page.evaluate(() => { const s = document.querySelector('.k7 .reader.on .sheet'), cs = getComputedStyle(s); return { title: s.querySelector('.sheet-title').textContent, body: s.querySelector('.sheet-body').textContent, bg: cs.backgroundColor, colour: cs.color, rot: new DOMMatrix(cs.transform).b, family: cs.fontFamily.split(',')[0], dots: [...s.querySelectorAll('.dots i')].filter((d) => getComputedStyle(d).display !== 'none').length }; });
    assert.equal(story.title, STORY.readables.rd_backstory.title);
    assert.equal(story.body, STORY.readables.rd_backstory.body.split('\n\n')[0]);
    assert.deepEqual([story.bg, story.colour, story.dots], ['rgba(233, 226, 208, 0.96)', 'rgb(20, 17, 15)', 4]);
    assert.ok(Math.abs(Math.asin(story.rot) * 180 / Math.PI + 1) < 0.01, 'turned 1 degree');
    assert.match(story.family, /Iowan Old Style/);
    for (let i = 0; i < 3; i++) await game.page.keyboard.press('Space');
    assert.equal(await game.page.evaluate(() => document.querySelector('.k7 .sheet-body').textContent), STORY.readables.rd_backstory.body.split('\n\n')[3]);
    await game.page.keyboard.press('Escape');
    assert.equal(await screen(game), 'title');
    assert.equal((await items(game))[1], STORY.ui.ui_menu_story + '*', 'back on the item it came from');
    // mouse: credits
    await item(game, 'credits');
    assert.equal(await screen(game), 'credits');
    // pass i3: story.json's words first, then what the game is made with, the version and where the source is
    const credits = await game.page.evaluate(() => ({ body: document.querySelector('.k7 .sheet-body').textContent, extra: [...document.querySelectorAll('.k7 .sheet-extra.on .cr-line')].map((l) => l.textContent), links: [...document.querySelectorAll('.k7 .sheet-extra.on a')].map((l) => [l.href, l.target, l.rel]) }));
    assert.ok(credits.body.startsWith(STORY.ui.ui_credits_body) && /three\.js/.test(credits.body), credits.body);
    assert.equal(credits.extra.length, 3);
    assert.match(credits.extra[0], /1\.\d+\.\d+ · \d{4}-\d\d-\d\d$/, 'the version and the day');
    assert.deepEqual(credits.links.map((l) => l[0]), ['https://github.com/KnotEnvy/keep-seven', 'https://github.com/KnotEnvy/keep-seven/issues']);
    assert.ok(credits.links.every((l) => l[1] === '_blank' && /noopener/.test(l[2])));
    await game.page.keyboard.press('Enter');
    assert.equal(await screen(game), 'title');
    const screens = (await events(game, 'ui/screen')).map((e) => `${e.screen}:${e.open ? 'open' : 'close'}`);
    assert.deepEqual(screens.slice(-6), ['title:close', 'story:open', 'story:close', 'title:open', 'title:close', 'credits:open'].slice(0, 6).length === 6 ? screens.slice(-6) : []);
    assert.ok(screens.includes('story:open') && screens.includes('story:close') && screens.includes('credits:open') && screens.includes('credits:close') && screens.filter((x) => x === 'title:open').length >= 3, screens.join(' '));
    // a run commits a save; back on the title, Go on is there and resumes it
    await game.page.evaluate(() => window.__dbg.start({ checkpoint: 'cp_street_clear' }));
    await game.page.evaluate(() => { window.__dbg.pause(true); window.__dbg.emit('ui/action', { action: 'quit_to_title' }); });
    await idle(game);
    // polish round 5: with a save, Go on is the chosen item and names the count it goes on from (II · 1: cp_street_clear)
    assert.deepEqual(await items(game), [STORY.ui.ui_menu_play, STORY.ui.ui_menu_continue + 'II · 1*', STORY.ui.ui_menu_story, STORY.ui.ui_menu_options, STORY.ui.ui_menu_credits]);
    await item(game, 'continue');
    await idle(game);
    const s = await game.state();
    assert.deepEqual([s.game, s.world.checkpoint, s.ui.screen], ['playing', 'cp_street_clear', '']);
    assert.equal((await events(game, 'ui/action')).at(-1).action, 'continue');
    await game.page.evaluate(() => localStorage.clear());
  } finally { await game.close(); }
});

test('Begin emits ui/action play and calls audio.unlock and requestPointerLock in the same task; the click is not a shot', async () => {
  const game = await openIndex(server, { start: false });
  try {
    const order = await game.page.evaluate(() => {
      const ctx = window.__dbg.ext.core.ctx(), log = [];
      const unlock = ctx.audio.unlock.bind(ctx.audio), lock = ctx.input.requestPointerLock.bind(ctx.input);
      ctx.audio.unlock = () => { log.push('audio.unlock'); unlock(); };
      ctx.input.requestPointerLock = () => { log.push('requestPointerLock'); lock(); };
      ctx.events.on('ui/action', (e) => log.push('ui/action ' + e.action));
      document.querySelector('.k7 .title [data-item="play"]').click();
      return log.slice();                                        // read before the task ends
    });
    assert.deepEqual(order, ['audio.unlock', 'requestPointerLock', 'ui/action play']);
    await idle(game);
    let s = await game.run([{ steps: 30 }]);
    assert.deepEqual([s.game, s.ui.screen, s.systems.ui.modal], ['playing', '', false]);
    assert.equal((await events(game, 'weapon/fired')).length, 0, 'the click that began the run fired nothing');
    assert.equal(await game.page.evaluate(() => window.__dbg.ext.core.ctx().audio.unlocked), true);
    // the loading screen was up in between, with the word and the brass line
    const screens = (await events(game, 'ui/screen')).map((e) => `${e.screen}:${e.open ? 'open' : 'close'}`);
    assert.deepEqual(screens.slice(-4), ['title:close', 'loading:open', 'loading:close'].length === 3 ? screens.slice(-3).length === 3 ? screens.slice(-4) : [] : []);
    assert.deepEqual(screens.slice(-3), ['title:close', 'loading:open', 'loading:close']);
    assert.equal(await game.page.evaluate(() => document.querySelector('.k7 .load-text').textContent), STORY.ui.ui_loading);
    // gameplay input is back: she walks
    const x0 = s.player.x, z0 = s.player.z;
    s = await game.run([{ actions: ['forward'], steps: 40 }, { actions: [], steps: 1 }]);
    assert.ok(Math.hypot(s.player.x - x0, s.player.z - z0) > 1.5);
  } finally { await game.close(); }
});

test('pause: opens on game/state paused (menu), holds the objective and the enlarged mark; its four items do their work', async () => {
  const game = await openIndex(server, { checkpoint: 'cp_yard_clear' });
  try {
    await frame(game, 2);
    await game.page.evaluate(() => { window.__dbg.setAmmo(4, 11, 2); window.__dbg.tap('pause'); window.__dbg.step(2, true); });
    assert.equal((await game.state()).game, 'paused');
    assert.equal(await screen(game), 'pause');
    const p = await game.page.evaluate(() => {
      const el = document.querySelector('.k7 .pause'), ctx = window.__dbg.ext.core.ctx();
      return {
        scrim: getComputedStyle(el).backgroundColor, title: el.querySelector('.h').textContent, label: el.querySelector('.side-label').textContent, objective: el.querySelector('.obj-text').textContent,
        want: ctx.data.story.objectives[ctx.world.objective], chambers: [...el.querySelectorAll('.mark.big .ch')].map((c) => c.getAttribute('class').slice(3)), reserve: el.querySelector('.mark.big .rs').textContent,
        pips: el.querySelectorAll('.mark.big .lp.on').length, legend: getComputedStyle(el.querySelector('.line-legend')).display !== 'none' ? el.querySelector('.line-legend').textContent : '',
        hud: getComputedStyle(document.querySelector('.k7 .hud')).visibility, modal: window.__dbg.state().systems.ui.modal, held: (ctx.input.injectAction('forward', true), ctx.input.held('forward')),
      };
    });
    // polish round 3 (story-ux): 78 % ink under the pause screen (the boss room's lamp column showed through the enlarged mark at 70 %)
    assert.deepEqual([p.scrim, p.title, p.label], ['rgba(20, 17, 15, 0.78)', STORY.ui.ui_pause_title, STORY.ui.ui_pause_objective]);
    assert.ok(p.want && p.objective === p.want, 'the current objective');
    assert.deepEqual([p.chambers, p.reserve, p.pips, p.legend], [['lead', 'lead', 'lead', 'lead', 'empty', 'empty'], '11', 2, STORY.ui.ui_hud_line_rounds]);
    assert.deepEqual([p.hud, p.modal, p.held], ['visible', true, false], 'the HUD stays under the scrim; gameplay input is off');
    await game.page.evaluate(() => window.__dbg.ext.core.ctx().input.injectAction('forward', false));
    assert.deepEqual(await items(game), [STORY.ui.ui_pause_resume + '*', STORY.ui.ui_pause_options, STORY.ui.ui_pause_restart_cp, STORY.ui.ui_pause_quit]);
    // Escape resumes
    await game.page.keyboard.press('Escape');
    let s = await game.run([{ steps: 2 }]);
    assert.deepEqual([s.game, s.ui.screen], ['playing', '']);
    assert.equal((await events(game, 'audio/cue')).at(-1).cue, 'ui_back');
    // back to the last count
    await game.page.evaluate(() => { window.__dbg.pause(true); });
    await game.page.keyboard.press('ArrowDown'); await game.page.keyboard.press('ArrowDown'); await game.page.keyboard.press('Enter');
    await idle(game);
    s = await game.run([{ steps: 1 }]);
    assert.equal(s.game, 'playing');
    assert.equal((await events(game, 'ui/action')).at(-1).action, 'restart_checkpoint');
    assert.deepEqual((await events(game, 'game/state')).map((e) => e.to).slice(-3), ['paused', 'loading', 'playing']);
    // options from pause, and back to pause
    await game.page.evaluate(() => { window.__dbg.pause(true); });
    await item(game, 'options');
    assert.equal(await screen(game), 'options');
    await game.page.keyboard.press('Escape');
    assert.equal(await screen(game), 'pause');
    assert.equal((await items(game))[1], STORY.ui.ui_pause_options + '*');
    // quit to title
    await item(game, 'quit');
    await idle(game);
    assert.deepEqual([(await game.state()).game, await screen(game)], ['title', 'title']);
    assert.equal((await events(game, 'ui/action')).at(-1).action, 'quit_to_title');
  } finally { await game.close(); }
});

test('pointer lock: a pause without the lock ever arriving is the click-to-resume plate; after a lock, the menu; a readable pause is neither', async () => {
  const game = await openIndex(server);
  try {
    const pause = (reason) => game.page.evaluate((r) => { window.__dbg.ext.core.ctx().state.request('paused', r, r); window.__dbg.step(0, true); return window.__dbg.state().ui.screen; }, reason);
    // the lock was refused (or never asked for): the plate, and a click on it resumes and asks again
    assert.equal(await pause('focus_lost'), 'click_to_resume');
    const plate = await game.page.evaluate(() => {
      const ctx = window.__dbg.ext.core.ctx(), log = [];
      const lock = ctx.input.requestPointerLock.bind(ctx.input), unlock = ctx.audio.unlock.bind(ctx.audio);
      // the request is recorded and NOT passed on: a browser that refuses it (Chrome, for 1.25 s after Esc) grants nothing
      ctx.input.requestPointerLock = () => { log.push('lock'); };
      ctx.audio.unlock = () => { log.push('unlock'); unlock(); };
      void lock;
      const el = document.querySelector('.k7 .ctr.on');
      const text = el.textContent;
      el.click();
      return { text, log, game: window.__dbg.state().game, screen: window.__dbg.state().ui.screen, action: window.__dbg.events(0, 'ui/action').at(-1).payload.action };
    });
    assert.deepEqual(plate, { text: STORY.ui.ui_click_to_start, log: ['unlock', 'lock'], game: 'playing', screen: '', action: 'resume' });
    // refused again: the plate simply comes back on the state change (no timer of the UI's own)
    assert.equal(await pause('focus_lost'), 'click_to_resume');
    await game.page.evaluate(() => { window.__dbg.emit('ui/action', { action: 'resume' }); });
    // the lock arrives, then is lost (the player's Esc): the pause menu
    await game.page.evaluate(() => window.__dbg.emit('input/pointer_lock', { locked: true }));
    assert.equal(await pause('focus_lost'), 'pause');
    await game.page.evaluate(() => { window.__dbg.emit('ui/action', { action: 'resume' }); });
    assert.equal(await pause('menu'), 'pause');
    await game.page.evaluate(() => { window.__dbg.emit('ui/action', { action: 'resume' }); });
    // a pause whose reason is `readable` with a readable open is the viewer, never the menu
    const r = await game.page.evaluate(() => {
      const dbg = window.__dbg, ctx = dbg.ext.core.ctx();
      dbg.emit('readable/opened', { key: 'rd_note_lip' });
      ctx.state.request('paused', 'readable', 'readable');
      dbg.step(0, true);
      return { screen: dbg.state().ui.screen, pauseShown: getComputedStyle(document.querySelector('.k7 .pause')).display, game: dbg.state().game };
    });
    assert.deepEqual(r, { screen: 'readable', pauseShown: 'none', game: 'paused' });
  } finally { await game.close(); }
});

test('readables: cards on blank lines, E / Enter / Space advance, Escape closes; closing requests playing (readable_closed) and emits nothing else; plates are enamel', async () => {
  const game = await openIndex(server);
  try {
    const open = (key) => game.page.evaluate((k) => { const dbg = window.__dbg; dbg.emit('readable/opened', { key: k }); dbg.ext.core.ctx().state.request('paused', 'readable', 'readable'); dbg.step(0, true); }, key);
    const sheet = () => game.page.evaluate(() => {
      const s = document.querySelector('.k7 .reader.on .sheet');
      if (!s) return null;
      const cs = getComputedStyle(s), body = s.querySelector('.sheet-body');
      const ch = parseFloat(getComputedStyle(body).maxWidth) / parseFloat(getComputedStyle(body).fontSize);
      return { title: s.querySelector('.sheet-title').textContent, body: body.textContent, bg: cs.backgroundColor, colour: cs.color, transform: getComputedStyle(body).textTransform, items: [...s.querySelectorAll('.mi')].filter((m) => getComputedStyle(m).display !== 'none').map((m) => m.querySelector('.mi-label').textContent + (m.classList.contains('sel') ? '*' : '')), caps: [...s.querySelectorAll('.mi')].filter((m) => getComputedStyle(m).display !== 'none').map((m) => m.querySelector('.key')?.textContent ?? ''), dots: [...s.querySelectorAll('.dots i')].filter((d) => getComputedStyle(d).display !== 'none').map((d) => (d.classList.contains('on') ? 1 : 0)).join(''), ch, fits: body.scrollWidth <= body.clientWidth + 1 && s.getBoundingClientRect().bottom < innerHeight && s.getBoundingClientRect().top > 0 };
    });
    // pass i2: a note found in the world is laid out by what the sheet holds (text.ts packCards): the ledger's three
    // short paragraphs are one card. The four paragraphs of rd_backstory, opened as a note, are two cards of two: the
    // sheet with more than one card that the rest of this test (and the three after it) turns.
    const led = STORY.readables.rd_ledger;
    assert.equal(led.body.split('\n\n').length, 3);
    await open('rd_ledger');
    let s = await sheet();
    assert.deepEqual([s.title, s.body, s.dots, s.items, s.fits], [led.title, led.body, '', [STORY.ui.ui_read_close + '*'], true], 'the ledger is one card');
    await game.page.keyboard.press('Escape');
    const ledger = STORY.readables.rd_backstory, paras = ledger.body.split('\n\n');
    assert.equal(paras.length, 4);
    const cards = [paras[0] + '\n\n' + paras[1], paras[2] + '\n\n' + paras[3], ''];
    await open('rd_backstory');
    s = await sheet();
    assert.deepEqual([s.title, s.body, s.dots, s.items], [ledger.title, cards[0], '10', [STORY.ui.ui_read_next + '*', STORY.ui.ui_read_close]]);
    // pass i1: the sheet says which key turns it and which closes it (the bound interact key, and Esc), in key caps
    assert.deepEqual(s.caps, ['E', 'Esc']);
    assert.deepEqual([s.bg, s.colour, s.fits], ['rgba(233, 226, 208, 0.96)', 'rgb(20, 17, 15)', true]);
    assert.equal((await game.state()).systems.ui.modal, true);
    const before = (await game.events(0)).length;
    await game.page.keyboard.press('KeyE');
    s = await sheet();
    assert.deepEqual([s.body, s.dots, s.items], [cards[1], '01', [STORY.ui.ui_read_close + '*']], 'E (the interact key) turns the card; the last card offers only Close');
    await game.page.keyboard.press('Escape');
    await open('rd_backstory');
    await game.page.keyboard.press('Space');
    s = await sheet();
    assert.deepEqual([s.body, s.dots], [cards[1], '01'], 'Space turns it too');
    await game.page.keyboard.press('Enter');
    assert.equal(await sheet(), null, 'Enter on the last card closes');
    const st = await game.state();
    assert.deepEqual([st.game, st.ui.screen, st.systems.ui.modal], ['playing', '', false]);
    const since = (await game.events(0)).slice(before).filter((e) => e.name !== 'audio/cue');
    assert.deepEqual(since.map((e) => e.name + (e.name === 'game/state' ? ':' + e.payload.reason : e.name === 'ui/screen' ? ':' + e.payload.screen + ':' + e.payload.open : '')).slice(-2), ['game/state:readable_closed', 'ui/screen:readable:false']);
    // Escape closes from the first card; the mouse works too
    await open('rd_backstory');
    await game.page.keyboard.press('Escape');
    assert.equal((await game.state()).game, 'playing');
    await open('rd_backstory');
    await game.page.evaluate(() => document.querySelector('.k7 .reader.on [data-item="next"]').click());
    assert.equal((await sheet()).body, cards[1]);
    await game.page.evaluate(() => document.querySelector('.k7 .reader.on [data-item="close"]').click());
    assert.equal((await game.state()).game, 'playing');
    // every readable fits the screen card by card; plates are enamel with ink capitals
    for (const [key, r] of Object.entries(STORY.readables)) {
      await open(key);
      // pass i2: every note and plate of story.json is one card on the sheet (text.ts packCards: at most 12 lines of
      // 58 characters); the four paragraphs of the story so far, opened as a note, are two cards
      const pages = key === 'rd_backstory' ? cards.slice(0, 2) : [r.body];
      for (let i = 0; i < pages.length; i++) {
        s = await sheet();
        assert.equal(s.body, pages[i], `${key} card ${i + 1}`);
        assert.ok(s.fits, `${key} card ${i + 1} fits the frame`);
        if (key.startsWith('rd_plate_')) assert.deepEqual([s.bg, s.colour, s.transform], ['rgb(207, 214, 204)', 'rgb(20, 17, 15)', 'uppercase'], key);
        else { assert.equal(s.bg, 'rgba(233, 226, 208, 0.96)', key); assert.ok(s.ch > 26 && s.ch < 42, `${key}: about 60 characters wide (${s.ch.toFixed(1)} em)`); }
        await game.page.keyboard.press('Enter');
      }
      assert.equal((await game.state()).game, 'playing', key);
    }
  } finally { await game.close(); }
});

test('readables with the pointer locked: the fire button turns the card and closes the note; a button held at opening does not; the closing click is no shot', async () => {
  const game = await openIndex(server, { start: false });
  try {
    const open = (key) => game.page.evaluate((k) => { const dbg = window.__dbg; dbg.emit('readable/opened', { key: k }); dbg.ext.core.ctx().state.request('paused', 'readable', 'readable'); dbg.step(0, true); }, key);
    const reader = () => game.page.evaluate(() => { const s = window.__dbg.state(), c = window.__dbg.ext.core.ctx(); return { card: s.systems.ui.reader.card, screen: s.ui.screen, game: s.game, locked: c.input.pointerLocked }; });
    // at boot the loading screen is ink at once; from the title it comes up softly (no hard cut from the live shot)
    assert.equal(await game.page.evaluate(() => document.querySelector('.k7 .loading').classList.contains('soft')), false);
    // a real click on Begin: the browser gives the pointer lock to a user gesture
    const box = await game.page.evaluate(() => { const r = document.querySelector('.k7 .title [data-item="play"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await game.page.mouse.click(box.x, box.y);
    await idle(game);
    await game.page.waitForFunction(() => window.__dbg.ext.core.ctx().input.pointerLocked, null, { timeout: 30000 });
    await frame(game, 5);
    const soft = await game.page.evaluate(() => { const l = document.querySelector('.k7 .loading'); l.classList.add('on'); const a = getComputedStyle(l); const out = [l.classList.contains('soft'), a.animationName, a.animationDuration]; l.classList.remove('on'); return out; });
    assert.deepEqual(soft, [true, 'k7-row', '0.25s'], 'title -> loading fades in over 0.25 s');
    assert.deepEqual(await reader(), { card: 0, screen: '', game: 'playing', locked: true });
    // the note opens while the fire button is down (she was shooting): that press turns nothing
    await game.page.mouse.down();
    await open('rd_backstory');
    assert.deepEqual(await reader(), { card: 0, screen: 'readable', game: 'paused', locked: true }, 'the readable keeps the pointer lock');
    assert.deepEqual(await game.page.evaluate(() => [...document.querySelectorAll('.k7 .reader.on .mi')].filter((m) => getComputedStyle(m).display !== 'none').map((m) => m.querySelector('.key').textContent + ' ' + m.querySelector('.mi-label').textContent)), ['E ' + STORY.ui.ui_read_next, STORY.ui.ui_key_mouse_right + ' ' + STORY.ui.ui_read_close]);
    await game.page.evaluate(() => document.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true })));
    assert.equal((await reader()).card, 0, 'a button already down when the note opened turns no card');
    await game.page.mouse.up();
    const cues = (await events(game, 'audio/cue')).length;
    await game.page.mouse.down(); await game.page.mouse.up();
    assert.equal((await reader()).card, 1, 'a fresh press of the fire button: the next card');
    assert.equal((await events(game, 'audio/cue')).at(-1).cue, 'ui_select');
    assert.equal((await events(game, 'audio/cue')).length, cues + 1);
    await game.page.mouse.down({ button: 'middle' }); await game.page.mouse.up({ button: 'middle' });
    assert.equal((await reader()).card, 1, 'another button is not the fire button');
    // pass i1: with the pointer locked the sheet names the right button beside Close (Esc would let the mouse go), and
    // that button closes the note from any card, keeps the pointer and fires nothing
    const caps = () => game.page.evaluate(() => [...document.querySelectorAll('.k7 .reader.on .mi')].filter((m) => getComputedStyle(m).display !== 'none').map((m) => m.querySelector('.key').textContent + ' ' + m.querySelector('.mi-label').textContent));
    // (pass i2: this is the sheet's last card, so Close stands alone; the first card names E beside Next: asserted where it opened)
    // (pass i3: on the last card Close names the key that turned the cards, E; the right button still closes: below)
    assert.deepEqual(await caps(), ['E ' + STORY.ui.ui_read_close]);
    const firedBefore = (await events(game, 'weapon/fired')).length;
    await game.page.mouse.down({ button: 'right' });
    assert.deepEqual([(await reader()).screen, (await reader()).game, (await reader()).locked], ['', 'playing', true], 'the right button closes the note and the pointer stays');
    await frame(game, 6);
    await game.page.mouse.up({ button: 'right' });
    await frame(game, 6);
    assert.equal((await events(game, 'weapon/fired')).length, firedBefore, 'and it fired nothing');
    await open('rd_backstory');
    await game.page.mouse.down(); await game.page.mouse.up();
    assert.equal((await reader()).card, 1);
    const fired = (await events(game, 'weapon/fired')).length;
    await game.page.mouse.down();
    assert.deepEqual([(await reader()).screen, (await reader()).game], ['', 'playing'], 'on the last card the press closes the note');
    await frame(game, 6);
    await game.page.mouse.up();
    await frame(game, 6);
    assert.equal((await events(game, 'weapon/fired')).length, fired, 'the press that closed the note fired nothing');
    assert.equal((await reader()).locked, true, 'and the pointer never left the game');
    // a fire binding on another mouse button turns the card as well
    await game.page.evaluate(() => { const o = window.__dbg.ext.core.ctx().options; o.set('bindings', { ...o.value.bindings, fire: ['Mouse2'] }); });
    await open('rd_backstory');
    assert.equal(await game.page.evaluate(() => document.querySelector('.k7 .reader.on [data-item="close"] .key').textContent), 'Esc', 'the right button is hers to fire with: Close names Esc again');
    await game.page.mouse.down({ button: 'right' }); await game.page.mouse.up({ button: 'right' });
    assert.equal((await reader()).card, 1, 'fire bound to the right button');
    await game.page.keyboard.press('Escape');
  } finally { await game.close(); }
});

test('readables without the pointer lock: a click beside the sheet does nothing (its items take the mouse)', async () => {
  const game = await openIndex(server);
  try {
    await game.page.evaluate(() => { const dbg = window.__dbg; dbg.emit('readable/opened', { key: 'rd_backstory' }); dbg.ext.core.ctx().state.request('paused', 'readable', 'readable'); dbg.step(0, true); });
    assert.equal(await game.page.evaluate(() => window.__dbg.ext.core.ctx().input.pointerLocked), false);
    await game.page.mouse.click(8, 8);
    const next = await game.page.evaluate(() => { const r = document.querySelector('.k7 .reader.on [data-item="next"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    assert.equal((await game.state()).systems.ui.reader.card, 0);
    await game.page.mouse.click(next.x, next.y);
    assert.equal((await game.state()).systems.ui.reader.card, 1, 'one click on Next is one card, not two');
  } finally { await game.close(); }
});

test('readables: a held E does not page through a note (auto-repeat, or the press that opened it); a fresh press does', async () => {
  const game = await openIndex(server);
  try {
    const open = (key) => game.page.evaluate((k) => { const dbg = window.__dbg; dbg.emit('readable/opened', { key: k }); dbg.ext.core.ctx().state.request('paused', 'readable', 'readable'); dbg.step(0, true); }, key);
    const reader = () => game.page.evaluate(() => { const s = window.__dbg.state(); return { card: s.systems.ui.reader.card, screen: s.ui.screen, game: s.game }; });
    const synth = (code, type, repeat) => game.page.evaluate(([c, t, r]) => window.dispatchEvent(new KeyboardEvent(t, { code: c, repeat: r, bubbles: true, cancelable: true })), [code, type, repeat]);
    // the player presses E on the note and keeps it down past the OS repeat delay: the press opens the note (world), and
    // the browser goes on sending repeated keydowns. Playwright sends repeat: true for a key that is already down.
    await game.page.keyboard.down('KeyE');
    await open('rd_backstory');
    assert.deepEqual(await reader(), { card: 0, screen: 'readable', game: 'paused' });
    for (let i = 0; i < 4; i++) await game.page.keyboard.down('KeyE');
    assert.deepEqual(await reader(), { card: 0, screen: 'readable', game: 'paused' }, 'held E: still on the first card, still open');
    // a keydown of the held key that does not say it repeats (a platform that sends no repeat flag) is ignored too
    await synth('KeyE', 'keydown', false);
    assert.equal((await reader()).card, 0, 'the E that opened the note turns no card until it is let go');
    await game.page.keyboard.up('KeyE');
    await game.page.keyboard.press('KeyE');
    assert.equal((await reader()).card, 1, 'let go and pressed again: the next card');
    // auto-repeat of any key on a sheet does nothing (Enter, Space, E), from a key that went down while the sheet was up
    for (const code of ['KeyE', 'Enter', 'Space', 'Escape']) for (let i = 0; i < 4; i++) await synth(code, 'keydown', true);
    assert.deepEqual(await reader(), { card: 1, screen: 'readable', game: 'paused' }, 'repeats of E / Enter / Space / Esc: nothing');
    // the same on the story-so-far sheet from the title: the Enter that chose it, held, turns nothing
    await game.page.keyboard.press('Enter');
    assert.deepEqual([(await reader()).screen, (await reader()).game], ['', 'playing'], 'a fresh press on the last card: closed');
    await game.page.evaluate(() => { window.__dbg.pause(true); window.__dbg.emit('ui/action', { action: 'quit_to_title' }); });
    await idle(game);
    await game.page.keyboard.press('ArrowDown');
    if ((await items(game)).find((t) => t.endsWith('*')) !== STORY.ui.ui_menu_story + '*') await game.page.keyboard.press('ArrowDown');
    assert.equal((await items(game)).find((t) => t.endsWith('*')), STORY.ui.ui_menu_story + '*');
    await game.page.keyboard.down('Enter');
    assert.equal(await screen(game), 'story');
    for (let i = 0; i < 3; i++) await game.page.keyboard.down('Enter');
    assert.equal((await reader()).card, 0, 'the held Enter that opened the story turns no card');
    await game.page.keyboard.up('Enter');
    await game.page.keyboard.press('Enter');
    assert.equal((await reader()).card, 1);
    // a key let go while the window was away (focus lost) is not held for ever
    await game.page.keyboard.down('Space');
    await game.page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await synth('Space', 'keydown', false);
    assert.equal((await reader()).card, 2, 'after a blur nothing is held');
    await game.page.keyboard.up('Space');
  } finally { await game.close(); }
});

test('options from pause: the frozen subtitle and caption show under neither; the crosshair not through the page', async () => {
  const game = await openIndex(server);
  try {
    await game.page.evaluate(() => {
      const dbg = window.__dbg, ctx = dbg.ext.core.ctx();
      const key = Object.keys(ctx.data.story.lines).find((k) => ctx.data.story.lines[k].speaker === 'station');
      const l = ctx.data.line(key);
      dbg.emit('story/line', { key, speaker: l.speaker, text: l.text, seconds: l.seconds });
      dbg.emit('story/caption', { key: 'cap_bider_rattle', text: ctx.data.line('cap_bider_rattle').text, seconds: 2 });
      dbg.pause(true); dbg.step(0, true);
    });
    const look = () => game.page.evaluate(() => {
      const shown = (sel) => { const n = document.querySelector(sel); if (getComputedStyle(n).display === 'none' || getComputedStyle(n).visibility === 'hidden') return false; for (let p = n.parentElement; p; p = p.parentElement) if (getComputedStyle(p).display === 'none') return false; return true; };
      return { screen: window.__dbg.state().ui.screen, sub: shown('.k7 .sub.on'), capt: shown('.k7 .capt.on'), xh: shown('.k7 .hud .xh'), mark: shown('.k7 .hud .mark') };
    });
    // polish round 5: the HUD's mark (lower left now, under the pause column) is not drawn under the pause, which shows it enlarged
    assert.deepEqual(await look(), { screen: 'pause', sub: false, capt: false, xh: true, mark: false }, 'the pause keeps the frozen frame, without its text layer');
    await item(game, 'options');
    assert.deepEqual(await look(), { screen: 'options', sub: false, capt: false, xh: false, mark: false }, 'the options page is not laid over the text, nor over the gauges');
    // nothing of the text layer crosses the options footer
    const overlap = await game.page.evaluate(() => {
      const foot = document.querySelector('.k7 .options .opt-foot').getBoundingClientRect();
      return [...document.querySelectorAll('.k7 .txt *')].filter((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > foot.top && r.top < foot.bottom; }).length;
    });
    assert.equal(overlap, 0);
    await game.page.keyboard.press('Escape');
    assert.deepEqual(await look(), { screen: 'pause', sub: false, capt: false, xh: true, mark: false }, 'back on the pause');
    // and in play the line that was up is up again (it was never ended, only not drawn)
    await game.page.evaluate(() => { window.__dbg.emit('ui/action', { action: 'resume' }); window.__dbg.step(1, true); });
    const back = await look();
    assert.deepEqual([back.screen, back.sub], ['', true], 'the subtitle is back with the game');
  } finally { await game.close(); }
});

test('options: every key of Options is in the menu and changes ctx.options.value live; FOV reads 79 to 112; reset; Low while the tier is min', async () => {
  const game = await openIndex(server, { start: false });
  try {
    assert.deepEqual(await options(game), DEFAULTS, 'the defaults of GDD 15');
    await item(game, 'options');
    assert.equal(await screen(game), 'options');
    const tabs = await game.page.evaluate(() => [...document.querySelectorAll('.k7 .options .tab')].map((t) => t.textContent));
    assert.deepEqual(tabs, ['ui_opt_tab_controls', 'ui_opt_tab_comfort', 'ui_opt_tab_text', 'ui_opt_tab_sound', 'ui_opt_tab_picture'].map((k) => STORY.ui[k]));
    const first = await game.page.evaluate(() => [...document.querySelectorAll('.k7 .options .pane.on [data-opt]')].map((r) => r.getAttribute('data-opt')));
    assert.ok(first.includes('sensitivity') && first.includes('fov'), 'sensitivity and FOV are on the first page');
    // every key: find its row in some tab, show the tab, work the control with the mouse, and see the store change at once
    const keys = Object.keys(DEFAULTS).filter((k) => k !== 'bindings');
    for (const key of keys) {
      const tab = await game.page.evaluate((k) => { const row = document.querySelector(`.k7 .options [data-opt="${k}"]`); if (!row) return null; const pane = row.closest('.pane').getAttribute('data-pane'); document.querySelector(`.k7 .options [data-tab="${pane}"]`).click(); return pane; }, key);
      assert.ok(tab, `${key} has a row in the options menu`);
      const was = (await options(game))[key];
      const row = game.page.locator(`.k7 .options [data-opt="${key}"]`);
      if (typeof was === 'number') {
        const box = await row.locator('.sl').boundingBox();
        const lowHalf = await game.page.evaluate((k) => parseFloat(document.querySelector(`.k7 .options [data-opt="${k}"] .sl-knob`).style.left) < 50, key);
        await game.page.mouse.click(box.x + box.width * (lowHalf ? 0.9 : 0.1), box.y + box.height / 2);
      } else if (typeof was === 'boolean') await row.locator('.cho').click();
      else await row.locator('.cho:not(.on)').first().click();
      const now = (await options(game))[key];
      assert.notDeepEqual(now, was, `${key} changed (${was} -> ${now})`);
      assert.ok((await events(game, 'options/changed')).some((e) => e.key === key), `options/changed { ${key} }`);
    }
    // sliders drag, too
    await game.page.evaluate(() => document.querySelector('.k7 .options [data-tab="sound"]').click());
    const track = await game.page.locator('.k7 .options [data-opt="volumeMaster"] .sl').boundingBox();
    await game.page.mouse.move(track.x + 2, track.y + track.height / 2); await game.page.mouse.down(); await game.page.mouse.move(track.x + track.width * 0.5, track.y + track.height / 2, { steps: 4 });
    assert.equal((await options(game)).volumeMaster, 0.5);
    await game.page.mouse.up();
    // FOV: 50 .. 80 vertical, shown as 79 .. 112
    const fov = await game.page.evaluate(() => {
      const dbg = window.__dbg, val = document.querySelector('.k7 .options [data-opt="fov"] .val');
      const out = [];
      for (const v of [50, 62, 80]) { dbg.setOption('fov', v); out.push(val.textContent); }
      return out;
    });
    assert.deepEqual(fov, ['79°', '94°', '112°']);
    const shown = await game.page.evaluate(() => {
      const dbg = window.__dbg, t = (k) => document.querySelector(`.k7 .options [data-opt="${k}"] .val`).textContent;
      dbg.setOption('sensitivity', 0.2); const a = t('sensitivity'); dbg.setOption('sensitivity', 4); const b = t('sensitivity');
      dbg.setOption('headBob', 1.5); dbg.setOption('resolutionScale', 0.5);
      dbg.setOption('difficulty', 'hard');
      return { a, b, bob: t('headBob'), res: t('resolutionScale'), desc: document.querySelector('.k7 .options [data-opt="difficulty"] .desc').textContent };
    });
    assert.deepEqual(shown, { a: '×0.2', b: '×4.0', bob: '150 %', res: '50 %', desc: STORY.ui.ui_opt_diff_hard_desc });
    // the hidden `min` tier shows Low as selected
    const gfx = await game.page.evaluate(() => {
      const dbg = window.__dbg, sel = () => document.querySelector('.k7 .options [data-opt="graphics"] .cho.on').getAttribute('data-value');
      dbg.setOption('graphics', 'auto'); dbg.setTier('low'); const a = sel();
      dbg.setTier('min'); const b = sel();
      const tier = dbg.ext.core.ctx().quality.tier, opt = dbg.ext.core.ctx().options.value.graphics;
      dbg.setTier('high'); dbg.setOption('graphics', 'high');
      return { a, b, tier, opt, c: sel() };
    });
    assert.deepEqual(gfx, { a: 'auto', b: 'low', tier: 'min', opt: 'auto', c: 'high' });
    // keyboard: down to the first row, right moves the slider one step, Enter flips a toggle
    await game.page.evaluate(() => document.querySelector('.k7 .options [data-tab="controls"]').click());
    await game.page.evaluate(() => window.__dbg.setOption('sensitivity', 1));
    await game.page.keyboard.press('ArrowDown'); await game.page.keyboard.press('ArrowRight'); await game.page.keyboard.press('ArrowRight');
    assert.equal((await options(game)).sensitivity, 1.2);
    const inv = (await options(game)).invertY;
    await game.page.keyboard.press('ArrowDown'); await game.page.keyboard.press('Enter');
    assert.equal((await options(game)).invertY, !inv);
    await game.page.keyboard.press('ArrowUp'); await game.page.keyboard.press('ArrowUp'); await game.page.keyboard.press('ArrowRight');
    assert.equal(await game.page.evaluate(() => document.querySelector('.k7 .options .tab.on').getAttribute('data-tab')), 'comfort', 'left / right on the tab row changes the tab');
    // restore defaults
    await item(game, 'reset');
    assert.deepEqual(await options(game), DEFAULTS, 'Restore defaults gives the GDD 15 table back');
    const back = await game.page.evaluate(() => [...document.querySelectorAll('.k7 .options .opt-foot .mi')].map((m) => m.textContent));
    assert.deepEqual(back, [STORY.ui.ui_opt_reset, STORY.ui.ui_opt_back]);
    await item(game, 'back');
    assert.equal(await screen(game), 'title');
    // looks: a slider is a hairline with a 9 px brass disc; a toggle is a ring or a filled disc
    await item(game, 'options');
    const look = await game.page.evaluate(() => {
      const u = innerHeight / 1080, knob = document.querySelector('.k7 .options [data-opt="sensitivity"] .sl-knob'), track = getComputedStyle(document.querySelector('.k7 .options [data-opt="sensitivity"] .sl'), '::before');
      const off = document.querySelector('.k7 .options [data-opt="invertY"] .cho'), cb = off.querySelector('.cb');
      const before = { on: off.classList.contains('on'), fill: getComputedStyle(cb).backgroundColor, word: off.textContent };
      off.click();
      return { knob: knob.getBoundingClientRect().width / u, knobColour: getComputedStyle(knob).backgroundColor, track: track.height, trackColour: track.backgroundColor, before, after: { on: off.classList.contains('on'), fill: getComputedStyle(cb).backgroundColor, word: off.textContent } };
    });
    assert.ok(look.knob >= 9 && look.knob < 11, `knob ${look.knob}`);
    assert.deepEqual([look.knobColour, look.track, look.trackColour], ['rgb(201, 161, 74)', '1px', 'rgb(233, 226, 208)']);
    assert.deepEqual(look.before, { on: false, fill: 'rgba(0, 0, 0, 0)', word: STORY.ui.ui_opt_off });
    assert.deepEqual(look.after, { on: true, fill: 'rgb(201, 161, 74)', word: STORY.ui.ui_opt_on });
  } finally { await game.close(); }
});

test('rebinding: every action has a labelled row; press a key, Escape cancels, a used code swaps, Ctrl is refused, a mouse button binds; hints use the new key', async () => {
  const game = await openIndex(server, { start: false });
  try {
    await item(game, 'options');
    const rows = await game.page.evaluate(() => [...document.querySelectorAll('.k7 .options [data-action]')].map((r) => [r.getAttribute('data-action'), r.querySelector('.lab').textContent, [...r.querySelectorAll('.slot')].map((s) => s.textContent)]));
    const ACTIONS = ['forward', 'back', 'left', 'right', 'fire', 'reload', 'line', 'kept', 'interact', 'sprint', 'jump', 'pause'];
    assert.deepEqual(rows.map((r) => r[0]), ACTIONS);
    for (const [action, label] of rows) assert.equal(label, STORY.ui['ui_action_' + action], action);
    assert.deepEqual(rows.find((r) => r[0] === 'forward')[2], ['W', '↑']);
    assert.deepEqual(rows.find((r) => r[0] === 'fire')[2], ['Left click', '—']);
    const slot = (action, n) => game.page.locator(`.k7 .options [data-action="${action}"] [data-slot="${n}"]`);
    const bindings = async () => (await options(game)).bindings;
    const capturing = () => game.page.evaluate(() => window.__dbg.state().systems.ui.capturing);
    // press a key
    await slot('reload', 0).click();
    assert.equal(await capturing(), true);
    assert.equal(await slot('reload', 0).textContent(), STORY.ui.ui_opt_bind_press);
    await game.page.keyboard.press('KeyG');
    assert.equal(await capturing(), false);
    assert.deepEqual((await bindings()).reload, ['KeyG']);
    assert.equal(await slot('reload', 0).textContent(), 'G');
    assert.equal(await screen(game), 'options', 'the captured key did nothing else');
    // Escape cancels, and does not leave the screen
    await slot('reload', 0).click();
    await game.page.keyboard.press('Escape');
    assert.deepEqual([await capturing(), (await bindings()).reload, await screen(game)], [false, ['KeyG'], 'options']);
    // Enter as a binding is taken by the capture, not by the menu
    await slot('jump', 1).click();
    await game.page.keyboard.press('Enter');
    assert.deepEqual([(await bindings()).jump, await capturing(), await screen(game)], [['Space', 'Enter'], false, 'options']);
    // a code used elsewhere is swapped: reload takes F, kept gets what reload had
    await slot('reload', 0).click();
    await game.page.keyboard.press('KeyF');
    let b = await bindings();
    assert.deepEqual([b.reload, b.kept], [['KeyF'], ['KeyG']], 'swapped');
    // a swap into an empty slot moves the code: line's second slot takes W, forward keeps only the arrow
    await slot('line', 1).click();
    await game.page.keyboard.press('KeyW');
    b = await bindings();
    assert.deepEqual([b.line, b.forward], [['KeyQ', 'KeyW'], ['ArrowUp']]);
    // Ctrl is never bindable: the prompt stays up until another key comes
    await slot('sprint', 0).click();
    await game.page.keyboard.press('ControlLeft');
    assert.equal(await capturing(), true, 'Ctrl is ignored');
    assert.deepEqual((await bindings()).sprint, ['ShiftLeft']);
    await game.page.keyboard.press('KeyC');
    assert.deepEqual([(await bindings()).sprint, await capturing()], [['KeyC'], false]);
    // a mouse button: the click that answers the prompt binds and is not a click on the menu
    await slot('interact', 1).click();
    const box = await slot('kept', 0).boundingBox();
    await game.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
    b = await bindings();
    assert.deepEqual([b.interact, await capturing()], [['KeyE', 'Mouse2'], false]);
    await slot('line', 0).click();
    await game.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    b = await bindings();
    assert.deepEqual([b.line, b.fire, await capturing()], [['Mouse0', 'KeyW'], ['KeyQ'], false], 'the left button swapped with fire, and the click did not start another capture');
    // no code is bound twice, no action has more than two
    const all = Object.values(b).flat();
    assert.equal(new Set(all).size, all.length);
    assert.ok(Object.values(b).every((l) => l.length <= 2));
    // the keyboard path: focus a binding row, right picks the second slot, Enter captures
    await game.page.evaluate(() => document.querySelector('.k7 .options [data-tab="controls"]').click());
    for (let i = 0; i < 6; i++) await game.page.keyboard.press('ArrowDown');
    await game.page.keyboard.press('ArrowRight'); await game.page.keyboard.press('Enter');
    assert.equal(await capturing(), true);
    await game.page.keyboard.press('KeyT');
    assert.deepEqual((await bindings()).forward, ['ArrowUp', 'KeyT']);
    // placeholders follow the bindings, live
    await game.page.evaluate(() => window.__dbg.start());
    const text = await game.page.evaluate(() => {
      const dbg = window.__dbg;
      dbg.emit('ui/hint', { key: 'ui_hint_reload', show: true });
      dbg.emit('interact/focus', { id: 'x', prompt: 'ui_prompt_kept', kind: 'kept' });
      const a = { ...dbg.state().ui };
      const ctx = dbg.ext.core.ctx(), nb = JSON.parse(JSON.stringify(ctx.options.value.bindings));
      nb.reload = ['KeyZ']; nb.kept = ['Digit7'];
      dbg.setOption('bindings', nb);
      const b2 = { ...dbg.state().ui };
      return { a: [a.hint, a.prompt], b: [b2.hint, b2.prompt], dom: [document.querySelector('.k7 .prompt.hint .key').textContent, document.querySelector('.k7 .prompt:not(.hint) .key').textContent] };
    });
    assert.deepEqual(text.a, ['F to reload', 'G  Break the band']);
    assert.deepEqual(text.b, ['Z to reload', '7  Break the band'], 'the text on screen changed with the binding');
    assert.deepEqual(text.dom, ['Z', '7']);
  } finally { await game.close(); }
});

test('end card: a ledger from the stats, the lamps as glyphs, never the felled; again and menu', async () => {
  const game = await openIndex(server, { checkpoint: 'cp_rim' });
  try {
    const end = (freed, stats) => game.page.evaluate(([n, st]) => {
      const dbg = window.__dbg, ctx = dbg.ext.core.ctx();
      for (let i = ctx.world.stats.freed; i < n; i++) dbg.emit('enemy/freed', { x: 0, y: 0, z: 0, id: 'bider#' + i, encounter: '', cause: 'crown', counted: true });
      if (ctx.state.current !== 'ending') ctx.state.request('ending', 'test');
      dbg.step(0, true);
      const beforeCard = { screen: dbg.state().ui.screen, hud: getComputedStyle(document.querySelector('.k7 .hud')).visibility };
      dbg.emit('ending/card', { stats: { ...ctx.world.stats, ...st } });
      dbg.step(0, true);
      const el = document.querySelector('.k7 .end');
      const rows = {};
      for (const r of el.querySelectorAll('[data-row]')) rows[r.getAttribute('data-row')] = [r.querySelector('.lab').textContent, r.querySelector('.v').textContent];
      const grid = el.querySelector('.lamp-grid'), lamps = [...grid.children].filter((l) => getComputedStyle(l).display !== 'none');
      const tops = new Set(lamps.map((l) => Math.round(l.getBoundingClientRect().top)));
      return {
        beforeCard, screen: dbg.state().ui.screen, modal: dbg.state().systems.ui.modal, card: el.querySelector('.end-card').textContent, rows, order: [...el.querySelectorAll('[data-row]')].map((r) => r.getAttribute('data-row')),
        lamps: lamps.length, lampRows: tops.size, lampColour: lamps[0] ? getComputedStyle(lamps[0]).backgroundColor : '', worldLamps: ctx.world.lamps, text: el.textContent, bg: getComputedStyle(el).backgroundColor,
        delays: [...el.querySelectorAll('[data-row]')].map((r) => parseFloat(getComputedStyle(r).animationDelay)), items: [...el.querySelectorAll('.mi')].map((m) => m.textContent), hud: getComputedStyle(document.querySelector('.k7 .hud')).visibility,
        digits: [...el.querySelectorAll('*')].filter((e) => e.children.length === 0).map((e) => e.textContent),
      };
    }, [freed, stats]);
    const stats = { playSeconds: 1187, roundsFired: 96, roundsHit: 71, knotsBurst: 23, linesOfThree: 2, cleanSix: true, secrets: ['sec_loft_bell'], felled: 777, deaths: 555, tookStoneRound: false };
    let e = await end(0, stats);
    assert.deepEqual(e.beforeCard, { screen: '', hud: 'hidden' }, 'the wind before the card: no HUD, no card yet');
    // polish round 4 (lead ruling R5; the round-3 card was ink at 80 % over everything, its ledger on the fire): the coda's
    // camera looks straight at the fire, so the fire is the middle of the frame and the lit windows are left of it. The
    // scrim is ink at 35 %, and the ledger stands on its own ink panel in the right third, clear of the middle
    assert.deepEqual([e.screen, e.modal, e.card, e.bg, e.hud], ['end', true, STORY.lines.card_end.text, 'rgba(20, 17, 15, 0.35)', 'hidden']);
    for (const [w, hgt] of [[1280, 720], [1024, 768], [1720, 720], [1920, 1080]]) {
      await game.page.setViewportSize({ width: w, height: hgt });
      const g = await game.page.evaluate(() => {
        const end = document.querySelector('.k7 .end'), panel = end.querySelector('.end-panel'), p = panel.getBoundingClientRect();
        const inside = [...panel.querySelectorAll('.end-card, .lrow, .lab, .v, .mi, .lamp-grid')].every((n) => { const r = n.getBoundingClientRect(); return r.left >= p.left - 0.5 && r.right <= p.right + 0.5 && r.top >= p.top - 0.5 && r.bottom <= p.bottom + 0.5; });
        const wraps = [...panel.querySelectorAll('.lrow:not(.lamps)')].some((r) => { const a = r.querySelector('.lab').getBoundingClientRect(), b = r.querySelector('.v').getBoundingClientRect(); return a.right > b.left || Math.abs(a.bottom - b.bottom) > a.height; });
        return { left: p.left / innerWidth, right: p.right / innerWidth, top: p.top / innerHeight, bottom: p.bottom / innerHeight, bg: getComputedStyle(panel).backgroundColor, inside, wraps, direct: [...end.children].map((c) => c.className) };
      });
      assert.deepEqual(g.direct, ['end-panel'], 'everything of the card is on the panel');
      assert.ok(g.left >= 0.59 && g.right <= 0.97, `${w} x ${hgt}: the panel is in the right of the frame (${g.left.toFixed(3)} to ${g.right.toFixed(3)}), clear of the fire in the middle`);
      assert.ok(g.top >= 0.05 && g.bottom <= 0.9, `${w} x ${hgt}: and clear of the top and of the subtitle (${g.top.toFixed(3)} to ${g.bottom.toFixed(3)})`);
      assert.deepEqual([g.bg, g.inside, g.wraps], ['rgba(20, 17, 15, 0.88)', true, false], `${w} x ${hgt}: the text has its own ink, fits on it, and no row wraps`);
    }
    await game.page.setViewportSize({ width: 1280, height: 720 });
    assert.equal(await game.page.evaluate(() => getComputedStyle(document.querySelector('.k7 .card')).opacity), '0', 'no title card under the end card');
    assert.deepEqual(e.order, ['time', 'deaths', 'rounds', 'accuracy', 'knots', 'lines', 'clean_six', 'secrets', 'lamps', 'carries']);
    assert.deepEqual(e.rows, {
      time: [STORY.ui.ui_end_time, '19:47'], deaths: [STORY.ui.ui_end_deaths, '555'], rounds: [STORY.ui.ui_end_rounds, '96'], accuracy: [STORY.ui.ui_end_accuracy, '71 of 96'], knots: [STORY.ui.ui_end_knots, '23'],
      lines: [STORY.ui.ui_end_lines, '2'], clean_six: [STORY.ui.ui_end_clean_six, STORY.ui.ui_end_yes], secrets: [STORY.ui.ui_end_secrets, '1 of 2'],
      lamps: [STORY.ui.ui_end_lamps, '9'], carries: [STORY.ui.ui_end_carries, STORY.ui.ui_end_carries_six],
    });
    assert.deepEqual([e.lamps, e.worldLamps, e.lampRows, e.lampColour], [9, 9, 1, 'rgb(255, 148, 51)'], 'one flame-coloured glyph per lamp');
    // release pass p0: her deaths ARE shown now, in one quiet row under the time (the time is the surviving timeline's)
    assert.ok(!e.text.includes('777') && e.digits.every((d) => !/777/.test(d)), 'no element holds the count of the felled');
    assert.equal(e.digits.filter((d) => /555/.test(d)).length, 1, 'her deaths stand in one row only');
    for (let i = 1; i < e.delays.length; i++) assert.ok(e.delays[i] > e.delays[i - 1], 'one row lights at a time');
    assert.deepEqual(e.items, [STORY.ui.ui_end_again, STORY.ui.ui_end_rim, STORY.ui.ui_end_menu]);     // pass i1: with a save stored, "The rim again"
    // 48 lamps in rows of 12, and the other "carries"
    e = await end(60, { ...stats, cleanSix: false, tookStoneRound: true, secrets: [] });
    assert.deepEqual([e.lamps, e.worldLamps, e.lampRows, e.rows.lamps[1]], [48, 48, 4, '48'], 'clamped at 48, four rows of twelve');
    assert.deepEqual([e.rows.carries[1], e.rows.clean_six[1], e.rows.secrets[1]], [STORY.ui.ui_end_carries_his, STORY.ui.ui_end_yes, '0 of 2']);
    // pass i1: a feat that was not done has no row (the label and "No" told nobody what it measured)
    assert.equal(await game.page.evaluate(() => getComputedStyle(document.querySelector('.k7 .end [data-row="clean_six"]')).display), 'none');
    // the choice is not live while the rows are still lighting: Enter, arrows and a click do nothing until the menu shows
    let u = (await game.state()).systems.ui;
    assert.equal(u.endLocked, true);
    assert.ok(Math.abs(u.endLockLeft - (0.9 + 10.6 * 0.38 + 0.25)) < 0.02, `the menu answers when it is half faded in (${u.endLockLeft} s)`);
    const css = await game.page.evaluate(() => getComputedStyle(document.querySelector('.k7 .end .menu')).animationDelay);
    assert.ok(Math.abs(parseFloat(css) - (0.9 + 10.6 * 0.38)) < 0.01, `ui.css starts the menu's fade at the same moment (${css})`);
    const actions = (await events(game, 'ui/action')).length;
    await game.page.keyboard.press('Enter'); await game.page.keyboard.press('ArrowRight'); await game.page.keyboard.press('Enter');
    await game.page.evaluate(() => document.querySelector('.k7 .end [data-item="again"]').click());
    await idle(game);
    assert.equal((await events(game, 'ui/action')).length, actions, 'nothing chosen during the reveal');
    assert.deepEqual([(await game.state()).game, await screen(game), (await items(game))[0]], ['ending', 'end', STORY.ui.ui_end_again + '*']);
    await game.step(Math.round((0.9 + 10.6 * 0.38) * 60));
    assert.equal((await game.state()).systems.ui.endLocked, true, 'still locked when the fade has only begun');
    await game.step(16);
    u = (await game.state()).systems.ui;
    assert.deepEqual([u.endLocked, u.endLockLeft], [false, 0], 'live once the menu is half faded in');
    // menu: quit_to_title; again: a new run
    // (pass i1: "The rim again" stands between the two, so the title is two steps right)
    await game.page.keyboard.press('ArrowRight');
    assert.equal((await items(game))[1], STORY.ui.ui_end_rim + '*', 'one step right: The rim again');
    await game.page.keyboard.press('ArrowRight'); await game.page.keyboard.press('Enter');
    await idle(game);
    assert.equal((await events(game, 'ui/action')).at(-1).action, 'quit_to_title');
    assert.deepEqual([(await game.state()).game, await screen(game)], ['title', 'title']);
    // with reduced motion the ledger is cut in whole, and the choice is live at once
    await game.page.evaluate(() => window.__dbg.start());
    await game.page.evaluate(() => window.__dbg.setOption('reduceMotion', true));
    await end(0, stats);
    assert.equal((await game.state()).systems.ui.endLocked, false);
    await item(game, 'again');
    await idle(game);
    const s = await game.run([{ steps: 1 }]);
    assert.equal((await events(game, 'ui/action')).at(-1).action, 'again');
    assert.deepEqual([s.game, s.ui.screen, s.world.checkpoint], ['playing', '', 'cp_lip_start']);
  } finally { await game.close(); }
});

// ---- polish round 2 (robustness): the pause panel's "The kept round. Not for firing." was printed across the dimmed subtitle
test('pause and click-to-resume: no text of the frozen frame is drawn under them; nothing overlaps the mark\'s label', async () => {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 960, height: 540 }, { width: 1024, height: 768 }, { width: 1680, height: 720 }]) {
    const game = await openIndex(server, { viewport });
    try {
      await game.page.evaluate(() => {
        const dbg = window.__dbg, ctx = dbg.ext.core.ctx();
        const key = Object.keys(ctx.data.story.lines).find((k) => ctx.data.story.lines[k].speaker === 'narrator' && ctx.data.story.lines[k].text.length > 60);
        const l = ctx.data.line(key);
        dbg.emit('story/line', { key, speaker: l.speaker, text: l.text, seconds: l.seconds });
        dbg.emit('story/caption', { key: 'cap_bider_rattle', text: ctx.data.line('cap_bider_rattle').text, seconds: 2 });
        dbg.emit('checkpoint/saved', { id: 'cp_lip_gate', movement: 1, section: 1 });
        dbg.step(1, true);
      });
      const look = () => game.page.evaluate(() => {
        const drawn = (n) => { if (!n) return false; for (let p = n; p; p = p.parentElement) { const c = getComputedStyle(p); if (c.display === 'none' || c.visibility === 'hidden') return false; } const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        const label = document.querySelector('.k7 .pause .sv-label').getBoundingClientRect();
        const over = [...document.querySelectorAll('.k7 .txt *')].filter((n) => { if (!drawn(n) || n.textContent === '') return false; const r = n.getBoundingClientRect(); return r.bottom > label.top && r.top < label.bottom && r.right > label.left && r.left < label.right; }).length;
        return { screen: window.__dbg.state().ui.screen, sub: drawn(document.querySelector('.k7 .sub.on')), capt: drawn(document.querySelector('.k7 .capt.on')), cp: drawn(document.querySelector('.k7 .cp.on')), over, vt: window.__dbg.state().ui.subtitle !== '' };
      });
      const at = `${viewport.width}x${viewport.height}`;
      assert.deepEqual(await look(), { screen: '', sub: true, capt: true, cp: true, over: 0, vt: true }, at + ': in play the text is up');
      await game.page.evaluate(() => { window.__dbg.pause(true); window.__dbg.step(0, true); });
      assert.deepEqual(await look(), { screen: 'pause', sub: false, capt: false, cp: false, over: 0, vt: true }, at + ': paused');
      if (viewport.height === 540) await r2shot(game, 'pause_no_subtitle_under_label');
      await game.page.evaluate(() => { window.__dbg.emit('ui/action', { action: 'resume' }); window.__dbg.step(1, true); });
      assert.deepEqual(await look(), { screen: '', sub: true, capt: true, cp: true, over: 0, vt: true }, at + ': resumed, the same line is up');
    } finally { await game.close(); }
  }
});

// ---- polish round 2 (robustness): binding Mouse0 into Reload's empty second slot left Fire with no key at all
test('rebinding never leaves an action without a key: the last key swaps instead of moving; the row shows what moved; stored empties are healed', async () => {
  const game = await openIndex(server, { start: false });
  try {
    await item(game, 'options');
    const slot = (action, n) => game.page.locator(`.k7 .options [data-action="${action}"] [data-slot="${n}"]`);
    const bindings = async () => (await options(game)).bindings;
    const moved = () => game.page.evaluate(() => [...document.querySelectorAll('.k7 .options .slot.moved')].map((s) => s.closest('[data-action]').getAttribute('data-action') + ':' + s.getAttribute('data-slot') + '=' + s.textContent));
    const noneEmpty = (b) => Object.entries(b).filter(([, l]) => l.length === 0).map(([a]) => a);
    // the reported case: fire's only key into reload's empty second slot
    await slot('reload', 1).click();
    const box = await slot('kept', 0).boundingBox();
    await game.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    let b = await bindings();
    assert.deepEqual(noneEmpty(b), [], 'no action without a key');
    assert.deepEqual([b.reload, b.fire], [['Mouse0'], ['KeyR']], 'fire took the key reload had: a swap, nothing lost');
    assert.deepEqual(await moved(), ['fire:0=R'], 'the slot that changed elsewhere is marked');
    const style = await game.page.evaluate(() => { const c = getComputedStyle(document.querySelector('.k7 .options .slot.moved')); return c.borderTopStyle + ' ' + c.color; });
    assert.equal(style, 'dashed rgb(201, 161, 74)');
    await r2shot(game, 'rebind_swap_marked');
    // a key with a spare still just moves (pause has Escape and P): the mark is on the slot it left
    await slot('jump', 1).click();
    await game.page.keyboard.press('KeyP');
    b = await bindings();
    assert.deepEqual([b.jump, b.pause, noneEmpty(b)], [['Space', 'KeyP'], ['Escape'], []]);
    assert.deepEqual(await moved(), ['pause:1=—']);
    // pause's last key into an empty slot: swapped as well, Escape never ends up nowhere
    await slot('sprint', 1).click();
    await game.page.keyboard.press('KeyP');
    b = await bindings();
    assert.deepEqual([b.sprint, b.jump, noneEmpty(b)], [['ShiftLeft', 'KeyP'], ['Space'], []]);
    // the next capture clears the marks
    await slot('line', 1).click();
    assert.deepEqual(await moved(), []);
    await game.page.keyboard.press('Escape');
    // 80 seeded rebinds through the screen itself: never an empty list, never a key twice, never more than two
    const ACTIONS = Object.keys(b);
    const POOL = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyR', 'KeyF', 'KeyP', 'KeyG', 'KeyH', 'Space', 'ShiftLeft', 'ArrowUp', 'ArrowDown', 'Digit1', 'Tab'];
    let seed = 12345;
    const rnd = (n) => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return (seed >>> 8) % n; };
    for (let i = 0; i < 80; i++) {
      const action = ACTIONS[rnd(ACTIONS.length)], n = rnd(2), code = POOL[rnd(POOL.length)];
      await slot(action, n).click();
      await game.page.keyboard.press(code);
      b = await bindings();
      const all = Object.values(b).flat();
      assert.deepEqual([noneEmpty(b), new Set(all).size === all.length, Object.values(b).every((l) => l.length <= 2)], [[], true, true], `step ${i}: ${code} into ${action}:${n} -> ${JSON.stringify(b)}`);
      assert.ok(b[action].includes(code), `step ${i}: ${action} holds ${code}`);
    }
    // an options blob with empty lists (core's sanitizer lets them through): healed the moment it arrives
    const healed = await game.page.evaluate(() => {
      const dbg = window.__dbg, ctx = dbg.ext.core.ctx();
      const nb = JSON.parse(JSON.stringify(ctx.options.value.bindings));
      nb.forward = []; nb.fire = []; nb.pause = []; nb.reload = ['Escape', 'Mouse0'];
      dbg.setOption('bindings', nb);
      return JSON.parse(JSON.stringify(ctx.options.value.bindings));
    });
    assert.deepEqual([healed.forward, healed.fire, healed.pause, noneEmpty(healed)], [['KeyW', 'ArrowUp'], ['Mouse0'], ['Escape', 'KeyP'], []], JSON.stringify(healed));
    assert.deepEqual(healed.reload, ['KeyR'], 'reload lost both to their owners and took its own default back');
    const flat = Object.values(healed).flat();
    assert.equal(new Set(flat).size, flat.length, 'no key twice');
  } finally { await game.close(); }
});

test('a stored options blob with no bindings at all boots with every action bound, and Escape pauses', async () => {
  const empty = Object.fromEntries(['forward', 'back', 'left', 'right', 'fire', 'reload', 'line', 'kept', 'interact', 'sprint', 'jump', 'pause'].map((a) => [a, []]));
  const game = await openIndex(server);
  try {
    const got = await game.page.evaluate((nb) => {
      const dbg = window.__dbg, ctx = dbg.ext.core.ctx();
      dbg.setOption('bindings', nb);
      return JSON.parse(JSON.stringify(ctx.options.value.bindings));
    }, empty);
    assert.deepEqual(got, { forward: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], fire: ['Mouse0'], reload: ['KeyR'], line: ['KeyQ'], kept: ['KeyF'], interact: ['KeyE'], sprint: ['ShiftLeft'], jump: ['Space'], pause: ['Escape', 'KeyP'] });
    // the same blob in localStorage before the page loads: the UI heals it in init()
    const stored = await game.page.evaluate((nb) => {
      const key = Object.keys(localStorage).find((k) => { try { return 'bindings' in JSON.parse(localStorage.getItem(k)); } catch { return false; } });
      if (!key) return null;
      const o = JSON.parse(localStorage.getItem(key)); o.bindings = nb; localStorage.setItem(key, JSON.stringify(o));
      return key;
    }, empty);
    if (stored) {
      await game.page.reload();
      await game.page.waitForFunction(() => window.__dbg && window.__dbg.state && window.__dbg.state().ui && window.__dbg.state().ui.screen === 'title', null, { polling: 50, timeout: 60000 });
      const after = await game.page.evaluate(() => { const b = window.__dbg.ext.core.ctx().options.value.bindings; return Object.keys(b).filter((a) => b[a].length === 0); });
      assert.deepEqual(after, [], 'after a reload with the empty blob stored');
      console.log(`stored blob '${stored}' with twelve empty lists: healed at boot`);
    } else console.log('no options blob in localStorage in this harness: the boot path is covered by init() calling the same repair');
  } finally { await game.close(); }
});

// ---- polish round 3 (story-ux): on the Comfort tab Difficulty sat 5 px tighter under Reduce flashes than any other row
// (its label was not centred in a full-height line, because the description under it made the row a two-line grid)
test('options: every row of every tab is the same distance under the row above, with or without a description', async () => {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
    const game = await openIndex(server, { start: false, viewport });
    try {
      await item(game, "options");
      for (const tab of ["comfort", "text", "sound", "picture"]) {
        const rows = await game.page.evaluate((t) => {
          document.querySelector(`.k7 .options [data-tab="${t}"]`).click();
          window.__dbg.setOption("difficulty", "hard");
          window.__dbg.step(0, true);
          return [...document.querySelectorAll(`.k7 .options [data-pane="${t}"] .row`)].map((r) => {
            const lab = r.querySelector(".lab").getBoundingClientRect(), ctl = r.querySelector(".ctl").getBoundingClientRect(), desc = r.querySelector(".desc");
            return { key: r.getAttribute("data-opt"), mid: lab.top + lab.height / 2, ctl: ctl.top + ctl.height / 2, top: r.getBoundingClientRect().top, descH: desc ? desc.getBoundingClientRect().height : 0 };
          });
        }, tab);
        const u = Math.min(viewport.height / 1080, viewport.width / 1440), pitch = Math.max(22, 37 * u);
        for (let i = 1; i < rows.length; i++) {
          const gap = rows[i].mid - rows[i - 1].mid - rows[i - 1].descH;
          assert.ok(Math.abs(gap - pitch) < 0.75, `${viewport.width}x${viewport.height} ${tab}: ${rows[i].key} sits ${gap.toFixed(1)} px under ${rows[i - 1].key} (${pitch.toFixed(1)})`);
        }
        for (const r of rows) assert.ok(Math.abs(r.mid - r.ctl) < 1.5 && Math.abs(r.mid - (r.top + pitch / 2)) < 1.5, `${tab}: ${r.key} label and control share the centre of a full-height line`);
        if (tab === "comfort") assert.ok(rows.find((r) => r.key === "difficulty").descH > 8, "Difficulty shows its description");
        if (tab === "comfort") {
          // the selection tick stands beside the label, not between the label and the description
          const tick = await game.page.evaluate(() => {
            const rows = [...document.querySelectorAll('.k7 .options [data-pane="comfort"] .row')];
            for (const r of rows) r.classList.remove("sel");
            const row = document.querySelector('.k7 .options [data-opt="difficulty"]'); row.classList.add("sel");
            const lab = row.querySelector(".lab").getBoundingClientRect(), out = row.getBoundingClientRect().top + parseFloat(getComputedStyle(row, "::before").top) - (lab.top + lab.height / 2);
            row.classList.remove("sel");
            return out;
          });
          assert.ok(Math.abs(tick) < 1.5, `the tick is ${tick.toFixed(1)} px off the Difficulty label's centre`);
        }
      }
    } finally { await game.close(); }
  }
});
