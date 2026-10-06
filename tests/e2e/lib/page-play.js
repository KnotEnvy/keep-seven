// The stage, played. One function per checkpoint: `SECTIONS[cp]()` plays from the state the game restores at `cp` to
// the next checkpoint (or to a death, after which the game has put her back at `cp` and the same function runs again).
// So the same code is the first-time route, the route after a death, and what a critic gets after `__dbg.checkpoint(cp)`.
// Needs page-bot.js (window.__bot) loaded first.
(() => {
  const bot = window.__bot;
  const { dbg, ctx, core, step, until, P, pos, marker, go, walkTo, walkToMarker, fight, hostiles, shootEntity, shootAt, reload, pull, readyToFire,
    puzzle, encounter, door, weapon, volumeOf, lookAt, lookAtMarker, interact, note, seqNow, eventsSince, dist2, report, aimAtEnemy, collect, EYE } = bot;

  const playing = () => ctx.state.current === 'playing' && ctx.player.alive;
  const dead = () => !ctx.player.alive || ctx.state.current === 'dead';
  const checkpoint = () => ctx.world.checkpoint;
  const beats = [];
  /** a named moment of the run: tests/e2e and the tour take a frame or assert here (bot.onBeat, async, optional) */
  async function beat(name) {
    beats.push({ name, tick: ctx.clock.tick, checkpoint: checkpoint() });
    if (bot.onBeat) await bot.onBeat(name);
  }
  bot.beats = beats;

  /** a DOM key press, for the screens the UI owns (a readable sheet, the end card): the game's input layer does not see these */
  function key(code) {
    window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true, cancelable: true }));
  }

  /** walk the critical path until something is in the way: -> go()'s result ('gate', 'portal', 'arrived', 'interrupted' by hostiles, 'dead') */
  function advance(opts = {}) { return go(opts.to ?? 'critical', { ...opts, while: () => playing() && hostiles().length === 0 && (!opts.while || opts.while()) }); }

  /** stand within reach of an interactable, look at it, press E. -> true when interact/used came */
  async function use(id, opts = {}) {
    const m = marker(id);
    const at = opts.from ?? m.pos;
    for (let attempt = 0; attempt < 3; attempt++) {
      const p = pos();
      if (dist2(p.x, p.z, at[0], at[2]) > (opts.reach ?? 1.5)) {
        if (opts.nav !== false) await go(opts.navTo ?? id, { stopRadius: opts.reach ?? 1.5, maxTicks: 60 * 60 });
        const q = pos();
        if (dist2(q.x, q.z, at[0], at[2]) > (opts.reach ?? 1.5)) await walkTo(at[0], at[2], { stopRadius: opts.reach ?? 1.4, maxTicks: 300 });
      }
      const v = volumeOf(id) ?? { x: m.pos[0], y: m.pos[1], z: m.pos[2] };
      lookAt(v.x, v.y, v.z);
      await step(2);
      const seq = seqNow();
      dbg.tap('interact');
      await step(3);
      const used = eventsSince(seq, 'interact/used');
      if (used.some((e) => e.payload.id === id)) return true;
      if (used.length) { note(`pressing E at ${id} used ${used.map((e) => e.payload.id).join(', ')} instead`); if (ctx.state.current === 'paused') { for (let i = 0; i < 12 && ctx.state.current === 'paused'; i++) { key('KeyE'); await step(6); } } }
    }
    note(`could not use ${id} from (${P().x}, ${P().y}, ${P().z})`);
    return false;
  }
  /** read a note: open it with E, turn its cards with E until the sheet closes */
  async function read(id, opts) {
    if (!(await use(id, opts))) return false;
    await until(() => ctx.state.current === 'paused', 30);
    await beat('read:' + id);
    for (let i = 0; i < 12 && ctx.state.current === 'paused'; i++) { key('KeyE'); await step(6); }
    if (ctx.state.current === 'paused') { key('Escape'); await step(6); }
    return ctx.state.current === 'playing';
  }
  /** fight until the encounter is cleared, walking on along `to` whenever nothing is awake. -> 'cleared' | 'died' | 'timeout' */
  async function clear(id, opts = {}) {
    const t0 = ctx.clock.tick, max = opts.maxTicks ?? 60 * 300;
    let shown = false;
    while (encounter(id).state !== 'cleared') {
      if (ctx.clock.tick - t0 > max) { note(`TIMEOUT in ${id}: ${JSON.stringify(encounter(id))}`); return 'timeout'; }
      if (dead()) { const r = await fight(() => true, { name: id }); if (r.reason === 'died') return 'died'; }
      if (hostiles().length > 0) {
        if (!shown && encounter(id).state === 'active') { shown = true; await beat('fight:' + id); }
        const r = await fight(() => encounter(id).state === 'cleared' || hostiles().length === 0, { name: id, maxTicks: 60 * 60, ...opts.fight });
        if (r.reason === 'died') return 'died';
        continue;
      }
      if (opts.between) { if ((await opts.between()) === 'died') return 'died'; } else await step(10);
    }
    return 'cleared';
  }

  /** a cartridge point on the wall: tops the reserve up to 18 */
  async function refill(box) {
    if (weapon().reserve >= 18) return;
    await use(box, { reach: 1.6 });
    await step(10);
  }
  /** after a fight: reload, then walk over what the fallen dropped and what lies near (rounds, a canteen when hurt) */
  async function tidy(within = 16) {
    await reload();
    for (let i = 0; i < 4 && !dead(); i++) if (!(await collect({ within }))) break;
  }

  // ====================================================================================================================
  // I. the lip
  // ====================================================================================================================
  async function lip() {
    await beat('start');
    if (!bot.skipReadables) await read('rd_note_lip');
    const r = await advance();
    if (r.reason !== 'gate' && puzzle('seven_jugs').solved !== true) note(`lip: the walk to the jug gate ended '${r.reason}'`);
    await beat('puzzle:seven_jugs');
    // six on the bar, reload, look up: the seventh on the pylon arm
    for (let i = 1; i <= 7 && !puzzle('seven_jugs').solved; i++) {
      if (!volumeOf('ia_jug_' + i)) continue;
      await shootEntity('ia_jug_' + i);
      if (i === 6) { await beat('seven_jugs:six_down'); await reload(); }
    }
    await until(() => door('door_jug_gate') === 'open', 600);
    await refill('ia_ammo_box_lip');
    await reload();
    await beat('seven_jugs:open');
  }

  // ====================================================================================================================
  // II. plenty street and the yard
  // ====================================================================================================================
  async function street() {
    const done = await clear('enc_street', { between: async () => { const r = await advance({ maxTicks: 120 }); if (r.reason === 'gate' || r.reason === 'arrived') await step(20); } });
    if (done !== 'cleared') return;
    await tidy();
    await beat('clear:enc_street');
    await go('cp_street_clear', { maxTicks: 60 * 90, sprint: true });      // the HUD has asked for Shift: run the rest of the street
  }
  async function yard() {
    if (encounter('enc_yard').state === 'idle' || door('ia_yard_door') !== 'open') {
      const r = await advance();
      if (r.reason !== 'gate') note(`yard: the walk to the yard door ended '${r.reason}'`);
      dbg.aimAtEntity('knot_yard_latch');
      await step(2);
      await beat('knot:yard_latch');
      if (volumeOf('knot_yard_latch')) await shootEntity('knot_yard_latch');
      await until(() => encounter('enc_yard').state !== 'idle', 120);
    }
    // the vignette: the first Transit stakes the bell; she watches it, then it turns
    const done = await clear('enc_yard', { between: async () => { const r = await advance({ maxTicks: 90, to: 'cp_yard_clear' }); if (r.reason !== 'interrupted') await step(20); } });
    if (done !== 'cleared') return;
    await tidy();
    await beat('clear:enc_yard');
    await go('cp_yard_clear', { maxTicks: 60 * 90 });
  }
  async function toTally() {
    // the sighting: stand in the yard's north-west corner and look at the far rim until he is gone and the door lets go
    if (door('door_tally') !== 'open') {
      await go('cp_yard_clear', { maxTicks: 60 * 60 });
      lookAtMarker('vista_dowser');
      await step(30);
      await beat('story:dowser');
      await until(() => { lookAtMarker('vista_dowser'); return door('door_tally') === 'open' || dead(); }, 60 * 30, 10);
    }
    await go('cp_tally_enter', { maxTicks: 60 * 60 });
    await until(() => checkpoint() === 'cp_tally_enter' || dead(), 240);
  }

  // ====================================================================================================================
  // III. the tally house
  // ====================================================================================================================
  async function tally() {
    await beat('enter:tally_house');
    await refill('ia_ammo_box_tally');
    const pz = puzzle('daylight');
    if (!pz.solved) {
      const spot = marker('trg_pz_daylight').params.standSpot;
      await walkTo(spot[0], spot[2], { maxTicks: 600 });
      await beat('puzzle:daylight');
      // in story order: the south latch (the tally wall), the middle (his chair and the hearth), the north, then the cord
      for (const id of ['ia_latch_s', 'ia_latch_m', 'ia_latch_n', 'ia_cloth_cord']) {
        if (!volumeOf(id)) continue;
        const hit = await shootEntity(id);
        if (!hit || !hit.some((e) => e.name === 'shootable/hit')) note(`daylight: the round at ${id} did not land (${JSON.stringify(hit)})`);
        await step(60);
        await beat('daylight:' + id);
        if (id !== 'ia_cloth_cord') await step(240);      // let the blade land and its line be said
      }
      await until(() => puzzle('daylight').solved || dead(), 600);
      if (!bot.skipReadables) { await read('rd_ledger'); }
    }
    if (dead()) return;
    // the hatch knot: lit by the day-cell, seen from the strip north of the hatch
    if (encounter('enc_tally').state === 'idle') {
      const k = marker('knot_hatch_latch');
      await walkTo(k.pos[0] + 0.2, k.pos[2] - 2.6, { maxTicks: 900, stopRadius: 0.5 });
      dbg.aimAtEntity('knot_hatch_latch');
      await step(2);
      await beat('knot:hatch_latch');
      for (let i = 0; i < 4 && encounter('enc_tally').state === 'idle' && volumeOf('knot_hatch_latch'); i++) { await shootEntity('knot_hatch_latch'); await step(20); }
    }
    const done = await clear('enc_tally');
    if (done !== 'cleared') return;
    await tidy();
    await beat('clear:enc_tally');
    await until(() => door('ia_hatch') === 'open' || dead(), 600);
  }
  async function stair() {
    await beat('hatch:open');
    const r = await go('cp_gallery_bay', { maxTicks: 60 * 120 });
    if (r.reason !== 'arrived') note(`stair: the walk down ended '${r.reason}'`);
    await until(() => checkpoint() === 'cp_gallery_bay' || dead(), 240);
  }

  // ====================================================================================================================
  // IV. the gallery
  // ====================================================================================================================
  async function provingLine() {
    await beat('enter:the_gallery');
    if (!bot.skipReadables) await read('rd_plate_proving');
    await refill('ia_ammo_box_bay');
    await reload();
    // the locker gives one line round while she holds none
    if (weapon().lineRounds === 0) await use('ia_line_locker_bay');
    await until(() => weapon().lineRounds > 0 || dead(), 120);
    // onto the brass step, the banded round under the hammer, through the loop
    const m = marker('pz_proving_mark');
    await walkTo(m.pos[0], m.pos[2], { stopRadius: 0.25, maxTicks: 600 });
    await step(20);
    await beat('puzzle:proving_line');
    for (let attempt = 0; attempt < 3 && !puzzle('proving_line').solved; attempt++) {
      if (weapon().lineRounds === 0 && weapon().cylinder[0] !== 'line') { await use('ia_line_locker_bay'); await walkTo(m.pos[0], m.pos[2], { stopRadius: 0.25, maxTicks: 600 }); await step(20); }
      await readyToFire();
      if (weapon().cylinder[0] !== 'line') { dbg.tap('line'); await until(() => weapon().phase === 'ready' && weapon().cylinder[0] === 'line', 120); }
      const a = marker('knot_a');
      dbg.aimAt(a.pos[0], a.pos[1], a.pos[2]);
      await step(2);
      dbg.aimAt(a.pos[0], a.pos[1], a.pos[2]);
      await beat('proving_line:aimed');
      await pull();
      await step(60);
    }
    await until(() => puzzle('proving_line').solved || dead(), 300);
    await until(() => checkpoint() === 'cp_gallery_baffle' || dead(), 300);
    await beat('proving_line:solved');
  }
  async function file() {
    // the locker chimes with one more: the line as mercy
    if (encounter('enc_file').state !== 'cleared' && weapon().lineRounds === 0 && weapon().cylinder[0] !== 'line') await use('ia_line_locker_bay');
    await reload();
    const cp = marker('cp_gallery_baffle');
    await walkTo(cp.pos[0], cp.pos[2], { stopRadius: 0.6, maxTicks: 600 });
    let lined = false;
    // the queue turns and comes in file down a 3 m walkway: one line round along it when the leader is inside 34 m
    if (encounter('enc_file').state !== 'cleared' && (weapon().lineRounds > 0 || weapon().cylinder[0] === 'line')) {
      const filed = () => hostiles().filter((e) => e.kind === 'bider');
      await until(() => dead() || encounter('enc_file').state === 'cleared' || (filed().length >= 3 && filed().some((e) => dist2(e.x, e.z, pos().x, pos().z) < 34)), 60 * 40, 3);
      if (!dead() && filed().length >= 3 && (await loadLine())) {
        await beat('fight:enc_file');
        const p = pos();
        const leader = filed().sort((a, b) => dist2(a.x, a.z, p.x, p.z) - dist2(b.x, b.z, p.x, p.z))[0];
        if (aimAtEnemy(leader, ['body'])) { await step(1); aimAtEnemy(leader, ['body']); const seq = seqNow(); await pull(); await step(30); lined = true; const res = eventsSince(seq, 'combat/line_resolved')[0]; note(`the line round down the file met ${res ? res.payload.bodies : '?'} bodies`); await beat('file:lined'); }
      }
    }
    const done = await clear('enc_file', {
      fight: {
        // one line round down the file as it comes: fired when the leader is inside 30 m and three or more stand on her line
        idle: async () => { await step(4); },
        filter: (e) => {
          if (lined) return true;
          const p = pos();
          return dist2(e.x, e.z, p.x, p.z) < 30;
        },
        onShot: async () => {},
      },
      between: async () => {
        if (door('ia_baffle') === 'open' && hostiles().length === 0) { const r = await advance({ maxTicks: 60, to: 'cp_file_clear' }); if (r.reason !== 'interrupted') await step(10); } else await step(10);
      },
    });
    void lined;
    if (done !== 'cleared') return;
    // polish round 5: the section ends on the clear itself. Since the door's four, a packet can lie on the gantry side
    // of the far door, and picking it up here walked her through cp_hall_gantry before play() had seen cp_file_clear
    // (the death at that checkpoint was skipped). The tidying is the next section's first act.
    await beat('clear:enc_file');
  }
  async function toGantry() {
    await tidy();
    if (checkpoint() !== 'cp_file_clear') return;
    await go('cp_file_clear', { maxTicks: 60 * 90 });
    await go('cp_hall_gantry', { maxTicks: 60 * 60 });
    await until(() => checkpoint() === 'cp_hall_gantry' || dead(), 240);
  }

  // ====================================================================================================================
  // V. the lift hall
  // ====================================================================================================================
  async function loadLine() {
    if (weapon().cylinder[0] === 'line') return true;
    if (weapon().lineRounds === 0) return false;
    await readyToFire();
    dbg.tap('line');
    return (await until(() => weapon().phase === 'ready' && weapon().cylinder[0] === 'line', 120)) >= 0;
  }
  async function matador() {
    await beat('enter:lift_hall');
    if (encounter('enc_matador').state !== 'cleared') {
      lookAtMarker('vista_tamper');
      await step(90);                                           // the vignette: it pounds the bulkhead; watch the vent
      await beat('story:tamper_vignette');
      // down the ramp to the locker at its foot: half a Tamper
      await use('ia_line_locker_hall');
      await reload();
      await loadLine();
      const tamper = () => dbg.enemies().find((e) => e.kind === 'tamper' && e.alive);
      // step off the ramp: the fight starts
      const trg = marker('trg_enc_matador');
      await walkTo(trg.pos[0], trg.pos[2], { stopRadius: 0.5, maxTicks: 300 });
      await until(() => encounter('enc_matador').state === 'active' || dead(), 240);
      await beat('fight:enc_matador');
      // the line through its chest: 200 of its 900 health and 1.8 seconds with both vents open (TAMPER.lineStagger)
      const t0 = ctx.clock.tick;
      while (weapon().cylinder[0] === 'line' && tamper() && !dead() && ctx.clock.tick - t0 < 60 * 40) {
        const t = tamper();
        const part = aimAtEnemy(t, ['vent_chest', 'vent_back', 'plate']);
        if (part) { await step(1); if (aimAtEnemy(t, ['vent_chest', 'vent_back', 'plate'])) { await pull(); await beat('matador:line'); break; } }
        await step(4);
      }
      // The matador's part (polish round 3: 1 200 HP, the grate Biders at 15 s and 35 s). Lead only into an open vent: the
      // chest while the arm is up (a hit there stops the slam), the back while it is stunned after a charge. She stays
      // inside its charge band, at slam range, so the chest opens every few seconds; a charge is side-stepped.
      const CHEST = ['vent_chest'], BACK = ['vent_back'], BOTH = ['vent_chest', 'vent_back'], NONE = [];
      bot.ventsOnly = (e) => (e.state === 'slam_windup' || e.state === 'slam' ? CHEST : e.state === 'charge_stun' ? BACK : e.state === 'line_stagger' ? BOTH : NONE);
      const idle = async () => {
        const t = tamper(), w = weapon();
        if (w.phase === 'ready' && w.chambered < 6 && w.reserve > 0) dbg.tap('reload');       // a shot interrupts it
        if (!t) { await step(3); return; }
        const p = pos(), d = Math.hypot(t.x - p.x, t.z - p.z);
        if (t.state === 'charge_windup' || t.state === 'charge') { dbg.aimAt(t.x, t.y + 1.2, t.z); dbg.setActions(['left']); await step(3); return; }
        const biderNear = hostiles().some((e) => e.kind === 'bider' && Math.hypot(e.x - p.x, e.z - p.z) < 8);
        if (d > 6 && !biderNear && t.state === 'advance') { await walkTo(t.x, t.z, { stopRadius: 5.2, maxTicks: 10 }); return; }
        await step(3);
      };
      let done;
      try { done = await clear('enc_matador', { fight: { kite: 3.4, idle } }); } finally { bot.ventsOnly = null; }
      if (done !== 'cleared') return;
      await tidy();
      await beat('clear:enc_matador');
    }
    await go('cp_hall_clear', { maxTicks: 60 * 120 });
    await until(() => checkpoint() === 'cp_hall_clear' || dead(), 240);
  }
  /** walk into the cage of a lift, throw its lever, ride. -> true when the ride ended */
  async function ride(lever, rideId) {
    const r = await go('critical', { maxTicks: 60 * 120 });
    if (r.reason !== 'portal') note(`ride ${rideId}: the walk to the cage ended '${r.reason}'`);
    await beat('ride:' + rideId + ':cage');
    const seq = seqNow();
    if (!(await use(lever, { nav: false, reach: 1.6 }))) return false;
    await until(() => eventsSince(seq, 'ride/state').some((e) => e.payload.stage === 'started') || dead(), 120);
    await step(300);
    await beat('ride:' + rideId + ':dark');
    const t = await until(() => eventsSince(seq, 'ride/state').some((e) => e.payload.stage === 'ended') || dead(), 60 * 120, 10);
    if (t < 0) { note(`ride ${rideId} never ended`); return false; }
    return true;
  }
  async function liftDown() {
    if (ctx.world.zone === 'lift_hall') { if (!(await ride('ia_lift_lever', 'ride_lift_hall'))) return; }
    await beat('enter:the_bore');
    // the catwalk past the Windlass, the stair down, the antechamber
    lookAtMarker('vista_windlass');
    await step(30);
    await beat('story:windlass_seen');
    await go('cp_bore_ante', { maxTicks: 60 * 120 });
    await until(() => checkpoint() === 'cp_bore_ante' || dead(), 240);
  }

  // ====================================================================================================================
  // VI. the bore: the asking, the parley
  // ====================================================================================================================
  async function asking() {
    await beat('enter:antechamber');
    if (!puzzle('the_asking').solved) {
      await refill('ia_ammo_box_ante');
      await reload();
      // the empty cradle beside the door: look at it from close by (its lines are load-bearing)
      const c = marker('ia_cradle');
      await walkTo(c.pos[0] + 0.6, c.pos[2] - 2.2, { stopRadius: 0.4, maxTicks: 600 });
      lookAt(c.pos[0], c.pos[1], c.pos[2]);
      await step(60);
      await beat('story:cradle');
      if (!bot.skipReadables) await read('rd_note_cradle', { reach: 1.9 });
      const v = marker('trg_pz_asking');
      await walkTo(v.pos[0], v.pos[2] + 0.5, { stopRadius: 0.5, maxTicks: 600 });
      lookAtMarker('pz_listening_lamps');
      await beat('puzzle:the_asking');
      const answers = v.params.answers;                        // [4, 6, 'hold fire']: read off the placards and the diagram
      for (let guard = 0; guard < 8 && puzzle('the_asking').step < 2 && !dead(); guard++) {
        const q = puzzle('the_asking').step + 1;
        // hear the question out (it is put when she is inside the volume, and again every 20 s), then answer it
        await step(240);
        await shootEntity('ia_ask_port_' + answers[q - 1]);
        await step(30);
        if (puzzle('the_asking').step >= q) await beat('the_asking:answered_' + q);
      }
      // the third is answered by holding fire: the ring counts, the cradle's lamp steps with it
      lookAtMarker('pz_listening_lamps');
      await step(360);
      await beat('the_asking:listening');
      await until(() => puzzle('the_asking').solved || dead(), 60 * 40, 10);
      if (!puzzle('the_asking').solved) note('the_asking: holding fire did not solve it');
      await until(() => door('door_bore') === 'open' || dead(), 600);
      await beat('the_asking:solved');
    }
    if (dead()) return;
    // through the door: it seals, and the Windlass asks to be heard. She hears it out.
    await reload();
    const trg = marker('trg_enc_windlass');
    await walkTo(trg.pos[0], trg.pos[2] + 0.4, { stopRadius: 0.5, maxTicks: 900 });
    await until(() => boss().phase !== 'idle' || dead(), 240);
    await beat('boss:parley');
    const seq = seqNow();
    lookAtBoss();
    // hold fire until the inspection: all six mouths stand open for four seconds
    await until(() => { lookAtBoss(); return eventsSince(seq, 'boss/parley').some((e) => e.payload.stage === 'inspection') || boss().phase === 'p1' || dead(); }, 60 * 40, 5);
    await beat('boss:inspection');
    await shootMouths(() => boss().phase !== 'parley' || dead(), 60 * 6);
    await until(() => checkpoint() === 'cp_boss_p1' || dead(), 60 * 10);
  }

  // ====================================================================================================================
  // the Windlass
  // ====================================================================================================================
  const boss = () => ctx.enemies.boss;
  const bossExt = () => dbg.ext.enemies.boss();
  const bossId = () => { const b = dbg.enemies().find((e) => e.kind === 'windlass'); return b ? b.id : ''; };
  function lookAtBoss() { const h = dbg.ext.enemies.bossPoint('hub'); lookAt(h[0], h[1], h[2]); }
  /** aim at a part of the Windlass and say whether a round fired now would reach it */
  function aimBoss(kind, i) {
    const t = dbg.ext.enemies.bossPoint(kind, i);
    dbg.aimAt(t[0], t[1], t[2]);
    const pr = dbg.probe();
    return pr.hit && pr.entityKind === 'windlass' ? pr.part : (pr.hit ? pr.entityKind + ':' + pr.part : '');
  }
  /** put lead into every open mouth she can reach until stop() or the budget runs out. -> hits */
  async function shootMouths(stop, maxTicks) {
    const t0 = ctx.clock.tick;
    let hits = 0;
    while (!stop() && ctx.clock.tick - t0 < maxTicks) {
      if (boss().mouthsOpen <= 0) { await step(2); continue; }
      if (!(await readyToFire())) { await step(4); continue; }
      let fired = false;
      const dark = bossExt().dark;
      for (let i = 0; i < 6 && !fired; i++) {
        if (dark[i]) continue;
        if (aimBoss('knot', i) !== 'mouth') continue;
        await step(1);
        if (aimBoss('knot', i) !== 'mouth') continue;
        const pips = boss().pips;
        if (await pull()) { fired = true; await step(1); if (boss().pips < pips) hits++; }
      }
      if (!fired) await step(2);
    }
    return hits;
  }
  bot.boss = { boss, bossExt, bossId, lookAtBoss, aimBoss, shootMouths };

  // ---- the fight ---------------------------------------------------------------------------------------------------------
  // The Windlass aims only within 35 degrees of its arm's heading, and indexes to her bay only before a pattern. So:
  // while it fires she waits OUTSIDE the arc, 75 degrees round at the outer wall (spot A: stakes and canisters are
  // clamped to the arc's edge 8 m away, the lance cannot reach); when it hauls she runs in to the kerb side, 25 degrees
  // off its heading (spot B, through W), where both pawls and all six mouths are in sight, and shoots; when the haul
  // ends she is still in its bay, so it does not turn, and she runs back out before the first glow is over.
  const AXIS = marker('bore_opening').params.volume.axis;      // [x, _, z] of the bore
  const bearingPoint = (deg, r) => [AXIS[0] + Math.sin(deg * Math.PI / 180) * r, AXIS[2] - Math.cos(deg * Math.PI / 180) * r];
  const bearingOf = (x, z) => { const d = Math.atan2(x - AXIS[0], -(z - AXIS[2])) * 180 / Math.PI; return d < 0 ? d + 360 : d; };
  const offOf = (bearing, heading) => { let d = (bearing - heading) % 360; if (d > 180) d -= 360; else if (d <= -180) d += 360; return d; };
  const heading = () => (bossExt().armBay - 1) * 60;
  const OUT = 12.6, IN = 6.2, A_OFF = 75, W_OFF = 45, B_OFF = 25;
  /** the next point on the way to spot 'A' or 'B' from where she stands (ribs stand 30 degrees off the heading, 7.5 to 10.5 m out) */
  function towards(spot) {
    const h = heading(), p = pos();
    const off = offOf(bearingOf(p.x, p.z), h), r = dist2(p.x, p.z, AXIS[0], AXIS[2]);
    if (spot === 'A') {
      if (r < 9) return off < W_OFF - 6 ? bearingPoint(h + W_OFF, IN) : bearingPoint(h + A_OFF, OUT);
      if (off > 58) return bearingPoint(h + A_OFF, OUT);
      return bearingPoint(h + Math.min(A_OFF, Math.max(off, -20) + 15), OUT);
    }
    if (r > 9 && off > 38) return bearingPoint(h + W_OFF, IN);
    return bearingPoint(h + B_OFF, IN);
  }
  /** a few ticks toward a spot; -> true when she stands on it */
  function runTo(spot, ticks = 5) {
    const h = heading();
    const goal = spot === 'A' ? bearingPoint(h + A_OFF, OUT) : bearingPoint(h + B_OFF, IN);
    const p = pos();
    if (dist2(goal[0], goal[1], p.x, p.z) < 0.7) return true;
    const q = towards(spot);
    dbg.walkTo(q[0], q[1], { maxTicks: ticks, stopRadius: 0.5, sprint: true });
    return false;
  }
  /** walk round the chamber to a bay centre: in to the clear ring between the kerb and the ribs, round it, out along the bay */
  async function ringTo(bearing) {
    const p = pos();
    let a = bearingOf(p.x, p.z);
    const r0 = dist2(p.x, p.z, AXIS[0], AXIS[2]);
    if (Math.abs(offOf(bearing, a)) > 20) {
      if (r0 > 7.2) {
        // a rib stands on every odd 30 degrees: go in along the nearer side of the bay she is in
        const bay = Math.round(a / 60) * 60;
        const side = bay + Math.max(-18, Math.min(18, offOf(a, bay)));
        for (const q of [bearingPoint(side, Math.max(r0, 11.4)), bearingPoint(side, IN)]) await walkTo(q[0], q[1], { stopRadius: 0.6, maxTicks: 300 });
        a = side;
      }
      for (let guard = 0; guard < 30 && Math.abs(offOf(bearing, a)) > 8; guard++) {
        a += Math.sign(offOf(bearing, a)) * Math.min(15, Math.abs(offOf(bearing, a)));
        const q = bearingPoint(a, IN);
        await walkTo(q[0], q[1], { stopRadius: 0.6, maxTicks: 240 });
        if (dead()) return;
      }
    }
    const out = bearingPoint(bearing, OUT);
    await walkTo(out[0], out[1], { stopRadius: 0.8, maxTicks: 420 });
  }
  const boxUsedAt = {};
  /** a boss-room cartridge point (six rounds, twenty seconds between) when one is within 7 m and she is short */
  async function bossRefill() {
    if (weapon().reserve > 12) return false;
    const p = pos();
    for (const id of ['ia_ammo_box_bore_e', 'ia_ammo_box_bore_w']) {
      const m = marker(id);
      if (dist2(m.pos[0], m.pos[2], p.x, p.z) > 7) continue;
      if (boxUsedAt[id] !== undefined && ctx.clock.simTime - boxUsedAt[id] < 21) continue;
      const before = weapon().reserve;
      const stand = bearingPoint(bearingOf(m.pos[0], m.pos[2]) - 5, 13.6);
      await walkTo(stand[0], stand[1], { stopRadius: 0.4, maxTicks: 240 });
      if (dead()) return false;
      await use(id, { nav: false, reach: 2.1, from: [pos().x, 0, pos().z] });
      boxUsedAt[id] = weapon().reserve > before ? ctx.clock.simTime : ctx.clock.simTime - 12;
      return true;
    }
    return false;
  }
  /** phases 1 and 2. -> when the phase is over or she is dead */
  async function bossFight(phase) {
    lookAtBoss();
    await beat('boss:' + phase);
    let seq = seqNow();
    let shownHaul = false, shownGuard = false, shownPattern = false;
    const t0 = ctx.clock.tick;
    while (boss().phase === phase && !dead() && ctx.clock.tick - t0 < 60 * 420) {
      const p = pos();
      const b = bossExt();
      for (const e of eventsSince(seq, 'boss/discharge')) if (!shownPattern && e.payload.kind !== 'dry') { shownPattern = true; lookAtBoss(); await beat('boss:' + phase + ':pattern'); }
      seq = seqNow();
      const canFire = weapon().phase === 'ready' && weapon().chambered > 0;
      // the Biders that climb out of the grates: one round each, the close ones before anything else
      const range = b.sub === 'haul' ? 6 : 18;
      if (canFire && hostiles().some((e) => dist2(e.x, e.z, p.x, p.z) < range)) {
        const r = await bot.shootNearest((e) => dist2(e.x, e.z, pos().x, pos().z) < range);
        if (r) continue;
      }
      if (b.sub === 'haul') {
        if (!shownHaul && dist2(p.x, p.z, AXIS[0], AXIS[2]) < 8.2) { shownHaul = true; lookAtBoss(); await beat('boss:' + phase + ':haul'); }
        if (boss().guard === 'set') {
          // the guard is held by two pawls high on the arm: both, then the mouths
          const there = runTo('B');
          const r = dist2(p.x, p.z, AXIS[0], AXIS[2]);
          if (r < 8.2 && canFire) {
            if (!shownGuard) { shownGuard = true; lookAtBoss(); await beat('boss:' + phase + ':guard'); }
            for (let i = 0; i < 2; i++) {
              if (b.pawls[i]) continue;
              if (aimBoss('pawl', i) !== 'pawl') continue;
              await step(1);
              if (aimBoss('pawl', i) === 'pawl') { await pull(); break; }
            }
          } else if (there) await step(1);
          continue;
        }
        // in to the kerb side of ITS bay (it turns to the bay she stands in when the haul ends): shoot on arrival
        const there = runTo('B');
        if (dist2(pos().x, pos().z, AXIS[0], AXIS[2]) < 8.2 && canFire) {
          const before = report.shots;
          await shootMouths(() => report.shots > before || boss().phase !== phase || bossExt().sub !== 'haul' || dead(), 12);
          if (report.shots > before) continue;
        }
        if (there) await step(1);
        continue;
      }
      if (b.sub !== 'pattern') {
        // a transition or an index: stay in the bay it faces, so that it stays where the cartridge point is
        const w0 = weapon();
        if (w0.phase === 'ready' && w0.chambered < 6 && w0.reserve > 0) dbg.tap('reload');
        const off = offOf(bearingOf(p.x, p.z), heading());
        if (Math.abs(off) > 27) { const q = bearingPoint(heading() + Math.sign(off) * 22, Math.max(IN, Math.min(OUT, dist2(p.x, p.z, AXIS[0], AXIS[2])))); dbg.walkTo(q[0], q[1], { maxTicks: 5, stopRadius: 0.5 }); } else { lookAtBoss(); await step(3); }
        continue;
      }
      // it is indexing or firing: out of its arc, thumb rounds in on the way, top up at the cartridge point
      const w = weapon();
      if (w.phase === 'ready' && w.chambered < 6 && w.reserve > 0) dbg.tap('reload');
      if (runTo('A')) {
        if (await bossRefill()) continue;
        // what the adds dropped, when it lies outside the arc
        if (await collect({ within: 9, rounds: 30, filter: (k) => Math.abs(offOf(bearingOf(k.x, k.z), heading())) > 50 })) continue;
        lookAtBoss();
        await step(3);
      }
    }
  }
  async function bossP1() { await bossFight('p1'); await until(() => checkpoint() === 'cp_boss_p2' || dead() || boss().phase === 'p1', 60 * 8); }
  async function bossP2() { await bossFight('p2'); await until(() => checkpoint() === 'cp_boss_p3' || dead() || boss().phase === 'p2', 60 * 8); }
  /** phase 3a: lead cannot finish it. To a lit mark, F, down the bore. */
  async function bossP3a() {
    lookAtBoss();
    await beat('boss:p3a');
    const p = pos();
    // the nearest proving mark
    let best = null, bd = Infinity;
    for (let i = 1; i <= 6; i++) { const m = marker('ia_proving_mark_' + i); const d = dist2(m.pos[0], m.pos[2], p.x, p.z); if (d < bd) { bd = d; best = m; } }
    const t0 = ctx.clock.tick;
    while (boss().phase !== 'proven' && boss().phase !== 'p3b' && boss().phase !== 'dead' && !dead() && ctx.clock.tick - t0 < 60 * 120) {
      if (dist2(best.pos[0], best.pos[2], pos().x, pos().z) > 0.35) await walkTo(best.pos[0], best.pos[2], { stopRadius: 0.25, maxTicks: 600 });
      if (dead()) return;
      const w = weapon();
      if (w.phase !== 'loading_kept' && w.cylinder[0] !== 'kept' && w.seventh !== 'chambered') {
        await until(() => weapon().phase === 'ready' || dead(), 200);
        await beat('boss:on_the_mark');
        dbg.tap('kept');
        await step(4);
      }
      // the load: 1.8 s; the head swings clear
      await until(() => weapon().phase === 'ready' || dead(), 400);
      await beat('boss:hush');
      // down into the hole
      dbg.aimAt(AXIS[0], marker('bore_opening').pos[1] - 3.0, AXIS[2]);
      await step(3);
      if (core.playerExtra().keptAimLegal) {
        await beat('boss:plumb');
        const seq = seqNow();
        dbg.tap('fire');
        await until(() => eventsSince(seq, 'weapon/kept').some((e) => e.payload.stage === 'fired') || dead(), 120);
        await step(30);
        await beat('boss:the_seventh');
        break;
      }
      await step(20);
    }
    await until(() => checkpoint() === 'cp_boss_proven' || dead(), 60 * 30);
  }
  /** phase 3b: six lead rounds into a machine that goes on hauling; then the proving lift */
  async function bossP3b() {
    if (boss().phase !== 'dead') {
      await until(() => boss().phase === 'p3b' || boss().phase === 'dead' || dead(), 60 * 30);
      lookAtBoss();
      await beat('boss:p3b');
      await reload();
      const t0 = ctx.clock.tick;
      let moved = 0;
      while (boss().phase === 'p3b' && !dead() && ctx.clock.tick - t0 < 60 * 240) {
        const hits = await shootMouths(() => boss().phase !== 'p3b' || dead(), 180);
        if (boss().phase !== 'p3b') break;
        if (weapon().chambered === 0 && weapon().reserve === 0 && (await collect({ within: 30 }))) continue;
        if (weapon().chambered === 0 && weapon().reserve === 0) {
          // dry: the east cartridge point (nothing can hurt her now)
          const m = marker('ia_ammo_box_bore_e');
          for (let a = bearingOf(pos().x, pos().z); Math.abs(offOf(85, a)) > 10; a += Math.sign(offOf(85, a)) * 15) { const q = bearingPoint(a + Math.sign(offOf(85, a)) * 15, 12.8); await walkTo(q[0], q[1], { stopRadius: 0.8, maxTicks: 300 }); }
          await use('ia_ammo_box_bore_e', { nav: false, reach: 2.1, from: [m.pos[0] - 1.2, 0, m.pos[2] - 0.8] });
          await step(60 * 21);
          continue;
        }
        if (hits === 0) {
          // no open mouth in reach from here: walk round to where the drum's face is
          const b = bossExt();
          const q = bearingPoint((b.armBay - 1) * 60 + (moved++ % 2 ? 12 : -12), 10.5);
          await walkTo(q[0], q[1], { stopRadius: 0.8, maxTicks: 420 });
        }
      }
      lookAtBoss();
      await step(240);
      lookAtBoss();
      await beat('boss:dead');
    }
    await until(() => door('door_proving_lift') === 'open' || dead(), 60 * 40, 10);
    await beat('boss:lift_gate_open');
    // round the kerb inside the ribs to the bay opposite the door, then straight out to the gate
    if (ctx.world.zone === 'the_bore' && dist2(pos().x, pos().z, AXIS[0], AXIS[2]) < 14.5) await ringTo(180);
    if (!(await ride('ia_proving_lift', 'ride_proving_lift'))) return;
    await until(() => checkpoint() === 'cp_rim' || dead(), 600);
  }

  // ====================================================================================================================
  // VII. the far rim
  // ====================================================================================================================
  async function rim() {
    await beat('enter:far_rim');
    await walkToMarker('trg_rim_arrive', { stopRadius: 0.5, maxTicks: 600 });
    lookAtMarker('vista_rim_rule');
    await step(120);
    await beat('story:rim_vista');
    await walkToMarker('trg_lamps', { stopRadius: 0.8, maxTicks: 900 });
    lookAtMarker('vista_plenty');
    await step(240);
    await beat('story:lamps');
    const stone = marker('trg_stone');
    await walkTo(stone.pos[0] + 0.5, stone.pos[2], { stopRadius: 0.4, maxTicks: 900 });
    lookAtMarker('ia_stone_round');
    await step(120);
    await beat('story:stone');
    // his note lies under the first spent case, 0.4 m from the round: read it from the side, so the round is not in the line of sight
    if (!bot.skipReadables) { const n = marker('rd_note_stone'); await read('rd_note_stone', { nav: false, from: [n.pos[0] - 0.3, 0, n.pos[2] + 1.25], reach: 0.45 }); await walkTo(stone.pos[0] + 0.5, stone.pos[2], { stopRadius: 0.4, maxTicks: 300 }); }
    if (bot.leaveTheRound) {
      // R5 (polish round 3): the choice is not taken from her while she stands at the stone. Leaving the round means
      // walking on: the north strip (exit_rim) ends the stage once the stone's lines are over (or 25 s spent more than
      // 4 m away). The bot stood at the stone and waited for ever (polish round 4, playthrough).
      const ex = marker('exit_rim');
      await walkTo(ex.pos[0] - 6, ex.pos[2], { stopRadius: 0.5, maxTicks: 900 });
      lookAtMarker('vista_fire');
    }
    else {
      await use('ia_stone_round', { nav: false, reach: 2.0 });
      await step(60);
      await beat('story:round_taken');
    }
    lookAtMarker('vista_fire');
    const seq = seqNow();
    await until(() => ctx.state.current === 'ending', 60 * 200, 10);
    await beat('ending:fire');
    // the wind, then the card
    await until(() => eventsSince(seq, 'ending/card').length > 0, 60 * 30, 5);
    await step(30);
    await beat('ending');
    // the ledger lights row by row (the UI counts drawn frames: with frames on, every tick is drawn here)
    const every = bot.frameEvery;
    if (every > 0) bot.frameEvery = 1;
    await step(60 * 8);
    bot.frameEvery = every;
    await beat('ending:card');
  }

  const SECTIONS = {
    cp_boss_p1: bossP1, cp_boss_p2: bossP2, cp_boss_p3: bossP3a, cp_boss_proven: bossP3b, cp_rim: rim,
    cp_bore_ante: asking,
    cp_hall_gantry: matador, cp_hall_clear: liftDown,
    cp_lip_start: lip, cp_lip_gate: street, cp_street_clear: yard, cp_yard_clear: toTally, cp_tally_enter: tally, cp_tally_hatch: stair,
    cp_gallery_bay: provingLine, cp_gallery_baffle: file, cp_file_clear: toGantry,
  };
  bot.SECTIONS = SECTIONS;
  bot.helpers = { advance, use, read, clear, beat, key, playing, dead, checkpoint };

  /**
   * Play from wherever the run stands until `until` (a checkpoint id, or 'ending') is reached.
   * opts.dieAtEveryCheckpoint: on the first arrival at each checkpoint she is killed through the game's own damage
   * path and the restore is checked (bot.report.restores) before the section is played.
   * opts.godAfterDeaths (default 3): after that many deaths in one section, god mode goes on for that section (reported).
   */
  async function play(opts = {}) {
    const stopAt = opts.until ?? 'ending';
    const godAfter = opts.godAfterDeaths ?? 3;
    const deathsIn = {};
    const checked = new Set();
    let guard = 0;
    while (ctx.state.current !== 'ending' && guard++ < 200) {
      await core.idle();
      if (ctx.state.current !== 'playing' || !ctx.player.alive) { await until(() => ctx.state.current === 'playing' && ctx.player.alive, 60 * 20); if (ctx.state.current === 'ending') break; }
      const cp = checkpoint();
      if (cp === stopAt) break;
      const section = SECTIONS[cp];
      if (!section) { note(`no section for checkpoint ${cp}`); break; }
      if (opts.dieAtEveryCheckpoint && !checked.has(cp)) { checked.add(cp); await bot.dieAndCheck(cp); }
      const deathsBefore = ctx.world.stats.deaths;
      const t0 = ctx.clock.tick;
      if ((deathsIn[cp] ?? 0) >= godAfter && !P().god) bot.god(true, `${deathsIn[cp]} deaths in the section after ${cp}`);
      if (opts.god && opts.god.includes(cp) && !P().god) bot.god(true, `asked for in the section after ${cp}`);
      await section();
      bot.seqNow();
      const died = ctx.world.stats.deaths - deathsBefore;
      if (died > 0) deathsIn[cp] = (deathsIn[cp] ?? 0) + died;
      report.sections.push({ from: cp, to: checkpoint(), ticks: ctx.clock.tick - t0, seconds: +((ctx.clock.tick - t0) / 60).toFixed(1), deaths: died, god: P().god, health: P().health, ammo: `${P().chambered}+${P().reserve}+${P().lineRounds}L` });
      if (checkpoint() !== cp && P().god) dbg.god(false);
      if (checkpoint() === cp && died === 0 && ctx.state.current !== 'ending') { note(`the section after ${cp} ended without reaching a checkpoint`); if ((deathsIn['stall:' + cp] = (deathsIn['stall:' + cp] ?? 0) + 1) >= 2) break; }
    }
    return { state: ctx.state.current, checkpoint: checkpoint(), tick: ctx.clock.tick, report };
  }
  bot.play = play;

  // ---- the death-and-restore check ----------------------------------------------------------------------------------------
  const settled = (d) => (d === 'opening' ? 'open' : d === 'closing' ? 'closed' : d);
  function snapshot() {
    const w = ctx.world, out = { checkpoint: w.checkpoint, set: w.residentSet, objective: w.objective, puzzles: {}, encounters: {}, doors: {}, boss: ctx.enemies.boss.phase };
    for (const id of ['seven_jugs', 'daylight', 'proving_line', 'the_asking']) out.puzzles[id] = w.puzzle(id).solved;
    for (const id of ['enc_street', 'enc_yard', 'enc_tally', 'enc_file', 'enc_matador', 'enc_windlass']) out.encounters[id] = w.encounter(id).state === 'cleared';
    for (const m of ctx.data.markersOfType('door')) out.doors[m.id] = settled(w.doorState(m.id));
    return out;
  }
  bot.snapshot = snapshot;
  /**
   * She is killed through the game's own damage path (player.applyDamage: grace and the last-20-HP absorb included), the
   * death sequence and the restore run by themselves, and what comes back is compared with what the checkpoint held.
   * The result goes to bot.report.restores: { checkpoint, ok, problems[], respawnTicks, health, ammo, metresFromMarker }.
   */
  bot.dieAndCheck = async function dieAndCheck(cp) {
    (report.restores ??= []);
    const before = snapshot();
    const m = marker(cp);
    const problems = [];
    const seq = seqNow();
    const t0 = ctx.clock.tick;
    for (let i = 0; i < 12 && ctx.player.alive; i++) { core.damage(1000, 'bullet', 'world'); await step(20); }
    if (ctx.player.alive) problems.push('she could not be killed');
    const back = await until(() => ctx.state.current === 'playing' && ctx.player.alive && eventsSince(seq, 'player/respawned').length > 0, 60 * 30);
    if (back < 0) problems.push(`no respawn within 30 s (state ${ctx.state.current})`);
    await step(2);
    const died = eventsSince(seq, 'player/died')[0], respawned = eventsSince(seq, 'player/respawned')[0];
    const respawnTicks = died && respawned ? respawned.tick - died.tick : -1;
    if (respawnTicks > 180) problems.push(`death to control took ${respawnTicks} ticks (limit 180)`);
    const after = snapshot();
    if (after.checkpoint !== cp) problems.push(`restored at ${after.checkpoint}, not ${cp}`);
    // the Windlass comes back at the START of the phase the checkpoint belongs to: the parley is not asked twice, and the
    // four seconds of silence after the proof ('proven') are not replayed (it comes back dry, 'p3b')
    const phaseOf = (ph) => (ph === 'parley' ? 'p1' : ph === 'proven' ? 'p3b' : ph === 'hush' ? 'p3a' : ph);
    for (const k of ['set', 'objective', 'boss']) if ((k === 'boss' ? phaseOf(after.boss) !== phaseOf(before.boss) : after[k] !== before[k])) problems.push(`${k}: ${before[k]} before, ${after[k]} after`);
    for (const group of ['puzzles', 'encounters', 'doors']) for (const id of Object.keys(before[group])) if (before[group][id] !== after[group][id]) problems.push(`${group}.${id}: ${before[group][id]} before, ${after[group][id]} after`);
    const p = P();
    const metres = Math.hypot(p.x - m.pos[0], p.z - m.pos[2], p.y - m.pos[1]);
    if (metres > 6) problems.push(`she stands ${metres.toFixed(1)} m from the checkpoint's marker`);
    if (p.health < 60) problems.push   /* RESPAWN_MIN_HEALTH (GDD 5): the floor a restore gives; closer r4, world request 2.1 */(`restored with ${p.health} HP`);
    if (p.chambered + p.reserve < 6) problems.push(`restored with ${p.chambered} + ${p.reserve} rounds`);
    if (!p.grounded && Math.abs(p.vy) > 0.5) problems.push('restored in the air');
    if (!core.capsuleFree(p.x, p.y + 0.05, p.z, 0.35, 1.8)) problems.push('restored inside geometry');
    if (hostiles().length > 0 && !/boss/.test(cp)) problems.push(`${hostiles().length} hostile(s) awake on the tick of the restore`);
    report.restores.push({ checkpoint: cp, ok: problems.length === 0, problems, respawnTicks, health: p.health, ammo: `${p.chambered}+${p.reserve}+${p.lineRounds}L`, metresFromMarker: +metres.toFixed(2), tick: ctx.clock.tick - t0 });
    if (problems.length) note(`RESTORE at ${cp}: ${problems.join('; ')}`);
    await beat('restore:' + cp);
  };
})();
