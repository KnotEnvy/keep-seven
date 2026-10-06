// An engine with no context, for the event-level unit tests: every handler runs, nothing sounds.
import type { EventName, GameEvents, ZoneId } from '../../src/core/contracts.ts';
import { createRng } from '../../src/core/rng.ts';
import { Engine } from '../../src/audio/engine.ts';

export interface Rig {
  engine: Engine;
  world: { tick: number; zone: ZoneId | ''; threat: number };
  says: { key: string; tick: number }[];
  music: { state: string; intensity: number; tick: number }[];
  emit<K extends EventName>(name: K, payload: GameEvents[K]): void;
  /** n ticks of the simulation */
  step(n: number): void;
  /** names started since the mark (all of them when left out) */
  names(sinceStarts?: number): string[];
}

export function rig(seed = 1, zone: ZoneId = 'the_lip'): Rig {
  const world = { tick: 0, zone: zone as ZoneId | '', threat: 0 };
  const says: Rig['says'] = [], music: Rig['music'] = [];
  const log: string[] = [];
  const engine = new Engine({
    tick: () => world.tick, zone: () => world.zone, threat: () => world.threat,
    say: (key) => { says.push({ key, tick: world.tick }); },
    music: (state, intensity) => { music.push({ state, intensity, tick: world.tick }); },
    rng: createRng(seed).fork('audio'),
  });
  const play = engine.play.bind(engine);
  engine.play = (name, p) => { const slot = play(name, p); if (slot >= 0) log.push(name); return slot; };
  engine.music.game = 'playing';
  return {
    engine, world, says, music,
    emit(name, payload) { const h = engine.handlers.get(name) as ((p: unknown) => void) | undefined; if (h) h(payload); },
    step(n) { for (let i = 0; i < n; i++) { world.tick++; engine.fixedUpdate(); } },
    names(since = 0) { return log.slice(since); },
  };
}

export const POS = { x: 0, y: 1, z: -10 };
export function fired(ammo: GameEvents['weapon/fired']['ammo'] = 'lead_round', chambersLeft = 5): GameEvents['weapon/fired'] {
  return { shotId: 1, ammo, chambersLeft, ox: 0, oy: 1.65, oz: 0, dx: 0, dy: 0, dz: -1, mx: 0, my: 1.5, mz: 0, endX: 0, endY: 1, endZ: -40 };
}
export function hit(outcome: GameEvents['combat/hit']['outcome'], surface: GameEvents['combat/hit']['surface'] = 'sand', entityKind: GameEvents['combat/hit']['entityKind'] = 'world'): GameEvents['combat/hit'] {
  return { ...POS, shotId: 1, order: 0, ammo: 'lead_round', outcome, entityId: '', entityKind, part: 'body', surface, nx: 0, ny: 1, nz: 0, damage: 0, ricochetX: 0, ricochetY: 0, ricochetZ: 0 };
}
export function cue(name: GameEvents['audio/cue']['cue'], gain = 1, pitch = 1): GameEvents['audio/cue'] {
  return { cue: name, x: 0, y: 0, z: 0, positional: false, gain, pitch };
}
