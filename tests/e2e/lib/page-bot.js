// The page side of the playthrough bot (tests/e2e/lib/bot.mjs injects this file into the game's page).
// It defines window.__bot: a player made of the debug hook's INPUT surface only (setKeys / setActions / tap / setAim /
// walkTo / followPath) and its QUERY surface (player, enemies, state, puzzles, events, probe). It never teleports, never
// solves a puzzle or clears an encounter through a cheat, and never sets ammunition or health. God mode is the one
// cheat it can be told to use (opts.god, per section), and every use is written to __bot.report.god.
//
// Everything is driven by ticks (dbg.ext.core.stepAsync), never by wall-clock time: the same call sequence gives the
// same ticks, the same shots and the same hash.
(() => {
  const dbg = window.__dbg;
  const core = dbg.ext.core;
  const ctx = core.ctx();
  const layout = ctx.data.layout;
  const EYE = 1.65;
  const RAD = Math.PI / 180;

  const markers = new Map(layout.markers.map((m) => [m.id, m]));
  const marker = (id) => { const m = markers.get(id); if (!m) throw new Error(`bot: no marker '${id}'`); return m; };

  const report = { god: [], stuck: [], deaths: [], notes: [], sections: [], shots: 0 };
  const bot = { report, marker, frameEvery: 0, verbose: false, range: 30 };
  let sinceFrame = 0;
  let lastSeq = 0;

  const note = (text) => { report.notes.push(`[${ctx.clock.tick}] ${text}`); if (bot.verbose) console.log('[bot] ' + text); };

  // ---- time ---------------------------------------------------------------------------------------------------------
  /** n ticks (across a respawn or any other flow job); one drawn frame every bot.frameEvery ticks when that is > 0 */
  async function step(n = 1) {
    if (bot.frameEvery > 0) {
      let left = n;
      while (left > 0) {
        const k = Math.min(left, bot.frameEvery - sinceFrame);
        await core.stepAsync(k, false);
        left -= k; sinceFrame += k;
        if (sinceFrame >= bot.frameEvery) { sinceFrame = 0; dbg.step(0, true); }
      }
    } else await core.stepAsync(n, false);
    if (n >= 10) pump();
  }
  /** step until fn() is truthy (looked at every `every` ticks); -> ticks run, or -1 when maxTicks ran out */
  async function until(fn, maxTicks, every = 1) {
    let t = 0;
    while (t < maxTicks) {
      if (fn()) return t;
      await step(every); t += every;
    }
    return fn() ? t : -1;
  }
  /** events since the last call (optionally of one name) */
  function newEvents(name) {
    const ev = dbg.events(lastSeq, name);
    const all = name ? dbg.events(lastSeq) : ev;
    if (all.length) lastSeq = all[all.length - 1].seq;
    return ev;
  }
  const eventsSince = (seq, name) => dbg.events(seq, name);
  // ---- the journal: the run's landmarks, kept from the debug ring (4096 events) before it turns over ---------------------
  const JOURNAL = /^(checkpoint\/saved|puzzle\/(solved|progress|wrong|hint)|encounter\/(started|cleared|reset)|ride\/state|boss\/(phase|defeated|parley|hush|proven)|weapon\/(kept|line)|ending\/|player\/(died|respawned|spawned)|story\/card|objective\/changed|readable\/opened|interact\/used|secret\/found|game\/(state|new_run)|combat\/line_resolved|vignette\/state|zone\/entered)/;
  const journal = [];
  const seenPickups = new Map();
  let cursor = 0;
  /** read the events that came since the last look: the journal, and what lies on the ground */
  function pump() {
    const ev = dbg.events(cursor);
    if (ev.length === 0) return cursor;
    for (const e of ev) {
      if (JOURNAL.test(e.name)) journal.push({ name: e.name, tick: e.tick, payload: e.payload });
      if (e.name === 'pickup/spawned') seenPickups.set(e.payload.id, { id: e.payload.id, kind: e.payload.kind, x: e.payload.x, y: e.payload.y, z: e.payload.z, dropped: e.payload.dropped, tried: 0 });
      else if (e.name === 'pickup/collected') seenPickups.delete(e.payload.id);
      else if (e.name === 'player/respawned' || e.name === 'game/new_run') { for (const [id, k] of seenPickups) if (k.dropped) seenPickups.delete(id); }
    }
    cursor = ev[ev.length - 1].seq;
    return cursor;
  }
  const seqNow = () => pump();
  bot.journal = journal;

  // ---- senses -------------------------------------------------------------------------------------------------------
  const P = () => dbg.player();
  const pos = () => ctx.player.position;
  const alive = () => dbg.enemies().filter((e) => e.alive);
  const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
  const col = ctx.collision;
  const centre = { x: 0, y: 0, z: 0 };
  /** centre of an entity's hit volume, or null */
  function volumeOf(id, part = null) { return col.volumeCentre(id, part, centre) ? { x: centre.x, y: centre.y, z: centre.z } : null; }
  /** is the point visible from her eye (static world only)? */
  function sees(x, y, z) { const p = pos(); return col.lineOfSight(p.x, p.y + EYE, p.z, x, y, z, 0); }
  function puzzle(id) { return ctx.world.puzzle(id); }
  function encounter(id) { return ctx.world.encounter(id); }
  const door = (id) => ctx.world.doorState(id);
  const flags = () => ctx.world.debug.flags();
  const weapon = () => ctx.player.weapon;

  // ---- what lies on the ground: every pickup the world has announced and nobody has taken -------------------------------
  function pickups() { pump(); return Array.from(seenPickups.values()); }
  /**
   * Walk over the nearest pickup she has a use for (rounds when she carries fewer than `rounds`, a canteen under `health`)
   * within `within` metres on her level and in sight. -> true when she took one
   */
  async function collect(opts = {}) {
    const within = opts.within ?? 14, wantRounds = weapon().reserve < (opts.rounds ?? 24), wantHealth = ctx.player.health < (opts.health ?? 67);
    const p = pos();
    const list = pickups().filter((k) => k.tried < 2 && Math.abs(k.y - p.y) < 1.2 && dist2(k.x, k.z, p.x, p.z) <= within
      && ((wantRounds && /rounds/.test(k.kind)) || (wantHealth && /canteen/.test(k.kind))) && (!opts.filter || opts.filter(k)))
      .sort((a, b) => dist2(a.x, a.z, p.x, p.z) - dist2(b.x, b.z, p.x, p.z));
    for (const k of list) {
      if (!col.lineOfSight(p.x, p.y + 1.0, p.z, k.x, k.y + 0.4, k.z, 0)) continue;
      k.tried++;
      const r = dbg.walkTo(k.x, k.z, { maxTicks: 60 * 6, stopRadius: 0.3 });
      if (bot.frameEvery > 0) dbg.step(0, true);
      pickups();
      if (!seenPickups.has(k.id)) return true;
      if (r.reason === 'dead' || r.reason === 'state') return false;
    }
    return false;
  }

  // ---- hands --------------------------------------------------------------------------------------------------------
  function god(on, why) {
    dbg.god(on);
    if (on) { report.god.push({ tick: ctx.clock.tick, why, checkpoint: ctx.world.checkpoint }); note('GOD MODE ON: ' + why); }
  }
  /** reload until the cylinder is full or the reserve is empty */
  async function reload() {
    const w = weapon();
    if (w.chambered >= 6 || w.reserve <= 0) return;
    if (w.phase === 'ready') dbg.tap('reload');
    await until(() => weapon().phase === 'ready' && (weapon().chambered >= 6 || weapon().reserve <= 0), 400);
  }
  /** wait until the weapon can fire a chambered round; reloads when empty. -> false when there is nothing to fire */
  async function readyToFire() {
    for (let guard = 0; guard < 4; guard++) {
      await until(() => weapon().phase === 'ready', 300);
      const w = weapon();
      if (w.chambered > 0) return true;
      if (w.reserve <= 0) return false;
      await reload();
    }
    return weapon().chambered > 0;
  }
  /** one trigger pull along the current aim; returns the weapon/fired payload (or null: no round, or she is dead) */
  async function pull() {
    if (!(await readyToFire())) return null;
    const before = weapon().shotsFired;
    const seq = seqNow();
    dbg.tap('fire');
    const t = await until(() => weapon().shotsFired !== before, 40);
    if (t < 0) return null;
    report.shots++;
    const fired = eventsSince(seq, 'weapon/fired');
    return fired.length ? fired[fired.length - 1].payload : {};
  }
  /** aim at a world point, settle one tick, pull */
  async function shootAt(x, y, z) {
    if (!(await readyToFire())) return null;
    dbg.aimAt(x, y, z);
    await step(1);
    dbg.aimAt(x, y, z);
    return pull();
  }
  /** aim at an entity's hit volume (a part of it), pull. -> the combat/hit events of that shot ([] when it has no volume) */
  async function shootEntity(id, part) {
    if (!(await readyToFire())) return null;
    if (!dbg.aimAtEntity(id, part)) return null;
    await step(1);
    if (!dbg.aimAtEntity(id, part)) return null;
    const seq = seqNow();
    const fired = await pull();
    if (!fired) return null;
    await step(2);
    return eventsSince(seq).filter((e) => e.name === 'combat/hit' || e.name === 'shootable/hit');
  }
  /** look at a point */
  function lookAt(x, y, z) { dbg.aimAt(x, y, z); }
  /** look at a marker; a vista marker names what is to be looked at in params.target */
  function lookAtMarker(id) { const m = marker(id); const t = m.type === 'vista' && Array.isArray(m.params.target) ? m.params.target : m.pos; dbg.aimAt(t[0], t[1], t[2]); }
  /** press E on what she is looking at */
  async function interact(ticks = 2) { dbg.tap('interact'); await step(ticks); }

  // ---- legs ---------------------------------------------------------------------------------------------------------
  /**
   * Walk the nav graph to a node / marker (or 'critical') by input. Stops and returns at a gate, a portal, a death or
   * the goal; `while` (optional) is looked at every 20 ticks and ends the walk when it turns false.
   * A 'stuck' is recorded in report.stuck (each one is a bug in the level or the game) and retried with a side step.
   */
  async function go(to, opts = {}) {
    const chunk = opts.chunk ?? 20;
    let ticks = 0, stuck = 0;
    let markX = pos().x, markY = pos().y, markZ = pos().z, markTicks = 0;
    const max = opts.maxTicks ?? 60 * 240;
    while (ticks < max) {
      if (opts.while && !opts.while()) return { reason: 'interrupted', ticks };
      let r = dbg.followPath(to, { maxTicks: chunk, sprint: opts.sprint === true, stopRadius: opts.stopRadius });
      ticks += r.ticks;
      // the hook's own stuck test needs 45 ticks in one call; these calls are shorter, so progress is watched here too
      if (r.reason === 'max_ticks') {
        const q = pos();
        if (Math.hypot(q.x - markX, q.z - markZ, (q.y - markY)) > 0.5) { markX = q.x; markY = q.y; markZ = q.z; markTicks = 0; }
        else if ((markTicks += r.ticks) >= 90) { markTicks = 0; r = { ...r, reason: 'stuck' }; }
      }
      if (bot.frameEvery > 0) { sinceFrame += r.ticks; if (sinceFrame >= bot.frameEvery) { sinceFrame = 0; dbg.step(0, true); } }
      if (r.reason === 'max_ticks') continue;
      if (r.reason === 'state' || r.reason === 'dead') {
        if (core.busy()) { await core.idle(); }
        if (ctx.state.current !== 'playing' || r.reason === 'dead') {
          // a readable sheet, a death: let the caller see it
          await step(1); ticks++;
          if (ctx.state.current !== 'playing' || !ctx.player.alive) return { reason: r.reason, ticks, node: r.node };
        } else { await step(1); ticks++; }
        continue;
      }
      if (r.reason === 'stuck') {
        stuck++;
        const p = P();
        report.stuck.push({ tick: ctx.clock.tick, to, node: r.node, at: [p.x, p.y, p.z], zone: p.zone });
        note(`STUCK walking to ${to} near ${r.node} at (${p.x}, ${p.y}, ${p.z})`);
        if (stuck > 6) return { reason: 'stuck', ticks, node: r.node };
        // a side step and a hop, then on
        dbg.setActions(stuck % 2 ? ['left', 'back'] : ['right', 'back']);
        await step(20);
        dbg.tap('jump');
        await step(20);
        dbg.setActions([]);
        ticks += 40;
        continue;
      }
      return { reason: r.reason, ticks, node: r.node, gate: r.gate };
    }
    if (max >= 1200) { const p = P(); note(`go(${to}) ran out of ticks (${max}) at (${p.x}, ${p.y}, ${p.z})`); report.stuck.push({ tick: ctx.clock.tick, to, at: [p.x, p.y, p.z], zone: p.zone, timeout: true }); }
    return { reason: 'max_ticks', ticks };
  }
  /** walk straight to a point by input (no nav); -> the hook's walk result */
  async function walkTo(x, z, opts = {}) {
    let ticks = 0;
    const max = opts.maxTicks ?? 900;
    for (;;) {
      const r = dbg.walkTo(x, z, { maxTicks: Math.min(20, max - ticks), stopRadius: opts.stopRadius ?? 0.4, sprint: opts.sprint === true });
      ticks += r.ticks;
      if (bot.frameEvery > 0) { sinceFrame += r.ticks; if (sinceFrame >= bot.frameEvery) { sinceFrame = 0; dbg.step(0, true); } }
      if (r.reason === 'max_ticks' && ticks < max) continue;
      if (r.reason === 'state' && core.busy()) { await core.idle(); continue; }
      if (r.reason === 'stuck') { const p = P(); report.stuck.push({ tick: ctx.clock.tick, to: [x, z], at: [p.x, p.y, p.z], zone: p.zone, walk: true }); note(`STUCK walking straight to (${x}, ${z}) at (${p.x}, ${p.y}, ${p.z})`); }
      return { ...r, ticks };
    }
  }
  const walkToMarker = (id, opts) => { const m = marker(id); return walkTo(m.pos[0], m.pos[2], opts); };

  // ---- fighting ----------------------------------------------------------------------------------------------------
  const ASLEEP = new Set(['dormant', 'vig_wait', 'vignette', 'freed', 'felled', 'dead', 'die', 'queue', 'seated']);
  /** hostile things awake right now */
  function hostiles() { return dbg.enemies().filter((e) => e.alive && e.kind !== 'windlass' && !ASLEEP.has(e.state)); }
  /** where to put a round into each kind, best first */
  const PARTS = { bider: ['crown', 'body'], transit: ['lens', 'body'], tamper: ['vent_chest', 'vent_back', 'plate'] };
  bot.parts = PARTS;
  /**
   * Aim at the first part of `e` that the round would really reach (the probe ray from her eye meets that entity
   * first). -> the part, or '' when nothing of it can be hit from here.
   */
  function aimAtEnemy(e, parts) {
    for (const part of parts ?? PARTS[e.kind] ?? ['body']) {
      if (!dbg.aimAtEntity(e.id, part)) continue;
      const pr = dbg.probe();
      if (!(pr.hit && pr.entityId === e.id)) continue;
      // polish round 3: the Tamper has 1 200 HP and its plate takes a quarter: lead goes into an OPEN vent or stays in the
      // gun (the probe names the vent's sphere whether its lid is open or not: bot.ventsOnly says which is open, by state)
      if (bot.ventsOnly && e.kind === 'tamper' && !bot.ventsOnly(e).includes(pr.part)) continue;
      return pr.part;
    }
    return '';
  }
  /** one aimed round at the nearest hostile she can hit. -> { id, part, events } or null (nothing in sight, or no round) */
  async function shootNearest(filter) {
    if (!(await readyToFire())) return null;
    const p = pos();
    // a revolver, not a rifle: a Bider is engaged inside bot.range metres (a Transit or a Tamper at any distance: they reach her from there)
    const list = hostiles().filter((e) => (!filter || filter(e)) && (e.kind !== 'bider' || dist2(e.x, e.z, p.x, p.z) <= bot.range)).sort((a, b) => dist2(a.x, a.z, p.x, p.z) - dist2(b.x, b.z, p.x, p.z));
    for (const e of list) {
      const part = aimAtEnemy(e);
      if (!part) continue;
      await step(1);
      const again = aimAtEnemy(e);
      if (!again) continue;
      const seq = seqNow();
      const fired = await pull();
      if (!fired) return null;
      await step(1);
      return { id: e.id, kind: e.kind, part: again, events: eventsSince(seq).filter((x) => x.name === 'combat/hit').map((x) => x.payload) };
    }
    return null;
  }
  /**
   * Stand and fight until done() is true: shoot the nearest hostile in sight, reload in the gaps, turn toward the
   * nearest one she cannot see. A death is waited out (the game restores the checkpoint) and returned as 'died'.
   * -> { reason: 'done' | 'died' | 'timeout', ticks, shots }
   */
  let fight = async function (done, opts = {}) {
    const t0 = ctx.clock.tick, max = opts.maxTicks ?? 60 * 240;
    let shots = 0, quiet = 0;
    while (ctx.clock.tick - t0 < max) {
      if (!ctx.player.alive || ctx.state.current === 'dead') {
        report.deaths.push({ tick: ctx.clock.tick, checkpoint: ctx.world.checkpoint, where: opts.name ?? '' });
        note(`DIED in ${opts.name ?? 'a fight'} (checkpoint ${ctx.world.checkpoint})`);
        await until(() => ctx.state.current === 'playing' && ctx.player.alive, 60 * 20);
        return { reason: 'died', ticks: ctx.clock.tick - t0, shots };
      }
      if (done()) return { reason: 'done', ticks: ctx.clock.tick - t0, shots };
      // keep `opts.kite` metres from the nearest hostile: back away from it while it is closer (the trigger still works)
      if (opts.kite) {
        const q = pos();
        const close = hostiles().sort((a, b) => dist2(a.x, a.z, q.x, q.z) - dist2(b.x, b.z, q.x, q.z))[0];
        dbg.setActions(close && dist2(close.x, close.z, q.x, q.z) < opts.kite ? ['back'] : []);
      }
      const r = await shootNearest(opts.filter);
      if (r) { shots++; quiet = 0; if (opts.onShot) await opts.onShot(r); continue; }
      // nothing to shoot: top the cylinder up, face the nearest threat, wait
      quiet++;
      const w = weapon();
      if (w.phase === 'ready' && w.chambered < 6 && w.reserve > 0 && (hostiles().length === 0 || w.chambered === 0)) { await reload(); continue; }
      const p = pos();
      const near = hostiles().sort((a, b) => dist2(a.x, a.z, p.x, p.z) - dist2(b.x, b.z, p.x, p.z))[0];
      if (near) dbg.aimAt(near.x, near.y + 1.2, near.z);
      if (opts.idle) await opts.idle(quiet, near); else await step(6);
    }
    return { reason: 'timeout', ticks: ctx.clock.tick - t0, shots };
  };
  const fightRaw = fight;
  fight = async function (done, opts) { try { return await fightRaw(done, opts); } finally { if (opts && opts.kite) dbg.setActions([]); } };

  Object.assign(bot, { hostiles, aimAtEnemy, shootNearest, fight, pickups, collect });
  Object.assign(bot, {
    dbg, core, ctx, layout, step, until, newEvents, eventsSince, seqNow, P, pos, alive, dist2, volumeOf, sees, puzzle, encounter, door, flags, weapon,
    god, reload, readyToFire, pull, shootAt, shootEntity, lookAt, lookAtMarker, interact, go, walkTo, walkToMarker, note, EYE, RAD,
  });
  window.__bot = bot;
})();
