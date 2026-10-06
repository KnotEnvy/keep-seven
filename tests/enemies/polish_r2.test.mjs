// Polish round 2 (critic panel): one test per bug fixed in src/enemies.
//   - Biders do not stand inside one another (a push-apart after the steering step)
//   - the lunge's hit lands no earlier than 0.12 s into the lunge, not on its first tick
//   - the hush: no Bider starts an attack while she loads the kept round on a mark
//   - a Transit with no sight from any authored point goes and finds one (the player who holds at the yard gate)
//   - phase 3a says HAULING once and repeats the charge line every 20 s until the kept round is loaded
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inPage, openScene, useServer } from './lib.mjs';

useServer();

/** Page side: `n` Biders round a standing player for `ticks`; centre distances between every pair of standing Biders. */
const crowd = async (dbg, e, core, a) => {
  dbg.god(a.god !== false);
  dbg.setOption('difficulty', a.difficulty);
  core.ctx().enemies.clearAll();
  dbg.teleport(-40, 0, 0, 90, 0);
  for (let i = 0; i < a.n; i++) { const ang = (i / a.n) * Math.PI * 0.5; dbg.spawnEnemy('bider', -40 - Math.cos(ang) * 9, 0, Math.sin(ang) * 9, 0); }
  const seq = H.seq();
  let min = Infinity, under45 = 0, under60 = 0, nearHer = Infinity;
  const live = new Set(['approach', 'circle', 'windup', 'lunge', 'recover', 'stumble', 'falter']);
  for (let t = 0; t < a.ticks; t++) {
    dbg.step(1, false);
    if (!core.ctx().player.alive) break;
    const list = e.actors().filter((x) => x.alive && live.has(x.state));
    let m = Infinity;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) m = Math.min(m, Math.hypot(list[i].x - list[j].x, list[i].z - list[j].z));
    if (m < min) min = m;
    for (const x of list) if (x.state !== 'lunge') nearHer = Math.min(nearHer, Math.hypot(x.x + 40, x.z));
    if (m < 0.45) under45++;
    if (m < 0.6) under60++;
  }
  // the lunge: ticks from each `enemy/attack` (the lunge state begins) to the `player/damaged` it causes
  const ev = dbg.events(seq);
  const lags = [];
  for (let i = 0; i < ev.length; i++) {
    if (ev[i].name !== 'enemy/attack' || ev[i].payload.attack !== 'lunge') continue;
    const hit = ev.find((x) => x.seq > ev[i].seq && x.name === 'player/damaged' && x.payload.kind === 'lunge' && x.tick - ev[i].tick <= 21);
    if (hit) lags.push(hit.tick - ev[i].tick);
  }
  return { min, under45, under60, nearHer, lags, attacks: ev.filter((x) => x.name === 'enemy/attack').length, maxHit: e.stats().maxHit };
};

test('Biders keep apart: four (Normal) and six (Hard) round a standing player for 15 s are never closer than 0.45 m centre to centre', async () => {
  const game = await openScene('street');
  try {
    for (const [difficulty, n] of [['normal', 4], ['hard', 6]]) {
      const r = await inPage(game, crowd, { difficulty, n, ticks: 900 });
      console.log(`separation: ${n} Biders, ${difficulty}, 900 ticks: min centre distance ${r.min.toFixed(3)} m; under 0.45 m in ${r.under45} ticks, under 0.6 m in ${r.under60}; nearest to her outside a lunge ${r.nearHer.toFixed(2)} m; ${r.attacks} attacks`);
      assert.ok(r.attacks >= 6, `they still fight: ${r.attacks} attacks`);
      assert.ok(r.min >= 0.45, `min centre distance ${r.min}`);
      assert.ok(r.under60 <= 45, `under 0.6 m in ${r.under60} of 900 ticks`);
      assert.ok(r.nearHer >= 1.3, `the push-apart puts nobody in the camera (nearest ${r.nearHer} m; the lunge's stand-off is 1.5)`);
    }
  } finally { await game.close(); }
});

test('the lunge hits no earlier than 0.12 s into the lunge (7 ticks), and still hits a player who stands still', async () => {
  const game = await openScene('street');
  try {
    const r = await inPage(game, crowd, { difficulty: 'normal', n: 2, ticks: 900, god: false });
    console.log(`lunge: ticks from the lunge starting to its hit: ${r.lags.join(' ')}`);
    assert.ok(r.lags.length >= 4, `lunges that hit: ${r.lags.length}`);
    assert.ok(Math.min(...r.lags) >= 7, `earliest hit ${Math.min(...r.lags)} ticks into the lunge`);
    assert.ok(Math.max(...r.lags) <= 21, 'inside the 0.35 s lunge');
    assert.equal(r.maxHit, 18);
  } finally { await game.close(); }
});

test('the hush: F on a mark with a Bider 4 m away in approach: no wind-up and no damage until the kept round is fired or unloaded', async () => {
  const game = await openScene('bore');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      const ctx = core.ctx();
      dbg.setOption('difficulty', 'normal');
      ctx.enemies.clearAll();
      dbg.setBossPhase('p3a');
      const m = ctx.data.layout.markers.find((x) => x.id === 'ia_proving_mark_1');
      const axis = ctx.data.layout.markers.find((x) => x.id === 'sp_windlass').pos;
      dbg.teleport(m.pos[0], m.pos[1], m.pos[2], 180, 0);
      await H.until(() => e.boss().sub !== 'transition', 200);
      // two Biders 4 m from her, away from the bore, already running at her
      const ux = (m.pos[0] - axis[0]), uz = (m.pos[2] - axis[2]), l = Math.hypot(ux, uz);
      const ids = [dbg.spawnEnemy('bider', m.pos[0] + ux / l * 4, m.pos[1], m.pos[2] + uz / l * 4, 0), dbg.spawnEnemy('bider', m.pos[0] + ux / l * 3.5 + 1.5, m.pos[1], m.pos[2] + uz / l * 3.5, 0)];
      const out = { ids, before: ids.map((id) => e.actor(id).state) };
      const hp0 = dbg.player().health;
      const seq = H.seq();
      dbg.emit('weapon/kept', { stage: 'loading', mark: 'ia_proving_mark_1' });
      // the 1.8 s load runs at half speed, and she then stands aiming: 6 s of ticks in the hush
      let nearest = Infinity;
      for (let t = 0; t < 360; t++) { dbg.step(1, false); for (const id of ids) { const a = e.actor(id); if (a) nearest = Math.min(nearest, Math.hypot(a.x - m.pos[0], a.z - m.pos[2])); } }
      out.phase = e.boss().phase;
      out.windups = H.events(seq, /enemy\/telegraph/).length;
      out.damaged = H.events(seq, /player\/damaged/).length;
      out.hp = [hp0, dbg.player().health];
      out.states = ids.map((id) => e.actor(id).state);
      out.nearest = nearest;
      // she steps off the mark: the fight is on again
      const seq2 = H.seq();
      dbg.emit('weapon/kept', { stage: 'unloaded', mark: '' });
      await H.until(() => H.events(seq2, /enemy\/telegraph/).some((x) => x.payload.attack === 'lunge'), 600);
      out.after = H.events(seq2, /enemy\/telegraph/).filter((x) => x.payload.attack === 'lunge').length;
      return out;
    });
    console.log(`hush: 6 s on the mark with two Biders at 4 m: wind-ups ${r.windups}, damage events ${r.damaged}, health ${r.hp.join(' -> ')}, states ${r.states.join(', ')}, nearest ${r.nearest.toFixed(2)} m; after stepping off: ${r.after} wind-up(s)`);
    assert.equal(r.phase, 'hush');
    assert.equal(r.windups, 0, 'no Bider starts an attack in the hush');
    assert.equal(r.damaged, 0, 'no player/damaged before the shot');
    assert.equal(r.hp[1], r.hp[0]);
    assert.ok(r.nearest >= 2.0, `they hold on the ring, not at her elbow (nearest ${r.nearest})`);
    assert.ok(r.after >= 1, 'unloaded: they attack again');
  } finally { await game.close(); }
});

test('a Transit with no sight of her from any authored point goes and finds one: the yard against a player who holds at the gate', async () => {
  const game = await openScene('yard');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      dbg.god(true);
      dbg.setOption('difficulty', 'normal');
      core.ctx().enemies.clearAll();
      dbg.teleport(-73.6, 0, 0, 90, 0);
      e.spawn({ kind: 'transit', spawn: 'sp_yard_t2', encounter: 'enc_yard', entrance: 'emerge' });
      e.spawn({ kind: 'transit', spawn: 'sp_yard_t3', encounter: 'enc_yard', entrance: 'emerge' });
      const seq = H.seq();
      const t0 = dbg.state().tick;
      let sought = 0, longestQuiet = 0, last = 0;
      for (let t = 0; t < 60 * 40; t++) {
        dbg.step(1, false);
        if (e.actors().some((a) => a.state === 'seek')) sought++;
      }
      const tele = H.events(seq, /enemy\/telegraph/).map((x) => x.tick - t0);
      for (const x of [...tele, 60 * 40]) { if (x - last > longestQuiet) longestQuiet = x - last; last = x; }
      return { attacks: H.events(seq, /enemy\/attack/).length, tele, sought, longestQuiet, late: tele.filter((x) => x > 600).length };
    });
    console.log(`yard gate: 40 s at (-73.6, 0): ${r.attacks} stakes fired, aims at ticks ${r.tele.join(' ')}; ${r.sought} ticks in seek; longest gap ${(r.longestQuiet / 60).toFixed(1)} s`);
    assert.ok(r.sought > 0, 'a blind Transit went looking');
    assert.ok(r.late >= 3, `it goes on engaging after the first 10 s (aims after 10 s: ${r.late}; before the fix: 0)`);
    assert.ok(r.longestQuiet <= 60 * 20, `never 20 s without an aim (${r.longestQuiet} ticks)`);
  } finally { await game.close(); }
});

test('phase 3a: HAULING is said once in the phase; the charge line repeats every 20 s until the kept round is loaded, and boss/charge_required stays one event', async () => {
  const game = await openScene('bore');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      dbg.god(true);
      core.ctx().enemies.clearAll();
      const seq = H.seq();
      const t0 = dbg.state().tick;
      dbg.setBossPhase('p3a');
      dbg.step(60 * 75, false);
      const says = (k, s) => H.events(s, /story\/say/).filter((x) => x.payload.key === k).map((x) => +((x.tick - t0) / 60).toFixed(1));
      const out = { hauling: says('stn_boss_hauling', seq), charge: says('stn_boss_charge_required', seq), one: says('nar_one_left', seq), events: H.events(seq, /boss\/charge_required/).length, hauls: H.events(seq, /boss\/haul/).filter((x) => x.payload.on).length };
      // she loads and unloads: the line is not said again
      dbg.emit('weapon/kept', { stage: 'loading', mark: 'ia_proving_mark_1' });
      dbg.step(120, false);
      dbg.emit('weapon/kept', { stage: 'unloaded', mark: '' });
      const seq2 = H.seq();
      dbg.step(60 * 45, false);
      out.afterLoad = says('stn_boss_charge_required', seq2).length;
      out.haulingAfter = says('stn_boss_hauling', seq2).length;
      return out;
    });
    console.log(`phase 3a, 75 s: HAULING said at ${r.hauling.join(', ')} s (${r.hauls} hauls); charge line at ${r.charge.join(', ')} s; nar_one_left ${r.one.length}x; boss/charge_required ${r.events}x; after a load: charge line ${r.afterLoad}x`);
    assert.equal(r.hauling.length, 1, 'stn_boss_hauling once in phase 3a');
    assert.ok(r.hauls >= 8, `the hauls still happen and are announced by boss/haul (${r.hauls})`);
    assert.equal(r.events, 1, 'boss/charge_required once (the hint ladder counts from it)');
    assert.equal(r.one.length, 1, 'nar_one_left once');
    assert.equal(r.charge.length, 4, `charge line at 12, 32, 52 and 72 s (${r.charge})`);
    for (let i = 0; i < 4; i++) assert.ok(Math.abs(r.charge[i] - (12 + 20 * i)) < 0.2, `${r.charge}`);
    assert.equal(r.afterLoad, 0, 'not repeated once the kept round has been loaded');
    assert.equal(r.haulingAfter, 0);
  } finally { await game.close(); }
});

test('the Windlass teaching line (polish round 3, R2): it is said once at the first haul of every try, the first included, and only when story.json has the key', async () => {
  const game = await openScene('bore');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      const ctx = core.ctx();
      dbg.god(true);
      ctx.enemies.clearAll();
      const says = (s) => H.events(s, /story\/say/).map((x) => x.payload.key).filter((k) => k === 'hint_boss_haul');
      const out = { hasKey: ctx.data.story.lines.hint_boss_haul !== undefined };
      const haul = async () => { await H.until(() => e.boss().hauling, 1500); await H.until(() => !e.boss().hauling, 400); };
      // no deaths, the first try: said once at the first haul and not at the second (R2: taught before it is needed)
      let seq = H.seq();
      dbg.setBossPhase('p1');
      await haul(); await haul();
      out.fresh = says(seq).length;
      // two deaths in the phase, the key missing: nothing is said (and nothing throws)
      // (the count a restore hands back after two deaths at this checkpoint: Boss.restore; the sandbox has no death flow)
      const had = ctx.data.story.lines.hint_boss_haul;
      delete ctx.data.story.lines.hint_boss_haul;
      seq = H.seq();
      dbg.setBossPhase('p1');
      e.bossDeaths(2);
      out.deaths = e.boss().deaths;
      await haul();
      out.withoutKey = says(seq).length;
      // the key present: once per try, at the first haul
      ctx.data.story.lines.hint_boss_haul = had ?? { speaker: 'hint', text: 'The ribs stop what it throws. It opens only while it hauls.', seconds: 5 };
      seq = H.seq();
      dbg.setBossPhase('p1');
      out.kept = e.boss().deaths;
      await haul(); await haul();
      out.withKey = says(seq).length;
      out.order = H.events(seq, /story\/say/).map((x) => x.payload.key).filter((k) => k === 'hint_boss_haul' || k === 'stn_boss_hauling').slice(0, 2);
      if (had === undefined) delete ctx.data.story.lines.hint_boss_haul;
      return out;
    });
    console.log(`teaching line: story.json has hint_boss_haul: ${r.hasKey}; no deaths ${r.fresh}x; two deaths without the key ${r.withoutKey}x; with the key ${r.withKey}x (${r.order.join(' then ')})`);
    assert.equal(r.fresh, 1, 'the first try hears it at its first haul, once');
    assert.equal(r.deaths, 2);
    assert.equal(r.withoutKey, 0);
    assert.equal(r.kept, 2, 'a retry of the phase keeps the count');
    assert.equal(r.withKey, 1, 'once per try');
    assert.deepEqual(r.order, ['stn_boss_hauling', 'hint_boss_haul']);
  } finally { await game.close(); }
});
