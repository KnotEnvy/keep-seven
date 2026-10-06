// The five vignettes (work order 4.6) and the visibility of dormant actors (4.1): each emits vignette/state started /
// ended / skipped; none replays.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inPage, openScene, useServer } from './lib.mjs';

useServer();

test('vig_kneeler: the dormant Bider scoops with the cup in its hand; on wake it stands, sets the cup on the trough rim 0.4 s in, and comes', async () => {
  const game = await openScene('street');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      const out = {};
      dbg.god(true);
      dbg.teleport(-6, 0, 0, 90, 0);
      const ctx = core.ctx();
      let seq = H.seq();
      ctx.enemies.playVignette('vig_kneeler');
      out.started = H.events(seq, /vignette\/state/).map((x) => [x.payload.id, x.payload.stage]);
      const k = e.actors()[0];
      out.k = [k.state, k.clip, k.marker, k.encounter, k.awake];
      // the director's wave A spawn at the same marker takes the same body
      out.adopted = e.spawn({ kind: 'bider', spawn: 'sp_street_kneeler', encounter: 'enc_street', wave: 'A', dormantClip: 'scoop_kneel', entrance: 'rise' }) === k.id;
      out.replay = (ctx.enemies.playVignette('vig_kneeler'), H.events(seq, /vignette\/state/).length);
      seq = H.seq();
      ctx.enemies.wake(k.id);
      out.ended = H.events(seq, /vignette\/state/).map((x) => [x.payload.id, x.payload.stage]);
      await core.stepAsync(23);
      out.cupAt23 = e.statics().length;
      await core.stepAsync(2);
      out.cup = e.statics();
      await H.until(() => e.actor(k.id).state === 'approach', 100);
      out.after = e.actor(k.id).state;
      return out;
    });
    assert.deepEqual(r.started, [['vig_kneeler', 'started']]);
    assert.deepEqual(r.k, ['dormant', 'scoop_kneel', 'sp_street_kneeler', 'enc_street', false]);
    assert.equal(r.adopted, true, 'wave A takes the vignette\'s body instead of doubling it');
    assert.equal(r.replay, 1, 'none replays');
    assert.deepEqual(r.ended, [['vig_kneeler', 'ended']]);
    assert.equal(r.cupAt23, 0);
    assert.equal(r.cup.length, 1, 'the cup leaves the hand 0.4 s into kneel_to_stand');
    assert.equal(r.cup[0].asset, 'prop_cup_tin');
    assert.ok(Math.abs(r.cup[0].y - 0.5) < 0.01, 'on the trough rim');
    assert.equal(r.after, 'approach');
  } finally { await game.close(); }
});

test('vig_yard_bell: T1 emerges, plants, gives the whole tell on the bell and stakes it (hitPlayer false), never targets her, then turns; a body hit ends it early', async () => {
  const game = await openScene('yard');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      const out = {};
      dbg.god(false);
      dbg.teleport(-84, 0, -3, 90, 0);
      const ctx = core.ctx();
      const bell = ctx.data.layout.markers.find((m) => m.id === 'ia_yard_bell').pos;
      let seq = H.seq();
      ctx.enemies.playVignette('vig_yard_bell');
      const t = e.actors()[0];
      let aimed = [];
      for (let i = 0; i < 600; i++) {
        await core.stepAsync(1);
        const a = e.actor(t.id);
        if (a.state === 'aim') aimed.push(Math.hypot(a.aim[0] - bell[0], a.aim[1] - bell[1], a.aim[2] - bell[2]));
        if (H.events(seq, /vignette\/state/).some((x) => x.payload.stage === 'ended')) {
          // the moment the scene ends: the stake has landed and the Transit has come round to her
          const p = dbg.player();
          let off = (Math.atan2(-(p.x - a.x), -(p.z - a.z)) * 180 / Math.PI - a.yawDeg) % 360;
          if (off > 180) off -= 360; else if (off < -180) off += 360;
          out.facingAtEnd = Math.abs(off);
          out.landedBeforeEnd = H.events(seq, /projectile\/landed/).length;
          break;
        }
      }
      await core.stepAsync(60);
      out.states = H.events(seq, /enemy\/state/).map((x) => x.payload.to);
      out.aimedAtBell = aimed.length > 0 && aimed.every((d) => d < 0.01);
      out.aimTicks = aimed.length;
      out.landed = H.events(seq, /projectile\/landed/).map((x) => [x.payload.hitPlayer, Math.hypot(x.payload.x - bell[0], x.payload.y - bell[1], x.payload.z - bell[2]) < 1.0]);
      out.vig = H.events(seq, /vignette\/state/).map((x) => x.payload.stage);
      out.hp = dbg.player().health;
      out.seconds = (H.events(seq, /vignette\/state/).at(-1).tick - H.events(seq, /vignette\/state/)[0].tick) / 60;
      out.after = e.actor(t.id).state;
      out.replay = (ctx.enemies.playVignette('vig_yard_bell'), H.events(seq, /vignette\/state/).length);
      // ---- a new run clears the record; a body hit during the tell: flinch, the vignette ends, it relocates
      core.ctx().enemies.clearAll();
      seq = H.seq();
      ctx.enemies.playVignette('vig_yard_bell');
      const t2 = e.actors()[0];
      await H.until(() => e.actor(t2.id).state === 'aim', 600);
      await core.stepAsync(10);
      const a2 = e.actor(t2.id);
      out.hit = e.shootAt(t2.id, 'body', 'lead_round', [a2.x + 3, a2.y + 1.2, a2.z], [0, -0.5, 0]).outcome;
      out.hitState = e.actor(t2.id).state;
      await core.stepAsync(20);
      out.hitAfter = e.actor(t2.id).state;
      out.again = H.events(seq, /vignette\/state/).map((x) => x.payload.stage);
      return out;
    });
    assert.ok(r.states.includes('emerge') && r.states.includes('plant') && r.states.includes('aim'), r.states.join());
    assert.equal(r.aimedAtBell, true, 'the whole tell is on the bell');
    assert.ok(Math.abs(r.aimTicks - 54) <= 2, `the full 0.9 s tell (${r.aimTicks})`);
    assert.deepEqual(r.landed[0], [false, true], 'the stake sticks in the bell, hitPlayer false');
    assert.deepEqual(r.vig, ['started', 'ended']);
    assert.equal(r.hp, 100, 'it never targets her before the turn');
    assert.ok(r.seconds >= 3.6 && r.seconds <= 4.6, `about 4 s (${r.seconds.toFixed(2)})`);
    assert.equal(r.landedBeforeEnd, 1, 'the scene is not over before the stake is in the bell');
    assert.ok(r.facingAtEnd < 5, `and not before it has turned to her (${r.facingAtEnd.toFixed(1)} degrees off)`);
    assert.ok(r.states.includes('bell_turn'), r.states.join());
    assert.ok(['relocate', 'plant', 'aim'].includes(r.after), `then it turns to her (${r.after})`);
    assert.equal(r.replay, 2, 'none replays within a run');
    assert.equal(r.hit, 'hit');
    assert.equal(r.hitState, 'flinch');
    assert.equal(r.hitAfter, 'relocate', 'a body hit ends the vignette and it relocates at once');
    assert.deepEqual(r.again, ['started', 'ended']);
  } finally { await game.close(); }
});

test('vig_tamper: the Tamper pounds the bulkhead; once, a Bider climbs out inside the ring and is knocked flat (not counted); 8 s; it pounds on', async () => {
  const game = await openScene('hall');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      dbg.god(true);
      const ctx = core.ctx();
      const seq = H.seq();
      ctx.enemies.playVignette('vig_tamper');
      await core.stepAsync(9 * 60);
      const t = e.actors().find((a) => a.kind === 'tamper');
      return {
        vig: H.events(seq, /vignette\/state/).map((x) => [x.tick, x.payload.stage]),
        felled: H.events(seq, /enemy\/felled/).map((x) => [x.payload.counted, x.payload.encounter]),
        spawned: H.events(seq, /enemy\/spawned/).map((x) => [x.payload.kind, x.payload.entrance]),
        pounds: H.events(seq, /enemy\/attack/).filter((x) => x.payload.attack === 'pound').length,
        tamper: [t.state, t.awake],
      };
    });
    assert.deepEqual(r.spawned, [['tamper', ''], ['bider', 'climb_out']]);
    assert.deepEqual(r.felled, [[false, '']], 'knocked flat by the ram, not counted');
    assert.deepEqual(r.vig.map((x) => x[1]), ['started', 'ended']);
    assert.ok(Math.abs((r.vig[1][0] - r.vig[0][0]) / 60 - 8) < 0.05, '8 s');
    assert.ok(r.pounds >= 3, `${r.pounds} pounds`);
    assert.deepEqual(r.tamper, ['vignette', false], 'it goes on pounding until the encounter starts');
  } finally { await game.close(); }
});

test('vig_dowser: the card at his socket, never under 3 x 8 px at 720p, a glint every 1.5 s; a shot toward him puffs dust 60 m along it; world ends it', async () => {
  const game = await openScene('yard');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      const out = {};
      const ctx = core.ctx();
      dbg.teleport(-88, 0, -10.5, 90, 0);
      let seq = H.seq();
      ctx.enemies.playVignette('vig_dowser');
      out.vig = H.events(seq, /vignette\/state/).map((x) => x.payload.stage);
      dbg.step(1, true);
      const v = dbg.state().systems.enemies.vignettes;
      out.card = [v.card, v.cardScale];
      out.glint = H.calls().filter((n) => n === 'vfx.acquireCard:dowser_glint').length;
      const target = ctx.data.layout.markers.find((m) => m.id === 'vista_dowser').params.target;
      // the card's size on a 720-line screen at the camera's FOV
      const cam = ctx.scene.camera;
      const d = Math.hypot(cam.position.x - target[0], cam.position.y - target[1], cam.position.z - target[2]);
      const px = 720 / (2 * d * Math.tan(cam.fov * Math.PI / 360));
      out.px = [0.9 * v.cardScale * px, 2.0 * v.cardScale * px];
      // a shot toward him
      seq = H.seq();
      dbg.aimAt(target[0], target[1] + 1, target[2]);
      dbg.tap('fire');
      await core.stepAsync(2);
      out.shot = H.events(seq, /shootable\/hit/).map((x) => [x.payload.id, x.payload.kind, Math.round(Math.hypot(x.payload.x + 88, x.payload.y - 1.65, x.payload.z + 10.5))]);
      // a shot elsewhere
      seq = H.seq();
      dbg.setAim(0, 0);
      dbg.tap('fire');
      await core.stepAsync(2);
      out.elsewhere = H.events(seq, /shootable\/hit/).length;
      // world's end of the beat
      dbg.emit('vignette/state', { id: 'vig_dowser', stage: 'ended' });
      out.after = dbg.state().systems.enemies.vignettes.card;
      return out;
    });
    assert.deepEqual(r.vig, ['started'], 'enemies emit started only');
    assert.equal(r.card[0], true);
    assert.equal(r.glint, 1);
    assert.ok(r.px[0] >= 3 - 1e-6 && r.px[1] >= 8 - 1e-6, `${r.px[0].toFixed(2)} x ${r.px[1].toFixed(2)} px`);
    assert.deepEqual(r.shot, [['vista_dowser', 'dowser', 60]]);
    assert.equal(r.elsewhere, 0);
    assert.equal(r.after, false, 'hidden when world ends the beat');
  } finally { await game.close(); }
});

test('vig_watcher: built with the gallery, no hit volume, counts for nothing; from the trigger its head follows her, clamped to 60 degrees; hidden with its zone', async () => {
  const game = await openScene('file');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      const out = {};
      const ctx = core.ctx();
      const m = ctx.data.layout.markers.find((x) => x.id === 'prop_watcher');
      const v = () => dbg.state().systems.enemies.vignettes;
      out.built = [v().watcher, ctx.enemies.aliveCount(''), ctx.enemies.threat];
      // no hit volume where it sits
      out.ray = e.leadRound(m.pos[0] - 3, m.pos[1] + 1.0, m.pos[2], 1, 0, 0);
      let seq = H.seq();
      ctx.enemies.playVignette('vig_watcher');
      out.vig = H.events(seq, /vignette\/state/).map((x) => x.payload.stage);
      // she stands in front of it (it faces -X, rotY 90), then far off to its side
      dbg.teleport(m.pos[0] - 2.5, m.pos[1], m.pos[2], 0, 0);
      await core.stepAsync(60);
      out.front = v().watcherYawDeg;
      dbg.teleport(m.pos[0] - 0.5, m.pos[1], m.pos[2] - 3, 0, 0);
      await core.stepAsync(120);
      out.side = v().watcherYawDeg;
      dbg.teleport(m.pos[0] - 0.5, m.pos[1], m.pos[2] + 3, 0, 0);
      await core.stepAsync(180);
      out.other = v().watcherYawDeg;
      await core.stepAsync(300);
      out.vig2 = H.events(seq, /vignette\/state/).map((x) => x.payload.stage);
      return out;
    });
    assert.deepEqual(r.built, [true, 0, 0], 'it exists while the gallery is built, and counts toward nothing');
    assert.notEqual(r.ray.kind, 'bider', 'no hit volume');
    assert.deepEqual(r.vig, ['started']);
    assert.ok(Math.abs(r.front) < 3, `facing her (${r.front})`);
    assert.ok(Math.abs(Math.abs(r.side) - 60) < 0.01, `clamped to 60 degrees (${r.side})`);
    assert.ok(Math.abs(Math.abs(r.other) - 60) < 0.01 && Math.sign(r.other) !== Math.sign(r.side), `and the other way (${r.other})`);
    assert.deepEqual(r.vig2, ['started', 'ended']);
  } finally { await game.close(); }
});

test('dormant actors are hidden (and stop animating) while their zone is not drawn; awake enemies are always drawn', async () => {
  const game = await openScene('street');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      const ctx = core.ctx();
      dbg.ext.world.showAll(false);
      dbg.teleport(-6, 0, 0, 90, 0);
      await core.stepAsync(3);
      const k = e.spawn({ kind: 'bider', spawn: 'sp_street_kneeler', encounter: 'enc_street', dormantClip: 'scoop_kneel', entrance: 'rise' });
      const a = dbg.spawnEnemy('bider', -20, 0, 0, 0);
      const inStreet = [ctx.render.zoneVisible('plenty_street'), e.actor(k).shown, e.actor(a).shown];
      // she walks into the Tally House: the street's chunks are no longer drawn
      dbg.teleport(-89, 0, -25, 0, 0);
      await core.stepAsync(3);
      const away = [ctx.render.zoneVisible('plenty_street'), e.actor(k).shown, e.actor(a).shown, H.events(0, /world\/cell/).length > 0];
      return { inStreet, away };
    });
    assert.deepEqual(r.inStreet, [true, true, true]);
    assert.deepEqual(r.away, [false, false, true, true], 'the dormant kneeler is hidden; the awake Bider is drawn');
  } finally { await game.close(); }
});
