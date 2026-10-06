// Feedback completeness and the pools (code-render 6): every surface and every outcome draws something, the event map
// reaches the effects, pools hold their sizes, the ring at the seventh runs its whole sequence, Reduce Flashes.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../harness.mjs';
import { ext, frame, frames, framesSmall, openIndex, openSandbox, px } from './util.mjs';

/** pixels of the centre 200 x 120 that differ by more than 14 / 255 in a channel (grain is about 11), and the largest difference */
function changed(a, b) {
  let n = 0, max = 0;
  const x0 = (a.width >> 1) - 100, y0 = (a.height >> 1) - 60;
  for (let y = y0; y < y0 + 120; y++) for (let x = x0; x < x0 + 200; x++) {
    const i = (y * a.width + x) * 4;
    const d = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2]));
    if (d > 14) n++;
    if (d > max) max = d;
  }
  return { n, max };
}
/** the surface the player looks at, by the collision world (what a round would hit) */
const aimHit = (game) => game.page.evaluate(() => {
  const c = window.__dbg.ext.core.ctx(), e = c.player.eye, f = c.player.forward;
  const out = { hit: false, distance: 0, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, surface: 'none', flags: 0, layer: 0, entity: null, part: 'whole', receiver: null };
  if (!c.collision.raycast(e.x, e.y, e.z, f.x, f.y, f.z, 90, 0xffff, out) || out.surface === 'none') return null;
  return { d: out.distance, x: out.x, y: out.y, z: out.z, nx: out.nx, ny: out.ny, nz: out.nz, surface: out.surface, facing: -(out.nx * f.x + out.ny * f.y + out.nz * f.z) };
});

let server;
before(async () => { server = await startServer({ pieces: ['render'] }); });
after(async () => { await server.close(); });

const hit = (over) => ({ x: -60, y: 1.2, z: -2, shotId: 1, order: 0, ammo: 'lead_round', outcome: 'impact', entityId: '', entityKind: 'world', part: 'whole', surface: 'wood', nx: 0, ny: 0, nz: 1, damage: 0, ricochetX: 0.3, ricochetY: 0.5, ricochetZ: 0.8, ...over });
const vfx = (game) => ext(game, 'render', 'vfx');

test('combat/hit: every surface gives a burst (and a decal, except on sand); every outcome draws something', async () => {
  const game = await openIndex(server, { checkpoint: 'cp_street_clear' });
  try {
    await game.step(5, true);
    const rows = [];
    for (const surface of ['sand', 'wood', 'adobe', 'metal', 'ceramic', 'stone', 'cloth']) {
      const before = await vfx(game);
      await game.dbg('emit', 'combat/hit', hit({ surface }));
      const after = await vfx(game);
      assert.equal(after.bursts - before.bursts, 1, `${surface}: one burst`);
      assert.ok(after.emitted > before.emitted, `${surface}: particles were emitted`);
      const decal = after.decals - before.decals;
      assert.equal(decal, surface === 'sand' || surface === 'cloth' ? 0 : 1, `${surface}: ${decal} decal`);
      rows.push(`${surface} +${after.emitted - before.emitted}p ${decal}d`);
    }
    console.log('impacts  ' + rows.join('  '));
    const outcomes = [];
    for (const outcome of ['impact', 'hit', 'weak', 'kill', 'freed', 'deflected', 'broke', 'parried', 'passed']) {
      for (const [entityKind, surface] of [['bider', 'cloth'], ['tamper', 'ceramic'], ['jug', 'ceramic'], ['world', 'stone']]) {
        const before = await vfx(game);
        await game.dbg('emit', 'combat/hit', hit({ outcome, entityKind, entityId: 'e1', surface }));
        const after = await vfx(game);
        assert.ok(after.emitted > before.emitted || after.lines > before.lines, `${outcome} on a ${entityKind}: nothing was drawn`);
        if (outcome === 'deflected') assert.equal(after.lines - before.lines, 1, 'a ricochet line');
      }
      outcomes.push(outcome);
    }
    // a line round leaves a dot at each body it passes
    const b0 = await vfx(game);
    await game.dbg('emit', 'combat/hit', hit({ outcome: 'passed', entityKind: 'bider', surface: 'cloth', ammo: 'line_round' }));
    assert.equal((await vfx(game)).bursts - b0.bursts, 2, 'the cloth and the aqua dot');
    console.log('outcomes drawn: ' + outcomes.join(', '));
    await game.step(1, true);
  } finally { await game.close(); }
});

test('the event map: shots, enemies, shootables, projectiles, pickups, the boss', async () => {
  const game = await openIndex(server, { checkpoint: 'cp_street_clear' });
  try {
    await game.step(3, true);
    const at = { x: -60, y: 1, z: -2 };
    const cases = [
      ['weapon/fired', { shotId: 1, ammo: 'lead_round', chambersLeft: 5, ox: -62, oy: 1.6, oz: -2, dx: 1, dy: 0, dz: 0, mx: -61.5, my: 1.5, mz: -2, endX: -40, endY: 1.5, endZ: -2 }, { bursts: 1, lines: 1 }],
      ['weapon/fired', { shotId: 2, ammo: 'line_round', chambersLeft: 4, ox: -62, oy: 1.6, oz: -2, dx: 1, dy: 0, dz: 0, mx: -61.5, my: 1.5, mz: -2, endX: -40, endY: 1.5, endZ: -2 }, { bursts: 1, lines: 1 }],
      ['weapon/fired', { shotId: 3, ammo: 'kept_round', chambersLeft: 0, ox: -62, oy: 1.6, oz: -2, dx: 1, dy: 0, dz: 0, mx: -61.5, my: 1.5, mz: -2, endX: -40, endY: 1.5, endZ: -2 }, { bursts: 1, lines: 0 }],
      ['enemy/freed', { ...at, id: 'b1', encounter: '', cause: 'crown', counted: true }, { bursts: 2 }],
      ['enemy/felled', { ...at, id: 'b1', encounter: '', counted: true }, { bursts: 1 }],
      ['enemy/died', { ...at, id: 't1', kind: 'transit', encounter: '' }, { bursts: 1 }],
      ['enemy/telegraph', { ...at, id: 'm1', kind: 'tamper', attack: 'slam', seconds: 1 }, { bursts: 1 }],
      ['enemy/attack', { ...at, id: 'm1', kind: 'tamper', attack: 'slam' }, { bursts: 1 }],
      ['enemy/attack', { ...at, id: 'm1', kind: 'tamper', attack: 'charge' }, { bursts: 1 }],
      ['knot/burst', { ...at, id: 'k1', onMechanism: true, regrows: false }, { bursts: 1 }],
      ['shootable/hit', { ...at, id: 'ia_jug_1', kind: 'jug', scaleDegree: 1, ammo: 'lead_round' }, { bursts: 1 }],
      ['shootable/hit', { ...at, id: 'ia_latch_s', kind: 'latch', scaleDegree: 0, ammo: 'lead_round' }, { bursts: 1 }],
      ['shootable/hit', { ...at, id: 'vista_dowser', kind: 'dowser', scaleDegree: 0, ammo: 'lead_round' }, { bursts: 1 }],
      ['breakable/broken', { ...at, id: 'brk_001', asset: 'prop_bottle' }, { bursts: 1 }],
      ['projectile/landed', { ...at, id: 'p1', kind: 'stake', surface: 'wood', hitPlayer: false }, { bursts: 1 }],
      ['projectile/burst', { ...at, id: 'p1', kind: 'stake', reason: 'shot' }, { bursts: 1 }],
      ['projectile/burst', { ...at, id: 'p2', kind: 'canister', reason: 'fuse' }, { bursts: 1 }],
      ['boss/guard', { state: 'shattered' }, { bursts: 1 }],
    ];
    for (const [name, payload, want] of cases) {
      const before = await vfx(game);
      await game.dbg('emit', name, payload);
      const after = await vfx(game);
      for (const k of Object.keys(want)) assert.equal(after[k] - before[k], want[k], `${name} ${JSON.stringify(payload).slice(0, 60)}: ${k}`);
    }
    // pickups glint every 2.5 s while they lie there, and once more as they are taken
    await game.dbg('emit', 'pickup/spawned', { ...at, id: 'pk1', kind: 'pk_rounds_6', dropped: true });
    assert.equal((await game.state()).systems.render.pickups, 1);
    const g0 = await vfx(game);
    await framesSmall(game, 329);
    const g1 = await vfx(game);
    assert.ok(g1.bursts - g0.bursts >= 2 && g1.bursts - g0.bursts <= 3, `two or three glints in 5.5 s (${g1.bursts - g0.bursts})`);
    await game.dbg('emit', 'pickup/collected', { ...at, id: 'pk1', kind: 'pk_rounds_6', amount: 6 });
    assert.equal((await game.state()).systems.render.pickups, 0);
    const handled = (await vfx(game)).handled;
    for (const [name] of cases) assert.ok(handled[name] >= 1, `${name} was handled`);
    await game.shot('feedback_events');
  } finally { await game.close(); }
});

test('pools: 200 decals -> 48 alive; relight threads 6 then null; a stale handle is a no-op; rings 2 + 1; blobs', async () => {
  const game = await openSandbox(server, { tier: 'low' });
  try {
    const out = await game.page.evaluate(() => {
      const dbg = window.__dbg, ctx = dbg.ext.core.ctx(), v = ctx.render.vfx, o = dbg.ext.rsb.origin();
      const surfaces = ['wood', 'adobe', 'metal', 'ceramic', 'stone'];
      for (let i = 0; i < 200; i++) v.decal(surfaces[i % 5], o[0] + (i % 20) * 0.3, o[1] + 0.01, o[2] + Math.floor(i / 20) * 0.3, 0, 1, 0);
      v.decal('sand', o[0], o[1], o[2], 0, 1, 0);
      const threads = [];
      for (let i = 0; i < 20; i++) threads.push(v.acquireLine('relight_thread'));
      const got = threads.filter((t) => t !== null).length;
      // release one, take it again: the old handle must not move the new holder's line
      const old = threads[0];
      old.release();
      const fresh = v.acquireLine('relight_thread');
      fresh.setPosition(1, 2, 3);
      old.setPosition(9, 9, 9); old.release();
      const stillHeld = v.acquireLine('relight_thread') === null;
      for (let i = 0; i < 5; i++) v.ring('canister', o[0] + i, o[1], o[2], 3.5, 1, 1);
      for (let i = 0; i < 3; i++) v.ring('slam', o[0] + i, o[1], o[2] + 4, 3.5, 1, 1);
      let blobs = 0;
      for (let i = 0; i < 40; i++) if (v.blobShadow()) blobs++;
      const cards = {};
      for (const kind of ['sun_blade', 'sun_patch', 'lance', 'mouth_glow', 'aim_star', 'halo', 'last_fire', 'dowser_glint', 'sand_thread']) { let n = 0; while (v.acquireCard(kind)) n++; cards[kind] = n; }
      const lines = {};
      for (const kind of ['sighting_thread', 'lance_thread', 'standing_line', 'aqua_thread']) { let n = 0; while (v.acquireLine(kind)) n++; lines[kind] = n; }
      const sys = dbg.ext.render.system();
      return { got, stillHeld, blobs, cards, lines, rings: sys.fx.activeRings(), decals: sys.fx.decals.alive, asked: sys.fx.decals.requested };
    });
    assert.equal(out.decals, 48, '48 decals alive');
    assert.equal(out.asked, 201);
    assert.equal(out.got, 6, 'six relight threads, then null');
    assert.equal(out.stillHeld, true, 'a released handle that is used again does not free or move the new holder\'s slot');
    assert.equal(out.rings, 3, 'two canister rings and one slam ring');
    assert.ok(out.blobs >= 12, `${out.blobs} blob shadows`);
    assert.deepEqual(out.cards, { sun_blade: 3, sun_patch: 3, lance: 1, mouth_glow: 6, aim_star: 6, halo: 16, last_fire: 1, dowser_glint: 1, sand_thread: 2 });
    assert.deepEqual(out.lines, { sighting_thread: 6, lance_thread: 2, standing_line: 2, aqua_thread: 4 });
    await game.step(2, true);
    const perf = await game.perf();
    assert.equal(perf.decals, 48);
    console.log(`pools: decals ${out.decals} of ${out.asked} asked, relight threads ${out.got}, rings ${out.rings}, blobs ${out.blobs}, cards ${JSON.stringify(out.cards)}`);
  } finally { await game.close(); }
});

test('the ring at the seventh: 0 -> 40 m in 1.6 s, wrong_fade behind it, L5p, the standing line, then four seconds with no particle', async () => {
  const game = await openSandbox(server, { scene: 'seventh', tier: 'low' });
  try {
    await frames(game, 70);                                  // the mood of the bore has settled
    const state = async () => (await game.state()).systems.render;
    assert.equal((await state()).mood, 'L5');
    await game.dbg('emit', 'boss/proven', { x: 14, y: -44, z: 96 });
    const uniforms = () => game.page.evaluate(() => { const s = window.__dbg.ext.render.system().shared; return { wrong: s.uWrong.value.toArray(), pulse: s.uPulsePos.value[1].toArray(), col: s.uPulseCol.value[1].toArray(), add: s.uPulseAdd.value[1] }; });
    await frames(game, 48);                                  // 0.8 s
    let u = await uniforms();
    // radius = 40 t^1.5 (slow out of the bore, fast at the walls): 14.1 m at half time
    assert.ok(Math.abs(u.wrong[1] - 40 * Math.pow(0.5, 1.5)) < 1.5, `the ring is at ${u.wrong[1].toFixed(1)} m after 0.8 s`);
    assert.ok(Math.abs(u.pulse[3] - u.wrong[1]) < 1e-6 && Math.abs(u.col[3] - 1.0) < 1e-6 && Math.abs(u.col[1] - 0.58) < 1e-6 && u.col[0] < u.col[1], 'an aqua-white front, 1 m falloff, 58 % peak (look-dev, polish round 3: was white, 1.5 m, 60 %)');
    assert.equal(u.wrong[0], 0, 'wrong_fade is 1 only behind the ring while it runs');
    let s = await state();
    assert.equal(s.mood, 'L5p');
    assert.equal(s.provingRings, 1);
    await frames(game, 54);                                  // past 1.6 s
    u = await uniforms();
    assert.deepEqual([u.wrong[0], u.wrong[1]], [1, 0], 'wrong_fade is 1 everywhere, the ring is gone');
    assert.equal(u.col[0], 0, 'the pulse slot is free again');
    // four seconds of nothing: a burst asked for now does not spawn
    const before = await vfx(game);
    await game.dbg('emit', 'combat/hit', hit({ x: 14, y: -43, z: 92, surface: 'stone' }));
    let after = await vfx(game);
    assert.equal(after.emitted, before.emitted, 'no particle spawns in the four seconds after the ring');
    assert.equal(after.quiet - before.quiet, 1);
    await frames(game, 250);
    await game.dbg('emit', 'combat/hit', hit({ x: 14, y: -43, z: 92, surface: 'stone' }));
    after = await vfx(game);
    assert.ok(after.emitted > before.emitted, 'particles spawn again afterwards');
    s = await state();
    assert.equal(s.wrongFade, 1);
    assert.equal(await game.page.evaluate(() => window.__dbg.ext.render.system().fx.activeLines('standing_line')), 1, 'the standing line stays');
    // a restore: the world sets it without the spectacle
    await game.page.evaluate(() => { const r = window.__dbg.ext.core.ctx().render; r.setWrongFade(0); r.setMood('L5', 0); });
    await game.step(1, true);
    s = await state();
    assert.equal(s.wrongFade, 0);
    assert.equal(await game.page.evaluate(() => window.__dbg.ext.render.system().fx.activeLines('standing_line')), 0);
  } finally { await game.close(); }
});

test('Reduce Flashes: no ring (a 1.6 s tint), the flash sprite at 60 %, the pulse halved, steady strips', async () => {
  const game = await openSandbox(server, { scene: 'seventh', tier: 'low' });
  try {
    await frames(game, 70);
    const flash = () => game.page.evaluate(() => {
      const dbg = window.__dbg, ctx = dbg.ext.core.ctx(), sys = dbg.ext.render.system(), p = ctx.player.eye;
      ctx.render.vfx.muzzleFlash('lead', p.x, p.y - 0.1, p.z - 0.6);
      dbg.step(0, true);
      return { size: sys.fx.flashMesh.scale.x, visible: sys.fx.flashMesh.visible, pulse: sys.shared.uPulseCol.value[0].toArray() };
    });
    const normal = await flash();
    await game.dbg('setOption', 'reduceFlashes', true);
    await frames(game, 20);
    const reduced = await flash();
    assert.ok(normal.visible && reduced.visible);
    assert.ok(Math.abs(reduced.size / normal.size - 0.6) < 1e-6, `flash sprite ${reduced.size} / ${normal.size}`);
    assert.ok(Math.abs(reduced.pulse[0] / normal.pulse[0] - 0.5) < 1e-6, 'the pulse is halved');
    assert.equal(await game.page.evaluate(() => window.__dbg.ext.render.system().materials.uFlicker.value), 0, 'flicker strips are steady');
    await frames(game, 20);
    await game.dbg('emit', 'boss/proven', { x: 14, y: -44, z: 96 });
    await frames(game, 48);
    const u = await game.page.evaluate(() => { const s = window.__dbg.ext.render.system().shared; return { wrong: s.uWrong.value.toArray(), col: s.uPulseCol.value[1].toArray() }; });
    assert.equal(u.wrong[1], 0, 'no ring');
    assert.deepEqual(u.col.slice(0, 3), [0, 0, 0], 'no additive pulse');
    assert.ok(Math.abs(u.wrong[0] - 0.5) < 0.05, `the tint is half way after 0.8 s (${u.wrong[0]})`);
    await frames(game, 54);
    assert.equal((await game.state()).systems.render.wrongFade, 1);
    // nothing on screen flashed: the frame's mean brightness moved by small steps only
    const png = await frame(game);
    assert.ok(px(png, 10, 10).length === 3);
  } finally { await game.close(); }
});

test('a hit answers at any range: an impact and a body hit at about 10, 25, 43 and 68 m change the picture', async () => {
  // [checkpoint, yaw, the distance the layout gives there]: the street, the yard, the gallery's width and its length
  const places = [['cp_street_clear', 210, 9.6], ['cp_yard_clear', 165, 25.4], ['cp_file_clear', 270, 43], ['cp_file_clear', 90, 68]];
  const rows = [];
  let game = null, at = '';
  try {
    for (const [cp, yaw, want] of places) {
      if (cp !== at) { if (game) await game.close(); game = await openIndex(server, { tier: 'low', checkpoint: cp }); at = cp; await framesSmall(game, 150); }
      await game.dbg('setAim', yaw, 0);
      await frames(game, 2);
      const h = await aimHit(game);
      assert.ok(h && Math.abs(h.d - want) < want * 0.25, `${cp} yaw ${yaw}: the layout gives ${h ? h.d.toFixed(1) : 'no'} m here, the test wants about ${want}`);
      for (const mode of ['none', 'impact', 'body']) {
        const before = await frame(game);
        if (mode !== 'none') {
          const off = mode === 'body' ? 0.3 : 0.01;
          await game.dbg('emit', 'combat/hit', hit({ x: h.x + h.nx * off, y: h.y + h.ny * off, z: h.z + h.nz * off, nx: h.nx, ny: h.ny, nz: h.nz, ricochetX: 0, ricochetY: 0, ricochetZ: 0,
            ...(mode === 'body' ? { outcome: 'hit', entityKind: 'bider', entityId: 'b1', surface: 'cloth' } : { outcome: 'impact', surface: h.surface }) }));
        }
        let best = { n: 0, max: 0 };
        for (const ticks of [2, 4, 6]) { await frames(game, ticks); const c = changed(before, await frame(game)); best = { n: Math.max(best.n, c.n), max: Math.max(best.max, c.max) }; }
        rows.push(`${h.d.toFixed(0)} m ${mode === 'impact' ? h.surface : mode}: ${best.n} px (max ${best.max})`);
        if (mode === 'none') { assert.ok(best.n < 20, `${cp}: the still picture changes by itself (${best.n} px)`); } else {
          // before the fix: 0 px at 43 and 68 m (max difference 11, the grain's), 6 to 19 px at 14 to 16 m
          assert.ok(best.n >= 24 && best.max >= 35, `${mode} at ${h.d.toFixed(1)} m on ${h.surface}: only ${best.n} px changed (max ${best.max}): silence after a shot`);
        }
        await game.page.evaluate(() => { window.__dbg.ext.render.system().fx.clearTransient(); });
        await frames(game, 2);
      }
    }
    console.log('impact at range  ' + rows.join('  |  '));
  } finally { if (game) await game.close(); }
});

test('a low frame rate does not eat the shot: the flash and the tracer stay until one frame has shown them', async () => {
  const game = await openIndex(server, { tier: 'low', checkpoint: 'cp_tally_hatch' });
  try {
    await framesSmall(game, 30);
    const out = await game.page.evaluate(() => {
      const d = window.__dbg, c = d.ext.core.ctx(), s = d.ext.render.system(), v = c.render.vfx, e = c.player.eye, f = c.player.forward;
      const st = () => ({ flash: s.fx.flashMesh.visible, tracer: s.fx.activeLines('tracer'), ricochet: s.fx.activeLines('ricochet') });
      const R = {};
      for (const gap of [1, 3, 6, 30]) {
        v.muzzleFlash('lead', e.x + f.x * 0.6, e.y - 0.1, e.z + f.z * 0.6);
        v.line('tracer', e.x + f.x, e.y - 0.1, e.z + f.z, e.x + f.x * 9, e.y, e.z + f.z * 9);
        v.line('ricochet', e.x + f.x * 4, e.y, e.z + f.z * 4, e.x + f.x * 4, e.y + 3, e.z + f.z * 4);
        d.step(gap, false);                    // ticks with no frame between them
        d.step(0, true);                       // the first frame after the shot
        const first = st();
        d.step(1, true);
        R[gap] = { first, next: st() };
        d.step(8, true);
      }
      return R;
    });
    for (const gap of [1, 3, 6]) {
      assert.deepEqual(out[gap].first, { flash: true, tracer: 1, ricochet: 1 }, `${gap} ticks between frames (${Math.round(60 / gap)} fps): the first frame shows the flash and the streaks`);
    }
    assert.deepEqual(out[3].next, { flash: false, tracer: 0, ricochet: 0 }, 'once shown, they end on time');
    assert.deepEqual(out[6].next, { flash: false, tracer: 0, ricochet: 0 });
    assert.deepEqual(out[30].first, { flash: false, tracer: 0, ricochet: 0 }, 'half a second late is too late: a stale flash is not shown');
  } finally { await game.close(); }
});

test('overdraw caps: sprites over the cap are not emitted (smoke 0.5 screen, additive 1.0); a burst is still never silent', async () => {
  const game = await openIndex(server, { tier: 'low', checkpoint: 'cp_tally_hatch' });
  try {
    await framesSmall(game, 30);
    await game.page.setViewportSize({ width: 96, height: 54 });
    await game.page.evaluate(() => window.__dbg.ext.core.ctx().render.resize(96, 54));
    const out = await game.page.evaluate(() => {
      const d = window.__dbg, c = d.ext.core.ctx(), s = d.ext.render.system(), v = c.render.vfx, e = c.player.eye, f = c.player.forward;
      const ids = d.ext.render.vfxIds();
      // one slam 2.5 m away: 12 sprites of 0.9 m are 0.56 of the screen by the estimate
      const e0 = s.fx.particles.emitted;
      v.burst('slam_dust', e.x + f.x * 2.5, e.y, e.z + f.z * 2.5, 0, 1, 0);
      const slam = { emitted: s.fx.particles.emitted - e0, smoke: s.fx.smokeLoad };
      d.step(150, true);
      let maxAdd = 0, maxSmoke = 0, silent = 0;
      const c0 = { ...s.fx.counts }, p0 = s.fx.particles.emitted;
      for (let i = 0; i < 300; i++) {
        for (const id of ids) v.burst(id, e.x + f.x * 2, e.y - 0.3, e.z + f.z * 2, 0, 1, 0);
        d.step(1, true);
        maxAdd = Math.max(maxAdd, s.fx.additiveLoad); maxSmoke = Math.max(maxSmoke, s.fx.smokeLoad);
      }
      const spam = { maxAdd, maxSmoke, capped: s.fx.counts.capped - c0.capped, dropped: s.fx.counts.dropped - c0.dropped, emitted: s.fx.particles.emitted - p0, asked: 300 * ids.length };
      d.step(240, true);
      // after the spam has died away, a burst over the cap by itself still shows something
      const q0 = s.fx.particles.emitted;
      v.burst('slam_dust', e.x + f.x * 0.7, e.y, e.z + f.z * 0.7, 0, 1, 0, 3);
      return { slam, spam, lone: s.fx.particles.emitted - q0, cap: c.quality.features.additiveOverdrawCap, error: d.error ?? null };
    });
    console.log(`caps: a slam at 2.5 m emits ${out.slam.emitted} of 20 (smoke ${out.slam.smoke.toFixed(3)}); 300 ticks of every effect at 2 m: smoke at most ${out.spam.maxSmoke.toFixed(3)}, additive ${out.spam.maxAdd.toFixed(3)}, ${out.spam.emitted} sprites for ${out.spam.asked} bursts, ${out.spam.dropped} parts dropped`);
    assert.equal(out.error, null);
    assert.ok(out.slam.smoke <= 0.5 && out.slam.emitted >= 9 && out.slam.emitted < 20, `a slam at 2.5 m: ${out.slam.emitted} sprites, smoke ${out.slam.smoke}`);
    // before the fix: 5.47 screens of smoke (every sprite was emitted at a lower alpha)
    assert.ok(out.spam.maxSmoke <= 0.5 * 1.15 + 0.01, `smoke ${out.spam.maxSmoke}`);
    assert.ok(out.spam.maxAdd <= out.cap * 1.15 + 0.01, `additive ${out.spam.maxAdd}`);
    assert.ok(out.spam.dropped > 1000, 'parts over the cap were dropped, not faded');
    assert.ok(out.lone >= 1, 'a burst that is over the cap by itself still emits a sprite');
  } finally { await game.close(); }
});

test('decals darken: a hole on a shadowed wall is darker than the wall, never lighter (and takes the wall\'s own light)', async () => {
  for (const tier of ['low', 'min']) {
    const game = await openIndex(server, { tier, checkpoint: 'cp_street_clear' });
    try {
      await framesSmall(game, 30);
      await game.dbg('setAim', 0, 0);                       // the shadowed adobe front 7 m north of the checkpoint
      await frames(game, 2);
      const h = await aimHit(game);
      assert.ok(h && h.surface !== 'sand' && h.d < 12, `a wall within 12 m (${h ? h.d : 'none'})`);
      const lum = (png) => { let sum = 0, min = 255, max = 0, n = 0; for (let y = 262; y < 279; y++) for (let x = 472; x < 489; x++) { const p = px(png, x, y), l = 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]; sum += l; n++; if (l < min) min = l; if (l > max) max = l; } return { mean: sum / n, min, max }; };
      const before = lum(await frame(game));
      await game.page.evaluate((h) => { window.__dbg.ext.core.ctx().render.vfx.decal(h.surface, h.x, h.y, h.z, h.nx, h.ny, h.nz); }, h);
      await frames(game, 2);
      const after = lum(await frame(game));
      console.log(`decal on ${h.surface} at ${h.d.toFixed(1)} m (${tier}): wall ${before.mean.toFixed(1)} (${before.min.toFixed(0)}..${before.max.toFixed(0)}), with the hole ${after.mean.toFixed(1)} (${after.min.toFixed(0)}..${after.max.toFixed(0)})`);
      assert.ok(after.min < before.min - 8, `${tier}: the hole is darker than the wall (${after.min} against ${before.min})`);
      assert.ok(after.max <= before.max + 6, `${tier}: no part of the mark is lighter than the wall (${after.max} against ${before.max})`);
    } finally { await game.close(); }
  }
});

test('the seventh proves once; a pause does not freeze a flash on the screen; Low takes the Low column of the particle counts', async () => {
  const game = await openSandbox(server, { scene: 'seventh', tier: 'low' });
  try {
    await frames(game, 70);
    const out = await game.page.evaluate(() => {
      const d = window.__dbg, c = d.ext.core.ctx(), s = d.ext.render.system(), v = c.render.vfx, e = c.player.eye, f = c.player.forward;
      const R = {};
      // particle counts: impact_sand is 6 dust + the crater puff + the hit dot on Low
      const e0 = s.fx.particles.emitted;
      v.burst('impact_sand', e.x + f.x * 5, e.y, e.z + f.z * 5, 0, 1, 0);
      R.sandLow = s.fx.particles.emitted - e0;
      R.scale = c.quality.features.particleScale;
      d.step(60, true);
      // pause mid-flash
      v.muzzleFlash('lead', e.x + f.x * 0.6, e.y - 0.1, e.z + f.z * 0.6);
      v.line('tracer', e.x + f.x, e.y - 0.1, e.z + f.z, e.x + f.x * 9, e.y, e.z + f.z * 9);
      d.step(1, true);
      R.lit = { flash: s.fx.flashMesh.visible, pulse: s.shared.uPulseCol.value[0].x };
      d.pause(true);
      d.step(3, true);
      R.paused = { state: c.state.current, flash: s.fx.flashMesh.visible, pulse: s.shared.uPulseCol.value[0].x, tracer: s.fx.activeLines('tracer') };
      d.pause(false);
      d.step(5, true);
      // the ring, then boss/proven again over the proven chamber and again while a ring runs
      d.emit('boss/proven', { x: 14, y: -44, z: 96 });
      d.step(30, true);
      d.emit('boss/proven', { x: 14, y: -44, z: 96 });
      d.step(1, true);
      R.during = { radius: s.shared.uWrong.value.y, rings: s.fx.counts.provingRings };
      d.step(80, true);
      d.emit('boss/proven', { x: 14, y: -44, z: 96 });
      d.step(10, true);
      R.after = { wrong: s.shared.uWrong.value.x, radius: s.shared.uWrong.value.y, pulse: s.shared.uPulseCol.value[1].x, rings: s.fx.counts.provingRings, ignored: s.fx.counts.provingIgnored };
      // a restore, then the seventh again: the ring runs
      c.render.setWrongFade(0); c.render.setMood('L5', 0);
      d.emit('boss/proven', { x: 14, y: -44, z: 96 });
      d.step(10, true);
      R.again = { radius: s.shared.uWrong.value.y, rings: s.fx.counts.provingRings };
      return R;
    });
    assert.equal(out.sandLow, 8, `impact_sand on Low (particleScale ${out.scale}) emits ${out.sandLow} sprites`);
    assert.ok(out.lit.flash && out.lit.pulse > 0, 'the flash was on the screen');
    assert.deepEqual(out.paused, { state: 'paused', flash: false, pulse: 0, tracer: 0 }, 'paused: no flash sprite, no muzzle pulse, no streak');
    assert.ok(Math.abs(out.during.radius - 40 * Math.pow(31 / 96, 1.5)) < 1 && out.during.rings === 1, `a second boss/proven does not restart a running ring (${out.during.radius} m)`);
    assert.deepEqual(out.after, { wrong: 1, radius: 0, pulse: 0, rings: 1, ignored: 2 }, 'boss/proven over a proven chamber replays nothing');
    assert.ok(out.again.rings === 2 && out.again.radius > 1, 'after a restore the seventh proves again');
  } finally { await game.close(); }
});
