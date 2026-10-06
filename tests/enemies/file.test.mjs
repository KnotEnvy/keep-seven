// The file (GDD 21 test 3): six Biders in lane_gallery hold a line within 0.4 m laterally for the 40 m run in 20 of 20
// seeded runs and one line round from the walkway centre frees all six; three hold file in lane_street; in open ground
// no three are collinear within 0.5 m for more than 1 s; wave-B style (offsets -1 / 0 / +1, 2.5 m stagger) no straight
// line from a walkway node passes within 0.3 m of all three for more than 0.5 s.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inPage, openScene, useServer } from './lib.mjs';

useServer();

test('the File: six in lane_gallery hold a line within 0.4 m for the 40 m run, 20 of 20 runs; one line round from the walkway centre frees all six', async () => {
  const game = await openScene('file');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      dbg.god(true);
      const ctx = core.ctx();
      let s = 777;
      const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 - 0.5; };
      const runs = [];
      let lineRound = null;
      for (let run = 0; run < 20; run++) {
        ctx.enemies.clearAll();
        // she stands at the baffle end of the walkway, anywhere across its 3 m
        const px = -62 + rnd() * 2, pz = -14 + rnd() * 2.4;
        dbg.teleport(px, -12, pz, -90, 0);
        const ids = [];
        for (let k = 1; k <= 6; k++) ids.push(e.spawn({ kind: 'bider', spawn: 'sp_file_' + k, encounter: 'enc_file', wave: 'A', dormantClip: 'queue_stand', entrance: 'rise', lane: 'lane_gallery', order: k }));
        dbg.step(30, false);
        ctx.enemies.wakeEncounter('enc_file');
        let worst = 0, overtakes = 0, minGap = Infinity, ticks = 0, inLaneTicks = 0;
        // the queue faces away from her: after the turn the head of the file is the one nearest her (sp_file_6)
        const order = ids.slice().sort((a, b) => e.actor(a).x - e.actor(b).x);
        for (let tick = 0; tick < 900; tick++) {
          dbg.step(1, false);
          const list = order.map((id) => e.actor(id));
          if (list.some((a) => !a || !a.alive)) break;
          const lead = list[0];
          if (Math.hypot(lead.x - px, lead.z - pz) < 4) break;           // the run is over at the head of the file
          if (list.some((a) => a.state === 'rise')) continue;
          ticks++;
          for (let k = 0; k < 6; k++) {
            const a = list[k];
            if (a.x < -59 || a.x > -19) continue;                         // the lane volume, x -59..-19
            inLaneTicks++;
            worst = Math.max(worst, Math.abs(a.z + 14));
            if (k > 0) { const gap = a.x - list[k - 1].x; if (gap <= 0) overtakes++; minGap = Math.min(minGap, gap); }
          }
          if (run === 0 && tick === 200 && !lineRound) {
            // ---- one line round from the walkway centre, down the axis of the file
            const seq = H.seq();
            const res = e.lineRound(lead.x - 6, -12 + 1.0, -14, 1, 0, 0);
            lineRound = { freed: H.events(seq, /enemy\/freed/).map((x) => x.payload.cause), hits: res.map((h) => [h.kind, h.outcome]) };
            break;
          }
        }
        runs.push({ worst, overtakes, minGap, ticks, inLaneTicks });
      }
      return { runs, lineRound };
    });
    const ok = r.runs.filter((x) => x.worst <= 0.4 && x.overtakes === 0 && x.ticks > 60).length;
    assert.equal(ok, 20, `held the line in ${ok} of 20 runs: ${JSON.stringify(r.runs)}`);
    for (const x of r.runs) assert.ok(x.minGap >= 1.2, `they keep their spacing (closest ${x.minGap.toFixed(2)} m)`);
    assert.deepEqual(r.lineRound.freed, ['line', 'line', 'line', 'line', 'line', 'line'], JSON.stringify(r.lineRound));
    console.log(`file: worst lateral ${Math.max(...r.runs.map((x) => x.worst)).toFixed(3)} m over 20 runs; closest spacing ${Math.min(...r.runs.slice(1).map((x) => x.minGap)).toFixed(2)} m`);
  } finally { await game.close(); }
});

test('wave B of the File: offsets -1 / 0 / +1 and 2.5 m of stagger; no straight line from a walkway node passes within 0.3 m of all three for more than 0.5 s', async () => {
  const game = await openScene('file');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      dbg.god(true);
      const ctx = core.ctx();
      dbg.clearEncounter('enc_file');                               // the far door opens (the stub world's way)
      ctx.enemies.clearAll();
      dbg.teleport(-60, -12, -14, -90, 0);
      const ids = [7, 8, 9].map((k) => e.spawn({ kind: 'bider', spawn: 'sp_file_' + k, encounter: 'enc_file', wave: 'B', entrance: 'doorway', order: k }));
      const walk = ctx.data.layout.nav.nodes.filter((n) => n.zone === 'the_gallery' && n.pos[0] > -59 && n.pos[0] < -19 && n.pos[2] > -15.6 && n.pos[2] < -12.4).map((n) => n.pos);
      let run = 0, worstRun = 0, lineTicks = 0, collinear = 0, worstCollinear = 0, lateral = [[], [], []];
      for (let tick = 0; tick < 900; tick++) {
        dbg.step(1, false);
        const list = ids.map((id) => e.actor(id));
        if (list.some((a) => !a || !a.alive)) break;
        if (list.some((a) => Math.hypot(a.x + 60, a.z + 14) < 5)) break;
        if (!list.every((a) => a.x > -59 && a.x < -19)) continue;
        lineTicks++;
        list.forEach((a, k) => lateral[k].push(a.z + 14));
        // a straight line from a walkway node within 0.3 m of all three: their angular windows seen from the node overlap
        let any = false;
        for (const p of walk) {
          let lo = -Infinity, hi = Infinity;
          for (const a of list) {
            const dx = a.x - p[0], dz = a.z - p[2], d = Math.hypot(dx, dz);
            if (d < 0.3) { lo = -Infinity; hi = Infinity; break; }
            const th = Math.atan2(dz, dx), w = Math.asin(0.3 / d);
            let c = th;
            if (lo !== -Infinity) { const mid = (lo + hi) / 2; while (c - mid > Math.PI) c -= 2 * Math.PI; while (c - mid < -Math.PI) c += 2 * Math.PI; }
            lo = Math.max(lo, c - w); hi = Math.min(hi, c + w);
          }
          if (lo <= hi) { any = true; break; }
        }
        run = any ? run + 1 : 0;
        worstRun = Math.max(worstRun, run);
      }
      const mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
      return { worstRun, lineTicks, lateral: lateral.map(mean), ids };
    });
    assert.ok(r.lineTicks > 120, `they ran the walkway (${r.lineTicks} ticks)`);
    assert.ok(r.worstRun <= 30, `the longest stretch with a line through all three is ${r.worstRun} ticks (limit 30, 0.5 s)`);
    assert.ok(r.lateral[0] < -0.5 && Math.abs(r.lateral[1]) < 0.5 && r.lateral[2] > 0.5 || r.lateral[0] > 0.5 && Math.abs(r.lateral[1]) < 0.5 && r.lateral[2] < -0.5, `they hold three lateral offsets (${r.lateral.map((x) => x.toFixed(2))})`);
    console.log(`file wave B: longest line through all three ${r.worstRun} ticks over ${r.lineTicks}; mean offsets ${r.lateral.map((x) => x.toFixed(2)).join(' ')}`);
  } finally { await game.close(); }
});

test('lane_street: wave C holds file down the street; in open ground no three approaching Biders stand collinear within 0.5 m for more than 1 s', async () => {
  const game = await openScene('street');
  try {
    const r = await inPage(game, async (dbg, e, core) => {
      dbg.god(true);
      const ctx = core.ctx();
      dbg.teleport(-6, 0, 0, 90, 0);
      // polish round 3: the saddlery file is two (sp_street_saddlery_3 is gone); wave B is four from the two alleys at once
      const ids = [1, 2].map((k) => e.spawn({ kind: 'bider', spawn: 'sp_street_saddlery_' + k, encounter: 'enc_street', wave: 'C', entrance: 'doorway', lane: 'lane_street', order: k }));
      let fileTicks = 0, worst = 0, overtakes = 0;
      // each is measured once it has been in the lane for 0.75 s (it enters from the saddlery door at an angle)
      const inside = [0, 0];
      let firstRank = '';
      for (let tick = 0; tick < 1200; tick++) {
        dbg.step(1, false);
        const list = ids.map((id) => e.actor(id));
        if (list.some((a) => Math.hypot(a.x + 6, a.z) < 5)) break;
        list.forEach((a, k) => { inside[k] = Math.abs(a.z) <= 1.5 && a.x > -66 && a.x < -8 ? inside[k] + 1 : 0; });
        if (!inside.every((n) => n > 45)) continue;
        fileTicks++;
        for (const a of list) worst = Math.max(worst, Math.abs(a.z));
        const xs = list.map((a) => a.x).sort((a, b) => b - a);
        const ranked = list.map((a) => xs.indexOf(a.x));
        if (fileTicks === 1) firstRank = ranked.join();
        else if (ranked.join() !== firstRank) overtakes++;
      }
      // ---- open ground: six Biders from both alleys and the gate, no lanes
      ctx.enemies.clearAll();
      dbg.teleport(-8, 0, 0, 90, 0);
      const open = ['sp_street_alley_n', 'sp_street_alley_s', 'sp_street_alley_n2', 'sp_street_alley_s2', 'sp_street_gate'].flatMap((s) => [e.spawn({ kind: 'bider', spawn: s, encounter: 'enc_street', wave: 'B', entrance: 'doorway' })]);
      open.push(dbg.spawnEnemy('bider', -60, 0, 2, 0));
      let run = 0, worstRun = 0, sampled = 0;
      for (let tick = 0; tick < 1800; tick++) {
        dbg.step(1, false);
        // open ground: the street proper (x -73..0, |z| < 6.5), not the alleys and doorways they come through; the
        // approach, not the melee crowd round her (inside 4 m they circle, lunge and recover through her)
        const p = dbg.player();
        const list = open.map((id) => e.actor(id)).filter((a) => a && a.alive && Math.abs(a.z) < 6.5 && a.x > -73 && a.x < 0 && a.state === 'approach' && Math.hypot(a.x - p.x, a.z - p.z) > 4);
        if (list.length >= 3) sampled++;
        let any = false;
        for (let i = 0; i < list.length && !any; i++) for (let j = i + 1; j < list.length && !any; j++) for (let k = j + 1; k < list.length && !any; k++) {
          const P = [list[i], list[j], list[k]];
          for (let m = 0; m < 3 && !any; m++) {
            const a = P[m], b = P[(m + 1) % 3], c = P[(m + 2) % 3];
            const lx = b.x - a.x, lz = b.z - a.z, l = Math.hypot(lx, lz);
            if (l < 1e-3) continue;
            // c lies within 0.5 m of the line through a and b, and between them (a line round would take all three)
            const t = ((c.x - a.x) * lx + (c.z - a.z) * lz) / (l * l);
            const d = Math.abs((c.x - a.x) * lz - (c.z - a.z) * lx) / l;
            if (t > 0 && t < 1 && d < 0.5) any = true;
          }
        }
        run = any ? run + 1 : 0;
        worstRun = Math.max(worstRun, run);
      }
      return { fileTicks, worst, overtakes, worstRun, sampled, alive: open.filter((id) => e.actor(id)).length };
    });
    assert.ok(r.fileTicks > 60, `they ran in file (${r.fileTicks} ticks inside the lane)`);
    assert.ok(r.worst <= 0.4, `within 0.4 m of the lane's centre line (${r.worst.toFixed(3)})`);
    assert.equal(r.overtakes, 0, 'no overtaking');
    assert.ok(r.sampled >= 60, `three or more were approaching in the open for ${r.sampled} ticks`);
    assert.ok(r.worstRun <= 60, `in open ground three stood collinear for at most ${r.worstRun} ticks (limit 60, 1 s)`);
    console.log(`lane_street: worst lateral ${r.worst.toFixed(3)} m over ${r.fileTicks} ticks; open ground: longest collinear run ${r.worstRun} ticks of ${r.sampled}`);
  } finally { await game.close(); }
});
