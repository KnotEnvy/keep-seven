// src/world/checkpoints.ts: commit, restore, warp (ARCHITECTURE 10.1, GDD 18). World emits `checkpoint/reached`; core
// commits and emits `checkpoint/saved`. A checkpoint that is a place commits when she stands on it; the others are
// events (a puzzle solved, an encounter cleared, a boss phase) and are reached by the file that owns the event.
// beginRun / restoreCheckpoint never wait on the simulation: with every set decoded they finish synchronously.
import type {
  BossPhase, CheckpointId, DoorState, EncounterId, EnemiesSave, GameEvents, LayoutMarker, MarkerId, PlayerSave, PuzzleId, PuzzleSave, SaveData,
  StoryKey, VignetteId, WorldSave,
} from '../core/contracts.ts';
import { ENCOUNTERS, PUZZLES, emptyStats, inVolume, paramString } from './internals.ts';
import type { CheckpointsApi, State } from './internals.ts';

/** checkpoints that are PLACES (layout `params.when`): the start, 'entering ...', 'foot of the stair', 'the lift opens ...' */
const PLACE_WHEN = /^(start$|entering |foot of the stair$|the lift opens )/;
const PLACE_RADIUS = 1.6;

/** What has happened by the time each checkpoint is reached: the route, for warpToCheckpoint's plausible save. */
const PROGRESS: readonly { cp: CheckpointId; puzzles: readonly PuzzleId[]; encounters: readonly EncounterId[]; starts?: EncounterId }[] = [
  { cp: 'cp_lip_start', puzzles: [], encounters: [] },
  { cp: 'cp_lip_gate', puzzles: ['seven_jugs'], encounters: [] },
  { cp: 'cp_street_clear', puzzles: [], encounters: ['enc_street'] },
  { cp: 'cp_yard_clear', puzzles: [], encounters: ['enc_yard'] },
  { cp: 'cp_tally_enter', puzzles: [], encounters: [] },
  { cp: 'cp_tally_hatch', puzzles: ['daylight'], encounters: ['enc_tally'] },
  { cp: 'cp_gallery_bay', puzzles: [], encounters: [] },
  { cp: 'cp_gallery_baffle', puzzles: ['proving_line'], encounters: [] },
  { cp: 'cp_file_clear', puzzles: [], encounters: ['enc_file'] },
  { cp: 'cp_hall_gantry', puzzles: [], encounters: [] },
  { cp: 'cp_hall_clear', puzzles: [], encounters: ['enc_matador'] },
  { cp: 'cp_bore_ante', puzzles: [], encounters: [] },
  { cp: 'cp_boss_p1', puzzles: ['the_asking'], encounters: [], starts: 'enc_windlass' },
  { cp: 'cp_boss_p2', puzzles: [], encounters: [] },
  { cp: 'cp_boss_p3', puzzles: [], encounters: [] },
  { cp: 'cp_boss_proven', puzzles: [], encounters: [] },
  { cp: 'cp_rim', puzzles: [], encounters: ['enc_windlass'] },
];
/** the checkpoints (first to last, inclusive) at which each door stands open; a door not listed is shut at every one */
const DOOR_OPEN: Readonly<Record<MarkerId, readonly [CheckpointId, CheckpointId]>> = {
  door_jug_gate: ['cp_lip_gate', 'cp_rim'],
  door_yard_gate: ['cp_street_clear', 'cp_rim'],
  ia_yard_door: ['cp_yard_clear', 'cp_rim'],
  door_alley: ['cp_yard_clear', 'cp_rim'],
  door_tally: ['cp_tally_enter', 'cp_rim'],
  ia_hatch: ['cp_tally_hatch', 'cp_tally_hatch'],
  ia_baffle: ['cp_gallery_baffle', 'cp_rim'],
  door_gallery_far: ['cp_file_clear', 'cp_hall_gantry'],
  door_lift_cage: ['cp_hall_clear', 'cp_hall_clear'],
};
/** flags a save holds from a checkpoint on (inclusive) */
const FLAG_FROM: Readonly<Record<string, CheckpointId>> = {
  cell_lit: 'cp_tally_hatch', hatch_powered: 'cp_tally_hatch', dowser_done: 'cp_tally_enter', parley_heard: 'cp_boss_p1',
  proven: 'cp_boss_proven', boss_dead: 'cp_rim', kept_loaded: 'cp_boss_proven',
};
const DID = ['did_move', 'did_fire', 'did_reload', 'did_sprint', 'did_interact', 'did_line'];

class Checkpoints implements CheckpointsApi {
  private readonly list: LayoutMarker[];
  private readonly ids: CheckpointId[];
  /** place checkpoints: the once-trigger whose volume holds the marker ('' = proximity only), and whether a ride delivers her onto it */
  private readonly places: { marker: LayoutMarker; index: number; flag: string; byRide: boolean }[] = [];
  private override: WorldSave | null = null;
  private readonly reachedPayload: GameEvents['checkpoint/reached'] = { id: 'cp_lip_start' };
  private readonly objectivePayload: GameEvents['objective/changed'] = { key: '', text: '' };

  constructor(private readonly s: State) {
    const { data } = s.ctx;
    this.list = data.markersOfType('checkpoint').slice();
    this.ids = this.list.map((m) => m.id as CheckpointId);
    const triggers = data.markersOfType('trigger');
    this.list.forEach((m, index) => {
      if (!PLACE_WHEN.test(paramString(m, 'when'))) return;
      const holder = triggers.find((t) => t.params.once === true && t.zone === m.zone && inVolume(t, m.pos[0], m.pos[1] + 0.1, m.pos[2]));
      const byRide = data.layout.nav.portals.some((p) => {
        const cage = data.layout.markers.find((x) => x.id === p.cages[1]);
        return cage !== undefined && cage.zone === m.zone && Math.abs(cage.pos[0] - m.pos[0]) <= p.cageInterior[0] / 2 && Math.abs(cage.pos[2] - m.pos[2]) <= p.cageInterior[2] / 2;
      });
      this.places.push({ marker: m, index, flag: holder ? 'trg:' + holder.id : '', byRide });
    });
  }

  index(id: CheckpointId): number { return this.ids.indexOf(id); }

  reach(id: CheckpointId, force = false): void {
    const { s } = this;
    const i = this.index(id);
    if (i < 0 || i <= this.index(s.checkpoint) || !s.running) return;       // each once, never backwards
    if (!force && s.director.live) return;                                   // not while a fight is live: tick() comes back to it
    const m = this.list[i] as LayoutMarker;
    if (!s.build.isBuilt(m.zone)) return;
    s.checkpoint = id;
    s.story.setObjective(paramString(m, 'objective'));
    this.reachedPayload.id = id;
    s.ctx.events.emit('checkpoint/reached', this.reachedPayload);
  }

  /**
   * Release pass p0 (robustness: a reload or "Back to the last count" in the proving lift gave the Windlass back alive
   * in its dry phase, and the last six rounds had to be fired again). The save she holds is written again with the
   * world as it stands now (the Windlass dead, the lift gate open, the tallies) and the boss phase given: the same
   * checkpoint, the same mark, and the player's part as it was saved (what she carried at the proof). Written straight
   * to the store, not through `checkpoint/reached`: every checkpoint is announced once (the HUD's mark, the note, the
   * playthrough test's journal), and the kill is no moment for a second one. Only in play and alive.
   */
  again(bossPhase: BossPhase): void {
    const { s } = this;
    const held = s.ctx.save.current;
    if (!s.running || !held || held.checkpoint !== s.checkpoint || s.ctx.state.current !== 'playing' || !s.ctx.player.alive) return;
    s.ctx.save.commit({ ...held, world: this.captureSave(), enemies: { ...held.enemies, bossPhase } });
  }

  tick(): void {
    const { s } = this;
    const current = this.index(s.checkpoint);
    const p = s.ctx.player.position;
    for (let k = 0; k < this.places.length; k++) {
      const place = this.places[k] as (typeof this.places)[number];
      if (place.index <= current || place.byRide) continue;
      const m = place.marker;
      if (!s.build.isBuilt(m.zone)) continue;
      let here = place.flag !== '' && s.flags.has(place.flag);
      if (!here) {
        const dx = p.x - m.pos[0], dz = p.z - m.pos[2];
        here = dx * dx + dz * dz <= PLACE_RADIUS * PLACE_RADIUS && Math.abs(p.y - m.pos[1]) <= 1.5;
      }
      if (here) { this.reach(m.id as CheckpointId); return; }
    }
  }

  reset(): void { this.override = null; this.warping = false; }

  // ---- runs -----------------------------------------------------------------------------------------
  private resetRun(): void {
    const { s } = this;
    s.flags.clear();
    s.vignettesSeen.clear();
    s.stats = emptyStats();
    s.objective = '';
    s.bossDeaths = 0; s.bossDeathPhase = '';
    s.story.reset();
    s.rides.reset();
    s.doors.reset();
    s.build.applyBroken([]);
    for (const id of PUZZLES) s.puzzles[id].reset();
    s.interact.reset();
    s.director.reset();
    s.kept.reset();
    s.ending.reset();
    for (const solid of s.ctx.data.layout.solids) if (solid.dynamic) s.ctx.collision.setSolidEnabled(solid.id, false);
    s.ctx.render.setWrongFade(0);
    s.ctx.render.setExposure(1, 0);
    s.visDirty = true;
  }
  private put(markerId: string): void {
    const { s } = this;
    const m = s.ctx.data.layout.markers.find((x) => x.id === markerId);
    if (m) s.ctx.player.teleport(m.pos[0], m.pos[1], m.pos[2], m.rotY, 0);
    s.placed();
  }
  private after(p: Promise<void> | null, then: () => void): Promise<void> {
    if (!p) { then(); return Promise.resolve(); }
    return this.s.build.track(p.then(then));
  }

  beginRun(fromSave: SaveData | null): Promise<void> {
    const { s } = this;
    if (fromSave) {
      // the flow applies the save (enemies, world, player) once the right set is resident
      s.running = true;
      return this.after(s.build.ensureFor(fromSave.checkpoint, fromSave.world.onceFlags.includes('hatch_powered')), () => {});
    }
    this.resetRun();
    s.running = true;
    return this.after(s.build.ensureFor(this.ids[0] as CheckpointId, false), () => {
      s.checkpoint = this.ids[0] as CheckpointId;
      this.put('player_start');
      // integration seam: the start trigger fires BEFORE the first save is taken, so that the save of cp_lip_start
      // holds the first objective (a death before the jug gate came back with no objective on the HUD)
      s.director.fireStart();
      this.reachedPayload.id = s.checkpoint;
      s.ctx.events.emit('checkpoint/reached', this.reachedPayload);
    });
  }

  restoreCheckpoint(): Promise<void> {
    const { s } = this;
    const save = s.ctx.save.current;
    if (!save) return Promise.resolve();
    s.rides.reset();
    return this.after(s.build.ensureFor(save.checkpoint, save.world.onceFlags.includes('hatch_powered')), () => {});
  }

  // ---- save -----------------------------------------------------------------------------------------
  captureSave(): WorldSave {
    const { s } = this;
    if (this.override) return JSON.parse(JSON.stringify(this.override)) as WorldSave;
    const puzzles = {} as Record<PuzzleId, PuzzleSave>;
    for (const id of PUZZLES) puzzles[id] = s.puzzles[id].capture();
    const doors: Record<MarkerId, DoorState> = {};
    s.doors.capture(doors);
    const save: WorldSave = {
      zone: s.zone, objective: s.objective, puzzles, doors,
      encountersCleared: [], pickupsTaken: [], lockersUsed: [], brokenIds: [],
      onceFlags: this.flagsWithQueue(), vignettesSeen: Array.from(s.vignettesSeen).sort(),
      // what an encounter still in progress has freed and felled is not hers until it is cleared
      stats: { ...s.stats, secrets: s.stats.secrets.slice(), freed: s.stats.freed - s.director.pendingFreed(), knotsBurst: s.stats.knotsBurst - s.director.pendingFreed(), felled: s.stats.felled - s.director.pendingFelled() },
    };
    s.director.capture(save);
    s.interact.capture(save);
    s.build.brokenIds(save.brokenIds);
    return save;
  }

  /** the flags of a save: the run's, and what the story still held waiting (`q:<nn>:<key>`) so a restore says it again */
  private flagsWithQueue(): string[] {
    const flags = Array.from(this.s.flags);
    const waiting: string[] = [];
    this.s.story.queued(waiting);
    for (let i = 0; i < waiting.length; i++) flags.push('q:' + String(i).padStart(2, '0') + ':' + waiting[i]);
    return flags.sort();
  }

  applySave(data: WorldSave): void {
    const { s } = this;
    const full = s.ctx.save.current;
    s.running = true;
    s.story.clear();
    s.rides.reset();
    s.flags.clear();
    for (const f of data.onceFlags) s.flags.add(f);
    // vignettes never replay in a run: what she has seen stays seen through a death (a debug warp starts over)
    if (this.warping) { s.vignettesSeen.clear(); s.story.forget(); }
    // pass i1: "Go on" from the rim after the end card is the rim told again (the other ending): what the finished
    // telling said there is not "heard", or the stone, the lamps, the fire and the last line would all be silent
    else if (s.ending.ended) s.story.forget();
    for (const v of data.vignettesSeen) s.vignettesSeen.add(v);
    const deaths = s.stats.deaths;
    s.stats = { ...data.stats, secrets: data.stats.secrets.slice(), deaths: Math.max(deaths, data.stats.deaths) };
    if (s.objective !== data.objective) {
      s.objective = data.objective;
      this.objectivePayload.key = data.objective; this.objectivePayload.text = s.ctx.data.story.objectives[data.objective] ?? '';
      s.ctx.events.emit('objective/changed', this.objectivePayload);
    }
    if (full) s.checkpoint = full.checkpoint;
    for (const solid of s.ctx.data.layout.solids) if (solid.dynamic) s.ctx.collision.setSolidEnabled(solid.id, s.flags.has('enabled:' + solid.id));
    // put her on the mark first: what follows reads the zone she is in
    this.put(s.checkpoint);
    s.doors.apply(data.doors);
    s.build.applyBroken(data.brokenIds);
    for (const id of PUZZLES) s.puzzles[id].apply(data.puzzles[id]);
    s.interact.apply(data);
    s.director.apply(data, full);
    s.kept.apply(full, this.warping);
    s.ending.reset();
    const rim = s.ctx.data.layout.markers.find((m) => m.id === s.checkpoint);
    if (rim && Array.isArray(rim.params.failSafes)) s.ending.arrive();
    // 3.6 rule 6: the surface set with the hatch powered is the seam stage, before control is given
    if (s.flags.has('hatch_powered')) void s.build.track(s.build.enterSeam());
    // last: what the save held waiting is said again, and what was heard this run stays heard
    s.story.restored();
    this.warping = false;
    s.visDirty = true;
    s.placed();
  }
  private warping = false;

  // ---- warp -----------------------------------------------------------------------------------------
  /** where a marker lies along the critical path: the index of the path node nearest to it */
  private pathIndex(pos: readonly number[]): number {
    const { nav } = this.s.ctx.data.layout;
    let best = 0, bestD = Infinity;
    for (let i = 0; i < nav.criticalPath.length; i++) {
      const n = nav.nodes.find((x) => x.id === nav.criticalPath[i]);
      if (!n) continue;
      const d = Math.hypot(n.pos[0] - (pos[0] as number), (n.pos[1] - (pos[1] as number)) * 2, n.pos[2] - (pos[2] as number));
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }
  /** A plausible save for a checkpoint: every earlier puzzle solved, doors, encounters cleared, what she carries. */
  private synth(id: CheckpointId): { world: WorldSave; player: PlayerSave; enemies: EnemiesSave } {
    const { s } = this;
    const { data } = s.ctx;
    const at = this.index(id);
    const marker = this.list[at] as LayoutMarker;
    const solved = new Set<PuzzleId>(), cleared: EncounterId[] = [];
    const objectives = Object.keys(data.story.objectives);
    let objective: StoryKey = objectives[0] ?? '';
    for (let i = 0; i <= at; i++) {
      const row = PROGRESS[i] as (typeof PROGRESS)[number];
      for (const p of row.puzzles) {
        solved.add(p);
        // a puzzle whose solving sets an objective (the day-cell)
        const el = data.markersOfType('puzzle_element').find((m) => m.params.puzzle === p && typeof m.params.objective === 'string');
        if (el) objective = paramString(el, 'objective');
      }
      for (const e of row.encounters) { cleared.push(e); const o = data.encounter(e).onClear.objective; if (o) objective = o; }
      if (row.starts) { const t = data.layout.markers.find((m) => m.id === data.encounter(row.starts as EncounterId).trigger); if (t && paramString(t, 'objective')) objective = paramString(t, 'objective'); }
      const own = paramString(this.list[i] as LayoutMarker, 'objective');
      if (own) objective = own;
    }
    const puzzles = {} as Record<PuzzleId, PuzzleSave>;
    for (const p of PUZZLES) puzzles[p] = solved.has(p) ? s.puzzles[p].solvedSave() : { solved: false, step: 0, data: {} };
    // the hatch knot is burst once its encounter is behind her
    if (cleared.includes('enc_tally')) puzzles.daylight.data.knot = true;
    const doors: Record<MarkerId, DoorState> = {};
    for (const d of s.doors.ids()) {
      const span = DOOR_OPEN[d];
      doors[d] = span && at >= this.index(span[0]) && at <= this.index(span[1]) ? 'open' : 'closed';
    }
    const flags: string[] = [];
    for (const [flag, from] of Object.entries(FLAG_FROM)) if (at >= this.index(from)) flags.push(flag);
    if (at > 0) for (const f of DID) flags.push(f);
    for (const p of solved) flags.push('entered:' + p);
    for (let i = 0; i <= objectives.indexOf(objective); i++) flags.push('obj:' + objectives[i]);
    const vignettes: VignetteId[] = [];
    const here = this.pathIndex(marker.pos);
    for (const t of data.markersOfType('trigger')) {
      if (t.params.once !== true || this.pathIndex(t.pos) >= here) continue;
      flags.push('trg:' + t.id);
      const vig = t.params.vignette as { id?: VignetteId } | undefined;
      if (vig && vig.id) vignettes.push(vig.id);
    }
    for (const e of cleared) {
      const d = data.encounter(e);
      const trigger = data.layout.markers.find((m) => m.id === d.trigger);
      if (trigger && trigger.params.kind === 'knot') flags.push('burst:' + trigger.id);
      const first = d.waves[0] ? data.layout.markers.find((m) => m.id === d.waves[0]?.spawns[0]) : undefined;
      const vig = first?.params.vignette as { id?: VignetteId } | undefined;
      if (vig && vig.id) vignettes.push(vig.id);
    }
    const world: WorldSave = {
      zone: marker.zone, objective, puzzles, doors, encountersCleared: ENCOUNTERS.filter((e) => cleared.includes(e)),
      pickupsTaken: [], lockersUsed: [], brokenIds: [], onceFlags: Array.from(new Set(flags)).sort(), vignettesSeen: Array.from(new Set(vignettes)).sort(),
      stats: { ...s.stats, secrets: s.stats.secrets.slice() },
    };
    // full health, 6 + 24 lead; a line round from cp_gallery_baffle on; the seventh sealed until it is spent
    const proven = at >= this.index('cp_boss_proven');
    const player: PlayerSave = {
      health: s.ctx.player.maxHealth, cylinder: ['lead', 'lead', 'lead', 'lead', 'lead', 'lead'], reserve: 24,
      lineRounds: at >= this.index('cp_gallery_baffle') ? 1 : 0, seventh: proven ? 'spent' : 'sealed',
    };
    const phases: Partial<Record<CheckpointId, EnemiesSave['bossPhase']>> = { cp_boss_p1: 'p1', cp_boss_p2: 'p2', cp_boss_p3: 'p3a', cp_boss_proven: 'p3b', cp_rim: 'dead' };
    const enemies: EnemiesSave = { bossPhase: phases[id] ?? 'idle', parleyHeard: at >= this.index('cp_boss_p1'), deathsInBossPhase: 0, statics: [] };
    return { world, player, enemies };
  }

  warpToCheckpoint(id: CheckpointId): Promise<void> {
    const { s } = this;
    if (this.index(id) < 0) return Promise.reject(new Error(`unknown checkpoint '${id}'`));
    const synth = this.synth(id);
    s.running = true;
    s.checkpoint = id;
    // core commits what the three systems capture at `checkpoint/reached` (and emits checkpoint/saved): the world's part
    // is the synthesised one; the player's and the enemies' parts are then replaced by theirs
    this.override = synth.world;
    this.warping = true;
    this.reachedPayload.id = id;
    s.ctx.events.emit('checkpoint/reached', this.reachedPayload);
    this.override = null;
    const committed = s.ctx.save.current;
    s.ctx.save.commit({ version: 1, checkpoint: id, tick: committed ? committed.tick : s.ctx.clock.tick, player: synth.player, world: synth.world, enemies: synth.enemies });
    return this.restoreCheckpoint();
  }
}

export function createCheckpoints(s: State): CheckpointsApi { return new Checkpoints(s); }
