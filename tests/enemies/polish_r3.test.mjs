// Polish round 3 (critic panel): one test per bug fixed in src/enemies that is not already held in the unit's own file.
//   - Biders round a standing player keep their shoulders apart (centres 0.9 m) and spread on the ring
//   - a Transit that cannot see a player who waits on the street side of the yard wall goes and finds her; one that
//     cannot stands still, it does not pace and spin
// (the Windlass rules are in boss_p1 / boss_p2p3 / polish_r2, the Tamper's late vent in tamper.test.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inPage, openScene, useServer } from './lib.mjs';

useServer();

test('polish round 3: four Biders round a standing player (Normal, 20 s) keep their centres 0.9 m apart outside a lunge and spread on the ring', async () => {
  const game = await openScene('street');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      dbg.god(true);
      dbg.setOption('difficulty', 'normal');
      core.ctx().enemies.clearAll();
      dbg.teleport(-40, 0, 0, 90, 0);
      for (let i = 0; i < 4; i++) { const ang = (i / 4) * Math.PI * 0.5; dbg.spawnEnemy('bider', -40 - Math.cos(ang) * 9, 0, Math.sin(ang) * 9, 0); }
      const seq = H.seq();
      // "standing": everything but a body in its lunge or stumbling out of one (a lunge's line is locked and may cross)
      const standing = new Set(['approach', 'circle', 'windup', 'recover']);
      let min = Infinity, under90 = 0, under80 = 0, counted = 0, gapMin = Infinity, gapUnder40 = 0, gapTicks = 0;
      for (let t = 0; t < 1200; t++) {
        dbg.step(1, false);
        if (t < 240) continue;                                   // the walk in
        const list = e.actors().filter((x) => x.alive && standing.has(x.state));
        let m = Infinity;
        for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) m = Math.min(m, Math.hypot(list[i].x - list[j].x, list[i].z - list[j].z));
        counted++;
        if (m < min) min = m;
        if (m < 0.9) under90++;
        if (m < 0.8) under80++;
        // the angle between neighbours on the ring, seen from her
        const ring = list.filter((x) => x.state === 'circle' && Math.hypot(x.x + 40, x.z) < 4.5).map((x) => Math.atan2(x.z, x.x + 40)).sort((p, q) => p - q);
        if (ring.length >= 2) {
          let g = Infinity;
          for (let i = 0; i < ring.length; i++) { let d = (i + 1 < ring.length ? ring[i + 1] - ring[i] : ring[0] + Math.PI * 2 - ring[i]); if (d < g) g = d; }
          g = g * 180 / Math.PI;
          gapTicks++; if (g < gapMin) gapMin = g; if (g < 40) gapUnder40++;
        }
      }
      return { min, under90, under80, counted, gapMin, gapUnder40, gapTicks, attacks: H.events(seq, /enemy\/attack/).length };
    });
    console.log(`separation r3: 4 Biders, normal, ticks 240..1200: min centre distance ${r.min.toFixed(3)} m; under 0.9 m in ${r.under90} of ${r.counted} ticks, under 0.8 m in ${r.under80}; smallest ring gap ${r.gapMin.toFixed(1)} deg, under 40 deg in ${r.gapUnder40} of ${r.gapTicks} ticks; ${r.attacks} attacks`);
    assert.ok(r.attacks >= 8, `they still fight: ${r.attacks} attacks in 20 s`);
    assert.ok(r.min >= 0.8, `min centre distance ${r.min} (before: 0.60)`);
    assert.ok(r.under90 <= r.counted * 0.05, `under 0.9 m in ${r.under90} of ${r.counted} ticks`);
    assert.ok(r.gapUnder40 <= r.gapTicks * 0.1, `two circling Biders within 40 degrees in ${r.gapUnder40} of ${r.gapTicks} ticks`);
  } finally { await game.close(); }
});

test('polish round 3: a player who waits on the street side of the wall beside the yard door is found; a Transit that cannot see her stands still', async () => {
  const game = await openScene('yard');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      dbg.god(true);
      dbg.setOption('difficulty', 'normal');
      core.ctx().enemies.clearAll();
      dbg.teleport(-78.5, 0, 4.6, 90, 0);
      e.spawn({ kind: 'transit', spawn: 'sp_yard_t2', encounter: 'enc_yard', entrance: 'emerge' });
      e.spawn({ kind: 'transit', spawn: 'sp_yard_t3', encounter: 'enc_yard', entrance: 'emerge' });
      const seq = H.seq();
      const t0 = dbg.state().tick;
      const last = new Map(), turned = new Map(), moved = new Map();
      let firstSight = -1, lateTurn = 0, lateMove = 0, apart = Infinity;
      for (let t = 0; t < 60 * 90; t++) {
        dbg.step(1, false);
        const two = e.actors().filter((a) => a.kind === 'transit' && a.alive && a.state !== 'emerge' && a.state !== 'seek' && a.state !== 'relocate');
        if (two.length === 2) apart = Math.min(apart, Math.hypot(two[0].x - two[1].x, two[0].z - two[1].z));
        for (const a of e.actors()) {
          if (a.kind !== 'transit' || !a.alive) continue;
          if (a.sees && firstSight < 0) firstSight = t;
          const l = last.get(a.id);
          if (l) {
            let dy = Math.abs(a.yawDeg - l.yaw) % 360; if (dy > 180) dy = 360 - dy;
            const dm = Math.hypot(a.x - l.x, a.z - l.z);
            turned.set(a.id, (turned.get(a.id) || 0) + dy); moved.set(a.id, (moved.get(a.id) || 0) + dm);
            if (t >= 60 * 30 && !a.sees) { lateTurn += dy; lateMove += dm; }
          }
          last.set(a.id, { yaw: a.yawDeg, x: a.x, z: a.z });
        }
      }
      const tele = H.events(seq, /enemy\/telegraph/).map((x) => x.tick - t0);
      return {
        apart, firstSight, tele: tele.length, firstTell: tele[0] ?? -1, lateTell: tele.filter((x) => x > 60 * 30).length, lateTurn, lateMove,
        turned: [...turned.values()].map((x) => Math.round(x)), moved: [...moved.values()].map((x) => +x.toFixed(1)),
        end: e.actors().filter((a) => a.kind === 'transit' && a.alive).map((a) => `${a.state}@${a.x.toFixed(1)},${a.z.toFixed(1)} sees=${a.sees}`),
      };
    });
    console.log(`yard door, 90 s at (-78.5, 4.6): first sight at ${(r.firstSight / 60).toFixed(1)} s, first tell ${(r.firstTell / 60).toFixed(1)} s, ${r.tele} tells (${r.lateTell} after 30 s); turned ${r.turned.join(' / ')} deg, walked ${r.moved.join(' / ')} m; blind after 30 s: turned ${Math.round(r.lateTurn)} deg, walked ${r.lateMove.toFixed(1)} m; nearest the two ever stood ${r.apart.toFixed(2)} m; end: ${r.end.join(' | ')}`);
    assert.ok(r.apart >= 1.5, `the two never stand inside one another (${r.apart.toFixed(2)} m)`);
    assert.ok(r.firstSight >= 0 && r.firstSight <= 60 * 30, `one of them has a sight of her inside 30 s (tick ${r.firstSight}; before: never in 90 s)`);
    assert.ok(r.lateTell >= 10, `it goes on firing at her through the door (${r.lateTell} tells after 30 s)`);
    for (const m of r.moved) assert.ok(m <= 60, `no Transit paces the yard (walked ${m} m in 90 s; before: 120 to 138 m)`);
    for (const d of r.turned) assert.ok(d <= 1200, `no Transit spins (turned ${d} degrees in 90 s; before: 2 286 to 2 444)`);
    assert.ok(r.lateMove <= 8 && r.lateTurn <= 360, `a Transit without a sight of her holds its ground (after 30 s: ${r.lateMove.toFixed(1)} m, ${Math.round(r.lateTurn)} degrees)`);
  } finally { await game.close(); }
});
