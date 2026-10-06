// src/world: level build per resident set and the seam, visibility, doors, interaction, pickups, the four puzzles and
// their hints, triggers, the encounter director, the story sequencer, objectives, checkpoints, rides, secrets, stats,
// the ending (docs/workorders/code-world.md). This file is the lifecycle and the fixed per-tick order:
//   triggers -> doors -> interact -> puzzles -> director -> story -> checkpoints -> rides -> ending -> visibility
// Every other file hangs one module on the State of internals.ts and talks to the rest through it.
import type {
  CheckpointId, CreateWorldSystem, DebugSnapshot, DoorState, EncounterId, EncounterView, GameContext, GameEvents, MarkerId, MoodId,
  PickupKind, PuzzleId, PuzzleView, ResidentSet, RunStats, SaveData, StoryKey, WorldDebug, WorldSave, WorldSystem, ZoneId,
} from '../core/contracts.ts';
import { round4 } from '../core/math.ts';
import { createBuild } from './build.ts';
import { createCheckpoints } from './checkpoints.ts';
import { createDebug, registerDebug } from './debug.ts';
import { createDirector } from './director.ts';
import { createDoors } from './doors.ts';
import { createEnding } from './ending.ts';
import { createInteract } from './interact.ts';
import { PUZZLES, State, lampCount } from './internals.ts';
import { createKept } from './kept.ts';
import { createDaylight } from './puzzles/daylight.ts';
import { createProvingLine } from './puzzles/proving_line.ts';
import { createSevenJugs } from './puzzles/seven_jugs.ts';
import { createTheAsking } from './puzzles/the_asking.ts';
import { createRides } from './rides.ts';
import { createStory } from './story.ts';

class World implements WorldSystem {
  readonly id = 'world' as const;
  readonly debug: WorldDebug;
  private readonly s: State;
  private readonly zonePayload: GameEvents['zone/entered'] = { zone: 'the_lip', from: '', mood: 'L1' };
  private zoneKnown = false;

  constructor(ctx: GameContext) {
    const s = new State(ctx);
    this.s = s;
    // construction only (ARCHITECTURE 3.2): no call into another system, no asset access
    s.story = createStory(s);
    s.doors = createDoors(s);
    s.build = createBuild(s, {
      attach: (zone) => this.attach(zone),
      detach: (zone) => this.detach(zone),
      changed: () => s.doors.attach(s.zone),
    });
    s.puzzles = { seven_jugs: createSevenJugs(s), daylight: createDaylight(s), proving_line: createProvingLine(s), the_asking: createTheAsking(s) };
    s.interact = createInteract(s);
    s.director = createDirector(s);
    s.checkpoints = createCheckpoints(s);
    s.rides = createRides(s);
    s.kept = createKept(s);
    s.ending = createEnding(s);
    s.placed = (moodSeconds = 0) => { if (!s.started) return; this.updateZone(true, moodSeconds); s.visDirty = true; s.build.updateVisibility(); };
    this.debug = createDebug(s);
    s.objective = '';
  }

  // ---- WorldApi fields ------------------------------------------------------------------------------
  get zone(): ZoneId { return this.s.zone; }
  get cell(): string { return this.s.cell; }
  get residentSet(): ResidentSet { return this.s.residentSet; }
  get builtZones(): readonly ZoneId[] { return this.s.builtZones; }
  get mood(): MoodId { return this.s.mood; }
  get objective(): StoryKey { return this.s.objective; }
  get checkpoint(): CheckpointId { return this.s.checkpoint; }
  get stats(): Readonly<RunStats> { return this.s.stats; }
  get lamps(): number { return lampCount(this.s.stats.freed); }

  // ---- what is built: the files that hang things on a zone, in dependency order ---------------------------
  private attach(zone: ZoneId): void {
    const { s } = this;
    s.doors.attach(zone);
    s.interact.attach(zone);
    for (const id of PUZZLES) if (s.puzzles[id].zone === zone) s.puzzles[id].attach();
    s.director.attach(zone);
    s.rides.attach(zone);
    s.kept.attach(zone);
    s.ending.attach(zone);
  }
  private detach(zone: ZoneId): void {
    const { s } = this;
    s.ending.detach(zone);
    s.kept.detach(zone);
    s.rides.detach(zone);
    s.director.detach(zone);
    for (const id of PUZZLES) if (s.puzzles[id].zone === zone) s.puzzles[id].detach();
    s.interact.detach(zone);
    s.doors.detach(zone);
  }

  // ---- lifecycle ------------------------------------------------------------------------------------
  init(): void {
    const { s } = this;
    const e = s.ctx.events;
    e.on('weapon/fired', () => { s.stats.roundsFired++; this.hitCounted = false; });
    // a round that met something that reacted, once per shot (GDD 22: accuracy)
    e.on('combat/hit', (h) => { if (!this.hitCounted && h.outcome !== 'impact' && h.outcome !== 'passed') { this.hitCounted = true; s.stats.roundsHit++; } });
    e.on('combat/line_resolved', (l) => { if (l.bodies + l.knots >= 3) s.stats.linesOfThree++; });
    // the title: no run is going on (after a quit core rebuilds the overhang shot under the menu; "Begin" and "Go on"
    // start a run again through beginRun). Whatever was being said or ridden stops with the run.
    e.on('game/state', (g) => {
      if (g.to !== 'title' || !s.running) return;
      s.running = false;
      s.story.clear();
      s.rides.reset();
      s.ctx.render.setOutline(null);
    });
    registerDebug(s);
  }
  private hitCounted = false;

  start(): void {
    const { s } = this;
    // the title screen: the world not begun, the camera at player_start
    const m = s.ctx.data.layout.markers.find((x) => x.type === 'player_start');
    if (m) s.ctx.player.teleport(m.pos[0], m.pos[1], m.pos[2], m.rotY, 0);
    s.started = true;
    this.updateZone(true);
    s.build.updateVisibility();
  }
  dispose(): void {
    const { s } = this;
    s.releaseGlints();
    s.build.dispose();
  }

  // ---- per tick -------------------------------------------------------------------------------------
  private updateZone(force: boolean, moodSeconds = 0): void {
    const { s } = this;
    const { ctx } = s;
    const p = ctx.player.position;
    const z = ctx.data.zoneAt(p.x, p.y, p.z, s.residentSet);
    // outside every zone of the resident set (the stair between the hatch closing and the swap; a ride's teleport): held
    s.zoneHeld = z === null;
    if (z === null) return;
    const mood = s.director.moodOf(z);
    if (z !== s.zone || force || !this.zoneKnown) {
      const from = s.zone;
      const entered = z !== from || !this.zoneKnown;
      s.zone = z;
      s.mood = mood;
      this.zoneKnown = true;
      if (entered) {
        this.zonePayload.zone = z; this.zonePayload.from = z === from ? '' : from; this.zonePayload.mood = mood;
        ctx.events.emit('zone/entered', this.zonePayload);
      }
      if (entered || force) {
        // (a ride's teleport asks for a long fade: it wins over the one second a forced placement gives)
        ctx.render.setMood(mood, s.zoneFade > 0 ? s.zoneFade : force ? moodSeconds : 1);
        s.zoneFade = 0;
      }
      return;
    }
    s.mood = mood;                                      // the_lip's glare settling: the ramp itself was asked of render once
  }

  fixedUpdate(dt: number): void {
    const { s } = this;
    if (!s.started) return;
    const state = s.ctx.state.current;
    const playing = state === 'playing';
    s.playing = playing;
    s.build.tick();                                     // a build spread over ticks goes on in any state
    this.updateZone(false);
    if (s.running) {
      const ending = state === 'ending';
      if (playing) {
        s.stats.playSeconds += dt;
        s.director.tickTriggers(dt);                    // 1 triggers
      }
      if (playing || state === 'dead' || ending) { s.doors.tick(dt); s.tickClips(dt); }       // 2 doors
      if (playing) {
        s.interact.tick(dt);                            // 3 interact
        for (let i = 0; i < PUZZLES.length; i++) s.puzzles[PUZZLES[i] as PuzzleId].tick(dt);      // 4 puzzles
        s.kept.tick(dt);
        s.director.tick(dt);                            // 5 director
      }
      if (playing || ending) s.story.tick();            // 6 story
      if (playing) {
        s.checkpoints.tick();                           // 7 checkpoints
        s.rides.tick(dt);                               // 8 rides (and the seam)
      }
      if (playing || ending) s.ending.tick(dt);         // 9 ending
    }
    s.build.updateVisibility();                         // 10 visibility
  }

  update(_frameDt: number, alpha: number): void {
    const { s } = this;
    if (!s.started) return;
    s.build.update();
    s.rides.update(alpha);
    s.director.presentSighting();
  }

  // ---- WorldApi -------------------------------------------------------------------------------------
  puzzle(id: PuzzleId): Readonly<PuzzleView> { return this.s.puzzles[id].view; }
  encounter(id: EncounterId): Readonly<EncounterView> { return this.s.director.encounter(id); }
  doorState(id: MarkerId): DoorState { return this.s.doors.state(id); }
  flag(name: string): boolean { return this.s.flags.has(name); }
  spawnPickup(kind: PickupKind, x: number, y: number, z: number): void { this.s.interact.spawnPickup(kind, x, y, z); }
  buildSet(set: ResidentSet): Promise<void> { return this.s.build.buildSet(set); }
  stageZone(zone: ZoneId): Promise<void> { return this.s.build.stageZone(zone); }
  beginRun(fromSave: SaveData | null): Promise<void> { return this.s.checkpoints.beginRun(fromSave); }
  restoreCheckpoint(): Promise<void> { return this.s.checkpoints.restoreCheckpoint(); }
  warpToCheckpoint(id: CheckpointId): Promise<void> { return this.s.checkpoints.warpToCheckpoint(id); }
  captureSave(): WorldSave { return this.s.checkpoints.captureSave(); }
  applySave(data: WorldSave): void { this.s.checkpoints.applySave(data); }

  debugState(): DebugSnapshot {
    const { s } = this;
    const doors: Record<string, string> = {};
    for (const id of s.doors.ids()) doors[id] = s.doors.state(id) + (s.doors.locked(id) ? ' locked' : '');
    return {
      set: s.residentSet, staged: s.staged ?? '', builtZones: s.builtZones.slice(), zone: s.zone, cell: s.cell, mood: s.mood,
      checkpoint: s.checkpoint, objective: s.objective, doors, flags: Array.from(s.flags).sort(), vignettes: Array.from(s.vignettesSeen).sort(),
      markers: s.build.counts(), story: s.story.debug(), director: s.director.debug(), interact: s.interact.debug(), ride: s.rides.debug(),
      ending: s.ending.debug(), kept: s.kept.debug(), playSeconds: round4(s.stats.playSeconds), busy: s.build.busy,
    };
  }
}

export const createWorldSystem: CreateWorldSystem = (ctx) => new World(ctx);
