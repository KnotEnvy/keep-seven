// node tests/art_props/mech/tools/shot720.mjs  ->  shots/art-props-mech/bore_door_720p70.png
// GDD test 13: the port numerals of ia_bore_door from 6 m at 1280 x 720 x 0.7 (896 x 504), through the real loader.
import { startServer, openGame } from '../../../harness.mjs';
const server = await startServer();
try {
  const game = await openGame(server, { page: 'sandbox/viewer', piece: 'art-props-mech', start: false, viewport: { width: 896, height: 504 },
    query: { asset: 'ia_bore_door', shot: 1, dist: 6, yaw: 0, pitch: 0 } });
  try {
    await game.step(1, true);
    console.log(await game.shot('bore_door_720p70'), JSON.stringify(await game.page.evaluate(() => window.__dbg.ext.viewer.framing())));
  } finally { await game.close(); }
} finally { await server.close(); }
