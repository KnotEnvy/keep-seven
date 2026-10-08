// Release pass p0: the issues the final reviewers left with the render team, each measured in the REAL game (all six
// systems) from a checkpoint, a few dozen ticks in each browser, one browser at a time.
//   1  combat       "the tracer starts below the muzzle on the first frame of a shot": the streak leaves the muzzle as
//                   each frame draws it (it was 77, 162 and 194 px off the drawn muzzle on the three frames at 960 x 540)
//   2  robustness   "every tier switch relinks about 39 shader programs": a tier is compiled once; coming back links
//                   nothing, and the GL objects of the tier that was left are given back
//   3  performance  "an automatic switch relinks everything in the middle of play": the tiers the quality manager can
//                   step to by itself are compiled ahead (nothing drawn), so the step itself links nothing
//   4  performance  "High's render-target accounting under-reports": the system counts what GL really allocated (to the
//                   byte), and the perf counter reports that or the manifest's ledger, whichever is larger
// (the allocation issue and the benchmark's verdict: tests/render/quiet.spec.ts; numbers in docs/requests/render-tech.md)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../harness.mjs';
import { openBot } from '../e2e/lib/bot.mjs';

const W = 960, H = 540, MiB = 1048576;

/** Counts what the WebGL context is asked for from now on: program links, and the storage of textures and renderbuffers. */
function glHook() {
  const P = WebGL2RenderingContext.prototype;
  const G = window.__gl = { tex: new Map(), rb: new Map(), links: 0 };
  const BPP = (f) => (f === 0x881A || f === 0x881B ? 8 : f === 0x8814 ? 16 : f === 0x81A5 || f === 0x822D ? 2 : f === 0x8229 || f === 0x1903 ? 1 : 4);
  const state = new WeakMap();
  const S = (gl) => { let s = state.get(gl); if (!s) { s = { unit: 0, bound: {}, rb: null }; state.set(gl, s); } return s; };
  const cur = (gl, target) => { const s = S(gl); return s.bound[s.unit + ':' + target] || null; };
  const wrap = (name, fn) => { const o = P[name]; P[name] = function (...a) { return fn.call(this, o, a); }; };
  wrap('activeTexture', function (o, a) { S(this).unit = a[0]; return o.apply(this, a); });
  wrap('bindTexture', function (o, a) { const s = S(this); s.bound[s.unit + ':' + a[0]] = a[1]; return o.apply(this, a); });
  wrap('createTexture', function (o, a) { const t = o.apply(this, a); G.tex.set(t, { bytes: 0, rt: false }); return t; });
  wrap('deleteTexture', function (o, a) { G.tex.delete(a[0]); return o.apply(this, a); });
  wrap('texStorage2D', function (o, a) { const e = G.tex.get(cur(this, a[0])); if (e) { let b = 0, w = a[3], h = a[4]; for (let i = 0; i < a[1]; i++) { b += w * h * BPP(a[2]); w = Math.max(1, w >> 1); h = Math.max(1, h >> 1); } e.bytes = b; } return o.apply(this, a); });
  wrap('texImage2D', function (o, a) { const e = G.tex.get(cur(this, a[0])); if (e && a[1] === 0 && a.length >= 9) e.bytes = a[3] * a[4] * BPP(a[2]); return o.apply(this, a); });
  wrap('framebufferTexture2D', function (o, a) { const e = G.tex.get(a[3]); if (e) e.rt = true; return o.apply(this, a); });
  wrap('createRenderbuffer', function (o, a) { const t = o.apply(this, a); G.rb.set(t, { bytes: 0 }); return t; });
  wrap('deleteRenderbuffer', function (o, a) { G.rb.delete(a[0]); return o.apply(this, a); });
  wrap('bindRenderbuffer', function (o, a) { S(this).rb = a[1]; return o.apply(this, a); });
  wrap('renderbufferStorage', function (o, a) { const e = G.rb.get(S(this).rb); if (e) e.bytes = a[2] * a[3] * BPP(a[1]); return o.apply(this, a); });
  wrap('renderbufferStorageMultisample', function (o, a) { const e = G.rb.get(S(this).rb); if (e) e.bytes = a[3] * a[4] * BPP(a[2]) * Math.max(1, a[1]); return o.apply(this, a); });
  wrap('linkProgram', function (o, a) { G.links++; return o.apply(this, a); });
  G.read = () => {
    let rt = 0, n = 0;
    for (const e of G.tex.values()) if (e.rt) { rt += e.bytes; n++; }
    let rb = 0; for (const e of G.rb.values()) rb += e.bytes;
    return { links: G.links, targetBytes: rt + rb, targets: n, renderbuffers: G.rb.size };
  };
}
const read = (bot) => bot.page.evaluate(() => {
  const d = window.__dbg, g = window.__gl.read(), p = d.perf(), gl = d.ext.render.system().renderer.getContext();
  const t = d.ext.render.targets();
  return { ...g, programs: p.programs, textures: p.textures, claimed: p.renderTargetBytes, allocated: t.allocated, ledger: Math.round(gl.drawingBufferWidth * gl.drawingBufferHeight * d.ext.core.ctx().data.manifest.tiers[p.tier].bytesPerPixel), canvas: gl.drawingBufferWidth * gl.drawingBufferHeight * 8, tier: p.tier };
});
/** a switch as the options menu or the quality manager makes it, then drawn frames */
const switchTo = (bot, tier, frames = 6) => bot.page.evaluate(async ([t, n]) => { const d = window.__dbg; d.setTier(t); await d.ext.core.stepAsync(n, true); }, [tier, frames]);

test('1: the tracer leaves the muzzle as each frame draws it', async () => {
  const server = await startServer({});
  try {
    const bot = await openBot(server, { piece: 'p0-team-render-tech', tier: 'low', checkpoint: 'cp_street_clear', viewport: { width: W, height: H }, allowErrors: true });
    try {
      const shot = async (ride) => {
        await bot.page.evaluate(async (ride) => {
          const d = window.__dbg; d.god(true); d.aiEnabled(false); d.setAim(200, -8); d.setAmmo(6, 24, 0);
          const fx = d.ext.render.system().fx;
          if (!fx.__ride) fx.__ride = fx.rideLines;
          fx.rideLines = ride ? fx.__ride : () => {};
          await d.ext.core.stepAsync(90, false); d.step(0, true);
          d.tap('fire');
        }, ride);
        const rows = [];
        for (let k = 0; k < 3; k++) {
          rows.push(await bot.page.evaluate(([W, H]) => {
            const d = window.__dbg; d.step(1, true);
            const fx = d.ext.render.system().fx, m = d.ext.render.muzzle(), cam = d.ext.core.ctx().scene.camera, V = fx.lineStart.constructor;
            const px = (x, y, z) => { const v = new V(x, y, z).project(cam); return [(v.x + 1) / 2 * W, (1 - (v.y + 1) / 2) * H]; };
            const out = { muzzle: [m.muzzle.x * W, (1 - m.muzzle.y) * H], rides: m.lineRides, streak: null };
            for (const s of fx.lines.tracer) if (s.active && s.qo >= 0) { const q = fx.quads.data, o = s.qo; out.streak = { tail: px(q[o], q[o + 1], q[o + 2]), head: px(q[o + 4], q[o + 5], q[o + 6]) }; }
            return out;
          }, [W, H]));
        }
        // the distance on the screen from the drawn muzzle to the streak's line, and to its near end
        return rows.map((r) => {
          if (!r.streak) return null;
          const [x1, y1] = r.streak.tail, [x2, y2] = r.streak.head, [mx, my] = r.muzzle, L = Math.hypot(x2 - x1, y2 - y1);
          return { toLine: L > 0.5 ? Math.abs((y2 - y1) * mx - (x2 - x1) * my + x2 * y1 - y2 * x1) / L : Math.hypot(mx - x1, my - y1), toTail: Math.hypot(mx - x1, my - y1), length: L, rides: r.rides };
        });
      };
      const before = await shot(false), after = await shot(true);
      const fmt = (rows) => rows.map((r, k) => (r ? `frame ${k}: ${r.toLine.toFixed(1)} px off the line, ${r.toTail.toFixed(0)} px to its near end` : `frame ${k}: no streak`)).join('; ');
      console.log(`tracer, not riding (as it was): ${fmt(before)}`);
      console.log(`tracer, riding the drawn muzzle: ${fmt(after)}`);
      assert.ok(before[0] && before[0].toLine > 0.05 * H, `the measurement sees the old fault (${before[0] ? before[0].toLine.toFixed(1) : 'no streak'} px on frame 0)`);
      assert.ok(after[0], 'a streak is drawn on the first frame of the shot');
      assert.ok(after[0].toTail < 0.01 * H, `frame 0: the streak begins ${after[0].toTail.toFixed(1)} px from the drawn muzzle (it was ${before[0].toTail.toFixed(0)})`);
      assert.ok(after[0].length > 0.05 * H, `frame 0: the streak has a length on the screen (${after[0].length.toFixed(0)} px)`);
      let seen = 0;
      for (let k = 0; k < after.length; k++) {
        if (!after[k]) continue;
        seen++;
        assert.ok(after[k].toLine < 0.01 * H, `frame ${k}: the streak's line passes ${after[k].toLine.toFixed(1)} px from the drawn muzzle`);
      }
      assert.ok(after[after.length - 1 - after.slice().reverse().findIndex((r) => r)].rides >= seen, 'the streak was re-anchored on each drawn frame of its life');
    } finally { await bot.game.browser.close().catch(() => {}); }
  } finally { await server.close(); }
});

test('2 + 4: a tier is compiled once, coming back links nothing and leaves nothing behind; the target counter is what GL allocated', async () => {
  const server = await startServer({});
  try {
    const bot = await openBot(server, { piece: 'p0-team-render-tech', tier: 'low', checkpoint: 'cp_boss_p1', viewport: { width: W, height: H }, allowErrors: true });
    try {
      await bot.game.step(10, true);
      await bot.page.evaluate(glHook);
      const start = await read(bot);
      const rows = [], firstVisit = {}, onLow = [];
      let prev = start, settled = -1;
      for (const tier of ['min', 'low', 'high', 'low', 'min', 'low', 'high', 'low']) {
        await switchTo(bot, tier);
        const now = await read(bot), links = now.links - prev.links;
        assert.equal(now.tier, tier);
        rows.push(`${tier}: ${links} links, ${now.programs} programs, targets ${((now.targetBytes + now.canvas) / MiB).toFixed(2)} MiB by GL, ${(now.allocated / MiB).toFixed(2)} counted, ${(now.claimed / MiB).toFixed(2)} reported`);
        if (firstVisit[tier] === undefined && tier !== 'low') {
          firstVisit[tier] = links;
          assert.ok(links > 0, `${tier}, first visit: its programs are compiled (${links} links)`);
        } else assert.equal(links, 0, `${tier} again: ${links} programs linked (it was 38 to 46 on every switch)`);
        if (Object.keys(firstVisit).length === 2 && settled < 0) settled = now.programs;
        else if (settled >= 0) assert.equal(now.programs, settled, `${tier}: the program count is steady once every tier was seen`);
        // every target of this tier was allocated after the hook went in (the chain's targets are freed on leaving a
        // tier): the hook's bytes + the canvas (colour + depth, 8 bytes a pixel) are the truth
        const gl = now.targetBytes + now.canvas;
        assert.equal(now.allocated, gl, `${tier}: the system counts ${now.allocated} B of targets, GL allocated ${gl}`);
        // what the perf counter reports is never under that (it was 3.5 MiB under on High at 1280 x 720, 7.9 at 1920 x 1080),
        // and never under the manifest's ledger for the tier (Low's ledger counts a scene buffer that is never allocated)
        assert.ok(now.claimed >= gl, `${tier}: ${now.claimed} B reported, ${gl} B allocated`);
        if (tier !== 'min') assert.equal(now.claimed, Math.max(now.allocated, now.ledger + (tier === 'high' ? 8 * MiB : 0)), `${tier}: reported = the larger of allocated and the ledger`);
        // the closer of this pass corrected the manifest's ledger (Low: one scene buffer, 20 bytes a pixel; High: a depth
        // for each scene buffer, 39.33): what is allocated per pixel is now the ledger's figure within 1 % on both tiers
        // (it was 28 claimed for 20 on Low and 35.33 for 39.3 on High)
        if (tier === 'high') assert.ok(now.allocated <= now.ledger + 8 * MiB && now.allocated >= now.ledger * 0.99, `high: ${now.allocated} B allocated (the shadow map included once three has made it), the ledger says ${now.ledger} + 8 MiB`);
        if (tier === 'low') assert.ok(Math.abs(now.allocated - now.ledger) <= now.ledger * 0.01, `low: ${now.allocated} B allocated, the ledger says ${now.ledger}`);
        if (tier === 'low') onLow.push(now);
        if (tier === 'min') assert.equal(now.targets + now.renderbuffers, 0, `min: ${now.targets} target textures and ${now.renderbuffers} renderbuffers are still allocated`);
        prev = now;
      }
      console.log(`tier switches (Low at the start: ${start.programs} programs, ${start.textures} textures): ${rows.join('; ')}`);
      for (const l of onLow) {
        assert.equal(l.textures, start.textures, `back on Low: ${l.textures} textures, ${start.textures} before any switch`);
        assert.equal(l.targets, onLow[0].targets, 'back on Low: the same number of target textures every time');
        assert.equal(l.targetBytes, onLow[0].targetBytes, 'back on Low: the same target bytes every time');
      }
      assert.deepEqual(bot.game.consoleErrors, []);
    } finally { await bot.game.browser.close().catch(() => {}); }
  } finally { await server.close(); }
});

for (const [from, to, cp, toward] of [['low', 'min', 'cp_street_clear', 'cp_yard_clear'], ['high', 'low', 'cp_street_clear', 'cp_yard_clear'], ['min', 'low', 'cp_gallery_bay', 'cp_file_clear']]) {
  test(`3: from ${from}, the tier the quality manager can step to (${to}) is compiled ahead: the step and the fight after it link nothing`, async () => {
    const server = await startServer({});
    try {
      const bot = await openBot(server, { piece: 'p0-team-render-tech', tier: from, checkpoint: cp, viewport: { width: 480, height: 270 }, allowErrors: true });
      try {
        await bot.game.step(10, true);
        await bot.page.evaluate(glHook);
        const a = await read(bot);
        const state0 = await bot.page.evaluate(() => window.__dbg.ext.render.warmState());
        const done = await bot.page.evaluate(() => window.__dbg.ext.render.warmNeighbours());
        const b = await read(bot);
        assert.deepEqual(done, [to], `the neighbour of ${from}`);
        assert.ok(b.links > a.links, `compiling ${to} ahead links its programs (${b.links - a.links})`);
        assert.equal(b.targetBytes, a.targetBytes, 'compiling ahead allocates no render target');
        assert.equal(b.targets, a.targets); assert.equal(b.renderbuffers, a.renderbuffers);
        assert.deepEqual(await bot.page.evaluate(() => window.__dbg.ext.render.warmNeighbours()), [], 'a second call has nothing to do');
        // drawn frames on the tier it was compiled FROM still link nothing (three finds each program again by its key)
        await bot.game.step(6, true);
        const c = await read(bot);
        assert.equal(c.links, b.links, `${from}: ${c.links - b.links} links on the frames after compiling ahead`);
        // the step, as the manager makes it in play, then a fight: she walks on, the encounter wakes, she fires
        const warm0 = await bot.page.evaluate(() => window.__dbg.ext.render.warmState().warmUps);
        const alive = await bot.page.evaluate(async ([t, toward]) => {
          const d = window.__dbg; d.god(true); d.aiEnabled(true); d.setTier(t);
          d.followPath(toward, { maxTicks: 200 });
          const clock = d.ext.core.ctx().clock;
          let most = 0;
          for (let i = 0; i < 40; i++) {
            if (clock.tick % 20 === 0) { d.setAmmo(6, 24, 0); d.tap('fire'); }
            await d.ext.core.stepAsync(6, true);
            most = Math.max(most, d.enemies().filter((x) => x.alive).length);
          }
          return most;
        }, [to, toward]);
        const e = await read(bot), state = await bot.page.evaluate(() => window.__dbg.ext.render.warmState());
        console.log(`${from} -> ${to}: ${b.links - a.links} links ahead of time, ${e.links - c.links} at the step and in 240 ticks of play after it (up to ${alive} enemies alive; programs ${a.programs} -> ${e.programs}; warm-ups ${state0.warmUps} -> ${state.warmUps})`);
        assert.equal(e.tier, to);
        assert.equal(e.links, c.links, `${from} -> ${to}: ${e.links - c.links} programs linked at the step or in play after it`);
        assert.equal(state.warmUps, warm0, 'the step ran no warm-up (no hidden frame, no compile)');
        assert.deepEqual(bot.game.consoleErrors, []);
      } finally { await bot.game.browser.close().catch(() => {}); }
    } finally { await server.close(); }
  });
}
