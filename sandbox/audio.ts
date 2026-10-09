// sandbox/audio: the sound board (work order code-audio section 5). The real audio system beside the core stubs; one
// button per gameplay event that makes a sound (with its payload variants) and per AudioCue; the zones (each a warp,
// so reverb and ambience are the real ones); the hum; music state and intensity; the kept-round sequence as one
// button; a six-shot cylinder with a reload; the jug scale; a scope and a peak meter; a caption log.
//   ?test=1  no real-time loop: drive it through window.__dbg; `__dbg.ext.audio.render()` for offline assertions.
// A real click anywhere on the page unlocks the context. Every button has a stable `data-b` id (tests click them).
import type {
  AmmoType, AudioCue, AudioSystem, BossPhase, CheckpointId, EnemyKind, EntityKind, GameContext, GameEvents, HitOutcome, SurfaceType, ZoneId,
} from '../src/core/contracts.ts';
import { createSandbox } from '../src/core/sandbox.ts';
import type { Sandbox } from '../src/core/sandbox.ts';
import { createAudioSystem } from '../src/audio/index.ts';

interface BoardEngine {
  ambience: { hum: number; setHum(mode: number, now: number, fade: number): void; setWater(on: boolean, now: number): void };
  proof: number;
}
interface AudioExt {
  status(): { context: string; sampleRate: number; unlocked: boolean; active: boolean; nodes: number; starts: number; voices: number; voicePeak: number; dropped: number };
  cues(): string[];
  engine(): BoardEngine;
  graph(): { now(): number; analyser(): AnalyserNode } | null;
}
interface Hook { ext: { audio: AudioExt }; checkpoint(id: CheckpointId): Promise<unknown> }

const ZONE_CHECKPOINT: Record<ZoneId, CheckpointId> = {
  the_lip: 'cp_lip_start', plenty_street: 'cp_street_clear', tally_house: 'cp_tally_enter', the_gallery: 'cp_gallery_bay',
  lift_hall: 'cp_hall_gantry', the_bore: 'cp_bore_ante', far_rim: 'cp_rim',
};
const SURFACES: SurfaceType[] = ['sand', 'wood', 'adobe', 'metal', 'ceramic', 'stone', 'cloth', 'none'];
const OUTCOMES: HitOutcome[] = ['impact', 'hit', 'weak', 'kill', 'freed', 'deflected', 'broke', 'parried', 'passed'];

/** things to do on a later tick (sequences run on the sim clock, so they work stepped and in real time) */
const later: { at: number; run: () => void }[] = [];
let ticks = 0;
function after(seconds: number, run: () => void): void { later.push({ at: ticks + Math.round(seconds * 60), run }); }

function wrap(system: AudioSystem): AudioSystem {
  const inner = system.fixedUpdate?.bind(system);
  system.fixedUpdate = (dt: number): void => {
    ticks++;
    for (let i = later.length - 1; i >= 0; i--) {
      const job = later[i] as { at: number; run: () => void };
      if (job.at <= ticks) { later.splice(i, 1); job.run(); }
    }
    if (inner) inner(dt);
  };
  return system;
}

function build(sb: Sandbox): void {
  const ctx: GameContext = sb.ctx;
  const hook = (window as unknown as { __dbg: Hook }).__dbg;
  const ext = hook.ext.audio;
  const groups = document.getElementById('groups') as HTMLElement;
  const emit = <K extends keyof GameEvents>(name: K, payload: GameEvents[K]): void => { ctx.events.emit(name, payload); };
  /** a point `metres` in front of her, `side` metres to her right */
  const ahead = (metres: number, side = 0): { x: number; y: number; z: number } => {
    const p = ctx.player.position, f = ctx.player.forward;
    return { x: p.x + f.x * metres - f.z * side, y: p.y + 1.2, z: p.z + f.z * metres + f.x * side };
  };
  let section: HTMLElement = groups;
  const group = (title: string): void => {
    const h = document.createElement('h2'); h.textContent = title; groups.appendChild(h);
    section = document.createElement('div'); groups.appendChild(section);
  };
  const button = (id: string, label: string, run: () => void, cls = ''): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = label; b.dataset['b'] = id; if (cls) b.className = cls;
    b.addEventListener('click', run);
    section.appendChild(b);
    return b;
  };

  // ---- the cylinder
  let chambers = 6, shotId = 0, reserve = 30;
  const cylinder = document.getElementById('cylinder') as HTMLElement;
  const showCylinder = (): void => { cylinder.textContent = 'cylinder ' + '●'.repeat(chambers) + '○'.repeat(6 - chambers) + '  reserve ' + reserve; };
  const fired = (ammo: AmmoType, left: number): void => {
    const o = ctx.player.position, f = ctx.player.forward;
    emit('weapon/fired', { shotId: ++shotId, ammo, chambersLeft: left, ox: o.x, oy: o.y + 1.65, oz: o.z, dx: f.x, dy: f.y, dz: f.z, mx: o.x, my: o.y + 1.5, mz: o.z, endX: o.x + f.x * 40, endY: o.y, endZ: o.z + f.z * 40 });
  };
  const hit = (outcome: HitOutcome, surface: SurfaceType, entityKind: EntityKind = 'world', order = 0): void => {
    const at = ahead(12);
    emit('combat/hit', { ...at, shotId, order, ammo: 'lead_round', outcome, entityId: '', entityKind, part: 'body', surface, nx: 0, ny: 1, nz: 0, damage: 0, ricochetX: 0, ricochetY: 0, ricochetZ: 0 });
  };
  const fire = (): void => {
    if (chambers === 0) { emit('weapon/dry_fire', { reason: 'empty' }); return; }
    chambers--;
    fired('lead_round', chambers);
    hit('impact', 'sand');
    showCylinder();
  };
  const reload = (): void => {
    if (chambers >= 6) return;
    emit('weapon/reload', { stage: 'open', chambered: chambers, reserve });
    let at = 0.35;
    for (let c = chambers + 1; c <= 6; c++) {
      after(at, () => { chambers = c; reserve--; emit('weapon/reload', { stage: 'round', chambered: c, reserve }); showCylinder(); });
      at += 0.3;
    }
    after(at, () => emit('weapon/reload', { stage: 'close', chambered: 6, reserve }));
  };
  group('the gun (GDD 6.8): a six-shot cylinder; the last two rounds sound different');
  button('gun:fire', 'FIRE', fire, 'hot');
  button('gun:reload', 'reload (0.35 + n x 0.30 + 0.30 s)', reload);
  button('gun:six', 'six shots, 480 ms apart, then a dry click', () => { for (let k = 0; k < 7; k++) after(k * 0.48, fire); });
  // a shot with its confirm: the confirm sounds 190 ms after the click (the kill's thud too), over the report's tail
  const fireAnd = (outcome: HitOutcome, kind: EntityKind): void => {
    if (chambers === 0) chambers = 6;
    chambers--;
    fired('lead_round', chambers);
    hit(outcome, 'cloth', kind);
    showCylinder();
  };
  button('gun:fire_hit', 'FIRE and hit', () => fireAnd('hit', 'bider'), 'hot');
  button('gun:fire_weak', 'FIRE, weak point', () => fireAnd('weak', 'transit'), 'hot');
  button('gun:fire_kill', 'FIRE and kill', () => fireAnd('kill', 'bider'), 'hot');
  button('gun:fire_deflect', 'FIRE, deflected (tamper plate)', () => fireAnd('deflected', 'tamper'), 'hot');
  button('gun:hit_miss', 'miss, hit, weak, kill: 0.8 s apart', () => {
    after(0, fire); after(0.8, () => fireAnd('hit', 'bider')); after(1.6, () => fireAnd('weak', 'transit')); after(2.4, () => fireAnd('kill', 'bider'));
  });
  button('gun:dry', 'dry fire', () => emit('weapon/dry_fire', { reason: 'empty' }));
  button('gun:dry_kept', 'dry fire (kept, not in the bore)', () => emit('weapon/dry_fire', { reason: 'kept_not_in_bore' }));
  button('gun:reload_open', 'gate open', () => emit('weapon/reload', { stage: 'open', chambered: 0, reserve }));
  for (let c = 1; c <= 6; c++) button('gun:round_' + c, 'seat ' + c, () => emit('weapon/reload', { stage: 'round', chambered: c, reserve }));
  button('gun:reload_close', 'gate close', () => emit('weapon/reload', { stage: 'close', chambered: 6, reserve }));
  button('gun:reload_fast', 'fast close', () => emit('weapon/reload', { stage: 'fast_close', chambered: 3, reserve }));
  button('gun:line_load', 'line round: load', () => emit('weapon/line', { stage: 'loaded', held: 0 }));
  button('gun:line_unload', 'line round: unload', () => emit('weapon/line', { stage: 'unloaded', held: 1 }));
  button('gun:line_fire', 'FIRE the line round (three hits, 40 ms apart)', () => {
    fired('line_round', 5);
    for (let k = 0; k < 3; k++) after(k * 0.04, () => hit(k === 2 ? 'impact' : 'freed', 'stone', k === 2 ? 'world' : 'bider', k));
  }, 'hot');

  group('the kept round (work order 4.6)');
  button('kept:denied', 'denied', () => emit('weapon/kept', { stage: 'denied', mark: '' }));
  button('kept:loading', 'loading (the band breaks)', () => emit('weapon/kept', { stage: 'loading', mark: 'mark_1' }));
  button('kept:chambered', 'chambered', () => emit('weapon/kept', { stage: 'chambered', mark: 'mark_1' }));
  button('kept:unloaded', 'unloaded', () => emit('weapon/kept', { stage: 'unloaded', mark: 'mark_1' }));
  button('kept:legal', 'aim becomes legal (listen_tick)', () => emit('audio/cue', { cue: 'listen_tick', x: 0, y: 0, z: 0, positional: false, gain: 0.5, pitch: 1 }));
  button('kept:fired', 'fired (alone)', () => emit('weapon/kept', { stage: 'fired', mark: 'mark_1' }));
  button('kept:sequence', 'THE SEVENTH: load, hush, fire, the hum stops, 4 s of silence, water, a clean hum', () => {
    emit('boss/phase', { phase: 'p3a', from: 'p2' });
    emit('weapon/kept', { stage: 'loading', mark: 'mark_1' });
    emit('boss/hush', { on: true });
    emit('boss/phase', { phase: 'hush', from: 'p3a' });
    after(0.95, () => emit('weapon/kept', { stage: 'chambered', mark: 'mark_1' }));
    after(1.6, () => emit('audio/cue', { cue: 'listen_tick', x: 0, y: 0, z: 0, positional: false, gain: 0.5, pitch: 1 }));
    after(2.2, () => {
      emit('weapon/kept', { stage: 'fired', mark: 'mark_1' });
      emit('boss/hush', { on: false });
      emit('boss/proven', ahead(20));
      emit('boss/phase', { phase: 'proven', from: 'hush' });
    });
    after(2.2 + 9, () => emit('audio/cue', { cue: 'water_below', x: 0, y: 0, z: 0, positional: false, gain: 1, pitch: 1 }));
    after(2.2 + 13, () => emit('boss/phase', { phase: 'p3b', from: 'proven' }));
  }, 'big');

  group('hit confirms and impacts (combat/hit)');
  for (const o of OUTCOMES) if (o !== 'impact' && o !== 'broke') button('hit:' + o, o, () => hit(o, 'cloth', 'bider'));
  button('hit:deflected_tamper', 'deflected (tamper plate)', () => hit('deflected', 'metal', 'tamper'));
  for (const k of ['jug', 'bell', 'stake', 'canister', 'knot', 'cord', 'dowser', 'breakable'] as EntityKind[]) button('hit:broke_' + k, 'broke: ' + k, () => hit('broke', 'ceramic', k));
  for (const s of SURFACES) button('hit:impact_' + s, 'impact: ' + s, () => hit('impact', s));

  group('the player');
  for (const s of SURFACES) button('step:' + s, 'step: ' + s, () => emit('player/footstep', { ...ctx.player.position, surface: s, sprint: false }));
  button('step:sprint', 'sprint step (stone)', () => emit('player/footstep', { ...ctx.player.position, surface: 'stone', sprint: true }));
  for (const s of ['sand', 'metal'] as SurfaceType[]) button('step:walk_run_' + s, 'four walk steps, four sprint steps: ' + s, () => {
    for (let k = 0; k < 4; k++) after(k * 0.5, () => emit('player/footstep', { ...ctx.player.position, surface: s, sprint: false }));
    for (let k = 0; k < 4; k++) after(2.2 + k * 0.33, () => emit('player/footstep', { ...ctx.player.position, surface: s, sprint: true }));
  });
  button('life:respawn', 'a haul, a station line and a howl; she dies at 1.2 s and respawns at 2.6 s', () => {
    emit('boss/haul', { on: true, seconds: 8 });
    emit('story/line', { key: 'stn_x', speaker: 'station', text: 'THANK YOU FOR YOUR PATIENCE. THE LINE IS HELD. PLEASE REMAIN WHERE YOU ARE.', seconds: 8 });
    emit('enemy/telegraph', { ...ahead(6), id: 'tamper#1', kind: 'tamper', attack: 'charge', seconds: 3 });
    after(1.2, () => emit('player/died', { kind: 'slam', source: 'tamper' }));
    after(2.6, () => emit('player/respawned', { checkpoint: 'cp_lip_start' }));
  });
  button('player:jumped', 'jump', () => emit('player/jumped', { ...ctx.player.position }));
  button('player:landed', 'land (6 m/s)', () => emit('player/landed', { ...ctx.player.position, speed: 6, surface: 'stone' }));
  for (const amount of [10, 22, 38]) button('player:damaged_' + amount, 'damaged ' + amount, () => emit('player/damaged', { amount, health: 50, kind: 'lunge', source: 'bider', fromX: 0, fromY: 0, fromZ: 0, graceUsed: false }));
  button('player:died', 'died', () => emit('player/died', { kind: 'lunge', source: 'bider' }));

  group('the bell voice, D Dorian from D3 (shootable/hit, knots, breakables)');
  const shoot = (kind: EntityKind, scaleDegree: number): void => emit('shootable/hit', { ...ahead(10), id: 'ia_x', kind, scaleDegree, ammo: 'lead_round' });
  for (let d = 1; d <= 7; d++) button('jug:' + d, 'jug ' + d, () => shoot('jug', d));
  button('jug:scale', 'the jug scale 1-7 (the seventh left hanging)', () => { for (let d = 1; d <= 7; d++) after((d - 1) * 0.45, () => shoot('jug', d)); }, 'hot');
  button('bell:latch', 'insulator latch', () => shoot('latch', 3));
  button('bell:yard', 'yard bell', () => shoot('bell', 1));
  for (const d of [1, 3, 5]) button('plate:' + d, 'range plate ' + d, () => shoot('range_plate', d));
  for (let n = 1; n <= 8; n++) button('port:' + n, 'port ' + n, () => shoot('ask_port', n));
  button('bell:cord', 'cord', () => shoot('cord', 0));
  button('bell:dowser', 'the Dowser', () => shoot('dowser', 0));
  button('knot:burst', 'knot burst', () => emit('knot/burst', { ...ahead(10), id: 'knot_a', onMechanism: true, regrows: true }));
  button('knot:regrown', 'knot regrown', () => emit('knot/regrown', { ...ahead(10), id: 'knot_a' }));
  for (const asset of ['prop_bottle', 'ia_jug', 'prop_cup_tin']) button('break:' + asset, 'breakable: ' + asset, () => emit('breakable/broken', { ...ahead(8), id: 'brk_1', asset }));

  group('enemies (positional: 10 m ahead, 3 m to the right)');
  const spot = (): { x: number; y: number; z: number } => ahead(10, 3);
  const state = (id: string, kind: EnemyKind, to: string): void => emit('enemy/state', { id, kind, from: '', to });
  const tell = (id: string, kind: EnemyKind, attack: string, seconds: number): void => emit('enemy/telegraph', { ...spot(), id, kind, attack, seconds });
  button('bider:spawn', 'bider spawned', () => emit('enemy/spawned', { ...spot(), id: 'bider#1', kind: 'bider', encounter: '', entrance: 'doorway' }));
  button('bider:run', 'bider runs (loop)', () => state('bider#1', 'bider', 'approach'));
  button('bider:bark', 'bider circling bark', () => state('bider#1', 'bider', 'circle_strafe'));
  button('bider:telegraph', 'bider wind-up (rattle)', () => tell('bider#1', 'bider', 'lunge', 0.5));
  button('bider:attack', 'bider lunge', () => emit('enemy/attack', { ...spot(), id: 'bider#1', kind: 'bider', attack: 'lunge' }));
  button('bider:stop', 'bider stops', () => state('bider#1', 'bider', 'recover'));
  button('bider:freed', 'bider freed (a breath)', () => emit('enemy/freed', { ...spot(), id: 'bider#1', encounter: '', cause: 'crown', counted: true }));
  button('bider:felled', 'bider felled (a fold)', () => emit('enemy/felled', { ...spot(), id: 'bider#1', encounter: '', counted: true }));
  button('transit:spawn', 'transit emerges (clack)', () => emit('enemy/spawned', { ...spot(), id: 'transit#1', kind: 'transit', encounter: '', entrance: 'emerge' }));
  button('transit:walk', 'transit walks (gait loop)', () => state('transit#1', 'transit', 'relocate'));
  button('transit:walk_behind', 'transit walks behind her', () => { const p = ahead(-10); emit('enemy/spawned', { ...p, id: 'transit#2', kind: 'transit', encounter: '', entrance: 'emerge' }); state('transit#2', 'transit', 'relocate'); });
  button('transit:plant', 'transits stop', () => { state('transit#1', 'transit', 'plant'); state('transit#2', 'transit', 'plant'); });
  button('transit:aim', 'transit aims (400 -> 1600 Hz, 0.9 s)', () => tell('transit#1', 'transit', 'aim', 0.9));
  button('transit:flinch', 'transit flinches (cuts the tone)', () => state('transit#1', 'transit', 'flinch'));
  button('transit:died', 'transit dies (the lens bell)', () => emit('enemy/died', { ...spot(), id: 'transit#1', kind: 'transit', encounter: '' }));
  button('stake:spawn', 'stake fired', () => emit('projectile/spawned', { ...spot(), id: 'stake#1', kind: 'stake', source: 'transit' }));
  button('stake:landed', 'stake sticks', () => emit('projectile/landed', { ...ahead(3, 1), id: 'stake#1', kind: 'stake', surface: 'wood', hitPlayer: false }));
  button('stake:burst', 'stake shot down', () => emit('projectile/burst', { ...ahead(6), id: 'stake#1', kind: 'stake', reason: 'shot' }));
  button('tamper:walk', 'tamper walks (two-beat stamp)', () => state('tamper#1', 'tamper', 'advance'));
  button('tamper:slam_tell', 'tamper slam wind-up (hiss, 1.0 s)', () => tell('tamper#1', 'tamper', 'slam', 1.0));
  button('tamper:slam', 'tamper slam', () => emit('enemy/attack', { ...spot(), id: 'tamper#1', kind: 'tamper', attack: 'slam' }));
  button('tamper:charge_tell', 'tamper charge wind-up (howl, 0.8 s)', () => tell('tamper#1', 'tamper', 'charge', 0.8));
  button('tamper:charge', 'tamper charges', () => state('tamper#1', 'tamper', 'charge'));
  button('tamper:stop', 'tamper stops', () => state('tamper#1', 'tamper', 'slam_recover'));
  button('tamper:pound', 'vig_tamper started (pounding every 2.6 s)', () => emit('vignette/state', { id: 'vig_tamper', stage: 'started' }));
  button('tamper:pound_end', 'vig_tamper ended', () => emit('vignette/state', { id: 'vig_tamper', stage: 'ended' }));
  button('tamper:died', 'tamper dies', () => emit('enemy/died', { ...spot(), id: 'tamper#1', kind: 'tamper', encounter: '' }));

  group('the Windlass (boss/*)');
  for (const ph of ['idle', 'parley', 'p1', 'p2', 'p3a', 'hush', 'proven', 'p3b', 'dead'] as BossPhase[]) button('boss:phase_' + ph, 'phase ' + ph, () => emit('boss/phase', { phase: ph, from: 'idle' }));
  button('boss:indexing', 'indexing (1.5 s)', () => emit('boss/indexing', { fromBay: 1, toBay: 2, seconds: 1.5 }));
  for (const kind of ['stake', 'canister', 'lance', 'fan', 'dry'] as const) button('boss:discharge_' + kind, 'discharge: ' + kind, () => emit('boss/discharge', { kind, mouth: 1, glowSeconds: kind === 'dry' ? 0 : 0.9, parryable: kind === 'stake' }));
  button('boss:pattern', 'phase 1 pattern: six discharges, 1.1 s apart', () => {
    emit('boss/phase', { phase: 'p1', from: 'idle' });
    for (let k = 0; k < 6; k++) after(k * 1.1, () => emit('boss/discharge', { kind: k % 3 === 2 ? 'canister' : 'stake', mouth: 1 + k, glowSeconds: 0.9, parryable: k % 3 !== 2 }));
  }, 'hot');
  button('boss:canister', 'canister launched', () => emit('projectile/spawned', { ...ahead(20), id: 'canister#1', kind: 'canister', source: 'windlass' }));
  button('boss:canister_burst', 'canister bursts', () => emit('projectile/burst', { ...ahead(8), id: 'canister#1', kind: 'canister', reason: 'fuse' }));
  button('boss:haul', 'haul (3.5 s)', () => emit('boss/haul', { on: true, seconds: 3.5 }));
  button('boss:mouth_open', 'mouth opens', () => emit('boss/mouth', { mouth: 1, state: 'open' }));
  button('boss:mouth_shut', 'mouth shuts', () => emit('boss/mouth', { mouth: 1, state: 'shut' }));
  for (let m = 1; m <= 6; m++) button('boss:dark_' + m, 'chamber ' + m + ' dark', () => emit('boss/mouth', { mouth: m, state: 'dark' }));
  button('boss:relit', 'chamber relit (gurgle)', () => emit('boss/mouth', { mouth: 1, state: 'relit' }));
  button('boss:guard_set', 'guard set', () => emit('boss/guard', { state: 'set' }));
  button('boss:guard_shattered', 'guard shattered', () => emit('boss/guard', { state: 'shattered' }));
  button('boss:hush_on', 'hush on (the swing clear)', () => emit('boss/hush', { on: true }));
  button('boss:hush_off', 'hush off', () => emit('boss/hush', { on: false }));
  button('boss:proven', 'proven (the hum stops)', () => emit('boss/proven', ahead(20)));
  button('boss:dry_six', 'phase 3b: three dry clicks, then six chambers ascending, then the run-down', () => {
    emit('boss/phase', { phase: 'p3b', from: 'proven' });
    for (let k = 0; k < 3; k++) after(k * 1.1, () => emit('boss/discharge', { kind: 'dry', mouth: 1, glowSeconds: 0, parryable: false }));
    for (let k = 0; k < 6; k++) after(3.6 + k * 0.7, () => emit('boss/mouth', { mouth: 6 - k, state: 'dark' }));
    after(3.6 + 6 * 0.7, () => { emit('boss/defeated', { cleanSix: true }); emit('boss/phase', { phase: 'dead', from: 'p3b' }); });
  }, 'hot');
  button('boss:defeated', 'defeated (run-down)', () => emit('boss/defeated', { cleanSix: false }));

  group('the station voice (story/line, speaker station): a chime, then one blip per word');
  for (const key of ['stn_yard_wake', 'stn_tally_wake_1', 'stn_tally_wake_2']) {
    button('station:' + key, key, () => { const l = ctx.data.line(key); emit('story/line', { key, speaker: l.speaker, text: l.text, seconds: l.seconds }); });
  }
  button('station:narrator', 'a narrator line (no sound)', () => emit('story/line', { key: 'nar_x', speaker: 'narrator', text: 'She kept the count.', seconds: 3 }));
  button('asking:listen', 'asking/listen lit = 1', () => emit('asking/listen', { lit: 1, of: 12 }));

  group('audio/cue: all 39');
  for (const cue of ext.cues() as AudioCue[]) button('cue:' + cue, cue, () => emit('audio/cue', { cue, ...ahead(6), positional: false, gain: 1, pitch: 1 }));
  button('cue:positional', 'gate_bang, positional, 25 m to the left', () => emit('audio/cue', { cue: 'gate_bang', ...ahead(4, -25), positional: true, gain: 1, pitch: 1 }));
  button('cue:pitched', 'door_creak, gain 0.5, pitch 1.5', () => emit('audio/cue', { cue: 'door_creak', ...ahead(4), positional: false, gain: 0.5, pitch: 1.5 }));

  group('pickups, checkpoint, ending');
  for (const kind of ['pk_rounds_6', 'pk_rounds_12', 'pk_canteen'] as const) button('pickup:' + kind, kind, () => emit('pickup/collected', { ...ctx.player.position, id: 'pk#1', kind, amount: 6 }));
  button('world:checkpoint', 'checkpoint/saved', () => emit('checkpoint/saved', { id: 'cp_lip_gate', movement: 1, section: 1 }));
  button('world:fire', 'ending/fire', () => emit('ending/fire', ahead(60)));

  group('zone: reverb and ambience (each button warps to a checkpoint of that zone)');
  const zoneButtons: HTMLButtonElement[] = [];
  for (const zone of Object.keys(ZONE_CHECKPOINT) as ZoneId[]) {
    zoneButtons.push(button('zone:' + zone, zone, () => { void hook.checkpoint(ZONE_CHECKPOINT[zone]); }));
  }
  group('the station hum (under every underground second)');
  const hum = (mode: number): void => { const g = ext.graph(); ext.engine().ambience.setHum(mode, g ? g.now() : 0, 0.5); };
  button('hum:flat', 'flat (D2 and A2, 20 cents flat, beating)', () => hum(0));
  button('hum:off', 'off', () => hum(1));
  button('hum:tuned', 'in tune (after the proof)', () => hum(2));

  group('music: state and intensity');
  button('music:combat', 'encounter/started', () => emit('encounter/started', { id: 'enc_street' }));
  button('music:cleared', 'encounter/cleared (cuts to nothing)', () => emit('encounter/cleared', { id: 'enc_street', seconds: 30 }));
  button('music:threat_1', 'threat +1 (a bider)', () => { const p = ahead(30, 6); ctx.enemies.debug.spawnAt('bider', p.x, p.y - 1.2, p.z, 0); });
  button('music:threat_2', 'threat +2 (a transit)', () => { const p = ahead(30, -6); ctx.enemies.debug.spawnAt('transit', p.x, p.y - 1.2, p.z, 0); });
  button('music:threat_0', 'kill all (threat 0)', () => { ctx.enemies.debug.killAll(false); });
  button('music:boss', 'boss (phase p1)', () => emit('boss/phase', { phase: 'p1', from: 'parley' }));
  button('music:boss_off', 'boss idle', () => emit('boss/phase', { phase: 'idle', from: 'p1' }));
  button('music:resolve', 'the ending: the wire resolves to D', () => emit('audio/cue', { cue: 'wire_resolve', x: 0, y: 0, z: 0, positional: false, gain: 1, pitch: 1 }), 'big');
  button('music:new_run', 'game/new_run (reset)', () => emit('game/new_run', { difficulty: 'normal' }));

  // ---- the side panel: status, scope, peak meter, captions, recent()
  const status = document.getElementById('status') as HTMLElement;
  const captions = document.getElementById('captions') as HTMLElement;
  const recent = document.getElementById('recent') as HTMLElement;
  const log = (cls: string, text: string): void => {
    const line = document.createElement('div'); line.className = cls; line.textContent = text;
    captions.appendChild(line);
    while (captions.childElementCount > 60) captions.removeChild(captions.firstChild as Node);
    captions.scrollTop = captions.scrollHeight;
  };
  ctx.events.on('story/say', (e) => { if (e.key.startsWith('cap_')) log('cap', `${ctx.data.line(e.key).text}  ${e.key}`); });
  ctx.events.on('music/state', (e) => log('mus', `music/state ${e.state} ${e.intensity}`));
  const scope = document.getElementById('scope') as HTMLCanvasElement, pen = scope.getContext('2d') as CanvasRenderingContext2D;
  const fill = document.querySelector('#meter i') as HTMLElement, hold = document.querySelector('#meter b') as HTMLElement;
  let wave: Float32Array<ArrayBuffer> | null = null, held = 0, shown = '';
  const draw = (): void => {
    const s = ext.status(), g = ext.graph();
    const text = `context ${s.context} @ ${s.sampleRate} Hz   ${s.unlocked ? 'unlocked' : 'LOCKED: click anywhere'}\nvoices ${s.voices} (peak ${s.voicePeak}, dropped ${s.dropped})   starts ${s.starts}   nodes ${s.nodes}\nzone ${ctx.world.zone}   hum ${['flat', 'off', 'tuned'][ext.engine().ambience.hum]}   proof ${ext.engine().proof}`;
    if (text !== shown) { shown = text; status.textContent = text; }
    for (const b of zoneButtons) b.classList.toggle('hot', b.dataset['b'] === 'zone:' + ctx.world.zone);
    const lines = ctx.audio.recent(10).map((r) => `${String(r.tick).padStart(6)}  ${r.name}`).join('\n');
    if (recent.textContent !== lines) recent.textContent = lines;
    if (g && s.active) {
      const an = g.analyser();
      wave ??= new Float32Array(an.fftSize);
      an.getFloatTimeDomainData(wave);
      let peak = 0;
      pen.fillStyle = '#0b0d12'; pen.fillRect(0, 0, scope.width, scope.height);
      pen.strokeStyle = '#7cf2e2'; pen.beginPath();
      for (let i = 0; i < scope.width; i++) {
        const v = wave[Math.floor(i * wave.length / scope.width)] as number;
        if (Math.abs(v) > peak) peak = Math.abs(v);
        const y = scope.height / 2 - v * scope.height / 2;
        if (i === 0) pen.moveTo(i, y); else pen.lineTo(i, y);
      }
      pen.stroke();
      for (let i = 0; i < wave.length; i++) if (Math.abs(wave[i] as number) > peak) peak = Math.abs(wave[i] as number);
      held = Math.max(peak, held * 0.97);
      fill.style.width = Math.min(100, peak * 100) + '%';
      hold.style.left = Math.min(99, held * 100) + '%';
    }
  };
  sb.onFrame(draw);
  showCylinder();
  // a real click anywhere unlocks the context (the first user gesture)
  document.addEventListener('pointerdown', () => ctx.audio.unlock(), true);
  document.addEventListener('keydown', () => ctx.audio.unlock(), true);
}

void createSandbox({
  piece: 'audio',
  systems: { audio: (ctx) => wrap(createAudioSystem(ctx)) },
  scene: {
    // the real level in play at the first checkpoint: the sim runs, so music, ambience and loops tick
    board: async (sb) => { await sb.start('cp_lip_start'); },
  },
}).then((sb) => { build(sb); });
