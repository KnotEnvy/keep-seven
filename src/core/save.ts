// One save slot (ARCHITECTURE 10.1).
import type { SaveData, SaveStore } from './contracts.ts';
import type { KeyValueStorage } from './options.ts';

export const SAVE_KEY = 'keepseven.save.v1';
export const SAVE_VERSION = 1;

const WORLD_LISTS: readonly string[] = ['encountersCleared', 'pickupsTaken', 'lockersUsed', 'brokenIds', 'onceFlags', 'vignettesSeen'];
const STAT_NUMBERS: readonly string[] = ['playSeconds', 'roundsFired', 'roundsHit', 'knotsBurst', 'linesOfThree', 'freed', 'felled', 'deaths'];
function isFiniteNumber(v: unknown): v is number { return typeof v === 'number' && Number.isFinite(v); }
function isObject(v: unknown): v is Record<string, unknown> { return typeof v === 'object' && v !== null && !Array.isArray(v); }

export class SaveStoreImpl implements SaveStore {
  current: SaveData | null = null;
  /**
   * `isCheckpoint`: true for an id that is a checkpoint marker of this build's layout (the context passes it). A save a
   * build cannot apply is no save: without the check the title offered "Go on" and the click stranded the game on LOADING
   * (polish round 2, robustness).
   */
  constructor(private readonly storage: KeyValueStorage, private readonly isCheckpoint: ((id: string) => boolean) | null = null) {}

  hasStoredSave(): boolean { return this.readStored() !== null; }
  readStored(): SaveData | null {
    let raw: string | null = null;
    try { raw = this.storage.getItem(SAVE_KEY); } catch { return null; }
    if (!raw) return null;
    try {
      const data = JSON.parse(raw) as Partial<SaveData> | null;
      if (!data || data.version !== SAVE_VERSION) return null;
      if (typeof data.checkpoint !== 'string' || !isObject(data.player) || !isObject(data.world) || !isObject(data.enemies)) return null;
      if (this.isCheckpoint && !this.isCheckpoint(data.checkpoint)) return null;
      // the shape every system's applySave reads without looking (a save of an older build with the same version number)
      const w = data.world as unknown as Record<string, unknown>;
      if (!isObject(w.doors) || !isObject(w.puzzles) || !isObject(w.stats)) return null;
      for (const key of WORLD_LISTS) if (!Array.isArray(w[key])) return null;
      const p = data.player as unknown as Record<string, unknown>;
      if (!Array.isArray(p.cylinder) || typeof p.health !== 'number' || typeof p.reserve !== 'number') return null;
      const e = data.enemies as unknown as Record<string, unknown>;
      if (!Array.isArray(e.statics)) return null;
      // polish round 5 (robustness): the parts the systems index into. Before this a save with `stats` but no
      // `stats.secrets`, a puzzle that is not an object or a null in `statics` passed here, threw a TypeError inside
      // applySave and reached the console as an error with a stack: an expected path that read like a crash.
      if (typeof w.zone !== 'string' || typeof w.objective !== 'string') return null;
      const stats = w.stats;
      if (!Array.isArray(stats.secrets)) return null;
      for (const key of STAT_NUMBERS) if (!isFiniteNumber(stats[key])) return null;
      for (const key of WORLD_LISTS) for (const v of w[key] as unknown[]) if (typeof v !== 'string') return null;
      for (const v of stats.secrets as unknown[]) if (typeof v !== 'string') return null;
      for (const v of Object.values(w.puzzles)) if (!isObject(v) || !isObject(v.data)) return null;
      for (const v of Object.values(w.doors)) if (typeof v !== 'string') return null;
      for (const c of p.cylinder as unknown[]) if (typeof c !== 'string') return null;
      if (!isFiniteNumber(p.health) || !isFiniteNumber(p.reserve)) return null;
      if (typeof e.bossPhase !== 'string') return null;
      for (const st of e.statics as unknown[]) {
        if (!isObject(st) || typeof st.asset !== 'string') return null;
        if (!isFiniteNumber(st.x) || !isFiniteNumber(st.y) || !isFiniteNumber(st.z) || !isFiniteNumber(st.rotY)) return null;
      }
      return data as SaveData;
    } catch {
      return null;
    }
  }
  commit(data: SaveData): void {
    // round-trip through JSON so `current` never aliases live system state
    const text = JSON.stringify(data);
    this.current = JSON.parse(text) as SaveData;
    try { this.storage.setItem(SAVE_KEY, text); } catch { /* blocked storage: the run still has `current` */ }
  }
  clear(): void {
    this.current = null;
    try { this.storage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  }
}
