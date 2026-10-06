// Level knowledge shared by the core tests: how a scripted run gets through each gate and ride using only the
// contract surface of window.__dbg (solvePuzzle / clearEncounter / tap), so the same scripts work when the real
// systems replace the core stubs.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, SYSTEMS } from '../harness.mjs';

export const LAYOUT = JSON.parse(fs.readFileSync(path.join(ROOT, 'design/layout.json'), 'utf8'));
export const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, 'design/assets.json'), 'utf8'));
export const MiB = 1024 * 1024;

/**
 * Which slots hold a core stub in the contract-level core tests (boot, flow, walk, seam, determinism, alloc, budget,
 * playthrough). Default: all six, so `node --test tests/core/` judges core alone and does not move with six modules in
 * progress: no file under src/<piece>/ is served or bundled (PIECES below; a half-written module cannot break the run).
 * A builder checks their system "wired in" with KEEP7_REAL=<their slot> (a comma list also works), the integrator with
 * KEEP7_REAL=all. tests/core/stubs.test.mjs is about the stubs themselves and always uses 'all' for `stubs`.
 * The first line this module prints says which slots the run loaded.
 */
export const REAL = (process.env.KEEP7_REAL ?? '').split(',').map((s) => s.trim()).filter(Boolean);
for (const r of REAL) if (r !== 'all' && !SYSTEMS.includes(r)) throw new Error(`KEEP7_REAL: '${r}' is not a system (${SYSTEMS.join(', ')}, or all)`);
export const STUBS = REAL.includes('all') ? null : SYSTEMS.filter((s) => !REAL.includes(s));
/** `pieces` for startServer: the slots served and bundled from src/<piece>/; every other slot gets core's stand-in. */
export const PIECES = REAL.includes('all') ? 'all' : REAL;

// Say once, at the top of the run, which systems this run really loaded: "tests/core passes" means nothing about a
// piece whose module was never loaded.
{
  const real = REAL.includes('all') ? SYSTEMS : REAL;
  const written = SYSTEMS.filter((s) => {
    try { return !fs.readFileSync(path.join(ROOT, 'src', s, 'index.ts'), 'utf8').includes('INITIAL STUB written by foundation-core'); } catch { return true; }
  });
  const unloaded = written.filter((s) => !real.includes(s));
  const lines = [`tests/core: systems loaded from src/<piece>/: ${real.length ? real.join(', ') : 'NONE'}; core stubs in: ${SYSTEMS.filter((s) => !real.includes(s)).join(', ') || 'none'}`];
  if (unloaded.length) lines.push(`tests/core: NOT loaded although no longer the initial stub: ${unloaded.join(', ')}. This run says nothing about ${unloaded.length > 1 ? 'them' : 'it'}: KEEP7_REAL=${unloaded[0]} node --test tests/core/  (a comma list, or all)`);
  else if (!real.length) lines.push('tests/core: to check a piece "wired in": KEEP7_REAL=<slot> node --test tests/core/  (player, enemies, world, render, audio, ui; a comma list, or all)');
  if (!globalThis.__keep7SlotsPrinted) { globalThis.__keep7SlotsPrinted = true; process.stdout.write(lines.join('\n') + '\n'); }
}

/** door marker -> the debug calls that open it, in order (the thing that opens it in play, forced through world.debug) */
export const GATE_OPENERS = {
  door_jug_gate: [['solvePuzzle', 'seven_jugs']],
  door_yard_gate: [['clearEncounter', 'enc_street']],
  ia_yard_door: [['clearEncounter', 'enc_yard']],
  door_alley: [['clearEncounter', 'enc_yard']],
  door_tally: [['clearEncounter', 'enc_yard']],
  ia_hatch: [['solvePuzzle', 'daylight'], ['clearEncounter', 'enc_tally']],
  ia_baffle: [['solvePuzzle', 'proving_line']],
  door_gallery_far: [['clearEncounter', 'enc_file']],
  door_lift_cage: [['clearEncounter', 'enc_matador']],
  door_bore: [['solvePuzzle', 'the_asking']],
  door_proving_lift: [['clearEncounter', 'enc_windlass']],
};

/**
 * Checkpoints that are not places: what commits each in play, forced through the debug contract once she stands on its
 * marker. (Places commit by walking in; an encounter's checkpoint commits when the encounter is cleared.)
 */
export const CHECKPOINT_ACTS = {
  cp_lip_gate: [['solvePuzzle', 'seven_jugs']],
  cp_gallery_baffle: [['solvePuzzle', 'proving_line']],
  cp_boss_p1: [['setBossPhase', 'p1']],
  cp_boss_p2: [['setBossPhase', 'p2']],
  cp_boss_p3: [['setBossPhase', 'p3a']],
  cp_boss_proven: [['setBossPhase', 'proven']],
};

/** the encounter whose trigger volume or marker sits in each zone's fight space, for "inside each encounter volume" samples */
export const ENCOUNTERS = LAYOUT.encounters.map((e) => ({ id: e.id, zone: e.zone, trigger: e.trigger }));
export const CHECKPOINTS = LAYOUT.markers.filter((m) => m.type === 'checkpoint').map((m) => m.id);

/**
 * Runs INSIDE the page (pass it through page.evaluate as a string): walks `to` by input, opening each gate through
 * world.debug and taking each lift ride with tap('interact'). Calls onTick-like bookkeeping per chunk of `chunk` ticks.
 * Returns { reason, ticks, distance, gates, rides, samples, problems }.
 */
export async function pageWalk({ to, openers, portals, chunk, perTick, maxTicks, perfEvery }) {
  const dbg = window.__dbg;
  const yieldTask = () => new Promise((resolve) => { const c = new MessageChannel(); c.port1.onmessage = () => resolve(); c.port2.postMessage(0); });
  const out = { reason: '', ticks: 0, distance: 0, gates: [], rides: [], problems: [], maxFall: 0, zones: [], stuckAt: null, node: '', calls: 0, jsMs: [], wallMs: 0, walkTicks: 0 };
  let sinceFrame = 0;
  const t0 = performance.now();
  let p = dbg.player();
  let lastX = p.x, lastY = p.y, lastZ = p.z, groundY = p.y;
  const seenZones = new Set();
  const observe = (walking) => {
    p = dbg.player();
    if (walking) out.distance += Math.hypot(p.x - lastX, p.z - lastZ, p.y - lastY);
    lastX = p.x; lastY = p.y; lastZ = p.z;
    if (p.grounded) groundY = p.y;
    else { const fall = groundY - p.y; if (fall > out.maxFall) out.maxFall = fall; if (fall >= 0.5 && out.problems.length < 10) out.problems.push(`fell ${fall.toFixed(2)} m at (${p.x}, ${p.y}, ${p.z}) tick ${out.ticks}`); }
    if (!p.zone && out.problems.length < 10) out.problems.push(`zone is null at (${p.x}, ${p.y}, ${p.z})`);
    if (!seenZones.has(p.zone)) { seenZones.add(p.zone); out.zones.push(p.zone); }
  };
  const rideReset = () => { p = dbg.player(); lastX = p.x; lastY = p.y; lastZ = p.z; groundY = p.y; };
  let guard = 0;
  while (out.ticks < maxTicks && guard++ < 200000) {
    const r = dbg.followPath(to, { maxTicks: perTick ? 1 : chunk });
    out.calls++;
    out.ticks += r.ticks; out.walkTicks += r.ticks;
    observe(true);
    if (perfEvery) {
      // one rendered frame every `perfEvery` ticks: simMs is the sum over the ticks since the last frame
      sinceFrame += r.ticks;
      if (sinceFrame >= perfEvery) { dbg.step(0, true); const f = dbg.perf(); out.jsMs.push(f.simMs / sinceFrame + f.updateMs); sinceFrame = 0; }
    }
    out.node = r.node || out.node;
    if (r.reason === 'max_ticks') continue;
    if (r.reason === 'state' && dbg.ext.core.busy()) { await dbg.ext.core.idle(); continue; }   // a flow job: let it settle, walk on
    if (r.reason === 'gate') {
      const calls = openers[r.gate];
      if (!calls || out.gates.filter((g) => g === r.gate).length > 2) { out.reason = 'gate:' + r.gate; return out; }
      out.gates.push(r.gate);
      for (const [method, id] of calls) dbg[method](id);
      await yieldTask();
      continue;
    }
    if (r.reason === 'portal') {
      // walk up to the lever, throw it, ride
      const portal = portals.find((x) => x.from === r.node);
      if (!portal) { out.reason = 'portal:' + r.node; return out; }
      const w = dbg.walkTo(portal.viaPos[0], portal.viaPos[2], { stopRadius: 1.6, maxTicks: 600 });
      out.ticks += w.ticks;
      observe(true);
      dbg.aimAtMarker(portal.via);
      dbg.tap('interact');
      let rode = 0, ended = false;
      while (rode < 6000 && !ended) {
        const u = dbg.stepUntil({ event: 'ride/state', where: { stage: 'ended' } }, 240);
        rode += u.steps; out.ticks += u.steps;
        ended = u.met;
        if (!dbg.player().zone && out.problems.length < 10) out.problems.push('zone is null during the ride ' + portal.id);
        await yieldTask();
      }
      if (!ended) { out.reason = 'ride_never_ended:' + portal.id; return out; }
      out.rides.push({ id: portal.id, ticks: rode });
      rideReset();
      continue;
    }
    out.reason = r.reason;
    out.stuckAt = r.stuckAt;
    out.wallMs = performance.now() - t0;
    return out;
  }
  out.wallMs = performance.now() - t0;
  out.reason = 'test_max_ticks';
  return out;
}

/** portals with the position of their `via` marker, for pageWalk */
export function portalsForWalk() {
  return LAYOUT.nav.portals.map((p) => ({ id: p.id, from: p.from, to: p.to, via: p.via, viaPos: LAYOUT.markers.find((m) => m.id === p.via).pos }));
}

/** Runs pageWalk in a game's page. */
export function walk(game, to, { perTick = false, chunk = 600, maxTicks = 40000, perfEvery = 0 } = {}) {
  return game.page.evaluate(async ({ fn, args }) => {
    // eslint-disable-next-line no-new-func
    const run = new Function('return (' + fn + ')')();
    return run(args);
  }, { fn: pageWalk.toString(), args: { to, openers: GATE_OPENERS, portals: portalsForWalk(), chunk, perTick, maxTicks, perfEvery } });
}

export function median(values) {
  if (values.length === 0) return 0;
  const v = values.slice().sort((a, b) => a - b);
  return v[v.length >> 1];
}
