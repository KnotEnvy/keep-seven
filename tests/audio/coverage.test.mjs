// Coverage (work order section 6): every AudioCue renders non-silent and under the limiter; the sound board raises
// every caption with its sound; every button of the board runs with a live context and nothing complains.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../harness.mjs';
import { audioServer, openBoard } from './lib.mjs';

let server;
before(async () => { server = await audioServer(); });
after(async () => { await server.close(); });

test('every AudioCue and every other sound renders non-silent (peak > 0.01) and under the limiter (peak <= 1.0)', async () => {
  const game = await openBoard(server);
  try {
    const out = await game.page.evaluate(async () => {
      const a = window.__dbg.ext.audio, rows = {};
      // loud on purpose: every volume at 1; then the eight loudest again in the longest room
      for (const name of a.sounds()) { const s = await a.render(name, { volumes: [1, 1, 1] }); rows[name] = [s.peak, s.rms, s.duration]; }
      const loud = Object.keys(rows).sort((x, y) => rows[y][0] - rows[x][0]).slice(0, 8);
      for (const name of loud) { const s = await a.render(name, { volumes: [1, 1, 1], zone: 'the_bore' }); rows[name][0] = Math.max(rows[name][0], s.peak); }
      return { rows, cues: a.cues() };
    });
    assert.equal(out.cues.length, 39, '39 cues');
    for (const cue of out.cues) {
      const [peak] = out.rows[cue];
      assert.ok(peak > 0.01, `${cue}: peak ${peak} is silent`);
      assert.ok(peak <= 1.0, `${cue}: peak ${peak} clips`);
    }
    const names = Object.keys(out.rows);
    for (const name of names) {
      const [peak] = out.rows[name];
      if (name === 'hum_stops') { assert.equal(peak, 0, 'the hum stopping is an absence'); continue; }
      assert.ok(peak > 0.01 && peak <= 1.0, `${name}: peak ${peak}`);
    }
    const loudest = names.slice().sort((x, y) => out.rows[y][0] - out.rows[x][0]).slice(0, 4).map((n) => `${n} ${out.rows[n][0].toFixed(3)}`);
    console.log(`coverage: ${names.length} sounds rendered (39 cues); loudest at full volume: ${loudest.join(', ')}`);
  } finally { await game.close(); }
});

test('the sound board: a real click unlocks; every button runs with a live context; every cap_* key is raised with its sound', async () => {
  const story = JSON.parse(fs.readFileSync(path.join(ROOT, 'design', 'story.json'), 'utf8'));
  // (release pass p0: cap_loft_bell is raised by the world with its cue, not by audio: src/audio/captions.ts)
  const keys = Object.keys(story.lines).filter((k) => k.startsWith('cap_') && k !== 'cap_loft_bell').sort();
  assert.equal(keys.length, 23);
  const game = await openBoard(server, { viewport: { width: 1400, height: 1000 } });
  try {
    await game.step(5, true);
    assert.equal(await game.page.evaluate(() => window.__dbg.ext.audio.status().unlocked), false, 'locked before any gesture');
    await game.page.click('#status');                                     // a real click on the page
    await game.page.waitForFunction(() => window.__dbg.ext.audio.status().active);
    const out = await game.page.evaluate(async () => {
      const dbg = window.__dbg, a = dbg.ext.audio, table = a.captions();
      const ctx = dbg.ext.core.ctx();
      const buttons = [...document.querySelectorAll('#board button')].filter((b) => !b.dataset.b.startsWith('zone:'));
      const raised = {}, orphans = [];
      let seq = dbg.events(0).at(-1)?.seq ?? 0;
      const nodes0 = a.status().nodes;
      const check = () => {
        for (const e of dbg.events(seq, 'story/say')) {
          const key = e.payload.key;
          if (!key.startsWith('cap_')) continue;
          const started = ctx.audio.recent(24).filter((r) => r.tick === e.tick).map((r) => r.name);
          if (started.some((n) => table[key].sounds.includes(n))) raised[key] = (raised[key] ?? 0) + 1; else orphans.push(`${key}@${e.tick} (${started.join(',')})`);
        }
        seq = dbg.events(0).at(-1)?.seq ?? seq;
      };
      for (const b of buttons) {
        b.click(); check();
        for (let i = 0; i < 12; i++) { await dbg.ext.core.stepAsync(1, false); check(); }
      }
      for (let i = 0; i < 1200; i++) { await dbg.ext.core.stepAsync(1, false); check(); }       // the sequences run out
      return { raised, orphans, buttons: buttons.length, status: a.status(), nodes0, state: dbg.state().systems.audio };
    });
    assert.deepEqual(Object.keys(out.raised).sort(), keys, 'the board raises every cap_* key of design/story.json');
    assert.deepEqual(out.orphans, [], 'no caption without its sound on the same tick');
    assert.ok(out.status.nodes > out.nodes0 + 1000, 'the live context built the sounds');
    assert.ok(out.status.voicePeak <= 32, `voices ${out.status.voicePeak}`);
    const file = await game.shot('board');
    assert.ok(fs.statSync(file).size > 20000);
    console.log(`board: ${out.buttons} buttons clicked with a running context (${out.status.context}, ${out.status.sampleRate} Hz), ${out.status.starts} sounds, ${out.status.nodes} nodes, voice peak ${out.status.voicePeak}, dropped ${out.status.dropped}; 23 of 23 captions raised`);
  } finally { await game.close(); }
});

test('each zone button warps: the engine follows world.zone (reverb and ambience are the real ones)', async () => {
  const game = await openBoard(server);
  try {
    const zones = await game.page.evaluate(async () => {
      const dbg = window.__dbg, out = [];
      for (const b of [...document.querySelectorAll('#board button')].filter((x) => x.dataset.b.startsWith('zone:'))) {
        b.click();
        await dbg.ext.core.idle();
        await dbg.ext.core.stepAsync(30, false);
        out.push([b.dataset.b.slice(5), dbg.state().systems.audio.zone, dbg.state().world.zone]);
      }
      return out;
    });
    assert.equal(zones.length, 7);
    for (const [wanted, audio, world] of zones) { assert.equal(world, wanted); assert.equal(audio, wanted); }
  } finally { await game.close(); }
});
