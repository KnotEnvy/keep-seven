// Event-level behaviour with no context (work order section 6): coverage, captions, music, voices, determinism.
import { describe, expect, it } from 'vitest';
import type { AudioCue, EnemyKind, GameEvents, HitOutcome, SurfaceType } from '../../src/core/contracts.ts';
import { AMB_EVENTS } from '../../src/audio/ambience.ts';
import { CAPTIONS, CAPTION_KEYS } from '../../src/audio/captions.ts';
import { cueSounds } from '../../src/audio/cues.ts';
import { POUND_TICKS, RESERVED_VOICES, SHOT_JITTER, buildSounds } from '../../src/audio/engine.ts';
import { MAX_VOICES } from '../../src/audio/graph.ts';
import { WIRE_MAX, WIRE_MIN, intensityOf } from '../../src/audio/music.ts';
import { blipHz, wordLength, wordLengths } from '../../src/audio/station.ts';
import { FLAT, centsOff, degree } from '../../src/audio/tuning.ts';
import { ROOT, nodeFs } from './nodeApi.ts';
import { POS, cue, fired, hit, rig } from './rig.ts';
import { makeParams } from '../../src/audio/sound.ts';

const SURFACES: SurfaceType[] = ['sand', 'wood', 'adobe', 'metal', 'ceramic', 'stone', 'cloth', 'none'];
const OUTCOMES: HitOutcome[] = ['impact', 'hit', 'weak', 'kill', 'freed', 'deflected', 'broke', 'parried', 'passed'];
const tell = (kind: EnemyKind, attack: string, id = kind + '#1'): GameEvents['enemy/telegraph'] => ({ ...POS, id, kind, attack, seconds: 0.9 });

describe('the sound table', () => {
  it('has a sound for every AudioCue of the contract, and no other cue', async () => {
    const fs = await nodeFs();
    const src = fs.readFileSync(ROOT + '/src/core/contracts.ts', 'utf8');
    const block = /export type AudioCue =([^;]+);/.exec(src);
    expect(block).not.toBeNull();
    const cues = [...(block as RegExpExecArray)[1]!.matchAll(/'([a-z_]+)'/g)].map((m) => m[1] as string);
    expect(cues).toHaveLength(39);
    expect(Object.keys(cueSounds()).sort()).toEqual(cues.slice().sort());
    const sounds = buildSounds();
    for (const c of cues) expect(sounds[c], c).toBeDefined();
  });
  it('names every sound the ambience and the captions refer to', () => {
    const sounds = buildSounds();
    for (const e of AMB_EVENTS) expect(sounds[e.sound], e.sound).toBeDefined();
    for (const key of CAPTION_KEYS) for (const s of CAPTIONS[key]!.sounds) expect(sounds[s], key + ' -> ' + s).toBeDefined();
  });
});

describe('captions', () => {
  it('every cap_* key of design/story.json is in the table, and the table has no other', async () => {
    const fs = await nodeFs();
    const story = JSON.parse(fs.readFileSync(ROOT + '/design/story.json', 'utf8')) as { lines: Record<string, unknown> };
    const keys = Object.keys(story.lines).filter((k) => k.startsWith('cap_')).sort();
    expect(keys).toHaveLength(24);                             // (release pass p0: + cap_loft_bell, which the world raises)
    expect(CAPTION_KEYS.slice().sort()).toEqual(keys);
  });
  it('each key is raised by its event, on the tick its sound starts, and never without it', () => {
    const r = rig();
    const expectCap = (key: string, run: () => void): void => {
      const says = r.says.length, starts = r.engine.starts;
      r.world.tick += 10;
      run();
      const got = r.says.slice(says).map((s) => s.key);
      expect(got, key).toContain(key);
      expect(r.engine.starts, key + ' has a sound').toBeGreaterThan(starts);
      const started = r.engine.recent(8).filter((s) => s.tick === r.world.tick).map((s) => s.name);
      expect(started.some((n) => CAPTIONS[key]!.sounds.includes(n)), `${key}: one of ${CAPTIONS[key]!.sounds.join(', ')} among ${started.join(', ')}`).toBe(true);
    };
    expectCap('cap_bider_rattle', () => r.emit('enemy/telegraph', tell('bider', 'lunge')));
    expectCap('cap_bider_rattle', () => r.emit('enemy/state', { id: 'bider#1', kind: 'bider', from: 'circle', to: 'circle_strafe' }));
    expectCap('cap_bider_sits', () => r.emit('enemy/freed', { ...POS, id: 'bider#1', encounter: '', cause: 'crown', counted: true }));
    expectCap('cap_transit_clack', () => r.emit('enemy/spawned', { ...POS, id: 'transit#1', kind: 'transit', encounter: '', entrance: 'emerge' }));
    expectCap('cap_transit_tone', () => r.emit('enemy/telegraph', tell('transit', 'aim')));
    expectCap('cap_stake', () => r.emit('projectile/spawned', { ...POS, id: 'stake#1', kind: 'stake', source: 'transit' }));
    expectCap('cap_tamper_hiss', () => r.emit('enemy/telegraph', tell('tamper', 'slam')));
    expectCap('cap_tamper_howl', () => r.emit('enemy/telegraph', tell('tamper', 'charge')));
    expectCap('cap_tamper_pound', () => r.emit('vignette/state', { id: 'vig_tamper', stage: 'started' }));
    expectCap('cap_chairs', () => r.emit('audio/cue', cue('chairs_scrape')));
    expectCap('cap_station_chime', () => r.emit('story/line', { key: 'stn_x', speaker: 'station', text: 'LIFT STATION 4.', seconds: 3 }));
    expectCap('cap_listening', () => r.emit('asking/listen', { lit: 1, of: 12 }));
    expectCap('cap_ratchet', () => r.emit('boss/indexing', { fromBay: 1, toBay: 2, seconds: 1.5 }));
    expectCap('cap_ratchet', () => r.emit('boss/hush', { on: true }));
    expectCap('cap_ratchet', () => r.emit('boss/defeated', { cleanSix: false }));
    expectCap('cap_canister', () => r.emit('projectile/spawned', { ...POS, id: 'c#1', kind: 'canister', source: 'windlass' }));
    expectCap('cap_lance', () => r.emit('boss/discharge', { kind: 'lance', mouth: 1, glowSeconds: 0.9, parryable: false }));
    expectCap('cap_refill', () => r.emit('boss/mouth', { mouth: 2, state: 'relit' }));
    expectCap('cap_dry_click', () => r.emit('boss/discharge', { kind: 'dry', mouth: 1, glowSeconds: 0, parryable: false }));
    expectCap('cap_hum_stops', () => r.emit('boss/proven', POS));
    expectCap('cap_water_below', () => r.emit('audio/cue', cue('water_below')));
    expectCap('cap_gate', () => r.emit('audio/cue', cue('gate_bang')));
    expectCap('cap_shutter', () => r.emit('audio/cue', cue('shutter_bang')));
    expectCap('cap_locker_chime', () => r.emit('audio/cue', cue('locker_chime')));
    expectCap('cap_fire_kindles', () => r.emit('ending/fire', POS));
    expectCap('cap_wire_resolves', () => r.emit('audio/cue', cue('wire_resolve')));
    expect(new Set(r.says.map((s) => s.key)).size).toBe(23);    // (every key but cap_loft_bell: src/audio/captions.ts)
    // nothing but captions is ever said by audio, and every one of them had a sound started on its tick
    for (const s of r.says) expect(s.key.startsWith('cap_')).toBe(true);
  });
  it('cap_station_chime: before the first station line in each zone only; a narrator line makes no sound', () => {
    const r = rig();
    const line = (speaker: 'station' | 'narrator'): void => r.emit('story/line', { key: 'k', speaker, text: 'DAYLIGHT. HEADWORKS WAKING.', seconds: 3 });
    r.step(1);
    const quiet = r.engine.starts;
    line('narrator');
    expect(r.engine.starts).toBe(quiet);
    line('station'); r.step(200); line('station');
    expect(r.says.filter((s) => s.key === 'cap_station_chime')).toHaveLength(1);
    expect(r.names().filter((n) => n === 'station_line')).toHaveLength(2);      // the chime itself plays before every line
    r.world.zone = 'the_gallery'; r.step(1); line('station');
    expect(r.says.filter((s) => s.key === 'cap_station_chime')).toHaveLength(2);
    r.emit('game/new_run', { difficulty: 'normal' }); line('station');
    expect(r.says.filter((s) => s.key === 'cap_station_chime')).toHaveLength(3);
  });
  it('cap_dry_click: the first three dry clicks of phase 3b', () => {
    const r = rig();
    r.emit('boss/phase', { phase: 'p3b', from: 'proven' });
    for (let k = 0; k < 6; k++) { r.step(66); r.emit('boss/discharge', { kind: 'dry', mouth: 1, glowSeconds: 0, parryable: false }); }
    expect(r.names().filter((n) => n === 'dry_click_big')).toHaveLength(6);
    expect(r.says.filter((s) => s.key === 'cap_dry_click')).toHaveLength(3);
  });
  it('a walking Transit is captioned only while it is outside the view cone', () => {
    const r = rig();
    r.engine.setListener(0, 1.65, 0, 0, 0, -1);
    r.emit('enemy/spawned', { x: 0, y: 0, z: -15, id: 'transit#1', kind: 'transit', encounter: '', entrance: 'emerge' });
    r.emit('enemy/state', { id: 'transit#1', kind: 'transit', from: 'emerge', to: 'relocate' });
    r.step(200);
    expect(r.names().filter((n) => n === 'transit_clack').length).toBeGreaterThan(3);
    expect(r.says.filter((s) => s.key === 'cap_transit_clack')).toHaveLength(1);            // the spawn only: it is in view
    r.emit('enemy/spawned', { x: 0, y: 0, z: 15, id: 'transit#2', kind: 'transit', encounter: '', entrance: 'emerge' });
    r.emit('enemy/state', { id: 'transit#2', kind: 'transit', from: 'emerge', to: 'relocate' });
    r.step(200);
    expect(r.says.filter((s) => s.key === 'cap_transit_clack').length).toBeGreaterThan(3);
  });
});

describe('no bullet produces nothing', () => {
  it('every weapon/fired starts a voice on its tick', () => {
    const r = rig();
    for (const ammo of ['lead_round', 'line_round', 'kept_round'] as const) {
      for (let left = 5; left >= 0; left--) {
        r.step(40);
        const before = r.engine.starts;
        r.emit('weapon/fired', fired(ammo, left));
        expect(r.engine.starts, `${ammo} ${left}`).toBeGreaterThan(before);
        expect(r.engine.recent(1)[0]!.tick).toBe(r.world.tick);
      }
    }
    expect(r.names()).toContain('gun_report');
    expect(r.names()).toContain('line_tone');
    expect(r.names()).toContain('kept_tone');
    expect(r.engine.dropped).toBe(0);
  });
  it('every combat/hit outcome and every surface starts a voice', () => {
    const r = rig();
    const kinds = ['world', 'bider', 'transit', 'tamper', 'windlass', 'knot', 'jug', 'bell', 'latch', 'cord', 'rope', 'range_plate', 'ask_port', 'breakable', 'door', 'stake', 'canister', 'dowser', 'bore', 'interactable'] as const;
    for (const outcome of OUTCOMES) for (const surface of SURFACES) for (const kind of kinds) {
      r.step(2);
      const before = r.engine.starts;
      r.emit('combat/hit', hit(outcome, surface, kind));
      expect(r.engine.starts, `${outcome} ${surface} ${kind}`).toBeGreaterThan(before);
    }
    for (const s of SURFACES) expect(r.names()).toContain('impact_' + s);
    for (const n of ['hit_tick', 'hit_weak', 'hit_kill', 'hit_freed', 'hit_deflect', 'tamper_clank', 'hit_parry', 'hit_pass', 'break_clay', 'break_bell', 'break_stake', 'break_knot', 'twang', 'dust_hit']) expect(r.names()).toContain(n);
  });
  it('every other event of work order 4.2-4.4 starts a voice', () => {
    const r = rig();
    const starts = (label: string, run: () => void, name?: string): void => {
      r.step(5);
      const before = r.names().length;
      run();
      const got = r.names(before);
      expect(got.length, label).toBeGreaterThan(0);
      if (name) expect(got, label).toContain(name);
    };
    starts('dry fire', () => r.emit('weapon/dry_fire', { reason: 'empty' }), 'dry_fire');
    starts('dry fire, kept', () => r.emit('weapon/dry_fire', { reason: 'kept_not_in_bore' }), 'dry_fire');
    for (const stage of ['open', 'round', 'close', 'fast_close'] as const) starts('reload ' + stage, () => r.emit('weapon/reload', { stage, chambered: 3, reserve: 10 }));
    for (const stage of ['loaded', 'unloaded'] as const) starts('line ' + stage, () => r.emit('weapon/line', { stage, held: 1 }));
    for (const stage of ['denied', 'loading', 'chambered', 'unloaded', 'fired'] as const) starts('kept ' + stage, () => r.emit('weapon/kept', { stage, mark: '' }));
    for (const surface of SURFACES) starts('step ' + surface, () => r.emit('player/footstep', { ...POS, surface, sprint: false }), 'step_' + surface);
    starts('jump', () => r.emit('player/jumped', POS), 'jump');
    starts('land', () => r.emit('player/landed', { ...POS, speed: 6, surface: 'stone' }), 'land');
    starts('damaged', () => r.emit('player/damaged', { amount: 18, health: 60, kind: 'lunge', source: 'bider', fromX: 0, fromY: 0, fromZ: 0, graceUsed: false }), 'hurt');
    starts('died', () => r.emit('player/died', { kind: 'lunge', source: 'bider' }), 'died');
    for (const kind of ['jug', 'latch', 'bell', 'range_plate', 'ask_port', 'cord', 'dowser'] as const) starts('shootable ' + kind, () => r.emit('shootable/hit', { ...POS, id: 'ia', kind, scaleDegree: 3, ammo: 'lead_round' }));
    for (const asset of ['prop_bottle', 'ia_jug', 'prop_cup_tin', 'prop_lantern']) starts('breakable ' + asset, () => r.emit('breakable/broken', { ...POS, id: 'b', asset }));
    starts('knot burst', () => r.emit('knot/burst', { ...POS, id: 'k', onMechanism: false, regrows: true }), 'knot_burst');
    starts('knot regrown', () => r.emit('knot/regrown', { ...POS, id: 'k' }), 'knot_regrow');
    starts('bider telegraph', () => r.emit('enemy/telegraph', tell('bider', 'lunge')), 'bider_rattle');
    starts('bider bark', () => r.emit('enemy/state', { id: 'bider#1', kind: 'bider', from: 'circle', to: 'circle_strafe' }), 'bider_bark');
    starts('bider lunge', () => r.emit('enemy/attack', { ...POS, id: 'bider#1', kind: 'bider', attack: 'lunge' }), 'bider_lunge');
    starts('bider freed', () => r.emit('enemy/freed', { ...POS, id: 'bider#1', encounter: '', cause: 'line', counted: true }), 'bider_breath');
    starts('bider felled', () => r.emit('enemy/felled', { ...POS, id: 'bider#2', encounter: '', counted: true }), 'bider_fold');
    starts('transit spawned', () => r.emit('enemy/spawned', { ...POS, id: 'transit#1', kind: 'transit', encounter: '', entrance: 'emerge' }), 'transit_clack');
    starts('transit aim', () => r.emit('enemy/telegraph', tell('transit', 'aim')), 'transit_tone');
    starts('stake', () => r.emit('projectile/spawned', { ...POS, id: 's', kind: 'stake', source: 'transit' }), 'stake_whirr');
    starts('stake lands', () => r.emit('projectile/landed', { ...POS, id: 's', kind: 'stake', surface: 'wood', hitPlayer: false }), 'stake_stick');
    starts('stake bursts', () => r.emit('projectile/burst', { ...POS, id: 's', kind: 'stake', reason: 'shot' }), 'break_stake');
    starts('transit died', () => r.emit('enemy/died', { ...POS, id: 'transit#1', kind: 'transit', encounter: '' }), 'lens_bell');
    starts('tamper slam tell', () => r.emit('enemy/telegraph', tell('tamper', 'slam')), 'tamper_hiss');
    starts('tamper charge tell', () => r.emit('enemy/telegraph', tell('tamper', 'charge')), 'tamper_howl');
    starts('tamper slam', () => r.emit('enemy/attack', { ...POS, id: 'tamper#1', kind: 'tamper', attack: 'slam' }), 'tamper_slam');
    starts('tamper pound', () => r.emit('vignette/state', { id: 'vig_tamper', stage: 'started' }), 'tamper_pound');
    starts('tamper died', () => r.emit('enemy/died', { ...POS, id: 'tamper#1', kind: 'tamper', encounter: '' }), 'tamper_die');
    starts('indexing', () => r.emit('boss/indexing', { fromBay: 1, toBay: 3, seconds: 3 }), 'ratchet');
    for (const kind of ['stake', 'canister', 'lance', 'fan'] as const) starts('discharge ' + kind, () => r.emit('boss/discharge', { kind, mouth: 1, glowSeconds: 0.9, parryable: true }), 'glow_tone');
    starts('discharge dry', () => r.emit('boss/discharge', { kind: 'dry', mouth: 1, glowSeconds: 0, parryable: false }), 'dry_click_big');
    starts('canister', () => r.emit('projectile/spawned', { ...POS, id: 'c', kind: 'canister', source: 'windlass' }), 'canister_thump');
    starts('canister burst', () => r.emit('projectile/burst', { ...POS, id: 'c', kind: 'canister', reason: 'fuse' }), 'canister_fizz');
    starts('haul', () => r.emit('boss/haul', { on: true, seconds: 3.5 }), 'haul_whine');
    for (const state of ['open', 'shut', 'dark', 'relit'] as const) starts('mouth ' + state, () => r.emit('boss/mouth', { mouth: 2, state }));
    starts('guard set', () => r.emit('boss/guard', { state: 'set' }), 'guard_slide');
    starts('guard shattered', () => r.emit('boss/guard', { state: 'shattered' }), 'guard_shatter');
    starts('hush', () => r.emit('boss/hush', { on: true }), 'ratchet');
    starts('defeated', () => r.emit('boss/defeated', { cleanSix: true }), 'run_down');
    starts('station line', () => r.emit('story/line', { key: 'stn', speaker: 'station', text: 'THANK YOU FOR YOUR PATIENCE.', seconds: 4 }), 'station_line');
    for (const kind of ['pk_rounds_6', 'pk_rounds_12', 'pk_canteen'] as const) starts('pickup ' + kind, () => r.emit('pickup/collected', { ...POS, id: 'p', kind, amount: 6 }));
    starts('checkpoint/saved', () => r.emit('checkpoint/saved', { id: 'cp_lip_gate', movement: 1, section: 1 }), 'checkpoint');
    for (const c of Object.keys(cueSounds()) as AudioCue[]) { r.step(40); starts('cue ' + c, () => r.emit('audio/cue', cue(c)), c); }
    expect(r.engine.voicePeak).toBeLessThanOrEqual(MAX_VOICES);
  });
  it('the tamper pounds every 2.6 s until the encounter starts or it dies', () => {
    const r = rig();
    r.emit('vignette/state', { id: 'vig_tamper', stage: 'started' });
    r.step(POUND_TICKS * 3 + 5);
    const ticks = r.engine.recent(64).filter((s) => s.name === 'tamper_pound').map((s) => s.tick);
    expect(ticks).toHaveLength(4);
    for (let i = 1; i < ticks.length; i++) expect(ticks[i]! - ticks[i - 1]!).toBe(POUND_TICKS);
    r.emit('encounter/started', { id: 'enc_matador' });
    r.step(POUND_TICKS * 2);
    expect(r.engine.recent(64).filter((s) => s.name === 'tamper_pound')).toHaveLength(4);
  });
  it('a cue that doubles its event is one sound; a flinch cuts the aim tone', () => {
    const r = rig();
    r.emit('boss/indexing', { fromBay: 1, toBay: 2, seconds: 1.5 });
    r.emit('audio/cue', cue('ratchet'));
    expect(r.names().filter((n) => n === 'ratchet')).toHaveLength(1);
    r.step(10);
    r.emit('audio/cue', cue('checkpoint')); r.emit('checkpoint/saved', { id: 'cp_lip_gate', movement: 1, section: 1 });
    expect(r.names().filter((n) => n === 'checkpoint')).toHaveLength(1);
    for (let m = 1; m <= 6; m++) r.emit('boss/mouth', { mouth: m, state: 'open' });
    expect(r.names().filter((n) => n === 'mouth_iris')).toHaveLength(1);
    r.step(60);
    const before = r.engine.voices;
    r.emit('enemy/telegraph', tell('transit', 'aim', 'transit#9'));
    expect(r.engine.voices).toBe(before + 1);
    r.emit('enemy/state', { id: 'transit#9', kind: 'transit', from: 'aim', to: 'flinch' });
    expect(r.engine.voices).toBe(before);
  });
  it('chambers sound degrees 1-6 by mouth number, and in the dry phase ascending in the order hit', () => {
    const r = rig();
    const degrees: number[] = [];
    const play = r.engine.play.bind(r.engine);
    r.engine.play = (name, p) => { if (name === 'chamber') degrees.push(p.a); return play(name, p); };
    for (const m of [3, 1, 6]) r.emit('boss/mouth', { mouth: m, state: 'dark' });
    expect(degrees).toEqual([3, 1, 6]);
    r.emit('boss/phase', { phase: 'p3b', from: 'proven' });
    degrees.length = 0;
    for (const m of [4, 2, 6, 1, 5, 3]) r.emit('boss/mouth', { mouth: m, state: 'dark' });
    expect(degrees).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('the gun', () => {
  it('pitch jitter is within 4 % and reproducible for a seed', () => {
    const run = (seed: number): number[] => { const r = rig(seed); const out: number[] = []; for (let k = 0; k < 200; k++) { r.step(29); r.emit('weapon/fired', fired('lead_round', 5 - (k % 6))); out.push(r.engine.shotPitch); } return out; };
    const a = run(1), b = run(1), c = run(2);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    for (const v of a) { expect(v).toBeGreaterThanOrEqual(1 - SHOT_JITTER); expect(v).toBeLessThanOrEqual(1 + SHOT_JITTER); }
    expect(Math.max(...a) - Math.min(...a)).toBeGreaterThan(0.06);       // it really varies
  });
  it('the kept round is one report and one tone however the player announces it', () => {
    const r = rig();
    r.emit('weapon/kept', { stage: 'fired', mark: 'm' });
    r.emit('weapon/fired', fired('kept_round', 0));
    expect(r.names()).toEqual(['gun_report_kept', 'kept_tone']);
  });
});

describe('voices', () => {
  it('never more than 32; the lowest priority is stolen; the gun is never dropped', () => {
    const r = rig();
    for (let k = 0; k < 100; k++) r.emit('player/footstep', { ...POS, surface: 'stone', sprint: false });
    expect(r.engine.voices).toBe(MAX_VOICES - RESERVED_VOICES);   // the reserve is not theirs
    expect(r.engine.dropped).toBe(0);                         // footsteps steal footsteps
    for (let k = 0; k < 40; k++) r.emit('weapon/fired', fired());
    expect(r.engine.voices).toBe(MAX_VOICES);
    expect(r.names().filter((n) => n === 'gun_report')).toHaveLength(40);
    const drops = r.engine.dropped;
    r.emit('player/footstep', { ...POS, surface: 'stone', sprint: false });     // 32 gun voices: a footstep cannot take one
    expect(r.engine.dropped).toBe(drops + 1);
    expect(r.engine.voicePeak).toBe(MAX_VOICES);
    r.step(120);
    expect(r.engine.voices).toBe(0);
  });
  it('a pile of telegraphs leaves the reserve free: the shot, the kill, the weak point and the station line all sound', () => {
    // the critic's case: 40 telegraphs on one tick, then a shot, a kill, a weak-point hit and a station line
    const r = rig(1, 'lift_hall');
    for (let k = 0; k < 40; k++) r.emit('enemy/telegraph', { x: -5 + k * 0.2, y: 0, z: -10, id: 'e#' + (k % 14), kind: k % 2 ? 'tamper' : 'transit', attack: k % 2 ? 'slam' : 'aim', seconds: 1 });
    expect(r.engine.voices).toBe(MAX_VOICES - RESERVED_VOICES);          // telegraphs steal telegraphs at the reserve
    expect(r.engine.dropped).toBe(0);
    const mark = r.names().length;
    r.emit('weapon/fired', fired('lead_round', 3));
    r.emit('combat/hit', hit('kill', 'none', 'bider'));
    r.emit('combat/hit', hit('weak', 'none', 'transit'));
    r.emit('story/line', { key: 'stn_x', speaker: 'station', text: 'ONE TWO THREE', seconds: 2 } as GameEvents['story/line']);
    expect(r.names(mark)).toEqual(['gun_report', 'hit_kill', 'hit_weak', 'station_line']);
    expect(r.engine.voices).toBe(MAX_VOICES);
    expect(r.engine.dropped).toBe(0);
    // a confirm never steals a telegraph: with the reserve full of confirms, the next confirm steals a confirm
    for (let k = 0; k < 6; k++) r.emit('combat/hit', hit('hit', 'none', 'bider'));
    expect(r.names().filter((n) => n === 'transit_tone' || n === 'tamper_hiss')).toHaveLength(40);
    expect(r.engine.voices).toBe(MAX_VOICES);
    expect(r.names(mark).filter((n) => n === 'hit_tick')).toHaveLength(6);
  });
});

describe('audio/cue gain and pitch', () => {
  it('gain 0 or below is silence (no start, no caption); a missing or NaN gain is the sound\'s own level', () => {
    const r = rig(1, 'plenty_street');
    r.emit('audio/cue', cue('gate_bang', 0));
    r.emit('audio/cue', cue('gate_bang', -1));
    expect(r.names()).toEqual([]);
    expect(r.says).toEqual([]);
    r.step(10);
    r.emit('audio/cue', cue('gate_bang', Number.NaN));
    r.step(10);
    r.emit('audio/cue', { ...cue('gate_bang'), gain: undefined as unknown as number });
    expect(r.names()).toEqual(['gate_bang', 'gate_bang']);
    expect(r.says.map((s) => s.key)).toEqual(['cap_gate', 'cap_gate']);
    // a silent cue still does what it does to the state: water_below makes the hum clean, with no sound and no caption
    const w = rig(1, 'the_bore');
    w.emit('boss/proven', { x: 0, y: 0, z: 0 });
    w.step(300);
    const says = w.says.length;
    w.emit('audio/cue', cue('water_below', 0));
    expect(w.engine.proof).toBe(2);
    expect(w.says.length).toBe(says);
    expect(w.names()).not.toContain('water_below');
  });
});

describe('music', () => {
  it('combat on the tick of encounter/started, calm on the tick of encounter/cleared, intensity by threat', () => {
    const r = rig();
    r.step(60);
    expect(r.music.at(-1)).toMatchObject({ state: 'calm', intensity: 0 });
    r.world.threat = 2;
    r.emit('encounter/started', { id: 'enc_street' });
    expect(r.music.at(-1)).toEqual({ state: 'combat', intensity: 1, tick: r.world.tick });
    r.world.threat = 4; r.step(1);
    expect(r.music.at(-1)).toMatchObject({ state: 'combat', intensity: 2 });
    r.world.threat = 7; r.step(1);
    expect(r.music.at(-1)).toMatchObject({ state: 'combat', intensity: 3 });
    r.step(300);
    expect(r.names().filter((n) => n === 'drum').length).toBeGreaterThan(10);
    const drums = r.names().filter((n) => n === 'drum').length;
    r.emit('encounter/cleared', { id: 'enc_street', seconds: 20 });
    expect(r.music.at(-1)).toEqual({ state: 'calm', intensity: 0, tick: r.world.tick });
    r.step(300);
    expect(r.names().filter((n) => n === 'drum')).toHaveLength(drums);          // it cuts to nothing
    expect(intensityOf(1)).toBe(1); expect(intensityOf(2)).toBe(1); expect(intensityOf(3)).toBe(2); expect(intensityOf(5)).toBe(2); expect(intensityOf(6)).toBe(3);
  });
  it('follows game/state: silent while loading, paused and dead; calm on the title; ending at the end', () => {
    const r = rig();
    const to = (state: GameEvents['game/state']['to'], from: GameEvents['game/state']['from'] = 'playing'): void => r.emit('game/state', { from, to: state, reason: '' });
    to('title', 'boot'); expect(r.music.at(-1)!.state).toBe('calm');
    to('loading', 'title'); expect(r.music.at(-1)!.state).toBe('silent');
    to('playing', 'loading'); expect(r.music.at(-1)!.state).toBe('calm');
    to('paused'); expect(r.music.at(-1)!.state).toBe('silent');
    to('playing', 'paused'); expect(r.music.at(-1)!.state).toBe('calm');
    to('dead'); expect(r.music.at(-1)!.state).toBe('silent');
    to('playing', 'dead');
    to('ending'); expect(r.music.at(-1)!.state).toBe('ending');
  });
  it('the boss: the drum lands on each discharge and once between; silent from the hush to the kill', () => {
    const r = rig(1, 'the_bore');
    r.emit('boss/phase', { phase: 'p1', from: 'parley' });
    expect(r.music.at(-1)).toMatchObject({ state: 'boss', intensity: 1 });
    const at: number[] = [];
    for (let k = 0; k < 6; k++) { r.emit('boss/discharge', { kind: 'stake', mouth: 1, glowSeconds: 0.9, parryable: true }); at.push(r.world.tick); r.step(66); }
    const drums = r.engine.recent(64).filter((s) => s.name === 'drum').map((s) => s.tick);
    for (const t of at) expect(drums, 'a drum on the tick of the discharge').toContain(t);
    expect(drums.length).toBe(12);
    r.emit('boss/phase', { phase: 'p2', from: 'p1' }); expect(r.music.at(-1)).toMatchObject({ state: 'boss', intensity: 2 });
    r.emit('boss/phase', { phase: 'p3a', from: 'p2' }); expect(r.music.at(-1)).toMatchObject({ state: 'boss', intensity: 3 });
    r.emit('boss/hush', { on: true }); expect(r.music.at(-1)!.state).toBe('silent');
    r.emit('weapon/kept', { stage: 'fired', mark: 'm' });
    r.emit('boss/hush', { on: false });
    r.emit('boss/proven', POS);
    r.emit('boss/phase', { phase: 'proven', from: 'hush' });
    r.step(600);
    r.emit('boss/phase', { phase: 'p3b', from: 'proven' });
    expect(r.music.at(-1)!.state).toBe('silent');
    expect(r.music.filter((m) => m.tick > at.at(-1)! + 70 && m.state !== 'silent')).toHaveLength(0);
    r.emit('boss/defeated', { cleanSix: true });
    expect(r.music.at(-1)!.state).toBe('calm');
  });
  it('the wire plays every 8 to 20 s in calm and never answers the seventh; only wire_resolve does', () => {
    // every note the wire played in half an hour of calm, with its tick
    const notes: number[] = [], wire: number[] = [];
    const r2 = rig(3);
    const play = r2.engine.play.bind(r2.engine);
    r2.engine.play = (name, p) => {
      if (name === 'wire' || name === 'wire_answer') notes.push(p.a);
      if (name === 'wire') wire.push(r2.world.tick);
      return play(name, p);
    };
    r2.step(60 * 60 * 30);
    expect(wire.length).toBeGreaterThan(80);
    for (let i = 1; i < wire.length; i++) {
      const gap = (wire[i]! - wire[i - 1]!) / 60;
      expect(gap).toBeGreaterThanOrEqual(WIRE_MIN - 0.02);
      expect(gap).toBeLessThanOrEqual(WIRE_MAX + 0.02);
    }
    expect(r2.names()).not.toContain('wire_resolve');
    // the seventh is always left hanging: no C is ever followed by a D
    expect(notes.length).toBeGreaterThan(100);
    for (let i = 1; i < notes.length; i++) if (notes[i - 1] === 7) expect(notes[i] === 1 || notes[i] === 8, `note ${i}: ${notes[i - 1]} then ${notes[i]}`).toBe(false);
    expect(notes).toContain(7);
    r2.emit('audio/cue', cue('wire_resolve'));
    expect(r2.music.at(-1)!.state).toBe('ending');
    expect(r2.engine.recent(1)[0]!.name).toBe('wire_resolve');
  });
});

describe('the seventh', () => {
  it('the hum stops, four seconds without a single start, then water and a clean hum', () => {
    const r = rig(1, 'the_bore');
    r.emit('boss/phase', { phase: 'p3a', from: 'p2' });
    r.step(600);
    expect(r.engine.debugState()).toMatchObject({ hum: 'flat', proof: 0 });
    r.emit('weapon/kept', { stage: 'loading', mark: 'm' }); r.emit('boss/hush', { on: true });
    r.step(120);
    r.emit('weapon/kept', { stage: 'fired', mark: 'm' }); r.emit('boss/hush', { on: false }); r.emit('boss/proven', POS);
    const t0 = r.world.tick;
    expect(r.engine.debugState()).toMatchObject({ hum: 'off', proof: 1, silence: true, music: 'silent' });
    r.step(239);
    expect(r.engine.debugState()).toMatchObject({ silence: true });
    expect(r.engine.recent(8).filter((s) => s.tick > t0)).toHaveLength(0);      // no ambience event, no music, nothing
    r.step(1);
    expect(r.engine.debugState()).toMatchObject({ silence: false, hum: 'off' });
    r.step(600);
    expect(r.engine.recent(8).filter((s) => s.tick > t0)).toHaveLength(0);      // and still nothing until the water
    r.emit('audio/cue', cue('water_below'));
    expect(r.engine.debugState()).toMatchObject({ hum: 'tuned', proof: 2 });
    expect(r.says.map((s) => s.key)).toEqual(['cap_ratchet', 'cap_hum_stops', 'cap_water_below']);
  });
  it('a restart before the proof sings flat again; a save after it is clean without the ceremony', () => {
    const r = rig(1, 'the_bore');
    r.emit('boss/proven', POS); r.emit('audio/cue', cue('water_below'));
    r.emit('boss/phase', { phase: 'p3a', from: 'idle' });
    expect(r.engine.debugState()).toMatchObject({ hum: 'flat', proof: 0, silence: false });
    const r2 = rig(1, 'the_bore');
    r2.emit('boss/phase', { phase: 'p3b', from: 'idle' });
    expect(r2.engine.debugState()).toMatchObject({ hum: 'tuned', proof: 2, silence: false });
    expect(r2.says).toHaveLength(0);
  });
});

describe('determinism', () => {
  it('two runs of one script give the same sounds, captions and music states; another seed differs', () => {
    const run = (seed: number): string => {
      const r = rig(seed);
      for (let k = 0; k < 3600; k++) {
        if (k === 300) r.emit('encounter/started', { id: 'enc_street' });
        if (k > 300 && k < 1500 && k % 29 === 0) { r.emit('weapon/fired', fired('lead_round', 5 - ((k / 29) % 6))); r.emit('combat/hit', hit(k % 2 ? 'impact' : 'kill', 'adobe')); }
        if (k === 400) { r.world.threat = 6; r.emit('enemy/telegraph', tell('bider', 'lunge')); }
        if (k === 1500) r.emit('encounter/cleared', { id: 'enc_street', seconds: 20 });
        if (k === 1600) r.world.zone = 'plenty_street';
        r.step(1);
      }
      return JSON.stringify([r.engine.recent(128), r.says, r.music, r.engine.debugState()]);
    };
    expect(run(5)).toBe(run(5));
    expect(run(5)).not.toBe(run(6));
  });
});

describe('tuning and the station voice', () => {
  it('degree() is D Dorian from D3 = 146.83 Hz', () => {
    expect(degree(1, 3)).toBeCloseTo(146.83, 6);
    const semis = [0, 2, 3, 5, 7, 9, 10];
    for (let d = 1; d <= 7; d++) expect(centsOff(degree(d, 3), 146.83)).toBeCloseTo(semis[d - 1]! * 100, 6);
    expect(degree(8, 3)).toBeCloseTo(293.66, 6);
    expect(degree(1, 4)).toBeCloseTo(293.66, 6);
    expect(degree(5, 2)).toBeCloseTo(110, 1);
    expect(centsOff(FLAT, 1)).toBeCloseTo(-20, 9);
  });
  it('one blip per word, pitched by the word length, 20 cents flat', () => {
    expect(wordLengths('LIFT STATION 4. SURFACE POWER: WIND. THANK YOU FOR YOUR PATIENCE.')).toBe(11);
    expect([0, 1, 2, 3, 4].map(wordLength)).toEqual([4, 7, 1, 7, 5]);
    expect(wordLengths('')).toBe(0);
    expect(centsOff(blipHz(4), degree(4, 4))).toBeCloseTo(-20, 6);
    expect(blipHz(7)).toBeGreaterThan(blipHz(4));
  });
});

describe('fix round 3', () => {
  it('music: a threat flickering across a boundary every tick makes one event, not one per tick; intensity comes down after the hold', () => {
    const r = rig();
    r.step(60);
    // the event first, the threat of its enemies later on the same tick: the tick of the start sends ONE event
    r.emit('encounter/started', { id: 'enc_street' });
    r.world.threat = 7;
    r.engine.music.derive(1);
    const start = r.world.tick;
    expect(r.music.filter((m) => m.tick === start)).toEqual([{ state: 'combat', intensity: 1, tick: start }]);
    r.step(1);
    expect(r.music.at(-1)).toEqual({ state: 'combat', intensity: 3, tick: start + 1 });
    const n = r.music.length;
    for (let k = 0; k < 120; k++) { r.world.threat = k % 2 ? 6 : 5; r.step(1); }     // 2 s of flapping between steady and driving
    expect(r.music.length).toBe(n);
    expect(r.music.at(-1)).toMatchObject({ state: 'combat', intensity: 3 });
    // down: only after 0.75 s of a lower threat, and then once
    r.world.threat = 1; r.step(40);
    expect(r.music.length).toBe(n);
    r.step(10);
    expect(r.music.length).toBe(n + 1);
    expect(r.music.at(-1)).toMatchObject({ state: 'combat', intensity: 1 });
    // up: at once
    r.world.threat = 4; r.step(1);
    expect(r.music.at(-1)).toEqual({ state: 'combat', intensity: 2, tick: r.world.tick });
    // never two events on one tick through all of it
    const ticks = r.music.map((m) => m.tick);
    expect(new Set(ticks).size).toBe(ticks.length);
    // a held-back change also goes out with the frame, when the simulation stands still
    const r2 = rig();
    r2.step(10); r2.emit('encounter/started', { id: 'enc_street' }); r2.world.threat = 7; r2.engine.music.derive(1);
    expect(r2.engine.music.pending).toBe(true);
    r2.world.tick++; r2.engine.lateUpdate();
    expect(r2.music.at(-1)).toMatchObject({ state: 'combat', intensity: 3 });
    expect(r2.engine.music.pending).toBe(false);
  });

  it('respawn, a new run, loading and the title let go of every sounding voice but the menu\'s', () => {
    for (const how of ['respawn', 'new_run', 'loading', 'title'] as const) {
      const r = rig(1, 'the_bore');
      r.step(10);
      r.emit('boss/haul', { on: true, seconds: 8 });
      r.emit('story/line', { key: 'stn', speaker: 'station', text: 'THANK YOU FOR YOUR PATIENCE.', seconds: 8 });
      r.emit('enemy/telegraph', { ...POS, id: 'tamper#1', kind: 'tamper', attack: 'charge', seconds: 3 });
      r.step(10);
      expect(r.engine.voices).toBe(3);
      r.emit('player/died', { kind: 'slam', source: 'tamper' });
      r.step(5);
      expect(r.engine.voices).toBe(4);
      r.emit('audio/cue', cue('ui_select'));                 // the menu's own click, a tick before the restart
      r.step(1);
      // something the new life starts on the very tick of the restart is kept
      r.emit('audio/cue', cue('checkpoint'));
      expect(r.engine.voices).toBe(6);
      if (how === 'respawn') r.emit('player/respawned', { checkpoint: 'cp_lip_gate' } as GameEvents['player/respawned']);
      else if (how === 'new_run') r.emit('game/new_run', { difficulty: 'normal' } as GameEvents['game/new_run']);
      else r.emit('game/state', { from: 'dead', to: how, reason: '' });
      // the menu's click and the checkpoint note of this tick stay; the haul, the line, the howl and the death go
      expect(r.engine.voices, how).toBe(2);
      expect(r.engine.debugState()['recent']).toContain('checkpoint@' + r.world.tick);
    }
  });

  it('a non-finite or missing field becomes its neutral value: the sound starts, once warned', () => {
    const warns: unknown[] = [];
    const was = console.warn;
    console.warn = (...a: unknown[]) => { warns.push(a[0]); };
    try {
      const r = rig();
      const bad = Number.NaN;
      r.emit('combat/hit', { ...hit('impact', 'stone'), x: bad, y: bad, z: bad });
      r.emit('combat/hit', { ...hit('impact', 'stone'), x: bad, y: bad, z: bad });
      r.emit('boss/mouth', { mouth: bad, state: 'dark' } as GameEvents['boss/mouth']);
      r.emit('story/line', { key: 'stn', speaker: 'station', seconds: bad } as unknown as GameEvents['story/line']);
      r.emit('breakable/broken', { ...POS, id: 'b' } as unknown as GameEvents['breakable/broken']);
      r.emit('enemy/telegraph', { ...tell('transit', 'aim'), seconds: Infinity, x: bad });
      expect(r.names()).toEqual(['impact_stone', 'impact_stone', 'chamber', 'station_line', 'break_clay', 'transit_tone']);
      expect(warns).toHaveLength(4);                       // impact_stone once; break_clay had every number it needs
      const p = r.engine.params();
      p.gain = bad; p.pitch = -1; p.delay = bad; p.seconds = Infinity; p.a = bad; p.pan = bad; p.send = bad; p.x = bad; p.positional = true; (p as unknown as { text: unknown }).text = undefined;
      expect(r.engine.play('jug', p)).toBeGreaterThanOrEqual(0);
      expect(p).toMatchObject({ gain: 1, pitch: 1, delay: 0, seconds: 0, a: 0, pan: 0, send: 1, positional: false, text: '' });
    } finally { console.warn = was; }
  });

  it('the confirms are logged on the tick of the hit and counted as sounding through their delay', () => {
    const r = rig();
    r.step(5);
    r.emit('weapon/fired', fired('lead_round', 4)); r.emit('combat/hit', hit('kill', 'none', 'bider'));
    expect(r.engine.recent(2)).toEqual([{ name: 'gun_report', tick: 5 }, { name: 'hit_kill', tick: 5 }]);
    r.step(20);                                              // 0.33 s: the thud started 0.19 s after the click and is 0.22 s long
    expect(r.engine.voices).toBe(1);
    r.step(8);
    expect(r.engine.voices).toBe(0);
  });

  // polish round 4 (critic "combat"): in the hall and the bore the short confirms are a little louder (and the room steps
  // back further: tests/audio/gun.test.mjs). The level is set from the zone, with or without a context, so the voice
  // table (and with it which voice a full pool steals) never depends on whether the sound is on.
  it('the short confirms are lifted in the hall (+2.5 dB) and the bore (+3.5 dB) and nowhere else; the kill and the freed bell are not', () => {
    for (const [zone, lift] of [['the_lip', 1], ['plenty_street', 1], ['the_gallery', 1], ['lift_hall', 1.33], ['the_bore', 1.5]] as const) {
      const r = rig(1, zone);
      r.step(2);
      const gains: Record<string, number> = {};
      const play = r.engine.play.bind(r.engine);
      r.engine.play = (name, p) => { gains[name] = p.gain; return play(name, p); };
      for (const [outcome, kind] of [['hit', 'bider'], ['weak', 'transit'], ['parried', 'windlass'], ['deflected', 'windlass'], ['deflected', 'tamper'], ['kill', 'bider'], ['freed', 'bider']] as const) {
        r.emit('combat/hit', hit(outcome, 'none', kind));
        r.step(6);
      }
      expect(gains['hit_tick']).toBeCloseTo(lift, 5);
      expect(gains['hit_weak']).toBeCloseTo(lift, 5);
      expect(gains['hit_parry']).toBeCloseTo(lift, 5);
      expect(gains['hit_deflect']).toBeCloseTo(lift, 5);
      expect(gains['tamper_clank']).toBeCloseTo(3 * lift, 5);
      expect(gains['hit_kill']).toBe(1);
      expect(gains['hit_freed']).toBe(1);
    }
  });

  // polish round 5 (critic "combat"): the four confirms that peak at the limiter hold their level in the hall (12 ms) and
  // the bore (20 ms): the only way they gain level over the room's tail. Set from the zone, with or without a context.
  it('hit, weak, parry and kill are held in the hall and the bore and nowhere else; the deflects and the freed bell are not', () => {
    for (const [zone, hold] of [['the_lip', 0], ['plenty_street', 0], ['tally_house', 0], ['the_gallery', 0], ['lift_hall', 0.012], ['the_bore', 0.02], ['far_rim', 0]] as const) {
      const r = rig(1, zone);
      r.step(2);
      const a: Record<string, number> = {};
      const play = r.engine.play.bind(r.engine);
      r.engine.play = (name, p) => { a[name] = p.a; return play(name, p); };
      for (const [outcome, kind] of [['hit', 'bider'], ['weak', 'transit'], ['parried', 'windlass'], ['deflected', 'windlass'], ['deflected', 'tamper'], ['kill', 'bider'], ['freed', 'bider']] as const) {
        r.emit('combat/hit', hit(outcome, 'none', kind));
        r.step(6);
      }
      expect(a['hit_tick']).toBe(hold);
      expect(a['hit_weak']).toBe(hold);
      expect(a['hit_parry']).toBe(hold);
      expect(a['hit_kill']).toBe(hold);
      expect(a['hit_deflect']).toBe(0);
      expect(a['tamper_clank']).toBe(0);
      expect(a['hit_freed']).toBe(0);
      // every hold a room asks for has a pre-rendered take (a value outside the table would be built live, 6 nodes a start)
      for (const n of ['hit_tick', 'hit_weak', 'hit_parry', 'hit_kill']) {
        const bk = r.engine.sounds[n]!.bake!;
        expect(bk.a).toContain(hold);
        expect(bk.pick({ ...makeParams(), a: hold })).toBe(bk.a.indexOf(hold));
      }
    }
  });
});
