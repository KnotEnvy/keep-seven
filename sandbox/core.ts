// sandbox/core: foundation-core's own page (it stays core's). All six slots hold core stubs. tests/core/sandbox.test.mjs
// runs the scaffold checks here, so the six piece pages are free to replace their scenes.
//   ?scene=layout  the real level greybox, in play at cp_lip_start      ?scene=room  the 40 x 40 m test room
//   ?test=1        no real-time loop: drive it through window.__dbg     F3 / ?perf=1  the perf overlay
// A test can build its own room on any sandbox page: await __dbg.ext.sandbox.room(solids, spawn, yawDeg).
import { createSandbox } from '../src/core/sandbox.ts';

void createSandbox({
  piece: 'core',
  scene: {
    layout: async (sb) => { await sb.start('cp_lip_start'); },
    room: async (sb) => { await sb.boxRoom(); },
  },
});
