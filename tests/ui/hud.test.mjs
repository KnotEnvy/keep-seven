// The HUD (docs/workorders/code-ui.md 6): ring, markers, subtitles and captions, damage arc, health, boss pips, prompts,
// hints, checkpoint, cards, visibleText(). Run on sandbox/ui.html (the UI beside five core stubs, a run in play).
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { STORY, clip, diff, emit, frame, freeze, openSandbox, press, serve, uiState } from './util.mjs';

let server;
before(async () => { server = await serve(); });
after(async () => { await server.close(); });

const SPOKEN = Object.entries(STORY.lines).filter(([, l]) => ['narrator', 'station', 'reeve'].includes(l.speaker));
const hit = (outcome, order = 0) => ({ x: 0, y: 0, z: 0, shotId: 7, order, ammo: 'lead_round', outcome, entityId: 'bider#1', entityKind: 'bider', part: 'body', surface: 'cloth', nx: 0, ny: 1, nz: 0, damage: 50, ricochetX: 0, ricochetY: 0, ricochetZ: 0 });

test('ring: a shot advances the rotation target 60 degrees; the turn runs 120 to 300 ms after it and takes 0.18 s', async () => {
  const game = await openSandbox(server);
  try {
    await press(game, 'state/full cylinder');
    await frame(game, 1);
    const before = (await uiState(game)).hud;
    assert.equal(before.ringTurning, false);
    await game.page.evaluate(() => window.__dbg.ext.uisb.fire());
    let s = await game.page.evaluate(() => {
      const turn = document.querySelector('.k7 .hud .mark .turn'), cs = getComputedStyle(turn), kick = getComputedStyle(document.querySelector('.k7 .hud .mark [data-part="ring"]'));
      return { hud: window.__dbg.state().systems.ui.hud, cls: turn.getAttribute('class'), anim: cs.animationName, dur: cs.animationDuration, delay: cs.animationDelay, fill: cs.animationFillMode, kick: kick.animationName + ' ' + kick.animationDuration };
    });
    assert.equal(s.hud.ringAngleDeg, before.ringAngleDeg + 60, 'the target advanced one notch at once');
    assert.equal(s.hud.ringTurning, true);
    assert.deepEqual([s.anim, s.dur, s.delay, s.fill], ['k7-turn-a', '0.18s', '0.12s', 'both'], 'a 0.18 s turn that starts 0.12 s after the shot (GDD 6.8: 120 to 300 ms)');
    assert.equal(s.kick, 'k7-kick-a 0.14s', 'the ring kick');
    // the keyframes run from one notch back (-60 degrees) to rest
    const keyframes = await game.page.evaluate(() => document.querySelector('.k7 .hud .mark .turn').getAnimations()[0].effect.getKeyframes().map((k) => k.transform));
    assert.deepEqual(keyframes, ['rotate(-60deg)', 'rotate(0deg)']);
    await frame(game, 17);
    assert.equal((await uiState(game)).hud.ringTurning, true, 'still turning at 283 ms');
    await frame(game, 1);
    s = await game.page.evaluate(() => ({ hud: window.__dbg.state().systems.ui.hud, cls: document.querySelector('.k7 .hud .mark .turn').getAttribute('class'), kick: document.querySelector('.k7 .hud .mark [data-part="ring"]').getAttribute('class') }));
    assert.equal(s.hud.ringTurning, false, 'settled 300 ms after the shot: 0.18 s after the turn began');
    assert.deepEqual([s.cls, s.kick], ['turn', 'rk'], 'the classes are back at rest');
    // a shot while the ring still turns uses the other keyframe name, so the turn restarts; reduce motion drops the kick, not the turn
    const look = () => game.page.evaluate(() => ({ turn: getComputedStyle(document.querySelector('.k7 .hud .mark .turn')).animationName, kick: getComputedStyle(document.querySelector('.k7 .hud .mark [data-part="ring"]')).animationName, angle: window.__dbg.state().systems.ui.hud.ringAngleDeg }));
    await game.page.evaluate(() => { window.__dbg.setOption('reduceMotion', true); window.__dbg.ext.uisb.fire(); });
    assert.deepEqual(await look(), { turn: 'k7-turn-a', kick: 'none', angle: before.ringAngleDeg + 120 });
    await game.page.evaluate(() => { window.__dbg.step(4, true); window.__dbg.ext.uisb.fire(); });
    assert.deepEqual(await look(), { turn: 'k7-turn-b', kick: 'none', angle: before.ringAngleDeg + 180 });
  } finally { await game.close(); }
});

test('ring: the kept shot does not turn the ring (code-player: no cock after it); it kicks, and settles again when the rounds close up', async () => {
  const game = await openSandbox(server);
  try {
    await press(game, 'state/full cylinder');
    await press(game, 'ring/kept chambered');
    await frame(game, 30);
    const look = () => game.page.evaluate(() => ({
      hud: window.__dbg.state().systems.ui.hud, turn: document.querySelector('.k7 .hud .mark .turn').getAttribute('class'),
      kick: document.querySelector('.k7 .hud .mark [data-part="ring"]').getAttribute('class'),
      dots: [...document.querySelectorAll('.k7 .hud .mark .ch')].map((c) => c.getAttribute('class').replace('ch ', '')).join(),
      weapon: window.__dbg.ext.core.ctx().player.weapon.cylinder.join(),
    }));
    const before = await look();
    assert.equal(before.dots, 'kept,lead,lead,lead,lead,lead');
    await game.page.evaluate(() => window.__dbg.ext.uisb.fire());
    let s = await look();
    assert.deepEqual([s.hud.ringAngleDeg, s.hud.ringTurning, s.turn], [before.hud.ringAngleDeg, false, 'turn'], 'no notch: the target stays, no turn plays');
    assert.equal(s.kick, 'rk ka', 'the shot still kicks the ring');
    assert.deepEqual([s.dots, s.weapon], ['empty,lead,lead,lead,lead,lead', 'empty,lead,lead,lead,lead,lead'], 'the spent chamber empties where it is, under the hammer');
    await frame(game, 20);
    assert.equal((await look()).kick, 'rk', 'the kick settled');
    // the end of the fire_kept clip closes the rounds up: the dots move, the ring settles once more, and still does not turn
    await game.page.evaluate(() => { window.__dbg.ext.uisb.compact(); window.__dbg.step(0, true); });
    s = await look();
    assert.deepEqual([s.dots, s.weapon], ['lead,lead,lead,lead,lead,empty', 'lead,lead,lead,lead,lead,empty']);
    assert.deepEqual([s.kick, s.hud.ringAngleDeg, s.hud.ringTurning], ['rk ka', before.hud.ringAngleDeg, false], 'a settle, not a turn');
    // a lead shot afterwards turns it as ever
    await frame(game, 20);
    await game.page.evaluate(() => { window.__dbg.ext.uisb.fire(); window.__dbg.step(0, true); });
    s = await look();
    assert.deepEqual([s.hud.ringAngleDeg, s.hud.ringTurning], [before.hud.ringAngleDeg + 60, true]);
    // the sandbox's own clock closes the rounds up 1.2 s after a kept shot, like the player's clip
    await press(game, 'state/full cylinder');
    await press(game, 'ring/kept chambered');
    await frame(game, 30);
    await game.page.evaluate(() => window.__dbg.ext.uisb.fire());
    await frame(game, 71);
    assert.equal((await look()).dots, 'empty,lead,lead,lead,lead,lead');
    await frame(game, 2);
    await frame(game, 0);                                           // the sandbox's frame hook runs after the UI's update
    assert.equal((await look()).dots, 'lead,lead,lead,lead,lead,empty');
  } finally { await game.close(); }
});

test('ring: the chamber dots, the reserve numeral and the line pips match the weapon after 100 seeded sequences', async () => {
  const game = await openSandbox(server);
  try {
    const out = await game.page.evaluate(() => {
      const dbg = window.__dbg, sb = dbg.ext.uisb, ctx = dbg.ext.core.ctx();
      let seed = 0;
      const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      const kinds = ['empty', 'lead', 'line', 'kept'];
      const read = () => ({
        dots: [...document.querySelectorAll('.k7 .hud .mark .ch')].map((c) => c.getAttribute('class').replace('ch ', '')),
        reserve: document.querySelector('.k7 .hud .mark .rs').textContent,
        pips: document.querySelectorAll('.k7 .hud .mark .lp.on').length,
      });
      const bad = [];
      let checks = 0, shots = 0, reloads = 0;
      for (let seq = 0; seq < 100; seq++) {
        seed = 1000 + seq;
        sb.weapon(Array.from({ length: 6 }, () => kinds[rnd() < 0.7 ? 1 : 0]), Math.floor(rnd() * 37), Math.floor(rnd() * 3));
        for (let op = 0; op < 24; op++) {
          const r = rnd(), w = ctx.player.weapon;
          if (r < 0.45) { sb.fire(); shots++; }
          else if (r < 0.8) { sb.reloadRound(); reloads++; }
          else if (r < 0.9) { const c = w.cylinder.slice(); c[0] = 'line'; sb.weapon(c, w.reserve, Math.max(0, w.lineRounds - 1)); dbg.emit('weapon/line', { stage: 'loaded', held: w.lineRounds }); }
          else if (r < 0.95) { const c = w.cylinder.slice(); c[0] = 'kept'; sb.weapon(c, w.reserve, w.lineRounds); }
          else sb.weapon(w.cylinder.slice(), w.reserve, Math.floor(rnd() * 3));
          dbg.step(1 + Math.floor(rnd() * 3), false);
          ctx.ui.update(1 / 60, 1);                                // what a rendered frame does to the UI, without the software rasteriser
          const got = read();
          checks++;
          if (got.dots.join() !== w.cylinder.join() || got.reserve !== String(w.reserve) || got.pips !== w.lineRounds) bad.push({ seq, op, got, want: { dots: w.cylinder.slice(), reserve: w.reserve, pips: w.lineRounds } });
        }
      }
      return { bad: bad.slice(0, 3), failures: bad.length, checks, shots, reloads };
    });
    assert.equal(out.failures, 0, JSON.stringify(out.bad));
    assert.equal(out.checks, 2400);
    console.log(`ring: ${out.checks} checks over 100 sequences (${out.shots} shots, ${out.reloads} reload steps): dots, reserve and pips always equal the weapon`);
    // the looks: lead brass, empty a dim ring, line aqua, kept a white dot in an aqua ring
    const look = await game.page.evaluate(() => {
      window.__dbg.ext.uisb.weapon(['kept', 'lead', 'line', 'empty', 'lead', 'lead'], 7, 2); window.__dbg.step(0, true);
      const ch = [...document.querySelectorAll('.k7 .hud .mark .ch')];
      const shown = (el) => getComputedStyle(el).display !== 'none';
      const part = (c, sel) => { const e = c.querySelector(sel), s = getComputedStyle(e); return shown(e) ? `${s.fill}|${s.stroke}` : 'none'; };
      return { kept: [part(ch[0], '.kd'), part(ch[0], '.e'), part(ch[0], '.d')], lead: part(ch[1], '.d'), line: part(ch[2], '.d'), empty: [part(ch[3], '.d'), part(ch[3], '.e')], notch: shown(document.querySelector('.k7 .hud .mark .notch:not(.ink)')) };
    });
    assert.deepEqual(look.kept, ['rgb(255, 255, 255)|rgb(20, 17, 15)', 'none|rgb(124, 242, 226)', 'none']);
    assert.equal(look.lead, 'rgb(201, 161, 74)|rgb(20, 17, 15)');
    assert.equal(look.line, 'rgb(124, 242, 226)|rgb(20, 17, 15)');
    // polish round 4: a spent chamber is a bone ring at 60 % (dim brass was lost on the gun's dark steel) ...
    assert.deepEqual(look.empty, ['none', 'none|rgba(233, 226, 208, 0.6)']);
    // ... and the HUD mark stands on a soft ink backing that reaches past the ring, the numeral and the seventh; the
    // pause screen's enlarged mark (on the scrim) has none
    const backing = await game.page.evaluate(() => {
      const mark = document.querySelector('.k7 .hud .mark'), bks = [...mark.querySelectorAll('.bk')];
      const box = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
      const covers = (o, i) => o.l <= i.l && o.t <= i.t && o.r >= i.r && o.b >= i.b;
      const grad = document.querySelector(bks[0].getAttribute('fill').slice(4, -1)), stops = [...grad.querySelectorAll('stop')].map((s) => [+s.getAttribute('offset'), +s.getAttribute('stop-opacity'), s.getAttribute('stop-color')]);
      return {
        n: bks.length, first: mark.querySelector('.bk') === [...mark.children].find((c) => c.tagName !== 'defs'), shown: bks.every((b) => getComputedStyle(b).display !== 'none'), stops,
        ring: covers(box(bks[0]), box(mark.querySelector('[data-part="ring"]'))) && covers(box(bks[0]), box(mark.querySelector('.rs'))), seventh: covers(box(bks[1]), box(mark.querySelector('[data-part="seventh"]'))),
        big: [...document.querySelectorAll('.k7 .mark.big .bk')].map((b) => getComputedStyle(b).display),
        ids: new Set([...document.querySelectorAll('.k7 .mark radialGradient')].map((g) => g.id)).size,
      };
    });
    assert.deepEqual([backing.n, backing.first, backing.shown, backing.ring, backing.seventh], [2, true, true, true, true], 'two ink discs under everything, covering the ring with its numeral and the seventh');
    assert.deepEqual(backing.stops, [[0, 0.5, '#14110F'], [0.6, 0.5, '#14110F'], [1, 0, '#14110F']], 'ink at 50 %, fading to nothing at the edge (no panel edge)');
    assert.deepEqual([backing.big, backing.ids], [['none', 'none'], 2], 'none under the enlarged mark; each mark has its own gradient');
    assert.ok(look.notch);
  } finally { await game.close(); }
});

test('markers: each outcome has its shape and its lifetime (90 / 120 / 160 / 160 ms, cleared on the nearest 60 Hz tick: 5 / 7 / 10 / 10); shapes differ pairwise', async () => {
  const game = await openSandbox(server, { viewport: { width: 1920, height: 1080 } });
  try {
    await frame(game, 1);
    // [outcome, ticks it is still up after, ticks it is gone after]
    // GDD 6.8: 90 / 120 / 160 ms. A tick is 16.7 ms: the nearest tick is 5 (83 ms), 7 (117 ms), 10 (167 ms), never the next one up
    const life = { hit: [4, 5], weak: [6, 7], kill: [9, 10], freed: [9, 10], deflected: [6, 7] };
    const files = {}, shapes = {};
    for (const outcome of Object.keys(life)) {
      await game.page.evaluate((p) => window.__dbg.emit('combat/hit', p), hit(outcome));
      const s = (await uiState(game)).hud;
      assert.equal(s.marker, outcome);
      const seconds = { hit: 0.09, weak: 0.12, kill: 0.16, freed: 0.16, deflected: 0.12 }[outcome];
      assert.ok(Math.abs(s.markerLeft - seconds) < 1e-6, `${outcome}: ${seconds * 1000} ms`);
      shapes[outcome] = await game.page.evaluate(() => {
        const mk = document.querySelector('.k7 .xh .mk');
        const vis = (sel) => getComputedStyle(mk.querySelector(sel)).visibility === 'visible';
        return `${vis('.mt') ? 'ticks' : ''}${vis('.mr') ? '+ring' : ''}${vis('.mc') ? '+chevron' : ''}|${getComputedStyle(mk.querySelector('.mt')).animationName}|${getComputedStyle(mk.querySelector('.mr')).animationName}`;
      });
      await freeze(game, 80);                                      // half way through a 160 ms keyframe
      files[outcome] = await clip(game, '.k7 .xh', 'test_marker_' + outcome, -60);
      await game.page.evaluate(() => { for (const a of document.getAnimations()) a.play(); });
      await frame(game, life[outcome][0]);
      assert.equal((await uiState(game)).hud.marker, outcome, `${outcome}: still up after ${life[outcome][0]} ticks`);
      await frame(game, life[outcome][1] - life[outcome][0]);
      assert.equal((await uiState(game)).hud.marker, '', `${outcome}: gone after ${life[outcome][1]} ticks`);
      assert.equal(await game.page.evaluate(() => document.querySelector('.k7 .xh .mk').getAttribute('class')), 'mk');
    }
    assert.equal(shapes.hit.split('|')[0], 'ticks');
    assert.equal(shapes.weak.split('|')[0], 'ticks+ring');
    assert.match(shapes.kill, /^ticks\|k7-kill-[ab]\|none$/, 'the ticks expand');
    assert.match(shapes.freed, /^\+ring\|none\|k7-freed-[ab]$/, 'the ring alone, closing to a dot');
    assert.equal(shapes.deflected.split('|')[0], '+chevron');
    const names = Object.keys(life);
    const diffs = [];
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
      const d = diff(files[names[i]], files[names[j]]);
      diffs.push(`${names[i]}/${names[j]} ${d}`);
      assert.ok(d > 0, `${names[i]} and ${names[j]} look the same`);
    }
    console.log('markers: differing pixels per pair: ' + diffs.join(', '));
    // no marker for an outcome that is not a hit on something that can be hurt
    for (const outcome of ['impact', 'broke', 'passed']) {
      await game.page.evaluate((p) => window.__dbg.emit('combat/hit', p), hit(outcome));
      assert.equal((await uiState(game)).hud.marker, '', outcome);
    }
    // a parry (a lead round into a glowing chamber: no stake, no pip) shows the deflected glyph: it is not a success
    // (docs/requests/code-enemies.md R2.2, closer of polish round 2)
    await game.page.evaluate((p) => window.__dbg.emit('combat/hit', p), hit('parried'));
    assert.equal((await uiState(game)).hud.marker, 'deflected', 'parried');
    await game.dbg('step', 30, true);
    // a line round: one marker per combat/hit, 40 ms apart, each restarting the glyph
    const seq = await game.page.evaluate((hits) => {
      const out = [];
      for (const h of hits) { window.__dbg.emit('combat/hit', h); const s = window.__dbg.state().systems.ui.hud; out.push(s.marker + ':' + document.querySelector('.k7 .xh .mk').getAttribute('class')); window.__dbg.step(2, true); }
      return out;
    }, [hit('kill', 0), hit('kill', 1), hit('freed', 2)]);
    assert.deepEqual(seq.map((x) => x.slice(0, -1)), ['kill:mk m-kill m', 'kill:mk m-kill m', 'freed:mk m-freed m']);
    assert.notEqual(seq[0], seq[1], 'the second kill marker restarts the keyframes (the other class)');
    // reduce flashes: thin outlines, no keyframes
    await game.page.evaluate((p) => { window.__dbg.setOption('reduceFlashes', true); window.__dbg.emit('combat/hit', p); }, hit('kill'));
    const rf = await game.page.evaluate(() => { const t = document.querySelector('.k7 .xh .mk .mt'); const l = t.querySelector('line:not(.ink)'); return { anim: getComputedStyle(t).animationName, width: getComputedStyle(l).strokeWidth }; });
    assert.deepEqual(rf, { anim: 'none', width: '0.75px' });
  } finally { await game.close(); }
});

test('subtitles: every spoken line fits 2 lines of 42 at every size at 1280 x 720; voices, options, captions', async () => {
  const game = await openSandbox(server);
  try {
    const result = await game.page.evaluate((lines) => {
      const dbg = window.__dbg;
      const sub = document.querySelector('.k7 .sub'), say = sub.querySelector('.say');
      const bad = [];
      const sizes = {};
      let widest = 0;
      for (const size of ['S', 'M', 'L', 'XL']) {
        dbg.setOption('subtitleSize', size);
        sizes[size] = parseFloat(getComputedStyle(sub).fontSize);
        for (const [key, l] of lines) {
          dbg.emit('story/line', { key, speaker: l.speaker, text: l.text, seconds: l.seconds });
          const r = sub.getBoundingClientRect(), sr = say.getBoundingClientRect();
          const rows = say.textContent.split('\n');
          const lineHeight = parseFloat(getComputedStyle(say).lineHeight) || parseFloat(getComputedStyle(say).fontSize) * 1.3;
          const fits = r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && r.top >= innerHeight * 0.5
            && say.scrollWidth <= say.clientWidth + 1 && sub.scrollWidth <= sub.clientWidth + 1 && sub.scrollHeight <= sub.clientHeight + 1
            && rows.length <= 2 && rows.every((x) => x.length <= 42) && sr.height <= lineHeight * rows.length + 2;
          widest = Math.max(widest, r.width);
          if (!fits) bad.push({ key, size, w: r.width, rows });
          dbg.emit('story/line_end', { key });
        }
      }
      return { bad: bad.slice(0, 4), failures: bad.length, sizes, widest, height: innerHeight };
    }, SPOKEN);
    assert.equal(result.failures, 0, JSON.stringify(result.bad));
    assert.ok(Math.abs(result.sizes.M - 0.026 * 720) < 0.05, `M is 2.6 % of the screen height (${result.sizes.M} px)`);
    assert.ok(result.sizes.S < result.sizes.M && result.sizes.M < result.sizes.L && result.sizes.L < result.sizes.XL);
    console.log(`subtitles: ${SPOKEN.length} lines x 4 sizes fit; sizes ${JSON.stringify(result.sizes)} px; widest box ${result.widest.toFixed(0)} of 1280 px`);

    await game.page.evaluate(() => window.__dbg.setOption('subtitleSize', 'M'));
    const voice = (key) => game.page.evaluate(([k, l]) => {
      window.__dbg.emit('story/line', { key: k, speaker: l.speaker, text: l.text, seconds: l.seconds });
      const sub = document.querySelector('.k7 .sub'), who = sub.querySelector('.who'), say = sub.querySelector('.say'), cs = getComputedStyle(say), ws = getComputedStyle(who);
      return { shown: getComputedStyle(sub).display, label: ws.display === 'none' ? null : who.textContent, labelColour: ws.color, style: cs.fontStyle, family: cs.fontFamily.split(',')[0], transform: cs.textTransform, spacing: cs.letterSpacing, size: cs.fontSize, bg: getComputedStyle(sub).backgroundColor, pad: getComputedStyle(sub).paddingTop, border: getComputedStyle(sub).borderTopWidth, vt: window.__dbg.state().ui };
    }, [key, STORY.lines[key]]);
    const nar = await voice('nar_first_fell');
    assert.equal(nar.label, null, 'the narrator has no speaker label');
    assert.equal(nar.style, 'italic');
    assert.match(nar.family, /Iowan Old Style/);
    assert.equal(nar.bg, 'rgba(20, 17, 15, 0.6)', 'soft ink backing at 60 %');
    assert.equal(nar.pad, '8px', '12 px of padding at 1080p');
    assert.equal(nar.border, '0px');
    assert.equal(nar.vt.subtitle, STORY.lines.nar_first_fell.text);
    assert.equal(nar.vt.speaker, 'narrator');
    const stnKey = SPOKEN.find(([, l]) => l.speaker === 'station')[0];
    const stn = await voice(stnKey);
    assert.equal(stn.label, STORY.ui.ui_speaker_station);
    assert.equal(stn.labelColour, 'rgb(124, 242, 226)', 'the station label is aqua');
    assert.equal(stn.transform, 'uppercase');
    assert.equal(stn.style, 'normal');
    assert.match(stn.family, /Avenir Next/);
    assert.ok(Math.abs(parseFloat(stn.spacing) / parseFloat(stn.size) - 0.18) < 0.005, 'tracked 0.18em');
    const rv = await voice('rv_ask');
    assert.equal(rv.label, STORY.ui.ui_speaker_reeve);
    assert.equal(rv.style, 'normal', 'the Reeve: serif roman');
    assert.match(rv.family, /Iowan Old Style/);
    assert.equal(rv.labelColour, 'rgb(233, 226, 208)');

    // line_end removes it; a line_end for another key does not
    const ended = await game.page.evaluate(() => {
      const sub = document.querySelector('.k7 .sub');
      window.__dbg.emit('story/line_end', { key: 'nar_first_fell' });
      const still = getComputedStyle(sub).display;
      window.__dbg.emit('story/line_end', { key: 'rv_ask' });
      return { still, after: getComputedStyle(sub).display, vt: window.__dbg.state().ui.subtitle };
    });
    assert.deepEqual(ended, { still: 'block', after: 'none', vt: '' });

    // options: backing, subtitles off, captions off
    const opt = await game.page.evaluate(([k, l, cap]) => {
      const dbg = window.__dbg, sub = document.querySelector('.k7 .sub'), capt = document.querySelector('.k7 .capt');
      dbg.emit('story/line', { key: k, speaker: l.speaker, text: l.text, seconds: l.seconds });
      dbg.setOption('subtitleBackground', 1); const bg1 = getComputedStyle(sub).backgroundColor;
      dbg.setOption('subtitleBackground', 0); const bg0 = getComputedStyle(sub).backgroundColor;
      dbg.setOption('subtitles', false);
      const off = { display: getComputedStyle(sub).display, vt: dbg.state().ui.subtitle, speaker: dbg.state().ui.speaker };
      dbg.setOption('subtitles', true);
      const on = { display: getComputedStyle(sub).display, vt: dbg.state().ui.subtitle };
      dbg.emit('story/caption', { key: 'cap_stake', text: cap.text, seconds: cap.seconds });
      const c = getComputedStyle(capt);
      const caption = { text: capt.textContent, visibility: c.visibility, opacity: c.opacity, ratio: parseFloat(c.fontSize) / parseFloat(getComputedStyle(sub).fontSize), vt: dbg.state().ui.caption, above: capt.getBoundingClientRect().bottom <= sub.getBoundingClientRect().top };
      dbg.setOption('captions', false);
      const capOff = { visibility: getComputedStyle(capt).visibility, vt: dbg.state().ui.caption };
      dbg.setOption('captions', true);
      dbg.step(119, true); const at119 = dbg.state().ui.caption;
      dbg.step(1, true); const at120 = dbg.state().ui.caption;
      return { bg1, bg0, off, on, caption, capOff, at119, at120, hidden: getComputedStyle(capt).visibility };
    }, ['nar_first_fell', STORY.lines.nar_first_fell, STORY.lines.cap_stake]);
    assert.equal(opt.bg1, 'rgb(20, 17, 15)');
    assert.equal(opt.bg0, 'rgba(20, 17, 15, 0)');
    assert.deepEqual(opt.off, { display: 'none', vt: '', speaker: '' }, 'hidden when the option is off');
    assert.deepEqual(opt.on, { display: 'block', vt: STORY.lines.nar_first_fell.text });
    assert.equal(opt.caption.text, STORY.lines.cap_stake.text);
    assert.match(opt.caption.text, /^\[.*\]$/, 'square brackets');
    assert.deepEqual([opt.caption.visibility, opt.caption.opacity, opt.caption.vt, opt.caption.above], ['visible', '0.7', STORY.lines.cap_stake.text, true]);
    assert.ok(Math.abs(opt.caption.ratio - 0.8) < 0.01, '80 % of the subtitle size');
    assert.deepEqual(opt.capOff, { visibility: 'hidden', vt: '' }, 'captions obey their option');
    assert.deepEqual([opt.at119, opt.at120, opt.hidden], [STORY.lines.cap_stake.text, '', 'hidden'], 'a caption holds 2 s');
    // GDD 17: the same key is not shown again within 4 s of the last time it was shown; another key is
    const again = await game.page.evaluate(() => {
      const dbg = window.__dbg, ctx = dbg.ext.core.ctx(), cap = (k) => dbg.emit('story/caption', { key: k, text: ctx.data.line(k).text, seconds: ctx.data.line(k).seconds });
      const out = [];
      cap('cap_stake'); dbg.step(0, true); out.push(dbg.state().ui.caption);                    // 2.0 s after the first: too soon
      dbg.step(117, true); cap('cap_stake'); dbg.step(0, true); out.push(dbg.state().ui.caption);  // 3.95 s: still too soon
      cap('cap_bider_rattle'); dbg.step(0, true); out.push(dbg.state().ui.caption);             // another key: at once
      dbg.step(3, true); cap('cap_stake'); dbg.step(0, true); out.push(dbg.state().ui.caption);    // 4.0 s: again
      return out;
    });
    assert.deepEqual(again, ['', '', STORY.lines.cap_bider_rattle.text, STORY.lines.cap_stake.text]);
  } finally { await game.close(); }
});

test('visibleText() is what is on screen: prompt, hint, checkpoint, card; each with its timing', async () => {
  const game = await openSandbox(server);
  try {
    const vt = () => game.page.evaluate(() => window.__dbg.state().ui);
    const shown = (sel) => game.page.evaluate((s) => { const e = document.querySelector('.k7 ' + s); const c = getComputedStyle(e); return { text: e.textContent, on: e.classList.contains('on'), colour: c.color }; }, sel);
    // ---- prompt: the key in its own outlined square
    await emit(game, 'interact/focus', { id: 'rd_note_lip', prompt: 'ui_prompt_read', kind: 'read' });
    assert.equal((await vt()).prompt, 'E  Read');
    let p = await game.page.evaluate(() => { const e = document.querySelector('.k7 .prompt:not(.hint)'), k = e.querySelector('.key'), c = getComputedStyle(k), pc = getComputedStyle(e); return { text: e.textContent, key: k.textContent, border: c.borderTopWidth + ' ' + c.borderTopStyle + ' ' + c.borderTopColor, transition: pc.transitionDuration, transform: pc.textTransform, on: e.classList.contains('on') }; });
    assert.deepEqual(p, { text: 'E  Read', key: 'E', border: '1px solid rgb(233, 226, 208)', transition: '0.2s', transform: 'uppercase', on: true });
    await emit(game, 'interact/focus', { id: 'ia_mark_1', prompt: 'ui_prompt_kept', kind: 'kept' });
    // pass i2: bone on the subtitle's ink backing, its key in a cap filled with the proving aqua (thin aqua capitals
    // were lost on the bore's pale aqua floor)
    const kept = await game.page.evaluate(() => { const e = document.querySelector('.k7 .prompt:not(.hint)'), k = e.querySelector('.key'), c = getComputedStyle(e), kc = getComputedStyle(k), r = e.getBoundingClientRect(); return { colour: c.color, bg: c.backgroundColor, key: kc.backgroundColor, keyInk: kc.color, centre: Math.abs((r.left + r.right) / 2 - innerWidth / 2) < 1.5, hugs: r.width < innerWidth / 2 }; });
    assert.deepEqual(kept, { colour: 'rgb(233, 226, 208)', bg: 'rgba(20, 17, 15, 0.62)', key: 'rgb(124, 242, 226)', keyInk: 'rgb(20, 17, 15)', centre: true, hugs: true }, 'the proving prompt: bone on ink, an aqua key cap');
    assert.equal((await vt()).prompt, 'F  Break the band');
    await emit(game, 'interact/focus', { id: 'ia_locker', prompt: '', kind: 'take' });
    assert.equal((await vt()).prompt, 'E  Take', 'a focus that names only its kind');
    await emit(game, 'interact/focus', { id: '', prompt: '', kind: '' });
    assert.deepEqual([(await vt()).prompt, (await shown('.prompt:not(.hint)')).on], ['', false]);
    // ---- hints: one at a time, hidden by the same key, the bound keys
    const want = { ui_hint_move: 'W A S D to walk', ui_hint_fire: 'Left click to fire', ui_hint_reload: 'R to reload', ui_hint_sprint: 'Hold Shift to run', ui_hint_interact: 'E to read or take', ui_hint_line: 'Q to seat a line round under the hammer', ui_prompt_kept: 'F  Break the band' };
    for (const [key, text] of Object.entries(want)) {
      await emit(game, 'ui/hint', { key, show: true });
      assert.equal((await vt()).hint, text, key);
      assert.equal((await shown('.prompt.hint')).text, text);
    }
    // pass i2: the tier 3 hint is the same plate as the prompt: bone on ink, the key cap aqua
    assert.equal((await shown('.prompt.hint')).colour, 'rgb(233, 226, 208)');
    assert.deepEqual(await game.page.evaluate(() => { const e = document.querySelector('.k7 .prompt.hint'); return [getComputedStyle(e).backgroundColor, getComputedStyle(e.querySelector('.key')).backgroundColor]; }), ['rgba(20, 17, 15, 0.62)', 'rgb(124, 242, 226)']);
    await emit(game, 'ui/hint', { key: 'ui_hint_move', show: false });
    assert.equal((await vt()).hint, want.ui_prompt_kept, 'hiding another hint leaves the one that is up');
    await emit(game, 'ui/hint', { key: 'ui_prompt_kept', show: false });
    assert.equal((await vt()).hint, '');
    // ---- checkpoint: movement as a roman numeral, 2 s
    await emit(game, 'checkpoint/saved', { id: 'cp_gallery_baffle', movement: 4, section: 2 });
    assert.equal((await vt()).checkpoint, 'IV · 2');
    const cp = await game.page.evaluate(() => { const r = document.querySelector('.k7 .cp').getBoundingClientRect(); return r.left < innerWidth * 0.2 && r.top < innerHeight * 0.2; });
    assert.ok(cp, 'top left');
    await frame(game, 119); assert.equal((await vt()).checkpoint, 'IV · 2');
    await frame(game, 1); assert.equal((await vt()).checkpoint, '');
    // ---- title card: numeral, rule, title; fade in 0.6 s, out 0.8 s; no input lock
    const l = STORY.lines.card_iv;
    await emit(game, 'story/card', { key: 'card_iv', text: l.text, seconds: l.seconds });
    const card = await game.page.evaluate(() => {
      const c = document.querySelector('.k7 .card'), num = c.querySelector('.card-num'), rule = c.querySelector('.card-rule'), ttl = c.querySelector('.card-title');
      return { num: num.textContent, title: ttl.textContent, numSize: parseFloat(getComputedStyle(num).fontSize) / innerHeight, titleSize: parseFloat(getComputedStyle(ttl).fontSize) / innerHeight, rule: rule.getBoundingClientRect().width / (innerHeight / 1080), ruleColour: getComputedStyle(rule).backgroundColor, fadeIn: getComputedStyle(c).transitionDuration, opacity: getComputedStyle(c).opacity, top: c.getBoundingClientRect().top / innerHeight, bg: getComputedStyle(c).backgroundColor, modal: window.__dbg.state().systems.ui.modal, vt: window.__dbg.state().ui.card, numFamily: getComputedStyle(num).fontFamily.split(',')[0] };
    });
    assert.deepEqual([card.num, card.title, card.vt], ['IV', 'The Line', l.text]);
    assert.ok(Math.abs(card.numSize - 0.09) < 0.001 && Math.abs(card.titleSize - 0.024) < 0.001, 'numeral 9 %, title 2.4 % of the height');
    assert.ok(Math.abs(card.rule - 120) < 1, 'a 120 px rule');
    // release pass p0: the opacity is the script's, from the card's tick clock (no transition on the wall clock), and the
    // card stands in the upper third (12 % down)
    assert.deepEqual([card.ruleColour, card.fadeIn, card.bg, card.modal], ['rgb(201, 161, 74)', '0s', 'rgba(0, 0, 0, 0)', false]);
    assert.ok(Math.abs(card.top - 0.12) < 0.004, `the card's top is 12 % down (${card.top})`);
    assert.ok(parseFloat(card.opacity) > 0 && parseFloat(card.opacity) <= 0.1, `coming up from its first tick (${card.opacity})`);
    await frame(game, 18);
    assert.equal(await game.page.evaluate(() => getComputedStyle(document.querySelector('.k7 .card')).opacity), '0.5', 'half way up at 0.3 s');
    await frame(game, 18);
    assert.equal(await game.page.evaluate(() => getComputedStyle(document.querySelector('.k7 .card')).opacity), '1', 'whole at 0.6 s');
    assert.match(card.numFamily, /Iowan Old Style/);
    const hold = Math.round((l.seconds - 0.8) * 60);
    await frame(game, hold - 1 - 36);
    assert.equal((await shown('.card')).on, true, 'held');
    await frame(game, 1);
    let out = await game.page.evaluate(() => ({ on: document.querySelector('.k7 .card').classList.contains('on'), opacity: getComputedStyle(document.querySelector('.k7 .card')).opacity, vt: window.__dbg.state().ui.card }));
    assert.deepEqual(out, { on: false, opacity: '1', vt: l.text }, 'the fade out begins');
    await frame(game, 24);
    out = await game.page.evaluate(() => ({ on: document.querySelector('.k7 .card').classList.contains('on'), opacity: getComputedStyle(document.querySelector('.k7 .card')).opacity, vt: window.__dbg.state().ui.card }));
    assert.deepEqual(out, { on: false, opacity: '0.5', vt: l.text }, 'half gone 0.4 s into a 0.8 s fade');
    await frame(game, 24);
    assert.equal(await game.page.evaluate(() => getComputedStyle(document.querySelector('.k7 .card')).opacity), '0', 'gone');
    assert.equal((await vt()).card, '');
    await emit(game, 'story/card', { key: 'card_title', text: STORY.lines.card_title.text, seconds: 4 });
    assert.deepEqual(await game.page.evaluate(() => [document.querySelector('.k7 .card-num').textContent, getComputedStyle(document.querySelector('.k7 .card-title')).display]), [STORY.lines.card_title.text, 'none'], 'card_title is a single line');
  } finally { await game.close(); }
});

test('damage arc points at the source from eight directions; health segments; boss pips', async () => {
  const game = await openSandbox(server, { viewport: { width: 1920, height: 1080 } });
  try {
    await frame(game, 1);
    // ---- arc: 0 = ahead (above the crosshair), 90 = her right, clockwise
    for (let deg = 0; deg < 360; deg += 45) {
      const got = await game.page.evaluate((d) => {
        window.__dbg.ext.uisb.arc(d);
        const arcs = [...document.querySelectorAll('.k7 .xh .arc.on:not(.ink)')];
        const arc = arcs[arcs.length - 1], r = arc.getBoundingClientRect(), x = document.querySelector('.k7 .xh').getBoundingClientRect();
        const cx = r.left + r.width / 2 - (x.left + x.width / 2), cy = r.top + r.height / 2 - (x.top + x.height / 2);
        const out = { deg: window.__dbg.state().systems.ui.hud.arcDeg, at: (Math.atan2(cx, -cy) * 180 / Math.PI + 360) % 360, dist: Math.hypot(cx, cy), colour: getComputedStyle(arc).stroke, o: Number(getComputedStyle(arc).opacity), n: arcs.length };
        // pass i4: the arc stands a second on the fixed tick (it was a 0.6 s keyframe on the wall clock): tests/ui/i4.test.mjs
        window.__dbg.step(36, true);
        out.mid = document.querySelectorAll('.k7 .xh .arc.on:not(.ink)').length;
        window.__dbg.step(24, true);
        out.after = document.querySelectorAll('.k7 .xh .arc.on:not(.ink)').length;
        return out;
      }, deg);
      assert.equal(got.deg, deg);
      assert.ok(Math.abs(((got.at - deg + 540) % 360) - 180) < 3, `source at ${deg}: the arc sits at ${got.at.toFixed(1)}`);
      assert.ok(got.dist > 25, 'round the crosshair, not on it');
      assert.deepEqual([got.colour, got.o, got.mid, got.after], ['rgb(243, 230, 207)', 1, 1, 0], 'pale and whole, still up at 0.6 s, gone at 1 s');
    }
    // the view turned 90 degrees to her left: a source that was ahead is now on her right
    const turned = await game.page.evaluate(() => {
      const dbg = window.__dbg, p = dbg.player();
      const yaw = p.yawDeg * Math.PI / 180;
      const from = { x: p.x - Math.sin(yaw) * 6, z: p.z - Math.cos(yaw) * 6 };       // 6 m ahead (yaw 0 faces -Z, positive yaw turns left)
      dbg.setAim(p.yawDeg + 90, 0); dbg.step(1, true);
      dbg.emit('player/damaged', { amount: 5, health: 90, kind: 'stake', source: 'transit', fromX: from.x, fromY: p.y + 1, fromZ: from.z, graceUsed: false });
      return dbg.state().systems.ui.hud.arcDeg;
    });
    assert.equal(turned, 90);
    await frame(game, 40);                                          // the arc and the outline flash of that hit run out
    // never a full-screen flash: nothing but the arc and one segment outline changed
    // ---- health: 34 / 33 / 33; lost = outline only; the regenerating one a 1 px line; a flash on damage
    const health = (hp) => game.page.evaluate((h) => {
      window.__dbg.setHealth(h); window.__dbg.step(0, true);
      return [...document.querySelectorAll('.k7 .health .seg')].map((s) => { const f = s.querySelector('.fill'); const m = new DOMMatrix(getComputedStyle(f).transform); return +m.a.toFixed(3); });
    }, hp);
    assert.deepEqual(await health(100), [1, 1, 1]);
    assert.deepEqual(await health(67), [1, 1, 0]);
    assert.deepEqual(await health(34), [1, 0, 0]);
    const half = await health(50);
    assert.ok(half[0] === 1 && half[1] > 0.4 && half[1] < 0.6 && half[2] === 0, JSON.stringify(half));
    const one = await health(1);
    assert.ok(one[0] > 0 && one[0] < 0.1, 'a sliver while she lives');
    const seg = await game.page.evaluate(() => {
      const dbg = window.__dbg;
      dbg.setHealth(50); dbg.emit('player/health_segment', { segment: 1, regenerating: true }); dbg.step(0, true);
      const segs = [...document.querySelectorAll('.k7 .health .seg')], r = segs[0].getBoundingClientRect(), u = innerHeight / 1080;
      const fill = segs[1].querySelector('.fill');
      const out = { regen: segs.map((s) => s.classList.contains('regen')), line: fill.getBoundingClientRect().height, w: r.width / u, h: r.height / u, gap: (segs[1].getBoundingClientRect().left - r.right) / u, colour: getComputedStyle(fill).backgroundColor, left: r.left < innerWidth * 0.2 && r.bottom > innerHeight * 0.8 };
      dbg.emit('player/damaged', { amount: 10, health: 40, kind: 'lunge', source: 'bider', fromX: 0, fromY: 0, fromZ: 0, graceUsed: false });
      out.flash = segs.map((s) => getComputedStyle(s).animationName);
      dbg.emit('player/health_segment', { segment: 1, regenerating: false }); dbg.step(0, true);
      out.regenOff = segs[1].classList.contains('regen');
      return out;
    });
    assert.deepEqual(seg.regen, [false, true, false]);
    assert.ok(seg.line <= 1.01, `the regenerating segment shows a 1 px line (${seg.line})`);
    // polish round 3 (story-ux): the bars were 5 units (4 px at 720p); they are 7 (never under 6 px), inside a 1 px ink outline
    assert.ok(Math.abs(seg.w - 46) < 0.5 && Math.abs(seg.h - 7) < 0.5 && Math.abs(seg.gap - 4) < 0.5, `46 x 7, 4 apart: ${seg.w} x ${seg.h}, ${seg.gap}`);
    assert.deepEqual([seg.colour, seg.left, seg.regenOff], ['rgb(233, 226, 208)', true, false]);
    assert.deepEqual(seg.flash, ['none', 'k7-seg-a', 'none'], 'the segment her health is in flashes its outline');
    // ---- boss: hidden when idle; 26 pips in 10 / 10 / 6; flame; bone in 3b; relight as boss/pips says
    const boss = (phase, fields) => game.page.evaluate(([ph, f]) => {
      const dbg = window.__dbg;
      if (ph) dbg.setBossPhase(ph);
      if (f) dbg.ext.enemies.setBoss(f);
      dbg.step(0, true);
      const b = document.querySelector('.k7 .boss'), pips = [...b.querySelectorAll('.pip')];
      const r = pips[0].getBoundingClientRect(), u = innerHeight / 1080;
      return { shown: getComputedStyle(b).display !== 'none', name: b.querySelector('.boss-name').textContent, groups: [...b.querySelectorAll('.pip-group')].map((g) => g.children.length), lit: pips.map((p) => (p.classList.contains('lit') ? 1 : 0)).join(''), colour: getComputedStyle(pips[25]).backgroundColor, w: r.width / u, h: r.height / u, gap: (pips[1].getBoundingClientRect().left - r.right) / u, top: b.getBoundingClientRect().top < innerHeight * 0.15 };
    }, [phase, fields]);
    let b = await boss(null, null);
    assert.equal(b.shown, false, 'no boss bar while the boss is idle');
    b = await boss('p1', null);
    assert.deepEqual([b.shown, b.name, b.groups, b.lit, b.colour, b.top], [true, STORY.ui.ui_boss_name, [10, 10, 6], '1'.repeat(26), 'rgb(255, 148, 51)', true]);
    assert.ok(Math.abs(b.w - 4) < 0.3 && Math.abs(b.h - 10) < 0.3 && Math.abs(b.gap - 2) < 0.3, `pips 4 x 10, 2 apart: ${b.w} x ${b.h}, ${b.gap}`);
    for (let n = 25; n >= 0; n--) { b = await boss(null, { pips: n }); assert.equal(b.lit, '0'.repeat(26 - n) + '1'.repeat(n), `${n} pips`); }
    b = await boss('p3a', { pips: 2 });
    assert.equal(b.lit, '0'.repeat(24) + '11');
    b = await boss(null, { pips: 5 });
    assert.equal(b.lit, '0'.repeat(21) + '11111', 'pips relight in 3a');
    b = await boss('p3b', null);
    assert.deepEqual([b.lit, b.colour], ['0'.repeat(20) + '111111', 'rgb(233, 226, 208)'], 'six left, bone, in 3b');
    b = await boss('dead', null);
    assert.equal(b.shown, false);
    // ---- the plumb glyph while the kept round is chambered; its stroke lengthens while the aim is legal
    const plumb = await game.page.evaluate(() => {
      const dbg = window.__dbg, x = document.querySelector('.k7 .xh');
      const read = () => { const p = x.querySelector('.plumb:not(.ink)'), t = x.querySelector('.tick:not(.ink)'); return { plumb: getComputedStyle(p).display !== 'none', ticks: getComputedStyle(t).display !== 'none', scale: getComputedStyle(p).transform }; };
      const a = read();
      dbg.ext.uisb.run('ring/kept chambered'); dbg.step(0, true); const b2 = read();
      const settle = () => { for (const t of document.getAnimations()) t.finish(); };      // the 0.12 s transition of the stroke
      dbg.ext.uisb.legal(true); dbg.step(0, true); getComputedStyle(x.querySelector('.plumb')).transform; settle(); const c = read();
      dbg.ext.uisb.legal(false); dbg.step(0, true); getComputedStyle(x.querySelector('.plumb')).transform; settle();
      return { a, b: b2, c, d: read(), ui: dbg.state().systems.ui.hud };
    });
    assert.deepEqual([plumb.a.plumb, plumb.a.ticks], [false, true]);
    assert.deepEqual([plumb.b.plumb, plumb.b.ticks, plumb.b.scale], [true, false, 'none']);
    assert.match(plumb.c.scale, /^matrix\(1, 0, 0, 2\.25,/);
    assert.match(plumb.d.scale, /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
    assert.equal(plumb.ui.seventh, 'chambered');
  } finally { await game.close(); }
});

test('the HUD is hidden on the title, in a ride\'s dark and on the end card; it fades while dead; the crosshair obeys its options', async () => {
  const game = await openSandbox(server);
  try {
    const hud = () => game.page.evaluate(() => { const h = getComputedStyle(document.querySelector('.k7 .hud')), t = getComputedStyle(document.querySelector('.k7 .txt')); return { hud: h.visibility, fade: document.querySelector('.k7 .hud').classList.contains('fade'), txt: t.visibility, screen: window.__dbg.state().ui.screen }; });
    assert.deepEqual(await hud(), { hud: 'visible', fade: false, txt: 'visible', screen: '' });
    await emit(game, 'ride/state', { id: 'ride_lift_hall', stage: 'started', seconds: 25 });
    assert.deepEqual(await hud(), { hud: 'hidden', fade: false, txt: 'visible', screen: '' }, 'gauges off in the dark, the narrator still readable');
    await emit(game, 'ride/state', { id: 'ride_lift_hall', stage: 'ended', seconds: 25 });
    assert.equal((await hud()).hud, 'visible');
    // crosshair options
    const x = await game.page.evaluate(() => {
      const dbg = window.__dbg, xh = document.querySelector('.k7 .xh'), g = xh.querySelector('.x');
      const read = () => ({ scale: new DOMMatrix(getComputedStyle(g).transform).a, colour: getComputedStyle(xh.querySelector('.tick:not(.ink)')).stroke, outline: getComputedStyle(xh.querySelector('.ink.tick')).display !== 'none', dot: getComputedStyle(xh.querySelector('.dot:not(.ink)')).fill });
      const a = read();
      dbg.setOption('crosshairSize', 2); dbg.setOption('crosshairColour', '#7cf2e2'); dbg.setOption('crosshairOutline', false);
      const b = read();
      const r = xh.getBoundingClientRect();
      return { a, b, centred: Math.abs(r.left + r.width / 2 - innerWidth / 2) < 1 && Math.abs(r.top + r.height / 2 - innerHeight / 2) < 1 };
    });
    assert.deepEqual(x.a, { scale: 1, colour: 'rgb(255, 255, 255)', outline: true, dot: 'rgb(255, 255, 255)' });
    assert.deepEqual(x.b, { scale: 2, colour: 'rgb(124, 242, 226)', outline: false, dot: 'rgb(124, 242, 226)' });
    assert.ok(x.centred);
    // dead: the gauges fade; respawn brings them back
    await game.page.evaluate(() => window.__dbg.setHealth(0));
    let h = await hud();
    assert.deepEqual([h.hud, h.fade, h.screen], ['visible', true, 'death']);
    // polish round 4: the line is full bone, comes up with the ink (no 0.6 s wait) and stands above the crosshair
    const death = await game.page.evaluate(() => { const d = document.querySelector('.k7 .death'), t = d.querySelector('.death-text'), c = getComputedStyle(t); return { text: t.textContent, style: c.fontStyle, fade: getComputedStyle(d).animationName + ' ' + getComputedStyle(d).animationDuration, textIn: `${c.animationName} ${c.animationDuration} ${c.animationDelay}`, colour: c.color, bg: getComputedStyle(d).backgroundColor, px: parseFloat(c.fontSize), clear: t.getBoundingClientRect().bottom < innerHeight / 2 - 20 }; });
    assert.deepEqual(death, { text: STORY.ui.ui_death, style: 'italic', fade: 'k7-death-in 0.6s', textIn: 'k7-death-text 0.3s 0s', colour: 'rgb(233, 226, 208)', bg: 'rgb(20, 17, 15)', px: death.px, clear: true });
    assert.ok(death.px >= 18, `the line is at least 18 px (${death.px})`);
    const deadAt = (await game.state()).tick;
    let respawnAt = -1;
    for (let i = 0; i < 130 && respawnAt < 0; i++) { await frame(game, 1); if ((await game.state()).game === 'playing') respawnAt = (await game.state()).tick; }
    h = await hud();
    assert.deepEqual([h.hud, h.fade, h.screen], ['visible', false, ''], 'back after the respawn');
    // the ink fades off the respawned game; the line is NOT taken away with it: it holds, outlined, and then fades
    const out = await game.page.evaluate(() => {
      const d = document.querySelector('.k7 .death'), t = d.querySelector('.death-text'), cd = getComputedStyle(d), ct = getComputedStyle(t);
      const hold = t.getAnimations().find((a) => a.animationName === 'k7-death-hold'), frames = hold ? hold.effect.getKeyframes().map((k) => [+k.offset.toFixed(4), k.opacity]) : [];
      // the frame it is in half-way through the hold: still whole, the ink gone from behind it
      for (const a of [...d.getAnimations(), ...t.getAnimations()]) { a.pause(); a.currentTime = 900; }
      return { ink: `${cd.animationName} ${cd.animationDuration}`, line: `${ct.animationName} ${ct.animationDuration} ${ct.animationDelay}`, frames, outlined: ct.textShadow !== 'none', display: cd.display, midOpacity: getComputedStyle(t).opacity, midInk: getComputedStyle(d).backgroundColor, dOpacity: getComputedStyle(d).opacity, events: cd.pointerEvents };
    });
    assert.deepEqual([out.ink, out.line, out.outlined, out.display, out.events], ['k7-death-out 0.5s', 'k7-death-hold 1.8s 0s', true, 'flex', 'none'], 'the ink fades back in 0.5 s; the line holds');
    assert.deepEqual(out.frames, [[0, '1'], [0.7778, '1'], [1, '0']]);
    assert.deepEqual([out.midOpacity, out.midInk, out.dOpacity], ['1', 'rgba(0, 0, 0, 0)', '1'], '0.9 s after the respawn the line is whole over the clear game');
    // whole from 0.6 s after the death (the ink's fade) to the respawn, then for 77.78 % of 1.8 s: at least 2.5 s in all
    const whole = (respawnAt - deadAt) / 60 - 0.6 + 1.8 * 0.7778;
    assert.ok(respawnAt > 0 && whole >= 2.5, `the death line is whole for ${whole.toFixed(2)} s (respawn ${respawnAt - deadAt} ticks after the death)`);
    console.log(`death line: whole for ${whole.toFixed(2)} s (respawn after ${respawnAt - deadAt} ticks; it was 0.9 s whole)`);
    // reduced motion: no fades; the line still holds 1.4 s after the respawn and is then cut
    await game.page.evaluate(() => { window.__dbg.setOption('reduceMotion', true); window.__dbg.setHealth(0); });
    for (let i = 0; i < 130 && (await game.state()).game !== 'playing'; i++) await frame(game, 1);
    const rm = await game.page.evaluate(() => { const d = document.querySelector('.k7 .death'), t = d.querySelector('.death-text'), cd = getComputedStyle(d), ct = getComputedStyle(t); return [cd.animationName, cd.backgroundColor, cd.display, `${ct.animationName} ${ct.animationDuration} ${ct.animationTimingFunction}`]; });
    assert.deepEqual(rm, ['none', 'rgba(0, 0, 0, 0)', 'flex', 'k7-death-cut 1.4s steps(1)']);
    await game.page.evaluate(() => window.__dbg.setOption('reduceMotion', false));
    // the title
    await press(game, 'screen/title (save)');
    assert.deepEqual(await hud(), { hud: 'hidden', fade: false, txt: 'hidden', screen: 'title' });
  } finally { await game.close(); }
});

// ---- polish round 2 (playthrough): on a proving mark at hint tier 3 "F BREAK THE BAND" was drawn twice, and the hint
// row stayed up after the band was broken and the round chambered
test('"break the band" is one row, never two, and is gone from the press that breaks it until the round is back in its slot', async () => {
  const game = await openSandbox(server);
  try {
    const rows = () => game.page.evaluate(() => {
      const up = (sel) => { const e = document.querySelector('.k7 ' + sel); return e.classList.contains('on') && getComputedStyle(e).opacity !== '0' || e.classList.contains('on') ? e.textContent : ''; };
      const ui = window.__dbg.state().ui;
      return { prompt: up('.prompt:not(.hint)'), hint: up('.prompt.hint'), vt: [ui.prompt, ui.hint] };
    });
    const TEXT = 'F  Break the band';
    const seventh = (s) => game.page.evaluate((st) => { window.__dbg.ext.core.setSeventh(st); window.__dbg.step(0, true); }, s);
    await seventh('pulse');
    // tier 3 away from a mark: the hint row alone
    await emit(game, 'ui/hint', { key: 'ui_prompt_kept', show: true });
    assert.deepEqual(await rows(), { prompt: '', hint: TEXT, vt: ['', TEXT] });
    // she steps on a mark: the prompt row takes it, the hint row is not a second copy
    await emit(game, 'interact/focus', { id: 'ia_mark_1', prompt: 'ui_prompt_kept', kind: 'kept' });
    assert.deepEqual(await rows(), { prompt: TEXT, hint: '', vt: [TEXT, ''] }, 'one row on the mark');
    // off the mark again: the hint is back (world never re-sent it)
    await emit(game, 'interact/focus', { id: '', prompt: '', kind: '' });
    assert.deepEqual(await rows(), { prompt: '', hint: TEXT, vt: ['', TEXT] });
    // another hint under the kept prompt is not suppressed: only the same key is
    await emit(game, 'interact/focus', { id: 'ia_mark_1', prompt: 'ui_prompt_kept', kind: 'kept' });
    await emit(game, 'ui/hint', { key: 'ui_hint_reload', show: true });
    assert.deepEqual((await rows()).vt, [TEXT, 'R to reload']);
    await emit(game, 'ui/hint', { key: 'ui_prompt_kept', show: true });
    // F: her thumb breaks the band. Both rows come down in the same tick, before the round is in the gun
    await emit(game, 'weapon/kept', { stage: 'loading', mark: 'ia_mark_1' });
    assert.deepEqual(await rows(), { prompt: '', hint: '', vt: ['', ''] }, 'loading clears both');
    await frame(game, 30);
    assert.deepEqual((await rows()).vt, ['', '']);
    // chambered: world drops the focus; its tier 3 hint is still raised and must not show
    await seventh('chambered');
    await emit(game, 'weapon/kept', { stage: 'chambered', mark: 'ia_mark_1' });
    await emit(game, 'interact/focus', { id: '', prompt: '', kind: '' });
    await frame(game, 120);
    assert.deepEqual(await rows(), { prompt: '', hint: '', vt: ['', ''] }, 'nothing while the kept round is under the hammer');
    // other prompts and hints are untouched by all this
    await emit(game, 'interact/focus', { id: 'rd_note_lip', prompt: 'ui_prompt_read', kind: 'read' });
    assert.deepEqual((await rows()).vt, ['E  Read', '']);
    await emit(game, 'interact/focus', { id: '', prompt: '', kind: '' });
    // F again off the bore line: the round goes back to its slot, band broken; the persistent hint returns, one row
    await seventh('band_broken');
    await emit(game, 'weapon/kept', { stage: 'unloaded', mark: '' });
    assert.deepEqual(await rows(), { prompt: '', hint: TEXT, vt: ['', TEXT] }, 'unloaded: the hint is back');
    await emit(game, 'interact/focus', { id: 'ia_mark_2', prompt: 'ui_prompt_kept', kind: 'kept' });
    assert.deepEqual(await rows(), { prompt: TEXT, hint: '', vt: [TEXT, ''] });
    // fired: spent for good. Even if world's hide never came, nothing asks her to break a band that is gone
    await emit(game, 'weapon/kept', { stage: 'loading', mark: 'ia_mark_2' });
    await seventh('spent');
    await emit(game, 'weapon/kept', { stage: 'fired', mark: 'ia_mark_2' });
    assert.deepEqual(await rows(), { prompt: '', hint: '', vt: ['', ''] }, 'spent');
    // a respawn clears the lot
    await emit(game, 'ui/hint', { key: 'ui_prompt_kept', show: false });
    await emit(game, 'interact/focus', { id: '', prompt: '', kind: '' });
    assert.deepEqual((await rows()).vt, ['', '']);
  } finally { await game.close(); }
});

// ---- polish round 3 (story-ux): at 720p the health bars were 4 px tall and easy to lose in the bright street
test('health at 1280 x 720 and 1024 x 768: bars at least 6 px tall inside a 1 px ink outline, clear of the screen edge', async () => {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1024, height: 768 }, { width: 1920, height: 1080 }]) {
    const game = await openSandbox(server, { viewport });
    try {
      await frame(game, 1);
      const h = await game.page.evaluate(() => {
        const segs = [...document.querySelectorAll(".k7 .health .seg")], cs = getComputedStyle(segs[0]), r = segs[0].getBoundingClientRect(), f = segs[0].querySelector(".fill").getBoundingClientRect();
        return { n: segs.length, h: r.height, fill: f.height, shadow: cs.boxShadow, border: cs.borderTopWidth, bottom: innerHeight - r.bottom, left: r.left };
      });
      const at = `${viewport.width}x${viewport.height}`;
      assert.equal(h.n, 3);
      assert.ok(h.h >= 6, `${at}: a bar is ${h.h} px tall (at least 6)`);
      assert.ok(h.fill >= 4, `${at}: its fill is ${h.fill} px tall (at least 4)`);
      assert.ok(/^rgb\(20, 17, 15\) 0px 0px 0px 1px(,|$)/.test(h.shadow), `${at}: a 1 px ink outline outside the bone border (${h.shadow})`);
      assert.ok(h.bottom >= 16 && h.left >= 16, `${at}: clear of the edge`);
    } finally { await game.close(); }
  }
});
