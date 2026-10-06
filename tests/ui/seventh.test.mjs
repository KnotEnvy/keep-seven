// The seventh (docs/workorders/code-ui.md 6): the load-bearing glyph. Visible on the first HUD frame, apart from the
// ring and joined to it by the hairline, six distinct states, the 0.3 s shiver, `spent` for good, the pause label.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { PIECE, STORY, clip, diff, frame, freeze, openIndex, openSandbox, press, serve } from './util.mjs';

let server;
before(async () => { server = await serve(); });
after(async () => { await server.close(); });

// polish round 3 (story-ux): the floor rose from 0.864 to 1.08 (76 x 111 px with 8.6 px dots was lost in the bright street)
const MARK_MIN_SCALE = 1.08;
// the pause screen's enlarged mark keeps its own size: three viewport units, floored at 3 x 0.864 (src/ui/mark.ts)
const MARK_BIG_MIN_SCALE = 0.864 * 3;
const bigScale = (vw, vh) => Math.max(3 * Math.min(vh / 1080, vw / 1440), MARK_BIG_MIN_SCALE);
const STATES = ['sealed', 'pulse', 'band_broken', 'chambered', 'spent', 'violet'];
const HUD_SEVENTH = '.k7 .hud .mark [data-part="seventh"]';
const setSeventh = (game, state) => game.page.evaluate((s) => { window.__dbg.ext.core.setSeventh(s); window.__dbg.step(0, true); }, state);

test('the seventh is on the first frame of the HUD, sealed, and the title screen shows no HUD', async () => {
  const game = await openIndex(server, { start: false });
  try {
    const title = await game.page.evaluate(() => ({
      hud: getComputedStyle(document.querySelector('.k7 .hud')).visibility,
      screen: window.__dbg.state().ui.screen,
    }));
    assert.deepEqual(title, { hud: 'hidden', screen: 'title' });
    // into the run: NO tick and no frame is stepped after control is given
    await game.page.evaluate(() => window.__dbg.start());
    const first = await game.page.evaluate((sel) => {
      const sv = document.querySelector(sel), r = sv.getBoundingClientRect();
      const cs = getComputedStyle(sv), hud = getComputedStyle(document.querySelector('.k7 .hud'));
      const band = getComputedStyle(sv.querySelector('.sb'));
      return { tick: window.__dbg.state().tick, cls: sv.getAttribute('class'), w: r.width, h: r.height, visibility: cs.visibility, display: cs.display, opacity: cs.opacity, hud: hud.visibility + ' ' + hud.opacity, band: band.display + ' ' + band.fill, inView: r.left >= 0 && r.bottom <= innerHeight && r.right < innerWidth / 4 && r.top > innerHeight / 2 };
    }, HUD_SEVENTH);
    assert.equal(first.cls, 'sv sealed');
    assert.ok(first.w > 4 && first.h > 10, `it has a size (${first.w} x ${first.h})`);
    assert.equal(first.visibility, 'visible');
    assert.notEqual(first.display, 'none');
    assert.equal(first.opacity, '1');
    assert.equal(first.hud, 'visible 1');
    assert.equal(first.band, 'inline rgb(233, 226, 208)', 'the band is whole and bone');
    // polish round 5: the mark stands lower LEFT, clear of the revolver and its hands
    assert.ok(first.inView, 'bottom left, inside the frame');
  } finally { await game.close(); }
});

test('the seventh is apart from the ring: the boxes do not meet, and the hairline joins the ring centre to it', async () => {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }, { width: 960, height: 720 }, { width: 1680, height: 720 }]) {
    const game = await openIndex(server, { viewport });
    try {
      await frame(game, 1);
      const g = await game.page.evaluate(() => {
        const box = (sel) => { const r = document.querySelector('.k7 .hud .mark ' + sel).getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
        const chambers = [...document.querySelectorAll('.k7 .hud .mark .ch')].map((c) => { const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
        const cx = chambers.reduce((s, c) => s + c.x, 0) / 6, cy = chambers.reduce((s, c) => s + c.y, 0) / 6;
        const hair = document.querySelector('.k7 .hud .mark [data-part="hairline"]');
        const hs = getComputedStyle(hair);
        return {
          ring: box('[data-part="ring"]'), seventh: box('[data-part="seventh"]'), hair: box('[data-part="hairline"]'), cx, cy, chambers: chambers.length,
          hairShown: hs.display !== 'none' && hs.visibility === 'visible' && hs.stroke, u: innerHeight / 1080, sameParent: document.querySelector('.k7 .hud .mark [data-part="seventh"]').closest('[data-part="ring"]') === null,
        };
      });
      const { ring, seventh, hair } = g;
      const meets = !(seventh.l >= ring.r || seventh.r <= ring.l || seventh.t >= ring.b || seventh.b <= ring.t);
      assert.equal(meets, false, `${viewport.width}x${viewport.height}: the seventh's box ${JSON.stringify(seventh)} is clear of the ring's ${JSON.stringify(ring)}`);
      assert.ok(g.sameParent, 'the seventh is not a child of the ring');
      assert.equal(g.chambers, 6, 'six chambers, not seven');
      assert.ok(seventh.l > g.cx && seventh.t > g.cy, 'lower right of the ring');
      // 20 px (at 1080p) from the ring's edge to the cartridge
      // the mark's own unit: the viewport's, down to the legibility floor (src/ui/mark.ts MARK_MIN_SCALE)
      const u = Math.max(Math.min(viewport.height / 1080, viewport.width / 1440), MARK_MIN_SCALE);
      const nearest = Math.hypot(seventh.l - g.cx, seventh.t - g.cy) - 32 * u;
      assert.ok(Math.abs(nearest - 20 * u) < 2.5 * u, `gap ${(nearest / u).toFixed(1)} px at 1080p (20)`);
      // polish round 5: the cartridge is drawn at twice the art bible's 9 x 22 (18 x 44 at 1080p, plus its strokes; it was 1.5 times)
      assert.ok(Math.abs(seventh.w - 18 * u) < 3.5 * u && Math.abs(seventh.h - 44 * u) < 3.5 * u, `18 x 44 at 1080p: ${(seventh.w / u).toFixed(1)} x ${(seventh.h / u).toFixed(1)}`);
      // the hairline starts at the ring's centre and ends on the cartridge
      assert.equal(g.hairShown, 'rgb(233, 226, 208)');
      assert.ok(Math.abs(hair.l - g.cx) < 1.5 && Math.abs(hair.t - g.cy) < 1.5, 'the hairline starts at the centre of the ring');
      assert.ok(hair.b >= seventh.t - 1.5 && hair.r >= seventh.l && hair.r <= seventh.r, 'and ends on the nose of the seventh');
    } finally { await game.close(); }
  }
});

test('each of the six states draws differently, at the slot itself (pixel difference between every pair)', async () => {
  const game = await openIndex(server, { viewport: { width: 1920, height: 1080 } });
  try {
    const files = {};
    const cls = {};
    for (const s of STATES) {
      await setSeventh(game, s);
      await freeze(game, 1000);                                   // `pulse` breathes: hold it at its widest
      files[s] = await clip(game, HUD_SEVENTH, 'test_seventh_' + s, 6);
      cls[s] = await game.page.evaluate((sel) => document.querySelector(sel).getAttribute('class'), HUD_SEVENTH);
      assert.equal(cls[s], 'sv ' + s);
    }
    const table = [];
    for (let i = 0; i < STATES.length; i++) for (let j = i + 1; j < STATES.length; j++) {
      const d = diff(files[STATES[i]], files[STATES[j]]);
      table.push(`${STATES[i]}/${STATES[j]} ${d}`);
      assert.ok(d > 0, `${STATES[i]} and ${STATES[j]} look the same`);
    }
    console.log('seventh: differing pixels per pair (29 x 42 clip at 1080p): ' + table.join(', '));
    // violet is the only violet in the UI, and only here
    const violet = await game.page.evaluate(() => [...document.querySelectorAll('.k7 *')].filter((e) => getComputedStyle(e).fill === 'rgb(178, 75, 255)' && getComputedStyle(e).display !== 'none').map((e) => e.getAttribute('class')));
    assert.deepEqual(violet, ['sb']);
    // whatever the state, the slot is never hidden
    for (const s of STATES) {
      await setSeventh(game, s);
      const shown = await game.page.evaluate((sel) => { const e = document.querySelector(sel), c = getComputedStyle(e), o = getComputedStyle(e.querySelector('.so:not(.ink)')); return c.display !== 'none' && c.visibility === 'visible' && Number(c.opacity) >= 0.5 && o.display !== 'none' && Number(o.opacity) > 0.3; }, HUD_SEVENTH);
      assert.ok(shown, `${s}: the slot is drawn`);
    }
  } finally { await game.close(); }
});

test('`weapon/kept { denied }` shivers the seventh for 0.3 s; with reduce motion it only blinks', async () => {
  const game = await openIndex(server);
  try {
    await frame(game, 1);
    const shiver = () => game.page.evaluate(() => { const w = document.querySelector('.k7 .hud .mark .svw'); return { on: w.classList.contains('shiver'), anim: getComputedStyle(w).animationName, dur: getComputedStyle(w).animationDuration }; });
    assert.equal((await shiver()).on, false);
    await game.page.evaluate(() => window.__dbg.emit('weapon/kept', { stage: 'denied', mark: '' }));
    let s = await shiver();
    assert.deepEqual(s, { on: true, anim: 'k7-shiver', dur: '0.3s' });
    await frame(game, 17);
    assert.equal((await shiver()).on, true, 'still shivering at 0.283 s');
    await frame(game, 1);
    assert.equal((await shiver()).on, false, 'done at 0.3 s');
    // other stages do not shiver
    for (const stage of ['loading', 'chambered', 'unloaded', 'fired']) {
      await game.page.evaluate((st) => window.__dbg.emit('weapon/kept', { stage: st, mark: '' }), stage);
      assert.equal((await shiver()).on, false, stage);
    }
    await game.page.evaluate(() => { window.__dbg.setOption('reduceMotion', true); window.__dbg.emit('weapon/kept', { stage: 'denied', mark: '' }); });
    s = await shiver();
    assert.equal(s.on, true);
    assert.equal(s.anim, 'k7-blink', 'reduce motion: an opacity blink, no movement');
  } finally { await game.close(); }
});

test('`spent` stays for the rest of the game; the pause screen names each state with the right ui_seventh_* string', async () => {
  const game = await openIndex(server);
  try {
    const cls = () => game.page.evaluate((sel) => document.querySelector(sel).getAttribute('class'), HUD_SEVENTH);
    await setSeventh(game, 'spent');
    assert.equal(await cls(), 'sv spent');
    await game.run([{ tap: 'fire', steps: 40 }, { tap: 'fire', steps: 40 }, { steps: 600 }]);
    await game.page.evaluate(() => { window.__dbg.emit('weapon/kept', { stage: 'denied', mark: '' }); window.__dbg.emit('weapon/reload', { stage: 'round', chambered: 6, reserve: 10 }); });
    await frame(game, 30);
    await game.page.evaluate(() => { window.__dbg.pause(true); window.__dbg.step(3, true); window.__dbg.emit('ui/action', { action: 'resume' }); });
    await frame(game, 30);
    assert.equal(await cls(), 'sv spent', 'still spent after shots, a refused press, a reload, a pause and 700 ticks');
    const look = await game.page.evaluate((sel) => { const e = document.querySelector(sel), o = getComputedStyle(e.querySelector('.so:not(.ink)')); return { opacity: o.opacity, rim: getComputedStyle(e.querySelector('.sr')).opacity, ink: getComputedStyle(e.querySelector('.ink.so')).opacity, group: getComputedStyle(e).opacity, band: getComputedStyle(e.querySelector('.sb')).display, outline: o.display }; }, HUD_SEVENTH);
    // the bone outline at 50 %; the ink under it stays whole, so the spent case is not lost on a pale floor
    assert.deepEqual(look, { opacity: '0.5', rim: '0.5', ink: '1', group: '1', band: 'none', outline: 'inline' }, 'outline only, 50 %, no band');

    const want = { sealed: 'ui_seventh_sealed', pulse: 'ui_seventh_sealed', band_broken: 'ui_seventh_broken', chambered: 'ui_seventh_broken', spent: 'ui_seventh_spent', violet: 'ui_seventh_violet' };
    for (const s of STATES) {
      await setSeventh(game, s);
      const got = await game.page.evaluate(() => {
        window.__dbg.pause(true); window.__dbg.step(0, true);
        const out = {
          screen: window.__dbg.state().ui.screen, label: document.querySelector('.k7 .pause .sv-label').textContent,
          big: document.querySelector('.k7 .pause .mark.big [data-part="seventh"]').getAttribute('class'),
          bigW: document.querySelector('.k7 .pause .mark.big').getBoundingClientRect().width, hudW: document.querySelector('.k7 .hud .mark').getBoundingClientRect().width, vw: innerWidth, vh: innerHeight,
        };
        window.__dbg.emit('ui/action', { action: 'resume' }); window.__dbg.step(1, true);
        return out;
      });
      assert.equal(got.screen, 'pause');
      assert.equal(got.label, STORY.ui[want[s]], s);
      assert.equal(got.big, 'sv ' + s, 'the enlarged mark shows the same state');
      assert.ok(Math.abs(got.bigW - 88 * bigScale(got.vw, got.vh)) < 0.5 && got.bigW > 2 * got.hudW, `enlarged: ${got.bigW} px wide over a ${got.hudW} px HUD mark`);
    }
    assert.equal(PIECE, 'code-ui');
  } finally { await game.close(); }
});

// ---- the legibility floor (critic round 2: at 1280 x 720, the Low tier's target, the mark was 59 x 77 px with a 7 px
// numeral, 0.67 px strokes and a broken band three pixels away from a whole one)
const SB_MARK = '.k7 .hud .mark';
const SB_SEVENTH = SB_MARK + ' [data-part="seventh"]';
const sbSeventh = async (game, s) => {
  if (s === 'chambered') await press(game, 'ring/kept chambered');
  else { await press(game, 'state/full cylinder'); await press(game, 'seventh/' + s); }
  await frame(game, 1);
  await freeze(game, 1000);
};

test('at 1280 x 720 the mark holds its floor: 95 x 150 px, 10 px chamber dots, a 19 x 47 px seventh, a 16 px numeral, no stroke under a device pixel; enlarged on the pause screen', async () => {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1024, height: 768 }, { width: 1920, height: 1080 }, { width: 3840, height: 2160 }]) {
    const game = await openSandbox(server, { viewport });
    try {
      await press(game, 'state/full cylinder');
      await frame(game, 1);
      const m = await game.page.evaluate(([markSel, svSel]) => {
        const mark = document.querySelector(markSel), r = mark.getBoundingClientRect(), sv = document.querySelector(svSel).getBoundingClientRect();
        const scale = r.width / 88;
        const px = (sel) => { const cs = getComputedStyle(mark.querySelector(sel)); return [parseFloat(cs.strokeWidth), cs.vectorEffect]; };
        const rs = mark.querySelector('.rs'), dot = mark.querySelector('.ch').getBoundingClientRect();
        return {
          w: r.width, h: r.height, dot: dot.width, svW: sv.width, svH: sv.height, scale, numeral: parseFloat(getComputedStyle(rs).fontSize) * scale, numeralBox: rs.getBoundingClientRect().height,
          strokes: { outline: px('.sv .so:not(.ink)'), rim: px('.sv .sr'), hairline: px('.hair:not(.ink)'), notch: px('.notch:not(.ink)') },
          under: { outline: px('.sv .ink.so')[0], hairline: px('.ink.hair')[0], notch: px('.ink.notch')[0] },
          mki: parseFloat(getComputedStyle(mark).getPropertyValue('--mki')), inFrame: r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
        };
      }, [SB_MARK, SB_SEVENTH]);
      const u = Math.min(viewport.height / 1080, viewport.width / 1440), k = Math.max(u, MARK_MIN_SCALE), at = `${viewport.width}x${viewport.height}`;
      assert.ok(Math.abs(m.w - 88 * k) < 0.5 && Math.abs(m.h - 139 * k) < 0.5, `${at}: the mark is ${m.w} x ${m.h} (${88 * k} x ${139 * k})`);
      // polish round 3 (story-ux): 76 x 111 px with 8.6 px dots at 720p was easy to lose; 1.25 times that is the floor now
      assert.ok(m.w >= 94.9 && m.h >= 150, `${at}: never under 95 x 150 px (${m.w} x ${m.h})`);
      assert.ok(m.dot >= 10.5, `${at}: a chamber dot is ${m.dot.toFixed(1)} px (at least 10.5)`);
      // polish round 2 (story-ux): the load-bearing glyph was 8 x 19 px at 720p; it is 12 x 28 and more at every size
      // polish round 5 (story-ux): 15 x 36 px and a 13 px numeral at 720p were the smallest things on screen
      assert.ok(m.svW >= 19 && m.svH >= 47, `${at}: the seventh is ${m.svW.toFixed(1)} x ${m.svH.toFixed(1)} px (at least 19 x 47)`);
      assert.ok(m.numeral >= 16, `${at}: the reserve numeral is ${m.numeral.toFixed(1)} px (at least 16)`);
      for (const [name, [width, effect]] of Object.entries(m.strokes)) {
        assert.equal(effect, 'non-scaling-stroke', `${at}: ${name}`);
        assert.ok(width >= 1, `${at}: the ${name} stroke is ${width} px on screen (at least 1)`);
        assert.ok(Math.abs(width - Math.max(name === 'notch' ? 1.25 : 1, (name === 'notch' ? 1.5 : 1) * k)) < 0.01, `${at}: ${name} ${width} px follows the mark's scale above the floor`);
      }
      for (const [name, width] of Object.entries(m.under)) assert.ok(width >= m.strokes[name][0] + 1.6, `${at}: the ink under the ${name} shows on both sides (${width} px)`);
      assert.ok(Math.abs(m.mki - Math.max(1, 1 / k)) < 0.001, `${at}: --mki ${m.mki}`);
      assert.ok(m.inFrame, at);
      // the pause screen's mark: three viewport units a mark unit, its own floor (it does not grow with the HUD mark's)
      await press(game, 'screen/pause');
      await frame(game, 0);
      const big = await game.page.evaluate(() => {
        const b = document.querySelector('.k7 .pause .mark.big'), r = b.getBoundingClientRect(), label = document.querySelector('.k7 .pause .sv-label').getBoundingClientRect();
        return { w: r.width, stroke: parseFloat(getComputedStyle(b.querySelector('.sv .so:not(.ink)')).strokeWidth), bottom: label.bottom, right: r.right, H: innerHeight, W: innerWidth };
      });
      const bk = bigScale(viewport.width, viewport.height);
      assert.ok(Math.abs(big.w - 88 * bk) < 0.5 && Math.abs(big.stroke - bk) < 0.01 && big.w > 2 * m.w, `${at}: the enlarged mark ${big.w} px wide, stroke ${big.stroke} px`);
      assert.ok(big.bottom < big.H && big.right < big.W, `${at}: and it fits the pause screen with its label`);
    } finally { await game.close(); }
  }
});

test('at native 1280 x 720 the six states tell apart over the glare and over the dark; a broken band is not a whole one; the chambered slot is never a ghost', async () => {
  for (const bg of ['glare', 'dark']) {
    const game = await openSandbox(server, { viewport: { width: 1280, height: 720 }, query: { bg } });
    try {
      const files = {};
      for (const s of STATES) { await sbSeventh(game, s); files[s] = await clip(game, SB_SEVENTH, `test720_seventh_${bg}_${s}`, 4); }
      // the slot with nothing drawn in it: what `hidden` would look like
      await game.page.evaluate((sel) => { document.querySelector(sel).style.visibility = 'hidden'; }, SB_SEVENTH);
      const blank = await clip(game, SB_SEVENTH, `test720_seventh_${bg}_blank`, 4);
      await game.page.evaluate((sel) => { document.querySelector(sel).style.visibility = ''; }, SB_SEVENTH);
      const table = [];
      for (let i = 0; i < STATES.length; i++) for (let j = i + 1; j < STATES.length; j++) {
        const d = diff(files[STATES[i]], files[STATES[j]]);
        table.push(`${STATES[i]}/${STATES[j]} ${d}`);
        assert.ok(d >= 8, `${bg}: ${STATES[i]} and ${STATES[j]} differ by only ${d} pixels at 720p`);
      }
      const drawn = STATES.map((s) => `${s} ${diff(files[s], blank)}`);
      console.log(`seventh at native 1280 x 720 over ${bg}: differing pixels per pair: ${table.join(', ')}; against an empty slot: ${drawn.join(', ')}`);
      // the story's pay-off: the band breaking is a change of 30 pixels and more in a 16 x 27 clip, not of three
      assert.ok(diff(files.sealed, files.band_broken) >= 30, `${bg}: sealed / band_broken ${diff(files.sealed, files.band_broken)} px`);
      assert.ok(diff(files.band_broken, files.violet) >= 30, `${bg}: band_broken / violet`);
      // "it can never be hidden": the chambered slot (the round is in the ring) and the spent case still draw their outline
      assert.ok(diff(files.chambered, blank) >= 60, `${bg}: the chambered slot shows (${diff(files.chambered, blank)} px against an empty one)`);
      assert.ok(diff(files.spent, blank) >= 60, `${bg}: the spent case shows (${diff(files.spent, blank)} px)`);
      const look = await game.page.evaluate((sel) => { const sv = document.querySelector(sel); return { bone: Number(getComputedStyle(sv.querySelector('.so:not(.ink)')).opacity), ink: Number(getComputedStyle(sv.querySelector('.ink.so')).opacity), dash: getComputedStyle(sv.querySelector('.ink.so')).strokeDasharray }; }, SB_SEVENTH);
      assert.ok(look.bone >= 0.75 && look.ink >= 0.5 && look.dash === 'none', `chambered (still up): ${JSON.stringify(look)}`);
    } finally { await game.close(); }
  }
});

// (polish round 3: the floor of the mark is above one, so the kick is never under 2 px: it is 2 of the mark's own units)
test('the ring kick is at least 2 screen pixels and the shiver 1.6, at 720p as at 1080p (they are not shrunk with the mark)', async () => {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
    const game = await openSandbox(server, { viewport });
    try {
      await press(game, 'state/full cylinder');
      await frame(game, 1);
      const moved = await game.page.evaluate(() => {
        const d = window.__dbg, ring = document.querySelector('.k7 .hud .mark [data-part="ring"]'), svw = document.querySelector('.k7 .hud .mark .svw');
        // the notch does not turn with the chambers: its box moves only with the kick
        const notch = ring.querySelector('.notch:not(.ink)');
        const y0 = notch.getBoundingClientRect().top, x0 = svw.getBoundingClientRect().left;
        d.ext.uisb.fire();
        d.emit('weapon/kept', { stage: 'denied', mark: '' });
        const hold = (el, ms) => { for (const a of el.getAnimations()) { a.pause(); a.currentTime = ms; } };
        hold(ring, 35);                                           // 25 % of 0.14 s: the top of the kick
        hold(svw, 36);                                            // 12 % of 0.3 s: the first swing of the shiver
        return { kick: y0 - notch.getBoundingClientRect().top, shiver: x0 - svw.getBoundingClientRect().left, anims: ring.getAnimations().length + svw.getAnimations().length };
      });
      assert.equal(moved.anims, 2);
      assert.ok(Math.abs(moved.kick - 2 * Math.max(MARK_MIN_SCALE, viewport.height / 1080)) < 0.1, `${viewport.height}p: the kick is ${moved.kick.toFixed(2)} px`);
      assert.ok(Math.abs(moved.shiver - 1.6 * Math.max(MARK_MIN_SCALE, viewport.height / 1080)) < 0.1, `${viewport.height}p: the shiver swings ${moved.shiver.toFixed(2)} px`);
      // a window resized under a running game: the factor follows
      await game.page.setViewportSize({ width: 2560, height: 1440 });
      // (the resize event arrives with the next rendering opportunity: poll, do not sleep)
      await game.page.waitForFunction(() => innerHeight === 1440 && getComputedStyle(document.querySelector('.k7 .hud .mark')).getPropertyValue('--mki').trim() === '1', null, { polling: 50, timeout: 30000 });
    } finally { await game.close(); }
  }
});

test('pulse is a swing of brightness, not of half a pixel: dim bone to white on the outline and the band; reduce motion breathes', async () => {
  const game = await openSandbox(server, { viewport: { width: 1280, height: 720 } });
  try {
    await press(game, 'state/full cylinder'); await press(game, 'seventh/pulse');
    await frame(game, 1);
    const at = (ms) => game.page.evaluate(([sel, t]) => {
      const sv = document.querySelector(sel);
      for (const a of document.getAnimations()) { a.pause(); a.currentTime = t; }
      const lum = (c) => { const [r, g, b] = c.match(/[\d.]+/g).map(Number); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const o = getComputedStyle(sv.querySelector('.so:not(.ink)')), b = getComputedStyle(sv.querySelector('.sb'));
      return { stroke: lum(o.stroke), band: lum(b.fill), width: parseFloat(o.strokeWidth), names: [o.animationName, b.animationName, getComputedStyle(sv.querySelector('.ink.so')).animationName] };
    }, [SB_SEVENTH, ms]);
    const low = await at(0), high = await at(1000);
    assert.deepEqual(low.names, ['k7-pulse', 'k7-pulse-band', 'k7-pulse-ink']);
    assert.ok(high.stroke - low.stroke >= 100 && high.band - low.band >= 100, `luminance swing: outline ${low.stroke.toFixed(0)} -> ${high.stroke.toFixed(0)}, band ${low.band.toFixed(0)} -> ${high.band.toFixed(0)} (of 255)`);
    assert.ok(high.stroke >= 254, 'white at the top of the swing');
    assert.ok(high.width > low.width, 'and the outline still breathes wider (GDD 12.2: 1 -> 1.6 px)');
    console.log(`pulse at 720p: outline luminance ${low.stroke.toFixed(0)} -> ${high.stroke.toFixed(0)}, band ${low.band.toFixed(0)} -> ${high.band.toFixed(0)}, width ${low.width} -> ${high.width} px`);
    await game.page.evaluate(() => window.__dbg.setOption('reduceMotion', true));
    const rm = await game.page.evaluate((sel) => [...document.querySelector(sel).querySelectorAll('.so, .sb')].map((n) => getComputedStyle(n).animationName), SB_SEVENTH);
    assert.ok(rm.every((n) => n === 'k7-breathe'), `reduce motion: ${rm}`);
  } finally { await game.close(); }
});
