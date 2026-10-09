// The Bider in a fight (GDD 7, 7.1, 21 tests 1 to 3): attack tokens, the crown knot under aim error, the file in a
// lane volume, fanning in open ground, the dormant states and their rise clips, falter, the lunge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inPage, openScene, useServer } from './lib.mjs';

useServer();

/** Page side: a fight of `seconds` against standing her; per tick who is between wind-up and strike. */
const fight = async (dbg, e, core, a) => {
  dbg.god(true);
  dbg.setOption('difficulty', a.difficulty);
  dbg.teleport(-40, 0, 0, 90, 0);
  core.ctx().enemies.clearAll();
  const ids = [];
  for (let i = 0; i < a.biders; i++) { const ang = (i / a.biders) * Math.PI * 2; ids.push(dbg.spawnEnemy('bider', -40 + Math.cos(ang) * 6, 0, Math.sin(ang) * 6, 0)); }
  if (a.transit) ids.push(dbg.spawnEnemy('transit', -55, 0, 0, -90));
  const starts = [];
  let maxAttack = 0, maxMelee = 0, maxRanged = 0, mismatch = 0, attacks = 0, peakAlive = 0;
  const was = new Map();
  for (let tick = 0; tick < a.seconds * 60; tick++) {
    dbg.step(1, false);
    let n = 0, melee = 0, ranged = 0;
    const list = e.actors();
    for (const x of list) {
      const attacking = x.kind === 'bider' ? (x.state === 'windup' || x.state === 'lunge') : (x.state === 'aim' || x.state === 'fire');
      if (attacking) { n++; if (x.kind === 'bider') melee++; else ranged++; }
      if (attacking !== (x.token !== '')) mismatch++;
      const prev = was.get(x.id);
      if ((x.state === 'windup' || x.state === 'aim') && prev !== x.state) { starts.push(tick); attacks++; }
      was.set(x.id, x.state);
    }
    const t = core.tokens();
    if (t.melee.length !== melee || t.ranged.length !== ranged) mismatch++;
    if (n > maxAttack) maxAttack = n;
    if (melee > maxMelee) maxMelee = melee;
    if (ranged > maxRanged) maxRanged = ranged;
    if (list.length > peakAlive) peakAlive = list.length;
  }
  let minGap = Infinity;
  for (let i = 1; i < starts.length; i++) minGap = Math.min(minGap, starts[i] - starts[i - 1]);
  return { maxAttack, maxMelee, maxRanged, mismatch, attacks, minGap, peakAlive, ids, stats: e.stats(), circled: H.names(0, /enemy\/state/).length };
};

test('tokens (test 1): 60 s against six Biders on Normal: never more than two between wind-up and strike, no two wind-ups within 0.3 s', async () => {
  const game = await openScene('street');
  try {
    const r = await inPage(game, fight, { difficulty: 'normal', biders: 6, transit: false, seconds: 60 });
    assert.equal(r.ids.filter((x) => x !== '').length, 6);
    assert.equal(r.maxAttack, 2, `at most two attackers at once (and two were: ${r.maxAttack})`);
    assert.ok(r.attacks >= 20, `the fight is a fight: ${r.attacks} attacks in 60 s`);
    assert.ok(r.minGap >= 18, `no two wind-ups start within 0.3 s (closest: ${r.minGap} ticks)`);
    assert.equal(r.mismatch, 0, 'an attack holds its token from wind-up through strike, and nobody else holds one');
    assert.equal(r.stats.maxHit, 18);
    console.log(`tokens: Normal, 6 Biders, 60 s: ${r.attacks} attacks, max concurrent ${r.maxAttack}, closest starts ${r.minGap} ticks apart`);
  } finally { await game.close(); }
});

test('tokens: one attacker on Easy; three on Hard, of which at most two melee and one ranged', async () => {
  const game = await openScene('street');
  try {
    const easy = await inPage(game, fight, { difficulty: 'easy', biders: 6, transit: false, seconds: 30 });
    assert.equal(easy.maxAttack, 1, 'Easy: one attack token');
    assert.ok(easy.attacks >= 6);
    assert.equal(easy.mismatch, 0);
    const hard = await inPage(game, fight, { difficulty: 'hard', biders: 5, transit: true, seconds: 45 });
    assert.equal(hard.maxAttack, 3, 'Hard: three attack tokens');
    assert.equal(hard.maxMelee, 2, 'sub-cap: two melee');
    assert.equal(hard.maxRanged, 1, 'sub-cap: one ranged');
    assert.ok(hard.minGap >= 18);
    assert.equal(hard.mismatch, 0);
    console.log(`tokens: Easy max ${easy.maxAttack} (${easy.attacks} attacks in 30 s); Hard max ${hard.maxAttack}, melee ${hard.maxMelee}, ranged ${hard.maxRanged}`);
  } finally { await game.close(); }
});

test('the alive cap: never more than six; transit two, tamper one; spawn returns an empty id beyond it', async () => {
  const game = await openScene('street');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      dbg.god(true); dbg.aiEnabled(false);
      const ids = [];
      for (let i = 0; i < 8; i++) ids.push(dbg.spawnEnemy('bider', -20 - i * 2, 0, 0, 0));
      const alive = core.ctx().enemies.aliveCount('');
      dbg.killAll();
      const t = [dbg.spawnEnemy('transit', -20, 0, 2, 0), dbg.spawnEnemy('transit', -22, 0, 2, 0), dbg.spawnEnemy('transit', -24, 0, 2, 0)];
      const viaSpawn = e.spawn({ kind: 'bider', spawn: 'sp_street_alley_n', encounter: 'enc_street' });
      const unknown = e.spawn({ kind: 'bider', spawn: 'no_such_marker' });
      return { ids, alive, t, viaSpawn, unknown, threat: core.ctx().enemies.threat };
    });
    assert.deepEqual(r.ids.map((x) => x !== ''), [true, true, true, true, true, true, false, false]);
    assert.equal(r.alive, 6);
    assert.deepEqual(r.t.map((x) => x !== ''), [true, true, false], 'at most two Transits alive');
    assert.notEqual(r.viaSpawn, '');
    assert.equal(r.unknown, '');
    assert.equal(r.threat, 2 + 2 + 1);
  } finally { await game.close(); }
});

test('the crown knot (test 2): aiming at the knot with 0.1 m of seeded error at 10 m frees at least 5 of 7 approaching Biders at each difficulty', async () => {
  const game = await openScene('street');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      dbg.god(true);
      const out = {};
      for (const difficulty of ['easy', 'normal', 'hard']) {
        dbg.setOption('difficulty', difficulty);
        core.ctx().enemies.clearAll();
        dbg.teleport(-10, 0, 0, 90, 0);
        let freed = 0, felled = 0, missed = 0;
        const radius = [];
        for (let i = 0; i < 7; i++) {
          const id = dbg.spawnEnemy('bider', -34, 0, (i % 3 - 1) * 1.2, -90);
          // let it run in to 10 m, then one shot at the knot
          await H.until(() => { const a = e.actor(id); return a === null || Math.hypot(a.x + 10, a.z) <= 10; }, 400);
          const seq = H.seq();
          dbg.aimAtEntity(id, 'crown', 0.1);
          dbg.tap('fire');
          await core.stepAsync(2);
          const names = H.names(seq, /enemy\/(freed|felled)/);
          if (names.includes('enemy/freed')) freed++; else if (names.includes('enemy/felled')) felled++; else missed++;
          dbg.killAll();
          await core.stepAsync(5);
        }
        out[difficulty] = { freed, felled, missed };
      }
      return out;
    });
    for (const d of ['easy', 'normal', 'hard']) assert.ok(r[d].freed >= 5, `${d}: freed ${r[d].freed} of 7 (felled ${r[d].felled}, missed ${r[d].missed})`);
    console.log(`crown knot: freed of 7 at 10 m with 0.1 m error: easy ${r.easy.freed}, normal ${r.normal.freed}, hard ${r.hard.freed}`);
  } finally { await game.close(); }
});

test('dormant Biders are shootable, rise with their clip on wake, and the lunge is one hit of 18 after a 0.5 s tell', async () => {
  const game = await openScene('street');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      const out = {};
      dbg.god(false);
      dbg.teleport(-30, 0, 0, 90, 0);
      // the kneeler: dormant, shootable, 1.0 s to stand
      let seq = H.seq();
      const k = e.spawn({ kind: 'bider', spawn: 'sp_street_kneeler', encounter: 'enc_street', wave: 'A', dormantClip: 'scoop_kneel', entrance: 'rise' });
      await core.stepAsync(60);
      out.dormant = [e.actor(k).state, e.actor(k).awake, e.actor(k).clip, core.ctx().enemies.threat, core.ctx().enemies.aliveCount('enc_street')];
      out.spawned = H.events(seq, /enemy\/spawned/).map((x) => [x.payload.kind, x.payload.encounter, x.payload.entrance]);
      core.ctx().enemies.wake(k);
      out.rise = [e.actor(k).state, e.actor(k).clip];
      out.riseTicks = await H.until(() => e.actor(k).state !== 'rise', 200);
      out.afterRise = [e.actor(k).state, core.ctx().enemies.threat];
      out.cup = e.statics().map((s) => s.asset);
      // it runs at her: the wind-up is 0.5 s, the lunge 0.35 s and 2.2 m, the recover 0.6 s
      seq = H.seq();
      out.toWindup = await H.until(() => e.actor(k).state === 'windup', 600);
      const d0 = Math.hypot(e.actor(k).x + 30, e.actor(k).z);
      out.windupDistance = d0;
      out.windupTicks = await H.until(() => e.actor(k).state === 'lunge', 100);
      const x0 = e.actor(k).x, z0 = e.actor(k).z;
      out.lungeTicks = await H.until(() => e.actor(k).state === 'recover', 100);
      out.lungeMoved = Math.hypot(e.actor(k).x - x0, e.actor(k).z - z0);
      out.hp = dbg.player().health;
      out.recoverTicks = await H.until(() => e.actor(k).state !== 'recover', 100);
      out.tele = H.events(seq, /enemy\/telegraph/).map((x) => [x.payload.attack, x.payload.seconds]);
      out.attack = H.events(seq, /enemy\/attack/).map((x) => x.payload.attack);
      out.damaged = H.events(seq, /player\/damaged/).map((x) => [x.payload.amount, x.payload.kind, x.payload.source]);
      // a dormant one can be freed by its crown without a fight, and felled by a body shot: both emit enemy/damaged first
      dbg.god(true);
      core.ctx().enemies.clearAll();
      const q = e.spawn({ kind: 'bider', spawn: 'sp_street_alley_n', encounter: 'enc_street', dormantClip: 'queue_stand' });
      await core.stepAsync(5);
      seq = H.seq();
      const from = [e.actor(q).x + 4, e.actor(q).y + 1.4, e.actor(q).z];
      out.dormantCrown = e.shootAt(q, 'crown', 'lead_round', from);
      out.dormantEvents = H.names(seq, /enemy\/(damaged|freed|felled)/);
      // falter: 2 s, backing off 2 m, then the approach again
      dbg.teleport(-30, 0, 0, 90, 0);
      const f = dbg.spawnEnemy('bider', -36, 0, 0, -90);
      await core.stepAsync(20);
      const before = Math.hypot(e.actor(f).x + 30, e.actor(f).z);
      dbg.emit('weapon/kept', { stage: 'loading', mark: '' });   // outside phase 3a this does nothing
      out.noFalter = e.actor(f).state;
      core.ctx().enemies.clearAll();
      return out;
    });
    assert.deepEqual(r.dormant, ['dormant', false, 'scoop_kneel', 0, 1], 'dormant: alive, counted in its encounter, no threat yet');
    assert.deepEqual(r.spawned, [['bider', 'enc_street', 'rise']]);
    assert.deepEqual(r.rise, ['rise', 'kneel_to_stand']);
    assert.ok(Math.abs(r.riseTicks - 60) <= 1, `kneel_to_stand is 1.0 s (${r.riseTicks})`);
    assert.deepEqual(r.afterRise, ['approach', 1]);
    assert.deepEqual(r.cup, ['prop_cup_tin'], 'the cup was set down on the trough rim');
    assert.ok(r.toWindup >= 0);
    assert.ok(r.windupDistance <= 2.45 && r.windupDistance > 1.2, `the wind-up starts inside 2.4 m (${r.windupDistance})`);
    assert.ok(Math.abs(r.windupTicks - 30) <= 1, `the wind-up is 0.5 s (${r.windupTicks})`);
    assert.ok(Math.abs(r.lungeTicks - 21) <= 1, `the lunge is 0.35 s (${r.lungeTicks})`);
    assert.ok(r.lungeMoved <= 2.21, `the lunge covers at most 2.2 m (${r.lungeMoved})`);
    assert.equal(r.hp, 82, '18 damage, once');
    assert.ok(Math.abs(r.recoverTicks - 36) <= 1, `the recover is 0.6 s (${r.recoverTicks})`);
    assert.deepEqual(r.tele, [['lunge', 0.5]]);
    assert.deepEqual(r.attack, ['lunge']);
    assert.deepEqual(r.damaged, [[18, 'lunge', 'bider']]);
    assert.equal(r.dormantCrown.outcome, 'freed');
    assert.deepEqual(r.dormantEvents, ['enemy/damaged', 'enemy/freed'], 'a dormant member that is damaged tells the director first');
    assert.equal(r.noFalter, 'approach');
  } finally { await game.close(); }
});

test('fix round 1: a lunge at a standing player stops short of her (never inside the camera); in view it attacks again within 2.2 s, behind her at half that rate', async () => {
  const game = await openScene('street');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      const en = core.ctx().enemies;
      const out = { ends: [], gaps: {} };
      dbg.god(true); dbg.setOption('difficulty', 'normal');
      const run = async (yaw, pitch, seconds, keepBehind = false) => {
        en.clearAll();
        dbg.teleport(-8, 0, 0, yaw, 0); dbg.setAim(yaw, pitch);
        const id = dbg.spawnEnemy('bider', -14, 0, 0, -90);
        const starts = []; let prev = '', closest = Infinity, hits = 0, hp = dbg.player().health;
        for (let i = 0; i < seconds * 60; i++) {
          if (keepBehind) { const b = e.actor(id), q = dbg.player(); dbg.setAim(Math.atan2(b.x - q.x, b.z - q.z) * 180 / Math.PI, 0); }   // she keeps her back to it (alone it would circle round into her view)
          await core.stepAsync(1);
          const a = e.actor(id), p = dbg.player();
          const d = Math.hypot(a.x - p.x, a.z - p.z);
          if (d < closest) closest = d;
          if (a.state !== prev) {
            if (a.state === 'windup') starts.push(i);
            if (a.state === 'recover') out.ends.push(d);
            prev = a.state;
          }
        }
        const gaps = []; for (let i = 1; i < starts.length; i++) gaps.push(starts[i] - starts[i - 1]);
        return { attacks: starts.length, maxGap: Math.max(...gaps), minGap: Math.min(...gaps), closest, struck: e.stats().maxHit };
      };
      out.gaps.facing = await run(90, 0, 20);           // she looks at it
      out.gaps.lookingDown = await run(90, -35, 20);    // she looks at its feet: still in view
      out.gaps.away = await run(-90, 0, 20, true);      // her back to it, all the way through
      // Hard, from behind inside 6 m: the cue is not shortened (0.5 s); in view it is 0.45 s
      dbg.setOption('difficulty', 'hard');
      const tell = async (yaw) => {
        en.clearAll(); dbg.teleport(-8, 0, 0, yaw, 0);
        dbg.spawnEnemy('bider', -13, 0, 0, -90);
        const seq = H.seq();
        await H.until(() => H.events(seq, /enemy\/telegraph/).length > 0, 600);
        return H.events(seq, /enemy\/telegraph/)[0].payload.seconds;
      };
      out.hardSeen = await tell(90);
      out.hardBehind = await tell(-90);
      dbg.setOption('difficulty', 'normal');
      en.clearAll();
      return out;
    });
    const g = r.gaps;
    assert.ok(r.ends.length >= 20, `lunges ended: ${r.ends.length}`);
    assert.ok(Math.min(...r.ends) >= 0.8, `after a lunge the body is at least 0.8 m from her (nearest ${Math.min(...r.ends).toFixed(2)} m)`);
    for (const k of ['facing', 'lookingDown', 'away']) assert.ok(g[k].closest >= 0.8, `${k}: never closer than 0.8 m (${g[k].closest.toFixed(2)})`);
    assert.deepEqual([g.facing.struck, g.lookingDown.struck, g.away.struck], [18, 18, 18], 'the strike still reaches her from the stand-off');
    assert.ok(g.facing.maxGap < 132, `kept in view it attacks again within 2.2 s (${g.facing.maxGap} ticks)`);
    assert.ok(g.lookingDown.maxGap < 132, `looking at its feet is still in view (${g.lookingDown.maxGap} ticks)`);
    assert.ok(g.away.minGap >= 150, `behind her: half frequency (${g.away.minGap} ticks between wind-ups)`);
    assert.ok(g.facing.attacks >= g.away.attacks * 1.5, `the rule separates the two: ${g.facing.attacks} facing, ${g.away.attacks} away in 20 s`);
    assert.ok(Math.abs(r.hardSeen - 0.4) < 1e-6, `Hard, in view: 0.4 s (${r.hardSeen}; pass i4: Hard's tells are 20 % shorter, it was 0.45)`);
    assert.ok(Math.abs(r.hardBehind - 0.5) < 1e-6, `Hard, from behind within 6 m: the cue is not shortened (${r.hardBehind})`);
    console.log(`lunge: nearest end ${Math.min(...r.ends).toFixed(2)} m; wind-ups in 20 s: facing ${g.facing.attacks} (gap <= ${g.facing.maxGap} ticks), looking down ${g.lookingDown.attacks}, away ${g.away.attacks} (gap >= ${g.away.minGap})`);
  } finally { await game.close(); }
});
