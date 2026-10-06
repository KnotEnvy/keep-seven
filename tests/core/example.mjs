// The 20-line example of docs/FOUNDATION_REPORT.md: boot, step, move, shoot, screenshot. Run: node tests/core/example.mjs
import { withGame } from '../harness.mjs';

await withGame({ piece: 'foundation', tier: 'low', checkpoint: 'cp_street_clear', stubs: 'all' }, async (game) => {
  await game.dbg('god', true);                                             // cheats go through the contracts
  const id = await game.dbg('spawnEnemy', 'bider', -70, 0, -2, 90);        // kind, x, y, z, yaw -> EntityId
  await game.step(30);                                                     // 30 fixed ticks (0.5 s), no drawing
  const walked = await game.walkTo(-62, -2, { maxTicks: 600 });            // BY INPUT: turns, holds forward, collides
  console.log('walk:', walked.reason, walked.ticks, 'ticks');
  const s = await game.run([                                               // a whole script in ONE page.evaluate
    { aimAtEntity: id, steps: 2 },                                         // turn the view onto its hit volume
    { tap: 'fire', steps: 12 },                                            // press fire for one tick, run 12
    { keys: ['KeyA'], steps: 20 }, { keys: [], steps: 1 },                 // strafe left by key code, release
  ]);
  const hits = await game.events(0, 'combat/hit');                         // the event ring, filtered by name
  const perf = await game.dbg('perfRun', 4);                               // renders 4 ticks, per-field maxima
  console.log('fired', s.stats.roundsFired, 'hit', hits.at(-1)?.payload.outcome, 'felled', s.stats.felled, 'at', s.player.x, s.player.z, 'zone', s.world.zone);
  console.log('frame:', perf.drawCalls, 'calls', perf.triangles, 'tris', (perf.textureBytes + perf.renderTargetBytes) >> 20, 'MiB');
  console.log('hash', await game.dbg('hash'), '->', await game.shot('example'));   // shots/foundation/example.png
});
