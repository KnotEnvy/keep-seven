// The audio engine: events in, sounds, captions and `music/state` out. It has no dependency on a running context:
// with no graph (or a suspended one) every handler still does its bookkeeping (`recent()`, voices, captions, music
// state), and the same class runs against an OfflineAudioContext for tests. Nothing here allocates after
// construction except the short-lived nodes of a sound start.
import type { AudioCue, BossPhase, EnemyKind, EventName, GameEvents, Rng, SurfaceType, ZoneId } from '../core/contracts.ts';
import { AMB_EVENTS, Ambience, HUM_FLAT, HUM_NAMES, HUM_OFF, HUM_TUNED } from './ambience.ts';
import type { AmbEvent } from './ambience.ts';
import { bellSounds } from './bells.ts';
import { bossSounds } from './boss.ts';
import { creatureSounds } from './creatures.ts';
import { cueSounds, worldSounds } from './cues.ts';
import { BUS_UI, MAX_VOICES } from './graph.ts';
import type { Graph } from './graph.ts';
import { CONFIRM_DELAY, KILL_DELAY, gunSounds } from './gun.ts';
import { MUSIC_NAMES, Music } from './music.ts';
import type { MusicHost, MusicStateName } from './music.ts';
import { IR_CONFIRM_HOLD, IR_CONFIRM_LIFT, zoneIr } from './reverb.ts';
import { PRIO_CONFIRM, PRIO_GUN, PRIO_OTHER, PRIO_STATION, makeParams, resetParams, snd } from './sound.ts';
import type { SoundDef, SoundParams, SoundTable } from './sound.ts';
import { stationSounds } from './station.ts';

/** What the engine needs from the world around it (the live system reads the GameContext; a test supplies numbers). */
export interface EngineEnv {
  /** the sim tick (`ctx.clock.tick`): stamps `recent()` and times voice lengths */
  tick(): number;
  zone(): ZoneId | '';
  threat(): number;
  say(key: string): void;
  music(state: MusicStateName, intensity: 0 | 1 | 2 | 3): void;
  readonly rng: Rng;
}

const RECENT = 128;
/** voices only the gun, the hit confirms and the station voice may take while the rest of the pool is full */
export const RESERVED_VOICES = 4;
function reservedClass(prio: number): boolean { return prio === PRIO_GUN || prio === PRIO_CONFIRM || prio === PRIO_STATION; }
const TRACKED = 16;
const KIND_BIDER = 0, KIND_TRANSIT = 1, KIND_TAMPER = 2, KIND_WINDLASS = 3;
/** at most three running Biders are voiced */
const BIDER_RUN_VOICES = 3;
/** ticks between two starts of a loop sound: Bider run, Transit gait, Tamper walk, Tamper charge */
const LOOP_TICKS: readonly number[] = [20, 46, 60, 26];
const LOOP_SOUND: readonly string[] = ['bider_run', 'transit_clack', 'tamper_stamp', 'tamper_stamp'];
/** the Tamper pounds behind its bulkhead every 2.6 s */
export const POUND_TICKS = 156;
/** four seconds of true silence */
export const SILENCE_SECONDS = 4;
/** the shot's pitch varies by this much either way, seeded */
export const SHOT_JITTER = 0.04;
/** a second start of the same sound within this many ticks is the same sound asked for twice (a cue beside its event) */
const SAME_TICKS = 3;
/** cos of the half-angle outside which a walking Transit is "out of view" and gets its caption */
const VIEW_COS = 0.55;

const IMPACT: Record<SurfaceType, string> = { sand: 'impact_sand', wood: 'impact_wood', adobe: 'impact_adobe', metal: 'impact_metal', ceramic: 'impact_ceramic', stone: 'impact_stone', cloth: 'impact_cloth', none: 'impact_none' };
const STEP: Record<SurfaceType, string> = { sand: 'step_sand', wood: 'step_wood', adobe: 'step_adobe', metal: 'step_metal', ceramic: 'step_ceramic', stone: 'step_stone', cloth: 'step_cloth', none: 'step_none' };
const KIND_INDEX: Record<EnemyKind, number> = { bider: KIND_BIDER, transit: KIND_TRANSIT, tamper: KIND_TAMPER, windlass: KIND_WINDLASS };

type Handler<K extends EventName> = (payload: Readonly<GameEvents[K]>) => void;

export function buildSounds(): SoundTable {
  const silent = (): void => { /* a marker: the sound is an absence */ };
  return {
    ...gunSounds(), ...bellSounds(), ...creatureSounds(), ...stationSounds(), ...bossSounds(), ...worldSounds(), ...cueSounds(),
    // the hum stopping: nothing is played, the bed is cut. It is logged so its caption has a sound to belong to.
    hum_stops: snd(0, PRIO_OTHER, 0, 0, silent),
  };
}

export class Engine implements MusicHost {
  readonly sounds: SoundTable = buildSounds();
  readonly ambience = new Ambience();
  readonly music: Music;
  readonly rng: Rng;
  graph: Graph | null = null;
  /** ticks of the engine's own fixedUpdate: stops with the game (music, ambience, loops) */
  ownTicks = 0;
  /** sounds started since boot */
  starts = 0;
  /** sounding voices */
  voices = 0;
  /** the most voices ever sounding at once */
  voicePeak = 0;
  /** starts refused because 32 voices of equal or higher priority were sounding */
  dropped = 0;
  /** pitch of the last report (1 +/- 4 %) */
  shotPitch = 1;
  /** no ambience events, no music (single-sound renders) */
  quiet = false;
  // ---- per-run state
  /** 0 = unproven, 1 = the silence and the dark after it, 2 = water heard: the hum is clean */
  proof = 0;
  private silenceUntil = -1;
  private dryClicks = 0;
  private chamberHits = 0;
  private bossPhase: BossPhase = 'idle';
  /** the tick of the last `glow_tone` cue (the real Windlass announces a glow's start with it) */
  private glowCueTick = -100000;
  private chimeZones = 0;
  private pounding = false;
  private poundAt = 0;
  private keptAt = -1000;
  private checkpointAt = -1000;
  private zone: ZoneId | '' = '';
  // ---- listener
  private lx = 0; private ly = 0; private lz = 0; private fx = 0; private fy = 0; private fz = -1;
  // ---- voices (structure of arrays)
  private readonly vOn = new Uint8Array(MAX_VOICES);
  private readonly vEnd = new Int32Array(MAX_VOICES);
  private readonly vStart = new Int32Array(MAX_VOICES);
  private readonly vPrio = new Int8Array(MAX_VOICES);
  private readonly vTag = new Int16Array(MAX_VOICES);
  private readonly vLevel = new Float32Array(MAX_VOICES);
  private readonly vName: string[] = new Array<string>(MAX_VOICES).fill('');
  private readonly vNode: (GainNode | null)[] = new Array<GainNode | null>(MAX_VOICES).fill(null);
  // ---- recent()
  private readonly rName: string[] = new Array<string>(RECENT).fill('');
  private readonly rTick = new Int32Array(RECENT);
  private rHead = 0;
  private rCount = 0;
  // ---- tracked enemies (positions as of their last event that carried one)
  private readonly tId: string[] = new Array<string>(TRACKED).fill('');
  private readonly tKind = new Int8Array(TRACKED);
  private readonly tLoop = new Int8Array(TRACKED);       // 0 = still; 1 + index into LOOP_* otherwise
  private readonly tNext = new Int32Array(TRACKED);
  private readonly tX = new Float32Array(TRACKED);
  private readonly tY = new Float32Array(TRACKED);
  private readonly tZ = new Float32Array(TRACKED);
  private readonly p: SoundParams = makeParams();
  private readonly unknown = new Set<string>();
  /** sounds already warned about for a start with a non-finite or missing parameter */
  private readonly warned = new Set<string>();
  /** event name -> handler; the system subscribes each, the offline renderer calls them from a script */
  readonly handlers = new Map<EventName, (payload: never) => void>();

  constructor(private readonly env: EngineEnv) {
    this.rng = env.rng;
    this.music = new Music(this);
    for (const name of Object.keys(this.sounds)) (this.sounds[name] as SoundDef).last = -1000;
    this.subscribe();
  }

  /** Give the engine its graph (live: at boot, suspended; offline: before the script runs). */
  attach(graph: Graph): void {
    this.graph = graph;
    if (!this.quiet) this.ambience.attach(graph);
  }
  private now(): number { return this.graph ? this.graph.now() : 0; }
  private ownTime(): number { return this.ownTicks / 60; }

  // ---- MusicHost ---------------------------------------------------------------------------------------
  params(): SoundParams { return resetParams(this.p); }
  emitMusic(state: MusicStateName, intensity: 0 | 1 | 2 | 3): void { this.env.music(state, intensity); }
  setCombatLayer(on: boolean): void { if (this.graph) this.graph.setCombat(on, this.now()); }
  threat(): number { return this.env.threat(); }
  simTick(): number { return this.env.tick(); }
  /** Once a frame, also while the simulation stands still: a music change held back on its tick goes out now. */
  lateUpdate(): void { if (this.music.pending) this.music.derive(this.ownTime()); }

  /**
   * Another piece's NaN must not cost a sound, let alone throw inside a handler (WebAudio refuses a non-finite value,
   * and only while the context runs, so the bug would first show for a player with the sound on). Every parameter that
   * is not a finite number becomes its neutral value: the sound's own level and length, no place, no pitch change.
   * One addition on the good path; one warning per sound name on the bad one.
   */
  private sanitize(name: string, p: SoundParams): void {
    const sum = p.gain + p.pitch + p.delay + p.seconds + p.a + p.b + p.c + p.x + p.y + p.z + p.pan + p.send;
    if (sum - sum === 0 && p.pitch > 0 && p.delay >= 0 && typeof p.text === 'string') return;
    const f = Number.isFinite;
    if (!f(p.gain)) p.gain = 1;
    if (!f(p.pitch) || p.pitch <= 0) p.pitch = 1;
    if (!f(p.delay) || p.delay < 0) p.delay = 0;
    if (!f(p.seconds)) p.seconds = 0;
    if (!f(p.a)) p.a = 0;
    if (!f(p.b)) p.b = 0;
    if (!f(p.c)) p.c = 0;
    if (!f(p.x) || !f(p.y) || !f(p.z)) { p.x = this.lx; p.y = this.ly; p.z = this.lz; p.positional = false; }
    if (!f(p.pan)) p.pan = 0;
    if (!f(p.send)) p.send = 1;
    if (typeof p.text !== 'string') p.text = '';
    if (!this.warned.has(name)) { this.warned.add(name); console.warn(`[audio] '${name}' was started with a non-finite or missing parameter: played with neutral values`); }
  }

  // ---- starting a sound --------------------------------------------------------------------------------
  /**
   * Starts a sound: logs it, takes a voice (stealing the quietest / oldest voice of the lowest priority when 32 are
   * sounding), and, when a context is running, builds its nodes. Returns the voice slot or -1.
   */
  play(name: string, p: SoundParams): number {
    const def = this.sounds[name];
    if (!def) {
      if (!this.unknown.has(name)) { this.unknown.add(name); console.error(`[audio] no sound named '${name}'`); }
      return -1;
    }
    this.sanitize(name, p);
    // a start at no level is no start: nothing is logged, no voice is taken, no caption follows it
    if (!(p.gain > 0)) return -1;
    const tick = this.env.tick();
    if (def.timed > 0 && p.seconds <= 0) p.seconds = def.timed;
    const seconds = def.dur + (def.timed > 0 ? p.seconds : 0) + p.delay;
    let gain = p.gain, pan = p.pan, send = def.send * p.send;
    if (p.positional) {
      const dx = p.x - this.lx, dy = p.y - this.ly, dz = p.z - this.lz;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz), u = d / def.range;
      const near = 1 / (1 + u * u);
      gain *= near;
      // right = forward x up; far things lean on the room
      const rl = Math.sqrt(this.fx * this.fx + this.fz * this.fz);
      pan = d > 0.2 && rl > 1e-4 ? 0.85 * (dx * -this.fz + dz * this.fx) / (rl * d) : 0;
      send = Math.min(1, send * (1 + 1.5 * (1 - near)));
    }
    const slot = this.take(def.prio, tick);
    if (slot < 0) { this.dropped++; return -1; }
    def.last = tick;
    this.starts++;
    this.rName[this.rHead] = name; this.rTick[this.rHead] = tick;
    this.rHead = (this.rHead + 1) % RECENT;
    if (this.rCount < RECENT) this.rCount++;
    this.vOn[slot] = 1; this.vName[slot] = name; this.vPrio[slot] = def.prio; this.vTag[slot] = p.tag; this.vLevel[slot] = gain;
    this.vStart[slot] = tick; this.vEnd[slot] = tick + Math.max(1, Math.ceil(seconds * 60));
    this.vNode[slot] = null;
    this.voices++;
    if (this.voices > this.voicePeak) this.voicePeak = this.voices;
    const g = this.graph;
    if (g && g.active) {
      const t = g.now() + p.delay;
      const node = g.gain(gain);
      g.route(node, def.bus, p.positional, pan < -1 ? -1 : pan > 1 ? 1 : pan, send);
      this.vNode[slot] = node;
      const take = this.bakedTake(g, name, def, p);
      if (take) g.playBuffer(take, node, t, p.pitch);
      else def.build(g, node, t, p);
    }
    return slot;
  }
  /** The pre-rendered take a start plays, or null: build the recipe (no bake yet, not a baked sound, a class it lacks). */
  private bakedTake(g: Graph, name: string, def: SoundDef, p: Readonly<SoundParams>): AudioBuffer | null {
    const bk = def.bake, all = g.baked;
    if (!bk || !all) return null;
    const cls = bk.pick(p);
    const takes = cls >= 0 ? all.get(name) : undefined;
    if (!takes) return null;
    def.turn = (def.turn + 1) % bk.copies;
    return takes[cls * bk.copies + def.turn] ?? null;
  }
  /** As play(), unless the same sound started within the last few ticks (a cue that doubles its event; six mouths at once). */
  private playOnce(name: string, p: SoundParams): number {
    const def = this.sounds[name];
    if (def && this.env.tick() - def.last <= SAME_TICKS) return -1;
    return this.play(name, p);
  }
  private simple(name: string): void { this.play(name, this.params()); }
  /**
   * A short hit confirm (tick, tink, sour note, clank): what is left of the report steps back under it for 120 ms, so
   * the answer to the shot is not 10 dB under the shot. The kill's thud and the freed bell are over the bed without it.
   * In the hall and the bore, whose rooms answer the report loudest, the room steps back further and for longer and the
   * confirm is a little louder (reverb.ts IR_TAIL_DUCK_DB, IR_CONFIRM_LIFT).
   */
  private confirm(name: string, p: SoundParams): void {
    // by the zone she stands in, not by the graph: the voice's level is the same with the sound off
    p.gain *= IR_CONFIRM_LIFT[zoneIr(this.zone)] as number;
    if (this.play(name, p) >= 0 && this.graph && this.graph.active) this.graph.duckTail(this.graph.now() + p.delay);
  }
  /** How long the tick, the tink, the sour note and the kill's thud hold their level in the room she stands in (their `a`). */
  private hold(): number { return IR_CONFIRM_HOLD[zoneIr(this.zone)] as number; }
  /** A sound with its caption: the caption is raised only when the sound really started. */
  private captioned(name: string, p: SoundParams, key: string): void {
    if (this.play(name, p) >= 0) this.env.say(key);
  }
  private at(x: number, y: number, z: number): SoundParams {
    const p = this.params();
    p.x = x; p.y = y; p.z = z; p.positional = true;
    return p;
  }

  private free(slot: number): void {
    if (!this.vOn[slot]) return;
    this.vOn[slot] = 0; this.vNode[slot] = null; this.voices--;
  }
  private fade(slot: number): void {
    const node = this.vNode[slot], g = this.graph;
    if (node && g) { const t = g.now(); node.gain.cancelScheduledValues(t); node.gain.setTargetAtTime(0, t, 0.006); }
    this.free(slot);
  }
  /**
   * The life that just ended is not heard in the next one: every sounding voice but the menu's (a haul's whine, a
   * station line, a howl, the kept tone) is let go over about 150 ms. A sound started on this very tick belongs to the
   * new life and stays.
   */
  private stopWorld(): void {
    const tick = this.env.tick(), g = this.graph;
    for (let i = 0; i < MAX_VOICES; i++) {
      if (!this.vOn[i] || this.vStart[i] === tick) continue;
      const def = this.sounds[this.vName[i] as string];
      if (def && def.bus === BUS_UI) continue;
      const node = this.vNode[i];
      if (node && g) { const t = g.now(); node.gain.cancelScheduledValues(t); node.gain.setTargetAtTime(0, t, 0.05); }
      this.free(i);
    }
  }
  private expire(tick: number): void {
    for (let i = 0; i < MAX_VOICES; i++) if (this.vOn[i] && (this.vEnd[i] as number) <= tick) this.free(i);
  }
  private take(prio: number, tick: number): number {
    // the last RESERVED_VOICES voices are kept for the gun, the confirms and the station voice: a pile of telegraphs
    // cannot leave a kill without its thud. Everything else steals once the pool is down to them.
    const reserved = reservedClass(prio), limit = reserved ? MAX_VOICES : MAX_VOICES - RESERVED_VOICES;
    if (this.voices >= limit) this.expire(tick);
    if (this.voices < limit) { for (let i = 0; i < MAX_VOICES; i++) if (!this.vOn[i]) return i; }
    // steal: the lowest priority; among those the quietest; among those the oldest. Never a voice above the newcomer,
    // never the gun for anything but the gun, and never a voice of the reserve for a sound outside it.
    let victim = -1;
    for (let i = 0; i < MAX_VOICES; i++) {
      if (!this.vOn[i]) continue;                    // a free slot of the reserve is not a voice to steal
      const pr = this.vPrio[i] as number;
      if (pr > prio || (pr === PRIO_GUN && prio !== PRIO_GUN) || (!reserved && reservedClass(pr))) continue;
      if (victim < 0) { victim = i; continue; }
      const vp = this.vPrio[victim] as number;
      if (pr < vp || (pr === vp && ((this.vLevel[i] as number) < (this.vLevel[victim] as number) - 1e-3
        || (Math.abs((this.vLevel[i] as number) - (this.vLevel[victim] as number)) <= 1e-3 && (this.vStart[i] as number) < (this.vStart[victim] as number))))) victim = i;
    }
    if (victim < 0) return -1;
    this.fade(victim);
    return victim;
  }
  private stopTagged(name: string, tag: number): void {
    for (let i = 0; i < MAX_VOICES; i++) if (this.vOn[i] && this.vTag[i] === tag && this.vName[i] === name) this.fade(i);
  }

  // ---- tracked enemies ---------------------------------------------------------------------------------
  private find(id: string): number {
    for (let i = 0; i < TRACKED; i++) if (this.tId[i] === id) return i;
    return -1;
  }
  private track(id: string, kind: EnemyKind): number {
    let i = this.find(id);
    if (i >= 0) return i;
    i = this.find('');
    if (i < 0) return -1;
    this.tId[i] = id; this.tKind[i] = KIND_INDEX[kind]; this.tLoop[i] = 0; this.tX[i] = this.lx; this.tY[i] = this.ly; this.tZ[i] = this.lz;
    return i;
  }
  private untrack(id: string): void {
    const i = this.find(id);
    if (i >= 0) { this.tId[i] = ''; this.tLoop[i] = 0; }
  }
  private clearTracked(): void { for (let i = 0; i < TRACKED; i++) { this.tId[i] = ''; this.tLoop[i] = 0; } }
  private place(i: number, x: number, y: number, z: number): void { if (i >= 0) { this.tX[i] = x; this.tY[i] = y; this.tZ[i] = z; } }
  private setLoop(i: number, loop: number): void {
    if (i < 0 || this.tLoop[i] === loop) return;
    this.tLoop[i] = loop;
    this.tNext[i] = this.ownTicks + 2;
  }

  // ---- the seventh --------------------------------------------------------------------------------------
  private fireKept(): void {
    const tick = this.env.tick();
    if (tick - this.keptAt <= 30) return;
    this.keptAt = tick;
    this.simple('gun_report_kept');
    this.simple('kept_tone');
    if (this.graph) this.graph.duck(this.now());
  }
  private setProof(proof: number, fade: number): void {
    this.proof = proof;
    const t = this.now();
    this.ambience.water = proof === 2;
    this.ambience.setHum(proof === 0 ? HUM_FLAT : proof === 1 ? HUM_OFF : HUM_TUNED, t, fade);
  }
  private proven(): void {
    // the hum stops; four seconds of true silence; then air, and nothing else until the water
    this.setProof(1, 0.03);
    if (this.play('hum_stops', this.params()) >= 0) this.env.say('cap_hum_stops');
    this.silenceUntil = this.ownTicks + SILENCE_SECONDS * 60;
    if (this.graph) this.graph.setSilence(this.now(), SILENCE_SECONDS);
    this.music.hushed = true;
    this.music.derive(this.ownTime());
  }

  private setZone(zone: ZoneId | ''): void {
    if (zone === this.zone) return;
    this.zone = zone;
    const t = this.now();
    if (this.graph) this.graph.setZone(zone, t, 1.2);
    this.ambience.setZone(zone, t, this.rng, this.ownTicks);
  }
  private zoneBit(): number {
    switch (this.zone) {
      case 'the_lip': return 1; case 'plenty_street': return 2; case 'tally_house': return 4; case 'the_gallery': return 8;
      case 'lift_hall': return 16; case 'the_bore': return 32; case 'far_rim': return 64; default: return 128;
    }
  }

  private on<K extends EventName>(name: K, handler: Handler<K>): void { this.handlers.set(name, handler as unknown as (payload: never) => void); }

  private subscribe(): void {
    // ---- the gun
    this.on('weapon/fired', (e) => {
      if (e.ammo === 'kept_round') { this.fireKept(); return; }
      const p = this.params();
      this.shotPitch = p.pitch = 1 + this.rng.range(-SHOT_JITTER, SHOT_JITTER);
      p.a = e.chambersLeft;
      // the last two rounds of a cylinder: brighter mechanics (in the builder) and a drier tail
      if (e.chambersLeft <= 1) p.send = 0.45;
      this.play('gun_report', p);
      if (e.ammo === 'line_round') this.simple('line_tone');
      if (this.graph) this.graph.duck(this.now());
    });
    this.on('weapon/dry_fire', (e) => { const p = this.params(); p.a = e.reason === 'kept_not_in_bore' ? 1 : 0; this.play('dry_fire', p); });
    this.on('weapon/reload', (e) => {
      const p = this.params();
      if (e.stage === 'round') { p.a = e.chambered; this.play('reload_round', p); }
      else this.play(e.stage === 'open' ? 'reload_open' : e.stage === 'close' ? 'reload_close' : 'reload_fast_close', p);
    });
    this.on('weapon/line', (e) => { this.simple(e.stage === 'loaded' ? 'line_load' : 'line_unload'); });
    this.on('weapon/kept', (e) => {
      switch (e.stage) {
        case 'denied': this.simple('kept_denied'); break;
        case 'loading': this.simple('kept_load'); break;
        case 'chambered': this.simple('kept_seat'); break;
        case 'unloaded': this.simple('kept_unload'); break;
        case 'fired': this.fireKept(); break;
      }
    });
    this.on('combat/hit', (e) => {
      const p = this.at(e.x, e.y, e.z);
      switch (e.outcome) {
        case 'impact':
          p.pitch = 1 + this.rng.range(-0.07, 0.07);
          this.play(IMPACT[e.surface] ?? 'impact_none', p);
          // the yard bell answering a stray shot
          if (this.zone === 'plenty_street' && this.rng.chance(0.2)) { const q = this.params(); q.delay = 0.45; q.pan = 0.5; this.play('yard_bell_far', q); }
          break;
        // the confirms are for her, not for the room: dry, centred, the same at any range. They are logged on the
        // tick of the hit and SOUND a moment later, after the report they would otherwise be buried under
        case 'hit': p.positional = false; p.delay = CONFIRM_DELAY; p.a = this.hold(); this.confirm('hit_tick', p); break;
        case 'weak': p.positional = false; p.delay = CONFIRM_DELAY; p.a = this.hold(); this.confirm('hit_weak', p); break;
        case 'kill':
          p.positional = false; p.delay = KILL_DELAY; p.a = this.hold();
          // in the hall and the bore the thud is held and the report's tail steps back under it as under the others
          // (no lift: it is at the limiter); in the open it is 8 dB over the bed without either, and nothing moves
          if (this.play('hit_kill', p) >= 0 && p.a > 0 && this.graph && this.graph.active) this.graph.duckTail(this.graph.now() + p.delay);
          break;
        case 'freed': p.positional = false; p.delay = CONFIRM_DELAY; this.play('hit_freed', p); break;
        case 'parried': p.positional = false; p.delay = CONFIRM_DELAY; p.a = this.hold(); this.confirm('hit_parry', p); break;
        case 'passed': this.play('hit_pass', p); break;
        case 'deflected':
          p.delay = CONFIRM_DELAY;
          // the plate is out in the room (it has a place), and it must still be heard over the shot that rang it
          if (e.entityKind === 'tamper') { p.gain = 3; this.confirm('tamper_clank', p); } else this.confirm('hit_deflect', p);
          break;
        case 'broke':
          switch (e.entityKind) {
            case 'jug': this.play('break_clay', p); break;
            case 'bell': case 'latch': case 'range_plate': case 'ask_port': this.play('break_bell', p); break;
            case 'stake': this.play('break_stake', p); break;
            case 'canister': this.play('break_tin', p); break;
            case 'knot': this.play('break_knot', p); break;
            case 'cord': case 'rope': this.play('twang', p); break;
            case 'dowser': this.play('dust_hit', p); break;
            default: this.play('break_clay', p); break;
          }
          break;
      }
    });

    // ---- the player's body
    this.on('player/footstep', (e) => {
      const p = this.params();
      p.a = e.sprint ? 1 : 0; p.pitch = 1 + this.rng.range(-0.06, 0.06); p.pan = this.rng.range(-0.12, 0.12);
      this.play(STEP[e.surface] ?? 'step_none', p);
    });
    this.on('player/jumped', () => { this.simple('jump'); });
    this.on('player/landed', (e) => { const p = this.params(); p.a = e.speed; this.play('land', p); });
    this.on('player/damaged', (e) => { if (e.amount <= 0) return; const p = this.params(); p.a = e.amount; this.play('hurt', p); });
    this.on('player/died', () => { this.simple('died'); });
    this.on('player/respawned', () => {
      this.clearTracked(); this.pounding = false;
      this.stopWorld();
      this.silenceUntil = -1;
      if (this.graph) { const t = this.now(); this.graph.clearSilence(t); this.graph.setHush(false, t); }
    });

    // ---- everything that answers a bullet
    this.on('shootable/hit', (e) => {
      const p = this.at(e.x, e.y, e.z);
      p.a = e.scaleDegree;
      switch (e.kind) {
        case 'jug': this.play('jug', p); break;
        case 'range_plate': this.play('plate', p); break;
        case 'ask_port': this.play('port', p); break;
        case 'cord': case 'rope': this.play('twang', p); break;
        case 'dowser': this.play('dust_hit', p); break;
        case 'knot': break;                                  // `knot/burst` carries its sound
        default: if (p.a < 1) p.a = 5; this.play('bell_long', p); break;   // latch, bell
      }
    });
    this.on('breakable/broken', (e) => {
      const a = typeof e.asset === 'string' ? e.asset : '', p = this.at(e.x, e.y, e.z);
      p.pitch = 1 + this.rng.range(-0.08, 0.08);
      this.play(a.includes('bottle') || a.includes('glass') || a.includes('lantern') ? 'break_glass' : a.includes('tin') || a.includes('pot') || a.includes('can') ? 'break_tin' : 'break_clay', p);
    });
    this.on('knot/burst', (e) => { this.play('knot_burst', this.at(e.x, e.y, e.z)); });
    this.on('knot/regrown', (e) => { this.play('knot_regrow', this.at(e.x, e.y, e.z)); });

    // ---- enemies
    this.on('enemy/spawned', (e) => {
      const i = this.track(e.id, e.kind);
      this.place(i, e.x, e.y, e.z);
      if (e.kind === 'transit') { const p = this.at(e.x, e.y, e.z); p.tag = i; this.captioned('transit_clack', p, 'cap_transit_clack'); }
    });
    this.on('enemy/state', (e) => {
      const i = this.track(e.id, e.kind);
      if (i < 0) return;
      const to = e.to;
      if (e.kind === 'bider') {
        if (to === 'circle_strafe') { const p = this.at(this.tX[i] as number, this.tY[i] as number, this.tZ[i] as number); p.pitch = 1 + this.rng.range(-0.08, 0.08); this.captioned('bider_bark', p, 'cap_bider_rattle'); }
        this.setLoop(i, to === 'approach' || to === 'circle' || to === 'circle_strafe' ? 1 : 0);
      } else if (e.kind === 'transit') {
        if (to === 'flinch') this.stopTagged('transit_tone', i);
        this.setLoop(i, to === 'relocate' || to === 'emerge' ? 2 : 0);
      } else if (e.kind === 'tamper') {
        this.setLoop(i, to === 'advance' ? 3 : to === 'charge' ? 4 : 0);
      }
    });
    this.on('enemy/telegraph', (e) => {
      const i = this.track(e.id, e.kind);
      this.place(i, e.x, e.y, e.z);
      const p = this.at(e.x, e.y, e.z);
      p.tag = i; p.seconds = e.seconds;
      if (e.kind === 'bider') { p.seconds = 0; p.pitch = 1 + this.rng.range(-0.06, 0.06); this.captioned('bider_rattle', p, 'cap_bider_rattle'); }
      else if (e.kind === 'transit') this.captioned('transit_tone', p, 'cap_transit_tone');
      else if (e.kind === 'tamper') {
        if (e.attack === 'charge') this.captioned('tamper_howl', p, 'cap_tamper_howl');
        else this.captioned('tamper_hiss', p, 'cap_tamper_hiss');
      }
    });
    this.on('enemy/attack', (e) => {
      this.place(this.find(e.id), e.x, e.y, e.z);
      if (e.kind === 'tamper' && e.attack === 'slam') this.play('tamper_slam', this.at(e.x, e.y, e.z));
      else if (e.kind === 'bider') this.play('bider_lunge', this.at(e.x, e.y, e.z));
    });
    this.on('enemy/felled', (e) => { this.untrack(e.id); this.play('bider_fold', this.at(e.x, e.y, e.z)); });
    this.on('enemy/freed', (e) => { this.untrack(e.id); this.captioned('bider_breath', this.at(e.x, e.y, e.z), 'cap_bider_sits'); });
    this.on('enemy/died', (e) => {
      const i = this.find(e.id);
      if (e.kind === 'transit') { if (i >= 0) this.stopTagged('transit_tone', i); this.play('lens_bell', this.at(e.x, e.y, e.z)); }
      else if (e.kind === 'tamper') { this.pounding = false; this.play('tamper_die', this.at(e.x, e.y, e.z)); }
      this.untrack(e.id);
    });
    this.on('enemy/removed', (e) => { this.untrack(e.id); });
    this.on('projectile/spawned', (e) => {
      const p = this.at(e.x, e.y, e.z);
      if (e.kind === 'stake') this.captioned('stake_whirr', p, 'cap_stake');
      else this.captioned('canister_thump', p, 'cap_canister');
    });
    this.on('projectile/landed', (e) => {
      if (e.hitPlayer) return;                                // `player/damaged` is her sound
      this.play(e.kind === 'stake' ? 'stake_stick' : 'impact_metal', this.at(e.x, e.y, e.z));
    });
    this.on('projectile/burst', (e) => { this.play(e.kind === 'stake' ? 'break_stake' : 'canister_fizz', this.at(e.x, e.y, e.z)); });
    this.on('vignette/state', (e) => {
      if (e.id !== 'vig_tamper') return;
      if (e.stage === 'started') {
        this.pounding = true; this.poundAt = this.ownTicks + POUND_TICKS;
        this.captioned('tamper_pound', this.params(), 'cap_tamper_pound');
      } else this.pounding = false;
    });

    // ---- the Windlass
    this.on('boss/phase', (e) => {
      const ph = e.phase;
      this.bossPhase = ph;
      this.music.bossPhase = ph;
      if (ph === 'p3b') { this.dryClicks = 0; this.chamberHits = 0; }
      const before = ph === 'idle' || ph === 'parley' || ph === 'p1' || ph === 'p2' || ph === 'p3a';
      if (before && this.proof !== 0) {
        // a restart from before the proof: the machine sings flat again
        this.setProof(0, 1); this.silenceUntil = -1; this.music.hushed = false;
        if (this.graph) this.graph.clearSilence(this.now());
      } else if ((ph === 'p3b' || ph === 'dead') && this.proof === 0) {
        // a save from after the proof: no ceremony, the bore is already clean
        this.setProof(2, 1); this.music.hushed = true;
      }
      if (ph === 'dead') this.music.hushed = false;
      this.music.derive(this.ownTime());
    });
    this.on('boss/indexing', (e) => { const p = this.params(); p.seconds = e.seconds; if (this.playOnce('ratchet', p) >= 0) this.env.say('cap_ratchet'); });
    this.on('boss/discharge', (e) => {
      if (e.kind === 'dry') {
        if (this.playOnce('dry_click_big', this.params()) >= 0 && this.dryClicks < 3) { this.dryClicks++; this.env.say('cap_dry_click'); }
        return;
      }
      // integration seam (docs/requests/code-audio.md 1.7 against code-enemies 4.6): the real Windlass emits
      // `boss/discharge` when the chamber FIRES, after its glow, and announces the glow's start with the cue `glow_tone`.
      // A tone begun here as well rose for 0.9 s AFTER every shot, over the next chamber's tell. The tone is played
      // from this event only when no cue announced the glow (an emitter that sends the event alone, at the glow's start).
      const announced = this.env.tick() - this.glowCueTick <= Math.round((e.glowSeconds + 0.3) * 60);
      if (e.glowSeconds > 0 && !announced) { const p = this.params(); p.seconds = e.glowSeconds; this.playOnce('glow_tone', p); }
      if (e.kind === 'lance') this.captioned('lance_tone', this.params(), 'cap_lance');
      this.music.discharge(this.ownTime());
    });
    this.on('boss/haul', (e) => { if (!e.on) return; const p = this.params(); p.seconds = e.seconds; this.playOnce('haul_whine', p); });
    this.on('boss/mouth', (e) => {
      const p = this.params();
      switch (e.state) {
        case 'open': this.playOnce('mouth_iris', p); break;
        case 'shut': p.a = 1; this.playOnce('mouth_iris', p); break;
        case 'relit': if (this.playOnce('refill_gurgle', p) >= 0) this.env.say('cap_refill'); break;
        case 'dark':
          // degrees 1-6 by mouth number; in the dry phase the six hits climb the scale in the order they land
          if (this.bossPhase === 'p3b') { this.chamberHits = this.chamberHits >= 6 ? 6 : this.chamberHits + 1; p.a = this.chamberHits; }
          else { p.a = e.mouth < 1 ? 1 : e.mouth > 6 ? 6 : e.mouth; p.b = 1; }
          this.play('chamber', p);
          break;
      }
    });
    this.on('boss/guard', (e) => {
      if (e.state === 'shattered') this.playOnce('guard_shatter', this.params());
      else if (e.state !== 'parked') this.playOnce('guard_slide', this.params());
    });
    this.on('boss/hush', (e) => {
      if (this.graph) this.graph.setHush(e.on, this.now());
      this.music.hushed = e.on || this.proof !== 0 || this.env.tick() - this.keptAt <= 30;
      this.music.derive(this.ownTime());
      if (e.on) { const p = this.params(); p.seconds = 1.0; if (this.playOnce('ratchet', p) >= 0) this.env.say('cap_ratchet'); }
    });
    this.on('boss/proven', () => { this.proven(); });
    this.on('boss/defeated', () => {
      if (this.playOnce('run_down', this.params()) >= 0) this.env.say('cap_ratchet');
      this.music.hushed = false; this.music.bossPhase = 'dead';
      this.music.derive(this.ownTime());
    });

    // ---- the station, the world
    this.on('story/line', (e) => {
      if (e.speaker !== 'station') return;
      const p = this.params();
      p.text = e.text; p.seconds = e.seconds;
      if (this.play('station_line', p) < 0) return;
      // the caption for the chime: before the first station line in each zone only
      const bit = this.zoneBit();
      if ((this.chimeZones & bit) === 0) { this.chimeZones |= bit; this.env.say('cap_station_chime'); }
    });
    this.on('audio/cue', (e) => { this.cue(e.cue, e.x, e.y, e.z, e.positional, e.gain, e.pitch); });
    this.on('checkpoint/saved', () => { this.checkpoint(); });
    this.on('pickup/collected', (e) => { this.simple(e.kind === 'pk_rounds_6' ? 'pickup_packet' : e.kind === 'pk_rounds_12' ? 'pickup_tin' : 'pickup_canteen'); });
    this.on('asking/listen', (e) => { if (e.lit === 1) this.captioned('listen_lamps', this.params(), 'cap_listening'); });
    this.on('ending/fire', (e) => {
      this.ambience.fire = true;
      this.captioned('fire_kindle', this.at(e.x, e.y, e.z), 'cap_fire_kindles');
    });
    this.on('zone/entered', (e) => { this.setZone(e.zone); });

    // ---- music and the state of the game
    this.on('encounter/started', (e) => {
      if (e.id === 'enc_matador') this.pounding = false;
      this.music.encounter = true; this.music.derive(this.ownTime());
    });
    this.on('encounter/cleared', () => { this.music.encounter = false; this.music.derive(this.ownTime()); });
    this.on('encounter/reset', () => { this.music.encounter = false; this.music.derive(this.ownTime()); });
    this.on('game/state', (e) => {
      const g = this.graph, t = this.now();
      if (g) {
        if (e.to === 'paused') g.setPaused(true, t); else if (e.from === 'paused') g.setPaused(false, t);
        if (e.to === 'dead') g.setDeath(true, t); else if (e.from === 'dead') g.setDeath(false, t);
      }
      if (e.to === 'title' || e.to === 'loading') { this.music.encounter = false; this.clearTracked(); this.pounding = false; this.stopWorld(); }
      this.music.game = e.to;
      this.music.derive(this.ownTime());
    });
    this.on('game/new_run', () => {
      this.chimeZones = 0; this.dryClicks = 0; this.chamberHits = 0; this.bossPhase = 'idle'; this.silenceUntil = -1;
      this.pounding = false; this.clearTracked(); this.stopWorld();
      this.ambience.fire = false;
      this.music.encounter = false; this.music.ending = false; this.music.hushed = false; this.music.bossPhase = 'idle';
      this.setProof(0, 0.5);
      const g = this.graph;
      if (g) { const t = this.now(); g.clearSilence(t); g.setHush(false, t); this.ambience.overhang(t); }
      this.music.derive(this.ownTime());
    });
  }

  private checkpoint(): void {
    const tick = this.env.tick();
    if (tick - this.checkpointAt <= 30) return;       // the cue and `checkpoint/saved` are one note
    this.checkpointAt = tick;
    this.simple('checkpoint');
  }

  /** `audio/cue`: a sound with no domain event of its own. Honours gain and pitch. */
  cue(cue: AudioCue, x: number, y: number, z: number, positional: boolean, gain: number, pitch: number): void {
    const p = this.params();
    p.x = x; p.y = y; p.z = z; p.positional = positional;
    // gain: 0 or less is silence (an emitter fading a cue out gets nothing, not the loudest take); only a missing or
    // NaN gain means "the sound's own level". A silent cue still does what it does to the state (water_below, wire_resolve).
    p.gain = gain === undefined || gain !== gain ? 1 : gain; p.pitch = pitch > 0 ? pitch : 1;
    switch (cue) {
      case 'checkpoint': if (p.gain > 0) this.checkpoint(); break;
      case 'chairs_scrape': this.captioned(cue, p, 'cap_chairs'); break;
      case 'gate_bang': this.captioned(cue, p, 'cap_gate'); break;
      case 'shutter_bang': this.captioned(cue, p, 'cap_shutter'); break;
      case 'locker_chime': this.captioned(cue, p, 'cap_locker_chime'); break;
      case 'water_below':
        // far below, for the first time, water; from now on the bore's hum is clean and in tune
        this.setProof(2, 3);
        this.captioned(cue, p, 'cap_water_below');
        break;
      case 'wire_resolve':
        this.music.ending = true; this.music.derive(this.ownTime());
        this.captioned(cue, p, 'cap_wire_resolves');
        break;
      case 'hum_stop':
        this.play(cue, p);
        if (this.proof === 0) this.setProof(1, 0.03);
        break;
      // the Windlass's sounds also follow from its events: asked for twice, played once
      case 'glow_tone': this.glowCueTick = this.env.tick(); this.playOnce(cue, p); break;
      case 'ratchet': case 'mouth_iris': case 'haul_whine': case 'refill_gurgle': case 'dry_click_big':
      case 'run_down': case 'guard_slide': case 'guard_shatter':
        this.playOnce(cue, p); break;
      default: this.play(cue, p); break;
    }
  }

  /** Listener for the cheap stereo pan and distance gain: the eye and the view direction. */
  setListener(x: number, y: number, z: number, fx: number, fy: number, fz: number): void {
    this.lx = x; this.ly = y; this.lz = z; this.fx = fx; this.fy = fy; this.fz = fz;
  }

  /** One 60 Hz tick while the simulation runs. */
  fixedUpdate(): void {
    this.ownTicks++;
    const tick = this.env.tick(), own = this.ownTicks;
    if (this.voices > 0) this.expire(tick);
    const zone = this.env.zone();
    if (zone !== this.zone) this.setZone(zone);
    if (this.silenceUntil >= 0 && own >= this.silenceUntil) this.silenceUntil = -1;
    const silent = this.silenceUntil >= 0;
    if (this.quiet) return;
    this.music.tick(own / 60);
    const game = this.music.game;
    if (silent || (game !== 'playing' && game !== 'ending')) return;
    // loops: one start per cycle per moving enemy, from where it was last heard of
    let biders = 0;
    for (let i = 0; i < TRACKED; i++) {
      const loop = this.tLoop[i] as number;
      if (loop === 0) continue;
      if (loop === 1 && ++biders > BIDER_RUN_VOICES) continue;
      if (own < (this.tNext[i] as number)) continue;
      this.tNext[i] = own + (LOOP_TICKS[loop - 1] as number);
      const x = this.tX[i] as number, y = this.tY[i] as number, z = this.tZ[i] as number;
      const p = this.at(x, y, z);
      p.tag = i; p.pitch = 1 + this.rng.range(-0.05, 0.05);
      if (loop === 4) p.gain = 1.3;
      const started = this.play(LOOP_SOUND[loop - 1] as string, p) >= 0;
      if (started && loop === 2) {
        // a Transit walking where she is not looking: the caption says so
        const dx = x - this.lx, dy = y - this.ly, dz = z - this.lz, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d > 0.5 && (dx * this.fx + dy * this.fy + dz * this.fz) / d < VIEW_COS) this.env.say('cap_transit_clack');
      }
    }
    if (this.pounding && own >= this.poundAt) { this.poundAt = own + POUND_TICKS; this.simple('tamper_pound'); }
    const due = this.ambience.due(own, this.rng);
    if (due >= 0 && this.proof !== 1) {
      const e = AMB_EVENTS[due] as AmbEvent, p = this.params();
      p.gain = e.gain; p.pan = this.rng.range(-0.7, 0.7);
      if (e.jitter > 0) p.pitch = 1 + this.rng.range(-e.jitter, e.jitter);
      this.play(e.sound, p);
    }
  }

  /** Names of the last `n` sounds started, oldest first, with their sim tick. */
  recent(n: number): { name: string; tick: number }[] {
    const out: { name: string; tick: number }[] = [];
    const k = Math.min(n, this.rCount);
    for (let i = k; i >= 1; i--) {
      const j = (this.rHead - i + RECENT * 2) % RECENT;
      out.push({ name: this.rName[j] as string, tick: this.rTick[j] as number });
    }
    return out;
  }

  /** Logical state only: nothing here depends on a context, so `__dbg.hash()` is the same with or without sound. */
  debugState(): Record<string, unknown> {
    return {
      voices: this.voices, voicePeak: this.voicePeak, starts: this.starts, dropped: this.dropped,
      music: MUSIC_NAMES[this.music.state], intensity: this.music.intensity, wire: this.music.lastFigure,
      zone: this.zone, hum: HUM_NAMES[this.ambience.hum], proof: this.proof, silence: this.silenceUntil >= 0,
      shotPitch: Math.round(this.shotPitch * 1e4) / 1e4,
      recent: this.recent(16).map((r) => r.name + '@' + r.tick),
    };
  }
}
