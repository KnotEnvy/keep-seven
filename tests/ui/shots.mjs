// Evidence for docs/workorders/code-ui.md 7.2: every HUD state and every screen at 1280 x 720 and 1920 x 1080, written to
// shots/code-ui/. Run: node tests/ui/shots.mjs   (not a test; the images are for eyes)
// Full frames are named <what>_<720|1080>.png; small HUD states are cut out of the frame, enlarged x2 at 720p, and
// laid side by side on one sheet per group (hud_seventh, hud_markers, hud_arcs, hud_health, hud_boss, hud_prompts, hud_cards).
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { SHOTS, STORY, freeze, frame, openSandbox, press, serve } from './util.mjs';

const server = await serve();
const written = [];
const hit = (outcome) => ({ x: 0, y: 0, z: 0, shotId: 7, order: 0, ammo: 'lead_round', outcome, entityId: 'bider#1', entityKind: 'bider', part: 'body', surface: 'cloth', nx: 0, ny: 1, nz: 0, damage: 50, ricochetX: 0, ricochetY: 0, ricochetZ: 0 });

/** tiles (PNG buffers) in rows of `perRow`, on ink, each scaled by an integer factor */
function sheet(name, tiles, perRow = tiles.length, scale = 1) {
  const pngs = tiles.map((b) => PNG.sync.read(b));
  const w = Math.max(...pngs.map((p) => p.width)) * scale, h = Math.max(...pngs.map((p) => p.height)) * scale, gap = 6;
  const rows = Math.ceil(pngs.length / perRow);
  const out = new PNG({ width: perRow * (w + gap) + gap, height: rows * (h + gap) + gap });
  for (let i = 0; i < out.data.length; i += 4) { out.data[i] = 20; out.data[i + 1] = 17; out.data[i + 2] = 15; out.data[i + 3] = 255; }
  pngs.forEach((p, n) => {
    const ox = gap + (n % perRow) * (w + gap), oy = gap + Math.floor(n / perRow) * (h + gap);
    for (let y = 0; y < p.height * scale; y++) for (let x = 0; x < p.width * scale; x++) {
      const s = (Math.floor(y / scale) * p.width + Math.floor(x / scale)) * 4, d = ((oy + y) * out.width + ox + x) * 4;
      out.data[d] = p.data[s]; out.data[d + 1] = p.data[s + 1]; out.data[d + 2] = p.data[s + 2]; out.data[d + 3] = 255;
    }
  });
  const file = path.join(SHOTS, name + '.png');
  fs.writeFileSync(file, PNG.sync.write(out));
  written.push(name);
}

for (const [suffix, viewport] of [['720', { width: 1280, height: 720 }], ['1080', { width: 1920, height: 1080 }]]) {
  const game = await openSandbox(server, { viewport, allowErrors: false });
  const page = game.page;
  const u = viewport.height / 1080, zoom = suffix === '720' ? 2 : 1;
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const dbgEmit = (name, payload) => ev(([n, p]) => { window.__dbg.emit(n, p); window.__dbg.step(0, true); }, [name, payload]);
  const full = async (name) => { await page.screenshot({ path: path.join(SHOTS, `${name}_${suffix}.png`) }); written.push(`${name}_${suffix}`); };
  const cut = (box) => page.screenshot({ clip: { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.w), height: Math.round(box.h) } });
  /** finish the fades (CSS transitions); keyframe animations keep running */
  const settle = () => ev(() => { for (const a of document.getAnimations()) { if (a instanceof CSSTransition) a.finish(); } });
  /** finish everything that ends (the death fade, the ledger rows) */
  const finish = () => ev(() => { for (const a of document.getAnimations()) { try { a.finish(); } catch { /* an endless one */ } } });
  const W = viewport.width, H = viewport.height;
  // the mark keeps a legibility floor under 1080p (src/ui/mark.ts MARK_MIN_SCALE): cut by its own unit
  const mk = Math.max(u, 1.08);
  const MARK = { x: W - 40 * u - 104 * mk, y: H - 30 * u - 126 * mk, w: 104 * mk + 36 * u, h: 126 * mk + 26 * u };
  const CENTRE = { x: W / 2 - 80 * u, y: H / 2 - 80 * u, w: 160 * u, h: 160 * u };
  const HEALTH = { x: 20 * u, y: H - 80 * u, w: 200 * u, h: 60 * u };
  const BOSS = { x: W / 2 - 200 * u, y: 24 * u, w: 400 * u, h: 70 * u };
  const LOWER = { x: W / 2 - 420 * u, y: H * 0.55, w: 840 * u, h: H * 0.16 };
  const CARD = { x: W / 2 - 330 * u, y: H * 0.24, w: 660 * u, h: H * 0.26 };
  const TALK = { x: W / 2 - 560 * u, y: H * 0.70, w: 1120 * u, h: H * 0.25 };
  const bg = (name) => ev((n) => window.__dbg.ext.uisb.backdrop(n), name);

  // ------------------------------------------------------------------ the HUD
  await press(game, 'state/full cylinder');
  await frame(game, 130);
  await full('hud_idle');

  // ring: six shots (each settled), then mid-turn, then a reload, a line round, the kept round
  let tiles = [await cut(MARK)];
  for (let i = 0; i < 6; i++) { await ev(() => { window.__dbg.ext.uisb.fire(); window.__dbg.step(20, true); }); tiles.push(await cut(MARK)); }
  await ev(() => { window.__dbg.ext.uisb.weapon(['lead', 'lead', 'lead', 'lead', 'empty', 'empty'], 14, 0); window.__dbg.step(20, true); window.__dbg.ext.uisb.fire(); window.__dbg.step(1, true); });
  await freeze(game, 210); tiles.push(await cut(MARK));                       // half way through the turn
  await ev(() => { for (const a of document.getAnimations()) a.play(); window.__dbg.step(20, true); });
  for (let i = 0; i < 3; i++) { await ev(() => { window.__dbg.ext.uisb.reloadRound(); window.__dbg.step(2, true); }); tiles.push(await cut(MARK)); }
  await press(game, 'ring/line round'); await press(game, 'ring/line pips 2'); await frame(game, 1); tiles.push(await cut(MARK));
  sheet(`hud_ring_${suffix}`, tiles, 6, zoom);

  // the seventh: six states, then the shiver frozen mid-way, then the reduced-motion blink
  tiles = [];
  await press(game, 'state/full cylinder');
  for (const s of ['sealed', 'pulse', 'band_broken', 'chambered', 'spent', 'violet']) {
    if (s === 'chambered') await press(game, 'ring/kept chambered'); else { if (s === 'spent') await press(game, 'state/full cylinder'); await press(game, 'seventh/' + s); }
    await frame(game, 1); await freeze(game, 1000); tiles.push(await cut(MARK));
    await ev(() => { for (const a of document.getAnimations()) a.play(); });
  }
  await press(game, 'seventh/sealed'); await press(game, 'seventh/denied (shiver)'); await freeze(game, 36); tiles.push(await cut(MARK));
  await ev(() => { for (const a of document.getAnimations()) a.play(); });
  await frame(game, 30);
  sheet(`hud_seventh_${suffix}`, tiles, 7, zoom);

  // crosshair: the four ticks, the plumb glyph, the plumb glyph with a legal aim; then the five markers; reduced flashes
  tiles = [await cut(CENTRE)];
  await press(game, 'ring/kept chambered'); await frame(game, 1); tiles.push(await cut(CENTRE));
  await ev(() => { window.__dbg.ext.uisb.legal(true); window.__dbg.step(0, true); getComputedStyle(document.querySelector('.k7 .xh .plumb')).transform; }); await settle(); tiles.push(await cut(CENTRE));
  await ev(() => { window.__dbg.ext.uisb.legal(false); }); await press(game, 'state/full cylinder'); await press(game, 'seventh/sealed'); await frame(game, 1);
  for (const o of ['hit', 'weak', 'kill', 'freed', 'deflected']) { await dbgEmit('combat/hit', hit(o)); await freeze(game, 80); tiles.push(await cut(CENTRE)); await ev(() => { for (const a of document.getAnimations()) a.play(); window.__dbg.step(12, true); }); }
  await ev(() => window.__dbg.setOption('reduceFlashes', true));
  for (const o of ['hit', 'weak', 'kill', 'freed', 'deflected']) { await dbgEmit('combat/hit', hit(o)); tiles.push(await cut(CENTRE)); await frame(game, 12); }
  await ev(() => window.__dbg.setOption('reduceFlashes', false));
  sheet(`hud_markers_${suffix}`, tiles, 8, zoom);

  // the damage arc from eight directions
  tiles = [];
  for (let d = 0; d < 360; d += 45) { await ev((deg) => { window.__dbg.ext.uisb.arc(deg); window.__dbg.step(0, true); }, d); await freeze(game, 100); tiles.push(await cut(CENTRE)); await ev(() => { for (const a of document.getAnimations()) a.play(); window.__dbg.step(40, true); }); }
  sheet(`hud_arcs_${suffix}`, tiles, 8, zoom);

  // health: full, 80, 50, 50 regenerating, 20, and the outline flash of a hit
  tiles = [];
  for (const hp of [100, 80, 50]) { await press(game, 'health/hp ' + hp); await frame(game, 1); tiles.push(await cut(HEALTH)); }
  await press(game, 'health/regen on'); await frame(game, 1); tiles.push(await cut(HEALTH));
  await press(game, 'health/regen off'); await press(game, 'health/hp 20'); await frame(game, 1); tiles.push(await cut(HEALTH));
  await dbgEmit('player/damaged', { amount: 10, health: 20, kind: 'lunge', source: 'bider', fromX: 0, fromY: 0, fromZ: 0, graceUsed: false }); await freeze(game, 60); tiles.push(await cut(HEALTH));
  await ev(() => { for (const a of document.getAnimations()) a.play(); window.__dbg.setHealth(100); window.__dbg.step(40, true); });
  sheet(`hud_health_${suffix}`, tiles, 6, zoom);

  // boss: 26, 17, 6, 0, then 3a with two relit, then 3b in bone
  tiles = [];
  await press(game, 'boss/p1'); await frame(game, 1); tiles.push(await cut(BOSS));
  for (const n of [17, 6, 0]) { await ev((p) => { window.__dbg.ext.enemies.setBoss({ pips: p }); window.__dbg.step(0, true); }, n); tiles.push(await cut(BOSS)); }
  await press(game, 'boss/p3a'); await ev(() => { window.__dbg.ext.enemies.setBoss({ pips: 2 }); window.__dbg.step(0, true); }); tiles.push(await cut(BOSS));
  await press(game, 'boss/p3b'); await frame(game, 1); tiles.push(await cut(BOSS));
  await press(game, 'boss/idle'); await frame(game, 1);
  sheet(`hud_boss_${suffix}`, tiles, 3, zoom);

  // prompts and hints
  tiles = [];
  for (const k of ['read', 'take', 'use', 'kept']) { await press(game, 'prompt/' + k); await frame(game, 0); await settle(); tiles.push(await cut(LOWER)); }
  await press(game, 'prompt/clear');
  for (const k of ['move', 'fire', 'reload', 'sprint', 'interact', 'line', 't3 kept']) { await press(game, 'hint/' + k); await frame(game, 0); await settle(); tiles.push(await cut(LOWER)); }
  await press(game, 'hint/clear'); await settle();
  sheet(`hud_prompts_${suffix}`, tiles, 3, 1);

  // cards and the checkpoint notice
  tiles = [];
  for (const k of ['title', 'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii']) { await press(game, 'card/' + k); await frame(game, 0); await settle(); tiles.push(await cut(CARD)); }
  sheet(`hud_cards_${suffix}`, tiles, 4, 1);
  await frame(game, 300);

  // subtitles: each speaker at M; the longest narrator and station lines at S, L, XL; backing 0 and 100; captions
  tiles = [];
  await press(game, 'caption/caption');
  for (const who of ['narrator', 'station', 'reeve']) { await press(game, 'subtitle/' + who); await frame(game, 0); tiles.push(await cut(TALK)); }
  for (const size of ['S', 'L', 'XL']) for (const who of ['narrator long', 'station long']) { await press(game, 'subtitle/size ' + size); await press(game, 'subtitle/' + who); await press(game, 'caption/caption 2'); await frame(game, 0); tiles.push(await cut(TALK)); }
  await press(game, 'subtitle/size M'); await press(game, 'subtitle/narrator long');
  for (const b of [0, 100]) { await press(game, 'subtitle/backing ' + b); await frame(game, 0); tiles.push(await cut(TALK)); }
  await press(game, 'subtitle/backing 60'); await press(game, 'subtitle/end'); await frame(game, 130);
  sheet(`hud_subtitles_${suffix}`, tiles, 2, 1);

  // the whole HUD at work, over the brightest and the darkest frame
  for (const name of ['glare', 'dark']) {
    await bg(name);
    await press(game, 'state/full cylinder'); await press(game, 'health/hp 50'); await press(game, 'health/regen on'); await press(game, 'boss/p2');
    await ev(() => { const d = window.__dbg; d.ext.uisb.fire(); d.step(20, true); d.ext.uisb.fire(); d.step(20, true); });
    await press(game, 'ring/line round'); await press(game, 'subtitle/narrator long'); await press(game, 'caption/caption'); await press(game, 'prompt/read'); await press(game, 'hint/reload'); await press(game, 'checkpoint/saved');
    await dbgEmit('combat/hit', hit('weak')); await ev(() => { window.__dbg.ext.uisb.arc(135); window.__dbg.step(0, true); });
    await freeze(game, 100); await settle();
    if (suffix === '1080') { await page.screenshot({ path: path.join(SHOTS, `hud_over_${name}.png`) }); written.push(`hud_over_${name}`); }
    await full(`hud_over_${name}`);
    await ev(() => { for (const a of document.getAnimations()) a.play(); });
    await press(game, 'subtitle/station'); await frame(game, 0); await settle();
    await full(`hud_station_over_${name}`);
    await press(game, 'subtitle/end'); await press(game, 'prompt/clear'); await press(game, 'hint/clear'); await press(game, 'boss/idle'); await press(game, 'health/regen off'); await press(game, 'health/hp 100');
    await frame(game, 140);
  }
  await bg('mid');
  await press(game, 'card/iv'); await frame(game, 0); await settle(); await full('card_movement');
  await frame(game, 260);

  // ------------------------------------------------------------------ the screens
  for (const [button, name] of [['screen/title (save)', 'title_with_save'], ['screen/title (no save)', 'title_no_save'], ['screen/story', 'story'], ['screen/credits', 'credits']]) { await press(game, button); await frame(game, 0); await full(name); }
  await press(game, 'screen/options (title)'); await frame(game, 0); await full('options_controls');
  for (const tab of ['comfort', 'text', 'sound', 'picture']) { await ev((t) => document.querySelector(`.k7 .options [data-tab="${t}"]`).click(), tab); await full('options_' + tab); }
  await ev(() => { document.querySelector('.k7 .options [data-tab="controls"]').click(); document.querySelector('.k7 .options [data-action="reload"] [data-slot="0"]').click(); });
  await full('options_rebinding');
  await page.keyboard.press('KeyG'); await full('options_rebound');
  await ev(() => window.__dbg.ext.core.ctx().options.reset());
  await press(game, 'state/play'); await press(game, 'state/full cylinder'); await ev(() => { const d = window.__dbg; d.ext.uisb.fire(); d.step(20, true); d.ext.uisb.fire(); d.step(20, true); }); await press(game, 'ring/line round');
  await press(game, 'screen/pause'); await frame(game, 0); await full('pause');
  for (const s of ['band_broken', 'spent', 'violet']) { await press(game, 'state/play'); await press(game, 'seventh/' + s); await press(game, 'screen/pause'); await frame(game, 0); await full('pause_seventh_' + s); }
  await press(game, 'state/play'); await press(game, 'seventh/sealed');
  await press(game, 'screen/options (pause)'); await frame(game, 0); await full('options_from_pause');
  await press(game, 'screen/click to resume'); await frame(game, 0); await full('click_to_resume');
  for (const [key, r] of Object.entries(STORY.readables)) {
    await press(game, 'readable/' + key.replace('rd_', ''));
    const cards = r.body.split('\n\n').length;
    for (let i = 0; i < cards; i++) { await frame(game, 0); await full(`readable_${key.replace('rd_', '')}${cards > 1 ? '_' + (i + 1) : ''}`); if (i < cards - 1) await page.keyboard.press('KeyE'); }
  }
  await press(game, 'screen/death'); await frame(game, 0); await freeze(game, 300); await full('death_fading');
  await finish(); await full('death');
  await ev(() => window.__dbg.ext.core.stepAsync(130, true));
  await press(game, 'screen/loading'); await frame(game, 0); await full('loading');
  await press(game, 'screen/end (9 lamps)'); await frame(game, 0); await freeze(game, 2200); await full('end_rows_lighting');
  await finish(); await full('end_9_lamps');
  await press(game, 'screen/end (48 lamps, his)'); await frame(game, 0); await finish(); await full('end_48_lamps_his');
  // reduced motion: the cards cut, the death screen cuts, the end ledger is all there at once
  await press(game, 'state/play'); await press(game, 'variant/reduce motion');
  await press(game, 'card/vii'); await press(game, 'seventh/pulse'); await press(game, 'seventh/denied (shiver)'); await frame(game, 0); await full('reduced_motion_card_and_shiver');
  await press(game, 'screen/end (9 lamps)'); await frame(game, 0); await full('reduced_motion_end');
  await game.close();
}

// ---- the load-bearing glyph at the Low tier's own size: the HUD mark cut from a native 1280 x 720 frame, each state
// over the glare and over the dark, enlarged x6 with no smoothing (what the pixels are, not what a zoom makes of them)
{
  const tiles = [];
  for (const bgName of ['glare', 'dark']) {
    const game = await openSandbox(server, { viewport: { width: 1280, height: 720 }, query: { bg: bgName } });
    const mk = 1.08, u = 720 / 1080;
    const box = { x: Math.round(1280 - 40 * u - 104 * mk), y: Math.round(720 - 30 * u - 126 * mk), width: Math.round(104 * mk + 36 * u), height: Math.round(126 * mk + 26 * u) };
    await press(game, 'state/full cylinder');
    for (const s of ['sealed', 'pulse', 'band_broken', 'chambered', 'spent', 'violet']) {
      if (s === 'chambered') await press(game, 'ring/kept chambered'); else { await press(game, 'state/full cylinder'); await press(game, 'seventh/' + s); }
      await frame(game, 1); await freeze(game, 1000);
      tiles.push(await game.page.screenshot({ clip: box }));
    }
    await game.close();
  }
  sheet('seventh_states_720', tiles, 6, 6);
}

// ---- the two sheets of 7.2: all six states of the seventh enlarged, and the HUD glyph beside the Pellam mark
for (const [scene, name] of [['seventh', 'seventh_states'], ['mark', 'mark_compare']]) {
  const game = await openSandbox(server, { viewport: { width: 1600, height: 620 }, query: { scene } });
  await game.page.evaluate(() => { for (const a of document.getAnimations()) { a.pause(); a.currentTime = 1000; } });
  await game.page.screenshot({ path: path.join(SHOTS, name + '.png') });
  written.push(name);
  await game.close();
}
// ---- 4:3 and 21:9: the busy HUD, the pause screen, the options
for (const [name, viewport] of [['4x3', { width: 960, height: 720 }], ['21x9', { width: 2520, height: 1080 }]]) {
  const game = await openSandbox(server, { viewport, query: { bg: 'dark' } });
  for (const b of ['state/full cylinder', 'health/hp 50', 'boss/p2', 'ring/fire', 'ring/line round', 'subtitle/size XL', 'subtitle/station long', 'caption/caption', 'prompt/read', 'hint/line', 'checkpoint/saved']) await press(game, b);
  await frame(game, 20);
  await game.page.evaluate(() => { for (const a of document.getAnimations()) { if (a instanceof CSSTransition) a.finish(); } });
  await game.page.screenshot({ path: path.join(SHOTS, `aspect_${name}_hud.png`) }); written.push(`aspect_${name}_hud`);
  await press(game, 'screen/pause'); await frame(game, 0);
  await game.page.screenshot({ path: path.join(SHOTS, `aspect_${name}_pause.png`) }); written.push(`aspect_${name}_pause`);
  await press(game, 'screen/options (pause)'); await frame(game, 0);
  await game.page.screenshot({ path: path.join(SHOTS, `aspect_${name}_options.png`) }); written.push(`aspect_${name}_options`);
  await game.close();
}
await server.close();
console.log(`${written.length} images in shots/code-ui/:\n` + written.join(' '));
