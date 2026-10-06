// The worst fight, as events (work order section 6, "Voices and cost"): a shot every 480 ms with its hit, seat-clicks
// between shots, sprint footsteps, damage, three Biders running, two Transits walking and aiming, a Tamper walking and
// slamming, stakes, the Windlass discharging on its 1.1 s cadence with the boss drum, knots, station lines and a cue
// from the whole list every 1.3 s. Far more than the game can produce at once.
//
// `fight(dbg, n)` runs INSIDE THE PAGE (it is serialised for measureAlloc: no closures) and runs exactly n ticks. Every
// payload is built once and reused, as the real emitters do.
export const fight = (dbg, n) => {
  let f = window.__fight;
  if (!f) {
    const pos = (x, z) => ({ x, y: 0, z });
    // every cue but the three that change the state of the world (the ending, the proof)
    const cues = dbg.ext.audio.cues().filter((c) => c !== 'wire_resolve' && c !== 'water_below' && c !== 'hum_stop');
    f = window.__fight = {
      k: 0, voices: 0, cues,
      fired: { shotId: 0, ammo: 'lead_round', chambersLeft: 5, ox: 0, oy: 1.65, oz: 0, dx: 0, dy: 0, dz: -1, mx: 0, my: 1.5, mz: 0, endX: 0, endY: 1, endZ: -40 },
      hit: { x: 0, y: 1, z: -12, shotId: 0, order: 0, ammo: 'lead_round', outcome: 'impact', entityId: '', entityKind: 'world', part: 'body', surface: 'adobe', nx: 0, ny: 1, nz: 0, damage: 0, ricochetX: 0, ricochetY: 0, ricochetZ: 0 },
      outcomes: ['kill', 'impact', 'deflected', 'hit', 'weak', 'freed', 'broke', 'impact'],
      surfaces: ['sand', 'wood', 'adobe', 'metal', 'ceramic', 'stone', 'cloth'],
      reload: { stage: 'round', chambered: 1, reserve: 20 },
      step: { x: 0, y: 0, z: 0, surface: 'stone', sprint: true },
      damaged: { amount: 18, health: 60, kind: 'lunge', source: 'bider', fromX: 0, fromY: 0, fromZ: 0, graceUsed: false },
      tell: [
        { ...pos(-74, -3), id: 'bider#1', kind: 'bider', attack: 'lunge', seconds: 0.5 }, { ...pos(-76, 2), id: 'bider#2', kind: 'bider', attack: 'lunge', seconds: 0.5 },
        { ...pos(-60, 8), id: 'transit#1', kind: 'transit', attack: 'aim', seconds: 0.9 }, { ...pos(-90, -6), id: 'transit#2', kind: 'transit', attack: 'aim', seconds: 0.9 },
        { ...pos(-70, 4), id: 'tamper#1', kind: 'tamper', attack: 'slam', seconds: 1.0 }, { ...pos(-70, 4), id: 'tamper#1', kind: 'tamper', attack: 'charge', seconds: 0.8 },
      ],
      attack: [{ ...pos(-74, -3), id: 'bider#1', kind: 'bider', attack: 'lunge' }, { ...pos(-70, 4), id: 'tamper#1', kind: 'tamper', attack: 'slam' }],
      stake: { ...pos(-60, 8), id: 'stake#1', kind: 'stake', source: 'transit' },
      landed: { ...pos(-68, 1), id: 'stake#1', kind: 'stake', surface: 'wood', hitPlayer: false },
      discharge: { kind: 'stake', mouth: 1, glowSeconds: 0.9, parryable: true },
      knot: { ...pos(-72, -8), id: 'knot_a', onMechanism: false, regrows: true },
      line: { key: 'stn_yard_wake', speaker: 'station', text: 'LIFT STATION 4. SURFACE POWER: WIND. THANK YOU FOR YOUR PATIENCE.', seconds: 5.5 },
      cue: { cue: 'gate_bang', x: -70, y: 0, z: 0, positional: true, gain: 1, pitch: 1 },
    };
    // the cast: three Biders running, two Transits walking, a Tamper walking; an encounter and the boss's cadence
    for (const [id, kind, x, z, to] of [['bider#1', 'bider', -74, -3, 'approach'], ['bider#2', 'bider', -76, 2, 'approach'], ['bider#3', 'bider', -78, -1, 'approach'], ['transit#1', 'transit', -60, 8, 'relocate'], ['transit#2', 'transit', -90, -6, 'relocate'], ['tamper#1', 'tamper', -70, 4, 'advance']]) {
      dbg.emit('enemy/spawned', { x, y: 0, z, id, kind, encounter: 'enc_matador', entrance: 'doorway' });
      dbg.emit('enemy/state', { id, kind, from: 'rise', to });
    }
    dbg.emit('encounter/started', { id: 'enc_matador' });
    dbg.emit('boss/phase', { phase: 'p1', from: 'parley' });
  }
  const audio = dbg.ext.core.ctx().audio;
  for (let i = 0; i < n; i++) {
    const k = f.k++;
    if (k % 29 === 0) {
      const shot = (k / 29) | 0;
      f.fired.shotId = shot; f.fired.chambersLeft = 5 - (shot % 6);
      dbg.emit('weapon/fired', f.fired);
      f.hit.shotId = shot; f.hit.outcome = f.outcomes[shot & 7]; f.hit.surface = f.surfaces[shot % 7]; f.hit.entityKind = (shot & 7) === 2 ? 'tamper' : 'world';
      dbg.emit('combat/hit', f.hit);
    }
    if (k % 29 === 15) { f.reload.chambered = 1 + (((k / 29) | 0) % 6); dbg.emit('weapon/reload', f.reload); }
    if (k % 20 === 0) dbg.emit('player/footstep', f.step);
    if (k % 90 === 45) dbg.emit('player/damaged', f.damaged);
    if (k % 30 === 10) dbg.emit('enemy/telegraph', f.tell[((k / 30) | 0) % 6]);
    if (k % 60 === 40) dbg.emit('enemy/attack', f.attack[((k / 60) | 0) & 1]);
    if (k % 144 === 74) dbg.emit('projectile/spawned', f.stake);
    if (k % 144 === 90) dbg.emit('projectile/landed', f.landed);
    if (k % 66 === 0) dbg.emit('boss/discharge', f.discharge);
    if (k % 45 === 7) dbg.emit('knot/burst', f.knot);
    if (k % 330 === 150) dbg.emit('story/line', f.line);
    if (k % 77 === 3) { f.cue.cue = f.cues[((k / 77) | 0) % f.cues.length]; dbg.emit('audio/cue', f.cue); }
    dbg.step(1, false);
    if (audio.voices > f.voices) f.voices = audio.voices;
  }
};
