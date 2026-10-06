import { describe, expect, it } from 'vitest';
import type { SaveData } from '../../src/core/contracts.ts';
import { MemoryStorage } from '../../src/core/options.ts';
import { SAVE_KEY, SaveStoreImpl } from '../../src/core/save.ts';

function sample(): SaveData {
  return {
    version: 1, checkpoint: 'cp_yard_clear', tick: 1234,
    player: { health: 71, cylinder: ['lead', 'lead', 'empty', 'empty', 'empty', 'empty'], reserve: 9, lineRounds: 1, seventh: 'sealed' },
    world: {
      zone: 'plenty_street', objective: 'obj_tally',
      puzzles: {
        seven_jugs: { solved: true, step: 7, data: {} }, daylight: { solved: false, step: 0, data: {} },
        proving_line: { solved: false, step: 0, data: {} }, the_asking: { solved: false, step: 0, data: {} },
      },
      doors: { door_jug_gate: 'open', ia_hatch: 'ajar' }, encountersCleared: ['enc_street', 'enc_yard'], pickupsTaken: [], lockersUsed: [], brokenIds: [],
      onceFlags: ['nar_lip_1'], vignettesSeen: ['vig_kneeler'],
      stats: { playSeconds: 300, roundsFired: 40, roundsHit: 22, knotsBurst: 3, linesOfThree: 0, cleanSix: false, secrets: [], freed: 4, felled: 5, deaths: 1, tookStoneRound: false },
    },
    enemies: { bossPhase: 'idle', parleyHeard: false, deathsInBossPhase: 0, statics: [{ asset: 'bider_seated_static', x: 1, y: 0, z: 2, rotY: 90 }] },
  };
}

describe('SaveStore', () => {
  it('one slot: commit writes keepseven.save.v1 and becomes current; the data round-trips through JSON', () => {
    const storage = new MemoryStorage();
    const store = new SaveStoreImpl(storage);
    expect(store.current).toBeNull();
    expect(store.hasStoredSave()).toBe(false);
    const data = sample();
    store.commit(data);
    expect(store.current).toEqual(data);
    expect(store.current).not.toBe(data);                         // never aliases live system state
    data.player.health = 1;
    expect(store.current?.player.health).toBe(71);
    expect(JSON.parse(storage.getItem(SAVE_KEY) as string)).toEqual(sample());
    expect(new SaveStoreImpl(storage).readStored()).toEqual(sample());
    expect(new SaveStoreImpl(storage).current).toBeNull();        // `current` is this run's; a stored save is read on request
  });
  it('ignores a save of another version, and garbage', () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, JSON.stringify({ ...sample(), version: 2 }));
    expect(new SaveStoreImpl(storage).hasStoredSave()).toBe(false);
    storage.setItem(SAVE_KEY, '{oops');
    expect(new SaveStoreImpl(storage).readStored()).toBeNull();
    storage.setItem(SAVE_KEY, JSON.stringify({ version: 1 }));
    expect(new SaveStoreImpl(storage).readStored()).toBeNull();
  });
  it('a save this build cannot apply is no save: an unknown checkpoint, missing or mistyped parts', () => {
    const storage = new MemoryStorage();
    const known = (id: string): boolean => id === 'cp_yard_clear';
    const read = (data: unknown): SaveData | null => { storage.setItem(SAVE_KEY, JSON.stringify(data)); return new SaveStoreImpl(storage, known).readStored(); };
    expect(read(sample())).toEqual(sample());
    expect(read({ ...sample(), checkpoint: 'cp_does_not_exist' })).toBeNull();
    expect(read({ ...sample(), player: {}, world: {}, enemies: {} })).toBeNull();
    expect(read({ ...sample(), player: 'x', world: 'y', enemies: 'z' })).toBeNull();
    expect(read({ ...sample(), world: { ...sample().world, onceFlags: undefined } })).toBeNull();
    expect(read({ ...sample(), world: { ...sample().world, doors: [] } })).toBeNull();
    expect(read({ ...sample(), world: { ...sample().world, puzzles: null } })).toBeNull();
    expect(read({ ...sample(), world: { ...sample().world, brokenIds: 'none' } })).toBeNull();
    expect(read({ ...sample(), player: { ...sample().player, cylinder: 6 } })).toBeNull();
    expect(read({ ...sample(), enemies: { ...sample().enemies, statics: null } })).toBeNull();
    expect(new SaveStoreImpl(storage, known).hasStoredSave()).toBe(false);
  });
  it('polish round 5: the parts applySave indexes into are checked here, so a stale save is refused and never throws', () => {
    const storage = new MemoryStorage();
    const read = (data: unknown): SaveData | null => { storage.setItem(SAVE_KEY, JSON.stringify(data)); return new SaveStoreImpl(storage).readStored(); };
    const w = (patch: Record<string, unknown>): unknown => ({ ...sample(), world: { ...sample().world, ...patch } });
    const e = (patch: Record<string, unknown>): unknown => ({ ...sample(), enemies: { ...sample().enemies, ...patch } });
    const p = (patch: Record<string, unknown>): unknown => ({ ...sample(), player: { ...sample().player, ...patch } });
    expect(read(sample())).toEqual(sample());
    // the two cases the robustness critic stored (TypeError: reading 'slice' / reading 'asset')
    expect(read(w({ stats: {} }))).toBeNull();
    expect(read(e({ statics: [null] }))).toBeNull();
    expect(read(w({ stats: { ...sample().world.stats, secrets: undefined } }))).toBeNull();
    expect(read(w({ stats: { ...sample().world.stats, deaths: 'two' } }))).toBeNull();
    expect(read(w({ stats: { ...sample().world.stats, secrets: [3] } }))).toBeNull();
    expect(read(w({ zone: 7 }))).toBeNull();
    expect(read(w({ objective: null }))).toBeNull();
    expect(read(w({ onceFlags: [1, 2] }))).toBeNull();
    expect(read(w({ puzzles: { seven_jugs: true } }))).toBeNull();
    expect(read(w({ puzzles: { seven_jugs: { solved: true, step: 7 } } }))).toBeNull();
    expect(read(w({ doors: { door_jug_gate: 1 } }))).toBeNull();
    expect(read(e({ statics: [{ asset: 'bider_seated_static', x: 1, y: 0, z: 2 }] }))).toBeNull();
    expect(read(e({ statics: [{ asset: 5, x: 1, y: 0, z: 2, rotY: 0 }] }))).toBeNull();
    expect(read(e({ statics: ['bider'] }))).toBeNull();
    expect(read(e({ bossPhase: undefined }))).toBeNull();
    expect(read(p({ cylinder: [1, 2, 3, 4, 5, 6] }))).toBeNull();
    expect(read(p({ health: null }))).toBeNull();
    expect(read(e({ statics: [] }))).not.toBeNull();
  });
  it('clear removes the slot and current', () => {
    const storage = new MemoryStorage();
    const store = new SaveStoreImpl(storage);
    store.commit(sample());
    store.clear();
    expect(store.current).toBeNull();
    expect(storage.getItem(SAVE_KEY)).toBeNull();
  });
  it('test mode keeps saves in memory: two stores on separate memory do not see each other', () => {
    const a = new SaveStoreImpl(new MemoryStorage()), b = new SaveStoreImpl(new MemoryStorage());
    a.commit(sample());
    expect(a.hasStoredSave()).toBe(true);
    expect(b.hasStoredSave()).toBe(false);
  });
});
