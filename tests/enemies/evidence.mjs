// Evidence of code-enemies (work order 7 item 3): node tests/enemies/evidence.mjs  ->  shots/code-enemies/*.png
// One overlay frame per scene, a Bider being freed (0, 4, 20, 54 ticks, 3.2 s), a Transit's aim (0.3, 0.65, 0.9 s), the
// Tamper's slam ring and line_stagger, each boss phase, the hush with the arm opposite, the kill sequence.
import { openGame, startServer } from '../harness.mjs';

const PIECE = 'code-enemies';
const server = await startServer({ pieces: ['enemies'] });
const open = (scene) => openGame(server, { page: 'sandbox/enemies', piece: PIECE, start: false, query: { scene } });
const run = (game, fn, arg = null) => game.page.evaluate(async ({ src, a }) => {
  const dbg = window.__dbg, core = dbg.ext.core, e = dbg.ext.enemies;
  const H = { async until(t, m = 600) { for (let i = 0; i < m; i++) { if (t()) return i; await core.stepAsync(1); } return -1; } };
  return new Function('H', 'return (' + src + ')')(H)(dbg, e, core, a);
}, { src: fn.toString(), a: arg });
const shot = async (game, name) => { await game.dbg('step', 0, true); const f = await game.shot(name); console.log(f); };
const written = [];

try {
  // ---- street: a fight in the open, overlay on; then a Bider freed by its crown, frame by frame
  let game = await open('street');
  await run(game, async (dbg, e, core) => {
    dbg.god(true); dbg.teleport(-8, 0, 0, 90, 0);
    for (let i = 0; i < 5; i++) dbg.spawnEnemy('bider', -26 - i * 3, 0, (i % 3 - 1) * 2.5, 0);
    await core.stepAsync(140);
    dbg.aimAt(-18, 1.0, 0);
  });
  await shot(game, 'scene_street_overlay');
  await run(game, async (dbg, e, core) => {
    core.ctx().enemies.clearAll();
    dbg.teleport(-8, 0, 0, 90, 0);
    dbg.aiEnabled(false);
    const id = dbg.spawnEnemy('bider', -14, 0, 0, -90);
    await core.stepAsync(30);
    window.__freeId = id;
    dbg.aimAtEntity(id, 'crown');
    e.shootAt(id, 'crown');
  });
  for (const [ticks, name] of [[0, '0'], [4, '4'], [16, '20'], [34, '54'], [138, '192_3.2s']]) {
    await game.step(ticks);
    await run(game, (dbg) => dbg.aimAt(-14, 0.8, 0));
    await shot(game, `bider_freed_t${name}`);
  }
  await game.close();

  // ---- yard: a Transit's aim at 0.3, 0.65 and 0.9 s
  game = await open('yard');
  await run(game, async (dbg, e, core) => {
    dbg.god(true); dbg.teleport(-84, 0, 0, 90, 0);
    const id = e.spawn({ kind: 'transit', spawn: 'sp_yard_t2', encounter: 'enc_yard', wave: 'B', entrance: 'emerge' });
    window.__t = id;
    await H.until(() => e.actor(id).state === 'aim', 1500);
    const a = e.actor(id);
    dbg.aimAt(a.x, a.y + 1.3, a.z);
  });
  await shot(game, 'scene_yard_overlay');
  for (const [ticks, name] of [[18, '0.30s'], [21, '0.65s'], [14, '0.88s']]) {
    await game.step(ticks);
    await run(game, (dbg, e) => { const a = e.actor(window.__t); dbg.aimAt(a.x, a.y + 1.2, a.z); });
    await shot(game, `transit_aim_${name}`);
  }
  await game.close();

  // ---- file: the queue in file down the gallery
  game = await open('file');
  await run(game, async (dbg, e, core) => {
    dbg.god(true); dbg.teleport(-62, -12, -14, -90, 0);
    for (let k = 1; k <= 6; k++) e.spawn({ kind: 'bider', spawn: 'sp_file_' + k, encounter: 'enc_file', wave: 'A', dormantClip: 'queue_stand', entrance: 'rise', lane: 'lane_gallery', order: k });
    await core.stepAsync(20);
    core.ctx().enemies.wakeEncounter('enc_file');
    await core.stepAsync(220);
    dbg.aimAt(-40, -11, -14);
  });
  await shot(game, 'scene_file_overlay');
  await game.close();

  // ---- hall: the slam ring, then line_stagger with both vents open
  game = await open('hall');
  await run(game, async (dbg, e, core) => {
    dbg.god(true); dbg.teleport(-6, -15, -14, -90, 0);
    const t = dbg.spawnEnemy('tamper', 0, -15, -14, 90);
    window.__t = t;
    await H.until(() => e.actor(t).state === 'slam_windup', 600);
    await core.stepAsync(30);
    const a = e.actor(t);
    dbg.aimAt(a.x, a.y + 1.2, a.z);
  });
  await shot(game, 'tamper_slam_windup');
  await shot(game, 'scene_hall_overlay');
  await run(game, async (dbg, e, core) => {
    await H.until(() => e.actor(window.__t).state === 'advance', 400);
    e.shootAt(window.__t, 'vent_chest', 'line_round');
    await core.stepAsync(40);
    const a = e.actor(window.__t);
    dbg.aimAt(a.x, a.y + 1.4, a.z);
  });
  await shot(game, 'tamper_line_stagger');
  await game.close();

  // ---- bore: each phase, the hush with the arm opposite, the kill sequence
  game = await open('bore');
  const look = (dbg, e) => { const h = e.bossPoint('hub', 0); dbg.aimAt(h[0], h[1], h[2]); };
  await run(game, async (dbg, e, core) => { dbg.god(true); dbg.teleport(14, -44, 84.5, 180, 0); core.ctx().enemies.startBoss('idle', false); await core.stepAsync(23 * 60 + 20); });
  await run(game, look);
  await shot(game, 'boss_parley_inspection');
  await run(game, async (dbg, e, core) => { dbg.setBossPhase('p1'); await H.until(() => e.boss().sub === 'pattern', 400); await core.stepAsync(40); });
  await run(game, look);
  await shot(game, 'boss_p1_glow');
  await run(game, async (dbg, e) => { await H.until(() => e.boss().hauling, 900); await H.until(() => e.boss().t > 0.5, 100); e.shootBoss('knot', 0); e.shootBoss('knot', 3); });
  await run(game, look);
  await shot(game, 'boss_p1_haul');
  await shot(game, 'scene_bore_overlay');
  await run(game, async (dbg, e) => { dbg.setBossPhase('p2'); await H.until(() => e.boss().sub === 'pattern', 400); });
  await run(game, look);
  await shot(game, 'boss_p2_guard');
  await run(game, async (dbg, e) => { await H.until(() => e.boss().lance === 'sweep', 900); });
  await run(game, look);
  await shot(game, 'boss_p2_lance');
  await run(game, async (dbg, e, core) => { dbg.setBossPhase('p3a'); await core.stepAsync(200); await H.until(() => e.boss().fan === 'firing', 600); });
  await run(game, look);
  await shot(game, 'boss_p3a_fan');
  await run(game, async (dbg, e, core) => {
    const m = core.ctx().data.layout.markers.find((x) => x.id === 'ia_proving_mark_1');
    dbg.teleport(m.pos[0], m.pos[1], m.pos[2], 180, -10);
    dbg.emit('weapon/kept', { stage: 'loading', mark: 'ia_proving_mark_1' });
    await core.stepAsync(150);
    dbg.setAim(180, -12);
  });
  await shot(game, 'boss_hush_arm_opposite');
  // the proof; she walks back to bay 1 and the dry Windlass indexes round to her (from the opposite index: 4.5 s)
  await run(game, async (dbg, e, core) => {
    dbg.emit('weapon/kept', { stage: 'fired', mark: 'ia_proving_mark_1' });
    await H.until(() => e.boss().phase === 'p3b', 400);
    dbg.teleport(14, -44, 84.5, 180, 0);
    await H.until(() => e.boss().armBay === 1 && !e.boss().moving, 900);
    await core.stepAsync(30);
  });
  await run(game, look);
  await shot(game, 'boss_p3b_dry');
  // six lead rounds into the six open knots (side-on, while the arm is still turning, the lids deflect them)
  const hits = await run(game, async (dbg, e, core) => {
    const out = [];
    for (let k = 0; k < 6; k++) { out.push(e.shootBoss('knot', k).outcome); await core.stepAsync(4); }
    await core.stepAsync(20);
    return { out, pips: e.boss().pips, phase: e.boss().phase, sub: e.boss().sub };
  });
  console.log('kill sequence:', JSON.stringify(hits));
  if (hits.pips !== 0) throw new Error('evidence: the six rounds did not empty the cylinder');
  await run(game, look);
  await shot(game, 'boss_kill_rundown');
  await run(game, async (dbg, e, core) => { await H.until(() => e.boss().sub === 'sag', 900); await core.stepAsync(150); });
  await run(game, look);
  await shot(game, 'boss_kill_sag');
  await game.close();
} finally {
  await server.close();
}
void written;
